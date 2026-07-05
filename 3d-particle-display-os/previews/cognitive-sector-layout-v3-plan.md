# 双层认知落地预览 v3 方案

本页验证新的表达方式：八个扇区围绕世界核心，但只负责认知处理逻辑；具体软件、项目、需求和端口放在八个扇区外圈。

## 三层结构

- 中心：世界核心 / 当前总目标。
- 内圈：8 个认知处理扇区，表达系统如何理解、判断、决策和反馈。
- 外圈：当前主系统已经在构建的软件、包、项目、功能端口和具体需求。

## 内圈规则

1. 输入感知：外部世界、用户、屏幕、文档、API 和设备信号。
2. 证据事件：observation、事件、证据、时间线和事实候选。
3. 世界状态：人物、关系、任务、状态、事实底座。
4. 推理预测：可能性分支、因果推演、能力组合、沙盒模拟。
5. 决策治理：方案比较、权重、风险、安全边界、最终选择。
6. 行动执行：任务计划、工具调用、自动化、人工交接。
7. 反馈学习：执行结果、偏差、复盘、优化和策略修正。
8. 自我操作：状态对话、三维显示 OS、投射契约、系统自检。

## 外圈挂接规则

外圈对象按照主要职责挂到对应扇区外侧。例如：

- `intake-runtime`、Chrome STT、Pilot/MVP 导入挂到输入感知。
- `source-intake-matrix`、全域事件图谱、平台快照验证挂到证据事件。
- `social-graph`、`identity-resolution`、`storage-runtime` 挂到世界状态。
- `possibility-branch`、`tool-runtime`、`capability-upgrade-registry` 挂到推理预测。
- `decision-cluster`、安全边界、PT-028 决策包挂到决策治理。
- `trigger-engine`、`agent-runtime`、跨境电商 AI 通路挂到行动执行。
- `mvp-runtime`、反馈报告、PT-028 反馈采集挂到反馈学习。
- `Status Dialogue`、`3d-particle-display-os`、Projection Contracts、TTS/STT 挂到自我操作。

## 动态表达

- 处理流：输入感知 → 证据事件 → 世界状态 → 推理预测 → 决策治理 → 行动执行 → 反馈学习 → 自我操作。
- 决策链：状态/策略/推理对象汇入 `decision-cluster`，再通过安全边界进入行动项目。
- 反馈链：行动项目结果回流 `mvp-runtime`、反馈报告、学习更新和显示 OS。

## 不影响原系统

这是独立预览页。它只读取页面内置样例数据，不修改原系统源码、runtime 状态、schema、IPC、数据目录或外部端口。未来真正接入时，应由投射适配器输出 `graph_projection_vnext`，显示层只消费投射结果。
