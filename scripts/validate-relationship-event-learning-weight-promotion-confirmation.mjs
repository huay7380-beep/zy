import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  latestLearningWeightPromotionConfirmationPath,
  validateLearningWeightPromotionConfirmation
} from '../packages/relationship-event-graph/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
const inputPath = argValue('input')
  ? path.resolve(root, argValue('input'))
  : latestLearningWeightPromotionConfirmationPath({ root });

if (!inputPath) {
  console.error('No learning weight promotion confirmation found. Run npm.cmd run relationship-event:promotion-confirmation first.');
  process.exit(2);
}

const confirmation = JSON.parse(readFileSync(inputPath, 'utf8'));
const validation = validateLearningWeightPromotionConfirmation(confirmation);

console.log(JSON.stringify({
  command: 'validate-relationship-event-learning-weight-promotion-confirmation',
  input_path: inputPath,
  validation_id: validation.validation_id,
  gate_decision: validation.gate_decision,
  required_failures: validation.required_failures,
  warning_failures: validation.warning_failures
}, null, 2));

if (validation.required_failures.length > 0) {
  process.exitCode = 2;
}
