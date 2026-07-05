import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const planDir = path.resolve(scriptDir, "..");
const defaultDecisionPath = path.join(planDir, "review-gates", "P1-review-decision.template.json");
const selfTestMode = process.argv.includes("--self-test");

const decisionArg = process.argv.find((arg) => arg.startsWith("--decision="));
const decisionPath = decisionArg
  ? path.resolve(process.cwd(), decisionArg.slice("--decision=".length))
  : defaultDecisionPath;

const allowedDecisionStates = new Set([
  "pending_user_decision",
  "approved_for_p2_fixture_only",
  "approved_with_minor_notes_for_p2_fixture_only",
  "needs_schema_revision_before_p2",
  "rejected_for_p2",
]);

const p2AllowedDecisionStates = new Set([
  "approved_for_p2_fixture_only",
  "approved_with_minor_notes_for_p2_fixture_only",
]);

const allowedChecklistStatuses = new Set([
  "pending",
  "accepted",
  "accepted_with_minor_notes",
  "needs_revision",
  "rejected",
]);

const requiredBoundaryAssertions = {
  runtime_entry: "still_blocked",
  real_source_entry: "still_blocked",
  relationship_state_write: "blocked",
  identity_merge: "blocked",
  external_action: "blocked",
  learning_weight_promotion: "blocked",
  particle_write_back: "blocked",
};

const requiredAllowedOutputs = [
  "sales_customer_progress_simulated_fixture",
  "romantic_relationship_maintenance_simulated_fixture",
  "public_case_style_complex_multisource_simulated_fixture",
  "tag_person_event_time_evidence_reverse_validation_report",
  "mock_particle_projection_readback_validation_report",
  "p2_gap_backwrite_record",
];

const requiredForbiddenOutputs = [
  "real_business_data",
  "runtime_write",
  "real_source_ingestion",
  "relationship_state_write",
  "identity_merge",
  "external_action",
  "learning_weight_promotion",
  "particle_write_back",
];

const requiredReviewedArtifacts = [
  "18-P1-JSONSchemaDraft.v1-图谱核心对象草案.md",
  "schema-drafts/P1-GraphCore.schema.json",
  "scripts/validate-p1-schema.mjs",
  "scripts/validate-p1-json-schema-contract.mjs",
  "scripts/validate-p1-evidence-readback-coverage.mjs",
  "scripts/validate-full-roadmap-and-particle-sync.mjs",
  "scripts/validate-p0-p12-stage-control.mjs",
  "scripts/validate-current-phase-state.mjs",
  "scripts/validate-p1-completion-audit.mjs",
  "scripts/validate-p2-preparation-boundary.mjs",
  "scripts/validate-p2-fixture-contract.mjs",
  "scripts/validate-generated-artifacts-freshness.mjs",
  "scripts/validate-p2-entry-gate.mjs",
];

const requiredValidationCommandList = [
  "node .\\validate-p1-schema.mjs",
  "node .\\validate-p1-json-schema-contract.mjs",
  "node .\\validate-p1-evidence-readback-coverage.mjs",
  "node .\\validate-full-roadmap-and-particle-sync.mjs",
  "node .\\validate-p0-p12-stage-control.mjs",
  "node .\\validate-p0-p12-stage-control.mjs --self-test",
  "node .\\validate-p1-review-decision.mjs",
  "node .\\validate-p1-review-decision.mjs --self-test",
  "node .\\validate-current-phase-state.mjs",
  "node .\\validate-p1-completion-audit.mjs",
  "node .\\validate-p2-preparation-boundary.mjs",
  "node .\\validate-p2-fixture-contract.mjs",
  "node .\\validate-p2-fixture-contract.mjs --self-test",
  "node .\\validate-generated-artifacts-freshness.mjs",
  "node .\\validate-p2-entry-gate.mjs --self-test",
  "node .\\validate-p2-entry-gate.mjs",
];

