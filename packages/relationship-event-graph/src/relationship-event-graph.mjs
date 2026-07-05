import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const PHASE_IDS = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'];
export const P10_SHADOW_PHASE_IDS = [...PHASE_IDS, 'P10'];

const REQUIRED_SCHEMAS = [
  'schemas/source-archive.schema.json',
  'schemas/source-episode.schema.json',
  'schemas/nested-event.schema.json',
  'schemas/summary-shard.schema.json',
  'schemas/weight-profile.schema.json',
  'schemas/learning-weight-shadow-report.schema.json',
  'schemas/learning-weight-promotion-confirmation.schema.json',
  'schemas/nebula-projection.schema.json',
  'schemas/nebula-visual-profile.schema.json',
  'schemas/confirmation-gate.schema.json',
  'schemas/relationship-event-graph-phase-run.schema.json'
];

const REQUIRED_FIXTURES = [
  'examples/source-archive.sample.json',
  'examples/source-episode.sample.json',
  'examples/nested-event.sample.json',
  'examples/summary-shard.sample.json',
  'examples/weight-profile.sample.json',
  'examples/learning-weight-shadow-report.sample.json',
  'examples/learning-weight-promotion-confirmation.sample.json',
  'examples/nebula-projection.sample.json',
  'examples/nebula-visual-profile.sample.json',
  'examples/confirmation-gate.sample.json',
  'examples/relationship-event-manual-note.sample.json'
];

const TAG_SIGNATURE_REQUIRED_DIMENSIONS = [
  'source',
  'modality',
  'domain',
  'scene',
  'event_family',
  'event',
  'intent',
  'actor',
  'actor_role',
  'target_object',
  'object_type',
  'time_bucket',
  'occurred_at_ref',
  'confirmation',
  'identity_status',
  'risk',
  'quality',
  'privacy',
  'retrieval',
  'evidence_ref',
  'raw_observation_ref',
  'semantic_unit_ref',
  'source_archive_ref',
  'relationship_write',
  'identity_merge',
  'external_action',
  'weight',
  'visual',
  'confidence_bucket',
  'polarity'
];

const TAG_SIGNATURE_MAX_TAGS = 40;
const EVIDENCE_SNIPPET_MAX_CHARS = 42;
const EVIDENCE_COMPRESSION_MAX_RATIO = 0.72;

function projectRoot() {
  return path.resolve(here, '../../..');
}

function nowIso() {
  return new Date().toISOString();
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function stableSlug(value) {
  return String(value ?? 'unknown')
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function datePart(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'unknown-date';
  return new Date(parsed).toISOString().slice(0, 10);
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

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, String(value ?? ''), 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function relative(root, filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))];
}

function tagDimension(tag) {
  const index = String(tag).indexOf(':');
  return index >= 0 ? String(tag).slice(0, index) : String(tag);
}

function getTag(tags, dimension) {
  const prefix = `${dimension}:`;
  return (tags ?? []).find((tag) => String(tag).startsWith(prefix))?.slice(prefix.length) ?? null;
}

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function makeCheck({
  check_id,
  label,
  passed,
  severity = 'required',
  evidence = [],
  fix = null
}) {
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

function requiredFailures(checks) {
  return checks
    .filter((check) => check.severity === 'required' && !check.passed)
    .map((check) => check.check_id);
}

function warningFailures(checks) {
  return checks
    .filter((check) => check.severity === 'warning' && !check.passed)
    .map((check) => check.check_id);
}

function assertSourceRecord(record) {
  const missing = [
    'source_id',
    'source_type',
    'platform',
    'captured_at',
    'content_text',
    'content_summary'
  ].filter((field) => record[field] === undefined || record[field] === null || record[field] === '');
  if (missing.length) {
    throw new Error(`SourceRecord missing required fields: ${missing.join(', ')}`);
  }
}

function normalizeInputRecord(record) {
  assertSourceRecord(record);
  return {
    adapter_id: record.adapter_id ?? record.source_adapter_id ?? `${record.source_type}.${record.platform}`,
    privacy_level: record.privacy_level ?? 'redacted_text',
    participants_hint: record.participants_hint ?? ['user', 'unknown_counterparty'],
    source_identity_hints: record.source_identity_hints ?? [],
    raw_artifact_refs: record.raw_artifact_refs ?? [],
    thread_hint: record.thread_hint ?? {},
    metadata: record.metadata ?? {},
    ...record
  };
}

function observationToRecord(observation) {
  return normalizeInputRecord({
    source_id: observation.observation_id,
    source_type: observation.source_type,
    platform: observation.platform,
    adapter_id: observation.source_adapter_id,
    captured_at: observation.captured_at,
    content_text: observation.content_text,
    content_summary: observation.content_summary,
    participants_hint: observation.participants_hint,
    source_identity_hints: observation.source_identity_hints,
    thread_hint: observation.thread_hint,
    raw_artifact_refs: observation.raw_artifact_refs,
    privacy_level: observation.privacy_level,
    metadata: observation.metadata ?? {}
  });
}

export function buildDefaultRelationshipEventGraphRecords({ root = projectRoot() } = {}) {
  const desktop = observationToRecord(readJson(path.join(root, 'examples/intake-observation.sightflow.sample.json')));
  const browser = observationToRecord(readJson(path.join(root, 'examples/intake-observation.browser.sample.json')));
  const manual = normalizeInputRecord(readJson(path.join(root, 'examples/relationship-event-manual-note.sample.json')));
  return [desktop, browser, manual];
}

function buildSourceArchive(record, {
  root,
  archiveRoot,
  createdAt
}) {
  const normalized = normalizeInputRecord(record);
  const sourceArchiveId = `source_archive_${stableSlug(normalized.source_id)}`;
  const archiveDir = path.join(
    archiveRoot,
    stableSlug(normalized.source_type),
    stableSlug(normalized.platform),
    datePart(normalized.captured_at),
    sourceArchiveId
  );
  const rawTextPath = path.join(archiveDir, 'raw.txt');
  const rawPayloadPath = path.join(archiveDir, 'raw.json');
  const manifestPath = path.join(archiveDir, 'manifest.json');
  const checksumsPath = path.join(archiveDir, 'checksums.json');
  const rawTextHash = `sha256:${sha256(normalized.content_text)}`;
  const rawPayload = {
    source_id: normalized.source_id,
    source_type: normalized.source_type,
    platform: normalized.platform,
    adapter_id: normalized.adapter_id,
    captured_at: normalized.captured_at,
    content_summary: normalized.content_summary,
    participants_hint: normalized.participants_hint,
    source_identity_hints: normalized.source_identity_hints,
    thread_hint: normalized.thread_hint,
    raw_artifact_refs: normalized.raw_artifact_refs,
    metadata: normalized.metadata
  };
  const payloadHash = `sha256:${sha256(JSON.stringify(rawPayload))}`;
  const artifactRefs = normalized.raw_artifact_refs.map((item) => String(item));
  const sourceThreadId = normalized.thread_hint.thread_key
    ?? normalized.thread_hint.conversation_id
    ?? normalized.thread_hint.url
    ?? normalized.thread_hint.record_id
    ?? normalized.thread_hint.thread_title
    ?? normalized.source_id;

  ensureDir(archiveDir);
  writeText(rawTextPath, normalized.content_text);
  writeJsonAtomic(rawPayloadPath, rawPayload);
  writeJsonAtomic(checksumsPath, {
    schema_version: 'source_archive_checksums.v1',
    source_archive_id: sourceArchiveId,
    content_hash: rawTextHash,
    raw_payload_hash: payloadHash,
    artifact_hashes: artifactRefs.map((ref) => ({
      artifact_ref: ref,
      hash_status: ref.startsWith('sha256:') ? 'provided_hash' : 'external_ref_not_hashed'
    }))
  });

  const archive = {
    schema_version: 'source_archive.v1',
    source_archive_id: sourceArchiveId,
    source_id: normalized.source_id,
    source_type: normalized.source_type,
    platform: normalized.platform,
    adapter_id: normalized.adapter_id,
    captured_at: normalized.captured_at,
    archived_at: createdAt,
    source_thread_id: String(sourceThreadId),
    raw_text_ref: relative(root, rawTextPath),
    raw_payload_ref: relative(root, rawPayloadPath),
    manifest_ref: relative(root, manifestPath),
    checksums_ref: relative(root, checksumsPath),
    artifact_refs: artifactRefs,
    content_hash: rawTextHash,
    privacy_level: normalized.privacy_level,
    delete_state: 'active',
    archive_dir: relative(root, archiveDir),
    metadata: {
      original_metadata: normalized.metadata,
      source_saved_file_only: true,
      real_execution_allowed: false,
      real_send_attempted: false
    }
  };
  writeJsonAtomic(manifestPath, archive);
  return { archive, record: normalized, paths: { archiveDir, rawTextPath, rawPayloadPath, manifestPath, checksumsPath } };
}

function buildSourceEpisode({ archive, record, createdAt }) {
  return {
    schema_version: 'source_episode.v1',
    episode_id: `source_episode_${stableSlug(archive.source_id)}`,
    source_archive_id: archive.source_archive_id,
    source_type: archive.source_type,
    platform: archive.platform,
    thread_id: archive.source_thread_id,
    captured_at: archive.captured_at,
    time_window: datePart(archive.captured_at),
    participants_hint: record.participants_hint,
    source_identity_hints: record.source_identity_hints,
    raw_event_ids: [`raw_event_${stableSlug(archive.source_id)}`],
    content_fingerprint: archive.content_hash,
    status: 'ready_for_raw_event_mapping',
    metadata: {
      created_at: createdAt,
      source_archive_ref: archive.manifest_ref
    }
  };
}

function buildRawEvent({ archive, episode, record, createdAt }) {
  const eventKind = archive.source_type === 'browser'
    ? 'web_observation'
    : archive.source_type === 'manual'
      ? 'manual_note'
      : 'raw_interaction';
  return {
    event_id: episode.raw_event_ids[0],
    event_kind: eventKind,
    source: `${archive.source_type}:${archive.adapter_id}:${archive.platform}`,
    source_ref: {
      source_archive_id: archive.source_archive_id,
      source_episode_id: episode.episode_id,
      source_type: archive.source_type,
      platform: archive.platform,
      content_hash: archive.content_hash,
      raw_text_ref: archive.raw_text_ref,
      raw_payload_ref: archive.raw_payload_ref
    },
    occurred_at: archive.captured_at,
    participants: record.participants_hint,
    content: record.content_text,
    content_summary: record.content_summary,
    linked_person_ids: [],
    linked_relationship_ids: [],
    evidence_refs: [archive.raw_text_ref, archive.checksums_ref],
    metadata: {
      source_archive_id: archive.source_archive_id,
      source_episode_id: episode.episode_id,
      participants_unconfirmed: true,
      relationship_state_write_allowed: false,
      created_from: 'relationship_event_graph_phase_run'
    },
    created_at: createdAt
  };
}

function modalityTagsForSourceType(sourceType) {
  return {
    desktop: ['text'],
    browser: ['html', 'text'],
    manual: ['text'],
    api: ['api'],
    file: ['file']
  }[sourceType] ?? ['text'];
}

function sceneForRawEvent(rawEvent, goalDomain) {
  if (goalDomain === 'romance_relationship_maintenance') return 'relationship_manual_note';
  if (rawEvent.source_ref.source_type === 'desktop') return 'wechat_group_or_dm';
  if (rawEvent.source_ref.source_type === 'browser') return 'web_portal_snapshot';
  if (rawEvent.source_ref.source_type === 'manual') return 'operator_note';
  return 'general_observation';
}

function qualityForRawEvent(rawEvent) {
  return {
    desktop: 'chat_text',
    browser: 'dom_text',
    manual: 'manual_note',
    api: 'api_status',
    file: 'file_text'
  }[rawEvent.source_ref.source_type] ?? 'text';
}

function confidenceBucket(confidence) {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.7) return 'medium';
  return 'low';
}

function timeBucket(occurredAt) {
  const day = datePart(occurredAt);
  return day === datePart(nowIso()) ? 'today' : 'history';
}

function goalDomainForRawEvent(rawEvent) {
  const text = `${rawEvent.source} ${rawEvent.content_summary} ${rawEvent.content}`.toLowerCase();
  if (/dating|romance|relationship|boyfriend|girlfriend|flirt|intimacy|low pressure|喜欢|恋爱|暧昧/.test(text)) {
    return 'romance_relationship_maintenance';
  }
  if (/manual/.test(rawEvent.event_kind) && /relationship|dating/.test(text)) {
    return 'romance_relationship_maintenance';
  }
  return 'sales_customer_progress';
}

function semanticTypeForRawEvent(rawEvent, goalDomain) {
  const text = `${rawEvent.content_summary} ${rawEvent.content}`.toLowerCase();
  if (goalDomain === 'romance_relationship_maintenance') {
    return {
      event_type_code: 'relationship_label_probe',
      event_level: 'P2',
      tags: ['goal_domain:romance_relationship_maintenance', 'event_type:relationship_label_probe', 'confirmation:required'],
      weight: 0.78,
      confidence: 0.72,
      requires_confirmation: true
    };
  }
  if (/security|whitelist|risk|compliance|安全|合规/.test(text)) {
    return {
      event_type_code: 'risk_or_requirement',
      event_level: 'P2',
      tags: ['goal_domain:sales_customer_progress', 'event_type:risk_or_requirement', 'risk:medium'],
      weight: 0.72,
      confidence: 0.7,
      requires_confirmation: false
    };
  }
  return {
    event_type_code: 'sales_progress_signal',
    event_level: 'P2',
    tags: ['goal_domain:sales_customer_progress', 'event_type:sales_progress_signal', 'sales_stage:review'],
    weight: 0.68,
    confidence: 0.68,
    requires_confirmation: false
  };
}

