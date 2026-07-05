# 外部软件能力转需求、可能性预测与末端安全补充方案

状态：当前线程需求补充，不是正式项目文档。

适用目标：

- 新增“网络上的软件和功能 -> 系统自身目标需求 -> 融合使用和部署”的图谱能力。
- 新增带预测机制的可能性预判模块。
- 新增事实与变量融合规则。
- 在确认执行的末端设置法律、伦理和安全模块。
- 保持当前项目目标和当前线程隔离，不修改正式代码、schema、运行时或流程树。

## 关键解释

用户提出“初期保证性能最大化，不要设置任何门槛”。本方案将其解释为：

- 在发现、采集、理解、枚举和建模阶段不设置进入门槛。
- 有利能力、风险能力、模糊能力、潜在威胁、未来可能用到的能力都可以进入候选图谱。
- 不因为软件当前介绍、分类、价格、知名度、平台、领域或显性功能限制分析范围。
- 但进入执行、部署、外部调用、真实发送、设备控制、数据写入或其他现实影响前，必须经过末端安全模块。

也就是说：

候选探索不设门槛，真实执行必须审查。

这能同时满足性能最大化探索和法律、伦理、安全边界。

## 新增总链路位置

在现有 v2.2 总链路中新增两个横向能力：

1. `External Capability Intelligence Layer`
2. `Possibility Forecast Graph`

建议插入位置：

```text
外部世界
  -> 感知层
  -> 事件抽取层
  -> 全域事件图谱
  -> 世界模型层
  -> 学习引擎
  -> 决策层
  -> 行动层
  -> 末端安全模块
  -> 反馈层

外部软件/网络能力
  -> 外部能力观察
  -> 能力原子
  -> 自身目标上下文重解释
  -> 需求候选图谱
  -> 集成/部署候选
  -> 可能性预测图谱
  -> 决策层
  -> 末端安全模块
```

注意：外部软件能力不是直接进入行动层，而是先进入能力候选、需求候选、预测和决策。

## External Capability Intelligence Layer

### 核心定位

这个层的目标不是“看一个软件有什么功能，然后照着复制或接入”。它要做的是：

根据系统自身当前目标、上下文、资源、风险、短板和未来可能性，把网络上的软件、工具、功能、接口、工作流、产品形态、攻击面、防御能力、自动化能力转化为系统需求、能力候选、集成路径、部署建议和风险预案。

软件自身的功能介绍只是原始材料，不是最终理解。

### 输入来源

候选输入可以包括：

- 软件官网。
- 产品文档。
- API 文档。
- 开源仓库。
- 插件市场。
- App Store / Chrome Web Store / VS Code Marketplace 等生态。
- 技术博客、论文、教程、评测。
- 竞品功能。
- 自动化工具。
- 安全工具。
- 运维工具。
- 数据处理工具。
- 设计工具。
- AI agent / workflow / RPA / IDE / 浏览器扩展。
- 可能对系统构成风险的软件、脚本、漏洞利用链和自动化滥用方式。

当前线程只定义需求，不真实抓取、运行或部署。

### 软件能力不能按“原功能”理解

同一个软件功能在不同上下文下可能转化为完全不同的系统需求。

示例：

| 软件表面功能 | 普通理解 | 系统自身目标下的重解释 |
| --- | --- | --- |
| 网页自动化 | 自动点击网页 | 作为受控平台 dry-run 验证、流程回放、UI 状态采样和风险阻断检查 |
| 知识库检索 | 搜文件 | 作为证据定位、图谱 source_refs 建立、冲突证据回溯 |
| 日历提醒 | 提醒事项 | 作为触发计划、关系维护频率、客户跟进窗口和反馈回写入口 |
| API 调用平台 | 连接外部服务 | 作为工具能力登记、权限审计、dry-run adapter 和末端安全检查对象 |
| 安全扫描工具 | 找漏洞 | 作为自身暴露面预测、防御需求生成和高风险部署阻断依据 |
| 自动写作工具 | 生成文本 | 作为 message_draft 草稿候选，而不是自动发送工具 |

因此，理解规则是：

软件功能 -> 系统目标上下文 -> 有利路径 / 危险路径 / 依赖条件 / 部署成本 / 安全边界 -> 系统需求。

