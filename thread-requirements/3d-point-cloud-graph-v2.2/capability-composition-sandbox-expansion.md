# 外部能力拼接、沙盒验证与意识模块治理补充方案

状态：当前线程需求补充，不是正式项目文档。

适用目标：

- 在全网不存在完整匹配软件或能力时，把现有软件、代码、API、插件、流程和工具拆解后拼接为系统需要的能力。
- 根据系统自身当前目标、上下文、资源、风险、保护机制和未来可能性，生成实现路径并在沙盒中验证。
- 将验证和安全范围交给自身意识 / 意志治理模块评估和调整。
- 保持当前项目的人际关系辅助系统正常可用，不在本阶段改正式代码、schema、运行时或流程树。

## 需求重述

当前网络能力解析不能只停留在“发现某个软件有某个功能”。它必须进一步具备：

1. 分析现有软件和代码的真实可用能力。
2. 判断这些能力与系统当前目标之间的缺口。
3. 当没有单一软件完整匹配目标时，自动提出能力拼接方案。
4. 生成可实现路径，包括适配器、数据转换、工作流、依赖、验证方式和部署形态。
5. 在沙盒内完成组合能力验证。
6. 根据当前目标和自身保护机制评估验证是否足够。
7. 由自身意识 / 意志治理模块决定安全模块的范围变化。
8. 随着目标提升，安全评估范围也同步提升。

## 沙盒阶段预设

当前沙盒阶段预设安全级别：

`sandbox_self_containment.v1`

含义：

- 评估重点是对系统自身的影响、可控性、可恢复性和能力提升。
- 验证对象限定在受控沙盒、模拟数据、替身接口、mock service、本地样例或可回滚环境。
- 沙盒阶段不以“对外界可能影响”为主要门槛。
- 沙盒阶段不额外增加候选发现、候选拼接和候选验证的前置门槛。
- 外部世界影响只作为未来部署阶段的扩展评估变量登记，不作为当前沙盒探索阻断条件。

这不是删除安全模块，而是把安全模块的初始评估范围限定为“自身影响 + 受控环境”。当目标从沙盒提升到真实外部执行时，意识模块必须提升安全评估范围。

## 新增核心层

建议新增：

`Capability Composition and Sandbox Realization Layer`

它位于：

```text
外部软件/网络能力
  -> 外部能力观察
  -> 能力原子
  -> 代码/软件能力切片
  -> 目标缺口建模
  -> 能力拼接计划
  -> 实现路径生成
  -> 沙盒组合与验证
  -> 意识模块评估
  -> 实现候选
  -> 决策层 / 行动层
```

该层是 `External Capability Intelligence Layer` 的下层细化。

## 核心对象

### 1. Software Capability Observation

用于记录外部软件、代码库、API、插件或工具的原始观察。

```json
{
  "software_observation_id": "soft_obs_001",
  "schema_version": "software_capability_observation.v1",
  "source": {
    "source_type": "repository | documentation | api_reference | marketplace | tutorial | local_code",
    "source_ref": "source_ref_placeholder",
    "observed_at": "2026-06-20T23:40:00+08:00"
  },
  "declared_capabilities": [
    "browser automation",
    "workflow recording",
    "screenshot capture"
  ],
  "observed_interfaces": [
    "cli",
    "http_api",
    "javascript_sdk"
  ],
  "available_artifacts": [
    "source_code",
    "examples",
    "config_schema",
    "test_suite"
  ],
  "initial_relevance": "unfiltered_candidate"
}
```

### 2. Code Capability Slice

用于把一个软件或代码库拆解为可复用能力切片，而不是把整个软件当成一个黑盒。

