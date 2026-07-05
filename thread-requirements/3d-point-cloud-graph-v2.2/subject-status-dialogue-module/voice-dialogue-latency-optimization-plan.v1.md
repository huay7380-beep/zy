# 语音对话延迟路径优化方案 v1

状态：方案草案，等待用户确认后再推进为正式版本计划。  
来源：`idea-0004`。  
建议版本路线：`version_plan`。  
当前边界：本文件只整理目标、证据和方案，不改代码，不切换模型，不改 STT/TTS 配置。

## 目标

把主体状态对话框的语音交互从“完整链路跑通但等待很久”优化成“高质量 TTS 前提下，先快速有高质量首响，再逐步补完整回答”的低延迟体验。

用户体验目标：

- 语音结束后尽快听到确认，不等完整模型和 TTS。
- 每一句被播报的内容都应保持高质量 TTS 和统一音色体验。
- 延迟优化不能以降低语音质量作为默认代价，只能通过流式、预热、缓存、并行和首句优先实现。
- 完整回复仍保留自然音色和高质量语音，首响也必须走高质量快路径。
- 每次慢都能在 UI 和日志里看到到底慢在 STT、模型、TTS 还是播放。

## 当前证据

本轮核对了现有文档、主进程代码、renderer 调用路径和运行探针。

### 端到端探针

来源：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-e2e-*.json`

| Run | Total | STT | Final TTS | Audio |
| --- | ---: | ---: | ---: | ---: |
| `20260626134929` | 19015ms | 6974ms | 7739ms | 3.599s |
| `20260626132045` | 18659ms | 10866ms | 7735ms | 3.773s |
| `20260626132019` | 15003ms | 6645ms | 8305ms | 4.249s |
| `20260626125346` | 23594ms | 6982ms | 16555ms | 8.951s |
| `20260626125217` | 22992ms | 6449ms | 16493ms | 9.392s |

### 运行日志观察

来源：`D:\zhineng\runtime\status-dialogue-logs\voice-flow-20260626.jsonl`

- Chrome Web Speech 成功样本大约 `4160ms` 到 `10510ms`。
- Chrome no-speech 失败样本约 `9491ms` 到 `9634ms`，失败也会消耗接近 10 秒。
- local STT 样本约 `5927ms` 到 `13643ms`。
- CosyVoice TTS 样本约 `4823ms` 到 `26712ms`。
- 有一次 `text_length=83` 的 TTS 合成耗时 `26712ms`，播放音频 `13.038s`。
- 当前主路径是串行：STT 完成后才提交对话，模型完成后才生成 TTS，TTS 完整合成后才开始播放。

## 当前慢路径

```text
user speech
  -> Chrome STT 或 local STT 等最终 transcript
  -> submitDialogue
  -> refresh snapshot / assemble context
  -> zhineng:status-dialogue:complete
  -> parse output
  -> build voiceText
  -> zhineng:status-dialogue:tts:synthesize
  -> receive full WAV / base64 data URL
  -> Audio.play
