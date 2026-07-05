# 主体状态对话框语音输入输出实现记录

更新时间：2026-06-23

状态：已启用主体状态对话框自有语音输入输出能力。当前实现只属于主体状态对话框，不接入世界核心、人际关系图谱、事件图谱或外部动作通道。

## 当前能力

### 语音输入 STT

- 适配器：`browser_speech_recognition`
- 浏览器接口：
  - `window.SpeechRecognition`
  - `window.webkitSpeechRecognition`
- 输入：
  - 浏览器麦克风权限提示。
  - 浏览器语音识别音频流。
- 输出：
  - `speech_transcript`
  - `DialogueInputEnvelope.input_kind=speech_transcript`
- 行为：
  - 点击右侧对话框 `STT` 按钮启动语音识别。
  - 点击 `STT` 时同步开启 `voice on`，形成语音输入到语音输出的闭环；用户仍可手动关闭语音输出。
  - 启动 SpeechRecognition 前会先执行 `navigator.mediaDevices.getUserMedia({ audio: true })` 权限预检。
  - 权限预检拿到音频 track 后立即关闭 track，只用于确认当前应用可访问麦克风。
  - 识别过程中按钮显示 `stop`，可停止当前识别。
  - 实时 transcript 会显示在语音状态行。
  - 最终 transcript 会进入同一条主体状态对话提交路径。
  - 若浏览器不支持 SpeechRecognition，则回退到文字输入并在日志中显示原因。
  - 若出现 `not-allowed`，会显示更明确的麦克风权限提示。
- 边界：
  - 不保存音频样本。
  - 权限预检不持有音频流，获取后立即停止 track。
  - 不写入世界模型。
  - 不触发外部动作。
  - 不读取真实人际或事件图谱。

### 语音输出 TTS

- 适配器：`browser_speech_synthesis`
- 浏览器接口：
  - `window.speechSynthesis`
  - `SpeechSynthesisUtterance`
- 输入：
  - `StatusDialogueOutput.voiceText`
  - `voiceEnabled`
- 输出：
  - 浏览器语音播放。
  - `visible_tts_status`
- 行为：
  - 右侧窗口 `voice on/off` 控制语音输出。
  - 仅朗读 `voiceText`。
  - 不朗读完整上下文、状态卡、日志、隐藏推理或模型原始输出。

## UI 映射

右侧 `Subject Status Dialogue` 巡逻窗口新增/更新：

- `STT` 按钮：启动浏览器语音输入。
- `stop` 状态：停止当前语音识别。
- 语音状态行：显示 `mic ready/off/fallback/listening`、转写文本或错误。
- STT/TTS 端口卡：显示当前 adapter、status、fallback。

## 3D 粒子 OS 映射

`status-dialogue-system` 星云下更新以下子粒子：

- `voice.stt_adapter`
  - `inputs`: `microphone_permission_prompt`, `browser_speech_audio_stream`
  - `outputs`: `speech_transcript`, `DialogueInputEnvelope.input_kind=speech_transcript`
  - `refs`: `window.SpeechRecognition`, `window.webkitSpeechRecognition`, `speech_input.browser_speech_recognition`
- `voice.tts_adapter`
  - `inputs`: `StatusDialogueOutput.voiceText`, `voiceEnabled`
  - `outputs`: `browser_speech_audio_output`, `visible_tts_status`
  - `refs`: `window.speechSynthesis`, `SpeechSynthesisUtterance`, `speech_output.browser_speech_synthesis`
- `voice_dialogue`
  - `inputs`: `speech_transcript`, `focused_graph_context`, `status_snapshot.v1`
  - `outputs`: `first_person_reply`, `voiceText`, `attention_log`
  - `refs`: `submitDialogue(inputKind=speech_transcript)`, `zhineng:status-dialogue:complete`

这些子粒子会在星云目录中显示 `input -> output` 摘要，并能在 inspector 中查看 `io` 和 `refs`。

## 代码落点

- 契约层：`D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue-contracts.ts`
- 主进程权限层：`D:\zhineng\sightflow-desktop-agent-main\src\main\index.ts`
- UI 和运行态：`D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\ZhinengConsole.tsx`
- 样式层：`D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\zhineng-console.css`

## not-allowed 修复记录

