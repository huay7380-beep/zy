# 独立站与数据底座

独立站不是展示页，而是跨境业务中枢：承接搜索和广告流量、验证产品、收集询盘、沉淀客户、触发报价、记录证据，并把所有动作回写主系统。

## 平台选择

| 方案 | 优点 | 风险 | 建议 |
| --- | --- | --- | --- |
| Shopify/Shopify B2B | 上线快、多币种、多市场、应用生态成熟、B2B 公司/价格/草稿订单能力 | 深度定制和国内访问链路需评估，费用持续 | 首期优先 |
| WooCommerce | 自主性高、内容 SEO 友好、成本可控 | 维护、安全、性能、插件冲突需要团队能力 | 有技术团队时可选 |
| Headless/自研 | 完全可控，适配主系统 | 成本高，周期长 | 第二阶段 |
| B2B 平台店铺 | 有站内流量和信任背书 | 数据归平台，差异化有限 | 辅助获客，不替代独立站 |

首期建议：`Shopify/WooCommerce + CRM + PIM + 报价引擎草案`。等交易逻辑稳定，再考虑自研前后端。

## 站点结构

```text
Home
-> Product Categories
-> Product Detail / SKU Detail
-> Customization / OEM / ODM
-> RFQ / Get Quote
-> Samples
-> Certifications
-> Factory / Source Capability
-> Case Studies
-> Shipping & Payment
-> FAQ
-> Contact / WhatsApp / Email / LinkedIn
-> Privacy Policy / Terms / Return Policy / Cookie
```

## B2B 产品页字段

| 字段 | 目的 |
| --- | --- |
| SKU / Model | 让客户和内部系统唯一识别 |
| Product title | 搜索和广告匹配 |
| Short value proposition | 3 秒说明为什么买 |
| Specifications | 材质、尺寸、容量、颜色、性能、适用场景 |
| MOQ | 限定询盘质量 |
| Price range | 可选；若竞争敏感，可用 `request quote` |
| Lead time | 样品、大货、定制交期 |
| Customization options | logo、包装、颜色、规格、材料 |
| Certifications | CE/FCC/RoHS/REACH/FDA/MSDS/UN38.3 等按品类 |
| Packaging | 单品包装、外箱尺寸、毛重、装柜量 |
| Media | 主图、细节图、场景图、视频、下载资料 |
| RFQ CTA | 表单收集关键报价参数 |

## 数据底座

| 数据表/对象 | 关键字段 |
| --- | --- |
| `ProductMaster` | SKU、品名、规格、成本、重量、体积、MOQ、认证、图片、目标市场 |
| `PriceBook` | 币种、数量阶梯、Incoterms、包装、有效期、渠道价、客户专属价 |
| `Lead` | 来源、国家、公司、职位、需求、预算、采购周期、评分、负责人员 |
| `Inquiry` | 询盘原文、识别语言、产品、数量、目的港、交期、问题缺口 |
| `Quote` | 成本、运费、税费假设、毛利、付款条款、有效期、附件 |
| `Order` | PI/合同、收款、生产、QC、发货、报关、到货、售后 |
| `CustomerAccount` | 公司主体、联系人、采购偏好、历史报价、信用、跟进节奏 |
| `ComplianceProfile` | HS code、认证、标签、目标国责任人、禁限售判断 |

## 独立站事件采集

| 事件 | 触发 |
| --- | --- |
| `site_visit` | 页面访问、来源、UTM、国家、设备 |
| `product_view` | 产品页浏览 |
| `asset_download` | 目录、认证、规格书下载 |
| `rfq_submit` | RFQ 表单提交 |
| `chat_started` | 在线聊天/WhatsApp 点击 |
| `sample_request` | 样品申请 |
| `quote_requested` | 客户请求报价 |
| `newsletter_opt_in` | 订阅授权 |

这些事件必须可映射为主系统的 `IntakeObservation -> RawEvent -> SemanticEvent`。

## RFQ 表单字段

首期 RFQ 不要太长，确保询盘率；但报价所需字段要可后补。

必填：

- name
- email
- company
- country/region
- product/SKU
- quantity
- message

建议字段：

- destination port/city
- customization required
- target price
- expected delivery date
- WhatsApp/phone
- website/company profile
- consent checkbox

隐藏字段：

- UTM source/medium/campaign
- landing page
- product page
- first visit timestamp
- form version

## AI 接入点

| 接入点 | AI 动作 | 输出 |
| --- | --- | --- |
| 产品建档 | 从中文资料提取英文规格、卖点、FAQ | `product_master_draft.v1` |
| 页面生成 | 生成产品页英文文案和 SEO 元信息 | `site_content_draft.v1` |
| RFQ 识别 | 提取产品、数量、国家、痛点、缺口 | `inquiry_intake.v1` |
| 线索评分 | 判断有效性、紧急度、采购可能性 | `lead_score.v1` |
| 报价准备 | 调用成本、运费、阶梯价、条款 | `quote_draft.v1` |
| 跟进计划 | 生成后续触达节奏 | `trigger_plan.v1` |

## 首期页面验收

- 每个核心 SKU 有完整英文标题、规格、图片、MOQ、交期、RFQ。
- RFQ 表单提交后能进入 CRM 或本地 `runtime/user-inputs` 草案路径。
- 页面具备基础 SEO：title、description、canonical、结构化产品数据。
- Google Merchant 需要的产品数据字段可导出。
- 隐私政策、条款、cookie 和订阅退订机制可审计。
