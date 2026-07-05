import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReadOnlyExpansionStatus } from './read-only-expansion-status.mjs';

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

function relativePath(root, filePath) {
  if (!filePath) return null;
  const relative = path.relative(root, filePath);
  return relative.startsWith('..') ? filePath : relative.replaceAll(path.sep, '/');
}

function roundScore(value) {
  return Math.round(value * 1000) / 1000;
}

const weightingDimensions = [
  {
    dimension: 'gap_closure',
    weight: 0.35,
    description: 'How directly the target closes a current status gap or warning.'
  },
  {
    dimension: 'reusable_intake_contract',
    weight: 0.25,
    description: 'How well the target exercises the shared SourceAdapterCapability -> IntakeObservation -> RawEvent -> PilotImportBatch path.'
  },
  {
    dimension: 'graph_loop_value',
    weight: 0.2,
    description: 'How much the target strengthens the dialogue-to-graph-to-expert-to-draft-to-feedback loop.'
  },
  {
    dimension: 'read_only_safety',
    weight: 0.15,
    description: 'Whether the target remains read-only, auditable and send-blocked.'
  },
  {
    dimension: 'operator_effort',
    weight: 0.05,
    description: 'Higher score means the next human/operator step is lightweight and explicit.'
  }
];

function weightedScore(scores) {
  return roundScore(weightingDimensions.reduce((sum, item) =>
    sum + (scores[item.dimension] ?? 0) * item.weight, 0));
}

function makeTarget({
  targetId,
  category,
  title,
  sourceType,
  platform,
  objective,
  status,
  scores,
  evidence,
  commands,
  acceptanceGates,
  blocksClosureUntilDone = false,
  safetyGates = []
}) {
  return {
    target_id: targetId,
    category,
    title,
    source_type: sourceType,
    platform,
    objective,
    status,
    weighted_score: weightedScore(scores),
    scores,
    evidence,
    commands,
    acceptance_gates: acceptanceGates,
    reusable_intake_contract: [
      'SourceAdapterCapability',
      'IntakeObservation',
      'source_adapter_conformance.v1',
      'RawEvent',
      'PilotImportBatch',
      'pilot_intake_readiness.v1',
      'read_only_expansion_trial.v1'
    ],
    safety_gates: [
      'real_execution_allowed=false',
      'real_send_attempted=false',
      'no external command execution',
      'no message send',
      ...safetyGates
    ],
    blocks_closure_until_done: Boolean(blocksClosureUntilDone)
  };
}

function sourceStatus(status, source) {
  return status.future_intake.required_future_sources.find((item) => item.source === source) ?? {};
}

