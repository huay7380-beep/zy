# Voice Latency And Repeated Input Review 2026-06-30

## Scope

- Current active goal remains incomplete.
- Reviewed why voice still feels slow and why repeated speech input looked like only one input worked.
- Scope is limited to the status-dialogue-system / right-bottom GUI voice chain.

## Commands

- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.
- `npm.cmd run voice:runtime-flow:restart-for-retest` restarted the real Electron GUI.
- `npm.cmd run voice:runtime-flow:check-marker` passed against `voice-flow-20260630.jsonl`.
- `npm.cmd run voice:runtime-flow:audit` passed with `status=warn`.
- `npm.cmd run voice:goal:audit` passed with `result=incomplete`.
- `npm.cmd run voice:tts-stream-runtime:validate` passed but reported `interactive_ready=false`.

## Real GUI Evidence

- `status_dialogue_ui_runtime_loaded` at `2026-06-30T00:02:28.937Z`.
- `default_stt_adapter=local`.
- `local_stt_health_check status=ready latency_ms=44 device=cuda`.
- One real local STT run completed:
  - `local_stt_voice_detected`
  - `local_stt_complete success=true latency_ms=1273 transcript_length=8`
  - `local_stt_transcribe_result success=true`

## Fix Applied

- Added `tts_final_voice_skipped_after_stream`.
- Added `shouldSpeakPostStreamFinalVoice` to skip duplicate final playback when streaming voice sentences already covered final text.
- Added `tts_chunk_playback_timeout` watchdog with `VOICE_PLAYBACK_CHUNK_TIMEOUT_MS=30000` so playback cannot leave the queue stuck forever.

## Improved Result

- Duplicate final TTS was skipped in the real GUI log:
  - `tts_final_voice_skipped_after_stream`.
- Queue completed after each spoken stream sentence:
  - `tts_queue_complete` observed for ack and stream sentences.
- The old symptom "synthesis complete but no queue complete" did not recur in the new checked run.

## Remaining Bottleneck

- CosyVoice local HTTP synthesis is still too slow for live dialogue.
- New real GUI samples:
  - stream sentence 2 `tts_synthesis_complete latency_ms=14366`.
  - stream sentence 3 `tts_synthesis_complete latency_ms=8775`.
- Streaming validation:
  - `native_streaming_supported=true`
  - `first_audio_payload_chunk_ms_from_request=9369`
  - `total_request_ms=17302`
  - `dialogue_realtime_grade=slow`
  - `interactive_ready=false`

## Conclusion

- STT local path is now real-GUI proven for one successful microphone input.
- Repeated-input failure was partly caused by duplicated/unfinished TTS queue behavior; the duplicate final path and stuck playback risk are now patched.
- Latency remains dominated by CosyVoice local high-quality synthesis, not by local Whisper STT.
- Remaining goal gaps remain cloud STT current-window stability and real W3 wake detector handoff evidence.

## Follow-up Check 2026-06-30 00:21

### Current Goal

Active goal is still:

`进入 STT 专项：云端 STT 稳定性、输入队列、连续监听、TTS 播放期间接收输入、以及本地 Whisper 常驻服务。另外补全对话状态，当前只会说当前状态有缺口，需要先确认。检查小智的对话逻辑是否被应用。`

### Verified Commands

- `npm.cmd run voice:goal:audit` passed, result remains `incomplete`.
  - proved: 6
  - partial: 2
  - missing: 0
  - total: 8
- `npm.cmd run voice:runtime-flow:audit` passed with `status=warn`.
- `npm.cmd run voice:tts-stream-runtime:validate` passed, but still reported `interactive_ready=false`.
- `npm.cmd run voice:stt-input-queue:validate` passed.
- `npm.cmd run voice:tts-input-boundary:validate` passed.
- `npm.cmd run voice:runtime-flow:probe-tts-input-interrupt` passed as a controlled test-cli probe, but test-cli still has missing IPC handlers, so it is not real GUI proof.

### Current Latency Evidence

- Latest CosyVoice streaming validation:
  - `first_chunk_ms_from_request=15`
  - `first_audio_payload_chunk_ms_from_request=10372`
  - `total_request_ms=15369`
  - `dialogue_realtime_grade=slow`
  - `interactive_ready=false`
