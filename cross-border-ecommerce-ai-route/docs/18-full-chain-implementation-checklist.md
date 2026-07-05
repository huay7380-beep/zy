# 完整链路流程清单

状态：`implementation_checklist`

日期：2026-06-28

本文件把跨境电商全流程拆成可执行清单，并标记当前状态。它包含前期已经完成的理论方案、模板、schema、运行目录、校验脚本、星云投影资料，以及后续仍需要你确认、你办理或我继续实现的事项。

## 状态标记

| 状态 | 含义 |
| --- | --- |
| `[done]` | 已在本项目内完成文档、模板、schema、运行目录、校验或本地草案。 |
| `[pending_user]` | 需要你提供资料、确认方向、办理登记、授权或选择预算/市场。 |
| `[pending_me]` | 你确认后我可以继续在本地实现，不触发真实外部动作。 |
| `[pending_external]` | 需要银行、海关、税务、商标、广告平台、工厂、货代、报关行等外部主体参与。 |
| `[blocked_real_action]` | 真实外发、真实报价、真实投放、真实报关、真实收款等动作，必须人工确认后才允许执行。 |

## 当前总览

| 链路阶段 | 当前状态 | 已完成重点 | 主要待完成 |
| --- | --- | --- | --- |
| 0. 项目底座与存储边界 | `[done]` | 子项目目录、README、AGENTS、manifest、runtime 边界、校验脚本 | 后续主系统运行态接入 |
| 1. 企业主体与大陆合规 | `[pending_user]` | 合规理论流程和办理清单 | 证照、海关、税务、外汇、银行由你办理 |
| 2. 产品源头与 PDF 资料 | `[partial]` | 两份 PDF 纳入项目，完成产品系列种子和视觉检查 | 全量 OCR、SKU 表、工厂授权、高清图索取 |
| 3. 自有品牌与产品图重构 | `[pending_user]` | 重构方案已完成 | 品牌确认、授权确认、图片重拍/重修、目录重制 |
| 4. 产品合规与证书 | `[pending_user]` | 合规门禁设计完成 | 证书矩阵、HS code、PDU 高合规复核 |
| 5. 产品主数据与价格 | `[partial]` | 主数据模板完成 | 真实成本、MOQ、交期、价格本 |
| 6. 独立站与数据结构 | `[partial]` | 站点 IA schema/template 完成 | 本地原型、产品页、RFQ 表单、真实域名/平台 |
| 7. 海外 SEO/GEO/广告 | `[partial]` | SEO/GEO/广告 schema、模板和策略完成 | 内容生产、广告素材、账号、预算、投放审批 |
| 8. RFQ 与询盘接待 | `[partial]` | RFQ schema、字段模板、缺口问题、线索评级完成 | 示例运行、真实表单、CRM 接入 |
| 9. 报价草案 | `[partial]` | QuoteDraft schema/template 完成 | 价格本、样例报价、PI/合同草案 |
| 10. 客户 AI 维护 | `[partial]` | 首响、补问、报价跟进、样品跟进话术完成 | 客户分层、触发计划、受控发送确认包 |
| 11. 订单、收款、履约 | `[pending_user]` | 理论流程完成 | 真实服务商、合同、收款、订舱、发货 |
| 12. 报关、税务、外汇 | `[pending_user]` | 流程和风险门禁完成 | 报关行、税务、外汇、退税资料 |
| 13. 售后、复购、审计 | `[partial]` | 售后和复购理论流程完成 | 触发器、回写事件、复盘看板 |
| 14. 世界系统三维粒子 OS | `[partial]` | 本地投影、验证截图、运行态控制面读取和阶段按钮已有 | 视觉截图复验、父系统全局事件总线接入 |
| 15. 本地自动化与验证 | `[partial]` | 本地校验脚本通过 | 演示闭环脚本、测试包、主系统事件扩展 |
| 16. 通用新品类 Autopilot | `[partial]` | 通用产品输入/分析契约和蓝图已完成 | 演示脚本、样例新品类、人工确认包、逐步自动执行 |
| 17. 主系统查看与执行控制 | `[partial]` | 控制面契约、16 阶段状态卡、阶段执行器、主系统 IPC、动态星云按钮和本地事件写回已完成 | 父系统全局事件总线接入、真实 UI 截图复验 |

