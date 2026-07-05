import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  buildCliAnythingToolCapabilities,
  buildToolAdapterCapability,
  buildToolIntakeBridge,
  buildToolCallPlan,
  inspectToolCallSafety,
  runToolCallDryRun,
  writeToolIntakeBridge
} from '../src/index.mjs';
import { validateSourceAdapterConformance } from '../../intake-runtime/src/index.mjs';

const registry = {
  registry_path: 'fixtures/cli-anything-public-registry.json',
  meta: {
    updated: '2026-06-03'
  },
  clis: [
    {
      name: 'wecom',
      display_name: 'WeCom CLI',
      description: 'Official WeCom open-platform CLI for contacts, todos, meetings, messages, calendars, docs, and smart sheets',
      category: 'communication',
      requires: 'Node.js >= 18, WeCom account, optional Bot ID + Secret',
      package_manager: 'npm',
      install_cmd: 'npm install -g @wecom/cli',
      npx_cmd: 'npx @wecom/cli',
      entry_point: 'wecom-cli'
    },
    {
      name: 'obsidian-cli',
      display_name: 'Obsidian CLI',
      description: 'Official Obsidian command line interface for vault automation, screenshots, search, history, and plugin workflows',
      category: 'knowledge',
      requires: 'Obsidian desktop app running',
      package_manager: 'bundled',
      entry_point: 'obsidian'
    },
    {
      name: 'sentry',
      display_name: 'Sentry CLI',
      description: 'Official Sentry CLI for releases and sourcemaps',
      category: 'devops',
      requires: 'Sentry account plus auth token',
      package_manager: 'npm',
      entry_point: 'sentry-cli'
    }
  ]
};

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-tool-runtime-'));
}

test('maps CLI-Anything registry entries into social-assistance tool capabilities', () => {
  const capabilities = buildCliAnythingToolCapabilities(registry);
  const ids = capabilities.map((capability) => capability.capability_id);

  assert.deepEqual(ids, ['cli_anything.wecom', 'cli_anything.obsidian_cli']);

  const wecom = capabilities.find((capability) => capability.name === 'wecom');
  assert.equal(wecom.schema_version, 'tool_adapter_capability.v1');
  assert.equal(wecom.provider, 'cli_anything');
  assert.equal(wecom.capabilities.can_send_message, true);
  assert.equal(wecom.capabilities.can_modify_external_state, true);
  assert.equal(wecom.capabilities.requires_credentials, true);
  assert.equal(wecom.risk_level, 'high');
  assert.ok(wecom.blocked_use_cases.some((item) => item.includes('未经用户确认真实发送消息')));

  const obsidian = capabilities.find((capability) => capability.name === 'obsidian-cli');
  assert.equal(obsidian.capabilities.can_read_external_data, true);
  assert.equal(obsidian.capabilities.can_send_message, false);
  assert.equal(obsidian.install.entry_point, 'obsidian');
});

test('builds dry-run tool call plans and blocks unsafe execution gates', () => {
  const [wecom] = buildCliAnythingToolCapabilities(registry);
  const plan = buildToolCallPlan({
    capability: wecom,
    purpose: '为 B2B 客户跟进准备企微发送预览',
    requestedAction: {
      action: 'message preview --to client_a',
      input_summary: '只使用系统生成的 message_draft 做预览',
      expected_output: '企微消息预览'
    },
    targetContext: {
      target_person_id: 'person_client_a',
      target_thread_hint: 'wecom:test-client-a'
    },
    source: {
      decision_id: 'decision_test',
      trigger_id: 'trigger_test',
      event_id: 'raw_test'
    },
    operator: 'test_user'
  });

  assert.equal(plan.schema_version, 'social_tool_call_plan.v1');
  assert.equal(plan.execution_mode, 'dry_run');
  assert.equal(plan.real_execution_allowed, false);
  assert.equal(plan.user_confirmed, false);
  assert.equal(plan.connector_authorized, false);
  assert.equal(plan.target_verified, false);
  assert.ok(plan.requested_action.proposed_command.includes('npx @wecom/cli'));
  assert.ok(plan.blocked_actions.some((item) => item.blocked_until === 'user_confirmation'));
  assert.ok(plan.blocked_actions.some((item) => item.blocked_until === 'connector_authorization'));
  assert.ok(plan.blocked_actions.some((item) => item.blocked_until === 'target_verification'));
  assert.ok(plan.blocked_actions.some((item) => item.action === 'send_message'));
  assert.equal(plan.audit_event.real_execution_allowed, false);

  const result = runToolCallDryRun({ plan, operator: 'test_user' });

  assert.equal(result.schema_version, 'social_tool_call_result.v1');
  assert.equal(result.execution_mode, 'dry_run');
  assert.equal(result.command_executed, false);
  assert.equal(result.real_execution_allowed, false);
  assert.equal(result.status, 'previewed_blocked_before_execution');
  assert.ok(result.blocked_actions.some((item) => item.blocked_until === 'connector_authorization'));
  assert.ok(result.blocked_actions.some((item) => item.blocked_until === 'target_verification'));
  assert.ok(result.blocked_actions.some((item) => item.action === 'send_message'));
  assert.ok(result.evidence_refs.includes('external_command_execution:false'));
  assert.equal(result.audit_event.command_executed, false);
});

