# ROOT 图谱构建底层逻辑规则

状态：`root_rule_active_pending_user_confirmation`

日期：2026-07-04

适用范围：`D:\zhineng\tupu`

本文不是普通说明文件，而是所有人际关系图谱、事件关系图谱、信源采集、标签索引、原文反读、上下文组装、权重显示、星云/三维粒子 OS 投影相关工作的底层进入规则。

任何新线程、新模块、新 schema、新 runtime、新测试，在进入图谱构建前必须先读取本文，再读取对应总控文件。

## 1. 必读顺序

进入图谱相关工作前，读取顺序固定为：

```text
1. D:\zhineng\tupu\ROOT-图谱构建底层逻辑规则.md
2. D:\zhineng\docs\18-relationship-event-graph-memory-plan.md
3. D:\zhineng\docs\19-source-collection-classified-storage-plan.md
4. D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\00-总目标与执行控制台.md
5. 当前目录或当前模块的 README.md
6. 与本次任务直接相关的方案文件
```

如果某个线程没有读到本文，不允许直接进入 JSON Schema、runtime、真实数据接入、关系状态写入或外部动作调用。

## 2. 总目标

图谱系统的总目标不是堆叠对象，而是建立一条稳定、可审计、可扩展的处理链路：

```text
多源传感器 / 人工输入
-> 源完整数据本地归档
-> RawEvent
-> SemanticEvent / NestedEvent / AtomicFact / Signal
-> EvidenceAnchor
-> PersonIndex / EventIndex / TimelineIndex / SourceIndex / TagIndex / FeatureIndex / EvidenceIndex
-> ComplexEvent / ConflictSet
-> TrajectoryRecord / PhaseSegment / TurningPoint / PatternClaim
-> ContextFrame / SourcePerspective / CausalHypothesis / NarrativeIndex
-> ContextSnapshot / NarrativeContextSnapshot
-> WeightProfile
-> NebulaProjection / 三维粒子 OS 只读投影
```

这条链路必须同时满足：

- 原文永久本地归档，用户可手动删除。
- 摘要、标签、权重、索引只用于加速检索和组装上下文，不替代原文。
- 所有可回答事实必须能通过 `EvidenceAnchor` 回到 `SourceArchive` 原文。
- 标签和特征是召回路径，不是事实本身。
- 人物、事件、时间、来源、标签、证据必须能双向追溯。
- 复杂事件按语义子事件拆分，不按逐句机械切分。
- 长周期叙事必须保留轨迹、阶段、转折、模式、语境、来源视角和因果假设的边界。

## 3. 用户定义框架边界

人际关系图谱是用户预制的关系边界、关系维护目标、关系分类框架。系统不得自行修改该框架。

以下动作必须另行确认：

```text
relationship_state_write
relationship_state_change
identity_merge
canonical_person_rebind
external_action
learning_weight_promotion
limited_trial_promotion
```

确认未完成时，只允许生成候选、证据包、风险提示和待确认状态，不允许把候选写成正式状态。

## 4. 世界系统三维粒子 OS 构建边界

图谱模块可以向世界系统三维粒子 OS / 星云层提供只读投影数据。

三维粒子 OS 的作用是供人类观察：

```text
SourceArchive 状态
人物节点
事件节点
标签节点
证据锚点状态
冲突组状态
轨迹/阶段/转折/模式
确认门状态
V0-V5 可视权重等级
模块完成度与阻塞状态
```

三维粒子 OS 不允许：

```text
写入事实。
修改原文。
确认身份。
合并人物。
写入关系状态。
替代 EvidenceAnchor。
替代 SourceArchive。
执行真实外部动作。
把视觉权重当作真实性。
绕过总控文件新增图谱目标。
未经确认新增 IPC/runtime 写链路。
```

因此，三维粒子 OS 的接口原则是：

```text
图谱事实层 -> 投影包 -> 星云/三维粒子 OS
星云/三维粒子 OS -> visual_operation_intent / observation only
```

如果后续需要让星云层参与真实写入、确认或执行，必须单独建立确认流程、权限边界、回滚策略和验证用例。

## 5. 新增模块同步规则

新增任何模块、对象、功能、目录、schema、fixture、runtime 之前，必须回答：

