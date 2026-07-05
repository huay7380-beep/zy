#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function nowCompactId(prefix) {
  return `${prefix}_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function resolveInputPath(root, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.resolve(root, maybePath);
}

function relativeToRoot(root, maybePath) {
  if (!maybePath) return null;
  const absolutePath = path.isAbsolute(maybePath) ? maybePath : path.resolve(root, maybePath);
  return path.relative(root, absolutePath).replace(/\\/g, '/');
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function readJsonIfExists(file) {
  if (!file || !existsSync(file)) return null;
  return readJson(file);
}

function inputStatus({ root, reviewPath, reviewSheet, reviewSheetTemplatePath }) {
  const reviewPathRequested = Boolean(reviewPath);
  const reviewSheetExists = reviewPathRequested && existsSync(reviewPath);
  let missingInputFailure = null;
  if (!reviewPathRequested) {
    missingInputFailure = 'review_sheet_input_not_requested';
  } else if (!reviewSheetExists) {
    missingInputFailure = 'review_sheet_target_missing';
  } else if (!reviewSheet) {
    missingInputFailure = 'review_sheet_unreadable_or_invalid';
  }

  return {
    schema_version: 'pt028_review_sheet_input_status.v1',
    review_path_requested: reviewPathRequested,
    review_sheet_path: relativeToRoot(root, reviewPath),
    review_sheet_exists: reviewSheetExists,
    review_sheet_loaded: Boolean(reviewSheet),
    template_fallback_path: relativeToRoot(root, reviewSheetTemplatePath),
    missing_input_failure: missingInputFailure,
    next_action: reviewSheet
      ? 'Continue check-only, controlled preflight or finalization according to the current gate decision.'
      : reviewPathRequested
        ? `Prepare ${relativeToRoot(root, reviewPath)} from ${relativeToRoot(root, reviewSheetTemplatePath)}, then rerun check-only.`
        : `Prepare a filled review sheet from ${relativeToRoot(root, reviewSheetTemplatePath)}, then rerun with --review=<filled-review-sheet.json>.`
  };
}

function runJsonSubcommand({ scriptPath, args, cwd = process.cwd() }) {
  const result = spawnSync(process.execPath, [path.resolve(cwd, scriptPath), ...args], {
    cwd,
    encoding: 'utf8'
  });
  let stdoutJson = null;
  try {
    stdoutJson = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    stdoutJson = null;
  }
  return {
    script: scriptPath,
    status: result.status,
    stdout_json: stdoutJson,
    stderr: result.stderr,
    stdout: result.stdout
  };
}

function buildControlledPreflightChain({ root, outputDir, decisionOutputPath }) {
  if (!decisionOutputPath) return null;
  const decisionRelativePath = relativeToRoot(root, decisionOutputPath);
  const chainDir = path.join(outputDir, 'controlled-preflight-chain');
  const coverageOutputDir = path.join(chainDir, 'collection-coverage');
  const preflightOutputDir = path.join(chainDir, 'confirmation-preflight');
  const coverageRun = runJsonSubcommand({
    scriptPath: 'scripts/validate-pt028-feedback-collection-coverage.mjs',
    args: [
      `--root=${root}`,
      `--decision=${decisionRelativePath}`,
      `--output-dir=${coverageOutputDir}`,
      '--fail-on-required'
    ]
  });
  const coverageJsonPath = coverageRun.stdout_json?.json_path ?? path.join(coverageOutputDir, 'pt028-feedback-collection-coverage.json');
  const preflightRun = runJsonSubcommand({
    scriptPath: 'scripts/preflight-pt028-real-feedback-confirmation.mjs',
    args: [
      `--root=${root}`,
      `--decision=${decisionRelativePath}`,
      `--coverage=${coverageJsonPath}`,
      `--output-dir=${preflightOutputDir}`,
      '--fail-on-required'
    ]
  });
  const coverageReady = coverageRun.stdout_json?.ready_for_confirmation_preflight === true;
  const preflightReady = preflightRun.stdout_json?.ready_for_controlled_target_write === true;
  const preflightJsonPath = preflightRun.stdout_json?.json_path
    ?? path.join(preflightOutputDir, 'pt028-feedback-confirmation-preflight.json');
  const preflightReport = readJsonIfExists(preflightJsonPath);
  const readinessRequiredFailures = preflightRun.stdout_json?.readiness_required_failures
    ?? preflightReport?.readiness_summary?.required_failures
    ?? [];
  const collectionCoverageRequiredFailures = preflightRun.stdout_json?.collection_coverage_required_failures
    ?? preflightReport?.collection_coverage_summary?.required_failures
    ?? [];
  const requiredFailures = [
    ...((coverageRun.stdout_json?.required_failures ?? []).map((item) => `coverage:${item}`)),
    ...((preflightRun.stdout_json?.required_failures ?? []).map((item) => `preflight:${item}`))
  ];
  const detailFailures = [
    ...requiredFailures,
    ...readinessRequiredFailures.map((item) => `preflight_readiness:${item}`),
    ...collectionCoverageRequiredFailures.map((item) => `preflight_collection_coverage:${item}`)
  ];
  return {
    schema_version: 'pt028_human_review_controlled_preflight_chain.v1',
    coverage_ready: coverageReady,
    preflight_ready: preflightReady,
    ready_for_controlled_target_write: coverageReady && preflightReady,
    required_failures: requiredFailures,
    detail_failures: detailFailures,
    runs: {
      collection_coverage: {
        status: coverageRun.status,
        gate_decision: coverageRun.stdout_json?.gate_decision ?? null,
        json_path: coverageRun.stdout_json?.json_path ?? null,
        markdown_path: coverageRun.stdout_json?.markdown_path ?? null,
        required_failures: coverageRun.stdout_json?.required_failures ?? [],
        unconfirmed_task_ids: coverageRun.stdout_json?.unconfirmed_task_ids ?? [],
        first_unconfirmed_failed_checks: coverageRun.stdout_json?.first_unconfirmed_failed_checks ?? []
      },
      confirmation_preflight: {
        status: preflightRun.status,
        gate_decision: preflightRun.stdout_json?.gate_decision ?? null,
        ready_for_controlled_target_write: preflightReady,
        json_path: preflightRun.stdout_json?.json_path ?? null,
        markdown_path: preflightRun.stdout_json?.markdown_path ?? null,
        required_failures: preflightRun.stdout_json?.required_failures ?? [],
        readiness_required_failures: readinessRequiredFailures,
        collection_coverage_required_failures: collectionCoverageRequiredFailures,
        missing_field_groups: preflightReport?.placeholder_or_missing_field_groups ?? []
      }
    },
    boundary_policy: {
      runs_only_coverage_and_preflight: true,
      writes_real_feedback_target: false,
      real_execution_allowed: false,
      real_send_attempted: false
    }
  };
}

function defaultLatest(root, runtimeDir) {
  return path.join(root, 'runtime', runtimeDir, 'latest.json');
}

function hasPlaceholder(value) {
  if (typeof value === 'string') {
    return value.length === 0
      || value.includes('REPLACE_WITH')
      || value.includes('PLACEHOLDER')
      || value.includes('_TEMPLATE');
  }
  if (Array.isArray(value)) return value.some((item) => hasPlaceholder(item));
  if (value && typeof value === 'object') return Object.values(value).some((item) => hasPlaceholder(item));
  return false;
}

function collectPlaceholderPaths(value, prefix = '$') {
  if (typeof value === 'string') {
    return hasPlaceholder(value) ? [prefix] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectPlaceholderPaths(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      collectPlaceholderPaths(item, `${prefix}.${key}`)
    );
  }
  return [];
}

function bool(value) {
  return value === true;
}

function comparablePath(value) {
  return typeof value === 'string'
    ? value.replace(/\\/g, '/').replace(/^\.\//, '')
    : null;
}

function sameComparablePath(left, right) {
  const normalizedLeft = comparablePath(left);
  const normalizedRight = comparablePath(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

const GLOBAL_CONFIRMATION_FIELDS = [
  'real_windows_observed',
  'target_binding_verified',
  'prompt_only_confirmed',
  'no_real_send_attempted',
  'privacy_boundary_confirmed',
  'human_special_review_complete'
];

const WINDOW_CONFIRMATION_FIELDS = [
  'real_window_observed',
  'state_target_verified',
  'prompt_only_confirmed',
  'no_real_send_attempted',
  'privacy_boundary_confirmed'
];

function check({ checkId, status, evidence = [], required = true }) {
  return {
    check_id: checkId,
    status: status ? 'passed' : 'failed',
    required,
    evidence
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function taskEvidenceRefs(session, taskId) {
  const task = (session?.operator_collection_tasks ?? []).find((item) => item.task_id === taskId);
  return task?.evidence_refs ?? [];
}

function buildReviewSheetGuidance() {
  return {
    schema_version: 'pt028_human_review_sheet_guidance.v1',
    purpose: 'Guide the human reviewer to fill all fields required before controlled PT-028 feedback finalization.',
    allowed_operator_decision_values: operatorDecisionChoices(),
    allowed_target_response_signal_values: targetResponseSignalChoices(),
    required_global_confirmations: GLOBAL_CONFIRMATION_FIELDS,
    required_window_confirmations: WINDOW_CONFIRMATION_FIELDS,
    window_row_ready_when: [
      'all required_window_confirmations are true',
      'reviewed_at is a real ISO time and has no placeholder',
      'operator_decision is selected and is not not_reviewed',
      'target_person_id and state_path remain bound to the reviewed real window',
      'evidence_refs contains at least one real observation or screenshot reference'
    ],
    final_review_ready_when: [
      'approve_controlled_feedback_target_write is true',
      'human_special_review.approved_for_final_special_acceptance is true',
      'human_special_review.reviewer_id and reviewed_at are filled',
      'at least two unique target_person_id values are confirmed',
      'prompt_only_confirmed and no_real_send_attempted remain true for every window'
    ],
    safe_completion_sequence: [
      'Fill this JSON review sheet from the paired Markdown or HTML worksheet.',
      'Run npm.cmd run pt028:human-review-decision -- --review=<filled-review-sheet.json> --check-only --fail-on-required.',
      'Only after check-only passes, run npm.cmd run pt028:human-review-decision -- --review=<filled-review-sheet.json> --run-controlled-preflight.',
      'Then run npm.cmd run pt028:feedback-finalize -- --decision=<generated-decision-output-path>.'
    ],
    boundary_policy: {
      this_guidance_writes_real_feedback_target: false,
      automatic_send_allowed: false,
      prompt_only_required: true,
      human_review_required: true
    }
  };
}

function buildSheetTemplate({ reviewPack, session, reviewPackPath }) {
  const guide = reviewPack?.human_review_field_guide ?? {};
  const stableReviewPackPath = reviewPack?.output_paths?.json_path ?? reviewPackPath;
  return {
    schema_version: 'pt028_human_review_decision_sheet.v1',
    sheet_id: nowCompactId('pt028_human_review_decision_sheet'),
    created_at: new Date().toISOString(),
    source: {
      review_pack_id: reviewPack?.review_pack_id ?? null,
      review_pack_path: relativeToRoot(reviewPack?.source?.root ?? process.cwd(), stableReviewPackPath),
      decision_template_path: guide.decision_template_path ?? reviewPack?.review_scope?.decision_template_path ?? null,
      target_feedback_path: guide.target_feedback_path ?? reviewPack?.review_scope?.target_feedback_path ?? null
    },
    evidence_review_summary: {
      schema_version: 'pt028_human_review_evidence_summary.v1',
      event_stream_review_summary: guide.event_stream_review_summary ?? null,
      feedback_collection_review_summary: guide.feedback_collection_review_summary ?? null,
      acceptance_chain_required_failures: guide.final_acceptance_expected_remaining_failures ?? reviewPack?.evidence_summary?.acceptance_chain_required_failures ?? [],
      real_execution_allowed: false,
      real_send_attempted: false,
      writes_real_feedback_target: false
    },
    review_sheet_guidance: buildReviewSheetGuidance(),
    reviewer: {
      reviewer_id: 'REPLACE_WITH_REVIEWER_ID',
      role: 'operator_or_human_special_reviewer',
      reviewed_at: 'REPLACE_WITH_ISO_TIME'
    },
    approve_controlled_feedback_target_write: false,
    global_confirmations: {
      real_windows_observed: false,
      target_binding_verified: false,
      prompt_only_confirmed: false,
      no_real_send_attempted: false,
      privacy_boundary_confirmed: false,
      human_special_review_complete: false
    },
    window_reviews: (guide.window_task_map ?? []).map((task) => ({
      task_id: task.task_id,
      slot_index: task.slot_index,
      decision_template_record_pointer: task.decision_template_record_pointer,
      window_id: task.window_id,
      target_person_id: task.target_person_id,
      target_display_name_hint: task.target_display_name_hint,
      state_path: task.state_path,
      dock_status_text: task.dock_status_text,
      real_window_observed: false,
      state_target_verified: false,
      prompt_only_confirmed: false,
      no_real_send_attempted: false,
      privacy_boundary_confirmed: false,
      reviewed_at: 'REPLACE_WITH_ISO_TIME',
      operator_decision: 'not_reviewed',
      target_response_signal: 'neutral_or_unknown',
      evidence_refs: taskEvidenceRefs(session, task.task_id),
      notes: 'REPLACE_WITH_REVIEW_NOTES'
    })),
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
      notes: 'REPLACE_WITH_FINAL_REVIEW_NOTES'
    }
  };
}

function reviewByPointer(sheet) {
  const map = new Map();
  for (const review of sheet?.window_reviews ?? []) {
    if (review.decision_template_record_pointer) {
      map.set(review.decision_template_record_pointer, review);
    }
  }
  return map;
}

function applySheetToDecisionTemplate({ sheet, decisionTemplate }) {
  const decision = JSON.parse(JSON.stringify(decisionTemplate));
  const reviewer = sheet.reviewer ?? {};
  const confirmations = sheet.global_confirmations ?? {};
  decision.decision_id = nowCompactId('pt028_real_feedback_confirmation_decision_from_review_sheet');
  decision.created_at = new Date().toISOString();
  decision.decision_mode = 'operator_review_sheet_applied_before_controlled_target_write';
  decision.real_execution_allowed = false;
  decision.real_send_attempted = false;
  decision.writes_real_feedback_target = false;
  decision.operator_confirmation = {
    approved_to_write_real_feedback_target: sheet.approve_controlled_feedback_target_write === true,
    reviewer_id: reviewer.reviewer_id,
    reviewed_at: reviewer.reviewed_at,
    confirm_real_windows_observed: confirmations.real_windows_observed === true,
    confirm_target_binding: confirmations.target_binding_verified === true,
    confirm_prompt_only: confirmations.prompt_only_confirmed === true,
    confirm_no_real_send: confirmations.no_real_send_attempted === true,
    confirm_privacy_boundary: confirmations.privacy_boundary_confirmed === true,
    confirm_human_special_review: confirmations.human_special_review_complete === true,
    notes: sheet.operator_notes ?? 'Generated from pt028_human_review_decision_sheet.v1; still requires coverage/preflight/finalization gates.'
  };

  const reviews = reviewByPointer(sheet);
  decision.feedback_batch = {
    ...decision.feedback_batch,
    created_at: new Date().toISOString(),
    reviewer: {
      reviewer_id: reviewer.reviewer_id,
      role: reviewer.role ?? 'operator_or_human_special_reviewer',
      reviewed_at: reviewer.reviewed_at
    },
    window_feedback_records: (decision.feedback_batch?.window_feedback_records ?? []).map((record, index) => {
      const pointer = `feedback_batch.window_feedback_records[${index}]`;
      const review = reviews.get(pointer) ?? sheet.window_reviews?.[index] ?? {};
      const rowConfirmationResolved = review.real_window_observed === true
        && review.state_target_verified === true
        && review.prompt_only_confirmed === true
        && review.no_real_send_attempted === true
        && review.privacy_boundary_confirmed === true
        && typeof (review.reviewed_at ?? reviewer.reviewed_at) === 'string'
        && (review.reviewed_at ?? reviewer.reviewed_at).length > 0;
      return {
        ...record,
        window_id: review.window_id ?? record.window_id,
        app_type: review.app_type ?? record.app_type,
        target_person_id: review.target_person_id ?? record.target_person_id,
        target_display_name: review.target_display_name ?? review.target_display_name_hint ?? record.target_display_name,
        state_path: review.state_path ?? record.state_path,
        source_type: 'human_reviewed_real_window_feedback',
        operator_decision: review.operator_decision ?? record.operator_decision,
        target_response_signal: review.target_response_signal ?? record.target_response_signal,
        real_window_observed: review.real_window_observed === true,
        state_target_verified: review.state_target_verified === true,
        prompt_only_confirmed: review.prompt_only_confirmed === true,
        no_real_send_attempted: review.no_real_send_attempted === true,
        privacy_boundary_confirmed: review.privacy_boundary_confirmed === true,
        reviewed_at: review.reviewed_at ?? reviewer.reviewed_at,
        evidence_refs: (review.evidence_refs?.length ? review.evidence_refs : record.evidence_refs) ?? [],
        candidate_requires_operator_confirmation: rowConfirmationResolved
          ? false
          : record.candidate_requires_operator_confirmation,
        notes: review.notes ?? record.notes ?? ''
      };
    }),
    human_special_review: {
      ...(decision.feedback_batch?.human_special_review ?? {}),
      ...(sheet.human_special_review ?? {})
    },
    real_execution_allowed: false,
    real_send_attempted: false
  };
  return decision;
}

function buildChecks({ reviewPack, sheet, decisionTemplate, decision, targetFeedbackPath }) {
  const tasks = reviewPack?.human_review_field_guide?.window_task_map ?? [];
  const reviews = sheet?.window_reviews ?? [];
  const sheetSource = sheet?.source ?? {};
  const expectedDecisionTemplatePath =
    reviewPack?.human_review_field_guide?.decision_template_path
    ?? reviewPack?.review_scope?.decision_template_path
    ?? null;
  const global = sheet?.global_confirmations ?? {};
  const reviewerReady = !hasPlaceholder(sheet?.reviewer?.reviewer_id) && !hasPlaceholder(sheet?.reviewer?.reviewed_at);
  const reviewSheetSourceDirectlyMatchesCurrentPack =
    sheet?.schema_version === 'pt028_human_review_decision_sheet.v1'
    && sheetSource.review_pack_id === reviewPack?.review_pack_id
    && sameComparablePath(sheetSource.decision_template_path, expectedDecisionTemplatePath)
    && sameComparablePath(sheetSource.target_feedback_path, targetFeedbackPath);
  const windowRowsMatchCurrentTasks = reviews.length === tasks.length
    && reviews.every((review, index) => {
      const task = tasks[index] ?? {};
      return review.task_id === task.task_id
        && review.decision_template_record_pointer === task.decision_template_record_pointer
        && review.window_id === task.window_id
        && review.target_person_id === task.target_person_id
        && sameComparablePath(review.state_path, task.state_path);
    });
  const reviewSheetSourceCompatibleWithCurrentPack =
    sheet?.schema_version === 'pt028_human_review_decision_sheet.v1'
    && sameComparablePath(sheetSource.target_feedback_path, targetFeedbackPath)
    && windowRowsMatchCurrentTasks;
  const reviewSheetSourceMatchesCurrentPack =
    reviewSheetSourceDirectlyMatchesCurrentPack || reviewSheetSourceCompatibleWithCurrentPack;
  const globalReady = [
    global.real_windows_observed,
    global.target_binding_verified,
    global.prompt_only_confirmed,
    global.no_real_send_attempted,
    global.privacy_boundary_confirmed,
    global.human_special_review_complete
  ].every((item) => item === true);
  const allWindowRowsConfirmed = reviews.length === tasks.length
    && reviews.length >= 2
    && reviews.every((review) => WINDOW_CONFIRMATION_FIELDS
      .every((field) => review[field] === true)
      && !hasPlaceholder(review.reviewed_at)
      && Array.isArray(review.evidence_refs)
      && review.evidence_refs.length > 0);
  const windowOperatorDecisionsSelected = reviews.length === tasks.length
    && reviews.length >= 2
    && reviews.every((review) =>
      typeof review.operator_decision === 'string'
      && review.operator_decision.length > 0
      && review.operator_decision !== 'not_reviewed'
    );
  const uniqueTargets = new Set(reviews.map((review) => review.target_person_id).filter(Boolean));
  const humanSpecialReady = sheet?.human_special_review?.approved_for_final_special_acceptance === true
    && !hasPlaceholder(sheet?.human_special_review?.reviewer_id)
    && !hasPlaceholder(sheet?.human_special_review?.reviewed_at);
  const placeholderScanPayload = decision
    ? {
      source: decision.source,
      operator_confirmation: decision.operator_confirmation,
      feedback_batch: decision.feedback_batch
    }
    : null;
  const placeholderPaths = placeholderScanPayload ? collectPlaceholderPaths(placeholderScanPayload) : ['$'];
  const placeholderValuesPresent = placeholderPaths.length > 0;
  const sendBlocked = decision?.real_execution_allowed !== true
    && decision?.real_send_attempted !== true
    && decision?.feedback_batch?.real_execution_allowed !== true
    && decision?.feedback_batch?.real_send_attempted !== true;

  return [
    check({
      checkId: 'review_pack_ready_for_human_special_review',
      status: reviewPack?.schema_version === 'pt028_final_special_review_pack.v1'
        && reviewPack?.ready_for_human_special_review === true,
      evidence: [
        `review_pack=${reviewPack?.review_pack_id ?? 'missing'}`,
        `gate=${reviewPack?.gate_decision ?? 'missing'}`
      ]
    }),
    check({
      checkId: 'decision_template_present',
      status: decisionTemplate?.schema_version === 'pt028_real_feedback_confirmation_decision.v1',
      evidence: [`decision_template_schema=${decisionTemplate?.schema_version ?? 'missing'}`]
    }),
    check({
      checkId: 'review_sheet_schema_valid',
      status: sheet?.schema_version === 'pt028_human_review_decision_sheet.v1',
      evidence: [`sheet_schema=${sheet?.schema_version ?? 'missing'}`]
    }),
    check({
      checkId: 'review_sheet_source_matches_current_pack',
      status: reviewSheetSourceMatchesCurrentPack,
      evidence: [
        `sheet_review_pack_id=${sheetSource.review_pack_id ?? 'missing'}`,
        `current_review_pack_id=${reviewPack?.review_pack_id ?? 'missing'}`,
        `direct_source_match=${reviewSheetSourceDirectlyMatchesCurrentPack}`,
        `compatible_with_current_tasks=${reviewSheetSourceCompatibleWithCurrentPack}`,
        `sheet_decision_template_path=${sheetSource.decision_template_path ?? 'missing'}`,
        `current_decision_template_path=${expectedDecisionTemplatePath ?? 'missing'}`,
        `sheet_target_feedback_path=${sheetSource.target_feedback_path ?? 'missing'}`,
        `current_target_feedback_path=${targetFeedbackPath ?? 'missing'}`
      ]
    }),
    check({
      checkId: 'review_sheet_window_rows_match_current_tasks',
      status: windowRowsMatchCurrentTasks,
      evidence: [
        `task_count=${tasks.length}`,
        `review_count=${reviews.length}`,
        `mismatched_rows=${reviews
          .map((review, index) => {
            const task = tasks[index] ?? {};
            return review.task_id === task.task_id
              && review.decision_template_record_pointer === task.decision_template_record_pointer
              && review.window_id === task.window_id
              && review.target_person_id === task.target_person_id
              && sameComparablePath(review.state_path, task.state_path)
              ? null
              : index;
          })
          .filter((item) => item !== null)
          .join(',') || 'none'}`
      ]
    }),
    check({
      checkId: 'operator_reviewer_identity_complete',
      status: reviewerReady,
      evidence: [
        `reviewer_id=${sheet?.reviewer?.reviewer_id ?? 'missing'}`,
        `reviewed_at=${sheet?.reviewer?.reviewed_at ?? 'missing'}`
      ]
    }),
    check({
      checkId: 'operator_approved_controlled_target_write',
      status: sheet?.approve_controlled_feedback_target_write === true,
      evidence: [`approved=${sheet?.approve_controlled_feedback_target_write === true}`]
    }),
    check({
      checkId: 'global_operator_confirmations_complete',
      status: globalReady,
      evidence: [`global_confirmations_ready=${globalReady}`]
    }),
    check({
      checkId: 'all_window_reviews_confirmed',
      status: allWindowRowsConfirmed,
      evidence: [
        `task_count=${tasks.length}`,
        `review_count=${reviews.length}`,
        `unique_target_count=${uniqueTargets.size}`
      ]
    }),
    check({
      checkId: 'window_operator_decisions_selected',
      status: windowOperatorDecisionsSelected,
      evidence: [
        `review_count=${reviews.length}`,
        `not_reviewed_count=${reviews.filter((review) => review.operator_decision === 'not_reviewed').length}`
      ]
    }),
    check({
      checkId: 'at_least_two_unique_targets',
      status: uniqueTargets.size >= 2,
      evidence: [`unique_target_count=${uniqueTargets.size}`]
    }),
    check({
      checkId: 'human_special_review_complete',
      status: humanSpecialReady,
      evidence: [
        `approved=${sheet?.human_special_review?.approved_for_final_special_acceptance === true}`,
        `reviewer_id=${sheet?.human_special_review?.reviewer_id ?? 'missing'}`,
        `reviewed_at=${sheet?.human_special_review?.reviewed_at ?? 'missing'}`
      ]
    }),
    check({
      checkId: 'decision_has_no_placeholder_values',
      status: decision ? !placeholderValuesPresent : false,
      evidence: [
        `placeholder_values_present=${placeholderValuesPresent}`,
        `placeholder_paths=${placeholderPaths.slice(0, 12).join(',') || 'none'}`
      ]
    }),
    check({
      checkId: 'real_send_remains_blocked',
      status: sendBlocked,
      evidence: [
        `target_feedback_path=${targetFeedbackPath ?? 'missing'}`,
        `decision_real_execution_allowed=${decision?.real_execution_allowed === true}`,
        `decision_real_send_attempted=${decision?.real_send_attempted === true}`
      ]
    })
  ];
}

function buildReviewSheetDiagnostics({ reviewPack, sheet, decision, checks }) {
  const tasks = reviewPack?.human_review_field_guide?.window_task_map ?? [];
  const reviews = sheet?.window_reviews ?? [];
  const global = sheet?.global_confirmations ?? {};
  const reviewsByPointer = reviewByPointer(sheet);
  const missingGlobalConfirmations = GLOBAL_CONFIRMATION_FIELDS
    .filter((field) => global[field] !== true);
  const windowReviewDiagnostics = reviews.map((review, index) => {
    const failedChecks = windowReviewFailedChecks(review);
    return {
      row_index: index,
      task_id: review.task_id ?? null,
      decision_template_record_pointer: review.decision_template_record_pointer ?? null,
      window_id: review.window_id ?? null,
      target_person_id: review.target_person_id ?? null,
      target_display_name_hint: review.target_display_name_hint ?? null,
      failed_checks: failedChecks,
      evidence_ref_count: review.evidence_refs?.length ?? 0,
      ready: failedChecks.length === 0
    };
  });
  const missingTaskIds = tasks
    .filter((task) => !reviewsByPointer.has(task.decision_template_record_pointer))
    .map((task) => task.task_id);
  const uniqueTargets = new Set(reviews.map((review) => review.target_person_id).filter(Boolean));
  return {
    schema_version: 'pt028_human_review_sheet_diagnostics.v1',
    expected_window_review_count: tasks.length,
    actual_window_review_count: reviews.length,
    unique_target_count: uniqueTargets.size,
    missing_global_confirmations: missingGlobalConfirmations,
    missing_task_ids: missingTaskIds,
    failed_required_checks: (checks ?? [])
      .filter((item) => item.required && item.status !== 'passed')
      .map((item) => item.check_id),
    window_review_diagnostics: windowReviewDiagnostics,
    decision_placeholder_paths: decision
      ? collectPlaceholderPaths({
        source: decision.source,
        operator_confirmation: decision.operator_confirmation,
        feedback_batch: decision.feedback_batch
      })
      : []
  };
}

function buildHumanReviewFillPlan({
  root,
  reviewSheetTemplate,
  reviewSheet,
  reviewSheetTemplatePath,
  reviewSheetMarkdownPath,
  reviewSheetHtmlPath,
  reviewPath,
  reviewSheetInputStatus,
  reviewSheetDiagnostics,
  templateInitialDiagnostics,
  decisionOutputPath,
  controlledPreflightChain,
  nextCommands
}) {
  const stableReviewTargetPath = path.join(root, 'runtime', 'user-inputs', 'pt028-human-review-decision.real.json');
  const stableFeedbackTargetPath = path.join(root, 'runtime', 'user-inputs', 'pt028-real-multi-window-operator-feedback.real.json');
  const activeReviewPath = reviewPath ?? stableReviewTargetPath;
  const activeReviewRelativePath = relativeToRoot(root, activeReviewPath);
  const diagnostics = reviewSheetDiagnostics ?? templateInitialDiagnostics;
  const rowDiagnosticsByPointer = new Map(
    (diagnostics?.window_review_diagnostics ?? [])
      .map((item) => [item.decision_template_record_pointer, item])
  );
  const templateRows = reviewSheetTemplate?.window_reviews ?? [];
  const currentRows = reviewSheet?.window_reviews ?? templateRows;
  const windowRowTasks = templateRows.map((templateRow, index) => {
    const currentRow = currentRows[index] ?? templateRow;
    const pointer = templateRow.decision_template_record_pointer ?? `window_reviews[${index}]`;
    const diagnostic = rowDiagnosticsByPointer.get(pointer)
      ?? diagnostics?.window_review_diagnostics?.[index]
      ?? null;
    return {
      row_index: index,
      task_id: templateRow.task_id ?? currentRow.task_id ?? null,
      decision_template_record_pointer: pointer,
      source_window: {
        window_id: templateRow.window_id ?? currentRow.window_id ?? null,
        target_person_id: templateRow.target_person_id ?? currentRow.target_person_id ?? null,
        target_display_name_hint: templateRow.target_display_name_hint ?? currentRow.target_display_name_hint ?? null,
        state_path: templateRow.state_path ?? currentRow.state_path ?? null,
        dock_status_text: templateRow.dock_status_text ?? currentRow.dock_status_text ?? null
      },
      required_boolean_paths: WINDOW_CONFIRMATION_FIELDS
        .map((field) => `window_reviews[${index}].${field}`),
      required_value_paths: [
        `window_reviews[${index}].reviewed_at`,
        `window_reviews[${index}].operator_decision`,
        `window_reviews[${index}].target_response_signal`,
        `window_reviews[${index}].evidence_refs`,
        `window_reviews[${index}].notes`
      ],
      allowed_operator_decision_values: operatorDecisionChoices(),
      allowed_target_response_signal_values: targetResponseSignalChoices(),
      current_failed_checks: diagnostic?.failed_checks ?? windowReviewFailedChecks(currentRow),
      ready: diagnostic?.ready === true
    };
  });

  return {
    schema_version: 'pt028_human_review_fill_plan.v1',
    purpose: 'Give GUI and external operator tools one machine-readable plan for filling the PT-028 human review sheet before controlled finalization.',
    source_files: {
      template_json_path: relativeToRoot(root, reviewSheetTemplatePath),
      worksheet_markdown_path: relativeToRoot(root, reviewSheetMarkdownPath),
      worksheet_html_path: relativeToRoot(root, reviewSheetHtmlPath)
    },
    target_files: {
      filled_review_sheet_target_path: relativeToRoot(root, stableReviewTargetPath),
      real_feedback_target_path: relativeToRoot(root, stableFeedbackTargetPath),
      requested_review_sheet_path: relativeToRoot(root, reviewPath),
      active_review_sheet_path: activeReviewRelativePath
    },
    current_review_sheet: {
      exists: existsSync(activeReviewPath),
      loaded: Boolean(reviewSheet),
      input_status: reviewSheetInputStatus
    },
    required_global_confirmation_paths: GLOBAL_CONFIRMATION_FIELDS
      .map((field) => `global_confirmations.${field}`),
    required_final_review_paths: [
      'reviewer.reviewer_id',
      'reviewer.reviewed_at',
      'approve_controlled_feedback_target_write',
      'human_special_review.approved_for_final_special_acceptance',
      'human_special_review.reviewer_id',
      'human_special_review.reviewed_at',
      'human_special_review.notes'
    ],
    window_row_tasks: windowRowTasks,
    current_diagnostics_summary: {
      source: reviewSheetDiagnostics ? 'submitted_review_sheet' : 'template_initial_diagnostics',
      expected_window_review_count: diagnostics?.expected_window_review_count ?? 0,
      actual_window_review_count: diagnostics?.actual_window_review_count ?? 0,
      unique_target_count: diagnostics?.unique_target_count ?? 0,
      missing_global_confirmations: diagnostics?.missing_global_confirmations ?? [],
      missing_task_ids: diagnostics?.missing_task_ids ?? [],
      failed_required_checks: diagnostics?.failed_required_checks ?? [],
      unready_window_row_count: (diagnostics?.window_review_diagnostics ?? [])
        .filter((item) => item.ready !== true)
        .length
    },
    command_order: [
      {
        step_id: 'copy_or_save_template_to_real_review_target',
        command: `Save ${relativeToRoot(root, reviewSheetTemplatePath)} as ${relativeToRoot(root, stableReviewTargetPath)} after human review edits.`,
        writes_target_file: false,
        notes: 'This writer only describes the target path; the human/operator tool must create the filled review sheet intentionally.'
      },
      {
        step_id: 'check_only',
        command: `npm.cmd run pt028:human-review-decision -- --review=${activeReviewRelativePath} --check-only --fail-on-required`,
        writes_target_file: false
      },
      {
        step_id: 'controlled_preflight',
        command: `npm.cmd run pt028:human-review-decision -- --review=${activeReviewRelativePath} --run-controlled-preflight --fail-on-required`,
        writes_target_file: false
      },
      {
        step_id: 'feedback_finalize',
        command: decisionOutputPath
          ? `npm.cmd run pt028:feedback-finalize -- --decision=${relativeToRoot(root, decisionOutputPath)}`
          : 'npm.cmd run pt028:feedback-finalize -- --decision=<generated-decision-output-path>',
        writes_target_file: controlledPreflightChain?.ready_for_controlled_target_write === true,
        notes: 'This is the only controlled path that may promote reviewed feedback into the real feedback target after all gates pass.'
      }
    ],
    next_commands: nextCommands,
    boundary_policy: {
      fill_plan_writes_real_review_sheet: false,
      fill_plan_writes_real_feedback_target: false,
      writer_writes_real_feedback_target: false,
      automatic_send_allowed: false,
      prompt_only_required: true,
      human_review_required: true
    }
  };
}

function fieldStatus(value, expected = true) {
  if (expected === true) return value === true ? 'ready' : 'missing';
  return hasPlaceholder(value) ? 'missing' : 'ready';
}

function operatorDecisionChoices() {
  return [
    'prompt_accepted_for_manual_edit',
    'prompt_rejected',
    'needs_context_before_progression',
    'hold_and_show_safety_prompt',
    'manual_reply_sent_outside_system',
    'not_reviewed'
  ];
}

function targetResponseSignalChoices() {
  return [
    'warm_or_positive',
    'neutral_or_unknown',
    'insufficient_context',
    'pressure_or_boundary_risk',
    'negative_or_uncomfortable'
  ];
}

function windowReviewFailedChecks(review) {
  const failedChecks = [];
  for (const field of WINDOW_CONFIRMATION_FIELDS) {
    if (review?.[field] !== true) failedChecks.push(field);
  }
  if (hasPlaceholder(review?.reviewed_at)) failedChecks.push('reviewed_at');
  if (!Array.isArray(review?.evidence_refs) || review.evidence_refs.length === 0) {
    failedChecks.push('evidence_refs');
  }
  if (!review?.operator_decision || review.operator_decision === 'not_reviewed') {
    failedChecks.push('operator_decision');
  }
  if (!review?.target_person_id) failedChecks.push('target_person_id');
  if (!review?.state_path) failedChecks.push('state_path');
  return failedChecks;
}

function renderReviewSheetMarkdown({ report, sheet }) {
  const guidance = sheet?.review_sheet_guidance ?? buildReviewSheetGuidance();
  const globalRows = GLOBAL_CONFIRMATION_FIELDS
    .map((field) => `| global_confirmations.${field} | ${sheet?.global_confirmations?.[field] === true} | ${fieldStatus(sheet?.global_confirmations?.[field])} |`)
    .join('\n');
  const windows = (sheet?.window_reviews ?? [])
    .map((review, index) => {
      const diagnostic = report.review_sheet_diagnostics?.window_review_diagnostics?.[index];
      const failedChecks = diagnostic?.failed_checks ?? windowReviewFailedChecks(review);
      return `| ${index + 1} | ${review.task_id ?? ''} | ${review.target_display_name_hint ?? ''} | ${review.target_person_id ?? ''} | ${review.dock_status_text ?? ''} | ${review.operator_decision ?? ''} | ${review.target_response_signal ?? ''} | ${review.evidence_refs?.length ?? 0} | ${failedChecks.join(', ') || 'none'} |`;
    })
    .join('\n') || '| - | - | - | - | - | - | - | - | - |';
  const evidenceSummary = sheet?.evidence_review_summary ?? {};
  const eventSummary = evidenceSummary.event_stream_review_summary ?? {};
  const collectionSummary = evidenceSummary.feedback_collection_review_summary ?? {};
  const commands = report.next_commands.map((command) => `- \`${command}\``).join('\n');
  return `# PT-028 Human Review Sheet

- writer_id: ${report.writer_id}
- gate_decision: ${report.gate_decision}
- check_only: ${report.check_only === true}
- review_sheet_ready_for_decision_generation: ${report.review_sheet_ready_for_decision_generation === true}
- real_execution_allowed: false
- real_send_attempted: false
- writes_real_feedback_target: false

## Evidence Review Summary

- event_stream_input_mode: ${eventSummary.input_mode ?? 'missing'}
- event_stream_event_count: ${eventSummary.event_count ?? 'missing'}
- event_stream_window_count: ${eventSummary.unique_window_count ?? 'missing'}
- event_stream_target_count: ${eventSummary.unique_target_count ?? 'missing'}
- event_stream_ipc_channel: ${eventSummary.ipc_channel ?? 'missing'}
- event_stream_target_dispatch_latency_ms: ${eventSummary.target_dispatch_latency_ms ?? 'missing'}
- prompt_only_boundary_preserved: ${eventSummary.prompt_only_boundary_preserved ?? 'missing'}
- collection_session_gate: ${collectionSummary.session_gate_decision ?? 'missing'}
- collection_task_count: ${collectionSummary.task_count ?? 'missing'}
- collection_distinct_target_count: ${collectionSummary.distinct_target_count ?? 'missing'}
- collection_coverage_gate: ${collectionSummary.coverage_gate_decision ?? 'missing'}
- collection_matched_task_count: ${collectionSummary.matched_task_count ?? 'missing'}
- collection_confirmed_task_count: ${collectionSummary.confirmed_task_count ?? 'missing'}
- collection_unconfirmed_task_ids: ${(collectionSummary.unconfirmed_task_ids ?? []).join(',') || 'none'}
- acceptance_chain_required_failures: ${(evidenceSummary.acceptance_chain_required_failures ?? []).join(',') || 'none'}

## Reviewer Fields

| field | value | status |
| --- | --- | --- |
| reviewer.reviewer_id | ${sheet?.reviewer?.reviewer_id ?? ''} | ${fieldStatus(sheet?.reviewer?.reviewer_id, 'non_placeholder')} |
| reviewer.reviewed_at | ${sheet?.reviewer?.reviewed_at ?? ''} | ${fieldStatus(sheet?.reviewer?.reviewed_at, 'non_placeholder')} |
| approve_controlled_feedback_target_write | ${sheet?.approve_controlled_feedback_target_write === true} | ${fieldStatus(sheet?.approve_controlled_feedback_target_write)} |

## Global Confirmations

| field | value | status |
| --- | --- | --- |
${globalRows}

## Window Reviews

| # | task | target | target_person_id | dock | operator_decision | target_response_signal | evidence_refs | failed_checks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${windows}

## Allowed Values

- operator_decision: ${(guidance.allowed_operator_decision_values ?? operatorDecisionChoices()).join(', ')}
- target_response_signal: ${(guidance.allowed_target_response_signal_values ?? targetResponseSignalChoices()).join(', ')}

## Ready Conditions

- window_row_ready_when: ${(guidance.window_row_ready_when ?? []).join('; ')}
- final_review_ready_when: ${(guidance.final_review_ready_when ?? []).join('; ')}

## Next Commands

${commands}

## Boundary

- This worksheet is read-only and does not write the real feedback target.
- Use --check-only before controlled preflight.
- Real sending remains blocked.
`;
}

