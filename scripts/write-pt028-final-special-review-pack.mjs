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

function check({ checkId, status, evidence = [], required = true }) {
  return {
    check_id: checkId,
    status: status ? 'passed' : 'failed',
    required,
    evidence
  };
}

function bool(value) {
  return value === true;
}

function defaultPath(root, runtimeDir) {
  return path.join(root, 'runtime', runtimeDir, 'latest.json');
}

function commandWithDecision(decisionTemplatePath) {
  return `npm.cmd run pt028:feedback-finalize -- --decision=${decisionTemplatePath ?? '<decision.json>'}`;
}

function buildEventStreamReviewSummary(health) {
  const promptOnlyHealthCheckPassed = (health?.checks ?? [])
    .some((item) => item.check_id === 'prompt_only_boundary_preserved' && item.status === 'passed');
  return {
    schema_version: 'pt028_human_review_event_stream_summary.v1',
    event_health_gate_decision: health?.gate_decision ?? null,
    event_stream_gate_decision: health?.stream_summary?.gate_decision ?? null,
    event_count: health?.stream_summary?.event_count ?? null,
    unique_window_count: health?.stream_summary?.unique_window_count ?? null,
    unique_target_count: health?.stream_summary?.unique_target_count ?? null,
    input_mode: health?.stream_summary?.input_mode ?? null,
    ipc_channel: health?.stream_summary?.ipc_channel ?? null,
    target_dispatch_latency_ms: health?.stream_summary?.target_dispatch_latency_ms ?? null,
    debounce_ms: health?.stream_summary?.debounce_ms ?? null,
    fallback_poll_interval_ms: health?.stream_summary?.fallback_poll_interval_ms ?? null,
    prompt_only_boundary_preserved: promptOnlyHealthCheckPassed || (
      health?.real_execution_allowed === false
      && health?.real_send_attempted === false
      && health?.writes_real_feedback_target === false
    ),
    required_failures: health?.required_failures ?? [],
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: false
  };
}

function buildFeedbackCollectionReviewSummary({ session, coverage }) {
  const coverageSummary = coverage?.coverage_summary ?? {};
  const taskCount = session?.collection_scope?.task_count
    ?? session?.operator_collection_tasks?.length
    ?? coverageSummary.task_count
    ?? null;
  const distinctTargetCount = session?.collection_scope?.distinct_target_count
    ?? (session?.operator_collection_tasks
      ? new Set(session.operator_collection_tasks.map((task) => task.target_person_id).filter(Boolean)).size
      : null);
  const firstFailedCoverage = (coverage?.task_coverage ?? [])
    .find((task) => task.status !== 'confirmed');
  const firstFailedChecks = (firstFailedCoverage?.checks ?? [])
    .filter((checkItem) => checkItem.required === true && checkItem.status !== 'passed')
    .map((checkItem) => checkItem.check_id);

  return {
    schema_version: 'pt028_human_review_feedback_collection_summary.v1',
    session_gate_decision: session?.gate_decision ?? null,
    session_ready_for_operator_feedback_collection: session?.ready_for_operator_feedback_collection === true,
    task_count: taskCount,
    distinct_target_count: distinctTargetCount,
    coverage_gate_decision: coverage?.gate_decision ?? null,
    ready_for_confirmation_preflight: coverage?.ready_for_confirmation_preflight === true,
    matched_task_count: coverageSummary.matched_task_count ?? coverage?.matched_task_count ?? null,
    confirmed_task_count: coverageSummary.confirmed_task_count ?? coverage?.confirmed_task_count ?? null,
    unconfirmed_task_ids: coverageSummary.unconfirmed_task_ids ?? coverage?.unconfirmed_task_ids ?? [],
    first_unconfirmed_failed_checks: coverage?.first_unconfirmed_failed_checks ?? firstFailedChecks,
    coverage_required_failures: coverage?.required_failures ?? [],
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: false
  };
}

function buildReviewActions({ decisionTemplatePath, session, health }) {
  return [
    {
      action_id: 'review_real_window_collection_tasks',
      status: session?.ready_for_operator_feedback_collection === true ? 'ready' : 'needs_attention',
      owner: 'human_special_reviewer',
      artifact_path: session?.output_paths?.html_path ?? session?.output_paths?.markdown_path ?? null,
      instructions: [
        'Open the collection session report and inspect every operator_collection_task.',
        'Confirm each reviewed window is a real human-contact window, not a public account, service account or unrelated artifact.',
        'Confirm each task stays prompt-only/no-send and only reviewed evidence refs are recorded.'
      ]
    },
    {
      action_id: 'verify_low_latency_event_stream_health',
      status: health?.gate_decision === 'event_stream_ready_for_low_latency_gui_subscription' ? 'passed' : 'needs_attention',
      owner: 'human_special_reviewer',
      artifact_path: health?.output_paths?.markdown_path ?? null,
      instructions: [
        'Confirm the event stream health report passes IPC channel, 50ms dispatch, 50ms debounce, 1s fallback poll and event ordering checks.',
        'Confirm the health report preserves prompt-only/no-send and writes_real_feedback_target=false.'
      ]
    },
    {
      action_id: 'fill_confirmation_decision_template',
      status: decisionTemplatePath ? 'open' : 'needs_attention',
      owner: 'operator_or_human_special_reviewer',
      artifact_path: decisionTemplatePath,
      instructions: [
        'Recommended path: run npm.cmd run pt028:human-review-decision, fill the generated review sheet, rerun it with --review=<filled-sheet> --check-only, then rerun it with --review=<filled-sheet> --run-controlled-preflight.',
        'Manual fallback: fill every feedback_batch.window_feedback_records row from the collection session task pointers.',
        'Set operator_confirmation confirmation flags only after the real windows and target bindings are verified.',
        'Set feedback_batch.human_special_review.approved_for_final_special_acceptance=true only after this review is complete.'
      ]
    },
    {
      action_id: 'run_controlled_finalization',
      status: decisionTemplatePath ? 'ready_after_template_completion' : 'blocked_missing_template',
      owner: 'operator',
      command_after_completion: commandWithDecision(decisionTemplatePath),
      instructions: [
        'Run the finalization command after the decision template is filled.',
        'Do not manually write runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json.',
        'Do not enable real sending; finalization remains prompt-only and writes only through the controlled confirmation gate.'
      ]
    }
  ];
}

