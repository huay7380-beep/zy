# 人际关系辅助系统融合评估报告

状态：当前线程评估报告，等待用户确认，不是正式项目文档。

评估日期：2026-06-20

评估对象：

- 当前目标导向型人类社交辅助系统。
- 当前线程新增的大系统能力：全域事件图谱、世界模型、学习引擎、外部能力转需求、能力拼接、可能性预测、意识治理、末端安全和 3D 点云投影。

## 总结论

当前人际关系辅助系统可以完整映射到新的大系统中，并适合作为大系统的 `Social Cognition and Interaction Module`。

融合方式应是：

- 不替换现有人际关系辅助系统。
- 不打断现有 B2B 商务沟通和客户跟进闭环。
- 不把新系统的沙盒探索直接写入现有生产图谱。
- 通过只读上下文、事件接口、策略接口、触发接口、反馈回写接口和 3D 投影接口并入大系统。

也就是说，人际关系辅助系统不是被吞并，而是成为大系统中的稳定子系统。

## 当前人际关系辅助系统的现有闭环

根据本地项目文件，当前系统已经形成：

```text
用户目标
-> 人物关系
-> 身份映射
-> 事件记录
-> 决策建议
-> 触发计划
-> 平台快照验证 / 受控发送预览
-> 反馈
-> 回写
-> 索引重建
-> 审计与状态看板
```

关键现有模块：

| 现有模块 | 现有职责 | 可映射到大系统的位置 |
| --- | --- | --- |
| `packages/social-graph` | 人物关系、事件线索和进程安排第一版规则运行时 | 人际图谱 / 社会认知模块 |
| `packages/identity-resolution` | 渠道身份、人物候选和确认队列 | 世界模型层的实体解析 |
| `packages/storage-runtime` | 人物、关系、事件、索引、审计 | 事实源 / 图谱记忆层 |
| `packages/decision-cluster` | 目标、关系、事件、偏好、专家矩阵和草稿建议 | 决策层 / 社会策略专家矩阵 |
| `packages/trigger-engine` | 触发计划、预览、阻断 | 行动计划层 |
| `packages/intake-runtime` | 多来源只读 observation、来源能力和导入门禁 | 感知层 / 数字上下文传感器 |
| `packages/tool-runtime` | 外部工具能力登记、dry-run 调用计划和桥接 | 外部能力转需求图谱的现有雏形 |
| `packages/possibility-branch` | 多身份、多事件、嵌套事件可能性分支 | 可能性预测图谱的现有雏形 |
| `packages/mvp-runtime` | 串联导入、决策、触发、反馈、报告、审计 | 闭环编排层 |
| Sightflow GUI / 悬浮窗 | GUI 状态、悬浮窗和桌面上下文展示 | 3D 点云 / UI 投影层 |

## 与新大系统的映射关系

### 1. 人际图谱映射

现有人际关系图谱映射为大系统中的一个稳定图谱域：

```text
World Model Layer
  -> Social Cognition and Interaction Module
    -> people
    -> relationships
    -> relationship_edges
    -> relationship_policy
    -> relationship_events
    -> social_process_plan
```

保留原则：

- 人际关系图谱继续负责人物和关系事实。
- 关系策略层只读取关系事实、当前目标和事件证据。
- 新增能力拼接和外部能力探索不能直接修改人物或关系事实。

### 2. 事件图谱映射

现有事件记录映射为全域事件图谱中的社会事件起点：

```text
Global Event Graph
  -> social_event
  -> communication_event
  -> relationship_change_candidate
  -> business_followup_event
  -> feedback_event
```

后续全域事件图谱新增物理事件、学习事件、实验事件、决策事件时，不应吞并社会事件；它们通过参与者、影响关系、证据和反馈边连接。

### 3. 决策集群映射

现有 `decision-cluster` 映射为：

```text
Decision Layer
  -> Social Decision Expert Matrix
  -> Relationship Policy Allocator
  -> Message Draft Generator
  -> Risk / Gate Review
```

后续新增外部能力拼接后，决策层可额外读取：

- 软件能力候选。
- 能力拼接计划。
- 可能性预测分支。
- 沙盒验证结果。