- 主进程新增 Electron media permission handler。
- 只允许 `zhineng-graph` 窗口请求 audio media 权限。
- 不允许 video media 权限。
- 其他窗口和其他 permission 默认不放行。
- Renderer 在启动 STT 前先做麦克风权限预检，失败时显示具体原因：
  - `NotAllowedError`：应用或系统麦克风权限被拒绝。
  - `NotFoundError`：没有可用麦克风。
  - `NotReadableError`：麦克风被占用或不可读取。

## 验证方案

- 类型验证：
  - `npm.cmd run typecheck`
- 构建验证：
  - `npm.cmd run build`
- UI 验证：
  - 打开 3D 粒子 OS。
  - 确认右侧 `Subject Status Dialogue` 显示 STT/TTS 端口。
  - 点击 `voice on` 后发送文字，确认 TTS 可朗读 `voiceText`。
  - 点击 `STT` 后确认按钮进入 `stop/listening` 状态。
  - 说话后确认 transcript 进入对话路径。
  - 如果浏览器不支持 STT，确认日志显示 fallback，文字输入不受影响。
- 边界验证：
  - 确认未新增音频文件写入。
  - 确认未新增世界核心、人际图谱、事件图谱写入。
  - 确认语音输出只朗读 `voiceText`。
  - 确认 Electron 只对 `zhineng-graph` 窗口放行 audio media 权限。

## 当前限制

- 浏览器 SpeechRecognition 支持情况依赖运行环境。
- 浏览器可能弹出麦克风权限提示。
- 未接入本地 Whisper/FunASR 等真实 STT 工具。
- 未接入 Kokoro/CosyVoice 等可选 TTS 工具。
- 未实现连续唤醒词和长时后台监听。

## 2026-06-25 真实重启验证记录

- 已重启可见 GUI 实例：新的主窗口进程为 `PID 9116`，启动时间 `2026-06-25 10:28:47`。
- 已打开 3D 粒子 OS，并确认右侧 `Subject Status Dialogue` 巡逻状态窗口可见。
- `npm.cmd run typecheck` 通过。
- `npm.cmd run build` 通过。
- 浏览器预览页点击 `STT` 后，错误不再停留在旧的 `not-allowed` 表达，而显示为没有可用麦克风输入设备。
- Windows 设备枚举结果显示：
  - `麦克风 (High Definition Audio Device)` 可枚举。
  - `Status = Unknown`。
  - `DEVPKEY_Device_IsPresent = False`。
- Windows 麦克风全局权限注册表值为 `Allow`，说明当前更像是输入端点未激活/未在场，而不是应用层全局隐私开关拒绝。
- 当前结论：应用层 Electron audio media permission handler 与 renderer `getUserMedia` 预检已经进入运行路径；本次真实失败点在系统麦克风端点不可用。需要先让 Windows 录音设备变为可用/活动状态，再继续验证 SpeechRecognition transcript。

保留边界：本次验证未保存音频样本，未写入世界模型，未接入人际图谱/事件图谱，未触发需求传递或外部动作。

## 2026-06-25 麦克风恢复后复测

- Windows 录音端点已恢复：
  - `麦克风 (High Definition Audio Device)` 状态为 `OK`。
  - `DEVPKEY_Device_IsPresent = True`。
  - `DEVPKEY_Device_HasProblem = False`。
  - `DEVPKEY_Device_LastArrivalDate = 2026-06-25 11:54:37`。
- 3D 粒子 OS 右侧主体状态对话框显示 `MIC READY / speech transcript idle`。
- 点击 `STT` 后，按钮进入 `stop` 状态，状态行进入 `LISTENING / speech transcript idle`。
- Windows 任务栏麦克风图标同步亮起，说明浏览器/页面已经实际获得麦克风输入。
- 验证后已手动点击 `stop` 停止监听，避免持续占用麦克风。

当前结论：麦克风连接和页面级 STT 采集入口已经恢复可用；后续需要由操作者说话验证 transcript 文本是否能稳定进入 `DialogueInputEnvelope.input_kind=speech_transcript`。

## 2026-06-25 transcript 对话链路修复

问题：操作者语音可以被浏览器识别，状态行能看到 transcript，但对话框没有进入提交/回复链路。

原因：旧实现只在 `SpeechRecognitionResult.isFinal === true` 时调用 `submitDialogue(finalText, "speech_transcript")`。部分浏览器会先持续输出 interim transcript，但不稳定给出 final result；这会导致语音文本停留在状态行。

