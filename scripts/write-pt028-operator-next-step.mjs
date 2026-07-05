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

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function latestPath(root, runtimeDir) {
  return path.join(root, 'runtime', runtimeDir, 'latest.json');
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

function pathExists(root, maybePath) {
  const resolved = resolveInputPath(root, maybePath);
  return Boolean(resolved && existsSync(resolved));
}

function normalizeQueue({ refreshChain, operatorHandoff, acceptanceStatus }) {
  const fullQueue = operatorHandoff?.operator_action_queue
    ?? acceptanceStatus?.operator_action_queue
    ?? null;
  if (fullQueue?.schema_version === 'pt028_operator_action_queue.v1') {
    return {
      schema_version: 'pt028_operator_next_step_queue.v1',
      source_schema_version: fullQueue.schema_version,
      source: fullQueue.source ?? 'pt028_operator_action_queue',
      queue_status: fullQueue.queue_status ?? 'operator_action_required',
      current_action_id: fullQueue.current_action_id ?? null,
      next_blocking_action_id: fullQueue.next_blocking_action_id ?? null,
      pending_action_count: fullQueue.pending_action_count ?? (fullQueue.actions ?? []).filter((item) => item.status !== 'completed').length,
      actions: (fullQueue.actions ?? []).map((item) => ({
        action_id: item.action_id,
        label: item.label ?? item.action_id,
        status: item.status,
        open_path: item.open_path ?? null,
        fallback_open_path: item.fallback_open_path ?? null,
        target_path: item.target_path ?? null,
        command: item.command ?? null,
        writes_target_file: item.writes_target_file === true,
        writes_real_feedback_target: item.writes_real_feedback_target === true,
        real_send_allowed: item.real_send_allowed === true,
        prompt_only_required: item.prompt_only_required !== false
      })),
      boundary_policy: {
        queue_is_read_only: true,
        writes_real_user_input_files: fullQueue.boundary_policy?.writes_real_user_input_files === true,
        writes_real_feedback_target: fullQueue.boundary_policy?.writes_real_feedback_target === true,
        real_execution_allowed: fullQueue.boundary_policy?.real_execution_allowed === true,
        real_send_attempted: fullQueue.boundary_policy?.real_send_attempted === true,
        prompt_only_required: fullQueue.boundary_policy?.prompt_only_required !== false
      }
    };
  }

  const summary = refreshChain?.operator_action_queue_summary ?? null;
  return {
    schema_version: 'pt028_operator_next_step_queue.v1',
    source_schema_version: summary?.schema_version ?? null,
    source: summary?.source ?? null,
    queue_status: summary?.queue_status ?? (refreshChain?.pt028_fully_accepted_for_production ? 'final_acceptance_complete' : 'operator_action_required'),
    current_action_id: summary?.current_action_id ?? null,
    next_blocking_action_id: summary?.next_blocking_action_id ?? null,
    pending_action_count: summary?.pending_action_count ?? 0,
    actions: (summary?.actions ?? []).map((item) => ({
      action_id: item.action_id,
      label: item.action_id,
      status: item.status,
      open_path: null,
      fallback_open_path: null,
      target_path: item.target_path ?? null,
      command: item.command ?? null,
      writes_target_file: item.writes_target_file === true,
      writes_real_feedback_target: item.writes_real_feedback_target === true,
      real_send_allowed: item.real_send_allowed === true,
      prompt_only_required: true
    })),
    boundary_policy: {
      queue_is_read_only: true,
      writes_real_user_input_files: summary?.boundary_policy?.writes_real_user_input_files === true,
      writes_real_feedback_target: summary?.boundary_policy?.writes_real_feedback_target === true,
      real_execution_allowed: summary?.boundary_policy?.real_execution_allowed === true,
      real_send_attempted: summary?.boundary_policy?.real_send_attempted === true,
      prompt_only_required: summary?.boundary_policy?.prompt_only_required !== false
    }
  };
}

function currentActionFromQueue(queue) {
  return queue.actions.find((item) => item.action_id === queue.current_action_id)
    ?? queue.actions.find((item) => item.status !== 'completed')
    ?? null;
}

function instructionForAction(actionId) {
  const map = {
    open_review_sheet_html: 'Open the generated human review worksheet and inspect evidence, window rows, prompt-only status and no-send boundary before preparing the real review sheet.',
    prepare_filled_review_sheet: 'A human operator must prepare the filled review sheet target from the generated template. This next-step report does not write that target file.',
    run_human_review_check_only: 'Run the check-only command against the filled review sheet. Repeat review edits until required failures are empty.',
    run_human_review_controlled_preflight: 'Run controlled preflight only after check-only passes. This still does not write the real feedback target.',
    run_feedback_finalize: 'Run the controlled finalization command only after preflight produces a decision output. This is the controlled path for writing real feedback, while real sending remains blocked.',
    run_acceptance_chain: 'Run the feedback-bound acceptance chain after the real feedback target exists, then review readiness, calibration and final human special acceptance evidence together.'
  };
  return map[actionId] ?? 'Follow the referenced operator action and keep prompt-only/no-send boundaries intact.';
}

function buildTargetStatus({ root, queue, operatorHandoff, acceptanceStatus }) {
  const humanTargets = operatorHandoff?.human_input_targets
    ?? acceptanceStatus?.human_handoff?.human_input_targets
    ?? {};
  const reviewTarget = humanTargets.filled_review_sheet_target_path
    ?? queue.actions.find((item) => item.action_id === 'prepare_filled_review_sheet')?.target_path
    ?? 'runtime/user-inputs/pt028-human-review-decision.real.json';
  const feedbackTarget = humanTargets.real_feedback_target_path
    ?? queue.actions.find((item) => item.action_id === 'run_feedback_finalize')?.target_path
    ?? 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json';
  return {
    schema_version: 'pt028_operator_next_step_target_status.v1',
    filled_review_sheet_target_path: reviewTarget,
    filled_review_sheet_target_exists: pathExists(root, reviewTarget),
    real_feedback_target_path: feedbackTarget,
    real_feedback_target_exists: pathExists(root, feedbackTarget)
  };
}

function requirementById(acceptanceStatus, requirementId) {
  return (acceptanceStatus?.requirement_status ?? [])
    .find((item) => item.requirement_id === requirementId) ?? null;
}

function requirementSnapshot(requirement) {
  return {
    requirement_id: requirement?.requirement_id ?? null,
    status: requirement?.status ?? 'missing',
    passed: requirement?.status === 'passed',
    evidence: requirement?.evidence ?? [],
    next_action: requirement?.next_action ?? null
  };
}

function aggregateTrackStatus(requirements) {
  if (!requirements.length) return 'missing_evidence';
  if (requirements.every((item) => item.passed)) return 'passed';
  if (requirements.some((item) => item.status === 'missing')) return 'missing_evidence';
  if (requirements.some((item) => String(item.status).includes('waiting_for_filled_human_review'))) {
    return 'waiting_for_filled_human_review';
  }
  if (requirements.some((item) => String(item.status).includes('waiting_for_real_feedback'))) {
    return 'waiting_for_real_feedback';
  }
  return 'needs_operator_action';
}

function firstNextAction(requirements) {
  return requirements.find((item) => item.next_action)?.next_action ?? null;
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))];
}

