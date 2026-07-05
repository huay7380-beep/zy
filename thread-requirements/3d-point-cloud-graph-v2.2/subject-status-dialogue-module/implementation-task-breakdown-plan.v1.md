# 主体状态对话框实现任务拆分与计划 v1

状态：Phase 5 巡逻状态窗口 UI 已实现。当前已完成总系统状态读取、模型输出 parser/guard、STT/TTS adapter 状态表达，以及右侧主体状态对话框的巡逻窗口结构。

## 目标范围

本计划只针对 `subject-status-dialogue-module`。当前阶段目标是把主体状态对话框稳定做成“状态检查和巡逻官”，并为未来语音输入输出、自我意识图谱、世界模型需求传递预留清晰接口。

当前阶段实现：

- 输入归一化：文字输入、未来语音转写输入、3D 焦点、状态快照、默认主体配置。
- 状态读取：通过模块状态卡聚合总系统状态，不直接侵入其他模块。
- 对话表达：接入远程/本地小模型 adapter，按身份规则生成第一人称输出。
- 巡逻日志：输出可审计关注点、缺失状态、风险和引用来源。
- 语音接口：先实现 STT/TTS 插件接口和 fallback，不强绑具体工具。
- 3D 投射：在世界系统三维粒子 OS 中表达所有端口、功能、数据流和下级实现位置。

当前阶段暂缓：

- 真实世界模型需求传递。
- 真实自我意识图谱推理。
- 真实语音克隆训练。
- 直接接入人际关系图谱或事件图谱真实数据。
- 外部动作执行、发送、设备控制、写入其他模块。

## 总体架构

```text
text_input / audio_input
  -> input_normalizer
  -> dialogue_context_builder
       <- focus_context from 3D particle OS
       <- status_snapshot.v1 from status aggregator
       <- self_awareness_profile from default profile or future self graph
  -> StatusDialogueModelAdapter
  -> identity_response_guard
  -> structured_dialogue_output
       -> UI text reply
       -> attention log
       -> TTS voice_line
       -> 3D particle status projection
```

总系统状态读取链路：

```text
module runtimes
  -> module_status_card.v1 files or read-only endpoints
  -> StatusSnapshotAggregator
  -> status_snapshot.v1
  -> subject status dialogue context
```

未来需求传递链路：

```text
user_or_third_party_requirement
  -> dialogue_intake
  -> requirement_packet.v1
  -> world_model_requirement_inbox
  -> world_model_review_gate
```

## 阶段拆分

### Phase 0：确认和冻结计划

目的：确认本计划作为后续实现依据。

任务：

- 确认当前阶段只做状态检查和巡逻。
- 确认所有对话框模块内容继续归口到本目录。
- 确认状态读取采用 `module_status_card.v1 -> status_snapshot.v1`。
- 确认语音输入输出均为插件化接口。
- 确认 3D 粒子图需要同步表达所有功能和数据流。

产出：

- 本计划确认版。
- 进入实现的任务清单。
- `verification-plan.v1.md`。

Phase 0 验收：

- `README.md`、本计划和 `verification-plan.v1.md` 的当前边界一致。
- 当前阶段明确为 `patrol_only`，不执行需求传递，不写世界模型，不接真实 STT/TTS。

### Phase 1：核心数据契约和配置骨架

目的：先把输入输出契约、配置项和边界固定，减少后续 UI 与 runtime 冲突。

任务：

- 定义 `StatusDialogueConfig`。
- 定义 `DialogueInputEnvelope`。
- 定义 `StatusDialogueContext`。
- 定义 `StatusDialogueOutput`。
- 定义 `StatusDialogueModelAdapter`。
- 定义 `SpeechToTextAdapter`。
- 定义 `TextToSpeechAdapter`。
- 定义 `SelfAwarenessProfileRef` 默认结构。

建议配置结构：