function buildHumanReviewFieldGuide({ decisionTemplatePath, targetFeedbackPath, session, health, coverage, acceptanceChain }) {
  const tasks = session?.operator_collection_tasks ?? [];
  const eventStreamReviewSummary = buildEventStreamReviewSummary(health);
  const feedbackCollectionReviewSummary = buildFeedbackCollectionReviewSummary({ session, coverage });
  return {
    schema_version: 'pt028_human_review_field_guide.v1',
    language: 'zh-CN',
    purpose: '把真实多窗口反馈、低延迟事件流和最终专项验收需要人工确认的字段集中到一个可读清单中，减少直接编辑 JSON 模板时的遗漏。',
    decision_template_path: decisionTemplatePath,
    target_feedback_path: targetFeedbackPath,
    low_latency_event_stream_review: {
      expected_gate_decision: 'event_stream_ready_for_low_latency_gui_subscription',
      current_gate_decision: health?.gate_decision ?? null,
      required_thresholds: {
        target_dispatch_latency_ms: 50,
        debounce_ms: 50,
        fallback_poll_interval_ms: 1000
      },
      observed_thresholds: {
        target_dispatch_latency_ms: health?.stream_summary?.target_dispatch_latency_ms ?? null,
        debounce_ms: health?.stream_summary?.debounce_ms ?? null,
        fallback_poll_interval_ms: health?.stream_summary?.fallback_poll_interval_ms ?? null
      },
      observed_counts: {
        event_count: eventStreamReviewSummary.event_count,
        unique_window_count: eventStreamReviewSummary.unique_window_count,
        unique_target_count: eventStreamReviewSummary.unique_target_count
      },
      input_mode: eventStreamReviewSummary.input_mode,
      ipc_channel: eventStreamReviewSummary.ipc_channel,
      prompt_only_boundary_preserved: eventStreamReviewSummary.prompt_only_boundary_preserved,
      must_remain: [
        'real_execution_allowed=false',
        'real_send_attempted=false',
        'writes_real_feedback_target=false'
      ]
    },
    event_stream_review_summary: eventStreamReviewSummary,
    feedback_collection_review_summary: feedbackCollectionReviewSummary,
    operator_confirmation_required_fields: [
      'operator_confirmation.approved_to_write_real_feedback_target',
      'operator_confirmation.reviewer_id',
      'operator_confirmation.reviewed_at',
      'operator_confirmation.confirm_real_windows_observed',
      'operator_confirmation.confirm_target_binding',
      'operator_confirmation.confirm_prompt_only',
      'operator_confirmation.confirm_no_real_send',
      'operator_confirmation.confirm_privacy_boundary',
      'operator_confirmation.confirm_human_special_review'
    ].map((fieldPath) => ({
      field_path: fieldPath,
      required_action: fieldPath.endsWith('reviewer_id')
        ? '填写真实审查人标识'
        : fieldPath.endsWith('reviewed_at')
          ? '填写真实 ISO 时间'
          : '人工确认后改为 true',
      caution: '只有真实窗口、目标绑定、prompt-only、未发送和隐私边界都已人工核对后才能确认。'
    })),
    window_record_required_fields: [
      'real_window_observed',
      'state_target_verified',
      'prompt_only_confirmed',
      'no_real_send_attempted',
      'privacy_boundary_confirmed',
      'reviewed_at',
      'evidence_refs'
    ],
    window_task_map: tasks.map((task) => ({
      task_id: task.task_id,
      checklist_row_id: task.checklist_row_id,
      slot_index: task.slot_index,
      decision_template_record_pointer: task.decision_template_record_pointer,
      draft_record_pointer: task.draft_record_pointer,
      window_id: task.window_id,
      app_type: task.app_type,
      target_person_id: task.target_person_id,
      target_display_name_hint: task.target_display_name_hint,
      state_path: task.state_path,
      dock_status_text: task.dock_status_text,
      send_gate_mode: task.send_gate_mode,
      evidence_ref_count: (task.evidence_refs ?? []).length,
      required_operator_confirmations: task.required_operator_confirmations ?? [],
      human_review_rule: '逐行核对真实窗口截图/观察、目标身份、状态路径和 prompt-only 发送门阀；确认后只修改对应 feedback_batch.window_feedback_records 行。'
    })),
    human_special_review_required_fields: [
      {
        field_path: 'feedback_batch.human_special_review.approved_for_final_special_acceptance',
        required_action: '最终专项审查通过后改为 true',
        caution: '不能只因为机器检查通过就确认，必须完成真人多窗口反馈、低延迟事件流、校准和隐私边界复核。'
      },
      {
        field_path: 'feedback_batch.human_special_review.reviewer_id',
        required_action: '填写最终专项审查人标识',
        caution: '用于后续追溯，不要使用占位符。'
      },
      {
        field_path: 'feedback_batch.human_special_review.reviewed_at',
        required_action: '填写最终专项审查完成的 ISO 时间',
        caution: '用于判定 human_special_review_complete。'
      }
    ],
    final_acceptance_expected_remaining_failures: acceptanceChain?.required_failures ?? [],
    after_template_completion: [
      'npm.cmd run pt028:human-review-decision',
      'npm.cmd run pt028:human-review-decision -- --review=<filled-review-sheet.json> --check-only --fail-on-required',
      'npm.cmd run pt028:human-review-decision -- --review=<filled-review-sheet.json> --run-controlled-preflight',
      'npm.cmd run pt028:feedback-finalize -- --decision=<generated-decision-output-path>',
      '通过后再运行 npm.cmd run pt028:acceptance-chain -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
      '真实发送仍然保持阻断，发送能力必须走另一个受控发送门阀。'
    ]
  };
}

