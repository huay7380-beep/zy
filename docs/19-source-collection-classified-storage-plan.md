# 数据采集层分类存储正式方案

状态：`formal_plan_registered_pending_implementation`

日期：2026-07-01

适用范围：人际关系图谱、事件关系图谱、多源数据采集、原文归档、事件拆分、人物绑定、标签提取、摘要分片、权重分层、星云只读展示投影。

关联必读文档：`docs/18-relationship-event-graph-memory-plan.md`。后续进行人际关系图谱或事件关系图谱构建时，应先读取 `docs/18` 的关系边界和确认规则，再读取本文的数据采集层、权重和星云投影方案。

本文件的数据采集层方向已按用户 2026-07-01 的确认意见更新，并升级为正式方案。本文用于指导后续 schema、runtime、流程树和星云投影建设；在进入具体实现前，不得据此直接修改人际关系图谱规则、确认关系状态或开启真实外部动作。

## 0. 已确认边界

1. `SourceArchive` 第一版采用本地文件归档，不立即接数据库或对象存储。
2. `NestedEvent` 第一版采用语义子事件粒度，不做逐句机械切分。
3. `WeightProfile` 第一版采用规则权重；规则权重必须有明确完成度、边界和可验证标准。学习权重后续接入，但必须有清晰接入边界和回退机制。
4. 星云第一版只展示人物、信源、事件、标签、确认门槛五类节点。
5. 保留 `V0-V5` 可视权重等级；后续如果不能满足需求，必须通过权重等级优化闸门进行升级，不能无审计地直接改等级含义。

## 1. 目标

先确定数据采集层的分类存储方案，避免后续在事件抽取、人物归并、嵌套事件、摘要检索、权重分析和星云展示中返工。

本方案要解决：

- 来源数据如何并行收录。
- 原始文本、截图、文件、网页、API 快照如何永久归档。
- 同一来源内容如何按来源、时间、人物、事件、嵌套事件分层。
- 标签和分类提取如何保持便捷。
- 权重如何在记录层、目标层和星云展示层分开。
- 星云如何让人用肉眼看出权重、确认状态和事件层级。
- 星云如何保持只读观察，不污染事实源。

## 2. 核心结论

采用“三层事实存储 + 一层只读星云投影”。

```text
SourceArchive
-> SourceEpisode
-> RawEvent
-> SemanticEvent / NestedEvent
-> WeightProfile
-> SummaryShard
-> ContextSnapshot
-> NebulaProjection
-> visual_operation_intent
```

三层事实存储：

1. `SourceArchive`：源完整档案层，保存原始数据和证据，不做解释。
2. `EventLedger`：事件流水层，保存 `SourceEpisode`、`RawEvent`、`SemanticEvent`、`NestedEvent`。
3. `GraphMemoryDatabase`：正式属性图层，保存人物、来源身份、事件、摘要、证据、上下文快照和关系更新提案。

一层只读投影：

4. `NebulaProjection`：星云展示层，只读取事实源并生成可视化投影，不写事实、不改关系、不执行外部动作。

## 3. 不采用的方案

不采用单一 JSONL 方案。JSONL 适合过渡，但不适合长期处理跨人物、跨来源、嵌套事件和星云投影。

不采用单一 PostgreSQL JSONB 方案。JSONB 能保存复杂结构，但多跳人物、事件、标签、证据关系会变重。

不采用单一向量数据库方案。向量适合相似检索，不适合表达可解释的事件链、人物参与、证据来源和确认门。

不让星云成为事实源。星云只显示，不修改事实。

正式阶段建议采用：

```text
SourceArchive + Neo4j/属性图 + 全文索引 + 向量索引 + NebulaProjection
```

当前仓库阶段可先用本地文件、JSON/JSONL、manifest 和可重建索引做过渡。

## 4. 来源分类

所有来源并行收录，不按业务优先级排除。测试阶段可以先以微信桌面作为首条验证通路。

来源类型：

- `desktop`：微信桌面、其他聊天软件窗口、桌面 OCR。
- `browser`：网页 DOM、网页 HTML、网页快照。
- `api`：业务系统、CRM、订单系统、客户系统。
- `file`：聊天导出、Markdown、CSV、JSON、PDF、截图包。
- `ocr`：图片、截图、视频帧文字识别。
- `webhook`：外部事件推送。
- `manual`：用户手工输入、人工复盘、人工标注。