function nestedSignatureMeta({ definition, semanticEvent, rawEvent }) {
  const counterpart = rawEvent.participants?.[1] ?? 'counterparty_unknown';
  const user = rawEvent.participants?.[0] ?? 'user';
  const common = {
    actor: counterpart,
    actor_role: 'customer_contact',
    identity_status: rawEvent.source_ref.source_type === 'browser' ? 'system_observed' : 'candidate',
    event_family: semanticEvent.metadata.goal_domain === 'romance_relationship_maintenance'
      ? 'relationship_maintenance'
      : 'sales_progress',
    intent: getTag(definition.tags, 'intent') ?? getTag(definition.tags, 'event_type') ?? 'observe',
    target_object: definition.event_type_code,
    object_type: 'event_signal',
    polarity: definition.requires_confirmation ? 'requires_confirmation' : 'observed',
    risk: getTag(definition.tags, 'risk') ?? (definition.requires_confirmation ? 'high' : 'medium')
  };
  const byType = {
    relationship_label_probe: {
      actor: counterpart,
      actor_role: 'romantic_target',
      event_family: 'relationship_state_signal',
      intent: 'relationship_label_probe',
      target_object: 'relationship_label',
      object_type: 'relationship_state_signal',
      polarity: 'question_probe',
      risk: 'high',
      identity_status: 'candidate'
    },
    low_pressure_boundary_signal: {
      actor: user,
      actor_role: 'user',
      event_family: 'relationship_boundary',
      intent: 'low_pressure_reply',
      target_object: 'reply_boundary',
      object_type: 'communication_boundary',
      polarity: 'boundary_plan',
      risk: 'medium',
      identity_status: 'self'
    },
    budget_confirmation_pending: {
      actor: counterpart,
      actor_role: 'customer_contact',
      event_family: 'budget_status',
      intent: 'budget_confirmation',
      target_object: 'budget_confirmation',
      object_type: 'budget_status',
      polarity: 'pending',
      risk: 'medium'
    },
    technical_review_window: {
      actor: counterpart,
      actor_role: 'customer_contact',
      event_family: 'technical_review',
      intent: 'technical_review_window',
      target_object: 'technical_review_window',
      object_type: 'review_schedule',
      polarity: 'available',
      risk: 'medium'
    },
    risk_or_requirement: {
      actor: counterpart,
      actor_role: 'portal_system',
      event_family: 'technical_requirement',
      intent: 'requirement_request',
      target_object: 'security_whitelist_evidence',
      object_type: 'technical_requirement',
      polarity: 'request',
      risk: 'medium',
      identity_status: 'system_observed'
    },
    sales_progress_signal: {
      actor: counterpart,
      actor_role: 'customer_contact',
      event_family: 'sales_progress',
      intent: 'review_progress',
      target_object: 'customer_review',
      object_type: 'sales_stage',
      polarity: 'pending_review',
      risk: 'medium'
    }
  };
  return {
    ...common,
    ...(byType[definition.event_type_code] ?? {})
  };
}

function tagSignatureTagsForNestedEvent({ definition, semanticEvent, rawEvent, nestedEventId }) {
  const meta = nestedSignatureMeta({ definition, semanticEvent, rawEvent });
  const sourceTag = `${rawEvent.source_ref.source_type}_${rawEvent.source_ref.platform}`;
  const confirmation = definition.requires_confirmation ? 'requires_confirmation' : 'observed_candidate';
  return unique([
    `source:${sourceTag}`,
    ...modalityTagsForSourceType(rawEvent.source_ref.source_type).map((item) => `modality:${item}`),
    `domain:${definition.goal_domain}`,
    `scene:${sceneForRawEvent(rawEvent, definition.goal_domain)}`,
    `event_family:${meta.event_family}`,
    `event:${definition.event_type_code}`,
    `intent:${meta.intent}`,
    `actor:${stableSlug(meta.actor)}`,
    `actor_role:${meta.actor_role}`,
    `target_object:${meta.target_object}`,
    `object_type:${meta.object_type}`,
    `time_bucket:${timeBucket(definition.occurred_at)}`,
    `occurred_at_ref:${nestedEventId}.occurred_at`,
    `confirmation:${confirmation}`,
    `identity_status:${meta.identity_status}`,
    `risk:${meta.risk}`,
    `quality:${qualityForRawEvent(rawEvent)}`,
    'privacy:private',
    'retrieval:event',
    'retrieval:evidence',
    `evidence_ref:${rawEvent.evidence_refs[0]}`,
    `raw_observation_ref:${definition.raw_event_id}`,
    `semantic_unit_ref:${nestedEventId}`,
    `source_archive_ref:${definition.source_archive_id}`,
    'relationship_write:blocked',
    'identity_merge:blocked',
    'external_action:blocked',
    'weight:pending_rule_profile',
    `visual:${definition.requires_confirmation ? 'requires_confirmation' : 'normal'}`,
    `confidence_bucket:${confidenceBucket(semanticEvent.confidence)}`,
    `polarity:${meta.polarity}`
  ]);
}

function sourceBackedSnippets(sourceText, preferredSnippets) {
  const source = String(sourceText ?? '');
  const matched = preferredSnippets.filter((snippet) => source.includes(snippet));
  if (matched.length) return matched;
  const firstClause = source
    .split(/[。；;,.，\n]/)
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  if (!firstClause) return [];
  const maxLength = Math.max(1, Math.min(EVIDENCE_SNIPPET_MAX_CHARS, Math.floor([...source].length * 0.5)));
  return [firstClause.length <= maxLength ? firstClause : [...firstClause].slice(0, maxLength).join('')];
}

function buildSemanticEvent(rawEvent, { createdAt }) {
  const goalDomain = goalDomainForRawEvent(rawEvent);
  const rule = semanticTypeForRawEvent(rawEvent, goalDomain);
  return {
    event_id: `semantic_event_${stableSlug(rawEvent.event_id)}`,
    raw_event_ids: [rawEvent.event_id],
    event_type_code: rule.event_type_code,
    event_level: rule.event_level,
    status: 'candidate',
    tags: unique([
      ...rule.tags,
      `source:${rawEvent.source_ref.source_type}`,
      `platform:${rawEvent.source_ref.platform}`
    ]),
    weight: rule.weight,
    confidence: rule.confidence,
    evidence: [rawEvent.content_summary],
    linked_person_ids: [],
    linked_relationship_ids: [],
    occurred_at: rawEvent.occurred_at,
    requires_confirmation: rule.requires_confirmation,
    metadata: {
      goal_domain: goalDomain,
      source_archive_id: rawEvent.source_ref.source_archive_id,
      source_episode_id: rawEvent.source_ref.source_episode_id,
      relationship_state_write_allowed: false
    },
    created_at: createdAt
  };
}

function nestedDefinitionsForSemanticEvent(semanticEvent, rawEvent) {
  const base = {
    source_archive_id: rawEvent.source_ref.source_archive_id,
    raw_event_id: rawEvent.event_id,
    parent_event_id: semanticEvent.event_id,
    occurred_at: rawEvent.occurred_at,
    participants_hint: rawEvent.participants,
    evidence_refs: rawEvent.evidence_refs,
    goal_domain: semanticEvent.metadata.goal_domain
  };
  if (semanticEvent.metadata.goal_domain === 'romance_relationship_maintenance') {
    return [
      {
        ...base,
        event_type_code: 'relationship_label_probe',
        tags: ['goal_domain:romance_relationship_maintenance', 'event_type:relationship_label_probe', 'confirmation:required'],
        evidence_text: rawEvent.content,
        evidence_snippets: sourceBackedSnippets(rawEvent.content, ['are we dating now?', 'relationship label probe']),
        requires_confirmation: true
      },
      {
        ...base,
        event_type_code: 'low_pressure_boundary_signal',
        tags: ['goal_domain:romance_relationship_maintenance', 'event_type:boundary_signal', 'intent:low_pressure'],
        evidence_text: rawEvent.content,
        evidence_snippets: sourceBackedSnippets(rawEvent.content, ['low-pressure reply', 'confirmed relationship', 'low-pressure']),
        requires_confirmation: false
      }
    ];
  }
  if (rawEvent.source_ref.source_type === 'desktop') {
    return [
      {
        ...base,
        event_type_code: 'budget_confirmation_pending',
        tags: ['goal_domain:sales_customer_progress', 'event_type:budget_confirmation', 'sales_stage:review'],
        evidence_text: rawEvent.content,
        evidence_snippets: sourceBackedSnippets(rawEvent.content, [
          'budget is still',
          'internal confirmation',
          '预算这周还在内部确认',
          '预算仍在内部确认'
        ]),
        requires_confirmation: false
      },
      {
        ...base,
        event_type_code: 'technical_review_window',
        tags: ['goal_domain:sales_customer_progress', 'event_type:review_window', 'follow_up:materials'],
        evidence_text: rawEvent.content,
        evidence_snippets: sourceBackedSnippets(rawEvent.content, [
          'technical review is available tomorrow',
          '技术负责人明天下午有空',
          '可以先看接口清单'
        ]),
        requires_confirmation: false
      }
    ];
  }
  if (semanticEvent.event_type_code === 'risk_or_requirement') {
    return [
      {
        ...base,
        event_type_code: 'risk_or_requirement',
        tags: ['goal_domain:sales_customer_progress', 'event_type:risk_or_requirement', 'risk:medium'],
        evidence_text: rawEvent.content,
        evidence_snippets: sourceBackedSnippets(rawEvent.content, [
          'security whitelist evidence',
          '安全白名单',
          '待客户确认'
        ]),
        requires_confirmation: false
      }
    ];
  }
  return [
    {
      ...base,
      event_type_code: semanticEvent.event_type_code,
      tags: semanticEvent.tags,
      evidence_text: rawEvent.content,
      evidence_snippets: [rawEvent.content.slice(0, Math.min(24, rawEvent.content.length))],
      requires_confirmation: semanticEvent.requires_confirmation
    }
  ];
}

function buildNestedEvents(semanticEvent, rawEvent, { createdAt }) {
  return nestedDefinitionsForSemanticEvent(semanticEvent, rawEvent).map((definition, index) => {
    const nestedEventId = `nested_event_${stableSlug(semanticEvent.event_id)}_${index + 1}`;
    const signatureTags = tagSignatureTagsForNestedEvent({
      definition,
      semanticEvent,
      rawEvent,
      nestedEventId
    });
    return {
      schema_version: 'nested_event.v1',
      nested_event_id: nestedEventId,
      parent_event_id: definition.parent_event_id,
      raw_event_id: definition.raw_event_id,
      source_archive_id: definition.source_archive_id,
      event_type_code: definition.event_type_code,
      goal_domain: definition.goal_domain,
      occurred_at: definition.occurred_at,
      participants_hint: definition.participants_hint,
      tags: unique([...definition.tags, ...signatureTags]),
      evidence_refs: definition.evidence_refs,
      evidence_text: definition.evidence_text,
      requires_confirmation: Boolean(definition.requires_confirmation),
      confirmation_gate_id: null,
      metadata: {
        semantic_granularity: 'semantic_sub_event',
        sentence_split: false,
        relationship_state_write_allowed: false,
        identity_merge_allowed: false,
        real_external_action_allowed: false,
        tag_signature_gate_required: true,
        evidence_snippets: definition.evidence_snippets ?? []
      },
      created_at: createdAt
    };
  });
}

function buildConfirmationGate({ subjectRef, gateType, proposedChange, evidenceRefs, createdAt }) {
  return {
    schema_version: 'confirmation_gate.v1',
    gate_id: `confirmation_gate_${stableSlug(gateType)}_${stableSlug(subjectRef)}`,
    gate_type: gateType,
    subject_ref: subjectRef,
    proposed_change: proposedChange,
    evidence_refs: evidenceRefs,
    verification_refs: [],
    required_confirmations: ['multi_verification_passed', 'user_final_confirmation'],
    status: 'blocked_pending_user_confirmation',
    allowed_operations: [],
    created_at: createdAt,
    expires_at: null,
    decided_by: null,
    decision: null,
    apply_once_token: null,
    audit_refs: []
  };
}

function buildConfirmationGates(nestedEvents, { createdAt }) {
  const gates = nestedEvents
    .filter((event) => event.requires_confirmation)
    .map((event) => buildConfirmationGate({
      subjectRef: event.nested_event_id,
      gateType: event.event_type_code === 'relationship_label_probe'
        ? 'relationship_state_write'
        : 'event_confirmation',
      proposedChange: {
        action: 'review_candidate_only',
        relationship_state_write_allowed: false,
        candidate_event_type_code: event.event_type_code
      },
      evidenceRefs: event.evidence_refs,
      createdAt
    }));
  const bySubject = new Map(gates.map((gate) => [gate.subject_ref, gate]));
  for (const event of nestedEvents) {
    event.confirmation_gate_id = bySubject.get(event.nested_event_id)?.gate_id ?? null;
  }
  return gates;
}

function sourceReliability(sourceType) {
  return {
    desktop: 0.78,
    browser: 0.72,
    manual: 0.68,
    api: 0.74,
    file: 0.66
  }[sourceType] ?? 0.6;
}

function weightLevel(visualWeight, confirmationNeed) {
  if (confirmationNeed >= 0.85) return 'V5';
  if (visualWeight >= 0.8) return 'V4';
  if (visualWeight >= 0.62) return 'V3';
  if (visualWeight >= 0.45) return 'V2';
  if (visualWeight >= 0.25) return 'V1';
  return 'V0';
}

