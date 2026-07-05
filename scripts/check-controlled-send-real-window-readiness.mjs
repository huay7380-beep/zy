#!/usr/bin/env node
import path from 'node:path';
import {
  buildControlledSendRealWindowReadiness,
  writeControlledSendRealWindowReadiness
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function optionalPath(name) {
  const value = argValue(name);
  return value ? path.resolve(value) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/check-controlled-send-real-window-readiness.mjs [--command=<OutboundSendCommand.json>] [--box-regions=<BoxRegions.json>] [--require-box-regions] [--material-kit=<controlled-send-material-kit.json>] [--trial=<desktop-controlled-send-trial.json>] [--completion=<desktop-controlled-send-completion.json>] [--handoff=<desktop-controlled-send-handoff.json>] [--audit=<intake-implementation-audit.json>] [--output-dir=<dir>] [--fail-unless-runner-ready]',
    '',
    'This command never sends a message. It aggregates real test-window readiness and next commands.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
  process.exit(0);
}

const readiness = buildControlledSendRealWindowReadiness({
  root: process.cwd(),
  commandPath: optionalPath('command'),
  boxRegionsPath: optionalPath('box-regions'),
  requireBoxRegions: process.argv.includes('--require-box-regions'),
  materialKitPath: optionalPath('material-kit'),
  trialPath: optionalPath('trial'),
  completionPath: optionalPath('completion'),
  handoffPath: optionalPath('handoff'),
  auditPath: optionalPath('audit')
});
const outputDir = argValue('output-dir') ? path.resolve(argValue('output-dir')) : undefined;
const written = writeControlledSendRealWindowReadiness({ readiness, outputDir });

console.log(JSON.stringify({
  command: 'check-controlled-send-real-window-readiness',
  readiness_id: readiness.readiness_id,
  gate_decision: readiness.gate_decision,
  ready_for_prepare_controlled: readiness.ready_for_prepare_controlled,
  ready_for_real_runner: readiness.ready_for_real_runner,
  real_send_verified: readiness.real_send_verified,
  real_send_attempted_by_readiness: readiness.real_send_attempted_by_readiness,
  current_blockers: readiness.current_blockers,
  json_path: written.json_path,
  markdown_path: written.markdown_path
}, null, 2));

if (process.argv.includes('--fail-unless-runner-ready') && readiness.ready_for_real_runner !== true) {
  process.exitCode = 2;
}
