# 执行责任划分与待确认清单

状态：`pending_user_confirmation`

日期：2026-06-27

本清单用于把当前跨境电商方案拆成三类：你需要办理/登记/提供/最终确认的事项、我现在可以在本地项目中继续实现的事项、以及必须经过你确认后我再执行的事项。除非你明确确认，项目内所有动作保持 `draft_only`，不会真实外发、报价、投广告、报关、收款或提交政府/平台资料。

## 责任分类

| 分类 | 含义 | 是否触发真实外部动作 |
| --- | --- | --- |
| A. 你办理/登记/提供/最终确认 | 涉及企业主体、银行、税务、海关、外汇、商标、域名、账号、预算、合同、真实客户承诺或法律责任 | 是，由你或你的服务商执行 |
| B. 我现在可以实现 | 不需要外部账号、不触发真实发送、不产生法律/财务提交的本地文档、模板、schema、脚本、目录和草案 | 否 |
| C. 经你确认后我执行 | 我可以代为生成、整理、搭建或准备，但需要你先确认范围、品牌、市场、预算、资料输入或发布边界 | 默认只生成本地/草案；真实提交仍需你最终确认 |

## A. 需要你办理、登记、提供或最终确认

### A1. 企业主体、税务、海关、外汇和银行

| 编号 | 事项 | 你需要做什么 | 我可辅助什么 | 证据/产出 |
| --- | --- | --- | --- | --- |
| A1-01 | 营业执照与经营范围 | 确认主体是否覆盖贸易、进出口、互联网销售、供应链或技术服务 | 生成经营范围核对表与缺口清单 | `company_export_readiness.v1` |
| A1-02 | 对公银行与外币收款 | 确认开户行、收款币种、SWIFT、结汇路径、手续费 | 生成收款路径比较表和资料清单 | 银行账户资料、收款政策 |
| A1-03 | 税务身份 | 与会计确认一般纳税人/小规模、出口退免税路径 | 生成税务资料清单和贸易模式证据清单 | `tax_fx_readiness.v1` |
| A1-04 | 报关单位备案 | 在海关政务服务平台或中国国际贸易单一窗口办理/确认 | 准备待填字段清单和操作说明 | 报关单位备案记录 |
| A1-05 | 单一窗口/电子口岸 | 注册账号，配置法人、操作员、UKey/IC 卡权限 | 生成账号权限矩阵和操作员清单 | 单一窗口账号、权限截图 |
| A1-06 | 贸易外汇收支企业名录 | 首笔货物贸易外汇收支前向境内银行办理或确认适用情况 | 生成银行办理资料清单 | 名录登记/银行确认记录 |
| A1-07 | 出口模式确认 | 确认首期以 `0110`、`9710`，还是后续再评估 `9810` | 生成出口模式决策表 | `customs_mode_decision.v1` |
| A1-08 | 报关行/货代/会计服务商 | 选择并授权真实服务商 | 生成服务商询价问题清单 | 服务协议或联系人记录 |

### A2. 品牌、商标、域名、网站备案和平台账号

| 编号 | 事项 | 你需要做什么 | 我可辅助什么 | 证据/产出 |
| --- | --- | --- | --- | --- |
| A2-01 | 新品牌名称 | 确认最终品牌，或确认让我先生成候选 | 生成品牌候选矩阵、命名方向、风险提示 | `selected_brand.v1` |
| A2-02 | 商标检索与注册 | 由你或代理在中国/目标市场提交申请 | 准备类别建议、商品服务描述草案 | 商标检索/申请/受理记录 |
| A2-03 | 域名购买 | 购买域名并确认注册主体 | 生成域名候选、DNS 和邮箱规划 | 域名账号、DNS 记录 |
| A2-04 | ICP 备案 | 若使用中国内地服务器，由你通过接入商办理 | 准备备案材料清单和网站信息草案 | ICP 备案号 |
| A2-05 | 海外站点平台账号 | 决定 Shopify、WooCommerce、独立部署或先本地原型 | 生成平台选择矩阵和部署清单 | 平台账号/部署确认 |
| A2-06 | Google/LinkedIn/B2B 平台账号 | 由你开通、付款、授权 | 准备广告账户字段、权限和追踪清单 | 平台账号、权限记录 |
| A2-07 | 隐私政策/条款 | 对网站隐私、Cookie、询盘授权、退订和条款做最终确认 | 生成政策草案和版本记录 | 政策确认记录 |

