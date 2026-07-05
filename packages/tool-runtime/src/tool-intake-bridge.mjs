import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildSourceAdapterInitKit,
  runSendCommandDryRun,
  writeSourceAdapterInitKit
} from '../../intake-runtime/src/index.mjs';

function nowIso() {
  return new Date().toISOString();
}

function stableSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'tool';
}

function requireCapability(capability) {
  if (!capability || typeof capability !== 'object') {
    throw new Error('Tool intake bridge requires ToolAdapterCapability');
  }
  for (const field of ['capability_id', 'provider', 'name', 'display_name', 'capabilities']) {
    if (capability[field] === undefined || capability[field] === null || capability[field] === '') {
      throw new Error(`ToolAdapterCapability missing required field: ${field}`);
    }
  }
}

function inferSourceType(capability) {
  if (capability.category === 'web') return 'browser';
  if (capability.category === 'knowledge') return 'file';
  if (capability.category === 'communication' || capability.category === 'productivity') return 'api';
  return capability.capabilities?.can_read_external_data ? 'api' : 'file';
}

function buildSendCommandTemplate({
  capability,
  messageDraft,
  targetContext,
  source,
  createdAt
}) {
  return {
    send_command_id: `send_command_${stableSlug(capability.capability_id)}_${Date.now()}`,
    event_id: source.event_id ?? 'tool_bridge_event_template',
    decision_id: source.decision_id ?? 'tool_bridge_decision_template',
    trigger_id: source.trigger_id ?? 'tool_bridge_trigger_template',
    target_platform: capability.name,
    target_person_id: targetContext.target_person_id ?? null,
    target_thread_hint: {
      provider: capability.provider,
      tool_name: capability.name,
      display_name: capability.display_name,
      target_thread_hint: targetContext.target_thread_hint ?? 'replace_with_target_thread',
      workspace_hint: targetContext.workspace_hint ?? null
    },
    message_draft: messageDraft,
    requires_user_confirmation: true,
    user_confirmed: false,
    real_execution_allowed: false,
    safety_checks: {
      window_matches: false,
      thread_matches: false,
      draft_matches: false,
      permission_granted: false,
      notes: [
        'Generated from ToolAdapterCapability; real send stays blocked until connector authorization, target verification and user confirmation are complete.'
      ]
    },
    created_at: createdAt,
    metadata: {
      generated_by: 'tool-runtime.buildToolIntakeBridge',
      dry_run_default: true,
      source_capability_id: capability.capability_id,
      source_provider: capability.provider,
      source_tool_name: capability.name
    }
  };
}

export function buildToolIntakeBridge({
  capability,
  targetContext = {},
  source = {},
  messageDraft = 'Replace with system generated message_draft before controlled send validation.',
  operator = 'tool_intake_bridge',
  createdAt = nowIso()
} = {}) {
  requireCapability(capability);
  const sourceType = inferSourceType(capability);
  const adapterId = `${capability.provider}.${stableSlug(capability.name)}`;
  const sourceAdapterKit = buildSourceAdapterInitKit({
    adapterId,
    sourceType,
    platform: capability.name,
    canSend: capability.capabilities.can_send_message === true,
    generatedBy: 'tool-runtime.buildToolIntakeBridge'
  });
  sourceAdapterKit.template_payloads.capability.metadata = {
    ...sourceAdapterKit.template_payloads.capability.metadata,
    source_tool_capability_id: capability.capability_id,
    source_tool_provider: capability.provider,
    source_tool_name: capability.name,
    source_tool_risk_level: capability.risk_level
  };
  sourceAdapterKit.template_payloads.observation.metadata = {
    ...sourceAdapterKit.template_payloads.observation.metadata,
    source_tool_capability_id: capability.capability_id,
    source_tool_provider: capability.provider,
    source_tool_name: capability.name
  };

  const sendCommandTemplate = capability.capabilities.can_send_message === true
    ? buildSendCommandTemplate({
      capability,
      messageDraft,
      targetContext,
      source,
      createdAt
    })
    : null;
  const dryRunSendResult = sendCommandTemplate
    ? runSendCommandDryRun(sendCommandTemplate, {
      executor: 'tool-runtime.bridge.dry-run',
      evidenceRefs: [
        `tool_capability:${capability.capability_id}`,
        'external_command_execution:false',
        'send_command_template_only'
      ]
    })
    : null;

  return {
    schema_version: 'tool_intake_bridge.v1',
    bridge_id: `tool_intake_bridge_${stableSlug(capability.capability_id)}_${Date.now()}`,
    created_at: createdAt,
    operator,
    capability_summary: {
      capability_id: capability.capability_id,
      provider: capability.provider,
      name: capability.name,
      display_name: capability.display_name,
      category: capability.category,
      risk_level: capability.risk_level,
      can_read_external_data: capability.capabilities.can_read_external_data === true,
      can_send_message: capability.capabilities.can_send_message === true,
      can_modify_external_state: capability.capabilities.can_modify_external_state === true,
      requires_credentials: capability.capabilities.requires_credentials === true
    },
    source_adapter_init: sourceAdapterKit,
    send_command_template: sendCommandTemplate,
    dry_run_send_result: dryRunSendResult,
    gate_decision: dryRunSendResult
      ? 'tool_bridge_ready_with_blocked_send_template'
      : 'tool_bridge_ready_for_intake_only',
    real_execution_allowed: false,
    command_executed: false,
    required_before_real_execution: dryRunSendResult?.target_verification?.blocked_reasons ?? [],
    next_steps: [
      'Validate the generated source adapter capability and observation templates before intake use.',
      'Keep external CLI execution disabled until connector authorization and target verification are complete.',
      'For send-capable tools, use the generated SendCommand only as a blocked template until a controlled test window is approved.'
    ]
  };
}

