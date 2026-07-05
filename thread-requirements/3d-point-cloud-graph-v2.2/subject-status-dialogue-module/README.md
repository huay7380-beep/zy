# 主体状态对话框模块

状态：Phase 0/1 真实实现入口已补齐，Phase 5 巡逻状态窗口 UI 已实现，主体状态对话框自有语音输入输出已启用，W3.0 浏览器短语唤醒闭环和完成任务定制播报已接入右下角 GUI。当前可只读状态卡、生成状态快照、约束主体状态对话输出、通过浏览器/Chrome STT 生成 transcript、通过 CosyVoice 统一音色输出 `voiceText`，浏览器 SpeechSynthesis 仅保留为环境能力检查，并以巡逻窗口展示身份、状态摘要、边界、来源、引用、W3 状态和完成播报 trace；不写世界模型、不执行需求传递。

本目录作为当前线程中“主体状态对话框”模块的统一需求入口。后续与该模块相关的新目标，默认先记录到本目录并完成目标对齐，再进入实现。

固定约定：

- 未来所有与主体状态对话框模块相关的新增目标、接口、插件候选、实现记录和验证记录，都优先写入本目录。
- 本目录说明文件必须保持同步和最新；实现前先对齐目标，确认后再改代码。
- 当前阶段只负责状态检查和巡逻；未来允许作为需求传递窗口，把用户或第三方需求转交给世界模型。
- Phase 2 不接真实 STT/TTS，不执行需求传递，不写入世界模型，不读取真实人际或事件图谱。

## 模块定位

主体状态对话框不是普通聊天机器人，也不是旁白式状态播报器。它是三维粒子系统中的“我”的状态表达层：

- 用第一人称说明当前系统状态、关注点、边界和下一步可检查方向。
- 优先简洁、低延迟、可语音输出。
- 可以接入线上小模型或本地小模型。
- 可以通过可替换 STT 插件接收语音输入，通过可替换 TTS 插件进行语音输出；当前语音输出已切换为 CosyVoice 统一音色、分块队列和短句缓存，浏览器 SpeechSynthesis 只保留为环境能力检查，不再作为可听混音 fallback。
- 可以读取其他模块主动发布的状态卡，而不是直接侵入其他模块运行链路。
- 当前作为状态检查员和巡逻官；未来可以作为世界模型与用户或第三方的对话窗口。
- 未来可以接入自我意识图谱，以系统整体目标和立场生成表达。
- 在其他模块缺失时，仍保留基本沟通、拟人表达和本地状态回退。

## 当前文件

