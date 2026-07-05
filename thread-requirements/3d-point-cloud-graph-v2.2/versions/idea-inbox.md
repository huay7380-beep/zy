# 想法池

状态：草案，等待版本规则确认后正式启用。

用途：承接用户“想到哪里说到哪里”的临时目标、灵感和补充要求。这里的内容不占用 `0.0.XX` 版本号，不代表已确认，不代表进入实现。

## 系统归属

每条想法必须先标记主归属系统，必要时再标记关联系统。归属用于决定它将来进入哪个版本、哪个模块、哪个 3D 星云和哪个负责人闸口。

| System | 用途 |
| --- | --- |
| `version-governance` | 版本、想法池、多线程协作、验收和 TTS 协作规则 |
| `status-dialogue-system` | 主体状态对话框、巡逻窗口、语音输入输出、对话记忆 |
| `world-system-3d-os` | 世界系统三维粒子 OS、星云拓扑、视觉操作系统 |
| `projection-contracts` | 3D 节点投射、目录、接口映射、状态可追溯规则 |
| `interpersonal-assistant` | 人际关系辅助系统及其接入边界 |
| `event-graph-system` | 事件图谱、全域事件图谱和事件抽取映射 |
| `voice-loop` | STT、TTS、音色、声音克隆、语音闭环体验 |
| `runtime-integration` | IPC、状态卡、运行时目录、外部模型和适配器 |

## 记录格式

| ID | Time | Source | Idea Summary | Primary System | Related Systems | Suggested Entry | Promotion Trigger | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| idea-0001 | 2026-06-27 | current-thread | 建立 `idea_capture / mini_alignment / version_plan` 三层入口，适配用户边想边做的习惯 | version-governance | projection-contracts | version_plan | multi_thread_rule | drafted in `version-governance.v1.md` |
| idea-0002 | 2026-06-27 | current-thread | 想法池需要按系统归属记录需求；已实现功能的小调整回到原版本迭代；涉及新功能、跨模块、接口、状态读写、3D 映射或 UI 结构化时，必须形成明确方案后再落实；需要定义想法池内容如何推进成具体版本号 | version-governance | projection-contracts, world-system-3d-os | version_plan | promotion_rule | captured and mapped to `idea-pool-promotion-plan.v1.md` |
| idea-0003 | 2026-06-27 | current-thread | 优化语音对话模块：更人性化交流；闲置时通过心跳机制定时提醒和沟通；闲聊时仍保留其他模块巡检；把用户口述需求记录、转译、传达给目标模块；其他模块完成或到达节点时主动传送状态给语音对话模块；语音模块按事件状态、用户关注度和紧急程度进行特意提醒、对话插入提醒或闲置普通提醒；监督进程并定时反馈 | status-dialogue-system | voice-loop, runtime-integration, projection-contracts, world-system-3d-os | version_plan | new_feature, cross_module, interface_change, state_io, 3d_mapping, ui_structure | captured and mapped to `voice-dialogue-heartbeat-requirement-supervision-plan.v1.md` |
| idea-0004 | 2026-06-27 | current-thread | 当前语音对话模块响应速度极慢，需要进行端到端延迟路径优化；用户明确纠正：每一句语音播报都必须保持高质量 TTS 和统一音色体验，不能用低质量 TTS 作为常规快路径；延迟应通过流式、预热、缓存、并行、首句优先和高质量快速合成路径优化 | status-dialogue-system | voice-loop, runtime-integration, projection-contracts | version_plan | performance, interface_change, state_io, ui_structure, 3d_mapping, quality_policy | captured and mapped to `voice-dialogue-latency-optimization-plan.v1.md` |
| idea-0005 | 2026-06-27 | current-thread | 建立方案目录，用于 Codex 检查和归类新目标，也方便用户检查当前方案状态和实现情况；方案目录不替代想法池和版本目录，而是作为跨方案索引、状态总览和新目标归类入口 | scheme-directory | version-governance, projection-contracts, status-dialogue-system | version_plan | documentation_structure, classification_rule, status_tracking | captured and mapped to `scheme-directory/` |
| idea-0006 | 2026-06-28 | current-thread | 采用路线 A：借鉴小智语音机器人的快速反应、持续会话、情绪事件和状态协议，但不接入 ESP32 烧录、OTA、硬件按键或物理设备绑定；在主体状态对话框内实现 `xiaozhi_style_voice_bridge`，把现有 Chrome STT、本地 STT、状态对话模型、CosyVoice/browser TTS 映射成 hello/listen/stt/llm/tts/abort/emotion 事件；已补充唤醒词方案，当前默认仍为 `manual_click`，后续按 W1 配置骨架、W2 VAD 预检、W3 唤醒词 detector、W4 语义唤醒、W5 播放门控分阶段推进 | status-dialogue-system | voice-loop, runtime-integration, projection-contracts, world-system-3d-os | version_plan | new_feature, interface_change, state_io, ui_structure, 3d_mapping, latency, emotion_policy, wake_word | route A confirmed; wake-word staged plan captured in `voice-dialogue-xiaozhi-style-bridge-plan.v1.md` |
| idea-0007 | 2026-06-29 | current-thread | 将语音播报从“每轮固定完成提示”升级为“系统事件语音编排器”：当系统重大变动、星云变动、模块完成、风险、故障或确认节点出现时，由主体状态对话框接收事件，根据当前语音状态和事件权重插入、合并、延后、静默或紧急打断播报；同时补齐全系统巡检反馈路径，要求未来新增系统同步提供状态卡和状态事件出口 | status-dialogue-system | voice-loop, runtime-integration, projection-contracts, world-system-3d-os, scheme-directory | version_plan | new_feature, cross_module, interface_change, state_io, 3d_mapping, ui_structure, event_broadcast, feedback_route | Phase 1-3 implemented; mapped to `voice-event-broadcast-orchestrator-plan.v1.md`; Phase 4-6 pending |

