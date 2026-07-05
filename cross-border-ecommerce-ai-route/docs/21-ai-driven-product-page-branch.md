# AI 驱动产品页构建分叉

状态：`confirmation_ready`

日期：2026-06-28

本文件定义跨境电商销售系统中的产品页构建节点。它不是单纯的网页设计任务，而是从产品输入、自动分类、市场与买家判断、视觉策略、页面生成、RFQ 接入、询盘承接到后续报价链路的 AI 自动化分叉。

## 当前实现目标

| 目标 | 含义 | 验证方式 |
| --- | --- | --- |
| 1. 验证跨境电商模块自动化 | 检查跨境模块是否能从产品输入生成可追踪的分析、页面、图片任务、RFQ 和人审包 | 运行本地草案生成、QA、控制面状态和 runtime 输出 |
| 2. 验证当前产品生产流程 | 用当前结构化布线产品作为试点，验证从 PDF/图片/参数到自有品牌产品页的生产链路 | 生成页面样张、图片重构任务、文案、规格块和人工确认清单 |
| 3. 实现产品页及后续步骤 AI 自动化 | 当执行系统时，默认由 AI 逐步完成分类、分析、页面、视觉、询盘字段、后续获客和报价准备 | 输出 `product_page_build_pack.v1` 并进入 `cbx_04`、`cbx_07`、`cbx_08`、`cbx_09`、`cbx_10` |

## 所属流程位置

产品页构建分叉挂在 `cbx_05_content_assets` 下，同时向站点、获客、线索和报价节点供给结果。

```text
UniversalProductIntake
-> ProductAutoAnalysis
-> cbx_05_content_assets.product_page_ai_build
-> ProductPageBuildPack
-> cbx_04_independent_site
-> cbx_07_acquisition
-> cbx_08_lead_capture
-> cbx_09_inquiry_reception
-> cbx_10_quote_engine
```

## 默认执行原则

当系统执行产品页构建时，默认由 AI 驱动每个环节。AI 不只是生成文案，而是负责生成可检查、可回写、可人审的完整构建包。

AI 默认执行：

1. 读取产品输入和已有产品资料。
2. 判断产品品类、属性、应用场景和风险。
3. 判断目标买家类型和市场需求。
4. 选择页面策略，而不是直接套固定模板。
5. 生成产品图处理计划和视觉方向。
6. 生成产品页结构、英文文案、SEO/GEO 内容和 RFQ 字段。
7. 生成页面草案或可交给前端实现的页面组件说明。
8. 运行视觉、文案、合规、询盘链路 QA。
9. 生成人工确认包。
10. 将确认后的结果继续推给站点、获客、询盘和报价节点。

AI 默认不得执行：

- 未经确认直接公开发布页面。
- 未经确认使用 AI 补图作为真实产品图。
- 未经确认写认证、测试、客户案例、质保或独家代理 claims。
- 未经确认真实投放广告、发送客户消息或生成真实报价。

## 输入内容

### 必需输入

| 输入 | 说明 | 缺失处理 |
| --- | --- | --- |
| `product_identity` | 产品名称、型号、SKU 或临时编号 | 生成临时 ID 并要求后续确认 |
| `product_description` | 产品用途、功能、卖点、适用场景 | 缺失则进入补问 |
| `source_assets` | PDF、图片、视频、规格书、工厂页面或样品照片 | 缺失则只能生成文字策略草案 |
| `basic_specs` | 材质、尺寸、颜色、等级、接口、兼容性等 | 标记为 `to_be_confirmed` |
| `brand_policy` | 是否私标、是否可去旧品牌、是否可公开使用图片 | 缺失则阻塞公开图像使用 |
| `human_goal` | 当前目标：方向确认、样张、正式页、批量上架或询盘承接 | 缺失则默认 `direction_draft` |

### 可选但影响质量的输入

| 输入 | 影响 |
| --- | --- |
| `target_market_preference` | 影响认证提示、语言、RFQ 字段和市场卖点 |
| `target_buyer_type` | 影响页面叙事，如 distributor、installer、OEM buyer、project procurement |
| `certificates` | 决定是否能写认证和目标地区推荐 |
| `cost_moq_lead_time` | 决定是否能生成报价前置条件和采购信息 |
| `packaging_logistics` | 决定物流比较、样品策略和 RFQ 字段 |
| `reference_page` | 作为界面结构和功能参考，不复制品牌、图片和独特表达 |
| `brand_visual_system` | 影响颜色、版式、图片风格和组件规范 |

## AI 构建方式

| 阶段 | AI 动作 | 输出 |
| --- | --- | --- |
| 0. Intake Normalization | 把输入资料整理为统一产品输入 | `normalized_product_input.v1` |
| 1. Product Classification | 自动分类产品品类、风险属性、电商类目和销售对象 | `product_classification.v1` |
| 2. Feature Analysis | 提取功能点、结构点、差异点、可视化重点和缺失字段 | `product_feature_analysis.v1` |
| 3. Market And Buyer Fit | 判断适合的国家/地区、买家类型、渠道和合规阻塞项 | `market_buyer_fit.v1` |
| 4. Page Strategy Branch | 判断页面类型：技术型、分销型、OEM 型、项目采购型、解决方案型 | `product_page_strategy.v1` |
| 5. Trust Strategy | 新品牌无客户案例时，用采购验证体系替代案例背书 | `trust_building_strategy.v1` |
| 6. Visual Direction | 生成主图、白底图、细节图、场景图、多角度图、补图和贴标任务 | `product_visual_brief.v1` |
| 7. Copy And Structure | 生成页面模块、英文文案、规格表、FAQ、SEO/GEO 和 CTA | `site_content_draft.v1` |
| 8. RFQ And Sales Hooks | 生成动态 RFQ 字段、询盘补问、样品请求和报价前置字段 | `rfq_field_plan.v1` |
| 9. Page Draft Build | 生成页面原型、HTML 草案或前端组件说明 | `product_page_draft.v1` |
| 10. QA And Human Review | 检查图片、文案、合规、询盘入口、移动端和人工门禁 | `product_page_qa_report.v1`、`human_review_pack.v1` |

