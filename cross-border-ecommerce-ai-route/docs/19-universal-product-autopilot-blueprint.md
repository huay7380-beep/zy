# 通用新品类自动化流程优化蓝图

状态：`autopilot_blueprint`

日期：2026-06-28

本文件优化当前跨境电商方案：现有结构化布线产品只是第一个样例，未来任意新品类都应能通过统一输入进入系统，由系统自动完成分类、标准/认证/市场分析、图片处理、产品页生成、定价、物流比较、RFQ、报价和销售路径规划。前期保持人工核实和干预，未来逐步升级到更高自动化。

## 目标状态

未来理想输入不是“我手动给你一堆分散资料”，而是一份结构化或半结构化的产品说明包：

```text
详细产品说明
+ 产品图片/视频/目录/规格书
+ 工厂信息
+ 成本/MOQ/交期
+ 包装/重量/尺寸
+ 认证/测试报告/资质
+ 目标客户或市场偏好
= 系统自动生成全链路执行包
```

系统输出：

- 产品分类和站点分类。
- 目标市场推荐和限制说明。
- 销售对象区分，例如 distributor、installer、system integrator、retailer、OEM/ODM buyer。
- 产品图编辑任务和自有品牌贴标方案。
- 独有产品页、SEO/GEO 内容、FAQ 和 RFQ 字段。
- 定价方案、阶梯价、样品价、报价门禁。
- 物流方式对比，包括快递、空运、海运 LCL/FCL、特殊品限制。
- 广告和获客建议。
- CRM 字段、跟进话术和报价草案。
- 人工确认清单和审计记录。

## 关键设计原则

| 原则 | 说明 |
| --- | --- |
| 产品无关 | 当前结构化布线只是样例；系统必须能处理电子、电器、家居、五金、包装、消费品等新品类。 |
| 证据驱动 | 目标国家推荐必须基于产品属性、认证文件、测试报告、标签要求、HS 候选和风险标记。 |
| 分级自动化 | 初期只生成草案，人工确认；后期逐步允许自动发布、自动报价、自动跟进。 |
| 不越权 | 没有证书不写认证 claims；没有成本不报价；没有授权不改图公开；没有预算不投放。 |
| 可回溯 | 每个判断都要记录来源、置信度、缺失字段和人工复核状态。 |
| 可复用 | 新品类进入后，沉淀为 category rule、RFQ fields、image rules、pricing rules、market rules。 |

## 新增权威契约

| 文件 | 用途 |
| --- | --- |
| `schemas/universal-product-intake.schema.json` | 任意新品类的统一输入契约。 |
| `schemas/product-auto-analysis.schema.json` | 系统自动分析后的统一输出契约。 |
| `templates/universal-product-intake.template.json` | 你以后提交详细产品说明时可使用的模板。 |
| `templates/product-auto-analysis.template.json` | 系统生成分类、市场、图片、产品页、定价、物流等分析结果的模板。 |
| `runtime/product-automation/**` | 后续新品类自动化运行产物目录。 |

## 完整自动化链路

### 0. 产品输入

输入来源可以是：

- 手写产品说明。
- PDF 目录。
- Excel/CSV 报价表。
- 工厂网页。
- 图片/视频/规格书。
- 证书和测试报告。
- 工厂聊天记录整理件。

系统动作：

1. 解析文字、表格和图片。
2. 抽取产品名称、用途、材料、尺寸、重量、包装、功能、风险属性。
3. 判断信息完整度。
4. 生成缺失资料清单。

关键字段：

- 产品用途。
- 材料和组成。
- 是否通电、电池、无线、液体、磁性、食品接触、儿童使用、医疗用途。
- 认证和测试报告。
- 包装尺寸、重量、箱规。
- 成本、MOQ、交期。
- 图片授权和私标授权。

### 1. 自动分类

系统需要同时做四种分类：

| 分类 | 用途 |
| --- | --- |
| 业务分类 | 决定产品属于哪个业务线和站点分类。 |
| 电商分类 | 决定 Shopify/WooCommerce/Google Merchant/B2B 平台分类。 |
| 合规风险分类 | 判断是否属于电器、电池、无线、食品接触、儿童、医疗、化学、纺织等敏感品类。 |
| 销售对象分类 | 判断更适合经销商、安装商、工程商、品牌商、零售商还是批发商。 |

输出：

- category candidates。
- recommended category。
- confidence。
- missing fields。
- route to human review when confidence is low。

### 2. 标准、认证和目标市场分析

系统不能简单地说“适合卖到某国家”。它必须先判断：

| 维度 | 问题 |
| --- | --- |
| 产品属性 | 是否通电、带无线、电池、食品接触、儿童使用、医疗用途、化学品、承压、纺织、建材。 |
| 证书资料 | 是否有 CE、RoHS、REACH、FCC、UL/ETL、FDA、LFGB、UKCA、SASO、CB、MSDS 等。 |
| 标签要求 | 是否需要产地标识、警示语、能效、电气铭牌、语言标签。 |
| 进口风险 | 是否需要目标市场进口商、授权代表、测试报告、注册、特殊申报。 |
| 物流限制 | 是否电池、磁性、液体、粉末、危险品、超大件、易碎。 |

