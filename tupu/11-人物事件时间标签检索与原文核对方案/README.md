# 11 专项优化目录

状态：`confirmed_scope_optimization_only`

日期：2026-07-04

本目录用于保存 `tupu/11-人物事件时间标签检索与原文核对方案.md` 的后续优化内容。

进入本目录前必须先读取：

```text
D:\zhineng\tupu\ROOT-图谱构建底层逻辑规则.md
D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\00-总目标与执行控制台.md
```

当前边界：

- 只优化方案，不进入运行时实现。
- 不确认关系状态。
- 不合并身份。
- 不执行真实外部动作。
- 不根据公开案件判决结果做法律判断。
- 公开案件材料只用于复杂事件结构、证据关系、时间线和标签压力测试。

## 文件索引

当前采用逻辑分类保存，暂不物理移动文件。后续读取顺序优先看分类，再看编号。

### A. 总控层

| 文件 | 作用 |
| --- | --- |
| `00-总目标与执行控制台.md` | 11 目录总控入口，确认总目标、主链路、目标漂移检测规则、文件分类、缺口池、3D 粒子同步跟进规则、3D 粒子阶段跟随说明、projection_sync_drift_gate 防偏离门、ParticleSyncCheckpoint、完整构建路线图和进入 JSON Schema 草案的门槛 |

### B. 复杂事件基础层

| 文件 | 作用 |
| --- | --- |
| `01-复杂嵌套事件处理与案件式验证方案.md` | 下钻复杂事件、嵌套事件、父子事件、冲突事件、公开案件式验证方法 |
| `02-ComplexEventObjectModel.v1-复杂事件对象模型.md` | 定义复杂事件对象层级、角色、时间、关系边和查询接口 |
| `03-NestedEventSplitGate.v1-嵌套事件拆分门槛.md` | 定义何时拆 NestedEvent、何时保留为 AtomicFact/Tag/Summary |
| `04-EvidenceAnchor.v1-证据锚点与原文反读规则.md` | 定义证据锚点、offset/hash 核对、冷读触发和摘要边界 |
| `05-ConflictSet.v1-冲突事件组方案.md` | 定义冲突事实组、Claim、冲突状态、上下文和星云处理 |
| `06-CaseCorpusValidation.v1-公开案件式验证模板.md` | 定义公开案件式复杂语料验证流程、检查项和通过门槛 |

### C. 审查验证层

| 文件 | 作用 |
| --- | --- |
| `07-五方案件文档级验证结果.md` | 记录五个方案件的文档级验证结果和修正记录 |
| `08-多学科审查与长周期叙事压力测试.md` | 从人类学、社会学、历史学、叙事学、证据审查、信息科学等视角审查当前方案，并测试长周期叙事能力 |
| `15-第二批叙事层方案件多学科验证结果.md` | 记录第二批方案件的多学科复审、压力场景复测和反推验证结果 |
| `17-复杂案件全局拆解与标签特征检索压力测试.md` | 使用模拟复杂案件材料验证全局拆解、标签/特征检索、证据反读、叙事组装能力，并将缺口输入 00 缺口池 |

### D. 长期叙事层

| 文件 | 作用 |
| --- | --- |
| `09-TrajectoryRecord.v1-长期轨迹对象方案.md` | 定义长期轨迹对象，用于组织销售客户推进、恋爱关系维护、公开案件式时间线等长周期叙事 |
| `10-PhaseSegment.v1-阶段划分方案.md` | 定义阶段对象、阶段边界、入口/退出条件、阶段重叠和阶段反读规则 |
| `11-TurningPoint.v1-转折点方案.md` | 定义轨迹转折点，区分高权重事件、转折点和因果假设 |
| `12-PatternClaim.v1-长期模式声明方案.md` | 定义长期重复、渐变、节奏、基线变化的可审查模式声明 |
| `13-ContextFrameAndSourcePerspective.v1-语境与来源视角方案.md` | 定义语境框架、emic/etic 标签、来源视角和话语类型 |
| `14-CausalHypothesisAndNarrativeIndex.v1-因果假设与叙事索引方案.md` | 定义因果假设边界、叙事索引、查询意图路由和叙事上下文组装入口 |

### E. 索引契约层

| 文件 | 作用 |
| --- | --- |
| `16-ObjectRegistryAndIndexContracts.v1-对象注册表与索引契约.md` | 固定 PersonIndex、TimelineIndex、EventIndex、SourceIndex、TagRegistry、TagIndex、FeatureIndex、EvidenceIndex、NarrativeIndex、ContextSnapshotRankingPolicy 的输入输出、反读路径、失败降级和 schema 前置门槛 |

### F. P1 Schema 草案层

