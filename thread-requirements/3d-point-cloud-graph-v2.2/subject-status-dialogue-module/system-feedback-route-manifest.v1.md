# system_feedback_route_manifest.v1

状态：已建立 Phase 6 首版契约和验证入口。  
归属：`status-dialogue-system` / `SCHEME-0007`。  
日期：2026-06-29。

## 目标

`system_feedback_route_manifest.v1` 是未来新增系统接入主体状态对话框巡检和语音事件播报的强制清单。它不替代 `module_status_card.v1` 或 `module_status_event.v1`，而是要求每个新增系统明确声明这两个出口、负责人、闸口、罗盘、TTL、严重级别映射、播报策略、隐私边界和 fallback 行为。

## 必填字段

| 字段 | 用途 |
| --- | --- |
| `module_id` | 新系统或模块的稳定 ID |
| `display_name` | UI 和星云目录显示名 |
| `owner` | 负责方 |
| `gate` | 接入闸口 |
| `compass` | 3D 粒子 OS 罗盘路径 |
| `status_card_output` | `module_status_card.v1` 输出路径，默认应在 `runtime/status-cards` |
| `status_event_output` | `module_status_event.v1` 输出路径，默认应在 `runtime/status-events` |
| `ttl_ms` | 状态卡和事件的新鲜度窗口 |
| `severity_mapping` | 模块状态到 `info/notice/warn/blocked/critical` 的映射 |
| `broadcast_policy` | 默认播报模式、critical 是否可打断、idle reminder 是否允许、单快照最大事件数 |
| `privacy_boundary` | 不允许进入状态卡或事件的内容边界 |
| `fallback_behavior` | 缺失或失败时对话模块如何说明 |

## 示例

```json
{
  "schema": "system_feedback_route_manifest.v1",
  "module_id": "new-system-demo",
  "display_name": "New System Demo",
  "owner": "Runtime Integration",
  "gate": "demo_status_event_gate",
  "compass": "status_dialogue.demo",
  "status_card_output": "runtime/status-cards/new-system-demo.json",
  "status_event_output": "runtime/status-events/new-system-demo.json",
  "ttl_ms": 300000,
  "severity_mapping": {
    "ok": "info",
    "notice": "notice",
    "warn": "warn",
    "blocked": "blocked",
    "critical": "critical"
  },
  "broadcast_policy": {
    "default_mode": "summary",
    "critical_interrupt_allowed": true,
    "idle_reminder_allowed": true,
    "max_events_per_snapshot": 5
  },
  "privacy_boundary": [
    "summary-only status card",
    "summary-only status event",
    "no raw business payload",
    "no raw audio payload",
    "no direct world-model write"
  ],
  "fallback_behavior": "If the event output is missing, the dialogue module reports missing publisher and keeps text dialogue available."
}
```

## 代码落点

- 契约和校验函数：`D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\status-events.ts`
- 3D 星云映射：`status-dialogue-system` 下的 `system_feedback_route_manifest.v1`、`runtime.feedback_router`、`runtime.module_event_contract`
- 右下角 GUI：事件区显示 queue、request、patch、trace 和 replay 状态
- 验证命令：`npm.cmd run voice:event-broadcast:validate`

## 当前边界

- 不读取模块内部全文。
- 不自动创建 `requirement_packet.v1`。
- 不写世界模型。
- 不执行外部动作。
- 不保存原始音频。
- 不把缺失系统状态猜测成事实。

## 验收状态

2026-06-29 已通过：

- `buildDefaultSystemFeedbackRouteManifest`
- `validateSystemFeedbackRouteManifest`
- 有效 manifest 校验为 `ok=true`
- 空 manifest 校验为 `ok=false`，并返回缺失字段清单
- `npm.cmd run voice:event-broadcast:validate` 已覆盖默认 manifest 校验，最新报告：`D:\zhineng\sightflow-desktop-agent-main\runtime\voice-loop-probes\status-dialogue-event-broadcast-validation-20260629080210.json`
- `npm.cmd run typecheck` 通过。
- `npm.cmd run build` 通过。

2026-06-29 GUI 和 3D 映射验证：

- `http://[::1]:5173/?window=zhineng-graph` 可打开。
- 右下角 `Subject Status Dialogue` 设置面板可见事件队列、trace 和手动 `play queue`。
- 3D 粒子 OS 可见 `19 个星云`、`288 个内容星点`，新增 `system_feedback_route_manifest.v1` 归属 `status-dialogue-system`。
