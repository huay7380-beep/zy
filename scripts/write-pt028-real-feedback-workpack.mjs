#!/usr/bin/env node
import path from 'node:path';
import {
  buildPt028RealFeedbackWorkpack,
  writePt028RealFeedbackWorkpack
} from '../packages/decision-cluster/src/index.mjs';

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/write-pt028-real-feedback-workpack.mjs [--root=<dir>] [--output-dir=<dir>]',
    '',
    'This command writes a real multi-window feedback worksheet and draft.',
    'It never sends a message and never writes runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve(argValue('root', process.cwd()));
  const workpack = buildPt028RealFeedbackWorkpack({ root });
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : undefined;
  const written = writePt028RealFeedbackWorkpack({ workpack, outputDir });

  console.log(JSON.stringify({
    command: 'write-pt028-real-feedback-workpack',
    workpack_id: workpack.workpack_id,
    gate_decision: workpack.gate_decision,
    real_execution_allowed: workpack.real_execution_allowed,
    real_send_attempted: workpack.real_send_attempted,
    writes_real_feedback_target: workpack.writes_real_feedback_target,
    target_feedback_path: workpack.source.target_feedback_path,
    target_feedback_exists: workpack.source.target_feedback_exists,
    required_failures: workpack.required_failures,
    warning_failures: workpack.warning_failures,
    json_path: written.workpack_json_path,
    markdown_path: written.workpack_markdown_path,
    draft_feedback_path: written.draft_feedback_path,
    latest_path: written.latest_path
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && workpack.required_failures.length > 0) {
    process.exitCode = 2;
  }
}
