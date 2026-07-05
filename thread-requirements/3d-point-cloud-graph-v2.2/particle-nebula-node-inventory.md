# Particle Nebula Node Inventory

Status: mechanically exported from current UI nebula constants; aligned with `graph_projection_fixture.v1.json`.

Total: 18 nebula modules plus 1 core, 216 content stars.

## 世界系统核心

- id: `world-core`
- owner: `World System Architecture`
- gate: `core_alignment_gate`
- compass: `core`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| graph_projection_vnext | 只读投影契约 | `core.contract.projection` | 0.96 |
| visual_operation_intent | 视觉操作意图 | `core.contract.intent` | 0.92 |
| source_refs | 来源追溯 | `core.evidence.source_refs` | 0.88 |
| 独立视觉态 | 暂不接入真实图谱 | `core.boundary.independent` | 0.84 |
| 对象状态分离 | 事实/假设/预测/行动分层 | `core.semantic.object_state` | 0.9 |
| confirmed_fact | 可确认事实 | `core.semantic.confirmed_fact` | 0.86 |
| candidate boundary | 候选不等于事实 | `core.semantic.candidate` | 0.84 |
| auditability | 可审计路径 | `core.governance.audit` | 0.82 |
| visual-first boundary | 纯视觉不取消契约 | `core.visual.boundary` | 0.8 |
| first real module | 人际辅助系统接入位 | `core.integration.social_first` | 0.78 |

## 外部世界来源

- id: `external-world`
- owner: `Intake and Sensor Layer`
- gate: `source_intake_gate`
- compass: `external_world`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| 语音 | ASR 输入 | `external_world.voice-source` | 0.78 |
| 图像 | 视觉输入 | `external_world.image-source` | 0.78 |
| 屏幕 | 桌面上下文 | `external_world.screen-source` | 0.86 |
| 位置 | 时空来源 | `external_world.location-source` | 0.7 |
| 文档 | 文本证据 | `external_world.document-source` | 0.8 |
| 网络 | 外部信息 | `external_world.network-source` | 0.82 |
| 设备 | 设备观测 | `external_world.device-source` | 0.72 |
| 软件/API/插件 | 能力来源 | `external_world.software-source` | 0.84 |

## 感知与融合

- id: `perception-fusion`
- owner: `Perception Fusion Layer`
- gate: `observation_fusion_gate`
- compass: `perception`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| Sensor Registry | 来源登记 | `perception.sensor-registry` | 0.78 |
| 统一时空坐标 | 校准前置 | `perception.calibration-time-space` | 0.88 |
| Observation Atom | 最小观测 | `perception.observation-atom` | 0.96 |
| Fusion Bundle | 融合候选 | `perception.fusion-bundle` | 0.94 |
| 传感器-属性矩阵 | 五矩阵之一 | `perception.sensor-property-matrix` | 0.76 |
| 传感器-实体矩阵 | 五矩阵之一 | `perception.sensor-entity-matrix` | 0.76 |
| 传感器-事件矩阵 | 五矩阵之一 | `perception.sensor-event-matrix` | 0.76 |
| 传感器-互补矩阵 | 五矩阵之一 | `perception.sensor-complement-matrix` | 0.74 |
| 传感器-写入矩阵 | 五矩阵之一 | `perception.sensor-write-matrix` | 0.8 |
| 冲突处理 | 冲突记录 | `perception.conflict-record` | 0.82 |
| 潜变量层 | 不可见驱动 | `perception.latent-variable-perception` | 0.8 |
| 物理概念定义库 | 概念解释 | `perception.physical-concept-library` | 0.78 |

## 事件抽取层

