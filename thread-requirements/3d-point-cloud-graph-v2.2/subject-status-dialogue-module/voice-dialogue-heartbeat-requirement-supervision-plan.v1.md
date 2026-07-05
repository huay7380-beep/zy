# 语音对话心跳与需求监督方案 v1

状态：方案草案，等待用户确认后再推进为正式版本计划。  
来源：`idea-0003`。  
建议版本路线：`version_plan`，确认后可作为首个正式功能版本候选 `0.0.01.0`，也可按用户指定归入后续版本。  
当前边界：本文件只整理目标和方案，不改代码，不创建 `requirement_packet.v1`，不向世界模型或其他模块写入真实需求。

## 需求理解

用户希望当前语音对话模块从“能问答、能播报”升级为“能陪伴式沟通、能巡逻、能记录口述需求、能监督进度的主体入口”。

拆解后包含五个核心能力：

1. 人性化交流：回复不只是状态码或简短模板，而是能接住用户语气、目标和上下文，用第一人称自然表达。
2. 闲置心跳：当用户长时间不操作时，模块可以按规则主动提醒、简短沟通或报告巡检状态。
3. 闲聊兼巡检：在日常闲聊中，模块仍保持后台状态巡逻能力，不把闲聊和系统状态完全割裂。
4. 口述需求监督：用户通过语音提出目标后，模块能记录原话、转译成系统可理解的需求草案，交给对应模块或未来世界模型入口，并持续监督进程，按时反馈。
5. 模块节点事件提醒：当其他模块完成、阻塞、到达关键节点或需要用户确认时，可以主动把摘要状态传给语音对话模块，由语音模块根据事件状态、用户当前关注度和紧急程度决定提醒方式。

## 当前状态关联

当前已具备的基础：

- 语音输入和 TTS 输出已跑通。
- `conversation_memory.v1` 已保存目标、关注点、已确认结果、未解决问题和下一步期待。
- 对话框可以读取 `status_snapshot.v1` 和状态卡摘要。
- 已有 `requirement_draft.v1`、`command_proposal.v1`、`world_model_requirement_inbox` 的未来边界设计。
- 3D 粒子 OS 已有 `status-dialogue-system` 星云和 `voice_dialogue`、`conversation_memory`、`status_cloud` 等子粒子概念。

当前缺口：

- 没有闲置心跳调度器。
- 没有主动提醒的频率、静默时间和打扰边界。
- 闲聊模式与巡检模式还没有统一状态机。
- 口述需求目前只进入对话回复，不会形成可追溯需求草案。
- 没有进程监督 watchlist，也没有定时反馈机制。
- 没有其他模块到语音对话模块的节点事件入口。
- 没有根据用户沟通关注度动态调整某个系统跟踪紧急程度的规则。
- 需求传达尚未启用，不能直接写世界模型或其他模块。

## 设计定位

该模块不是单纯的语音助手，也不是自动执行器。它是“主体状态对话窗口”：

- 对用户：自然沟通、主动提醒、复述确认、给出状态和建议。
- 对系统：只读巡检、结构化记录、形成可审查草案、跟踪状态卡。
- 对其他模块：未来通过明确 adapter 或 inbox 传递确认后的需求，而不是直接操作内部实现。

## 核心能力模块

### 1. Heartbeat Engine

负责闲置时的主动沟通。

输入：

- `last_user_activity_at`
- `last_dialogue_turn_at`
- `status_snapshot.v1`
- `conversation_memory.v1`
- `progress_watchlist.v1`
- `module_status_event.v1`
- `attention_context.v1`
- 用户配置：是否启用、间隔、静默时间、最大打扰次数

输出：

- `heartbeat_event.v1`
- `voiceText`
- 可见日志中的巡检摘要

触发类型：

