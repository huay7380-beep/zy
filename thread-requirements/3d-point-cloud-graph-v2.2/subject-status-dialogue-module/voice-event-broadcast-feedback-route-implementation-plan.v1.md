# SCHEME-0007 语音事件播报与全系统反馈路由实施计划 v1

来源：`idea-0007` / `SCHEME-0007`。  
主方案：`voice-event-broadcast-orchestrator-plan.v1.md`。  
归属：`status-dialogue-system`。  
状态：Phase 1-6 已完成首轮实现；事件队列 GUI、3D 星云映射、`system_feedback_route_manifest.v1` 和持续播报验证已落地。  
日期：2026-06-29。

## 确认结果

用户已于 2026-06-29 确认以下事项：

1. `SCHEME-0007` 同时覆盖“重大事件/星云变化播报”和“全系统反馈路由 + 语音事件编排器”。
2. 先进入 Phase 1-3，暂不做完整 GUI 和 3D 映射实现。
3. `runtime/status-events` 作为第一阶段只读事件目录。
4. 未来新增系统必须同时提供 `module_status_card.v1` 和 `module_status_event.v1`。
5. `critical` 事件允许打断当前语音，`high` 事件在当前句子后插入。

## 2026-06-29 Phase 1-3 实施结果

本轮已按确认范围完成 Phase 1-3 的最小可运行实现，仍保持“只读事件、只做状态播报编排、不写世界模型、不执行外部动作”的边界。

已实现：

- Phase 1：新增 `src/core/status-dialogue/status-events.ts`，定义 `module_status_event.v1`、`system_event_snapshot.v1`、`voice_event_broadcast_request.v1`、`voice_broadcast_queue_state.v1`、`voice_script_patch.v1` 及归一化、聚合、权重推导、脚本补丁生成函数。
- Phase 2：新增只读 IPC `zhineng:status-dialogue:events:get`，从 `runtime/status-events/*.json` 读取事件；路径限制在 `zhinengProjectRoot()` 内；不创建、不修改、不删除事件文件。
- Phase 3：主体状态对话框加载 `system_event_snapshot.v1`，把系统事件转换为 `patrol_finding_insert.v1`，并生成可插入当前 TTS 输出的 `voice_script_patch.v1`；右侧设置状态面板已能显示事件来源、fresh/stale/critical、top events、missing publishers 和 read errors。

验证结果：

- `npm.cmd run typecheck`：通过。
- `npm.cmd run build`：通过。
- 核心函数模拟验证：通过，critical 事件可生成 `interrupt_now` 播报请求和 `urgent` 脚本补丁。
- 边界检索：代码中已出现 `module_status_event`、`system_event_snapshot`、`voice_event_broadcast_request`、`voice_broadcast_queue_state`、`voice_script_patch`、`zhineng:status-dialogue:events:get` 和 `runtime/status-events` 的落点。

2026-06-29 Phase 4-6 追加结果：

- Phase 4：右下角设置面板新增事件播报队列区，显示 `voice_broadcast_queue_state.v1`、request 数量、critical/high 数量、trace、source、replay count、`voice_event_broadcast_request.v1` 列表和 `voice_script_patch.v1` 列表；新增 `refresh events` 和 `play queue` 手动重播。
- Phase 4：带 `voice_script_patch.v1` 的回复不再被 `cosyvoice_short` 裁成单句，确保多事件可以连续进入同一个高质量 TTS 队列。
- Phase 5：`status-dialogue-system` 星云下新增事件播报链路子粒子：`voice.event_broadcast_ingress`、`voice.system_event_snapshot`、`voice.priority_gate`、`voice.broadcast_queue`、`voice.script_composer`、`voice.interrupt_resume`、`voice.event_trace`、`runtime.feedback_router`、`runtime.module_event_contract`、`system_feedback_route_manifest.v1`。
- Phase 6：新增 `system_feedback_route_manifest.v1` 代码契约、默认构建函数、归一化函数和校验函数；新增说明文档 `system-feedback-route-manifest.v1.md`。
- 验证：新增 `npm.cmd run voice:event-broadcast:validate`，已验证 3 个事件可连续生成 3 段播报补丁，并覆盖 `interrupt_now`、`after_current_sentence`、`merge_into_current_reply` 三种播放模式。

## 执行前提结论（历史）

实施前已确认具备开始 Phase 1-3 的工程前提：

