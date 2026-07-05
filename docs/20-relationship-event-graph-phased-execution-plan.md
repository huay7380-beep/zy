# 人际关系图谱与事件图谱阶段执行计划

状态：`learning_weight_promotion_confirmation_pending_user_decision`

日期：2026-07-01

关联必读文档：

- `docs/18-relationship-event-graph-memory-plan.md`
- `docs/19-source-collection-classified-storage-plan.md`

本文把正式方案拆解为可执行阶段目标。用户已确认 P0-P10 作为总目标执行路径，第一轮执行已完成 P0-P9 本地 dry-run 验收；随后用户已确认进入 P10，并进一步确认进入学习权重转正 / limited trial 的单独确认流程。当前仅生成确认包和待决策模板，不实现学习权重转正或 limited trial 执行；不得据此修改人际关系图谱规则、写入关系状态、身份合并、开启学习权重转正或触发真实外部动作。

## -2. P10 shadow 当前确认结果

用户已确认进入下一阶段，当前执行范围限定为 P10 学习权重影子阶段准备。

允许执行：
- 生成 `LearningWeightShadowReport`。
- 输出规则权重与影子权重对比。
- 生成回退方案。
- 生成 `ConfirmationGate(gate_type=learning_weight_promotion)`，并保持 `blocked_pending_user_confirmation`。

不允许执行：
- 不修改 `WeightProfile` 正式权重。
- 不让 `ContextSnapshot` 或 `NebulaProjection` 消费 shadow 权重。
- 不写入关系状态。
- 不确认身份合并。
- 不触发真实外部动作。
- 不转正学习权重。

## -1. 当前用户确认结果

用户已确认：

1. 认可 P0-P10 作为总目标执行路径。
2. 同意第一轮执行只到 P9 最小闭环验收，P10 仅保留接口和方案，不实现学习权重。
3. 同意每阶段结束都必须输出验证结果和下一阶段进入条件。
4. 同意凡涉及关系状态写入、身份合并确认、真实外部动作、学习权重转正，均必须另行确认。

当前完成：

1. P0-P9 本地 dry-run 已完成。
2. 本阶段计划已注册进流程树和 Obsidian 视图。
3. P10 学习权重影子阶段已由用户确认进入，当前仅允许 shadow-mode 准备和验证。
4. 学习权重转正仍未确认，必须另行通过 `ConfirmationGate(gate_type=learning_weight_promotion)`。

## -3. 学习权重转正 / limited trial 确认流程当前结果

用户已确认进入确认流程。当前流程只允许生成：

- `LearningWeightPromotionConfirmation`
- `learning-weight-promotion-decision.template.json`
- 确认包 Markdown 摘要
- 状态文件中的 pending decision 标记

当前仍不允许：

- 不允许学习权重转正。
- 不允许 limited trial 执行。
- 不允许修改 `WeightProfile`。
- 不允许让 shadow 权重影响 `ContextSnapshot` 或 `NebulaProjection`。
- 不允许关系状态写入、身份合并或真实外部动作。

## 0. 总目标

建立一条可验证、可追溯、可扩展的数据链路：

```text
SourceArchive
-> SourceEpisode
-> RawEvent
-> SemanticEvent / NestedEvent
-> Tag / Index
-> WeightProfile
-> SummaryShard
-> ContextSnapshot
-> NebulaProjection
-> visual_operation_intent
```

目标要求：

- 多来源并行收录，微信桌面只作为第一条验证通路之一。
- 第一版 `SourceArchive` 使用本地文件归档。
- 原文、截图、附件、原始 payload 永久保存，摘要不能替代原文。
- `NestedEvent` 使用语义子事件粒度，不逐句机械切分。
- 规则权重第一版必须可解释、可复算、可测试。
- 学习权重只能后续 shadow mode 接入，不能直接改事实或关系。
- 关系更新只能生成提案，必须经过多重验证和用户确认。
- 星云只读投影，只展示人物、信源、事件、标签、确认门槛五类节点。
- 每个阶段都有输入、输出、边界、测试和退出门槛。

