import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  mapObservationToRawEvent,
  normalizeIntakeObservation
} from '../packages/intake-runtime/src/index.mjs';

const observation = JSON.parse(
  readFileSync('examples/intake-observation.sightflow.sample.json', 'utf8')
);
const normalized = normalizeIntakeObservation(observation);
const rawEvent = mapObservationToRawEvent(normalized);
const runId = `desktop_inbox_demo_${Date.now()}`;
const outputDir = path.resolve('runtime/desktop-inbox', runId);
const result = {
  schema_version: 'desktop_inbox_demo.v1',
  run_id: runId,
  bridge_mode: normalized.metadata.bridge_mode ?? 'zhineng_bridge',
  observation: normalized,
  raw_event: rawEvent,
  gate_decision: rawEvent.source.startsWith('desktop:sightflow_desktop.wechat')
    ? 'desktop_inbox_ready_for_intake'
    : 'desktop_inbox_failed'
};

mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, 'desktop-inbox-demo.json');
writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  command: 'run-desktop-inbox-demo',
  run_id: runId,
  gate_decision: result.gate_decision,
  observation_id: normalized.observation_id,
  raw_event_id: rawEvent.event_id,
  json_path: jsonPath
}, null, 2));

if (result.gate_decision !== 'desktop_inbox_ready_for_intake') {
  process.exitCode = 1;
}
