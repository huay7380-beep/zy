# ObjectRegistryAndIndexContracts.v1 对象注册表与索引契约

状态：`object_registry_created_pending_user_confirmation`

日期：2026-07-04

适用目录：`D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案`

上游依据：

- `D:\zhineng\tupu\ROOT-图谱构建底层逻辑规则.md`
- `00-总目标与执行控制台.md`
- `04-EvidenceAnchor.v1-证据锚点与原文反读规则.md`
- `10-标签注册表与精确标签化设计方案.md`
- `14-CausalHypothesisAndNarrativeIndex.v1-因果假设与叙事索引方案.md`
- `docs/18-relationship-event-graph-memory-plan.md`
- `docs/19-source-collection-classified-storage-plan.md`

## 0. 目标

本文固定进入 JSON Schema 草案前必须先确认的对象注册表和索引契约。

目标不是新增一批概念，而是把下列对象的输入、输出、反读路径和禁止事项锁定：

```text
TagRegistry
PersonIndex
TimelineIndex
EventIndex
SourceIndex
TagIndex
FeatureIndex
EvidenceIndex
NarrativeIndex
ContextSnapshotRankingPolicy
```

它们共同解决：

```text
如何从标签快速召回事件。
如何从特定特征快速召回内容。
如何从检索结果反读到 EvidenceAnchor 和 SourceArchive 原文。
如何把事件级检索和长期叙事检索分开。
如何避免 schema 把模糊目标固化。
```

## 1. 总边界

本文件定义方案层契约；其中 P1 必要字段已作为 schema 草案输入，但本文件本身不进入 runtime。

允许：

- 固定对象注册表。
- 固定索引输入输出。
- 固定标签、特征、证据、叙事索引之间的互相引用。
- 固定热路径和冷路径。
- 固定失败降级状态。

禁止：

- 不写入 `relationship_state`。
- 不执行 `identity_merge`。
- 不执行 `external_action`。
- 不启用 `learning_weight_promotion`。
- 不把标签、特征、摘要或索引命中结果当作原文事实。
- 不把高相关、高权重、高频命中等同于真实性。

## 2. 对象注册表总览

| 对象 | 所属层 | 解决什么问题 | 主要输入 | 主要输出 | 反读入口 |
| --- | --- | --- | --- | --- | --- |
| `TagRegistry` | 标签定义层 | 约束标签含义和可用范围 | `TagDefinition`、人工确认、规则定义 | 可用标签定义、标签桶、命名空间 | `TagAssignment.evidence_anchor_ids` |
| `TagIndex` | 标签索引层 | 从标签快速找内容 | `TagAssignment`、subject refs、证据 refs | `tag -> subjects/events/summaries/evidence` | `subject_ref -> EvidenceAnchor` |
| `FeatureIndex` | 结构化特征索引层 | 从金额、时间、状态、阶段、强度等特征找内容 | 事件字段、特征字段、权重字段、时间字段 | `feature -> subjects/events/narrative objects/evidence` | `feature_hit -> source_object -> EvidenceAnchor` |
| `EvidenceIndex` | 证据索引层 | 从任何对象回原文 | `EvidenceAnchor`、`SourceArchive`、offset/hash | `evidence_anchor_id -> source span`、冷读结果 | `SourceArchive.raw_text_ref + offset/hash` |
| `NarrativeIndex` | 长期叙事索引层 | 从长期问题找轨迹、阶段、转折、模式、因果 | 基础索引、叙事对象、查询意图 | `query -> trajectory/phase/pattern/causal/evidence` | `narrative object -> representative events -> EvidenceAnchor` |

## 3. 统一对象引用规范

所有索引命中结果必须返回标准引用，不返回散乱文本。

```json
{
  "object_ref": {
    "object_type": "NestedEvent",
    "object_id": "nested_event_xxx"
  },
  "subject_refs": [
    {
      "subject_type": "person",
      "subject_id": "person:p001",
      "identity_status": "confirmed"
    }
  ],
  "source_refs": [
    {
      "source_archive_id": "source_archive_xxx",
      "source_episode_id": "episode_xxx"
    }
  ],
  "evidence_anchor_ids": ["evidence_xxx"],
  "tag_refs": ["event:budget_confirmation_pending"],
  "feature_refs": ["feature:payment.amount.mismatch"],
  "status": "active"
}
```

通用引用对象：

```text
source_archive_id
source_episode_id
raw_event_id
semantic_event_id
nested_event_id
atomic_fact_id
summary_shard_id
conflict_set_id
trajectory_id
phase_segment_id
turning_point_id
pattern_claim_id
context_frame_id
source_perspective_id
causal_hypothesis_id
narrative_index_id
evidence_anchor_id
```

身份引用必须区分：

```text
mention:<mention_id>
source_identity:<source_identity_id>
person:<canonical_person_id>
```

未确认身份不得升级为 `person:*`。

