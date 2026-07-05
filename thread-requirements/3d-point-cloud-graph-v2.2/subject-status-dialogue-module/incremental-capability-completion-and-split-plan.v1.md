# 主体状态对话框不完全具备内容补全与增量拆分计划 v1

状态：待用户确认后实施。  
原则：边构建新功能，边拆分被新功能触碰到的边界；不做一次性大搬家。  
范围：主体状态对话框自有能力、语音闭环、多音色/克隆声音配置、TTS adapter、状态审查对话基础，以及相关代码目录拆分。

## 背景判断

当前基础已经能支撑继续推进：

- 文字对话链路可用。
- 浏览器 STT transcript 已能进入同一条对话链路。
- 浏览器 TTS 已能朗读 `StatusDialogueOutput.voiceText`。
- 主进程已有状态快照、真实环境检查、模型测试和对话 IPC。
- 3D 粒子 OS 已有主体状态对话框、语音端口和 voice profile/clone profile 占位。

当前不完全具备的内容：

- `implementation-progress.v1.md` 顶部仍保留旧边界描述，需要同步口径。
- `voice_profile.v1` 仍是计划和占位，缺少正式类型、默认值、归一化、读取链路和 UI 绑定。
- `clone_profile.v1` 仍是计划和占位，缺少正式类型、默认值、归一化和状态展示。
- `tts_adapter.v1` 还没有真实 adapter registry、健康检查、音色列表和合成测试 IPC。
- 音色选择 UI 未实现。
- TTS 输出链路缺少 `voice_response_plan.v1`、输出 trace、延迟统计和 fallback 记录。
- 状态节点和进度审查还停留在状态卡读取和巡逻摘要，尚未进入更完整的“节点/进度审查 -> 自然对话编排”。
- 代码还分布在 `status-dialogue-contracts.ts`、`src/main/index.ts`、`ZhinengConsole.tsx` 和 `zhineng-console.css` 中，没有独立业务目录。
- 缺少主体状态对话框专属测试；当前主要依赖 `typecheck`、`build` 和人工/截图验证。

## 增量拆分原则

1. 只拆正在补齐的功能边界，不纯粹搬文件。
2. 保留兼容导出，避免其他线程引用旧路径时被打断。
3. IPC 通道名保持不变，尤其是：
   - `zhineng:status-dialogue:snapshot:get`
   - `zhineng:status-dialogue:real-env:check`
   - `zhineng:status-dialogue:model:test`
   - `zhineng:status-dialogue:complete`
4. CSS class 第一阶段保持不变，先抽组件和 hook，再整理样式文件。
5. 每一步都必须跑 `npm.cmd run typecheck`；触及 UI 或 Electron IPC 时跑 `npm.cmd run build`。
6. 每一步都要更新本目录文档和 `implementation-progress.v1.md`。

## 目标拆解

| 编号 | 不完全具备内容 | 补全目标 | 同步拆分动作 | 是否需要用户确认 |
| --- | --- | --- | --- | --- |
| C0 | 进度文件口径不一致 | 把旧边界改为“历史阶段边界”，新增当前真实状态摘要 | 只改文档 | 否 |
| C1 | 契约文件过大 | 新增独立 `src/core/status-dialogue/`，拆出 voice、snapshot、guard、speech ports | 旧 `status-dialogue-contracts.ts` 保持 re-export | 否 |
| C2 | `voice_profile.v1` 缺实现 | 增加类型、默认值、归一化、浏览器 voice 映射 | 放入 `src/core/status-dialogue/voice-profile.ts` | 是 |
| C3 | `clone_profile.v1` 缺实现 | 增加类型、默认值、归一化、不可用时 fallback | 放入 `src/core/status-dialogue/clone-profile.ts` | 是 |
| C4 | 音色选择 UI 缺失 | 右侧窗口增加 Voice 区，可选浏览器 voice/profile | 抽 `useStatusDialogueVoice` hook | 是 |
| C5 | TTS adapter 缺真实边界 | 增加 adapter config、health、list voices、test synthesize IPC | 抽 `src/main/status-dialogue/tts-adapter.ts` | 是 |
| C6 | 输出链路不可追溯 | 增加 `voice_response_plan.v1` 和 `voice.output_trace` | 抽 `voice-response-plan.ts` | 否 |
| C7 | 状态/进度审查不足 | 读取状态卡后生成节点/进度审查摘要 | 后续抽 `useStatusDialoguePatrol` | 是 |
| C8 | UI 组件过大 | 拆 `StatusDialoguePanel`，保留父组件传参 | 新增 `src/renderer/src/status-dialogue/` | 否 |
| C9 | 测试不足 | 给纯函数补最小单测或验证脚本 | 新增测试/验证入口 | 是 |

