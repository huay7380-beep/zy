# 语音输出链路审计与修复记录 2026-06-26

## 用户现象

- 右下角悬浮窗已经能听到语音输出。
- 语音内容有时像是遗漏了部分反馈。
- 断句非常简短，听感像只播报了片段。

## 链路检查结论

- CosyVoice 服务健康检查正常。
- 直接发送较长语音文本到 CosyVoice 可以成功生成音频。
- CosyVoice 服务日志没有显示最近 TTS HTTP 失败。
- 服务日志中的 `synthesis text` 本身多次已经非常短，例如只包含一句状态摘要。
- Renderer 播放层只播放 `StatusDialogueOutput.voiceText`，不会播放完整 `reply`。
- `guardStatusDialogueOutput` 原先会把语音文本压缩成第一句，并截断到 88 字。
- 本地 fallback 原先生成的 `voiceText` 也只有“我在看某模块，目前只读”这类短句。

## 根因判断

当前主要问题不是 CosyVoice 丢字，也不是播放层已确认失败，而是 TTS 上游输入被过度压缩：

1. 模型提示词要求 `voice` 是更短语音行。
2. 身份守卫再次只取第一句并截断。
3. 本地 fallback 的语音行只保留焦点，不含状态卡、边界或下一步关注点。

这三层叠加后，界面文字回复是完整的，但语音只播很短的一句，因此用户会感到“遗漏”。

## 修复内容

- 将模型提示词改为：语音仍需简洁，但必须包含关键状态和下一步关注点，允许 1-3 个短句。
- 将身份守卫的语音输出从“第一句 88 字”调整为“可播报摘要，最多约 220 字”。
- 如果模型语音过短，而文字回复包含更多关键信息，会自动补入前两句状态摘要。
- 本地 fallback 语音改为包含：
  - 当前焦点。
  - 只读边界。
  - 状态卡 fresh/stale/missing。
  - 风险、接口或下钻的下一步关注点。
- 主进程新增 TTS 合成日志事件：
  - `tts_synthesis_start`
  - `tts_synthesis_complete`
  - `tts_synthesis_failed`
  - `tts_synthesis_skipped`

## 新日志位置

- `runtime/status-dialogue-logs/voice-flow-YYYYMMDD.jsonl`

日志只记录状态、长度、耗时、音频大小和错误摘要，不记录完整对话文本、原始音频、API key 或隐藏推理。

## 验证

- `npm.cmd run typecheck` 通过。
- `npm.cmd run build` 通过。
- CosyVoice health 正常。
- 直接长文本 TTS 探测成功生成音频文件：
  - `runtime/verification-logs/tts-long-line-probe-20260626.wav`
- 已重启 Electron 开发进程加载新代码。

## 复测观察点

- 下一次通过悬浮窗触发语音对话后，检查语音是否包含“焦点 + 状态卡 + 下一步关注点”。
- 检查 `voice-flow-YYYYMMDD.jsonl` 是否出现 `tts_synthesis_start` 和 `tts_synthesis_complete`。
- 如果仍有遗漏，下一步应区分是：
  - `plan.text` 输入过短。
  - CosyVoice 合成失败后回退浏览器 TTS。
  - 浏览器播放被打断或被下一轮输出覆盖。

## 二次复测：合成成功但未听到声音

用户再次测试后反馈没有语音输出。检查真实日志路径：

- `D:\zhineng\runtime\status-dialogue-logs\voice-flow-20260626.jsonl`

日志显示：

- STT 已进入链路。
- 模型响应已进入对话链路。
- TTS 已进入 CosyVoice：
  - `tts_synthesis_start`
  - `text_length=72`
  - `tts_synthesis_complete`
  - `latency_ms=21421`
  - `audio_bytes=527916`

结论：这一次不是 CosyVoice 没有合成，也不是模型没有回复；断点在 renderer 音频播放阶段，或者 21 秒合成延迟导致播放已经脱离用户手势触发窗口。

补充修复：

- Renderer 将当前 `HTMLAudioElement` 保存到 `voiceAudioRef`，直到播放结束或失败，避免音频对象在函数返回后被释放。
- 新增 renderer 播放事件日志：
  - `tts_playback_prepare`
  - `tts_playback_requested`
  - `tts_playback_playing`
  - `tts_playback_ended`
  - `tts_playback_error`
  - `tts_playback_blocked`
- 主进程新增 `zhineng:status-dialogue:voice-log` IPC，用于记录 renderer 播放事件。
- Electron 启动参数加入 `--autoplay-policy=no-user-gesture-required`，避免长时间合成后 `audio.play()` 被 Chromium 用户手势策略拦截。

