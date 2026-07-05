# Voice Output Streaming Optimization Plan v1

## 2026-06-28 Real Adapter Probe Procedure

- Real low-latency TTS adapters must be validated with:
  - `npm.cmd run voice:generic-tts-stream:validate:configured`
- Required configuration:
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_ADAPTER_ID`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_BASE_URL`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_ENDPOINT`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_MODEL`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_VOICE`
  - optional: `SIGHTFLOW_STATUS_DIALOGUE_TTS_API_KEY`
  - optional: `SIGHTFLOW_STATUS_DIALOGUE_TTS_RESPONSE_FORMAT`
  - remote only: `SIGHTFLOW_STATUS_DIALOGUE_TTS_ALLOW_REMOTE=1`
- Acceptance criteria:
  - `configured=true`
  - `selected_candidate_interactive_ready=true`
  - `first_audio_payload_ms <= 1500`
  - `native_streaming_supported=true`
  - `same_voice_profile=true`
  - `browser_tts_used=false`
  - `requirement_packet_created=false`
  - `world_model_written=false`
- Self-test commands:
  - `npm.cmd run voice:generic-tts-stream:validate`
  - `npm.cmd run voice:generic-tts-stream:validate:configured-mock`
- Current no-config behavior:
  - `npm.cmd run voice:generic-tts-stream:validate:configured` fails when required real service config is missing.
  - Latest unconfigured report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\generic-streaming-tts-configured-unconfigured-20260628131358.json`.
- Latest self-test evidence:
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\generic-streaming-tts-validation-mock-20260628131324.json`
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\generic-streaming-tts-validation-configured-mock-20260628131323.json`

## 2026-06-28 Generic Streaming Probe Acceptance Template

- A generic local runtime probe now exists for the replaceable streaming TTS route.
- Command: `npm.cmd run voice:generic-tts-stream:validate`.
- This probe is the acceptance template for future real TTS adapters:
  - Configure adapter through `SIGHTFLOW_STATUS_DIALOGUE_TTS_*` or settings.
  - Prove first audible audio is within the interactive budget.
  - Prove audio frame sequence and final marker.
  - Prove the selected candidate is the configured fast adapter.
  - Prove same voice profile remains true.
  - Prove no browser audible TTS fallback is used.
- Latest local mock evidence:
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\generic-streaming-tts-validation-20260628130343.json`
  - `first_audio_payload_ms=53`
  - `total_stream_ms=151`
  - `selected_candidate_id=custom_streaming_tts_http`
  - `selected_candidate_interactive_ready=true`
  - `same_voice_profile=true`
- Boundary:
  - This is a local mock runtime proof, not a real vendor/local-engine proof.
  - It validates the system route and acceptance contract; the next real adapter must pass the same gate with real audio service output.

## 2026-06-28 Configurable Low-Latency Adapter Route

- The system now has a real configuration route for replacing the slow CosyVoice live path with a faster same-voice streaming TTS adapter.
- Default route stays unchanged:
  - `adapter_id=cosyvoice_local_http`
  - local-only unless explicitly changed
  - suitable for high-quality cached phrases, completion notices and clone-voice quality path
- Replaceable live routes:
  - `adapter_id=custom_streaming_tts_http`
  - `adapter_id=openai_compatible_streaming_http`
- Required runtime configuration shape:
  - `base_url`
  - `endpoint_path`
  - `health_path`
  - `model`
  - `voice`
  - `response_format=pcm|opus|mp3|wav`
  - `payload_mode=openai_compatible|cosyvoice_simple`
  - `stream_preferred=true`
  - `allow_remote=true` only when the target is not localhost
- Environment variable route:
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_ADAPTER_ID`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_BASE_URL`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_ENDPOINT`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_API_KEY`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_MODEL`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_VOICE`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_RESPONSE_FORMAT`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_ALLOW_REMOTE`
- Promotion gate:
  - First audible audio must be within the interactive budget.
  - Same voice profile must remain true.
  - Browser audible TTS must remain disabled.
  - V0 latency trace and V4 queue segment evidence must remain present.
- Latest verification:
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782651369959.json`
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782651409133.json`
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628125652.json`

