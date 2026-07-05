# 模块状态读取契约 v1

状态：设计草案，等待确认。

## 设计目标

主体状态对话框需要读取其他模块状态，但不能影响其他模块运行。建议由每个模块主动发布一张轻量状态卡，对话框只读取状态卡聚合快照。

## 状态链路

```text
subsystem runtime
  -> module_status_card.v1
  -> status_snapshot.v1
  -> subject status dialogue context
  -> first-person reply / voice_line / attention_log
```

## module_status_card.v1 草案

```json
{
  "schema": "module_status_card.v1",
  "module_id": "status-dialogue-system",
  "display_name": "主体状态对话框",
  "owner": "Subject Status Dialogue Runtime",
  "gate": "status_dialogue_read_only_gate",
  "status": "ok",
  "updated_at": "2026-06-22T00:00:00.000Z",
  "ttl_ms": 30000,
  "headline": "我当前只读状态并回答用户问题。",
  "current_focus": ["first_person_reply", "voice_line", "attention_log"],
  "current_task": "等待用户确认模块结构后进入实现。",
  "inputs": ["user_query", "focus_context", "status_snapshot"],
  "outputs": ["reply", "voice_line", "attention_log"],
  "blockers": [],
  "risks": ["missing_status_cards"],
  "next": ["confirm_adapter_shape", "confirm_tts_choice"],
  "confidence": 0.86,
  "source_refs": ["subject-status-dialogue-module/module-goal-alignment.v1.md"],
  "visibility": "read_only_summary"
}
```

## 字段说明

| 字段 | 含义 |
| --- | --- |
| `module_id` | 稳定模块 ID，用于 3D 粒子图和状态快照映射 |
| `status` | `ok`、`warn`、`blocked`、`unknown` |
| `ttl_ms` | 状态有效期，过期后对话框应提示状态可能不新 |
| `headline` | 一句话状态，优先给语音和短回答使用 |
| `current_focus` | 当前关注点，用于日志区域 |
| `inputs` / `outputs` | 模块端口摘要 |
| `blockers` | 明确阻塞项 |
| `risks` | 当前风险或不确定项 |
| `source_refs` | 状态来源，保持可审计 |
| `visibility` | 暴露粒度，避免泄露内部细节 |

## status_snapshot.v1 草案

聚合器读取多个状态卡后，生成给对话框的一份快照：

```json
{
  "schema": "status_snapshot.v1",
  "generated_at": "2026-06-22T00:00:00.000Z",
  "cards_total": 12,
  "cards_fresh": 10,
  "cards_stale": 1,
  "cards_missing": 1,
  "global_status": "warn",
  "top_focus": ["3d_particle_projection", "subject_status_dialogue"],
  "cards": []
}
```

## 读取边界

- 对话框只读 `status_snapshot.v1`，不直接扫描其他模块内部状态。
- 其他模块可以没有状态卡；缺失时对话框必须明确说明缺失，而不是猜测。
- 状态卡只表达状态摘要，不承载真实业务数据全文。
- 状态卡更新由各模块负责，对话框不强制拉起其他模块。
- 状态卡可以被缓存，避免每次问答都全局扫描。

## 与 3D 粒子图关系

每张状态卡可以映射到对应星云或星点：

- `module_id` -> 粒子节点 ID
- `status` -> 粒子状态颜色或亮度
- `current_focus` -> 悬停详情
- `blockers` / `risks` -> 风险边界粒子
- `source_refs` -> 详情面板来源链

