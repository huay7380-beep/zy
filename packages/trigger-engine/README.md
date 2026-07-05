# Trigger Engine

`trigger-engine` 负责任务触发、预约流程、提醒和通知计划。

第一版只生成计划，不真实发送微信、邮件或日历邀请。
平台测试页或页面快照通过 `PlatformDryRunConnector` 做 dry-run 契约检查，只证明预览到达和发送阻断，不代表真实发送能力已开启。

## 快照校验

```powershell
npm run platform:snapshot:validate
```

默认读取 `examples/platform-snapshot.sample.html` 和 `examples/platform-snapshot-preview.sample.json`，输出 `runtime/platform-snapshot-validations/<validation_id>/platform-snapshot-validation.json`。接入真实测试账号时，用 `--snapshot=<platform_snapshot.html>` 和 `--preview=<automation-preview.json>` 替换样例。

## 触发类型

- `user_initiated`
- `scheduled`
- `profession_routine`
- `preference_routine`
- `graph_signal`