市场推荐分为五档：

| 推荐 | 含义 |
| --- | --- |
| `priority` | 资料较完整，产品市场匹配度高，可优先做内容和询盘。 |
| `test` | 适合小预算测试，证据基本足够但商业验证不足。 |
| `conditional` | 有市场潜力，但缺少证书、标签、包装、HS 或服务商确认。 |
| `blocked` | 当前资料不足或风险过高，不建议发布/投放/报价。 |
| `unknown` | 信息不足，先补资料。 |

示例逻辑：

```text
产品 = 无源塑料/金属配件
证书 = RoHS/REACH 有
电气风险 = none
包装重量 = 已知
=> EU 可进入 conditional/test，仍需确认具体标签和进口要求。

产品 = PDU/电源类
证书 = 无 UL/ETL/CE/CB
电气风险 = high
=> US/EU blocked 或 conditional，高合规复核，不允许自动投放或报价。
```

所有国家/地区推荐必须输出：

- 推荐等级。
- 推荐理由。
- 缺失证据。
- 适合销售对象。
- 人工复核要求。

### 3. 产品图编辑和自有品牌图像系统

新品类进入后，系统自动生成图片任务：

| 任务 | 自动动作 | 人工门禁 |
| --- | --- | --- |
| 图片质量评级 | 判断分辨率、清晰度、背景、旧品牌露出、可裁切性 | 低置信度需人工检查 |
| 去背景 | 生成白底图和透明底图 | 产品边缘需抽检 |
| 旧品牌清理 | 标记旧 Logo、旧网址、旧型号 | 是否允许清理需工厂授权 |
| 自有标签 | 生成包装贴纸、铭牌、吊牌、角标方案 | 品牌和标签内容需确认 |
| 场景图 | 生成或整理应用场景图 | 不能改变产品结构和规格 |
| 输出套图 | print/web/thumb/ad/rfq 多尺寸输出 | 公开前人工审图 |

图片硬性规则：

- 不改变产品端口数量、结构、颜色、材料、尺寸比例。
- 不添加未验证认证标志。
- 不保留旧品牌。
- 不把效果图伪装成实拍图。
- 不用未授权工厂图片公开发布。

### 4. 独有产品页生成

系统根据分类和产品属性生成产品页，而不是套一份固定文案。

产品页结构：

| 区块 | 内容 |
| --- | --- |
| Hero | 产品名、核心用途、主图、RFQ CTA。 |
| Key Specs | 关键参数，按品类动态变化。 |
| Options | 颜色、尺寸、型号、包装、私标选项。 |
| Application | 适用场景和不适用边界。 |
| Certification Request | 证书请求和目标市场复核提示。 |
| Packaging & Logistics | 箱规、重量、MOQ、样品。 |
| FAQ | 采购常见问题。 |
| GEO Answer Block | 面向生成式搜索的直接回答和比较内容。 |
| RFQ Form | 动态询盘字段。 |

动态 RFQ 字段示例：

- 服装：面料、克重、尺码、颜色、吊牌、洗标、目标市场。
- 电器：电压、插头、功率、认证、目标国家、包装。
- 食品接触用品：材质、检测报告、目标法规、包装方式。
- 五金：材质、表面处理、尺寸、公差、图纸。
- 结构化布线：等级、屏蔽、端口、颜色、证书。

### 5. 定价系统

系统应先判断能不能报价，而不是直接生成价格。

输入：

- 工厂成本。
- MOQ。
- 样品费。
- 包装成本。
- 私标成本。
- 目标毛利。
- 汇率。
- 平台费用。
- 支付手续费。
- 物流成本。
- 关税/DDP 估算。
- 同类市场价格参考。

输出：

- 样品报价。
- 标准 SKU 报价。
- 阶梯报价。
- OEM/私标报价。
- BOM/项目报价。
- 价格缺口清单。

报价门禁：

- 无成本：不能真实报价。
- 无箱规/重量：不能给含运费报价。
- 无证书：不能写认证 claims。
- 电器/电池/无线/食品/儿童/医疗：必须合规复核。
- 毛利低于底线：阻塞或人工确认。

### 6. 物流方式选择和对比

系统根据产品属性、包装数据、目标市场和订单量生成物流建议。

比较维度：

| 维度 | 说明 |
| --- | --- |
| 运输方式 | express、air freight、sea LCL、sea FCL、rail if available。 |
| 计费 | 实重、体积重、CBM、整柜或散货。 |
| 时效 | 样品、急单、大货不同策略。 |
| 成本 | 运费、保险、目的港费用、清关服务。 |
| 条款 | EXW、FOB、CIF、DAP、DDP 等。 |
| 限制 | 电池、磁性、液体、粉末、危险品、超长超重、易碎。 |
| 风险 | 丢损、延误、清关文件、认证文件、目的国进口商要求。 |

输出：

- 样品物流建议。
- 小批量物流建议。
- 大货物流建议。
- 物流缺失字段。
- 不可运输或需特殊渠道标记。

### 7. 销售对象与渠道推荐

系统根据产品和市场选择不同对象。

