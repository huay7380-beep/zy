#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function nowCompactId(prefix) {
  return `${prefix}_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function resolveInputPath(root, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.resolve(root, maybePath);
}

function relativeToRoot(root, maybePath) {
  if (!maybePath) return null;
  const absolutePath = path.isAbsolute(maybePath) ? maybePath : path.resolve(root, maybePath);
  return path.relative(root, absolutePath).replace(/\\/g, '/');
}

function readJsonIfExists(file) {
  if (!file || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function defaultSessionPath(root) {
  return path.join(root, 'runtime', 'pt028-feedback-collection-sessions', 'latest.json');
}

function defaultDecisionPath(root, session) {
  return resolveInputPath(root, session?.linked_pack?.decision_template_path);
}

function check({ checkId, status, evidence = [], required = true }) {
  return {
    check_id: checkId,
    status: status ? 'passed' : 'failed',
    required,
    evidence
  };
}

function recordIndexFromPointer(pointer) {
  const match = String(pointer ?? '').match(/\[(\d+)\]$/);
  return match ? Number(match[1]) : null;
}

function hasUsefulReviewedAt(value) {
  return typeof value === 'string'
    && value.length > 0
    && !value.includes('REPLACE_WITH')
    && !value.includes('PLACEHOLDER')
    && !value.includes('TEMPLATE');
}

function recordEvidenceCoversTask(record, task) {
  const refs = new Set((record?.evidence_refs ?? []).filter(Boolean));
  if (task?.state_path && refs.has(task.state_path)) return true;
  return (task?.evidence_refs ?? []).some((ref) => refs.has(ref));
}

function taskChecks(task, record) {
  const checks = [
    check({
      checkId: 'record_present_at_pointer',
      status: Boolean(record),
      evidence: [`pointer=${task.decision_template_record_pointer}`]
    }),
    check({
      checkId: 'window_id_matches',
      status: record?.window_id === task.window_id,
      evidence: [`task=${task.window_id ?? 'missing'}`, `record=${record?.window_id ?? 'missing'}`]
    }),
    check({
      checkId: 'target_person_id_matches',
      status: record?.target_person_id === task.target_person_id,
      evidence: [`task=${task.target_person_id ?? 'missing'}`, `record=${record?.target_person_id ?? 'missing'}`]
    }),
    check({
      checkId: 'state_path_matches',
      status: !task.state_path || record?.state_path === task.state_path,
      evidence: [`task=${task.state_path ?? 'missing'}`, `record=${record?.state_path ?? 'missing'}`]
    }),
    check({
      checkId: 'operator_confirmed_real_window',
      status: record?.real_window_observed === true && record?.state_target_verified === true,
      evidence: [
        `real_window_observed=${record?.real_window_observed}`,
        `state_target_verified=${record?.state_target_verified}`
      ]
    }),
    check({
      checkId: 'operator_confirmed_prompt_only_no_send',
      status: record?.prompt_only_confirmed === true && record?.no_real_send_attempted === true,
      evidence: [
        `prompt_only_confirmed=${record?.prompt_only_confirmed}`,
        `no_real_send_attempted=${record?.no_real_send_attempted}`
      ]
    }),
    check({
      checkId: 'privacy_and_review_time_confirmed',
      status: record?.privacy_boundary_confirmed === true && hasUsefulReviewedAt(record?.reviewed_at),
      evidence: [
        `privacy_boundary_confirmed=${record?.privacy_boundary_confirmed}`,
        `reviewed_at=${record?.reviewed_at ?? 'missing'}`
      ]
    }),
    check({
      checkId: 'evidence_refs_cover_task',
      status: recordEvidenceCoversTask(record, task),
      evidence: [
        `record_evidence_count=${(record?.evidence_refs ?? []).length}`,
        `task_state_path=${task.state_path ?? 'missing'}`
      ]
    })
  ];
  const failures = checks.filter((item) => item.status !== 'passed').map((item) => item.check_id);
  return {
    task_id: task.task_id,
    record_pointer: task.decision_template_record_pointer,
    status: failures.length === 0
      ? 'covered_and_confirmed'
      : record
        ? 'covered_but_unconfirmed'
        : 'missing_or_mismatched',
    window_id: task.window_id ?? null,
    target_person_id: task.target_person_id ?? null,
    checks,
    failed_checks: failures
  };
}

function buildCoverage({ root, sessionPath, decisionPath, outputDir }) {
  const coverageId = nowCompactId('pt028_feedback_collection_coverage');
  const session = readJsonIfExists(sessionPath);
  const decision = readJsonIfExists(decisionPath);
  const tasks = session?.operator_collection_tasks ?? [];
  const records = decision?.feedback_batch?.window_feedback_records ?? [];
  const taskCoverage = tasks.map((task) => {
    const index = recordIndexFromPointer(task.decision_template_record_pointer);
    return taskChecks(task, Number.isInteger(index) ? records[index] : null);
  });
  const matchedTaskCount = taskCoverage.filter((item) => item.status !== 'missing_or_mismatched').length;
  const confirmedTaskCount = taskCoverage.filter((item) => item.status === 'covered_and_confirmed').length;
  const unmatchedTaskIds = taskCoverage
    .filter((item) => item.status === 'missing_or_mismatched')
    .map((item) => item.task_id);
  const unconfirmedTaskIds = taskCoverage
    .filter((item) => item.status !== 'covered_and_confirmed')
    .map((item) => item.task_id);
  const operator = decision?.operator_confirmation ?? {};
  const globalOperatorConfirmed = operator.approved_to_write_real_feedback_target === true
    && operator.confirm_real_windows_observed === true
    && operator.confirm_target_binding === true
    && operator.confirm_prompt_only === true
    && operator.confirm_no_real_send === true
    && operator.confirm_privacy_boundary === true
    && operator.confirm_human_special_review === true
    && hasUsefulReviewedAt(operator.reviewed_at)
    && typeof operator.reviewer_id === 'string'
    && !operator.reviewer_id.includes('REPLACE_WITH');
  const humanSpecialReviewConfirmed = decision?.feedback_batch?.human_special_review?.approved_for_final_special_acceptance === true
    && hasUsefulReviewedAt(decision?.feedback_batch?.human_special_review?.reviewed_at);

  const checks = [
    check({
      checkId: 'collection_session_ready',
      status: session?.schema_version === 'pt028_feedback_collection_session.v1'
        && session?.ready_for_operator_feedback_collection === true
        && (session?.required_failures ?? []).length === 0,
      evidence: [
        `session_path=${relativeToRoot(root, sessionPath)}`,
        `session_gate=${session?.gate_decision ?? 'missing'}`,
        `session_failures=${(session?.required_failures ?? []).join(',') || 'none'}`
      ]
    }),
    check({
      checkId: 'decision_schema_valid',
      status: decision?.schema_version === 'pt028_real_feedback_confirmation_decision.v1',
      evidence: [
        `decision_path=${relativeToRoot(root, decisionPath)}`,
        `schema=${decision?.schema_version ?? 'missing'}`
      ]
    }),
    check({
      checkId: 'all_session_tasks_have_records',
      status: tasks.length > 0 && matchedTaskCount === tasks.length,
      evidence: [
        `task_count=${tasks.length}`,
        `record_count=${records.length}`,
        `matched_task_count=${matchedTaskCount}`
      ]
    }),
    check({
      checkId: 'all_session_tasks_confirmed',
      status: tasks.length > 0 && confirmedTaskCount === tasks.length,
      evidence: [
        `confirmed_task_count=${confirmedTaskCount}`,
        `unconfirmed_task_ids=${unconfirmedTaskIds.join(',') || 'none'}`
      ]
    }),
    check({
      checkId: 'global_operator_confirmation_complete',
      status: globalOperatorConfirmed,
      evidence: [
        `approved_to_write_real_feedback_target=${operator.approved_to_write_real_feedback_target}`,
        `reviewer_id=${operator.reviewer_id ?? 'missing'}`,
        `reviewed_at=${operator.reviewed_at ?? 'missing'}`
      ]
    }),
    check({
      checkId: 'human_special_review_complete',
      status: humanSpecialReviewConfirmed,
      evidence: [
        `approved_for_final_special_acceptance=${decision?.feedback_batch?.human_special_review?.approved_for_final_special_acceptance}`,
        `reviewed_at=${decision?.feedback_batch?.human_special_review?.reviewed_at ?? 'missing'}`
      ]
    }),
    check({
      checkId: 'coverage_check_does_not_write_or_send',
      status: decision?.real_execution_allowed === false
        && decision?.real_send_attempted === false
        && decision?.writes_real_feedback_target === false
        && session?.real_execution_allowed === false
        && session?.real_send_attempted === false
        && session?.writes_real_feedback_target === false,
      evidence: [
        `decision_real_execution_allowed=${decision?.real_execution_allowed}`,
        `decision_real_send_attempted=${decision?.real_send_attempted}`,
        `decision_writes_real_feedback_target=${decision?.writes_real_feedback_target}`,
        `session_writes_real_feedback_target=${session?.writes_real_feedback_target}`
      ]
    })
  ];
  const requiredFailures = checks
    .filter((item) => item.required && item.status !== 'passed')
    .map((item) => item.check_id);

  return {
    schema_version: 'pt028_feedback_collection_coverage.v1',
    coverage_id: coverageId,
    created_at: new Date().toISOString(),
    gate_decision: requiredFailures.length === 0
      ? 'ready_for_confirmation_preflight'
      : 'collection_coverage_needs_attention',
    ready_for_confirmation_preflight: requiredFailures.length === 0,
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: false,
    source: {
      root,
      session_path: relativeToRoot(root, sessionPath),
      decision_path: relativeToRoot(root, decisionPath),
      output_dir: relativeToRoot(root, outputDir)
    },
    linked_session: {
      session_id: session?.session_id ?? null,
      gate_decision: session?.gate_decision ?? null,
      ready_for_operator_feedback_collection: session?.ready_for_operator_feedback_collection === true,
      task_count: tasks.length,
      distinct_target_count: session?.collection_scope?.distinct_target_count ?? 0
    },
    linked_decision: {
      decision_id: decision?.decision_id ?? null,
      schema_version: decision?.schema_version ?? null,
      record_count: records.length,
      approved_to_write_real_feedback_target: operator.approved_to_write_real_feedback_target === true
    },
    coverage_summary: {
      task_count: tasks.length,
      record_count: records.length,
      matched_task_count: matchedTaskCount,
      confirmed_task_count: confirmedTaskCount,
      unmatched_task_ids: unmatchedTaskIds,
      unconfirmed_task_ids: unconfirmedTaskIds
    },
    task_coverage: taskCoverage,
    checks,
    required_failures: requiredFailures,
    warning_failures: [],
    next_commands: requiredFailures.length === 0
      ? [
        `npm.cmd run pt028:feedback-confirm:preflight -- --decision=${relativeToRoot(root, decisionPath)}`,
        `npm.cmd run pt028:feedback-confirm -- --decision=${relativeToRoot(root, decisionPath)}`,
        'npm.cmd run pt028:acceptance-chain -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json'
      ]
      : [
        `Edit ${relativeToRoot(root, decisionPath) ?? '<decision.json>'} so every collection session task is covered and confirmed.`,
        `npm.cmd run pt028:feedback-collection:coverage -- --decision=${relativeToRoot(root, decisionPath) ?? '<decision.json>'}`,
        'Do not run pt028:feedback-confirm until this coverage report is ready_for_confirmation_preflight=true.'
      ],
    boundary_policy: {
      coverage_check_is_read_only: true,
      real_execution_allowed: false,
      real_send_attempted: false,
      writes_real_feedback_target: false,
      controlled_target_writer: 'pt028:feedback-confirm -- --decision=<decision.json>'
    }
  };
}

function renderMarkdown(coverage) {
  const taskRows = coverage.task_coverage.map((task) => (
    `| ${task.task_id} | ${task.record_pointer} | ${task.status} | ${task.failed_checks.join(',') || 'none'} |`
  )).join('\n');
  const checks = coverage.checks.map((item) => (
    `- ${item.status.toUpperCase()} ${item.check_id}: ${(item.evidence ?? []).join('; ')}`
  )).join('\n');
  const commands = coverage.next_commands.map((item) => `- ${item}`).join('\n');
  return `# PT-028 Feedback Collection Coverage