- id: `event-extraction`
- owner: `Event Extraction Layer`
- gate: `event_candidate_gate`
- compass: `event_extraction`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| 谁 | 参与者 | `event_extraction.event-who` | 0.82 |
| 何时 | 时间字段 | `event_extraction.event-when` | 0.8 |
| 何地 | 空间字段 | `event_extraction.event-where` | 0.76 |
| 做了什么 | 行为字段 | `event_extraction.event-what` | 0.84 |
| 影响了谁 | 影响对象 | `event_extraction.event-impact` | 0.84 |
| 证据是什么 | 证据引用 | `event_extraction.event-evidence` | 0.88 |
| RawEvent | 原始事件 | `event_extraction.raw-event` | 0.78 |
| SemanticEvent | 语义事件 | `event_extraction.semantic-event` | 0.82 |
| relationship_change_candidate | 关系变化候选 | `event_extraction.relationship-change-candidate` | 0.8 |

## 全域事件图谱

- id: `global-events`
- owner: `Global Event Graph`
- gate: `global_event_graph_gate`
- compass: `global_events`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| 社会事件 | 沟通与关系变化 | `global_events.social-event` | 0.9 |
| 物理事件 | 环境与设备变化 | `global_events.physical-event` | 0.76 |
| 学习事件 | 知识变化 | `global_events.learning-event` | 0.78 |
| 实验事件 | 虚拟/沙盒试验 | `global_events.experiment-event` | 0.8 |
| 决策事件 | 选择过程 | `global_events.decision-event` | 0.88 |
| 行动事件 | 动作结果 | `global_events.action-event` | 0.82 |
| 反馈事件 | 结果回写 | `global_events.feedback-event` | 0.86 |
| 事件链 | 时间序列 | `global_events.event-chain` | 0.82 |
| 事件簇 | 主题聚合 | `global_events.event-cluster` | 0.78 |

## 世界状态模型

- id: `world-state`
- owner: `World State Runtime`
- gate: `state_update_gate`
- compass: `world_state`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| state_snapshot | 状态快照 | `world_state.state-snapshot` | 0.96 |
| state_delta | 状态变化 | `world_state.state-delta` | 0.92 |
| valid_time | 有效时间 | `world_state.valid-time` | 0.84 |
| observed_time | 观察时间 | `world_state.observed-time` | 0.78 |
| updated_time | 更新时间 | `world_state.updated-time` | 0.78 |
| state_confidence | 状态置信度 | `world_state.state-confidence` | 0.86 |
| state_scope | 状态范围 | `world_state.state-scope` | 0.82 |
| runtime_activity_overlay | 运行态叠加 | `world_state.runtime-activity-overlay` | 0.9 |
| risk_overlay | 风险叠加 | `world_state.risk-overlay` | 0.88 |
| forecast_overlay | 预测叠加 | `world_state.forecast-overlay` | 0.82 |

## 多域世界图谱

- id: `world-model`
- owner: `World Model Layer`
- gate: `world_model_projection_gate`
- compass: `world_model`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| 人际图谱 | 社会事实域 | `world_model.interpersonal-graph` | 0.9 |
| 任务图谱 | 目标与依赖 | `world_model.task-graph` | 0.84 |
| 知识图谱 | 概念与规则 | `world_model.knowledge-graph` | 0.86 |
| 物体图谱 | 物体与环境 | `world_model.object-graph` | 0.72 |
| 自我状态图谱 | 能力与资源 | `world_model.self-state-graph` | 0.88 |
| 外部能力图谱 | 能力候选域 | `world_model.external-capability-graph` | 0.82 |
| 预测图谱 | 未来分支域 | `world_model.forecast-graph` | 0.82 |
| 安全范围图谱 | 治理域 | `world_model.safety-graph` | 0.82 |
| 反馈图谱 | 校准域 | `world_model.feedback-graph` | 0.84 |

## 人际辅助接入位