## 1. 全局硬边界

以下边界贯穿所有阶段：

1. 不允许模型或规则直接修改用户预制的人际关系图谱规则。
2. 不允许从事件或摘要直接写入确认后的关系状态。
3. 不允许摘要、标签或向量结果覆盖原始证据。
4. 不允许星云反写 `Person`、`RelationshipState`、`RawEvent`、`SemanticEvent`、`WeightProfile`。
5. 不允许学习权重在第一版参与正式决策。
6. 不允许真实发送、删除、同步外部系统或调用外部动作。
7. 所有高风险、身份合并、关系变更和 `V5` 节点必须进入确认门。
8. 每个输出必须能追溯到 `source_archive_id` 或明确说明为何还处于 `extraction_pending`。
9. 每个事件进入正式写入、标签索引或 P9 闭环验收前，必须通过 `prewrite_tag_signature_gate.v1`：标签能反推事件签名，短证据片段来自原文，且关系写入、身份合并、外部动作均保持 blocked。

## 2. 阶段总览

| 阶段 | 名称 | 目标 | 主要输出 | 是否允许影响事实 |
| --- | --- | --- | --- | --- |
| P0 | 基线冻结 | 锁定正式方案和测试基线 | 阶段执行基线、fixture 目录约定 | 否 |
| P1 | Schema 合同 | 定义机器可读结构 | source/archive/event/weight/summary/nebula schemas | 否 |
| P2 | 本地源归档 | 保存完整源数据 | `SourceArchive` 本地目录和 manifest | 只写源归档 |
| P3 | 采集单元与原始事件 | 建立 archive 到 raw event 的链路 | `SourceEpisode`、`RawEvent` | 只写事件流水 |
| P4 | 语义事件与嵌套事件 | 语义分类和子事件切分 | `SemanticEvent`、`NestedEvent` | 只写候选事件 |
| P5 | 标签与索引 | 支持快速检索和写入前反推校验 | tag/time/person/source indexes、`prewrite_tag_signature_gate.v1` | 只写可重建索引 |
| P6 | 规则权重 | 可解释权重计算 | `WeightProfile`、V0-V5 | 只写权重建议 |
| P7 | 摘要与上下文 | 组装上下文 | `SummaryShard`、`ContextSnapshot` | 只写摘要和快照 |
| P8 | 星云只读投影 | 可视化观察 | `NebulaProjection`、`NebulaVisualProfile` | 否 |
| P9 | 最小闭环验收 | 三源样例端到端验证 | validation report | 否 |
| P10 | 学习权重影子准备 | 为未来学习权重留接口 | shadow-mode design gate | 否 |

## 3. P0：基线冻结

目标：

- 锁定当前正式方案、注册状态和测试基线。
- 建立后续执行的 fixture、runtime、schema 命名约定。

输入：

- `docs/18-relationship-event-graph-memory-plan.md`
- `docs/19-source-collection-classified-storage-plan.md`
- `examples/system-process-tree.json`
- 当前 `schemas/**`、`packages/**`、`scripts/**`

输出：

- 阶段执行记录。
- fixture 命名约定。
- 当前验证命令清单。

边界：

- 不新增业务 schema。
- 不写 runtime 数据。
- 不改变流程树，除非用户确认本阶段计划。

测试验证：

- `npm.cmd run process-tree:validate`
- `node --test packages/intake-runtime/tests/*.test.mjs packages/storage-runtime/tests/*.test.mjs packages/identity-resolution/tests/*.test.mjs`

退出门槛：

- 流程树验证通过。
- 正式方案和阶段计划路径明确。
- 后续阶段的 fixture 和 artifact 路径不冲突。

## 4. P1：Schema 合同

目标：

