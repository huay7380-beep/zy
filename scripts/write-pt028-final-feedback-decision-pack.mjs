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

function resolveInputPath(root, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.resolve(root, maybePath);
}

function repoScript(name) {
  return path.resolve('scripts', name);
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
    ok: result.status === 0,
    stdout_json: parseJsonStdout(result.stdout),
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function readJsonIfExists(file) {
  if (!file || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function relativeToRoot(root, maybePath) {
  if (!maybePath) return null;
  const absolutePath = path.isAbsolute(maybePath) ? maybePath : path.resolve(root, maybePath);
  return path.relative(root, absolutePath).replace(/\\/g, '/');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function outputPathFromStdout(run, field) {
  return run.stdout_json?.[field] ?? null;
}

function requiredAction({ actionId, title, status, owner, artifactPath, fieldsToComplete = [], commandAfterCompletion = null, evidence = [] }) {
  return {
    action_id: actionId,
    title,
    status,
    owner,
    artifact_path: artifactPath,
    fields_to_complete: fieldsToComplete,
    command_after_completion: commandAfterCompletion,
    evidence
  };
}

function buildHumanActions({
  root,
  workpack,
  confirmation,
  confirmationPreflight,
  acceptanceChain,
  decisionTemplatePath,
  targetFeedbackPath,
  workpackMarkdownPath
}) {
  const chainFailures = acceptanceChain?.required_failures ?? [];
  const confirmationFailures = confirmation?.required_failures ?? [];
  const preflightFailures = confirmationPreflight?.required_failures ?? confirmationFailures;
  const targetExists = existsSync(targetFeedbackPath);
  const candidateCoverageReady = workpack?.candidate_target_coverage?.ready_for_multi_target_real_feedback_collection === true;
  const decisionReady = confirmation?.writes_real_feedback_target_allowed === true;
  const preflightReady = confirmationPreflight?.ready_for_controlled_target_write === true;
  const feedbackExists = acceptanceChain?.feedback_exists === true || targetExists;
  return [
    requiredAction({
      actionId: 'review_candidate_real_windows',
      title: '审查真实桌面窗口候选证据',
      status: candidateCoverageReady ? 'ready_for_operator_review' : 'needs_more_real_window_collection',
      owner: 'operator',
      artifactPath: relativeToRoot(root, workpackMarkdownPath ?? workpack?.artifacts?.workpack_markdown_path),
      fieldsToComplete: [
        '确认至少两个真实窗口来自真实人类联系人',
        '确认至少两个不同 target_person_id',
        '确认每个窗口仍为 prompt-only/no-send'
      ],
      evidence: [
        `candidate_unique_target_count=${workpack?.candidate_target_coverage?.observed_unique_target_count ?? 0}`,
        `candidate_ready=${candidateCoverageReady}`
      ]
    }),
    requiredAction({
      actionId: 'complete_confirmation_decision_template',
      title: '填写受控确认决策模板',
      status: decisionReady ? 'passed' : 'open',
      owner: 'operator_or_human_special_reviewer',
      artifactPath: relativeToRoot(root, decisionTemplatePath),
      fieldsToComplete: [
        'operator_confirmation.approved_to_write_real_feedback_target=true',
        'operator_confirmation.reviewer_id',
        'operator_confirmation.reviewed_at',
        'operator_confirmation.confirm_real_windows_observed=true',
        'operator_confirmation.confirm_target_binding=true',
        'operator_confirmation.confirm_prompt_only=true',
        'operator_confirmation.confirm_no_real_send=true',
        'operator_confirmation.confirm_privacy_boundary=true',
        'operator_confirmation.confirm_human_special_review=true',
        'feedback_batch.window_feedback_records[*].real_window_observed=true',
        'feedback_batch.window_feedback_records[*].state_target_verified=true',
        'feedback_batch.window_feedback_records[*].prompt_only_confirmed=true',
        'feedback_batch.window_feedback_records[*].no_real_send_attempted=true',
        'feedback_batch.window_feedback_records[*].privacy_boundary_confirmed=true',
        'feedback_batch.human_special_review.approved_for_final_special_acceptance=true'
      ],
      commandAfterCompletion: `npm.cmd run pt028:feedback-finalize -- --decision=${relativeToRoot(root, decisionTemplatePath)}`,
      evidence: confirmationFailures.map((failure) => `confirmation_open=${failure}`)
    }),
    requiredAction({
      actionId: 'preflight_confirmation_decision_template',
      title: 'Run safe confirmation preflight before target write',
      status: preflightReady ? 'passed' : 'open',
      owner: 'operator',
      artifactPath: relativeToRoot(root, confirmationPreflight?.output_paths?.markdown_path),
      fieldsToComplete: [
        'ready_for_controlled_target_write=true',
        'required_failures=[]',
        'writes_real_feedback_target=false'
      ],
      commandAfterCompletion: `npm.cmd run pt028:feedback-finalize -- --decision=${relativeToRoot(root, decisionTemplatePath)}`,
      evidence: preflightFailures.map((failure) => `preflight_open=${failure}`)
    }),
    requiredAction({
      actionId: 'write_real_feedback_target_through_confirmation_gate',
      title: '通过确认门写入真实反馈目标文件',
      status: targetExists ? 'passed' : 'open',
      owner: 'operator',
      artifactPath: relativeToRoot(root, targetFeedbackPath),
      fieldsToComplete: [
        '不得手工把模板当作完成证据',
        '必须先用 pt028:feedback-confirm:preflight 预检通过',
        '必须由 pt028:feedback-confirm 复核 readiness 后写入目标文件'
      ],
      commandAfterCompletion: `npm.cmd run pt028:feedback-finalize -- --decision=${relativeToRoot(root, decisionTemplatePath)}`,
      evidence: [
        `target_feedback_exists=${targetExists}`,
        `confirmation_gate=${confirmation?.gate_decision ?? 'unknown'}`
      ]
    }),
    requiredAction({
      actionId: 'rerun_acceptance_chain_with_feedback',
      title: '用真实反馈复跑最终验收链',
      status: feedbackExists && chainFailures.length === 0 ? 'passed' : 'open',
      owner: 'operator',
      artifactPath: relativeToRoot(root, acceptanceChain?.output_paths?.json_path),
      fieldsToComplete: [
        'feedback_bound_multi_window_event_stream 通过',
        'real_feedback_readiness_gate 通过',
        'real_feedback_calibration_evidence 通过',
        'final_human_special_review 通过'
      ],
      commandAfterCompletion: `npm.cmd run pt028:feedback-finalize -- --decision=${relativeToRoot(root, decisionTemplatePath)}`,
      evidence: chainFailures.map((failure) => `acceptance_open=${failure}`)
    }),
    requiredAction({
      actionId: 'keep_prompt_only_no_send_boundary',
      title: '保持 prompt-only 和 no-send 边界',
      status: 'passed',
      owner: 'system',
      artifactPath: null,
      fieldsToComplete: [],
      evidence: [
        'decision_pack_real_execution_allowed=false',
        'decision_pack_real_send_attempted=false',
        'this_command_writes_real_feedback_target=false'
      ]
    })
  ];
}

function renderMarkdown(pack) {
  const actions = pack.required_human_actions
    .map((action) => [
      `### ${action.action_id}`,
      '',
      `- 标题: ${action.title}`,
      `- 状态: ${action.status}`,
      `- 负责人: ${action.owner}`,
      `- 入口: ${action.artifact_path ?? '无需打开文件'}`,
      action.command_after_completion ? `- 完成后命令: \`${action.command_after_completion}\`` : null,
      '',
      action.fields_to_complete.length ? '需完成字段:' : '需完成字段: 无',
      ...action.fields_to_complete.map((field) => `- ${field}`),
      '',
      action.evidence.length ? '证据:' : '证据: 无',
      ...action.evidence.map((item) => `- ${item}`)
    ].filter((line) => line !== null).join('\n'))
    .join('\n\n');

  const failures = pack.current_acceptance_summary.required_failures
    .map((failure) => `- ${failure}`)
    .join('\n') || '- 无';

  return `# PT-028 Final Feedback Decision Pack

- pack_id: ${pack.pack_id}
- gate_decision: ${pack.gate_decision}
- feedback_exists: ${pack.current_acceptance_summary.feedback_exists}
- pt028_fully_accepted_for_production: ${pack.current_acceptance_summary.pt028_fully_accepted_for_production}
- real_execution_allowed: ${pack.real_execution_allowed}
- real_send_attempted: ${pack.real_send_attempted}
- writes_real_feedback_target: ${pack.writes_real_feedback_target}

## 当前验收缺口

${failures}

${renderWindowChecklistMarkdown(pack.operator_feedback_window_checklist)}

## 首要入口

- workpack: ${pack.artifact_refs.workpack_markdown_path ?? 'missing'}
- confirmation decision template: ${pack.artifact_refs.confirmation_decision_template_path ?? 'missing'}
- confirmation preflight: ${pack.artifact_refs.confirmation_preflight_markdown_path ?? 'missing'}
- acceptance chain: ${pack.artifact_refs.acceptance_chain_markdown_path ?? 'missing'}
- target feedback file: ${pack.target_feedback_path}

## 人工动作

${actions}

## 推荐复跑顺序

${pack.next_commands.map((command) => `- \`${command}\``).join('\n')}

## 边界

- 这个命令只生成决策包，不写真实反馈目标文件。
- 真实反馈目标文件只能在 \`pt028:feedback-confirm:preflight -- --decision=<decision.json>\` 预检通过后，由 \`pt028:feedback-confirm -- --decision=<decision.json>\` 在 readiness 通过后写入。
- 真实发送继续阻断。
`;
}

function buildHumanActionsV2({
  root,
  workpack,
  confirmation,
  confirmationPreflight,
  acceptanceChain,
  decisionTemplatePath,
  targetFeedbackPath,
  workpackMarkdownPath
}) {
  const chainFailures = acceptanceChain?.required_failures ?? [];
  const confirmationFailures = confirmation?.required_failures ?? [];
  const preflightFailures = confirmationPreflight?.required_failures ?? confirmationFailures;
  const targetExists = existsSync(targetFeedbackPath);
  const candidateCoverageReady = workpack?.candidate_target_coverage?.ready_for_multi_target_real_feedback_collection === true;
  const decisionReady = confirmation?.writes_real_feedback_target_allowed === true;
  const preflightReady = confirmationPreflight?.ready_for_controlled_target_write === true;
  const feedbackExists = acceptanceChain?.feedback_exists === true || targetExists;
  return [
    requiredAction({
      actionId: 'review_candidate_real_windows',
      title: '审查真实桌面窗口候选证据',
      status: candidateCoverageReady ? 'ready_for_operator_review' : 'needs_more_real_window_collection',
      owner: 'operator',
      artifactPath: relativeToRoot(root, workpackMarkdownPath ?? workpack?.artifacts?.workpack_markdown_path),
      fieldsToComplete: [
        '确认至少两个真实桌面窗口来自真实人类联系人',
        '确认至少两个不同 target_person_id',
        '确认每个窗口仍为 prompt-only/no-send'
      ],
      evidence: [
        `candidate_unique_target_count=${workpack?.candidate_target_coverage?.observed_unique_target_count ?? 0}`,
        `candidate_ready=${candidateCoverageReady}`
      ]
    }),
    requiredAction({
      actionId: 'complete_confirmation_decision_template',
      title: '填写受控确认决策模板',
      status: decisionReady ? 'passed' : 'open',
      owner: 'operator_or_human_special_reviewer',
      artifactPath: relativeToRoot(root, decisionTemplatePath),
      fieldsToComplete: [
        'operator_confirmation.approved_to_write_real_feedback_target=true',
        'operator_confirmation.reviewer_id',
        'operator_confirmation.reviewed_at',
        'operator_confirmation.confirm_real_windows_observed=true',
        'operator_confirmation.confirm_target_binding=true',
        'operator_confirmation.confirm_prompt_only=true',
        'operator_confirmation.confirm_no_real_send=true',
        'operator_confirmation.confirm_privacy_boundary=true',
        'operator_confirmation.confirm_human_special_review=true',
        'feedback_batch.window_feedback_records[*].real_window_observed=true',
        'feedback_batch.window_feedback_records[*].state_target_verified=true',
        'feedback_batch.window_feedback_records[*].prompt_only_confirmed=true',
        'feedback_batch.window_feedback_records[*].no_real_send_attempted=true',
        'feedback_batch.window_feedback_records[*].privacy_boundary_confirmed=true',
        'feedback_batch.human_special_review.approved_for_final_special_acceptance=true'
      ],
      commandAfterCompletion: `npm.cmd run pt028:feedback-finalize -- --decision=${relativeToRoot(root, decisionTemplatePath)}`,
      evidence: confirmationFailures.map((failure) => `confirmation_open=${failure}`)
    }),
    requiredAction({
      actionId: 'preflight_confirmation_decision_template',
      title: '运行确认模板安全预检',
      status: preflightReady ? 'passed' : 'open',
      owner: 'operator',
      artifactPath: relativeToRoot(root, confirmationPreflight?.output_paths?.markdown_path),
      fieldsToComplete: [
        'ready_for_controlled_target_write=true',
        'required_failures=[]',
        'writes_real_feedback_target=false'
      ],
      commandAfterCompletion: `npm.cmd run pt028:feedback-confirm:preflight -- --decision=${relativeToRoot(root, decisionTemplatePath)}`,
      evidence: preflightFailures.map((failure) => `preflight_open=${failure}`)
    }),
    requiredAction({
      actionId: 'write_real_feedback_target_through_confirmation_gate',
      title: '通过确认门写入真实反馈目标文件',
      status: targetExists ? 'passed' : 'open',
      owner: 'operator',
      artifactPath: relativeToRoot(root, targetFeedbackPath),
      fieldsToComplete: [
        '不得手工把模板当作完成证据',
        '优先使用 pt028:feedback-finalize 统一执行 coverage、preflight、受控写入和最终验收',
        '底层写入仍必须由 pt028:feedback-confirm 在 readiness 通过后完成'
      ],
      commandAfterCompletion: `npm.cmd run pt028:feedback-finalize -- --decision=${relativeToRoot(root, decisionTemplatePath)}`,
      evidence: [
        `target_feedback_exists=${targetExists}`,
        `confirmation_gate=${confirmation?.gate_decision ?? 'unknown'}`
      ]
    }),
    requiredAction({
      actionId: 'rerun_acceptance_chain_with_feedback',
      title: '用真实反馈复跑最终验收链',
      status: feedbackExists && chainFailures.length === 0 ? 'passed' : 'open',
      owner: 'operator',
      artifactPath: relativeToRoot(root, acceptanceChain?.output_paths?.json_path),
      fieldsToComplete: [
        'feedback_bound_multi_window_event_stream 通过',
        'real_feedback_readiness_gate 通过',
        'real_feedback_calibration_evidence 通过',
        'final_human_special_review 通过'
      ],
      commandAfterCompletion: `npm.cmd run pt028:feedback-finalize -- --decision=${relativeToRoot(root, decisionTemplatePath)}`,
      evidence: chainFailures.map((failure) => `acceptance_open=${failure}`)
    }),
    requiredAction({
      actionId: 'keep_prompt_only_no_send_boundary',
      title: '保持 prompt-only 和 no-send 边界',
      status: 'passed',
      owner: 'system',
      artifactPath: null,
      fieldsToComplete: [],
      evidence: [
        'decision_pack_real_execution_allowed=false',
        'decision_pack_real_send_attempted=false',
        'this_command_writes_real_feedback_target=false'
      ]
    })
  ];
}

function defaultOperatorConfirmFields() {
  return [
    'real_window_observed',
    'state_target_verified',
    'prompt_only_confirmed',
    'no_real_send_attempted',
    'privacy_boundary_confirmed',
    'reviewed_at',
    'evidence_refs'
  ];
}

function buildOperatorFeedbackWindowChecklist({ root, workpack, workpackJsonPath }) {
  const tasks = workpack?.window_review_tasks ?? [];
  const records = workpack?.draft_feedback_batch?.window_feedback_records ?? [];
  const rowCount = Math.max(tasks.length, records.length);
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const task = tasks[index] ?? {};
    const record = records[index] ?? {};
    const confirmationStatus = {
      real_window_observed: record.real_window_observed === true,
      state_target_verified: record.state_target_verified === true,
      prompt_only_confirmed: record.prompt_only_confirmed === true,
      no_real_send_attempted: record.no_real_send_attempted === true,
      privacy_boundary_confirmed: record.privacy_boundary_confirmed === true,
      reviewed_at_present: Boolean(record.reviewed_at),
      evidence_refs_present: (record.evidence_refs ?? []).length > 0
    };
    const readyForTargetWrite = Object.values(confirmationStatus).every((value) => value === true);
    return {
      row_id: `operator_feedback_window_${String(index + 1).padStart(3, '0')}`,
      slot_index: task.slot_index ?? index + 1,
      task_id: task.task_id ?? null,
      required: task.required !== false,
      app_type: record.app_type ?? task.app_type ?? 'wechat',
      draft_record_pointer: task.draft_record_pointer ?? `draft.window_feedback_records[${index}]`,
      window_id: record.window_id ?? task.window_id_hint ?? null,
      target_person_id: record.target_person_id ?? task.target_person_id_hint ?? null,
      target_display_name_hint: task.target_display_name_hint ?? null,
      state_path: record.state_path ?? task.state_path_hint ?? null,
      dock_status_text: task.dock_status_text_hint ?? null,
      send_gate_mode: task.send_gate_mode_hint ?? null,
      evidence_refs: record.evidence_refs ?? [],
      operator_must_confirm: task.operator_must_confirm ?? defaultOperatorConfirmFields(),
      confirmation_status: confirmationStatus,
      ready_for_real_feedback_target_write: readyForTargetWrite,
      candidate_prefill_only: true,
      notes: 'This row is a prefilled checklist item. Operator confirmation is still required before the real feedback target can be written.'
    };
  });
  return {
    schema_version: 'pt028_operator_feedback_window_checklist.v1',
    source_workpack_path: relativeToRoot(root, workpackJsonPath),
    required_window_count: 2,
    required_unique_target_count: workpack?.candidate_target_coverage?.required_unique_target_count ?? 2,
    observed_candidate_window_count: rows.length,
    observed_candidate_unique_target_count: workpack?.candidate_target_coverage?.observed_unique_target_count ?? 0,
    candidate_ready_for_operator_review: workpack?.candidate_target_coverage?.ready_for_multi_target_real_feedback_collection === true,
    rows,
    boundary_policy: {
      candidate_prefill_only: true,
      operator_confirmation_required: true,
      preflight_required_before_target_write: true,
      real_send_allowed: false
    }
  };
}

