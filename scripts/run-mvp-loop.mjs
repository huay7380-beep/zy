import { readFileSync } from 'node:fs';
import {
  runMvpLoop,
  runMvpLoopFromPilotImport,
  runMvpLoops,
  writeMvpRunReport
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const loopId = argValue('loop-id');
const loopIndexRaw = argValue('loop-index');
const loopIndex = loopIndexRaw === null ? 0 : Number(loopIndexRaw);
const runAll = process.argv.includes('--all');
const pilotImport = argValue('pilot-import');
const writeReport = process.argv.includes('--write-report');
const reportDir = argValue('report-dir');
const userFeedbackPath = argValue('user-feedback');

function maybeReadUserFeedback() {
  return userFeedbackPath
    ? JSON.parse(readFileSync(userFeedbackPath, 'utf8'))
    : null;
}

function maybeWriteReport(result) {
  return writeReport
    ? writeMvpRunReport({
      result,
      outputDir: reportDir ?? undefined
    })
    : null;
}

const userTestFeedback = maybeReadUserFeedback();

if (pilotImport) {
  const result = runMvpLoopFromPilotImport({
    importPath: pilotImport,
    userTestFeedback
  });
  const report = maybeWriteReport(result);

  console.log(JSON.stringify({
    workflow: result.workflow,
    import_id: result.import_id,
    run_id: result.run_id,
    data_dir: result.data_dir,
    decision_id: result.decision_id,
    trigger_id: result.trigger_id,
    feedback_id: result.feedback_id,
    automation_preview_id: result.automation_preview.preview_id,
    automation_trial_id: result.automation_preview_trial.trial_id,
    message_draft: result.message_draft,
    manual_execution_checklist: result.manual_execution_checklist,
    agent_opinions: result.agent_opinions,
    raw_events: result.raw_events,
    semantic_events: result.semantic_events,
    feedback_records: result.feedback_records,
    audit_records: result.audit_records,
    intake_readiness: result.intake_readiness,
    import_summary: result.import_summary,
    real_user_review: result.real_user_review,
    user_test_review: result.user_test_review,
    second_pass_optimization: result.second_pass_optimization,
    optimization_result: result.optimization_result,
    quality: result.quality,
    automation_preview: {
      status: result.automation_preview.status,
      preview_reached: result.automation_preview_trial.preview_reached,
      real_execution_allowed: result.automation_preview_trial.real_execution_allowed,
      test_page: result.automation_preview_test_page.inspection,
      platform_dry_run_connector: result.automation_preview_test_page.platform_dry_run_connector_check
    },
    recommended_option: {
      option_id: result.decision.recommended_option.option_id,
      title: result.decision.recommended_option.title,
      weighted_score: result.decision.recommended_option.weighted_score
    },
    trigger_status: result.trigger_plan.status,
    report
  }, null, 2));
} else if (runAll) {
  const batch = runMvpLoops({
    loopIds: loopId ? [loopId] : null,
    userTestFeedback
  });
  const reports = batch.results.map((result) => maybeWriteReport(result)).filter(Boolean);

  console.log(JSON.stringify({
    workflow: batch.workflow,
    loop_ids: batch.loop_ids,
    summary: batch.summary,
    reports,
    loops: batch.results.map((result) => ({
      loop_id: result.loop_id,
      run_id: result.run_id,
      data_dir: result.data_dir,
      decision_id: result.decision_id,
      trigger_id: result.trigger_id,
      automation_preview_id: result.automation_preview.preview_id,
      automation_trial_id: result.automation_preview_trial.trial_id,
      message_draft: result.message_draft,
      manual_execution_checklist: result.manual_execution_checklist,
      recommended_option: {
        option_id: result.decision.recommended_option.option_id,
        title: result.decision.recommended_option.title,
        weighted_score: result.decision.recommended_option.weighted_score
      },
      automation_preview: {
        preview_reached: result.automation_preview_trial.preview_reached,
        real_execution_allowed: result.automation_preview_trial.real_execution_allowed,
        test_page: result.automation_preview_test_page.inspection,
        platform_dry_run_connector: result.automation_preview_test_page.platform_dry_run_connector_check
      },
      real_user_review: result.real_user_review,
      user_test_review: result.user_test_review,
      second_pass_optimization: result.second_pass_optimization,
      optimization_result: result.optimization_result,
      quality: result.quality
    }))
  }, null, 2));
} else {
  const result = runMvpLoop({
    loopId,
    loopIndex: Number.isFinite(loopIndex) ? loopIndex : 0,
    userTestFeedback
  });
  const report = maybeWriteReport(result);

  console.log(JSON.stringify({
    workflow: result.workflow,
    loop_id: result.loop_id,
    run_id: result.run_id,
    data_dir: result.data_dir,
    decision_id: result.decision_id,
    trigger_id: result.trigger_id,
    feedback_id: result.feedback_id,
    automation_preview_id: result.automation_preview.preview_id,
    automation_trial_id: result.automation_preview_trial.trial_id,
    message_draft: result.message_draft,
    manual_execution_checklist: result.manual_execution_checklist,
    agent_opinions: result.agent_opinions,
    raw_events: result.raw_events,
    semantic_events: result.semantic_events,
    feedback_records: result.feedback_records,
    audit_records: result.audit_records,
    real_user_review: result.real_user_review,
    optimization_result: result.optimization_result,
    quality: result.quality,
    user_test_review: result.user_test_review,
    second_pass_optimization: result.second_pass_optimization,
    automation_preview: {
      status: result.automation_preview.status,
      preview_reached: result.automation_preview_trial.preview_reached,
      real_execution_allowed: result.automation_preview_trial.real_execution_allowed,
      test_page: result.automation_preview_test_page.inspection,
      platform_dry_run_connector: result.automation_preview_test_page.platform_dry_run_connector_check
    },
    recommended_option: {
      option_id: result.decision.recommended_option.option_id,
      title: result.decision.recommended_option.title,
      weighted_score: result.decision.recommended_option.weighted_score
    },
    trigger_status: result.trigger_plan.status,
    report
  }, null, 2));
}
