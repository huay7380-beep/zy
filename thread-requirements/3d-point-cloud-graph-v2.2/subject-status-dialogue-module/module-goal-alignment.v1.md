# 主体状态对话框模块目标对齐 v1

状态：需求补充整理，未进入实现。

## 一句话目标

把三维粒子系统右侧的主体状态对话框，升级为可接入小模型、可语音输入输出、可读取模块状态、可承接自我意识图谱方向的“我”的状态表达模块。当前阶段只负责状态检查和巡逻；未来阶段允许作为世界模型与用户或第三方的对话窗口，并把需求结构化传递给世界模型。

## 核心体验

用户向它询问当前系统状态时，它不以旁白身份播报“系统正在……”，而以主体身份回答：

- “我现在只读全局状态，没有执行外部动作。”
- “我看到当前焦点在世界核心，下一步可以检查状态卡缺失项。”
- “我还没有接入真实人际图谱，所以不会把候选关系当成事实。”

文字输出可以稍完整，语音输出必须更短、更像实时回应。语音输入通过可替换 STT 插件进入同一文字需求管线。日志区域只展示可审计的关注点摘要，不展示隐藏推理链。

## 四条能力主线

### 1. 小模型处理层

目标：允许该模块独立配置专用小模型，不强占其他模块的大模型链路。

需要支持两类模型：

- 线上小模型：通过 OpenAI-compatible HTTP adapter 接入第三方模型服务。
- 本地小模型：通过本地 adapter 接入 Ollama、llama.cpp、vLLM、LM Studio 或后续本地运行时。

建议抽象：

```text
StatusDialogueModelAdapter
  input: user_query + focus_context + status_snapshot + self_awareness_profile
  output: reply + voice_line + attention_log + confidence + source
```

边界：

- 模型只负责表达、摘要和状态问答。
- 模型不直接执行动作、不发送消息、不控制设备、不写入其他模块。
- 模型输出必须回到结构化结果，再由 UI 展示。

### 2. 语音输出层

目标：语音不只是朗读文字，而是用简洁第一人称表达当前主体状态。语音输入和语音输出都必须是可替换插件。

需要能力：

- 通过 STT 插件接收语音输入，并转成 `input.user_query`。
- 可选择音色。
- 支持本地或服务化 TTS。
- 优先支持低延迟实时输出。
- 增强目标支持语音克隆、语气控制、情绪化表达。
- 语音内容使用 `voice_line`，不直接朗读长文本 `reply`。

建议抽象：

```text
StatusDialogueVoiceAdapter
  input: voice_line + voice_profile + emotion_hint + speed + locale
  output: playable_audio + duration + provider + fallback_reason
```

```text
StatusDialogueSpeechInputAdapter
  input: audio_stream + language + vad + realtime
  output: transcript + confidence + segments + provider
```

边界：

- 没有 STT 时保留文字输入。
- 没有 TTS 时保留浏览器 SpeechSynthesis 或静音文字模式。
- 语音克隆需要独立 voice_profile，不与模型提示词混在一起。
- 情绪表达由状态标签驱动，例如 calm、focused、urgent、warm。

### 3. 其他模块状态读取层

目标：让主体状态对话框快速读取其他模块状态，同时不打断其他模块工作。

核心设计：其他模块不被对话框主动扫描内部细节，而是主动生成状态卡。

```text
其他模块 -> module_status_card.v1 -> status_snapshot.v1 -> 主体状态对话框
```

优势：

- 对话框只读状态快照，效率高。
- 其他线程和模块可以并行开发，不需要被当前模块耦合。
- 状态卡缺失时，对话框可以明确说“我还没有收到该模块状态”。
- 状态卡可以成为 3D 粒子图中的状态端口。

### 4. 自我意识图谱桥接层

目标：当自我意识图谱存在时，对话框按整体系统目标和主体立场表达，而不是只围绕单次小任务回答。

需要读取：