function summarizeConfirmationStatus(status) {
  if (!status) return 'missing';
  const open = Object.entries(status)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);
  return open.length ? `open: ${open.join(', ')}` : 'ready';
}

function renderWindowChecklistMarkdown(checklist) {
  if (!checklist?.rows?.length) return '## 窗口级反馈核对表\n\n- 无窗口级任务。';
  const rows = checklist.rows
    .map((row) => [
      `| ${row.slot_index}`,
      row.window_id ?? 'REPLACE_WITH_REAL_WINDOW_ID',
      row.target_person_id ?? 'REPLACE_WITH_TARGET_PERSON_ID',
      row.state_path ?? 'REPLACE_WITH_STATE_PATH',
      summarizeConfirmationStatus(row.confirmation_status),
      (row.evidence_refs ?? []).join('; ') || 'REPLACE_WITH_EVIDENCE_REFS',
      row.draft_record_pointer
    ].join(' | ') + ' |')
    .join('\n');
  return `## 窗口级反馈核对表

- source_workpack: ${checklist.source_workpack_path ?? 'missing'}
- candidate_ready_for_operator_review: ${checklist.candidate_ready_for_operator_review}
- observed_candidate_unique_target_count: ${checklist.observed_candidate_unique_target_count}/${checklist.required_unique_target_count}
- boundary: candidate prefill only; operator confirmation and preflight are still required.

| slot | window_id | target_person_id | state_path | confirmation_status | evidence_refs | draft_record |
| --- | --- | --- | --- | --- | --- | --- |
${rows}`;
}