```text
它服务哪个总目标？
它的上游输入是什么？
它的下游输出给谁？
它是否保留 EvidenceAnchor？
它是否能反读 SourceArchive 原文？
它是否会替代原文、事实或用户确认？
它是否触发 relationship_state / identity_merge / external_action / learning_weight_promotion？
它失败时如何降级？
它的测试验证怎么做？
它是否需要进入星云/三维粒子 OS 只读投影？
```

新增后必须同步：

```text
当前目录 README.md
当前目录 00 总控文件
缺口池或状态池
输入输出契约
禁止事项
验证记录
```

如果进入 runtime/process 节点，还必须同步：

```text
D:\zhineng\examples\system-process-tree.json
Obsidian / 状态面板相关投影
三维粒子 OS 只读投影字段
对应验证命令和验证结果
```

未完成同步时，模块状态只能是：

```text
draft_unlinked
blocked_pending_control_sync
```

## 6. 缺口治理规则

发现新问题时，不默认新增文件。

处理顺序固定为：

```text
1. 先判断是否可并入现有文件。
2. 再登记到总控文件的缺口池。
3. 再更新 README 的分类索引。
4. 只有阻塞 schema/runtime、跨越多个对象层、需要独立输入输出和验证门槛，且用户确认后，才允许新增独立文件。
```

当前 `11-人物事件时间标签检索与原文核对方案` 下的缺口池由：

```text
D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\00-总目标与执行控制台.md
```

统一管理。

## 7. JSON Schema 进入门槛

进入 JSON Schema 草案前必须满足：

```text
根规则已读取。
11 目录 00 总控已读取。
P1 缺口已有处理方案或明确暂缓理由。
对象的输入、输出、反读路径、状态、失败降级、禁止事项明确。
所有可回答事实有 EvidenceAnchor 或明确不可回答状态。
高风险动作有确认门。
schema 不固化模糊目标。
```

JSON Schema 草案阶段仍然禁止：

```text
接入真实微信数据。
接入真实外部工具。
写 RelationshipState。
执行 identity_merge。
启用学习权重。
生成真实外部动作。
把测试样例当作真实业务闭环。
```

## 8. 线程进入检查清单

每个后续线程开始构建图谱前，必须检查：

```text
已读 ROOT 底层规则。
已读 docs/18 和 docs/19。
已读 11 目录 00 总控。
已确认当前任务属于方案、schema、fixture、runtime 还是真实数据层。
已确认是否触发关系状态、身份合并、外部动作、学习权重转正等确认门。
已确认是否需要同步 README、00 总控、process tree、Obsidian 或三维粒子 OS 投影。
已确认不会用摘要、标签、权重、星云显示替代原文事实。
```

检查未通过时，不进入下一阶段。

## 9. 当前阶段状态

当前阶段状态固定为：

