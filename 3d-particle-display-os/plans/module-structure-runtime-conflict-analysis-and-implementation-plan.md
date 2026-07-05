# 3D Particle Display OS 模块结构、运行逻辑与约束接入计划

日期：2026-07-05

## 结论

`3d-particle-display-os` 当前不是业务运行时模块，也不是主系统事实源。它现在承担四个角色：

1. 3D 粒子显示规则孵化区。
2. 3D 投影入口和源文件登记区。
3. 预览与原型验证区。
4. 未来主 3D 页面接入的适配计划区。

当前系统其他模块没有出现必须立即阻断的硬冲突，但存在多个迁移缺口：

- 主 3D 页面仍使用 `WORLD_SYSTEM_NEBULAE` 和 `buildGraphPoints` 的硬编码布局，没有消费 `3d-particle-display-os/registry/source-projection-index.json`。
- 已有 `os-particle-projection.json` 文件格式不统一，尚未满足 `module-projection-requirements.json` 的最小字段要求。
- 巡检模块已有 module gate、source drift、status card、status event、dialogue read index，但还没有把 `3d_projection_declared` 作为 gate 检查项。
- 现有 `schemas/nebula-projection.schema.json` 面向关系/事件图谱，`allowed_node_types` 只覆盖 `person/source/event/tag/confirmation_gate`，还不能作为全局软件/项目/端口投影 schema。
- 对话模块已有通过 status cards、status events、patrol index 读取状态的路径，但主 3D 图仍是显示层硬编码，不受新投影索引约束。

因此下一步不应直接替换主 3D 页面，而应先实现“兼容扫描 + 投影适配 + 巡检 gate 扩展设计”。

## 当前模块结构

```text
3d-particle-display-os/
  README.md
  CONFIG.md
  lens.config.json
  original-system-region-map.json
  cognitive-lens-plan.md

  rules/
    README.md
    current-bottom-constraints.md
    dialogue-patrol-bridge-contract.md
    module-projection-lifecycle.md

  registry/
    source-projection-index.json
    module-projection-requirements.json

  templates/
    module-os-particle-projection.template.json

  plans/
    staged-rule-construction-plan.md
    module-structure-runtime-conflict-analysis-and-implementation-plan.md

  previews/
    cognitive-sector-layout.html
    cognitive-sector-layout-v2.html
    cognitive-sector-layout-v3.html
    local-preview-server.mjs

  prototype/
    index.html
    app.js
    styles.css

  migration/
    source-inventory.json
    zhineng-graph-migration-plan.md
```

## 当前运行逻辑

### 已能运行的部分

- `previews/local-preview-server.mjs`：本地静态预览服务器。
- `previews/cognitive-sector-layout-v2.html`：三维体积扇区预览。
- `previews/cognitive-sector-layout-v3.html`：中心核心 + 内圈八扇区 + 外圈落地对象预览。
- `prototype/index.html`：早期五 Lens 静态原型。

### 只读规则与索引

- `rules/**`：记录当前治理约束，不执行巡检、不执行渲染。
- `registry/source-projection-index.json`：登记 3D OS 允许读取的 source-only 投影入口。
- `registry/module-projection-requirements.json`：定义未来模块投影声明应满足的最小字段。
- `templates/module-os-particle-projection.template.json`：给未来模块创建 `os-particle-projection.json` 的模板。

### 当前没有做的事

本模块当前不：

- 接入 Electron IPC。
- 读取 `data/people/**` 或 `data/events/**`。
- 读取业务模块未登记运行态。
- 写业务事实。
- 触发工具、自动化或外部动作。
- 替代 `dialogue-system-patrol` 对对话模块提供状态。

## 相关模块检查

### dialogue-system-patrol

当前基本符合本模块约束。

已具备：

- strict required coverage。
- source drift 检查。
- module onboarding gate。
- `runtime/status-cards/**`。
- `runtime/status-events/**`。
- `runtime/dialogue-system-patrol/dialogue-read-index.json`。
- `dialogue-system-patrol/os-particle-projection.json`。
- `system-patrol:maintain` 和 `system-patrol:enforce`。

缺口：

- module gate 尚未检查 `3d_projection_declared`。
- `dialogue-system-patrol/os-particle-projection.json` 内的 `projection.writes` 容易与“projection 不写事实”产生歧义。它实际描述巡检发布输出路径，建议未来改名为 `published_output_refs` 或 `status_output_refs`。
- projection 文件缺少统一要求中的 `projection_enabled`、`sector_hint`、`layer_role`、`allowed_operation_intents`、`forbidden_operations` 等字段。

