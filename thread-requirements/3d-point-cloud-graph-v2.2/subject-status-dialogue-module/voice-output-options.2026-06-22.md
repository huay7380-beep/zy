# 开源语音输出候选 2026-06-22

状态：选型候选，等待确认。以下候选来自项目源头信息，集成前仍需按实际运行环境验证模型大小、显存、延迟、许可证和中文效果。

## 推荐分层

| 层级 | 候选 | 适用目的 |
| --- | --- | --- |
| 低延迟底线 | Kokoro / Piper | 本地快速朗读、基础音色选择、故障回退 |
| 优先增强 | CosyVoice / Fish Speech | 中文、多语种、音色克隆、语气控制、较自然表达 |
| 克隆增强 | GPT-SoVITS / OpenVoice | 自定义音色、声音克隆、风格迁移 |
| 对话风格实验 | Chatterbox / ChatTTS | 更像对话的语气、情绪或韵律实验 |

## 候选清单

| 工具 | 主要优势 | 音色选择 | 语音克隆 | 情绪/语气 | 建议定位 |
| --- | --- | --- | --- | --- | --- |
| [Kokoro](https://github.com/hexgrad/kokoro) | 轻量、速度快、适合本地低延迟 | 支持多音色 | 弱 | 弱到中 | 默认本地 fallback 或轻量 voice line |
| [Piper](https://github.com/rhasspy/piper) | 稳定、离线、资源占用低 | 按模型选择 | 弱 | 弱 | 最低依赖离线回退 |
| [CosyVoice](https://github.com/FunAudioLLM/CosyVoice) | 中文/多语种能力强，适合克隆和自然表达 | 支持 | 支持 | 中到强 | 优先候选，适合主体状态语音 |
| [Fish Speech](https://github.com/fishaudio/fish-speech) | 新一代开源 TTS，强调高质量和多语种 | 支持 | 支持 | 中到强 | 优先候选，适合后续情绪化表达 |
| [F5-TTS](https://github.com/SWivid/F5-TTS) | 流式、零样本/少样本方向，适合实验 | 支持 | 支持 | 中 | 本地克隆/快速实验候选 |
| [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) | 社区成熟，克隆和定制链路丰富 | 支持 | 支持 | 中 | 自定义音色训练候选 |
| [OpenVoice](https://github.com/myshell-ai/OpenVoice) | 声音克隆和风格控制方向清晰 | 支持 | 支持 | 中 | 作为声音转换/克隆增强层 |
| [Chatterbox](https://github.com/resemble-ai/chatterbox) | 面向对话式语音和情绪控制 | 支持 | 支持 | 强 | 情感化语音实验候选 |
| [ChatTTS](https://github.com/2noise/ChatTTS) | 对话韵律自然，适合聊天语气 | 支持 | 有限制 | 中 | 对话风格实验，不作为第一默认 |

## 当前建议

第一阶段不要一次性接入所有 TTS。建议先做可替换 adapter：

1. 保留浏览器 SpeechSynthesis 作为零依赖 fallback。
2. 增加 `VoiceAdapter` 接口和 `voice_profile` 配置。
3. 优先选择一个本地低延迟工具作为基础语音。
4. 再选择一个增强工具处理音色克隆和情绪化表达。

建议优先组合：

- 组合 A：Kokoro + CosyVoice
  - Kokoro 负责低延迟和本地 fallback。
  - CosyVoice 负责中文自然表达、音色和克隆增强。
- 组合 B：Piper + Fish Speech
  - Piper 负责稳定离线回退。
  - Fish Speech 负责高质量语音和后续情绪化表达。
- 组合 C：Kokoro + Chatterbox
  - Kokoro 负责快速输出。
  - Chatterbox 负责更拟人的对话语气实验。

## 对主体状态对话框的接口要求

```text
voice_line: 必须短，不直接朗读长 reply。
voice_profile: 指定音色、语言、速度、情绪偏好。
emotion_hint: calm / focused / warm / urgent / reflective。
fallback: TTS 不可用时仍显示文字，不阻塞对话。
```

## 边界

- 语音克隆不和模型提示词绑定，必须由独立 voice_profile 管理。
- 情绪控制只服务表达风格，不改变事实判断。
- 当前模块只生成语音输出，不触发外部发送或自动对话。
- 工具许可证、模型权重授权、声音样本授权需要在正式接入前逐项确认。