```text
1. TUPU ROOT 底层规则已建立。
2. TUPU/AGENTS.md 已建立，并要求先读取 ROOT。
3. ROOT 已接入 11 目录 00 总控和 README。
4. P1 缺口 G-05：PersonIndex / TimelineIndex / EventIndex / SourceIndex 契约已并入 16。
5. P1 缺口 G-07：ContextSnapshot 排序、去重、预算规则已并入 16。
6. 根规则、总控、README、16 索引契约之间的引用已文档级验证闭合。
7. P1 JSON Schema 草案已创建为合并 schema：schema-drafts/P1-GraphCore.schema.json。
8. P1 schema 已补齐 TrajectoryRecord / PhaseSegment / TurningPoint / PatternClaim / ContextFrame / SourcePerspective / CausalHypothesis 叙事对象本体定义，并通过文档级结构验证。
9. P1 可重复验证脚本已建立：scripts/validate-p1-schema.mjs；P1 JSON Schema 合同正反样例验证脚本已建立：scripts/validate-p1-json-schema-contract.mjs，应返回 PASS_P1_JSON_SCHEMA_CONTRACT，且只做内存样例验证，不生成 P2 fixture。
10. P1 证据链与反读覆盖静态验证脚本已建立：scripts/validate-p1-evidence-readback-coverage.mjs。
11. 3D 粒子同步跟进规则、阶段跟随说明与 projection_sync_drift_gate 防偏离门已写入 ROOT 第 12 节，三维粒子 OS 仍只能作为只读投影。
12. 11 目录 00 总控已补全 P0-P12 完整构建路线图，每阶段必须具备输入、输出、边界、3D 粒子说明、验证项和进入条件。
13. 完整路线图与 3D 同步可重复验证脚本已建立：scripts/validate-full-roadmap-and-particle-sync.mjs。
14. P0-P12 阶段节点控制验证脚本已建立：scripts/validate-p0-p12-stage-control.mjs，应返回 PASS_P0_P12_STAGE_CONTROL；scripts/validate-p0-p12-stage-control.mjs --self-test 应返回 PASS_P0_P12_STAGE_CONTROL_SELF_TEST，用于证明缺 P2 阶段、缺 P3 drift term、缺 P4 输入结构块、缺 P5 目标偏离判定、缺 P8 进入下一阶段条件、缺 P10 验证块、缺 P7 ParticleSyncCheckpoint 或缺 projection_sync_drift_gate_active 会被阻断；追加 `--write-report` 时会生成 `review-gates/generated/P0-P12-stage-control.generated.json` 和 `review-gates/generated/P0-P12-stage-control.generated.md`，作为只读阶段契约地图，不授权 P2、runtime、真实数据接入、关系写入、身份合并、外部动作、学习权重转正或粒子反写。
15. P1 用户审查确认门已建立，并新增机器可读确认状态对象：review-gates/P1-review-decision.template.json。
16. P1 审查确认状态验证脚本已建立：scripts/validate-p1-review-decision.mjs，并支持 pending、approved、needs_revision、rejected 四类有效状态；状态机自测试已通过。
17. 当前阶段总预检脚本已建立：scripts/validate-current-phase-state.mjs，用于汇总 P1 schema、证据链反读覆盖、路线图/3D 同步、P0-P12 阶段控制和 review-gate 状态。
18. P1 完成度审计脚本已建立：scripts/validate-p1-completion-audit.mjs，用于一次性确认 P1 产物是否可审查、P2 是否被确认门阻断。
19. P2 准备边界校验脚本已建立：scripts/validate-p2-preparation-boundary.mjs，用于只读检查 P2 fixture/runtime/真实数据/真实粒子投影是否尚未启动，并确认 P2 仍只允许模拟 fixture 与反推验证。
20. P2 fixture 执行契约校验脚本已建立：scripts/validate-p2-fixture-contract.mjs，应返回 PASS_P2_FIXTURE_CONTRACT_READY；其自测命令 scripts/validate-p2-fixture-contract.mjs --self-test 应返回 PASS_P2_FIXTURE_CONTRACT_SELF_TEST，用于证明缺少必需场景、fixture 字段、链路覆盖矩阵、摘要精简与原文反读质量门槛、反推维度、禁止边界弱化或提前出现 P2 产物时会被阻断；该脚本只检查三类模拟场景、fixture 字段、链路覆盖矩阵、摘要精简与原文反读质量门槛、反推维度、ContextSnapshot 预期、mock 粒子读回和禁止边界，不生成 P2 fixture，不授权 P2。
21. P1 审查包生成脚本已建立：scripts/write-p1-review-pack.mjs，用于汇总验证结果、审查清单、允许产物、禁止产物、3D 只读边界、P2 硬门输出要求、P2 fixture 契约输出检查、3D 粒子阶段跟随输出和机器可读的 P2 批准转移条件 `approval_transition_requirements`；该字段只描述进入 P2 的条件，不授权 P2。
22. generated 审查/阶段报告新鲜度校验脚本已建立：scripts/validate-generated-artifacts-freshness.mjs，应返回 PASS_GENERATED_ARTIFACTS_FRESHNESS，用于防止 `review-gates/generated` 下的 P1 审查包或 P0-P12 阶段地图落后于当前源状态；该脚本只读检查，不生成 P2 fixture，不进入 runtime。
23. P2 进入硬门脚本已建立：scripts/validate-p2-entry-gate.mjs；该脚本必须校验 `approval_transition_checks` 和 `p2_fixture_contract_output_checks`，确认 P1 审查包的 P2 批准转移条件未缺失、未弱化且与当前 review-gate/总预检/完成度审计一致，同时确认 P1 审查包列出 required_hard_gate_outputs、required_fixture_contract_output_checks、required_particle_stage_followup_outputs，并确认 P2 fixture 契约输出保留 trace checkpoint、scenario trace、quality gate、scenario quality、non-write flags 和 high-risk boundaries；`scripts/validate-p2-entry-gate.mjs --self-test` 应返回 PASS_P2_ENTRY_GATE_SELF_TEST，用于证明审批转移条件缺失、状态不一致、质量门槛缺失和粒子反写等错误会被阻断；当前普通运行应返回 PASS_P2_ENTRY_BLOCKED_PENDING_USER_DECISION。
24. P1 当前确认状态仍为 pending_user_decision；当前总预检应返回 PASS_CURRENT_PHASE_STATE 且 p2_entry_allowed=false。
25. 当前 P1 完成度审计应返回 PASS_P1_COMPLETION_AUDIT_PENDING_USER_REVIEW，表示 P1 可审查但未获准进入 P2。
26. 当前 P2 准备边界校验应返回 PASS_P2_PREPARATION_BOUNDARY_BLOCKED_PENDING_USER_DECISION，表示未生成 P2 fixture/runtime/真实数据/真实粒子投影产物。
27. 当前 P2 fixture 执行契约校验应返回 PASS_P2_FIXTURE_CONTRACT_READY，自测应返回 PASS_P2_FIXTURE_CONTRACT_SELF_TEST，表示 P2 结构契约、场景链路覆盖矩阵、摘要精简与原文反读质量门槛已定义，且契约验证器能阻断缺项和越界，但 fixture 未生成。
28. 当前 P1 审查包应返回 PASS_P1_REVIEW_PACK_PENDING_USER_DECISION，表示 P1 审查材料可读但未获准进入 P2；其 `approval_transition_requirements.current_transition_state.p2_entry_allowed` 必须为 false。
29. 只有 review-gate 返回 PASS_APPROVED_FOR_P2_FIXTURE_ONLY、总预检 p2_entry_allowed=true、完成度审计返回 PASS_P1_COMPLETION_AUDIT_APPROVED_FOR_P2_FIXTURE_ONLY、P2 准备边界返回 PASS_P2_PREPARATION_BOUNDARY_APPROVED_FOR_FIXTURE_ONLY、P2 fixture 契约返回 PASS_P2_FIXTURE_CONTRACT_READY、P2 fixture 契约自测返回 PASS_P2_FIXTURE_CONTRACT_SELF_TEST、generated 新鲜度返回 PASS_GENERATED_ARTIFACTS_FRESHNESS、审查包返回 PASS_P1_REVIEW_PACK_APPROVED_FOR_P2_FIXTURE_ONLY、P2 进入硬门自测返回 PASS_P2_ENTRY_GATE_SELF_TEST、P2 进入硬门返回 PASS_P2_ENTRY_APPROVED_FOR_FIXTURE_ONLY，且 `approval_transition_checks` 与 `p2_fixture_contract_output_checks` 全部为 true，才允许进入 P2。
30. P1 用户审查确认门只接受 approved_for_p2_fixture_only 或 approved_with_minor_notes_for_p2_fixture_only 进入 P2。
31. P1 仍处于 schema_draft_validated_pending_user_review，不代表 runtime 或真实数据已开始。
32. 下一步只能在 P1 审查门通过且 P2 进入硬门通过后进入 P2 模拟 fixture 与反推验证。
33. runtime、真实数据接入、关系状态写入、身份合并、外部动作、学习权重转正仍保持 blocked。
```

