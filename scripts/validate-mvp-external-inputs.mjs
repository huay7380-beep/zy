#!/usr/bin/env node
import path from 'node:path';
import {
  evaluateMvpExternalInputReadiness,
  writeMvpExternalInputReadiness
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/validate-mvp-external-inputs.mjs',
    '',
    'Options:',
    '  --kit=<file>        Optional mvp-external-input-kit.json. Defaults to latest runtime/input-kits/**.',
    '  --root=<dir>        Workspace root. Defaults to current directory.',
    '  --output-dir=<dir>  Output directory. Defaults to runtime/input-readiness/<readiness_id>.',
    '  --fail-on-not-ready Exit 2 when ready_for_real_input_trial=false.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const inputKitPath = argValue('kit') ? path.resolve(argValue('kit')) : null;
  const readiness = evaluateMvpExternalInputReadiness({
    root,
    inputKitPath
  });
  const outputDir = argValue('output-dir')
    ? path.resolve(argValue('output-dir'))
    : path.join(root, 'runtime/input-readiness', readiness.readiness_id);
  const written = writeMvpExternalInputReadiness({
    readiness,
    outputDir
  });

  console.log(JSON.stringify({
    command: 'validate-mvp-external-inputs',
    readiness_id: readiness.readiness_id,
    gate_decision: readiness.gate_decision,
    ready_for_real_input_trial: readiness.ready_for_real_input_trial,
    required_failures: readiness.required_failures,
    json_path: written.json_path,
    markdown_path: written.markdown_path
  }, null, 2));

  if (process.argv.includes('--fail-on-not-ready') && !readiness.ready_for_real_input_trial) {
    process.exitCode = 2;
  }
}
