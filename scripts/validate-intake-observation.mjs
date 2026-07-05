import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  mapObservationToRawEvent,
  normalizeIntakeObservation
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/validate-intake-observation.mjs --input=examples/intake-observation.sightflow.sample.json',
    '',
    'Options:',
    '  --input=<file>       IntakeObservation JSON file.',
    '  --output-dir=<dir>   Output directory. Defaults to runtime/intake-observation-validations/<observation_id>.'
  ].join('\n');
}

function validationMarkdown(validation) {
  return `# Intake Observation Validation

- validation_id: ${validation.validation_id}
- observation_id: ${validation.observation_id}
- gate_decision: ${validation.gate_decision}
- required_failures: ${validation.required_failures.join(', ') || 'none'}

## RawEvent Preview

\`\`\`json
${JSON.stringify(validation.raw_event_preview, null, 2)}
\`\`\`
`;
}

const inputPath = argValue('input');

if (!inputPath) {
  console.error(usage());
  process.exitCode = 1;
} else {
  const absoluteInputPath = path.resolve(inputPath);
  const observation = JSON.parse(readFileSync(absoluteInputPath, 'utf8'));
  const validationId = `intake_observation_validation_${Date.now()}`;
  let validation;

  try {
    const normalized = normalizeIntakeObservation(observation);
    validation = {
      schema_version: 'intake_observation_validation.v1',
      validation_id: validationId,
      observation_id: normalized.observation_id,
      source_adapter_id: normalized.source_adapter_id,
      gate_decision: 'intake_observation_valid',
      required_failures: [],
      raw_event_preview: mapObservationToRawEvent(normalized)
    };
  } catch (error) {
    validation = {
      schema_version: 'intake_observation_validation.v1',
      validation_id: validationId,
      observation_id: observation?.observation_id ?? 'unknown',
      source_adapter_id: observation?.source_adapter_id ?? 'unknown',
      gate_decision: 'intake_observation_invalid',
      required_failures: [error.message],
      raw_event_preview: null
    };
  }

  const outputDir = argValue('output-dir')
    ? path.resolve(argValue('output-dir'))
    : path.resolve('runtime/intake-observation-validations', validation.observation_id);
  const jsonPath = path.join(outputDir, 'intake-observation-validation.json');
  const markdownPath = path.join(outputDir, 'intake-observation-validation.md');

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(validation, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, validationMarkdown(validation), 'utf8');

  console.log(JSON.stringify({
    command: 'validate-intake-observation',
    observation_id: validation.observation_id,
    gate_decision: validation.gate_decision,
    required_failures: validation.required_failures,
    json_path: jsonPath,
    markdown_path: markdownPath
  }, null, 2));

  if (validation.required_failures.length) {
    process.exitCode = 1;
  }
}