- 已有统一代码落点：`src/core/status-dialogue`。
- 已有导出口：`src/core/status-dialogue/index.ts`。
- 已有状态卡和快照契约：`module_status_card.v1`、`status_snapshot.v1`。
- 已有巡检插入契约：`patrol_finding_insert.v1`。
- 已有主进程只读 IPC 示例：`zhineng:status-dialogue:snapshot:get`。
- 已有项目根路径限制方法，可复用到 `runtime/status-events`。
- 已有 TTS 队列、voice trace 和 fallback 基础。
- 已有验证命令：`npm.cmd run typecheck`、`npm.cmd run build`。

实施前缺失但已在 Phase 1-3 内补齐：

- `module_status_event.v1` 代码契约。
- `system_event_snapshot.v1` 聚合契约。
- `voice_event_broadcast_request.v1` 契约。
- `voice_broadcast_queue_state.v1` 契约。
- `voice_script_patch.v1` 契约。
- `zhineng:status-dialogue:events:get` 只读 IPC。
- 事件到语音播报请求的最小编排函数。

## 覆盖范围确认

本计划覆盖上两轮对话中的两个需求，它们已经合并归入同一个想法池条目，而不是拆成并列方案：

| 内容 | 是否已进入想法池 | 归属 |
| --- | --- | --- |
| 重大系统事件、星云变化、模块完成、风险和故障进入事件播报队列 | 是，`idea-0007` | `SCHEME-0007` |
| 全系统反馈路由 + 语音事件编排器，让对话模块能接收已有/新增系统的变更和故障 | 是，`idea-0007` | `SCHEME-0007` |

合并理由：

- 两者共享同一条数据链：系统事件 -> 反馈路由 -> 语音播报请求 -> 播放编排。
- 两者都属于主体状态对话框的事件感知和语音输出能力。
- 如果拆成两个方案，会导致状态事件、播报队列、UI 和 3D 映射重复设计。

## 目标

将当前“完成提示/手动播报”升级为“系统事件语音播报编排器”：

1. 系统重大变动、星云变化、模块完成、故障、风险、确认节点都能形成标准事件。
2. 对话模块通过统一反馈路由读取这些事件。
3. 事件根据权重进入语音播报队列。
4. 语音模块根据当前状态决定插入、合并、延后、静默或紧急打断。
5. 播报文稿由对话模块自然编排，不朗读原始日志。
6. 未来新增系统必须带状态卡和状态事件出口，确保能被巡检和播报。

## 当前基础

已有：

```text
module_status_card.v1
  -> status_snapshot.v1
  -> patrol_finding_insert.v1
  -> StatusDialogueContext
  -> reply / voiceText
```

已有能力：

- 只读状态卡读取。
- 状态快照聚合。
- 巡检插入项 `patrol_finding_insert.v1`。
- 右下角主体状态巡逻窗口。
- TTS 队列、统一音色、trace 和 fallback。
- 小智式会话状态机的基础表达。

缺失：

```text
module_status_event.v1
  -> system_event_snapshot.v1
  -> voice_event_broadcast_request.v1
  -> voice_broadcast_queue_state.v1
  -> voice_script_patch.v1
  -> TTS playback
```

缺失能力：

- 模块主动事件出口。
- 全系统事件只读聚合。
- 事件权重和播报策略。
- 播放中插入/恢复。
- 事件播报 UI 状态区。
- 新增系统必须接入反馈链路的强制清单。

## 数据流

```text
module / nebula / runtime
  -> module_status_card.v1
  -> module_status_event.v1
  -> feedback_route_reader
  -> system_event_snapshot.v1
  -> patrol_finding_insert.v1
  -> voice_event_broadcast_request.v1
  -> voice_broadcast_queue_state.v1
  -> voice_script_patch.v1
  -> voice_output_pipeline
  -> TTS audio
  -> voice_output_trace.v1
  -> GUI / 3D particle trace
```

## 核心契约

### `module_status_event.v1`

用于表达“发生了什么”，而不是“当前状态是什么”。

必备字段：

| 字段 | 说明 |
| --- | --- |
| `event_id` | 稳定事件 ID |
| `source_module` | 来源模块 |
| `source_node` | 来源星云节点 |
| `event_type` | `system_change`、`nebula_change`、`progress_update`、`completion`、`risk`、`fault`、`confirmation_needed` |
| `severity` | `info`、`notice`、`warn`、`blocked`、`critical` |
| `headline` | 一句话摘要 |
| `summary` | 可播报摘要 |
| `completion` | 可选，完成度 |
| `gate` | 负责闸口 |
| `compass` | 3D 罗盘位置 |
| `evidence_refs` | 证据来源 |
| `recommended_broadcast` | 播报建议 |
| `dedupe_key` | 去重键 |
| `boundary` | 边界 |

