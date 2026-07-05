import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { nowIso } from './intake-normalizer.mjs';

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
      path: relativePath(root, filePath),
      payload: readJson(filePath)
    }))
    .filter((candidate) => !ignoreSimulation || !isSimulationArtifact({
      path: candidate.path,
      ...candidate.payload
    }))
    .sort((a, b) => {
      const aTime = a.payload.created_at ?? a.payload.generated_at ?? '';
      const bTime = b.payload.created_at ?? b.payload.generated_at ?? '';
      return String(bTime).localeCompare(String(aTime));
    });
  return candidates[0] ?? null;
}

function fileEvidence(root, filePath, fileExists) {
  const absolutePath = path.resolve(root, filePath);
  return {
    path: filePath,
    exists: fileExists(absolutePath)
  };
}

function allFilesExist(root, files, fileExists) {
  const evidence = files.map((filePath) => fileEvidence(root, filePath, fileExists));
  return {
    passed: evidence.every((item) => item.exists),
    evidence,
    missing: evidence.filter((item) => !item.exists).map((item) => item.path)
  };
}

function requirement({ id, description, passed, evidenceRefs = [], missing = [] }) {
  return {
    requirement_id: id,
    description,
    status: passed ? 'complete' : 'incomplete',
    evidence_refs: evidenceRefs,
    missing
  };
}

function artifactRef(artifact) {
  return artifact?.path ? [artifact.path] : [];
}

