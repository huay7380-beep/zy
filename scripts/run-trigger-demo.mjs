import { readFileSync } from 'node:fs';
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
} from '../packages/trigger-engine/src/index.mjs';
import {
  runSendCommandDryRun
} from '../packages/intake-runtime/src/index.mjs';

const socialGraph = JSON.parse(readFileSync('examples/social-graph-snapshot.json', 'utf8'));

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const writePage = process.argv.includes('--write-page');
const pageDir = argValue('page-dir');

const userInitiated = buildTriggerPlan({
  trigger_type: 'user_initiated',
  goal_input: {
    initial_goal: '预约张总下周进行客户拜访和技术评审',
    scene: 'business',
    primary_person_id: 'person_client_a',
    target_person_ids: ['person_client_a', 'person_tech_lead'],
    context_input: '客户之前说预算需要内部确认，技术负责人还没有参与，希望先内部再看看。',
    preferred_channel: 'wechat',
    user_constraints: ['不要强压', '不要过度承诺']
  },
  social_graph: socialGraph,
  user_preferences: {
    automation_comfort: 'high',
    risk_tolerance: 'low',
    relationship_priority: 'high',
    preferred_channels: ['wechat']
  },
  allow_platform_send: true,
  activation: {
    mode: 'immediate',
    run_at: new Date().toISOString(),
    recurrence: null,
    timezone: 'Asia/Shanghai'
  },
  notification_preferences: {
    channels: ['in_app', 'wechat'],
    notify_on: ['appointment_confirmed', 'send_failed', 'followup_due']
  }
});

const routinePlans = expandRoutineTriggers({
  profession: 'sales',
  userPreferences: {
    automation_comfort: 'low',
    risk_tolerance: 'low'
  },
  socialGraph,
  baseGoalInput: {
    primary_person_id: 'person_client_a',
    target_person_ids: ['person_client_a'],
    preferred_channel: 'wechat'
  }
});

const automationPreview = buildAutomationPreview({
  triggerPlan: userInitiated,
  platform: 'wechat_web_test',
  target: {
    display_name: '张总',
    platform_handle: 'test_wechat_contact_client_a',
    channel: 'wechat'
  },
  messageDraft: '张总，我建议先安排一次轻量技术评审，把预算、接口和参与人问题先对齐。',
  operator: 'demo_user'
});

const previewTrial = runAutomationPreviewTrial({
  automationPreview,
  environment: {
    test_page_available: true,
    connector_authorized: false,
    user_confirmed_gate_ids: []
  },
  operator: 'demo_user'
});

const failedPreviewTrial = runAutomationPreviewTrial({
  automationPreview,
  environment: {
    test_page_available: false
  },
  operator: 'demo_user'
});
const testPageHtml = renderAutomationPreviewTestPage({
  automationPreview,
  previewTrial: failedPreviewTrial
});
const testPageInspection = inspectAutomationPreviewTestPage(testPageHtml);
const platformDryRunConnector = buildPlatformDryRunConnector({
  platform: automationPreview.platform
});
const platformDryRunConnectorCheck = inspectPlatformDryRunConnector({
  connector: platformDryRunConnector,
  automationPreview,
  pageHtml: testPageHtml,
  operator: 'demo_user'
});
const outboundSendCommand = buildOutboundSendCommand({
  triggerPlan: userInitiated,
  automationPreview,
  eventId: 'raw_event_trigger_demo_001',
  safetyChecks: {
    window_matches: true,
    thread_matches: true,
    draft_matches: true,
    permission_granted: false,
    notes: ['demo keeps platform permission blocked']
  },
  metadata: {
    demo: true
  }
});
const outboundSendDryRun = runSendCommandDryRun(outboundSendCommand, {
  executor: 'trigger-demo.dry-run'
});
const writtenTestPage = writePage
  ? writeAutomationPreviewTestPage({
    automationPreview,
    previewTrial: failedPreviewTrial,
    outputDir: pageDir ?? undefined
  })
  : null;

console.log(JSON.stringify({
  user_initiated: {
    trigger_id: userInitiated.trigger_id,
    status: userInitiated.status,
    activation: userInitiated.activation,
    recommended_option: userInitiated.recommended_option.title,
    skill_steps: userInitiated.skill_steps.map((step) => ({
      step_id: step.step_id,
      skill_id: step.skill_id,
      dry_run: step.dry_run,
      requires_user_confirmation: step.requires_user_confirmation
    })),
    confirmation_gates: userInitiated.confirmation_gates,
    notification_plan: userInitiated.notification_plan,
    event_writeback: userInitiated.event_writeback,
    outbound_send_command: outboundSendCommand,
    outbound_send_dry_run: outboundSendDryRun,
    automation_preview: automationPreview,
    automation_preview_trial: previewTrial,
    failed_preview_trial: failedPreviewTrial,
    automation_preview_test_page: {
      bytes: Buffer.byteLength(testPageHtml, 'utf8'),
      inspection: testPageInspection,
      platform_dry_run_connector_check: platformDryRunConnectorCheck,
      written_page: writtenTestPage
    }
  },
  profession_routines: routinePlans.map((plan) => ({
    trigger_id: plan.trigger_id,
    routine: plan.routine,
    status: plan.status,
    activation: plan.activation,
    recommended_option: plan.recommended_option.title,
    confirmation_gates: plan.confirmation_gates.length
  }))
}, null, 2));
