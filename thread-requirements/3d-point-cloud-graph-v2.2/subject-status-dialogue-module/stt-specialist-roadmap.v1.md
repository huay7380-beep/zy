# STT 专项路线图 v1

更新时间：2026-06-29

## 2026-06-30 S3 更新：正式 STT 连续会话首轮实现

- 2026-06-30 补充验证：
  - 新增 `continuous_voice_loop` runtime probe。
  - 新增 `npm.cmd run voice:runtime-flow:probe-continuous-loop`。
  - 该 probe 使用 isolated Electron hidden window，不重启当前 GUI。
  - 已验证：
    - `status_dialogue_continuous_voice_loop_probe_start`
    - `continuous_voice_session_enabled`
    - `continuous_voice_session_resume_scheduled`
    - `continuous_voice_session_resume_stt`
    - `status_dialogue_continuous_voice_loop_probe_complete.success=true`
  - 边界：
    - 该 probe 只验证 scheduler，不打开真实麦克风。
    - 真实连续对话完成条件仍然是右下角 GUI 中 `start loop` 后完成两轮以上真实语音输入。

- 已新增 `status_dialogue_continuous_voice_session.v1`，用于把正式 STT 从单次点击推进到可控连续会话。
- 该能力不是新的 STT adapter，也不是新的对话系统：
  - 仍复用 `startSpeechRecognition`。
  - 默认仍走 `local_whisper_persistent_service`。
  - W3 仍只负责唤醒词检测和 wake window。
  - continuous loop 负责正式 STT 的连续恢复。
- UI：
  - 设置面板中新增 `loop on/off`、`state`、`resumes`、`delay`。
  - 新增 `start loop` / `stop loop`。
- 状态机：
  - `armed`
  - `listening`
  - `waiting_dialogue`
  - `waiting_tts`
  - `waiting_queue`
  - `cooldown`
  - `paused_error`
  - `off`
- 边界：
  - 对话忙时不抢占。
  - TTS 播放/合成中不启动下一轮 STT。
  - 输入队列未清空时不启动下一轮 STT。
  - STT 错误时暂停，避免无声或麦克风异常导致无限重试。
  - 启用 continuous loop 时关闭 W3 detector，避免两个监听器抢占同一语音入口。
  - 不保存原始音频，不写世界模型，不创建 `requirement_packet.v1`。
- 已通过验证：
  - `npm.cmd run voice:continuous-listening:validate`
  - `npm.cmd run voice:w3-wake-detector:validate`
  - `npm.cmd run voice:stt-input-queue:validate`
  - `npm.cmd run voice:tts-input-boundary:validate`
  - `npm.cmd run typecheck`
  - `npm.cmd run build`
- 仍未完成：
  - 需要真实 GUI 中点击 `start loop` 后连续说两轮以上。
  - 日志必须出现 `continuous_voice_session_resume_stt`。
  - 后续必须跟随 `local_stt_recording_started`、`local_stt_transcribe_result` 和对话提交链路。
  - 云端 STT 本身仍未证明稳定，当前只是有降级到本地 Whisper 的防护。

## 2026-06-29 GUI 运行时版本验收规则

- 新增运行时 marker：`stt-local-observability-2026-06-29-v2`。
- 右下角 GUI 加载时必须写入 `status_dialogue_ui_runtime_loaded`。
- `voice:runtime-flow:audit` 的第一层判断改为：
  - 没有 `status_dialogue_ui_runtime_loaded`：不能判断新逻辑，先重启 GUI。
  - 有事件但 marker 不匹配：运行的不是当前构建，先重启/重新构建 GUI。
  - marker 匹配后，才继续判断本地 STT、输入队列和 TTS 中断事件。
- 当前旧日志结果：
  - `expected_runtime_fix_marker_seen=false`
  - `known_bottlenecks` 包含 `latest_gui_runtime_marker_not_observed`
  - 这说明旧日志只证明窗口不是最新验收对象，不能证明新补丁失败。
- 严格验收顺序：
  1. `expected_runtime_fix_marker_seen=true`
  2. `local_stt_adapter_selected_seen=true`
  3. `local_stt_recording_seen=true`
  4. `local_stt_transcription_seen=true`
  5. `formal_input_interrupt_seen=true` 或 `stale_tts_skip_or_interrupt_seen=true`
  6. 小智状态链路仍覆盖 `hello / listen_start / listen_detect / stt_result / llm_start / tts_start / tts_stop`

### Marker 等待命令

- `npm.cmd run voice:runtime-flow:check-marker`
  - 立即扫描最近真实 GUI 日志。
  - 找不到 marker 时返回 `missing_runtime_marker`。
- `npm.cmd run voice:runtime-flow:wait-marker`
  - 默认从命令启动后等待最新 marker。
  - 推荐在准备重启右下角 GUI 前运行。
- 当前旧日志状态：
  - `check-marker` 返回 `missing_runtime_marker`。
  - 该结果证明当前日志尚未包含最新 GUI 加载事件，不应用来判断新 STT 逻辑失败。

### 独立 marker probe

- `npm.cmd run voice:runtime-flow:probe-marker`
  - 用独立 Electron 测试进程加载 3D 图谱页面。
  - 只证明当前构建和真实 IPC marker 写入链路可用。
  - 不等同于右下角 GUI 已重启。
- 审计字段：
  - `probe_runtime_fix_marker_seen`：独立 probe 是否成功。
  - `real_gui_runtime_fix_marker_seen`：右下角真实 GUI 是否已加载当前修复版。