```json
{
  "schema": "status_dialogue_config.v1",
  "mode": "patrol_only",
  "model": {
    "lane": "remote_small_model",
    "provider": "openai_compatible",
    "model": "configurable",
    "base_url": "configurable",
    "local_runtime": "none"
  },
  "speech_input": {
    "enabled": false,
    "adapter": "none",
    "fallback": "text_input"
  },
  "speech_output": {
    "enabled": true,
    "adapter": "browser_speech_synthesis",
    "fallback": "text_only"
  },
  "status_read": {
    "snapshot_path": "runtime/status-snapshots/current-status-snapshot.json",
    "card_dir": "runtime/status-cards",
    "ttl_ms": 30000
  },
  "identity": {
    "rules": "identity-response-rules.v1",
    "default_persona": "first_person_patrol"
  },
  "future_requirement_forwarding": {
    "enabled": false,
    "target": "world_model_requirement_inbox"
  }
}
```

验收：

- 配置结构能表达远程模型、本地模型、STT、TTS、状态读取、自我意识默认配置和未来需求传递开关。
- 当前默认 `mode` 必须是 `patrol_only`。
- `src/core/status-dialogue-contracts.ts` 提供共享类型、默认配置和最小归一化函数。
- `ZhinengConsole.tsx` 引用共享契约类型，现有本地 fallback、第一人称输出和浏览器语音输出保持可用。
- `npm.cmd run typecheck` 和 `npm.cmd run build` 通过。

### Phase 2：总系统状态读取实现

目的：让对话框快速知道“全局有哪些模块、哪些新鲜、哪些缺失、哪些有风险”，同时不影响其他模块进程。

实现状态：

- 已扩展 `StatusSnapshot`、`ExpectedStatusModule`、`StatusSnapshotRequest`、`StatusSnapshotReadResult`。
- 已提供 `normalizeModuleStatusCard` 和 `buildStatusSnapshotFromCards`。
- 已新增只读 IPC `zhineng:status-dialogue:snapshot:get`。
- 已在右侧对话框显示 `cards fresh/stale/missing` 状态行。

输入：

| 输入 | 来源 | 说明 |
| --- | --- | --- |
| `module_status_card.v1` | 各模块主动发布 | 单模块轻量状态卡 |
| `expected_modules_registry` | 3D fixture 或配置 | 预计应该出现的模块列表 |
| `now` | runtime clock | 计算新鲜度和过期状态 |

输出：

| 输出 | 去向 | 说明 |
| --- | --- | --- |
| `status_snapshot.v1` | 对话框上下文 | 聚合后的全局状态 |
| `missing_status[]` | UI 和日志 | 缺失或未发布状态卡的模块 |
| `stale_status[]` | UI 和日志 | 超过 ttl 的状态卡 |
| `patrol_findings[]` | 模型上下文和日志 | 巡逻关注点 |

建议状态卡落点：

```text
runtime/status-cards/<module_id>.json
runtime/status-snapshots/current-status-snapshot.json
```

聚合规则：

- 只读取状态卡，不启动模块。
- 状态卡过期时标为 `stale`，不删除。
- 缺失状态卡时标为 `missing`，不猜测。
- 多个状态冲突时标为 `conflict`，交给日志说明。
- 聚合器输出可缓存，避免每次问答全量扫描。

验收：

- 对话框能够回答“我目前收到多少模块状态、哪些缺失、哪些过期”。
- 缺失状态不被伪造成真实状态。
- 其他模块没有状态卡时也不影响对话框基本可用。
- Phase 2 不写入 `runtime/status-snapshots/current-status-snapshot.json`。
- Phase 2 不创建 `requirement_packet.v1`。

### Phase 3：对话模型和身份规则实现

目的：将输入上下文交给小模型或本地回退，并保证输出符合主体身份规则。

实现状态：