function buildWeightProfileForEvent(event, sourceArchive, { createdAt }) {
  const isNested = Boolean(event.nested_event_id);
  const goalRelevance = event.goal_domain === 'romance_relationship_maintenance' ? 0.78 : 0.72;
  const confirmationNeed = event.requires_confirmation ? 0.92 : 0.2;
  const source = sourceReliability(sourceArchive.source_type);
  const evidenceStrength = event.evidence_refs?.length ? 0.82 : 0.55;
  const eventImpact = event.event_type_code.includes('risk') ? 0.76 : event.requires_confirmation ? 0.82 : 0.66;
  const relationshipImpact = event.goal_domain === 'romance_relationship_maintenance' ? 0.76 : 0.46;
  const riskPriority = event.event_type_code.includes('risk') ? 0.7 : event.requires_confirmation ? 0.62 : 0.25;
  const recency = 0.75;
  const intrinsicWeight = clamp((source * 0.2) + (evidenceStrength * 0.3) + (eventImpact * 0.3) + (relationshipImpact * 0.2));
  const contextualWeight = clamp((goalRelevance * 0.42) + (eventImpact * 0.25) + (relationshipImpact * 0.18) + (riskPriority * 0.15));
  const visualWeight = clamp((intrinsicWeight * 0.35) + (contextualWeight * 0.45) + (confirmationNeed * 0.2));
  const level = weightLevel(visualWeight, confirmationNeed);
  const eventId = event.nested_event_id ?? event.event_id;
  return {
    schema_version: 'weight_profile.v1',
    weight_profile_id: `weight_profile_${stableSlug(eventId)}`,
    subject_ref: eventId,
    subject_type: isNested ? 'nested_event' : 'semantic_event',
    rule_version: 'relationship_event_graph_rules.v1',
    intrinsic_weight: Number(intrinsicWeight.toFixed(4)),
    contextual_weight: Number(contextualWeight.toFixed(4)),
    visual_weight: Number(visualWeight.toFixed(4)),
    weight_level: level,
    evidence_strength: evidenceStrength,
    source_reliability: source,
    event_impact: eventImpact,
    goal_relevance: goalRelevance,
    relationship_impact: relationshipImpact,
    risk_priority: riskPriority,
    recency,
    confirmation_need: confirmationNeed,
    calculation_basis: [
      `source_reliability=${source}`,
      `evidence_strength=${evidenceStrength}`,
      `event_impact=${eventImpact}`,
      `goal_relevance=${goalRelevance}`,
      `relationship_impact=${relationshipImpact}`,
      `confirmation_need=${confirmationNeed}`,
      `level=${level}`
    ],
    writes_fact_state: false,
    created_at: createdAt
  };
}

function round4(value) {
  return Number(Number(value).toFixed(4));
}

function boundedShadowDelta(profile) {
  const sourceAdjustment = profile.source_reliability < 0.7 ? -0.015 : 0.01;
  const confirmationAdjustment = profile.confirmation_need >= 0.85 ? -0.03 : 0;
  const goalAdjustment = profile.goal_relevance >= 0.75 ? 0.0125 : 0;
  const riskAdjustment = profile.risk_priority >= 0.65 ? 0.0125 : 0;
  return round4(Math.max(-0.05, Math.min(0.05,
    sourceAdjustment + confirmationAdjustment + goalAdjustment + riskAdjustment
  )));
}

function buildLearningWeightShadowReport({
  runId,
  semanticEvents,
  nestedEvents,
  weightProfiles,
  confirmationGates,
  createdAt
}) {
  const shadowReportId = `learning_weight_shadow_report_${runId}`;
  const semanticById = new Map(semanticEvents.map((event) => [event.event_id, event]));
  const nestedById = new Map(nestedEvents.map((event) => [event.nested_event_id, event]));
  const comparison = weightProfiles.map((profile) => {
    const event = nestedById.get(profile.subject_ref) ?? semanticById.get(profile.subject_ref);
    const delta = boundedShadowDelta(profile);
    const shadowVisualWeight = round4(clamp(profile.visual_weight + delta));
    const shadowLevel = weightLevel(shadowVisualWeight, profile.confirmation_need);
    const absDelta = Math.abs(delta);
    return {
      subject_ref: profile.subject_ref,
      subject_type: profile.subject_type,
      rule_weight_profile_id: profile.weight_profile_id,
      rule_version: profile.rule_version,
      rule_visual_weight: profile.visual_weight,
      rule_weight_level: profile.weight_level,
      shadow_visual_weight: shadowVisualWeight,
      shadow_weight_level: shadowLevel,
      shadow_delta: delta,
      delta_band: absDelta >= 0.04 ? 'review' : absDelta >= 0.02 ? 'observe' : 'stable',
      reason_codes: [
        profile.source_reliability < 0.7 ? 'source_reliability_below_shadow_threshold' : 'source_reliability_stable',
        profile.confirmation_need >= 0.85 ? 'confirmation_required_shadow_demotion' : 'no_confirmation_demotion',
        profile.goal_relevance >= 0.75 ? 'goal_relevance_support' : 'goal_relevance_neutral',
        profile.risk_priority >= 0.65 ? 'risk_priority_support' : 'risk_priority_neutral'
      ],
      source_refs: unique(event?.evidence_refs ?? []),
      applied_to_weight_profile: false,
      allowed_effect: 'report_only'
    };
  });
  const highDeltaItems = comparison.filter((item) => ['observe', 'review'].includes(item.delta_band));
  const promotionGate = buildConfirmationGate({
    subjectRef: shadowReportId,
    gateType: 'learning_weight_promotion',
    proposedChange: {
      action: 'promote_learning_weight_from_shadow_to_limited_trial',
      current_scope: 'shadow_report_only',
      allowed_scope_after_approval: 'limited_trial_only',
      weight_profile_mutation_allowed: false,
      relationship_state_write_allowed: false,
      identity_merge_allowed: false,
      external_action_allowed: false
    },
    evidenceRefs: unique(comparison.flatMap((item) => item.source_refs)),
    createdAt
  });
  return {
    schema_version: 'learning_weight_shadow_report.v1',
    shadow_report_id: shadowReportId,
    source_phase_run_id: runId,
    created_at: createdAt,
    mode: 'shadow_only',
    status: 'shadow_ready_pending_learning_weight_promotion_confirmation',
    baseline_rule_version: 'relationship_event_graph_rules.v1',
    shadow_model: {
      model_id: 'relationship_event_learning_weight_shadow.v0',
      training_enabled: false,
      writeback_enabled: false,
      promotion_enabled: false,
      training_data_status: 'insufficient_real_feedback_for_promotion',
      calculation_mode: 'deterministic_shadow_replay'
    },
    input_refs: {
      rule_weight_profile_ids: weightProfiles.map((profile) => profile.weight_profile_id),
      pending_confirmation_gate_ids: confirmationGates.map((gate) => gate.gate_id),
      user_feedback_refs: [],
      replay_eval_refs: []
    },
    comparison,
    aggregate: {
      subject_count: comparison.length,
      max_abs_delta: round4(Math.max(0, ...comparison.map((item) => Math.abs(item.shadow_delta)))),
      changed_level_count: comparison.filter((item) => item.rule_weight_level !== item.shadow_weight_level).length,
      high_delta_count: highDeltaItems.length,
      review_subject_refs: highDeltaItems.map((item) => item.subject_ref)
    },
    read_only_consumers: {
      context_snapshot_uses_shadow: false,
      nebula_projection_uses_shadow: false,
      weight_profile_mutation_allowed: false
    },
    rollback_plan: {
      default_authority: 'rule_weight_profile',
      rollback_mode: 'ignore_or_delete_shadow_report',
      recovery_command: 'npm.cmd run relationship-event:phases',
      blocked_outputs: [
        'WeightProfile mutation',
        'ContextSnapshot selection changes',
        'NebulaProjection visual weight changes',
        'RelationshipState writes',
        'identity merge writes',
        'external actions'
      ]
    },
    promotion_confirmation_gate: promotionGate,
    writes_fact_state: false,
    allowed_effects: ['report_only', 'manual_review_prompt'],
    forbidden_effects: [
      'modify_weight_profile',
      'write_relationship_state',
      'confirm_identity',
      'execute_external_action',
      'affect_nebula_visual_weight',
      'affect_context_snapshot_selection'
    ]
  };
}

function latestPhaseRun({ root = projectRoot() } = {}) {
  const latestPath = latestPhaseRunPath({ root });
  if (!latestPath) return { phaseRun: null, latestPath: null };
  return {
    phaseRun: readJson(latestPath),
    latestPath
  };
}

function confirmationCheck(check_id, label, passed, evidence = [], fix = null) {
  return makeCheck({
    check_id,
    label,
    passed,
    severity: 'required',
    evidence,
    fix
  });
}

export function buildLearningWeightPromotionConfirmation({
  root = projectRoot(),
  phaseRun = null,
  phaseRunPath = null,
  createdAt = nowIso()
} = {}) {
  const latest = phaseRun
    ? { phaseRun, latestPath: phaseRunPath }
    : latestPhaseRun({ root });
  const sourcePhaseRun = latest.phaseRun;
  const sourcePath = latest.latestPath;
  const shadowReport = sourcePhaseRun?.artifacts?.learning_weight_shadow_report ?? null;
  const promotionGate = shadowReport?.promotion_confirmation_gate ?? null;
  const confirmationId = `learning_weight_promotion_confirmation_${stableSlug(sourcePhaseRun?.run_id ?? 'missing_phase_run')}`;
  const decisionTemplate = {
    schema_version: 'learning_weight_promotion_decision.v1',
    confirmation_id: confirmationId,
    promotion_gate_id: promotionGate?.gate_id ?? null,
    source_phase_run_id: sourcePhaseRun?.run_id ?? null,
    shadow_report_id: shadowReport?.shadow_report_id ?? null,
    selected_decision: 'pending',
    allowed_decisions: ['approve_limited_trial', 'reject', 'request_changes'],
    requested_scope: 'limited_trial_only',
    full_promotion_allowed: false,
    approval_flags: {
      user_final_confirmation: false,
      approve_limited_trial_only: false,
      reviewed_shadow_report: false,
      reviewed_rule_vs_shadow_delta: false,
      reviewed_rollback_plan: false,
      accepts_no_relationship_state_write: false,
      accepts_no_identity_merge: false,
      accepts_no_external_action: false
    },
    limited_trial_bounds: {
      can_rank_retrieval_candidates: false,
      can_generate_review_suggestions: false,
      can_modify_weight_profile: false,
      can_affect_context_snapshot_selection: false,
      can_affect_nebula_visual_weight: false,
      max_trial_scope: 'future_explicit_trial_only'
    },
    operator_notes: '',
    decided_by: null,
    decided_at: null
  };
  const checks = [
    confirmationCheck(
      'source_phase_run_exists',
      'Source P10 phase run exists',
      Boolean(sourcePhaseRun),
      [sourcePath ? relative(root, sourcePath) : 'missing']
    ),
    confirmationCheck(
      'source_phase_run_p10_shadow_ready',
      'Source phase run is P10 shadow ready',
      sourcePhaseRun?.gate_decision === 'relationship_event_graph_p10_shadow_ready'
        && sourcePhaseRun?.execution_scope?.completed_through === 'P10',
      [
        `gate_decision=${sourcePhaseRun?.gate_decision ?? 'missing'}`,
        `completed_through=${sourcePhaseRun?.execution_scope?.completed_through ?? 'missing'}`
      ],
      'Run npm.cmd run relationship-event:p10-shadow first.'
    ),
    confirmationCheck(
      'shadow_report_present',
      'LearningWeightShadowReport exists',
      shadowReport?.schema_version === 'learning_weight_shadow_report.v1',
      [`shadow_report_id=${shadowReport?.shadow_report_id ?? 'missing'}`]
    ),
    confirmationCheck(
      'shadow_report_is_report_only',
      'Shadow report is report-only and writes no fact state',
      shadowReport?.mode === 'shadow_only'
        && shadowReport?.writes_fact_state === false
        && shadowReport?.read_only_consumers?.context_snapshot_uses_shadow === false
        && shadowReport?.read_only_consumers?.nebula_projection_uses_shadow === false
        && shadowReport?.read_only_consumers?.weight_profile_mutation_allowed === false,
      [
        `mode=${shadowReport?.mode ?? 'missing'}`,
        `writes_fact_state=${shadowReport?.writes_fact_state ?? 'missing'}`,
        `context_snapshot_uses_shadow=${shadowReport?.read_only_consumers?.context_snapshot_uses_shadow ?? 'missing'}`,
        `nebula_projection_uses_shadow=${shadowReport?.read_only_consumers?.nebula_projection_uses_shadow ?? 'missing'}`
      ]
    ),
    confirmationCheck(
      'promotion_gate_blocked',
      'Learning-weight promotion gate remains blocked',
      promotionGate?.gate_type === 'learning_weight_promotion'
        && promotionGate?.status === 'blocked_pending_user_confirmation'
        && promotionGate?.allowed_operations?.length === 0,
      [
        `gate_type=${promotionGate?.gate_type ?? 'missing'}`,
        `status=${promotionGate?.status ?? 'missing'}`,
        `allowed_operations=${promotionGate?.allowed_operations?.length ?? 'missing'}`
      ]
    ),
    confirmationCheck(
      'no_sensitive_side_effects',
      'No relationship writes, identity merges, external actions or learning promotion were applied',
      sourcePhaseRun?.execution_scope?.relationship_state_writes === 0
        && sourcePhaseRun?.execution_scope?.identity_merges_applied === 0
        && sourcePhaseRun?.execution_scope?.external_actions_executed === 0
        && sourcePhaseRun?.execution_scope?.p10_learning_weight_implemented === false
        && sourcePhaseRun?.execution_scope?.learning_weight_promotion_applied === false,
      [
        `relationship_state_writes=${sourcePhaseRun?.execution_scope?.relationship_state_writes ?? 'missing'}`,
        `identity_merges_applied=${sourcePhaseRun?.execution_scope?.identity_merges_applied ?? 'missing'}`,
        `external_actions_executed=${sourcePhaseRun?.execution_scope?.external_actions_executed ?? 'missing'}`,
        `p10_learning_weight_implemented=${sourcePhaseRun?.execution_scope?.p10_learning_weight_implemented ?? 'missing'}`
      ]
    ),
    confirmationCheck(
      'rollback_plan_present',
      'Rollback plan exists before any limited trial approval',
      Boolean(shadowReport?.rollback_plan?.default_authority)
        && Boolean(shadowReport?.rollback_plan?.recovery_command),
      [
        `default_authority=${shadowReport?.rollback_plan?.default_authority ?? 'missing'}`,
        `recovery_command=${shadowReport?.rollback_plan?.recovery_command ?? 'missing'}`
      ]
    )
  ];
  const required = requiredFailures(checks);
  return {
    schema_version: 'learning_weight_promotion_confirmation.v1',
    confirmation_id: confirmationId,
    created_at: createdAt,
    source_phase_run_id: sourcePhaseRun?.run_id ?? null,
    source_phase_run_ref: sourcePath ? relative(root, sourcePath) : null,
    shadow_report_id: shadowReport?.shadow_report_id ?? null,
    promotion_gate_id: promotionGate?.gate_id ?? null,
    gate_decision: required.length
      ? 'learning_weight_promotion_confirmation_blocked'
      : 'learning_weight_promotion_confirmation_pending_user_decision',
    requested_transition: 'shadow_to_limited_trial',
    confirmation_scope: {
      current_scope: 'shadow_report_only',
      requested_scope: 'limited_trial_only',
      full_promotion_allowed: false,
      current_learning_weight_promotion_allowed: false,
      current_write_allowed: false,
      decision_template_required: true,
      user_final_confirmation_required: true
    },
    checks,
    required_failures: required,
    warning_failures: warningFailures(checks),
    shadow_summary: {
      comparison_count: shadowReport?.comparison?.length ?? 0,
      max_abs_delta: shadowReport?.aggregate?.max_abs_delta ?? null,
      changed_level_count: shadowReport?.aggregate?.changed_level_count ?? null,
      high_delta_count: shadowReport?.aggregate?.high_delta_count ?? null,
      review_subject_refs: shadowReport?.aggregate?.review_subject_refs ?? []
    },
    approval_boundary: {
      this_artifact_approves_nothing: true,
      writes_fact_state: false,
      relationship_state_write_allowed: false,
      identity_merge_allowed: false,
      external_action_allowed: false,
      learning_weight_promotion_allowed: false,
      limited_trial_execution_allowed: false,
      approval_requires_decision_template: true
    },
    decision_template: decisionTemplate,
    operator_next_actions: [
      'Review the source P10 shadow report and rollback plan.',
      'If approval is intended, fill a separate decision file from the decision template.',
      'Do not treat this confirmation pack as approval; it only opens the review process.'
    ],
    next_commands: [
      'npm.cmd run relationship-event:promotion-confirmation:validate'
    ]
  };
}