function renderMarkdownV2(pack) {
  const actions = pack.required_human_actions
    .map((action) => [
      `### ${action.action_id}`,
      '',
      `- 标题: ${action.title}`,
      `- 状态: ${action.status}`,
      `- 负责人: ${action.owner}`,
      `- 入口: ${action.artifact_path ?? '无需打开文件'}`,
      action.command_after_completion ? `- 完成后命令: \`${action.command_after_completion}\`` : null,
      '',
      action.fields_to_complete.length ? '需完成字段:' : '需完成字段: 无',
      ...action.fields_to_complete.map((field) => `- ${field}`),
      '',
      action.evidence.length ? '证据:' : '证据: 无',
      ...action.evidence.map((item) => `- ${item}`)
    ].filter((line) => line !== null).join('\n'))
    .join('\n\n');

  const failures = pack.current_acceptance_summary.required_failures
    .map((failure) => `- ${failure}`)
    .join('\n') || '- 无';

  return `# PT-028 Final Feedback Decision Pack

- pack_id: ${pack.pack_id}
- gate_decision: ${pack.gate_decision}
- feedback_exists: ${pack.current_acceptance_summary.feedback_exists}
- pt028_fully_accepted_for_production: ${pack.current_acceptance_summary.pt028_fully_accepted_for_production}
- real_execution_allowed: ${pack.real_execution_allowed}
- real_send_attempted: ${pack.real_send_attempted}
- writes_real_feedback_target: ${pack.writes_real_feedback_target}
- html_path: ${pack.output_paths?.html_path ?? 'missing'}

## 当前验收缺口

${failures}

${renderWindowChecklistMarkdown(pack.operator_feedback_window_checklist)}

## 首要入口

- html report: ${pack.output_paths?.html_path ?? 'missing'}
- workpack: ${pack.artifact_refs.workpack_markdown_path ?? 'missing'}
- confirmation decision template: ${pack.artifact_refs.confirmation_decision_template_path ?? 'missing'}
- confirmation preflight: ${pack.artifact_refs.confirmation_preflight_markdown_path ?? 'missing'}
- acceptance chain: ${pack.artifact_refs.acceptance_chain_markdown_path ?? 'missing'}
- target feedback file: ${pack.target_feedback_path}

## 人工动作

${actions}

## 推荐复跑顺序

${pack.next_commands.map((command) => `- \`${command}\``).join('\n')}