- 当前状态：
  - `probe_runtime_fix_marker_seen=true`
  - `real_gui_runtime_fix_marker_seen=false`
  - 下一步仍是重启右下角 GUI，并用真实麦克风输入完成本地 STT 与 TTS 中断验收。

### Probe 排除规则

- probe 事件带 `marker_probe=true`。
- 审计器默认不把 probe 事件计入真实 GUI 验收。
- `local_stt_events_seen` 必须来自真实 GUI 或 main 进程本地 STT 事件，包括：
  - `local_stt_health_request/result`
  - `local_stt_recording_*`
  - `local_stt_transcribe_*`
  - `local_stt_start/complete/failed`
  - `local_stt_service_ready/fallback`
  - `local_stt_health_check`
- `probe_stt_adapter_selected_count` 只用于说明 probe 自身状态，不作为本地 STT 成功证据。

### 真实 GUI 复测启动入口

- `npm.cmd run voice:runtime-flow:retest-preflight`
  - 只做 dry-run。
  - 列出当前 repo 的 Electron 主进程、子进程和 `electron-vite dev` 父进程。
  - 不停止进程。
- `npm.cmd run voice:runtime-flow:restart-for-retest`
  - 执行受控重启。
  - 启动时设置 `ZHINENG_STATUS_DIALOGUE_OPEN_GRAPH_ON_START=1`。
  - 自动打开 3D 图谱 OS 并等待真实 GUI marker。
- 当前状态：
  - dry-run 已通过。
  - 尚未执行受控重启。
  - 下一步如果确认执行，应先运行 `restart-for-retest`，再做真实麦克风输入和 TTS 播放中输入测试。

## 2026-06-29 默认本地 STT 路径修正

- 已修正 `retry cloud` 的副作用：
  - 旧逻辑：点击 `retry cloud` 会把全局 `selectedSttAdapter` 设置为 `cloud`，后续普通 STT 点击可能继续走云端。
  - 新逻辑：`retry cloud` 只执行一次性云端重试，并记录 `cloud_stt_retry_one_shot`，不改变默认本地 adapter。
- 已新增 GUI 可追踪事件：
  - `stt_adapter_runtime_selected`
  - `local_stt_health_request`
  - `local_stt_health_result`
  - `local_stt_recording_start_request`
  - `local_stt_recording_started`
  - `local_stt_recording_stopped`
  - `local_stt_transcribe_request`
  - `local_stt_transcribe_result`
  - `local_stt_recording_failed`
- 验收要求更新：
  - 只看到 `stt_adapter_runtime_selected selected_adapter=local` 只能证明 GUI 选择了本地路径。
  - 看到 `local_stt_recording_started` 才能证明麦克风进入本地录音分支。
  - 看到 `local_stt_transcribe_request/result` 或 main 进程 `local_stt_start/complete` 才能证明本地 Whisper 转写链路被调用。
- 审计器更新：
  - `voice:runtime-flow:audit` 输出 `local_stt_adapter_selected_count`、`local_stt_recording_event_count`、`local_stt_transcription_event_count`。
  - `voice:runtime-flow:audit:strict` 要求真实 GUI 日志出现本地 Whisper 转写事件。
- 最新验证：
  - `voice:local-whisper-service:validate` 通过。
  - `voice:runtime-flow:audit` 对旧日志仍为 `warn`，这是预期结果，因为旧日志没有本轮新增事件。
  - `voice:stt-input-queue:validate` 通过。
  - `voice:tts-input-boundary:validate` 通过。
  - `typecheck` 通过。
  - `build` 通过。

## 2026-06-29 真实 GUI 审计补充