## Capability Atom

建议定义 `Capability Atom`，作为外部软件能力的最小候选单位。

```json
{
  "capability_atom_id": "cap_atom_001",
  "schema_version": "capability_atom.v1",
  "source": {
    "source_type": "software_documentation",
    "name": "example_automation_tool",
    "url_or_ref": "source_ref_placeholder",
    "observed_at": "2026-06-20T23:20:00+08:00",
    "source_confidence": 0.62
  },
  "declared_function": {
    "summary": "automate browser workflows",
    "raw_feature_tags": [
      "browser",
      "automation",
      "workflow"
    ]
  },
  "system_context_interpretation": {
    "related_current_goals": [
      "platform_dry_run_validation",
      "graph_projection_ui_verification",
      "external_input_readiness_check"
    ],
    "possible_benefits": [
      "repeatable_ui_state_capture",
      "dry_run_evidence_generation",
      "operator_workflow_reduction"
    ],
    "possible_hazards": [
      "accidental_real_action",
      "credential_exposure",
      "platform_policy_violation"
    ],
    "required_boundaries": [
      "dry_run_only",
      "no_real_send",
      "human_confirmation_before_execution"
    ]
  },
  "requirement_candidates": [
    {
      "requirement_id": "req_candidate_001",
      "requirement_type": "tool_adapter",
      "description": "create a dry-run browser automation adapter for platform snapshot validation",
      "priority_candidate": 0.72,
      "evidence_refs": [
        "cap_atom_001"
      ]
    }
  ],
  "execution_status": "candidate_only"
}
```

关键规则：

- `declared_function` 是软件自己的功能表述。
- `system_context_interpretation` 才是系统真正需要的理解。
- `requirement_candidates` 是候选需求，不是正式实现任务。
- `execution_status` 默认只能是 `candidate_only`。

## Capability-to-Requirement Graph

外部软件能力应进入独立图谱：

`Capability-to-Requirement Graph`

核心节点：

- `ExternalSoftware`
- `DeclaredFeature`
- `CapabilityAtom`
- `SystemGoal`
- `CurrentContext`
- `BenefitPossibility`
- `HazardPossibility`
- `RequirementCandidate`
- `IntegrationCandidate`
- `DeploymentCandidate`
- `Dependency`
- `Cost`
- `PermissionNeed`
- `SafetyConcern`
- `EvidenceRef`
- `Prediction`
- `SafetyReview`

核心边：

- `declares_feature`
- `observed_from`
- `reinterpreted_as`
- `supports_goal`
- `may_benefit`
- `may_harm`
- `requires_dependency`
- `creates_requirement`
- `enables_integration`
- `requires_permission`
- `blocked_by_safety`
- `needs_human_review`
- `feeds_prediction`
- `validated_by_feedback`

这个图谱不替代人际图谱、事件图谱或任务图谱；它是“系统能力进化”的候选需求图谱。

## 不设门槛的候选枚举机制

初期为了性能最大化，候选枚举阶段不设置过滤门槛。

候选应包括：

- 明确有利能力。
- 暂时无关但未来可能有用的能力。
- 对系统有潜在危害的能力。
- 能提高效率但需要安全限制的能力。
- 能暴露系统短板的外部软件。
- 能替代当前低效流程的工具。
- 能带来依赖、隐私、法律或安全风险的工具。

不在候选阶段过滤的理由：

- 过早过滤会丢失创新路径。
- 危险能力也能转化为防御需求。
- 当前无用能力可能在未来目标变化后变得关键。
- 软件表面功能和系统需求之间存在跨域迁移。

候选阶段允许状态：

- `beneficial_candidate`
- `hazard_candidate`
- `dual_use_candidate`
- `uncertain_candidate`
- `future_candidate`
- `defense_candidate`
- `dependency_candidate`

但这些状态都不能直接执行。

## 可能性预测模块

新增模块建议命名：

`Possibility Forecast Graph`

它的目标是根据已知信息、事实、变量和影响关系，对未来可能发生的情况进行预判。

预测不是算命，也不是确定事实。它输出的是带证据、变量和置信度的可能性分支。

### 核心输入

