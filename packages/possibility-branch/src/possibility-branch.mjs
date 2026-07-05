import {
  existsSync,
  mkdirSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const SCHEMA_VERSION = 'possibility_branch_analysis.v1';

const roleSignals = [
  {
    role: 'client_budget_influencer',
    scene: 'b2b_budget',
    distance_tier: 'active_contact',
    keywords: ['预算', '推进', '决策', '内部确认'],
    base: 0.78
  },
  {
    role: 'procurement_owner',
    scene: 'b2b_procurement',
    distance_tier: 'active_contact',
    keywords: ['采购负责人', '采购', '价格', '合同'],
    base: 0.82
  },
  {
    role: 'referral_friend',
    scene: 'private_relationship',
    distance_tier: 'normal_contact',
    keywords: ['朋友', '老同学', '介绍', '私下'],
    base: 0.7
  },
  {
    role: 'private_channel_advisor',
    scene: 'private_channel',
    distance_tier: 'active_contact',
    keywords: ['私下提醒', '别把价格发群里', '个人微信', '先发她个人微信'],
    base: 0.76
  },
  {
    role: 'technical_reviewer',
    scene: 'technical_review',
    distance_tier: 'normal_contact',
    keywords: ['李工', '接口', '改造', '担心'],
    base: 0.8
  },
  {
    role: 'finance_contract_reviewer',
    scene: 'finance_contract',
    distance_tier: 'normal_contact',
    keywords: ['王姐', '财务', '合同条款', '合同'],
    base: 0.78
  },
  {
    role: 'meeting_coordinator',
    scene: 'b2b_followup',
    distance_tier: 'active_contact',
    keywords: ['约技术会', '安排会议', '技术会', '先给合规材料'],
    base: 0.74
  }
];

const eventSignals = [
  {
    event_type_code: 'budget_advancement_signal',
    keywords: ['预算', '推进', '能帮忙推进'],
    base: 0.78,
    actionability: 0.72,
    risk_attention: 0.25
  },
  {
    event_type_code: 'technical_integration_delay_risk',
    keywords: ['李工', '接口', '改造', '拖到下周', '担心'],
    base: 0.82,
    actionability: 0.68,
    risk_attention: 0.64
  },
  {
    event_type_code: 'contract_clause_review',
    keywords: ['财务', '王姐', '合同条款', '合同'],
    base: 0.76,
    actionability: 0.62,
    risk_attention: 0.52
  },
  {
    event_type_code: 'compliance_material_gate',
    keywords: ['合规材料', '先给合规材料', '给合规材料'],
    base: 0.86,
    actionability: 0.88,
    risk_attention: 0.46
  },
  {
    event_type_code: 'technical_meeting_arrangement',
    keywords: ['约技术会', '技术会'],
    base: 0.8,
    actionability: 0.9,
    risk_attention: 0.28
  },
  {
    event_type_code: 'pricing_channel_boundary',
    keywords: ['价格', '别把价格发群里', '个人微信', '私下提醒'],
    base: 0.84,
    actionability: 0.7,
    risk_attention: 0.86
  }
];

function nowIso() {
  return new Date().toISOString();
}

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function round(value) {
  return Number(clamp(value).toFixed(3));
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function hashText(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex');
}

function stableId(prefix, parts) {
  return `${prefix}_${hashText(parts.map((part) => String(part ?? '')).join('|')).slice(0, 16)}`;
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function splitClauses(text) {
  return String(text ?? '')
    .split(/[。！？；;\n，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePersonDisplayName(rawName) {
  const raw = String(rawName ?? '').trim();
  if (!raw) return null;
  if (/(负责人|同学)$/.test(raw)) return null;
  if (/[总工姐]$/.test(raw) && raw.length > 2) return raw.slice(-2);
  if (/(经理|主任|老师)$/.test(raw) && raw.length > 3) return raw.slice(-3);
  return raw;
}

function countKeywordMatches(text, keywords) {
  const haystack = String(text ?? '');
  return keywords.filter((keyword) => haystack.includes(keyword)).length;
}

function normalizeObservation(observation = {}) {
  const contentText = String(observation.content_text ?? observation.content ?? '').trim();
  const contentSummary = String(observation.content_summary ?? contentText.slice(0, 80)).trim();
  if (!contentText && !contentSummary) {
    throw new Error('Possibility branch requires content_text or content_summary');
  }
  return {
    observation_id: observation.observation_id ?? stableId('obs', [contentText, contentSummary]),
    source_adapter_id: observation.source_adapter_id ?? 'manual_input',
    source_type: observation.source_type ?? 'manual',
    platform: observation.platform ?? 'unknown',
    thread_id: observation.thread_hint?.thread_id ?? observation.thread_id ?? null,
    captured_at: observation.captured_at ?? null,
    content_text: contentText || contentSummary,
    content_summary: contentSummary || contentText.slice(0, 120),
    confidence: clamp(observation.confidence ?? 0.72),
    participants_hint: unique(observation.participants_hint ?? []),
    evidence_refs: unique([
      ...(observation.evidence_refs ?? []),
      ...(observation.raw_artifact_refs ?? []),
      `observation:${observation.observation_id ?? 'inline'}`
    ])
  };
}

function normalizeGoal(goal = {}) {
  return {
    goal_id: goal.goal_id ?? 'goal_b2b_followup_possibility_branch',
    scene: goal.scene ?? 'b2b_followup',
    objective: goal.objective ?? '在不写入主图谱事实的前提下，识别目标人物多重身份、多事件和嵌套事件的可能性，并为后续决策提供可解释读取权重。',
    target_person_hint: goal.target_person_hint ?? null,
    priority_keywords: unique(goal.priority_keywords ?? ['预算', '合规', '技术会', '合同', '价格'])
  };
}

function personHintsFromObservation(observation) {
  const names = new Set();
  for (const participant of observation.participants_hint) {
    const trimmed = normalizePersonDisplayName(participant);
    if (trimmed && !['user', 'me', '我', '自己'].includes(trimmed)) names.add(trimmed);
  }
  const regex = /[\u4e00-\u9fa5A-Za-z]{1,8}(?:总|工|姐|经理|主任|老师)/g;
  for (const match of observation.content_text.matchAll(regex)) {
    const normalized = normalizePersonDisplayName(match[0]);
    if (normalized) names.add(normalized);
  }
  for (const commonName of ['周总', '李工', '王姐']) {
    if (observation.content_text.includes(commonName)) names.add(commonName);
  }
  return [...names].map((displayName) => ({
    person_hint_id: stableId('person_hint', [observation.observation_id, displayName]),
    display_name: displayName
  }));
}

function clausesForPerson(clauses, displayName) {
  const direct = clauses.filter((clause) => clause.includes(displayName));
  const pronounRefs = clauses.filter((clause) => {
    if (displayName.includes('周') && clause.includes('她')) return true;
    return false;
  });
  const merged = unique([...direct, ...pronounRefs]);
  if (merged.length) return merged;
  return clauses.filter((clause) => {
    if (displayName.includes('周') && clause.includes('她')) return true;
    return false;
  });
}

function clauseMentionsOtherPerson(clause, displayName, allPersonNames = []) {
  return allPersonNames.some((name) => name !== displayName && clause.includes(name));
}

function roleEvidenceClausesForPerson({ personClauses, displayName, signal, allPersonNames }) {
  return personClauses.filter((clause) => {
    if (clause.includes(displayName)) return true;
    if (!clause.includes('她')) return true;
    if (!clauseMentionsOtherPerson(clause, displayName, allPersonNames)) return true;
    return signal.keywords.some((keyword) => displayName.includes(keyword));
  });
}

function inferRoleBindings({ personHint, clauses, observation, goal, allPersonNames = [] }) {
  const personClauses = clausesForPerson(clauses, personHint.display_name);
  const bindings = [];

  for (const signal of roleSignals) {
    const roleEvidenceClauses = roleEvidenceClausesForPerson({
      personClauses,
      displayName: personHint.display_name,
      signal,
      allPersonNames
    });
    const joined = roleEvidenceClauses.join('；') || personClauses.join('；');
    const matchCount = countKeywordMatches(joined, signal.keywords);
    const directPersonMention = joined.includes(personHint.display_name) ? 1 : 0.62;
    const roleRelevantToName = signal.keywords.some((keyword) => personHint.display_name.includes(keyword))
      || signal.keywords.some((keyword) => joined.includes(keyword));
    if (!matchCount && !roleRelevantToName) continue;

    const mentionStrength = clamp((roleEvidenceClauses.length * 0.28) + (directPersonMention * 0.34));
    const sourceConfidence = observation.confidence;
    const roleFit = clamp((matchCount / Math.max(signal.keywords.length, 1)) + signal.base * 0.34);
    const sceneRelevance = goal.scene.includes('b2b') || signal.scene.includes('b2b') ? 0.86 : 0.68;
    const recency = observation.captured_at ? 0.82 : 0.72;
    const evidenceSpecificity = clamp(matchCount * 0.18 + (personHint.display_name.length >= 2 ? 0.42 : 0.2));
    const userGoalRelevance = clamp(
      goal.priority_keywords.filter((keyword) => joined.includes(keyword)).length * 0.16
      + (goal.objective.includes('多重身份') ? 0.2 : 0.1)
    );
    const ambiguityPenalty = 0.04;
    const roleWeight = round(
      0.22 * mentionStrength
      + 0.18 * sourceConfidence
      + 0.16 * roleFit
      + 0.14 * sceneRelevance
      + 0.12 * recency
      + 0.1 * evidenceSpecificity
      + 0.08 * userGoalRelevance
      - ambiguityPenalty
    );

    bindings.push({
      binding_id: stableId('identity_binding', [
        personHint.person_hint_id,
        signal.role,
        observation.observation_id
      ]),
      role: signal.role,
      scene: signal.scene,
      distance_tier: signal.distance_tier,
      role_weight: roleWeight,
      confidence: round((sourceConfidence + roleFit + evidenceSpecificity) / 3),
      components: {
        mention_strength: round(mentionStrength),
        source_confidence: round(sourceConfidence),
        role_fit: round(roleFit),
        scene_relevance: round(sceneRelevance),
        recency: round(recency),
        evidence_specificity: round(evidenceSpecificity),
        user_goal_relevance: round(userGoalRelevance),
        ambiguity_penalty: round(ambiguityPenalty)
      },
      evidence_refs: unique([
        ...observation.evidence_refs,
        ...roleEvidenceClauses.map((clause, index) => `clause:${personHint.display_name}:${index + 1}:${clause}`)
      ]),
      status: 'branch_hypothesis'
    });
  }

  if (!bindings.length) {
    bindings.push({
      binding_id: stableId('identity_binding', [
        personHint.person_hint_id,
        'unclassified_contact',
        observation.observation_id
      ]),
      role: 'unclassified_contact',
      scene: 'unknown',
      distance_tier: 'unknown',
      role_weight: 0.42,
      confidence: 0.38,
      components: {
        mention_strength: 0.4,
        source_confidence: round(observation.confidence),
        role_fit: 0.2,
        scene_relevance: 0.2,
        recency: observation.captured_at ? 0.82 : 0.72,
        evidence_specificity: 0.25,
        user_goal_relevance: 0.15,
        ambiguity_penalty: 0.06
      },
      evidence_refs: observation.evidence_refs,
      status: 'branch_hypothesis'
    });
  }

  return bindings.sort((a, b) => b.role_weight - a.role_weight);
}

function buildIdentityHypotheses({ observation, goal, clauses }) {
  const personHints = personHintsFromObservation(observation);
  const allPersonNames = personHints.map((personHint) => personHint.display_name);
  return personHints.map((personHint) => {
    const possibleIdentityBindings = inferRoleBindings({
      personHint,
      clauses,
      observation,
      goal,
      allPersonNames
    });
    return {
      ...personHint,
      possible_identity_bindings: possibleIdentityBindings,
      dominant_binding_id: possibleIdentityBindings[0]?.binding_id ?? null,
      requires_user_confirmation: true,
      evidence_refs: unique(possibleIdentityBindings.flatMap((binding) => binding.evidence_refs))
    };
  });
}

function participantsForEvent(eventText, identityHypotheses) {
  const matched = identityHypotheses
    .filter((identity) => eventText.includes(identity.display_name)
      || (identity.display_name.includes('周') && eventText.includes('她')))
    .map((identity) => identity.person_hint_id);
  return unique(matched);
}

function parentForEvent(eventType, events) {
  const find = (type) => events.find((event) => event.event_type_code === type)?.event_hypothesis_id ?? null;
  if (eventType === 'technical_meeting_arrangement') return find('compliance_material_gate');
  if (eventType === 'contract_clause_review') return find('budget_advancement_signal');
  if (eventType === 'pricing_channel_boundary') return find('budget_advancement_signal');
  if (eventType === 'technical_integration_delay_risk') return find('technical_meeting_arrangement');
  return null;
}

function dependencyForEvent(eventType) {
  if (eventType === 'technical_meeting_arrangement') return 'requires_compliance_material_first';
  if (eventType === 'contract_clause_review') return 'affects_budget_and_commercial_terms';
  if (eventType === 'pricing_channel_boundary') return 'constrains_public_group_reply_channel';
  if (eventType === 'technical_integration_delay_risk') return 'blocks_or_delays_technical_meeting';
  return null;
}

function buildEventHypotheses({ observation, goal, clauses, identityHypotheses }) {
  const events = [];
  for (const signal of eventSignals) {
    const matchingClauses = clauses.filter((clause) => countKeywordMatches(clause, signal.keywords) > 0);
    const matchCount = countKeywordMatches(observation.content_text, signal.keywords);
    if (!matchingClauses.length && !matchCount) continue;

    const eventText = matchingClauses.join('；') || observation.content_text;
    const directIntent = clamp(signal.base + matchCount * 0.035);
    const goalRelevance = clamp(goal.priority_keywords.filter((keyword) => eventText.includes(keyword)).length * 0.18 + 0.44);
    const evidenceDensity = clamp(matchCount / Math.max(signal.keywords.length, 1) + matchingClauses.length * 0.12);
    const participants = participantsForEvent(eventText, identityHypotheses);
    const participantCentrality = clamp(participants.length * 0.18 + 0.42);
    const temporalProximity = observation.captured_at ? 0.82 : 0.72;
    const nestedDependency = ['technical_meeting_arrangement', 'contract_clause_review', 'pricing_channel_boundary', 'technical_integration_delay_risk'].includes(signal.event_type_code)
      ? 0.78
      : 0.45;
    const actionability = signal.actionability;
    const riskAttention = signal.risk_attention;
    const eventFocusWeight = round(
      0.2 * directIntent
      + 0.18 * goalRelevance
      + 0.16 * evidenceDensity
      + 0.14 * participantCentrality
      + 0.12 * temporalProximity
      + 0.1 * nestedDependency
      + 0.06 * actionability
      + 0.04 * riskAttention
    );
    const event = {
      event_hypothesis_id: stableId('event_hypothesis', [
        observation.observation_id,
        signal.event_type_code,
        eventText
      ]),
      event_type_code: signal.event_type_code,
      event_focus_weight: eventFocusWeight,
      confidence: round((directIntent + evidenceDensity + observation.confidence) / 3),
      participants,
      parent_event_hypothesis_id: null,
      dependency_relation: null,
      nested_level: 0,
      components: {
        direct_intent: round(directIntent),
        goal_relevance: round(goalRelevance),
        evidence_density: round(evidenceDensity),
        participant_centrality: round(participantCentrality),
        temporal_proximity: round(temporalProximity),
        nested_dependency: round(nestedDependency),
        actionability: round(actionability),
        risk_attention: round(riskAttention)
      },
      evidence_refs: unique([
        ...observation.evidence_refs,
        ...matchingClauses.map((clause, index) => `clause:${signal.event_type_code}:${index + 1}:${clause}`)
      ]),
      status: 'branch_hypothesis'
    };
    events.push(event);
  }

  events.sort((a, b) => b.event_focus_weight - a.event_focus_weight);
  for (const event of events) {
    const parent = parentForEvent(event.event_type_code, events);
    event.parent_event_hypothesis_id = parent;
    event.dependency_relation = dependencyForEvent(event.event_type_code);
    event.nested_level = parent ? 1 : 0;
  }
  return events;
}

function roleEventFit(role, eventType) {
  const roleMap = {
    client_budget_influencer: ['budget_advancement_signal', 'pricing_channel_boundary'],
    procurement_owner: ['contract_clause_review', 'pricing_channel_boundary', 'budget_advancement_signal'],
    referral_friend: ['pricing_channel_boundary', 'budget_advancement_signal'],
    private_channel_advisor: ['pricing_channel_boundary'],
    technical_reviewer: ['technical_integration_delay_risk', 'technical_meeting_arrangement'],
    finance_contract_reviewer: ['contract_clause_review'],
    meeting_coordinator: ['technical_meeting_arrangement', 'compliance_material_gate']
  };
  return roleMap[role]?.includes(eventType) ? 0.9 : 0.35;
}

function buildWeightMatrix({ identityHypotheses, eventHypotheses }) {
  const identityEventEdges = [];
  for (const identity of identityHypotheses) {
    for (const binding of identity.possible_identity_bindings) {
      for (const event of eventHypotheses) {
        const evidenceOverlap = event.participants.includes(identity.person_hint_id) ? 0.92 : 0.34;
        const fit = roleEventFit(binding.role, event.event_type_code);
        if (evidenceOverlap < 0.5 && fit < 0.7) continue;
        const sceneFit = binding.scene.includes('b2b') || binding.scene.includes('technical') || binding.scene.includes('finance')
          ? 0.82
          : 0.58;
        const uncertaintyInverse = round((binding.confidence + event.confidence) / 2);
        const weight = round(
          0.28 * binding.role_weight
          + 0.25 * event.event_focus_weight
          + 0.17 * evidenceOverlap
          + 0.12 * fit
          + 0.1 * sceneFit
          + 0.08 * uncertaintyInverse
        );
        identityEventEdges.push({
          edge_id: stableId('branch_edge', [
            identity.person_hint_id,
            binding.binding_id,
            event.event_hypothesis_id
          ]),
          person_hint_id: identity.person_hint_id,
          binding_id: binding.binding_id,
          event_hypothesis_id: event.event_hypothesis_id,
          weight,
          read_order: weight >= 0.72 ? 'primary_context' : 'secondary_context',
          components: {
            identity_role_weight: binding.role_weight,
            event_focus_weight: event.event_focus_weight,
            evidence_overlap: round(evidenceOverlap),
            role_event_fit: round(fit),
            scene_fit: round(sceneFit),
            uncertainty_inverse: uncertaintyInverse
          }
        });
      }
    }
  }
  return {
    identity_event_edges: identityEventEdges.sort((a, b) => b.weight - a.weight),
    weighting_mechanism: {
      identity_role_weight_formula: '0.22 mention_strength + 0.18 source_confidence + 0.16 role_fit + 0.14 scene_relevance + 0.12 recency + 0.10 evidence_specificity + 0.08 user_goal_relevance - ambiguity_penalty',
      event_focus_weight_formula: '0.20 direct_intent + 0.18 goal_relevance + 0.16 evidence_density + 0.14 participant_centrality + 0.12 temporal_proximity + 0.10 nested_dependency + 0.06 actionability + 0.04 risk_attention',
      edge_weight_formula: '0.28 identity_role_weight + 0.25 event_focus_weight + 0.17 evidence_overlap + 0.12 role_event_fit + 0.10 scene_fit + 0.08 uncertainty_inverse',
      human_reasoning_alignment: '按人类权衡习惯保留多种解释、证据强弱、角色适配、当前目标、时间近因、行动可执行性和风险关注度；权重用于读取排序，不等同事实确认。'
    }
  };
}

function buildProcessingOrder() {
  return {
    sequential_steps: [
      {
        step_id: 'source_gate',
        action: 'accept_observation_as_evidence_only',
        output: 'source evidence refs and content fingerprint'
      },
      {
        step_id: 'possibility_branch_expand',
        action: 'expand identity and event hypotheses without writing stable graph facts',
        output: 'identity_hypotheses and event_hypotheses'
      },
      {
        step_id: 'branch_weight_match',
        action: 'rank identity-event edges for context assembly',
        output: 'branch_weight_matrix'
      },
      {
        step_id: 'decision_context_packaging',
        action: 'send branch summary plus read-only graph snapshot to expert matrix',
        output: 'ContextSnapshot addendum'
      },
      {
        step_id: 'promotion_gate',
        action: 'require user confirmation before any candidate is promoted to CandidatePerson, SemanticEvent or RelationshipEdge',
        output: 'manual confirmation checklist'
      }
    ],
    parallel_lanes: [
      {
        lane_id: 'identity_disambiguation',
        purpose: 'distinguish one person with multiple roles from multiple people with similar labels'
      },
      {
        lane_id: 'event_focus_ranking',
        purpose: 'rank which described event should dominate the next reasoning context'
      },
      {
        lane_id: 'nested_event_expansion',
        purpose: 'preserve parent-child dependencies such as compliance material before technical meeting'
      },
      {
        lane_id: 'post_theory_safety_review',
        purpose: 'review legality, safety and send constraints after theoretical possibility discovery'
      }
    ]
  };
}

function buildRetrievalPlan({ identityHypotheses, eventHypotheses, branchId }) {
  const primaryEdges = [];
  return {
    context_sufficiency_level: eventHypotheses.length >= 3 && identityHypotheses.length >= 2 ? 'medium_high' : 'low',
    read_sets: [
      {
        read_set_id: 'main_graph_snapshot_read_only',
        scope: 'data/people/** and data/events/**',
        mode: 'read_only',
        reason: 'Compare branch hypotheses against confirmed people, relationships and recent events without writing facts.'
      },
      {
        read_set_id: 'possibility_branch_current',
        scope: `runtime/possibility-branches/${branchId}/possibility-branch-analysis.json`,
        mode: 'branch_read',
        reason: 'Supply multi-identity and nested-event hypotheses to the expert matrix.'
      },
      {
        read_set_id: 'branch_primary_edges',
        scope: 'branch_weight_matrix.identity_event_edges[read_order=primary_context]',
        mode: 'branch_read',
        reason: 'Use highest weighted identity-event links first when constructing model context.',
        edge_ids: primaryEdges
      }
    ],
    write_sets: [
      {
        write_set_id: 'possibility_branch_artifacts',
        scope: `runtime/possibility-branches/${branchId}/**`,
        mode: 'append_or_replace_branch_artifact'
      },
      {
        write_set_id: 'main_graph_fact_write',
        scope: 'data/people/** and data/events/**',
        mode: 'blocked_without_user_confirmation'
      }
    ],
    short_input_policy: 'If a later input is only one short sentence, read the latest branch plus thread ContextSnapshot first; if identity or thread is still unclear, only output branch hypotheses and clarification questions.'
  };
}

function buildMergePolicy() {
  return {
    default_action: 'keep_in_possibility_branch',
    promotion_gates: [
      'user confirms target person identity or role binding',
      'source evidence contains stable handle, thread id, user note or repeated cross-source support',
      'candidate promotion writes CandidatePerson/PersonRoleBinding first, not stable Person unless verified',
      'SemanticEvent promotion keeps raw evidence, linked candidate refs and requires_confirmation for P1/P2 risk',
      'P1 high-risk events and real sending remain blocked until explicit manual confirmation'
    ],
    blocked_actions: [
      'do_not_write_branch_identity_as_confirmed_person',
      'do_not_write_branch_event_as_confirmed_semantic_event',
      'do_not_auto_merge_candidate_relationships',
      'do_not_send_messages_from_branch_output'
    ]
  };
}

function buildValidation({ identityHypotheses, eventHypotheses, branchBoundary }) {
  const checks = [
    {
      check_id: 'branch_is_independent_from_main_graph',
      passed: branchBoundary.main_graph_write_attempted === false
        && branchBoundary.prohibited_write_paths.includes('data/people/**')
        && branchBoundary.prohibited_write_paths.includes('data/events/**'),
      evidence: branchBoundary.prohibited_write_paths
    },
    {
      check_id: 'multi_identity_supported',
      passed: identityHypotheses.some((identity) => identity.possible_identity_bindings.length >= 3),
      evidence: identityHypotheses.map((identity) => `${identity.display_name}:${identity.possible_identity_bindings.length}`)
    },
    {
      check_id: 'multi_event_supported',
      passed: eventHypotheses.length >= 4,
      evidence: eventHypotheses.map((event) => event.event_type_code)
    },
    {
      check_id: 'nested_event_supported',
      passed: eventHypotheses.some((event) => event.parent_event_hypothesis_id),
      evidence: eventHypotheses
        .filter((event) => event.parent_event_hypothesis_id)
        .map((event) => `${event.event_type_code}->${event.parent_event_hypothesis_id}`)
    },
    {
      check_id: 'real_send_blocked',
      passed: true,
      evidence: ['possibility branch has no send executor and merge policy blocks branch output from sending']
    }
  ];
  const requiredFailures = checks.filter((check) => !check.passed).map((check) => check.check_id);
  return {
    checks,
    required_failures: requiredFailures,
    gate_decision: requiredFailures.length === 0
      ? 'possibility_branch_ready_for_reviewer_audit'
      : 'stop_and_fix_possibility_branch',
    real_send_attempted: false
  };
}

export function buildPossibilityBranchAnalysis({
  observation,
  goal,
  branchId,
  createdAt = nowIso()
} = {}) {
  const normalizedObservation = normalizeObservation(observation);
  const normalizedGoal = normalizeGoal(goal);
  const resolvedBranchId = branchId ?? stableId('possibility_branch', [
    normalizedObservation.observation_id,
    normalizedGoal.goal_id,
    normalizedObservation.content_text
  ]);
  const clauses = splitClauses(normalizedObservation.content_text);
  const branchBoundary = {
    storage_scope: 'possibility_branch_only',
    main_graph_write_attempted: false,
    allowed_write_paths: [
      `runtime/possibility-branches/${resolvedBranchId}/**`
    ],
    prohibited_write_paths: [
      'data/people/**',
      'data/events/**',
      'data/indexes/**'
    ],
    promotion_requires_user_confirmation: true,
    notes: [
      'This branch stores hypotheses and weighting evidence only.',
      'Confirmed CandidatePerson, SemanticEvent or RelationshipEdge writes must happen in their own confirmed workflows after user review.'
    ]
  };
  const identityHypotheses = buildIdentityHypotheses({
    observation: normalizedObservation,
    goal: normalizedGoal,
    clauses
  });
  const eventHypotheses = buildEventHypotheses({
    observation: normalizedObservation,
    goal: normalizedGoal,
    clauses,
    identityHypotheses
  });
  const branchWeightMatrix = buildWeightMatrix({
    identityHypotheses,
    eventHypotheses
  });
  const retrievalPlan = buildRetrievalPlan({
    identityHypotheses,
    eventHypotheses,
    branchId: resolvedBranchId
  });
  retrievalPlan.read_sets.find((item) => item.read_set_id === 'branch_primary_edges').edge_ids =
    branchWeightMatrix.identity_event_edges
      .filter((edge) => edge.read_order === 'primary_context')
      .map((edge) => edge.edge_id);

  const analysis = {
    schema_version: SCHEMA_VERSION,
    branch_id: resolvedBranchId,
    created_at: createdAt,
    source: {
      observation_id: normalizedObservation.observation_id,
      source_adapter_id: normalizedObservation.source_adapter_id,
      source_type: normalizedObservation.source_type,
      platform: normalizedObservation.platform,
      thread_id: normalizedObservation.thread_id,
      captured_at: normalizedObservation.captured_at,
      content_summary: normalizedObservation.content_summary,
      evidence_refs: normalizedObservation.evidence_refs
    },
    goal: normalizedGoal,
    branch_boundary: branchBoundary,
    identity_hypotheses: identityHypotheses,
    event_hypotheses: eventHypotheses,
    branch_weight_matrix: branchWeightMatrix,
    processing_order: buildProcessingOrder(),
    retrieval_plan: retrievalPlan,
    merge_policy: buildMergePolicy()
  };

  analysis.validation = buildValidation({
    identityHypotheses,
    eventHypotheses,
    branchBoundary
  });
  return analysis;
}

export function renderPossibilityBranchMarkdown(analysis) {
  const identities = analysis.identity_hypotheses
    .map((identity) => {
      const bindings = identity.possible_identity_bindings
        .map((binding) => `  - ${binding.role}: weight=${binding.role_weight}, confidence=${binding.confidence}, scene=${binding.scene}`)
        .join('\n');
      return `- ${identity.display_name} (${identity.person_hint_id})\n${bindings}`;
    })
    .join('\n');
  const events = analysis.event_hypotheses
    .map((event) => `- ${event.event_type_code}: weight=${event.event_focus_weight}, parent=${event.parent_event_hypothesis_id ?? 'none'}, relation=${event.dependency_relation ?? 'none'}`)
    .join('\n');
  const topEdges = analysis.branch_weight_matrix.identity_event_edges
    .slice(0, 8)
    .map((edge) => `- ${edge.edge_id}: weight=${edge.weight}, binding=${edge.binding_id}, event=${edge.event_hypothesis_id}, order=${edge.read_order}`)
    .join('\n');
  const failures = analysis.validation.required_failures.length
    ? analysis.validation.required_failures.map((failure) => `- ${failure}`).join('\n')
    : '- none';

  return `# Possibility Branch Analysis

- branch_id: ${analysis.branch_id}
- schema_version: ${analysis.schema_version}
- gate_decision: ${analysis.validation.gate_decision}
- main_graph_write_attempted: ${analysis.branch_boundary.main_graph_write_attempted}
- real_send_attempted: ${analysis.validation.real_send_attempted}

## Boundary

- storage_scope: ${analysis.branch_boundary.storage_scope}
- allowed_write_paths: ${analysis.branch_boundary.allowed_write_paths.join(', ')}
- prohibited_write_paths: ${analysis.branch_boundary.prohibited_write_paths.join(', ')}

## Identity Hypotheses

${identities}

## Event Hypotheses

${events}

## Top Identity Event Edges

${topEdges || '- none'}

## Retrieval Plan

- context_sufficiency_level: ${analysis.retrieval_plan.context_sufficiency_level}
- short_input_policy: ${analysis.retrieval_plan.short_input_policy}

## Required Failures

${failures}
`;
}

export function writePossibilityBranchAnalysis({
  analysis,
  outputDir
}) {
  if (!analysis) throw new Error('analysis is required');
  const targetDir = outputDir ?? path.join(
    process.cwd(),
    'runtime',
    'possibility-branches',
    analysis.branch_id
  );
  ensureDir(targetDir);
  const jsonPath = path.join(targetDir, 'possibility-branch-analysis.json');
  const markdownPath = path.join(targetDir, 'possibility-branch-analysis.md');
  if (!existsSync(targetDir)) ensureDir(targetDir);
  writeFileSync(jsonPath, `${JSON.stringify(analysis, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderPossibilityBranchMarkdown(analysis), 'utf8');
  return {
    output_dir: targetDir,
    json_path: jsonPath,
    markdown_path: markdownPath
  };
}
