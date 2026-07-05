function nowCompactId(prefix) {
  return `${prefix}_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function hasPlaceholder(value) {
  if (typeof value === 'string') {
    return value.includes('REPLACE_WITH') || value.includes('_TEMPLATE') || value.includes('PLACEHOLDER');
  }
  if (Array.isArray(value)) return value.some((item) => hasPlaceholder(item));
  if (value && typeof value === 'object') return Object.values(value).some((item) => hasPlaceholder(item));
  return false;
}

function normalizePath(root, maybePath) {
  if (!maybePath || typeof maybePath !== 'string') return null;
  if (/^[a-zA-Z]:[\\/]/.test(maybePath) || maybePath.startsWith('/')) return maybePath;
  return `${root.replace(/[\\/]+$/g, '')}/${maybePath}`.replace(/\\/g, '/');
}

function uniqueCount(values) {
  return new Set(values.filter(Boolean)).size;
}

function duplicateValues(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

function evidenceRefStatus(root, ref, pathExists) {
  const placeholder = hasPlaceholder(ref);
  const isExternal = /^https?:\/\//i.test(String(ref ?? ''));
  const normalizedPath = isExternal ? null : normalizePath(root, ref);
  const exists = isExternal || (normalizedPath ? pathExists(normalizedPath) : false);
  return {
    ref,
    placeholder,
    external_reference: isExternal,
    resolved_path: normalizedPath,
    exists
  };
}

function feedbackRequirementStatus(record) {
  return {
    source_type_real: ['real_operator_feedback', 'human_reviewed_real_window_feedback'].includes(record?.source_type),
    real_window_observed: record?.real_window_observed === true,
    state_target_verified: record?.state_target_verified === true,
    prompt_only_confirmed: record?.prompt_only_confirmed === true,
    no_real_send_attempted: record?.no_real_send_attempted === true,
    privacy_boundary_confirmed: record?.privacy_boundary_confirmed === true,
    has_reviewed_at: typeof record?.reviewed_at === 'string' && record.reviewed_at.length > 0,
    has_evidence_refs: Array.isArray(record?.evidence_refs) && record.evidence_refs.length > 0,
    candidate_confirmation_resolved: record?.candidate_requires_operator_confirmation !== true
  };
}

function allTrue(object) {
  return Object.values(object).every((value) => value === true);
}

export function buildPt028RealFeedbackReadiness({
  feedbackBatch = null,
  feedbackPath = null,
  root = '.',
  readinessId = nowCompactId('pt028_real_feedback_readiness'),
  requiredWindowCount = 2,
  requiredUniqueTargetCount = 2,
  pathExists = () => false,
  readJson = () => null
} = {}) {
  const createdAt = new Date().toISOString();
  const requiredFailures = [];
  const records = feedbackBatch?.window_feedback_records ?? [];
  const schemaValid = feedbackBatch?.schema_version === 'pt028_real_multi_window_operator_feedback.v1';

  if (!feedbackBatch) requiredFailures.push('feedback_file_missing');
  if (feedbackBatch && !schemaValid) requiredFailures.push('feedback_schema_invalid');
  if (feedbackBatch && hasPlaceholder(feedbackBatch)) requiredFailures.push('placeholder_values_present');
  if (records.length < requiredWindowCount) requiredFailures.push('minimum_two_windows_required');

  const duplicateWindowIds = duplicateValues(records.map((record) => record.window_id));
  const duplicateTargetIds = duplicateValues(records.map((record) => record.target_person_id));
  const uniqueTargetCount = uniqueCount(records.map((record) => record.target_person_id));
  if (duplicateWindowIds.length) requiredFailures.push('duplicate_window_ids');
  if (duplicateTargetIds.length) requiredFailures.push('duplicate_target_person_ids');
  if (uniqueTargetCount < requiredUniqueTargetCount) requiredFailures.push('minimum_unique_targets_required');

  const windowRows = records.map((record, index) => {
    const resolvedStatePath = normalizePath(root, record.state_path);
    const stateFromPath = resolvedStatePath && pathExists(resolvedStatePath)
      ? readJson(resolvedStatePath)
      : null;
    const state = record.state_snapshot ?? stateFromPath;
    const evidenceRefs = (record.evidence_refs ?? []).map((ref) => evidenceRefStatus(root, ref, pathExists));
    const requirements = feedbackRequirementStatus(record);
    const stateTargetId = state?.source_decision?.target_person_id ?? null;
    const sendGateMode = state?.send_gate_transfer_path?.current_mode ?? null;
    const rowFailures = [];

    if (!resolvedStatePath || !state) rowFailures.push('state_path_missing_or_unreadable');
    if (state && state.schema_version !== 'pt028_gui_decision_state.v1') rowFailures.push('state_schema_invalid');
    if (stateTargetId && stateTargetId !== record.target_person_id) rowFailures.push('state_target_mismatch');
    if (sendGateMode !== 'blocked_prompt_only') rowFailures.push('send_gate_not_prompt_only');
    if (state && (state.real_execution_allowed === true || state.real_send_attempted === true)) {
      rowFailures.push('real_send_not_blocked');
    }
    const { candidate_confirmation_resolved: candidateConfirmationResolved, ...coreRequirements } = requirements;
    if (!allTrue(coreRequirements)) rowFailures.push('feedback_evidence_incomplete');
    if (!candidateConfirmationResolved) rowFailures.push('candidate_confirmation_not_resolved');
    if (!evidenceRefs.length || evidenceRefs.some((item) => item.placeholder || !item.exists)) {
      rowFailures.push('evidence_refs_missing_or_unverified');
    }

    return {
      row_index: index + 1,
      feedback_id: record.feedback_id ?? null,
      window_id: record.window_id ?? null,
      target_person_id: record.target_person_id ?? null,
      target_display_name: record.target_display_name ?? null,
      state_path: record.state_path ?? null,
      resolved_state_path: resolvedStatePath,
      state_id: state?.state_id ?? null,
      state_target_id: stateTargetId,
      send_gate_mode: sendGateMode,
      feedback_requirement_status: requirements,
      evidence_ref_status: evidenceRefs,
      row_failures: rowFailures,
      ready_for_calibration: rowFailures.length === 0
    };
  });

  for (const row of windowRows) {
    for (const failure of row.row_failures) {
      if (!requiredFailures.includes(failure)) requiredFailures.push(failure);
    }
  }

  const humanReview = feedbackBatch?.human_special_review ?? null;
  const humanSpecialReviewReady = humanReview?.approved_for_final_special_acceptance === true
    && typeof humanReview?.reviewer_id === 'string'
    && humanReview.reviewer_id.length > 0
    && typeof humanReview?.reviewed_at === 'string'
    && humanReview.reviewed_at.length > 0
    && Array.isArray(humanReview?.approval_scope)
    && humanReview.approval_scope.length > 0
    && !hasPlaceholder(humanReview);
  if (!humanSpecialReviewReady) requiredFailures.push('human_special_review_missing_or_not_approved');

  const calibrationReady = requiredFailures.every((failure) =>
    failure === 'human_special_review_missing_or_not_approved'
  ) && windowRows.length >= requiredWindowCount && uniqueTargetCount >= requiredUniqueTargetCount;
  const finalAcceptanceReady = requiredFailures.length === 0;

  return {
    schema_version: 'pt028_real_feedback_readiness.v1',
    readiness_id: readinessId,
    created_at: createdAt,
    source: {
      feedback_path: feedbackPath,
      root
    },
    gate_decision: finalAcceptanceReady
      ? 'ready_for_final_special_acceptance'
      : calibrationReady
        ? 'ready_for_feedback_calibration_pending_human_special_review'
        : 'needs_attention',
    calibration_ready: calibrationReady || finalAcceptanceReady,
    final_acceptance_ready: finalAcceptanceReady,
    real_execution_allowed: false,
    real_send_attempted: false,
    feedback_schema_valid: schemaValid,
    placeholder_values_present: feedbackBatch ? hasPlaceholder(feedbackBatch) : false,
    required_window_count: requiredWindowCount,
    required_unique_target_count: requiredUniqueTargetCount,
    window_count: records.length,
    unique_window_count: uniqueCount(records.map((record) => record.window_id)),
    unique_target_count: uniqueTargetCount,
    duplicate_window_ids: duplicateWindowIds,
    duplicate_target_person_ids: duplicateTargetIds,
    human_special_review_ready: humanSpecialReviewReady,
    window_rows: windowRows,
    required_failures: requiredFailures.map((failure) => ({
      failure_id: failure,
      severity: failure === 'human_special_review_missing_or_not_approved' ? 'required_for_final_acceptance' : 'required_for_calibration'
    })),
    next_commands: [
      'npm.cmd run pt028:feedback-calibration -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
      'npm.cmd run pt028:final-acceptance -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
      'npm.cmd run pt028:audit'
    ]
  };
}