function renderReviewSheetHtml({ report, sheet }) {
  const guidance = sheet?.review_sheet_guidance ?? buildReviewSheetGuidance();
  const evidenceSummary = sheet?.evidence_review_summary ?? {};
  const eventSummary = evidenceSummary.event_stream_review_summary ?? {};
  const collectionSummary = evidenceSummary.feedback_collection_review_summary ?? {};
  const globalRows = GLOBAL_CONFIRMATION_FIELDS
    .map((field) => {
      const value = sheet?.global_confirmations?.[field] === true;
      const status = fieldStatus(sheet?.global_confirmations?.[field]);
      return `<tr><td><code>global_confirmations.${escapeHtml(field)}</code></td><td>${escapeHtml(value)}</td><td><span class="pill ${status}">${escapeHtml(status)}</span></td></tr>`;
    })
    .join('');
  const windowRows = (sheet?.window_reviews ?? [])
    .map((review, index) => {
      const diagnostic = report.review_sheet_diagnostics?.window_review_diagnostics?.[index];
      const failedChecks = diagnostic?.failed_checks ?? windowReviewFailedChecks(review);
      const ready = failedChecks.length === 0 ? 'ready' : 'missing';
      return `<tr>
        <td>${index + 1}</td>
        <td><code>${escapeHtml(review.task_id)}</code></td>
        <td>${escapeHtml(review.target_display_name_hint)}</td>
        <td><code>${escapeHtml(review.target_person_id)}</code></td>
        <td>${escapeHtml(review.dock_status_text)}</td>
        <td><code>${escapeHtml(review.operator_decision)}</code></td>
        <td><code>${escapeHtml(review.target_response_signal)}</code></td>
        <td>${escapeHtml(review.evidence_refs?.length ?? 0)}</td>
        <td><span class="pill ${ready}">${escapeHtml(ready)}</span></td>
        <td>${escapeHtml(failedChecks.join(', ') || 'none')}</td>
      </tr>`;
    })
    .join('');
  const commands = report.next_commands
    .map((command) => `<li><code>${escapeHtml(command)}</code></li>`)
    .join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>PT-028 Human Review Sheet</title>
  <style>
    :root { color-scheme: light; --ink:#1f2937; --muted:#6b7280; --line:#d1d5db; --ok:#047857; --warn:#b45309; --bg:#f8fafc; }
    body { margin:0; font-family: Arial, "Microsoft YaHei", sans-serif; color:var(--ink); background:var(--bg); }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    h1 { margin: 0 0 8px; font-size: 24px; letter-spacing: 0; }
    h2 { margin: 28px 0 10px; font-size: 18px; letter-spacing: 0; }
    p, li { line-height: 1.55; }
    .summary { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; margin-top: 16px; }
    .metric { border:1px solid var(--line); background:white; padding:10px 12px; border-radius:6px; }
    .metric b { display:block; font-size:12px; color:var(--muted); font-weight:600; }
    .metric span { display:block; margin-top:5px; overflow-wrap:anywhere; }
    table { width:100%; border-collapse:collapse; background:white; border:1px solid var(--line); table-layout: fixed; }
    th, td { border-bottom:1px solid var(--line); padding:8px; text-align:left; vertical-align:top; font-size:13px; overflow-wrap:anywhere; }
    th { background:#eef2f7; font-weight:700; }
    code { font-family: Consolas, "SFMono-Regular", monospace; font-size: 12px; }
    .pill { display:inline-block; border-radius:999px; padding:2px 8px; font-size:12px; font-weight:700; }
    .pill.ready { color:#065f46; background:#d1fae5; }
    .pill.missing { color:#92400e; background:#fef3c7; }
    .commands { background:white; border:1px solid var(--line); border-radius:6px; padding:12px 16px; }
    .muted { color:var(--muted); }
    @media (max-width: 760px) { main { padding:16px; } .summary { grid-template-columns:1fr; } table { table-layout:auto; } }
  </style>
</head>
<body>
<main data-report-contract="pt028_human_review_sheet_view.v1">
  <h1>PT-028 Human Review Sheet</h1>
  <p class="muted">Read-only worksheet for real multi-window feedback and final human special review. It does not write target feedback or send messages.</p>
  <section class="summary">
    <div class="metric"><b>writer_id</b><span>${escapeHtml(report.writer_id)}</span></div>
    <div class="metric"><b>gate_decision</b><span>${escapeHtml(report.gate_decision)}</span></div>
    <div class="metric"><b>ready_for_decision_generation</b><span>${escapeHtml(report.review_sheet_ready_for_decision_generation === true)}</span></div>
    <div class="metric"><b>window_reviews</b><span>${escapeHtml(sheet?.window_reviews?.length ?? 0)}</span></div>
    <div class="metric"><b>unique_targets</b><span>${escapeHtml(report.review_sheet_diagnostics?.unique_target_count ?? 'not_checked')}</span></div>
    <div class="metric"><b>check_only</b><span>${escapeHtml(report.check_only === true)}</span></div>
  </section>

  <h2>Evidence Review Summary</h2>
  <table>
    <tbody>
      <tr><th>event_stream_input_mode</th><td><code>${escapeHtml(eventSummary.input_mode ?? 'missing')}</code></td></tr>
      <tr><th>event_stream_events/windows/targets</th><td>${escapeHtml(eventSummary.event_count ?? 'missing')} / ${escapeHtml(eventSummary.unique_window_count ?? 'missing')} / ${escapeHtml(eventSummary.unique_target_count ?? 'missing')}</td></tr>
      <tr><th>event_stream_ipc_channel</th><td><code>${escapeHtml(eventSummary.ipc_channel ?? 'missing')}</code></td></tr>
      <tr><th>event_stream_target_dispatch_latency_ms</th><td>${escapeHtml(eventSummary.target_dispatch_latency_ms ?? 'missing')}</td></tr>
      <tr><th>prompt_only_boundary_preserved</th><td>${escapeHtml(eventSummary.prompt_only_boundary_preserved ?? 'missing')}</td></tr>
      <tr><th>collection_session_gate</th><td><code>${escapeHtml(collectionSummary.session_gate_decision ?? 'missing')}</code></td></tr>
      <tr><th>collection_task/target_count</th><td>${escapeHtml(collectionSummary.task_count ?? 'missing')} / ${escapeHtml(collectionSummary.distinct_target_count ?? 'missing')}</td></tr>
      <tr><th>collection_coverage_gate</th><td><code>${escapeHtml(collectionSummary.coverage_gate_decision ?? 'missing')}</code></td></tr>
      <tr><th>collection_matched/confirmed_count</th><td>${escapeHtml(collectionSummary.matched_task_count ?? 'missing')} / ${escapeHtml(collectionSummary.confirmed_task_count ?? 'missing')}</td></tr>
      <tr><th>collection_unconfirmed_task_ids</th><td>${escapeHtml((collectionSummary.unconfirmed_task_ids ?? []).join(',') || 'none')}</td></tr>
      <tr><th>acceptance_chain_required_failures</th><td>${escapeHtml((evidenceSummary.acceptance_chain_required_failures ?? []).join(',') || 'none')}</td></tr>
    </tbody>
  </table>

  <h2>Reviewer Fields</h2>
  <table>
    <thead><tr><th>field</th><th>value</th><th>status</th></tr></thead>
    <tbody>
      <tr><td><code>reviewer.reviewer_id</code></td><td>${escapeHtml(sheet?.reviewer?.reviewer_id)}</td><td><span class="pill ${fieldStatus(sheet?.reviewer?.reviewer_id, 'non_placeholder')}">${fieldStatus(sheet?.reviewer?.reviewer_id, 'non_placeholder')}</span></td></tr>
      <tr><td><code>reviewer.reviewed_at</code></td><td>${escapeHtml(sheet?.reviewer?.reviewed_at)}</td><td><span class="pill ${fieldStatus(sheet?.reviewer?.reviewed_at, 'non_placeholder')}">${fieldStatus(sheet?.reviewer?.reviewed_at, 'non_placeholder')}</span></td></tr>
      <tr><td><code>approve_controlled_feedback_target_write</code></td><td>${escapeHtml(sheet?.approve_controlled_feedback_target_write === true)}</td><td><span class="pill ${fieldStatus(sheet?.approve_controlled_feedback_target_write)}">${fieldStatus(sheet?.approve_controlled_feedback_target_write)}</span></td></tr>
    </tbody>
  </table>

  <h2>Global Confirmations</h2>
  <table>
    <thead><tr><th>field</th><th>value</th><th>status</th></tr></thead>
    <tbody>${globalRows}</tbody>
  </table>

  <h2>Window Reviews</h2>
  <table>
    <thead><tr><th>#</th><th>task</th><th>target</th><th>target_person_id</th><th>dock</th><th>operator_decision</th><th>target_response_signal</th><th>evidence</th><th>ready</th><th>failed_checks</th></tr></thead>
    <tbody>${windowRows}</tbody>
  </table>

  <h2>Allowed Values</h2>
  <table>
    <tbody>
      <tr><th>operator_decision</th><td>${(guidance.allowed_operator_decision_values ?? operatorDecisionChoices()).map(escapeHtml).join('<br>')}</td></tr>
      <tr><th>target_response_signal</th><td>${(guidance.allowed_target_response_signal_values ?? targetResponseSignalChoices()).map(escapeHtml).join('<br>')}</td></tr>
      <tr><th>window_row_ready_when</th><td>${(guidance.window_row_ready_when ?? []).map(escapeHtml).join('<br>')}</td></tr>
      <tr><th>final_review_ready_when</th><td>${(guidance.final_review_ready_when ?? []).map(escapeHtml).join('<br>')}</td></tr>
    </tbody>
  </table>

  <h2>Next Commands</h2>
  <ol class="commands">${commands}</ol>
</main>
</body>
</html>
`;
}

function renderMarkdown(report) {
  const checks = report.checks
    .map((item) => `- ${item.status.toUpperCase()} ${item.check_id}: ${(item.evidence ?? []).join('; ')}`)
    .join('\n');
  const failures = report.required_failures.length
    ? report.required_failures.map((item) => `- ${item}`).join('\n')
    : '- none';
  const commands = report.next_commands.map((item) => `- \`${item}\``).join('\n');
  const diagnostics = report.review_sheet_diagnostics
    ? [
      `- expected_window_review_count: ${report.review_sheet_diagnostics.expected_window_review_count}`,
      `- actual_window_review_count: ${report.review_sheet_diagnostics.actual_window_review_count}`,
      `- unique_target_count: ${report.review_sheet_diagnostics.unique_target_count}`,
      `- missing_global_confirmations: ${report.review_sheet_diagnostics.missing_global_confirmations.join(', ') || 'none'}`,
      `- missing_task_ids: ${report.review_sheet_diagnostics.missing_task_ids.join(', ') || 'none'}`,
      `- failed_required_checks: ${report.review_sheet_diagnostics.failed_required_checks.join(', ') || 'none'}`
    ].join('\n')
    : '- no review sheet supplied';
  const templateDiagnostics = report.template_initial_diagnostics
    ? [
      `- expected_window_review_count: ${report.template_initial_diagnostics.expected_window_review_count}`,
      `- actual_window_review_count: ${report.template_initial_diagnostics.actual_window_review_count}`,
      `- unique_target_count: ${report.template_initial_diagnostics.unique_target_count}`,
      `- missing_global_confirmations: ${report.template_initial_diagnostics.missing_global_confirmations.join(', ') || 'none'}`,
      `- missing_task_ids: ${report.template_initial_diagnostics.missing_task_ids.join(', ') || 'none'}`,
      `- failed_required_checks: ${report.template_initial_diagnostics.failed_required_checks.join(', ') || 'none'}`
    ].join('\n')
    : '- not applicable after review sheet input is supplied';
  const windowDiagnostics = (report.review_sheet_diagnostics?.window_review_diagnostics ?? [])
    .map((item) =>
      `| ${item.row_index} | ${item.task_id ?? ''} | ${item.target_person_id ?? ''} | ${item.ready} | ${item.failed_checks.join(', ') || 'none'} | ${item.evidence_ref_count} |`
    )
    .join('\n') || '| - | - | - | - | - | - |';
  const inputStatusLines = report.review_sheet_input_status
    ? [
      `- review_path_requested: ${report.review_sheet_input_status.review_path_requested}`,
      `- review_sheet_path: ${report.review_sheet_input_status.review_sheet_path ?? 'missing'}`,
      `- review_sheet_exists: ${report.review_sheet_input_status.review_sheet_exists}`,
      `- review_sheet_loaded: ${report.review_sheet_input_status.review_sheet_loaded}`,
      `- missing_input_failure: ${report.review_sheet_input_status.missing_input_failure ?? 'none'}`,
      `- next_action: ${report.review_sheet_input_status.next_action}`
    ].join('\n')
    : '- missing';
  const fillPlan = report.human_review_fill_plan;
  const fillPlanCommands = (fillPlan?.command_order ?? [])
    .map((item) => `- ${item.step_id}: \`${item.command}\` (writes_target_file=${item.writes_target_file === true})`)
    .join('\n') || '- missing';
  const fillPlanRows = (fillPlan?.window_row_tasks ?? [])
    .map((item) =>
      `| ${item.row_index} | ${item.task_id ?? ''} | ${item.source_window?.target_person_id ?? ''} | ${item.source_window?.dock_status_text ?? ''} | ${item.ready} | ${item.current_failed_checks.join(', ') || 'none'} |`
    )
    .join('\n') || '| - | - | - | - | - | - |';
  const controlledPreflight = report.controlled_preflight_chain;
  const controlledPreflightLines = controlledPreflight
    ? [
      `- coverage_ready: ${controlledPreflight.coverage_ready === true}`,
      `- preflight_ready: ${controlledPreflight.preflight_ready === true}`,
      `- ready_for_controlled_target_write: ${controlledPreflight.ready_for_controlled_target_write === true}`,
      `- required_failures: ${(controlledPreflight.required_failures ?? []).join(', ') || 'none'}`,
      `- detail_failures: ${(controlledPreflight.detail_failures ?? []).join(', ') || 'none'}`,
      `- readiness_required_failures: ${(controlledPreflight.runs?.confirmation_preflight?.readiness_required_failures ?? []).join(', ') || 'none'}`
    ].join('\n')
    : '- not run';
  return `# PT-028 Human Review Decision Writer

- writer_id: ${report.writer_id}
- gate_decision: ${report.gate_decision}
- ready_for_finalization: ${report.ready_for_finalization === true}
- check_only: ${report.check_only === true}
- review_sheet_ready_for_decision_generation: ${report.review_sheet_ready_for_decision_generation === true}
- writes_real_feedback_target: ${report.writes_real_feedback_target === true}
- real_execution_allowed: ${report.real_execution_allowed === true}
- real_send_attempted: ${report.real_send_attempted === true}
- review_sheet_template_path: ${report.output_paths?.review_sheet_template_path ?? 'missing'}
- decision_output_path: ${report.output_paths?.decision_output_path ?? 'not written'}

## Checks

${checks}

## Review Sheet Diagnostics

${diagnostics}

## Review Sheet Input Status

${inputStatusLines}

| row | task | target | ready | failed_checks | evidence_refs |
| --- | --- | --- | --- | --- | --- |
${windowDiagnostics}

## Template Initial Diagnostics

${templateDiagnostics}

## Human Review Fill Plan

- schema_version: ${fillPlan?.schema_version ?? 'missing'}
- template_json_path: ${fillPlan?.source_files?.template_json_path ?? 'missing'}
- worksheet_html_path: ${fillPlan?.source_files?.worksheet_html_path ?? 'missing'}
- filled_review_sheet_target_path: ${fillPlan?.target_files?.filled_review_sheet_target_path ?? 'missing'}
- real_feedback_target_path: ${fillPlan?.target_files?.real_feedback_target_path ?? 'missing'}
- active_review_sheet_path: ${fillPlan?.target_files?.active_review_sheet_path ?? 'missing'}
- current_review_sheet_exists: ${fillPlan?.current_review_sheet?.exists === true}
- missing_global_confirmations: ${(fillPlan?.current_diagnostics_summary?.missing_global_confirmations ?? []).join(', ') || 'none'}
- unready_window_row_count: ${fillPlan?.current_diagnostics_summary?.unready_window_row_count ?? 'missing'}

| row | task | target | dock | ready | current_failed_checks |
| --- | --- | --- | --- | --- | --- |
${fillPlanRows}

### Fill Plan Command Order

${fillPlanCommands}

## Controlled Preflight Detail

${controlledPreflightLines}

## Required Failures

${failures}

## Next Commands

${commands}

## Boundary

- This writer never writes the real feedback target file.
- This writer never sends messages.
- Generated decisions must still pass collection coverage, confirmation preflight and finalization.
`;
}

const root = path.resolve(argValue('root', process.cwd()));
const reviewPackPath = resolveInputPath(root, argValue('review-pack', defaultLatest(root, 'pt028-final-special-review-packs')));
const reviewPack = readJsonIfExists(reviewPackPath);
const sessionPath = resolveInputPath(root, argValue('session', reviewPack?.source?.session_path ?? defaultLatest(root, 'pt028-feedback-collection-sessions')));
const session = readJsonIfExists(sessionPath);
const reviewArg = argValue('review');
const reviewPath = resolveInputPath(root, reviewArg);
const decisionTemplatePath = resolveInputPath(
  root,
  argValue('decision-template', reviewPack?.review_scope?.decision_template_path ?? reviewPack?.human_review_field_guide?.decision_template_path)
);
const decisionTemplate = readJsonIfExists(decisionTemplatePath);
const outputId = nowCompactId('pt028_human_review_decision_writer');
const outputDir = argValue('output-dir')
  ? path.resolve(root, argValue('output-dir'))
  : path.join(root, 'runtime', 'pt028-human-review-decisions', outputId);
mkdirSync(outputDir, { recursive: true });

const reviewSheetTemplate = buildSheetTemplate({ reviewPack, session, reviewPackPath });
const reviewSheetTemplatePath = path.join(outputDir, 'pt028-human-review-decision.real.template.json');
writeFileSync(reviewSheetTemplatePath, `${JSON.stringify(reviewSheetTemplate, null, 2)}\n`, 'utf8');

const reviewSheet = readJsonIfExists(reviewPath);
const reviewSheetInputStatus = inputStatus({ root, reviewPath, reviewSheet, reviewSheetTemplatePath });
const checkOnly = process.argv.includes('--check-only');
const targetFeedbackPath = reviewPack?.review_scope?.target_feedback_path ?? decisionTemplate?.source?.target_feedback_path ?? null;
const templateInitialDecision = decisionTemplate
  ? applySheetToDecisionTemplate({ sheet: reviewSheetTemplate, decisionTemplate })
  : null;
const templateInitialChecks = buildChecks({
  reviewPack,
  sheet: reviewSheetTemplate,
  decisionTemplate,
  decision: templateInitialDecision,
  targetFeedbackPath
});
const templateInitialDiagnostics = buildReviewSheetDiagnostics({
  reviewPack,
  sheet: reviewSheetTemplate,
  decision: templateInitialDecision,
  checks: templateInitialChecks
});
const decision = reviewSheet && decisionTemplate
  ? applySheetToDecisionTemplate({ sheet: reviewSheet, decisionTemplate })
  : null;
const checks = reviewSheet
  ? buildChecks({ reviewPack, sheet: reviewSheet, decisionTemplate, decision, targetFeedbackPath })
  : [
    check({
      checkId: 'review_sheet_template_written',
      status: true,
      evidence: [`review_sheet_template_path=${relativeToRoot(root, reviewSheetTemplatePath)}`],
      required: false
    }),
    check({
      checkId: 'review_sheet_input_present',
      status: false,
      evidence: [
        `review_sheet_path=${relativeToRoot(root, reviewPath) ?? 'not_requested'}`,
        `review_sheet_exists=${reviewSheetInputStatus.review_sheet_exists}`,
        `missing_input_failure=${reviewSheetInputStatus.missing_input_failure}`
      ],
      required: true
    })
  ];
const requiredFailures = checks
  .filter((item) => item.required && item.status !== 'passed')
  .map((item) => item.check_id);
const reviewSheetDiagnostics = reviewSheet
  ? buildReviewSheetDiagnostics({ reviewPack, sheet: reviewSheet, decision, checks })
  : null;
const reviewSheetReadyForDecisionGeneration = reviewSheet ? requiredFailures.length === 0 : false;

const decisionOutputPath = decision && !checkOnly
  ? path.join(outputDir, 'pt028-real-feedback-confirmation-decision.real.json')
  : null;
if (decisionOutputPath) {
  writeFileSync(decisionOutputPath, `${JSON.stringify(decision, null, 2)}\n`, 'utf8');
}
const runControlledPreflight = process.argv.includes('--run-controlled-preflight');
const controlledPreflightChain = runControlledPreflight && decisionOutputPath
  ? buildControlledPreflightChain({ root, outputDir, decisionOutputPath })
  : null;
const controlledPreflightFailures = controlledPreflightChain
  ? controlledPreflightChain.required_failures
  : [];

const latestPath = path.join(root, 'runtime', 'pt028-human-review-decisions', 'latest.json');
mkdirSync(path.dirname(latestPath), { recursive: true });
const allRequiredFailures = [
  ...requiredFailures,
  ...controlledPreflightFailures
];
const nextCommands = reviewSheet && checkOnly && requiredFailures.length === 0
  ? [
    `npm.cmd run pt028:human-review-decision -- --review=${relativeToRoot(root, reviewPath)} --run-controlled-preflight`,
    'Then run npm.cmd run pt028:feedback-finalize -- --decision=<generated-decision-output-path>'
  ]
  : reviewSheet && allRequiredFailures.length === 0
  ? [
    `npm.cmd run pt028:feedback-finalize -- --decision=${relativeToRoot(root, decisionOutputPath)}`
  ]
  : [
    reviewPath
      ? `Prepare ${relativeToRoot(root, reviewPath)} from ${relativeToRoot(root, reviewSheetTemplatePath)} after human review.`
      : `Edit ${relativeToRoot(root, reviewSheetTemplatePath)} after human review.`,
    `npm.cmd run pt028:human-review-decision -- --review=${relativeToRoot(root, reviewPath) ?? '<filled-review-sheet.json>'} --check-only --fail-on-required`,
    `npm.cmd run pt028:human-review-decision -- --review=${relativeToRoot(root, reviewPath) ?? '<filled-review-sheet.json>'} --run-controlled-preflight`,
    'Do not write runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json manually.'
  ];
const outputPaths = {
  json_path: path.join(outputDir, 'pt028-human-review-decision-writer.json'),
  markdown_path: path.join(outputDir, 'pt028-human-review-decision-writer.md'),
  review_sheet_template_path: reviewSheetTemplatePath,
  review_sheet_markdown_path: path.join(outputDir, 'pt028-human-review-sheet.md'),
  review_sheet_html_path: path.join(outputDir, 'pt028-human-review-sheet.html'),
  decision_output_path: decisionOutputPath,
  latest_path: latestPath
};
const humanReviewFillPlan = buildHumanReviewFillPlan({
  root,
  reviewSheetTemplate,
  reviewSheet,
  reviewSheetTemplatePath,
  reviewSheetMarkdownPath: outputPaths.review_sheet_markdown_path,
  reviewSheetHtmlPath: outputPaths.review_sheet_html_path,
  reviewPath,
  reviewSheetInputStatus,
  reviewSheetDiagnostics,
  templateInitialDiagnostics,
  decisionOutputPath,
  controlledPreflightChain,
  nextCommands
});
const report = {
  schema_version: 'pt028_human_review_decision_writer.v1',
  writer_id: outputId,
  created_at: new Date().toISOString(),
  gate_decision: reviewSheet
    ? checkOnly
      ? (requiredFailures.length === 0 ? 'human_review_sheet_check_ready' : 'human_review_sheet_check_needs_attention')
      : (allRequiredFailures.length === 0 ? 'human_review_decision_ready_for_finalization' : 'human_review_decision_needs_attention')
    : reviewPath
      ? 'human_review_sheet_input_missing'
    : 'human_review_sheet_template_written',
  check_only: checkOnly,
  review_sheet_ready_for_decision_generation: reviewSheetReadyForDecisionGeneration,
  ready_for_finalization: reviewSheet && !checkOnly ? allRequiredFailures.length === 0 : false,
  real_execution_allowed: false,
  real_send_attempted: false,
  writes_real_feedback_target: false,
  source: {
    root,
    review_pack_path: relativeToRoot(root, reviewPackPath),
    session_path: relativeToRoot(root, sessionPath),
    review_sheet_path: relativeToRoot(root, reviewPath),
    decision_template_path: relativeToRoot(root, decisionTemplatePath),
    target_feedback_path: targetFeedbackPath
  },
  checks,
  required_failures: allRequiredFailures,
  review_sheet_input_status: reviewSheetInputStatus,
  review_sheet_diagnostics: reviewSheetDiagnostics,
  template_initial_diagnostics: reviewSheet ? null : templateInitialDiagnostics,
  human_review_fill_plan: humanReviewFillPlan,
  placeholder_paths: checks
    .find((item) => item.check_id === 'decision_has_no_placeholder_values')
    ?.evidence
    ?.find((item) => item.startsWith('placeholder_paths='))
    ?.replace('placeholder_paths=', '')
    ?.split(',')
    ?.filter((item) => item && item !== 'none') ?? [],
  controlled_preflight_chain: controlledPreflightChain,
  next_commands: nextCommands,
  boundary_policy: {
    writer_is_read_only_for_real_feedback_target: true,
    controlled_target_writer: 'pt028:feedback-finalize -> pt028:feedback-confirm',
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: false
  },
  output_paths: outputPaths
};

writeFileSync(report.output_paths.json_path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
writeFileSync(report.output_paths.markdown_path, renderMarkdown(report), 'utf8');
writeFileSync(
  report.output_paths.review_sheet_markdown_path,
  renderReviewSheetMarkdown({ report, sheet: reviewSheet ?? reviewSheetTemplate }),
  'utf8'
);
writeFileSync(
  report.output_paths.review_sheet_html_path,
  renderReviewSheetHtml({ report, sheet: reviewSheet ?? reviewSheetTemplate }),
  'utf8'
);
writeFileSync(latestPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  command: 'write-pt028-human-review-decision',
  writer_id: report.writer_id,
  gate_decision: report.gate_decision,
  check_only: report.check_only,
  review_sheet_ready_for_decision_generation: report.review_sheet_ready_for_decision_generation,
  ready_for_finalization: report.ready_for_finalization,
  required_failures: report.required_failures,
  review_sheet_input_status: report.review_sheet_input_status,
  review_sheet_diagnostics: report.review_sheet_diagnostics
    ? {
      expected_window_review_count: report.review_sheet_diagnostics.expected_window_review_count,
      actual_window_review_count: report.review_sheet_diagnostics.actual_window_review_count,
      unique_target_count: report.review_sheet_diagnostics.unique_target_count,
      missing_global_confirmations: report.review_sheet_diagnostics.missing_global_confirmations,
      missing_task_ids: report.review_sheet_diagnostics.missing_task_ids,
      failed_required_checks: report.review_sheet_diagnostics.failed_required_checks,
      first_window_failures: report.review_sheet_diagnostics.window_review_diagnostics
        .filter((item) => !item.ready)
        .slice(0, 5)
    }
    : null,
  template_initial_diagnostics: report.template_initial_diagnostics
    ? {
      expected_window_review_count: report.template_initial_diagnostics.expected_window_review_count,
      actual_window_review_count: report.template_initial_diagnostics.actual_window_review_count,
      unique_target_count: report.template_initial_diagnostics.unique_target_count,
      missing_global_confirmations: report.template_initial_diagnostics.missing_global_confirmations,
      missing_task_ids: report.template_initial_diagnostics.missing_task_ids,
      failed_required_checks: report.template_initial_diagnostics.failed_required_checks,
      first_window_failures: report.template_initial_diagnostics.window_review_diagnostics
        .filter((item) => !item.ready)
        .slice(0, 5)
    }
    : null,
  human_review_fill_plan: {
    schema_version: report.human_review_fill_plan.schema_version,
    template_json_path: report.human_review_fill_plan.source_files.template_json_path,
    worksheet_html_path: report.human_review_fill_plan.source_files.worksheet_html_path,
    filled_review_sheet_target_path: report.human_review_fill_plan.target_files.filled_review_sheet_target_path,
    real_feedback_target_path: report.human_review_fill_plan.target_files.real_feedback_target_path,
    active_review_sheet_path: report.human_review_fill_plan.target_files.active_review_sheet_path,
    current_review_sheet_exists: report.human_review_fill_plan.current_review_sheet.exists,
    expected_window_review_count: report.human_review_fill_plan.current_diagnostics_summary.expected_window_review_count,
    unready_window_row_count: report.human_review_fill_plan.current_diagnostics_summary.unready_window_row_count,
    required_global_confirmation_paths: report.human_review_fill_plan.required_global_confirmation_paths,
    first_window_row_task: report.human_review_fill_plan.window_row_tasks[0] ?? null,
    command_order: report.human_review_fill_plan.command_order,
    boundary_policy: report.human_review_fill_plan.boundary_policy
  },
  placeholder_paths: report.placeholder_paths,
  controlled_preflight_chain: report.controlled_preflight_chain
    ? {
      coverage_ready: report.controlled_preflight_chain.coverage_ready,
      preflight_ready: report.controlled_preflight_chain.preflight_ready,
      ready_for_controlled_target_write: report.controlled_preflight_chain.ready_for_controlled_target_write,
      required_failures: report.controlled_preflight_chain.required_failures,
      detail_failures: report.controlled_preflight_chain.detail_failures,
      readiness_required_failures: report.controlled_preflight_chain.runs?.confirmation_preflight?.readiness_required_failures ?? [],
      collection_coverage_required_failures: report.controlled_preflight_chain.runs?.confirmation_preflight?.collection_coverage_required_failures ?? []
    }
    : null,
  review_sheet_template_path: report.output_paths.review_sheet_template_path,
  review_sheet_markdown_path: report.output_paths.review_sheet_markdown_path,
  review_sheet_html_path: report.output_paths.review_sheet_html_path,
  decision_output_path: report.output_paths.decision_output_path,
  real_execution_allowed: report.real_execution_allowed,
  real_send_attempted: report.real_send_attempted,
  writes_real_feedback_target: report.writes_real_feedback_target,
  json_path: report.output_paths.json_path,
  markdown_path: report.output_paths.markdown_path,
  latest_path: report.output_paths.latest_path
}, null, 2));

if (process.argv.includes('--fail-on-required') && allRequiredFailures.length > 0) {
  process.exitCode = 2;
}
