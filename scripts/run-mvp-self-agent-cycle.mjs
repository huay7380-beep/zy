#!/usr/bin/env node
import path from 'node:path';
import {
  runMvpSelfAgentCycle
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
const importPath = argValue('pilot-import')
  ? path.resolve(argValue('pilot-import'))
  : path.join(root, 'examples/pilot-import-batch.sample.json');
const userFeedbackPath = argValue('user-feedback')
  ? path.resolve(argValue('user-feedback'))
  : path.join(root, 'examples/mvp-user-feedback.sample.json');
const outputDir = argValue('output')
  ? path.resolve(argValue('output'))
  : null;
const processTreePath = argValue('process-tree')
  ? path.resolve(argValue('process-tree'))
  : path.join(root, 'examples/system-process-tree.json');
const stressRuns = argValue('stress-runs')
  ? Number(argValue('stress-runs'))
  : 2;
if (!Number.isInteger(stressRuns) || stressRuns < 1) {
  throw new Error(`Invalid --stress-runs: ${argValue('stress-runs')}`);
}

const cycle = runMvpSelfAgentCycle({
  root,
  importPath,
  userFeedbackPath,
  outputDir,
  processTreePath,
  stressRuns
});

console.log(JSON.stringify({
  command: 'run-mvp-self-agent-cycle',
  preflight_id: cycle.preflight.preflight_id,
  gate_decision: cycle.preflight.gate_decision,
  run_id: cycle.preflight.current_cycle.run_id,
  report_path: cycle.preflight.current_cycle.report_path,
  audit_path: cycle.preflight.current_cycle.audit_path,
  process_tree_validation_path: cycle.preflight.current_cycle.process_tree_validation_path,
  mvp_stress_path: cycle.preflight.current_cycle.mvp_stress_path,
  external_input_kit_path: cycle.preflight.current_cycle.external_input_kit_path,
  external_input_templates_path: cycle.preflight.current_cycle.external_input_templates_path,
  external_input_readiness_path: cycle.preflight.current_cycle.external_input_readiness_path,
  objective_audit_path: cycle.preflight.current_cycle.objective_audit_path,
  objective_status: cycle.objective_audit.objective_status,
  external_input_templates_count: cycle.input_templates.templates.length,
  external_input_readiness_gate: cycle.input_readiness.gate_decision,
  required_failures: cycle.preflight.required_failures,
  external_inputs_required: cycle.preflight.external_inputs_required.map((item) => item.issue_id),
  json_path: cycle.written.json_path,
  markdown_path: cycle.written.markdown_path
}, null, 2));