function buildTargetCandidates(status) {
  const currentSamples = status.current_samples;
  const latestGenerated = currentSamples.latest_generated_pilot_import;
  const browserSource = sourceStatus(status, 'browser_web');
  const externalChat = sourceStatus(status, 'external_chat_export');
  const businessApi = sourceStatus(status, 'business_system_api');
  const duplicateGroups = currentSamples.real_observations.duplicate_observation_groups ?? [];
  const duplicateReviewNeeded = resolvedWarning(status, 'duplicate_observation_ids_need_review');
  const targets = [];
  const missingSourceTargets = [
    ['external_chat_export', externalChat.real_sample_present],
    ['browser_html', browserSource.real_sample_present],
    ['business_api_snapshot', businessApi.real_sample_present]
  ].filter(([, present]) => !present).map(([source]) => source);

  if (missingSourceTargets.length >= 2) {
    targets.push(makeTarget({
      targetId: 'read_only_source_collection_manifest_batch',
      category: 'source_collection',
      title: 'Batch collect multiple saved source files through one manifest',
      sourceType: 'mixed',
      platform: 'multi_source',
      objective: 'Prepare a manifest handoff kit, then use one manifest to collect missing external chat exports, saved browser HTML and business-system JSON snapshots into the shared IntakeObservation path.',
      status: 'needed',
      scores: {
        gap_closure: 0.98,
        reusable_intake_contract: 1,
        graph_loop_value: 0.86,
        read_only_safety: 1,
        operator_effort: 0.82
      },
      evidence: [
        `missing_sources=${missingSourceTargets.join(',')}`,
        `external_chat_real_sample_present=${externalChat.real_sample_present === true}`,
        `browser_real_sample_present=${browserSource.real_sample_present === true}`,
        `business_api_real_sample_present=${businessApi.real_sample_present === true}`
      ],
      commands: [
        'npm.cmd run intake:read-only:manifest:init',
        'npm.cmd run intake:read-only:manifest:check -- --manifest=runtime/user-inputs/read-only-source-collection.manifest.json --fail-on-required',
        'npm.cmd run intake:read-only:collect -- --manifest=runtime/user-inputs/read-only-source-collection.manifest.json --run-trial --pilot-import=runtime/user-inputs/pilot-import.real.json --fail-on-required',
        'npm.cmd run intake:read-only:workpack'
      ],
      acceptanceGates: [
        'read_only_source_collection_manifest_kit.v1.target_manifest_intentionally_not_written is true',
        'read_only_source_collection_manifest_readiness.v1.ready_for_collection is true',
        'read_only_source_collection.v1.required_failures is empty',
        'read_only_source_collection.v1.downstream_trial.generated_pilot_import_path exists',
        'read_only_source_collection.v1.downstream_trial.graph_loop_gate_decision is read_only_expansion_graph_loop_verified',
        'runtime/read-only-source-collections/**/intake-observation.real.json exists for each missing source kind',
        'real_send_attempted remains false'
      ],
      blocksClosureUntilDone: true
    }));
  }

  if (!externalChat.real_sample_present) {
    targets.push(makeTarget({
      targetId: 'external_chat_export_real_sample',
      category: 'source_sample',
      title: 'Collect one external chat export sample',
      sourceType: 'file',
      platform: 'external_chat_export',
      objective: 'Use a saved chat export from another chat tool to prove non-WeChat chat data enters the same intake path.',
      status: 'needed',
      scores: {
        gap_closure: 1,
        reusable_intake_contract: 1,
        graph_loop_value: 0.82,
        read_only_safety: 1,
        operator_effort: 0.65
      },
      evidence: [
        `template_ready=${externalChat.template_ready === true}`,
        `conformance_ready=${externalChat.conformance_ready === true}`,
        `real_sample_present=${externalChat.real_sample_present === true}`
      ],
      commands: [
        'npm.cmd run intake:external-chat:export -- --file=<chat-export.txt> --thread-title=<title> --participants=<a,b>',
        'npm.cmd run intake:adapter:validate -- --capability=examples/source-adapter-capability.external-chat-export.sample.json --observation=<external-chat-output>/intake-observation.real.json --fail-on-required',
        'npm.cmd run intake:read-only:trial'
      ],
      acceptanceGates: [
        'runtime/external-chat-intake-real/**/intake-observation.real.json exists',
        'source_adapter_conformance.v1.required_failures is empty',
        'read_only_expansion_trial.v1 includes platform=external_chat_export',
        'real_send_attempted remains false'
      ],
      blocksClosureUntilDone: true
    }));
  }

  if (!businessApi.real_sample_present) {
    targets.push(makeTarget({
      targetId: 'business_system_api_real_sample',
      category: 'source_sample',
      title: 'Collect one business-system API snapshot',
      sourceType: 'api',
      platform: 'business_system',
      objective: 'Use a saved business-system JSON snapshot to prove API-like inputs can reuse the same intake and graph-loop gates.',
      status: 'needed',
      scores: {
        gap_closure: 1,
        reusable_intake_contract: 1,
        graph_loop_value: 0.78,
        read_only_safety: 1,
        operator_effort: 0.6
      },
      evidence: [
        `template_ready=${businessApi.template_ready === true}`,
        `conformance_ready=${businessApi.conformance_ready === true}`,
        `real_sample_present=${businessApi.real_sample_present === true}`
      ],
      commands: [
        'npm.cmd run intake:business-api:snapshot -- --json=<snapshot.json> --endpoint=<endpoint-or-system-name> --record-id=<record-id>',
        'npm.cmd run intake:adapter:validate -- --capability=examples/source-adapter-capability.business-api.sample.json --observation=<business-api-output>/intake-observation.real.json --fail-on-required',
        'npm.cmd run intake:read-only:trial'
      ],
      acceptanceGates: [
        'runtime/business-api-intake-real/**/intake-observation.real.json exists',
        'source_adapter_conformance.v1.required_failures is empty',
        'read_only_expansion_trial.v1 includes source_type=api and platform=business_system',
        'real_send_attempted remains false'
      ],
      blocksClosureUntilDone: true
    }));
  }

  if (!browserSource.real_sample_present) {
    targets.push(makeTarget({
      targetId: 'browser_web_real_sample',
      category: 'source_sample',
      title: 'Collect one saved browser HTML sample',
      sourceType: 'browser',
      platform: 'web',
      objective: 'Use a saved page from a customer portal, CRM page or public business page to prove browser data enters the shared intake path.',
      status: 'needed',
      scores: {
        gap_closure: 0.92,
        reusable_intake_contract: 1,
        graph_loop_value: 0.72,
        read_only_safety: 1,
        operator_effort: 0.74
      },
      evidence: [
        `template_ready=${browserSource.template_ready === true}`,
        `conformance_ready=${browserSource.conformance_ready === true}`,
        `real_sample_present=${browserSource.real_sample_present === true}`
      ],
      commands: [
        'npm.cmd run intake:browser:html -- --html=<saved-page.html> --url=<page-url>',
        'npm.cmd run intake:adapter:validate:browser',
        'npm.cmd run intake:read-only:trial'
      ],
      acceptanceGates: [
        'runtime/browser-intake-real/**/intake-observation.real.json exists',
        'read_only_expansion_status.v1 browser_web_real_sample_present passes',
        'real_send_attempted remains false'
      ],
      blocksClosureUntilDone: true
    }));
  } else {
    targets.push(makeTarget({
      targetId: 'browser_web_second_scenario_sample',
      category: 'sample_diversity',
      title: 'Add one second browser scenario sample',
      sourceType: 'browser',
      platform: 'web',
      objective: 'Broaden the existing browser evidence with a different web source, such as CRM, order status, ticket detail or public procurement page.',
      status: 'optional_next',
      scores: {
        gap_closure: 0.35,
        reusable_intake_contract: 0.9,
        graph_loop_value: 0.58,
        read_only_safety: 1,
        operator_effort: 0.72
      },
      evidence: [
        `existing_effective_non_wechat=${currentSamples.real_observations.effective_non_wechat_observation_count}`,
        `browser_real_sample_present=${browserSource.real_sample_present === true}`
      ],
      commands: [
        'npm.cmd run intake:browser:html -- --html=<saved-page.html> --url=<page-url>',
        'npm.cmd run intake:read-only:trial'
      ],
      acceptanceGates: [
        'new observation_id is not a duplicate of existing browser sample',
        'read_only_expansion_trial.v1 effective_observation_count increases',
        'real_send_attempted remains false'
      ]
    }));
  }

  if (latestGenerated.exists && latestGenerated.ready_for_closed_loop_mvp !== true) {
    targets.push(makeTarget({
      targetId: 'generated_batch_real_feedback_writeback',
      category: 'feedback_gate',
      title: 'Append reviewed feedback for the generated batch',
      sourceType: 'feedback',
      platform: 'operator_review',
      objective: 'Turn the latest generated PilotImportBatch from decision-trial ready into closed-loop ready by adding real reviewed feedback.',
      status: 'needed',
      scores: {
        gap_closure: 0.86,
        reusable_intake_contract: 0.9,
        graph_loop_value: 1,
        read_only_safety: 1,
        operator_effort: 0.58
      },
      evidence: [
        `pilot_import=${latestGenerated.path}`,
        `feedback_count=${latestGenerated.feedback_count ?? 0}`,
        `ready_for_closed_loop_mvp=${latestGenerated.ready_for_closed_loop_mvp === true}`
      ],
      commands: [
        `npm.cmd run pilot:feedback:append -- --pilot-import=${latestGenerated.path}`,
        `npm.cmd run pilot:feedback:append -- --pilot-import=${latestGenerated.path} --feedback=<reviewed-feedback.json> --output-dir=<feedback-output-dir>`,
        'npm.cmd run pilot:validate -- --input=<feedback-output-dir>/pilot-import.with-feedback.json'
      ],
      acceptanceGates: [
        'reviewed feedback is not an unchanged template',
        'pilot_intake_readiness.v1.ready_for_closed_loop_mvp=true',
        'feedback writeback evidence remains auditable',
        'no real send is inferred from feedback'
      ],
      blocksClosureUntilDone: true
    }));
  }

  if (duplicateGroups.length && duplicateReviewNeeded) {
    targets.push(makeTarget({
      targetId: 'duplicate_observation_quality_review',
      category: 'quality_control',
      title: 'Review duplicate observation groups',
      sourceType: 'audit',
      platform: 'runtime_evidence',
      objective: 'Confirm duplicate observation IDs are repeated evidence, not new samples, before using the expanded sample count for progress claims.',
      status: 'needed',
      scores: {
        gap_closure: 0.52,
        reusable_intake_contract: 0.72,
        graph_loop_value: 0.5,
        read_only_safety: 1,
        operator_effort: 0.78
      },
      evidence: [
        `duplicate_groups=${duplicateGroups.length}`,
        `duplicate_suppressed_count=${currentSamples.real_observations.duplicate_suppressed_count}`
      ],
      commands: [
        'npm.cmd run intake:read-only:status',
        'Inspect duplicate_observation_groups in the latest read-only-expansion-status.json before treating effective sample growth as complete.'
      ],
      acceptanceGates: [
        'duplicates are not counted as new effective observations',
        'original evidence files are retained',
        'future status/trial reports continue to show raw and effective counts separately'
      ],
      blocksClosureUntilDone: true
    }));
  }

  return targets
    .sort((a, b) => b.weighted_score - a.weighted_score || a.target_id.localeCompare(b.target_id))
    .map((target, index) => ({
      ...target,
      rank: index + 1
    }));
}