- Runtime audit still reports:
  - `tts_synthesis_max_ms=15979`
  - `tts_synthesis_avg_ms=13353`
  - known bottleneck: `cosyvoice_local_http_slow_synthesis`

### Repeated Input Evidence

- Real local STT evidence exists for two successful transcriptions:
  - `local_stt_complete` count: 2
  - `local_stt_voice_detected` count: 2
- Input queue structure exists and static validators pass.
- Runtime audit shows:
  - `input_queued_count=2`
  - `input_dequeued_count=0`
- Therefore the current repeated-input result is not fully proved:
  - STT can detect and transcribe more than once.
  - Input during TTS can be queued.
  - Real GUI dequeue and continuous multi-turn processing after queueing still lack runtime proof.

### Current Judgment

- The previous optimization reduced duplicate final TTS playback and added a playback timeout guard.
- It did not solve the main latency source.
- It did not fully prove repeated speech input under overlapping TTS/dialogue conditions.
- Next implementation should prioritize:
  - real GUI dequeue proof for queued STT/text input,
  - a faster interactive TTS path or true low-latency streaming path,
  - real operator cloud STT microphone sample,
  - real W3 wake handoff evidence.

## Queue Drain Fix 2026-06-30 00:25

### Problem Confirmed

- Queue input could be added while dialogue/TTS was busy.
- If `voicePlaybackQueueState.status` changed to `complete` while `dialogueBusyRef.current` was still true, the drain effect returned early.
- After busy became false, the effect did not rerun because it did not depend on `dialogueBusy`.
- This matched runtime evidence:
  - before fix: `input_queued_count=2`
  - before fix: `input_dequeued_count=0`

### Fix Applied

- `ZhinengConsole.tsx`
  - The queue-drain effect now checks both `dialogueBusy` and `dialogueBusyRef.current`.
  - The effect dependency list now includes `dialogueBusy`, so queued input drains after busy clears.
- `scripts/test-cli.ts`
  - The controlled TTS input interrupt probe now waits for `dialogue_input_dequeued_after_tts_complete`, not only enqueue events.
- `scripts/audit-status-dialogue-runtime-voice-flow.cjs`
  - Runtime audit now counts both `dialogue_input_dequeued` and `dialogue_input_dequeued_after_tts_complete`.
- Static validators now require the busy-clear drain behavior.

### Verification

- `npm.cmd run voice:stt-input-queue:validate` passed.
- `npm.cmd run voice:tts-input-boundary:validate` passed.
- `npm.cmd run voice:runtime-flow:probe-tts-input-interrupt` passed.
- `npm.cmd run voice:runtime-flow:audit` passed with `status=warn`.
- `npm.cmd run voice:goal:audit` passed with `result=incomplete`.
- `npm.cmd run typecheck` passed.

### Runtime Evidence After Fix

- `dialogue_input_queued`
- `status_dialogue_tts_input_interrupt_probe_submitted`
- `dialogue_input_dequeued age_ms=99`
- `dialogue_input_dequeued_after_tts_complete age_ms=99`
- `status_dialogue_tts_input_interrupt_probe_complete`

Runtime audit after the fix:

- `input_queued_count=3`
- `input_dequeued_count=2`
- `input_queue_wait_max_ms=99`
- `input_queue_wait_avg_ms=99`

### Remaining Boundary

- This proves the controlled TTS-input interrupt dequeue path.
- It does not yet prove a real operator multi-round microphone session under natural speech timing.
- TTS latency remains unresolved:
  - `tts_synthesis_avg_ms=13353`
  - `tts_synthesis_max_ms=15979`
  - known bottleneck remains `cosyvoice_local_http_slow_synthesis`.

## Low Latency TTS Candidate 2026-06-30 00:36

### Problem

- Current CosyVoice local HTTP path remains too slow for live dialogue.
- Latest measured CosyVoice evidence:
  - `first_audio_payload_chunk_ms_from_request=10372`
  - `total_request_ms=15369`
  - `interactive_ready=false`

### Candidate Verified