## 实施阶段

### Step 0：文档口径同步

目的：先让 `implementation-progress.v1.md` 不再自相矛盾。

动作：

- 把顶部“当前仍不接真实 STT/TTS、不捕获麦克风”改为历史 Phase 0/1 边界说明。
- 新增当前真实状态摘要：
  - 浏览器 STT 已启用，需要用户点击。
  - 浏览器 TTS 已启用，只朗读 `voiceText`。
  - 不保存音频样本。
  - 不接真实第三方 STT/TTS。
  - 不接世界核心和图谱。

验收：

- `rg "不捕获麦克风|browser_speech_recognition|voice_profile.v1|clone_profile.v1" implementation-progress.v1.md`
- 顶部状态与后续 2026-06-25 记录不冲突。

### Step 1：契约目录拆分，同时补 `voice_profile.v1`

目的：先把最稳定的纯契约层拆出来，并补齐音色配置基础。

新增建议：

- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\index.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\schemas.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\config.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\voice-profile.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\snapshot.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\output-guard.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\speech-ports.ts`

兼容策略：

- 旧文件 `src/core/status-dialogue-contracts.ts` 不删除，改为从 `src/core/status-dialogue/index.ts` re-export。
- `ZhinengConsole.tsx` 和 `src/main/index.ts` 可以暂时继续引用旧路径。

补齐内容：

- `VoiceProfile`
- `VoiceProfileStatus`
- `VoiceEmotionPreset`
- `DEFAULT_BROWSER_VOICE_PROFILE`
- `DEFAULT_TEXT_ONLY_VOICE_PROFILE`
- `normalizeVoiceProfile`
- `buildBrowserVoiceProfiles`
- `selectVoiceProfileFallback`

验收：

- `npm.cmd run typecheck`
- `rg "VoiceProfile|voice_profile.v1|normalizeVoiceProfile|buildBrowserVoiceProfiles" src/core`

需要确认：

- 是否允许先把浏览器 voice 映射成临时 `voice_profile.v1`，第一阶段不持久化用户选择。
- 是否使用 `voice.default.browser.zh-CN` 作为默认 profile id。

### Step 2：右侧 Voice 区和浏览器多音色选择

目的：先跑通多音色选择 UI，不接第三方 TTS。

新增建议：

- `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\status-dialogue\useStatusDialogueVoice.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\status-dialogue\StatusDialogueVoicePanel.tsx`

动作：

- 从 `window.speechSynthesis.getVoices()` 读取浏览器 voices。
- 映射为 `voice_profile.v1`。
- 右侧主体状态对话框新增紧凑 Voice 区：
  - 当前音色。
  - profile selector。
  - adapter 状态。
  - fallback 状态。
  - 测试朗读按钮。
- TTS 播放时使用当前 profile 的 voice、speed、pitch、volume。

保持不变：

- 仍只朗读 `voiceText`。
- 文字对话不受 voice on/off 影响。
- 不接世界核心。

验收：

- `npm.cmd run typecheck`
- `npm.cmd run build`
- UI 可见 Voice 区。
- 切换音色后发送一句话，朗读音色变化。
- 浏览器无 voices 时回退默认浏览器 TTS 或 text only。

需要确认：

- 音色选择是否第一阶段只存在于当前页面状态，不写入磁盘。
- 是否需要在 UI 中展示中文/英文/本地/远程音色过滤。

### Step 3：`voice_response_plan.v1` 和输出 trace

目的：让每次语音输出可追溯，为后续真实 TTS/克隆打基础。

新增建议：

- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\voice-response-plan.ts`

