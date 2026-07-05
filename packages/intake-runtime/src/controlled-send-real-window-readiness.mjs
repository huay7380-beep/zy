import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { nowIso } from './intake-normalizer.mjs';
import { buildControlledSendCommandPreflight } from './controlled-send-command-preflight.mjs';

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function relativePath(root, filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function latestRuntimeJson(root, runtimeDir, fileName, { ignoreSimulation = false } = {}) {
  const baseDir = path.resolve(root, runtimeDir);
  if (!existsSync(baseDir)) return null;
  const candidates = readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(baseDir, entry.name, fileName))
    .filter((filePath) => existsSync(filePath))
    .map((filePath) => ({
      filePath,
      payload: readJson(filePath)
    }))
    .filter((candidate) => !ignoreSimulation || !isSimulationArtifact({
      path: relativePath(root, candidate.filePath),
      ...candidate.payload
    }))
    .sort((a, b) => {
      const aTime = a.payload.created_at ?? a.payload.generated_at ?? '';
      const bTime = b.payload.created_at ?? b.payload.generated_at ?? '';
      return String(bTime).localeCompare(String(aTime));
    });
  return candidates[0] ?? null;
}

function artifactPayload(root, runtimeDir, fileName, explicitPath) {
  if (explicitPath) {
    const filePath = path.resolve(explicitPath);
    return {
      path: relativePath(root, filePath),
      ...readJson(filePath)
    };
  }
  const latest = latestRuntimeJson(root, runtimeDir, fileName, { ignoreSimulation: true });
  return latest
    ? {
      path: relativePath(root, latest.filePath),
      ...latest.payload
    }
    : null;
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function summarizeTrial(trial) {
  if (!trial) return null;
  return {
    path: trial.path,
    trial_id: trial.trial_id,
    gate_decision: trial.gate_decision,
    ready_for_real_controlled_send: trial.ready_for_real_controlled_send === true,
    real_send_attempted: trial.real_send_attempted === true,
    required_failures: trial.required_failures ?? [],
    input_path: trial.input_path ?? null,
    command_path: trial.handoff?.command_path ?? trial.input_path ?? null,
    readiness_path: trial.handoff?.readiness_path ?? trial.path ?? null,
    box_regions_path: trial.handoff?.box_regions_path ?? null,
    result_path: trial.handoff?.result_path ?? null,
    runner_environment_contract: trial.handoff?.runner_environment_contract ?? null,
    runner_command_with_box_regions: trial.handoff?.runner_command_with_box_regions ?? null,
    runner_command_with_vision_api: trial.handoff?.runner_command_with_vision_api ?? null,
    completion_command: trial.handoff?.completion_command ?? null,
    audit_command: trial.handoff?.audit_command ?? null
  };
}

function summarizeCompletion(completion) {
  if (!completion) return null;
  return {
    path: completion.path,
    completion_id: completion.completion_id,
    gate_decision: completion.gate_decision,
    real_send_verified: completion.real_send_verified === true,
    required_failures: completion.required_failures ?? []
  };
}

function summarizeHandoff(handoff) {
  if (!handoff) return null;
  return {
    path: handoff.path,
    handoff_id: handoff.handoff_id,
    gate_decision: handoff.gate_decision,
    real_send_verified: handoff.real_send_verified === true,
    real_send_attempted_by_handoff: handoff.real_send_attempted_by_handoff === true,
    latest_controlled_send_material_kit: handoff.latest_controlled_send_material_kit?.path ?? null,
    operator_next_actions: handoff.operator_next_actions ?? [],
    operator_next_steps: handoff.operator_next_steps ?? []
  };
}

function summarizeAudit(audit) {
  if (!audit) return null;
  return {
    path: audit.path,
    audit_id: audit.audit_id,
    gate_decision: audit.gate_decision,
    automated_requirements_ready: audit.automated_requirements_ready === true,
    real_send_verified: audit.real_send_verified === true,
    required_failures: audit.required_failures ?? [],
    external_pending: audit.external_pending ?? []
  };
}

function summarizeMaterialKit(kit) {
  if (!kit) return null;
  return {
    path: kit.path,
    kit_id: kit.kit_id,
    gate_decision: kit.gate_decision,
    real_send_attempted: kit.real_send_attempted === true,
    command_target_path: kit.command_target_path ?? null,
    box_regions_target_path: kit.box_regions_target_path ?? null,
    command_template_path: kit.command_template_path ?? null,
    box_regions_template_path: kit.box_regions_template_path ?? null,
    user_input_command_template_path: kit.user_input_command_template_path ?? null,
    user_input_box_regions_template_path: kit.user_input_box_regions_template_path ?? null,
    operator_checklist_path: kit.operator_checklist_path ?? null
  };
}

function isSimulationMaterialKit(kit) {
  return isSimulationArtifact(kit);
}

function isSimulationArtifact(artifact) {
  const candidates = [
    artifact?.path,
    artifact?.command_target_path,
    artifact?.box_regions_target_path,
    artifact?.command_template_path,
    artifact?.box_regions_template_path,
    artifact?.input_path,
    artifact?.handoff?.command_path,
    artifact?.handoff?.box_regions_path,
    artifact?.handoff?.result_path,
    artifact?.latest_controlled_send_material_kit?.path,
    artifact?.latest_controlled_send_trial?.path,
    artifact?.latest_controlled_send_completion?.path,
    artifact?.verification_mode
  ].filter(Boolean);
  return candidates.some((candidate) => {
    const normalized = String(candidate).replaceAll('\\', '/');
    return normalized.includes('/controlled-send-simulations/')
      || normalized.includes('controlled_send_simulation')
      || normalized === 'simulated';
  });
}

function commandPathFrom({ root, materialKit, commandPath }) {
  return path.resolve(commandPath ?? materialKit?.command_target_path ?? path.join(root, 'runtime/user-inputs/controlled-send-command.real.json'));
}

function boxRegionsPathFrom({ root, materialKit, boxRegionsPath }) {
  return path.resolve(boxRegionsPath ?? materialKit?.box_regions_target_path ?? path.join(root, 'runtime/user-inputs/controlled-send-box-regions.real.json'));
}

function buildRunnerEnvironmentContract({ trial, commandPath, boxRegionsPath, readyForRunner = false }) {
  const readinessPath = trial?.readiness_path ?? null;
  const resultPath = trial?.result_path ?? null;
  const resolvedCommandPath = trial?.command_path ?? commandPath;
  const resolvedBoxRegionsPath = trial?.box_regions_path ?? boxRegionsPath;
  return {
    contract_version: 'controlled_send_runner_environment.v1',
    ready_for_runner: readyForRunner === true,
    required_env: {
      ALLOW_REAL_CONTROLLED_SEND: 'true',
      CONTROLLED_SEND_COMMAND_PATH: resolvedCommandPath,
      CONTROLLED_SEND_READINESS_PATH: readinessPath,
      CONTROLLED_SEND_RESULT_PATH: resultPath
    },
    path_bindings: {
      command_path_must_equal: resolvedCommandPath,
      readiness_path_must_equal: readinessPath,
      result_path_must_equal: resultPath,
      box_regions_path_must_equal: resolvedBoxRegionsPath
    },
    recognition_mode_policy: {
      exactly_one_required: true,
      box_regions_env: 'CONTROLLED_SEND_BOX_REGIONS_PATH',
      box_regions_expected_path: resolvedBoxRegionsPath,
      vision_api_env: 'CONTROLLED_SEND_VISION_API_KEY',
      vision_api_value_placeholder: '<vision_api_key>',
      forbidden_combination: [
        'CONTROLLED_SEND_BOX_REGIONS_PATH',
        'CONTROLLED_SEND_VISION_API_KEY'
      ]
    },
    readiness_gate: {
      schema_version: 'desktop_controlled_send_trial.v1',
      gate_decision: 'controlled_send_ready_for_test_window',
      ready_for_real_controlled_send: true,
      real_send_attempted: false,
      required_failures: []
    },
    command_snapshot_required_fields: [
      'send_command_id',
      'event_id',
      'decision_id',
      'trigger_id',
      'target_platform',
      'target_person_id',
      'target_thread_hint',
      'message_draft_length',
      'message_draft_sha256'
    ],
    operator_rule: 'Run exactly one runner command in the confirmed test account or test window, then run completion_command immediately.'
  };
}

function buildPrepareCommand({ commandPath, boxRegionsPath, requireBoxRegions }) {
  const parts = [
    'npm.cmd run desktop:send:prepare-controlled --',
    `--input=${psQuote(commandPath)}`
  ];
  if (requireBoxRegions) {
    parts.push(`--box-regions=${psQuote(boxRegionsPath)}`);
    parts.push('--require-box-regions');
  }
  parts.push('--fail-on-not-ready');
  return parts.join(' ');
}

function readinessDecision({ materialKit, livePreflight, trial, completion, audit }) {
  if (completion?.real_send_verified === true || audit?.real_send_verified === true) {
    return 'real_window_send_verified';
  }
  if (trial?.ready_for_real_controlled_send === true && livePreflight.ready_for_prepare_controlled === true) {
    return 'real_window_ready_for_runner';
  }
  if (livePreflight.ready_for_prepare_controlled === true) {
    return 'real_window_ready_for_prepare_controlled';
  }
  if (!livePreflight.command_exists) {
    return materialKit ? 'real_window_command_missing' : 'real_window_material_kit_missing';
  }
  return 'real_window_material_needs_attention';
}

function blockersFor({ materialKit, livePreflight, trial, completion, audit }) {
  if (completion?.real_send_verified === true || audit?.real_send_verified === true) {
    return [];
  }
  const blockers = [];
  if (!materialKit) blockers.push('controlled_send_material_kit_missing');
  if (!livePreflight.command_exists) blockers.push('controlled_send_command_missing');
  blockers.push(...(livePreflight.required_failures ?? []));
  if (livePreflight.ready_for_prepare_controlled === true && !trial?.ready_for_real_controlled_send) {
    blockers.push('controlled_send_prepare_controlled_pending');
  }
  if (trial?.ready_for_real_controlled_send === true) {
    blockers.push('sightflow_real_runner_result_pending');
    blockers.push('desktop_controlled_send_completion_pending');
  }
  return [...new Set(blockers)];
}

function nextActionsFor({ gateDecision, materialKit, livePreflight, trial }) {
  if (gateDecision === 'real_window_send_verified') {
    return ['Real controlled send is verified. Run desktop:intake:docs16-status to refresh the final goal snapshot.'];
  }
  if (!materialKit) {
    return ['Run npm.cmd run desktop:send:materials:init to create the command template, box-region template and operator checklist.'];
  }
  if (!livePreflight.command_exists) {
    return [
      `Create ${livePreflight.command_path} from the latest material kit command template.`,
      'Replace all placeholders with values from a controlled test account or test window only.',
      'Run desktop:send:command:check before prepare-controlled.'
    ];
  }
  if (livePreflight.ready_for_prepare_controlled !== true) {
    return [
      'Fix live_preflight.required_failures, then rerun desktop:send:readiness.',
      'Keep real_execution_allowed and user_confirmed gated by operator confirmation, target verification and permission evidence.'
    ];
  }
  if (!trial?.ready_for_real_controlled_send) {
    return ['Run next_commands.prepare_controlled to write a ready controlled-send trial before any Sightflow real runner.'];
  }
  return [
    'Activate the confirmed test window.',
    'Run exactly one runner command from latest_controlled_send_trial.',
    'After the result file is written, run desktop:send:complete-controlled and refresh desktop:intake:audit plus desktop:intake:docs16-status.'
  ];
}

export function buildControlledSendRealWindowReadiness({
  root = process.cwd(),
  commandPath = null,
  boxRegionsPath = null,
  requireBoxRegions = false,
  materialKitPath = null,
  trialPath = null,
  completionPath = null,
  handoffPath = null,
  auditPath = null,
  createdAt = nowIso()
} = {}) {
  const resolvedRoot = path.resolve(root);
  let materialKit = artifactPayload(
    resolvedRoot,
    'runtime/controlled-send-material-kits',
    'controlled-send-material-kit.json',
    materialKitPath
  );
  if (!materialKitPath && isSimulationMaterialKit(materialKit)) {
    materialKit = null;
  }
  const resolvedCommandPath = commandPathFrom({ root: resolvedRoot, materialKit, commandPath });
  const resolvedBoxRegionsPath = boxRegionsPathFrom({ root: resolvedRoot, materialKit, boxRegionsPath });
  const livePreflight = buildControlledSendCommandPreflight({
    root: resolvedRoot,
    commandPath: resolvedCommandPath,
    boxRegionsPath: resolvedBoxRegionsPath,
    requireBoxRegions,
    createdAt
  });
  let trial = artifactPayload(
    resolvedRoot,
    'runtime/desktop-controlled-send-trials',
    'desktop-controlled-send-trial.json',
    trialPath
  );
  if (!trialPath && isSimulationArtifact(trial)) {
    trial = null;
  }
  let completion = artifactPayload(
    resolvedRoot,
    'runtime/desktop-controlled-send-completions',
    'desktop-controlled-send-completion.json',
    completionPath
  );
  if (!completionPath && isSimulationArtifact(completion)) {
    completion = null;
  }
  let handoff = artifactPayload(
    resolvedRoot,
    'runtime/desktop-controlled-send-handoffs',
    'desktop-controlled-send-handoff.json',
    handoffPath
  );
  if (!handoffPath && isSimulationArtifact(handoff)) {
    handoff = null;
  }
  const audit = artifactPayload(
    resolvedRoot,
    'runtime/intake-implementation-audits',
    'intake-implementation-audit.json',
    auditPath
  );

  const gateDecision = readinessDecision({
    materialKit,
    livePreflight,
    trial,
    completion,
    audit
  });
  const currentBlockers = blockersFor({
    materialKit,
    livePreflight,
    trial,
    completion,
    audit
  });
  const trialSummary = summarizeTrial(trial);
  const readyForRealRunner = trial?.ready_for_real_controlled_send === true
    && livePreflight.ready_for_prepare_controlled === true;
  const runnerEnvironmentContract = buildRunnerEnvironmentContract({
    trial: trialSummary,
    commandPath: resolvedCommandPath,
    boxRegionsPath: resolvedBoxRegionsPath,
    readyForRunner: readyForRealRunner
  });

  return {
    schema_version: 'controlled_send_real_window_readiness.v1',
    readiness_id: `controlled_send_real_window_readiness_${Date.now()}`,
    gate_decision: gateDecision,
    ready_for_prepare_controlled: livePreflight.ready_for_prepare_controlled === true,
    ready_for_real_runner: readyForRealRunner,
    real_send_verified: completion?.real_send_verified === true || audit?.real_send_verified === true,
    real_send_attempted_by_readiness: false,
    command_path: resolvedCommandPath,
    box_regions_path: resolvedBoxRegionsPath,
    box_regions_required: requireBoxRegions,
    latest_controlled_send_material_kit: summarizeMaterialKit(materialKit),
    live_command_preflight: {
      preflight_id: livePreflight.preflight_id,
      gate_decision: livePreflight.gate_decision,
      ready_for_prepare_controlled: livePreflight.ready_for_prepare_controlled,
      real_send_attempted: livePreflight.real_send_attempted,
      command_exists: livePreflight.command_exists,
      command_read_error: livePreflight.command_read_error,
      placeholder_paths: livePreflight.placeholder_paths,
      box_regions_exists: livePreflight.box_regions_exists,
      box_regions_ready: livePreflight.box_regions_ready,
      box_regions_failures: livePreflight.box_regions_failures,
      required_failures: livePreflight.required_failures,
      warnings: livePreflight.warnings
    },
    latest_controlled_send_trial: trialSummary,
    latest_controlled_send_handoff: summarizeHandoff(handoff),
    latest_controlled_send_completion: summarizeCompletion(completion),
    latest_intake_audit: summarizeAudit(audit),
    current_blockers: currentBlockers,
    runner_environment_contract: runnerEnvironmentContract,
    next_commands: {
      material_kit: 'npm.cmd run desktop:send:materials:init',
      command_check: livePreflight.next_commands.prepare_controlled.replace('desktop:send:prepare-controlled', 'desktop:send:command:check').replace(' --fail-on-not-ready', ' --fail-on-required'),
      prepare_controlled: buildPrepareCommand({
        commandPath: resolvedCommandPath,
        boxRegionsPath: resolvedBoxRegionsPath,
        requireBoxRegions
      }),
      handoff: 'npm.cmd run desktop:send:handoff',
      runner_with_box_regions: trialSummary?.runner_command_with_box_regions ?? null,
      runner_with_vision_api: trialSummary?.runner_command_with_vision_api ?? null,
      complete_controlled: trialSummary?.completion_command ?? null,
      audit: trialSummary?.audit_command ?? 'npm.cmd run desktop:intake:audit -- --fail-on-required',
      docs16_status: 'npm.cmd run desktop:intake:docs16-status'
    },
    operator_next_steps: nextActionsFor({
      gateDecision,
      materialKit,
      livePreflight,
      trial
    }),
    created_at: createdAt
  };
}

export function writeControlledSendRealWindowReadiness({
  readiness,
  outputDir = path.resolve('runtime/controlled-send-real-window-readiness', readiness.readiness_id)
}) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'controlled-send-real-window-readiness.json');
  const markdownPath = path.join(outputDir, 'controlled-send-real-window-readiness.md');
  writeFileSync(jsonPath, `${JSON.stringify(readiness, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, [
    '# Controlled Send Real Window Readiness',
    '',
    `- readiness_id: ${readiness.readiness_id}`,
    `- gate_decision: ${readiness.gate_decision}`,
    `- ready_for_prepare_controlled: ${readiness.ready_for_prepare_controlled}`,
    `- ready_for_real_runner: ${readiness.ready_for_real_runner}`,
    `- real_send_verified: ${readiness.real_send_verified}`,
    `- real_send_attempted_by_readiness: ${readiness.real_send_attempted_by_readiness}`,
    `- command_path: ${readiness.command_path}`,
    `- box_regions_path: ${readiness.box_regions_path}`,
    `- current_blockers: ${readiness.current_blockers.join(', ') || 'none'}`,
    '',
    '## Runner Environment Contract',
    '',
    `- ready_for_runner: ${readiness.runner_environment_contract.ready_for_runner}`,
    `- ALLOW_REAL_CONTROLLED_SEND: ${readiness.runner_environment_contract.required_env.ALLOW_REAL_CONTROLLED_SEND}`,
    `- CONTROLLED_SEND_COMMAND_PATH: ${readiness.runner_environment_contract.required_env.CONTROLLED_SEND_COMMAND_PATH}`,
    `- CONTROLLED_SEND_READINESS_PATH: ${readiness.runner_environment_contract.required_env.CONTROLLED_SEND_READINESS_PATH ?? 'pending_trial'}`,
    `- CONTROLLED_SEND_RESULT_PATH: ${readiness.runner_environment_contract.required_env.CONTROLLED_SEND_RESULT_PATH ?? 'pending_trial'}`,
    `- recognition_mode_policy: exactly one of ${readiness.runner_environment_contract.recognition_mode_policy.box_regions_env} or ${readiness.runner_environment_contract.recognition_mode_policy.vision_api_env}`,
    '',
    '## Next Commands',
    '',
    '```powershell',
    readiness.next_commands.material_kit,
    readiness.next_commands.command_check,
    readiness.next_commands.prepare_controlled,
    readiness.next_commands.handoff,
    readiness.next_commands.docs16_status,
    '```',
    '',
    '## Operator Next Steps',
    '',
    ...readiness.operator_next_steps.map((step) => `- ${step}`)
  ].join('\n'), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath
  };
}
