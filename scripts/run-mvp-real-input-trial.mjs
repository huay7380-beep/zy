#!/usr/bin/env node
import path from 'node:path';
import {
  runMvpRealInputTrial
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/run-mvp-real-input-trial.mjs',
    '',
    'Options:',
    '  --kit=<file>           Optional mvp-external-input-kit.json. Defaults to latest runtime/input-kits/**.',
    '  --root=<dir>           Workspace root. Defaults to current directory.',
    '  --user-feedback=<file> Optional MvpUserFeedback JSON for special-test second-pass optimization.',
    '  --process-tree=<file>  Defaults to examples/system-process-tree.json.',
    '  --output-dir=<dir>     Defaults to runtime/real-input-trials/<trial_id>.',
    '  --fail-on-not-ready    Exit 2 when the trial is not ready for issue-register review.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const inputKitPath = argValue('kit') ? path.resolve(argValue('kit')) : null;
  const userFeedbackPath = argValue('user-feedback') ? path.resolve(argValue('user-feedback')) : null;
  const processTreePath = argValue('process-tree')
    ? path.resolve(argValue('process-tree'))
    : path.join(root, 'examples/system-process-tree.json');
  const outputDir = argValue('output-dir') ? path.resolve(argValue('output-dir')) : null;

  const result = runMvpRealInputTrial({
    root,
    inputKitPath,
    userFeedbackPath,
    processTreePath,
    outputDir
  });

  console.log(JSON.stringify({
    command: 'run-mvp-real-input-trial',
    trial_id: result.trial.trial_id,
    gate_decision: result.trial.gate_decision,
    ready_for_user_special_testing: result.trial.ready_for_user_special_testing,
    ready_for_issue_register_review: result.trial.ready_for_issue_register_review,
    ready_to_expand_sample_or_real_connector: result.trial.ready_to_expand_sample_or_real_connector,
    required_failures: result.trial.required_failures,
    expansion_failures: result.trial.expansion_failures,
    readiness_gate: result.trial.external_input_readiness.gate_decision,
    run_id: result.trial.result_summary?.run_id ?? null,
    json_path: result.written.json_path,
    markdown_path: result.written.markdown_path,
    html_path: result.written.html_path,
    artifacts: result.trial.artifacts
  }, null, 2));

  if (process.argv.includes('--fail-on-not-ready') && !result.trial.ready_for_issue_register_review) {
    process.exitCode = 2;
  }
}
