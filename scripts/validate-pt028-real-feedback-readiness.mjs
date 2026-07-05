#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildPt028RealFeedbackReadiness } from '../packages/decision-cluster/src/pt028-real-feedback-readiness.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function readJsonIfExists(file) {
  if (!file || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function resolveInputPath(root, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.resolve(root, maybePath);
}

function defaultFeedbackPath(root) {
  return path.join(root, 'runtime', 'user-inputs', 'pt028-real-multi-window-operator-feedback.real.json');
}

function renderMarkdown(readiness) {
  const lines = [];
  lines.push('# PT-028 Real Feedback Readiness');
  lines.push('');
  lines.push(`- readiness_id: ${readiness.readiness_id}`);
  lines.push(`- gate_decision: ${readiness.gate_decision}`);
  lines.push(`- calibration_ready: ${readiness.calibration_ready}`);
  lines.push(`- final_acceptance_ready: ${readiness.final_acceptance_ready}`);
  lines.push(`- feedback_schema_valid: ${readiness.feedback_schema_valid}`);
  lines.push(`- placeholder_values_present: ${readiness.placeholder_values_present}`);
  lines.push(`- window_count: ${readiness.window_count}`);
  lines.push(`- unique_window_count: ${readiness.unique_window_count}`);
  lines.push(`- unique_target_count: ${readiness.unique_target_count}`);
  lines.push(`- human_special_review_ready: ${readiness.human_special_review_ready}`);
  lines.push(`- real_execution_allowed: ${readiness.real_execution_allowed}`);
  lines.push('');
  lines.push('## Window Rows');
  lines.push('');
  lines.push('| # | window | target | state | gate | ready | failures |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of readiness.window_rows) {
    lines.push(`| ${row.row_index} | ${row.window_id ?? ''} | ${row.target_person_id ?? ''} | ${row.state_id ?? ''} | ${row.send_gate_mode ?? ''} | ${row.ready_for_calibration} | ${row.row_failures.join(', ') || 'none'} |`);
  }
  lines.push('');
  lines.push('## Required Failures');
  lines.push('');
  if (!readiness.required_failures.length) {
    lines.push('No required failures.');
  } else {
    for (const failure of readiness.required_failures) {
      lines.push(`- ${failure.failure_id}: ${failure.severity}`);
    }
  }
  lines.push('');
  lines.push('## Next Commands');
  lines.push('');
  for (const command of readiness.next_commands) lines.push(`- \`${command}\``);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

const root = path.resolve(argValue('root') ?? process.cwd());
const feedbackPath = resolveInputPath(root, argValue('feedback')) ?? defaultFeedbackPath(root);
const feedbackBatch = readJsonIfExists(feedbackPath);
const readiness = buildPt028RealFeedbackReadiness({
  feedbackBatch,
  feedbackPath,
  root,
  pathExists: (candidate) => existsSync(candidate),
  readJson: (candidate) => readJsonIfExists(candidate)
});
const outputDir = argValue('output-dir')
  ? path.resolve(root, argValue('output-dir'))
  : path.join(root, 'runtime', 'pt028-real-feedback-readiness', readiness.readiness_id);
mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, 'pt028-real-feedback-readiness.json');
const markdownPath = path.join(outputDir, 'pt028-real-feedback-readiness.md');
const latestPath = path.join(root, 'runtime', 'pt028-real-feedback-readiness', 'latest.json');
mkdirSync(path.dirname(latestPath), { recursive: true });
const readinessWithPaths = {
  ...readiness,
  output_paths: {
    json_path: jsonPath,
    markdown_path: markdownPath,
    latest_path: latestPath
  }
};
writeFileSync(jsonPath, `${JSON.stringify(readinessWithPaths, null, 2)}\n`, 'utf8');
writeFileSync(markdownPath, renderMarkdown(readinessWithPaths), 'utf8');
writeFileSync(latestPath, `${JSON.stringify(readinessWithPaths, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  command: 'validate-pt028-real-feedback-readiness',
  readiness_id: readinessWithPaths.readiness_id,
  gate_decision: readinessWithPaths.gate_decision,
  calibration_ready: readinessWithPaths.calibration_ready,
  final_acceptance_ready: readinessWithPaths.final_acceptance_ready,
  required_failures: readinessWithPaths.required_failures.map((item) => item.failure_id),
  json_path: jsonPath,
  markdown_path: markdownPath,
  latest_path: latestPath
}, null, 2));