- `npm.cmd run voice:edge-tts-stream:validate` passed against the real Edge Read Aloud WebSocket service.
- Latest evidence:
  - `adapter_id=edge_readaloud_websocket`
  - `native_streaming_supported=true`
  - `first_audio_payload_ms=1014`
  - `total_stream_ms=1135`
  - `selected_candidate_interactive_ready=true`
  - `audio_mime_type=audio/mpeg`
  - `voice=zh-CN-XiaoxiaoNeural`

### Implementation Added

- Added explicit UI mode `edge_readaloud_stream`.
- Added main-process `edge_readaloud_websocket` stream branch under existing `zhineng:status-dialogue:tts:synthesize:stream`.
- The new mode uses the existing voice playback queue, streaming frame assembly, same runtime policy surface, and latency trace.
- Default mode remains `cosyvoice_short`; CosyVoice clone/high-quality path is not removed.
- Edge mode skips CosyVoice cache when adapter differs from the selected voice profile, preventing mixed audio source reuse.

### Verification

- `npm.cmd run voice:stream-ipc:validate` passed.
- `npm.cmd run voice:edge-tts-stream:validate` passed.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.
- `npm.cmd run voice:runtime-flow:audit` passed with `status=warn`.
- `npm.cmd run voice:goal:audit` passed with `result=incomplete`.

### Boundary

- Edge mode is a low-latency candidate for live dialogue and does not provide the CosyVoice clone path.
- This is not yet a real GUI playback proof; it proves service latency plus code/IPC integration.
- The next verification step is a real GUI test with voice mode set to `edge_readaloud_stream`, confirming:
  - `tts_edge_readaloud_stream_ready`
  - `tts_queue_complete`
  - audible playback
  - no regression in STT input queue or W3 pause boundaries.

## Follow-up Check 2026-06-30 01:03

### Current Goal Status

- Active goal remains incomplete.
- Current focus is still STT专项 + voice loop optimization:
  - cloud STT stability.
  - input queue and repeated input.
  - continuous listening / W3 wake handoff.
  - TTS during input boundary.
  - local Whisper persistent service.
  - dialogue status policy and Xiaozhi-style state logic.

### Why Voice Still Felt Stuck

- The default live voice mode still used `cosyvoice_local_http` for high-quality/cloned voice.
- Runtime audit still contains slow historical CosyVoice samples:
  - `tts_synthesis_avg_ms=13353`.
  - `tts_synthesis_max_ms=15979`.
  - known bottleneck: `cosyvoice_local_http_slow_synthesis`.
- Therefore the main perceived latency was not STT; it was high-quality local TTS synthesis.

### Repeated Input Result

- Queue drain fix remains verified.
- Latest runtime audit:
  - `input_queued_count=3`.
  - `input_dequeued_count=2`.
  - `input_queue_wait_max_ms=99`.
  - `formal_interrupt_count=3`.
- Static validators passed:
  - `npm.cmd run voice:stt-input-queue:validate`.
  - `npm.cmd run voice:tts-input-boundary:validate`.
- Boundary:
  - This proves controlled queue/dequeue and TTS interruption behavior.
  - It still does not prove a real operator natural multi-round microphone session.

### Low Latency TTS Fix

- Root cause 1:
  - GUI main process parsed Edge Read Aloud binary frames as text-separated frames.
  - Result: service was reachable, but GUI branch got no audio frames and timed out.
- Root cause 2:
  - After binary parsing was fixed, renderer assembled too early before stream frame events arrived.
  - Result: main completed in about 1 second, but renderer reported `stream frame assembly failed`.
- Fixes applied:
  - `src/main/index.ts`
    - Edge Read Aloud binary frame parsing now uses the leading 2-byte header length.
    - Edge branch emits a single playable renderer audio frame and records `native_frame_count` separately.
  - `src/renderer/src/zhineng-console/ZhinengConsole.tsx`
    - TTS stream invoke now waits briefly for declared frame events before assembly.
  - `scripts/wait-status-dialogue-edge-tts-playback.cjs`
    - Session matching accepts probe id prefixes, so chunk ids like `probe:final:1` are counted.

### Latest Edge GUI Proof