## 4. TagRegistry 契约

### 4.1 定位

`TagRegistry` 是标签定义层，负责约束标签含义。

它不负责：

```text
存储事件事实。
判断关系状态。
执行身份合并。
直接组装模型上下文。
```

### 4.2 输入

```text
TagDefinition
命名空间规则
标签桶规则
允许赋值对象 applies_to
允许赋值方式 rule/model/manual/sensor
弃用和版本信息
```

### 4.3 输出

```text
合法标签集合。
标签命名空间。
标签桶。
标签与可赋值对象的约束。
标签版本和弃用状态。
```

### 4.4 最小字段

```json
{
  "schema": "TagRegistry.v1",
  "tag_id": "event:budget_confirmation_pending",
  "namespace": "event",
  "dimension": "type",
  "value": "budget_confirmation_pending",
  "label_zh": "预算确认待定",
  "description": "表示预算仍未完成确认，只能作为销售推进事件候选。",
  "applies_to": ["SemanticEvent", "NestedEvent", "SummaryShard"],
  "allowed_assignment_methods": ["rule", "model", "manual", "sensor"],
  "precision_level": "semantic_signature",
  "status": "active",
  "version": 1
}
```

### 4.5 反读路径

`TagRegistry` 本身不直接反读原文。原文反读必须通过 `TagAssignment`：

```text
TagDefinition
-> TagAssignment
-> subject_ref
-> evidence_anchor_ids
-> EvidenceIndex
-> SourceArchive 原文
```

### 4.6 失败降级

```text
tag_not_registered -> assignment_status=rejected
tag_deprecated -> assignment_status=needs_migration
tag_applies_to_mismatch -> assignment_status=rejected
tag_too_long_or_sentence_like -> assignment_status=rejected
tag_without_evidence -> assignment_status=needs_review
```

## 5. TagIndex 契约

### 5.1 定位

`TagIndex` 是标签到内容的热路径索引。

它回答：

```text
哪些事件、人物、摘要、叙事对象命中了这个标签？
这个标签命中的内容能否回到原文？
多个标签组合后命中的交集是什么？
```

它不回答：

```text
该事实是否真实。
关系状态是否应修改。
身份是否应合并。
外部动作是否可执行。
```

### 5.2 输入

```text
TagAssignment
subject_ref
subject_type
evidence_anchor_ids
source_archive_ids
assigned_by
confidence
review_state
status
```

### 5.3 输出

```text
tag -> subject_refs
tag -> event_refs
tag -> summary_refs
tag -> narrative_object_refs
tag -> evidence_anchor_ids
tag -> source_archive_ids
```

### 5.4 最小索引项

```json
{
  "schema": "TagIndexEntry.v1",
  "tag_id": "relationship_signal:needs_space",
  "tag_value": "relationship_signal:needs_space",
  "subject_ref": {
    "object_type": "NestedEvent",
    "object_id": "nested_event_need_space_001"
  },
  "subject_person_refs": ["person:p002"],
  "time_refs": {
    "occurred_at": "2026-05-02T20:12:00+08:00",
    "time_bucket": "last_90_days"
  },
  "source_refs": ["source_archive_wechat_001"],
  "evidence_anchor_ids": ["evidence_wechat_001_span_003"],
  "assignment_ref": "tag_assignment_001",
  "confidence": 0.84,
  "status": "active"
}
```

### 5.5 查询契约

```json
{
  "schema": "TagQueryPlan.v1",
  "must_tags": [
    "person:p002",
    "relationship_signal:needs_space"
  ],
  "should_tags": [
    "emotion.appraisal:pressure"
  ],
  "must_not_tags": [
    "relationship_state:confirmed_breakup"
  ],
  "time_window": {
    "mode": "relative",
    "value": "last_90_days"
  },
  "return": [
    "event_refs",
    "summary_refs",
    "evidence_anchor_ids",
    "source_refs"
  ],
  "cold_read_required": false
}
```

### 5.6 反读路径

```text
TagQueryPlan
-> TagIndex entries
-> subject_ref
-> SemanticEvent / NestedEvent / PatternClaim
-> evidence_anchor_ids
-> EvidenceIndex
-> SourceArchive 原文
```

### 5.7 失败降级

```text
no_tag_hit -> return empty with missing_data_policy
tag_hit_without_subject -> index_entry_status=orphaned
tag_hit_without_evidence -> result_status=not_answerable
identity_unconfirmed_person_tag -> downgrade to source_identity or mention
index_version_stale -> rebuild_required
```

## 6. FeatureIndex 契约

### 6.1 定位

`FeatureIndex` 是结构化特征索引，用于检索不适合完全放进标签的内容。

标签适合表达：

```text
类别、路由、语义签名、状态边界。
```

特征适合表达：

```text
数值、时间范围、频率、强度、阶段、证据强度、权重、来源可靠度、前后变化。
```

因此，`FeatureIndex` 用来回答：

