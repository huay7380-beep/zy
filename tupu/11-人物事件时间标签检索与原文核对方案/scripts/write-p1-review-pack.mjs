import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const planDir = path.resolve(scriptDir, "..");
const writeMode = !process.argv.includes("--check");

const outputDir = path.join(planDir, "review-gates", "generated");
const jsonOutputPath = path.join(outputDir, "P1-review-pack.generated.json");
const markdownOutputPath = path.join(outputDir, "P1-review-pack.generated.md");
const decisionTemplatePath = path.join(planDir, "review-gates", "P1-review-decision.template.json");

const validators = [
  {
    id: "p1_schema",
    args: ["validate-p1-schema.mjs"],
    allowed_statuses: ["PASS"],
  },
  {
    id: "p1_json_schema_contract",
    args: ["validate-p1-json-schema-contract.mjs"],
    allowed_statuses: ["PASS_P1_JSON_SCHEMA_CONTRACT"],
  },
  {
    id: "p1_evidence_readback_coverage",
    args: ["validate-p1-evidence-readback-coverage.mjs"],
    allowed_statuses: ["PASS_EVIDENCE_READBACK_COVERAGE"],
  },
  {
    id: "full_roadmap_and_particle_sync",
    args: ["validate-full-roadmap-and-particle-sync.mjs"],
    allowed_statuses: ["PASS"],
  },
  {
    id: "p0_p12_stage_control",
    args: ["validate-p0-p12-stage-control.mjs"],
    allowed_statuses: ["PASS_P0_P12_STAGE_CONTROL"],
  },
  {
    id: "p0_p12_stage_control_self_test",
    args: ["validate-p0-p12-stage-control.mjs", "--self-test"],
    allowed_statuses: ["PASS_P0_P12_STAGE_CONTROL_SELF_TEST"],
  },
  {
    id: "p1_review_decision",
    args: ["validate-p1-review-decision.mjs"],
    allowed_statuses: [
      "PASS_PENDING_USER_DECISION",
      "PASS_APPROVED_FOR_P2_FIXTURE_ONLY",
      "PASS_NEEDS_SCHEMA_REVISION_BEFORE_P2",
      "PASS_REJECTED_FOR_P2",
    ],
  },
  {
    id: "p1_review_gate_state_machine",
    args: ["validate-p1-review-decision.mjs", "--self-test"],
    allowed_statuses: ["PASS_REVIEW_GATE_STATE_MACHINE"],
  },
  {
    id: "current_phase_state",
    args: ["validate-current-phase-state.mjs"],
    allowed_statuses: ["PASS_CURRENT_PHASE_STATE"],
  },
  {
    id: "p1_completion_audit",
    args: ["validate-p1-completion-audit.mjs"],
    allowed_statuses: [
      "PASS_P1_COMPLETION_AUDIT_PENDING_USER_REVIEW",
      "PASS_P1_COMPLETION_AUDIT_APPROVED_FOR_P2_FIXTURE_ONLY",
      "PASS_P1_COMPLETION_AUDIT_NEEDS_SCHEMA_REVISION_BEFORE_P2",
      "PASS_P1_COMPLETION_AUDIT_REJECTED_FOR_P2",
    ],
  },
  {
    id: "p2_preparation_boundary",
    args: ["validate-p2-preparation-boundary.mjs"],
    allowed_statuses: [
      "PASS_P2_PREPARATION_BOUNDARY_BLOCKED_PENDING_USER_DECISION",
      "PASS_P2_PREPARATION_BOUNDARY_APPROVED_FOR_FIXTURE_ONLY",
      "PASS_P2_PREPARATION_BOUNDARY_NEEDS_SCHEMA_REVISION",
      "PASS_P2_PREPARATION_BOUNDARY_REJECTED",
    ],
  },
  {
    id: "p2_fixture_contract",
    args: ["validate-p2-fixture-contract.mjs"],
    allowed_statuses: ["PASS_P2_FIXTURE_CONTRACT_READY"],
  },
  {
    id: "p2_fixture_contract_self_test",
    args: ["validate-p2-fixture-contract.mjs", "--self-test"],
    allowed_statuses: ["PASS_P2_FIXTURE_CONTRACT_SELF_TEST"],
  },
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function runValidator(validator) {
  const child = spawnSync(
    process.execPath,
    [path.join(scriptDir, validator.args[0]), ...validator.args.slice(1)],
    {
      cwd: scriptDir,
      encoding: "utf8",
    }
  );

  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(child.stdout);
  } catch (error) {
    parseError = error.message;
  }

  const validationStatus = parsed?.validation_status ?? null;
  return {
    id: validator.id,
    command: `node ${validator.args.join(" ")}`,
    exit_code: child.status,
    stdout_parse_ok: parsed !== null,
    parse_error: parseError,
    validation_status: validationStatus,
    expected_pass: validator.allowed_statuses.includes(validationStatus),
    stderr: child.stderr?.trim() || null,
    data: parsed,
  };
}