- 新增真实运行日志审计入口：`npm.cmd run voice:runtime-flow:audit`。
- 严格验收入口：`npm.cmd run voice:runtime-flow:audit:strict`。
- 最新报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\verification-reports\status-dialogue-runtime-voice-flow-audit-1782739058364.json`。
- 审计结论：
  - `status=warn`，不是最终通过。
  - `dominant_stt_path=cloud`，GUI 日志仍主要走 Chrome/WebSpeech 云端 STT。
  - `local_stt_events_seen=false`，真实 GUI 日志里还没有观察到本地 Whisper 常驻服务命中。
  - `chrome_stt_max_ms=12211`，云端 STT 成功但延迟偏高。
  - `tts_synthesis_max_ms=28362`，CosyVoice 未缓存合成长尾仍是明显瓶颈。
  - `tts_queue_end_to_end_max_ms=59362`，单轮旧 TTS 队列会拖住后续输入。
  - `input_queue_wait_max_ms=13386`，输入有效性问题已从“丢失”转化为“排队等待过长”。
  - `formal_input_interrupt_seen=false`，当前日志还没有新补丁的真实 GUI 生效证据。
- 当前验收状态：
  - 静态验证已通过：输入队列、TTS 输入边界、状态对话策略、本地 Whisper 常驻服务、W3 唤醒检测。
  - 探针验证已通过：`voice:stream-loop:validate` 命中本地 Whisper 常驻服务，`stt_ms=1299`，缓存 TTS `total_tts_ms=16`。
  - 真实 GUI 验收未完成：需要重启右下角 GUI 后连续测试两轮以上，再运行 `voice:runtime-flow:audit`。
- 下一步真实验收标准：
  - 日志出现 `local_whisper_persistent_service` 或等价本地 STT 命中事件。
  - TTS 播放期间正式输入出现 `voice_playback_interrupted_for_formal_input`、`dialogue_input_barge_in` 或过期 TTS 跳过事件。
  - 后续输入不再等待十几秒级旧 TTS 队列。
  - 小智状态链路仍保持 `hello -> listen_start -> listen_detect -> stt_result -> llm_start -> tts_start -> tts_stop`。

## 2026-06-29 最新推进：正式输入优先中断旧 TTS

- 已确认真实 GUI 卡顿样本不是单纯 STT 丢失，而是旧 TTS 冷合成/播放拖住后续输入处理。
- 已补强 S4：
  - 新增 `voiceLatencyRef`，避免旧 `voiceLatency.stage` 闭包影响是否仍在播放的判断。
  - 新增 `interruptVoicePlaybackForFormalInput`，正式文字或 STT 转写输入到达时，如果旧语音正在合成/播放且模型仍忙，先中断旧 TTS，再把输入排入同一对话链路。
  - 保留 `queuedDuringTts=true` 与原始 `voiceQueueStatus`，确保输入到达边界可追溯。
  - 旧 TTS 合成完成后如 token 已过期，会跳过播放，不再覆盖新对话。
- 已补强对话状态：
  - 新增 `buildStatusDialogueStateLines`，把 `fresh/stale/missing/conflict/read_error/event critical` 转成结论、依据、关注点和下一步。
  - 模型 prompt 与 local fallback 都使用状态专属第一句，禁止把具体状态计数泛化成固定“状态有缺口”。
- 已通过：
  - `npm.cmd run voice:tts-input-boundary:validate`
  - `npm.cmd run voice:dialogue-state-policy:validate`
  - `npm.cmd run voice:stt-input-queue:validate`
  - `npm.cmd run typecheck`
- 后续仍需：
  - GUI 麦克风连续多轮实测。
  - W3 唤醒短语 handoff 到本地 STT 的真实验收。
  - 低延迟 TTS 主路径或预热策略；当前 CosyVoice 冷合成仍不是实时对话级。

## 当前目标

进入 STT 专项：云端 STT 稳定性、输入队列、连续监听、TTS 播放期间接收输入、以及本地 Whisper 常驻服务。

当前阶段只处理主体状态对话框自有语音输入链路，不写世界模型，不创建 `requirement_packet.v1`，不改变其它模块接口。

## 已核对问题

1. 真实 GUI 日志显示云端 Chrome STT 成功样本约 `6436ms`，失败或取消样本可到 `23484ms`。
2. 本地 Whisper fallback 当前是每轮 Python 子进程加载模型，闭环验证中 `stt_ms=12085`，不适合连续多轮低延迟对话。
3. TTS 缓存路径已经对齐到 `D:\zhineng\runtime\voice-audio-cache`，验证中缓存命中后 `total_tts_ms=8`，TTS 缓存链路已经不是当前最大瓶颈。
4. `submitDialogue` 旧逻辑在 `dialogueBusy` 时直接 return，导致 STT 转写结果在模型或播报忙碌期间丢失。
5. 旧 UI 在 `dialogueBusy` 时禁用 STT、文本输入和发送按钮，不符合“边播边接收输入”的目标。

## S1 输入队列基础

目标：保证多轮语音输入不丢失。

实现内容：

- `StatusDialogueInputKind`
- `StatusDialogueQueuedInput`
- `StatusDialogueInputQueueState`
- `pendingDialogueInputQueueRef`
- `dialogueBusyRef`
- `enqueueDialogueInput`
- `takeNextDialogueInput`
- 忙碌期间新输入进入短队列。
- 当前回复结束后自动取下一条输入进入同一 `submitDialogue` 链路。
- STT 按钮不再因为 `dialogueBusy` 被锁死。
- 文本输入不再因为 `dialogueBusy` 被锁死。
- 忙碌时提交按钮显示 `queue`。
- 设置面板显示 `input queue` 状态。

边界：

- 队列上限为 5 条。
- 不保存原始音频。
- 不改变模型 IPC。
- 不写世界模型。

## S2 云端 STT 稳定性

目标：降低 `network/cancelled/no-speech` 对真实对话的破坏。

已实现首轮：

- 记录每次 Chrome STT 的 session stage。
- 区分用户主动停止、无语音、网络失败、超时。
- 在 UI 中显示 cloud/local 的实际命中路径。
- 将失败样本进入 `voice-flow` 日志和设置面板。
- 主进程收到 `end` 且没有 transcript 时立即完成，不再等到 24 秒超时。
- `audio_start + end + no transcript` 归类为 `no_speech`。
- `end + no audio` 归类为 `ended_without_audio`。
- Renderer 新增 `StatusDialogueCloudSttHealthState`。
- Renderer 新增 `classifyChromeSttFailure`。
- 设置面板新增 `cloud stt stability status`。
- 对可恢复错误给出 `retry cloud` 可控重试入口。
- 对不可恢复错误保留 `use local` 快速切换入口。
- 新增 `cloud_stt_failure_classified` 日志事件。

仍待实现：

- 对真实 `network` 和 `service-not-allowed` 样本做多轮实机验证。
- 将重试策略接入未来连续监听状态机，而不是只做手动按钮。
- 与 W3 wake detector 的 wake window 进行统一状态编排。

## S3 连续监听与唤醒窗口

目标：从手动点击 STT 逐步过渡到可控持续监听。

待实现：

- W3 wake detector 只负责打开 wake window。
- wake window 内调用现有 STT。
- TTS 播放期间暂停 wake detector，不关闭正式 STT 和手动输入。
- 明确回声边界：屏蔽播放内容，不屏蔽用户真实输入。

## S4 TTS 播放期间接收输入

目标：播放中仍能接收新输入，并把新输入排入同一对话链路。

已实现首轮：

- 输入队列新增 `priority`。
- 输入队列新增 `echo_boundary`。
- 输入队列新增 `queued_during_tts`。
- 输入队列新增 `voice_queue_status` 与 `wake_stage` 追踪。
- 当 TTS 正在 `queued / synthesizing / playing` 或 voice latency 位于 `ack / tts_generating / playing` 时，新输入进入 `tts_playback_active` 队列。
- 播放期间输入默认 `priority=after_current_voice`。
- 播放期间输入默认 `echo_boundary=wake_detector_paused_only`。
- 模型 busy 结束时如果 TTS 仍在播，不立即取下一条，避免新一轮回复和当前播报互相覆盖。
- 当 `voicePlaybackQueueState.status=complete` 时，自动取队列下一条继续同一对话链路。
- 设置面板 `speech io` 区域显示 `during tts` 与 `echo`。
- 新增 `dialogue_input_dequeued_after_tts_complete` 日志事件。

仍待实现：

- 播放中输入的优先级策略。
- 插入式提醒与用户输入的冲突处理。
- 正在播放时的中断、合并、续播规则。
- 真正全双工回声消除：只屏蔽播放内容，不屏蔽用户真实输入。

## S5 本地 Whisper 常驻服务

目标：把本地 STT 从冷启动子进程改为常驻服务。

已实现首轮：

- 新增 `scripts/local-whisper-service.py`。
- 服务只绑定 `127.0.0.1`。
- 服务提供 `/health` 与 `/transcribe`。
- 服务进程内缓存已加载的 Whisper 模型，避免每轮重新 `whisper.load_model`。
- 主进程新增 `ensureLocalWhisperService`。
- 主进程新增 `runLocalWhisperServiceTranscription`。
- 主进程本地 STT 优先调用 `local_whisper_persistent_service`。
- 服务不可用时自动回退旧 `local_whisper_ipc` 子进程。
- 应用退出时清理本地 Whisper 服务进程。
- Renderer 已允许显示 `local_whisper_persistent_service` adapter。
- 2026-06-29 真实两轮服务探针已通过：
  - 测试音频：`D:\zhineng\sightflow-desktop-agent-main\runtime\verification-audio\chrome-stt-bridge-test-zh-20260625.wav`
  - 模型：`tiny`
  - 设备：`cuda`
  - 第一轮：`model_load_ms=4019`，`latency_ms=5491`
  - 第二轮：`model_load_ms=0`，`latency_ms=546`
  - 结论：常驻服务第二轮已复用模型，避免每轮 `whisper.load_model`。

仍待实现：

- GUI 麦克风入口真实两轮以上实测，验证 renderer -> main -> persistent service 链路。
- 可选 `ZHINENG_STT_SERVICE_PRELOAD=1` 的预加载策略验收。
- 评估 `faster-whisper` 或 `whisper.cpp` 作为更低延迟常驻 adapter。
- 将本地服务状态加入右侧设置面板的独立 health 行。

## 验证

新增验证命令：

```powershell
npm.cmd run voice:stt-input-queue:validate
npm.cmd run voice:cloud-stt-stability:validate
npm.cmd run voice:local-whisper-service:validate
npm.cmd run voice:tts-input-boundary:validate
```

保留回归验证：

```powershell
npm.cmd run voice:cache:prewarm
npm.cmd run voice:stream-loop:validate
npm.cmd run voice:stream-ipc:validate
npm.cmd run typecheck
npm.cmd run build
```

## 当前结论

卡顿原因已经分层：

- TTS 缓存优化在验证环境中已经生效。
- GUI 真实体验仍取决于是否预热了运行时缓存、是否使用真实低延迟流式 TTS。
- 当前最大剩余瓶颈是 STT：云端 STT 会话耗时和本地 Whisper 冷启动。
- “多次语音只有一次有效”的明确原因是旧提交链路在忙碌时丢弃输入；S1 已改为排队。

## 2026-06-29 当前优化成果复核

- 当前目标仍处于执行中：
  - 云端 STT 稳定性。
  - 输入队列。
  - 连续监听。
  - TTS 播放期间接收输入。
  - 本地 Whisper 常驻服务。
  - 对话状态补强。
  - 小智式对话逻辑是否被应用。
- 已完成并通过验证：
  - 输入队列静态验证通过，忙碌输入不再直接丢弃。
  - 播放期间输入边界验证通过，TTS 播放时输入进入队列。
  - 对话状态策略验证通过，小智式状态已进入 prompt。
  - 流式语音链路验证通过，缓存命中时 TTS 合成耗时为毫秒级。
  - 本地 Whisper 常驻服务真实探针通过，第二轮复用模型后转写约 `636ms`。
- 仍然卡顿的已知原因：
  - 真实 GUI 中未命中缓存的 CosyVoice 合成仍会达到十几秒到二十几秒。
  - 云端 Web Speech STT 会等待完整语音结束，最近成功样本约 `12211ms`。
  - 现阶段还不是完整全双工，只是播放期间输入排队。
- 当前判断：
  - “多次输入只有一次有效”的旧问题已从丢弃改成排队，但真实体验会表现为后续输入要等当前播报结束后才处理。
  - “语音卡顿”没有完全解决，缓存命中路径已优化，未缓存高质量 TTS 仍是主要瓶颈。

## 2026-06-29 快路径调整

- GUI 默认 STT adapter 已改为 `local`，优先调用本地 Whisper 常驻服务。
- 旧 GUI 如果保留 `cloud` 默认且未在录音，会自动迁移到 `local`，并记录 `stt_default_migrated_to_local`。
- 云端 STT 仍保留，可在设置中手动选择或通过 `retry cloud` 触发，用于高准确度或云端能力复核。
- 播放期间输入策略从“只能排队”等待，扩展为：
  - 模型忙：继续排队。
  - 只有 TTS 播放中：正式文字/语音输入可以 `barge-in` 打断当前播报并立即进入新一轮。
  - 旧 TTS 合成完成后如果 token 已过期，会跳过播放，避免过期语音覆盖新对话。
- 本地 Whisper 常驻服务探针：
  - `base/cuda` 已加载。
  - 第一轮约 `911ms`。
  - 第二轮约 `635ms`。
- 该调整解决的是“输入有效性和首选 STT 路径”，不是完整 TTS 延迟治理。CosyVoice 未命中缓存的新句合成仍需要后续单独优化。

## 2026-06-29 W3 状态证据补强

- W3.0 已有浏览器短语闭环，本轮补齐状态证据和验证：
  - `w3_wake_detected`：命中唤醒短语后打开 wake window。
  - `w3_wake_handoff_stt`：wake window 转交现有 STT。
  - `dialogue_triggered=false -> true`：明确 detector 本身不提交对话音频，只有 handoff 到 STT 时才触发对话链路。
- 唤醒短语仍为：
  - `小张`
  - `高手`
  - `小天才`
- W3 与本地 STT 快路径对齐：
  - 当前默认 `selectedSttAdapter=local`。
  - 因此 W3 handoff 默认进入本地 Whisper 常驻服务，而不是云端 STT。
- 新增命令：
  - `npm.cmd run voice:w3-wake-detector:validate`
- 当前仍未完成：
  - GUI 实机唤醒短语验证。
  - 本地 keyword detector W3.1。
  - 完整全双工回声处理。

## 2026-06-29 端到端 STT 验证口径修正

- 问题：
  - 旧 `voice:stream-loop:validate` 使用冷启动 `local-whisper-transcribe.py`，导致闭环报告里 `stt_ms` 被旧路径拉高。
  - 这与当前 GUI 默认目标路径 `local_whisper_persistent_service` 不一致。
- 已调整：
  - `voice:stream-loop:validate` 默认使用 `http://127.0.0.1:17858/health` 与 `/transcribe`。
  - 报告新增 `stt_uses_persistent_service` 和 `stt_service_health_ok`。
  - 旧冷启动验证保留为显式参数：`--stt-mode cold`。
