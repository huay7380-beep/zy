#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildPt028FinalSpecialAcceptance,
  buildPt028GuiDecisionState,
  buildPt028GuiEventStream,
  buildPt028MultiWindowFeedbackCalibration
} from '../packages/decision-cluster/src/romantic-gui-state.mjs';
import { buildPt028RealFeedbackReadiness } from '../packages/decision-cluster/src/pt028-real-feedback-readiness.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function readJsonIfExists(file) {
  if (!file) return null;
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function resolveInputPath(root, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.resolve(root, maybePath);
}

function realFeedbackInput(root) {
  const explicit = argValue('feedback');
  const explicitPath = resolveInputPath(root, explicit);
  if (explicitPath && existsSync(explicitPath)) {
    return {
      path: explicitPath,
      batch: readJsonIfExists(explicitPath)
    };
  }
  const defaultPath = path.join(root, 'runtime', 'user-inputs', 'pt028-real-multi-window-operator-feedback.real.json');
  if (existsSync(defaultPath)) {
    return {
      path: defaultPath,
      batch: readJsonIfExists(defaultPath)
    };
  }
  return {
    path: explicitPath ?? defaultPath,
    batch: null
  };
}

function latestJsonInRuntimeDir(root, dirName, fileName) {
  const directLatest = path.join(root, 'runtime', dirName, 'latest.json');
  if (existsSync(directLatest)) return readJsonIfExists(directLatest);
  const base = path.join(root, 'runtime', dirName);
  if (!existsSync(base)) return null;
  const dirs = readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const dir of dirs) {
    const candidate = path.join(base, dir, fileName);
    if (existsSync(candidate)) return readJsonIfExists(candidate);
  }
  return null;
}

function stateFromFeedbackRecord(root, record) {
  if (record?.state_snapshot && typeof record.state_snapshot === 'object') return record.state_snapshot;
  const statePath = resolveInputPath(root, record?.state_path);
  return readJsonIfExists(statePath);
}

function eventStatesFromFeedbackBatch(root, batch) {
  return (batch?.window_feedback_records ?? [])
    .map((record, index) => ({
      window_id: record.window_id ?? `real_feedback_window_${index + 1}`,
      app_type: record.app_type ?? 'wechat',
      state: stateFromFeedbackRecord(root, record)
    }))
    .filter((entry) => entry.state?.schema_version === 'pt028_gui_decision_state.v1');
}

function calibrationWindowsFromFeedbackBatch(root, batch) {
  return (batch?.window_feedback_records ?? []).map((record, index) => ({
    window_id: record.window_id ?? `real_feedback_window_${index + 1}`,
    app_type: record.app_type ?? 'wechat',
    target_person_id: record.target_person_id ?? null,
    target_display_name: record.target_display_name ?? null,
    state: stateFromFeedbackRecord(root, record),
    feedback_record: {
      ...record,
      source_type: record.source_type ?? 'real_operator_feedback',
      reviewed_at: record.reviewed_at ?? batch.reviewer?.reviewed_at ?? batch.created_at,
      evidence_refs: record.evidence_refs ?? [],
      notes: record.notes ?? ''
    }
  }));
}

