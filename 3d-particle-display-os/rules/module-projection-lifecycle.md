# 模块 3D 投影生命周期

本文件定义可见模块如何在不影响运行性能的情况下，同步 3D 粒子层映射。

## 1. 新模块创建

新模块如果会被用户、对话模块、巡检模块或主 3D 页面感知，必须完成：

```text
1. 注册 process-tree node
2. 使用 system-patrol:scaffold 建立巡检覆盖
3. 提供 os-particle-projection.json 或豁免声明
4. 登记到 3d-particle-display-os/registry/source-projection-index.json
5. 运行 system-patrol:maintain -- --module-id=<module_id>
```

如果模块只是内部 helper，可以声明：

```json
{
  "projection_enabled": false,
  "exempt_reason": "internal_helper_not_user_visible"
}
```

## 2. 模块变更

模块结构、输入输出、状态含义、风险边界或可视化位置发生变化时，必须同步检查：

- patrol block 是否更新
- source hash 是否刷新
- status card/event 是否发布
- `os-particle-projection.json` 是否仍然准确
- source projection index 是否仍然指向正确路径

推荐命令：

```text
npm run system-patrol:source-drift -- --update --module-id=<module_id>
npm run system-patrol:maintain -- --module-id=<module_id>
```

## 3. 3D 投影声明最小字段

每个投影声明至少应该表达：

- module_id
- display_name
- projection_enabled
- source_only
- writes_fact_state
- sector_hint
- layer_role
- input_refs
- output_refs
- status_feedback_refs
- source_refs
- boundaries
- allowed_operation_intents
- forbidden_operations

如果当前规则还不稳定，`sector_hint` 可以是 draft，但必须明确：

```text
draft / confirmed / deprecated
```

## 4. 状态反馈识别

巡检模块识别模块状态时，以模块自己的巡检输出为准，而不是以 3D 投影为准。

3D 投影只引用状态反馈路径：

```json
{
  "status_feedback_refs": [
    "runtime/status-cards/<module_id>.json",
    "runtime/status-events/<module_id>.json",
    "runtime/dialogue-system-patrol/dialogue-read-index.json"
  ]
}
```

这表示 3D 页面可以显示这些状态摘要，但不能把投影文件本身当成状态事实源。

## 5. 主 3D 页面接入前置条件

主 3D 页面接入统一规则前，应满足：

- 3D source projection index 已存在
- 当前可见模块均有 projection 声明或豁免
- 巡检 module gate 可检查 projection 声明存在性
- 主页面只读聚合快照，不直接扫描业务模块
- 旧 `WORLD_SYSTEM_NEBULAE` 可以被映射到统一 projection snapshot

## 6. 性能边界

模块侧不运行 3D 渲染逻辑。

模块侧只维护静态或低频更新的投影声明。检查发生在维护、发布、CI 或快照刷新阶段，不进入实时业务路径。