const requiredChecklistIds = [
  "source_archive_and_evidence_anchor_are_fact_source",
  "semantic_event_granularity_is_acceptable",
  "indexes_support_person_event_time_source_tag_feature_evidence",
  "narrative_objects_do_not_write_relationship_state",
  "context_and_causal_layers_do_not_replace_facts",
  "context_snapshot_is_only_model_context_package",
  "weight_and_confirmation_gate_do_not_auto_promote",
  "particle_projection_is_read_only",
  "boundary_flags_remain_false_for_high_risk_actions",
  "p1_schema_validator_passed",
  "p1_json_schema_contract_validator_passed",
  "p1_evidence_readback_coverage_passed",
  "full_roadmap_and_particle_sync_validator_passed",
  "particle_sync_drift_gate_and_checkpoint_checked",
  "p0_p12_stage_control_validator_passed",
  "p0_p12_stage_control_self_test_passed",
  "p1_review_gate_state_machine_passed",
  "current_phase_preflight_passed",
  "p1_completion_audit_passed",
  "p2_preparation_boundary_passed",
  "p2_fixture_contract_self_test_passed",
  "p2_fixture_contract_output_checks_reviewed",
  "particle_stage_followup_required_reviewed",
  "generated_artifacts_freshness_passed",
  "p2_entry_gate_passed_or_blocks_pending_user_decision",
  "p2_scope_remains_fixture_only",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function missingFrom(required, actual) {
  const actualSet = new Set(actual);
  return required.filter((item) => !actualSet.has(item));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function runSelfTest() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "p1-review-gate-"));
  const currentScript = fileURLToPath(import.meta.url);
  const base = readJson(defaultDecisionPath);

  function writeDecision(name, mutate) {
    const decision = cloneJson(base);
    mutate(decision);
    const filePath = path.join(tempDir, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(decision, null, 2), "utf8");
    return filePath;
  }

  function setChecklist(decision, status) {
    decision.checklist = decision.checklist.map((item) => ({
      ...item,
      status,
    }));
  }

  const cases = [
    {
      id: "pending_blocks_p2",
      filePath: writeDecision("pending", () => {}),
      expected_status: "PASS_PENDING_USER_DECISION",
      expected_p2_entry_allowed: false,
    },
    {
      id: "approved_allows_p2_fixture_only",
      filePath: writeDecision("approved", (decision) => {
        decision.decision_state = "approved_for_p2_fixture_only";
        decision.reviewer = "self_test";
        decision.decided_at = "2026-07-05T00:00:00+08:00";
        setChecklist(decision, "accepted");
      }),
      expected_status: "PASS_APPROVED_FOR_P2_FIXTURE_ONLY",
      expected_p2_entry_allowed: true,
    },
    {
      id: "needs_revision_blocks_p2_without_failure",
      filePath: writeDecision("needs-revision", (decision) => {
        decision.decision_state = "needs_schema_revision_before_p2";
        setChecklist(decision, "needs_revision");
      }),
      expected_status: "PASS_NEEDS_SCHEMA_REVISION_BEFORE_P2",
      expected_p2_entry_allowed: false,
    },
    {
      id: "rejected_blocks_p2_without_failure",
      filePath: writeDecision("rejected", (decision) => {
        decision.decision_state = "rejected_for_p2";
        setChecklist(decision, "rejected");
      }),
      expected_status: "PASS_REJECTED_FOR_P2",
      expected_p2_entry_allowed: false,
    },
  ];

  const results = cases.map((testCase) => {
    const child = spawnSync(process.execPath, [currentScript, `--decision=${testCase.filePath}`], {
      cwd: scriptDir,
      encoding: "utf8",
    });

    let parsed = null;
    let parseError = null;

    try {
      parsed = JSON.parse(child.stdout);
    } catch (error) {
      parseError = error.message;
    }

    const statusMatches = parsed?.validation_status === testCase.expected_status;
    const p2Matches = parsed?.p2_entry_allowed === testCase.expected_p2_entry_allowed;

    return {
      id: testCase.id,
      exit_code: child.status,
      stdout_parse_ok: parsed !== null,
      parse_error: parseError,
      expected_status: testCase.expected_status,
      actual_status: parsed?.validation_status ?? null,
      expected_p2_entry_allowed: testCase.expected_p2_entry_allowed,
      actual_p2_entry_allowed: parsed?.p2_entry_allowed ?? null,
      status: child.status === 0 && statusMatches && p2Matches ? "PASS" : "FAIL",
    };
  });

  fs.rmSync(tempDir, { recursive: true, force: true });

  const passed = results.every((item) => item.status === "PASS");
  console.log(
    JSON.stringify(
      {
        validator: "validate-p1-review-decision.mjs --self-test",
        cases: results,
        validation_status: passed ? "PASS_REVIEW_GATE_STATE_MACHINE" : "FAIL_REVIEW_GATE_STATE_MACHINE",
      },
      null,
      2
    )
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

if (selfTestMode) {
  runSelfTest();
  process.exit();
}

const result = {
  validator: "validate-p1-review-decision.mjs",
  decision_path: decisionPath,
  decision_file_exists: fs.existsSync(decisionPath),
  json_parse: false,
  shape_checks: {},
  artifact_checks: {},
  boundary_checks: {},
  p2_entry_allowed: false,
  p2_entry_blockers: [],
  validation_status: "PENDING",
};

let decision = null;

try {
  if (result.decision_file_exists) {
    decision = readJson(decisionPath);
    result.json_parse = true;
  }
} catch (error) {
  result.parse_error = error.message;
}

if (decision) {
  const reviewedArtifactPaths = Array.isArray(decision.reviewed_artifacts)
    ? decision.reviewed_artifacts.map((item) => item.path)
    : [];
  const actualValidationCommands = Array.isArray(decision.required_validation)
    ? decision.required_validation.map((item) => item.command)
    : [];
  const allowedOutputs = Array.isArray(decision.allowed_outputs_if_approved)
    ? decision.allowed_outputs_if_approved
    : [];
  const forbiddenOutputs = Array.isArray(decision.forbidden_outputs)
    ? decision.forbidden_outputs
    : [];
  const checklist = Array.isArray(decision.checklist) ? decision.checklist : [];
  const checklistIds = checklist.map((item) => item.id);
  const checklistStatuses = checklist.map((item) => item.status);

  result.shape_checks = {
    schema_version: decision.schema_version === "p1_review_decision.v1",
    review_gate_id: decision.review_gate_id === "p1_schema_to_p2_fixture_gate",
    target_phase: decision.target_phase === "P1_JSON_Schema_Draft",
    requested_next_phase: decision.requested_next_phase === "P2_fixture_and_reverse_validation",
    decision_state_allowed: allowedDecisionStates.has(decision.decision_state),
    reviewed_artifacts_complete:
      missingFrom(requiredReviewedArtifacts, reviewedArtifactPaths).length === 0,
    required_validation_complete:
      missingFrom(requiredValidationCommandList, actualValidationCommands).length === 0,
    checklist_complete: missingFrom(requiredChecklistIds, checklistIds).length === 0,
    checklist_statuses_allowed: checklistStatuses.every((status) =>
      allowedChecklistStatuses.has(status)
    ),
    allowed_outputs_complete: missingFrom(requiredAllowedOutputs, allowedOutputs).length === 0,
    forbidden_outputs_complete:
      missingFrom(requiredForbiddenOutputs, forbiddenOutputs).length === 0,
  };

  result.artifact_checks = Object.fromEntries(
    requiredReviewedArtifacts.map((artifactPath) => [
      artifactPath,
      fs.existsSync(path.join(planDir, artifactPath)),
    ])
  );

  result.boundary_checks = Object.fromEntries(
    Object.entries(requiredBoundaryAssertions).map(([key, expected]) => [
      key,
      decision.boundary_assertions?.[key] === expected,
    ])
  );

  const shapePass = Object.values(result.shape_checks).every(Boolean);
  const artifactsPass = Object.values(result.artifact_checks).every(Boolean);
  const boundariesPass = Object.values(result.boundary_checks).every(Boolean);
  const basePass = shapePass && artifactsPass && boundariesPass;

  const isApproval = p2AllowedDecisionStates.has(decision.decision_state);
  const allChecklistAccepted = checklist.every((item) =>
    ["accepted", "accepted_with_minor_notes"].includes(item.status)
  );
  const hasReviewer = typeof decision.reviewer === "string" && decision.reviewer.trim() !== "";
  const hasDecisionTime =
    typeof decision.decided_at === "string" && /^\d{4}-\d{2}-\d{2}T/.test(decision.decided_at);

  if (!basePass) {
    result.p2_entry_blockers.push("review_decision_shape_or_boundary_invalid");
  }
  if (!isApproval) {
    if (decision.decision_state === "needs_schema_revision_before_p2") {
      result.p2_entry_blockers.push("schema_revision_required_before_p2");
    } else if (decision.decision_state === "rejected_for_p2") {
      result.p2_entry_blockers.push("p1_rejected_for_p2");
    } else {
      result.p2_entry_blockers.push("decision_state_not_approved_for_p2_fixture_only");
    }
  }
  if (isApproval && !allChecklistAccepted) {
    result.p2_entry_blockers.push("approval_requires_all_checklist_items_accepted");
  }
  if (isApproval && !hasReviewer) {
    result.p2_entry_blockers.push("approval_requires_reviewer");
  }
  if (isApproval && !hasDecisionTime) {
    result.p2_entry_blockers.push("approval_requires_decided_at_iso_time");
  }

  result.p2_entry_allowed =
    basePass && isApproval && allChecklistAccepted && hasReviewer && hasDecisionTime;

  if (basePass && decision.decision_state === "pending_user_decision") {
    result.validation_status = "PASS_PENDING_USER_DECISION";
  } else if (basePass && decision.decision_state === "needs_schema_revision_before_p2") {
    result.validation_status = "PASS_NEEDS_SCHEMA_REVISION_BEFORE_P2";
  } else if (basePass && decision.decision_state === "rejected_for_p2") {
    result.validation_status = "PASS_REJECTED_FOR_P2";
  } else if (result.p2_entry_allowed) {
    result.validation_status = "PASS_APPROVED_FOR_P2_FIXTURE_ONLY";
  } else {
    result.validation_status = "FAIL";
  }
}

console.log(JSON.stringify(result, null, 2));

if (!result.validation_status.startsWith("PASS")) {
  process.exitCode = 1;
}