每个来源进入系统前必须先声明 `SourceAdapterCapability`，再输出 `IntakeObservation` 或 `SourceEpisode`，不得绕过采集层直接进入决策层。

## 5. 分层数据对象

### 5.1 SourceArchive

`SourceArchive` 是源完整数据的事实源。它只保存“收到了什么”，不判断人物关系，不确认事件结论。

建议字段：

```json
{
  "schema_version": "source_archive.v1",
  "source_archive_id": "source_archive_xxx",
  "source_type": "desktop",
  "platform": "wechat",
  "adapter_id": "sightflow_desktop.wechat",
  "captured_at": "2026-07-01T00:00:00+08:00",
  "source_thread_id": "wechat_thread_xxx",
  "raw_text_ref": "archive/source/raw-text.txt",
  "raw_payload_ref": "archive/source/raw.json",
  "artifact_refs": ["archive/source/screenshot.png"],
  "content_hash": "sha256:...",
  "privacy_level": "artifact_allowed",
  "delete_state": "active",
  "metadata": {}
}
```

规则：

- 完整源数据永久保存，除非用户手动删除。
- 原文和附件不被摘要覆盖。
- 删除应写入 tombstone 或审计记录，而不是静默消失。
- 后续所有事件、摘要、权重、星云节点都必须能追溯到 `source_archive_id`。

### 5.2 SourceEpisode

`SourceEpisode` 表示一次采集单元，例如一次微信窗口读取、一次网页快照、一个客户系统 JSON、一次人工记录。

建议字段：

```json
{
  "schema_version": "source_episode.v1",
  "episode_id": "episode_xxx",
  "source_archive_id": "source_archive_xxx",
  "source_type": "desktop",
  "platform": "wechat",
  "thread_id": "thread_xxx",
  "captured_at": "2026-07-01T00:00:00+08:00",
  "time_window": {
    "start_at": "2026-07-01T00:00:00+08:00",
    "end_at": "2026-07-01T00:03:00+08:00"
  },
  "participants_hint": ["user", "source_actor_xxx"],
  "source_identity_hints": [],
  "raw_event_ids": [],
  "content_fingerprint": "sha256:...",
  "status": "collected"
}
```

规则：

- `SourceEpisode` 是 `RawEvent` 的父级来源。
- 一个 episode 可拆成多个 `RawEvent`。
- 同一 episode 内允许多个事件和嵌套子事件。
- episode 不确认人物事实，只保存人物线索。

### 5.3 RawEvent

`RawEvent` 是原始事件。它从 `SourceEpisode` 切分而来，只做事实搬运。

切分规则：

- 聊天可按消息、连续话轮、短时间语义块切分。
- 网页可按页面块、表单、客户记录、页面状态切分。
- API 可按业务记录、状态变更、交互动作切分。
- 手工输入可按用户显式分段或语义段切分。

规则：

- `RawEvent` 必须保留原文引用或原文片段。
- 未确认人物不得写入 `linked_person_ids`，只能保留 `participants_hint` 或 `source_identity_hints`。
- `RawEvent` 可以有初始标签，但不能直接写关系状态。

### 5.4 SemanticEvent

`SemanticEvent` 是从 `RawEvent` 抽取出的结构化语义事件。

建议分类：

- 销售推进：报价、预算、会议、决策、异议、承诺、竞品、合同、交付、售后。
- 恋爱维护：亲密信号、关系称呼、邀约、拒绝、边界、冷淡、修复、节奏变化、风险信号。
- 通用关系：帮助、冲突、感谢、承诺、失约、隐私、风险、偏好、长期无互动。
- 系统事件：采集失败、OCR 不完整、身份待确认、重复来源、摘要待生成。

规则：

- 每个 `SemanticEvent` 必须引用一个或多个 `RawEvent`。
- 必须包含标签、置信度、证据引用和是否需要确认。
- 高风险事件、关系变化事件、身份合并事件必须进入确认门。

### 5.5 NestedEvent

`NestedEvent` 用于保存更深层事件，解决“一段内容里有多个子事件”的问题。

层级建议：

```text
SourceEpisode
-> SceneSegment
-> ParentEvent
-> NestedEvent
-> Signal
```

例子：

