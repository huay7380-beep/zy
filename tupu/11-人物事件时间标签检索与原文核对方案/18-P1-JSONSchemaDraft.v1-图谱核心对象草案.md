# P1 JSONSchemaDraft.v1 图谱核心对象草案

状态：`p1_json_schema_draft_validation_passed_schema_contract_validated_stage_control_p2_entry_gate_added_review_pack_added_pending_user_review`

日期：2026-07-05

适用范围：`D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案`

上游必读：

- `D:\zhineng\tupu\AGENTS.md`
- `D:\zhineng\tupu\ROOT-图谱构建底层逻辑规则.md`
- `D:\zhineng\docs\18-relationship-event-graph-memory-plan.md`
- `D:\zhineng\docs\19-source-collection-classified-storage-plan.md`
- `00-总目标与执行控制台.md`
- `16-ObjectRegistryAndIndexContracts.v1-对象注册表与索引契约.md`

## 1. P1 目标

P1 的目标不是进入 runtime，也不是接入真实数据，而是把当前已确认的核心对象转为可验证的 JSON Schema 草案。

当前采用一个合并 schema 文件，而不是立即拆成二十多个独立 schema 文件：

```text
schema-drafts/P1-GraphCore.schema.json
```

理由：

```text
当前对象之间引用密集。
合并 schema 可以先验证对象边界和引用闭合。
避免发现一个对象就新增一个文件导致目标漂移。
后续进入 runtime 或迁移到正式 schema 包时，再按模块拆分。
```

## 2. 输入

P1 输入来自：

```text
SourceArchive / SourceEpisode / EvidenceAnchor 方案。
RawEvent / SemanticEvent / NestedEvent 事件拆分方案。
ConflictSet 冲突事实方案。
TagRegistry / TagAssignment / TagIndex 方案。
PersonIndex / TimelineIndex / EventIndex / SourceIndex 契约。
FeatureIndex / EvidenceIndex / NarrativeIndex 契约。
ContextSnapshotRankingPolicy / ContextSnapshotRankingDecision 契约。
ContextSnapshot / NarrativeContextSnapshot 组装目标。
TrajectoryRecord / PhaseSegment / TurningPoint / PatternClaim 叙事对象方案。
ContextFrame / SourcePerspective / CausalHypothesis 解释边界方案。
WeightProfile / ConfirmationGate 边界。
ParticleProjectionEntry 最小粒子协议。
```

## 3. 输出

P1 当前输出：

```text
P1-GraphCore.schema.json
scripts/validate-p1-schema.mjs
scripts/validate-p1-json-schema-contract.mjs
scripts/validate-p1-evidence-readback-coverage.mjs
scripts/validate-p0-p12-stage-control.mjs
review-gates/P1-review-decision.template.json
scripts/validate-p1-review-decision.mjs
scripts/validate-current-phase-state.mjs
scripts/validate-p1-completion-audit.mjs
scripts/validate-p2-fixture-contract.mjs
scripts/validate-p2-fixture-contract.mjs --self-test
scripts/validate-generated-artifacts-freshness.mjs
scripts/validate-p2-entry-gate.mjs --self-test
scripts/validate-p2-entry-gate.mjs
scripts/write-p1-review-pack.mjs
```

该文件包含以下 `$defs`：

```text
SourceArchive
SourceEpisode
EvidenceAnchor
RawEvent
SemanticEvent
NestedEvent
ConflictSet
TagDefinition
TagAssignment
PersonIndexEntry
TimelineIndexEntry
EventIndexEntry
SourceIndexEntry
TagIndexEntry
FeatureIndexEntry
EvidenceIndexEntry
NarrativeIndexEntry
TrajectoryRecord
PhaseSegment
TurningPoint
PatternClaim
ContextFrame
SourcePerspective
CausalHypothesis
RetrievalHitPackage
ContextSnapshotRankingPolicy
ContextSnapshotRankingDecision
SummaryShard
ContextSnapshot
NarrativeContextSnapshot
WeightProfile
ConfirmationGate
ParticleProjectionEntry
```

为减少重复，schema 同时定义了通用结构：

