# 语音事件播报编排器方案 v1

来源：`idea-0007`。  
方案编号：`SCHEME-0007`。  
归属：`status-dialogue-system`。  
关联：`voice-loop`、`runtime-integration`、`projection-contracts`、`world-system-3d-os`。  
状态：Phase 1-6 已完成首轮实现并通过基础验证；下一步进入真实 GUI 复测、事件样例接入和心跳监督联动。

## 目标澄清

本方案不再把语音播报理解成“每轮对话结束后固定说一句完成提示”。用户澄清后的目标是：

- 当整个系统发生重大变动、星云系统发生结构或状态变动、模块完成关键节点、模块出现故障或风险时，对话模块应接收事件并进入语音播报队列。
- 播报内容需要结合当前语音模块真实状态：是否正在对话、是否正在播放、当前用户关注点、当前 TTS 音色和播放队列状态。
- 如果正在播放或正在对话，播报不能机械打断；需要根据权重进行插入、合并、延后、静默或紧急打断。
- 紧急事件需要由对话模块生成能让用户听懂、能衔接上下文的播报文稿。
- 播报不是朗读日志，而是把系统变动、完成度、风险、下一步确认点整理成自然的第一人称语音。

## 同级复用结论

本方案不新建并列对话系统，复用并扩展现有能力：

| 现有能力 | 复用方式 |
| --- | --- |
| `status-dialogue-system` | 继续作为唯一归属星云 |
| `voice.completion_notice` | 升级为 `voice.event_broadcast`，完成提示只是事件类型之一 |
| `module_status_card.v1` | 保持作为模块只读状态摘要 |
| `status_snapshot.v1` | 保持作为聚合快照 |
| `patrol_finding_insert.v1` | 保持作为对话插入前的标准巡检证据格式 |
| `voice_output_trace.v1` | 继续记录 TTS 播放链路结果 |
| `xiaozhi_style_voice_bridge` | 复用会话状态机，用于判断 idle/listen/stt/llm/tts/playing/error |
| 右下角 GUI 巡逻窗口 | 作为事件队列、播报策略、trace 和失败 fallback 的可视化入口 |

## 当前逻辑检查

### 新需求建档逻辑是否存在

存在。

当前已有这些文档入口：

- `version-governance.v1.md`：定义 `idea_capture / mini_alignment / version_plan` 三层入口。
- `versions/idea-inbox.md`：想法池，已记录 `idea-0001` 到 `idea-0006`。
- `scheme-directory/README.md`：定义新目标处理流程。
- `scheme-directory/scheme-ledger.md`：方案总账。
- `scheme-directory/status-dashboard.md`：方案状态总览。
- `versions/idea-pool-promotion-plan.v1.md`：想法池推进到版本或已有方案迭代的规则。

### 为什么最近没有自动执行建档

原因不是规则不存在，而是规则目前是文档流程，不是运行时强制执行流程：

1. 没有代码层的 `new_requirement_capture` 或 `idea_inbox_writer`。
2. 右下角对话模块没有在每次识别出新目标时自动写入 `versions/idea-inbox.md`。
3. Codex 当前线程也没有一个强制工具钩子，在每条用户新需求后自动执行“读取方案目录 -> 分类 -> 写入想法池 -> 更新方案总账”。
4. 版本治理仍处于草案状态，文档中写了规则，但没有被固化为所有线程必须执行的自动检查器。
5. 之前部分需求能被记录，是因为当轮手动执行了文档同步；未手动执行时，就会漏掉。

因此需要补一个执行入口：`requirement_capture_gate.v1`，它负责在用户提出新目标时强制检查和归档。

## 全系统巡检和反馈链路需求

当前已经存在“状态卡读取”半条链路：

```text
module_status_card.v1
  -> status_snapshot.v1
  -> patrol_finding_insert.v1
  -> status dialogue context
  -> reply / voiceText
```

缺失的是“主动事件反馈”链路：

```text
module runtime event
  -> module_status_event.v1
  -> system_event_snapshot.v1
  -> voice_event_broadcast_request.v1
  -> voice_broadcast_queue_state.v1
  -> voice_script_patch.v1
  -> TTS playback
  -> voice_output_trace.v1
```

未来新增系统时，必须同时补齐它的反馈出口，否则主体状态对话框无法及时知道新系统的变更、完成、故障或风险。

## 统一反馈接入契约

每个可巡检模块至少需要提供两类输出。

### 1. 状态卡

`module_status_card.v1` 继续用于“当前状态”：

- 模块当前是否 ok/warn/blocked/unknown。
- 当前任务、风险、阻塞、下一步。
- TTL 和更新时间。
- owner、gate、compass、source_refs。

### 2. 状态事件

新增建议契约 `module_status_event.v1`，用于“发生了什么”：