## 2026-06-28 Streaming Runtime Verification Refresh

- Latest runtime probe: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628124447.json`.
- Result:
  - `native_streaming_supported=true`
  - `first_chunk_ms_from_request=13`
  - `first_audio_payload_chunk_ms_from_request=10407`
  - `total_request_ms=20401`
  - `interactive_ready=false`
  - `adapter_role=cached_high_quality_or_non_realtime_voice`
- Meaning: CosyVoice currently proves HTTP chunked streaming transport, but not acceptable first-audible latency for the primary live dialogue path.
- Current routing recommendation:
  - Keep CosyVoice for cached high-quality phrases, completion notices, non-realtime speech and future clone-voice quality path.
  - Keep V2 cache and V3 sentence queue as the current practical latency reducer.
  - Select a faster same-voice-compatible streaming adapter before making true streaming the default live dialogue path.
- Regression evidence:
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628124404.json`
  - `first_tts_ms=4`
  - `cached_chunk_count=2`
  - `browser_tts_used=false`
  - `same_voice_profile=true`

## 2026-06-28 V6 Same-Voice Tone Parameter Update

- The streaming output plan keeps the user requirement that every audible sentence uses high-quality TTS and the same voice profile.
- V6 now expresses emotion and reminder priority through `voice_tone_parameters.v1`, not by switching voice identity.
- Playback uses `applyVoiceToneToPlan` before segmentation and synthesis, so TTS requests receive the effective `speed / pitch / volume` values.
- Current mapping:
  - urgent patrol errors: faster and clearer, same voice.
  - focused patrol/task supervision: crisp and stable, same voice.
  - warm completion/casual chat: softer and natural, same voice.
  - reflective blocked/boundary review: slower and calmer, same voice.
- This update does not solve CosyVoice first-audible latency by itself. It only ensures that when a faster streaming adapter is selected later, the adapter receives the same tone contract and the same voice identity rule.
- Verification evidence:
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782641507145.json`
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782641504236.json`

## 2026-06-28 V5 Runtime Adapter Assessment

- 已增强 `scripts/validate-cosyvoice-http-streaming.cjs`，新增 `adapter_runtime_assessment`，不再只用 `native_streaming_supported=true` 判断实时体验。
- 新增报告 schema：`tts_streaming_adapter_runtime_assessment.v1`。
- 运行态阈值：`excellent_first_audio_ms=800`，`interactive_first_audio_ms=1500`，`borderline_first_audio_ms=2500`，`max_total_request_ms=12000`。
- 最新真实探针：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628094938.json`。
- 结果：`native_streaming_supported=true`，`first_chunk_ms_from_request=10`，`first_audio_payload_chunk_ms_from_request=7690`，`total_request_ms=10883`。
- PCM live 探针：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628095242.json`，`first_audio_payload_chunk_ms_from_request=10940`，`interactive_ready=false`，同样判定为 `cached_high_quality_or_non_realtime_voice`。
- 判定：`dialogue_realtime_grade=slow`，`interactive_ready=false`，`adapter_role=cached_high_quality_or_non_realtime_voice`。
- 结论：当前 CosyVoice HTTP adapter 传输层已经真流式，但首个可听音频 payload 仍约 7.7 秒，不满足实时主对话 TTS。它当前应作为高质量缓存短句、完成提醒、非实时播报和未来声音克隆路径；实时对话仍需要预热缓存、更短句段或更快的同音色流式 TTS adapter。
- 边界保持：不写世界模型，不创建 `requirement_packet.v1`，不保存麦克风原始音频，不重新启用浏览器可听 TTS fallback。

## 2026-06-28 V5 Runtime Policy UI Projection