但这些只能作为候选输入，不能覆盖现有关系、事件和风险证据。

### 4. 触发与行动层映射

现有 `trigger-engine` 和受控发送链路映射为：

```text
Action Layer
  -> communication_plan
  -> reminder_plan
  -> platform_preview
  -> controlled_send_candidate
  -> feedback_plan
```

新系统中的能力拼接可以为行动层提供新的工具候选，例如：

- 自动化 dry-run 验证工具。
- 平台快照检查工具。
- 报告生成工具。
- CRM / 日历 / 邮件桥接候选。

但现有社交辅助系统正常使用时，仍可沿用当前触发计划和受控预览，不依赖新能力完成。

### 5. 可能性预测映射

现有 `packages/possibility-branch` 已经具备可能性分支雏形，但当前边界是：

- 保存多身份、多事件、嵌套事件假设。
- 不写入人物、事件或索引主图谱。
- 需要后续确认才能提升。

新系统的 `Possibility Forecast Graph` 可以基于它扩展：

- 从“当前输入歧义分支”扩展为“未来可能性预测”。
- 增加概率、影响、风险、紧急度、可控性、证据质量。
- 增加变量和影响边。
- 保持预测不等于事实。

### 6. 工具能力映射

现有 `packages/tool-runtime` 已有外部软件能力登记、dry-run 计划和桥接报告。它可作为：

```text
External Capability Intelligence Layer
  -> tool_adapter_capability.v1
  -> social_tool_call_plan.v1
  -> social_tool_call_result.v1
  -> tool_intake_bridge.v1
```

新需求需要在其上扩展：

- `Capability Atom`
- `Code Capability Slice`
- `Goal Capability Gap`
- `Capability Composition Plan`
- `Implementation Route`
- `Sandbox Verification Run`
- `Implementation Candidate`

也就是说，现有 `tool-runtime` 是基础，不够完整，但方向一致。

## 不影响现有系统正常使用的融合方式

### 隔离方式

融合时应采用四层隔离：

1. 数据隔离：新能力候选、拼接计划、沙盒验证不写入 `data/people/**` 或 `data/events/**`。
2. 运行隔离：沙盒验证不进入现有 MVP 闭环主路径。
3. 投影隔离：3D 点云可以展示候选和预测，但必须标识为候选、预测或沙盒验证。
4. 接口隔离：现有人际辅助系统继续使用原有输入、决策、触发、反馈接口。

### 接入方式

建议通过 envelope / projection 接入：

```text
Social Assistant Existing Loop
  -> ContextSnapshot / GraphMemoryEnvelope
  -> Social Cognition Projection
  -> Global World Model Projection
```

新增大系统读取现有系统摘要，而不是直接改写内部状态。

### 正常使用保证

保持正常使用需要满足：

- 现有 `npm run mvp:*`、`npm run social`、`npm run decision`、`npm run trigger` 不依赖新系统。
- 新增能力作为可选上层投影和沙盒候选。
- 人际关系辅助系统的正式闭环仍可独立运行。
- 新增图谱域失败时，不影响现有客户跟进和关系策略输出。

## 当前能够完整映射的内容

| 新系统能力 | 当前已有基础 | 映射状态 |
| --- | --- | --- |
| 人际图谱 | `packages/social-graph`、`docs/05/06/12` | 可映射 |
| 身份解析 | `packages/identity-resolution` | 可映射 |
| 社会事件图谱 | `storage-runtime`、RawEvent、SemanticEvent | 可映射 |
| 决策层 | `decision-cluster` | 可映射 |
| 触发计划 | `trigger-engine` | 可映射 |
| 反馈回写 | `mvp-runtime`、feedback schema | 可映射 |
| 可能性分支 | `possibility-branch` | 可扩展映射 |
| 外部工具能力 | `tool-runtime` | 可扩展映射 |
| 多来源感知 | `intake-runtime`、source adapter | 可扩展映射 |
| GUI / 悬浮窗 / 3D 投影 | Sightflow desktop + 当前线程 UI 需求 | 可扩展映射 |

## 未完成但已明确的图谱功能

### 关系策略层

已明确：