补齐内容：

- `VoiceResponsePlan`
- `VoiceOutputTrace`
- `buildVoiceResponsePlan`
- `buildVoiceOutputTrace`

UI 表达：

- 最近一次语音输出显示：
  - `source_output_id`
  - `voice_profile_id`
  - adapter
  - fallback
  - latency

3D 映射：

- `voice.voice_response_plan`
- `voice.output_trace`
- `voice.fallback_policy`

验收：

- `rg "voice_response_plan.v1|VoiceOutputTrace|voice.output_trace" src`
- `npm.cmd run typecheck`

需要确认：

- 是否允许记录最近 N 次语音输出 trace 到内存状态。
- 是否暂不写入 `runtime/status-dialogue/tts-cache`。

### Step 4：TTS adapter 框架和主进程拆分

目的：建立真实 TTS 服务接入口，但先不绑定具体工具。

新增建议：

- `D:\zhineng\sightflow-desktop-agent-main\src\main\status-dialogue\ipc.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\main\status-dialogue\snapshot-reader.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\main\status-dialogue\real-env-check.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\main\status-dialogue\model-probe.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\main\status-dialogue\tts-adapter.ts`

新增 IPC 建议：

- `zhineng:status-dialogue:tts:health`
- `zhineng:status-dialogue:tts:voices:list`
- `zhineng:status-dialogue:tts:synthesize:test`

兼容策略：

- 旧 IPC 不改名。
- `src/main/index.ts` 只注册模块函数，不再承载全部实现细节。

验收：

- `npm.cmd run typecheck`
- `npm.cmd run build`
- 无 adapter 配置时返回 fallback，不影响浏览器 TTS。
- 不创建 `requirement_packet.v1`。
- 不写世界模型、人际图谱、事件图谱。

需要确认：

- 第一版真实 TTS adapter 是否只做 `local_http`，不做本地进程托管。
- 第一版真实 TTS 工具是否先不选，等 adapter 框架完成后再选 `Kokoro` / `Piper` / `CosyVoice`。

### Step 5：`clone_profile.v1` 插件位

目的：让克隆声音先具备配置和状态，而不是直接进入训练/样本处理。

新增建议：

- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\clone-profile.ts`
- 未来可加 `D:\zhineng\sightflow-desktop-agent-main\src\main\status-dialogue\clone-profile-reader.ts`

补齐内容：

- `CloneProfile`
- `CloneProfileStatus`
- `DEFAULT_UNCONFIGURED_CLONE_PROFILE`
- `normalizeCloneProfile`
- `isCloneProfileReady`

UI 表达：

- 克隆状态：`not_configured`、`sample_required`、`ready`、`error`。
- 未 ready 时不可选择或自动 fallback。

验收：

- 没有克隆 profile 时，普通 TTS 不受影响。
- UI 能显示克隆能力未配置。
- 不保存原始音频样本。

需要确认：

- 是否确认第一阶段不保存任何原始音频样本，只保存 profile 元数据和外部服务引用。
- 真实克隆工具是否后续优先 `CosyVoice`，再评估 `GPT-SoVITS` / `OpenVoice`。

### Step 6：状态节点和进度审查对话基础

目的：把第二目标纳入同一模块，但不抢 P0 语音优先级。

补齐内容：

- 把状态快照中的状态卡、缺失项、过期项、冲突项整理为“节点/进度审查摘要”。
- 对话模型上下文中增加 `patrol_review_summary`。
- 本地 fallback 可回答：
  - 哪些模块有状态卡。
  - 哪些模块缺失。
  - 哪些模块过期。
  - 当前进度阻塞在哪个闸口。

拆分建议：

- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\patrol-review.ts`
- 后续再抽 `useStatusDialoguePatrol.ts`

验收：

- 没有状态卡时能说明缺失模块。
- 有状态卡时能引用 fresh/stale/missing。
- 不读取模块内部数据，只读状态卡摘要。

