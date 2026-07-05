# TrajectoryRecord.v1 长期轨迹对象方案

状态：`draft_for_user_review`

日期：2026-07-04

适用目录：`D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案`

## 0. 目标

`TrajectoryRecord.v1` 用于表达一个人物、关系、客户、项目或公开案件在较长时间内的整体发展轨迹。

它解决的问题不是“发生了什么单个事件”，而是：

```text
这一组事件如何发展到现在？
当前关系或客户推进卡在什么阶段？
哪些阶段、转折点和重复模式共同构成了当前局面？
如果需要回答长期叙事问题，应从哪些 EvidenceAnchor 回到原文核对？
```

`TrajectoryRecord` 是叙事组织层，不是事实源。它只能引用 `NestedEvent`、`AtomicFact`、`PhaseSegment`、`TurningPoint`、`PatternClaim`、`EvidenceAnchor` 等对象，不允许覆盖原始事件和原始证据。

## 1. 使用边界

`TrajectoryRecord.v1` 允许做：

- 把长期事件序列组织成一个可检索轨迹。
- 把销售客户推进、恋爱关系维护、公开案件分析放入同一类长期叙事容器。
- 为模型上下文组装提供“轨迹级入口”。
- 记录轨迹摘要、阶段列表、转折点列表、模式声明列表和证据锚点。

`TrajectoryRecord.v1` 不允许做：

- 不写入 `relationship_state`。
- 不执行 `identity_merge`。
- 不执行 `external_action`。
- 不把模型推断当作事实。
- 不把阶段摘要替代原文。
- 不把因果假设直接写成事实边。

凡涉及关系状态更新、身份合并、真实外部动作、学习权重转正，仍必须走独立确认流程。

## 2. 对象定位

推荐链路：

```text
SourceArchive
-> EvidenceAnchor
-> AtomicFact / NestedEvent
-> EventThread
-> PhaseSegment
-> TurningPoint
-> PatternClaim
-> TrajectoryRecord
-> NarrativeIndex
-> NarrativeContextSnapshot
```

`TrajectoryRecord` 位于事件对象之上、上下文组装之前。

它不参与原文切分；它只负责引用和组织。

## 3. 标准字段

```json
{
  "schema": "TrajectoryRecord.v1",
  "trajectory_id": "trajectory:customer_acme_2026_h1",
  "subject_refs": [
    "person:p001",
    "org:acme",
    "relationship:r001"
  ],
  "scope": {
    "domain": "sales_customer_progress",
    "description": "ACME 客户 2026 上半年推进轨迹",
    "time_range": {
      "start": "2026-01-01",
      "end": "2026-06-30",
      "precision": "month"
    }
  },
  "goal_domain": [
    "sales_conversion",
    "relationship_maintenance"
  ],
  "phase_segment_ids": [
    "phase:acme_2026_h1_discovery",
    "phase:acme_2026_h1_technical_review",
    "phase:acme_2026_h1_contract_blocked"
  ],
  "turning_point_ids": [
    "turning_point:competitor_quote_seen",
    "turning_point:payment_terms_blocker"
  ],
  "pattern_claim_ids": [
    "pattern:decision_maker_absent_repeatedly"
  ],
  "event_thread_ids": [
    "event_thread:technical_review",
    "event_thread:commercial_negotiation"
  ],
  "evidence_anchor_ids": [
    "evidence:wechat_msg_001_0001",
    "evidence:meeting_note_2026_05_12_0002"
  ],
  "trajectory_summary": {
    "short": "客户从初步兴趣进入技术评审，试点通过后卡在付款周期和内部采购流程。",
    "summary_type": "trajectory_overview",
    "summary_source": "derived_from_referenced_events",
    "summary_version": "summary:trajectory_acme_2026_h1:v1"
  },
  "confidence": {
    "overall": 0.78,
    "basis": "multiple_events_with_evidence_anchors",
    "limits": [
      "decision_maker_intent_not_directly_confirmed"
    ]
  },
  "status": "active_interpretive_record"
}
```

## 4. 字段规则

