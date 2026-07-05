#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildPt028GuiDecisionState,
  buildPt028GuiEventStream
} from '../packages/decision-cluster/src/romantic-gui-state.mjs';

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

function realFeedbackInput(root) {
  const explicit = resolveInputPath(root, argValue('feedback'));
  if (explicit && existsSync(explicit)) {
    return {
      path: explicit,
      batch: readJsonIfExists(explicit)
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
    path: explicit ?? defaultPath,
    batch: null
  };
}

function collectionSessionInput(root) {
  const explicit = resolveInputPath(root, argValue('session'));
  if (explicit && existsSync(explicit)) {
    return {
      path: explicit,
      session: readJsonIfExists(explicit)
    };
  }
  return {
    path: explicit,
    session: null
  };
}

function stateFromFeedbackRecord(root, record) {
  if (record?.state_snapshot && typeof record.state_snapshot === 'object') return record.state_snapshot;
  const statePath = resolveInputPath(root, record?.state_path);
  return readJsonIfExists(statePath);
}

function statesFromFeedbackBatch(root, batch) {
  return (batch?.window_feedback_records ?? [])
    .map((record, index) => ({
      window_id: record.window_id ?? `real_feedback_window_${index + 1}`,
      app_type: record.app_type ?? 'wechat',
      state: stateFromFeedbackRecord(root, record)
    }))
    .filter((entry) => entry.state?.schema_version === 'pt028_gui_decision_state.v1');
}

function stateFromCollectionTask(root, task) {
  const statePath = resolveInputPath(root, task?.state_path);
  return readJsonIfExists(statePath);
}

function statesFromCollectionSession(root, session) {
  return (session?.operator_collection_tasks ?? [])
    .map((task, index) => ({
      window_id: task.window_id ?? `collection_session_window_${index + 1}`,
      app_type: task.app_type ?? 'wechat',
      state: stateFromCollectionTask(root, task)
    }))
    .filter((entry) => entry.state?.schema_version === 'pt028_gui_decision_state.v1');
}

function renderMarkdown(stream) {
  const lines = [];
  lines.push('# PT-028 GUI Event Stream');
  lines.push('');
  lines.push(`- stream_id: ${stream.stream_id}`);
  lines.push(`- gate_decision: ${stream.gate_decision}`);
  lines.push(`- ipc_channel: ${stream.low_latency_policy.desktop_ipc_channel}`);
  lines.push(`- target_dispatch_latency_ms: ${stream.low_latency_policy.target_dispatch_latency_ms}`);
  lines.push(`- fallback_poll_interval_ms: ${stream.low_latency_policy.fallback_poll_interval_ms}`);
  lines.push(`- input_mode: ${stream.source?.input_mode ?? 'unknown'}`);
  lines.push(`- real_execution_allowed: ${stream.stream_integrity.real_execution_allowed}`);
  lines.push(`- real_send_attempted: ${stream.stream_integrity.real_send_attempted}`);
  lines.push('');
  lines.push('## Events');
  lines.push('');
  lines.push('| seq | type | window | target | dock | gate | changed |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const event of stream.events) {
    lines.push(
      `| ${event.event_sequence} | ${event.event_type} | ${event.conversation_window_id} | ${event.target_display_name ?? ''} | ${event.dock_status_text ?? ''} | ${event.send_gate_mode ?? ''} | ${event.changed_fields.join(', ')} |`
    );
  }
  lines.push('');
  lines.push('## Low-Latency Boundary');
  lines.push('');
  lines.push('- The desktop GUI should subscribe to `zhineng:decision-state:changed`.');
  lines.push('- The 5 second polling path remains a fallback when the push channel is unavailable.');
  lines.push('- The status surface must keep pause/stop/hide or update-frequency controls available for auto-updating content.');
  lines.push('- Real sending remains blocked by this stream.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

const root = path.resolve(argValue('root') ?? process.cwd());
const feedbackInput = realFeedbackInput(root);
const feedbackStates = statesFromFeedbackBatch(root, feedbackInput.batch);
const sessionInput = collectionSessionInput(root);
const sessionStates = feedbackStates.length
  ? []
  : statesFromCollectionSession(root, sessionInput.session);
const latestStatePath = path.join(root, 'runtime', 'pt028-gui-decision-states', 'latest.json');
const latestState = readJsonIfExists(latestStatePath)
  ?? buildPt028GuiDecisionState({
    source: {
      source_type: 'pt028_event_stream_fallback_state',
      root
    }
  });
const states = feedbackStates.length
  ? feedbackStates
  : sessionStates.length
    ? sessionStates
    : [{
      window_id: latestState.source?.window_id ?? 'wechat_window_current',
      app_type: latestState.source?.app_type ?? 'wechat',
      state: latestState
    }];
const inputMode = feedbackStates.length
  ? 'real_feedback_batch_window_states'
  : sessionStates.length
    ? 'operator_collection_session_window_states'
    : 'latest_gui_state';
const stream = buildPt028GuiEventStream({
  states,
  source: {
    source_type: 'pt028_gui_event_stream_cli',
    root,
    input_mode: inputMode,
    feedback_path: feedbackInput.path,
    feedback_batch_id: feedbackInput.batch?.feedback_batch_id ?? null,
    feedback_schema_version: feedbackInput.batch?.schema_version ?? null,
    collection_session_path: sessionInput.path,
    collection_session_id: sessionInput.session?.session_id ?? null,
    collection_session_schema_version: sessionInput.session?.schema_version ?? null,
    collection_task_count: sessionInput.session?.operator_collection_tasks?.length ?? null,
    latest_state_path: latestStatePath,
    latest_state_exists: existsSync(latestStatePath)
  }
});
const outputDir = argValue('output-dir')
  ? path.resolve(root, argValue('output-dir'))
  : path.join(root, 'runtime', 'pt028-gui-event-streams', stream.stream_id);
mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, 'pt028-gui-event-stream.json');
const markdownPath = path.join(outputDir, 'pt028-gui-event-stream.md');
const latestPath = path.join(root, 'runtime', 'pt028-gui-event-streams', 'latest.json');
mkdirSync(path.dirname(latestPath), { recursive: true });
const streamWithPaths = {
  ...stream,
  output_paths: {
    json_path: jsonPath,
    markdown_path: markdownPath,
    latest_path: latestPath
  }
};
writeFileSync(jsonPath, `${JSON.stringify(streamWithPaths, null, 2)}\n`, 'utf8');
writeFileSync(markdownPath, renderMarkdown(streamWithPaths), 'utf8');
writeFileSync(latestPath, `${JSON.stringify(streamWithPaths, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  command: 'write-pt028-gui-event-stream',
  stream_id: streamWithPaths.stream_id,
  gate_decision: streamWithPaths.gate_decision,
  event_count: streamWithPaths.events.length,
  window_count: streamWithPaths.stream_integrity.unique_window_count,
  target_count: streamWithPaths.stream_integrity.unique_target_count,
  input_mode: streamWithPaths.source.input_mode,
  ipc_channel: streamWithPaths.low_latency_policy.desktop_ipc_channel,
  real_execution_allowed: streamWithPaths.stream_integrity.real_execution_allowed,
  json_path: jsonPath,
  markdown_path: markdownPath,
  latest_path: latestPath
}, null, 2));
