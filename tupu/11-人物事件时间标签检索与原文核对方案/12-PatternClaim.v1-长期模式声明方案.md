# PatternClaim.v1 长期模式声明方案

状态：`draft_for_user_review`

日期：2026-07-04

适用目录：`D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案`

## 0. 目标

`PatternClaim.v1` 用于表达长期叙事中的重复、渐变、节奏、强度和基线变化。

它解决的问题是：

```text
“经常”“反复”“逐渐”“越来越”“总是”“最近变少了”这类说法是否有证据？
模式是来自原文直接表达，还是系统从多个事件中归纳？
模式有几个支持事件？有没有反例？
模式适用的时间窗口和人物范围是什么？
```

`PatternClaim` 是可审查的模式声明，不是自由摘要。

## 1. 使用边界

`PatternClaim.v1` 允许做：

- 记录重复行为、互动节奏变化、风险累积、客户阻碍反复出现等模式。
- 明确证据窗口、支持事件数量、反例、置信度。
- 支持销售客户推进、恋爱关系维护、公开案件叙事。
- 把“模式感”变成可核对对象。

`PatternClaim.v1` 不允许做：

- 不写入 `relationship_state`。
- 不执行 `identity_merge`。
- 不执行 `external_action`。
- 不凭一次事件声明长期模式。
- 不把模型印象写成事实。
- 不忽略反例。
- 不把摘要替代 EvidenceAnchor 或原文。

## 2. 对象定位

```text
NestedEvent / AtomicFact
-> PatternClaim
-> TrajectoryRecord
-> NarrativeIndex
```

`PatternClaim` 引用多个事件和证据，用于长期解释和检索。

## 3. 标准字段

```json
{
  "schema": "PatternClaim.v1",
  "pattern_claim_id": "pattern:reply_latency_increased_2026_q2",
  "trajectory_id": "trajectory:relationship_x_2026_q2",
  "pattern_type": "trend_change",
  "claim_text": "2026 年 4 月以后，对方回复节奏相对前期变慢，并多次表达需要空间。",
  "claim_origin": "derived_by_rule",
  "evidence_window": {
    "start": "2026-03-01",
    "end": "2026-06-30",
    "baseline_window": {
      "start": "2026-01-01",
      "end": "2026-02-28"
    },
    "precision": "day_or_message_sequence"
  },
  "supporting_event_ids": [
    "event:reply_delay_2026_04_08",
    "event:need_space_2026_05_02",
    "event:low_frequency_2026_06_11"
  ],
  "counterexample_event_ids": [
    "event:active_invitation_2026_05_18"
  ],
  "evidence_anchor_ids": [
    "evidence:wechat_msg_2026_04_08_0003",
    "evidence:wechat_msg_2026_05_02_0012",
    "evidence:wechat_msg_2026_06_11_0005"
  ],
  "minimum_occurrences": 3,
  "observed_count": 3,
  "dimensions": [
    "frequency",
    "latency",
    "boundary_expression"
  ],
  "confidence": {
    "overall": 0.71,
    "basis": [
      "observed_count_meets_threshold",
      "baseline_window_exists",
      "counterexample_recorded"
    ],
    "limits": [
      "message_volume_may_be_incomplete",
      "offline_interactions_not_fully_observed"
    ]
  },
  "inference_level": "pattern_inference",
  "status": "active_interpretive_record"
}
```

## 4. 模式类型

建议受控枚举：

```text
recurrence
trend_increase
trend_decrease
rhythm_change
intensity_change
baseline_shift
avoidance_pattern
pressure_response_pattern
decision_delay_pattern
source_claim_repetition
conflict_repetition
```

## 5. 科学化约束

模式声明至少需要说明五个要素：

```text
frequency：发生频率。
duration：持续时间。
intensity：强度变化。
recurrence：是否反复出现。
baseline：相对什么基线发生变化。
```

缺少基线时，只能写：

```text
观察到多次出现，无法确认相对变化幅度。
```

缺少时间窗口时，只能写：

```text
存在模式候选，但证据窗口不足。
```

缺少支持事件数量时，不得生成长期模式，只能生成标签或单事件摘要。

## 6. 最低证据门槛

推荐初始规则：

```text
recurrence：至少 3 个支持事件。
trend_change：至少 2 个阶段窗口 + 1 个基线窗口。
baseline_shift：必须存在前后窗口对比。
source_claim_repetition：至少 2 个独立来源或同一来源不同时间表达。
high_risk_pattern：必须触发冷读原文核对。
```

如果只存在 2 个事件：

```text
status = candidate_insufficient_evidence
不得作为稳定模式进入建议生成。
```

## 7. 反例规则

任何模式声明都必须允许反例。

反例来源包括：

```text
与模式相反的事件。
来源中主动否认该模式。
时间窗口中存在明显中断。
证据采样不完整。
用户手动标记不认同该模式。
```

反例不一定推翻模式，但必须降低置信度或改变适用范围。

## 8. 与标签的关系

标签可以快速召回相关内容，例如：

```text
tag:reply_latency
tag:need_space
tag:procurement_delay
tag:decision_maker_absent
```

但标签不是模式声明。

```text
Tag = 检索入口
PatternClaim = 带证据窗口、计数、反例和置信度的长期模式对象
```

## 9. 检索与反读

模式查询路径：

```text
NarrativeIndex
-> PatternClaim
-> supporting_event_ids / counterexample_event_ids
-> EvidenceAnchor
-> SourceArchive 原文
```

回答用户问题时，模式声明必须分三层：

```text
1. 精简模式结论。
2. 支持事件数量、时间窗口、反例。
3. 必要原文证据锚点。
```

## 10. 通过标准

`PatternClaim.v1` 方案通过的标准：

```text
能表达长期重复、渐变、节奏和基线变化。
每个模式有 evidence_window。
每个模式有 supporting_event_ids。
每个模式允许 counterexample_event_ids。
每个模式有 minimum_occurrences 与 observed_count。
能区分标签、摘要、模式声明。
不产生 relationship_state 写入。
不产生 identity_merge。
不产生 external_action。
```

## 11. 当前结论

`PatternClaim.v1` 可以防止系统把“感觉上经常发生”误写成事实。

它为长期关系维护和销售推进中的“反复卡点”“互动节奏变化”“压力反应模式”提供可验证表达。
