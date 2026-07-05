# Cross-Border Ecommerce AI Route

## Foreign Trade Orchestration Rules v2

Current governing rule: `docs/23-foreign-trade-orchestration-rules-v2.md`.

Machine-readable policy: `runtime/control-plane/orchestration-rules-v2.json`.

Any new foreign-trade capability must first produce or reference `build_vs_buy_decision.v1` using:

- Schema: `schemas/build-vs-buy-decision.schema.json`
- Template: `templates/build-vs-buy-decision.template.json`

Default rule: use existing project capability, MCP/connector/skill, official API, mature open-source library, low-code workflow, or SaaS/platform feature before writing custom code. Real external actions remain blocked unless explicitly confirmed by the user.

## AI Foreign Trade Growth Sales Automation Branch

新增分支入口：

- 文档：`docs/22-ai-foreign-trade-flowchart-alignment.md`
- Schema：`schemas/growth-sales-automation-branch.schema.json`
- 模板：`templates/growth-sales-automation-branch.template.json`
- 生成脚本：`scripts/build-growth-sales-automation-branch.mjs`
- 运行控制包：`runtime/growth-sales-automation/branch-control-pack.json`
- AI 实现计划 JSON：`runtime/growth-sales-automation/ai-implementation-plan.json`
- AI 实现计划 MD：`runtime/growth-sales-automation/ai-implementation-plan.md`
- 产品输入框架 JSON：`runtime/growth-sales-automation/product-input-framework.json`
- 产品输入框架 MD：`runtime/growth-sales-automation/product-input-framework.md`
- 模块提示词：`runtime/growth-sales-automation/prompts/*.prompt.json` 与 `runtime/growth-sales-automation/prompts/*.prompt.md`
- 模块试执行结果：`runtime/growth-sales-automation/sample-runs/*.trial.json` 与 `runtime/growth-sales-automation/sample-runs/*.trial.md`
- 控制网页：`runtime/growth-sales-automation/dashboard/index.html`

该分支是 `growth_sales_automation_branch`，作为 16 个 `cbx_*` 主流程节点上的 overlay branch 存在，不新增主阶段。网页面向人类观察；JSON/MD 面向上下游系统读取。产品输入页当前是本地预览入口，支持文本、选项和文件名读取，不上传文件、不外发、不训练。所有外部软件和真实动作默认禁用，必须调试并人工确认后才允许逐项开启。

本子项目用于设计一条从中国大陆产品源头出发的跨境电商全流程通路。当前交付物是理论方案和调度接口草案，尚未把节点注册进主系统运行时，也不会自动触发真实发送、报价、收款、报关或客户联系。

## 当前状态

- 阶段：`local_control_plane_ready`
- 主入口：`nodes/process-manifest.json`
- 节点目录：`nodes/node-catalog.json`
- 三维 OS 投影：`os-particle-projection.json`，真实查看面为 `http://[::1]:5173/?window=zhineng-graph`
- 产品系列种子：`products/structured-cabling-catalogue-seed.json`
- 项目内运行产物：`runtime/`
- 本地线程规则：`AGENTS.md`
- 下一步：继续把跨境本地事件写入父系统全局事件总线，并补真实 UI 截图复验。

## 目录

