# 实施路线图与验收标准

## 阶段 0：理论方案确认

当前阶段。

验收：

- 子项目目录存在。
- README、AGENTS、docs、nodes、schemas、templates 存在。
- JSON 文件可解析。
- 用户确认方向、模式和节点拆分。

## 阶段 1：数据契约和样例闭环

目标：把理论节点变成可运行样例。

交付：

- `schemas/cross-border-inquiry.schema.json`
- `schemas/cross-border-quote.schema.json`
- `schemas/product-master.schema.json`
- `scripts/run-cross-border-route-demo.mjs`
- `examples/cross-border-inquiry.sample.json`
- `cross-border-ecommerce-ai-route/runtime/demo/**`

验收：

- 样例询盘能生成 `inquiry_intake.v1`。
- 样例产品能生成 `quote_draft.v1`。
- 报价不通过门禁时能输出 blocker。
- 所有对外内容为 draft，不真实发送。

## 阶段 2：独立站和资料系统

目标：搭建可承接询盘的最小独立站资料体系。

交付：

- 核心 SKU 产品主数据。
- 产品图文视频资料包。
- RFQ 表单字段与导出结构。
- 产品页、类目页、FAQ、公司信任页。
- 隐私、条款、cookie、退订机制草案。

验收：

- 至少 20 个核心 SKU 可上线。
- 每个 SKU 有主图、细节图、规格和 RFQ。
- RFQ 数据能进入样例 intake。

## 阶段 3：获客和 CRM 接入

目标：让线索可识别、评分、分配和跟进。

交付：

- 渠道 UTM 规则。
- Google/LinkedIn/Meta/SEO 报告模板。
- CRM 字段映射。
- 客户状态机和触发规则。
- 开发信、WhatsApp、LinkedIn 草案模板。

验收：

- 每条线索有来源、评分、下一步动作。
- 渠道周报能给出暂停/扩量/优化建议。
- 所有对外消息仍需要人工确认。

## 阶段 4：报价、订单和履约链路

目标：把询盘变成可审计报价和订单执行计划。

交付：

- PriceBook。
- CostModel。
- LogisticsQuote 模板。
- QuoteDraft。
- PI/合同草案。
- 订单状态机。
- 单证检查清单。

验收：

- 标准品报价草案可在 30 分钟内生成。
- 报价毛利、运费、交期、合规承诺可追溯。
- 订单状态可从 PI 到售后完整流转。

## 阶段 5：受控发送和真实窗口试运行

目标：允许系统在人工确认后执行真实客户沟通。

交付：

- ControlledSendCommand。
- 人工确认 UI 或确认文件。
- 发送后回执。
- 客户回复 intake。
- 错发/撤回/补救流程。

验收：

- 目标客户身份确认。
- 文案和附件人工确认。
- 真实发送后生成 completion。
- 任何未确认动作都被阻断。

## 阶段 6：审计、复盘和自动优化

目标：形成业务飞轮。

交付：

- 每周经营仪表盘。
- SKU 转化率。
- 渠道 ROI。
- 报价命中率。
- 客户复购提醒。
- 合规和单证风险台账。

验收：

- 能回答：哪个市场、哪个渠道、哪个 SKU、哪种话术、哪种报价最有效。
- 能自动提出下周动作。
- 能把客户反馈反向更新产品页、FAQ、广告和报价策略。

## 风险台账

| 风险 | 控制 |
| --- | --- |
| 合规误判 | 专业复核门禁，AI 只输出清单和草案 |
| 报价错误 | 结构化成本、毛利红线、人工确认 |
| 错发客户 | 身份确认和受控发送 |
| 广告烧钱 | 小预算验证、有效询盘率门槛 |
| 站点无转化 | RFQ 表单、页面热力、询盘复盘 |
| 产品图片误导 | 原片留存、AI 图标注、证据图分离 |
| 外汇/退税资料缺失 | 订单证据包和单证清单 |
| 客诉扩大 | 售后证据收集、责任判定、补救门禁 |
