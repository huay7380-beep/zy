import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const planDir = path.resolve(scriptDir, "..");
const decisionTemplatePath = path.join(planDir, "review-gates", "P1-review-decision.template.json");
const generatedReviewPackPath = path.join(
  planDir,
  "review-gates",
  "generated",
  "P1-review-pack.generated.json"
);

const unauthorizedP2Paths = [
  "fixtures",
  "p2-fixtures",
  "P2-fixtures",
  "runtime",
  "runtime-fixtures",
  "real-source",
  "real-data",
  "p2-fixture-results",
  "reverse-validation-results",
  "particle-runtime",
].map((item) => path.join(planDir, item));

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

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function runReviewDecision() {
  const child = spawnSync(process.execPath, [path.join(scriptDir, "validate-p1-review-decision.mjs")], {
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

  return {
    command: "node validate-p1-review-decision.mjs",
    exit_code: child.status,
    stdout_parse_ok: parsed !== null,
    parse_error: parseError,
    validation_status: parsed?.validation_status ?? null,
    data: parsed,
    stderr: child.stderr?.trim() || null,
  };
}

function containsAll(actual, required) {
  const actualSet = new Set(actual ?? []);
  return required.every((item) => actualSet.has(item));
}

const decisionTemplate = readJsonIfExists(decisionTemplatePath);
const generatedReviewPack = readJsonIfExists(generatedReviewPackPath);
const reviewDecisionRun = runReviewDecision();
const reviewDecision = reviewDecisionRun.data ?? {};
const reviewDecisionStatus = reviewDecisionRun.validation_status;
const p2AllowedByReviewDecision =
  reviewDecisionStatus === "PASS_APPROVED_FOR_P2_FIXTURE_ONLY" &&
  reviewDecision.p2_entry_allowed === true;

const unauthorizedExistingPaths = unauthorizedP2Paths.filter((item) => fs.existsSync(item));
const allowedOutputs = decisionTemplate?.allowed_outputs_if_approved ?? [];
const forbiddenOutputs = decisionTemplate?.forbidden_outputs ?? [];
const boundaryAssertions = decisionTemplate?.boundary_assertions ?? {};
const checklistIds = (decisionTemplate?.checklist ?? []).map((item) => item.id);

const allowedOutputsFixtureOnly = containsAll(allowedOutputs, requiredAllowedOutputs);
const forbiddenOutputsPreserved = containsAll(forbiddenOutputs, requiredForbiddenOutputs);
const highRiskBoundariesBlocked =
  boundaryAssertions.runtime_entry === "still_blocked" &&
  boundaryAssertions.real_source_entry === "still_blocked" &&
  boundaryAssertions.relationship_state_write === "blocked" &&
  boundaryAssertions.identity_merge === "blocked" &&
  boundaryAssertions.external_action === "blocked" &&
  boundaryAssertions.learning_weight_promotion === "blocked" &&
  boundaryAssertions.particle_write_back === "blocked";

const reviewPackP2StateOk =
  generatedReviewPack === null || p2AllowedByReviewDecision || generatedReviewPack.p2_entry_allowed !== true;

const reviewPackPreservesBoundary =
  generatedReviewPack === null ||
  (reviewPackP2StateOk &&
    Array.isArray(generatedReviewPack.forbidden_outputs) &&
    containsAll(generatedReviewPack.forbidden_outputs, requiredForbiddenOutputs) &&
    generatedReviewPack.particle_sync_protocol?.forbidden_projection_results?.includes(
      "particle_fact_write"
    ) &&
    generatedReviewPack.particle_sync_protocol?.forbidden_projection_results?.includes(
      "particle_relationship_state_write"
    ));

const preparationChecks = {
  review_decision_validator_passed: reviewDecisionRun.exit_code === 0 && reviewDecisionRun.stdout_parse_ok,
  p2_fixture_artifacts_absent: unauthorizedExistingPaths.length === 0,
  allowed_outputs_fixture_only: allowedOutputsFixtureOnly,
  forbidden_outputs_preserved: forbiddenOutputsPreserved,
  high_risk_boundaries_blocked: highRiskBoundariesBlocked,
  review_pack_preserves_boundary: reviewPackPreservesBoundary,
  checklist_contains_p2_scope_gate: checklistIds.includes("p2_scope_remains_fixture_only"),
};

let validationStatus = "FAIL_P2_PREPARATION_BOUNDARY";

if (Object.values(preparationChecks).every(Boolean)) {
  if (p2AllowedByReviewDecision) {
    validationStatus = "PASS_P2_PREPARATION_BOUNDARY_APPROVED_FOR_FIXTURE_ONLY";
  } else if (reviewDecisionStatus === "PASS_PENDING_USER_DECISION") {
    validationStatus = "PASS_P2_PREPARATION_BOUNDARY_BLOCKED_PENDING_USER_DECISION";
  } else if (reviewDecisionStatus === "PASS_NEEDS_SCHEMA_REVISION_BEFORE_P2") {
    validationStatus = "PASS_P2_PREPARATION_BOUNDARY_NEEDS_SCHEMA_REVISION";
  } else if (reviewDecisionStatus === "PASS_REJECTED_FOR_P2") {
    validationStatus = "PASS_P2_PREPARATION_BOUNDARY_REJECTED";
  }
}

const result = {
  validator: "validate-p2-preparation-boundary.mjs",
  p2_preparation_only: true,
  p2_fixture_artifacts_present: unauthorizedExistingPaths.length > 0,
  unauthorized_paths: unauthorizedExistingPaths,
  review_decision_status: reviewDecisionStatus,
  p2_entry_allowed_by_review_decision: p2AllowedByReviewDecision,
  allowed_outputs_fixture_only: allowedOutputsFixtureOnly,
  forbidden_outputs_preserved: forbiddenOutputsPreserved,
  high_risk_boundaries_blocked: highRiskBoundariesBlocked,
  generated_review_pack_checked: generatedReviewPack !== null,
  preparation_checks: preparationChecks,
  review_decision_run: {
    command: reviewDecisionRun.command,
    exit_code: reviewDecisionRun.exit_code,
    stdout_parse_ok: reviewDecisionRun.stdout_parse_ok,
    validation_status: reviewDecisionRun.validation_status,
    stderr: reviewDecisionRun.stderr,
  },
  next_allowed_action: p2AllowedByReviewDecision
    ? "enter_P2_fixture_and_reverse_validation_only_after_p2_entry_gate"
    : "wait_for_user_review_decision_or_revise_P1",
  high_risk_boundaries: {
    runtime_entry: "still_blocked",
    real_source_entry: "still_blocked",
    relationship_state_write: "blocked",
    identity_merge: "blocked",
    external_action: "blocked",
    learning_weight_promotion: "blocked",
    particle_write_back: "blocked",
  },
  validation_status: validationStatus,
};

console.log(JSON.stringify(result, null, 2));

if (!validationStatus.startsWith("PASS")) {
  process.exitCode = 1;
}