export function validateLearningWeightPromotionConfirmation(confirmation) {
  const checks = [
    confirmationCheck(
      'schema_version',
      'Confirmation uses learning_weight_promotion_confirmation.v1',
      confirmation?.schema_version === 'learning_weight_promotion_confirmation.v1',
      [`schema_version=${confirmation?.schema_version ?? 'missing'}`]
    ),
    confirmationCheck(
      'pending_or_blocked_only',
      'Confirmation process does not approve promotion',
      [
        'learning_weight_promotion_confirmation_pending_user_decision',
        'learning_weight_promotion_confirmation_blocked'
      ].includes(confirmation?.gate_decision),
      [`gate_decision=${confirmation?.gate_decision ?? 'missing'}`]
    ),
    confirmationCheck(
      'approval_boundary_blocks_writes',
      'Approval boundary blocks all writes and promotion',
      confirmation?.approval_boundary?.writes_fact_state === false
        && confirmation?.approval_boundary?.relationship_state_write_allowed === false
        && confirmation?.approval_boundary?.identity_merge_allowed === false
        && confirmation?.approval_boundary?.external_action_allowed === false
        && confirmation?.approval_boundary?.learning_weight_promotion_allowed === false
        && confirmation?.approval_boundary?.limited_trial_execution_allowed === false,
      [
        `writes_fact_state=${confirmation?.approval_boundary?.writes_fact_state ?? 'missing'}`,
        `learning_weight_promotion_allowed=${confirmation?.approval_boundary?.learning_weight_promotion_allowed ?? 'missing'}`,
        `limited_trial_execution_allowed=${confirmation?.approval_boundary?.limited_trial_execution_allowed ?? 'missing'}`
      ]
    ),
    confirmationCheck(
      'decision_template_pending',
      'Decision template remains pending by default',
      confirmation?.decision_template?.selected_decision === 'pending'
        && confirmation?.decision_template?.approval_flags?.user_final_confirmation === false,
      [
        `selected_decision=${confirmation?.decision_template?.selected_decision ?? 'missing'}`,
        `user_final_confirmation=${confirmation?.decision_template?.approval_flags?.user_final_confirmation ?? 'missing'}`
      ]
    ),
    confirmationCheck(
      'source_checks_passed',
      'Source checks passed before user decision',
      Array.isArray(confirmation?.required_failures)
        && confirmation.required_failures.length === 0
        && (confirmation?.checks ?? []).every((check) => check.passed),
      [`required_failures=${confirmation?.required_failures?.join(',') || 'none'}`]
    )
  ];
  const required = requiredFailures(checks);
  return {
    schema_version: 'learning_weight_promotion_confirmation_validation.v1',
    validation_id: `learning_weight_promotion_confirmation_validation_${Date.now()}`,
    created_at: nowIso(),
    gate_decision: required.length
      ? 'learning_weight_promotion_confirmation_validation_failed'
      : 'learning_weight_promotion_confirmation_validation_passed',
    checks,
    required_failures: required,
    warning_failures: warningFailures(checks)
  };
}

export function renderLearningWeightPromotionConfirmationMarkdown(confirmation) {
  const checkRows = confirmation.checks
    .map((check) => `| ${check.check_id} | ${check.status} | ${check.evidence.join('; ') || 'none'} |`)
    .join('\n');
  return `# Learning Weight Promotion Confirmation

- confirmation_id: ${confirmation.confirmation_id}
- created_at: ${confirmation.created_at}
- gate_decision: ${confirmation.gate_decision}
- requested_transition: ${confirmation.requested_transition}
- source_phase_run_id: ${confirmation.source_phase_run_id ?? 'missing'}
- shadow_report_id: ${confirmation.shadow_report_id ?? 'missing'}
- promotion_gate_id: ${confirmation.promotion_gate_id ?? 'missing'}
- learning_weight_promotion_allowed: ${confirmation.approval_boundary.learning_weight_promotion_allowed}
- limited_trial_execution_allowed: ${confirmation.approval_boundary.limited_trial_execution_allowed}
- relationship_state_write_allowed: ${confirmation.approval_boundary.relationship_state_write_allowed}
- identity_merge_allowed: ${confirmation.approval_boundary.identity_merge_allowed}
- external_action_allowed: ${confirmation.approval_boundary.external_action_allowed}

## Shadow Summary

- comparison_count: ${confirmation.shadow_summary.comparison_count}
- max_abs_delta: ${confirmation.shadow_summary.max_abs_delta ?? 'missing'}
- changed_level_count: ${confirmation.shadow_summary.changed_level_count ?? 'missing'}
- high_delta_count: ${confirmation.shadow_summary.high_delta_count ?? 'missing'}

## Checks

| Check | Status | Evidence |
| --- | --- | --- |
${checkRows}

## Decision Template

- selected_decision: ${confirmation.decision_template.selected_decision}
- allowed_decisions: ${confirmation.decision_template.allowed_decisions.join(', ')}
- requested_scope: ${confirmation.decision_template.requested_scope}
- full_promotion_allowed: ${confirmation.decision_template.full_promotion_allowed}

## Next Actions

${confirmation.operator_next_actions.map((item) => `- ${item}`).join('\n')}
`;
}

export function writeLearningWeightPromotionConfirmation({
  confirmation,
  outputDir = path.join(projectRoot(), 'runtime/relationship-event-learning-weight-confirmations', confirmation?.confirmation_id ?? `learning_weight_promotion_confirmation_${Date.now()}`),
  root = projectRoot()
} = {}) {
  if (!confirmation) throw new Error('writeLearningWeightPromotionConfirmation requires confirmation');
  ensureDir(outputDir);
  const jsonPath = path.join(outputDir, 'learning-weight-promotion-confirmation.json');
  const markdownPath = path.join(outputDir, 'learning-weight-promotion-confirmation.md');
  const templatePath = path.join(outputDir, 'learning-weight-promotion-decision.template.json');
  writeJsonAtomic(jsonPath, confirmation);
  writeText(markdownPath, renderLearningWeightPromotionConfirmationMarkdown(confirmation));
  writeJsonAtomic(templatePath, confirmation.decision_template);

  const latestPath = path.join(root, 'runtime/relationship-event-learning-weight-confirmations/latest.json');
  writeJsonAtomic(latestPath, {
    schema_version: 'learning_weight_promotion_confirmation_latest.v1',
    confirmation_id: confirmation.confirmation_id,
    confirmation_path: relative(root, jsonPath),
    decision_template_path: relative(root, templatePath),
    gate_decision: confirmation.gate_decision,
    learning_weight_promotion_allowed: false,
    limited_trial_execution_allowed: false,
    updated_at: nowIso()
  });

  const statusDir = path.join(root, 'runtime/relationship-event-graph-execution-state');
  ensureDir(statusDir);
  const statusJsonPath = path.join(statusDir, 'phase-status.json');
  const previousStatus = existsSync(statusJsonPath) ? readJson(statusJsonPath) : {};
  const phaseStatus = {
    ...previousStatus,
    updated_at: nowIso(),
    status: confirmation.gate_decision === 'learning_weight_promotion_confirmation_pending_user_decision'
      ? 'learning_weight_promotion_confirmation_pending_user_decision'
      : 'learning_weight_promotion_confirmation_blocked',
    latest_learning_weight_confirmation_id: confirmation.confirmation_id,
    latest_learning_weight_confirmation_path: relative(root, jsonPath),
    learning_weight_decision_template_path: relative(root, templatePath),
    next_phase_allowed: false,
    learning_weight_promotion_requires_separate_user_confirmation: true,
    learning_weight_promotion_allowed: false,
    limited_trial_execution_allowed: false
  };
  const statusMarkdownPath = path.join(statusDir, 'phase-status.md');
  writeJsonAtomic(statusJsonPath, phaseStatus);
  writeText(statusMarkdownPath, `# Relationship Event Graph Phase Status

- status: ${phaseStatus.status}
- latest_run_id: ${phaseStatus.latest_run_id ?? 'none'}
- completed_through: ${phaseStatus.completed_through ?? 'not complete'}
- required_failures: ${(phaseStatus.required_failures ?? []).join(', ') || 'none'}
- latest_learning_weight_confirmation_id: ${phaseStatus.latest_learning_weight_confirmation_id}
- learning_weight_promotion_allowed: ${phaseStatus.learning_weight_promotion_allowed}
- limited_trial_execution_allowed: ${phaseStatus.limited_trial_execution_allowed}
- decision_template_path: ${phaseStatus.learning_weight_decision_template_path}
`);

  return {
    json_path: jsonPath,
    markdown_path: markdownPath,
    decision_template_path: templatePath,
    latest_path: latestPath,
    status_json_path: statusJsonPath,
    status_markdown_path: statusMarkdownPath
  };
}

export function latestLearningWeightPromotionConfirmationPath({
  root = projectRoot(),
  latestPath = path.join(root, 'runtime/relationship-event-learning-weight-confirmations/latest.json')
} = {}) {
  if (!existsSync(latestPath)) return null;
  const latest = readJson(latestPath);
  if (!latest.confirmation_path) return null;
  const fullPath = path.resolve(root, latest.confirmation_path);
  return existsSync(fullPath) ? fullPath : null;
}