## 10. 通过标准

本文通过标准：

```text
后续线程能明确先读哪个文件。
能解释 TUPU 与 docs/18、docs/19、11 目录总控之间的关系。
能约束三维粒子 OS 只是只读投影。
能要求每个阶段输出或验证 ParticleSyncCheckpoint，防止图谱结构和 3D 观察层分叉。
能要求每个阶段开始前声明 ProjectionDecisionDraft / ReadbackRouteDraft / VisualSemanticsDraft / ForbiddenWriteDraft，结束时输出或验证 ParticleSyncCheckpoint。
能对 P0-P12 每个节点同时检查输入、输出、边界、目标偏离、测试验证和下一阶段进入条件。
能用 P2 准备边界校验证明 P2 fixture/runtime/真实数据/真实粒子投影尚未提前启动。
能用 P2 fixture 契约校验证明三类模拟场景、链路覆盖矩阵、摘要精简与原文反读质量门槛、反推维度和 mock 粒子读回要求已定义，并用 `--self-test` 证明缺项、越界产物和边界弱化会被阻断，但不会提前生成 fixture。
能用 generated 产物新鲜度校验阻止旧审查包或旧阶段地图被误当作当前状态。
能用 P2 进入硬门和 `--self-test` 阻止未获用户确认时误进入模拟 fixture 阶段，并阻止 P1 审查包中的 P2 批准转移条件缺失、被弱化、状态不一致、P2 fixture 契约 trace/quality 输出缺失或粒子反写。
能阻止关系状态、身份合并、外部动作、学习权重转正被误推进。
能要求新增模块同步 README 和总控文件。
能阻止发现一个缺口就新增一个文件。
能为 G-05/G-07 和 JSON Schema 草案提供进入门槛。
```