```

慢的本质不是一个点，而是多个阶段串行：

1. STT 等最终结果，失败也要等到 no-speech 或 timeout。
2. 对话上下文和状态快照没有充分前置。
3. 模型调用等待完整文本。
4. TTS 等完整音频合成，不能边合成边播放。
5. ACK 和最终回复可能争用同一个 CosyVoice 服务，ACK 甚至会被 stale 跳过。
6. 当前缺少统一的 `voice_latency_trace.v1`，只能从分散日志推断。

## 优化原则

- 先优化可感知首响，再优化完整回复。
- 先测量每一段，再改路径。
- 简单确认也必须是高质量 TTS，不能把低质量 TTS 当作常规快路径。
- 能并行的前置并行，不能并行的缩短文本。
- 所有优化必须保留文字交互 fallback。
- 不为了低延迟牺牲可追溯边界：STT 不直接执行动作，TTS 不播隐藏上下文。

## 高质量 TTS 底线

用户明确要求：语音对话模块的每一句播报都必须保持高质量 TTS。延迟优化不能通过“降低语音质量”来换体验，因为语音质量本身就是该模块的核心优势。

因此常规路径必须满足：

- 同一轮对话内音色统一，不出现第一句和后续句明显不同的割裂感。
- ACK、提醒、首句、完整回复都走高质量 TTS 或高质量预生成缓存。
- 浏览器 TTS、text-only、低质量本地 TTS 只能作为故障 fallback，且必须在 UI 或日志中标记。
- 低延迟目标通过高质量 TTS 预热、短句缓存、分句流式、音频首包播放和专用合成队列实现。
- 借鉴 ChatGPT 语音对话体验方向：自然转接、统一声音人格、可打断、首句快、后续流式补全，但不牺牲音色一致性。

## 延迟预算

建议建立三个档位：

| 档位 | 目标 | 适用场景 |
| --- | ---: | --- |
| 首响确认 | 300ms 到 1200ms | 用户刚说完后听到“我听到了/我在查” |
| 普通状态答复 | 2s 到 5s | 简短状态、巡检、提醒 |
| 完整自然答复 | 5s 到 10s | 较完整说明、情感化语音 |

超过目标时 UI 必须显示慢在哪一段。

## 优化方案

### P0：统一延迟追踪

先新增 `voice_latency_trace.v1`，把每轮语音链路拆成阶段：

```json
{
  "schema": "voice_latency_trace.v1",
  "turn_id": "status-dialogue-...",
  "input_kind": "speech_transcript",
  "stt_ms": 5202,
  "context_ms": 80,
  "model_ms": 2600,
  "tts_first_audio_ms": 900,
  "tts_full_ms": 5200,
  "playback_ms": 5300,
  "total_first_feedback_ms": 900,
  "total_full_response_ms": 13200,
  "slow_stage": "tts_full",
  "fallbacks": []
}
```

落点：

- UI 状态栏：显示 `first feedback / model / tts / total`。
- 日志：写入 `runtime/status-dialogue-logs/*.jsonl`。
- 3D 粒子：增加 `voice.latency_trace`。

### P1：高质量首响快路径

当前 ACK 如果临时调用 CosyVoice，会和最终 TTS 争用服务，而且自身也可能耗时 4 到 6 秒。但这不意味着 ACK 可以降级成低质量语音。建议改成高质量快路径：

1. 立即 UI 文本确认。
2. ACK 使用同一高质量音色的预生成短音频或常驻高质量 TTS 快队列。
3. 最终回答继续使用同一高质量 TTS。
4. 浏览器 SpeechSynthesis 只作为 TTS 服务不可用时的故障 fallback，不作为常规体验目标。

可选策略：

- `ack_mode=quality_cached_audio`
- `ack_mode=quality_streaming_first_packet`
- `ack_mode=quality_tts_fast_queue`
- `ack_mode=text_only_when_tts_unavailable`

预期收益：

- 用户能尽快感知系统接收到输入，同时音色不割裂。
- ACK 不再抢占最终回复的重合成队列。
- 常用确认句可以通过高质量缓存实现低延迟。

### P2：STT 低延迟路径

当前 Chrome STT 成功也可能 4 到 10 秒，local STT 通常 6 秒以上。建议：

- 优先保留 Chrome Web Speech cloud STT，因为之前实际体验较好。
- Chrome STT bridge 不应每轮都重新清理和拉起页面，建议保留常驻 bridge 页面或常驻 session。
- 利用 interim transcript 做 UI 实时字幕，但 final 前不执行。
- 增加 end-of-speech/VAD 策略，尽快截断静音等待。
- no-speech 失败不要无条件转 local whisper；先提示麦克风/环境，再允许用户选择本地 fallback。
- local whisper 作为离线 fallback，不作为默认实时路径。

预期收益：

- 减少 Chrome 拉起和会话初始化成本。
- 避免 no-speech 失败后再追加 6 到 13 秒 local STT。

### P3：模型和上下文快路径

对话模型不是所有输入都必须走完整上下文。

建议分三类路由：

| Route | 处理方式 |
| --- | --- |
| `simple_ack` | 不走模型，直接本地生成 |
| `status_quick` | 小模型/短 prompt，只读当前 snapshot 摘要 |
| `full_reasoned` | 完整上下文，适合复杂需求整理 |

具体优化：

- 状态快照后台刷新，不在每轮提交时阻塞。
- STT 进行中提前准备 `DialogueWorkingContext`。
- prompt 拆成短模板，避免把完整 3D 图谱和长日志塞给模型。
- 模型设置低输出长度，优先生成 `voiceText`，再补完整 `reply`。
- 模型超时设置短档，例如 3 到 5 秒；超时先走 fallback，模型结果回来再补文字。

预期收益：

- 状态类问题不等完整大模型。
- 复杂问题仍有完整回答，但不阻塞首响。

### P4：高质量 TTS 流式、缓存和分块

当前 CosyVoice 需要完整合成后才播放，TTS 是最大瓶颈之一。

建议：

- 最终语音分成 `first_sentence` 和 `remaining_detail`。
- 先合成第一句的高质量音频，播放后再后台合成后续句。
- 普通巡检可以控制播报长度，但凡播出来的每一句都必须是高质量 TTS。
- 对固定短句做同音色高质量缓存，例如“我听到了，正在检查状态”。
- 优先评估 CosyVoice streaming 或 Fun-CosyVoice bi-streaming。
- 如果暂时没有流式 TTS，优先做高质量短句缓存和合成队列预热；Kokoro/Piper 只能作为“高质量达标后”的备用路线，不能成为默认低质快路径。

预期收益：

- 首段语音不必等完整 5 到 13 秒音频。
- 长回复不会拖慢“我开始回应”的时间。
- 语音质量和音色一致性不被牺牲。

### P5：并行化链路

把现在的串行改成可并行：

```text
speech starts
  -> prepare context in background
  -> refresh snapshot in background
  -> STT interim updates UI
speech final
  -> local route decision
  -> high-quality cached/streaming ack
  -> model call
  -> high-quality first sentence TTS
  -> play first sentence
  -> background full TTS / text completion
```

可以并行的内容：

- STT 进行时预取状态快照。
- STT 进行时准备 memory 和 focus。
- 模型生成完整 reply 时先生成/播放高质量 ack。
- 第一段高质量 TTS 播放时合成后续段。

### P6：UI 和 3D 映射

UI 需要让用户看懂慢在哪：

- `STT 5.2s`
- `model 2.4s`
- `TTS first 0.9s / full 5.2s`
- `slow stage: TTS`

3D 粒子 OS 新增子粒子：

| Node | 作用 | Input | Output | Gate |
| --- | --- | --- | --- | --- |
| `voice.latency_trace` | 端到端耗时追踪 | STT/model/TTS logs | voice_latency_trace.v1 | latency_trace_gate |
| `voice.high_quality_fast_ack` | 高质量首响确认快路径 | transcript event, cached voice | high_quality_ack_audio | fast_ack_gate |
| `voice.stt_warm_bridge` | STT 常驻桥接 | microphone/session | interim/final transcript | stt_latency_gate |
| `voice.context_prefetch` | 上下文预取 | snapshot/memory/focus | working_context | context_gate |
| `voice.tts_quality_guard` | 保证播报句子质量和音色一致 | voice profile, tts result | pass/fallback label | tts_quality_gate |
| `voice.tts_first_chunk` | 高质量首句优先播放 | voiceText first sentence | playable audio | tts_chunk_gate |
| `voice.high_quality_tts_cache` | 高质量短句缓存 | common phrases, voice profile | cached audio | tts_cache_gate |

## 推荐实施顺序

### Phase L0：延迟基线和可视化

- 建立 `voice_latency_trace.v1`。
- UI 显示每段耗时。
- 先不改行为，只让慢路径可见。

### Phase L1：高质量首响快路径

- ACK 走同一高质量音色的缓存短音频、流式首包或高质量快队列。
- 浏览器 TTS 只作为故障 fallback。
- 不让 ACK 与最终 TTS 抢同一个重合成队列。

### Phase L2：STT 快路径

- 优先 Chrome cloud STT。
- 常驻 STT bridge。
- interim transcript 可见。
- no-speech 快速失败并提示，不自动叠加慢 fallback。

### Phase L3：模型快路由

- simple/status/full 三类路由。
- 快速状态问题走短 prompt 或本地模板。
- 完整模型结果允许后到。

### Phase L4：TTS 分块和缓存

- 高质量第一句优先合成。
- 常用短句做同音色高质量缓存。
- 评估流式 CosyVoice、Fun-CosyVoice bi-streaming 或其他达标的高质量 TTS。

### Phase L5：端到端复测

目标验收：

- 首响小于 1.2 秒。
- 普通状态问答首句小于 5 秒。
- 慢阶段在 UI 中可见。
- 不牺牲文字 fallback。

## 当前不做

- 不立即更换模型。
- 不直接改 STT/TTS 工具。
- 不直接启用流式 TTS。
- 不把浏览器 TTS 或低质量 TTS 作为常规快路径。
- 不牺牲同音色和高质量 TTS 目标。
- 不保存原始音频。
- 不让 STT transcript 直接执行动作。

## 验证方案

文档验证：

```powershell
rg "voice_latency_trace|high_quality_fast_ack|tts_quality_guard|stt_warm_bridge|tts_first_chunk|high_quality_tts_cache|latency budget" D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\subject-status-dialogue-module
```

未来实现验证：

- `npm.cmd run typecheck`
- `npm.cmd run build`
- 真实语音输入一轮，确认 UI 显示 `STT/model/TTS/playback/total`。
- 对比优化前后的 `runtime/status-dialogue-logs/*.jsonl`。
- 验证 ACK 为高质量同音色路径，且不阻塞最终 TTS。
- 验证 no-speech 不再叠加长时间 local fallback。
- 验证所有播报句子均使用用户选择的高质量音色；fallback 时 UI 明确标记。

## 待用户确认

1. 是否确认该需求作为 `idea-0004` 独立延迟优化方案，而不是并入 `idea-0003`。
2. 是否确认第一步先做 `voice_latency_trace.v1`，先看清慢在哪。
3. 是否确认 ACK、提醒、首句和最终回复都必须保持高质量 TTS，低质量 fallback 只在故障时启用。
4. 是否确认 STT 默认优先 Chrome cloud Web Speech，local whisper 只作为明确 fallback。
5. 是否确认普通状态问答允许“先播高质量第一句，完整内容继续以高质量语音或文字补全”，但不能用低质量语音替代。

## 我的建议

优先做 L0 和 L1。因为现在最大的体验问题是“等得没有反馈”，但首响也必须是高质量的。先把延迟分段显示出来，再建立同音色高质量 ACK 缓存或快队列，用户体感会立刻好很多。之后再做 STT 常驻、TTS 流式和高质量分块，这样风险更小，也更符合先验证再修改的规则。