- 已在右侧主体状态对话框新增 `status_dialogue_tts_runtime_policy.v1` 页面状态。
- 策略阈值与 runtime probe 对齐：800ms excellent，1500ms interactive，2500ms borderline。
- `stream assembled` 会显示为 `transport_only`，明确它只证明 frame transport 和 assembly，不代表边收边播。
- `stream live pcm` 会在真实播放后按首个 PCM 可听帧更新：`interactive`、`borderline` 或 `slow`。
- 设置面板新增短标签：`tts path`、`runtime`、`policy`、`first audio`；完整 role 和原因放在 tooltip，避免再次把界面变成参数墙。
- 3D 粒子 OS 新增星点：`voice.tts_runtime_policy`，映射输入 `tts_streaming_adapter_runtime_assessment.v1 / streaming_tts_audio_frame.v1 / voice_latency_trace.v1.first_frame_ms`，输出 `operator_visible_tts_path / voice_mode_recommendation`。
- 静态验证报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782640784081.json`。

## 2026-06-28 V5 Replaceable Adapter Candidates

- 新增核心 schema：`status_dialogue_tts_runtime_candidate.v1`。
- 新增核心函数：
  - `buildDefaultStatusDialogueTtsRuntimeCandidates`
  - `selectStatusDialogueTtsRuntimeCandidate`
- 当前默认候选槽：
  - `cosyvoice_local_http`：高质量缓存、完成提醒、非实时播报、克隆音色路径。
  - `openai_compatible_streaming_http`：未来低延迟 OpenAI-compatible 流式 TTS 候选，未配置前不会启用。
  - `custom_streaming_tts_http`：厂商无关的本地或远程流式 TTS 候选，未配置前不会启用。
- 选择规则：只有已配置、已启用、同音色契约成立，并且首个可听音频在交互阈值内的候选，才可成为 `live_dialogue_primary`；否则继续回到 CosyVoice 高质量缓存路径。
- 右侧设置面板新增 `candidate` 与 `slots` 状态位。
- 3D 粒子 OS 新增星点：`voice.tts_adapter_candidates`。
- 验证报告：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782641149077.json`
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782641146260.json`

更新时间：2026-06-28

## 目标

主体状态对话框的语音输出必须优先保证体验：每一句都走同一套高质量 TTS 音色，不用浏览器 TTS 混播；在此前提下降低“开始听到声音”的等待时间，并逐步具备真正的流式输出能力。

## 当前证据

- 当前稳定 GUI 默认仍是 `cosyvoice_short`：高质量分句队列，完整音频合成后播放。
- 已有 `cosyvoice_stream_assembled` 实验模式：通过 TTS stream IPC 接收 `streaming_tts_audio_frame.v1`，组装成 `audioDataUrl` 后进入现有播放队列。
- V0 测速口径已修正：WAV streaming 的第一个 44-byte header 不再视为可听音频；后续判断首音频应看 `first_audio_payload_chunk_ms`。
- 新增真实服务探针：`npm.cmd run voice:tts-stream-runtime:validate`。
- 服务端改造前报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628083616.json`
  - `native_streaming_supported=false`
  - `first_chunk_ms_from_request=10935`
  - `total_request_ms=10937`
  - 结论：虽然 body 被 Node 拆成多个 chunk，但第一帧几乎在完整响应结束时才到。
- 服务端改造后报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628083929.json`
  - `native_streaming_supported=true`
  - `transfer_encoding=chunked`
  - `first_chunk_ms_from_request=16`
  - `total_request_ms=10700`
  - 结论：本地 CosyVoice adapter 已经可以在 `stream:true` 下提前输出音频字节。
- 最新 runtime TTS 口径报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-runtime-tts-chain-validation-1782637533224.json`
  - `headers_ms=10`
  - `first_audio_payload_chunk_ms=7263`
  - `total_audio_ms=9034`

## 已完成调整

- `scripts/cosyvoice-openai-compatible-server.py`
  - 保留旧的一次性 WAV 输出路径。
  - `stream:true` 时启用 FastAPI `StreamingResponse`。
  - 底层调用 `cosyvoice.inference_sft(..., stream=True)`。
  - `response_format=wav` 时先输出 streaming WAV header，再持续输出 PCM16 音频字节。
  - `response_format=pcm` 时输出裸 PCM16，供后续 WebAudio 边收边播使用。
