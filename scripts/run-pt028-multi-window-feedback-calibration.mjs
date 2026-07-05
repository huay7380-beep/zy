#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildPt028MultiWindowFeedbackCalibration } from '../packages/decision-cluster/src/romantic-gui-state.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function readJsonIfExists(file) {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function resolveInputPath(root, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.resolve(root, maybePath);
}

function realFeedbackInputPath(root) {
  const explicit = argValue('feedback');
  if (explicit) return resolveInputPath(root, explicit);
  const defaultPath = path.join(root, 'runtime', 'user-inputs', 'pt028-real-multi-window-operator-feedback.real.json');
  return existsSync(defaultPath) ? defaultPath : null;
}

function stateFromFeedbackRecord(root, record) {
  if (record.state_snapshot && typeof record.state_snapshot === 'object') return record.state_snapshot;
  const statePath = resolveInputPath(root, record.state_path);
  return statePath ? readJsonIfExists(statePath) : null;
}

function windowsFromFeedbackBatch(root, batch) {
  return (batch.window_feedback_records ?? []).map((record, index) => ({
    window_id: record.window_id ?? `real_window_${index + 1}`,
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

function renderMarkdown(calibration) {
  const lines = [];
  lines.push('# PT-028 Multi-Window Feedback Calibration');
  lines.push('');
  lines.push(`- calibration_id: ${calibration.calibration_id}`);
  lines.push(`- gate_decision: ${calibration.gate_decision}`);
  lines.push(`- window_count: ${calibration.window_count}`);
  lines.push(`- target_count: ${calibration.target_count}`);
  lines.push(`- real_feedback_record_count: ${calibration.real_feedback_record_count}`);
  lines.push(`- no_cross_target_state_reuse: ${calibration.no_cross_target_state_reuse}`);
  lines.push(`- prompt_only_all_windows: ${calibration.prompt_only_all_windows}`);
  lines.push(`- real_execution_allowed: ${calibration.real_execution_allowed}`);
  lines.push('');
  lines.push('## Calibration Rows');
  lines.push('');
  lines.push('| window | target | dock | feedback | calibrated cadence | delta | isolation |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of calibration.calibration_rows) {
    const isolation = [
      `target_match=${row.isolation_check.state_target_matches_window_target}`,
      `target_reuse=${row.isolation_check.target_context_reused_across_windows}`,
      `state_reuse=${row.isolation_check.state_reused_across_windows}`
    ].join('; ');
    lines.push(
      `| ${row.window_id} | ${row.target_display_name ?? row.target_person_id ?? ''} | ${row.dock_status_text ?? ''} | ${row.feedback.operator_decision} / ${row.feedback.target_response_signal} | ${row.calibration_result.calibrated_cadence} | ${row.calibration_result.weight_delta} | ${isolation} |`
    );
  }
  lines.push('');
  lines.push('## Required Open Items');
  lines.push('');
  if (!calibration.required_open_items.length) {
    lines.push('No required open items.');
  } else {
    for (const item of calibration.required_open_items) lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('## Boundary');
  lines.push('');
  lines.push('- Feedback may calibrate cadence weights, not automatically upgrade relationship stage.');
  lines.push('- All windows remain prompt-only until a separately reviewed send gate is approved.');
  lines.push('- Dry-run fixture feedback is useful for engineering validation but does not satisfy real-world calibration acceptance.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

const root = path.resolve(argValue('root') ?? process.cwd());
const feedbackPath = realFeedbackInputPath(root);
const feedbackBatch = feedbackPath ? readJsonIfExists(feedbackPath) : null;
const windows = feedbackBatch ? windowsFromFeedbackBatch(root, feedbackBatch) : undefined;
const calibration = buildPt028MultiWindowFeedbackCalibration({
  ...(windows ? { windows } : {}),
  source: {
    source_type: 'pt028_multi_window_feedback_calibration_cli',
    root,
    input_mode: feedbackBatch
      ? 'real_operator_feedback_batch'
      : 'default_three_window_dry_run_fixture',
    feedback_path: feedbackPath,
    feedback_batch_id: feedbackBatch?.feedback_batch_id ?? null,
    feedback_schema_version: feedbackBatch?.schema_version ?? null
  }
});
const outputDir = argValue('output-dir')
  ? path.resolve(root, argValue('output-dir'))
  : path.join(root, 'runtime', 'pt028-feedback-calibrations', calibration.calibration_id);
mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, 'pt028-multi-window-feedback-calibration.json');
const markdownPath = path.join(outputDir, 'pt028-multi-window-feedback-calibration.md');
const latestPath = path.join(root, 'runtime', 'pt028-feedback-calibrations', 'latest.json');
mkdirSync(path.dirname(latestPath), { recursive: true });
const calibrationWithPaths = {
  ...calibration,
  output_paths: {
    json_path: jsonPath,
    markdown_path: markdownPath,
    latest_path: latestPath
  }
};
writeFileSync(jsonPath, `${JSON.stringify(calibrationWithPaths, null, 2)}\n`, 'utf8');
writeFileSync(markdownPath, renderMarkdown(calibrationWithPaths), 'utf8');
writeFileSync(latestPath, `${JSON.stringify(calibrationWithPaths, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  command: 'run-pt028-multi-window-feedback-calibration',
  calibration_id: calibrationWithPaths.calibration_id,
  gate_decision: calibrationWithPaths.gate_decision,
  window_count: calibrationWithPaths.window_count,
  target_count: calibrationWithPaths.target_count,
  real_feedback_record_count: calibrationWithPaths.real_feedback_record_count,
  required_open_items: calibrationWithPaths.required_open_items,
  real_execution_allowed: calibrationWithPaths.real_execution_allowed,
  json_path: jsonPath,
  markdown_path: markdownPath,
  latest_path: latestPath
}, null, 2));