- 把正式方案拆成机器可读合同。
- 先定义数据结构，不写业务逻辑。

输入：

- `docs/19-source-collection-classified-storage-plan.md`
- 现有 `schemas/intake-observation.schema.json`
- 现有 `schemas/raw-event.schema.json`
- 现有 `schemas/semantic-event.schema.json`
- 现有 `schemas/context-snapshot.schema.json`
- 现有 `schemas/graph-memory-database.schema.json`

输出：

- `schemas/source-archive.schema.json`
- `schemas/source-episode.schema.json`
- `schemas/nested-event.schema.json`
- `schemas/summary-shard.schema.json`
- `schemas/weight-profile.schema.json`
- `schemas/nebula-projection.schema.json`
- `schemas/nebula-visual-profile.schema.json`
- 对应 sample fixtures。

边界：

- Schema 只能表达结构和约束。
- 不写入真实 `data/**`。
- 不生成真实人物、关系或事件结论。

测试验证：

- 新增 schema fixture 校验脚本或复用现有 schema validator 模式。
- `node --test packages/intake-runtime/tests/*.test.mjs packages/storage-runtime/tests/*.test.mjs`
- 检查所有 schema 都包含来源追溯字段。

退出门槛：

- 每个 schema 至少有一个通过样例和一个失败样例。
- `SourceArchive`、`SourceEpisode`、`RawEvent`、`SemanticEvent`、`NestedEvent`、`SummaryShard`、`WeightProfile`、`NebulaProjection` 的引用关系可静态检查。
- `WeightProfile` 明确 `rule_version`、`calculation_basis` 和 `confirmation_need`。

## 5. P2：本地 SourceArchive 归档

目标：

- 建立第一版本地源归档能力。

输入：

- 微信桌面文本样例。
- 网页快照样例。
- 手工记录样例。
- 可选附件或截图样例。

输出：

```text
runtime/source-archives/<source_type>/<platform>/<yyyy-mm-dd>/<source_archive_id>/
  manifest.json
  raw.txt / raw.html / raw.json
  artifacts/**
  checksums.json
```

边界：

- 只保存“收到什么”，不判断事实真假。
- 不做人名合并。
- 不做关系更新。
- 不因低权重、重复或摘要生成而删除原文。

测试验证：

- 同一输入 hash 稳定。
- 缺失原文时失败。
- 缺失 manifest 必填字段时失败。
- tombstone 只能由显式删除请求生成。
- 建议命令：
  - `node --test packages/intake-runtime/tests/*.test.mjs`
  - 新增 `source-archive` 专项测试。

退出门槛：

- 三类来源都能生成归档。
- 每个归档能通过 `source_archive_id` 找回原文和 checksums。
- 删除路径只产生 tombstone，不静默删除原文件。

## 6. P3：SourceEpisode 与 RawEvent 链路

目标：

- 把归档内容转成采集单元和原始事件。

输入：

- `SourceArchive`
- 现有 `IntakeObservation`
- source adapter capability。

输出：

- `SourceEpisode`
- `RawEvent`
- `archive -> episode -> raw_event` 追溯链。

边界：

- `RawEvent` 只表达原始事件切分，不写语义结论。
- `RawEvent` 可以有初始标签，但不能写关系状态。
- 对身份不确定的人物只能输出 `participants_hint` 或 candidate refs。

测试验证：

- 微信桌面、网页快照、手工记录均可生成 `SourceEpisode`。
- 每个 `RawEvent` 必须能追溯到 `source_archive_id` 和 evidence span。
- 重复输入应可识别 fingerprint，但不删除归档。
- 建议命令：
  - `npm.cmd run intake:adapter:validate:browser`
  - `npm.cmd run intake:adapter:validate:external-chat`
  - `npm.cmd run intake:adapter:validate:business-api`
  - `node --test packages/intake-runtime/tests/*.test.mjs packages/storage-runtime/tests/*.test.mjs`

