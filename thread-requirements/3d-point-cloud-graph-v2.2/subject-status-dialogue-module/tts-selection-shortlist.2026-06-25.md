# 主体状态对话框 TTS 候选短名单 2026-06-25

状态：候选评估，不代表已接入。  
边界：当前实现仍只使用浏览器 `speechSynthesis` voice list；真实 TTS 待用户确认后以可替换 adapter 接入。

## 推荐结论

第一优先推荐路线：

1. **P0 当前实现**：保留浏览器 `speechSynthesis`，用于立即可用、多音色第一版、无安装依赖。
2. **真实低延迟本地 TTS 首选**：`Kokoro` 或 `Piper`。
3. **中文自然度、情感和流式优先**：`CosyVoice / Fun-CosyVoice 3.0`。
4. **声音克隆优先**：`GPT-SoVITS`，后续再评估 `CosyVoice` 的 zero-shot/跨语种克隆路线。

## 候选对比

| 候选 | 推荐级别 | 适合目标 | 延迟/性能判断 | 效果判断 | 硬件压力 | 当前状态 |
| --- | --- | --- | --- | --- | --- | --- |
| Browser SpeechSynthesis | 当前已实现 | 立即跑通多音色、最小依赖 | 最低工程延迟，本机浏览器承担 | 受系统 voices 限制 | 极低 | 已接入 voice list，不写磁盘 |
| Kokoro | ★★★★★ | 低延迟、本地服务、轻量高质量 | 82M 参数，官方说明轻量且更快、更省成本 | 多语言可用，适合快速状态播报 | 低到中，CPU/GPU 均可评估 | 候选，不接入 |
| Piper / piper1-gpl | ★★★★☆ | 极低硬件、本地离线、稳定状态播报 | C++/Python，本地 fast neural TTS | 自然度不一定最高，但稳定、省资源 | 低 | 候选，不接入 |
| CosyVoice / Fun-CosyVoice 3.0 | ★★★★☆ | 中文自然度、情感、方言、流式输出 | 官方写明 bi-streaming 可低至 150ms | 中文和多语种表达强，支持 instruction/emotion/speed/volume | 中到高，建议 GPU 或服务化 | 候选，不接入 |
| GPT-SoVITS | ★★★★☆ | 声音克隆、少样本克隆、个性音色 | 更适合克隆和高质量生成，不是最轻量低延迟首选 | 克隆能力强，社区大 | 中到高，建议 GPU | 候选，不接入 |

## 候选说明

### 1. Browser SpeechSynthesis

当前第一版已实现：

- 读取 `window.speechSynthesis.getVoices()`。
- 映射为 `voice_profile.v1[]`。
- 选择只保存在页面状态。
- 不写入磁盘。
- 不接第三方 TTS。
- 不保存任何音频样本。

适合作为永久 fallback。

### 2. Kokoro

推荐用途：

- 主体状态对话框低延迟本地 TTS。
- 简短第一人称状态播报。
- 需要比浏览器默认声音更稳定的本地输出。

依据：

- 主仓库说明 Kokoro 是 82M 参数 open-weight TTS，强调轻量、速度和成本优势，并使用 Apache-2.0 许可。
- GitHub 页面显示约 7.6k stars，暂无 GitHub releases，安装方式以 `pip install kokoro` 为主。

建议接入方式：

- 第一版用 `local_http` adapter。
- 单独启动 Kokoro 服务。
- 主体状态对话框只发送 `voice_response_plan.v1.text`、voice id、speed。
- 失败时回退浏览器 TTS。

来源：

- [hexgrad/kokoro](https://github.com/hexgrad/kokoro)
- [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)

### 3. Piper / piper1-gpl

推荐用途：

- 极低资源本地 TTS。
- 离线状态播报。
- 作为稳定兜底 TTS 服务。

依据：

- OHF 维护仓库说明其为 fast and local neural text-to-speech engine。
- GitHub 页面显示 `piper1-gpl` 最新 release 为 `v1.4.2`，日期为 2026-04-02。
- 原 `rhasspy/piper` 为 MIT，GitHub API 当前显示约 11.1k stars，但活跃度需结合新 OHF 维护路线评估。

建议接入方式：

- 如果优先低资源与离线：优先试 Piper。
- 如果许可证影响分发：需要在 `piper1-gpl` 与旧 MIT 路线之间再确认。

来源：

- [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl)
- [rhasspy/piper](https://github.com/rhasspy/piper)

### 4. CosyVoice / Fun-CosyVoice 3.0

推荐用途：

- 中文自然表达。
- 情感、语速、方言、跨语种。
- 未来拟人语音输出和更自然对话。

依据：

- 主仓库 README 已列出 Fun-CosyVoice 3.0、CosyVoice 2.0、CosyVoice 1.0。
- README 写明 Fun-CosyVoice 3.0 在内容一致性、说话人相似度和韵律自然度上超过 CosyVoice 2.0。
- README 写明支持中英日韩德西法意俄、18+ 中文方言/口音，支持 multi-lingual/cross-lingual zero-shot voice cloning。
- README 写明 bi-streaming 同时支持 text-in streaming 和 audio-out streaming，延迟可低至 150ms。
- GitHub 页面显示约 21.8k stars。

建议接入方式：

- 作为第二阶段真实 TTS adapter。
- 如果你的目标是中文自然度和情绪表达，优先级高于 Piper。
- 建议以独立服务方式接入，避免阻塞 Electron UI。

来源：

- [FunAudioLLM/CosyVoice](https://github.com/FunAudioLLM/CosyVoice)
- [Fun-CosyVoice 3.0 Demo](https://funaudiollm.github.io/cosyvoice3/)

### 5. GPT-SoVITS

推荐用途：

- 声音克隆。
- 少样本个性化音色。
- 后续“克隆声音交互”目标。

依据：

- 主仓库说明 1 分钟 voice data 也可用于训练较好的 TTS 模型。
- GitHub 页面显示约 59k stars。
- GitHub 页面显示最新 release 为 `20250606v2pro`，日期为 2025-06-06。

建议接入方式：

- 不作为第一版低延迟播报首选。
- 适合放在 `clone_profile.v1` 后续真实服务阶段。
- 第一阶段仍不保存原始音频样本；只接外部 profile/service ref。

来源：

- [RVC-Boss/GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS)

## 选择建议

如果当前最重视延迟和稳定：

- 先选 **Kokoro**。
- 备选 **Piper**。

如果当前最重视中文自然度和情感：

- 先选 **CosyVoice / Fun-CosyVoice 3.0**。

如果当前最重视声音克隆：

- 先选 **GPT-SoVITS**，但建议放到 clone profile 阶段。

我的建议：

- 当前 Step 0-3 不接真实 TTS。
- 下一阶段真实 TTS 先做 adapter 框架。
- 真正接工具时优先试 `Kokoro` 和 `CosyVoice` 两条线：
  - `Kokoro` 做低延迟状态播报。
  - `CosyVoice` 做中文自然表达和未来拟情感。
