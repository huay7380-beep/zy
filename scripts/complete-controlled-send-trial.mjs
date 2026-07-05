#!/usr/bin/env node
import path from 'node:path';
import {
  completeControlledSendTrial,
  writeControlledSendCompletion
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/complete-controlled-send-trial.mjs --trial=<desktop-controlled-send-trial.json> --result=<sightflow-result.json> [--output-dir=<dir>] [--fail-on-not-complete] [--allow-simulation]',
    '',
    'This command never sends a message. It verifies the post-send result produced by the confirmed real test-window runner.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const trialPath = argValue('trial');
  const resultPath = argValue('result');
  if (!trialPath || !resultPath) {
    console.error(usage());
    process.exitCode = 2;
  } else {
    const completion = completeControlledSendTrial({
      trialPath: path.resolve(trialPath),
      resultPath: path.resolve(resultPath)
    });
    const written = writeControlledSendCompletion({
      completion,
      outputDir: argValue('output-dir')
        ? path.resolve(argValue('output-dir'))
        : undefined
    });

    console.log(JSON.stringify({
      command: 'complete-controlled-send-trial',
      completion_id: completion.completion_id,
      gate_decision: completion.gate_decision,
      verification_mode: completion.verification_mode,
      real_send_verified: completion.real_send_verified,
      simulated_send_verified: completion.simulated_send_verified,
      audit_event_ready: completion.audit_event_ready,
      feedback_entry_ready: completion.feedback_entry_ready,
      required_failures: completion.required_failures,
      json_path: written.json_path,
      markdown_path: written.markdown_path
    }, null, 2));

    const simulationAccepted = process.argv.includes('--allow-simulation')
      && completion.simulated_send_verified === true;
    if (
      process.argv.includes('--fail-on-not-complete')
      && completion.real_send_verified !== true
      && !simulationAccepted
    ) {
      process.exitCode = 3;
    }
  }
}