## 已完成清单

### A. 项目底座

| 编号 | 状态 | 已完成事项 | 证据 |
| --- | --- | --- | --- |
| A-01 | `[done]` | 建立跨境电商子项目目录 | `cross-border-ecommerce-ai-route/**` |
| A-02 | `[done]` | 建立 README 和主入口说明 | `README.md` |
| A-03 | `[done]` | 建立本地线程规则和存储边界 | `AGENTS.md`、`docs/14-storage-boundary-and-artifact-index.md` |
| A-04 | `[done]` | 建立主系统读取 manifest | `nodes/process-manifest.json` |
| A-05 | `[done]` | 建立节点目录草案 | `nodes/node-catalog.json` |
| A-06 | `[done]` | 建立项目内运行目录 | `runtime/**` |
| A-07 | `[done]` | 建立本地校验脚本 | `scripts/validate-cross-border-project.mjs` |
| A-08 | `[done]` | 校验脚本运行通过 | `runtime/validations/project-validation-report.json` |

### B. 总体方案与合规框架

| 编号 | 状态 | 已完成事项 | 证据 |
| --- | --- | --- | --- |
| B-01 | `[done]` | 跨境电商总链路方案 | `docs/00-overview.md` |
| B-02 | `[done]` | 中国大陆主体、证照、海关、税务、外汇、数据合规方案 | `docs/01-mainland-compliance.md` |
| B-03 | `[done]` | 独立站、数据底座、PIM/CRM/报价系统方案 | `docs/02-independent-site-and-data.md` |
| B-04 | `[done]` | 产品资料、图文视频、拍摄方式和素材治理方案 | `docs/03-product-content-photo.md` |
| B-05 | `[done]` | 获客、广告、SEO、社媒和展会链路方案 | `docs/04-acquisition-and-promotion.md` |
| B-06 | `[done]` | 询盘接待、客户分层、报价、跟进和成交方案 | `docs/05-inquiry-quote-sales.md` |
| B-07 | `[done]` | 订单、收款、物流、报关、退税、售后、复购方案 | `docs/06-fulfillment-finance-after-sales.md` |
| B-08 | `[done]` | AI 自动化节点、状态机、受控发送和主系统接口方案 | `docs/07-ai-orchestration.md` |
| B-09 | `[done]` | 客户 AI 维护实例和话术 | `docs/08-customer-ai-examples.md` |
| B-10 | `[done]` | 实施路线图、验收标准和风险台账 | `docs/09-roadmap-acceptance.md` |
| B-11 | `[done]` | 官方来源和复核清单 | `docs/sources.md` |

### C. 当前产品线深化

| 编号 | 状态 | 已完成事项 | 证据 |
| --- | --- | --- | --- |
| C-01 | `[done]` | 接收并保留两份产品 PDF | `2024 NEW PRODUCT CATALOGUE.pdf`、`ELECTRONIC CATALOGUE.pdf` |
| C-02 | `[done]` | 结构化布线产品系列种子 | `products/structured-cabling-catalogue-seed.json` |
| C-03 | `[done]` | 当前产品线深化设计 | `docs/10-structured-cabling-product-deepening.md` |
| C-04 | `[done]` | 新增产品标准上新和运维流程 | `docs/11-standardized-product-operations.md` |
| C-05 | `[done]` | 品牌替换、私标、旧品牌清理和证书授权流程 | `docs/12-brand-replacement-private-label-playbook.md` |
| C-06 | `[done]` | 执行责任划分清单 | `docs/13-execution-responsibility-matrix.md` |
| C-07 | `[done]` | 两份 PDF 视觉检查渲染 | `runtime/pdf-visual-review/**` |
| C-08 | `[done]` | 自有品牌目录与产品图重构方案 | `docs/17-brand-catalogue-visual-rebuild-plan.md` |

