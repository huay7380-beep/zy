import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  appendObservationAsRawEvent,
  createBuiltInAdapterRegistry,
  mapObservationToRawEvent
} from '../packages/intake-runtime/src/index.mjs';
import {
  initializeStorage,
  loadStorageSnapshot
} from '../packages/storage-runtime/src/index.mjs';

const samples = [
  'examples/intake-observation.sightflow.sample.json',
  'examples/intake-observation.browser.sample.json',
  'examples/intake-observation.fake.sample.json'
];

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

const runId = `intake_demo_${Date.now()}`;
const outputDir = path.resolve('runtime/intake-demos', runId);
const dataDir = path.join(outputDir, 'data');
const storage = initializeStorage({ dataDir });
const registry = createBuiltInAdapterRegistry();
const observations = samples.map(readJson);
const rawEvents = [];

for (const observation of observations) {
  registry.require(observation.source_adapter_id);
  rawEvents.push(appendObservationAsRawEvent(storage, observation, {
    actor: runId
  }));
}

const snapshot = loadStorageSnapshot(storage);
const result = {
  schema_version: 'intake_demo.v1',
  run_id: runId,
  adapter_ids: registry.list().map((adapter) => adapter.adapter_id),
  observation_ids: observations.map((item) => item.observation_id),
  raw_event_ids: rawEvents.map((item) => item.event_id),
  raw_event_previews: observations.map(mapObservationToRawEvent),
  metrics: {
    observations: observations.length,
    raw_events: snapshot.raw_events.length,
    audit_records: snapshot.audit_records.length
  },
  gate_decision: snapshot.raw_events.length === observations.length
    ? 'intake_demo_passed'
    : 'intake_demo_failed'
};

mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, 'intake-demo-result.json');
writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  command: 'run-intake-demo',
  run_id: result.run_id,
  gate_decision: result.gate_decision,
  raw_events: result.metrics.raw_events,
  audit_records: result.metrics.audit_records,
  json_path: jsonPath
}, null, 2));

if (result.gate_decision !== 'intake_demo_passed') {
  process.exitCode = 1;
}

