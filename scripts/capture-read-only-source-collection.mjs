#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReadOnlySourceCollection,
  writeReadOnlySourceCollection
} from '../packages/intake-runtime/src/index.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/capture-read-only-source-collection.mjs --manifest=<manifest.json>',
    '',
    'Options:',
    '  --root=<dir>                  Workspace root. Defaults to current directory.',
    '  --output-dir=<dir>            Defaults to runtime/read-only-source-collections/<collection_id>.',
    '  --run-trial                   After collecting, run read-only expansion trial against this collection.',
    '  --trial-output-dir=<dir>      Defaults to <output-dir>/trial when --run-trial is set.',
    '  --pilot-import=<file>         Optional reference PilotImportBatch for --run-trial.',
    '  --goal=<text>                 Optional generated-batch goal for --run-trial.',
    '  --fail-on-required            Exit with code 2 when required checks fail.',
    '',
    'The manifest can include external_chat_export, browser_html and business_api_snapshot sources.',
    'This command reads saved local files only, writes IntakeObservation artifacts, and never sends messages.'
  ].join('\n');
}

function relativeOrOriginal(root, filePath) {
  if (!filePath) return null;
  const relative = path.relative(root, filePath);
  return relative.startsWith('..') ? filePath : relative.replaceAll(path.sep, '/');
}

function buildCheck(checkId, passed, evidence, severity = 'required') {
  return {
    check_id: checkId,
    severity,
    status: passed ? 'pass' : 'fail',
    passed: Boolean(passed),
    evidence
  };
}

function attachDownstreamTrial({ collection, root, trialOutputDir, pilotImportPath, goal }) {
  const workspaceRoot = path.dirname(scriptDir);
  const commandArgs = [
    path.join(scriptDir, 'run-read-only-expansion-trial.mjs'),
    `--root=${workspaceRoot}`,
    `--source-dir=${collection.source.output_dir}`,
    `--output-dir=${trialOutputDir}`,
    '--fail-on-required'
  ];
  if (pilotImportPath) commandArgs.push(`--pilot-import=${pilotImportPath}`);
  if (goal) commandArgs.push(`--goal=${goal}`);

  if (collection.required_failures.length > 0) {
    collection.downstream_trial = {
      requested: true,
      skipped: true,
      skip_reason: 'collection_required_failures_present',
      command: `${process.execPath} ${commandArgs.join(' ')}`
    };
    collection.required_failures.push('downstream_trial_skipped_collection_not_ready');
    collection.checks.push(buildCheck(
      'downstream_trial_ready',
      false,
      ['collection required_failures must be empty before running trial']
    ));
    collection.gate_decision = 'read_only_source_collection_needs_attention';
    return collection;
  }

  const result = spawnSync(process.execPath, commandArgs, {
    cwd: workspaceRoot,
    encoding: 'utf8'
  });
  let stdout = null;
  try {
    stdout = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    stdout = null;
  }
  const passed = result.status === 0 && stdout?.required_failures?.length === 0;
  collection.downstream_trial = {
    requested: true,
    skipped: false,
    command: `${process.execPath} ${commandArgs.join(' ')}`,
    exit_code: result.status,
    gate_decision: stdout?.gate_decision ?? 'trial_command_failed',
    trial_id: stdout?.trial_id ?? null,
    real_execution_allowed: stdout?.real_execution_allowed === true,
    real_send_attempted: stdout?.real_send_attempted === true,
    raw_observation_count: stdout?.raw_observation_count ?? null,
    effective_observation_count: stdout?.effective_observation_count ?? null,
    generated_pilot_import_ready_for_decision: stdout?.generated_pilot_import_ready_for_decision === true,
    generated_pilot_import_ready_for_closed_loop_mvp: stdout?.generated_pilot_import_ready_for_closed_loop_mvp === true,
    graph_loop_gate_decision: stdout?.graph_loop_gate_decision ?? null,
    required_failures: stdout?.required_failures ?? ['trial_stdout_missing_or_invalid'],
    json_path: stdout?.json_path ? relativeOrOriginal(root, stdout.json_path) : null,
    markdown_path: stdout?.markdown_path ? relativeOrOriginal(root, stdout.markdown_path) : null,
    generated_pilot_import_path: stdout?.generated_pilot_import_path ? relativeOrOriginal(root, stdout.generated_pilot_import_path) : null,
    graph_loop_verification_path: stdout?.graph_loop_verification_path ? relativeOrOriginal(root, stdout.graph_loop_verification_path) : null,
    stderr: result.stderr?.trim() || null
  };
  collection.checks.push(buildCheck(
    'downstream_trial_ready',
    passed,
    [
      `exit_code=${result.status}`,
      `gate_decision=${collection.downstream_trial.gate_decision}`,
      `required_failures=${collection.downstream_trial.required_failures.join(',') || 'none'}`,
      `real_send_attempted=${collection.downstream_trial.real_send_attempted}`
    ]
  ));
  if (!passed) {
    collection.required_failures.push('downstream_trial_failed');
    collection.gate_decision = 'read_only_source_collection_needs_attention';
  } else {
    collection.summary.ready_for_read_only_trial = true;
    collection.gate_decision = 'read_only_source_collection_ready_for_trial';
  }
  collection.next_commands = [
    collection.downstream_trial.generated_pilot_import_path
      ? `npm.cmd run pilot:feedback:append -- --pilot-import=${collection.downstream_trial.generated_pilot_import_path}`
      : collection.next_commands[0],
    'npm.cmd run intake:read-only:workpack',
    'npm.cmd run mvp:status'
  ];
  return collection;
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve(argValue('root', process.cwd()));
  const manifestArg = argValue('manifest');
  if (!manifestArg) {
    console.error(usage());
    process.exit(1);
  }
  const manifestPath = path.resolve(root, manifestArg);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
  const collection = buildReadOnlySourceCollection({
    manifest,
    manifestPath,
    root,
    outputDir: argValue('output-dir')
  });
  if (process.argv.includes('--run-trial')) {
    const trialOutputDir = argValue('trial-output-dir')
      ? path.resolve(root, argValue('trial-output-dir'))
      : path.join(collection.source.output_dir, 'trial');
    attachDownstreamTrial({
      collection,
      root,
      trialOutputDir,
      pilotImportPath: argValue('pilot-import')
        ? path.resolve(root, argValue('pilot-import'))
        : null,
      goal: argValue('goal')
    });
  }
  const written = writeReadOnlySourceCollection({
    collection,
    outputDir: collection.source.output_dir,
    manifest
  });

  console.log(JSON.stringify({
    command: 'capture-read-only-source-collection',
    collection_id: collection.collection_id,
    gate_decision: collection.gate_decision,
    real_execution_allowed: collection.real_execution_allowed,
    real_send_attempted: collection.real_send_attempted,
    manifest_sources: collection.summary.manifest_sources,
    collected_observations: collection.summary.collected_observations,
    failed_sources: collection.summary.failed_sources,
    ready_for_read_only_trial: collection.summary.ready_for_read_only_trial,
    warning_failures: collection.warning_failures,
    required_failures: collection.required_failures,
    json_path: written.json_path,
    markdown_path: written.markdown_path,
    manifest_snapshot_path: written.manifest_snapshot_path,
    downstream_trial: collection.downstream_trial ?? null,
    observation_paths: collection.observations.map((item) => item.observation_path),
    next_commands: collection.next_commands
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && collection.required_failures.length > 0) {
    process.exitCode = 2;
  }
}
