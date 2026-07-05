# 系统主体状态对话系统功能清单

状态：当前线程新增的 3D 粒子云星云模块说明。本文档用于需求对齐，不替代正式架构文档。

## 当前已实现

- 3D 粒子云新增 `status-dialogue-system` 星云模块。
- 该模块已写入 `graph_projection_fixture.v1.json`，并出现在 `particle-nebula-node-inventory.md`。
- UI 右侧新增状态对话面板，支持文字输入和文字输出。
- 支持第一人称和第三人称两种输出视角，默认聚焦第一人称主体输出。
- 支持浏览器语音合成输出开关。
- 支持通过 Electron IPC 接入当前配置的第三方 OpenAI-compatible 小模型。
- 小模型提示词版本为 `subject_status_dialogue.first_person.v1`，要求输出 `reply`、`voice` 和 `thoughts` JSON。
- `reply` 和 `voice` 均要求以“我”的主体口吻输出，避免旁白式状态播报。
- 日志区展示关注点摘要，包括焦点、边界、风险和下一检查点。
- 对话回答只读取本窗口的拓扑状态、当前焦点、owner、gate、compass、星点数量和边界。
- 对话系统保持只读，不执行工具，不读取真实人际关系图谱或真实事件图谱。

## 完整功能目标

- 全局状态检查：检查所有子系统、子模块、星云、内容星点、当前焦点和运行叠加态。
- 子系统索引：按模块、星点、负责方、闸口、罗盘和关键词建立状态索引。
- 模块健康探针：检查模块是否缺少 owner、gate、compass、状态说明、来源引用和边界说明。
- 模型接入：通过可替换 adapter 接入对话模型，输入限定为状态索引和用户问题。
- 意识层接入：接入自我意识风格、目标权重、主体状态和安全范围，形成一致的主体表达。
- 第一人称输出：以“我”的主体口吻说明当前状态。
- 简洁语音输出：语音句比文本更短，避免普通模型式长篇播报。
- 文字对话：支持多轮追问、上下文承接、摘要、比较、解释和状态追踪。
- 语音输入：未来接入语音识别，将语音转换成状态查询。
- 多模态对话：未来接入屏幕、图像、文档、网络和设备状态作为只读上下文。
- 检索增强：从拓扑、fixture、状态快照和只读 adapter 中检索相关状态。
- 工具调用位：只允许接入只读检查工具；任何写入、发送、设备控制或外部动作必须进入行动层和末端安全审查。
- 对话记忆：保留当前窗口的短上下文，未来可接入长期记忆和回放依据。
- 效率优先缓存：缓存高频状态摘要，避免每次问答扫描全部模块。
- 风险说明：对风险、接口、边界和不确定状态进行明确标记。
- 风格约束：默认以第一人称主体回答，不使用普通模型的旁白式解释。
- 推理边界：只展示可审计关注点摘要，不展示隐藏推理链。

## 3D 粒子云映射

- domain：`status-dialogue-system`
- compass prefix：`status_dialogue`
- owner：`Subject Status Dialogue Runtime`
- gate：`status_dialogue_read_only_gate`
- 上游：`world-state`、`projection-contracts`、`visual-os`
- 下游：状态说明、焦点解释、只读问答、语音输出、未来模型 adapter

当前关键星点：

- `global_state_scan`
- `subsystem_status_index`
- `module_health_probe`
- `model_adapter`
- `small_model_ipc_adapter`
- `first_person_prompt_contract`
- `input_port.user_query`
- `input_port.focus_context`
- `output_port.first_person_reply`
- `output_port.voice_line`
- `output_port.attention_log`
- `constraint.no_narrator`
- `constraint.minimal_voice`
- `constraint.no_hidden_cot`
- `fallback.local_status`
- `awareness_layer_bridge`
- `self_awareness_style`
- `first_person_voice`
- `third_person_voice`
- `text_input`
- `text_output`
- `speech_synthesis`
- `voice_dialogue`
- `conversation_memory`
- `retrieval_router`
- `tool_function_calling`
- `multimodal_dialogue_slot`
- `efficiency_first_cache`
- `state_only_boundary`

## 接入边界

- 当前模型调用只服务主体状态对话，不启动自动回复、不发送消息、不控制设备。
- 网页预览模式没有 Electron IPC，因此只走本地回退。
- 当前实现不连接麦克风语音识别。
- 当前实现不读取 `data/people/**` 或 `data/events/**`。
- 当前实现不触发工具调用、设备控制、平台发送或外部写入。
- 未来接入模型时，模型输出仍应回到状态解释层，不直接越过行动层。
