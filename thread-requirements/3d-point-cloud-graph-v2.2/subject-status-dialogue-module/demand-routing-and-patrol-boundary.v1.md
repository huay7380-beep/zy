# 需求传递与巡逻边界 v1

状态：目标纠偏记录，等待确认。

## 核心纠正

主体状态对话框未来不仅是状态播报器。它可以成为世界模型与用户或第三方之间的对话窗口，也可以把接收到的需求结构化后传递给世界模型。

当前阶段仍然只负责：

- 状态检查。
- 巡逻。
- 缺失状态提示。
- 边界说明。
- 第一人称简洁沟通。

未来阶段允许扩展为：

- 需求接收窗口。
- 需求澄清窗口。
- 需求结构化转换器。
- 世界模型需求传递端口。
- 第三方沟通入口。

## 当前职责：状态检查和巡逻

当前模块只能读取状态，不改变世界模型状态。

允许：

- 读取当前 3D 粒子焦点。
- 读取 `status_snapshot.v1`。
- 检查模块状态卡是否过期、缺失或冲突。
- 用第一人称说明当前状态、风险和下一步检查方向。
- 记录可审计关注点摘要。

不允许：

- 直接改写世界模型。
- 直接启动任务。
- 直接写入人际关系图谱、事件图谱或自我意识图谱。
- 直接代表系统向外部平台发送消息。
- 把用户需求当成已确认事实。

## 未来职责：需求传递窗口

未来当世界模型需求入口完成后，对话框可以把用户或第三方输入转成需求包并传递。

建议结构：

```text
user_or_third_party_input
  -> dialogue_intake
  -> requirement_packet.v1
  -> world_model_requirement_inbox
  -> world_model_review
```

`requirement_packet.v1` 草案：

```json
{
  "schema": "requirement_packet.v1",
  "source": "subject_status_dialogue",
  "speaker": "user",
  "received_at": "2026-06-22T00:00:00.000Z",
  "raw_input": "用户原始输入摘要",
  "intent_summary": "需求意图摘要",
  "requested_change": "希望系统改变或新增的能力",
  "target_scope": ["world_model", "3d_particle_os"],
  "urgency": "normal",
  "confidence": 0.75,
  "requires_confirmation": true,
  "status": "pending_world_model_review",
  "boundaries": [
    "not_executed_by_dialogue_module",
    "not_confirmed_as_fact"
  ]
}
```

## 对话框与世界模型的边界

| 能力 | 当前阶段 | 未来阶段 |
| --- | --- | --- |
| 状态检查 | 允许 | 允许 |
| 巡逻 | 允许 | 允许 |
| 需求接收 | 只记录目标 | 允许 |
| 需求传递给世界模型 | 不执行 | 允许 |
| 改写世界模型 | 不允许 | 由世界模型审查后执行 |
| 对第三方沟通 | 不执行 | 可作为窗口，但需明确身份和权限 |

## 3D 粒子映射建议

新增或确认星点：

- `role.status_patrol_officer`
- `role.world_model_dialogue_window`
- `future.requirement_forwarding`
- `port.requirement_packet`
- `port.world_model_requirement_inbox`
- `constraint.current_read_only_patrol`
- `constraint.requirement_not_fact`
- `gate.world_model_review_gate`