退出门槛：

- 三源样例至少各生成一个 `SourceEpisode`。
- 每个 `SourceEpisode` 至少生成一个 `RawEvent`。
- 所有 `RawEvent` 都有 source trace 和 content fingerprint。

## 7. P4：SemanticEvent 与 NestedEvent

目标：

- 把原始事件转成语义事件，并按语义子事件拆分嵌套事件。

输入：

- `RawEvent`
- 目标域：销售客户推进、恋爱关系维护、通用人际。
- 标签和事件类型字典。

输出：

- `SemanticEvent`
- `NestedEvent`
- `event_type`
- evidence spans。

边界：

- 不逐句机械切分。
- 不臆测未出现的动机、承诺或关系状态。
- 无法稳定拆分时保留在 `SemanticEvent`，不强行生成 `NestedEvent`。
- 关系变更只能生成 `RelationshipUpdateProposal` 候选，不写关系状态。

测试验证：

- 至少一个 `RawEvent` 拆出两个语义子事件。
- 销售样例、恋爱样例、普通人际样例各有覆盖。
- 模糊身份样例必须停在确认队列。
- 建议命令：
  - `node --test packages/storage-runtime/tests/*.test.mjs packages/identity-resolution/tests/*.test.mjs`
  - 新增 `nested-event` fixture 测试。

退出门槛：

- 每个 `NestedEvent` 都有 parent event、participants、evidence span、tags。
- 每个关系变更候选都进入提案或确认门，不直接写状态。

## 8. P5：标签、分类与索引

目标：

- 建立按来源、时间、人物、事件、标签、权重、证据的检索基础。

输入：

- `SourceEpisode`
- `RawEvent`
- `SemanticEvent`
- `NestedEvent`
- candidate person refs。

输出：

- source index。
- time index。
- person-event index。
- relationship-event index。
- tag-event index。
- evidence index。

边界：

- 索引必须可重建，不作为事实源。
- 标签可以辅助检索，不能替代事件结论。
- 高风险、身份合并、关系更新标签必须带确认状态。
- 标签不能承载完整原文或长摘要；标签只承载路由、语义签名、状态边界、证据定位和展示权重。
- 事件进入标签索引前必须先通过 `prewrite_tag_signature_gate.v1`，否则不得进入 P5 accepted 状态。

测试验证：

- 通过人物、事件、标签、时间、来源都能查回同一证据链。
- 删除 tombstone 后索引不再默认展示被删除源，但审计仍可说明删除状态。
- 每个 `NestedEvent` 必须具备可反推事件签名的标签维度：`source/modality/domain/scene/event_family/event/intent/actor/actor_role/target_object/object_type/time_bucket/occurred_at_ref/confirmation/identity_status/risk/quality/privacy/retrieval/evidence_ref/raw_observation_ref/semantic_unit_ref/source_archive_ref/relationship_write/identity_merge/external_action/weight/visual/confidence_bucket/polarity`。
- 每个事件的 `evidence_snippet` 必须是原文子串，单个片段不超过 42 个字符，片段总长 / 事件原文证据长度不超过 0.72。
- 每个事件标签数不得超过 40；超过时必须拆分事件或优化标签维度，不能把摘要塞进标签。
- 建议命令：
  - `node --test packages/storage-runtime/tests/*.test.mjs`
  - `npm.cmd run storage:chat:test`
  - `node scripts/run-tag-signature-refinement-validation.mjs`
  - `npm.cmd run relationship-event:validate`

退出门槛：

- 热路径可读取索引、摘要、近期事件、高权重事件和确认门事件。
- 冷路径可展开完整原文、截图、附件和证据链。
- `prewrite_tag_signature_gate.v1` 的 `gate_decision=prewrite_tag_signature_gate_passed`，`failed_count=0`。

## 9. P6：规则 WeightProfile

目标：

