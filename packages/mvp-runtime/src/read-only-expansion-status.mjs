import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzePilotIntakeReadiness,
  normalizePilotImportBatch
} from '../../storage-runtime/src/index.mjs';
import { summarizeObservationDeduplication } from '../../intake-runtime/src/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function projectRoot() {
  return path.resolve(here, '../../..');
}

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

function readJsonSafe(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function relativePath(root, filePath) {
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

function newestFile(files) {
  return files
    .filter((filePath) => existsSync(filePath))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .at(0) ?? null;
}

function summarizeRealObservations(root) {
  const files = walkFiles(path.join(root, 'runtime'), (filePath) =>
    path.basename(filePath) === 'intake-observation.real.json'
  ).sort();
  const parsedItems = files.map((filePath) => {
    const observation = readJsonSafe(filePath);
    return { filePath, observation };
  });
  const validItems = parsedItems.filter((item) => item.observation);
  const deduplication = summarizeObservationDeduplication({
    observations: validItems.map((item) => item.observation),
    observationPaths: validItems.map((item) => relativePath(root, item.filePath))
  });
  const fingerprintByPath = new Map(deduplication.entries.map((entry) => [
    entry.path,
    entry.content_fingerprint
  ]));
  const effectivePathSet = new Set(deduplication.effective_observation_paths);
  const observations = parsedItems.map(({ filePath, observation }) => {
    const relative = relativePath(root, filePath);
    return {
      path: relative,
      modified_at_ms: existsSync(filePath) ? statSync(filePath).mtimeMs : null,
      observation_id: observation?.observation_id ?? null,
      source_adapter_id: observation?.source_adapter_id ?? null,
      source_type: observation?.source_type ?? null,
      platform: observation?.platform ?? null,
      source_actor_type: observation?.source_actor_type ?? observation?.metadata?.source_actor_type ?? 'unknown',
      content_fingerprint: fingerprintByPath.get(relative) ?? null,
      privacy_level: observation?.privacy_level ?? null,
      real_execution_allowed: observation?.metadata?.real_execution_allowed === true,
      real_send_attempted: observation?.metadata?.real_send_attempted === true,
      parsed: Boolean(observation)
    };
  });
  const observationGroups = deduplication.observation_groups;
  const duplicateObservationGroups = deduplication.duplicate_observation_groups;
  const duplicateObservationIds = duplicateObservationGroups
    .map(({ observation_id, count, dedupe_level }) => ({ observation_id, count, dedupe_level }));
  const effectiveObservations = observations.filter((item) =>
    !item.parsed || effectivePathSet.has(item.path)
  );
  const sourceBreakdown = observations.reduce((acc, item) => {
    const key = `${item.source_type ?? 'unknown'}:${item.platform ?? 'unknown'}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const effectiveSourceBreakdown = effectiveObservations.reduce((acc, item) => {
    const key = `${item.source_type ?? 'unknown'}:${item.platform ?? 'unknown'}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const nonWechat = observations.filter((item) =>
    item.platform && item.platform !== 'wechat'
  );
  const effectiveNonWechat = effectiveObservations.filter((item) =>
    item.platform && item.platform !== 'wechat'
  );
  return {
    observation_count: observations.length,
    unique_observation_count: effectiveObservations.length,
    effective_observation_count: effectiveObservations.length,
    duplicate_suppressed_count: observations.length - effectiveObservations.length,
    duplicate_observation_ids: duplicateObservationIds,
    duplicate_observation_groups: duplicateObservationGroups,
    content_fingerprint_duplicate_groups: deduplication.content_fingerprint_duplicate_groups,
    observation_groups: observationGroups,
    source_breakdown: sourceBreakdown,
    effective_source_breakdown: effectiveSourceBreakdown,
    non_wechat_observation_count: nonWechat.length,
    effective_non_wechat_observation_count: effectiveNonWechat.length,
    real_send_attempted: observations.some((item) => item.real_send_attempted),
    real_execution_allowed: observations.some((item) => item.real_execution_allowed),
    effective_observations: effectiveObservations,
    observations
  };
}

function summarizePilotImport(root, pilotImportPath) {
  if (!existsSync(pilotImportPath)) {
    return {
      path: relativePath(root, pilotImportPath),
      exists: false,
      ready_for_decision_trial: false,
      ready_for_closed_loop_mvp: false,
      required_failures: ['pilot_import_missing']
    };
  }
  const batch = readJson(pilotImportPath);
  const normalized = normalizePilotImportBatch(batch);
  const readiness = analyzePilotIntakeReadiness(normalized, {
    inputPath: relativePath(root, pilotImportPath)
  });
  return {
    path: relativePath(root, pilotImportPath),
    exists: true,
    import_id: normalized.import_id,
    raw_event_count: normalized.raw_events.length,
    semantic_event_count: normalized.semantic_events.length,
    feedback_count: normalized.feedback_records.length,
    gate_decision: readiness.gate_decision,
    ready_for_decision_trial: readiness.ready_for_decision_trial,
    ready_for_closed_loop_mvp: readiness.ready_for_closed_loop_mvp,
    required_failures: readiness.required_failures,
    recommended_failures: readiness.recommended_failures
  };
}

function summarizeLatestGeneratedBatch(root) {
  const latest = newestFile([
    ...walkFiles(
      path.join(root, 'runtime/desktop-context-bridges'),
      (filePath) => path.basename(filePath) === 'pilot-import.generated.json'
    ),
    ...walkFiles(
      path.join(root, 'runtime/read-only-expansion-trials'),
      (filePath) => path.basename(filePath) === 'pilot-import.generated.json'
    )
  ]);
  return latest
    ? summarizePilotImport(root, latest)
    : {
      path: null,
      exists: false,
      ready_for_decision_trial: false,
      ready_for_closed_loop_mvp: false,
      required_failures: ['generated_pilot_import_missing']
    };
}

function summarizeLatestGraphVerification(root) {
  const latest = newestFile([
    ...walkFiles(
      path.join(root, 'runtime/desktop-context-bridges'),
      (filePath) => path.basename(filePath) === 'read-only-expansion-graph-loop-verification.json'
    ),
    ...walkFiles(
      path.join(root, 'runtime/read-only-expansion-trials'),
      (filePath) => path.basename(filePath) === 'read-only-expansion-graph-loop-verification.json'
    )
  ]);
  const report = latest ? readJsonSafe(latest) : null;
  return {
    path: relativePath(root, latest),
    exists: Boolean(report),
    gate_decision: report?.gate_decision ?? 'missing',
    required_failures: report?.required_failures ?? ['graph_loop_verification_missing'],
    real_execution_allowed: report?.real_execution_allowed === true,
    real_send_attempted: report?.real_send_attempted === true,
    closed_loop_complete: report?.graph_closed_loop?.quality?.closed_loop_complete === true,
    completed_expert_count: report?.graph_closed_loop?.path?.expert_weight_judgment?.completed_expert_count ?? 0,
    writeback_complete: report?.graph_closed_loop?.path?.feedback_writeback?.writeback_complete === true,
    current_sample_ready_for_closed_loop: report?.read_only_expansion?.pilot_import?.ready_for_closed_loop_mvp === true
  };
}

function summarizeLatestDuplicateConfirmation(root, realObservations) {
  const latest = walkFiles(
    path.join(root, 'runtime/read-only-duplicate-observation-confirmations'),
    (filePath) => path.basename(filePath) === 'read-only-duplicate-observation-confirmation.json'
  )
    .filter((filePath) => {
      const report = readJsonSafe(filePath);
      return path.resolve(report?.source?.root ?? root) === path.resolve(root);
    })
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .at(0) ?? null;
  const report = latest ? readJsonSafe(latest) : null;
  const currentDuplicateIds = (realObservations.duplicate_observation_groups ?? [])
    .map((group) => group.observation_id)
    .filter(Boolean)
    .sort();
  const acceptedIds = (report?.groups ?? [])
    .filter((group) => group.accepted === true)
    .map((group) => group.observation_id)
    .filter(Boolean)
    .sort();
  const currentGroupsConfirmed = currentDuplicateIds.length > 0
    && report?.summary?.duplicate_suppression_confirmed === true
    && currentDuplicateIds.every((id) => acceptedIds.includes(id));

  return {
    path: relativePath(root, latest),
    exists: Boolean(report),
    confirmation_id: report?.confirmation_id ?? null,
    gate_decision: report?.gate_decision ?? 'missing',
    duplicate_suppression_confirmed: report?.summary?.duplicate_suppression_confirmed === true,
    current_duplicate_groups_confirmed: currentGroupsConfirmed,
    current_duplicate_observation_ids: currentDuplicateIds,
    accepted_observation_ids: acceptedIds,
    required_failures: report?.required_failures ?? ['duplicate_confirmation_missing'],
    warning_failures: report?.warning_failures ?? []
  };
}

function summarizeSourceAdapterKits(root) {
  const kitFiles = walkFiles(path.join(root, 'runtime/source-adapter-kits'), (filePath) =>
    path.basename(filePath) === 'source-adapter-init-kit.json'
  );
  return kitFiles.map((filePath) => {
    const kit = readJsonSafe(filePath);
    return {
      path: relativePath(root, filePath),
      kit_id: kit?.kit_id ?? null,
      adapter_id: kit?.adapter_id ?? null,
      source_type: kit?.source_type ?? null,
      platform: kit?.platform ?? null,
      can_send_requested: kit?.can_send_requested === true,
      real_execution_default: kit?.safety_defaults?.real_execution_default === true,
      observation_real_execution_allowed: kit?.safety_defaults?.observation_real_execution_allowed === true,
      validation_command: kit?.validation_command ?? null
    };
  }).sort((a, b) => (a.adapter_id ?? '').localeCompare(b.adapter_id ?? ''));
}

function summarizeAdapterConformance(root) {
  const conformanceFiles = walkFiles(path.join(root, 'runtime/source-adapter-conformance'), (filePath) =>
    path.basename(filePath) === 'source-adapter-conformance.json'
  );
  return conformanceFiles.map((filePath) => {
    const conformance = readJsonSafe(filePath);
    return {
      path: relativePath(root, filePath),
      validation_id: conformance?.validation_id ?? null,
      adapter_id: conformance?.adapter_id ?? null,
      source_type: conformance?.source_type ?? null,
      platform: conformance?.platform ?? null,
      ready_for_intake: conformance?.ready_for_intake === true,
      gate_decision: conformance?.gate_decision ?? null,
      required_failures: conformance?.required_failures ?? []
    };
  }).filter((item) => item.validation_id);
}

function hasKit(kits, predicate) {
  return kits.some((kit) =>
    predicate(kit)
      && kit.can_send_requested === false
      && kit.real_execution_default === false
      && kit.observation_real_execution_allowed === false
  );
}

function hasConformance(conformance, predicate) {
  return conformance.some((item) => predicate(item) && item.ready_for_intake === true && item.required_failures.length === 0);
}

function makeCheck({ checkId, passed, evidence, severity = 'required' }) {
  return {
    check_id: checkId,
    severity,
    status: passed ? 'pass' : 'fail',
    passed: Boolean(passed),
    evidence
  };
}

export function buildReadOnlyExpansionStatus({
  root = projectRoot(),
  pilotImportPath = path.join(root, 'runtime/user-inputs/pilot-import.real.json')
} = {}) {
  const realObservations = summarizeRealObservations(root);
  const currentPilotImport = summarizePilotImport(root, pilotImportPath);
  const generatedPilotImport = summarizeLatestGeneratedBatch(root);
  const graphVerification = summarizeLatestGraphVerification(root);
  const duplicateConfirmation = summarizeLatestDuplicateConfirmation(root, realObservations);
  const sourceAdapterKits = summarizeSourceAdapterKits(root);
  const sourceAdapterConformance = summarizeAdapterConformance(root);

  const browserTemplateReady = hasKit(sourceAdapterKits, (kit) => kit.source_type === 'browser' && kit.platform === 'web');
  const chatExportTemplateReady = hasKit(sourceAdapterKits, (kit) => kit.source_type === 'file' && kit.platform === 'external_chat_export');
  const businessApiTemplateReady = hasKit(sourceAdapterKits, (kit) => kit.source_type === 'api' && kit.platform === 'business_system');
  const browserConformanceReady = hasConformance(sourceAdapterConformance, (item) => item.source_type === 'browser' && item.platform === 'web');
  const chatExportConformanceReady = hasConformance(sourceAdapterConformance, (item) => item.source_type === 'file' && item.platform === 'external_chat_export');
  const businessApiConformanceReady = hasConformance(sourceAdapterConformance, (item) => item.source_type === 'api' && item.platform === 'business_system');
  const requiredFutureSources = [
    {
      source: 'browser_web',
      template_ready: browserTemplateReady,
      conformance_ready: browserConformanceReady,
      real_sample_present: realObservations.effective_observations.some((item) => item.source_type === 'browser' && item.platform === 'web')
    },
    {
      source: 'external_chat_export',
      template_ready: chatExportTemplateReady,
      conformance_ready: chatExportConformanceReady,
      real_sample_present: realObservations.effective_observations.some((item) => item.platform === 'external_chat_export')
    },
    {
      source: 'business_system_api',
      template_ready: businessApiTemplateReady,
      conformance_ready: businessApiConformanceReady,
      real_sample_present: realObservations.effective_observations.some((item) => item.source_type === 'api' && item.platform === 'business_system')
    }
  ];

  const checks = [
    makeCheck({
      checkId: 'real_read_only_observations_present',
      passed: realObservations.observation_count > 0,
      evidence: [
        `observations=${realObservations.observation_count}`,
        `effective=${realObservations.effective_observation_count}`,
        `duplicates_suppressed=${realObservations.duplicate_suppressed_count}`
      ]
    }),
    makeCheck({
      checkId: 'real_observations_do_not_send',
      passed: realObservations.real_send_attempted === false && realObservations.real_execution_allowed === false,
      evidence: [
        `real_send_attempted=${realObservations.real_send_attempted}`,
        `real_execution_allowed=${realObservations.real_execution_allowed}`
      ]
    }),
    makeCheck({
      checkId: 'current_pilot_import_ready_for_closed_loop',
      passed: currentPilotImport.ready_for_closed_loop_mvp === true && currentPilotImport.required_failures.length === 0,
      evidence: [
        `gate_decision=${currentPilotImport.gate_decision}`,
        `raw_events=${currentPilotImport.raw_event_count ?? 0}`,
        `feedback=${currentPilotImport.feedback_count ?? 0}`
      ]
    }),
    makeCheck({
      checkId: 'generated_expansion_batch_ready_for_decision',
      passed: generatedPilotImport.ready_for_decision_trial === true && generatedPilotImport.required_failures.length === 0,
      evidence: [
        `path=${generatedPilotImport.path ?? 'missing'}`,
        `gate_decision=${generatedPilotImport.gate_decision ?? 'missing'}`,
        `ready_for_closed_loop_mvp=${generatedPilotImport.ready_for_closed_loop_mvp}`
      ]
    }),
    makeCheck({
      checkId: 'graph_loop_current_sample_verified',
      passed: graphVerification.closed_loop_complete === true
        && graphVerification.writeback_complete === true
        && graphVerification.required_failures.length === 0
        && graphVerification.real_send_attempted === false,
      evidence: [
        `gate_decision=${graphVerification.gate_decision}`,
        `closed_loop_complete=${graphVerification.closed_loop_complete}`,
        `expert_count=${graphVerification.completed_expert_count}`,
        `writeback_complete=${graphVerification.writeback_complete}`,
        `real_send_attempted=${graphVerification.real_send_attempted}`
      ]
    }),
    makeCheck({
      checkId: 'future_source_templates_available',
      passed: browserTemplateReady && chatExportTemplateReady && businessApiTemplateReady,
      evidence: [
        `browser_template=${browserTemplateReady}`,
        `chat_export_template=${chatExportTemplateReady}`,
        `business_api_template=${businessApiTemplateReady}`
      ]
    }),
    makeCheck({
      checkId: 'browser_adapter_gate_verified',
      passed: browserConformanceReady,
      evidence: [`browser_conformance_ready=${browserConformanceReady}`]
    }),
    ...requiredFutureSources.map((item) => makeCheck({
      checkId: `${item.source}_real_sample_present`,
      severity: 'warning',
      passed: item.real_sample_present,
      evidence: [
        `template_ready=${item.template_ready}`,
        `conformance_ready=${item.conformance_ready}`,
        `real_sample_present=${item.real_sample_present}`
      ]
    })),
    makeCheck({
      checkId: 'non_wechat_real_sample_pending',
      severity: 'warning',
      passed: realObservations.effective_non_wechat_observation_count > 0,
      evidence: [
        `non_wechat_real_observations=${realObservations.non_wechat_observation_count}`,
        `effective_non_wechat_real_observations=${realObservations.effective_non_wechat_observation_count}`
      ]
    }),
    makeCheck({
      checkId: 'duplicate_observation_ids_need_review',
      severity: 'warning',
      passed: realObservations.duplicate_observation_ids.length === 0
        || duplicateConfirmation.current_duplicate_groups_confirmed === true,
      evidence: [
        `duplicate_groups=${realObservations.duplicate_observation_ids.length}`,
        `confirmation_id=${duplicateConfirmation.confirmation_id ?? 'missing'}`,
        `current_duplicate_groups_confirmed=${duplicateConfirmation.current_duplicate_groups_confirmed}`
      ]
    })
  ];
  const requiredFailures = checks
    .filter((check) => check.severity === 'required' && !check.passed)
    .map((check) => check.check_id);
  const warningFailures = checks
    .filter((check) => check.severity === 'warning' && !check.passed)
    .map((check) => check.check_id);
  const currentEvidenceReady = requiredFailures.length === 0;
  const requiredFutureSourcesReady = requiredFutureSources.every((item) => item.real_sample_present);
  const duplicateConfirmationPending = realObservations.duplicate_observation_ids.length > 0
    && duplicateConfirmation.current_duplicate_groups_confirmed !== true;
  const goalComplete = currentEvidenceReady
    && requiredFutureSourcesReady
    && (
      realObservations.duplicate_observation_ids.length === 0
      || duplicateConfirmation.current_duplicate_groups_confirmed === true
    );
  const goalStatus = (() => {
    if (goalComplete) return 'all_requested_read_only_sources_have_evidence';
    if (!currentEvidenceReady) return 'in_progress_current_evidence_needs_attention';
    if (!requiredFutureSourcesReady) return 'in_progress_waiting_required_future_source_samples';
    if (duplicateConfirmationPending) return 'in_progress_waiting_duplicate_observation_confirmation';
    return 'in_progress_waiting_operator_review';
  })();
  const futureSourceActionById = {
    browser_web: 'Collect one browser DOM real observation and validate it with source_adapter_conformance.v1.',
    external_chat_export: 'Run npm run intake:external-chat:export -- --file=<chat-export.txt> for one external chat export observation, then validate it with source_adapter_conformance.v1.',
    business_system_api: 'Run npm run intake:business-api:snapshot -- --json=<snapshot.json> for one business-system API observation, then validate it with source_adapter_conformance.v1.'
  };
  const missingFutureSourceActions = requiredFutureSources
    .filter((item) => !item.real_sample_present)
    .map((item) => futureSourceActionById[item.source])
    .filter(Boolean);
  const duplicateReviewActions = realObservations.duplicate_observation_ids.length
    && duplicateConfirmation.current_duplicate_groups_confirmed !== true
    ? ['Review duplicate observation IDs by running npm run intake:read-only:duplicate:review -- --fail-on-required, then have the operator confirm whether duplicate suppression is acceptable before treating sample growth as complete.']
    : [];
  const feedbackAppendAction = generatedPilotImport.exists
    ? `Run npm run pilot:feedback:append -- --pilot-import=${generatedPilotImport.path} to write a feedback template, then re-run with --feedback=<feedback.json> after real reviewed feedback is available.`
    : 'Generate an expanded PilotImportBatch first, then run npm run pilot:feedback:append -- --pilot-import=<PilotImportBatch.json>.';

  return {
    schema_version: 'read_only_expansion_status.v1',
    status_id: `read_only_expansion_status_${timestampId()}`,
    created_at: nowIso(),
    gate_decision: requiredFailures.length
      ? 'read_only_expansion_status_needs_attention'
      : 'read_only_expansion_ready_for_next_source_sample',
    goal_complete: goalComplete,
    goal_status: goalStatus,
    real_execution_allowed: false,
    real_send_attempted: false,
    source: {
      root,
      pilot_import_path: relativePath(root, pilotImportPath)
    },
    current_samples: {
      real_observations: realObservations,
      current_pilot_import: currentPilotImport,
      latest_generated_pilot_import: generatedPilotImport
    },
    graph_loop: graphVerification,
    duplicate_confirmation: duplicateConfirmation,
    future_intake: {
      source_adapter_kits: sourceAdapterKits,
      source_adapter_conformance: sourceAdapterConformance,
      required_future_sources: requiredFutureSources,
      reusable_gate_sequence: [
        'SourceAdapterCapability',
        'IntakeObservation',
        'source_adapter_conformance.v1',
        'RawEvent',
        'PilotImportBatch',
        'pilot_intake_readiness.v1',
        'mvp_loop_from_pilot_import'
      ]
    },
    checks,
    required_failures: requiredFailures,
    warning_failures: warningFailures,
    next_actions: currentEvidenceReady
      ? [
        ...missingFutureSourceActions,
        ...duplicateReviewActions,
        feedbackAppendAction
      ]
      : [
        'Fix required failures before adding more sources.',
        'Re-run npm run intake:read-only:status after refreshing observations or PilotImportBatch.'
      ],
    stop_or_adjust_when: [
      'Any observation sets real_send_attempted=true.',
      'A new adapter bypasses SourceAdapterCapability or IntakeObservation.',
      'A generated PilotImportBatch has required_failures before decision trial.',
      'A closed-loop claim has no feedback_writeback evidence.'
    ]
  };
}

export function renderReadOnlyExpansionStatusMarkdown(status) {
  const checks = status.checks
    .map((check) => `| ${check.check_id} | ${check.severity} | ${check.status} | ${check.evidence.join('<br>')} |`)
    .join('\n');
  const sources = status.future_intake.required_future_sources
    .map((item) => `| ${item.source} | ${item.template_ready ? 'yes' : 'no'} | ${item.conformance_ready ? 'yes' : 'no'} | ${item.real_sample_present ? 'yes' : 'no'} |`)
    .join('\n');
  const duplicateGroups = status.current_samples.real_observations.duplicate_observation_groups ?? [];
  const duplicateTable = duplicateGroups.length
    ? duplicateGroups
      .map((item) => `| ${item.observation_id} | ${item.count} | ${item.platform ?? 'unknown'} | ${item.paths.join('<br>')} |`)
      .join('\n')
    : '| none | 0 | none | none |';

  return `# Read-only Expansion Status

- status_id: ${status.status_id}
- gate_decision: ${status.gate_decision}
- goal_complete: ${status.goal_complete}
- goal_status: ${status.goal_status}
- real_execution_allowed: ${status.real_execution_allowed}
- real_send_attempted: ${status.real_send_attempted}

## Current Samples

- real_observations: ${status.current_samples.real_observations.observation_count}
- effective_observations: ${status.current_samples.real_observations.effective_observation_count}
- duplicate_suppressed_count: ${status.current_samples.real_observations.duplicate_suppressed_count}
- non_wechat_real_observations: ${status.current_samples.real_observations.non_wechat_observation_count}
- effective_non_wechat_real_observations: ${status.current_samples.real_observations.effective_non_wechat_observation_count}
- current_pilot_import: ${status.current_samples.current_pilot_import.import_id ?? 'missing'}
- latest_generated_pilot_import: ${status.current_samples.latest_generated_pilot_import.import_id ?? 'missing'}

## Graph Loop

- path: ${status.graph_loop.path ?? 'missing'}
- gate_decision: ${status.graph_loop.gate_decision}
- closed_loop_complete: ${status.graph_loop.closed_loop_complete}
- completed_expert_count: ${status.graph_loop.completed_expert_count}
- writeback_complete: ${status.graph_loop.writeback_complete}

## Duplicate Confirmation

- path: ${status.duplicate_confirmation.path ?? 'missing'}
- gate_decision: ${status.duplicate_confirmation.gate_decision}
- current_duplicate_groups_confirmed: ${status.duplicate_confirmation.current_duplicate_groups_confirmed}
- duplicate_suppression_confirmed: ${status.duplicate_confirmation.duplicate_suppression_confirmed}

## Future Sources

| source | template | conformance | real sample |
| --- | --- | --- | --- |
${sources}

## Duplicate Observation Groups

| observation_id | count | platform | paths |
| --- | --- | --- | --- |
${duplicateTable}

## Checks

| check_id | severity | status | evidence |
| --- | --- | --- | --- |
${checks}

## Next Actions

${status.next_actions.map((item) => `- ${item}`).join('\n')}
`;
}

export function writeReadOnlyExpansionStatus({
  status,
  outputDir = path.join(projectRoot(), 'runtime/read-only-expansion-status', status.status_id)
}) {
  ensureDir(outputDir);
  const jsonPath = path.join(outputDir, 'read-only-expansion-status.json');
  const markdownPath = path.join(outputDir, 'read-only-expansion-status.md');
  writeFileSync(jsonPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderReadOnlyExpansionStatusMarkdown(status), 'utf8');
  return {
    output_dir: outputDir,
    json_path: jsonPath,
    markdown_path: markdownPath
  };
}