| Type | 触发条件 | 输出风格 |
| --- | --- | --- |
| `idle_checkin` | 用户闲置超过阈值 | 简短问候加当前重点 |
| `patrol_ping` | 巡检发现 warn/blocked/stale | 主动提醒风险 |
| `progress_followup` | watch item 到达反馈时间 | 汇报进程和下一步 |
| `module_event_ping` | 其他模块推送完成、阻塞或节点状态 | 按事件等级提醒 |
| `quiet_keepalive` | 状态稳定但长时间无交互 | 低打扰确认 |
| `attention_request` | 需要用户确认 | 明确请求确认 |

防打扰规则：

- 支持 `quiet_hours`。
- 支持用户说“先别提醒我”“暂停心跳”。
- 每小时最大主动提醒次数可配置。
- 用户正在语音输入、TTS 播放、模型生成时不插入心跳。
- 心跳内容必须短，不进行长报告。
- 模块事件提醒必须先经过提醒决策，不允许所有事件都直接打断当前对话。

### 2. Casual Chat With Patrol

让闲聊和巡检共存。

目标：

- 用户随便聊天时，模块先自然回应。
- 如果系统有风险或进度变化，可以轻轻带出，不打断闲聊。
- 如果用户问到目标、计划、进展，立即切回巡检视角。

建议状态：

```text
casual_chat
  -> background_patrol_snapshot
  -> response_compose
  -> optional_status_hint
```

表达规则：

- 闲聊优先自然，不每句都塞系统状态。
- 有 `blocked` 或高风险时，允许主动插入状态提醒。
- 有 `missing/stale` 时，只在相关话题或心跳中提醒。
- 语气要像“我在旁边看着状态”，不是机械播报。

### 3. Spoken Requirement Capture

把用户口述需求记录并转译成草案。

输入：

- STT transcript
- 用户当前目标和关注点
- 3D 当前焦点节点
- 状态快照和可用模块清单

输出：

- `spoken_requirement_draft.v1`
- `requirement_draft.v1`
- 必要时生成 `command_proposal.v1`

建议字段：

```json
{
  "schema": "spoken_requirement_draft.v1",
  "draft_id": "srd_...",
  "source": "voice_dialogue",
  "raw_transcript": "用户口述摘要",
  "interpreted_goal": "系统理解后的目标",
  "target_system_candidates": ["status-dialogue-system"],
  "target_nodes": ["voice-dialogue.heartbeat-engine"],
  "expected_result": "用户希望看到或听到的结果",
  "priority": "normal",
  "ambiguities": [],
  "required_confirmation": true,
  "execution_allowed": false,
  "status": "draft_waiting_confirmation"
}
```

边界：

- 原始音频不保存。
- transcript 可摘要保存，避免长原文堆积。
- 用户确认前不传递到真实执行模块。
- 当前阶段不创建正式 `requirement_packet.v1`。

### 4. Requirement Handoff Gate

把“用户说的话”变成“可传达给模块的需求”，但必须经过确认。

当前阶段：

```text
spoken_requirement_draft.v1
  -> requirement_draft.v1
  -> UI 显示待确认
  -> 不执行
```

未来阶段：

```text
confirmed requirement_draft.v1
  -> requirement_handoff_ticket.v1
  -> target_module_inbox or world_model_requirement_inbox
  -> target_module_status_card
  -> progress_watchlist.v1
```

建议 `requirement_handoff_ticket.v1` 字段：

```json
{
  "schema": "requirement_handoff_ticket.v1",
  "ticket_id": "rht_...",
  "source_draft_id": "srd_...",
  "target_module": "world-system-3d-os",
  "handoff_mode": "proposal_only",
  "confirmation_ref": "user_confirmed_turn_id",
  "expected_status_card": "runtime/status-cards/world-system-3d-os.json",
  "next_check_at": "2026-06-27T00:00:00.000Z",
  "status": "waiting_target_module_ack",
  "execution_allowed": false
}
```

### 5. Module Status Event Ingress

负责接收其他模块主动推送的节点状态、完成状态、阻塞状态和确认请求。它不是让语音模块去读取其他模块内部数据，而是要求其他模块发布摘要级事件。

