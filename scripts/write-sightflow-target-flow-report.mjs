import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function nowIso() {
  return new Date().toISOString();
}

function timestampId(date = new Date()) {
  return date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function fileContains(filePath, pattern) {
  if (!existsSync(filePath)) return false;
  return readFileSync(filePath, 'utf8').includes(pattern);
}

function checkFile(pathValue, description) {
  return {
    path: pathValue,
    description,
    exists: existsSync(path.resolve(pathValue))
  };
}

function buildCheck(checkId, passed, evidence = [], severity = 'required') {
  return {
    check_id: checkId,
    severity,
    passed: Boolean(passed),
    evidence
  };
}

function buildReport() {
  const createdAt = nowIso();
  const files = [
    checkFile(
      'sightflow-desktop-agent-main/src/main/index.ts',
      'Electron main process runtime mode, bridge submitter and desktop inbox handoff'
    ),
    checkFile(
      'sightflow-desktop-agent-main/src/core/zhineng-bridge-client.ts',
      'Sightflow IntakeObservation builder and bridge submission client'
    ),
    checkFile(
      'sightflow-desktop-agent-main/src/core/zhineng-bridge-session.ts',
      'Bridge session that captures the desktop window and blocks provider direct reply'
    ),
    checkFile(
      'sightflow-desktop-agent-main/src/core/generic-channel-session.ts',
      'Original Sightflow auto_reply session, retained as an explicit non-target mode'
    ),
    checkFile(
      'sightflow-desktop-agent-main/src/core/desktop-send-executor.ts',
      'Controlled reply shell for future confirmed desktop sending'
    ),
    checkFile(
      'sightflow-desktop-agent-main/scripts/start-zhineng-gui.ps1',
      'Desktop launch script that forces bridge mode and prevents duplicate app process groups'
    ),
    checkFile(
      'scripts/ingest-desktop-real-intake.mjs',
      'Zhineng logic-system desktop inbox ingest verifier'
    ),
    checkFile(
      'scripts/run-desktop-context-bridge.mjs',
      'Zhineng logic-system context, graph and expert-analysis bridge'
    )
  ];

  const [
    mainFile,
    bridgeClientFile,
    bridgeSessionFile,
    genericSessionFile,
    sendExecutorFile,
    launchScriptFile
  ] =
    files.map((item) => item.path);
  const rendererAppFile = 'sightflow-desktop-agent-main/src/renderer/src/App.tsx';
  const zhinengConsoleFile =
    'sightflow-desktop-agent-main/src/renderer/src/zhineng-console/ZhinengConsole.tsx';

  const checks = [
    buildCheck('bridge_mode_defaulted', fileContains(mainFile, "runtimeMode: 'zhineng_bridge'"), [
      'Persisted settings default to zhineng_bridge.'
    ]),
    buildCheck(
      'missing_runtime_mode_normalizes_to_bridge',
      fileContains(mainFile, "process.env.SIGHTFLOW_FORCE_ZHINENG_BRIDGE === '1'")
        && fileContains(mainFile, "raw?.runtimeMode === 'auto_reply'")
        && fileContains(mainFile, ": 'zhineng_bridge'"),
      ['Absent runtimeMode is normalized to zhineng_bridge; auto_reply requires an explicit value, and the desktop launcher can force the bridge mode over stale settings.']
    ),
    buildCheck(
      'provider_isolated_in_bridge_mode',
      fileContains(mainFile, 'if (!isBridgeMode)')
        && fileContains(mainFile, '(!isBridgeMode && providerNeedsVisionKey)'),
      ['Builtin/custom providers are loaded only when the runtime is not zhineng_bridge.']
    ),
    buildCheck(
      'bridge_without_key_falls_back_to_box_select',
      fileContains(mainFile, "settings.runtimeMode === 'zhineng_bridge' && effective === 'vlm' && !settings.vision.apiKey")
        && fileContains(mainFile, "return 'box-select'"),
      ['When zhineng_bridge has no vision key, WeChat auto/VLM capture falls back to box-select instead of requiring a real key.']
    ),
    buildCheck(
      'renderer_does_not_require_key_for_box_bridge',
      fileContains(rendererAppFile, 'shouldRequireVisionKey(settings)')
        && fileContains(rendererAppFile, "settings.runtimeMode !== 'zhineng_bridge' && missing"),
      ['Renderer start checks now match main-process bridge mode and do not block box-select bridge startup for a missing key.']
    ),
    buildCheck(
      'browser_preview_reports_missing_desktop_bridge',
      fileContains(rendererAppFile, 'DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE')
        && fileContains(rendererAppFile, '!window.electron?.invoke')
        && fileContains(zhinengConsoleFile, 'DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE')
        && fileContains(zhinengConsoleFile, '!window.electron?.invoke'),
      ['Browser/Vite preview pages report that the desktop Electron bridge is unavailable instead of silently failing to connect.']
    ),
    buildCheck(
      'desktop_launcher_forces_bridge_mode',
      fileContains(launchScriptFile, "SIGHTFLOW_FORCE_ZHINENG_BRIDGE = '1'")
        && fileContains(mainFile, 'SIGHTFLOW_FORCE_ZHINENG_BRIDGE'),
      ['Desktop launcher forces zhineng_bridge so stale auto_reply settings cannot hijack the target flow.']
    ),
    buildCheck(
      'desktop_launcher_blocks_duplicate_process_groups',
      fileContains(launchScriptFile, "Name -eq 'electron.exe'")
        && fileContains(launchScriptFile, 'exit 0'),
      ['Desktop launcher detects an existing Electron app instance and exits instead of starting another Vite/Electron group.']
    ),
    buildCheck(
      'bridge_writes_logic_system_inbox',
      fileContains(mainFile, 'submitZhinengBridgeObservationToLogicSystem')
        && fileContains(mainFile, "runtime', 'desktop-inbox-real'")
        && fileContains(mainFile, 'intake-observation.real.json'),
      ['Bridge submissions are written to runtime/desktop-inbox-real/** for Zhineng ingestion.']
    ),
    buildCheck(
      'observation_declares_logic_owner',
      fileContains(bridgeClientFile, "backend_processing_owner: 'zhineng_logic_system'")
        && fileContains(bridgeClientFile, 'logic_system_handoff_required: true'),
      ['Observation metadata states that backend processing belongs to the Zhineng logic system.']
    ),
    buildCheck(
      'observation_blocks_real_send',
      fileContains(bridgeClientFile, 'read_only_capture: true')
        && fileContains(bridgeClientFile, 'real_execution_allowed: false')
        && fileContains(bridgeClientFile, 'real_send_attempted: false'),
      ['Sightflow bridge observations are read-only and keep real execution blocked.']
    ),
    buildCheck(
      'provider_reply_blocked_in_bridge_session',
      fileContains(bridgeSessionFile, "case 'provider.reply_text'")
        && fileContains(bridgeSessionFile, "ctx.host.log('skip'"),
      ['Bridge session handles provider.reply_text as a skip event instead of sending.']
    ),
    buildCheck(
      'logic_system_processors_available',
      files[6].exists && files[7].exists,
      [
        'desktop:inbox:real:ingest can validate and ingest desktop Observation.',
        'desktop:context can assemble ContextSnapshot, expert analysis and message_draft.'
      ]
    ),
    buildCheck(
      'controlled_reply_shell_available',
      existsSync(sendExecutorFile)
        && fileContains(sendExecutorFile, 'OutboundSendCommand')
        && fileContains(sendExecutorFile, 'real_execution_allowed'),
      ['Sightflow retains a controlled send executor for confirmed replies.']
    ),
    buildCheck(
      'auto_reply_remains_explicit_non_target_mode',
      fileContains(genericSessionFile, 'sendMessage(event.content)')
        && fileContains(mainFile, "raw?.runtimeMode === 'auto_reply'"),
      [
        'Original auto_reply still exists, but it is no longer the default path.',
        'Using auto_reply would bypass the target architecture and should be treated as explicit legacy mode.'
      ],
      'warning'
    )
  ];

  const requiredFailures = checks
    .filter((check) => check.severity === 'required' && !check.passed)
    .map((check) => check.check_id);
  const warningFailures = checks
    .filter((check) => check.severity === 'warning' && !check.passed)
    .map((check) => check.check_id);

  return {
    schema_version: 'sightflow_target_flow_report.v1',
    report_id: `sightflow_target_flow_report_${timestampId(new Date(createdAt))}`,
    created_at: createdAt,
    target_statement:
      'Sightflow is used only for desktop recognition and the controlled reply shell; storage, readback, semantic analysis, event decomposition, relationship graph, event graph, expert analysis and draft generation belong to the Zhineng logic system.',
    gate_decision:
      requiredFailures.length === 0
        ? 'sightflow_target_flow_aligned_waiting_operator_confirmation'
        : 'stop_and_fix_sightflow_target_flow',
    required_failures: requiredFailures,
    warning_failures: warningFailures,
    files,
    checks,
    residual_risks: [
      {
        risk_id: 'auto_reply_legacy_path_exists',
        status: 'accepted_with_guard',
        note: 'auto_reply remains in code for original Sightflow behavior, but bridge mode is the default and the target flow report treats auto_reply as non-target legacy mode.'
      },
      {
        risk_id: 'real_window_send_not_verified',
        status: 'pending_real_window_trial',
        note: 'The current closure proves the wiring and blocking gates. A real test-window controlled-send completion is still needed before declaring real sending complete.'
      }
    ],
    recommended_verification_commands: [
      'cd sightflow-desktop-agent-main; npm.cmd run typecheck',
      'cd sightflow-desktop-agent-main; npm.cmd run dev:test-bridge-observation',
      'npm.cmd run desktop:target-flow:report',
      'npm.cmd run desktop:inbox:real:ingest',
      'npm.cmd run desktop:context -- --latest-real',
      'npm.cmd run process-tree:validate'
    ]
  };
}

function renderMarkdown(report) {
  const checkRows = report.checks
    .map((check) => {
      const status = check.passed ? 'pass' : 'fail';
      return `| ${check.check_id} | ${check.severity} | ${status} | ${check.evidence.join('<br>')} |`;
    })
    .join('\n');
  const fileRows = report.files
    .map((file) => `| ${file.path} | ${file.exists ? 'yes' : 'no'} | ${file.description} |`)
    .join('\n');
  const riskRows = report.residual_risks
    .map((risk) => `| ${risk.risk_id} | ${risk.status} | ${risk.note} |`)
    .join('\n');

  return `# Sightflow Target Flow Report

- report_id: ${report.report_id}
- gate_decision: ${report.gate_decision}
- required_failures: ${report.required_failures.join(', ') || 'none'}
- warning_failures: ${report.warning_failures.join(', ') || 'none'}

## Target Statement

${report.target_statement}

## Files

| path | exists | description |
| --- | --- | --- |
${fileRows}

## Checks

| check_id | severity | status | evidence |
| --- | --- | --- | --- |
${checkRows}

## Residual Risks

| risk_id | status | note |
| --- | --- | --- |
${riskRows}

## Recommended Verification Commands

\`\`\`powershell
${report.recommended_verification_commands.join('\n')}
\`\`\`
`;
}

const report = buildReport();
const outputDir = path.resolve('runtime/sightflow-target-flow-reports', report.report_id);
mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, 'sightflow-target-flow-report.json');
const markdownPath = path.join(outputDir, 'sightflow-target-flow-report.md');
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
writeFileSync(markdownPath, renderMarkdown(report), 'utf8');

console.log(JSON.stringify({
  command: 'write-sightflow-target-flow-report',
  report_id: report.report_id,
  gate_decision: report.gate_decision,
  required_failures: report.required_failures,
  warning_failures: report.warning_failures,
  json_path: jsonPath,
  markdown_path: markdownPath
}, null, 2));
