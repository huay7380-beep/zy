import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  appendObservationWithIdentityResolution,
  applyIdentityConfirmationUiDecision,
  applyIdentityConfirmationDecision,
  buildIdentityConfirmationUiModel,
  buildChannelIdentitiesFromObservation,
  buildIdentityResolutionAudit,
  createIdentityStore,
  initializeIdentityStore,
  loadIdentitySnapshot,
  resolveObservationIdentities,
  upsertChannelIdentities,
  upsertPersonIdentityLinks,
  writeIdentityConfirmationUi,
  writeIdentityResolutionAudit
} from '../src/index.mjs';
import {
  initializeStorage,
  loadStorageSnapshot,
  upsertPeople
} from '../../storage-runtime/src/index.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-identity-resolution-'));
}

function wechatObservation(overrides = {}) {
  return {
    observation_id: 'observation_wechat_001',
    source_adapter_id: 'sightflow_desktop.wechat',
    source_type: 'desktop',
    platform: 'wechat',
    source_actor_type: 'human_contact',
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
        confidence: 0.92,
        evidence_ref: 'screenshot:wechat-client-zhang'
      }
    ],
    content_summary: 'Client Zhang asks whether the proposal can include compliance evidence.',
    content_text: 'Can you add compliance evidence to the proposal?',
    privacy_level: 'raw_text_allowed',
    confidence: 0.91,
    raw_artifact_refs: [],
    metadata: {},
    ...overrides
  };
}