- `module-goal-alignment.v1.md`：本轮新增目标的完整对齐稿。
- `module-goal-alignment.v2.md`：补充持续监听、语义理解、需求转译、抗噪、拟情感、声音克隆和实时信息边界后的完整目标对齐稿。
- `complete-dialogue-logic-interface-design.v1.md`：当前对话模块真实逻辑复核与完整目标对话逻辑方案，包含常规语音助手能力、状态巡检、需求转译、命令草案、上下游接口、运行状态机、3D 粒子 OS 映射和历史“完成后 TTS 播报”规则；该播报规则已在 `voice-event-broadcast-orchestrator-plan.v1.md` 中修正为系统事件权重编排。
- `voice-dialogue-heartbeat-requirement-supervision-plan.v1.md`：语音对话人性化、闲置心跳、闲聊兼巡检、口述需求草案、需求交接门和进程监督的完整方案草案；来源为想法池 `idea-0003`，等待用户确认后再进入版本计划或实现。
- `voice-dialogue-latency-optimization-plan.v1.md`：语音对话端到端延迟路径优化方案；来源为想法池 `idea-0004`，基于 STT、模型、TTS 和播放日志证据，提出首响快路径、STT 常驻桥接、模型快路由、TTS 分块/缓存和 `voice_latency_trace.v1`。
- `voice-output-pipeline-v0-v6-implementation-2026-06-28.md`：语音输出 V0-V6 实现记录，包含链路测速、统一音色、短句缓存、分句伪流式、播放队列、真流式 adapter 预留和情绪优先级。
- `voice-dialogue-xiaozhi-style-bridge-plan.v1.md`：路线 A 小智式语音会话桥接方案；来源为想法池 `idea-0006`，把小智的 hello/listen/stt/llm/tts/abort/emotion 数据流转译为主体状态对话框的虚拟设备事件，不接入 ESP32 烧录、OTA 或硬件绑定。
- `voice-event-broadcast-orchestrator-plan.v1.md`：系统事件语音播报编排器方案；来源为想法池 `idea-0007`，将完成提示升级为系统重大变动、星云变动、模块完成、风险和故障的按权重插入/合并/延后/打断播报，并补齐全系统反馈链路。
- `voice-event-broadcast-feedback-route-implementation-plan.v1.md`：`SCHEME-0007` 实施计划与进度记录，Phase 1-6 已完成首轮落点：事件契约、只读事件路由、最小语音事件编排器、事件队列 GUI、3D 映射和新增系统反馈路由清单。
- `system-feedback-route-manifest.v1.md`：Phase 6 新增系统反馈路由强制清单，定义 `system_feedback_route_manifest.v1` 的字段、示例、边界和验证入口。
- `w3-detector-adapter-readiness.v1.md`：W3 detector adapter 进入条件、前置契约、UI/3D 映射、待确认事项和边界；当前 W3.0 已允许通过显式开关启用浏览器短语闭环，真实本地唤醒词仍保留为后续 W3.1。
- `w3-browser-phrase-completion-notice-implementation-2026-06-28.md`：W3.0 browser phrase detector 执行阶段与完成任务定制播报实现记录，包含右下角 GUI 控制、3D 映射、数据流、边界和验证记录。
- `priority-requirement-classification.v1.md`：当前优先级纠偏记录；先跑通完整流畅对话和多音色/克隆声音交互，再做系统节点与进度审查。
- `p0-voice-profile-tts-clone-implementation-plan.v1.md`：P0 语音闭环、多音色、克隆声音、`voice_profile.v1`、`clone_profile.v1`、可替换 TTS adapter 和音色选择 UI 的待确认实施计划。
- `incremental-capability-completion-and-split-plan.v1.md`：上一版不完全具备内容补全计划，作为历史基线保留。
- `incremental-capability-completion-and-split-plan.v2.md`：当前推荐执行计划；在已开始核心契约拆分的基础上，采用边构建新功能边拆分代码目录的方式，列出补齐阶段、拆分落点、验证方式和待确认点。
- `state-read-contract.v1.md`：其他模块向主体状态对话框暴露状态的只读契约草案。
- `demand-routing-and-patrol-boundary.v1.md`：当前巡逻边界与未来需求传递边界。
- `identity-response-rules.v1.md`：主体身份回答标准规则，确保第一人称表达不跑偏。
- `implementation-task-breakdown-plan.v1.md`：当前目标的任务拆分、输入输出、状态读取、边界、3D 粒子 OS 投射和实现阶段计划。
- `implementation-progress.v1.md`：当前实现进度、已验证内容、未完成内容和下一步建议。
- `verification-plan.v1.md`：Phase 0/1 的文档、类型、构建、行为、视觉和边界验证方案。
- `phase0-phase1-real-implementation.md`：Phase 0/1 真实环境检查、模型 API 探测、UI 映射、3D 星云映射和边界记录。
- `phase2-status-read-implementation.md`：Phase 2 总系统状态读取的实现记录、IPC、数据流和边界。
- `phase4-voice-plugin-interface.md`：Phase 4 语音输入输出插件接口、UI 状态位和 3D 映射记录。
- `phase5-patrol-window-ui.md`：Phase 5 巡逻状态窗口 UI 结构、数据来源和边界记录。
- `phase6-voice-io-real-implementation.md`：主体状态对话框浏览器 STT/TTS 真实输入输出实现记录。
- `phase7-cosyvoice-tts-adapter-implementation.md`：CosyVoice local_http TTS adapter、health/synthesize IPC、默认配置、fallback 和验证记录。
- `phase8-local-cosyvoice-deepseek-real-chain-2026-06-25.md`：本地 CosyVoice 部署、DeepSeek `deepseek-v4-flash` 接入、Electron IPC 完整链路和 Audio.play 验证记录。
- `implementation-progress.v1.md`：已同步 2026-06-25 Chrome STT Bridge 恢复记录，说明真实 Chrome Web Speech 伴随页、隐藏模式、专用 profile、事件回传和 fallback 边界。
- `voice-io-plugin-candidates.2026-06-22.md`：TTS 与 STT 插拔候选清单，包含星标、更新、增长信号、硬件档位。
- `tts-selection-shortlist.2026-06-25.md`：当前针对主体状态对话框的 TTS 候选短名单；明确浏览器 voice list 当前已实现，Kokoro、Piper、CosyVoice、GPT-SoVITS 作为后续真实 adapter 候选。
- `voice-output-options.2026-06-22.md`：早期语音输出候选快照，后续以 `voice-io-plugin-candidates.2026-06-22.md` 为主。
- `confirmation-checklist.v1.md`：进入实现前需要用户确认的决策点。

## 与旧文档关系

父目录中的以下文件保留为历史快照，不立即移动，避免影响其他线程引用：

- `subject-status-dialogue-small-model-task.md`
- `status-dialogue-system-feature-list.md`

本目录从现在开始作为该模块的后续需求收口位置。
# 2026-06-29 Dialogue Policy 规则收拢

- `dialogue-policy.v1.md`：主体状态对话框的统一对话规则源，已纳入“同级模块复用优先”执行前置规则。
- 新目标执行前必须先检查同级模块、相近子粒子、相近契约和已有板块；能延申、能添加、能套用时，不新建并列规则、并列板块或并列星云。
- 巡检结果插入统一采用新增派生格式 `patrol_finding_insert.v1`；它不替代 `module_status_card.v1`、`status_snapshot.v1` 或 `module_status_event.v1`。
- 需求传递的新口径为：用户确认后可生成 `requirement_packet.v1` 并写入 `world_model_requirement_inbox`，但主体状态对话框不直接改写世界模型事实状态。
- 3D 粒子 OS 归属继续固定为 `status-dialogue-system`；新增 policy、巡检插入、需求传递、小智状态机映射均作为该星云下的子能力表达。

## 2026-07-03 MCP Capability Gateway Plan

- `mcp-capability-gateway-implementation-plan.v1.md`: MCP 能力网关待确认实现计划。
- 当前结论：不重写天气、搜索、计算等普通工具；由 MCP / 外部集成平台或本地只读 adapter 承载真实能力。
- 当前模块只建设 `capability_gateway.v1`、`capability_registry.v1`、能力意图路由、边界 gate、结果编排、UI/TTS 展示和 `status-dialogue-system` 3D 子粒子映射。
- 当前阶段默认只读；不写世界模型，不创建 `requirement_packet.v1`，不执行外部动作。