```text
ObjectRef
SubjectRef
SourceRef
TimeRefs
BoundaryFlags
Status
EvidenceStrength
ReadbackStatus
VisualWeightLevel
ConfidenceProfile
TimeRange
SummaryBlock
NarrativeStateBlock
CounterEvidence
```

## 4. 边界控制

P1 schema 只定义数据形状和引用边界。

允许：

```text
定义对象字段。
定义 required 字段。
定义状态枚举。
定义 EvidenceAnchor 反读引用。
定义确认门和 blocked 动作。
定义 ParticleProjectionEntry 只读投影字段。
```

禁止：

```text
不接真实微信或其他真实信源。
不写 RelationshipState。
不执行 identity_merge。
不执行 external_action。
不启用 learning_weight_promotion。
不把摘要、标签、权重、向量命中、粒子显示当作事实。
不进入 runtime。
```

## 5. 目标偏离检查

P1 必须持续检查：

```text
schema 是否仍服务 SourceArchive -> EvidenceAnchor -> Index -> ContextSnapshot -> ParticleProjection 主链路。
是否所有可回答对象都有 evidence_anchor_ids 或明确不可回答状态。
是否身份引用仍区分 mention/source_identity/person。
是否 high risk / relationship / identity / external action 仍进入 ConfirmationGate。
是否 ParticleProjectionEntry 仍是只读投影。
是否没有把向量、图数据库或 3D 粒子层变成事实源。
```

## 6. 3D 粒子同步说明

P1 同步定义：

```text
ParticleProjectionEntry
ParticleEdge
VisualWeightLevel
ReadbackStatus
ConfirmationGate
```

粒子投影必须满足：

```text
每个粒子有 object_ref。
可回答事实粒子有 evidence_anchor_ids。
粒子状态区分 active/candidate/needs_review/blocked/superseded/tombstoned_by_user。
粒子有 write_back_allowed=false。
粒子显示 visual_weight_level，但该等级只表示观察优先级。
P1 schema 变化必须有 ProjectionDecision。
阶段验证必须能输出或检查 ParticleSyncCheckpoint。
```

P1 不做真实三维 runtime，只为 P2 fixture 和 P7 只读投影层提供 schema 基础。

## 7. P1 验证标准

P1 通过标准：

```text
schema 文件可被 JSON parser 解析。
schema 顶层包含 $schema、$id、oneOf、$defs。
P1 必要对象都在 $defs 中。
ObjectRef 可指向的对象必须有 $defs，明确暂缓的 AtomicFact / Signal 除外。
叙事对象必须包含 EvidenceAnchor 入口和 BoundaryFlags。
关键对象有 required 字段。
关键对象能引用 EvidenceAnchor。
BoundaryFlags 强制四类高风险动作为 false。
ParticleProjectionEntry 强制 write_back_allowed=false。
README 和 00 总控能索引 P1 草案。
```

## 8. 当前验证结果

状态：`p1_schema_draft_validation_passed_completion_audit_added`

验证时间：2026-07-05

验证方式：`scripts/validate-p1-schema.mjs` + `scripts/validate-p1-json-schema-contract.mjs` + PowerShell 文档级覆盖检查。

说明：当前环境未安装 AJV，本轮未新增依赖；P1 采用自包含 JSON Schema 合同验证器，在内存中生成正/反样例验证 schema 约束，不生成 P2 fixture。后续若引入 AJV 或其他官方 validator，必须作为增强验证接入当前门禁链，不能绕过现有确认门。

