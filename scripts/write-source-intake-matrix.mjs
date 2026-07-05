#!/usr/bin/env node
import path from 'node:path';
import {
  buildSourceIntakeMatrix,
  writeSourceIntakeMatrix
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/write-source-intake-matrix.mjs [--root=<dir>] [--output-dir=<dir>] [--fail-on-required]',
    '',
    'This command writes source_intake_matrix.v1 by scanning known source adapter conformance, real read-only IntakeObservation artifacts, RawEvent mapping, and latest generated PilotImportBatch coverage without sending anything.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const matrix = buildSourceIntakeMatrix({ root });
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : undefined;
  const written = writeSourceIntakeMatrix({ matrix, outputDir });

  console.log(JSON.stringify({
    command: 'write-source-intake-matrix',
    matrix_id: matrix.matrix_id,
    gate_decision: matrix.gate_decision,
    real_execution_allowed: matrix.real_execution_allowed,
    real_send_attempted: matrix.real_send_attempted,
    conformance_ready_lanes: matrix.summary.conformance_ready_lanes,
    lane_count: matrix.summary.lane_count,
    lanes_with_real_samples: matrix.summary.lanes_with_real_samples,
    required_goal_lanes_with_real_samples: matrix.summary.required_goal_lanes_with_real_samples,
    required_goal_lanes: matrix.summary.required_goal_lanes,
    ready_for_new_adapter_without_main_flow_change: matrix.summary.ready_for_new_adapter_without_main_flow_change,
    required_failures: matrix.required_failures,
    warning_failures: matrix.warning_failures,
    json_path: written.json_path,
    markdown_path: written.markdown_path
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && matrix.required_failures.length > 0) {
    process.exitCode = 2;
  }
}
