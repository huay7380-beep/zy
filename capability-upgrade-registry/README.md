# Capability Upgrade Registry

## Skill Creation Gate

When a task asks the system to create a new Skill, plugin-facing workflow, or mandatory reusable capability guide, this registry is the default gate before creation. The system must search existing Skills, installed plugins/connectors, local repo modules, local tool catalogs, this registry, and reputable external software when appropriate. A new Skill is allowed only when reuse or adaptation is insufficient and a `skill_creation_gate.v1` record, based on `templates/skill-creation-gate.template.json`, explains the evidence and final decision.

这个目录是系统的“优秀项目候选库 + 模块替代性评估 + 受控升级计划”工作区。

它服务于一个原则：不造轮子。凡是外部已有项目、算法、代码库、软件工具或模型能力，未来如果可能提升当前系统的某个模块，都先进入这个目录做登记、对比、验证和替换规划，再决定是否接入主系统。

## 目标

- 保存优秀项目：源码、压缩包、镜像说明、许可证、论文、README 摘要和本地试验记录。
- 定期巡视系统：读取流程树、运行脚本、测试、runtime 报告和人工问题台账，识别哪些处理过程存在优化信号。
- 拆解处理过程：把每个模块拆成输入、处理、输出、延迟、效果、失败模式、边界和验证命令。
- 识别类比模式：把当前模块抽象成“同类问题模式”，用于寻找相同算法族、同类代码库、同类软件或可包裹的外部能力。
- 对比当前模块：把外部项目映射到现有 `packages/**`、`scripts/**`、`schemas/**`、`3d-particle-display-os/**` 或 GUI 模块。
- 判断是否值得替换：评估输入输出一致性、事件处理延迟、实际效果、替换复杂度、许可证、安全风险、维护活跃度和长期收益。
- 生成升级计划：只输出可审计的替换建议、dry-run 结果、测试清单、回滚方案和人工确认门。
- 受控执行更新：默认不自动改生产模块；只有在证据、测试、回滚和人工确认齐全后，才允许进入正式替换实现。

## 目录约定

| 路径 | 用途 |
| --- | --- |
| `projects/` | 外部项目源码、克隆目录或解压后的候选项目。每个项目一个子目录。 |
| `downloads/` | 外部项目原始下载包、release 包或不可直接展开的归档材料。 |
| `manifests/` | 项目登记卡、来源、许可证、版本、适配目标和采集记录。 |
| `evaluations/` | 模块对比、评分矩阵、可替代性报告和实测证据。 |
| `replacement-plans/` | 受控替换计划、迁移步骤、测试命令、回滚方案和确认门。 |
| `evidence/` | benchmark、截图、日志、兼容性检查和安全扫描结果。 |
| `adapters/` | 将外部项目能力接入本系统时需要的只读适配草案。 |
| `templates/` | 机器可读模板，供后续登记、评估、巡视和替换计划复制。 |

所有与这个模块相关的新材料，优先放在本目录下。只有已经通过确认门并进入主系统实现的代码，才进入 `packages/**`、`scripts/**`、`schemas/**` 或 GUI 目录。

## 执行路径

1. 巡视系统：运行 `npm run capability:patrol`，生成只读的系统处理过程拆解、优化信号和类比搜索任务。
2. 收集项目：把源码放入 `projects/<project_id>/`，或把下载包放入 `downloads/`。
3. 建登记卡：复制 `templates/project-card.template.json` 到 `manifests/<project_id>.json`，记录来源、版本、许可证、维护状态和候选用途。
4. 建映射关系：标明它可能替代或增强的系统模块，例如 `packages/decision-cluster`、`packages/tool-runtime`、`3d-particle-display-os`。
5. 评估实用性：复制 `templates/evaluation-report.template.json` 到 `evaluations/<project_id>-<target_module>.json`，记录评分和证据。
6. 生成替换计划：如果值得接入，复制 `templates/replacement-plan.template.json` 到 `replacement-plans/`，列出 dry-run、测试、回滚和人工确认门。
7. 接入三维粒子 OS：用 `os-particle-projection.json` 把候选、证据、风险和决策状态投影到 `3d-particle-display-os` 的 Lens，而不是直接修改事实源。
8. 执行受控更新：只有当替换计划通过确认门，才允许在主系统模块中实现真实改动。

## 巡视判断依据

模块是否需要优化，不只看代码是否“旧”，而看是否有可验证的改进空间：