输入：

- 其他模块主动发送的 `module_status_event.v1`
- `progress_watchlist.v1`
- `conversation_memory.v1`
- 当前对话状态：用户是否正在说话、模型是否正在生成、TTS 是否正在播放
- 用户关注度上下文：最近关注的系统、节点、目标和紧急程度

输出：

- `reminder_decision.v1`
- `progress_watch_item.v1` 更新
- 可插入对话的 `status_interruption_hint`
- 可闲置播报的 `heartbeat_event.v1`

建议 `module_status_event.v1` 字段：

```json
{
  "schema": "module_status_event.v1",
  "event_id": "mse_...",
  "source_module": "world-system-3d-os",
  "source_node": "graph_projection.expansion",
  "event_type": "node_completed",
  "severity": "info",
  "occurred_at": "2026-06-27T00:00:00.000Z",
  "headline": "3D 星云拓扑扩展完成",
  "detail_summary": "已完成方案节点映射，等待用户确认",
  "related_requirement_id": "srd_...",
  "progress_percent": 100,
  "requires_user_attention": false,
  "suggested_reminder_mode": "idle_normal",
  "source_refs": ["runtime/status-cards/world-system-3d-os.json"],
  "ttl_ms": 3600000
}
```

事件类型：

| Type | 含义 |
| --- | --- |
| `node_started` | 目标模块开始某个节点 |
| `node_progress` | 节点进度更新 |
| `node_completed` | 节点完成 |
| `node_blocked` | 节点阻塞 |
| `needs_user_confirmation` | 需要用户确认 |
| `risk_detected` | 发现风险 |
| `handoff_acknowledged` | 目标模块确认收到需求 |
| `handoff_rejected` | 目标模块拒绝或无法接收 |

提醒分流：

| Reminder Mode | 适用情况 | 行为 |
| --- | --- | --- |
| `special_alert` | 阻塞、高风险、需要用户确认、用户正在高度关注该目标 | 可打断或优先插入当前对话 |
| `dialogue_insert` | 用户正在对话，事件与当前关注系统相关，但不是紧急风险 | 当前回复结尾插入一句提醒 |
| `idle_normal` | 用户闲置，事件重要但不紧急 | 下一个心跳时播报 |
| `silent_log` | 低价值、重复、与当前关注无关 | 只记入日志和 watchlist |
| `digest` | 多个低优先事件累积 | 合并为摘要，避免频繁打扰 |

边界：

- 其他模块只发送摘要事件，不发送内部全文。
- 语音模块只做提醒决策，不替目标模块判断真实完成质量。
- 如果事件缺少 `source_refs` 或过期，只能降级为低置信提醒。
- 所有提醒必须能反查到事件来源。

### 6. Attention And Urgency Tracker

根据用户当前对话内容动态判断“我现在最关心哪个系统、哪个目标、哪个节点”，并调整跟踪紧急程度。

输入：

- 当前用户发言或 STT transcript
- `conversation_memory.v1`
- `progress_watchlist.v1`
- 当前 3D focus
- 最近 `module_status_event.v1`

输出：

- `attention_context.v1`
- watch item 的 `urgency`
- reminder decision 的优先级

建议 `attention_context.v1` 字段：

```json
{
  "schema": "attention_context.v1",
  "focused_systems": ["status-dialogue-system"],
  "focused_nodes": ["voice.progress_supervisor"],
  "focused_requirements": ["srd_..."],
  "urgency_overrides": [
    {
      "target": "world-system-3d-os",
      "urgency": "high",
      "reason": "user asked for current progress twice"
    }
  ],
  "last_updated_at": "2026-06-27T00:00:00.000Z"
}
```

紧急程度规则：