```text
一次微信对话 episode
-> 当前关系调侃场景 scene
-> 关系称呼试探 parent event
-> 对方说“是不是男朋友” nested event
-> 用户追问“现在算吗” nested event
-> 亲密称呼信号 signal
```

规则：

- 父事件不吞掉子事件。
- 子事件必须能独立打标签、算权重、绑定人物、引用证据。
- 父事件的权重由子事件聚合，但子事件仍然保留独立可见性。

### 5.6 SummaryShard

`SummaryShard` 是摘要分片，只用于加速检索和上下文装配，不替代原文。

摘要维度：

- `person_summary`：按人物。
- `event_summary`：按事件。
- `time_window_summary`：按 today、last_7_days、last_30_days、history。
- `goal_domain_summary`：按销售推进、恋爱维护、通用关系等目标域。
- `tag_summary`：按标签。
- `thread_summary`：按会话线程。

规则：

- 摘要必须保存来源引用。
- 摘要必须标注生成时间和覆盖范围。
- 摘要不能覆盖原始事实。
- 摘要过期后可重建，但不能删除源数据。

## 6. 标签体系

标签分为基础标签和派生标签。

基础标签：

- `source:*`
- `platform:*`
- `person:*`
- `relationship:*`
- `event_type:*`
- `time_window:*`
- `goal_domain:*`
- `privacy:*`

派生标签：

- `risk:*`
- `sales_stage:*`
- `romantic_stage:*`
- `confirmation:*`
- `evidence:*`
- `sentiment:*`
- `intent:*`
- `follow_up:*`

标签规则：

- 标签可多维叠加。
- 标签必须可被索引。
- 高风险、身份确认、关系更新、外部执行相关标签不得由模型静默写成事实，必须进入确认或审计。

## 7. 权重分层

权重分三层，不混用。

### 7.1 intrinsic_weight

记录本体权重。表示该记录自身重要性，较稳定。

影响因素：

- 来源可靠度。
- 原文完整度。
- 证据完整度。
- 事件等级。
- 是否多源重复。
- 是否关联已确认人物。
- 是否关联已确认关系。
- 是否包含风险或承诺。

### 7.2 contextual_weight

当前目标权重。表示记录在某次目标、人物、时间窗下的重要性。

例子：

- “价格贵”在销售推进目标下高权重。
- “价格贵”在恋爱维护目标下低权重。
- “对方说是不是男朋友”在恋爱关系维护目标下高权重。
- 同一句话在客户推进目标下可能只是背景噪声。

### 7.3 visual_weight

星云展示权重。它是给人眼看的投影权重，由 `intrinsic_weight` 和 `contextual_weight` 归一化生成。

规则：

- `visual_weight` 不能写回事实层。
- 星云亮度不代表事实更真，只代表当前观察焦点下更值得看。
- 高亮节点必须能解释高亮理由。

## 8. WeightProfile

建议新增 `WeightProfile`，挂在 `SourceEpisode`、`RawEvent`、`SemanticEvent`、`NestedEvent`、`SummaryShard`、`RelationshipUpdateProposal`、`ContextSnapshot` 上。

```json
{
  "schema_version": "graph_weight_profile.v1",
  "weight_profile_id": "weight_profile_xxx",
  "target_ref": {
    "node_id": "semantic_event_xxx",
    "node_type": "semantic_event"
  },
  "intrinsic_weight": 0.62,
  "contextual_weight": 0.84,
  "visual_weight": 0.78,
  "weight_level": "V3",
  "evidence_strength": 0.8,
  "source_reliability": 0.7,
  "event_impact": 0.65,
  "goal_relevance": 0.9,
  "relationship_impact": 0.6,
  "risk_priority": 0.2,
  "confirmation_need": 0.4,
  "calculation_basis": [
    "原文存在",
    "目标人物相关",
    "命中当前销售推进目标",
    "非关系状态更新"
  ],
  "created_at": "2026-07-01T00:00:00+08:00"
}
```

## 9. 权重等级

星云展示使用 `V0-V5`，避免和事件等级 `P1/P2/P3` 混淆。

| 层级 | 含义 | 适合内容 |
| --- | --- | --- |
| `V0` | 背景档案 | 原始来源、低相关旧记录 |
| `V1` | 普通信号 | 已归档但暂不影响当前目标 |
| `V2` | 有效线索 | 关联人物、事件或标签，可检索 |
| `V3` | 当前相关 | 与当前目标、人物、时间窗强相关 |
| `V4` | 决策关键 | 影响下一步建议、风险判断、推进策略 |
| `V5` | 确认门事件 | 关系更新、高风险、身份合并、重要状态变化 |