- 已在 `src/core/status-dialogue-contracts.ts` 中新增 `guardStatusDialogueOutput`。
- 已在 `src/core/status-dialogue-contracts.ts` 中新增 `parseStatusDialogueModelOutput`。
- 已为远程 OpenAI-compatible 对话通道补充 adapter 标识。
- 已让本地 fallback、浏览器预览 fallback、模型失败 fallback 和远程模型成功返回都经过统一身份 guard。
- 已扩展模型提示词，要求输出 `reply`、`voice`、`thoughts`、`status_refs`、`missing_status`。
- 已将 `thoughts` 限定为可审计关注点摘要，并过滤隐藏推理链类表达。
- 当前仍不新增真实模型依赖，不接本地模型 runtime。

输入：

| 输入 | 说明 |
| --- | --- |
| `user_query` | 用户文字或 STT 转写文本 |
| `focus_context` | 当前 3D 粒子焦点、层级、选中模块 |
| `status_snapshot` | 总系统状态快照 |
| `identity_rules` | 第一人称回答规则 |
| `self_awareness_profile` | 当前默认主体配置，未来接自我意识图谱 |

输出：

| 输出 | 说明 |
| --- | --- |
| `reply` | 第一人称文字回答 |
| `voice_line` | 更短语音输出文本 |
| `attention_log` | 可审计关注点摘要 |
| `status_refs` | 使用到的状态卡或粒子节点 |
| `missing_status` | 明确缺失项 |
| `mode` | `patrol_only` 或未来 `requirement_forwarding_ready` |

实现任务：

- 封装远程 OpenAI-compatible adapter。
- 预留本地模型 adapter。
- 加入结构化输出 parser。
- 加入身份规则 guard。
- 加入本地 fallback 输出。
- 将日志限定为关注点摘要，不展示隐藏推理链。

验收：

- 默认回答以“我”开头或以主体视角表达。
- 不使用旁白式“系统当前正在……”作为默认输出。
- 未接入能力必须说明未接入。
- 模型失败时本地 fallback 仍能回答状态。
- 模型返回纯文本时仍能归一为第一人称状态回答。
- 模型返回旁白式“系统当前……”时会被收束为“我当前……”。
- `status_refs` 与 `missing_status` 能作为结构化字段保留给 UI 和后续 3D 投射。

### Phase 4：语音输入输出插件接口

目的：让语音输入和语音输出从一开始就是可替换插件，而不是写死某个工具。

实现状态：

- 已定义 `StatusDialogueSpeechPortState`。
- 已定义 `StatusDialogueSpeechPortsState`。
- 已提供 `buildStatusDialogueSpeechPortsState`。
- 已在右侧主体状态对话框展示 `STT` / `TTS` 插件状态位。
- 已在输入栏预留禁用的 `STT` 入口。
- 已把 `voice.stt_adapter`、`voice.tts_adapter`、`voice.voice_profile`、`voice.clone_profile` 映射到 `status-dialogue-system` 星云。
- 当前不捕获麦克风，不运行 STT，不保存音频样本。
- 当前 TTS 仍只使用浏览器 SpeechSynthesis fallback，且只朗读 `voice_line` / `voiceText`。

输入链路：

```text
microphone/audio_file
  -> SpeechToTextAdapter
  -> transcript
  -> DialogueInputEnvelope.user_query
```

输出链路：

```text
StatusDialogueOutput.voice_line
  -> TextToSpeechAdapter
  -> playable_audio
  -> speaker/output device
```

第一阶段任务：

- UI 预留语音输入按钮和插件状态位。
- 定义 `SpeechToTextAdapter` 接口。
- 定义 `TextToSpeechAdapter` 接口。
- TTS 先保留浏览器 SpeechSynthesis fallback。
- STT 默认关闭，保留文字输入 fallback。
- 插件不可用时显示明确 fallback reason。

第二阶段候选：

- STT：`whisper.cpp` 或 `FunASR`。
- TTS：`Kokoro` 或 `CosyVoice`。

验收：

- 关闭 STT 时，文字输入不受影响。
- 关闭 TTS 时，文字输出不受影响。
- TTS 只朗读 `voice_line`，不朗读完整上下文。
- 插件状态能在 UI 和 3D 粒子图中显示。

### Phase 5：UI 结构优化

