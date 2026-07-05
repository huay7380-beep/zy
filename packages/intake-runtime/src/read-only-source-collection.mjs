import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mapObservationToRawEvent } from './raw-event-mapper.mjs';
import { stableSlug } from './intake-normalizer.mjs';
import { validateSourceAdapterConformance } from './adapter-conformance.mjs';
import { writeBrowserHtmlObservation } from './browser-html-observation.mjs';
import {
  writeBusinessApiSnapshotObservation,
  writeExternalChatExportObservation
} from './saved-source-observation.mjs';

function nowIso() {
  return new Date().toISOString();
}

function timestampId(date = new Date()) {
  return date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function relativeOrOriginal(root, filePath) {
  if (!filePath) return null;
  const relative = path.relative(root, filePath);
  return relative.startsWith('..') ? filePath : relative.replaceAll(path.sep, '/');
}

function normalizeParticipants(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return undefined;
}

function normalizeSourceKind(kind) {
  const normalized = String(kind ?? '').trim().toLowerCase();
  const aliases = {
    chat_export: 'external_chat_export',
    external_chat: 'external_chat_export',
    external_chat_file: 'external_chat_export',
    web_html: 'browser_html',
    saved_page_html: 'browser_html',
    browser: 'browser_html',
    business_api: 'business_api_snapshot',
    api_snapshot: 'business_api_snapshot',
    business_snapshot: 'business_api_snapshot'
  };
  return aliases[normalized] ?? normalized;
}

function sourceFile(source) {
  return source.file
    ?? source.path
    ?? source.html
    ?? source.json
    ?? source.export_path
    ?? source.snapshot_path
    ?? null;
}

function sourceIdFor(source, index) {
  return source.source_id
    ?? source.id
    ?? `${normalizeSourceKind(source.source_kind ?? source.kind ?? source.type) || 'source'}_${index + 1}`;
}

function sourceOutputDir({ outputDir, sourceId, sourceKind }) {
  return path.join(outputDir, 'observations', `${stableSlug(sourceId)}_${stableSlug(sourceKind)}`);
}

function capabilityForObservation(observation) {
  const common = {
    adapter_id: observation.source_adapter_id,
    adapter_version: 'manifest',
    source_type: observation.source_type,
    platform: observation.platform,
    metadata: {
      real_execution_default: false,
      generated_by: 'read_only_source_collection.v1'
    }
  };
  if (observation.source_type === 'browser') {
    return {
      ...common,
      capabilities: {
        can_receive: true,
        can_send: false,
        can_capture_screenshot: false,
        can_read_dom: true,
        can_identify_thread: true,
        can_verify_target: false,
        requires_user_confirmation: true
      }
    };
  }
  if (observation.source_type === 'api') {
    return {
      ...common,
      capabilities: {
        can_receive: true,
        can_send: false,
        can_capture_screenshot: false,
        can_read_dom: false,
        can_identify_thread: true,
        can_verify_target: true,
        requires_user_confirmation: true
      }
    };
  }
  return {
    ...common,
    capabilities: {
      can_receive: true,
      can_send: false,
      can_capture_screenshot: false,
      can_read_dom: false,
      can_identify_thread: true,
      can_verify_target: false,
      requires_user_confirmation: true
    }
  };
}

function writeSourceObservation({ root, outputDir, source, sourceId, sourceKind }) {
  const fileArg = sourceFile(source);
  if (!fileArg) {
    throw new Error(`source ${sourceId} is missing file/path/html/json`);
  }
  const absoluteSourcePath = path.resolve(root, fileArg);
  const participantHints = normalizeParticipants(source.participants ?? source.participant_hints);
  const common = {
    root,
    outputDir,
    adapterId: source.adapter_id,
    platform: source.platform,
    privacyLevel: source.privacy_level,
    confidence: source.confidence,
    participantHints
  };
  if (sourceKind === 'external_chat_export') {
    return writeExternalChatExportObservation({
      ...common,
      exportPath: absoluteSourcePath,
      threadTitle: source.thread_title,
      threadId: source.thread_id
    });
  }
  if (sourceKind === 'business_api_snapshot') {
    return writeBusinessApiSnapshotObservation({
      ...common,
      snapshotPath: absoluteSourcePath,
      endpoint: source.endpoint,
      recordId: source.record_id,
      threadTitle: source.thread_title
    });
  }
  if (sourceKind === 'browser_html') {
    return writeBrowserHtmlObservation({
      ...common,
      htmlPath: absoluteSourcePath,
      pageUrl: source.url ?? source.page_url
    });
  }
  throw new Error(`unsupported source_kind: ${sourceKind}`);
}

function buildCheck({ checkId, passed, evidence, severity = 'required' }) {
  return {
    check_id: checkId,
    severity,
    status: passed ? 'pass' : 'fail',
    passed: Boolean(passed),
    evidence
  };
}

function coverageWarnings(collected) {
  const presentKinds = new Set(collected.map((item) => item.source_kind));
  return [
    ['external_chat_export', 'external_chat_export_sample_missing'],
    ['browser_html', 'browser_html_sample_missing'],
    ['business_api_snapshot', 'business_api_snapshot_missing']
  ]
    .filter(([kind]) => !presentKinds.has(kind))
    .map(([, warning]) => warning);
}

function sourceKindCounts(collected) {
  return collected.reduce((acc, item) => {
    acc[item.source_kind] = (acc[item.source_kind] ?? 0) + 1;
    return acc;
  }, {});
}

export function buildReadOnlySourceCollection({
  manifest,
  manifestPath = null,
  root = process.cwd(),
  outputDir = null
} = {}) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('buildReadOnlySourceCollection requires a manifest object');
  }
  const sources = Array.isArray(manifest.sources) ? manifest.sources : [];
  const collectionId = manifest.collection_id
    ?? `read_only_source_collection_${timestampId()}`;
  const resolvedOutputDir = outputDir
    ? path.resolve(root, outputDir)
    : path.join(root, 'runtime/read-only-source-collections', collectionId);
  ensureDir(resolvedOutputDir);

  const collected = [];
  const failed = [];
  sources.forEach((source, index) => {
    const sourceId = sourceIdFor(source, index);
    const sourceKind = normalizeSourceKind(source.source_kind ?? source.kind ?? source.type);
    const itemOutputDir = sourceOutputDir({
      outputDir: resolvedOutputDir,
      sourceId,
      sourceKind
    });
    try {
      const written = writeSourceObservation({
        root,
        outputDir: itemOutputDir,
        source,
        sourceId,
        sourceKind
      });
      const rawEvent = mapObservationToRawEvent(written.observation);
      const conformance = validateSourceAdapterConformance({
        capability: capabilityForObservation(written.observation),
        observation: written.observation,
        capabilityPath: `${sourceId}:inline-capability`,
        observationPath: relativeOrOriginal(root, written.observation_path)
      });
      collected.push({
        source_id: sourceId,
        source_kind: sourceKind,
        observation_id: written.observation.observation_id,
        source_adapter_id: written.observation.source_adapter_id,
        source_type: written.observation.source_type,
        platform: written.observation.platform,
        privacy_level: written.observation.privacy_level,
        confidence: written.observation.confidence,
        source_path: relativeOrOriginal(root, path.resolve(root, sourceFile(source))),
        observation_path: relativeOrOriginal(root, written.observation_path),
        report_path: relativeOrOriginal(root, written.report_path),
        markdown_path: relativeOrOriginal(root, written.markdown_path),
        raw_event_id: rawEvent.event_id,
        raw_event_source: rawEvent.source,
        conformance_gate_decision: conformance.gate_decision,
        ready_for_intake: conformance.ready_for_intake,
        required_failures: conformance.required_failures,
        validation_command: written.report.validation_command,
        next_bridge_command: written.report.nextBridgeCommand ?? written.report.next_bridge_command,
        real_execution_allowed: written.observation.metadata?.real_execution_allowed === true,
        real_send_attempted: written.observation.metadata?.real_send_attempted === true
      });
    } catch (error) {
      failed.push({
        source_id: sourceId,
        source_kind: sourceKind || 'unknown',
        source_path: sourceFile(source),
        required_failure: error.message
      });
    }
  });

  const checks = [
    buildCheck({
      checkId: 'manifest_sources_present',
      passed: sources.length > 0,
      evidence: [`sources=${sources.length}`]
    }),
    buildCheck({
      checkId: 'all_sources_collected',
      passed: failed.length === 0 && collected.length === sources.length,
      evidence: [
        `collected=${collected.length}`,
        `failed=${failed.length}`
      ]
    }),
    buildCheck({
      checkId: 'observations_ready_for_intake',
      passed: collected.length > 0
        && collected.every((item) => item.ready_for_intake && item.required_failures.length === 0),
      evidence: [
        `ready=${collected.filter((item) => item.ready_for_intake).length}`,
        `collected=${collected.length}`
      ]
    }),
    buildCheck({
      checkId: 'real_send_blocked',
      passed: collected.every((item) => item.real_execution_allowed === false && item.real_send_attempted === false),
      evidence: [
        `real_execution_allowed=${collected.some((item) => item.real_execution_allowed)}`,
        `real_send_attempted=${collected.some((item) => item.real_send_attempted)}`
      ]
    })
  ];
  const requiredFailures = [
    ...checks.filter((item) => item.severity === 'required' && !item.passed).map((item) => item.check_id),
    ...failed.map((item) => `source_failed:${item.source_id}`)
  ];
  const warningFailures = coverageWarnings(collected);

  return {
    schema_version: 'read_only_source_collection.v1',
    collection_id: collectionId,
    created_at: nowIso(),
    gate_decision: requiredFailures.length
      ? 'read_only_source_collection_needs_attention'
      : 'read_only_source_collection_ready_for_trial',
    real_execution_allowed: false,
    real_send_attempted: false,
    source: {
      root,
      manifest_path: manifestPath ? relativeOrOriginal(root, manifestPath) : null,
      output_dir: resolvedOutputDir
    },
    summary: {
      manifest_sources: sources.length,
      collected_observations: collected.length,
      failed_sources: failed.length,
      source_kind_counts: sourceKindCounts(collected),
      missing_recommended_source_kinds: warningFailures,
      ready_for_read_only_trial: requiredFailures.length === 0 && collected.length > 0
    },
    observations: collected,
    failed_sources: failed,
    checks,
    required_failures: requiredFailures,
    warning_failures: warningFailures,
    next_commands: [
      `npm.cmd run intake:read-only:trial -- --source-dir=${relativeOrOriginal(root, resolvedOutputDir)} --fail-on-required`,
      'npm.cmd run intake:read-only:workpack',
      'npm.cmd run mvp:status'
    ],
    stop_or_adjust_when: [
      'Any source requires opening a live account or clicking a send/submit control.',
      'Any observation sets real_execution_allowed=true or real_send_attempted=true.',
      'Any source bypasses IntakeObservation and RawEvent mapping.',
      'A generated PilotImportBatch is treated as closed-loop ready before real reviewed feedback is appended.'
    ]
  };
}

