import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_VERSION = '0.1.0';

function projectRoot() {
  return path.resolve(here, '../../..');
}

function nowIso() {
  return new Date().toISOString();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function slug(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'item';
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tempPath, filePath);
}

function ensureJsonFile(filePath, initialValue) {
  if (!existsSync(filePath)) {
    writeJsonAtomic(filePath, initialValue);
  }
}

function ensureTextFile(filePath) {
  ensureDir(path.dirname(filePath));
  if (!existsSync(filePath)) {
    writeFileSync(filePath, '', 'utf8');
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function appendJsonl(filePath, record) {
  ensureTextFile(filePath);
  appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

export function createStorage({ root = projectRoot(), dataDir = path.join(root, 'data') } = {}) {
  return {
    root,
    dataDir,
    paths: {
      people: path.join(dataDir, 'people/people.json'),
      relationships: path.join(dataDir, 'people/relationships.json'),
      rawEvents: path.join(dataDir, 'events/raw-events.jsonl'),
      semanticEvents: path.join(dataDir, 'events/semantic-events.jsonl'),
      personIndex: path.join(dataDir, 'indexes/person-event-index.json'),
      relationshipIndex: path.join(dataDir, 'indexes/relationship-event-index.json'),
      tagIndex: path.join(dataDir, 'indexes/tag-event-index.json'),
      timeIndex: path.join(dataDir, 'indexes/time-event-index.json'),
      feedback: path.join(dataDir, 'feedback/feedback-records.jsonl'),
      audit: path.join(dataDir, 'audit/storage-audit.jsonl')
    }
  };
}

function auditId(action, entityId) {
  return `audit_${action}_${entityId}_${Date.now()}`;
}

function writeAudit(storage, audit) {
  const normalized = {
    actor: 'system',
    occurred_at: nowIso(),
    ...audit,
    audit_id: audit.audit_id ?? auditId(audit.action, audit.entity_id ?? 'unknown')
  };
  appendJsonl(storage.paths.audit, normalized);
  return normalized;
}

export function initializeStorage(options = {}) {
  const storage = createStorage(options);
  ensureDir(storage.dataDir);
  ensureJsonFile(storage.paths.people, {
    schema_version: SCHEMA_VERSION,
    people: []
  });
  ensureJsonFile(storage.paths.relationships, {
    schema_version: SCHEMA_VERSION,
    relationships: []
  });
  ensureTextFile(storage.paths.rawEvents);
  ensureTextFile(storage.paths.semanticEvents);
  ensureTextFile(storage.paths.feedback);
  ensureTextFile(storage.paths.audit);
  ensureJsonFile(storage.paths.personIndex, emptyIndex('person_event'));
  ensureJsonFile(storage.paths.relationshipIndex, emptyIndex('relationship_event'));
  ensureJsonFile(storage.paths.tagIndex, emptyIndex('tag_event'));
  ensureJsonFile(storage.paths.timeIndex, emptyIndex('time_event'));
  writeAudit(storage, {
    action: 'init_store',
    entity_type: 'store',
    entity_id: 'data',
    result: 'success',
    source_file: storage.dataDir
  });
  return storage;
}

function requireFields(record, fields, entityName) {
  const missing = fields.filter((field) => record[field] === undefined || record[field] === null || record[field] === '');
  if (missing.length) {
    throw new Error(`${entityName} missing required fields: ${missing.join(', ')}`);
  }
}

function requireArray(record, field, entityName) {
  if (!Array.isArray(record[field])) {
    throw new Error(`${entityName}.${field} must be an array`);
  }
}

function normalizePerson(person) {
  requireFields(person, ['person_id', 'display_name'], 'Person');
  return {
    aliases: [],
    roles: [],
    tags: [],
    source: 'manual',
    created_at: nowIso(),
    updated_at: nowIso(),
    ...person
  };
}

function normalizeRelationship(relationship) {
  requireFields(relationship, ['relationship_id', 'from_person_id', 'to_person_id', 'type_code'], 'RelationshipEdge');
  return {
    phase: 'unknown',
    trust_level: 'low',
    health_score: null,
    recent_event_ids: [],
    created_at: nowIso(),
    updated_at: nowIso(),
    ...relationship
  };
}

function upsertById(existingItems, incomingItems, idField) {
  const byId = new Map(existingItems.map((item) => [item[idField], item]));
  for (const item of incomingItems) {
    const previous = byId.get(item[idField]);
    byId.set(item[idField], {
      ...previous,
      ...item,
      created_at: previous?.created_at ?? item.created_at ?? nowIso(),
      updated_at: nowIso()
    });
  }
  return [...byId.values()];
}

export function upsertPeople(storage, people, { actor = 'system' } = {}) {
  const normalized = people.map(normalizePerson);
  const current = readJson(storage.paths.people);
  const next = {
    schema_version: current.schema_version ?? SCHEMA_VERSION,
    people: upsertById(current.people ?? [], normalized, 'person_id')
  };
  writeJsonAtomic(storage.paths.people, next);
  writeAudit(storage, {
    action: 'upsert_people',
    entity_type: 'person',
    entity_id: normalized.map((person) => person.person_id).join(','),
    actor,
    result: 'success',
    source_file: storage.paths.people,
    metadata: { count: normalized.length }
  });
  return next;
}

export function upsertRelationships(storage, relationships, { actor = 'system' } = {}) {
  const normalized = relationships.map(normalizeRelationship);
  const current = readJson(storage.paths.relationships);
  const next = {
    schema_version: current.schema_version ?? SCHEMA_VERSION,
    relationships: upsertById(current.relationships ?? [], normalized, 'relationship_id')
  };
  writeJsonAtomic(storage.paths.relationships, next);
  writeAudit(storage, {
    action: 'upsert_relationships',
    entity_type: 'relationship',
    entity_id: normalized.map((relationship) => relationship.relationship_id).join(','),
    actor,
    result: 'success',
    source_file: storage.paths.relationships,
    metadata: { count: normalized.length }
  });
  return next;
}

function normalizeRawEvent(rawEvent) {
  const normalized = {
    event_kind: 'raw_interaction',
    linked_person_ids: rawEvent.participants ?? [],
    created_at: nowIso(),
    ...rawEvent
  };
  requireFields(normalized, [
    'event_id',
    'event_kind',
    'source',
    'occurred_at',
    'content_summary',
    'created_at'
  ], 'RawEvent');
  requireArray(normalized, 'participants', 'RawEvent');
  requireArray(normalized, 'linked_person_ids', 'RawEvent');
  return normalized;
}

function normalizeSemanticEvent(semanticEvent) {
  const normalized = {
    status: 'candidate',
    tags: [],
    linked_person_ids: [],
    linked_relationship_ids: [],
    requires_confirmation: false,
    created_at: nowIso(),
    ...semanticEvent
  };
  requireFields(normalized, [
    'event_id',
    'event_type_code',
    'event_level',
    'weight',
    'confidence',
    'requires_confirmation',
    'created_at'
  ], 'SemanticEvent');
  requireArray(normalized, 'raw_event_ids', 'SemanticEvent');
  requireArray(normalized, 'tags', 'SemanticEvent');
  requireArray(normalized, 'evidence', 'SemanticEvent');
  requireArray(normalized, 'linked_person_ids', 'SemanticEvent');
  return normalized;
}

function normalizeFeedbackRecord(feedbackRecord) {
  const normalized = {
    created_at: nowIso(),
    ...feedbackRecord
  };
  requireFields(normalized, [
    'feedback_id',
    'decision_id',
    'executed',
    'reply_received',
    'goal_progress',
    'user_rating',
    'created_at'
  ], 'FeedbackRecord');
  return normalized;
}

function inferRawEventKind(source) {
  const value = String(source ?? '').toLowerCase();
  if (value.includes('web')) return 'web_observation';
  if (value.includes('note')) return 'manual_note';
  if (value.includes('notification')) return 'notification_result';
  return 'imported_record';
}

const SEMANTIC_IMPORT_RULES = [
  {
    type: 'budget_or_price',
    level: 'P2',
    tags: ['预算', '报价', '异议'],
    weight: 0.72,
    confidence: 0.68,
    pattern: /预算|报价|价格|费用|成本|budget|price|quote|cost/i
  },
  {
    type: 'personal_relationship_signal',
    level: 'P3',
    tags: ['私人社交', '关系定义候选', '亲密调侃'],
    weight: 0.58,
    confidence: 0.68,
    pattern: /亲爱的|男朋友|女朋友|对象|暧昧|恋爱|情侣|试用期|转正|现在算|喜欢你|想你|抱抱|亲亲|捏捏|不拧巴|boyfriend|girlfriend|dating|flirt/i
  },
  {
    type: 'meeting_or_appointment',
    level: 'P2',
    tags: ['预约', '会议', '推进'],
    weight: 0.7,
    confidence: 0.66,
    pattern: /预约|拜访|会议|评审|时间|meeting|appointment|visit|review/i
  },
  {
    type: 'competitor_compare',
    level: 'P2',
    tags: ['竞品比较', '采购判断'],
    weight: 0.74,
    confidence: 0.67,
    pattern: /竞品|对比|比较|另一家|供应商|competitor|compare|vendor/i
  },
  {
    type: 'risk_or_concern',
    level: 'P2',
    tags: ['风险', '顾虑', '澄清'],
    weight: 0.7,
    confidence: 0.65,
    pattern: /风险|担心|顾虑|不确定|合规|安全|risk|concern|security/i
  },
  {
    type: 'decision_signal',
    level: 'P2',
    tags: ['决策信号', '客户推进'],
    weight: 0.76,
    confidence: 0.7,
    pattern: /确认|同意|推进|安排|下一步|老板|内部|approve|confirm|next/i
  }
];

function inferSemanticRule(text) {
  return SEMANTIC_IMPORT_RULES.find((rule) => rule.pattern.test(text)) ?? {
    type: 'general_interaction_clue',
    level: 'P3',
    tags: ['互动线索'],
    weight: 0.52,
    confidence: 0.58
  };
}

function summarizeContent(content) {
  const normalized = String(content ?? '').replace(/\s+/g, ' ').trim();
  return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized;
}

function requireImportFields(record, fields, entityName) {
  const missing = fields.filter((field) => record[field] === undefined || record[field] === null || record[field] === '');
  if (missing.length) {
    throw new Error(`${entityName} missing required fields: ${missing.join(', ')}`);
  }
}

function normalizePilotRecord(record, { importId, createdAt }) {
  requireImportFields(record, [
    'record_id',
    'source',
    'occurred_at',
    'speaker_person_id',
    'content'
  ], 'PilotImportRecord');
  const targetPersonIds = record.target_person_ids ?? record.linked_person_ids ?? [];
  const participants = unique([
    record.speaker_person_id,
    ...(record.participant_person_ids ?? []),
    ...targetPersonIds
  ]);
  const linkedPersonIds = unique(record.linked_person_ids ?? targetPersonIds);
  return {
    event_id: record.event_id ?? `raw_${slug(importId)}_${slug(record.record_id)}`,
    event_kind: record.event_kind ?? inferRawEventKind(record.source),
    source: record.source,
    source_ref: {
      import_id: importId,
      record_id: record.record_id,
      ...(record.source_ref ?? {})
    },
    occurred_at: record.occurred_at,
    participants,
    content: record.content,
    content_summary: record.content_summary ?? summarizeContent(record.content),
    linked_person_ids: linkedPersonIds,
    linked_relationship_ids: record.linked_relationship_ids ?? [],
    evidence_refs: record.evidence_refs ?? [`${importId}:${record.record_id}`],
    metadata: {
      import_id: importId,
      record_id: record.record_id,
      speaker_person_id: record.speaker_person_id,
      imported_from: 'pilot_import_batch',
      ...(record.metadata ?? {})
    },
    created_at: record.created_at ?? createdAt
  };
}

function semanticFromHint(hint, { importId, rawByRecordId, rawByEventId, createdAt }) {
  const rawEventIds = hint.raw_event_ids
    ?? (hint.raw_record_ids ?? []).map((recordId) => rawByRecordId.get(recordId)?.event_id).filter(Boolean);
  requireImportFields({ ...hint, raw_event_ids: rawEventIds }, [
    'event_type_code',
    'event_level',
    'raw_event_ids'
  ], 'PilotSemanticHint');
  if (!Array.isArray(rawEventIds) || rawEventIds.length === 0) {
    throw new Error('PilotSemanticHint.raw_event_ids must resolve to at least one raw event');
  }
  const rawEvents = rawEventIds.map((eventId) => rawByEventId.get(eventId)).filter(Boolean);
  const evidence = hint.evidence ?? rawEvents.map((event) => event.content_summary).filter(Boolean);
  return {
    event_id: hint.event_id ?? `semantic_${slug(importId)}_${slug(hint.hint_id ?? rawEventIds.join('_'))}`,
    raw_event_ids: rawEventIds,
    event_type_code: hint.event_type_code,
    event_level: hint.event_level,
    status: hint.status ?? 'candidate',
    tags: hint.tags ?? [],
    weight: clamp(hint.weight ?? 0.6, 0, 1),
    confidence: clamp(hint.confidence ?? 0.6, 0, 1),
    evidence,
    linked_person_ids: unique(hint.linked_person_ids ?? rawEvents.flatMap((event) => event.linked_person_ids ?? [])),
    linked_relationship_ids: unique(hint.linked_relationship_ids ?? rawEvents.flatMap((event) => event.linked_relationship_ids ?? [])),
    occurred_at: hint.occurred_at ?? rawEvents[0]?.occurred_at,
    requires_confirmation: Boolean(hint.requires_confirmation),
    metadata: {
      import_id: importId,
      imported_from: 'pilot_import_batch',
      ...(hint.metadata ?? {})
    },
    created_at: hint.created_at ?? createdAt
  };
}

function semanticFromRawEvent(rawEvent, { importId, createdAt }) {
  const text = `${rawEvent.content_summary ?? ''} ${rawEvent.content ?? ''}`;
  const rule = inferSemanticRule(text);
  return {
    event_id: `semantic_${slug(importId)}_${slug(rawEvent.event_id)}`,
    raw_event_ids: [rawEvent.event_id],
    event_type_code: rule.type,
    event_level: rule.level,
    status: 'candidate',
    tags: rule.tags,
    weight: rule.weight,
    confidence: rule.confidence,
    evidence: [rawEvent.content_summary],
    linked_person_ids: rawEvent.linked_person_ids ?? [],
    linked_relationship_ids: rawEvent.linked_relationship_ids ?? [],
    occurred_at: rawEvent.occurred_at,
    requires_confirmation: false,
    metadata: {
      import_id: importId,
      inferred_by: 'storage_runtime_keyword_rules',
      imported_from: 'pilot_import_batch'
    },
    created_at: createdAt
  };
}

function summarizePilotImport({ batch, rawEvents, semanticEvents, feedbackRecords }) {
  const coveredRawIds = new Set(semanticEvents.flatMap((event) => event.raw_event_ids ?? []));
  const semanticCoverage = rawEvents.length ? coveredRawIds.size / rawEvents.length : 0;
  const warnings = [];
  if (rawEvents.length < 10) warnings.push('raw_event_count_below_10');
  if ((batch.people ?? []).length === 0) warnings.push('no_people');
  if ((batch.relationships ?? []).length === 0) warnings.push('no_relationships');
  if (semanticCoverage < 0.7) warnings.push('semantic_coverage_below_70_percent');
  if (feedbackRecords.length === 0) warnings.push('no_feedback_records');

  return {
    import_id: batch.import_id,
    raw_event_count: rawEvents.length,
    semantic_event_count: semanticEvents.length,
    feedback_count: feedbackRecords.length,
    semantic_coverage: Number(semanticCoverage.toFixed(4)),
    ready_for_mvp_sample: rawEvents.length >= 10
      && (batch.people ?? []).length > 0
      && (batch.relationships ?? []).length > 0
      && semanticCoverage >= 0.7,
    warnings
  };
}

function normalizePilotFeedbackRecord(feedbackRecord, { importId, createdAt }) {
  const feedbackKey = slug(feedbackRecord.feedback_id ?? 'feedback');
  const decisionIdProvided = Boolean(feedbackRecord.decision_id);
  return {
    decision_id: `decision_${importId}_${feedbackKey}`,
    trigger_id: `trigger_${importId}_${feedbackKey}`,
    decision_binding_status: decisionIdProvided ? 'provided' : 'import_batch_placeholder',
    created_at: createdAt,
    ...feedbackRecord
  };
}

function timeSpan(records) {
  const times = records
    .map((record) => Date.parse(record.occurred_at))
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b);
  if (!times.length) return null;
  return {
    start_at: new Date(times[0]).toISOString(),
    end_at: new Date(times[times.length - 1]).toISOString()
  };
}

function sourceBreakdown(records) {
  return records.reduce((breakdown, record) => {
    const source = record.source ?? 'unknown';
    breakdown[source] = (breakdown[source] ?? 0) + 1;
    return breakdown;
  }, {});
}

function estimateSingleClientMinutes({ rawEvents, semanticEvents, feedbackRecords }) {
  const feedbackCost = feedbackRecords.length > 0 ? 5 : 15;
  return Math.ceil((rawEvents.length * 3) + (semanticEvents.length * 2) + feedbackCost);
}

function makeReadinessCheck({ check_id, label, passed, severity = 'required', evidence = [], fix = null }) {
  return {
    check_id,
    label,
    severity,
    status: passed ? 'pass' : 'fail',
    passed: Boolean(passed),
    evidence: evidence.filter((item) => item !== undefined && item !== null && item !== ''),
    fix
  };
}

export function analyzePilotIntakeReadiness(batchOrNormalized, {
  inputPath = null,
  minRawEvents = 10,
  minSemanticCoverage = 0.7,
  maxSingleClientMinutes = 60
} = {}) {
  const normalized = batchOrNormalized?.raw_events && batchOrNormalized?.summary
    ? batchOrNormalized
    : normalizePilotImportBatch(batchOrNormalized);
  const peopleIds = new Set((normalized.people ?? []).map((person) => person.person_id));
  const relationshipIds = new Set((normalized.relationships ?? []).map((relationship) => relationship.relationship_id));
  const primaryPersonId = normalized.goal?.primary_person_id ?? null;
  const linkedRawEvents = normalized.raw_events.filter((event) =>
    (event.linked_person_ids ?? []).some((personId) => peopleIds.has(personId))
  );
  const semanticEventsWithEvidence = normalized.semantic_events.filter((event) =>
    Array.isArray(event.evidence) && event.evidence.length > 0
  );
  const semanticEventsLinkedToRelationships = normalized.semantic_events.filter((event) =>
    (event.linked_relationship_ids ?? []).some((relationshipId) => relationshipIds.has(relationshipId))
  );
  const span = timeSpan(normalized.raw_events);
  const estimatedSingleClientMinutes = estimateSingleClientMinutes({
    rawEvents: normalized.raw_events,
    semanticEvents: normalized.semantic_events,
    feedbackRecords: normalized.feedback_records
  });
  const checks = [
    makeReadinessCheck({
      check_id: 'goal_defined',
      label: '用户目标已定义',
      passed: Boolean(normalized.goal?.initial_goal && primaryPersonId),
      evidence: [
        `initial_goal=${normalized.goal?.initial_goal ?? 'missing'}`,
        `primary_person_id=${primaryPersonId ?? 'missing'}`
      ],
      fix: '补充 goal.initial_goal 和 goal.primary_person_id。'
    }),
    makeReadinessCheck({
      check_id: 'people_present',
      label: '人物对象已提供',
      passed: (normalized.people ?? []).length > 0,
      evidence: [`people=${(normalized.people ?? []).length}`],
      fix: '至少提供使用者、目标对象或关键关系人的 Person 记录。'
    }),
    makeReadinessCheck({
      check_id: 'relationships_present',
      label: '人物关系已提供',
      passed: (normalized.relationships ?? []).length > 0,
      evidence: [`relationships=${(normalized.relationships ?? []).length}`],
      fix: '至少提供一条从使用者到目标对象的 RelationshipEdge。'
    }),
    makeReadinessCheck({
      check_id: 'primary_person_known',
      label: '主要目标对象能在人物表中找到',
      passed: Boolean(primaryPersonId && peopleIds.has(primaryPersonId)),
      evidence: [
        `primary_person_id=${primaryPersonId ?? 'missing'}`,
        `known=${primaryPersonId ? peopleIds.has(primaryPersonId) : false}`
      ],
      fix: '确保 goal.primary_person_id 与 people[].person_id 完全一致。'
    }),
    makeReadinessCheck({
      check_id: 'raw_event_count',
      label: '原始互动记录达到最小样本量',
      passed: normalized.raw_events.length >= minRawEvents,
      evidence: [`raw_events=${normalized.raw_events.length}`, `minimum=${minRawEvents}`],
      fix: `补足到至少 ${minRawEvents} 条聊天、网页或手工记录。`
    }),
    makeReadinessCheck({
      check_id: 'semantic_coverage',
      label: '语义事件覆盖率达到 70%',
      passed: normalized.summary.semantic_coverage >= minSemanticCoverage,
      evidence: [
        `semantic_coverage=${normalized.summary.semantic_coverage}`,
        `minimum=${minSemanticCoverage}`
      ],
      fix: '补充 semantic_hints 或增加更有信息量的原始记录。'
    }),
    makeReadinessCheck({
      check_id: 'raw_events_link_known_people',
      label: '原始记录能关联到已知人物',
      passed: normalized.raw_events.length > 0
        && linkedRawEvents.length / normalized.raw_events.length >= 0.7,
      evidence: [
        `linked_raw_events=${linkedRawEvents.length}`,
        `raw_events=${normalized.raw_events.length}`
      ],
      fix: '为记录补充 target_person_ids、linked_person_ids 或 participant_person_ids。'
    }),
    makeReadinessCheck({
      check_id: 'semantic_events_have_evidence',
      label: '语义事件带有证据文本',
      passed: normalized.semantic_events.length > 0
        && semanticEventsWithEvidence.length === normalized.semantic_events.length,
      evidence: [
        `semantic_with_evidence=${semanticEventsWithEvidence.length}`,
        `semantic_events=${normalized.semantic_events.length}`
      ],
      fix: '确保 semantic_hints.evidence 或原始 content_summary 可支撑语义事件。'
    }),
    makeReadinessCheck({
      check_id: 'relationship_evidence_linked',
      label: '至少部分语义事件能关联到关系边',
      severity: 'recommended',
      passed: semanticEventsLinkedToRelationships.length > 0,
      evidence: [`semantic_linked_relationships=${semanticEventsLinkedToRelationships.length}`],
      fix: '为记录或语义提示补充 linked_relationship_ids。'
    }),
    makeReadinessCheck({
      check_id: 'single_client_timebox_plausible',
      label: 'single client pilot can likely finish within timebox',
      severity: 'recommended',
      passed: estimatedSingleClientMinutes <= maxSingleClientMinutes,
      evidence: [
        `estimated_minutes=${estimatedSingleClientMinutes}`,
        `maximum=${maxSingleClientMinutes}`
      ],
      fix: 'Reduce one pilot batch to one target person, fewer raw records, or run decision-only before closed-loop feedback.'
    }),
    makeReadinessCheck({
      check_id: 'feedback_present',
      label: '已有至少一条行动反馈',
      severity: 'recommended',
      passed: normalized.feedback_records.length > 0,
      evidence: [`feedback_records=${normalized.feedback_records.length}`],
      fix: '如果还没有执行动作，可以先跑决策试点；要跑完整闭环则补充 FeedbackRecord。'
    })
  ];
  const requiredFailures = checks.filter((check) => check.severity === 'required' && !check.passed);
  const recommendedFailures = checks.filter((check) => check.severity === 'recommended' && !check.passed);
  const readyForDecisionTrial = requiredFailures.length === 0;
  const readyForClosedLoopMvp = readyForDecisionTrial && normalized.feedback_records.length > 0;
  const gateDecision = readyForClosedLoopMvp
    ? 'continue_to_mvp_closed_loop'
    : readyForDecisionTrial
      ? 'run_decision_trial_collect_feedback_before_closed_loop'
      : 'stop_and_fix_intake';

  return {
    schema_version: 'pilot_intake_readiness.v1',
    readiness_id: `pilot_intake_readiness_${slug(normalized.import_id)}_${Date.now()}`,
    created_at: nowIso(),
    import_id: normalized.import_id,
    input_path: inputPath,
    gate_decision: gateDecision,
    ready_for_decision_trial: readyForDecisionTrial,
    ready_for_closed_loop_mvp: readyForClosedLoopMvp,
    thresholds: {
      min_raw_events: minRawEvents,
      min_semantic_coverage: minSemanticCoverage,
      max_single_client_minutes: maxSingleClientMinutes
    },
    metrics: {
      people_count: normalized.people.length,
      relationship_count: normalized.relationships.length,
      raw_event_count: normalized.raw_events.length,
      semantic_event_count: normalized.semantic_events.length,
      semantic_coverage: normalized.summary.semantic_coverage,
      feedback_count: normalized.feedback_records.length,
      source_breakdown: sourceBreakdown(normalized.raw_events),
      record_time_span: span,
      estimated_single_client_minutes: estimatedSingleClientMinutes,
      linked_raw_event_ratio: normalized.raw_events.length
        ? Number((linkedRawEvents.length / normalized.raw_events.length).toFixed(4))
        : 0,
      semantic_relationship_link_count: semanticEventsLinkedToRelationships.length
    },
    checks,
    required_failures: requiredFailures.map((check) => check.check_id),
    recommended_failures: recommendedFailures.map((check) => check.check_id),
    missing_materials: checks
      .filter((check) => !check.passed)
      .map((check) => ({
        check_id: check.check_id,
        severity: check.severity,
        fix: check.fix
      })),
    continue_when: [
      'required_failures 为空。',
      'raw_event_count 不低于 10。',
      'semantic_coverage 不低于 0.7。',
      'primary_person_id 能在 people 中找到。',
      '要跑完整闭环时至少有 1 条 feedback_records。'
    ],
    stop_or_adjust_when: [
      'required_failures 不为空。',
      '连续 2 轮修正后关键线索召回率仍低于 70%。',
      '单个客户试点耗时超过 1 小时仍无法闭环。',
      '状态上报出现不可重建错误。'
    ],
    next_commands: {
      validate_intake: inputPath
        ? `node scripts/validate-pilot-intake.mjs --input=${inputPath}`
        : 'node scripts/validate-pilot-intake.mjs --input=<PilotImportBatch.json>',
      dry_run_import: inputPath
        ? `node scripts/import-pilot-records.mjs --input=${inputPath} --dry-run`
        : 'node scripts/import-pilot-records.mjs --input=<PilotImportBatch.json> --dry-run',
      run_mvp: inputPath
        ? `node scripts/run-mvp-loop.mjs --pilot-import=${inputPath} --write-report`
        : 'node scripts/run-mvp-loop.mjs --pilot-import=<PilotImportBatch.json> --write-report',
      audit_after_run: 'npm run mvp:audit'
    }
  };
}

export function normalizePilotImportBatch(batch) {
  requireImportFields(batch, ['import_id'], 'PilotImportBatch');
  if (!Array.isArray(batch.people)) throw new Error('PilotImportBatch.people must be an array');
  if (!Array.isArray(batch.relationships)) throw new Error('PilotImportBatch.relationships must be an array');
  if (!Array.isArray(batch.records)) throw new Error('PilotImportBatch.records must be an array');

  const createdAt = nowIso();
  const rawEvents = batch.records.map((record) => normalizePilotRecord(record, {
    importId: batch.import_id,
    createdAt
  }));
  const rawByRecordId = new Map(batch.records.map((record, index) => [record.record_id, rawEvents[index]]));
  const rawByEventId = new Map(rawEvents.map((event) => [event.event_id, event]));
  const hintedEvents = (batch.semantic_hints ?? []).map((hint) => semanticFromHint(hint, {
    importId: batch.import_id,
    rawByRecordId,
    rawByEventId,
    createdAt
  }));
  const coveredRawIds = new Set(hintedEvents.flatMap((event) => event.raw_event_ids));
  const inferredEvents = rawEvents
    .filter((event) => !coveredRawIds.has(event.event_id))
    .map((event) => semanticFromRawEvent(event, {
      importId: batch.import_id,
      createdAt
    }));
  const semanticEvents = [...hintedEvents, ...inferredEvents];
  const feedbackRecords = (batch.feedback_records ?? []).map((feedbackRecord) =>
    normalizePilotFeedbackRecord(feedbackRecord, {
      importId: batch.import_id,
      createdAt
    }));
  const summary = summarizePilotImport({
    batch,
    rawEvents,
    semanticEvents,
    feedbackRecords
  });

  return {
    schema_version: batch.schema_version ?? SCHEMA_VERSION,
    import_id: batch.import_id,
    goal: batch.goal ?? null,
    people: batch.people,
    relationships: batch.relationships,
    raw_events: rawEvents,
    semantic_events: semanticEvents,
    feedback_records: feedbackRecords,
    summary
  };
}

function buildImportDeduplicationState(storage) {
  const snapshot = loadStorageSnapshot(storage);
  return {
    rawEventIds: new Set(snapshot.raw_events.map((event) => event.event_id)),
    semanticEventIds: new Set(snapshot.semantic_events.map((event) => event.event_id)),
    feedbackIds: new Set(snapshot.feedback_records.map((feedback) => feedback.feedback_id))
  };
}

function duplicateSkipSummary() {
  return {
    raw_events: 0,
    semantic_events: 0,
    feedback_records: 0,
    raw_event_ids: [],
    semantic_event_ids: [],
    feedback_ids: []
  };
}

function writeDuplicateSkipAudit(storage, { actor, entityType, entityId, sourceFile }) {
  writeAudit(storage, {
    action: 'skip_duplicate_import_record',
    entity_type: entityType,
    entity_id: entityId,
    actor,
    result: 'skipped',
    reason: 'duplicate_stable_id',
    source_file: sourceFile
  });
}

export function importPilotBatch(storage, batch, {
  actor = 'pilot_import',
  rebuildIndexesAfterImport = true,
  skipDuplicates = true
} = {}) {
  const normalized = normalizePilotImportBatch(batch);
  const deduplicationState = skipDuplicates ? buildImportDeduplicationState(storage) : null;
  const skippedDuplicates = duplicateSkipSummary();
  upsertPeople(storage, normalized.people, { actor });
  upsertRelationships(storage, normalized.relationships, { actor });
  for (const rawEvent of normalized.raw_events) {
    if (deduplicationState?.rawEventIds.has(rawEvent.event_id)) {
      skippedDuplicates.raw_events += 1;
      skippedDuplicates.raw_event_ids.push(rawEvent.event_id);
      writeDuplicateSkipAudit(storage, {
        actor,
        entityType: 'raw_event',
        entityId: rawEvent.event_id,
        sourceFile: storage.paths.rawEvents
      });
      continue;
    }
    appendRawEvent(storage, rawEvent, { actor });
    deduplicationState?.rawEventIds.add(rawEvent.event_id);
  }
  for (const semanticEvent of normalized.semantic_events) {
    if (deduplicationState?.semanticEventIds.has(semanticEvent.event_id)) {
      skippedDuplicates.semantic_events += 1;
      skippedDuplicates.semantic_event_ids.push(semanticEvent.event_id);
      writeDuplicateSkipAudit(storage, {
        actor,
        entityType: 'semantic_event',
        entityId: semanticEvent.event_id,
        sourceFile: storage.paths.semanticEvents
      });
      continue;
    }
    appendSemanticEvent(storage, semanticEvent, { actor });
    deduplicationState?.semanticEventIds.add(semanticEvent.event_id);
  }
  for (const feedback of normalized.feedback_records) {
    if (deduplicationState?.feedbackIds.has(feedback.feedback_id)) {
      skippedDuplicates.feedback_records += 1;
      skippedDuplicates.feedback_ids.push(feedback.feedback_id);
      writeDuplicateSkipAudit(storage, {
        actor,
        entityType: 'feedback_record',
        entityId: feedback.feedback_id,
        sourceFile: storage.paths.feedback
      });
      continue;
    }
    appendFeedbackRecord(storage, feedback, { actor });
    deduplicationState?.feedbackIds.add(feedback.feedback_id);
  }
  const indexes = rebuildIndexesAfterImport
    ? rebuildEventIndexes(storage, { actor })
    : null;
  return {
    ...normalized,
    skipped_duplicates: skippedDuplicates,
    indexes_rebuilt: Boolean(indexes),
    indexes
  };
}

function appendWithAudit({ storage, record, normalize, filePath, action, entityType, actor }) {
  try {
    const normalized = normalize(record);
    appendJsonl(filePath, normalized);
    writeAudit(storage, {
      action,
      entity_type: entityType,
      entity_id: normalized.event_id ?? normalized.feedback_id,
      actor,
      result: 'success',
      source_file: filePath
    });
    return normalized;
  } catch (error) {
    writeAudit(storage, {
      action,
      entity_type: entityType,
      entity_id: record?.event_id ?? record?.feedback_id ?? 'unknown',
      actor,
      result: 'failure',
      reason: error.message,
      source_file: filePath
    });
    throw error;
  }
}

export function appendRawEvent(storage, rawEvent, { actor = 'system' } = {}) {
  return appendWithAudit({
    storage,
    record: rawEvent,
    normalize: normalizeRawEvent,
    filePath: storage.paths.rawEvents,
    action: 'append_raw_event',
    entityType: 'raw_event',
    actor
  });
}

export function appendSemanticEvent(storage, semanticEvent, { actor = 'system' } = {}) {
  return appendWithAudit({
    storage,
    record: semanticEvent,
    normalize: normalizeSemanticEvent,
    filePath: storage.paths.semanticEvents,
    action: 'append_semantic_event',
    entityType: 'semantic_event',
    actor
  });
}

export function appendFeedbackRecord(storage, feedbackRecord, { actor = 'system' } = {}) {
  return appendWithAudit({
    storage,
    record: feedbackRecord,
    normalize: normalizeFeedbackRecord,
    filePath: storage.paths.feedback,
    action: 'append_feedback',
    entityType: 'feedback_record',
    actor
  });
}

function emptyIndex(indexType, rebuiltAt = null, sourceCounts = { raw_events: 0, semantic_events: 0 }) {
  return {
    schema_version: SCHEMA_VERSION,
    index_type: indexType,
    rebuilt_at: rebuiltAt,
    source_counts: sourceCounts,
    entries: {}
  };
}

function addIndexEntry(entries, key, eventKind, eventId) {
  if (!key) return;
  entries[key] ??= {
    raw_event_ids: [],
    semantic_event_ids: []
  };
  const field = eventKind === 'raw' ? 'raw_event_ids' : 'semantic_event_ids';
  entries[key][field] = unique([...entries[key][field], eventId]);
}

function eventDate(event) {
  const value = event.occurred_at ?? event.created_at;
  if (!value) return null;
  return String(value).slice(0, 10);
}

export function rebuildEventIndexes(storage, { actor = 'system' } = {}) {
  const rawEvents = readJsonl(storage.paths.rawEvents);
  const semanticEvents = readJsonl(storage.paths.semanticEvents);
  const rebuiltAt = nowIso();
  const sourceCounts = {
    raw_events: rawEvents.length,
    semantic_events: semanticEvents.length
  };
  const personIndex = emptyIndex('person_event', rebuiltAt, sourceCounts);
  const relationshipIndex = emptyIndex('relationship_event', rebuiltAt, sourceCounts);
  const tagIndex = emptyIndex('tag_event', rebuiltAt, sourceCounts);
  const timeIndex = emptyIndex('time_event', rebuiltAt, sourceCounts);

  for (const event of rawEvents) {
    for (const personId of unique([...(event.participants ?? []), ...(event.linked_person_ids ?? [])])) {
      addIndexEntry(personIndex.entries, personId, 'raw', event.event_id);
    }
    for (const relationshipId of event.linked_relationship_ids ?? []) {
      addIndexEntry(relationshipIndex.entries, relationshipId, 'raw', event.event_id);
    }
    addIndexEntry(timeIndex.entries, eventDate(event), 'raw', event.event_id);
  }

  for (const event of semanticEvents) {
    for (const personId of event.linked_person_ids ?? []) {
      addIndexEntry(personIndex.entries, personId, 'semantic', event.event_id);
    }
    for (const relationshipId of event.linked_relationship_ids ?? []) {
      addIndexEntry(relationshipIndex.entries, relationshipId, 'semantic', event.event_id);
    }
    for (const tag of event.tags ?? []) {
      addIndexEntry(tagIndex.entries, tag, 'semantic', event.event_id);
    }
    addIndexEntry(timeIndex.entries, eventDate(event), 'semantic', event.event_id);
  }

  writeJsonAtomic(storage.paths.personIndex, personIndex);
  writeJsonAtomic(storage.paths.relationshipIndex, relationshipIndex);
  writeJsonAtomic(storage.paths.tagIndex, tagIndex);
  writeJsonAtomic(storage.paths.timeIndex, timeIndex);
  writeAudit(storage, {
    action: 'rebuild_indexes',
    entity_type: 'index',
    entity_id: 'event_indexes',
    actor,
    result: 'success',
    source_file: path.join(storage.dataDir, 'indexes'),
    metadata: sourceCounts
  });

  return {
    personIndex,
    relationshipIndex,
    tagIndex,
    timeIndex
  };
}

const CHAT_SEMANTIC_RULES = [
  {
    event_type_code: 'high_risk_boundary',
    event_level: 'P1',
    tags: ['risk', 'boundary', 'manual_confirmation'],
    weight: 0.92,
    confidence: 0.84,
    requires_confirmation: true,
    patterns: [
      /不要再联系|停止联系|拉黑|投诉|违约|泄露|隐私|高风险|stop contacting|complaint|breach|privacy leak|block me/i
    ]
  },
  {
    event_type_code: 'budget_or_price',
    event_level: 'P2',
    tags: ['budget', 'pricing', 'quote'],
    weight: 0.76,
    confidence: 0.74,
    requires_confirmation: false,
    patterns: [
      /预算|报价|价格|费用|成本|付款|¥|￥|budget|price|quote|cost|payment|\$/i
    ]
  },
  {
    event_type_code: 'meeting_or_appointment',
    event_level: 'P2',
    tags: ['meeting', 'appointment', 'schedule'],
    weight: 0.72,
    confidence: 0.72,
    requires_confirmation: false,
    patterns: [
      /会议|约|预约|拜访|评审|时间|周[一二三四五六日天]|明天|后天|meeting|appointment|schedule|tomorrow|next week/i
    ]
  },
  {
    event_type_code: 'decision_signal',
    event_level: 'P2',
    tags: ['decision', 'approval', 'next_step'],
    weight: 0.78,
    confidence: 0.76,
    requires_confirmation: false,
    patterns: [
      /确认|同意|推进|下一步|老板|内部|审批|approve|confirm|agreed|next step|go ahead/i
    ]
  },
  {
    event_type_code: 'task_commitment',
    event_level: 'P2',
    tags: ['task', 'commitment', 'follow_up'],
    weight: 0.7,
    confidence: 0.7,
    requires_confirmation: false,
    patterns: [
      /我会|我们会|请|需要|安排|发送|补充|提供|整理|send|provide|prepare|follow up|share/i
    ]
  },
  {
    event_type_code: 'risk_or_concern',
    event_level: 'P2',
    tags: ['risk', 'concern', 'clarification'],
    weight: 0.73,
    confidence: 0.7,
    requires_confirmation: false,
    patterns: [
      /担心|顾虑|风险|不确定|合规|安全|concern|risk|unclear|security|compliance/i
    ]
  },
  {
    event_type_code: 'personal_relationship_signal',
    event_level: 'P3',
    tags: ['personal_social', 'relationship_definition_candidate', 'intimacy_play'],
    weight: 0.58,
    confidence: 0.68,
    requires_confirmation: false,
    patterns: [
      /亲爱的|男朋友|女朋友|对象|暧昧|恋爱|情侣|试用期|转正|现在算|喜欢你|想你|抱抱|亲亲|捏捏|不拧巴|boyfriend|girlfriend|dating|flirt/i
    ]
  },
  {
    event_type_code: 'preference_or_profile',
    event_level: 'P3',
    tags: ['preference', 'profile', 'relationship_context'],
    weight: 0.58,
    confidence: 0.66,
    requires_confirmation: false,
    patterns: [
      /喜欢|偏好|不喜欢|习惯|倾向|prefer|like|dislike|usually|habit/i
    ]
  }
];

const GENERAL_CHAT_RULE = {
  event_type_code: 'general_interaction_clue',
  event_level: 'P3',
  tags: ['general_interaction', 'chat_clue'],
  weight: 0.48,
  confidence: 0.58,
  requires_confirmation: false,
  patterns: []
};

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeCriteriaArray(value) {
  return unique(asArray(value).map((item) => String(item).trim()).filter(Boolean));
}

function textForEvent(event) {
  return `${event.content_summary ?? ''} ${event.content ?? ''}`.trim();
}

function ruleMatchesText(rule, text) {
  return rule.patterns.some((pattern) => pattern.test(text));
}

function matchedChatRules(text) {
  const matches = CHAT_SEMANTIC_RULES.filter((rule) => ruleMatchesText(rule, text));
  return matches.length ? matches : [GENERAL_CHAT_RULE];
}

function extractRegexMatches(text, pattern) {
  return unique(String(text ?? '').match(pattern) ?? []);
}

export function extractChatKeyFacts(text) {
  const value = String(text ?? '');
  const money = extractRegexMatches(
    value,
    /(?:[¥￥$]\s*\d+(?:\.\d+)?(?:\s*(?:万|元|块|rmb|usd|k))?)|(?:\d+(?:\.\d+)?\s*(?:万|万元|元|块|人民币|rmb|usd|dollars?|k))/gi
  );
  const dates = extractRegexMatches(
    value,
    /\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}日|周[一二三四五六日天]|明天|后天|今天|tomorrow|today|next week|monday|tuesday|wednesday|thursday|friday/gi
  );
  const questionSignals = extractRegexMatches(
    value,
    /吗|呢|是否|能否|可不可以|什么|怎么|why|what|when|how|could you|can you|\?/gi
  );
  const actionSignals = extractRegexMatches(
    value,
    /我会|我们会|请|需要|安排|发送|补充|提供|整理|确认|send|provide|prepare|schedule|confirm|follow up|share/gi
  );
  const riskSignals = extractRegexMatches(
    value,
    /担心|顾虑|风险|投诉|违约|隐私|安全|合规|不要再联系|concern|risk|complaint|breach|privacy|security|compliance|stop contacting/gi
  );
  return {
    money,
    dates,
    question_signals: questionSignals,
    action_signals: actionSignals,
    risk_signals: riskSignals,
    has_question: questionSignals.length > 0,
    has_action_request: actionSignals.length > 0,
    has_risk_signal: riskSignals.length > 0
  };
}

function semanticEventIdFor(rawEvent, rule, semanticIdPrefix = 'semantic') {
  return `${slug(semanticIdPrefix)}_${slug(rawEvent.event_id)}_${slug(rule.event_type_code)}`;
}

function relationshipTouchesPeople(relationship, personIds) {
  return personIds.includes(relationship.from_person_id) || personIds.includes(relationship.to_person_id);
}

function inferRelationshipIds(rawEvent, relationships = []) {
  const explicit = rawEvent.linked_relationship_ids ?? [];
  const personIds = unique([...(rawEvent.linked_person_ids ?? []), ...(rawEvent.participants ?? [])]);
  if (!personIds.length) return explicit;
  const inferred = relationships
    .filter((relationship) => relationshipTouchesPeople(relationship, personIds))
    .map((relationship) => relationship.relationship_id);
  return unique([...explicit, ...inferred]);
}

export function expectedSemanticTypesForRawEvent(rawEvent) {
  return matchedChatRules(textForEvent(rawEvent)).map((rule) => rule.event_type_code);
}

export function extractSemanticEventsFromRawEvents(rawEvents, {
  relationships = [],
  createdAt = nowIso(),
  semanticIdPrefix = 'semantic'
} = {}) {
  const semanticEvents = [];
  for (const rawEvent of rawEvents) {
    const text = textForEvent(rawEvent);
    const keyFacts = extractChatKeyFacts(text);
    const relationshipIds = inferRelationshipIds(rawEvent, relationships);
    for (const rule of matchedChatRules(text)) {
      semanticEvents.push({
        event_id: semanticEventIdFor(rawEvent, rule, semanticIdPrefix),
        raw_event_ids: [rawEvent.event_id],
        event_type_code: rule.event_type_code,
        event_level: rule.event_level,
        status: 'candidate',
        tags: rule.tags,
        weight: rule.weight,
        confidence: Math.min(1, Number(((rule.confidence + (rawEvent.metadata?.confidence ?? 0)) || rule.confidence).toFixed(2))),
        evidence: [rawEvent.content_summary ?? summarizeContent(rawEvent.content)],
        linked_person_ids: unique(rawEvent.linked_person_ids ?? []),
        linked_relationship_ids: relationshipIds,
        occurred_at: rawEvent.occurred_at,
        requires_confirmation: Boolean(rule.requires_confirmation || rawEvent.metadata?.requires_confirmation),
        metadata: {
          inferred_by: 'chat_storage_semantic_rules.v1',
          source_raw_event_id: rawEvent.event_id,
          key_facts: keyFacts,
          matched_rule: rule.event_type_code
        },
        created_at: createdAt
      });
    }
  }
  return semanticEvents;
}

function hasAny(values, expected) {
  const set = new Set(values ?? []);
  return expected.some((item) => set.has(item));
}

function isInRange(event, { from = null, to = null } = {}) {
  const value = Date.parse(event.occurred_at ?? event.created_at);
  if (!Number.isFinite(value)) return true;
  if (from && value < Date.parse(from)) return false;
  if (to && value > Date.parse(to)) return false;
  return true;
}

function rawEventMatches(rawEvent, criteria) {
  const semanticOnly = normalizeCriteriaArray(criteria.tag ?? criteria.tags).length > 0
    || normalizeCriteriaArray(criteria.event_type_code ?? criteria.event_type_codes).length > 0
    || normalizeCriteriaArray(criteria.event_level ?? criteria.event_levels).length > 0
    || normalizeCriteriaArray(criteria.semantic_event_id ?? criteria.semantic_event_ids).length > 0;
  if (semanticOnly) return false;
  const personIds = normalizeCriteriaArray(criteria.person_id ?? criteria.person_ids);
  const relationshipIds = normalizeCriteriaArray(criteria.relationship_id ?? criteria.relationship_ids);
  const sources = normalizeCriteriaArray(criteria.source ?? criteria.sources);
  const rawEventIds = normalizeCriteriaArray(criteria.raw_event_id ?? criteria.raw_event_ids);
  const keyword = String(criteria.keyword ?? '').trim().toLowerCase();
  if (rawEventIds.length && !rawEventIds.includes(rawEvent.event_id)) return false;
  if (personIds.length && !hasAny([...(rawEvent.participants ?? []), ...(rawEvent.linked_person_ids ?? [])], personIds)) return false;
  if (relationshipIds.length && !hasAny(rawEvent.linked_relationship_ids ?? [], relationshipIds)) return false;
  if (sources.length && !sources.includes(rawEvent.source)) return false;
  if (keyword && !textForEvent(rawEvent).toLowerCase().includes(keyword)) return false;
  return isInRange(rawEvent, { from: criteria.from, to: criteria.to });
}

function semanticEventMatches(semanticEvent, criteria) {
  const personIds = normalizeCriteriaArray(criteria.person_id ?? criteria.person_ids);
  const relationshipIds = normalizeCriteriaArray(criteria.relationship_id ?? criteria.relationship_ids);
  const tags = normalizeCriteriaArray(criteria.tag ?? criteria.tags);
  const eventTypeCodes = normalizeCriteriaArray(criteria.event_type_code ?? criteria.event_type_codes);
  const eventLevels = normalizeCriteriaArray(criteria.event_level ?? criteria.event_levels);
  const rawEventIds = normalizeCriteriaArray(criteria.raw_event_id ?? criteria.raw_event_ids);
  const semanticEventIds = normalizeCriteriaArray(criteria.semantic_event_id ?? criteria.semantic_event_ids);
  const keyword = String(criteria.keyword ?? '').trim().toLowerCase();
  if (semanticEventIds.length && !semanticEventIds.includes(semanticEvent.event_id)) return false;
  if (rawEventIds.length && !hasAny(semanticEvent.raw_event_ids ?? [], rawEventIds)) return false;
  if (personIds.length && !hasAny(semanticEvent.linked_person_ids ?? [], personIds)) return false;
  if (relationshipIds.length && !hasAny(semanticEvent.linked_relationship_ids ?? [], relationshipIds)) return false;
  if (tags.length && !hasAny(semanticEvent.tags ?? [], tags)) return false;
  if (eventTypeCodes.length && !eventTypeCodes.includes(semanticEvent.event_type_code)) return false;
  if (eventLevels.length && !eventLevels.includes(semanticEvent.event_level)) return false;
  if (keyword && !(semanticEvent.evidence ?? []).join(' ').toLowerCase().includes(keyword)) return false;
  return isInRange(semanticEvent, { from: criteria.from, to: criteria.to });
}

function byOccurredAt(left, right) {
  return String(left.occurred_at ?? left.created_at ?? '').localeCompare(String(right.occurred_at ?? right.created_at ?? ''));
}

export function queryStoredEvents(storage, criteria = {}) {
  const snapshot = loadStorageSnapshot(storage);
  const directRawEvents = snapshot.raw_events.filter((event) => rawEventMatches(event, criteria));
  const directSemanticEvents = snapshot.semantic_events.filter((event) => semanticEventMatches(event, criteria));
  const includeRelatedRaw = criteria.include_related_raw !== false;
  const includeRelatedSemantic = criteria.include_related_semantic !== false;
  const rawById = new Map(snapshot.raw_events.map((event) => [event.event_id, event]));
  const semanticById = new Map(snapshot.semantic_events.map((event) => [event.event_id, event]));
  const rawIds = new Set(directRawEvents.map((event) => event.event_id));
  const semanticIds = new Set(directSemanticEvents.map((event) => event.event_id));

  if (includeRelatedRaw) {
    for (const semanticEvent of directSemanticEvents) {
      for (const rawEventId of semanticEvent.raw_event_ids ?? []) {
        if (rawById.has(rawEventId)) rawIds.add(rawEventId);
      }
    }
  }
  if (includeRelatedSemantic) {
    for (const semanticEvent of snapshot.semantic_events) {
      if ((semanticEvent.raw_event_ids ?? []).some((rawEventId) => rawIds.has(rawEventId))) {
        semanticIds.add(semanticEvent.event_id);
      }
    }
  }

  const rawEvents = [...rawIds].map((eventId) => rawById.get(eventId)).filter(Boolean).sort(byOccurredAt);
  const semanticEvents = [...semanticIds].map((eventId) => semanticById.get(eventId)).filter(Boolean).sort(byOccurredAt);
  const personIds = unique([
    ...rawEvents.flatMap((event) => [...(event.participants ?? []), ...(event.linked_person_ids ?? [])]),
    ...semanticEvents.flatMap((event) => event.linked_person_ids ?? [])
  ]);
  const relationshipIds = unique([
    ...rawEvents.flatMap((event) => event.linked_relationship_ids ?? []),
    ...semanticEvents.flatMap((event) => event.linked_relationship_ids ?? [])
  ]);
  const people = (snapshot.people.people ?? []).filter((person) => personIds.includes(person.person_id));
  const relationships = (snapshot.relationships.relationships ?? []).filter((relationship) =>
    relationshipIds.includes(relationship.relationship_id)
  );

  return {
    schema_version: 'storage_event_query_result.v1',
    criteria,
    counts: {
      raw_events: rawEvents.length,
      semantic_events: semanticEvents.length,
      people: people.length,
      relationships: relationships.length
    },
    raw_events: rawEvents,
    semantic_events: semanticEvents,
    people,
    relationships
  };
}

function check({ check_id, label, passed, severity = 'required', evidence = [], fix = null }) {
  return {
    check_id,
    label,
    severity,
    status: passed ? 'pass' : 'fail',
    passed: Boolean(passed),
    evidence: evidence.filter((item) => item !== undefined && item !== null && item !== ''),
    fix
  };
}

function indexContains(index, key, field, eventId) {
  return (index.entries?.[key]?.[field] ?? []).includes(eventId);
}

export function auditChatStorageCompleteness(storage, {
  expected_raw_event_ids = null,
  expected_semantic_event_ids = null
} = {}) {
  const snapshot = loadStorageSnapshot(storage);
  const rawEvents = expected_raw_event_ids
    ? snapshot.raw_events.filter((event) => expected_raw_event_ids.includes(event.event_id))
    : snapshot.raw_events;
  const semanticEvents = expected_semantic_event_ids
    ? snapshot.semantic_events.filter((event) => expected_semantic_event_ids.includes(event.event_id))
    : snapshot.semantic_events;
  const rawIds = new Set(snapshot.raw_events.map((event) => event.event_id));
  const peopleIds = new Set((snapshot.people.people ?? []).map((person) => person.person_id));
  const relationshipIds = new Set((snapshot.relationships.relationships ?? []).map((relationship) => relationship.relationship_id));
  const semanticByRawId = new Map();
  for (const semanticEvent of snapshot.semantic_events) {
    for (const rawEventId of semanticEvent.raw_event_ids ?? []) {
      semanticByRawId.set(rawEventId, [...(semanticByRawId.get(rawEventId) ?? []), semanticEvent]);
    }
  }

  const missingSemanticCoverage = rawEvents
    .filter((rawEvent) => !(semanticByRawId.get(rawEvent.event_id) ?? []).length)
    .map((rawEvent) => rawEvent.event_id);
  const orphanSemanticIds = semanticEvents
    .filter((semanticEvent) => !(semanticEvent.raw_event_ids ?? []).every((rawEventId) => rawIds.has(rawEventId)))
    .map((semanticEvent) => semanticEvent.event_id);
  const unknownPersonLinks = unique([
    ...rawEvents.flatMap((event) => event.linked_person_ids ?? []),
    ...semanticEvents.flatMap((event) => event.linked_person_ids ?? [])
  ].filter((personId) => !peopleIds.has(personId)));
  const unknownRelationshipLinks = unique([
    ...rawEvents.flatMap((event) => event.linked_relationship_ids ?? []),
    ...semanticEvents.flatMap((event) => event.linked_relationship_ids ?? [])
  ].filter((relationshipId) => !relationshipIds.has(relationshipId)));
  const missingKeyFactCoverage = [];
  for (const rawEvent of rawEvents) {
    const expectedTypes = expectedSemanticTypesForRawEvent(rawEvent);
    const actualTypes = new Set((semanticByRawId.get(rawEvent.event_id) ?? []).map((event) => event.event_type_code));
    const missing = expectedTypes.filter((eventType) => !actualTypes.has(eventType));
    if (missing.length) {
      missingKeyFactCoverage.push({ raw_event_id: rawEvent.event_id, missing_event_type_codes: missing });
    }
  }
  const missingPersonIndex = [];
  for (const rawEvent of rawEvents) {
    for (const personId of unique([...(rawEvent.participants ?? []), ...(rawEvent.linked_person_ids ?? [])])) {
      if (!indexContains(snapshot.indexes.person_event, personId, 'raw_event_ids', rawEvent.event_id)) {
        missingPersonIndex.push(`${personId}:${rawEvent.event_id}:raw`);
      }
    }
  }
  for (const semanticEvent of semanticEvents) {
    for (const personId of semanticEvent.linked_person_ids ?? []) {
      if (!indexContains(snapshot.indexes.person_event, personId, 'semantic_event_ids', semanticEvent.event_id)) {
        missingPersonIndex.push(`${personId}:${semanticEvent.event_id}:semantic`);
      }
    }
  }
  const missingRelationshipIndex = [];
  for (const rawEvent of rawEvents) {
    for (const relationshipId of rawEvent.linked_relationship_ids ?? []) {
      if (!indexContains(snapshot.indexes.relationship_event, relationshipId, 'raw_event_ids', rawEvent.event_id)) {
        missingRelationshipIndex.push(`${relationshipId}:${rawEvent.event_id}:raw`);
      }
    }
  }
  for (const semanticEvent of semanticEvents) {
    for (const relationshipId of semanticEvent.linked_relationship_ids ?? []) {
      if (!indexContains(snapshot.indexes.relationship_event, relationshipId, 'semantic_event_ids', semanticEvent.event_id)) {
        missingRelationshipIndex.push(`${relationshipId}:${semanticEvent.event_id}:semantic`);
      }
    }
  }
  const missingTagIndex = [];
  for (const semanticEvent of semanticEvents) {
    for (const tag of semanticEvent.tags ?? []) {
      if (!indexContains(snapshot.indexes.tag_event, tag, 'semantic_event_ids', semanticEvent.event_id)) {
        missingTagIndex.push(`${tag}:${semanticEvent.event_id}`);
      }
    }
  }

  const checks = [
    check({
      check_id: 'raw_events_present',
      label: 'Raw chat events are stored',
      passed: rawEvents.length > 0,
      evidence: [`raw_events=${rawEvents.length}`],
      fix: 'Append at least one RawEvent before running the audit.'
    }),
    check({
      check_id: 'semantic_events_present',
      label: 'Semantic events are stored separately',
      passed: semanticEvents.length > 0,
      evidence: [`semantic_events=${semanticEvents.length}`],
      fix: 'Run semantic extraction and append SemanticEvent records.'
    }),
    check({
      check_id: 'semantic_coverage_per_raw_event',
      label: 'Each raw chat event has semantic coverage',
      passed: missingSemanticCoverage.length === 0,
      evidence: [`missing=${missingSemanticCoverage.join(',') || 'none'}`],
      fix: 'Generate at least one SemanticEvent for every stored RawEvent.'
    }),
    check({
      check_id: 'semantic_raw_links_resolve',
      label: 'SemanticEvent.raw_event_ids resolve to stored RawEvent records',
      passed: orphanSemanticIds.length === 0,
      evidence: [`orphans=${orphanSemanticIds.join(',') || 'none'}`],
      fix: 'Reject or repair SemanticEvent records whose raw_event_ids are missing.'
    }),
    check({
      check_id: 'person_links_resolve',
      label: 'Person links resolve to the relationship graph people store',
      passed: unknownPersonLinks.length === 0,
      evidence: [`unknown_person_ids=${unknownPersonLinks.join(',') || 'none'}`],
      fix: 'Upsert people before storing chat events or keep unresolved identities out of linked_person_ids.'
    }),
    check({
      check_id: 'relationship_links_resolve',
      label: 'Relationship links resolve to the relationship graph edge store',
      passed: unknownRelationshipLinks.length === 0,
      evidence: [`unknown_relationship_ids=${unknownRelationshipLinks.join(',') || 'none'}`],
      fix: 'Upsert relationship edges before storing chat events.'
    }),
    check({
      check_id: 'key_fact_semantic_coverage',
      label: 'Key facts in chat text are covered by expected semantic event types',
      passed: missingKeyFactCoverage.length === 0,
      evidence: [`missing=${JSON.stringify(missingKeyFactCoverage)}`],
      fix: 'Add semantic rules or semantic hints for uncovered key facts.'
    }),
    check({
      check_id: 'person_index_rebuild_consistent',
      label: 'Person-event index contains stored raw and semantic links',
      passed: missingPersonIndex.length === 0,
      evidence: [`missing=${missingPersonIndex.join(',') || 'none'}`],
      fix: 'Run rebuildEventIndexes after chat storage writes.'
    }),
    check({
      check_id: 'relationship_index_rebuild_consistent',
      label: 'Relationship-event index contains stored raw and semantic links',
      passed: missingRelationshipIndex.length === 0,
      evidence: [`missing=${missingRelationshipIndex.join(',') || 'none'}`],
      fix: 'Run rebuildEventIndexes after chat storage writes.'
    }),
    check({
      check_id: 'tag_index_rebuild_consistent',
      label: 'Tag-event index contains semantic tags',
      passed: missingTagIndex.length === 0,
      evidence: [`missing=${missingTagIndex.join(',') || 'none'}`],
      fix: 'Run rebuildEventIndexes after semantic event writes.'
    })
  ];
  const requiredFailures = checks.filter((item) => item.severity === 'required' && !item.passed);
  return {
    schema_version: 'chat_storage_test_report.v1',
    report_id: `chat_storage_audit_${Date.now()}`,
    created_at: nowIso(),
    gate_decision: requiredFailures.length ? 'chat_storage_needs_fix' : 'chat_storage_ready',
    metrics: {
      people_count: (snapshot.people.people ?? []).length,
      relationship_count: (snapshot.relationships.relationships ?? []).length,
      raw_event_count: rawEvents.length,
      semantic_event_count: semanticEvents.length,
      semantic_coverage: rawEvents.length
        ? Number(((rawEvents.length - missingSemanticCoverage.length) / rawEvents.length).toFixed(4))
        : 0,
      key_fact_coverage: rawEvents.length
        ? Number(((rawEvents.length - missingKeyFactCoverage.length) / rawEvents.length).toFixed(4))
        : 0
    },
    checks,
    required_failures: requiredFailures.map((item) => item.check_id)
  };
}

export function storeChatEventsWithSeparation(storage, {
  people = [],
  relationships = [],
  raw_events = null,
  rawEvents = null,
  semantic_events = null,
  semanticEvents = null,
  actor = 'chat-storage-pipeline',
  rebuildIndexesAfterWrite = true
} = {}) {
  const incomingRawEvents = raw_events ?? rawEvents ?? [];
  const incomingSemanticEvents = semantic_events ?? semanticEvents ?? [];
  if (!Array.isArray(incomingRawEvents)) throw new Error('storeChatEventsWithSeparation.raw_events must be an array');
  if (!Array.isArray(incomingSemanticEvents)) throw new Error('storeChatEventsWithSeparation.semantic_events must be an array');
  if (people.length) upsertPeople(storage, people, { actor });
  if (relationships.length) upsertRelationships(storage, relationships, { actor });

  const snapshotBefore = loadStorageSnapshot(storage);
  const knownRawIds = new Set(snapshotBefore.raw_events.map((event) => event.event_id));
  const knownSemanticIds = new Set(snapshotBefore.semantic_events.map((event) => event.event_id));
  const relationshipGraph = loadStorageSnapshot(storage).relationships.relationships ?? [];
  const storedRawEvents = [];
  const skippedRawEventIds = [];
  for (const rawEvent of incomingRawEvents) {
    if (knownRawIds.has(rawEvent.event_id)) {
      skippedRawEventIds.push(rawEvent.event_id);
      continue;
    }
    const text = textForEvent(rawEvent);
    const enriched = {
      ...rawEvent,
      linked_relationship_ids: inferRelationshipIds(rawEvent, relationshipGraph),
      metadata: {
        ...(rawEvent.metadata ?? {}),
        key_facts: extractChatKeyFacts(text),
        storage_pipeline: 'chat_storage_separation.v1'
      }
    };
    const stored = appendRawEvent(storage, enriched, { actor });
    knownRawIds.add(stored.event_id);
    storedRawEvents.push(stored);
  }

  const generatedSemanticEvents = extractSemanticEventsFromRawEvents(storedRawEvents, {
    relationships: relationshipGraph
  });
  const semanticToAppend = [...incomingSemanticEvents, ...generatedSemanticEvents];
  const storedSemanticEvents = [];
  const skippedSemanticEventIds = [];
  for (const semanticEvent of semanticToAppend) {
    if (knownSemanticIds.has(semanticEvent.event_id)) {
      skippedSemanticEventIds.push(semanticEvent.event_id);
      continue;
    }
    const stored = appendSemanticEvent(storage, semanticEvent, { actor });
    knownSemanticIds.add(stored.event_id);
    storedSemanticEvents.push(stored);
  }

  const indexes = rebuildIndexesAfterWrite ? rebuildEventIndexes(storage, { actor }) : null;
  const audit = auditChatStorageCompleteness(storage, {
    expected_raw_event_ids: storedRawEvents.map((event) => event.event_id),
    expected_semantic_event_ids: storedSemanticEvents.map((event) => event.event_id)
  });
  writeAudit(storage, {
    action: 'store_chat_events_with_separation',
    entity_type: 'chat_storage_batch',
    entity_id: `chat_storage_batch_${Date.now()}`,
    actor,
    result: audit.gate_decision,
    source_file: storage.dataDir,
    metadata: {
      raw_events: storedRawEvents.length,
      semantic_events: storedSemanticEvents.length,
      skipped_raw_events: skippedRawEventIds.length,
      skipped_semantic_events: skippedSemanticEventIds.length,
      required_failures: audit.required_failures
    }
  });

  return {
    schema_version: 'chat_storage_write_result.v1',
    gate_decision: audit.gate_decision === 'chat_storage_ready'
      ? 'chat_storage_write_ready'
      : 'chat_storage_write_needs_fix',
    stored_raw_event_ids: storedRawEvents.map((event) => event.event_id),
    stored_semantic_event_ids: storedSemanticEvents.map((event) => event.event_id),
    skipped_raw_event_ids: skippedRawEventIds,
    skipped_semantic_event_ids: skippedSemanticEventIds,
    indexes_rebuilt: Boolean(indexes),
    audit,
    readback: queryStoredEvents(storage, {
      raw_event_ids: storedRawEvents.map((event) => event.event_id)
    })
  };
}

export function renderChatStorageTestReportMarkdown(report) {
  const lines = [
    '# Chat Storage Functional Test Report',
    '',
    `- report_id: ${report.report_id}`,
    `- gate_decision: ${report.gate_decision}`,
    `- required_failures: ${report.required_failures?.join(', ') || 'none'}`,
    '',
    '## Metrics',
    '',
    `- people_count: ${report.metrics?.people_count ?? 0}`,
    `- relationship_count: ${report.metrics?.relationship_count ?? 0}`,
    `- raw_event_count: ${report.metrics?.raw_event_count ?? 0}`,
    `- semantic_event_count: ${report.metrics?.semantic_event_count ?? 0}`,
    `- semantic_coverage: ${report.metrics?.semantic_coverage ?? 0}`,
    `- key_fact_coverage: ${report.metrics?.key_fact_coverage ?? 0}`,
    '',
    '## Checks',
    ''
  ];
  for (const item of report.checks ?? []) {
    lines.push(`- ${item.status.toUpperCase()} ${item.check_id}: ${item.label}`);
    if (item.evidence?.length) lines.push(`  evidence: ${item.evidence.join('; ')}`);
    if (!item.passed && item.fix) lines.push(`  fix: ${item.fix}`);
  }
  if (report.query_results) {
    lines.push('', '## Query Results', '');
    for (const query of report.query_results) {
      lines.push(`- ${query.query_id}: raw=${query.counts.raw_events}, semantic=${query.counts.semantic_events}, gate=${query.gate_decision}`);
    }
  }
  if (report.code_audit_checks) {
    lines.push('', '## Code Audit', '');
    for (const item of report.code_audit_checks) {
      lines.push(`- ${item.status.toUpperCase()} ${item.check_id}: ${item.label}`);
      if (item.evidence?.length) lines.push(`  evidence: ${item.evidence.join('; ')}`);
      if (!item.passed && item.fix) lines.push(`  fix: ${item.fix}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function writeChatStorageTestReport({ report, outputDir }) {
  const jsonPath = path.join(outputDir, 'chat-storage-test-report.json');
  const markdownPath = path.join(outputDir, 'chat-storage-test-report.md');
  writeJsonAtomic(jsonPath, report);
  ensureDir(path.dirname(markdownPath));
  writeFileSync(markdownPath, renderChatStorageTestReportMarkdown(report), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath
  };
}

export function loadStorageSnapshot(storage) {
  return {
    people: readJson(storage.paths.people),
    relationships: readJson(storage.paths.relationships),
    raw_events: readJsonl(storage.paths.rawEvents),
    semantic_events: readJsonl(storage.paths.semanticEvents),
    feedback_records: readJsonl(storage.paths.feedback),
    audit_records: readJsonl(storage.paths.audit),
    indexes: {
      person_event: readJson(storage.paths.personIndex),
      relationship_event: readJson(storage.paths.relationshipIndex),
      tag_event: readJson(storage.paths.tagIndex),
      time_event: readJson(storage.paths.timeIndex)
    }
  };
}
