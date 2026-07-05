import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildColdStartPersonIntroduction,
  confirmColdStartPersonIntroduction,
  initializeColdStartStore
} from '../packages/identity-resolution/src/index.mjs';
import {
  appendRawEvent,
  appendSemanticEvent,
  initializeStorage,
  loadStorageSnapshot
} from '../packages/storage-runtime/src/index.mjs';

function nowId() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeMarkdown(filePath, report) {
  const lines = [
    '# Cold Start Person Introduction Demo',
    '',
    `- demo_id: ${report.demo_id}`,
    `- gate_decision: ${report.gate_decision}`,
    `- real_send_attempted: ${report.real_send_attempted}`,
    `- candidate_people: ${report.cold_start.summary.candidate_people}`,
    `- role_bindings: ${report.cold_start.summary.role_bindings}`,
    `- scene_relationship_weights: ${report.cold_start.summary.scene_relationship_weights}`,
    `- confirmed_person_id: ${report.confirmation.confirmed_person_id}`,
    `- synced_raw_events: ${report.confirmation.event_sync.changed.raw_events}`,
    `- synced_semantic_events: ${report.confirmation.event_sync.changed.semantic_events}`,
    `- history_preserved: ${report.confirmation.history_preserved}`,
    '',
    '## Key Artifacts',
    '',
    `- data_dir: ${report.data_dir}`,
    `- cold_start_store: ${report.cold_start_store.candidate_persons}`,
    `- raw_events: ${report.storage_paths.raw_events}`,
    `- semantic_events: ${report.storage_paths.semantic_events}`,
    `- person_index: ${report.storage_paths.person_index}`,
    `- relationship_index: ${report.storage_paths.relationship_index}`,
    ''
  ];
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, lines.join('\n'), 'utf8');
}

function observation(overrides = {}) {
  return {
    observation_id: 'obs_demo_wechat_client_zhang',
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
        confidence: 0.91,
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

const demoId = `cold_start_person_intro_demo_${nowId()}`;
const outputDir = path.resolve('runtime/cold-start-person-introduction', demoId);
const dataDir = path.join(outputDir, 'data');
const storage = initializeStorage({ dataDir });
const coldStartStore = initializeColdStartStore({ storage });

const coldStart = buildColdStartPersonIntroduction({
  storage,
  coldStartStore,
  observations: [
    observation(),
    observation({
      observation_id: 'obs_demo_browser_client_zhang',
      source_adapter_id: 'browser_dom.next',
      source_type: 'browser',
      platform: 'web',
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
      content_text: 'CRM page says Client Zhang is evaluating compliance evidence.',
      confidence: 0.74
    }),
    observation({
      observation_id: 'obs_demo_export_client_zhang',
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
  actor: 'cold-start-demo'
});

const candidate = coldStart.candidates.find((item) => item.display_name === 'Client Zhang');
const candidateRelationship = coldStart.scene_relationship_weights.find((item) =>
  item.candidate_person_id === candidate.candidate_person_id
);

appendRawEvent(storage, {
  event_id: 'raw_demo_candidate_client_zhang_001',
  event_kind: 'raw_interaction',
  source: 'cold_start_demo',
  occurred_at: '2026-06-12T10:00:00+08:00',
  participants: ['user', candidate.candidate_person_id],
  content: 'Client Zhang asks for compliance evidence before internal review.',
  content_summary: 'Client Zhang asks for compliance evidence before internal review.',
  linked_person_ids: [candidate.candidate_person_id],
  linked_relationship_ids: [candidateRelationship.relationship_id],
  evidence_refs: ['demo:candidate-history'],
  metadata: {}
}, { actor: 'cold-start-demo' });

appendSemanticEvent(storage, {
  event_id: 'sem_demo_candidate_client_zhang_001',
  raw_event_ids: ['raw_demo_candidate_client_zhang_001'],
  event_type_code: 'compliance_evidence_request',
  event_level: 'P2',
  tags: ['compliance', 'proposal'],
  weight: 0.72,
  confidence: 0.76,
  evidence: ['raw_demo_candidate_client_zhang_001'],
  linked_person_ids: [candidate.candidate_person_id],
  linked_relationship_ids: [candidateRelationship.relationship_id],
  requires_confirmation: false,
  occurred_at: '2026-06-12T10:00:00+08:00'
}, { actor: 'cold-start-demo' });

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
  actor: 'cold-start-demo'
});

const storageSnapshot = loadStorageSnapshot(storage);
const demoReport = {
  schema_version: 'cold_start_person_introduction_demo.v1',
  demo_id: demoId,
  created_at: new Date().toISOString(),
  gate_decision: confirmation.gate_decision,
  real_execution_allowed: false,
  real_send_attempted: false,
  data_dir: storage.dataDir,
  cold_start: coldStart,
  confirmation,
  storage_counts: {
    people: storageSnapshot.people.people.length,
    relationships: storageSnapshot.relationships.relationships.length,
    raw_events: storageSnapshot.raw_events.length,
    semantic_events: storageSnapshot.semantic_events.length
  },
  cold_start_store: {
    candidate_persons: coldStartStore.paths.candidatePersons,
    person_role_bindings: coldStartStore.paths.personRoleBindings,
    scene_relationship_weights: coldStartStore.paths.sceneRelationshipWeights
  },
  storage_paths: {
    raw_events: storage.paths.rawEvents,
    semantic_events: storage.paths.semanticEvents,
    person_index: storage.paths.personIndex,
    relationship_index: storage.paths.relationshipIndex
  }
};

const jsonPath = path.join(outputDir, 'cold-start-person-introduction-demo.json');
const markdownPath = path.join(outputDir, 'cold-start-person-introduction-demo.md');
writeJson(jsonPath, demoReport);
writeMarkdown(markdownPath, demoReport);

console.log(JSON.stringify({
  command: 'identity:cold-start',
  demo_id: demoId,
  gate_decision: demoReport.gate_decision,
  real_send_attempted: demoReport.real_send_attempted,
  candidate_people: coldStart.summary.candidate_people,
  role_bindings: coldStart.summary.role_bindings,
  scene_relationship_weights: coldStart.summary.scene_relationship_weights,
  synced_raw_events: confirmation.event_sync.changed.raw_events,
  synced_semantic_events: confirmation.event_sync.changed.semantic_events,
  json_path: jsonPath,
  markdown_path: markdownPath
}, null, 2));
