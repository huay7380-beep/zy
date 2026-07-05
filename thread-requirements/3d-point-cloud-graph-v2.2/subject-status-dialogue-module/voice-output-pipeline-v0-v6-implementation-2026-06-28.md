# Voice Output Pipeline V0-V6 Implementation 2026-06-28

## 2026-06-28 V5 Configured Generic Streaming TTS Probe

- `validate-generic-streaming-tts-adapter.cjs` now supports three modes:
  - `mock`: local deterministic mock route.
  - `configured-mock`: configured route against the local mock server.
  - `configured`: real service route using `SIGHTFLOW_STATUS_DIALOGUE_TTS_*` or CLI parameters.
- New commands:
  - `npm.cmd run voice:generic-tts-stream:validate`
  - `npm.cmd run voice:generic-tts-stream:validate:configured-mock`
  - `npm.cmd run voice:generic-tts-stream:validate:configured`
- Evidence:
  - Mock route passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\generic-streaming-tts-validation-mock-20260628131324.json`.
  - `first_audio_payload_ms=53`.
  - Configured-mock route passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\generic-streaming-tts-validation-configured-mock-20260628131323.json`.
  - `first_audio_payload_ms=55`.
  - Configured real route correctly failed when no real service config exists.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\generic-streaming-tts-configured-unconfigured-20260628131358.json`.
  - Missing fields: `adapter_id`, `base_url`, `endpoint_path`, `model`, `voice`.
- Regression:
  - `npm.cmd run voice:pipeline:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782652490909.json`.
  - `npm.cmd run voice:stream-ipc:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782652487624.json`.
  - `npm.cmd run voice:stream-loop:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628131524.json`.
  - `npm.cmd run voice:tts-stream-runtime:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628131542.json`.
  - `npm.cmd run build` passed.
- Boundary:
  - No browser audible TTS fallback.
  - No `requirement_packet.v1`.
  - No world model write.
  - Page `http://[::1]:5173/?window=zhineng-graph` returned 200.
- Current conclusion:
  - The real-service acceptance command now exists and fails loudly when unconfigured.
  - The current local CosyVoice path remains slow: `first_audio_payload_chunk_ms_from_request=11025`, `interactive_ready=false`.
  - The full V0-V6 goal still needs a configured real low-latency TTS adapter and GUI-side listening verification.

## 2026-06-28 V5 Generic Streaming TTS Runtime Probe

- New command: `npm.cmd run voice:generic-tts-stream:validate`.
- New script: `D:\zhineng\sightflow-desktop-agent-main\scripts\validate-generic-streaming-tts-adapter.cjs`.
- Purpose:
  - Prove that the replaceable streaming TTS route is executable, not only declared.
  - Keep the test local and deterministic before connecting a real provider or local engine.
- Probe behavior:
  - Starts a local mock chunked HTTP TTS server.
  - Builds a `custom_streaming_tts_http` config through `normalizeStatusDialogueTtsConfig`.
  - Sends an OpenAI-compatible streaming body with `stream=true`.
  - Consumes streamed audio frames through `createHttpStreamingTtsAdapter`.
  - Reassembles frames through `assembleStreamingTtsAudioFrames`.
  - Feeds runtime evidence into `buildDefaultStatusDialogueTtsRuntimeCandidates(..., { config })`.
  - Verifies that `selectStatusDialogueTtsRuntimeCandidate` selects the configured fast adapter.
- Evidence:
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\generic-streaming-tts-validation-20260628130343.json`.
  - `adapter_id=custom_streaming_tts_http`.
  - `selected_candidate_interactive_ready=true`.
  - `first_audio_payload_ms=53`.
  - `total_stream_ms=151`.
  - `audio_frame_count=3`.
  - `final_frame_count=1`.
  - `same_voice_profile=true`.
  - `external_network_used=false`.
  - `browser_tts_used=false`.
- Regression:
  - `npm.cmd run voice:pipeline:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782651853560.json`.
  - `npm.cmd run voice:stream-ipc:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782651850586.json`.
  - `npm.cmd run voice:stream-loop:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628130436.json`.
  - `npm.cmd run voice:tts-stream-runtime:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628130450.json`.
  - `npm.cmd run build` passed.
- Current conclusion:
  - The V5 replaceable low-latency adapter route is now executable and measurable.
  - The current local CosyVoice probe still reports `interactive_ready=false`, with `first_audio_payload_chunk_ms_from_request=11279`.
  - A real fast TTS provider/local engine still needs to be configured and probed before promoting the live dialogue path.

## 2026-06-28 V5 Configurable Streaming TTS Adapter Entry

- V5 now has a runtime configuration entry for replaceable low-latency TTS adapters.
- Code updated:
  - `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\tts-adapter.ts`
  - `D:\zhineng\sightflow-desktop-agent-main\src\main\index.ts`
  - `D:\zhineng\sightflow-desktop-agent-main\scripts\validate-voice-output-pipeline.cjs`
  - `D:\zhineng\sightflow-desktop-agent-main\scripts\validate-status-dialogue-stream-ipc.cjs`
- Runtime behavior:
  - Default remains `cosyvoice_local_http`.
  - `custom_streaming_tts_http` and `openai_compatible_streaming_http` can now be selected by config instead of being UI-only candidates.
  - `adapter_id / adapterId`, `response_format / responseFormat`, and `payload_mode / payloadMode` aliases are normalized.
  - Generic environment variables are supported while old `SIGHTFLOW_COSYVOICE_*` variables remain compatible.
- Generic environment variables:
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_ADAPTER_ID`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_BASE_URL`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_ENDPOINT`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_HEALTH_PATH`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_API_KEY`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_MODEL`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_VOICE`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_RESPONSE_FORMAT`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_PAYLOAD_MODE`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_ALLOW_REMOTE`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_STREAM`
  - `SIGHTFLOW_STATUS_DIALOGUE_TTS_TIMEOUT_MS`
- Boundary:
  - Remote TTS remains blocked unless `allow_remote=true` or `SIGHTFLOW_STATUS_DIALOGUE_TTS_ALLOW_REMOTE=1`.
  - No browser audible TTS fallback is restored.
  - No world model or requirement packet write is added.
- Verification evidence:
  - `npm.cmd run voice:pipeline:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782651369959.json`.
  - New checks: `tts_config_custom_adapter=custom_streaming_tts_http`, `tts_config_openai_adapter=openai_compatible_streaming_http`, `tts_config_openai_stream_body=true`.
  - `npm.cmd run voice:stream-ipc:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782651409133.json`.
  - New checks: `main_tts_generic_config_env=true`, `core_tts_adapter_id_configurable=true`.
  - `npm.cmd run voice:stream-loop:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628125652.json`.
  - `npm.cmd run build` passed.
  - `npm.cmd run voice:tts-stream-runtime:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628125742.json`.
- Current conclusion: V5 can now accept a configured faster streaming adapter without code edits. The current local CosyVoice probe still reports `interactive_ready=false`, so a real low-latency TTS service must be configured and probed before promoting it as the primary live dialogue path.

## 2026-06-28 V0-V6 Verification Refresh

- `npm.cmd run voice:pipeline:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782650626652.json`.
- `npm.cmd run voice:stream-ipc:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782650623861.json`.
- `npm.cmd run voice:stream-loop:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628124404.json`.
  - `first_sentence_ready_before_model_done=true`.
  - `first_tts_started_before_model_done=true`.
  - `same_voice_profile=true`.
  - `browser_tts_used=false`.
  - `cached_chunk_count=2`.
  - `failed_chunk_count=0`.
  - `first_tts_ms=4`.
  - `total_tts_ms=8`.
