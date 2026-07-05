#!/usr/bin/env node
import path from 'node:path';
import {
  buildControlledSendHandoff,
  writeControlledSendHandoff
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function optionalPath(name) {
  const value = argValue(name);
  return value ? path.resolve(value) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/write-controlled-send-handoff.mjs [--trial=<desktop-controlled-send-trial.json>] [--audit=<intake-implementation-audit.json>] [--completion=<desktop-controlled-send-completion.json>] [--material-kit=<controlled-send-material-kit.json>] [--readiness=<controlled-send-real-window-readiness.json>] [--command-preflight=<controlled-send-command-preflight.json>] [--command-draft=<controlled-send-command-draft.json>] [--command-confirmation=<controlled-send-command-confirmation.json>] [--tool-bridge=<tool-intake-bridge.json>] [--output-dir=<dir>]',
    '',
    'This command never sends a message. It summarizes the current controlled-send handoff state, structured operator actions and next commands.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const handoff = buildControlledSendHandoff({
    root: process.cwd(),
    trialPath: optionalPath('trial'),
    auditPath: optionalPath('audit'),
    completionPath: optionalPath('completion'),
    materialKitPath: optionalPath('material-kit'),
    realWindowReadinessPath: optionalPath('readiness'),
    commandPreflightPath: optionalPath('command-preflight'),
    commandDraftPath: optionalPath('command-draft'),
    commandConfirmationPath: optionalPath('command-confirmation'),
    toolBridgePath: optionalPath('tool-bridge')
  });
  const outputDir = argValue('output-dir') ? path.resolve(argValue('output-dir')) : undefined;
  const written = writeControlledSendHandoff({ handoff, outputDir });

  console.log(JSON.stringify({
    command: 'write-controlled-send-handoff',
    handoff_id: handoff.handoff_id,
    gate_decision: handoff.gate_decision,
    automated_requirements_ready: handoff.automated_requirements_ready,
    real_send_verified: handoff.real_send_verified,
    real_send_attempted_by_handoff: handoff.real_send_attempted_by_handoff,
    latest_controlled_send_material_kit: handoff.latest_controlled_send_material_kit?.path ?? null,
    latest_controlled_send_real_window_readiness: handoff.latest_controlled_send_real_window_readiness?.path ?? null,
    latest_controlled_send_command_preflight: handoff.latest_controlled_send_command_preflight?.path ?? null,
    latest_controlled_send_command_draft: handoff.latest_controlled_send_command_draft?.path ?? null,
    latest_controlled_send_command_confirmation: handoff.latest_controlled_send_command_confirmation?.path ?? null,
    latest_controlled_send_trial: handoff.latest_controlled_send_trial?.path ?? null,
    latest_tool_intake_bridge: handoff.latest_tool_intake_bridge?.path ?? null,
    operator_next_action_count: handoff.operator_next_actions.length,
    pending_operator_actions: handoff.operator_next_actions
      .filter((item) => item.status !== 'complete')
      .map((item) => item.action_id),
    json_path: written.json_path,
    markdown_path: written.markdown_path
  }, null, 2));
}
