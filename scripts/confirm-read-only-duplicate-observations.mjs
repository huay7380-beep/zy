#!/usr/bin/env node
import path from 'node:path';
import {
  buildReadOnlyDuplicateObservationConfirmation,
  writeReadOnlyDuplicateObservationConfirmation
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/confirm-read-only-duplicate-observations.mjs',
    '',
    'Options:',
    '  --root=<dir>                  Workspace root. Defaults to current directory.',
    '  --review=<file>               Optional duplicate review JSON. Defaults to latest runtime review.',
    '  --decision=<file>             Optional reviewed decision JSON. Omit to write a decision template only.',
    '  --output-dir=<dir>            Defaults to runtime/read-only-duplicate-observation-confirmations/<confirmation_id>.',
    '  --fail-on-required            Exit code 2 if required checks fail.',
    '',
    'This command records operator confirmation for duplicate read-only observations. It never deletes evidence or sends messages.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const confirmation = buildReadOnlyDuplicateObservationConfirmation({
    root,
    reviewPath: argValue('review') ? path.resolve(root, argValue('review')) : undefined,
    decisionPath: argValue('decision') ? path.resolve(root, argValue('decision')) : null
  });
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : undefined;
  const written = writeReadOnlyDuplicateObservationConfirmation({
    confirmation,
    outputDir
  });

  console.log(JSON.stringify({
    command: 'confirm-read-only-duplicate-observations',
    confirmation_id: confirmation.confirmation_id,
    gate_decision: confirmation.gate_decision,
    real_execution_allowed: confirmation.real_execution_allowed,
    real_send_attempted: confirmation.real_send_attempted,
    duplicate_group_count: confirmation.summary.duplicate_group_count,
    accepted_group_count: confirmation.summary.accepted_group_count,
    duplicate_suppression_confirmed: confirmation.summary.duplicate_suppression_confirmed,
    operator_confirmation_recorded: confirmation.summary.operator_confirmation_recorded,
    required_failures: confirmation.required_failures,
    warning_failures: confirmation.warning_failures,
    json_path: written.json_path,
    markdown_path: written.markdown_path,
    template_path: written.template_path
  }, null, 2));

  if (confirmation.required_failures.length > 0 && process.argv.includes('--fail-on-required')) {
    process.exitCode = 2;
  }
}