function renderMarkdown(acceptance) {
  const lines = [];
  lines.push('# PT-028 Final Special Acceptance');
  lines.push('');
  lines.push(`- acceptance_id: ${acceptance.acceptance_id}`);
  lines.push(`- gate_decision: ${acceptance.gate_decision}`);
  lines.push(`- pt028_fully_accepted_for_production: ${acceptance.pt028_fully_accepted_for_production}`);
  lines.push(`- real_execution_allowed: ${acceptance.real_execution_allowed}`);
  lines.push(`- real_send_attempted: ${acceptance.real_send_attempted}`);
  lines.push('');
  lines.push('## Checks');
  lines.push('');
  lines.push('| check | status | evidence | notes |');
  lines.push('| --- | --- | --- | --- |');
  for (const check of acceptance.checks) {
    lines.push(`| ${check.label} | ${check.status} | ${check.evidence} | ${check.notes} |`);
  }
  lines.push('');
  lines.push('## Required Failures');
  lines.push('');
  if (!acceptance.required_failures.length) {
    lines.push('No required failures.');
  } else {
    for (const item of acceptance.required_failures) {
      lines.push(`- ${item.check_id}: ${item.notes}`);
    }
  }
  lines.push('');
  lines.push('## Linked Artifacts');
  lines.push('');
  for (const [key, value] of Object.entries(acceptance.linked_artifacts)) {
    lines.push(`- ${key}: ${value ?? 'missing'}`);
  }
  lines.push('');
  if (acceptance.supporting_artifacts) {
    lines.push('## Supporting Artifacts');
    lines.push('');
    for (const [key, value] of Object.entries(acceptance.supporting_artifacts)) {
      lines.push(`- ${key}: ${value ?? 'missing'}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

const root = path.resolve(argValue('root') ?? process.cwd());
const feedbackInput = realFeedbackInput(root);
const guiState = readJsonIfExists(path.join(root, 'runtime', 'pt028-gui-decision-states', 'latest.json'))
  ?? buildPt028GuiDecisionState();
const feedbackEventStates = eventStatesFromFeedbackBatch(root, feedbackInput.batch);
const eventStream = feedbackEventStates.length
  ? buildPt028GuiEventStream({
    states: feedbackEventStates,
    source: {
      source_type: 'pt028_final_acceptance_feedback_event_stream',
      root,
      feedback_path: feedbackInput.path,
      feedback_batch_id: feedbackInput.batch?.feedback_batch_id ?? null,
      feedback_schema_version: feedbackInput.batch?.schema_version ?? null
    }
  })
  : latestJsonInRuntimeDir(root, 'pt028-gui-event-streams', 'pt028-gui-event-stream.json')
    ?? buildPt028GuiEventStream({ states: [guiState] });
const feedbackCalibration = feedbackInput.batch
  ? buildPt028MultiWindowFeedbackCalibration({
    windows: calibrationWindowsFromFeedbackBatch(root, feedbackInput.batch),
    source: {
      source_type: 'pt028_final_acceptance_feedback_calibration',
      root,
      feedback_path: feedbackInput.path,
      feedback_batch_id: feedbackInput.batch?.feedback_batch_id ?? null,
      feedback_schema_version: feedbackInput.batch?.schema_version ?? null
    }
  })
  : latestJsonInRuntimeDir(root, 'pt028-feedback-calibrations', 'pt028-multi-window-feedback-calibration.json')
    ?? buildPt028MultiWindowFeedbackCalibration();
const latestReadiness = feedbackInput.batch
  ? null
  : latestJsonInRuntimeDir(root, 'pt028-real-feedback-readiness', 'pt028-real-feedback-readiness.json');
const realFeedbackReadiness = feedbackInput.batch
  ? buildPt028RealFeedbackReadiness({
    feedbackBatch: feedbackInput.batch,
    feedbackPath: feedbackInput.path,
    root,
    pathExists: (candidate) => existsSync(candidate),
    readJson: (candidate) => readJsonIfExists(candidate)
  })
  : latestReadiness
    ?? buildPt028RealFeedbackReadiness({
    feedbackBatch: feedbackInput.batch,
    feedbackPath: feedbackInput.path,
    root,
    pathExists: (candidate) => existsSync(candidate),
    readJson: (candidate) => readJsonIfExists(candidate)
  });
const explicitAuditPath = resolveInputPath(root, argValue('audit'));
const audit = readJsonIfExists(explicitAuditPath)
  ?? latestJsonInRuntimeDir(root, 'pt028-audits', 'pt028-romantic-flow-audit.json');
const acceptance = buildPt028FinalSpecialAcceptance({
  guiState,
  eventStream,
  feedbackCalibration,
  realFeedbackReadiness,
  audit,
  source: {
    source_type: 'pt028_final_special_acceptance_cli',
    root,
    feedback_path: feedbackInput.path,
    feedback_batch_id: feedbackInput.batch?.feedback_batch_id ?? null,
    feedback_schema_version: feedbackInput.batch?.schema_version ?? null,
    event_stream_input_mode: feedbackEventStates.length
      ? 'real_feedback_batch_window_states'
      : 'latest_or_fallback_event_stream',
    event_stream_state_count: eventStream.stream_integrity?.state_count ?? 0,
    event_stream_window_count: eventStream.stream_integrity?.unique_window_count ?? 0,
    event_stream_target_count: eventStream.stream_integrity?.unique_target_count ?? 0,
    calibration_input_mode: feedbackInput.batch
      ? 'real_feedback_batch_window_states'
      : 'latest_or_fallback_calibration',
    readiness_input_mode: feedbackInput.batch
      ? 'real_feedback_batch'
      : 'latest_or_fallback_readiness',
    audit_input_mode: explicitAuditPath
      ? 'explicit_audit'
      : 'latest_or_fallback_audit',
    audit_path: explicitAuditPath,
    human_special_review_approved: argValue('human-special-review-approved') === 'true'
      || feedbackInput.batch?.human_special_review?.approved_for_final_special_acceptance === true,
    human_special_review: feedbackInput.batch?.human_special_review ?? null
  }
});
const outputDir = argValue('output-dir')
  ? path.resolve(root, argValue('output-dir'))
  : path.join(root, 'runtime', 'pt028-final-special-acceptance', acceptance.acceptance_id);
mkdirSync(outputDir, { recursive: true });
const supportingDir = path.join(outputDir, 'supporting-artifacts');
mkdirSync(supportingDir, { recursive: true });
const jsonPath = path.join(outputDir, 'pt028-final-special-acceptance.json');
const markdownPath = path.join(outputDir, 'pt028-final-special-acceptance.md');
const supportingEventStreamPath = path.join(supportingDir, 'pt028-gui-event-stream.used.json');
const supportingReadinessPath = path.join(supportingDir, 'pt028-real-feedback-readiness.used.json');
const supportingCalibrationPath = path.join(supportingDir, 'pt028-multi-window-feedback-calibration.used.json');
const latestPath = path.join(root, 'runtime', 'pt028-final-special-acceptance', 'latest.json');
mkdirSync(path.dirname(latestPath), { recursive: true });
const acceptanceWithPaths = {
  ...acceptance,
  supporting_artifacts: {
    event_stream_used_path: supportingEventStreamPath,
    real_feedback_readiness_used_path: supportingReadinessPath,
    feedback_calibration_used_path: supportingCalibrationPath,
    event_stream_input_mode: acceptance.source.event_stream_input_mode,
    readiness_input_mode: acceptance.source.readiness_input_mode,
    calibration_input_mode: acceptance.source.calibration_input_mode
  },
  output_paths: {
    json_path: jsonPath,
    markdown_path: markdownPath,
    latest_path: latestPath
  }
};
writeFileSync(supportingEventStreamPath, `${JSON.stringify(eventStream, null, 2)}\n`, 'utf8');
writeFileSync(supportingReadinessPath, `${JSON.stringify(realFeedbackReadiness, null, 2)}\n`, 'utf8');
writeFileSync(supportingCalibrationPath, `${JSON.stringify(feedbackCalibration, null, 2)}\n`, 'utf8');
writeFileSync(jsonPath, `${JSON.stringify(acceptanceWithPaths, null, 2)}\n`, 'utf8');
writeFileSync(markdownPath, renderMarkdown(acceptanceWithPaths), 'utf8');
writeFileSync(latestPath, `${JSON.stringify(acceptanceWithPaths, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  command: 'validate-pt028-final-special-acceptance',
  acceptance_id: acceptanceWithPaths.acceptance_id,
  gate_decision: acceptanceWithPaths.gate_decision,
  pt028_fully_accepted_for_production: acceptanceWithPaths.pt028_fully_accepted_for_production,
  required_failure_count: acceptanceWithPaths.required_failures.length,
  required_failures: acceptanceWithPaths.required_failures.map((item) => item.check_id),
  event_stream_input_mode: acceptanceWithPaths.source.event_stream_input_mode,
  event_stream_window_count: acceptanceWithPaths.source.event_stream_window_count,
  event_stream_target_count: acceptanceWithPaths.source.event_stream_target_count,
  calibration_input_mode: acceptanceWithPaths.source.calibration_input_mode,
  readiness_input_mode: acceptanceWithPaths.source.readiness_input_mode,
  real_execution_allowed: acceptanceWithPaths.real_execution_allowed,
  json_path: jsonPath,
  markdown_path: markdownPath,
  latest_path: latestPath
}, null, 2));
