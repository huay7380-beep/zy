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
      filePath,
      payload: readJson(filePath)
    }))
    .filter((candidate) => !ignoreSimulation || !isSimulationArtifact(candidate))
    .sort((a, b) => {
      const aTime = a.payload.created_at ?? a.payload.generated_at ?? '';
      const bTime = b.payload.created_at ?? b.payload.generated_at ?? '';
      return String(bTime).localeCompare(String(aTime));
    });
  return candidates[0] ?? null;
}

function summarizeTrial(root, candidate) {
  if (!candidate) return null;
  const trial = candidate.payload;
  return {
    path: relativePath(root, candidate.filePath),
    trial_id: trial.trial_id,
    gate_decision: trial.gate_decision,
    ready_for_real_controlled_send: trial.ready_for_real_controlled_send === true,
    required_failures: trial.required_failures ?? [],
    input_path: trial.input_path ?? null,
    command_path: trial.handoff?.command_path ?? null,
    readiness_path: trial.handoff?.readiness_path ?? candidate.filePath,
    box_regions_path: trial.handoff?.box_regions_path ?? null,
    result_path: trial.handoff?.result_path ?? null,
    runner_environment_contract: trial.handoff?.runner_environment_contract ?? null,
    runner_command_with_box_regions: trial.handoff?.runner_command_with_box_regions ?? null,
    runner_command_with_vision_api: trial.handoff?.runner_command_with_vision_api ?? null,
    completion_command: trial.handoff?.completion_command ?? null,
    audit_command: trial.handoff?.audit_command ?? null
  };
}

function summarizeAudit(root, candidate) {
  if (!candidate) return null;
  const audit = candidate.payload;
  return {
    path: relativePath(root, candidate.filePath),
    audit_id: audit.audit_id,
    gate_decision: audit.gate_decision,
    automated_requirements_ready: audit.automated_requirements_ready === true,
    real_send_verified: audit.real_send_verified === true,
    required_failures: audit.required_failures ?? [],
    external_pending: audit.external_pending ?? []
  };
}

function summarizeCompletion(root, candidate) {
  if (!candidate) return null;
  const completion = candidate.payload;
  return {
    path: relativePath(root, candidate.filePath),
    completion_id: completion.completion_id,
    gate_decision: completion.gate_decision,
    real_send_verified: completion.real_send_verified === true,
    required_failures: completion.required_failures ?? []
  };
}

function summarizeToolBridge(root, candidate) {
  if (!candidate) return null;
  const bridge = candidate.payload;
  return {
    path: relativePath(root, candidate.filePath),
    bridge_id: bridge.bridge_id,
    gate_decision: bridge.gate_decision,
    capability_id: bridge.capability_summary?.capability_id ?? null,
    command_executed: bridge.command_executed === true,
    real_execution_allowed: bridge.real_execution_allowed === true,
    send_command_template_path: bridge.send_command_template_path ?? null,
    dry_run_send_result_path: bridge.dry_run_send_result_path ?? null,
    source_adapter_init_path: bridge.source_adapter_init_path ?? null
  };
}

function summarizeMaterialKit(root, candidate) {
  if (!candidate) return null;
  const kit = candidate.payload;
  return {
    path: relativePath(root, candidate.filePath),
    kit_id: kit.kit_id,
    gate_decision: kit.gate_decision,
    real_send_attempted: kit.real_send_attempted === true,
    command_target_path: kit.command_target_path ?? null,
    box_regions_target_path: kit.box_regions_target_path ?? null,
    command_template_path: kit.command_template_path ?? null,
    box_regions_template_path: kit.box_regions_template_path ?? null,
    user_input_command_template_path: kit.user_input_command_template_path ?? null,
    user_input_box_regions_template_path: kit.user_input_box_regions_template_path ?? null,
    operator_checklist_path: kit.operator_checklist_path ?? null,
    command_check_with_box_regions: kit.next_commands?.command_check_with_box_regions ?? null,
    prepare_with_box_regions: kit.next_commands?.prepare_with_box_regions ?? null,
    handoff_command: kit.next_commands?.handoff ?? null
  };
}

