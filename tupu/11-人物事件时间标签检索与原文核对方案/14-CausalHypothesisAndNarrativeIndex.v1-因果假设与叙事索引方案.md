# CausalHypothesis / NarrativeIndex.v1 因果假设与叙事索引方案

状态：`draft_for_user_review`

日期：2026-07-04

适用目录：`D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案`

## 0. 目标

`CausalHypothesis.v1` 用于把“可能的因果解释”从事实、时间顺序、转折点中分离出来。

`NarrativeIndex.v1` 用于为长期轨迹、阶段、转折点、模式、语境、来源视角和因果假设建立检索入口。

它们共同解决的问题是：

```text
先发生不等于导致。
转折点不等于原因。
来源解释不等于系统事实。
长期叙事问题不能只靠 PersonIndex / TagIndex / TimelineIndex 检索。
```

## 1. 使用边界

允许做：

- 保存因果假设、支持证据、反证、争议状态。
- 为长期叙事查询建立专门索引。
- 支持事实查询、事件查询、叙事查询、趋势查询、冲突查询、因果查询、证据查询。

不允许做：

- 不写入 `relationship_state`。
- 不执行 `identity_merge`。
- 不执行 `external_action`。
- 不把时间先后直接写成因果。
- 不把因果假设写成事实边。
- 不让 NarrativeIndex 替代 EvidenceIndex。

## 2. CausalHypothesis.v1 对象定位

```text
NestedEvent / TurningPoint / PatternClaim / SourcePerspective
-> CausalHypothesis
-> NarrativeIndex
```

`CausalHypothesis` 只表达假设状态，不表达事实成立。

## 3. CausalHypothesis.v1 标准字段

```json
{
  "schema": "CausalHypothesis.v1",
  "causal_hypothesis_id": "causal:payment_terms_caused_contract_delay",
  "trajectory_id": "trajectory:customer_acme_2026_h1",
  "hypothesis_text": "付款周期条款可能是合同签署延迟的重要原因之一。",
  "cause_candidate_refs": [
    "event:payment_terms_objection_2026_06_03"
  ],
  "effect_candidate_refs": [
    "event:contract_not_signed_2026_06_30"
  ],
  "related_turning_point_ids": [
    "turning_point:payment_terms_blocker"
  ],
  "supporting_event_ids": [
    "event:payment_terms_objection_2026_06_03",
    "event:procurement_delay_2026_06_10"
  ],
  "counter_evidence_event_ids": [
    "event:customer_positive_feedback_2026_06_18"
  ],
  "source_perspective_ids": [
    "source_perspective:customer_procurement_contact"
  ],
  "evidence_anchor_ids": [
    "evidence:wechat_msg_2026_06_03_0007",
    "evidence:meeting_note_2026_06_10_0001"
  ],
  "causal_status": "hypothesis",
  "inference_strength": {
    "overall": 0.62,
    "basis": [
      "temporal_order_observed",
      "source_mentions_payment_terms",
      "contract_delay_observed"
    ],
    "limits": [
      "decision_maker_not_directly_interviewed",
      "other_procurement_factors_possible"
    ]
  },
  "forbidden_upgrade_without_confirmation": [
    "supported",
    "relationship_state_change",
    "external_action_recommendation"
  ],
  "status": "active_hypothesis"
}
```

## 4. 因果状态

`causal_status` 推荐受控枚举：

```text
hypothesis
supported
disputed
rejected
unknown
source_claim_only
model_candidate_only
```

状态解释：

- `hypothesis`：存在可讨论因果假设，但未充分验证。
- `supported`：有多项证据支持，但仍要保留反证入口。
- `disputed`：存在明显支持与反证冲突。
- `rejected`：被后续证据推翻。
- `source_claim_only`：仅某来源这么说。
- `model_candidate_only`：仅系统候选，不能用于建议决策。

升级到 `supported` 必须有独立确认规则，不能由模型自动转正。

## 5. 因果误用防线

必须避免：

```text
post hoc ergo propter hoc：先发生所以导致。
single-source causality：单一来源解释直接变事实。
turning-point causality：转折点直接等于原因。
pattern causality：重复模式直接等于动机或原因。
goal projection：把使用者目标投射为他人动机。
```

任何因果表达都必须能回答：

```text
支持证据是什么？
反证是什么？
有没有其他解释？
该因果只是来源说法，还是系统归纳？
当前状态是 hypothesis、supported、disputed 还是 rejected？
```

