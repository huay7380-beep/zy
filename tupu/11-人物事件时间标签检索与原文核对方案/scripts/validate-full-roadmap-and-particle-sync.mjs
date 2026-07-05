import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const planDir = path.resolve(scriptDir, "..");
const tupuDir = path.resolve(planDir, "..");

const files = {
  root: path.join(tupuDir, "ROOT-图谱构建底层逻辑规则.md"),
  control: path.join(planDir, "00-总目标与执行控制台.md"),
  readme: path.join(planDir, "README.md"),
  schemaValidator: path.join(scriptDir, "validate-p1-schema.mjs"),
  schemaContractValidator: path.join(scriptDir, "validate-p1-json-schema-contract.mjs"),
  evidenceReadbackValidator: path.join(scriptDir, "validate-p1-evidence-readback-coverage.mjs"),
  stageControlValidator: path.join(scriptDir, "validate-p0-p12-stage-control.mjs"),
  reviewDecisionTemplate: path.join(planDir, "review-gates", "P1-review-decision.template.json"),
  reviewDecisionValidator: path.join(scriptDir, "validate-p1-review-decision.mjs"),
  currentPhaseValidator: path.join(scriptDir, "validate-current-phase-state.mjs"),
  p1CompletionAuditValidator: path.join(scriptDir, "validate-p1-completion-audit.mjs"),
  p2PreparationBoundaryValidator: path.join(scriptDir, "validate-p2-preparation-boundary.mjs"),
  p2FixtureContractValidator: path.join(scriptDir, "validate-p2-fixture-contract.mjs"),
  generatedArtifactsFreshnessValidator: path.join(
    scriptDir,
    "validate-generated-artifacts-freshness.mjs"
  ),
  p2EntryGateValidator: path.join(scriptDir, "validate-p2-entry-gate.mjs"),
  p1ReviewPackWriter: path.join(scriptDir, "write-p1-review-pack.mjs"),
  p1SchemaDoc: path.join(planDir, "18-P1-JSONSchemaDraft.v1-图谱核心对象草案.md"),
};

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function has(text, pattern) {
  return pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern);
}

function extractPhase(text, phase) {
  const escaped = phase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(
    new RegExp(`### ${escaped}[^\\n]*\\n([\\s\\S]*?)(?=\\n### P\\d+ |\\n## \\d+\\.|$)`)
  );
  return match ? match[1] : "";
}

const result = {
  validator: "validate-full-roadmap-and-particle-sync.mjs",
  files_exist: Object.fromEntries(
    Object.entries(files).map(([key, filePath]) => [key, fs.existsSync(filePath)])
  ),
  root_checks: {},
  control_checks: {},
  readme_checks: {},
  p1_doc_checks: {},
  review_gate_checks: {},
  p2_entry_gate_checks: {},
  phase_checks: [],
  blocked_boundary_checks: {},
  validation_status: "PENDING",
};

const allFilesExist = Object.values(result.files_exist).every(Boolean);

let root = "";
let control = "";
let readme = "";
let p1SchemaDoc = "";
let reviewDecisionTemplate = "";
let p2EntryGateValidator = "";