- 用户明确说“重点盯着”“马上告诉我”“卡住就提醒”，对应目标升为 `high`。
- 用户说“有进展再说”“不急”，对应目标降为 `normal` 或 `low`。
- 用户切换话题时，旧目标不丢失，但提醒方式降级为 `idle_normal` 或 `digest`。
- 如果目标模块推送 `node_blocked` 或 `needs_user_confirmation`，即使当前话题已切换，也可以临时升高提醒等级。

### 7. Progress Supervisor

负责监督需求或任务进度，但不直接替目标模块做事。

输入：

- `requirement_handoff_ticket.v1`
- `progress_watchlist.v1`
- 目标模块状态卡
- 目标模块主动推送的 `module_status_event.v1`
- `attention_context.v1`
- 运行日志摘要或目标模块公开状态

输出：

- 进度摘要
- 下次检查时间
- 对用户的定时反馈
- 缺失或过期提醒

建议 `progress_watch_item.v1` 字段：

```json
{
  "schema": "progress_watch_item.v1",
  "watch_id": "pwi_...",
  "source_requirement_id": "srd_...",
  "target_module": "status-dialogue-system",
  "expected_result": "完成心跳机制方案确认",
  "status_card_ref": "runtime/status-cards/status-dialogue-system.json",
  "last_seen_status": "warn",
  "urgency": "normal",
  "last_event_id": "mse_...",
  "reminder_mode": "idle_normal",
  "next_feedback_at": "2026-06-27T00:00:00.000Z",
  "feedback_interval_ms": 1800000,
  "status": "watching"
}
```

反馈规则：

- 到达 `next_feedback_at` 才主动反馈。
- 如果状态变为 `blocked`，可提前反馈。
- 如果状态稳定且无变化，反馈要短。
- 如果用户正在交互，不抢话；本轮回复结尾顺带说明。
- 如果用户在对话中提高某个目标的关注度，允许缩短该 watch item 的反馈间隔。
- 如果多个低优先事件连续到达，合并成 digest，避免频繁打扰。

## 统一状态机

建议将当前状态机扩展为：

```text
idle
  -> module_event_received?
  -> reminder_decision
  -> heartbeat_due?
  -> heartbeat_compose
  -> speaking
  -> idle

listening
  -> transcribing
  -> intent_understanding
  -> route_decision
     -> casual_chat_with_patrol
     -> status_patrol
     -> requirement_capture
     -> command_proposal
     -> module_event_review
     -> progress_supervision
  -> response_compose
  -> speaking
  -> memory_update
  -> attention_context_update
  -> watchlist_update
  -> idle
```

关键原则：

- 心跳不是另一个聊天机器人，只是当前对话模块的主动巡逻表达。
- 需求传达不是执行，必须先草案、确认、交接、监督。
- 巡检必须基于状态卡或公开状态，不猜测其他模块内部情况。
- 模块事件可以触发提醒，但必须先经过 `reminder_decision.v1`，避免所有状态变化都打断用户。

## 对话人格和语气规则

建议默认风格：

- 第一人称：使用“我现在看到”“我会先记下”“我建议下一步”。
- 简洁但有人味：先接住用户，再说结论。
- 不撒娇、不夸张、不机械报表。
- 有风险时明确，有缺失时透明，有进展时确认。

示例：

闲置心跳：

> 我这边还在看着状态。现在没有新的阻塞，但语音对话的需求监督还没进入实现。如果你准备继续，我建议下一步先确认心跳频率和需求转交边界。

口述需求确认：

> 我听懂了，你想让我把这条需求转成系统能接收的任务。我先不直接传给其他模块，会先整理成需求草案，标出目标模块、预期结果和需要你确认的地方。

进程反馈：

> 我刚检查了一次，这个任务还没有目标模块的状态卡回传，所以我只能确认“已记录”，不能确认“已执行”。下一步需要目标模块暴露一张状态卡。

模块完成特意提醒：

> 我插一句，你刚才重点盯的 3D 星云方案节点已经完成了，目标模块回传了完成事件。我先把它标成待你确认，不会直接进入实现。

对话中插入提醒：