function buildBlockingDiagnostics({ finalization }) {
  const confirmationPreflight = (finalization?.steps ?? [])
    .find((step) => step.step_id === 'confirmation_preflight')?.stdout_json ?? null;
  const collectionCoverage = (finalization?.steps ?? [])
    .find((step) => step.step_id === 'collection_coverage')?.stdout_json ?? null;
  const acceptancePreview = (finalization?.steps ?? [])
    .find((step) => step.step_id === 'acceptance_chain_blocked_preview')?.stdout_json ?? null;
  const diagnostics = [
    {
      diagnostic_id: 'latest_preflight_readiness_failures',
      source: 'confirmation_preflight.readiness_summary',
      scope: 'readiness',
      gate_decision: confirmationPreflight?.readiness_summary?.gate_decision ?? null,
      failure_ids: uniqueStrings(confirmationPreflight?.readiness_required_failures ?? [])
    },
    {
      diagnostic_id: 'latest_collection_coverage_failures',
      source: 'collection_coverage',
      scope: 'collection_coverage',
      gate_decision: collectionCoverage?.gate_decision ?? null,
      failure_ids: uniqueStrings(collectionCoverage?.required_failures ?? [])
    },
    {
      diagnostic_id: 'latest_preflight_required_failures',
      source: 'confirmation_preflight',
      scope: 'confirmation_preflight',
      gate_decision: confirmationPreflight?.gate_decision ?? null,
      failure_ids: uniqueStrings(confirmationPreflight?.required_failures ?? [])
    },
    {
      diagnostic_id: 'latest_finalization_required_failures',
      source: 'pt028-real-feedback-finalizations/latest.json',
      scope: 'finalization',
      gate_decision: finalization?.gate_decision ?? null,
      failure_ids: uniqueStrings(finalization?.required_failures ?? [])
    },
    {
      diagnostic_id: 'latest_acceptance_preview_failures',
      source: 'acceptance_chain_blocked_preview',
      scope: 'acceptance_chain',
      gate_decision: acceptancePreview?.gate_decision ?? null,
      failure_ids: uniqueStrings(acceptancePreview?.required_failures ?? [])
    }
  ].filter((item) => item.failure_ids.length > 0);

  return {
    schema_version: 'pt028_operator_blocking_diagnostics.v1',
    source_finalization_id: finalization?.finalization_id ?? null,
    source_gate_decision: finalization?.gate_decision ?? null,
    diagnostics,
    top_failure_ids: uniqueStrings(diagnostics.flatMap((item) => item.failure_ids)).slice(0, 12)
  };
}

