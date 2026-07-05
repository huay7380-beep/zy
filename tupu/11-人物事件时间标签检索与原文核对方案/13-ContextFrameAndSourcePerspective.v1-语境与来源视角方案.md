# ContextFrame / SourcePerspective.v1 语境与来源视角方案

状态：`draft_for_user_review`

日期：2026-07-04

适用目录：`D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案`

## 0. 目标

`ContextFrame.v1` 用于记录事件被理解时所处的社会、关系、业务、文化和互动语境。

`SourcePerspective.v1` 用于记录某条信息是谁说的、从什么位置说的、以什么话语形式说的、它的可靠性和限制是什么。

它们共同解决的问题是：

```text
同一句话在不同关系、场景、文化和业务流程中意义不同。
某来源说了某事，不等于该事已被系统确认为事实。
公开案件、多方叙述、销售推进、恋爱互动中，需要区分原文、转述、解释、立场和事实。
```

## 1. 使用边界

允许做：

- 保存事件解释所需的关系语境、业务语境、社交语境、来源位置。
- 区分当事人自己的分类和系统分析分类。
- 区分直接陈述、转述、引用、解释。
- 为多源冲突和长期叙事提供来源视角约束。

不允许做：

- 不写入 `relationship_state`。
- 不执行 `identity_merge`。
- 不执行 `external_action`。
- 不无证据推断动机。
- 不把来源立场写成系统事实。
- 不用文化或社会标签替代具体证据。

## 2. ContextFrame.v1 对象定位

```text
SourceArchive / EvidenceAnchor
-> ContextFrame
-> NestedEvent / PhaseSegment / TrajectoryRecord
```

`ContextFrame` 可以挂在单个事件、事件线索、阶段或长期轨迹上。

## 3. ContextFrame.v1 标准字段

```json
{
  "schema": "ContextFrame.v1",
  "context_frame_id": "context:relationship_boundary_chat_2026_05",
  "applies_to": {
    "event_ids": ["event:need_space_2026_05_02"],
    "phase_segment_ids": ["phase:boundary_negotiation_2026_05"],
    "trajectory_ids": ["trajectory:relationship_x_2026_q2"]
  },
  "context_type": [
    "romantic_relationship",
    "private_chat",
    "boundary_negotiation"
  ],
  "interaction_setting": {
    "channel": "wechat_desktop",
    "visibility": "private",
    "synchrony": "asynchronous_message",
    "participants": ["person:p001", "person:p002"]
  },
  "emic_labels": [
    {
      "label": "需要一点空间",
      "speaker_ref": "person:p002",
      "evidence_anchor_id": "evidence:wechat_msg_2026_05_02_0012"
    }
  ],
  "etic_labels": [
    "boundary_expression",
    "distance_request",
    "interaction_pressure_signal"
  ],
  "local_norms_or_rules": [
    {
      "description": "双方此前存在较高频互动，当前表达需要空间可能表示互动节奏边界变化。",
      "basis": "derived_from_prior_events",
      "evidence_anchor_ids": [
        "evidence:wechat_msg_2026_03_01_0001",
        "evidence:wechat_msg_2026_05_02_0012"
      ]
    }
  ],
  "interpretation_scope": {
    "allowed": [
      "用于理解该表达在当前互动轨迹中的边界意义"
    ],
    "forbidden": [
      "不得自动写入分手状态",
      "不得推断对方真实动机"
    ]
  },
  "confidence": {
    "overall": 0.68,
    "limits": [
      "offline_context_missing",
      "speaker_intent_not_directly_confirmed"
    ]
  },
  "status": "active_interpretive_record"
}
```

## 4. SourcePerspective.v1 对象定位

```text
SourceArchive
-> EvidenceAnchor
-> SourcePerspective
-> AtomicFact / Claim / ConflictSet / NarrativeIndex
```

`SourcePerspective` 用于避免把“来源说法”直接混入系统事实。

