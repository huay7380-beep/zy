# 存储边界与权威产物索引

日期：2026-06-28

本文件定义跨境电商项目的内容归属。后续所有跨境电商业务资料、模板、产品数据和运行产物都以 `cross-border-ecommerce-ai-route/**` 为唯一权威目录。

## 目录边界

| 内容类型 | 权威位置 | 说明 |
| --- | --- | --- |
| 总方案与流程设计 | `cross-border-ecommerce-ai-route/docs/**` | 包括合规、独立站、获客、询盘、报价、品牌替换、责任清单 |
| 节点 manifest | `cross-border-ecommerce-ai-route/nodes/**` | 主系统调度入口和节点目录 |
| 产品系列数据 | `cross-border-ecommerce-ai-route/products/**` | 当前结构化布线产品目录种子和后续产品批次 |
| 产品主数据模板 | `cross-border-ecommerce-ai-route/templates/**` | ProductMaster、询盘、报价、上新清单、客户维护模板 |
| Schema | `cross-border-ecommerce-ai-route/schemas/**` | 当前和后续结构化数据契约 |
| PDF/源头资料 | `cross-border-ecommerce-ai-route/**` 或后续 `source/**` | 产品目录、报价表、证书、图片、视频 |
| 运行产物 | `cross-border-ecommerce-ai-route/runtime/**` | 验证截图、产品导入草案、报价草案、RFQ 解析、客户草案、报告 |
| 新品类自动化产物 | `cross-border-ecommerce-ai-route/runtime/product-automation/**` | 通用产品输入、自动分析、图片任务、产品页、定价、物流、人审包 |
| 主系统控制面产物 | `cross-border-ecommerce-ai-route/runtime/control-plane/**` | 阶段状态、操作入口、人审包、受控执行 preflight、阶段事件 |
| 本地线程规则 | `cross-border-ecommerce-ai-route/AGENTS.md` | 后续线程进入本项目时优先遵守 |

## 禁止位置

不得把新的跨境电商业务内容写入：

- `D:/zhineng/runtime/cross-border-ecommerce/**`
- `D:/zhineng/runtime/**`
- `D:/zhineng/docs/**`
- `D:/zhineng/schemas/**`
- `D:/zhineng/scripts/**`
- `D:/zhineng/packages/**`
- 工作区根目录文件

如果父系统实现阶段必须新增代码或 UI 集成，外部目录只允许保存“最小指针”或“运行适配代码”。业务事实、产品数据、报价草案、客户草案和方案文档仍必须回写到本项目目录。

## 外部系统允许保留的最小指针

| 外部系统 | 允许内容 |
| --- | --- |
| 世界系统三维粒子 OS | 指向 `cross-border-ecommerce-ai-route/nodes/process-manifest.json` 或 `os-particle-projection.json` 的入口、星云标签、状态摘要 |
| 父系统流程树 | 指向本项目 manifest 的节点引用 |
| 自动化脚本 | 读取本项目输入、把输出写回 `cross-border-ecommerce-ai-route/runtime/**` |

外部系统不应复制完整产品主数据、报价逻辑、品牌方案、客户话术库或证书资料。若确需展示，应从本项目读取或生成短摘要。

## 当前已归档产物

| 产物 | 路径 |
| --- | --- |
| 真实星云验证报告 | `cross-border-ecommerce-ai-route/runtime/actual-graph-verification/verification-report.json` |
| 真实星云桌面截图 | `cross-border-ecommerce-ai-route/runtime/actual-graph-verification/entity-work-node-desktop.png` |
| 真实星云移动截图 | `cross-border-ecommerce-ai-route/runtime/actual-graph-verification/entity-work-node-mobile.png` |
| 旧视觉验证截图 | `cross-border-ecommerce-ai-route/runtime/os-visual-verification/entity-work-node-expanded.png` |
| PDF 视觉检查渲染 | `cross-border-ecommerce-ai-route/runtime/pdf-visual-review/**` |
| 项目校验报告 | `cross-border-ecommerce-ai-route/runtime/validations/project-validation-report.json` |
| 自有品牌目录与产品图重构方案 | `cross-border-ecommerce-ai-route/docs/17-brand-catalogue-visual-rebuild-plan.md` |
| 完整链路流程清单 | `cross-border-ecommerce-ai-route/docs/18-full-chain-implementation-checklist.md` |
| 通用新品类自动化蓝图 | `cross-border-ecommerce-ai-route/docs/19-universal-product-autopilot-blueprint.md` |
| 通用产品输入契约 | `cross-border-ecommerce-ai-route/schemas/universal-product-intake.schema.json` |
| 产品自动分析契约 | `cross-border-ecommerce-ai-route/schemas/product-auto-analysis.schema.json` |
| 新品类自动化运行目录 | `cross-border-ecommerce-ai-route/runtime/product-automation/README.md` |
| 主系统控制改造方案 | `cross-border-ecommerce-ai-route/docs/20-main-system-control-integration-plan.md` |
| 阶段控制面契约 | `cross-border-ecommerce-ai-route/schemas/stage-control-surface.schema.json` |
| 阶段控制面模板 | `cross-border-ecommerce-ai-route/templates/stage-control-surface.template.json` |
| 控制面运行目录 | `cross-border-ecommerce-ai-route/runtime/control-plane/README.md` |
| 阶段控制面生成器 | `cross-border-ecommerce-ai-route/scripts/build-stage-control-surfaces.mjs` |
| 跨境阶段执行器 | `cross-border-ecommerce-ai-route/scripts/run-cross-border-stage.mjs` |
| 跨境状态汇总器 | `cross-border-ecommerce-ai-route/scripts/write-cross-border-status.mjs` |
| 16 个阶段控制面 | `cross-border-ecommerce-ai-route/runtime/control-plane/stages/**/stage-control-surface.json` |
| 跨境控制面总状态 | `cross-border-ecommerce-ai-route/runtime/control-plane/status/current-status.json` |

## 后续新增规则

每当新增跨境电商文件，先判断：

1. 是业务内容、产品数据、模板、客户/报价/合规产物吗？如果是，必须放在本项目目录。
2. 是父系统通用代码吗？如果是，可以放父系统目录，但输出必须写回本项目 `runtime/`。
3. 是对外真实执行吗？仍需用户确认和人工门禁。