function resolvedWarning(status, warningId) {
  return (status.warning_failures ?? []).includes(warningId);
}

export function buildReadOnlyExpansionTargets({
  root = projectRoot(),
  pilotImportPath = path.join(root, 'runtime/user-inputs/pilot-import.real.json'),
  status = null
} = {}) {
  const resolvedStatus = status ?? buildReadOnlyExpansionStatus({ root, pilotImportPath });
  const targets = buildTargetCandidates(resolvedStatus);
  const requiredFailures = resolvedStatus.required_failures.map((item) => `status:${item}`);
  const blockingTargets = targets.filter((target) => target.blocks_closure_until_done);
  const topTargets = targets.slice(0, 3);

  return {
    schema_version: 'read_only_expansion_targets.v1',
    target_plan_id: `read_only_expansion_targets_${timestampId()}`,
    created_at: nowIso(),
    gate_decision: requiredFailures.length
      ? 'read_only_expansion_targets_waiting_status_fixes'
      : 'read_only_expansion_targets_ready',
    real_execution_allowed: false,
    real_send_attempted: false,
    source: {
      root,
      pilot_import_path: relativePath(root, pilotImportPath),
      status_id: resolvedStatus.status_id,
      status_gate_decision: resolvedStatus.gate_decision
    },
    status_summary: {
      real_observations: resolvedStatus.current_samples.real_observations.observation_count,
      effective_observations: resolvedStatus.current_samples.real_observations.effective_observation_count,
      duplicate_suppressed_count: resolvedStatus.current_samples.real_observations.duplicate_suppressed_count,
      effective_non_wechat_real_observations: resolvedStatus.current_samples.real_observations.effective_non_wechat_observation_count,
      graph_loop_gate_decision: resolvedStatus.graph_loop.gate_decision,
      graph_loop_closed: resolvedStatus.graph_loop.closed_loop_complete === true,
      generated_pilot_import_path: resolvedStatus.current_samples.latest_generated_pilot_import.path,
      generated_batch_ready_for_decision: resolvedStatus.current_samples.latest_generated_pilot_import.ready_for_decision_trial === true,
      generated_batch_ready_for_closed_loop: resolvedStatus.current_samples.latest_generated_pilot_import.ready_for_closed_loop_mvp === true,
      required_failures: resolvedStatus.required_failures,
      warning_failures: resolvedStatus.warning_failures
    },
    weighting_policy: {
      policy_id: 'read_only_expansion_target_weighting.v1',
      principle: 'Human-style tradeoff: close real evidence gaps first, prefer reusable intake contracts, preserve graph-loop learning value, and keep read-only safety non-negotiable.',
      dimensions: weightingDimensions,
      score_range: [0, 1]
    },
    target_recommendations: targets,
    blocking_target_ids: blockingTargets.map((target) => target.target_id),
    required_failures: requiredFailures,
    warning_failures: resolvedStatus.warning_failures,
    next_actions: topTargets.flatMap((target) =>
      target.target_id === 'read_only_source_collection_manifest_batch'
        ? target.commands.slice(0, 3)
        : target.commands.slice(0, 1)),
    stop_or_adjust_when: [
      'A proposed target requires real sending or external command execution.',
      'A new source skips SourceAdapterCapability or IntakeObservation.',
      'A generated PilotImportBatch is marked closed-loop ready without reviewed feedback.',
      'Duplicate observations are counted as additional effective samples.'
    ]
  };
}

