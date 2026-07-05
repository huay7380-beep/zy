import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  initializeStorage,
  queryStoredEvents,
  storeChatEventsWithSeparation,
  writeChatStorageTestReport
} from '../packages/storage-runtime/src/index.mjs';

function nowIso() {
  return new Date().toISOString();
}

function check({ check_id, label, passed, severity = 'required', evidence = [], fix = null }) {
  return {
    check_id,
    label,
    severity,
    status: passed ? 'pass' : 'fail',
    passed: Boolean(passed),
    evidence: evidence.filter(Boolean),
    fix
  };
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function evaluateQuery(storage, spec) {
  const result = queryStoredEvents(storage, spec.criteria);
  const rawEventIds = result.raw_events.map((event) => event.event_id);
  const semanticTypes = result.semantic_events.map((event) => event.event_type_code);
  const rawOk = spec.expected.raw_event_ids
    ? sameArray(rawEventIds, spec.expected.raw_event_ids)
    : true;
  const semanticTypesOk = spec.expected.semantic_event_type_codes
    ? spec.expected.semantic_event_type_codes.every((eventType) => semanticTypes.includes(eventType))
    : true;
  const minSemanticOk = spec.expected.min_semantic_events === undefined
    ? true
    : result.counts.semantic_events >= spec.expected.min_semantic_events;
  const passed = rawOk && semanticTypesOk && minSemanticOk;
  return {
    query_id: spec.query_id,
    gate_decision: passed ? 'query_passed' : 'query_failed',
    criteria: spec.criteria,
    expected: spec.expected,
    counts: result.counts,
    raw_event_ids: rawEventIds,
    semantic_event_type_codes: semanticTypes
  };
}

const runId = `chat_storage_test_${Date.now()}`;
const outputDir = path.resolve('runtime/chat-storage-tests', runId);
const dataDir = path.join(outputDir, 'data');
const storage = initializeStorage({ dataDir });

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

const randomizedOrder = [2, 0, 4, 1, 3].map((index) => rawEvents[index]);
const writeResult = storeChatEventsWithSeparation(storage, {
  people,
  relationships,
  raw_events: randomizedOrder,
  actor: runId
});

const querySpecs = [
  {
    query_id: 'by_person',
    criteria: { person_id: 'person_client_lin' },
    expected: {
      raw_event_ids: ['raw_chat_budget', 'raw_chat_meeting', 'raw_chat_risk', 'raw_chat_preference', 'raw_chat_commitment'],
      min_semantic_events: 5
    }
  },
  {
    query_id: 'by_relationship',
    criteria: { relationship_id: 'rel_user_client_lin' },
    expected: {
      raw_event_ids: ['raw_chat_budget', 'raw_chat_meeting', 'raw_chat_risk', 'raw_chat_preference', 'raw_chat_commitment'],
      min_semantic_events: 5
    }
  },
  {
    query_id: 'by_budget_tag',
    criteria: { tag: 'budget', include_related_semantic: false },
    expected: {
      raw_event_ids: ['raw_chat_budget', 'raw_chat_commitment'],
      semantic_event_type_codes: ['budget_or_price']
    }
  },
  {
    query_id: 'by_meeting_type',
    criteria: { event_type_code: 'meeting_or_appointment' },
    expected: {
      raw_event_ids: ['raw_chat_meeting', 'raw_chat_commitment'],
      semantic_event_type_codes: ['meeting_or_appointment']
    }
  },
  {
    query_id: 'by_keyword_compliance',
    criteria: { keyword: '合规' },
    expected: {
      raw_event_ids: ['raw_chat_risk', 'raw_chat_commitment'],
      semantic_event_type_codes: ['risk_or_concern']
    }
  }
];

const queryResults = querySpecs.map((spec) => evaluateQuery(storage, spec));
const queryFailures = queryResults
  .filter((result) => result.gate_decision !== 'query_passed')
  .map((result) => `query:${result.query_id}`);

const codeAuditChecks = [
  check({
    check_id: 'schema_exists',
    label: 'Chat storage test report schema exists',
    passed: existsSync('schemas/chat-storage-test-report.schema.json'),
    evidence: ['schemas/chat-storage-test-report.schema.json'],
    fix: 'Create schemas/chat-storage-test-report.schema.json.'
  }),
  check({
    check_id: 'runtime_exports_available',
    label: 'Storage runtime exposes write, query and report functions',
    passed: typeof storeChatEventsWithSeparation === 'function'
      && typeof queryStoredEvents === 'function'
      && typeof writeChatStorageTestReport === 'function',
    evidence: ['storeChatEventsWithSeparation', 'queryStoredEvents', 'writeChatStorageTestReport'],
    fix: 'Export chat storage pipeline functions from packages/storage-runtime/src/index.mjs.'
  }),
  check({
    check_id: 'no_external_side_effects',
    label: 'Functional report uses isolated runtime data directory',
    passed: dataDir.includes(path.join('runtime', 'chat-storage-tests')),
    evidence: [`data_dir=${dataDir}`],
    fix: 'Use a runtime-scoped dataDir for functional verification.'
  }),
  check({
    check_id: 'query_gates_passed',
    label: 'All condition readback query gates passed',
    passed: queryFailures.length === 0,
    evidence: [`failures=${queryFailures.join(',') || 'none'}`],
    fix: 'Fix queryStoredEvents criteria handling or expected sample links.'
  })
];

const codeAuditFailures = codeAuditChecks
  .filter((item) => item.severity === 'required' && !item.passed)
  .map((item) => item.check_id);
const requiredFailures = unique([
  ...(writeResult.audit.required_failures ?? []),
  ...queryFailures,
  ...codeAuditFailures
]);

const report = {
  ...writeResult.audit,
  report_id: runId,
  created_at: nowIso(),
  gate_decision: requiredFailures.length ? 'chat_storage_needs_fix' : 'chat_storage_ready',
  required_failures: requiredFailures,
  storage_write: {
    gate_decision: writeResult.gate_decision,
    stored_raw_event_ids: writeResult.stored_raw_event_ids,
    stored_semantic_event_ids: writeResult.stored_semantic_event_ids,
    indexes_rebuilt: writeResult.indexes_rebuilt
  },
  query_results: queryResults,
  code_audit_checks: codeAuditChecks,
  output_files: {
    data_dir: dataDir
  }
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const written = writeChatStorageTestReport({ report, outputDir });

console.log(JSON.stringify({
  command: 'run-chat-storage-pipeline-demo',
  report_id: report.report_id,
  gate_decision: report.gate_decision,
  raw_event_count: report.metrics.raw_event_count,
  semantic_event_count: report.metrics.semantic_event_count,
  required_failures: report.required_failures,
  json_path: written.json_path,
  markdown_path: written.markdown_path
}, null, 2));

if (report.gate_decision !== 'chat_storage_ready') {
  process.exitCode = 1;
}
