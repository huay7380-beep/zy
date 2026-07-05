# Phase 2 总系统状态读取实现记录

状态：Phase 2 已完成并通过验证。

## 本阶段目标

让主体状态对话框通过只读状态卡读取总系统状态。当前只读取摘要状态，不启动其他模块，不写世界模型，不创建需求包，不接真实 STT/TTS。

## 已实现接口

- `StatusSnapshotRequest`
- `StatusSnapshotReadResult`
- `ExpectedStatusModule`
- `normalizeModuleStatusCard`
- `buildStatusSnapshotFromCards`
- IPC：`zhineng:status-dialogue:snapshot:get`

## 数据流

```text
3D graph nodes
  -> expected_modules
  -> zhineng:status-dialogue:snapshot:get
  -> runtime/status-cards/*.json read-only
  -> status_snapshot.v1
  -> StatusDialogueContext.statusSnapshot
  -> local fallback / model prompt / attention log / UI status line
```

## 读取边界

- 状态卡目录：`runtime/status-cards`，相对项目根目录。
- 主进程只读 `.json` 文件。
- 目录不存在时不创建目录，直接返回缺失快照。
- 坏 JSON 不会中断对话框，只进入 `read_errors`。
- 重复 `module_id` 时取最新 `updated_at` 的卡片，并记录冲突。
- Phase 2 不写入 `runtime/status-snapshots/current-status-snapshot.json`。

## UI 表达

右侧主体状态对话框新增极简状态行：

```text
global_status · cards fresh/stale/missing · snapshot source/error
```

该状态行只用于巡逻可见性，不替代完整 Phase 5 UI 优化。

## 当前不做

- 不创建 `requirement_packet.v1`。
- 不写入世界模型。
- 不读取真实人际关系图谱或事件图谱。
- 不接入真实 `whisper.cpp`、`FunASR`、`Kokoro`、`CosyVoice`。
- 不启动任何外部模块。