function buildIndexes({ archives, rawEvents, semanticEvents, nestedEvents, weightProfiles }) {
  const sourceIndex = { schema_version: 'relationship_event_source_index.v1', entries: {} };
  const timeIndex = { schema_version: 'relationship_event_time_index.v1', entries: {} };
  const participantIndex = { schema_version: 'relationship_event_participant_index.v1', entries: {} };
  const tagIndex = { schema_version: 'relationship_event_tag_index.v1', entries: {} };
  const evidenceIndex = { schema_version: 'relationship_event_evidence_index.v1', entries: {} };
  const weightIndex = { schema_version: 'relationship_event_weight_index.v1', entries: {} };

  for (const archive of archives) {
    sourceIndex.entries[archive.source_archive_id] = {
      source_type: archive.source_type,
      platform: archive.platform,
      raw_event_ids: rawEvents
        .filter((event) => event.source_ref.source_archive_id === archive.source_archive_id)
        .map((event) => event.event_id),
      semantic_event_ids: semanticEvents
        .filter((event) => event.metadata.source_archive_id === archive.source_archive_id)
        .map((event) => event.event_id),
      nested_event_ids: nestedEvents
        .filter((event) => event.source_archive_id === archive.source_archive_id)
        .map((event) => event.nested_event_id)
    };
    evidenceIndex.entries[archive.content_hash] = {
      source_archive_id: archive.source_archive_id,
      raw_text_ref: archive.raw_text_ref,
      checksums_ref: archive.checksums_ref
    };
  }

  for (const rawEvent of rawEvents) {
    const day = datePart(rawEvent.occurred_at);
    timeIndex.entries[day] ??= { raw_event_ids: [], semantic_event_ids: [], nested_event_ids: [] };
    timeIndex.entries[day].raw_event_ids.push(rawEvent.event_id);
    for (const participant of rawEvent.participants) {
      const key = stableSlug(participant);
      participantIndex.entries[key] ??= { participant_hint: participant, raw_event_ids: [], semantic_event_ids: [], nested_event_ids: [] };
      participantIndex.entries[key].raw_event_ids.push(rawEvent.event_id);
    }
  }

  for (const event of semanticEvents) {
    const day = datePart(event.occurred_at);
    timeIndex.entries[day] ??= { raw_event_ids: [], semantic_event_ids: [], nested_event_ids: [] };
    timeIndex.entries[day].semantic_event_ids.push(event.event_id);
    for (const tag of event.tags) {
      tagIndex.entries[tag] ??= { semantic_event_ids: [], nested_event_ids: [] };
      tagIndex.entries[tag].semantic_event_ids.push(event.event_id);
    }
  }

  for (const event of nestedEvents) {
    const day = datePart(event.occurred_at);
    timeIndex.entries[day] ??= { raw_event_ids: [], semantic_event_ids: [], nested_event_ids: [] };
    timeIndex.entries[day].nested_event_ids.push(event.nested_event_id);
    for (const participant of event.participants_hint) {
      const key = stableSlug(participant);
      participantIndex.entries[key] ??= { participant_hint: participant, raw_event_ids: [], semantic_event_ids: [], nested_event_ids: [] };
      participantIndex.entries[key].nested_event_ids.push(event.nested_event_id);
    }
    for (const tag of event.tags) {
      tagIndex.entries[tag] ??= { semantic_event_ids: [], nested_event_ids: [] };
      tagIndex.entries[tag].nested_event_ids.push(event.nested_event_id);
    }
  }

  for (const profile of weightProfiles) {
    weightIndex.entries[profile.weight_level] ??= [];
    weightIndex.entries[profile.weight_level].push(profile.subject_ref);
  }

  return {
    source_index: sourceIndex,
    time_index: timeIndex,
    participant_index: participantIndex,
    tag_index: tagIndex,
    evidence_index: evidenceIndex,
    weight_index: weightIndex
  };
}

function buildSummaryShards({ rawEvents, semanticEvents, nestedEvents, weightProfiles, createdAt }) {
  const byGoal = new Map();
  for (const event of nestedEvents) {
    byGoal.set(event.goal_domain, [...(byGoal.get(event.goal_domain) ?? []), event]);
  }
  const shards = [];
  for (const [goalDomain, events] of byGoal.entries()) {
    shards.push({
      schema_version: 'summary_shard.v1',
      summary_shard_id: `summary_shard_goal_${stableSlug(goalDomain)}`,
      shard_type: 'goal_domain_summary',
      source_refs: unique(events.flatMap((event) => event.evidence_refs)),
      subject_refs: events.map((event) => event.nested_event_id),
      time_window: {
        start_at: events.map((event) => event.occurred_at).sort()[0],
        end_at: events.map((event) => event.occurred_at).sort().at(-1)
      },
      summary_text: `${goalDomain} has ${events.length} semantic sub-events with source-backed evidence.`,
      tags: unique(events.flatMap((event) => event.tags)),
      replaces_original: false,
      created_at: createdAt
    });
  }
  shards.push({
    schema_version: 'summary_shard.v1',
    summary_shard_id: 'summary_shard_time_all_sources',
    shard_type: 'time_window_summary',
    source_refs: unique(rawEvents.flatMap((event) => event.evidence_refs)),
    subject_refs: rawEvents.map((event) => event.event_id),
    time_window: {
      start_at: rawEvents.map((event) => event.occurred_at).sort()[0],
      end_at: rawEvents.map((event) => event.occurred_at).sort().at(-1)
    },
    summary_text: `Three-source validation collected ${rawEvents.length} raw events, ${semanticEvents.length} semantic events and ${nestedEvents.length} nested events.`,
    tags: ['source:multi', 'summary:time_window'],
    replaces_original: false,
    created_at: createdAt
  });
  shards.push({
    schema_version: 'summary_shard.v1',
    summary_shard_id: 'summary_shard_weighted_decision_context',
    shard_type: 'tag_summary',
    source_refs: unique(nestedEvents.flatMap((event) => event.evidence_refs)),
    subject_refs: weightProfiles
      .filter((profile) => ['V3', 'V4', 'V5'].includes(profile.weight_level))
      .map((profile) => profile.subject_ref),
    time_window: null,
    summary_text: 'Weighted context keeps high-visibility nodes separate from source evidence and pending confirmation gates.',
    tags: ['weight:visible', 'confirmation:auditable'],
    replaces_original: false,
    created_at: createdAt
  });
  return shards;
}

function buildContextSnapshot({
  runId,
  summaryShards,
  rawEvents,
  semanticEvents,
  nestedEvents,
  weightProfiles,
  confirmationGates,
  createdAt
}) {
  const visibleProfiles = weightProfiles.filter((profile) => ['V3', 'V4', 'V5'].includes(profile.weight_level));
  const sufficiencyScore = rawEvents.length >= 3
    && semanticEvents.length >= 3
    && nestedEvents.length >= 4
    && summaryShards.length >= 3
    ? 0.86
    : 0.55;
  return {
    schema_version: 'context_snapshot.v1',
    snapshot_id: `context_snapshot_${runId}`,
    source: 'relationship_event_graph_phase_run',
    built_at: createdAt,
    goal: {
      goal_domains: ['sales_customer_progress', 'romance_relationship_maintenance'],
      first_execution_scope: 'P0-P9',
      learning_weight_enabled: false
    },
    relationship_snapshot: {
      relationship_state_write_count: 0,
      pending_confirmation_gate_ids: confirmationGates.map((gate) => gate.gate_id),
      boundary: 'relationship updates remain proposals until user confirmation'
    },
    event_snapshot: {
      raw_event_count: rawEvents.length,
      semantic_event_count: semanticEvents.length,
      nested_event_count: nestedEvents.length,
      selected_event_ids: visibleProfiles.map((profile) => profile.subject_ref)
    },
    decision_inputs: {
      summary_shard_ids: summaryShards.map((summary) => summary.summary_shard_id),
      weight_profile_ids: visibleProfiles.map((profile) => profile.weight_profile_id),
      confirmation_gate_ids: confirmationGates.map((gate) => gate.gate_id)
    },
    retrieval_reasons: [
      'include recent multi-source events',
      'include high visual weight V3-V5 nodes',
      'include confirmation gates without applying relationship changes',
      'preserve source evidence refs for cold-path review'
    ],
    target_context_windows: [],
    context_sufficiency_score: sufficiencyScore,
    context_sufficiency_level: sufficiencyScore >= 0.8 ? 'high' : 'medium',
    context_sufficiency_checks: [
      { check_id: 'has_three_sources', passed: rawEvents.length >= 3 },
      { check_id: 'has_sales_and_romance_domains', passed: new Set(nestedEvents.map((event) => event.goal_domain)).size >= 2 },
      { check_id: 'has_pending_confirmation_gate', passed: confirmationGates.length >= 1 }
    ]
  };
}

function visualProfileForNode(node, weightProfile = null) {
  const level = weightProfile?.weight_level ?? (node.node_type === 'confirmation_gate' ? 'V5' : 'V2');
  const levelSize = { V0: 6, V1: 8, V2: 10, V3: 14, V4: 18, V5: 22 }[level] ?? 10;
  return {
    schema_version: 'nebula_visual_profile.v1',
    projection_id: node.projection_id,
    node_id: node.node_id,
    source_weight_profile_ref: weightProfile?.weight_profile_id ?? null,
    visual_weight_level: level,
    node_size: levelSize,
    brightness: weightProfile?.contextual_weight ?? 0.5,
    opacity: node.node_type === 'confirmation_gate' ? 0.92 : 0.78,
    color_channel: {
      person: 'blue',
      source: 'green',
      event: 'amber',
      tag: 'gray',
      confirmation_gate: 'red'
    }[node.node_type],
    border_style: node.node_type === 'confirmation_gate'
      ? 'double_ring_requires_confirmation'
      : node.node_type === 'event' && level === 'V5'
        ? 'double_ring_requires_confirmation'
        : 'solid',
    pulse_state: node.node_type === 'confirmation_gate'
      ? 'medium_pending_user_confirmation'
      : 'none',
    edge_thickness: level === 'V5' ? 3 : 1,
    label_priority: level,
    explainability: {
      why_visible: node.explainability ?? `node_type=${node.node_type}`,
      source_refs: node.source_refs ?? []
    }
  };
}

function buildNebulaProjection({
  runId,
  archives,
  rawEvents,
  nestedEvents,
  weightProfiles,
  confirmationGates,
  indexes,
  createdAt
}) {
  const projectionId = `nebula_projection_${runId}`;
  const weightBySubject = new Map(weightProfiles.map((profile) => [profile.subject_ref, profile]));
  const participantNodes = unique(rawEvents.flatMap((event) => event.participants)).map((participant) => ({
    projection_id: projectionId,
    node_id: `person_${stableSlug(participant)}`,
    node_type: 'person',
    label: participant,
    source_refs: [],
    explainability: 'participant hint only; not a confirmed person identity'
  }));
  const sourceNodes = archives.map((archive) => ({
    projection_id: projectionId,
    node_id: `source_${archive.source_archive_id}`,
    node_type: 'source',
    label: `${archive.source_type}:${archive.platform}`,
    source_refs: [archive.raw_text_ref],
    explainability: 'source archive node preserves original evidence'
  }));
  const eventNodes = nestedEvents.map((event) => ({
    projection_id: projectionId,
    node_id: `event_${event.nested_event_id}`,
    node_type: 'event',
    label: event.event_type_code,
    source_refs: event.evidence_refs,
    explainability: `nested event from ${event.goal_domain}`
  }));
  const tagNodes = Object.keys(indexes.tag_index.entries).slice(0, 12).map((tag) => ({
    projection_id: projectionId,
    node_id: `tag_${stableSlug(tag)}`,
    node_type: 'tag',
    label: tag,
    source_refs: [],
    explainability: 'tag index projection'
  }));
  const confirmationNodes = confirmationGates.map((gate) => ({
    projection_id: projectionId,
    node_id: `confirmation_${gate.gate_id}`,
    node_type: 'confirmation_gate',
    label: gate.gate_type,
    source_refs: gate.evidence_refs,
    explainability: 'blocked pending user confirmation'
  }));
  const nodes = [
    ...participantNodes,
    ...sourceNodes,
    ...eventNodes,
    ...tagNodes,
    ...confirmationNodes
  ];
  const edges = [
    ...nestedEvents.map((event) => ({
      edge_id: `edge_source_event_${stableSlug(event.nested_event_id)}`,
      from_node_id: `source_${event.source_archive_id}`,
      to_node_id: `event_${event.nested_event_id}`,
      edge_type: 'derived_from',
      thickness: 1
    })),
    ...nestedEvents.flatMap((event) => event.tags.slice(0, 3).map((tag) => ({
      edge_id: `edge_event_tag_${stableSlug(event.nested_event_id)}_${stableSlug(tag)}`,
      from_node_id: `event_${event.nested_event_id}`,
      to_node_id: `tag_${stableSlug(tag)}`,
      edge_type: 'has_tag',
      thickness: 1
    }))),
    ...confirmationGates.map((gate) => ({
      edge_id: `edge_confirmation_${stableSlug(gate.gate_id)}`,
      from_node_id: `event_${gate.subject_ref}`,
      to_node_id: `confirmation_${gate.gate_id}`,
      edge_type: 'requires_confirmation',
      thickness: 3
    }))
  ];
  const visualProfiles = nodes.map((node) => {
    const subjectRef = node.node_id.startsWith('event_')
      ? node.node_id.replace(/^event_/, '')
      : node.node_id.startsWith('confirmation_')
        ? confirmationGates.find((gate) => `confirmation_${gate.gate_id}` === node.node_id)?.subject_ref
        : null;
    return visualProfileForNode(node, subjectRef ? weightBySubject.get(subjectRef) : null);
  });
  return {
    schema_version: 'nebula_projection.v1',
    projection_id: projectionId,
    source_run_id: runId,
    created_at: createdAt,
    source_only: true,
    writes_fact_state: false,
    allowed_node_types: ['person', 'source', 'event', 'tag', 'confirmation_gate'],
    allowed_operation_intents: [
      'inspect',
      'expand',
      'compare',
      'open_evidence',
      'request_confirmation',
      'filter_by_tag',
      'focus_person',
      'focus_time_window'
    ],
    forbidden_operations: [
      'write_relationship_state',
      'confirm_identity',
      'modify_weight_profile',
      'execute_external_action'
    ],
    nodes,
    edges,
    visual_profiles: visualProfiles,
    visual_operation_intent: {
      operation: 'inspect',
      writes_fact_state: false,
      external_action_allowed: false
    }
  };
}

function evidenceSnippetGate(event, rawEvent) {
  const snippets = event.metadata?.evidence_snippets ?? [];
  const sourceText = rawEvent?.content ?? '';
  const evidenceText = event.evidence_text ?? '';
  const snippetLength = snippets.reduce((sum, snippet) => sum + [...String(snippet)].length, 0);
  const sourceLength = [...evidenceText].length;
  const compressionRatio = Number((snippetLength / Math.max(sourceLength, 1)).toFixed(3));
  const eachSnippetConcise = snippets.every((snippet) => [...String(snippet)].length <= EVIDENCE_SNIPPET_MAX_CHARS);
  const snippetsInEvidence = snippets.length > 0 && snippets.every((snippet) => evidenceText.includes(snippet));
  const snippetsInSource = snippets.length > 0 && snippets.every((snippet) => sourceText.includes(snippet));
  const evidenceTextInSource = Boolean(evidenceText) && sourceText.includes(evidenceText);
  const concise = eachSnippetConcise && compressionRatio <= EVIDENCE_COMPRESSION_MAX_RATIO;
  return {
    status: snippetsInEvidence && snippetsInSource && evidenceTextInSource && concise ? 'pass' : 'fail',
    snippets,
    snippet_length: snippetLength,
    evidence_text_length: sourceLength,
    compression_ratio: compressionRatio,
    each_snippet_concise: eachSnippetConcise,
    snippets_in_evidence_text: snippetsInEvidence,
    snippets_in_source_text: snippetsInSource,
    evidence_text_in_source_text: evidenceTextInSource,
    max_snippet_chars: EVIDENCE_SNIPPET_MAX_CHARS,
    max_compression_ratio: EVIDENCE_COMPRESSION_MAX_RATIO
  };
}