### D. RFQ、报价、站点、SEO/GEO、客户话术

| 编号 | 状态 | 已完成事项 | 证据 |
| --- | --- | --- | --- |
| D-01 | `[done]` | RFQ 字段、动态产品字段、缺口问题和线索评级 | `schemas/rfq-intake.schema.json`、`templates/rfq-field-map.structured-cabling.template.json` |
| D-02 | `[done]` | 报价草案结构和风险门禁 | `schemas/quote-draft.schema.json`、`templates/quote-draft.structured-cabling.template.json` |
| D-03 | `[done]` | 站点信息架构和发布门禁 | `schemas/site-ia.schema.json`、`templates/site-information-architecture.template.json` |
| D-04 | `[done]` | 海外 SEO、生成式 GEO、区域本地化 GEO 和广告计划 | `schemas/growth-plan.schema.json`、`templates/overseas-seo-geo-ads-plan.template.json`、`docs/16-overseas-seo-geo-ads-plan.md` |
| D-05 | `[done]` | RFQ、报价和站点实现说明 | `docs/15-rfq-quote-site-implementation.md` |
| D-06 | `[done]` | 客户首响、补问、报价跟进、样品跟进和证书请求话术 | `templates/customer-message-playbook.structured-cabling.md` |
| D-07 | `[done]` | 产品拍摄清单 | `templates/product-shot-list.md` |
| D-08 | `[done]` | 标准产品、询盘、报价和客户维护模板 | `templates/**` |

### E. 世界系统与验证

| 编号 | 状态 | 已完成事项 | 证据 |
| --- | --- | --- | --- |
| E-01 | `[done]` | 实体工作节点子云本地投影文件 | `os-particle-projection.json` |
| E-02 | `[done]` | 世界系统视觉验证截图归档 | `runtime/actual-graph-verification/**`、`runtime/os-visual-verification/**` |
| E-03 | `[done]` | manifest 索引 docs、schemas、templates、scripts | `nodes/process-manifest.json` |
| E-04 | `[done]` | 存储边界校验，避免写入主目录旧路径 | `scripts/validate-cross-border-project.mjs` |

### F. 通用新品类自动化

| 编号 | 状态 | 已完成事项 | 证据 |
| --- | --- | --- | --- |
| F-01 | `[done]` | 通用新品类自动化蓝图 | `docs/19-universal-product-autopilot-blueprint.md` |
| F-02 | `[done]` | 任意新品类统一输入 schema | `schemas/universal-product-intake.schema.json` |
| F-03 | `[done]` | 自动分类、市场、图片、产品页、定价、物流分析 schema | `schemas/product-auto-analysis.schema.json` |
| F-04 | `[done]` | 通用产品输入模板 | `templates/universal-product-intake.template.json` |
| F-05 | `[done]` | 自动分析输出模板 | `templates/product-auto-analysis.template.json` |
| F-06 | `[done]` | 新品类自动化运行目录 | `runtime/product-automation/README.md` |
| F-07 | `[done]` | 产品页 AI 构建分叉规范与输出模板 | `docs/21-ai-driven-product-page-branch.md`、`templates/ai-product-page-build-branch.template.json` |
| F-08 | `[done]` | 产品页 AI 构建分叉 schema、可执行脚本和控制面动作 | `schemas/product-page-build-pack.schema.json`、`scripts/run-product-page-branch.mjs`、`runtime/control-plane/stages/cbx_05_content_assets/stage-control-surface.json` |

### G. 主系统查看与执行控制面