## 11. 本次接入验证记录

验证时间：2026-07-04

验证方式：PowerShell 文档级检查。

验证项：

```text
ROOT 文件是否存在。
ROOT 是否包含三维粒子 OS 只读投影边界。
ROOT 是否包含 README / 00 总控同步规则。
11 目录 00 总控是否引用 ROOT。
11 目录 README 是否引用 ROOT。
16 索引契约是否引用 ROOT。
G-05 是否已并入 16。
G-07 是否已并入 16。
00 总控是否记录 P1 缺口处理状态。
runtime、真实数据、关系状态、身份合并、外部动作、学习权重是否保持 blocked。
```

验证结果：

```text
root_file_exists = true
root_mentions_3d_os_readonly = true
root_mentions_control_sync = true
control_references_root = true
readme_references_root = true
index_references_root = true
g05_resolved_in_16 = true
g07_resolved_in_16 = true
control_records_p1_status = true
blocked_boundaries_preserved = true
validation_status = PASS
```

验证解释：

```text
本次验证只证明文档层入口、缺口处理记录和禁止边界闭合。
本次验证不证明 JSON Schema 已完成。
本次验证不证明 runtime、真实数据接入、星云 UI 或三维粒子 OS 运行链路已完成。
```

## 12. 3D 粒子同步跟进规则

状态：`particle_projection_sync_rule_active`

图谱构建过程中，三维粒子 OS / 星云层必须作为同步跟进对象，而不是事后补 UI。

同步跟进的目的不是让 3D 系统保存事实，而是确保图谱结构演进时，人类观察层始终能理解：

```text
现在有哪些源数据。
有哪些人物、事件、标签、证据、冲突、轨迹、阶段、转折、模式。
哪些对象已经确认。
哪些对象仍是候选或待审查。
哪些路径可以反读原文。
哪些模块仍被 blocked。
哪些内容达到 V0-V5 可视权重等级。
```

### 12.1 必须同步的变化

任何新增或修改下列对象时，必须同时评估是否需要更新 `NebulaProjection / ParticleProjection`：

```text
SourceArchive / SourceEpisode
RawEvent / SemanticEvent / NestedEvent / AtomicFact / Signal
EvidenceAnchor
PersonIndex / EventIndex / TimelineIndex / SourceIndex
TagRegistry / TagIndex / FeatureIndex / EvidenceIndex
ComplexEvent / ConflictSet
TrajectoryRecord / PhaseSegment / TurningPoint / PatternClaim
ContextFrame / SourcePerspective / CausalHypothesis / NarrativeIndex
ContextSnapshot / NarrativeContextSnapshot
WeightProfile / confirmation_gate
```

### 12.2 每个阶段必须回答的 3D 同步问题

每个阶段进入前必须回答：

```text
本阶段新增了哪些可观察对象？
这些对象在 3D 粒子中显示为节点、边、状态层还是权重层？
粒子的 object_ref 是否能回到 SQLite/索引对象？
粒子的 evidence_anchor_ids 是否能回到 SourceArchive 原文？
粒子的状态是否区分 confirmed/candidate/needs_review/blocked/superseded？
粒子的视觉权重是否只表示观察优先级，而不表示事实真实性？
粒子是否只读，不能触发 relationship_state、identity_merge、external_action、learning_weight_promotion？
本阶段是否需要更新 process tree、Obsidian 或粒子投影字段？
```

### 12.3 粒子投影最小对象

第一阶段只允许定义只读投影协议，最小对象为：

```text
SourceParticle
PersonParticle
EventParticle
TagParticle
EvidenceParticle
ConflictParticle
TrajectoryParticle
PhaseParticle
PatternParticle
ContextParticle
WeightParticle
GateParticle
```