function validatePrewriteTagSignatureEvent(event, rawEvent) {
  const dimensions = new Set((event.tags ?? []).map(tagDimension));
  const missingRequired = TAG_SIGNATURE_REQUIRED_DIMENSIONS.filter((dimension) => !dimensions.has(dimension));
  const evidenceCheck = evidenceSnippetGate(event, rawEvent);
  const boundaryFailures = [
    getTag(event.tags, 'relationship_write') === 'blocked' ? null : 'relationship_write',
    getTag(event.tags, 'identity_merge') === 'blocked' ? null : 'identity_merge',
    getTag(event.tags, 'external_action') === 'blocked' ? null : 'external_action',
    event.metadata?.relationship_state_write_allowed === false ? null : 'relationship_state_write_allowed',
    event.metadata?.identity_merge_allowed === false ? null : 'identity_merge_allowed',
    event.metadata?.real_external_action_allowed === false ? null : 'real_external_action_allowed'
  ].filter(Boolean);
  const tagBudget = {
    tag_count: event.tags?.length ?? 0,
    max_allowed: TAG_SIGNATURE_MAX_TAGS,
    status: (event.tags?.length ?? 0) <= TAG_SIGNATURE_MAX_TAGS ? 'pass' : 'fail'
  };
  const decision = missingRequired.length === 0
    && evidenceCheck.status === 'pass'
    && boundaryFailures.length === 0
    && tagBudget.status === 'pass'
    ? 'accepted'
    : 'failed';
  return {
    event_id: event.nested_event_id,
    event_type_code: event.event_type_code,
    required_signature_coverage: {
      status: missingRequired.length ? 'fail' : 'pass',
      missing_required_dimensions: missingRequired
    },
    evidence_extraction: evidenceCheck,
    boundary_check: {
      status: boundaryFailures.length ? 'fail' : 'pass',
      failures: boundaryFailures
    },
    tag_budget: tagBudget,
    reconstructed_signature: {
      source: getTag(event.tags, 'source'),
      domain: getTag(event.tags, 'domain'),
      scene: getTag(event.tags, 'scene'),
      event_family: getTag(event.tags, 'event_family'),
      event: getTag(event.tags, 'event'),
      actor_role: getTag(event.tags, 'actor_role'),
      target_object: getTag(event.tags, 'target_object'),
      object_type: getTag(event.tags, 'object_type'),
      confirmation: getTag(event.tags, 'confirmation'),
      identity_status: getTag(event.tags, 'identity_status'),
      polarity: getTag(event.tags, 'polarity')
    },
    decision
  };
}

function buildPrewriteTagSignatureGate({ runId, rawEvents, nestedEvents, createdAt }) {
  const rawEventById = new Map(rawEvents.map((event) => [event.event_id, event]));
  const eventReports = nestedEvents.map((event) => validatePrewriteTagSignatureEvent(event, rawEventById.get(event.raw_event_id)));
  const failedEvents = eventReports.filter((event) => event.decision !== 'accepted');
  const directEvidence = eventReports.map((event) => event.evidence_extraction);
  const tagCounts = eventReports.map((event) => event.tag_budget.tag_count);
  const aggregate = {
    event_count: eventReports.length,
    accepted_count: eventReports.length - failedEvents.length,
    failed_count: failedEvents.length,
    max_tag_count: Math.max(0, ...tagCounts),
    avg_tag_count: eventReports.length
      ? Number((tagCounts.reduce((sum, value) => sum + value, 0) / eventReports.length).toFixed(2))
      : 0,
    avg_evidence_snippet_length: directEvidence.length
      ? Number((directEvidence.reduce((sum, check) => sum + check.snippet_length, 0) / directEvidence.length).toFixed(2))
      : 0,
    avg_evidence_compression_ratio: directEvidence.length
      ? Number((directEvidence.reduce((sum, check) => sum + check.compression_ratio, 0) / directEvidence.length).toFixed(3))
      : 0,
    evidence_substring_failures: directEvidence.filter((check) =>
      !check.snippets_in_evidence_text || !check.snippets_in_source_text || !check.evidence_text_in_source_text
    ).length,
    evidence_concision_failures: directEvidence.filter((check) => check.status !== 'pass').length,
    boundary_failures: eventReports.reduce((sum, event) => sum + event.boundary_check.failures.length, 0)
  };
  return {
    schema_version: 'prewrite_tag_signature_gate.v1',
    gate_id: `prewrite_tag_signature_gate_${runId}`,
    created_at: createdAt,
    applies_before: ['NestedEvent write acceptance', 'tag index acceptance', 'P9 closed-loop acceptance'],
    goal: 'accept only events whose tags reconstruct a concise event signature and whose evidence snippets are short original substrings',
    constraints: {
      required_signature_dimensions: TAG_SIGNATURE_REQUIRED_DIMENSIONS,
      max_tags_per_event: TAG_SIGNATURE_MAX_TAGS,
      max_evidence_snippet_chars: EVIDENCE_SNIPPET_MAX_CHARS,
      max_evidence_compression_ratio: EVIDENCE_COMPRESSION_MAX_RATIO,
      relationship_write_required: 'blocked',
      identity_merge_required: 'blocked',
      external_action_required: 'blocked'
    },
    aggregate,
    event_reports: eventReports,
    failed_events: failedEvents.map((event) => ({
      event_id: event.event_id,
      event_type_code: event.event_type_code,
      required_signature_coverage: event.required_signature_coverage,
      evidence_extraction: event.evidence_extraction,
      boundary_check: event.boundary_check,
      tag_budget: event.tag_budget
    })),
    gate_decision: failedEvents.length === 0
      ? 'prewrite_tag_signature_gate_passed'
      : 'prewrite_tag_signature_gate_failed'
  };
}

function phaseResult(phase_id, label, checks) {
  const required = requiredFailures(checks);
  const warnings = warningFailures(checks);
  return {
    phase_id,
    label,
    gate_decision: required.length ? 'phase_failed' : 'phase_passed',
    checks,
    required_failures: required,
    warning_failures: warnings,
    next_phase_allowed: required.length === 0
  };
}

function buildPhaseResults({
  root,
  docs20Registered,
  archives,
  episodes,
  rawEvents,
  semanticEvents,
  nestedEvents,
  indexes,
  weightProfiles,
  summaryShards,
  contextSnapshot,
  nebulaProjection,
  confirmationGates,
  prewriteTagSignatureGate,
  learningWeightShadowReport = null
}) {
  const schemaChecks = REQUIRED_SCHEMAS.map((schemaPath) => makeCheck({
    check_id: `schema_exists:${schemaPath}`,
    label: `${schemaPath} exists`,
    passed: existsSync(path.join(root, schemaPath)),
    evidence: [schemaPath],
    fix: `Create ${schemaPath}.`
  }));
  const fixtureChecks = REQUIRED_FIXTURES.map((fixturePath) => makeCheck({
    check_id: `fixture_exists:${fixturePath}`,
    label: `${fixturePath} exists`,
    passed: existsSync(path.join(root, fixturePath)),
    evidence: [fixturePath],
    fix: `Create ${fixturePath}.`
  }));
  const results = [
    phaseResult('P0', 'baseline_freeze', [
      makeCheck({
        check_id: 'docs18_exists',
        label: 'Relationship/event graph memory plan exists',
        passed: existsSync(path.join(root, 'docs/18-relationship-event-graph-memory-plan.md')),
        evidence: ['docs/18-relationship-event-graph-memory-plan.md']
      }),
      makeCheck({
        check_id: 'docs19_exists',
        label: 'Collection classified storage plan exists',
        passed: existsSync(path.join(root, 'docs/19-source-collection-classified-storage-plan.md')),
        evidence: ['docs/19-source-collection-classified-storage-plan.md']
      }),
      makeCheck({
        check_id: 'docs20_registered',
        label: 'Phase plan is registered in process tree or Obsidian surfaces',
        passed: docs20Registered,
        evidence: [`docs20_registered=${docs20Registered}`],
        fix: 'Register docs/20 in examples/system-process-tree.json and Obsidian views.'
      })
    ]),
    phaseResult('P1', 'schema_contracts', [
      ...schemaChecks,
      ...fixtureChecks
    ]),
    phaseResult('P2', 'source_archive_local_files', [
      makeCheck({
        check_id: 'three_archives_written',
        label: 'At least three SourceArchive records are written',
        passed: archives.length >= 3,
        evidence: [`archives=${archives.length}`]
      }),
      makeCheck({
        check_id: 'archives_have_raw_text',
        label: 'Every SourceArchive has raw text and active delete_state',
        passed: archives.every((archive) => archive.raw_text_ref && archive.delete_state === 'active'),
        evidence: archives.map((archive) => `${archive.source_archive_id}:${archive.raw_text_ref}`)
      })
    ]),
    phaseResult('P3', 'source_episode_raw_event_chain', [
      makeCheck({
        check_id: 'episode_per_archive',
        label: 'Every archive has a SourceEpisode',
        passed: episodes.length === archives.length,
        evidence: [`episodes=${episodes.length}`, `archives=${archives.length}`]
      }),
      makeCheck({
        check_id: 'raw_event_per_episode',
        label: 'Every SourceEpisode has a RawEvent',
        passed: rawEvents.length === episodes.length && rawEvents.every((event) => event.source_ref?.source_archive_id),
        evidence: [`raw_events=${rawEvents.length}`]
      }),
      makeCheck({
        check_id: 'no_confirmed_person_links',
        label: 'RawEvent keeps unconfirmed people out of linked_person_ids',
        passed: rawEvents.every((event) => (event.linked_person_ids ?? []).length === 0),
        evidence: ['linked_person_ids remain empty for unconfirmed hints']
      })
    ]),
    phaseResult('P4', 'semantic_nested_events', [
      makeCheck({
        check_id: 'semantic_event_per_raw_event',
        label: 'Every RawEvent has a SemanticEvent',
        passed: semanticEvents.length === rawEvents.length,
        evidence: [`semantic_events=${semanticEvents.length}`]
      }),
      makeCheck({
        check_id: 'nested_event_minimum',
        label: 'At least one RawEvent splits into two semantic NestedEvents',
        passed: nestedEvents.some((event, index, all) =>
          all.filter((other) => other.raw_event_id === event.raw_event_id).length >= 2
        ),
        evidence: [`nested_events=${nestedEvents.length}`]
      }),
      makeCheck({
        check_id: 'confirmation_gate_for_relation_signal',
        label: 'Relationship label signal enters a confirmation gate',
        passed: confirmationGates.some((gate) => gate.gate_type === 'relationship_state_write')
          && confirmationGates.every((gate) => gate.status === 'blocked_pending_user_confirmation'),
        evidence: confirmationGates.map((gate) => `${gate.gate_id}:${gate.status}`)
      })
    ]),
    phaseResult('P5', 'tags_indexes', [
      makeCheck({
        check_id: 'indexes_built',
        label: 'Source, time, participant, tag, evidence and weight indexes are built',
        passed: ['source_index', 'time_index', 'participant_index', 'tag_index', 'evidence_index', 'weight_index']
          .every((key) => indexes[key]?.entries),
        evidence: Object.keys(indexes)
      }),
      makeCheck({
        check_id: 'tag_index_has_confirmation',
        label: 'Tag index includes confirmation tags',
        passed: Object.keys(indexes.tag_index.entries).some((tag) => tag.includes('confirmation')),
        evidence: Object.keys(indexes.tag_index.entries).filter((tag) => tag.includes('confirmation'))
      }),
      makeCheck({
        check_id: 'prewrite_tag_signature_gate_passed',
        label: 'Prewrite tag signature gate passes before tag/index acceptance',
        passed: prewriteTagSignatureGate?.gate_decision === 'prewrite_tag_signature_gate_passed',
        evidence: [
          `gate_decision=${prewriteTagSignatureGate?.gate_decision ?? 'missing'}`,
          `failed_count=${prewriteTagSignatureGate?.aggregate?.failed_count ?? 'missing'}`
        ],
        fix: 'Repair tag signature dimensions, evidence snippets, or boundary tags before accepting event writes.'
      })
    ]),
    phaseResult('P6', 'rule_weight_profile', [
      makeCheck({
        check_id: 'weight_for_each_event',
        label: 'Semantic and nested events each have a WeightProfile',
        passed: weightProfiles.length === semanticEvents.length + nestedEvents.length,
        evidence: [`weight_profiles=${weightProfiles.length}`]
      }),
      makeCheck({
        check_id: 'v5_is_confirmation_only',
        label: 'V5 profiles exist only as confirmation gates, not fact writes',
        passed: weightProfiles
          .filter((profile) => profile.weight_level === 'V5')
          .every((profile) => profile.writes_fact_state === false && profile.confirmation_need >= 0.85),
        evidence: weightProfiles.filter((profile) => profile.weight_level === 'V5').map((profile) => profile.subject_ref)
      })
    ]),
    phaseResult('P7', 'summary_context_snapshot', [
      makeCheck({
        check_id: 'summary_shards_generated',
        label: 'SummaryShard records are generated and do not replace originals',
        passed: summaryShards.length >= 3 && summaryShards.every((summary) => summary.replaces_original === false),
        evidence: summaryShards.map((summary) => summary.summary_shard_id)
      }),
      makeCheck({
        check_id: 'context_snapshot_high_sufficiency',
        label: 'ContextSnapshot includes retrieval reasons and sufficient context',
        passed: contextSnapshot.context_sufficiency_score >= 0.8
          && (contextSnapshot.retrieval_reasons ?? []).length >= 3,
        evidence: [`score=${contextSnapshot.context_sufficiency_score}`]
      })
    ]),
    phaseResult('P8', 'nebula_projection_read_only', [
      makeCheck({
        check_id: 'nebula_allowed_node_types_only',
        label: 'NebulaProjection only contains allowed node types',
        passed: nebulaProjection.nodes.every((node) => nebulaProjection.allowed_node_types.includes(node.node_type)),
        evidence: unique(nebulaProjection.nodes.map((node) => node.node_type))
      }),
      makeCheck({
        check_id: 'nebula_read_only',
        label: 'NebulaProjection is read-only and forbids fact writes',
        passed: nebulaProjection.source_only === true
          && nebulaProjection.writes_fact_state === false
          && nebulaProjection.forbidden_operations.includes('write_relationship_state'),
        evidence: [`source_only=${nebulaProjection.source_only}`, `writes_fact_state=${nebulaProjection.writes_fact_state}`]
      })
    ]),
    phaseResult('P9', 'minimum_closed_loop_acceptance', [
      makeCheck({
        check_id: 'three_source_end_to_end',
        label: 'Desktop WeChat, browser snapshot and manual note are present end to end',
        passed: new Set(archives.map((archive) => `${archive.source_type}:${archive.platform}`)).size >= 3,
        evidence: archives.map((archive) => `${archive.source_type}:${archive.platform}`)
      }),
      makeCheck({
        check_id: 'sales_and_romance_domains',
        label: 'Sales and romance goal domains are both represented',
        passed: new Set(nestedEvents.map((event) => event.goal_domain)).size >= 2,
        evidence: unique(nestedEvents.map((event) => event.goal_domain))
      }),
      makeCheck({
        check_id: 'all_confirmation_gates_blocked',
        label: 'All confirmation gates remain blocked pending user confirmation',
        passed: confirmationGates.length >= 1
          && confirmationGates.every((gate) => gate.status === 'blocked_pending_user_confirmation' && gate.allowed_operations.length === 0),
        evidence: confirmationGates.map((gate) => `${gate.gate_id}:${gate.status}`)
      }),
      makeCheck({
        check_id: 'prewrite_gate_required_for_closed_loop',
        label: 'Closed-loop acceptance requires prewrite tag signature gate',
        passed: prewriteTagSignatureGate?.gate_decision === 'prewrite_tag_signature_gate_passed'
          && prewriteTagSignatureGate?.aggregate?.event_count === nestedEvents.length,
        evidence: [
          `gate_decision=${prewriteTagSignatureGate?.gate_decision ?? 'missing'}`,
          `gate_events=${prewriteTagSignatureGate?.aggregate?.event_count ?? 'missing'}`,
          `nested_events=${nestedEvents.length}`
        ]
      })
    ])
  ];
  if (learningWeightShadowReport) {
    results.push(phaseResult('P10', 'learning_weight_shadow_preparation', [
      makeCheck({
        check_id: 'shadow_report_only',
        label: 'Learning weight shadow output is report-only',
        passed: learningWeightShadowReport.mode === 'shadow_only'
          && learningWeightShadowReport.writes_fact_state === false
          && learningWeightShadowReport.comparison.every((item) =>
            item.allowed_effect === 'report_only' && item.applied_to_weight_profile === false
          ),
        evidence: [
          `mode=${learningWeightShadowReport.mode}`,
          `writes_fact_state=${learningWeightShadowReport.writes_fact_state}`,
          `comparison=${learningWeightShadowReport.comparison.length}`
        ]
      }),
      makeCheck({
        check_id: 'shadow_covers_rule_profiles',
        label: 'Shadow comparison covers every rule WeightProfile',
        passed: learningWeightShadowReport.comparison.length === weightProfiles.length,
        evidence: [
          `shadow_subjects=${learningWeightShadowReport.comparison.length}`,
          `weight_profiles=${weightProfiles.length}`
        ]
      }),
      makeCheck({
        check_id: 'promotion_gate_blocked',
        label: 'Learning-weight promotion remains blocked pending user confirmation',
        passed: learningWeightShadowReport.promotion_confirmation_gate?.gate_type === 'learning_weight_promotion'
          && learningWeightShadowReport.promotion_confirmation_gate?.status === 'blocked_pending_user_confirmation'
          && learningWeightShadowReport.promotion_confirmation_gate?.allowed_operations?.length === 0,
        evidence: [
          learningWeightShadowReport.promotion_confirmation_gate?.gate_id,
          learningWeightShadowReport.promotion_confirmation_gate?.status
        ]
      }),
      makeCheck({
        check_id: 'formal_consumers_ignore_shadow',
        label: 'ContextSnapshot and NebulaProjection do not consume shadow weight',
        passed: learningWeightShadowReport.read_only_consumers?.context_snapshot_uses_shadow === false
          && learningWeightShadowReport.read_only_consumers?.nebula_projection_uses_shadow === false
          && learningWeightShadowReport.read_only_consumers?.weight_profile_mutation_allowed === false,
        evidence: [
          `context_snapshot_uses_shadow=${learningWeightShadowReport.read_only_consumers?.context_snapshot_uses_shadow}`,
          `nebula_projection_uses_shadow=${learningWeightShadowReport.read_only_consumers?.nebula_projection_uses_shadow}`,
          `weight_profile_mutation_allowed=${learningWeightShadowReport.read_only_consumers?.weight_profile_mutation_allowed}`
        ]
      })
    ]));
  }
  return results;
}