- `scripts/validate-cosyvoice-http-streaming.cjs`
  - 只做只读探测，不保存音频，不写世界模型，不创建 `requirement_packet.v1`。
  - 记录 health、headers、first chunk、total stream、chunk count、audio bytes。
- `package.json`
  - 新增 `voice:tts-stream-runtime:validate`。
- `ZhinengConsole.tsx`
  - 无 Electron IPC 的网页预览下，`stream assembled` 现在也能用浏览器 `fetch` 读取 HTTP body chunk。
  - 默认播放模式未改变，仍需用户显式选择 `stream assembled` 才启用。
- `scripts/validate-status-dialogue-stream-ipc.cjs`
  - 新增 `renderer_tts_stream_browser_preview_fallback` 验证项。

## 优化路线

### S1：稳定高质量分句队列

状态：已具备。

数据流：

`voiceText -> voice_response_plan.v1 -> voice_output_chunk.v1[] -> CosyVoice TTS -> HTMLAudioElement queue`

用途：

- 当前默认体验。
- 每句都使用高质量 TTS。
- 保持同一 voice profile。
- 不使用浏览器 TTS 可听输出。

### S2：短句缓存与预热

状态：已具备磁盘缓存和可重复运行的预热脚本。

优先缓存：

- “我已完成工作，张博先过来确认方案。”
- “我收到你的需求，正在检查状态。”
- “语音链路出现异常，我先切回文字反馈。”
- 巡检完成、提醒、错误、确认类短句。

目标：

- 高频确认语从秒级降到毫秒级。
- 保证所有缓存音频仍来自同一 CosyVoice profile。

当前实现：

- 新增命令：`npm.cmd run voice:cache:prewarm`
- 脚本：`D:\zhineng\sightflow-desktop-agent-main\scripts\prewarm-status-dialogue-tts-cache.cjs`
- 缓存目录：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-audio-cache`
- 首轮报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-tts-cache-prewarm-20260628090356.json`
  - `generated_count=4`
  - `cache_hit_count=0`