验证：

- `npm.cmd run typecheck` 通过。
- `npm.cmd run build` 通过。
- 已重启 Electron，renderer 命令行已确认带有 `--autoplay-policy=no-user-gesture-required`。
- CosyVoice 服务保持运行。

下一次复测时，如果仍无声音，直接检查同一日志文件是否出现：

- 有 `tts_playback_requested` 但没有 `tts_playback_playing`：播放没有真正开始。
- 有 `tts_playback_blocked`：播放被浏览器策略或设备层阻止。
- 有 `tts_playback_playing` 和 `tts_playback_ended` 但人耳无声：优先检查系统音量、输出设备或 Electron 音频会话。

## 三次修正：真实 STT 到 TTS 闭环验证

用户指出“所谓跑通在验证后不可行”。重新检查日志后确认：

- 最近两轮用户测试没有进入 TTS。
- 最新日志显示 `chrome_stt_complete success=false`，错误为 `no-speech` 或 `chrome_stt_cancelled`。
- 随后才启动本地 Whisper fallback，但这时用户已经说完，重新录到的是空音频，因此 `local_stt_complete success=false transcript_length=0`。

根因：

- 旧顺序是 Chrome STT 优先，失败后再启动本地录音。
- 这个 fallback 并没有使用同一段用户语音，而是重新录一段，因此经常录到空白。
- 所以链路卡在 STT，不是 TTS。

修复：

- UI 的 STT 默认改为本地 Whisper 录音优先。
- 这样点击 STT 后立即录当前这段语音，转写成功后再进入对话和 TTS。
- Chrome STT 保留为后续优化路径，不再阻断当前闭环。

新增验证脚本：

- `D:\zhineng\sightflow-desktop-agent-main\scripts\status-dialogue-voice-loop-probe.mjs`

脚本验证内容：

- 输入真实 wav。
- 本地 Whisper STT 转写。
- 生成主体状态对话语音文本。
- 调用 CosyVoice TTS。
- 保存 wav。
- 解析 wav header，确认采样率、声道、位深、data bytes 和音频时长。

真实验证结果：

- 报告：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-e2e-20260626125346.json`
- 输出音频：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-e2e-20260626125346.wav`
- STT 转写：
  - `也好这是智能系统语音时别测试`
- TTS 输出：
  - 394796 bytes
  - 22050 Hz
  - 1 channel
  - 16 bit
  - 8.951 seconds
- 系统播放器验证：
  - 使用 Windows `System.Media.SoundPlayer.PlaySync()` 播放生成 wav。
  - 播放调用返回成功，耗时 9112ms。

构建验证：

- `npm.cmd run typecheck` 通过。
- `npm.cmd run build` 通过。
- 已重启 Electron，悬浮窗加载本地 Whisper 优先路径。
- CosyVoice 服务保持运行。

## 四次修正：延迟优化 1-4 项实现与验证

目标范围：
- `voice_ack + voice_final` 两段输出。
- 默认语音输出模式为 `cosyvoice_short`，最终 TTS 文本控制在约 20-35 字。
- STT 模型档位支持 `base/tiny` 切换，默认保留 `base`。
- 巡逻窗口增加 STT、model、TTS、playback、total 分段延迟状态位。

实现内容：
- `ZhinengConsole.tsx` 新增 `StatusDialogueVoiceLatencyState`，用于记录 `ack/stt/model/tts/playback/total`。
- 对话提交时立即播报短 ack：`我听到了，正在检查状态。` 或 `我收到文字，正在检查状态。`
- 模型完整回复仍显示在文字区，但 TTS 默认只播报 `cosyvoice_short` 的短句，避免长文本拖慢合成和播放。
- 设置区新增：
  - `voice mode`: `cosy short`、`browser fast`、`cosy full`
  - `STT model`: `base`、`tiny`
- 本地 Whisper IPC 不再硬编码 `base`，改为读取 UI 当前档位。
- `status-dialogue-voice-loop-probe.mjs` 默认使用 `--voice-mode cosyvoice_short`，报告中记录 `voice_ack`、`dialogue_compose`、`tts_cosyvoice`。

验证结果：
- `npm.cmd run typecheck` 通过。
- `npm.cmd run build` 通过。
- Electron 已重启，renderer 命令行确认带有 `--autoplay-policy=no-user-gesture-required`。
- 网页预览地址 `http://[::1]:5173/?window=zhineng-graph` 返回 HTTP 200。
- CosyVoice health 返回 HTTP 200。

