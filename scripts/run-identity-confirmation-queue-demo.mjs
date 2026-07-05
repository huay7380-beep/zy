import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  applyIdentityConfirmationDecision,
  initializeIdentityStore,
  loadIdentitySnapshot,
  resolveObservationIdentities
} from '../packages/identity-resolution/src/index.mjs';
import {
  initializeStorage,
  upsertPeople
} from '../packages/storage-runtime/src/index.mjs';

const runId = `identity_confirmation_queue_demo_${Date.now()}`;
const outputDir = path.resolve('runtime/identity-confirmation-decisions', runId);
const dataDir = path.join(outputDir, 'data');
const storage = initializeStorage({ dataDir });
const identityStore = initializeIdentityStore({ storage });

upsertPeople(storage, [
  {
    person_id: 'person_client_zhang_a',
    display_name: 'Client Zhang',
    aliases: ['Zhang Manager'],
    tags: ['customer']
  },
  {
    person_id: 'person_vendor_zhang_b',
    display_name: 'Client Zhang',
    aliases: ['Zhang Manager'],
    tags: ['vendor']
  }
], { actor: runId });

const observation = {
  observation_id: 'identity_confirmation_demo_observation',
  source_adapter_id: 'sightflow_desktop.wechat',
  source_type: 'desktop',
  platform: 'wechat',
  captured_at: '2026-06-14T12:00:00+08:00',
  participants_hint: ['user', 'Client Zhang'],
  thread_hint: {
    conversation_title: 'Client Zhang'
  },
  content_summary: 'Client Zhang asks whether compliance material can be included before the next technical review.',
  content_text: 'Can you include compliance material before the next technical review?',
  privacy_level: 'raw_text_allowed',
  confidence: 0.88,
  raw_artifact_refs: [],
  metadata: {
    read_only_capture: true,
    real_execution_allowed: false,
    real_send_attempted: false
  }
};

const firstResolution = resolveObservationIdentities({
  storage,
  identityStore,
  observation,
  actor: runId
});
const queued = loadIdentitySnapshot(identityStore).identity_confirmation_queue
  .find((entry) => entry.queue_entry_type === 'identity_confirmation_request');
const selected = queued?.candidates?.find((candidate) => candidate.candidate_person_id === 'person_client_zhang_a');
if (!queued || !selected) {
  throw new Error('identity confirmation queue demo did not create the expected candidate');
}

const decision = applyIdentityConfirmationDecision(identityStore, {
  confirmation_id: queued.confirmation_id,
  candidate_id: selected.candidate_id,
  confirmed_by: 'demo_operator',
  evidence_refs: ['manual:demo-operator-reviewed-contact']
}, { actor: runId });
const secondResolution = resolveObservationIdentities({
  storage,
  identityStore,
  observation,
  actor: runId
});
const snapshot = loadIdentitySnapshot(identityStore);

const result = {
  schema_version: 'identity_confirmation_queue_demo.v1',
  run_id: runId,
  gate_decision: firstResolution.gate_decision === 'identity_requires_user_confirmation'
    && decision.gate_decision === 'identity_confirmation_applied'
    && secondResolution.gate_decision === 'identity_resolved'
    ? 'identity_confirmation_queue_demo_passed'
    : 'identity_confirmation_queue_demo_failed',
  first_gate_decision: firstResolution.gate_decision,
  confirmation_id: queued.confirmation_id,
  selected_candidate_id: selected.candidate_id,
  decision_gate_decision: decision.gate_decision,
  created_link_id: decision.created_link?.link_id ?? null,
  second_gate_decision: secondResolution.gate_decision,
  confirmed_person_ids_after_retry: secondResolution.confirmed_person_ids,
  queue_entry_count: snapshot.identity_confirmation_queue.length,
  output_files: {
    data_dir: dataDir,
    identity_confirmation_queue: identityStore.paths.identityConfirmationQueue,
    person_identity_links: identityStore.paths.personIdentityLinks,
    identity_audit: identityStore.paths.identityAudit
  }
};

mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, 'identity-confirmation-queue-demo-result.json');
writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  command: 'run-identity-confirmation-queue-demo',
  run_id: result.run_id,
  gate_decision: result.gate_decision,
  first_gate_decision: result.first_gate_decision,
  decision_gate_decision: result.decision_gate_decision,
  second_gate_decision: result.second_gate_decision,
  confirmed_person_ids_after_retry: result.confirmed_person_ids_after_retry,
  json_path: jsonPath
}, null, 2));

if (result.gate_decision !== 'identity_confirmation_queue_demo_passed') {
  process.exitCode = 1;
}