if (allFilesExist) {
  root = readText(files.root);
  control = readText(files.control);
  readme = readText(files.readme);
  p1SchemaDoc = readText(files.p1SchemaDoc);
  reviewDecisionTemplate = readText(files.reviewDecisionTemplate);
  p2EntryGateValidator = readText(files.p2EntryGateValidator);

  result.root_checks = {
    has_particle_sync_rule: has(root, "## 12. 3D 粒子同步跟进规则"),
    has_readonly_boundary: has(root, "三维粒子 OS 不允许") && has(root, "只读投影"),
    has_projection_minimum_fields: [
      "projection_id",
      "object_ref",
      "evidence_anchor_ids",
      "visual_weight_level",
    ].every((item) => has(root, item)),
    has_particle_forbidden_actions: [
      "粒子层写事实",
      "粒子层合并人物",
      "通过粒子操作直接修改关系状态",
      "通过粒子操作直接执行外部动作",
    ].every((item) => has(root, item)),
    has_p1_completion_audit_rule:
      has(root, "scripts/validate-p1-completion-audit.mjs") &&
      has(root, "PASS_P1_COMPLETION_AUDIT_PENDING_USER_REVIEW"),
    has_p1_schema_contract_rule:
      has(root, "scripts/validate-p1-json-schema-contract.mjs") &&
      has(root, "PASS_P1_JSON_SCHEMA_CONTRACT"),
    has_p1_review_pack_rule:
      has(root, "scripts/write-p1-review-pack.mjs") &&
      has(root, "PASS_P1_REVIEW_PACK_PENDING_USER_DECISION"),
    has_generated_artifacts_freshness_rule:
      has(root, "scripts/validate-generated-artifacts-freshness.mjs") &&
      has(root, "PASS_GENERATED_ARTIFACTS_FRESHNESS"),
    has_stage_control_validator_rule:
      has(root, "scripts/validate-p0-p12-stage-control.mjs") &&
      has(root, "PASS_P0_P12_STAGE_CONTROL"),
    has_stage_control_self_test_rule:
      has(root, "validate-p0-p12-stage-control.mjs --self-test") &&
      has(root, "PASS_P0_P12_STAGE_CONTROL_SELF_TEST"),
    has_p2_entry_gate_rule:
      has(root, "scripts/validate-p2-entry-gate.mjs") &&
      has(root, "PASS_P2_ENTRY_GATE_SELF_TEST") &&
      has(root, "PASS_P2_ENTRY_BLOCKED_PENDING_USER_DECISION") &&
      has(root, "approval_transition_checks"),
    has_p2_fixture_contract_rule:
      has(root, "scripts/validate-p2-fixture-contract.mjs") &&
      has(root, "PASS_P2_FIXTURE_CONTRACT_READY") &&
      has(root, "PASS_P2_FIXTURE_CONTRACT_SELF_TEST"),
    has_particle_drift_gate:
      has(root, "### 12.6 3D 同步防偏离门") &&
      has(root, "projection_sync_drift_gate_active") &&
      has(root, "ParticleSyncCheckpoint"),
    has_particle_stage_followup_rule:
      has(root, "### 12.7 3D 粒子阶段跟随说明") &&
      has(root, "particle_stage_followup_required") &&
      has(root, "ProjectionDecisionDraft") &&
      has(root, "ParticleSyncCheckpoint"),
  };

  result.control_checks = {
    has_particle_design: has(control, "## 16. 3D 粒子同步跟进设计说明"),
    has_particle_drift_gate:
      has(control, "### 16.5 3D 同步防偏离门") &&
      has(control, "projection_sync_drift_gate_active"),
    has_particle_sync_checkpoint:
      has(control, "### 16.6 ParticleSyncCheckpoint 标准格式") &&
      [
        "stage_id",
        "graph_changes",
        "projection_decisions",
        "particle_projection_delta",
        "object_ref_coverage",
        "evidence_anchor_coverage",
        "blocked_write_checks",
      ].every((item) => has(control, item)),
    has_particle_stage_followup_design:
      has(control, "### 16.7 3D 粒子阶段跟随说明") &&
      has(control, "particle_stage_followup_required") &&
      has(control, "ProjectionDecisionDraft") &&
      has(control, "ParticleSyncCheckpoint"),
    has_full_roadmap: has(control, "## 17. 图谱完整构建路线图"),
    has_stage_overview_table: has(control, "### 17.0 P0-P12 阶段总览表"),
    has_roadmap_validation_record: has(control, "## 18. 3D 同步与完整路线图验证记录"),
    preserves_storage_plan:
      has(control, "文件归档和 SQLite 是主存储底座") &&
      has(control, "FTS5 是检索层") &&
      has(control, "向量库不是事实源") &&
      has(control, "图数据库不是事实源"),
    optional_layers_are_explicit:
      has(control, "若用户确认跳过 P8/P9，可直接进入 P10 Runtime 封装") &&
      has(control, "若跳过：记录 skipped_by_user"),
    has_p1_review_decision_state:
      has(control, "review-gates/P1-review-decision.template.json") &&
      has(control, "scripts/validate-p1-review-decision.mjs") &&
      has(control, "PASS_APPROVED_FOR_P2_FIXTURE_ONLY"),
    has_current_phase_preflight:
      has(control, "scripts/validate-current-phase-state.mjs") &&
      has(control, "PASS_CURRENT_PHASE_STATE") &&
      has(control, "p2_entry_allowed = false"),
    has_p1_completion_audit:
      has(control, "scripts/validate-p1-completion-audit.mjs") &&
      has(control, "PASS_P1_COMPLETION_AUDIT_PENDING_USER_REVIEW") &&
      has(control, "p1_ready_for_user_review = true"),
    has_p2_preparation_boundary:
      has(control, "scripts/validate-p2-preparation-boundary.mjs") &&
      has(control, "PASS_P2_PREPARATION_BOUNDARY_BLOCKED_PENDING_USER_DECISION"),
    has_p2_fixture_contract:
      has(control, "### 20.10 P2 fixture 执行契约") &&
      has(control, "scripts/validate-p2-fixture-contract.mjs") &&
      has(control, "validate-p2-fixture-contract.mjs --self-test") &&
      has(control, "PASS_P2_FIXTURE_CONTRACT_READY") &&
      has(control, "PASS_P2_FIXTURE_CONTRACT_SELF_TEST"),
    has_p1_review_pack:
      has(control, "scripts/write-p1-review-pack.mjs") &&
      has(control, "PASS_P1_REVIEW_PACK_PENDING_USER_DECISION"),
    has_generated_artifacts_freshness:
      has(control, "scripts/validate-generated-artifacts-freshness.mjs") &&
      has(control, "PASS_GENERATED_ARTIFACTS_FRESHNESS"),
    has_evidence_readback_validator:
      has(control, "scripts/validate-p1-evidence-readback-coverage.mjs") &&
      has(control, "PASS_EVIDENCE_READBACK_COVERAGE"),
    has_schema_contract_validator:
      has(control, "scripts/validate-p1-json-schema-contract.mjs") &&
      has(control, "PASS_P1_JSON_SCHEMA_CONTRACT"),
    has_stage_control_validator:
      has(control, "scripts/validate-p0-p12-stage-control.mjs") &&
      has(control, "PASS_P0_P12_STAGE_CONTROL"),
    has_stage_control_self_test:
      has(control, "validate-p0-p12-stage-control.mjs --self-test") &&
      has(control, "PASS_P0_P12_STAGE_CONTROL_SELF_TEST"),
    has_p2_entry_gate:
      has(control, "scripts/validate-p2-entry-gate.mjs") &&
      has(control, "PASS_P2_ENTRY_GATE_SELF_TEST") &&
      has(control, "PASS_P2_ENTRY_BLOCKED_PENDING_USER_DECISION") &&
      has(control, "approval_transition_checks") &&
      has(control, "p2_fixture_contract_output_checks"),
  };

  result.readme_checks = {
    mentions_roadmap: has(readme, "完整构建路线图"),
    mentions_particle_sync: has(readme, "3D 粒子同步跟进规则"),
    mentions_particle_drift_gate:
      has(readme, "projection_sync_drift_gate") && has(readme, "ParticleSyncCheckpoint"),
    mentions_particle_stage_followup: has(readme, "3D 粒子阶段跟随说明"),
    mentions_this_validator: has(readme, "validate-full-roadmap-and-particle-sync.mjs"),
    mentions_schema_validator: has(readme, "validate-p1-schema.mjs"),
    mentions_schema_contract_validator: has(readme, "validate-p1-json-schema-contract.mjs"),
    mentions_evidence_readback_validator: has(
      readme,
      "validate-p1-evidence-readback-coverage.mjs"
    ),
    mentions_stage_control_validator: has(readme, "validate-p0-p12-stage-control.mjs"),
    mentions_stage_control_self_test:
      has(readme, "validate-p0-p12-stage-control.mjs --self-test") &&
      has(readme, "PASS_P0_P12_STAGE_CONTROL_SELF_TEST"),
    mentions_review_gate_validator: has(readme, "validate-p1-review-decision.mjs"),
    mentions_review_gate_template: has(readme, "P1-review-decision.template.json"),
    mentions_current_phase_validator: has(readme, "validate-current-phase-state.mjs"),
    mentions_p1_completion_audit_validator: has(readme, "validate-p1-completion-audit.mjs"),
    mentions_p2_preparation_boundary_validator: has(readme, "validate-p2-preparation-boundary.mjs"),
    mentions_p2_fixture_contract_validator: has(readme, "validate-p2-fixture-contract.mjs"),
    mentions_p2_fixture_contract_self_test: has(
      readme,
      "validate-p2-fixture-contract.mjs --self-test"
    ),
    mentions_generated_artifacts_freshness_validator: has(
      readme,
      "validate-generated-artifacts-freshness.mjs"
    ),
    mentions_p2_entry_gate_validator: has(readme, "validate-p2-entry-gate.mjs"),
    mentions_p2_entry_gate_self_test: has(readme, "validate-p2-entry-gate.mjs --self-test"),
    mentions_approval_transition_checks: has(readme, "approval_transition_checks"),
    mentions_p2_fixture_contract_output_checks: has(
      readme,
      "p2_fixture_contract_output_checks"
    ),
    mentions_p1_review_pack_writer: has(readme, "write-p1-review-pack.mjs"),
  };

  result.p1_doc_checks = {
    mentions_p1_schema_contract_validator: has(p1SchemaDoc, "validate-p1-json-schema-contract.mjs"),
    mentions_p1_review_pack_writer: has(p1SchemaDoc, "write-p1-review-pack.mjs"),
    mentions_p1_review_pack_status: has(
      p1SchemaDoc,
      "PASS_P1_REVIEW_PACK_PENDING_USER_DECISION"
    ),
    mentions_generated_artifacts_freshness_validator: has(
      p1SchemaDoc,
      "validate-generated-artifacts-freshness.mjs"
    ),
    mentions_p2_fixture_contract_validator: has(
      p1SchemaDoc,
      "validate-p2-fixture-contract.mjs"
    ),
    mentions_p2_fixture_contract_self_test: has(
      p1SchemaDoc,
      "validate-p2-fixture-contract.mjs --self-test"
    ),
    mentions_particle_drift_gate:
      has(p1SchemaDoc, "ProjectionDecision") && has(p1SchemaDoc, "ParticleSyncCheckpoint"),
    mentions_stage_control_self_test:
      has(p1SchemaDoc, "validate-p0-p12-stage-control.mjs --self-test") &&
      has(p1SchemaDoc, "PASS_P0_P12_STAGE_CONTROL_SELF_TEST"),
    mentions_p2_entry_gate: has(p1SchemaDoc, "validate-p2-entry-gate.mjs"),
    mentions_p2_entry_gate_self_test: has(
      p1SchemaDoc,
      "validate-p2-entry-gate.mjs --self-test"
    ),
    mentions_approval_transition_checks: has(p1SchemaDoc, "approval_transition_checks"),
    mentions_p2_fixture_contract_output_checks: has(
      p1SchemaDoc,
      "p2_fixture_contract_output_checks"
    ),
  };

  result.review_gate_checks = {
    includes_schema_contract_validator: has(
      reviewDecisionTemplate,
      "validate-p1-json-schema-contract.mjs"
    ),
    includes_evidence_readback_validator: has(
      reviewDecisionTemplate,
      "validate-p1-evidence-readback-coverage.mjs"
    ),
    includes_stage_control_validator: has(
      reviewDecisionTemplate,
      "validate-p0-p12-stage-control.mjs"
    ),
    includes_stage_control_self_test: has(
      reviewDecisionTemplate,
      "validate-p0-p12-stage-control.mjs --self-test"
    ),
    includes_current_phase_validator: has(
      reviewDecisionTemplate,
      "validate-current-phase-state.mjs"
    ),
    includes_completion_audit_validator: has(
      reviewDecisionTemplate,
      "validate-p1-completion-audit.mjs"
    ),
    includes_p2_preparation_boundary_validator: has(
      reviewDecisionTemplate,
      "validate-p2-preparation-boundary.mjs"
    ),
    includes_p2_fixture_contract_validator: has(
      reviewDecisionTemplate,
      "validate-p2-fixture-contract.mjs"
    ),
    includes_p2_fixture_contract_self_test: has(
      reviewDecisionTemplate,
      "validate-p2-fixture-contract.mjs --self-test"
    ),
    includes_generated_artifacts_freshness_validator: has(
      reviewDecisionTemplate,
      "validate-generated-artifacts-freshness.mjs"
    ),
    includes_p2_entry_gate_validator: has(
      reviewDecisionTemplate,
      "validate-p2-entry-gate.mjs"
    ),
    includes_p2_entry_gate_self_test: has(
      reviewDecisionTemplate,
      "validate-p2-entry-gate.mjs --self-test"
    ),
    includes_review_gate_state_machine: has(
      reviewDecisionTemplate,
      "validate-p1-review-decision.mjs --self-test"
    ),
    includes_fixture_only_scope_check: has(
      reviewDecisionTemplate,
      "p2_scope_remains_fixture_only"
    ),
  };

  result.p2_entry_gate_checks = {
    has_approval_transition_check_output: has(
      p2EntryGateValidator,
      "approval_transition_checks"
    ),
    has_fixture_contract_output_check_output: has(
      p2EntryGateValidator,
      "p2_fixture_contract_output_checks"
    ),
    checks_review_pack_transition_presence: has(
      p2EntryGateValidator,
      "review_pack_has_approval_transition_requirements"
    ),
    checks_transition_current_state_against_review_gate: has(
      p2EntryGateValidator,
      "transition_current_state_matches_review_gate"
    ),
    checks_transition_current_state_against_current_phase: has(
      p2EntryGateValidator,
      "transition_current_state_matches_current_phase"
    ),
    checks_transition_current_state_against_completion_audit: has(
      p2EntryGateValidator,
      "transition_current_state_matches_completion_audit"
    ),
    checks_transition_particle_readonly_invariants: has(
      p2EntryGateValidator,
      "transition_particle_invariants_read_only"
    ),
    checks_p2_entry_gate_self_test_required: has(
      p2EntryGateValidator,
      "transition_requires_p2_entry_gate_self_test"
    ),
    checks_p2_fixture_contract_required: has(
      p2EntryGateValidator,
      "transition_requires_p2_fixture_contract"
    ),
    checks_p2_fixture_contract_self_test_required: has(
      p2EntryGateValidator,
      "transition_requires_p2_fixture_contract_self_test"
    ),
    checks_p2_fixture_contract_quality_outputs:
      has(p2EntryGateValidator, "p2_fixture_contract_has_quality_gate_checks") &&
      has(p2EntryGateValidator, "p2_fixture_contract_has_scenario_quality_checks"),
    checks_p2_fixture_contract_trace_outputs:
      has(p2EntryGateValidator, "p2_fixture_contract_has_trace_checkpoint_checks") &&
      has(p2EntryGateValidator, "p2_fixture_contract_has_scenario_trace_checks"),
    checks_p2_fixture_contract_non_write_flags: has(
      p2EntryGateValidator,
      "p2_fixture_contract_preserves_non_write_flags"
    ),
    checks_p2_fixture_contract_high_risk_boundaries: has(
      p2EntryGateValidator,
      "p2_fixture_contract_preserves_high_risk_boundaries"
    ),
    checks_required_hard_gate_outputs: has(
      p2EntryGateValidator,
      "transition_required_hard_gate_outputs_complete"
    ),
    checks_required_fixture_contract_output_checks: has(
      p2EntryGateValidator,
      "transition_required_fixture_contract_output_checks_complete"
    ),
    checks_required_particle_stage_followup_outputs: has(
      p2EntryGateValidator,
      "transition_required_particle_stage_followup_outputs_complete"
    ),
    self_test_blocks_missing_quality_gate_outputs:
      has(p2EntryGateValidator, "missing_quality_gate_output_blocks") &&
      has(p2EntryGateValidator, "missing_scenario_quality_output_blocks"),
    self_test_blocks_missing_transition_output_requirements:
      has(p2EntryGateValidator, "missing_required_hard_gate_output_blocks") &&
      has(p2EntryGateValidator, "missing_required_fixture_contract_output_check_blocks") &&
      has(p2EntryGateValidator, "missing_required_particle_stage_followup_output_blocks"),
    has_self_test_mode: has(p2EntryGateValidator, "validate-p2-entry-gate.mjs --self-test"),
    has_self_test_pass_status: has(p2EntryGateValidator, "PASS_P2_ENTRY_GATE_SELF_TEST"),
    blocks_when_transition_checks_fail: has(
      p2EntryGateValidator,
      "Object.values(approvalTransitionChecks).every(Boolean)"
    ),
  };

  const requiredPhaseTerms = [
    "目标：",
    "输入：",
    "输出：",
    "边界：",
    "3D 粒子说明：",
    "验证：",
  ];

  for (let index = 0; index <= 12; index += 1) {
    const phase = `P${index}`;
    const text = extractPhase(control, phase);
    const missing = requiredPhaseTerms.filter((term) => !has(text, term));
    if (index < 12 && !has(text, "进入下一阶段条件：")) {
      missing.push("进入下一阶段条件：");
    }
    if (index === 12 && !has(text, "持续运行条件：")) {
      missing.push("持续运行条件：");
    }
    result.phase_checks.push({
      phase,
      found: text.length > 0,
      missing,
      status: text.length > 0 && missing.length === 0 ? "PASS" : "FAIL",
    });
  }

  result.blocked_boundary_checks = {
    runtime_still_blocked: has(control, "runtime_entry = still_blocked"),
    real_source_still_blocked: has(control, "real_source_entry = still_blocked"),
    relationship_state_write_blocked: has(control, "relationship_state_write = blocked"),
    identity_merge_blocked: has(control, "identity_merge = blocked"),
    external_action_blocked: has(control, "external_action = blocked"),
    learning_weight_promotion_blocked: has(control, "learning_weight_promotion = blocked"),
    particle_write_forbidden: has(control, "三维粒子 OS = 人类观察界面，不是事实存储层"),
  };
}

const sectionsPass =
  allFilesExist &&
  Object.values(result.root_checks).every(Boolean) &&
  Object.values(result.control_checks).every(Boolean) &&
  Object.values(result.readme_checks).every(Boolean) &&
  Object.values(result.p1_doc_checks).every(Boolean) &&
  Object.values(result.review_gate_checks).every(Boolean) &&
  Object.values(result.p2_entry_gate_checks).every(Boolean) &&
  result.phase_checks.every((phase) => phase.status === "PASS") &&
  Object.values(result.blocked_boundary_checks).every(Boolean);

result.validation_status = sectionsPass ? "PASS" : "FAIL";

console.log(JSON.stringify(result, null, 2));

if (!sectionsPass) {
  process.exitCode = 1;
}