可重复验证命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p1-schema.mjs
```

验证项：

```text
schema 文件可被 JSON parser 解析。
schema 顶层包含 $schema、$id、oneOf、$defs。
P1 必要对象都在 $defs 中。
递归 `$ref` 均能解析到 `$defs`。
ObjectRef 可指向对象均有 `$defs`，明确暂缓的 AtomicFact / Signal 除外。
TrajectoryRecord / PhaseSegment / TurningPoint / PatternClaim / ContextFrame / SourcePerspective / CausalHypothesis 已并入 `$defs`。
叙事对象强制证据入口和 boundary_flags。
关键对象有 required 字段。
关键对象包含 evidence_anchor_ids。
BoundaryFlags 强制 relationship_state_write / identity_merge / external_action / learning_weight_promotion 为 false。
ParticleProjectionEntry 强制 write_back_allowed=false。
```

验证结果：

```json
{
  "validator": "validate-p1-schema.mjs",
  "schema_file_exists": true,
  "json_parse": true,
  "schema_draft_2020_12": true,
  "has_id": true,
  "has_oneOf": true,
  "has_defs": true,
  "defs_count": 53,
  "top_level_oneOf_count": 33,
  "missing_top_level_defs": [],
  "duplicate_top_level_refs": [],
  "recursive_ref_count": 53,
  "missing_recursive_refs": [],
  "object_ref_enum_count": 33,
  "missing_object_defs_excluding_atomic_signal": [],
  "intentionally_external_object_refs": ["AtomicFact", "Signal"],
  "missing_narrative_defs": [],
  "narrative_missing_required_evidence": [],
  "narrative_missing_required_boundary": [],
  "boundary_flags_const_false": true,
  "particle_write_back_const_false": true,
  "validation_status": "PASS"
}
```

验证解释：

```text
该结果证明 P1 合并 schema 草案在文档和结构层可解析、对象覆盖完整、递归引用闭合、叙事对象不再只是未定义引用、关键禁止边界存在。
该结果还不能单独证明 schema 约束已通过正/反样例合同验证，必须结合 `scripts/validate-p1-json-schema-contract.mjs`。
该结果不证明 fixture、SQLite、FTS5、runtime 或真实数据接入已完成。
下一步应由用户审查 P1 schema 草案；确认后进入 P2 模拟 fixture 与反推验证。
```

P1 JSON Schema 合同验证命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p1-json-schema-contract.mjs
```

合同验证结果：

```text
top_level_positive_cases_tested = 33
top_level_negative_cases_tested = 100
nested_boundary_cases_tested = 5
positive_failures = []
negative_unexpected_passes = []
unexpected_validator_errors = []
in_memory_only = true
writes_fixture_artifacts = false
validation_status = PASS_P1_JSON_SCHEMA_CONTRACT
```

说明：当前环境未安装 AJV，本轮未新增依赖；该合同验证器是 P1 内的自包含验证器，只在内存中生成正/反样例，不生成 P2 fixture。后续如引入 AJV 或其他官方 JSON Schema validator，必须接入当前门禁链，不能绕过 review-gate、P2 准备边界或 P2 进入硬门。

### 8.1 证据链与反读覆盖验证