- 复跑报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-tts-cache-prewarm-20260628090407.json`
  - `generated_count=0`
  - `cache_hit_count=4`
- 结论：常用确认、巡检、错误和完成提醒短句已经可以预生成，并在后续运行中直接命中缓存。

### S3：真 HTTP 流式返回

状态：已完成服务端能力并通过探针验证。

数据流：

`CosyVoice stream=True -> StreamingResponse -> HTTP body chunk -> streaming_tts_audio_frame.v1`

当前效果：

- TTS 服务端已经能提前吐出音频字节。
- GUI 的 `stream assembled` 仍是“先收完整 frame，再组装播放”，所以还不能算真正边收边播。

### S4：边收边播播放层

状态：已新增显式实验模式入口，仍需 GUI 实机听感验收。

本轮实现：

- GUI 新增显式模式：`stream live pcm`。
- 请求 TTS 时使用 `response_format=pcm`。
- 主进程支持 stream request 的 `response_format` / `responseFormat` 覆盖。
- PCM 请求强制 `skip_cache=true`，避免读取旧 WAV cache。
- renderer 新增 `playVoiceLivePcmStreamChunk`：
  - 消费 `streaming_tts_audio_frame.v1(audio/pcm)`。
  - 使用 `decodePcm16LeMonoBase64` 解码 PCM16 LE mono。
  - 使用 WebAudio `AudioBufferSourceNode` 按 `playback_cursor_time` 排队调度。
  - 新会话开始时关闭旧 `AudioContext`，避免跨轮残留播放。
- 3D 粒子 OS 映射新增 `voice.live_pcm_playback` 子粒子。

为什么不用 WAV 边播作为主线：

- streaming WAV header 的总长度未知，只适合桥接和探测。
- 真正低延迟播放更适合 PCM frame + WebAudio 调度。

当前实测边界：

- `node scripts\validate-cosyvoice-http-streaming.cjs --format pcm --text "我正在测试实时 PCM 语音输出。"` 已通过。
- 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628085327.json`
- `native_streaming_supported=true`
- `first_chunk_ms_from_request=7225`
- `total_request_ms=10493`
- 解释：PCM 的第一段真实音频已经早于完整响应结束，但底层 CosyVoice 仍需要约 7.2 秒才吐出第一段可听音频；因此 live PCM 能减少“完整音频下载后再播放”的等待，但不能单独解决底层模型首音频生成慢的问题。
- 复跑波动报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628085644.json`
  - `native_streaming_supported=true`
  - `first_chunk_ms_from_request=11671`
  - `total_request_ms=14166`
  - 判断：首音频生成时间存在明显波动，下一步优化重点仍应放在底层 TTS 首帧生成、预热、分句长度和更快 adapter 上。

### S5：模型文本流与 TTS 队列融合

状态：模型 stream IPC 已具备；下一步应把真实模型 `voice` 字段的第一句稳定接入 TTS stream live。

目标：

- 模型 `voice` 字段第一句完整时立即进入 TTS。
- 剩余正文继续流式生成，不重复播放已播第一句。
- 文字展示和语音播放状态同步。

### S6：情绪与提醒优先级

状态：规则已具备，后续要接入真实 voice style 参数。

约束：

- 情绪影响语气和 TTS 参数，不改变 voice profile。
- 巡检异常、完成提醒、闲聊、任务监督都走同一音色。
- 不为了速度降低 TTS 质量，不切回浏览器声音。

## 验收门槛

- `npm.cmd run voice:tts-stream-runtime:validate`
  - `native_streaming_supported=true`
  - `first_chunk_ms_from_request < total_request_ms`
  - `transfer_encoding=chunked`
- `npm.cmd run voice:stream-ipc:validate`
  - `renderer_tts_stream_browser_preview_fallback=true`
  - `main_tts_stream_uses_http_adapter=true`
- `npm.cmd run voice:pipeline:validate`
  - frame 顺序、重组、缓存、情绪优先级通过。
- `npm.cmd run typecheck`
- `npm.cmd run build`
- GUI 手工验收：
  - 默认 `cosyvoice_short` 可播放。
  - `stream assembled` 可播放。
  - `stream live pcm` 可播放，且首个可听音频早于完整合成完成。
  - 无浏览器 TTS 混声。

## 边界

- 当前只优化主体状态对话框自有语音输出。
- 不写世界模型。
- 不接人际关系图谱或事件图谱真实数据。
- 不创建 `requirement_packet.v1`。
- 不保存麦克风原始音频。
- 不为了降低延迟牺牲“每一句高质量 TTS”的体验目标。

## 2026-06-28 Ack Cache Alignment Update

- 已将 UI 实际播放的两条即时确认语纳入核心常量：
  - `STATUS_DIALOGUE_VOICE_ACK_TEXT.speech_transcript`
  - `STATUS_DIALOGUE_VOICE_ACK_TEXT.text`
- `ZhinengConsole.tsx` 的提交链路继续在模型请求前播放 ack，但 ack 文案改为从核心常量代理生成，避免 UI 文案和预热缓存漂移。
- `prewarm-status-dialogue-tts-cache.cjs` 已加入两条真实 UI ack 短句。
- 最新预热证据：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-tts-cache-prewarm-20260628091603.json`
  - `generated_count=2`
  - `cache_hit_count=4`
  - 新生成项为真实 UI ack 短句。
- 复跑证据：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-tts-cache-prewarm-20260628091613.json`
  - `generated_count=0`
  - `cache_hit_count=6`
- 完整链路报告：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628091624.json`
  - `ack_cache_all_hit=true`
  - `ack_cache_low_latency=true`
  - `ack_cache_hit_count=2`
  - `first_tts_ms=2`
  - `cached_chunk_count=2`
  - `browser_tts_used=false`
  - `same_voice_profile=true`
