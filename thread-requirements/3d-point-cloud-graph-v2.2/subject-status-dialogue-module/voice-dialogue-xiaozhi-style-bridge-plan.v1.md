# 小智式语音会话桥接方案 v1

来源：`idea-0006`。  
日期：2026-06-28。  
当前状态：路线 A 已确认；最小 bridge、W1 配置骨架和 W2 VAD 预检已实现，等待真实麦克风复测。

## 目标

把小智语音机器人的快速反应、持续会话、情绪事件和状态协议转译到主体状态对话框中，用于补齐当前语音闭环的自然度、状态可观察性和后续打断能力。

本方案不把小智服务端或 ESP32 设备链路直接接入当前系统，而是在现有桌面语音链路中实现一个 `xiaozhi_style_voice_bridge` 虚拟设备会话层。

## 小智流程对比

| 小智原流程 | 当前系统合理化改造 |
| --- | --- |
| ESP32 固件烧录、配网、OTA、硬件按键 | 不进入当前桌面实现；右下角主体状态对话框作为虚拟设备端 |
| 设备端通过 WebSocket / MQTT / UDP 建立会话 | 当前先用内存事件和 Electron voice-log 记录，后续可替换为 WebSocket adapter |
| Opus 音频帧上传和下行播放 | 当前不改音频编码；沿用 Chrome STT、本地 STT、CosyVoice/browser TTS |
| `hello` 握手 | 映射为一次语音或文字轮次的虚拟设备会话开始 |
| `listen start / detect / stop` | 映射为 STT 开始、检测到音频或 interim transcript、识别结束 |
| `stt` 结果 | 映射为 `DialogueInputEnvelope.input_kind=speech_transcript` |
| `llm emotion` | 映射为可见情绪状态，不展示隐藏推理链 |
| `tts start / sentence_start / stop` | 映射为高质量 TTS 合成、开始播放、播放完成 |
| `abort` | 映射为用户停止输入、后续播放打断和会话取消 |
| MCP 工具 | 当前只保留为未来只读状态巡检工具映射，不启用外部动作 |

## 当前数据流

```text
operator voice/text
  -> virtual desktop device hello
  -> listen_start / listen_detect
  -> Chrome STT Bridge or local Whisper
  -> stt_result
  -> status dialogue model / local fallback
  -> llm_start / llm_emotion
  -> high-quality TTS plan
  -> tts_start / tts_sentence_start / tts_stop
  -> visible bridge state + voice-log + 3D particle mapping
```

## 唤醒词与录入方式

当前已实现状态：手动点击 `STT` 后录入。

证据：

- `ZhinengConsole.tsx` 中语音入口由 `startSpeechRecognition` 按钮触发。
- 默认 `selectedSttAdapter = "cloud"`，即 Chrome STT Bridge。
- 浏览器原生 SpeechRecognition fallback 中 `recognition.continuous = false`。
- 当前没有 `wake_word`、`hotword`、`keyword_detector` 或持续监听配置入口。

因此当前不应宣称已经启用唤醒词。唤醒词进入本方案的后续分阶段实现。

### 建议默认策略

第一阶段继续保留手动 STT 作为稳定入口，新增持续监听和唤醒词的配置骨架，但默认关闭。

```json
{
  "voice_input_mode": "manual_click",
  "wake_word": {
    "enabled": false,
    "mode": "local_keyword",
    "phrases": ["小张", "高手", "小天才"],
    "sensitivity": 0.65,
    "wake_window_ms": 8000,
    "cooldown_ms": 1500,
    "pause_while_tts_playing": true,
    "store_raw_audio": false
  }
}
```

可选模式：

| Mode | 含义 | 当前状态 |
| --- | --- | --- |
| `manual_click` | 点击 STT 后开始一次录音/转写 | 当前可用 |
| `continuous_vad` | 持续监听音量/VAD，只判断是否有人声 | 可作为下一步最小实现 |
| `wake_word` | 本地唤醒词检测后进入对话 | 需要新增 detector adapter |
| `semantic_wake` | 先短转写，再判断是否在跟本模块说话 | 需要持续监听、短转写和语义判断 |
| `hybrid` | 唤醒词 + 语义判断 | 后续增强 |

### 推荐实施顺序

1. `W0 manual guard`：保留当前手动 STT，不改变默认路径。
2. `W1 config skeleton`：增加持续监听和唤醒词配置、UI 状态位、3D 映射节点，默认关闭。
3. `W2 VAD precheck`：增加本地音量/VAD 预检，只判断是否有人声，不进入对话。
4. `W3 keyword gate`：增加本地唤醒词 adapter，命中后打开 8 秒对话窗口。
5. `W4 semantic gate`：短时转写第一句，判断是否在跟系统说话。
6. `W5 interruption guard`：TTS 播放时暂停监听或做回声门控，避免系统把自己说的话再次识别成用户输入。

### 唤醒词候选