```text
金额不一致的事件有哪些？
回复延迟超过某阈值的事件有哪些？
证据强度低但风险高的内容有哪些？
付款周期导致合同延迟的因果假设有哪些？
哪些事件处于 V5 确认门？
```

### 6.2 输入

```text
SemanticEvent / NestedEvent 的结构化字段
AtomicFact 的数值和状态字段
EvidenceAnchor 的 evidence_strength / readback_status
WeightProfile 的 intrinsic/contextual/visual weight
PhaseSegment / TurningPoint / PatternClaim 的阶段、转折、模式字段
CausalHypothesis 的 causal_status / inference_strength
```

### 6.3 输出

```text
feature_key -> object_refs
feature_range -> object_refs
feature_bucket -> object_refs
feature_constraint -> evidence_anchor_ids
```

### 6.4 特征命名

推荐命名：

```text
feature:time.occurred_at
feature:time.duration
feature:amount.value
feature:amount.unit
feature:amount.mismatch
feature:reply.latency
feature:interaction.frequency
feature:evidence.strength
feature:evidence.readback_status
feature:weight.visual_level
feature:phase.type
feature:turning_point.change_dimension
feature:pattern.observed_count
feature:causal.status
feature:source.reliability
feature:confirmation.need
```

### 6.5 最小索引项

```json
{
  "schema": "FeatureIndexEntry.v1",
  "feature_key": "feature:amount.mismatch",
  "feature_value": true,
  "feature_bucket": "mismatch",
  "unit": "CNY",
  "subject_ref": {
    "object_type": "ConflictSet",
    "object_id": "conflict_invoice_amount_001"
  },
  "source_object_refs": [
    {
      "object_type": "AtomicFact",
      "object_id": "atomic_invoice_total_12800"
    },
    {
      "object_type": "AtomicFact",
      "object_id": "atomic_po_total_11800"
    }
  ],
  "evidence_anchor_ids": [
    "evidence_invoice_ocr_001",
    "evidence_po_record_001"
  ],
  "status": "active"
}
```

### 6.6 查询契约

```json
{
  "schema": "FeatureQueryPlan.v1",
  "feature_filters": [
    {
      "feature_key": "feature:evidence.strength",
      "operator": "gte",
      "value": "medium"
    },
    {
      "feature_key": "feature:weight.visual_level",
      "operator": "in",
      "value": ["V4", "V5"]
    }
  ],
  "tag_filters": [
    "domain:sales_customer_progress"
  ],
  "time_window": "last_30_days",
  "return": [
    "object_refs",
    "evidence_anchor_ids",
    "explainability"
  ]
}
```

### 6.7 反读路径

```text
FeatureQueryPlan
-> FeatureIndex entries
-> source_object_refs
-> SemanticEvent / NestedEvent / AtomicFact / PatternClaim / CausalHypothesis
-> evidence_anchor_ids
-> EvidenceIndex
-> SourceArchive 原文
```

### 6.8 失败降级

```text
feature_missing_unit -> feature_status=invalid
feature_without_source_object -> feature_status=orphaned
feature_without_evidence -> result_status=not_answerable
feature_conflicts_with_tag -> create ConflictSet or needs_review
feature_index_stale -> rebuild_required
```

## 7. EvidenceIndex 契约

### 7.1 定位

`EvidenceIndex` 是所有检索结果回到原文的冷路径入口。

它回答：

```text
这个对象的证据在哪里？
原文片段是什么？
offset/hash 是否匹配？
该证据是否足以支撑回答？
```

### 7.2 输入

```text
EvidenceAnchor
SourceArchive manifest
raw_text_ref / raw_payload_ref / artifact_refs
offset_start / offset_end
quote_snippet
content_hash
evidence_type
evidence_strength
readback_status
```

### 7.3 输出

```text
evidence_anchor_id -> source_archive_id
evidence_anchor_id -> raw_text_ref
evidence_anchor_id -> quote_snippet
evidence_anchor_id -> hash_check result
evidence_anchor_id -> readback_status
```

### 7.4 最小索引项

```json
{
  "schema": "EvidenceIndexEntry.v1",
  "evidence_anchor_id": "evidence_wechat_001_span_003",
  "source_archive_id": "source_archive_wechat_001",
  "source_episode_id": "episode_wechat_001",
  "raw_text_ref": "runtime/source-archives/desktop/wechat/2026-07-04/source_archive_wechat_001/raw.txt",
  "offset_start": 128,
  "offset_end": 146,
  "quote_snippet": "最近不要一直催她回复",
  "content_hash": "sha256:...",
  "evidence_type": "direct_original",
  "evidence_strength": "strong",
  "readback_status": "passed",
  "status": "active"
}
```

### 7.5 冷读契约