- `npm.cmd run voice:tts-stream-runtime:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628124447.json`.
  - `native_streaming_supported=true`.
  - `first_chunk_ms_from_request=13`.
  - `first_audio_payload_chunk_ms_from_request=10407`.
  - `total_request_ms=20401`.
  - `interactive_ready=false`.
  - `adapter_role=cached_high_quality_or_non_realtime_voice`.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.
- Page check: `http://[::1]:5173/?window=zhineng-graph` returned 200.
- In-app browser UI check after reload:
  - `Subject Status Dialogue` visible.
  - voice controls visible.
  - 3D canvas present at `1278 x 618`.
  - frontend error log count: `0`.
- Boundary check found no executable-code matches for:
  - `requirement_packet.v1`
  - `new SpeechSynthesisUtterance`
  - `speechSynthesis.speak`
  - `synth.speak`
  - `browser_speech_audio_fallback`
- Current conclusion: V0-V6 code-level and automated probe evidence is aligned. The full goal is still not marked complete because real GUI speaker feeling, real microphone multi-turn dialogue, and low-latency primary live TTS remain operational acceptance items. CosyVoice is still too slow as the primary live dialogue adapter unless cache hits.

## 2026-06-28 V6 Tone Parameters Runtime Alignment

- V6 has moved from priority tagging to runtime voice tone parameters.
- New schema: `voice_tone_parameters.v1`.
- Core functions:
  - `buildVoiceToneParameters`
  - `applyVoiceToneToPlan`
- Runtime path:
  - `playVoicePlanThroughQueue` locks the audible `VoiceProfile`.
  - It builds an `effectivePlan` with the emotion hint and tone parameters.
  - `segmentVoiceResponsePlan`, `synthesizeVoiceChunk`, `playVoiceAudioChunk`, live PCM playback, cache write and latency trace all use the same `effectivePlan`.
- Same-voice rule:
  - `voice_profile_id` stays locked to the resolved audible profile.
  - `clone_profile_id` stays locked to the same profile.
  - Emotion changes `speed / pitch / volume`, not the voice identity.
- Current tone map:
  - `urgent`: speed `1.08`, pitch `1.01`, volume `1`.
  - `focused`: speed `1.03`, pitch `0.98`, volume `0.98`.
  - `warm`: speed `0.98`, pitch `1.02`, volume `0.95`.
  - `calm`: speed `0.96`, pitch `0.99`, volume `0.92`.
  - `reflective`: speed `0.92`, pitch `0.96`, volume `0.92`.
  - `steady`: speed `1`, pitch `1`, volume `0.96`.
- Verification evidence:
  - `npm.cmd run voice:pipeline:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782641507145.json`.
  - `tone_parameters_schema=voice_tone_parameters.v1`.
  - `tone_parameters_same_voice=true`.
  - `tone_parameters_plan_speed_applied=true`.
  - `npm.cmd run voice:stream-ipc:validate` passed.
  - Report: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782641504236.json`.
  - `renderer_voice_tone_policy_applied=true`.
  - `npm.cmd run typecheck` passed.
- Boundary:
  - No browser audible TTS fallback is restored.
  - No `requirement_packet.v1` is created.
  - No world model, social graph or event graph write path is touched.
  - Real speaker feeling and real multi-turn microphone dialogue still need GUI-side confirmation before the full V0-V6 goal can be marked complete.

## 2026-06-28 V5 Runtime Adapter Assessment

- Code updated: `D:\zhineng\sightflow-desktop-agent-main\scripts\validate-cosyvoice-http-streaming.cjs`.
- New report object: `adapter_runtime_assessment` with schema `tts_streaming_adapter_runtime_assessment.v1`.
- The assessment now records `transport_streaming_ok`, `first_audio_payload_ms`, `dialogue_realtime_grade`, `interactive_ready`, `adapter_role`, thresholds, recommendation, and next actions.
- Latest runtime evidence: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628094938.json`.
- Result: `native_streaming_supported=true`, `first_chunk_ms_from_request=10`, `first_audio_payload_chunk_ms_from_request=7690`, `total_request_ms=10883`.
- PCM live evidence: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628095242.json`, `first_audio_payload_chunk_ms_from_request=10940`, `interactive_ready=false`.
- Assessment: `dialogue_realtime_grade=slow`, `interactive_ready=false`, `adapter_role=cached_high_quality_or_non_realtime_voice`.
- Meaning: current CosyVoice transport is truly streaming, but first audible payload latency is too high for primary live dialogue. Keep it for high-quality cached phrases, completion notices, non-realtime voice, and clone-voice path while continuing V2/V3 cache and sentence-level streaming, or evaluate a faster same-profile streaming TTS adapter.
- Boundaries verified: no `requirement_packet.v1`, no world-model write, no raw microphone audio save, no browser audible TTS fallback.

## 2026-06-28 V5 Runtime Policy UI Projection

- Code updated: `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\ZhinengConsole.tsx`.
- New UI/runtime state: `status_dialogue_tts_runtime_policy.v1`.
- Policy thresholds: excellent <= 800ms, interactive <= 1500ms, borderline <= 2500ms.
- `cosyvoice_stream_assembled` is now explicitly labeled as `stream_assembled_transport_only`.
- `cosyvoice_stream_live_pcm` updates runtime policy from actual PCM first-frame evidence after playback.
- The patrol window now exposes compact fields: `tts path`, `runtime`, `policy`, and `first audio`.
- 3D Particle OS mapping now includes `voice.tts_runtime_policy`, with refs to `assessTtsRuntimePolicy`, `TTS_RUNTIME_POLICY_THRESHOLDS`, and `voiceOutputMode`.
- Verification evidence: `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782640784081.json`; `npm.cmd run typecheck` passed.

## 2026-06-28 V5 Replaceable Adapter Candidates

- Code updated:
  - `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\tts-adapter.ts`
  - `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\ZhinengConsole.tsx`
  - `D:\zhineng\sightflow-desktop-agent-main\scripts\validate-voice-output-pipeline.cjs`
  - `D:\zhineng\sightflow-desktop-agent-main\scripts\validate-status-dialogue-stream-ipc.cjs`
- New schema: `status_dialogue_tts_runtime_candidate.v1`.
- New functions: `buildDefaultStatusDialogueTtsRuntimeCandidates`, `selectStatusDialogueTtsRuntimeCandidate`.
- Default candidates:
  - `cosyvoice_local_http`: high-quality cache / non-realtime / clone voice path.
  - `openai_compatible_streaming_http`: future OpenAI-compatible live streaming candidate.
  - `custom_streaming_tts_http`: vendor-neutral local or remote streaming TTS candidate.
- Selection rule: a live candidate must be configured, enabled, same-voice compatible, and within first-audio budget before replacing the current high-quality cached path.
- UI now shows candidate and slot count; 3D mapping includes `voice.tts_adapter_candidates`.
- Verification evidence:
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782641149077.json`
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782641146260.json`
  - `npm.cmd run typecheck` passed.

## Scope

本次只优化主体状态对话框自己的语音输出链路，不接入世界核心写入，不创建 `requirement_packet.v1`，不接真实人际图谱或事件图谱，不触发外部动作。

## Implemented Chain

### V0 链路测速

- 新增 `voice_latency_trace.v1`。
- 右下角设置面板展示 `stt / model / tts / play / total`。
- TTS 细分为 `first_tts_ms` 与 `total_tts_ms`。
- 播放细分为 `first_playback_ms` 与 `total_playback_ms`。
- 队列记录 `queued / completed / failed / cached`。

### V1 统一音色

- 新增 `resolveAudibleVoiceProfile`。
- 所有可听输出锁定到 CosyVoice `voice.cosyvoice.local.default` 或同类 `cosyvoice_local_http` profile。
- ACK、正式回复、完成播报、测试音色共用同一 voice profile。
- 已移除 `ZhinengConsole.tsx` 中主动调用 `SpeechSynthesisUtterance` / `speechSynthesis.speak` 的可听 fallback 路径。
- 浏览器 speech synthesis 仅保留为环境能力检测，不再作为当前可听输出路径。

### V2 短句缓存

- 新增内存态 `voiceAudioCacheRef`。
- 缓存键由文本、voice profile、adapter、voice id、emotion 组成。
- 缓存上限为 24 条。
- 常用 ACK、完成提醒、错误/巡逻短句首次合成后可复用。
- 当前不写磁盘，避免影响其他线程和外部状态。

### V3 分句伪流式

- 新增 `voice_output_chunk.v1`。
- `voice_response_plan.v1` 会被拆成多个 `voice_output_chunk.v1`。
- ACK 在模型回复完成前进入同一个 TTS 队列，提供模型未完成时的首段语音反馈。
- 最终回复按中文标点和长度分段，合成一段播放一段。
- 当前为 high quality chunked pseudo-streaming；不绑定单一未来工具。

### V4 播放队列

- 新增 `voice_playback_queue.v1`。
- 新增 `voice_playback_queue_simulation.v1` 和 `simulateVoicePlaybackQueue`，用于自动验证队列顺序、缓存命中和失败计数。
- 新函数 `playVoicePlanThroughQueue` 统一处理 ACK、最终回复和完成提醒。
- 新会话开始会打断旧播放并重置队列。
- 队列顺序执行，避免多段音频重叠、遗漏和重复。
- 每段播放通过 `HTMLAudioElement`，不再混入浏览器 TTS 音色。

### V5 真流式 adapter 预留与通用帧流实现

- 新增 `streaming_tts_adapter.v1`。
- 新增 `StreamingTtsAdapter`、`StreamingTtsSynthesisRequest`、`StreamingTtsAudioFrame` 接口。
- 预留 WebSocket、SSE、chunked HTTP、audio frame stream。
- 当前默认 adapter 为 `streaming_tts_adapter.reserved`，状态为未启用。
- 新增 `createBufferedStreamingTtsAdapter`，可把任意 TTS 合成结果中的 `audio_base64` 转换为 `streaming_tts_audio_frame.v1` 有序帧流。
- 新增 `splitAudioBase64IntoStreamingFrames`，用于验证和复用音频 base64 分帧逻辑。
- 未来可以替换成真正的 streaming TTS，而不重写上层队列和 UI。

### V6 情绪与提醒优先级

- `VoiceOutputChunk` 包含 `emotion_hint` 与 `priority`。
- 巡检异常、缺失状态、完成提醒会进入不同 priority。
- 当前情绪仍由现有 `deriveXiaozhiStyleEmotion` 和 voice profile defaults 驱动。
- 所有情绪变化只改变队列语义和 future adapter 输入，不改变统一音色。

## Code Touch Points

- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\voice-output-pipeline.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue-contracts.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\ZhinengConsole.tsx`