默认建议先用中文短唤醒词：

- `小张`
- `高手`
- `小天才`

当前不保留 `张博` 作为唤醒词。最终 UI 应允许用户编辑 phrase 列表。

## 核心契约

新增核心契约：

- `xiaozhi_style_voice_bridge_config.v1`
- `xiaozhi_style_voice_bridge_event.v1`
- `xiaozhi_style_voice_bridge_state.v1`

事件类型：

- `hello`
- `listen_start`
- `listen_detect`
- `listen_stop`
- `stt_result`
- `llm_start`
- `llm_emotion`
- `tts_start`
- `tts_sentence_start`
- `tts_stop`
- `abort`
- `complete`
- `error`

情绪状态：

- `neutral`
- `focused`
- `warm`
- `urgent`
- `reflective`
- `steady`

## 实现范围

本轮只做路线 A 最小实现：

- 新增纯函数状态机 `src/core/status-dialogue/xiaozhi-voice-bridge.ts`。
- 在 `ZhinengConsole.tsx` 中把现有 STT、模型、TTS 阶段映射成小智式事件。
- 事件写入现有 `zhineng:status-dialogue:voice-log`。
- 巡逻窗口设置面板显示 bridge stage、emotion、listen、speak、event count。
- 3D 粒子 OS 中增加 `voice.xiaozhi_style_bridge` 节点，显示输入、输出和边界。
- W1：新增 `xiaozhi_style_wake_config.v1`，默认 `voice_input_mode=manual_click`、`wake_word.enabled=false`、`continuous_listen_enabled=false`。
- W2：新增 `xiaozhi_style_vad_precheck.v1`，设置面板提供 `check vad`，短时检测麦克风人声能量，不提交对话、不保存原始音频。

## 边界

- 不接入真实小智服务端。
- 不烧录 ESP32。
- 不启用 OTA。
- 不绑定真实硬件设备。
- 不持久化原始音频。
- 不写世界模型。
- 不创建需求传递包。
- 不改变 Chrome STT、local Whisper、CosyVoice 或 browser TTS 的 provider 选择。
- 不改变人际关系图谱、事件图谱或外部动作通道。
- 不默认开启持续监听。
- 不默认开启唤醒词。
- TTS 播放期间必须暂停或门控监听，避免回声进入对话链路。

## 与高质量 TTS 原则关系

本方案不允许用低质量 TTS 作为常规快路径。小智式事件只负责会话状态和调度表达，语音输出仍遵守 `idea-0004` 的规则：

- 每一句播报默认走高质量 TTS 或高质量缓存。
- 浏览器 TTS 和文字兜底只作为故障 fallback。
- 后续优化通过流式、预热、缓存、分句播放和可打断实现。

## 3D 粒子 OS 映射

新增星点：

| Node | 含义 | 输入 | 输出 | 闸口 |
| --- | --- | --- | --- | --- |
| `voice.xiaozhi_style_bridge` | 小智式虚拟设备会话桥 | STT progress, dialogue output, TTS lifecycle, voice latency | bridge event, bridge state, visible status | `voice_bridge_gate` |
| `voice.wake_word_gate` | 唤醒词和语义唤醒入口 | microphone state, VAD, keyword phrase, TTS playing state | wake_state, wake_window, blocked_reason | `wake_gate` |
| `voice.vad_precheck` | 手动麦克风人声能量预检 | microphone stream, rms threshold, precheck window | `voice_detected` / `silence`, `dialogue_triggered=false` | `vad_precheck_gate` |

该节点归属主体状态对话框星云，不接入世界核心写入，仅提供语音链路观察和后续 adapter 位置。

## 执行条件检查

| 条件 | 当前状态 | 结论 |
| --- | --- | --- |
| 手动 STT 稳定入口 | 已有 Chrome STT Bridge 与本地 Whisper fallback | 具备 |
| TTS 输出链路 | 已有 CosyVoice local_http 与 browser fallback | 具备 |
| 小智式事件状态机 | 已有 `xiaozhi-voice-bridge.ts` 最小实现 | 具备 |
| UI 可视化状态位 | 已有 `xiaozhi bridge` 设置区 | 具备 |
| 3D 粒子映射 | 已有 `voice.xiaozhi_style_bridge`、`voice.wake_word_gate`、`voice.vad_precheck` | W1/W2 具备 |
| 持续监听音频入口 | 当前仍只有手动点击 STT；无后台持续监听 | 不完全具备 |
| VAD/端点检测 | 已有手动 `check vad` 预检；不进入对话链路 | W2 基础具备，待真实麦克风复测 |
| 唤醒词 detector | 当前没有 hotword/keyword adapter | 不具备，需 W3 |
| 语义唤醒 | 当前没有持续短转写和 addressing 判断 | 不具备，需 W4 |
| 回声抑制/播放门控 | 当前只有 TTS 播放状态，未形成监听门控规则 | 不完全具备，需 W5 |
| 隐私边界 | 当前不持久化原始音频，方案继续保持 | 具备 |