> 这点我明白。顺带提醒一下，语音对话模块刚收到一个相关进度：状态卡桥接还没回传，所以我现在只能继续监督，不能确认那边已经完成。

闲置普通提醒：

> 我这边刚做了一次轻量巡检。没有新的阻塞，有一个低优先进度已经更新，我先记到摘要里，等你回来再展开。

## 3D 粒子 OS 映射

归属星云：

```text
domain_id: status-dialogue-system
parent_node_id: voice_dialogue
```

建议新增子粒子：

| Node | 作用 | Input | Output | Gate |
| --- | --- | --- | --- | --- |
| `voice.heartbeat_engine` | 闲置心跳与主动提醒 | activity state, snapshot, memory | heartbeat_event.v1 | heartbeat_policy_gate |
| `voice.casual_patrol_lane` | 闲聊兼巡检 | transcript, snapshot, memory | patrol_hint | casual_patrol_gate |
| `voice.spoken_requirement_capture` | 口述需求草案 | STT transcript, focus node | spoken_requirement_draft.v1 | requirement_capture_gate |
| `voice.requirement_confirmation_gate` | 用户确认门 | draft, user confirmation | confirmed_draft | confirmation_gate |
| `voice.requirement_handoff_gate` | 需求交接门 | confirmed_draft | handoff_ticket.v1 | handoff_gate |
| `voice.module_status_event_ingress` | 接收其他模块节点事件 | module_status_event.v1 | reminder_decision.v1 | module_event_gate |
| `voice.attention_urgency_tracker` | 根据用户关注度调整跟踪紧急程度 | transcript, memory, watchlist | attention_context.v1 | attention_gate |
| `voice.reminder_decision_router` | 决定特意提醒、插入提醒、闲置提醒或静默记录 | event, attention, activity | reminder_decision.v1 | reminder_policy_gate |
| `voice.progress_supervisor` | 进程监督 | watchlist, status cards | feedback_event.v1 | progress_watch_gate |
| `voice.scheduled_feedback` | 定时反馈 | feedback_event, TTS policy | voiceText | feedback_voice_gate |
| `voice.quiet_hours_guard` | 防打扰边界 | user prefs, activity | allow/deny heartbeat | quiet_guard |

目录要求：

- 每个粒子必须有 `input_refs`、`output_refs`、`boundary`、`owner`、`gate`。
- 每个心跳或反馈必须能追溯到 `heartbeat_event.v1`、`module_status_event.v1` 或 `progress_watch_item.v1`。
- 每条需求草案必须能追溯到来源 turn，但不保存原始音频。

## 分阶段实现建议

### Phase H0：方案与契约

只建类型、配置、UI 状态位和文档，不执行传递。

新增或扩展：

- `HeartbeatPolicy`
- `HeartbeatEvent`
- `SpokenRequirementDraft`
- `RequirementHandoffTicket`
- `ModuleStatusEvent`
- `ReminderDecision`
- `AttentionContext`
- `ProgressWatchItem`
- `FeedbackSchedule`

### Phase H1：本地心跳和 UI 展示

实现闲置检测、心跳开关、静默时间、提醒间隔和 UI 状态。

边界：

- 心跳只在本模块内部提醒。
- 不读取其他模块内部数据。
- 不写世界模型。

### Phase H2：闲聊兼巡检编排

升级 intent router 和回复策略：

- casual chat
- status patrol
- requirement capture
- progress supervision

要求：

- 闲聊不丢巡检。
- 巡检不打断闲聊。
- 风险高时明确提醒。

### Phase H3：口述需求草案

把语音输入转成 `spoken_requirement_draft.v1`，显示给用户确认。

边界：

- `execution_allowed=false`
- 不创建正式 `requirement_packet.v1`
- 不传给目标模块

### Phase H4：监督列表和定时反馈

实现 `progress_watchlist.v1`，只根据状态卡和模块状态事件监督。

边界：