```json
{
  "schema": "module_status_event.v1",
  "event_id": "mse_...",
  "generated_at": "2026-06-29T00:00:00.000Z",
  "source_module": "status-dialogue-system",
  "source_node": "voice.event_broadcast",
  "event_type": "system_change | nebula_change | progress_update | completion | risk | fault | confirmation_needed",
  "severity": "info | notice | warn | blocked | critical",
  "headline": "语音播报规则从固定完成提示升级为事件编排。",
  "summary": "对话模块需要按系统事件权重插入、合并或延后播报。",
  "completion": {
    "current": 0.4,
    "label": "方案草案已建立，等待确认"
  },
  "gate": "status_dialogue_event_gate",
  "compass": "status_dialogue.voice.event_broadcast",
  "evidence_refs": [
    "subject-status-dialogue-module/voice-event-broadcast-orchestrator-plan.v1.md"
  ],
  "recommended_broadcast": {
    "speakable": true,
    "mode": "inline",
    "priority": "notice",
    "emotion_hint": "focused"
  },
  "ttl_ms": 300000,
  "dedupe_key": "status-dialogue-system:voice.event_broadcast:plan-drafted",
  "boundary": [
    "summary_only",
    "do_not_read_internal_runtime",
    "do_not_execute_external_action"
  ]
}
```

## 语音播报请求契约

模块事件进入对话模块后，统一转换为 `voice_event_broadcast_request.v1`：

```json
{
  "schema": "voice_event_broadcast_request.v1",
  "request_id": "veb_...",
  "created_at": "2026-06-29T00:00:00.000Z",
  "source_event_id": "mse_...",
  "event_type": "nebula_change",
  "severity": "warn",
  "weight": "high",
  "user_relevance": "direct",
  "current_dialogue_state": "playing",
  "requested_play_mode": "after_current_sentence",
  "script_goal": "说明变动、影响、完成度和是否需要用户确认",
  "one_sentence_summary": "事件播报规则已升级为按权重编排。",
  "next_action_hint": "Phase 1-3 已完成；下一步补完整事件队列 GUI、3D 映射和新增系统反馈路由清单。",
  "status_refs": [
    "module_status_event.v1",
    "patrol_finding_insert.v1"
  ],
  "requires_confirmation": false
}
```

## 权重与播放策略

| 权重 | 触发场景 | 播放方式 |
| --- | --- | --- |
| `critical` | 严重故障、阻塞、外部动作风险、用户必须马上知道 | 打断当前播报，先说明“我先打断一下”，播完恢复上下文 |
| `high` | 与当前目标直接相关的失败、完成、等待确认 | 当前句子结束后插入 |
| `normal` | 普通进度、星云节点更新、非阻塞状态变化 | 合并进当前回复或下一轮摘要 |
| `low` | 背景状态、例行巡检、低相关更新 | 闲置心跳或巡检摘要 |
| `silent` | 只需记录、不适合打扰用户 | 仅写 UI 状态和 trace |

## 播放中插入规则

```text
if current_state = speaking and event.weight = critical:
  interrupt current audio
  speak interruption bridge line
  speak event script
  resume previous topic if still relevant

if current_state = speaking and event.weight = high:
  wait until current sentence boundary
  insert event script
  continue queued speech

if current_state = speaking and event.weight = normal:
  merge into next natural paragraph or end summary

if current_state = listening/stt:
  avoid non-critical interruption
  queue event until user utterance boundary

if current_state = idle:
  play according to weight and user focus
```

## 播报文稿规则

每条播报不直接朗读源事件，而是生成 `voice_script_patch.v1`：

```json
{
  "schema": "voice_script_patch.v1",
  "patch_id": "vsp_...",
  "play_mode": "interrupt_now | after_current_sentence | merge_into_current_reply | idle_reminder | silent",
  "bridge_line": "我先插入一个和当前目标有关的状态变化。",
  "voice_text": "语音播报规则已经从固定完成提示，调整为按系统事件权重编排。这个变动会影响星云更新、模块完成和风险提醒的播放方式。当前不需要你操作，我会把它放进事件播报方案等待确认。",
  "resume_line": "我继续刚才的内容。",
  "emotion_hint": "focused",
  "voice_profile_lock": true,
  "max_sentences": 4
}
```

默认文稿结构：

1. 先说发生了什么。
2. 再说影响哪个星云、模块或目标。
3. 再说完成度、风险或缺失状态。
4. 最后说是否需要用户确认。

## 新增系统的反馈接入规则

未来任何新增系统、星云、插件或能力进入三维粒子 OS 时，必须同步补齐：