- `npm.cmd run voice:runtime-flow:probe-edge-tts` passed.
- Latest real GUI evidence:
  - `tts_stream_start adapter_id=edge_readaloud_websocket`.
  - `tts_stream_complete first_frame_ms=986 total_stream_ms=1109 frame_count=1 native_frame_count=27`.
  - `tts_edge_readaloud_stream_ready first_frame_ms=986 total_stream_ms=1109`.
  - `tts_queue_complete total_tts_ms=1109 total_playback_ms=3346 failed_count=0`.
  - `status_dialogue_edge_tts_playback_probe_complete success=true latency_ms=4509`.
- This proves the right-bottom GUI can now play the low-latency Edge TTS path.

### Commands Verified

- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.
- `npm.cmd run voice:stream-ipc:validate` passed.
- `npm.cmd run voice:edge-tts-stream:validate` passed earlier with service first audio around 1 second.
- `npm.cmd run voice:runtime-flow:probe-edge-tts` passed after fixes.
- `npm.cmd run voice:runtime-flow:audit` passed with `status=warn`.
- `npm.cmd run voice:goal:audit` passed with `result=incomplete`.

### Remaining Gaps

- Default mode is still not switched globally from CosyVoice clone/high-quality path to Edge low-latency path.
- Edge low-latency mode does not provide voice cloning.
- Cloud STT current-window stability still lacks fresh proof after latest GUI marker.
- Historical cloud STT failure samples remain.
- W3 wake detector real handoff evidence is still missing.
- Real operator natural multi-round microphone session still needs manual confirmation.

## Follow-up Check 2026-06-30 01:31

### Current Target

- Active target remains STT专项:
  - cloud STT stability.
  - input queue and repeated input.
  - continuous listening / W3 wake handoff.
  - TTS playback-period input boundary.
  - local Whisper persistent service.
  - dialogue state completeness and Xiaozhi-style state logic.

### Verified Cause Of Lag

- Historical normal dialogue still contained CosyVoice local HTTP synthesis samples:
  - `tts_synthesis_avg_ms=13353`.
  - `tts_synthesis_max_ms=15979`.
- This explains the previous audible lag when the UI default stayed on `cosyvoice_short`.
- The low-latency path itself is healthy:
  - `npm.cmd run voice:edge-tts-stream:validate` passed.
  - latest Edge Read Aloud service evidence:
    - `first_audio_payload_ms=995`.
    - `total_stream_ms=1104`.
    - `voice=zh-CN-XiaoxiaoNeural`.

### Implemented Adjustment

- Changed normal GUI default voice output mode from `cosyvoice_short` to `edge_readaloud_stream`.
- Added runtime marker fields:
  - `default_voice_output_mode`.
  - `edge_tts_low_latency_default`.
- Updated runtime audit wording so historical CosyVoice slow samples are not mistaken for the current default route.

### Current Normal GUI State

- Restarted normal GUI with no runtime probe.
- Latest normal marker:
  - `default_stt_adapter=local`.
  - `default_voice_output_mode=edge_readaloud_stream`.
  - `edge_tts_low_latency_default=true`.
  - local STT health check `latency_ms=54`.
- After an additional Edge GUI playback probe, normal GUI was restarted again.
- Latest final normal marker:
  - `default_stt_adapter=local`.
  - `default_voice_output_mode=edge_readaloud_stream`.
  - `edge_tts_low_latency_default=true`.
  - local STT health check `latency_ms=45`.

### Edge GUI Playback Proof

- `npm.cmd run voice:runtime-flow:probe-edge-tts` passed after the default-mode change.
- Latest GUI playback report:
  - `edge_stream_started=true`.
  - `edge_stream_ready=true`.
  - `queue_completed=true`.
  - `probe_completed_success=true`.
  - `first_frame_ms=1012`.
  - `total_stream_ms=1142`.
  - `total_tts_ms=1142`.
  - `total_playback_ms=3329`.
  - `failed_count=0`.

### Repeated Input Result

- Static input queue validation passed:
  - `npm.cmd run voice:stt-input-queue:validate`.
  - `npm.cmd run voice:tts-input-boundary:validate`.