P1 另有静态证据链覆盖验证：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p1-evidence-readback-coverage.mjs
```

该验证只检查 schema 静态结构，不生成 P2 fixture，不进入 runtime。

验证范围：

```text
SourceArchive 是否保留原文/载荷/附件指针和 content_hash。
EvidenceAnchor 是否强制 source_archive_id、evidence_strength、readback_status。
SourceRef / EvidenceIndexEntry 是否能回到 SourceArchive 和 EvidenceAnchor。
事件、索引、摘要、上下文、叙事对象是否保留 evidence_anchor_ids 或明确的等价证据字段。
ConflictSet 是否能通过 Claim 间接回到 EvidenceAnchor。
ConfirmationGate 是否保留证据入口和四类 blocked action。
ParticleProjectionEntry 是否只读并保留 object_ref、evidence_state、source_refs/evidence_anchor_ids。
SummaryShard 是否保留 covered_object_refs、evidence_anchor_ids 和 invalidated_by_refs。
```

通过状态：

```text
PASS_EVIDENCE_READBACK_COVERAGE
```

当前验证结果：

```text
source_archive_checks = pass
evidence_anchor_checks = pass
source_ref_checks = pass
direct_evidence_missing = []
evidence_index_checks = pass
conflict_set_indirect_evidence_checks = pass
readback_status_checks = pass
boundary_flag_missing = []
confirmation_gate_checks = pass
particle_projection_checks = pass
answerability_checks = pass
summary_shard_checks = pass
validation_status = PASS_EVIDENCE_READBACK_COVERAGE
```

## 9. P1 用户审查确认门

状态：`p1_review_gate_added_pending_user_decision`

本确认门只决定是否允许进入 `P2 模拟 fixture 与反推验证`。它不代表 runtime、真实信源、关系状态写入、身份合并、外部动作或学习权重转正获得授权。

### 9.1 用户确认范围

用户确认 P1 时，确认的是：

```text
P1-GraphCore.schema.json 可作为 P2 fixture 的结构基线。
P2 可以用模拟销售推进、恋爱关系维护、公开案件式复杂材料测试 schema。
P2 可以验证标签、人物、时间、事件、证据、上下文、粒子投影的反推路径，并必须为每个模拟场景声明 source_archive_trace 到 blocked_action_trace 的链路覆盖矩阵，以及摘要精简与原文反读质量门槛。
P2 可以暴露 schema 缺口并回写到 P1/P2 文档。
```

用户确认 P1 时，不确认：

```text
不确认进入 runtime。
不确认接入真实微信或其他真实信源。
不确认写入 RelationshipState。
不确认 identity_merge。
不确认 external_action。
不确认 learning_weight_promotion。
不确认三维粒子 OS 具备写入能力。
不确认摘要、标签、权重、粒子显示可以替代 EvidenceAnchor 或 SourceArchive。
```

### 9.2 审查清单

进入 P2 前，用户应至少确认以下项目：

```text
1. SourceArchive / EvidenceAnchor 作为事实源和原文反读入口的地位正确。
2. RawEvent / SemanticEvent / NestedEvent 的拆分边界符合语义子事件目标。
3. TagDefinition / TagAssignment / 各类 IndexEntry 足以支持人物、事件、时间、来源、标签、特征、证据检索。
4. TrajectoryRecord / PhaseSegment / TurningPoint / PatternClaim 能表达长周期叙事，但不写关系状态。
5. ContextFrame / SourcePerspective / CausalHypothesis 能表达语境、来源视角和因果假设，但不把解释写成事实。
6. ContextSnapshot / NarrativeContextSnapshot 只作为模型上下文包，不替代原文。
7. WeightProfile / ConfirmationGate 只用于排序、展示、确认门，不自动转正。
8. ParticleProjectionEntry 只读，`write_back_allowed=false`。
9. `BoundaryFlags` 四类高风险动作均强制为 false。
10. `scripts/validate-p1-schema.mjs` 输出 `validation_status = PASS`。
11. `scripts/validate-p1-json-schema-contract.mjs` 输出 `PASS_P1_JSON_SCHEMA_CONTRACT`。
12. `scripts/validate-p1-evidence-readback-coverage.mjs` 输出 `PASS_EVIDENCE_READBACK_COVERAGE`。
13. `scripts/validate-full-roadmap-and-particle-sync.mjs` 输出 `PASS`。
14. 3D 同步防偏离门和 ParticleSyncCheckpoint 已被验证脚本覆盖。
15. `scripts/validate-p0-p12-stage-control.mjs` 输出 `PASS_P0_P12_STAGE_CONTROL`，且 `scripts/validate-p0-p12-stage-control.mjs --self-test` 输出 `PASS_P0_P12_STAGE_CONTROL_SELF_TEST`。
16. `scripts/validate-p1-review-decision.mjs --self-test` 输出 `PASS_REVIEW_GATE_STATE_MACHINE`。
17. `scripts/validate-current-phase-state.mjs` 输出 `PASS_CURRENT_PHASE_STATE`。
18. `scripts/validate-p1-completion-audit.mjs` 输出 P1 完成度通过状态。
19. `scripts/validate-generated-artifacts-freshness.mjs` 输出 `PASS_GENERATED_ARTIFACTS_FRESHNESS`。
20. `scripts/validate-p2-fixture-contract.mjs` 输出 `PASS_P2_FIXTURE_CONTRACT_READY`。
21. `scripts/validate-p2-fixture-contract.mjs --self-test` 输出 `PASS_P2_FIXTURE_CONTRACT_SELF_TEST`。
22. `scripts/validate-p2-entry-gate.mjs --self-test` 输出 `PASS_P2_ENTRY_GATE_SELF_TEST`。
23. `scripts/validate-p2-entry-gate.mjs` 当前阻断或批准状态正确。
24. P2 授权范围仍仅限模拟 fixture 与反推验证。
```

### 9.3 可接受的确认状态

```text
approved_for_p2_fixture_only
approved_with_minor_notes_for_p2_fixture_only
needs_schema_revision_before_p2
rejected_for_p2
```

只有前两种状态允许进入 P2。

### 9.4 P2 进入条件

```text
user_decision in [approved_for_p2_fixture_only, approved_with_minor_notes_for_p2_fixture_only]
validate-p1-schema.mjs = PASS
validate-p1-json-schema-contract.mjs = PASS_P1_JSON_SCHEMA_CONTRACT
validate-p1-evidence-readback-coverage.mjs = PASS_EVIDENCE_READBACK_COVERAGE
validate-full-roadmap-and-particle-sync.mjs = PASS
validate-p0-p12-stage-control.mjs = PASS_P0_P12_STAGE_CONTROL
validate-p0-p12-stage-control.mjs --self-test = PASS_P0_P12_STAGE_CONTROL_SELF_TEST
validate-p1-review-decision.mjs = PASS_APPROVED_FOR_P2_FIXTURE_ONLY
validate-current-phase-state.mjs = PASS_CURRENT_PHASE_STATE 且 p2_entry_allowed = true
validate-p1-completion-audit.mjs = PASS_P1_COMPLETION_AUDIT_APPROVED_FOR_P2_FIXTURE_ONLY
validate-p2-fixture-contract.mjs = PASS_P2_FIXTURE_CONTRACT_READY
validate-p2-fixture-contract.mjs --self-test = PASS_P2_FIXTURE_CONTRACT_SELF_TEST
validate-generated-artifacts-freshness.mjs = PASS_GENERATED_ARTIFACTS_FRESHNESS
validate-p2-entry-gate.mjs --self-test = PASS_P2_ENTRY_GATE_SELF_TEST
validate-p2-entry-gate.mjs = PASS_P2_ENTRY_APPROVED_FOR_FIXTURE_ONLY
write-p1-review-pack.mjs = PASS_P1_REVIEW_PACK_APPROVED_FOR_P2_FIXTURE_ONLY
approval_transition_checks = all true
p2_fixture_contract_output_checks = all true
runtime_entry = still_blocked
real_source_entry = still_blocked
relationship_state_write = blocked
identity_merge = blocked
external_action = blocked
learning_weight_promotion = blocked
```

### 9.5 P2 首轮允许产物

确认后，P2 只允许创建模拟 fixture 和反推验证报告：

```text
销售客户推进模拟 fixture
恋爱关系维护模拟 fixture
公开案件式复杂多源模拟 fixture
标签/人物/事件/时间/证据反推验证报告
mock ParticleProjection 反读验证报告
P2 缺口回写记录
```

P2 不允许创建真实业务数据、不允许写 runtime、不允许启动真实采集。

### 9.6 确认状态对象

P1 到 P2 的用户审查确认必须落在机器可读状态对象中：

```text
review-gates/P1-review-decision.template.json
```

默认状态为：

```text
decision_state = pending_user_decision
p2_entry_allowed = false
```

验证命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p1-review-decision.mjs
```

