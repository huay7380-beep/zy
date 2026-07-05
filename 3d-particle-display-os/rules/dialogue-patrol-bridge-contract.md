# 对话模块与巡检模块状态桥接契约

本契约描述当前目标下，对话模块、巡检模块、业务模块和 3D 粒子模块之间的状态流向。

## 核心判断

对话模块不直接接入各业务模块。

对话模块只读取巡检模块发布后的状态面。业务模块状态必须先经过巡检模块整理、校验、摘要化，再进入对话模块。

## 状态流

```text
业务模块 / 项目 / 端口
  -> 模块 patrol block
  -> system patrol registry
  -> status card + status event
  -> dialogue read index
  -> 对话模块
```

3D 粒子显示路径是旁路显示，不是状态真源：

```text
模块 os-particle-projection
  -> 3d-particle-display-os source projection index
  -> 3D 显示快照
  -> 主 3D 页面
```

巡检模块可以发布自己的 3D 投影：

```text
dialogue-system-patrol/os-particle-projection.json
```

但该投影只用于显示巡检状态，不替代巡检 registry、patrol block 或 runtime 状态面。

## 巡检模块输入

巡检模块允许读取：

- process tree
- patrol registry
- module patrol blocks
- source hash refs
- status cards
- status events
- module gate reports
- source drift reports
- 已登记的 3D projection 文件

巡检模块不允许把未登记运行时文件直接解释为当前状态。

## 巡检模块输出

巡检模块向对话模块输出：

- 模块是否已登记
- 模块状态是否新鲜
- 模块 source hash 是否漂移
- 模块 gate 是否通过
- 模块当前摘要
- 模块风险和阻塞
- 模块允许对话模块说什么

输出文件以现有巡检机制为准：

```text
runtime/status-cards/**
runtime/status-events/**
runtime/dialogue-system-patrol/dialogue-read-index.json
runtime/dialogue-system-patrol/dialogue-read-index.md
```

## 对话模块读取规则

对话模块可以说：

- 巡检模块发布的模块状态
- 巡检模块发布的风险、阻塞、下一步
- 巡检模块声明的证据路径
- 巡检模块声明的状态新鲜度

对话模块不能说：

- 未经巡检发布的模块运行结论
- 未登记投影文件中的业务事实
- 3D 预览图推断出的模块状态
- 未经确认的真实执行结果

## 3D 粒子模块读取规则

3D 粒子模块可以读取：

- 已登记的 `os-particle-projection.json`
- 3D source projection index
- 巡检模块发布的 source-only projection
- 巡检模块状态卡或 read index 的摘要引用

3D 粒子模块不能绕过巡检模块直接向对话模块提供状态结论。

## 当前验收标准

一个模块想被称为“对话可见 + 3D 可见”，至少需要：

- process-tree 节点
- patrol registry entry
- patrol block
- status card
- status event
- module gate 通过
- source drift 无阻断
- 3D projection 声明或豁免声明
- projection source 被登记到 `3d-particle-display-os/registry/source-projection-index.json`