修复：
- 新增 STT 会话级 transcript draft 缓存。
- `onresult` 改为汇总当前识别会话的全部 final/interim 文本，而不是只处理本次 `resultIndex` 之后的片段。
- 如果收到 final transcript，仍立即提交。
- 如果只收到 interim transcript，`onend` 会把最后缓存的 transcript 兜底提交到 `submitDialogue(transcript, "speech_transcript")`。
- 点击 `stop` 或浏览器自然结束识别时，都可以触发该兜底提交。

验证：
- `npm.cmd run typecheck` 通过。
- `npm.cmd run build` 通过。

当前预期：点击 `STT` 后说话，状态行出现文字后，等待识别自然结束或点击 `stop`，该文字应进入下方对话日志并触发主体状态对话回复。

## 2026-06-25 回复链路与语音自动提交复核

复核结论：
- 文本输入链路正常：输入文字后会进入 `submitDialogue(input, "text")`，右侧对话日志生成用户消息和系统回复。
- 当前 Chrome/Vite 预览页没有 Electron IPC，因此模型来源显示为 `local fallback`；这能证明回复链路正常，但不会调用真实远程模型。
- Electron 环境中 `zhineng:status-dialogue:complete` IPC 存在；若配置了 API key，会尝试 OpenAI-compatible 模型，否则回退为 `local fallback`。

新增修复：
- 语音识别不再只依赖 `isFinal=true`。
- `onresult` 捕获到 interim transcript 后，会缓存最新 transcript。
- 如果 1.2 秒内 transcript 稳定且没有 final，自动把该 transcript 提交到 `submitDialogue(transcript, "speech_transcript")`。
- final transcript 仍然立即提交。
- `stop` / `onend` 仍保留兜底提交。
- 提交后自动停止当前 SpeechRecognition 会话，避免继续占用麦克风。

验证：
- `npm.cmd run typecheck` 通过。
- `npm.cmd run build` 通过。
- Chrome 预览页文字输入测试生成 `12:25:27 / 本地回复`，证明回复链路可用。

当前预期：点击 `STT` 后说话，识别文字不应只停在 `MIC READY/LISTENING` 状态行；文字稳定后会自动进入对话日志并触发回复。若在 Electron 原生图谱窗口中运行且模型 API 已配置，则会优先尝试真实模型；否则进入本地 fallback。

## 2026-06-25 语音链路自动提交验证

验证方式：
- 使用隔离 Chrome 自动化实例打开 `http://localhost:5173/?window=zhineng-graph`。
- 在页面加载前注入 mock `SpeechRecognition` 和 mock `navigator.mediaDevices.getUserMedia`。
- 模拟语音识别返回 transcript：`语音链路自动验证`。
- 点击右侧主体状态对话框 `STT` 按钮后等待自动提交。

验证结果：
- 状态行显示 `MIC READY` 与 transcript。
- transcript 自动进入下方对话日志，生成用户消息 `语音链路自动验证`。
- 随后同一链路生成 `LOCAL FALLBACK` 系统回复，证明 `speech_transcript -> submitDialogue -> requestStatusDialogueModel -> reply` 已打通。
- 截图证据：`D:\zhineng\sightflow-desktop-agent-main\runtime\verification-logs\voice-stt-dialogue-chain-mock-20260625.png`。

边界说明：
- 本次验证不占用真实麦克风，不保存音频样本。
- Chrome/Vite 预览页没有 Electron IPC，因此只能证明对话回复链路会走 `local fallback`。
- 真实模型回复需要在 Electron 原生窗口内运行，并且配置可用 API key。
- 本次验证未写入世界模型、人际图谱、事件图谱或外部动作通道。

## 2026-06-25 对话日志可见性修复

问题：
- 语音 transcript 已经进入 DOM 并触发回复，但日志区域可能滚到长回复底部，只露出引用标签或尾部内容，操作者会感觉 transcript 只停留在 `MIC READY` 状态行。

修复：
- `zg-dialogue-log` 增加 `dialogueLogRef`。
- `dialogueMessages` 更新后滚动到最新消息开头。
- 日志容器增加 `aria-live="polite"`，方便后续可访问性和状态播报。

验证：
- 使用 mock `SpeechRecognition` 返回 transcript：`语音链路最终验证`。
- 右侧日志上一条为用户语音 transcript，最新一条为 `LOCAL FALLBACK` 系统回复。
- 最新消息开头与日志窗口顶部对齐。
- 截图证据：`D:\zhineng\sightflow-desktop-agent-main\runtime\verification-logs\voice-stt-dialogue-chain-final-20260625.png`。
- `npm.cmd run typecheck` 通过。
- `npm.cmd run build` 通过。
