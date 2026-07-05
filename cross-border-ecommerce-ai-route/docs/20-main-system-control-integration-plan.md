# 主系统查看与执行控制改造方案

状态：`integration_gap_analysis`

日期：2026-06-28

目标：让跨境电商模块的每个阶段都能被主系统查看、校验、生成草案、生成确认包，并在人工确认后进入受控执行。当前跨境电商模块已经能被三维粒子 OS 静态展示，但还没有形成真正可由主系统调度的运行控制面。

## 检查范围

已检查的主系统能力：

- `examples/system-process-tree.json`
- `packages/agent-runtime/src/workflow.mjs`
- `packages/intake-runtime/src/index.mjs`
- `packages/tool-runtime/src/index.mjs`
- `packages/trigger-engine/src/index.mjs`
- `packages/storage-runtime/src/index.mjs`
- `packages/mvp-runtime/src/process-tree-validation.mjs`
- `runtime/state/current-status.json`
- `sightflow-desktop-agent-main/src/renderer/src/zhineng-console/ZhinengConsole.tsx`
- `3d-particle-display-os/lens.config.json`
- `3d-particle-display-os/CONFIG.md`

已检查的跨境电商模块：

- `cross-border-ecommerce-ai-route/nodes/process-manifest.json`
- `cross-border-ecommerce-ai-route/nodes/node-catalog.json`
- `cross-border-ecommerce-ai-route/os-particle-projection.json`
- `cross-border-ecommerce-ai-route/schemas/**`
- `cross-border-ecommerce-ai-route/templates/**`
- `cross-border-ecommerce-ai-route/runtime/**`

## 当前能力判断

### 主系统已具备的能力

| 能力 | 当前证据 | 可复用性 |
| --- | --- | --- |
| 流程树/节点注册 | `examples/system-process-tree.json`、`validate-process-tree.mjs` | 可复用验证思想，但当前流程树偏人际/沟通系统，不能直接承载跨境 16+ 阶段。 |
| 运行状态记录 | `runtime/state/current-status.json`、`StateNotebook` | 可复用为项目级状态，但需要新增实体项目 stage 状态。 |
| 只读 intake | `packages/intake-runtime` | 可复用为产品说明、PDF、RFQ、客户询盘、平台表单的标准进入口。 |
| RawEvent/SemanticEvent 写回 | `packages/storage-runtime` | 可复用，但需要跨境业务事件类型映射。 |
| 受控发送 | `controlled-send-*`、`OutboundSendCommand` | 可复用客户消息、报价邮件、WhatsApp/LinkedIn 外发的确认门禁。 |
| 工具调用 dry-run | `packages/tool-runtime` | 可复用为广告平台、站点构建、图片处理、物流查询等工具动作的预检查。 |
| 触发/计划 | `packages/trigger-engine` | 可复用为报价跟进、客户维护、内容发布、证书补齐提醒。 |
| 三维粒子 OS 展示 | `ZhinengConsole.tsx`、`entity-work-nodes` | 已有静态展示，但缺动态读取、运行态叠加和执行按钮。 |

### 跨境模块已具备的能力

| 能力 | 当前证据 | 状态 |
| --- | --- | --- |
| 独立项目目录和存储边界 | `AGENTS.md`、`docs/14-storage-boundary-and-artifact-index.md` | 已完成 |
| 流程 manifest | `nodes/process-manifest.json` | 已完成，但还不是主系统运行注册表 |
| 阶段目录 | `nodes/node-catalog.json` | 已完成，含 inputs/outputs/control_actions/gates |
| 星云投影 | `os-particle-projection.json` | 已完成，只读展示 |
| RFQ/报价/站点/GEO/Autopilot schema | `schemas/**` | 已完成 |
| 模板和文档 | `templates/**`、`docs/00-19` | 已完成 |
| 本地校验脚本 | `scripts/validate-cross-border-project.mjs` | 已完成 |
| 运行目录 | `runtime/**` | 已完成 |

## 主要缺口

当前还不能说“主系统能控制和执行每个阶段”，因为缺少以下关键层：