## 输出内容

产品页节点的标准输出为 `product_page_build_pack.v1`。

```json
{
  "contract": "product_page_build_pack.v1",
  "product_id": "{{product_id}}",
  "source_intake_id": "{{intake_id}}",
  "automation_goal": {
    "validate_cross_border_module": true,
    "validate_current_product_production_flow": true,
    "build_product_page_and_downstream_ai_chain": true
  },
  "inputs_used": [],
  "classification": {},
  "feature_analysis": {},
  "market_buyer_fit": {},
  "page_strategy": {},
  "trust_strategy": {},
  "visual_direction": {},
  "page_content": {},
  "rfq_and_sales_hooks": {},
  "page_draft_artifacts": [],
  "downstream_routes": [],
  "qa_report": {},
  "human_review_required": true,
  "publish_allowed": false
}
```

输出必须包含：

| 输出 | 用途 |
| --- | --- |
| `classification` | 说明为什么该产品属于某品类，以及是否需要人工复核 |
| `feature_analysis` | 说明该产品页面应该突出哪些结构、功能、规格或使用场景 |
| `market_buyer_fit` | 说明优先国家/地区、限制、证书缺口和买家对象 |
| `page_strategy` | 决定页面类型、模块顺序、CTA 和信息密度 |
| `trust_strategy` | 说明无客户案例时如何建立信任 |
| `visual_direction` | 输出图片补全、多角度、贴标、实拍和 QA 要求 |
| `page_content` | 输出英文标题、短文案、规格表、FAQ、SEO/GEO 内容 |
| `rfq_and_sales_hooks` | 输出询盘字段、补问问题、样品请求和报价准备字段 |
| `page_draft_artifacts` | 页面草案、截图、HTML、设计 brief、图片素材路径 |
| `downstream_routes` | 告诉主系统下一步进入哪些节点 |
| `qa_report` | 视觉、文案、合规、移动端和询盘链路检查结果 |
| `human_review_pack` | 人工确认清单和阻塞项 |

## 新品牌无客户案例时的商业打法

当前企业处于新产品入市阶段，不能伪造客户案例，也不应假装拥有大厂历史。因此产品页信任体系默认采用“采购验证型信任”。

页面应重点展示：

1. 产品证据：结构、参数、细节图、规格表、包装信息。
2. 样品证据：样品流程、样品周期、样品确认项。
3. 合规证据：证书状态、待确认项、目标市场复核提示。
4. 质量证据：检测流程、批次追踪、出厂检查、可补充报告。
5. 供应证据：MOQ、交期、私标能力、组合 SKU、资料包。
6. 询盘证据：RFQ 字段直接围绕采购决策，减少无效沟通。

参考页面只能用于结构和功能借鉴，不能复制品牌、客户案例、图片、专有文案或独特页面表达。

## 人工确认门禁

进入真实发布或对外使用前，必须确认：

- 产品分类是否正确。
- 产品结构和图片是否真实。
- AI 补图是否只作为方向稿或是否允许公开使用。
- 认证、测试报告和目标市场 claims 是否真实。
- 品牌名、Logo、SKU、包装和贴标是否确认。
- MOQ、价格、交期、样品政策是否可展示。
- RFQ 字段是否符合真实报价需要。
- 页面是否允许发布到独立站、平台或广告落地页。

## 与主系统控制面的关系

该分叉必须暴露给主系统查看和执行：

| 主系统能力 | 要求 |
| --- | --- |
| 查看 | 能看到输入、输出、状态、阻塞项、QA 和下一步 |
| 执行 | 能触发分析、生成页面草案、生成图片任务、生成 review pack |
| 暂停 | 任一人工门禁未通过时必须停在 `human_review_required` |
| 重跑 | 修改产品输入、参考页、品牌策略或目标市场后可重跑 |
| 回写 | 结果写回跨境 runtime，并进入 RawEvent/SemanticEvent 摘要 |

## 当前建议成熟度

当前阶段定位为 `L1 Draft Automation -> L2 Assisted Execution`。

- L1：AI 自动生成分类、页面、视觉、RFQ 和 QA 草案。
- L2：人工确认后，AI 继续生成站点发布包、获客内容、询盘接待和报价准备。
- 暂不允许自动公开发布、真实广告投放、真实客户发送或真实报价。

## 下一步实现清单

| 编号 | 状态 | 动作 |
| --- | --- | --- |
| PP-01 | `[done]` | 建立产品页 AI 构建分叉规范 |
| PP-02 | `[pending_me]` | 把 `product_page_build_pack.v1` 升级为 schema |
| PP-03 | `[pending_me]` | 把 QXKJ-1035 样张转成标准输出包 |
| PP-04 | `[pending_me]` | 根据参考页重做产品页结构和功能原型 |
| PP-05 | `[pending_me]` | 建立图片补全、多角度生成和人审门禁 |
| PP-06 | `[pending_me]` | 将输出继续接入 RFQ、询盘接待、报价准备和获客内容 |
