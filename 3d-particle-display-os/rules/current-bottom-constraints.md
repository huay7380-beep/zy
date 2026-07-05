# 当前底层约束

状态：当前约束，适用于 3D 粒子显示、巡检状态传递和对话模块读取路径。

这些约束不是最终视觉规则。它们是当前系统必须遵守的治理边界，用来避免 3D 粒子层、巡检层、对话层和业务模块互相穿透。

## 1. 状态读取约束

对话模块不得直接读取各业务模块的源码、运行时文件、项目目录或临时报告来判断当前状态。

允许路径是：

```text
业务模块状态/证据
  -> 模块 patrol block / status card / status event
  -> dialogue-system-patrol read index
  -> 对话模块
```

也就是说，对话模块回答“当前模块状态”时，只能依赖巡检模块已经发布的状态面，而不是绕过巡检模块去猜测。

## 2. 巡检输入约束

巡检模块识别其他模块状态时，只能使用明确登记的输入：

- `examples/system-process-tree.json`
- `dialogue-system-patrol/registry/system-patrol-registry.json`
- `dialogue-system-patrol/blocks/**`
- `runtime/status-cards/**`
- `runtime/status-events/**`
- `runtime/dialogue-system-patrol-validations/latest.json`
- `runtime/dialogue-system-patrol-module-gates/latest.json`
- `runtime/dialogue-system-patrol-source-drift/latest.json`
- 已登记的 `os-particle-projection.json`
- 已登记的模块 source refs

巡检模块不能把未登记的临时文件、聊天上下文、推测结论或 3D 预览页面当作模块真实状态。

## 3. 巡检输出约束

巡检模块向对话模块和 3D 粒子模块输出的状态必须是摘要型、只读型、可追溯型。

当前允许输出：

- `runtime/status-cards/**`
- `runtime/status-events/**`
- `runtime/dialogue-system-patrol/dialogue-read-index.json`
- `runtime/dialogue-system-patrol/dialogue-read-index.md`
- `dialogue-system-patrol/os-particle-projection.json`
- `runtime/dialogue-system-patrol-validations/**`
- `runtime/dialogue-system-patrol-module-gates/**`
- `runtime/dialogue-system-patrol-source-drift/**`

这些输出不能直接触发业务执行、发送消息、写世界模型或修改业务事实。

## 4. 模块投影声明约束

每个系统可见模块必须满足以下二选一：

```text
提供 os-particle-projection.json
```

或：

```text
在巡检/模块声明中显式说明 projection_enabled=false 及豁免原因
```

缺少声明的模块不能被 3D 粒子 OS 当作已接入模块，也不能被对话模块描述为 3D 可见。

## 5. 3D 粒子模块边界

`3d-particle-display-os` 当前只能做：

- 规则记录
- 投影入口登记
- 投影文件聚合
- 显示预览
- 主 3D 页面接入方案
- 投影一致性检查方案

当前不能做：

- 直接写业务模块
- 直接写世界模型
- 直接替代巡检状态
- 直接读取未登记业务运行态
- 触发外部动作
- 给对话模块提供绕过巡检的状态结论

## 6. 性能约束

其他模块不需要加载 Three.js，不需要实时构建粒子云，不需要在业务请求路径上运行 3D 投影逻辑。

模块只需要维护轻量声明：

```text
os-particle-projection.json
```

该声明只在以下时机检查或更新：

- 模块创建
- 模块结构变更
- 巡检维护
- CI / pre-commit
- 3D 显示快照刷新

这保证 3D 粒子映射不会影响业务模块运行性能。

## 7. 当前规则孵化边界

以下内容暂不作为硬底层规则：

- 最终空间坐标公式
- 最终权重公式
- 最终 Lens 数量
- 最终颜色体系
- 最终节点尺寸映射
- 最终动态流动画规则

这些内容继续在 `previews/` 和规则孵化文档中验证。稳定后再升级为底层显示协议。