结论：整个方案已经具备继续执行的基础条件，且 `W1 config skeleton` 与 `W2 VAD precheck` 已进入实现。真正的唤醒词自动进入对话仍需要新增 detector adapter 后才能执行。当前默认仍保持 `manual_click`。

## 验证方案

文档验证：

```powershell
rg "idea-0006|xiaozhi_style_voice_bridge|route A|小智式" D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2
```

类型验证：

```powershell
npm.cmd run typecheck
```

构建验证：

```powershell
npm.cmd run build
```

行为验证：

- 打开主体状态对话框。
- 点击 STT 后，设置面板中的 `xiaozhi bridge` 从 `idle` 进入 `hello/listening/stt`。
- 转写成功后，bridge 进入 `llm`。
- 播放 TTS 时进入 `tts/playing`，结束后事件数递增。
- 停止 STT 时出现 `abort`。
- 设置面板显示 `input manual_click`、`wake off`、候选短语和 `vad` 状态。
- 点击 `check vad` 后，短时打开麦克风，只返回 `voice_detected` 或 `silence`，不向 `submitDialogue` 发送内容。
- 原有文字输入、云端 STT、本地 STT、CosyVoice/browser fallback 都保持可用。

## 后续扩展

- `listen_stop` 与持续监听分离。
- `abort` 接入正在播放的 TTS 打断。
- 情绪状态接入 TTS 风格参数。
- 将 bridge event 写入可选 runtime trace 文件。
- 评估是否接入真实 WebSocket adapter，但仍保持桌面虚拟设备边界。
- 后续从 `W3 keyword gate` 开始实现真实唤醒词 detector；再进入 W4 语义唤醒和 W5 播放门控增强。

## 2026-06-28 W3 前置条件同步

本方案已补齐进入 `W3 detector adapter` 的工程前置条件：

- 新增 `xiaozhi_style_wake_detector_adapter.v1`。
- 新增 `xiaozhi_style_wake_detector_state.v1`。
- 新增 3D 子粒子 `voice.wake_detector_adapter`。
- 右侧主体状态窗口设置区显示 `detector none`、`w3 not_configured`、`window closed`、`gate wake pause`。
- 默认 `adapter_id=none`、`enabled=false`，不启动后台持续监听。
- 详细进入清单见 `w3-detector-adapter-readiness.v1.md`。

当前结论：可以进入 W3 的 adapter 选型和最小接口实现；不能直接启用真实自动唤醒运行时。

## 2026-06-28 W3 验收条件与边界修正版

本段为当前最新规则，覆盖本文前面对唤醒短语和 TTS 播放门控的旧描述。

唤醒短语：
- `小张`
- `高手`
- `小天才`

明确不保留 `张博` 作为唤醒词。

TTS 播放期间的规则：
- TTS 播放期间暂停唤醒词 detector。
- 这不是屏蔽输入，不能把暂停唤醒词 detector 实现成关闭整条输入链路。
- 输入链路、唤醒词 detector、STT 转写和模型提交必须明确分层。
- 最终目标是边播边收，系统需要屏蔽的是自己正在播放的内容形成的回声或自我转写，而不是用户输入本身。

原始音频保存规则：
- 默认不保存原始音频。
- 保存原始音频必须另开确认项和可见开关。
- 没有用户确认前，不允许为了 W3 detector 调试而静默保存音频片段。

W3 验收条件调整：
- UI 显示当前短语列表时必须是 `小张 / 高手 / 小天才`。
- TTS 播放时 wake detector 状态必须进入暂停或等价的 detector-only gate。
- TTS 播放时输入链路不得被整体屏蔽。
- 回声抑制只针对系统播放内容。
- 关闭 W3 后麦克风 stream 必须停止。

## 2026-06-28 W3.0 执行阶段同步

当前路线 A 已完成 W3.0 最小执行阶段：

- 右下角 GUI 设置面板新增 `start w3 / stop w3`。
- W3.0 使用 `browser_phrase_match_reserved`，独立维护 wake detector 状态。
- 命中 `小张`、`高手`、`小天才` 后打开 `wake_window`，随后转交现有 STT。
- TTS 播放期间只暂停 wake detector，不关闭手动输入和正式 STT。
- 新增 `completion notice` 完成任务定制播报状态机，复用当前 TTS adapter，并生成 `voice_output_trace.v1`。
- 3D 粒子 OS 已补充 `voice.completion_notice`，并更新 `voice.wake_word_gate`、`voice.wake_detector_adapter` 为 W3.0 可执行表达。

仍未完成：

- `sherpa_onnx_reserved`、`openwakeword_reserved`、`porcupine_reserved` 等真实本地 keyword detector。
- 播放内容回声过滤的完整 full-duplex 能力。
- 原始音频保存确认项；当前仍默认不保存。