## 3D Particle OS Mapping

已同步到 `status-dialogue-system` 星云：

- `voice.tts_adapter`: CosyVoice locked + chunk queue
- `voice.voice_profile`: CosyVoice audible lock
- `voice.voice_response_plan`: chunked output plan
- `voice.playback_queue`: chunk queue active
- `voice.streaming_tts_adapter`: buffered frame adapter + reserved native streaming adapter
- `voice.output_trace`: CosyVoice chunked trace
- `speech_synthesis`: legacy capability only

## Verification

已执行：

- `npm.cmd run typecheck` 通过。
- `npm.cmd run build` 通过。
- `npm.cmd run voice:pipeline:validate` 通过；最新验证报告写入 `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782624023038.json`。
- `npm.cmd run voice:runtime:validate` 通过；最新运行时报告写入 `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-runtime-tts-chain-validation-1782623734068.json`。
- 运行时 TTS 探针已实际请求本地 CosyVoice：health `58ms`，合成 `5693ms`，输出 `audio/wav`，大小 `101420 bytes`，WAV header 有效；音频样本写入 `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-runtime-tts-chain-audio-1782623734066.wav`。
- 运行时帧流验证通过：`streaming_tts_adapter.runtime.cosyvoice_buffered` 生成 `34` 个 `streaming_tts_audio_frame.v1`，最后一帧 `final=true`，base64 重组一致。
- `rg "synth\\.speak|new SpeechSynthesisUtterance|browser_speech_audio_fallback|browser TTS fallback used|SpeechSynthesisUtterance" src\renderer\src\zhineng-console\ZhinengConsole.tsx` 无命中。
- `http://[::1]:5173/?window=zhineng-graph` 返回 HTTP 200。
- `http://127.0.0.1:8000/health` 返回 HTTP 200。
- 浏览器 UI 验证通过：右侧设置面板显示 `chunked short`、`chunked full`、`locked same voice`、`queue`、`cache`、`fail`、`latency`、`CosyVoice READY`；3D canvas 尺寸为 `1278 x 618`，截图非空白。

补充修正：

- 中文分句规则改为 Unicode escape 写法，并去掉逗号断句，避免把自然中文短语拆得过碎。
- 新增 `scripts/validate-voice-output-pipeline.cjs` 和 `npm.cmd run voice:pipeline:validate`，用于验证中文断句、短句合并、缓存键、队列默认状态、延迟 trace、streaming adapter 预留、buffered frame adapter 实现、帧顺序和 base64 重组。
- `voice:pipeline:validate` 现已覆盖 V4/V2 队列规则：`queue_playback_order_ok=true`、`queue_cache_hits=1`、`queue_failure_count=1`。
- 部分 chunk 失败时 `voice_output_trace.v1` 不再标为 `fallback`，而是标为 `error`，避免误解为重新启用浏览器可听 TTS fallback。
- 已修复 renderer build gate：`electron.vite.config.ts` 的 renderer HTML input 改为相对路径，避免 Vite build-html 把绝对路径当 emitted asset name。

已知限制：

- 当前运行路径仍是高质量分块伪流式；V5 已实现通用 buffered audio frame adapter，可消费为音频帧流。真正由 TTS 服务端边生成边吐出的原生流式 WebSocket/SSE/chunked HTTP adapter 仍作为后续替换项。
- 当前实测主要延迟瓶颈仍在本地 CosyVoice 合成阶段，本轮样本为 `5693ms`；后续体验优化应优先评估原生 streaming TTS、预热、缓存和更快的高质量 TTS adapter。
- in-app browser 自动化环境可能仍受 autoplay 限制；真实音频验收仍以右下角 GUI/Electron 为主。
## 2026-06-28 V6 Rule Hardening