`V5` 不代表可以更新关系，只代表必须让人类看到并确认。

## 10. 嵌套事件权重聚合

父事件权重不等于子事件平均值。建议：

```text
parent_visual_weight = max(child_visual_weight) * 0.6 + top_children_average * 0.4
```

规则：

- 高权重子事件可以点亮父事件。
- 展开后必须显示真正高权重的子事件。
- 父事件不能吞掉子事件的证据和标签。

## 11. 星云可视化投影规则

星云显示的是 `NebulaProjection`，不是事实数据库本身。

肉眼可见编码：

- 节点大小：`intrinsic_weight`。
- 节点亮度：`contextual_weight`。
- 节点透明度：证据强度或置信度。
- 节点颜色：节点类别或事件类别。
- 节点边框：确认状态。
- 节点脉冲：待处理状态。
- 边线粗细：关系强度、证据数量或影响程度。
- 边线颜色：边类型。
- 距离中心远近：当前目标相关度。
- 时间轨道：today、last_7_days、last_30_days、history。
- 展开层级：父事件展开后显示子事件和信号点。

边框建议：

- 实线：已确认。
- 虚线：候选。
- 双环：需要用户确认。
- 红环：高风险或阻断。

脉冲建议：

- 无脉冲：普通可读节点。
- 慢脉冲：待补证据。
- 中脉冲：待用户确认。
- 快脉冲：高风险或当前阻断。

## 12. NebulaVisualProfile

建议新增 `NebulaVisualProfile`。

```json
{
  "schema_version": "nebula_visual_profile.v1",
  "projection_id": "nebula_projection_xxx",
  "node_id": "semantic_event_xxx",
  "source_weight_profile_ref": "weight_profile_xxx",
  "visual_weight_level": "V4",
  "node_size": 0.78,
  "brightness": 0.84,
  "opacity": 0.72,
  "color_channel": "risk_or_goal_relevant_event",
  "border_style": "double_ring_requires_confirmation",
  "pulse_state": "pending_user_review",
  "edge_thickness": 0.66,
  "label_priority": 4,
  "explainability": {
    "why_visible": [
      "当前目标相关",
      "关联目标人物",
      "需要用户确认"
    ],
    "source_refs": ["source_archive_xxx", "raw_event_xxx"]
  }
}
```

规则：

- `NebulaVisualProfile` 只属于展示层。
- 不允许由星云反写 `WeightProfile`、`RawEvent`、`SemanticEvent`、`Person` 或 `RelationshipState`。
- 星云操作只能生成 `visual_operation_intent`。

## 13. 星云操作意图

允许输出：

- `visual_operation_intent.inspect`
- `visual_operation_intent.expand`
- `visual_operation_intent.compare`
- `visual_operation_intent.open_evidence`
- `visual_operation_intent.request_confirmation`
- `visual_operation_intent.filter_by_tag`
- `visual_operation_intent.focus_person`
- `visual_operation_intent.focus_time_window`

禁止输出：

- 直接修改人物。
- 直接修改关系状态。
- 直接确认身份。
- 直接删除源数据。
- 直接发送消息。
- 直接执行外部工具。

## 14. 检索设计

必须支持以下检索：

- 按来源：`source_type/platform/adapter/thread/source_archive_id`
- 按时间：`captured_at/occurred_at/time_window`
- 按人物：`person_id/source_identity_id/participant_hint`
- 按关系：`relationship_id/type_code/relationship_state`
- 按事件：`raw_event_id/semantic_event_id/nested_event_id/event_type`
- 按标签：`tag/goal_domain/risk/confirmation`
- 按权重：`V0-V5/intrinsic/contextual/visual`
- 按证据：`source_archive_id/content_hash/artifact_ref`

热路径：

- 读索引、摘要分片、近时事件、高权重事件、确认门事件。

冷路径：

- 展开完整原文、截图、附件、低频历史、证据复核。

## 15. 当前仓库映射

已有基础：

