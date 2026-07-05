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
import {
  buildChannelIdentitiesFromObservation,
  initializeIdentityStore,
  loadIdentitySnapshot,
  normalizeIdentityText,
  rebuildIdentityIndexes,
  sha256Text,
  upsertChannelIdentities,
  upsertPersonIdentityLinks
} from './identity-resolution.mjs';
import {
  loadStorageSnapshot,
  readJsonl,
  rebuildEventIndexes,
  upsertPeople,
  upsertRelationships
} from '../../storage-runtime/src/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_VERSION = 'cold_start_person_introduction.v1';

function projectRoot() {
  return path.resolve(here, '../../..');
}

function nowIso() {
  return new Date().toISOString();
}

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function stableId(prefix, parts) {
  return `${prefix}_${sha256Text(parts.map((part) => String(part ?? '')).join('|')).slice(0, 16)}`;
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

function writeJsonlAtomic(filePath, records) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  const content = records.map((record) => JSON.stringify(record)).join('\n');
  writeFileSync(tempPath, content ? `${content}\n` : '', 'utf8');
  renameSync(tempPath, filePath);
}

function ensureJsonFile(filePath, initialValue) {
  if (!existsSync(filePath)) {
    writeJsonAtomic(filePath, initialValue);
  }
}

function ensureTextFile(filePath) {
  ensureDir(path.dirname(filePath));
  if (!existsSync(filePath)) writeFileSync(filePath, '', 'utf8');
}

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function appendJsonl(filePath, record) {
  ensureTextFile(filePath);
  appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function upsertById(items, incoming, idField) {
  const byId = new Map((items ?? []).map((item) => [item[idField], item]));
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

function asColdStartStore(options = {}) {
  const storage = options.storage;
  const root = options.root ?? storage?.root ?? projectRoot();
  const dataDir = options.dataDir ?? storage?.dataDir ?? path.join(root, 'data');
  return {
    root,
    dataDir,
    paths: {
      candidatePersons: path.join(dataDir, 'people/candidate-persons.json'),
      personRoleBindings: path.join(dataDir, 'people/person-role-bindings.json'),
      sceneRelationshipWeights: path.join(dataDir, 'people/scene-relationship-weights.json'),
      audit: path.join(dataDir, 'audit/cold-start-person-introduction-audit.jsonl')
    }
  };
}

function writeColdStartAudit(store, audit) {
  const normalized = {
    audit_id: audit.audit_id ?? stableId('cold_start_audit', [audit.action, audit.entity_id, Date.now()]),
    schema_version: SCHEMA_VERSION,
    actor: 'cold-start-person-introduction',
    occurred_at: nowIso(),
    result: 'success',
    ...audit
  };
  appendJsonl(store.paths.audit, normalized);
  return normalized;
}

export function createColdStartStore(options = {}) {
  return asColdStartStore(options);
}

export function initializeColdStartStore(options = {}) {
  const store = asColdStartStore(options);
  ensureJsonFile(store.paths.candidatePersons, {
    schema_version: 'candidate_person.v1',
    candidate_persons: []
  });
  ensureJsonFile(store.paths.personRoleBindings, {
    schema_version: 'person_role_binding.v1',
    person_role_bindings: []
  });
  ensureJsonFile(store.paths.sceneRelationshipWeights, {
    schema_version: 'scene_relationship_weight.v1',
    scene_relationship_weights: []
  });
  ensureTextFile(store.paths.audit);
  writeColdStartAudit(store, {
    action: 'init_cold_start_store',
    entity_type: 'cold_start_store',
    entity_id: store.dataDir,
    source_file: store.dataDir
  });
  return store;
}

export function loadColdStartSnapshot(storeOrOptions = {}) {
  const store = asColdStartStore(storeOrOptions);
  return {
    candidate_persons: readJson(store.paths.candidatePersons, {
      schema_version: 'candidate_person.v1',
      candidate_persons: []
    }),
    person_role_bindings: readJson(store.paths.personRoleBindings, {
      schema_version: 'person_role_binding.v1',
      person_role_bindings: []
    }),
    scene_relationship_weights: readJson(store.paths.sceneRelationshipWeights, {
      schema_version: 'scene_relationship_weight.v1',
      scene_relationship_weights: []
    }),
    audit_records: readJsonl(store.paths.audit)
  };
}

function confirmedPersonIdsForIdentity(identitySnapshot, channelIdentityId) {
  return (identitySnapshot.person_identity_links.person_identity_links ?? [])
    .filter((link) => link.channel_identity_id === channelIdentityId && link.status === 'confirmed' && link.verified)
    .map((link) => link.person_id);
}

function normalizedCandidateKey({ displayName, organizationHint, handle, threadKey }) {
  const name = displayName ? normalizeIdentityText(displayName) : null;
  const org = organizationHint ? normalizeIdentityText(organizationHint) : null;
  const handleKey = handle ? normalizeIdentityText(handle) : null;
  const thread = threadKey ? normalizeIdentityText(threadKey) : null;
  return name ?? handleKey ?? thread ?? org ?? 'unknown';
}

function normalizeCandidatePerson(candidate) {
  const displayName = String(candidate.display_name ?? '').trim();
  if (!displayName) throw new Error('CandidatePerson missing display_name');
  const candidatePersonId = candidate.candidate_person_id
    ?? stableId('candidate_person', [
      normalizedCandidateKey({
        displayName,
        organizationHint: candidate.organization_hint,
        handle: candidate.handle_hint,
        threadKey: candidate.thread_key
      }),
      candidate.source ?? 'cold_start'
    ]);
  return {
    candidate_person_id: candidatePersonId,
    display_name: displayName,
    normalized_display_name: normalizeIdentityText(displayName),
    status: candidate.status ?? 'candidate',
    source: candidate.source ?? 'detected_from_observation',
    confidence: clamp(candidate.confidence ?? 0.55),
    channel_identity_ids: unique(candidate.channel_identity_ids ?? []),
    source_observation_ids: unique(candidate.source_observation_ids ?? []),
    evidence_refs: unique(candidate.evidence_refs ?? []),
    tags: unique(candidate.tags ?? []),
    role_hints: unique(candidate.role_hints ?? []),
    organization_hint: candidate.organization_hint ?? null,
    thread_keys: unique(candidate.thread_keys ?? []),
    requires_user_confirmation: candidate.requires_user_confirmation ?? true,
    confirmed_person_id: candidate.confirmed_person_id ?? null,
    confirmed_at: candidate.confirmed_at ?? null,
    metadata: candidate.metadata ?? {},
    created_at: candidate.created_at ?? nowIso(),
    updated_at: candidate.updated_at ?? nowIso()
  };
}

function normalizeRoleBinding(binding) {
  const bindingId = binding.binding_id
    ?? stableId('person_role_binding', [
      binding.person_id ?? binding.candidate_person_id,
      binding.graph_id,
      binding.scene,
      binding.role
    ]);
  return {
    binding_id: bindingId,
    graph_id: binding.graph_id ?? 'default_social_graph',
    scene: binding.scene ?? 'general',
    role: binding.role ?? 'contact',
    role_status: binding.role_status ?? 'candidate',
    candidate_person_id: binding.candidate_person_id ?? null,
    person_id: binding.person_id ?? null,
    tags: unique(binding.tags ?? []),
    confidence: clamp(binding.confidence ?? 0.55),
    evidence_refs: unique(binding.evidence_refs ?? []),
    source_observation_ids: unique(binding.source_observation_ids ?? []),
    metadata: binding.metadata ?? {},
    created_at: binding.created_at ?? nowIso(),
    updated_at: binding.updated_at ?? nowIso()
  };
}

function normalizeSceneRelationshipWeight(weight) {
  const relationshipId = weight.relationship_id
    ?? stableId('candidate_relationship', [
      weight.from_person_id,
      weight.person_id ?? weight.candidate_person_id,
      weight.scene,
      weight.type_code
    ]);
  const components = weight.components ?? computeSceneRelationshipWeight({
    distance_tier: weight.distance_tier,
    scene: weight.scene,
    interaction_count: weight.interaction_count,
    recency_days: weight.recency_days,
    role_importance: weight.role_importance,
    user_override_weight: weight.user_override_weight,
    identity_confidence: weight.confidence
  }).components;
  return {
    relationship_id: relationshipId,
    from_person_id: weight.from_person_id ?? 'user',
    to_person_id: weight.to_person_id ?? weight.person_id ?? null,
    candidate_person_id: weight.candidate_person_id ?? null,
    scene: weight.scene ?? 'general',
    type_code: weight.type_code ?? 'social_contact',
    distance_tier: weight.distance_tier ?? 'unknown',
    status: weight.status ?? 'candidate',
    confidence: clamp(weight.confidence ?? 0.55),
    weight: clamp(weight.weight ?? components.final_weight ?? 0.4),
    components,
    evidence_refs: unique(weight.evidence_refs ?? []),
    source_observation_ids: unique(weight.source_observation_ids ?? []),
    metadata: weight.metadata ?? {},
    created_at: weight.created_at ?? nowIso(),
    updated_at: weight.updated_at ?? nowIso()
  };
}

function writeCandidatePersons(store, candidates, { actor = 'cold-start-person-introduction' } = {}) {
  const current = readJson(store.paths.candidatePersons, {
    schema_version: 'candidate_person.v1',
    candidate_persons: []
  });
  const normalized = candidates.map(normalizeCandidatePerson);
  const next = {
    schema_version: current.schema_version ?? 'candidate_person.v1',
    candidate_persons: upsertById(current.candidate_persons ?? [], normalized, 'candidate_person_id')
  };
  writeJsonAtomic(store.paths.candidatePersons, next);
  writeColdStartAudit(store, {
    action: 'upsert_candidate_persons',
    entity_type: 'candidate_person',
    entity_id: normalized.map((item) => item.candidate_person_id).join(','),
    actor,
    source_file: store.paths.candidatePersons,
    metadata: { count: normalized.length }
  });
  return next;
}

function writeRoleBindings(store, bindings, { actor = 'cold-start-person-introduction' } = {}) {
  const current = readJson(store.paths.personRoleBindings, {
    schema_version: 'person_role_binding.v1',
    person_role_bindings: []
  });
  const normalized = bindings.map(normalizeRoleBinding);
  const next = {
    schema_version: current.schema_version ?? 'person_role_binding.v1',
    person_role_bindings: upsertById(current.person_role_bindings ?? [], normalized, 'binding_id')
  };
  writeJsonAtomic(store.paths.personRoleBindings, next);
  writeColdStartAudit(store, {
    action: 'upsert_person_role_bindings',
    entity_type: 'person_role_binding',
    entity_id: normalized.map((item) => item.binding_id).join(','),
    actor,
    source_file: store.paths.personRoleBindings,
    metadata: { count: normalized.length }
  });
  return next;
}

function writeSceneRelationshipWeights(store, weights, { actor = 'cold-start-person-introduction' } = {}) {
  const current = readJson(store.paths.sceneRelationshipWeights, {
    schema_version: 'scene_relationship_weight.v1',
    scene_relationship_weights: []
  });
  const normalized = weights.map(normalizeSceneRelationshipWeight);
  const next = {
    schema_version: current.schema_version ?? 'scene_relationship_weight.v1',
    scene_relationship_weights: upsertById(current.scene_relationship_weights ?? [], normalized, 'relationship_id')
  };
  writeJsonAtomic(store.paths.sceneRelationshipWeights, next);
  writeColdStartAudit(store, {
    action: 'upsert_scene_relationship_weights',
    entity_type: 'scene_relationship_weight',
    entity_id: normalized.map((item) => item.relationship_id).join(','),
    actor,
    source_file: store.paths.sceneRelationshipWeights,
    metadata: { count: normalized.length }
  });
  return next;
}

export function computeSceneRelationshipWeight({
  distance_tier = 'unknown',
  scene = 'general',
  interaction_count = 0,
  recency_days = null,
  role_importance = 0,
  user_override_weight = null,
  identity_confidence = 0.55,
  candidate = true
} = {}) {
  const distanceBase = {
    unknown: 0.2,
    weak_tie: 0.35,
    normal_contact: 0.5,
    active_contact: 0.65,
    close: 0.82,
    core: 0.95
  };
  const sceneBonus = {
    general: 0,
    business_lead: 0.08,
    business_current: 0.15,
    active_thread: 0.1,
    manual_priority: 0.15,
    after_sales: 0.12,
    personal: 0.05
  };
  const recencyBonus = recency_days === null
    ? 0
    : (Number(recency_days) <= 7 ? 0.08 : (Number(recency_days) <= 30 ? 0.04 : 0));
  const interactionBonus = Math.min(0.12, Math.max(0, Number(interaction_count) || 0) * 0.02);
  const roleBonus = Math.min(0.12, Math.max(0, Number(role_importance) || 0) * 0.12);
  const base = distanceBase[distance_tier] ?? distanceBase.unknown;
  const confidence = clamp(identity_confidence);
  const computed = user_override_weight === null || user_override_weight === undefined
    ? base + (sceneBonus[scene] ?? 0) + recencyBonus + interactionBonus + roleBonus
    : Number(user_override_weight);
  const confidenceAdjusted = computed * (0.72 + confidence * 0.28);
  const candidateCap = candidate ? 0.65 : 1;
  const finalWeight = clamp(Math.min(candidateCap, confidenceAdjusted));
  return {
    weight: finalWeight,
    components: {
      distance_tier,
      distance_base: base,
      scene,
      scene_bonus: sceneBonus[scene] ?? 0,
      recency_bonus: recencyBonus,
      interaction_bonus: interactionBonus,
      role_bonus: roleBonus,
      identity_confidence: confidence,
      candidate_cap: candidateCap,
      user_override_weight: user_override_weight ?? null,
      final_weight: finalWeight
    }
  };
}

function rolesFromManualPerson(person, defaults) {
  const roles = person.role_bindings ?? person.roles ?? [];
  if (roles.length) {
    return roles.map((role) => ({
      graph_id: role.graph_id ?? defaults.graphId,
      scene: role.scene ?? defaults.scene,
      role: role.role ?? role,
      tags: unique([...(person.tags ?? []), ...(role.tags ?? [])]),
      confidence: role.confidence ?? person.confidence ?? defaults.confidence,
      distance_tier: role.distance_tier ?? person.relationship?.distance_tier ?? defaults.distanceTier,
      type_code: role.type_code ?? person.relationship?.type_code ?? defaults.relationshipType,
      role_importance: role.role_importance ?? person.relationship?.role_importance ?? defaults.roleImportance
    }));
  }
  return [{
    graph_id: defaults.graphId,
    scene: defaults.scene,
    role: defaults.defaultRole,
    tags: unique(person.tags ?? []),
    confidence: person.confidence ?? defaults.confidence,
    distance_tier: person.relationship?.distance_tier ?? defaults.distanceTier,
    type_code: person.relationship?.type_code ?? defaults.relationshipType,
    role_importance: person.relationship?.role_importance ?? defaults.roleImportance
  }];
}

function inferRolesForIdentity(identity, defaults) {
  const metadata = identity.metadata ?? {};
  const sourceType = metadata.source_type ?? 'unknown';
  const scene = defaults.scene;
  const role = scene.startsWith('business') ? 'business_contact' : 'contact';
  return [{
    graph_id: defaults.graphId,
    scene,
    role,
    tags: unique([sourceType, identity.platform, role]),
    confidence: identity.confidence ?? defaults.confidence,
    distance_tier: defaults.distanceTier,
    type_code: defaults.relationshipType,
    role_importance: defaults.roleImportance
  }];
}

function mergeCandidate(current, incoming) {
  if (!current) return incoming;
  return normalizeCandidatePerson({
    ...current,
    ...incoming,
    confidence: Math.max(current.confidence ?? 0, incoming.confidence ?? 0),
    channel_identity_ids: unique([...(current.channel_identity_ids ?? []), ...(incoming.channel_identity_ids ?? [])]),
    source_observation_ids: unique([...(current.source_observation_ids ?? []), ...(incoming.source_observation_ids ?? [])]),
    evidence_refs: unique([...(current.evidence_refs ?? []), ...(incoming.evidence_refs ?? [])]),
    tags: unique([...(current.tags ?? []), ...(incoming.tags ?? [])]),
    role_hints: unique([...(current.role_hints ?? []), ...(incoming.role_hints ?? [])]),
    thread_keys: unique([...(current.thread_keys ?? []), ...(incoming.thread_keys ?? [])]),
    metadata: {
      ...(current.metadata ?? {}),
      ...(incoming.metadata ?? {})
    }
  });
}

export function buildColdStartPersonIntroduction({
  storage,
  identityStore = null,
  coldStartStore = null,
  observations = [],
  manualPeople = [],
  scene = 'business_lead',
  graphId = 'default_social_graph',
  ownerPersonId = 'user',
  defaultRole = 'business_contact',
  distanceTier = 'weak_tie',
  relationshipType = 'business_contact',
  actor = 'cold-start-person-introduction'
} = {}) {
  if (!storage) throw new Error('buildColdStartPersonIntroduction requires storage');
  const store = initializeColdStartStore(coldStartStore ?? { storage });
  const resolvedIdentityStore = initializeIdentityStore(identityStore ?? { storage });
  const identitySnapshot = loadIdentitySnapshot(resolvedIdentityStore);
  const knownConfirmedIds = new Set();
  const candidateByKey = new Map();
  const roleBindings = [];
  const relationshipWeights = [];
  const defaults = {
    graphId,
    scene,
    defaultRole,
    confidence: 0.55,
    distanceTier,
    relationshipType,
    roleImportance: 0.5
  };

  for (const observation of observations) {
    const identities = buildChannelIdentitiesFromObservation(observation);
    upsertChannelIdentities(resolvedIdentityStore, identities, { actor });
    for (const identity of identities) {
      const confirmedIds = confirmedPersonIdsForIdentity(identitySnapshot, identity.channel_identity_id);
      confirmedIds.forEach((personId) => knownConfirmedIds.add(personId));
      if (confirmedIds.length) continue;

      const displayName = identity.display_name ?? identity.handle ?? identity.thread_key ?? 'Unknown Contact';
      const key = normalizedCandidateKey({
        displayName,
        organizationHint: identity.organization_hint,
        handle: identity.handle,
        threadKey: identity.thread_key
      });
      const candidate = normalizeCandidatePerson({
        display_name: displayName,
        source: 'detected_from_observation',
        confidence: identity.confidence,
        channel_identity_ids: [identity.channel_identity_id],
        source_observation_ids: identity.source_observation_ids ?? [],
        evidence_refs: identity.evidence_refs ?? [],
        tags: unique([identity.platform, identity.metadata?.source_type, 'cold_start_candidate']),
        role_hints: inferRolesForIdentity(identity, defaults).map((role) => role.role),
        organization_hint: identity.organization_hint,
        thread_keys: unique([identity.thread_key]),
        metadata: {
          candidate_key: key,
          detected_from_platform: identity.platform,
          normalized_handle: identity.normalized_handle,
          source_identity_type: identity.identity_type
        }
      });
      candidateByKey.set(key, mergeCandidate(candidateByKey.get(key), candidate));
    }
  }

  for (const person of manualPeople) {
    const displayName = person.display_name ?? person.name;
    const key = normalizedCandidateKey({
      displayName,
      organizationHint: person.organization_hint,
      handle: person.handle_hint,
      threadKey: person.thread_key
    });
    const roles = rolesFromManualPerson(person, defaults);
    const candidate = normalizeCandidatePerson({
      candidate_person_id: person.candidate_person_id,
      display_name: displayName,
      source: 'manual_user_input',
      confidence: person.confidence ?? 0.82,
      channel_identity_ids: person.channel_identity_ids ?? [],
      source_observation_ids: person.source_observation_ids ?? [],
      evidence_refs: unique([...(person.evidence_refs ?? []), 'manual:cold-start-input']),
      tags: unique([...(person.tags ?? []), 'manual_candidate']),
      role_hints: unique(roles.map((role) => role.role)),
      organization_hint: person.organization_hint ?? null,
      thread_keys: unique([person.thread_key, ...(person.thread_keys ?? [])]),
      metadata: {
        candidate_key: key,
        manual_notes: person.notes ?? null
      }
    });
    candidateByKey.set(key, mergeCandidate(candidateByKey.get(key), candidate));
  }

  const candidates = [...candidateByKey.values()];
  for (const candidate of candidates) {
    const sourceManual = candidate.source === 'manual_user_input';
    const manual = manualPeople.find((person) =>
      normalizeIdentityText(person.display_name ?? person.name ?? '') === candidate.normalized_display_name
    );
    const roles = sourceManual && manual
      ? rolesFromManualPerson(manual, defaults)
      : inferRolesForIdentity({
        platform: candidate.tags.find((tag) => ['wechat', 'browser', 'external_chat_export', 'business_api'].includes(tag)) ?? 'unknown',
        confidence: candidate.confidence,
        metadata: { source_type: candidate.tags[0] }
      }, defaults);

    for (const role of roles) {
      roleBindings.push(normalizeRoleBinding({
        candidate_person_id: candidate.candidate_person_id,
        graph_id: role.graph_id,
        scene: role.scene,
        role: role.role,
        role_status: 'candidate',
        tags: unique([...(role.tags ?? []), ...candidate.tags]),
        confidence: Math.min(candidate.confidence, role.confidence ?? candidate.confidence),
        evidence_refs: candidate.evidence_refs,
        source_observation_ids: candidate.source_observation_ids
      }));
      const computed = computeSceneRelationshipWeight({
        distance_tier: role.distance_tier,
        scene: role.scene,
        interaction_count: candidate.source_observation_ids.length,
        recency_days: 7,
        role_importance: role.role_importance,
        user_override_weight: manual?.relationship?.weight ?? null,
        identity_confidence: Math.min(candidate.confidence, role.confidence ?? candidate.confidence),
        candidate: true
      });
      relationshipWeights.push(normalizeSceneRelationshipWeight({
        from_person_id: ownerPersonId,
        candidate_person_id: candidate.candidate_person_id,
        scene: role.scene,
        type_code: role.type_code,
        distance_tier: role.distance_tier,
        status: 'candidate',
        confidence: Math.min(candidate.confidence, role.confidence ?? candidate.confidence),
        weight: computed.weight,
        components: computed.components,
        evidence_refs: candidate.evidence_refs,
        source_observation_ids: candidate.source_observation_ids
      }));
    }
  }

  const candidateResult = writeCandidatePersons(store, candidates, { actor });
  const bindingResult = writeRoleBindings(store, roleBindings, { actor });
  const weightResult = writeSceneRelationshipWeights(store, relationshipWeights, { actor });
  rebuildIdentityIndexes(resolvedIdentityStore, { actor });

  const report = {
    schema_version: SCHEMA_VERSION,
    report_id: stableId('cold_start_person_intro', [Date.now(), candidates.length, roleBindings.length]),
    created_at: nowIso(),
    gate_decision: 'cold_start_candidates_ready_for_confirmation',
    real_execution_allowed: false,
    real_send_attempted: false,
    summary: {
      observations: observations.length,
      manual_people: manualPeople.length,
      candidate_people: candidates.length,
      role_bindings: roleBindings.length,
      scene_relationship_weights: relationshipWeights.length,
      known_confirmed_persons_skipped: knownConfirmedIds.size
    },
    candidates: candidateResult.candidate_persons,
    role_bindings: bindingResult.person_role_bindings,
    scene_relationship_weights: weightResult.scene_relationship_weights,
    operator_next_actions: [
      'Review candidate_person_id, display_name, evidence_refs, tags and role_hints.',
      'Confirm or edit the person and role bindings before writing stable Person/Relationship records.',
      'After confirmation, run confirmColdStartPersonIntroduction so related RawEvent and SemanticEvent references are synchronized without losing candidate history.'
    ]
  };
  writeColdStartAudit(store, {
    action: 'build_cold_start_person_introduction',
    entity_type: 'cold_start_report',
    entity_id: report.report_id,
    actor,
    source_file: store.paths.candidatePersons,
    metadata: report.summary
  });
  return report;
}

function replaceValues(values, valueMap) {
  const original = values ?? [];
  return unique(original.map((value) => valueMap.get(value) ?? value));
}

function changedArray(a, b) {
  return JSON.stringify(a ?? []) !== JSON.stringify(b ?? []);
}

function addIfMissing(values, additions) {
  return unique([...(values ?? []), ...(additions ?? [])]);
}

function rewriteEventReferences(event, {
  syncId,
  personIdMap,
  relationshipIdMap,
  actor,
  syncReason
}) {
  let changed = false;
  const previous = {
    participants: event.participants ?? [],
    linked_person_ids: event.linked_person_ids ?? [],
    linked_relationship_ids: event.linked_relationship_ids ?? []
  };
  const next = {
    ...event,
    metadata: {
      ...(event.metadata ?? {})
    }
  };

  if (Array.isArray(event.participants)) {
    next.participants = replaceValues(event.participants, personIdMap);
    changed ||= changedArray(event.participants, next.participants);
  }
  if (Array.isArray(event.linked_person_ids)) {
    next.linked_person_ids = replaceValues(event.linked_person_ids, personIdMap);
    changed ||= changedArray(event.linked_person_ids, next.linked_person_ids);
  }
  if (Array.isArray(event.linked_relationship_ids)) {
    next.linked_relationship_ids = replaceValues(event.linked_relationship_ids, relationshipIdMap);
    changed ||= changedArray(event.linked_relationship_ids, next.linked_relationship_ids);
  }

  const oldPersonIds = Object.keys(Object.fromEntries(personIdMap));
  const oldRelationshipIds = Object.keys(Object.fromEntries(relationshipIdMap));
  const eventMentionedOldPerson = oldPersonIds.some((personId) =>
    previous.participants.includes(personId) || previous.linked_person_ids.includes(personId)
  );
  const eventMentionedOldRelationship = oldRelationshipIds.some((relationshipId) =>
    previous.linked_relationship_ids.includes(relationshipId)
  );
  if (eventMentionedOldPerson || eventMentionedOldRelationship) {
    const mappedRelationships = [...relationshipIdMap.values()];
    if (mappedRelationships.length) {
      next.linked_relationship_ids = addIfMissing(next.linked_relationship_ids, mappedRelationships);
      changed ||= changedArray(event.linked_relationship_ids, next.linked_relationship_ids);
    }
  }

  if (!changed) return { event, changed: false };

  const syncRecord = {
    sync_id: syncId,
    actor,
    reason: syncReason,
    changed_at: nowIso(),
    previous_person_ids: previous.linked_person_ids,
    next_person_ids: next.linked_person_ids ?? [],
    previous_participants: previous.participants,
    next_participants: next.participants ?? [],
    previous_relationship_ids: previous.linked_relationship_ids,
    next_relationship_ids: next.linked_relationship_ids ?? [],
    person_id_map: Object.fromEntries(personIdMap),
    relationship_id_map: Object.fromEntries(relationshipIdMap)
  };
  next.metadata.relationship_graph_reference_sync_history = [
    ...(next.metadata.relationship_graph_reference_sync_history ?? []),
    syncRecord
  ];
  next.metadata.relationship_graph_reference_sync_latest = syncRecord;
  next.updated_at = nowIso();
  return { event: next, changed: true };
}

export function syncRelationshipGraphReferences({
  storage,
  coldStartStore = null,
  person_id_map = {},
  relationship_id_map = {},
  candidate_person_id = null,
  confirmed_person_id = null,
  actor = 'cold-start-person-introduction',
  syncReason = 'cold_start_person_confirmed'
} = {}) {
  if (!storage) throw new Error('syncRelationshipGraphReferences requires storage');
  const store = initializeColdStartStore(coldStartStore ?? { storage });
  const personMapObject = {
    ...person_id_map
  };
  if (candidate_person_id && confirmed_person_id) {
    personMapObject[candidate_person_id] = confirmed_person_id;
  }
  const personIdMap = new Map(Object.entries(personMapObject).filter(([, value]) => value));
  const relationshipIdMap = new Map(Object.entries(relationship_id_map).filter(([, value]) => value));
  const syncId = stableId('relationship_graph_sync', [
    Date.now(),
    JSON.stringify(Object.fromEntries(personIdMap)),
    JSON.stringify(Object.fromEntries(relationshipIdMap))
  ]);

  const rawEvents = readJsonl(storage.paths.rawEvents);
  const semanticEvents = readJsonl(storage.paths.semanticEvents);
  const rewrittenRaw = rawEvents.map((event) => rewriteEventReferences(event, {
    syncId,
    personIdMap,
    relationshipIdMap,
    actor,
    syncReason
  }));
  const rewrittenSemantic = semanticEvents.map((event) => rewriteEventReferences(event, {
    syncId,
    personIdMap,
    relationshipIdMap,
    actor,
    syncReason
  }));
  const rawChanged = rewrittenRaw.filter((item) => item.changed).length;
  const semanticChanged = rewrittenSemantic.filter((item) => item.changed).length;
  if (rawChanged) {
    writeJsonlAtomic(storage.paths.rawEvents, rewrittenRaw.map((item) => item.event));
  }
  if (semanticChanged) {
    writeJsonlAtomic(storage.paths.semanticEvents, rewrittenSemantic.map((item) => item.event));
  }
  const indexes = rebuildEventIndexes(storage, { actor });
  const report = {
    schema_version: 'relationship_graph_reference_sync.v1',
    sync_id: syncId,
    created_at: nowIso(),
    gate_decision: 'relationship_graph_references_synced',
    history_preserved: true,
    real_execution_allowed: false,
    real_send_attempted: false,
    person_id_map: Object.fromEntries(personIdMap),
    relationship_id_map: Object.fromEntries(relationshipIdMap),
    changed: {
      raw_events: rawChanged,
      semantic_events: semanticChanged
    },
    indexes_rebuilt: Boolean(indexes.personIndex && indexes.relationshipIndex),
    storage_paths: {
      raw_events: storage.paths.rawEvents,
      semantic_events: storage.paths.semanticEvents,
      person_index: storage.paths.personIndex,
      relationship_index: storage.paths.relationshipIndex
    }
  };
  writeColdStartAudit(store, {
    action: 'sync_relationship_graph_references',
    entity_type: 'relationship_graph_reference_sync',
    entity_id: syncId,
    actor,
    source_file: storage.paths.rawEvents,
    metadata: report.changed
  });
  return report;
}

function deriveRelationshipRewriteMap(weights, relationships, explicitMap) {
  const map = { ...(explicitMap ?? {}) };
  if (Object.keys(map).length) return map;
  const confirmedRelationship = relationships[0];
  if (!confirmedRelationship) return map;
  for (const weight of weights) {
    if (weight.status === 'candidate') {
      map[weight.relationship_id] = confirmedRelationship.relationship_id;
    }
  }
  return map;
}

export function confirmColdStartPersonIntroduction({
  storage,
  identityStore = null,
  coldStartStore = null,
  candidate_person_id,
  confirmed_person,
  role_bindings = [],
  relationships = [],
  channel_identity_ids = null,
  relationship_rewrites = {},
  actor = 'cold-start-person-introduction'
} = {}) {
  if (!storage) throw new Error('confirmColdStartPersonIntroduction requires storage');
  if (!candidate_person_id) throw new Error('confirmColdStartPersonIntroduction requires candidate_person_id');
  if (!confirmed_person?.person_id) throw new Error('confirmColdStartPersonIntroduction requires confirmed_person.person_id');
  const store = initializeColdStartStore(coldStartStore ?? { storage });
  const resolvedIdentityStore = initializeIdentityStore(identityStore ?? { storage });
  const snapshot = loadColdStartSnapshot(store);
  const candidate = (snapshot.candidate_persons.candidate_persons ?? [])
    .find((item) => item.candidate_person_id === candidate_person_id);
  if (!candidate) throw new Error(`Candidate person not found: ${candidate_person_id}`);

  const person = {
    aliases: unique([...(confirmed_person.aliases ?? []), candidate.display_name]),
    tags: unique([...(candidate.tags ?? []), ...(confirmed_person.tags ?? []), 'cold_start_confirmed']),
    source: 'cold_start_confirmation',
    ...confirmed_person,
    metadata: {
      ...(confirmed_person.metadata ?? {}),
      cold_start_candidate_person_id: candidate_person_id,
      cold_start_evidence_refs: candidate.evidence_refs
    }
  };
  upsertPeople(storage, [person], { actor });

  const normalizedRelationships = relationships.map((relationship) => ({
    from_person_id: relationship.from_person_id ?? 'user',
    to_person_id: relationship.to_person_id ?? person.person_id,
    type_code: relationship.type_code ?? 'business_contact',
    phase: relationship.phase ?? 'cold_start_confirmed',
    trust_level: relationship.trust_level ?? 'low',
    weights: relationship.weights ?? { from_to: 0.5, to_from: 0.4 },
    recent_event_ids: relationship.recent_event_ids ?? [],
    ...relationship,
    metadata: {
      ...(relationship.metadata ?? {}),
      cold_start_candidate_person_id: candidate_person_id
    }
  }));
  if (normalizedRelationships.length) {
    upsertRelationships(storage, normalizedRelationships, { actor });
  }

  const identityIds = unique(channel_identity_ids ?? candidate.channel_identity_ids ?? []);
  if (identityIds.length) {
    const identitySnapshot = loadIdentitySnapshot(resolvedIdentityStore);
    const identityById = new Map((identitySnapshot.channel_identities.channel_identities ?? [])
      .map((identity) => [identity.channel_identity_id, identity]));
    upsertPersonIdentityLinks(resolvedIdentityStore, identityIds.map((channelIdentityId) => ({
      person_id: person.person_id,
      channel_identity_id: channelIdentityId,
      platform: identityById.get(channelIdentityId)?.platform ?? 'unknown',
      status: 'confirmed',
      verified: true,
      confidence: 0.96,
      confirmed_by: actor,
      evidence_refs: unique([...(candidate.evidence_refs ?? []), 'cold-start-confirmation']),
      thread_keys: unique(identityById.get(channelIdentityId)?.thread_key ? [identityById.get(channelIdentityId).thread_key] : []),
      metadata: {
        cold_start_candidate_person_id: candidate_person_id
      }
    })), { actor });
    rebuildIdentityIndexes(resolvedIdentityStore, { actor });
  }

  const updatedCandidates = (snapshot.candidate_persons.candidate_persons ?? []).map((item) => (
    item.candidate_person_id === candidate_person_id
      ? {
        ...item,
        status: 'confirmed',
        confirmed_person_id: person.person_id,
        confirmed_at: nowIso(),
        requires_user_confirmation: false,
        metadata: {
          ...(item.metadata ?? {}),
          confirmed_by: actor
        }
      }
      : item
  ));
  writeJsonAtomic(store.paths.candidatePersons, {
    schema_version: snapshot.candidate_persons.schema_version ?? 'candidate_person.v1',
    candidate_persons: updatedCandidates
  });

  const inputBindings = role_bindings.length
    ? role_bindings
    : (snapshot.person_role_bindings.person_role_bindings ?? [])
      .filter((binding) => binding.candidate_person_id === candidate_person_id);
  const updatedBindings = [
    ...(snapshot.person_role_bindings.person_role_bindings ?? [])
      .filter((binding) => binding.candidate_person_id !== candidate_person_id),
    ...inputBindings.map((binding) => normalizeRoleBinding({
      ...binding,
      candidate_person_id: null,
      person_id: person.person_id,
      role_status: 'confirmed',
      metadata: {
        ...(binding.metadata ?? {}),
        previous_candidate_person_id: candidate_person_id
      }
    }))
  ];
  writeJsonAtomic(store.paths.personRoleBindings, {
    schema_version: snapshot.person_role_bindings.schema_version ?? 'person_role_binding.v1',
    person_role_bindings: upsertById([], updatedBindings, 'binding_id')
  });

  const candidateWeights = (snapshot.scene_relationship_weights.scene_relationship_weights ?? [])
    .filter((weight) => weight.candidate_person_id === candidate_person_id);
  const rewrites = deriveRelationshipRewriteMap(candidateWeights, normalizedRelationships, relationship_rewrites);
  const updatedWeights = (snapshot.scene_relationship_weights.scene_relationship_weights ?? []).map((weight) => {
    if (weight.candidate_person_id !== candidate_person_id) return weight;
    const relationshipId = rewrites[weight.relationship_id] ?? weight.relationship_id;
    return normalizeSceneRelationshipWeight({
      ...weight,
      relationship_id: relationshipId,
      candidate_person_id: null,
      to_person_id: person.person_id,
      status: 'confirmed',
      components: {
        ...(weight.components ?? {}),
        candidate_cap: 1,
        confirmed_from_candidate_person_id: candidate_person_id
      },
      metadata: {
        ...(weight.metadata ?? {}),
        previous_candidate_person_id: candidate_person_id,
        previous_candidate_relationship_id: weight.relationship_id
      }
    });
  });
  writeJsonAtomic(store.paths.sceneRelationshipWeights, {
    schema_version: snapshot.scene_relationship_weights.schema_version ?? 'scene_relationship_weight.v1',
    scene_relationship_weights: upsertById([], updatedWeights, 'relationship_id')
  });

  const referenceSync = syncRelationshipGraphReferences({
    storage,
    coldStartStore: store,
    candidate_person_id,
    confirmed_person_id: person.person_id,
    relationship_id_map: rewrites,
    actor,
    syncReason: 'cold_start_person_confirmed'
  });

  const storageSnapshot = loadStorageSnapshot(storage);
  const report = {
    schema_version: 'cold_start_person_confirmation.v1',
    confirmation_id: stableId('cold_start_person_confirmation', [candidate_person_id, person.person_id, Date.now()]),
    created_at: nowIso(),
    gate_decision: 'cold_start_person_confirmed_and_graph_synced',
    history_preserved: true,
    real_execution_allowed: false,
    real_send_attempted: false,
    candidate_person_id,
    confirmed_person_id: person.person_id,
    confirmed_relationship_ids: normalizedRelationships.map((relationship) => relationship.relationship_id),
    confirmed_channel_identity_ids: identityIds,
    relationship_rewrites: rewrites,
    event_sync: referenceSync,
    storage_counts: {
      people: storageSnapshot.people.people.length,
      relationships: storageSnapshot.relationships.relationships.length,
      raw_events: storageSnapshot.raw_events.length,
      semantic_events: storageSnapshot.semantic_events.length
    },
    operator_next_actions: [
      'Review the synced RawEvent and SemanticEvent metadata.relationship_graph_reference_sync_history before using the person in strategy generation.',
      'If the user edits roles or relationship distance later, rerun syncRelationshipGraphReferences with the new person/relationship id map.',
      'Keep real sending blocked until a separate controlled-send command passes its own confirmation gate.'
    ]
  };
  writeColdStartAudit(store, {
    action: 'confirm_cold_start_person_introduction',
    entity_type: 'cold_start_person_confirmation',
    entity_id: report.confirmation_id,
    actor,
    source_file: store.paths.candidatePersons,
    metadata: {
      candidate_person_id,
      confirmed_person_id: person.person_id,
      raw_events_synced: referenceSync.changed.raw_events,
      semantic_events_synced: referenceSync.changed.semantic_events
    }
  });
  return report;
}
