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
  const absolutePath = resolveInputPath(root, maybePath);
  return Boolean(absolutePath && existsSync(absolutePath));
}

function action({
  actionId,
  status,
  owner = 'operator_or_human_special_reviewer',
  artifactPath = null,
  targetPath = null,
  command = null,
  instructions = []
}) {
  return {
    action_id: actionId,
    status,
    owner,
    artifact_path: artifactPath,
    target_path: targetPath,
    command,
    instructions
  };
}

function buildOperatorActions({ status, reviewPack, humanReview, humanInputTargets }) {
  const finalReviewPackPath =
    reviewPack?.output_paths?.html_path
    ?? status?.human_handoff?.final_review_pack_path
    ?? null;
  const reviewSheetTemplatePath =
    humanReview?.output_paths?.review_sheet_template_path
    ?? status?.human_handoff?.review_sheet_template_path
    ?? null;
  const reviewSheetHtmlPath =
    humanReview?.output_paths?.review_sheet_html_path
    ?? status?.human_handoff?.review_sheet_html_path
    ?? null;
  const filledReviewSheetTarget = humanInputTargets?.filled_review_sheet_target_path
    ?? 'runtime/user-inputs/pt028-human-review-decision.real.json';
  const realFeedbackTarget = humanInputTargets?.real_feedback_target_path
    ?? 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json';
  const filledReviewSheetExists = humanInputTargets?.filled_review_sheet_target_exists === true;
  const realFeedbackExists = humanInputTargets?.real_feedback_target_exists === true;
  const generatedDecisionPath =
    humanReview?.output_paths?.decision_output_path
    ?? status?.human_handoff?.generated_decision_output_path
    ?? null;

  const actions = [
    action({
      actionId: 'open_final_special_review_pack',
      status: reviewPack?.ready_for_human_special_review === true ? 'ready' : 'needs_refresh',
      artifactPath: finalReviewPackPath,
      command: reviewPack?.ready_for_human_special_review === true ? null : 'npm.cmd run pt028:final-review-pack',
      instructions: [
        'Open the final special review pack before filling any real input.',
        'Confirm event stream, collection coverage, prompt-only and no-send evidence are visible.'
      ]
    }),
    action({
      actionId: 'open_human_review_sheet',
      status: reviewSheetTemplatePath ? 'ready' : 'needs_refresh',
      artifactPath: reviewSheetHtmlPath ?? reviewSheetTemplatePath,
      command: reviewSheetTemplatePath ? null : 'npm.cmd run pt028:human-review-decision',
      instructions: [
        'Use the generated JSON template as the source for the real filled review sheet.',
        'Use the paired Markdown/HTML worksheet for readable field guidance.'
      ]
    }),
    action({
      actionId: 'fill_real_human_review_sheet_target',
      status: filledReviewSheetExists ? 'completed' : 'waiting_for_human_input',
      artifactPath: reviewSheetTemplatePath,
      targetPath: filledReviewSheetTarget,
      instructions: [
        'Fill every global confirmation and every window review row from real observed desktop windows.',
        'Do not mark final human special review complete until the human reviewer has checked the event stream and all prompt-only/no-send boundaries.'
      ]
    }),
    action({
      actionId: 'run_review_sheet_check_only',
      status: filledReviewSheetExists ? 'ready' : 'blocked_until_review_sheet_exists',
      targetPath: filledReviewSheetTarget,
      command: humanInputTargets?.check_only_command
        ?? `npm.cmd run pt028:human-review-decision -- --review=${filledReviewSheetTarget} --check-only --fail-on-required`,
      instructions: [
        'Run check-only after the real review sheet is prepared.',
        'Repeat until required_failures is empty.'
      ]
    }),
    action({
      actionId: 'run_controlled_preflight',
      status: humanReview?.review_sheet_ready_for_decision_generation === true
        ? 'ready'
        : 'blocked_until_check_only_passes',
      targetPath: filledReviewSheetTarget,
      command: humanInputTargets?.controlled_preflight_command
        ?? `npm.cmd run pt028:human-review-decision -- --review=${filledReviewSheetTarget} --run-controlled-preflight`,
      instructions: [
        'Run the controlled preflight only after check-only passes.',
        'This step still must not write the real feedback target or send messages.'
      ]
    }),
    action({
      actionId: 'run_controlled_feedback_finalization',
      status: generatedDecisionPath ? 'ready' : 'blocked_until_generated_decision_exists',
      artifactPath: generatedDecisionPath,
      command: generatedDecisionPath
        ? `npm.cmd run pt028:feedback-finalize -- --decision=${generatedDecisionPath}`
        : (humanInputTargets?.finalization_command ?? 'npm.cmd run pt028:feedback-finalize -- --decision=<generated-decision-output-path>'),
      instructions: [
        'Use the finalization runner after controlled preflight produces a decision output.',
        'The runner is the controlled writer for the real feedback target; do not create the real feedback target by hand.'
      ]
    }),
    action({
      actionId: 'rerun_acceptance_chain_after_feedback_target',
      status: realFeedbackExists ? 'ready' : 'blocked_until_real_feedback_target_exists',
      targetPath: realFeedbackTarget,
      command: humanInputTargets?.acceptance_chain_command
        ?? `npm.cmd run pt028:acceptance-chain -- --feedback=${realFeedbackTarget}`,
      instructions: [
        'Run this after controlled finalization writes the real feedback target.',
        'The acceptance chain must prove feedback-bound event stream, readiness, calibration and final human review together.'
      ]
    })
  ];

  if (status?.pt028_fully_accepted_for_production === true) {
    return actions.map((item) => ({
      ...item,
      status: 'completed',
      command: null,
      instructions: [
        'Final special acceptance is already complete; no further operator action is required for this PT-028 acceptance cycle.',
        ...item.instructions
      ]
    }));
  }

  return actions;
}