状态机自测试命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p1-review-decision.mjs --self-test
```

该验证器允许以下有效状态：

```text
PASS_PENDING_USER_DECISION
PASS_NEEDS_SCHEMA_REVISION_BEFORE_P2
PASS_REJECTED_FOR_P2
PASS_APPROVED_FOR_P2_FIXTURE_ONLY
```

前三种状态都不允许进入 P2；只有 `PASS_APPROVED_FOR_P2_FIXTURE_ONLY` 才允许进入 P2。

当前验证结果：

```text
decision_file_exists = true
json_parse = true
shape_checks = pass
artifact_checks = pass
boundary_checks = pass
p2_entry_allowed = false
p2_entry_blockers = [decision_state_not_approved_for_p2_fixture_only]
validation_status = PASS_PENDING_USER_DECISION
```

状态机自测试结果：

```text
pending_blocks_p2 = PASS
approved_allows_p2_fixture_only = PASS
needs_revision_blocks_p2_without_failure = PASS
rejected_blocks_p2_without_failure = PASS
validation_status = PASS_REVIEW_GATE_STATE_MACHINE
```

### 9.7 当前阶段总预检

P1 当前阶段总预检命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-current-phase-state.mjs
```

当前预期输出：

```text
current_phase = P1_JSON_Schema_Draft
current_phase_state = p1_validated_pending_user_review
validation_status = PASS_CURRENT_PHASE_STATE
p2_entry_allowed = false
```

