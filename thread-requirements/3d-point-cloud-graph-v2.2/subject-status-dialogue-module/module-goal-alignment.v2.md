# 主体状态对话框模块目标对齐 v2

状态：新增需求整理稿，待用户确认后再进入实现计划。

更新时间：2026-06-25

## 一句话目标

主体状态对话框不是普通 AI 聊天框，也不是简单状态播报器。它应成为世界系统三维粒子 OS 的“主体沟通入口”：持续巡逻其他模块状态，理解用户自然语言和语音意图，把人的需求转成系统能处理的结构化语言，再用自然、简洁、第一人称的文字和语音反馈给用户。

当前阶段仍以“状态检查和巡逻”为主；未来阶段逐步扩展为世界模型的对话窗口、需求入口、语音主体入口和第三方沟通窗口。

## 模块定位

该模块同时承担五个角色：

1. 状态巡逻官  
   读取其他模块发布的状态卡，检查 fresh/stale/missing/conflict/error，向用户说明当前系统哪里正常、哪里缺失、哪里需要关注。

2. 自然语言接口  
   接收用户的口语化表达，不要求用户使用系统术语。模块负责把自然语言归纳为意图、对象、范围、优先级、证据和待确认点。

3. 需求翻译器  
   将用户需求转成系统可理解的结构化描述。当前先形成待确认目标和实现草案；未来可生成 `requirement_packet.v1` 并传给世界模型需求入口。

4. 语音主体入口  
   支持语音输入、持续监听、语音唤醒/对话判定、抗噪转写、自然语音输出、音色配置、声音克隆和拟情感表达。

5. 主体表达窗口  
   默认以“我”的身份表达系统状态和关注点，但不伪装未接入能力，不把未知内容说成事实，不直接越权执行动作。

## 核心体验目标

用户不应该感觉自己在操作一个传统表单或普通问答机器人。目标体验是：

- 用户可以直接问：“现在整体怎么样？”、“哪个模块卡住了？”、“把这个需求整理成系统能实现的目标。”
- 模块回答时像一个正在巡逻的系统主体：“我现在看到状态卡缺了 4 个，语音链路是可用的，但真实模型还需要 API 配置。”
- 语音输出要短、自然、有节奏，不朗读长报告。
- 文字区域可以给更完整的结构化说明、关注点和引用。
- 模块能说明自己知道什么、不知道什么、为什么不执行某些动作。
- 未来可以在持续监听中判断用户是否在对它说话，不必每次点击 STT。

## 能力层拆分

### 1. 状态巡逻层

目标：快速、低耦合地读取其他模块状态，不打断其他线程和模块进程。

输入：
- `module_status_card.v1`
- `status_snapshot.v1`
- `focused_graph_context`
- `runtime_health`
- `last_patrol_findings`

输出：
- `state_summary`
- `missing_module_report`
- `stale_module_report`
- `conflict_report`
- `risk_attention`
- `next_inspection_point`

规则：
- 只读状态卡，不主动扫描其他模块内部数据库。
- 状态卡缺失时明确说缺失，不猜测内部进展。
- 过期状态、冲突状态、坏 JSON、读取错误必须进入巡逻发现。
- 状态说明要能追溯到状态卡、3D 星点或配置项。

### 2. 语义理解层

目标：理解用户的自然语言，不要求用户说系统术语。

需要识别的输入类型：
- 状态询问：询问当前运行、模块健康、异常、缺失。
- 需求提出：用户希望系统新增、修改、接入或优化某能力。
- 操作意图：用户希望执行、打开、切换、检查或验证某对象。
- 纠错反馈：用户指出当前理解错误、界面异常或功能偏差。
- 对话闲聊：非任务型交流，但仍保持主体身份和边界。
- 第三方请求：未来第三方通过该窗口提出请求或反馈。