```json
{
  "schema": "EvidenceReadbackPlan.v1",
  "evidence_anchor_ids": ["evidence_wechat_001_span_003"],
  "readback_mode": "cold",
  "checks": [
    "offset_match",
    "hash_match",
    "source_archive_exists",
    "delete_state_not_tombstoned"
  ],
  "return": [
    "quote_snippet",
    "raw_text_ref",
    "readback_status",
    "failure_reason"
  ]
}
```

### 7.6 必须冷读的情况

```text
risk:high
confirmation:requires_confirmation
relationship_state_candidate
identity_merge_candidate
external_action_boundary
conflict_set exists
evidence_type:ocr_text with low confidence
evidence_type:asr_text with low confidence
summary and event mismatch
user asks for original text
```

### 7.7 失败降级

```text
source_archive_missing -> not_answerable + audit
source_archive_tombstoned -> user_deleted_source + do_not_reconstruct
offset_mismatch -> readback_status=failed
hash_mismatch -> integrity_review_required
summary_only_evidence -> cannot_support_high_risk
model_inference_evidence -> cannot_support_fact_answer
```

## 8. NarrativeIndex 契约

### 8.1 定位

`NarrativeIndex` 是长期叙事检索入口。

它不替代：

```text
TagIndex
FeatureIndex
EvidenceIndex
```

它负责把事件级命中组织成：

```text
轨迹、阶段、转折点、模式、语境、来源视角、因果假设。
```

### 8.2 输入

```text
PersonIndex / TagIndex / TimelineIndex / EvidenceIndex
TrajectoryRecord
PhaseSegment
TurningPoint
PatternClaim
ContextFrame
SourcePerspective
CausalHypothesis
query_intent_type
```

### 8.3 输出

```text
narrative_query -> trajectory_ids
trend_query -> pattern_claim_ids / phase_segment_ids
turning_point_query -> turning_point_ids
causal_query -> causal_hypothesis_ids
conflict_query -> conflict_set_ids + source_perspective_ids
evidence_query -> evidence_anchor_ids
```

### 8.4 最小索引项

```json
{
  "schema": "NarrativeIndexEntry.v1",
  "narrative_index_id": "narrative_index_relationship_x_2026_q2",
  "subject_refs": [
    "person:p001",
    "person:p002",
    "relationship:r001"
  ],
  "query_domains": [
    "romantic_relationship_maintenance",
    "long_cycle_narrative"
  ],
  "tag_refs": [
    "relationship_signal:needs_space",
    "emotion.appraisal:pressure"
  ],
  "feature_refs": [
    "feature:reply.latency",
    "feature:interaction.frequency"
  ],
  "trajectory_ids": ["trajectory_relationship_x_2026_q2"],
  "phase_segment_ids": ["phase_boundary_negotiation_2026_05"],
  "turning_point_ids": ["turning_point_need_space_expression"],
  "pattern_claim_ids": ["pattern_reply_latency_increased_2026_q2"],
  "context_frame_ids": ["context_relationship_boundary_chat_2026_05"],
  "source_perspective_ids": ["source_perspective_wechat_direct_message"],
  "causal_hypothesis_ids": ["causal_pressure_response_candidate"],
  "evidence_anchor_ids": ["evidence_wechat_001_span_003"],
  "status": "active"
}
```

### 8.5 查询契约

```json
{
  "schema": "NarrativeQueryPlan.v1",
  "query_intent_type": "narrative_query",
  "subject_refs": ["person:p001", "person:p002"],
  "query_domains": ["romantic_relationship_maintenance"],
  "tag_filters": [
    "relationship_signal:needs_space",
    "emotion.appraisal:pressure"
  ],
  "feature_filters": [
    {
      "feature_key": "feature:reply.latency",
      "operator": "trend_increase"
    }
  ],
  "time_window": "last_180_days",
  "include": [
    "trajectory",
    "phase_segments",
    "turning_points",
    "pattern_claims",
    "context_frames",
    "source_perspectives",
    "causal_hypotheses",
    "evidence_refs"
  ],
  "cold_read_required": "only_for_high_risk_or_user_requested"
}
```

### 8.6 反读路径

```text
NarrativeQueryPlan
-> NarrativeIndexEntry
-> TrajectoryRecord
-> PhaseSegment / TurningPoint / PatternClaim
-> representative SemanticEvent / NestedEvent / AtomicFact
-> evidence_anchor_ids
-> EvidenceIndex
-> SourceArchive 原文
```

### 8.7 失败降级

```text
narrative_index_missing -> fallback to TagIndex + TimelineIndex
trajectory_missing -> return event_level_context_only
phase_boundary_uncertain -> mark phase_segment.status=needs_review
pattern_insufficient_evidence -> pattern_status=candidate_insufficient_evidence
causal_status=model_candidate_only -> cannot_use_for_decision
evidence_readback_failed -> remove from answerable facts
```

## 9. 索引协同规则

### 9.1 普通标签查询

```text
TagQueryPlan
-> TagIndex
-> object_refs
-> EvidenceIndex
-> ContextSnapshot
```