该脚本是 P1 结束前的统一状态检查入口；只要 `p2_entry_allowed=false`，不得进入 P2。

### 9.8 P1 完成度审计

P1 完成度审计命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p1-completion-audit.mjs
```

当前预期输出：

```text
current_phase = P1_JSON_Schema_Draft
current_phase_state = p1_validated_pending_user_review
p1_artifacts_ready = true
p1_ready_for_user_review = true
p1_approved_for_p2_fixture_only = false
p2_entry_allowed = false
remaining_gate = user_review_decision
validation_status = PASS_P1_COMPLETION_AUDIT_PENDING_USER_REVIEW
```

该脚本只汇总 P1 完成度，不替代用户确认门。只有当它返回 `PASS_P1_COMPLETION_AUDIT_APPROVED_FOR_P2_FIXTURE_ONLY` 时，才说明 P1 已被批准进入 P2 模拟 fixture 与反推验证。

### 9.9 P1 审查包生成

P1 审查包生成命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\write-p1-review-pack.mjs
```

只检查不写文件：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\write-p1-review-pack.mjs --check
```

当前预期输出：

```text
validation_status = PASS_P1_REVIEW_PACK_PENDING_USER_DECISION
p1_ready_for_user_review = true
p1_approved_for_p2_fixture_only = false
p2_entry_allowed = false
remaining_gate = user_review_decision
```

默认写入：

```text
review-gates/generated/P1-review-pack.generated.json
review-gates/generated/P1-review-pack.generated.md
```

该审查包只用于 P1 用户确认前查看，不生成 P2 fixture，不进入 runtime，不接真实数据，不授权任何高风险动作。
该审查包必须包含 `approval_transition_requirements`，用于机器可读地固定 P2 批准转移条件：允许的决策状态、必填决策字段、必须通过的验证、首轮允许产物、P2 硬门输出要求、P2 fixture 契约输出检查、3D 粒子阶段跟随输出、3D 粒子只读约束和即使批准 P2 后仍禁止的边界。
该字段只描述进入 P2 的条件，不替代用户确认，也不自动把 `pending_user_decision` 转为批准状态。
P2 进入硬门必须校验 `approval_transition_checks` 与 `p2_fixture_contract_output_checks` 全部为 true；如果审查包缺失该字段、转移条件和当前状态不一致、P2 fixture 契约输出缺失 trace/quality/non-write/high-risk 检查、审查包未列出 required_hard_gate_outputs / required_fixture_contract_output_checks / required_particle_stage_followup_outputs，或粒子只读边界被弱化，应继续阻断 P2。
P2 fixture 执行契约必须先由 `validate-p2-fixture-contract.mjs` 返回 `PASS_P2_FIXTURE_CONTRACT_READY`，并由 `validate-p2-fixture-contract.mjs --self-test` 返回 `PASS_P2_FIXTURE_CONTRACT_SELF_TEST`。该校验只证明三类模拟场景、fixture 字段、链路覆盖矩阵、摘要精简与原文反读质量门槛、反推维度、ContextSnapshot 预期和 mock 粒子读回要求已定义，且契约验证器能阻断缺项、越界产物和边界弱化；不生成 P2 fixture，不授权 P2。

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p2-fixture-contract.mjs
```

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p2-fixture-contract.mjs --self-test
```

P2 进入硬门自测试必须输出 `PASS_P2_ENTRY_GATE_SELF_TEST`，该自测只使用内存合成对象验证审批转移条件缺失、状态不一致和粒子反写等错误会被阻断，不生成 P2 fixture，不授权 P2。

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p2-entry-gate.mjs --self-test
```

### 9.10 generated 产物新鲜度校验

该校验用于防止 `review-gates/generated` 下的审查包或 P0-P12 阶段地图落后于当前 schema、总控、review-gate 或验证脚本。

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-generated-artifacts-freshness.mjs
```

当前预期输出：

```text
validation_status = PASS_GENERATED_ARTIFACTS_FRESHNESS
writes_fixture_artifacts = false
writes_runtime_artifacts = false
writes_real_data_artifacts = false
p2_entry_authorized_by_this_validator = false
```

该脚本只比较当前 check-mode 输出和已生成 JSON，不生成 P2 fixture，不进入 runtime，不授权 P2。