| 缺口 | 影响 |
| --- | --- |
| 缺 stage control surface | 主系统不知道每个阶段当前状态、进度、阻塞项、可执行动作和命令。 |
| 缺 action dispatcher | 主系统不能按 `cbx_XX` 调用跨境模块脚本并收集输出。 |
| 缺 stage runtime state | 三维图只能看到静态 `draft`，看不到每阶段最新报告、进度、错误和下一步。 |
| 缺跨境事件映射 | 产品入库、证书检查、报价、物流、客户跟进不能稳定写回 RawEvent/SemanticEvent。 |
| 缺控制面验证 | 现有校验只验证文件存在和 JSON 结构，不验证阶段动作是否可调度。 |
| 缺 GUI 操作意图到后端 IPC | `zhineng-graph` 中的点击只能下钻展示，不能发出 `inspect/validate/generate-draft/review-pack` 操作。 |
| 缺受控执行前置包 | 对真实报价、客户外发、广告投放、物流订舱、报关等动作，还没有跨境业务专用 preflight。 |
| 缺主系统流程树注册 | 主系统流程树没有把 `cross_border_ecommerce_ai_route` 作为可调度实体项目注册。 |

## 新增控制面契约

本轮新增两个权威文件：

| 文件 | 作用 |
| --- | --- |
| `schemas/stage-control-surface.schema.json` | 定义每个阶段给主系统看的状态、动作、门禁、产物和审计字段。 |
| `templates/stage-control-surface.template.json` | 后续为每个 `cbx_*` 生成控制卡片的模板。 |

每个阶段控制卡片必须包含：

- `state`：阶段状态、执行模式、进度、阻塞项、下一步。
- `view`：主系统可展示的摘要、文档来源、运行产物、图谱节点。
- `actions`：可点击动作，例如 inspect、validate、generate_draft、review_pack、prepare_controlled_execution。
- `gates`：用户、外部服务商、专业复核或安全门禁。
- `artifacts`：输入契约、输出契约、最新报告、运行目录。
- `audit`：事件写回、真实执行是否允许、审计说明。

## 主系统需要改造的内容

### 1. 新增实体项目运行适配器

建议新增：

```text
packages/entity-work-runtime/**
scripts/run-entity-work-stage.mjs
```

职责：

- 读取 `cross-border-ecommerce-ai-route/nodes/process-manifest.json`。
- 读取 `nodes/node-catalog.json`。
- 生成 `StageControlSurface`。
- 校验阶段输入是否齐全。
- 调用跨境模块内的脚本。
- 把输出写回 `cross-border-ecommerce-ai-route/runtime/**`。
- 把阶段事件写回主系统 `RawEvent/SemanticEvent`。

### 2. 跨境模块新增阶段执行器

建议新增：

```text
cross-border-ecommerce-ai-route/scripts/run-cross-border-stage.mjs
cross-border-ecommerce-ai-route/scripts/build-stage-control-surfaces.mjs
cross-border-ecommerce-ai-route/scripts/write-cross-border-status.mjs
```

职责：

- `inspect`：读取阶段文档、schema、runtime，生成控制面摘要。
- `validate`：检查输入资料、门禁、缺失字段。
- `generate-draft`：生成本地草案，不触发真实动作。
- `review-pack`：生成人工确认包。
- `prepare-controlled`：只生成受控执行 preflight，不执行真实外部动作。

输出目录：

```text
cross-border-ecommerce-ai-route/runtime/control-plane/stages/**
cross-border-ecommerce-ai-route/runtime/control-plane/review-packs/**
cross-border-ecommerce-ai-route/runtime/control-plane/controlled-execution/**
cross-border-ecommerce-ai-route/runtime/control-plane/status/**
```

### 3. 主系统流程树注册跨境模块

需要在主系统层新增实体工作节点注册，而不是只在 `ZhinengConsole.tsx` 静态写星点。

建议新增或扩展：

```text
examples/entity-work-process-tree.json
examples/system-process-tree.json
views/obsidian/system-process-tree.md
views/obsidian/system-process-tree.canvas
```

新增节点建议：

