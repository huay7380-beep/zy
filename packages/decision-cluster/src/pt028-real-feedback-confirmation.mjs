import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildPt028RealFeedbackReadiness } from './pt028-real-feedback-readiness.mjs';

function nowCompactId(prefix) {
  return `${prefix}_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function readJsonIfExists(file) {
  if (!file || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function resolveMaybeRelative(root, maybePath) {
  if (!maybePath || typeof maybePath !== 'string') return null;
  return path.isAbsolute(maybePath) ? maybePath : path.resolve(root, maybePath);
}

function relativeOrNull(root, maybePath) {
  if (!maybePath) return null;
  return path.relative(root, maybePath).replace(/\\/g, '/');
}

function hasPlaceholder(value) {
  if (typeof value === 'string') {
    return value.includes('REPLACE_WITH') || value.includes('_TEMPLATE') || value.includes('PLACEHOLDER');
  }
  if (Array.isArray(value)) return value.some((item) => hasPlaceholder(item));
  if (value && typeof value === 'object') return Object.values(value).some((item) => hasPlaceholder(item));
  return false;
}

function failureIds(readiness) {
  return (readiness?.required_failures ?? []).map((failure) =>
    typeof failure === 'string' ? failure : failure.failure_id
  ).filter(Boolean);
}

function boolCheck(check_id, passed, evidence = [], severity = 'required') {
  return {
    check_id,
    status: passed ? 'passed' : 'open',
    severity,
    evidence
  };
}

function defaultTargetFeedbackPath(root) {
  return path.join(root, 'runtime', 'user-inputs', 'pt028-real-multi-window-operator-feedback.real.json');
}

function decisionTargetPath({ decision, root, targetFeedbackPath }) {
  return resolveMaybeRelative(
    root,
    targetFeedbackPath
      ?? decision?.source?.target_feedback_path
      ?? defaultTargetFeedbackPath(root)
  );
}

export function buildPt028RealFeedbackConfirmationTemplate({
  workpack,
  decisionId = nowCompactId('pt028_real_feedback_confirmation_decision'),
  createdAt = new Date().toISOString()
} = {}) {
  if (!workpack) throw new Error('buildPt028RealFeedbackConfirmationTemplate requires workpack');
  const root = workpack.source?.root ?? process.cwd();
  const workpackPath = workpack.artifacts?.workpack_json_path
    ? relativeOrNull(root, workpack.artifacts.workpack_json_path)
    : null;
  const draftFeedbackPath = workpack.artifacts?.draft_feedback_path
    ? relativeOrNull(root, workpack.artifacts.draft_feedback_path)
    : null;

  return {
    schema_version: 'pt028_real_feedback_confirmation_decision.v1',
    decision_id: decisionId,
    created_at: createdAt,
    decision_mode: 'operator_confirmation_required_before_target_write',
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: false,
    source: {
      root,
      workpack_id: workpack.workpack_id,
      workpack_path: workpackPath,
      draft_feedback_path: draftFeedbackPath,
      target_feedback_path: workpack.source?.target_feedback_path
        ?? relativeOrNull(root, defaultTargetFeedbackPath(root)),
      candidate_target_coverage: workpack.candidate_target_coverage ?? null,
      candidate_source_lane_summary: workpack.candidate_source_lane_summary ?? null
    },
    operator_confirmation: {
      approved_to_write_real_feedback_target: false,
      reviewer_id: 'REPLACE_WITH_REVIEWER_ID',
      reviewed_at: 'REPLACE_WITH_ISO_TIME',
      confirm_real_windows_observed: false,
      confirm_target_binding: false,
      confirm_prompt_only: false,
      confirm_no_real_send: false,
      confirm_privacy_boundary: false,
      confirm_human_special_review: false,
      notes: 'Set these booleans to true only after reviewing the real desktop windows and the readiness evidence. This template alone must not write the real feedback target file.'
    },
    feedback_batch: workpack.draft_feedback_batch,
    required_operator_actions: [
      'Review every candidate window against the real desktop window.',
      'Replace all REPLACE_WITH placeholders.',
      'Set every per-window confirmation boolean to true only after the real window, target binding, prompt-only state, no-send state and privacy boundary are verified.',
      'Set human_special_review.approved_for_final_special_acceptance=true only after final human special review.',
      'Run npm.cmd run pt028:feedback-confirm -- --decision=<this decision file> after the decision is complete.'
    ]
  };
}

export function buildPt028RealFeedbackConfirmationResult({
  decision = null,
  root = process.cwd(),
  targetFeedbackPath = null,
  confirmationId = nowCompactId('pt028_real_feedback_confirmation'),
  allowOverwriteExistingTarget = false,
  pathExists = (candidate) => existsSync(candidate),
  readJson = (candidate) => readJsonIfExists(candidate)
} = {}) {
  const createdAt = new Date().toISOString();
  const resolvedRoot = path.resolve(root);
  const resolvedTargetFeedbackPath = decisionTargetPath({
    decision,
    root: resolvedRoot,
    targetFeedbackPath
  });
  const targetExists = resolvedTargetFeedbackPath ? pathExists(resolvedTargetFeedbackPath) : false;
  const confirmation = decision?.operator_confirmation ?? {};
  const feedbackBatch = decision?.feedback_batch ?? null;

  const confirmationFlags = {
    approved_to_write_real_feedback_target: confirmation.approved_to_write_real_feedback_target === true,
    confirm_real_windows_observed: confirmation.confirm_real_windows_observed === true,
    confirm_target_binding: confirmation.confirm_target_binding === true,
    confirm_prompt_only: confirmation.confirm_prompt_only === true,
    confirm_no_real_send: confirmation.confirm_no_real_send === true,
    confirm_privacy_boundary: confirmation.confirm_privacy_boundary === true,
    confirm_human_special_review: confirmation.confirm_human_special_review === true
  };
  const reviewerReady = typeof confirmation.reviewer_id === 'string'
    && confirmation.reviewer_id.length > 0
    && typeof confirmation.reviewed_at === 'string'
    && confirmation.reviewed_at.length > 0
    && !hasPlaceholder(confirmation.reviewer_id)
    && !hasPlaceholder(confirmation.reviewed_at);
  const decisionSchemaValid = decision?.schema_version === 'pt028_real_feedback_confirmation_decision.v1';
  const confirmationFlagsReady = Object.values(confirmationFlags).every((value) => value === true);
  const placeholderScanPayload = decision
    ? {
      source: decision.source,
      operator_confirmation: decision.operator_confirmation,
      feedback_batch: decision.feedback_batch
    }
    : null;
  const placeholderValuesPresent = placeholderScanPayload ? hasPlaceholder(placeholderScanPayload) : true;
  const noPlaceholders = decision ? !placeholderValuesPresent : false;
  const sendBlocked = decision?.real_execution_allowed !== true
    && decision?.real_send_attempted !== true
    && feedbackBatch?.real_execution_allowed !== true
    && feedbackBatch?.real_send_attempted !== true;

  const readiness = buildPt028RealFeedbackReadiness({
    feedbackBatch,
    feedbackPath: relativeOrNull(resolvedRoot, resolvedTargetFeedbackPath),
    root: resolvedRoot,
    pathExists,
    readJson
  });

  const checks = [
    boolCheck('confirmation_decision_present', Boolean(decision), [
      `decision_schema=${decision?.schema_version ?? 'missing'}`
    ]),
    boolCheck('confirmation_schema_valid', decisionSchemaValid, [
      `decision_schema=${decision?.schema_version ?? 'missing'}`
    ]),
    boolCheck('operator_approved_target_write', confirmationFlags.approved_to_write_real_feedback_target, [
      `approved=${confirmation.approved_to_write_real_feedback_target === true}`
    ]),
    boolCheck('operator_confirmation_flags_complete', confirmationFlagsReady, [
      `flags_ready=${confirmationFlagsReady}`
    ]),
    boolCheck('operator_reviewer_identity_complete', reviewerReady, [
      `reviewer_id=${confirmation.reviewer_id ?? 'missing'}`,
      `reviewed_at=${confirmation.reviewed_at ?? 'missing'}`
    ]),
    boolCheck('no_placeholder_values', noPlaceholders, [
      `placeholder_values_present=${placeholderValuesPresent}`
    ]),
    boolCheck('real_feedback_readiness_final_ready', readiness.final_acceptance_ready === true, [
      `readiness_gate=${readiness.gate_decision}`,
      `readiness_failures=${failureIds(readiness).join(',') || 'none'}`
    ]),
    boolCheck('target_write_does_not_overwrite_without_permission', !targetExists || allowOverwriteExistingTarget, [
      `target_feedback_path=${relativeOrNull(resolvedRoot, resolvedTargetFeedbackPath)}`,
      `target_exists=${targetExists}`,
      `allow_overwrite=${allowOverwriteExistingTarget}`
    ]),
    boolCheck('real_send_remains_blocked', sendBlocked, [
      `decision_real_execution_allowed=${decision?.real_execution_allowed === true}`,
      `decision_real_send_attempted=${decision?.real_send_attempted === true}`
    ])
  ];

  const requiredFailures = checks
    .filter((check) => check.severity === 'required' && check.status !== 'passed')
    .map((check) => check.check_id);
  const writesAllowed = requiredFailures.length === 0;

  return {
    schema_version: 'pt028_real_feedback_confirmation.v1',
    confirmation_id: confirmationId,
    created_at: createdAt,
    gate_decision: writesAllowed
      ? 'ready_to_write_real_feedback_target'
      : 'operator_confirmation_required_before_target_write',
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target_allowed: writesAllowed,
    writes_real_feedback_target: false,
    target_feedback_path: relativeOrNull(resolvedRoot, resolvedTargetFeedbackPath),
    target_feedback_exists: targetExists,
    allow_overwrite_existing_target: allowOverwriteExistingTarget,
    source: {
      root: resolvedRoot,
      decision_id: decision?.decision_id ?? null,
      workpack_id: decision?.source?.workpack_id ?? null,
      feedback_batch_id: feedbackBatch?.feedback_batch_id ?? null
    },
    operator_confirmation_status: {
      ...confirmationFlags,
      reviewer_ready: reviewerReady
    },
    readiness_summary: {
      readiness_id: readiness.readiness_id,
      gate_decision: readiness.gate_decision,
      calibration_ready: readiness.calibration_ready,
      final_acceptance_ready: readiness.final_acceptance_ready,
      required_failures: failureIds(readiness),
      window_count: readiness.window_count,
      unique_target_count: readiness.unique_target_count,
      human_special_review_ready: readiness.human_special_review_ready
    },
    checks,
    required_failures: requiredFailures,
    next_commands: writesAllowed
      ? [
        'npm.cmd run pt028:feedback-readiness -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
        'npm.cmd run pt028:event-stream -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
        'npm.cmd run pt028:feedback-calibration -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
        'npm.cmd run pt028:final-acceptance -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json'
      ]
      : [
        'Complete the confirmation decision file, then rerun npm.cmd run pt028:feedback-confirm -- --decision=<decision.json>.',
        'Do not manually treat candidate observation refs as final feedback evidence until readiness passes.'
      ]
  };
}

export function renderPt028RealFeedbackConfirmationMarkdown(result) {
  const checks = (result.checks ?? [])
    .map((check) => `- ${check.status.toUpperCase()} ${check.check_id}: ${(check.evidence ?? []).join('; ')}`)
    .join('\n') || '- No checks were generated.';
  const commands = (result.next_commands ?? [])
    .map((command) => `- \`${command}\``)
    .join('\n') || '- No next commands were generated.';

  return `# PT-028 Real Feedback Confirmation

- confirmation_id: ${result.confirmation_id}
- gate_decision: ${result.gate_decision}
- writes_real_feedback_target_allowed: ${result.writes_real_feedback_target_allowed === true}
- writes_real_feedback_target: ${result.writes_real_feedback_target === true}
- target_feedback_path: ${result.target_feedback_path ?? 'missing'}
- target_feedback_exists: ${result.target_feedback_exists === true}
- real_execution_allowed: ${result.real_execution_allowed === true}
- real_send_attempted: ${result.real_send_attempted === true}

## Readiness Summary

- readiness_gate: ${result.readiness_summary?.gate_decision ?? 'missing'}
- final_acceptance_ready: ${result.readiness_summary?.final_acceptance_ready === true}
- window_count: ${result.readiness_summary?.window_count ?? 0}
- unique_target_count: ${result.readiness_summary?.unique_target_count ?? 0}
- human_special_review_ready: ${result.readiness_summary?.human_special_review_ready === true}
- readiness_failures: ${(result.readiness_summary?.required_failures ?? []).join(', ') || 'none'}

## Checks

${checks}

## Required Failures

${(result.required_failures ?? []).map((failure) => `- ${failure}`).join('\n') || 'No required failures.'}

## Next Commands

${commands}

## Boundary

- This command never sends messages.
- Without a complete confirmation decision, it writes only confirmation artifacts and no real feedback target.
- When a complete decision passes readiness, the target file is still prompt-only feedback evidence; it is not permission to send.
`;
}

