# 外贸系统底层编排规则 v2

## 适用范围

本规则适用于 `cross-border-ecommerce-ai-route/**` 下所有外贸相关功能、流程节点、分支模块、产品页、独立站、获客、询盘、报价、履约、售后和数据源接入。

目标不是继续堆功能，而是建立一条可执行、可审计、可回退的底层原则：

```text
产品输入 -> 标准化产品主数据 -> 工具优先信源选择 -> 全球市场证据采集
-> 市场/渠道/销售模式判断 -> 产品页构建包 -> 独立站或电商平台挂载
-> 询盘入口 -> 客户应答 -> 报价/订单/履约/复购
```

任何新节点都必须先证明自己应该存在，并说明为什么不使用现成工具、MCP、官方 API、开源库或低代码平台。

## 核心结论

当前系统的问题不是节点数量不足，而是节点之间缺少统一的工具选择规则、证据门槛、输入输出契约、执行禁令和失败回退。

v2 规则将所有节点约束为：

- 先选工具，再写代码。
- 先拿证据，再做市场判断。
- 先形成产品主数据，再做产品页。
- 先生成构建包，再挂载独立站。
- 先本地草案和人工确认，再允许任何真实外部动作。
- 所有结果必须能被主系统读取，并同步到星云投影。

## 工具优先阶梯

每个新能力必须按以下顺序选择实现方式，停在第一个满足目标的层级：

| 优先级 | 选择 | 使用条件 | 禁止事项 |
| --- | --- | --- | --- |
| 1 | 已有主系统能力 | 当前仓库已有脚本、schema、运行产物或控制面能满足 | 禁止复制一套相似实现 |
| 2 | 已安装 MCP / connector / skill | 已有 MCP、插件或 skill 可稳定完成 | 禁止绕过权限和门禁 |
| 3 | 官方 API | 数据源或平台有官方 API，例如 WTO、UN Comtrade、Shopify、Meta、TikTok、WhatsApp | 禁止用爬虫替代可用官方 API |
| 4 | 开源库 | 官方 API 不足，但有成熟开源库，例如 Crawlee、Playwright、Scrapy、Pandas、pdfplumber | 禁止自写复杂采集器、解析器或图像管线 |
| 5 | 低代码/自动化平台 | 可由 n8n、Node-RED、Make、Zapier、Baserow、Airtable、CMS 插件完成 | 禁止为简单连接器自研后台 |
| 6 | 现成 SaaS/平台功能 | Shopify、WooCommerce、Medusa、WordPress、Strapi、HubSpot、Odoo 等能完成 | 禁止先自研电商/CRM/CMS |
| 7 | 最小胶水代码 | 以上方案不能满足，且已记录原因 | 只能写最小代码，必须有输入输出、日志和验证 |

## 强制决策契约

任何新功能、节点、脚本、页面、采集器、连接器或自动化动作，在实现前必须生成 `build_vs_buy_decision.v1`。

最小字段：

- `capability_id`: 能力唯一标识。
- `node_ids`: 影响的 `cbx_*` 节点。
- `business_goal`: 要解决的业务目标。
- `candidate_tools`: 候选开源软件、MCP、库、官方 API、SaaS 或已存在脚本。
- `selected_path`: 选择的实现路径。
- `rejected_paths`: 被拒绝方案和理由。
- `evidence_requirements`: 数据源、覆盖度、新鲜度、可信度要求。
- `input_contracts`: 上游输入。
- `output_contracts`: 下游输出。
- `implementation_ban`: 本次明确禁止的动作。
- `fallback_plan`: 失败时回退到什么。
- `human_gates`: 需要人工确认的门禁。
- `sync_targets`: 需要同步到主系统和星云的产物。

没有该契约的功能只能停留在讨论或草案状态，不允许进入实现。

## 证据门槛

### 全球市场调研

市场推荐不能只靠网页搜索或主观判断，至少需要四类证据：

| 证据类型 | 最低要求 | 示例信源 |
| --- | --- | --- |
| 官方贸易流 | 进口/出口趋势、贸易额或数量 | UN Comtrade、WTO、World Bank WITS、各国海关公开数据 |
| 准入与税则 | HS/HTS 候选、关税、认证、限制 | WTO、USITC HTS、UK Trade Tariff、EU Access2Markets、目标国官方机构 |
| 需求热度 | 搜索、新闻、项目、行业增长信号 | Google Trends、GDELT、Common Crawl、行业协会、招投标/项目库 |
| 竞争与渠道 | 竞品、分销商、采购商、平台价格 | B2B 平台、公开独立站、公司注册库、LinkedIn 公开资料、GLEIF |

最低通过标准：

- 覆盖至少 `North America`、`EU/UK`、`Latin America`、`Middle East`、`Africa`、`ASEAN`、`East Asia`、`Oceania` 八个区域的基础信号。
- 每个候选目标市场必须有至少 2 类独立证据。
- 涉及准入、认证、税率、合规的结论必须带来源和日期。
- 无法覆盖的区域必须输出 `source_gap_report.v1`，不得生成最终市场推荐。

### 产品页和独立站

产品页不得先于市场判断和产品主数据生成。

产品页构建前必须具备：

