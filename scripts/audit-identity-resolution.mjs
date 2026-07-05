import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  appendObservationWithIdentityResolution,
  buildChannelIdentitiesFromObservation,
  buildIdentityResolutionAudit,
  initializeIdentityStore,
  loadIdentitySnapshot,
  resolveObservationIdentities,
  upsertChannelIdentities,
  upsertPersonIdentityLinks,
  writeIdentityResolutionAudit
} from '../packages/identity-resolution/src/index.mjs';
import {
  initializeStorage,
  upsertPeople
} from '../packages/storage-runtime/src/index.mjs';

function confirmedObservation() {
  return {
    observation_id: 'audit_wechat_confirmed_001',
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
}

function ambiguousObservation() {
  return {
    observation_id: 'audit_wechat_ambiguous_001',
    source_adapter_id: 'sightflow_desktop.wechat',
    source_type: 'desktop',
    platform: 'wechat',
    captured_at: '2026-06-12T10:03:00+08:00',
    thread_hint: {
      conversation_title: 'Jordan Lee'
    },
    participants_hint: ['user', 'Jordan Lee'],
    source_identity_hints: [],
    content_summary: 'Jordan Lee asks for a follow-up meeting time.',
    content_text: 'Can we schedule a follow-up meeting next week?',
    privacy_level: 'raw_text_allowed',
    confidence: 0.83,
    raw_artifact_refs: [],
    metadata: {}
  };
}

const auditId = `identity_resolution_audit_${Date.now()}`;
const outputDir = path.resolve('runtime/identity-resolution-audits', auditId);
const dataDir = path.join(outputDir, 'data');
const storage = initializeStorage({ dataDir });
const identityStore = initializeIdentityStore({ storage });

upsertPeople(storage, [
  {
    person_id: 'person_client_zhang',
    display_name: 'Client Zhang',
    aliases: ['Zhang Manager'],
    tags: ['customer']
  },
  {
    person_id: 'person_customer_jordan_a',
    display_name: 'Jordan Lee',
    aliases: ['Jordan'],
    tags: ['customer']
  },
  {
    person_id: 'person_supplier_jordan_b',
    display_name: 'Jordan Lee',
    aliases: ['Jordan'],
    tags: ['supplier']
  }
], { actor: auditId });

const confirmedInput = confirmedObservation();
const confirmedIdentities = buildChannelIdentitiesFromObservation(confirmedInput);
const confirmedHandleIdentity = confirmedIdentities.find((identity) => identity.normalized_handle === 'wxid_client_zhang');
upsertChannelIdentities(identityStore, confirmedIdentities, { actor: auditId });
upsertPersonIdentityLinks(identityStore, [
  {
    person_id: 'person_client_zhang',
    channel_identity_id: confirmedHandleIdentity.channel_identity_id,
    platform: 'wechat',
    status: 'confirmed',
    verified: true,
    confidence: 0.98,
    confirmed_by: 'operator',
    thread_keys: ['wechat:wechat-client-zhang'],
    evidence_refs: ['manual:known-contact']
  }
], { actor: auditId });

const confirmedResult = appendObservationWithIdentityResolution(storage, confirmedInput, {
  identityStore,
  actor: auditId
});
const ambiguousResult = resolveObservationIdentities({
  storage,
  identityStore,
  observation: ambiguousObservation(),
  actor: auditId
});
const identitySnapshot = loadIdentitySnapshot(identityStore);
const sampleResult = {
  confirmed_linked: confirmedResult.resolution.gate_decision === 'identity_resolved'
    && confirmedResult.raw_event.linked_person_ids.includes('person_client_zhang'),
  confirmed_person_ids: confirmedResult.resolution.confirmed_person_ids,
  raw_event_linked_person_ids: confirmedResult.raw_event.linked_person_ids,
  ambiguous_requires_confirmation: ambiguousResult.gate_decision === 'identity_requires_user_confirmation'
    && ambiguousResult.confirmation_required === true,
  ambiguous_confirmation_ids: ambiguousResult.confirmation_ids,
  identity_indexes_rebuilt: Boolean(identitySnapshot.indexes.identity_person.rebuilt_at)
    && Boolean(identitySnapshot.indexes.channel_identity.rebuilt_at)
    && Boolean(identitySnapshot.indexes.thread_person.rebuilt_at),
  identity_index_keys: Object.keys(identitySnapshot.indexes)
};

const audit = buildIdentityResolutionAudit({
  root: path.resolve('.'),
  auditId,
  sampleResult
});
const written = writeIdentityResolutionAudit({ audit, outputDir });
const runSummary = {
  schema_version: 'identity_resolution_audit_run.v1',
  audit_id: audit.audit_id,
  gate_decision: audit.gate_decision,
  required_failures: audit.required_failures,
  warning_failures: audit.warning_failures,
  sample_result: sampleResult,
  audit_paths: written,
  data_dir: dataDir
};

mkdirSync(outputDir, { recursive: true });
const summaryPath = path.join(outputDir, 'identity-resolution-audit-run.json');
writeFileSync(summaryPath, `${JSON.stringify(runSummary, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  command: 'audit-identity-resolution',
  audit_id: audit.audit_id,
  gate_decision: audit.gate_decision,
  required_failures: audit.required_failures,
  json_path: written.json_path,
  markdown_path: written.markdown_path,
  summary_path: summaryPath
}, null, 2));

if (audit.required_failures.length) {
  process.exitCode = 1;
}
