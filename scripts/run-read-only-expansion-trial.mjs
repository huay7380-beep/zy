#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildDesktopContextBridge,
  buildReadOnlyExpansionGraphLoopVerification,
  writeDesktopContextBridge,
  writeReadOnlyExpansionGraphLoopVerification
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function argValues(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(2)
    .filter((arg) => arg.startsWith(prefix))
    .map((arg) => arg.slice(prefix.length));
}

function nowIso() {
  return new Date().toISOString();
}

function timestampId() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function relativeOrOriginal(root, filePath) {
  if (!filePath) return null;
  const relative = path.relative(root, filePath);
  return relative.startsWith('..') ? filePath : relative.replaceAll(path.sep, '/');
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

function defaultSourceDirs(root) {
  return [
    'runtime/desktop-inbox-real',
    'runtime/browser-intake-real',
    'runtime/external-chat-intake-real',
    'runtime/business-api-intake-real',
    'runtime/read-only-source-collections'
  ].map((item) => path.join(root, item));
}

function collectObservationPaths({ root, sourceDirs, explicitObservations }) {
  const discovered = sourceDirs.flatMap((dirPath) =>
    walkFiles(dirPath, (filePath) => path.basename(filePath) === 'intake-observation.real.json')
  );
  const candidatePaths = [...explicitObservations, ...discovered]
    .map((filePath) => path.resolve(root, filePath));
  const validPaths = candidatePaths.filter((filePath) => {
    try {
      const value = readJson(filePath);
      return Boolean(value.observation_id && value.source_adapter_id);
    } catch {
      return false;
    }
  });
  return [...new Set(validPaths)].sort((a, b) => {
    const timeDiff = statSync(a).mtimeMs - statSync(b).mtimeMs;
    return timeDiff || a.localeCompare(b);
  });
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

function renderMarkdown(report) {
  const checks = report.checks
    .map((check) => `- ${check.status.toUpperCase()} ${check.check_id}: ${check.evidence.join('; ')}`)
    .join('\n');
  const sources = report.source.source_dirs
    .map((item) => `- ${item}`)
    .join('\n');
  const observations = report.source.observation_paths
    .map((item) => `- ${item}`)
    .join('\n');
  return `# Read-Only Expansion Trial

- trial_id: ${report.trial_id}
- gate_decision: ${report.gate_decision}
- real_execution_allowed: ${report.real_execution_allowed}
- real_send_attempted: ${report.real_send_attempted}
- raw_observation_count: ${report.bridge.raw_observation_count}
- effective_observation_count: ${report.bridge.effective_observation_count}
- duplicate_suppressed_count: ${report.bridge.duplicate_suppressed_count}
- generated_pilot_import_ready_for_decision: ${report.generated_pilot_import.ready_for_decision_trial}
- generated_pilot_import_ready_for_closed_loop_mvp: ${report.generated_pilot_import.ready_for_closed_loop_mvp}
- graph_loop_gate_decision: ${report.graph_loop.gate_decision}

## Source Dirs

${sources || '- none'}

## Observation Paths

${observations || '- none'}

## Artifacts

- bridge_json: ${report.artifacts.bridge_json_path}
- generated_pilot_import: ${report.artifacts.generated_pilot_import_path}
- context_snapshot: ${report.artifacts.context_snapshot_path}
- graph_loop_verification: ${report.artifacts.graph_loop_verification_path}

## Checks

${checks}
`;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/run-read-only-expansion-trial.mjs',
    '',
    'Options:',
    '  --root=<dir>                  Workspace root. Defaults to current directory.',
    '  --source-dir=<dir>            Additional or replacement source directory. Repeatable.',
    '  --observation=<file>          Additional IntakeObservation real JSON. Repeatable.',
    '  --pilot-import=<file>         Closed-loop reference PilotImportBatch. Defaults to runtime/user-inputs/pilot-import.real.json.',
    '  --goal=<text>                 Goal for generated PilotImportBatch decision trial.',
    '  --output-dir=<dir>            Defaults to runtime/read-only-expansion-trials/<trial_id>.',
    '  --fail-on-required            Exit code 2 if required checks fail.',
    '',
    'This command scans real read-only observations, builds a generated PilotImportBatch, and verifies the graph-loop path without sending anything.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve(argValue('root', process.cwd()));
  const sourceDirArgs = argValues('source-dir');
  const sourceDirs = sourceDirArgs.length
    ? sourceDirArgs.map((item) => path.resolve(root, item))
    : defaultSourceDirs(root);
  const explicitObservations = argValues('observation');
  const observationPaths = collectObservationPaths({
    root,
    sourceDirs,
    explicitObservations
  });
  if (!observationPaths.length) {
    console.error(JSON.stringify({
      command: 'run-read-only-expansion-trial',
      gate_decision: 'read_only_expansion_trial_missing_observations',
      real_execution_allowed: false,
      real_send_attempted: false,
      source_dirs: sourceDirs.map((item) => relativeOrOriginal(root, item)),
      required_failures: ['real_read_only_observation_missing']
    }, null, 2));
    process.exit(1);
  }

  const goal = {
    initial_goal: argValue('goal', '基于当前真实只读样本验证统一 intake 与图谱闭环稳定性')
  };
  const bridge = buildDesktopContextBridge({
    observationPaths,
    goal
  });
  const trialId = `read_only_expansion_trial_${timestampId()}_${bridge.bridge_id}`;
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : path.join(root, 'runtime/read-only-expansion-trials', trialId);
  ensureDir(outputDir);
  const bridgeWritten = writeDesktopContextBridge({ bridge, outputDir });
  const pilotImportPath = argValue('pilot-import')
    ? path.resolve(root, argValue('pilot-import'))
    : path.join(root, 'runtime/user-inputs/pilot-import.real.json');
  const graphLoopReport = buildReadOnlyExpansionGraphLoopVerification({
    root,
    pilotImportPath,
    observationPaths
  });
  const graphLoopWritten = writeReadOnlyExpansionGraphLoopVerification({
    report: graphLoopReport,
    outputDir
  });
  const generatedReadyForDecision = bridge.pilot_import_batch.records.length >= 1
    && bridge.checks.every((check) => check.status === 'pass');
  const generatedReadyForClosedLoop = bridge.pilot_import_batch.feedback_records.length > 0;
  const checks = [
    makeCheck('real_observations_found', observationPaths.length > 0, [`observations=${observationPaths.length}`]),
    makeCheck('bridge_generated_pilot_import', generatedReadyForDecision, [
      `records=${bridge.pilot_import_batch.records.length}`,
      `bridge_gate=${bridge.gate_decision}`
    ]),
    makeCheck('real_send_blocked', bridge.real_execution_allowed === false && bridge.real_send_attempted === false, [
      `bridge_real_execution_allowed=${bridge.real_execution_allowed}`,
      `bridge_real_send_attempted=${bridge.real_send_attempted}`
    ]),
    makeCheck('graph_loop_reference_verified', graphLoopReport.required_failures.length === 0, [
      `graph_loop_gate=${graphLoopReport.gate_decision}`,
      `required_failures=${graphLoopReport.required_failures.join(',') || 'none'}`
    ]),
    makeCheck('generated_batch_needs_feedback_before_closed_loop', generatedReadyForClosedLoop === false, [
      `feedback_records=${bridge.pilot_import_batch.feedback_records.length}`,
      'expected=false until real reviewed feedback is appended'
    ], 'warning')
  ];
  const requiredFailures = checks
    .filter((check) => check.severity === 'required' && !check.passed)
    .map((check) => check.check_id);
  const report = {
    schema_version: 'read_only_expansion_trial.v1',
    trial_id: trialId,
    created_at: nowIso(),
    gate_decision: requiredFailures.length
      ? 'read_only_expansion_trial_needs_attention'
      : 'read_only_expansion_trial_ready_for_feedback_collection',
    real_execution_allowed: false,
    real_send_attempted: false,
    source: {
      root,
      source_dirs: sourceDirs.map((item) => relativeOrOriginal(root, item)),
      observation_paths: observationPaths.map((item) => relativeOrOriginal(root, item)),
      pilot_import_path: relativeOrOriginal(root, pilotImportPath)
    },
    bridge: {
      bridge_id: bridge.bridge_id,
      gate_decision: bridge.gate_decision,
      raw_observation_count: bridge.raw_observation_count,
      effective_observation_count: bridge.effective_observation_count,
      duplicate_suppressed_count: bridge.duplicate_suppressed_count,
      duplicate_observation_groups: bridge.duplicate_observation_groups,
      decision_id: bridge.decision_id,
      expert_count: bridge.expert_matrix_analysis.parallel_analysis.completed_expert_count,
      message_draft_length: bridge.message_draft.draft.length
    },
    generated_pilot_import: {
      import_id: bridge.pilot_import_batch.import_id,
      records: bridge.pilot_import_batch.records.length,
      feedback_records: bridge.pilot_import_batch.feedback_records.length,
      ready_for_decision_trial: generatedReadyForDecision,
      ready_for_closed_loop_mvp: generatedReadyForClosedLoop
    },
    graph_loop: {
      verification_id: graphLoopReport.verification_id,
      gate_decision: graphLoopReport.gate_decision,
      required_failures: graphLoopReport.required_failures,
      closed_loop_complete: graphLoopReport.graph_closed_loop?.quality?.closed_loop_complete === true,
      completed_expert_count: graphLoopReport.graph_closed_loop?.path?.expert_weight_judgment?.completed_expert_count ?? 0,
      writeback_complete: graphLoopReport.graph_closed_loop?.path?.feedback_writeback?.writeback_complete === true
    },
    artifacts: {
      output_dir: outputDir,
      bridge_json_path: bridgeWritten.json_path,
      bridge_markdown_path: bridgeWritten.markdown_path,
      generated_pilot_import_path: bridgeWritten.pilot_import_path,
      context_snapshot_path: bridgeWritten.context_snapshot_path,
      graph_loop_verification_path: graphLoopWritten.json_path,
      graph_loop_verification_markdown_path: graphLoopWritten.markdown_path
    },
    checks,
    required_failures: requiredFailures,
    next_actions: requiredFailures.length
      ? [
        'Fix required failures before using this trial as expansion evidence.',
        'Keep collecting only read-only observations until real test-send gates are explicitly opened.'
      ]
      : [
        'Append real reviewed feedback with npm run pilot:feedback:append before treating the generated batch as closed-loop ready.',
        'Add external chat export or business API real snapshots, then rerun npm run intake:read-only:trial.'
      ]
  };
  const jsonPath = path.join(outputDir, 'read-only-expansion-trial.json');
  const markdownPath = path.join(outputDir, 'read-only-expansion-trial.md');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdown(report), 'utf8');

  console.log(JSON.stringify({
    command: 'run-read-only-expansion-trial',
    trial_id: report.trial_id,
    gate_decision: report.gate_decision,
    real_execution_allowed: report.real_execution_allowed,
    real_send_attempted: report.real_send_attempted,
    raw_observation_count: report.bridge.raw_observation_count,
    effective_observation_count: report.bridge.effective_observation_count,
    duplicate_suppressed_count: report.bridge.duplicate_suppressed_count,
    generated_pilot_import_ready_for_decision: report.generated_pilot_import.ready_for_decision_trial,
    generated_pilot_import_ready_for_closed_loop_mvp: report.generated_pilot_import.ready_for_closed_loop_mvp,
    graph_loop_gate_decision: report.graph_loop.gate_decision,
    required_failures: report.required_failures,
    json_path: jsonPath,
    markdown_path: markdownPath,
    generated_pilot_import_path: bridgeWritten.pilot_import_path,
    graph_loop_verification_path: graphLoopWritten.json_path
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && requiredFailures.length > 0) {
    process.exitCode = 2;
  }
}