function docs20Registered(root) {
  const target = 'docs/20-relationship-event-graph-phased-execution-plan.md';
  const files = [
    'examples/system-process-tree.json',
    'views/obsidian/system-process-tree.md',
    'views/obsidian/system-process-tree.canvas',
    'docs/15-系统流程树与扩展问题台账.md'
  ];
  return files.every((filePath) => {
    const fullPath = path.join(root, filePath);
    return existsSync(fullPath) && readFileSync(fullPath, 'utf8').includes(target);
  });
}

export function buildRelationshipEventGraphPhaseRun({
  root = projectRoot(),
  records = null,
  runId = `relationship_event_graph_phase_run_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`,
  outputDir = path.join(root, 'runtime/relationship-event-graph-phase-runs', runId),
  createdAt = nowIso(),
  includeP10Shadow = false
} = {}) {
  const sourceRecords = records ?? buildDefaultRelationshipEventGraphRecords({ root });
  const archiveRoot = path.join(outputDir, 'source-archives');
  const archiveBundles = sourceRecords.map((record) => buildSourceArchive(record, { root, archiveRoot, createdAt }));
  const archives = archiveBundles.map((bundle) => bundle.archive);
  const episodes = archiveBundles.map((bundle) => buildSourceEpisode({ archive: bundle.archive, record: bundle.record, createdAt }));
  const rawEvents = archiveBundles.map((bundle, index) => buildRawEvent({
    archive: bundle.archive,
    episode: episodes[index],
    record: bundle.record,
    createdAt
  }));
  const semanticEvents = rawEvents.map((rawEvent) => buildSemanticEvent(rawEvent, { createdAt }));
  const nestedEvents = semanticEvents.flatMap((semanticEvent) => {
    const rawEvent = rawEvents.find((item) => item.event_id === semanticEvent.raw_event_ids[0]);
    return buildNestedEvents(semanticEvent, rawEvent, { createdAt });
  });
  const confirmationGates = buildConfirmationGates(nestedEvents, { createdAt });
  const sourceByArchiveId = new Map(archives.map((archive) => [archive.source_archive_id, archive]));
  const weightProfiles = [
    ...semanticEvents.map((event) => buildWeightProfileForEvent(
      {
        ...event,
        goal_domain: event.metadata.goal_domain,
        evidence_refs: rawEvents.find((rawEvent) => rawEvent.event_id === event.raw_event_ids[0])?.evidence_refs ?? []
      },
      sourceByArchiveId.get(event.metadata.source_archive_id),
      { createdAt }
    )),
    ...nestedEvents.map((event) => buildWeightProfileForEvent(
      event,
      sourceByArchiveId.get(event.source_archive_id),
      { createdAt }
    ))
  ];
  const indexes = buildIndexes({ archives, rawEvents, semanticEvents, nestedEvents, weightProfiles });
  const summaryShards = buildSummaryShards({ rawEvents, semanticEvents, nestedEvents, weightProfiles, createdAt });
  const contextSnapshot = buildContextSnapshot({
    runId,
    summaryShards,
    rawEvents,
    semanticEvents,
    nestedEvents,
    weightProfiles,
    confirmationGates,
    createdAt
  });
  const nebulaProjection = buildNebulaProjection({
    runId,
    archives,
    rawEvents,
    nestedEvents,
    weightProfiles,
    confirmationGates,
    indexes,
    createdAt
  });
  const prewriteTagSignatureGate = buildPrewriteTagSignatureGate({
    runId,
    rawEvents,
    nestedEvents,
    createdAt
  });
  const learningWeightShadowReport = includeP10Shadow
    ? buildLearningWeightShadowReport({
      runId,
      semanticEvents,
      nestedEvents,
      weightProfiles,
      confirmationGates,
      createdAt
    })
    : null;
  const phases = buildPhaseResults({
    root,
    docs20Registered: docs20Registered(root),
    archives,
    episodes,
    rawEvents,
    semanticEvents,
    nestedEvents,
    indexes,
    weightProfiles,
    summaryShards,
    contextSnapshot,
    nebulaProjection,
    confirmationGates,
    prewriteTagSignatureGate,
    learningWeightShadowReport
  });
  const required = unique(phases.flatMap((phase) => phase.required_failures.map((failure) => `${phase.phase_id}:${failure}`)));
  const warnings = unique(phases.flatMap((phase) => phase.warning_failures.map((failure) => `${phase.phase_id}:${failure}`)));
  const gateDecision = required.length
    ? 'relationship_event_graph_phase_run_failed'
    : includeP10Shadow
      ? 'relationship_event_graph_p10_shadow_ready'
      : 'relationship_event_graph_p9_ready';
  const artifacts = {
    source_archives: archives,
    source_episodes: episodes,
    raw_events: rawEvents,
    semantic_events: semanticEvents,
    nested_events: nestedEvents,
    confirmation_gates: confirmationGates,
    weight_profiles: weightProfiles,
    indexes,
    summary_shards: summaryShards,
    context_snapshot: contextSnapshot,
    nebula_projection: nebulaProjection,
    prewrite_tag_signature_gate: prewriteTagSignatureGate
  };
  if (learningWeightShadowReport) {
    artifacts.learning_weight_shadow_report = learningWeightShadowReport;
  }
  return {
    schema_version: 'relationship_event_graph_phase_run.v1',
    run_id: runId,
    created_at: createdAt,
    gate_decision: gateDecision,
    execution_scope: {
      requested_phases: includeP10Shadow ? P10_SHADOW_PHASE_IDS : PHASE_IDS,
      completed_through: required.length ? null : includeP10Shadow ? 'P10' : 'P9',
      p10_shadow_mode_executed: includeP10Shadow,
      p10_learning_weight_implemented: false,
      learning_weight_promotion_applied: false,
      real_execution_allowed: false,
      real_send_attempted: false,
      relationship_state_writes: 0,
      identity_merges_applied: 0,
      external_actions_executed: 0
    },
    sources: {
      output_dir: relative(root, outputDir),
      source_archive_root: relative(root, archiveRoot),
      input_source_count: sourceRecords.length
    },
    metrics: {
      source_archives: archives.length,
      source_episodes: episodes.length,
      raw_events: rawEvents.length,
      semantic_events: semanticEvents.length,
      nested_events: nestedEvents.length,
      confirmation_gates: confirmationGates.length,
      weight_profiles: weightProfiles.length,
      learning_weight_shadow_reports: learningWeightShadowReport ? 1 : 0,
      summary_shards: summaryShards.length,
      nebula_nodes: nebulaProjection.nodes.length,
      prewrite_gate_events: prewriteTagSignatureGate.aggregate.event_count,
      prewrite_gate_failures: prewriteTagSignatureGate.aggregate.failed_count
    },
    artifacts,
    phases,
    required_failures: required,
    warning_failures: warnings,
    continue_when: [
      'gate_decision=relationship_event_graph_p9_ready',
      'required_failures is empty',
      'all confirmation gates remain blocked pending user confirmation',
      includeP10Shadow
        ? 'learning weight promotion remains blocked until separate user confirmation'
        : 'P10 remains design-only until user confirmation'
    ],
    stop_or_adjust_when: [
      'Any phase required failure is present',
      'Any output loses source_archive_id traceability',
      'Any prewrite tag signature, evidence concision or original-text extraction check fails',
      'Any confirmation gate allows an operation before user approval',
      'NebulaProjection writes fact state or exposes forbidden operations',
      'LearningWeightShadowReport mutates WeightProfile, ContextSnapshot or NebulaProjection'
    ]
  };
}

