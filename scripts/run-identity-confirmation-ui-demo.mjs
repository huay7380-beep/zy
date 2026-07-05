import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  applyIdentityConfirmationUiDecision,
  buildIdentityConfirmationUiModel,
  initializeIdentityStore,
  loadIdentitySnapshot,
  resolveObservationIdentities,
  writeIdentityConfirmationUi
} from '../packages/identity-resolution/src/index.mjs';
import {
  initializeStorage,
  upsertPeople
} from '../packages/storage-runtime/src/index.mjs';

const runId = `identity_confirmation_ui_demo_${Date.now()}`;
const outputDir = path.resolve('runtime/identity-confirmation-ui', runId);
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
  observation_id: 'identity_confirmation_ui_observation',
  source_adapter_id: 'sightflow_desktop.wechat',
  source_type: 'desktop',
  platform: 'wechat',
  captured_at: '2026-06-14T14:00:00+08:00',
  participants_hint: ['user', 'Client Zhang'],
  thread_hint: {
    conversation_title: 'Client Zhang'
  },
  content_summary: 'Client Zhang asks whether the test-window compliance note can be reviewed.',
  content_text: 'Can you review the compliance note in the test window?',
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
const initialModel = buildIdentityConfirmationUiModel(identityStore, {
  actor: 'ui_demo_operator'
});
const uiPaths = writeIdentityConfirmationUi({
  model: initialModel,
  outputDir
});
const pending = initialModel.confirmations.find((item) => item.status === 'pending');
const selected = pending?.candidates.find((candidate) => candidate.candidate_person_id === 'person_client_zhang_a');
if (!pending || !selected) throw new Error('identity confirmation UI demo did not create a selectable pending candidate');

const applied = applyIdentityConfirmationUiDecision(identityStore, {
  confirmation_id: pending.confirmation_id,
  candidate_id: selected.candidate_id,
  confirmed_by: 'ui_demo_operator',
  evidence_refs: ['identity-confirmation-ui-demo']
}, { actor: runId });
const secondResolution = resolveObservationIdentities({
  storage,
  identityStore,
  observation,
  actor: runId
});
const finalModel = buildIdentityConfirmationUiModel(identityStore, {
  actor: 'ui_demo_operator'
});
const snapshot = loadIdentitySnapshot(identityStore);

const result = {
  schema_version: 'identity_confirmation_ui_demo.v1',
  run_id: runId,
  gate_decision: initialModel.summary.pending_count > 0
    && applied.gate_decision === 'identity_confirmation_applied'
    && secondResolution.gate_decision === 'identity_resolved'
    ? 'identity_confirmation_ui_demo_passed'
    : 'identity_confirmation_ui_demo_failed',
  first_gate_decision: firstResolution.gate_decision,
  initial_pending_count: initialModel.summary.pending_count,
  ui_html_path: uiPaths.html_path,
  ui_model_path: uiPaths.json_path,
  selected_candidate_id: selected.candidate_id,
  decision_gate_decision: applied.gate_decision,
  created_link_id: applied.created_link?.link_id ?? null,
  second_gate_decision: secondResolution.gate_decision,
  confirmed_person_ids_after_retry: secondResolution.confirmed_person_ids,
  final_pending_count: finalModel.summary.pending_count,
  queue_entry_count: snapshot.identity_confirmation_queue.length,
  output_files: {
    data_dir: dataDir,
    identity_confirmation_queue: identityStore.paths.identityConfirmationQueue,
    person_identity_links: identityStore.paths.personIdentityLinks,
    identity_audit: identityStore.paths.identityAudit
  }
};

mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, 'identity-confirmation-ui-demo-result.json');
writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  command: 'run-identity-confirmation-ui-demo',
  run_id: runId,
  gate_decision: result.gate_decision,
  ui_html_path: result.ui_html_path,
  first_gate_decision: result.first_gate_decision,
  decision_gate_decision: result.decision_gate_decision,
  second_gate_decision: result.second_gate_decision,
  confirmed_person_ids_after_retry: result.confirmed_person_ids_after_retry,
  json_path: jsonPath
}, null, 2));

if (result.gate_decision !== 'identity_confirmation_ui_demo_passed') {
  process.exitCode = 1;
}