### 9.2 特定特征查询

```text
FeatureQueryPlan
-> FeatureIndex
-> object_refs
-> TagIndex enrich tags
-> EvidenceIndex
-> ContextSnapshot
```

### 9.3 长期叙事查询

```text
NarrativeQueryPlan
-> NarrativeIndex
-> TagIndex / FeatureIndex 补充命中依据
-> EvidenceIndex
-> NarrativeContextSnapshot
```

### 9.4 高风险确认查询

```text
TagIndex / FeatureIndex / NarrativeIndex
-> confirmation or V5 hit
-> EvidenceIndex cold read
-> confirmation package
-> user decision
```

## 10. 上下文组装输入契约

`ContextSnapshot` 和 `NarrativeContextSnapshot` 只能接收结构化命中包。

```json
{
  "schema": "RetrievalHitPackage.v1",
  "query_plan_ref": "query_plan_xxx",
  "hit_type": "tag|feature|evidence|narrative",
  "object_refs": [],
  "tag_refs": [],
  "feature_refs": [],
  "evidence_anchor_ids": [],
  "source_refs": [],
  "summary_refs": [],
  "conflict_refs": [],
  "confidence": 0.82,
  "answerability": "answerable_with_evidence",
  "requires_cold_read": false,
  "forbidden_outputs": [
    "relationship_state_write",
    "identity_merge",
    "external_action"
  ]
}
```

禁止上下文组装器直接接收：

```text
无来源自由文本。
无 EvidenceAnchor 的模型总结。
无 subject_ref 的标签命中。
无 source_archive_id 的证据片段。
```

## 11. 三类查询验证样例

### 11.1 销售客户推进

查询：

```text
张总最近预算和技术评审卡在哪里？
```

路由：

```text
person constraint -> PersonIndex
budget/technical tags -> TagIndex
payment/procurement features -> FeatureIndex
sales trajectory -> NarrativeIndex
evidence -> EvidenceIndex
```

必须返回：

```text
相关事件
阶段或轨迹对象
卡点特征
证据锚点
原文反读入口
未确认或缺失信息
```

### 11.2 恋爱关系维护

查询：

```text
她最近是不是在表达压力和边界？
```

路由：

```text
relationship_signal / emotion tags -> TagIndex
reply latency / interaction frequency -> FeatureIndex
relationship trajectory -> NarrativeIndex
source perspective -> NarrativeIndex
evidence -> EvidenceIndex
```

必须返回：

```text
边界表达事件
压力相关标签
互动频率或回复延迟特征
长期模式是否成立
不能自动写关系状态的边界说明
```

### 11.3 公开案件式多源材料

查询：

```text
不同来源对这个关键事件怎么说，哪些说法冲突？
```

路由：

```text
source tags -> TagIndex
conflict features -> FeatureIndex
ConflictSet + SourcePerspective -> NarrativeIndex
evidence -> EvidenceIndex
```

必须返回：

```text
各来源 claim
来源视角
冲突状态
证据锚点
不把任何单一来源说法写成系统事实
```

## 12. 进入 JSON Schema 草案的条件

本注册表被确认后，JSON Schema 草案第一批对象顺序建议为：

```text
EvidenceAnchor
TagRegistry / TagDefinition
TagAssignment
TagIndexEntry
FeatureIndexEntry
NarrativeIndexEntry
RetrievalHitPackage
ContextSnapshot / NarrativeContextSnapshot
```

进入条件：

```text
每个索引项有 object_ref。
每个可回答结果有 evidence_anchor_id。
每个 evidence_anchor_id 可进入 EvidenceIndex。
每个高风险或确认门结果有 cold_read_required。
每个身份相关结果区分 mention/source_identity/person。
每个结果有 status 和 failure/downgrade 状态。
```

仍然禁止：

```text
不接真实微信数据。
不接真实外部工具。
不写 RelationshipState。
不执行 identity_merge。
不启用学习权重。
不生成真实建议动作。
```

## 13. 通过标准

本对象注册表通过的标准：

```text
TagRegistry 输入输出和反读路径明确。
TagIndex 输入输出和反读路径明确。
FeatureIndex 输入输出和反读路径明确。
EvidenceIndex 输入输出和冷读路径明确。
NarrativeIndex 输入输出和反读路径明确。
标签和特征边界清晰。
事件级检索和长期叙事检索边界清晰。
上下文组装只能消费 RetrievalHitPackage。
缺证据、缺身份确认、索引过期、来源删除都有降级规则。
关系状态写入、身份合并、外部动作、学习权重转正均保持 blocked。
```

## 14. 当前结论

本文件把 11 目录进入 schema 前最容易漂移的部分固定为索引契约。

下一步建议：

```text
用户确认本对象注册表。
再进入 JSON Schema 草案第一批。
先做 Tag/Evidence/Feature/Narrative 的 fixture 反推验证。
最后再讨论 runtime。
```

