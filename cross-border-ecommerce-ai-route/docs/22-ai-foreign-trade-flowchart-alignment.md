# AI外贸增长销售自动化分支核定方案

状态：`confirmed_overlay_branch`

日期：2026-06-29

本文记录已确认的流程图核对结果，并把它升级为跨境电商模块中的一个可控分支。该分支用于承载“AI驱动的外贸自动化全流程”：市场洞察、智能获客、AI沟通、智能报价成单、售后复购。

## 已确认内容

| 编号 | 确认结果 | 落地处理 |
| --- | --- | --- |
| 1 | 确认 | 流程图方向与现有跨境电商模块匹配，作为增长销售自动化增强层。 |
| 2 | 确认 | 保留现有 16 个 `cbx_*` 主流程节点，不替换、不改数量。 |
| 3 | 确认 | 新增内容作为 `growth_sales_automation_branch` 分支，由主系统和星云读取。 |
| 4 | 确认，允许先生成草案 | 先生成控制包、网页、状态同步和实施路径；后续再逐步补本地脚本、只读连接器和受控执行。 |
| 5 | 确认，包含全部软件但默认禁止动作 | Panjiva、ImportYeti、ImportGenius、UN Comtrade、Google Trends、Amazon、Alibaba、LinkedIn、广交会、Made-in-China、Email、WhatsApp、Product Knowledge RAG、CRM 全部登记，但默认 `disabled`。 |
| 6 | 确认 | 所有真实外部动作继续阻断，必须调试、人工确认、手动开启后才能进入下一层。 |

## 分支定位

该分支不是新的第 17 个主阶段，而是覆盖现有主流程中的增长和销售段：

| 分支阶段 | 对应主流程 |
| --- | --- |
| 全球市场洞察 | `cbx_03_market_selection`、`cbx_07_acquisition` |
| 智能获客 | `cbx_07_acquisition`、`cbx_08_lead_capture` |
| AI智能沟通 | `cbx_08_lead_capture`、`cbx_09_inquiry_reception`、`cbx_10_quote_engine` |
| 智能报价与成单 | `cbx_06_catalog_pricing`、`cbx_10_quote_engine`、`cbx_11_contract_payment`、`cbx_12_order_fulfillment` |
| 售后与复购 | `cbx_12_order_fulfillment`、`cbx_14_after_sales_retention`、`cbx_15_audit_learning` |

这样做的原因是：主流程负责跨境贸易的完整经营链路和合规边界；流程图负责增长销售链路的自动化增强。二者合并为一个分支 overlay，可以最小改造现有系统，并避免影响其他线程依赖的 16 阶段控制面。

## 统一硬性边界

| 边界 | 规则 |
| --- | --- |
| 主流程边界 | `canonical_flow` 保持 16 个节点；分支不得写入 `runtime/control-plane/stages/**` 作为新增阶段。 |
| 存储边界 | 所有运行产物必须写入 `cross-border-ecommerce-ai-route/runtime/**`。 |
| 软件边界 | 所有外部平台默认 `disabled`，不得自动登录、抓取、发送、投放、写 CRM 或生成真实交易动作。 |
| 数据边界 | 外部数据先进入手动导入或只读连接器；联系人、询盘和报价必须保留来源记录。 |
| 报价边界 | AI 只能生成报价草案和门禁报告；真实报价、PI、合同、付款指令必须人工确认。 |
| 沟通边界 | Email、WhatsApp、LinkedIn、站内聊天默认只生成草案；真实外发必须人工确认。 |
| 合规边界 | HS code、证书、认证、目标国准入、税务、外汇、报关不得由 AI 单独定稿。 |
| 学习边界 | 复盘和推荐只能作为建议；不得自动改变预算、折扣、合同条款或销售策略。 |

## 输入输出规范

分支控制包统一使用 `growth_sales_automation_branch.v1`，每个模块必须包含：