目的：让右侧主体状态对话框成为可扫读的状态窗口，而不只是聊天框。

实现状态：

- 已新增顶部身份状态：当前 mode、模型/来源、语音输出状态。
- 已新增状态摘要：global、fresh、stale、missing。
- 已保留并强化语音区：STT/TTS adapter 状态、fallback 和禁用 STT 入口。
- 已新增来源区：snapshot source、状态卡计数、错误摘要。
- 已新增边界区：`patrol_only`、`routing off`、`world write off`、`action off`。
- 已新增巡逻发现区：missing、stale、conflict、read errors。
- 已让对话日志显示 `status_refs` 和 `missing_status`。
- 当前仍不改变模型 IPC、不接真实 STT/TTS、不执行需求传递。

建议 UI 分区：

- 顶部身份条：`first person patrol`、当前模式、模型来源、语音插件状态。
- 状态摘要：全局状态、状态卡数量、缺失数量、过期数量。
- 对话日志：第一人称 reply、attention_log、status_refs。
- 输入区：文字输入、未来语音输入按钮、发送按钮。
- 语音区：voice on/off、音色 profile、TTS provider。
- 边界区：当前只读巡逻、未启用需求传递。

验收：

- 用户可以一眼看出当前是巡逻模式，不是执行模式。
- 缺失状态和过期状态可见。
- 模型来源、本地 fallback、语音插件状态可见。
- UI 不阻塞 3D 粒子操作。
- 对话日志可追踪本次回答引用的状态卡或缺失项。

### Phase 6：世界系统三维粒子 OS 投射

目的：把主体状态对话框的所有功能、端口、数据流和下级实现都投射到 3D 粒子 OS 中。

建议在 `status-dialogue-system` 星云中拆为 8 个子云团：

| 子云团 | 表达内容 | 代表星点 |
| --- | --- | --- |
| `role_cloud` | 当前角色与未来角色 | `role.status_patrol_officer`、`role.world_model_dialogue_window` |
| `input_cloud` | 输入端口 | `input.text`、`input.audio_stream`、`input.focus_context`、`input.status_snapshot` |
| `state_read_cloud` | 总系统状态读取 | `state_port.module_status_card`、`state_port.status_snapshot`、`state_port.missing_status_fallback` |
| `model_cloud` | 小模型和本地模型 | `model_lane.remote_small_model`、`model_lane.local_small_model`、`model_adapter.openai_compatible` |
| `identity_cloud` | 主体身份规则 | `constraint.first_person_subject`、`constraint.no_narrator`、`identity.response_rules` |
| `voice_cloud` | 语音输入输出 | `voice.stt_adapter`、`voice.tts_adapter`、`voice.voice_profile`、`voice.clone_profile` |
| `output_cloud` | 输出端口 | `output.reply`、`output.voice_line`、`output.attention_log`、`output.status_refs` |
| `future_route_cloud` | 未来需求传递 | `port.requirement_packet`、`port.world_model_requirement_inbox`、`gate.world_model_review_gate` |

数据流边建议：

```text
input.text -> dialogue_context_builder
input.audio_stream -> voice.stt_adapter -> input.user_query
input.focus_context -> dialogue_context_builder
state_port.module_status_card -> state_port.status_snapshot -> dialogue_context_builder
self_awareness.default_profile -> dialogue_context_builder
dialogue_context_builder -> model_adapter -> identity.response_rules
identity.response_rules -> output.reply
identity.response_rules -> output.voice_line -> voice.tts_adapter
identity.response_rules -> output.attention_log
future.requirement_forwarding -> port.requirement_packet -> gate.world_model_review_gate
```

下级实现投射：

- 每个 adapter 是一个可点击星点。
- 每个输入输出端口是一个小型端口星点。
- 每个状态卡是一颗可聚合状态星。
- 每个缺失/过期/冲突状态是一颗风险提示星。
- 每条数据流是一条可悬停边，显示 source、target、schema、boundary。
- 点击子云团放大后显示对应 schema、配置项、fallback 和验收状态。