test('confirmed channel identity links a WeChat observation to a graph person', () => {
  const root = tempRoot();
  try {
    const storage = initializeStorage({ root });
    const identityStore = initializeIdentityStore({ storage });
    upsertPeople(storage, [
      {
        person_id: 'person_client_zhang',
        display_name: 'Client Zhang',
        aliases: ['Zhang Manager'],
        tags: ['customer']
      }
    ]);

    const observation = wechatObservation();
    const identities = buildChannelIdentitiesFromObservation(observation);
    const handleIdentity = identities.find((identity) => identity.normalized_handle === 'wxid_client_zhang');
    assert.ok(handleIdentity);
    upsertChannelIdentities(identityStore, [handleIdentity], { actor: 'test' });
    upsertPersonIdentityLinks(identityStore, [
      {
        person_id: 'person_client_zhang',
        channel_identity_id: handleIdentity.channel_identity_id,
        platform: 'wechat',
        status: 'confirmed',
        verified: true,
        confidence: 0.98,
        confirmed_by: 'user',
        thread_keys: ['wechat:wechat-client-zhang'],
        evidence_refs: ['manual:known-contact']
      }
    ], { actor: 'test' });

    const result = appendObservationWithIdentityResolution(storage, observation, {
      identityStore,
      actor: 'test'
    });
    const storageSnapshot = loadStorageSnapshot(storage);
    const identitySnapshot = loadIdentitySnapshot(identityStore);

    assert.equal(result.resolution.gate_decision, 'identity_resolved');
    assert.deepEqual(result.resolution.confirmed_person_ids, ['person_client_zhang']);
    assert.deepEqual(result.raw_event.linked_person_ids, ['person_client_zhang']);
    assert.equal(result.raw_event.metadata.identity_resolution.gate_decision, 'identity_resolved');
    assert.ok(storageSnapshot.indexes.person_event.entries.person_client_zhang.raw_event_ids.includes('observation_wechat_001'));
    assert.ok(identitySnapshot.indexes.identity_person.entries[handleIdentity.channel_identity_id].some(
      (entry) => entry.person_id === 'person_client_zhang'
    ));
    assert.ok(identitySnapshot.indexes.thread_person.entries['wechat:wechat-client-zhang'].some(
      (entry) => entry.person_id === 'person_client_zhang'
    ));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ambiguous display-name matches stop before linking and create a confirmation queue item', () => {
  const root = tempRoot();
  try {
    const storage = initializeStorage({ root });
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
    ]);

    const observation = wechatObservation({
      observation_id: 'observation_wechat_ambiguous',
      source_identity_hints: [],
      participants_hint: ['user', 'Client Zhang'],
      thread_hint: {
        conversation_title: 'Client Zhang'
      }
    });
    const resolution = resolveObservationIdentities({
      storage,
      identityStore,
      observation,
      actor: 'test'
    });
    const snapshot = loadIdentitySnapshot(identityStore);

    assert.equal(resolution.gate_decision, 'identity_requires_user_confirmation');
    assert.equal(resolution.confirmation_required, true);
    assert.deepEqual(resolution.confirmed_person_ids, []);
    assert.equal(resolution.candidates.length, 2);
    assert.equal(new Set(resolution.candidates.map((candidate) => candidate.ambiguity_group_id)).size, 1);
    assert.equal(snapshot.identity_confirmation_queue.length, 1);
    assert.equal(snapshot.identity_confirmation_queue[0].reason, 'ambiguous_identity_candidates');
    assert.equal(snapshot.identity_confirmation_queue[0].candidates.length, 2);
    assert.equal(snapshot.identity_confirmation_queue[0].decision_status, 'pending');
    assert.equal(snapshot.identity_confirmation_queue[0].candidates[0].status, 'queued_for_confirmation');
    assert.equal(snapshot.identity_confirmation_queue[0].apply_decision_template.confirmation_id, snapshot.identity_confirmation_queue[0].confirmation_id);
    assert.ok(snapshot.identity_confirmation_queue[0].operator_next_actions.length >= 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('non-human source actor types do not create person match candidates', () => {
  const root = tempRoot();
  try {
    const storage = initializeStorage({ root });
    const identityStore = initializeIdentityStore({ storage });
    upsertPeople(storage, [
      {
        person_id: 'person_wechat_service',
        display_name: 'Client Zhang',
        aliases: ['Client Zhang']
      }
    ]);

    const observation = wechatObservation({
      observation_id: 'observation_wechat_official_account',
      source_actor_type: 'official_account',
      participants_hint: ['user', 'Client Zhang'],
      source_identity_hints: [
        {
          identity_type: 'display_name',
          display_name: 'Client Zhang',
          confidence: 0.98
        }
      ]
    });
    const identities = buildChannelIdentitiesFromObservation(observation);
    const resolution = resolveObservationIdentities({
      storage,
      identityStore,
      observation,
      actor: 'test'
    });

    assert.deepEqual(identities, []);
    assert.equal(resolution.source_actor_type, 'official_account');
    assert.equal(resolution.gate_decision, 'source_actor_not_human_contact');
    assert.deepEqual(resolution.candidates, []);
    assert.deepEqual(resolution.confirmed_person_ids, []);
    assert.equal(resolution.confirmation_required, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('applies a user confirmation decision and makes the same observation resolvable', () => {
  const root = tempRoot();
  try {
    const storage = initializeStorage({ root });
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
    ]);

    const observation = wechatObservation({
      observation_id: 'observation_wechat_confirm_after_queue',
      source_identity_hints: [],
      participants_hint: ['user', 'Client Zhang'],
      thread_hint: {
        conversation_title: 'Client Zhang'
      }
    });
    const firstResolution = resolveObservationIdentities({
      storage,
      identityStore,
      observation,
      actor: 'test'
    });
    const queued = loadIdentitySnapshot(identityStore).identity_confirmation_queue[0];
    const selected = queued.candidates.find((candidate) => candidate.candidate_person_id === 'person_client_zhang_a');
    const decision = applyIdentityConfirmationDecision(identityStore, {
      confirmation_id: queued.confirmation_id,
      candidate_id: selected.candidate_id,
      confirmed_by: 'operator_test',
      evidence_refs: ['manual:operator-reviewed-contact']
    }, { actor: 'test' });
    const secondResolution = resolveObservationIdentities({
      storage,
      identityStore,
      observation,
      actor: 'test'
    });
    const snapshot = loadIdentitySnapshot(identityStore);

    assert.equal(firstResolution.gate_decision, 'identity_requires_user_confirmation');
    assert.equal(decision.gate_decision, 'identity_confirmation_applied');
    assert.equal(decision.created_link.person_id, 'person_client_zhang_a');
    assert.equal(decision.decision.raw_event_replay_required, true);
    assert.equal(secondResolution.gate_decision, 'identity_resolved');
    assert.deepEqual(secondResolution.confirmed_person_ids, ['person_client_zhang_a']);
    assert.ok(snapshot.person_identity_links.person_identity_links.some((link) =>
      link.person_id === 'person_client_zhang_a'
      && link.status === 'confirmed'
      && link.verified === true
    ));
    assert.ok(snapshot.identity_confirmation_queue.some((entry) =>
      entry.queue_entry_type === 'identity_confirmation_decision'
      && entry.confirmed_person_id === 'person_client_zhang_a'
    ));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('renders an identity confirmation UI model and applies the selected UI decision', () => {
  const root = tempRoot();
  try {
    const storage = initializeStorage({ root });
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
    ]);

    const observation = wechatObservation({
      observation_id: 'observation_wechat_ui_confirm',
      source_identity_hints: [],
      participants_hint: ['user', 'Client Zhang'],
      thread_hint: {
        conversation_title: 'Client Zhang'
      }
    });
    const firstResolution = resolveObservationIdentities({
      storage,
      identityStore,
      observation,
      actor: 'test'
    });
    const model = buildIdentityConfirmationUiModel(identityStore, { actor: 'ui_operator' });
    const written = writeIdentityConfirmationUi({
      model,
      outputDir: path.join(root, 'identity-ui')
    });
    const pending = model.confirmations.find((item) => item.status === 'pending');
    const selected = pending.candidates.find((candidate) => candidate.candidate_person_id === 'person_client_zhang_a');
    const html = readFileSync(written.html_path, 'utf8');
    const applied = applyIdentityConfirmationUiDecision(identityStore, {
      confirmation_id: pending.confirmation_id,
      candidate_id: selected.candidate_id,
      confirmed_by: 'ui_operator',
      evidence_refs: ['identity-confirmation-ui-test']
    }, { actor: 'test' });
    const secondResolution = resolveObservationIdentities({
      storage,
      identityStore,
      observation,
      actor: 'test'
    });

    assert.equal(firstResolution.gate_decision, 'identity_requires_user_confirmation');
    assert.equal(model.schema_version, 'identity_confirmation_ui.v1');
    assert.equal(model.summary.pending_count, 1);
    assert.equal(model.confirmations[0].candidates.length, 2);
    assert.ok(model.confirmations[0].candidates[0].command.includes('identity:confirm'));
    assert.equal(existsSync(written.html_path), true);
    assert.equal(existsSync(written.json_path), true);
    assert.ok(html.includes('身份确认队列'));
    assert.ok(html.includes('下载决策'));
    assert.ok(html.includes('person_client_zhang_a'));
    assert.equal(applied.gate_decision, 'identity_confirmation_applied');
    assert.equal(secondResolution.gate_decision, 'identity_resolved');
    assert.deepEqual(secondResolution.confirmed_person_ids, ['person_client_zhang_a']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('identity resolution audit reports required evidence and writes JSON plus Markdown', () => {
  const root = tempRoot();
  try {
    const outputDir = path.join(root, 'identity-audit');
    const identityStore = createIdentityStore({ root });
    const audit = buildIdentityResolutionAudit({
      root: path.resolve('.'),
      auditId: 'identity_resolution_audit_test',
      sampleResult: {
        confirmed_linked: true,
        confirmed_person_ids: ['person_client_zhang'],
        raw_event_linked_person_ids: ['person_client_zhang'],
        ambiguous_requires_confirmation: true,
        ambiguous_confirmation_ids: ['identity_confirmation_test'],
        identity_indexes_rebuilt: true,
        identity_index_keys: ['identity_person', 'channel_identity', 'thread_person']
      }
    });
    const written = writeIdentityResolutionAudit({ audit, outputDir });

    assert.equal(audit.schema_version, 'identity_resolution_audit.v1');
    assert.equal(audit.gate_decision, 'identity_resolution_ready');
    assert.deepEqual(audit.required_failures, []);
    assert.equal(identityStore.paths.channelIdentities.endsWith('data\\people\\channel-identities.json')
      || identityStore.paths.channelIdentities.endsWith('data/people/channel-identities.json'), true);
    assert.equal(existsSync(written.json_path), true);
    assert.equal(existsSync(written.markdown_path), true);
    const report = JSON.parse(readFileSync(written.json_path, 'utf8'));
    assert.equal(report.gate_decision, 'identity_resolution_ready');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