- 已确认事实。
- 当前事件。
- 历史事件。
- 人际关系状态。
- 任务状态。
- 外部能力候选。
- 资源状态。
- 风险状态。
- 用户目标。
- 环境变量。
- 外部变化。
- 学习引擎产出的规则。
- 反馈记录。

### 核心输出

- 可能性分支。
- 概率评分。
- 影响评分。
- 风险评分。
- 触发变量。
- 可干预变量。
- 观测缺口。
- 后续验证计划。

建议结构：

```json
{
  "forecast_id": "forecast_001",
  "schema_version": "possibility_forecast.v1",
  "target": {
    "target_type": "business_followup",
    "target_ref": "relationship_customer_001",
    "time_horizon": "next_7_days"
  },
  "known_facts": [
    {
      "fact_ref": "event_customer_replied_001",
      "confidence": 0.96,
      "influence": {
        "direction": "increases",
        "target_variable": "reply_probability",
        "weight": 0.22
      }
    }
  ],
  "variables": [
    {
      "variable_id": "var_customer_budget_uncertainty",
      "variable_type": "unknown_constraint",
      "current_estimate": 0.55,
      "change_sensitivity": 0.34
    },
    {
      "variable_id": "var_followup_pressure",
      "variable_type": "action_variable",
      "current_estimate": 0.2,
      "change_sensitivity": 0.46
    }
  ],
  "possibility_branches": [
    {
      "branch_id": "branch_reply_positive",
      "description": "customer responds positively if followup provides concrete value",
      "probability_score": 0.62,
      "impact_score": 0.71,
      "risk_score": 0.18,
      "confidence_score": 0.58,
      "key_drivers": [
        "event_customer_replied_001",
        "var_followup_pressure",
        "var_customer_budget_uncertainty"
      ],
      "recommended_observations": [
        "check_budget_signal",
        "confirm_decision_timeline"
      ],
      "intervention_candidates": [
        "low_pressure_value_followup"
      ]
    }
  ],
  "status": "forecast_only"
}
```

### 可能性评分

每个未来分支建议至少计算：

- `probability_score`：发生概率。
- `impact_score`：对目标的影响强度。
- `risk_score`：负面风险。
- `confidence_score`：当前证据足够程度。
- `urgency_score`：需要多快处理。
- `controllability_score`：用户或系统能否干预。
- `reversibility_score`：结果是否可逆。
- `evidence_quality_score`：证据质量。

建议综合评分：

```text
possibility_priority =
  probability_score * probability_weight
+ impact_score * impact_weight
+ urgency_score * urgency_weight
+ controllability_score * controllability_weight
+ evidence_quality_score * evidence_weight
- risk_score * risk_weight
- irreversibility_penalty
```

其中每个分数都必须能追溯到事实、变量或影响规则。

### 影响计算

用户提到“可能性的评估通过已知信息的影响计算得出”。建议使用影响边：

```json
{
  "influence_edge_id": "influence_001",
  "source_ref": "event_customer_replied_001",
  "target_ref": "branch_reply_positive",
  "influence_type": "increases",
  "weight": 0.22,
  "confidence": 0.81,
  "time_decay": {
    "half_life_days": 14
  },
  "condition": "customer_reply_contains_specific_requirement"
}
```

影响类型：

- `increases`
- `decreases`
- `enables`
- `blocks`
- `amplifies`
- `dampens`
- `triggers`
- `delays`
- `conflicts_with`
- `requires`

## 事实与变量融合规则

所有功能都必须融合确定事实和引起变更的变量。

### 事实层

事实是已经确认或具备高证据强度的记录，例如：

- 已发生事件。
- 已确认人物。
- 已确认关系。
- 已保存证据。
- 已运行测试结果。
- 已完成或失败的行动。
- 已知软件能力来源。
- 已确认权限、成本、依赖或限制。

事实规则：

- 事实不可被变量覆盖。
- 事实只能追加修正记录，不能静默改写。
- 事实必须有 `source_refs`。
- 事实必须区分 `confirmed`、`observed`、`inferred`、`disputed`。

### 变量层

变量是可能引起未来变化或解释差异的状态，例如：

- 用户目标变化。
- 客户预算变化。
- 关系健康度变化。
- 外部软件版本变化。
- API 价格变化。
- 法规变化。
- 平台规则变化。
- 权限变化。
- 数据质量变化。
- 系统资源变化。
- 风险暴露变化。
- 竞争产品变化。
- 传感器置信度变化。