- 实现第一版可解释、可复算、可测试的规则权重。

输入：

- `SourceEpisode`
- `RawEvent`
- `SemanticEvent`
- `NestedEvent`
- `SummaryShard`
- 当前目标域。
- 关系框架只读快照。

输出：

- `WeightProfile`
- `intrinsic_weight`
- `contextual_weight`
- `visual_weight`
- `V0-V5`
- `calculation_basis`

边界：

- 权重只影响排序、检索、提醒、展示和上下文组装。
- 权重不等于真实性。
- `V5` 是确认门槛，不是已确认事实。
- 权重不得直接修改人物关系、身份归并、事件事实或外部执行状态。

测试验证：

- 同一输入同一输出。
- 每个 `V4/V5` 必须输出触发规则和证据来源。
- 销售推进、恋爱关系维护、普通人际、低证据、高风险、确认门槛均有 fixture。
- 建议命令：
  - 新增 `weight-profile` 专项测试。
  - `node --test packages/storage-runtime/tests/*.test.mjs packages/decision-cluster/tests/*.test.mjs`

退出门槛：

- 规则表版本固定。
- fixture 回放结果稳定。
- 权重解释能被 ContextSnapshot 和 NebulaProjection 复用。

## 10. P7：SummaryShard 与 ContextSnapshot

目标：

- 生成摘要分片，并按目标需求组装上下文。

输入：

- 原文证据引用。
- 事件链。
- 人物和候选身份引用。
- 标签索引。
- `WeightProfile`。
- 用户当前目标。

输出：

- `SummaryShard`
- `ContextSnapshot`
- retrieval reasons。

边界：

- 摘要不能替代原文。
- 摘要必须可追溯 source refs。
- 上下文不足时必须输出 sufficiency gap，不得伪装完整。

测试验证：

- 按人物、事件、时间窗、目标域、标签都能生成摘要。
- `ContextSnapshot` 必须说明为什么选入或排除某些事件。
- 建议命令：
  - `node --test packages/decision-cluster/tests/*.test.mjs packages/mvp-runtime/tests/*.test.mjs packages/storage-runtime/tests/*.test.mjs`
  - `npm.cmd run tupu:backtest`

退出门槛：

- 销售推进和恋爱关系维护两个目标域都能生成可解释上下文。
- 摘要和原文证据分离。
- 上下文不足时不会给出过度确定结论。

## 11. P8：NebulaProjection 只读星云投影

目标：

- 生成供人类观察的星云展示数据。

输入：

- `Person`
- `SourceArchive`
- `SemanticEvent`
- `NestedEvent`
- `Tag`
- `WeightProfile`
- `SummaryShard`
- confirmation gate refs。

输出：

- `NebulaProjection`
- `NebulaVisualProfile`
- `visual_operation_intent`

边界：

- 星云第一版只展示人物、信源、事件、标签、确认门槛。
- 星云只读，不反写事实。
- 星云可请求确认，但不能替用户确认。
- 3D particle OS 只作为投影/观察面，不成为事实源。

测试验证：

- 节点大小、亮度、透明度、边框、脉冲、连线粗细能表达权重和状态。
- 每个高亮节点有 explainability。
- 星云操作只能输出允许的 `visual_operation_intent`。
- 建议命令：
  - 新增 `nebula-projection` fixture 测试。
  - `npm.cmd run process-tree:validate`

退出门槛：

- 每个星云节点能追溯证据。
- 星云无事实写入接口。
- `V5` 和确认门节点显示明确原因和证据。

## 12. P9：最小闭环验收

目标：

- 用三源样例完成端到端验证。

输入：

- 微信桌面样例。
- 网页快照样例。
- 手工记录样例。
- 至少一个销售推进目标。
- 至少一个恋爱关系维护目标。

输出：

- 端到端 validation report。
- runtime evidence bundle。
- 阶段完成审计。

边界：