| 编号 | 状态 | 已完成事项 | 证据 |
| --- | --- | --- | --- |
| G-01 | `[done]` | 主系统与跨境模块功能检查及改造方案 | `docs/20-main-system-control-integration-plan.md` |
| G-02 | `[done]` | 阶段控制面 schema | `schemas/stage-control-surface.schema.json` |
| G-03 | `[done]` | 阶段控制面模板 | `templates/stage-control-surface.template.json` |
| G-04 | `[done]` | 控制面运行目录 | `runtime/control-plane/README.md` |
| G-05 | `[done]` | 16 个 `cbx_*` 阶段控制面生成器 | `scripts/build-stage-control-surfaces.mjs`、`runtime/control-plane/stages/**/stage-control-surface.json` |
| G-06 | `[done]` | 单阶段本地执行器：inspect、validate、generate-draft、review-pack、prepare-controlled | `scripts/run-cross-border-stage.mjs` |
| G-07 | `[done]` | 跨境控制面总状态汇总 | `scripts/write-cross-border-status.mjs`、`runtime/control-plane/status/current-status.json` |
| G-08 | `[done]` | 主系统 IPC 读取实体工作节点运行态投影 | `sightflow-desktop-agent-main/src/main/index.ts` |
| G-09 | `[done]` | `zhineng-graph` 动态读取跨境阶段状态并显示本地动作按钮 | `sightflow-desktop-agent-main/src/renderer/src/zhineng-console/ZhinengConsole.tsx` |
| G-10 | `[partial]` | 跨境阶段事件写回 RawEvent/SemanticEvent 摘要 | `runtime/control-plane/events/stage-events.jsonl`；尚未接入父系统全局事件总线 |

## 待完成清单

### 1. 你需要办理或确认

| 编号 | 状态 | 待完成事项 | 说明 |
| --- | --- | --- | --- |
| U-01 | `[pending_user]` | 确认公司主体、经营范围、银行、税务和出口路径 | 涉及真实法律和财税责任。 |
| U-02 | `[pending_user]` | 办理或确认报关单位备案、单一窗口、外汇名录、对公外币收款 | 由你或服务商执行。 |
| U-03 | `[pending_user]` | 选择首期目标市场 | 建议先选择 2-3 个区域。 |
| U-04 | `[pending_user]` | 确认首期产品范围 | 建议先无源布线产品，PDU 暂缓或高合规复核。 |
| U-05 | `[pending_user]` | 确认新品牌方向或让我生成品牌候选 | 品牌确认后才能做目录、贴标、域名和商标。 |
| U-06 | `[pending_user]` | 向工厂确认私标/OEM/ODM 授权 | 包括换品牌、改型号、改包装、使用和修改图片。 |
| U-07 | `[pending_user]` | 向工厂索要高清无 Logo 原图、报价、MOQ、交期、包装、证书和测试报告 | 决定后续产品图和价格本质量。 |
| U-08 | `[pending_user]` | 提供真实成本、阶梯价、样品价、包装成本和毛利底线 | 没有价格本不能生成真实报价。 |
| U-09 | `[pending_user]` | 确认站点平台 | 本地原型、Shopify、WooCommerce、自研或暂缓。 |
| U-10 | `[pending_user]` | 确认广告预算和平台账号边界 | 真实投放必须你确认。 |
| U-11 | `[pending_user]` | 确认证书、交期、质保、独家代理、账期等客户承诺边界 | 影响受控发送和报价门禁。 |

### 2. 自有品牌和产品图重构待完成子项

这些子项来自 `docs/17-brand-catalogue-visual-rebuild-plan.md`，当前属于待完成实施项，不是已完成的真实图片交付。