- Runtime audit still shows only controlled queue proof, not a fresh natural multi-round operator session:
  - `input_queued_count=3`.
  - `input_dequeued_count=2`.
  - `input_queue_wait_max_ms=99`.
- Boundary:
  - Code path supports queue/dequeue and TTS interruption.
  - Real multi-round microphone behavior still needs a fresh operator test after the Edge default switch.

### Cloud STT Result

- Re-ran controlled cloud STT with a clear Chinese SAPI audio file:
  - audio file: `runtime/verification-audio/cloud-stt-clear-zh-huihui-20260630.wav`.
  - local Whisper recognized the same file, proving the test audio is valid.
- Cloud STT probe result:
  - `start_count=2`.
  - `complete_count=2`.
  - `success_count=0`.
  - `failure_count=2`.
  - `attempt_start_count=2`.
  - `attempt_complete_count=2`.
  - final result: `cloud_stt_failed`.
  - latest error: `no-speech`.
- Current conclusion:
  - cloud Chrome/WebSpeech is not stable enough for the primary live input path.
  - current practical input default should stay on local Whisper persistent service.

### Verification Commands

- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.
- `npm.cmd run voice:cloud-stt-stability:validate` passed.
- `npm.cmd run voice:stt-input-queue:validate` passed.
- `npm.cmd run voice:tts-input-boundary:validate` passed.
- `npm.cmd run voice:edge-tts-stream:validate` passed.
- `npm.cmd run voice:runtime-flow:probe-cloud-stt` failed by design evidence: cloud STT returned no transcript after two attempts.
- `npm.cmd run voice:runtime-flow:restart-for-retest` passed and restored normal GUI.
- `npm.cmd run voice:runtime-flow:audit` passed with `status=warn`.
- `npm.cmd run voice:goal:audit` passed with `result=incomplete`.

### Remaining Gaps

- Need fresh real operator multi-round microphone test after the default Edge TTS switch.
- W3 wake detector still has no real `w3_wake_detected` + `w3_wake_handoff_stt` runtime evidence.
- Cloud STT remains degraded; keep it as optional retry path, not primary input.
- Voice cloning remains deferred; current priority is low-latency, stable dialogue loop.

## Follow-up Check 2026-06-30 01:51

### W3 Wake Detector Progress

- Added `w3_wake_handoff` runtime probe mode.
- Added W3 runtime wait command:
  - `npm.cmd run voice:runtime-flow:probe-w3-wake`.
  - `npm.cmd run voice:runtime-flow:wait-w3-wake`.
- Added runtime wait report schema:
  - `status_dialogue_w3_wake_handoff_wait.v1`.
- Updated W3 static validator to check:
  - real Chinese wake phrases: `小张 / 高手 / 小天才`.
  - continuous Browser SpeechRecognition detector.
  - TTS playback pauses wake detector only.
  - formal STT remains separate from wake detection.
  - wake window opens before handoff.
  - production path still calls existing `startSpeechRecognition`.
  - controlled probe does not record microphone audio.
  - no raw audio persistence.

### W3 Runtime Probe Result

- `npm.cmd run voice:runtime-flow:probe-w3-wake` passed.
- Latest report:
  - `probe_started=true`.
  - `wake_detected=true`.
  - `handoff_logged=true`.
  - `xiaozhi_listen_detect_seen=true`.
  - `probe_completed_success=true`.
- Runtime evidence:
  - `w3_wake_detected` with phrase `小张`.
  - `stage=wake_window`.
  - `selected_stt_adapter=local`.
  - `w3_wake_handoff_stt`.
  - `boundary=controlled_probe_does_not_start_microphone`.
- Boundary:
  - This proves the W3 state-machine path and event wiring.
  - This does not prove real microphone continuous listening in operator use.

### Xiaozhi Dialogue Logic Check

- `npm.cmd run voice:dialogue-state-policy:validate` passed.
- Runtime audit still observes Xiaozhi-style event types:
  - `hello`.
  - `listen_start`.
  - `listen_detect`.
  - `stt_result`.
  - `llm_start`.
  - `tts_start`.
  - `tts_sentence_start`.
  - `tts_stop`.
  - `error`.
  - `abort`.