- `schemas/graph-memory-database.schema.json` 已定义 `compact_property_graph` 目标。
- `schemas/intake-observation.schema.json`、`schemas/raw-event.schema.json`、`schemas/semantic-event.schema.json` 已存在。
- `packages/intake-runtime` 已支持 observation 标准化和 RawEvent 映射。
- `packages/storage-runtime` 已支持人物、关系、RawEvent、SemanticEvent、反馈、审计和索引。
- `packages/identity-resolution` 已支持确认身份回填 RawEvent。
- `packages/mvp-runtime/src/desktop-context-bridge.mjs` 已能生成 `ContextSnapshot` 试运行产物。
- `3d-particle-display-os` 已有只读投影边界。

待补缺口：

- `SourceArchive` schema/runtime。
- `SourceEpisode` schema/runtime。
- `NestedEvent` schema/runtime。
- `SummaryShard` schema/runtime。
- `WeightProfile` schema/runtime。
- `NebulaProjection` schema/runtime。
- `NebulaVisualProfile` schema/runtime。
- `storage query -> ContextSnapshot` 生产级适配。
- 图数据库迁移计划和最小运行时。

## 16. 最小验证闭环

确认后第一阶段验证建议：

1. 输入 3 条来源：微信桌面、网页快照、手工记录。
2. 每条来源写入 `SourceArchive`。
3. 每条来源生成 `SourceEpisode`。
4. 每个 episode 至少拆出 1 个 `RawEvent`。
5. 至少 1 个 RawEvent 拆出 2 个 `NestedEvent`。
6. 每个 Semantic/Nested Event 至少有 2 个标签。
7. 每个事件有 `WeightProfile`。
8. 生成 `SummaryShard`。
9. 生成一个 `ContextSnapshot`。
10. 生成一个 `NebulaProjection`。
11. 星云投影能解释高亮原因。
12. 星云投影只能输出 `visual_operation_intent`，不能写事实层。

## 17. 通过门槛

必须通过：

- 每个星云节点可追溯到来源或摘要来源。
- 每个高亮节点能说明高亮原因。
- 每个待确认节点能显示确认原因和证据。
- 原文和摘要分离。
- 源数据删除必须由用户触发。
- 关系更新只能进入提案，不得直接写入关系状态。
- 星云只读，不写业务事实。

## 18. 已确认方案细化

### 18.1 本地文件归档边界

第一版 `SourceArchive` 使用本地文件归档，建议路径为：

```text
runtime/source-archives/<source_type>/<platform>/<yyyy-mm-dd>/<source_archive_id>/
```

每个归档目录至少包含：

- `manifest.json`：来源、平台、采集时间、线程、参与者提示、隐私等级、删除状态、hash。
- `raw.txt`、`raw.html`、`raw.json` 或其他原始载荷文件：保存完整原文或完整源数据。
- `artifacts/`：截图、附件、OCR 图像、网页快照等。
- `checksums.json`：内容 hash 和附件 hash。
- `tombstone.json`：仅在用户手动删除或要求隐藏时生成。

规则：

- 本地归档是第一版事实源，不允许摘要覆盖原文。
- `SourceEpisode`、`RawEvent`、`SemanticEvent`、`NestedEvent`、`SummaryShard`、`WeightProfile`、`NebulaProjection` 都必须可追溯到 `source_archive_id`。
- 删除只能由用户触发；系统不得因摘要、去重、低权重或低相关性自动删除源数据。
- 后续迁移到对象存储或数据库时，必须保持 `source_archive_id`、hash、manifest 和证据引用不变。

### 18.2 语义子事件边界

`NestedEvent` 的第一版粒度是“语义子事件”，不是逐句切分。

一个语义子事件必须满足至少一项：

- 产生了新的目标推进信号。
- 产生了新的关系维护信号。
- 产生了新的承诺、拒绝、风险、边界、情绪变化或身份确认信号。
- 对销售推进、恋爱关系维护或通用人际关系判断有独立检索价值。

禁止：

- 把每句话都切成事件。
- 生成没有独立意义的复述节点。
- 生成无法追溯原文证据的子事件。
- 用模型臆测补全没有出现的动机、关系状态或承诺。

如果一段文本无法稳定拆出语义子事件，应保留为 `RawEvent` 或 `SemanticEvent`，不得强行生成 `NestedEvent`。

### 18.3 规则权重完成度

第一版规则权重必须完成到可解释、可复算、可测试。

`WeightProfile` 至少包含以下规则输入：

