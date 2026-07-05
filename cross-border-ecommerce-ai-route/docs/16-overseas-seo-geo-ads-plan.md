# 海外 SEO、GEO 与广告草案

状态：`draft_only`

本文件补充海外 SEO、GEO 和广告计划。这里的 GEO 同时包含两层含义：

1. `Generative Engine Optimization`：面向 Google AI features、ChatGPT/Perplexity 等生成式答案环境的可引用、可理解、可信内容建设。
2. `Geographic Market Optimization`：按目标国家/区域做语言、术语、合规关注点、配送和询盘字段本地化。

真实广告投放、预算消耗和对外发布仍需人工确认。

## 权威模板

- `templates/overseas-seo-geo-ads-plan.template.json`
- `schemas/growth-plan.schema.json`

## SEO 主线

### 页面类型

| 页面 | 目标 |
| --- | --- |
| 产品分类页 | 承接 supplier/manufacturer/RFQ 搜索词 |
| 产品详情页 | 承接具体型号、规格和长尾询盘 |
| 解决方案页 | 承接项目型需求和 BOM 场景 |
| OEM/ODM 页 | 承接私标、经销商和工厂能力搜索 |
| FAQ/指南页 | 回答技术选择问题，支持 SEO 和 GEO |
| 资料下载页 | 目录、规格书、证书请求入口 |

### 关键词簇

| 簇 | 示例词 | 目标页 |
| --- | --- | --- |
| Keystone Jack | cat6 keystone jack manufacturer, cat6a keystone jack supplier, toolless keystone jack factory | `/products/keystone-jacks` |
| Patch Panel | 24 port patch panel supplier, cat6 patch panel manufacturer, blank patch panel OEM | `/products/patch-panels` |
| Structured Cabling OEM | structured cabling OEM factory, network cabling private label, low voltage cabling products supplier | `/factory-oem` |
| Face Plate | 86 type face plate supplier, network face plate manufacturer, RJ45 wall plate OEM | `/products/face-plates` |
| Patch Cord | cat6 patch cord supplier, LSZH patch cord manufacturer, RJ45 plug supplier | `/products/patch-cords-rj45-plugs` |

### 技术要求

- 可索引 HTML 内容。
- 每页唯一 title 和 meta description。
- 清晰 H1/H2 结构。
- Product/BreadcrumbList/FAQPage 结构化数据按页面适配。
- 图片 alt、描述性文件名和压缩。
- 移动端速度和可读性。
- canonical URL。
- 有多语言/多区域页面后使用 hreflang。
- RFQ CTA 不遮挡正文内容。

## GEO 主线：生成式答案可见性

生成式答案通常更偏好清晰、可信、结构化、可引用的内容。我们不把 GEO 当成玄学流量，而是把它拆成可生产的内容资产。

| 资产 | 作用 | 示例 |
| --- | --- | --- |
| Entity definition pages | 让品牌、产品线、OEM 能力被清晰理解 | `What is a CAT6 keystone jack?` |
| Comparison guides | 回答采购前比较问题 | CAT6 vs CAT6A, UTP vs STP, loaded vs blank patch panel |
| FAQ blocks | 生成式答案和销售话术复用 | MOQ、样品、证书、交期、私标 |
| Datasheets | 提供规格来源 | 每个产品族下载页 |
| Process pages | 解释 RFQ、BOM、私标、质检和交付流程 | OEM/ODM workflow |
| Regional pages | 服务区域市场语义 | EU RoHS/REACH request, US origin marking, Middle East WhatsApp-first RFQ |

GEO 内容原则：

- 每个回答先给直接结论，再给条件。
- 避免无证书的绝对认证承诺。
- 明确 `draft quote`, `certificate request`, `target market review` 等边界。
- 使用采购者术语：installer, distributor, system integrator, low voltage contractor, data center contractor。
- 把产品、场景、证书、MOQ、交期、RFQ 入口相互链接。

## GEO 主线：区域市场本地化

| 市场 | 内容本地化 | RFQ 本地化 | 风险门禁 |
| --- | --- | --- | --- |
| EU | RoHS/REACH、LSZH、CPR caution、CE claims 谨慎 | 目标国家、是否安装进建筑、证书需求 | 线缆/安装场景和 PDU 高复核 |
| US | origin marking、UL/ETL caution、installer/distributor 术语 | 目的州/港口、是否需要 UL/ETL | PDU、电源类不能轻易承诺 |
| Middle East | 项目 BOM、WhatsApp 沟通、经销商备货 | WhatsApp、项目数量、交货港口 | 付款与代理协议门禁 |
| Africa | 混装、价格阶梯、替换库存、项目供应 | 混装 SKU、目标价、港口 | 收款与物流风险 |

## 广告草案

### Google Search Ads

| Campaign | Ad groups | Conversion |
| --- | --- | --- |
| `structured_cabling_rfq` | keystone_jack, patch_panel, structured_cabling_oem | `rfq_submit` |
| `patch_cord_rj45_supplier` | patch_cord, rj45_plug, lszh_patch_cord | `rfq_submit` |
| `private_label_network_cabling` | oem, private_label, distributor_stock | `lead_form_submit` |

投放前门禁：

- 目标市场确认。
- 落地页已发布。
- RFQ 可用。
- 预算确认。
- 证书和价格 claims 审核。

### LinkedIn Lead Gen

目标角色：

- procurement manager
- project manager
- system integrator
- low voltage contractor
- data center contractor
- distributor owner / purchasing

表单字段：

- company
- country
- email
- job title
- product interest
- annual purchase or project quantity
- WhatsApp
- certification request

### B2B 平台广告

用于验证国家、关键词和产品族，不作为唯一客户资产。平台询盘应导出或同步到本项目 RFQ intake 结构。

## 内容日历

| 周期 | 动作 |
| --- | --- |
| 第 1 周 | 建产品分类页、RFQ、OEM/ODM 页 |
| 第 2 周 | 建 5 个核心产品页和 3 个 FAQ |
| 第 3 周 | 建比较指南和区域页草案 |
| 第 4 周 | 建 Google/LinkedIn 广告草案，不投放 |
| 每周 | 更新真实询盘问题到 FAQ 和 GEO 问答 |
| 每月 | 复盘国家、产品族、关键词、询盘和报价转化 |

## 指标

| 类型 | 指标 |
| --- | --- |
| SEO | impressions, clicks, average position, indexed pages |
| GEO | AI/referral mentions where observable, FAQ usage, branded/entity query growth |
| Ads | spend, CPC, RFQ conversion, cost per qualified RFQ |
| Sales | lead grade, quote rate, quote win/loss, sample conversion |
| Market | country, product family, buyer type, certificate request frequency |

## 官方参考

- Google Search Central SEO Starter Guide。
- Google Search Central structured data documentation。
- Google Search Central guidance for AI features and Search。
- Google Ads location and language targeting help。
- LinkedIn Lead Gen Forms documentation。

这些链接已归档到 `docs/sources.md`，执行前应重新核对平台政策。
