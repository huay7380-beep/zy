#!/usr/bin/env node
import path from 'node:path';
import {
  runGoalOrientedInteractionBacktest,
  writeGoalOrientedInteractionBacktest
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/run-goal-oriented-backtest.mjs',
    '',
    'Options:',
    '  --root=<dir>                 Workspace root. Defaults to current directory.',
    '  --theory=<file>              Defaults to tupu/05-三类真实事件逐轮回测结果.md.',
    '  --output-dir=<dir>           Defaults to runtime/goal-oriented-backtests/<backtest_id>.',
    '  --tupu-summary=<file>        Optional Markdown copy, e.g. tupu/07-理论与代码工程回测一致性结果.md.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const theoryMarkdownPath = argValue('theory')
    ? path.resolve(root, argValue('theory'))
    : undefined;
  const backtest = runGoalOrientedInteractionBacktest({
    root,
    theoryMarkdownPath
  });
  const written = writeGoalOrientedInteractionBacktest({
    backtest,
    outputDir: argValue('output-dir') ? path.resolve(root, argValue('output-dir')) : undefined,
    tupuSummaryPath: argValue('tupu-summary') ? path.resolve(root, argValue('tupu-summary')) : null
  });

  console.log(JSON.stringify({
    command: 'run-goal-oriented-backtest',
    backtest_id: backtest.backtest_id,
    gate_decision: backtest.gate_decision,
    metrics: backtest.metrics,
    hard_exit_signals: backtest.hard_exit_signals,
    json_path: written.json_path,
    markdown_path: written.markdown_path,
    tupu_summary_path: written.tupu_summary_path
  }, null, 2));

  if (backtest.hard_exit_signals.length > 0) {
    process.exitCode = 2;
  }
}