- Current conclusion:
  - Xiaozhi-style state logic is applied as a status/voice state bridge.
  - It is not used as patrol evidence and does not replace module status cards.

### Current Normal GUI State After Probe

- Restarted normal GUI after W3 probe.
- Latest normal marker:
  - `default_stt_adapter=local`.
  - `default_voice_output_mode=edge_readaloud_stream`.
  - `edge_tts_low_latency_default=true`.
  - local STT health check `latency_ms=30`.

### Verification Commands

- `npm.cmd run voice:w3-wake-detector:validate` passed.
- `npm.cmd run voice:dialogue-state-policy:validate` passed.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.
- `npm.cmd run voice:runtime-flow:probe-w3-wake` passed.
- `npm.cmd run voice:runtime-flow:restart-for-retest` passed.
- `npm.cmd run voice:goal:audit` passed with `result=incomplete`.

### Remaining Gaps After W3 Probe

- Real operator continuous-listening test still needed:
  - enable W3 detector in the GUI.
  - speak one of `小张 / 高手 / 小天才`.
  - confirm real `w3_wake_detected` and real `w3_wake_handoff_stt` without `runtime_probe`.
- Cloud STT remains degraded:
  - controlled cloud probe still fails with no transcript.
  - keep local Whisper as primary STT.
- Fresh natural multi-round voice session still needs manual verification after Edge TTS default switch.

## Follow-up Check 2026-06-30 02:00

### Current Goal

Active goal remains STT specialist work:

- cloud STT stability.
- input queue and repeated-input reliability.
- continuous listening and W3 handoff.
- accepting formal STT/manual input while TTS is playing.
- local Whisper persistent service.
- dialogue state completion and Xiaozhi-style state bridge check.

Goal audit result is still `incomplete`:

- `proved=6`.
- `partial=2`.
- `missing=0`.
- remaining proof gaps:
  - cloud STT is guarded by degraded-to-local fallback, but cloud recognition itself is not stable.
  - controlled W3 probe passed, but real operator continuous listening is not proved.

### Why Voice Still Feels Laggy

The current lag evidence splits into three separate causes:

1. Cloud STT path is slow and unstable.
   - Latest controlled cloud probe made two attempts.
   - attempt 1 failed with `no-speech`, `latency_ms=11117`.
   - attempt 2 failed with `no-speech`, `latency_ms=10381`.
   - total probe time was `22536ms`.
   - This path now opens a degraded circuit and falls back to local Whisper.

2. Historical real voice turns used the old CosyVoice HTTP synthesis path.
   - Real local STT succeeded, but TTS synthesis then dominated latency.
   - Sample at `00:02`: later TTS chunks reached `14370ms` and `8777ms`.
   - Sample at `00:09`: later TTS chunks reached `15982ms` and `14295ms`.
   - Maximum observed queue end-to-end time remained `45204ms`.

3. Current optimized TTS default is faster, but needs fresh operator proof.
   - Current normal GUI default is `edge_readaloud_stream`.
   - Controlled Edge TTS probe passed:
     - first frame around `1012ms`.
     - total stream around `1142ms`.
     - queue end-to-end around `4499ms`, including playback time.
   - This proves the low-latency TTS path is wired.
   - It does not yet prove a fresh multi-round natural operator session after the default switch.

### Repeated Voice Input Check

Current evidence:

- Static queue validator passed:
  - `npm.cmd run voice:stt-input-queue:validate`.
- Runtime audit shows queue and interruption events exist:
  - `dialogue_input_queued=3`.
  - `dialogue_input_dequeued=1`.
  - `dialogue_input_dequeued_after_tts_complete=1`.
  - `formal_input_interrupt_seen=true`.
  - `stale_tts_skip_or_interrupt_seen=true`.
- Real local STT was not lost in the two historical local tests:
  - `stt_start_requested=2`.
  - `local_stt_complete=2`.
  - both returned `success=true`.

Current interpretation:

- When local Whisper is selected, two historical microphone inputs did transcribe and enter the dialogue path.
- When cloud STT is selected or triggered by probe, repeated input often fails because cloud STT produces no transcript, not because the dialogue chain receives and drops text.
- During old CosyVoice long playback, the queue can make later inputs feel delayed or ignored until playback/busy state releases.