### A3. 工厂、产品、私标授权和真实价格

| 编号 | 事项 | 你需要做什么 | 我可辅助什么 | 证据/产出 |
| --- | --- | --- | --- | --- |
| A3-01 | 工厂合作确认 | 确认源头工厂、联系人、付款方式、样品规则 | 生成工厂资料表和沟通问题清单 | `supplier_profile.v1` |
| A3-02 | OEM/ODM/私标授权 | 向工厂确认是否允许换品牌、改包装、改型号、去旧 Logo | 生成授权确认函草案 | 授权邮件/协议/确认函 |
| A3-03 | 工厂原始资料 | 提供报价表、MOQ、交期、包装、证书、原图、视频、测试报告 | 建资料索引和缺口报告 | `source_intake_record.v1` |
| A3-04 | 真实成本和价格 | 提供成本、阶梯价、样品价、包装成本、最低毛利要求 | 建价格本和毛利测算表 | `price_book.v1` |
| A3-05 | 产品证书和测试报告 | 向工厂索要 RoHS、REACH、测试报告，PDU 需额外安规资料 | 建证书覆盖矩阵和禁用 claims | `certificate_coverage_matrix.v1` |
| A3-06 | HS code 最终归类 | 由报关行/专业人员根据实物、材料和用途确认 | 准备归类资料包和候选说明 | HS code 归类意见 |
| A3-07 | 首批样品 | 决定是否采购样品、是否重拍图、是否做包装样 | 生成样品检查清单和拍摄脚本 | 样品实物/图片/视频 |

### A4. 市场、预算和商业边界

| 编号 | 事项 | 你需要做什么 | 我可辅助什么 | 证据/产出 |
| --- | --- | --- | --- | --- |
| A4-01 | 首期目标市场 | 在 EU、US、Middle East、Africa、Southeast Asia 等中选 2-3 个 | 生成市场优先级矩阵 | `market_priority_matrix.v1` |
| A4-02 | 首期产品范围 | 确认先上哪些系列；建议 PDU 先进入高合规复核 | 生成 SKU 上新优先级 | `first_phase_sku_scope.v1` |
| A4-03 | 报价策略 | 确认毛利底线、样品收费、运费承担、报价有效期、付款条款 | 固化报价规则和门禁 | `margin_policy.v1` |
| A4-04 | 广告预算 | 确认月预算、渠道优先级、测试周期和暂停条件 | 生成 Google/LinkedIn/B2B 广告草案 | `campaign_budget_approval.v1` |
| A4-05 | 客户承诺边界 | 确认证书、交期、质保、私标、独家代理、账期等能否承诺 | 生成受控发送门禁 | `outbound_claim_policy.v1` |
| A4-06 | 真实客户跟进权限 | 确认是否允许我只生成草案，还是未来接入受控发送 | 建受控发送审批流 | `controlled_send_policy.v1` |

### A5. 必须由你最终确认或操作的真实外部执行

- 发布网站到真实域名。
- 购买域名、服务器、Shopify/WooCommerce/插件。
- 提交 ICP、商标、海关、税务、外汇、银行资料。
- 开通支付、收款、广告和 B2B 平台账号。
- 发送真实客户邮件、WhatsApp、LinkedIn 私信。
- 投放真实广告预算。
- 发送报价单、PI、合同、付款说明。
- 订舱、发货、报关、退税、收汇申报。
- 签署工厂协议、客户合同、代理协议。
- 承诺认证、质保、赔偿、独家代理、账期。

