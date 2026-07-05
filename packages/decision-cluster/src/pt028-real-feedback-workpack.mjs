import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function nowCompactId(prefix) {
  return `${prefix}_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function readJsonIfExists(file) {
  if (!file || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function resolveMaybeRelative(root, maybePath) {
  if (!maybePath || typeof maybePath !== 'string') return null;
  return path.isAbsolute(maybePath) ? maybePath : path.resolve(root, maybePath);
}

function relativeOrNull(root, maybePath) {
  if (!maybePath) return null;
  return path.relative(root, maybePath).replace(/\\/g, '/');
}

function normalizeRef(value) {
  return String(value ?? '').replace(/\\/g, '/');
}

function collectFilesByName(dir, names, out = []) {
  if (!existsSync(dir)) return out;
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const current = path.join(dir, item.name);
    if (item.isDirectory()) {
      collectFilesByName(current, names, out);
    } else if (names.has(item.name)) {
      out.push(current);
    }
  }
  return out;
}

const SOURCE_LANES = [
  {
    source_lane: 'wechat_real_human_contact_window',
    root_parts: ['runtime', 'desktop-inbox-real'],
    source_kind: 'desktop',
    accepted_platforms: ['wechat']
  },
  {
    source_lane: 'browser_saved_human_chat_page',
    root_parts: ['runtime', 'browser-intake-real'],
    source_kind: 'browser',
    accepted_platforms: ['web']
  },
  {
    source_lane: 'external_chat_export_human_contact',
    root_parts: ['runtime', 'external-chat-intake-real'],
    source_kind: 'file',
    accepted_platforms: ['external_chat_export']
  },
  {
    source_lane: 'business_api_human_contact_snapshot',
    root_parts: ['runtime', 'business-api-intake-real'],
    source_kind: 'api',
    accepted_platforms: ['business_system']
  }
];

function observationTextAvailable(observation) {
  return Boolean(
    observation?.content
      || observation?.text
      || observation?.ocr_text
      || observation?.content_text
      || observation?.content_summary
  );
}

function sourceActorTypeFromObservation(observation) {
  return observation?.source_actor_type
    ?? observation?.metadata?.source_actor_type
    ?? null;
}

function platformFromObservation(observation) {
  return observation?.platform
    ?? observation?.app_type
    ?? observation?.source?.platform
    ?? null;
}

function identityHintsFromObservation(observation) {
  const hints = observation?.source_identity_hints
    ?? observation?.identity_hints
    ?? observation?.metadata?.source_identity_hints
    ?? [];
  return Array.isArray(hints) ? hints : [];
}

function candidateBlockers({ observation, lane, rawArtifactRefs, platform, sourceActorType, realExecutionAllowed, realSendAttempted }) {
  const blockers = [];
  if (!lane.accepted_platforms.includes(platform)) blockers.push('platform_not_accepted_for_lane');
  if (sourceActorType !== 'human_contact') blockers.push('source_actor_type_not_human_contact');
  if (!observationTextAvailable(observation)) blockers.push('content_missing');
  if (!rawArtifactRefs.length) blockers.push('evidence_refs_missing');
  if (realExecutionAllowed) blockers.push('real_execution_allowed_must_be_false');
  if (realSendAttempted) blockers.push('real_send_attempted_must_be_false');
  return blockers;
}

function realObservationStateIndex(root) {
  const base = path.join(root, 'runtime', 'pt028-real-observation-gui-states');
  const files = collectFilesByName(base, new Set(['pt028-gui-decision-state.json']));
  const entries = new Map();
  for (const file of files) {
    const state = readJsonIfExists(file);
    if (state?.schema_version !== 'pt028_gui_decision_state.v1') continue;
    const observationPath = state.source?.observation_path;
    if (!observationPath) continue;
    const statePath = resolveMaybeRelative(root, state.output_paths?.json_path) ?? file;
    const entry = {
      candidate_state_available: true,
      candidate_state_path: relativeOrNull(root, statePath),
      candidate_state_id: state.state_id ?? null,
      candidate_state_window_id: state.source?.window_id ?? null,
      candidate_state_target_person_id: state.source_decision?.target_person_id ?? null,
      candidate_state_target_display_name: state.source_decision?.target_display_name ?? null,
      candidate_state_dock_status_text: dockBriefFromDock(state.frontend_display_contract?.surfaces?.dock),
      candidate_state_send_gate_mode: state.send_gate_transfer_path?.current_mode ?? null,
      candidate_state_real_execution_allowed: state.real_execution_allowed === true,
      candidate_state_real_send_attempted: state.real_send_attempted === true
    };
    entries.set(normalizeRef(observationPath), entry);
  }
  return entries;
}

function sourceObservationCandidates(root, limit = 12, stateIndex = new Map()) {
  const files = SOURCE_LANES.flatMap((lane) => {
    const base = path.join(root, ...lane.root_parts);
    return collectFilesByName(
      base,
      new Set(['intake-observation.real.json', 'intake-observation.reviewed.json'])
    ).map((file) => ({ file, lane }));
  })
    .sort((a, b) => statSync(b.file).mtimeMs - statSync(a.file).mtimeMs)
    .slice(0, limit);
  return files.flatMap(({ file, lane }) => {
    const observation = readJsonIfExists(file);
    if (!observation) return [];
    const sourceActorType = sourceActorTypeFromObservation(observation);
    const platform = platformFromObservation(observation);
    const rawArtifactRefs = Array.isArray(observation.raw_artifact_refs)
      ? observation.raw_artifact_refs
      : [];
    const observationPath = relativeOrNull(root, file);
    const stateMatch = stateIndex.get(normalizeRef(observationPath)) ?? null;
    const realExecutionAllowed = observation.real_execution_allowed === true;
    const realSendAttempted = observation.real_send_attempted === true;
    const blockers = candidateBlockers({
      observation,
      lane,
      rawArtifactRefs,
      platform,
      sourceActorType,
      realExecutionAllowed,
      realSendAttempted
    });
    return [{
      observation_path: observationPath,
      observation_id: observation.observation_id ?? null,
      source_lane: lane.source_lane,
      source_kind: lane.source_kind,
      platform,
      source_type: observation.source_type ?? null,
      source_actor_type: sourceActorType,
      captured_at: observation.captured_at ?? observation.observed_at ?? observation.created_at ?? null,
      raw_artifact_refs: rawArtifactRefs.slice(0, 5),
      raw_artifact_count: rawArtifactRefs.length,
      content_available: observationTextAvailable(observation),
      identity_hints_available: identityHintsFromObservation(observation).length > 0,
      real_execution_allowed: realExecutionAllowed,
      real_send_attempted: realSendAttempted,
      candidate_blockers: blockers,
      candidate_for_feedback_evidence: blockers.length === 0,
      requires_operator_confirmation: true,
      ...(stateMatch ?? {
        candidate_state_available: false,
        candidate_state_path: null,
        candidate_state_id: null,
        candidate_state_window_id: null,
        candidate_state_target_person_id: null,
        candidate_state_target_display_name: null,
        candidate_state_dock_status_text: null,
        candidate_state_send_gate_mode: null,
        candidate_state_real_execution_allowed: false,
        candidate_state_real_send_attempted: false
      })
    }];
  });
}

function desktopObservationCandidates(root, limit = 12, stateIndex = new Map()) {
  return sourceObservationCandidates(root, limit, stateIndex);
}

function buildCandidateSourceLaneSummary(candidateObservations) {
  const laneSummaries = SOURCE_LANES.map((lane) => {
    const laneCandidates = candidateObservations.filter((item) => item.source_lane === lane.source_lane);
    const candidatePaths = laneCandidates
      .filter((item) => item.candidate_for_feedback_evidence)
      .map((item) => item.observation_path)
      .filter(Boolean);
    const identityRequiredPaths = laneCandidates
      .filter((item) => item.candidate_blockers?.includes('source_actor_type_not_human_contact'))
      .map((item) => item.observation_path)
      .filter(Boolean);
    const blockers = [...new Set(laneCandidates.flatMap((item) => item.candidate_blockers ?? []))];
    return {
      source_lane: lane.source_lane,
      source_kind: lane.source_kind,
      scanned_observation_count: laneCandidates.length,
      candidate_for_feedback_count: candidatePaths.length,
      identity_confirmation_required_count: identityRequiredPaths.length,
      candidate_observation_paths: candidatePaths.slice(0, 8),
      identity_confirmation_required_observation_paths: identityRequiredPaths.slice(0, 8),
      open_blockers: blockers
    };
  });
  return {
    schema_version: 'pt028_candidate_source_lane_summary.v1',
    scanned_observation_count: candidateObservations.length,
    candidate_for_feedback_count: candidateObservations
      .filter((item) => item.candidate_for_feedback_evidence)
      .length,
    identity_confirmation_required_count: candidateObservations
      .filter((item) => item.candidate_blockers?.includes('source_actor_type_not_human_contact'))
      .length,
    lanes: laneSummaries,
    notes: 'All source-lane candidates are read-only references. They do not satisfy real feedback readiness until an operator verifies target identity, prompt-only state, no-send state and privacy boundary.'
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

function stateSummary(state, statePath) {
  return {
    state_id: state?.state_id ?? null,
    state_path: statePath,
    source_type: state?.source?.source_type ?? null,
    source_window_id: state?.source?.window_id ?? null,
    source_app_type: state?.source?.app_type ?? null,
    target_person_id: state?.source_decision?.target_person_id ?? null,
    target_display_name: state?.source_decision?.target_display_name ?? null,
    dock_status_text: dockBriefFromDock(state?.frontend_display_contract?.surfaces?.dock)
      ?? state?.relationship_gradient_review?.dock_status_text
      ?? null,
    send_gate_mode: state?.send_gate_transfer_path?.current_mode ?? null,
    real_execution_allowed: state?.real_execution_allowed === true,
    real_send_attempted: state?.real_send_attempted === true
  };
}

function makeCheck(checkId, passed, evidence, severity = 'required') {
  return {
    check_id: checkId,
    status: passed ? 'passed' : 'open',
    severity,
    evidence
  };
}

function candidateEvidenceRefs(candidate) {
  if (!candidate?.candidate_for_feedback_evidence) {
    return null;
  }
  return [
    candidate.observation_path,
    ...(candidate.raw_artifact_refs ?? [])
  ].filter(Boolean);
}

function draftRecord(index, candidate = null) {
  const slot = String(index + 1).padStart(3, '0');
  const evidenceRefs = candidateEvidenceRefs(candidate);
  const hasCandidateState = candidate?.candidate_state_available === true;
  return {
    feedback_id: `feedback_window_${slot}`,
    window_id: hasCandidateState && candidate.candidate_state_window_id
      ? candidate.candidate_state_window_id
      : `REPLACE_WITH_REAL_WINDOW_ID_${slot}`,
    app_type: candidate?.platform ?? 'wechat',
    target_person_id: hasCandidateState && candidate.candidate_state_target_person_id
      ? candidate.candidate_state_target_person_id
      : `REPLACE_WITH_TARGET_PERSON_ID_${slot}`,
    target_display_name: hasCandidateState && candidate.candidate_state_target_display_name
      ? candidate.candidate_state_target_display_name
      : `REPLACE_WITH_TARGET_DISPLAY_NAME_${slot}`,
    source_type: 'human_reviewed_real_window_feedback',
    operator_decision: index === 0
      ? 'prompt_accepted_for_manual_edit'
      : 'needs_context_before_progression',
    target_response_signal: index === 0
      ? 'warm_or_positive'
      : 'insufficient_context',
    state_path: hasCandidateState && candidate.candidate_state_path
      ? candidate.candidate_state_path
      : `REPLACE_WITH_RUNTIME_PT028_GUI_DECISION_STATE_JSON_FOR_WINDOW_${slot}`,
    real_window_observed: false,
    state_target_verified: false,
    prompt_only_confirmed: false,
    no_real_send_attempted: false,
    privacy_boundary_confirmed: false,
    reviewed_at: 'REPLACE_WITH_ISO_TIME',
    evidence_refs: evidenceRefs?.length
      ? evidenceRefs
      : [`REPLACE_WITH_SCREENSHOT_OR_STATE_EVIDENCE_REF_${slot}`],
    candidate_observation_ref: candidate?.observation_path ?? null,
    candidate_observation_id: candidate?.observation_id ?? null,
    candidate_state_ref: hasCandidateState ? candidate.candidate_state_path : null,
    candidate_state_id: hasCandidateState ? candidate.candidate_state_id : null,
    candidate_evidence_prefilled: Boolean(evidenceRefs?.length),
    candidate_state_prefilled: hasCandidateState,
    candidate_requires_operator_confirmation: Boolean(candidate),
    notes: evidenceRefs?.length || hasCandidateState
      ? 'Candidate desktop observation evidence and any generated GUI state path were prefilled. Operator must still verify the real window, target binding, prompt-only gate, no-send state and privacy boundary before changing any confirmation boolean.'
      : 'Replace with concise operator feedback. Do not paste private raw chat text here.'
  };
}

function buildDraftFeedbackBatch({ workpackId, createdAt, minimumWindowSlots, candidateObservations = [] }) {
  const usableCandidates = candidateObservations
    .filter((item) => item.candidate_for_feedback_evidence)
    .slice(0, minimumWindowSlots);
  return {
    schema_version: 'pt028_real_multi_window_operator_feedback.v1',
    feedback_batch_id: `${workpackId}_draft_feedback_batch`,
    created_at: createdAt,
    reviewer: {
      reviewer_id: 'REPLACE_WITH_REVIEWER_ID',
      role: 'operator_or_human_expert',
      reviewed_at: 'REPLACE_WITH_ISO_TIME'
    },
    window_feedback_records: Array.from(
      { length: minimumWindowSlots },
      (_, index) => draftRecord(index, usableCandidates[index] ?? null)
    ),
    human_special_review: {
      approved_for_final_special_acceptance: false,
      reviewer_id: 'REPLACE_WITH_FINAL_REVIEWER_ID',
      reviewed_at: 'REPLACE_WITH_ISO_TIME',
      approval_scope: [
        'low_latency_event_stream',
        'real_multi_window_feedback_calibration',
        'prompt_only_send_gate',
        'privacy_boundary',
        'final_special_acceptance'
      ],
      notes: 'Keep false until the human special reviewer has checked real windows, prompt-only state, feedback calibration and audit evidence.'
    }
  };
}

function failureIds(readiness) {
  return (readiness?.required_failures ?? []).map((item) =>
    typeof item === 'string' ? item : item.failure_id
  ).filter(Boolean);
}

function finalFailureIds(finalAcceptance) {
  return (finalAcceptance?.required_failures ?? []).map((item) =>
    typeof item === 'string' ? item : item.check_id
  ).filter(Boolean);
}

function buildAcceptanceClosurePlan({
  readiness,
  eventStream,
  finalAcceptance,
  targetFeedbackExists,
  targetFeedbackPath,
  candidateTargetCoverage,
  minimumWindowSlots
}) {
  const readinessFailures = failureIds(readiness);
  const finalFailures = finalFailureIds(finalAcceptance);
  const eventIntegrity = eventStream?.stream_integrity ?? {};
  const eventStreamReady = eventStream?.schema_version === 'pt028_gui_event_stream.v1'
    && eventStream?.gate_decision === 'ready_for_low_latency_gui_subscription'
    && eventIntegrity.unique_window_count >= 2
    && eventIntegrity.unique_target_count >= 2
    && eventIntegrity.real_execution_allowed !== true
    && eventIntegrity.real_send_attempted !== true;
  const feedbackReady = readiness?.calibration_ready === true;
  const finalReviewReady = readiness?.human_special_review_ready === true;
  const targetCoverageReady = candidateTargetCoverage?.ready_for_multi_target_real_feedback_collection === true;
  const realFeedbackReadyForFinal = readiness?.final_acceptance_ready === true;
  const productionAcceptanceReady = realFeedbackReadyForFinal
    && finalAcceptance?.pt028_fully_accepted_for_production === true;

  const orderedNextActions = [];
  if (!targetCoverageReady) {
    orderedNextActions.push('Capture or import at least one additional real human-contact desktop window for a different target_person_id, then run npm.cmd run pt028:real-observation-gui-states and npm.cmd run pt028:feedback-workpack again.');
  }
  if (!eventStreamReady) {
    const hasSingleWindowStream = eventStream?.schema_version === 'pt028_gui_event_stream.v1'
      && (eventIntegrity.unique_window_count ?? 0) > 0;
    orderedNextActions.push(hasSingleWindowStream
      ? 'After the real feedback file covers at least two distinct targets, run npm.cmd run pt028:event-stream -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json so final acceptance uses a feedback-bound multi-window event stream.'
      : 'Run npm.cmd run pt028:gui-state and npm.cmd run pt028:event-stream to refresh the base prompt-only stream evidence, then bind the final stream to the real feedback batch.');
  }
  if (!targetFeedbackExists) {
    orderedNextActions.push(`Create ${targetFeedbackPath} from the generated draft only after operator review; replace placeholders and keep private raw chat text out of the file.`);
  }
  if (!feedbackReady || readinessFailures.length) {
    orderedNextActions.push('For every feedback row, verify real_window_observed, state_target_verified, prompt_only_confirmed, no_real_send_attempted, privacy_boundary_confirmed, reviewed_at and evidence_refs.');
  }
  if (!finalReviewReady) {
    orderedNextActions.push('After readiness and calibration pass, set human_special_review.approved_for_final_special_acceptance=true only after human/expert final review.');
  }
  orderedNextActions.push('Run readiness, event-stream, calibration and final-acceptance with --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json.');

  return {
    schema_version: 'pt028_acceptance_closure_plan.v1',
    objective: '真实多窗口反馈校准、低延迟事件流和最终专项验收',
    current_gate_decision: productionAcceptanceReady
      ? 'production_acceptance_complete'
      : targetFeedbackExists
        ? 'real_feedback_file_present_but_gates_still_require_validation'
        : 'operator_input_required_before_production_acceptance',
    production_acceptance_ready: productionAcceptanceReady,
    can_be_completed_without_human_input: false,
    no_real_send_boundary: {
      real_execution_allowed: false,
      real_send_attempted: false,
      workpack_writes_real_feedback_target: false
    },
    low_latency_event_stream: {
      status: eventStreamReady ? 'ready_for_multi_window_subscription_evidence' : 'needs_real_feedback_bound_event_stream',
      stream_id: eventStream?.stream_id ?? null,
      ipc_channel: eventStream?.low_latency_policy?.desktop_ipc_channel ?? null,
      event_count: eventIntegrity.event_count ?? 0,
      unique_window_count: eventIntegrity.unique_window_count ?? 0,
      unique_target_count: eventIntegrity.unique_target_count ?? 0,
      real_execution_allowed: eventIntegrity.real_execution_allowed === true,
      real_send_attempted: eventIntegrity.real_send_attempted === true
    },
    real_multi_window_feedback: {
      status: feedbackReady ? 'calibration_input_ready' : 'waiting_for_operator_feedback',
      target_feedback_exists: targetFeedbackExists,
      target_feedback_path: targetFeedbackPath,
      required_window_slots: minimumWindowSlots,
      required_unique_target_count: candidateTargetCoverage?.required_unique_target_count ?? 2,
      candidate_unique_target_count: candidateTargetCoverage?.observed_unique_target_count ?? 0,
      candidate_multi_target_ready: targetCoverageReady,
      readiness_failures: readinessFailures
    },
    final_special_acceptance: {
      status: productionAcceptanceReady
        ? 'accepted_for_production'
        : 'blocked_pending_real_feedback_and_human_review',
      latest_acceptance_id: finalAcceptance?.acceptance_id ?? null,
      latest_gate_decision: finalAcceptance?.gate_decision ?? null,
      latest_required_failures: finalFailures,
      human_special_review_ready: finalReviewReady,
      final_acceptance_ready: realFeedbackReadyForFinal
    },
    ordered_next_actions: orderedNextActions,
    commands_after_real_feedback_ready: [
      'npm.cmd run pt028:feedback-readiness -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
      'npm.cmd run pt028:event-stream -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
      'npm.cmd run pt028:feedback-calibration -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
      'npm.cmd run pt028:final-acceptance -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
      'npm.cmd run pt028:audit'
    ]
  };
}

function buildMissingTargetCollectionPlan({
  candidateTargetCoverage,
  candidateObservations,
  candidateSourceLaneSummary,
  targetFeedbackPath
}) {
  const requiredUniqueTargetCount = candidateTargetCoverage?.required_unique_target_count ?? 2;
  const observedTargetPersonIds = candidateTargetCoverage?.observed_target_person_ids ?? [];
  const observedUniqueTargetCount = candidateTargetCoverage?.observed_unique_target_count ?? observedTargetPersonIds.length;
  const requiredAdditionalUniqueTargetCount = Math.max(
    0,
    requiredUniqueTargetCount - observedUniqueTargetCount
  );
  const exampleCandidateEvidenceRefs = candidateObservations
    .filter((item) => item.candidate_for_feedback_evidence)
    .flatMap((item) => [
      item.observation_path,
      ...(item.raw_artifact_refs ?? []),
      item.candidate_state_path
    ])
    .filter(Boolean)
    .slice(0, 8);

  return {
    schema_version: 'pt028_missing_target_collection_plan.v1',
    gate_decision: requiredAdditionalUniqueTargetCount === 0
      ? 'multi_target_candidate_coverage_ready_for_operator_review'
      : 'missing_distinct_target_real_window_required',
    required_unique_target_count: requiredUniqueTargetCount,
    observed_unique_target_count: observedUniqueTargetCount,
    required_additional_unique_target_count: requiredAdditionalUniqueTargetCount,
    covered_target_person_ids: observedTargetPersonIds,
    must_be_different_from_target_person_ids: observedTargetPersonIds,
    target_feedback_path: targetFeedbackPath,
    accepted_source_lanes: [
      'wechat_real_human_contact_window',
      'browser_saved_human_chat_page',
      'external_chat_export_human_contact',
      'manual_operator_summary_with_evidence_refs'
    ],
    source_lane_summary: candidateSourceLaneSummary,
    identity_confirmation_required_observation_refs: (candidateSourceLaneSummary?.lanes ?? [])
      .flatMap((lane) => lane.identity_confirmation_required_observation_paths ?? [])
      .slice(0, 12),
    operator_capture_tasks: Array.from(
      { length: requiredAdditionalUniqueTargetCount },
      (_, index) => {
        const slot = index + 1;
        return {
          task_id: `missing_target_capture_${String(slot).padStart(3, '0')}`,
          required: true,
          missing_target_slot_index: slot,
          accepted_source_actor_type: 'human_contact',
          must_be_different_from_target_person_ids: observedTargetPersonIds,
          minimum_evidence_refs: [
            'real desktop screenshot or saved export reference',
            'runtime/desktop-inbox-real/**/intake-observation.real.json or reviewed equivalent',
            'generated runtime/pt028-real-observation-gui-states/**/pt028-gui-decision-state.json'
          ],
          required_state_checks: [
            'target_person_id is distinct from every covered_target_person_id',
            'frontend dock short status is visible or reconstructable',
            'send_gate_transfer_path.current_mode remains prompt-only',
            'real_execution_allowed=false',
            'real_send_attempted=false'
          ],
          draft_feedback_fields_to_complete: [
            'window_id',
            'target_person_id',
            'target_display_name',
            'state_path',
            'evidence_refs',
            'operator_decision',
            'target_response_signal',
            'reviewed_at',
            'notes'
          ]
        };
      }
    ),
    forbidden_inputs: [
      'official_account_or_service_account_as_target',
      'unknown_or_unresolved_actor_identity',
      'same_target_person_id_as_existing_coverage',
      'private_raw_chat_text_pasted_into_feedback_file',
      'any_real_send_or_external_action_attempt'
    ],
    example_candidate_evidence_refs: exampleCandidateEvidenceRefs,
    post_capture_commands: [
      'npm.cmd run pt028:real-observation-gui-states',
      'npm.cmd run pt028:feedback-workpack',
      'npm.cmd run pt028:feedback-readiness -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
      'npm.cmd run pt028:event-stream -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
      'npm.cmd run pt028:feedback-calibration -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
      'npm.cmd run pt028:final-acceptance -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json'
    ],
    identity_confirmation_next_actions: [
      'For any unknown source actor, confirm the target identity before using it as feedback evidence.',
      'Do not treat official accounts, service accounts, system pages or business-system exports as romantic target windows.',
      'After identity confirmation creates or updates a reviewed observation, rerun npm.cmd run pt028:feedback-workpack.'
    ],
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: false,
    notes: requiredAdditionalUniqueTargetCount === 0
      ? 'Candidate GUI states cover enough distinct target_person_id values for operator review; this still does not pass readiness until the operator writes reviewed real feedback and final human review approves.'
      : 'Collect additional real human-contact evidence for a different target_person_id before claiming multi-target production calibration.'
  };
}

function operatorTasks({ minimumWindowSlots, latestStateSummary, eventStream }) {
  const eventTargets = (eventStream?.events ?? []).map((event, index) => ({
    slot_index: index + 1,
    window_id_hint: event.conversation_window_id,
    target_person_id_hint: event.target_person_id,
    target_display_name_hint: event.target_display_name,
    dock_status_text_hint: event.dock_status_text,
    send_gate_mode_hint: event.send_gate_mode
  }));
  const tasks = Array.from({ length: minimumWindowSlots }, (_, index) => {
    const eventTarget = eventTargets[index] ?? null;
    const isFirstLatestStateSlot = index === 0 && latestStateSummary?.state_id;
    return {
      task_id: `window_review_${String(index + 1).padStart(3, '0')}`,
      slot_index: index + 1,
      required: true,
      app_type: eventTarget?.app_type ?? latestStateSummary?.source_app_type ?? 'wechat',
      window_id_hint: eventTarget?.window_id_hint
        ?? (isFirstLatestStateSlot ? latestStateSummary.source_window_id : null),
      target_person_id_hint: eventTarget?.target_person_id_hint
        ?? (isFirstLatestStateSlot ? latestStateSummary.target_person_id : null),
      target_display_name_hint: eventTarget?.target_display_name_hint
        ?? (isFirstLatestStateSlot ? latestStateSummary.target_display_name : null),
      state_path_hint: isFirstLatestStateSlot ? latestStateSummary.state_path : null,
      dock_status_text_hint: isFirstLatestStateSlot
        ? latestStateSummary.dock_status_text
        : eventTarget?.dock_status_text_hint ?? null,
      send_gate_mode_hint: eventTarget?.send_gate_mode_hint
        ?? (isFirstLatestStateSlot ? latestStateSummary.send_gate_mode : null),
      operator_must_confirm: [
        'real_window_observed',
        'state_target_verified',
        'prompt_only_confirmed',
        'no_real_send_attempted',
        'privacy_boundary_confirmed',
        'reviewed_at',
        'evidence_refs'
      ],
      draft_record_pointer: `draft.window_feedback_records[${index}]`
    };
  });
  return tasks;
}

export function buildPt028RealFeedbackWorkpack({
  root = process.cwd(),
  latestGuiStatePath = path.join(root, 'runtime', 'pt028-gui-decision-states', 'latest.json'),
  latestEventStreamPath = path.join(root, 'runtime', 'pt028-gui-event-streams', 'latest.json'),
  latestReadinessPath = path.join(root, 'runtime', 'pt028-real-feedback-readiness', 'latest.json'),
  latestFinalAcceptancePath = path.join(root, 'runtime', 'pt028-final-special-acceptance', 'latest.json'),
  templatePath = path.join(root, 'runtime', 'user-inputs', 'templates', 'pt028-real-multi-window-operator-feedback.real.template.json'),
  targetFeedbackPath = path.join(root, 'runtime', 'user-inputs', 'pt028-real-multi-window-operator-feedback.real.json'),
  workpackId = nowCompactId('pt028_real_feedback_workpack'),
  createdAt = new Date().toISOString(),
  minimumWindowSlots = 3,
  candidateObservationLimit = 12
} = {}) {
  const resolvedRoot = path.resolve(root);
  const resolvedLatestStatePath = resolveMaybeRelative(resolvedRoot, latestGuiStatePath);
  const resolvedEventStreamPath = resolveMaybeRelative(resolvedRoot, latestEventStreamPath);
  const resolvedReadinessPath = resolveMaybeRelative(resolvedRoot, latestReadinessPath);
  const resolvedFinalAcceptancePath = resolveMaybeRelative(resolvedRoot, latestFinalAcceptancePath);
  const resolvedTemplatePath = resolveMaybeRelative(resolvedRoot, templatePath);
  const resolvedTargetFeedbackPath = resolveMaybeRelative(resolvedRoot, targetFeedbackPath);
  const latestState = readJsonIfExists(resolvedLatestStatePath);
  const eventStream = readJsonIfExists(resolvedEventStreamPath);
  const readiness = readJsonIfExists(resolvedReadinessPath);
  const finalAcceptance = readJsonIfExists(resolvedFinalAcceptancePath);
  const templateExists = existsSync(resolvedTemplatePath);
  const targetFeedbackExists = existsSync(resolvedTargetFeedbackPath);
  const latestStateOutputPath = resolveMaybeRelative(
    resolvedRoot,
    latestState?.output_paths?.json_path
  ) ?? resolvedLatestStatePath;
  const latestStateSummary = latestState
    ? stateSummary(latestState, relativeOrNull(resolvedRoot, latestStateOutputPath))
    : null;
  const candidateStateIndex = realObservationStateIndex(resolvedRoot);
  const candidateObservations = desktopObservationCandidates(
    resolvedRoot,
    candidateObservationLimit,
    candidateStateIndex
  );
  const candidateSourceLaneSummary = buildCandidateSourceLaneSummary(candidateObservations);
  const usableCandidateObservationCount = candidateObservations
    .filter((item) => item.candidate_for_feedback_evidence).length;
  const candidateStateCount = candidateObservations
    .filter((item) => item.candidate_state_available).length;
  const candidateStateTargetIds = new Set(candidateObservations
    .filter((item) => item.candidate_state_available)
    .map((item) => item.candidate_state_target_person_id)
    .filter(Boolean));
  const checks = [
    makeCheck('latest_gui_state_available', Boolean(latestState), [
      `latest_gui_state_path=${relativeOrNull(resolvedRoot, resolvedLatestStatePath) ?? 'missing'}`
    ]),
    makeCheck('latest_event_stream_available', eventStream?.schema_version === 'pt028_gui_event_stream.v1', [
      `event_stream_path=${relativeOrNull(resolvedRoot, resolvedEventStreamPath) ?? 'missing'}`,
      `event_count=${eventStream?.stream_integrity?.event_count ?? 0}`
    ]),
    makeCheck('feedback_template_available', templateExists, [
      `template_path=${relativeOrNull(resolvedRoot, resolvedTemplatePath) ?? 'missing'}`
    ]),
    makeCheck('real_feedback_target_not_overwritten', true, [
      `target_feedback_path=${relativeOrNull(resolvedRoot, resolvedTargetFeedbackPath)}`,
      `target_feedback_exists=${targetFeedbackExists}`,
      'workpack_writes_target=false'
    ]),
    makeCheck('current_readiness_blocks_without_real_feedback', readiness?.final_acceptance_ready !== true, [
      `readiness_path=${relativeOrNull(resolvedRoot, resolvedReadinessPath) ?? 'missing'}`,
      `final_acceptance_ready=${readiness?.final_acceptance_ready === true}`
    ], 'warning'),
    makeCheck('candidate_desktop_observations_available_for_operator_review', usableCandidateObservationCount > 0, [
      `candidate_count=${candidateObservations.length}`,
      `usable_candidate_count=${usableCandidateObservationCount}`,
      'candidate_observations_are_not_real_feedback_until_operator_confirms_window_target_and_prompt_only_state'
    ], 'warning'),
    makeCheck('candidate_gui_states_available_for_operator_review', candidateStateCount > 0, [
      `candidate_state_count=${candidateStateCount}`,
      'run npm.cmd run pt028:real-observation-gui-states then rerun npm.cmd run pt028:feedback-workpack to prefill state paths',
      'candidate_gui_states_are_not_real_feedback_until_operator_confirms_window_target_and_prompt_only_state'
    ], 'warning'),
    makeCheck('candidate_target_coverage_ready_for_multi_target_review', candidateStateTargetIds.size >= 2, [
      `candidate_state_target_count=${candidateStateTargetIds.size}`,
      `candidate_state_targets=${[...candidateStateTargetIds].join(',') || 'none'}`,
      'collect_an_additional_real_human_contact_window_for_a_different_target_before_claiming_multi_target_production_calibration'
    ], 'warning')
  ];
  const requiredFailures = checks
    .filter((check) => check.severity === 'required' && check.status !== 'passed')
    .map((check) => check.check_id);
  const warningFailures = checks
    .filter((check) => check.severity === 'warning' && check.status !== 'passed')
    .map((check) => check.check_id);
  const draft = buildDraftFeedbackBatch({
    workpackId,
    createdAt,
    minimumWindowSlots,
    candidateObservations
  });
  const candidateTargetCoverage = {
    schema_version: 'pt028_target_coverage_summary.v1',
    required_unique_target_count: 2,
    observed_unique_target_count: candidateStateTargetIds.size,
    ready_for_multi_target_real_feedback_collection: candidateStateTargetIds.size >= 2,
    observed_target_person_ids: [...candidateStateTargetIds],
    notes: candidateStateTargetIds.size >= 2
      ? 'Candidate GUI states cover at least two target_person_id values.'
      : 'Candidate GUI states currently do not cover two distinct target_person_id values; workpack can help operator review but cannot prove multi-target production calibration.'
  };
  const acceptanceClosurePlan = buildAcceptanceClosurePlan({
    readiness,
    eventStream,
    finalAcceptance,
    targetFeedbackExists,
    targetFeedbackPath: relativeOrNull(resolvedRoot, resolvedTargetFeedbackPath),
    candidateTargetCoverage,
    minimumWindowSlots
  });
  const missingTargetCollectionPlan = buildMissingTargetCollectionPlan({
    candidateTargetCoverage,
    candidateObservations,
    candidateSourceLaneSummary,
    targetFeedbackPath: relativeOrNull(resolvedRoot, resolvedTargetFeedbackPath)
  });

  return {
    schema_version: 'pt028_real_feedback_workpack.v1',
    workpack_id: workpackId,
    created_at: createdAt,
    gate_decision: requiredFailures.length
      ? 'pt028_real_feedback_workpack_needs_runtime_evidence'
      : 'pt028_real_feedback_workpack_ready_for_operator_collection',
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: false,
    source: {
      root: resolvedRoot,
      latest_gui_state_path: relativeOrNull(resolvedRoot, resolvedLatestStatePath),
      latest_event_stream_path: relativeOrNull(resolvedRoot, resolvedEventStreamPath),
      latest_readiness_path: relativeOrNull(resolvedRoot, resolvedReadinessPath),
      latest_final_acceptance_path: relativeOrNull(resolvedRoot, resolvedFinalAcceptancePath),
      template_path: relativeOrNull(resolvedRoot, resolvedTemplatePath),
      target_feedback_path: relativeOrNull(resolvedRoot, resolvedTargetFeedbackPath),
      target_feedback_exists: targetFeedbackExists
    },
    evidence_summary: {
      latest_gui_state: latestStateSummary,
      event_stream: eventStream
        ? {
          stream_id: eventStream.stream_id,
          event_count: eventStream.stream_integrity?.event_count ?? 0,
          unique_window_count: eventStream.stream_integrity?.unique_window_count ?? 0,
          unique_target_count: eventStream.stream_integrity?.unique_target_count ?? 0,
          gate_decision: eventStream.gate_decision,
          ipc_channel: eventStream.low_latency_policy?.desktop_ipc_channel ?? null,
          real_execution_allowed: eventStream.stream_integrity?.real_execution_allowed === true,
          real_send_attempted: eventStream.stream_integrity?.real_send_attempted === true
        }
        : null,
      readiness: readiness
        ? {
          readiness_id: readiness.readiness_id,
          gate_decision: readiness.gate_decision,
          calibration_ready: readiness.calibration_ready === true,
          final_acceptance_ready: readiness.final_acceptance_ready === true,
          required_failures: (readiness.required_failures ?? []).map((item) => item.failure_id)
        }
        : null,
      final_acceptance: finalAcceptance
        ? {
          acceptance_id: finalAcceptance.acceptance_id,
          gate_decision: finalAcceptance.gate_decision,
          pt028_fully_accepted_for_production: finalAcceptance.pt028_fully_accepted_for_production === true,
          required_failures: finalFailureIds(finalAcceptance)
        }
        : null
    },
    candidate_target_coverage: candidateTargetCoverage,
    candidate_source_lane_summary: candidateSourceLaneSummary,
    candidate_source_observations: candidateObservations,
    acceptance_closure_plan: acceptanceClosurePlan,
    missing_target_collection_plan: missingTargetCollectionPlan,
    candidate_desktop_observations: candidateObservations,
    window_review_tasks: operatorTasks({
      minimumWindowSlots,
      latestStateSummary,
      eventStream
    }),
    draft_feedback_batch: draft,
    operator_checklist: [
      'Open pt028-real-feedback-workpack.md first.',
      'If candidate state paths are missing, run npm.cmd run pt028:real-observation-gui-states, then rerun npm.cmd run pt028:feedback-workpack.',
      'Observe at least two real desktop windows with different target_person_id values.',
      'For each window, generate or locate the matching pt028_gui_decision_state.v1 JSON state path.',
      'Copy the draft JSON to runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json only after replacing every REPLACE_WITH placeholder.',
      'Set each confirmation boolean to true only after the real window, target binding, prompt-only gate, no-send state and privacy boundary are verified.',
      'Keep approved_for_final_special_acceptance=false until the human special reviewer has checked readiness, calibration, audit and final acceptance evidence.'
    ],
    checks,
    required_failures: requiredFailures,
    warning_failures: warningFailures,
    next_commands: [
      'npm.cmd run pt028:gui-state',
      'npm.cmd run pt028:event-stream',
      'npm.cmd run pt028:real-observation-gui-states',
      'npm.cmd run pt028:feedback-workpack',
      'npm.cmd run pt028:feedback-readiness -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
      'npm.cmd run pt028:feedback-calibration -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
      'npm.cmd run pt028:final-acceptance -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
      'npm.cmd run pt028:audit'
    ]
  };
}

export function renderPt028RealFeedbackWorkpackMarkdown(workpack) {
  const checks = workpack.checks
    .map((check) => `- ${check.status.toUpperCase()} ${check.check_id}: ${check.evidence.join('; ')}`)
    .join('\n');
  const tasks = workpack.window_review_tasks
    .map((task) => [
      `| ${task.slot_index}`,
      task.window_id_hint ?? 'REPLACE_WITH_REAL_WINDOW_ID',
      task.target_display_name_hint ?? task.target_person_id_hint ?? 'REPLACE_WITH_TARGET',
      task.state_path_hint ?? 'REPLACE_WITH_STATE_PATH',
      task.send_gate_mode_hint ?? 'REPLACE_WITH_GATE',
      task.draft_record_pointer
    ].join(' | ') + ' |')
    .join('\n');
  const checklist = workpack.operator_checklist.map((item) => `- ${item}`).join('\n');
  const commands = workpack.next_commands.map((item) => `- \`${item}\``).join('\n');
  const closure = workpack.acceptance_closure_plan ?? {};
  const missingTargetPlan = workpack.missing_target_collection_plan ?? {};
  const closureActions = (closure.ordered_next_actions ?? []).map((item) => `- ${item}`).join('\n')
    || '- No closure actions were generated.';
  const closureCommands = (closure.commands_after_real_feedback_ready ?? []).map((item) => `- \`${item}\``).join('\n')
    || '- No feedback-bound commands were generated.';
  const missingTargetTasks = (missingTargetPlan.operator_capture_tasks ?? [])
    .map((task) => [
      `| ${task.missing_target_slot_index}`,
      task.accepted_source_actor_type ?? 'human_contact',
      (task.must_be_different_from_target_person_ids ?? []).join(', ') || 'none',
      (task.minimum_evidence_refs ?? []).join('; '),
      (task.required_state_checks ?? []).join('; ')
    ].join(' | ') + ' |')
    .join('\n') || '| 0 | none | none | no additional target needed | no additional target needed |';
  const missingTargetCommands = (missingTargetPlan.post_capture_commands ?? [])
    .map((item) => `- \`${item}\``)
    .join('\n') || '- No post-capture commands were generated.';
  const sourceLaneRows = (workpack.candidate_source_lane_summary?.lanes ?? [])
    .map((lane) => [
      `| ${lane.source_lane}`,
      lane.source_kind ?? 'missing',
      lane.scanned_observation_count ?? 0,
      lane.candidate_for_feedback_count ?? 0,
      lane.identity_confirmation_required_count ?? 0,
      (lane.open_blockers ?? []).join(', ') || 'none'
    ].join(' | ') + ' |')
    .join('\n') || '| none | none | 0 | 0 | 0 | none |';
  const candidates = (workpack.candidate_desktop_observations ?? [])
    .map((candidate, index) => [
      `| ${index + 1}`,
      candidate.source_lane ?? 'missing',
      candidate.observation_path ?? 'missing',
      candidate.observation_id ?? 'missing',
      candidate.platform ?? 'missing',
      candidate.source_actor_type ?? 'missing',
      candidate.raw_artifact_count ?? 0,
      candidate.candidate_for_feedback_evidence === true ? 'candidate' : 'reference_only',
      (candidate.candidate_blockers ?? []).join(', ') || 'none',
      candidate.candidate_state_path ?? 'missing',
      candidate.candidate_state_target_display_name ?? candidate.candidate_state_target_person_id ?? 'missing',
      candidate.candidate_state_dock_status_text ?? 'missing'
    ].join(' | ') + ' |')
    .join('\n') || '| 0 | missing | missing | missing | missing | missing | 0 | no_candidate | missing | missing | missing | missing |';

  return `# PT-028 Real Feedback Workpack

- workpack_id: ${workpack.workpack_id}
- gate_decision: ${workpack.gate_decision}
- real_execution_allowed: ${workpack.real_execution_allowed}
- real_send_attempted: ${workpack.real_send_attempted}
- writes_real_feedback_target: ${workpack.writes_real_feedback_target}
- target_feedback_path: ${workpack.source.target_feedback_path}
- target_feedback_exists: ${workpack.source.target_feedback_exists}

## Current Evidence

- latest_gui_state: ${workpack.source.latest_gui_state_path ?? 'missing'}
- latest_event_stream: ${workpack.source.latest_event_stream_path ?? 'missing'}
- latest_readiness: ${workpack.source.latest_readiness_path ?? 'missing'}
- template_path: ${workpack.source.template_path ?? 'missing'}
- latest_state_id: ${workpack.evidence_summary.latest_gui_state?.state_id ?? 'missing'}
- latest_dock_status: ${workpack.evidence_summary.latest_gui_state?.dock_status_text ?? 'missing'}
- event_count: ${workpack.evidence_summary.event_stream?.event_count ?? 0}
- readiness_gate: ${workpack.evidence_summary.readiness?.gate_decision ?? 'missing'}
- candidate_target_coverage: ${workpack.candidate_target_coverage?.observed_unique_target_count ?? 0}/${workpack.candidate_target_coverage?.required_unique_target_count ?? 2}
- candidate_multi_target_ready: ${workpack.candidate_target_coverage?.ready_for_multi_target_real_feedback_collection === true}

## Acceptance Closure Plan

- objective: ${closure.objective ?? 'missing'}
- current_gate_decision: ${closure.current_gate_decision ?? 'missing'}
- production_acceptance_ready: ${closure.production_acceptance_ready === true}
- can_be_completed_without_human_input: ${closure.can_be_completed_without_human_input === true}
- low_latency_event_stream: ${closure.low_latency_event_stream?.status ?? 'missing'}; events=${closure.low_latency_event_stream?.event_count ?? 0}; windows=${closure.low_latency_event_stream?.unique_window_count ?? 0}; targets=${closure.low_latency_event_stream?.unique_target_count ?? 0}
- real_multi_window_feedback: ${closure.real_multi_window_feedback?.status ?? 'missing'}; target_feedback_exists=${closure.real_multi_window_feedback?.target_feedback_exists === true}; candidate_targets=${closure.real_multi_window_feedback?.candidate_unique_target_count ?? 0}/${closure.real_multi_window_feedback?.required_unique_target_count ?? 2}
- final_special_acceptance: ${closure.final_special_acceptance?.status ?? 'missing'}; latest_gate=${closure.final_special_acceptance?.latest_gate_decision ?? 'missing'}

### Closure Actions

${closureActions}

### Commands After Real Feedback Is Ready

${closureCommands}

## Missing Target Collection Plan

- schema_version: ${missingTargetPlan.schema_version ?? 'missing'}
- gate_decision: ${missingTargetPlan.gate_decision ?? 'missing'}
- target_feedback_path: ${missingTargetPlan.target_feedback_path ?? 'missing'}
- required_unique_target_count: ${missingTargetPlan.required_unique_target_count ?? 2}
- observed_unique_target_count: ${missingTargetPlan.observed_unique_target_count ?? 0}
- required_additional_unique_target_count: ${missingTargetPlan.required_additional_unique_target_count ?? 0}
- covered_target_person_ids: ${(missingTargetPlan.covered_target_person_ids ?? []).join(', ') || 'none'}
- must_be_different_from_target_person_ids: ${(missingTargetPlan.must_be_different_from_target_person_ids ?? []).join(', ') || 'none'}
- identity_confirmation_required_observation_refs: ${(missingTargetPlan.identity_confirmation_required_observation_refs ?? []).join(', ') || 'none'}
- real_execution_allowed: ${missingTargetPlan.real_execution_allowed === true}
- real_send_attempted: ${missingTargetPlan.real_send_attempted === true}
- writes_real_feedback_target: ${missingTargetPlan.writes_real_feedback_target === true}

| missing slot | actor type | must differ from | minimum evidence refs | required state checks |
| --- | --- | --- | --- | --- |
${missingTargetTasks}

### Post-Capture Commands

${missingTargetCommands}

## Candidate Source Lane Summary

| source lane | source kind | scanned | candidate | identity confirmation needed | blockers |
| --- | --- | --- | --- | --- | --- |
${sourceLaneRows}

## Candidate Source Observations

These are read-only observation references for operator review. They do not satisfy real feedback readiness until the operator verifies the real window, target binding, prompt-only state and privacy boundary.

| # | source lane | observation path | observation id | platform | actor type | artifact count | status | blockers | generated state | state target | dock |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${candidates}

## Window Review Tasks

| slot | window hint | target hint | state path hint | gate hint | draft pointer |
| --- | --- | --- | --- | --- | --- |
${tasks}

## Operator Checklist

${checklist}

## Checks

${checks}

## Next Commands

${commands}

## Boundary

- This workpack is a worksheet for real human review; it is not final acceptance evidence by itself.
- The generated draft intentionally contains placeholders and false review booleans.
- Do not paste private raw chat text into the feedback file; use concise summaries and evidence references.
`;
}

