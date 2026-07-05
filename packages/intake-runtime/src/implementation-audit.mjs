import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeIntakeObservation, nowIso } from './intake-normalizer.mjs';
import { mapObservationToRawEvent } from './raw-event-mapper.mjs';

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readTextIfExists(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

function repoPath(root, relativePath) {
  return path.resolve(root, relativePath);
}

function fileCheck(root, relativePath, requirement) {
  const absolutePath = repoPath(root, relativePath);
  return {
    check_id: `file:${relativePath}`,
    requirement,
    passed: existsSync(absolutePath),
    evidence: relativePath
  };
}

function scriptCheck(packageJson, scriptName, expectedSnippet) {
  const script = packageJson.scripts?.[scriptName] ?? '';
  return {
    check_id: `script:${scriptName}`,
    requirement: `${scriptName} script is registered`,
    passed: typeof script === 'string' && script.includes(expectedSnippet),
    evidence: script || null
  };
}

function textCheck(root, relativePath, checkId, requirement, snippets) {
  const text = readTextIfExists(repoPath(root, relativePath));
  const missing = snippets.filter((snippet) => !text.includes(snippet));
  return {
    check_id: checkId,
    requirement,
    passed: missing.length === 0,
    evidence: relativePath,
    missing
  };
}

function sampleObservationCheck(root, relativePath, expectedSourcePrefix) {
  const absolutePath = repoPath(root, relativePath);
  if (!existsSync(absolutePath)) {
    return {
      check_id: `sample:${relativePath}`,
      requirement: 'sample observation normalizes and maps to RawEvent',
      passed: false,
      evidence: relativePath,
      missing: ['file']
    };
  }
  try {
    const observation = readJson(absolutePath);
    const normalized = normalizeIntakeObservation(observation);
    const rawEvent = mapObservationToRawEvent(normalized);
    return {
      check_id: `sample:${relativePath}`,
      requirement: 'sample observation normalizes and maps to RawEvent',
      passed: rawEvent.source.startsWith(expectedSourcePrefix),
      evidence: {
        path: relativePath,
        observation_id: normalized.observation_id,
        raw_event_id: rawEvent.event_id,
        source: rawEvent.source
      }
    };
  } catch (error) {
    return {
      check_id: `sample:${relativePath}`,
      requirement: 'sample observation normalizes and maps to RawEvent',
      passed: false,
      evidence: relativePath,
      error: error.message
    };
  }
}

function latestControlledSendTrial(root) {
  const baseDir = repoPath(root, 'runtime/desktop-controlled-send-trials');
  if (!existsSync(baseDir)) {
    return null;
  }
  const reports = readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(baseDir, entry.name, 'desktop-controlled-send-trial.json'))
    .filter((reportPath) => existsSync(reportPath))
    .map((reportPath) => {
      const report = readJson(reportPath);
      return {
        path: path.relative(root, reportPath).replaceAll(path.sep, '/'),
        trial_id: report.trial_id,
        gate_decision: report.gate_decision,
        ready_for_real_controlled_send: report.ready_for_real_controlled_send,
        real_send_attempted: report.real_send_attempted,
        required_failures: report.required_failures ?? [],
        created_at: report.created_at
      };
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return reports[0] ?? null;
}

function latestControlledSendCommandPreflight(root) {
  const baseDir = repoPath(root, 'runtime/desktop-controlled-send-command-preflights');
  if (!existsSync(baseDir)) {
    return null;
  }
  const reports = readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(baseDir, entry.name, 'controlled-send-command-preflight.json'))
    .filter((reportPath) => existsSync(reportPath))
    .map((reportPath) => {
      const preflight = readJson(reportPath);
      return {
        path: path.relative(root, reportPath).replaceAll(path.sep, '/'),
        preflight_id: preflight.preflight_id,
        gate_decision: preflight.gate_decision,
        ready_for_prepare_controlled: preflight.ready_for_prepare_controlled,
        real_send_attempted: preflight.real_send_attempted,
        command_exists: preflight.command_exists,
        box_regions_ready: preflight.box_regions_ready,
        box_regions_required: preflight.box_regions_required,
        required_failures: preflight.required_failures ?? [],
        warnings: preflight.warnings ?? [],
        created_at: preflight.created_at
      };
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return reports[0] ?? null;
}

function latestControlledSendCommandDraft(root) {
  const baseDir = repoPath(root, 'runtime/controlled-send-command-drafts');
  if (!existsSync(baseDir)) {
    return null;
  }
  const reports = readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(baseDir, entry.name, 'controlled-send-command-draft.json'))
    .filter((reportPath) => existsSync(reportPath))
    .map((reportPath) => {
      const draft = readJson(reportPath);
      return {
        path: path.relative(root, reportPath).replaceAll(path.sep, '/'),
        draft_id: draft.draft_id,
        gate_decision: draft.gate_decision,
        real_send_attempted: draft.real_send_attempted,
        target_command_path: draft.target_command_path,
        draft_command_path: draft.draft_command_path,
        user_confirmed: draft.command_summary?.user_confirmed === true,
        real_execution_allowed: draft.command_summary?.real_execution_allowed === true,
        message_draft_sha256: draft.command_summary?.message_draft_sha256 ?? null,
        created_at: draft.created_at
      };
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return reports[0] ?? null;
}

function latestControlledSendCommandConfirmation(root) {
  const baseDir = repoPath(root, 'runtime/controlled-send-command-confirmations');
  if (!existsSync(baseDir)) {
    return null;
  }
  const reports = readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(baseDir, entry.name, 'controlled-send-command-confirmation.json'))
    .filter((reportPath) => existsSync(reportPath))
    .map((reportPath) => {
      const confirmation = readJson(reportPath);
      return {
        path: path.relative(root, reportPath).replaceAll(path.sep, '/'),
        confirmation_id: confirmation.confirmation_id,
        gate_decision: confirmation.gate_decision,
        real_send_attempted: confirmation.real_send_attempted,
        target_written: confirmation.target_written,
        target_command_path: confirmation.target_command_path,
        decision_template_path: confirmation.decision_template_path,
        required_failures: confirmation.required_failures ?? [],
        created_at: confirmation.created_at
      };
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return reports[0] ?? null;
}

function latestControlledSendOperatorPack(root) {
  const baseDir = repoPath(root, 'runtime/controlled-send-operator-packs');
  if (!existsSync(baseDir)) {
    return null;
  }
  const reports = readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(baseDir, entry.name, 'controlled-send-operator-pack.json'))
    .filter((reportPath) => existsSync(reportPath))
    .map((reportPath) => {
      const pack = readJson(reportPath);
      const pendingActions = Array.isArray(pack.operator_actions)
        ? pack.operator_actions.filter((item) => item.status !== 'complete')
        : [];
      return {
        path: path.relative(root, reportPath).replaceAll(path.sep, '/'),
        pack_id: pack.pack_id,
        gate_decision: pack.gate_decision,
        real_send_attempted: pack.real_send_attempted,
        real_send_verified: pack.real_send_verified,
        docs16_goal_complete: pack.docs16_goal_complete,
        simulation_goal_complete: pack.simulation_goal_complete,
        current_blockers: pack.current_blockers ?? [],
        pending_operator_action_ids: pendingActions.map((item) => item.action_id),
        created_at: pack.created_at
      };
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return reports[0] ?? null;
}

function latestControlledSendCompletion(root) {
  const baseDir = repoPath(root, 'runtime/desktop-controlled-send-completions');
  if (!existsSync(baseDir)) {
    return null;
  }
  const reports = readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(baseDir, entry.name, 'desktop-controlled-send-completion.json'))
    .filter((reportPath) => existsSync(reportPath))
    .map((reportPath) => {
      const completion = readJson(reportPath);
      return {
        path: path.relative(root, reportPath).replaceAll(path.sep, '/'),
        completion_id: completion.completion_id,
        gate_decision: completion.gate_decision,
        verification_mode: completion.verification_mode ?? 'real',
        real_send_verified: completion.real_send_verified,
        simulated_send_verified: completion.simulated_send_verified === true,
        audit_event_ready: completion.audit_event_ready,
        feedback_entry_ready: completion.feedback_entry_ready,
        required_failures: completion.required_failures ?? [],
        command_summary: completion.command_summary ?? null,
        created_at: completion.created_at
      };
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return reports[0] ?? null;
}

function latestControlledSendHandoff(root) {
  const baseDir = repoPath(root, 'runtime/desktop-controlled-send-handoffs');
  if (!existsSync(baseDir)) {
    return null;
  }
  const reports = readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(baseDir, entry.name, 'desktop-controlled-send-handoff.json'))
    .filter((reportPath) => existsSync(reportPath))
    .map((reportPath) => {
      const handoff = readJson(reportPath);
      const operatorNextActions = Array.isArray(handoff.operator_next_actions)
        ? handoff.operator_next_actions
        : [];
      return {
        path: path.relative(root, reportPath).replaceAll(path.sep, '/'),
        handoff_id: handoff.handoff_id,
        gate_decision: handoff.gate_decision,
        real_send_verified: handoff.real_send_verified,
        real_send_attempted_by_handoff: handoff.real_send_attempted_by_handoff,
        latest_controlled_send_material_kit: handoff.latest_controlled_send_material_kit?.path ?? null,
        latest_controlled_send_real_window_readiness: handoff.latest_controlled_send_real_window_readiness?.path ?? null,
        latest_controlled_send_command_preflight: handoff.latest_controlled_send_command_preflight?.path ?? null,
        latest_controlled_send_command_draft: handoff.latest_controlled_send_command_draft?.path ?? null,
        latest_controlled_send_command_confirmation: handoff.latest_controlled_send_command_confirmation?.path ?? null,
        operator_next_action_count: operatorNextActions.length,
        operator_next_action_ids: operatorNextActions.map((item) => item.action_id),
        created_at: handoff.created_at
      };
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return reports[0] ?? null;
}

function externalPendingFor({
  realSendVerified,
  latestTrial,
  latestCommandPreflight,
  latestCommandDraft,
  latestCommandConfirmation
}) {
  if (realSendVerified) {
    return [];
  }
  if (latestTrial?.ready_for_real_controlled_send === true) {
    return ['real_test_window_send_result_pending'];
  }
  if (latestCommandPreflight?.ready_for_prepare_controlled === true) {
    return ['controlled_send_prepare_controlled_pending'];
  }
  if (latestCommandPreflight) {
    return [
      latestCommandDraft && latestCommandConfirmation?.target_written !== true
        ? 'controlled_send_command_confirmation_pending'
        : 'controlled_send_command_material_pending',
      'real_test_account_or_window_confirmation_pending'
    ];
  }
  if (latestCommandDraft && latestCommandConfirmation?.target_written !== true) {
    return [
      'controlled_send_command_confirmation_pending',
      'controlled_send_command_preflight_pending',
      'real_test_account_or_window_confirmation_pending'
    ];
  }
  return [
    'controlled_send_command_preflight_pending',
    'real_test_account_or_window_confirmation_pending'
  ];
}

export function auditIntakeImplementation({ root = process.cwd() } = {}) {
  const resolvedRoot = path.resolve(root);
  const packageJson = readJson(repoPath(resolvedRoot, 'package.json'));
  const sightflowPackage = readJson(repoPath(resolvedRoot, 'sightflow-desktop-agent-main/package.json'));

  const checks = [
    fileCheck(resolvedRoot, 'docs/16-多来源信息接入与受控发送目标实现文档.md', 'target implementation document exists'),
    fileCheck(resolvedRoot, 'schemas/intake-observation.schema.json', 'IntakeObservation schema exists'),
    fileCheck(resolvedRoot, 'schemas/tool-intake-bridge.schema.json', 'ToolIntakeBridge schema exists'),
    fileCheck(resolvedRoot, 'schemas/source-adapter-capability.schema.json', 'SourceAdapterCapability schema exists'),
    fileCheck(resolvedRoot, 'schemas/source-adapter-conformance.schema.json', 'SourceAdapterConformance schema exists'),
    fileCheck(resolvedRoot, 'schemas/source-adapter-init-kit.schema.json', 'SourceAdapterInitKit schema exists'),
    fileCheck(resolvedRoot, 'schemas/outbound-send-command.schema.json', 'OutboundSendCommand schema exists'),
    fileCheck(resolvedRoot, 'schemas/outbound-send-result.schema.json', 'OutboundSendResult schema exists'),
    fileCheck(resolvedRoot, 'schemas/controlled-send-material-kit.schema.json', 'Controlled send material kit schema exists'),
    fileCheck(resolvedRoot, 'schemas/controlled-send-command-draft.schema.json', 'Controlled send command draft schema exists'),
    fileCheck(resolvedRoot, 'schemas/controlled-send-command-confirmation-decision.schema.json', 'Controlled send command confirmation decision schema exists'),
    fileCheck(resolvedRoot, 'schemas/controlled-send-command-confirmation.schema.json', 'Controlled send command confirmation schema exists'),
    fileCheck(resolvedRoot, 'schemas/controlled-send-operator-pack.schema.json', 'Controlled send operator pack schema exists'),
    fileCheck(resolvedRoot, 'schemas/controlled-send-real-window-readiness.schema.json', 'Controlled send real-window readiness schema exists'),
    fileCheck(resolvedRoot, 'schemas/controlled-send-command-preflight.schema.json', 'Controlled send command preflight schema exists'),
    fileCheck(resolvedRoot, 'schemas/desktop-controlled-send-trial.schema.json', 'Desktop controlled-send trial schema exists'),
    fileCheck(resolvedRoot, 'schemas/desktop-controlled-send-completion.schema.json', 'Desktop controlled-send completion schema exists'),
    fileCheck(resolvedRoot, 'schemas/desktop-controlled-send-handoff.schema.json', 'Desktop controlled-send handoff schema exists'),
    fileCheck(resolvedRoot, 'schemas/intake-implementation-audit.schema.json', 'Intake implementation audit schema exists'),
    fileCheck(resolvedRoot, 'schemas/docs16-implementation-status.schema.json', 'Docs/16 implementation status schema exists'),
    fileCheck(resolvedRoot, 'packages/intake-runtime/src/index.mjs', 'intake runtime entry exists'),
    fileCheck(resolvedRoot, 'packages/intake-runtime/src/source-adapter-kit.mjs', 'source adapter init kit runtime exists'),
    fileCheck(resolvedRoot, 'packages/intake-runtime/src/controlled-send-material-kit.mjs', 'controlled send material kit runtime exists'),
    fileCheck(resolvedRoot, 'packages/intake-runtime/src/controlled-send-command-draft.mjs', 'controlled send command draft runtime exists'),
    fileCheck(resolvedRoot, 'packages/intake-runtime/src/controlled-send-command-confirmation.mjs', 'controlled send command confirmation runtime exists'),
    fileCheck(resolvedRoot, 'packages/intake-runtime/src/controlled-send-operator-pack.mjs', 'controlled send operator pack runtime exists'),
    fileCheck(resolvedRoot, 'packages/intake-runtime/src/controlled-send-real-window-readiness.mjs', 'controlled send real-window readiness runtime exists'),
    fileCheck(resolvedRoot, 'packages/intake-runtime/src/controlled-send-command-preflight.mjs', 'controlled send command preflight runtime exists'),
    fileCheck(resolvedRoot, 'packages/intake-runtime/src/controlled-send-handoff.mjs', 'controlled send handoff runtime exists'),
    fileCheck(resolvedRoot, 'packages/intake-runtime/src/docs16-implementation-status.mjs', 'docs/16 implementation status runtime exists'),
    fileCheck(resolvedRoot, 'packages/tool-runtime/src/tool-intake-bridge.mjs', 'tool intake bridge runtime exists'),
    fileCheck(resolvedRoot, 'packages/intake-runtime/tests/intake-runtime.test.mjs', 'intake runtime tests exist'),
    sampleObservationCheck(resolvedRoot, 'examples/intake-observation.sightflow.sample.json', 'desktop:sightflow_desktop.wechat'),
    sampleObservationCheck(resolvedRoot, 'examples/intake-observation.browser.sample.json', 'browser:browser_dom.sample'),
    sampleObservationCheck(resolvedRoot, 'examples/intake-observation.fake.sample.json', 'api:fake_test.adapter'),
    fileCheck(resolvedRoot, 'examples/source-adapter-capability.browser.sample.json', 'browser source adapter capability sample exists'),
    scriptCheck(packageJson, 'intake:validate', 'validate-intake-observation.mjs'),
    scriptCheck(packageJson, 'intake:adapter:init', 'init-source-adapter-kit.mjs'),
    scriptCheck(packageJson, 'intake:adapter:validate', 'validate-source-adapter-conformance.mjs'),
    scriptCheck(packageJson, 'intake:adapter:validate:browser', 'source-adapter-capability.browser.sample.json'),
    scriptCheck(packageJson, 'tool:intake:bridge', 'bridge-tool-intake.mjs'),
    scriptCheck(packageJson, 'intake:demo', 'run-intake-demo.mjs'),
    scriptCheck(packageJson, 'desktop:inbox', 'run-desktop-inbox-demo.mjs'),
    scriptCheck(packageJson, 'desktop:send:dry-run', 'run-desktop-send-dry-run.mjs'),
    scriptCheck(packageJson, 'desktop:send:materials:init', 'init-controlled-send-material-kit.mjs'),
    scriptCheck(packageJson, 'desktop:send:command:draft', 'write-controlled-send-command-draft.mjs'),
    scriptCheck(packageJson, 'desktop:send:command:confirm', 'confirm-controlled-send-command.mjs'),
    scriptCheck(packageJson, 'desktop:send:operator-pack', 'write-controlled-send-operator-pack.mjs'),
    scriptCheck(packageJson, 'desktop:send:readiness', 'check-controlled-send-real-window-readiness.mjs'),
    scriptCheck(packageJson, 'desktop:send:command:check', 'check-controlled-send-command.mjs'),
    scriptCheck(packageJson, 'desktop:send:prepare-controlled', 'prepare-controlled-send-trial.mjs'),
    scriptCheck(packageJson, 'desktop:send:complete-controlled', 'complete-controlled-send-trial.mjs'),
    scriptCheck(packageJson, 'desktop:send:handoff', 'write-controlled-send-handoff.mjs'),
    scriptCheck(packageJson, 'desktop:intake:audit', 'audit-intake-implementation.mjs'),
    scriptCheck(packageJson, 'desktop:intake:docs16-status', 'write-docs16-implementation-status.mjs'),
    scriptCheck(sightflowPackage, 'dev:test-bridge-observation', 'bridge-observation'),
    scriptCheck(sightflowPackage, 'dev:test-send-dry-run', 'send-dry-run'),
    scriptCheck(sightflowPackage, 'dev:test-controlled-send', 'controlled-send'),
    scriptCheck(sightflowPackage, 'dev:test-controlled-send-real', 'controlled-send-real'),
    textCheck(
      resolvedRoot,
      'packages/intake-runtime/src/controlled-send-handoff.mjs',
      'handoff:structured-operator-actions',
      'controlled-send handoff emits structured operator_next_actions for external operators',
      [
        'operator_next_actions',
        'build_controlled_send_command_draft',
        'confirm_controlled_send_command',
        'run_real_test_window_runner',
        'complete_and_refresh_audit',
        'refresh_docs16_goal_status'
      ]
    ),
    textCheck(
      resolvedRoot,
      'packages/intake-runtime/src/controlled-send-handoff.mjs',
      'handoff:runner-environment-contract',
      'controlled-send handoff emits a reusable runner environment contract for real-window operators',
      [
        'runner_environment_contract',
        'controlled_send_runner_environment.v1',
        'ALLOW_REAL_CONTROLLED_SEND',
        'CONTROLLED_SEND_COMMAND_PATH',
        'CONTROLLED_SEND_READINESS_PATH',
        'CONTROLLED_SEND_RESULT_PATH',
        'CONTROLLED_SEND_BOX_REGIONS_PATH',
        'CONTROLLED_SEND_VISION_API_KEY',
        'message_draft_sha256'
      ]
    ),
    textCheck(
      resolvedRoot,
      'packages/intake-runtime/src/controlled-send-real-window-readiness.mjs',
      'readiness:runner-environment-contract',
      'real-window readiness exposes the same runner environment contract before any real send',
      [
        'runner_environment_contract',
        'controlled_send_runner_environment.v1',
        'ALLOW_REAL_CONTROLLED_SEND',
        'CONTROLLED_SEND_RESULT_PATH',
        'CONTROLLED_SEND_BOX_REGIONS_PATH',
        'CONTROLLED_SEND_VISION_API_KEY',
        'message_draft_sha256'
      ]
    ),
    textCheck(
      resolvedRoot,
      'schemas/desktop-controlled-send-handoff.schema.json',
      'schema:handoff-structured-operator-actions',
      'desktop controlled-send handoff schema requires structured operator_next_actions',
      [
        '"operator_next_actions"',
        '"action_id"',
        '"status"',
        '"blockers"'
      ]
    ),
    textCheck(
      resolvedRoot,
      'schemas/desktop-controlled-send-handoff.schema.json',
      'schema:handoff-runner-environment-contract',
      'desktop controlled-send handoff schema requires the runner environment contract',
      [
        '"runner_environment_contract"',
        '"controlled_send_runner_environment.v1"',
        '"ALLOW_REAL_CONTROLLED_SEND"',
        '"CONTROLLED_SEND_RESULT_PATH"',
        '"CONTROLLED_SEND_BOX_REGIONS_PATH"',
        '"CONTROLLED_SEND_VISION_API_KEY"',
        '"message_draft_sha256"'
      ]
    ),
    textCheck(
      resolvedRoot,
      'schemas/controlled-send-real-window-readiness.schema.json',
      'schema:readiness-runner-environment-contract',
      'real-window readiness schema requires the runner environment contract',
      [
        '"runner_environment_contract"',
        '"controlled_send_runner_environment.v1"',
        '"ALLOW_REAL_CONTROLLED_SEND"',
        '"CONTROLLED_SEND_RESULT_PATH"',
        '"CONTROLLED_SEND_BOX_REGIONS_PATH"',
        '"CONTROLLED_SEND_VISION_API_KEY"',
        '"message_draft_sha256"'
      ]
    ),
    textCheck(
      resolvedRoot,
      'sightflow-desktop-agent-main/src/core/rpa/tests/test-controlled-send-real.ts',
      'sightflow:controlled-send-real-gates',
      'real controlled-send runner requires explicit env, readiness, test scope and operator confirmation',
      [
        'desktop_controlled_send_trial.v1',
        'controlled_send_ready_for_test_window',
        'ALLOW_REAL_CONTROLLED_SEND',
        'ready_for_real_controlled_send',
        'real_send_attempted must be false',
        'required_failures must be an array',
        'CONTROLLED_SEND_RESULT_PATH',
        'assertRunnerEnvironmentMatchesReadiness',
        'result path',
        'box regions path',
        'not both',
        'controlled_send_scope',
        'no_production_contact',
        'confirmed_for_controlled_send',
        'assertCommandMatchesReadiness',
        'message_draft_sha256',
        'changed after prepare'
      ]
    ),
    textCheck(
      resolvedRoot,
      'packages/intake-runtime/src/controlled-send-completion.mjs',
      'completion:trial-draft-hash-binding',
      'completion verifies message_draft_sha256 against the prepared trial snapshot and rejects command changes after prepare',
      [
        'trial.command?.message_draft_sha256',
        'trial_message_draft_sha256_missing',
        'message_draft_sha256_mismatch',
        'command_message_draft_sha256_changed_after_trial'
      ]
    ),
    textCheck(
      resolvedRoot,
      'schemas/desktop-controlled-send-completion.schema.json',
      'schema:completion-message-draft-sha256',
      'desktop controlled-send completion schema requires message_draft_sha256 in command_summary',
      [
        '"message_draft_sha256"',
        '"pattern": "^[a-f0-9]{64}$"'
      ]
    ),
    textCheck(
      resolvedRoot,
      'schemas/desktop-controlled-send-trial.schema.json',
      'schema:trial-message-draft-sha256',
      'desktop controlled-send trial schema requires message_draft_sha256 in prepared command summary',
      [
        '"command"',
        '"message_draft_length"',
        '"message_draft_sha256"',
        '"pattern": "^[a-f0-9]{64}$"'
      ]
    ),
    textCheck(
      resolvedRoot,
      'schemas/desktop-controlled-send-trial.schema.json',
      'schema:trial-runner-environment-contract',
      'desktop controlled-send trial handoff schema requires the runner environment contract',
      [
        '"runner_environment_contract"',
        '"controlled_send_runner_environment.v1"',
        '"ALLOW_REAL_CONTROLLED_SEND"',
        '"CONTROLLED_SEND_RESULT_PATH"',
        '"CONTROLLED_SEND_BOX_REGIONS_PATH"',
        '"CONTROLLED_SEND_VISION_API_KEY"',
        '"message_draft_sha256"'
      ]
    ),
    textCheck(
      resolvedRoot,
      'packages/intake-runtime/src/docs16-implementation-status.mjs',
      'docs16-status:runner-environment-contract-gate',
      'docs/16 status requires runner environment contract readiness before declaring automated completion',
      [
        'runner_environment_contract_ready',
        'docs16.runner_environment_contract',
        'missingRunnerEnvironmentContracts',
        'controlled_send_real_window_readiness.runner_environment_contract',
        'desktop_controlled_send_handoff.runner_environment_contract',
        'desktop_controlled_send_trial.handoff.runner_environment_contract'
      ]
    ),
    textCheck(
      resolvedRoot,
      'schemas/docs16-implementation-status.schema.json',
      'schema:docs16-status-runner-environment-contract-ready',
      'docs/16 implementation status schema exposes runner_environment_contract_ready',
      [
        '"runner_environment_contract_ready"',
        '"type": "boolean"'
      ]
    ),
    textCheck(
      resolvedRoot,
      'docs/15-系统流程树与扩展问题台账.md',
      'registry:docs15-intake-audit',
      'docs/15 registers intake implementation audit command and artifacts',
      [
        'scripts/audit-intake-implementation.mjs',
        'scripts/write-controlled-send-command-draft.mjs',
        'scripts/confirm-controlled-send-command.mjs',
        'scripts/write-controlled-send-operator-pack.mjs',
        'scripts/check-controlled-send-command.mjs',
        'scripts/complete-controlled-send-trial.mjs',
        'scripts/write-controlled-send-handoff.mjs',
        'scripts/write-docs16-implementation-status.mjs',
        'scripts/bridge-tool-intake.mjs',
        'scripts/init-source-adapter-kit.mjs',
        'scripts/validate-source-adapter-conformance.mjs',
        'scripts/init-controlled-send-material-kit.mjs',
        'scripts/check-controlled-send-real-window-readiness.mjs',
        'runtime/tool-intake-bridges/**',
        'runtime/controlled-send-material-kits/**',
        'runtime/controlled-send-command-drafts/**',
        'runtime/controlled-send-command-confirmations/**',
        'runtime/controlled-send-operator-packs/**',
        'runtime/controlled-send-real-window-readiness/**',
        'runtime/desktop-controlled-send-command-preflights/**',
        'runtime/desktop-controlled-send-handoffs/**',
        'runtime/docs16-implementation-status/**',
        'runtime/source-adapter-kits/**',
        'runtime/source-adapter-conformance/**',
        'runtime/desktop-controlled-send-completions/**',
        'runtime/intake-implementation-audits/**'
      ]
    ),
    textCheck(
      resolvedRoot,
      'examples/system-process-tree.json',
      'registry:process-tree-intake-audit',
      'machine process tree registers intake implementation audit command and artifacts',
      [
        'scripts/audit-intake-implementation.mjs',
        'scripts/write-controlled-send-command-draft.mjs',
        'scripts/confirm-controlled-send-command.mjs',
        'scripts/write-controlled-send-operator-pack.mjs',
        'scripts/check-controlled-send-command.mjs',
        'scripts/complete-controlled-send-trial.mjs',
        'scripts/write-controlled-send-handoff.mjs',
        'scripts/write-docs16-implementation-status.mjs',
        'scripts/bridge-tool-intake.mjs',
        'scripts/init-source-adapter-kit.mjs',
        'scripts/validate-source-adapter-conformance.mjs',
        'scripts/init-controlled-send-material-kit.mjs',
        'scripts/check-controlled-send-real-window-readiness.mjs',
        'runtime/tool-intake-bridges/**',
        'runtime/controlled-send-material-kits/**',
        'runtime/controlled-send-command-drafts/**',
        'runtime/controlled-send-command-confirmations/**',
        'runtime/controlled-send-operator-packs/**',
        'runtime/controlled-send-real-window-readiness/**',
        'runtime/desktop-controlled-send-command-preflights/**',
        'runtime/desktop-controlled-send-handoffs/**',
        'runtime/docs16-implementation-status/**',
        'runtime/source-adapter-kits/**',
        'runtime/source-adapter-conformance/**',
        'runtime/desktop-controlled-send-completions/**',
        'runtime/intake-implementation-audits/**'
      ]
    ),
    textCheck(
      resolvedRoot,
      'views/obsidian/system-process-tree.md',
      'registry:obsidian-md-intake-audit',
      'Obsidian Markdown registers intake implementation audit command and artifacts',
      [
        'scripts/audit-intake-implementation.mjs',
        'scripts/write-controlled-send-command-draft.mjs',
        'scripts/confirm-controlled-send-command.mjs',
        'scripts/write-controlled-send-operator-pack.mjs',
        'scripts/check-controlled-send-command.mjs',
        'scripts/complete-controlled-send-trial.mjs',
        'scripts/write-controlled-send-handoff.mjs',
        'scripts/write-docs16-implementation-status.mjs',
        'scripts/bridge-tool-intake.mjs',
        'scripts/init-source-adapter-kit.mjs',
        'scripts/validate-source-adapter-conformance.mjs',
        'scripts/init-controlled-send-material-kit.mjs',
        'scripts/check-controlled-send-real-window-readiness.mjs',
        'runtime/tool-intake-bridges/**',
        'runtime/controlled-send-material-kits/**',
        'runtime/controlled-send-command-drafts/**',
        'runtime/controlled-send-command-confirmations/**',
        'runtime/controlled-send-operator-packs/**',
        'runtime/controlled-send-real-window-readiness/**',
        'runtime/desktop-controlled-send-command-preflights/**',
        'runtime/desktop-controlled-send-handoffs/**',
        'runtime/docs16-implementation-status/**',
        'runtime/source-adapter-kits/**',
        'runtime/source-adapter-conformance/**',
        'runtime/desktop-controlled-send-completions/**',
        'runtime/intake-implementation-audits/**'
      ]
    ),
    textCheck(
      resolvedRoot,
      'views/obsidian/system-process-tree.canvas',
      'registry:obsidian-canvas-intake-audit',
      'Obsidian Canvas registers intake implementation audit artifacts',
      [
        'scripts/audit-intake-implementation.mjs',
        'scripts/write-controlled-send-command-draft.mjs',
        'scripts/confirm-controlled-send-command.mjs',
        'scripts/write-controlled-send-operator-pack.mjs',
        'scripts/check-controlled-send-command.mjs',
        'scripts/complete-controlled-send-trial.mjs',
        'scripts/write-controlled-send-handoff.mjs',
        'scripts/write-docs16-implementation-status.mjs',
        'scripts/bridge-tool-intake.mjs',
        'scripts/init-source-adapter-kit.mjs',
        'scripts/validate-source-adapter-conformance.mjs',
        'scripts/init-controlled-send-material-kit.mjs',
        'scripts/check-controlled-send-real-window-readiness.mjs',
        'runtime/tool-intake-bridges/**',
        'runtime/controlled-send-material-kits/**',
        'runtime/controlled-send-command-drafts/**',
        'runtime/controlled-send-command-confirmations/**',
        'runtime/controlled-send-operator-packs/**',
        'runtime/controlled-send-real-window-readiness/**',
        'runtime/desktop-controlled-send-command-preflights/**',
        'runtime/desktop-controlled-send-handoffs/**',
        'runtime/docs16-implementation-status/**',
        'runtime/source-adapter-kits/**',
        'runtime/source-adapter-conformance/**',
        'runtime/desktop-controlled-send-completions/**',
        'runtime/intake-implementation-audits/**'
      ]
    )
  ];

  const requiredFailures = checks
    .filter((check) => check.passed !== true)
    .map((check) => check.check_id);
  const latestTrial = latestControlledSendTrial(resolvedRoot);
  const latestCommandPreflight = latestControlledSendCommandPreflight(resolvedRoot);
  const latestCommandDraft = latestControlledSendCommandDraft(resolvedRoot);
  const latestCommandConfirmation = latestControlledSendCommandConfirmation(resolvedRoot);
  const latestOperatorPack = latestControlledSendOperatorPack(resolvedRoot);
  const latestCompletion = latestControlledSendCompletion(resolvedRoot);
  const latestHandoff = latestControlledSendHandoff(resolvedRoot);
  const realSendVerified = latestCompletion?.real_send_verified === true;
  const simulatedSendVerified = latestCompletion?.simulated_send_verified === true;
  const externalPending = externalPendingFor({
    realSendVerified,
    latestTrial,
    latestCommandPreflight,
    latestCommandDraft,
    latestCommandConfirmation
  });

  return {
    schema_version: 'intake_implementation_audit.v1',
    audit_id: `intake_implementation_audit_${Date.now()}`,
    gate_decision: requiredFailures.length > 0
      ? 'intake_implementation_not_ready'
      : realSendVerified
        ? 'intake_implementation_real_send_verified'
        : simulatedSendVerified
          ? 'intake_implementation_simulated_send_verified'
        : 'intake_implementation_ready_for_real_window_trial',
    automated_requirements_ready: requiredFailures.length === 0,
    real_send_verified: realSendVerified,
    simulated_send_verified: simulatedSendVerified,
    required_failures: requiredFailures,
    external_pending: externalPending,
    checks,
    latest_controlled_send_command_draft: latestCommandDraft,
    latest_controlled_send_command_confirmation: latestCommandConfirmation,
    latest_controlled_send_operator_pack: latestOperatorPack,
    latest_controlled_send_command_preflight: latestCommandPreflight,
    latest_controlled_send_trial: latestTrial,
    latest_controlled_send_handoff: latestHandoff,
    latest_controlled_send_completion: latestCompletion,
    created_at: nowIso()
  };
}

export function writeIntakeImplementationAudit({
  audit,
  outputDir = path.resolve('runtime/intake-implementation-audits', audit.audit_id)
}) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'intake-implementation-audit.json');
  const markdownPath = path.join(outputDir, 'intake-implementation-audit.md');
  writeFileSync(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, [
    '# Intake Implementation Audit',
    '',
    `- audit_id: ${audit.audit_id}`,
    `- gate_decision: ${audit.gate_decision}`,
    `- automated_requirements_ready: ${audit.automated_requirements_ready}`,
    `- real_send_verified: ${audit.real_send_verified}`,
    `- simulated_send_verified: ${audit.simulated_send_verified}`,
    `- required_failures: ${audit.required_failures.join(', ') || 'none'}`,
    `- external_pending: ${audit.external_pending.join(', ') || 'none'}`,
    audit.latest_controlled_send_command_preflight
      ? `- latest_controlled_send_command_preflight: ${audit.latest_controlled_send_command_preflight.path}`
      : '- latest_controlled_send_command_preflight: none',
    audit.latest_controlled_send_command_draft
      ? `- latest_controlled_send_command_draft: ${audit.latest_controlled_send_command_draft.path}`
      : '- latest_controlled_send_command_draft: none',
    audit.latest_controlled_send_command_confirmation
      ? `- latest_controlled_send_command_confirmation: ${audit.latest_controlled_send_command_confirmation.path}`
      : '- latest_controlled_send_command_confirmation: none',
    audit.latest_controlled_send_operator_pack
      ? `- latest_controlled_send_operator_pack: ${audit.latest_controlled_send_operator_pack.path}`
      : '- latest_controlled_send_operator_pack: none',
    audit.latest_controlled_send_trial
      ? `- latest_controlled_send_trial: ${audit.latest_controlled_send_trial.path}`
      : '- latest_controlled_send_trial: none',
    audit.latest_controlled_send_handoff
      ? `- latest_controlled_send_handoff: ${audit.latest_controlled_send_handoff.path}`
      : '- latest_controlled_send_handoff: none',
    audit.latest_controlled_send_completion
      ? `- latest_controlled_send_completion: ${audit.latest_controlled_send_completion.path}`
      : '- latest_controlled_send_completion: none',
    '',
    '## Checks',
    '',
    ...audit.checks.map((check) => `- ${check.passed ? 'pass' : 'fail'} ${check.check_id}: ${check.requirement}`)
  ].join('\n'), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath
  };
}
