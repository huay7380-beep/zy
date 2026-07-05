#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildPt028GuiDecisionState,
  buildPt028GuiEventStream
} from '../packages/decision-cluster/src/romantic-gui-state.mjs';
import {
  buildDesktopContextBridge,
  writeDesktopContextBridge
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function nowCompactId(prefix) {
  return `${prefix}_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function readJsonIfExists(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function resolveMaybeRelative(root, maybePath) {
  if (!maybePath || typeof maybePath !== 'string') return null;
  return path.isAbsolute(maybePath) ? maybePath : path.resolve(root, maybePath);
}

function relativeOrOriginal(root, filePath) {
  if (!filePath) return null;
  const relative = path.relative(root, filePath);
  return relative.startsWith('..') ? filePath.replace(/\\/g, '/') : relative.replace(/\\/g, '/');
}

function safeId(value, fallback) {
  return String(value ?? fallback)
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96) || fallback;
}

function candidateObservationsFromWorkpack(workpack, limit) {
  return (workpack?.candidate_source_observations
    ?? workpack?.candidate_desktop_observations
    ?? [])
    .filter((candidate) => candidate.candidate_for_feedback_evidence)
    .slice(0, limit);
}

function renderStateMarkdown(state) {
  return `# PT-028 Real Observation GUI State

- state_id: ${state.state_id}
- observation_path: ${state.source?.observation_path ?? 'missing'}
- bridge_id: ${state.source?.bridge_id ?? 'missing'}
- gate_decision: ${state.gate_decision}
- dock_status_text: ${state.frontend_display_contract?.surfaces?.dock?.text ?? 'missing'}
- send_gate_mode: ${state.send_gate_transfer_path?.current_mode ?? 'missing'}
- real_execution_allowed: ${state.real_execution_allowed}
- real_send_attempted: ${state.real_send_attempted}

## Target

- target_person_id: ${state.source_decision?.target_person_id ?? 'missing'}
- target_display_name: ${state.source_decision?.target_display_name ?? 'missing'}
- current_stage: ${state.relationship_gradient_review?.current_stage ?? 'missing'}
- current_turn_intent: ${state.relationship_gradient_review?.romantic_progression_cadence?.current_turn_intent ?? 'missing'}

## Boundary

This state is generated from a read-only desktop observation candidate. It can prefill the feedback draft state path, but it does not confirm the real window, target binding, prompt-only state, no-send state or privacy boundary by itself.
`;
}

function renderManifestMarkdown(manifest) {
  const rows = manifest.generated_states.length
    ? manifest.generated_states.map((item) => [
      `| ${item.slot_index}`,
      item.status,
      item.observation_path ?? 'missing',
      item.state_path ?? 'missing',
      item.target_display_name ?? item.target_person_id ?? 'missing',
      item.dock_status_text ?? 'missing',
      item.failure ?? 'none'
    ].join(' | ') + ' |').join('\n')
    : '| 0 | missing | missing | missing | missing | missing | no_generated_states |';
  return `# PT-028 Real Observation GUI States

- manifest_id: ${manifest.manifest_id}
- gate_decision: ${manifest.gate_decision}
- source_workpack_path: ${manifest.source.workpack_path}
- generated_state_count: ${manifest.summary.generated_state_count}
- failed_candidate_count: ${manifest.summary.failed_candidate_count}
- target_coverage_status: ${manifest.target_coverage.status}
- observed_unique_target_count: ${manifest.target_coverage.observed_unique_target_count}
- required_unique_target_count: ${manifest.target_coverage.required_unique_target_count}
- real_execution_allowed: ${manifest.real_execution_allowed}
- real_send_attempted: ${manifest.real_send_attempted}

| slot | status | observation | state | target | dock | failure |
| --- | --- | --- | --- | --- | --- | --- |
${rows}

## Target Coverage

- status: ${manifest.target_coverage.status}
- observed_unique_target_count: ${manifest.target_coverage.observed_unique_target_count}
- missing_unique_target_count: ${manifest.target_coverage.missing_unique_target_count}
- note: ${manifest.target_coverage.coverage_note}

${manifest.target_coverage.required_next_actions.map((item) => `- ${item}`).join('\n') || '- No additional target capture is required before operator review.'}

## Event Stream Preview

- event_stream_path: ${manifest.event_stream?.event_stream_path ?? 'missing'}
- event_count: ${manifest.event_stream?.event_count ?? 0}
- window_count: ${manifest.event_stream?.window_count ?? 0}
- target_count: ${manifest.event_stream?.target_count ?? 0}

## Boundary

- This manifest does not write the real feedback target file.
- Generated GUI states are evidence candidates only; operator confirmations must still be supplied in runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json.
- Real sending remains blocked.
`;
}

function buildStateForCandidate({ root, candidate, index, outputDir }) {
  const observationPath = resolveMaybeRelative(root, candidate.observation_path);
  if (!observationPath || !existsSync(observationPath)) {
    throw new Error(`candidate observation missing: ${candidate.observation_path ?? 'missing'}`);
  }
  const bridge = buildDesktopContextBridge({
    observationPaths: [observationPath],
    goal: {
      initial_goal: 'PT-028 real desktop observation candidate for prompt-only romantic relationship review.',
      scene: 'personal_social',
      preferred_channel: 'wechat'
    },
    graphRoot: root
  });
  const slot = String(index + 1).padStart(3, '0');
  const lanePrefix = safeId(candidate.source_lane ?? candidate.platform ?? 'source', 'source');
  const windowId = `${lanePrefix}_observation_${slot}`;
  const state = buildPt028GuiDecisionState({
    decision: bridge.decision,
    source: {
      source_type: 'pt028_real_observation_gui_state',
      bridge_id: bridge.bridge_id,
      observation_path: candidate.observation_path,
      observation_id: candidate.observation_id,
      window_id: windowId,
      app_type: candidate.platform ?? 'unknown'
    },
    stateId: `pt028_gui_decision_state_real_observation_${slot}_${safeId(candidate.observation_id, 'candidate')}`
  });
  const stateDir = path.join(outputDir, `state_${slot}_${safeId(candidate.observation_id, 'candidate')}`);
  ensureDir(stateDir);
  const bridgeWritten = writeDesktopContextBridge({
    bridge,
    outputDir: path.join(stateDir, 'desktop-context-bridge')
  });
  const statePath = path.join(stateDir, 'pt028-gui-decision-state.json');
  const stateMarkdownPath = path.join(stateDir, 'pt028-gui-decision-state.md');
  const stateWithPaths = {
    ...state,
    output_paths: {
      json_path: statePath,
      markdown_path: stateMarkdownPath
    }
  };
  writeFileSync(statePath, `${JSON.stringify(stateWithPaths, null, 2)}\n`, 'utf8');
  writeFileSync(stateMarkdownPath, renderStateMarkdown(stateWithPaths), 'utf8');
  return {
    slot_index: index + 1,
    status: 'generated',
    observation_path: candidate.observation_path,
    observation_id: candidate.observation_id ?? null,
    bridge_id: bridge.bridge_id,
    bridge_path: relativeOrOriginal(root, bridgeWritten.json_path),
    state_id: stateWithPaths.state_id,
    state_path: relativeOrOriginal(root, statePath),
    state_markdown_path: relativeOrOriginal(root, stateMarkdownPath),
    window_id: windowId,
    app_type: candidate.platform ?? 'unknown',
    target_person_id: stateWithPaths.source_decision?.target_person_id ?? null,
    target_display_name: stateWithPaths.source_decision?.target_display_name ?? null,
    dock_status_text: stateWithPaths.frontend_display_contract?.surfaces?.dock?.text ?? null,
    send_gate_mode: stateWithPaths.send_gate_transfer_path?.current_mode ?? null,
    real_execution_allowed: stateWithPaths.real_execution_allowed === true,
    real_send_attempted: stateWithPaths.real_send_attempted === true
  };
}

const root = path.resolve(argValue('root') ?? process.cwd());
const workpackPath = resolveMaybeRelative(
  root,
  argValue('workpack') ?? path.join('runtime', 'pt028-real-feedback-workpacks', 'latest.json')
);
const workpack = readJsonIfExists(workpackPath);
const limit = Number.parseInt(argValue('limit') ?? '3', 10);
const manifestId = nowCompactId('pt028_real_observation_gui_states');
const outputDir = argValue('output-dir')
  ? path.resolve(root, argValue('output-dir'))
  : path.join(root, 'runtime', 'pt028-real-observation-gui-states', manifestId);
ensureDir(outputDir);

const candidates = candidateObservationsFromWorkpack(workpack, Number.isFinite(limit) ? limit : 3);
const generatedStates = [];
for (const [index, candidate] of candidates.entries()) {
  try {
    generatedStates.push(buildStateForCandidate({
      root,
      candidate,
      index,
      outputDir
    }));
  } catch (error) {
    generatedStates.push({
      slot_index: index + 1,
      status: 'failed',
      observation_path: candidate.observation_path ?? null,
      observation_id: candidate.observation_id ?? null,
      failure: error instanceof Error ? error.message : String(error)
    });
  }
}

const validStateEntries = generatedStates
  .filter((item) => item.status === 'generated')
  .map((item) => ({
    window_id: item.window_id,
    app_type: item.app_type ?? 'unknown',
    state: readJsonIfExists(path.join(root, item.state_path))
  }))
  .filter((entry) => entry.state?.schema_version === 'pt028_gui_decision_state.v1');
let eventStream = null;
let eventStreamPath = null;
let eventStreamMarkdownPath = null;
if (validStateEntries.length) {
  eventStream = buildPt028GuiEventStream({
    states: validStateEntries,
    source: {
      source_type: 'pt028_real_observation_gui_states_manifest',
      manifest_id: manifestId,
      workpack_path: relativeOrOriginal(root, workpackPath),
      input_mode: 'candidate_observation_state_preview'
    }
  });
  eventStreamPath = path.join(outputDir, 'pt028-gui-event-stream.candidate.json');
  eventStreamMarkdownPath = path.join(outputDir, 'pt028-gui-event-stream.candidate.md');
  writeFileSync(eventStreamPath, `${JSON.stringify({
    ...eventStream,
    output_paths: {
      json_path: eventStreamPath,
      markdown_path: eventStreamMarkdownPath
    }
  }, null, 2)}\n`, 'utf8');
  const eventRows = eventStream.events.map((event) =>
    `| ${event.event_sequence} | ${event.conversation_window_id} | ${event.target_display_name ?? ''} | ${event.dock_status_text ?? ''} | ${event.send_gate_mode ?? ''} |`
  ).join('\n');
  writeFileSync(eventStreamMarkdownPath, `# PT-028 Candidate Event Stream Preview

| seq | window | target | dock | gate |
| --- | --- | --- | --- | --- |
${eventRows}
`, 'utf8');
}

function targetCoverageFromGeneratedStates(states, requiredUniqueTargetCount = 2) {
  const grouped = new Map();
  for (const state of states.filter((item) => item.status === 'generated')) {
    const targetId = state.target_person_id ?? `missing_target_${state.slot_index}`;
    const current = grouped.get(targetId) ?? {
      target_person_id: state.target_person_id ?? null,
      target_display_name: state.target_display_name ?? null,
      window_count: 0,
      window_ids: [],
      state_paths: []
    };
    current.window_count += 1;
    if (state.window_id) current.window_ids.push(state.window_id);
    if (state.state_path) current.state_paths.push(state.state_path);
    grouped.set(targetId, current);
  }
  const observedTargets = [...grouped.values()];
  const observedUniqueTargetCount = observedTargets
    .filter((item) => item.target_person_id)
    .length;
  const missingUniqueTargetCount = Math.max(0, requiredUniqueTargetCount - observedUniqueTargetCount);
  const hasEnoughTargets = observedUniqueTargetCount >= requiredUniqueTargetCount;
  const status = hasEnoughTargets
    ? 'sufficient_for_multi_target_candidate_review'
    : states.filter((item) => item.status === 'generated').length >= 2
      ? 'multi_window_single_target_needs_additional_target'
      : 'insufficient_candidate_windows';
  return {
    schema_version: 'pt028_target_coverage.v1',
    required_unique_target_count: requiredUniqueTargetCount,
    observed_unique_target_count: observedUniqueTargetCount,
    missing_unique_target_count: missingUniqueTargetCount,
    observed_targets: observedTargets,
    status,
    ready_for_multi_target_real_feedback_collection: hasEnoughTargets,
    coverage_note: hasEnoughTargets
      ? 'Candidate GUI states cover at least two distinct target_person_id values for multi-target review.'
      : 'Current candidate GUI states do not yet cover two distinct target_person_id values; collect another real human-contact window for a different target before claiming production multi-target calibration.',
    required_next_actions: hasEnoughTargets
      ? []
      : [
        'Capture at least one additional real WeChat human_contact window for a different target person.',
        'Run npm.cmd run pt028:feedback-workpack, then npm.cmd run pt028:real-observation-gui-states, then npm.cmd run pt028:feedback-workpack again.',
        'Only after human review should a filled runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json be created.'
      ]
  };
}

const targetCoverage = targetCoverageFromGeneratedStates(generatedStates);
const manifest = {
  schema_version: 'pt028_real_observation_gui_states.v1',
  manifest_id: manifestId,
  created_at: new Date().toISOString(),
  gate_decision: generatedStates.some((item) => item.status === 'generated')
    ? targetCoverage.ready_for_multi_target_real_feedback_collection
      ? 'candidate_gui_states_ready_for_operator_review'
      : 'candidate_gui_states_ready_but_target_coverage_gap'
    : 'candidate_gui_states_missing',
  real_execution_allowed: false,
  real_send_attempted: false,
  writes_real_feedback_target: false,
  source: {
    root,
    workpack_path: relativeOrOriginal(root, workpackPath),
    workpack_id: workpack?.workpack_id ?? null,
    candidate_count: candidates.length
  },
  summary: {
    generated_state_count: generatedStates.filter((item) => item.status === 'generated').length,
    failed_candidate_count: generatedStates.filter((item) => item.status === 'failed').length
  },
  generated_states: generatedStates,
  target_coverage: targetCoverage,
  event_stream: eventStream
    ? {
      event_stream_path: relativeOrOriginal(root, eventStreamPath),
      event_stream_markdown_path: relativeOrOriginal(root, eventStreamMarkdownPath),
      event_count: eventStream.events.length,
      window_count: eventStream.stream_integrity.unique_window_count,
      target_count: eventStream.stream_integrity.unique_target_count,
      gate_decision: eventStream.gate_decision,
      real_execution_allowed: eventStream.stream_integrity.real_execution_allowed,
      real_send_attempted: eventStream.stream_integrity.real_send_attempted
    }
    : null,
  next_commands: [
    'npm.cmd run pt028:feedback-workpack',
    'npm.cmd run pt028:feedback-readiness -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
    'npm.cmd run pt028:feedback-calibration -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
    'npm.cmd run pt028:final-acceptance -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json'
  ]
};

const manifestPath = path.join(outputDir, 'pt028-real-observation-gui-states.json');
const markdownPath = path.join(outputDir, 'pt028-real-observation-gui-states.md');
const latestPath = path.join(root, 'runtime', 'pt028-real-observation-gui-states', 'latest.json');
ensureDir(path.dirname(latestPath));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
writeFileSync(markdownPath, renderManifestMarkdown(manifest), 'utf8');
writeFileSync(latestPath, `${JSON.stringify({
  ...manifest,
  output_paths: {
    json_path: manifestPath,
    markdown_path: markdownPath,
    latest_path: latestPath
  }
}, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  command: 'write-pt028-real-observation-gui-states',
  manifest_id: manifest.manifest_id,
  gate_decision: manifest.gate_decision,
  generated_state_count: manifest.summary.generated_state_count,
  failed_candidate_count: manifest.summary.failed_candidate_count,
  target_coverage_status: manifest.target_coverage.status,
  observed_unique_target_count: manifest.target_coverage.observed_unique_target_count,
  required_unique_target_count: manifest.target_coverage.required_unique_target_count,
  event_count: manifest.event_stream?.event_count ?? 0,
  window_count: manifest.event_stream?.window_count ?? 0,
  target_count: manifest.event_stream?.target_count ?? 0,
  real_execution_allowed: manifest.real_execution_allowed,
  real_send_attempted: manifest.real_send_attempted,
  writes_real_feedback_target: manifest.writes_real_feedback_target,
  json_path: manifestPath,
  markdown_path: markdownPath,
  latest_path: latestPath
}, null, 2));

if (manifest.summary.generated_state_count === 0) {
  process.exitCode = 1;
}