function buildOperatorQuickstart({
  gateDecision,
  accepted,
  operatorActions,
  pendingActions,
  humanInputTargets,
  humanReviewHandoff
}) {
  const firstPending = pendingActions[0] ?? null;
  const commandsInOrder = pendingActions
    .map((item) => item.command)
    .filter(Boolean);
  return {
    schema_version: 'pt028_operator_quickstart.v1',
    status: accepted
      ? 'final_acceptance_complete'
      : firstPending
        ? 'operator_action_required'
        : gateDecision,
    primary_next_action_id: firstPending?.action_id ?? null,
    primary_next_action_status: firstPending?.status ?? 'completed',
    open_first_path: firstPending?.artifact_path
      ?? humanReviewHandoff.final_review_pack_html_path
      ?? humanReviewHandoff.review_sheet_html_path
      ?? null,
    open_paths: {
      final_review_pack_html_path: humanReviewHandoff.final_review_pack_html_path,
      review_sheet_html_path: humanReviewHandoff.review_sheet_html_path,
      review_sheet_template_path: humanReviewHandoff.review_sheet_template_path,
      generated_decision_output_path: humanReviewHandoff.generated_decision_output_path
    },
    target_files: {
      filled_review_sheet_target_path: humanInputTargets.filled_review_sheet_target_path,
      filled_review_sheet_target_exists: humanInputTargets.filled_review_sheet_target_exists === true,
      real_feedback_target_path: humanInputTargets.real_feedback_target_path,
      real_feedback_target_exists: humanInputTargets.real_feedback_target_exists === true
    },
    commands_in_order: commandsInOrder,
    manual_sequence: operatorActions.map((item) => ({
      action_id: item.action_id,
      status: item.status,
      artifact_path: item.artifact_path,
      target_path: item.target_path,
      command: item.command
    })),
    boundary_policy: {
      quickstart_is_read_only: true,
      writes_real_user_input_files: false,
      writes_real_feedback_target: false,
      approves_human_review: false,
      real_execution_allowed: false,
      real_send_attempted: false
    }
  };
}