## 6. NarrativeIndex.v1 对象定位

```text
PersonIndex / TagIndex / TimelineIndex / EvidenceIndex
-> NarrativeIndex
-> TrajectoryRecord / PhaseSegment / TurningPoint / PatternClaim / ContextFrame / SourcePerspective / CausalHypothesis
-> NarrativeContextSnapshot
```

`NarrativeIndex` 不替代基础索引，而是为长期叙事问题建立第二层入口。

## 7. NarrativeIndex.v1 标准字段

```json
{
  "schema": "NarrativeIndex.v1",
  "narrative_index_id": "narrative_index:relationship_x_2026_q2",
  "subject_refs": [
    "person:p001",
    "person:p002",
    "relationship:r001"
  ],
  "query_domains": [
    "romantic_relationship_maintenance",
    "long_cycle_narrative"
  ],
  "trajectory_ids": [
    "trajectory:relationship_x_2026_q2"
  ],
  "phase_segment_ids": [
    "phase:high_frequency_interaction",
    "phase:boundary_negotiation",
    "phase:stable_low_frequency"
  ],
  "turning_point_ids": [
    "turning_point:need_space_expression"
  ],
  "pattern_claim_ids": [
    "pattern:reply_latency_increased_2026_q2"
  ],
  "context_frame_ids": [
    "context:relationship_boundary_chat_2026_05"
  ],
  "source_perspective_ids": [
    "source_perspective:wechat_direct_message"
  ],
  "causal_hypothesis_ids": [
    "causal:pressure_response_may_follow_repeated_checkins"
  ],
  "tag_refs": [
    "tag:reply_latency",
    "tag:boundary_expression",
    "tag:interaction_pressure"
  ],
  "evidence_anchor_ids": [
    "evidence:wechat_msg_2026_05_02_0012"
  ],
  "last_built_at": "2026-07-04T00:00:00+08:00",
  "status": "active_index"
}
```

## 8. 查询类型

`query_intent_type` 推荐受控枚举：

```text
fact_query
event_query
narrative_query
trend_query
conflict_query
causal_query
evidence_query
source_perspective_query
phase_query
turning_point_query
pattern_query
```

查询路由：

| 查询类型 | 优先入口 |
| --- | --- |
| `fact_query` | `EvidenceIndex` + `AtomicFact` |
| `event_query` | `EventIndex` + `NestedEvent` |
| `narrative_query` | `NarrativeIndex` + `TrajectoryRecord` |
| `trend_query` | `PatternClaim` + `PhaseSegment` |
| `conflict_query` | `ConflictSet` + `SourcePerspective` |
| `causal_query` | `CausalHypothesis` + `EvidenceAnchor` |
| `evidence_query` | `EvidenceIndex` + `SourceArchive` |
| `source_perspective_query` | `SourcePerspective` |
| `phase_query` | `PhaseSegment` |
| `turning_point_query` | `TurningPoint` |
| `pattern_query` | `PatternClaim` |

## 9. 上下文组装格式

叙事型上下文推荐输出：

```json
{
  "schema": "NarrativeContextSnapshot.v1",
  "query_intent_type": "narrative_query",
  "subject_refs": ["person:p001", "person:p002"],
  "trajectory_summaries": [],
  "phase_segments": [],
  "turning_points": [],
  "pattern_claims": [],
  "context_frames": [],
  "source_perspectives": [],
  "causal_hypotheses": [],
  "conflicts_or_uncertainties": [],
  "evidence_excerpt_refs": [],
  "cold_read_required": false,
  "forbidden_outputs": [
    "relationship_state_write",
    "identity_merge",
    "external_action"
  ]
}
```

## 10. 通过标准

`CausalHypothesis / NarrativeIndex.v1` 方案通过的标准：

```text
能把因果假设从事实、时间顺序、转折点中分离。
每个因果假设有支持证据、反证、EvidenceAnchor 和状态。
能防止时间先后被误写为因果。
能为长期叙事查询提供索引入口。
能按 query_intent_type 路由不同检索。
不产生 relationship_state 写入。
不产生 identity_merge。
不产生 external_action。
```

## 11. 当前结论

`CausalHypothesis / NarrativeIndex.v1` 是长期叙事层进入可检索系统的关键补丁。

前者防止错误因果，后者防止长期问题只能靠标签和时间线粗召回。二者仍然只是方案层对象，进入 schema/runtime/test fixture 前必须再次确认。
