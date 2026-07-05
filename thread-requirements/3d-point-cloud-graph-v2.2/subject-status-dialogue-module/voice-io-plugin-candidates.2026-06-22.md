# 语音输入输出插拔候选 2026-06-22

状态：候选清单，等待确认。数据来源为 2026-06-22 通过 GitHub API 获取的仓库元数据。星标和 release 会变化，正式实现前需要重新检查。

重要说明：

- TTS 和 STT 都必须作为插件存在，不写死到主体状态对话框核心逻辑。
- 主体状态对话框只依赖统一接口：`SpeechToTextAdapter` 和 `TextToSpeechAdapter`。
- 工具不可用时必须回退：语音输入回退到文字输入，语音输出回退到文字或浏览器 SpeechSynthesis。
- “上升最快”这里使用粗略指标：`stars / 仓库创建月至今月数`。它不是精确的近期 star 增长曲线。

## 插拔接口

### SpeechToTextAdapter

```text
input: audio_stream | audio_file
config: language, vad, realtime, punctuation, diarization
output: transcript, confidence, segments, latency_ms, provider
fallback: text_input
```

### TextToSpeechAdapter

```text
input: voice_line
config: voice_profile, emotion_hint, speed, locale, clone_profile
output: playable_audio, duration_ms, provider, fallback_reason
fallback: browser_speech_synthesis | text_only
```

## TTS 候选

