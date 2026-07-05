import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildAutomationPreview,
  buildOutboundSendCommand,
  buildPlatformDryRunConnector,
  buildTriggerPlan,
  expandRoutineTriggers,
  inspectAutomationPreviewTestPage,
  inspectPlatformDryRunConnector,
  renderAutomationPreviewTestPage,
  runAutomationPreviewTrial,
  writeAutomationPreviewTestPage
} from '../src/index.mjs';
import {
  normalizeOutboundSendCommand,
  runSendCommandDryRun
} from '../../intake-runtime/src/index.mjs';

const socialGraph = JSON.parse(readFileSync('examples/social-graph-snapshot.json', 'utf8'));

test('builds user initiated appointment trigger with confirmation gates', () => {
  const plan = buildTriggerPlan({
    trigger_type: 'user_initiated',
    goal_input: {
      initial_goal: '预约张总下周客户拜访',
      scene: 'business',
      primary_person_id: 'person_client_a',
      target_person_ids: ['person_client_a'],
      context_input: '客户希望先内部确认预算，之后安排拜访。',
      preferred_channel: 'wechat'
    },
    social_graph: socialGraph,
    user_preferences: {
      automation_comfort: 'high',
      risk_tolerance: 'low'
    },
    allow_platform_send: true,
    notification_preferences: {
      channels: ['in_app', 'wechat'],
      notify_on: ['appointment_confirmed']
    }
  });

  assert.equal(plan.trigger_type, 'user_initiated');
  assert.ok(plan.skill_steps.some((step) => step.skill_id === 'communication.message.draft'));
  assert.ok(plan.skill_steps.some((step) => step.skill_id === 'platform.message.send'));
  assert.ok(plan.skill_steps.some((step) => step.skill_id === 'calendar.appointment.create'));
  assert.ok(plan.skill_steps.every((step) => step.dry_run === true));
  assert.ok(plan.confirmation_gates.some((gate) => gate.required_before === 'step_platform_send_preview'));
  assert.ok(plan.message_draft.draft.includes('低承诺'));
  assert.equal(plan.message_draft.must_confirm_before_send, true);
  assert.ok(plan.manual_execution_checklist.some((item) => item.item_id === 'review_message_draft'));
  assert.ok(plan.manual_execution_checklist.some((item) => item.item_id === 'preview_platform_before_send'));
  assert.ok(plan.notification_plan.channels.includes('wechat'));
  assert.equal(plan.event_writeback.requires_user_review, true);

  const preview = buildAutomationPreview({
    triggerPlan: plan,
    platform: 'wechat_web_test',
    target: {
      display_name: '张总',
      platform_handle: 'test_contact_client_a',
      channel: 'wechat'
    },
    messageDraft: plan.message_draft.draft,
    operator: 'test_user'
  });

  assert.equal(preview.mode, 'dry_run');
  assert.equal(preview.message_preview.send_allowed, false);
  assert.ok(preview.message_preview.draft.includes('低承诺'));
  assert.ok(preview.manual_execution_checklist.length >= 4);
  assert.equal(preview.status, 'blocked_until_user_confirmation');
  assert.ok(preview.executable_preview_steps.some((step) => step.skill_id === 'platform.message.send'));
  assert.ok(preview.blocked_actions.some((action) => action.action === 'send_message'));
  assert.ok(preview.confirmation_checklist.length >= plan.confirmation_gates.length);
  assert.equal(preview.audit_preview.write_required_before_real_execution, true);

  const sendCommand = buildOutboundSendCommand({
    triggerPlan: plan,
    automationPreview: preview,
    eventId: 'raw_event_client_a_latest',
    sendCommandId: 'send_command_trigger_engine_test',
    safetyChecks: {
      window_matches: true,
      thread_matches: true,
      draft_matches: true,
      permission_granted: false,
      notes: ['dry-run test keeps platform permission blocked']
    }
  });
  const normalizedCommand = normalizeOutboundSendCommand(sendCommand);
  assert.equal(normalizedCommand.event_id, 'raw_event_client_a_latest');
  assert.equal(normalizedCommand.decision_id, plan.decision_id);
  assert.equal(normalizedCommand.trigger_id, plan.trigger_id);
  assert.equal(normalizedCommand.target_platform, 'wechat_web_test');
  assert.equal(normalizedCommand.message_draft, preview.message_preview.draft);
  assert.equal(normalizedCommand.real_execution_allowed, false);
  assert.equal(normalizedCommand.user_confirmed, false);
  assert.equal(normalizedCommand.target_thread_hint.automation_preview_id, preview.preview_id);

  const sendDryRun = runSendCommandDryRun(normalizedCommand, {
    executor: 'trigger-engine.test'
  });
  assert.equal(sendDryRun.status, 'blocked');
  assert.equal(sendDryRun.metadata.real_send_attempted, false);
  assert.ok(sendDryRun.blocked_reason.includes('real_execution_not_allowed'));
  assert.ok(sendDryRun.blocked_reason.includes('user_confirmation_missing'));
  assert.ok(sendDryRun.blocked_reason.includes('permission_not_granted'));

  assert.throws(() => buildOutboundSendCommand({
    triggerPlan: plan,
    automationPreview: preview
  }), /requires eventId/);

  const trial = runAutomationPreviewTrial({
    automationPreview: preview,
    environment: {
      test_page_available: true,
      connector_authorized: false,
      user_confirmed_gate_ids: []
    },
    operator: 'test_user'
  });

  assert.equal(trial.mode, 'dry_run');
  assert.equal(trial.preview_reached, true);
  assert.equal(trial.status, 'preview_reached_blocked_before_execution');
  assert.equal(trial.real_execution_allowed, false);
  assert.ok(trial.blocked_by.some((item) => item.type === 'user_confirmation'));
  assert.ok(trial.blocked_by.some((item) => item.type === 'connector_authorization'));
  assert.equal(trial.audit_event.result, 'preview_reached');

  const failedTrial = runAutomationPreviewTrial({
    automationPreview: preview,
    environment: {
      test_page_available: false
    },
    operator: 'test_user'
  });

  assert.equal(failedTrial.preview_reached, false);
  assert.equal(failedTrial.status, 'preview_failed');
  assert.equal(failedTrial.real_execution_allowed, false);
  assert.ok(failedTrial.failed_steps.some((step) => step.reason === 'test_page_unavailable'));
  assert.ok(failedTrial.recovery_actions.some((action) => action.includes('暂停平台自动化')));

  const html = renderAutomationPreviewTestPage({
    automationPreview: preview,
    previewTrial: failedTrial
  });
  const inspection = inspectAutomationPreviewTestPage(html);

  assert.equal(inspection.has_document, true);
  assert.equal(inspection.has_preview_id, true);
  assert.equal(inspection.send_button_disabled, true);
  assert.equal(inspection.real_execution_blocked, true);
  assert.equal(inspection.has_confirmation_checklist, true);
  assert.equal(inspection.has_trial_result, true);
  assert.equal(inspection.has_recovery_hint, true);
  assert.equal(inspection.has_state_contract, true);
  assert.equal(inspection.has_confirm_controls, true);
  assert.equal(inspection.has_manual_execution_checklist, true);
  assert.equal(inspection.has_local_state_output, true);
  assert.equal(inspection.has_no_external_script, true);
  assert.ok(html.includes('"send_allowed": false'));
  assert.ok(html.includes('"real_execution_allowed": false'));

  const connector = buildPlatformDryRunConnector({
    platform: 'wechat_web_test'
  });
  const connectorCheck = inspectPlatformDryRunConnector({
    connector,
    automationPreview: preview,
    pageHtml: html,
    operator: 'test_user'
  });

  assert.equal(connectorCheck.contract_version, 'platform_dry_run_connector_check.v1');
  assert.equal(connectorCheck.preview_reached, true);
  assert.equal(connectorCheck.send_blocked, true);
  assert.equal(connectorCheck.forbidden_markers_absent, true);
  assert.equal(connectorCheck.real_execution_allowed, false);
  assert.equal(connectorCheck.audit_event.real_execution_allowed, false);

  const unsafeHtml = html.replace('data-real-execution-allowed="false"', 'data-real-execution-allowed="true"');
  const unsafeConnectorCheck = inspectPlatformDryRunConnector({
    connector,
    automationPreview: preview,
    pageHtml: unsafeHtml,
    operator: 'test_user'
  });

  assert.equal(unsafeConnectorCheck.preview_reached, false);
  assert.equal(unsafeConnectorCheck.forbidden_markers_absent, false);
  assert.ok(unsafeConnectorCheck.recovery_actions.length > 0);

  const outputDir = mkdtempSync(path.join(tmpdir(), 'zhineng-preview-page-'));
  try {
    const written = writeAutomationPreviewTestPage({
      automationPreview: preview,
      previewTrial: failedTrial,
      outputDir
    });
    assert.equal(existsSync(written.page_path), true);
    assert.ok(written.bytes > 1000);
    assert.equal(written.inspection.send_button_disabled, true);
    assert.equal(written.inspection.real_execution_blocked, true);
    assert.equal(written.inspection.has_state_contract, true);
    assert.equal(written.inspection.has_confirm_controls, true);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test('validates a saved platform snapshot fixture with dry-run connector rules', () => {
  const preview = JSON.parse(readFileSync('examples/platform-snapshot-preview.sample.json', 'utf8'));
  const snapshotHtml = readFileSync('examples/platform-snapshot.sample.html', 'utf8');
  const connector = buildPlatformDryRunConnector({
    platform: preview.platform
  });
  const connectorCheck = inspectPlatformDryRunConnector({
    connector,
    automationPreview: preview,
    pageHtml: snapshotHtml,
    operator: 'snapshot_fixture_test'
  });

  assert.equal(connectorCheck.contract_version, 'platform_dry_run_connector_check.v1');
  assert.equal(connectorCheck.preview_reached, true);
  assert.equal(connectorCheck.send_blocked, true);
  assert.equal(connectorCheck.forbidden_markers_absent, true);
  assert.equal(connectorCheck.draft_present, true);
  assert.equal(connectorCheck.real_execution_allowed, false);
});

test('expands sales profession routine triggers', () => {
  const plans = expandRoutineTriggers({
    profession: 'sales',
    socialGraph,
    baseGoalInput: {
      primary_person_id: 'person_client_a'
    }
  });

  assert.ok(plans.length >= 2);
  assert.ok(plans.every((plan) => plan.trigger_type === 'profession_routine'));
  assert.ok(plans.every((plan) => plan.activation.mode === 'recurring'));
  assert.ok(plans.every((plan) => plan.confirmation_gates.some((gate) => gate.required_before === 'schedule_enable')));
});

test('generates unique trigger and automation trial ids under rapid calls', () => {
  const plan = buildTriggerPlan({
    trigger_type: 'user_initiated',
    goal_input: {
      initial_goal: '预约张总下周客户拜访',
      scene: 'business',
      primary_person_id: 'person_client_a',
      target_person_ids: ['person_client_a'],
      context_input: '客户希望先内部确认预算，之后安排拜访。',
      preferred_channel: 'wechat'
    },
    social_graph: socialGraph,
    user_preferences: {
      automation_comfort: 'high'
    },
    allow_platform_send: true
  });
  const preview = buildAutomationPreview({ triggerPlan: plan });
  const triggerIds = new Set([plan.trigger_id]);
  const trialIds = new Set();

  for (let index = 0; index < 10; index += 1) {
    triggerIds.add(buildTriggerPlan({
      trigger_type: 'user_initiated',
      goal_input: plan.goal_input,
      social_graph: socialGraph
    }).trigger_id);
    trialIds.add(runAutomationPreviewTrial({ automationPreview: preview }).trial_id);
  }

  assert.equal(triggerIds.size, 11);
  assert.equal(trialIds.size, 10);
});