## 15. 本地文档级验证记录

验证时间：2026-07-04

验证方式：PowerShell 文档级检查。

检查项：

```text
文件是否存在。
TagRegistry / TagIndex / FeatureIndex / EvidenceIndex / NarrativeIndex 是否都有独立契约章节。
是否包含输入、输出、反读路径、失败降级。
是否包含 relationship_state、identity_merge、external_action、learning_weight_promotion 禁止边界。
是否包含 RetrievalHitPackage、EvidenceReadbackPlan、TagQueryPlan、FeatureQueryPlan、NarrativeQueryPlan。
README 是否索引本文。
00 总目标与执行控制台是否纳入本文。
```

验证结果：

```text
registry_file_exists = true
missing_object_sections = 0
missing_required_tokens = 0
readme_has_16 = true
control_has_16 = true
validation_status = PASS
```

验证解释：

```text
该结果只表示对象注册表和索引契约在文档层闭合。
该结果不表示 JSON Schema 已生成。
该结果不表示真实索引、真实原文反读、真实检索延迟或 runtime 已通过。
```

## 16. P1 缺口处理：G-05 基础索引契约补齐

状态：`gap_g05_resolved_for_schema_draft`

G-05 处理目标是把 `PersonIndex / TimelineIndex / EventIndex / SourceIndex` 固定为基础热路径索引。它们和 `TagIndex / FeatureIndex / EvidenceIndex / NarrativeIndex` 同级协作，但不替代任何证据和事实对象。

### 16.1 基础索引总览

| 索引 | 主要问题 | 输入 | 输出 | 反读路径 | 禁止事项 |
| --- | --- | --- | --- | --- | --- |
| `PersonIndex` | 按人物召回事件、标签、证据、轨迹 | `mention`、`source_identity`、`person`、事件引用、证据引用 | 人物相关对象引用、身份状态、待确认冲突 | `person/source_identity/mention -> object_refs -> EvidenceAnchor -> SourceArchive` | 不执行身份合并，不自动确认人物 |
| `TimelineIndex` | 按时间召回事件和阶段 | `source_captured_at`、`event_occurred_at`、`event_target_time`、时间置信度 | 时间桶、事件序列、阶段候选 | `time_bucket -> event_refs -> EvidenceAnchor -> SourceArchive` | 不把时间先后写成因果 |
| `EventIndex` | 按事件类型、事件线程、父子事件召回 | `RawEvent`、`SemanticEvent`、`NestedEvent`、`ComplexEvent`、`ConflictSet` | 事件引用、父子关系、事件线程 | `event_ref -> child/parent refs -> EvidenceAnchor -> SourceArchive` | 不让父事件吞掉子事件 |
| `SourceIndex` | 按来源、采集批次、平台、材料类型召回 | `SourceArchive`、`SourceEpisode`、来源元数据、删除状态 | 来源清单、来源分组、来源完整性状态 | `source_ref -> EvidenceAnchor -> raw_text_ref/raw_payload_ref` | 不修改原文，不恢复用户删除内容 |

### 16.2 PersonIndexEntry.v1 契约

最小索引项：

```json
{
  "schema": "PersonIndexEntry.v1",
  "subject_ref": {
    "subject_type": "person",
    "subject_id": "person:p001",
    "identity_status": "confirmed"
  },
  "alias_refs": ["source_identity:wechat_zhang", "mention:m001"],
  "object_refs": [
    {
      "object_type": "NestedEvent",
      "object_id": "nested_event_001",
      "role": "speaker"
    }
  ],
  "tag_refs": ["person_role:customer_decision_maker"],
  "time_refs": ["timeline:2026-07-04"],
  "evidence_anchor_ids": ["evidence_001"],
  "rebuild_required": false,
  "status": "active"
}
```

身份修改必须走前端传感器/身份链路形成变更记录，图谱层只接收已确认后的重建指令。图谱层允许标记：

```text
identity_status=mention_only
identity_status=source_identity_only
identity_status=confirmed
identity_status=conflict_pending_user_confirmation
```

但不允许自行把 `mention` 或 `source_identity` 升级为 `person`。

### 16.3 TimelineIndexEntry.v1 契约

最小索引项：

```json
{
  "schema": "TimelineIndexEntry.v1",
  "timeline_id": "timeline:2026-07-04:wechat",
  "time_refs": {
    "source_captured_at": "2026-07-04T10:12:00+08:00",
    "event_occurred_at": "2026-07-03T21:30:00+08:00",
    "event_target_time": null,
    "time_certainty": "explicit"
  },
  "object_refs": [
    {
      "object_type": "SemanticEvent",
      "object_id": "semantic_event_001"
    }
  ],
  "source_refs": ["source_archive_wechat_001"],
  "evidence_anchor_ids": ["evidence_001"],
  "status": "active"
}
```

