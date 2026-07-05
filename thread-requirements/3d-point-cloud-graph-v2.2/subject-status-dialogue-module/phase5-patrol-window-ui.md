# Phase 5 巡逻状态窗口 UI 实现记录

状态：Phase 5 已实现右侧主体状态对话框的巡逻窗口结构。

## 本阶段目标

把右侧主体状态对话框从普通聊天框整理成可扫读的巡逻状态窗口。当前仍只做状态检查和边界说明，不执行需求传递，不写世界模型，不接真实 STT/TTS。

## 已实现 UI 分区

位置：`D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\ZhinengConsole.tsx`

- 顶部身份条：显示 `Subject Status Dialogue`、只读效率模式和 `voice on/off`。
- 巡逻身份状态：显示 `mode`、最新 `model/source`、语音输出状态。
- 视角切换：保留 `first person` 与 `third person`。
- 状态摘要：显示 `global`、`fresh`、`stale`、`missing`。
- 语音插件端口：显示 `STT` 与 `TTS` adapter、状态和 fallback。
- 快照来源：显示 snapshot source、状态卡计数和错误摘要。
- 边界条：显示 `patrol_only`、`routing off`、`world write off`、`action off`。
- 巡逻发现：显示 missing、stale、conflict、read error 摘要。
- 焦点摘要：显示当前焦点标题和 gate。
- 对话日志：显示 reply、attention log、status refs、missing status。
- 输入区：保留禁用 STT 入口、文字输入和发送按钮。

## 数据来源

- `status_snapshot.v1`：状态摘要、缺失、过期、冲突、读错误。
- `StatusDialogueOutput`：reply、voiceText、thoughts、statusRefs、missingStatus。
- `StatusDialogueSpeechPortsState`：STT/TTS 端口状态。
- `FocusedGraphTarget`：当前粒子焦点、gate 和标题。
- `DEFAULT_STATUS_DIALOGUE_CONFIG`：当前 mode 和需求传递开关。

## 当前不做

- 不改变模型 IPC。
- 不接真实 STT/TTS。
- 不捕获麦克风。
- 不创建 `requirement_packet.v1`。
- 不写世界模型。
- 不触发外部动作。
- 不接真实人际关系图谱或事件图谱。

## 验收状态

- 用户可以一眼看到当前是 `patrol_only`。
- 缺失、过期、冲突和读错误有可见位置。
- 模型来源、本地 fallback、语音插件状态可见。
- 对话日志能显示 `status_refs` 和 `missing_status`。
- 输入区仍可文字交互，STT 按钮保持禁用预留态。
- 面板不阻塞 3D 粒子主视觉。