- 不接真实发送。
- 不做真实关系状态写入。
- 不启用学习权重正式结果。

测试验证：

- `SourceArchive` 三源归档。
- `SourceEpisode` 三源生成。
- 每个 episode 至少一个 `RawEvent`。
- 至少一个 `RawEvent` 拆出两个 `NestedEvent`。
- 每个事件至少两个标签。
- 每个事件在写入、索引和闭环验收前通过 `prewrite_tag_signature_gate.v1`。
- 每个事件有 `WeightProfile`。
- 生成 `SummaryShard`、`ContextSnapshot`、`NebulaProjection`。
- 建议命令：
  - `node --test packages/intake-runtime/tests/*.test.mjs packages/storage-runtime/tests/*.test.mjs packages/identity-resolution/tests/*.test.mjs packages/decision-cluster/tests/*.test.mjs packages/mvp-runtime/tests/*.test.mjs`
  - `node --test packages/relationship-event-graph/tests/*.test.mjs`
  - `node scripts/run-tag-signature-refinement-validation.mjs`
  - `npm.cmd run relationship-event:validate`
  - `npm.cmd run process-tree:validate`

退出门槛：

- validation report 显示 required failures 为空。
- 三源链路均可追溯原文。
- prewrite gate 显示全部事件 `accepted`，不得存在标签签名缺失、证据过长、非原文子串或边界写入失败。
- 星云投影能解释高亮原因。
- 所有确认门都保持待确认，不自动写入关系状态。

## 13. P10：学习权重影子阶段准备

目标：

- 为未来学习权重接入预留影子评估通道。

输入：

- 规则权重结果。
- 用户确认/驳回记录。
- 误报、漏报、检索命中反馈。
- 固定回放评测集。

输出：

- learning weight shadow report schema。
- rule vs learning comparison report。
- rollback plan。

边界：

- 不启用学习权重正式结果。
- 不允许学习权重改 `intrinsic_weight`。
- 不允许学习权重修改关系、身份、事件事实或外部动作。
- 学习权重转正必须单独确认。

测试验证：

- shadow mode 只输出对比报告。
- 一键回退到规则权重。
- 学习权重结果不能被星云或 ContextSnapshot 当成正式权重。

退出门槛：

- 评测集稳定。
- 对比报告可解释。
- 用户单独确认是否进入学习权重试运行。

## 14. 阶段间闸门

每个阶段进入下一阶段前必须满足：

- 当前阶段 required tests 通过。
- 输出文件或 runtime artifact 可追溯。
- 没有违反全局硬边界。
- 新增 schema/runtime 已进入相应测试。
- 事件写入、标签索引、摘要生成或闭环验收前，`prewrite_tag_signature_gate.v1` 必须通过；失败时停在当前阶段修复，不进入后续上下文、权重或星云投影消费。
- 涉及流程树、Obsidian、注册表时必须运行 `npm.cmd run process-tree:validate`。
- 涉及关系状态、身份合并、学习权重转正、外部动作时必须停下等待用户确认。

## 15. 确认状态实现

确认状态分成两层：

1. 阶段执行确认：控制是否可以开始 P0、进入下一阶段、扩大执行范围。
2. 敏感动作确认门：控制关系状态写入、身份合并确认、真实外部动作、学习权重转正。

### 15.1 阶段执行确认状态

阶段执行状态用于管理 P0-P10 的推进。

建议状态：

