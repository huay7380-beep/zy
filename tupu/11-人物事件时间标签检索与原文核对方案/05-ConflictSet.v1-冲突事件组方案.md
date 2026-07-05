# ConflictSet.v1 冲突事件组方案

状态：`draft_pending_user_review`

日期：2026-07-04

## 0. 目标

`ConflictSet.v1` 解决多来源、多人物、多时间线下的冲突事实如何保存、检索、核对和进入上下文。

核心原则：

```text
冲突未解决前，不输出单一结论。
冲突双方都必须保留。
上下文组装必须成组携带冲突。
星云展示必须显示冲突关系。
relationship_state_writes=0。
identity_merges_applied=0。
external_actions_executed=0。
external_action_allowed=false。
```

## 1. 什么是冲突

冲突不是简单“不一致”，而是两个或多个事实断言无法同时成立，或需要进一步确认。

常见冲突类型：

```text
amount_mismatch
time_conflict
identity_conflict
status_conflict
instruction_conflict
relationship_signal_conflict
source_claim_conflict
causal_conflict
document_conflict
```

## 2. ConflictSet 结构

建议字段：

```json
{
  "schema_version": "conflict_set.v1",
  "conflict_set_id": "conflict_xxx",
  "conflict_type": "amount_mismatch",
  "scope": "atomic_fact|nested_event|identity|time|instruction",
  "claims": [],
  "related_event_ids": [],
  "related_atomic_fact_ids": [],
  "evidence_anchor_ids": [],
  "resolution_state": "unresolved",
  "requires_cold_read": true,
  "requires_user_confirmation": false,
  "created_from": "conflict_set.v1"
}
```

## 3. Claim 结构

每个冲突项都必须作为 `Claim` 保存。

```json
{
  "claim_id": "claim_xxx",
  "claim_value": "",
  "claim_type": "amount|time|identity|status|instruction|relationship_signal",
  "source_ref": "source_archive_xxx",
  "event_ref": "nested_evt_xxx",
  "atomic_fact_ref": "fact_xxx",
  "evidence_anchor_id": "evidence_xxx",
  "claim_status": "observed|claimed|inferred|disputed",
  "confidence": 0.0
}
```

规则：

- `claim_status=inferred` 不得自动压过 `observed`。
- 同一来源内部冲突和跨来源冲突要区分。
- 来源可靠性影响排序，不影响是否保留。

## 4. 冲突生成触发器

以下情况应生成 `ConflictSet`：

| 触发器 | 示例 |
| --- | --- |
| 金额不同 | 发票 12800，PO 11800 |
| 时间不同 | 一处说周五，一处说明天下午 |
| 状态不同 | CRM closed_won，客户仍未确认 |
| 指令相反 | 一处说发货，一处说不要发货 |
| 身份不一致 | 同昵称对应不同人 |
| 关系信号冲突 | 需要空间，同时否定分手 |
| 因果不明 | A 可能导致 B，但证据不足 |
| 证据来源冲突 | 官方通报和媒体报道细节不同 |

## 5. 冲突处理状态

```text
unresolved: 尚未解决
needs_cold_read: 需要原文核对
needs_cross_source_check: 需要跨来源核对
needs_user_confirmation: 需要用户确认
resolved_by_evidence: 被证据解决
resolved_by_user: 被用户确认解决
superseded: 被新事实覆盖
```

边界：

- `resolved_by_evidence` 必须有证据锚点。
- `resolved_by_user` 必须有用户确认记录。
- `superseded` 不删除旧冲突，只标记版本关系。

## 6. 冲突和 ContextSnapshot

如果查询命中冲突组，`ContextSnapshot` 必须包含：

```text
conflict_set_id
conflict_type
all_claims
evidence_anchor_ids
resolution_state
missing_information
model_answer_boundary
```

模型回答必须使用边界表达：

```text
“当前记录存在冲突：A 来源显示 X，B 来源显示 Y，尚未解决。”
```

禁止：

```text
只选择一个 claim。
把高权重 claim 说成事实。
隐藏冲突来源。
```

## 7. 冲突和标签

建议标签：

```text
conflict:<type>
conflict_scope:<atomic_fact|nested_event|identity|time|instruction>
conflict_state:<unresolved|needs_cold_read|needs_user_confirmation|resolved>
evidence.conflict:<same_source_conflict|cross_source_conflict|time_conflict|identity_conflict>
```

标签只用于检索和显示，冲突详情必须保存在 `ConflictSet`。

## 8. 冲突和星云显示

星云只读显示：

- 冲突节点用特殊边框。
- 冲突边连接双方 claim。
- 未解决冲突进入 V4/V5 显示层，但不代表事实被确认。
- 点击冲突必须打开证据锚点和原文。

## 9. 公开案件式验证边界

公开案件材料中的冲突尤其常见：

- 事实描述与裁判观点不同。
- 不同媒体报道细节不同。
- 时间线整理与原文记录不同。
- 公开材料有删节或匿名化。

处理规则：

- 不用判决结论消除所有冲突。
- 只记录来源如何声称。
- 缺失原文时标记 `evidence_strength=weak`。
- 冲突未解决时保留 `unresolved`。

## 10. 通过标准

`ConflictSet.v1` 方案通过需要满足：

```text
conflict_types_defined=true
claim_structure_defined=true
unresolved_conflict_preserved=true
context_snapshot_keeps_all_claims=true
high_weight_not_equal_truth=true
resolution_requires_evidence_or_user_confirmation=true
superseded_keeps_audit=true
conflict_tags_do_not_replace_conflict_set=true
```