| 产品特征 | 优先对象 | 渠道 |
| --- | --- | --- |
| 标准耗材、低客单、可小批量 | distributor、retailer、online reseller | B2B 平台、Google Search、产品页 RFQ |
| 工程项目型 | contractor、installer、system integrator | SEO/GEO 方案页、LinkedIn、邮件线索 |
| 高定制/私标 | brand owner、OEM buyer、importer | OEM 页面、LinkedIn、展会名单 |
| 高认证门槛 | 专业进口商、合规能力强客户 | 精准开发，不做广泛自动投放 |
| 重货/大货 | 批发商、项目商 | FOB/CIF 报价、海运方案 |

### 8. 自动化成熟度

| 阶段 | 能力 | 真实动作 |
| --- | --- | --- |
| L0 Manual | 人工整理产品资料，系统只存档。 | 无自动动作。 |
| L1 Draft Automation | 系统生成分类、缺口、页面、报价、物流草案。 | 不外发。 |
| L2 Assisted Execution | 系统生成可执行包，人工确认后执行局部动作。 | 人工确认后发布/发送。 |
| L3 Controlled Automation | 系统在规则范围内自动发布草案页、创建 CRM 任务、生成报价包。 | 真实动作仍需门禁。 |
| L4 Bounded Autopilot | 对低风险产品和已批准市场自动发布、自动跟进、自动报价草案。 | 有预算/价格/客户边界。 |
| L5 Full Autopilot | 系统自动完成新增产品全链路并持续优化。 | 仅适用于规则、合规、预算和审计都成熟后。 |

当前建议定位：`L1 -> L2`。先做自动草案和人工确认包，再逐步扩大自动执行范围。

## 新品类自动执行流程

```text
UniversalProductIntake
-> NormalizeAndExtract
-> ProductClassification
-> ComplianceAndMarketRouting
-> ImageRebuildPlan
-> ProductPagePlan
-> PricingPlan
-> LogisticsPlan
-> SalesRoutePlan
-> HumanReviewPack
-> LocalExecutionPack
-> ControlledPublishOrSend
-> RuntimeAudit
```

## 运行目录规划

后续新品类自动化产物统一写入：

```text
cross-border-ecommerce-ai-route/runtime/product-automation/intakes/**
cross-border-ecommerce-ai-route/runtime/product-automation/analyses/**
cross-border-ecommerce-ai-route/runtime/product-automation/images/**
cross-border-ecommerce-ai-route/runtime/product-automation/pages/**
cross-border-ecommerce-ai-route/runtime/product-automation/pricing/**
cross-border-ecommerce-ai-route/runtime/product-automation/logistics/**
cross-border-ecommerce-ai-route/runtime/product-automation/review-packs/**
```

## 实际执行细节清单

### 你提供产品说明时最好包含

| 信息 | 必要性 |
| --- | --- |
| 产品名称和用途 | 必填 |
| 产品详细说明 | 必填 |
| 材料、尺寸、重量、颜色 | 必填 |
| 是否通电、电池、无线、液体、食品接触、儿童或医疗用途 | 必填 |
| 目标客户或目标市场偏好 | 建议 |
| 成本、MOQ、样品费、交期 | 报价必填 |
| 包装尺寸、箱规、毛重 | 物流必填 |
| 认证、测试报告、资质文件 | 市场推荐必填 |
| 图片、视频、目录、规格书 | 内容和图片处理必填 |
| 工厂是否允许私标和图片修改 | 品牌重构必填 |

### 系统自动补问

如果缺字段，系统必须先补问，而不是直接执行：

- 这个产品是否带电池、无线、电源或插头？
- 是否接触食品、皮肤、儿童或医疗场景？
- 目标市场是否有优先级？
- 是否有认证和测试报告？
- 是否允许使用或修改工厂图片？
- 是否提供箱规、毛重和 MOQ？
- 是否允许使用自有品牌和公开 SKU？

## 与现有结构化布线样例的关系

当前结构化布线产品将作为第一套 category rule：

- 已有 RFQ 字段。
- 已有报价草案结构。
- 已有站点 IA。
- 已有 SEO/GEO/广告草案。
- 已有产品图重构方案。

未来新增品类时，系统不复制结构化布线字段，而是通过 `UniversalProductIntake` 生成新的：

- category rule。
- RFQ dynamic fields。
- image rules。
- compliance market rules。
- pricing rules。
- logistics rules。
- product page sections。

## 下一步实现建议

| 顺序 | 动作 | 输出 |
| --- | --- | --- |
| 1 | 用一个非结构化布线新品类做试点 | `universal_product_intake.sample.json` |
| 2 | 生成自动分析样例 | `product_auto_analysis.sample.json` |
| 3 | 新增演示脚本，把 intake 转成 analysis | `scripts/run-product-autopilot-demo.mjs` |
| 4 | 生成 HumanReviewPack | `runtime/product-automation/review-packs/**` |
| 5 | 扩展到产品图、产品页、定价和物流草案 | `runtime/product-automation/**` |
| 6 | 再接入主系统事件和星云状态 | 实体工作节点运行态状态包 |