### `system_event_snapshot.v1`

事件聚合器输出，只读，不写世界模型。

必备字段：

| 字段 | 说明 |
| --- | --- |
| `events_total` | 读取事件总数 |
| `events_fresh` | 新鲜事件数 |
| `events_stale` | 过期事件数 |
| `events_critical` | 严重事件数 |
| `events_by_source` | 来源模块统计 |
| `top_events` | 最高优先级事件 |
| `read_errors` | 读取错误 |
| `missing_publishers` | 应发布事件但未发布的模块 |

### `voice_event_broadcast_request.v1`

对话模块把事件转换成播报请求。

必备字段：

| 字段 | 说明 |
| --- | --- |
| `request_id` | 播报请求 ID |
| `source_event_id` | 对应状态事件 |
| `weight` | `critical`、`high`、`normal`、`low`、`silent` |
| `current_dialogue_state` | 当前语音/对话状态 |
| `requested_play_mode` | `interrupt_now`、`after_current_sentence`、`merge_into_current_reply`、`idle_reminder`、`silent` |
| `script_goal` | 文稿目标 |
| `status_refs` | 状态引用 |
| `requires_confirmation` | 是否需要用户确认 |

### `voice_script_patch.v1`

最终可播报文稿，不直接朗读日志。

必备字段：

| 字段 | 说明 |
| --- | --- |
| `play_mode` | 播放策略 |
| `bridge_line` | 插入衔接语 |
| `voice_text` | 核心播报 |
| `resume_line` | 恢复原上下文时使用 |
| `emotion_hint` | 情绪提示 |
| `voice_profile_lock` | 是否锁定同一音色 |
| `max_sentences` | 最大句数 |

## 权重规则

| 权重 | 场景 | 播放策略 |
| --- | --- | --- |
| `critical` | 严重故障、阻塞、外部动作风险、必须立即知道 | 打断当前播放，说明原因，播完恢复 |
| `high` | 当前目标相关失败、完成、确认请求 | 当前句子结束后插入 |
| `normal` | 普通进度、星云节点更新 | 合并到当前回复或下一段 |
| `low` | 背景状态、例行巡检 | 闲置提醒或摘要 |
| `silent` | 只需记录 | 只写 UI 和 trace |

## 阶段计划

### Phase 0：确认与冻结

目标：

- 确认 `SCHEME-0007` 覆盖“事件播报”和“反馈路由”两部分。
- 确认它不替代 `SCHEME-0003`，而是把其中事件提醒部分具体化。
- 确认本阶段不写世界模型、不执行外部动作、不改其他模块内部链路。

交付：

- 本计划文档。
- README 和方案目录引用。
- 待确认问题列表。

### Phase 1：契约骨架

实现范围：

- 在 `src/core/status-dialogue` 增加事件契约类型。
- 增加纯函数归一化：
  - `normalizeModuleStatusEvent`
  - `buildSystemEventSnapshot`
  - `buildVoiceEventBroadcastRequest`
  - `buildVoiceScriptPatch`
- 不接真实模块事件，仅支持 fixture / 本地模拟。

验收：

- 类型检查通过。
- 契约能表达系统重大变动、星云变动、模块完成、风险和故障。

### Phase 2：只读反馈路由

实现范围：

- 新增只读目录：`runtime/status-events`。
- 新增只读 IPC：
  - `zhineng:status-dialogue:events:get`
- 路径必须限制在项目根目录下。
- 读取坏 JSON 不崩溃，只记录 `read_errors`。
- 不创建、不修改、不删除事件文件。

验收：

- 无事件目录时返回空快照。
- 有事件时能聚合为 `system_event_snapshot.v1`。
- 重复事件按 `dedupe_key` 去重。
- 过期事件进入 stale。

### Phase 3：语音事件编排器

实现范围：

- 将 `system_event_snapshot.v1` 转成 `voice_event_broadcast_request.v1`。
- 结合当前语音状态判断播放策略。
- 与现有 TTS 队列集成。
- 支持 `critical` 打断、`high` 句尾插入、`normal` 合并、`low` 延后、`silent` 静默。
- 同一轮播报必须保持同一音色。

验收：