- id: `social-cognition`
- owner: `Social Cognition Module`
- gate: `social_read_only_adapter_gate`
- compass: `social`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| people | 人物事实 | `social.people` | 0.88 |
| relationships | 关系事实 | `social.relationships` | 0.9 |
| identity_resolution | 身份连续性 | `social.identity-resolution` | 0.84 |
| social_event_link | 事件关联 | `social.social-event-link` | 0.82 |
| B2B follow-up loop | 第一阶段目标 | `social.b2b-followup-loop` | 0.9 |
| decision_cluster_link | 决策接入 | `social.decision-cluster-link` | 0.82 |
| trigger_engine_link | 行动计划接入 | `social.trigger-engine-link` | 0.8 |
| social_assistant_projection_adapter | 只读适配器 | `social.social-assistant-projection-adapter` | 0.86 |

## 关系策略层

- id: `relationship-policy`
- owner: `Relationship Policy Layer`
- gate: `relationship_policy_gate`
- compass: `relationship_policy`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| core_care | 策略桶 | `relationship_policy.bucket-core-care` | 0.76 |
| intimacy_development | 策略桶 | `relationship_policy.bucket-intimacy` | 0.74 |
| business_advancement | 策略桶 | `relationship_policy.bucket-business` | 0.88 |
| collaboration_fulfillment | 策略桶 | `relationship_policy.bucket-collaboration` | 0.82 |
| light_maintenance | 策略桶 | `relationship_policy.bucket-maintenance` | 0.72 |
| weak_tie_networking | 策略桶 | `relationship_policy.bucket-weak-tie` | 0.72 |
| transactional_formal | 策略桶 | `relationship_policy.bucket-transactional` | 0.78 |
| repair_recovery | 策略桶 | `relationship_policy.bucket-repair` | 0.78 |
| risk_boundary | 策略桶 | `relationship_policy.bucket-risk` | 0.86 |
| dormant_archive | 策略桶 | `relationship_policy.bucket-dormant` | 0.68 |
| advance/deepen/maintain/care/transact/repair/downgrade/exit/observe | 处理目标 | `relationship_policy.relationship-goals` | 0.86 |
| L0-L4 权限等级 | 动作权限 | `relationship_policy.relationship-permission` | 0.84 |
| relationship_policy card | 策略卡 | `relationship_policy.relationship-policy-card` | 0.88 |
| 四个关系智能体 | 逻辑分工 | `relationship_policy.relationship-agents` | 0.8 |

## 学习引擎

- id: `learning-engine`
- owner: `Learning Engine`
- gate: `learning_internalization_gate`
- compass: `learning`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| 知识摄入模块 | raw | `learning.knowledge-intake` | 0.76 |
| 知识图谱模块 | connected | `learning.knowledge-graph-module` | 0.82 |
| 类比迁移模块 | 迁移候选 | `learning.analogy-transfer` | 0.78 |
| 因果模型模块 | 影响关系 | `learning.causal-model` | 0.86 |
| 虚拟世界训练模块 | 模拟校验 | `learning.virtual-training` | 0.82 |
| 物理世界对齐模块 | 现实约束 | `learning.physical-alignment` | 0.76 |
| 知识内化模块 | mastered | `learning.knowledge-internalization` | 0.84 |
| raw/understood/connected/tested/operationalized/mastered | 内化状态 | `learning.internalization-states` | 0.8 |
| 失败条件 | 适用边界 | `learning.failure-conditions` | 0.78 |

## 可能性预测

- id: `forecast-simulation`
- owner: `Possibility Forecast Graph`
- gate: `forecast_only_gate`
- compass: `forecast`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| forecast_branch | 未来分支 | `forecast.forecast-branch` | 0.92 |
| probability_score | 发生概率 | `forecast.probability-score` | 0.8 |
| impact_score | 目标影响 | `forecast.impact-score` | 0.82 |
| risk_score | 负面风险 | `forecast.risk-score` | 0.82 |
| confidence_score | 证据充分度 | `forecast.confidence-score` | 0.78 |
| urgency_score | 紧急度 | `forecast.urgency-score` | 0.74 |
| controllability_score | 可控性 | `forecast.controllability-score` | 0.76 |
| reversibility_score | 可逆性 | `forecast.reversibility-score` | 0.74 |
| evidence_quality_score | 证据质量 | `forecast.evidence-quality-score` | 0.78 |
| influence_edge | 影响边 | `forecast.influence-edge` | 0.88 |
| latent_variable | 潜变量 | `forecast.latent-variable` | 0.84 |
| observation_gap | 观测缺口 | `forecast.observation-gap` | 0.78 |
| intervention_candidate | 干预候选 | `forecast.intervention-candidate` | 0.8 |
| counterfactual_simulation | 反事实模拟 | `forecast.counterfactual-simulation` | 0.76 |

