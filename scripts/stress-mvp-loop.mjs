#!/usr/bin/env node
import path from 'node:path';
import {
  runMvpStressTest,
  writeMvpStressTest
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function numberArg(name, fallback) {
  const value = argValue(name);
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid --${name}: ${value}`);
  }
  return parsed;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/stress-mvp-loop.mjs --runs=10',
    '',
    'Options:',
    '  --runs=<number>          Iterations. Defaults to 10.',
    '  --pilot-import=<file>    Defaults to examples/pilot-import-batch.sample.json.',
    '  --user-feedback=<file>   Defaults to examples/mvp-user-feedback.sample.json.',
    '  --process-tree=<file>    Defaults to examples/system-process-tree.json.',
    '  --output-dir=<dir>       Defaults to runtime/mvp-stress-tests/<stress_id>.',
    '  --keep-workspaces=true   Keep per-iteration temporary workspaces.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const workspaceRoot = process.cwd();
  const outputDir = argValue('output-dir') ? path.resolve(argValue('output-dir')) : null;
  const stress = runMvpStressTest({
    workspaceRoot,
    runs: numberArg('runs', 10),
    importPath: path.resolve(argValue('pilot-import') ?? 'examples/pilot-import-batch.sample.json'),
    userFeedbackPath: path.resolve(argValue('user-feedback') ?? 'examples/mvp-user-feedback.sample.json'),
    processTreePath: path.resolve(argValue('process-tree') ?? 'examples/system-process-tree.json'),
    outputDir,
    keepWorkspaces: argValue('keep-workspaces') === 'true'
  });
  const written = writeMvpStressTest({
    stress,
    outputDir: outputDir ?? undefined
  });

  console.log(JSON.stringify({
    command: 'stress-mvp-loop',
    stress_id: stress.stress_id,
    gate_decision: stress.gate_decision,
    runs: stress.runs,
    success: stress.success,
    failed: stress.failed,
    avg_ms: stress.metrics.avg_ms,
    p95_ms: stress.metrics.p95_ms,
    hard_exit_signals: stress.hard_exit_signals,
    json_path: written.json_path,
    markdown_path: written.markdown_path
  }, null, 2));

  if (stress.hard_exit_signals.length > 0) {
    process.exitCode = 2;
  }
}
