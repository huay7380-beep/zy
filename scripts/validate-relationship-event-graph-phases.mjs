import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  latestPhaseRunPath,
  validateRelationshipEventGraphPhaseRun
} from '../packages/relationship-event-graph/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const inputPath = argValue('input')
  ? path.resolve(argValue('input'))
  : latestPhaseRunPath();

if (!inputPath) {
  console.error('No relationship event graph phase run found. Run npm run relationship-event:phases first.');
  process.exit(2);
}

const phaseRun = JSON.parse(readFileSync(inputPath, 'utf8'));
const validation = validateRelationshipEventGraphPhaseRun(phaseRun);

console.log(JSON.stringify({
  command: 'validate-relationship-event-graph-phases',
  input_path: inputPath,
  validation_id: validation.validation_id,
  gate_decision: validation.gate_decision,
  required_failures: validation.required_failures,
  warning_failures: validation.warning_failures
}, null, 2));

if (validation.required_failures.length > 0) {
  process.exitCode = 2;
}