| 编号 | 状态 | 待完成事项 | 负责方 | 输出 |
| --- | --- | --- | --- | --- |
| V-01 | `[pending_user]` | 确认工厂是否允许换品牌、改型号、改包装、修改或复用现有产品图 | 你 | `supplier_private_label_authorization.v1` |
| V-02 | `[pending_user]` | 确认新品牌名称和基础视觉方向 | 你 | `selected_brand.v1` |
| V-03 | `[pending_me]` | 从两份 PDF 建立产品图片审计表，标记可用、需重修、需重拍 | 我 | `runtime/products/import-drafts/pdf_product_image_audit.csv` |
| V-04 | `[pending_me]` | 建立旧 SKU 到新公开 SKU 的映射草案 | 我 | `runtime/products/import-drafts/public_sku_map.draft.json` |
| V-05 | `[pending_me]` | 建立图片重构任务清单 | 我 | `runtime/products/import-drafts/image_rebuild_task_list.json` |
| V-06 | `[pending_me]` | 设计品牌视觉系统：Logo 使用、主色、品类色、目录页规则 | 我，需你确认 | `brand_visual_system.v1` |
| V-07 | `[pending_me]` | 设计产品标签系统：包装贴纸、线缆吊牌、Patch Panel 标签条、PDU 铭牌规则 | 我，需你确认 | `product_label_system.v1` |
| V-08 | `[pending_user]` | 获取高清原图或采购样品用于重拍 | 你 | 原始图片或样品 |
| V-09 | `[pending_me]` | 产品图去背景、统一白底、统一阴影和裁切 | 我 | `runtime/products/master/images/**` |
| V-10 | `[pending_me]` | 清理旧 Logo、旧公司名、旧网址和旧品牌标语 | 我 | `old_brand_cleanup_report.v1` |
| V-11 | `[pending_me]` | 生成目录版、网站版和缩略图版产品图 | 我 | `print/`、`web/`、`thumb/` |
| V-12 | `[pending_me]` | 重构自有品牌产品目录草案 | 我 | `public_catalogue_draft.pdf` 或可编辑源文件 |
| V-13 | `[pending_me]` | 将目录资产拆分为网站、SEO/GEO 和广告视觉素材 | 我 | `site_product_image_pack.v1`、`seo_geo_visual_asset_pack.v1` |
| V-14 | `[pending_user]` | 最终审查自有品牌目录和产品图是否可公开 | 你 | 发布确认记录 |

### 3. 我确认后可继续实现

