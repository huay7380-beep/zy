import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSourceAdapterInitKit,
  mapObservationToRawEvent,
  normalizeIntakeObservation,
  summarizeObservationDeduplication,
  stableSlug,
  validateSourceAdapterConformance
} from '../../intake-runtime/src/index.mjs';
import { buildDecisionRecommendation } from '../../decision-cluster/src/index.mjs';
import {
  analyzePilotIntakeReadiness,
  normalizePilotImportBatch
} from '../../storage-runtime/src/index.mjs';
import { runMvpLoopFromPilotImport } from './mvp-runtime.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function projectRoot() {
  return path.resolve(here, '../../..');
}

function nowIso() {
  return new Date().toISOString();
}

function createRuntimeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function summarizeObservationSet({ normalizedObservations, observationPaths = [] }) {
  const summary = summarizeObservationDeduplication({
    observations: normalizedObservations,
    observationPaths
  });
  return {
    ...summary,
    raw_observations: summary.entries.map((entry) => ({
      observation_id: entry.observation.observation_id,
      source_adapter_id: entry.observation.source_adapter_id,
      source_type: entry.observation.source_type,
      platform: entry.observation.platform,
      source_actor_type: entry.observation.source_actor_type,
      content_fingerprint: entry.content_fingerprint,
      path: entry.path
    }))
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readJsonIfExists(filePath) {
  return filePath && existsSync(filePath) ? readJson(filePath) : null;
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function relativeOrOriginal(root, filePath) {
  if (!filePath) return null;
  const relative = path.relative(root, filePath);
  return relative.startsWith('..') ? filePath : relative.replaceAll(path.sep, '/');
}

function compactId(value, fallback = 'unknown') {
  const slug = stableSlug(value);
  if (/^[a-z0-9_]+$/i.test(slug)) return slug;
  let hash = 0;
  for (const char of String(value ?? fallback)) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return `${fallback}_${Math.abs(hash).toString(36)}`;
}

function normalizeDisplayToken(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase();
}

function normalizeIdentityToken(value) {
  return normalizeDisplayToken(value).replace(/\s+/g, '');
}

function addIdentityToken(tokens, value) {
  const token = normalizeIdentityToken(value);
  if (!token) return;
  tokens.add(token);
  if (token.includes(':')) {
    const [, ...rest] = token.split(':');
    const stripped = rest.join(':');
    if (stripped) tokens.add(stripped);
  }
}

function isGenericDesktopTitle(value) {
  return [
    'wechat',
    'weixin',
    'pc wechat',
    '微信',
    '企业微信',
    'wecom',
    'desktop'
  ].includes(normalizeDisplayToken(value));
}

function isHumanContactObservation(observation) {
  return observation.source_actor_type === 'human_contact';
}

function intimateRelationshipSignals(text = '') {
  const signalMap = [
    ['亲爱的', /亲爱的/u],
    ['男朋友', /男朋友|男友/u],
    ['女朋友', /女朋友|女友/u],
    ['对象', /对象/u],
    ['暧昧', /暧昧/u],
    ['恋爱', /恋爱/u],
    ['关系确认试探', /现在算|算吗|试用期|转正/u],
    ['低强度亲密互动', /喜欢你|想你|抱抱|亲亲|捏捏|不拧巴/u]
  ];
  return signalMap
    .filter(([, pattern]) => pattern.test(text))
    .map(([signal]) => signal);
}

function hasIntimateRelationshipSignal(text = '') {
  return intimateRelationshipSignals(text).length > 0;
}

const confirmedIntimateRelationshipTypes = new Set([
  'romantic_partner',
  'romantic',
  'romantic_interest',
  'lover',
  'partner',
  'boyfriend',
  'girlfriend'
]);

function isConfirmedIntimateRelationship(relationship = {}) {
  const typeCode = String(relationship.type_code ?? '').toLowerCase();
  const phase = String(relationship.phase ?? '').toLowerCase();
  const factStatus = String(relationship.metadata?.relationship_fact_status ?? '').toLowerCase();
  return confirmedIntimateRelationshipTypes.has(typeCode)
    || phase === 'confirmed_romantic'
    || factStatus === 'confirmed';
}

function isUserConfirmedPerson(person = {}) {
  return person.source === 'user_confirmation'
    || person.tags?.includes('confirmed_by_user')
    || person.metadata?.confirmed_by === 'user'
    || person.metadata?.confirmation_source;
}

function isUserConfirmedRelationship(relationship = {}) {
  return relationship.metadata?.relationship_fact_status === 'confirmed'
    || relationship.metadata?.confirmed_by === 'user'
    || relationship.tags?.includes('user_confirmed_relationship');
}

function identityTokensFromObservations(observations = []) {
  const tokens = new Set();
  for (const observation of observations) {
    addIdentityToken(tokens, observation.thread_hint?.thread_key);
    addIdentityToken(tokens, observation.thread_hint?.conversation_title);
    addIdentityToken(tokens, observation.thread_hint?.target_display_name);
    for (const participant of observation.participants_hint ?? []) {
      if (participant !== 'user') addIdentityToken(tokens, participant);
    }
    for (const hint of observation.source_identity_hints ?? []) {
      addIdentityToken(tokens, hint.thread_key);
      addIdentityToken(tokens, hint.display_name);
      addIdentityToken(tokens, hint.remark_name);
      addIdentityToken(tokens, hint.nickname);
      addIdentityToken(tokens, hint.handle);
    }
  }
  return tokens;
}

function identityTokensFromPerson(person = {}) {
  const tokens = new Set();
  addIdentityToken(tokens, person.person_id);
  addIdentityToken(tokens, person.display_name);
  addIdentityToken(tokens, person.metadata?.source_thread_key);
  addIdentityToken(tokens, person.metadata?.thread_key);
  for (const alias of person.aliases ?? []) addIdentityToken(tokens, alias);
  return tokens;
}

function tokenIntersection(left, right) {
  return [...left].filter((token) => right.has(token));
}

function loadConfirmedGraphContext(root = projectRoot()) {
  const peoplePath = path.join(root, 'data/people/people.json');
  const relationshipsPath = path.join(root, 'data/people/relationships.json');
  return {
    people: readJsonIfExists(peoplePath)?.people ?? [],
    relationships: readJsonIfExists(relationshipsPath)?.relationships ?? []
  };
}

function matchConfirmedGraphContext({ observations, people = [], relationships = [] }) {
  const observationTokens = identityTokensFromObservations(observations);
  if (!observationTokens.size) return null;

  const matches = people
    .filter(isUserConfirmedPerson)
    .map((person) => ({
      person,
      matched_tokens: tokenIntersection(observationTokens, identityTokensFromPerson(person))
    }))
    .filter((item) => item.matched_tokens.length > 0);
  if (!matches.length) return null;

  const matchesWithConfirmedRelationship = matches.map((match) => {
    const confirmedRelationships = relationships.filter((relationship) =>
      isUserConfirmedRelationship(relationship)
      && (relationship.to_person_id === match.person.person_id || relationship.from_person_id === match.person.person_id)
    );
    return {
      ...match,
      confirmed_relationships: confirmedRelationships
    };
  });
  const relationshipMatches = matchesWithConfirmedRelationship.filter((match) =>
    match.confirmed_relationships.length > 0
  );
  const selectedMatches = relationshipMatches.length ? relationshipMatches : matchesWithConfirmedRelationship;
  if (selectedMatches.length !== 1) {
    return {
      ambiguous: true,
      matched_person_ids: selectedMatches.map((match) => match.person.person_id),
      matched_tokens: unique(selectedMatches.flatMap((match) => match.matched_tokens))
    };
  }

  const selected = selectedMatches[0];
  const selectedRelationships = selected.confirmed_relationships.length
    ? selected.confirmed_relationships
    : relationships.filter((relationship) =>
      relationship.to_person_id === selected.person.person_id || relationship.from_person_id === selected.person.person_id
    );
  return {
    ambiguous: false,
    people: [selected.person],
    relationships: selectedRelationships,
    primaryPersonId: selected.person.person_id,
    metadata: {
      matched_from_confirmed_graph: true,
      matched_person_id: selected.person.person_id,
      matched_relationship_ids: selectedRelationships.map((relationship) => relationship.relationship_id),
      matched_tokens: selected.matched_tokens,
      previous_candidate_relationship_ids: unique(
        selectedRelationships.map((relationship) => relationship.metadata?.previous_candidate_relationship_id)
      )
    }
  };
}

function sourceActorTypes(observations) {
  return unique(observations.map((observation) => observation.source_actor_type ?? 'unknown'));
}

function inferDisplayName(observations) {
  for (const observation of observations.filter(isHumanContactObservation)) {
    const threadTarget = observation.thread_hint?.target_display_name
      ?? observation.thread_hint?.conversation_title;
    if (threadTarget && !isGenericDesktopTitle(threadTarget)) return threadTarget;
    const identityDisplay = observation.source_identity_hints?.find((hint) => hint.display_name)?.display_name;
    if (identityDisplay && !isGenericDesktopTitle(identityDisplay)) return identityDisplay;
    const participant = observation.participants_hint?.find((item) => item !== 'user');
    if (participant && !isGenericDesktopTitle(participant)) return participant;
  }
  return 'unresolved_source_actor';
}

function inferGoal({ goal = null, observations, primaryPersonId }) {
  const text = observations
    .map((observation) => `${observation.content_summary ?? ''} ${observation.content_text ?? ''}`)
    .join('\n');
  const scene = goal?.scene
    ?? (/客户|预算|报价|合同|评审|接口|部署|meeting|review|budget/i.test(text) ? 'business' : 'social');
  return {
    initial_goal: goal?.initial_goal ?? '基于桌面接收对话生成下一步回复建议',
    scene,
    primary_person_id: goal?.primary_person_id ?? primaryPersonId,
    target_person_ids: goal?.target_person_ids ?? [primaryPersonId],
    preferred_channel: goal?.preferred_channel ?? observations[0]?.thread_hint?.channel ?? observations[0]?.platform ?? 'wechat',
    user_constraints: goal?.user_constraints ?? ['不自动发送', '先生成可编辑草稿', '保留证据和审查结论']
  };
}

function inferPeopleAndRelationships({ observations, people = [], relationships = [], goal = null }) {
  if (people.length && relationships.length) {
    const primaryPersonId = goal?.primary_person_id
      ?? relationships[0]?.to_person_id
      ?? people.find((person) => person.person_id !== 'user')?.person_id
      ?? people[0]?.person_id;
    return { people, relationships, primaryPersonId };
  }

  const actorTypes = sourceActorTypes(observations);
  const allHumanContact = observations.length > 0
    && observations.every(isHumanContactObservation);
  const displayName = inferDisplayName(observations);
  const identityHint = observations.flatMap((observation) => observation.source_identity_hints ?? [])[0] ?? {};
  const text = observations
    .map((observation) => `${observation.content_summary ?? ''}\n${observation.content_text ?? ''}`)
    .join('\n');
  const hasIntimacyCandidate = hasIntimateRelationshipSignal(text);
  const identityKey = identityHint.handle
    ?? identityHint.thread_key
    ?? identityHint.value_hash
    ?? (displayName !== 'unresolved_source_actor' ? displayName : actorTypes.join('_'));
  const primaryPersonId = goal?.primary_person_id
    ?? (allHumanContact
      ? `person_desktop_${compactId(identityKey, 'contact')}`
      : `source_actor_${compactId(identityKey, 'unverified')}`);
  const relationshipId = relationships[0]?.relationship_id ?? `rel_user_${compactId(primaryPersonId, 'desktop')}`;
  const inferredPeople = people.length
    ? people
    : [
        {
          person_id: primaryPersonId,
          display_name: displayName,
          aliases: unique([identityHint.display_name, observations[0]?.thread_hint?.conversation_title]),
          roles: [],
          tags: unique([
            'desktop_intake_candidate',
            allHumanContact ? 'source_actor_type_human_contact' : 'source_actor_requires_confirmation',
            ...actorTypes.map((type) => `source_actor_type_${type}`)
          ]),
          source: 'desktop_context_bridge'
        }
      ];
  const inferredRelationships = relationships.length
    ? relationships
    : [
        {
          relationship_id: relationshipId,
          from_person_id: 'user',
          to_person_id: primaryPersonId,
          type_code: !allHumanContact
            ? 'unverified_source_context'
            : observations.some((observation) =>
              /客户|预算|报价|合同|评审|接口|部署/i.test(`${observation.content_summary ?? ''} ${observation.content_text ?? ''}`)
            ) ? 'client' : 'acquaintance',
          phase: allHumanContact ? 'exploring' : 'requires_identity_confirmation',
          trust_level: allHumanContact ? 'low' : 'unknown',
          health_score: allHumanContact ? 0.55 : null,
          recent_event_ids: [],
          tags: unique([
            hasIntimacyCandidate ? 'candidate_intimate_relationship' : null,
            hasIntimacyCandidate ? 'romantic_intimacy_candidate_unconfirmed' : null
          ]),
          metadata: hasIntimacyCandidate
            ? {
                candidate_relationship_family: 'romantic_intimacy',
                relationship_fact_status: 'candidate_unconfirmed',
                requires_user_confirmation: true
              }
            : {}
        }
      ];
  return { people: inferredPeople, relationships: inferredRelationships, primaryPersonId };
}

function buildCandidateIntimateRelationships({ observations, relationships, primaryPersonId }) {
  const text = observations
    .map((observation) => `${observation.content_summary ?? ''}\n${observation.content_text ?? ''}`)
    .join('\n');
  const signals = intimateRelationshipSignals(text);
  const relationship = relationships.find((item) => item.to_person_id === primaryPersonId);
  const targetObservation = observations.find(isHumanContactObservation) ?? observations[0];
  const targetDisplayName = targetObservation?.thread_hint?.target_display_name
    ?? targetObservation?.thread_hint?.conversation_title
    ?? targetObservation?.source_identity_hints?.find((hint) => hint.display_name)?.display_name
    ?? primaryPersonId;

  if (
    !signals.length
    || !relationship
    || !primaryPersonId
    || primaryPersonId.startsWith('source_actor_')
    || isConfirmedIntimateRelationship(relationship)
  ) {
    return [];
  }

  const evidenceRefs = unique([
    ...observations.map((observation) => observation.observation_id),
    ...observations.flatMap((observation) => observation.raw_artifact_refs ?? []),
    ...observations.map((observation) => observation.screenshot_hash)
  ]);

  return [
    {
      schema_version: 'candidate_intimate_relationship.v1',
      candidate_relationship_id: `candidate_intimacy_${compactId(relationship.relationship_id, 'relationship')}`,
      status: 'candidate',
      relationship_family: 'romantic_intimacy',
      type_code: 'romantic_intimacy_candidate',
      scene: 'social_intimacy',
      from_person_id: 'user',
      to_person_id: primaryPersonId,
      target_display_name: targetDisplayName,
      linked_relationship_id: relationship.relationship_id,
      source_observation_ids: observations.map((observation) => observation.observation_id),
      evidence_refs: evidenceRefs,
      evidence_signals: signals,
      distance_tier: 'active_contact',
      confidence: Number(Math.min(0.78, 0.52 + signals.length * 0.06).toFixed(2)),
      weight: 0.58,
      weight_cap_before_confirmation: 0.68,
      requires_user_confirmation: true,
      promotion_requirements: [
        '确认目标人物身份与当前微信联系人一致。',
        '确认双方关系标签是否应升级为恋爱、暧昧、普通朋友或其他用户自定义标签。',
        '至少保留一条来自用户或后续聊天反馈的关系确认证据。'
      ],
      metadata: {
        source: 'desktop_context_bridge',
        inferred_from: 'personal_relationship_signal',
        not_confirmed_relationship_fact: true,
        real_execution_allowed: false
      }
    }
  ];
}

function hasUserConfirmedRelationship(relationships = []) {
  return relationships.some((relationship) =>
    relationship.metadata?.relationship_fact_status === 'confirmed'
    || relationship.metadata?.confirmed_by === 'user'
    || relationship.tags?.includes('user_confirmed_relationship')
  );
}

function inferIdentityGateDecision(observations, { relationships = [] } = {}) {
  if (hasUserConfirmedRelationship(relationships)) return 'identity_confirmed_by_user_context';
  const explicit = observations.find((observation) => observation.metadata?.identity_gate_decision)
    ?.metadata?.identity_gate_decision;
  if (explicit) return explicit;
  const actorTypes = sourceActorTypes(observations);
  if (actorTypes.length === 1 && actorTypes[0] === 'human_contact') return 'identity_unverified_desktop_context';
  if (actorTypes.includes('unknown')) return 'source_actor_unknown_requires_user_confirmation';
  return 'source_actor_not_human_contact';
}

function recordFromObservation({ observation, rawEvent, primaryPersonId, relationshipIds, identityContinuity = null }) {
  return {
    record_id: observation.observation_id,
    event_id: rawEvent.event_id,
    event_kind: rawEvent.event_kind,
    source: rawEvent.source,
    source_ref: rawEvent.source_ref,
    occurred_at: rawEvent.occurred_at,
    speaker_person_id: rawEvent.linked_person_ids?.[0] ?? primaryPersonId,
    participant_person_ids: unique(['user', primaryPersonId, ...(rawEvent.participants ?? [])]),
    target_person_ids: [primaryPersonId],
    content: rawEvent.content ?? rawEvent.content_summary,
    content_summary: rawEvent.content_summary,
    linked_person_ids: unique([primaryPersonId, ...(rawEvent.linked_person_ids ?? [])]),
    linked_relationship_ids: relationshipIds,
    evidence_refs: [
      rawEvent.source_ref?.raw_artifact_refs?.[0],
      rawEvent.source_ref?.screenshot_hash,
      observation.observation_id
    ].filter(Boolean),
    metadata: {
      ...rawEvent.metadata,
      bridge_source: 'desktop_context_bridge',
      identity_continuity: identityContinuity,
      real_execution_allowed: false,
      real_send_attempted: false
    }
  };
}

function semanticEventsToGraphEvents(events) {
  return events.map((event) => ({
    event_id: event.event_id,
    start_at: event.occurred_at ?? event.created_at ?? nowIso(),
    status: event.status === 'confirmed' ? 'completed' : 'planned',
    event_level: event.event_level,
    event_type_code: event.event_type_code,
    title: event.tags?.join(' / ') ?? event.event_type_code,
    description: event.evidence?.join('；') ?? '',
    importance: event.weight,
    sentiment_score: 0,
    source: 'desktop_context_bridge',
    confidence: event.confidence,
    participants: (event.linked_person_ids ?? []).map((person_id) => ({
      person_id,
      role: 'target',
      impact_factor: 0.8
    })),
    clues: event.evidence ?? []
  }));
}

function buildSocialGraphFromImport(normalizedImport) {
  return {
    user_id: 'user',
    people: normalizedImport.people,
    relationships: normalizedImport.relationships,
    events: semanticEventsToGraphEvents(normalizedImport.semantic_events)
  };
}

export function buildDesktopContextBridge({
  observations,
  observationPaths = [],
  goal = null,
  people = [],
  relationships = [],
  graphRoot = projectRoot(),
  userPreferences = {
    risk_tolerance: 'low',
    relationship_priority: 'high',
    automation_comfort: 'low',
    preferred_channels: ['wechat'],
    disliked_actions: ['strong_pressure']
  }
} = {}) {
  const loadedObservations = observations ?? observationPaths.map(readJson);
  if (!Array.isArray(loadedObservations) || loadedObservations.length === 0) {
    throw new Error('buildDesktopContextBridge requires at least one IntakeObservation');
  }
  const rawNormalizedObservations = loadedObservations.map(normalizeIntakeObservation);
  const observationSet = summarizeObservationSet({
    normalizedObservations: rawNormalizedObservations,
    observationPaths
  });
  const normalizedObservations = observationSet.effective_observations;
  const rawEvents = normalizedObservations.map((observation) => mapObservationToRawEvent(observation));
  const confirmedGraph = (!people.length && !relationships.length)
    ? matchConfirmedGraphContext({
      observations: normalizedObservations,
      ...loadConfirmedGraphContext(graphRoot)
    })
    : null;
  const graphPeople = confirmedGraph?.people ?? people;
  const graphRelationships = confirmedGraph?.relationships ?? relationships;
  const inferred = inferPeopleAndRelationships({
    observations: normalizedObservations,
    people: graphPeople,
    relationships: graphRelationships,
    goal
  });
  const normalizedGoal = inferGoal({
    goal,
    observations: normalizedObservations,
    primaryPersonId: inferred.primaryPersonId
  });
  const relationshipIds = inferred.relationships.map((relationship) => relationship.relationship_id);
  const bridgeId = createRuntimeId('desktop_context_bridge');
  const pilotImportBatch = {
    schema_version: '0.1.0',
    import_id: bridgeId,
    goal: normalizedGoal,
    people: inferred.people,
    relationships: inferred.relationships,
    records: normalizedObservations.map((observation, index) =>
      recordFromObservation({
        observation,
        rawEvent: rawEvents[index],
        primaryPersonId: inferred.primaryPersonId,
        relationshipIds,
        identityContinuity: confirmedGraph?.metadata ?? (
          confirmedGraph?.ambiguous
            ? {
                matched_from_confirmed_graph: false,
                ambiguous_confirmed_identity_match: true,
                matched_person_ids: confirmedGraph.matched_person_ids,
                matched_tokens: confirmedGraph.matched_tokens
              }
            : null
        )
      })
    ),
    semantic_hints: [],
    feedback_records: []
  };
  const candidateIntimateRelationships = buildCandidateIntimateRelationships({
    observations: normalizedObservations,
    relationships: pilotImportBatch.relationships,
    primaryPersonId: inferred.primaryPersonId
  });
  if (candidateIntimateRelationships.length) {
    pilotImportBatch.relationships = pilotImportBatch.relationships.map((relationship) => {
      const candidate = candidateIntimateRelationships.find((item) =>
        item.linked_relationship_id === relationship.relationship_id
      );
      if (!candidate) return relationship;
      return {
        ...relationship,
        metadata: {
          ...(relationship.metadata ?? {}),
          candidate_intimate_relationship_id: candidate.candidate_relationship_id,
          candidate_relationship_family: candidate.relationship_family,
          relationship_fact_status: 'candidate_unconfirmed',
          requires_user_confirmation: true
        }
      };
    });
  }
  const normalizedImport = normalizePilotImportBatch(pilotImportBatch);
  const socialGraph = buildSocialGraphFromImport(normalizedImport);
  const contextInput = unique(normalizedImport.raw_events
    .flatMap((event) => [event.content_summary, event.content]))
    .filter(Boolean)
    .join('；');
  const goalInput = {
    ...normalizedGoal,
    source_type: 'desktop',
    platform: normalizedObservations[0]?.platform ?? 'desktop',
    identity_gate_decision: inferIdentityGateDecision(normalizedObservations, {
      relationships: pilotImportBatch.relationships
    }),
    context_input: contextInput,
    target_person_ids: normalizedGoal.target_person_ids?.length
      ? normalizedGoal.target_person_ids
      : [inferred.primaryPersonId]
  };
  const decision = buildDecisionRecommendation({
    goalInput,
    socialGraph,
    rawEvents: normalizedImport.raw_events,
    userPreferences
  });

  return {
    schema_version: 'desktop_context_bridge.v1',
    bridge_id: bridgeId,
    created_at: nowIso(),
    gate_decision: 'desktop_context_ready_for_decision_trial',
    real_execution_allowed: false,
    real_send_attempted: false,
    observation_count: observationSet.effective_observation_count,
    raw_observation_count: observationSet.raw_observation_count,
    effective_observation_count: observationSet.effective_observation_count,
    duplicate_suppressed_count: observationSet.duplicate_suppressed_count,
    duplicate_observation_groups: observationSet.duplicate_observation_groups,
    observation_groups: observationSet.observation_groups,
    observation_paths: observationSet.effective_observation_paths,
    raw_observation_paths: observationSet.raw_observation_paths,
    pilot_import_batch: pilotImportBatch,
    candidate_intimate_relationships: candidateIntimateRelationships,
    identity_continuity: confirmedGraph?.metadata ?? (
      confirmedGraph?.ambiguous
        ? {
            matched_from_confirmed_graph: false,
            ambiguous_confirmed_identity_match: true,
            matched_person_ids: confirmedGraph.matched_person_ids,
            matched_tokens: confirmedGraph.matched_tokens
          }
        : null
    ),
    normalized_import_summary: normalizedImport.summary,
    context_snapshot: decision.context_snapshot,
    decision_id: decision.decision_id,
    expert_matrix_analysis: decision.expert_matrix_analysis,
    theoretical_prediction: decision.theoretical_prediction,
    independent_review: decision.independent_review,
    message_draft: decision.recommended_option.message_draft,
    decision,
    checks: [
      {
        check_id: 'desktop_observations_present',
        status: 'pass',
        evidence: [
          `raw_observation_count=${observationSet.raw_observation_count}`,
          `effective_observation_count=${observationSet.effective_observation_count}`,
          `duplicate_suppressed_count=${observationSet.duplicate_suppressed_count}`
        ]
      },
      {
        check_id: 'duplicate_observations_deduplicated_for_pilot_import',
        status: 'pass',
        evidence: [
          `duplicate_groups=${observationSet.duplicate_observation_groups.length}`,
          `records=${pilotImportBatch.records.length}`
        ]
      },
      {
        check_id: 'context_snapshot_built',
        status: decision.context_snapshot?.schema_version === 'context_snapshot.v1' ? 'pass' : 'fail',
        evidence: [`snapshot_id=${decision.context_snapshot?.snapshot_id ?? 'missing'}`]
      },
      {
        check_id: 'parallel_expert_matrix_built',
        status: decision.expert_matrix_analysis?.parallel_analysis?.parallelizable ? 'pass' : 'fail',
        evidence: [
          `expert_count=${decision.expert_matrix_analysis?.parallel_analysis?.completed_expert_count ?? 0}`,
          `mode=${decision.expert_matrix_analysis?.execution_mode ?? 'missing'}`
        ]
      },
      {
        check_id: 'message_draft_generated',
        status: decision.recommended_option.message_draft?.draft ? 'pass' : 'fail',
        evidence: [`draft_length=${decision.recommended_option.message_draft?.draft?.length ?? 0}`]
      },
      {
        check_id: 'real_send_blocked',
        status: decision.independent_review?.real_execution_allowed === false ? 'pass' : 'fail',
        evidence: [`real_execution_allowed=${decision.independent_review?.real_execution_allowed}`]
      }
    ]
  };
}

function renderMarkdown(bridge) {
  const duplicateGroups = bridge.duplicate_observation_groups?.length
    ? bridge.duplicate_observation_groups
      .map((group) => `| ${group.observation_id} | ${group.count} | ${group.platform ?? 'unknown'} | ${(group.paths ?? []).join('<br>') || 'no_path'} |`)
      .join('\n')
    : '| none | 0 | none | none |';
  return `# Desktop Context Bridge

- bridge_id: ${bridge.bridge_id}
- gate_decision: ${bridge.gate_decision}
- observation_count: ${bridge.observation_count}
- raw_observation_count: ${bridge.raw_observation_count}
- effective_observation_count: ${bridge.effective_observation_count}
- duplicate_suppressed_count: ${bridge.duplicate_suppressed_count}
- decision_id: ${bridge.decision_id}
- real_execution_allowed: ${bridge.real_execution_allowed}

## Duplicate Observation Groups

| observation_id | count | platform | paths |
| --- | --- | --- | --- |
${duplicateGroups}

## Context Snapshot

- schema_version: ${bridge.context_snapshot.schema_version}
- snapshot_id: ${bridge.context_snapshot.snapshot_id}
- context_sufficiency_score: ${bridge.context_snapshot.context_sufficiency_score}
- context_sufficiency_level: ${bridge.context_snapshot.context_sufficiency_level}

## Parallel Expert Matrix

- schema_version: ${bridge.expert_matrix_analysis.schema_version}
- execution_mode: ${bridge.expert_matrix_analysis.execution_mode}
- parallelizable: ${bridge.expert_matrix_analysis.parallel_analysis.parallelizable}
- expert_count: ${bridge.expert_matrix_analysis.parallel_analysis.completed_expert_count}
- selected_experts: ${bridge.expert_matrix_analysis.selected_expert_ids.join(', ')}

## Theoretical Prediction

- ranking_basis: ${bridge.theoretical_prediction.ranking_basis}
- top_hypothesis: ${bridge.theoretical_prediction.top_prediction.hypothesis_id}
- top_score: ${bridge.theoretical_prediction.top_prediction.predictive_value_score}

## Independent Review

- output_level: ${bridge.independent_review.output_level}
- real_execution_allowed: ${bridge.independent_review.real_execution_allowed}
- review_summary: ${bridge.independent_review.review_summary}

## Message Draft

${bridge.message_draft.draft}

## Checks

${bridge.checks.map((check) => `- ${check.status.toUpperCase()} ${check.check_id}: ${check.evidence.join('; ')}`).join('\n')}
`;
}

export function writeDesktopContextBridge({
  bridge,
  outputDir = path.join(projectRoot(), 'runtime/desktop-context-bridges', bridge.bridge_id)
}) {
  ensureDir(outputDir);
  const jsonPath = path.join(outputDir, 'desktop-context-bridge.json');
  const markdownPath = path.join(outputDir, 'desktop-context-bridge.md');
  const pilotImportPath = path.join(outputDir, 'pilot-import.generated.json');
  const contextSnapshotPath = path.join(outputDir, 'context-snapshot.json');
  writeFileSync(jsonPath, `${JSON.stringify(bridge, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdown(bridge), 'utf8');
  writeFileSync(pilotImportPath, `${JSON.stringify(bridge.pilot_import_batch, null, 2)}\n`, 'utf8');
  writeFileSync(contextSnapshotPath, `${JSON.stringify(bridge.context_snapshot, null, 2)}\n`, 'utf8');
  return {
    output_dir: outputDir,
    json_path: jsonPath,
    markdown_path: markdownPath,
    pilot_import_path: pilotImportPath,
    context_snapshot_path: contextSnapshotPath
  };
}

function defaultConformancePairs(root) {
  return [
    {
      source_id: 'desktop_wechat_sample',
      capability_path: path.join(root, 'examples/source-adapter-capability.sample.json'),
      observation_path: path.join(root, 'examples/intake-observation.sightflow.sample.json')
    },
    {
      source_id: 'browser_dom_sample',
      capability_path: path.join(root, 'examples/source-adapter-capability.browser.sample.json'),
      observation_path: path.join(root, 'examples/intake-observation.browser.sample.json')
    },
    {
      source_id: 'external_chat_export_sample',
      capability_path: path.join(root, 'examples/source-adapter-capability.external-chat-export.sample.json'),
      observation_path: path.join(root, 'examples/intake-observation.external-chat-export.sample.json')
    },
    {
      source_id: 'business_api_sample',
      capability_path: path.join(root, 'examples/source-adapter-capability.business-api.sample.json'),
      observation_path: path.join(root, 'examples/intake-observation.business-api.sample.json')
    }
  ];
}

function buildConformanceResults({ root, pairs }) {
  return pairs.map((pair) => {
    const capability = readJsonIfExists(pair.capability_path);
    const observation = readJsonIfExists(pair.observation_path);
    if (!capability || !observation) {
      return {
        source_id: pair.source_id,
        ready_for_intake: false,
        gate_decision: 'source_adapter_not_conformant',
        required_failures: [
          !capability ? 'capability_file_missing' : null,
          !observation ? 'observation_file_missing' : null
        ].filter(Boolean),
        capability_path: relativeOrOriginal(root, pair.capability_path),
        observation_path: relativeOrOriginal(root, pair.observation_path)
      };
    }
    const conformance = validateSourceAdapterConformance({
      capability,
      observation,
      capabilityPath: relativeOrOriginal(root, pair.capability_path),
      observationPath: relativeOrOriginal(root, pair.observation_path)
    });
    return {
      source_id: pair.source_id,
      adapter_id: conformance.adapter_id,
      source_type: conformance.source_type,
      platform: conformance.platform,
      ready_for_intake: conformance.ready_for_intake,
      gate_decision: conformance.gate_decision,
      required_failures: conformance.required_failures,
      raw_event_preview_present: Boolean(conformance.raw_event_preview),
      capability_path: relativeOrOriginal(root, pair.capability_path),
      observation_path: relativeOrOriginal(root, pair.observation_path)
    };
  });
}

function summarizeObservationExpansion({ root, observationPaths }) {
  const summaries = observationPaths.map((observationPath) => {
    try {
      const observation = normalizeIntakeObservation(readJson(observationPath));
      const rawEvent = mapObservationToRawEvent(observation);
      return {
        observation_path: relativeOrOriginal(root, observationPath),
        observation_id: observation.observation_id,
        source_adapter_id: observation.source_adapter_id,
        source_type: observation.source_type,
        platform: observation.platform,
        privacy_level: observation.privacy_level,
        confidence: observation.confidence,
        raw_event_id: rawEvent.event_id,
        raw_event_source: rawEvent.source,
        can_map_to_raw_event: true,
        real_execution_allowed: observation.metadata?.real_execution_allowed === true,
        real_send_attempted: observation.metadata?.real_send_attempted === true
      };
    } catch (error) {
      return {
        observation_path: relativeOrOriginal(root, observationPath),
        can_map_to_raw_event: false,
        required_failure: error.message
      };
    }
  });
  const groups = summaries.reduce((acc, item) => {
    const key = item.observation_id ?? `unmapped:${item.observation_path}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const effectiveObservations = Object.values(groups).map((items) => items[0]).filter(Boolean);
  const duplicateGroups = Object.entries(groups)
    .filter(([observationId, items]) => !observationId.startsWith('unmapped:') && items.length > 1)
    .map(([observationId, items]) => ({
      observation_id: observationId,
      count: items.length,
      source_type: items[0]?.source_type ?? null,
      platform: items[0]?.platform ?? null,
      representative_path: items[0]?.observation_path ?? null,
      paths: items.map((item) => item.observation_path).filter(Boolean)
    }));
  return {
    raw_observation_count: summaries.length,
    effective_observation_count: effectiveObservations.length,
    duplicate_suppressed_count: summaries.length - effectiveObservations.length,
    duplicate_observation_groups: duplicateGroups,
    raw_observations: summaries,
    observations: effectiveObservations,
    effective_observation_paths: effectiveObservations.map((item) => item.observation_path).filter(Boolean)
  };
}

function buildFutureAdapterKits() {
  return [
    buildSourceAdapterInitKit({
      adapterId: 'business_api.next',
      sourceType: 'api',
      platform: 'business_system',
      canSend: false,
      generatedBy: 'read_only_expansion_graph_loop_verification'
    }),
    buildSourceAdapterInitKit({
      adapterId: 'chat_tool_file.next',
      sourceType: 'file',
      platform: 'external_chat_export',
      canSend: false,
      generatedBy: 'read_only_expansion_graph_loop_verification'
    }),
    buildSourceAdapterInitKit({
      adapterId: 'webhook_event.next',
      sourceType: 'webhook',
      platform: 'external_event_api',
      canSend: false,
      generatedBy: 'read_only_expansion_graph_loop_verification'
    })
  ].map((kit) => ({
    adapter_id: kit.adapter_id,
    source_type: kit.source_type,
    platform: kit.platform,
    can_send_requested: kit.can_send_requested,
    safety_defaults: kit.safety_defaults,
    validation_command: 'npm.cmd run intake:adapter:validate -- --capability=<capability.json> --observation=<intake-observation.json> --fail-on-required'
  }));
}

function loopPathFromResult(result) {
  const writebackEvents = result.storage_snapshot?.semantic_events?.filter(
    (event) => event.metadata?.generated_by === 'mvp_runtime_import_feedback_writeback'
  ) ?? [];
  const people = result.storage_snapshot?.people?.people ?? result.storage_snapshot?.people ?? [];
  const relationships = result.storage_snapshot?.relationships?.relationships ?? result.storage_snapshot?.relationships ?? [];
  const expertMatrix = result.decision?.expert_matrix_analysis ?? result.expert_matrix_analysis ?? {};
  const theoreticalPrediction = result.decision?.theoretical_prediction ?? result.theoretical_prediction ?? {};
  const messageDraft = result.decision?.recommended_option?.message_draft
    ?? result.recommended_option?.message_draft
    ?? result.message_draft
    ?? {};
  return {
    dialogue_input: {
      raw_events: result.raw_events,
      import_id: result.import_id,
      evidence: [
        `raw_events=${result.raw_events}`,
        `import_id=${result.import_id}`
      ]
    },
    relationship_event_graph: {
      people: people.length ?? 0,
      relationships: relationships.length ?? 0,
      semantic_events: result.storage_snapshot?.semantic_events?.length ?? 0,
      evidence: [
        `people=${people.length ?? 0}`,
        `relationships=${relationships.length ?? 0}`,
        `semantic_events=${result.storage_snapshot?.semantic_events?.length ?? 0}`
      ]
    },
    expert_weight_judgment: {
      weights: result.decision?.weights ?? {},
      selected_expert_ids: expertMatrix.selected_expert_ids ?? [],
      completed_expert_count: expertMatrix.parallel_analysis?.completed_expert_count ?? 0,
      theoretical_top_hypothesis: theoreticalPrediction.top_prediction?.hypothesis_id ?? null,
      ranking_basis: theoreticalPrediction.ranking_basis ?? null
    },
    draft_output: {
      decision_id: result.decision_id,
      draft_present: typeof messageDraft === 'string' ? messageDraft.length > 0 : Boolean(messageDraft.draft),
      draft_chars: typeof messageDraft === 'string' ? messageDraft.length : messageDraft.draft?.length ?? 0,
      must_confirm_before_send: typeof messageDraft === 'string'
        ? true
        : messageDraft.must_confirm_before_send === true
    },
    feedback_writeback: {
      feedback_id: result.feedback_id,
      feedback_complete: result.quality?.feedback_complete === true,
      writeback_complete: result.quality?.writeback_complete === true,
      writeback_event_ids: writebackEvents.map((event) => event.event_id),
      index_rebuild_complete: result.quality?.index_rebuild_complete === true,
      audit_complete: result.quality?.audit_complete === true
    }
  };
}

function buildCheck(passed, checkId, evidence, severity = 'required') {
  return {
    check_id: checkId,
    severity,
    status: passed ? 'pass' : 'fail',
    passed: Boolean(passed),
    evidence
  };
}

export function buildReadOnlyExpansionGraphLoopVerification({
  root = projectRoot(),
  pilotImportPath = path.join(root, 'runtime/user-inputs/pilot-import.real.json'),
  observationPaths = [],
  conformancePairs = defaultConformancePairs(root),
  runClosedLoop = true,
  userPreferences = {
    risk_tolerance: 'low',
    relationship_priority: 'high',
    automation_comfort: 'low',
    preferred_channels: ['wechat'],
    disliked_actions: ['strong_pressure']
  }
} = {}) {
  const verificationId = createRuntimeId('read_only_expansion_graph_loop');
  const pilotBatch = readJson(pilotImportPath);
  const normalizedImport = normalizePilotImportBatch(pilotBatch);
  const readiness = analyzePilotIntakeReadiness(normalizedImport, {
    inputPath: pilotImportPath
  });
  const observationExpansion = summarizeObservationExpansion({ root, observationPaths });
  const conformance = buildConformanceResults({ root, pairs: conformancePairs });
  const loopResult = runClosedLoop
    ? runMvpLoopFromPilotImport({
      root,
      importPath: pilotImportPath,
      userPreferences
    })
    : null;
  const loopPath = loopResult ? loopPathFromResult(loopResult) : null;
  const checks = [
    buildCheck(
      readiness.ready_for_closed_loop_mvp === true,
      'pilot_import_ready_for_closed_loop',
      [
        `gate_decision=${readiness.gate_decision}`,
        `required_failures=${readiness.required_failures.join(',') || 'none'}`,
        `raw_events=${normalizedImport.raw_events.length}`,
        `feedback_records=${normalizedImport.feedback_records.length}`
      ]
    ),
    buildCheck(
      observationExpansion.observations.every((item) => item.can_map_to_raw_event !== false && item.real_execution_allowed !== true && item.real_send_attempted !== true),
      'read_only_observations_map_to_raw_event',
      [
        `raw_observations=${observationExpansion.raw_observation_count}`,
        `effective_observations=${observationExpansion.effective_observation_count}`,
        `duplicates_suppressed=${observationExpansion.duplicate_suppressed_count}`,
        `mapped=${observationExpansion.observations.filter((item) => item.can_map_to_raw_event).length}`,
        `real_send_attempted=${observationExpansion.observations.some((item) => item.real_send_attempted === true)}`
      ],
      observationExpansion.effective_observation_count ? 'required' : 'warning'
    ),
    buildCheck(
      conformance.filter((item) => item.ready_for_intake).length >= 2,
      'multiple_source_adapters_share_intake_gate',
      [
        `conformant=${conformance.filter((item) => item.ready_for_intake).length}`,
        `checked=${conformance.length}`,
        `adapters=${conformance.map((item) => item.adapter_id ?? item.source_id).join(',')}`
      ]
    ),
    buildCheck(
      loopResult?.quality?.closed_loop_complete === true,
      'current_sample_closed_loop_complete',
      [
        `run_id=${loopResult?.run_id ?? 'not_run'}`,
        `closed_loop_complete=${loopResult?.quality?.closed_loop_complete}`,
        `real_execution_allowed=${loopResult?.quality?.real_execution_allowed}`
      ]
    ),
    buildCheck(
      Boolean(loopPath?.relationship_event_graph?.relationships && loopPath.relationship_event_graph.semantic_events),
      'relationship_and_event_graph_written',
      loopPath?.relationship_event_graph?.evidence ?? ['loop_not_run']
    ),
    buildCheck(
      Boolean(loopPath?.expert_weight_judgment?.completed_expert_count >= 3
        && Object.keys(loopPath.expert_weight_judgment.weights ?? {}).length > 0),
      'expert_weight_judgment_present',
      [
        `completed_expert_count=${loopPath?.expert_weight_judgment?.completed_expert_count ?? 0}`,
        `weights=${Object.keys(loopPath?.expert_weight_judgment?.weights ?? {}).join(',') || 'none'}`,
        `ranking_basis=${loopPath?.expert_weight_judgment?.ranking_basis ?? 'missing'}`
      ]
    ),
    buildCheck(
      loopPath?.draft_output?.draft_present === true && loopPath?.draft_output?.must_confirm_before_send === true,
      'message_draft_generated_and_confirm_gated',
      [
        `draft_chars=${loopPath?.draft_output?.draft_chars ?? 0}`,
        `must_confirm_before_send=${loopPath?.draft_output?.must_confirm_before_send}`
      ]
    ),
    buildCheck(
      loopPath?.feedback_writeback?.feedback_complete === true
        && loopPath?.feedback_writeback?.writeback_complete === true
        && loopPath?.feedback_writeback?.writeback_event_ids.length > 0,
      'feedback_writeback_index_audit_complete',
      [
        `feedback_complete=${loopPath?.feedback_writeback?.feedback_complete}`,
        `writeback_complete=${loopPath?.feedback_writeback?.writeback_complete}`,
        `writeback_events=${loopPath?.feedback_writeback?.writeback_event_ids.length ?? 0}`,
        `index_rebuild_complete=${loopPath?.feedback_writeback?.index_rebuild_complete}`,
        `audit_complete=${loopPath?.feedback_writeback?.audit_complete}`
      ]
    )
  ];
  const requiredFailures = checks
    .filter((item) => item.severity === 'required' && !item.passed)
    .map((item) => item.check_id);
  return {
    schema_version: 'read_only_expansion_graph_loop_verification.v1',
    verification_id: verificationId,
    created_at: nowIso(),
    gate_decision: requiredFailures.length
      ? 'read_only_expansion_graph_loop_needs_attention'
      : 'read_only_expansion_graph_loop_verified',
    real_execution_allowed: false,
    real_send_attempted: false,
    source: {
      root,
      pilot_import_path: relativeOrOriginal(root, pilotImportPath),
      observation_paths: observationPaths.map((item) => relativeOrOriginal(root, item)),
      effective_observation_paths: observationExpansion.effective_observation_paths
    },
    read_only_expansion: {
      pilot_import: {
        import_id: normalizedImport.import_id,
        raw_events: normalizedImport.raw_events.length,
        semantic_events: normalizedImport.semantic_events.length,
        feedback_records: normalizedImport.feedback_records.length,
        gate_decision: readiness.gate_decision,
        ready_for_closed_loop_mvp: readiness.ready_for_closed_loop_mvp,
        required_failures: readiness.required_failures
      },
      raw_observation_count: observationExpansion.raw_observation_count,
      effective_observation_count: observationExpansion.effective_observation_count,
      duplicate_suppressed_count: observationExpansion.duplicate_suppressed_count,
      duplicate_observation_groups: observationExpansion.duplicate_observation_groups,
      raw_observations: observationExpansion.raw_observations,
      observations: observationExpansion.observations,
      source_adapter_conformance: conformance,
      reusable_gate_sequence: [
        'SourceAdapterCapability',
        'IntakeObservation',
        'source_adapter_conformance.v1',
        'RawEvent',
        'PilotImportBatch',
        'pilot_intake_readiness.v1',
        'mvp_loop_from_pilot_import'
      ]
    },
    graph_closed_loop: loopResult
      ? {
        run_id: loopResult.run_id,
        quality: loopResult.quality,
        path: loopPath,
        real_execution_allowed: loopResult.quality?.real_execution_allowed === true
      }
      : null,
    future_intake_path: {
      adapter_templates: buildFutureAdapterKits(),
      no_rewrite_rule: 'New software must provide SourceAdapterCapability and IntakeObservation, pass conformance, then reuse RawEvent/PilotImportBatch gates before decision or send dry-run.',
      blocked_actions: [
        'direct_message_send_without_SendCommand',
        'direct_decision_input_without_RawEvent',
        'identity_merge_without_confirmation',
        'real_execution_before_user_confirmation'
      ]
    },
    checks,
    required_failures: requiredFailures,
    next_actions: requiredFailures.length
      ? [
        'Fix failed required checks before expanding samples or adding a real connector.',
        'Keep all new adapters on SourceAdapterCapability + IntakeObservation + conformance before PilotImportBatch.'
      ]
      : [
        'Use the same gate sequence for additional WeChat screenshots, browser DOM captures, chat exports or business-system API events.',
        'Collect user special-test feedback separately before issue-register closure or connector expansion.'
      ]
  };
}

function renderVerificationMarkdown(report) {
  const checks = report.checks
    .map((item) => `- ${item.status.toUpperCase()} ${item.check_id}: ${(item.evidence ?? []).join('; ')}`)
    .join('\n');
  const conformance = report.read_only_expansion.source_adapter_conformance
    .map((item) => `- ${item.source_id}: ${item.gate_decision} (${item.source_type}/${item.platform})`)
    .join('\n');
  const duplicateGroups = report.read_only_expansion.duplicate_observation_groups?.length
    ? report.read_only_expansion.duplicate_observation_groups
      .map((group) => `| ${group.observation_id} | ${group.count} | ${group.platform ?? 'unknown'} | ${(group.paths ?? []).join('<br>') || 'no_path'} |`)
      .join('\n')
    : '| none | 0 | none | none |';
  return `# Read-Only Expansion And Graph Loop Verification

- verification_id: ${report.verification_id}
- gate_decision: ${report.gate_decision}
- real_execution_allowed: ${report.real_execution_allowed}
- real_send_attempted: ${report.real_send_attempted}
- pilot_import: ${report.source.pilot_import_path}
- run_id: ${report.graph_closed_loop?.run_id ?? 'not_run'}
- raw_observation_count: ${report.read_only_expansion.raw_observation_count}
- effective_observation_count: ${report.read_only_expansion.effective_observation_count}
- duplicate_suppressed_count: ${report.read_only_expansion.duplicate_suppressed_count}

## Duplicate Observation Groups

| observation_id | count | platform | paths |
| --- | --- | --- | --- |
${duplicateGroups}

## Source Adapter Conformance

${conformance || '- none'}

## Reusable Gate Sequence

${report.read_only_expansion.reusable_gate_sequence.map((item) => `- ${item}`).join('\n')}

## Graph Loop Path

- dialogue_input.raw_events: ${report.graph_closed_loop?.path.dialogue_input.raw_events ?? 'not_run'}
- relationship_event_graph.relationships: ${report.graph_closed_loop?.path.relationship_event_graph.relationships ?? 'not_run'}
- relationship_event_graph.semantic_events: ${report.graph_closed_loop?.path.relationship_event_graph.semantic_events ?? 'not_run'}
- expert_weight_judgment.completed_expert_count: ${report.graph_closed_loop?.path.expert_weight_judgment.completed_expert_count ?? 'not_run'}
- draft_output.draft_chars: ${report.graph_closed_loop?.path.draft_output.draft_chars ?? 'not_run'}
- feedback_writeback.writeback_events: ${report.graph_closed_loop?.path.feedback_writeback.writeback_event_ids.length ?? 'not_run'}

## Checks

${checks}
`;
}

export function writeReadOnlyExpansionGraphLoopVerification({
  report,
  outputDir = path.join(projectRoot(), 'runtime/desktop-context-bridges', report.verification_id)
}) {
  ensureDir(outputDir);
  const jsonPath = path.join(outputDir, 'read-only-expansion-graph-loop-verification.json');
  const markdownPath = path.join(outputDir, 'read-only-expansion-graph-loop-verification.md');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderVerificationMarkdown(report), 'utf8');
  return {
    output_dir: outputDir,
    json_path: jsonPath,
    markdown_path: markdownPath
  };
}