最小字段为：

```text
projection_id
object_ref
object_type
label
status
visual_weight_level
evidence_state
confirmation_gate
source_refs
evidence_anchor_ids
related_edges
blocked_reason
updated_at
```

### 12.4 禁止边界

3D 粒子同步不得：

```text
粒子层写事实。
粒子层合并人物。
粒子层替代 EvidenceAnchor、SourceArchive 或 SQLite 主库。
把粒子位置写回事实层。
把视觉聚类结果当作事实分类。
把 V5 当作真实性或确认状态。
通过粒子操作直接修改关系状态。
通过粒子操作直接合并身份。
通过粒子操作直接删除或改写原文。
通过粒子操作直接执行外部动作。
让三维粒子 OS 成为 SourceArchive、EvidenceAnchor 或 SQLite 主库的替代品。
```

### 12.5 当前阶段要求

当前只允许：

```text
设计 ParticleProjection schema 草案。
使用 mock/fixture 生成只读 NebulaProjection。
验证每个粒子 object_ref 能回到图谱对象。
验证每个可回答粒子能回到 EvidenceAnchor。
验证 blocked、candidate、needs_review、confirmed 状态在视觉上可区分。
```

当前仍禁止：

```text
真实 3D runtime 写入。
真实外部动作。
真实关系状态变更。
真实身份合并。
学习权重转正。
```

### 12.6 3D 同步防偏离门

状态：`projection_sync_drift_gate_active`

图谱结构推进时，三维粒子 OS / 星云层必须同步跟进设计，但只能作为只读投影跟进。该规则用于防止图谱对象、索引、权重、确认门、叙事层或 runtime 输出已经变化，而 3D 观察层仍停留在旧结构，导致人类观察偏离真实图谱链路。

每次新增或修改图谱能力时，必须同步给出：

```text
ProjectionDecision：该变化是否需要进入三维粒子投影。
ParticleProjectionDelta：需要新增、修改、隐藏或废弃的粒子、边、视觉状态。
ProjectionValidationReport：粒子是否能反读 object_ref、EvidenceAnchor、SourceArchive。
ParticleSyncCheckpoint：本阶段图谱变化和粒子跟随状态的汇总。
```

阻断条件：

```text
图谱对象进入 schema 但没有 ProjectionDecision。
图谱对象进入 runtime 但没有 ParticleProjectionDelta。
粒子无法回到 object_ref / EvidenceAnchor / SourceArchive。
粒子层新增事实写入、关系写入、身份合并、外部动作或学习权重转正能力。
视觉权重被描述为事实真实性或关系确认状态。
```

出现任一阻断条件时，当前阶段状态只能是：

```text
blocked_pending_projection_sync
blocked_pending_particle_readback_validation
```

### 12.7 3D 粒子阶段跟随说明

状态：`particle_stage_followup_required`

3D 粒子同步必须跟随每一个图谱构建阶段，而不是只在 P7 或最终 UI 阶段处理。任何阶段只要改变了对象、索引、标签、证据、叙事、权重、确认门、检索路径、上下文组装或 runtime 输出，就必须在同阶段给出粒子跟随说明。

每个阶段开始前必须声明：

```text
ProjectionDecisionDraft：本阶段哪些变化需要进入粒子投影，哪些不需要，原因是什么。
ReadbackRouteDraft：粒子 object_ref / evidence_anchor_ids / source_refs 将如何反读。
VisualSemanticsDraft：节点、边、状态、权重、blocked、候选、确认门如何被人类观察。
ForbiddenWriteDraft：本阶段粒子层仍禁止哪些写入和真实动作。
```

每个阶段结束时必须输出或验证：

```text
ParticleSyncCheckpoint
ProjectionValidationReport
projection_sync_status
particle_readback_status
blocked_write_checks
```

如果阶段内图谱结构发生变化，但 3D 粒子跟随说明没有同步更新，不允许用“后续 UI 再补”作为通过理由。当前阶段只能进入：

```text
blocked_pending_projection_sync
blocked_pending_particle_readback_validation
```

该规则不改变三维粒子 OS 的边界。3D 粒子仍然只能读取投影包和展示观察状态，不得写事实、改原文、合并身份、写关系状态、执行外部动作或让学习权重转正。
