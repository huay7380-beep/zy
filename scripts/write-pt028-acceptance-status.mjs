#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

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

function readJsonIfExists(file) {
  if (!file || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function parseTime(value) {
  const timestamp = Date.parse(value ?? '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function latestCreatedArtifact(artifacts) {
  return artifacts
    .map((artifact) => ({
      ...artifact,
      timestamp: parseTime(artifact.created_at)
    }))
    .filter((artifact) => artifact.timestamp !== null)
    .sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;
}

function buildHumanHandoffFreshness({
  sourceArtifacts,
  finalReviewPack,
  humanReviewDecision
}) {
  const latestSource = latestCreatedArtifact(sourceArtifacts);
  const finalReviewPackCreatedAt = finalReviewPack?.created_at ?? null;
  const humanReviewDecisionCreatedAt = humanReviewDecision?.created_at ?? null;
  const finalReviewPackTimestamp = parseTime(finalReviewPackCreatedAt);
  const humanReviewDecisionTimestamp = parseTime(humanReviewDecisionCreatedAt);
  const staleReasons = [];

  if (!finalReviewPack) {
    staleReasons.push('final_review_pack_missing');
  }
  if (!humanReviewDecision) {
    staleReasons.push('human_review_sheet_missing');
  }
  if (latestSource && finalReviewPackTimestamp !== null && finalReviewPackTimestamp < latestSource.timestamp) {
    staleReasons.push(`final_review_pack_older_than_${latestSource.artifact_id}`);
  }
  if (latestSource && humanReviewDecisionTimestamp !== null && humanReviewDecisionTimestamp < latestSource.timestamp) {
    staleReasons.push(`human_review_sheet_older_than_${latestSource.artifact_id}`);
  }
  if (
    finalReviewPackTimestamp !== null
    && humanReviewDecisionTimestamp !== null
    && humanReviewDecisionTimestamp < finalReviewPackTimestamp
  ) {
    staleReasons.push('human_review_sheet_older_than_final_review_pack');
  }

  return {
    schema_version: 'pt028_human_handoff_freshness.v1',
    fresh_for_latest_sources: staleReasons.length === 0,
    status: staleReasons.length === 0 ? 'fresh' : 'stale_or_missing',
    latest_source_artifact_id: latestSource?.artifact_id ?? null,
    latest_source_created_at: latestSource?.created_at ?? null,
    final_review_pack_created_at: finalReviewPackCreatedAt,
    human_review_decision_created_at: humanReviewDecisionCreatedAt,
    stale_reasons: staleReasons,
    refresh_commands: staleReasons.length
      ? [
        'npm.cmd run pt028:final-review-pack',
        'npm.cmd run pt028:human-review-decision',
        'npm.cmd run pt028:acceptance-status'
      ]
      : []
  };
}

function buildReviewSheetInitialDiagnosticsSummary({ humanReviewDecision, root, filledReviewSheetPath }) {
  const diagnostics = humanReviewDecision?.template_initial_diagnostics ?? null;
  const filledReviewSheetRelativePath = relativeToRoot(root, filledReviewSheetPath) ?? '<filled-review-sheet.json>';
  const unreadyWindows = (diagnostics?.window_review_diagnostics ?? [])
    .filter((item) => item.ready !== true);
  const firstUnreadyWindows = unreadyWindows.slice(0, 5).map((item) => ({
    row_index: item.row_index,
    task_id: item.task_id ?? null,
    target_person_id: item.target_person_id ?? null,
    target_display_name_hint: item.target_display_name_hint ?? null,
    failed_checks: item.failed_checks ?? [],
    evidence_ref_count: item.evidence_ref_count ?? 0
  }));

  return {
    schema_version: 'pt028_review_sheet_initial_diagnostics_summary.v1',
    diagnostics_present: Boolean(diagnostics),
    expected_window_review_count: diagnostics?.expected_window_review_count ?? null,
    actual_window_review_count: diagnostics?.actual_window_review_count ?? null,
    unique_target_count: diagnostics?.unique_target_count ?? null,
    missing_global_confirmations: diagnostics?.missing_global_confirmations ?? [],
    failed_required_checks: diagnostics?.failed_required_checks ?? [],
    unready_window_count: unreadyWindows.length,
    first_unready_windows: firstUnreadyWindows,
    next_action: diagnostics
      ? `Fill missing global confirmations and unready window rows, then run pt028:human-review-decision -- --review=${filledReviewSheetRelativePath} --check-only --fail-on-required.`
      : 'Regenerate the human review sheet with npm.cmd run pt028:human-review-decision so template_initial_diagnostics is available.'
  };
}

function buildHumanReviewFillPlanStatusSummary({ humanReviewDecision, root }) {
  const fillPlan = humanReviewDecision?.human_review_fill_plan ?? null;
  const diagnostics = fillPlan?.current_diagnostics_summary
    ?? humanReviewDecision?.review_sheet_diagnostics
    ?? humanReviewDecision?.template_initial_diagnostics
    ?? {};
  const filledReviewSheetTargetPath = fillPlan?.target_files?.filled_review_sheet_target_path
    ?? humanReviewDecision?.review_sheet_input_status?.review_sheet_path
    ?? relativeToRoot(root, defaultHumanReviewPath(root));
  const realFeedbackTargetPath = fillPlan?.target_files?.real_feedback_target_path
    ?? relativeToRoot(root, defaultFeedbackPath(root));
  const fillPlanRows = (fillPlan?.window_row_tasks ?? [])
    .filter((item) => item.ready !== true)
    .map((item) => ({
      row_index: item.row_index,
      task_id: item.task_id ?? null,
      target_person_id: item.source_window?.target_person_id ?? null,
      dock_status_text: item.source_window?.dock_status_text ?? null,
      current_failed_checks: item.current_failed_checks ?? []
    }));
  const diagnosticRows = (diagnostics?.window_review_diagnostics ?? [])
    .filter((item) => item.ready !== true)
    .map((item) => ({
      row_index: item.row_index,
      task_id: item.task_id ?? null,
      target_person_id: item.target_person_id ?? null,
      dock_status_text: null,
      current_failed_checks: item.failed_checks ?? []
    }));
  const unreadyRows = (fillPlanRows.length ? fillPlanRows : diagnosticRows).slice(0, 5);
  const fallbackCommandOrder = [
    {
      step_id: 'check_only',
      command: `npm.cmd run pt028:human-review-decision -- --review=${filledReviewSheetTargetPath} --check-only --fail-on-required`,
      writes_target_file: false
    },
    {
      step_id: 'controlled_preflight',
      command: `npm.cmd run pt028:human-review-decision -- --review=${filledReviewSheetTargetPath} --run-controlled-preflight`,
      writes_target_file: false
    },
    {
      step_id: 'feedback_finalize',
      command: 'npm.cmd run pt028:feedback-finalize -- --decision=<generated-decision-output-path>',
      writes_target_file: false
    }
  ];
  return {
    schema_version: 'pt028_human_review_fill_plan_summary.v1',
    source_writer_path: relativeToRoot(root, humanReviewDecision?.output_paths?.json_path),
    source_schema_version: fillPlan?.schema_version ?? null,
    template_json_path: fillPlan?.source_files?.template_json_path
      ?? relativeToRoot(root, humanReviewDecision?.output_paths?.review_sheet_template_path),
    worksheet_html_path: fillPlan?.source_files?.worksheet_html_path
      ?? relativeToRoot(root, humanReviewDecision?.output_paths?.review_sheet_html_path),
    filled_review_sheet_target_path: filledReviewSheetTargetPath,
    real_feedback_target_path: realFeedbackTargetPath,
    active_review_sheet_path: fillPlan?.target_files?.active_review_sheet_path
      ?? filledReviewSheetTargetPath,
    current_review_sheet_exists: fillPlan?.current_review_sheet?.exists
      ?? humanReviewDecision?.review_sheet_input_status?.review_sheet_exists
      ?? false,
    current_review_sheet_loaded: fillPlan?.current_review_sheet?.loaded
      ?? humanReviewDecision?.review_sheet_input_status?.review_sheet_loaded
      ?? false,
    expected_window_review_count: diagnostics.expected_window_review_count ?? 0,
    unready_window_row_count: diagnostics.unready_window_row_count ?? unreadyRows.length,
    missing_global_confirmations: diagnostics.missing_global_confirmations ?? [],
    failed_required_checks: diagnostics.failed_required_checks ?? [],
    first_unready_window_rows: unreadyRows,
    check_only_ready: humanReviewDecision?.review_sheet_ready_for_decision_generation === true,
    controlled_preflight_ready: humanReviewDecision?.controlled_preflight_chain?.ready_for_controlled_target_write === true,
    command_order: (fillPlan?.command_order ?? fallbackCommandOrder).map((item) => ({
      step_id: item.step_id,
      command: item.command,
      writes_target_file: item.writes_target_file === true
    })),
    boundary_policy: {
      summary_is_read_only: true,
      status_report_writes_target_files: false,
      writes_real_feedback_target: false,
      real_execution_allowed: false,
      real_send_attempted: false,
      prompt_only_required: true
    }
  };
}

function latestPath(root, runtimeDir) {
  return path.join(root, 'runtime', runtimeDir, 'latest.json');
}

function defaultFeedbackPath(root) {
  return path.join(root, 'runtime', 'user-inputs', 'pt028-real-multi-window-operator-feedback.real.json');
}

function defaultHumanReviewPath(root) {
  return path.join(root, 'runtime', 'user-inputs', 'pt028-human-review-decision.real.json');
}

function buildHumanInputTargets({ root, feedbackPath, filledReviewSheetPath }) {
  const reviewSheetRelativePath = relativeToRoot(root, filledReviewSheetPath);
  const feedbackRelativePath = relativeToRoot(root, feedbackPath);
  return {
    schema_version: 'pt028_human_input_targets.v1',
    filled_review_sheet_target_path: reviewSheetRelativePath,
    filled_review_sheet_target_exists: existsSync(filledReviewSheetPath),
    real_feedback_target_path: feedbackRelativePath,
    real_feedback_target_exists: existsSync(feedbackPath),
    check_only_command: `npm.cmd run pt028:human-review-decision -- --review=${reviewSheetRelativePath} --check-only --fail-on-required`,
    controlled_preflight_command: `npm.cmd run pt028:human-review-decision -- --review=${reviewSheetRelativePath} --run-controlled-preflight`,
    finalization_command: 'npm.cmd run pt028:feedback-finalize -- --decision=<generated-decision-output-path>',
    acceptance_chain_command: `npm.cmd run pt028:acceptance-chain -- --feedback=${feedbackRelativePath}`,
    boundary_policy: {
      paths_are_user_supplied_inputs: true,
      status_report_writes_target_files: false,
      real_execution_allowed: false,
      real_send_attempted: false
    }
  };
}

function buildHumanReviewWriterSummary(humanReviewDecision) {
  const inputStatus = humanReviewDecision?.review_sheet_input_status ?? null;
  return {
    schema_version: 'pt028_human_review_writer_summary.v1',
    writer_id: humanReviewDecision?.writer_id ?? null,
    gate_decision: humanReviewDecision?.gate_decision ?? null,
    check_only: humanReviewDecision?.check_only === true,
    review_sheet_ready_for_decision_generation: humanReviewDecision?.review_sheet_ready_for_decision_generation === true,
    ready_for_finalization: humanReviewDecision?.ready_for_finalization === true,
    required_failures: humanReviewDecision?.required_failures ?? [],
    review_sheet_input_status: inputStatus
      ? {
        schema_version: inputStatus.schema_version ?? 'pt028_review_sheet_input_status.v1',
        review_path_requested: inputStatus.review_path_requested === true,
        review_sheet_path: inputStatus.review_sheet_path ?? null,
        review_sheet_exists: inputStatus.review_sheet_exists === true,
        review_sheet_loaded: inputStatus.review_sheet_loaded === true,
        missing_input_failure: inputStatus.missing_input_failure ?? null,
        next_action: inputStatus.next_action ?? null
      }
      : null
  };
}

function commandFromFillPlan({ fillPlanSummary, stepId, fallbackCommand }) {
  return (fillPlanSummary.command_order ?? [])
    .find((item) => item.step_id === stepId)?.command
    ?? fallbackCommand;
}

function buildOperatorActionQueue({
  fullyAccepted,
  root,
  reviewSheetHtmlPath,
  reviewSheetMarkdownPath,
  humanReviewFillPlanSummary,
  humanInputTargets
}) {
  const reviewExists = humanInputTargets.filled_review_sheet_target_exists === true;
  const realFeedbackExists = humanInputTargets.real_feedback_target_exists === true;
  const checkOnlyReady = humanReviewFillPlanSummary.check_only_ready === true;
  const controlledPreflightReady = humanReviewFillPlanSummary.controlled_preflight_ready === true;
  const reviewHtmlRelativePath = relativeToRoot(root, reviewSheetHtmlPath)
    ?? humanReviewFillPlanSummary.worksheet_html_path
    ?? relativeToRoot(root, reviewSheetMarkdownPath);
  const reviewMarkdownRelativePath = relativeToRoot(root, reviewSheetMarkdownPath);
  const checkOnlyCommand = commandFromFillPlan({
    fillPlanSummary: humanReviewFillPlanSummary,
    stepId: 'check_only',
    fallbackCommand: humanInputTargets.check_only_command
  });
  const controlledPreflightCommand = commandFromFillPlan({
    fillPlanSummary: humanReviewFillPlanSummary,
    stepId: 'controlled_preflight',
    fallbackCommand: humanInputTargets.controlled_preflight_command
  });
  const finalizationCommand = commandFromFillPlan({
    fillPlanSummary: humanReviewFillPlanSummary,
    stepId: 'feedback_finalize',
    fallbackCommand: humanInputTargets.finalization_command
  });

  let currentActionId = null;
  let nextBlockingActionId = null;
  if (!fullyAccepted) {
    if (!reviewExists) {
      currentActionId = reviewHtmlRelativePath ? 'open_review_sheet_html' : 'prepare_filled_review_sheet';
      nextBlockingActionId = 'prepare_filled_review_sheet';
    } else if (!checkOnlyReady) {
      currentActionId = 'run_human_review_check_only';
      nextBlockingActionId = 'run_human_review_check_only';
    } else if (!controlledPreflightReady) {
      currentActionId = 'run_human_review_controlled_preflight';
      nextBlockingActionId = 'run_human_review_controlled_preflight';
    } else if (!realFeedbackExists) {
      currentActionId = 'run_feedback_finalize';
      nextBlockingActionId = 'run_feedback_finalize';
    } else {
      currentActionId = 'run_acceptance_chain';
      nextBlockingActionId = 'run_acceptance_chain';
    }
  }

  const actions = [
    {
      action_id: 'open_review_sheet_html',
      label: 'Open human review worksheet',
      status: fullyAccepted || reviewExists
        ? 'completed'
        : reviewHtmlRelativePath
          ? 'ready'
          : 'blocked_until_review_sheet_html_exists',
      open_path: reviewHtmlRelativePath,
      fallback_open_path: reviewMarkdownRelativePath,
      target_path: null,
      command: null,
      writes_target_file: false,
      writes_real_feedback_target: false,
      real_send_allowed: false,
      prompt_only_required: true
    },
    {
      action_id: 'prepare_filled_review_sheet',
      label: 'Prepare filled human review sheet',
      status: fullyAccepted || reviewExists ? 'completed' : 'waiting_for_operator',
      open_path: humanReviewFillPlanSummary.template_json_path,
      fallback_open_path: reviewHtmlRelativePath,
      target_path: humanInputTargets.filled_review_sheet_target_path,
      command: `Prepare ${humanInputTargets.filled_review_sheet_target_path} from ${humanReviewFillPlanSummary.template_json_path ?? '<human-review-template.json>'}`,
      writes_target_file: true,
      writes_real_feedback_target: false,
      real_send_allowed: false,
      prompt_only_required: true
    },
    {
      action_id: 'run_human_review_check_only',
      label: 'Run human review check-only gate',
      status: fullyAccepted || checkOnlyReady
        ? 'completed'
        : reviewExists
          ? 'ready'
          : 'blocked_until_review_sheet_exists',
      open_path: null,
      fallback_open_path: null,
      target_path: humanInputTargets.filled_review_sheet_target_path,
      command: checkOnlyCommand,
      writes_target_file: false,
      writes_real_feedback_target: false,
      real_send_allowed: false,
      prompt_only_required: true
    },
    {
      action_id: 'run_human_review_controlled_preflight',
      label: 'Run controlled preflight',
      status: fullyAccepted || controlledPreflightReady
        ? 'completed'
        : checkOnlyReady
          ? 'ready'
          : 'blocked_until_check_only_ready',
      open_path: null,
      fallback_open_path: null,
      target_path: humanInputTargets.filled_review_sheet_target_path,
      command: controlledPreflightCommand,
      writes_target_file: false,
      writes_real_feedback_target: false,
      real_send_allowed: false,
      prompt_only_required: true
    },
    {
      action_id: 'run_feedback_finalize',
      label: 'Run controlled real feedback finalization',
      status: fullyAccepted || realFeedbackExists
        ? 'completed'
        : controlledPreflightReady
          ? 'ready'
          : 'blocked_until_controlled_preflight_ready',
      open_path: null,
      fallback_open_path: null,
      target_path: humanInputTargets.real_feedback_target_path,
      command: finalizationCommand,
      writes_target_file: false,
      writes_real_feedback_target: true,
      real_send_allowed: false,
      prompt_only_required: true
    },
    {
      action_id: 'run_acceptance_chain',
      label: 'Run feedback-bound acceptance chain',
      status: fullyAccepted
        ? 'completed'
        : realFeedbackExists
          ? 'ready'
          : 'blocked_until_real_feedback_target_exists',
      open_path: null,
      fallback_open_path: null,
      target_path: humanInputTargets.real_feedback_target_path,
      command: humanInputTargets.acceptance_chain_command,
      writes_target_file: false,
      writes_real_feedback_target: false,
      real_send_allowed: false,
      prompt_only_required: true
    }
  ];

  return {
    schema_version: 'pt028_operator_action_queue.v1',
    source: 'pt028_acceptance_status',
    queue_status: fullyAccepted ? 'final_acceptance_complete' : 'operator_action_required',
    current_action_id: currentActionId,
    next_blocking_action_id: nextBlockingActionId,
    pending_action_count: actions.filter((action) => action.status !== 'completed').length,
    actions,
    boundary_policy: {
      read_only_status_report: true,
      writes_real_user_input_files: false,
      writes_real_feedback_target: false,
      real_execution_allowed: false,
      real_send_attempted: false,
      prompt_only_required: true
    }
  };
}

function buildFeedbackCollectionSummary({
  root,
  handoffValidation,
  collectionSession,
  collectionCoverage,
  decisionTemplatePath
}) {
  const taskCount = collectionSession?.collection_scope?.task_count
    ?? collectionSession?.operator_collection_tasks?.length
    ?? null;
  const distinctTargetCount = collectionSession?.collection_scope?.distinct_target_count
    ?? (collectionSession?.operator_collection_tasks
      ? new Set(collectionSession.operator_collection_tasks.map((task) => task.target_person_id).filter(Boolean)).size
      : null);
  const coverageSummary = collectionCoverage?.coverage_summary ?? {};
  const firstFailedCoverage = (collectionCoverage?.task_coverage ?? [])
    .find((task) => task.status !== 'confirmed');
  const firstFailedChecks = (firstFailedCoverage?.checks ?? [])
    .filter((checkItem) => checkItem.required === true && checkItem.status !== 'passed')
    .map((checkItem) => checkItem.check_id);
  const decisionRelativePath = relativeToRoot(root, decisionTemplatePath)
    ?? '<filled-confirmation-decision.json>';

  let nextAction = 'Run npm.cmd run pt028:feedback-handoff:validate, then pt028:feedback-collection:session.';
  if (handoffValidation?.ready_for_operator_feedback_collection === true
    && collectionSession?.ready_for_operator_feedback_collection !== true) {
    nextAction = 'Run npm.cmd run pt028:feedback-collection:session -- --fail-on-required.';
  } else if (collectionSession?.ready_for_operator_feedback_collection === true
    && collectionCoverage?.ready_for_confirmation_preflight !== true) {
    nextAction = `Fill operator confirmations, then run npm.cmd run pt028:feedback-collection:coverage -- --decision=${decisionRelativePath} --fail-on-required.`;
  } else if (collectionCoverage?.ready_for_confirmation_preflight === true) {
    nextAction = `Run npm.cmd run pt028:feedback-confirm:preflight -- --decision=${decisionRelativePath} --fail-on-required.`;
  }

  return {
    schema_version: 'pt028_feedback_collection_summary.v1',
    handoff_gate_decision: handoffValidation?.gate_decision ?? null,
    ready_for_operator_feedback_collection: handoffValidation?.ready_for_operator_feedback_collection === true,
    handoff_required_failures: requiredFailureIds(handoffValidation?.required_failures),
    session_gate_decision: collectionSession?.gate_decision ?? null,
    session_ready_for_operator_feedback_collection: collectionSession?.ready_for_operator_feedback_collection === true,
    task_count: taskCount,
    distinct_target_count: distinctTargetCount,
    collection_session_path: relativeToRoot(root, latestPath(root, 'pt028-feedback-collection-sessions')),
    coverage_gate_decision: collectionCoverage?.gate_decision ?? null,
    ready_for_confirmation_preflight: collectionCoverage?.ready_for_confirmation_preflight === true,
    matched_task_count: coverageSummary.matched_task_count ?? null,
    confirmed_task_count: coverageSummary.confirmed_task_count ?? null,
    unconfirmed_task_ids: coverageSummary.unconfirmed_task_ids ?? [],
    first_unconfirmed_failed_checks: collectionCoverage?.first_unconfirmed_failed_checks
      ?? firstFailedChecks,
    coverage_required_failures: requiredFailureIds(collectionCoverage?.required_failures),
    coverage_path: relativeToRoot(root, latestPath(root, 'pt028-feedback-collection-coverages')),
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: false,
    next_action: nextAction
  };
}

function buildEventStreamSummary({ eventStream, eventHealth }) {
  const healthSummary = eventHealth?.stream_summary ?? {};
  const streamIntegrity = eventStream?.stream_integrity ?? {};
  const lowLatencyPolicy = eventStream?.low_latency_policy ?? {};
  const promptOnlyHealthCheckPassed = (eventHealth?.checks ?? [])
    .some((item) => item.check_id === 'prompt_only_boundary_preserved' && item.status === 'passed');

  return {
    schema_version: 'pt028_acceptance_event_stream_summary.v1',
    event_stream_gate_decision: eventStream?.gate_decision ?? healthSummary.gate_decision ?? null,
    event_health_gate_decision: eventHealth?.gate_decision ?? null,
    event_count: healthSummary.event_count ?? streamIntegrity.event_count ?? eventStream?.events?.length ?? null,
    unique_window_count: healthSummary.unique_window_count ?? streamIntegrity.unique_window_count ?? null,
    unique_target_count: healthSummary.unique_target_count ?? streamIntegrity.unique_target_count ?? null,
    input_mode: healthSummary.input_mode ?? eventStream?.source?.input_mode ?? null,
    ipc_channel: healthSummary.ipc_channel ?? lowLatencyPolicy.desktop_ipc_channel ?? null,
    target_dispatch_latency_ms: healthSummary.target_dispatch_latency_ms ?? lowLatencyPolicy.target_dispatch_latency_ms ?? null,
    debounce_ms: healthSummary.debounce_ms ?? lowLatencyPolicy.debounce_ms ?? null,
    fallback_poll_interval_ms: healthSummary.fallback_poll_interval_ms ?? lowLatencyPolicy.fallback_poll_interval_ms ?? null,
    prompt_only_boundary_preserved: streamIntegrity.all_events_prompt_only === true || promptOnlyHealthCheckPassed,
    required_failures: requiredFailureIds(eventHealth?.required_failures),
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: false
  };
}

function requiredFailureIds(value) {
  return (value ?? []).map((item) => {
    if (typeof item === 'string') return item;
    return item.failure_id ?? item.check_id ?? JSON.stringify(item);
  });
}

function check({ requirementId, label, status, evidence = [], nextAction = null, required = true }) {
  return {
    requirement_id: requirementId,
    label,
    status,
    required,
    evidence,
    next_action: nextAction
  };
}

function passedOrBlocked(condition, blockedStatus = 'blocked') {
  return condition ? 'passed' : blockedStatus;
}

function readinessGatePassed(readiness) {
  return readiness?.final_acceptance_ready === true
    || readiness?.calibration_ready === true
    || [
      'ready_for_final_special_acceptance',
      'ready_for_feedback_calibration',
      'ready_for_feedback_calibration_pending_human_special_review'
    ].includes(readiness?.gate_decision);
}

function calibrationGatePassed(calibration) {
  return [
    'ready_for_real_multi_window_feedback_review',
    'ready_for_final_acceptance'
  ].includes(calibration?.gate_decision)
    && requiredFailureIds(calibration?.required_failures).length === 0
    && (calibration?.required_open_items ?? []).length === 0;
}

function renderMarkdown(status) {
  const lines = [];
  lines.push('# PT-028 Acceptance Status');
  lines.push('');
  lines.push(`- status_id: ${status.status_id}`);
  lines.push(`- gate_decision: ${status.gate_decision}`);
  lines.push(`- pt028_fully_accepted_for_production: ${status.pt028_fully_accepted_for_production}`);
  lines.push(`- real_execution_allowed: ${status.boundary_policy.real_execution_allowed}`);
  lines.push(`- real_send_attempted: ${status.boundary_policy.real_send_attempted}`);
  lines.push(`- writes_real_feedback_target: ${status.boundary_policy.writes_real_feedback_target}`);
  lines.push('');
  lines.push('## Event Stream Summary');
  lines.push('');
  lines.push(`- event_stream_gate: ${status.event_stream_summary.event_stream_gate_decision ?? 'missing'}`);
  lines.push(`- event_health_gate: ${status.event_stream_summary.event_health_gate_decision ?? 'missing'}`);
  lines.push(`- event_stream_input_mode: ${status.event_stream_summary.input_mode ?? 'missing'}`);
  lines.push(`- event_stream_event_count: ${status.event_stream_summary.event_count ?? 'missing'}`);
  lines.push(`- event_stream_window_count: ${status.event_stream_summary.unique_window_count ?? 'missing'}`);
  lines.push(`- event_stream_target_count: ${status.event_stream_summary.unique_target_count ?? 'missing'}`);
  lines.push(`- event_stream_ipc_channel: ${status.event_stream_summary.ipc_channel ?? 'missing'}`);
  lines.push(`- event_stream_target_dispatch_latency_ms: ${status.event_stream_summary.target_dispatch_latency_ms ?? 'missing'}`);
  lines.push(`- event_stream_debounce_ms: ${status.event_stream_summary.debounce_ms ?? 'missing'}`);
  lines.push(`- event_stream_fallback_poll_interval_ms: ${status.event_stream_summary.fallback_poll_interval_ms ?? 'missing'}`);
  lines.push(`- prompt_only_boundary_preserved: ${status.event_stream_summary.prompt_only_boundary_preserved}`);
  lines.push(`- event_stream_required_failures: ${status.event_stream_summary.required_failures.join(',') || 'none'}`);
  lines.push('');
  lines.push('## Requirement Status');
  lines.push('');
  lines.push('| requirement | status | evidence | next action |');
  lines.push('| --- | --- | --- | --- |');
  for (const item of status.requirement_status) {
    lines.push(`| ${item.requirement_id} | ${item.status} | ${item.evidence.join('; ')} | ${item.next_action ?? ''} |`);
  }
  lines.push('');
  lines.push('## Blocking Items');
  lines.push('');
  if (status.blocking_items.length) {
    for (const item of status.blocking_items) lines.push(`- ${item}`);
  } else {
    lines.push('- none');
  }
  lines.push('');
  lines.push('## Next Commands');
  lines.push('');
  for (const command of status.next_commands) lines.push(`- \`${command}\``);
  lines.push('');
  lines.push('## Operator Action Queue');
  lines.push('');
  lines.push(`- queue_schema: ${status.operator_action_queue.schema_version}`);
  lines.push(`- queue_status: ${status.operator_action_queue.queue_status}`);
  lines.push(`- current_action_id: ${status.operator_action_queue.current_action_id ?? 'none'}`);
  lines.push(`- next_blocking_action_id: ${status.operator_action_queue.next_blocking_action_id ?? 'none'}`);
  lines.push(`- pending_action_count: ${status.operator_action_queue.pending_action_count}`);
  lines.push(`- queue_writes_real_user_input_files: ${status.operator_action_queue.boundary_policy.writes_real_user_input_files}`);
  lines.push(`- queue_writes_real_feedback_target: ${status.operator_action_queue.boundary_policy.writes_real_feedback_target}`);
  lines.push('');
  lines.push('| action | status | target | command |');
  lines.push('| --- | --- | --- | --- |');
  for (const action of status.operator_action_queue.actions) {
    lines.push(`| ${action.action_id} | ${action.status} | ${action.target_path ?? ''} | ${action.command ?? ''} |`);
  }
  lines.push('');
  lines.push('## Human Handoff');
  lines.push('');
  lines.push(`- final_review_pack: ${status.human_handoff.final_review_pack_path ?? 'missing'}`);
  lines.push(`- review_sheet_template: ${status.human_handoff.review_sheet_template_path ?? 'missing'}`);
  lines.push(`- review_sheet_markdown: ${status.human_handoff.review_sheet_markdown_path ?? 'missing'}`);
  lines.push(`- review_sheet_html: ${status.human_handoff.review_sheet_html_path ?? 'missing'}`);
  lines.push(`- generated_decision_output: ${status.human_handoff.generated_decision_output_path ?? 'missing'}`);
  lines.push(`- human_review_writer_gate: ${status.human_handoff.human_review_writer_summary.gate_decision ?? 'missing'}`);
  lines.push(`- human_review_writer_required_failures: ${status.human_handoff.human_review_writer_summary.required_failures.join(',') || 'none'}`);
  lines.push(`- human_review_writer_input_missing: ${status.human_handoff.human_review_writer_summary.review_sheet_input_status?.missing_input_failure ?? 'none'}`);
  lines.push(`- freshness: ${status.human_handoff.freshness.status}`);
  lines.push(`- freshness_latest_source: ${status.human_handoff.freshness.latest_source_artifact_id ?? 'missing'} @ ${status.human_handoff.freshness.latest_source_created_at ?? 'missing'}`);
  lines.push(`- freshness_stale_reasons: ${status.human_handoff.freshness.stale_reasons.join(',') || 'none'}`);
  lines.push(`- initial_diagnostics_present: ${status.human_handoff.review_sheet_initial_diagnostics_summary.diagnostics_present}`);
  lines.push(`- initial_diagnostics_windows: ${status.human_handoff.review_sheet_initial_diagnostics_summary.actual_window_review_count ?? 'missing'} / ${status.human_handoff.review_sheet_initial_diagnostics_summary.expected_window_review_count ?? 'missing'}`);
  lines.push(`- initial_diagnostics_unique_targets: ${status.human_handoff.review_sheet_initial_diagnostics_summary.unique_target_count ?? 'missing'}`);
  lines.push(`- initial_diagnostics_missing_global_confirmations: ${status.human_handoff.review_sheet_initial_diagnostics_summary.missing_global_confirmations.join(',') || 'none'}`);
  lines.push(`- initial_diagnostics_failed_required_checks: ${status.human_handoff.review_sheet_initial_diagnostics_summary.failed_required_checks.join(',') || 'none'}`);
  lines.push(`- initial_diagnostics_unready_window_count: ${status.human_handoff.review_sheet_initial_diagnostics_summary.unready_window_count}`);
  lines.push(`- fill_plan_schema: ${status.human_handoff.human_review_fill_plan_summary.schema_version}`);
  lines.push(`- fill_plan_source_writer: ${status.human_handoff.human_review_fill_plan_summary.source_writer_path ?? 'missing'}`);
  lines.push(`- fill_plan_active_review_sheet: ${status.human_handoff.human_review_fill_plan_summary.active_review_sheet_path ?? 'missing'}`);
  lines.push(`- fill_plan_current_review_sheet_exists: ${status.human_handoff.human_review_fill_plan_summary.current_review_sheet_exists}`);
  lines.push(`- fill_plan_unready_window_count: ${status.human_handoff.human_review_fill_plan_summary.unready_window_row_count}`);
  lines.push(`- fill_plan_check_only_ready: ${status.human_handoff.human_review_fill_plan_summary.check_only_ready}`);
  lines.push(`- fill_plan_controlled_preflight_ready: ${status.human_handoff.human_review_fill_plan_summary.controlled_preflight_ready}`);
  lines.push('');
  lines.push('| fill row | task | target | dock | failed checks |');
  lines.push('| --- | --- | --- | --- | --- |');
  if (status.human_handoff.human_review_fill_plan_summary.first_unready_window_rows.length) {
    for (const row of status.human_handoff.human_review_fill_plan_summary.first_unready_window_rows) {
      lines.push(`| ${row.row_index} | ${row.task_id ?? ''} | ${row.target_person_id ?? ''} | ${row.dock_status_text ?? ''} | ${row.current_failed_checks.join(',') || 'none'} |`);
    }
  } else {
    lines.push('| - | - | - | - | none |');
  }
  lines.push('');
  lines.push(`- collection_handoff_gate: ${status.human_handoff.feedback_collection_summary.handoff_gate_decision ?? 'missing'}`);
  lines.push(`- collection_session_gate: ${status.human_handoff.feedback_collection_summary.session_gate_decision ?? 'missing'}`);
  lines.push(`- collection_task_count: ${status.human_handoff.feedback_collection_summary.task_count ?? 'missing'}`);
  lines.push(`- collection_distinct_target_count: ${status.human_handoff.feedback_collection_summary.distinct_target_count ?? 'missing'}`);
  lines.push(`- collection_coverage_gate: ${status.human_handoff.feedback_collection_summary.coverage_gate_decision ?? 'missing'}`);
  lines.push(`- collection_confirmed_task_count: ${status.human_handoff.feedback_collection_summary.confirmed_task_count ?? 'missing'}`);
  lines.push(`- collection_unconfirmed_task_ids: ${status.human_handoff.feedback_collection_summary.unconfirmed_task_ids.join(',') || 'none'}`);
  lines.push(`- collection_failed_checks: ${status.human_handoff.feedback_collection_summary.first_unconfirmed_failed_checks.join(',') || 'none'}`);
  lines.push(`- filled_review_sheet_target: ${status.human_handoff.human_input_targets.filled_review_sheet_target_path}`);
  lines.push(`- filled_review_sheet_target_exists: ${status.human_handoff.human_input_targets.filled_review_sheet_target_exists}`);
  lines.push(`- real_feedback_target: ${status.human_handoff.human_input_targets.real_feedback_target_path}`);
  lines.push(`- real_feedback_target_exists: ${status.human_handoff.human_input_targets.real_feedback_target_exists}`);
  lines.push('');
  lines.push('This status report is read-only. It does not generate real feedback, approve human review, or send messages.');
  return `${lines.join('\n')}\n`;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/write-pt028-acceptance-status.mjs [--root=<dir>] [--output-dir=<dir>]',
    '',
    'Writes a read-only PT-028 status summary for low-latency event stream, real feedback calibration, and final special acceptance.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve(argValue('root', process.cwd()));
  const statusId = nowCompactId('pt028_acceptance_status');
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : path.join(root, 'runtime', 'pt028-acceptance-statuses', statusId);
  mkdirSync(outputDir, { recursive: true });

  const feedbackPath = resolveInputPath(root, argValue('feedback')) ?? defaultFeedbackPath(root);
  const filledReviewSheetPath = resolveInputPath(root, argValue('human-review')) ?? defaultHumanReviewPath(root);
  const feedbackExists = existsSync(feedbackPath);
  const eventStream = readJsonIfExists(latestPath(root, 'pt028-gui-event-streams'));
  const eventHealth = readJsonIfExists(latestPath(root, 'pt028-event-stream-health'));
  const readiness = readJsonIfExists(latestPath(root, 'pt028-real-feedback-readiness'));
  const calibration = readJsonIfExists(latestPath(root, 'pt028-feedback-calibrations'));
  const finalAcceptance = readJsonIfExists(latestPath(root, 'pt028-final-special-acceptance'));
  const acceptanceChain = readJsonIfExists(latestPath(root, 'pt028-acceptance-chains'));
  const finalReviewPack = readJsonIfExists(latestPath(root, 'pt028-final-special-review-packs'));
  const humanReviewDecision = readJsonIfExists(latestPath(root, 'pt028-human-review-decisions'));
  const handoffValidation = readJsonIfExists(latestPath(root, 'pt028-feedback-handoff-validations'));
  const collectionSession = readJsonIfExists(latestPath(root, 'pt028-feedback-collection-sessions'));
  const collectionCoverage = readJsonIfExists(latestPath(root, 'pt028-feedback-collection-coverages'));

  const lowLatencyReady =
    eventHealth?.gate_decision === 'event_stream_ready_for_low_latency_gui_subscription'
    && requiredFailureIds(eventHealth.required_failures).length === 0;
  const feedbackReady =
    feedbackExists
    && readinessGatePassed(readiness)
    && requiredFailureIds(readiness.required_failures).length === 0;
  const calibrationReady =
    feedbackExists
    && calibrationGatePassed(calibration);
  const finalHumanReviewApproved =
    finalAcceptance?.pt028_fully_accepted_for_production === true
    && requiredFailureIds(finalAcceptance.required_failures).length === 0;
  const fullyAccepted =
    acceptanceChain?.pt028_fully_accepted_for_production === true
    && finalHumanReviewApproved
    && lowLatencyReady
    && feedbackReady
    && calibrationReady;

  const reviewSheetTemplatePath =
    humanReviewDecision?.output_paths?.review_sheet_template_path
    ?? finalReviewPack?.artifact_refs?.human_review_decision_template_path
    ?? null;
  const reviewSheetMarkdownPath =
    humanReviewDecision?.output_paths?.review_sheet_markdown_path
    ?? null;
  const reviewSheetHtmlPath =
    humanReviewDecision?.output_paths?.review_sheet_html_path
    ?? null;
  const generatedDecisionOutputPath =
    humanReviewDecision?.output_paths?.decision_output_path
    ?? humanReviewDecision?.decision_output_path
    ?? null;
  const confirmationDecisionTemplatePath =
    collectionCoverage?.source?.decision_path
    ?? collectionSession?.linked_pack?.decision_template_path
    ?? null;
  const finalReviewPackPath =
    finalReviewPack?.output_paths?.html_path
    ?? finalReviewPack?.output_paths?.markdown_path
    ?? finalReviewPack?.output_paths?.json_path
    ?? null;
  const humanHandoffFreshness = buildHumanHandoffFreshness({
    sourceArtifacts: [
      { artifact_id: 'gui_event_stream', created_at: eventStream?.created_at ?? null },
      { artifact_id: 'event_stream_health', created_at: eventHealth?.created_at ?? null },
      { artifact_id: 'real_feedback_readiness', created_at: readiness?.created_at ?? null },
      { artifact_id: 'feedback_calibration', created_at: calibration?.created_at ?? null },
      { artifact_id: 'final_special_acceptance', created_at: finalAcceptance?.created_at ?? null },
      { artifact_id: 'acceptance_chain', created_at: acceptanceChain?.created_at ?? null },
      { artifact_id: 'feedback_collection_session', created_at: collectionSession?.created_at ?? null },
      { artifact_id: 'feedback_collection_coverage', created_at: collectionCoverage?.created_at ?? null }
    ],
    finalReviewPack,
    humanReviewDecision
  });
  const reviewSheetInitialDiagnosticsSummary = buildReviewSheetInitialDiagnosticsSummary({
    humanReviewDecision,
    root,
    filledReviewSheetPath
  });
  const humanReviewFillPlanSummary = buildHumanReviewFillPlanStatusSummary({
    humanReviewDecision,
    root
  });
  const humanInputTargets = buildHumanInputTargets({
    root,
    feedbackPath,
    filledReviewSheetPath
  });
  const humanReviewWriterSummary = buildHumanReviewWriterSummary(humanReviewDecision);
  const feedbackCollectionSummary = buildFeedbackCollectionSummary({
    root,
    handoffValidation,
    collectionSession,
    collectionCoverage,
    decisionTemplatePath: confirmationDecisionTemplatePath
  });
  const eventStreamSummary = buildEventStreamSummary({
    eventStream,
    eventHealth
  });

  const requirementStatus = [
    check({
      requirementId: 'low_latency_event_stream',
      label: '低延迟事件流可订阅',
      status: passedOrBlocked(lowLatencyReady, 'needs_refresh_or_recheck'),
      evidence: [
        `event_stream_gate=${eventStream?.gate_decision ?? 'missing'}`,
        `event_health_gate=${eventHealth?.gate_decision ?? 'missing'}`,
        `event_count=${eventStreamSummary.event_count ?? 'missing'}`,
        `unique_window_count=${eventStreamSummary.unique_window_count ?? 'missing'}`,
        `unique_target_count=${eventStreamSummary.unique_target_count ?? 'missing'}`,
        `input_mode=${eventStreamSummary.input_mode ?? 'missing'}`,
        `ipc_channel=${eventStreamSummary.ipc_channel ?? 'missing'}`,
        `target_dispatch_latency_ms=${eventStreamSummary.target_dispatch_latency_ms ?? 'missing'}`,
        `prompt_only_boundary_preserved=${eventStreamSummary.prompt_only_boundary_preserved}`,
        `event_health_required_failures=${eventStreamSummary.required_failures.join(',') || 'none'}`
      ],
      nextAction: lowLatencyReady
        ? 'Keep latest event stream health bound to final acceptance.'
        : 'Run npm.cmd run pt028:event-stream:health -- --fail-on-required'
    }),
    check({
      requirementId: 'feedback_bound_multi_window_event_stream',
      label: '事件流绑定真实多窗口反馈',
      status: feedbackExists && !(acceptanceChain?.required_failures ?? []).includes('feedback_bound_multi_window_event_stream')
        ? 'passed'
        : 'waiting_for_real_feedback',
      evidence: [
        `feedback_exists=${feedbackExists}`,
        `acceptance_failure=${(acceptanceChain?.required_failures ?? []).includes('feedback_bound_multi_window_event_stream')}`
      ],
      nextAction: feedbackExists
        ? 'Rerun npm.cmd run pt028:acceptance-chain -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json'
        : 'Fill the human review sheet, run pt028:human-review-decision with --check-only, then run it with --run-controlled-preflight.'
    }),
    check({
      requirementId: 'real_feedback_readiness_gate',
      label: '真实多窗口反馈 readiness',
      status: passedOrBlocked(feedbackReady, 'waiting_for_real_feedback_target'),
      evidence: [
        `feedback_path=${relativeToRoot(root, feedbackPath)}`,
        `feedback_exists=${feedbackExists}`,
        `readiness_gate=${readiness?.gate_decision ?? 'missing'}`,
        `readiness_required_failures=${requiredFailureIds(readiness?.required_failures).join(',') || 'none'}`
      ],
      nextAction: feedbackExists
        ? 'Run npm.cmd run pt028:feedback-readiness -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json --fail-on-required'
        : 'Use the controlled human review decision path; do not write the target file manually.'
    }),
    check({
      requirementId: 'real_feedback_calibration_evidence',
      label: '真实反馈校准证据',
      status: passedOrBlocked(calibrationReady, 'dry_run_only_or_missing_real_feedback'),
      evidence: [
        `calibration_gate=${calibration?.gate_decision ?? 'missing'}`,
        `calibration_required_failures=${requiredFailureIds(calibration?.required_failures).join(',') || 'none'}`,
        `calibration_row_count=${calibration?.calibration_rows?.length ?? 'missing'}`
      ],
      nextAction: feedbackExists
        ? 'Run npm.cmd run pt028:feedback-calibration -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json --fail-on-required'
        : 'Collect and confirm real multi-window feedback first.'
    }),
    check({
      requirementId: 'final_human_special_review',
      label: '最终人工专项验收',
      status: passedOrBlocked(finalHumanReviewApproved, 'waiting_for_filled_human_review'),
      evidence: [
        `final_review_pack_gate=${finalReviewPack?.gate_decision ?? 'missing'}`,
        `human_review_decision_gate=${humanReviewDecision?.gate_decision ?? 'missing'}`,
        `human_review_ready_for_finalization=${humanReviewDecision?.ready_for_finalization === true}`,
        `human_handoff_freshness=${humanHandoffFreshness.status}`,
        `final_acceptance_gate=${finalAcceptance?.gate_decision ?? 'missing'}`
      ],
      nextAction: !humanHandoffFreshness.fresh_for_latest_sources
        ? 'Run npm.cmd run pt028:final-review-pack, then npm.cmd run pt028:human-review-decision to refresh the human review sheet against latest sources.'
        : generatedDecisionOutputPath
        ? `Run npm.cmd run pt028:feedback-finalize -- --decision=${relativeToRoot(root, generatedDecisionOutputPath)}`
        : reviewSheetTemplatePath
          ? `Fill ${relativeToRoot(root, reviewSheetTemplatePath)}, then run npm.cmd run pt028:human-review-decision -- --review=<filled-review-sheet.json> --check-only before controlled preflight`
          : 'Run npm.cmd run pt028:final-review-pack, then npm.cmd run pt028:human-review-decision.'
    })
  ];

  const blockingItems = requirementStatus
    .filter((item) => item.required && item.status !== 'passed')
    .map((item) => item.requirement_id);
  const operatorActionQueue = buildOperatorActionQueue({
    fullyAccepted,
    root,
    reviewSheetHtmlPath,
    reviewSheetMarkdownPath,
    humanReviewFillPlanSummary,
    humanInputTargets
  });

  const status = {
    schema_version: 'pt028_acceptance_status.v1',
    status_id: statusId,
    created_at: new Date().toISOString(),
    root,
    objective: {
      low_latency_event_stream: true,
      real_multi_window_feedback_calibration: true,
      final_special_acceptance: true
    },
    gate_decision: fullyAccepted
      ? 'pt028_goal_complete'
      : 'pt028_goal_open_waiting_for_real_human_feedback',
    pt028_fully_accepted_for_production: fullyAccepted,
    requirement_status: requirementStatus,
    event_stream_summary: eventStreamSummary,
    blocking_items: blockingItems,
    operator_action_queue: operatorActionQueue,
    source_artifacts: {
      acceptance_chain_path: relativeToRoot(root, latestPath(root, 'pt028-acceptance-chains')),
      event_stream_path: relativeToRoot(root, latestPath(root, 'pt028-gui-event-streams')),
      event_stream_health_path: relativeToRoot(root, latestPath(root, 'pt028-event-stream-health')),
      real_feedback_readiness_path: relativeToRoot(root, latestPath(root, 'pt028-real-feedback-readiness')),
      feedback_calibration_path: relativeToRoot(root, latestPath(root, 'pt028-feedback-calibrations')),
      final_acceptance_path: relativeToRoot(root, latestPath(root, 'pt028-final-special-acceptance')),
      final_review_pack_path: relativeToRoot(root, latestPath(root, 'pt028-final-special-review-packs')),
      human_review_decision_path: relativeToRoot(root, latestPath(root, 'pt028-human-review-decisions')),
      feedback_handoff_validation_path: relativeToRoot(root, latestPath(root, 'pt028-feedback-handoff-validations')),
      feedback_collection_session_path: relativeToRoot(root, latestPath(root, 'pt028-feedback-collection-sessions')),
      feedback_collection_coverage_path: relativeToRoot(root, latestPath(root, 'pt028-feedback-collection-coverages')),
      real_feedback_target_path: relativeToRoot(root, feedbackPath)
    },
    human_handoff: {
      final_review_pack_path: relativeToRoot(root, finalReviewPackPath),
      review_sheet_template_path: relativeToRoot(root, reviewSheetTemplatePath),
      review_sheet_markdown_path: relativeToRoot(root, reviewSheetMarkdownPath),
      review_sheet_html_path: relativeToRoot(root, reviewSheetHtmlPath),
      generated_decision_output_path: relativeToRoot(root, generatedDecisionOutputPath),
      human_review_sheet_template_written: Boolean(reviewSheetTemplatePath),
      human_review_decision_ready_for_finalization: humanReviewDecision?.ready_for_finalization === true,
      human_review_writer_summary: humanReviewWriterSummary,
      freshness: humanHandoffFreshness,
      review_sheet_initial_diagnostics_summary: reviewSheetInitialDiagnosticsSummary,
      human_review_fill_plan_summary: humanReviewFillPlanSummary,
      feedback_collection_summary: feedbackCollectionSummary,
      human_input_targets: humanInputTargets
    },
    next_commands: [
      ...(!humanHandoffFreshness.fresh_for_latest_sources ? humanHandoffFreshness.refresh_commands : []),
      reviewSheetTemplatePath
        ? `Prepare ${humanInputTargets.filled_review_sheet_target_path} from ${relativeToRoot(root, reviewSheetTemplatePath)} after human review.`
        : 'npm.cmd run pt028:human-review-decision',
      humanInputTargets.check_only_command,
      humanInputTargets.controlled_preflight_command,
      humanInputTargets.finalization_command,
      humanInputTargets.acceptance_chain_command
    ],
    boundary_policy: {
      read_only_status_report: true,
      real_execution_allowed: false,
      real_send_attempted: false,
      writes_real_feedback_target: false,
      does_not_approve_human_review: true
    }
  };

  const jsonPath = path.join(outputDir, 'pt028-acceptance-status.json');
  const markdownPath = path.join(outputDir, 'pt028-acceptance-status.md');
  const latestOutputPath = path.join(root, 'runtime', 'pt028-acceptance-statuses', 'latest.json');
  mkdirSync(path.dirname(latestOutputPath), { recursive: true });
  const statusWithPaths = {
    ...status,
    output_paths: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      latest_path: latestOutputPath
    }
  };
  writeFileSync(jsonPath, `${JSON.stringify(statusWithPaths, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdown(statusWithPaths), 'utf8');
  writeFileSync(latestOutputPath, `${JSON.stringify(statusWithPaths, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    command: 'write-pt028-acceptance-status',
    status_id: status.status_id,
    gate_decision: status.gate_decision,
    pt028_fully_accepted_for_production: status.pt028_fully_accepted_for_production,
    blocking_items: status.blocking_items,
    review_sheet_template_path: status.human_handoff.review_sheet_template_path,
    review_sheet_markdown_path: status.human_handoff.review_sheet_markdown_path,
    review_sheet_html_path: status.human_handoff.review_sheet_html_path,
    human_handoff_freshness: status.human_handoff.freshness.status,
    human_handoff_stale_reasons: status.human_handoff.freshness.stale_reasons,
    event_stream_summary: status.event_stream_summary,
    human_review_writer_summary: status.human_handoff.human_review_writer_summary,
    review_sheet_initial_diagnostics_summary: status.human_handoff.review_sheet_initial_diagnostics_summary,
    human_review_fill_plan_summary: status.human_handoff.human_review_fill_plan_summary,
    operator_action_queue: status.operator_action_queue,
    feedback_collection_summary: status.human_handoff.feedback_collection_summary,
    human_input_targets: status.human_handoff.human_input_targets,
    json_path: jsonPath,
    markdown_path: markdownPath,
    latest_path: latestOutputPath
  }, null, 2));

  if (process.argv.includes('--fail-on-blocked') && blockingItems.length > 0) {
    process.exitCode = 2;
  }
}