| 项 | 要求 |
| --- | --- |
| `module_id` | 稳定 ID，能映射到 3D 节点 |
| `owner` | 负责方 |
| `gate` | 负责闸口 |
| `compass` | 星云罗盘位置 |
| `module_status_card.v1` | 当前状态卡输出 |
| `module_status_event.v1` | 变动、完成、风险和故障事件输出 |
| `ttl_ms` | 状态新鲜度 |
| `severity_mapping` | 模块内部状态到全局严重级别的映射 |
| `evidence_refs` | 可追溯来源 |
| `broadcast_policy` | 事件是否允许语音播报、权重和默认插入方式 |
| `privacy_boundary` | 只输出摘要，不暴露内部全文或敏感内容 |
| `fallback_behavior` | 状态缺失、事件读取失败时如何表达 |

## UI 表达

右下角巡逻窗口新增或归入设置面板：

- 当前事件队列数量。
- 当前正在播放的语音任务。
- 下一个待播事件。
- 权重：critical/high/normal/low/silent。
- 处理方式：打断、插入、合并、延后、静默。
- 最近一次事件播报 trace。
- 播放失败 fallback。
- 是否有事件被去重或静默。

## 3D 星云映射

在 `status-dialogue-system` 星云下扩展：

| 子节点 | 说明 |
| --- | --- |
| `voice.event_broadcast` | 事件播报总入口 |
| `voice.broadcast_queue` | 播报队列 |
| `voice.priority_gate` | 权重和打断策略 |
| `voice.script_composer` | 自然语音文稿生成 |
| `voice.interrupt_resume` | 播放中插入和恢复 |
| `voice.event_trace` | 事件播报记录 |
| `runtime.feedback_router` | 全系统事件反馈路由 |
| `runtime.module_event_contract` | 新模块接入状态事件契约 |
| `policy.requirement_capture_gate` | 新需求建档执行入口 |

每个子节点都需要显示：

- 输入。
- 输出。
- 当前状态。
- 权重或边界。
- 来源引用。
- 负责闸口。
- 是否已实现。
- 是否只是预留。

## 阶段计划

### Phase 0：规则修正和方案归档

- 将“每轮固定完成播报”修正为“重大事件、星云变动、模块完成和故障进入事件播报队列”。
- 登记 `idea-0007` 和 `SCHEME-0007`。
- 更新方案总账和状态看板。

### Phase 1：契约定义

- 定义 `module_status_event.v1`。
- 定义 `voice_event_broadcast_request.v1`。
- 定义 `voice_broadcast_queue_state.v1`。
- 定义 `voice_script_patch.v1`。
- 定义 `system_feedback_route_manifest.v1`。

### Phase 2：状态事件聚合器

- 在现有 `module_status_card.v1` 读取基础上增加只读事件读取。
- 事件目录建议为 `runtime/status-events`。
- 聚合输出 `system_event_snapshot.v1`。
- 不写世界模型，不执行外部动作。

### Phase 3：语音播报队列和编排器

- 将事件转成播报请求。
- 根据当前语音状态决定插入、合并、延后、静默或打断。
- 保持同一轮同音色。
- 记录 trace 和失败 fallback。

### Phase 4：右下角 UI

- 增加事件播报状态区。
- 支持查看队列、权重、来源和最近 trace。
- 支持手动重播最近一条事件播报。

### Phase 5：3D 星云映射

- 在 `status-dialogue-system` 下补齐事件播报子粒子。
- 在目录中可查询每个事件入口和输出。
- 事件来源与星云节点可互相追溯。

### Phase 6：验证

- 模拟系统重大变动。
- 模拟星云节点变动。
- 模拟模块完成。
- 模拟模块故障。
- 模拟正在播放时 high 事件插入。
- 模拟 critical 事件打断并恢复。
- 模拟新增系统无事件出口时的缺失提醒。

## 验证口径

```text
rg "idea-0007|SCHEME-0007|voice_event_broadcast|module_status_event|system_feedback_route_manifest" D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2
rg "module_status_card|status_snapshot|patrol_finding_insert|completion_notice" D:\zhineng\sightflow-desktop-agent-main\src
```

验收标准：

- 方案已进入想法池和方案总账。
- 当前需求不再被理解为每轮固定播报。
- 明确现有建档逻辑为什么未自动执行。
- 明确全系统反馈链路的缺失段。
- 明确未来新增系统必须发布状态卡和状态事件。
- 未创建正式 `0.0.XX` 版本号。
- 未改运行时代码。

## 用户已确认

1. 确认 `SCHEME-0007` 作为独立方案承载本轮实施，不拆成并列方案。
2. 确认先实现 Phase 1-3，也就是契约、事件聚合和语音队列编排。
3. 确认未来新增系统必须提供 `module_status_card.v1` 和 `module_status_event.v1` 两个反馈出口。
4. 确认 `runtime/status-events` 作为第一阶段事件只读目录。
5. 确认 `critical` 事件允许打断当前语音，`high` 事件在当前句子后插入。
