#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  validateSourceAdapterConformance,
  writeSourceAdapterConformance
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/validate-source-adapter-conformance.mjs --capability=<SourceAdapterCapability.json> --observation=<IntakeObservation.json> [--output-dir=<dir>] [--fail-on-required]',
    '',
    'Defaults:',
    '  --capability=examples/source-adapter-capability.sample.json',
    '  --observation=examples/intake-observation.sightflow.sample.json',
    '',
    'This command verifies that a future source adapter can enter the shared IntakeObservation -> RawEvent path without changing the main flow.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const capabilityPath = path.resolve(argValue('capability') ?? 'examples/source-adapter-capability.sample.json');
  const observationPath = path.resolve(argValue('observation') ?? 'examples/intake-observation.sightflow.sample.json');
  const conformance = validateSourceAdapterConformance({
    capability: JSON.parse(readFileSync(capabilityPath, 'utf8')),
    observation: JSON.parse(readFileSync(observationPath, 'utf8')),
    capabilityPath,
    observationPath
  });
  const written = writeSourceAdapterConformance({
    conformance,
    outputDir: argValue('output-dir') ? path.resolve(argValue('output-dir')) : undefined
  });

  console.log(JSON.stringify({
    command: 'validate-source-adapter-conformance',
    validation_id: conformance.validation_id,
    gate_decision: conformance.gate_decision,
    ready_for_intake: conformance.ready_for_intake,
    required_failures: conformance.required_failures,
    json_path: written.json_path,
    markdown_path: written.markdown_path
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && conformance.required_failures.length > 0) {
    process.exitCode = 2;
  }
}
