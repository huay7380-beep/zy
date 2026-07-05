#!/usr/bin/env node
import path from 'node:path';
import {
  buildDocs16ImplementationStatus,
  writeDocs16ImplementationStatus
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/write-docs16-implementation-status.mjs [--output-dir=<dir>] [--fail-on-incomplete]',
    '',
    'This command never sends a message. It audits docs/16 implementation evidence, writes operator_next_actions, and keeps real-send verification incomplete until completion and refreshed audit evidence both exist.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const status = buildDocs16ImplementationStatus({ root: process.cwd() });
  const outputDir = argValue('output-dir') ? path.resolve(argValue('output-dir')) : undefined;
  const written = writeDocs16ImplementationStatus({ status, outputDir });

  console.log(JSON.stringify({
    command: 'write-docs16-implementation-status',
    status_id: status.status_id,
    gate_decision: status.gate_decision,
    automated_requirements_ready: status.automated_requirements_ready,
    real_send_verified: status.real_send_verified,
    simulated_send_verified: status.simulated_send_verified,
    runner_environment_contract_ready: status.runner_environment_contract_ready,
    goal_complete: status.goal_complete,
    simulation_goal_complete: status.simulation_goal_complete,
    completed_count: status.completed_count,
    incomplete_count: status.incomplete_count,
    external_pending: status.external_pending,
    operator_next_action_count: status.operator_next_actions.length,
    pending_operator_actions: status.operator_next_actions
      .filter((item) => ['pending', 'blocked'].includes(item.status))
      .map((item) => item.action_id),
    json_path: written.json_path,
    markdown_path: written.markdown_path
  }, null, 2));

  if (process.argv.includes('--fail-on-incomplete') && status.goal_complete !== true) {
    process.exitCode = 2;
  }
}