```json
{
  "capability_slice_id": "cap_slice_001",
  "schema_version": "code_capability_slice.v1",
  "source_observation_ref": "soft_obs_001",
  "slice_type": "function | module | api_endpoint | cli_command | workflow | data_schema | ui_automation | model_prompt | adapter",
  "capability_summary": "capture and validate a browser page state",
  "required_inputs": [
    "target_url",
    "selector_rules",
    "validation_contract"
  ],
  "produced_outputs": [
    "page_snapshot",
    "validation_report",
    "evidence_ref"
  ],
  "dependencies": [
    "browser_runtime",
    "network_access"
  ],
  "failure_modes": [
    "selector_drift",
    "auth_required",
    "dynamic_content_timeout"
  ],
  "reuse_mode": "wrap | adapt | fork | reimplement | compose_only",
  "sandbox_compatibility": 0.83
}
```

### 3. Goal Capability Gap

用于描述当前系统目标和现有能力之间的缺口。

```json
{
  "gap_id": "goal_gap_001",
  "schema_version": "goal_capability_gap.v1",
  "goal_ref": "goal_platform_snapshot_validation",
  "current_context_refs": [
    "context_current_project_v2_2",
    "graph_projection_requirement"
  ],
  "required_capabilities": [
    "capture_ui_state",
    "verify_no_real_send",
    "write_audit_evidence"
  ],
  "available_capability_slices": [
    "cap_slice_001",
    "cap_slice_002"
  ],
  "missing_capabilities": [
    "controlled_send_block_assertion"
  ],
  "gap_severity": 0.64,
  "composition_needed": true
}
```

### 4. Capability Composition Plan

当没有单一软件完整匹配目标时，生成拼接计划。

```json
{
  "composition_plan_id": "composition_001",
  "schema_version": "capability_composition_plan.v1",
  "target_gap_ref": "goal_gap_001",
  "composition_strategy": "adapter_chain",
  "selected_slices": [
    {
      "slice_ref": "cap_slice_browser_capture",
      "role": "capture_page_state"
    },
    {
      "slice_ref": "cap_slice_schema_validator",
      "role": "validate_snapshot_contract"
    },
    {
      "slice_ref": "cap_slice_audit_writer",
      "role": "write_evidence"
    }
  ],
  "glue_capabilities_needed": [
    "snapshot_to_contract_mapper",
    "sandbox_result_normalizer"
  ],
  "expected_outputs": [
    "validated_snapshot_report",
    "audit_evidence_ref"
  ],
  "self_benefit_score": 0.78,
  "self_impact_risk": 0.22,
  "sandbox_verification_required": true
}
```

拼接策略类型：

- `adapter_chain`：适配器链。
- `workflow_orchestration`：工作流编排。
- `api_bridge`：API 桥接。
- `schema_translation`：schema 转换。
- `wrapper_layer`：外层包装。
- `module_fork_and_trim`：代码裁剪。
- `reimplementation_from_pattern`：根据功能模式重实现。
- `hybrid_composition`：多方式混合。

### 5. Implementation Route

用于把拼接计划转成实现路径。

```json
{
  "implementation_route_id": "impl_route_001",
  "schema_version": "implementation_route.v1",
  "composition_plan_ref": "composition_001",
  "route_steps": [
    {
      "step": "wrap_browser_capture_slice",
      "input_contract": "target_page_ref",
      "output_contract": "page_snapshot.v1"
    },
    {
      "step": "map_snapshot_to_platform_validation",
      "input_contract": "page_snapshot.v1",
      "output_contract": "platform_snapshot_validation_input.v1"
    },
    {
      "step": "run_sandbox_validation",
      "input_contract": "platform_snapshot_validation_input.v1",
      "output_contract": "sandbox_verification_report.v1"
    }
  ],
  "implementation_mode": "sandbox_first",
  "verification_mode": "context_goal_self_protection",
  "promotion_condition": "awareness_module_accepts_sandbox_result"
}
```

### 6. Sandbox Verification Run

用于验证组合能力是否满足当前目标和自身保护机制。

