# 主体状态对话框完整对话逻辑与接口设计 v1

状态：方案确认稿，等待用户确认后再进入实现。

更新时间：2026-06-27

## 目标

本方案回答两个问题：

1. 当前主体状态对话框的真实对话逻辑是什么。
2. 按用户目标，它应该升级成什么样的完整语音对话模块。

该模块的最终定位不是普通聊天助手，也不是机械状态播报器，而是世界系统三维粒子 OS 的主体沟通入口。它需要能听懂用户的自然语言和语音，读取自有和其他模块的状态，组织成自然、有情绪温度、有证据链的第一人称反馈，并在未来把用户需求转译为系统可处理的结构化目标和命令草案。

当前确认范围仍是方案设计，不执行代码实现，不创建真实 `requirement_packet.v1`，不写入世界模型、人际关系图谱、事件图谱或外部动作通道。

## 当前真实逻辑

当前实现主要分布在：

- `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\ZhinengConsole.tsx`
- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\contracts.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\conversation-memory.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\main\index.ts`

### 当前输入链路

文字输入：

```text
用户文字
  -> dialogueInput
  -> submitDialogue(input, "text")
  -> requestStatusDialogueSnapshot(expectedStatusModules)
  -> requestStatusDialogueModel(...)
  -> update conversation_memory
  -> UI reply
  -> speakDialogue(...)
```

语音输入：

```text
用户点击 STT
  -> selectedSttAdapter
  -> 默认 cloud: zhineng:status-dialogue:chrome-stt:transcribe
  -> 成功 transcript 后 submitDialogue(transcript, "speech_transcript")
  -> 失败时 UI 显示 no-speech/network/permission 等诊断
```

本地 STT 备用：

```text
手动选择 local
  -> getUserMedia + MediaRecorder
  -> encodeWavDataUrl
  -> zhineng:status-dialogue:stt:transcribe
  -> local_whisper_ipc
  -> transcript
  -> submitDialogue(transcript, "speech_transcript")