| 文件 | 作用 |
| --- | --- |
| `18-P1-JSONSchemaDraft.v1-图谱核心对象草案.md` | 记录 P1 JSON Schema 草案的输入、输出、边界、3D 粒子同步要求和验证结果 |
| `schema-drafts/P1-GraphCore.schema.json` | P1 合并 JSON Schema 草案，包含 SourceArchive、EvidenceAnchor、事件、索引、叙事对象、上下文、权重、确认门和 ParticleProjectionEntry |
| `scripts/validate-p1-schema.mjs` | P1 schema 可重复结构验证脚本，检查 `$defs`、递归 `$ref`、叙事对象证据入口、BoundaryFlags 和粒子只读边界 |
| `scripts/validate-p1-json-schema-contract.mjs` | P1 schema 内存合同验证脚本，生成正/反样例验证 `required`、`const`、`enum`、`additionalProperties`、`oneOf`、只读粒子边界，不生成 P2 fixture |
| `scripts/validate-p1-evidence-readback-coverage.mjs` | P1 证据链与原文反读覆盖静态验证脚本，检查 SourceArchive、EvidenceAnchor、索引、上下文、确认门和粒子投影的反读边界 |
| `scripts/validate-full-roadmap-and-particle-sync.mjs` | 完整构建路线图与 3D 粒子同步可重复验证脚本，检查 P0-P12 是否都有输入、输出、边界、3D 说明、验证、进入条件、3D 粒子阶段跟随说明、projection_sync_drift_gate 防偏离门和 ParticleSyncCheckpoint |
| `scripts/validate-p0-p12-stage-control.mjs` | P0-P12 阶段节点控制验证脚本，检查每个阶段是否同时具备输入、输出、边界、目标偏离检测、3D 粒子说明、ParticleSyncCheckpoint、测试验证和进入条件；`--self-test` 会用临时副本验证缺阶段、缺 drift term、缺输入结构块、缺目标偏离判定、缺验证块、缺进入下一阶段条件、缺粒子检查点和缺 projection sync gate 会被阻断 |
| `review-gates/P1-review-decision.template.json` | P1 到 P2 的用户审查确认状态模板；默认 `pending_user_decision`，不放行 P2 |
| `scripts/validate-p1-review-decision.mjs` | P1 用户审查确认状态验证脚本，区分 pending、approved、needs_revision、rejected 四类有效状态 |
| `scripts/validate-current-phase-state.mjs` | 当前阶段总预检脚本，汇总 P1 schema、完整路线图/3D 同步、P1 review-gate 三类验证并输出 P2 是否可进入 |
| `scripts/validate-p1-completion-audit.mjs` | P1 完成度审计脚本，汇总 schema、证据反读、完整路线图/3D 同步、review-gate 状态机和当前阶段预检，明确 P1 是否已可审查以及 P2 是否仍被阻断 |
| `scripts/validate-p2-preparation-boundary.mjs` | P2 准备边界校验脚本；只读检查 P2 fixture/runtime/真实数据是否尚未启动，并确认 P2 仍只允许模拟 fixture、反推验证和 mock 粒子反读报告 |
| `scripts/validate-p2-fixture-contract.mjs` | P2 fixture 执行契约校验脚本；只读检查三类模拟场景、fixture 字段、链路覆盖矩阵、摘要精简与原文反读质量门槛、反推维度、mock 粒子读回和禁止边界，并支持 `--self-test` 验证缺项和越界会被阻断，不生成 P2 fixture |
| `scripts/validate-generated-artifacts-freshness.mjs` | generated 审查/阶段报告新鲜度校验脚本；比较当前 check-mode 输出与 `review-gates/generated/*.json`，不生成 P2 fixture 或 runtime |
| `scripts/validate-p2-entry-gate.mjs` | P2 进入硬门脚本，汇总 P1 schema、证据反读、路线图/3D 同步、P0-P12 阶段控制、review-gate、总预检、完成度审计、P2 fixture 契约和审查包，并支持 `--self-test` 校验硬门自身误放行防线；普通运行会校验 `approval_transition_checks` 与 `p2_fixture_contract_output_checks`，当前默认阻断 P2 |
| `scripts/write-p1-review-pack.mjs` | P1 审查包生成脚本，汇总验证结果、审查清单、允许产物、禁止产物、3D 只读边界、P2 硬门输出要求、P2 fixture 契约输出检查、3D 粒子阶段跟随输出和机器可读的 P2 批准转移条件；默认写入 `review-gates/generated/P1-review-pack.generated.json/.md` |

P1 schema 已补齐 `TrajectoryRecord`、`PhaseSegment`、`TurningPoint`、`PatternClaim`、`ContextFrame`、`SourcePerspective`、`CausalHypothesis` 的对象本体定义。它们仍是解释/叙事层对象，不写关系状态、不合并身份、不执行外部动作。

P1 schema 当前验证命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p1-schema.mjs
```

P1 schema 合同验证命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p1-json-schema-contract.mjs
```