function statusFor({ allPass, p2EntryAllowed, reviewStatus, completionStatus }) {
  if (!allPass) return "FAIL_P1_REVIEW_PACK";
  if (p2EntryAllowed) return "PASS_P1_REVIEW_PACK_APPROVED_FOR_P2_FIXTURE_ONLY";
  if (reviewStatus === "PASS_NEEDS_SCHEMA_REVISION_BEFORE_P2") {
    return "PASS_P1_REVIEW_PACK_NEEDS_SCHEMA_REVISION_BEFORE_P2";
  }
  if (reviewStatus === "PASS_REJECTED_FOR_P2") {
    return "PASS_P1_REVIEW_PACK_REJECTED_FOR_P2";
  }
  if (completionStatus === "PASS_P1_COMPLETION_AUDIT_PENDING_USER_REVIEW") {
    return "PASS_P1_REVIEW_PACK_PENDING_USER_DECISION";
  }
  return "FAIL_P1_REVIEW_PACK";
}

function buildApprovalTransitionRequirements({
  decisionTemplate,
  currentPhase,
  completionAudit,
  reviewDecision,
  p2EntryAllowed,
}) {
  return {
    purpose:
      "records the exact P1-to-P2 fixture approval transition requirements; this object does not approve P2 by itself",
    allowed_decision_states_for_p2: [
      "approved_for_p2_fixture_only",
      "approved_with_minor_notes_for_p2_fixture_only",
    ],
    required_decision_fields: [
      "decision_state in allowed_decision_states_for_p2",
      "reviewer is non-empty",
      "decided_at is an ISO timestamp",
      "all checklist items are accepted or accepted_with_minor_notes",
      "boundary_assertions keep runtime, real source, relationship state write, identity merge, external action, learning weight promotion, and particle write-back blocked",
    ],
    required_validation_statuses: [
      {
        id: "p1_schema",
        command: "node validate-p1-schema.mjs",
        required_status: "PASS",
      },
      {
        id: "p1_json_schema_contract",
        command: "node validate-p1-json-schema-contract.mjs",
        required_status: "PASS_P1_JSON_SCHEMA_CONTRACT",
      },
      {
        id: "p1_evidence_readback_coverage",
        command: "node validate-p1-evidence-readback-coverage.mjs",
        required_status: "PASS_EVIDENCE_READBACK_COVERAGE",
      },
      {
        id: "full_roadmap_and_particle_sync",
        command: "node validate-full-roadmap-and-particle-sync.mjs",
        required_status: "PASS",
      },
      {
        id: "p0_p12_stage_control",
        command: "node validate-p0-p12-stage-control.mjs",
        required_status: "PASS_P0_P12_STAGE_CONTROL",
      },
      {
        id: "p0_p12_stage_control_self_test",
        command: "node validate-p0-p12-stage-control.mjs --self-test",
        required_status: "PASS_P0_P12_STAGE_CONTROL_SELF_TEST",
      },
      {
        id: "p1_review_decision",
        command: "node validate-p1-review-decision.mjs",
        required_status: "PASS_APPROVED_FOR_P2_FIXTURE_ONLY",
      },
      {
        id: "current_phase_state",
        command: "node validate-current-phase-state.mjs",
        required_status: "PASS_CURRENT_PHASE_STATE with p2_entry_allowed=true",
      },
      {
        id: "p1_completion_audit",
        command: "node validate-p1-completion-audit.mjs",
        required_status: "PASS_P1_COMPLETION_AUDIT_APPROVED_FOR_P2_FIXTURE_ONLY",
      },
      {
        id: "p2_preparation_boundary",
        command: "node validate-p2-preparation-boundary.mjs",
        required_status: "PASS_P2_PREPARATION_BOUNDARY_APPROVED_FOR_FIXTURE_ONLY",
      },
      {
        id: "p2_fixture_contract",
        command: "node validate-p2-fixture-contract.mjs",
        required_status: "PASS_P2_FIXTURE_CONTRACT_READY",
      },
      {
        id: "p2_fixture_contract_self_test",
        command: "node validate-p2-fixture-contract.mjs --self-test",
        required_status: "PASS_P2_FIXTURE_CONTRACT_SELF_TEST",
      },
      {
        id: "generated_artifacts_freshness",
        command: "node validate-generated-artifacts-freshness.mjs",
        required_status: "PASS_GENERATED_ARTIFACTS_FRESHNESS",
      },
      {
        id: "p1_review_pack",
        command: "node write-p1-review-pack.mjs --check",
        required_status: "PASS_P1_REVIEW_PACK_APPROVED_FOR_P2_FIXTURE_ONLY",
      },
      {
        id: "p2_entry_gate_self_test",
        command: "node validate-p2-entry-gate.mjs --self-test",
        required_status: "PASS_P2_ENTRY_GATE_SELF_TEST",
      },
      {
        id: "p2_entry_gate",
        command: "node validate-p2-entry-gate.mjs",
        required_status: "PASS_P2_ENTRY_APPROVED_FOR_FIXTURE_ONLY",
      },
    ],
    required_hard_gate_outputs: [
      "approval_transition_checks",
      "p2_fixture_contract_output_checks",
      "scope_checks",
      "high_risk_boundaries",
      "validation_runs",
    ],
    required_fixture_contract_output_checks: [
      "p2_fixture_contract_validation_status_ready",
      "p2_fixture_contract_has_trace_checkpoint_checks",
      "p2_fixture_contract_has_scenario_trace_checks",
      "p2_fixture_contract_has_quality_gate_checks",
      "p2_fixture_contract_has_scenario_quality_checks",
      "p2_fixture_contract_preserves_non_write_flags",
      "p2_fixture_contract_preserves_high_risk_boundaries",
    ],
    required_particle_stage_followup_outputs: [
      "ProjectionDecisionDraft",
      "ReadbackRouteDraft",
      "VisualSemanticsDraft",
      "ForbiddenWriteDraft",
      "ParticleSyncCheckpoint",
      "ProjectionValidationReport",
    ],
    current_transition_state: {
      decision_state: reviewDecision.decision_state ?? decisionTemplate.decision_state ?? "unknown",
      review_validation_status: reviewDecision.validation_status ?? null,
      current_phase_state: currentPhase.current_phase_state ?? "unknown",
      completion_validation_status: completionAudit.validation_status ?? null,
      p1_ready_for_user_review: completionAudit.p1_ready_for_user_review === true,
      p1_approved_for_p2_fixture_only: completionAudit.p1_approved_for_p2_fixture_only === true,
      p2_entry_allowed: p2EntryAllowed,
      remaining_gate: completionAudit.remaining_gate ?? null,
      p2_entry_blockers: currentPhase.p2_entry_blockers ?? [],
    },
    first_allowed_p2_outputs: decisionTemplate.allowed_outputs_if_approved ?? [],
    forbidden_outputs: decisionTemplate.forbidden_outputs ?? [],
    non_authorized_even_after_p2_approval: [
      "runtime_write",
      "real_source_ingestion",
      "real_business_data",
      "relationship_state_write",
      "identity_merge",
      "external_action",
      "learning_weight_promotion",
      "particle_write_back",
    ],
    particle_sync_invariants: {
      projection_is_read_only: true,
      particle_write_back_allowed: false,
      particle_layer_is_not_fact_source: true,
      visual_weight_is_not_truth: true,
      p2_allows_mock_particle_readback_report_only: true,
    },
  };
}