| 编号 | 状态 | 待完成事项 | 前置条件 |
| --- | --- | --- | --- |
| M-01 | `[pending_me]` | 对两份 PDF 做全量 OCR/人工复核，生成 SKU 草案 | 你确认产品范围和是否全量处理。 |
| M-02 | `[pending_me]` | 生成首期产品主数据 JSON/CSV | 需要产品范围、公开 SKU 规则。 |
| M-03 | `[pending_me]` | 生成 Shopify/WooCommerce/通用产品导入表 | 需要站点平台方向。 |
| M-04 | `[pending_me]` | 生成本地独立站原型 | 需要品牌方向和首期产品范围。 |
| M-05 | `[pending_me]` | 生成 5 个产品页样例和 RFQ 落地页样例 | 需要产品范围和图片策略。 |
| M-06 | `[pending_me]` | 生成 SEO/GEO 第一批内容，包括 FAQ、比较指南、区域页草案 | 需要目标市场。 |
| M-07 | `[pending_me]` | 生成 Google/LinkedIn/B2B 广告素材草案 | 需要目标市场和预算边界。 |
| M-08 | `[pending_me]` | 生成样例 RFQ Intake、QuoteDraft 和客户跟进草案 | 需要样例产品和模拟价格。 |
| M-09 | `[pending_me]` | 新增演示闭环脚本 `run-cross-border-route-demo.mjs` | 需要你确认进入 Phase 1 Local Execution Pack。 |
| M-10 | `[pending_me]` | 新增本地测试包或 runtime 报告 | 需要演示脚本和样例数据。 |
| M-11 | `[pending_me]` | 生成 CRM 字段表、客户分层和触发计划 | 需要客户跟进策略确认。 |
| M-12 | `[pending_me]` | 生成受控发送人工确认包结构 | 需要确认未来是否接邮箱、WhatsApp、LinkedIn。 |
| M-13 | `[pending_me]` | 同步实体工作节点的运行态状态包 | 需要主系统接入边界确认。 |
| M-14 | `[pending_me]` | 用一个非结构化布线新品类做通用 Autopilot 样例 | 需要你提供一个新品类详细产品说明。 |
| M-15 | `[pending_me]` | 新增产品 Autopilot 演示脚本，把输入说明转成自动分析包 | 需要样例输入和执行范围确认。 |
| M-16 | `[pending_me]` | 生成标准/认证/目标市场推荐的人审包 | 需要证书、测试报告或资质文件。 |
| M-17 | `[pending_me]` | 生成新品类动态 RFQ 字段、产品页、定价和物流比较草案 | 需要产品属性、成本、包装和目标市场。 |
| M-18 | `[pending_me]` | 建立自动化成熟度 L1 -> L2 -> L3 的升级门禁 | 需要你确认哪些动作允许从草案进入受控执行。 |
| M-19 | `[done]` | 生成每个 `cbx_*` 阶段的 StageControlSurface | 已实现 `build-stage-control-surfaces.mjs`。 |
| M-20 | `[done]` | 新增跨境阶段执行器 `run-cross-border-stage.mjs` | 已支持 inspect/validate/generate-draft/review-pack/prepare-controlled。 |
| M-21 | `[done]` | 新增主系统 EntityWorkRuntime 适配器 | 已通过 `zhineng:entity-work:projection:get` 和 `zhineng:entity-work:stage:run` 读取和执行。 |
| M-22 | `[done]` | 改造三维粒子 OS，从静态星点改为动态读取控制面 | 已在 `zhineng-graph` 中用 IPC 覆盖实体工作节点子星点并提供本地动作按钮。 |
| M-23 | `[partial]` | 建立跨境业务事件到 RawEvent/SemanticEvent 的写回映射 | 已写入跨境本地 `stage-events.jsonl`，尚未进入父系统全局事件总线。 |
| M-24 | `[done]` | 建立跨境状态面板 current-status | 已汇总阶段进度、阻塞项、下一步和最新报告。 |
| M-25 | `[done]` | 把产品页 AI 构建分叉升级为可执行脚本和 schema | 已生成 `product_page_build_pack.v1` schema 和 `run-product-page-branch.mjs`。 |
| M-26 | `[partial]` | 根据参考页重构当前 QXKJ-1035 产品页并接入 RFQ/询盘/报价后续链路 | 已完成少量重构样张和产品分类；完整接入 RFQ/询盘/报价链路待你确认。 |

### 4. 外部真实执行待完成

| 编号 | 状态 | 待完成事项 | 说明 |
| --- | --- | --- | --- |
| X-01 | `[pending_external]` | 商标检索和注册 | 你或代理办理。 |
| X-02 | `[pending_external]` | 域名购买、DNS、企业邮箱 | 你购买或授权后配置。 |
| X-03 | `[pending_external]` | ICP 备案 | 如使用中国内地服务器。 |
| X-04 | `[pending_external]` | Google、LinkedIn、B2B 平台账号开通 | 真实账号和预算由你控制。 |
| X-05 | `[pending_external]` | 报关行、货代、会计、银行服务商确认 | 真实履约前必须确定。 |
| X-06 | `[pending_external]` | 证书、测试报告、HS code 最终确认 | 需要工厂、报关行或专业机构支持。 |
| X-07 | `[blocked_real_action]` | 真实客户消息发送 | 必须人工确认。 |
| X-08 | `[blocked_real_action]` | 真实报价、PI、合同、付款说明发送 | 必须人工确认。 |
| X-09 | `[blocked_real_action]` | 真实广告投放 | 必须人工确认预算和投放计划。 |
| X-10 | `[blocked_real_action]` | 真实订舱、发货、报关、退税、收汇申报 | 必须你或服务商执行。 |