时间字段必须保留来源采集时间、事件发生时间和事件指向时间的区别。时间不明确时只能降级：

```text
time_certainty=explicit
time_certainty=inferred_from_context
time_certainty=ambiguous
time_certainty=unknown
```

### 16.4 EventIndexEntry.v1 契约

最小索引项：

```json
{
  "schema": "EventIndexEntry.v1",
  "event_ref": {
    "object_type": "NestedEvent",
    "object_id": "nested_event_001"
  },
  "event_type": "budget_confirmation_pending",
  "domain_refs": ["domain:sales_customer_progress"],
  "parent_event_refs": ["semantic_event_001"],
  "child_event_refs": [],
  "thread_refs": ["event_thread:sales_project_a"],
  "person_refs": ["person:p001"],
  "tag_refs": ["event:budget_confirmation_pending"],
  "feature_refs": ["feature:amount.value"],
  "evidence_anchor_ids": ["evidence_001"],
  "status": "active"
}
```

父事件只用于组织结构，不能覆盖子事件的证据、标签和时间。事件合并、事件拆分、父子关系调整后必须触发相关索引重建。

### 16.5 SourceIndexEntry.v1 契约

最小索引项：

```json
{
  "schema": "SourceIndexEntry.v1",
  "source_archive_id": "source_archive_wechat_001",
  "source_episode_ids": ["episode_wechat_001"],
  "platform": "wechat_desktop",
  "source_type": "chat_text",
  "captured_at": "2026-07-04T10:12:00+08:00",
  "raw_text_ref": "runtime/source-archives/wechat/source_archive_wechat_001/raw.txt",
  "content_hash": "sha256:...",
  "delete_state": "active",
  "object_refs": ["raw_event_001", "semantic_event_001"],
  "evidence_anchor_ids": ["evidence_001"],
  "status": "active"
}
```

用户删除源数据后，索引只能保留墓碑状态：

```text
delete_state=tombstoned_by_user
readback_status=user_deleted_source
answerability=not_answerable_from_deleted_source
```

不能通过摘要或缓存重建已删除原文。

### 16.6 G-05 重建触发器

下列变化必须触发基础索引重建：

```text
identity confirmed / identity changed
source_identity rebound
source deleted or tombstoned
event split / event merge
parent-child event relation changed
tag migrated or deprecated
evidence readback failed
time field corrected
```

重建输出必须记录：

```text
rebuild_reason
affected_index_names
affected_object_refs
before_ref
after_ref
operator_or_system_source
validation_status
```

## 17. P1 缺口处理：G-07 ContextSnapshot 排序、去重、预算规则

状态：`gap_g07_resolved_for_schema_draft`

G-07 处理目标是固定 `ContextSnapshotRankingPolicy.v1`，解决内容爆炸时如何精简、准确、可反读地组装上下文。

该策略不判断事实真假，不替代 EvidenceIndex，不修改关系状态，不执行外部动作。

### 17.1 输入

```text
RetrievalHitPackage
QueryIntent
PersonIndexEntry
TimelineIndexEntry
EventIndexEntry
SourceIndexEntry
TagIndexEntry
FeatureIndexEntry
EvidenceIndexEntry
NarrativeIndexEntry
WeightProfile
confirmation_gate
```

### 17.2 过滤门槛

进入排序前先过滤：

```text
source_deleted -> exclude_from_answerable_context
evidence_readback_failed -> exclude_from_answerable_facts
missing_evidence_anchor -> downgrade_to_background_or_exclude
identity_unconfirmed -> keep_as_mention/source_identity, not person
high_risk_without_cold_read -> defer_to_confirmation_package
relationship_state_candidate -> defer_to_confirmation_package
external_action_candidate -> defer_to_confirmation_package
```

### 17.3 去重键

去重必须同时使用多个键，不能只按文本相似度：

```text
evidence_anchor_id
source_archive_id + offset_start + offset_end
source_span_hash
object_ref
semantic_event_id
nested_event_id
claim_signature
tag_id + subject_ref + evidence_anchor_id
narrative_object_ref
```

去重结果分为：

```text
primary_hit
duplicate_same_source
duplicate_cross_source_same_claim
near_duplicate_requires_review
conflict_not_duplicate
```

冲突内容不得被去重吞掉，必须进入 `ConflictSet` 或 `conflict_relevant_context`。

### 17.4 排序信号

排序信号按规则权重合成，第一版不启用学习权重转正：