function renderFieldGuideMarkdown(fieldGuide) {
  const evidenceReviewSummary = [
    `- event_stream_input_mode: ${fieldGuide.event_stream_review_summary.input_mode ?? 'missing'}`,
    `- event_stream_event_count: ${fieldGuide.event_stream_review_summary.event_count ?? 'missing'}`,
    `- event_stream_window_count: ${fieldGuide.event_stream_review_summary.unique_window_count ?? 'missing'}`,
    `- event_stream_target_count: ${fieldGuide.event_stream_review_summary.unique_target_count ?? 'missing'}`,
    `- event_stream_ipc_channel: ${fieldGuide.event_stream_review_summary.ipc_channel ?? 'missing'}`,
    `- event_stream_target_dispatch_latency_ms: ${fieldGuide.event_stream_review_summary.target_dispatch_latency_ms ?? 'missing'}`,
    `- event_stream_debounce_ms: ${fieldGuide.event_stream_review_summary.debounce_ms ?? 'missing'}`,
    `- event_stream_fallback_poll_interval_ms: ${fieldGuide.event_stream_review_summary.fallback_poll_interval_ms ?? 'missing'}`,
    `- prompt_only_boundary_preserved: ${fieldGuide.event_stream_review_summary.prompt_only_boundary_preserved}`,
    `- collection_session_gate: ${fieldGuide.feedback_collection_review_summary.session_gate_decision ?? 'missing'}`,
    `- collection_task_count: ${fieldGuide.feedback_collection_review_summary.task_count ?? 'missing'}`,
    `- collection_distinct_target_count: ${fieldGuide.feedback_collection_review_summary.distinct_target_count ?? 'missing'}`,
    `- collection_coverage_gate: ${fieldGuide.feedback_collection_review_summary.coverage_gate_decision ?? 'missing'}`,
    `- collection_matched_task_count: ${fieldGuide.feedback_collection_review_summary.matched_task_count ?? 'missing'}`,
    `- collection_confirmed_task_count: ${fieldGuide.feedback_collection_review_summary.confirmed_task_count ?? 'missing'}`,
    `- collection_unconfirmed_task_ids: ${fieldGuide.feedback_collection_review_summary.unconfirmed_task_ids.join(',') || 'none'}`,
    `- collection_failed_checks: ${fieldGuide.feedback_collection_review_summary.first_unconfirmed_failed_checks.join(',') || 'none'}`
  ].join('\n');
  const operatorFields = fieldGuide.operator_confirmation_required_fields
    .map((item) => `- \`${item.field_path}\`: ${item.required_action}`)
    .join('\n');
  const taskRows = fieldGuide.window_task_map.length
    ? fieldGuide.window_task_map
      .map((task) => `| ${task.slot_index} | ${task.decision_template_record_pointer} | ${task.window_id} | ${task.target_person_id} | ${task.target_display_name_hint ?? ''} | ${task.dock_status_text ?? ''} |`)
      .join('\n')
    : '| - | - | - | - | - | - |';
  const specialReviewFields = fieldGuide.human_special_review_required_fields
    .map((item) => `- \`${item.field_path}\`: ${item.required_action}`)
    .join('\n');
  const afterCommands = fieldGuide.after_template_completion
    .map((item) => `- ${item}`)
    .join('\n');
  return `## Human Review Field Guide

### 低延迟事件流复核

### Evidence Review Summary

${evidenceReviewSummary}

- current_gate_decision: ${fieldGuide.low_latency_event_stream_review.current_gate_decision ?? 'missing'}
- expected_gate_decision: ${fieldGuide.low_latency_event_stream_review.expected_gate_decision}
- thresholds: dispatch=${fieldGuide.low_latency_event_stream_review.observed_thresholds.target_dispatch_latency_ms ?? 'missing'}ms, debounce=${fieldGuide.low_latency_event_stream_review.observed_thresholds.debounce_ms ?? 'missing'}ms, fallback=${fieldGuide.low_latency_event_stream_review.observed_thresholds.fallback_poll_interval_ms ?? 'missing'}ms
- must_remain: ${fieldGuide.low_latency_event_stream_review.must_remain.join('; ')}

### 全局确认字段

${operatorFields}

### 窗口任务到模板行映射

| slot | template row | window | target_person_id | target hint | dock status |
| --- | --- | --- | --- | --- | --- |
${taskRows}

每一行必须人工核对真实窗口、目标绑定、状态路径、prompt-only、未发送和隐私边界，再修改对应的 \`feedback_batch.window_feedback_records[*]\`。

### 最终专项审查字段

${specialReviewFields}

### 模板填写后执行

${afterCommands}
`;
}

