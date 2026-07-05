#!/usr/bin/env node
import path from 'node:path';
import {
  buildReadOnlyExpansionWorkpack,
  writeReadOnlyExpansionWorkpack
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/write-read-only-expansion-workpack.mjs',
    '',
    'Options:',
    '  --root=<dir>                  Workspace root. Defaults to current directory.',
    '  --trial=<file>                Optional read-only-expansion-trial.json.',
    '  --targets=<file>              Optional read-only-expansion-targets.json.',
    '  --pilot-import=<file>         Optional generated PilotImportBatch path.',
    '  --output-dir=<dir>            Defaults to runtime/read-only-expansion-workpacks/<workpack_id>.',
    '  --fail-on-required            Exit with code 2 when required checks fail.',
    '',
    'This command packages current read-only samples, graph-loop evidence, target recommendations and a feedback template without sending anything.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve(argValue('root', process.cwd()));
  const workpack = buildReadOnlyExpansionWorkpack({
    root,
    trialPath: argValue('trial'),
    targetsPath: argValue('targets'),
    pilotImportPath: argValue('pilot-import')
  });
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : undefined;
  const written = writeReadOnlyExpansionWorkpack({ workpack, outputDir });

  console.log(JSON.stringify({
    command: 'write-read-only-expansion-workpack',
    workpack_id: workpack.workpack_id,
    gate_decision: workpack.gate_decision,
    real_execution_allowed: workpack.real_execution_allowed,
    real_send_attempted: workpack.real_send_attempted,
    raw_observation_count: workpack.sample_summary.raw_observation_count,
    effective_observation_count: workpack.sample_summary.effective_observation_count,
    generated_batch_ready_for_decision: workpack.sample_summary.ready_for_decision_trial,
    generated_batch_ready_for_closed_loop_mvp: workpack.sample_summary.ready_for_closed_loop_mvp,
    graph_loop_gate_decision: workpack.graph_loop_summary.gate_decision,
    feedback_template_id: workpack.feedback_collection.summary.template_feedback_id,
    top_target_ids: workpack.next_sampling_targets.top_targets.slice(0, 3).map((target) => target.target_id),
    required_failures: workpack.required_failures,
    warning_failures: workpack.warning_failures,
    json_path: written.workpack_json_path,
    markdown_path: written.workpack_markdown_path,
    feedback_template_path: written.feedback_template_path
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && workpack.required_failures.length > 0) {
    process.exitCode = 2;
  }
}