function markdownEscape(value) {
  return String(value).replace(/\|/g, "\\|");
}

function buildMarkdown(pack) {
  const validationRows = pack.validation_runs
    .map(
      (item) =>
        `| ${markdownEscape(item.id)} | ${markdownEscape(item.validation_status)} | ${
          item.expected_pass ? "PASS" : "FAIL"
        } |`
    )
    .join("\n");

  const checklistRows = pack.review_checklist
    .map(
      (item) =>
        `| ${markdownEscape(item.id)} | ${markdownEscape(item.status)} | ${markdownEscape(
          item.evidence_ref
        )} |`
    )
    .join("\n");

  const forbidden = pack.forbidden_outputs.map((item) => `- \`${item}\``).join("\n");
  const allowed = pack.allowed_outputs_if_approved.map((item) => `- \`${item}\``).join("\n");
  const blockers = pack.p2_entry_blockers.map((item) => `- \`${item}\``).join("\n") || "- 无";
  const particleProtocol = pack.particle_sync_protocol;
  const transition = pack.approval_transition_requirements;
  const transitionState = transition.current_transition_state;
  const transitionRequiredRows = transition.required_validation_statuses
    .map(
      (item) =>
        `| ${markdownEscape(item.id)} | ${markdownEscape(item.command)} | ${markdownEscape(
          item.required_status
        )} |`
    )
    .join("\n");
  const transitionFields = transition.required_decision_fields
    .map((item) => `- \`${item}\``)
    .join("\n");
  const transitionHardGateOutputs = transition.required_hard_gate_outputs
    .map((item) => `- \`${item}\``)
    .join("\n");
  const transitionFixtureOutputChecks = transition.required_fixture_contract_output_checks
    .map((item) => `- \`${item}\``)
    .join("\n");
  const transitionParticleStageFollowup = transition.required_particle_stage_followup_outputs
    .map((item) => `- \`${item}\``)
    .join("\n");
  const transitionForbidden = transition.non_authorized_even_after_p2_approval
    .map((item) => `- \`${item}\``)
    .join("\n");
  const transitionAllowedStates = transition.allowed_decision_states_for_p2
    .map((item) => `- \`${item}\``)
    .join("\n");

  return `# P1 Review Pack

状态：\`${pack.validation_status}\`

生成时间：${pack.generated_at}

## 当前结论

\`\`\`text
current_phase = ${pack.current_phase}
current_phase_state = ${pack.current_phase_state}
p1_ready_for_user_review = ${pack.p1_ready_for_user_review}
p1_approved_for_p2_fixture_only = ${pack.p1_approved_for_p2_fixture_only}
p2_entry_allowed = ${pack.p2_entry_allowed}
remaining_gate = ${pack.remaining_gate ?? "none"}
next_allowed_action = ${pack.next_allowed_action}
\`\`\`

## P2 批准转移条件

\`\`\`text
purpose = ${transition.purpose}
current_decision_state = ${transitionState.decision_state}
review_validation_status = ${transitionState.review_validation_status}
current_phase_state = ${transitionState.current_phase_state}
completion_validation_status = ${transitionState.completion_validation_status}
p1_ready_for_user_review = ${transitionState.p1_ready_for_user_review}
p1_approved_for_p2_fixture_only = ${transitionState.p1_approved_for_p2_fixture_only}
p2_entry_allowed = ${transitionState.p2_entry_allowed}
remaining_gate = ${transitionState.remaining_gate ?? "none"}
\`\`\`

### 允许的 P2 决策状态
${transitionAllowedStates}

### 必填决策字段
${transitionFields}

### 必须通过的验证

| 项 | 命令 | 必须状态 |
| --- | --- | --- |
${transitionRequiredRows}

### P2 硬门必须输出
${transitionHardGateOutputs}

### P2 fixture 契约输出检查
${transitionFixtureOutputChecks}

### 3D 粒子阶段跟随输出
${transitionParticleStageFollowup}

### 即使批准 P2 仍禁止
${transitionForbidden}

## P2 阻断项

${blockers}

## 验证结果

| 项 | 状态 | 结果 |
| --- | --- | --- |
${validationRows}

## 用户审查清单

| 项 | 当前状态 | 证据引用 |
| --- | --- | --- |
${checklistRows}

## 若批准后仅允许

${allowed}

## 仍然禁止

${forbidden}

## 3D 粒子边界

\`\`\`text
三维粒子 OS / 星云层仍是只读投影。
ParticleProjectionEntry.write_back_allowed 必须为 false。
粒子、标签、摘要、权重、向量命中都不能替代 EvidenceAnchor 或 SourceArchive。
任何关系状态写入、身份合并、外部动作、学习权重转正都必须另行确认。
${particleProtocol.drift_gate} 必须保持 active。
每阶段必须检查 ${particleProtocol.checkpoint_object}。
固定同步链路：${particleProtocol.required_chain.join(" -> ")}。
\`\`\`
`;
}