- 当前结论：V2 短句缓存已经覆盖“用户输入后第一句即时确认”的真实 UI 文案，首响等待不再依赖未缓存 CosyVoice 生成。

## 2026-06-28 Formal Opening Cache Update

- 新增正式巡检开场句缓存候选，区别于 ack：
  - ack：表示“收到输入”。
  - formal opening：表示“开始给出巡检结论”。
- 核心常量：
  - `STATUS_DIALOGUE_VOICE_OPENING_TEXT.ok`
  - `STATUS_DIALOGUE_VOICE_OPENING_TEXT.warn`
  - `STATUS_DIALOGUE_VOICE_OPENING_TEXT.blocked`
  - `STATUS_DIALOGUE_VOICE_OPENING_TEXT.unknown`
  - `buildStatusDialogueVoiceOpeningText`
- `buildStatusDialogueUserPrompt` 已加入 `voice_opening_policy.selected_first_sentence`，要求模型的 `voice` 字段首句保留选中状态含义，但不逐字固定开场。
- 本地 fallback 的 `voiceText` 也会以同一正式开场句开始，保证无模型时仍能命中同一缓存策略。
- 预热脚本已加入 4 条正式开场句。
- 预热证据：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-tts-cache-prewarm-20260628092718.json`
  - `generated_count=4`
  - `cache_hit_count=6`
- 预热复跑：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-tts-cache-prewarm-20260628092730.json`
  - `generated_count=0`
  - `cache_hit_count=10`
- 完整闭环首跑：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628092740.json`
  - `formal_opening_first_sentence=true`
  - `formal_opening_cache_hit=true`
  - `formal_opening_low_latency=true`
  - `first_tts_ms=2`
  - `total_tts_ms=10217`
  - 解释：正式第一句已命中缓存；剩余新句首次生成仍走慢路径。
- 完整闭环复跑：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628092814.json`
  - `formal_opening_cache_hit=true`
  - `runtime_voice_cache_hits=2`
  - `first_tts_ms=3`
  - `total_tts_ms=5`
  - `cached_chunk_count=2`
- 当前结论：正式巡检反馈的第一句已具备可控、可预热、可验证的同音色低延迟路径；剩余新句满足“首次生成后缓存”，第二轮同内容可降到毫秒级 TTS。

## 2026-06-28 Multi-Sentence Pseudo-Streaming Update

- V3 从“只提前播放第一句”扩展为“每个完整句子都可在模型未结束时进入 TTS 队列”。
- 核心层：
  - `voice_response_text_stream_event.v1` 新增 `sentence_ready`。
  - `VoiceResponseTextStreamState` 新增 `emitted_sentence_count` 和 `emitted_text_length`。
  - `sentence_ready` 带 `sentence_index` 与 `spoken_prefix`，用于播放顺序和最终去重。
  - 旧 `first_sentence_ready` 保留，保证旧指标仍可观察。
- Renderer：
  - `requestStatusDialogueModel` 回调升级为 `onStreamingVoiceSentence`。
  - 每个完整句子进入 `playVoicePlanThroughQueue`。
  - 最终回复用 `spoken_prefix` 调用 `stripAlreadySpokenVoicePrefix`，避免重复播放已经提前播过的句子。
- 验证：
  - `npm.cmd run voice:pipeline:validate` 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782639351989.json`。
  - `npm.cmd run voice:stream-loop:validate` 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628093634.json`。
  - 关键结果：`streamed_sentence_count_at_least_two=true`，`streamed_sentences_tts_ok=true`，`streamed_sentences_no_final_duplicate=true`，`total_tts_ms=8`，`cached_chunk_count=2`。
  - `npm.cmd run voice:stream-ipc:validate` 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782639440440.json`，`renderer_stream_sentences_to_queue=true`。
  - `npm.cmd run typecheck` 通过。
  - `npm.cmd run build` 通过。
- 当前结论：V3 已具备多句伪流式播放队列和最终去重证据；真正新句首次 TTS 首包慢的问题仍属于 V5/后端 adapter 优化范围。

## 2026-06-28 Per-Sentence Latency Segments

- V0 测速从整轮汇总扩展到句级/分块级 trace。
- `voice_latency_trace.v1` 新增 `segments`：
  - `chunk_id`
  - `source_output_id`
  - `kind`
  - `index / total`
  - `text_length`
  - `cache_hit`
  - `status`
  - `tts_ms`
  - `first_frame_ms`
  - `total_stream_ms`
  - `playback_ms`
  - `error`
- Renderer 的 `playVoicePlanThroughQueue` 会在每个 chunk 成功、跳过或失败时写入 segment。
- 闭环验证报告：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628094204.json`
  - `latency_segments_cover_streamed_sentences=true`
  - `latency_trace.segments.length=2`
  - 第 1 句：`cache_hit=true`，`tts_ms=4`，`playback_ms=2810`
  - 第 2 句：`cache_hit=true`，`tts_ms=4`，`playback_ms=3518`