function renderMarkdown(pack) {
  const checks = pack.checks
    .map((item) => `- ${item.status.toUpperCase()} ${item.check_id}: ${(item.evidence ?? []).join('; ')}`)
    .join('\n');
  const actions = pack.review_actions
    .map((action) => [
      `### ${action.action_id}`,
      '',
      `- status: ${action.status}`,
      `- owner: ${action.owner}`,
      action.artifact_path ? `- artifact_path: ${action.artifact_path}` : null,
      action.command_after_completion ? `- command_after_completion: \`${action.command_after_completion}\`` : null,
      '',
      ...action.instructions.map((item) => `- ${item}`)
    ].filter(Boolean).join('\n'))
    .join('\n\n');
  const commands = pack.next_commands.map((item) => `- ${item}`).join('\n');
  const failures = pack.required_failures.length
    ? pack.required_failures.map((item) => `- ${item}`).join('\n')
    : '- none';
  return `# PT-028 Final Special Review Pack

- review_pack_id: ${pack.review_pack_id}
- gate_decision: ${pack.gate_decision}
- ready_for_human_special_review: ${pack.ready_for_human_special_review}
- decision_template_path: ${pack.review_scope.decision_template_path ?? 'missing'}
- target_feedback_path: ${pack.review_scope.target_feedback_path ?? 'missing'}
- real_execution_allowed: ${pack.real_execution_allowed}
- real_send_attempted: ${pack.real_send_attempted}
- writes_real_feedback_target: ${pack.writes_real_feedback_target}

## Evidence Summary

- decision_pack_gate: ${pack.evidence_summary.decision_pack_gate ?? 'missing'}
- collection_session_gate: ${pack.evidence_summary.collection_session_gate ?? 'missing'}
- event_stream_health_gate: ${pack.evidence_summary.event_stream_health_gate ?? 'missing'}
- finalization_gate: ${pack.evidence_summary.finalization_gate ?? 'missing'}
- acceptance_chain_gate: ${pack.evidence_summary.acceptance_chain_gate ?? 'missing'}
- collection_task_count: ${pack.evidence_summary.collection_task_count}
- collection_distinct_target_count: ${pack.evidence_summary.collection_distinct_target_count}
- event_stream_input_mode: ${pack.evidence_summary.event_stream_input_mode ?? 'missing'}
- event_stream_event_count: ${pack.evidence_summary.event_stream_event_count ?? 'missing'}
- event_stream_window_count: ${pack.evidence_summary.event_stream_window_count ?? 'missing'}
- event_stream_target_count: ${pack.evidence_summary.event_stream_target_count ?? 'missing'}
- event_stream_ipc_channel: ${pack.evidence_summary.event_stream_ipc_channel ?? 'missing'}
- event_stream_health_latency_ms: ${pack.evidence_summary.event_stream_health_latency_ms ?? 'missing'}
- event_stream_prompt_only_boundary_preserved: ${pack.evidence_summary.event_stream_prompt_only_boundary_preserved}
- coverage_matched_task_count: ${pack.evidence_summary.coverage_matched_task_count ?? 'missing'}
- coverage_confirmed_task_count: ${pack.evidence_summary.coverage_confirmed_task_count ?? 'missing'}
- coverage_unconfirmed_task_ids: ${(pack.evidence_summary.coverage_unconfirmed_task_ids ?? []).join(',') || 'none'}
- target_feedback_exists: ${pack.evidence_summary.target_feedback_exists}

## Checks

${checks}

## Required Failures

${failures}

${renderFieldGuideMarkdown(pack.human_review_field_guide)}

## Review Actions

${actions}

## Next Commands

${commands}

## Boundary

- This review pack is read-only.
- It never sends messages.
- It never writes the real feedback target file.
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

function renderHtml(pack) {
  const checks = pack.checks
    .map((item) => `<li><strong>${escapeHtml(item.status)}</strong> ${escapeHtml(item.check_id)}<br><small>${escapeHtml((item.evidence ?? []).join('; '))}</small></li>`)
    .join('');
  const actions = pack.review_actions
    .map((action) => `<section><h2>${escapeHtml(action.action_id)}</h2><p>Status: ${escapeHtml(action.status)} · Owner: ${escapeHtml(action.owner)}</p>${action.artifact_path ? `<p>Artifact: <code>${escapeHtml(action.artifact_path)}</code></p>` : ''}${action.command_after_completion ? `<p>Command: <code>${escapeHtml(action.command_after_completion)}</code></p>` : ''}<ul>${action.instructions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`)
    .join('');
  const commands = pack.next_commands.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join('');
  const fieldGuideRows = pack.human_review_field_guide.window_task_map.length
    ? pack.human_review_field_guide.window_task_map
      .map((task) => `<tr><td>${escapeHtml(task.slot_index)}</td><td><code>${escapeHtml(task.decision_template_record_pointer)}</code></td><td>${escapeHtml(task.window_id)}</td><td>${escapeHtml(task.target_person_id)}</td><td>${escapeHtml(task.target_display_name_hint)}</td><td>${escapeHtml(task.dock_status_text)}</td></tr>`)
      .join('')
    : '<tr><td colspan="6">No window tasks</td></tr>';
  const operatorFields = pack.human_review_field_guide.operator_confirmation_required_fields
    .map((item) => `<li><code>${escapeHtml(item.field_path)}</code>: ${escapeHtml(item.required_action)}</li>`)
    .join('');
  const specialReviewFields = pack.human_review_field_guide.human_special_review_required_fields
    .map((item) => `<li><code>${escapeHtml(item.field_path)}</code>: ${escapeHtml(item.required_action)}</li>`)
    .join('');
  const afterCommands = pack.human_review_field_guide.after_template_completion
    .map((item) => `<li><code>${escapeHtml(item)}</code></li>`)
    .join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>PT-028 Final Special Review Pack</title>
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; margin: 32px; line-height: 1.55; color: #18202a; }
    code { background: #f2f4f7; padding: 2px 5px; border-radius: 4px; }
    .status { padding: 12px 16px; border: 1px solid #d0d7de; border-radius: 6px; background: #f8fafc; }
    section { border-top: 1px solid #d8dee4; margin-top: 18px; padding-top: 12px; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; }
    th, td { border: 1px solid #d0d7de; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f6f8fa; }
  </style>
</head>
<body>
  <h1>PT-028 Final Special Review Pack</h1>
  <div class="status">
    <div>review_pack_id: <code>${escapeHtml(pack.review_pack_id)}</code></div>
    <div>gate_decision: <code>${escapeHtml(pack.gate_decision)}</code></div>
    <div>ready_for_human_special_review: <code>${escapeHtml(pack.ready_for_human_special_review)}</code></div>
    <div>real_execution_allowed: <code>${escapeHtml(pack.real_execution_allowed)}</code></div>
    <div>real_send_attempted: <code>${escapeHtml(pack.real_send_attempted)}</code></div>
    <div>writes_real_feedback_target: <code>${escapeHtml(pack.writes_real_feedback_target)}</code></div>
  </div>
  <section>
    <h2>Evidence Summary</h2>
    <ul>
      <li>decision_pack_gate: ${escapeHtml(pack.evidence_summary.decision_pack_gate)}</li>
      <li>collection_session_gate: ${escapeHtml(pack.evidence_summary.collection_session_gate)}</li>
      <li>event_stream_health_gate: ${escapeHtml(pack.evidence_summary.event_stream_health_gate)}</li>
      <li>finalization_gate: ${escapeHtml(pack.evidence_summary.finalization_gate)}</li>
      <li>acceptance_chain_gate: ${escapeHtml(pack.evidence_summary.acceptance_chain_gate)}</li>
      <li>collection_task_count: ${escapeHtml(pack.evidence_summary.collection_task_count)}</li>
      <li>collection_distinct_target_count: ${escapeHtml(pack.evidence_summary.collection_distinct_target_count)}</li>
      <li>event_stream_input_mode: ${escapeHtml(pack.evidence_summary.event_stream_input_mode)}</li>
      <li>event_stream_event_count: ${escapeHtml(pack.evidence_summary.event_stream_event_count)}</li>
      <li>event_stream_window_count: ${escapeHtml(pack.evidence_summary.event_stream_window_count)}</li>
      <li>event_stream_target_count: ${escapeHtml(pack.evidence_summary.event_stream_target_count)}</li>
      <li>event_stream_ipc_channel: ${escapeHtml(pack.evidence_summary.event_stream_ipc_channel)}</li>
      <li>event_stream_health_latency_ms: ${escapeHtml(pack.evidence_summary.event_stream_health_latency_ms)}</li>
      <li>event_stream_prompt_only_boundary_preserved: ${escapeHtml(pack.evidence_summary.event_stream_prompt_only_boundary_preserved)}</li>
      <li>coverage_matched_task_count: ${escapeHtml(pack.evidence_summary.coverage_matched_task_count)}</li>
      <li>coverage_confirmed_task_count: ${escapeHtml(pack.evidence_summary.coverage_confirmed_task_count)}</li>
      <li>coverage_unconfirmed_task_ids: ${escapeHtml((pack.evidence_summary.coverage_unconfirmed_task_ids ?? []).join(',') || 'none')}</li>
    </ul>
  </section>
  <section><h2>Checks</h2><ul>${checks}</ul></section>
  <section>
    <h2>Human Review Field Guide</h2>
    <p>Event stream summary: input <code>${escapeHtml(pack.human_review_field_guide.event_stream_review_summary.input_mode)}</code>; events/windows/targets <code>${escapeHtml(pack.human_review_field_guide.event_stream_review_summary.event_count)}/${escapeHtml(pack.human_review_field_guide.event_stream_review_summary.unique_window_count)}/${escapeHtml(pack.human_review_field_guide.event_stream_review_summary.unique_target_count)}</code>; IPC <code>${escapeHtml(pack.human_review_field_guide.event_stream_review_summary.ipc_channel)}</code>; dispatch <code>${escapeHtml(pack.human_review_field_guide.event_stream_review_summary.target_dispatch_latency_ms)}ms</code>; prompt-only <code>${escapeHtml(pack.human_review_field_guide.event_stream_review_summary.prompt_only_boundary_preserved)}</code>.</p>
    <p>Feedback collection summary: session <code>${escapeHtml(pack.human_review_field_guide.feedback_collection_review_summary.session_gate_decision)}</code>; coverage <code>${escapeHtml(pack.human_review_field_guide.feedback_collection_review_summary.coverage_gate_decision)}</code>; tasks/targets <code>${escapeHtml(pack.human_review_field_guide.feedback_collection_review_summary.task_count)}/${escapeHtml(pack.human_review_field_guide.feedback_collection_review_summary.distinct_target_count)}</code>; confirmed <code>${escapeHtml(pack.human_review_field_guide.feedback_collection_review_summary.confirmed_task_count)}</code>; unconfirmed <code>${escapeHtml((pack.human_review_field_guide.feedback_collection_review_summary.unconfirmed_task_ids ?? []).join(',') || 'none')}</code>.</p>
    <p>低延迟事件流: <code>${escapeHtml(pack.human_review_field_guide.low_latency_event_stream_review.current_gate_decision)}</code>; dispatch <code>${escapeHtml(pack.human_review_field_guide.low_latency_event_stream_review.observed_thresholds.target_dispatch_latency_ms)}ms</code>, debounce <code>${escapeHtml(pack.human_review_field_guide.low_latency_event_stream_review.observed_thresholds.debounce_ms)}ms</code>, fallback <code>${escapeHtml(pack.human_review_field_guide.low_latency_event_stream_review.observed_thresholds.fallback_poll_interval_ms)}ms</code>.</p>
    <h3>全局确认字段</h3>
    <ul>${operatorFields}</ul>
    <h3>窗口任务到模板行映射</h3>
    <table>
      <thead><tr><th>slot</th><th>template row</th><th>window</th><th>target_person_id</th><th>target hint</th><th>dock status</th></tr></thead>
      <tbody>${fieldGuideRows}</tbody>
    </table>
    <h3>最终专项审查字段</h3>
    <ul>${specialReviewFields}</ul>
    <h3>模板填写后执行</h3>
    <ol>${afterCommands}</ol>
  </section>
  ${actions}
  <section><h2>Next Commands</h2><ol>${commands}</ol></section>
</body>
</html>
`;
}

const root = path.resolve(argValue('root', process.cwd()));
const decisionPackPath = resolveInputPath(root, argValue('decision-pack', defaultPath(root, 'pt028-final-feedback-decision-packs')));
const sessionPath = resolveInputPath(root, argValue('session', defaultPath(root, 'pt028-feedback-collection-sessions')));
const healthPath = resolveInputPath(root, argValue('health', defaultPath(root, 'pt028-event-stream-health')));
const finalizationPath = resolveInputPath(root, argValue('finalization', defaultPath(root, 'pt028-real-feedback-finalizations')));
const acceptanceChainPath = resolveInputPath(root, argValue('acceptance-chain', defaultPath(root, 'pt028-acceptance-chains')));
const coveragePath = resolveInputPath(root, argValue('coverage', defaultPath(root, 'pt028-feedback-collection-coverages')));

const decisionPack = readJsonIfExists(decisionPackPath);
const session = readJsonIfExists(sessionPath);
const health = readJsonIfExists(healthPath);
const finalization = readJsonIfExists(finalizationPath);
const acceptanceChain = readJsonIfExists(acceptanceChainPath);
const coverage = readJsonIfExists(coveragePath);
const decisionTemplatePath = decisionPack?.artifact_refs?.confirmation_decision_template_path ?? session?.linked_pack?.decision_template_path ?? null;
const targetFeedbackPath = decisionPack?.target_feedback_path ?? session?.linked_pack?.target_feedback_path ?? 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json';
const targetFeedbackAbsolutePath = resolveInputPath(root, targetFeedbackPath);
const collectionScope = session?.collection_scope ?? {};
const eventStreamReviewSummary = buildEventStreamReviewSummary(health);
const feedbackCollectionReviewSummary = buildFeedbackCollectionReviewSummary({ session, coverage });

const checks = [
  check({
    checkId: 'final_feedback_decision_pack_present',
    status: decisionPack?.schema_version === 'pt028_final_feedback_decision_pack.v1'
      && decisionPack?.writes_real_feedback_target === false
      && decisionPack?.real_send_attempted === false,
    evidence: [
      `path=${relativeToRoot(root, decisionPackPath)}`,
      `schema=${decisionPack?.schema_version ?? 'missing'}`,
      `writes_real_feedback_target=${decisionPack?.writes_real_feedback_target}`,
      `real_send_attempted=${decisionPack?.real_send_attempted}`
    ]
  }),
  check({
    checkId: 'collection_session_ready',
    status: session?.schema_version === 'pt028_feedback_collection_session.v1'
      && session?.ready_for_operator_feedback_collection === true
      && (session?.required_failures ?? []).length === 0
      && Number(collectionScope.task_count ?? 0) >= 2
      && Number(collectionScope.distinct_target_count ?? 0) >= 2,
    evidence: [
      `path=${relativeToRoot(root, sessionPath)}`,
      `gate=${session?.gate_decision ?? 'missing'}`,
      `task_count=${collectionScope.task_count ?? 'missing'}`,
      `distinct_target_count=${collectionScope.distinct_target_count ?? 'missing'}`
    ]
  }),
  check({
    checkId: 'event_stream_health_ready',
    status: health?.schema_version === 'pt028_event_stream_health.v1'
      && health?.gate_decision === 'event_stream_ready_for_low_latency_gui_subscription'
      && (health?.required_failures ?? []).length === 0
      && health?.real_send_attempted === false
      && health?.writes_real_feedback_target === false,
    evidence: [
      `path=${relativeToRoot(root, healthPath)}`,
      `gate=${health?.gate_decision ?? 'missing'}`,
      `target_dispatch_latency_ms=${health?.stream_summary?.target_dispatch_latency_ms ?? 'missing'}`,
      `required_failures=${(health?.required_failures ?? []).join(',') || 'none'}`
    ]
  }),
  check({
    checkId: 'coverage_waits_for_human_confirmation',
    status: coverage?.schema_version === 'pt028_feedback_collection_coverage.v1'
      && coverage?.writes_real_feedback_target === false
      && coverage?.real_send_attempted === false
      && Number(coverage?.matched_task_count ?? 0) >= 2,
    required: false,
    evidence: [
      `path=${relativeToRoot(root, coveragePath)}`,
      `gate=${coverage?.gate_decision ?? 'missing'}`,
      `matched_task_count=${coverage?.matched_task_count ?? 'missing'}`,
      `confirmed_task_count=${coverage?.confirmed_task_count ?? 'missing'}`
    ]
  }),
  check({
    checkId: 'finalization_is_controlled_and_blocked_until_review',
    status: finalization?.schema_version === 'pt028_real_feedback_finalization.v1'
      && finalization?.real_send_attempted === false
      && finalization?.real_execution_allowed === false
      && (
        finalization?.writes_real_feedback_target === false
        || (
          finalization?.gate_decision === 'pt028_real_feedback_finalization_passed'
          && finalization?.target_feedback_exists === true
        )
      ),
    evidence: [
      `path=${relativeToRoot(root, finalizationPath)}`,
      `gate=${finalization?.gate_decision ?? 'missing'}`,
      `writes_real_feedback_target=${finalization?.writes_real_feedback_target}`,
      `target_feedback_exists=${finalization?.target_feedback_exists}`
    ]
  }),
  check({
    checkId: 'acceptance_chain_blocks_until_final_human_review',
    status: acceptanceChain?.schema_version === 'pt028_acceptance_chain.v1'
      && acceptanceChain?.real_send_attempted === false
      && acceptanceChain?.real_execution_allowed === false
      && (
        (acceptanceChain?.required_failures ?? []).includes('final_human_special_review')
        || (
          acceptanceChain?.gate_decision === 'pt028_acceptance_chain_passed'
          && acceptanceChain?.pt028_fully_accepted_for_production === true
        )
      ),
    evidence: [
      `path=${relativeToRoot(root, acceptanceChainPath)}`,
      `gate=${acceptanceChain?.gate_decision ?? 'missing'}`,
      `required_failures=${(acceptanceChain?.required_failures ?? []).join(',') || 'none'}`
    ]
  }),
  check({
    checkId: 'decision_template_contains_human_special_review_fields',
    status: Boolean(decisionTemplatePath)
      && existsSync(resolveInputPath(root, decisionTemplatePath) ?? '')
      && readFileSync(resolveInputPath(root, decisionTemplatePath), 'utf8').includes('human_special_review'),
    evidence: [
      `decision_template_path=${decisionTemplatePath ?? 'missing'}`,
      `exists=${decisionTemplatePath ? existsSync(resolveInputPath(root, decisionTemplatePath) ?? '') : false}`
    ]
  }),
  check({
    checkId: 'review_pack_does_not_write_or_send',
    status: !bool(decisionPack?.real_execution_allowed)
      && !bool(session?.real_execution_allowed)
      && !bool(health?.real_execution_allowed)
      && !bool(finalization?.real_execution_allowed)
      && !bool(acceptanceChain?.real_execution_allowed)
      && !bool(decisionPack?.real_send_attempted)
      && !bool(session?.real_send_attempted)
      && !bool(health?.real_send_attempted)
      && !bool(finalization?.real_send_attempted)
      && !bool(acceptanceChain?.real_send_attempted),
    evidence: [
      `target_feedback_path=${relativeToRoot(root, targetFeedbackAbsolutePath)}`,
      `target_feedback_exists=${targetFeedbackAbsolutePath ? existsSync(targetFeedbackAbsolutePath) : false}`,
      `all_sources_real_execution_allowed=false`,
      `all_sources_real_send_attempted=false`
    ]
  })
];
const requiredFailures = checks
  .filter((item) => item.required && item.status !== 'passed')
  .map((item) => item.check_id);
const reviewPackId = nowCompactId('pt028_final_special_review_pack');
const reviewPack = {
  schema_version: 'pt028_final_special_review_pack.v1',
  review_pack_id: reviewPackId,
  created_at: new Date().toISOString(),
  gate_decision: requiredFailures.length === 0
    ? 'ready_for_human_special_review'
    : 'final_special_review_pack_needs_attention',
  ready_for_human_special_review: requiredFailures.length === 0,
  real_execution_allowed: false,
  real_send_attempted: false,
  writes_real_feedback_target: false,
  source: {
    root,
    decision_pack_path: relativeToRoot(root, decisionPackPath),
    session_path: relativeToRoot(root, sessionPath),
    health_path: relativeToRoot(root, healthPath),
    coverage_path: relativeToRoot(root, coveragePath),
    finalization_path: relativeToRoot(root, finalizationPath),
    acceptance_chain_path: relativeToRoot(root, acceptanceChainPath)
  },
  review_scope: {
    requires_human_special_review: true,
    decision_template_path: decisionTemplatePath,
    target_feedback_path: targetFeedbackPath,
    finalization_command: commandWithDecision(decisionTemplatePath),
    real_sending_allowed: false
  },
  evidence_summary: {
    decision_pack_gate: decisionPack?.gate_decision ?? null,
    collection_session_gate: session?.gate_decision ?? null,
    collection_task_count: collectionScope.task_count ?? 0,
    collection_distinct_target_count: collectionScope.distinct_target_count ?? 0,
    event_stream_health_gate: health?.gate_decision ?? null,
    event_stream_input_mode: eventStreamReviewSummary.input_mode,
    event_stream_event_count: eventStreamReviewSummary.event_count,
    event_stream_window_count: eventStreamReviewSummary.unique_window_count,
    event_stream_target_count: eventStreamReviewSummary.unique_target_count,
    event_stream_ipc_channel: eventStreamReviewSummary.ipc_channel,
    event_stream_health_latency_ms: health?.stream_summary?.target_dispatch_latency_ms ?? null,
    event_stream_health_debounce_ms: health?.stream_summary?.debounce_ms ?? null,
    event_stream_health_fallback_poll_ms: health?.stream_summary?.fallback_poll_interval_ms ?? null,
    event_stream_prompt_only_boundary_preserved: eventStreamReviewSummary.prompt_only_boundary_preserved,
    coverage_gate: coverage?.gate_decision ?? null,
    coverage_matched_task_count: feedbackCollectionReviewSummary.matched_task_count,
    coverage_confirmed_task_count: feedbackCollectionReviewSummary.confirmed_task_count ?? 0,
    coverage_unconfirmed_task_ids: feedbackCollectionReviewSummary.unconfirmed_task_ids,
    coverage_first_unconfirmed_failed_checks: feedbackCollectionReviewSummary.first_unconfirmed_failed_checks,
    finalization_gate: finalization?.gate_decision ?? null,
    acceptance_chain_gate: acceptanceChain?.gate_decision ?? null,
    acceptance_chain_required_failures: acceptanceChain?.required_failures ?? [],
    target_feedback_exists: targetFeedbackAbsolutePath ? existsSync(targetFeedbackAbsolutePath) : false
  },
  human_review_field_guide: buildHumanReviewFieldGuide({
    decisionTemplatePath,
    targetFeedbackPath,
    session,
    health,
    coverage,
    acceptanceChain
  }),
  checks,
  required_failures: requiredFailures,
  warning_failures: [],
  review_actions: buildReviewActions({
    decisionTemplatePath,
    session,
    health
  }),
  next_commands: requiredFailures.length === 0
    ? [
      `Open ${session?.output_paths?.html_path ?? session?.output_paths?.markdown_path ?? '<collection-session-report>'}`,
      'npm.cmd run pt028:human-review-decision',
      'Edit the generated pt028-human-review-decision.real.template.json after human review.',
      'npm.cmd run pt028:human-review-decision -- --review=<filled-review-sheet.json> --check-only --fail-on-required',
      'npm.cmd run pt028:human-review-decision -- --review=<filled-review-sheet.json> --run-controlled-preflight',
      'npm.cmd run pt028:feedback-finalize -- --decision=<generated-decision-output-path>',
      'Do not enable real sending; keep prompt-only until the controlled send gate is separately approved.'
    ]
    : [
      'Run npm.cmd run pt028:feedback-decision-pack',
      'Run npm.cmd run pt028:feedback-handoff:validate',
      'Run npm.cmd run pt028:feedback-collection:session',
      'Run npm.cmd run pt028:event-stream -- --session=runtime/pt028-feedback-collection-sessions/latest.json',
      'Run npm.cmd run pt028:event-stream:health -- --fail-on-required',
      'Run npm.cmd run pt028:feedback-finalize'
    ],
  boundary_policy: {
    review_pack_is_read_only: true,
    real_feedback_target_writer: 'pt028:feedback-finalize -> confirm-pt028-real-feedback.mjs',
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: false
  }
};
const outputDir = argValue('output-dir')
  ? path.resolve(root, argValue('output-dir'))
  : path.join(root, 'runtime', 'pt028-final-special-review-packs', reviewPackId);
mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, 'pt028-final-special-review-pack.json');
const markdownPath = path.join(outputDir, 'pt028-final-special-review-pack.md');
const htmlPath = path.join(outputDir, 'pt028-final-special-review-pack.html');
const latestPath = path.join(root, 'runtime', 'pt028-final-special-review-packs', 'latest.json');
mkdirSync(path.dirname(latestPath), { recursive: true });
const packWithPaths = {
  ...reviewPack,
  output_paths: {
    json_path: jsonPath,
    markdown_path: markdownPath,
    html_path: htmlPath,
    latest_path: latestPath
  }
};
writeFileSync(jsonPath, `${JSON.stringify(packWithPaths, null, 2)}\n`, 'utf8');
writeFileSync(markdownPath, renderMarkdown(packWithPaths), 'utf8');
writeFileSync(htmlPath, renderHtml(packWithPaths), 'utf8');
writeFileSync(latestPath, `${JSON.stringify(packWithPaths, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  command: 'write-pt028-final-special-review-pack',
  review_pack_id: packWithPaths.review_pack_id,
  gate_decision: packWithPaths.gate_decision,
  ready_for_human_special_review: packWithPaths.ready_for_human_special_review,
  required_failures: packWithPaths.required_failures,
  decision_template_path: packWithPaths.review_scope.decision_template_path,
  event_stream_review_summary: packWithPaths.human_review_field_guide.event_stream_review_summary,
  feedback_collection_review_summary: packWithPaths.human_review_field_guide.feedback_collection_review_summary,
  target_feedback_exists: packWithPaths.evidence_summary.target_feedback_exists,
  real_execution_allowed: packWithPaths.real_execution_allowed,
  real_send_attempted: packWithPaths.real_send_attempted,
  writes_real_feedback_target: packWithPaths.writes_real_feedback_target,
  json_path: jsonPath,
  markdown_path: markdownPath,
  html_path: htmlPath,
  latest_path: latestPath
}, null, 2));
if (process.argv.includes('--fail-on-required') && requiredFailures.length > 0) {
  process.exitCode = 2;
}
