#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function nowCompactId(prefix) {
  return `${prefix}_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasArg(name) {
  return process.argv.includes(`--${name}`);
}

function repoScript(name) {
  return path.resolve('scripts', name);
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

function reviewPackPathFromReviewSheet(root, reviewPath) {
  const sheet = readJsonIfExists(reviewPath);
  const reviewPackPath = sheet?.source?.review_pack_path;
  if (!reviewPackPath) return null;
  return path.isAbsolute(reviewPackPath) ? reviewPackPath : path.resolve(root, reviewPackPath);
}

function defaultHumanReviewTargetPath(root) {
  return path.join(root, 'runtime', 'user-inputs', 'pt028-human-review-decision.real.json');
}

function defaultRealFeedbackTargetPath(root) {
  return path.join(root, 'runtime', 'user-inputs', 'pt028-real-multi-window-operator-feedback.real.json');
}

function parseJsonStdout(stdout) {
  const text = String(stdout ?? '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    return null;
  }
}

function runNodeScript({ script, args = [], cwd = process.cwd() }) {
  const result = spawnSync(process.execPath, [repoScript(script), ...args], {
    cwd,
    encoding: 'utf8'
  });
  return {
    script,
    args,
    exit_status: result.status,
    stdout_json: parseJsonStdout(result.stdout),
    stdout: result.stdout,
    stderr: result.stderr,
    ok: result.status === 0
  };
}

function stepSummary(stepId, run) {
  const out = run.stdout_json ?? {};
  return {
    step_id: stepId,
    script: run.script,
    args: run.args,
    exit_status: run.exit_status,
    ok: run.ok,
    gate_decision: out.gate_decision ?? out.overall_status ?? null,
    required_failures: out.required_failures ?? [],
    json_path: out.json_path ?? null,
    markdown_path: out.markdown_path ?? null,
    html_path: out.html_path ?? null,
    latest_path: out.latest_path ?? null,
    real_execution_allowed: out.real_execution_allowed === true,
    real_send_attempted: out.real_send_attempted === true,
    writes_real_feedback_target: out.writes_real_feedback_target === true,
    stdout_json: out
  };
}

function buildControlledPreflightSummary({ root, step }) {
  const out = step?.stdout_json ?? {};
  const decisionPath = out.decision_output_path ?? null;
  const decisionRelativePath = decisionPath ? relativeToRoot(root, decisionPath) : null;
  return {
    schema_version: 'pt028_controlled_preflight_summary.v1',
    step_present: Boolean(step),
    gate_decision: step?.gate_decision ?? null,
    ready_for_finalization: out.ready_for_finalization === true,
    ready_for_controlled_target_write: out.controlled_preflight_chain?.ready_for_controlled_target_write === true,
    decision_output_path: decisionRelativePath,
    controlled_preflight_path: step?.json_path ? relativeToRoot(root, step.json_path) : null,
    required_failures: step?.required_failures ?? [],
    finalization_command: decisionRelativePath
      ? `npm.cmd run pt028:feedback-finalize -- --decision=${decisionRelativePath}`
      : null,
    writes_real_feedback_target: false,
    real_execution_allowed: false,
    real_send_attempted: false
  };
}

function buildOperatorQuickstartSummary({ operatorHandoff = {} }) {
  const quickstart = operatorHandoff.operator_quickstart ?? {};
  return {
    schema_version: 'pt028_operator_quickstart_summary.v1',
    status: quickstart.status ?? (
      operatorHandoff.pt028_fully_accepted_for_production === true
        ? 'final_acceptance_complete'
        : 'operator_action_required'
    ),
    primary_next_action_id: quickstart.primary_next_action_id ?? (operatorHandoff.pending_operator_actions ?? [])[0] ?? null,
    primary_next_action_status: quickstart.primary_next_action_status ?? null,
    open_first_path: quickstart.open_first_path ?? operatorHandoff.human_review_handoff?.final_review_pack_html_path ?? null,
    open_paths: quickstart.open_paths ?? operatorHandoff.human_review_handoff ?? {},
    target_files: quickstart.target_files ?? {
      filled_review_sheet_target_path: operatorHandoff.human_input_targets?.filled_review_sheet_target_path ?? null,
      filled_review_sheet_target_exists: operatorHandoff.human_input_targets?.filled_review_sheet_target_exists === true,
      real_feedback_target_path: operatorHandoff.human_input_targets?.real_feedback_target_path ?? null,
      real_feedback_target_exists: operatorHandoff.human_input_targets?.real_feedback_target_exists === true
    },
    commands_in_order: quickstart.commands_in_order ?? [],
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

function buildOperatorActionQueueSummary({ operatorHandoff = {} }) {
  const queue = operatorHandoff.operator_action_queue ?? {};
  const actions = (queue.actions ?? []).map((item) => ({
    action_id: item.action_id,
    status: item.status,
    target_path: item.target_path ?? null,
    command: item.command ?? null,
    writes_target_file: item.writes_target_file === true,
    writes_real_feedback_target: item.writes_real_feedback_target === true,
    real_send_allowed: item.real_send_allowed === true
  }));
  return {
    schema_version: 'pt028_operator_action_queue_summary.v1',
    source_schema_version: queue.schema_version ?? null,
    source: queue.source ?? null,
    queue_status: queue.queue_status ?? (
      operatorHandoff.pt028_fully_accepted_for_production === true
        ? 'final_acceptance_complete'
        : 'operator_action_required'
    ),
    current_action_id: queue.current_action_id ?? null,
    next_blocking_action_id: queue.next_blocking_action_id ?? null,
    pending_action_count: queue.pending_action_count ?? actions.filter((item) => item.status !== 'completed').length,
    actions,
    boundary_policy: {
      summary_is_read_only: true,
      writes_real_user_input_files: queue.boundary_policy?.writes_real_user_input_files === true,
      writes_real_feedback_target: queue.boundary_policy?.writes_real_feedback_target === true,
      real_execution_allowed: queue.boundary_policy?.real_execution_allowed === true,
      real_send_attempted: queue.boundary_policy?.real_send_attempted === true,
      prompt_only_required: queue.boundary_policy?.prompt_only_required !== false
    }
  };
}

function buildHumanReviewFillPlanSummary({ root, humanReviewStep, controlledPreflightSummary }) {
  const out = humanReviewStep?.stdout_json ?? {};
  const fillPlan = out.human_review_fill_plan ?? {};
  const firstWindow = fillPlan.first_window_row_task ? [fillPlan.first_window_row_task] : [];
  const writerReport = readJsonIfExists(humanReviewStep?.json_path);
  const writerFillPlan = writerReport?.human_review_fill_plan ?? null;
  const sourceFillPlan = writerFillPlan ?? {};
  const unreadyRows = (sourceFillPlan.window_row_tasks ?? [])
    .filter((item) => item.ready !== true)
    .slice(0, 5)
    .map((item) => ({
      row_index: item.row_index,
      task_id: item.task_id ?? null,
      target_person_id: item.source_window?.target_person_id ?? null,
      dock_status_text: item.source_window?.dock_status_text ?? null,
      current_failed_checks: item.current_failed_checks ?? []
    }));
  return {
    schema_version: 'pt028_human_review_fill_plan_summary.v1',
    step_present: Boolean(humanReviewStep),
    source_writer_path: humanReviewStep?.json_path ? relativeToRoot(root, humanReviewStep.json_path) : null,
    source_schema_version: sourceFillPlan.schema_version ?? fillPlan.schema_version ?? null,
    template_json_path: sourceFillPlan.source_files?.template_json_path ?? fillPlan.template_json_path ?? null,
    worksheet_html_path: sourceFillPlan.source_files?.worksheet_html_path ?? fillPlan.worksheet_html_path ?? null,
    filled_review_sheet_target_path: sourceFillPlan.target_files?.filled_review_sheet_target_path ?? fillPlan.filled_review_sheet_target_path ?? null,
    real_feedback_target_path: sourceFillPlan.target_files?.real_feedback_target_path ?? fillPlan.real_feedback_target_path ?? null,
    active_review_sheet_path: sourceFillPlan.target_files?.active_review_sheet_path ?? fillPlan.active_review_sheet_path ?? null,
    current_review_sheet_exists: sourceFillPlan.current_review_sheet?.exists ?? fillPlan.current_review_sheet_exists ?? false,
    current_review_sheet_loaded: sourceFillPlan.current_review_sheet?.loaded ?? false,
    expected_window_review_count: sourceFillPlan.current_diagnostics_summary?.expected_window_review_count
      ?? fillPlan.expected_window_review_count
      ?? 0,
    unready_window_row_count: sourceFillPlan.current_diagnostics_summary?.unready_window_row_count
      ?? fillPlan.unready_window_row_count
      ?? 0,
    missing_global_confirmations: sourceFillPlan.current_diagnostics_summary?.missing_global_confirmations ?? [],
    failed_required_checks: sourceFillPlan.current_diagnostics_summary?.failed_required_checks ?? [],
    first_unready_window_rows: unreadyRows.length ? unreadyRows : firstWindow,
    check_only_ready: out.review_sheet_ready_for_decision_generation === true,
    controlled_preflight_ready: controlledPreflightSummary.ready_for_controlled_target_write === true,
    command_order: (sourceFillPlan.command_order ?? fillPlan.command_order ?? []).map((item) => ({
      step_id: item.step_id,
      command: item.command,
      writes_target_file: item.writes_target_file === true
    })),
    boundary_policy: {
      summary_is_read_only: true,
      writes_real_user_input_files: false,
      writes_real_feedback_target: false,
      real_execution_allowed: false,
      real_send_attempted: false,
      prompt_only_required: true
    }
  };
}

function renderMarkdown(chain) {
  const rows = chain.steps
    .map((step) => `| ${step.step_id} | ${step.ok} | ${step.gate_decision ?? ''} | ${step.real_send_attempted} | ${step.writes_real_feedback_target} | ${step.json_path ?? ''} |`)
    .join('\n');
  const blockers = chain.blocking_items.length
    ? chain.blocking_items.map((item) => `- ${item}`).join('\n')
    : '- none';
  const failures = chain.required_failures.length
    ? chain.required_failures.map((item) => `- ${item}`).join('\n')
    : '- none';
  const quickstartCommands = chain.operator_quickstart_summary.commands_in_order.length
    ? chain.operator_quickstart_summary.commands_in_order.map((command) => `- \`${command}\``).join('\n')
    : '- none';
  const actionQueueRows = chain.operator_action_queue_summary.actions.length
    ? chain.operator_action_queue_summary.actions
      .map((item) => `| ${item.action_id} | ${item.status} | ${item.target_path ?? ''} | ${item.command ?? ''} |`)
      .join('\n')
    : '| - | - | - | - |';
  const fillPlanCommands = chain.human_review_fill_plan_summary.command_order.length
    ? chain.human_review_fill_plan_summary.command_order.map((item) => `- ${item.step_id}: \`${item.command}\` (writes_target_file=${item.writes_target_file})`).join('\n')
    : '- none';
  const fillPlanRows = chain.human_review_fill_plan_summary.first_unready_window_rows.length
    ? chain.human_review_fill_plan_summary.first_unready_window_rows
      .map((item) => `| ${item.row_index} | ${item.task_id ?? ''} | ${item.target_person_id ?? ''} | ${item.dock_status_text ?? ''} | ${(item.current_failed_checks ?? []).join(', ') || 'none'} |`)
      .join('\n')
    : '| - | - | - | - | none |';
  return `# PT-028 Operator Handoff Refresh Chain

- refresh_id: ${chain.refresh_id}
- gate_decision: ${chain.gate_decision}
- pt028_fully_accepted_for_production: ${chain.pt028_fully_accepted_for_production}
- filled_review_sheet_target_exists: ${chain.human_input_targets.filled_review_sheet_target_exists}
- real_feedback_target_exists: ${chain.human_input_targets.real_feedback_target_exists}
- selected_review_source: ${chain.review_input_detection.selected_review_source}
- selected_review_path: ${chain.review_input_detection.selected_review_path ?? 'none'}
- check_only_mode: ${chain.review_input_detection.check_only_mode}
- auto_check_only: ${chain.review_input_detection.auto_check_only}
- auto_controlled_preflight_run: ${chain.review_input_detection.auto_controlled_preflight_run}
- auto_controlled_preflight_reason: ${chain.review_input_detection.auto_controlled_preflight_reason}
- controlled_preflight_ready: ${chain.controlled_preflight_summary.ready_for_controlled_target_write}
- controlled_preflight_decision_output_path: ${chain.controlled_preflight_summary.decision_output_path ?? 'none'}
- controlled_preflight_finalization_command: ${chain.controlled_preflight_summary.finalization_command ?? 'none'}
- fill_plan_source_writer_path: ${chain.human_review_fill_plan_summary.source_writer_path ?? 'none'}
- fill_plan_active_review_sheet_path: ${chain.human_review_fill_plan_summary.active_review_sheet_path ?? 'none'}
- fill_plan_current_review_sheet_exists: ${chain.human_review_fill_plan_summary.current_review_sheet_exists}
- fill_plan_unready_window_row_count: ${chain.human_review_fill_plan_summary.unready_window_row_count}
- selected_feedback_source: ${chain.feedback_input_detection.selected_feedback_source}
- selected_feedback_path: ${chain.feedback_input_detection.selected_feedback_path ?? 'none'}
- feedback_acceptance_chain_run: ${chain.feedback_input_detection.acceptance_chain_run}
- real_execution_allowed: ${chain.boundary_policy.real_execution_allowed}
- real_send_attempted: ${chain.boundary_policy.real_send_attempted}
- writes_real_feedback_target: ${chain.boundary_policy.writes_real_feedback_target}

## Operator Quickstart Summary

- status: ${chain.operator_quickstart_summary.status}
- primary_next_action_id: ${chain.operator_quickstart_summary.primary_next_action_id ?? 'none'}
- primary_next_action_status: ${chain.operator_quickstart_summary.primary_next_action_status ?? 'none'}
- open_first_path: ${chain.operator_quickstart_summary.open_first_path ?? 'none'}
- review_sheet_target: ${chain.operator_quickstart_summary.target_files.filled_review_sheet_target_path ?? 'none'}
- real_feedback_target: ${chain.operator_quickstart_summary.target_files.real_feedback_target_path ?? 'none'}

## Operator Action Queue Summary

- schema_version: ${chain.operator_action_queue_summary.schema_version}
- source_schema_version: ${chain.operator_action_queue_summary.source_schema_version ?? 'none'}
- source: ${chain.operator_action_queue_summary.source ?? 'none'}
- queue_status: ${chain.operator_action_queue_summary.queue_status}
- current_action_id: ${chain.operator_action_queue_summary.current_action_id ?? 'none'}
- next_blocking_action_id: ${chain.operator_action_queue_summary.next_blocking_action_id ?? 'none'}
- pending_action_count: ${chain.operator_action_queue_summary.pending_action_count}
- writes_real_user_input_files: ${chain.operator_action_queue_summary.boundary_policy.writes_real_user_input_files}
- writes_real_feedback_target: ${chain.operator_action_queue_summary.boundary_policy.writes_real_feedback_target}
- real_send_attempted: ${chain.operator_action_queue_summary.boundary_policy.real_send_attempted}

| action | status | target | command |
| --- | --- | --- | --- |
${actionQueueRows}

### Commands In Order

${quickstartCommands}

## Human Review Fill Plan Summary

- schema_version: ${chain.human_review_fill_plan_summary.schema_version}
- template_json_path: ${chain.human_review_fill_plan_summary.template_json_path ?? 'none'}
- worksheet_html_path: ${chain.human_review_fill_plan_summary.worksheet_html_path ?? 'none'}
- filled_review_sheet_target_path: ${chain.human_review_fill_plan_summary.filled_review_sheet_target_path ?? 'none'}
- real_feedback_target_path: ${chain.human_review_fill_plan_summary.real_feedback_target_path ?? 'none'}
- active_review_sheet_path: ${chain.human_review_fill_plan_summary.active_review_sheet_path ?? 'none'}
- current_review_sheet_exists: ${chain.human_review_fill_plan_summary.current_review_sheet_exists}
- expected_window_review_count: ${chain.human_review_fill_plan_summary.expected_window_review_count}
- unready_window_row_count: ${chain.human_review_fill_plan_summary.unready_window_row_count}
- check_only_ready: ${chain.human_review_fill_plan_summary.check_only_ready}
- controlled_preflight_ready: ${chain.human_review_fill_plan_summary.controlled_preflight_ready}
- missing_global_confirmations: ${chain.human_review_fill_plan_summary.missing_global_confirmations.join(', ') || 'none'}

| row | task | target | dock | failed_checks |
| --- | --- | --- | --- | --- |
${fillPlanRows}

### Fill Plan Commands

${fillPlanCommands}

## Steps

| step | ok | gate | real_send_attempted | writes_real_feedback_target | json |
| --- | --- | --- | --- | --- | --- |
${rows}

## Blocking Items

${blockers}

## Required Failures

${failures}

## Boundary

- This refresh chain only regenerates read-only review/handoff materials.
- It does not write \`runtime/user-inputs/**\`.
- It does not run \`pt028:feedback-finalize\`.
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

function renderHtml(chain) {
  const rows = chain.steps
    .map((step) => `<tr><td><code>${escapeHtml(step.step_id)}</code></td><td>${escapeHtml(step.ok)}</td><td>${escapeHtml(step.gate_decision ?? '')}</td><td>${escapeHtml(step.real_send_attempted)}</td><td>${escapeHtml(step.writes_real_feedback_target)}</td><td>${step.json_path ? `<code>${escapeHtml(step.json_path)}</code>` : ''}</td></tr>`)
    .join('');
  const blockers = chain.blocking_items.length
    ? chain.blocking_items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
    : '<li>none</li>';
  const quickstartCommands = chain.operator_quickstart_summary.commands_in_order.length
    ? chain.operator_quickstart_summary.commands_in_order.map((command) => `<li><code>${escapeHtml(command)}</code></li>`).join('')
    : '<li>none</li>';
  const actionQueueRows = chain.operator_action_queue_summary.actions.length
    ? chain.operator_action_queue_summary.actions
      .map((item) => `<tr><td><code>${escapeHtml(item.action_id)}</code></td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.target_path ?? '')}</td><td>${item.command ? `<code>${escapeHtml(item.command)}</code>` : ''}</td></tr>`)
      .join('')
    : '<tr><td>-</td><td>-</td><td>-</td><td>-</td></tr>';
  const fillPlanCommands = chain.human_review_fill_plan_summary.command_order.length
    ? chain.human_review_fill_plan_summary.command_order
      .map((item) => `<li><b>${escapeHtml(item.step_id)}</b>: <code>${escapeHtml(item.command)}</code> <span>writes_target_file=${escapeHtml(item.writes_target_file)}</span></li>`)
      .join('')
    : '<li>none</li>';
  const fillPlanRows = chain.human_review_fill_plan_summary.first_unready_window_rows.length
    ? chain.human_review_fill_plan_summary.first_unready_window_rows
      .map((item) => `<tr><td>${escapeHtml(item.row_index)}</td><td><code>${escapeHtml(item.task_id ?? '')}</code></td><td><code>${escapeHtml(item.target_person_id ?? '')}</code></td><td>${escapeHtml(item.dock_status_text ?? '')}</td><td>${escapeHtml((item.current_failed_checks ?? []).join(', ') || 'none')}</td></tr>`)
      .join('')
    : '<tr><td>-</td><td>-</td><td>-</td><td>-</td><td>none</td></tr>';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>PT-028 Operator Handoff Refresh Chain</title>
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
<body data-report-contract="pt028_operator_handoff_refresh_chain.v1">
  <h1>PT-028 Operator Handoff Refresh Chain</h1>
  <p>This chain refreshes read-only handoff materials. It does not write real user input files, run finalization, or send messages.</p>
  <h2>Operator Quickstart Summary</h2>
  <div class="grid">
    <div class="card"><b>status</b>${escapeHtml(chain.operator_quickstart_summary.status)}</div>
    <div class="card"><b>primary next action</b>${escapeHtml(chain.operator_quickstart_summary.primary_next_action_id ?? 'none')}</div>
    <div class="card"><b>open first</b><code>${escapeHtml(chain.operator_quickstart_summary.open_first_path ?? 'none')}</code></div>
    <div class="card"><b>review sheet target</b><code>${escapeHtml(chain.operator_quickstart_summary.target_files.filled_review_sheet_target_path ?? 'none')}</code></div>
    <div class="card"><b>real feedback target</b><code>${escapeHtml(chain.operator_quickstart_summary.target_files.real_feedback_target_path ?? 'none')}</code></div>
    <div class="card"><b>quickstart no-send</b>${escapeHtml(chain.operator_quickstart_summary.boundary_policy.real_send_attempted)}</div>
  </div>
  <h3>Commands In Order</h3>
  <ul>${quickstartCommands}</ul>
  <h2>Operator Action Queue Summary</h2>
  <div class="grid">
    <div class="card"><b>queue status</b>${escapeHtml(chain.operator_action_queue_summary.queue_status)}</div>
    <div class="card"><b>current action</b><code>${escapeHtml(chain.operator_action_queue_summary.current_action_id ?? 'none')}</code></div>
    <div class="card"><b>next blocking action</b><code>${escapeHtml(chain.operator_action_queue_summary.next_blocking_action_id ?? 'none')}</code></div>
    <div class="card"><b>pending actions</b>${escapeHtml(chain.operator_action_queue_summary.pending_action_count)}</div>
    <div class="card"><b>writes real inputs</b>${escapeHtml(chain.operator_action_queue_summary.boundary_policy.writes_real_user_input_files)}</div>
    <div class="card"><b>writes real feedback</b>${escapeHtml(chain.operator_action_queue_summary.boundary_policy.writes_real_feedback_target)}</div>
  </div>
  <table>
    <thead><tr><th>action</th><th>status</th><th>target</th><th>command</th></tr></thead>
    <tbody>${actionQueueRows}</tbody>
  </table>
  <h2>Human Review Fill Plan Summary</h2>
  <div class="grid">
    <div class="card"><b>schema</b>${escapeHtml(chain.human_review_fill_plan_summary.schema_version)}</div>
    <div class="card"><b>template JSON</b><code>${escapeHtml(chain.human_review_fill_plan_summary.template_json_path ?? 'none')}</code></div>
    <div class="card"><b>worksheet HTML</b><code>${escapeHtml(chain.human_review_fill_plan_summary.worksheet_html_path ?? 'none')}</code></div>
    <div class="card"><b>review target</b><code>${escapeHtml(chain.human_review_fill_plan_summary.filled_review_sheet_target_path ?? 'none')}</code></div>
    <div class="card"><b>feedback target</b><code>${escapeHtml(chain.human_review_fill_plan_summary.real_feedback_target_path ?? 'none')}</code></div>
    <div class="card"><b>active review sheet</b><code>${escapeHtml(chain.human_review_fill_plan_summary.active_review_sheet_path ?? 'none')}</code></div>
    <div class="card"><b>review sheet exists</b>${escapeHtml(chain.human_review_fill_plan_summary.current_review_sheet_exists)}</div>
    <div class="card"><b>expected rows</b>${escapeHtml(chain.human_review_fill_plan_summary.expected_window_review_count)}</div>
    <div class="card"><b>unready rows</b>${escapeHtml(chain.human_review_fill_plan_summary.unready_window_row_count)}</div>
    <div class="card"><b>check-only ready</b>${escapeHtml(chain.human_review_fill_plan_summary.check_only_ready)}</div>
    <div class="card"><b>preflight ready</b>${escapeHtml(chain.human_review_fill_plan_summary.controlled_preflight_ready)}</div>
    <div class="card"><b>summary no-send</b>${escapeHtml(chain.human_review_fill_plan_summary.boundary_policy.real_send_attempted)}</div>
  </div>
  <h3>First Unready Window Rows</h3>
  <table>
    <thead><tr><th>row</th><th>task</th><th>target</th><th>dock</th><th>failed checks</th></tr></thead>
    <tbody>${fillPlanRows}</tbody>
  </table>
  <h3>Fill Plan Commands</h3>
  <ul>${fillPlanCommands}</ul>
  <div class="grid">
    <div class="card"><b>gate_decision</b>${escapeHtml(chain.gate_decision)}</div>
    <div class="card"><b>production accepted</b>${escapeHtml(chain.pt028_fully_accepted_for_production)}</div>
    <div class="card"><b>pending actions</b>${escapeHtml(chain.operator_handoff_summary.pending_operator_action_count)}</div>
    <div class="card"><b>review sheet exists</b>${escapeHtml(chain.human_input_targets.filled_review_sheet_target_exists)}</div>
    <div class="card"><b>real feedback exists</b>${escapeHtml(chain.human_input_targets.real_feedback_target_exists)}</div>
    <div class="card"><b>real send attempted</b>${escapeHtml(chain.boundary_policy.real_send_attempted)}</div>
    <div class="card"><b>selected review source</b>${escapeHtml(chain.review_input_detection.selected_review_source)}</div>
    <div class="card"><b>check-only mode</b>${escapeHtml(chain.review_input_detection.check_only_mode)}</div>
    <div class="card"><b>auto check-only</b>${escapeHtml(chain.review_input_detection.auto_check_only)}</div>
    <div class="card"><b>auto preflight</b>${escapeHtml(chain.review_input_detection.auto_controlled_preflight_run)}</div>
    <div class="card"><b>preflight reason</b>${escapeHtml(chain.review_input_detection.auto_controlled_preflight_reason)}</div>
    <div class="card"><b>preflight ready</b>${escapeHtml(chain.controlled_preflight_summary.ready_for_controlled_target_write)}</div>
    <div class="card"><b>decision output</b>${escapeHtml(chain.controlled_preflight_summary.decision_output_path ?? 'none')}</div>
    <div class="card"><b>finalization command</b>${escapeHtml(chain.controlled_preflight_summary.finalization_command ?? 'none')}</div>
    <div class="card"><b>selected feedback source</b>${escapeHtml(chain.feedback_input_detection.selected_feedback_source)}</div>
    <div class="card"><b>feedback acceptance chain</b>${escapeHtml(chain.feedback_input_detection.acceptance_chain_run)}</div>
    <div class="card"><b>feedback chain mode</b>${escapeHtml(chain.feedback_input_detection.acceptance_chain_mode)}</div>
    <div class="card"><b>feedback path</b>${escapeHtml(chain.feedback_input_detection.selected_feedback_path ?? 'none')}</div>
  </div>
  <h2>Steps</h2>
  <table>
    <thead><tr><th>step</th><th>ok</th><th>gate</th><th>send</th><th>target write</th><th>json</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h2>Blocking Items</h2>
  <ul>${blockers}</ul>
</body>
</html>
`;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/run-pt028-operator-handoff-refresh.mjs [--root=<dir>] [--output-dir=<dir>] [--review=<file>] [--feedback=<file>] [--audit=<file>]',
    '',
    'Refreshes PT-028 final-review-pack, human-review-decision template, acceptance-status and operator-handoff in order.',
    'If a real feedback file is supplied or exists at the default target, it also runs the read-only acceptance chain before status refresh.',
    'Read-only: does not write runtime/user-inputs/**, does not run feedback-finalize and does not send messages.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve(argValue('root', process.cwd()));
  const refreshId = nowCompactId('pt028_operator_handoff_refresh_chain');
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : path.join(root, 'runtime', 'pt028-operator-handoff-refresh-chains', refreshId);
  const artifactsDir = path.join(outputDir, 'artifacts');
  mkdirSync(artifactsDir, { recursive: true });

  const explicitReviewPath = argValue('review');
  const defaultReviewTargetPath = defaultHumanReviewTargetPath(root);
  const defaultReviewTargetExists = existsSync(defaultReviewTargetPath);
  const discoveredReviewPath = explicitReviewPath
    ? (path.isAbsolute(explicitReviewPath) ? explicitReviewPath : path.resolve(root, explicitReviewPath))
    : defaultReviewTargetExists
      ? defaultReviewTargetPath
      : null;
  const reviewSheetSourcePackPath = discoveredReviewPath
    ? reviewPackPathFromReviewSheet(root, discoveredReviewPath)
    : null;
  const autoCheckOnly = Boolean(!explicitReviewPath && defaultReviewTargetExists && !hasArg('run-controlled-preflight'));
  const checkOnlyMode = hasArg('check-only') || autoCheckOnly;
  const controlledPreflightMode = hasArg('run-controlled-preflight');
  const humanReviewArgs = [`--root=${root}`, `--output-dir=${path.join(artifactsDir, 'human-review-decision')}`];
  if (discoveredReviewPath) humanReviewArgs.push(`--review=${discoveredReviewPath}`);
  if (checkOnlyMode) humanReviewArgs.push('--check-only');
  if (controlledPreflightMode) humanReviewArgs.push('--run-controlled-preflight');

  const explicitFeedbackPath = argValue('feedback');
  const defaultFeedbackTargetPath = defaultRealFeedbackTargetPath(root);
  const defaultFeedbackTargetExists = existsSync(defaultFeedbackTargetPath);
  const discoveredFeedbackPath = explicitFeedbackPath
    ? (path.isAbsolute(explicitFeedbackPath) ? explicitFeedbackPath : path.resolve(root, explicitFeedbackPath))
    : defaultFeedbackTargetExists
      ? defaultFeedbackTargetPath
      : null;
  const explicitAuditPath = argValue('audit');
  const acceptanceChainArgs = discoveredFeedbackPath
    ? [
      `--root=${root}`,
      `--feedback=${discoveredFeedbackPath}`,
      ...(explicitAuditPath ? [`--audit=${path.isAbsolute(explicitAuditPath) ? explicitAuditPath : path.resolve(root, explicitAuditPath)}`] : []),
      `--output-dir=${path.join(artifactsDir, 'acceptance-chain')}`
    ]
    : null;

  const steps = [];

  if (acceptanceChainArgs) {
    steps.push(stepSummary('acceptance_chain', runNodeScript({
      script: 'run-pt028-acceptance-chain.mjs',
      args: acceptanceChainArgs
    })));
  }

  steps.push(stepSummary('final_review_pack', runNodeScript({
    script: 'write-pt028-final-special-review-pack.mjs',
    args: [`--root=${root}`, `--output-dir=${path.join(artifactsDir, 'final-review-pack')}`]
  })));
  steps.push(stepSummary('human_review_decision', runNodeScript({
    script: 'write-pt028-human-review-decision.mjs',
    args: humanReviewArgs
  })));

  const initialHumanReviewStep = steps.find((step) => step.step_id === 'human_review_decision');
  const autoControlledPreflightRun = Boolean(
    autoCheckOnly
    && initialHumanReviewStep?.ok === true
    && (initialHumanReviewStep.required_failures ?? []).length === 0
    && initialHumanReviewStep.stdout_json?.review_sheet_ready_for_decision_generation === true
  );
  const autoControlledPreflightReason = autoControlledPreflightRun
    ? 'default_review_check_only_ready'
    : autoCheckOnly
      ? 'default_review_check_only_not_ready'
      : controlledPreflightMode
        ? 'explicit_controlled_preflight_requested'
        : 'not_applicable_without_default_review_auto_check';
  if (autoControlledPreflightRun) {
    steps.push(stepSummary('human_review_controlled_preflight', runNodeScript({
      script: 'write-pt028-human-review-decision.mjs',
      args: [
        `--root=${root}`,
        `--output-dir=${path.join(artifactsDir, 'human-review-controlled-preflight')}`,
        `--review=${discoveredReviewPath}`,
        '--run-controlled-preflight'
      ]
    })));
  }

  steps.push(
    stepSummary('acceptance_status', runNodeScript({
      script: 'write-pt028-acceptance-status.mjs',
      args: [`--root=${root}`, `--output-dir=${path.join(artifactsDir, 'acceptance-status')}`]
    })),
    stepSummary('operator_handoff', runNodeScript({
      script: 'write-pt028-operator-acceptance-handoff.mjs',
      args: [`--root=${root}`, `--output-dir=${path.join(artifactsDir, 'operator-handoff')}`]
    }))
  );

  const operatorHandoffStep = steps.find((step) => step.step_id === 'operator_handoff');
  const humanReviewStep = steps.find((step) => step.step_id === 'human_review_decision');
  const controlledPreflightStep = steps.find((step) => step.step_id === 'human_review_controlled_preflight');
  const operatorHandoff = readJsonIfExists(operatorHandoffStep?.json_path) ?? operatorHandoffStep?.stdout_json ?? {};
  const humanInputTargets = operatorHandoff.human_input_targets ?? {
    schema_version: 'pt028_human_input_targets.v1',
    filled_review_sheet_target_path: 'runtime/user-inputs/pt028-human-review-decision.real.json',
    filled_review_sheet_target_exists: existsSync(path.join(root, 'runtime/user-inputs/pt028-human-review-decision.real.json')),
    real_feedback_target_path: 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
    real_feedback_target_exists: existsSync(path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json'))
  };
  const boundaryFailures = steps.flatMap((step) => [
    step.real_send_attempted ? `${step.step_id}_real_send_attempted` : null,
    step.writes_real_feedback_target ? `${step.step_id}_writes_real_feedback_target` : null
  ].filter(Boolean));
  const stepFailures = steps
    .filter((step) => !step.ok)
    .map((step) => `${step.step_id}_failed`);
  const checkedReviewFailures = discoveredReviewPath && checkOnlyMode
    ? (humanReviewStep?.required_failures ?? []).map((failure) => `human_review_decision_${failure}`)
    : [];
  const controlledPreflightFailures = controlledPreflightStep
    ? (controlledPreflightStep.required_failures ?? []).map((failure) => `human_review_controlled_preflight_${failure}`)
    : [];
  const acceptanceChainStep = steps.find((step) => step.step_id === 'acceptance_chain');
  const controlledPreflightSummary = buildControlledPreflightSummary({
    root,
    step: controlledPreflightStep
  });
  const humanReviewFillPlanSummary = buildHumanReviewFillPlanSummary({
    root,
    humanReviewStep,
    controlledPreflightSummary
  });
  const operatorQuickstartSummary = buildOperatorQuickstartSummary({ operatorHandoff });
  const operatorActionQueueSummary = buildOperatorActionQueueSummary({ operatorHandoff });
  const checkedAcceptanceFailures = acceptanceChainStep
    ? (acceptanceChainStep.required_failures ?? []).map((failure) => `acceptance_chain_${failure}`)
    : [];
  const requiredFailures = [
    ...stepFailures,
    ...boundaryFailures,
    ...checkedReviewFailures,
    ...controlledPreflightFailures,
    ...checkedAcceptanceFailures,
    ...(operatorHandoff.required_failures ?? [])
  ];
  const chain = {
    schema_version: 'pt028_operator_handoff_refresh_chain.v1',
    refresh_id: refreshId,
    created_at: new Date().toISOString(),
    gate_decision: requiredFailures.length === 0
      ? (operatorHandoff.pt028_fully_accepted_for_production === true
        ? 'pt028_operator_handoff_refresh_complete'
        : 'operator_handoff_refreshed_waiting_for_human_input')
      : 'operator_handoff_refresh_needs_attention',
    pt028_fully_accepted_for_production: operatorHandoff.pt028_fully_accepted_for_production === true,
    source: {
      root,
      review_path: discoveredReviewPath ? relativeToRoot(root, discoveredReviewPath) : null
    },
    review_input_detection: {
      schema_version: 'pt028_review_input_detection.v1',
      explicit_review_path: explicitReviewPath ?? null,
      default_review_target_path: relativeToRoot(root, defaultReviewTargetPath),
      default_review_target_exists: defaultReviewTargetExists,
      selected_review_path: discoveredReviewPath ? relativeToRoot(root, discoveredReviewPath) : null,
      selected_review_source: explicitReviewPath
        ? 'explicit_review_arg'
        : defaultReviewTargetExists
          ? 'default_user_input_target'
          : 'none',
      review_sheet_source_pack_path: reviewSheetSourcePackPath
        ? relativeToRoot(root, reviewSheetSourcePackPath)
        : null,
      check_only_mode: checkOnlyMode,
      auto_check_only: autoCheckOnly,
      controlled_preflight_mode: controlledPreflightMode,
      auto_controlled_preflight_run: autoControlledPreflightRun,
      auto_controlled_preflight_reason: autoControlledPreflightReason
    },
    controlled_preflight_summary: controlledPreflightSummary,
    human_review_fill_plan_summary: humanReviewFillPlanSummary,
    operator_action_queue_summary: operatorActionQueueSummary,
    feedback_input_detection: {
      schema_version: 'pt028_feedback_input_detection.v1',
      explicit_feedback_path: explicitFeedbackPath ?? null,
      default_feedback_target_path: relativeToRoot(root, defaultFeedbackTargetPath),
      default_feedback_target_exists: defaultFeedbackTargetExists,
      selected_feedback_path: discoveredFeedbackPath ? relativeToRoot(root, discoveredFeedbackPath) : null,
      selected_feedback_source: explicitFeedbackPath
        ? 'explicit_feedback_arg'
        : defaultFeedbackTargetExists
          ? 'default_user_input_target'
          : 'none',
      explicit_audit_path: explicitAuditPath ?? null,
      acceptance_chain_run: Boolean(acceptanceChainArgs),
      acceptance_chain_mode: acceptanceChainArgs
        ? 'read_only_feedback_bound_validation'
        : 'skipped_until_real_feedback_exists'
    },
    steps,
    blocking_items: operatorHandoff.blocking_items ?? [],
    required_failures: requiredFailures,
    human_input_targets: humanInputTargets,
    operator_quickstart_summary: operatorQuickstartSummary,
    operator_handoff_summary: {
      handoff_id: operatorHandoff.handoff_id ?? operatorHandoffStep?.stdout_json?.handoff_id ?? null,
      gate_decision: operatorHandoff.gate_decision ?? operatorHandoffStep?.gate_decision ?? null,
      pending_operator_action_count: operatorHandoff.pending_operator_action_count ?? null,
      pending_operator_actions: operatorHandoff.pending_operator_actions ?? []
    },
    latest_artifacts: {
      final_review_pack_path: relativeToRoot(root, steps.find((step) => step.step_id === 'final_review_pack')?.json_path),
      human_review_decision_path: relativeToRoot(root, steps.find((step) => step.step_id === 'human_review_decision')?.json_path),
      human_review_controlled_preflight_path: relativeToRoot(root, controlledPreflightStep?.json_path),
      acceptance_chain_path: relativeToRoot(root, steps.find((step) => step.step_id === 'acceptance_chain')?.json_path),
      acceptance_status_path: relativeToRoot(root, steps.find((step) => step.step_id === 'acceptance_status')?.json_path),
      operator_handoff_path: relativeToRoot(root, operatorHandoffStep?.json_path)
    },
    boundary_policy: {
      refresh_chain_is_read_only: true,
      writes_real_user_input_files: false,
      writes_real_feedback_target: false,
      runs_feedback_finalization: false,
      approves_human_review: false,
      real_execution_allowed: false,
      real_send_attempted: false
    }
  };

  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'pt028-operator-handoff-refresh-chain.json');
  const markdownPath = path.join(outputDir, 'pt028-operator-handoff-refresh-chain.md');
  const htmlPath = path.join(outputDir, 'pt028-operator-handoff-refresh-chain.html');
  const latestPath = path.join(root, 'runtime', 'pt028-operator-handoff-refresh-chains', 'latest.json');
  mkdirSync(path.dirname(latestPath), { recursive: true });
  const chainWithPaths = {
    ...chain,
    output_paths: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      html_path: htmlPath,
      latest_path: latestPath
    }
  };
  writeFileSync(jsonPath, `${JSON.stringify(chainWithPaths, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdown(chainWithPaths), 'utf8');
  writeFileSync(htmlPath, renderHtml(chainWithPaths), 'utf8');
  writeFileSync(latestPath, `${JSON.stringify(chainWithPaths, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    command: 'run-pt028-operator-handoff-refresh',
    refresh_id: chainWithPaths.refresh_id,
    gate_decision: chainWithPaths.gate_decision,
    pt028_fully_accepted_for_production: chainWithPaths.pt028_fully_accepted_for_production,
    blocking_items: chainWithPaths.blocking_items,
    required_failures: chainWithPaths.required_failures,
    step_count: chainWithPaths.steps.length,
    failed_steps: chainWithPaths.steps.filter((step) => !step.ok).map((step) => step.step_id),
    filled_review_sheet_target_exists: chainWithPaths.human_input_targets.filled_review_sheet_target_exists,
    real_feedback_target_exists: chainWithPaths.human_input_targets.real_feedback_target_exists,
    review_input_detection: chainWithPaths.review_input_detection,
    controlled_preflight_summary: chainWithPaths.controlled_preflight_summary,
    human_review_fill_plan_summary: chainWithPaths.human_review_fill_plan_summary,
    operator_action_queue_summary: chainWithPaths.operator_action_queue_summary,
    feedback_input_detection: chainWithPaths.feedback_input_detection,
    operator_quickstart_summary: chainWithPaths.operator_quickstart_summary,
    real_execution_allowed: chainWithPaths.boundary_policy.real_execution_allowed,
    real_send_attempted: chainWithPaths.boundary_policy.real_send_attempted,
    writes_real_feedback_target: chainWithPaths.boundary_policy.writes_real_feedback_target,
    json_path: jsonPath,
    markdown_path: markdownPath,
    html_path: htmlPath,
    latest_path: latestPath
  }, null, 2));

  if (hasArg('fail-on-required') && requiredFailures.length > 0) {
    process.exitCode = 2;
  }
}