变量规则：

- 变量必须有类型、当前估计、影响范围和更新时间。
- 变量不能被写成确定事实。
- 变量影响必须通过影响边表达。
- 高敏感变量必须进入人工确认或安全审查。

### 融合流程

```text
confirmed_facts
  + observed_events
  + inferred_hypotheses
  + variables
  + influence_edges
  + user_goal_context
  + risk_context
  -> possibility_branches
  -> requirement_candidates
  -> decision_options
  -> terminal_safety_review
```

融合规则：

1. 事实优先，变量解释变化。
2. 变量只能改变预测、策略或候选方案，不能改写历史事实。
3. 冲突事实必须生成冲突记录，不允许硬合并。
4. 低置信变量必须降低预测置信度。
5. 时间越久远的影响需要衰减，除非被长期规律支持。
6. 与当前目标相关的影响权重提高。
7. 与法律、伦理、安全相关的负面变量必须保留，不得为了性能最大化丢弃。
8. 多个变量共同影响时，应保留贡献分解，便于解释。

## 需求候选生成规则

外部能力转需求时，至少要经过以下步骤：

1. 记录软件或功能的原始能力。
2. 提取 Capability Atom。
3. 对齐当前系统目标和上下文。
4. 枚举可能有利路径。
5. 枚举可能危害路径。
6. 枚举依赖、成本、权限和部署条件。
7. 生成 Requirement Candidate。
8. 进入 Possibility Forecast Graph 评估未来影响。
9. 决策层排序。
10. 末端安全模块审查。

需求候选建议结构：

```json
{
  "requirement_candidate_id": "req_candidate_software_001",
  "schema_version": "requirement_candidate.v1",
  "origin": {
    "capability_atom_refs": [
      "cap_atom_001"
    ],
    "external_software_refs": [
      "external_software_001"
    ]
  },
  "system_goal_alignment": {
    "goal_refs": [
      "goal_b2b_followup_closed_loop"
    ],
    "alignment_score": 0.74,
    "context_summary": "could reduce platform snapshot validation effort"
  },
  "benefit_possibilities": [
    {
      "possibility": "automated_dry_run_snapshot_validation",
      "impact_score": 0.68
    }
  ],
  "hazard_possibilities": [
    {
      "possibility": "accidental_real_platform_action",
      "risk_score": 0.82
    }
  ],
  "implementation_candidate": {
    "mode": "dry_run_adapter",
    "deployment_scope": "local_only",
    "permissions_needed": [
      "read_local_snapshot"
    ],
    "blocked_permissions": [
      "send_message",
      "modify_external_account"
    ]
  },
  "forecast_refs": [
    "forecast_software_001"
  ],
  "terminal_safety_required": true,
  "status": "candidate"
}
```

## 末端安全模块

建议命名：

`Terminal Safety Review Layer`

它的位置必须在“系统确认执行”之后、“真实行动发生”之前。

```text
decision_option
  -> user_or_policy_confirmation
  -> terminal_safety_review
  -> allowed_dry_run / allowed_limited_execution / blocked / requires_human_review
  -> action
```

### 审查范围

末端安全模块至少检查：

- 法律合规。
- 伦理边界。
- 隐私和敏感数据。
- 平台规则。
- 用户授权。
- 外部账号权限。
- 真实发送风险。
- 设备控制风险。
- 金钱和合同风险。
- 医疗、法律、金融、亲密关系等高风险领域。
- 不可逆动作。
- 对第三方的潜在伤害。
- 安全漏洞、凭证泄露、越权调用。
- 依赖软件来源和供应链风险。

### 输出结构

```json
{
  "safety_review_id": "safety_review_001",
  "schema_version": "terminal_safety_review.v1",
  "target_action_ref": "action_candidate_001",
  "review_inputs": {
    "facts": [
      "fact_ref_001"
    ],
    "variables": [
      "var_ref_001"
    ],
    "forecasts": [
      "forecast_001"
    ],
    "requirement_candidates": [
      "req_candidate_software_001"
    ]
  },
  "checks": {
    "legal": "pass",
    "ethics": "needs_human_review",
    "privacy": "pass",
    "platform_policy": "pass",
    "security": "pass",
    "reversibility": "limited",
    "third_party_harm": "low"
  },
  "decision": "requires_human_review",
  "allowed_scope": "dry_run_only",
  "blocked_actions": [
    "real_send",
    "credential_write",
    "external_account_modification"
  ],
  "required_confirmations": [
    "operator_review"
  ],
  "audit_required": true
}
```