- 输入输出一致性：当前模块的输入 schema、输出 contract、错误输出和下游消费是否稳定；候选替换方案能否保持等价或显式迁移。
- 处理延迟：事件接收、转换、决策、触发、GUI 展示或反馈链路是否超过当前目标窗口；候选是否能降低延迟或减少阻塞。
- 达到的效果：当前模块是否真正完成目标，是否有用户反馈、审计报告、测试或 runtime evidence 证明效果不足。
- 替换复杂度：需要改多少 schema、脚本、测试、GUI、runtime 状态和人工流程；是否能先 adapter 包裹。
- 稳定性和失败模式：是否反复出现 flaky、超时、缺证据、人工步骤过多、状态不一致或无法复盘。
- 维护成本：当前实现是否是 demo、sample、手工流程或长期难维护的临时实现。
- 类比可替代性：是否属于成熟问题族，例如 parser、scheduler、ranking、vector search、workflow engine、RPA adapter、state machine、benchmark harness。

## 评分维度

- `io_contract_consistency`: 输入、输出、错误形态和下游契约是否能保持一致。
- `event_latency_fit`: 事件处理延迟、吞吐和阻塞行为是否满足当前目标。
- `effectiveness_gain`: 替换后对目标达成率、准确率、稳定性或用户效果的提升。
- `replacement_complexity_inverse`: 替换越简单、越可渐进、越不扰动主流程，分数越高。
- `usefulness`: 对当前系统总目标的实际帮助。
- `module_fit`: 与目标模块边界、数据结构和运行时的契合程度。
- `maintenance_health`: 项目活跃度、文档、测试、社区和 issue 状态。
- `license_fit`: 许可证是否允许本地使用、修改、分发或商用。
- `security_risk_inverse`: 依赖、执行权限、网络访问、数据泄露和供应链风险越低，分数越高。
- `integration_cost_inverse`: 接入复杂度、适配器数量、迁移范围和维护成本越低，分数越高。
- `replacement_value`: 替代现有轮子的收益是否超过风险。
- `reversibility`: 是否能安全回滚，是否能以 adapter 方式渐进接入。

## 类比模式

巡视器需要为每个处理过程生成类比搜索任务：

- 抽象当前处理过程：例如“把多源 observation 归一化为 RawEvent”“把人名线索解析为 person_id”“把候选回复交给专家矩阵评分”。
- 归入问题族：例如 ingestion pipeline、identity resolution、event sourcing、decision ranking、workflow orchestration、GUI state projection。
- 生成候选搜索词：项目名、算法族、库类型、软件类别、论文关键词和平台关键词。
- 明确确认标准：候选必须满足哪些输入输出、延迟、效果、安全和替换复杂度要求。
- 输出搜索任务，不自动下载、不自动运行、不自动替换。

## 替换确认门

真实替换前必须满足：

- `source_and_license_recorded`
- `target_module_mapping_recorded`
- `process_decomposition_recorded`
- `io_contract_consistency_checked`
- `latency_and_effectiveness_evidence_recorded`
- `analogical_candidates_confirmed`
- `evaluation_report_written`
- `security_risk_reviewed`
- `dry_run_or_adapter_path_proven`
- `tests_defined_and_passed`
- `replacement_complexity_reviewed`
- `previous_requirements_alignment_checked`
- `rollback_plan_written`
- `human_confirmation_recorded`

## 边界

- 默认只读评估，不修改当前系统模块。
- 不直接执行外部项目中的 install、build、run、postinstall 或网络脚本。
- 不把候选项目的输出直接写入 `data/**`、`runtime/state/**` 或真实平台。
- 不绕过现有 dry-run、审计、人工确认和回滚要求。
- 不把许可证不清楚、来源不明或安全风险无法解释的项目接入主流程。
- 不允许只因“新项目更流行”就替换；必须对齐此前全部需求、流程树、schema、测试、runtime evidence 和人工边界。

## 三维粒子 OS 接入

本模块在世界系统三维粒子 OS 中作为 `capability-upgrade-registry` 节点出现：

- System Lens：显示它是能力库与升级治理模块，不是业务事实源。
- Memory Lens：显示项目来源、版本、许可证、评估证据、巡视历史和历史决策。
- Decision Lens：显示输入输出一致性、延迟、效果、替换复杂度、风险、确认门和候选排序。
- Self Lens：显示只读评估、无真实执行、需人工确认、需求对齐和可回滚边界。

投影合同见 `os-particle-projection.json`。三维粒子 OS 只能读取该投影并产生 `visual_operation_intent.v1`，不能直接替换系统代码。

## 当前状态

状态为 `designed_boundary_with_read_only_patrol`：目录、合同、流程树登记和只读巡视标准已建立；真实自动下载、benchmark、替换执行器尚未启用。下一步是在巡视报告基础上补候选项目登记和评估报告生成器。
