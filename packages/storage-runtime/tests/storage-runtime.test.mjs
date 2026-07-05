import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  appendFeedbackRecord,
  appendRawEvent,
  appendSemanticEvent,
  auditChatStorageCompleteness,
  analyzePilotIntakeReadiness,
  importPilotBatch,
  initializeStorage,
  loadStorageSnapshot,
  normalizePilotImportBatch,
  queryStoredEvents,
  rebuildEventIndexes,
  storeChatEventsWithSeparation,
  upsertPeople,
  upsertRelationships
} from '../src/index.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-storage-'));
}

test('initializes local data store files', () => {
  const root = tempRoot();
  try {
    const storage = initializeStorage({ root });
    const snapshot = loadStorageSnapshot(storage);

    assert.deepEqual(snapshot.people.people, []);
    assert.deepEqual(snapshot.relationships.relationships, []);
    assert.deepEqual(snapshot.raw_events, []);
    assert.deepEqual(snapshot.semantic_events, []);
    assert.ok(snapshot.audit_records.some((record) => record.action === 'init_store'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('deduplicates people and relationships by stable ids', () => {
  const root = tempRoot();
  try {
    const storage = initializeStorage({ root });
    upsertPeople(storage, [
      {
        person_id: 'person_client_a',
        display_name: '张总',
        tags: ['客户']
      },
      {
        person_id: 'person_client_a',
        display_name: '张经理',
        tags: ['重点客户']
      }
    ]);
    upsertRelationships(storage, [
      {
        relationship_id: 'rel_user_client_a',
        from_person_id: 'user',
        to_person_id: 'person_client_a',
        type_code: 'client',
        health_score: 0.58
      },
      {
        relationship_id: 'rel_user_client_a',
        from_person_id: 'user',
        to_person_id: 'person_client_a',
        type_code: 'client',
        phase: 'exploring'
      }
    ]);

    const snapshot = loadStorageSnapshot(storage);
    assert.equal(snapshot.people.people.length, 1);
    assert.equal(snapshot.people.people[0].display_name, '张经理');
    assert.equal(snapshot.relationships.relationships.length, 1);
    assert.equal(snapshot.relationships.relationships[0].phase, 'exploring');
    assert.ok(snapshot.audit_records.some((record) => record.action === 'upsert_people'));
    assert.ok(snapshot.audit_records.some((record) => record.action === 'upsert_relationships'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('appends events, feedback and rebuilds indexes from source data', () => {
  const root = tempRoot();
  try {
    const storage = initializeStorage({ root });
    appendRawEvent(storage, {
      event_id: 'raw_event_001',
      event_kind: 'raw_interaction',
      source: 'chat',
      occurred_at: '2026-06-05T09:00:00+08:00',
      participants: ['user', 'person_client_a'],
      content: '客户说预算需要内部确认',
      content_summary: '客户提出预算需要内部确认',
      linked_person_ids: ['person_client_a'],
      linked_relationship_ids: ['rel_user_client_a']
    });
    appendSemanticEvent(storage, {
      event_id: 'semantic_event_001',
      raw_event_ids: ['raw_event_001'],
      event_type_code: 'payment_transaction',
      event_level: 'P2',
      tags: ['预算', '异议', '客户推进'],
      weight: 0.7,
      confidence: 0.76,
      evidence: ['客户说预算需要内部确认'],
      linked_person_ids: ['person_client_a'],
      linked_relationship_ids: ['rel_user_client_a'],
      requires_confirmation: false,
      decision_id: 'decision_001',
      trigger_id: 'trigger_001'
    });
    appendFeedbackRecord(storage, {
      feedback_id: 'feedback_001',
      decision_id: 'decision_001',
      trigger_id: 'trigger_001',
      executed: true,
      reply_received: true,
      goal_progress: 0.7,
      relationship_change: 0.2,
      user_rating: 4,
      new_event_candidate_ids: ['semantic_event_001']
    });
    const indexes = rebuildEventIndexes(storage);
    const snapshot = loadStorageSnapshot(storage);

    assert.deepEqual(indexes.personIndex.entries.person_client_a.raw_event_ids, ['raw_event_001']);
    assert.deepEqual(indexes.personIndex.entries.person_client_a.semantic_event_ids, ['semantic_event_001']);
    assert.deepEqual(indexes.relationshipIndex.entries.rel_user_client_a.semantic_event_ids, ['semantic_event_001']);
    assert.deepEqual(indexes.tagIndex.entries['预算'].semantic_event_ids, ['semantic_event_001']);
    assert.deepEqual(indexes.timeIndex.entries['2026-06-05'].raw_event_ids, ['raw_event_001']);
    assert.equal(snapshot.feedback_records.length, 1);
    assert.ok(snapshot.audit_records.some((record) => record.action === 'append_raw_event'));
    assert.ok(snapshot.audit_records.some((record) => record.action === 'append_semantic_event'));
    assert.ok(snapshot.audit_records.some((record) => record.action === 'append_feedback'));
    assert.ok(snapshot.audit_records.some((record) => record.action === 'rebuild_indexes'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writes three docs/10 closed-loop mappings to docs/12 storage objects', () => {
  const root = tempRoot();
  try {
    const fixture = JSON.parse(readFileSync('examples/closed-loop-storage-mapping.json', 'utf8'));
    const storage = initializeStorage({ root });

    assert.equal(fixture.closed_loops.length, 3);

    for (const loop of fixture.closed_loops) {
      upsertPeople(storage, loop.people);
      upsertRelationships(storage, loop.relationships);
      for (const rawEvent of loop.raw_events) {
        appendRawEvent(storage, rawEvent);
      }
      for (const semanticEvent of loop.semantic_events) {
        appendSemanticEvent(storage, semanticEvent);
      }
      appendFeedbackRecord(storage, loop.feedback);

      const chain = loop.docs10_step_mapping.step_11_chain_ids;
      assert.equal(chain.decision_id, loop.decision.decision_id);
      assert.equal(chain.trigger_id, loop.trigger.trigger_id);
      assert.equal(chain.feedback_id, loop.feedback.feedback_id);
      assert.ok(loop.semantic_events.some((event) => event.event_id === chain.event_id));
      assert.ok(loop.feedback.new_event_candidate_ids.includes(chain.event_id));
    }

    const indexes = rebuildEventIndexes(storage);
    const snapshot = loadStorageSnapshot(storage);

    assert.equal(snapshot.people.people.length, 4);
    assert.equal(snapshot.relationships.relationships.length, 3);
    assert.equal(snapshot.raw_events.length, 30);
    assert.equal(snapshot.semantic_events.length, 18);
    assert.equal(snapshot.feedback_records.length, 3);
    assert.ok(indexes.personIndex.entries.person_client_a.semantic_event_ids.includes('semantic_client_a_review_confirmed'));
    assert.ok(indexes.personIndex.entries.person_client_b.semantic_event_ids.includes('semantic_client_b_competitor_compare'));
    assert.ok(indexes.personIndex.entries.person_client_c.semantic_event_ids.includes('semantic_client_c_risk_reduced'));
    assert.ok(indexes.tagIndex.entries['技术评审'].semantic_event_ids.includes('semantic_client_a_review_confirmed'));
    assert.ok(indexes.tagIndex.entries['竞品比较'].semantic_event_ids.includes('semantic_client_b_competitor_compare'));
    assert.ok(indexes.tagIndex.entries['风险澄清'].semantic_event_ids.includes('semantic_client_c_risk_reduced'));
    assert.ok(snapshot.audit_records.filter((record) => record.action === 'append_feedback').length >= 3);
    assert.ok(snapshot.audit_records.some((record) => record.action === 'rebuild_indexes'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('imports a pilot record batch into storage objects with semantic coverage gates', () => {
  const root = tempRoot();
  try {
    const batch = JSON.parse(readFileSync('examples/pilot-import-batch.sample.json', 'utf8'));
    const normalized = normalizePilotImportBatch(batch);

    assert.equal(normalized.raw_events.length, 10);
    assert.equal(normalized.summary.ready_for_mvp_sample, true);
    assert.ok(normalized.summary.semantic_coverage >= 0.7);
    assert.ok(normalized.semantic_events.some((event) => event.event_type_code === 'meeting_or_appointment'));

    const readiness = analyzePilotIntakeReadiness(normalized, {
      inputPath: 'examples/pilot-import-batch.sample.json'
    });
    assert.equal(readiness.schema_version, 'pilot_intake_readiness.v1');
    assert.equal(readiness.gate_decision, 'continue_to_mvp_closed_loop');
    assert.equal(readiness.ready_for_decision_trial, true);
    assert.equal(readiness.ready_for_closed_loop_mvp, true);
    assert.deepEqual(readiness.required_failures, []);
    assert.equal(readiness.metrics.raw_event_count, 10);
    assert.ok(readiness.metrics.estimated_single_client_minutes <= 60);
    assert.equal(
      readiness.checks.find((check) => check.check_id === 'semantic_coverage')?.status,
      'pass'
    );

    const storage = initializeStorage({ root });
    const imported = importPilotBatch(storage, batch, { actor: 'test_import' });
    const snapshot = loadStorageSnapshot(storage);

    assert.equal(imported.indexes_rebuilt, true);
    assert.equal(snapshot.people.people.length, 2);
    assert.equal(snapshot.relationships.relationships.length, 1);
    assert.equal(snapshot.raw_events.length, 10);
    assert.equal(snapshot.semantic_events.length, normalized.semantic_events.length);
    assert.equal(snapshot.feedback_records.length, 1);
    assert.ok(snapshot.indexes.person_event.entries.person_client_a.raw_event_ids.length >= 10);
    assert.ok(snapshot.indexes.tag_event.entries['技术评审'].semantic_event_ids.includes('semantic_pilot_import_client_a_realistic_sample_hint_review_confirmed'));
    assert.ok(snapshot.audit_records.some((record) => record.action === 'rebuild_indexes'));

    const reimported = importPilotBatch(storage, batch, { actor: 'test_import_repeat' });
    const repeatedSnapshot = loadStorageSnapshot(storage);

    assert.equal(reimported.skipped_duplicates.raw_events, normalized.raw_events.length);
    assert.equal(reimported.skipped_duplicates.semantic_events, normalized.semantic_events.length);
    assert.equal(reimported.skipped_duplicates.feedback_records, normalized.feedback_records.length);
    assert.equal(repeatedSnapshot.raw_events.length, snapshot.raw_events.length);
    assert.equal(repeatedSnapshot.semantic_events.length, snapshot.semantic_events.length);
    assert.equal(repeatedSnapshot.feedback_records.length, snapshot.feedback_records.length);
    assert.ok(repeatedSnapshot.audit_records.some((record) => record.action === 'skip_duplicate_import_record'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('imports pilot feedback that is not yet bound to a runtime decision', () => {
  const root = tempRoot();
  try {
    const storage = initializeStorage({ root });
    const batch = {
      import_id: 'pilot_import_feedback_placeholder',
      people: [
        { person_id: 'user_self', display_name: 'User' },
        { person_id: 'person_friend', display_name: 'Friend' }
      ],
      relationships: [
        {
          relationship_id: 'rel_user_friend',
          from_person_id: 'user_self',
          to_person_id: 'person_friend',
          type_code: 'friend'
        }
      ],
      records: [
        {
          record_id: 'chat_001',
          occurred_at: '2026-06-15T12:00:00+08:00',
          source: 'wechat_screenshot_manual_transcription',
          speaker_person_id: 'user_self',
          content: '点了，还没到。',
          target_person_ids: ['person_friend'],
          linked_relationship_ids: ['rel_user_friend']
        }
      ],
      feedback_records: [
        {
          feedback_id: 'feedback_without_decision',
          executed: true,
          reply_received: true,
          goal_progress: 0.3,
          user_rating: 4,
          new_event_candidate_ids: []
        }
      ]
    };

    const imported = importPilotBatch(storage, batch);
    const snapshot = loadStorageSnapshot(storage);
    const feedback = snapshot.feedback_records[0];

    assert.equal(imported.feedback_records[0].decision_binding_status, 'import_batch_placeholder');
    assert.equal(feedback.decision_id, 'decision_pilot_import_feedback_placeholder_feedback_without_decision');
    assert.equal(feedback.trigger_id, 'trigger_pilot_import_feedback_placeholder_feedback_without_decision');
    assert.equal(snapshot.feedback_records.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('classifies personal intimacy chat as a relationship candidate signal', () => {
  const normalized = normalizePilotImportBatch({
    import_id: 'personal_social_wechat_sample',
    people: [
      { person_id: 'person_xiyan', display_name: '兮颜' }
    ],
    relationships: [
      {
        relationship_id: 'rel_user_xiyan',
        from_person_id: 'user',
        to_person_id: 'person_xiyan',
        type_code: 'acquaintance',
        phase: 'exploring',
        trust_level: 'low',
        health_score: 0.55
      }
    ],
    records: [
      {
        record_id: 'wechat_xiyan_visible_turns',
        source: 'wechat',
        occurred_at: '2026-06-18T15:24:00+08:00',
        speaker_person_id: 'person_xiyan',
        participant_person_ids: ['user', 'person_xiyan'],
        target_person_ids: ['person_xiyan'],
        linked_person_ids: ['person_xiyan'],
        content: '会话对象：兮颜。用户：咋就亲爱的了。兮颜：哈哈哈哈哈哈。兮颜：那是不是我男朋友嘛。兮颜：哼。用户：现在算吗？'
      }
    ],
    semantic_hints: [],
    feedback_records: []
  });

  assert.equal(normalized.semantic_events.length, 1);
  assert.equal(normalized.semantic_events[0].event_type_code, 'personal_relationship_signal');
  assert.ok(normalized.semantic_events[0].tags.includes('关系定义候选'));
  assert.equal(normalized.semantic_events[0].event_level, 'P3');
});

test('blocks incomplete pilot intake before MVP closed loop', () => {
  const batch = {
    import_id: 'pilot_import_incomplete',
    people: [],
    relationships: [],
    records: [
      {
        record_id: 'manual_001',
        source: 'manual_note',
        occurred_at: '2026-06-05T09:00:00+08:00',
        speaker_person_id: 'unknown_person',
        content: 'A short note without enough relationship evidence.'
      }
    ]
  };

  const readiness = analyzePilotIntakeReadiness(batch, {
    inputPath: 'tmp/incomplete.json'
  });

  assert.equal(readiness.gate_decision, 'stop_and_fix_intake');
  assert.equal(readiness.ready_for_decision_trial, false);
  assert.equal(readiness.ready_for_closed_loop_mvp, false);
  assert.ok(readiness.required_failures.includes('goal_defined'));
  assert.ok(readiness.required_failures.includes('people_present'));
  assert.ok(readiness.required_failures.includes('relationships_present'));
  assert.ok(readiness.required_failures.includes('primary_person_known'));
  assert.ok(readiness.required_failures.includes('raw_event_count'));
  assert.ok(readiness.required_failures.includes('raw_events_link_known_people'));
  assert.equal(
    readiness.checks.find((check) => check.check_id === 'semantic_coverage')?.status,
    'pass'
  );
  assert.ok(readiness.missing_materials.length >= readiness.required_failures.length);
});

test('separates random chat records into relationship graph storage, event graph storage and accurate readback', () => {
  const root = tempRoot();
  try {
    const storage = initializeStorage({ root });
    const people = [
      {
        person_id: 'user',
        display_name: 'Operator',
        tags: ['self']
      },
      {
        person_id: 'person_client_lin',
        display_name: 'Client Lin',
        aliases: ['Lin Manager'],
        tags: ['customer', 'b2b']
      }
    ];
    const relationships = [
      {
        relationship_id: 'rel_user_client_lin',
        from_person_id: 'user',
        to_person_id: 'person_client_lin',
        type_code: 'client',
        phase: 'proposal_review',
        trust_level: 'medium',
        health_score: 0.66
      }
    ];
    const rawEvents = [
      {
        event_id: 'raw_chat_budget',
        event_kind: 'raw_interaction',
        source: 'desktop:sightflow_desktop.wechat:wechat',
        occurred_at: '2026-06-14T09:05:00+08:00',
        participants: ['user', 'person_client_lin'],
        content: 'Client Lin: 报价能不能控制在 ¥12000 左右？预算需要给老板确认。',
        content_summary: 'Client Lin asks whether the quote can stay around ¥12000 and needs boss confirmation.',
        linked_person_ids: ['person_client_lin']
      },
      {
        event_id: 'raw_chat_meeting',
        event_kind: 'raw_interaction',
        source: 'desktop:sightflow_desktop.wechat:wechat',
        occurred_at: '2026-06-14T09:12:00+08:00',
        participants: ['user', 'person_client_lin'],
        content: 'Client Lin: 我们周三下午可以开评审会议，你把材料提前发我。',
        content_summary: 'Client Lin proposes a Wednesday review meeting and asks for materials in advance.',
        linked_person_ids: ['person_client_lin']
      },
      {
        event_id: 'raw_chat_risk',
        event_kind: 'raw_interaction',
        source: 'desktop:sightflow_desktop.wechat:wechat',
        occurred_at: '2026-06-14T09:20:00+08:00',
        participants: ['user', 'person_client_lin'],
        content: 'Client Lin: 他们比较担心安全和合规风险，需要你补充证明。',
        content_summary: 'Client Lin says the team is concerned about security and compliance risk.',
        linked_person_ids: ['person_client_lin']
      },
      {
        event_id: 'raw_chat_preference',
        event_kind: 'raw_interaction',
        source: 'desktop:sightflow_desktop.wechat:wechat',
        occurred_at: '2026-06-14T09:30:00+08:00',
        participants: ['user', 'person_client_lin'],
        content: 'Client Lin: 我更喜欢一页纸摘要，不喜欢太长的技术文档。',
        content_summary: 'Client Lin prefers a one-page summary instead of a long technical document.',
        linked_person_ids: ['person_client_lin']
      },
      {
        event_id: 'raw_chat_commitment',
        event_kind: 'raw_interaction',
        source: 'desktop:sightflow_desktop.wechat:wechat',
        occurred_at: '2026-06-14T09:40:00+08:00',
        participants: ['user', 'person_client_lin'],
        content: 'Operator: 我会今天整理报价、合规证明和会议议程发给你。',
        content_summary: 'Operator commits to send quote, compliance evidence and meeting agenda today.',
        linked_person_ids: ['person_client_lin']
      }
    ];
    const randomOrder = [2, 0, 4, 1, 3].map((index) => rawEvents[index]);
    const writeResult = storeChatEventsWithSeparation(storage, {
      people,
      relationships,
      raw_events: randomOrder,
      actor: 'test_chat_storage'
    });
    const snapshot = loadStorageSnapshot(storage);

    assert.equal(writeResult.gate_decision, 'chat_storage_write_ready');
    assert.equal(writeResult.stored_raw_event_ids.length, 5);
    assert.equal(snapshot.people.people.length, 2);
    assert.equal(snapshot.relationships.relationships.length, 1);
    assert.equal(snapshot.raw_events.length, 5);
    assert.ok(snapshot.semantic_events.length >= 5);
    assert.ok(snapshot.raw_events.every((event) => event.linked_relationship_ids.includes('rel_user_client_lin')));
    assert.ok(snapshot.semantic_events.some((event) => event.event_type_code === 'budget_or_price'));
    assert.ok(snapshot.semantic_events.some((event) => event.event_type_code === 'meeting_or_appointment'));
    assert.ok(snapshot.semantic_events.some((event) => event.event_type_code === 'risk_or_concern'));
    assert.ok(snapshot.semantic_events.some((event) => event.event_type_code === 'preference_or_profile'));
    assert.ok(snapshot.semantic_events.some((event) => event.metadata.key_facts.money.includes('¥12000')));

    const byPerson = queryStoredEvents(storage, { person_id: 'person_client_lin' });
    const byRelationship = queryStoredEvents(storage, { relationship_id: 'rel_user_client_lin' });
    const byBudgetTag = queryStoredEvents(storage, { tag: 'budget', include_related_semantic: false });
    const byMeetingType = queryStoredEvents(storage, { event_type_code: 'meeting_or_appointment' });
    const byKeyword = queryStoredEvents(storage, { keyword: '合规' });

    assert.equal(byPerson.counts.raw_events, 5);
    assert.equal(byRelationship.counts.raw_events, 5);
    assert.equal(byBudgetTag.counts.semantic_events, 2);
    assert.deepEqual(byBudgetTag.raw_events.map((event) => event.event_id), ['raw_chat_budget', 'raw_chat_commitment']);
    assert.deepEqual(byMeetingType.raw_events.map((event) => event.event_id), ['raw_chat_meeting', 'raw_chat_commitment']);
    assert.ok(byKeyword.raw_events.some((event) => event.event_id === 'raw_chat_risk'));
    assert.ok(byKeyword.semantic_events.some((event) => event.event_type_code === 'risk_or_concern'));

    const audit = auditChatStorageCompleteness(storage, {
      expected_raw_event_ids: writeResult.stored_raw_event_ids,
      expected_semantic_event_ids: writeResult.stored_semantic_event_ids
    });
    assert.equal(audit.gate_decision, 'chat_storage_ready');
    assert.deepEqual(audit.required_failures, []);
    assert.equal(audit.metrics.semantic_coverage, 1);
    assert.equal(audit.metrics.key_fact_coverage, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('chat storage audit catches raw records that have no semantic event coverage', () => {
  const root = tempRoot();
  try {
    const storage = initializeStorage({ root });
    upsertPeople(storage, [
      {
        person_id: 'user',
        display_name: 'Operator'
      },
      {
        person_id: 'person_client_lin',
        display_name: 'Client Lin'
      }
    ]);
    upsertRelationships(storage, [
      {
        relationship_id: 'rel_user_client_lin',
        from_person_id: 'user',
        to_person_id: 'person_client_lin',
        type_code: 'client'
      }
    ]);
    appendRawEvent(storage, {
      event_id: 'raw_without_semantic',
      event_kind: 'raw_interaction',
      source: 'manual_note',
      occurred_at: '2026-06-14T10:00:00+08:00',
      participants: ['user', 'person_client_lin'],
      content: 'Client Lin asks for a quote.',
      content_summary: 'Client Lin asks for a quote.',
      linked_person_ids: ['person_client_lin'],
      linked_relationship_ids: ['rel_user_client_lin']
    });
    rebuildEventIndexes(storage);

    const audit = auditChatStorageCompleteness(storage);
    assert.equal(audit.gate_decision, 'chat_storage_needs_fix');
    assert.ok(audit.required_failures.includes('semantic_events_present'));
    assert.ok(audit.required_failures.includes('semantic_coverage_per_raw_event'));
    assert.ok(audit.required_failures.includes('key_fact_semantic_coverage'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