| 字段 | 说明 |
| --- | --- |
| `module_id` | 模块唯一标识。 |
| `label` | 面向业务人员显示的模块名称。 |
| `coverage` | `covered`、`partial`、`new_module` 三类覆盖状态。 |
| `current_status` | 当前实现成熟度。 |
| `mapped_stage_ids` | 映射到哪些 `cbx_*` 主流程节点。 |
| `inputs` | 运行该模块需要的输入。 |
| `outputs` | 该模块应产生的标准输出契约。 |
| `hard_boundaries` | 禁止越界的硬规则。 |
| `human_gates` | 必须人工确认的门禁。 |
| `software_refs` | 涉及的软件或能力目录项。 |
| `next_implementation` | 后续实现路径。 |

软件目录统一使用：

| 字段 | 说明 |
| --- | --- |
| `software_id` | 软件或平台标识。 |
| `label` | 显示名称。 |
| `category` | 所属类型。 |
| `default_state` | 必须为 `disabled`。 |
| `allowed_mode` | 仅允许 `manual_research_only`、`read_only_after_debug`、`draft_only`、`blocked_until_manual_enable`。 |
| `required_before_enable` | 手动开启前必须完成的前置检查。 |

## 最小改造方案

本次不重构已有跨境模块，不新增主流程阶段，只补齐以下最小集合：

| 改动 | 作用 |
| --- | --- |
| `schemas/growth-sales-automation-branch.schema.json` | 定义增长销售自动化分支契约。 |
| `templates/growth-sales-automation-branch.template.json` | 记录 5 阶段、19 模块、14 软件目录和实施路径。 |
| `scripts/build-growth-sales-automation-branch.mjs` | 从模板生成运行态控制包、网页控制台和 OS 投影同步信息。 |
| `runtime/growth-sales-automation/branch-control-pack.json` | 主系统和网页读取的分支运行态控制包。 |
| `runtime/growth-sales-automation/dashboard/index.html` | 只读控制与制作网页，可查看进度、查询功能匹配、核对实施路径。 |
| `runtime/control-plane/status/current-status.json.branch_overlays` | 主状态里增加分支 overlay，不改变 `stage_count=16`。 |
| `os-particle-projection.json.branch_overlays` | 星云投影里同步该分支。 |
| `ZhinengConsole.tsx` | 读取 `branch_overlays` 并在实体工作节点下显示分支星点。 |

## 实施路径

| 阶段 | 状态 | 输出 |
| --- | --- | --- |
| P0 流程图核定 | `done` | 本文档和分支契约。 |
| P1 控制包与网页 | `done` | `branch-control-pack.json`、`dashboard/index.html`。 |
| P2 本地草案生成器 | `pending_me` | 市场洞察、线索评分、跟进序列、成交概率、复购推荐等本地草案脚本。 |
| P3 手动数据导入 | `pending_me` | 外部平台 CSV/JSON 导入模板，先人工导入，不自动抓取。 |
| P4 只读连接器 | `pending_user` | 经账号授权、数据合规和调试后，接入只读查询。 |
| P5 受控开启 | `blocked_real_action` | 只有经过人工确认和 preflight 后，才允许外发、报价、CRM 写入等真实动作。 |
| P6 事件学习回路 | `pending_me` | 结果写回 RawEvent/SemanticEvent，形成周报、复盘和策略优化。 |

## 星云同步规则

未来每次调整该分支时，默认执行以下同步链：

```powershell
node cross-border-ecommerce-ai-route/scripts/build-growth-sales-automation-branch.mjs
node cross-border-ecommerce-ai-route/scripts/write-cross-border-status.mjs
node cross-border-ecommerce-ai-route/scripts/validate-cross-border-project.mjs
```

同步结果必须同时更新：

- `runtime/growth-sales-automation/branch-control-pack.json`
- `runtime/growth-sales-automation/dashboard/index.html`
- `runtime/control-plane/status/current-status.json.branch_overlays`
- `os-particle-projection.json.branch_overlays`
- `zhineng-graph` 中 `实体工作节点` 下的分支星点

## 当前结论

该流程图比现有方案更适合描述“外贸增长销售自动化”，但不适合作为跨境电商全链路的唯一主流程。现有 16 节点主流程更适合作为经营、合规、生产、履约和审计的骨架。因此最佳方案是：保留 16 主流程，把流程图升级为一个可控、可查询、可逐步执行的增长销售自动化分支。