| 工具 | GitHub 星标 | 创建 | 最近更新 | 最新 release | 许可证 | 增长信号 | 硬件档位 | 适合度 | 备注 |
| --- | ---: | --- | --- | --- | --- | ---: | --- | --- | --- |
| [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) | 58,931 | 2024-01 | 2026-06 | 20250606v2pro / 2025-06 | MIT | 2,017/月 | 中到高，GPU 更合适 | 克隆增强强 | 少量语音数据训练/克隆链路成熟，适合后续自定义音色 |
| [Chatterbox](https://github.com/resemble-ai/chatterbox) | 25,170 | 2025-04 | 2026-06 | v0.1.2 / 2025-06 | MIT | 1,804/月 | 中到高，GPU 更合适 | 情绪对话实验强 | 新、增长快，适合拟人语气实验，需重点验证中文 |
| [ChatTTS](https://github.com/2noise/ChatTTS) | 39,492 | 2024-05 | 2026-04 | v0.2.5 / 2026-04 | AGPL-3.0 | 1,592/月 | 中，GPU 更合适 | 对话韵律强 | 对话感好，AGPL 对分发集成有约束 |
| [OpenVoice](https://github.com/myshell-ai/OpenVoice) | 36,763 | 2023-11 | 2025-04 | 无 latest release | MIT | 1,196/月 | 中，GPU 更合适 | 声音克隆/风格迁移 | 适合作为克隆或音色转换层 |
| [Fish Speech](https://github.com/fishaudio/fish-speech) | 30,893 | 2023-10 | 2026-06 | v1.5.1 / 2025-05 | 未标明 SPDX | 954/月 | 高，GPU 推荐 | 高质量 TTS | 项目自称 SOTA Open Source TTS，需确认许可证和部署资源 |
| [CosyVoice](https://github.com/FunAudioLLM/CosyVoice) | 21,776 | 2024-07 | 2026-05 | 无 latest release | Apache-2.0 | 922/月 | 中到高，GPU 推荐 | 中文/多语种优先 | 适合中文自然表达、克隆和部署能力 |
| [F5-TTS](https://github.com/SWivid/F5-TTS) | 14,790 | 2024-10 | 2026-05 | 1.1.20 / 2026-04 | MIT | 724/月 | 中到高，GPU 推荐 | 新、克隆实验 | release 新，适合流式/少样本方向验证 |
| [Kokoro](https://github.com/hexgrad/kokoro) | 7,576 | 2025-01 | 2025-08 | 无 latest release | Apache-2.0 | 437/月 | 低到中，CPU/轻 GPU | 低延迟底线 | 82M 轻量方向，适合 fallback 和短 voice_line |
| [Piper](https://github.com/rhasspy/piper) | 11,127 | 2023-01 | 2025-08 | 2023.11.14-2 / 2023-11 | MIT | 269/月 | 低，CPU 友好 | 稳定离线回退 | 快速本地神经 TTS，适合最低依赖 |

## STT 候选

| 工具 | GitHub 星标 | 创建 | 最近更新 | 最新 release | 许可证 | 增长信号 | 硬件档位 | 适合度 | 备注 |
| --- | ---: | --- | --- | --- | --- | ---: | --- | --- | --- |
| [OpenAI Whisper](https://github.com/openai/whisper) | 103,358 | 2022-09 | 2026-04 | v20250625 / 2025-06 | MIT | 2,289/月 | 中到高，模型越大越吃 GPU | 基准能力强 | 通用基准，生态成熟 |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | 50,935 | 2022-09 | 2026-06 | v1.9.1 / 2026-06 | MIT | 1,136/月 | 低到中，CPU/本地友好 | 本地优先 | C/C++ 本地部署，适合桌面插件 |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | 23,770 | 2023-02 | 2025-11 | v1.2.1 / 2025-10 | MIT | 590/月 | 中，GPU/CPU 均可 | 性能优先 | CTranslate2 后端，适合服务化 STT |
| [WhisperX](https://github.com/m-bain/whisperX) | 22,600 | 2022-12 | 2026-06 | v3.8.6 / 2026-05 | BSD-2-Clause | 533/月 | 中到高，GPU 推荐 | 时间戳/说话人增强 | 适合需要词级时间戳、diarization 的场景 |
| [FunASR](https://github.com/modelscope/FunASR) | 18,432 | 2022-11 | 2026-06 | runtime-llamacpp-v0.1.2 / 2026-06 | MIT | 430/月 | 低到高，依模型/部署而定 | 中文/工业化强 | README 标注流式、多语言、情绪检测和 OpenAI-compatible API |
| [SenseVoice](https://github.com/FunAudioLLM/SenseVoice) | 8,635 | 2024-07 | 2026-06 | runtime-llamacpp-v0.1.2 / 2026-06 | 未标明 SPDX | 366/月 | 中，GPU 更合适 | 语音理解增强 | ASR + 情绪识别 + 音频事件检测，适合未来情绪输入 |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | 13,110 | 2022-09 | 2026-06 | asr-models-qnn-2 / 2026-06 | Apache-2.0 | 287/月 | 低到中，端侧友好 | 离线多端部署 | 支持 ASR/TTS/VAD/diarization，适合插件底座 |
| [whisper_streaming](https://github.com/ufal/whisper_streaming) | 3,642 | 2023-04 | 2025-11 | 无 latest release | MIT | 94/月 | 中，依底层 Whisper | 实时流式实验 | 适合长语音实时转写验证 |

## 最新和上升信号

### TTS

- 最新创建：Chatterbox、Kokoro、F5-TTS。
- 最新 release：F5-TTS、ChatTTS、GPT-SoVITS。
- 粗略增长最快：GPT-SoVITS、Chatterbox、ChatTTS。
- 低硬件优先：Piper、Kokoro。
- 中文和自然表达优先：CosyVoice、Fish Speech、GPT-SoVITS。
- 克隆/音色优先：GPT-SoVITS、OpenVoice、CosyVoice、Fish Speech。

### STT

- 最新 release 活跃：FunASR、SenseVoice、whisper.cpp、WhisperX。
- 粗略增长最快：OpenAI Whisper、whisper.cpp、faster-whisper。
- 本地低硬件优先：whisper.cpp、sherpa-onnx。
- 中文和多语音理解优先：FunASR、SenseVoice。
- 时间戳/说话人分离优先：WhisperX、sherpa-onnx。

## 推荐组合

第一阶段：

- STT：`whisper.cpp` 或 `FunASR`
- TTS：`Kokoro` 或浏览器 SpeechSynthesis fallback
- 目的：低风险验证语音输入、语音输出和 UI 插拔接口。

第二阶段：

- STT：`FunASR` 或 `SenseVoice`
- TTS：`CosyVoice` 或 `GPT-SoVITS`
- 目的：中文体验、音色选择、克隆、情绪提示。

第三阶段：

- STT：`WhisperX` 或 `sherpa-onnx`
- TTS：`Chatterbox` 或 `Fish Speech`
- 目的：说话人分离、情绪化表达、第三方对话窗口。

## 插件边界

- 插件只处理语音输入或输出，不决定系统事实。
- STT 输出必须进入文字需求/状态查询管线，不能直接执行动作。
- TTS 只朗读 `voice_line`，不朗读完整内部上下文。
- 语音克隆必须通过 `voice_profile` 和授权样本管理。
- 插件失败不能阻塞文字交互。

