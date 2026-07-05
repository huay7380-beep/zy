#!/usr/bin/env node
import path from 'node:path';
import {
  buildControlledSendOperatorPack,
  writeControlledSendOperatorPack
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/write-controlled-send-operator-pack.mjs [--output-dir=<dir>]',
    '',
    'This command never sends a message and never writes runtime/user-inputs/controlled-send-command.real.json.',
    'It bundles the latest command draft, reviewed-decision template, preflight, prepare, runner and completion instructions for a controlled real test window.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const pack = buildControlledSendOperatorPack({
    root: process.cwd()
  });
  if (argValue('output-dir')) {
    pack.output_dir = path.resolve(argValue('output-dir'));
  }
  const written = writeControlledSendOperatorPack({ pack });

  console.log(JSON.stringify({
    command: 'write-controlled-send-operator-pack',
    pack_id: pack.pack_id,
    gate_decision: pack.gate_decision,
    real_send_attempted: pack.real_send_attempted,
    real_send_verified: pack.real_send_verified,
    docs16_goal_complete: pack.docs16_goal_complete,
    simulation_goal_complete: pack.simulation_goal_complete,
    current_blockers: pack.current_blockers,
    pending_operator_actions: pack.operator_actions
      .filter((item) => item.status !== 'complete')
      .map((item) => item.action_id),
    json_path: written.json_path,
    markdown_path: written.markdown_path,
    html_path: written.html_path
  }, null, 2));
}