```

### 当前状态读取链路

```text
3D graph nodes
  -> buildExpectedStatusModules
  -> zhineng:status-dialogue:snapshot:get
  -> runtime/status-cards/*.json 只读读取
  -> StatusSnapshot
  -> StatusDialogueContext.statusSnapshot
```

如果 Electron IPC 不可用，走浏览器预览 fallback。当前 `runtime/status-cards` 不完整时，系统会返回大量 missing，因此回复容易变成“状态卡缺失”的框架性回答。

### 当前模型链路

```text
StatusDialogueContext
  -> STATUS_DIALOGUE_SYSTEM_PROMPT
  -> buildStatusDialogueUserPrompt
  -> zhineng:status-dialogue:complete
  -> OpenAI-compatible provider
  -> parseStatusDialogueModelOutput
  -> guardStatusDialogueOutput
```

模型要求输出 JSON：

```json
{
  "reply": "第一人称状态回答",
  "voice": "1-3句语音短句",
  "thoughts": ["可见关注点摘要"],
  "status_refs": ["状态引用"],
  "missing_status": ["缺失状态"]
}
```

如果模型不可用，走本地 fallback。fallback 会根据当前 3D 焦点、状态卡 fresh/stale/missing、owner、gate、compass 和用户是否问风险或接口来生成固定模板回复。

### 当前语音输出链路

```text
submitDialogue
  -> speakVoiceAck("我听到了，正在检查状态。")
  -> request model/fallback
  -> speakDialogue(StatusDialogueOutput)
  -> voice mode:
       cosyvoice_short
       browser_fast
       cosyvoice_full
  -> zhineng:status-dialogue:tts:synthesize 或 browser speechSynthesis fallback
```

当前已经解决的关键点：

- ack 和 final 默认保持同一音色策略。
- CosyVoice local_http 已有 health 和 synthesize IPC。
- TTS 只朗读 `voiceText` 或裁剪后的 voice line，不朗读完整隐藏上下文。

### 当前短上下文记忆

当前短上下文不是完整聊天记录，而是目标态记忆：

```text
conversation_memory.v1
  active_goal
  user_focus[]
  current_focus_node
  confirmed_facts[]
  open_questions[]
  next_expected_result
  latest_user_intent
  status_refs[]
  missing_status[]
```

它存储在 renderer localStorage，不写文件系统，不写世界模型。

### 当前边界

当前 `DEFAULT_STATUS_DIALOGUE_CONFIG.mode = "patrol_only"`。

允许：

- 文字输入。
- 手动语音输入。
- 语音输出。
- 读取状态卡摘要。
- 读取 3D 粒子当前焦点。
- 第一人称状态说明。
- 记录短上下文目标态。

不允许：

- 创建真实 `requirement_packet.v1`。
- 写入世界模型。
- 读取真实人际或事件图谱全文。
- 触发外部动作。
- 把用户需求当成已确认事实。
- 保存原始音频样本。

## 当前主要问题

### 1. 回复逻辑太短

原因不是单一模型问题，而是多层策略叠加：

- 系统 prompt 强调 `concise`。
- fallback 是固定状态模板。
- 状态卡源缺失，无法提供真实巡检证据。
- `cosyvoice_short` 把语音压到很短的最终句。

### 2. 状态巡检证据不足

当前对话框能读取 `status_snapshot.v1`，但许多模块没有发布 `module_status_card.v1`。当用户问“当前哪里有问题”时，模块只能说缺失，而不是基于真实状态给出改进方向。

### 3. 语音输入稳定性受 Chrome Web Speech 限制

当前 cloud STT 是 Chrome Web Speech Bridge。日志表明它会出现 `no-speech`，即桥接页已打开麦克风流，但未检测到可识别人声。它不能显式选择输入设备，也不能在开始前证明麦克风电平有效。

### 4. 命令传达尚未建立结构化门控

当前只能巡逻和对齐需求，不能把需求传到世界模型。未来需要从“自然语言需求”到“结构化草案”再到“用户确认后进入世界模型入口”的门控链路。

### 5. 常规语音助手能力尚未完整

已具备手动 STT/TTS，但还缺：

- 持续监听。
- VAD。
- 唤醒词或语义唤醒。
- 端点检测。
- 噪声抑制。
- 回声消除。
- 打断 TTS。
- 多轮语音会话状态。
- 声音克隆和情感化语音策略。

## 目标对话逻辑

目标逻辑分为九层。

### 1. 入口层

统一接收所有输入，不让不同输入各走一套不可追溯路径。

输入来源：

| 输入 | 当前状态 | 目标状态 |
| --- | --- | --- |
| `text_input` | 已有 | 保持 |
| `speech_transcript` | 已有 | 增强稳定性和置信度 |
| `continuous_audio_stream` | 未实现 | 未来可开关 |
| `third_party_message` | 未实现 | 未来接入第三方窗口 |
| `graph_focus_event` | 已有焦点上下文 | 未来可作为主动巡逻触发 |

统一封装为：

```text
DialogueInputEnvelope
  schema
  user_query
  input_kind
  audio_stream_ref?
  received_at
  source
```

建议新增：

```text
DialogueInputMeta.v1
  locale
  confidence
  noise_level
  speaker_hint
  wake_state
  interruption_state
```

### 2. 语音前处理层

目标是保证“听见用户”比“模型回答”更早稳定。

目标管线：

```text
audio_stream
  -> input_device_check
  -> audio_level_probe
  -> noise_suppression
  -> vad
  -> endpointing
  -> stt_adapter
  -> transcript_confidence
```

建议新增状态：

```text
SpeechCaptureState.v1
  adapter
  device_label
  level_rms
  noise_level
  vad_state
  last_error
  retry_count
```

关键规则：

- 点击 STT 后先做电平预检。
- `no-speech` 时自动重试一次，但不无限重试。
- STT 失败要说明是权限、网络、静音、不可识别还是超时。
- 不保存原始音频，除非未来单独确认诊断模式。

### 3. 意图理解层

自然语言不直接进入执行。先识别它是什么类型。

建议新增：

```text
dialogue_intent.v1
  raw_input
  normalized_summary
  intent_type:
    chat
    status_patrol
    progress_audit
    troubleshooting
    requirement_alignment
    command_request
    graph_navigation
    voice_control
    third_party_request
  target_modules[]
  target_graph_nodes[]
  requested_change
  urgency
  confidence
  ambiguity_points[]
  requires_confirmation
```

意图规则：

- 状态问题先读状态卡。
- 故障问题先看日志和证据。
- 新需求先整理目标，不当成事实。
- 命令请求先转成命令草案，不直接执行。
- 闲聊也保持主体身份，但不能虚构系统能力。

### 4. 上下文组装层

模型输入要短、准、可追溯。

上下文来源：

| 来源 | 当前状态 | 用途 |
| --- | --- | --- |
| `StatusSnapshot` | 已有 | 全局状态卡摘要 |
| `focused_graph_context` | 已有 | 当前粒子焦点 |
| `conversation_memory` | 已有 | 用户目标、关注点、已确认结果 |
| `SelfAwarenessProfileRef` | 默认已有 | 第一人称立场 |
| `voice_runtime_state` | 部分已有 | STT/TTS 状态、延迟、错误 |
| `runtime status-card bridge` | 待实现 | 真实模块进度和状态 |

建议组装为：

```text
DialogueWorkingContext.v1
  input
  intent
  focus_context
  status_snapshot_summary
  top_status_cards[]
  conversation_memory
  voice_runtime_state
  active_boundaries[]
```

规则：

- 不把完整日志塞给模型。
- 不给模型 API key。
- 不注入隐藏推理链。
- 缺失状态必须显式传入，不让模型猜。

### 5. 路由层

不同意图走不同 lane。

| Lane | 用途 | 当前动作 |
| --- | --- | --- |
| `chat_lane` | 常规交流 | 可回答，保持身份边界 |
| `status_patrol_lane` | 状态巡逻 | 读 snapshot 和状态卡 |
| `progress_audit_lane` | 节点和进度审查 | 读状态卡桥接结果 |
| `troubleshooting_lane` | 故障诊断 | 先读日志和证据，再给结论 |
| `requirement_alignment_lane` | 需求目标整理 | 输出 `requirement_draft.v1` |
| `command_request_lane` | 命令传达 | 当前只输出 `command_proposal.v1` |
| `graph_navigation_lane` | 3D 粒子导航 | 聚焦/下钻/解释节点 |
| `voice_control_lane` | 音色、STT/TTS 设置 | 调整本模块 UI 状态 |
| `handoff_lane` | 未来世界模型入口 | 当前禁用，只预留 |

### 6. 巡检执行层

状态巡检要基于状态卡和可追溯来源，不读取模块内部全文。

当前已有：

```text
runtime/status-cards/*.json
  -> zhineng:status-dialogue:snapshot:get
  -> StatusSnapshot
```

建议补齐状态卡桥接：

```text
runtime/state/current-status.json
runtime/state/operator-note.md
runtime/state/run-events.jsonl
runtime/status-dialogue-logs/*.jsonl
runtime/voice-loop-probes/*.json
runtime/pt028-real-observation-gui-states/latest.json
runtime/pt028-gui-decision-states/latest.json
  -> status-card-bridge
  -> runtime/status-cards/*.json
```

输出：

```text
PatrolFindingFrame.v1
  conclusion
  evidence_refs[]
  impact
  next_inspection
  stale_or_missing[]
```

### 7. 回复编排层

回复不应只是一句状态，也不应变成长报告。建议统一为：

```text
PatrolNarrativeFrame.v1
  user_intent_summary
  inspection_scope
  conclusion
  evidence
  impact
  next_step
  confirmation_needed
  boundary_note
```

文字输出建议：

- 250 到 700 中文字。
- 按“我听到什么、我检查了什么、结论是什么、证据在哪里、影响是什么、下一步建议是什么”组织。
- 必须保留 `status_refs` 和 `missing_status`。

语音输出建议：

- 默认 1 到 3 句。
- 60 到 140 中文字。
- 只说结论、影响和下一步，不读完整技术细节。
- 状态异常时可以更紧凑，状态正常时更平稳。

可见日志建议：

- 3 到 7 条。
- 只写关注点摘要、证据、边界、下一步。
- 不展示隐藏推理链。

### 8. 命令传达层

未来支持命令传达，但必须先进入草案和确认。

当前阶段：

```text
user command-like input
  -> dialogue_intent.v1
  -> command_proposal.v1
  -> UI 显示待确认
  -> 不执行
```

未来阶段：

```text
confirmed command_proposal.v1
  -> requirement_packet.v1
  -> world_model_requirement_inbox
  -> world_model_review_gate
  -> downstream planning or execution module
```

建议新增：

```text
command_proposal.v1
  proposal_id
  source_turn_id
  raw_user_request
  interpreted_goal
  target_system
  target_nodes[]
  expected_result
  risk_level
  required_status_refs[]
  missing_preconditions[]
  confirmation_required
  execution_allowed: false
```

门控规则：

- 当前所有 command proposal 的 `execution_allowed` 必须是 `false`。
- 用户确认前不创建正式 `requirement_packet.v1`。
- 即使未来创建需求包，也只是交给世界模型审查，不由对话框直接执行。
- 外部动作必须经过行动层和末端安全模块。

### 9. TTS 播报层

语音输出必须成为对话模块的协议，而不是临时附加动作。

建议新增：

```text
CompletionTtsNotice.v1
  turn_id
  reason
  required: true
  text
  adapter
  voice_profile_id
  repeat_count
  fallback
  playback_result
```

本线程固定规则：

- 每次我完成你的本轮请求后，都必须执行一次对应内容的 TTS 播报。
- 播报内容必须和本轮任务匹配，不使用固定套话。
- 如果你指定播报文本，优先使用你指定的文本。
- 如果 TTS 服务不可用，必须报告 fallback 或未能播放的原因。
- 本轮指定播报文本为：`方案已经制作完成，请确认。`

## 上游接口

| 上游 | 接口 | 当前状态 | 边界 |
| --- | --- | --- | --- |
| 用户文字 | `DialogueInputEnvelope.input_kind=text` | 已有 | UI 内输入，不执行动作 |
| 用户语音 | `chrome_stt_bridge` / `local_whisper_ipc` | 已有 | 不保存原始音频 |
| 3D 粒子焦点 | `focused_graph_context` | 已有 | 当前是独立视觉投射 |
| 状态卡 | `runtime/status-cards/*.json` | 已有读取 | 摘要级，只读 |
| 模型配置 | OpenAI-compatible settings | 已有 | 密钥不回传 renderer |
| TTS 服务 | CosyVoice local_http | 已有 | localhost，失败 fallback |
| 短上下文 | localStorage memory card | 已有 | 不存完整聊天和音频 |
| 自我意识图谱 | `SelfAwarenessProfileRef` | 默认 profile | 完整图谱未接入 |
| 世界模型需求入口 | `world_model_requirement_inbox` | 未启用 | 当前只预留 |

## 下游接口

| 下游 | 输出 | 当前状态 | 边界 |
| --- | --- | --- | --- |
| 对话 UI | `StatusDialogueOutput.reply` | 已有 | 可稍完整 |
| 语音播放 | `StatusDialogueOutput.voiceText` | 已有 | 只播语音短句 |
| 可见日志 | `thoughts[]` | 已有 | 不展示隐藏推理 |
| 状态引用 | `statusRefs[]` | 已有 | 需能追溯到卡或星点 |
| 缺失项 | `missingStatus[]` | 已有 | 缺失必须明说 |
| 短上下文 | `conversation_memory.v1` | 已有 | 只存目标态 |
| 3D 星云 | `status-dialogue-system` 子粒子 | 已有基础 | 后续补全路由粒子 |
| 需求草案 | `requirement_draft.v1` | 待实现 | 不等于执行 |
| 命令草案 | `command_proposal.v1` | 待实现 | 当前 execution_allowed=false |
| 世界模型 | `requirement_packet.v1` | 未来 | 需用户确认和审查 gate |

## 运行状态机

建议将对话模块统一成一个可观测状态机：

```text
idle
  -> listening
  -> transcribing
  -> intent_understanding
  -> context_assembly
  -> route_decision
  -> status_read_or_draft_build
  -> response_compose
  -> confirmation_waiting? 
  -> speaking
  -> memory_update
  -> audit_log_update
  -> idle
```

错误恢复：

```text
permission_error -> text_input fallback
no_speech -> level_hint + retry_once + text_input fallback
stt_network_error -> local_stt optional fallback
model_error -> local_first_person_patrol_fallback
tts_error -> browser_speech_synthesis or text_only fallback
status_card_error -> read_errors + missing_status
ambiguous_command -> confirmation_waiting
blocked_gate -> no execution + explain gate
```

## 3D 粒子 OS 表达

当前不需要新建孤立星云，继续归属 `status-dialogue-system`。

建议补齐子云团：

| 子云团 | 粒子 | 表达 |
| --- | --- | --- |
| `input_cloud` | `input.text`、`input.speech`、`input.third_party` | 输入来源 |
| `speech_cloud` | `speech.device_probe`、`speech.vad`、`voice.stt_adapter` | 语音输入前处理 |
| `intent_cloud` | `dialogue.intent_detector`、`dialogue.route_decision` | 意图识别和路由 |
| `status_cloud` | `state.status_snapshot`、`state.status_card_bridge` | 状态巡检 |
| `memory_cloud` | `conversation_memory.*` | 目标态短上下文 |
| `compose_cloud` | `patrol_narrative`、`identity_guard`、`emotion_policy` | 回复编排 |
| `voice_cloud` | `voice.tts_adapter`、`voice.response_plan`、`voice.clone_profile` | 语音输出 |
| `command_cloud` | `requirement_draft`、`command_proposal`、`confirmation_gate` | 命令与需求草案 |
| `handoff_cloud` | `requirement_packet`、`world_model_inbox` | 未来世界模型传递 |
| `boundary_cloud` | `no_world_write`、`no_external_action`、`safety_gate` | 边界和安全 |

目录必须能查：

- 输入来源。
- 输出去向。
- 当前状态。
- 所属 owner。
- gate。
- refs。
- 当前是否已实现。
- 当前是否只预留。

## 分阶段实施建议

### Phase A：对话逻辑契约

新增契约：

- `dialogue_intent.v1`
- `DialogueWorkingContext.v1`
- `PatrolNarrativeFrame.v1`
- `requirement_draft.v1`
- `command_proposal.v1`
- `CompletionTtsNotice.v1`

不改变外部行为，只加类型、文档和 guard。

### Phase B：状态巡检证据增强

实现只读状态卡桥接器：

- `world-state`
- `status-dialogue-system`
- `perception-fusion`
- `action-layer`

让对话不再只依赖 missing 计数。

### Phase C：回复编排升级

升级 prompt 和 fallback：

- 结论。
- 证据。
- 影响。
- 下一步。
- 待确认。
- 情绪语气。

目标是文字更有逻辑，语音更自然。

### Phase D：语音体验增强

先做低风险增强：

- 麦克风电平预检。
- `no-speech` 自动重试一次。
- `cosyvoice_balanced` 作为最终语音模式。
- TTS 播放结果进入 output trace。

再做未来能力：

- 持续监听。
- VAD。
- 唤醒词或语义唤醒。
- 回声消除。
- 打断 TTS。
- 声音克隆。

### Phase E：需求和命令草案

实现需求整理，不执行：

- 用户原话。
- 系统语言。
- 目标。
- 影响范围。
- 待确认项。
- 不满足前置条件。

输出 `requirement_draft.v1` 或 `command_proposal.v1`，但不创建正式 `requirement_packet.v1`。

### Phase F：世界模型传递

等用户确认且世界模型入口完成后再启用：

- 创建正式 `requirement_packet.v1`。
- 送入 `world_model_requirement_inbox`。
- 由世界模型 review gate 决定下一步。

## 验证方案

文档验证：

```powershell
rg "dialogue_intent|command_proposal|CompletionTtsNotice|每次我完成你的本轮请求后|world_model_requirement_inbox" D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\subject-status-dialogue-module
```

边界验证：

```powershell
rg "requirement_packet\.v1" D:\zhineng\sightflow-desktop-agent-main\src
```

当前方案阶段不应新增运行代码，也不应创建正式需求包。

实现阶段验证：

```powershell
npm.cmd run typecheck
npm.cmd run build
```

运行验证：

- 打开 `http://[::1]:5173/?window=zhineng-graph`。
- 确认右侧主体状态对话框仍可文字输入。
- 确认 STT 成功后进入同一对话链路。
- 确认 TTS 播放同音色、同策略。
- 确认状态卡 fresh/stale/missing 可见。
- 确认 `status-dialogue-system` 星云和目录可追溯输入输出。

## 需要用户确认

1. 是否确认先实现 Phase A 到 Phase C，即先补契约、状态巡检证据和回复编排，不立即做持续监听。
2. 是否确认 Phase D 中优先做麦克风电平预检、`no-speech` 重试和 `cosyvoice_balanced`。
3. 是否确认需求和命令先只输出草案，不创建正式 `requirement_packet.v1`，不传递世界模型。
4. 是否确认每次本线程完成你的请求后都必须执行 TTS 播报，播报文本按当轮任务动态生成。
5. 是否确认 `status-dialogue-system` 星云继续作为唯一归属位置，不新建孤立对话星云。

## 本轮结论

当前模块已经具备基础闭环：文字、手动语音、模型/fallback、状态快照、短上下文、TTS 和 3D 基础映射。但它还没有达到目标中的“自然语音沟通、真实巡检证据、需求转译、命令草案、持续监听和拟情感输出”。

下一步不应盲目加大模型，而应先建立对话意图、巡检证据、回复编排和语音播放协议。这样它会从“能回复的状态框”升级为“能巡逻、能解释、能整理需求、能以第一人称自然沟通的主体入口”。
