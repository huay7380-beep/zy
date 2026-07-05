import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { analyzePilotIntakeReadiness } from '../packages/storage-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/validate-pilot-intake.mjs --input=examples/pilot-import-batch.sample.json',
    '',
    'Options:',
    '  --input=<file>                  PilotImportBatch JSON file.',
    '  --output-dir=<dir>              Output directory. Defaults to runtime/intake-validations/<import_id>.',
    '  --min-raw-events=<number>       Defaults to 10.',
    '  --min-semantic-coverage=<num>   Defaults to 0.7.',
    '  --max-single-client-minutes=<n> Defaults to 60.'
  ].join('\n');
}

function numberArg(name, fallback) {
  const value = argValue(name);
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid --${name}: ${value}`);
  }
  return parsed;
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function readinessMarkdown(readiness) {
  const checkRows = readiness.checks
    .map((check) => [
      check.check_id,
      check.severity,
      check.status,
      check.evidence.join('<br>'),
      check.fix ?? ''
    ].map(escapeCell).join(' | '))
    .join('\n');
  const missingRows = readiness.missing_materials.length
    ? readiness.missing_materials
        .map((item) => `- ${item.severity}: ${item.check_id} -> ${item.fix}`)
        .join('\n')
    : '- none';

  return `# Pilot Intake Readiness

- readiness_id: ${readiness.readiness_id}
- import_id: ${readiness.import_id}
- gate_decision: ${readiness.gate_decision}
- ready_for_decision_trial: ${readiness.ready_for_decision_trial}
- ready_for_closed_loop_mvp: ${readiness.ready_for_closed_loop_mvp}
- required_failures: ${readiness.required_failures.join(', ') || 'none'}
- recommended_failures: ${readiness.recommended_failures.join(', ') || 'none'}

## Metrics

\`\`\`json
${JSON.stringify(readiness.metrics, null, 2)}
\`\`\`

## Checks

check_id | severity | status | evidence | fix
--- | --- | --- | --- | ---
${checkRows}

## Missing Materials

${missingRows}

## Next Commands

\`\`\`bash
${readiness.next_commands.validate_intake}
${readiness.next_commands.dry_run_import}
${readiness.next_commands.run_mvp}
${readiness.next_commands.audit_after_run}
\`\`\`
`;
}

const inputPath = argValue('input');

if (!inputPath) {
  console.error(usage());
  process.exitCode = 1;
} else {
  const absoluteInputPath = path.resolve(inputPath);
  const batch = JSON.parse(readFileSync(absoluteInputPath, 'utf8'));
  const readiness = analyzePilotIntakeReadiness(batch, {
    inputPath,
    minRawEvents: numberArg('min-raw-events', 10),
    minSemanticCoverage: numberArg('min-semantic-coverage', 0.7),
    maxSingleClientMinutes: numberArg('max-single-client-minutes', 60)
  });
  const outputDir = argValue('output-dir')
    ? path.resolve(argValue('output-dir'))
    : path.resolve('runtime/intake-validations', readiness.import_id);
  const jsonPath = path.join(outputDir, 'pilot-intake-readiness.json');
  const markdownPath = path.join(outputDir, 'pilot-intake-readiness.md');

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(readiness, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, readinessMarkdown(readiness), 'utf8');

  console.log(JSON.stringify({
    command: 'validate-pilot-intake',
    import_id: readiness.import_id,
    gate_decision: readiness.gate_decision,
    ready_for_decision_trial: readiness.ready_for_decision_trial,
    ready_for_closed_loop_mvp: readiness.ready_for_closed_loop_mvp,
    required_failures: readiness.required_failures,
    recommended_failures: readiness.recommended_failures,
    json_path: jsonPath,
    markdown_path: markdownPath
  }, null, 2));
}