| 路径 | 用途 |
| --- | --- |
| `docs/00-overview.md` | 跨境电商总链路和经营架构 |
| `docs/01-mainland-compliance.md` | 中国大陆主体、证照、海关、税务、外汇、数据合规 |
| `docs/02-independent-site-and-data.md` | 独立站、数据底座、PIM/CRM/报价系统 |
| `docs/03-product-content-photo.md` | 产品资料、图文视频、拍摄方式和素材治理 |
| `docs/04-acquisition-and-promotion.md` | 用户获取、获客、广告、SEO、社媒和展会链路 |
| `docs/05-inquiry-quote-sales.md` | 询盘接待、客户分层、报价、跟进、成交 |
| `docs/06-fulfillment-finance-after-sales.md` | 订单、收款、物流、报关、退税、售后、复购 |
| `docs/07-ai-orchestration.md` | AI 自动化节点、状态机、受控发送和主系统接口 |
| `docs/08-customer-ai-examples.md` | 客户 AI 维护实例和可直接改写的中英文话术 |
| `docs/09-roadmap-acceptance.md` | 实施路线图、验收标准和风险台账 |
| `docs/10-structured-cabling-product-deepening.md` | 根据当前结构化布线产品目录深化产品线、站点、询盘和报价流程 |
| `docs/11-standardized-product-operations.md` | 后续新增产品可复用的标准上新与日常运维流程 |
| `docs/12-brand-replacement-private-label-playbook.md` | 更换品牌、私标、旧品牌清理和证书授权门禁流程 |
| `docs/13-execution-responsibility-matrix.md` | 执行责任划分：你办理/登记、我可直接实现、确认后由我执行 |
| `docs/14-storage-boundary-and-artifact-index.md` | 跨境电商内容存储边界、权威产物索引和外部指针规则 |
| `docs/15-rfq-quote-site-implementation.md` | RFQ 字段、报价草案结构、站点信息架构和运行输出位置 |
| `docs/16-overseas-seo-geo-ads-plan.md` | 海外 SEO、生成式 GEO、区域本地化 GEO 和广告草案 |
| `docs/17-brand-catalogue-visual-rebuild-plan.md` | 两份 PDF 产品图重构、自有品牌贴标和目录视觉重建方案 |
| `docs/18-full-chain-implementation-checklist.md` | 完整链路流程清单，汇总已完成、待确认、待实现和外部办理事项 |
| `docs/19-universal-product-autopilot-blueprint.md` | 通用新品类自动化蓝图：产品输入后自动分类、合规地区推荐、图像、产品页、定价和物流 |
| `docs/20-main-system-control-integration-plan.md` | 主系统查看、控制和执行跨境阶段所需的改造方案 |
| `docs/21-ai-driven-product-page-branch.md` | AI 驱动产品页构建分叉：输入、输出、页面策略、视觉、RFQ 和后续销售链路 |
| `docs/sources.md` | 资料来源和后续核对清单 |
| `nodes/process-manifest.json` | 主系统读取的流程总 manifest 草案 |
| `nodes/node-catalog.json` | 每个业务节点的输入、输出、门禁和可控动作 |
| `os-particle-projection.json` | 世界系统三维粒子 OS 的实体工作节点子云投影，已指向真实 `zhineng-graph` 页面 |
| `products/structured-cabling-catalogue-seed.json` | 当前两个产品 PDF 的视觉抽取产品系列种子 |
| `runtime/` | 跨境电商运行产物、验证证据、导入表、报价草案和状态输出的项目内归档目录 |
| `schemas/commerce-node.schema.json` | 节点定义草案 schema |
| `schemas/rfq-intake.schema.json` | 结构化布线 RFQ intake schema |
| `schemas/quote-draft.schema.json` | 标准品、BOM、私标和样品报价草案 schema |
| `schemas/site-ia.schema.json` | 独立站信息架构和发布门禁 schema |
| `schemas/growth-plan.schema.json` | 海外 SEO、GEO 和广告计划 schema |
| `schemas/universal-product-intake.schema.json` | 任意新品类的统一产品输入 schema |
| `schemas/product-auto-analysis.schema.json` | 自动分类、市场推荐、图片、产品页、定价和物流分析 schema |
| `schemas/product-page-build-pack.schema.json` | 产品页 AI 构建包 schema，定义分类、页面策略、视觉、RFQ 和后续路由 |
| `schemas/stage-control-surface.schema.json` | 每个跨境阶段暴露给主系统查看和执行的控制面 schema |
| `templates/` | 询盘、报价、产品主数据、通用产品输入、自动分析、结构化布线产品、站点 IA、SEO/GEO/广告、拍摄和客户维护模板 |
| `templates/ai-product-page-build-branch.template.json` | 产品页 AI 构建分叉输出模板 `product_page_build_pack.v1` |
| `runtime/product-automation/` | 未来新品类自动化运行产物目录 |
| `runtime/control-plane/` | 主系统读取阶段状态、操作按钮、人审包和受控执行 preflight 的运行目录 |
| `scripts/validate-cross-border-project.mjs` | 本项目本地校验脚本，验证 JSON、manifest、运行目录和存储边界 |
| `scripts/build-stage-control-surfaces.mjs` | 为 16 个 `cbx_*` 阶段生成主系统可读取的控制面 |
| `scripts/run-cross-border-stage.mjs` | 执行单阶段 inspect、validate、generate-draft、review-pack、prepare-controlled 本地动作 |
| `scripts/run-product-page-branch.mjs` | 执行产品页 AI 构建分叉，生成少量重构页面、构建包、QA 和人审包 |
| `scripts/write-cross-border-status.mjs` | 汇总跨境控制面当前状态，供主系统只读查看 |

## 调度原则

1. 主系统读取 `nodes/process-manifest.json`，获得 canonical flow、节点目录、文档索引和安全策略。
2. 每个节点以 `node_id` 为唯一标识，以 `inputs`、`outputs`、`control_actions`、`required_human_gates` 描述可被访问和控制的边界。
3. 所有真实对外动作默认进入 `draft_only` 或 `human_confirmed_only` 状态，包括邮件、WhatsApp、LinkedIn 私信、报价单、PI、订单确认、报关资料提交和退款承诺。
4. 所有客户、订单、物流、税务、合规事件都要能回写为 `RawEvent` / `SemanticEvent`，再进入主系统的图谱记忆、触发计划和审计链。
5. 世界系统三维粒子 OS 通过 `实体工作节点` 星云查看本项目；点击后展开跨境电商粒子云，显示 16 个当前理论节点状态。
6. 当前结构化布线产品按照 `source -> product master -> brand mapping -> compliance gate -> price book -> content -> site -> RFQ -> quote -> operations` 标准流程推进。
7. 所有跨境电商业务内容必须保存在 `cross-border-ecommerce-ai-route/**`；后续运行产物统一写入 `cross-border-ecommerce-ai-route/runtime/**`，不写入主目录。

## 本地校验

当前可用校验命令：

```powershell
node cross-border-ecommerce-ai-route/scripts/build-stage-control-surfaces.mjs
node cross-border-ecommerce-ai-route/scripts/validate-cross-border-project.mjs
```

校验会检查：

- RFQ、报价、站点 IA、SEO/GEO/广告 schema 和模板是否存在且可解析。
- `nodes/process-manifest.json` 中的文档、模板、schema、脚本引用是否真实存在。
- 16 个 `cbx_*` 阶段是否都有 `StageControlSurface`，且动作只写入本项目 runtime。
- 运行产物是否归档在 `cross-border-ecommerce-ai-route/runtime/**`。
- 主目录是否误生成旧的根级跨境电商运行路径。

## 建议下一步

确认本理论方案后，进入实现阶段：

1. 为 `nodes/node-catalog.json` 生成严格 JSON Schema 和测试样例。
2. 新增 `scripts/run-cross-border-route-demo.mjs`，把样例询盘跑成报价草案和跟进计划。
3. 将独立站、CRM、邮箱、WhatsApp、LinkedIn、报关/物流文件夹接入只读 intake。
4. 建立受控发送链路，先输出人工确认包，再允许真实窗口执行。
5. 对两个图片型 PDF 做 OCR/人工复核，生成全量 SKU 表和可上架产品主数据。
