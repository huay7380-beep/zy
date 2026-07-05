# EvidenceAnchor.v1 证据锚点与原文反读规则

状态：`draft_pending_user_review`

日期：2026-07-04

## 0. 目标

`EvidenceAnchor.v1` 定义事件、事实、标签、摘要如何回到原文。

核心原则：

```text
没有证据锚点的内容不能成为可回答事实。
摘要不能替代原文。
标签不能替代原文。
模型推断不能替代原文。
```

## 1. EvidenceAnchor 定义

`EvidenceAnchor` 是最小可定位证据对象。

建议字段：

```json
{
  "schema_version": "evidence_anchor.v1",
  "evidence_anchor_id": "evidence_xxx",
  "source_archive_id": "source_archive_xxx",
  "frame_id": "frame_xxx",
  "raw_observation_id": "raw_obs_xxx",
  "semantic_unit_id": "sem_xxx",
  "offset_start": 0,
  "offset_end": 0,
  "quote_snippet": "",
  "evidence_type": "direct_original",
  "evidence_strength": "strong",
  "readback_status": "passed",
  "content_hash": "sha256:...",
  "created_from": "evidence_anchor.v1"
}
```

## 2. 证据类型

| 类型 | 含义 | 可否作为高风险唯一证据 |
| --- | --- | --- |
| `direct_original` | 原始文本、原图、原记录直接可读 | 可以 |
| `verbatim_quote` | 来源中的逐字引用 | 通常可以，但需来源可靠性 |
| `structured_record` | API、表格、日志字段 | 可以 |
| `ocr_text` | OCR 结果 | 需要质量阈值或复核 |
| `asr_text` | 语音转写 | 需要质量阈值或复核 |
| `third_party_report` | 第三方报道或转述 | 不建议 |
| `summary_only` | 摘要级材料 | 不可以 |
| `model_inference` | 模型推断 | 不可以 |

## 3. 证据强度

```text
strong: 原文或结构化记录直接支持
medium: 转写、OCR、可靠转述支持
weak: 摘要、低质量识别、单方转述
insufficient: 无法支撑事实写入
```

高风险事件、关系变更、身份合并、外部动作必须要求：

```text
evidence_strength=strong 或多证据交叉验证
readback_status=passed
```

## 4. 原文反读路径

标准路径：

```text
TagAssignment / NestedEvent / AtomicFact / SummaryShard
-> evidence_anchor_id
-> RawObservation
-> SignalFrame
-> SourceArchive
-> raw_text_ref + offset
-> quote_snippet
-> hash check
```

如果路径断裂：

```text
readback_status=failed
event_status=extraction_pending 或 needs_review
不得进入 ContextSnapshot 的可回答事实区
```

## 5. Offset 和 hash 规则

每个证据锚点必须支持两种核对：

1. 子串核对：

```text
raw_text[offset_start:offset_end] == quote_snippet
```

2. 来源完整性核对：

```text
sha256(raw_text) == SourceArchive.content_hash
```

如果来源是图像、音频或 PDF：

- 保存 artifact hash。
- 保存 OCR/ASR/PDF 提取版本。
- 保存提取质量。
- 原始 artifact 不被提取文本替代。

## 6. 证据锚点和标签的关系

每个重要标签必须能解释“为什么打这个标签”。

示例：

```text
TagAssignment: emotion.appraisal:pressure
-> subject_ref: evt_010
-> evidence_anchor: "压力会变大"
-> source raw text: "她说最近不要一直催她回复，压力会变大。"
```

标签注册通过不等于证据通过。必须同时满足：

```text
tag_definition_match=true
evidence_anchor_readback=true
subject_ref_exists=true
```

## 7. 摘要和证据的边界

`SummaryShard` 可以引用证据锚点，但不能成为证据锚点的替代品。

允许：

```text
SummaryShard 覆盖多个事件。
SummaryShard 列出 evidence_anchor_ids。
SummaryShard 用于热路径快速读取。
```

禁止：

```text
只保存摘要，不保存原文。
用摘要文本作为事件证据。
用摘要推断补齐原文没有的事实。
```

## 8. 冷读触发规则

以下情况必须冷读原文：

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

冷读输出：

```json
{
  "readback_status": "passed|failed|partial",
  "source_archive_id": "",
  "evidence_anchor_id": "",
  "quote_snippet": "",
  "raw_text_ref": "",
  "offset_match": true,
  "hash_match": true,
  "failure_reason": null
}
```

## 9. 公开案件式验证边界

公开案件材料中常见“事实描述”和“裁判观点”混在一起。

处理规则：

- 文书事实描述可以保存为 `source_claimed_fact`。
- 裁判观点可以保存为来源文本，但不能成为系统事实。
- 新闻摘要可以作为 `third_party_report`，不能替代原始公开材料。
- 判决结论不得作为 `fact_status:confirmed_by_system`。

## 10. 通过标准

`EvidenceAnchor.v1` 方案通过需要满足：

```text
every_event_has_evidence_anchor=true
every_atomic_fact_has_evidence_anchor=true
tag_assignment_can_explain_evidence=true
summary_cannot_replace_original=true
offset_check_defined=true
hash_check_defined=true
cold_read_triggers_defined=true
summary_only_not_high_risk_evidence=true
model_inference_not_original_evidence=true
```