function quoteCommandArg(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function operatorAction({
  actionId,
  status,
  description,
  targetPath = null,
  templatePath = null,
  command = null,
  evidenceRefs = [],
  blockers = []
}) {
  return {
    action_id: actionId,
    status,
    description,
    target_path: targetPath,
    template_path: templatePath,
    command,
    evidence_refs: evidenceRefs,
    blockers
  };
}

function hasCompletionCommandBinding(completion, { allowSimulation = false } = {}) {
  const summary = completion?.command_summary;
  const verified = completion?.real_send_verified === true
    || (allowSimulation && completion?.simulated_send_verified === true);
  return verified
    && typeof summary?.send_command_id === 'string'
    && summary.send_command_id.length > 0
    && typeof summary?.event_id === 'string'
    && summary.event_id.length > 0
    && typeof summary?.decision_id === 'string'
    && summary.decision_id.length > 0
    && typeof summary?.trigger_id === 'string'
    && summary.trigger_id.length > 0
    && typeof summary?.target_platform === 'string'
    && summary.target_platform.length > 0
    && typeof summary?.target_person_id === 'string'
    && summary.target_person_id.length > 0
    && summary?.target_thread_hint
    && typeof summary.target_thread_hint === 'object'
    && typeof summary?.message_draft_length === 'number'
    && summary.message_draft_length > 0
    && typeof summary?.message_draft_sha256 === 'string'
    && /^[a-f0-9]{64}$/.test(summary.message_draft_sha256);
}

function isSimulationArtifact(artifact) {
  const candidates = [
    artifact?.path,
    artifact?.command_target_path,
    artifact?.box_regions_target_path,
    artifact?.command_path,
    artifact?.box_regions_path,
    artifact?.input_path,
    artifact?.latest_controlled_send_material_kit?.path,
    artifact?.latest_controlled_send_trial?.path,
    artifact?.latest_controlled_send_real_window_readiness?.path,
    artifact?.verification_mode
  ].filter(Boolean);
  return candidates.some((candidate) => {
    const normalized = String(candidate).replaceAll('\\', '/');
    return normalized.includes('/controlled-send-simulations/')
      || normalized.includes('controlled_send_simulation')
      || normalized === 'simulated';
  });
}

function hasRunnerEnvironmentContract(contract, { requireRunnerPaths = false } = {}) {
  const requiredEnv = contract?.required_env ?? {};
  const recognitionModePolicy = contract?.recognition_mode_policy ?? {};
  const readinessGate = contract?.readiness_gate ?? {};
  const commandSnapshotFields = contract?.command_snapshot_required_fields ?? [];
  const commandPathReady = typeof requiredEnv.CONTROLLED_SEND_COMMAND_PATH === 'string'
    && requiredEnv.CONTROLLED_SEND_COMMAND_PATH.length > 0;
  const readinessPathReady = typeof requiredEnv.CONTROLLED_SEND_READINESS_PATH === 'string'
    && requiredEnv.CONTROLLED_SEND_READINESS_PATH.length > 0;
  const resultPathReady = typeof requiredEnv.CONTROLLED_SEND_RESULT_PATH === 'string'
    && requiredEnv.CONTROLLED_SEND_RESULT_PATH.length > 0;
  return contract?.contract_version === 'controlled_send_runner_environment.v1'
    && requiredEnv.ALLOW_REAL_CONTROLLED_SEND === 'true'
    && commandPathReady
    && (!requireRunnerPaths || (readinessPathReady && resultPathReady))
    && recognitionModePolicy.exactly_one_required === true
    && recognitionModePolicy.box_regions_env === 'CONTROLLED_SEND_BOX_REGIONS_PATH'
    && recognitionModePolicy.vision_api_env === 'CONTROLLED_SEND_VISION_API_KEY'
    && Array.isArray(recognitionModePolicy.forbidden_combination)
    && recognitionModePolicy.forbidden_combination.includes('CONTROLLED_SEND_BOX_REGIONS_PATH')
    && recognitionModePolicy.forbidden_combination.includes('CONTROLLED_SEND_VISION_API_KEY')
    && readinessGate.schema_version === 'desktop_controlled_send_trial.v1'
    && readinessGate.gate_decision === 'controlled_send_ready_for_test_window'
    && readinessGate.ready_for_real_controlled_send === true
    && readinessGate.real_send_attempted === false
    && Array.isArray(readinessGate.required_failures)
    && readinessGate.required_failures.length === 0
    && Array.isArray(commandSnapshotFields)
    && commandSnapshotFields.includes('message_draft_sha256');
}

function missingRunnerEnvironmentContracts({ realWindowReadiness, handoff }) {
  const requireRunnerPaths = realWindowReadiness?.ready_for_real_runner === true
    || handoff?.gate_decision === 'ready_for_real_window_runner';
  const missing = [];
  if (!hasRunnerEnvironmentContract(realWindowReadiness?.runner_environment_contract, { requireRunnerPaths })) {
    missing.push('controlled_send_real_window_readiness.runner_environment_contract');
  }
  if (!hasRunnerEnvironmentContract(handoff?.runner_environment_contract, { requireRunnerPaths })) {
    missing.push('desktop_controlled_send_handoff.runner_environment_contract');
  }
  if (
    handoff?.latest_controlled_send_trial
    && !hasRunnerEnvironmentContract(handoff.latest_controlled_send_trial.runner_environment_contract, { requireRunnerPaths })
  ) {
    missing.push('desktop_controlled_send_trial.handoff.runner_environment_contract');
  }
  return missing;
}

function buildOperatorNextActions({
  materialKit,
  commandDraft,
  commandConfirmation,
  realWindowReadiness,
  commandPreflight,
  handoff,
  completion,
  intakeAudit,
  completionCommandBindingReady,
  completionSimulationBindingReady,
  auditRealSendVerified,
  auditSimulatedSendVerified,
  realSendVerified,
  simulatedSendVerified
}) {
  const commandMissing = commandPreflight?.command_exists === false
    || realWindowReadiness?.current_blockers?.includes?.('controlled_send_command_missing')
    || intakeAudit?.external_pending?.includes?.('controlled_send_command_material_pending');
  const commandReady = commandPreflight?.ready_for_prepare_controlled === true;
  const prepareReady = realWindowReadiness?.ready_for_prepare_controlled === true;
  const runnerReady = realWindowReadiness?.ready_for_real_runner === true;
  const decisionValidated = commandConfirmation?.validate_only === true
    && commandConfirmation?.would_write_target === true
    && (commandConfirmation?.required_failures ?? []).length === 0;
  const commandConfirmed = commandReady || commandConfirmation?.target_written === true;
  const reviewedDecisionTargetPath = commandConfirmation?.reviewed_decision_target_path
    ?? 'runtime/user-inputs/controlled-send-command-confirmation-decision.real.json';
  const reviewedDecisionTemplatePath = commandConfirmation?.user_input_decision_template_path
    ?? commandConfirmation?.decision_template_path
    ?? null;

  return [
    operatorAction({
      actionId: 'build_controlled_send_command_draft',
      status: commandDraft || commandConfirmed ? 'complete' : 'ready',
      description: 'Create a controlled SendCommand draft from the latest MVP message_draft without writing the real command file.',
      targetPath: commandDraft?.target_command_path ?? materialKit?.command_target_path ?? null,
      templatePath: null,
      command: commandDraft || commandConfirmed ? null : 'npm.cmd run desktop:send:command:draft',
      evidenceRefs: artifactRef(commandDraft),
      blockers: []
    }),
    operatorAction({
      actionId: 'confirm_controlled_send_command',
      status: commandConfirmed || decisionValidated
        ? 'complete'
        : commandDraft
          ? 'pending'
          : 'blocked',
      description: 'Review the generated command draft in a controlled test window and fill a reviewed confirmation decision.',
      targetPath: commandConfirmation?.target_command_path ?? commandDraft?.target_command_path ?? materialKit?.command_target_path ?? null,
      templatePath: reviewedDecisionTemplatePath,
      command: commandDraft && !commandConfirmed && !decisionValidated
        ? `npm.cmd run desktop:send:command:confirm -- --decision=${quoteCommandArg(reviewedDecisionTargetPath)}`
        : null,
      evidenceRefs: [
        ...artifactRef(commandDraft),
        ...artifactRef(commandConfirmation)
      ],
      blockers: commandConfirmed || decisionValidated
        ? []
        : commandDraft
          ? commandConfirmation?.required_failures ?? ['controlled_send_command_confirmation_pending']
          : ['controlled_send_command_draft_pending']
    }),
    operatorAction({
      actionId: 'validate_reviewed_decision',
      status: commandConfirmed || decisionValidated
        ? 'complete'
        : commandDraft
          ? 'pending'
          : 'blocked',
      description: 'Validate the reviewed decision without writing the real SendCommand file.',
      targetPath: commandConfirmation?.target_command_path ?? commandDraft?.target_command_path ?? materialKit?.command_target_path ?? null,
      templatePath: reviewedDecisionTemplatePath,
      command: commandDraft && !commandConfirmed && !decisionValidated
        ? `npm.cmd run desktop:send:command:confirm -- --decision=${quoteCommandArg(reviewedDecisionTargetPath)} --validate-only`
        : null,
      evidenceRefs: [
        ...artifactRef(commandDraft),
        ...artifactRef(commandConfirmation)
      ],
      blockers: commandConfirmed || decisionValidated
        ? []
        : commandDraft
          ? ['reviewed_decision_validation_pending']
          : ['controlled_send_command_draft_pending']
    }),
    operatorAction({
      actionId: 'prepare_controlled_send_command_material',
      status: commandMissing ? commandDraft ? 'pending' : 'ready' : 'complete',
      description: 'Create the real controlled SendCommand material from the safe template and fill only test-account or test-window values.',
      targetPath: materialKit?.command_target_path ?? realWindowReadiness?.command_path ?? null,
      templatePath: reviewedDecisionTemplatePath
        ?? materialKit?.user_input_command_template_path
        ?? materialKit?.command_template_path
        ?? null,
      command: materialKit?.next_commands?.command_check_without_box_regions
        ?? realWindowReadiness?.next_commands?.command_check
        ?? null,
      evidenceRefs: [
        ...artifactRef(materialKit),
        ...artifactRef(commandDraft),
        ...artifactRef(commandConfirmation)
      ],
      blockers: commandMissing
        ? commandDraft && !commandConfirmed && !decisionValidated
          ? ['controlled_send_command_confirmation_pending']
          : ['controlled_send_command_material_pending']
        : []
    }),
    operatorAction({
      actionId: 'confirm_real_test_window_scope',
      status: intakeAudit?.external_pending?.includes?.('real_test_account_or_window_confirmation_pending')
        ? 'pending'
        : 'complete',
      description: 'Confirm the target is a real test account or controlled test window, not a production contact.',
      targetPath: materialKit?.command_target_path ?? realWindowReadiness?.command_path ?? null,
      templatePath: materialKit?.operator_checklist_path ?? null,
      command: realWindowReadiness?.next_commands?.handoff ?? materialKit?.next_commands?.handoff ?? null,
      evidenceRefs: [
        ...artifactRef(materialKit),
        ...artifactRef(realWindowReadiness)
      ],
      blockers: intakeAudit?.external_pending?.includes?.('real_test_account_or_window_confirmation_pending')
        ? ['real_test_account_or_window_confirmation_pending']
        : []
    }),
    operatorAction({
      actionId: 'run_command_preflight',
      status: commandReady ? 'complete' : 'blocked',
      description: 'Run the command material preflight before prepare-controlled; it must pass without required failures.',
      targetPath: commandPreflight?.path ?? null,
      templatePath: null,
      command: realWindowReadiness?.next_commands?.command_check
        ?? materialKit?.next_commands?.command_check_without_box_regions
        ?? null,
      evidenceRefs: artifactRef(commandPreflight),
      blockers: commandReady
        ? []
        : commandPreflight?.required_failures ?? realWindowReadiness?.current_blockers ?? []
    }),
    operatorAction({
      actionId: 'run_prepare_controlled',
      status: prepareReady ? 'complete' : 'blocked',
      description: 'Run prepare-controlled and require a ready trial before any Sightflow real runner command.',
      targetPath: handoff?.latest_controlled_send_trial?.readiness_path ?? null,
      templatePath: null,
      command: realWindowReadiness?.next_commands?.prepare_controlled
        ?? commandPreflight?.prepare_controlled_command
        ?? null,
      evidenceRefs: [
        ...artifactRef(realWindowReadiness),
        ...(handoff?.latest_controlled_send_trial?.path ? [handoff.latest_controlled_send_trial.path] : [])
      ],
      blockers: prepareReady
        ? []
        : realWindowReadiness?.current_blockers ?? commandPreflight?.required_failures ?? []
    }),
    operatorAction({
      actionId: 'run_real_test_window_runner',
      status: runnerReady ? 'ready' : 'blocked',
      description: 'Run exactly one Sightflow real test-window runner command after prepare-controlled is ready.',
      targetPath: handoff?.latest_controlled_send_trial?.result_path ?? null,
      templatePath: null,
      command: handoff?.latest_controlled_send_trial?.runner_command_with_box_regions
        ?? realWindowReadiness?.next_commands?.runner_with_box_regions
        ?? null,
      evidenceRefs: [
        ...artifactRef(handoff),
        ...artifactRef(realWindowReadiness)
      ],
      blockers: runnerReady ? [] : ['desktop_controlled_send_trial.ready_for_real_controlled_send']
    }),
    operatorAction({
      actionId: 'complete_and_refresh_audit',
      status: realSendVerified || simulatedSendVerified ? 'complete' : 'blocked',
      description: 'After the runner writes a result, run complete-controlled, refresh intake audit, then refresh docs16 status.',
      targetPath: completion?.path ?? null,
      templatePath: null,
      command: handoff?.latest_controlled_send_trial?.completion_command
        ?? realWindowReadiness?.next_commands?.complete_controlled
        ?? null,
      evidenceRefs: [
        ...artifactRef(completion),
        ...artifactRef(intakeAudit)
      ],
      blockers: realSendVerified || simulatedSendVerified
        ? []
        : [
          completion?.real_send_verified === true ? null : 'desktop_controlled_send_completion.real_send_verified_true',
          completion?.simulated_send_verified === true ? null : 'desktop_controlled_send_completion.simulated_send_verified_true',
          (completionCommandBindingReady || completionSimulationBindingReady)
            ? null
            : 'desktop_controlled_send_completion.command_summary_target_binding',
          (auditRealSendVerified || auditSimulatedSendVerified)
            ? null
            : 'intake_implementation_audit.send_verified_true'
        ].filter(Boolean)
    })
  ];
}

function latestArtifactPayload(root, runtimeDir, fileName, override, { ignoreSimulation = false } = {}) {
  if (override !== undefined) {
    return override;
  }
  const latest = latestRuntimeJson(root, runtimeDir, fileName, { ignoreSimulation });
  const payload = latest
    ? {
      path: latest.path,
      ...latest.payload
    }
    : null;
  return payload;
}

export function buildDocs16ImplementationStatus({
  root = process.cwd(),
  fileExists = existsSync,
  latestIntakeAudit,
  latestMaterialKit,
  latestCommandDraft,
  latestCommandConfirmation,
  latestOperatorPack,
  latestRealWindowReadiness,
  latestCommandPreflight,
  latestHandoff,
  latestCompletion,
  latestProcessTreeValidation,
  createdAt = nowIso()
} = {}) {
  const resolvedRoot = path.resolve(root);
  const intakeAudit = latestArtifactPayload(
    resolvedRoot,
    'runtime/intake-implementation-audits',
    'intake-implementation-audit.json',
    latestIntakeAudit
  );
  const commandPreflight = latestArtifactPayload(
    resolvedRoot,
    'runtime/desktop-controlled-send-command-preflights',
    'controlled-send-command-preflight.json',
    latestCommandPreflight,
    { ignoreSimulation: true }
  );
  const commandDraft = latestArtifactPayload(
    resolvedRoot,
    'runtime/controlled-send-command-drafts',
    'controlled-send-command-draft.json',
    latestCommandDraft,
    { ignoreSimulation: true }
  );
  const commandConfirmation = latestArtifactPayload(
    resolvedRoot,
    'runtime/controlled-send-command-confirmations',
    'controlled-send-command-confirmation.json',
    latestCommandConfirmation,
    { ignoreSimulation: true }
  );
  const operatorPack = latestArtifactPayload(
    resolvedRoot,
    'runtime/controlled-send-operator-packs',
    'controlled-send-operator-pack.json',
    latestOperatorPack,
    { ignoreSimulation: true }
  );
  const realWindowReadiness = latestArtifactPayload(
    resolvedRoot,
    'runtime/controlled-send-real-window-readiness',
    'controlled-send-real-window-readiness.json',
    latestRealWindowReadiness,
    { ignoreSimulation: true }
  );
  const materialKit = latestArtifactPayload(
    resolvedRoot,
    'runtime/controlled-send-material-kits',
    'controlled-send-material-kit.json',
    latestMaterialKit,
    { ignoreSimulation: true }
  );
  const handoff = latestArtifactPayload(
    resolvedRoot,
    'runtime/desktop-controlled-send-handoffs',
    'desktop-controlled-send-handoff.json',
    latestHandoff,
    { ignoreSimulation: true }
  );
  const completion = latestArtifactPayload(
    resolvedRoot,
    'runtime/desktop-controlled-send-completions',
    'desktop-controlled-send-completion.json',
    latestCompletion
  );
  const processTreeValidation = latestArtifactPayload(
    resolvedRoot,
    'runtime/process-tree-validations',
    'process-tree-validation.json',
    latestProcessTreeValidation
  );

  const schemaAndTests = allFilesExist(resolvedRoot, [
    'schemas/intake-observation.schema.json',
    'schemas/source-adapter-capability.schema.json',
    'schemas/outbound-send-command.schema.json',
    'schemas/outbound-send-result.schema.json',
    'schemas/controlled-send-material-kit.schema.json',
    'schemas/controlled-send-command-draft.schema.json',
    'schemas/controlled-send-command-confirmation-decision.schema.json',
    'schemas/controlled-send-command-confirmation.schema.json',
    'schemas/controlled-send-operator-pack.schema.json',
    'schemas/controlled-send-real-window-readiness.schema.json',
    'schemas/controlled-send-command-preflight.schema.json',
    'schemas/desktop-controlled-send-trial.schema.json',
    'schemas/desktop-controlled-send-completion.schema.json',
    'schemas/desktop-controlled-send-handoff.schema.json',
    'packages/intake-runtime/tests/intake-runtime.test.mjs',
    'packages/tool-runtime/tests/tool-runtime.test.mjs',
    'packages/trigger-engine/tests/trigger-engine.test.mjs'
  ], fileExists);

  const registryFiles = allFilesExist(resolvedRoot, [
    'docs/16-多来源信息接入与受控发送目标实现文档.md',
    'docs/15-系统流程树与扩展问题台账.md',
    'examples/system-process-tree.json',
    'views/obsidian/system-process-tree.md',
    'views/obsidian/system-process-tree.canvas'
  ], fileExists);

  const intakeAutomatedReady = intakeAudit?.automated_requirements_ready === true;
  const materialKitSafe = materialKit?.real_send_attempted === false
    && materialKit?.gate_decision === 'controlled_send_materials_ready_for_operator_fill';
  const realWindowReadinessSafe = realWindowReadiness?.real_send_attempted_by_readiness === false;
  const commandPreflightReady = commandPreflight?.ready_for_prepare_controlled === true;
  const commandPreflightSafe = commandPreflight && commandPreflight.real_send_attempted === false;
  const runnerEnvironmentContractMissing = missingRunnerEnvironmentContracts({
    realWindowReadiness,
    handoff
  });
  const runnerEnvironmentContractReady = runnerEnvironmentContractMissing.length === 0;
  const handoffOperatorActions = Array.isArray(handoff?.operator_next_actions)
    ? handoff.operator_next_actions
    : [];
  const handoffActionIds = new Set(handoffOperatorActions.map((item) => item.action_id));
  const handoffActionsReady = handoffOperatorActions.length > 0
    && handoffActionIds.has('run_command_preflight')
    && handoffActionIds.has('prepare_controlled_send_trial')
    && handoffActionIds.has('run_real_test_window_runner')
    && handoffActionIds.has('complete_and_refresh_audit');
  const handoffSafe = handoff
    && handoff.real_send_attempted_by_handoff === false
    && handoff.latest_controlled_send_material_kit
    && handoff.latest_controlled_send_real_window_readiness
    && handoffActionsReady;
  const completionRealSendReady = completion?.real_send_verified === true;
  const completionSimulatedSendReady = completion?.simulated_send_verified === true;
  const completionCommandBindingReady = hasCompletionCommandBinding(completion);
  const completionSimulationBindingReady = hasCompletionCommandBinding(completion, { allowSimulation: true });
  const auditRealSendVerified = intakeAudit?.real_send_verified === true;
  const auditSimulatedSendVerified = intakeAudit?.simulated_send_verified === true;
  const realSendVerified = completionCommandBindingReady && auditRealSendVerified;
  const simulatedSendVerified = completionSimulationBindingReady && auditSimulatedSendVerified;
  const processTreeSynced = processTreeValidation?.required_failures?.length === 0;
  const operatorNextActions = buildOperatorNextActions({
    materialKit,
    commandDraft,
    commandConfirmation,
    realWindowReadiness,
    commandPreflight,
    handoff,
    completion,
    intakeAudit,
    completionCommandBindingReady,
    completionSimulationBindingReady,
    auditRealSendVerified,
    auditSimulatedSendVerified,
    realSendVerified,
    simulatedSendVerified
  });

  const requirements = [
    requirement({
      id: 'docs16.registry_synced',
      description: '新文档、schema、包、脚本和运行产物已登记到流程树。',
      passed: registryFiles.passed && processTreeSynced,
      evidenceRefs: [
        ...registryFiles.evidence.filter((item) => item.exists).map((item) => item.path),
        ...artifactRef(processTreeValidation)
      ],
      missing: [
        ...registryFiles.missing,
        ...(processTreeSynced ? [] : ['process_tree_validation.required_failures_empty'])
      ]
    }),
    requirement({
      id: 'docs16.schemas_and_tests',
      description: 'IntakeObservation、adapter capability、SendCommand、SendResult 和受控发送状态契约均有 schema 和测试。',
      passed: schemaAndTests.passed,
      evidenceRefs: schemaAndTests.evidence.filter((item) => item.exists).map((item) => item.path),
      missing: schemaAndTests.missing
    }),
    requirement({
      id: 'docs16.multi_source_reusable_flow',
      description: 'fake、browser、Sightflow 和 CLI-Anything 能通过统一 intake/tool bridge 进入可审计流程。',
      passed: intakeAutomatedReady,
      evidenceRefs: artifactRef(intakeAudit),
      missing: intakeAutomatedReady ? [] : ['intake_implementation_audit.automated_requirements_ready']
    }),
    requirement({
      id: 'docs16.desktop_receive_bridge',
      description: 'Sightflow bridge 模式能接收桌面信息并阻断 Provider reply_text 直接发送。',
      passed: intakeAutomatedReady,
      evidenceRefs: artifactRef(intakeAudit),
      missing: intakeAutomatedReady ? [] : ['sightflow_bridge_observation_checks']
    }),
    requirement({
      id: 'docs16.send_command_dry_run_gates',
      description: '系统侧和 Sightflow dry-run 默认发送被阻断，并记录阻断原因。',
      passed: intakeAutomatedReady,
      evidenceRefs: artifactRef(intakeAudit),
      missing: intakeAutomatedReady ? [] : ['send_dry_run_gate_checks']
    }),
    requirement({
      id: 'docs16.controlled_send_material_kit',
      description: '真实测试窗口材料包包含包内模板、runtime/user-inputs/templates 安全模板、操作者 checklist、readiness 刷新命令和后续校验命令，且自身不执行发送。',
      passed: Boolean(materialKitSafe),
      evidenceRefs: artifactRef(materialKit),
      missing: materialKitSafe ? [] : ['controlled_send_material_kit.real_send_attempted_false']
    }),
    requirement({
      id: 'docs16.real_window_readiness',
      description: '真实测试窗口就绪度报告聚合材料包、真实命令、框选区域、preflight、prepare、handoff、completion 和 audit，且自身不执行发送。',
      passed: Boolean(realWindowReadinessSafe),
      evidenceRefs: artifactRef(realWindowReadiness),
      missing: realWindowReadinessSafe ? [] : ['controlled_send_real_window_readiness.real_send_attempted_by_readiness_false']
    }),
    requirement({
      id: 'docs16.command_material_preflight',
      description: '真实 runner 前会检查命令文件、模板占位符、测试窗口范围、用户确认、目标校验、权限和框选区域材料，且不执行发送。',
      passed: Boolean(commandPreflightSafe),
      evidenceRefs: artifactRef(commandPreflight),
      missing: commandPreflightSafe ? [] : ['controlled_send_command_preflight.real_send_attempted_false']
    }),
    requirement({
      id: 'docs16.runner_environment_contract',
      description: 'trial/readiness/handoff 必须输出同一套 runner 环境契约，列出真实发送环境变量、命令/readiness/result 路径绑定、框选区域/视觉密钥二选一规则和 message_draft_sha256 快照字段。',
      passed: runnerEnvironmentContractReady,
      evidenceRefs: [
        ...artifactRef(realWindowReadiness),
        ...artifactRef(handoff),
        ...(handoff?.latest_controlled_send_trial?.path ? [handoff.latest_controlled_send_trial.path] : [])
      ],
      missing: runnerEnvironmentContractMissing
    }),
    requirement({
      id: 'docs16.operator_handoff',
      description: '统一 handoff 汇总真实窗口 readiness、命令材料预检、受控发送准备、工具桥接、完成验收和审计状态，且自身不执行发送。',
      passed: Boolean(handoffSafe),
      evidenceRefs: artifactRef(handoff),
      missing: handoffSafe
        ? []
        : [
          'desktop_controlled_send_handoff.real_send_attempted_by_handoff_false',
          'desktop_controlled_send_handoff.latest_controlled_send_material_kit',
          'desktop_controlled_send_handoff.latest_controlled_send_real_window_readiness',
          'desktop_controlled_send_handoff.operator_next_actions'
        ]
    }),
    requirement({
      id: 'docs16.intake_implementation_audit',
      description: 'desktop:intake:audit 汇总 docs/16 自动化实现证据、命令材料预检、受控发送准备和分阶段 external pending。',
      passed: intakeAutomatedReady && Array.isArray(intakeAudit?.external_pending),
      evidenceRefs: artifactRef(intakeAudit),
      missing: intakeAutomatedReady ? [] : ['intake_implementation_audit.automated_requirements_ready']
    }),
    requirement({
      id: 'docs16.simulated_controlled_send_verified',
      description: '仿真测试窗口验收走完命令材料、prepare、模拟 runner 回执、completion、audit 和状态刷新，但不声明真实发送完成。',
      passed: simulatedSendVerified || realSendVerified,
      evidenceRefs: [
        ...artifactRef(completion),
        ...artifactRef(intakeAudit)
      ],
      missing: simulatedSendVerified || realSendVerified
        ? []
        : [
          completionSimulatedSendReady ? null : 'desktop_controlled_send_completion.simulated_send_verified_true',
          completionSimulationBindingReady ? null : 'desktop_controlled_send_completion.command_summary_target_binding',
          auditSimulatedSendVerified ? null : 'intake_implementation_audit.simulated_send_verified_true'
        ].filter(Boolean)
    }),
    requirement({
      id: 'docs16.real_controlled_send_verified',
      description: '测试账号受控发送有用户确认、目标校验、发送回执、SendCommand 目标绑定摘要和审计。',
      passed: realSendVerified,
      evidenceRefs: [
        ...artifactRef(completion),
        ...artifactRef(intakeAudit)
      ],
      missing: realSendVerified
        ? []
        : [
          commandPreflightReady ? null : 'controlled_send_command_material_ready',
          completion ? null : 'real_test_account_or_window_confirmation',
          completion ? null : 'sightflow_real_runner_result',
          completionRealSendReady ? null : 'desktop_controlled_send_completion.real_send_verified_true',
          completionCommandBindingReady ? null : 'desktop_controlled_send_completion.command_summary_target_binding',
          auditRealSendVerified ? null : 'intake_implementation_audit.real_send_verified_true'
        ].filter(Boolean)
    })
  ];

  const incompleteRequirements = requirements.filter((item) => item.status !== 'complete');
  const automatedRequirementsReady = requirements
    .filter((item) => ![
      'docs16.real_controlled_send_verified',
      'docs16.simulated_controlled_send_verified'
    ].includes(item.requirement_id))
    .every((item) => item.status === 'complete');
  const realIncompleteRequirements = requirements.filter((item) =>
    item.status !== 'complete'
    && item.requirement_id !== 'docs16.simulated_controlled_send_verified'
  );

  return {
    schema_version: 'docs16_implementation_status.v1',
    status_id: `docs16_implementation_status_${Date.now()}`,
    gate_decision: realIncompleteRequirements.length === 0
      ? 'docs16_implementation_complete'
      : automatedRequirementsReady && simulatedSendVerified
        ? 'docs16_simulated_controlled_send_verified'
        : automatedRequirementsReady
        ? 'docs16_waiting_for_real_controlled_send'
        : 'docs16_implementation_incomplete',
    automated_requirements_ready: automatedRequirementsReady,
    real_send_verified: realSendVerified,
    simulated_send_verified: simulatedSendVerified,
    runner_environment_contract_ready: runnerEnvironmentContractReady,
    goal_complete: realIncompleteRequirements.length === 0,
    simulation_goal_complete: automatedRequirementsReady && simulatedSendVerified,
    completed_count: requirements.length - incompleteRequirements.length,
    incomplete_count: incompleteRequirements.length,
    requirements,
    external_pending: intakeAudit?.external_pending ?? [],
    operator_next_actions: operatorNextActions,
    latest_artifacts: {
      intake_implementation_audit: intakeAudit?.path ?? null,
      controlled_send_material_kit: materialKit?.path ?? null,
      controlled_send_command_draft: commandDraft?.path ?? null,
      controlled_send_command_confirmation: commandConfirmation?.path ?? null,
      controlled_send_operator_pack: operatorPack?.path ?? null,
      controlled_send_real_window_readiness: realWindowReadiness?.path ?? null,
      controlled_send_command_preflight: commandPreflight?.path ?? null,
      desktop_controlled_send_handoff: handoff?.path ?? null,
      desktop_controlled_send_completion: completion?.path ?? null,
      process_tree_validation: processTreeValidation?.path ?? null
    },
    created_at: createdAt
  };
}

export function writeDocs16ImplementationStatus({
  status,
  outputDir = path.resolve('runtime/docs16-implementation-status', status.status_id)
}) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'docs16-implementation-status.json');
  const markdownPath = path.join(outputDir, 'docs16-implementation-status.md');
  writeFileSync(jsonPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, [
    '# Docs16 Implementation Status',
    '',
    `- status_id: ${status.status_id}`,
    `- gate_decision: ${status.gate_decision}`,
    `- automated_requirements_ready: ${status.automated_requirements_ready}`,
    `- real_send_verified: ${status.real_send_verified}`,
    `- simulated_send_verified: ${status.simulated_send_verified}`,
    `- runner_environment_contract_ready: ${status.runner_environment_contract_ready}`,
    `- goal_complete: ${status.goal_complete}`,
    `- simulation_goal_complete: ${status.simulation_goal_complete}`,
    `- completed_count: ${status.completed_count}`,
    `- incomplete_count: ${status.incomplete_count}`,
    `- external_pending: ${status.external_pending.join(', ') || 'none'}`,
    '',
    '## Operator Next Actions',
    '',
    ...status.operator_next_actions.map((item) => [
      `- ${item.status} ${item.action_id}: ${item.description}`,
      item.target_path ? `  - target_path: ${item.target_path}` : null,
      item.template_path ? `  - template_path: ${item.template_path}` : null,
      item.command ? `  - command: ${item.command}` : null,
      item.blockers.length > 0 ? `  - blockers: ${item.blockers.join(', ')}` : null
    ].filter(Boolean).join('\n')),
    '',
    '## Requirements',
    '',
    ...status.requirements.map((item) => [
      `- ${item.status === 'complete' ? 'complete' : 'incomplete'} ${item.requirement_id}: ${item.description}`,
      item.missing.length > 0 ? `  - missing: ${item.missing.join(', ')}` : null
    ].filter(Boolean).join('\n'))
  ].join('\n'), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath
  };
}