- 最新验证报告：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-stream-loop-20260629102514.json`
- 最新结果：
  - `stt_ms=816`
  - `stt_uses_persistent_service=true`
  - `stt_service_health_ok=true`
  - `first_tts_ms=6`
  - `total_tts_ms=10`
  - `slowest_stage=playback`
- 结论：
  - STT 自动化闭环默认路径已经对齐常驻服务。
  - 后续不能再用旧冷启动闭环报告判断当前默认 STT 性能。
  - GUI 实机麦克风多轮验证仍是未完成项，必须继续保留。

## 2026-06-29 多轮输入与卡顿复核结论

- 当前目标未完成，只是完成了部分优化复核：
  - 本地 Whisper 常驻服务路径可用。
  - 输入队列路径可用。
  - 小智式状态机已进入 prompt 和 UI 状态。
  - TTS 播放期间输入边界已实现，但仍不是完整全双工。
- 本轮发现并修正：
  - 播放队列状态原先只存在 React state 中，`submitDialogue` finally 分支可能读到旧状态。
  - 已新增 `voicePlaybackQueueStateRef`，让输入入队、打断判断和 finally 出队判断都读取最新播放状态。
  - 新增验证项 `playback_state_ref_prevents_stale_queue_drain`。
- 最新验证：
  - `voice:tts-input-boundary:validate` 通过。
  - `voice:stt-input-queue:validate` 通过。
  - `voice:local-whisper-service:validate` 通过。
  - `voice:stream-loop:validate` 通过，`stt_ms=769`，`stt_uses_persistent_service=true`。
  - `typecheck` 通过。
- 仍然卡顿的已知原因：
  - 真实 GUI 旧日志中仍有 `chrome_stt_bridge` 样本，成功样本约 `12211ms`。
  - 当前 CosyVoice 原生流式验证为 slow，`first_audio_payload_chunk_ms_from_request=7814`，`interactive_ready=false`。
  - 未命中缓存的新句合成仍可能达到十几秒到二十几秒。
- 下一步建议：
  - GUI 实机刷新后连续测试两轮本地 STT，确认日志出现 `local_stt_start/local_stt_complete`。
  - 进入 TTS 延迟专项，不再把高质量 CosyVoice 冷合成误判为 STT 问题。
  - 为实时对话建立低延迟 TTS 路径，同时保留 CosyVoice 用于缓存命中、高质量固定播报和完成提醒。

## 2026-06-29 S5 GUI 可追踪健康状态补齐

- 已补齐：
  - 主进程新增只读 `zhineng:status-dialogue:stt:health`。
  - 返回 `status_dialogue_local_stt_health.v1`，用于描述本地 Whisper 常驻服务是否配置、是否可达、已加载模型、设备、耗时和是否刚被启动。
  - renderer 新增 `StatusDialogueLocalSttRuntimeState`。
  - `speech io` 设置区新增 `local stt service health status`：
    - `local`: ready/fallback/error 与 health 耗时。
    - `loaded`: 已加载模型数量。
    - `device`: 服务返回的推理设备。
    - `last`: 最近一次本地 STT 的 adapter 和耗时。
  - 本地 STT 转写结果会回写 `lastResult`，便于确认 GUI 实测是否真正命中 `local_whisper_persistent_service`。
- 验证：
  - `voice:local-whisper-service:validate` 新增并通过：
    - `main_exposes_local_stt_health_ipc`
    - `renderer_requests_local_stt_health`
    - `renderer_exposes_local_stt_runtime_state`
  - `typecheck` 通过。
  - `voice:stream-loop:validate` 通过，最新 `stt_ms=912`，并确认 `stt_uses_persistent_service=true`。
  - `voice:cloud-stt-stability:validate` 通过。
  - `voice:stt-input-queue:validate`、`voice:tts-input-boundary:validate`、`voice:dialogue-state-policy:validate`、`voice:w3-wake-detector:validate` 均通过。
  - `build` 通过。
  - 浏览器预览确认 `local stt service health status` 行已出现在右侧设置面板；浏览器预览无 Electron IPC，因此显示 `local fallback` 属预期。
- 仍未完成：
  - 右下角 GUI 刷新或重启后，连续两轮以上麦克风实机测试。
  - 从真实运行日志确认出现 `local_stt_health_check`、`local_stt_start`、`local_stt_complete`，且 `adapter_id=local_whisper_persistent_service`。
  - W3 wake window handoff 后的本地 STT 实机链路验证。

## 2026-06-29 复核结论：优化已入库，真实 GUI 仍需重启验证

- 当前目标仍未完成：
  - 云端 STT 稳定性。
  - 输入队列。
  - 连续监听。
  - TTS 播放期间接收输入。
  - 本地 Whisper 常驻服务。
  - 对话状态补全。
  - 小智式对话逻辑应用检查。
- 已通过的实现级验证：
  - `voice:runtime-flow:audit` 通过但为 `warn`。
  - `voice:runtime-flow:retest-preflight` 通过。
  - `voice:local-whisper-service:validate` 通过。
  - `typecheck` 通过。
  - `build` 通过。
- 最新审计关键数据：
  - `expected_runtime_fix_marker_seen=true`
  - `probe_runtime_fix_marker_seen=true`
  - `real_gui_runtime_fix_marker_seen=false`
  - `dominant_stt_path=cloud`
  - `chrome_stt_avg_ms=8179`
  - `chrome_stt_max_ms=12211`
  - `tts_synthesis_avg_ms=14017`
  - `tts_synthesis_max_ms=28362`
  - `tts_queue_end_to_end_max_ms=59362`
  - `input_queue_wait_max_ms=13386`
  - `local_stt_events_seen=false`
- 判断：
  - 新逻辑能被独立 probe 加载，但右下角真实 GUI 尚未证明已经加载最新 runtime。
  - 多次语音输入只有一次有效的体感，当前主要来自队列等待、云端 STT 长等待和 TTS 长尾，不是单纯按钮失效。
  - 本地 Whisper 常驻服务已经具备低延迟条件，但真实 GUI 麦克风入口还没有日志证明命中该路径。
- 下一步准入条件：
  - 执行受控 GUI 重启复测。
  - 复测后必须看到真实 GUI `status_dialogue_ui_runtime_loaded` 且非 `marker_probe=true`。
  - 连续两轮麦克风输入必须至少一轮命中 `local_whisper_persistent_service`。
  - 若仍走云端 STT，需要直接检查 renderer 状态迁移和 GUI 本地存储里的 `selectedSttAdapter`。

## 2026-06-29 复测状态更新：真实 GUI 已刷新，等待真实麦克风 local STT

- 已完成：
  - 修复 Windows 重启脚本 `spawn EINVAL`。
  - 修复 runtime marker 等待窗口，新增 `--since-ms`。
  - 成功执行 `voice:runtime-flow:restart-for-retest`。
  - 已捕获真实 GUI runtime marker：`marker_probe=false`、`default_stt_adapter=local`。
  - 本地 Whisper 常驻服务 health ready：`adapter_id=local_whisper_persistent_service`、`device=cuda`、`loaded_models=["base"]`、`latency_ms=34`。
- 新增验收口径：
  - `npm.cmd run voice:runtime-flow:wait-local-stt`
  - 用于用户真实点击右下角 STT 后，等待并验证 local STT 录音和转写事件。
- 当前 `check-local-stt` 状态：
  - 已证明：GUI 选择 local，本地 STT health ready。
  - 未证明：真实麦克风录音、转写请求、主进程本地 Whisper 完成、renderer 转写结果。
- 下一步：
  - 用户在右下角 GUI 中点击 STT，说一句完整中文。
  - 同时运行 `npm.cmd run voice:runtime-flow:wait-local-stt`。
  - 目标是让脚本通过，并看到 `local_stt_complete.adapter_id=local_whisper_persistent_service`、`success=true`、`transcript_length>0`。

## 2026-06-29 目标完成度审计纳入流程

- 新增命令：
  - `npm.cmd run voice:goal:audit`
- 审计范围：
  - 真实 GUI runtime。
  - 云端 STT 稳定性。
  - 输入队列。
  - 连续监听 / W3。
  - TTS 播放期间输入。
  - 本地 Whisper 常驻服务。
  - 对话状态上下文。
  - 小智式对话逻辑。
- 当前结果：
  - `result=incomplete`
  - `proved=4`
  - `partial=4`
  - `missing=0`
- 该结果意味着：
  - 当前目标不应标记完成。
  - 不能再用“服务 ready”替代“真实麦克风 local STT 转写完成”。
  - 不能再用“W3 静态验证通过”替代“真实唤醒和 handoff 已发生”。
  - 不能再用“播放期间输入入队”替代“正式输入打断或过期 TTS 跳过已验证”。
## 2026-06-29 Local STT真实触发诊断规则更新

- 当前 STT 专项验证不再只判断“是否出现 local_stt_complete”。
- 验证链路必须分层判断：
  - 前置状态：local adapter 是否已选中、本地 Whisper health 是否 ready。
  - 触发状态：当前等待窗口是否出现 `stt_start_requested`。
  - 录音状态：是否出现 `local_stt_recording_start_request`、`local_stt_recording_started`、`local_stt_recording_stopped`。
  - 转写状态：是否出现 `local_stt_transcribe_request`、`local_stt_start`、`local_stt_complete`、`local_stt_transcribe_result`。
- `voice:runtime-flow:wait-local-stt` 已改为：
  - 前置状态从最近 runtime 事件读取。
  - 真实动作只从当前等待窗口读取。
  - 如果没有点击或没有触发到真实 GUI，结果明确为 `no_stt_start_request_after_wait`。
- 当前最新判断：
  - local adapter 和 health 已经 ready。
  - 最新失败点是没有捕获到 STT 触发事件。
  - 下一轮真实测试需要先证明右下角 Electron GUI 的 STT 按钮会写入 `stt_start_requested`，再继续判断录音和转写。

### STT retest preflight

- 入口命令：
  - `npm.cmd run voice:runtime-flow:stt-retest-preflight`
- 使用时机：
  - 每次准备让用户做右下角 GUI 真实麦克风测试前先运行。
- 通过含义：
  - `ready_for_operator_action=true` 只表示当前可以开始人工 STT 测试。
  - `completion_proof=false` 必须保持为 false，除非完整 local STT 转写已经被证明。
- 不允许的误用：
  - 不得把 preflight 通过写成“语音输入已跑通”。
  - 不得用 preflight 替代 `voice:runtime-flow:wait-local-stt`。
  - 不得用 preflight 替代 W3 唤醒、TTS 播放中输入打断或云端 STT 当前窗口样本验证。

### Goal audit readiness field

- `voice:goal:audit` 现在同时输出：
  - `manual_retest_readiness.local_stt`
- 该字段用于总目标审计层判断当前是否可以进入人工实测。
- 当前预期状态：
  - `ready_for_operator_action=true`
  - `completion_proof=false`
  - `result=ready_for_operator_stt_test`
- 完成标准不变：
  - 只有真实右下角 Electron GUI 麦克风输入产生 `local_stt_complete.adapter_id=local_whisper_persistent_service`、`success=true`、`transcript_length>0`，并且 renderer 侧 `local_stt_transcribe_result` 同步成功，才算 local STT 运行证明成立。

### Controlled GUI click evidence

- 已完成一次右下角 Electron GUI 的受控 STT 点击。
- 已证明：
  - `stt_start_requested`
  - `local_stt_recording_start_request`
  - `local_stt_recording_started`
  - `local_stt_recording_stopped`
  - `local_stt_transcribe_request`
  - `local_stt_start`
  - `local_stt_complete.adapter_id=local_whisper_persistent_service`
  - `local_stt_transcribe_result.adapter_id=local_whisper_persistent_service`
- 本次不算完成：
  - `success=false`
  - `transcript_length=0`
  - 原因是受控点击没有真实口述音频。
- 当前路线：
  - 入口、录音、本地 Whisper 调用链路已被证明。
  - 下一轮必须由用户真实说话，证明 `success=true` 和 `transcript_length>0`。

### Controlled TTS Input Interrupt Probe

- 新增命令：`npm.cmd run voice:runtime-flow:probe-tts-input-interrupt`。
- 目的：验证 TTS 播放 active 状态下，正式输入不会被旧播报卡死，而是触发输入打断和队列记录。
- 运行方式：
  - 使用隐藏 Electron 测试窗口加载 `window=zhineng-graph`。
  - URL state 含 `status_dialogue_runtime_probe=tts_input_interrupt`。
  - renderer 将 voice queue 置为 `playing`，再提交正式文本输入。
- 必须出现的事件：
  - `voice_playback_interrupted_for_formal_input`
  - `tts_queue_interrupted`
  - `dialogue_input_queued`
  - `status_dialogue_tts_input_interrupt_probe_complete`
- 审计边界：
  - `runtime_probe` 不算真实右下角 GUI runtime marker。
  - `wait-marker` 和 `wait-local-stt` 排除 `runtime_probe`。
  - `voice:goal:audit` 只在 `tts_during_input` 子项里接受该 probe 作为受控运行证据。
- 最新结果：
  - `voice:runtime-flow:audit` 中 `formal_input_interrupt_seen=true`、`stale_tts_skip_or_interrupt_seen=true`。
  - `voice:goal:audit` 更新为 `proved=5 / partial=3 / missing=0`，总结果仍为 `incomplete`。
- 仍未完成：
  - local STT 真实麦克风成功转写。
  - W3 真实唤醒和 handoff。
  - 云端 STT 当前窗口稳定样本。
  - CosyVoice 冷合成长尾治理。
## 2026-06-29 v3 验收更新：本地 STT VAD 门控与运行边界

- 当前 marker：`stt-local-observability-2026-06-29-v3`。
- v3 目标：
  - 防止静音/无效麦克风输入继续调用 Whisper 并污染对话链路。
  - 明确区分 browser preview 与右下角 Electron GUI。
  - 让等待脚本从最新真实 GUI marker 后检查 STT 动作，避免旧日志污染当前验收。
- 新增本地录音门控：
  - `local_stt_voice_detected`：检测到足够人声。
  - `local_stt_silence_detected`：录音窗口结束但未检测到足够人声，跳过 Whisper 调用。
  - `local_stt_recording_stopped` 必须包含音频能量与人声窗口指标。
- 验收边界：
  - browser preview 可用于 UI 浏览，但不能证明 `local_whisper_persistent_service`。
  - 本地 STT 真实验收必须在右下角 Electron GUI 中完成，并且 `voice-flow` 日志必须写入非 probe 事件。
- 当前已验证：
  - `voice:runtime-flow:check-marker` 已看到真实 GUI v3 marker。
  - `voice:local-whisper-service:validate` 通过。
  - `voice:runtime-flow:stt-retest-preflight` 返回 `ready_for_operator_stt_test`。
  - 120 秒 `voice:runtime-flow:wait-local-stt` 未捕捉到新的 STT 点击事件，因此真实麦克风成功转写仍未完成。
- 下一步真实验收：
  1. 在右下角 Electron GUI 点击 `STT`，不要在 browser preview 点击。
  2. 等 UI 显示本地录音状态后说一句完整中文。
  3. 跑 `npm.cmd run voice:runtime-flow:check-local-stt` 或 `voice:runtime-flow:wait-local-stt`。
  4. 通过条件：`local_stt_complete success=true transcript_length>0`，同时有 `local_stt_voice_detected` 或 `local_stt_recording_stopped voice_detected=true`。
## 2026-06-30 S3 补充：连续正式 STT 的真实多轮验证

- 背景：
  - 当前连续监听代码与受控 probe 已具备，但真实 GUI 多轮输入仍未证明。
  - 最新真实窗口检查显示 `adapter_selected_local=true`、`health_ready=true`，但 `stt_start_requested=false`。
  - 因此当前优先级不是更换 Whisper，而是确认右下角 GUI 的正式输入触发和 continuous loop 是否能连续两轮进入 STT。
- 新增验证命令：
  - `npm.cmd run voice:runtime-flow:continuous-loop-preflight`
  - `npm.cmd run voice:runtime-flow:wait-continuous-loop`
  - `npm.cmd run voice:runtime-flow:check-continuous-loop`
- 新增交互入口：
  - 主输入栏新增 `loop` / `loop on` 按钮，作为 continuous formal STT loop 的显式入口。
  - STT 主按钮新增 `stt_button_pointer_down` 日志，用于验证真实点击是否到达按钮。
- 通过标准：
  - 默认 `min_turns=2`。
  - 真实非 probe 日志中出现 `continuous_voice_session_enabled`。
  - 出现 `continuous_voice_session_resume_scheduled` 与 `continuous_voice_session_resume_stt`。
  - 至少两轮本地 STT 成功：`local_stt_transcribe_result.success=true` 且 `transcript_length>0`。
- 入口诊断标准：
  - `no_stt_start_request_after_wait` 且无 `stt_button_pointer_down`：没有点到真实 Electron GUI 的 STT 主按钮，或测试发生在 browser preview。
  - `stt_button_pointer_seen_without_start_request`：点击到按钮但 start handler 未进入，需要检查前端事件绑定。
- 边界：
  - 该验证只读日志，不写世界模型，不创建 `requirement_packet.v1`，不保存原始音频。
  - 该验证不证明云端 STT 稳定性，也不证明 TTS 延迟已解决。
- 当前判断：
  - 本地 STT 已有历史真实成功样本，但当前窗口仍缺连续触发证据。
  - TTS 卡顿主因仍是语音合成/队列长尾；本地 STT 常驻服务不是主要瓶颈。

## 2026-06-30 S3 补充：真实 GUI loop 入口已跑到录音

- 已验证：
  - 真实右下角 GUI 已重启并加载最新非 probe marker。
  - 主输入栏 `loop` 按钮可见并可点击。
  - 点击 `loop` 后出现 `continuous_voice_session_enabled`、`continuous_voice_session_resume_scheduled`、`continuous_voice_session_resume_stt`。
  - loop 调用了现有正式 STT 路径，出现 `stt_start_requested`、`local_stt_recording_start_request`、`local_stt_recording_started`。
  - 小智式桥接事件同步出现 `hello`、`listen_start`、`listen_detect`。
- 未完成：
  - 本轮自动点击没有真实人声，VAD 记录 `local_stt_silence_detected`。
  - 仍未证明两轮连续 `local_stt_transcribe_result.success=true`。
- 脚本口径：
  - `check-continuous-loop` 已能区分 `continuous_loop_stopped_after_silence`。
  - 该状态表示入口和录音已通，但缺可识别人声，不算连续监听目标完成。
