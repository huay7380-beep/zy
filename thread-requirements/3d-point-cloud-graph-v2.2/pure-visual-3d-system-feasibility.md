# 纯视觉三维粒子总系统可行性评估

状态：当前线程评估报告，等待用户确认，不是正式项目文档。

评估日期：2026-06-20

## 总结论

可行。

推荐做法是先独立构建一套完整的三维粒子总系统，把它作为全系统的 `Visual World Operating Layer`，即纯视觉观察和操作层；现有人际关系辅助系统暂时不接入或只通过 mock / projection fixture 接入。等三维粒子系统的结构、交互、性能和操作语义稳定后，再通过独立适配接口把当前人际关系辅助系统接入。

这条路径符合当前工程状态，因为现有桌面端已经具备：

- 独立 `zhineng-graph` 浮动窗口。
- `zhineng-dock` 悬浮窗入口。
- `zhineng-console` 控制台。
- `zhineng:graph-state` IPC 推送。
- `pt028_gui_decision_state.v1` 文件监听和 `zhineng:decision-state:changed` 推送。
- 当前粒子图组件、放大窗口、手动旋转缩放和状态展示基础。

因此不需要先改掉当前 UI。可以在现有 UI 旁边做一套新的 3D 粒子系统，完成后再切换入口或接入数据。

## 关键判断

### 可以先做三维粒子系统

可以先实现完整三维粒子层，包括：

- 全局系统粒子宇宙。
- 图谱域云团。
- 子图谱云团。
- 节点、边、事件、变量、预测、能力候选、沙盒验证、安全范围等空间映射。
- 点击、缩放、旋转、下钻、返回、搜索、聚焦、过滤、选择、操作意图生成。
- 运行态、风险态、候选态、冲突态、确认态的视觉区分。

此阶段不需要真实接入人际关系辅助系统，只需要使用 `graph_projection_fixture` 或 mock 数据验证视觉结构。

### 纯视觉可以作为操作层

三维粒子系统可以作为“视觉操作系统”使用，但它的准确定位应是：

`Visual World Operating Layer`

它不是底层操作系统内核，不负责直接写事实、直接发消息、直接控制设备。它负责：

- 观察数据。
- 浏览图谱。
- 理解状态。
- 选择目标。
- 触发操作意图。
- 展示结果。
- 展示风险和反馈。

具体动作仍通过接口发出 `visual_operation_intent`，再由对应系统模块处理。

这样可以做到纯视觉体验，同时不让 UI 变成不可审计的事实源。

### 可以额外做一套接口

可以额外做一套当前系统的适配接口，完成后接入即可。

推荐接口分两类：

1. `graph_projection_vnext`：把各系统事实、候选、预测、运行态转换成三维粒子可读结构。
2. `visual_operation_intent`：把用户在三维粒子系统里的操作转换成系统可执行或可审查的意图。

这两套接口可以先独立于当前人际关系辅助系统实现，后续再加适配器。

## 当前工程接口检查

### 已有 UI 接口

| 现有入口 | 当前作用 | 对新系统的价值 |
| --- | --- | --- |
| `?window=zhineng-graph` | 独立三维图谱窗口 | 可作为新 3D 总系统窗口或旁路窗口基础 |
| `?window=zhineng-dock` | 悬浮粒子图标 | 可作为进入新系统的入口 |
| `?window=zhineng-console` | 操作者控制台 | 可继续保留，不受新系统影响 |
| `zhineng:dock:openGraph` | 从 dock 打开 graph window | 可扩展为打开 vnext 粒子系统 |
| `zhineng:graph-state` | 向 graph window 发送初始状态 | 可扩展为投影数据入口 |
| `zhineng:decision-state:get` | 读取最新 GUI 决策状态 | 可作为人际辅助系统接入适配器来源 |
| `zhineng:decision-state:changed` | 决策状态文件变化推送 | 可作为实时刷新来源 |

### 已有人际系统输出接口