export function writePt028RealFeedbackConfirmationArtifacts({
  result,
  decisionTemplate = null,
  outputDir = path.join(
    result?.source?.root ?? process.cwd(),
    'runtime',
    'pt028-real-feedback-confirmations',
    result?.confirmation_id ?? nowCompactId('pt028_real_feedback_confirmation')
  )
} = {}) {
  if (!result) throw new Error('writePt028RealFeedbackConfirmationArtifacts requires result');
  ensureDir(outputDir);
  const jsonPath = path.join(outputDir, 'pt028-real-feedback-confirmation.json');
  const markdownPath = path.join(outputDir, 'pt028-real-feedback-confirmation.md');
  const latestPath = path.join(path.dirname(outputDir), 'latest.json');
  const decisionTemplatePath = decisionTemplate
    ? path.join(outputDir, 'pt028-real-feedback-confirmation-decision.real.template.json')
    : null;
  const manifest = {
    ...result,
    output_paths: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      latest_path: latestPath,
      decision_template_path: decisionTemplatePath
    }
  };
  writeFileSync(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderPt028RealFeedbackConfirmationMarkdown(manifest), 'utf8');
  if (decisionTemplatePath) {
    writeFileSync(decisionTemplatePath, `${JSON.stringify(decisionTemplate, null, 2)}\n`, 'utf8');
  }
  ensureDir(path.dirname(latestPath));
  writeFileSync(latestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest.output_paths;
}

export function writePt028RealFeedbackTargetFromConfirmation({
  decision,
  result,
  root = process.cwd(),
  targetFeedbackPath = null
} = {}) {
  if (!decision) throw new Error('writePt028RealFeedbackTargetFromConfirmation requires decision');
  if (!result?.writes_real_feedback_target_allowed) {
    throw new Error('PT-028 real feedback confirmation is not ready to write target');
  }
  const resolvedRoot = path.resolve(root);
  const resolvedTargetFeedbackPath = decisionTargetPath({
    decision,
    root: resolvedRoot,
    targetFeedbackPath
  });
  ensureDir(path.dirname(resolvedTargetFeedbackPath));
  writeFileSync(resolvedTargetFeedbackPath, `${JSON.stringify(decision.feedback_batch, null, 2)}\n`, 'utf8');
  return {
    target_feedback_path: resolvedTargetFeedbackPath,
    target_feedback_relative_path: relativeOrNull(resolvedRoot, resolvedTargetFeedbackPath)
  };
}