- coverage_id: ${coverage.coverage_id}
- gate_decision: ${coverage.gate_decision}
- ready_for_confirmation_preflight: ${coverage.ready_for_confirmation_preflight}
- real_execution_allowed: ${coverage.real_execution_allowed}
- real_send_attempted: ${coverage.real_send_attempted}
- writes_real_feedback_target: ${coverage.writes_real_feedback_target}

## Summary

- task_count: ${coverage.coverage_summary.task_count}
- record_count: ${coverage.coverage_summary.record_count}
- matched_task_count: ${coverage.coverage_summary.matched_task_count}
- confirmed_task_count: ${coverage.coverage_summary.confirmed_task_count}
- unconfirmed_task_ids: ${coverage.coverage_summary.unconfirmed_task_ids.join(', ') || 'none'}

## Task Coverage

| task | record pointer | status | failed checks |
| --- | --- | --- | --- |
${taskRows}

## Checks

${checks}

## Next Commands

${commands}

## Boundary

- This coverage check is read-only.
- It does not write runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json.
- It does not send messages.
`;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/validate-pt028-feedback-collection-coverage.mjs --decision=<decision.json> [--root=<dir>] [--session=<latest.json>] [--output-dir=<dir>] [--fail-on-required]',
    '',
    'Checks whether a human-filled confirmation decision covers every PT-028 feedback collection session task.',
    'This command is read-only and never writes the real feedback target.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve(argValue('root', process.cwd()));
  const sessionPath = resolveInputPath(root, argValue('session')) ?? defaultSessionPath(root);
  const session = readJsonIfExists(sessionPath);
  const decisionPath = resolveInputPath(root, argValue('decision')) ?? defaultDecisionPath(root, session);
  const provisionalId = nowCompactId('pt028_feedback_collection_coverage');
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : path.join(root, 'runtime', 'pt028-feedback-collection-coverages', provisionalId);
  const coverage = buildCoverage({ root, sessionPath, decisionPath, outputDir });
  const finalOutputDir = argValue('output-dir')
    ? outputDir
    : path.join(root, 'runtime', 'pt028-feedback-collection-coverages', coverage.coverage_id);
  ensureDir(finalOutputDir);
  const jsonPath = path.join(finalOutputDir, 'pt028-feedback-collection-coverage.json');
  const markdownPath = path.join(finalOutputDir, 'pt028-feedback-collection-coverage.md');
  const latestPath = path.join(root, 'runtime', 'pt028-feedback-collection-coverages', 'latest.json');
  const manifest = {
    ...coverage,
    source: {
      ...coverage.source,
      output_dir: relativeToRoot(root, finalOutputDir)
    },
    output_paths: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      latest_path: latestPath
    }
  };
  writeFileSync(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdown(manifest), 'utf8');
  ensureDir(path.dirname(latestPath));
  writeFileSync(latestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    command: 'validate-pt028-feedback-collection-coverage',
    coverage_id: manifest.coverage_id,
    gate_decision: manifest.gate_decision,
    ready_for_confirmation_preflight: manifest.ready_for_confirmation_preflight,
    matched_task_count: manifest.coverage_summary.matched_task_count,
    confirmed_task_count: manifest.coverage_summary.confirmed_task_count,
    unconfirmed_task_ids: manifest.coverage_summary.unconfirmed_task_ids,
    first_unconfirmed_failed_checks: manifest.task_coverage
      ?.find((item) => item.status !== 'covered_and_confirmed')
      ?.failed_checks ?? [],
    required_failures: manifest.required_failures,
    real_execution_allowed: manifest.real_execution_allowed,
    real_send_attempted: manifest.real_send_attempted,
    writes_real_feedback_target: manifest.writes_real_feedback_target,
    json_path: manifest.output_paths.json_path,
    markdown_path: manifest.output_paths.markdown_path,
    latest_path: manifest.output_paths.latest_path
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && manifest.required_failures.length > 0) {
    process.exitCode = 2;
  }
}