P1 证据链与反读覆盖验证命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p1-evidence-readback-coverage.mjs
```

完整路线图与 3D 粒子同步验证命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-full-roadmap-and-particle-sync.mjs
```

P0-P12 阶段节点控制验证命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p0-p12-stage-control.mjs
```

P0-P12 阶段契约报告生成命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p0-p12-stage-control.mjs --write-report
```

输出位置：

```text
review-gates/generated/P0-P12-stage-control.generated.json
review-gates/generated/P0-P12-stage-control.generated.md
```

P1 用户审查确认状态验证命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p1-review-decision.mjs
```

P1 用户审查确认状态机自测试命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p1-review-decision.mjs --self-test
```

当前阶段总预检命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-current-phase-state.mjs
```

P1 完成度审计命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p1-completion-audit.mjs
```

P2 准备边界校验命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p2-preparation-boundary.mjs
```

P2 fixture 执行契约校验命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p2-fixture-contract.mjs
```

P2 fixture 执行契约预期输出 `PASS_P2_FIXTURE_CONTRACT_READY`。该校验只证明 P2 三类模拟场景、fixture 字段、链路覆盖矩阵、摘要精简与原文反读质量门槛、反推维度、ContextSnapshot 预期和 mock 粒子读回要求已定义，不生成 P2 fixture，不授权 P2。

P2 fixture 执行契约自测试命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p2-fixture-contract.mjs --self-test
```

P2 fixture 执行契约自测试预期输出 `PASS_P2_FIXTURE_CONTRACT_SELF_TEST`。该自测只使用内存合成对象验证缺少必需场景、fixture 字段、链路覆盖矩阵、摘要精简与原文反读质量门槛、反推维度、禁止边界弱化或提前出现 P2 产物时会被阻断，不生成 P2 fixture，不授权 P2。

generated 审查/阶段报告新鲜度校验命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-generated-artifacts-freshness.mjs
```

P2 进入硬门验证命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p2-entry-gate.mjs
```

P2 进入硬门自测试命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\validate-p2-entry-gate.mjs --self-test
```

P2 进入硬门自测试预期输出 `PASS_P2_ENTRY_GATE_SELF_TEST`。该自测只使用内存合成对象验证审批转移条件缺失、状态不一致、P2 fixture 契约输出缺失和粒子反写等错误会被阻断，不生成 P2 fixture，不授权 P2。

P2 进入硬门必须同时输出 `approval_transition_checks` 和 `p2_fixture_contract_output_checks`。前者确认 P1 审查包中的 `approval_transition_requirements` 未缺失、未弱化、当前状态与 review-gate/总预检/完成度审计一致，且 3D 粒子仍保持只读边界；后者确认 P2 fixture 契约输出保留 trace checkpoint、scenario trace、quality gate、scenario quality、non-write flags 和 high-risk boundaries。硬门还会检查审查包是否列出 `required_hard_gate_outputs`、`required_fixture_contract_output_checks` 和 `required_particle_stage_followup_outputs`。

P1 审查包生成命令：

```powershell
cd D:\zhineng\tupu\11-人物事件时间标签检索与原文核对方案\scripts
node .\write-p1-review-pack.mjs
```

P1 审查包只用于用户确认前查看，不授权 P2。当前预期状态为 `PASS_P1_REVIEW_PACK_PENDING_USER_DECISION`。
审查包 JSON 必须包含 `approval_transition_requirements`，用于固定 P2 批准所需的决策状态、必填字段、验证状态、P2 硬门输出要求、P2 fixture 契约输出检查、3D 粒子阶段跟随输出和即使批准后仍禁止的边界。

P1 当前有独立用户审查确认门。只有用户明确给出以下任一状态，才允许进入 P2：

```text
approved_for_p2_fixture_only
approved_with_minor_notes_for_p2_fixture_only
```

该确认只授权模拟 fixture 与反推验证，不授权 runtime、真实数据接入、关系状态写入、身份合并、外部动作或学习权重转正。

默认模板状态是 `pending_user_decision`，验证结果应为 `PASS_PENDING_USER_DECISION` 且 `p2_entry_allowed=false`。`needs_schema_revision_before_p2` 和 `rejected_for_p2` 也是有效状态，但只会阻断 P2，不会授权进入下一阶段。只有用户将确认状态改为 `approved_for_p2_fixture_only` 或 `approved_with_minor_notes_for_p2_fixture_only`，并完成清单、reviewer、decided_at 后，验证结果才允许变为 `PASS_APPROVED_FOR_P2_FIXTURE_ONLY`。

当前 P1 完成度审计预期结果为 `PASS_P1_COMPLETION_AUDIT_PENDING_USER_REVIEW`。这表示 P1 产物已具备用户审查条件，但 `p2_entry_allowed=false`，仍需用户通过 P1 review-gate 才能进入 P2 模拟 fixture 与反推验证。

