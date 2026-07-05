# ComplexEventObjectModel.v1 复杂事件对象模型

状态：`draft_pending_user_review`

日期：2026-07-04

适用范围：复杂事件、公开案件式验证、多人多事件场景、长时间线、多源证据、冲突事实、上下文组装。

## 0. 目标

`ComplexEventObjectModel.v1` 解决“复杂事件到底存什么、怎么分层、怎么互相引用”的问题。

它不负责：

- 具体抽取算法。
- 正式 schema 实现。
- 人际关系状态写入。
- 身份合并。
- 外部动作执行。
- 法律判断或判决复刻。

显式边界：

```text
relationship_state_writes=0
relationship_state_update_allowed=false
identity_merges_applied=0
external_actions_executed=0
```

它负责定义复杂事件分析时的对象边界：

```text
CaseCorpus
-> SourceArchive
-> SignalFrame
-> RawObservation
-> SemanticUnit
-> EventThread
-> CompositeEvent
-> NestedEvent
-> AtomicFact
-> EvidenceAnchor
-> EventRelationEdge
-> ConflictSet
-> ContextSnapshot
```

## 1. 设计原则

1. 原文是事实根，事件和标签只引用证据。
2. 父事件只做聚合，不替代子事件。
3. 子事件必须具备独立检索价值。
4. 时间必须分角色保存，不混用采集时间、发生时间、披露时间和目标时间。
5. 人物身份和事件角色分离，同一人可在不同事件中承担不同角色。
6. 直接观察、来源声称、模型推断必须分级保存。
7. 冲突事实必须并存，不提前裁决。

## 2. 对象层级

### 2.1 CaseCorpus

`CaseCorpus` 是复杂事件语料包，尤其适合公开案件式验证。

用途：

- 聚合多个公开来源。
- 声明使用边界。
- 隔离 sandbox 测试，不污染用户真实人际关系图谱。

建议字段：

```json
{
  "schema_version": "case_corpus.v1",
  "case_corpus_id": "case_corpus_xxx",
  "title": "复杂事件测试语料",
  "usage_boundary": "event_structure_validation_only",
  "is_sandbox": true,
  "source_archive_ids": [],
  "relationship_graph_write_allowed": false,
  "identity_projection_scope": "case_local_only",
  "legal_judgment_generated": false
}
```

### 2.2 EventThread

`EventThread` 是事件线，用于组织复杂事件中的不同线索。

常见类型：

```text
communication_thread
action_thread
money_thread
location_thread
document_thread
relationship_thread
conflict_thread
evidence_disclosure_thread
system_process_thread
```

一个 `CaseCorpus` 可以包含多条 `EventThread`。一个 `NestedEvent` 可以属于多条事件线，但必须有主线 `primary_thread_id`。

### 2.3 CompositeEvent

`CompositeEvent` 是聚合事件，用于表达阶段、场景或事件簇。

规则：

- 必须有 `child_event_ids`。
- 可以有摘要，但摘要必须引用子事件和证据。
- 不允许只有父事件而没有子事件。
- 不允许父事件覆盖子事件事实。

建议字段：

```json
{
  "schema_version": "composite_event.v1",
  "composite_event_id": "cmp_xxx",
  "case_corpus_id": "case_corpus_xxx",
  "thread_ids": [],
  "title": "",
  "event_scope": "composite",
  "child_event_ids": [],
  "summary_shard_refs": [],
  "evidence_anchor_ids": [],
  "status": "candidate"
}
```

### 2.4 NestedEvent

`NestedEvent` 是复杂事件第一版核心粒度。

一个 `NestedEvent` 必须至少包含：

```text
event_id
parent_ref
thread_ref
actor role
action/state
object
time profile
evidence_anchor_ids
tag_assignments
confidence
fact_status
```

建议字段：

```json
{
  "schema_version": "nested_event.v1",
  "nested_event_id": "nested_evt_xxx",
  "parent_composite_event_id": "cmp_xxx",
  "primary_thread_id": "thread_xxx",
  "event_family": "",
  "event_type": "",
  "event_scope": "nested",
  "roles": [],
  "objects": [],
  "time_profile": {},
  "evidence_anchor_ids": [],
  "atomic_fact_ids": [],
  "tag_assignment_ids": [],
  "relation_edge_ids": [],
  "fact_status": "observed|claimed|disputed|unverified",
  "inference_level": "direct|normalized|inferred|speculative",
  "confidence": 0.0
}
```