- 没有状态卡就反馈“未收到目标模块状态”。
- 没有 `module_status_event.v1` 就不能声称目标模块已到达节点。
- 不伪造进展。

### Phase H5：模块状态事件入口与提醒分流

实现其他模块到语音对话模块的摘要事件入口：

- `module_status_event.v1`
- `attention_context.v1`
- `reminder_decision.v1`

提醒方式：

- 特意提醒：高风险、阻塞、需要确认、用户高度关注。
- 对话中插入：相关但不紧急。
- 闲置普通提醒：有进度但不需要打断。
- 静默记录或摘要：低优先级、重复事件。

边界：

- 其他模块只推送摘要事件。
- 语音模块不读取目标模块内部全文。
- 所有提醒可追溯到事件和状态卡。

### Phase H6：确认后交接

在目标模块或世界模型入口准备好后再启用：

- 创建 `requirement_handoff_ticket.v1`
- 写入目标模块 inbox 或 `world_model_requirement_inbox`
- 由目标模块状态卡回报进度

## 当前不做

- 不直接执行用户口述命令。
- 不直接写入世界模型、人际图谱、事件图谱。
- 不在用户未确认前创建正式 `requirement_packet.v1`。
- 不让心跳无限打扰用户。
- 不保存原始音频。
- 不把闲聊内容全部转成长期记忆。

## 验证方案

文档验证：

```powershell
rg "HeartbeatEvent|SpokenRequirementDraft|RequirementHandoffTicket|ModuleStatusEvent|ReminderDecision|AttentionContext|ProgressWatchItem|heartbeat_engine|module_status_event_ingress|reminder_decision_router|progress_supervisor" D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\subject-status-dialogue-module
```

未来实现验证：

- 类型检查：`npm.cmd run typecheck`
- 构建：`npm.cmd run build`
- UI：右侧巡逻窗口可见心跳状态、需求草案、监督列表。
- 行为：用户闲置后只在允许时间内触发心跳。
- 事件：模拟 `module_status_event.v1` 后，提醒进入正确分流：特意提醒、对话插入、闲置提醒、静默日志或摘要。
- 关注：用户在对话中提高某个目标紧急程度后，watch item 的反馈频率和提醒优先级同步变化。
- 语音：心跳和反馈可以通过当前 TTS 播放。
- 边界：检索确认未创建正式 `requirement_packet.v1`，未写世界模型。
- 3D：`status-dialogue-system` 星云下能查询新增子粒子及输入输出。

## 待用户确认

1. 是否确认该目标作为新功能版本候选，而不是归入已有小修复。
2. 是否确认心跳默认关闭，先由用户手动开启；还是默认开启但低频提醒。
3. 是否确认心跳默认间隔建议为 20 到 30 分钟，blocked 风险可提前提醒。
4. 是否确认口述需求只先生成草案和确认卡，不直接传给其他模块执行。
5. 是否确认进程监督第一阶段只读目标模块状态卡，没有状态卡就报告“未收到进度”，不猜测。
6. 是否确认 3D 粒子 OS 需要同步新增上述子粒子和目录查询入口。
7. 是否确认其他模块可以通过 `module_status_event.v1` 向语音对话模块发送节点完成、阻塞、进度和确认请求等摘要事件。
8. 是否确认提醒分为 `special_alert`、`dialogue_insert`、`idle_normal`、`silent_log`、`digest` 五类。
9. 是否确认用户在对话中表达的关注度可以动态改变某个 watch item 的紧急程度和反馈频率。

## 我的建议

建议第一轮只实现 H0 到 H2：

- 先有心跳配置和状态位。
- 先让闲聊和巡检共存。
- 先把人性化表达稳定下来。

第二轮再做 H3 到 H5：

- 口述需求草案。
- 监督列表。
- 定时反馈。
- 模块事件入口。
- 关注度和提醒分流。

H6 需求交接要等目标模块或世界模型入口确认后再做。这样不会把“听懂用户需求”误变成“未经确认就替用户执行”。