当前 P2 准备边界预期结果为 `PASS_P2_PREPARATION_BOUNDARY_BLOCKED_PENDING_USER_DECISION`。这表示 P2 fixture、runtime、真实数据、真实粒子投影均未启动，下一步仍只能等待用户审查或修订 P1。

## 缺口治理规则

新发现的问题不再默认新增文件。先进入 `00-总目标与执行控制台.md` 的缺口池。

新增独立方案件必须满足：

```text
阻塞 JSON Schema 草案。
跨越两个以上对象层，无法合并到现有文件。
需要独立输入输出、状态机和验证门槛。
经过压力测试确认为 P1。
用户明确确认新增文件。
```

当前 P1 缺口状态：

```text
G-05: 基础索引契约补齐已并入 16：PersonIndex / TimelineIndex / EventIndex / SourceIndex。
G-07: ContextSnapshot 排序、去重、预算规则已并入 16。
P2: 转述链先并入 SourcePerspective。
P2: 资料缺口先并入 EvidenceAnchor。
```

下一步只允许在 P1 schema 审查确认门通过后进入 P2 模拟 fixture 与反推验证；runtime、真实数据接入、关系状态写入、身份合并、外部动作和学习权重转正仍保持 blocked。

## 已确认方向

用户已确认：

1. 原文永久归档 + 分块定位 + 事件/标签只引用证据。
2. 热路径快速索引召回，冷路径原文核对。
3. 身份修改后重建 `person:*` 标签和索引。
4. 复杂事件按语义子事件存储。
5. 时间层同时保存 `source_captured_at`、`event_occurred_at`、`event_target_time`。
6. 后续优先设计 `EvidenceIndex`、`TimelineIndex`、`PersonIndex`、`TagIndex`，再做 `ContextSnapshot` 组装器。
7. 高风险事件、关系变更、身份合并、外部动作必须 100% 冷读原文核对。

## 后续优化写入规则

本目录只保存 11 号方案的深化内容。若后续产生新的独立主题，例如正式图数据库选型、星云 UI 验收或真实运行时实现，应另建新编号文件或目录，不混入 11 目录。

## 当前阶段验证方式

当前阶段只做方案层和可重复脚本验证，不进入 runtime：

```text
文件存在
方案状态清晰
五个方案件均覆盖目标对象
互相引用关系清晰
明确不进入 runtime/真实数据/test fixture
明确公开案件只用于事件结构验证
P1 schema 结构验证
P1 JSON Schema 合同正反样例验证
P1 证据链与反读覆盖验证
P0-P12 完整路线图与 3D 粒子同步验证
P0-P12 阶段节点控制验证
3D 粒子同步防偏离门和 ParticleSyncCheckpoint 检查
P1 review-gate 状态验证
P1 review-gate 状态机自测试
当前阶段总预检
P1 完成度审计
P2 准备边界校验
P2 fixture 执行契约校验
P2 fixture 执行契约自测试
P2 fixture 场景链路覆盖矩阵校验
P2 fixture 摘要精简与原文反读质量门槛校验
generated 审查/阶段报告新鲜度校验
P2 进入硬门自测试
P2 进入硬门验证
P1 审查包生成
```

## 第二批叙事层方案件索引补充

状态：`second_batch_narrative_layer_added`

日期：2026-07-04

本补充段用于索引第二批叙事层方案件。第二批对象属于方案层和解释层，用于长期轨迹、阶段、转折、模式、语境、来源视角、因果假设和叙事检索；其字段已作为 P1 schema 草案输入，但不进入 runtime，不写入关系状态，不合并身份，不执行真实外部动作。

| 文件 | 作用 |
| --- | --- |
第二批方案件与第一批复杂事件层的关系：

```text
EvidenceAnchor / AtomicFact / NestedEvent / ConflictSet
-> PhaseSegment / TurningPoint / PatternClaim
-> TrajectoryRecord
-> NarrativeIndex
-> NarrativeContextSnapshot
```

当前 P1 schema 草案已纳入第二批叙事层对象。下一阶段只允许在 P1 审查门通过后进入 P2 模拟 fixture 与反推验证。
## P0-P12 Stage Control Self-Test

`scripts/validate-p0-p12-stage-control.mjs --self-test` must return `PASS_P0_P12_STAGE_CONTROL_SELF_TEST` before P2 entry. It uses temporary copied control files to prove missing P2 phase, missing P3 drift term, missing P4 input block, missing P5 drift verdict, missing P8 next-gate block, missing P10 validation block, missing P7 `ParticleSyncCheckpoint`, and missing `projection_sync_drift_gate_active` are blocked. It does not create P2 fixture, runtime, real-data, or particle-runtime artifacts.