- self_awareness_profile：我是谁、我当前的主体立场。
- goal_constellation：系统总体目标、长期目标、当前目标权重。
- value_boundary：表达边界、事实边界、行动边界。
- style_profile：第一人称表达风格、语气、简洁度。

缺失时的回退：

- 使用本地默认主体配置。
- 明确说明“我还没有接入完整自我意识图谱”。
- 仍可进行基本沟通和拟人表达，但不伪造已存在的意识图谱内容。

### 5. 需求传递窗口层

目标：未来允许主体状态对话框成为世界模型的需求入口，但当前只负责状态检查和巡逻。

当前阶段：

- 接收用户新需求后，只做目标对齐、记录和确认。
- 不直接改写世界模型。
- 不把需求当成事实。
- 不启动外部动作。

未来阶段：

- 将用户或第三方输入转为 `requirement_packet.v1`。
- 传递给 `world_model_requirement_inbox`。
- 由世界模型审查、归档、拆解或拒绝。
- 对话框只返回传递状态和审查状态。

## 3D 粒子图映射建议

应在 `status-dialogue-system` 星云下新增或确认以下星点：

- `model_lane.remote_small_model`
- `model_lane.local_small_model`
- `model_adapter.openai_compatible`
- `model_adapter.local_runtime`
- `voice.tts_adapter`
- `voice.stt_adapter`
- `voice.audio_input`
- `voice.voice_profile`
- `voice.clone_profile`
- `voice.emotion_control`
- `state_port.module_status_card`
- `state_port.status_snapshot`
- `state_port.missing_status_fallback`
- `awareness.self_graph_bridge`
- `awareness.goal_constellation`
- `awareness.value_boundary`
- `constraint.first_person_subject`
- `constraint.no_narrator`
- `constraint.no_action_execution`
- `constraint.audit_attention_log_only`
- `fallback.basic_personified_dialogue`
- `role.status_patrol_officer`
- `role.world_model_dialogue_window`
- `future.requirement_forwarding`
- `port.requirement_packet`
- `port.world_model_requirement_inbox`
- `gate.world_model_review_gate`

## 输入端口

| 端口 | 内容 | 来源 |
| --- | --- | --- |
| `input.user_query` | 用户文字或语音转写问题 | 对话框 |
| `input.audio_stream` | 用户语音输入流 | STT 插件 |
| `input.focus_context` | 当前 3D 粒子焦点、层级、选中星云 | 3D UI |
| `input.status_snapshot` | 所有模块状态卡聚合后的快照 | 状态读取层 |
| `input.self_awareness_profile` | 自我意识图谱摘要或默认主体配置 | 自我意识图谱桥 |
| `input.voice_profile` | 音色、语速、情绪偏好 | 语音配置 |

## 输出端口

| 端口 | 内容 | 用途 |
| --- | --- | --- |
| `output.reply` | 简洁第一人称文字回答 | UI 对话日志 |
| `output.voice_line` | 更短的第一人称语音句 | TTS |
| `output.attention_log` | 可审计关注点摘要 | 日志区域 |
| `output.status_refs` | 本次回答引用的状态卡/星点 | 可追踪性 |
| `output.missing_status` | 缺失状态说明 | 边界提示 |
| `output.requirement_packet` | 未来传递给世界模型的需求包 | 世界模型需求入口 |

## 当前不进入的范围

- 不立即接入真实人际关系图谱。
- 不直接读取其他模块内部数据库。
- 不执行写入、发送、设备控制、外部网页操作。
- 不把语音克隆、情绪控制一次性做到最终形态。
- 不把关注点日志做成隐藏推理链展示。
- 当前不把需求传递给世界模型，只记录和对齐。
- 当前不作为第三方自动沟通代理。

## 后续新增需求默认流程

1. 先写入本目录的目标对齐文档。
2. 明确输入、输出、边界、缺失回退和 3D 粒子映射。
3. 用户确认后再进入实现。
4. 实现后同步更新本目录、3D fixture 和 UI 预览验证记录。