test('allows preview-ready dry-run for a low-risk internal helper without executing it', () => {
  const capability = buildToolAdapterCapability({
    capability_id: 'internal.summary_helper',
    provider: 'internal',
    name: 'summary-helper',
    display_name: 'Summary Helper',
    capabilities: {
      can_read_external_data: false,
      can_modify_external_state: false,
      can_send_message: false,
      can_generate_artifact: false,
      requires_credentials: false,
      requires_user_confirmation: false
    }
  });

  const plan = buildToolCallPlan({
    capability,
    purpose: '整理本地已脱敏摘要',
    requestedAction: {
      action: '--summarize',
      proposed_command: 'summary-helper --summarize runtime/input.json'
    },
    userConfirmed: true,
    connectorAuthorized: true,
    targetVerified: true
  });
  const safety = inspectToolCallSafety(plan);
  const result = runToolCallDryRun({ plan });

  assert.equal(capability.risk_level, 'low');
  assert.deepEqual(safety.blocked_actions, []);
  assert.equal(safety.safe_for_dry_run, true);
  assert.equal(result.status, 'preview_ready_no_external_execution');
  assert.equal(result.command_executed, false);
});

test('bridges a read-capable CLI tool into a source adapter init kit', () => {
  const root = tempRoot();
  try {
    const capabilities = buildCliAnythingToolCapabilities(registry);
    const obsidian = capabilities.find((capability) => capability.name === 'obsidian-cli');
    const bridge = buildToolIntakeBridge({
      capability: obsidian,
      operator: 'tool_bridge_test'
    });
    const { bridge: report, written } = writeToolIntakeBridge({
      bridge,
      outputDir: path.join(root, 'obsidian-bridge')
    });

    assert.equal(report.schema_version, 'tool_intake_bridge.v1');
    assert.equal(report.gate_decision, 'tool_bridge_ready_for_intake_only');
    assert.equal(report.command_executed, false);
    assert.equal(report.real_execution_allowed, false);
    assert.equal(report.source_adapter_init.template_payloads.capability.source_type, 'file');
    assert.equal(report.source_adapter_init.template_payloads.capability.capabilities.can_send, false);
    assert.equal(report.send_command_template, null);
    assert.equal(existsSync(written.source_adapter_init_path), true);
    assert.equal(existsSync(written.source_adapter_capability_template_path), true);

    const conformance = validateSourceAdapterConformance({
      capability: JSON.parse(readFileSync(written.source_adapter_capability_template_path, 'utf8')),
      observation: JSON.parse(readFileSync(written.source_adapter_observation_template_path, 'utf8'))
    });
    assert.equal(conformance.ready_for_intake, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('bridges a send-capable CLI tool into a blocked SendCommand template', () => {
  const root = tempRoot();
  try {
    const [wecom] = buildCliAnythingToolCapabilities(registry);
    const bridge = buildToolIntakeBridge({
      capability: wecom,
      messageDraft: 'Test-only draft, do not send automatically.',
      targetContext: {
        target_person_id: 'person_client_a',
        target_thread_hint: 'wecom:test-thread'
      },
      source: {
        event_id: 'event_tool_bridge',
        decision_id: 'decision_tool_bridge',
        trigger_id: 'trigger_tool_bridge'
      }
    });
    const { bridge: report, written } = writeToolIntakeBridge({
      bridge,
      outputDir: path.join(root, 'wecom-bridge')
    });

    assert.equal(report.gate_decision, 'tool_bridge_ready_with_blocked_send_template');
    assert.equal(report.source_adapter_init.template_payloads.capability.capabilities.can_send, true);
    assert.equal(report.send_command_template.real_execution_allowed, false);
    assert.equal(report.send_command_template.user_confirmed, false);
    assert.equal(report.dry_run_send_result.status, 'blocked');
    assert.equal(report.dry_run_send_result.metadata.real_send_attempted, false);
    assert.ok(report.required_before_real_execution.includes('real_execution_not_allowed'));
    assert.equal(existsSync(written.send_command_template_path), true);
    assert.equal(existsSync(written.dry_run_send_result_path), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tool intake bridge CLI writes runtime evidence without executing external tools', () => {
  const root = tempRoot();
  try {
    const scriptPath = path.resolve('scripts/bridge-tool-intake.mjs');
    const outputDir = path.join(root, 'bridge-cli');
    const result = spawnSync(process.execPath, [
      scriptPath,
      '--tool=wecom',
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(path.join(outputDir, 'tool-intake-bridge.json'), 'utf8'));
    assert.equal(report.schema_version, 'tool_intake_bridge.v1');
    assert.equal(report.command_executed, false);
    assert.equal(report.real_execution_allowed, false);
    assert.equal(report.dry_run_send_result.status, 'blocked');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
