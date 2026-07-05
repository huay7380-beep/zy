# zhineng-graph 主展示迁移计划

## 目标

将 `http://[::1]:5173/?window=zhineng-graph` 作为 3D 粒子显示 OS 的主展示母版，并把可复用的显示逻辑逐步迁移到 `3d-particle-display-os`。

当前阶段只做隔离迁移，不修改原系统代码。

## 已确认的原页面结构

只读查看原页面后，主展示包含：

- `ZhinengGraphWindow`
- `ExpandedGraphCanvas`
- `WORLD_SYSTEM_NEBULAE`
- `graphEdges`
- `makeSemanticParticleCloud`
- `Subject Status Dialogue`
- 星云目录
- 焦点粒子检查器
- 底部世界系统主方案映射

当前真实页面状态：

- 1 个 Three.js canvas
- 19 个星云模块
- 258 个内容星点
- 状态对话面板为只读巡逻窗口
- 当前边界为独立视觉投影，不读取真实人际和事件图谱

## 已迁移到隔离目录的内容

- `prototype/index.html`：改为 `zg-graph` 母版式结构。
- `prototype/styles.css`：改为全幅三维舞台 + 左右浮层面板 + 底部映射说明。
- `prototype/app.js`：保留无依赖三维投影，加入 19 个原系统星云模块和实体工作节点子云。
- `original-system-region-map.json`：记录原系统星云到六个认知区域的映射。
- `lens.config.json`：记录主展示采用 `rotatable_3d_static_base_map_with_dynamic_overlays`。

## 迁移顺序

### Phase 1：视觉母版迁移

把原页面结构迁移为隔离原型：

- 顶部标题和操作区。
- 中央三维粒子舞台。
- 左侧焦点检查器和星云目录。
- 右侧主体状态对话面板。
- 底部全局映射条。

当前已完成第一版。

### Phase 2：数据定义迁移

将 `WORLD_SYSTEM_CENTER`、`WORLD_SYSTEM_NEBULAE`、星点、边、owner、gate、compass、io refs 抽成独立 JSON 或 TS 数据文件。

目标文件建议：

- `data/world-system-nebulae.json`
- `data/world-system-edges.json`
- `data/status-dialogue-projection.json`

### Phase 3：渲染逻辑迁移

将原页面的 Three.js 渲染规则迁移到隔离目录：

- 粒子云构建。
- semantic particle cloud。
- 鼠标 hover/click 焦点。
- flow particles。
- ArcballControls 或等价相机控制。

目标文件建议：

- `prototype/three-graph.html`
- `src/graph-points.js`
- `src/semantic-cloud.js`
- `src/graph-renderer.js`

### Phase 4：Lens 化

把用户要求的五种 Lens 做成原页面主视图上的覆盖层：

- System：原系统星云和核心结构。
- Thinking：认知流和激活路径。
- Memory：状态快照、事件链、反馈记忆。
- Decision：候选、风险、审查、意志治理。
- Self：状态对话、视觉契约、安全边界。

Lens 不再是独立图，而是 `zhineng-graph` 的显示开关。

### Phase 5：只读接入

当需要真实接入时：

- 显示层只读取 `graph_projection_vnext.v1`。
- 用户操作只输出 `visual_operation_intent.v1`。
- 不直接读取或写入人际图谱、事件图谱、runtime state。
- 不直接触发工具、发送、自动化或外部动作。

## 不迁移的内容

以下内容暂不迁移：

- Electron IPC。
- 真实状态对话模型调用。
- 语音输入输出。
- 外部工具执行。
- 真实图谱读写。

它们只作为可视化边界和未来接口显示。