输出结构：
```text
dialogue_intent.v1
  raw_input
  input_kind: text | speech_transcript | continuous_speech
  intent_type
  target_modules
  target_graph_nodes
  requested_change
  urgency
  confidence
  ambiguity_points
  requires_confirmation
```

规则：
- 先理解意图，再决定是否查询状态、整理需求或提醒边界。
- 低置信度时先追问或整理待确认点。
- 用户需求不是事实，必须标记为候选目标。

### 3. 需求转译层

目标：把用户说的话转成系统能够执行规划的结构化语言。

当前阶段：
- 只做需求整理、目标对齐和待确认草案。
- 不写世界模型。
- 不创建真实 `requirement_packet.v1`。
- 不触发外部动作。

未来阶段：
- 生成 `requirement_packet.v1`。
- 送入 `world_model_requirement_inbox`。
- 由世界模型或审查模块决定拆解、归档、拒绝或实现。

建议输出：
```text
requirement_draft.v1
  source: subject_status_dialogue
  speaker
  raw_input_summary
  intent_summary
  target_scope
  affected_modules
  implementation_candidate
  open_questions
  boundary_notes
  confirmation_required
```

### 4. 对话编排层

目标：把状态、需求、边界和下一步整理成自然、可听、可读的反馈。

输出必须分层：
- `reply`：文字显示，允许稍完整。
- `voice_line`：语音输出，必须更短、更自然。
- `attention_log`：可审计关注点，不展示隐藏推理链。
- `status_refs`：引用到状态卡、星点、模块或配置。
- `missing_status`：明确缺失状态或未接入能力。
- `next_step_hint`：下一步建议或待确认点。

表达规则：
- 默认第一人称：“我看到……”、“我还没收到……”、“我建议先确认……”
- 避免普通 AI 味：“根据您的问题，我将为您……”这类表达不作为默认风格。
- 不把长篇报告直接念出来。
- 如果风险高或状态异常，语气可以更紧凑，但不能夸张。
- 如果用户是在探索需求，先帮用户归纳，再等确认。

### 5. 持续音频识别层

目标：未来不需要手动点击语音输入，模块可以持续监听环境音，并判断用户是否在跟它对话。

子能力：
- 持续监听开关。
- VAD 语音活动检测。
- 唤醒词或语义唤醒。
- 用户是否在对系统说话的判定。
- 端点检测：判断一句话何时结束。
- 噪声抑制。
- 回声消除，避免 TTS 输出被重新识别。
- 多说话人区分。
- 低延迟 streaming STT。
- 本地优先 fallback，网络不可用时保留文字输入。

建议管线：
```text
audio_stream
  -> noise_suppression
  -> vad
  -> wake_or_addressing_detector
  -> streaming_stt
  -> semantic_intent_detector
  -> dialogue_intent.v1
```

边界：
- 当前已实现手动 STT 入口。
- 持续监听未来实现，必须有清晰 UI 状态、暂停开关和可见权限提示。
- 不保存原始音频样本，除非未来用户单独确认某种训练或诊断模式。

### 6. 抗噪和语音提取层

目标：嘈杂环境下仍能提取用户有效语音。

能力项：
- 背景噪声抑制。
- 键盘、风扇、环境声过滤。
- 人声增强。
- 远近场麦克风适配。
- 多通道输入预留。
- 说话人识别预留。
- 语音置信度和低置信度追问。

输出：
```text
speech_segment.v1
  transcript
  confidence
  noise_level
  speaker_hint
  start_ms
  end_ms
  is_addressed_to_system
```

### 7. 语音输出和拟情感层

目标：语音输出不是机械朗读，而是根据系统状态、内容含义和用户语境选择合适的语气。

能力项：
- TTS 插件可替换。
- 音色选择。
- 声音克隆。
- 语速、停顿、音量控制。
- 情绪/语气标签：calm、focused、warm、urgent、reflective。
- 根据内容自动生成 `emotion_hint`。
- 支持被用户打断，未来实现 barge-in。