### 2.5 AtomicFact

`AtomicFact` 保存更小事实，不一定是事件。

适合保存：

- 金额。
- 时间。
- 地点。
- 状态字段。
- 物品属性。
- 身份称谓。
- 文档编号。

规则：

- 结构化数值必须带单位。
- `AtomicFact` 必须有证据锚点。
- 互相冲突的事实进入 `ConflictSet`。

### 2.6 EventRoleBinding

`Person` 是稳定身份，`EventRoleBinding` 是事件内角色。

同一人物在不同事件里可能是：

```text
speaker
actor
recipient
observer
decision_maker
blocker
source_author
reported_subject
system_actor
```

建议字段：

```json
{
  "role_binding_id": "role_xxx",
  "event_id": "nested_evt_xxx",
  "role": "actor",
  "person_ref": "person:confirmed_id | null",
  "source_identity_ref": "source_identity:xxx | null",
  "mention_ref": "mention:xxx | null",
  "identity_status": "confirmed|candidate|mention_only|case_local"
}
```

## 3. 时间模型

复杂事件必须保存多种时间。

```json
{
  "time_profile": {
    "source_captured_at": "",
    "event_occurred_at": "",
    "event_reported_at": "",
    "event_target_time": "",
    "time_precision": "exact|range|relative|unknown",
    "time_order_confidence": 0.0
  }
}
```

规则：

- `source_captured_at` 是采集时间。
- `event_occurred_at` 是事件发生或表达时间。
- `event_reported_at` 是某来源报道或披露时间。
- `event_target_time` 是事件指向的未来或过去时间。
- 因果排序不能只靠文本顺序。

## 4. 关系边

复杂事件需要显式关系边：

```text
HAS_CHILD_EVENT
CAUSES
ENABLES
BLOCKS
CONTRADICTS
QUALIFIES
SEQUENCES_BEFORE
SEQUENCES_AFTER
EVIDENCED_BY
MENTIONS
PARTICIPATES_IN
SUPERSEDES
```

建议字段：

```json
{
  "schema_version": "event_relation_edge.v1",
  "edge_id": "edge_xxx",
  "from_ref": "nested_evt_a",
  "to_ref": "nested_evt_b",
  "relation_type": "BLOCKS",
  "evidence_anchor_ids": [],
  "confidence": 0.0,
  "status": "candidate|accepted|needs_review"
}
```

## 5. 标签接口

每个核心对象允许标签，但标签职责不同：

| 对象 | 标签作用 |
| --- | --- |
| `CaseCorpus` | sandbox、来源类别、验证范围 |
| `EventThread` | 线索类型 |
| `CompositeEvent` | 阶段、主题、聚合类型 |
| `NestedEvent` | 事件签名、人物、对象、时间、状态边界 |
| `AtomicFact` | 数值、单位、事实状态 |
| `EvidenceAnchor` | 证据类型、证据强度、反读状态 |
| `ConflictSet` | 冲突类型、解决状态 |

标签不得承载完整事实，完整事实仍由事件对象、事实对象和证据锚点承载。

## 6. 查询接口

模型必须支持以下查询方向：

```text
person/source_identity/mention -> nested events
event_thread -> composite events -> nested events
event_type/event_family -> nested events
time range -> timeline events
tag -> subjects -> evidence
conflict_set -> conflicting claims -> evidence
evidence_anchor -> source original
```

查询输出不能只给摘要，必须同时给：

- 命中对象。
- 命中理由。
- 证据锚点。
- 是否需要冷读。
- 是否存在冲突。

## 7. 通过标准

`ComplexEventObjectModel.v1` 方案被视为可进入 schema 设计，需要满足：

```text
case_corpus_boundary_declared=true
source_archive_reference_required=true
composite_event_cannot_replace_nested_event=true
nested_event_has_evidence_anchor=true
atomic_fact_has_evidence_anchor=true
event_role_binding_separates_identity_and_role=true
time_profile_has_multiple_time_roles=true
relation_edges_support_conflict_and_condition=true
relationship_graph_write_allowed=false
relationship_state_writes=0
identity_merge_allowed=false
external_action_allowed=false
```
