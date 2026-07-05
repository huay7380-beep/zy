#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildControlledSendMaterialKit,
  writeControlledSendMaterialKit
} from '../packages/intake-runtime/src/index.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function nowIso() {
  return new Date().toISOString();
}

function writeJson(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runNodeScript(scriptPath, args) {
  const result = spawnSync(process.execPath, [path.join(projectRoot, scriptPath), ...args], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error([
      `${scriptPath} failed with status ${result.status}`,
      result.stdout ? `stdout:\n${result.stdout}` : null,
      result.stderr ? `stderr:\n${result.stderr}` : null
    ].filter(Boolean).join('\n'));
  }
  return result.stdout.trim() ? JSON.parse(result.stdout) : {};
}

function buildCommand({ runId, messageDraft, createdAt }) {
  return {
    send_command_id: `send_command_${runId}`,
    event_id: `event_${runId}`,
    decision_id: `decision_${runId}`,
    trigger_id: `trigger_${runId}`,
    target_platform: 'wechat',
    target_person_id: `person_${runId}`,
    target_thread_hint: {
      channel: 'wechat',
      conversation_title: `controlled-send-simulation-${runId}`,
      target_display_name: 'controlled-send-simulation-target',
      platform_handle: 'simulation-only'
    },
    message_draft: messageDraft,
    requires_user_confirmation: true,
    user_confirmed: true,
    real_execution_allowed: true,
    safety_checks: {
      window_matches: true,
      thread_matches: true,
      draft_matches: true,
      permission_granted: true,
      notes: [
        'Simulation-only command material for the controlled send acceptance chain.',
        'No production contact is used.',
        'No real desktop send is attempted by this script.'
      ]
    },
    created_at: createdAt,
    metadata: {
      controlled_send_scope: 'test_account_or_test_window',
      no_production_contact: true,
      operator_confirmation: 'confirmed_for_controlled_send',
      operator_confirmed_at: createdAt,
      verification_mode: 'simulated',
      simulation_only: true,
      prepared_by: 'scripts/run-controlled-send-simulation.mjs'
    }
  };
}

function buildBoxRegions(createdAt) {
  return {
    contactList: { x: 10, y: 20, width: 220, height: 720 },
    chatMain: { x: 250, y: 20, width: 820, height: 650 },
    inputBox: { x: 250, y: 700, width: 820, height: 120 },
    unreadIndicator: null,
    displayId: 1,
    scaleFactor: 1,
    capturedAt: Date.parse(createdAt),
    notes: [
      'Synthetic positive rectangles for simulation gate validation only.',
      'These coordinates are not from a real desktop test window.'
    ]
  };
}

function buildSimulatedResult({ trial, command, resultPath, createdAt, runId }) {
  const commandSummary = {
    send_command_id: command.send_command_id,
    event_id: command.event_id,
    decision_id: command.decision_id,
    trigger_id: command.trigger_id,
    target_platform: command.target_platform,
    target_person_id: command.target_person_id,
    target_thread_hint: command.target_thread_hint,
    message_draft_length: command.message_draft.length,
    message_draft_sha256: sha256Text(command.message_draft)
  };
  return {
    schema_version: 'sightflow_real_controlled_send_result.v1',
    verification_mode: 'simulated',
    command_summary: commandSummary,
    send_result: {
      send_result_id: `send_result_${command.send_command_id}`,
      send_command_id: command.send_command_id,
      status: 'sent',
      target_verification: {
        dry_run: false,
        allowed_for_real_execution: true,
        blocked_reasons: [],
        verification_mode: 'simulated',
        trial_id: trial.trial_id
      },
      executed_at: createdAt,
      evidence_refs: [
        'sightflow_desktop_simulated_sent',
        trial.input_path,
        resultPath
      ],
      metadata: {
        executor: 'sightflow_desktop_simulator',
        real_send_attempted: false,
        simulated_send_attempted: true,
        audit_event_required: true,
        feedback_entry_required: true,
        simulation_id: runId
      }
    },
    real_send_attempted: false,
    simulated_send_attempted: true
  };
}

function usage() {
  return [
    'Usage:',
    '  node scripts/run-controlled-send-simulation.mjs [--output-dir=<dir>] [--message=<draft>]',
    '',
    'This command writes simulation-only command material, runs the existing command/preflight/prepare/readiness/handoff gates, and writes a simulated Sightflow result. It never sends a desktop message.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
  process.exit(0);
}

const createdAt = nowIso();
const runId = `controlled_send_simulation_${Date.now()}`;
const root = path.resolve('.');
const outputDir = path.resolve(argValue('output-dir') ?? path.join('runtime/controlled-send-simulations', runId));
const commandPath = path.join(outputDir, 'controlled-send-command.simulated.json');
const boxRegionsPath = path.join(outputDir, 'controlled-send-box-regions.simulated.json');
const summaryPath = path.join(outputDir, 'controlled-send-simulation.json');
const messageDraft = argValue('message')
  ?? 'Controlled send simulation acceptance message. No real desktop send is attempted.';
const command = buildCommand({ runId, messageDraft, createdAt });
const boxRegions = buildBoxRegions(createdAt);

try {
  mkdirSync(outputDir, { recursive: true });
  writeJson(commandPath, command);
  writeJson(boxRegionsPath, boxRegions);

  const materialKit = buildControlledSendMaterialKit({
    root,
    commandTargetPath: commandPath,
    boxRegionsTargetPath: boxRegionsPath,
    outputDir: path.join(root, 'runtime/controlled-send-material-kits', runId),
    createdAt
  });
  const materialKitPaths = writeControlledSendMaterialKit({ kit: materialKit });

  const preflight = runNodeScript('scripts/check-controlled-send-command.mjs', [
    `--input=${commandPath}`,
    `--box-regions=${boxRegionsPath}`,
    `--output-dir=${path.join(root, 'runtime/desktop-controlled-send-command-preflights', runId)}`,
    '--require-box-regions',
    '--fail-on-required'
  ]);

  const prepared = runNodeScript('scripts/prepare-controlled-send-trial.mjs', [
    `--input=${commandPath}`,
    `--box-regions=${boxRegionsPath}`,
    `--output-dir=${path.join(root, 'runtime/desktop-controlled-send-trials', runId)}`,
    '--require-box-regions',
    '--fail-on-not-ready'
  ]);
  const trialPath = prepared.json_path;
  const trial = readJson(trialPath);
  const resultPath = trial.handoff.result_path;
  const simulatedResult = buildSimulatedResult({
    trial,
    command,
    resultPath,
    createdAt: nowIso(),
    runId
  });
  writeJson(resultPath, simulatedResult);

  const readiness = runNodeScript('scripts/check-controlled-send-real-window-readiness.mjs', [
    `--command=${commandPath}`,
    `--box-regions=${boxRegionsPath}`,
    `--material-kit=${materialKitPaths.json_path}`,
    `--trial=${trialPath}`,
    `--output-dir=${path.join(root, 'runtime/controlled-send-real-window-readiness', runId)}`,
    '--require-box-regions',
    '--fail-unless-runner-ready'
  ]);

  const handoff = runNodeScript('scripts/write-controlled-send-handoff.mjs', [
    `--trial=${trialPath}`,
    `--material-kit=${materialKitPaths.json_path}`,
    `--readiness=${readiness.json_path}`,
    `--command-preflight=${preflight.json_path}`,
    `--output-dir=${path.join(root, 'runtime/desktop-controlled-send-handoffs', runId)}`
  ]);

  const completionCommand = [
    'npm.cmd run desktop:send:complete-controlled --',
    `--trial=${psQuote(trialPath)}`,
    `--result=${psQuote(resultPath)}`,
    '--fail-on-not-complete',
    '--allow-simulation'
  ].join(' ');
  const auditCommand = 'npm.cmd run desktop:intake:audit -- --fail-on-required';
  const docs16Command = 'npm.cmd run desktop:intake:docs16-status';
  const summary = {
    schema_version: 'controlled_send_simulation.v1',
    simulation_id: runId,
    verification_mode: 'simulated',
    real_send_attempted: false,
    simulated_send_attempted: true,
    command_path: commandPath,
    box_regions_path: boxRegionsPath,
    material_kit_path: materialKitPaths.json_path,
    command_preflight_path: preflight.json_path,
    trial_path: trialPath,
    result_path: resultPath,
    readiness_path: readiness.json_path,
    handoff_path: handoff.json_path,
    gates: {
      command_preflight_ready: preflight.ready_for_prepare_controlled === true,
      trial_ready_for_real_controlled_send: prepared.ready_for_real_controlled_send === true,
      readiness_ready_for_real_runner: readiness.ready_for_real_runner === true,
      real_send_attempted: false
    },
    next_commands: {
      complete_controlled_simulation: completionCommand,
      refresh_intake_audit: auditCommand,
      refresh_docs16_status: docs16Command
    },
    created_at: createdAt
  };
  writeJson(summaryPath, summary);

  console.log(JSON.stringify({
    command: 'run-controlled-send-simulation',
    simulation_id: runId,
    verification_mode: 'simulated',
    real_send_attempted: false,
    simulated_send_attempted: true,
    json_path: summaryPath,
    command_path: commandPath,
    box_regions_path: boxRegionsPath,
    trial_path: trialPath,
    result_path: resultPath,
    readiness_path: readiness.json_path,
    handoff_path: handoff.json_path,
    next_commands: summary.next_commands
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
