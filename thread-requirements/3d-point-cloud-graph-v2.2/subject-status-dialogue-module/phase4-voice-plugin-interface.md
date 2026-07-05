# Phase 4 语音输入输出插件接口实现记录

状态：Phase 4 已实现 UI 状态位和可替换 adapter 表达。

## 本阶段目标

让主体状态对话框从界面和契约层都能表达语音输入/输出插件位，同时保持当前阶段不接真实 STT/TTS 工具。

## 已实现接口

位置：`D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue-contracts.ts`

- `StatusDialogueSpeechPortKind`
- `StatusDialogueSpeechPortStatus`
- `StatusDialogueSpeechPortState`
- `StatusDialogueSpeechPortsState`
- `StatusDialogueSpeechRuntimeState`
- `buildStatusDialogueSpeechPortsState`

## 当前端口状态

默认配置：

```text
speech_input.enabled = false
speech_input.adapter = none
speech_input.fallback = text_input

speech_output.enabled = true
speech_output.adapter = browser_speech_synthesis
speech_output.fallback = text_only
```

当前行为：

- STT 端口显示为 `off / text_input`。
- STT 入口按钮保留但禁用，不捕获麦克风。
- TTS 端口根据浏览器 `speechSynthesis` 和用户 `voice on/off` 显示 `ready` 或 `off`。
- TTS 仍只朗读 `StatusDialogueOutput.voiceText`，不朗读完整上下文。
- 文字输入和文字输出不受 STT/TTS 状态影响。

## UI 表达

位置：`D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\ZhinengConsole.tsx`

右侧主体状态对话框新增：

- `STT` 插件状态位。
- `TTS` 插件状态位。
- 输入栏左侧预留禁用 `STT` 入口。
- `voice on/off` 继续只控制语音输出是否朗读 `voiceText`。

## 3D 粒子 OS 表达

`status-dialogue-system` 星云新增或细化以下语音星点：

- `voice.stt_adapter`
- `voice.tts_adapter`
- `voice.voice_profile`
- `voice.clone_profile`
- `speech_synthesis`
- `voice_dialogue`

这些星点只表达插件位、状态和未来扩展位置，不表示真实工具已经接入。

## 当前不做

- 不接入 `whisper.cpp`。
- 不接入 `FunASR`。
- 不接入 `Kokoro`。
- 不接入 `CosyVoice`。
- 不捕获麦克风。
- 不读取或保存音频样本。
- 不训练或加载语音克隆配置。
- 不改变模型对话 IPC。
- 不创建 `requirement_packet.v1`。
- 不写世界模型。

## 验收状态

- STT 关闭时文字输入不受影响。
- TTS 关闭时文字输出不受影响。
- TTS 只朗读 `voiceText`。
- 插件状态可在 UI 中显示。
- 插件状态可在 3D 粒子图中找到对应星点。