建议输出：
```text
voice_response_plan.v1
  voice_line
  voice_profile_id
  emotion_hint
  speed
  pitch
  pause_style
  tts_adapter
  fallback
```

规则：
- 语音默认读 `voice_line`，不直接读完整 `reply`。
- 状态正常时短而平稳。
- 状态异常时清晰、直接、不过度情绪化。
- 用户提出探索性需求时语气可以更协作、更温和。
- 声音克隆和情绪控制必须作为独立 voice profile 管理，不混进模型 prompt。

### 8. 模型接入层

目标：为该模块配置专用小模型或本地模型，优先低延迟和稳定结构化输出。

建议不是单模型承担全部能力，而是分层：
- 快速意图识别：小模型或本地分类器。
- 状态摘要编排：低延迟小模型。
- 需求转译：稍强模型，可在用户确认前后台整理。
- 语音唤醒/是否对话判定：本地轻量模型或规则/VAD 优先。
- TTS 情绪规划：可由对话模型输出 `emotion_hint`，也可由单独规则层生成。

模型输入应尽量短：
- 当前焦点。
- 最新 `status_snapshot` 摘要。
- 用户意图。
- 缺失/风险项。
- 身份规则。

模型不应该直接读取全部图谱全文或完整日志。

### 9. 自我意识图谱桥接层

目标：当自我意识图谱接入后，模块按系统整体目标和主体立场沟通，而不是只做单次问答。

输入：
- `self_awareness_profile`
- `goal_constellation`
- `value_boundary`
- `style_profile`
- `current_self_state`

当前 fallback：
- 使用默认主体身份规则。
- 明确说明完整自我意识图谱尚未接入。
- 仍可进行自然、拟人、第一人称交流，但不伪装已有完整意识图谱。

### 10. 实时信息处理层

该模块需要处理实时信息，但范围必须分清。

需要实时处理：
- 其他模块状态卡更新。
- 当前状态快照。
- 3D 粒子当前焦点和用户选中对象。
- 语音输入流、VAD、转写片段。
- 当前对话上下文。
- 当前 TTS 播放状态。
- 模块缺失、过期、冲突、错误。

不应由本模块直接处理：
- 原始外部网络实时信息。
- 原始人际图谱数据库。
- 原始事件图谱数据库。
- 世界核心内部写入。
- 外部动作执行。

外部实时信息未来应由外部世界/感知/网络模块处理，转成状态卡、事件摘要或图谱节点后，再由本模块只读引用。

## 输入端口

| 端口 | 内容 | 当前状态 |
| --- | --- | --- |
| `input.text` | 用户文字输入 | 已有 |
| `input.speech_transcript` | 手动 STT 后的转写文本 | 已有第一版 |
| `input.continuous_audio_stream` | 持续监听音频流 | 未来 |
| `input.dialogue_intent` | 语义理解后的意图结构 | 待设计 |
| `input.status_snapshot` | 总系统状态快照 | 已有 |
| `input.module_status_card` | 各模块状态卡 | 已有只读读取 |
| `input.focus_context` | 3D 粒子当前焦点 | 已有 |
| `input.self_awareness_profile` | 自我意识图谱摘要 | 未来 |
| `input.voice_profile` | 音色、克隆、语速、语气配置 | 未来 |

## 输出端口

| 端口 | 内容 | 当前状态 |
| --- | --- | --- |
| `output.reply` | 文字回复 | 已有 |
| `output.voice_line` | 短语音句 | 已有基础版 |
| `output.attention_log` | 可审计关注点 | 已有 |
| `output.status_refs` | 状态引用 | 已有 |
| `output.missing_status` | 缺失状态 | 已有 |
| `output.requirement_draft` | 待确认需求草案 | 待设计 |
| `output.requirement_packet` | 未来传递给世界模型的需求包 | 未来 |
| `output.voice_response_plan` | TTS 音色/情感/语速计划 | 未来 |
| `output.patrol_alert` | 巡逻异常提示 | 待强化 |