## B. 我现在可以直接实现

以下事项都只在 `cross-border-ecommerce-ai-route/**` 内形成本地草案、模板、schema、脚本或运行目录，不触发真实外部动作。

| 编号 | 模块 | 我现在可以做 | 当前状态/输出 |
| --- | --- | --- | --- |
| B-01 | 项目索引与调度入口 | 维护 README、manifest、节点目录和星云投影指针 | `README.md`、`nodes/process-manifest.json`、`os-particle-projection.json` |
| B-02 | 产品资料结构化 | 基于两个 PDF 继续抽取产品族、字段、SKU 草案、缺口项 | 已有 `products/structured-cabling-catalogue-seed.json` |
| B-03 | 产品主数据模板 | 固化结构化布线产品字段、状态、证书和品牌映射 | 已有 `templates/structured-cabling-product-master.template.json` |
| B-04 | 标准上新 SOP | 新产品加入后的入库、清洗、上架、报价、复盘流程 | 已有 `docs/11-standardized-product-operations.md` |
| B-05 | 品牌替换流程 | 旧品牌清理、新品牌 SKU、私标授权和证书门禁 | 已有 `docs/12-brand-replacement-private-label-playbook.md` |
| B-06 | RFQ 字段 | 设计通用字段、产品族动态字段、缺口问题、线索评级 | 已有 `schemas/rfq-intake.schema.json`、`templates/rfq-field-map.structured-cabling.template.json` |
| B-07 | 报价草案 | 设计标准品/BOM/私标/样品报价结构与风险门禁 | 已有 `schemas/quote-draft.schema.json`、`templates/quote-draft.structured-cabling.template.json` |
| B-08 | 独立站信息架构 | 设计导航、分类页、产品页、RFQ、资料下载和 OEM 页面 | 已有 `schemas/site-ia.schema.json`、`templates/site-information-architecture.template.json` |
| B-09 | 海外 SEO/GEO/广告草案 | 建 SEO 关键词、生成式答案内容资产、区域本地化和广告结构 | 已有 `schemas/growth-plan.schema.json`、`templates/overseas-seo-geo-ads-plan.template.json`、`docs/16-overseas-seo-geo-ads-plan.md` |
| B-10 | 客户话术库 | 生成首响、补问、报价说明、样品跟进、证书请求、复购维护草案 | 已有 `templates/customer-message-playbook.structured-cabling.md` |
| B-11 | 本地运行目录 | 建 RFQ、报价、站点、增长、客户、验证、产品导入输出目录 | 已有 `runtime/rfq`、`runtime/quotes`、`runtime/site`、`runtime/growth`、`runtime/customers`、`runtime/products`、`runtime/validations` |
| B-12 | 本地校验脚本 | 检查 JSON、manifest 索引、运行目录、旧路径污染和关键模板 | 已有 `scripts/validate-cross-border-project.mjs` |
| B-13 | 示例询盘与报价演示 | 用假数据跑出 RFQ Intake、QuoteDraft、跟进草案 | 可继续生成，不需要真实客户 |
| B-14 | 世界系统子云状态资料 | 把本项目状态整理成实体工作节点下可读取的本地状态包 | 可继续更新本项目投影文件 |

## C. 需要你确认后我再执行

### C1. 产品入库深化

| 编号 | 需要你确认 | 我确认后执行 | 输出 |
| --- | --- | --- | --- |
| C1-01 | 是否对两个 PDF 做全量 OCR/人工复核表 | 把可识别 SKU 转成 CSV/JSON 初稿，并标注低置信度项 | `runtime/products/import-drafts/product_master_batch_draft.*` |
| C1-02 | 首期上架产品系列 | 只处理你确认的系列，例如 Keystone、Patch Panel、Face Plate、Surface Mount Box、Patch Cord | `first_phase_product_master.json` |
| C1-03 | PDU 是否纳入首期 | 若暂缓，PDU 标为 `blocked_compliance_review`；若纳入，增加高合规字段 | `product_scope_gate.v1` |
| C1-04 | 是否沿用工厂型号 | 生成公开 SKU 与工厂型号映射，避免公开暴露供应链 | `public_sku_map.v1` |