function buildOperatorActionQueueForHandoff({
  status,
  accepted,
  humanInputTargets,
  humanReviewHandoff
}) {
  if (status?.operator_action_queue?.schema_version === 'pt028_operator_action_queue.v1') {
    return status.operator_action_queue;
  }

  const reviewExists = humanInputTargets.filled_review_sheet_target_exists === true;
  const realFeedbackExists = humanInputTargets.real_feedback_target_exists === true;
  let currentActionId = null;
  let nextBlockingActionId = null;
  if (!accepted) {
    if (!reviewExists) {
      currentActionId = humanReviewHandoff.review_sheet_html_path ? 'open_review_sheet_html' : 'prepare_filled_review_sheet';
      nextBlockingActionId = 'prepare_filled_review_sheet';
    } else if (!realFeedbackExists) {
      currentActionId = 'run_human_review_check_only';
      nextBlockingActionId = 'run_human_review_check_only';
    } else {
      currentActionId = 'run_acceptance_chain';
      nextBlockingActionId = 'run_acceptance_chain';
    }
  }

  const actions = [
    {
      action_id: 'open_review_sheet_html',
      label: 'Open human review worksheet',
      status: accepted || reviewExists
        ? 'completed'
        : humanReviewHandoff.review_sheet_html_path
          ? 'ready'
          : 'blocked_until_review_sheet_html_exists',
      open_path: humanReviewHandoff.review_sheet_html_path,
      fallback_open_path: humanReviewHandoff.review_sheet_markdown_path,
      target_path: null,
      command: null,
      writes_target_file: false,
      writes_real_feedback_target: false,
      real_send_allowed: false,
      prompt_only_required: true
    },
    {
      action_id: 'prepare_filled_review_sheet',
      label: 'Prepare filled human review sheet',
      status: accepted || reviewExists ? 'completed' : 'waiting_for_operator',
      open_path: humanReviewHandoff.review_sheet_template_path,
      fallback_open_path: humanReviewHandoff.review_sheet_html_path,
      target_path: humanInputTargets.filled_review_sheet_target_path,
      command: `Prepare ${humanInputTargets.filled_review_sheet_target_path} from ${humanReviewHandoff.review_sheet_template_path ?? '<human-review-template.json>'}`,
      writes_target_file: true,
      writes_real_feedback_target: false,
      real_send_allowed: false,
      prompt_only_required: true
    },
    {
      action_id: 'run_human_review_check_only',
      label: 'Run human review check-only gate',
      status: accepted ? 'completed' : reviewExists ? 'ready' : 'blocked_until_review_sheet_exists',
      open_path: null,
      fallback_open_path: null,
      target_path: humanInputTargets.filled_review_sheet_target_path,
      command: humanInputTargets.check_only_command
        ?? `npm.cmd run pt028:human-review-decision -- --review=${humanInputTargets.filled_review_sheet_target_path} --check-only --fail-on-required`,
      writes_target_file: false,
      writes_real_feedback_target: false,
      real_send_allowed: false,
      prompt_only_required: true
    },
    {
      action_id: 'run_human_review_controlled_preflight',
      label: 'Run controlled preflight',
      status: accepted ? 'completed' : 'blocked_until_check_only_ready',
      open_path: null,
      fallback_open_path: null,
      target_path: humanInputTargets.filled_review_sheet_target_path,
      command: humanInputTargets.controlled_preflight_command
        ?? `npm.cmd run pt028:human-review-decision -- --review=${humanInputTargets.filled_review_sheet_target_path} --run-controlled-preflight`,
      writes_target_file: false,
      writes_real_feedback_target: false,
      real_send_allowed: false,
      prompt_only_required: true
    },
    {
      action_id: 'run_feedback_finalize',
      label: 'Run controlled real feedback finalization',
      status: accepted || realFeedbackExists ? 'completed' : 'blocked_until_controlled_preflight_ready',
      open_path: null,
      fallback_open_path: null,
      target_path: humanInputTargets.real_feedback_target_path,
      command: humanInputTargets.finalization_command ?? 'npm.cmd run pt028:feedback-finalize -- --decision=<generated-decision-output-path>',
      writes_target_file: false,
      writes_real_feedback_target: true,
      real_send_allowed: false,
      prompt_only_required: true
    },
    {
      action_id: 'run_acceptance_chain',
      label: 'Run feedback-bound acceptance chain',
      status: accepted ? 'completed' : realFeedbackExists ? 'ready' : 'blocked_until_real_feedback_target_exists',
      open_path: null,
      fallback_open_path: null,
      target_path: humanInputTargets.real_feedback_target_path,
      command: humanInputTargets.acceptance_chain_command
        ?? `npm.cmd run pt028:acceptance-chain -- --feedback=${humanInputTargets.real_feedback_target_path}`,
      writes_target_file: false,
      writes_real_feedback_target: false,
      real_send_allowed: false,
      prompt_only_required: true
    }
  ];

  return {
    schema_version: 'pt028_operator_action_queue.v1',
    source: 'pt028_operator_acceptance_handoff_fallback',
    queue_status: accepted ? 'final_acceptance_complete' : 'operator_action_required',
    current_action_id: currentActionId,
    next_blocking_action_id: nextBlockingActionId,
    pending_action_count: actions.filter((item) => item.status !== 'completed').length,
    actions,
    boundary_policy: {
      read_only_status_report: true,
      writes_real_user_input_files: false,
      writes_real_feedback_target: false,
      real_execution_allowed: false,
      real_send_attempted: false,
      prompt_only_required: true
    }
  };
}

