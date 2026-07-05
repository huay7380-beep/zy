#!/usr/bin/env node
import path from 'node:path';
import {
  buildCliAnythingToolCapabilities,
  buildToolIntakeBridge,
  loadCliAnythingRegistry,
  writeToolIntakeBridge
} from '../packages/tool-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/bridge-tool-intake.mjs [--tool=<name-or-capability-id>] [--registry=<CLI-Anything registry json>]',
    '',
    'Options:',
    '  --message-draft=<text>  Optional template draft for send-capable tools.',
    '  --output-dir=<dir>      Defaults to runtime/tool-intake-bridges/<bridge_id>.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const registryPath = argValue('registry') ? path.resolve(argValue('registry')) : undefined;
  const registry = loadCliAnythingRegistry({ registryPath });
  const capabilities = buildCliAnythingToolCapabilities(registry);
  const requestedTool = argValue('tool');
  const selected = requestedTool
    ? capabilities.find((capability) =>
      capability.name === requestedTool
      || capability.capability_id === requestedTool
      || capability.display_name === requestedTool)
    : capabilities.find((capability) => capability.capabilities.can_send_message)
      ?? capabilities.find((capability) => capability.capabilities.can_read_external_data)
      ?? capabilities[0];

  if (!selected) {
    console.error(JSON.stringify({
      command: 'bridge-tool-intake',
      registry_found: registry.found,
      registry_path: registry.registry_path,
      error: requestedTool ? 'requested_tool_not_found' : 'no_social_assistance_tool_found'
    }, null, 2));
    process.exit(1);
  }

  const bridge = buildToolIntakeBridge({
    capability: selected,
    messageDraft: argValue('message-draft') ?? undefined,
    targetContext: {
      target_person_id: 'replace_with_person_id',
      target_thread_hint: 'replace_with_thread_hint',
      workspace_hint: 'replace_with_workspace_hint'
    },
    source: {
      event_id: 'replace_with_event_id',
      decision_id: 'replace_with_decision_id',
      trigger_id: 'replace_with_trigger_id'
    },
    operator: 'bridge-tool-intake'
  });
  const outputDir = argValue('output-dir') ? path.resolve(argValue('output-dir')) : undefined;
  const { bridge: report, written } = writeToolIntakeBridge({ bridge, outputDir });

  console.log(JSON.stringify({
    command: 'bridge-tool-intake',
    registry_found: registry.found,
    registry_path: registry.registry_path,
    bridge_id: report.bridge_id,
    gate_decision: report.gate_decision,
    capability_id: report.capability_summary.capability_id,
    tool_name: report.capability_summary.name,
    command_executed: report.command_executed,
    real_execution_allowed: report.real_execution_allowed,
    json_path: written.json_path,
    markdown_path: written.markdown_path,
    source_adapter_init_path: written.source_adapter_init_path,
    send_command_template_path: written.send_command_template_path,
    dry_run_send_result_path: written.dry_run_send_result_path
  }, null, 2));
}