| 字段 | 规则 |
| --- | --- |
| `trajectory_id` | 全局唯一，不复用事件 ID |
| `subject_refs` | 可指向人物、组织、关系、项目，不直接展开身份细节 |
| `scope.domain` | 必须从受控枚举进入，例如 `sales_customer_progress`、`romantic_relationship_maintenance`、`public_case_timeline` |
| `phase_segment_ids` | 只能引用已生成或待确认的 `PhaseSegment` |
| `turning_point_ids` | 只能引用已生成或待确认的 `TurningPoint` |
| `pattern_claim_ids` | 只能引用 `PatternClaim`，不得用自由摘要替代 |
| `event_thread_ids` | 保留事件线索入口 |
| `evidence_anchor_ids` | 至少保留能回读关键阶段的 EvidenceAnchor |
| `trajectory_summary` | 只做轨迹摘要，不可替代原文 |
| `confidence` | 必须说明依据和限制 |
| `status` | 区分 `draft`、`active_interpretive_record`、`superseded`、`needs_review` |

## 5. 轨迹类型

### 5.1 销售客户推进轨迹

适用问题：

```text
客户从什么时候开始有兴趣？
推进过程中卡在哪里？
有哪些持续阻碍？
下一次沟通需要补哪类证据或决策人信息？
```

典型阶段：

```text
lead_contact
interest_confirmation
technical_review
commercial_negotiation
pilot_validation
contract_blocked
lost_or_paused
closed_won
```

### 5.2 恋爱关系维护轨迹

适用问题：

```text
这段关系从高频互动如何变成低频互动？
边界表达和情绪变化集中出现在哪些阶段？
哪些行为反复引发压力？
是否存在需要用户确认的关系状态变化？
```

注意：该轨迹只能组织证据和解释，不得自动改写关系状态。

### 5.3 公开案件式轨迹

适用问题：

```text
公开材料中的时间线如何发展？
不同来源对同一阶段如何描述？
哪些来源只提供观点，哪些来源提供事实主张？
因果关系是被证明、被争议，还是只是叙事假设？
```

公开案件只用于结构化压力测试，不根据案件判决进行法律判断。

## 6. 进入条件

生成 `TrajectoryRecord` 前必须满足：

```text
至少存在 3 个相关 NestedEvent 或 1 条 EventThread
至少存在 1 个 EvidenceAnchor 可回读原文
存在明确 subject_refs
存在明确 scope.domain
存在时间范围，允许 uncertain 或 open-ended
```

长期叙事问题出现时可以触发候选轨迹：

```text
“这一段关系怎么发展到现在？”
“这个客户卡在哪里？”
“这个案件的关键变化是什么？”
“最近几个月整体趋势是什么？”
```

## 7. 退出与失效条件

`TrajectoryRecord` 应被标记为 `needs_review` 或 `superseded` 的情况：

- 新原文证据推翻核心阶段判断。
- 身份注册表中主体被用户修改，需要重建相关 `person:*` 标签和索引。
- 轨迹范围被用户重新定义。
- 关键阶段或转折点被删除或标记为错误。
- 摘要版本无法追溯到 EvidenceAnchor。

## 8. 检索与上下文组装

轨迹型查询推荐路径：

```text
NarrativeQueryPlan
-> NarrativeIndex
-> TrajectoryRecord
-> PhaseSegment / TurningPoint / PatternClaim
-> representative NestedEvent
-> EvidenceAnchor
-> SourceArchive 原文片段
-> NarrativeContextSnapshot
```

轨迹层返回给模型的内容必须分层：

```text
1. 轨迹摘要
2. 阶段列表
3. 转折点列表
4. 重复模式声明
5. 冲突或不确定点
6. 必要 EvidenceAnchor 与原文摘录
```

## 9. 通过标准

`TrajectoryRecord.v1` 方案通过的标准：

```text
能够把多个月、多来源、多人物事件组织成长期轨迹。
能够引用 PhaseSegment、TurningPoint、PatternClaim。
能够通过 EvidenceAnchor 回读原文。
能够支持销售客户推进、恋爱关系维护、公开案件式分析。
能够明确区分事实、摘要、解释和假设。
不产生 relationship_state 写入。
不产生 identity_merge。
不产生 external_action。
```

## 10. 当前结论

`TrajectoryRecord.v1` 可以补足当前方案中“事件能存，但长期发展叙事不稳定”的缺口。

它的定位是解释层和检索入口，不是事实层、关系状态层或行动层。进入 schema/runtime 前，仍需要用户确认字段、状态机和验证样例。
