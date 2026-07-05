# Lens 配置说明

`lens.config.json` 是这个独立显示实验区的配置入口。它描述五种 Lens 如何把世界系统三维需求 OS 显示成一个可认知的粒子云。

## 配置目标

配置文件只定义显示语义，不定义业务事实，不执行动作。

它回答四个问题：

- 哪些 Lens 可以在同一界面叠加显示。
- 每个 Lens 显示哪些认知对象。
- 粒子、连接、流光、亮度、大小分别表达什么。
- 后续真实系统接入时，哪些输入输出边界必须保持稳定。

## 顶层字段

- `schema_version`：配置版本，当前为 `particle_os_lens_config.v1`。
- `scope`：此配置的使用范围，当前为独立显示实验区。
- `runtime_policy`：运行边界，明确不读写真实业务数据。
- `visual_encoding`：全局视觉编码规则。
- `edge_types`：连接线类型规则。
- `lenses`：五个可开关图层定义。
- `integration_contract`：未来接入现有系统时需要保持的输入输出契约。

## Lens 字段

每个 Lens 包含：

- `id`：唯一标识。
- `label`：界面显示名。
- `enabled_by_default`：原型首次打开时是否默认显示。
- `color`：该 Lens 主色。
- `cognitive_goal`：这个 Lens 帮用户理解什么。
- `node_roles`：该 Lens 中常见粒子角色。
- `edge_rules`：该 Lens 中连接线如何解释。
- `layout_rule`：空间布局规则。
- `input_contract`：未来接入时允许读取的数据形态。
- `output_contract`：显示层允许输出的数据形态。

## 扩展规则

新增 Lens 时遵循以下约束：

1. 不直接读取事实源目录。
2. 不直接写入业务数据。
3. 不直接触发动作。
4. 必须声明输入契约和输出契约。
5. 如果 Lens 表达预测、候选、假设或风险，必须在视觉上和 confirmed fact 区分。

## 当前五种 Lens 的定位

- `system` 是底座，负责让用户理解模块、端口和边界。
- `thinking` 是认知流，负责让用户看见当前系统如何从目标扩散到相关节点。
- `memory` 是时间结构，负责让用户看见过去、现在、未来。
- `decision` 是选择结构，负责让用户看见方案、权重、冲突和风险。
- `self` 是操作边界，负责让用户看见系统当前能做什么、不能做什么。

这五种 Lens 可以同时打开，也可以单独查看。真实系统接入时，应把它们视为同一个 `graph_projection_vnext.v1` 的不同显示投影，而不是五套互相竞争的数据模型。

## 实体工作节点

- 星云名称：`实体工作节点`
- 投影源：`cross-border-ecommerce-ai-route/os-particle-projection.json`
- 当前子项目：`跨境电商通路`
- 显示方式：在 `prototype/index.html` 中点击 `实体工作节点` 粒子，展开跨境电商子项目粒子云。
- 边界：该星云只读显示实体项目状态、目录、节点和文档来源；真实客户发送、报价、付款、报关、税务、外汇或外部平台动作必须进入主系统 confirmation gate。
