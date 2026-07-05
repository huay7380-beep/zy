# 主体状态对话框 Phase 0/1 真实实现记录

更新时间：2026-06-23

状态：Phase 0 和 Phase 1 的真实实现已进入当前代码基线。当前只实现主体状态对话框的自有功能，不接入世界核心、人际关系图谱、事件图谱或外部动作通道。

## 当前范围

- Phase 0：真实环境与边界检查。
- Phase 1：真实模型 API 探测入口与可追溯 UI 状态位。
- 运行模式固定为 `patrol_only`。
- 语音输入只检查浏览器能力，不申请麦克风权限，不录音，不保存音频。
- API 探测只在用户点击 `test api` 时执行，不自动调用模型。
- 所有结果只进入右侧主体状态对话框 UI、3D 粒子 OS 星云投射和本阶段文档说明。

## 代码落点

- 契约层：`D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue-contracts.ts`
- 主进程：`D:\zhineng\sightflow-desktop-agent-main\src\main\index.ts`
- 渲染层和 3D 星云：`D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\ZhinengConsole.tsx`
- 样式层：`D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\zhineng-console.css`

## 新增契约

- `status_dialogue_real_env_check.v1`
- `status_dialogue_model_test.v1`
- `StatusDialogueRealEnvCheckResult`
- `StatusDialogueModelTestResult`
- `StatusDialogueRealCheckItem`
- `StatusDialogueProviderReadiness`
- `StatusDialogueBrowserSpeechCapabilities`

这些契约只描述主体状态对话框自身的真实接入状态，不描述世界核心内部状态。

## IPC 接口

### Phase 0 环境检查

- IPC：`zhineng:status-dialogue:real-env:check`
- 输入：
  - renderer 传入的浏览器能力摘要。
  - main process 读取的模型 provider 配置摘要。
- 输出：
  - `status_dialogue_real_env_check.v1`
  - provider 是否配置、api key 是否存在、模型名、base URL host。
  - SpeechSynthesis、getUserMedia、MediaRecorder、SpeechRecognition 等浏览器能力位。
  - 边界锁状态。
- 边界：
  - 不申请麦克风权限。
  - 不创建文件。
  - 不调用模型 API。
  - 不写世界模型。

### Phase 1 模型 API 探测

- IPC：`zhineng:status-dialogue:model:test`
- 输入：
  - 当前配置中的 OpenAI-compatible provider。
  - 一条极短的连接测试 prompt。
- 输出：
  - `status_dialogue_model_test.v1`
  - provider、model、base URL host、latency、reply preview 或错误摘要。
- 边界：
  - 不暴露 API key。
  - 不自动执行，必须由 UI 按钮触发。
  - 不创建 `requirement_packet.v1`。
  - 不写世界核心、人际图谱或事件图谱。
  - 不执行外部动作。

## UI 映射

右侧 `Subject Status Dialogue` 巡逻窗口新增 `real phase 0 and phase 1 status` 区块：

- `phase 0`：显示真实环境检查状态。
- `phase 1`：显示真实 API 探测状态。
- `provider`：显示当前 provider 标签。
- `model`：显示当前模型名。
- `check env`：重新执行 Phase 0 环境检查。
- `test api`：显式执行 Phase 1 API 探测。
- `source`：显示结果来源，可能是 `main_process` 或 `browser_preview`。
- 检查项列表：每个检查项带 input/output/ref 的 title，可追溯到具体接口。

静态网页或无 Electron IPC 时，UI 会显示 `browser_preview` fallback，不影响文字对话。

## 3D 粒子 OS 映射

`status-dialogue-system` 星云新增 Phase 0/1 子粒子：

- `real-phase0-env-check`
- `real-phase0-provider-config`
- `real-phase0-browser-voice`
- `real-phase0-boundary-lock`
- `real-phase1-api-test`
- `real-phase1-openai-compatible-io`
- `real-phase1-fallback-guard`

每个子粒子都包含：

- `inputs`：该能力读取或接收的输入。
- `outputs`：该能力产生的输出契约或 UI 状态。
- `refs`：对应 IPC、配置或契约引用。

在 3D 点云中，点击 `status-dialogue-system` 星云后，可以在左侧星云目录看到这些子粒子。点击具体子粒子后，左侧 inspector 会显示该粒子的 `io` 和 `refs`，用于从点云直接追溯输入输出。

## 星云目录查询

星云目录中的每个子粒子按钮会显示：

- 名称。
- 当前状态。
- 第一组 `input -> output` 摘要。

目录和点云使用同一份 `GraphStar.io` 数据，避免 UI 和拓扑记录不一致。

## 当前未接入内容

- 不接真实 STT 工具。
- 不接真实 TTS 工具，仅保留浏览器 `speechSynthesis` 输出能力。
- 不接世界核心状态总线。
- 不接人际关系辅助系统。
- 不接事件图谱或全域事件图谱。
- 不接自我意识图谱。
- 不执行需求传递。
- 不写 `runtime/status-snapshots/current-status-snapshot.json`。

## 验证方案

- 文档检索：
  - `rg "status_dialogue_real_env_check|status_dialogue_model_test|real-phase0|real-phase1" D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\subject-status-dialogue-module`
- 代码检索：
  - `rg "zhineng:status-dialogue:real-env:check|zhineng:status-dialogue:model:test|GraphStar.*io|zg-real-integration" D:\zhineng\sightflow-desktop-agent-main\src`
- 类型验证：
  - `npm.cmd run typecheck`
- 构建验证：
  - `npm.cmd run build`
- UI 验证：
  - 打开 3D 粒子 OS。
  - 确认右侧 `Subject Status Dialogue` 出现 Phase 0/1 状态块。
  - 点击 `check env` 后可看到环境检查更新。
  - 点击 `test api` 后可看到真实 API 探测结果或明确错误。
  - 点击 `status-dialogue-system` 星云和 Phase 0/1 子粒子后，可在 inspector 和目录看到 input/output/ref。

## 验收边界

本阶段通过条件：

- Phase 0/1 状态能在 UI 中查看。
- Phase 0/1 子模块能在 3D 粒子 OS 中作为子粒子查看。
- 每个子粒子有明确 input/output/ref。
- 无 Electron IPC 时仍能 fallback。
- 缺 API key 或 API 失败时不影响本地文字对话。
- 不新增世界核心、人际图谱、事件图谱或外部动作接入。