- `ProductMaster`: 产品名称、类别、规格、材质、型号、图片、用途、包装、MOQ、成本或价格口径。
- `MarketDecision`: 推荐市场、销售对象、销售模式、渠道优先级。
- `ComplianceGate`: HS 候选、认证要求、禁售/限制风险、待核验证据。
- `PDPBuildPack`: 页面结构、卖点、参数表、图片策略、RFQ 字段、SEO 关键词、多语言需求。

独立站挂载前必须具备：

- `site_map.v1`
- `rfq_form_contract.v1`
- `product_page_build_pack.v1`
- `tracking_plan.v1`
- `human_publish_approval`

## 节点输入输出约束

| 阶段 | 输入 | 输出 | 通过条件 |
| --- | --- | --- | --- |
| 产品输入 | 文本、PDF、图片、网页、价格、证书 | `universal_product_intake.v1` | 信息缺口被列出 |
| 产品标准化 | intake、源文件、人工补充 | `product_master.v1` | 型号/规格/材质/用途可读 |
| 合规初判 | ProductMaster、HS 候选、证书 | `product_compliance_matrix.v1` | 未确认项明确标记 |
| 市场调研 | ProductMaster、合规矩阵、信源策略 | `market_evidence_pack.v1` | 区域覆盖度达标 |
| 市场判断 | evidence pack、成本、物流约束 | `market_priority_matrix.v1` | 分数、理由、证据齐全 |
| 产品页构建 | ProductMaster、MarketDecision、PDPBuildPack | `product_page_draft.v1` | 不含未证实承诺 |
| 独立站挂载 | 页面草案、站点结构、RFQ 合约 | `site_publish_pack.v1` | 仅可本地预览，发布需人工批准 |
| 获客推广 | ICP、页面、关键词、预算 | `campaign_plan.v1` | 广告/外发默认禁用 |
| 询盘应答 | 询盘、产品知识库、客户上下文 | `reply_draft.v1` | 人工可介入，真实发送需批准 |
| 报价成交 | 成本、价格本、物流、条款 | `quote_draft.v1` | 报价发送需人工批准 |

## 实现禁令

默认禁止：

- 不生成真实外发邮件、WhatsApp、LinkedIn 私信、TikTok 私信或社媒评论。
- 不创建真实广告投放、不改预算、不消耗广告费用。
- 不发布真实产品页、独立站、商品、博客或社媒内容。
- 不发送正式报价、PI、合同、付款说明、发票。
- 不提交报关、税务、外汇、认证、法律文件。
- 不绕过登录、验证码、付费墙、平台限制、robots 或网站条款。
- 不批量下载受保护图片或复制第三方品牌资产。
- 不把未经核实的网页内容当成产品事实。
- 不为已有官方 API 或成熟工具能完成的任务自研复杂代码。

允许的默认动作：

- 本地读取公开页面和用户提供文件。
- 生成草案、结构化 JSON、Markdown 报告、CSV、人工确认包。
- 本地预览页面。
- 生成工具候选清单、信源覆盖报告、失败回退计划。

## 回退规则

| 失败类型 | 回退 |
| --- | --- |
| 官方 API 不可用 | 查官方文档、记录申请/API key 要求，使用公开网页搜索补证据 |
| 网页采集失败 | 保存失败快照，切换 Playwright/Crawlee 或要求用户提供 HTML/PDF |
| 区域信源不足 | 输出 `source_gap_report.v1`，禁止最终推荐 |
| 产品信息不足 | 输出 `missing_product_fields.v1`，回到产品输入对话补齐 |
| 价格/物流缺失 | 输出 `commercial_blocker.v1`，禁止正式报价 |
| 合规/认证不明 | 输出 `compliance_blocker.v1`，禁止进入目标市场发布 |
| 页面质量不达标 | 输出 `pdp_qa_report.v1`，回到 PDPBuildPack |
| 工具不稳定 | 降级为人工导入/CSV/离线文件，不扩大自研范围 |

## 星云同步规则

本项目仍以 `cross-border-ecommerce-ai-route/**` 为业务源头。星云只做只读投影，不成为事实源。

每次新增或修改外贸节点规则时，必须同步：

- `nodes/process-manifest.json`
- `os-particle-projection.json`
- `runtime/control-plane/status/current-status.json`
- 相关 runtime 产物索引

星云显示层必须暴露：

- 当前规则版本：`foreign_trade_orchestration_rules.v2`
- 工具优先开关：`tool_first_policy_required=true`
- 真实外部动作状态：`real_external_actions_allowed=false`
- 软件默认状态：`external_software_enabled=false`
- 最新规则文档路径
- `build_vs_buy_decision.v1` schema/template 路径

## 后续执行顺序

1. 对现有 16 个 `cbx_*` 节点补 `build_vs_buy_decision.v1` 记录。
2. 先改市场调研节点，补齐信源覆盖、证据门槛和区域缺口报告。
3. 再改产品页节点，把页面构建推迟到 `ProductMaster + MarketDecision + PDPBuildPack` 之后。
4. 再改独立站挂载节点，优先选择 Shopify/WooCommerce/Medusa/WordPress/Strapi 等现成平台。
5. 最后接入获客、聊天机器人、CRM、报价、履约，但所有真实动作继续默认禁止。

## 当前状态

本文件是底层编排规则 v2 的源文档。它已经可以作为后续节点重构、工具筛选、星云同步和主系统控制的判定依据。