function buildObjectiveProgress({ acceptanceStatus, targetStatus, accepted, finalization }) {
  const lowLatency = requirementSnapshot(requirementById(acceptanceStatus, 'low_latency_event_stream'));
  const feedbackBoundStream = requirementSnapshot(requirementById(acceptanceStatus, 'feedback_bound_multi_window_event_stream'));
  const readiness = requirementSnapshot(requirementById(acceptanceStatus, 'real_feedback_readiness_gate'));
  const calibration = requirementSnapshot(requirementById(acceptanceStatus, 'real_feedback_calibration_evidence'));
  const finalReview = requirementSnapshot(requirementById(acceptanceStatus, 'final_human_special_review'));
  const feedbackTrackRequirements = [feedbackBoundStream, readiness, calibration];
  const eventSummary = acceptanceStatus?.event_stream_summary ?? {};
  const tracks = [
    {
      track_id: 'low_latency_event_stream',
      status: aggregateTrackStatus([lowLatency]),
      passed: lowLatency.passed,
      requirement_ids: ['low_latency_event_stream'],
      evidence: lowLatency.evidence,
      next_action: lowLatency.next_action,
      current_counts: {
        event_count: eventSummary.event_count ?? null,
        unique_window_count: eventSummary.unique_window_count ?? null,
        unique_target_count: eventSummary.unique_target_count ?? null,
        input_mode: eventSummary.input_mode ?? null,
        target_dispatch_latency_ms: eventSummary.target_dispatch_latency_ms ?? null
      }
    },
    {
      track_id: 'real_multi_window_feedback_calibration',
      status: aggregateTrackStatus(feedbackTrackRequirements),
      passed: feedbackTrackRequirements.every((item) => item.passed),
      requirement_ids: feedbackTrackRequirements.map((item) => item.requirement_id).filter(Boolean),
      evidence: feedbackTrackRequirements.flatMap((item) => item.evidence),
      next_action: firstNextAction(feedbackTrackRequirements)
        ?? (targetStatus.real_feedback_target_exists
          ? 'Run the feedback-bound acceptance chain and calibration checks.'
          : 'Prepare and validate real multi-window operator feedback before finalization.'),
      current_counts: {
        event_count: eventSummary.event_count ?? null,
        unique_window_count: eventSummary.unique_window_count ?? null,
        unique_target_count: eventSummary.unique_target_count ?? null,
        input_mode: eventSummary.input_mode ?? null,
        target_dispatch_latency_ms: eventSummary.target_dispatch_latency_ms ?? null
      }
    },
    {
      track_id: 'final_special_acceptance',
      status: accepted ? 'passed' : aggregateTrackStatus([finalReview]),
      passed: accepted,
      requirement_ids: ['final_human_special_review'],
      evidence: finalReview.evidence,
      next_action: finalReview.next_action
        ?? 'Complete human special review after real feedback readiness and calibration pass.',
      current_counts: {
        event_count: eventSummary.event_count ?? null,
        unique_window_count: eventSummary.unique_window_count ?? null,
        unique_target_count: eventSummary.unique_target_count ?? null,
        input_mode: eventSummary.input_mode ?? null,
        target_dispatch_latency_ms: eventSummary.target_dispatch_latency_ms ?? null
      }
    }
  ];
  const requiredTargetFiles = [
    {
      target_id: 'filled_human_review_sheet',
      path: targetStatus.filled_review_sheet_target_path,
      exists: targetStatus.filled_review_sheet_target_exists
    },
    {
      target_id: 'real_multi_window_operator_feedback',
      path: targetStatus.real_feedback_target_path,
      exists: targetStatus.real_feedback_target_exists
    }
  ];
  const missingTrackIds = tracks.filter((item) => !item.passed).map((item) => item.track_id);
  const missingTargetFileIds = requiredTargetFiles
    .filter((item) => item.exists !== true)
    .map((item) => item.target_id);
  const blockingDiagnostics = buildBlockingDiagnostics({ finalization });
  const readyToMarkGoalComplete =
    accepted
    && missingTrackIds.length === 0
    && missingTargetFileIds.length === 0;
  return {
    schema_version: 'pt028_operator_objective_progress.v1',
    objective: {
      low_latency_event_stream: true,
      real_multi_window_feedback_calibration: true,
      final_special_acceptance: true
    },
    overall_status: accepted
      ? 'complete'
      : 'open_waiting_for_real_human_feedback',
    tracks,
    completion_gate: {
      schema_version: 'pt028_operator_completion_gate.v1',
      ready_to_mark_goal_complete: readyToMarkGoalComplete,
      pt028_fully_accepted_for_production: accepted,
      required_track_ids: tracks.map((item) => item.track_id),
      passed_track_ids: tracks.filter((item) => item.passed).map((item) => item.track_id),
      missing_track_ids: missingTrackIds,
      required_target_files: requiredTargetFiles,
      missing_target_file_ids: missingTargetFileIds,
      blocking_diagnostics: blockingDiagnostics,
      fail_on_incomplete_supported: true,
      next_action: readyToMarkGoalComplete
        ? 'All PT-028 goal tracks and real target files are complete; run final audit before marking the active goal complete.'
        : 'Complete missing tracks and target files before marking the active goal complete.'
    },
    target_status: {
      filled_review_sheet_target_exists: targetStatus.filled_review_sheet_target_exists,
      real_feedback_target_exists: targetStatus.real_feedback_target_exists
    },
    source_gate_decision: acceptanceStatus?.gate_decision ?? null
  };
}

