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

function buildReport() {
  const createdAt = nowIso();
  const files = [
    checkFile('sightflow-desktop-agent-main/src/renderer/src/zhineng-console/ZhinengConsole.tsx', '智-能 GUI 控制台与悬浮图标 React 组件'),
    checkFile('sightflow-desktop-agent-main/src/renderer/src/zhineng-console/zhineng-console.css', '智-能 GUI 控制台与悬浮图标样式'),
    checkFile('sightflow-desktop-agent-main/src/renderer/src/zhineng-console/README.md', 'GUI 子模块说明文件'),
    checkFile('sightflow-desktop-agent-main/src/renderer/src/zhineng-console/GOAL.md', 'GUI 子模块总目标文件'),
    checkFile('sightflow-desktop-agent-main/src/renderer/src/App.tsx', 'Sightflow 渲染端窗口路由'),
    checkFile('sightflow-desktop-agent-main/src/main/index.ts', 'Sightflow Electron 主进程窗口与 IPC 入口'),
    checkFile('packages/mvp-runtime/src/reply-mode-policy.mjs', '第一人称/第三人称回复模式策略'),
    checkFile('packages/mvp-runtime/tests/reply-mode-policy.test.mjs', '回复模式策略测试')
  ];

  const componentFile = files[0].path;
  const styleFile = files[1].path;
  const appFile = files[4].path;
  const mainFile = files[5].path;
  const guiStateRuntimeFile = 'packages/decision-cluster/src/romantic-gui-state.mjs';
  const guiStateWriterFile = 'scripts/write-pt028-gui-decision-state.mjs';
  const latestGuiStateFile = 'runtime/pt028-gui-decision-states/latest.json';
  const decisionRuntimeFile = 'packages/decision-cluster/src/decision-cluster.mjs';
  const checks = [
    {
      check_id: 'sightflow_gui_exists',
      passed: existsSync(appFile) && existsSync(mainFile),
      evidence: ['Sightflow Electron renderer and main process files exist.']
    },
    {
      check_id: 'zhineng_console_route_registered',
      passed: fileContains(appFile, 'zhineng-console') && fileContains(appFile, 'ZhinengConsole'),
      evidence: ['App.tsx renders ZhinengConsole for ?window=zhineng-console.']
    },
    {
      check_id: 'zhineng_dock_route_registered',
      passed: fileContains(appFile, 'zhineng-dock') && fileContains(appFile, 'ZhinengDockIcon'),
      evidence: ['App.tsx renders the floating dock icon for ?window=zhineng-dock.']
    },
    {
      check_id: 'zhineng_console_window_registered',
      passed: fileContains(mainFile, 'createZhinengConsoleWindow') && fileContains(mainFile, 'zhineng:openConsole'),
      evidence: ['Electron main process registers a dedicated Zhineng console window and IPC entry.']
    },
    {
      check_id: 'zhineng_dock_window_registered',
      passed: fileContains(mainFile, 'createZhinengDockWindow') && fileContains(mainFile, 'zhineng:openDock'),
      evidence: ['Electron main process registers the always-on-top dock icon window and IPC entry.']
    },
    {
      check_id: 'wechat_dock_attachment_registered',
      passed: fileContains(mainFile, 'getWechatWindowInfo') && fileContains(mainFile, 'refreshZhinengDockAttachment'),
      evidence: ['Dock icon reuses the existing WeChat window discovery path before falling back to screen corner placement.']
    },
    {
      check_id: 'start_stop_visible_in_gui',
      passed: fileContains(componentFile, 'engine:start') && fileContains(componentFile, 'engine:stop'),
      evidence: ['ZhinengConsole calls existing engine:start and engine:stop IPC handlers.']
    },
    {
      check_id: 'analysis_and_language_frames_visible',
      passed: fileContains(componentFile, 'analysisSteps') && fileContains(componentFile, 'buildLanguageAnalysis'),
      evidence: ['GUI contains dedicated analysis-process and language-analysis frames.']
    },
    {
      check_id: 'relationship_gradient_review_visible',
      passed: fileContains(componentFile, 'buildGradientReviewModel')
        && fileContains(componentFile, 'progressionIntensity')
        && fileContains(styleFile, 'zg-gradient-review'),
      evidence: ['GUI renders the relationship gradient, psychological comfort intensity and sentence-intent review area.']
    },
    {
      check_id: 'pt028_gui_runtime_state_available',
      passed: fileContains(guiStateRuntimeFile, 'pt028_gui_decision_state.v1')
        && fileContains(guiStateWriterFile, 'write-pt028-gui-decision-state')
        && fileContains(latestGuiStateFile, 'pt028_gui_decision_state.v1'),
      evidence: ['pt028:gui-state writes a latest runtime decision projection consumed by the GUI.']
    },
    {
      check_id: 'decision_state_ipc_registered',
      passed: fileContains(mainFile, 'readLatestZhinengDecisionState')
        && fileContains(mainFile, 'zhineng:decision-state:get'),
      evidence: ['Electron main process exposes a read-only decision-state IPC endpoint.']
    },
    {
      check_id: 'gui_uses_runtime_decision_state',
      passed: fileContains(componentFile, 'mergeRuntimeGradientReview')
        && fileContains(componentFile, 'runtimeDecisionState')
        && fileContains(componentFile, 'zhineng:decision-state:get'),
      evidence: ['ZhinengConsole prefers pt028_gui_decision_state.v1 over its local fallback model.']
    },
    {
      check_id: 'chain_flow_and_branch_records_visible',
      passed: fileContains(componentFile, 'zg-chain-flow')
        && fileContains(componentFile, 'zg-branch-records')
        && fileContains(styleFile, 'zg-chain-branch-grid'),
      evidence: ['GUI renders full chain flow and branch records from the runtime decision projection.']
    },
    {
      check_id: 'expert_context_pack_and_run_log_available',
      passed: fileContains(decisionRuntimeFile, 'expert_context_pack.v1')
        && fileContains(decisionRuntimeFile, 'parallel_expert_run_log.v1')
        && fileContains(latestGuiStateFile, 'expert_context_pack.v1')
        && fileContains(latestGuiStateFile, 'parallel_expert_run_log.v1'),
      evidence: ['Decision runtime and latest GUI state include per-expert context packs plus a parallel expert run log.']
    },
    {
      check_id: 'romantic_coordinator_and_send_gate_available',
      passed: fileContains(decisionRuntimeFile, 'romantic_relationship_coordinator_expert.v1')
        && fileContains(decisionRuntimeFile, 'send_gate_transfer_path.v1')
        && fileContains(latestGuiStateFile, 'romantic_relationship_coordinator_expert.v1')
        && fileContains(latestGuiStateFile, 'send_gate_transfer_path.v1'),
      evidence: ['Runtime coordinator produces frontend display and send-gate transfer contracts.']
    },
    {
      check_id: 'console_detail_log_visible',
      passed: fileContains(componentFile, 'zg-detail-log')
        && fileContains(componentFile, 'expertRunRows')
        && fileContains(componentFile, 'sendGateRows')
        && fileContains(styleFile, 'zg-chat-log-entry'),
      evidence: ['Console separates detailed coordinator logs, expert run logs and send-gate logs.']
    },
    {
      check_id: 'dock_uses_brief_runtime_status',
      passed: fileContains(componentFile, 'getDockBriefFromRuntimeState')
        && fileContains(componentFile, 'getDockBriefFromRuntimeState(runtimeState)')
        && fileContains(componentFile, 'dockRuntimeDecisionState')
        && fileContains(componentFile, 'zhineng:decision-state:get')
        && fileContains(styleFile, 'zg-dock-marquee'),
      evidence: ['Floating dock uses the runtime display contract brief status while detailed logs stay in console.']
    },
    {
      check_id: 'ui_surface_boundaries_declared',
      passed: fileContains(decisionRuntimeFile, 'placement_policy')
        && fileContains(decisionRuntimeFile, 'context_interface')
        && fileContains(decisionRuntimeFile, 'boundary_policy')
        && fileContains(latestGuiStateFile, 'placement_policy')
        && fileContains(latestGuiStateFile, 'only_confirmed_draft_payload_allowed'),
      evidence: ['Frontend display contract declares dock placement, read-only context interfaces, surface boundaries and send-window payload limits.']
    },
    {
      check_id: 'third_party_prompt_cards_visible',
      passed: fileContains(componentFile, '第三方提示')
        && fileContains(componentFile, 'thirdPartyPrompts')
        && fileContains(styleFile, 'zg-third-party-prompts'),
      evidence: ['GUI renders user-visible third-party prompt cards when active input remains blocked.']
    },
    {
      check_id: 'relationship_and_goal_controls_visible',
      passed: fileContains(componentFile, 'relationshipOptions') && fileContains(componentFile, 'goalOptions'),
      evidence: ['GUI exposes person relationship classification and goal controls.']
    },
    {
      check_id: 'adaptive_follow_up_available',
      passed: fileContains(componentFile, 'FOLLOW_UP_PRESETS') && fileContains(componentFile, 'autoFollowUp'),
      evidence: ['Target person classification can adaptively map to a follow-up goal and next action.']
    },
    {
      check_id: 'dock_visual_state_available',
      passed: fileContains(componentFile, 'zg-dock-orb') && fileContains(styleFile, 'zg-dock-pulse'),
      evidence: ['Floating dock icon has visual status and pulse animation.']
    },
    {
      check_id: 'safety_post_layer_visible',
      passed: fileContains(componentFile, 'sensitiveOptimization') && fileContains(componentFile, '真实发送必须人工确认'),
      evidence: ['GUI separates theoretical prediction from storage and send safety checks.']
    },
    {
      check_id: 'reply_modes_runtime_policy_available',
      passed: existsSync(files[6].path) && fileContains(files[6].path, 'first_person_as_user') && fileContains(files[6].path, 'third_person_explanation'),
      evidence: ['reply_mode_plan.v1 supports first-person and third-person outputs.']
    },
    {
      check_id: 'real_send_still_blocked_by_design',
      passed: fileContains(componentFile, '仍不执行真实发送') && fileContains(files[3].path, '真实发送'),
      evidence: ['GUI confirmation only prepares controlled-send material and does not execute real sending.']
    }
  ];
  const requiredFailures = checks.filter((check) => !check.passed).map((check) => check.check_id);

  return {
    schema_version: 'gui_control_panel_report.v1',
    report_id: `gui_control_panel_report_${timestampId(new Date(createdAt))}`,
    created_at: createdAt,
    gate_decision: requiredFailures.length === 0 ? 'gui_control_panel_ready_for_operator_review' : 'stop_and_fix_gui_control_panel',
    required_failures: requiredFailures,
    files,
    checks,
    recommended_verification_commands: [
      'cd sightflow-desktop-agent-main; npm.cmd run typecheck',
      'npm.cmd run pt028:gui-state',
      'node --test packages/mvp-runtime/tests/*.test.mjs',
      'npm.cmd run process-tree:validate'
    ]
  };
}