- `source_reliability`：信源可靠度。
- `evidence_strength`：证据强度。
- `event_impact`：事件本身影响。
- `goal_relevance`：对当前目标的相关度。
- `relationship_impact`：对关系状态或关系维护的影响。
- `risk_priority`：风险优先级。
- `recency`：时间新鲜度。
- `confirmation_need`：是否需要用户确认。

规则权重输出：

- `intrinsic_weight`：记录自身稳定重要性。
- `contextual_weight`：当前目标下的重要性。
- `visual_weight`：星云显示强度。
- `weight_level`：`V0-V5`。
- `calculation_basis`：可解释计算依据。

完成标准：

- 同一输入必须得到同一输出。
- 每个高亮节点必须解释为什么高亮。
- 每个 `V4/V5` 必须能列出触发规则和证据来源。
- 每个权重结果必须能从 fixture 中复现。
- 权重不得直接修改人物关系、身份归并、事件事实或外部执行状态。

### 18.4 规则权重边界

规则权重只能用于排序、检索、提醒、展示和上下文组装。

规则权重不能用于：

- 直接确认关系变更。
- 直接确认人物身份合并。
- 直接确认事件真伪。
- 直接触发外部发送、删除、同步或执行。
- 将高权重等同于高真实性。

`V5` 的含义是“确认门槛事件”，不是“系统已经确认的事实”。进入 `V5` 后只能生成待确认节点、证据包或确认请求。

### 18.5 学习权重接入边界

学习权重不得在第一版直接启用。只有规则权重通过验证并积累足够人工反馈后，才能进入学习权重影子阶段。

学习权重接入前置条件：

- 规则权重测试通过。
- 已有人工确认、人工驳回、误报、漏报、检索命中反馈。
- 已有固定评测集和回放脚本。
- 学习权重输出可解释，至少能说明主要影响特征。
- 存在一键回退到规则权重的机制。

学习权重第一阶段只能：

- 提议 `contextual_weight` 或 `visual_weight` 的调整。
- 生成对比报告。
- 在 shadow mode 中和规则权重并行评估。

学习权重第一阶段不得：

- 改写 `intrinsic_weight` 的事实层意义。
- 直接修改 `weight_level` 的正式结果。
- 修改人物关系、事件事实、身份合并或外部动作。
- 替代用户确认。

学习权重转正必须通过单独确认，不得随着普通版本更新自动启用。

### 18.6 星云第一版节点范围

星云第一版只展示：

- `person`：人物。
- `source`：信源或来源归档。
- `event`：事件，包含 `RawEvent`、`SemanticEvent`、`NestedEvent` 的投影。
- `tag`：标签。
- `confirmation_gate`：待确认门槛。

其他节点类型必须后续单独论证，不进入第一版。

### 18.7 V0-V5 权重等级边界

`V0-V5` 是显示权重等级，不是事实等级，也不是事件严重等级。

| 等级 | 边界 |
| --- | --- |
| `V0` | 背景档案，只在展开历史或证据链时显示。 |
| `V1` | 普通信号，可检索但不主动突出。 |
| `V2` | 有效线索，可作为上下文候选。 |
| `V3` | 当前相关，需要在目标上下文中可见。 |
| `V4` | 决策关键，应在星云中明显突出并解释原因。 |
| `V5` | 确认门槛，必须进入用户确认或多重验证流程。 |

### 18.8 权重等级优化闸门

如果 `V0-V5` 后续不能满足需求，不允许直接改旧等级含义。必须进入权重等级优化流程。

触发条件：

- 高权重误报过多，导致用户无法信任星云高亮。
- `V3/V4/V5` 节点过密，导致肉眼不可区分。
- 销售客户推进和恋爱关系维护出现明显不同权重语义，单套等级不足以表达。
- 新场景需要区分“紧急风险”“长期价值”“情绪敏感”“关系边界”等不同维度。
- 学习权重评估显示现有等级造成稳定排序错误。

优化方式：

- 优先增加辅助维度，例如风险 badge、目标域 badge、确认状态边框，而不是立即增加主等级。
- 如果必须扩展等级，使用版本化方案，例如 `visual_weight_level_schema: v2`。
- 旧数据保持旧等级解释，新数据按新版本计算。
- 必须提供迁移脚本、回放报告和新旧视觉对比。
- 必须经过用户确认后才能替换星云展示等级。

## 19. 执行方案

