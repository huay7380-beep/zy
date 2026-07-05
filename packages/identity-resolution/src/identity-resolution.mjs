import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendObservationAsRawEvent,
  normalizeIntakeObservation
} from '../../intake-runtime/src/index.mjs';
import {
  loadStorageSnapshot,
  rebuildEventIndexes
} from '../../storage-runtime/src/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_VERSION = 'identity_resolution.v1';
const USER_HINTS = new Set(['user', 'me', 'self', '我', '本人']);
const UNKNOWN_HINTS = new Set(['unknown', 'unknown_counterparty', 'counterparty_or_system', 'fake_counterparty']);

function projectRoot() {
  return path.resolve(here, '../../..');
}

function nowIso() {
  return new Date().toISOString();
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
  if (!existsSync(filePath)) writeJsonAtomic(filePath, initialValue);
}

function ensureTextFile(filePath) {
  ensureDir(path.dirname(filePath));
  if (!existsSync(filePath)) writeFileSync(filePath, '', 'utf8');
}

function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function appendJsonl(filePath, record) {
  ensureTextFile(filePath);
  appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

export function sha256Text(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

export function normalizeIdentityText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[()（）【】\[\]{}<>《》"'“”‘’]/g, '');
}

function stableId(prefix, parts) {
  return `${prefix}_${sha256Text(parts.map((part) => String(part ?? '')).join('|')).slice(0, 16)}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function asIdentityStore(options = {}) {
  if (options.paths?.channelIdentities) return options;
  const storage = options.storage ?? null;
  const root = options.root ?? storage?.root ?? projectRoot();
  const dataDir = options.dataDir ?? storage?.dataDir ?? path.join(root, 'data');
  return {
    root,
    dataDir,
    paths: {
      channelIdentities: path.join(dataDir, 'people/channel-identities.json'),
      personIdentityLinks: path.join(dataDir, 'people/person-identity-links.json'),
      identityConfirmationQueue: path.join(dataDir, 'people/identity-confirmation-queue.jsonl'),
      identityPersonIndex: path.join(dataDir, 'indexes/identity-person-index.json'),
      channelIdentityIndex: path.join(dataDir, 'indexes/channel-identity-index.json'),
      threadPersonIndex: path.join(dataDir, 'indexes/thread-person-index.json'),
      identityAudit: path.join(dataDir, 'audit/identity-resolution-audit.jsonl')
    }
  };
}

export function createIdentityStore(options = {}) {
  return asIdentityStore(options);
}

function emptyIndex(indexType) {
  return {
    schema_version: SCHEMA_VERSION,
    index_type: indexType,
    rebuilt_at: null,
    source_counts: {
      channel_identities: 0,
      person_identity_links: 0
    },
    entries: {}
  };
}

function writeIdentityAudit(store, audit) {
  const normalized = {
    audit_id: audit.audit_id ?? stableId('identity_audit', [audit.action, audit.entity_id, Date.now()]),
    actor: 'identity-resolution',
    occurred_at: nowIso(),
    result: 'success',
    ...audit
  };
  appendJsonl(store.paths.identityAudit, normalized);
  return normalized;
}

export function initializeIdentityStore(options = {}) {
  const store = asIdentityStore(options);
  ensureJsonFile(store.paths.channelIdentities, {
    schema_version: SCHEMA_VERSION,
    channel_identities: []
  });
  ensureJsonFile(store.paths.personIdentityLinks, {
    schema_version: SCHEMA_VERSION,
    person_identity_links: []
  });
  ensureTextFile(store.paths.identityConfirmationQueue);
  ensureJsonFile(store.paths.identityPersonIndex, emptyIndex('identity_person'));
  ensureJsonFile(store.paths.channelIdentityIndex, emptyIndex('channel_identity'));
  ensureJsonFile(store.paths.threadPersonIndex, emptyIndex('thread_person'));
  ensureTextFile(store.paths.identityAudit);
  writeIdentityAudit(store, {
    action: 'init_identity_store',
    entity_type: 'identity_store',
    entity_id: store.dataDir,
    source_file: store.dataDir
  });
  return store;
}

function searchKeysForIdentity(identity) {
  return unique([
    identity.normalized_display_name ? `${identity.platform}:display:${identity.normalized_display_name}` : null,
    identity.normalized_handle ? `${identity.platform}:handle:${identity.normalized_handle}` : null,
    identity.value_hash ? `${identity.platform}:hash:${identity.value_hash}` : null,
    identity.thread_key ? `${identity.platform}:thread:${identity.thread_key}` : null
  ]);
}

export function normalizeChannelIdentity(identity) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    throw new Error('ChannelIdentity must be an object');
  }
  const platform = String(identity.platform ?? '').trim();
  if (!platform) throw new Error('ChannelIdentity missing platform');
  const displayName = identity.display_name === undefined || identity.display_name === null
    ? null
    : String(identity.display_name).trim();
  const handle = identity.handle === undefined || identity.handle === null
    ? null
    : String(identity.handle).trim();
  const valueHash = identity.raw_value !== undefined
    ? sha256Text(identity.raw_value)
    : (identity.value_hash ?? null);
  const normalizedDisplayName = identity.normalized_display_name ?? (displayName ? normalizeIdentityText(displayName) : null);
  const normalizedHandle = identity.normalized_handle ?? (handle ? normalizeIdentityText(handle) : null);
  const threadKey = identity.thread_key ? String(identity.thread_key).trim() : null;
  const identityType = identity.identity_type
    ?? (valueHash ? 'phone_hash' : (handle ? 'handle' : (displayName ? 'display_name' : (threadKey ? 'thread' : 'unknown'))));
  const channelIdentityId = identity.channel_identity_id
    ?? stableId('channel_identity', [platform, identityType, normalizedDisplayName, normalizedHandle, valueHash, threadKey]);

  return {
    source_observation_ids: [],
    evidence_refs: [],
    verification_status: 'candidate',
    confidence: 0.5,
    created_at: nowIso(),
    updated_at: nowIso(),
    metadata: {},
    ...identity,
    raw_value: undefined,
    channel_identity_id: channelIdentityId,
    platform,
    identity_type: identityType,
    display_name: displayName,
    normalized_display_name: normalizedDisplayName,
    handle,
    normalized_handle: normalizedHandle,
    value_hash: valueHash,
    organization_hint: identity.organization_hint ?? null,
    thread_key: threadKey,
    source_observation_ids: unique(identity.source_observation_ids ?? []),
    evidence_refs: unique(identity.evidence_refs ?? []),
    verification_status: identity.verification_status ?? 'candidate',
    confidence: clamp(identity.confidence ?? 0.5),
    updated_at: identity.updated_at ?? nowIso(),
    metadata: identity.metadata ?? {}
  };
}

export function normalizePersonIdentityLink(link) {
  if (!link || typeof link !== 'object' || Array.isArray(link)) {
    throw new Error('PersonIdentityLink must be an object');
  }
  for (const field of ['person_id', 'channel_identity_id', 'platform']) {
    if (typeof link[field] !== 'string' || !link[field].trim()) {
      throw new Error(`PersonIdentityLink missing ${field}`);
    }
  }
  const status = link.status ?? (link.verified ? 'confirmed' : 'candidate');
  return {
    evidence_refs: [],
    thread_keys: [],
    created_at: nowIso(),
    updated_at: nowIso(),
    metadata: {},
    ...link,
    link_id: link.link_id ?? stableId('identity_link', [link.person_id, link.channel_identity_id]),
    person_id: link.person_id.trim(),
    channel_identity_id: link.channel_identity_id.trim(),
    platform: link.platform.trim(),
    status,
    confidence: clamp(link.confidence ?? (status === 'confirmed' ? 0.95 : 0.65)),
    verified: Boolean(link.verified ?? status === 'confirmed'),
    confirmed_by: link.confirmed_by ?? null,
    confirmed_at: link.confirmed_at ?? (status === 'confirmed' ? nowIso() : null),
    evidence_refs: unique(link.evidence_refs ?? []),
    thread_keys: unique(link.thread_keys ?? []),
    updated_at: link.updated_at ?? nowIso(),
    metadata: link.metadata ?? {}
  };
}

function upsertById(items, incoming, idField) {
  const byId = new Map(items.map((item) => [item[idField], item]));
  for (const item of incoming) {
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

export function upsertChannelIdentities(storeOrOptions, identities, { actor = 'identity-resolution' } = {}) {
  const store = asIdentityStore(storeOrOptions);
  const normalized = identities.map(normalizeChannelIdentity);
  const current = readJson(store.paths.channelIdentities, { schema_version: SCHEMA_VERSION, channel_identities: [] });
  const next = {
    schema_version: current.schema_version ?? SCHEMA_VERSION,
    channel_identities: upsertById(current.channel_identities ?? [], normalized, 'channel_identity_id')
  };
  writeJsonAtomic(store.paths.channelIdentities, next);
  writeIdentityAudit(store, {
    action: 'upsert_channel_identities',
    entity_type: 'channel_identity',
    entity_id: normalized.map((item) => item.channel_identity_id).join(','),
    actor,
    source_file: store.paths.channelIdentities,
    metadata: { count: normalized.length }
  });
  return next;
}

export function upsertPersonIdentityLinks(storeOrOptions, links, { actor = 'identity-resolution' } = {}) {
  const store = asIdentityStore(storeOrOptions);
  const normalized = links.map(normalizePersonIdentityLink);
  const current = readJson(store.paths.personIdentityLinks, { schema_version: SCHEMA_VERSION, person_identity_links: [] });
  const next = {
    schema_version: current.schema_version ?? SCHEMA_VERSION,
    person_identity_links: upsertById(current.person_identity_links ?? [], normalized, 'link_id')
  };
  writeJsonAtomic(store.paths.personIdentityLinks, next);
  writeIdentityAudit(store, {
    action: 'upsert_person_identity_links',
    entity_type: 'person_identity_link',
    entity_id: normalized.map((item) => item.link_id).join(','),
    actor,
    source_file: store.paths.personIdentityLinks,
    metadata: { count: normalized.length }
  });
  return next;
}

export function appendIdentityConfirmation(storeOrOptions, confirmation, { actor = 'identity-resolution' } = {}) {
  const store = asIdentityStore(storeOrOptions);
  const confirmationId = confirmation.confirmation_id
    ?? stableId('identity_confirmation', [confirmation.channel_identity_id, confirmation.source_observation_id, Date.now()]);
  const candidates = (confirmation.candidates ?? []).map((candidate) => ({
    ...candidate,
    status: candidate.status === 'candidate' ? 'queued_for_confirmation' : candidate.status
  }));
  const evidenceRefs = unique([
    ...(confirmation.evidence_refs ?? []),
    confirmation.source_observation_id,
    ...candidates.flatMap((candidate) => candidate.metadata?.evidence_refs ?? [])
  ]);
  const normalized = {
    confirmation_id: confirmationId,
    schema_version: SCHEMA_VERSION,
    queue_entry_type: 'identity_confirmation_request',
    status: 'pending_user_confirmation',
    decision_status: 'pending',
    created_at: nowIso(),
    ...confirmation,
    candidates,
    evidence_refs: evidenceRefs,
    operator_next_actions: confirmation.operator_next_actions ?? [
      'Review candidate_person_id, match_reasons, confidence and evidence_refs.',
      'Confirm exactly one candidate with applyIdentityConfirmationDecision or reject all candidates.',
      'After confirmation, rerun identity resolution for the source_observation_id before using linked_person_ids.'
    ],
    resolution_retry_command: confirmation.resolution_retry_command ?? null,
    apply_decision_template: confirmation.apply_decision_template ?? {
      action: 'confirm_candidate',
      confirmation_id: confirmationId,
      candidate_id: candidates[0]?.candidate_id ?? '<candidate_id>',
      confirmed_by: '<operator_or_user_id>',
      evidence_refs: evidenceRefs
    },
    actor
  };
  appendJsonl(store.paths.identityConfirmationQueue, normalized);
  writeIdentityAudit(store, {
    action: 'queue_identity_confirmation',
    entity_type: 'identity_confirmation',
    entity_id: normalized.confirmation_id,
    actor,
    source_file: store.paths.identityConfirmationQueue,
    metadata: {
      channel_identity_id: normalized.channel_identity_id,
      candidate_count: normalized.candidates?.length ?? 0
    }
  });
  return normalized;
}

function latestConfirmationRequest(entries, confirmationId) {
  return [...entries].reverse().find((entry) =>
    entry.confirmation_id === confirmationId
    && (entry.queue_entry_type ?? 'identity_confirmation_request') === 'identity_confirmation_request'
  );
}

function latestConfirmationDecision(entries, confirmationId) {
  return [...entries].reverse().find((entry) =>
    entry.confirmation_id === confirmationId
    && entry.queue_entry_type === 'identity_confirmation_decision'
  );
}

export function applyIdentityConfirmationDecision(storeOrOptions, decision, { actor = 'identity-resolution' } = {}) {
  const store = initializeIdentityStore(storeOrOptions);
  const confirmationId = String(decision?.confirmation_id ?? '').trim();
  if (!confirmationId) throw new Error('Identity confirmation decision missing confirmation_id');
  const entries = readJsonl(store.paths.identityConfirmationQueue);
  const confirmation = latestConfirmationRequest(entries, confirmationId);
  if (!confirmation) throw new Error(`Identity confirmation not found: ${confirmationId}`);
  const previousDecision = latestConfirmationDecision(entries, confirmationId);
  if (previousDecision && decision.allow_redecision !== true) {
    throw new Error(`Identity confirmation already decided: ${confirmationId}`);
  }

  const action = decision.action ?? 'confirm_candidate';
  const createdAt = nowIso();
  const decisionId = decision.decision_id
    ?? stableId('identity_confirmation_decision', [confirmationId, action, decision.candidate_id, decision.person_id, createdAt]);
  const baseDecision = {
    schema_version: 'identity_confirmation_decision.v1',
    queue_entry_type: 'identity_confirmation_decision',
    decision_id: decisionId,
    confirmation_id: confirmationId,
    source_observation_id: confirmation.source_observation_id ?? null,
    channel_identity_id: confirmation.channel_identity_id,
    action,
    actor,
    decided_by: decision.confirmed_by ?? decision.decided_by ?? actor,
    decided_at: createdAt,
    evidence_refs: unique([
      ...(confirmation.evidence_refs ?? []),
      ...(decision.evidence_refs ?? [])
    ])
  };

  if (action === 'reject_all') {
    const decisionRecord = {
      ...baseDecision,
      status: 'rejected',
      decision_status: 'rejected',
      rejected_candidate_ids: (confirmation.candidates ?? []).map((candidate) => candidate.candidate_id),
      reason: decision.reason ?? 'operator_rejected_all_candidates',
      gate_decision: 'identity_confirmation_rejected',
      raw_event_replay_required: false
    };
    appendJsonl(store.paths.identityConfirmationQueue, decisionRecord);
    writeIdentityAudit(store, {
      action: 'apply_identity_confirmation_decision',
      entity_type: 'identity_confirmation',
      entity_id: confirmationId,
      actor,
      result: decisionRecord.gate_decision,
      source_file: store.paths.identityConfirmationQueue,
      metadata: {
        action,
        rejected_candidate_ids: decisionRecord.rejected_candidate_ids
      }
    });
    return {
      schema_version: 'identity_confirmation_decision.v1',
      gate_decision: decisionRecord.gate_decision,
      decision: decisionRecord,
      created_link: null,
      confirmation
    };
  }

  if (action !== 'confirm_candidate') {
    throw new Error(`Unsupported identity confirmation decision action: ${action}`);
  }

  const candidate = (confirmation.candidates ?? []).find((item) =>
    item.candidate_id === decision.candidate_id
    || item.candidate_person_id === decision.person_id
    || item.candidate_person_id === decision.confirmed_person_id
  );
  if (!candidate) throw new Error('Identity confirmation decision candidate not found');
  const snapshot = loadIdentitySnapshot(store);
  const identity = (snapshot.channel_identities.channel_identities ?? [])
    .find((item) => item.channel_identity_id === candidate.channel_identity_id)
    ?? (snapshot.channel_identities.channel_identities ?? [])
      .find((item) => item.channel_identity_id === confirmation.channel_identity_id);
  const threadKeys = unique([
    identity?.thread_key,
    candidate.metadata?.thread_key,
    ...(decision.thread_keys ?? [])
  ]);
  const linkInput = {
    person_id: candidate.candidate_person_id,
    channel_identity_id: candidate.channel_identity_id,
    platform: identity?.platform ?? candidate.metadata?.platform ?? 'unknown',
    status: 'confirmed',
    verified: true,
    confidence: clamp(decision.confidence ?? Math.max(0.92, candidate.confidence ?? 0.92)),
    confirmed_by: decision.confirmed_by ?? decision.decided_by ?? actor,
    confirmed_at: createdAt,
    evidence_refs: unique([
      ...(identity?.evidence_refs ?? []),
      ...(confirmation.evidence_refs ?? []),
      ...(decision.evidence_refs ?? [])
    ]),
    thread_keys: threadKeys,
    metadata: {
      confirmation_id: confirmationId,
      decision_id: decisionId,
      selected_candidate_id: candidate.candidate_id,
      source_observation_id: confirmation.source_observation_id ?? null,
      match_reasons: candidate.match_reasons ?? []
    }
  };
  const links = upsertPersonIdentityLinks(store, [linkInput], { actor });
  const createdLink = links.person_identity_links.find((link) =>
    link.person_id === linkInput.person_id
    && link.channel_identity_id === linkInput.channel_identity_id
  );
  const indexes = rebuildIdentityIndexes(store, { actor });
  const decisionRecord = {
    ...baseDecision,
    status: 'confirmed',
    decision_status: 'confirmed',
    selected_candidate_id: candidate.candidate_id,
    confirmed_person_id: candidate.candidate_person_id,
    created_link_id: createdLink?.link_id ?? null,
    gate_decision: 'identity_confirmation_applied',
    raw_event_replay_required: true,
    resolution_retry_hint: {
      source_observation_id: confirmation.source_observation_id ?? null,
      expected_gate_decision_after_retry: 'identity_resolved',
      expected_person_id: candidate.candidate_person_id
    }
  };
  appendJsonl(store.paths.identityConfirmationQueue, decisionRecord);
  writeIdentityAudit(store, {
    action: 'apply_identity_confirmation_decision',
    entity_type: 'identity_confirmation',
    entity_id: confirmationId,
    actor,
    result: decisionRecord.gate_decision,
    source_file: store.paths.identityConfirmationQueue,
    metadata: {
      selected_candidate_id: candidate.candidate_id,
      confirmed_person_id: candidate.candidate_person_id,
      created_link_id: decisionRecord.created_link_id
    }
  });
  return {
    schema_version: 'identity_confirmation_decision.v1',
    gate_decision: decisionRecord.gate_decision,
    decision: decisionRecord,
    created_link: createdLink,
    indexes,
    confirmation
  };
}

export function loadIdentitySnapshot(storeOrOptions) {
  const store = asIdentityStore(storeOrOptions);
  return {
    channel_identities: readJson(store.paths.channelIdentities, { schema_version: SCHEMA_VERSION, channel_identities: [] }),
    person_identity_links: readJson(store.paths.personIdentityLinks, { schema_version: SCHEMA_VERSION, person_identity_links: [] }),
    identity_confirmation_queue: readJsonl(store.paths.identityConfirmationQueue),
    identity_audit_records: readJsonl(store.paths.identityAudit),
    indexes: {
      identity_person: readJson(store.paths.identityPersonIndex, emptyIndex('identity_person')),
      channel_identity: readJson(store.paths.channelIdentityIndex, emptyIndex('channel_identity')),
      thread_person: readJson(store.paths.threadPersonIndex, emptyIndex('thread_person'))
    }
  };
}

export function rebuildIdentityIndexes(storeOrOptions, { actor = 'identity-resolution' } = {}) {
  const store = asIdentityStore(storeOrOptions);
  const identities = readJson(store.paths.channelIdentities, { channel_identities: [] }).channel_identities ?? [];
  const links = readJson(store.paths.personIdentityLinks, { person_identity_links: [] }).person_identity_links ?? [];
  const rebuiltAt = nowIso();
  const sourceCounts = {
    channel_identities: identities.length,
    person_identity_links: links.length
  };
  const identityPerson = emptyIndex('identity_person');
  const channelIdentity = emptyIndex('channel_identity');
  const threadPerson = emptyIndex('thread_person');
  for (const index of [identityPerson, channelIdentity, threadPerson]) {
    index.rebuilt_at = rebuiltAt;
    index.source_counts = sourceCounts;
  }

  for (const identity of identities) {
    for (const key of searchKeysForIdentity(identity)) {
      channelIdentity.entries[key] ??= [];
      channelIdentity.entries[key] = unique([...channelIdentity.entries[key], identity.channel_identity_id]);
    }
  }

  for (const link of links) {
    identityPerson.entries[link.channel_identity_id] ??= [];
    identityPerson.entries[link.channel_identity_id].push({
      person_id: link.person_id,
      link_id: link.link_id,
      status: link.status,
      verified: link.verified,
      confidence: link.confidence
    });
    for (const threadKey of link.thread_keys ?? []) {
      threadPerson.entries[threadKey] ??= [];
      threadPerson.entries[threadKey].push({
        person_id: link.person_id,
        link_id: link.link_id,
        channel_identity_id: link.channel_identity_id,
        confidence: link.confidence,
        status: link.status
      });
    }
  }

  writeJsonAtomic(store.paths.identityPersonIndex, identityPerson);
  writeJsonAtomic(store.paths.channelIdentityIndex, channelIdentity);
  writeJsonAtomic(store.paths.threadPersonIndex, threadPerson);
  writeIdentityAudit(store, {
    action: 'rebuild_identity_indexes',
    entity_type: 'identity_index',
    entity_id: 'identity_indexes',
    actor,
    source_file: path.join(store.dataDir, 'indexes'),
    metadata: sourceCounts
  });
  return {
    identityPerson,
    channelIdentity,
    threadPerson
  };
}

function isIgnorableParticipantHint(value) {
  const normalized = normalizeIdentityText(value);
  return !normalized || USER_HINTS.has(normalized) || UNKNOWN_HINTS.has(normalized);
}

function threadKeyFromObservation(observation) {
  const hint = observation.thread_hint ?? {};
  const title = hint.conversation_title ?? hint.title ?? hint.thread_title ?? null;
  const explicit = hint.thread_id ?? hint.thread_key ?? hint.conversation_id ?? null;
  if (explicit) return `${observation.platform}:${normalizeIdentityText(explicit)}`;
  if (title) return `${observation.platform}:${normalizeIdentityText(title)}`;
  const windowTitle = observation.window_ref?.title ?? observation.window_ref?.window_title ?? null;
  if (windowTitle) return `${observation.platform}:${normalizeIdentityText(windowTitle)}`;
  return null;
}

export function buildChannelIdentitiesFromObservation(observation) {
  const normalized = normalizeIntakeObservation(observation);
  if (normalized.source_actor_type !== 'human_contact') return [];
  const threadKey = threadKeyFromObservation(normalized);
  const directHints = [
    ...(normalized.source_identity_hints ?? []),
    ...(normalized.metadata?.source_identity_hints ?? [])
  ];
  const identities = [];

  for (const hint of directHints) {
    identities.push(normalizeChannelIdentity({
      platform: normalized.platform,
      identity_type: hint.identity_type,
      display_name: hint.display_name ?? hint.remark_name ?? hint.nickname ?? null,
      handle: hint.handle ?? hint.platform_handle ?? null,
      value_hash: hint.value_hash ?? null,
      organization_hint: hint.organization_hint ?? null,
      thread_key: hint.thread_key ?? threadKey,
      source_observation_ids: [normalized.observation_id],
      evidence_refs: unique([hint.evidence_ref, normalized.observation_id]),
      confidence: hint.confidence ?? normalized.confidence,
      metadata: {
        source_adapter_id: normalized.source_adapter_id,
        source_type: normalized.source_type,
        source_actor_type: normalized.source_actor_type,
        from_source_identity_hint: true
      }
    }));
  }

  for (const hint of normalized.participants_hint ?? []) {
    if (isIgnorableParticipantHint(hint)) continue;
    identities.push(normalizeChannelIdentity({
      platform: normalized.platform,
      identity_type: 'display_name',
      display_name: hint,
      thread_key: threadKey,
      source_observation_ids: [normalized.observation_id],
      evidence_refs: [normalized.observation_id],
      confidence: Math.min(0.78, normalized.confidence),
      metadata: {
        source_adapter_id: normalized.source_adapter_id,
        source_type: normalized.source_type,
        source_actor_type: normalized.source_actor_type,
        from_participants_hint: true
      }
    }));
  }

  if (!identities.length && threadKey) {
    identities.push(normalizeChannelIdentity({
      platform: normalized.platform,
      identity_type: 'thread',
      display_name: normalized.thread_hint?.conversation_title ?? normalized.thread_hint?.title ?? null,
      thread_key: threadKey,
      source_observation_ids: [normalized.observation_id],
      evidence_refs: [normalized.observation_id],
      confidence: 0.45,
      metadata: {
        source_adapter_id: normalized.source_adapter_id,
        source_type: normalized.source_type,
        source_actor_type: normalized.source_actor_type,
        from_thread_hint: true
      }
    }));
  }

  return upsertById([], identities, 'channel_identity_id');
}

function loadPeopleFromStorage(storage) {
  try {
    return loadStorageSnapshot(storage).people.people ?? [];
  } catch {
    return [];
  }
}

function displayMatchesPerson(identity, person) {
  const identityName = identity.normalized_display_name;
  if (!identityName) return false;
  const names = [person.display_name, ...(person.aliases ?? [])].map(normalizeIdentityText);
  return names.includes(identityName);
}

function buildCandidate({
  observationId,
  identity,
  personId,
  confidence,
  reasons,
  requiresUserConfirmation,
  recommendedAction,
  status,
  ambiguityGroupId = null
}) {
  return {
    candidate_id: stableId('person_match_candidate', [observationId, identity.channel_identity_id, personId, reasons.join(',')]),
    source_observation_id: observationId ?? null,
    channel_identity_id: identity.channel_identity_id,
    candidate_person_id: personId,
    confidence: clamp(confidence),
    match_reasons: reasons,
    ambiguity_group_id: ambiguityGroupId,
    requires_user_confirmation: requiresUserConfirmation,
    recommended_action: recommendedAction,
    status,
    metadata: {
      platform: identity.platform,
      display_name: identity.display_name ?? null,
      thread_key: identity.thread_key ?? null,
      evidence_refs: identity.evidence_refs ?? []
    }
  };
}

export function generatePersonMatchCandidates({
  storage,
  identityStore,
  observation,
  identities = null,
  people = null
}) {
  const normalized = normalizeIntakeObservation(observation);
  if (normalized.source_actor_type !== 'human_contact') return [];
  const store = asIdentityStore(identityStore ?? { storage });
  const identitySnapshot = loadIdentitySnapshot(store);
  const knownPeople = people ?? loadPeopleFromStorage(storage);
  const inputIdentities = identities ?? buildChannelIdentitiesFromObservation(normalized);
  const candidates = [];

  for (const identity of inputIdentities) {
    const confirmedLinks = (identitySnapshot.person_identity_links.person_identity_links ?? [])
      .filter((link) => link.channel_identity_id === identity.channel_identity_id && link.status === 'confirmed' && link.verified);
    for (const link of confirmedLinks) {
      candidates.push(buildCandidate({
        observationId: normalized.observation_id,
        identity,
        personId: link.person_id,
        confidence: Math.max(0.94, link.confidence),
        reasons: ['confirmed_channel_identity_link'],
        requiresUserConfirmation: false,
        recommendedAction: 'auto_link_confirmed_identity',
        status: 'auto_linked'
      }));
    }
    if (confirmedLinks.length) continue;

    const matchingLinks = (identitySnapshot.person_identity_links.person_identity_links ?? [])
      .filter((link) => link.platform === identity.platform && link.status !== 'rejected');
    for (const link of matchingLinks) {
      const linkedIdentity = (identitySnapshot.channel_identities.channel_identities ?? [])
        .find((item) => item.channel_identity_id === link.channel_identity_id);
      if (!linkedIdentity) continue;
      const sameHash = identity.value_hash && identity.value_hash === linkedIdentity.value_hash;
      const sameHandle = identity.normalized_handle && identity.normalized_handle === linkedIdentity.normalized_handle;
      const sameDisplay = identity.normalized_display_name && identity.normalized_display_name === linkedIdentity.normalized_display_name;
      const sameThread = identity.thread_key && identity.thread_key === linkedIdentity.thread_key;
      if (!sameHash && !sameHandle && !sameDisplay && !sameThread) continue;
      const confidence = sameHash || sameHandle ? 0.9 : (sameThread ? 0.84 : 0.78);
      candidates.push(buildCandidate({
        observationId: normalized.observation_id,
        identity,
        personId: link.person_id,
        confidence,
        reasons: [
          sameHash ? 'same_sensitive_hash' : null,
          sameHandle ? 'same_platform_handle' : null,
          sameDisplay ? 'same_platform_display_name' : null,
          sameThread ? 'same_thread_key' : null
        ].filter(Boolean),
        requiresUserConfirmation: true,
        recommendedAction: 'ask_user_to_confirm',
        status: 'candidate'
      }));
    }

    const nameMatches = knownPeople.filter((person) => displayMatchesPerson(identity, person));
    const ambiguityGroupId = nameMatches.length > 1
      ? stableId('identity_ambiguity', [normalized.observation_id, identity.normalized_display_name])
      : null;
    for (const person of nameMatches) {
      candidates.push(buildCandidate({
        observationId: normalized.observation_id,
        identity,
        personId: person.person_id,
        confidence: nameMatches.length > 1 ? 0.62 : 0.74,
        reasons: ['person_display_name_or_alias_match'],
        requiresUserConfirmation: true,
        recommendedAction: 'ask_user_to_confirm',
        status: 'candidate',
        ambiguityGroupId
      }));
    }
  }

  const deduped = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.channel_identity_id}:${candidate.candidate_person_id}:${candidate.match_reasons.join(',')}`;
    const previous = deduped.get(key);
    if (!previous || candidate.confidence > previous.confidence) deduped.set(key, candidate);
  }
  return [...deduped.values()].sort((a, b) => b.confidence - a.confidence);
}

export function resolveObservationIdentities({
  storage,
  identityStore = null,
  observation,
  actor = 'identity-resolution',
  autoLinkThreshold = 0.9
}) {
  const normalized = normalizeIntakeObservation(observation);
  const store = initializeIdentityStore(identityStore ?? { storage });
  const identities = buildChannelIdentitiesFromObservation(normalized);
  upsertChannelIdentities(store, identities, { actor });
  const candidates = generatePersonMatchCandidates({
    storage,
    identityStore: store,
    observation: normalized,
    identities
  });
  const autoLinked = candidates.filter((candidate) =>
    candidate.status === 'auto_linked'
    && candidate.confidence >= autoLinkThreshold
    && !candidate.requires_user_confirmation
  );
  const confirmedPersonIds = unique(autoLinked.map((candidate) => candidate.candidate_person_id));
  const needsConfirmation = candidates.filter((candidate) => candidate.requires_user_confirmation);

  const confirmations = [];
  if (!confirmedPersonIds.length && needsConfirmation.length) {
    const byIdentity = new Map();
    for (const candidate of needsConfirmation) {
      byIdentity.set(candidate.channel_identity_id, [
        ...(byIdentity.get(candidate.channel_identity_id) ?? []),
        candidate
      ]);
    }
    for (const [channelIdentityId, grouped] of byIdentity.entries()) {
      confirmations.push(appendIdentityConfirmation(store, {
        source_observation_id: normalized.observation_id,
        channel_identity_id: channelIdentityId,
        reason: grouped.length > 1 ? 'ambiguous_identity_candidates' : 'candidate_requires_user_confirmation',
        candidates: grouped,
        required_before: 'link_raw_event_to_person'
      }, { actor }));
    }
  }

  rebuildIdentityIndexes(store, { actor });
  const resolution = {
    schema_version: SCHEMA_VERSION,
    resolution_id: stableId('identity_resolution', [normalized.observation_id, identities.map((item) => item.channel_identity_id).join(',')]),
    source_observation_id: normalized.observation_id,
    platform: normalized.platform,
    source_actor_type: normalized.source_actor_type,
    channel_identity_ids: identities.map((identity) => identity.channel_identity_id),
    candidates,
    confirmed_person_ids: confirmedPersonIds,
    confirmation_required: confirmations.length > 0,
    confirmation_ids: confirmations.map((item) => item.confirmation_id),
    gate_decision: confirmedPersonIds.length
      ? 'identity_resolved'
      : (normalized.source_actor_type !== 'human_contact'
        ? (normalized.source_actor_type === 'unknown'
          ? 'source_actor_unknown_requires_user_confirmation'
          : 'source_actor_not_human_contact')
        : (confirmations.length ? 'identity_requires_user_confirmation' : 'identity_unmatched')),
    created_at: nowIso(),
    continue_when: [
      'confirmed_person_ids 非空',
      '或用户从 identity_confirmation_queue 中确认候选人物后重新运行解析'
    ],
    stop_or_adjust_when: [
      '同名候选多于 1 个',
      '仅有昵称或窗口标题且无已确认身份链接',
      'source_identity_hints 缺少可验证 handle/hash/thread_key'
    ]
  };
  writeIdentityAudit(store, {
    action: 'resolve_observation_identities',
    entity_type: 'intake_observation',
    entity_id: normalized.observation_id,
    actor,
    result: resolution.gate_decision,
    source_file: store.paths.channelIdentities,
    metadata: {
      confirmed_person_ids: confirmedPersonIds,
      candidate_count: candidates.length,
      confirmation_required: resolution.confirmation_required
    }
  });
  return resolution;
}

export function appendObservationWithIdentityResolution(storage, observation, {
  identityStore = null,
  actor = 'identity-resolution'
} = {}) {
  const resolution = resolveObservationIdentities({
    storage,
    identityStore,
    observation,
    actor
  });
  const rawEvent = appendObservationAsRawEvent(storage, observation, {
    actor,
    identityResolution: resolution
  });
  rebuildEventIndexes(storage, { actor });
  return {
    resolution,
    raw_event: rawEvent
  };
}

export function buildIdentityResolutionAudit({
  root = projectRoot(),
  auditId = `identity_resolution_audit_${Date.now()}`,
  sampleResult = null
} = {}) {
  const checks = [];
  const requiredFiles = [
    'package.json',
    'schemas/intake-observation.schema.json',
    'schemas/channel-identity.schema.json',
    'schemas/person-identity-link.schema.json',
    'schemas/person-match-candidate.schema.json',
    'schemas/identity-resolution-audit.schema.json',
    'packages/identity-resolution/src/identity-resolution.mjs',
    'packages/identity-resolution/src/index.mjs',
    'packages/identity-resolution/tests/identity-resolution.test.mjs',
    'scripts/run-identity-resolution-demo.mjs',
    'scripts/audit-identity-resolution.mjs'
  ];
  for (const file of requiredFiles) {
    const exists = existsSync(path.join(root, file));
    checks.push({
      check_id: `file_exists:${file}`,
      severity: 'required',
      status: exists ? 'pass' : 'fail',
      passed: exists,
      evidence: [file],
      fix: exists ? null : `Create ${file}`
    });
  }
  checks.push({
    check_id: 'confirmed_identity_links_raw_event',
    severity: 'required',
    status: sampleResult?.confirmed_linked === true ? 'pass' : 'fail',
    passed: sampleResult?.confirmed_linked === true,
    evidence: [
      `confirmed_person_ids=${sampleResult?.confirmed_person_ids?.join(',') ?? 'none'}`,
      `raw_event_linked_person_ids=${sampleResult?.raw_event_linked_person_ids?.join(',') ?? 'none'}`
    ],
    fix: 'Confirmed ChannelIdentity links must populate RawEvent.linked_person_ids.'
  });
  checks.push({
    check_id: 'ambiguous_identity_requires_confirmation',
    severity: 'required',
    status: sampleResult?.ambiguous_requires_confirmation === true ? 'pass' : 'fail',
    passed: sampleResult?.ambiguous_requires_confirmation === true,
    evidence: [`confirmation_ids=${sampleResult?.ambiguous_confirmation_ids?.join(',') ?? 'none'}`],
    fix: 'Ambiguous display-name matches must write identity confirmation queue records.'
  });
  checks.push({
    check_id: 'identity_indexes_rebuilt',
    severity: 'required',
    status: sampleResult?.identity_indexes_rebuilt === true ? 'pass' : 'fail',
    passed: sampleResult?.identity_indexes_rebuilt === true,
    evidence: [`index_keys=${sampleResult?.identity_index_keys?.join(',') ?? 'none'}`],
    fix: 'Rebuild identity-person, channel-identity and thread-person indexes.'
  });
  const requiredFailures = checks.filter((check) => check.severity === 'required' && !check.passed).map((check) => check.check_id);
  const warningFailures = checks.filter((check) => check.severity === 'warning' && !check.passed).map((check) => check.check_id);
  return {
    schema_version: 'identity_resolution_audit.v1',
    audit_id: auditId,
    created_at: nowIso(),
    gate_decision: requiredFailures.length ? 'identity_resolution_blocked' : 'identity_resolution_ready',
    checks,
    required_failures: requiredFailures,
    warning_failures: warningFailures,
    artifacts: {
      sample_result: sampleResult
    },
    gap_review: {
      completed: [
        'ChannelIdentity / PersonIdentityLink / PersonMatchCandidate schema 已建立。',
        '多渠道身份可写入 data/people，并可重建 identity-person、channel-identity、thread-person 三类索引。',
        '已确认身份链接能回填 RawEvent.linked_person_ids。',
        '同名或低置信候选会进入 identity-confirmation-queue.jsonl。'
      ],
      remaining_gaps: [
        'Sightflow 仍需要从真实微信 UI/OCR/通讯录抽取稳定 handle、备注名、手机号 hash 或名片证据。',
        '人工确认队列目前是 JSONL 产物，还没有应用内确认 UI。',
        '群聊多人身份、跨平台组织实体和长期 identity merge 策略仍是后续扩展。'
      ]
    }
  };
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

export function renderIdentityResolutionAuditMarkdown(audit) {
  const rows = audit.checks
    .map((check) => `| ${escapeCell(check.check_id)} | ${escapeCell(check.severity)} | ${escapeCell(check.status)} | ${escapeCell(check.evidence.join('<br>'))} |`)
    .join('\n');
  return `# Identity Resolution Audit

- audit_id: ${audit.audit_id}
- created_at: ${audit.created_at}
- gate_decision: ${audit.gate_decision}
- required_failures: ${audit.required_failures.join(', ') || 'none'}
- warning_failures: ${audit.warning_failures.join(', ') || 'none'}

## Checks

| check_id | severity | status | evidence |
| --- | --- | --- | --- |
${rows}

## Completed

${audit.gap_review.completed.map((item) => `- ${item}`).join('\n')}

## Remaining Gaps

${audit.gap_review.remaining_gaps.map((item) => `- ${item}`).join('\n')}
`;
}

export function writeIdentityResolutionAudit({ audit, outputDir }) {
  ensureDir(outputDir);
  const jsonPath = path.join(outputDir, 'identity-resolution-audit.json');
  const markdownPath = path.join(outputDir, 'identity-resolution-audit.md');
  writeFileSync(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderIdentityResolutionAuditMarkdown(audit), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath
  };
}