export function writePt028RealFeedbackWorkpack({
  workpack,
  outputDir = path.join(
    workpack?.source?.root ?? process.cwd(),
    'runtime',
    'pt028-real-feedback-workpacks',
    workpack.workpack_id
  )
} = {}) {
  if (!workpack) throw new Error('writePt028RealFeedbackWorkpack requires workpack');
  ensureDir(outputDir);
  const jsonPath = path.join(outputDir, 'pt028-real-feedback-workpack.json');
  const markdownPath = path.join(outputDir, 'pt028-real-feedback-workpack.md');
  const draftFeedbackPath = path.join(outputDir, 'pt028-real-multi-window-operator-feedback.real.draft.json');
  const latestPath = path.join(path.dirname(outputDir), 'latest.json');
  ensureDir(path.dirname(latestPath));
  const manifest = {
    ...workpack,
    artifacts: {
      output_dir: outputDir,
      workpack_json_path: jsonPath,
      workpack_markdown_path: markdownPath,
      draft_feedback_path: draftFeedbackPath,
      latest_path: latestPath,
      target_feedback_path: workpack.source.target_feedback_path
    }
  };
  writeFileSync(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderPt028RealFeedbackWorkpackMarkdown(manifest), 'utf8');
  writeFileSync(draftFeedbackPath, `${JSON.stringify(workpack.draft_feedback_batch, null, 2)}\n`, 'utf8');
  writeFileSync(latestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest.artifacts;
}
