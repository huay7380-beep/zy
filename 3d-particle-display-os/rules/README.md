# 3D 粒子规则中心

本目录记录 3D Particle Display OS 的规则演化和当前底层约束。

当前阶段不把空间布局、权重公式、Lens 展示算法提前固化为最终底层协议。原因是系统仍在探索人类认知式三维显示方式，过早固定视觉算法会限制后续演化。

当前已经可以固定的是治理层约束：

- 对话模块不直接读取业务模块状态。
- 对话模块通过巡检模块发布的状态面读取系统状态。
- 每个可见模块必须声明自己如何被投射到 3D 粒子层，或显式声明豁免原因。
- 3D 粒子模块只负责规则、索引、投影聚合、显示适配和校验，不成为业务事实源。
- 巡检模块负责检查投影声明是否存在、是否新鲜、是否符合只读边界。
- 主 3D 页面未来只消费统一投影快照，不直接扫描各模块源码或运行态。

## 文件

- `current-bottom-constraints.md`：当前已经生效或应立即采用的底层治理约束。
- `dialogue-patrol-bridge-contract.md`：对话模块、巡检模块、3D 粒子模块之间的状态传递契约。
- `module-projection-lifecycle.md`：模块从创建、变更到巡检发布时如何同步粒子投影声明。

## 相关入口

- 统一投影入口：`../registry/source-projection-index.json`
- 模块投影要求：`../registry/module-projection-requirements.json`
- 模块投影模板：`../templates/module-os-particle-projection.template.json`
- 阶段计划：`../plans/staged-rule-construction-plan.md`

## 当前定位

```text
3d-particle-display-os = 规则孵化 + 投影协议 + 显示适配
dialogue-system-patrol = 模块状态巡检 + 对话可读状态发布
业务模块 = 自己声明投影，不直接依赖 3D 渲染
对话模块 = 只读巡检结果，不直接接入业务模块
```