| 现有模块 | 可读输出 | 接入方式 |
| --- | --- | --- |
| `packages/social-graph` | 人物关系、事件线索、进程安排 | 转成 relationship / event / plan 粒子 |
| `packages/decision-cluster` | 决策状态、专家矩阵、草稿、风险 | 转成 decision / expert / gate 粒子 |
| `packages/trigger-engine` | 触发计划和预览 | 转成 action_plan / reminder 粒子 |
| `packages/storage-runtime` | 人物、关系、事件、索引 | 只读 projection adapter |
| `packages/possibility-branch` | 多身份、多事件假设 | 转成 hypothesis / branch 粒子 |
| `packages/tool-runtime` | 工具能力和 dry-run 计划 | 转成 capability / tool / sandbox 粒子 |
| `packages/mvp-runtime` | 闭环报告、状态、审计 | 转成 lifecycle / audit / feedback 粒子 |

### 当前边界

现有 GUI 文档已经明确：

- GUI 是操作者审查层。
- 不替代 `storage-runtime`、`decision-cluster`、`trigger-engine`、`intake-runtime`。
- 真实发送不得因 GUI 确认而直接发生。
- 当前 dock 和 graph 是窗口展示和入口触发。

这些边界与新 3D 系统兼容。新系统可以更强，但仍应通过接口表达操作意图。

## 推荐架构

```text
3D Particle Visual System
  -> Visual Scene Runtime
  -> Graph Projection Adapter
  -> Visual Operation Intent Bus
  -> Existing System Adapters
    -> Social Assistant Adapter
    -> Event Graph Adapter
    -> Tool Capability Adapter
    -> Possibility Forecast Adapter
    -> Sandbox Verification Adapter
  -> Existing Runtime Modules
```

## 独立构建阶段

### Phase 1：纯视觉总系统骨架

目标：

- 不接真实业务数据。
- 不改现有人际系统。
- 不影响当前 GUI。

实现内容：

- 新建独立 3D 粒子运行时。
- 定义全局图谱域云团。
- 定义节点类型、边类型、状态类型。
- 支持旋转、缩放、平移、下钻、返回、聚焦。
- 支持 mock 数据展示完整总目标系统。

验证：

- 视觉非空。
- 粒子细腻。
- 大小屏适配。
- 操作流畅。
- 不影响现有 `zhineng-console` 和 `zhineng-dock`。

### Phase 2：投影契约

目标：

- 定义 `graph_projection_vnext`。

最小结构：

```json
{
  "schema_version": "graph_projection_vnext.v1",
  "projection_id": "projection_mock_001",
  "generated_at": "2026-06-20T23:59:00+08:00",
  "domains": [],
  "nodes": [],
  "edges": [],
  "clusters": [],
  "runtime_overlays": [],
  "operation_affordances": [],
  "source_refs": []
}
```

必须支持的节点类型：

- `person`
- `relationship`
- `event`
- `task`
- `knowledge`
- `object`
- `self_state`
- `learning_process`
- `decision`
- `action`
- `feedback`
- `external_capability`
- `capability_slice`
- `composition_plan`
- `sandbox_verification`
- `forecast_branch`
- `variable`
- `safety_scope`
- `safety_review`

### Phase 3：操作意图接口

目标：

- 让三维粒子不只是看，还能操作。

建议结构：

```json
{
  "schema_version": "visual_operation_intent.v1",
  "intent_id": "visual_intent_001",
  "created_at": "2026-06-20T23:59:00+08:00",
  "source_surface": "3d_particle_system",
  "target_node_ref": "node_person_001",
  "operation_type": "focus | inspect | drill_down | create_candidate | run_sandbox | request_projection | open_existing_module",
  "payload": {},
  "execution_mode": "visual_only | sandbox_candidate | existing_module_handoff",
  "requires_adapter": true
}
```

操作原则：

- UI 只发意图。
- 事实写入由下游模块决定。
- 当前人际系统接入前，所有操作只作用于 mock / projection。
- 接入后，操作先进入 adapter，不直接改业务数据。

### Phase 4：人际辅助系统只读接入

目标：

- 将现有人际关系辅助系统映射到新 3D 系统，但不影响当前正常使用。

接入来源：

- `pt028_gui_decision_state.v1`
- `social-graph` 输出。
- MVP status dashboard。
- possibility branch。
- tool-runtime dry-run result。
- runtime audit/status。

接入方式：

```text
existing_social_assistant_outputs
  -> social_assistant_projection_adapter
  -> graph_projection_vnext
  -> 3d_particle_visual_system
```

此阶段只读，不回写。

