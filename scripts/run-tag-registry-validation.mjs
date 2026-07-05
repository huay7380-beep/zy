import { runTagRegistryValidation } from '../packages/tag-registry-runtime/src/index.mjs';

const result = runTagRegistryValidation({ root: process.cwd() });

console.log(JSON.stringify({
  run_id: result.run_id,
  gate_decision: result.gate_decision,
  required_failures: result.required_failures,
  metrics: result.metrics,
  paths: result.paths
}, null, 2));