## 能力拼接与沙盒

- id: `capability-composition`
- owner: `Capability Composition and Sandbox Realization Layer`
- gate: `sandbox_self_containment_gate`
- compass: `capability`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| Software Capability Observation | 软件观察 | `capability.software-capability-observation` | 0.82 |
| Capability Atom | 能力原子 | `capability.capability-atom` | 0.86 |
| Capability-to-Requirement Graph | 能力转需求 | `capability.capability-to-requirement` | 0.84 |
| 不设门槛候选枚举 | 能力最大化 | `capability.candidate-enumeration` | 0.82 |
| Code Capability Slice | 代码切片 | `capability.code-capability-slice` | 0.84 |
| Goal Capability Gap | 目标缺口 | `capability.goal-capability-gap` | 0.82 |
| Capability Composition Plan | 拼接计划 | `capability.composition-plan` | 0.88 |
| Implementation Route | 实现路径 | `capability.implementation-route` | 0.86 |
| Sandbox Verification Run | 沙盒验证 | `capability.sandbox-verification` | 0.9 |
| Implementation Candidate | 实现候选 | `capability.implementation-candidate` | 0.84 |
| tool-runtime adapter | 现有雏形 | `capability.tool-runtime-adapter` | 0.76 |

## 决策与意志治理

- id: `decision-governance`
- owner: `Decision and Will Governance Layer`
- gate: `decision_governance_gate`
- compass: `decision`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| Goal Tree | 目标树 | `decision.goal-tree` | 0.92 |
| Self-Will Model Interface | 意志接口 | `decision.self-will-interface` | 0.88 |
| Strategy Allocator | 策略分配 | `decision.strategy-allocator` | 0.9 |
| Resource Assessment | 资源评估 | `decision.resource-assessment` | 0.82 |
| Risk Review | 风险审查 | `decision.risk-review` | 0.86 |
| 可解释推荐选项 | 解释输出 | `decision.option-explanation` | 0.82 |
| message_draft 优先 | 具体草稿 | `decision.message-draft-priority` | 0.86 |
| human_confirmation_required | 人工确认 | `decision.human-confirmation` | 0.88 |

## 安全范围治理

- id: `safety-scope`
- owner: `Self-Awareness Governance Layer`
- gate: `safety_scope_revision_gate`
- compass: `safety`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| Safety Scope Profile | 安全范围 | `safety.safety-scope-profile` | 0.92 |
| sandbox_self_containment.v1 | 当前沙盒 profile | `safety.sandbox-self-containment` | 0.9 |
| Safety Scope Revision | 范围修订 | `safety.safety-scope-revision` | 0.86 |
| Terminal Safety Review | 末端审查 | `safety.terminal-safety-review` | 0.88 |
| info | 风险等级 | `safety.risk-info` | 0.66 |
| needs_review | 风险等级 | `safety.risk-needs-review` | 0.78 |
| blocked | 风险等级 | `safety.risk-blocked` | 0.84 |
| danger | 风险等级 | `safety.risk-danger` | 0.86 |
| failure_recovery | 失败恢复 | `safety.failure-recovery` | 0.8 |

## 行动与工具

