#!/usr/bin/env node
import path from 'node:path';
import {
  buildReadOnlyDuplicateObservationReview,
  writeReadOnlyDuplicateObservationReview
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/review-read-only-duplicate-observations.mjs',
    '',
    'Options:',
    '  --root=<dir>                  Workspace root. Defaults to current directory.',
    '  --status=<file>               Optional read-only-expansion-status.json. Defaults to latest runtime status.',
    '  --output-dir=<dir>            Defaults to runtime/read-only-duplicate-observation-reviews/<review_id>.',
    '  --fail-on-required            Exit code 2 if required checks fail.',
    '',
    'This command reviews duplicate read-only observation groups without deleting files or sending messages.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const review = buildReadOnlyDuplicateObservationReview({
    root,
    statusPath: argValue('status') ? path.resolve(root, argValue('status')) : undefined
  });
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : undefined;
  const written = writeReadOnlyDuplicateObservationReview({
    review,
    outputDir
  });

  console.log(JSON.stringify({
    command: 'review-read-only-duplicate-observations',
    review_id: review.review_id,
    gate_decision: review.gate_decision,
    real_execution_allowed: review.real_execution_allowed,
    real_send_attempted: review.real_send_attempted,
    duplicate_group_count: review.summary.duplicate_group_count,
    deterministic_suppression_ready_groups: review.summary.deterministic_suppression_ready_groups,
    operator_confirmation_required: review.summary.operator_confirmation_required,
    required_failures: review.required_failures,
    warning_failures: review.warning_failures,
    json_path: written.json_path,
    markdown_path: written.markdown_path
  }, null, 2));

  if (review.required_failures.length > 0 && process.argv.includes('--fail-on-required')) {
    process.exitCode = 2;
  }
}
