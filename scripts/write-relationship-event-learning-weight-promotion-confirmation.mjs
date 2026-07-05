import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildLearningWeightPromotionConfirmation,
  writeLearningWeightPromotionConfirmation
} from '../packages/relationship-event-graph/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
const phaseRunPath = argValue('input') ? path.resolve(root, argValue('input')) : null;
const outputDir = argValue('output-dir') ? path.resolve(root, argValue('output-dir')) : undefined;
const phaseRun = phaseRunPath ? readJson(phaseRunPath) : null;
const confirmation = buildLearningWeightPromotionConfirmation({
  root,
  phaseRun,
  phaseRunPath
});
const written = writeLearningWeightPromotionConfirmation({
  confirmation,
  outputDir,
  root
});

console.log(JSON.stringify({
  command: 'write-relationship-event-learning-weight-promotion-confirmation',
  confirmation_id: confirmation.confirmation_id,
  gate_decision: confirmation.gate_decision,
  source_phase_run_id: confirmation.source_phase_run_id,
  shadow_report_id: confirmation.shadow_report_id,
  promotion_gate_id: confirmation.promotion_gate_id,
  learning_weight_promotion_allowed: confirmation.approval_boundary.learning_weight_promotion_allowed,
  limited_trial_execution_allowed: confirmation.approval_boundary.limited_trial_execution_allowed,
  required_failures: confirmation.required_failures,
  warning_failures: confirmation.warning_failures,
  json_path: written.json_path,
  markdown_path: written.markdown_path,
  decision_template_path: written.decision_template_path,
  status_json_path: written.status_json_path
}, null, 2));

if (confirmation.required_failures.length > 0 && process.argv.includes('--fail-on-required')) {
  process.exitCode = 2;
}