- 已将 V6 情绪与提醒优先级从 renderer 临时判断下沉到核心语音管线：`deriveVoiceEmotionPriority`。
- 当前规则：
  - `error` / `patrol_blocked` -> `emotion_hint=urgent`，`priority=urgent`。
  - `patrol_warn` / missing status / `global_status=warn` -> `emotion_hint=focused`，`priority=notice`。
  - `completion_notice` -> `emotion_hint=warm`，`priority=notice`。
  - `casual_chat` -> `emotion_hint=warm`，`priority=normal`。
  - `task_supervision` -> `emotion_hint=focused`，`priority=notice`。
  - normal patrol -> `emotion_hint=steady`，`priority=normal`。
- `segmentVoiceResponsePlan` 新增 `emotionHint` 覆盖入口；情绪只影响 chunk 的表达提示和缓存键，不改变 `voice_profile_id`。
- renderer 中 ACK、final reply、completion notice 已统一接入该策略，再进入 `playVoicePlanThroughQueue`。
- 已移除 UI 中残留的 “browser fallback” 完成播报标题文案，避免误判为仍存在浏览器可听语音混播。
- 最新验证报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782624496982.json`。
- 报告新增检查：
  - `emotion_priority_error=urgent/urgent`
  - `emotion_priority_patrol_warn=focused/notice`
  - `emotion_priority_completion=warm/notice`
  - `emotion_priority_casual_chat=warm/normal`
  - `emotion_priority_task_supervision=focused/notice`
  - `emotion_priority_same_voice=true`
- 验证命令：
  - `npm.cmd run voice:pipeline:validate` 通过。
  - `npm.cmd run typecheck` 通过。
  - `npm.cmd run build` 通过。
  - 静态检索 `new SpeechSynthesisUtterance|synth\.speak|browser_speech_audio_fallback|browser TTS fallback used|with browser fallback` 无命中。
- 当前边界：自动验证已经证明规则、分句、缓存键、队列、buffered frame adapter、同音色约束成立；真实扬声器听感、真实麦克风多轮对话和原生服务端流式 TTS 仍需后续实测或 adapter 替换验证。
## 2026-06-28 Runtime TTS Recheck

- 已重新执行 `npm.cmd run voice:runtime:validate`。
- 最新 runtime 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-runtime-tts-chain-validation-1782624653088.json`。
- 最新 WAV 样本：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-runtime-tts-chain-audio-1782624653086.wav`。
- 复验结果：
  - health `77ms`。
  - TTS `5833ms`。
  - audio mime `audio/wav`。
  - byte length `91692`。
  - WAV header valid。
  - buffered stream `30` frames，`final_frame=true`，`recombined=true`。
  - boundary: `browser_tts_used=false`，`external_world_write=false`，`requirement_packet_created=false`。
- 结论：当前最大延迟仍在本地 CosyVoice 合成阶段；V5 已具备 buffered frame adapter，可作为未来替换原生 streaming TTS adapter 的接口基础。
## 2026-06-28 V3 Text Stream Gate

- 已新增 `voice_response_text_stream.v1` 与 `voice_response_text_stream_event.v1`。
- 新增函数：
  - `buildDefaultVoiceResponseTextStreamState`
  - `appendVoiceResponseTextDelta`
  - `finishVoiceResponseTextStream`
- 目标：模型自然语言字段出现增量 delta 后，先汇聚文本；一旦第一句完整出现，发出 `first_sentence_ready`，该句可以立即进入 `segmentVoiceResponsePlan` 并生成 `voice_output_chunk.v1`。
- 最新 `voice:pipeline:validate` 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782625065336.json`。
- 新增验证项：
  - `text_stream_first_sentence_event_count=1`
  - `text_stream_first_sentence=我正在检查当前状态。`
  - `text_stream_first_sentence_queueable=true`
- 已新增 `AIClient.callChatStream`，支持 OpenAI-compatible SSE delta。
- 已新增 `npm.cmd run voice:model-stream:validate`，报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\ai-client-stream-validation-1782625066906.json`。
- 模型流验证结果：
  - `stream_requested=true`
  - `delta_count=3`
  - `recombined_text=我正在检查当前状态。后续会继续补充。`
- 当前边界：这一步补齐 V3 的核心流式入口和可验证契约；当前 GUI 仍保留原一次性 `zhineng:status-dialogue:complete` 路径，后续接入流式 IPC 时应只对自然语言字段触发首句播报，不能直接朗读未解析完成的 JSON delta。

## 2026-06-28 Runtime TTS Latency Recheck

- 已重新执行 `npm.cmd run voice:runtime:validate`。
- 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-runtime-tts-chain-validation-1782625107226.json`。
- 音频样本：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-runtime-tts-chain-audio-1782625107224.wav`。
- 结果：health `128ms`，TTS `15335ms`，WAV header valid，buffered stream `42` frames，`browser_tts_used=false`。
- 结论：本轮再次证明主要延迟瓶颈在 TTS 合成阶段；播放队列、同音色约束和 buffered frame adapter 未出现回归。
## 2026-06-28 V3 IPC Stream Integration

- 已新增 Electron IPC：`zhineng:status-dialogue:complete:stream`。
- 已新增 renderer 事件监听：`zhineng:status-dialogue:complete:stream:event`。
- 原 `zhineng:status-dialogue:complete` 保持不变，作为流式失败或不可用时的回退路径。
- 主进程使用 `AIClient.callChatStream` 调用 OpenAI-compatible `stream=true`。
- renderer 只抽取 JSON 中 `voice` / `voiceText` 字段的自然语言，不朗读 raw JSON delta。
- `voice_response_text_stream.v1` 在 `first_sentence_ready` 时触发首句提前进入 `playVoicePlanThroughQueue`。
- 完整模型回复返回后，renderer 使用 `stripAlreadySpokenVoicePrefix` 去掉已提前播出的第一句，降低重复播放风险。
- 新增验证命令：`npm.cmd run voice:stream-ipc:validate`。
- 最新验证报告：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782625914772.json`
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\ai-client-stream-validation-1782625914517.json`
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782625911104.json`
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-runtime-tts-chain-validation-1782625921245.json`
- 关键验证项：
  - `text_stream_json_voice_field_only=true`
  - `text_stream_first_sentence_queueable=true`
  - `stream_requested=true`
  - `main_stream_handler=true`
  - `main_keeps_complete_handler=true`
  - `renderer_extracts_voice_field_only=true`
  - `renderer_first_sentence_to_queue=true`
  - `renderer_final_voice_deduplicates=true`
  - `browser_tts_used=false`
- 页面复验：本地 3D 粒子 OS 页面中主体状态对话框、语音控件和 3D 星云正常，前端 error 日志为 `0`。
- 当前边界：V3 已从“核心契约”推进到“Electron IPC + renderer 队列入口”。真实用户配置下的模型 streaming 延迟、真实扬声器播放和真实麦克风多轮链路仍需继续实机验证后才能判定整个目标完成。
## 2026-06-28 V3 Runtime Stream Loop Probe

- 已新增 `npm.cmd run voice:stream-loop:validate`。
- 探针文件：`D:\zhineng\sightflow-desktop-agent-main\scripts\validate-status-dialogue-voice-stream-loop.cjs`。
- 探针真实执行本地 Whisper STT 和本地 CosyVoice TTS；模型 streaming 默认使用本地模拟 OpenAI delta，设置 `STATUS_DIALOGUE_MODEL_API_KEY` 后可用 `--model-mode real` 切换真实 streaming API。
- 最新报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628074346.json`。
- 运行结果：
  - `stt_ms=7764`
  - `model_ms=5`
  - `first_tts_ms=4415`
  - `total_tts_ms=14905`
  - `first_playback_ms=1254`
  - `total_playback_ms=5910`
  - `end_to_end_ms=22735`
  - `slowest_stage=tts`
