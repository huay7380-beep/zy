# Phase 8 本地 CosyVoice + DeepSeek 真实闭环记录

## 当前结论

主体状态对话框的真实闭环已打通：

```text
Status Dialogue input
  -> Electron IPC zhineng:status-dialogue:complete
  -> DeepSeek deepseek-v4-flash
  -> StatusDialogueOutput.voiceText
  -> Electron IPC zhineng:status-dialogue:tts:synthesize
  -> local CosyVoice HTTP adapter
  -> audio/wav data URL
  -> renderer Audio.play()
```

当前仍保持既定边界：

- 不写入世界模型。
- 不创建 `requirement_packet.v1`。
- 不接入真实人际图谱或事件图谱。
- 不保存用户语音输入样本。
- 不把 API key 写入本文档或验证结果。

## 本地 CosyVoice 部署

已完成：

- 安装 Miniforge：`C:\Users\zhang\miniforge3`
- 创建独立 Python 3.10 环境：`D:\zhineng\third_party\envs\cosyvoice`
- 下载 CosyVoice 源码 zip 到：`D:\zhineng\third_party\CosyVoice`
- 补齐 `third_party/Matcha-TTS`
- 安装 Windows TTS 依赖：
  - `D:\zhineng\third_party\CosyVoice\requirements-windows-tts.txt`
  - 原官方 `openai-whisper==20231117` 在 Windows + 新 setuptools 下首次构建失败，已通过降级 setuptools 后单独安装解决。
- 下载模型：
  - `D:\zhineng\third_party\CosyVoice\pretrained_models\CosyVoice-300M-SFT`

当前优先使用 `CosyVoice-300M-SFT`，原因是它启动稳定、体积相对较小，适合先跑通语音输出闭环。后续声音克隆/zero-shot 可在同一 adapter 下扩展到 `CosyVoice2-0.5B` 或 `Fun-CosyVoice3`。

## 新增本地服务

新增 OpenAI-compatible TTS wrapper：

- `D:\zhineng\sightflow-desktop-agent-main\scripts\cosyvoice-openai-compatible-server.py`

服务端口：

- `GET http://127.0.0.1:8000/health`
- `GET http://127.0.0.1:8000/voices`
- `POST http://127.0.0.1:8000/api/v1/audio/speech`

新增启动脚本：

- `D:\zhineng\sightflow-desktop-agent-main\scripts\start-cosyvoice-server.ps1`

当前服务进程：

- Python：`D:\zhineng\third_party\envs\cosyvoice\python.exe`
- Host：`127.0.0.1`
- Port：`8000`

## DeepSeek 接入

已将主体状态对话框模型配置为：

- `model`: `deepseek-v4-flash`
- `baseURL`: `https://api.deepseek.com`
- `thinking`: app 内部请求已使用 `{ "type": "disabled" }`
- API key：已写入本机 Electron settings，本文档不记录密钥。

settings 文件：

- `C:\Users\zhang\AppData\Roaming\zhineng-social-assistant-desktop\settings.json`

同时配置 TTS：

- `statusDialogueTts.base_url`: `http://127.0.0.1:8000`
- `statusDialogueTts.endpoint_path`: `/api/v1/audio/speech`
- `statusDialogueTts.health_path`: `/health`
- `statusDialogueTts.timeout_ms`: `60000`
- `statusDialogueTts.allow_remote`: `false`

## 验证结果

### 1. CosyVoice health

通过：

```json
{
  "status": "ok",
  "adapter": "cosyvoice_openai_compatible",
  "sample_rate": 22050,
  "speaker_count": 7,
  "cuda": true
}
```

### 2. CosyVoice 直连合成

通过：

- 输出文件：`D:\zhineng\sightflow-desktop-agent-main\runtime\verification-logs\cosyvoice-direct-speech-utf8-no-text-frontend-20260625.wav`
- 格式：`audio/wav`
- 采样率：`22050 Hz`
- 声道：`1`
- 时长：`3.413 s`

说明：

- Windows 下 CosyVoice text frontend 会把中文规范化得过短，因此本地 wrapper 默认 `text_frontend=false`。

### 3. DeepSeek API 直连

通过：

- `model`: `deepseek-v4-flash`
- `baseURL`: `https://api.deepseek.com`
- 延迟约 `1.6s`
- API key 已脱敏，不写入验证文件。

### 4. Electron IPC 完整链路

通过：

- 验证文件：`D:\zhineng\sightflow-desktop-agent-main\runtime\verification-logs\electron-deepseek-cosyvoice-chain-20260625.json`

关键结果：

```json
{
  "hasElectron": true,
  "model": {
    "success": true,
    "status": "pass",
    "model": "deepseek-v4-flash"
  },
  "complete": {
    "success": true,
    "model": "deepseek-v4-flash"
  },
  "ttsHealth": {
    "configured": true,
    "reachable": true,
    "status": "ready",
    "base_url_host": "127.0.0.1:8000"
  },
  "tts": {
    "success": true,
    "adapter_id": "cosyvoice_local_http",
    "mime": "audio/wav"
  },
  "playback": {
    "ok": true,
    "duration": 4.411791
  }
}
```

### 5. 构建验证

通过：

```text
npm.cmd run build
```

### 6. Windows 本机播放验证

通过：

- 使用 `System.Media.SoundPlayer.PlaySync()` 播放 `cosyvoice-direct-speech-utf8-no-text-frontend-20260625.wav`。
- 命令返回：`windows_soundplayer_play_sync_completed`。

## 当前限制

- 当前优先跑通闭环，使用 `CosyVoice-300M-SFT` 内置 speaker；声音克隆尚未启用。
- 当前 TTS wrapper 返回整段 WAV，不是低延迟 streaming；后续可升级为 chunk/event/WebSocket。
- 当前验证确认 `Audio.play()` promise 成功；是否由扬声器实际发声仍受 Windows 当前输出设备和音量控制影响。
- 普通浏览器打开 `http://[::1]:5173/?window=zhineng-graph` 只能检查 Web UI；完整模型和 TTS IPC 链路需要 Electron 原生窗口。

## 后续建议

1. 将 `CosyVoice2-0.5B` 或 `Fun-CosyVoice3` 接入同一 wrapper，启用 zero-shot/clone profile。
2. 将 `VoiceProfile` 的 `voice_id` 从 `default` 扩展为当前模型 `voices` 列表。
3. 将 TTS 合成从整段 WAV 改为 streaming，以降低首包延迟。
4. 在右侧主体状态对话框加入“当前真实模型：DeepSeek V4 Flash / 当前 TTS：CosyVoice ready”的显式状态。

## 参考来源

- [DeepSeek API Docs](https://api-docs.deepseek.com/)
- [FunAudioLLM/CosyVoice](https://github.com/FunAudioLLM/CosyVoice)