验收：

- 3D 粒子图能表达当前所有已设计能力。
- 当前实现和未来预留能力有不同状态标记。
- 用户能从星云看出“输入、状态读取、模型、身份、语音、输出、未来需求传递”的完整链路。

### Phase 7：验证和验收

目的：确保当前功能不影响其他线程、不丢失原有功能、可回退、可观察。

验证项：

- 构建通过。
- 网页预览打开。
- 3D 粒子非空白，端口星点可见。
- 右侧对话框可文字输入输出。
- 模型不可用时 fallback 可用。
- 状态快照缺失时能明确提示。
- 语音插件关闭时不影响文字交互。
- 当前模式不执行需求传递。

建议命令：

```text
npm.cmd run build
```

可视验证：

- 打开 3D 粒子 OS 预览。
- 截图确认 `status-dialogue-system` 子云团和右侧对话框。
- 像素检查确认 canvas 非空白。

## 任务包清单

| 任务包 | 名称 | 依赖 | 当前阶段 |
| --- | --- | --- | --- |
| T1 | 数据契约和配置骨架 | 用户确认 | 第一阶段 |
| T2 | 状态卡和状态快照聚合 | T1 | 第一阶段 |
| T3 | 对话上下文构建器 | T1、T2 | 第一阶段 |
| T4 | 小模型 adapter 和 fallback | T1、T3 | 第一阶段 |
| T5 | 身份规则 guard | T3、T4 | 第一阶段 |
| T6 | UI 状态窗口优化 | T2、T5 | 第一阶段 |
| T7 | STT/TTS 插件接口 | T1 | 第一阶段 |
| T8 | 3D 粒子投射同步 | T1-T7 | 第一阶段 |
| T9 | 真实 STT/TTS 工具接入 | T7 | 第二阶段 |
| T10 | 自我意识图谱桥接 | T3、世界图谱准备 | 第三阶段 |
| T11 | 世界模型需求传递 | 世界模型 inbox 准备 | 第四阶段 |

## 第一阶段建议实现顺序

1. 新增 schema 和类型，不改变现有 UI 行为。
2. 加入状态卡样例和快照聚合器。
3. 将对话框上下文改为读取 `status_snapshot.v1`。
4. 加入身份规则 guard 和结构化输出校验。
5. 优化 UI 状态分区。
6. 加入 STT/TTS 插件接口和 fallback 状态显示。
7. 同步 3D 粒子星云节点和数据流边。
8. 构建、预览、截图验证。

## 边界总表

| 项目 | 当前阶段 | 未来阶段 |
| --- | --- | --- |
| 文字输入 | 允许 | 允许 |
| 语音输入 | 只做接口和 fallback | 插件接入 |
| 语音输出 | 浏览器 fallback / 接口 | 插件接入、音色和克隆 |
| 状态读取 | 只读状态卡和快照 | 仍只读，除非对应模块授权 |
| 人际关系图谱 | 不接真实数据 | 通过状态卡和正式接口接入 |
| 事件图谱 | 不接真实数据 | 通过状态卡和正式接口接入 |
| 自我意识图谱 | 默认主体配置 | 图谱摘要接入 |
| 需求传递 | 记录和对齐 | `requirement_packet.v1` 到世界模型 |
| 外部动作 | 不允许 | 仍需行动层和安全审查 |
| 隐藏推理链 | 不展示 | 不展示 |

## 待用户确认点

1. 是否确认第一阶段只实现 T1-T8。
2. 是否确认状态读取落点暂定为 `runtime/status-cards` 和 `runtime/status-snapshots`。
3. 是否确认 3D 粒子 OS 中采用 8 个子云团表达该模块。
4. 是否确认 STT/TTS 第一阶段只做插件接口，不接真实工具。
5. 是否确认需求传递只作为未来 `requirement_packet.v1` 预留，不在当前阶段执行。
6. 是否确认 UI 优化以“巡逻状态窗口”为核心，而不是普通聊天窗口。
