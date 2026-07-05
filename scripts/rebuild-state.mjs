import { StateNotebook } from '../packages/agent-runtime/src/index.mjs';

const notebook = new StateNotebook();
const status = notebook.rebuildFromEvents();

console.log(JSON.stringify({
  rebuilt: true,
  run_count: status.run_count,
  successful_runs: status.metrics.successful_runs,
  failed_runs: status.metrics.failed_runs,
  node_counts: status.node_counts,
  status: status.status
}, null, 2));