function renderMarkdown(report) {
  const current = report.current_action;
  const commands = report.next_commands.length
    ? report.next_commands.map((command) => `- \`${command}\``).join('\n')
    : '- none';
  const actions = report.queue.actions.length
    ? report.queue.actions
      .map((item) => `| ${item.action_id} | ${item.status} | ${item.open_path ?? ''} | ${item.target_path ?? ''} | ${item.command ?? ''} |`)
      .join('\n')
    : '| - | - | - | - | - |';
  const progressRows = report.objective_progress.tracks
    .map((item) => `| ${item.track_id} | ${item.status} | ${item.passed} | ${item.current_counts.unique_window_count ?? ''} | ${item.current_counts.unique_target_count ?? ''} | ${item.next_action ?? ''} |`)
    .join('\n');
  const diagnosticRows = (report.objective_progress.completion_gate.blocking_diagnostics?.diagnostics ?? [])
    .map((item) => `| ${item.scope} | ${item.gate_decision ?? ''} | ${item.failure_ids.join(', ') || 'none'} |`)
    .join('\n') || '| - | - | - |';
  return `# PT-028 Operator Next Step

- next_step_id: ${report.next_step_id}
- gate_decision: ${report.gate_decision}
- queue_status: ${report.queue.queue_status}
- current_action_id: ${current?.action_id ?? 'none'}
- current_action_status: ${current?.status ?? 'none'}
- next_blocking_action_id: ${report.queue.next_blocking_action_id ?? 'none'}
- review_target_exists: ${report.target_status.filled_review_sheet_target_exists}
- real_feedback_target_exists: ${report.target_status.real_feedback_target_exists}
- real_execution_allowed: ${report.boundary_policy.real_execution_allowed}
- real_send_attempted: ${report.boundary_policy.real_send_attempted}
- writes_real_user_input_files: ${report.boundary_policy.writes_real_user_input_files}
- writes_real_feedback_target: ${report.boundary_policy.writes_real_feedback_target}
- ready_to_mark_goal_complete: ${report.objective_progress.completion_gate.ready_to_mark_goal_complete}
- missing_track_ids: ${report.objective_progress.completion_gate.missing_track_ids.join(', ') || 'none'}
- missing_target_file_ids: ${report.objective_progress.completion_gate.missing_target_file_ids.join(', ') || 'none'}
- top_blocking_failure_ids: ${report.objective_progress.completion_gate.blocking_diagnostics.top_failure_ids.join(', ') || 'none'}

## Objective Progress

| track | status | passed | windows | targets | next action |
| --- | --- | --- | --- | --- | --- |
${progressRows}

## Blocking Diagnostics

| scope | gate | failure ids |
| --- | --- | --- |
${diagnosticRows}

## Current Action

- label: ${current?.label ?? 'none'}
- open_path: ${current?.open_path ?? 'none'}
- fallback_open_path: ${current?.fallback_open_path ?? 'none'}
- target_path: ${current?.target_path ?? 'none'}
- command: ${current?.command ?? 'none'}
- instruction: ${report.current_action_instruction}

## Commands

${commands}

## Queue

| action | status | open | target | command |
| --- | --- | --- | --- | --- |
${actions}

## Boundary

- This report is read-only.
- It does not write \`runtime/user-inputs/**\`.
- It does not run feedback finalization.
- It does not send messages.
`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderHtml(report) {
  const current = report.current_action;
  const commands = report.next_commands.length
    ? report.next_commands.map((command) => `<li><code>${escapeHtml(command)}</code></li>`).join('')
    : '<li>none</li>';
  const rows = report.queue.actions.length
    ? report.queue.actions
      .map((item) => `<tr><td><code>${escapeHtml(item.action_id)}</code></td><td>${escapeHtml(item.status)}</td><td><code>${escapeHtml(item.open_path ?? '')}</code></td><td><code>${escapeHtml(item.target_path ?? '')}</code></td><td>${item.command ? `<code>${escapeHtml(item.command)}</code>` : ''}</td></tr>`)
      .join('')
    : '<tr><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>';
  const progressRows = report.objective_progress.tracks
    .map((item) => `<tr><td><code>${escapeHtml(item.track_id)}</code></td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.passed)}</td><td>${escapeHtml(item.current_counts.unique_window_count ?? '')}</td><td>${escapeHtml(item.current_counts.unique_target_count ?? '')}</td><td>${escapeHtml(item.next_action ?? '')}</td></tr>`)
    .join('');
  const diagnosticRows = (report.objective_progress.completion_gate.blocking_diagnostics?.diagnostics ?? [])
    .map((item) => `<tr><td>${escapeHtml(item.scope)}</td><td>${escapeHtml(item.gate_decision ?? '')}</td><td><code>${escapeHtml(item.failure_ids.join(', ') || 'none')}</code></td></tr>`)
    .join('') || '<tr><td>-</td><td>-</td><td>-</td></tr>';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>PT-028 Operator Next Step</title>
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; margin: 32px; color: #172033; line-height: 1.55; }
    code { background: #f2f4f7; padding: 2px 5px; border-radius: 4px; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 16px 0; }
    .card { border: 1px solid #d0d7de; border-radius: 6px; padding: 10px 12px; background: #f8fafc; }
    .card b { display: block; color: #57606a; font-size: 12px; }
    table { border-collapse: collapse; width: 100%; margin-top: 10px; }
    th, td { border: 1px solid #d0d7de; padding: 7px 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #f6f8fa; }
  </style>
</head>
<body data-report-contract="pt028_operator_next_step.v1">
  <h1>PT-028 Operator Next Step</h1>
  <p>This page is read-only. It does not write real input files, run finalization, or send messages.</p>
  <div class="grid">
    <div class="card"><b>gate</b>${escapeHtml(report.gate_decision)}</div>
    <div class="card"><b>current action</b><code>${escapeHtml(current?.action_id ?? 'none')}</code></div>
    <div class="card"><b>next blocking action</b><code>${escapeHtml(report.queue.next_blocking_action_id ?? 'none')}</code></div>
    <div class="card"><b>review target exists</b>${escapeHtml(report.target_status.filled_review_sheet_target_exists)}</div>
    <div class="card"><b>feedback target exists</b>${escapeHtml(report.target_status.real_feedback_target_exists)}</div>
    <div class="card"><b>real send attempted</b>${escapeHtml(report.boundary_policy.real_send_attempted)}</div>
    <div class="card"><b>goal complete gate</b>${escapeHtml(report.objective_progress.completion_gate.ready_to_mark_goal_complete)}</div>
    <div class="card"><b>missing tracks</b>${escapeHtml(report.objective_progress.completion_gate.missing_track_ids.join(', ') || 'none')}</div>
    <div class="card"><b>missing target files</b>${escapeHtml(report.objective_progress.completion_gate.missing_target_file_ids.join(', ') || 'none')}</div>
  </div>
  <h2>Objective Progress</h2>
  <table>
    <thead><tr><th>track</th><th>status</th><th>passed</th><th>windows</th><th>targets</th><th>next action</th></tr></thead>
    <tbody>${progressRows}</tbody>
  </table>
  <h2>Blocking Diagnostics</h2>
  <table>
    <thead><tr><th>scope</th><th>gate</th><th>failure ids</th></tr></thead>
    <tbody>${diagnosticRows}</tbody>
  </table>
  <h2>Current Action</h2>
  <div class="grid">
    <div class="card"><b>status</b>${escapeHtml(current?.status ?? 'none')}</div>
    <div class="card"><b>open path</b><code>${escapeHtml(current?.open_path ?? 'none')}</code></div>
    <div class="card"><b>target path</b><code>${escapeHtml(current?.target_path ?? 'none')}</code></div>
  </div>
  <p>${escapeHtml(report.current_action_instruction)}</p>
  <h2>Commands</h2>
  <ul>${commands}</ul>
  <h2>Queue</h2>
  <table>
    <thead><tr><th>action</th><th>status</th><th>open</th><th>target</th><th>command</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>
`;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/write-pt028-operator-next-step.mjs [--root=<dir>] [--output-dir=<dir>]',
    '',
    'Writes a read-only current next-step report for PT-028 operator review and final acceptance.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve(argValue('root', process.cwd()));
  const refreshPath = resolveInputPath(root, argValue('refresh-chain', latestPath(root, 'pt028-operator-handoff-refresh-chains')));
  const handoffPath = resolveInputPath(root, argValue('operator-handoff', latestPath(root, 'pt028-operator-acceptance-handoffs')));
  const acceptanceStatusPath = resolveInputPath(root, argValue('acceptance-status', latestPath(root, 'pt028-acceptance-statuses')));
  const finalizationPath = resolveInputPath(root, argValue('finalization', latestPath(root, 'pt028-real-feedback-finalizations')));
  const refreshChain = readJsonIfExists(refreshPath);
  const operatorHandoff = readJsonIfExists(handoffPath);
  const acceptanceStatus = readJsonIfExists(acceptanceStatusPath);
  const finalization = readJsonIfExists(finalizationPath);
  const queue = normalizeQueue({ refreshChain, operatorHandoff, acceptanceStatus });
  const currentAction = currentActionFromQueue(queue);
  const targetStatus = buildTargetStatus({
    root,
    queue,
    operatorHandoff,
    acceptanceStatus
  });
  const accepted =
    refreshChain?.pt028_fully_accepted_for_production === true
    || operatorHandoff?.pt028_fully_accepted_for_production === true
    || acceptanceStatus?.pt028_fully_accepted_for_production === true;
  const objectiveProgress = buildObjectiveProgress({
    acceptanceStatus,
    targetStatus,
    accepted,
    finalization
  });
  const nextStepId = nowCompactId('pt028_operator_next_step');
  const report = {
    schema_version: 'pt028_operator_next_step.v1',
    next_step_id: nextStepId,
    created_at: new Date().toISOString(),
    gate_decision: accepted
      ? 'pt028_operator_next_step_complete'
      : currentAction
        ? 'operator_next_step_waiting_for_human_action'
        : 'operator_next_step_needs_handoff_refresh',
    pt028_fully_accepted_for_production: accepted,
    source_artifacts: {
      refresh_chain_path: relativeToRoot(root, refreshPath),
      operator_handoff_path: relativeToRoot(root, handoffPath),
      acceptance_status_path: relativeToRoot(root, acceptanceStatusPath),
      real_feedback_finalization_path: relativeToRoot(root, finalizationPath)
    },
    queue,
    current_action: currentAction,
    current_action_instruction: currentAction
      ? instructionForAction(currentAction.action_id)
      : 'Refresh the operator handoff chain so a current action queue is available.',
    objective_progress: objectiveProgress,
    target_status: targetStatus,
    next_commands: queue.actions
      .filter((item) => item.status !== 'completed')
      .map((item) => item.command)
      .filter(Boolean),
    boundary_policy: {
      report_is_read_only: true,
      writes_real_user_input_files: false,
      writes_real_feedback_target: false,
      runs_feedback_finalization: false,
      approves_human_review: false,
      real_execution_allowed: false,
      real_send_attempted: false,
      prompt_only_required: true
    }
  };

  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : path.join(root, 'runtime', 'pt028-operator-next-steps', nextStepId);
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'pt028-operator-next-step.json');
  const markdownPath = path.join(outputDir, 'pt028-operator-next-step.md');
  const htmlPath = path.join(outputDir, 'pt028-operator-next-step.html');
  const latestOutputPath = path.join(root, 'runtime', 'pt028-operator-next-steps', 'latest.json');
  mkdirSync(path.dirname(latestOutputPath), { recursive: true });
  const reportWithPaths = {
    ...report,
    output_paths: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      html_path: htmlPath,
      latest_path: latestOutputPath
    }
  };
  writeFileSync(jsonPath, `${JSON.stringify(reportWithPaths, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdown(reportWithPaths), 'utf8');
  writeFileSync(htmlPath, renderHtml(reportWithPaths), 'utf8');
  writeFileSync(latestOutputPath, `${JSON.stringify(reportWithPaths, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    command: 'write-pt028-operator-next-step',
    next_step_id: reportWithPaths.next_step_id,
    gate_decision: reportWithPaths.gate_decision,
    pt028_fully_accepted_for_production: reportWithPaths.pt028_fully_accepted_for_production,
    current_action_id: reportWithPaths.current_action?.action_id ?? null,
    current_action_status: reportWithPaths.current_action?.status ?? null,
    next_blocking_action_id: reportWithPaths.queue.next_blocking_action_id,
    objective_progress_status: reportWithPaths.objective_progress.overall_status,
    ready_to_mark_goal_complete: reportWithPaths.objective_progress.completion_gate.ready_to_mark_goal_complete,
    missing_track_ids: reportWithPaths.objective_progress.completion_gate.missing_track_ids,
    missing_target_file_ids: reportWithPaths.objective_progress.completion_gate.missing_target_file_ids,
    top_blocking_failure_ids: reportWithPaths.objective_progress.completion_gate.blocking_diagnostics.top_failure_ids,
    objective_track_statuses: reportWithPaths.objective_progress.tracks.map((item) => ({
      track_id: item.track_id,
      status: item.status,
      passed: item.passed
    })),
    filled_review_sheet_target_exists: reportWithPaths.target_status.filled_review_sheet_target_exists,
    real_feedback_target_exists: reportWithPaths.target_status.real_feedback_target_exists,
    next_commands: reportWithPaths.next_commands,
    real_execution_allowed: reportWithPaths.boundary_policy.real_execution_allowed,
    real_send_attempted: reportWithPaths.boundary_policy.real_send_attempted,
    writes_real_user_input_files: reportWithPaths.boundary_policy.writes_real_user_input_files,
    writes_real_feedback_target: reportWithPaths.boundary_policy.writes_real_feedback_target,
    json_path: jsonPath,
    markdown_path: markdownPath,
    html_path: htmlPath,
    latest_path: latestOutputPath
  }, null, 2));

  if (hasFlag('fail-on-incomplete') && reportWithPaths.objective_progress.completion_gate.ready_to_mark_goal_complete !== true) {
    process.exitCode = 1;
  }
}
