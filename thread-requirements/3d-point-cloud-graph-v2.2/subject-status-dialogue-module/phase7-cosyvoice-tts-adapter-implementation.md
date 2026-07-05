# Phase 7 CosyVoice TTS Adapter 实现记录

更新时间：2026-06-25

## 当前目标

本阶段把主体状态对话框的语音输出从“浏览器 voice list 第一版”推进到“CosyVoice 优先、浏览器 TTS fallback”的可运行 adapter 结构。

当前仍不接世界核心、人际图谱、事件图谱或需求传递。模型 API 仍由用户后续接入；本阶段只保证模型输出的 `StatusDialogueOutput.voiceText` 可以进入 CosyVoice 合成链路。

## 已实现

- 修复 dev 页面空白问题：
  - 根因是 dev server 仍在内存中服务旧版 `status-dialogue-contracts.ts`，导致新导出 `DEFAULT_BROWSER_VOICE_PROFILE` 等不可见。
  - 已将 `src/core/status-dialogue-contracts.ts` 从目录 re-export 改为显式文件 re-export。
  - 已重启 dev server。
- 新增核心 TTS adapter 契约：
  - `status_dialogue_tts_config.v1`
  - `status_dialogue_tts_health.v1`
  - `status_dialogue_tts_synthesis.v1`
- 新增默认 CosyVoice profile：
  - `voice.cosyvoice.local.default`
  - adapter id：`cosyvoice_local_http`
- 新增主进程 IPC：
  - `zhineng:status-dialogue:tts:health`
  - `zhineng:status-dialogue:tts:synthesize`
- Renderer 已优先使用 CosyVoice：
  - 成功：播放 CosyVoice 返回的音频。
  - 失败：记录 `voice_output_trace.v1` fallback，并自动回退浏览器 TTS。
- 右侧设置面板已显示：
  - CosyVoice profile。
  - CosyVoice health。
  - `check tts`。
  - 最近一次输出 trace。
- 3D 星云已同步：
  - `voice.tts_adapter` 更新为 CosyVoice + browser fallback。
  - `voice.voice_profile` 默认指向 CosyVoice。

## 默认 CosyVoice 配置

默认配置位于核心契约：

```ts
base_url: "http://127.0.0.1:8000"
endpoint_path: "/api/v1/audio/speech"
health_path: "/health"
model: "cosyvoice"
voice: "default"
response_format: "wav"
payload_mode: "openai_compatible"
timeout_ms: 12000
allow_remote: false
stream_preferred: true
```

默认只允许 localhost，避免把语音文本误发到未确认远端服务。后续如果使用远端 CosyVoice 服务，需要显式设置 `allow_remote`。

## 可配置入口

可通过环境变量覆盖：

```powershell
$env:SIGHTFLOW_COSYVOICE_BASE_URL="http://127.0.0.1:8000"
$env:SIGHTFLOW_COSYVOICE_ENDPOINT="/api/v1/audio/speech"
$env:SIGHTFLOW_COSYVOICE_HEALTH_PATH="/health"
$env:SIGHTFLOW_COSYVOICE_MODEL="cosyvoice"
$env:SIGHTFLOW_COSYVOICE_VOICE="default"
$env:SIGHTFLOW_COSYVOICE_PAYLOAD_MODE="openai_compatible"
$env:SIGHTFLOW_COSYVOICE_RESPONSE_FORMAT="wav"
$env:SIGHTFLOW_COSYVOICE_STREAM="1"
```

也可通过 `settings.chatProvider.config.statusDialogueTts` 覆盖：

```json
{
  "statusDialogueTts": {
    "enabled": true,
    "base_url": "http://127.0.0.1:8000",
    "endpoint_path": "/api/v1/audio/speech",
    "health_path": "/health",
    "model": "cosyvoice",
    "voice": "default",
    "response_format": "wav",
    "payload_mode": "openai_compatible",
    "stream_preferred": true,
    "allow_remote": false
  }
}
```

## 当前输入输出

输入：

- `StatusDialogueOutput.voiceText`
- `voice_response_plan.v1`
- `selected_voice_profile.v1 = voice.cosyvoice.local.default`

输出：

- 成功时返回并播放 `audio_data_url`
- 失败时返回 fallback reason，并转浏览器 TTS
- 始终记录 `voice_output_trace.v1`

## 验证

- `npm.cmd run typecheck` 已通过。
- 已重启 dev server。
- 已验证 URL：
  - `http://[::1]:5173/?window=zhineng-graph`
- 验证结果：
  - `Subject Status Dialogue` 面板存在。
  - 设置面板可展开。
  - voice selector 默认包含并选中 `CosyVoice local default`。
  - 浏览器中文 voices 仍作为 fallback 候选。
  - 当前 TTS chip 显示 `cosyvoice fallback`，原因是本机 CosyVoice 服务尚未启动。
  - 3D canvas 非空白。
- 截图：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\verification-logs\graph-cosyvoice-dev-url-20260625.png`

## 仍未完成

- 尚未启动或安装真实 CosyVoice 服务。
- 尚未接入模型 API，等待用户处理模型 API 配置。
- 当前 IPC 返回的是完整音频结果，不是逐 chunk 音频流。后续要实现更强实时性，需要增加 event-stream 或 WebSocket 音频 chunk 通道。

## 下一步建议

下一步接模型 API 后，完整链路应为：

```text
用户文字/语音输入
  -> StatusDialogueOutput.voiceText
  -> voice_response_plan.v1
  -> CosyVoice local_http
  -> audio_data_url / future audio stream
  -> playback
  -> voice_output_trace.v1
```

若你要追求更强实时性，后续需要将当前 `tts:synthesize` 从“整段音频返回”升级为：

```text
LLM token stream
  -> 语义分句器
  -> CosyVoice streaming request
  -> audio chunk events
  -> 播放队列
  -> 可打断/可清空队列
```