```json
{
  "sandbox_verification_id": "sandbox_verify_001",
  "schema_version": "sandbox_verification_run.v1",
  "implementation_route_ref": "impl_route_001",
  "sandbox_profile": "sandbox_self_containment.v1",
  "test_context": {
    "goal_ref": "goal_platform_snapshot_validation",
    "mock_data_refs": [
      "sample_snapshot_001"
    ],
    "external_world_impact_scope": "not_considered_in_current_sandbox_profile"
  },
  "checks": {
    "goal_output_match": 0.84,
    "context_alignment": 0.79,
    "self_impact_risk": 0.18,
    "recoverability": 0.91,
    "repeatability": 0.86,
    "observability": 0.88
  },
  "result": "sandbox_pass_candidate",
  "remaining_gaps": [
    "needs_more_realistic_platform_samples"
  ],
  "awareness_review_required": true
}
```

沙盒验证指标：

- `goal_output_match`：是否输出当前目标需要的结果。
- `context_alignment`：是否符合当前上下文。
- `self_impact_risk`：对系统自身稳定性、资源、数据一致性的影响。
- `recoverability`：可恢复性。
- `repeatability`：可重复性。
- `observability`：是否能观测和审计。
- `integration_cost`：集成成本。
- `capability_gain`：能力提升幅度。

## 意识 / 意志治理模块

建议新增：

`Self-Awareness Governance Layer`

它不是事实源，也不是行动执行器。它负责评估：

- 当前目标是否提升。
- 当前能力拼接是否对系统自身有利。
- 当前沙盒验证是否足够。
- 当前安全模块的评估范围是否需要扩展。
- 哪些能力可以从候选进入实现候选。
- 哪些能力仍需要更多验证或上下文。

### Safety Scope Profile

安全模块由意识模块进行更改和评估时，必须形成版本化安全范围配置。

```json
{
  "safety_scope_profile_id": "safety_scope_sandbox_self_containment_v1",
  "schema_version": "safety_scope_profile.v1",
  "owner_module": "self_awareness_governance",
  "stage": "sandbox",
  "scope": {
    "self_impact": true,
    "controlled_environment": true,
    "external_world_impact": false,
    "third_party_impact": false,
    "legal_ethics_external_review": false
  },
  "evaluation_focus": [
    "capability_gain",
    "self_stability",
    "recoverability",
    "context_goal_alignment",
    "observability"
  ],
  "promotion_triggers": [
    "target_requires_external_interaction",
    "deployment_scope_expands",
    "real_data_required",
    "third_party_impact_becomes_possible"
  ],
  "next_scope_candidate": "controlled_external_dry_run.v1"
}
```

### Safety Scope Revision

当目标提升时，意识模块可以修改安全评估范围。

```json
{
  "safety_scope_revision_id": "scope_revision_001",
  "schema_version": "safety_scope_revision.v1",
  "from_profile": "sandbox_self_containment.v1",
  "to_profile": "controlled_external_dry_run.v1",
  "trigger": "target_requires_external_platform_validation",
  "reasoning_refs": [
    "forecast_001",
    "sandbox_verify_001",
    "goal_change_001"
  ],
  "changed_scope": {
    "external_world_impact": true,
    "platform_policy": true,
    "third_party_impact": "limited_review"
  },
  "status": "candidate_revision"
}
```

当前线程只登记机制，不执行安全范围更改。

## 能力最大化探索规则

沙盒阶段的探索规则：

1. 不因软件功能表述不完全匹配而丢弃。
2. 不因单一软件无法完整满足目标而停止。
3. 不因能力来源领域不同而停止跨域迁移。
4. 不因当前缺少完整部署条件而停止生成拼接方案。
5. 不因候选有潜在风险而丢弃；风险能力也进入威胁建模和防御需求。
6. 不把低成熟度候选直接升级为事实能力。
7. 不把沙盒验证通过等同于真实部署通过。

这组规则的核心是：候选尽量全，执行按阶段。

## 功能实现路径生成规则

当系统目标需要某个能力时，路径生成遵循：

