# 3D 粒子规则与巡检桥接阶段计划

本计划基于当前目标：先建立可执行的底层治理约束，再逐步完善空间显示规则，最后接入主 3D 页面。

## Phase 0：当前约束落地

目标：确认 3D 粒子模块不是业务事实源，对话模块不直接读取业务模块。

产物：

- `rules/current-bottom-constraints.md`
- `rules/dialogue-patrol-bridge-contract.md`
- `rules/module-projection-lifecycle.md`
- `registry/source-projection-index.json`
- `registry/module-projection-requirements.json`
- `templates/module-os-particle-projection.template.json`

验收：

- 能说明对话模块只能读巡检状态面。
- 能说明业务模块必须声明 3D 投影或豁免。
- 能说明 3D 粒子层只读、聚合、显示，不写事实层。

## Phase 1：统一入口确认

目标：所有可见模块的 3D 投影来源进入统一索引。

动作：

- 登记已有 projection：
  - `capability-upgrade-registry/os-particle-projection.json`
  - `cross-border-ecommerce-ai-route/os-particle-projection.json`
  - `dialogue-system-patrol/os-particle-projection.json`
- 标记旧主 3D 页面渲染源：
  - `sightflow-desktop-agent-main/src/renderer/src/zhineng-console/ZhinengConsole.tsx`
- 对尚未声明的可见模块标记为 `projection_missing_or_exempt_pending`。

验收：

- 入口索引能区分 source projection、runtime projection、current renderer、draft preview。

## Phase 2：巡检 gate 扩展设计

目标：让巡检模块在 module onboarding gate 中检查粒子投影声明。

新增检查建议：

- `3d_projection_declared`
- `3d_projection_source_registered`
- `3d_projection_source_only`
- `3d_projection_status_feedback_refs_present`
- `3d_projection_exemption_valid`

验收：

- 缺少 projection 声明不会影响业务运行，但会阻止模块被报告为 3D 可见。
- 对话模块仍然只读巡检状态面。

## Phase 3：投影聚合快照

目标：由 `3d-particle-display-os` 生成统一显示快照，供预览页和未来主页面读取。

建议快照：

```text
runtime/3d-particle-display-os/particle-display-snapshot.json
```

快照来源：

- source projection index
- module projection files
- patrol status cards/events
- dialogue read index

验收：

- 快照不写业务事实。
- 快照包含 source refs 和 status feedback refs。
- 快照可以被 v3 预览或未来主页面消费。

## Phase 4：空间规则稳定化

目标：从 v2/v3 预览中沉淀稳定的空间布局规则。

候选规则：

- 中心：世界核心
- 内圈：8 个认知处理扇区
- 外圈：软件、项目、需求、端口
- 距离：目标相关性
- 高度：时间/认知阶段
- 大小：重要性
- 亮度：活跃度
- 边界/脉冲：风险或等待确认

验收：

- 规则不再只存在于 JS 预览文件中。
- 每个规则都有字段来源和解释路径。

## Phase 5：主 3D 页面接入

目标：逐步替换主页面中散点式布局为统一 projection snapshot 消费。

迁移对象：

- `WORLD_SYSTEM_NEBULAE`
- `buildGraphPoints`
- `makeSemanticParticleCloud`
- `ExpandedGraphCanvas`

原则：

- 先兼容旧数据。
- 只替换显示层。
- 不改变业务模块输入输出。
- 不绕过巡检模块读取状态。

验收：

- 主 3D 页面能显示统一投影快照。
- 旧 19 个世界系统星云可映射到新规则。
- 业务模块无需加载 3D 渲染逻辑。