| 主系统节点 | 作用 |
| --- | --- |
| `entity_work_intake` | 接收实体业务项目 manifest。 |
| `entity_work_stage_control` | 生成阶段控制面。 |
| `entity_work_draft_execution` | 执行本地草案和模拟。 |
| `entity_work_review_gate` | 生成人工确认包。 |
| `entity_work_controlled_execution` | 进入受控执行 preflight。 |
| `entity_work_writeback` | 结果写回事件和状态。 |

### 4. 三维粒子 OS 改为动态读取

当前 `ZhinengConsole.tsx` 中 `entity-work-nodes` 的跨境星点是静态数组。需要改成：

```text
ZhinengGraph
-> IPC/read-only API
-> EntityWorkRuntime
-> cross-border manifest + control surfaces
-> graph nodes + runtime overlays
```

前端需要显示：

- 阶段状态颜色。
- 进度。
- 阻塞项。
- 下一步。
- 最新报告链接。
- 可执行动作按钮：查看、校验、生成草案、生成人审包、准备受控执行。

真实动作按钮必须默认不可直接执行，只能进入确认包。

### 5. 新增视觉操作意图

三维图点击阶段后不应直接运行命令，而是生成操作意图：

```json
{
  "contract": "entity_work_operation_intent.v1",
  "project_id": "cross_border_ecommerce_ai_route",
  "stage_id": "cbx_10_quote_engine",
  "action_id": "generate_local_draft",
  "requested_by": "operator",
  "execution_mode": "draft_local",
  "requires_confirmation": false
}
```

后端再判断：

- action 是否存在。
- 当前 gate 是否满足。
- 是否只写入项目 runtime。
- 是否涉及真实外部动作。
- 是否需要确认。

### 6. 新增跨境事件写回映射

建议新增：

```text
schemas/cross-border-stage-event.schema.json
schemas/cross-border-business-object.schema.json
```

事件类型示例：

- `product_intake_created`
- `product_classified`
- `market_recommendation_generated`
- `image_rebuild_plan_created`
- `product_page_draft_created`
- `rfq_received`
- `quote_drafted`
- `quote_blocked`
- `review_pack_created`
- `controlled_execution_preflight_created`
- `human_gate_approved`
- `real_action_blocked`

这些事件再映射到主系统的 `RawEvent` / `SemanticEvent`，进入审计和复盘。

### 7. 新增跨境状态面板

建议新增：

```text
cross-border-ecommerce-ai-route/runtime/control-plane/status/current-status.json
cross-border-ecommerce-ai-route/runtime/control-plane/status/current-status.md
cross-border-ecommerce-ai-route/runtime/control-plane/status/current-status.html
```

状态面板应汇总：

- 16 个 `cbx_*` 阶段状态。
- 通用新品类 Autopilot 状态。
- 当前阻塞项。
- 用户待确认项。
- 外部待办理项。
- 可执行本地动作。
- 禁止真实动作清单。
- 最近校验结果。

### 8. 新增阶段级验证

当前 `validate-cross-border-project.mjs` 只验证项目级结构。需要新增检查：

- `canonical_flow` 中每个阶段都有 control surface。
- `node-catalog` 阶段和 manifest 阶段一致。
- 每个阶段有 runtime 输出目录。
- 每个 action 写入路径都在 `cross-border-ecommerce-ai-route/runtime/**`。
- 外部真实动作默认 `allowed=false`。
- 所有 high/critical action 都要求确认。
- 三维图状态来源不是静态硬编码。

## 阶段到主系统动作映射