| 状态 | 含义 | 允许动作 |
| --- | --- | --- |
| `phase_plan_pending_user_confirmation` | 阶段计划等待用户确认 | 只能修改计划 |
| `phase_plan_confirmed_pending_execution_start` | 阶段计划已确认，等待开始执行 | 可由用户确认开始 P0 |
| `phase_in_progress` | 某阶段执行中 | 只允许执行该阶段范围内任务 |
| `phase_validation_pending` | 阶段产物已生成，等待验证 | 只能跑验证和修复本阶段问题 |
| `phase_completed_pending_next_confirmation` | 阶段完成，等待进入下一阶段确认 | 不得自动进入下一阶段 |
| `phase_blocked` | 阶段存在阻断 | 只能修复阻断或等待用户补充 |
| `execution_completed_p9` | 第一轮 P0-P9 完成 | 不自动进入 P10 |
| `execution_completed_p9_pending_p10_confirmation` | P0-P9 已完成，P10 等待单独确认 | 只能查看、审计或准备 P10 方案 |
| `execution_completed_p10_shadow_pending_learning_weight_promotion_confirmation` | P10 shadow 已完成，学习权重转正等待单独确认 | 只能查看 shadow 报告、审计或准备转正确认材料 |
| `learning_weight_promotion_confirmation_pending_user_decision` | 学习权重转正 / limited trial 确认包已生成，等待用户决策 | 只能查看确认包、填写决策模板或继续审计 |

推进规则：

- `phase_plan_confirmed_pending_execution_start -> phase_in_progress(P0)` 必须由用户明确确认开始执行。
- 每个阶段结束必须输出验证结果和下一阶段进入条件。
- 下一阶段开始前必须由用户确认，或由用户提前明确授权“按阶段自动继续到某一阶段”。
- 第一轮最多执行到 P9。P10 只能保留方案和接口，不实现学习权重。

后续实现时建议写入：

```text
runtime/relationship-event-graph-execution-state/phase-status.json
runtime/relationship-event-graph-execution-state/phase-status.md
```

### 15.2 敏感动作确认门状态

敏感动作必须使用独立 `ConfirmationGate`。任何业务模块不得绕过该门。

建议数据结构：

```json
{
  "schema_version": "confirmation_gate.v1",
  "gate_id": "confirmation_gate_xxx",
  "gate_type": "relationship_state_write",
  "subject_ref": "relationship_update_proposal_xxx",
  "proposed_change": {},
  "evidence_refs": [],
  "verification_refs": [],
  "required_confirmations": [
    "multi_verification_passed",
    "user_final_confirmation"
  ],
  "status": "blocked_pending_user_confirmation",
  "allowed_operations": [],
  "created_at": "2026-07-01T00:00:00+08:00",
  "expires_at": null,
  "decided_by": null,
  "decision": null,
  "apply_once_token": null,
  "audit_refs": []
}
```

核心状态：

| 状态 | 含义 | 是否允许执行 |
| --- | --- | --- |
| `detected` | 系统发现可能需要确认的事项 | 否 |
| `evidence_collecting` | 正在收集证据 | 否 |
| `verification_partial` | 证据不足或验证未完成 | 否 |
| `ready_for_user_review` | 证据包已准备好 | 否 |
| `blocked_pending_user_confirmation` | 等待用户最终确认 | 否 |
| `user_approved` | 用户批准该次具体变更或动作 | 仅允许一次性、限定范围执行 |
| `user_rejected` | 用户拒绝 | 否 |
| `expired` | 确认过期 | 否 |
| `superseded` | 被新提案替代 | 否 |
| `applied` | 已按批准范围执行完成 | 不可重复执行 |
| `rolled_back` | 已回滚 | 否 |

状态流转：

```text
detected
-> evidence_collecting
-> verification_partial / ready_for_user_review
-> blocked_pending_user_confirmation
-> user_approved / user_rejected / expired / superseded
-> applied / discarded
```

硬规则：

- `user_approved` 不是永久授权，只是一次性、限定对象、限定 diff、限定动作的批准。
- 执行动作前必须校验 `gate_id`、`gate_type`、`subject_ref`、`proposed_change`、`apply_once_token` 和未过期状态。
- 任何字段不匹配，必须回到 `blocked_pending_user_confirmation`。
- `applied` 后不得重复执行；再次执行必须生成新 gate。
- 只有用户最终确认能产生 `user_approved`，模型、多源一致、规则权重、星云高亮都不能代替用户确认。