function renderMarkdown(report) {
  const checkRows = report.checks
    .map((check) => `| ${check.check_id} | ${check.passed ? 'pass' : 'fail'} | ${check.evidence.join('<br>')} |`)
    .join('\n');
  const fileRows = report.files
    .map((file) => `| ${file.path} | ${file.exists ? 'yes' : 'no'} | ${file.description} |`)
    .join('\n');

  return `# GUI 控制台验证报告
- report_id: ${report.report_id}
- gate_decision: ${report.gate_decision}
- required_failures: ${report.required_failures.join(', ') || 'none'}

## 文件证据

| path | exists | description |
| --- | --- | --- |
${fileRows}

## 检查项

| check_id | status | evidence |
| --- | --- | --- |
${checkRows}

## 建议验证命令

\`\`\`powershell
${report.recommended_verification_commands.join('\n')}
\`\`\`
`;
}

const report = buildReport();
const outputDir = path.resolve('runtime/gui-control-panel-validations', report.report_id);
mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, 'gui-control-panel-report.json');
const markdownPath = path.join(outputDir, 'gui-control-panel-report.md');
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
writeFileSync(markdownPath, renderMarkdown(report), 'utf8');

console.log(JSON.stringify({
  command: 'write-gui-control-panel-report',
  report_id: report.report_id,
  gate_decision: report.gate_decision,
  required_failures: report.required_failures,
  json_path: jsonPath,
  markdown_path: markdownPath
}, null, 2));