export function validateRelationshipEventGraphPhaseRun(phaseRun) {
  const checks = [
    makeCheck({
      check_id: 'schema_version',
      label: 'Phase run uses relationship_event_graph_phase_run.v1',
      passed: phaseRun?.schema_version === 'relationship_event_graph_phase_run.v1',
      evidence: [`schema_version=${phaseRun?.schema_version}`]
    }),
    makeCheck({
      check_id: 'phase_completion_boundary',
      label: 'Phase run completed through P9 or confirmed P10 shadow mode',
      passed: ['P9', 'P10'].includes(phaseRun?.execution_scope?.completed_through),
      evidence: [`completed_through=${phaseRun?.execution_scope?.completed_through}`]
    }),
    makeCheck({
      check_id: 'no_external_or_relationship_side_effects',
      label: 'Run did not execute external actions, merge identities, promote learning weight or write relationship state',
      passed: phaseRun?.execution_scope?.real_execution_allowed === false
        && phaseRun?.execution_scope?.real_send_attempted === false
        && phaseRun?.execution_scope?.relationship_state_writes === 0
        && phaseRun?.execution_scope?.identity_merges_applied === 0
        && phaseRun?.execution_scope?.external_actions_executed === 0
        && phaseRun?.execution_scope?.p10_learning_weight_implemented === false
        && phaseRun?.execution_scope?.learning_weight_promotion_applied !== true,
      evidence: [
        `real_execution_allowed=${phaseRun?.execution_scope?.real_execution_allowed}`,
        `relationship_state_writes=${phaseRun?.execution_scope?.relationship_state_writes}`,
        `identity_merges_applied=${phaseRun?.execution_scope?.identity_merges_applied}`,
        `external_actions_executed=${phaseRun?.execution_scope?.external_actions_executed}`,
        `p10_learning_weight_implemented=${phaseRun?.execution_scope?.p10_learning_weight_implemented}`,
        `learning_weight_promotion_applied=${phaseRun?.execution_scope?.learning_weight_promotion_applied}`
      ]
    }),
    makeCheck({
      check_id: 'phase_required_failures_empty',
      label: 'No required failures remain',
      passed: Array.isArray(phaseRun?.required_failures) && phaseRun.required_failures.length === 0,
      evidence: [`required_failures=${phaseRun?.required_failures?.join(',') || 'none'}`]
    }),
    makeCheck({
      check_id: 'confirmation_gates_blocked',
      label: 'Confirmation gates are blocked pending user confirmation',
      passed: (phaseRun?.artifacts?.confirmation_gates ?? []).every((gate) =>
        gate.status === 'blocked_pending_user_confirmation' && gate.allowed_operations.length === 0
      ),
      evidence: (phaseRun?.artifacts?.confirmation_gates ?? []).map((gate) => `${gate.gate_id}:${gate.status}`)
    }),
    makeCheck({
      check_id: 'nebula_read_only',
      label: 'Nebula projection is read-only',
      passed: phaseRun?.artifacts?.nebula_projection?.source_only === true
        && phaseRun?.artifacts?.nebula_projection?.writes_fact_state === false,
      evidence: [
        `source_only=${phaseRun?.artifacts?.nebula_projection?.source_only}`,
        `writes_fact_state=${phaseRun?.artifacts?.nebula_projection?.writes_fact_state}`
      ]
    }),
    makeCheck({
      check_id: 'prewrite_tag_signature_gate',
      label: 'Prewrite tag signature gate passed for all nested events',
      passed: phaseRun?.artifacts?.prewrite_tag_signature_gate?.gate_decision === 'prewrite_tag_signature_gate_passed'
        && phaseRun?.artifacts?.prewrite_tag_signature_gate?.aggregate?.failed_count === 0
        && phaseRun?.artifacts?.prewrite_tag_signature_gate?.aggregate?.event_count === phaseRun?.artifacts?.nested_events?.length,
      evidence: [
        `gate_decision=${phaseRun?.artifacts?.prewrite_tag_signature_gate?.gate_decision ?? 'missing'}`,
        `event_count=${phaseRun?.artifacts?.prewrite_tag_signature_gate?.aggregate?.event_count ?? 'missing'}`,
        `failed_count=${phaseRun?.artifacts?.prewrite_tag_signature_gate?.aggregate?.failed_count ?? 'missing'}`,
        `nested_events=${phaseRun?.artifacts?.nested_events?.length ?? 'missing'}`
      ],
      fix: 'Run the prewrite tag signature gate and repair missing tag dimensions, long snippets, or unsafe write flags.'
    }),
    makeCheck({
      check_id: 'learning_weight_shadow_boundary',
      label: 'Learning-weight shadow report stays report-only when present',
      passed: !phaseRun?.artifacts?.learning_weight_shadow_report
        || (
          phaseRun.artifacts.learning_weight_shadow_report.mode === 'shadow_only'
          && phaseRun.artifacts.learning_weight_shadow_report.writes_fact_state === false
          && phaseRun.artifacts.learning_weight_shadow_report.read_only_consumers?.context_snapshot_uses_shadow === false
          && phaseRun.artifacts.learning_weight_shadow_report.read_only_consumers?.nebula_projection_uses_shadow === false
          && phaseRun.artifacts.learning_weight_shadow_report.read_only_consumers?.weight_profile_mutation_allowed === false
          && phaseRun.artifacts.learning_weight_shadow_report.promotion_confirmation_gate?.status === 'blocked_pending_user_confirmation'
          && phaseRun.artifacts.learning_weight_shadow_report.promotion_confirmation_gate?.allowed_operations?.length === 0
        ),
      evidence: [
        `shadow_present=${Boolean(phaseRun?.artifacts?.learning_weight_shadow_report)}`,
        `shadow_mode=${phaseRun?.artifacts?.learning_weight_shadow_report?.mode ?? 'none'}`,
        `promotion_gate_status=${phaseRun?.artifacts?.learning_weight_shadow_report?.promotion_confirmation_gate?.status ?? 'none'}`
      ]
    })
  ];
  const required = requiredFailures(checks);
  return {
    schema_version: 'relationship_event_graph_phase_validation.v1',
    validation_id: `relationship_event_graph_phase_validation_${Date.now()}`,
    created_at: nowIso(),
    gate_decision: required.length ? 'relationship_event_graph_phase_validation_failed' : 'relationship_event_graph_phase_validation_passed',
    checks,
    required_failures: required,
    warning_failures: warningFailures(checks)
  };
}

export function renderRelationshipEventGraphPhaseRunMarkdown(phaseRun) {
  const phaseRows = phaseRun.phases
    .map((phase) => `| ${phase.phase_id} | ${phase.label} | ${phase.gate_decision} | ${phase.required_failures.join(', ') || 'none'} |`)
    .join('\n');
  const shadowReport = phaseRun.artifacts.learning_weight_shadow_report ?? null;
  return `# Relationship Event Graph Phase Run

- run_id: ${phaseRun.run_id}
- created_at: ${phaseRun.created_at}
- gate_decision: ${phaseRun.gate_decision}
- completed_through: ${phaseRun.execution_scope.completed_through ?? 'not complete'}
- required_failures: ${phaseRun.required_failures.join(', ') || 'none'}
- warning_failures: ${phaseRun.warning_failures.join(', ') || 'none'}
- real_execution_allowed: ${phaseRun.execution_scope.real_execution_allowed}
- relationship_state_writes: ${phaseRun.execution_scope.relationship_state_writes}
- identity_merges_applied: ${phaseRun.execution_scope.identity_merges_applied}
- external_actions_executed: ${phaseRun.execution_scope.external_actions_executed}
- p10_shadow_mode_executed: ${phaseRun.execution_scope.p10_shadow_mode_executed}
- p10_learning_weight_implemented: ${phaseRun.execution_scope.p10_learning_weight_implemented}
- learning_weight_promotion_applied: ${phaseRun.execution_scope.learning_weight_promotion_applied}

## Metrics

- source_archives: ${phaseRun.metrics.source_archives}
- source_episodes: ${phaseRun.metrics.source_episodes}
- raw_events: ${phaseRun.metrics.raw_events}
- semantic_events: ${phaseRun.metrics.semantic_events}
- nested_events: ${phaseRun.metrics.nested_events}
- confirmation_gates: ${phaseRun.metrics.confirmation_gates}
- weight_profiles: ${phaseRun.metrics.weight_profiles}
- learning_weight_shadow_reports: ${phaseRun.metrics.learning_weight_shadow_reports}
- summary_shards: ${phaseRun.metrics.summary_shards}
- nebula_nodes: ${phaseRun.metrics.nebula_nodes}
- prewrite_tag_signature_gate: ${phaseRun.artifacts.prewrite_tag_signature_gate?.gate_decision ?? 'missing'}
- prewrite_gate_events: ${phaseRun.artifacts.prewrite_tag_signature_gate?.aggregate?.event_count ?? 'missing'}
- prewrite_gate_failed: ${phaseRun.artifacts.prewrite_tag_signature_gate?.aggregate?.failed_count ?? 'missing'}

## Phases

| Phase | Label | Decision | Required Failures |
| --- | --- | --- | --- |
${phaseRows}

## Confirmation Gates

${phaseRun.artifacts.confirmation_gates.map((gate) => `- ${gate.gate_id}: ${gate.status}; allowed_operations=${gate.allowed_operations.length}`).join('\n') || '- none'}

## Learning Weight Shadow

${shadowReport ? [
    `- shadow_report_id: ${shadowReport.shadow_report_id}`,
    `- mode: ${shadowReport.mode}`,
    `- status: ${shadowReport.status}`,
    `- comparison_count: ${shadowReport.comparison.length}`,
    `- max_abs_delta: ${shadowReport.aggregate.max_abs_delta}`,
    `- changed_level_count: ${shadowReport.aggregate.changed_level_count}`,
    `- writes_fact_state: ${shadowReport.writes_fact_state}`,
    `- promotion_gate: ${shadowReport.promotion_confirmation_gate.gate_id}; ${shadowReport.promotion_confirmation_gate.status}; allowed_operations=${shadowReport.promotion_confirmation_gate.allowed_operations.length}`
  ].join('\n') : '- not executed'}

## Continue When

${phaseRun.continue_when.map((item) => `- ${item}`).join('\n')}

## Stop Or Adjust When

${phaseRun.stop_or_adjust_when.map((item) => `- ${item}`).join('\n')}
`;
}

export function writeRelationshipEventGraphPhaseRun({
  phaseRun,
  outputDir = path.join(projectRoot(), 'runtime/relationship-event-graph-phase-runs', phaseRun?.run_id ?? `relationship_event_graph_phase_run_${Date.now()}`),
  root = projectRoot()
} = {}) {
  if (!phaseRun) throw new Error('writeRelationshipEventGraphPhaseRun requires phaseRun');
  ensureDir(outputDir);
  const jsonPath = path.join(outputDir, 'relationship-event-graph-phase-run.json');
  const markdownPath = path.join(outputDir, 'relationship-event-graph-phase-run.md');
  writeJsonAtomic(jsonPath, phaseRun);
  writeText(markdownPath, renderRelationshipEventGraphPhaseRunMarkdown(phaseRun));

  const artifactsDir = path.join(outputDir, 'artifacts');
  ensureDir(artifactsDir);
  for (const [name, value] of Object.entries(phaseRun.artifacts)) {
    writeJsonAtomic(path.join(artifactsDir, `${name.replaceAll('_', '-')}.json`), value);
  }

  const statusDir = path.join(root, 'runtime/relationship-event-graph-execution-state');
  ensureDir(statusDir);
  const phaseStatus = {
    schema_version: 'relationship_event_graph_phase_status.v1',
    updated_at: nowIso(),
    status: phaseRun.gate_decision === 'relationship_event_graph_p10_shadow_ready'
      ? 'execution_completed_p10_shadow_pending_learning_weight_promotion_confirmation'
      : phaseRun.gate_decision === 'relationship_event_graph_p9_ready'
        ? 'execution_completed_p9'
        : 'phase_blocked',
    latest_run_id: phaseRun.run_id,
    latest_run_path: relative(root, jsonPath),
    completed_through: phaseRun.execution_scope.completed_through,
    required_failures: phaseRun.required_failures,
    next_phase_allowed: phaseRun.required_failures.length === 0
      && phaseRun.execution_scope.completed_through !== 'P10',
    p10_requires_separate_user_confirmation: phaseRun.execution_scope.completed_through !== 'P10',
    learning_weight_promotion_requires_separate_user_confirmation: true,
    learning_weight_promotion_allowed: false,
    promotion_confirmation_gate_id: phaseRun.artifacts.learning_weight_shadow_report?.promotion_confirmation_gate?.gate_id ?? null
  };
  const statusJsonPath = path.join(statusDir, 'phase-status.json');
  const statusMarkdownPath = path.join(statusDir, 'phase-status.md');
  writeJsonAtomic(statusJsonPath, phaseStatus);
  writeText(statusMarkdownPath, `# Relationship Event Graph Phase Status

- status: ${phaseStatus.status}
- latest_run_id: ${phaseStatus.latest_run_id}
- completed_through: ${phaseStatus.completed_through ?? 'not complete'}
- required_failures: ${phaseStatus.required_failures.join(', ') || 'none'}
- p10_requires_separate_user_confirmation: ${phaseStatus.p10_requires_separate_user_confirmation}
- learning_weight_promotion_requires_separate_user_confirmation: ${phaseStatus.learning_weight_promotion_requires_separate_user_confirmation}
- learning_weight_promotion_allowed: ${phaseStatus.learning_weight_promotion_allowed}
- promotion_confirmation_gate_id: ${phaseStatus.promotion_confirmation_gate_id ?? 'none'}
`);

  return {
    json_path: jsonPath,
    markdown_path: markdownPath,
    artifacts_dir: artifactsDir,
    status_json_path: statusJsonPath,
    status_markdown_path: statusMarkdownPath,
    gate_decision: phaseRun.gate_decision,
    required_failures: phaseRun.required_failures
  };
}

export function latestPhaseRunPath({
  root = projectRoot(),
  runsDir = path.join(root, 'runtime/relationship-event-graph-phase-runs')
} = {}) {
  if (!existsSync(runsDir)) return null;
  const candidates = readdirSync(runsDir)
    .map((name) => path.join(runsDir, name, 'relationship-event-graph-phase-run.json'))
    .filter((filePath) => existsSync(filePath))
    .sort();
  return candidates.at(-1) ?? null;
}
