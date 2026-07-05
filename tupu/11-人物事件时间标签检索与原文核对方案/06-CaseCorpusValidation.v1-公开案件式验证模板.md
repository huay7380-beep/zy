# CaseCorpusValidation.v1 公开案件式验证模板

状态：`draft_pending_user_review`

日期：2026-07-04

## 0. 目标

`CaseCorpusValidation.v1` 定义如何用公开案件式复杂材料验证事件图谱能力。

它验证：

- 复杂事件分层。
- 多人物角色绑定。
- 多来源原文归档。
- 嵌套事件拆分。
- 证据锚点反读。
- 冲突组保留。
- 时间线构建。
- 标签检索和上下文组装。

它不验证：

- 法律责任。
- 判决是否正确。
- 人物现实关系状态。
- 外部动作执行。

## 1. 材料选择标准

建议公开材料满足：

```text
来源公开可访问
来源类型不少于 2 类
人物不少于 3 个
事件不少于 20 个
时间点不少于 3 个
存在冲突或不确定点
材料可保存为 SourceArchive
不依赖隐私材料
```

可用来源类型：

- 公开裁判文书。
- 官方通报。
- 新闻报道。
- 时间线整理。
- 公开公告。
- 公开访谈。

如果要使用具体真实公开案件，必须现场核对来源，不使用记忆复述。

## 2. 使用边界

每个验证包必须声明：

```json
{
  "usage_boundary": "event_structure_validation_only",
  "is_sandbox": true,
  "legal_judgment_generated": false,
  "relationship_graph_write_allowed": false,
  "identity_merge_allowed": false,
  "external_action_allowed": false
}
```

判决书、通报或报道里的结论只能作为来源文本处理，不能绕过事件抽取、证据锚点和冲突检查。

## 3. 验证流程

```text
CaseCorpus 建立
-> SourceArchive 保存公开材料
-> SignalFrame 分块
-> RawObservation 原文观察
-> SemanticUnit 拆分
-> EventThread 分线
-> CompositeEvent 聚合
-> NestedEvent 拆分
-> AtomicFact 抽取
-> EvidenceAnchor 建立
-> TagAssignment 打标
-> ConflictSet 保存冲突
-> TimelineIndex 构建
-> QueryPlan 测试
-> ContextSnapshot 组装
-> ReadbackAudit 核对
```

## 4. 验证输出结构

```json
{
  "schema_version": "case_corpus_validation.v1",
  "validation_id": "case_validation_xxx",
  "case_corpus_id": "case_corpus_xxx",
  "source_checks": [],
  "event_structure_checks": [],
  "nested_event_split_checks": [],
  "evidence_anchor_checks": [],
  "conflict_set_checks": [],
  "timeline_checks": [],
  "query_checks": [],
  "context_snapshot_checks": [],
  "boundary_checks": [],
  "required_failures": [],
  "decision": "passed|needs_schema_extension|needs_tag_extension|readback_failed"
}
```

## 5. 检查项

### 5.1 SourceArchive 检查

```text
source_archives_created
raw_text_saved
source_metadata_saved
source_hash_saved
delete_state_active
source_usage_boundary_declared
```

### 5.2 事件结构检查

```text
event_threads_created
composite_events_created
nested_events_created
atomic_facts_created_when_needed
event_relation_edges_created
parent_events_do_not_replace_child_events
```

### 5.3 拆分门槛检查

```text
each_nested_event_has_reason_codes
no_mechanical_sentence_split
no_nested_event_without_evidence
atomic_fact_not_forced_into_nested_event
negative_and_qualification_preserved
```

### 5.4 证据锚点检查

```text
every_nested_event_has_evidence_anchor
every_atomic_fact_has_evidence_anchor
offset_or_locator_present
quote_snippet_is_source_backed
summary_only_not_used_as_high_risk_evidence
model_inference_not_used_as_original_evidence
```

### 5.5 冲突组检查

```text
conflict_sets_created_when_conflict_exists
all_claims_preserved
resolution_state_declared
context_snapshot_keeps_conflict_group
```

### 5.6 时间线检查

```text
source_captured_at_present
event_occurred_at_present_when_known
event_reported_at_present_when_applicable
event_target_time_present_when_applicable
time_uncertainty_declared
timeline_sort_does_not_imply_unproven_causality
```

### 5.7 查询检查

必须测试：

```text
query_by_person
query_by_source_identity
query_by_event_family
query_by_nested_event_type
query_by_time_range
query_by_tag
query_by_conflict
query_by_evidence
```

每个查询必须返回：

- 命中对象。
- 命中标签或索引。
- 证据锚点。
- 是否有冲突。
- 是否需要冷读。

### 5.8 ContextSnapshot 检查

`ContextSnapshot` 必须包含：

```text
matched_events
timeline_view
evidence_bundle
conflict_sets
tag_explanations
identity_state
risk_and_boundary
missing_or_conflicting_information
answer_scope
```

## 6. 案件式验证问题集

验证不问法律结论，只问结构：

1. 这个材料可以拆成几条事件线？
2. 每条事件线下有哪些阶段性聚合事件？
3. 每个聚合事件下有哪些子事件？
4. 每个子事件的主体、行为、对象、时间和证据是什么？
5. 哪些内容只是事实字段，不应成为事件？
6. 哪些来源声称互相冲突？
7. 哪些时间是发生时间，哪些是报道时间？
8. 哪些证据是原文，哪些是转述或摘要？
9. 按人物、事件、时间、标签能否精确召回？
10. 上下文组装是否保留冲突和证据边界？

## 7. 通过门槛

```text
source_archive_checks_passed=true
event_structure_checks_passed=true
nested_event_split_checks_passed=true
evidence_anchor_checks_passed=true
conflict_set_checks_passed=true
timeline_checks_passed=true
query_checks_passed=true
context_snapshot_checks_passed=true
legal_judgment_generated=false
relationship_state_writes=0
identity_merges_applied=0
external_actions_executed=0
```

失败即停止：

- 公开材料没有原文归档。
- 判决结论被当成系统事实。
- 父事件吞掉子事件。
- 子事件没有证据锚点。
- 冲突只保留一方。
- 时间线混淆不同时间角色。
- 查询不能按人物、事件、时间、标签精确召回。

## 8. 本轮文档级测试用例

当前不使用具体真实案件，不进行联网引用核对。本轮使用“公开案件式复杂材料结构”作为文档级测试模板，检查五个方案件是否覆盖：

```text
对象模型
拆分门槛
证据锚点
冲突事件组
案件式验证流程
```

真实公开案件 fixture 需要在用户确认后另行建立，并且必须先核对公开来源。

