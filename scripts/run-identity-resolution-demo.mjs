import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  appendObservationWithIdentityResolution,
  buildChannelIdentitiesFromObservation,
  initializeIdentityStore,
  loadIdentitySnapshot,
  upsertChannelIdentities,
  upsertPersonIdentityLinks
} from '../packages/identity-resolution/src/index.mjs';
import {
  initializeStorage,
  loadStorageSnapshot,
  upsertPeople
} from '../packages/storage-runtime/src/index.mjs';

const runId = `identity_resolution_demo_${Date.now()}`;
const outputDir = path.resolve('runtime/identity-resolution-demos', runId);
const dataDir = path.join(outputDir, 'data');
const storage = initializeStorage({ dataDir });
const identityStore = initializeIdentityStore({ storage });

const observation = {
  observation_id: 'demo_wechat_observation_001',
  source_adapter_id: 'sightflow_desktop.wechat',
  source_type: 'desktop',
  platform: 'wechat',
  captured_at: '2026-06-12T10:00:00+08:00',
  thread_hint: {
    conversation_title: 'Client Zhang',
    thread_id: 'wechat-client-zhang'
  },
  participants_hint: ['user', 'Client Zhang'],
  source_identity_hints: [
    {
      identity_type: 'handle',
      display_name: 'Client Zhang',
      handle: 'wxid_client_zhang',
      thread_key: 'wechat:wechat-client-zhang',
      confidence: 0.93,
      evidence_ref: 'screenshot:wechat-client-zhang'
    }
  ],
  content_summary: 'Client Zhang asks whether the proposal can include compliance evidence.',
  content_text: 'Can you add compliance evidence to the proposal?',
  privacy_level: 'raw_text_allowed',
  confidence: 0.92,
  raw_artifact_refs: [],
  metadata: {}
};

upsertPeople(storage, [
  {
    person_id: 'person_client_zhang',
    display_name: 'Client Zhang',
    aliases: ['Zhang Manager'],
    tags: ['customer', 'commercial_contact']
  }
], { actor: runId });

const identities = buildChannelIdentitiesFromObservation(observation);
const handleIdentity = identities.find((identity) => identity.normalized_handle === 'wxid_client_zhang');
upsertChannelIdentities(identityStore, identities, { actor: runId });
upsertPersonIdentityLinks(identityStore, [
  {
    person_id: 'person_client_zhang',
    channel_identity_id: handleIdentity.channel_identity_id,
    platform: 'wechat',
    status: 'confirmed',
    verified: true,
    confidence: 0.98,
    confirmed_by: 'operator',
    thread_keys: ['wechat:wechat-client-zhang'],
    evidence_refs: ['manual:known-contact']
  }
], { actor: runId });

const mapped = appendObservationWithIdentityResolution(storage, observation, {
  identityStore,
  actor: runId
});
const storageSnapshot = loadStorageSnapshot(storage);
const identitySnapshot = loadIdentitySnapshot(identityStore);

const result = {
  schema_version: 'identity_resolution_demo.v1',
  run_id: runId,
  gate_decision: mapped.resolution.gate_decision === 'identity_resolved'
    && mapped.raw_event.linked_person_ids.includes('person_client_zhang')
    ? 'identity_resolution_demo_passed'
    : 'identity_resolution_demo_failed',
  observation_id: observation.observation_id,
  channel_identity_ids: mapped.resolution.channel_identity_ids,
  confirmed_person_ids: mapped.resolution.confirmed_person_ids,
  raw_event_id: mapped.raw_event.event_id,
  raw_event_linked_person_ids: mapped.raw_event.linked_person_ids,
  indexes: {
    person_event_has_person: Boolean(storageSnapshot.indexes.person_event.entries.person_client_zhang),
    identity_person_keys: Object.keys(identitySnapshot.indexes.identity_person.entries),
    channel_identity_keys: Object.keys(identitySnapshot.indexes.channel_identity.entries),
    thread_person_keys: Object.keys(identitySnapshot.indexes.thread_person.entries)
  },
  output_files: {
    data_dir: dataDir
  }
};

mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, 'identity-resolution-demo-result.json');
writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  command: 'run-identity-resolution-demo',
  run_id: result.run_id,
  gate_decision: result.gate_decision,
  confirmed_person_ids: result.confirmed_person_ids,
  raw_event_linked_person_ids: result.raw_event_linked_person_ids,
  json_path: jsonPath
}, null, 2));

if (result.gate_decision !== 'identity_resolution_demo_passed') {
  process.exitCode = 1;
}