- 关键证明：
  - `first_sentence_ready_before_model_done=true`
  - `first_tts_started_before_model_done=true`
  - `same_voice_profile=true`
  - `browser_tts_used=false`
  - `streaming_frames_recombined=true`
  - `requirement_packet_created=false`
- 结论：V3 已具备运行时探针证据，证明模型文本流未完成时第一句可以先进入 TTS 合成链路；当前主要体验瓶颈仍是 TTS 合成耗时。

## 2026-06-28 App Settings Real Stream Probe

- 已增强 `scripts/validate-status-dialogue-voice-stream-loop.cjs`，用于更接近 GUI 的真实模型流式验证：
  - `--model-mode app-settings` 从 Electron `settings` store 读取模型配置。
  - `--model-config <json>` 支持显式配置文件。
  - 环境变量 `STATUS_DIALOGUE_MODEL_API_KEY` 仍最高优先级。
  - 报告只保存 `source`、`api_key_configured`、`model`、`base_url_host`、`provider_label`，不保存 API key。
- 新增命令：
  - `npm.cmd run voice:stream-loop:validate:app-settings`
- 默认运行时闭环复验：
  - 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628075458.json`。
  - `stt_ms=9006`
  - `model_ms=5`
  - `first_tts_ms=6916`
  - `total_tts_ms=19968`
  - `first_playback_ms=1393`
  - `total_playback_ms=5828`
  - `end_to_end_ms=29092`
  - `slowest_stage=tts`
- app-settings 真实模型入口复验：
  - 命令：`npm.cmd run voice:stream-loop:validate:app-settings`。
  - 结果：脚本已读取 `electron_store.settings`，但 `api_key_configured=false`，因此没有启动真实模型 API streaming。
  - 失败报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628075417.failed.json`。
- 同步回归：
  - `npm.cmd run voice:pipeline:validate` 通过。
  - `npm.cmd run voice:model-stream:validate` 通过。
  - `npm.cmd run voice:stream-ipc:validate` 通过。
  - `npm.cmd run voice:stream-loop:validate` 通过。
  - `npm.cmd run typecheck` 通过。
  - `npm.cmd run build` 通过。
- 页面复验：
  - `http://[::1]:5173/?window=zhineng-graph` 可访问。
  - 主体状态对话框、STT/TTS/voice 控件、3D canvas 均存在。
  - canvas `1278 x 618`，前端 error 日志为 `0`。
- 当前边界：
  - V0-V6 自动化证据已经成立。
  - 真实模型 streaming 还需要配置 API key 后复跑 app-settings 探针。
  - 真实扬声器听感和真实麦克风多轮对话仍需用户实机验收。
  - 当前最大延迟仍是 CosyVoice TTS 合成阶段；后续体验优化应优先做 TTS 预热、短句缓存命中率、原生流式 TTS adapter 或更快的高质量 TTS adapter。

## 2026-06-28 V2 Runtime TTS Cache Evidence

- 主进程 `zhineng:status-dialogue:tts:synthesize` 已接入磁盘缓存：
  - cache schema：`status_dialogue_tts_audio_cache.v1`
  - cache 目录：`runtime/voice-audio-cache`
  - cache key：复用 `buildVoiceChunkCacheKey`
  - cache key 范围：文本、voice profile、voice id、adapter、emotion hint
  - 开关：`SIGHTFLOW_STATUS_DIALOGUE_TTS_CACHE=0`
- `status_dialogue_tts_synthesis.v1` 结果新增可选字段：
  - `cache_hit`
  - `cache_key`
- renderer 队列已把主进程 `cache_hit=true` 计入 `cached_count`。
- 运行时验证脚本已加入同源缓存包装器和 `tts_cache_probe`。
- 第一轮验证：
  - 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628080446.json`
  - `tts_cache_second_hit=true`
  - `tts_cache_second_latency_ms=166`
  - `runtime_voice_cache_hits=0`
  - `total_tts_ms=15070`
  - `slowest_stage=tts`
- 第二轮复跑验证：
  - 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628080528.json`
  - `runtime_voice_cache_hits=2`
  - `cached_chunk_count=2`
  - `total_tts_ms=3`
  - `slowest_stage=stt`
- 同步回归：
  - `npm.cmd run voice:pipeline:validate` 通过。
  - `npm.cmd run voice:model-stream:validate` 通过。
  - `npm.cmd run voice:stream-ipc:validate` 通过。
  - `npm.cmd run voice:stream-loop:validate` 通过。
  - `npm.cmd run typecheck` 通过。
  - `npm.cmd run build` 通过。
- 结论：
  - V2 真实缓存已经覆盖主进程 TTS IPC、renderer 队列统计和运行时探针。
  - 已缓存短句的 TTS 等待可降到毫秒级。
  - 未缓存的新句仍依赖 CosyVoice 合成速度；这部分继续由 V5 原生 streaming TTS adapter 或更快 adapter 承接。

## 2026-06-28 V5 True HTTP Streaming Adapter

- 已新增 `createHttpStreamingTtsAdapter`：
  - 文件：`D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\voice-output-pipeline.ts`
  - schema：`streaming_tts_adapter.v1`
  - transport：`chunked_http`
  - 输入：`voice_output_chunk.v1`、`voice_profile.v1`、`voice_response_plan.v1`、`http_stream_request`
  - 输出：`streaming_tts_audio_frame.v1`
- 设计边界：
  - adapter 不绑定具体 TTS 工具。
  - 调用方通过 `buildRequest` 提供 URL、headers、body 和 mime。
  - adapter 只负责消费 HTTP response body chunk 并转换为音频帧。
  - 每个 response body chunk 立即变成一个音频 frame。
  - 流结束时追加一个空的 `final=true` marker，用于下游判断结束，不重复音频字节。
- 自动验证：
  - `scripts/validate-voice-output-pipeline.cjs` 新增本地 mock streaming audio server。
  - mock server 按三段写入音频字节，模拟真正 chunked HTTP。
  - 验证第一帧早于响应结束。
  - 验证音频帧逐段 base64 解码后可重组为原始字节。
- 最新报告：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782634268257.json`
- 关键结果：
  - `http_streaming_adapter_implemented=streaming_tts_adapter.validation.http_chunked`
  - `http_streaming_audio_frame_count=3`
  - `http_streaming_final_marker_count=1`
  - `http_streaming_first_frame_before_end=true`
  - `http_streaming_recombined_bytes=true`
- 回归命令：
  - `npm.cmd run voice:pipeline:validate` 通过。
  - `npm.cmd run voice:model-stream:validate` 通过。
  - `npm.cmd run voice:stream-ipc:validate` 通过。
  - `npm.cmd run voice:stream-loop:validate` 通过。
  - `npm.cmd run typecheck` 通过。
  - `npm.cmd run build` 通过。
- 当前结论：
  - V5 已从“buffered frame adapter”推进到“真实 HTTP chunked audio stream adapter”。
  - 当前 GUI 仍走高质量分块队列；逐帧播放层尚未切换到真流式 adapter。
  - 后续需要选择或包装一个能真实返回 chunked audio 的 TTS 服务，再把 GUI 播放层从 data URL 播放扩展到 frame stream 播放。

## 2026-06-28 V5 TTS Stream IPC Bridge

- 已新增 Electron IPC bridge：
  - request：`zhineng:status-dialogue:tts:synthesize:stream`
  - event：`zhineng:status-dialogue:tts:synthesize:stream:event`
  - event schema：`status_dialogue_tts_stream_event.v1`
- 主进程实现：
  - 文件：`D:\zhineng\sightflow-desktop-agent-main\src\main\index.ts`
  - 函数：`streamStatusDialogueTts`
  - 未缓存时使用 `createHttpStreamingTtsAdapter`
  - 命中缓存时发送缓存 frame 和 final marker
  - 成功流式返回后写入 `runtime/voice-audio-cache`
  - 返回 `frameCount`、`finalFrameCount`、`firstFrameMs`、`totalStreamMs`
- renderer 入口：
  - 文件：`D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\ZhinengConsole.tsx`
  - helper：`requestStatusDialogueTtsStream`
  - 当前仅提供事件消费和统计入口，不替换稳定播放路径
- 静态边界验证：
  - `npm.cmd run voice:stream-ipc:validate`
  - 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782634699758.json`
  - `main_tts_stream_handler=true`
  - `main_tts_stream_events=true`
  - `main_tts_stream_uses_http_adapter=true`
  - `main_tts_synthesize_fallback_kept=true`
  - `renderer_tts_stream_listener=true`
  - `renderer_tts_stream_invoker=true`
  - `renderer_tts_stream_helper_keeps_frame_count=true`