### sightflow-desktop-agent-main / zhineng graph

存在迁移缺口，但不是当前硬冲突。

当前主 3D 页面仍由以下逻辑驱动：

- `WORLD_SYSTEM_NEBULAE`
- `buildGraphPoints`
- `makeSemanticParticleCloud`
- `ExpandedGraphCanvas`

它使用硬编码模块、golden angle、weight、importance、layer 等计算三维位置，没有读取本模块的 `source-projection-index.json`。

对话状态读取侧是相对兼容的：

- `zhineng:status-dialogue:snapshot:get`
- `zhineng:status-dialogue:events:get`
- `zhineng:status-dialogue:patrol-index:get`

这些 IPC handler 对应 status snapshot、status events、patrol index，而不是直接让对话模块扫描业务模块。

缺口：

- 主 3D 页面不是统一 projection snapshot 消费者。
- 主 3D 页面不能证明每个显示节点来自已登记 projection。
- 旧 `WORLD_SYSTEM_NEBULAE` 需要兼容映射到未来统一投影快照。

### capability-upgrade-registry

当前 projection 边界方向正确，但格式不满足统一要求。

符合：

- `source_only: true`
- 禁止直接替换代码、直接写 runtime、直接执行外部命令。
- 有 decision/self/memory/system Lens 语义。

缺口：

- 缺少 `projection_enabled`。
- 缺少 `writes_fact_state`。
- 缺少 `sector_hint` / `layer_role`。
- 缺少 `status_feedback_refs`。
- `forbidden_outputs` 需要兼容映射为 `forbidden_operations`。
- `output_contracts` 需要兼容映射为 `allowed_operation_intents`。

### cross-border-ecommerce-ai-route

当前 projection 信息丰富，但不是统一模块投影格式。

符合：

- 明确 `projection_only`。
- 明确禁止真实外部发送、报价发送、付款指令、报关税务。
- 有实体工作节点、项目 flow、branch overlay 和安全策略。

缺口：

- 顶层缺少 `module_id` / `display_name` / `source_only` / `writes_fact_state`。
- 缺少 `projection_enabled`。
- 缺少 `status_feedback_refs`。
- `sync_targets` 包含主 renderer 和项目文档，容易被误读为投影可以同步写目标；需要在兼容层解释为“人工维护/引用目标”，不是 projection 执行目标。
- 大量 runtime refs 可以显示，但不能直接作为对话模块状态真源。

### relationship-event-graph / nebula projection schema

当前是关系事件图谱专用投影，不适合作为全局模块投影协议。

符合：

- `source_only: true`
- `writes_fact_state: false`
- `visual_operation_intent` 边界存在。

缺口：

- `allowed_node_types` 只支持 `person/source/event/tag/confirmation_gate`。
- 不覆盖 `package/project/port/demand/runtime_status/visual_surface`。
- 可以作为关系事件图谱投影继续保留，但不能直接约束 3D Particle Display OS 的所有模块投影。

### packages/*

业务 package 本身读写业务数据不构成本模块约束冲突。

原因：

- 本模块约束的是“对话模块和 3D 粒子模块不能绕过巡检直接读取业务状态”。
- 业务模块可以按自身职责读写自己的数据。
- 未来只要求业务模块提供 `os-particle-projection.json` 或豁免声明，不要求业务模块运行 3D 渲染逻辑。

需要注意：

- 如果某个业务模块希望被对话模块描述为“当前状态”，它必须经过 patrol block、status card、status event 和 dialogue read index。
- 如果某个业务模块希望被 3D 显示为“已接入”，它必须进入 source projection index 或声明豁免。

## 冲突矩阵

| 项目 | 当前状态 | 判断 | 处理方式 |
| --- | --- | --- | --- |
| 对话模块通过巡检读取状态 | 已有 snapshot/events/patrol-index 路径 | 兼容 | 保持，后续禁止绕过巡检 |
| 主 3D 页面硬编码布局 | 仍存在 | 迁移缺口 | 后续用 projection snapshot 逐步替代 |
| 已有 os-particle-projection 格式不统一 | 已存在 | 迁移缺口 | 建兼容适配器，不立即强制改 |
| 巡检 gate 未检查 3D projection | 未实现 | 迁移缺口 | 设计并新增 gate 检查 |
| 关系事件 nebula schema 范围窄 | 已存在 | 可接受差异 | 保留专用 schema，另建模块投影 schema |
| cross-border projection 有 sync_targets | 已存在 | 语义风险 | 在适配层标记为 reference-only |
| 3D 模块读取业务运行态 | 未发现当前行为 | 无冲突 | 保持禁止 |
| 3D 模块触发业务动作 | 未发现当前行为 | 无冲突 | 保持禁止 |

