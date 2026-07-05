import {
  buildRelationshipEventGraphPhaseRun,
  writeRelationshipEventGraphPhaseRun
} from '../packages/relationship-event-graph/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const runId = argValue('run-id') ?? undefined;
const phaseRun = buildRelationshipEventGraphPhaseRun({ runId, includeP10Shadow: true });
const written = writeRelationshipEventGraphPhaseRun({ phaseRun });
const shadowReport = phaseRun.artifacts.learning_weight_shadow_report;

console.log(JSON.stringify({
  command: 'run-relationship-event-graph-p10-shadow',
  run_id: phaseRun.run_id,
  gate_decision: phaseRun.gate_decision,
  completed_through: phaseRun.execution_scope.completed_through,
  required_failures: phaseRun.required_failures,
  warning_failures: phaseRun.warning_failures,
  shadow_report_id: shadowReport?.shadow_report_id ?? null,
  promotion_gate_id: shadowReport?.promotion_confirmation_gate?.gate_id ?? null,
  learning_weight_promotion_allowed: false,
  json_path: written.json_path,
  markdown_path: written.markdown_path,
  status_json_path: written.status_json_path
}, null, 2));

if (phaseRun.required_failures.length > 0) {
  process.exitCode = 2;
}