function buildMarkdownV2(pack) {
  const validationRows = pack.validation_runs
    .map(
      (item) =>
        `| ${markdownEscape(item.id)} | ${markdownEscape(item.validation_status)} | ${
          item.expected_pass ? "PASS" : "FAIL"
        } |`
    )
    .join("\n");

  const checklistRows = pack.review_checklist
    .map(
      (item) =>
        `| ${markdownEscape(item.id)} | ${markdownEscape(item.status)} | ${markdownEscape(
          item.evidence_ref
        )} |`
    )
    .join("\n");

  const transition = pack.approval_transition_requirements;
  const transitionState = transition.current_transition_state;
  const transitionRequiredRows = transition.required_validation_statuses
    .map(
      (item) =>
        `| ${markdownEscape(item.id)} | ${markdownEscape(item.command)} | ${markdownEscape(
          item.required_status
        )} |`
    )
    .join("\n");

  const list = (items) => items.map((item) => `- \`${item}\``).join("\n") || "- none";

  return `# P1 审查包

状态：\`${pack.validation_status}\`

生成时间：${pack.generated_at}

## 当前结论

\`\`\`text
current_phase = ${pack.current_phase}
current_phase_state = ${pack.current_phase_state}
p1_ready_for_user_review = ${pack.p1_ready_for_user_review}
p1_approved_for_p2_fixture_only = ${pack.p1_approved_for_p2_fixture_only}
p2_entry_allowed = ${pack.p2_entry_allowed}
remaining_gate = ${pack.remaining_gate ?? "none"}
next_allowed_action = ${pack.next_allowed_action}
\`\`\`

## P2 批准转移条件

\`\`\`text
purpose = ${transition.purpose}
current_decision_state = ${transitionState.decision_state}
review_validation_status = ${transitionState.review_validation_status}
current_phase_state = ${transitionState.current_phase_state}
completion_validation_status = ${transitionState.completion_validation_status}
p1_ready_for_user_review = ${transitionState.p1_ready_for_user_review}
p1_approved_for_p2_fixture_only = ${transitionState.p1_approved_for_p2_fixture_only}
p2_entry_allowed = ${transitionState.p2_entry_allowed}
remaining_gate = ${transitionState.remaining_gate ?? "none"}
\`\`\`

### 允许的 P2 决策状态
${list(transition.allowed_decision_states_for_p2)}

### 必填决策字段
${list(transition.required_decision_fields)}

### 必须通过的验证

| 项 | 命令 | 必须状态 |
| --- | --- | --- |
${transitionRequiredRows}

### P2 硬门必须输出
${list(transition.required_hard_gate_outputs)}

### P2 fixture 契约输出检查
${list(transition.required_fixture_contract_output_checks)}

### 3D 粒子阶段跟随输出
${list(transition.required_particle_stage_followup_outputs)}

### 即使批准 P2 仍禁止
${list(transition.non_authorized_even_after_p2_approval)}

## P2 阻断项
${list(pack.p2_entry_blockers)}

## 验证结果

| 项 | 状态 | 结果 |
| --- | --- | --- |
${validationRows}

## 用户审查清单

| 项 | 当前状态 | 证据引用 |
| --- | --- | --- |
${checklistRows}

## 若批准后仅允许
${list(pack.allowed_outputs_if_approved)}

## 仍然禁止
${list(pack.forbidden_outputs)}

## 3D 粒子边界

\`\`\`text
三维粒子 OS / 星云层仍是只读投影。
ParticleProjectionEntry.write_back_allowed 必须为 false。
粒子、标签、摘要、权重、向量命中都不能替代 EvidenceAnchor 或 SourceArchive。
任何关系状态写入、身份合并、外部动作、学习权重转正都必须另行确认。
${pack.particle_sync_protocol.drift_gate} 必须保持 active。
每阶段必须检查 ${pack.particle_sync_protocol.checkpoint_object}。
固定同步链路：${pack.particle_sync_protocol.required_chain.join(" -> ")}。
\`\`\`
`;
}