- 回归：
  - `npm.cmd run voice:pipeline:validate` 通过。
  - `npm.cmd run voice:model-stream:validate` 通过。
  - `npm.cmd run voice:stream-ipc:validate` 通过。
  - `npm.cmd run voice:stream-loop:validate` 通过。
  - `npm.cmd run typecheck` 通过。
  - `npm.cmd run build` 通过。
  - `http://[::1]:5173/?window=zhineng-graph` 返回 `200`。
- 当前边界：
  - V5 已具备 core adapter 和 Electron IPC frame bridge。
  - 当前真实播音仍走原 data URL 队列；下一步需要单独验证 `streaming_tts_audio_frame.v1` 到可听播放的桥接。

## 2026-06-28 V5 Frame Assembly Playback Bridge

- 已新增 `streaming_tts_frame_assembly.v1`：
  - 文件：`D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\voice-output-pipeline.ts`
  - 函数：`assembleStreamingTtsAudioFrames`
  - 输出：`audio_data_url`，可直接交给现有 HTMLAudioElement/data URL 播放路径
- 关键修正：
  - streaming frame 的 `audio_base64` 是逐 chunk 编码，不能直接字符串拼接。
  - 当前实现逐帧 base64 解码为字节，再拼接字节并重新编码为完整音频 base64。
  - 验证用非 3 字节对齐的大块 mock 音频，覆盖 base64 padding 边界。
- renderer 接入：
  - `requestStatusDialogueTtsStream` 已返回：
    - `audioDataUrl`
    - `audioMimeType`
    - `frameSequenceOk`
    - `assemblyErrors`
  - 当前不改变默认播放队列。
- 最新验证：
  - pipeline 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782635094059.json`
  - IPC 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782635107866.json`
- 关键结果：
  - `http_streaming_assembly_schema=streaming_tts_frame_assembly.v1`
  - `http_streaming_assembly_playable=true`
  - `http_streaming_assembly_ordered=true`
  - `http_streaming_assembly_errors=0`
  - `renderer_tts_stream_assembles_playable_audio=true`
- 回归：
  - `npm.cmd run voice:pipeline:validate` 通过。
  - `npm.cmd run voice:model-stream:validate` 通过。
  - `npm.cmd run voice:stream-ipc:validate` 通过。
  - `npm.cmd run voice:stream-loop:validate` 通过。
  - `npm.cmd run typecheck` 通过。
  - `npm.cmd run build` 通过。
  - `http://[::1]:5173/?window=zhineng-graph` 返回 `200`。
- 当前结论：
  - V5 已完成从 frame stream 到可播放 data URL 的桥接验证。
  - 下一步可以加一个显式实验开关，把 assembled `audioDataUrl` 接入 `playVoiceAudioChunk`，再决定是否替换默认队列。

## 2026-06-28 V5 Stream Assembled Playback Mode

- 已新增实验播放模式：
  - mode：`cosyvoice_stream_assembled`
  - UI label：`stream assembled`
  - 默认 mode 不变：`cosyvoice_short`
- 实现路径：
  - `synthesizeVoiceChunk`
  - `requestStatusDialogueTtsStream`
  - `zhineng:status-dialogue:tts:synthesize:stream`
  - `status_dialogue_tts_stream_event.v1`
  - `assembleStreamingTtsAudioFrames`
  - assembled `audioDataUrl`
  - `playVoiceAudioChunk`
- 验证：
  - `npm.cmd run voice:stream-ipc:validate`
  - 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782635365991.json`
  - `renderer_tts_stream_experimental_mode=true`
  - `renderer_tts_stream_assembled_enters_audio_result=true`
- 同步回归：
  - `npm.cmd run voice:pipeline:validate` 通过。
  - `npm.cmd run voice:model-stream:validate` 通过。
  - `npm.cmd run voice:stream-ipc:validate` 通过。
  - `npm.cmd run voice:stream-loop:validate` 通过。
  - `npm.cmd run typecheck` 通过。
  - `npm.cmd run build` 通过。
  - `http://[::1]:5173/?window=zhineng-graph` 返回 `200`。
- 当前边界：
  - 该模式验证的是 frame stream 进入现有可听播放路径。
  - 它仍然需要等 frame assembly 完成后播放，不是 WebAudio/MSE 逐帧边收边播。
  - 逐帧边收边播应作为下一轮独立验证，避免破坏当前稳定队列。
## 2026-06-28 Native CosyVoice Streaming Evidence

- 新增方案文档：`D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\subject-status-dialogue-module\voice-output-streaming-optimization-plan.v1.md`。
- 新增验证命令：`npm.cmd run voice:tts-stream-runtime:validate`。
- 验证脚本：`D:\zhineng\sightflow-desktop-agent-main\scripts\validate-cosyvoice-http-streaming.cjs`。
- 旧服务端验证结果：
  - 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628083616.json`
  - `native_streaming_supported=false`
  - `first_chunk_ms_from_request=10935`
  - `total_request_ms=10937`
  - 结论：旧 server 虽接收 `stream:true`，但没有提前吐出音频。
- 本轮实现：
  - `scripts/cosyvoice-openai-compatible-server.py` 新增 `StreamingResponse` 路径。
  - `stream:true` 调用底层 `cosyvoice.inference_sft(..., stream=True)`。
  - `wav` 流式输出 streaming WAV header + PCM16 chunk。
  - `pcm` 流式输出裸 PCM16，预留给后续 WebAudio 边收边播。
  - 非流式一次性 WAV 路径保持兼容。
- 新服务端验证结果：
  - 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628083929.json`
  - `native_streaming_supported=true`
  - `transfer_encoding=chunked`
  - `first_chunk_ms_from_request=16`
  - `total_request_ms=10700`
  - 当前 CosyVoice adapter 已具备真实 HTTP chunked 音频提前输出能力。
- Renderer 补齐：
  - 无 Electron IPC 的网页预览现在可通过 browser `fetch` body reader 消费 TTS HTTP chunk。
  - `stream assembled` 在网页预览和 GUI 中均有可验证入口。
  - 默认模式仍保持 `cosyvoice_short`，不影响稳定播放。