export function renderReadOnlySourceCollectionMarkdown(collection) {
  const observations = collection.observations.length
    ? collection.observations
      .map((item) => `| ${item.source_id} | ${item.source_kind} | ${item.observation_id} | ${item.ready_for_intake ? 'yes' : 'no'} | ${item.observation_path} |`)
      .join('\n')
    : '| none | none | none | no | none |';
  const failed = collection.failed_sources.length
    ? collection.failed_sources
      .map((item) => `- ${item.source_id}: ${item.required_failure}`)
      .join('\n')
    : '- none';
  const checks = collection.checks
    .map((item) => `- ${item.status.toUpperCase()} ${item.check_id}: ${item.evidence.join('; ')}`)
    .join('\n');
  const trial = collection.downstream_trial
    ? [
      `- requested: ${collection.downstream_trial.requested}`,
      `- skipped: ${collection.downstream_trial.skipped}`,
      `- gate_decision: ${collection.downstream_trial.gate_decision ?? 'not_run'}`,
      `- generated_pilot_import_path: ${collection.downstream_trial.generated_pilot_import_path ?? 'not_available'}`,
      `- graph_loop_verification_path: ${collection.downstream_trial.graph_loop_verification_path ?? 'not_available'}`
    ].join('\n')
    : '- not requested';
  return `# Read-Only Source Collection

- collection_id: ${collection.collection_id}
- gate_decision: ${collection.gate_decision}
- real_execution_allowed: ${collection.real_execution_allowed}
- real_send_attempted: ${collection.real_send_attempted}
- manifest_sources: ${collection.summary.manifest_sources}
- collected_observations: ${collection.summary.collected_observations}
- failed_sources: ${collection.summary.failed_sources}
- ready_for_read_only_trial: ${collection.summary.ready_for_read_only_trial}

## Observations

| source_id | source_kind | observation_id | ready_for_intake | observation_path |
| --- | --- | --- | --- | --- |
${observations}

## Failed Sources

${failed}

## Checks

${checks}

## Downstream Trial

${trial}

## Next Commands

\`\`\`powershell
${collection.next_commands.join('\n')}
\`\`\`
`;
}

export function writeReadOnlySourceCollection({
  collection,
  outputDir = collection.source.output_dir,
  manifest = null
} = {}) {
  ensureDir(outputDir);
  const jsonPath = path.join(outputDir, 'read-only-source-collection.json');
  const markdownPath = path.join(outputDir, 'read-only-source-collection.md');
  const manifestSnapshotPath = manifest
    ? path.join(outputDir, 'manifest.snapshot.json')
    : null;
  writeFileSync(jsonPath, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderReadOnlySourceCollectionMarkdown(collection), 'utf8');
  if (manifestSnapshotPath) {
    writeFileSync(manifestSnapshotPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  return {
    output_dir: outputDir,
    json_path: jsonPath,
    markdown_path: markdownPath,
    manifest_snapshot_path: manifestSnapshotPath
  };
}