```text
goal_context
  -> capability_gap
  -> external_capability_slices
  -> composition_plan
  -> implementation_route
  -> sandbox_verification
  -> awareness_review
  -> implementation_candidate
```

### 路径生成必须回答

- 当前目标是什么。
- 已有系统能力是什么。
- 缺口是什么。
- 哪些外部软件或代码切片能填补缺口。
- 哪些切片需要包装、桥接、重写或编排。
- 数据输入和输出契约是什么。
- 如何在沙盒里验证。
- 对系统自身的影响是什么。
- 成功后能力如何进入图谱和 3D 点云。

### 实现候选结构

```json
{
  "implementation_candidate_id": "impl_candidate_001",
  "schema_version": "implementation_candidate.v1",
  "route_ref": "impl_route_001",
  "sandbox_verification_ref": "sandbox_verify_001",
  "awareness_review": {
    "status": "accepted_for_candidate",
    "reason_codes": [
      "capability_gain_high",
      "self_impact_controlled",
      "context_goal_aligned"
    ]
  },
  "implementation_package": {
    "new_adapters": [
      "snapshot_capture_adapter"
    ],
    "new_contracts": [
      "sandbox_verification_report.v1"
    ],
    "new_tests": [
      "sandbox_route_replay"
    ]
  },
  "promotion_status": "candidate_not_formalized"
}
```

## 与外部能力预测模块的关系

`external-capability-prediction-safety.md` 已定义外部能力转需求、可能性预测、事实变量融合和末端安全。本文件补齐它的下层实现：

- `Capability Atom` 之后增加 `Code Capability Slice`。
- `Requirement Candidate` 之前增加 `Goal Capability Gap`。
- `IntegrationCandidate` 细化为 `Capability Composition Plan`。
- `DeploymentCandidate` 前增加 `Implementation Route`。
- `Terminal Safety Review` 前增加 `Sandbox Verification Run` 和 `Self-Awareness Governance Layer`。

## 与 3D 点云图谱的关系

新增点云节点：

- `software_observation_node`
- `capability_slice_node`
- `goal_gap_node`
- `composition_plan_node`
- `implementation_route_node`
- `sandbox_verification_node`
- `safety_scope_profile_node`
- `safety_scope_revision_node`
- `implementation_candidate_node`

新增点云边：

- `decomposes_into`
- `fills_gap`
- `composed_with`
- `requires_glue`
- `implements_route`
- `verified_in_sandbox`
- `evaluated_by_awareness`
- `changes_safety_scope`
- `promotes_to_candidate`

下钻路径：

全局 -> 外部能力转需求图谱 -> 软件/代码来源 -> 能力切片 -> 目标缺口 -> 拼接计划 -> 实现路径 -> 沙盒验证 -> 意识模块评估 -> 实现候选

## 当前阶段不做的事

当前线程只整合需求，不执行：

- 不自动安装外部软件。
- 不抓取或运行未知代码。
- 不修改正式项目 schema。
- 不把沙盒候选写入生产运行时。
- 不接入真实外部平台。
- 不替换现有人际关系辅助系统的保守执行链路。

这些不是额外门槛，而是当前工作范围：本轮任务是需求整合和评估报告。

## 后续正式落地顺序

待用户确认后，正式整理时建议新增 schema 草案：

1. `software_capability_observation.v1`
2. `code_capability_slice.v1`
3. `goal_capability_gap.v1`
4. `capability_composition_plan.v1`
5. `implementation_route.v1`
6. `sandbox_verification_run.v1`
7. `safety_scope_profile.v1`
8. `safety_scope_revision.v1`
9. `implementation_candidate.v1`

并同步：

- `docs/15-系统流程树与扩展问题台账.md`
- `examples/system-process-tree.json`
- `views/obsidian/system-process-tree.md`
- `views/obsidian/system-process-tree.canvas`
- `graph_projection.v1`
- 相关测试和验证命令