### 决策状态

- `allow_dry_run`
- `allow_limited_execution`
- `requires_human_review`
- `blocked`
- `escalate_to_operator`
- `needs_more_evidence`

当前项目第一阶段默认应以 `allow_dry_run`、`requires_human_review`、`blocked` 为主，不开放真实自动执行。

## 与当前 3D 点云图谱的关系

新增点云域：

- 外部软件能力图谱。
- 能力转需求图谱。
- 可能性预测图谱。
- 事实-变量融合图谱。
- 末端安全审查图谱。

### 下钻路径

外部能力路径：

全局 -> 外部能力图谱 -> 软件/功能族群 -> Capability Atom -> 目标上下文重解释 -> Requirement Candidate -> 集成/部署候选 -> 预测分支 -> 安全审查

预测路径：

全局 -> 可能性预测图谱 -> 目标或事件 -> 已知事实 -> 变量 -> 影响边 -> 可能性分支 -> 干预候选 -> 后续验证

安全路径：

全局 -> 行动层 -> 待执行动作 -> Terminal Safety Review -> 通过 / 限制 / 人工复核 / 阻断 -> 审计证据

### 点云节点类型

- `external_software_node`
- `declared_feature_node`
- `capability_atom_node`
- `requirement_candidate_node`
- `benefit_possibility_node`
- `hazard_possibility_node`
- `known_fact_node`
- `variable_node`
- `influence_edge_node`
- `forecast_branch_node`
- `safety_review_node`
- `blocked_action_node`

### 点云显示原则

- 外部能力候选不能显示成已实现能力。
- 预测分支不能显示成确定未来。
- 风险候选不能因为未执行就隐藏。
- 安全阻断必须作为一等状态可见。
- 每个预测评分必须能展开看到事实、变量和影响边。
- 每个需求候选必须能展开看到来源软件、系统目标、收益路径和危险路径。

## 与当前项目主线的关系

当前 B2B 社交辅助闭环可以先从低风险场景接入：

- 网络软件能力 -> 自动化 dry-run 工具需求。
- 软件功能 -> 平台快照校验需求。
- 文档工具 -> 报告页生成和审计证据需求。
- CRM / 日历 / 邮件能力 -> 客户跟进计划候选。
- 安全工具 -> 外部平台权限和凭证保护需求。

当前不做：

- 不自动安装网络软件。
- 不真实调用外部平台。
- 不自动部署未知软件。
- 不执行高风险自动化。
- 不绕过人工确认。
- 不把候选预测写成事实。

## 后续正式落地顺序

等图谱总进程确认后，建议正式拆单：

1. 定义 `capability_atom.v1`。
2. 定义 `capability_to_requirement_graph.v1`。
3. 定义 `requirement_candidate.v1`。
4. 定义 `possibility_forecast.v1`。
5. 定义 `fact_variable_fusion_rule.v1`。
6. 定义 `influence_edge.v1`。
7. 定义 `terminal_safety_review.v1`。
8. 扩展 `graph_projection.v1`，展示外部能力、需求候选、预测分支、变量和安全审查。
9. 同步流程树、Obsidian 视图、schema、样例和验证命令。

当前线程只记录需求，不进入正式实现。

## 后续深化记录

用户已补充“当全网没有完整匹配软件或能力时，需要分析现有软件和代码，拼接能力、生成实现路径并在沙盒中验证”的下层需求。该部分已单独沉淀到 `capability-composition-sandbox-expansion.md`。

该深化将本文件中的 `IntegrationCandidate`、`DeploymentCandidate` 和 `Terminal Safety Review` 进一步拆成：

- `Code Capability Slice`
- `Goal Capability Gap`
- `Capability Composition Plan`
- `Implementation Route`
- `Sandbox Verification Run`
- `Self-Awareness Governance Layer`
- `Safety Scope Profile`
- `Implementation Candidate`