- 播放中收到 high 事件，能排到当前句子后。
- 播放中收到 critical 事件，能打断并生成恢复语。
- 事件播报失败时写 trace，不影响文字对话。

### Phase 4：右下角 GUI

实现范围：

- 设置面板或巡逻窗口中显示事件播报状态。
- 显示：
  - 队列数量。
  - 当前播放事件。
  - 下一个事件。
  - 权重。
  - 播放策略。
  - 最近 trace。
  - fallback/error。
- 支持手动重播最近一条事件。

验收：

- 用户能从 GUI 看见事件来源和播放状态。
- 不污染主对话输入区。

### Phase 5：3D 星云映射

实现范围：

在 `status-dialogue-system` 下补齐子粒子：

- `voice.event_broadcast`
- `voice.broadcast_queue`
- `voice.priority_gate`
- `voice.script_composer`
- `voice.interrupt_resume`
- `voice.event_trace`
- `runtime.feedback_router`
- `runtime.module_event_contract`
- `policy.requirement_capture_gate`

验收：

- 每个子粒子都有输入、输出、状态、来源、边界和负责闸口。
- 星云目录能查到事件链路。
- 事件可以从来源模块追溯到播报 trace。

### Phase 6：新增系统接入清单

实现范围：

定义 `system_feedback_route_manifest.v1`，未来新增系统必须填写：

- `module_id`
- `owner`
- `gate`
- `compass`
- `module_status_card.v1` 出口
- `module_status_event.v1` 出口
- `ttl_ms`
- `severity_mapping`
- `broadcast_policy`
- `privacy_boundary`
- `fallback_behavior`

验收：

- 新增系统没有状态卡时，对话模块能提示缺失。
- 新增系统没有事件出口时，对话模块能提示“无法接收变更/故障事件”。

## 边界

- 不读取模块内部全文。
- 不猜测缺失模块状态。
- 不把用户需求当事实写入世界模型。
- 不执行外部动作。
- 不自动创建 `requirement_packet.v1`。
- 不替代现有状态卡链路。
- 不把每轮对话结束固定播报作为默认行为。

## 验证计划

文档验证：

```text
rg "idea-0007|SCHEME-0007|voice_event_broadcast|module_status_event|system_event_snapshot|system_feedback_route_manifest" D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2
```

代码验证，实施后执行：

```text
npm.cmd run typecheck
npm.cmd run build
```

行为验证，实施后模拟：

1. 无 `runtime/status-events`：返回空事件快照，不报错。
2. 有系统重大变动事件：进入播报队列。
3. 有星云变化事件：生成带 compass 的播报请求。
4. 有模块完成事件：生成完成度播报。
5. 有故障事件：按 warn/high 插入。
6. 有 critical 事件：打断当前播报。
7. TTS 失败：写 trace，文字链路不受影响。

## 2026-06-29 执行前真实验证结果

- `npm.cmd run voice:event-broadcast:validate` 通过。
  - 报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-event-broadcast-validation-20260629080210.json`
  - 结果：3 个事件生成 3 段 `voice_script_patch.v1`；播放模式覆盖 `interrupt_now`、`after_current_sentence`、`merge_into_current_reply`；`voice_profile_lock_all=true`。
- `npm.cmd run typecheck` 通过。
- `npm.cmd run build` 通过。
- 浏览器预览验证通过：
  - URL：`http://[::1]:5173/?window=zhineng-graph`
  - 右下角 `Subject Status Dialogue` 存在。
  - 设置面板事件区可见 `queue`、`req`、`urgent`、`trace`、`refresh events`、`play queue`、`broadcast queue idle` 和 `voice_script_patch.v1`。
  - 3D 粒子 OS 显示 `19 个星云`、`288 个内容星点`。
  - canvas 截图像素检查确认非空白：`nonDarkRatio=0.798`、`colorishRatio=0.062`。
- 当前结论：SCHEME-0007 Phase 4-6 已具备继续进入真实事件样本接入、心跳联动和后续播报策略优化的执行条件。

## 已确认项

1. 确认 `SCHEME-0007` 同时覆盖“重大事件/星云变化播报”和“全系统反馈路由 + 语音事件编排器”。
2. 确认先进入 Phase 1-3，暂不做完整 GUI 和 3D 映射实现。
3. 确认 `runtime/status-events` 作为第一阶段只读事件目录。
4. 确认未来新增系统必须同时提供 `module_status_card.v1` 和 `module_status_event.v1`。
5. 确认 `critical` 事件允许打断当前语音，`high` 事件在当前句子后插入。