## 使用规则

- 临时想法先进入 `idea_capture`，不占版本号。
- 同一功能内的小调整进入 `mini_alignment`，优先落回已有 `0.0.XX.N` 迭代。
- 新功能、跨模块接口、状态读写、3D 映射、UI 结构化和外部动作相关内容进入 `version_plan`。
- 每条想法必须记录 `Primary System`；跨系统时记录 `Related Systems`。
- 从想法池转成正式版本时，必须先完成 `idea-pool-promotion-plan.v1.md` 中的推进检查，再在 `version-ledger.md` 中登记新的 `0.0.XX.0`。

## 推进状态

| Status | 含义 |
| --- | --- |
| `captured` | 已收进想法池，未开始整理 |
| `triaged` | 已判断系统归属、入口层级和是否触发新版本 |
| `merged_to_existing_version` | 已归入已有版本的 backlog、open questions 或下一次 `0.0.XX.N` |
| `promoted_to_version_plan` | 已领取或准备领取 `0.0.XX`，进入方案版 |
| `superseded` | 被后续想法、版本或实现替代 |
| `rejected` | 明确不进入当前目标 |

## 推进入口

想法成熟后只允许走两条路：

1. 回到已有版本：适用于已实现功能的小调整、复测、体验修正、文档补充和不改变接口的优化。
2. 升级为新版本：适用于新功能、跨模块、接口变化、状态读写、3D 映射、UI 结构变化或边界变化。

禁止从想法池直接进入代码实现。

## 2026-06-28 idea-0006 执行同步

- `idea-0006` 已按路线 A 纳入 `SCHEME-0006`，并完成第一轮可执行拆分。
- 当前已实现范围：`W1 config skeleton` 与 `W2 VAD precheck`。
- W1 结果：新增 `xiaozhi_style_wake_config.v1`，默认保持 `manual_click`，持续监听和唤醒词均关闭；UI 与 3D 粒子 OS 已能表达 `voice.wake_word_gate`。
- W2 结果：新增 `xiaozhi_style_vad_precheck.v1` 和 `check vad`，仅做人声能量预检，不提交对话、不保存原始音频、不生成需求传递。
- W3 前置条件补齐：新增 `xiaozhi_style_wake_detector_adapter.v1`、`xiaozhi_style_wake_detector_state.v1`、`voice.wake_detector_adapter` 和 `w3-detector-adapter-readiness.v1.md`。
- 后续推进入口：`W3 keyword gate` 已具备进入 adapter 选型和最小接口实现的工程前置条件；但真实自动唤醒运行时仍需先确认 detector adapter、唤醒词策略、持续监听开关和回声门控。
- W3 规则修正：唤醒短语为 `小张`、`高手`、`小天才`，不保留 `张博`；TTS 播放期间暂停唤醒词 detector，而不是屏蔽输入；保存原始音频必须另开确认项和可见开关。
- 当前不占用新的正式 `0.0.XX` 版本号；仍作为 `idea-0006 / SCHEME-0006` 的阶段实现记录，等待版本治理正式确认。

## 2026-06-29 idea-0007 执行同步

- `idea-0007` 已按用户确认纳入 `SCHEME-0007`，并完成 Phase 1-6 首轮实现。
- 当前已实现范围：`module_status_event.v1` 契约、`system_event_snapshot.v1` 聚合、`voice_event_broadcast_request.v1`、`voice_broadcast_queue_state.v1`、`voice_script_patch.v1`、只读 `runtime/status-events` IPC、最小语音事件编排接入、事件队列 GUI、3D 粒子 OS 事件链路子粒子、`system_feedback_route_manifest.v1`。
- 当前验证结果：`npm.cmd run voice:event-broadcast:validate` 通过；`npm.cmd run typecheck` 通过；`npm.cmd run build` 通过。
- 当前后续范围：真实 GUI 复测、事件文件样例接入、心跳监督方案联动和真实系统事件来源接入。
- 当前边界保持：不自动创建 `requirement_packet.v1`，不写世界模型，不执行外部动作，不替代既有状态卡链路。