真实端到端探针：
- base 默认档：
  - 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-e2e-20260626132019.json`
  - 音频：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-e2e-20260626132019.wav`
  - STT：6645ms
  - final voice：20 字
  - TTS：8305ms
  - audio duration：4.249s
  - total：15003ms
- tiny 快速档验证：
  - 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-e2e-20260626132045.json`
  - 音频：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-e2e-20260626132045.wav`
  - STT：10866ms
  - final voice：21 字
  - TTS：7735ms
  - audio duration：3.773s
  - total：18659ms

判断：
- 当前机器上 `tiny` 档并没有比 `base` 更快，且识别文本更差，因此默认继续使用 `base`。
- 主要体验优化来自两段式输出：ack 立刻由浏览器语音播报，final 由 CosyVoice 播短句。
- 短句 TTS 已把上一轮 8.951s 的长音频压到 4.249s 左右；CosyVoice HTTP 合成本身仍有 7-8s 级延迟，是后续要继续优化或替换 adapter 的主要瓶颈。

完成通知：
- 已用 CosyVoice 生成 `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\goal-complete-notify-20260626.wav`。
- 播报内容：`我已经完成了，张博先过来确认。`
- Windows `System.Media.SoundPlayer.PlaySync()` 循环播放 12 次，总耗时 32406ms。

## 五次修正：ack/final 同音色、云端 STT 默认路径和状态栏收纳

用户复测反馈：
- 第一句回应和后续语音音色明显不同。
- STT 变成本地转写，不符合当前希望优先使用云端转写的目标。
- 右侧语音输入和状态区域显示过多参数，压缩了对话体验。

证据：
- `voice-flow-20260626.jsonl` 中存在 `voice_ack_requested` 与 `voice_ack_ended`，但 ack 没有走 `tts_synthesis_start`，说明第一句由浏览器 `speechSynthesis` 播放。
- 后续 final 输出存在 `tts_synthesis_start` / `tts_synthesis_complete`，且 `voice_profile_id=voice.cosyvoice.local.default`，说明后续由 CosyVoice 播放。
- UI 代码中 `startSpeechRecognition()` 上一轮为了绕开云端失败，先调用 `startLocalSpeechTranscription()`，因此默认进入本地 Whisper。

修正：
- `speakVoiceAck()` 改为默认跟随当前 `selectedVoiceProfile`，在 `cosyvoice_short/cosyvoice_full` 下优先使用 CosyVoice 生成 ack。
- `speakDialogue()` 与 ack 共用同一套 voice profile 选择逻辑，并增加 stale request 检查，避免旧 ack 在新 final 后补播。
- STT 默认 adapter 改为 `cloud`，点击 STT 先进入 `zhineng:status-dialogue:chrome-stt:transcribe`。
- 本地 Whisper 仍保留，但需要在设置区手动切换到 `local`。
- 云端 STT 失败时不再自动转本地录音，避免录到空白 fallback 音频。
- 右侧常驻状态块移入齿轮设置区，并按 runtime、voice profile、snapshot、speech io、latency 等分类。

验证：
- `npm.cmd run typecheck` 通过。
- `npm.cmd run build` 通过。
- `status-dialogue-voice-loop-probe.mjs --model base --voice-mode cosyvoice_short` 通过。
- 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-e2e-20260626134929.json`
- ack：`tts_cosyvoice_ack`，`adapter=cosyvoice_local_http`，`voice=default`，音频 1.637s。
- final：`tts_cosyvoice`，`adapter=cosyvoice_local_http`，`voice=default`，音频 3.599s。
- 已重启 Electron，renderer 命令行仍带 `--autoplay-policy=no-user-gesture-required`。
- `http://[::1]:5173/?window=zhineng-graph` 返回 HTTP 200。
- 视觉验证截图：
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\graph-ui-after-status-collapse-20260626.png`
  - `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\graph-ui-settings-open-20260626.png`

剩余验证边界：
- 云端 STT 的真实 transcript 仍需要用户用当前麦克风在 GUI 中点击 STT 后复测，因为自动化 fake audio 对 Chrome Web Speech 仍会返回 `no-speech`。
- 但默认执行路径已改回云端，并且设置区显示 `STT adapter cloud`。

完成通知：
- 已用 CosyVoice 生成 `D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\work-complete-confirm-20260626.wav`。
- 播报内容：`当前的工作已经完成，张博先过来确认。`
- Windows `System.Media.SoundPlayer.PlaySync()` 播放 2 次，总耗时 7637ms。