export function renderReadOnlyExpansionTargetsMarkdown(plan) {
  const dimensions = plan.weighting_policy.dimensions
    .map((item) => `| ${item.dimension} | ${item.weight} | ${item.description} |`)
    .join('\n');
  const targets = plan.target_recommendations
    .map((target) => `| ${target.rank} | ${target.target_id} | ${target.category} | ${target.platform} | ${target.weighted_score} | ${target.status} |`)
    .join('\n');
  const targetDetails = plan.target_recommendations
    .map((target) => [
      `### ${target.rank}. ${target.title}`,
      '',
      `- target_id: ${target.target_id}`,
      `- objective: ${target.objective}`,
      `- weighted_score: ${target.weighted_score}`,
      `- blocks_closure_until_done: ${target.blocks_closure_until_done}`,
      '',
      'Commands:',
      ...target.commands.map((command) => `- ${command}`),
      '',
      'Acceptance gates:',
      ...target.acceptance_gates.map((gate) => `- ${gate}`),
      '',
      'Evidence:',
      ...target.evidence.map((item) => `- ${item}`)
    ].join('\n'))
    .join('\n\n');

  return `# Read-Only Expansion Targets

- target_plan_id: ${plan.target_plan_id}
- gate_decision: ${plan.gate_decision}
- real_execution_allowed: ${plan.real_execution_allowed}
- real_send_attempted: ${plan.real_send_attempted}
- status_id: ${plan.source.status_id}
- graph_loop_gate_decision: ${plan.status_summary.graph_loop_gate_decision}

## Status Summary

- real_observations: ${plan.status_summary.real_observations}
- effective_observations: ${plan.status_summary.effective_observations}
- duplicate_suppressed_count: ${plan.status_summary.duplicate_suppressed_count}
- effective_non_wechat_real_observations: ${plan.status_summary.effective_non_wechat_real_observations}
- generated_batch_ready_for_decision: ${plan.status_summary.generated_batch_ready_for_decision}
- generated_batch_ready_for_closed_loop: ${plan.status_summary.generated_batch_ready_for_closed_loop}

## Weighting Policy

| dimension | weight | description |
| --- | --- | --- |
${dimensions}

## Target Ranking

| rank | target | category | platform | score | status |
| --- | --- | --- | --- | --- | --- |
${targets || '| none | none | none | none | 0 | none |'}

## Target Details

${targetDetails || 'No target recommendations.'}

## Next Actions

${plan.next_actions.map((item) => `- ${item}`).join('\n')}
`;
}

export function writeReadOnlyExpansionTargets({
  plan,
  outputDir = path.join(projectRoot(), 'runtime/read-only-expansion-targets', plan.target_plan_id)
}) {
  ensureDir(outputDir);
  const jsonPath = path.join(outputDir, 'read-only-expansion-targets.json');
  const markdownPath = path.join(outputDir, 'read-only-expansion-targets.md');
  writeFileSync(jsonPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderReadOnlyExpansionTargetsMarkdown(plan), 'utf8');
  return {
    output_dir: outputDir,
    json_path: jsonPath,
    markdown_path: markdownPath
  };
}
