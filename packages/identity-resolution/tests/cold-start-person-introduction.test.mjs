import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildColdStartPersonIntroduction,
  confirmColdStartPersonIntroduction,
  initializeColdStartStore,
  loadColdStartSnapshot,
  syncRelationshipGraphReferences
} from '../src/index.mjs';
import {
  appendRawEvent,
  appendSemanticEvent,
  initializeStorage,
  loadStorageSnapshot
} from '../../storage-runtime/src/index.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-cold-start-person-'));
}

function observation(overrides = {}) {
  return {
    observation_id: 'obs_wechat_client_zhang',
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
        confidence: 0.9,
        evidence_ref: 'screenshot:wechat-client-zhang'
      }
    ],
    content_summary: 'Client Zhang asks whether the proposal can include compliance evidence.',
    content_text: 'Can you add compliance evidence to the proposal?',
    privacy_level: 'raw_text_allowed',
    confidence: 0.9,
    raw_artifact_refs: [],
    metadata: {},
    ...overrides
  };
}

test('builds cold-start candidates from multiple sources and manual role input', () => {
  const root = tempRoot();
  try {
    const storage = initializeStorage({ root });
    const coldStartStore = initializeColdStartStore({ storage });
    const report = buildColdStartPersonIntroduction({
      storage,
      coldStartStore,
      observations: [
        observation(),
        observation({
          observation_id: 'obs_browser_client_zhang',
          source_adapter_id: 'browser_dom.next',
          source_type: 'browser',
          platform: 'web',
          thread_hint: {
            conversation_title: 'Client Zhang CRM page',
            thread_id: 'crm-client-zhang'
          },
          participants_hint: ['Client Zhang'],
          source_identity_hints: [
            {
              identity_type: 'display_name',
              display_name: 'Client Zhang',
              organization_hint: 'Acme',
              confidence: 0.74,
              evidence_ref: 'browser:crm-client-zhang'
            }
          ],
          content_summary: 'CRM page says Client Zhang is evaluating compliance evidence.',
          content_text: 'CRM page: evaluating compliance evidence.',
          confidence: 0.74
        }),
        observation({
          observation_id: 'obs_export_client_zhang',
          source_adapter_id: 'external_chat_export.v1',
          source_type: 'file',
          platform: 'external_chat_export',
          participants_hint: ['Client Zhang'],
          source_identity_hints: [
            {
              identity_type: 'display_name',
              display_name: 'Client Zhang',
              confidence: 0.69,
              evidence_ref: 'export:client-zhang'
            }
          ],
          content_summary: 'Exported chat mentions the same proposal thread.',
          content_text: 'Exported chat mentions the same proposal thread.',
          confidence: 0.69
        })
      ],
      manualPeople: [
        {
          display_name: 'Ops Li',
          tags: ['internal', 'procurement'],
          confidence: 0.86,
          role_bindings: [
            {
              scene: 'business_current',
              role: 'technical_reviewer',
              tags: ['technical'],
              distance_tier: 'normal_contact',
              type_code: 'internal_stakeholder',
              role_importance: 0.8
            },
            {
              scene: 'after_sales',
              role: 'after_sales_coordinator',
              tags: ['service'],
              distance_tier: 'active_contact',
              type_code: 'service_partner',
              role_importance: 0.7
            }
          ]
        }
      ],
      scene: 'business_current',
      graphId: 'b2b_graph',
      actor: 'test'
    });
    const snapshot = loadColdStartSnapshot(coldStartStore);

    assert.equal(report.schema_version, 'cold_start_person_introduction.v1');
    assert.equal(report.real_send_attempted, false);
    assert.ok(report.summary.candidate_people >= 2);
    assert.ok(report.summary.role_bindings >= 3);
    assert.ok(snapshot.candidate_persons.candidate_persons.some((candidate) =>
      candidate.display_name === 'Client Zhang'
      && candidate.channel_identity_ids.length >= 2
      && candidate.tags.includes('cold_start_candidate')
    ));
    const opsRoles = snapshot.person_role_bindings.person_role_bindings
      .filter((binding) => binding.tags.includes('procurement'));
    assert.equal(opsRoles.length, 2);
    assert.ok(snapshot.scene_relationship_weights.scene_relationship_weights.every((weight) =>
      weight.status === 'candidate' && weight.weight <= 0.65
    ));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('confirming a candidate writes graph records and syncs historical events without losing old ids', () => {
  const root = tempRoot();
  try {
    const storage = initializeStorage({ root });
    const coldStartStore = initializeColdStartStore({ storage });
    const report = buildColdStartPersonIntroduction({
      storage,
      coldStartStore,
      observations: [observation()],
      scene: 'business_current',
      actor: 'test'
    });
    const candidate = report.candidates.find((item) => item.display_name === 'Client Zhang');
    const candidateRelationship = report.scene_relationship_weights.find((item) =>
      item.candidate_person_id === candidate.candidate_person_id
    );
    appendRawEvent(storage, {
      event_id: 'raw_candidate_history_001',
      event_kind: 'raw_interaction',
      source: 'cold_start_test',
      occurred_at: '2026-06-12T10:00:00+08:00',
      participants: ['user', candidate.candidate_person_id],
      content: 'Candidate asked for compliance evidence.',
      content_summary: 'Candidate asked for compliance evidence.',
      linked_person_ids: [candidate.candidate_person_id],
      linked_relationship_ids: [candidateRelationship.relationship_id],
      evidence_refs: ['test:raw'],
      metadata: {}
    }, { actor: 'test' });
    appendSemanticEvent(storage, {
      event_id: 'sem_candidate_history_001',
      raw_event_ids: ['raw_candidate_history_001'],
      event_type_code: 'compliance_evidence_request',
      event_level: 'P2',
      tags: ['compliance', 'proposal'],
      weight: 0.72,
      confidence: 0.75,
      evidence: ['raw_candidate_history_001'],
      linked_person_ids: [candidate.candidate_person_id],
      linked_relationship_ids: [candidateRelationship.relationship_id],
      requires_confirmation: false,
      occurred_at: '2026-06-12T10:00:00+08:00'
    }, { actor: 'test' });
    const confirmation = confirmColdStartPersonIntroduction({
      storage,
      coldStartStore,
      candidate_person_id: candidate.candidate_person_id,
      confirmed_person: {
        person_id: 'person_client_zhang',
        display_name: 'Client Zhang',
        tags: ['customer', 'decision_influencer']
      },
      relationships: [
        {
          relationship_id: 'rel_user_client_zhang_business',
          from_person_id: 'user',
          to_person_id: 'person_client_zhang',
          type_code: 'business_contact',
          phase: 'proposal',
          trust_level: 'medium',
          weights: {
            from_to: 0.62,
            to_from: 0.48
          }
        }
      ],
      actor: 'test'
    });
    const snapshot = loadStorageSnapshot(storage);
    const raw = snapshot.raw_events.find((event) => event.event_id === 'raw_candidate_history_001');
    const semantic = snapshot.semantic_events.find((event) => event.event_id === 'sem_candidate_history_001');

    assert.equal(confirmation.gate_decision, 'cold_start_person_confirmed_and_graph_synced');
    assert.equal(confirmation.history_preserved, true);
    assert.equal(confirmation.event_sync.changed.raw_events, 1);
    assert.equal(confirmation.event_sync.changed.semantic_events, 1);
    assert.ok(snapshot.people.people.some((person) => person.person_id === 'person_client_zhang'));
    assert.ok(snapshot.relationships.relationships.some((relationship) =>
      relationship.relationship_id === 'rel_user_client_zhang_business'
    ));
    assert.ok(raw.linked_person_ids.includes('person_client_zhang'));
    assert.ok(raw.linked_relationship_ids.includes('rel_user_client_zhang_business'));
    assert.ok(semantic.linked_person_ids.includes('person_client_zhang'));
    assert.ok(semantic.linked_relationship_ids.includes('rel_user_client_zhang_business'));
    assert.equal(
      raw.metadata.relationship_graph_reference_sync_history[0].previous_person_ids.includes(candidate.candidate_person_id),
      true
    );
    assert.equal(
      semantic.metadata.relationship_graph_reference_sync_history[0].previous_relationship_ids.includes(candidateRelationship.relationship_id),
      true
    );
    assert.ok(snapshot.indexes.person_event.entries.person_client_zhang.raw_event_ids.includes('raw_candidate_history_001'));
    assert.ok(snapshot.indexes.relationship_event.entries.rel_user_client_zhang_business.semantic_event_ids.includes('sem_candidate_history_001'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('relationship reference sync can be rerun for later relationship edits', () => {
  const root = tempRoot();
  try {
    const storage = initializeStorage({ root });
    appendRawEvent(storage, {
      event_id: 'raw_relationship_edit_001',
      event_kind: 'raw_interaction',
      source: 'relationship_edit_test',
      occurred_at: '2026-06-13T10:00:00+08:00',
      participants: ['user', 'person_client_zhang'],
      content_summary: 'Confirmed person moves from lead to active customer.',
      linked_person_ids: ['person_client_zhang'],
      linked_relationship_ids: ['rel_old_business_lead'],
      metadata: {}
    }, { actor: 'test' });
    const sync = syncRelationshipGraphReferences({
      storage,
      person_id_map: {},
      relationship_id_map: {
        rel_old_business_lead: 'rel_active_customer'
      },
      actor: 'test',
      syncReason: 'relationship_role_modified'
    });
    const raw = loadStorageSnapshot(storage).raw_events[0];

    assert.equal(sync.changed.raw_events, 1);
    assert.ok(raw.linked_relationship_ids.includes('rel_active_customer'));
    assert.equal(raw.metadata.relationship_graph_reference_sync_history[0].reason, 'relationship_role_modified');
    assert.ok(raw.metadata.relationship_graph_reference_sync_history[0].previous_relationship_ids.includes('rel_old_business_lead'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