## 5. SourcePerspective.v1 标准字段

```json
{
  "schema": "SourcePerspective.v1",
  "source_perspective_id": "source_perspective:news_report_2026_07_01_a",
  "source_ref": "source:news_report_2026_07_01_a",
  "speaker_or_author_ref": "org:media_a",
  "position_or_role": "third_party_reporter",
  "claim_voice": "reported",
  "statement_type": [
    "fact_claim",
    "interpretive_summary"
  ],
  "applies_to_evidence_anchor_ids": [
    "evidence:news_report_2026_07_01_a_0004"
  ],
  "interest_or_incentive": {
    "known": false,
    "description": null,
    "evidence_anchor_ids": []
  },
  "reliability_profile": {
    "source_type": "public_report",
    "directness": "secondary",
    "verification_status": "unverified_by_system",
    "known_limits": [
      "not_primary_source",
      "may_selectively_quote"
    ]
  },
  "perspective_summary": "该来源提供第三方报道和解释性概括，不应直接等同于原始事实。",
  "status": "active_source_context"
}
```

## 6. Emic / Etic 分类规则

`emic_label` 指当事人或来源自己的说法。

`etic_label` 指系统为了归类、检索和分析使用的外部标签。

示例：

```text
emic_label = "我只是需要冷静一下"
etic_label = "boundary_expression"
```

约束：

```text
emic_label 必须有 EvidenceAnchor。
etic_label 必须标记为系统分类。
不得把 etic_label 改写成当事人原话。
不得把 emic_label 扩展为未被表达的心理动机。
```

## 7. 来源话语类型

`claim_voice` 推荐受控枚举：

```text
direct
reported
quoted
interpreted
summarized
rumor
official_statement
legal_or_formal_document
user_manual_note
model_derived
```

其中：

- `direct`：直接来源原文。
- `reported`：来源报道其他人或其他材料。
- `quoted`：引号或明确引用。
- `interpreted`：来源自己的解释。
- `model_derived`：系统归纳，必须保持可撤销。

## 8. 与 ConflictSet 的关系

当多个来源对同一事实存在不同说法：

```text
ConflictSet
-> claims
-> each claim has SourcePerspective
-> each claim has EvidenceAnchor
```

这样可以避免：

```text
把 A 来源的说法当作事实。
把 B 来源的反驳当作事实。
把模型整合后的“折中说法”当作事实。
```

## 9. 与长期叙事的关系

长期叙事中，`ContextFrame` 和 `SourcePerspective` 至少在三类场景必须出现：

```text
公开案件式多源材料。
关系边界、情绪表达、身份定位发生变化。
销售客户推进中出现组织角色、决策权、采购流程、第三方转述。
```

## 10. 检索与反读

语境/来源查询路径：

```text
NarrativeIndex
-> ContextFrame / SourcePerspective
-> applies_to event or evidence
-> EvidenceAnchor
-> SourceArchive 原文
```

回答时必须分开：

```text
事实层：原文直接支持什么。
来源层：谁说的、从什么位置说的。
语境层：该表达在什么互动/业务/社会场景中出现。
解释层：系统只做了什么有限解释。
```

## 11. 通过标准

`ContextFrame / SourcePerspective.v1` 方案通过的标准：

```text
能保存事件解释所需语境。
能区分 emic_label 与 etic_label。
能区分 direct/reported/quoted/interpreted/summarized 等话语类型。
能给 ConflictSet 和公开案件式材料提供来源视角。
能防止“来源说法”被误写成系统事实。
不产生 relationship_state 写入。
不产生 identity_merge。
不产生 external_action。
```

## 12. 当前结论

`ContextFrame / SourcePerspective.v1` 是多学科审查中的关键补丁。

它让系统从“只存事件”升级为“在可核对语境中理解事件”，但仍然不允许脱离 EvidenceAnchor 推断动机、关系状态或外部行动。
