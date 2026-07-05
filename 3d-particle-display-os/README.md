# 3D Particle Display OS

这个文件夹是世界系统三维需求 OS 的独立显示构建区，用来验证“认知流可视化”的 3D 粒子云显示方式。

它不修改现有 `sightflow-desktop-agent-main`、`packages`、`schemas`、`runtime`、`data` 目录中的任何文件，也不接入真实人际图谱、事件图谱、执行器或外部端口。

## 目录内容

- `cognitive-lens-plan.md`：真实应用到当前系统的分层方案。
- `CONFIG.md`：Lens 配置说明与后续扩展规则。
- `lens.config.json`：五种显示 Lens 的独立配置样例。
- `original-system-region-map.json`：原系统 19 个 `WORLD_SYSTEM_NEBULAE` 模块到六个分类区域的只读投射关系。
- `migration/zhineng-graph-migration-plan.md`：以真实 `zhineng-graph` 为主展示母版的迁移计划。
- `migration/source-inventory.json`：原页面、源码符号和运行结构的只读盘点。
- `previews/cognitive-sector-layout.html`：世界核心八扇区认知布局的理想预览页。
- `prototype/index.html`：同一界面展示五种 Lens 的静态显示原型。
- `prototype/styles.css`：原型界面样式。
- `prototype/app.js`：原型显示逻辑和样例投影数据。

## 五种 Lens

本实验区把 3D 粒子云拆成五个可开关图层：

1. `system`：系统结构 Lens，显示世界系统模块、端口和边界。
2. `thinking`：思维流 Lens，显示当前目标、推理扩散和激活路径。
3. `memory`：记忆 Lens，显示历史、当前状态和未来计划的时间关系。
4. `decision`：决策 Lens，显示候选方案、风险、冲突和权重。
5. `self`：自我状态 Lens，显示目标、约束、权限、输入输出边界。

## 使用方式

直接打开：

```text
D:\zhineng\3d-particle-display-os\prototype\index.html
```

理想八扇区布局预览：

```text
D:\zhineng\3d-particle-display-os\previews\cognitive-sector-layout.html
```

界面左侧可以开关五种 Lens。右侧检查器显示当前选中粒子的语义、重要性、置信度、激活度和端口边界说明。

当前原型已经调整为“以 zhineng-graph 为主展示母版 + 动态 Lens 覆盖”的整合表达：

- 静态层：目标核心、六个分类区域、原系统 19 个星云模块、实体工作节点子云、输入输出端口。
- 动态层：思维流、决策候选、风险冲突、记忆时间轴、自我约束。
- 五种 Lens 不是五张互不相关的图，而是在同一个模块地图中叠加显示。
- 三维交互：鼠标拖拽旋转、滚轮缩放，顶部可复位视角或切到俯视。

## 不影响原系统的边界

这个文件夹只是一套显示方案和静态原型：

- 不注册 Electron 窗口。
- 不监听或发送 IPC。
- 不读取 `data/people/**`、`data/events/**`、`runtime/state/**`。
- 不写入业务 schema。
- 不触发真实动作、工具调用或外部自动化。
- 不替换现有 `ExpandedGraphCanvas` 或 `ZhinengGraphWindow`。
- 原系统代码只作为只读映射来源，不由此文件夹写回。

未来如果要接入当前系统，应通过投影适配器把真实数据转换成 `graph_projection_vnext.v1`，再由显示层读取；显示层最多产生 `visual_operation_intent.v1`，不能直接改事实源。

## Capability Upgrade Registry Projection

- Source: `capability-upgrade-registry/os-particle-projection.json`
- Particle node: `capability-upgrade-registry`
- Region: `execution`, with secondary visibility in `memory`, `decision` and `self` lenses.
- Boundary: source-only display. The 3D OS can show candidate projects, evaluation evidence, replacement tradeoffs and confirmation gates, but it must not directly replace code, write runtime state, execute external commands or send to real platforms.
- Patrol rule: `npm run capability:patrol` writes read-only `capability_patrol_report.v1` snapshots that decompose current process inputs, outputs, latency/effectiveness concerns, optimization signals and analogical search tasks.
- Upgrade rule: any real module replacement must first pass process decomposition, input/output consistency checks, latency/effectiveness evidence, analogical candidate confirmation and a `capability_replacement_plan.v1` with dry-run, tests, rollback, previous-requirements alignment and human confirmation.

## Entity Work Nodes Projection

- Source: `cross-border-ecommerce-ai-route/os-particle-projection.json`
- Particle node: `entity-work-nodes`
- Nebula name: `实体工作节点`
- Current child project: `跨境电商通路`
- Region: `execution`, displayed as a source-only entity work nebula.
- Interaction: open `prototype/index.html`, click `实体工作节点`, then inspect the expanded cross-border ecommerce particle cloud.
- Boundary: display and drill-down only. The particle OS can show node status, source docs, templates and manifest paths, but must not send customer messages, quotes, payment instructions, customs declarations, tax filings or external platform actions.

## Volumetric Cognitive Sector Preview v2

- Preview page: `previews/cognitive-sector-layout-v2.html`
- Plan: `previews/cognitive-sector-layout-v2-plan.md`
- Local server: `node previews/local-preview-server.mjs 5199`
- Browser URL after starting the server: `http://[::1]:5199/3d-particle-display-os/previews/cognitive-sector-layout-v2.html`
- Purpose: validate a true 3D world-core-centered layout with volumetric sectors, nebula spacing, animated thinking/decision/feedback flows, and click-to-open sub-clouds.
- Boundary: this remains an isolated display prototype. It does not modify `sightflow-desktop-agent-main`, runtime state, schemas, data, IPC, or external execution ports.

## Dual-Layer Cognitive Landing Preview v3

- Preview page: `previews/cognitive-sector-layout-v3.html`
- Plan: `previews/cognitive-sector-layout-v3-plan.md`
- Browser URL after starting the local server: `http://[::1]:5199/3d-particle-display-os/previews/cognitive-sector-layout-v3.html`
- Purpose: validate the structure where the world core is surrounded by 8 inner cognitive processing sectors, while current system packages, software, projects, demands and ports sit in the outer landing ring.
- Boundary: isolated display prototype only. The inner sectors express logic order; the outer ring expresses implementation targets. It does not modify or execute original system modules.

## Rule Incubation And Patrol Bridge

- Rule center entry: `rules/README.md`
- Current bottom constraints: `rules/current-bottom-constraints.md`
- Dialogue/patrol bridge contract: `rules/dialogue-patrol-bridge-contract.md`
- Module projection lifecycle: `rules/module-projection-lifecycle.md`
- Staged construction plan: `plans/staged-rule-construction-plan.md`
- Structure/runtime conflict analysis and implementation plan: `plans/module-structure-runtime-conflict-analysis-and-implementation-plan.md`
- Source projection index: `registry/source-projection-index.json`
- Module projection requirements: `registry/module-projection-requirements.json`
- Module projection template: `templates/module-os-particle-projection.template.json`

Current governance rule: the dialogue module must not directly inspect business modules for state. Module state should flow through `dialogue-system-patrol` status cards, status events, module gates and the dialogue read index. The 3D Particle Display OS consumes registered source-only projections and patrol status references for display; it must not become the business fact source or an execution path.