### Current Normal GUI State

After cloud probe, normal GUI was restarted for retest.

Latest non-probe marker:

- timestamp: `2026-06-30T02:00:51.570Z`.
- `default_stt_adapter=local`.
- `stt_model=base`.
- `default_voice_output_mode=edge_readaloud_stream`.
- `electron_ipc_available=true`.
- `local_whisper_observability=true`.
- `edge_tts_low_latency_default=true`.

Latest local STT health:

- `status=ready`.
- `reachable=true`.
- `device=cuda`.
- `latency_ms=27`.

### Optimization Result

Completed and verified:

- Local Whisper persistent service is the normal default STT path.
- Edge ReadAloud stream is the normal default low-latency TTS path.
- Cloud STT failure is classified and now degrades to local Whisper after retry.
- Input queue and TTS-interruption code paths exist and pass static validation.
- Xiaozhi-style bridge events are present in runtime logs.
- W3 handoff has controlled probe proof.

Still not solved:

- Cloud WebSpeech/Chrome STT is not stable enough for primary input.
- Fresh real multi-round operator proof after Edge default switch is missing.
- W3 real continuous listening is not yet proved.
- Old CosyVoice slow samples remain in the audit history, so audit status remains `warn`.

### Verification Commands

- `npm.cmd run voice:runtime-flow:audit` passed with `status=warn`.
- `npm.cmd run voice:goal:audit` passed with `result=incomplete`.
- `npm.cmd run voice:cloud-stt-stability:validate` passed.
- `npm.cmd run voice:stt-input-queue:validate` passed.
- `npm.cmd run voice:runtime-flow:restart-for-retest` passed.
- `npm.cmd run voice:runtime-flow:check-marker` passed.

### Next Practical Fix Direction

The next implementation should not keep trying to make cloud WebSpeech primary.

Recommended next step:

1. Keep local Whisper as primary STT.
2. Add a real repeated-input runtime probe for local STT + dialogue submission + Edge TTS playback.
3. Add queue drain guard for interrupted/failed/long TTS states, so queued input is released deterministically even if playback state does not emit a clean complete event.
4. Keep cloud STT as optional manual retry only, with visible degraded state.
5. Treat CosyVoice clone/high-quality path as non-real-time or cached path until a true low-latency clone-capable adapter is configured.

## Follow-up Implementation 2026-06-30 02:12

### Change Implemented

Added deterministic input queue release protection for TTS boundary cases.

Code scope:

- `src/renderer/src/zhineng-console/ZhinengConsole.tsx`.
- `scripts/validate-status-dialogue-stt-input-queue.cjs`.
- `scripts/validate-status-dialogue-tts-input-boundary.cjs`.

Runtime behavior added:

- Existing queue still releases immediately when TTS reaches `complete`.
- Queue now also releases on terminal voice states:
  - `idle`.
  - `complete`.
  - `error`.
- Added `STATUS_DIALOGUE_INPUT_QUEUE_DRAIN_WATCHDOG_MS=8000`.
- If queued input is still blocked by a stale/non-terminal voice state after 8 seconds, the watchdog:
  - logs `dialogue_input_queue_drain_watchdog`.
  - marks the stale voice queue state as `complete`.
  - resets playback latency stage to `idle`.
  - dequeues the next input through the same `submitDialogue` chain.
- Added release event:
  - normal complete path: `dialogue_input_dequeued_after_tts_complete`.
  - non-complete/guard path: `dialogue_input_dequeued_after_queue_release`.

Boundary:

- No world model write.
- No `requirement_packet.v1`.
- No new same-level dialogue system.
- The change extends the existing `status_dialogue_input_queue.v1` path only.

### Verification Result

Commands passed:

- `npm.cmd run voice:stt-input-queue:validate`.
- `npm.cmd run voice:tts-input-boundary:validate`.
- `npm.cmd run typecheck`.
- `npm.cmd run build`.
- `npm.cmd run voice:runtime-flow:probe-tts-input-interrupt`.
- `npm.cmd run voice:runtime-flow:restart-for-retest`.
- `npm.cmd run voice:runtime-flow:check-marker`.
- `npm.cmd run voice:runtime-flow:audit`.
- `npm.cmd run voice:goal:audit`.