## 推荐执行顺序

### Phase 1：本地确认包

| 顺序 | 任务 | 状态 |
| --- | --- | --- |
| 1 | 你确认 Q1-Q12 执行问题 | `[pending_user]` |
| 2 | 确认首期市场和产品范围 | `[pending_user]` |
| 3 | 确认是否生成品牌候选 | `[pending_user]` |
| 4 | 确认是否对 PDF 做全量 OCR/产品入库 | `[pending_user]` |
| 5 | 我生成产品图片审计表、SKU 映射和首批产品主数据草案 | `[pending_me]` |
| 6 | 我生成自有品牌视觉试点：Keystone Jack + Patch Panel 各 5 个 SKU | `[pending_me]` |
| 7 | 我生成本地站点原型、RFQ 样例、报价样例和客户跟进草案 | `[pending_me]` |
| 8 | 我运行校验并生成 Phase 1 报告 | `[pending_me]` |

### Phase 2：资料补齐包

| 顺序 | 任务 | 状态 |
| --- | --- | --- |
| 1 | 你向工厂索要授权、高清图、报价、MOQ、交期、证书 | `[pending_user]` |
| 2 | 我建立证书矩阵、价格本、图片重构任务和产品导入表 | `[pending_me]` |
| 3 | 你确认品牌、域名、商标策略和平台方向 | `[pending_user]` |
| 4 | 我生成目录草案、网站内容、SEO/GEO 内容和广告草案 | `[pending_me]` |

### Phase 3：受控运行包

| 顺序 | 任务 | 状态 |
| --- | --- | --- |
| 1 | 建立主系统运行事件扩展 | `[pending_me]` |
| 2 | 建立受控发送确认包 | `[pending_me]` |
| 3 | 接入真实邮箱/CRM/平台只读 intake | `[pending_me]` |
| 4 | 任何真实外发、报价、投放、收款、履约前由你确认 | `[blocked_real_action]` |

### Phase 4：通用新品类 Autopilot

| 顺序 | 任务 | 状态 |
| --- | --- | --- |
| 1 | 你提供一个新品类的详细产品说明包 | `[pending_user]` |
| 2 | 系统生成 `UniversalProductIntake` | `[pending_me]` |
| 3 | 系统自动分类并生成缺失字段清单 | `[pending_me]` |
| 4 | 系统根据认证/资质/风险属性推荐目标国家、地区和销售对象 | `[pending_me]` |
| 5 | 系统生成产品图编辑任务、产品页、RFQ 字段、定价和物流比较 | `[pending_me]` |
| 6 | 系统生成 HumanReviewPack，由你确认后进入受控执行 | `[pending_user]` |

### Phase 5：主系统控制面接入

| 顺序 | 任务 | 状态 |
| --- | --- | --- |
| 1 | 为每个跨境阶段生成 `StageControlSurface` | `[done]` |
| 2 | 主系统读取跨境 manifest 和阶段控制面 | `[done]` |
| 3 | 三维粒子 OS 显示阶段状态、阻塞项、下一步和操作按钮 | `[done]` |
| 4 | 点击阶段按钮触发 inspect/validate/generate-draft/review-pack 本地动作 | `[done]` |
| 5 | 高风险动作生成受控执行 preflight，不直接执行 | `[partial]` |
| 6 | 阶段结果写回 RawEvent/SemanticEvent 和跨境 runtime 状态 | `[partial]` |

## 下一次你只需要确认

请按下面格式回复即可：

```text
我确认进入 Phase 1：
1. 首期市场：
2. 首期产品范围：
3. 是否生成品牌候选：
4. 是否全量 OCR 两份 PDF：
5. 自有品牌视觉试点：Keystone Jack + Patch Panel 是否开始：
6. 是否生成本地站点原型：
7. 是否生成 RFQ/报价/客户跟进样例：
8. 成本/MOQ/交期：已有 / 暂无 / 稍后提供
```
