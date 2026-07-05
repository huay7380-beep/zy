# AI 自动化节点与主系统调度设计

本文件说明如何让跨境电商子项目被父级系统访问和控制。当前是草案，待确认后再实现脚本、schema 和 UI。

## 调度入口

主系统应读取：

```text
cross-border-ecommerce-ai-route/nodes/process-manifest.json
```

再根据 `node_catalog_path` 读取：

```text
cross-border-ecommerce-ai-route/nodes/node-catalog.json
```

## 事件标准

跨境电商所有输入统一走：

```text
SourceAdapter
-> IntakeObservation
-> RawEvent
-> SemanticEvent
-> ContextSnapshot
-> NodeDecision
-> Draft / Plan / Command
-> HumanGate
-> ControlledAction
-> Completion
-> Audit / Memory Writeback
```

## 可接入来源

| 来源 | 类型 | 首期权限 |
| --- | --- | --- |
| 独立站 RFQ | 表单/API/导出 | 只读接入 |
| 邮箱 | IMAP/Gmail/Outlook/API | 只读接入，发送需确认 |
| WhatsApp Business | API/导出 | 只读接入，模板消息需确认 |
| LinkedIn | 手工导出/广告表单 | 只读接入，私信需确认 |
| Google Ads/Merchant | 报表/API | 只读接入 |
| Meta Ads | 报表/API | 只读接入 |
| B2B 平台 | 导出/手工导入/API | 只读接入 |
| ERP/库存 | 文件/API | 只读或内部写入 |
| 物流/报关资料 | 文件夹/API | 只读校验 |

## 节点分层

| 层 | 节点 |
| --- | --- |
| 合规层 | 主体合规、产品合规、目标国准入 |
| 内容层 | 产品建档、图片视频、产品页、资料包 |
| 获客层 | 市场选择、SEO、广告、社媒、邮件、展会 |
| 销售层 | 线索捕获、询盘接待、报价、谈判、PI |
| 履约层 | 订单、收款、生产、QC、物流、报关、税务 |
| 客户层 | 售后、复购、客户维护 |
| 审计层 | 数据回写、ROI、风险、流程优化 |

## 受控发送

任何对外内容先生成：

```json
{
  "contract": "outbound_send_command.draft.v1",
  "channel": "email|whatsapp|linkedin|site_chat",
  "target_identity": {},
  "message_draft": "",
  "attachments": [],
  "business_context": {},
  "risk_checks": [],
  "real_execution_allowed": false
}
```

只有当人工确认包通过后，才可进入真实发送：

- 目标身份确认。
- 内容确认。
- 附件确认。
- 报价/付款/合规承诺确认。
- 发送窗口确认。
- 审计记录确认。

## 报价引擎

报价不是 LLM 单独生成。必须由结构化数据驱动：

```text
ProductMaster
+ PriceBook
+ CostModel
+ LogisticsQuote
+ CustomerRisk
+ Incoterms
+ ComplianceProfile
= QuoteDraft
```

LLM 只负责：

- 缺口提问。
- 英文表达。
- 报价说明。
- 异议处理。
- 跟进计划。

## 状态和证据

每个节点都输出：

- `status`: `draft | blocked | ready_for_review | confirmed | executed | audited`
- `required_inputs`
- `blockers`
- `artifacts`
- `next_actions`
- `audit_log`

## 父系统集成建议

确认后新增：

```text
schemas/cross-border-ecommerce-route.schema.json
packages/cross-border-ecommerce-runtime/src/cross-border-route.mjs
packages/cross-border-ecommerce-runtime/tests/cross-border-route.test.mjs
scripts/run-cross-border-route-demo.mjs
cross-border-ecommerce-ai-route/runtime/**
```

再把节点作为扩展写入父级流程树，而不是直接修改已有人际/沟通 MVP 主线。

## 最小运行样例

```text
输入：客户 RFQ
-> cbx_08_lead_capture
-> cbx_09_inquiry_reception
-> cbx_10_quote_engine
-> 输出：首响草案、缺口问题、报价草案、跟进计划
-> 人工确认
-> 受控发送
-> 回写客户事件
```
