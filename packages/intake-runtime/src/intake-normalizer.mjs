import { createHash } from 'node:crypto';

const SOURCE_TYPES = new Set(['desktop', 'browser', 'api', 'file', 'ocr', 'webhook']);
const PRIVACY_LEVELS = new Set([
  'summary_only',
  'redacted_text',
  'raw_text_allowed',
  'artifact_allowed'
]);
const SOURCE_ACTOR_TYPES = new Set([
  'human_contact',
  'official_account',
  'service_account',
  'group_chat',
  'system_notification',
  'unknown'
]);
const DEFAULT_CONTENT_FINGERPRINT_WINDOW_MS = 5 * 60 * 1000;
const GENERIC_THREAD_TITLES = new Set([
  'wechat',
  'weixin',
  'pc wechat',
  '微信',
  '企业微信',
  'wecom',
  'desktop',
  'browser',
  'web'
]);
const SELF_PARTICIPANT_HINTS = new Set([
  'user',
  'self',
  'me',
  '我',
  '我方',
  '我方用户'
]);

export function nowIso() {
  return new Date().toISOString();
}

function requireObject(value, entityName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${entityName} must be an object`);
  }
}

function requireString(record, field, entityName) {
  if (typeof record[field] !== 'string' || record[field].trim() === '') {
    throw new Error(`${entityName} missing required string: ${field}`);
  }
}

function requireBoolean(record, field, entityName) {
  if (typeof record[field] !== 'boolean') {
    throw new Error(`${entityName}.${field} must be a boolean`);
  }
}

function requireArray(record, field, entityName) {
  if (!Array.isArray(record[field])) {
    throw new Error(`${entityName}.${field} must be an array`);
  }
}

export function stableSlug(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'unknown';
}

function sha256Text(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function firstNonEmpty(values) {
  return values
    .map((value) => (value === undefined || value === null ? '' : String(value).trim()))
    .find((value) => value.length > 0) ?? null;
}

function normalizeFingerprintText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeIdentityComponent(value) {
  return normalizeFingerprintText(value)
    .replace(/^@+/, '')
    .replace(/\s+/g, ' ');
}

function isGenericThreadTitle(value) {
  const normalized = normalizeIdentityComponent(value);
  return !normalized || GENERIC_THREAD_TITLES.has(normalized);
}

export function normalizeSourceActorType(value) {
  const normalized = String(value ?? 'unknown').trim();
  if (!SOURCE_ACTOR_TYPES.has(normalized)) {
    throw new Error(`IntakeObservation.source_actor_type is invalid: ${normalized}`);
  }
  return normalized;
}

function threadKeyFromObservation(observation) {
  const thread = observation.thread_hint ?? {};
  const windowRef = observation.window_ref ?? {};
  const stableThreadKey = firstNonEmpty([
    thread.thread_key,
    thread.conversation_id,
    thread.chat_id,
    thread.room_id,
    thread.channel_id,
    thread.url,
    thread.page_url,
    thread.record_id && thread.endpoint ? `${thread.endpoint}:${thread.record_id}` : null,
    thread.record_id
  ]);
  if (stableThreadKey) return normalizeIdentityComponent(stableThreadKey);

  const displayThreadKey = firstNonEmpty([
    thread.target_display_name,
    thread.conversation_title,
    thread.thread_title,
    thread.page_title,
    thread.title,
    windowRef.target_display_name,
    windowRef.conversation_title,
    windowRef.window_title
  ]);
  if (!displayThreadKey || isGenericThreadTitle(displayThreadKey)) return null;
  return normalizeIdentityComponent(displayThreadKey);
}

function sourceIdentityKeyFromObservation(observation) {
  const hint = (observation.source_identity_hints ?? [])
    .find((item) => firstNonEmpty([
      item.handle,
      item.platform_handle,
      item.value_hash,
      item.thread_key,
      item.display_name,
      item.remark_name,
      item.nickname
    ]));
  if (hint) {
    return normalizeIdentityComponent(firstNonEmpty([
      hint.handle,
      hint.platform_handle,
      hint.value_hash,
      hint.thread_key,
      hint.display_name,
      hint.remark_name,
      hint.nickname
    ]));
  }

  const participant = (observation.participants_hint ?? [])
    .find((item) => {
      const normalized = normalizeIdentityComponent(item);
      return normalized && !SELF_PARTICIPANT_HINTS.has(normalized) && !isGenericThreadTitle(normalized);
    });
  return participant ? normalizeIdentityComponent(participant) : null;
}

function speakerKeyFromObservation(observation) {
  const thread = observation.thread_hint ?? {};
  const metadata = observation.metadata ?? {};
  return normalizeIdentityComponent(firstNonEmpty([
    metadata.speaker_person_id,
    metadata.speaker_id,
    metadata.sender_person_id,
    metadata.sender_display_name,
    metadata.speaker_hint,
    thread.speaker_person_id,
    thread.sender_person_id,
    thread.sender_display_name,
    thread.speaker_hint,
    observation.source_actor_type === 'human_contact' ? sourceIdentityKeyFromObservation(observation) : null
  ]));
}

function timeWindowStart(capturedAt, windowMs) {
  const timestamp = Date.parse(capturedAt);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(Math.floor(timestamp / windowMs) * windowMs).toISOString();
}

export function normalizeSourceAdapterCapability(capability) {
  requireObject(capability, 'SourceAdapterCapability');
  requireString(capability, 'adapter_id', 'SourceAdapterCapability');
  requireString(capability, 'adapter_version', 'SourceAdapterCapability');
  requireString(capability, 'source_type', 'SourceAdapterCapability');
  requireString(capability, 'platform', 'SourceAdapterCapability');

  if (!SOURCE_TYPES.has(capability.source_type)) {
    throw new Error(`SourceAdapterCapability.source_type is invalid: ${capability.source_type}`);
  }

  requireObject(capability.capabilities, 'SourceAdapterCapability.capabilities');
  for (const field of [
    'can_receive',
    'can_send',
    'can_capture_screenshot',
    'can_read_dom',
    'can_identify_thread',
    'can_verify_target',
    'requires_user_confirmation'
  ]) {
    requireBoolean(capability.capabilities, field, 'SourceAdapterCapability.capabilities');
  }

  if (!capability.capabilities.can_receive && !capability.capabilities.can_send) {
    throw new Error('SourceAdapterCapability must support at least receive or send');
  }

  return {
    metadata: {},
    ...capability,
    adapter_id: capability.adapter_id.trim(),
    adapter_version: capability.adapter_version.trim(),
    source_type: capability.source_type.trim(),
    platform: capability.platform.trim(),
    capabilities: { ...capability.capabilities }
  };
}

export function normalizeIntakeObservation(observation) {
  requireObject(observation, 'IntakeObservation');
  for (const field of [
    'observation_id',
    'source_adapter_id',
    'source_type',
    'platform',
    'captured_at',
    'content_summary',
    'privacy_level'
  ]) {
    requireString(observation, field, 'IntakeObservation');
  }

  if (!SOURCE_TYPES.has(observation.source_type)) {
    throw new Error(`IntakeObservation.source_type is invalid: ${observation.source_type}`);
  }
  if (!PRIVACY_LEVELS.has(observation.privacy_level)) {
    throw new Error(`IntakeObservation.privacy_level is invalid: ${observation.privacy_level}`);
  }

  const confidence = Number(observation.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('IntakeObservation.confidence must be a number between 0 and 1');
  }

  const normalized = {
    participants_hint: [],
    source_identity_hints: [],
    raw_artifact_refs: [],
    metadata: {},
    ...observation,
    observation_id: observation.observation_id.trim(),
    source_adapter_id: observation.source_adapter_id.trim(),
    source_type: observation.source_type.trim(),
    platform: observation.platform.trim(),
    captured_at: observation.captured_at.trim(),
    content_summary: observation.content_summary.trim(),
    source_actor_type: normalizeSourceActorType(
      observation.source_actor_type
      ?? observation.metadata?.source_actor_type
      ?? observation.thread_hint?.source_actor_type
      ?? observation.source_identity_hints?.find((hint) => hint.source_actor_type)?.source_actor_type
      ?? 'unknown'
    ),
    privacy_level: observation.privacy_level.trim(),
    confidence
  };

  requireArray(normalized, 'participants_hint', 'IntakeObservation');
  requireArray(normalized, 'source_identity_hints', 'IntakeObservation');
  requireArray(normalized, 'raw_artifact_refs', 'IntakeObservation');

  if (normalized.content_text !== undefined && typeof normalized.content_text !== 'string') {
    throw new Error('IntakeObservation.content_text must be a string when present');
  }
  if (normalized.thread_hint !== undefined) requireObject(normalized.thread_hint, 'IntakeObservation.thread_hint');
  if (normalized.window_ref !== undefined) requireObject(normalized.window_ref, 'IntakeObservation.window_ref');
  for (const hint of normalized.source_identity_hints) {
    requireObject(hint, 'IntakeObservation.source_identity_hints[]');
  }
  requireObject(normalized.metadata, 'IntakeObservation.metadata');

  return normalized;
}

export function observationSource(observation) {
  const normalized = normalizeIntakeObservation(observation);
  return `${normalized.source_type}:${normalized.source_adapter_id}:${normalized.platform}`;
}

export function buildObservationContentFingerprint(observation, {
  windowMs = DEFAULT_CONTENT_FINGERPRINT_WINDOW_MS
} = {}) {
  const normalized = normalizeIntakeObservation(observation);
  const normalizedText = normalizeFingerprintText(normalized.content_text || normalized.content_summary);
  const threadKey = threadKeyFromObservation(normalized);
  const speakerKey = speakerKeyFromObservation(normalized);
  const windowStart = timeWindowStart(normalized.captured_at, windowMs);
  const screenshotHash = firstNonEmpty([
    normalized.screenshot_hash,
    normalized.metadata?.screenshot_hash
  ]);
  const missingRequired = [
    !normalized.platform ? 'platform' : null,
    !threadKey ? 'thread_key' : null,
    !windowStart ? 'captured_at_time_window' : null,
    !speakerKey ? 'speaker_key' : null,
    !normalizedText ? 'normalized_text' : null,
    !screenshotHash ? 'screenshot_hash' : null
  ].filter(Boolean);
  const components = {
    source_type: normalized.source_type,
    platform: normalizeIdentityComponent(normalized.platform),
    source_actor_type: normalized.source_actor_type,
    thread_key: threadKey,
    time_window_start_at: windowStart,
    time_window_ms: windowMs,
    speaker_key: speakerKey,
    normalized_text_sha256: normalizedText ? sha256Text(normalizedText) : null,
    screenshot_hash: screenshotHash ? normalizeIdentityComponent(screenshotHash) : null
  };
  const fingerprint = missingRequired.length === 0
    ? `sha256:${sha256Text(JSON.stringify(components))}`
    : null;

  return {
    schema_version: 'observation_content_fingerprint.v1',
    strategy: 'strict_platform_thread_time_speaker_text_screenshot.v1',
    fingerprint,
    dedupe_ready: missingRequired.length === 0,
    missing_required: missingRequired,
    components,
    normalized_text_chars: normalizedText.length
  };
}

function observationGroupSummary({ entries, dedupeLevel, contentFingerprint = null }) {
  const first = entries[0];
  return {
    dedupe_level: dedupeLevel,
    observation_id: first.observation.observation_id,
    observation_ids: entries.map((entry) => entry.observation.observation_id),
    count: entries.length,
    source_type: first.observation.source_type,
    platform: first.observation.platform,
    source_actor_type: first.observation.source_actor_type,
    representative_path: first.path,
    paths: entries.map((entry) => entry.path).filter(Boolean),
    content_fingerprint: contentFingerprint,
    operator_confirmation_required: dedupeLevel !== 'observation_id'
  };
}

export function summarizeObservationDeduplication({
  observations,
  observationPaths = []
}) {
  if (!Array.isArray(observations)) {
    throw new Error('summarizeObservationDeduplication.observations must be an array');
  }
  const entries = observations.map((observation, index) => {
    const normalized = normalizeIntakeObservation(observation);
    return {
      entry_id: `entry_${index}`,
      observation: normalized,
      path: observationPaths[index] ?? null,
      content_fingerprint: buildObservationContentFingerprint(normalized)
    };
  });

  const idGroups = entries.reduce((acc, entry) => {
    const key = entry.observation.observation_id;
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(entry);
    return acc;
  }, new Map());
  const idDuplicateGroups = [...idGroups.values()]
    .filter((items) => items.length > 1)
    .map((items) => observationGroupSummary({
      entries: items,
      dedupeLevel: 'observation_id',
      contentFingerprint: items[0].content_fingerprint
    }));
  const idRepresentatives = [...idGroups.values()].map((items) => items[0]);

  const fingerprintGroups = idRepresentatives.reduce((acc, entry) => {
    const fingerprint = entry.content_fingerprint;
    const key = fingerprint.dedupe_ready ? fingerprint.fingerprint : null;
    if (!key) return acc;
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(entry);
    return acc;
  }, new Map());
  const suppressedEntryIds = new Set();
  const fingerprintDuplicateGroups = [...fingerprintGroups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([fingerprint, items]) => {
      for (const duplicate of items.slice(1)) suppressedEntryIds.add(duplicate.entry_id);
      return observationGroupSummary({
        entries: items,
        dedupeLevel: 'strict_content_fingerprint',
        contentFingerprint: {
          ...items[0].content_fingerprint,
          fingerprint
        }
      });
    });

  const effectiveEntries = idRepresentatives.filter((entry) => !suppressedEntryIds.has(entry.entry_id));
  const observationGroups = [...idGroups.values()]
    .map((items) => observationGroupSummary({
      entries: items,
      dedupeLevel: 'observation_id',
      contentFingerprint: items[0].content_fingerprint
    }))
    .sort((a, b) => String(a.observation_id).localeCompare(String(b.observation_id)));

  return {
    schema_version: 'observation_deduplication_summary.v1',
    strategy: 'observation_id_then_strict_content_fingerprint.v1',
    raw_observation_count: entries.length,
    effective_observation_count: effectiveEntries.length,
    duplicate_suppressed_count: entries.length - effectiveEntries.length,
    duplicate_observation_groups: [
      ...idDuplicateGroups,
      ...fingerprintDuplicateGroups
    ],
    content_fingerprint_ready_count: entries.filter((entry) => entry.content_fingerprint.dedupe_ready).length,
    content_fingerprint_duplicate_groups: fingerprintDuplicateGroups,
    observation_groups: observationGroups,
    effective_observations: effectiveEntries.map((entry) => entry.observation),
    effective_observation_paths: effectiveEntries.map((entry) => entry.path).filter(Boolean),
    raw_observation_paths: observationPaths,
    entries
  };
}
