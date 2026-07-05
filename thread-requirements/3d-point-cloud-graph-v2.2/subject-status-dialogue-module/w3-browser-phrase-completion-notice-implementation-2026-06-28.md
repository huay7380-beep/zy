# W3 Browser Phrase And Completion Notice Implementation

日期：2026-06-28
归属：`status-dialogue-system`
范围：主体状态对话框右下角 GUI、W3.0 浏览器短语闭环、完成任务定制播报

## 目标

本次实现把 W3 从“前置条件已具备”推进到“可执行阶段”：

- W3 独立维护 wake detector 状态。
- 只在听到 `小张`、`高手`、`小天才` 后打开 wake window。
- 命中后转交现有 STT 链路，不直接把 detector 音频提交给模型。
- TTS 播放期间只暂停 wake detector，不关闭手动输入和正式 STT。
- 右下角主体状态窗口中显示 W3 stage、adapter、wake window、gate。
- 新增完成任务定制播报能力，复用当前 TTS adapter，并生成可见状态和 trace。

## 实现落点

- `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\ZhinengConsole.tsx`
  - 新增 `W3WakeDetectorStage`。
  - 新增 W3.0 browser phrase detector 启停、监听、暂停、命中、handoff、cooldown 状态机。
  - 新增 `CompletionNoticeState` 与确定性播报函数。
  - 右下角设置面板新增 `start w3 / stop w3` 控制。
  - 右下角设置面板新增 `completion notice` 文本输入、播放按钮和 trace 状态。
  - 3D 粒子 OS 新增 `voice.completion_notice` 星点。
  - 更新 `voice.wake_word_gate` 与 `voice.wake_detector_adapter` 星点为 W3.0 可执行状态。
- `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\zhineng-console.css`
  - 新增完成播报设置控件样式。

## 数据流

```text
right-bottom GUI start w3
  -> W3 browser phrase detector
  -> wake phrase matched
  -> wake_window_open=true
  -> existing STT path
  -> existing dialogue chain
  -> existing TTS path
```

```text
task completion event / manual play
  -> completion_notice.v1 text
  -> selected voice profile
  -> CosyVoice local_http when available
  -> browser SpeechSynthesis fallback
  -> voice_output_trace.v1
  -> visible completion notice status
```

## 边界

- W3.0 使用 `browser_phrase_match_reserved`，不是最终本地 keyword detector。
- 不引入新依赖。
- 不保存原始音频。
- 不创建 `requirement_packet.v1`。
- 不写世界模型、人际图谱、事件图谱或外部动作通道。
- W3 关闭后停止浏览器识别器和 wake window timer。
- TTS 播放中只暂停 wake detector；手动文字输入、正式 STT 和 TTS 不被关闭。

## 验收点

- 默认仍为手动模式，不自动启动后台监听。
- 点击 `start w3` 后，右下角显示 W3 stage 从 `starting` 进入 `listening` 或可解释错误。
- 命中唤醒短语后，右下角显示 `wake_window`，并转交现有 STT。
- TTS 播放中 W3 stage 进入 `paused_tts`。
- 完成播报按钮可使用当前 TTS adapter 播放文本，并显示 `spoken/fallback/error` trace。
- `voice.completion_notice` 可在 3D 粒子 OS 的主体状态对话框星云中查询到。

## 验证记录

- `npm.cmd run typecheck`：通过。
- `npm.cmd run build`：通过；仅有既有 Vite chunk 警告和 npm `store-dir` warning。
- 本地开发服务：`http://[::1]:5173/?window=zhineng-graph` 返回 200。
- 屏幕截图确认 3D 粒子 OS 与右侧主体状态对话框渲染非空白。
- 构建产物检索确认 `start w3`、`completion notice`、`voice.completion_notice`、`browser_phrase_match_reserved` 已进入 `out/renderer`。
- 完成播报验证更正：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\w3-completion-notice-20260628.wav` 由临时 PowerShell 直连请求生成，请求体未强制 UTF-8，CosyVoice 日志显示文本进入服务时已变成 `W3????????...`，该文件不能作为中文播报通过依据。
- UTF-8 修正版验证：CosyVoice health 可达，使用 UTF-8 request body 与显式 `voice=中文女` 生成 `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\w3-completion-notice-utf8-fixed-20260628.wav`。本地 Whisper 对旧文件转写为英文乱码，对修正版转写出中文完成播报语义。
- Node/fetch 对照验证：使用 ASCII Unicode escape 构造中文，再通过 `fetch + JSON.stringify` 生成 `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\w3-completion-notice-node-fetch-escaped-20260628.wav`，本地 Whisper 转写为中文完成播报语义。
- 后续确定性完成播报应走右下角 GUI/Electron `fetch + JSON.stringify` 路径，或使用显式 UTF-8 byte body；不再使用未指定编码的 PowerShell string body 或 PowerShell 管道中文源码作为中文 TTS 验证路径。