### 15.3 四类必须确认事项

#### 关系状态写入

输入：

- `RelationshipUpdateProposal`
- 当前 `RelationshipState` 只读快照
- 证据包
- 多重验证结果
- 影响说明

输出：

- `ConfirmationGate(gate_type=relationship_state_write)`
- 用户确认后才允许写入 `RelationshipState`

边界：

- `V5` 只能触发确认门，不能写关系状态。
- 单条消息不能直接形成关系状态写入。

#### 身份合并确认

输入：

- `SourceIdentity`
- candidate person refs
- 身份冲突或相似度证据
- 多源或多次稳定验证证据

输出：

- `ConfirmationGate(gate_type=identity_merge)`
- 用户确认后才允许写入 confirmed identity link。

边界：

- 未确认人物不得进入 `linked_person_ids`。
- 只能保留 `participants_hint`、`source_identity_hints` 或 candidate refs。

#### 真实外部动作

输入：

- action proposal
- preview
- risk assessment
- target refs
- blocked-by-default evidence

输出：

- `ConfirmationGate(gate_type=external_action)`
- 用户确认后只允许执行该次明确动作。

边界：

- 默认状态必须是 blocked。
- 不能把一次确认扩展成长期发送、删除、同步或自动执行权限。

#### 学习权重转正

输入：

- 规则权重基线
- shadow-mode 对比报告
- 人工确认/驳回反馈
- 误报、漏报和回放评测结果
- 回退方案

输出：

- `ConfirmationGate(gate_type=learning_weight_promotion)`
- 用户确认后才能进入限定范围试运行。

边界：

- P10 第一轮不实现学习权重转正。
- 学习权重不能直接改事实、关系、身份或外部动作。

### 15.4 确认状态的可见性

确认状态必须能被三类对象读取：

- 人类：通过 Markdown/HTML/星云节点看到原因、证据、当前状态、可选操作。
- Runtime：通过 JSON gate 判断是否允许继续。
- Audit：通过审计记录回放谁在何时批准、拒绝、过期、应用或回滚。

星云展示规则：

- `blocked_pending_user_confirmation`：双环 + 中脉冲。
- `verification_partial`：虚线边框 + 低透明度。
- `user_approved`：实线边框，但仍显示 apply scope。
- `applied`：实线边框 + applied 标记。
- `user_rejected` / `expired` / `superseded`：降权显示，不进入默认行动链。

## 16. 建议确认后的执行顺序

确认后建议按以下顺序执行：

1. P0 基线冻结。
2. P1 Schema 合同。
3. P2 本地源归档。
4. P3 采集单元与原始事件。
5. P4 语义事件与嵌套事件。
6. P5 标签、分类与索引。
7. P6 规则权重。
8. P7 摘要与上下文。
9. P8 星云只读投影。
10. P9 最小闭环验收。
11. P10 学习权重影子阶段准备。

## 17. 已确认项与待开始状态

已确认：

1. P0-P10 是总目标执行路径。
2. 第一轮执行到 P9 后已停止；用户随后确认进入 P10 shadow-mode。
3. 每阶段结束必须输出验证结果和下一阶段进入条件。
4. 关系状态写入、身份合并确认、真实外部动作、学习权重转正，必须通过独立确认门。

当前执行结果：

1. P0-P9 已通过本地 dry-run 验收。
2. 本文已注册到流程树和 Obsidian 视图。
3. P10 学习权重影子阶段已由用户确认进入，当前执行范围限定为 shadow report、rule-vs-shadow comparison、rollback plan 和 blocked promotion gate。
4. 学习权重转正 / limited trial 确认流程已由用户确认进入，当前已生成 pending decision 确认包和决策模板。
5. 学习权重转正与 limited trial 执行仍未授权，必须由用户另行提交明确决策。
