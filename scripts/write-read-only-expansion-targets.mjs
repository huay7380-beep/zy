#!/usr/bin/env node
import path from 'node:path';
import {
  buildReadOnlyExpansionTargets,
  writeReadOnlyExpansionTargets
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/write-read-only-expansion-targets.mjs',
    '',
    'Options:',
    '  --root=<dir>                  Workspace root. Defaults to current directory.',
    '  --pilot-import=<file>          Defaults to runtime/user-inputs/pilot-import.real.json.',
    '  --output-dir=<dir>             Defaults to runtime/read-only-expansion-targets/<target_plan_id>.',
    '  --fail-on-required            Exit code 2 if the underlying status has required failures.',
    '',
    'This command writes weighted next read-only sampling targets without sending anything.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const pilotImportPath = argValue('pilot-import')
    ? path.resolve(root, argValue('pilot-import'))
    : path.join(root, 'runtime/user-inputs/pilot-import.real.json');
  const plan = buildReadOnlyExpansionTargets({
    root,
    pilotImportPath
  });
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : undefined;
  const written = writeReadOnlyExpansionTargets({
    plan,
    outputDir
  });

  console.log(JSON.stringify({
    command: 'write-read-only-expansion-targets',
    target_plan_id: plan.target_plan_id,
    gate_decision: plan.gate_decision,
    real_execution_allowed: plan.real_execution_allowed,
    real_send_attempted: plan.real_send_attempted,
    target_count: plan.target_recommendations.length,
    top_target_ids: plan.target_recommendations.slice(0, 3).map((target) => target.target_id),
    blocking_target_ids: plan.blocking_target_ids,
    required_failures: plan.required_failures,
    warning_failures: plan.warning_failures,
    json_path: written.json_path,
    markdown_path: written.markdown_path
  }, null, 2));

  if (plan.required_failures.length > 0 && process.argv.includes('--fail-on-required')) {
    process.exitCode = 2;
  }
}
