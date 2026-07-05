#!/usr/bin/env node
import path from 'node:path';
import {
  buildCliAnythingToolCapabilities,
  buildToolCallPlan,
  loadCliAnythingRegistry,
  runToolCallDryRun
} from '../packages/tool-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const registryPath = argValue('registry')
  ? path.resolve(argValue('registry'))
  : undefined;
const registry = loadCliAnythingRegistry({ registryPath });
const capabilities = buildCliAnythingToolCapabilities(registry);
const selected = capabilities.find((capability) => capability.name === 'wecom')
  ?? capabilities.find((capability) => capability.category === 'communication')
  ?? capabilities[0]
  ?? null;

const plan = selected
  ? buildToolCallPlan({
    capability: selected,
    purpose: 'Prepare an external helper software dry-run preview for the social assistant without executing a real command.',
    requestedAction: {
      action: '--help',
      input_summary: 'Check whether this tool can be a later adapter candidate while staying dry-run.',
      expected_output: 'Tool capability and command preview'
    },
    targetContext: {
      scene: 'b2b_followup',
      target_person_id: 'person_client_a',
      target_thread_hint: 'demo-thread-only'
    },
    source: {
      decision_id: 'decision_demo_tool_runtime',
      trigger_id: 'trigger_demo_tool_runtime'
    },
    operator: 'tool_runtime_demo'
  })
  : null;
const result = plan ? runToolCallDryRun({ plan, operator: 'tool_runtime_demo' }) : null;

console.log(JSON.stringify({
  command: 'run-tool-runtime-demo',
  registry: {
    found: registry.found,
    registry_path: registry.registry_path,
    updated: registry.meta?.updated ?? null,
    total_cli_count: registry.clis.length
  },
  social_assistance_tool_count: capabilities.length,
  recommended_initial_tools: capabilities
    .filter((capability) => ['communication', 'knowledge', 'productivity', 'web', 'ai'].includes(capability.category))
    .slice(0, 8)
    .map((capability) => ({
      capability_id: capability.capability_id,
      display_name: capability.display_name,
      category: capability.category,
      risk_level: capability.risk_level,
      requires_credentials: capability.capabilities.requires_credentials,
      can_send_message: capability.capabilities.can_send_message
    })),
  dry_run_plan: plan,
  dry_run_result: result,
  next_step: 'Run npm run tool:intake:bridge to turn a selected CLI-Anything tool into a SourceAdapter init kit and, for send-capable tools, a blocked SendCommand template. The current module still does not execute external commands.'
}, null, 2));