| 信号 | 用途 | 边界 |
| --- | --- | --- |
| `query_match_score` | 与用户问题匹配程度 | 不能替代证据 |
| `evidence_strength_score` | 证据强度 | 低证据高相关不得直接回答 |
| `readback_status_score` | 原文可核对程度 | 冷读失败必须降级 |
| `person_match_score` | 人物匹配 | 未确认身份不得升格 |
| `event_match_score` | 事件匹配 | 父事件不能吞子事件 |
| `tag_match_score` | 标签匹配 | 标签不是事实 |
| `time_proximity_score` | 时间接近度或时间窗口匹配 | 时间先后不是因果 |
| `source_diversity_score` | 来源多样性 | 多来源不是自动更真 |
| `conflict_relevance_score` | 对冲突问题的重要度 | 冲突不能被折中 |
| `narrative_role_score` | 在轨迹、阶段、转折、模式中的作用 | 叙事对象不是原文事实 |
| `goal_domain_score` | 与销售推进/恋爱维护等目标域匹配 | 目标域不能覆盖用户确认门 |
| `confirmation_need_score` | 是否需要单独确认 | 高分进入确认包，不进入自动建议 |

### 17.5 上下文预算

上下文组装必须同时控制精简和准确：

```text
先选 EvidenceAnchor 可反读的核心事实。
再选必要摘要。
再选冲突或缺口。
再选长期叙事背景。
最后选低风险辅助背景。
```

预算分层：

```text
core_facts_budget
evidence_quotes_budget
summary_budget
conflict_budget
narrative_budget
risk_and_gap_budget
overflow_refs
```

原文引用策略：

```text
默认只放最小必要 quote_snippet。
高风险、用户要求原文、关系/身份/外部动作/学习权重相关问题必须冷读原文。
未进入上下文正文的证据进入 overflow_refs，保留可追溯入口。
```

### 17.6 输出

`ContextSnapshotRankingDecision.v1` 最小输出：

```json
{
  "schema": "ContextSnapshotRankingDecision.v1",
  "query_plan_ref": "query_plan_001",
  "selected_hits": [
    {
      "hit_ref": "retrieval_hit_001",
      "rank": 1,
      "selected_for": "core_fact",
      "ranking_reasons": [
        "query_match",
        "strong_evidence",
        "readback_passed"
      ],
      "evidence_anchor_ids": ["evidence_001"]
    }
  ],
  "deferred_hits": [
    {
      "hit_ref": "retrieval_hit_009",
      "defer_reason": "high_risk_requires_cold_read"
    }
  ],
  "excluded_hits": [
    {
      "hit_ref": "retrieval_hit_013",
      "exclude_reason": "source_deleted"
    }
  ],
  "overflow_refs": ["retrieval_hit_020"],
  "answerability": "answerable_with_evidence",
  "status": "active"
}
```

### 17.7 失败降级

```text
ranking_explainability_missing -> context_status=needs_review
budget_overflow_without_overflow_refs -> context_status=invalid
duplicate_key_missing -> context_status=needs_review
conflict_deduped_as_duplicate -> context_status=invalid
readback_failed_after_selection -> remove_from_selected_hits
high_risk_selected_without_cold_read -> context_status=blocked
identity_unconfirmed_selected_as_person -> context_status=invalid
```

## 18. P1 缺口处理后的 JSON Schema 草案进入条件

G-05 和 G-07 处理后，JSON Schema 第一批对象顺序调整为：

```text
EvidenceAnchor
TagRegistry / TagDefinition
TagAssignment
PersonIndexEntry
TimelineIndexEntry
EventIndexEntry
SourceIndexEntry
TagIndexEntry
FeatureIndexEntry
EvidenceIndexEntry
NarrativeIndexEntry
RetrievalHitPackage
ContextSnapshotRankingPolicy
ContextSnapshotRankingDecision
ContextSnapshot / NarrativeContextSnapshot
```

进入 JSON Schema 草案时，所有对象必须满足：

```text
有 object_ref。
有 status。
有 failure/downgrade 状态。
可回答事实有 evidence_anchor_ids。
高风险结果有 cold_read_required 或 confirmation_gate。
人物引用区分 mention/source_identity/person。
来源删除时不能通过摘要恢复原文。
上下文排序有 ranking_reasons、deferred_hits、excluded_hits、overflow_refs。
```

## 19. P1 缺口文档级验证记录

验证时间：2026-07-04

验证方式：文档级契约检查。

验证项：

```text
G-05 是否补齐 PersonIndex / TimelineIndex / EventIndex / SourceIndex。
G-05 是否包含输入、输出、反读路径、禁止事项、失败降级和重建触发器。
G-07 是否补齐排序、去重、预算、输出和失败降级规则。
G-07 是否保证精简、准确、可反读。
JSON Schema 第一批对象顺序是否纳入 G-05/G-07 产物。
是否仍保持 relationship_state、identity_merge、external_action、learning_weight_promotion blocked。
```

验证结果：

```text
g05_required_index_contracts = 4/4
g05_readback_paths_defined = true
g05_rebuild_triggers_defined = true
g07_ranking_policy_defined = true
g07_dedup_policy_defined = true
g07_budget_policy_defined = true
g07_failure_downgrade_defined = true
schema_entry_order_updated = true
blocked_boundaries_preserved = true
validation_status = PASS
```
