# PhaseSegment.v1 阶段划分方案

状态：`draft_for_user_review`

日期：2026-07-04

适用目录：`D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案`

## 0. 目标

`PhaseSegment.v1` 用于把长期轨迹拆成可解释、可核对、可检索的阶段。

它解决的问题是：

```text
长期事件序列中，哪些事件属于同一个阶段？
阶段从哪里开始，到哪里结束？
阶段边界是证据明确，还是分析者根据规则推定？
阶段摘要能否回到原文和事件证据？
```

`PhaseSegment` 是长期叙事层对象，不替代 `NestedEvent`、`AtomicFact`、`EvidenceAnchor`。

## 1. 使用边界

`PhaseSegment.v1` 允许做：

- 对销售推进、恋爱关系维护、公开案件时间线进行阶段化。
- 记录阶段入口条件、退出条件、代表事件和 EvidenceAnchor。
- 允许阶段边界不确定，但必须显式标记。
- 支持阶段重叠，例如技术评审和商务谈判同时存在。

`PhaseSegment.v1` 不允许做：

- 不写入 `relationship_state`。
- 不执行 `identity_merge`。
- 不执行 `external_action`。
- 不把阶段名当作原始事实。
- 不把阶段摘要替代原文。
- 不在证据不足时强行切分阶段。

## 2. 对象定位

```text
NestedEvent / AtomicFact
-> EventThread
-> PhaseSegment
-> TrajectoryRecord
-> NarrativeIndex
```

`PhaseSegment` 应由事件线索和证据锚点支持。它不是“按月份切块”，而是按语义、目标、关系边界、风险状态、互动节奏等变化进行阶段化。

## 3. 标准字段

```json
{
  "schema": "PhaseSegment.v1",
  "phase_segment_id": "phase:acme_2026_h1_contract_blocked",
  "trajectory_id": "trajectory:customer_acme_2026_h1",
  "phase_type": "contract_blocked",
  "phase_label": {
    "system_label": "contract_blocked",
    "source_label": null,
    "label_origin": "analyst_rule"
  },
  "time_range": {
    "start": "2026-05-01",
    "end": "2026-06-30",
    "precision": "month",
    "boundary_confidence": {
      "start": 0.72,
      "end": 0.61
    }
  },
  "entry_conditions": [
    "pilot_passed",
    "contract_terms_discussion_started"
  ],
  "exit_conditions": [
    "contract_signed",
    "procurement_rejected",
    "phase_superseded_by_new_evidence"
  ],
  "representative_event_ids": [
    "event:pilot_passed_2026_05",
    "event:payment_terms_blocker_2026_06"
  ],
  "dominant_tags": [
    "tag:sales_contract",
    "tag:payment_terms",
    "tag:procurement_delay"
  ],
  "evidence_anchor_ids": [
    "evidence:meeting_note_2026_05_12_0002",
    "evidence:wechat_msg_2026_06_03_0007"
  ],
  "phase_summary": {
    "short": "试点通过后，客户推进主要卡在合同条款、付款周期和内部采购流程。",
    "summary_source": "derived_from_representative_events",
    "summary_version": "summary:phase_acme_contract_blocked:v1"
  },
  "confidence": {
    "overall": 0.74,
    "basis": [
      "representative_events_have_evidence",
      "entry_condition_observed"
    ],
    "limits": [
      "procurement_internal_process_not_directly_observed"
    ]
  },
  "status": "active_interpretive_record"
}
```

## 4. 阶段边界规则

阶段开始必须满足至少一类证据：

```text
出现新的目标状态。
出现新的主导问题。
出现新的互动规则或关系边界。
出现新的参与者或关键角色。
出现风险、冲突、阻碍或承诺状态变化。
来源材料明确使用阶段性表达。
```

阶段结束必须满足至少一类证据：

```text
主导问题被解决。
主导问题转移。
目标状态改变。
关键关系边界改变。
后续事件无法再由该阶段解释。
用户或来源明确标记阶段结束。
```

阶段边界不清晰时：

```text
boundary_confidence < 0.65
status = needs_review
必须保留 EvidenceAnchor 与不确定说明
不得为了叙事完整强行闭合阶段
```

## 5. 阶段类型建议

### 5.1 销售客户推进

```text
lead_contact
interest_confirmation
needs_discovery
technical_review
commercial_negotiation
pilot_validation
contract_blocked
procurement_delay
closed_won
closed_lost
paused
```

### 5.2 恋爱关系维护

```text
initial_contact
high_frequency_interaction
mutual_exploration
boundary_negotiation
distance_increase
conflict_or_pressure
repair_attempt
stable_low_frequency
relationship_state_uncertain
```

注意：这些阶段名不是关系状态写入，只是事件组织标签。

### 5.3 公开案件式分析

```text
background_context
event_onset
dispute_emergence
multi_source_expansion
formal_response
public_narrative_shift
evidence_conflict_phase
resolution_or_open_end
```

## 6. 与来源语言的区分

阶段名有两类：

```text
source_label：来源原文使用的阶段表述。
system_label：系统为了检索和组织使用的阶段标签。
```

示例：

```text
source_label = "先冷静一段时间"
system_label = "boundary_negotiation"
```

系统不得把 `system_label` 误写为当事人原话；所有 `source_label` 必须可回到 EvidenceAnchor。

## 7. 阶段重叠

长期事件中允许阶段重叠。例如：

```text
technical_review 与 commercial_negotiation 同时存在。
distance_increase 与 repair_attempt 同时存在。
formal_response 与 public_narrative_shift 同时存在。
```

重叠阶段需要记录：

```json
{
  "overlap_with": [
    {
      "phase_segment_id": "phase:acme_commercial_negotiation",
      "overlap_type": "parallel_process",
      "evidence_anchor_ids": ["evidence:meeting_note_2026_05_12_0002"]
    }
  ]
}
```

## 8. 检索与反读

阶段型查询路径：

```text
NarrativeIndex
-> PhaseSegment
-> representative_event_ids
-> EvidenceAnchor
-> SourceArchive 原文
```

阶段摘要必须满足：

```text
可通过 representative_event_ids 反推。
可通过 EvidenceAnchor 回读。
可说明哪些信息来自原文，哪些是阶段化解释。
```

## 9. 通过标准

`PhaseSegment.v1` 方案通过的标准：

```text
能把长期轨迹拆为阶段。
阶段边界有 entry_conditions 与 exit_conditions。
阶段可引用代表事件和 EvidenceAnchor。
阶段标签区分 source_label 与 system_label。
支持阶段重叠和边界不确定。
不产生 relationship_state 写入。
不产生 identity_merge。
不产生 external_action。
```

## 10. 当前结论

`PhaseSegment.v1` 可以补足当前方案中“长期轨迹无法稳定分期”的问题。

它的核心约束是：阶段是解释性组织，不是原文事实；阶段摘要必须能回到事件和证据。