function renderMarkdown(handoff) {
  const actions = handoff.operator_next_actions
    .map((item) => [
      `### ${item.action_id}`,
      '',
      `- status: ${item.status}`,
      `- owner: ${item.owner}`,
      item.artifact_path ? `- artifact_path: ${item.artifact_path}` : null,
      item.target_path ? `- target_path: ${item.target_path}` : null,
      item.command ? `- command: \`${item.command}\`` : null,
      '',
      ...item.instructions.map((instruction) => `- ${instruction}`)
    ].filter(Boolean).join('\n'))
    .join('\n\n');
  const blockers = handoff.blocking_items.length
    ? handoff.blocking_items.map((item) => `- ${item}`).join('\n')
    : '- none';
  const quickstartCommands = handoff.operator_quickstart.commands_in_order.length
    ? handoff.operator_quickstart.commands_in_order.map((command) => `- \`${command}\``).join('\n')
    : '- none';
  const queueRows = handoff.operator_action_queue.actions.length
    ? handoff.operator_action_queue.actions
      .map((item) => `| ${item.action_id} | ${item.status} | ${item.target_path ?? ''} | ${item.command ?? ''} |`)
      .join('\n')
    : '| - | - | - | - |';
  return `# PT-028 Operator Acceptance Handoff

- handoff_id: ${handoff.handoff_id}
- gate_decision: ${handoff.gate_decision}
- pt028_fully_accepted_for_production: ${handoff.pt028_fully_accepted_for_production}
- real_execution_allowed: ${handoff.boundary_policy.real_execution_allowed}
- real_send_attempted: ${handoff.boundary_policy.real_send_attempted}
- writes_real_feedback_target: ${handoff.boundary_policy.writes_real_feedback_target}

## Operator Quickstart

- status: ${handoff.operator_quickstart.status}
- primary_next_action_id: ${handoff.operator_quickstart.primary_next_action_id ?? 'none'}
- primary_next_action_status: ${handoff.operator_quickstart.primary_next_action_status}
- open_first_path: ${handoff.operator_quickstart.open_first_path ?? 'none'}
- review_sheet_target: ${handoff.operator_quickstart.target_files.filled_review_sheet_target_path}
- real_feedback_target: ${handoff.operator_quickstart.target_files.real_feedback_target_path}

## Operator Action Queue

- schema_version: ${handoff.operator_action_queue.schema_version}
- source: ${handoff.operator_action_queue.source}
- queue_status: ${handoff.operator_action_queue.queue_status}
- current_action_id: ${handoff.operator_action_queue.current_action_id ?? 'none'}
- next_blocking_action_id: ${handoff.operator_action_queue.next_blocking_action_id ?? 'none'}
- pending_action_count: ${handoff.operator_action_queue.pending_action_count}
- writes_real_user_input_files: ${handoff.operator_action_queue.boundary_policy.writes_real_user_input_files}
- writes_real_feedback_target: ${handoff.operator_action_queue.boundary_policy.writes_real_feedback_target}

| action | status | target | command |
| --- | --- | --- | --- |
${queueRows}

### Commands In Order

${quickstartCommands}

## Current Evidence

- event_stream_input_mode: ${handoff.event_stream_summary.input_mode ?? 'missing'}
- event_stream_event_count: ${handoff.event_stream_summary.event_count ?? 'missing'}
- event_stream_window_count: ${handoff.event_stream_summary.unique_window_count ?? 'missing'}
- event_stream_target_count: ${handoff.event_stream_summary.unique_target_count ?? 'missing'}
- target_dispatch_latency_ms: ${handoff.event_stream_summary.target_dispatch_latency_ms ?? 'missing'}
- prompt_only_boundary_preserved: ${handoff.event_stream_summary.prompt_only_boundary_preserved}
- collection_task_count: ${handoff.feedback_collection_summary.task_count ?? 'missing'}
- collection_distinct_target_count: ${handoff.feedback_collection_summary.distinct_target_count ?? 'missing'}
- collection_confirmed_task_count: ${handoff.feedback_collection_summary.confirmed_task_count ?? 'missing'}
- collection_unconfirmed_task_ids: ${(handoff.feedback_collection_summary.unconfirmed_task_ids ?? []).join(',') || 'none'}
- filled_review_sheet_target_exists: ${handoff.human_input_targets.filled_review_sheet_target_exists}
- real_feedback_target_exists: ${handoff.human_input_targets.real_feedback_target_exists}

## Blocking Items

${blockers}

## Operator Next Actions

${actions}

## Boundary

- This handoff is read-only.
- It does not write real user input files.
- It does not approve human review.
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

function renderHtml(handoff) {
  const actionRows = handoff.operator_next_actions
    .map((item) => `<tr><td><code>${escapeHtml(item.action_id)}</code></td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.artifact_path ?? item.target_path ?? '')}</td><td>${item.command ? `<code>${escapeHtml(item.command)}</code>` : ''}</td></tr>`)
    .join('');
  const queueRows = handoff.operator_action_queue.actions
    .map((item) => `<tr><td><code>${escapeHtml(item.action_id)}</code></td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.target_path ?? item.open_path ?? '')}</td><td>${item.command ? `<code>${escapeHtml(item.command)}</code>` : ''}</td></tr>`)
    .join('');
  const blockers = handoff.blocking_items.length
    ? handoff.blocking_items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
    : '<li>none</li>';
  const quickstartCommands = handoff.operator_quickstart.commands_in_order.length
    ? handoff.operator_quickstart.commands_in_order.map((command) => `<li><code>${escapeHtml(command)}</code></li>`).join('')
    : '<li>none</li>';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>PT-028 Operator Acceptance Handoff</title>
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
<body data-report-contract="pt028_operator_acceptance_handoff.v1">
  <h1>PT-028 Operator Acceptance Handoff</h1>
  <p>This report is read-only. It does not write real input files, approve human review, or send messages.</p>
  <h2>Operator Quickstart</h2>
  <div class="grid">
    <div class="card"><b>status</b>${escapeHtml(handoff.operator_quickstart.status)}</div>
    <div class="card"><b>primary next action</b>${escapeHtml(handoff.operator_quickstart.primary_next_action_id ?? 'none')}</div>
    <div class="card"><b>open first</b><code>${escapeHtml(handoff.operator_quickstart.open_first_path ?? 'none')}</code></div>
    <div class="card"><b>review sheet target</b><code>${escapeHtml(handoff.operator_quickstart.target_files.filled_review_sheet_target_path)}</code></div>
    <div class="card"><b>real feedback target</b><code>${escapeHtml(handoff.operator_quickstart.target_files.real_feedback_target_path)}</code></div>
    <div class="card"><b>quickstart no-send</b>${escapeHtml(handoff.operator_quickstart.boundary_policy.real_send_attempted)}</div>
  </div>
  <h3>Commands In Order</h3>
  <ul>${quickstartCommands}</ul>
  <h2>Operator Action Queue</h2>
  <div class="grid">
    <div class="card"><b>queue status</b>${escapeHtml(handoff.operator_action_queue.queue_status)}</div>
    <div class="card"><b>current action</b><code>${escapeHtml(handoff.operator_action_queue.current_action_id ?? 'none')}</code></div>
    <div class="card"><b>next blocking action</b><code>${escapeHtml(handoff.operator_action_queue.next_blocking_action_id ?? 'none')}</code></div>
    <div class="card"><b>pending actions</b>${escapeHtml(handoff.operator_action_queue.pending_action_count)}</div>
    <div class="card"><b>writes real inputs</b>${escapeHtml(handoff.operator_action_queue.boundary_policy.writes_real_user_input_files)}</div>
    <div class="card"><b>writes real feedback</b>${escapeHtml(handoff.operator_action_queue.boundary_policy.writes_real_feedback_target)}</div>
  </div>
  <table>
    <thead><tr><th>action</th><th>status</th><th>target / open path</th><th>command</th></tr></thead>
    <tbody>${queueRows}</tbody>
  </table>
  <div class="grid">
    <div class="card"><b>gate_decision</b>${escapeHtml(handoff.gate_decision)}</div>
    <div class="card"><b>event/window/target</b>${escapeHtml(handoff.event_stream_summary.event_count)} / ${escapeHtml(handoff.event_stream_summary.unique_window_count)} / ${escapeHtml(handoff.event_stream_summary.unique_target_count)}</div>
    <div class="card"><b>collection confirmed</b>${escapeHtml(handoff.feedback_collection_summary.confirmed_task_count)} / ${escapeHtml(handoff.feedback_collection_summary.task_count)}</div>
    <div class="card"><b>review sheet target exists</b>${escapeHtml(handoff.human_input_targets.filled_review_sheet_target_exists)}</div>
    <div class="card"><b>real feedback target exists</b>${escapeHtml(handoff.human_input_targets.real_feedback_target_exists)}</div>
    <div class="card"><b>real send attempted</b>${escapeHtml(handoff.boundary_policy.real_send_attempted)}</div>
  </div>
  <h2>Blocking Items</h2>
  <ul>${blockers}</ul>
  <h2>Operator Next Actions</h2>
  <table>
    <thead><tr><th>action</th><th>status</th><th>artifact / target</th><th>command</th></tr></thead>
    <tbody>${actionRows}</tbody>
  </table>
</body>
</html>
`;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/write-pt028-operator-acceptance-handoff.mjs [--root=<dir>] [--output-dir=<dir>]',
    '',
    'Writes a read-only PT-028 operator acceptance handoff from the latest acceptance status, review pack and human review sheet.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve(argValue('root', process.cwd()));
  const acceptanceStatusPath = resolveInputPath(root, argValue('acceptance-status', latestPath(root, 'pt028-acceptance-statuses')));
  const finalReviewPackPath = resolveInputPath(root, argValue('final-review-pack', latestPath(root, 'pt028-final-special-review-packs')));
  const humanReviewDecisionPath = resolveInputPath(root, argValue('human-review-decision', latestPath(root, 'pt028-human-review-decisions')));
  const status = readJsonIfExists(acceptanceStatusPath);
  const reviewPack = readJsonIfExists(finalReviewPackPath);
  const humanReview = readJsonIfExists(humanReviewDecisionPath);
  const humanInputTargets = status?.human_handoff?.human_input_targets ?? {
    schema_version: 'pt028_human_input_targets.v1',
    filled_review_sheet_target_path: 'runtime/user-inputs/pt028-human-review-decision.real.json',
    filled_review_sheet_target_exists: pathExists(root, 'runtime/user-inputs/pt028-human-review-decision.real.json'),
    real_feedback_target_path: 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
    real_feedback_target_exists: pathExists(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json')
  };
  const operatorActions = buildOperatorActions({
    status,
    reviewPack,
    humanReview,
    humanInputTargets
  });
  const pendingActions = operatorActions.filter((item) => item.status !== 'completed');
  const requiredFailures = [];
  if (!status) requiredFailures.push('acceptance_status_missing');
  if (!reviewPack?.ready_for_human_special_review) requiredFailures.push('final_review_pack_missing_or_not_ready');
  if (!humanReview?.output_paths?.review_sheet_template_path) requiredFailures.push('human_review_sheet_template_missing');

  const handoffId = nowCompactId('pt028_operator_acceptance_handoff');
  const gateDecision = status?.pt028_fully_accepted_for_production === true
    ? 'pt028_operator_handoff_complete'
    : requiredFailures.length === 0
      ? 'ready_for_operator_human_review_completion'
      : 'operator_handoff_needs_refresh';
  const humanReviewHandoff = {
    final_review_pack_html_path: relativeToRoot(root, reviewPack?.output_paths?.html_path ?? status?.human_handoff?.final_review_pack_path),
    review_sheet_template_path: relativeToRoot(root, humanReview?.output_paths?.review_sheet_template_path ?? status?.human_handoff?.review_sheet_template_path),
    review_sheet_markdown_path: relativeToRoot(root, humanReview?.output_paths?.review_sheet_markdown_path ?? status?.human_handoff?.review_sheet_markdown_path),
    review_sheet_html_path: relativeToRoot(root, humanReview?.output_paths?.review_sheet_html_path ?? status?.human_handoff?.review_sheet_html_path),
    generated_decision_output_path: relativeToRoot(root, humanReview?.output_paths?.decision_output_path ?? status?.human_handoff?.generated_decision_output_path)
  };
  const boundaryPolicy = {
    handoff_is_read_only: true,
    writes_real_user_input_files: false,
    writes_real_feedback_target: false,
    approves_human_review: false,
    real_execution_allowed: false,
    real_send_attempted: false
  };
  const operatorQuickstart = buildOperatorQuickstart({
    gateDecision,
    accepted: status?.pt028_fully_accepted_for_production === true,
    operatorActions,
    pendingActions,
    humanInputTargets,
    humanReviewHandoff
  });
  const operatorActionQueue = buildOperatorActionQueueForHandoff({
    status,
    accepted: status?.pt028_fully_accepted_for_production === true,
    humanInputTargets,
    humanReviewHandoff
  });
  const handoff = {
    schema_version: 'pt028_operator_acceptance_handoff.v1',
    handoff_id: handoffId,
    created_at: new Date().toISOString(),
    gate_decision: gateDecision,
    pt028_fully_accepted_for_production: status?.pt028_fully_accepted_for_production === true,
    source: {
      root,
      acceptance_status_path: relativeToRoot(root, acceptanceStatusPath),
      final_review_pack_path: relativeToRoot(root, finalReviewPackPath),
      human_review_decision_path: relativeToRoot(root, humanReviewDecisionPath)
    },
    blocking_items: status?.blocking_items ?? requiredFailures,
    required_failures: requiredFailures,
    event_stream_summary: status?.event_stream_summary ?? reviewPack?.human_review_field_guide?.event_stream_review_summary ?? {},
    feedback_collection_summary: status?.human_handoff?.feedback_collection_summary
      ?? reviewPack?.human_review_field_guide?.feedback_collection_review_summary
      ?? {},
    review_sheet_initial_diagnostics_summary: status?.human_handoff?.review_sheet_initial_diagnostics_summary ?? null,
    human_input_targets: humanInputTargets,
    human_review_handoff: humanReviewHandoff,
    operator_quickstart: operatorQuickstart,
    operator_action_queue: operatorActionQueue,
    operator_next_actions: operatorActions,
    pending_operator_action_count: pendingActions.length,
    pending_operator_actions: pendingActions.map((item) => item.action_id),
    boundary_policy: boundaryPolicy
  };
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : path.join(root, 'runtime', 'pt028-operator-acceptance-handoffs', handoffId);
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'pt028-operator-acceptance-handoff.json');
  const markdownPath = path.join(outputDir, 'pt028-operator-acceptance-handoff.md');
  const htmlPath = path.join(outputDir, 'pt028-operator-acceptance-handoff.html');
  const latestOutputPath = path.join(root, 'runtime', 'pt028-operator-acceptance-handoffs', 'latest.json');
  mkdirSync(path.dirname(latestOutputPath), { recursive: true });
  const handoffWithPaths = {
    ...handoff,
    output_paths: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      html_path: htmlPath,
      latest_path: latestOutputPath
    }
  };
  writeFileSync(jsonPath, `${JSON.stringify(handoffWithPaths, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdown(handoffWithPaths), 'utf8');
  writeFileSync(htmlPath, renderHtml(handoffWithPaths), 'utf8');
  writeFileSync(latestOutputPath, `${JSON.stringify(handoffWithPaths, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    command: 'write-pt028-operator-acceptance-handoff',
    handoff_id: handoffWithPaths.handoff_id,
    gate_decision: handoffWithPaths.gate_decision,
    pt028_fully_accepted_for_production: handoffWithPaths.pt028_fully_accepted_for_production,
    blocking_items: handoffWithPaths.blocking_items,
    required_failures: handoffWithPaths.required_failures,
    pending_operator_action_count: handoffWithPaths.pending_operator_action_count,
    pending_operator_actions: handoffWithPaths.pending_operator_actions,
    operator_quickstart: handoffWithPaths.operator_quickstart,
    operator_action_queue: handoffWithPaths.operator_action_queue,
    filled_review_sheet_target_exists: handoffWithPaths.human_input_targets.filled_review_sheet_target_exists,
    real_feedback_target_exists: handoffWithPaths.human_input_targets.real_feedback_target_exists,
    real_execution_allowed: handoffWithPaths.boundary_policy.real_execution_allowed,
    real_send_attempted: handoffWithPaths.boundary_policy.real_send_attempted,
    writes_real_feedback_target: handoffWithPaths.boundary_policy.writes_real_feedback_target,
    json_path: jsonPath,
    markdown_path: markdownPath,
    html_path: htmlPath,
    latest_path: latestOutputPath
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && requiredFailures.length > 0) {
    process.exitCode = 2;
  }
}