function summarizeRealWindowReadiness(root, candidate) {
  if (!candidate) return null;
  const readiness = candidate.payload;
  return {
    path: relativePath(root, candidate.filePath),
    readiness_id: readiness.readiness_id,
    gate_decision: readiness.gate_decision,
    ready_for_prepare_controlled: readiness.ready_for_prepare_controlled === true,
    ready_for_real_runner: readiness.ready_for_real_runner === true,
    real_send_verified: readiness.real_send_verified === true,
    real_send_attempted_by_readiness: readiness.real_send_attempted_by_readiness === true,
    current_blockers: readiness.current_blockers ?? [],
    command_path: readiness.command_path ?? null,
    box_regions_path: readiness.box_regions_path ?? null,
    next_commands: readiness.next_commands ?? {}
  };
}

function summarizeCommandPreflight(root, candidate) {
  if (!candidate) return null;
  const preflight = candidate.payload;
  return {
    path: relativePath(root, candidate.filePath),
    preflight_id: preflight.preflight_id,
    gate_decision: preflight.gate_decision,
    ready_for_prepare_controlled: preflight.ready_for_prepare_controlled === true,
    real_send_attempted: preflight.real_send_attempted === true,
    command_exists: preflight.command_exists === true,
    box_regions_ready: preflight.box_regions_ready === true,
    box_regions_required: preflight.box_regions_required === true,
    required_failures: preflight.required_failures ?? [],
    warnings: preflight.warnings ?? [],
    prepare_controlled_command: preflight.next_commands?.prepare_controlled ?? null
  };
}

function summarizeCommandDraft(root, candidate) {
  if (!candidate) return null;
  const draft = candidate.payload;
  return {
    path: relativePath(root, candidate.filePath),
    draft_id: draft.draft_id,
    gate_decision: draft.gate_decision,
    real_send_attempted: draft.real_send_attempted === true,
    target_command_path: draft.target_command_path ?? null,
    draft_command_path: draft.draft_command_path ?? null,
    draft_markdown_path: draft.draft_markdown_path ?? null,
    decision_id: draft.source?.decision_id ?? null,
    trigger_id: draft.source?.trigger_id ?? null,
    target_person_id: draft.command_summary?.target_person_id ?? null,
    message_draft_sha256: draft.command_summary?.message_draft_sha256 ?? null,
    user_confirmed: draft.command_summary?.user_confirmed === true,
    real_execution_allowed: draft.command_summary?.real_execution_allowed === true
  };
}

function summarizeCommandConfirmation(root, candidate) {
  if (!candidate) return null;
  const confirmation = candidate.payload;
  return {
    path: relativePath(root, candidate.filePath),
    confirmation_id: confirmation.confirmation_id,
    gate_decision: confirmation.gate_decision,
    real_send_attempted: confirmation.real_send_attempted === true,
    validate_only: confirmation.validate_only === true,
    would_write_target: confirmation.would_write_target === true,
    target_written: confirmation.target_written === true,
    target_command_path: confirmation.target_command_path ?? null,
    reviewed_decision_target_path: confirmation.reviewed_decision_target_path ?? null,
    user_input_decision_template_path: confirmation.user_input_decision_template_path ?? null,
    decision_template_path: confirmation.decision_template_path ?? null,
    confirmed_command_path: confirmation.confirmed_command_path ?? null,
    source_draft_path: confirmation.source?.draft_path ?? null,
    decision_path: confirmation.source?.decision_path ?? null,
    required_failures: confirmation.required_failures ?? []
  };
}

function isSimulationArtifact(candidate) {
  const payload = candidate?.payload ?? candidate;
  const candidates = [
    candidate?.filePath,
    payload?.path,
    payload?.command_target_path,
    payload?.box_regions_target_path,
    payload?.command_template_path,
    payload?.box_regions_template_path,
    payload?.command_path,
    payload?.box_regions_path,
    payload?.input_path,
    payload?.handoff?.command_path,
    payload?.handoff?.box_regions_path,
    payload?.handoff?.result_path,
    payload?.latest_controlled_send_material_kit?.path,
    payload?.latest_controlled_send_trial?.path,
    payload?.latest_controlled_send_completion?.path,
    payload?.latest_controlled_send_real_window_readiness?.path,
    payload?.verification_mode
  ].filter(Boolean);
  return candidates.some((candidatePath) => {
    const normalized = String(candidatePath).replaceAll('\\', '/');
    return normalized.includes('/controlled-send-simulations/')
      || normalized.includes('controlled_send_simulation')
      || normalized === 'simulated';
  });
}

