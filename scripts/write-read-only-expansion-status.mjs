#!/usr/bin/env node
import path from 'node:path';
import {
  buildReadOnlyExpansionStatus,
  writeReadOnlyExpansionStatus
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/write-read-only-expansion-status.mjs',
    '',
    'Options:',
    '  --root=<dir>                  Workspace root. Defaults to current directory.',
    '  --pilot-import=<file>          Defaults to runtime/user-inputs/pilot-import.real.json.',
    '  --output-dir=<dir>             Defaults to runtime/read-only-expansion-status/<status_id>.',
    '',
    'This command summarizes read-only sample expansion, graph-loop evidence, and future source adapter readiness without sending anything.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const pilotImportPath = argValue('pilot-import')
    ? path.resolve(root, argValue('pilot-import'))
    : path.join(root, 'runtime/user-inputs/pilot-import.real.json');
  const status = buildReadOnlyExpansionStatus({
    root,
    pilotImportPath
  });
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : undefined;
  const written = writeReadOnlyExpansionStatus({
    status,
    outputDir
  });

  console.log(JSON.stringify({
    command: 'write-read-only-expansion-status',
    status_id: status.status_id,
    gate_decision: status.gate_decision,
    goal_complete: status.goal_complete,
    goal_status: status.goal_status,
    real_observations: status.current_samples.real_observations.observation_count,
    effective_observations: status.current_samples.real_observations.effective_observation_count,
    duplicate_suppressed_count: status.current_samples.real_observations.duplicate_suppressed_count,
    non_wechat_real_observations: status.current_samples.real_observations.non_wechat_observation_count,
    effective_non_wechat_real_observations: status.current_samples.real_observations.effective_non_wechat_observation_count,
    required_failures: status.required_failures,
    warning_failures: status.warning_failures,
    json_path: written.json_path,
    markdown_path: written.markdown_path
  }, null, 2));

  if (status.required_failures.length > 0 && process.argv.includes('--fail-on-required')) {
    process.exitCode = 2;
  }
}
