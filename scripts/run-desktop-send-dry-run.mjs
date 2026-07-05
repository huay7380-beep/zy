import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runSendCommandDryRun } from '../packages/intake-runtime/src/index.mjs';

const command = JSON.parse(
  readFileSync('examples/outbound-send-command.sample.json', 'utf8')
);
const result = runSendCommandDryRun(command, {
  executor: 'sightflow_desktop.dry-run',
  evidenceRefs: ['examples/outbound-send-command.sample.json']
});
const runId = `desktop_send_dry_run_${Date.now()}`;
const outputDir = path.resolve('runtime/desktop-send-dry-runs', runId);
const payload = {
  schema_version: 'desktop_send_dry_run.v1',
  run_id: runId,
  command,
  send_result: result,
  gate_decision: result.status === 'blocked' && result.metadata.real_send_attempted === false
    ? 'desktop_send_blocked_as_expected'
    : 'desktop_send_dry_run_failed'
};

mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, 'desktop-send-dry-run.json');
writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  command: 'run-desktop-send-dry-run',
  run_id: runId,
  gate_decision: payload.gate_decision,
  send_status: result.status,
  blocked_reason: result.blocked_reason ?? null,
  json_path: jsonPath
}, null, 2));

if (payload.gate_decision !== 'desktop_send_blocked_as_expected') {
  process.exitCode = 1;
}