function defaultCandidate(candidate, explicitPath) {
  if (explicitPath) return candidate;
  return isSimulationArtifact(candidate) ? null : candidate;
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
    evidence_refs: evidenceRefs.filter(Boolean),
    blockers: blockers.filter(Boolean)
  };
}

function defaultCommandPath(materialKit) {
  return materialKit?.command_target_path ?? 'runtime/user-inputs/controlled-send-command.real.json';
}

function defaultBoxRegionsPath(materialKit) {
  return materialKit?.box_regions_target_path ?? 'runtime/user-inputs/controlled-send-box-regions.real.json';
}

function quoteCommandArg(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildRunnerEnvironmentContract({ trial, materialKit, readyForRunner = false }) {
  const commandPath = trial?.command_path ?? defaultCommandPath(materialKit);
  const boxRegionsPath = trial?.box_regions_path ?? defaultBoxRegionsPath(materialKit);
  const readinessPath = trial?.readiness_path ?? null;
  const resultPath = trial?.result_path ?? null;
  return {
    contract_version: 'controlled_send_runner_environment.v1',
    ready_for_runner: readyForRunner === true,
    required_env: {
      ALLOW_REAL_CONTROLLED_SEND: 'true',
      CONTROLLED_SEND_COMMAND_PATH: commandPath,
      CONTROLLED_SEND_READINESS_PATH: readinessPath,
      CONTROLLED_SEND_RESULT_PATH: resultPath
    },
    path_bindings: {
      command_path_must_equal: commandPath,
      readiness_path_must_equal: readinessPath,
      result_path_must_equal: resultPath,
      box_regions_path_must_equal: boxRegionsPath
    },
    recognition_mode_policy: {
      exactly_one_required: true,
      box_regions_env: 'CONTROLLED_SEND_BOX_REGIONS_PATH',
      box_regions_expected_path: boxRegionsPath,
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

function buildOperatorNextActions({
  audit,
  trial,
  completion,
  toolBridge,
  materialKit,
  realWindowReadiness,
  commandPreflight,
  commandDraft,
  commandConfirmation
}) {
  const auditVerified = audit?.real_send_verified === true;
  const completionVerified = completion?.real_send_verified === true;
  const realSendVerified = auditVerified || completionVerified || realWindowReadiness?.real_send_verified === true;
  const commandReady = commandPreflight?.ready_for_prepare_controlled === true;
  const trialReady = trial?.ready_for_real_controlled_send === true;
  const runnerReady = realWindowReadiness?.ready_for_real_runner === true;
  const decisionValidated = commandConfirmation?.validate_only === true
    && commandConfirmation?.would_write_target === true
    && (commandConfirmation?.required_failures ?? []).length === 0;
  const commandConfirmed = commandReady || trialReady || realSendVerified || commandConfirmation?.target_written === true;
  const commandPath = defaultCommandPath(materialKit);
  const boxRegionsPath = defaultBoxRegionsPath(materialKit);
  const reviewedDecisionTargetPath = commandConfirmation?.reviewed_decision_target_path
    ?? 'runtime/user-inputs/controlled-send-command-confirmation-decision.real.json';
  const reviewedDecisionTemplatePath = commandConfirmation?.user_input_decision_template_path
    ?? commandConfirmation?.decision_template_path
    ?? null;
  const actionEvidence = (...items) => items.map((item) => item?.path).filter(Boolean);

  return [
    operatorAction({
      actionId: 'initialize_controlled_send_material_kit',
      status: materialKit ? 'complete' : 'pending',
      description: '生成真实测试窗口 SendCommand、框选区域模板和操作者 checklist。',
      targetPath: commandPath,
      templatePath: materialKit?.user_input_command_template_path
        ?? 'runtime/user-inputs/templates/controlled-send-command.real.json.template',
      command: materialKit ? null : 'npm.cmd run desktop:send:materials:init',
      evidenceRefs: actionEvidence(materialKit)
    }),
    operatorAction({
      actionId: 'build_controlled_send_command_draft',
      status: commandDraft || commandConfirmed
        ? 'complete'
        : 'ready',
      description: 'Generate a reviewed SendCommand draft from the latest MVP message_draft without writing the real command file.',
      targetPath: commandPath,
      templatePath: null,
      command: commandDraft || commandConfirmed ? null : 'npm.cmd run desktop:send:command:draft',
      evidenceRefs: actionEvidence(commandDraft, commandConfirmation, commandPreflight)
    }),
    operatorAction({
      actionId: 'confirm_controlled_send_command',
      status: commandConfirmed || decisionValidated
        ? 'complete'
        : commandDraft
          ? 'pending'
          : 'blocked',
      description: 'Review the generated draft against a controlled test window and fill a reviewed decision.',
      targetPath: commandConfirmation?.target_command_path ?? commandDraft?.target_command_path ?? commandPath,
      templatePath: reviewedDecisionTemplatePath,
      command: commandDraft && !commandConfirmed && !decisionValidated
        ? `npm.cmd run desktop:send:command:confirm -- --decision=${quoteCommandArg(reviewedDecisionTargetPath)}`
        : null,
      evidenceRefs: actionEvidence(commandDraft, commandConfirmation, commandPreflight),
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
      targetPath: commandConfirmation?.target_command_path ?? commandDraft?.target_command_path ?? commandPath,
      templatePath: reviewedDecisionTemplatePath,
      command: commandDraft && !commandConfirmed && !decisionValidated
        ? `npm.cmd run desktop:send:command:confirm -- --decision=${quoteCommandArg(reviewedDecisionTargetPath)} --validate-only`
        : null,
      evidenceRefs: actionEvidence(commandDraft, commandConfirmation),
      blockers: commandConfirmed || decisionValidated
        ? []
        : commandDraft
          ? ['reviewed_decision_validation_pending']
          : ['controlled_send_command_draft_pending']
    }),
    operatorAction({
      actionId: 'fill_controlled_send_command_material',
      status: commandReady || trialReady || realSendVerified
        ? 'complete'
        : materialKit
          ? 'pending'
          : 'blocked',
      description: '把系统处理后的 message_draft 填入受控 SendCommand，并限定测试账号或测试窗口。',
      targetPath: commandPath,
      templatePath: reviewedDecisionTemplatePath
        ?? materialKit?.user_input_command_template_path
        ?? 'runtime/user-inputs/templates/controlled-send-command.real.json.template',
      command: materialKit ? 'npm.cmd run desktop:send:command:check' : null,
      evidenceRefs: actionEvidence(materialKit, commandDraft, commandConfirmation, commandPreflight, trial, completion),
      blockers: materialKit
        ? commandDraft && !commandConfirmed && !decisionValidated
          ? ['controlled_send_command_confirmation_pending']
          : []
        : ['controlled_send_material_kit_pending']
    }),
    operatorAction({
      actionId: 'fill_box_regions_material',
      status: commandPreflight?.box_regions_ready === true || trialReady || realSendVerified
        ? 'complete'
        : materialKit
          ? 'pending'
          : 'blocked',
      description: '填写测试窗口输入框和发送按钮的框选区域，避免真实 runner 点击错误位置。',
      targetPath: boxRegionsPath,
      templatePath: materialKit?.user_input_box_regions_template_path
        ?? 'runtime/user-inputs/templates/controlled-send-box-regions.real.json.template',
      command: materialKit ? 'npm.cmd run desktop:send:command:check -- --require-box-regions' : null,
      evidenceRefs: actionEvidence(materialKit, commandPreflight, trial),
      blockers: materialKit ? [] : ['controlled_send_material_kit_pending']
    }),
    operatorAction({
      actionId: 'run_command_preflight',
      status: commandReady || trialReady || realSendVerified
        ? 'complete'
        : materialKit
          ? 'ready'
          : 'blocked',
      description: '检查命令文件、占位符、测试窗口范围、用户确认、目标校验、权限和框选区域。',
      targetPath: commandPath,
      command: materialKit
        ? materialKit.command_check_with_box_regions ?? 'npm.cmd run desktop:send:command:check -- --require-box-regions'
        : null,
      evidenceRefs: actionEvidence(commandPreflight),
      blockers: materialKit ? [] : ['controlled_send_material_kit_pending']
    }),
    operatorAction({
      actionId: 'prepare_controlled_send_trial',
      status: trialReady || realSendVerified
        ? 'complete'
        : commandReady
          ? 'ready'
          : 'blocked',
      description: '生成真实测试窗口发送前的准备报告和 runner/handoff 命令，本步骤不发送。',
      targetPath: trial?.path ?? null,
      command: commandReady
        ? commandPreflight?.prepare_controlled_command
          ?? materialKit?.prepare_with_box_regions
          ?? 'npm.cmd run desktop:send:prepare-controlled -- --fail-on-not-ready'
        : null,
      evidenceRefs: actionEvidence(commandPreflight, trial, realWindowReadiness),
      blockers: commandReady ? [] : [
        commandPreflight ? 'controlled_send_command_preflight_not_ready' : 'controlled_send_command_preflight_pending'
      ]
    }),
    operatorAction({
      actionId: 'run_real_test_window_runner',
      status: realSendVerified
        ? 'complete'
        : runnerReady
          ? 'ready'
          : 'blocked',
      description: '在已确认的测试窗口运行 Sightflow 真实 runner，并只允许一次受控发送。',
      targetPath: trial?.result_path ?? null,
      command: runnerReady
        ? trial?.runner_command_with_box_regions ?? trial?.runner_command_with_vision_api ?? null
        : null,
      evidenceRefs: actionEvidence(trial, realWindowReadiness, completion),
      blockers: runnerReady ? [] : ['controlled_send_trial_not_ready']
    }),
    operatorAction({
      actionId: 'complete_and_refresh_audit',
      status: completionVerified && auditVerified
        ? 'complete'
        : completionVerified
          ? 'ready'
          : 'blocked',
      description: '读取真实 runner 回执，校验 SendCommand 目标绑定摘要，然后刷新 docs/16 实现审计。',
      targetPath: completion?.path ?? null,
      command: completionVerified
        ? 'npm.cmd run desktop:intake:audit -- --fail-on-required'
        : trial?.completion_command ?? null,
      evidenceRefs: actionEvidence(completion, audit),
      blockers: completionVerified ? [] : ['sightflow_real_runner_result_pending']
    }),
    operatorAction({
      actionId: 'refresh_docs16_goal_status',
      status: realSendVerified && auditVerified
        ? 'ready'
        : 'blocked',
      description: '刷新 docs/16 目标状态；只有 completion 和 audit 双证据齐备时才允许 goal_complete=true。',
      command: 'npm.cmd run desktop:intake:docs16-status',
      evidenceRefs: actionEvidence(completion, audit),
      blockers: realSendVerified && auditVerified
        ? []
        : [
          completionVerified ? null : 'desktop_controlled_send_completion.real_send_verified_true',
          auditVerified ? null : 'intake_implementation_audit.real_send_verified_true'
        ].filter(Boolean)
    }),
    operatorAction({
      actionId: 'optional_tool_bridge_refresh',
      status: toolBridge ? 'complete' : 'pending',
      description: '如果 SendCommand 来自 CLI-Anything 或其他外部工具，先刷新 tool-to-intake 桥接证据。',
      command: toolBridge ? null : 'npm.cmd run tool:intake:bridge',
      evidenceRefs: actionEvidence(toolBridge)
    })
  ];
}

function buildNextSteps({
  audit,
  trial,
  completion,
  toolBridge,
  materialKit,
  realWindowReadiness,
  commandPreflight,
  commandDraft,
  commandConfirmation
}) {
  if (completion?.real_send_verified === true || audit?.real_send_verified === true) {
    return [
      'Real controlled send is already verified. Run desktop:intake:audit to refresh implementation evidence if needed.'
    ];
  }
  const steps = [];
  if (!toolBridge) {
    steps.push('Run npm.cmd run tool:intake:bridge if the send command should start from an external tool capability.');
  }
  if (!materialKit) {
    steps.push('Run npm.cmd run desktop:send:materials:init to create the real test-window command template, box-region template and operator checklist.');
  }
  if (!commandDraft && commandPreflight?.ready_for_prepare_controlled !== true) {
    steps.push('Run npm.cmd run desktop:send:command:draft to turn the latest MVP message_draft into a reviewed SendCommand draft.');
  }
  if (commandDraft && commandConfirmation?.target_written !== true && commandPreflight?.ready_for_prepare_controlled !== true) {
    if (commandConfirmation?.validate_only === true && commandConfirmation?.would_write_target === true) {
      const decisionTarget = commandConfirmation?.reviewed_decision_target_path ?? 'runtime/user-inputs/controlled-send-command-confirmation-decision.real.json';
      steps.push(`Reviewed decision passed validate-only. Rerun npm.cmd run desktop:send:command:confirm -- --decision=${quoteCommandArg(decisionTarget)} to write the real command file.`);
    } else {
      const decisionTarget = commandConfirmation?.reviewed_decision_target_path ?? 'runtime/user-inputs/controlled-send-command-confirmation-decision.real.json';
      steps.push(`Review the controlled-send confirmation decision template, then run npm.cmd run desktop:send:command:confirm -- --decision=${quoteCommandArg(decisionTarget)} --validate-only.`);
      steps.push(`After validate-only passes, rerun npm.cmd run desktop:send:command:confirm -- --decision=${quoteCommandArg(decisionTarget)} to write the real command file.`);
    }
    if (commandConfirmation?.required_failures?.length) {
      steps.push(`Resolve command confirmation failures: ${commandConfirmation.required_failures.join(', ')}.`);
    }
  }
  if (!realWindowReadiness) {
    steps.push('Run npm.cmd run desktop:send:readiness to aggregate the real-window command material, preflight, prepare, handoff, completion and audit state.');
  } else if (realWindowReadiness.current_blockers?.length && realWindowReadiness.ready_for_real_runner !== true) {
    steps.push(`Resolve real-window readiness blockers: ${realWindowReadiness.current_blockers.join(', ')}.`);
  }
  if (!commandPreflight) {
    steps.push('Run npm.cmd run desktop:send:command:check before preparing the real test-window trial.');
  } else if (commandPreflight.ready_for_prepare_controlled !== true) {
    steps.push('Fix controlled SendCommand material, then rerun desktop:send:command:check.');
    if (commandPreflight.required_failures?.length) {
      steps.push(`Resolve command preflight failures: ${commandPreflight.required_failures.join(', ')}.`);
    }
  }
  if (!trial) {
    steps.push('Run npm.cmd run desktop:send:prepare-controlled to create command templates and a readiness report.');
    return steps;
  }
  if (trial.ready_for_real_controlled_send !== true) {
    steps.push('Fill the controlled SendCommand with a test account or test window only, then rerun desktop:send:prepare-controlled with --fail-on-not-ready.');
    if (trial.required_failures?.length) {
      steps.push(`Resolve readiness failures: ${trial.required_failures.join(', ')}.`);
    }
    return steps;
  }
  steps.push('Activate the confirmed test window and run exactly one runner command from the handoff report.');
  steps.push('After the runner writes the result file, run the completion command from the handoff report.');
  steps.push('Run npm.cmd run desktop:intake:audit -- --fail-on-required and confirm real_send_verified=true.');
  return steps;
}

export function buildControlledSendHandoff({
  root = process.cwd(),
  trialPath = null,
  auditPath = null,
  completionPath = null,
  materialKitPath = null,
  realWindowReadinessPath = null,
  commandPreflightPath = null,
  commandDraftPath = null,
  commandConfirmationPath = null,
  toolBridgePath = null
} = {}) {
  const resolvedRoot = path.resolve(root);
  const trialCandidate = defaultCandidate(trialPath
    ? { filePath: path.resolve(trialPath), payload: readJson(path.resolve(trialPath)) }
    : latestRuntimeJson(resolvedRoot, 'runtime/desktop-controlled-send-trials', 'desktop-controlled-send-trial.json', { ignoreSimulation: true }), trialPath);
  const auditCandidate = auditPath
    ? { filePath: path.resolve(auditPath), payload: readJson(path.resolve(auditPath)) }
    : latestRuntimeJson(resolvedRoot, 'runtime/intake-implementation-audits', 'intake-implementation-audit.json');
  const completionCandidate = defaultCandidate(completionPath
    ? { filePath: path.resolve(completionPath), payload: readJson(path.resolve(completionPath)) }
    : latestRuntimeJson(resolvedRoot, 'runtime/desktop-controlled-send-completions', 'desktop-controlled-send-completion.json', { ignoreSimulation: true }), completionPath);
  const commandPreflightCandidate = defaultCandidate(commandPreflightPath
    ? { filePath: path.resolve(commandPreflightPath), payload: readJson(path.resolve(commandPreflightPath)) }
    : latestRuntimeJson(resolvedRoot, 'runtime/desktop-controlled-send-command-preflights', 'controlled-send-command-preflight.json', { ignoreSimulation: true }), commandPreflightPath);
  const commandDraftCandidate = defaultCandidate(commandDraftPath
    ? { filePath: path.resolve(commandDraftPath), payload: readJson(path.resolve(commandDraftPath)) }
    : latestRuntimeJson(resolvedRoot, 'runtime/controlled-send-command-drafts', 'controlled-send-command-draft.json', { ignoreSimulation: true }), commandDraftPath);
  const commandConfirmationCandidate = defaultCandidate(commandConfirmationPath
    ? { filePath: path.resolve(commandConfirmationPath), payload: readJson(path.resolve(commandConfirmationPath)) }
    : latestRuntimeJson(resolvedRoot, 'runtime/controlled-send-command-confirmations', 'controlled-send-command-confirmation.json', { ignoreSimulation: true }), commandConfirmationPath);
  const materialKitCandidate = defaultCandidate(materialKitPath
    ? { filePath: path.resolve(materialKitPath), payload: readJson(path.resolve(materialKitPath)) }
    : latestRuntimeJson(resolvedRoot, 'runtime/controlled-send-material-kits', 'controlled-send-material-kit.json', { ignoreSimulation: true }), materialKitPath);
  const realWindowReadinessCandidate = defaultCandidate(realWindowReadinessPath
    ? { filePath: path.resolve(realWindowReadinessPath), payload: readJson(path.resolve(realWindowReadinessPath)) }
    : latestRuntimeJson(resolvedRoot, 'runtime/controlled-send-real-window-readiness', 'controlled-send-real-window-readiness.json', { ignoreSimulation: true }), realWindowReadinessPath);
  const toolBridgeCandidate = toolBridgePath
    ? { filePath: path.resolve(toolBridgePath), payload: readJson(path.resolve(toolBridgePath)) }
    : latestRuntimeJson(resolvedRoot, 'runtime/tool-intake-bridges', 'tool-intake-bridge.json');

  const latestTrial = summarizeTrial(resolvedRoot, trialCandidate);
  const latestAudit = summarizeAudit(resolvedRoot, auditCandidate);
  const latestCompletion = summarizeCompletion(resolvedRoot, completionCandidate);
  const latestCommandPreflight = summarizeCommandPreflight(resolvedRoot, commandPreflightCandidate);
  const latestCommandDraft = summarizeCommandDraft(resolvedRoot, commandDraftCandidate);
  const latestCommandConfirmation = summarizeCommandConfirmation(resolvedRoot, commandConfirmationCandidate);
  const latestMaterialKit = summarizeMaterialKit(resolvedRoot, materialKitCandidate);
  const latestRealWindowReadiness = summarizeRealWindowReadiness(resolvedRoot, realWindowReadinessCandidate);
  const latestToolBridge = summarizeToolBridge(resolvedRoot, toolBridgeCandidate);
  const operatorNextActions = buildOperatorNextActions({
    audit: latestAudit,
    trial: latestTrial,
    completion: latestCompletion,
    materialKit: latestMaterialKit,
    realWindowReadiness: latestRealWindowReadiness,
    commandPreflight: latestCommandPreflight,
    commandDraft: latestCommandDraft,
    commandConfirmation: latestCommandConfirmation,
    toolBridge: latestToolBridge
  });
  const realSendVerified = latestCompletion?.real_send_verified === true
    || latestAudit?.real_send_verified === true
    || latestRealWindowReadiness?.real_send_verified === true;
  const runnerReady = latestRealWindowReadiness?.ready_for_real_runner === true;
  const gateDecision = realSendVerified
    ? 'controlled_send_already_verified'
    : runnerReady
      ? 'ready_for_real_window_runner'
      : 'waiting_for_real_window_inputs';

  return {
    schema_version: 'desktop_controlled_send_handoff.v1',
    handoff_id: `desktop_controlled_send_handoff_${Date.now()}`,
    gate_decision: gateDecision,
    automated_requirements_ready: latestAudit?.automated_requirements_ready === true,
    real_send_verified: realSendVerified,
    real_send_attempted_by_handoff: false,
    latest_intake_audit: latestAudit,
    latest_controlled_send_trial: latestTrial,
    latest_controlled_send_completion: latestCompletion,
    latest_controlled_send_material_kit: latestMaterialKit,
    latest_controlled_send_real_window_readiness: latestRealWindowReadiness,
    latest_controlled_send_command_preflight: latestCommandPreflight,
    latest_controlled_send_command_draft: latestCommandDraft,
    latest_controlled_send_command_confirmation: latestCommandConfirmation,
    latest_tool_intake_bridge: latestToolBridge,
    runner_environment_contract: buildRunnerEnvironmentContract({
      trial: latestTrial,
      materialKit: latestMaterialKit,
      readyForRunner: runnerReady
    }),
    operator_next_actions: operatorNextActions,
    operator_next_steps: buildNextSteps({
      audit: latestAudit,
      trial: latestTrial,
      completion: latestCompletion,
      materialKit: latestMaterialKit,
      realWindowReadiness: latestRealWindowReadiness,
      commandPreflight: latestCommandPreflight,
      commandDraft: latestCommandDraft,
      commandConfirmation: latestCommandConfirmation,
      toolBridge: latestToolBridge
    }),
    created_at: nowIso()
  };
}

export function writeControlledSendHandoff({
  handoff,
  outputDir = path.resolve('runtime/desktop-controlled-send-handoffs', handoff.handoff_id)
}) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'desktop-controlled-send-handoff.json');
  const markdownPath = path.join(outputDir, 'desktop-controlled-send-handoff.md');
  writeFileSync(jsonPath, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, [
    '# Desktop Controlled Send Handoff',
    '',
    `- handoff_id: ${handoff.handoff_id}`,
    `- gate_decision: ${handoff.gate_decision}`,
    `- automated_requirements_ready: ${handoff.automated_requirements_ready}`,
    `- real_send_verified: ${handoff.real_send_verified}`,
    `- real_send_attempted_by_handoff: ${handoff.real_send_attempted_by_handoff}`,
    `- latest_controlled_send_material_kit: ${handoff.latest_controlled_send_material_kit?.path ?? 'none'}`,
    `- latest_controlled_send_real_window_readiness: ${handoff.latest_controlled_send_real_window_readiness?.path ?? 'none'}`,
    `- latest_controlled_send_command_preflight: ${handoff.latest_controlled_send_command_preflight?.path ?? 'none'}`,
    `- latest_controlled_send_command_draft: ${handoff.latest_controlled_send_command_draft?.path ?? 'none'}`,
    `- latest_controlled_send_command_confirmation: ${handoff.latest_controlled_send_command_confirmation?.path ?? 'none'}`,
    `- latest_controlled_send_trial: ${handoff.latest_controlled_send_trial?.path ?? 'none'}`,
    `- latest_tool_intake_bridge: ${handoff.latest_tool_intake_bridge?.path ?? 'none'}`,
    '',
    '## Runner Environment Contract',
    '',
    `- ready_for_runner: ${handoff.runner_environment_contract.ready_for_runner}`,
    `- ALLOW_REAL_CONTROLLED_SEND: ${handoff.runner_environment_contract.required_env.ALLOW_REAL_CONTROLLED_SEND}`,
    `- CONTROLLED_SEND_COMMAND_PATH: ${handoff.runner_environment_contract.required_env.CONTROLLED_SEND_COMMAND_PATH ?? 'pending_trial'}`,
    `- CONTROLLED_SEND_READINESS_PATH: ${handoff.runner_environment_contract.required_env.CONTROLLED_SEND_READINESS_PATH ?? 'pending_trial'}`,
    `- CONTROLLED_SEND_RESULT_PATH: ${handoff.runner_environment_contract.required_env.CONTROLLED_SEND_RESULT_PATH ?? 'pending_trial'}`,
    `- recognition_mode_policy: exactly one of ${handoff.runner_environment_contract.recognition_mode_policy.box_regions_env} or ${handoff.runner_environment_contract.recognition_mode_policy.vision_api_env}`,
    '',
    '## Next Steps',
    '',
    ...handoff.operator_next_steps.map((step) => `- ${step}`),
    '',
    '## Operator Actions',
    '',
    ...handoff.operator_next_actions.map((item) => [
      `- ${item.status} ${item.action_id}: ${item.description}`,
      item.target_path ? `  - target_path: ${item.target_path}` : null,
      item.template_path ? `  - template_path: ${item.template_path}` : null,
      item.command ? `  - command: ${item.command}` : null,
      item.blockers.length > 0 ? `  - blockers: ${item.blockers.join(', ')}` : null
    ].filter(Boolean).join('\n')),
    '',
    '## Runner Commands',
    '',
    handoff.latest_controlled_send_trial?.runner_command_with_box_regions
      ? '```powershell'
      : 'No runner command is available until a controlled-send trial exists.',
    handoff.latest_controlled_send_trial?.runner_command_with_box_regions ?? '',
    handoff.latest_controlled_send_trial?.runner_command_with_box_regions ? '```' : ''
  ].filter((line) => line !== '').join('\n'), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath
  };
}