执行采用“先文档定界，再 schema，再 runtime，再验证闭环，再星云投影”的顺序。

### 19.1 阶段 A：正式化方案文档

目标：

- 本文已从草案升级为正式方案文档。
- 将 `docs/18-relationship-event-graph-memory-plan.md` 和本文建立互相引用。
- 明确未来构建人际关系图谱和事件关系图谱前必须阅读两份文档。

产物：

- 正式方案文档。
- 必读引用说明。

验证：

- 文档状态更新。
- 关键边界包括：本地归档、语义子事件、规则权重、学习权重、星云只读、V0-V5 优化闸门。

### 19.2 阶段 B：schema 层

目标：

- 新增或扩展数据结构，不接真实外部执行。

建议新增：

- `schemas/source-archive.schema.json`
- `schemas/source-episode.schema.json`
- `schemas/nested-event.schema.json`
- `schemas/summary-shard.schema.json`
- `schemas/weight-profile.schema.json`
- `schemas/nebula-projection.schema.json`
- `schemas/nebula-visual-profile.schema.json`

验证：

- schema 可被本地 validator 加载。
- fixture 覆盖本地归档、嵌套事件、权重、星云投影。
- 所有对象必须包含来源追溯字段。

### 19.3 阶段 C：本地归档 runtime

目标：

- 建立 `SourceArchive` 本地文件归档能力。
- 让每条输入先进入 archive，再进入事件层。

建议产物：

- `packages/intake-runtime` 中的 source archive builder。
- `runtime/source-archives/**` 样例输出。
- `checksums.json` 和 `manifest.json` 生成逻辑。

验证：

- 同一输入 hash 稳定。
- 原文、附件、manifest 可追溯。
- 删除只产生 tombstone，不静默删除。

### 19.4 阶段 D：事件分层 runtime

目标：

- 将 `SourceEpisode`、`RawEvent`、`SemanticEvent`、`NestedEvent` 串起来。

验证：

- 微信桌面、网页快照、手工记录三类样例都能进入同一链路。
- 至少一个 `RawEvent` 拆出两个语义子事件。
- 每个语义子事件有 parent、participants、evidence span、tags。

### 19.5 阶段 E：规则权重引擎

目标：

- 实现第一版 `WeightProfile` 规则权重。

验证：

- 固定 fixtures 覆盖销售推进、恋爱关系维护、普通人际、低证据、高风险、确认门槛。
- 同输入同输出。
- `V4/V5` 必须输出解释。
- 权重结果只影响排序、检索和展示，不写关系状态。

### 19.6 阶段 F：摘要和上下文组装

目标：

- 生成 `SummaryShard`。
- 按人物、事件、时间、标签、目标域提取上下文。

验证：

- 摘要可追溯原文。
- 检索时可走热路径；需要证据时可展开冷路径。
- 摘要不得替代原始证据。

### 19.7 阶段 G：星云只读投影

目标：

- 生成 `NebulaProjection` 和 `NebulaVisualProfile`。
- 只投影人物、信源、事件、标签、确认门槛五类节点。

验证：

- 节点大小、亮度、透明度、边框、脉冲、连线粗细可表达权重和状态。
- 每个高亮节点有解释。
- 星云只能输出 `visual_operation_intent`，不能反写事实。

### 19.8 阶段 H：流程树和观察入口

目标：

- 在方案通过后，再将模块登记到 `examples/system-process-tree.json`。
- 同步 Obsidian 视图和只读星云投影入口。

验证：

- 使用 `npm.cmd run process-tree:validate`。
- 确保 3D particle OS 仍是只读投影，不成为事实源。

## 20. 后续执行编排基线

后续 schema/runtime/验证闭环建设按以下顺序推进：

1. 先将本文升级为正式方案文档，并把 `docs/18-relationship-event-graph-memory-plan.md` 与本文互相引用。
2. 再新增 schema 层，不先动真实业务逻辑。
3. 再做本地 `SourceArchive` 归档 runtime。
4. 再做事件分层和语义子事件。
5. 再做规则权重和验证 fixture。
6. 再做摘要、上下文组装和星云只读投影。
7. 最后做流程树登记、Obsidian 同步和验证命令。

本文升级和流程树注册完成后，后续 schema/runtime 实现仍需按阶段执行，并保留关系更新、真实外部动作和学习权重转正的独立确认门槛。
