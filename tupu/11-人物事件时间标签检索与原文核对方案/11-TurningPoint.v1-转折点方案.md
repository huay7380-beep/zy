# TurningPoint.v1 转折点方案

状态：`draft_for_user_review`

日期：2026-07-04

适用目录：`D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案`

## 0. 目标

`TurningPoint.v1` 用于记录长期轨迹中的关键转折。

它解决的问题是：

```text
哪些事件真正改变了轨迹？
这个改变发生在哪个维度？
转折前和转折后有什么可证据化差异？
哪些只是高权重事件，但不是转折点？
```

`TurningPoint` 不是“重要事件”的同义词。只有当事件造成或标记了轨迹、阶段、目标、风险、关系边界、信息结构的前后变化时，才可生成转折点候选。

## 1. 使用边界

`TurningPoint.v1` 允许做：

- 标记长期轨迹中的阶段变化点。
- 记录转折前状态、转折后状态、变化维度和证据。
- 区分高权重事件、转折点、因果假设。
- 支持销售、恋爱关系、公开案件中的关键变化。

`TurningPoint.v1` 不允许做：

- 不写入 `relationship_state`。
- 不执行 `identity_merge`。
- 不执行 `external_action`。
- 不把“转折点”直接等同于因果证明。
- 不把单次情绪强烈事件自动标记为转折。
- 不把来源观点直接写成系统事实。

## 2. 对象定位

```text
NestedEvent / AtomicFact
-> TurningPoint
-> PhaseSegment / TrajectoryRecord
-> NarrativeIndex
```

`TurningPoint` 引用源事件；它不复制事件内容。

## 3. 标准字段

```json
{
  "schema": "TurningPoint.v1",
  "turning_point_id": "turning_point:payment_terms_blocker",
  "trajectory_id": "trajectory:customer_acme_2026_h1",
  "source_event_ids": [
    "event:payment_terms_objection_2026_06_03",
    "event:procurement_delay_2026_06_10"
  ],
  "turning_point_type": "sales_stage_shift",
  "change_dimension": [
    "commercial_blocker",
    "decision_timeline",
    "risk_level"
  ],
  "before_state": {
    "phase": "pilot_validation",
    "dominant_goal": "validate_solution_fit",
    "risk_level": "medium",
    "evidence_anchor_ids": [
      "evidence:meeting_note_2026_05_12_0002"
    ]
  },
  "after_state": {
    "phase": "contract_blocked",
    "dominant_goal": "resolve_payment_terms_and_procurement_delay",
    "risk_level": "high",
    "evidence_anchor_ids": [
      "evidence:wechat_msg_2026_06_03_0007"
    ]
  },
  "evidence_anchor_ids": [
    "evidence:meeting_note_2026_05_12_0002",
    "evidence:wechat_msg_2026_06_03_0007"
  ],
  "counter_evidence": [
    {
      "event_id": "event:positive_feedback_after_blocker",
      "reason": "后续仍有积极反馈，说明转折不是完全负向关闭。"
    }
  ],
  "confidence": {
    "overall": 0.76,
    "basis": [
      "before_after_phase_change_observed",
      "multiple_evidence_anchors"
    ],
    "limits": [
      "internal_procurement_reason_not_directly_confirmed"
    ]
  },
  "status": "candidate_confirmed_by_document_rules"
}
```

## 4. 转折点类型

建议受控枚举：

```text
relationship_boundary_shift
relationship_rhythm_shift
sales_stage_shift
risk_escalation
risk_reduction
conflict_emergence
conflict_resolution
source_disclosure
identity_revision
goal_change
authority_or_decision_maker_change
public_narrative_shift
evidence_structure_shift
```

说明：

- `identity_revision` 只能标记“身份信息有修订线索”，不得自动合并身份。
- `relationship_boundary_shift` 只能标记“边界表达发生变化”，不得自动改写关系状态。
- `public_narrative_shift` 只能标记来源叙述变化，不等同于事实变化。

## 5. 转折点判定门槛

生成 `TurningPoint` 至少满足以下二项：

```text
事件前后 phase_type 发生变化。
事件前后主导目标发生变化。
事件前后互动节奏、风险等级或关系边界发生变化。
事件引入新的关键人物、组织、来源或证据类型。
事件使原有 PatternClaim 失效或显著增强。
事件使 NarrativeIndex 中的主要检索入口改变。
```

禁止仅凭以下情况生成转折点：

```text
事件情绪强烈但无后续变化证据。
来源使用“重大”“关键”等词，但没有可核对前后差异。
时间线中某事件位置靠前或靠后。
模型认为它“看起来重要”。
```

## 6. 与高权重事件的区别

高权重事件关注：

```text
事件本身重要、风险高、信息密度高、涉及关键人物或外部动作。
```

转折点关注：

```text
事件前后轨迹状态发生可证据化变化。
```

因此：

```text
高权重事件不一定是 TurningPoint。
TurningPoint 一定应有 before_state 与 after_state。
```

## 7. 与因果假设的区别

`TurningPoint` 只说明“前后发生变化，并且该事件是转折候选或标记点”。

它不直接说明：

```text
这个事件就是变化原因。
```

如果要表达原因，必须进入 `CausalHypothesis.v1`：

```text
TurningPoint = 转折标记
CausalHypothesis = 因果解释候选
```

## 8. 检索与反读

转折点查询路径：

```text
NarrativeIndex
-> TurningPoint
-> source_event_ids
-> before_state.evidence_anchor_ids / after_state.evidence_anchor_ids
-> EvidenceAnchor
-> SourceArchive 原文
```

回答长期问题时，转折点应作为结构骨架：

```text
轨迹开始
-> 阶段 1
-> 转折点 A
-> 阶段 2
-> 转折点 B
-> 当前阶段
```

## 9. 通过标准

`TurningPoint.v1` 方案通过的标准：

```text
能表达长期轨迹中的关键变化。
每个转折点都有 before_state 与 after_state。
每个转折点引用源事件和 EvidenceAnchor。
能区分高权重事件、转折点和因果假设。
能保留反证或限制。
不产生 relationship_state 写入。
不产生 identity_merge。
不产生 external_action。
```

## 10. 当前结论

`TurningPoint.v1` 可以补足当前方案中“长期事件有顺序，但缺少关键变化点”的问题。

它必须保持为解释性对象；所有高风险状态变化仍需用户确认后才能进入关系状态层或行动层。