### Phase 5：人际辅助系统操作接入

目标：

- 3D 中选择人物、关系、事件、策略或草稿后，可以打开或触发现有模块。

示例：

- 点击人物云团 -> 打开人物详情。
- 点击关系边 -> 查看关系策略卡。
- 点击事件 -> 查看证据和回写状态。
- 点击草稿 -> 打开现有控制台审查区。
- 点击触发计划 -> 交给 `trigger-engine` 预览。

仍然不直接发送、不直接写事实。

### Phase 6：切换为主入口

当新系统达到以下条件后，可以让三维粒子系统成为主入口：

- 视觉系统稳定。
- 投影契约稳定。
- 现有人际辅助系统适配完整。
- 操作意图可审计。
- 当前 GUI 功能不丢失。
- 关键路径可回退到旧控制台。

## 纯视觉操作系统的可行边界

### 可行

- 用三维粒子表达系统全局结构。
- 用空间层级表达图谱域、云团、实体和证据。
- 用颜色、密度、运动、粒径、连线表达状态。
- 用点击、拖拽、缩放、框选、聚焦、路径回放表达操作。
- 用节点详情和视觉面板完成低文本操作。
- 用操作意图接口连接已有系统。

### 不建议

- 不建议让三维粒子 UI 直接写事实源。
- 不建议把所有复杂字段都藏在视觉效果里。
- 不建议一开始就替换当前控制台。
- 不建议先接真实人际数据再做大规模视觉结构。

### 需要保留的非视觉结构

即使采用纯视觉实现，底层仍需要：

- 投影契约。
- 操作意图契约。
- source_refs。
- 审计记录。
- 状态回放。
- 测试数据。
- 性能指标。

纯视觉是交互方式，不是取消数据契约。

## 对当前 UI 的影响评估

影响低。

原因：

- 当前已有独立 graph window。
- 当前 console 和 dock 可以继续运行。
- 可以新增 vnext 组件或窗口路由，不动当前 graph。
- 可以先使用 mock projection，不读写现有业务数据。
- 当前 `zhineng:dock:openGraph` 可在后续切换到新窗口。

推荐命名：

- `ZhinengParticleOS`
- `graph_projection_vnext`
- `visual_operation_intent`
- `social_assistant_projection_adapter`

## 推荐实现顺序

1. 新建 3D 粒子系统草图，不接真实数据。
2. 定义 mock `graph_projection_vnext`。
3. 建立视觉域：全局、图谱域、云团、节点、边、运行态。
4. 建立交互：旋转、缩放、下钻、返回、聚焦、选择。
5. 建立 `visual_operation_intent`。
6. 接入当前人际系统只读投影 adapter。
7. 接入现有 `zhineng:decision-state` 状态。
8. 接入 social graph / event / decision / trigger / feedback。
9. 保留旧 GUI 回退入口。
10. 通过验证后再考虑切换主入口。

## 验证要求

视觉验证：

- 桌面窗口非空。
- 粒子细腻，不是粗颗粒球。
- 下钻后仍保持运行态。
- 操作不卡顿。
- hover / click 不遮挡。
- 当前 dock 和 console 正常。

接口验证：

- mock projection 能渲染。
- 真实 projection adapter 缺失时能降级。
- 操作意图只生成 intent，不直接写事实。
- 旧系统输出能被映射为节点。

回归验证：

- `sightflow-desktop-agent-main` 类型检查。
- 根项目 GUI 报告。
- 流程树校验。
- 后续正式接入时再跑相关 `social-graph`、`decision-cluster`、`trigger-engine`、`mvp-runtime` 测试。

## 评估结论

可行性：高。

推荐策略：

- 先独立实现三维粒子总系统。
- 当前 UI 保持可用。
- 通过新接口层与现有系统隔离。
- 完成后把人际关系辅助系统作为第一个真实子系统接入。
- 接入前先做接口、匹配方式和边界检查。

最终形态：

```text
3D Particle Visual OS
  -> Observe global system data
  -> Operate through visual intents
  -> Connect current social assistant as first real module
  -> Expand to perception, learning, capability composition, forecast and safety graphs
```

这条路线能最大化保护当前已完成的人际关系辅助系统，同时允许你用三维粒子完整构建总目标系统。