- 本轮验证：
  - `npm.cmd run typecheck` 通过。
  - `npm.cmd run voice:stream-ipc:validate` 通过。
  - `renderer_tts_stream_browser_preview_fallback=true`。
- 当前限制：
  - `stream assembled` 仍是收完整帧后组装播放，不是边收边播。
  - 真正降低首个可听声音延迟的下一步是 `stream live pcm`：PCM frame 进入 WebAudio 调度队列。

## 2026-06-28 Stream Live PCM Playback Mode

- 新增显式实验模式：
  - `voiceOutputMode='cosyvoice_stream_live_pcm'`
  - UI label：`stream live pcm`
  - 默认仍为 `cosyvoice_short`
- 主进程：
  - `zhineng:status-dialogue:tts:synthesize:stream` 支持 `response_format` / `responseFormat` 覆盖。
  - 支持 `skip_cache` / `skipCache`。
  - PCM 请求自动跳过 cache，防止与 WAV cache 混用。
- renderer：
  - 新增 `playVoiceLivePcmStreamChunk`。
  - 新增 `decodePcm16LeMonoBase64`。
  - 新增 `voiceLiveAudioContextRef`，新会话开始时关闭旧 live audio context。
  - live PCM frame 进入 WebAudio `AudioBufferSourceNode` 调度，使用 `playback_cursor_time` 串行排队。
- 3D 映射：
  - `status-dialogue-system` 新增 `voice.live_pcm_playback` 子粒子。
  - 输入：`streaming_tts_audio_frame.v1(audio/pcm)`、`voice_output_chunk.v1`、`AudioContext`。
  - 输出：`WebAudio scheduled buffers`、`voice_latency_trace.v1.first_frame_ms`、`voice_playback_queue.v1`。
- PCM 流式服务探针：
  - 命令：`node scripts\validate-cosyvoice-http-streaming.cjs --format pcm --text "我正在测试实时 PCM 语音输出。"`
  - 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628085327.json`
  - `native_streaming_supported=true`
  - `first_chunk_ms_from_request=7225`
  - `total_request_ms=10493`
  - 复跑报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\cosyvoice-http-streaming-validation-20260628085644.json`
  - 复跑 `first_chunk_ms_from_request=11671`
  - 复跑 `total_request_ms=14166`
- 静态验证：
  - `renderer_tts_stream_live_pcm_mode=true`
  - `renderer_tts_stream_live_pcm_webaudio=true`
  - `main_tts_stream_pcm_override=true`
- 当前边界：
  - 代码层已经有 live PCM 播放入口；真实 GUI 扬声器听感仍需用户实机验收。
  - 底层 CosyVoice 首个真实音频 chunk 仍慢，live PCM 不能单独解决模型首音频生成时间。

## 2026-06-28 V0 Accurate Runtime TTS Latency

- 修正运行时 TTS 探针：
  - 文件：`D:\zhineng\sightflow-desktop-agent-main\scripts\validate-voice-runtime-tts-chain.cjs`
  - 记录 `headers_ms`
  - 记录 `first_audio_chunk_ms`
  - 记录 `first_audio_payload_chunk_ms`
  - 记录 `total_audio_ms`
  - 记录 `response_chunk_arrival_ms`
- 修正原因：
  - CosyVoice server 支持 streaming 后，WAV 的第一个 chunk 可能只是 44-byte header。
  - 旧探针容易把 headers 或 WAV header chunk 误判为 TTS 完成/首音频。
- 最新报告：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-runtime-tts-chain-validation-1782637290762.json`
  - `headers_ms=11`
  - `first_audio_chunk_ms=11`
  - `first_audio_payload_chunk_ms=7503`
  - `total_audio_ms=9311`
- 回归报告：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-runtime-tts-chain-validation-1782637533224.json`
  - `headers_ms=10`
  - `first_audio_payload_chunk_ms=7263`
  - `total_audio_ms=9034`
- renderer 修正：
  - 浏览器预览的一次性 CosyVoice TTS `latency_ms` 改为等待完整 `arrayBuffer()` 后记录。

## 2026-06-28 V2 Short Phrase Cache Prewarm

- 新增命令：`npm.cmd run voice:cache:prewarm`
- 新增脚本：`D:\zhineng\sightflow-desktop-agent-main\scripts\prewarm-status-dialogue-tts-cache.cjs`
- 预热短句类型：
  - 完成提醒
  - 需求收到/检查中
  - 语音链路错误切文字
  - 巡检完成无阻塞
- 首轮报告：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-tts-cache-prewarm-20260628090356.json`
  - `generated_count=4`
  - `cache_hit_count=0`
- 复跑报告：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-tts-cache-prewarm-20260628090407.json`
  - `generated_count=0`
  - `cache_hit_count=4`
- 回归报告：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-tts-cache-prewarm-20260628090523.json`
  - `generated_count=0`
  - `cache_hit_count=4`
- 完整闭环缓存命中报告：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628090551.json`
  - `first_tts_ms=28`
  - `total_tts_ms=41`
  - `cached_chunk_count=2`
- 结论：
  - V2 不再只依赖首次生成后缓存；现在已有可执行的常用短句预生成入口。
  - 预热音频仍使用同一 `voice.cosyvoice.local.default` profile。

## 2026-06-28 V2 UI Ack Cache Alignment

- 新增核心常量：
  - `STATUS_DIALOGUE_VOICE_ACK_TEXT`
  - `buildStatusDialogueVoiceAckText`
- 目的：让 UI 即时确认语、预热脚本、运行时链路验证使用同一份 ack 文案源，避免“界面播放的句子没有被预热”的首响慢路径。
- 代码落点：
  - `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\voice-output-pipeline.ts`
  - `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\ZhinengConsole.tsx`
  - `D:\zhineng\sightflow-desktop-agent-main\scripts\prewarm-status-dialogue-tts-cache.cjs`
  - `D:\zhineng\sightflow-desktop-agent-main\scripts\validate-status-dialogue-voice-stream-loop.cjs`
  - `D:\zhineng\sightflow-desktop-agent-main\scripts\validate-voice-output-pipeline.cjs`
- 验证证据：
  - `npm.cmd run voice:pipeline:validate` 通过，报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782638141386.json`。
  - 预热首跑：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-tts-cache-prewarm-20260628091603.json`，`generated_count=2`，`cache_hit_count=4`。
  - 预热复跑：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-tts-cache-prewarm-20260628091613.json`，`generated_count=0`，`cache_hit_count=6`。
  - 完整链路：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628091624.json`，`ack_cache_all_hit=true`，`ack_cache_low_latency=true`，`ack_cache_hit_count=2`，`first_tts_ms=2`。
- 边界：
  - 不新增浏览器可听 TTS fallback。
  - 不创建 `requirement_packet.v1`。
  - 不写世界模型。
  - 不保存麦克风原始音频。

## 2026-06-28 V0-V6 Unified Audit Refresh

- 新增统一审计命令：
  - `npm.cmd run voice:v0-v6:audit`
  - `npm.cmd run voice:v0-v6:audit:strict`
- 审计脚本：
  - `D:\zhineng\sightflow-desktop-agent-main\scripts\audit-status-dialogue-voice-v0-v6.cjs`
- 最新审计报告：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-voice-v0-v6-audit-20260628132751.json`
  - `overall_status=incomplete`
  - `incomplete_required_ids=["V5_real_low_latency_tts_acceptance"]`
- 最新 strict 审计报告：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-voice-v0-v6-audit-20260628132825.json`
  - strict 模式当前按预期失败，因为真实低延迟 TTS 服务还没有完成验收。
