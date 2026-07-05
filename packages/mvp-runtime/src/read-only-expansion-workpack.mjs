import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPilotFeedbackAppend,
  renderPilotFeedbackAppendMarkdown
} from './pilot-feedback-record.mjs';
import { buildReadOnlyExpansionTargets } from './read-only-expansion-targets.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function projectRoot() {
  return path.resolve(here, '../../..');
}

function nowIso() {
  return new Date().toISOString();
}

function timestampId(date = new Date()) {
  return date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readJsonIfExists(filePath) {
  return filePath && existsSync(filePath) ? readJson(filePath) : null;
}

function walkFiles(dirPath, matcher, results = []) {
  if (!existsSync(dirPath)) return results;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, matcher, results);
    } else if (!matcher || matcher(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function newestFile(files) {
  return files
    .filter((filePath) => existsSync(filePath))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .at(0) ?? null;
}

function latestNestedFile(root, fileName) {
  return newestFile(walkFiles(root, (filePath) => path.basename(filePath) === fileName));
}

function relativeOrNull(root, filePath) {
  if (!filePath) return null;
  const relative = path.relative(root, filePath);
  return relative.startsWith('..') ? filePath : relative.replaceAll(path.sep, '/');
}

function resolveMaybeRelative(root, filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
}

function summarizeFeedbackReadiness(report) {
  if (!report) {
    return {
      before_ready_for_closed_loop_mvp: false,
      template_feedback_id: null,
      required_failures: ['feedback_template_missing']
    };
  }
  return {
    before_gate_decision: report.before_readiness.gate_decision,
    before_ready_for_decision_trial: report.before_readiness.ready_for_decision_trial,
    before_ready_for_closed_loop_mvp: report.before_readiness.ready_for_closed_loop_mvp,
    template_feedback_id: report.template.feedback_id,
    template_only: report.template.metadata?.template_only === true,
    required_failures: report.required_failures
  };
}

function makeCheck(checkId, passed, evidence, severity = 'required') {
  return {
    check_id: checkId,
    severity,
    status: passed ? 'pass' : 'fail',
    passed: Boolean(passed),
    evidence
  };
}

function firstCommand(target) {
  return target?.commands?.[0] ?? null;
}

function nextCommandsForTarget(target) {
  if (!Array.isArray(target?.commands)) return [];
  return target.target_id === 'read_only_source_collection_manifest_batch'
    ? target.commands.slice(0, 3)
    : target.commands.slice(0, 1);
}

export function buildReadOnlyExpansionWorkpack({
  root = projectRoot(),
  trialPath = undefined,
  targetsPath = undefined,
  pilotImportPath = null,
  createdAt = nowIso()
} = {}) {
  const resolvedTrialPath = trialPath
    ?? latestNestedFile(path.join(root, 'runtime/read-only-expansion-trials'), 'read-only-expansion-trial.json');
  const resolvedTargetsPath = targetsPath
    ?? latestNestedFile(path.join(root, 'runtime/read-only-expansion-targets'), 'read-only-expansion-targets.json');
  const absoluteTrialPath = resolveMaybeRelative(root, resolvedTrialPath);
  const trial = readJsonIfExists(absoluteTrialPath);
  const absoluteTargetsPath = resolveMaybeRelative(root, resolvedTargetsPath);
  const targetPlan = readJsonIfExists(absoluteTargetsPath)
    ?? buildReadOnlyExpansionTargets({ root });
  const generatedPilotImportPath = resolveMaybeRelative(
    root,
    pilotImportPath ?? trial?.artifacts?.generated_pilot_import_path
  );
  const generatedPilotImport = readJsonIfExists(generatedPilotImportPath);
  const graphLoopPath = resolveMaybeRelative(root, trial?.artifacts?.graph_loop_verification_path);
  const graphLoop = readJsonIfExists(graphLoopPath);
  const feedbackReport = generatedPilotImportPath && existsSync(generatedPilotImportPath)
    ? buildPilotFeedbackAppend({
      root,
      pilotImportPath: relativeOrNull(root, generatedPilotImportPath),
      createdAt
    })
    : null;

  const graphLoopClosed = graphLoop?.graph_closed_loop?.quality?.closed_loop_complete === true
    || trial?.graph_loop?.closed_loop_complete === true;
  const graphLoopRequiredFailures = graphLoop?.required_failures
    ?? trial?.graph_loop?.required_failures
    ?? ['graph_loop_verification_missing'];
  const realSendBlocked = trial?.real_execution_allowed === false
    && trial?.real_send_attempted === false
    && targetPlan.real_execution_allowed === false
    && targetPlan.real_send_attempted === false
    && (feedbackReport?.real_execution_allowed ?? false) === false
    && (feedbackReport?.real_send_attempted ?? false) === false
    && (graphLoop?.real_execution_allowed ?? false) === false
    && (graphLoop?.real_send_attempted ?? false) === false;

  const checks = [
    makeCheck('read_only_trial_present', Boolean(trial), [
      `trial_path=${relativeOrNull(root, absoluteTrialPath) ?? 'missing'}`
    ]),
    makeCheck('generated_pilot_import_present', Boolean(generatedPilotImport), [
      `pilot_import_path=${relativeOrNull(root, generatedPilotImportPath) ?? 'missing'}`
    ]),
    makeCheck('generated_batch_ready_for_decision', trial?.generated_pilot_import?.ready_for_decision_trial === true, [
      `ready_for_decision=${trial?.generated_pilot_import?.ready_for_decision_trial === true}`,
      `records=${trial?.generated_pilot_import?.records ?? 0}`
    ]),
    makeCheck('graph_loop_verified', graphLoopRequiredFailures.length === 0 && graphLoopClosed, [
      `graph_loop_gate=${graphLoop?.gate_decision ?? trial?.graph_loop?.gate_decision ?? 'missing'}`,
      `closed_loop_complete=${graphLoopClosed}`,
      `required_failures=${graphLoopRequiredFailures.join(',') || 'none'}`
    ]),
    makeCheck('feedback_template_ready', feedbackReport?.template?.metadata?.template_only === true, [
      `template_feedback_id=${feedbackReport?.template?.feedback_id ?? 'missing'}`,
      'template_only=true'
    ]),
    makeCheck('target_plan_ready', targetPlan.required_failures.length === 0, [
      `target_plan_id=${targetPlan.target_plan_id}`,
      `target_count=${targetPlan.target_recommendations.length}`,
      `required_failures=${targetPlan.required_failures.join(',') || 'none'}`
    ]),
    makeCheck('real_send_blocked', realSendBlocked, [
      `trial_real_send_attempted=${trial?.real_send_attempted}`,
      `target_real_send_attempted=${targetPlan.real_send_attempted}`,
      `feedback_real_send_attempted=${feedbackReport?.real_send_attempted ?? false}`
    ]),
    makeCheck('generated_batch_waits_for_feedback', trial?.generated_pilot_import?.ready_for_closed_loop_mvp === false, [
      `ready_for_closed_loop_mvp=${trial?.generated_pilot_import?.ready_for_closed_loop_mvp === true}`,
      'expected=false until reviewed feedback is appended'
    ], 'warning')
  ];
  const requiredFailures = checks
    .filter((check) => check.severity === 'required' && !check.passed)
    .map((check) => check.check_id);
  const warningFailures = checks
    .filter((check) => check.severity === 'warning' && !check.passed)
    .map((check) => check.check_id);

  const topTargets = targetPlan.target_recommendations.slice(0, 5).map((target) => ({
    rank: target.rank,
    target_id: target.target_id,
    category: target.category,
    platform: target.platform,
    weighted_score: target.weighted_score,
    first_command: firstCommand(target),
    acceptance_gates: target.acceptance_gates,
    blocks_closure_until_done: target.blocks_closure_until_done
  }));
  const topTargetNextCommands = targetPlan.target_recommendations
    .slice(0, 3)
    .flatMap((target) => nextCommandsForTarget(target));

  return {
    schema_version: 'read_only_expansion_workpack.v1',
    workpack_id: `read_only_expansion_workpack_${timestampId()}`,
    created_at: createdAt,
    gate_decision: requiredFailures.length
      ? 'read_only_expansion_workpack_needs_attention'
      : 'read_only_expansion_workpack_ready_for_operator_review',
    real_execution_allowed: false,
    real_send_attempted: false,
    source: {
      root,
      trial_path: relativeOrNull(root, absoluteTrialPath),
      target_plan_path: absoluteTargetsPath && existsSync(absoluteTargetsPath)
        ? relativeOrNull(root, absoluteTargetsPath)
        : null,
      generated_pilot_import_path: relativeOrNull(root, generatedPilotImportPath),
      graph_loop_verification_path: relativeOrNull(root, graphLoopPath)
    },
    sample_summary: {
      raw_observation_count: trial?.bridge?.raw_observation_count ?? 0,
      effective_observation_count: trial?.bridge?.effective_observation_count ?? 0,
      duplicate_suppressed_count: trial?.bridge?.duplicate_suppressed_count ?? 0,
      duplicate_observation_groups: trial?.bridge?.duplicate_observation_groups ?? [],
      observation_paths: trial?.source?.observation_paths ?? [],
      generated_import_id: trial?.generated_pilot_import?.import_id ?? generatedPilotImport?.import_id ?? null,
      generated_records: trial?.generated_pilot_import?.records ?? generatedPilotImport?.records?.length ?? 0,
      generated_feedback_records: trial?.generated_pilot_import?.feedback_records ?? generatedPilotImport?.feedback_records?.length ?? 0,
      ready_for_decision_trial: trial?.generated_pilot_import?.ready_for_decision_trial === true,
      ready_for_closed_loop_mvp: trial?.generated_pilot_import?.ready_for_closed_loop_mvp === true
    },
    graph_loop_summary: {
      gate_decision: graphLoop?.gate_decision ?? trial?.graph_loop?.gate_decision ?? 'missing',
      required_failures: graphLoopRequiredFailures,
      closed_loop_complete: graphLoopClosed,
      expert_weight_judgment: graphLoop?.graph_closed_loop?.path?.expert_weight_judgment ?? null,
      draft_output: graphLoop?.graph_closed_loop?.path?.draft_output ?? null,
      feedback_writeback: graphLoop?.graph_closed_loop?.path?.feedback_writeback ?? null,
      trial_completed_expert_count: trial?.graph_loop?.completed_expert_count ?? 0,
      trial_writeback_complete: trial?.graph_loop?.writeback_complete === true
    },
    feedback_collection: {
      report_id: feedbackReport?.report_id ?? null,
      gate_decision: feedbackReport?.gate_decision ?? 'feedback_template_missing',
      summary: summarizeFeedbackReadiness(feedbackReport),
      required_fields: [
        'feedback_id',
        'executed',
        'reply_received',
        'goal_progress',
        'relationship_change',
        'user_rating',
        'notes'
      ],
      append_commands: generatedPilotImportPath
        ? [
          `npm.cmd run pilot:feedback:append -- --pilot-import=${relativeOrNull(root, generatedPilotImportPath)}`,
          `npm.cmd run pilot:feedback:append -- --pilot-import=${relativeOrNull(root, generatedPilotImportPath)} --feedback=<reviewed-feedback.json> --output-dir=<feedback-output-dir>`,
          'npm.cmd run pilot:validate -- --input=<feedback-output-dir>/pilot-import.with-feedback.json'
        ]
        : []
    },
    next_sampling_targets: {
      target_plan_id: targetPlan.target_plan_id,
      gate_decision: targetPlan.gate_decision,
      weighting_policy: targetPlan.weighting_policy,
      target_count: targetPlan.target_recommendations.length,
      top_targets: topTargets,
      blocking_target_ids: targetPlan.blocking_target_ids,
      required_failures: targetPlan.required_failures,
      warning_failures: targetPlan.warning_failures
    },
    operator_checklist: [
      'Open read-only-expansion-workpack.md first.',
      'Review sample counts and duplicate observation groups before claiming sample growth.',
      'Use feedback-record.template.json only as a worksheet; do not append it unchanged.',
      'Append reviewed feedback, then run pilot:validate on pilot-import.with-feedback.json.',
      'Collect external chat export and business API snapshot samples through intake commands only.',
      'Keep real_execution_allowed=false and real_send_attempted=false until a separate controlled-send gate is approved.'
    ],
    checks,
    required_failures: requiredFailures,
    warning_failures: warningFailures,
    next_actions: requiredFailures.length
      ? [
        'Run npm.cmd run intake:read-only:trial to regenerate trial evidence.',
        'Run npm.cmd run intake:read-only:targets to regenerate target recommendations.',
        'Keep all paths read-only until required_failures is empty.'
      ]
      : [
        ...topTargetNextCommands,
        ...(
          generatedPilotImportPath
            ? [`npm.cmd run pilot:feedback:append -- --pilot-import=${relativeOrNull(root, generatedPilotImportPath)}`]
            : []
        )
      ],
    stop_or_adjust_when: [
      'Any step requires sending a real message.',
      'A new source skips SourceAdapterCapability, IntakeObservation or source_adapter_conformance.v1.',
      'A generated PilotImportBatch is marked ready_for_closed_loop_mvp without reviewed feedback.',
      'Duplicate observations are counted as new effective samples.'
    ],
    embedded: {
      target_plan: targetPlan,
      feedback_append_template_report: feedbackReport
    }
  };
}

export function renderReadOnlyExpansionWorkpackMarkdown(workpack) {
  const targets = workpack.next_sampling_targets.top_targets
    .map((target) => `| ${target.rank} | ${target.target_id} | ${target.platform} | ${target.weighted_score} | ${target.first_command ?? 'none'} |`)
    .join('\n');
  const checks = workpack.checks
    .map((check) => `- ${check.status.toUpperCase()} ${check.check_id}: ${check.evidence.join('; ')}`)
    .join('\n');
  const checklist = workpack.operator_checklist.map((item) => `- ${item}`).join('\n');
  const actions = workpack.next_actions.map((item) => `- ${item}`).join('\n');
  const weights = workpack.graph_loop_summary.expert_weight_judgment?.weights
    ? Object.entries(workpack.graph_loop_summary.expert_weight_judgment.weights)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n')
    : '- none';

  return `# Read-Only Expansion Workpack

- workpack_id: ${workpack.workpack_id}
- gate_decision: ${workpack.gate_decision}
- real_execution_allowed: ${workpack.real_execution_allowed}
- real_send_attempted: ${workpack.real_send_attempted}
- trial_path: ${workpack.source.trial_path ?? 'missing'}
- generated_pilot_import_path: ${workpack.source.generated_pilot_import_path ?? 'missing'}

## Sample Summary

- raw_observation_count: ${workpack.sample_summary.raw_observation_count}
- effective_observation_count: ${workpack.sample_summary.effective_observation_count}
- duplicate_suppressed_count: ${workpack.sample_summary.duplicate_suppressed_count}
- generated_records: ${workpack.sample_summary.generated_records}
- generated_feedback_records: ${workpack.sample_summary.generated_feedback_records}
- ready_for_decision_trial: ${workpack.sample_summary.ready_for_decision_trial}
- ready_for_closed_loop_mvp: ${workpack.sample_summary.ready_for_closed_loop_mvp}

## Graph Loop

- gate_decision: ${workpack.graph_loop_summary.gate_decision}
- closed_loop_complete: ${workpack.graph_loop_summary.closed_loop_complete}
- trial_completed_expert_count: ${workpack.graph_loop_summary.trial_completed_expert_count}
- trial_writeback_complete: ${workpack.graph_loop_summary.trial_writeback_complete}

### Expert Weights

${weights}

## Feedback Collection

- gate_decision: ${workpack.feedback_collection.gate_decision}
- template_feedback_id: ${workpack.feedback_collection.summary.template_feedback_id ?? 'missing'}
- template_only: ${workpack.feedback_collection.summary.template_only ?? false}

Required feedback fields:
${workpack.feedback_collection.required_fields.map((item) => `- ${item}`).join('\n')}

## Next Sampling Targets

| rank | target | platform | score | first command |
| --- | --- | --- | --- | --- |
${targets || '| none | none | none | 0 | none |'}

## Operator Checklist

${checklist}

## Checks

${checks}

## Next Actions

${actions}
`;
}

export function writeReadOnlyExpansionWorkpack({
  workpack,
  outputDir = path.join(projectRoot(), 'runtime/read-only-expansion-workpacks', workpack.workpack_id)
} = {}) {
  ensureDir(outputDir);
  const targetsDir = path.join(outputDir, 'targets');
  const feedbackDir = path.join(outputDir, 'feedback');
  ensureDir(targetsDir);
  ensureDir(feedbackDir);

  const targetPlanPath = path.join(targetsDir, 'read-only-expansion-targets.json');
  const feedbackReportPath = path.join(feedbackDir, 'pilot-feedback-append.json');
  const feedbackMarkdownPath = path.join(feedbackDir, 'pilot-feedback-append.md');
  const feedbackTemplatePath = path.join(feedbackDir, 'feedback-record.template.json');

  writeFileSync(targetPlanPath, `${JSON.stringify(workpack.embedded.target_plan, null, 2)}\n`, 'utf8');
  if (workpack.embedded.feedback_append_template_report) {
    writeFileSync(feedbackReportPath, `${JSON.stringify({
      ...workpack.embedded.feedback_append_template_report,
      updated_pilot_import: null
    }, null, 2)}\n`, 'utf8');
    writeFileSync(feedbackMarkdownPath, renderPilotFeedbackAppendMarkdown(workpack.embedded.feedback_append_template_report), 'utf8');
    writeFileSync(feedbackTemplatePath, `${JSON.stringify(workpack.embedded.feedback_append_template_report.template, null, 2)}\n`, 'utf8');
  }

  const jsonPath = path.join(outputDir, 'read-only-expansion-workpack.json');
  const markdownPath = path.join(outputDir, 'read-only-expansion-workpack.md');
  const manifest = {
    ...workpack,
    artifacts: {
      output_dir: outputDir,
      workpack_json_path: jsonPath,
      workpack_markdown_path: markdownPath,
      target_plan_path: targetPlanPath,
      feedback_report_path: workpack.embedded.feedback_append_template_report ? feedbackReportPath : null,
      feedback_markdown_path: workpack.embedded.feedback_append_template_report ? feedbackMarkdownPath : null,
      feedback_template_path: workpack.embedded.feedback_append_template_report ? feedbackTemplatePath : null
    },
    embedded: {
      target_plan_id: workpack.embedded.target_plan.target_plan_id,
      feedback_append_report_id: workpack.embedded.feedback_append_template_report?.report_id ?? null
    }
  };
  writeFileSync(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderReadOnlyExpansionWorkpackMarkdown(manifest), 'utf8');
  return manifest.artifacts;
}
