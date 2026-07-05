# NestedEventSplitGate.v1 嵌套事件拆分门槛

状态：`draft_pending_user_review`

日期：2026-07-04

## 0. 目标

`NestedEventSplitGate.v1` 定义何时把复杂内容拆成 `NestedEvent`，何时只保留为 `AtomicFact`、`TagAssignment`、`SummaryShard` 或原文证据。

目标是避免两个极端：

```text
过粗：复杂事件被一个父事件吞掉，检索和证据核对失效。
过细：每句话都变成事件，事件数量爆炸，检索噪声变大。
```

## 1. 输入和输出

输入：

```text
SourceArchive
SignalFrame
RawObservation
SemanticUnit
EntityMention
CandidateTagSet
ExistingEventContext
```

输出：

```json
{
  "gate_name": "nested_event_split_gate.v1",
  "decision": "create_nested_event | keep_semantic_unit | create_atomic_fact | attach_tag_only | needs_review",
  "reason_codes": [],
  "required_evidence_anchor_ids": [],
  "suggested_event_family": "",
  "suggested_event_type": "",
  "blocked_reasons": []
}
```

## 2. 可拆成 NestedEvent 的条件

一个候选语义单元应拆成 `NestedEvent`，需要满足：

```text
有明确主体或系统主体
有行动、状态、边界、承诺、拒绝、冲突、风险、情绪、条件、证据变化之一
有独立证据锚点
可被人物、事件、时间或标签独立检索
对目标、时间线、权重或上下文组装有价值
```

建议至少命中 2 个正向条件，且没有硬性阻断。

## 3. 正向触发器

| 触发器 | 拆分理由 | 示例 |
| --- | --- | --- |
| 新行动 | 行为可独立追踪 | 发送文件、通知仓库、付款 |
| 新状态 | 状态影响判断 | 预算待确认、付款未完成 |
| 新承诺 | 未来行为或责任 | 明天更新、周五付款 |
| 新拒绝 | 明确否定或阻断 | 不要发货、不是分手 |
| 新条件 | 影响执行边界 | 付款后再通知 |
| 新冲突 | 多来源不一致 | 发票金额与 PO 金额不同 |
| 新情绪 | 影响关系维护 | 压力、焦虑、需要空间 |
| 新边界 | 关系或动作约束 | 不想被追问、不要催 |
| 新证据 | 证据链变化 | 新截图、新 OCR、文档更新 |
| 新时间目标 | 进入时间轴 | 明天下午、周六晚上 |
| 新人物角色 | 角色变化影响解释 | 决策人、财务、法务加入 |
| 新风险 | 需要冷读或确认 | 高风险、V5、阻断 |

## 4. 不拆分条件

以下内容不应生成 `NestedEvent`：

```text
礼貌寒暄
重复前一事实
纯修饰语
没有证据锚点
只有模型猜测
没有独立检索价值
只为了补齐标签维度
只是父事件摘要的一部分
```

处理方式：

| 情况 | 处理 |
| --- | --- |
| 只是数值、时间、地点 | `AtomicFact` |
| 只是分类信息 | `TagAssignment` |
| 只是摘要性复述 | `SummaryShard` |
| 信息不足但可能重要 | `needs_review` |
| 无证据 | 保留原文，不写事件 |

## 5. 拆分层级

第一版层级限制：

```text
CaseCorpus
-> EventThread
-> CompositeEvent
-> NestedEvent
```

`AtomicFact` 不算主层级，它作为 `NestedEvent` 的事实支撑。

禁止无限下钻。若事件仍然复杂，优先用：

- `EventRelationEdge`
- `AtomicFact`
- `ConflictSet`
- `SummaryShard`
- `tag_assignments`

而不是继续增加层级。

## 6. 边界案例判断

### 6.1 一句话多事件

原文：

```text
不要通知仓库发货，等我确认付款后再说。
```

拆分：

```text
NestedEvent A: 禁止通知仓库发货
AtomicFact B: 付款确认是释放条件
EventRelationEdge: B ENABLES A解除阻断
```

### 6.2 否定和限定

原文：

```text
我不是要分手，只是现在不想被追问。
```

拆分：

```text
NestedEvent A: 否定分手
NestedEvent B: 不想被追问
EventRelationEdge: A QUALIFIES B
```

不得写入：

```text
RelationshipState=breakup
RelationshipState=worse
```

### 6.3 冲突事实

原文：

```text
invoice_total=12800 CNY，po_total=11800 CNY。
```

拆分：

```text
AtomicFact A: invoice_total=12800 CNY
AtomicFact B: po_total=11800 CNY
ConflictSet: amount_mismatch
NestedEvent: invoice_amount_mismatch
```

### 6.4 公开案件式材料

判决书或报道中的事实描述应拆为：

```text
source_claimed_fact
time_profile
role_binding
evidence_anchor
fact_status:claimed
```

不得直接写：

```text
legal_judgment_generated=true
fact_status:confirmed_by_system
```

## 7. 决策矩阵

| 维度 | 0 分 | 1 分 | 2 分 |
| --- | --- | --- | --- |
| 证据 | 无证据 | 摘要或转述 | 原文/结构化记录 |
| 主体 | 不明 | 候选主体 | 明确主体 |
| 行为/状态 | 无 | 弱状态 | 明确行动或状态 |
| 时间 | 无 | 模糊 | 明确时间或顺序 |
| 检索价值 | 无 | 低 | 高 |
| 目标影响 | 无 | 背景 | 影响目标/风险 |
| 独立性 | 复述 | 依赖父事件 | 可独立解释 |

建议：

```text
总分 >= 8：创建 NestedEvent
总分 5-7：needs_review 或保留 SemanticUnit
总分 2-4：AtomicFact / TagAssignment / SummaryShard
总分 < 2：不拆分
```

硬性阻断：

- 无证据锚点。
- 纯模型猜测。
- 涉及关系状态写入但无确认门。
- 涉及身份合并但无确认门。
- 涉及外部动作但无动作门。

## 8. Gate 输出解释要求

每次拆分必须输出：

```text
为什么拆
拆成什么
引用哪些证据
属于哪个父事件
属于哪条事件线
是否需要确认
是否存在冲突
为什么没有继续下钻
```

## 9. 通过标准

`NestedEventSplitGate.v1` 方案通过需要满足：

```text
split_decision_has_reason_codes=true
no_nested_event_without_evidence=true
no_sentence_level_mechanical_split=true
atomic_fact_not_forced_into_event=true
negative_and_qualification_preserved=true
conflict_routes_to_conflict_set=true
relationship_state_write_blocked=true
identity_merge_blocked=true
external_action_blocked=true
```