| 阶段 | 主系统可查看 | 主系统可本地执行 | 真实动作边界 |
| --- | --- | --- | --- |
| `cbx_00_strategy_scope` | 策略范围、目标市场假设、预算门禁 | 生成策略草案、确认清单 | 预算和市场最终确认由你决定 |
| `cbx_01_entity_compliance` | 证照/税务/海关/外汇缺口 | 生成办理清单和资料包草案 | 政府/银行/税务提交需你或服务商 |
| `cbx_02_product_compliance` | 证书、HS 候选、目标国风险 | 生成证书矩阵、禁用 claims | 认证和 HS 最终判断需专业复核 |
| `cbx_03_market_selection` | 市场评分、客户画像 | 生成市场推荐、人审包 | 不自动决定真实投放 |
| `cbx_04_independent_site` | 站点 IA、RFQ 结构 | 生成站点原型、页面草案 | 真实发布需确认 |
| `cbx_05_content_assets` | 图片/视频/文案任务 | 生成产品页、图片任务、目录草案 | 未授权图片不能公开 |
| `cbx_06_catalog_pricing` | ProductMaster、PriceBook 状态 | 生成价格本草案、毛利检查 | 真实报价需确认 |
| `cbx_07_acquisition` | SEO/GEO/广告计划 | 生成广告草案、内容日历 | 真实投放需预算确认 |
| `cbx_08_lead_capture` | RFQ/表单/线索状态 | 线索标准化、评分、去重草案 | 客户身份需确认 |
| `cbx_09_inquiry_reception` | 询盘解析和缺口问题 | 生成首响草案和跟进计划 | 外发需确认 |
| `cbx_10_quote_engine` | 报价输入和风险门禁 | 生成 QuoteDraft、报价检查 | 真实报价发送需确认 |
| `cbx_11_contract_payment` | PI/合同/收款资料状态 | 生成 PI/合同草案 | 付款说明和合同需确认 |
| `cbx_12_order_fulfillment` | 生产/QC/物流状态 | 生成履约计划、物流比较 | 订舱/发货需确认 |
| `cbx_13_customs_tax_fx` | 报关/税务/外汇证据 | 生成单证清单和缺口报告 | 申报/退税/外汇需服务商 |
| `cbx_14_after_sales_retention` | 售后/复购/客户维护 | 生成维护话术和触发计划 | 客户外发需确认 |
| `cbx_15_audit_learning` | 周报、风险、优化动作 | 生成复盘报告和下一步建议 | 策略/预算调整需确认 |
| `product_autopilot` | 新品类输入和自动分析 | 分类、市场、图片、产品页、定价、物流草案 | 发布/报价/投放需确认 |

## 建议实施顺序

### Phase A：只读控制面

1. 生成每个 `cbx_*` 的 `StageControlSurface`。
2. 写入 `runtime/control-plane/stages/**`。
3. 主系统读取并展示状态。
4. 三维图从静态星点改为读取控制面。

验收：主系统能看到每个阶段的状态、来源、阻塞项和下一步。

### Phase B：本地草案执行

1. 新增 `run-cross-border-stage.mjs`。
2. 支持 `inspect`、`validate`、`generate-draft`。
3. 所有输出写入本项目 `runtime/**`。
4. 主系统按钮触发 dry-run/local draft。

验收：主系统点击某阶段后能生成本地草案和报告。

### Phase C：人工确认包

1. 支持 `review-pack`。
2. 生成用户确认清单。
3. 支持 approve/reject/defer 记录。
4. 写回 `cross_border_stage_event.v1`。

验收：任何高风险动作都有明确确认包和审计记录。

### Phase D：受控执行预备

1. 接入 `intake-runtime` controlled-send。
2. 接入 `tool-runtime` dry-run。
3. 接入 `trigger-engine` 跟进计划。
4. 外部真实动作仍默认 blocked。

验收：能准备受控执行 preflight，但不会越过人工门禁。

### Phase E：有限自动化

仅对低风险、已批准、资料完整的阶段允许自动草案/自动任务创建。真实发布、真实报价、真实投放、真实贸易执行仍需明确策略升级。

## 本轮结论

当前主系统“可以展示跨境模块”，但还不能真正“控制和执行每个阶段”。要实现你的目标，最低需要补齐：

1. `StageControlSurface` 控制面。
2. 跨境阶段执行器。
3. 主系统 EntityWorkRuntime 适配器。
4. 三维图动态读取和操作意图。
5. 跨境事件写回映射。
6. 阶段级状态面板。
7. 阶段级验证和受控执行门禁。

完成这些后，跨境电商模块才能从“方案星云”升级为“主系统可查看、可调度、可审计、可逐步执行的实体工作节点”。
