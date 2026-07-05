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
const includeP10Shadow = process.argv.includes('--include-p10-shadow');
const phaseRun = buildRelationshipEventGraphPhaseRun({ runId, includeP10Shadow });
const written = writeRelationshipEventGraphPhaseRun({ phaseRun });

console.log(JSON.stringify({
  command: 'run-relationship-event-graph-phases',
  run_id: phaseRun.run_id,
  gate_decision: phaseRun.gate_decision,
  completed_through: phaseRun.execution_scope.completed_through,
  required_failures: phaseRun.required_failures,
  warning_failures: phaseRun.warning_failures,
  json_path: written.json_path,
  markdown_path: written.markdown_path,
  status_json_path: written.status_json_path
}, null, 2));

if (phaseRun.required_failures.length > 0) {
  process.exitCode = 2;
}