## 实现目标计划

### Phase 1：兼容审计器

目标：在不改其他模块的情况下，让本模块能检查现有投影文件和统一要求之间的差距。

新增建议：

```text
3d-particle-display-os/scripts/audit-source-projections.mjs
runtime/3d-particle-display-os/projection-audits/latest.json
runtime/3d-particle-display-os/projection-audits/latest.md
```

检查项：

- source path 是否存在。
- JSON 是否可解析。
- 是否 source-only。
- 是否明确 `writes_fact_state=false` 或可兼容推断。
- 是否包含 `status_feedback_refs` 或可通过巡检 registry 推导。
- 是否包含 allowed/forbidden operation。
- 是否被登记到 `source-projection-index.json`。

验收：

- 不修改其他模块。
- 输出 missing fields 和 compatibility notes。
- 能区分硬错误、迁移缺口、可接受旧格式。

### Phase 2：投影兼容适配器

目标：把旧投影格式转换成统一内部形态，供预览和未来主页面消费。

新增建议：

```text
3d-particle-display-os/scripts/build-projection-snapshot.mjs
runtime/3d-particle-display-os/particle-display-snapshot.json
runtime/3d-particle-display-os/particle-display-snapshot.md
```

输入：

- `registry/source-projection-index.json`
- 已登记的 `os-particle-projection.json`
- `runtime/status-cards/**`
- `runtime/status-events/**`
- `runtime/dialogue-system-patrol/dialogue-read-index.json`

输出：

- normalized modules
- normalized nodes
- normalized edges
- status feedback refs
- source refs
- boundary warnings
- compatibility notes

验收：

- 快照只读。
- 快照不写业务事实。
- 快照明确每个节点状态来自巡检状态面还是 projection source。

### Phase 3：巡检 gate 扩展设计

目标：让巡检模块后续能检查模块是否声明 3D 投影或豁免。

建议新增 gate checks：

- `3d_projection_declared`
- `3d_projection_source_registered`
- `3d_projection_source_only`
- `3d_projection_status_feedback_refs_present`
- `3d_projection_exemption_valid`

建议先只做 warning，再升级 required：

```text
incubation: warning
confirmed: required
strict: blocking
```

验收：

- 不影响业务运行性能。
- 不要求业务模块加载 3D 渲染。
- 缺少 projection 时只影响“3D 可见”和“对话可说 3D 已接入”的资格。

### Phase 4：模块投影模板落地

目标：让新模块从创建时就带 3D 投影声明或豁免声明。

动作：

- 将 `templates/module-os-particle-projection.template.json` 作为推荐模板。
- 在巡检 scaffold 文档中引用模板。
- 新模块完成 process-tree + patrol scaffold 后，同步创建 projection 声明。

验收：

- 新模块不再依赖 3D 模块反复提醒。
- 模块创建路径里自然包含 3D 可见性声明。

### Phase 5：主 3D 页面接入

目标：让 `ZhinengGraphWindow` 逐步消费统一快照，而不是直接依赖硬编码 `WORLD_SYSTEM_NEBULAE`。

步骤：

1. 保留旧 `WORLD_SYSTEM_NEBULAE`。
2. 新增 projection snapshot loader。
3. 将旧 19 个星云映射成 normalized projection nodes。
4. 保持 `ExpandedGraphCanvas` 渲染能力。
5. 替换 `buildGraphPoints` 的布局来源。
6. 引入 v3 双层结构布局规则。

验收：

- 主 3D 页面仍可打开。
- 旧节点不丢失。
- 新 projection source 可以进入外圈落地对象。
- 对话模块仍只通过巡检状态读取模块状态。

## 当前建议的优先级

1. 先做 Phase 1 兼容审计器。
2. 再做 Phase 2 projection snapshot。
3. 然后扩展巡检 gate。
4. 最后接入主 3D 页面。

不要现在直接改主 3D 页面。当前最容易出问题的是旧投影格式不统一，如果先改主页面，会把显示逻辑和数据治理问题绑在一起。

## 成功标准

当本模块目标实现后，应满足：

- 任何可见模块都有 projection 声明或豁免。
- 对话模块只通过巡检状态面描述模块状态。
- 3D 粒子模块只消费登记的 source-only projection。
- 巡检模块能发现 projection 缺失、过期或越界。
- 主 3D 页面能消费统一快照。
- 业务模块运行路径不加载 3D 渲染逻辑。