## 边界

- 这个命令只生成决策包，不写真反馈目标文件。
- 推荐使用 \`pt028:feedback-finalize -- --decision=<decision.json>\` 一键执行 coverage、preflight、受控写入和最终验收；真实反馈目标文件仍只能由底层 \`pt028:feedback-confirm -- --decision=<decision.json>\` 在 readiness 通过后写入。
- 真实发送继续阻断。`;
}

function statusClass(status) {
  const normalized = String(status ?? 'unknown').toLowerCase();
  if (['passed', 'ready_for_operator_review', 'ready_for_controlled_target_write'].includes(normalized)) return 'good';
  if (['open', 'needs_more_real_window_collection', 'operator_feedback_decision_required'].includes(normalized)) return 'warn';
  if (normalized.includes('blocked') || normalized.includes('failed') || normalized.includes('attention')) return 'bad';
  return 'neutral';
}

function renderStatus(status) {
  return `<span class="pill ${statusClass(status)}">${escapeHtml(status)}</span>`;
}

function renderList(items, emptyText = '无') {
  if (!items?.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderPath(value) {
  return value ? `<code>${escapeHtml(value)}</code>` : '<span class="muted">missing</span>';
}

function renderCommand(command) {
  return command ? `<pre><code>${escapeHtml(command)}</code></pre>` : '<span class="muted">无</span>';
}

function renderHumanActionCards(pack) {
  return pack.required_human_actions
    .map((action, index) => `
      <article class="action">
        <div class="action-head">
          <span class="step">${index + 1}</span>
          <div>
            <h3>${escapeHtml(action.title)}</h3>
            <p class="muted">${escapeHtml(action.action_id)} · ${escapeHtml(action.owner)}</p>
          </div>
          ${renderStatus(action.status)}
        </div>
        <dl>
          <div><dt>入口文件</dt><dd>${renderPath(action.artifact_path)}</dd></div>
          <div><dt>完成后命令</dt><dd>${renderCommand(action.command_after_completion)}</dd></div>
          <div><dt>必填/必查</dt><dd>${renderList(action.fields_to_complete)}</dd></div>
          <div><dt>当前证据</dt><dd>${renderList(action.evidence)}</dd></div>
        </dl>
      </article>
    `)
    .join('');
}

function renderArtifactRows(pack) {
  return Object.entries(pack.artifact_refs ?? {})
    .map(([key, value]) => `
      <tr>
        <th scope="row">${escapeHtml(key)}</th>
        <td>${renderPath(value)}</td>
      </tr>
    `)
    .join('');
}

function renderWindowChecklistRows(checklist) {
  if (!checklist?.rows?.length) {
    return '<tr><td colspan="7">无窗口级任务</td></tr>';
  }
  return checklist.rows
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.slot_index)}</td>
        <td>${renderPath(row.window_id ?? 'REPLACE_WITH_REAL_WINDOW_ID')}</td>
        <td>${renderPath(row.target_person_id ?? 'REPLACE_WITH_TARGET_PERSON_ID')}</td>
        <td>${renderPath(row.state_path ?? 'REPLACE_WITH_STATE_PATH')}</td>
        <td>${escapeHtml(summarizeConfirmationStatus(row.confirmation_status))}</td>
        <td>${renderList(row.evidence_refs, 'REPLACE_WITH_EVIDENCE_REFS')}</td>
        <td>${renderPath(row.draft_record_pointer)}</td>
      </tr>
    `)
    .join('');
}

function renderHtml(pack) {
  const summary = pack.current_acceptance_summary ?? {};
  const preflight = pack.evidence_summary?.confirmation_preflight_gate_decision ?? 'missing';
  const coverage = pack.evidence_summary?.candidate_target_coverage ?? {};
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PT-028 最终反馈操作者入口</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #1f2937;
      --muted: #667085;
      --border: #d9e0e8;
      --accent: #235789;
      --good-bg: #e8f6ef;
      --good: #116149;
      --warn-bg: #fff3d8;
      --warn: #725200;
      --bad-bg: #fdecec;
      --bad: #9b2323;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.55 "Segoe UI", Arial, "Microsoft YaHei", sans-serif; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px 18px 44px; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: 8px; font-size: 28px; letter-spacing: 0; }
    h2 { margin: 24px 0 12px; font-size: 19px; letter-spacing: 0; }
    h3 { margin-bottom: 4px; font-size: 16px; letter-spacing: 0; }
    code { overflow-wrap: anywhere; word-break: break-word; font-family: Consolas, "Cascadia Mono", monospace; font-size: 12px; }
    pre { margin: 8px 0 0; padding: 10px; overflow-x: auto; background: #111827; color: #f9fafb; border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    th, td { padding: 10px 12px; border-top: 1px solid var(--border); text-align: left; vertical-align: top; }
    th { width: 280px; color: #374151; background: #f1f4f7; }
    ul { margin: 0; padding-left: 20px; }
    li { margin: 5px 0; }
    .muted { color: var(--muted); }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-top: 18px; }
    .metric, .panel, .action { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
    .metric span { display: block; color: var(--muted); font-size: 12px; margin-bottom: 6px; }
    .metric strong { display: block; overflow-wrap: anywhere; font-size: 16px; }
    .pill { display: inline-block; min-width: 76px; padding: 3px 8px; border-radius: 4px; font-weight: 700; text-align: center; }
    .pill.good { background: var(--good-bg); color: var(--good); }
    .pill.warn { background: var(--warn-bg); color: var(--warn); }
    .pill.bad { background: var(--bad-bg); color: var(--bad); }
    .pill.neutral { background: #eef2f7; color: #233044; }
    .warning { border-left: 4px solid var(--bad); background: #fffafa; }
    .actions { display: grid; gap: 12px; }
    .action-head { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; }
    .step { display: inline-grid; width: 28px; height: 28px; place-items: center; border-radius: 50%; background: var(--accent); color: #fff; font-weight: 700; }
    dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; margin: 12px 0 0; }
    dt { color: var(--muted); font-size: 12px; font-weight: 700; }
    dd { margin: 4px 0 0; }
    @media (max-width: 760px) {
      main { padding: 20px 12px 32px; }
      th, td { display: block; width: 100%; }
      .action-head { grid-template-columns: auto 1fr; }
      .action-head .pill { grid-column: 1 / -1; }
    }
  </style>
</head>
<body data-report-contract="pt028_final_feedback_decision_pack.v1">
  <main>
    <header>
      <h1>PT-028 最终反馈操作者入口</h1>
      <p class="muted">${escapeHtml(pack.pack_id)} · ${escapeHtml(pack.created_at)}</p>
      <section class="panel warning">
        <p><strong>当前结论：</strong>${escapeHtml(pack.gate_decision)}</p>
        <p>此入口只用于真实多窗口反馈收集和验收复跑，不写真实反馈目标文件，不触发真实发送。</p>
      </section>
    </header>

    <section class="summary" aria-label="决策包摘要">
      <div class="metric"><span>验收链</span><strong>${renderStatus(summary.gate_decision ?? 'missing')}</strong></div>
      <div class="metric"><span>真实反馈文件存在</span><strong>${escapeHtml(summary.feedback_exists)}</strong></div>
      <div class="metric"><span>生产验收完成</span><strong>${escapeHtml(summary.pt028_fully_accepted_for_production)}</strong></div>
      <div class="metric"><span>确认预检</span><strong>${renderStatus(preflight)}</strong></div>
      <div class="metric"><span>候选目标数</span><strong>${escapeHtml(coverage.observed_unique_target_count ?? 0)} / ${escapeHtml(coverage.required_unique_target_count ?? 2)}</strong></div>
      <div class="metric"><span>真实发送</span><strong>${escapeHtml(pack.real_send_attempted ? 'attempted' : 'blocked')}</strong></div>
    </section>

    <h2>当前验收缺口</h2>
    <section class="panel">${renderList(summary.required_failures, '无阻断项')}</section>

    <h2>窗口级反馈核对表</h2>
    <section class="panel">
      <p class="muted">这些行来自 workpack 的候选窗口和草稿反馈记录。它们只能预填信息，不能替代操作者对真实窗口、目标绑定、prompt-only/no-send 和隐私边界的确认。</p>
    </section>
    <table>
      <thead>
        <tr>
          <th>slot</th>
          <th>window_id</th>
          <th>target_person_id</th>
          <th>state_path</th>
          <th>confirmation_status</th>
          <th>evidence_refs</th>
          <th>draft_record</th>
        </tr>
      </thead>
      <tbody>${renderWindowChecklistRows(pack.operator_feedback_window_checklist)}</tbody>
    </table>

    <h2>推荐执行顺序</h2>
    <section class="panel">${renderList(pack.next_commands)}</section>

    <h2>人工动作</h2>
    <section class="actions">${renderHumanActionCards(pack)}</section>

    <h2>入口文件</h2>
    <table><tbody>${renderArtifactRows(pack)}</tbody></table>

    <h2>边界</h2>
    <section class="panel">
      <ul>
        <li>本报告和决策包只读，不写入 <code>${escapeHtml(pack.target_feedback_path)}</code>。</li>
        <li>真实反馈目标文件只能由 <code>${escapeHtml(pack.boundary_policy.real_feedback_target_writer)}</code> 在确认和 readiness 通过后写入。</li>
        <li>候选 observation 和候选 GUI state 不能替代人工确认。</li>
        <li>真实发送继续阻断，当前只允许 prompt-only 审查。</li>
      </ul>
    </section>
  </main>
</body>
</html>`;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/write-pt028-final-feedback-decision-pack.mjs [--root=<dir>] [--feedback=<file>] [--audit=<file>] [--output-dir=<dir>]',
    '',
    'Writes a consolidated operator-facing PT-028 final feedback decision pack.',
    'It refreshes workpack, confirmation template and acceptance chain evidence.',
    'It never writes the real feedback target and never sends messages.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve(argValue('root', process.cwd()));
  const packId = nowCompactId('pt028_final_feedback_decision_pack');
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : path.join(root, 'runtime', 'pt028-final-feedback-decision-packs', packId);
  const artifactsDir = path.join(outputDir, 'artifacts');
  mkdirSync(artifactsDir, { recursive: true });

  const explicitFeedbackPath = resolveInputPath(root, argValue('feedback'));
  const explicitAuditPath = resolveInputPath(root, argValue('audit'));
  const targetFeedbackPath = explicitFeedbackPath
    ?? path.join(root, 'runtime', 'user-inputs', 'pt028-real-multi-window-operator-feedback.real.json');

  const workpackRun = runNodeScript({
    script: 'write-pt028-real-feedback-workpack.mjs',
    args: [
      `--root=${root}`,
      `--output-dir=${path.join(artifactsDir, 'feedback-workpack')}`
    ]
  });
  const confirmationRun = runNodeScript({
    script: 'confirm-pt028-real-feedback.mjs',
    args: [
      `--root=${root}`,
      `--target=${targetFeedbackPath}`,
      `--output-dir=${path.join(artifactsDir, 'feedback-confirm-template')}`
    ]
  });
  const acceptanceArgs = [
    `--root=${root}`,
    `--output-dir=${path.join(artifactsDir, 'acceptance-chain')}`
  ];
  if (existsSync(targetFeedbackPath)) acceptanceArgs.push(`--feedback=${targetFeedbackPath}`);
  if (explicitAuditPath) acceptanceArgs.push(`--audit=${explicitAuditPath}`);
  const acceptanceRun = runNodeScript({
    script: 'run-pt028-acceptance-chain.mjs',
    args: acceptanceArgs
  });

  const workpack = readJsonIfExists(outputPathFromStdout(workpackRun, 'json_path'));
  const confirmation = readJsonIfExists(outputPathFromStdout(confirmationRun, 'json_path'));
  const acceptanceChain = readJsonIfExists(outputPathFromStdout(acceptanceRun, 'json_path'));
  const decisionTemplatePath = outputPathFromStdout(confirmationRun, 'decision_template_path');
  const preflightRun = decisionTemplatePath
    ? runNodeScript({
      script: 'preflight-pt028-real-feedback-confirmation.mjs',
      args: [
        `--root=${root}`,
        `--decision=${decisionTemplatePath}`,
        `--target=${targetFeedbackPath}`,
        `--output-dir=${path.join(artifactsDir, 'feedback-confirm-preflight')}`
      ]
    })
    : {
      script: 'preflight-pt028-real-feedback-confirmation.mjs',
      args: [],
      exit_status: 1,
      ok: false,
      stdout_json: null,
      stdout: '',
      stderr: 'confirmation decision template path missing'
    };
  const confirmationPreflight = readJsonIfExists(outputPathFromStdout(preflightRun, 'json_path'));
  const chainFailures = acceptanceChain?.required_failures ?? [];
  const commandFailures = [
    workpackRun.ok ? null : 'feedback_workpack_command_failed',
    confirmationRun.ok ? null : 'feedback_confirmation_template_command_failed',
    preflightRun.ok ? null : 'feedback_confirmation_preflight_command_failed',
    acceptanceRun.ok ? null : 'acceptance_chain_command_failed'
  ].filter(Boolean);
  const requiredFailures = [...commandFailures, ...chainFailures];
  const packGate = requiredFailures.length === 0 && acceptanceChain?.pt028_fully_accepted_for_production === true
    ? 'pt028_final_feedback_ready_for_production_acceptance'
    : 'operator_feedback_decision_required';

  const pack = {
    schema_version: 'pt028_final_feedback_decision_pack.v1',
    pack_id: packId,
    created_at: new Date().toISOString(),
    gate_decision: packGate,
    root,
    target_feedback_path: relativeToRoot(root, targetFeedbackPath),
    target_feedback_exists: existsSync(targetFeedbackPath),
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: false,
    target_write_allowed_by_this_command: false,
    current_acceptance_summary: {
      chain_id: acceptanceChain?.chain_id ?? null,
      gate_decision: acceptanceChain?.gate_decision ?? null,
      pt028_fully_accepted_for_production: acceptanceChain?.pt028_fully_accepted_for_production === true,
      feedback_exists: acceptanceChain?.feedback_exists === true || existsSync(targetFeedbackPath),
      final_acceptance_gate_decision: acceptanceChain?.final_acceptance_gate_decision ?? null,
      required_failures: requiredFailures
    },
    refreshed_command_results: {
      feedback_workpack: {
        ok: workpackRun.ok,
        exit_status: workpackRun.exit_status,
        json_path: relativeToRoot(root, outputPathFromStdout(workpackRun, 'json_path')),
        markdown_path: relativeToRoot(root, outputPathFromStdout(workpackRun, 'markdown_path'))
      },
      feedback_confirmation_template: {
        ok: confirmationRun.ok,
        exit_status: confirmationRun.exit_status,
        gate_decision: confirmationRun.stdout_json?.gate_decision ?? null,
        json_path: relativeToRoot(root, outputPathFromStdout(confirmationRun, 'json_path')),
        markdown_path: relativeToRoot(root, outputPathFromStdout(confirmationRun, 'markdown_path')),
        decision_template_path: relativeToRoot(root, decisionTemplatePath)
      },
      feedback_confirmation_preflight: {
        ok: preflightRun.ok,
        exit_status: preflightRun.exit_status,
        gate_decision: preflightRun.stdout_json?.gate_decision ?? null,
        ready_for_controlled_target_write: preflightRun.stdout_json?.ready_for_controlled_target_write === true,
        json_path: relativeToRoot(root, outputPathFromStdout(preflightRun, 'json_path')),
        markdown_path: relativeToRoot(root, outputPathFromStdout(preflightRun, 'markdown_path'))
      },
      acceptance_chain: {
        ok: acceptanceRun.ok,
        exit_status: acceptanceRun.exit_status,
        gate_decision: acceptanceRun.stdout_json?.gate_decision ?? null,
        json_path: relativeToRoot(root, outputPathFromStdout(acceptanceRun, 'json_path')),
        markdown_path: relativeToRoot(root, outputPathFromStdout(acceptanceRun, 'markdown_path'))
      }
    },
    artifact_refs: {
      workpack_json_path: relativeToRoot(root, outputPathFromStdout(workpackRun, 'json_path')),
      workpack_markdown_path: relativeToRoot(root, outputPathFromStdout(workpackRun, 'markdown_path')),
      draft_feedback_path: relativeToRoot(root, outputPathFromStdout(workpackRun, 'draft_feedback_path')),
      confirmation_json_path: relativeToRoot(root, outputPathFromStdout(confirmationRun, 'json_path')),
      confirmation_markdown_path: relativeToRoot(root, outputPathFromStdout(confirmationRun, 'markdown_path')),
      confirmation_decision_template_path: relativeToRoot(root, decisionTemplatePath),
      confirmation_preflight_json_path: relativeToRoot(root, outputPathFromStdout(preflightRun, 'json_path')),
      confirmation_preflight_markdown_path: relativeToRoot(root, outputPathFromStdout(preflightRun, 'markdown_path')),
      acceptance_chain_json_path: relativeToRoot(root, outputPathFromStdout(acceptanceRun, 'json_path')),
      acceptance_chain_markdown_path: relativeToRoot(root, outputPathFromStdout(acceptanceRun, 'markdown_path'))
    },
    evidence_summary: {
      candidate_target_coverage: workpack?.candidate_target_coverage ?? null,
      latest_dock_status_text: workpack?.evidence_summary?.latest_gui_state?.dock_status_text ?? null,
      latest_event_stream: workpack?.evidence_summary?.event_stream ?? null,
      confirmation_gate_decision: confirmation?.gate_decision ?? null,
      confirmation_required_failures: confirmation?.required_failures ?? [],
      confirmation_preflight_gate_decision: confirmationPreflight?.gate_decision ?? null,
      confirmation_preflight_required_failures: confirmationPreflight?.required_failures ?? [],
      acceptance_required_failures: chainFailures
    },
    operator_feedback_window_checklist: buildOperatorFeedbackWindowChecklist({
      root,
      workpack,
      workpackJsonPath: outputPathFromStdout(workpackRun, 'json_path')
    }),
    required_human_actions: buildHumanActionsV2({
      root,
      workpack,
      confirmation,
      confirmationPreflight,
      acceptanceChain,
      decisionTemplatePath,
      targetFeedbackPath,
      workpackMarkdownPath: outputPathFromStdout(workpackRun, 'markdown_path')
    }),
    next_commands: [
      `npm.cmd run pt028:feedback-finalize -- --decision=${relativeToRoot(root, decisionTemplatePath)}`,
      `npm.cmd run pt028:feedback-collection:coverage -- --decision=${relativeToRoot(root, decisionTemplatePath)}`,
      `npm.cmd run pt028:feedback-confirm:preflight -- --decision=${relativeToRoot(root, decisionTemplatePath)}`,
      `npm.cmd run pt028:feedback-confirm -- --decision=${relativeToRoot(root, decisionTemplatePath)}`,
      `npm.cmd run pt028:acceptance-chain -- --feedback=${relativeToRoot(root, targetFeedbackPath)}`,
      'npm.cmd run pt028:feedback-decision-pack',
      'npm.cmd run process-tree:validate'
    ],
    boundary_policy: {
      command_is_read_only_to_target_feedback_file: true,
      recommended_finalization_runner: 'pt028:feedback-finalize -- --decision=<decision.json>',
      real_feedback_target_writer: 'pt028:feedback-confirm -- --decision=<decision.json>',
      real_execution_allowed: false,
      real_send_attempted: false,
      candidate_observations_are_not_final_feedback: true
    }
  };

  const jsonPath = path.join(outputDir, 'pt028-final-feedback-decision-pack.json');
  const markdownPath = path.join(outputDir, 'pt028-final-feedback-decision-pack.md');
  const htmlPath = path.join(outputDir, 'pt028-final-feedback-decision-pack.html');
  const latestPath = path.join(root, 'runtime', 'pt028-final-feedback-decision-packs', 'latest.json');
  mkdirSync(path.dirname(latestPath), { recursive: true });
  const packWithPaths = {
    ...pack,
    output_paths: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      html_path: htmlPath,
      latest_path: latestPath
    }
  };
  writeFileSync(jsonPath, `${JSON.stringify(packWithPaths, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdownV2(packWithPaths), 'utf8');
  writeFileSync(htmlPath, renderHtml(packWithPaths), 'utf8');
  writeFileSync(latestPath, `${JSON.stringify(packWithPaths, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    command: 'write-pt028-final-feedback-decision-pack',
    pack_id: packWithPaths.pack_id,
    gate_decision: packWithPaths.gate_decision,
    target_feedback_exists: packWithPaths.target_feedback_exists,
    pt028_fully_accepted_for_production: packWithPaths.current_acceptance_summary.pt028_fully_accepted_for_production,
    required_failures: packWithPaths.current_acceptance_summary.required_failures,
    decision_template_path: packWithPaths.artifact_refs.confirmation_decision_template_path,
    real_execution_allowed: packWithPaths.real_execution_allowed,
    real_send_attempted: packWithPaths.real_send_attempted,
    writes_real_feedback_target: packWithPaths.writes_real_feedback_target,
    json_path: jsonPath,
    markdown_path: markdownPath,
    html_path: htmlPath,
    latest_path: latestPath
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && packWithPaths.current_acceptance_summary.required_failures.length > 0) {
    process.exitCode = 2;
  }
}
