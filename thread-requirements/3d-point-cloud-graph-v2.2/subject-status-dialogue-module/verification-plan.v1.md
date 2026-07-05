# 主体状态对话框验证方案 v1

状态：Phase 0/1/2 已验证，Phase 3 parser/guard、Phase 4 语音插件状态位和 Phase 5 巡逻窗口 UI 已纳入验证。

## 验证目标

验证当前实现只完成 Phase 0 和 Phase 1：

- 计划和说明文件已对齐。
- 核心契约和默认配置已建立。
- 现有对话框行为不破坏。
- 当前仍是 `patrol_only`。
- 不创建 `requirement_packet.v1`，不写入世界模型，不接真实 STT/TTS，不接真实人际或事件图谱。
- Phase 2 只读 `runtime/status-cards/*.json` 并生成内存态 `status_snapshot.v1`。
- Phase 3 只实现模型输出 parser、身份规则 guard 和本地 fallback 统一出口，不新增真实模型依赖。
- Phase 4 只实现 STT/TTS 插件状态位和 adapter 表达，不接真实语音工具。
- Phase 5 只整理右侧巡逻状态窗口，不接外部动作或真实图谱数据。

## 文档验证

命令：

```powershell
rg "verification-plan|Phase 0|Phase 1|patrol_only|SpeechToTextAdapter|TextToSpeechAdapter" D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\subject-status-dialogue-module
```

通过标准：

- `README.md` 能索引到 `verification-plan.v1.md`。
- `implementation-task-breakdown-plan.v1.md` 标明 Phase 0/1 是当前实现范围。
- 文档中明确当前不执行需求传递、不写世界模型、不接真实 STT/TTS。
- `phase2-status-read-implementation.md` 能说明 IPC、数据流和只读边界。

## 类型验证

命令：

```powershell
cd D:\zhineng\sightflow-desktop-agent-main
npm.cmd run typecheck
```

通过标准：

- `src/core/status-dialogue-contracts.ts` 被 node/web 两侧类型检查覆盖。
- `ZhinengConsole.tsx` 可引用共享契约类型。
- 不出现新的 TypeScript 错误。

## 构建验证

命令：

```powershell
cd D:\zhineng\sightflow-desktop-agent-main
npm.cmd run build
```

通过标准：

- Electron main、preload、renderer 构建通过。
- 现有 IPC `zhineng:status-dialogue:complete` 不改名。
- 新增 IPC `zhineng:status-dialogue:snapshot:get` 只读状态卡。

## 行为验证

检查项：

- 右侧 `Subject Status Dialogue` 面板仍可输入文字并得到回复。
- 状态行可显示 `cards fresh/stale/missing`。
- Electron IPC 不可用或模型缺 key 时仍走 `local fallback`。
- `voice off/on` 不影响文字输入输出。
- 输出仍保持第一人称主体表达和关注点摘要。
- 模型返回 JSON、纯文本或旁白式表达时，输出仍会被收束到主体身份规则。
- STT 关闭时文字输入仍可用。
- TTS 关闭时文字输出仍可用。
- TTS 只朗读 `voiceText`。
- UI 中可见当前模式、模型/来源、状态摘要、边界和状态引用。

通过标准：

- 对话框不因契约抽取而空白或报错。
- fallback 文案仍说明只读状态。

## 视觉验证

检查项：

- 打开 3D 粒子 OS 预览。
- 截图确认右侧对话框存在。
- 像素检查确认 3D canvas 非空白。

通过标准：

- 画布有大量非背景采样色。
- 面板中可见 `Subject Status Dialogue`。

## 边界验证

检查项：

- 搜索确认当前代码未创建 `requirement_packet.v1`。
- 搜索确认当前代码未写入 `runtime/status-snapshots`。
- 搜索确认当前代码未接入 `whisper.cpp`、`FunASR`、`Kokoro`、`CosyVoice`。
- 搜索确认当前代码未捕获麦克风或保存音频样本。

建议命令：

```powershell
rg "requirement_packet|world_model_requirement_inbox|runtime/status-cards|runtime/status-snapshots|whisper.cpp|FunASR|Kokoro|CosyVoice" D:\zhineng\sightflow-desktop-agent-main\src
```

通过标准：

- `runtime/status-cards` 只作为只读目录出现。
- `runtime/status-snapshots` 只作为未来输出配置预留出现。
- 当前没有真实需求传递、真实快照写入或真实语音插件接入。

## Phase 2 场景验证

建议用临时状态卡目录验证，不提交测试数据：

- `runtime/status-cards` 不存在：返回所有预期模块 missing。
- 有有效状态卡：fresh 计数增加。
- 有过期状态卡：stale 计数增加。
- 有坏 JSON：`read_errors` 出现文件名和摘要。
- 有重复 `module_id`：取最新卡并记录 conflict。

## Phase 3 场景验证

建议用 `ts-node/register` 直接验证共享契约函数：

- 模型返回 JSON：解析 `reply`、`voice`、`thoughts`、`status_refs`、`missing_status`。
- 模型返回纯文本：退回可用第一人称回复。
- 模型返回“系统当前……”：收束为“我当前……”。
- `thoughts` 中包含隐藏推理链提示：过滤为可见关注点摘要。
- 未启用能力：在日志中说明 `STT 未接入`、`需求传递未启用` 等边界。

## Phase 4 场景验证

- UI 中可见 `STT` / `TTS` 插件状态位。
- `STT` 显示 `off / text_input`，并且输入栏 STT 按钮禁用。
- `TTS` 显示当前 adapter 和 fallback，`voice on/off` 只影响语音输出，不影响文字交互。
- 3D 粒子图中 `status-dialogue-system` 星云可找到 `voice.stt_adapter`、`voice.tts_adapter`、`voice.voice_profile`、`voice.clone_profile`。
- 边界搜索不出现真实 STT/TTS 工具调用和音频样本写入。

## Phase 5 场景验证

- 右侧主体状态窗口显示 `mode`、`model`、`voice`。
- 状态摘要显示 `global`、`fresh`、`stale`、`missing`。
- 边界区显示 `patrol_only`、`routing off`、`world write off`、`action off`。
- 缺失、过期、冲突和读错误有可见展示区域。
- 对话日志可显示 `status_refs` 和 `missing_status`。
- 文字输入区仍可见，禁用 STT 入口不影响文字输入。
- 桌面截图和移动截图无明显重叠，3D canvas 非空白。