export function writeToolIntakeBridge({
  bridge,
  outputDir = path.resolve('runtime/tool-intake-bridges', bridge.bridge_id)
}) {
  mkdirSync(outputDir, { recursive: true });
  const sourceAdapterDir = path.join(outputDir, 'source-adapter-kit');
  const sourceAdapterWritten = writeSourceAdapterInitKit({
    kit: bridge.source_adapter_init,
    outputDir: sourceAdapterDir
  });
  const sendCommandPath = bridge.send_command_template
    ? path.join(outputDir, 'outbound-send-command.template.json')
    : null;
  const sendResultPath = bridge.dry_run_send_result
    ? path.join(outputDir, 'outbound-send-result.dry-run.json')
    : null;
  const jsonPath = path.join(outputDir, 'tool-intake-bridge.json');
  const markdownPath = path.join(outputDir, 'tool-intake-bridge.md');
  const report = {
    ...bridge,
    source_adapter_init_path: sourceAdapterWritten.written.json_path,
    source_adapter_capability_template_path: sourceAdapterWritten.written.capability_template_path,
    source_adapter_observation_template_path: sourceAdapterWritten.written.observation_template_path,
    send_command_template_path: sendCommandPath,
    dry_run_send_result_path: sendResultPath
  };

  if (sendCommandPath) {
    writeFileSync(sendCommandPath, `${JSON.stringify(bridge.send_command_template, null, 2)}\n`, 'utf8');
  }
  if (sendResultPath) {
    writeFileSync(sendResultPath, `${JSON.stringify(bridge.dry_run_send_result, null, 2)}\n`, 'utf8');
  }
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, [
    '# Tool Intake Bridge',
    '',
    `- bridge_id: ${report.bridge_id}`,
    `- gate_decision: ${report.gate_decision}`,
    `- capability_id: ${report.capability_summary.capability_id}`,
    `- tool: ${report.capability_summary.display_name}`,
    `- command_executed: ${report.command_executed}`,
    `- real_execution_allowed: ${report.real_execution_allowed}`,
    `- source_adapter_init_path: ${report.source_adapter_init_path}`,
    `- send_command_template_path: ${report.send_command_template_path ?? 'none'}`,
    `- dry_run_send_result_path: ${report.dry_run_send_result_path ?? 'none'}`,
    '',
    '## Next Steps',
    '',
    ...report.next_steps.map((item) => `- ${item}`)
  ].join('\n'), 'utf8');

  return {
    bridge: report,
    written: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      source_adapter_init_path: sourceAdapterWritten.written.json_path,
      source_adapter_capability_template_path: sourceAdapterWritten.written.capability_template_path,
      source_adapter_observation_template_path: sourceAdapterWritten.written.observation_template_path,
      send_command_template_path: sendCommandPath,
      dry_run_send_result_path: sendResultPath
    }
  };
}
