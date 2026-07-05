import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDecisionRecommendation } from '../../decision-cluster/src/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function projectRoot() {
  return path.resolve(here, '../../..');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function nowIso() {
  return new Date().toISOString();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function createRuntimeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function loadTriggerKnowledge(root = projectRoot()) {
  return {
    triggerPolicies: readJson(path.join(root, 'knowledge/triggers/trigger-policies.json')),
    skills: readJson(path.join(root, 'knowledge/skills/skill-registry.json'))
  };
}

function findSkill(skills, skillId) {
  return skills.skills.find((skill) => skill.skill_id === skillId) ?? null;
}

function triggerPolicy(knowledge, triggerType) {
  return knowledge.triggerPolicies.trigger_types.find((item) => item.trigger_type === triggerType) ?? null;
}

function inferActivation(request, policy) {
  if (request.activation) {
    return {
      timezone: 'Asia/Shanghai',
      ...request.activation
    };
  }

  const mode = policy?.default_activation ?? 'immediate';
  return {
    mode,
    run_at: mode === 'immediate' ? nowIso() : null,
    recurrence: null,
    timezone: 'Asia/Shanghai'
  };
}

function inferTriggerGoal(request, routine = null) {
  if (routine?.suggested_goal && !request.goal_input?.initial_goal) {
    return {
      ...request.goal_input,
      initial_goal: routine.suggested_goal
    };
  }
  return request.goal_input;
}

function isAppointmentGoal(goalInput) {
  const goal = `${goalInput.initial_goal ?? ''}\n${goalInput.context_input ?? ''}`;
  return ['预约', '拜访', '见面', '会议', '评审', '约'].some((word) => goal.includes(word));
}

function buildSkillSteps({ request, decision, knowledge }) {
  const skills = knowledge.skills;
  const appointment = isAppointmentGoal(request.goal_input);
  const steps = [];

  const draftSkill = findSkill(skills, 'communication.message.draft');
  steps.push({
    step_id: 'step_draft_message',
    skill_id: draftSkill.skill_id,
    skill_name: draftSkill.name,
    layer: draftSkill.layer,
    status: draftSkill.status,
    dry_run: true,
    requires_user_confirmation: false,
    purpose: '生成与目标对象沟通的消息草稿',
    evidence_required: draftSkill.evidence_required,
    expected_output: '消息草稿和发送前检查点'
  });

  if (appointment) {
    const meetingSkill = findSkill(skills, 'human_process.meeting_path');
    steps.push({
      step_id: 'step_meeting_path',
      skill_id: meetingSkill.skill_id,
      skill_name: meetingSkill.name,
      layer: meetingSkill.layer,
      status: meetingSkill.status,
      dry_run: true,
      requires_user_confirmation: true,
      purpose: '设计拜访或预约流程，明确时间、目标、成功标准和备选方案',
      evidence_required: meetingSkill.evidence_required,
      expected_output: '预约流程计划'
    });
  }

  if ((request.user_preferences?.automation_comfort === 'high') || request.allow_platform_send === true) {
    const sendSkill = findSkill(skills, 'platform.message.send');
    steps.push({
      step_id: 'step_platform_send_preview',
      skill_id: sendSkill.skill_id,
      skill_name: sendSkill.name,
      layer: sendSkill.layer,
      status: sendSkill.status,
      dry_run: true,
      requires_user_confirmation: true,
      purpose: '用户确认后通过微信或其他社交平台发送消息',
      evidence_required: sendSkill.evidence_required,
      expected_output: '发送预览，不直接发送'
    });
  }

  if (appointment) {
    const calendarSkill = findSkill(skills, 'calendar.appointment.create');
    steps.push({
      step_id: 'step_calendar_appointment_preview',
      skill_id: calendarSkill.skill_id,
      skill_name: calendarSkill.name,
      layer: calendarSkill.layer,
      status: calendarSkill.status,
      dry_run: true,
      requires_user_confirmation: true,
      purpose: '预约完成后创建拜访或会议日程',
      evidence_required: calendarSkill.evidence_required,
      expected_output: '日程创建预览'
    });
  }

  const reminderSkill = findSkill(skills, 'reminder.create');
  steps.push({
    step_id: 'step_followup_reminder',
    skill_id: reminderSkill.skill_id,
    skill_name: reminderSkill.name,
    layer: reminderSkill.layer,
    status: reminderSkill.status,
    dry_run: true,
    requires_user_confirmation: true,
    purpose: '创建后续跟进提醒',
    evidence_required: reminderSkill.evidence_required,
    expected_output: '提醒计划'
  });

  const notificationSkill = findSkill(skills, 'notification.user.send');
  steps.push({
    step_id: 'step_notify_user',
    skill_id: notificationSkill.skill_id,
    skill_name: notificationSkill.name,
    layer: notificationSkill.layer,
    status: notificationSkill.status,
    dry_run: true,
    requires_user_confirmation: false,
    purpose: '预约状态变化或完成后通知使用者',
    evidence_required: notificationSkill.evidence_required,
    expected_output: '通知计划'
  });

  return steps.map((step, index) => ({
    order: index + 1,
    ...step,
    linked_decision_option: decision.recommended_option.option_id
  }));
}

function buildConfirmationGates(skillSteps, request, policy) {
  const gates = [];
  if (policy?.requires_user_confirmation) {
    gates.push({
      gate_id: 'gate_trigger_enable',
      reason: '该触发类型需要用户先启用。',
      required_before: 'activation'
    });
  }

  for (const step of skillSteps) {
    if (!step.requires_user_confirmation) continue;
    gates.push({
      gate_id: `gate_${step.step_id}`,
      reason: `${step.skill_name} 需要用户确认。`,
      required_before: step.step_id
    });
  }

  if (request.trigger_type !== 'user_initiated') {
    gates.push({
      gate_id: 'gate_auto_trigger_scope',
      reason: '非主动触发需要确认触发范围、频率和关闭方式。',
      required_before: 'schedule_enable'
    });
  }

  return gates;
}

function buildNotificationPlan(request, decision) {
  const channels = request.notification_preferences?.channels ?? ['in_app'];
  const notifyOn = request.notification_preferences?.notify_on ?? ['appointment_confirmed', 'send_failed', 'followup_due'];
  return {
    channels,
    notify_on: notifyOn,
    templates: {
      appointment_confirmed: '预约已确认：请查看时间、地点和下一步准备事项。',
      send_failed: '消息发送未完成：需要你手动处理或重新授权。',
      followup_due: '跟进时间到了：请查看上次决策和对方反馈。'
    },
    linked_decision_id: decision.decision_id,
    dry_run: true
  };
}

function buildManualExecutionChecklist({ request, decision, skillSteps, confirmationGates }) {
  const messageDraft = decision.recommended_option.message_draft;
  return [
    {
      item_id: 'confirm_goal_and_target',
      label: '确认目标和对象',
      required: true,
      status: 'pending_user_review',
      check: `目标=${request.goal_input.initial_goal ?? '未填写'}；对象=${messageDraft?.target_display_name ?? request.goal_input.primary_person_id ?? '未填写'}`
    },
    {
      item_id: 'review_message_draft',
      label: '确认低承诺草稿',
      required: true,
      status: 'pending_user_review',
      check: messageDraft?.draft ?? decision.recommended_option.description
    },
    {
      item_id: 'preview_platform_before_send',
      label: '只做平台预览，不直接发送',
      required: true,
      status: 'blocked_until_confirmation',
      check: '进入微信或其他平台测试页后，必须停在发送前预览。'
    },
    {
      item_id: 'confirm_required_gates',
      label: '逐项确认闸门',
      required: confirmationGates.length > 0,
      status: confirmationGates.length ? 'pending_user_review' : 'not_required',
      check: confirmationGates.map((gate) => gate.gate_id).join(', ') || '无额外确认闸门'
    },
    {
      item_id: 'record_feedback_after_action',
      label: '行动后记录反馈',
      required: true,
      status: 'pending_after_action',
      check: '记录是否执行、是否回复、目标推进度和用户评分。'
    }
  ].map((item, index) => ({
    order: index + 1,
    ...item,
    linked_step_ids: skillSteps
      .filter((step) => step.requires_user_confirmation || item.item_id === 'review_message_draft')
      .map((step) => step.step_id)
  }));
}

function buildEventWriteback(request, decision) {
  const appointment = isAppointmentGoal(request.goal_input);
  return {
    create_candidate_events: [
      appointment ? {
        event_type_code: 'business_meeting',
        event_level: 'P2',
        reason: '预约或拜访流程完成后可作为商务会议候选事件。',
        auto_confirm: false
      } : null,
      {
        event_type_code: 'invitation',
        event_level: 'P3',
        reason: '发送预约或邀约消息后可作为线索事件。',
        auto_confirm: false
      }
    ].filter(Boolean),
    linked_decision_id: decision.decision_id,
    requires_user_review: true
  };
}

export function buildAutomationPreview({
  triggerPlan,
  platform = 'wechat_web_test',
  target = {},
  messageDraft = null,
  operator = 'user'
} = {}) {
  if (!triggerPlan) {
    throw new Error('buildAutomationPreview requires triggerPlan');
  }

  const externalSteps = triggerPlan.skill_steps.filter((step) =>
    ['platform.message.send', 'calendar.appointment.create', 'reminder.create', 'notification.user.send'].includes(step.skill_id)
  );
  const confirmationChecklist = triggerPlan.confirmation_gates.map((gate) => ({
    gate_id: gate.gate_id,
    required_before: gate.required_before,
    status: 'pending_user_confirmation',
    reason: gate.reason
  }));
  const evidenceRequired = unique(
    triggerPlan.skill_steps.flatMap((step) => step.evidence_required ?? [])
  );

  return {
    preview_id: createRuntimeId('automation_preview'),
    mode: 'dry_run',
    platform,
    status: confirmationChecklist.length ? 'blocked_until_user_confirmation' : 'ready_for_manual_review',
    generated_at: nowIso(),
    operator,
    target: {
      person_id: triggerPlan.goal_input?.primary_person_id ?? null,
      display_name: target.display_name ?? null,
      platform_handle: target.platform_handle ?? null,
      channel: target.channel ?? triggerPlan.goal_input?.preferred_channel ?? 'unknown'
    },
    trigger_id: triggerPlan.trigger_id,
    decision_id: triggerPlan.decision_id,
    message_preview: {
      draft: messageDraft ?? triggerPlan.message_draft?.draft ?? triggerPlan.recommended_option?.description ?? '',
      editable: true,
      send_allowed: false,
      reason: '第一版自动化预览只展示动作，不执行真实发送。'
    },
    manual_execution_checklist: triggerPlan.manual_execution_checklist ?? [],
    executable_preview_steps: externalSteps.map((step, index) => ({
      order: index + 1,
      step_id: step.step_id,
      skill_id: step.skill_id,
      dry_run: true,
      would_do: step.expected_output,
      requires_user_confirmation: step.requires_user_confirmation,
      connector_status: step.status === 'implemented' ? 'local_only' : 'stub_not_connected'
    })),
    blocked_actions: [
      {
        action: 'send_message',
        blocked_until: 'user_confirmation_and_connector_authorization',
        reason: '不得在未确认、未授权、未审计时向目标对象发送消息。'
      },
      {
        action: 'create_external_calendar_event',
        blocked_until: 'user_confirmation_and_connector_authorization',
        reason: '不得在未确认时间、对象和平台权限时创建外部日程。'
      }
    ],
    confirmation_checklist: confirmationChecklist,
    evidence_required: evidenceRequired,
    notification_preview: {
      channels: triggerPlan.notification_plan.channels,
      notify_on: triggerPlan.notification_plan.notify_on,
      dry_run: true
    },
    audit_preview: {
      actor: operator,
      source: 'trigger_engine_automation_preview',
      linked_trigger_id: triggerPlan.trigger_id,
      linked_decision_id: triggerPlan.decision_id,
      write_required_before_real_execution: true
    }
  };
}

export function buildOutboundSendCommand({
  triggerPlan,
  automationPreview = null,
  eventId = null,
  targetPlatform = null,
  targetThreadHint = {},
  safetyChecks = {},
  requiresUserConfirmation = null,
  userConfirmed = false,
  realExecutionAllowed = false,
  sendCommandId = null,
  createdAt = nowIso(),
  metadata = {}
} = {}) {
  if (!triggerPlan) {
    throw new Error('buildOutboundSendCommand requires triggerPlan');
  }

  const messageDraft = triggerPlan.message_draft ?? triggerPlan.recommended_option?.message_draft;
  const draftText = nonEmpty(automationPreview?.message_preview?.draft)
    ?? nonEmpty(messageDraft?.draft)
    ?? nonEmpty(triggerPlan.recommended_option?.description);
  if (!draftText) {
    throw new Error('buildOutboundSendCommand requires message_draft');
  }

  const linkedEventId = nonEmpty(eventId) ?? nonEmpty(triggerPlan.source_event_id);
  if (!linkedEventId) {
    throw new Error('buildOutboundSendCommand requires eventId or triggerPlan.source_event_id');
  }

  const previewTarget = automationPreview?.target ?? {};
  const platform = nonEmpty(targetPlatform)
    ?? nonEmpty(automationPreview?.platform)
    ?? nonEmpty(messageDraft?.channel)
    ?? nonEmpty(triggerPlan.goal_input?.preferred_channel)
    ?? 'unknown';
  const targetPersonId = nonEmpty(previewTarget.person_id)
    ?? nonEmpty(messageDraft?.target_person_id)
    ?? nonEmpty(triggerPlan.goal_input?.primary_person_id)
    ?? null;
  const threadHint = {
    channel: nonEmpty(previewTarget.channel)
      ?? nonEmpty(messageDraft?.channel)
      ?? nonEmpty(triggerPlan.goal_input?.preferred_channel)
      ?? 'unknown',
    platform_handle: nonEmpty(previewTarget.platform_handle),
    target_display_name: nonEmpty(previewTarget.display_name) ?? nonEmpty(messageDraft?.target_display_name),
    automation_preview_id: nonEmpty(automationPreview?.preview_id),
    ...targetThreadHint
  };
  const mustConfirm = requiresUserConfirmation ?? (
    messageDraft?.must_confirm_before_send !== false
    || (triggerPlan.confirmation_gates?.length ?? 0) > 0
  );

  return {
    send_command_id: nonEmpty(sendCommandId) ?? createRuntimeId('send_command'),
    event_id: linkedEventId,
    decision_id: triggerPlan.decision_id,
    trigger_id: triggerPlan.trigger_id,
    target_platform: platform,
    target_person_id: targetPersonId,
    target_thread_hint: threadHint,
    message_draft: draftText,
    requires_user_confirmation: Boolean(mustConfirm),
    user_confirmed: Boolean(userConfirmed),
    real_execution_allowed: Boolean(realExecutionAllowed),
    safety_checks: {
      window_matches: false,
      thread_matches: false,
      draft_matches: false,
      permission_granted: false,
      notes: [
        'Generated from TriggerPlan; real send stays blocked until target, draft, permission and user confirmation are verified.'
      ],
      ...safetyChecks
    },
    created_at: createdAt,
    metadata: {
      generated_by: 'trigger-engine.buildOutboundSendCommand',
      dry_run_default: true,
      automation_preview_id: nonEmpty(automationPreview?.preview_id),
      ...metadata
    }
  };
}

function recoveryForFailure(reason) {
  const table = {
    test_page_unavailable: '先暂停平台自动化，检查测试页面、登录态或页面选择器。',
    preview_step_failed: '保留触发计划，定位失败步骤后只重跑自动化预览。',
    missing_target_handle: '补充目标对象的平台测试账号或联系人标识。',
    missing_message_draft: '先回到消息草稿步骤，补齐可编辑预览内容。'
  };
  return table[reason] ?? '保留 dry-run 结果，回到触发计划人工处理。';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeJsonForHtml(value) {
  return JSON.stringify(value, null, 2).replaceAll('<', '\\u003c');
}

export function runAutomationPreviewTrial({
  automationPreview,
  environment = {},
  operator = 'system'
} = {}) {
  if (!automationPreview) {
    throw new Error('runAutomationPreviewTrial requires automationPreview');
  }

  const env = {
    test_page_available: true,
    connector_authorized: false,
    user_confirmed_gate_ids: [],
    fail_step_ids: [],
    ...environment
  };
  const failedSteps = [];
  const warnings = [];

  if (!env.test_page_available) {
    failedSteps.push({
      step_id: 'open_test_page',
      reason: 'test_page_unavailable',
      recovery_action: recoveryForFailure('test_page_unavailable')
    });
  }

  if (!automationPreview.target.platform_handle) {
    warnings.push({
      reason: 'missing_target_handle',
      recovery_action: recoveryForFailure('missing_target_handle')
    });
  }

  if (!automationPreview.message_preview.draft) {
    failedSteps.push({
      step_id: 'render_message_preview',
      reason: 'missing_message_draft',
      recovery_action: recoveryForFailure('missing_message_draft')
    });
  }

  for (const step of automationPreview.executable_preview_steps) {
    if (!env.fail_step_ids.includes(step.step_id)) continue;
    failedSteps.push({
      step_id: step.step_id,
      skill_id: step.skill_id,
      reason: 'preview_step_failed',
      recovery_action: recoveryForFailure('preview_step_failed')
    });
  }

  const pendingConfirmations = automationPreview.confirmation_checklist
    .filter((gate) => !env.user_confirmed_gate_ids.includes(gate.gate_id))
    .map((gate) => gate.gate_id);
  const blockedBy = [
    ...pendingConfirmations.map((gateId) => ({
      type: 'user_confirmation',
      gate_id: gateId
    })),
    env.connector_authorized ? null : {
      type: 'connector_authorization',
      reason: '外部连接器尚未授权。'
    },
    ...automationPreview.blocked_actions.map((action) => ({
      type: 'blocked_action',
      action: action.action,
      reason: action.reason
    }))
  ].filter(Boolean);
  const previewReached = failedSteps.length === 0;

  return {
    trial_id: createRuntimeId('automation_trial'),
    preview_id: automationPreview.preview_id,
    mode: 'dry_run',
    operator,
    platform: automationPreview.platform,
    preview_reached: previewReached,
    status: previewReached
      ? blockedBy.length ? 'preview_reached_blocked_before_execution' : 'preview_reached_manual_review'
      : 'preview_failed',
    real_execution_allowed: false,
    checked_at: nowIso(),
    checked_steps: automationPreview.executable_preview_steps.map((step) => ({
      step_id: step.step_id,
      skill_id: step.skill_id,
      dry_run: true,
      status: failedSteps.some((failure) => failure.step_id === step.step_id) ? 'failed' : 'preview_ready'
    })),
    failed_steps: failedSteps,
    blocked_by: blockedBy,
    warnings,
    recovery_actions: unique([
      ...failedSteps.map((failure) => failure.recovery_action),
      ...warnings.map((warning) => warning.recovery_action),
      blockedBy.length ? '保持 dry-run，只允许用户查看和编辑预览，不执行真实发送。' : null
    ]),
    audit_event: {
      event_type: 'automation_preview_trial',
      result: previewReached ? 'preview_reached' : 'preview_failed',
      linked_preview_id: automationPreview.preview_id,
      linked_trigger_id: automationPreview.trigger_id,
      linked_decision_id: automationPreview.decision_id,
      real_execution_allowed: false
    }
  };
}

export function renderAutomationPreviewTestPage({
  automationPreview,
  previewTrial
} = {}) {
  if (!automationPreview) {
    throw new Error('renderAutomationPreviewTestPage requires automationPreview');
  }
  const trial = previewTrial ?? null;
  const pageState = {
    contract_version: 'automation_preview_test_page.v1',
    preview_id: automationPreview.preview_id,
    trial_id: trial?.trial_id ?? null,
    real_execution_allowed: false,
    send_allowed: false,
    pending_gate_ids: automationPreview.confirmation_checklist.map((gate) => gate.gate_id),
    failed_step_ids: (trial?.failed_steps ?? []).map((step) => step.step_id),
    recovery_actions: trial?.recovery_actions ?? []
  };
  const pageStateJson = safeJsonForHtml(pageState);
  const checklist = automationPreview.confirmation_checklist
    .map((gate) => `<li data-gate-id="${escapeHtml(gate.gate_id)}" data-gate-status="${escapeHtml(gate.status)}">${escapeHtml(gate.status)} / ${escapeHtml(gate.reason)} <button type="button" data-action="confirm_gate" data-gate-id="${escapeHtml(gate.gate_id)}">Confirm locally</button></li>`)
    .join('\n');
  const steps = automationPreview.executable_preview_steps
    .map((step) => `<li data-step-id="${escapeHtml(step.step_id)}">${escapeHtml(step.skill_id)} / ${escapeHtml(step.connector_status)}</li>`)
    .join('\n');
  const failures = (trial?.failed_steps ?? [])
    .map((step) => `<li data-failed-step="${escapeHtml(step.step_id)}">${escapeHtml(step.reason)}：${escapeHtml(step.recovery_action)}</li>`)
    .join('\n') || '<li data-failed-step="none">无失败步骤</li>';
  const blockedActions = automationPreview.blocked_actions
    .map((action) => `<li data-blocked-action="${escapeHtml(action.action)}">${escapeHtml(action.reason)}</li>`)
    .join('\n');
  const manualChecklist = (automationPreview.manual_execution_checklist ?? [])
    .map((item) => `<li data-manual-check="${escapeHtml(item.item_id)}" data-manual-status="${escapeHtml(item.status)}">${escapeHtml(item.label)}：${escapeHtml(item.check)}</li>`)
    .join('\n') || '<li data-manual-check="none">无人工确认项</li>';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Automation Preview Dry Run</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body data-contract-version="automation_preview_test_page.v1" data-preview-id="${escapeHtml(automationPreview.preview_id)}" data-trial-id="${escapeHtml(trial?.trial_id ?? '')}" data-real-execution-allowed="${trial?.real_execution_allowed === true ? 'true' : 'false'}">
  <main>
    <h1>Automation Preview Dry Run</h1>
    <section aria-label="target">
      <h2>Target</h2>
      <p data-target-person="${escapeHtml(automationPreview.target.person_id)}">${escapeHtml(automationPreview.target.display_name ?? automationPreview.target.person_id)}</p>
      <p data-target-channel="${escapeHtml(automationPreview.target.channel)}">${escapeHtml(automationPreview.target.platform_handle)}</p>
    </section>
    <section aria-label="message">
      <h2>Message Preview</h2>
      <textarea data-message-draft readonly>${escapeHtml(automationPreview.message_preview.draft)}</textarea>
      <button data-action="send_message" disabled>Send blocked in dry run</button>
    </section>
    <section aria-label="confirmation">
      <h2>Confirmation Checklist</h2>
      <ul>${checklist}</ul>
    </section>
    <section aria-label="manual-execution">
      <h2>Manual Execution Checklist</h2>
      <ol>${manualChecklist}</ol>
    </section>
    <section aria-label="steps">
      <h2>Executable Preview Steps</h2>
      <ol>${steps}</ol>
    </section>
    <section aria-label="blocked">
      <h2>Blocked Actions</h2>
      <ul>${blockedActions}</ul>
    </section>
    <section aria-label="trial">
      <h2>Trial Result</h2>
      <p data-preview-reached="${trial?.preview_reached === true ? 'true' : 'false'}">${escapeHtml(trial?.status ?? 'not_run')}</p>
      <ul>${failures}</ul>
    </section>
    <section aria-label="state">
      <h2>Page State</h2>
      <script type="application/json" id="automation-preview-state">${pageStateJson}</script>
      <pre data-page-state>${escapeHtml(pageStateJson)}</pre>
    </section>
  </main>
  <script>
    (() => {
      const stateEl = document.getElementById('automation-preview-state');
      const output = document.querySelector('[data-page-state]');
      const sendButton = document.querySelector('[data-action="send_message"]');
      const state = JSON.parse(stateEl.textContent);
      const render = () => {
        state.send_allowed = false;
        state.real_execution_allowed = false;
        output.textContent = JSON.stringify(state, null, 2);
        sendButton.disabled = true;
      };
      document.querySelectorAll('[data-action="confirm_gate"]').forEach((button) => {
        button.addEventListener('click', () => {
          const gateId = button.getAttribute('data-gate-id');
          state.pending_gate_ids = state.pending_gate_ids.filter((id) => id !== gateId);
          const row = document.querySelector('[data-gate-id="' + gateId + '"]');
          if (row) row.setAttribute('data-gate-status', 'confirmed_locally');
          render();
        });
      });
      render();
    })();
  </script>
</body>
</html>`;
}

export function inspectAutomationPreviewTestPage(html) {
  return {
    has_document: html.includes('<!doctype html>'),
    has_preview_id: /data-preview-id="[^"]+"/.test(html),
    send_button_disabled: /data-action="send_message" disabled/.test(html),
    real_execution_blocked: /data-real-execution-allowed="false"/.test(html),
    has_confirmation_checklist: html.includes('Confirmation Checklist'),
    has_trial_result: html.includes('Trial Result'),
    has_recovery_hint: html.includes('data-failed-step='),
    has_state_contract: html.includes('data-contract-version="automation_preview_test_page.v1"')
      && html.includes('id="automation-preview-state"'),
    has_confirm_controls: html.includes('data-action="confirm_gate"'),
    has_manual_execution_checklist: html.includes('Manual Execution Checklist')
      && html.includes('data-manual-check='),
    has_local_state_output: html.includes('data-page-state'),
    has_no_external_script: !/<script\s+src=/i.test(html)
  };
}

export function buildPlatformDryRunConnector({
  connector_id = 'platform_dry_run.wechat_web_test.v1',
  platform = 'wechat_web_test',
  required_markers = [
    'data-contract-version="automation_preview_test_page.v1"',
    'data-message-draft',
    'data-action="send_message"',
    'disabled',
    'data-real-execution-allowed="false"'
  ],
  send_block_markers = [
    'data-action="send_message" disabled',
    'data-real-execution-allowed="false"',
    '"send_allowed": false',
    '"real_execution_allowed": false'
  ],
  forbidden_markers = [
    'data-real-execution-allowed="true"',
    '"send_allowed": true',
    '"real_execution_allowed": true'
  ],
  notes = []
} = {}) {
  return {
    connector_id,
    contract_version: 'platform_dry_run_connector.v1',
    platform,
    mode: 'dry_run',
    real_execution_allowed: false,
    required_markers,
    send_block_markers,
    forbidden_markers,
    evidence_required: [
      'automation_preview',
      'page_snapshot_or_test_page_html',
      'send_block_marker',
      'audit_record_before_real_execution'
    ],
    notes
  };
}

function markerEvidence(markers, html, expected = true) {
  return markers.map((marker) => ({
    marker,
    found: html.includes(marker),
    expected
  }));
}

export function inspectPlatformDryRunConnector({
  connector = buildPlatformDryRunConnector(),
  automationPreview,
  pageHtml = '',
  operator = 'system'
} = {}) {
  if (!automationPreview) {
    throw new Error('inspectPlatformDryRunConnector requires automationPreview');
  }
  if (typeof pageHtml !== 'string' || pageHtml.length === 0) {
    throw new Error('inspectPlatformDryRunConnector requires pageHtml');
  }

  const required = markerEvidence(connector.required_markers, pageHtml, true);
  const sendBlock = markerEvidence(connector.send_block_markers, pageHtml, true);
  const forbidden = markerEvidence(connector.forbidden_markers, pageHtml, false);
  const draft = automationPreview.message_preview?.draft ?? '';
  const draftMarker = draft ? draft.slice(0, Math.min(12, draft.length)) : '';
  const requiredMarkersFound = required.every((item) => item.found);
  const sendBlocked = sendBlock.some((item) => item.found)
    && automationPreview.message_preview?.send_allowed === false;
  const forbiddenAbsent = forbidden.every((item) => !item.found);
  const draftPresent = draftMarker ? pageHtml.includes(draftMarker) : false;
  const previewReached = requiredMarkersFound && sendBlocked && forbiddenAbsent && draftPresent;

  return {
    check_id: createRuntimeId('platform_dry_run_check'),
    contract_version: 'platform_dry_run_connector_check.v1',
    connector_id: connector.connector_id,
    platform: connector.platform,
    mode: 'dry_run',
    operator,
    preview_id: automationPreview.preview_id,
    trigger_id: automationPreview.trigger_id,
    decision_id: automationPreview.decision_id,
    checked_at: nowIso(),
    status: previewReached
      ? 'preview_contract_passed_blocked_before_send'
      : 'preview_contract_failed',
    preview_reached: previewReached,
    required_markers_found: requiredMarkersFound,
    send_blocked: sendBlocked,
    forbidden_markers_absent: forbiddenAbsent,
    draft_present: draftPresent,
    real_execution_allowed: false,
    evidence: {
      required_markers: required,
      send_block_markers: sendBlock,
      forbidden_markers: forbidden,
      draft_marker: draftMarker,
      page_bytes: Buffer.byteLength(pageHtml, 'utf8')
    },
    blocked_actions: automationPreview.blocked_actions ?? [],
    recovery_actions: previewReached ? [] : [
      'Keep the connector in dry-run mode.',
      'Capture a fresh platform test-page snapshot.',
      'Verify target, draft, preview area and disabled send control markers.',
      'Do not expand to real execution until this check passes and user confirms.'
    ],
    audit_event: {
      event_type: 'platform_dry_run_connector_check',
      result: previewReached ? 'preview_reached_blocked_before_send' : 'preview_contract_failed',
      linked_preview_id: automationPreview.preview_id,
      linked_trigger_id: automationPreview.trigger_id,
      linked_decision_id: automationPreview.decision_id,
      real_execution_allowed: false
    }
  };
}

export function writeAutomationPreviewTestPage({
  automationPreview,
  previewTrial,
  outputDir = path.join(projectRoot(), 'runtime/automation-preview-pages'),
  fileName = null
} = {}) {
  if (!automationPreview) {
    throw new Error('writeAutomationPreviewTestPage requires automationPreview');
  }
  const html = renderAutomationPreviewTestPage({ automationPreview, previewTrial });
  const safePreviewId = automationPreview.preview_id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const pagePath = path.join(outputDir, fileName ?? `${safePreviewId}.html`);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(pagePath, html, 'utf8');

  return {
    page_path: pagePath,
    bytes: Buffer.byteLength(html, 'utf8'),
    inspection: inspectAutomationPreviewTestPage(html)
  };
}

export function buildTriggerPlan(request, knowledge = loadTriggerKnowledge()) {
  const policy = triggerPolicy(knowledge, request.trigger_type);
  const routine = request.profession && request.routine_id
    ? knowledge.triggerPolicies.profession_routines?.[request.profession]?.find((item) => item.routine_id === request.routine_id)
    : null;
  const goalInput = inferTriggerGoal(request, routine);
  const decision = buildDecisionRecommendation({
    goalInput,
    socialGraph: request.social_graph,
    userPreferences: request.user_preferences ?? {}
  });
  const activation = inferActivation(request, policy);
  const skillSteps = buildSkillSteps({
    request: { ...request, goal_input: goalInput },
    decision,
    knowledge
  });
  const confirmationGates = buildConfirmationGates(skillSteps, request, policy);
  const manualExecutionChecklist = buildManualExecutionChecklist({
    request: { ...request, goal_input: goalInput },
    decision,
    skillSteps,
    confirmationGates
  });

  return {
    trigger_id: createRuntimeId('trigger'),
    trigger_type: request.trigger_type,
    status: confirmationGates.length ? 'waiting_confirmation' : 'ready',
    policy_label: policy?.label ?? request.trigger_type,
    routine: routine ? {
      routine_id: routine.routine_id,
      label: routine.label,
      default_schedule: routine.default_schedule,
      conditions: routine.conditions
    } : null,
    activation,
    source_event_id: request.source_event_id ?? goalInput.source_event_id ?? null,
    goal_input: goalInput,
    decision_id: decision.decision_id,
    recommended_option: decision.recommended_option,
    message_draft: decision.recommended_option.message_draft,
    skill_steps: skillSteps,
    confirmation_gates: confirmationGates,
    manual_execution_checklist: manualExecutionChecklist,
    notification_plan: buildNotificationPlan(request, decision),
    evidence_pack: decision.evidence_pack,
    feedback_plan: decision.feedback_plan,
    event_writeback: buildEventWriteback({ ...request, goal_input: goalInput }, decision),
    safety_notes: unique([
      ...decision.safety_notes,
      '触发引擎第一版只生成计划和 dry-run 预览。',
      '微信或其他社交软件真实发送必须等待外部连接器和用户确认。'
    ])
  };
}

export function expandRoutineTriggers({ profession, userPreferences = {}, socialGraph, baseGoalInput = {} }, knowledge = loadTriggerKnowledge()) {
  const routines = knowledge.triggerPolicies.profession_routines?.[profession] ?? [];
  return routines.map((routine) => buildTriggerPlan({
    trigger_type: 'profession_routine',
    profession,
    routine_id: routine.routine_id,
    goal_input: {
      scene: 'business',
      primary_person_id: baseGoalInput.primary_person_id ?? socialGraph.people?.[0]?.person_id,
      context_input: routine.conditions.join('；'),
      ...baseGoalInput,
      initial_goal: baseGoalInput.initial_goal ?? routine.suggested_goal
    },
    social_graph: socialGraph,
    user_preferences: userPreferences,
    activation: {
      mode: 'recurring',
      recurrence: routine.default_schedule,
      run_at: null,
      timezone: 'Asia/Shanghai'
    },
    notification_preferences: {
      channels: ['in_app'],
      notify_on: ['followup_due', 'appointment_confirmed']
    }
  }, knowledge));
}
