import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mapObservationToRawEvent } from './raw-event-mapper.mjs';
import {
  normalizeIntakeObservation,
  nowIso,
  summarizeObservationDeduplication
} from './intake-normalizer.mjs';
import { validateSourceAdapterConformance } from './adapter-conformance.mjs';

function timestampId(date = new Date()) {
  return date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readJsonSafe(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function relativeOrOriginal(root, filePath) {
  if (!filePath) return null;
  const relative = path.relative(root, filePath);
  return relative.startsWith('..') ? filePath : relative.replaceAll(path.sep, '/');
}

function walkFiles(dirPath, matcher, results = []) {
  if (!existsSync(dirPath)) return results;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, matcher, results);
    } else if (!matcher || matcher(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function newestByMtime(files) {
  return files
    .filter((filePath) => existsSync(filePath))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .at(0) ?? null;
}

export const defaultSourceIntakeLanes = [
  {
    lane_id: 'desktop_wechat',
    label: 'Sightflow desktop WeChat',
    source_type: 'desktop',
    platform: 'wechat',
    capability_path: 'examples/source-adapter-capability.sample.json',
    observation_path: 'examples/intake-observation.sightflow.sample.json',
    required_for_current_goal: true
  },
  {
    lane_id: 'browser_web',
    label: 'Saved browser or DOM snapshot',
    source_type: 'browser',
    platform: 'web',
    capability_path: 'examples/source-adapter-capability.browser.sample.json',
    observation_path: 'examples/intake-observation.browser.sample.json',
    required_for_current_goal: true
  },
  {
    lane_id: 'external_chat_export',
    label: 'External chat export file',
    source_type: 'file',
    platform: 'external_chat_export',
    capability_path: 'examples/source-adapter-capability.external-chat-export.sample.json',
    observation_path: 'examples/intake-observation.external-chat-export.sample.json',
    required_for_current_goal: true
  },
  {
    lane_id: 'business_system_api',
    label: 'Saved business-system API snapshot',
    source_type: 'api',
    platform: 'business_system',
    capability_path: 'examples/source-adapter-capability.business-api.sample.json',
    observation_path: 'examples/intake-observation.business-api.sample.json',
    required_for_current_goal: true
  }
];

function conformanceFromSample(root, lane) {
  const capabilityPath = path.resolve(root, lane.capability_path);
  const observationPath = path.resolve(root, lane.observation_path);
  const capability = readJsonSafe(capabilityPath);
  const observation = readJsonSafe(observationPath);
  if (!capability || !observation) {
    return {
      ready_for_intake: false,
      gate_decision: 'source_adapter_not_conformant',
      required_failures: [
        !capability ? 'capability_sample_missing' : null,
        !observation ? 'observation_sample_missing' : null
      ].filter(Boolean),
      capability_path: relativeOrOriginal(root, capabilityPath),
      observation_path: relativeOrOriginal(root, observationPath),
      raw_event_preview_present: false
    };
  }
  const conformance = validateSourceAdapterConformance({
    capability,
    observation,
    capabilityPath: relativeOrOriginal(root, capabilityPath),
    observationPath: relativeOrOriginal(root, observationPath)
  });
  return {
    ready_for_intake: conformance.ready_for_intake,
    gate_decision: conformance.gate_decision,
    required_failures: conformance.required_failures,
    adapter_id: conformance.adapter_id,
    capability_path: relativeOrOriginal(root, capabilityPath),
    observation_path: relativeOrOriginal(root, observationPath),
    raw_event_preview_present: Boolean(conformance.raw_event_preview),
    raw_event_preview_source: conformance.raw_event_preview?.source ?? null
  };
}

function runtimeConformanceForLane(root, lane) {
  const files = walkFiles(path.join(root, 'runtime/source-adapter-conformance'), (filePath) =>
    path.basename(filePath) === 'source-adapter-conformance.json'
  );
  const matching = files
    .map((filePath) => ({ filePath, report: readJsonSafe(filePath) }))
    .filter(({ report }) =>
      report
      && report.source_type === lane.source_type
      && report.platform === lane.platform
    )
    .sort((a, b) => statSync(b.filePath).mtimeMs - statSync(a.filePath).mtimeMs);
  const latest = matching.at(0);
  return latest
    ? {
      path: relativeOrOriginal(root, latest.filePath),
      validation_id: latest.report.validation_id,
      adapter_id: latest.report.adapter_id,
      ready_for_intake: latest.report.ready_for_intake === true,
      gate_decision: latest.report.gate_decision,
      required_failures: latest.report.required_failures ?? [],
      raw_event_preview_present: Boolean(latest.report.raw_event_preview)
    }
    : {
      path: null,
      validation_id: null,
      adapter_id: null,
      ready_for_intake: false,
      gate_decision: 'missing',
      required_failures: ['runtime_conformance_missing'],
      raw_event_preview_present: false
    };
}

function scanObservations(root) {
  return walkFiles(path.join(root, 'runtime'), (filePath) =>
    path.basename(filePath) === 'intake-observation.real.json'
  ).map((filePath) => ({ filePath, observation: readJsonSafe(filePath) }));
}

function observationSummaryForLane(root, lane, allObservations) {
  const matching = allObservations.filter(({ observation }) =>
    observation
    && observation.source_type === lane.source_type
    && observation.platform === lane.platform
  );
  const mapped = matching.map(({ filePath, observation }) => {
    try {
      const normalized = normalizeIntakeObservation(observation);
      const rawEvent = mapObservationToRawEvent(normalized);
      return {
        path: relativeOrOriginal(root, filePath),
        normalized,
        observation_id: normalized.observation_id,
        source_adapter_id: normalized.source_adapter_id,
        source_actor_type: normalized.source_actor_type,
        content_fingerprint: rawEvent.metadata.content_fingerprint,
        raw_event_id: rawEvent.event_id,
        raw_event_source: rawEvent.source,
        can_map_to_raw_event: true,
        real_execution_allowed: normalized.metadata?.real_execution_allowed === true,
        real_send_attempted: normalized.metadata?.real_send_attempted === true
      };
    } catch (error) {
      return {
        path: relativeOrOriginal(root, filePath),
        observation_id: observation?.observation_id ?? null,
        source_adapter_id: observation?.source_adapter_id ?? null,
        raw_event_id: null,
        raw_event_source: null,
        can_map_to_raw_event: false,
        required_failure: error.message,
        real_execution_allowed: observation?.metadata?.real_execution_allowed === true,
        real_send_attempted: observation?.metadata?.real_send_attempted === true
      };
    }
  });
  const validMapped = mapped.filter((item) => item.can_map_to_raw_event);
  const invalidMapped = mapped.filter((item) => !item.can_map_to_raw_event);
  const deduplication = summarizeObservationDeduplication({
    observations: validMapped.map((item) => item.normalized),
    observationPaths: validMapped.map((item) => item.path)
  });
  const effectivePathSet = new Set(deduplication.effective_observation_paths);
  const effective = [
    ...validMapped.filter((item) => effectivePathSet.has(item.path)),
    ...invalidMapped
  ].map(({ normalized, ...item }) => item);
  return {
    raw_observation_count: mapped.length,
    effective_observation_count: effective.length,
    duplicate_suppressed_count: mapped.length - effective.length,
    duplicate_observation_groups: deduplication.duplicate_observation_groups,
    content_fingerprint_duplicate_groups: deduplication.content_fingerprint_duplicate_groups,
    raw_event_mapped_count: effective.filter((item) => item.can_map_to_raw_event).length,
    real_execution_allowed: effective.some((item) => item.real_execution_allowed),
    real_send_attempted: effective.some((item) => item.real_send_attempted),
    latest_observation_path: newestByMtime(matching.map((item) => item.filePath))
      ? relativeOrOriginal(root, newestByMtime(matching.map((item) => item.filePath)))
      : null,
    observations: effective
  };
}

function latestGeneratedPilotImport(root) {
  const files = [
    ...walkFiles(path.join(root, 'runtime/desktop-context-bridges'), (filePath) =>
      path.basename(filePath) === 'pilot-import.generated.json'
    ),
    ...walkFiles(path.join(root, 'runtime/read-only-expansion-trials'), (filePath) =>
      path.basename(filePath) === 'pilot-import.generated.json'
    )
  ];
  const latest = newestByMtime(files);
  const batch = latest ? readJsonSafe(latest) : null;
  return {
    path: relativeOrOriginal(root, latest),
    import_id: batch?.import_id ?? null,
    records: Array.isArray(batch?.records) ? batch.records.length : 0,
    feedback_records: Array.isArray(batch?.feedback_records) ? batch.feedback_records.length : 0,
    record_sources: Array.isArray(batch?.records)
      ? batch.records.map((record) => ({
        record_id: record.record_id,
        source_type: record.source_ref?.source_type ?? null,
        platform: record.source_ref?.platform ?? null
      }))
      : []
  };
}

function lanePilotImportRecords(lane, pilotImport) {
  return pilotImport.record_sources.filter((record) =>
    record.source_type === lane.source_type && record.platform === lane.platform
  );
}

function makeCheck(checkId, passed, evidence, severity = 'required') {
  return {
    check_id: checkId,
    severity,
    status: passed ? 'pass' : 'fail',
    passed: Boolean(passed),
    evidence
  };
}

export function buildSourceIntakeMatrix({
  root = process.cwd(),
  lanes = defaultSourceIntakeLanes
} = {}) {
  const resolvedRoot = path.resolve(root);
  const allObservations = scanObservations(resolvedRoot);
  const pilotImport = latestGeneratedPilotImport(resolvedRoot);
  const laneReports = lanes.map((lane) => {
    const sampleConformance = conformanceFromSample(resolvedRoot, lane);
    const runtimeConformance = runtimeConformanceForLane(resolvedRoot, lane);
    const observations = observationSummaryForLane(resolvedRoot, lane, allObservations);
    const pilotRecords = lanePilotImportRecords(lane, pilotImport);
    const conformanceReady = sampleConformance.ready_for_intake === true
      || runtimeConformance.ready_for_intake === true;
    const rawEventReady = observations.effective_observation_count === 0
      || observations.raw_event_mapped_count === observations.effective_observation_count;
    const sendBlocked = observations.real_execution_allowed === false
      && observations.real_send_attempted === false;
    const requiredFailures = [
      !conformanceReady ? 'lane_conformance_missing' : null,
      !rawEventReady ? 'lane_raw_event_mapping_failed' : null,
      !sendBlocked ? 'lane_real_send_not_blocked' : null
    ].filter(Boolean);
    const warningFailures = [
      lane.required_for_current_goal && observations.effective_observation_count === 0
        ? 'lane_real_observation_missing'
        : null,
      observations.duplicate_observation_groups.length > 0
        ? 'lane_duplicate_observation_review_needed'
        : null,
      pilotRecords.length === 0 && observations.effective_observation_count > 0
        ? 'lane_missing_from_latest_generated_pilot_import'
        : null
    ].filter(Boolean);
    return {
      lane_id: lane.lane_id,
      label: lane.label,
      source_type: lane.source_type,
      platform: lane.platform,
      required_for_current_goal: lane.required_for_current_goal === true,
      gate_decision: requiredFailures.length
        ? 'source_intake_lane_needs_attention'
        : observations.effective_observation_count > 0
          ? 'source_intake_lane_has_real_read_only_sample'
          : 'source_intake_lane_waiting_real_sample',
      sample_conformance: sampleConformance,
      runtime_conformance: runtimeConformance,
      conformance_ready: conformanceReady,
      observations,
      latest_generated_pilot_import: {
        path: pilotImport.path,
        import_id: pilotImport.import_id,
        matching_records: pilotRecords.length,
        record_ids: pilotRecords.map((record) => record.record_id)
      },
      required_failures: requiredFailures,
      warning_failures: warningFailures,
      next_action: observations.effective_observation_count > 0
        ? 'Keep this lane on SourceAdapterCapability -> IntakeObservation -> RawEvent -> PilotImportBatch gates.'
        : `Collect a saved read-only ${lane.label} artifact and convert it into intake-observation.real.json.`
    };
  });

  const checks = [
    makeCheck(
      'all_lanes_have_conformance_gate',
      laneReports.every((lane) => lane.conformance_ready),
      laneReports.map((lane) => `${lane.lane_id}=${lane.conformance_ready}`)
    ),
    makeCheck(
      'real_observations_map_to_raw_event',
      laneReports.every((lane) =>
        lane.observations.effective_observation_count === 0
        || lane.observations.raw_event_mapped_count === lane.observations.effective_observation_count
      ),
      laneReports.map((lane) => `${lane.lane_id}=${lane.observations.raw_event_mapped_count}/${lane.observations.effective_observation_count}`)
    ),
    makeCheck(
      'real_send_blocked_for_all_lanes',
      laneReports.every((lane) =>
        lane.observations.real_execution_allowed === false
        && lane.observations.real_send_attempted === false
      ),
      laneReports.map((lane) => `${lane.lane_id}:allowed=${lane.observations.real_execution_allowed},attempted=${lane.observations.real_send_attempted}`)
    ),
    makeCheck(
      'required_goal_lanes_have_real_read_only_samples',
      laneReports.filter((lane) => lane.required_for_current_goal).every((lane) => lane.observations.effective_observation_count > 0),
      laneReports
        .filter((lane) => lane.required_for_current_goal)
        .map((lane) => `${lane.lane_id}=${lane.observations.effective_observation_count}`),
      'warning'
    ),
    makeCheck(
      'latest_generated_pilot_import_exists',
      Boolean(pilotImport.path && pilotImport.records > 0),
      [
        `path=${pilotImport.path ?? 'missing'}`,
        `records=${pilotImport.records}`
      ],
      'warning'
    )
  ];
  const requiredFailures = [
    ...checks.filter((check) => check.severity === 'required' && !check.passed).map((check) => check.check_id),
    ...laneReports.flatMap((lane) => lane.required_failures.map((failure) => `${lane.lane_id}:${failure}`))
  ];
  const warningFailures = [
    ...checks.filter((check) => check.severity === 'warning' && !check.passed).map((check) => check.check_id),
    ...laneReports.flatMap((lane) => lane.warning_failures.map((failure) => `${lane.lane_id}:${failure}`))
  ];
  const lanesWithRealSamples = laneReports.filter((lane) => lane.observations.effective_observation_count > 0);
  return {
    schema_version: 'source_intake_matrix.v1',
    matrix_id: `source_intake_matrix_${timestampId()}`,
    created_at: nowIso(),
    gate_decision: requiredFailures.length
      ? 'source_intake_matrix_needs_attention'
      : 'source_intake_matrix_ready_waiting_real_samples',
    real_execution_allowed: false,
    real_send_attempted: false,
    source: {
      root: resolvedRoot,
      latest_generated_pilot_import_path: pilotImport.path
    },
    summary: {
      lane_count: laneReports.length,
      conformance_ready_lanes: laneReports.filter((lane) => lane.conformance_ready).length,
      lanes_with_real_samples: lanesWithRealSamples.length,
      required_goal_lanes: laneReports.filter((lane) => lane.required_for_current_goal).length,
      required_goal_lanes_with_real_samples: laneReports
        .filter((lane) => lane.required_for_current_goal && lane.observations.effective_observation_count > 0)
        .length,
      total_effective_observations: laneReports.reduce((sum, lane) => sum + lane.observations.effective_observation_count, 0),
      total_duplicate_suppressed: laneReports.reduce((sum, lane) => sum + lane.observations.duplicate_suppressed_count, 0),
      latest_generated_pilot_import_records: pilotImport.records,
      latest_generated_pilot_import_feedback_records: pilotImport.feedback_records,
      all_real_send_blocked: laneReports.every((lane) =>
        lane.observations.real_execution_allowed === false
        && lane.observations.real_send_attempted === false
      ),
      all_required_goal_lanes_have_real_samples: laneReports
        .filter((lane) => lane.required_for_current_goal)
        .every((lane) => lane.observations.effective_observation_count > 0),
      ready_for_new_adapter_without_main_flow_change: requiredFailures.length === 0
        && laneReports.every((lane) => lane.conformance_ready)
    },
    reusable_gate_sequence: [
      'SourceAdapterCapability',
      'IntakeObservation',
      'source_adapter_conformance.v1',
      'RawEvent',
      'PilotImportBatch',
      'pilot_intake_readiness.v1',
      'mvp_loop_from_pilot_import'
    ],
    lanes: laneReports,
    checks,
    required_failures: requiredFailures,
    warning_failures: warningFailures,
    next_actions: requiredFailures.length
      ? [
        'Fix required failures before adding more software sources.',
        'Do not pass source content directly to decision or sending modules.'
      ]
      : [
        ...laneReports
          .filter((lane) => lane.required_for_current_goal && lane.observations.effective_observation_count === 0)
          .map((lane) => lane.next_action),
        'Append real reviewed feedback to the latest generated PilotImportBatch before marking it closed-loop ready.'
      ],
    stop_or_adjust_when: [
      'A source produces content without SourceAdapterCapability.',
      'An observation cannot map to RawEvent.',
      'Any real observation sets real_execution_allowed=true or real_send_attempted=true.',
      'A new software source requires changing the decision or send workflow before passing intake gates.'
    ]
  };
}

export function renderSourceIntakeMatrixMarkdown(matrix) {
  const laneRows = matrix.lanes
    .map((lane) => `| ${lane.lane_id} | ${lane.source_type}/${lane.platform} | ${lane.conformance_ready ? 'yes' : 'no'} | ${lane.observations.effective_observation_count} | ${lane.latest_generated_pilot_import.matching_records} | ${lane.gate_decision} |`)
    .join('\n');
  const checks = matrix.checks
    .map((check) => `- ${check.status.toUpperCase()} ${check.check_id}: ${check.evidence.join('; ')}`)
    .join('\n');
  return `# Source Intake Matrix

- matrix_id: ${matrix.matrix_id}
- gate_decision: ${matrix.gate_decision}
- real_execution_allowed: ${matrix.real_execution_allowed}
- real_send_attempted: ${matrix.real_send_attempted}
- conformance_ready_lanes: ${matrix.summary.conformance_ready_lanes}/${matrix.summary.lane_count}
- lanes_with_real_samples: ${matrix.summary.lanes_with_real_samples}
- required_goal_lanes_with_real_samples: ${matrix.summary.required_goal_lanes_with_real_samples}/${matrix.summary.required_goal_lanes}
- ready_for_new_adapter_without_main_flow_change: ${matrix.summary.ready_for_new_adapter_without_main_flow_change}

## Lanes

| lane | type/platform | conformance | real samples | generated PilotImport records | gate |
| --- | --- | --- | ---: | ---: | --- |
${laneRows}

## Reusable Gate Sequence

${matrix.reusable_gate_sequence.map((item) => `- ${item}`).join('\n')}

## Checks

${checks}

## Next Actions

${matrix.next_actions.map((item) => `- ${item}`).join('\n')}
`;
}

export function writeSourceIntakeMatrix({
  matrix,
  outputDir = path.resolve('runtime/source-intake-matrix', matrix.matrix_id)
} = {}) {
  ensureDir(outputDir);
  const jsonPath = path.join(outputDir, 'source-intake-matrix.json');
  const markdownPath = path.join(outputDir, 'source-intake-matrix.md');
  writeFileSync(jsonPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderSourceIntakeMatrixMarkdown(matrix), 'utf8');
  return {
    output_dir: outputDir,
    json_path: jsonPath,
    markdown_path: markdownPath
  };
}