- 回归验证：
  - `npm.cmd run voice:pipeline:validate` 通过，报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782639700174.json`
  - `npm.cmd run voice:stream-loop:validate` 通过。
  - `npm.cmd run voice:stream-ipc:validate` 通过，报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782639749649.json`
  - `npm.cmd run typecheck` 通过。
  - `npm.cmd run build` 通过。
- 当前结论：后续优化 V5 时可以按 segment 判断每句慢在哪里，不再只看整轮 TTS 总耗时。

## 2026-06-28 V0-V6 Audit Gate

- 后续所有语音输出优化必须先跑统一审计：
  - `npm.cmd run voice:v0-v6:audit`
  - 进入完成态前必须跑 `npm.cmd run voice:v0-v6:audit:strict`
- 当前最新审计：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-voice-v0-v6-audit-20260628132751.json`
  - `overall_status=incomplete`
  - 唯一未完成项：`V5_real_low_latency_tts_acceptance`
- 当前最新 strict 审计：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-voice-v0-v6-audit-20260628132825.json`
  - strict 失败是当前正确结果，表示不能把 V0-V6 标记为完整完成。
- 当前真实配置探针：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\generic-streaming-tts-configured-unconfigured-20260628132827.json`
  - 真实流式 TTS 尚未配置：缺少 `adapter_id`、`base_url`、`endpoint_path`、`model`、`voice`。
- 当前 configured mock 探针：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\generic-streaming-tts-validation-configured-mock-20260628132757.json`
  - `first_audio_payload_ms=76`
  - `same_voice_profile=true`
  - 只能证明 adapter 和配置入口可用，不能替代真实服务验收。
- V5 完成条件：
  1. 配置真实低延迟 TTS 服务参数。
  2. `npm.cmd run voice:generic-tts-stream:validate:configured` 通过。
  3. 首个真实音频 payload 达到交互阈值。
  4. `same_voice_profile=true`。
  5. 不启用浏览器可听 TTS fallback。
  6. `npm.cmd run voice:v0-v6:audit:strict` 通过。

## 2026-06-28 Edge Read Aloud Real Streaming Acceptance

- 新增真实远程 WebSocket 流式候选：`edge_readaloud_websocket`。
- 新增命令：`npm.cmd run voice:edge-tts-stream:validate`。
- 验证脚本：`D:\zhineng\sightflow-desktop-agent-main\scripts\validate-edge-readaloud-streaming-tts.cjs`。
- 最新通过报告：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\edge-readaloud-streaming-validation-20260628134821035.json`
  - `first_audio_payload_ms=916`
  - `interactive_first_audio_ms=1500`
  - `audio_frame_count=22`
  - `same_voice_profile=true`
  - `native_streaming_supported=true`
  - `browser_tts_used=false`
- V0-V6 strict 审计：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-voice-v0-v6-audit-20260628135223.json`
  - `overall_status=complete`
  - `incomplete_required_ids=[]`
- 结论：
  - V5 真实低延迟验收已通过。
  - 当前仍不把 Edge 路线强制设为 GUI 默认播音路径；默认路径切换、实机听感和声音克隆是下一阶段独立决策。