Runtime evidence after the change:

- Latest TTS input interrupt probe:
  - `voice_playback_interrupted_for_formal_input`.
  - `tts_queue_interrupted`.
  - `dialogue_input_queued`.
  - `dialogue_input_dequeued`.
  - `dialogue_input_dequeued_after_tts_complete`.
  - release age: `96ms`.
  - `trigger=tts_complete`.
- Runtime audit now reports:
  - `input_queued_count=4`.
  - `input_dequeued_count=4`.
  - `input_queue_wait_max_ms=99`.
  - `formal_interrupt_count=4`.
  - `stale_tts_skip_or_interrupt_count=4`.

Current normal GUI marker after restore:

- timestamp: `2026-06-30T02:11:14.978Z`.
- `default_stt_adapter=local`.
- `source=local_whisper_persistent_service`.
- local STT health `status=ready`.
- local STT health `latency_ms=49`.

### Remaining Goal Gaps

Goal audit still returns `result=incomplete`:

- `proved=6`.
- `partial=2`.
- `missing=0`.

Remaining:

- Cloud STT itself remains unstable; degraded-to-local fallback is implemented, but cloud recognition is not proven stable.
- Real operator W3 continuous listening is still unproved; only the controlled W3 handoff probe has passed.
- Fresh natural multi-round operator voice session after Edge TTS default switch is still recommended for experience validation.

## Follow-up Implementation 2026-06-30 02:18

### Change Implemented

Added cloud STT circuit-open skip for the main speech input button.

Problem addressed:

- Cloud WebSpeech/Chrome STT repeatedly produced `no-speech` and long waits.
- Degraded fallback existed after cloud failure, but an operator could still manually select `cloud` and trigger the slow cloud path again.

Code behavior now:

- Added `isCloudSttCircuitOpen`.
- When `selectedSttAdapter=cloud` and cloud health is already `degraded` or `recovery_action=switch_local`, `startSpeechRecognition` no longer starts Chrome STT.
- It logs `cloud_stt_circuit_open_skip_to_local`.
- It switches the visible adapter back to local with reason `cloud_stt_circuit_open_skip_to_local`.
- It calls the existing `startLocalSpeechTranscription` path.
- It adds a dialogue status note explaining that cloud STT circuit is open and local Whisper is being used for this input.

Boundary:

- This does not claim cloud STT itself is fixed.
- This prevents degraded cloud STT from repeatedly blocking the operator with slow retries.
- No world model write.
- No `requirement_packet.v1`.
- No new same-level STT system; it extends the existing cloud adapter fallback path.

### Verification Result

Commands passed:

- `npm.cmd run voice:cloud-stt-stability:validate`.
- `npm.cmd run voice:stt-input-queue:validate`.
- `npm.cmd run typecheck`.
- `npm.cmd run build`.
- `npm.cmd run voice:runtime-flow:restart-for-retest`.
- `npm.cmd run voice:runtime-flow:check-marker`.
- `npm.cmd run voice:runtime-flow:audit`.
- `npm.cmd run voice:goal:audit`.

Validation coverage added:

- `renderer_cloud_circuit_open_skips_slow_cloud=true`.
- `renderer_cloud_circuit_breaker_declared=true`.
- `renderer_cloud_degraded_falls_back_local=true`.

Current normal GUI marker after restore:

- timestamp: `2026-06-30T02:17:34.015Z`.
- `default_stt_adapter=local`.
- local STT health `status=ready`.
- local STT health `latency_ms=32`.
- `default_voice_output_mode=edge_readaloud_stream`.

### Remaining Goal Gaps

Goal audit remains `result=incomplete`:

- Cloud STT recognition itself remains unstable.
- The system now avoids repeated slow cloud waits after degraded state, but this is fallback stability, not cloud recognition success.
- Real W3 continuous listening still needs operator evidence.
- Fresh natural multi-round operator voice session is still needed for final experience validation.