const decisionTemplate = readJson(decisionTemplatePath);
const validationRuns = validators.map(runValidator);
const byId = Object.fromEntries(validationRuns.map((item) => [item.id, item]));
const allPass = validationRuns.every((item) => item.expected_pass);

const currentPhase = byId.current_phase_state.data ?? {};
const completionAudit = byId.p1_completion_audit.data ?? {};
const reviewDecision = byId.p1_review_decision.data ?? {};
const p2EntryAllowed = currentPhase.p2_entry_allowed === true;
const reviewStatus = reviewDecision.validation_status ?? null;
const completionStatus = completionAudit.validation_status ?? null;

const pack = {
  schema_version: "p1_review_pack.v1",
  generated_at: new Date().toISOString(),
  source: "scripts/write-p1-review-pack.mjs",
  write_mode: writeMode ? "write" : "check",
  current_phase: currentPhase.current_phase ?? "unknown",
  current_phase_state: currentPhase.current_phase_state ?? "unknown",
  p1_ready_for_user_review: completionAudit.p1_ready_for_user_review === true,
  p1_approved_for_p2_fixture_only: completionAudit.p1_approved_for_p2_fixture_only === true,
  p2_entry_allowed: p2EntryAllowed,
  remaining_gate: completionAudit.remaining_gate ?? null,
  next_allowed_action: currentPhase.next_allowed_action ?? "unknown",
  p2_entry_blockers: currentPhase.p2_entry_blockers ?? [],
  reviewed_artifacts: decisionTemplate.reviewed_artifacts ?? [],
  required_validation: decisionTemplate.required_validation ?? [],
  review_checklist: decisionTemplate.checklist ?? [],
  allowed_outputs_if_approved: decisionTemplate.allowed_outputs_if_approved ?? [],
  forbidden_outputs: decisionTemplate.forbidden_outputs ?? [],
  boundary_assertions: decisionTemplate.boundary_assertions ?? {},
  particle_sync_protocol: {
    drift_gate: "projection_sync_drift_gate_active",
    checkpoint_object: "ParticleSyncCheckpoint",
    required_chain: [
      "GraphObjectChange",
      "ProjectionDecision",
      "ParticleProjectionDelta",
      "ProjectionValidationReport",
      "ParticleSyncCheckpoint",
    ],
    checkpoint_required_fields: [
      "stage_id",
      "graph_changes",
      "projection_decisions",
      "particle_projection_delta",
      "object_ref_coverage",
      "evidence_anchor_coverage",
      "source_archive_readback_coverage",
      "blocked_write_checks",
      "drift_risk",
      "next_stage_particle_entry",
    ],
    forbidden_projection_results: [
      "particle_fact_write",
      "particle_relationship_state_write",
      "particle_identity_merge",
      "particle_external_action",
      "particle_learning_weight_promotion",
      "visual_weight_as_truth",
    ],
  },
  approval_transition_requirements: buildApprovalTransitionRequirements({
    decisionTemplate,
    currentPhase,
    completionAudit,
    reviewDecision,
    p2EntryAllowed,
  }),
  validation_runs: validationRuns.map((item) => ({
    id: item.id,
    command: item.command,
    exit_code: item.exit_code,
    stdout_parse_ok: item.stdout_parse_ok,
    validation_status: item.validation_status,
    expected_pass: item.expected_pass,
    stderr: item.stderr,
  })),
  validation_status: statusFor({
    allPass,
    p2EntryAllowed,
    reviewStatus,
    completionStatus,
  }),
};

if (writeMode && pack.validation_status.startsWith("PASS")) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonOutputPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownOutputPath, buildMarkdownV2(pack), "utf8");
  pack.output_files = [jsonOutputPath, markdownOutputPath];
}

console.log(JSON.stringify(pack, null, 2));

if (!pack.validation_status.startsWith("PASS")) {
  process.exitCode = 1;
}
