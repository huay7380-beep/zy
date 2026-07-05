import { buildDecisionRecommendation } from './decision-cluster.mjs';

function nowCompactId(prefix) {
  return `${prefix}_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

function stageDefinition(romanticGoalAnalysis) {
  const stage = romanticGoalAnalysis.primary_relationship_stage;
  return romanticGoalAnalysis.romantic_stage_gradient?.stage_catalog
    ?.find((item) => item.stage === stage) ?? null;
}

function compactExpertReviews(sentenceReview) {
  return (sentenceReview.expert_reviews ?? []).map((review) => ({
    expert_id: review.expert_id,
    discipline: review.discipline,
    gradient_stage_id: review.gradient_stage_id,
    transition_decision: review.stage_transition_view?.transition_decision ?? null,
    recommendation: review.review_recommendation,
    user_prompt_hint: review.user_prompt_hint,
    risk_level: review.risk_level,
    confidence: review.confidence
  }));
}

function compactExpertContextPacks(decision) {
  return (decision.expert_matrix_analysis?.expert_context_packs ?? []).map((pack) => ({
    schema_version: pack.schema_version,
    context_pack_id: pack.context_pack_id,
    expert_id: pack.expert_id,
    discipline: pack.discipline,
    source_context_id: pack.source_context_id,
    context_policy: pack.context_policy,
    target_count: pack.readable_context?.target_context_briefs?.length ?? 0,
    primary_target: pack.readable_context?.target_context_briefs?.[0]?.display_name ?? null,
    active_windows: pack.readable_context?.target_context_briefs?.[0]?.active_windows ?? [],
    missing_windows: pack.readable_context?.target_context_briefs?.[0]?.missing_windows ?? [],
    evidence_refs: pack.evidence_refs ?? []
  }));
}

export function buildPt028SampleDecision() {
  const targetPersonId = 'person_pt028_gui_runtime_partner';
  const targetText = '\u54ce\uff0c\u5bf9\u4f60\u4e0d\u62e7\u5df4\uff0c\u4f60\u634f\u634f\u634f\u3002';
  return buildDecisionRecommendation({
    goalInput: {
      initial_goal: 'PT-028 GUI runtime projection for a confirmed romantic relationship.',
      scene: 'personal_social',
      primary_person_id: targetPersonId,
      target_person_ids: [targetPersonId],
      target_display_name: 'TargetA',
      identity_labels: ['romantic_partner'],
      context_input: `TargetA: ${targetText}`,
      preferred_channel: 'wechat',
      identity_gate_decision: 'identity_confirmed_by_user_context',
      source_type: 'pt028_gui_decision_state_fixture'
    },
    socialGraph: {
      user_id: 'user',
      people: [
        {
          person_id: targetPersonId,
          display_name: 'TargetA',
          roles: ['romantic_partner'],
          tags: ['pt028_gui_runtime_fixture']
        }
      ],
      relationships: [
        {
          relationship_id: 'rel_user_pt028_gui_runtime_partner',
          from_person_id: 'user',
          to_person_id: targetPersonId,
          type_code: 'romantic_partner',
          phase: 'confirmed_romantic',
          trust_level: 'medium',
          health_score: 0.72,
          tags: ['runtime_projection_fixture']
        }
      ],
      events: [
        {
          event_id: 'evt_pt028_gui_today',
          event_type_code: 'personal_relationship_signal',
          event_level: 'P3',
          title: 'Today playful affectionate signal',
          start_at: '2026-06-18T10:00:00+08:00',
          status: 'completed',
          importance: 0.7,
          confidence: 0.82,
          participants: [{ person_id: targetPersonId, role: 'target' }]
        },
        {
          event_id: 'evt_pt028_gui_week',
          event_type_code: 'invitation',
          event_level: 'P3',
          title: 'Last 7 days positive interaction',
          start_at: '2026-06-15T20:00:00+08:00',
          status: 'completed',
          importance: 0.58,
          confidence: 0.72,
          participants: [{ person_id: targetPersonId, role: 'target' }]
        },
        {
          event_id: 'evt_pt028_gui_month',
          event_type_code: 'celebration',
          event_level: 'P3',
          title: 'Last 30 days warm interaction',
          start_at: '2026-06-02T19:30:00+08:00',
          status: 'completed',
          importance: 0.52,
          confidence: 0.7,
          participants: [{ person_id: targetPersonId, role: 'target' }]
        },
        {
          event_id: 'evt_pt028_gui_history',
          event_type_code: 'help',
          event_level: 'P3',
          title: 'Historical stable support',
          start_at: '2026-04-01T18:00:00+08:00',
          status: 'completed',
          importance: 0.5,
          confidence: 0.68,
          participants: [{ person_id: targetPersonId, role: 'target' }]
        }
      ]
    },
    rawEvents: [
      {
        event_id: 'raw_pt028_gui_target_reply',
        speaker_person_id: targetPersonId,
        actor_person_id: targetPersonId,
        content: targetText,
        content_summary: 'Confirmed romantic partner sent a playful affectionate reply.',
        linked_person_ids: [targetPersonId],
        metadata: {
          source_actor_type: 'target',
          read_only_replay: true,
          gui_projection_fixture: true
        }
      }
    ],
    userPreferences: {
      automation_comfort: 'low',
      risk_tolerance: 'low',
      relationship_priority: 'high'
    }
  });
}

export function buildPt028GuiDecisionState({
  decision = buildPt028SampleDecision(),
  source = {},
  stateId = nowCompactId('pt028_gui_decision_state')
} = {}) {
  const romantic = decision.romantic_goal_analysis;
  const sentenceReview = decision.romantic_expert_sentence_review;
  const coordinator = decision.romantic_relationship_coordinator
    ?? decision.expert_matrix_analysis?.romantic_relationship_coordinator
    ?? {};
  const draft = decision.recommended_option?.message_draft ?? {};
  const intent = draft.dialogue_intent_contract ?? {};
  const stageDef = stageDefinition(romantic);
  const transition = romantic.stage_transition_assessment ?? {};
  const comfort = romantic.psychological_comfort_model ?? {};
  const progressionTrack = romantic.online_offline_progression_track ?? {};
  const dateTransition = romantic.date_transition_readiness ?? {};
  const cadence = romantic.romantic_progression_cadence ?? {};
  const identity = romantic.identity_label_analysis ?? {};
  const structuredCotTrace = decision.structured_cot_trace ?? null;
  const confirmedRomanticStage = ['R2', 'R3', 'R4', 'R5', 'R6'].includes(
    romantic.primary_relationship_stage
  );
  const thirdPartyPrompts = (sentenceReview.target_sentence_reviews ?? []).map((item) => ({
    utterance_id: item.utterance_id,
    target_person_id: item.target_person_id,
    target_display_name: item.target_display_name,
    target_reply: item.text,
    prompt: item.third_party_prompt_analysis?.prompt ?? null,
    stage: item.third_party_prompt_analysis?.stage ?? romantic.primary_relationship_stage,
    intensity: item.third_party_prompt_analysis?.progression_intensity ?? comfort.progression_intensity,
    transition: item.third_party_prompt_analysis?.transition_decision ?? transition.transition_decision,
    risk_level: item.third_party_prompt_analysis?.target_to_user_risk_level ?? romantic.pua_or_coercion_risk?.risk_level,
    not_sent_to_target: item.third_party_prompt_analysis?.not_sent_to_target === true,
    expert_reviews: compactExpertReviews(item)
  }));

  const reasoningSteps = romantic.user_visible_reasoning_log?.steps ?? [];
  const reasoningRows = [
    {
      label: 'identity_and_stage',
      value: `${identity.selected_primary_identity ?? romantic.primary_relationship_identity ?? 'unknown'} / ${romantic.primary_relationship_stage}`,
      detail: `stage_id=${romantic.primary_relationship_stage_id}; label=${stageDef?.label ?? 'unknown'}`
    },
    {
      label: 'psychological_comfort',
      value: comfort.progression_intensity ?? 'unknown',
      detail: `heat=${comfort.heat_score ?? 'unknown'}; comfort=${comfort.comfort_score ?? 'unknown'}`
    },
    {
      label: 'transition_decision',
      value: transition.transition_decision ?? 'unknown',
      detail: `next=${transition.next_stage_candidate ?? 'none'}; action=${transition.current_turn_action_intensity ?? 'unknown'}`
    },
    {
      label: 'online_offline_track',
      value: `${progressionTrack.online_track?.stage ?? 'O0'} / ${progressionTrack.offline_track?.stage ?? 'F0'}`,
      detail: `active=${progressionTrack.active_track ?? 'unknown'}; online=${progressionTrack.online_track?.stage_id ?? 'unknown'}; offline=${progressionTrack.offline_track?.stage_id ?? 'unknown'}`
    },
    {
      label: 'progression_cadence',
      value: cadence.current_turn_intent ?? 'unknown',
      detail: `cadence=${cadence.cadence_decision ?? 'unknown'}; date_transition=${dateTransition.status ?? 'unknown'}`
    },
    {
      label: 'dialogue_intent',
      value: intent.dialogue_act ?? 'unknown',
      detail: intent.intent ?? 'No dialogue intent contract was emitted.'
    }
  ];

  const chainFlow = [
    {
      step_id: 'desktop_or_saved_observation',
      label: 'Desktop or saved source observation',
      status: source.observation_path ? 'source_bound' : 'sample_runtime_projection',
      evidence: source.observation_path ?? 'buildPt028SampleDecision.rawEvents'
    },
    {
      step_id: 'context_snapshot',
      label: 'ContextSnapshot with target windows',
      status: decision.context_snapshot?.schema_version === 'context_snapshot.v1' ? 'complete' : 'missing',
      evidence: 'decision.context_snapshot.target_context_windows'
    },
    {
      step_id: 'expert_context_pack',
      label: 'ExpertContextPack fan-out input assembly',
      status: (decision.expert_matrix_analysis?.expert_context_packs ?? []).length
        ? 'complete'
        : 'missing',
      evidence: 'expert_matrix_analysis.expert_context_packs'
    },
    {
      step_id: 'parallel_expert_run_log',
      label: 'Parallel expert run log and merge',
      status: decision.expert_matrix_analysis?.parallel_expert_run_log?.schema_version === 'parallel_expert_run_log.v1'
        ? 'complete'
        : 'missing',
      evidence: 'expert_matrix_analysis.parallel_expert_run_log'
    },
    {
      step_id: 'structured_cot_trace',
      label: 'Structured auditable generation trace',
      status: structuredCotTrace?.schema_version === 'structured_cot_trace.v1'
        ? 'complete'
        : 'missing',
      evidence: 'decision.structured_cot_trace'
    },
    {
      step_id: 'relationship_gradient',
      label: 'Relationship gradient and semantic feature assessment',
      status: romantic.relationship_gradient_framework?.schema_version === 'relationship_gradient_framework.v1' ? 'complete' : 'missing',
      evidence: 'romantic_goal_analysis.relationship_gradient_framework'
    },
    {
      step_id: 'online_offline_progression_track',
      label: 'Online/offline progression track and cadence',
      status: romantic.online_offline_progression_track?.schema_version === 'online_offline_progression_track.v1'
        && romantic.romantic_progression_cadence?.schema_version === 'romantic_progression_cadence.v1'
        ? 'complete'
        : 'missing',
      evidence: 'romantic_goal_analysis.online_offline_progression_track; romantic_goal_analysis.romantic_progression_cadence'
    },
    {
      step_id: 'expert_sentence_review',
      label: 'Per-target-reply expert review and third-party prompt',
      status: sentenceReview.gate_decision,
      evidence: 'romantic_expert_sentence_review.target_sentence_reviews'
    },
    {
      step_id: 'romantic_relationship_coordinator',
      label: 'Romantic relationship coordinator synthesis',
      status: coordinator.schema_version === 'romantic_relationship_coordinator_expert.v1'
        ? 'complete'
        : 'missing',
      evidence: 'romantic_relationship_coordinator.frontend_display_contract'
    },
    {
      step_id: 'first_person_draft',
      label: 'Editable first-person user draft',
      status: intent.output_perspective === 'user_first_person_draft' ? 'complete' : 'check_required',
      evidence: 'recommended_option.message_draft.dialogue_intent_contract'
    },
    {
      step_id: 'blocked_active_input_display',
      label: 'Active input is blocked; GUI shows user-only analysis',
      status: sentenceReview.active_input_blocked_display_policy?.active_input_blocked_by_default === true
        ? 'complete'
        : 'check_required',
      evidence: 'active_input_blocked_display_policy'
    }
  ];

  const branchRecords = [
    {
      branch_id: 'identity_branch',
      decision: identity.has_confirmed_romantic_identity || confirmedRomanticStage
        ? 'use_romantic_partner_primary_template'
        : 'hold_for_identity_confirmation',
      reason: 'Primary relationship identity decides the main template before secondary scene modifiers.',
      evidence_refs: ['romantic_goal_analysis.identity_label_analysis']
    },
    {
      branch_id: 'context_gap_branch',
      decision: romantic.context_gap_diagnosis?.current_state_process_decision ?? 'unknown',
      reason: 'Missing history can limit stage upgrade but cannot be treated as stable relationship stagnation.',
      evidence_refs: ['romantic_goal_analysis.context_gap_diagnosis']
    },
    {
      branch_id: 'stage_transition_branch',
      decision: transition.transition_decision ?? 'unknown',
      reason: 'The next stage is allowed only when semantic feature families converge across context windows.',
      evidence_refs: ['romantic_goal_analysis.stage_transition_assessment']
    },
    {
      branch_id: 'online_offline_progression_branch',
      decision: `${progressionTrack.online_track?.stage ?? 'O0'}/${progressionTrack.offline_track?.stage ?? 'F0'}:${cadence.current_turn_intent ?? 'unknown'}`,
      reason: 'The romantic branch separates online chat, offline meeting and cadence before the coordinator builds a dock status or draft.',
      evidence_refs: ['romantic_goal_analysis.online_offline_progression_track', 'romantic_goal_analysis.romantic_progression_cadence']
    },
    {
      branch_id: 'draft_intent_branch',
      decision: intent.dialogue_act ?? 'unknown',
      reason: 'The user-visible draft must state the conversational act and stay within current stage intensity.',
      evidence_refs: ['recommended_option.message_draft.dialogue_intent_contract']
    },
    {
      branch_id: 'active_input_blocked_branch',
      decision: 'show_third_party_prompt_cards_not_target_input',
      reason: 'Real sending and active input remain blocked by default, so target reply analysis is displayed to the user only.',
      evidence_refs: ['romantic_expert_sentence_review.active_input_blocked_display_policy']
    },
    {
      branch_id: 'coordinator_delivery_branch',
      decision: coordinator.synthesis?.final_frontend_action ?? 'unknown',
      reason: 'The coordinator decides whether the frontend should show a user prompt only or prepare a controlled send preview.',
      evidence_refs: ['romantic_relationship_coordinator.frontend_display_contract']
    },
    {
      branch_id: 'send_gate_transfer_branch',
      decision: coordinator.send_gate_transfer_path?.current_mode ?? 'unknown',
      reason: 'The send gate receives only coordinator-approved draft payloads after all confirmation gates pass.',
      evidence_refs: ['romantic_relationship_coordinator.send_gate_transfer_path']
    }
  ];

  const dockBrief = dockBriefFromDock(coordinator.frontend_display_contract?.surfaces?.dock);

  return {
    schema_version: 'pt028_gui_decision_state.v1',
    state_id: stateId,
    created_at: new Date().toISOString(),
    gate_decision: 'ready_for_gui_operator_review',
    real_execution_allowed: decision.independent_review?.real_execution_allowed === true,
    real_send_attempted: false,
    source,
    source_decision: {
      decision_id: firstDefined(decision.decision_id, decision.recommendation_id, decision.recommended_option?.option_id),
      recommended_option_id: decision.recommended_option?.option_id ?? null,
      scene: decision.scene,
      target_person_id: romantic.target_person_id,
      target_display_name: romantic.target_display_name ?? null
    },
    relationship_gradient_review: {
      schema_version: 'pt028_relationship_gradient_gui_projection.v1',
      current_stage: romantic.primary_relationship_stage,
      stage_id: romantic.primary_relationship_stage_id,
      stage_label: stageDef?.label ?? null,
      progression_intensity: comfort.progression_intensity ?? null,
      transition_decision: transition.transition_decision ?? null,
      next_stage_candidate: transition.next_stage_candidate ?? null,
      dialogue_act: intent.dialogue_act ?? null,
      online_offline_progression_track: progressionTrack,
      date_transition_readiness: dateTransition,
      romantic_progression_cadence: cadence,
      dock_status_text: dockBrief,
      selected_template_id: draft.selected_template_id ?? null,
      output_perspective: intent.output_perspective ?? null,
      draft: draft.draft ?? null,
      reasoning_rows: reasoningRows,
      user_visible_reasoning_log: {
        schema_version: romantic.user_visible_reasoning_log?.schema_version ?? 'relationship_reasoning_log.v1',
        visible_to_target: false,
        steps: reasoningSteps
      },
      third_party_prompts: thirdPartyPrompts
    },
    expert_context_packs: compactExpertContextPacks(decision),
    parallel_expert_run_log: decision.expert_matrix_analysis?.parallel_expert_run_log ?? null,
    structured_cot_trace: structuredCotTrace,
    romantic_coordinator_decision: coordinator.schema_version ? coordinator : null,
    frontend_display_contract: coordinator.frontend_display_contract ?? null,
    send_gate_transfer_path: coordinator.send_gate_transfer_path ?? null,
    chain_flow: chainFlow,
    branch_records: branchRecords,
    acceptance_evidence: [
      'decision_cluster_runtime_output',
      'expert_context_pack_per_selected_expert',
      'parallel_expert_run_log',
      'structured_cot_trace_no_raw_hidden_cot',
      'romantic_relationship_coordinator_expert',
      'frontend_display_contract',
      'online_offline_progression_track',
      'romantic_progression_cadence',
      'send_gate_transfer_path',
      'first_person_draft_with_dialogue_intent_contract',
      'third_party_prompt_cards_when_active_input_blocked',
      'branch_records_for_identity_context_stage_draft_and_send_gate',
      'real_execution_allowed_false'
    ],
    next_verification_commands: [
      'npm.cmd run pt028:gui-state',
      'npm.cmd run gui:report',
      'npm.cmd run pt028:audit',
      'npm.cmd run process-tree:validate'
    ]
  };
}

function dockBriefFromDock(dock) {
  const parts = dock?.status_parts ?? {};
  const stageTrack = parts.relationship_stage && parts.online_stage && parts.offline_stage
    ? `${parts.relationship_stage}/${parts.online_stage}/${parts.offline_stage}`
    : null;
  const structuredText = [
    stageTrack,
    parts.current_turn_intent,
    parts.gate_status
  ].filter(Boolean).join(' · ').trim();
  return structuredText
    || dock?.text
    || dock?.status_text
    || dock?.legacy_text
    || null;
}

function dockTextFromState(state) {
  return dockBriefFromDock(state?.frontend_display_contract?.surfaces?.dock)
    ?? state?.relationship_gradient_review?.dock_status_text
    ?? null;
}

function sendGateModeFromState(state) {
  return state?.send_gate_transfer_path?.current_mode
    ?? state?.romantic_coordinator_decision?.send_gate_transfer_path?.current_mode
    ?? null;
}

function targetSummaryFromState(state) {
  return {
    target_person_id: state?.source_decision?.target_person_id ?? null,
    target_display_name: state?.source_decision?.target_display_name ?? null,
    relationship_stage: state?.relationship_gradient_review?.current_stage ?? null,
    online_stage: state?.relationship_gradient_review?.online_offline_progression_track?.online_track?.stage ?? 'O0',
    offline_stage: state?.relationship_gradient_review?.online_offline_progression_track?.offline_track?.stage ?? 'F0',
    current_turn_intent: state?.relationship_gradient_review?.romantic_progression_cadence?.current_turn_intent ?? null
  };
}

function normalizeEventStateEntry(entry, index) {
  const state = entry?.state ?? entry;
  return {
    window_id: entry?.window_id ?? state?.source?.window_id ?? `window_${index + 1}`,
    app_type: entry?.app_type ?? state?.source?.app_type ?? 'wechat',
    state
  };
}

function changedFields(previousState, state) {
  const fields = [];
  if (!previousState || previousState?.state_id !== state?.state_id) fields.push('state_id');
  if (dockTextFromState(previousState) !== dockTextFromState(state)) fields.push('dock_status_text');
  if (sendGateModeFromState(previousState) !== sendGateModeFromState(state)) fields.push('send_gate_mode');
  if (
    previousState?.relationship_gradient_review?.current_stage
      !== state?.relationship_gradient_review?.current_stage
  ) fields.push('relationship_stage');
  if (
    previousState?.relationship_gradient_review?.online_offline_progression_track?.online_track?.stage
      !== state?.relationship_gradient_review?.online_offline_progression_track?.online_track?.stage
  ) fields.push('online_stage');
  if (
    previousState?.relationship_gradient_review?.online_offline_progression_track?.offline_track?.stage
      !== state?.relationship_gradient_review?.online_offline_progression_track?.offline_track?.stage
  ) fields.push('offline_stage');
  if (
    previousState?.relationship_gradient_review?.romantic_progression_cadence?.current_turn_intent
      !== state?.relationship_gradient_review?.romantic_progression_cadence?.current_turn_intent
  ) fields.push('current_turn_intent');
  return fields;
}

export function buildPt028GuiEventStream({
  states = [buildPt028GuiDecisionState()],
  previousStates = [],
  streamId = nowCompactId('pt028_gui_event_stream'),
  source = {}
} = {}) {
  const entries = states.map((entry, index) => normalizeEventStateEntry(entry, index));
  const previousByWindow = new Map(
    previousStates
      .map((entry, index) => normalizeEventStateEntry(entry, index))
      .map((entry) => [entry.window_id, entry.state])
  );
  const generatedAt = new Date().toISOString();
  const events = [];

  for (const [index, entry] of entries.entries()) {
    const { state } = entry;
    const previousState = previousByWindow.get(entry.window_id) ?? null;
    const summary = targetSummaryFromState(state);
    const fields = changedFields(previousState, state);
    const eventType = previousState ? 'decision_state_changed' : 'decision_state_initialized';
    events.push({
      schema_version: 'pt028_gui_state_event.v1',
      event_id: `${streamId}_event_${String(index + 1).padStart(3, '0')}`,
      event_sequence: index + 1,
      event_type: eventType,
      created_at: generatedAt,
      conversation_window_id: entry.window_id,
      app_type: entry.app_type,
      source_state_id: state?.state_id ?? null,
      target_person_id: summary.target_person_id,
      target_display_name: summary.target_display_name,
      dock_status_text: dockTextFromState(state),
      send_gate_mode: sendGateModeFromState(state),
      relationship_stage: summary.relationship_stage,
      online_stage: summary.online_stage,
      offline_stage: summary.offline_stage,
      current_turn_intent: summary.current_turn_intent,
      changed_fields: fields,
      payload_refs: {
        frontend_display_contract: 'frontend_display_contract.surfaces.dock',
        send_gate_transfer_path: 'send_gate_transfer_path.current_mode',
        relationship_gradient_review: 'relationship_gradient_review'
      },
      real_execution_allowed: state?.real_execution_allowed === true,
      real_send_attempted: state?.real_send_attempted === true
    });
  }

  const realExecutionAllowed = entries.some((entry) => entry.state?.real_execution_allowed === true);
  const realSendAttempted = entries.some((entry) => entry.state?.real_send_attempted === true);
  return {
    schema_version: 'pt028_gui_event_stream.v1',
    stream_id: streamId,
    created_at: generatedAt,
    gate_decision: realExecutionAllowed || realSendAttempted
      ? 'blocked_real_execution_signal_present'
      : 'ready_for_low_latency_gui_subscription',
    source,
    low_latency_policy: {
      schema_version: 'pt028_low_latency_gui_policy.v1',
      desktop_ipc_channel: 'zhineng:decision-state:changed',
      file_watch_path: 'runtime/pt028-gui-decision-states/latest.json',
      target_dispatch_latency_ms: 50,
      debounce_ms: 50,
      fallback_poll_interval_ms: 1000,
      user_control_policy: {
        auto_update_may_start_without_click: true,
        pause_stop_hide_or_frequency_control_required: true,
        control_basis: 'WCAG 2.2 SC 2.2.2 Pause, Stop, Hide',
        status_structure_basis: 'WCAG 2.2 SC 1.3.1 Info and Relationships'
      }
    },
    stream_integrity: {
      state_count: entries.length,
      event_count: events.length,
      unique_window_count: new Set(entries.map((entry) => entry.window_id)).size,
      unique_target_count: new Set(entries.map((entry) => entry.state?.source_decision?.target_person_id).filter(Boolean)).size,
      all_events_prompt_only: events.every((event) => event.send_gate_mode === 'blocked_prompt_only'),
      real_execution_allowed: realExecutionAllowed,
      real_send_attempted: realSendAttempted
    },
    events
  };
}

function buildPt028ScenarioDecision({
  targetPersonId,
  targetDisplayName,
  identityLabels,
  relationshipType,
  relationshipPhase,
  relationshipHealth = 0.68,
  contextText,
  eventTitle
}) {
  return buildDecisionRecommendation({
    goalInput: {
      initial_goal: 'PT-028 multi-window feedback calibration scenario.',
      scene: 'personal_social',
      primary_person_id: targetPersonId,
      target_person_ids: [targetPersonId],
      target_display_name: targetDisplayName,
      identity_labels: identityLabels,
      context_input: `${targetDisplayName}: ${contextText}`,
      preferred_channel: 'wechat',
      identity_gate_decision: identityLabels.includes('romantic_partner')
        ? 'identity_confirmed_by_user_context'
        : 'identity_unverified_desktop_context',
      source_type: 'pt028_multi_window_feedback_calibration_fixture'
    },
    socialGraph: {
      user_id: 'user',
      people: [
        {
          person_id: targetPersonId,
          display_name: targetDisplayName,
          roles: identityLabels,
          tags: ['pt028_multi_window_calibration_fixture']
        }
      ],
      relationships: [
        {
          relationship_id: `rel_user_${targetPersonId}`,
          from_person_id: 'user',
          to_person_id: targetPersonId,
          type_code: relationshipType,
          phase: relationshipPhase,
          trust_level: relationshipHealth >= 0.7 ? 'medium' : 'low',
          health_score: relationshipHealth,
          tags: ['multi_window_feedback_calibration']
        }
      ],
      events: [
        {
          event_id: `evt_${targetPersonId}_today`,
          event_type_code: 'personal_relationship_signal',
          event_level: 'P3',
          title: eventTitle,
          start_at: '2026-06-20T10:00:00+08:00',
          status: 'completed',
          importance: 0.6,
          confidence: 0.72,
          participants: [{ person_id: targetPersonId, role: 'target' }]
        }
      ]
    },
    rawEvents: [
      {
        event_id: `raw_${targetPersonId}_current`,
        speaker_person_id: targetPersonId,
        actor_person_id: targetPersonId,
        content: contextText,
        content_summary: `Current message from ${targetDisplayName}.`,
        linked_person_ids: [targetPersonId],
        metadata: {
          source_actor_type: 'target',
          read_only_replay: true,
          multi_window_calibration_fixture: true
        }
      }
    ],
    userPreferences: {
      automation_comfort: 'low',
      risk_tolerance: 'low',
      relationship_priority: 'high'
    }
  });
}

function buildDefaultCalibrationWindows() {
  const scenarios = [
    {
      window_id: 'wechat_window_romantic_confirmed',
      targetPersonId: 'person_pt028_multi_window_romantic',
      targetDisplayName: 'TargetA',
      identityLabels: ['romantic_partner'],
      relationshipType: 'romantic_partner',
      relationshipPhase: 'confirmed_romantic',
      relationshipHealth: 0.74,
      contextText: 'That sounded warm. I like when we talk this naturally.',
      eventTitle: 'Confirmed partner warm current-turn signal',
      feedback_record: {
        feedback_id: 'feedback_target_a_001',
        source_type: 'dry_run_operator_fixture',
        operator_decision: 'prompt_accepted_for_manual_edit',
        target_response_signal: 'warm_or_positive',
        notes: 'Operator accepted the micro progression prompt as a safe manual suggestion.'
      }
    },
    {
      window_id: 'wechat_window_candidate',
      targetPersonId: 'person_pt028_multi_window_candidate',
      targetDisplayName: 'TargetB',
      identityLabels: ['candidate_romantic_interest'],
      relationshipType: 'acquaintance',
      relationshipPhase: 'exploring',
      relationshipHealth: 0.58,
      contextText: 'Haha, you are fun to talk with.',
      eventTitle: 'Candidate warm but unconfirmed signal',
      feedback_record: {
        feedback_id: 'feedback_target_b_001',
        source_type: 'dry_run_operator_fixture',
        operator_decision: 'needs_context_before_progression',
        target_response_signal: 'insufficient_context',
        notes: 'Operator kept the target in context capture because identity is not confirmed.'
      }
    },
    {
      window_id: 'wechat_window_boundary_watch',
      targetPersonId: 'person_pt028_multi_window_boundary',
      targetDisplayName: 'TargetC',
      identityLabels: ['romantic_partner'],
      relationshipType: 'romantic_partner',
      relationshipPhase: 'confirmed_romantic',
      relationshipHealth: 0.52,
      contextText: 'If you cared, you would answer immediately and ignore everyone else tonight.',
      eventTitle: 'Boundary pressure signal',
      feedback_record: {
        feedback_id: 'feedback_target_c_001',
        source_type: 'dry_run_operator_fixture',
        operator_decision: 'hold_and_show_safety_prompt',
        target_response_signal: 'pressure_or_boundary_risk',
        notes: 'Operator should keep prompt-only mode and review target-side pressure risk.'
      }
    }
  ];

  return scenarios.map((scenario, index) => {
    const decision = buildPt028ScenarioDecision(scenario);
    return {
      window_id: scenario.window_id,
      app_type: 'wechat',
      target_person_id: scenario.targetPersonId,
      target_display_name: scenario.targetDisplayName,
      feedback_record: scenario.feedback_record,
      state: buildPt028GuiDecisionState({
        decision,
        source: {
          source_type: 'pt028_multi_window_feedback_calibration_fixture',
          window_id: scenario.window_id,
          app_type: 'wechat'
        },
        stateId: `pt028_gui_decision_state_multi_window_${index + 1}`
      })
    };
  });
}

function normalizeCalibrationWindow(entry, index) {
  const state = entry?.state ?? entry;
  const target = targetSummaryFromState(state);
  return {
    window_id: entry?.window_id ?? state?.source?.window_id ?? `window_${index + 1}`,
    app_type: entry?.app_type ?? state?.source?.app_type ?? 'wechat',
    target_person_id: entry?.target_person_id ?? target.target_person_id,
    target_display_name: entry?.target_display_name ?? target.target_display_name,
    state,
    feedback_record: entry?.feedback_record ?? {
      feedback_id: `feedback_${index + 1}`,
      source_type: 'missing_feedback',
      operator_decision: 'not_reviewed',
      target_response_signal: 'unknown',
      notes: 'No operator feedback was attached to this window.'
    }
  };
}

function cadenceCalibrationDecision(feedback) {
  if (feedback.target_response_signal === 'warm_or_positive') {
    return {
      calibrated_cadence: 'keep_micro_progression',
      weight_delta: 0.05,
      reason: 'Positive manual feedback supports keeping the same one-step cadence.'
    };
  }
  if (feedback.target_response_signal === 'pressure_or_boundary_risk') {
    return {
      calibrated_cadence: 'hold_and_surface_safety_review',
      weight_delta: -0.2,
      reason: 'Boundary pressure lowers progression weight and raises safety review priority.'
    };
  }
  return {
    calibrated_cadence: 'hold_for_context_or_identity',
    weight_delta: -0.08,
    reason: 'Insufficient or missing feedback should not upgrade the relationship stage.'
  };
}

function isHumanReviewedRealFeedback(feedback) {
  const realFeedbackSourceTypes = new Set(['real_operator_feedback', 'human_reviewed_real_window_feedback']);
  return realFeedbackSourceTypes.has(feedback?.source_type)
    && feedback.real_window_observed === true
    && feedback.state_target_verified === true
    && feedback.prompt_only_confirmed === true
    && feedback.no_real_send_attempted === true
    && feedback.privacy_boundary_confirmed === true
    && typeof feedback.reviewed_at === 'string'
    && feedback.reviewed_at.length > 0
    && Array.isArray(feedback.evidence_refs)
    && feedback.evidence_refs.length > 0;
}

export function buildPt028MultiWindowFeedbackCalibration({
  windows = buildDefaultCalibrationWindows(),
  calibrationId = nowCompactId('pt028_multi_window_feedback_calibration'),
  requiredWindowCount = 2,
  requiredUniqueTargetCount = 2,
  source = {}
} = {}) {
  const normalized = windows.map((entry, index) => normalizeCalibrationWindow(entry, index));
  const targetIds = normalized.map((entry) => entry.target_person_id).filter(Boolean);
  const stateIds = normalized.map((entry) => entry.state?.state_id).filter(Boolean);
  const rows = normalized.map((entry) => {
    const feedback = entry.feedback_record;
    const calibrationDecision = cadenceCalibrationDecision(feedback);
    const stateTargetId = entry.state?.source_decision?.target_person_id ?? null;
    const stateBindingComplete = entry.state?.schema_version === 'pt028_gui_decision_state.v1'
      && Boolean(entry.state?.state_id);
    return {
      window_id: entry.window_id,
      app_type: entry.app_type,
      target_person_id: entry.target_person_id,
      target_display_name: entry.target_display_name,
      state_id: entry.state?.state_id ?? null,
      dock_status_text: dockTextFromState(entry.state),
      send_gate_mode: sendGateModeFromState(entry.state),
      before: {
        relationship_stage: entry.state?.relationship_gradient_review?.current_stage ?? null,
        online_stage: entry.state?.relationship_gradient_review?.online_offline_progression_track?.online_track?.stage ?? 'O0',
        offline_stage: entry.state?.relationship_gradient_review?.online_offline_progression_track?.offline_track?.stage ?? 'F0',
        current_turn_intent: entry.state?.relationship_gradient_review?.romantic_progression_cadence?.current_turn_intent ?? null
      },
      feedback,
      calibration_result: calibrationDecision,
      isolation_check: {
        state_binding_complete: stateBindingComplete,
        state_target_matches_window_target: !stateTargetId || stateTargetId === entry.target_person_id,
        target_context_reused_across_windows: targetIds.filter((id) => id === entry.target_person_id).length > 1,
        state_reused_across_windows: stateIds.filter((id) => id === entry.state?.state_id).length > 1
      },
      real_feedback: isHumanReviewedRealFeedback(feedback),
      real_feedback_requirements: {
        source_type_real: ['real_operator_feedback', 'human_reviewed_real_window_feedback'].includes(feedback?.source_type),
        real_window_observed: feedback.real_window_observed === true,
        state_target_verified: feedback.state_target_verified === true,
        prompt_only_confirmed: feedback.prompt_only_confirmed === true,
        no_real_send_attempted: feedback.no_real_send_attempted === true,
        privacy_boundary_confirmed: feedback.privacy_boundary_confirmed === true,
        has_reviewed_at: typeof feedback.reviewed_at === 'string' && feedback.reviewed_at.length > 0,
        has_evidence_refs: Array.isArray(feedback.evidence_refs) && feedback.evidence_refs.length > 0
      }
    };
  });

  const noCrossTargetStateReuse = rows.every((row) =>
    row.isolation_check.state_binding_complete
      &&
    row.isolation_check.state_target_matches_window_target
      && !row.isolation_check.target_context_reused_across_windows
      && !row.isolation_check.state_reused_across_windows
  );
  const promptOnly = rows.every((row) => row.send_gate_mode === 'blocked_prompt_only');
  const stateBindingComplete = rows.every((row) => row.isolation_check.state_binding_complete);
  const realFeedbackRecordCount = rows.filter((row) => row.real_feedback).length;
  const targetCount = new Set(targetIds).size;
  const multiTargetFeedbackReady = rows.length >= requiredWindowCount && targetCount >= requiredUniqueTargetCount;
  const requiredOpenItems = [];
  if (rows.length < requiredWindowCount) requiredOpenItems.push('need_at_least_two_windows_for_multi_window_calibration');
  if (targetCount < requiredUniqueTargetCount) requiredOpenItems.push('need_at_least_two_unique_targets_for_multi_target_calibration');
  if (!stateBindingComplete) requiredOpenItems.push('real_runtime_state_missing_for_one_or_more_windows');
  if (!noCrossTargetStateReuse) requiredOpenItems.push('target_or_state_context_is_not_isolated');
  if (!promptOnly) requiredOpenItems.push('all_windows_must_remain_prompt_only_before_acceptance');
  if (realFeedbackRecordCount < rows.length) requiredOpenItems.push('real_operator_feedback_missing_for_one_or_more_windows');

  return {
    schema_version: 'pt028_multi_window_feedback_calibration.v1',
    calibration_id: calibrationId,
    created_at: new Date().toISOString(),
    source,
    gate_decision: requiredOpenItems.length
      ? 'dry_run_ready_but_real_feedback_required'
      : 'ready_for_real_multi_window_feedback_review',
    real_execution_allowed: false,
    real_send_attempted: false,
    required_window_count: requiredWindowCount,
    required_unique_target_count: requiredUniqueTargetCount,
    window_count: rows.length,
    target_count: targetCount,
    multi_target_feedback_ready: multiTargetFeedbackReady,
    real_feedback_record_count: realFeedbackRecordCount,
    state_binding_complete: stateBindingComplete,
    no_cross_target_state_reuse: noCrossTargetStateReuse,
    prompt_only_all_windows: promptOnly,
    calibration_rows: rows,
    aggregate_adjustment: {
      positive_feedback_count: rows.filter((row) => row.feedback.target_response_signal === 'warm_or_positive').length,
      hold_or_context_count: rows.filter((row) => row.calibration_result.calibrated_cadence.includes('hold')).length,
      average_weight_delta: rows.length
        ? Number((rows.reduce((sum, row) => sum + row.calibration_result.weight_delta, 0) / rows.length).toFixed(3))
        : 0,
      rule: 'Real feedback may tune cadence weights but must not auto-upgrade relationship stage or enable real sending.'
    },
    required_open_items: requiredOpenItems
  };
}

function finalCheck({ id, label, passed, evidence, notes }) {
  return {
    check_id: id,
    label,
    status: passed ? 'passed' : 'open',
    evidence,
    notes
  };
}

export function buildPt028FinalSpecialAcceptance({
  guiState = buildPt028GuiDecisionState(),
  eventStream = buildPt028GuiEventStream({ states: [guiState] }),
  feedbackCalibration = buildPt028MultiWindowFeedbackCalibration(),
  realFeedbackReadiness = null,
  audit = null,
  acceptanceId = nowCompactId('pt028_final_special_acceptance'),
  source = {}
} = {}) {
  const checks = [
    finalCheck({
      id: 'gui_state_runtime_projection',
      label: 'pt028_gui_decision_state.v1 runtime projection is available',
      passed: guiState?.schema_version === 'pt028_gui_decision_state.v1'
        && Boolean(dockTextFromState(guiState))
        && guiState?.real_execution_allowed === false,
      evidence: 'runtime/pt028-gui-decision-states/latest.json',
      notes: 'The GUI can read a prompt-only runtime projection with dock status and detailed console evidence.'
    }),
    finalCheck({
      id: 'low_latency_event_stream',
      label: 'low-latency GUI event stream contract is ready',
      passed: eventStream?.schema_version === 'pt028_gui_event_stream.v1'
        && eventStream?.low_latency_policy?.desktop_ipc_channel === 'zhineng:decision-state:changed'
        && eventStream?.stream_integrity?.event_count > 0
        && eventStream?.stream_integrity?.all_events_prompt_only === true
        && eventStream?.stream_integrity?.real_execution_allowed === false,
      evidence: 'pt028_gui_event_stream.v1; Sightflow IPC zhineng:decision-state:changed',
      notes: 'The event stream supports desktop push, keeps 5s polling as a fallback, and stays prompt-only. Real feedback-bound multi-window coverage is checked separately.'
    }),
    finalCheck({
      id: 'feedback_bound_multi_window_event_stream',
      label: 'feedback-bound low-latency event stream covers multiple target windows',
      passed: eventStream?.schema_version === 'pt028_gui_event_stream.v1'
        && eventStream?.stream_integrity?.unique_window_count >= 2
        && eventStream?.stream_integrity?.unique_target_count >= 2
        && eventStream?.stream_integrity?.all_events_prompt_only === true
        && eventStream?.stream_integrity?.real_execution_allowed === false
        && realFeedbackReadiness?.final_acceptance_ready === true,
      evidence: 'pt028_gui_event_stream.v1 built from pt028_real_multi_window_operator_feedback.v1',
      notes: 'Final production acceptance requires the low-latency stream to be bound to validated real multi-window feedback, not only a latest-state or candidate preview stream.'
    }),
    finalCheck({
      id: 'multi_window_context_isolation',
      label: 'multi-window feedback calibration keeps target contexts isolated',
      passed: feedbackCalibration?.schema_version === 'pt028_multi_window_feedback_calibration.v1'
        && feedbackCalibration?.window_count >= 2
        && feedbackCalibration?.target_count >= 2
        && feedbackCalibration?.multi_target_feedback_ready === true
        && feedbackCalibration?.no_cross_target_state_reuse === true
        && feedbackCalibration?.prompt_only_all_windows === true,
      evidence: 'pt028_multi_window_feedback_calibration.v1',
      notes: 'Multiple target windows can be calibrated without reusing target context or enabling sending.'
    }),
    finalCheck({
      id: 'real_feedback_readiness_gate',
      label: 'real multi-window feedback input readiness is complete',
      passed: realFeedbackReadiness?.schema_version === 'pt028_real_feedback_readiness.v1'
        && realFeedbackReadiness?.final_acceptance_ready === true
        && realFeedbackReadiness?.real_execution_allowed === false,
      evidence: 'runtime/pt028-real-feedback-readiness/latest.json',
      notes: 'The final acceptance gate requires a validated real feedback batch with no placeholders, verified state paths, evidence refs and human special review.'
    }),
    finalCheck({
      id: 'real_feedback_calibration_evidence',
      label: 'real operator feedback is attached for every calibration window',
      passed: feedbackCalibration?.real_feedback_record_count >= feedbackCalibration?.window_count
        && feedbackCalibration?.window_count >= 2,
      evidence: 'feedback_calibration.real_feedback_record_count',
      notes: 'This must be based on human-reviewed real window feedback, not only dry-run fixtures.'
    }),
    finalCheck({
      id: 'pt028_audit_runtime_gate',
      label: 'PT-028 audit confirms runtime gates and send blocking',
      passed: audit
        ? audit?.core_runtime_stage_tests_passed === true
          && audit?.real_execution_allowed === false
          && audit?.real_send_attempted === false
        : false,
      evidence: 'runtime/pt028-audits/**/pt028-romantic-flow-audit.json',
      notes: 'The final acceptance gate reads the latest PT-028 audit when available.'
    }),
    finalCheck({
      id: 'final_human_special_review',
      label: 'final special acceptance has human review approval',
      passed: source?.human_special_review_approved === true,
      evidence: 'operator-provided final special review decision',
      notes: 'Production completion still requires a user/human expert review decision.'
    })
  ];
  const requiredFailures = checks.filter((check) => check.status !== 'passed');
  return {
    schema_version: 'pt028_final_special_acceptance.v1',
    acceptance_id: acceptanceId,
    created_at: new Date().toISOString(),
    source,
    gate_decision: requiredFailures.length
      ? 'blocked_pending_real_special_acceptance_evidence'
      : 'pt028_final_special_acceptance_passed',
    pt028_fully_accepted_for_production: requiredFailures.length === 0,
    real_execution_allowed: false,
    real_send_attempted: false,
    checks,
    required_failures: requiredFailures.map((check) => ({
      check_id: check.check_id,
      label: check.label,
      evidence: check.evidence,
      notes: check.notes
    })),
    linked_artifacts: {
      gui_state_id: guiState?.state_id ?? null,
      event_stream_id: eventStream?.stream_id ?? null,
      feedback_calibration_id: feedbackCalibration?.calibration_id ?? null,
      real_feedback_readiness_id: realFeedbackReadiness?.readiness_id ?? null,
      audit_id: audit?.audit_id ?? null
    }
  };
}