## 3D 粒子 OS 映射

`status-dialogue-system` 星云建议拆为以下子云团：

- `role.status_patrol_officer`
- `role.natural_language_interface`
- `role.requirement_translator`
- `role.world_model_dialogue_window`
- `state.module_status_cards`
- `state.status_snapshot_reader`
- `state.patrol_findings`
- `semantic.intent_detector`
- `semantic.requirement_draft_builder`
- `semantic.confirmation_gate`
- `audio.continuous_listener`
- `audio.vad_endpointing`
- `audio.noise_suppression`
- `audio.speaker_addressing`
- `voice.stt_adapter`
- `voice.tts_adapter`
- `voice.voice_profile`
- `voice.clone_profile`
- `voice.emotion_control`
- `dialogue.response_composer`
- `dialogue.attention_log`
- `dialogue.natural_style_guard`
- `awareness.self_graph_bridge`
- `awareness.goal_constellation`
- `boundary.read_only_patrol`
- `boundary.no_world_write`
- `boundary.no_external_action`
- `future.requirement_packet`
- `future.world_model_requirement_inbox`

每个子云团都需要在粒子目录中显示：
- 输入。
- 输出。
- 当前状态。
- 上游来源。
- 下游去向。
- 边界。
- 缺失项。

## 当前阶段与未来阶段

### 当前已实现或正在确认

- 右侧主体状态对话框。
- 文字输入输出。
- 浏览器 STT 第一版。
- 浏览器 TTS 第一版。
- `status_snapshot.v1` 只读状态读取。
- 本地 fallback。
- 远程 OpenAI-compatible 小模型接入位。
- 第一人称身份规则初版。
- 3D 粒子 OS 中的基础映射。

### 下一阶段建议确认范围

建议下一阶段不要直接做全部最终能力，而是先做这五项：

1. 目标语义结构：新增 `dialogue_intent.v1` 和 `requirement_draft.v1`。
2. 对话编排增强：让回复按“状态摘要、用户意图、缺失/风险、下一步”自然组合。
3. 语音交互体验增强：保留手动 STT，但为持续监听设计 UI 状态和配置位。
4. TTS 输出增强：新增 `voice_response_plan.v1`，先用规则生成 emotion_hint。
5. 3D 映射增强：把上述能力完整投射到 `status-dialogue-system` 子云团和目录。

### 未来阶段

- 持续监听。
- 唤醒词或语义唤醒。
- 嘈杂环境语音提取。
- 本地 STT/TTS 插件。
- 声音克隆。
- 拟情感语音。
- 自我意识图谱接入。
- 需求包传递给世界模型。
- 第三方对话窗口。

## 待确认问题

1. 这个模块是否默认允许“需求整理”，但在你确认前不创建正式 `requirement_packet.v1`？
2. 持续监听未来是否默认关闭，由用户显式开启？
3. 唤醒方式优先采用“唤醒词”还是“语义判断我是否在跟它说话”？
4. 语音输出默认是否应该比文字回复短 50% 以上？
5. 声音克隆是否只作为插件能力预留，暂不进入当前实现？
6. 需求转译是否需要在 UI 中显示“人类原话 -> 系统语言 -> 待确认目标”的三段式？

## 确认后的实现方向

待用户确认后，进入下一版实现计划。实现计划应拆成：

1. 契约层：`dialogue_intent.v1`、`requirement_draft.v1`、`voice_response_plan.v1`。
2. UI 层：巡逻窗口加入需求转译视图、语音状态视图、持续监听预留状态。
3. 模型层：低延迟小模型 prompt 和结构化输出 guard。
4. 音频层：当前手动 STT 保持，新增持续监听配置骨架。
5. 3D 映射层：更新星云、子云团、粒子目录和输入输出追溯。
6. 验证层：状态读取、语义转译、语音输入、语音输出、边界不越权。
