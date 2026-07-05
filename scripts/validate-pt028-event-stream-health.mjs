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

function check({ checkId, status, evidence = [], required = true }) {
  return {
    check_id: checkId,
    status: status ? 'passed' : 'failed',
    required,
    evidence
  };
}

function numberArg(name, fallback) {
  const raw = argValue(name);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isSequential(events) {
  return events.every((event, index) => event.event_sequence === index + 1);
}

function renderMarkdown(health) {
  const lines = [];
  lines.push('# PT-028 Event Stream Health');
  lines.push('');
  lines.push(`- health_id: ${health.health_id}`);
  lines.push(`- gate_decision: ${health.gate_decision}`);
  lines.push(`- source_stream_path: ${health.source_stream_path ?? 'missing'}`);
  lines.push(`- event_count: ${health.stream_summary.event_count}`);
  lines.push(`- unique_window_count: ${health.stream_summary.unique_window_count}`);
  lines.push(`- unique_target_count: ${health.stream_summary.unique_target_count}`);
  lines.push(`- target_dispatch_latency_ms: ${health.stream_summary.target_dispatch_latency_ms ?? 'missing'}`);
  lines.push(`- debounce_ms: ${health.stream_summary.debounce_ms ?? 'missing'}`);
  lines.push(`- fallback_poll_interval_ms: ${health.stream_summary.fallback_poll_interval_ms ?? 'missing'}`);
  lines.push(`- real_execution_allowed: ${health.real_execution_allowed}`);
  lines.push(`- real_send_attempted: ${health.real_send_attempted}`);
  lines.push(`- writes_real_feedback_target: ${health.writes_real_feedback_target}`);
  lines.push('');
  lines.push('## Checks');
  lines.push('');
  lines.push('| check | status | evidence |');
  lines.push('| --- | --- | --- |');
  for (const item of health.checks) {
    lines.push(`| ${item.check_id} | ${item.status} | ${item.evidence.join('; ')} |`);
  }
  lines.push('');
  if (health.required_failures.length) {
    lines.push('## Required Failures');
    lines.push('');
    for (const failure of health.required_failures) lines.push(`- ${failure}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

const root = path.resolve(argValue('root') ?? process.cwd());
const streamPath = resolveInputPath(
  root,
  argValue('stream', path.join('runtime', 'pt028-gui-event-streams', 'latest.json'))
);
const stream = readJsonIfExists(streamPath);
const events = stream?.events ?? [];
const policy = stream?.low_latency_policy ?? {};
const integrity = stream?.stream_integrity ?? {};
const thresholds = {
  max_target_dispatch_latency_ms: numberArg('max-target-dispatch-ms', 50),
  max_debounce_ms: numberArg('max-debounce-ms', 50),
  max_fallback_poll_interval_ms: numberArg('max-fallback-poll-ms', 1000)
};
const uniqueWindowCount = new Set(events.map((event) => event.conversation_window_id).filter(Boolean)).size;
const uniqueTargetCount = new Set(events.map((event) => event.target_person_id).filter(Boolean)).size;
const streamRealExecutionAllowed = integrity.real_execution_allowed === true
  || events.some((event) => event.real_execution_allowed === true);
const streamRealSendAttempted = integrity.real_send_attempted === true
  || events.some((event) => event.real_send_attempted === true);
const checks = [
  check({
    checkId: 'event_stream_file_present',
    status: Boolean(stream),
    evidence: [`stream_path=${relativeToRoot(root, streamPath) ?? 'missing'}`]
  }),
  check({
    checkId: 'event_stream_schema_v1',
    status: stream?.schema_version === 'pt028_gui_event_stream.v1',
    evidence: [`schema_version=${stream?.schema_version ?? 'missing'}`]
  }),
  check({
    checkId: 'ready_for_low_latency_subscription',
    status: stream?.gate_decision === 'ready_for_low_latency_gui_subscription',
    evidence: [`gate_decision=${stream?.gate_decision ?? 'missing'}`]
  }),
  check({
    checkId: 'ipc_channel_declared',
    status: policy.desktop_ipc_channel === 'zhineng:decision-state:changed',
    evidence: [`desktop_ipc_channel=${policy.desktop_ipc_channel ?? 'missing'}`]
  }),
  check({
    checkId: 'target_dispatch_latency_within_threshold',
    status: Number(policy.target_dispatch_latency_ms) <= thresholds.max_target_dispatch_latency_ms,
    evidence: [
      `target_dispatch_latency_ms=${policy.target_dispatch_latency_ms ?? 'missing'}`,
      `threshold=${thresholds.max_target_dispatch_latency_ms}`
    ]
  }),
  check({
    checkId: 'debounce_within_threshold',
    status: Number(policy.debounce_ms) <= thresholds.max_debounce_ms,
    evidence: [
      `debounce_ms=${policy.debounce_ms ?? 'missing'}`,
      `threshold=${thresholds.max_debounce_ms}`
    ]
  }),
  check({
    checkId: 'fallback_poll_within_threshold',
    status: Number(policy.fallback_poll_interval_ms) <= thresholds.max_fallback_poll_interval_ms,
    evidence: [
      `fallback_poll_interval_ms=${policy.fallback_poll_interval_ms ?? 'missing'}`,
      `threshold=${thresholds.max_fallback_poll_interval_ms}`
    ]
  }),
  check({
    checkId: 'events_present',
    status: events.length > 0,
    evidence: [`event_count=${events.length}`]
  }),
  check({
    checkId: 'event_sequences_are_contiguous',
    status: isSequential(events),
    evidence: [`event_sequences=${events.map((event) => event.event_sequence).join(',')}`]
  }),
  check({
    checkId: 'integrity_counts_match_events',
    status: integrity.event_count === events.length
      && integrity.unique_window_count === uniqueWindowCount
      && integrity.unique_target_count === uniqueTargetCount,
    evidence: [
      `integrity_event_count=${integrity.event_count ?? 'missing'} actual=${events.length}`,
      `integrity_window_count=${integrity.unique_window_count ?? 'missing'} actual=${uniqueWindowCount}`,
      `integrity_target_count=${integrity.unique_target_count ?? 'missing'} actual=${uniqueTargetCount}`
    ]
  }),
  check({
    checkId: 'prompt_only_boundary_preserved',
    status: integrity.all_events_prompt_only === true
      && events.every((event) => event.send_gate_mode === 'blocked_prompt_only'),
    evidence: [
      `all_events_prompt_only=${integrity.all_events_prompt_only}`,
      `send_gate_modes=${[...new Set(events.map((event) => event.send_gate_mode ?? 'missing'))].join(',')}`
    ]
  }),
  check({
    checkId: 'no_real_execution_or_send',
    status: streamRealExecutionAllowed === false && streamRealSendAttempted === false,
    evidence: [
      `real_execution_allowed=${streamRealExecutionAllowed}`,
      `real_send_attempted=${streamRealSendAttempted}`
    ]
  }),
  check({
    checkId: 'user_motion_controls_required',
    status: policy.user_control_policy?.pause_stop_hide_or_frequency_control_required === true,
    evidence: [
      `pause_stop_hide_or_frequency_control_required=${policy.user_control_policy?.pause_stop_hide_or_frequency_control_required}`
    ]
  })
];
const requiredFailures = checks
  .filter((item) => item.required && item.status !== 'passed')
  .map((item) => item.check_id);
const health = {
  schema_version: 'pt028_event_stream_health.v1',
  health_id: nowCompactId('pt028_event_stream_health'),
  created_at: new Date().toISOString(),
  gate_decision: requiredFailures.length
    ? 'event_stream_health_needs_attention'
    : 'event_stream_ready_for_low_latency_gui_subscription',
  source_stream_path: relativeToRoot(root, streamPath),
  low_latency_thresholds: thresholds,
  stream_summary: {
    schema_version: stream?.schema_version ?? null,
    gate_decision: stream?.gate_decision ?? null,
    event_count: events.length,
    unique_window_count: uniqueWindowCount,
    unique_target_count: uniqueTargetCount,
    input_mode: stream?.source?.input_mode ?? null,
    ipc_channel: policy.desktop_ipc_channel ?? null,
    target_dispatch_latency_ms: policy.target_dispatch_latency_ms ?? null,
    debounce_ms: policy.debounce_ms ?? null,
    fallback_poll_interval_ms: policy.fallback_poll_interval_ms ?? null
  },
  checks,
  required_failures: requiredFailures,
  real_execution_allowed: false,
  real_send_attempted: false,
  writes_real_feedback_target: false,
  boundary_policy: {
    validation_is_read_only: true,
    real_feedback_target_write_allowed: false,
    real_send_allowed: false,
    gui_subscription_channel: 'zhineng:decision-state:changed'
  }
};
const outputDir = argValue('output-dir')
  ? path.resolve(root, argValue('output-dir'))
  : path.join(root, 'runtime', 'pt028-event-stream-health', health.health_id);
mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, 'pt028-event-stream-health.json');
const markdownPath = path.join(outputDir, 'pt028-event-stream-health.md');
const latestPath = path.join(root, 'runtime', 'pt028-event-stream-health', 'latest.json');
mkdirSync(path.dirname(latestPath), { recursive: true });
const healthWithPaths = {
  ...health,
  output_paths: {
    json_path: jsonPath,
    markdown_path: markdownPath,
    latest_path: latestPath
  }
};
writeFileSync(jsonPath, `${JSON.stringify(healthWithPaths, null, 2)}\n`, 'utf8');
writeFileSync(markdownPath, renderMarkdown(healthWithPaths), 'utf8');
writeFileSync(latestPath, `${JSON.stringify(healthWithPaths, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  command: 'validate-pt028-event-stream-health',
  health_id: healthWithPaths.health_id,
  gate_decision: healthWithPaths.gate_decision,
  required_failures: healthWithPaths.required_failures,
  event_count: healthWithPaths.stream_summary.event_count,
  unique_window_count: healthWithPaths.stream_summary.unique_window_count,
  unique_target_count: healthWithPaths.stream_summary.unique_target_count,
  target_dispatch_latency_ms: healthWithPaths.stream_summary.target_dispatch_latency_ms,
  debounce_ms: healthWithPaths.stream_summary.debounce_ms,
  fallback_poll_interval_ms: healthWithPaths.stream_summary.fallback_poll_interval_ms,
  real_execution_allowed: healthWithPaths.real_execution_allowed,
  real_send_attempted: healthWithPaths.real_send_attempted,
  writes_real_feedback_target: healthWithPaths.writes_real_feedback_target,
  json_path: jsonPath,
  markdown_path: markdownPath,
  latest_path: latestPath
}, null, 2));
if (requiredFailures.length > 0 && process.argv.includes('--fail-on-required')) {
  process.exitCode = 2;
}