- 10 个策略桶。
- 8 个核心处理目标 + `observe`。
- 关系策略卡。
- L0-L4 权限等级。
- 四智能体分工。

未完成：

- 正式 schema。
- 与现有 `social-graph` 数据结构映射。
- `graph_projection.v1` 展示契约。
- 测试样例。

### 感知到世界图谱对齐层

已明确：

- `Observation Atom`。
- `Fusion Bundle`。
- 五张传感器矩阵。
- 冲突处理。
- 统一时空坐标。
- 潜变量。
- 物理概念定义库。

未完成：

- schema。
- 样例。
- 与 `intake-runtime` 的数字上下文统一。
- 3D 点云映射。

### 外部能力转需求和能力拼接

已明确：

- `Capability Atom`。
- `Software Capability Observation`。
- `Code Capability Slice`。
- `Goal Capability Gap`。
- `Capability Composition Plan`。
- `Implementation Route`。
- `Sandbox Verification Run`。
- `Self-Awareness Governance Layer`。
- `Safety Scope Profile`。

未完成：

- schema。
- 与 `tool-runtime` 的正式继承关系。
- 代码/软件分析流程。
- 沙盒验证报告格式。
- 实现候选提升规则。

### 可能性预测图谱

已明确：

- `Possibility Forecast Graph`。
- 事实、变量和影响边。
- 未来分支概率、影响、风险、紧急度、可控性。

未完成：

- 与 `possibility-branch` 的边界合并。
- 变量和影响边 schema。
- 预测评分公式样例。
- 反馈校准机制。

### 3D 点云投影

已明确：

- 点云是只读投影，不是事实源。
- 默认全局视图，下钻到图谱域、云团、实体、属性和证据。
- 红黄蓝控制线圈应移除。
- 放大后保持细粒子展示。

未完成：

- `graph_projection.v1`。
- 人际图谱真实数据映射。
- 事件图谱真实数据映射。
- 能力候选、预测分支、沙盒验证和安全范围节点映射。

## 关键冲突与处理建议

### 冲突一：现有项目偏保守，新需求偏能力最大化

现有项目很多路径强调 dry-run、人工确认、发送阻断。新需求强调沙盒阶段能力最大化探索，不外加前置门槛。

处理建议：

- 保留现有项目正式闭环的保守路径。
- 新增大系统沙盒探索 lane。
- 沙盒 lane 只以自身影响和受控环境为当前安全评估范围。
- 两者通过投影和候选接口连接，不互相覆盖。

### 冲突二：安全模块由意识模块更改，现有安全模块较固定

处理建议：

- 新增 `Safety Scope Profile` 和 `Safety Scope Revision`。
- 意识模块可以提出安全范围变更。
- 变更作为候选记录，不静默覆盖正式运行规则。
- 当前沙盒 profile 为 `sandbox_self_containment.v1`。

### 冲突三：大系统范围远超人际辅助，可能稀释第一阶段目标

处理建议：

- 人际关系辅助系统继续作为第一稳定应用域。
- 大系统能力先通过映射和投影接入。
- 不在当前阶段替换 B2B 客户跟进闭环。
- 所有新增能力都要说明如何服务或不干扰当前闭环。

## 评估结论

融合可行性：高。

不影响现有正常使用的前提：

- 新系统能力先作为上层沙盒和只读投影。
- 人际辅助系统保留现有数据、流程和命令入口。
- 外部能力拼接、预测和意识模块先写成候选图谱。
- 后续正式实现时再同步 schema、流程树、Obsidian 和验证命令。

推荐融合定位：

```text
Super System
  -> World Model Layer
    -> Social Cognition and Interaction Module
      -> Current Human Social Assistant
```

也就是：当前人际关系辅助系统成为大系统的社会认知与人际互动子系统。

## 待用户确认

需要用户确认的点：

1. 是否接受 `Current Human Social Assistant` 作为 `Social Cognition and Interaction Module` 并入大系统。
2. 是否接受沙盒探索 lane 与现有正式闭环分离。
3. 是否接受 `sandbox_self_containment.v1` 作为当前沙盒安全范围。
4. 是否下一步正式整理 `graph_projection.v1`，把所有已明确图谱功能映射到 3D 点云。