- id: `action-layer`
- owner: `Action and Tool Layer`
- gate: `action_execution_gate`
- compass: `action`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| 沟通 | message_draft | `action.communication-action` | 0.86 |
| 提醒 | trigger_plan | `action.reminder-action` | 0.78 |
| 项目执行 | 任务推进 | `action.project-execution` | 0.76 |
| 实验设计 | 实验候选 | `action.experiment-design` | 0.76 |
| 设备控制 | 高风险动作 | `action.device-control` | 0.74 |
| 文档生成 | 报告与交付 | `action.document-generation` | 0.78 |
| 工具调用 | dry-run first | `action.tool-call-action` | 0.8 |
| 平台预览 | 发送阻断 | `action.platform-preview` | 0.82 |
| manual_execution_checklist | 手工清单 | `action.manual-execution-checklist` | 0.84 |

## 反馈与记忆

- id: `feedback-memory`
- owner: `Feedback and Memory Layer`
- gate: `feedback_writeback_gate`
- compass: `feedback`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| 结果记录 | action_result | `feedback.result-record` | 0.88 |
| 偏差分析 | error signal | `feedback.deviation-analysis` | 0.84 |
| 策略修正 | policy update | `feedback.strategy-correction` | 0.84 |
| 知识更新 | learning feedback | `feedback.knowledge-update` | 0.84 |
| 意志权重迭代 | preference update | `feedback.will-weight-iteration` | 0.78 |
| raw memory | 原始记忆 | `feedback.raw-memory` | 0.76 |
| episodic memory | 情节记忆 | `feedback.episodic-memory` | 0.74 |
| semantic memory | 语义记忆 | `feedback.semantic-memory` | 0.76 |
| procedural memory | 过程记忆 | `feedback.procedural-memory` | 0.76 |
| policy memory | 策略记忆 | `feedback.policy-memory` | 0.78 |
| 记忆压缩/遗忘策略 | 生命周期 | `feedback.memory-compression` | 0.78 |
| retrieval_rationale | 检索理由 | `feedback.retrieval-rationale` | 0.76 |

## 系统主体状态对话系统

- id: `status-dialogue-system`
- owner: `Subject Status Dialogue Runtime`
- gate: `status_dialogue_read_only_gate`
- compass: `status_dialogue`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| global_state_scan | 全局状态巡检 | `status_dialogue.global-state-scan` | 0.94 |
| subsystem_status_index | 子系统索引 | `status_dialogue.subsystem-status-index` | 0.9 |
| module_health_probe | 模块健康探针 | `status_dialogue.module-health-probe` | 0.88 |
| model_adapter | 模型接入位 | `status_dialogue.model-adapter` | 0.84 |
| small_model_ipc_adapter | 第三方小模型端口 | `status_dialogue.small-model-ipc-adapter` | 0.88 |
| first_person_prompt_contract | 第一人称提示词契约 | `status_dialogue.first-person-prompt-contract` | 0.9 |
| input_port.user_query | 输入端口 | `status_dialogue.input-port-user-query` | 0.82 |
| input_port.focus_context | 输入端口 | `status_dialogue.input-port-focus-context` | 0.88 |
| output_port.first_person_reply | 输出端口 | `status_dialogue.output-port-first-person-reply` | 0.9 |
| output_port.voice_line | 输出端口 | `status_dialogue.output-port-voice-line` | 0.84 |
| output_port.attention_log | 输出端口 | `status_dialogue.output-port-attention-log` | 0.86 |
| constraint.no_narrator | 风格约束 | `status_dialogue.constraint-no-narrator` | 0.88 |
| constraint.minimal_voice | 语音约束 | `status_dialogue.constraint-minimal-voice` | 0.84 |
| constraint.no_hidden_cot | 推理边界 | `status_dialogue.constraint-no-hidden-cot` | 0.82 |
| fallback.local_status | 回退路径 | `status_dialogue.fallback-local-status` | 0.84 |
| awareness_layer_bridge | 意识层接入位 | `status_dialogue.awareness-layer-bridge` | 0.88 |
| self_awareness_style | 自我意识风格 | `status_dialogue.self-awareness-style` | 0.86 |
| first_person_voice | 第一人称语音 | `status_dialogue.first-person-voice` | 0.78 |
| third_person_voice | 第三人称语音 | `status_dialogue.third-person-voice` | 0.78 |
| text_input | 文字输入 | `status_dialogue.text-input` | 0.82 |
| text_output | 文字输出 | `status_dialogue.text-output` | 0.86 |
| speech_synthesis | 语音输出 | `status_dialogue.speech-synthesis` | 0.76 |
| voice_dialogue | 语音对话位 | `status_dialogue.voice-dialogue` | 0.74 |
| conversation_memory | 短上下文 | `status_dialogue.conversation-memory` | 0.78 |
| retrieval_router | 状态检索路由 | `status_dialogue.retrieval-router` | 0.84 |
| tool_function_calling | 工具调用能力位 | `status_dialogue.tool-function-calling` | 0.78 |
| multimodal_dialogue_slot | 多模态对话位 | `status_dialogue.multimodal-dialogue-slot` | 0.76 |
| efficiency_first_cache | 效率优先缓存 | `status_dialogue.efficiency-first-cache` | 0.86 |
| state_only_boundary | 只读边界 | `status_dialogue.state-only-boundary` | 0.92 |

