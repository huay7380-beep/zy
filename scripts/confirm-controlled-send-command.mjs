#!/usr/bin/env node
import path from 'node:path';
import {
  buildControlledSendCommandConfirmation,
  writeControlledSendCommandConfirmation
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/confirm-controlled-send-command.mjs [--draft=<controlled-send-command-draft.json>] [--decision=<reviewed-decision.json>] [--decision-target=<reviewed-decision-target.json>] [--validate-only]',
    '',
    'Without --decision this writes a decision template only.',
    'With --decision it writes runtime/user-inputs/controlled-send-command.real.json only when every controlled test-window confirmation is true.',
    'With --validate-only it checks the reviewed decision but does not write the real command file.',
    'The stable reviewed decision target defaults to runtime/user-inputs/controlled-send-command-confirmation-decision.real.json.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const confirmation = buildControlledSendCommandConfirmation({
    root: process.cwd(),
    draftPath: argValue('draft') ? path.resolve(argValue('draft')) : null,
    decisionPath: argValue('decision') ? path.resolve(argValue('decision')) : null,
    validateOnly: process.argv.includes('--validate-only'),
    targetCommandPath: argValue('target')
      ? path.resolve(argValue('target'))
      : path.resolve('runtime/user-inputs/controlled-send-command.real.json'),
    reviewedDecisionTargetPath: argValue('decision-target')
      ? path.resolve(argValue('decision-target'))
      : path.resolve('runtime/user-inputs/controlled-send-command-confirmation-decision.real.json')
  });
  const written = writeControlledSendCommandConfirmation({ confirmation });

  console.log(JSON.stringify({
    command: 'confirm-controlled-send-command',
    confirmation_id: confirmation.confirmation_id,
    gate_decision: confirmation.gate_decision,
    validate_only: confirmation.validate_only,
    would_write_target: confirmation.would_write_target,
    target_written: confirmation.target_written,
    real_send_attempted: confirmation.real_send_attempted,
    required_failures: confirmation.required_failures,
    json_path: written.json_path,
    markdown_path: written.markdown_path,
    decision_template_path: written.decision_template_path,
    user_input_decision_template_path: written.user_input_decision_template_path,
    reviewed_decision_target_path: written.reviewed_decision_target_path,
    target_command_path: written.target_command_path
  }, null, 2));
}