### C2. 品牌、目录和内容

| 编号 | 需要你确认 | 我确认后执行 | 输出 |
| --- | --- | --- | --- |
| C2-01 | 是否需要品牌候选 | 生成 10-20 个英文品牌候选、定位、域名方向 | `brand_candidate_matrix.v1` |
| C2-02 | 最终品牌名 | 生成品牌资料包、产品命名规则、目录风格草案 | `brand_asset_pack.v1` |
| C2-03 | 是否重制产品目录 | 以新品牌结构重排公开目录草案，不替换原 PDF | `public_catalogue_draft.v1` |
| C2-04 | 是否生成产品页文案 | 生成英文产品页、FAQ、SEO title/description 和 GEO 问答块 | `site_content_draft.v1` |
| C2-05 | 是否做旧品牌检测 | 扫描文件名、文本、公开文案中的旧品牌词 | `old_brand_cleanup_report.v1` |

### C3. 独立站、获客和推广

| 编号 | 需要你确认 | 我确认后执行 | 输出 |
| --- | --- | --- | --- |
| C3-01 | 站点平台 | 本地原型、Shopify、WooCommerce、自研或暂不建站 | `site_map.v1` / 本地 prototype |
| C3-02 | 首期目标市场 | 生成 SEO/GEO 关键词、区域页面、Google Ads、LinkedIn 和 B2B 平台计划 | `campaign_plan.v1` |
| C3-03 | 是否创建本地原型 | 生成可预览独立站原型，不发布到真实域名 | 本地站点原型 |
| C3-04 | 是否生成产品导入表 | 生成 Shopify/WooCommerce/通用 CSV 草案 | `runtime/products/import-drafts/product_import_draft.csv` |
| C3-05 | 是否生成广告素材草案 | 生成标题、描述、Lead Gen 表单字段和落地页建议 | `ad_creative_draft.v1` |

### C4. 报价、CRM 和客户自动化

| 编号 | 需要你确认 | 我确认后执行 | 输出 |
| --- | --- | --- | --- |
| C4-01 | 是否提供成本/MOQ/交期 | 建价格本、毛利底线、阶梯报价模板 | `runtime/quotes/price_book_draft.json` |
| C4-02 | 报价格式 | 生成标准报价、BOM 报价、样品报价、私标报价模板 | `quote_templates` |
| C4-03 | CRM 字段 | 建客户、询盘、报价、订单、跟进状态字段 | `crm_schema.v1` |
| C4-04 | 首响规则 | 生成询盘解析、补问、首响草案规则 | `inquiry_reception_rules.v1` |
| C4-05 | 客户维护周期 | 建复购、样品跟进、报价未回复、证书补发触发计划 | `retention_trigger_plan.v1` |

### C5. 本地系统实现与世界系统同步

| 编号 | 需要你确认 | 我确认后执行 | 输出 |
| --- | --- | --- | --- |
| C5-01 | 是否进入 Phase 1 本地实现包 | 生成样例 RFQ、报价草案、客户跟进草案和校验报告 | `runtime/**` 样例运行包 |
| C5-02 | 是否生成演示闭环脚本 | 用样例询盘跑出 RFQ Intake -> QuoteDraft -> Follow-up Plan | `scripts/run-cross-border-route-demo.mjs` |
| C5-03 | 是否接入主系统运行节点 | 把理论节点转成主系统可读取的状态和事件草案 | process-tree extension 草案 |
| C5-04 | 是否同步实体工作节点状态 | 把产品入库、品牌、合规、报价、获客状态同步到实体工作节点子云 | 星云状态更新包 |
| C5-05 | 是否允许未来受控发送 | 先实现人工确认包，再决定是否接真实邮箱/WhatsApp/LinkedIn | `controlled_send_review_pack.v1` |