## 三维粒子操作层

- id: `visual-os`
- owner: `Visual World Operating Layer`
- gate: `visual_operation_gate`
- compass: `visual_os`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| 全局宇宙 | 默认层级 | `visual_os.global-universe-view` | 0.9 |
| 图谱域 | 第二层级 | `visual_os.domain-view` | 0.88 |
| 云团 | 第三层级 | `visual_os.nebula-cluster-view` | 0.86 |
| 子实体簇 | 第四层级 | `visual_os.entity-cluster-view` | 0.82 |
| 单实体 | 第五层级 | `visual_os.single-entity-view` | 0.82 |
| 属性与证据 | 第六层级 | `visual_os.attribute-evidence-view` | 0.86 |
| observe | 观察模式 | `visual_os.observe-mode` | 0.78 |
| inspect | 检视模式 | `visual_os.inspect-mode` | 0.8 |
| drill_down | 下钻模式 | `visual_os.drill-down-mode` | 0.84 |
| compare | 比较模式 | `visual_os.compare-mode` | 0.78 |
| simulate | 模拟模式 | `visual_os.simulate-mode` | 0.8 |
| compose | 拼接模式 | `visual_os.compose-mode` | 0.78 |
| handoff | 交接模式 | `visual_os.handoff-mode` | 0.8 |
| review | 审查模式 | `visual_os.review-mode` | 0.8 |

## 投影与意图契约

- id: `projection-contracts`
- owner: `Projection and Intent Contract`
- gate: `contract_schema_gate`
- compass: `projection_contract`

| Star | Status | Compass | Weight |
| --- | --- | --- | --- |
| projection_id | 投影标识 | `projection_contract.projection-id` | 0.72 |
| scope | mock/read_only_adapter/live_runtime | `projection_contract.projection-scope` | 0.82 |
| domains | 图谱域 | `projection_contract.projection-domains` | 0.84 |
| clusters | 云团 | `projection_contract.projection-clusters` | 0.84 |
| nodes | 节点 | `projection_contract.projection-nodes` | 0.9 |
| edges | 边 | `projection_contract.projection-edges` | 0.88 |
| runtime_overlays | 叠加层 | `projection_contract.runtime-overlays` | 0.86 |
| operation_affordances | 可操作能力 | `projection_contract.operation-affordances` | 0.86 |
| source_refs | 来源引用 | `projection_contract.projection-source-refs` | 0.9 |
| projection_warnings | 投影警告 | `projection_contract.projection-warnings` | 0.84 |
| intent target_refs/context_refs | 意图目标 | `projection_contract.intent-target-refs` | 0.82 |
| execution_mode | visual_only/sandbox_candidate/handoff | `projection_contract.execution-mode` | 0.84 |