- 最新真实配置探针：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\generic-streaming-tts-configured-unconfigured-20260628132827.json`
  - 缺少配置字段：`adapter_id`、`base_url`、`endpoint_path`、`model`、`voice`。
- 最新 configured mock 探针：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\generic-streaming-tts-validation-configured-mock-20260628132757.json`
  - `first_audio_payload_ms=76`
  - `same_voice_profile=true`
  - 该结果只能证明 adapter 与配置入口可用，不能替代真实服务验收。
- 最新回归：
  - `npm.cmd run voice:pipeline:validate` 通过，报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782653277343.json`。
  - `npm.cmd run typecheck` 通过。
- 完成规则：
  - V0、V1、V2、V3、V4、V6 已有当前自动化证据。
  - V5 仍未完整完成，必须在真实低延迟 TTS 服务下通过 `voice:generic-tts-stream:validate:configured`，并让 `voice:v0-v6:audit:strict` 通过后，才能标记 V0-V6 总目标完成。

## 2026-06-28 V5 Edge Read Aloud Real Streaming Acceptance

- Added command:
  - `npm.cmd run voice:edge-tts-stream:validate`
- Added validator:
  - `D:\zhineng\sightflow-desktop-agent-main\scripts\validate-edge-readaloud-streaming-tts.cjs`
- Added runtime candidate:
  - `edge_readaloud_websocket`
  - transport: `websocket`
  - role: `live_dialogue_primary`
  - default voice: `zh-CN-XiaoxiaoNeural`
- Latest real streaming report:
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\edge-readaloud-streaming-validation-20260628134821035.json`
  - `real_service=true`
  - `native_streaming_supported=true`
  - `same_voice_profile=true`
  - `first_audio_payload_ms=916`
  - `interactive_first_audio_ms=1500`
  - `audio_frame_count=22`
  - `audio_bytes=15408`
  - `browser_tts_used=false`
- Latest strict audit:
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-voice-v0-v6-audit-20260628135223.json`
  - `overall_status=complete`
  - `incomplete_required_ids=[]`
- Regression:
  - `npm.cmd run voice:pipeline:validate` passed.
  - `npm.cmd run voice:stream-ipc:validate` passed.
  - `npm.cmd run typecheck` passed.
  - `npm.cmd run build` passed.
- Boundary:
  - The Edge route is a real remote WebSocket streaming probe, not browser `speechSynthesis`.
  - It does not create `requirement_packet.v1`.
  - It does not write the world model.
  - It does not save raw microphone audio.
  - GUI default playback switching remains a later design decision.

## 2026-06-28 V0/V4 Per-Sentence Latency Trace

- `voice_latency_trace.v1` 新增 `segments`。
- `VoiceLatencySegment` 字段：
  - `chunk_id`
  - `source_output_id`
  - `kind`
  - `index`
  - `total`
  - `text_length`
  - `cache_hit`
  - `status`
  - `tts_ms`
  - `first_frame_ms`
  - `total_stream_ms`
  - `playback_ms`
  - `error`
- Renderer 队列现在在以下场景记录 segment：
  - 普通 CosyVoice chunk 播放成功。
  - live PCM chunk 播放成功。
  - TTS 合成失败。
  - 播放失败。
  - stale queue token 跳过。
- 验证证据：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782639700174.json`
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628094204.json`
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782639749649.json`
  - `latency_segments_cover_streamed_sentences=true`
  - 第 1 句：`tts_ms=4`，`playback_ms=2810`
  - 第 2 句：`tts_ms=4`，`playback_ms=3518`
  - `npm.cmd run typecheck` 通过。
  - `npm.cmd run build` 通过。
- 结论：
  - V0 测速已经覆盖 STT、模型、首句 TTS、总 TTS、首句播放、总播放，以及句级 segment。
  - V4 队列现在能对每个语音 chunk 留下成功、失败或跳过的可追溯证据。

## 2026-06-28 V2/V3 Formal Opening Cache

- 新增正式巡检开场句：
  - `STATUS_DIALOGUE_VOICE_OPENING_TEXT`
  - `buildStatusDialogueVoiceOpeningText`
- 状态映射：
  - `ok`：状态巡检完成。
  - `warn`：存在缺口，需要确认。
  - `blocked`：阻塞，需要停在只读巡检。
  - `unknown`：正在巡检。
- `buildStatusDialogueUserPrompt` 现在输出 `voice_opening_policy.selected_first_sentence`。
- `STATUS_DIALOGUE_SYSTEM_PROMPT` 要求模型 `voice` 字段首句保留该状态含义，但允许自然变体，避免每轮固定开头。
- 本地 fallback 的 `voiceText` 同步使用同一开场句。
- 预热脚本加入 4 条正式开场句。
- 运行验证脚本加入：
  - `formal_opening_first_sentence`
  - `formal_opening_cache_hit`
  - `formal_opening_low_latency`
- 证据：
  - `voice:pipeline:validate`：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782638797154.json`
  - 预热首跑：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-tts-cache-prewarm-20260628092718.json`，`generated_count=4`，`cache_hit_count=6`
  - 预热复跑：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-tts-cache-prewarm-20260628092730.json`，`generated_count=0`，`cache_hit_count=10`
  - 闭环首跑：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628092740.json`，`formal_opening_cache_hit=true`，`first_tts_ms=2`，`total_tts_ms=10217`
  - 闭环复跑：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628092814.json`，`runtime_voice_cache_hits=2`，`first_tts_ms=3`，`total_tts_ms=5`
  - `voice:stream-ipc:validate`：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782638916130.json`
  - `npm.cmd run typecheck` 通过。
  - `npm.cmd run build` 通过。
- 结论：
  - V2 已从“常用短句预热”扩展到“正式巡检第一句预热”。
  - V3 首句伪流式现在有稳定缓存候选，可在模型完整回复前进入 TTS 队列。
  - 新出现的剩余句仍会首次生成，但同内容复跑已经证明可缓存到毫秒级 TTS。

## 2026-06-28 V3 Multi-Sentence Pseudo-Streaming

- 核心变化：
  - `voice_response_text_stream_event.v1` 新增 `sentence_ready`。
  - `VoiceResponseTextStreamState` 新增 `emitted_sentence_count` 与 `emitted_text_length`。
  - 每个 `sentence_ready` 事件携带 `sentence_index` 与 `spoken_prefix`。
  - `first_sentence_ready` 仍保留，用于兼容既有首句测速指标。
- Renderer：
  - `onStreamingFirstVoiceSentence` 升级为 `onStreamingVoiceSentence`。
  - 每个完整句子都进入 `playVoicePlanThroughQueue`。
  - 最终输出根据 `spoken_prefix` 去重，避免重复播放已经提前入队的句子。
- 验证：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\voice-output-pipeline-validation-1782639351989.json`
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260628093634.json`
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-ipc-validation-1782639440440.json`
  - `streamed_sentence_count_at_least_two=true`
  - `streamed_sentences_tts_ok=true`
  - `streamed_sentences_no_final_duplicate=true`
  - `renderer_stream_sentences_to_queue=true`
  - `first_tts_ms=4`
  - `total_tts_ms=8`
  - `cached_chunk_count=2`
  - `npm.cmd run typecheck` 通过。
  - `npm.cmd run build` 通过。
- 边界：
  - 不新增浏览器可听 TTS fallback。
  - 不创建 `requirement_packet.v1`。
  - 不写世界模型。
  - 不保存麦克风原始音频。