## 建议你优先确认的 12 个问题

请按编号回复即可，未知可以写 `待定`。

| 编号 | 待确认问题 | 建议默认 |
| --- | --- | --- |
| Q1 | 首期目标市场选哪 2-3 个？ | Middle East + EU + Africa |
| Q2 | 首期产品范围包含哪些系列？ | Keystone、Patch Panel、Face Plate、Surface Mount Box、Patch Cord/RJ45 Plug |
| Q3 | PDU 是否暂缓？ | 暂缓，进入高合规复核 |
| Q4 | 是否要我生成新品牌候选？ | 是，先给 10-20 个候选 |
| Q5 | 是否对两个 PDF 做全量 OCR/产品入库？ | 是，先生成低风险草案 |
| Q6 | 是否需要本地独立站原型？ | 是，先本地原型，不发布 |
| Q7 | 站点平台倾向？ | 先本地原型，后续再定 Shopify/WooCommerce |
| Q8 | 是否生成产品导入 CSV？ | 是，先生成通用 CSV |
| Q9 | 是否已有成本/MOQ/交期？ | 你提供后我建价格本 |
| Q10 | 是否生成报价样例？ | 是，用假数据生成，不外发 |
| Q11 | 是否生成广告/SEO/GEO 第一批内容？ | 是，草案不投放 |
| Q12 | 是否进入 Phase 1 Local Execution Pack？ | 是 |

## Phase 1 Local Execution Pack

如果你确认进入下一步，我建议先做一个不触发真实外部动作的本地执行包。

| 子任务 | 责任 | 输出 |
| --- | --- | --- |
| 两个 PDF OCR/人工复核，产出首批 SKU 草案 | 我执行，你复核 | `runtime/products/import-drafts/**` |
| 新品牌候选和公开 SKU 规则 | 我执行，你确认 | `runtime/site/brand_candidate_matrix.*` |
| 独立站信息架构和 5 个产品页样例 | 我执行，你确认 | `runtime/site/**` |
| RFQ 表单字段、询盘解析和缺口问题 | 我执行 | `runtime/rfq/**` |
| 报价模板和缺口问题清单 | 我执行，价格由你提供 | `runtime/quotes/**` |
| 工厂资料索要清单 | 我执行，你向工厂索要 | `runtime/products/source_request_checklist.*` |
| 客户首响、补问、跟进话术 | 我执行，你确认边界 | `runtime/customers/**` |
| SEO/GEO/广告草案 | 我执行，你确认市场和预算 | `runtime/growth/**` |
| 本地校验报告 | 我执行 | `runtime/validations/**` |

## 你的确认回执模板

```text
我确认进入下一步：
Q1 首期目标市场：
Q2 首期产品范围：
Q3 PDU：暂缓 / 纳入但高合规复核
Q4 新品牌：需要候选 / 我已确定名称：
Q5 PDF 入库：全量 OCR / 先抽核心 SKU / 暂缓
Q6 独立站：需要本地原型 / 暂缓
Q7 站点平台：本地原型 / Shopify / WooCommerce / 自研 / 待定
Q8 产品导入 CSV：需要 / 暂缓
Q9 成本、MOQ、交期：我会提供 / 暂无
Q10 报价样例：需要 / 暂缓
Q11 SEO/GEO/广告草案：需要 / 暂缓
Q12 Phase 1 Local Execution Pack：开始 / 暂缓
补充要求：
```

## 当前安全边界

- 我可以继续完善本地文件、schema、模板、样例数据、验证脚本和运行目录。
- 我不会自动真实发送客户消息。
- 我不会自动真实报价、发 PI、发合同或发付款说明。
- 我不会自动购买域名、提交备案、注册商标、投放广告、订舱、报关或处理收款。
- 任何真实对外动作都必须有你的明确确认。