需要确认：

- 是否允许把“系统节点和进度审查”作为 P1，在 P0.1/P0.2 完成后启动。
- 是否保持状态卡为唯一状态输入，不直接读取其他模块内部文件。

### Step 7：Renderer 面板组件拆分

目的：降低 `ZhinengConsole.tsx` 体积，但不重写 3D 图。

新增建议：

- `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\status-dialogue\StatusDialoguePanel.tsx`
- `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\status-dialogue\useStatusDialogueModel.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\status-dialogue\useStatusDialogueSpeechInput.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\status-dialogue\useStatusDialogueSnapshot.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\status-dialogue\types.ts`

策略：

- 先把纯 helper 和 hook 抽出。
- 再把右侧面板 JSX 抽成组件。
- 3D 粒子图数据暂时仍留在 `ZhinengConsole.tsx`，只通过 props 传给面板。

验收：

- `npm.cmd run typecheck`
- `npm.cmd run build`
- 右侧面板视觉不回退。
- STT、TTS、文字输入、状态摘要仍可用。

需要确认：

- 是否同意 CSS class 暂时不重命名，避免视觉回归。

### Step 8：测试和验证补齐

目的：让后续拆分有更稳的护栏。

建议补齐：

- 纯函数测试：
  - `normalizeVoiceProfile`
  - `normalizeCloneProfile`
  - `buildVoiceResponsePlan`
  - `buildStatusSnapshotFromCards`
  - `guardStatusDialogueOutput`
  - `buildStatusDialogueSpeechPortsState`
- 行为验证：
  - 浏览器无 Electron IPC -> fallback。
  - 无语音能力 -> text fallback。
  - 切换 voice profile -> TTS 使用所选 profile。
  - clone profile 未 ready -> fallback。

命令：

```powershell
cd D:\zhineng\sightflow-desktop-agent-main
npm.cmd run typecheck
npm.cmd run build
```

如果添加测试脚本，需要再确认测试 runner。当前项目已有 TypeScript 和 Electron 测试入口，但没有主体状态对话框专属 test script。

需要确认：

- 是否允许新增最小测试脚本，例如 `npm run status-dialogue:test`。
- 是否优先只加纯函数测试，UI 自动化留到后续。

## 推荐下一步实施范围

我建议下一轮只实施：

1. Step 0：进度文档口径同步。
2. Step 1：拆核心契约目录，并补 `voice_profile.v1`。
3. Step 2：实现浏览器多音色选择 UI。
4. Step 3：补 `voice_response_plan.v1` 和内存态 output trace。

暂不实施：

- 真实 TTS 工具接入。
- 克隆声音真实服务。
- 状态/进度审查 P1。
- 完整 Renderer 面板大拆。

这样能先把 P0 的“完整流畅对话 + 多音色输出”打稳，同时开始形成独立目录结构。

## 待用户确认点

请确认以下决策后再进入实现：

1. 是否确认下一轮只做 Step 0-3。
2. 是否确认旧 `status-dialogue-contracts.ts` 保留为兼容 re-export，不立刻改所有引用路径。
3. 是否确认第一版音色选择只使用浏览器 voice list，不接第三方 TTS。
4. 是否确认第一版音色选择只保存在当前页面状态，暂不写入磁盘配置。
5. 是否确认 `voice.default.browser.zh-CN` 作为默认 voice profile id。
6. 是否确认 `clone_profile.v1` 第一阶段只做元数据和状态位，不保存原始音频样本。
7. 是否确认 CSS class 暂不重命名，只抽组件和 hook。
8. 是否确认 P1“系统节点和进度审查”在 P0.1/P0.2 完成后再启动。
9. 是否允许后续新增主体状态对话框专属测试脚本。

## 边界保持

本计划实施期间继续保持：

- 不写世界模型。
- 不创建 `requirement_packet.v1`。
- 不接真实人际关系图谱。
- 不接真实事件图谱。
- 不执行外部动作。
- 不保存原始音频样本。
- 不改变现有 IPC 通道名。
- 不重写 3D 粒子图主体结构。
