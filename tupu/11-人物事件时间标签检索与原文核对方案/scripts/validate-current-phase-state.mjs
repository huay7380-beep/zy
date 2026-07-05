import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const validators = [
  {
    id: "p1_schema",
    script: "validate-p1-schema.mjs",
    required_status: "PASS",
  },
  {
    id: "p1_json_schema_contract",
    script: "validate-p1-json-schema-contract.mjs",
    required_status: "PASS_P1_JSON_SCHEMA_CONTRACT",
  },
  {
    id: "p1_evidence_readback_coverage",
    script: "validate-p1-evidence-readback-coverage.mjs",
    required_status: "PASS_EVIDENCE_READBACK_COVERAGE",
  },
  {
    id: "full_roadmap_and_particle_sync",
    script: "validate-full-roadmap-and-particle-sync.mjs",
    required_status: "PASS",
  },
  {
    id: "p0_p12_stage_control",
    script: "validate-p0-p12-stage-control.mjs",
    required_status: "PASS_P0_P12_STAGE_CONTROL",
  },
  {
    id: "p0_p12_stage_control_self_test",
    script: "validate-p0-p12-stage-control.mjs",
    args: ["--self-test"],
    required_status: "PASS_P0_P12_STAGE_CONTROL_SELF_TEST",
  },
  {
    id: "p1_review_decision",
    script: "validate-p1-review-decision.mjs",
    allowed_statuses: [
      "PASS_PENDING_USER_DECISION",
      "PASS_APPROVED_FOR_P2_FIXTURE_ONLY",
      "PASS_NEEDS_SCHEMA_REVISION_BEFORE_P2",
      "PASS_REJECTED_FOR_P2",
    ],
  },
  {
    id: "p2_preparation_boundary",
    script: "validate-p2-preparation-boundary.mjs",
    allowed_statuses: [
      "PASS_P2_PREPARATION_BOUNDARY_BLOCKED_PENDING_USER_DECISION",
      "PASS_P2_PREPARATION_BOUNDARY_APPROVED_FOR_FIXTURE_ONLY",
      "PASS_P2_PREPARATION_BOUNDARY_NEEDS_SCHEMA_REVISION",
      "PASS_P2_PREPARATION_BOUNDARY_REJECTED",
    ],
  },
  {
    id: "p2_fixture_contract",
    script: "validate-p2-fixture-contract.mjs",
    required_status: "PASS_P2_FIXTURE_CONTRACT_READY",
  },
  {
    id: "p2_fixture_contract_self_test",
    script: "validate-p2-fixture-contract.mjs",
    args: ["--self-test"],
    required_status: "PASS_P2_FIXTURE_CONTRACT_SELF_TEST",
  },
];

function runValidator(validator) {
  const child = spawnSync(process.execPath, [path.join(scriptDir, validator.script), ...(validator.args ?? [])], {
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

  const validationStatus = parsed?.validation_status ?? null;
  const expectedPass = validator.required_status
    ? validationStatus === validator.required_status
    : validator.allowed_statuses.includes(validationStatus);

  return {
    id: validator.id,
    script: [validator.script, ...(validator.args ?? [])].join(" "),
    exit_code: child.status,
    stdout_parse_ok: parsed !== null,
    parse_error: parseError,
    validation_status: validationStatus,
    expected_pass: expectedPass,
    stderr: child.stderr?.trim() || null,
    data: parsed,
  };
}

const runs = validators.map(runValidator);
const byId = Object.fromEntries(runs.map((run) => [run.id, run]));

const schemaPass = byId.p1_schema.expected_pass;
const schemaContractPass = byId.p1_json_schema_contract.expected_pass;
const evidenceReadbackPass = byId.p1_evidence_readback_coverage.expected_pass;
const roadmapPass = byId.full_roadmap_and_particle_sync.expected_pass;
const stageControlPass = byId.p0_p12_stage_control.expected_pass;
const stageControlSelfTestPass = byId.p0_p12_stage_control_self_test.expected_pass;
const reviewPass = byId.p1_review_decision.expected_pass;
const preparationBoundaryPass = byId.p2_preparation_boundary.expected_pass;
const p2FixtureContractPass = byId.p2_fixture_contract.expected_pass;
const p2FixtureContractSelfTestPass = byId.p2_fixture_contract_self_test.expected_pass;
const reviewData = byId.p1_review_decision.data;
const reviewStatus = reviewData?.validation_status ?? null;
const p2EntryAllowed = reviewData?.p2_entry_allowed === true;

const hardFailures = runs
  .filter((run) => !run.expected_pass)
  .map((run) => `${run.id}:${run.validation_status ?? "NO_STATUS"}`);

const p2EntryBlockers = [];

if (!schemaPass) {
  p2EntryBlockers.push("p1_schema_validation_not_passed");
}
if (!schemaContractPass) {
  p2EntryBlockers.push("p1_json_schema_contract_validation_not_passed");
}
if (!evidenceReadbackPass) {
  p2EntryBlockers.push("p1_evidence_readback_coverage_not_passed");
}
if (!roadmapPass) {
  p2EntryBlockers.push("full_roadmap_or_particle_sync_validation_not_passed");
}
if (!stageControlPass) {
  p2EntryBlockers.push("p0_p12_stage_control_validation_not_passed");
}
if (!stageControlSelfTestPass) {
  p2EntryBlockers.push("p0_p12_stage_control_self_test_not_passed");
}
if (!reviewPass) {
  p2EntryBlockers.push("p1_review_decision_validation_not_passed");
}
if (!preparationBoundaryPass) {
  p2EntryBlockers.push("p2_preparation_boundary_not_passed");
}
if (!p2FixtureContractPass) {
  p2EntryBlockers.push("p2_fixture_contract_not_ready");
}
if (!p2FixtureContractSelfTestPass) {
  p2EntryBlockers.push("p2_fixture_contract_self_test_not_passed");
}
if (reviewPass && !p2EntryAllowed) {
  p2EntryBlockers.push(...(reviewData?.p2_entry_blockers ?? []));
}

const currentPhase =
  schemaPass &&
  schemaContractPass &&
  evidenceReadbackPass &&
  roadmapPass &&
  stageControlPass &&
  stageControlSelfTestPass
    ? "P1_JSON_Schema_Draft"
    : "P1_validation_needs_revision";

let currentPhaseState = "p1_validation_failed";

if (schemaPass && schemaContractPass && evidenceReadbackPass && roadmapPass && stageControlPass && stageControlSelfTestPass && reviewPass && preparationBoundaryPass && p2FixtureContractPass && p2FixtureContractSelfTestPass && p2EntryAllowed) {
  currentPhaseState = "p1_approved_for_p2_fixture_only";
} else if (
  schemaPass &&
  schemaContractPass &&
  evidenceReadbackPass &&
  roadmapPass &&
  stageControlPass &&
  stageControlSelfTestPass &&
  preparationBoundaryPass &&
  p2FixtureContractPass &&
  p2FixtureContractSelfTestPass &&
  reviewStatus === "PASS_NEEDS_SCHEMA_REVISION_BEFORE_P2"
) {
  currentPhaseState = "p1_review_requires_schema_revision_before_p2";
} else if (
  schemaPass &&
  schemaContractPass &&
  evidenceReadbackPass &&
  roadmapPass &&
  stageControlPass &&
  stageControlSelfTestPass &&
  preparationBoundaryPass &&
  p2FixtureContractPass &&
  p2FixtureContractSelfTestPass &&
  reviewStatus === "PASS_REJECTED_FOR_P2"
) {
  currentPhaseState = "p1_rejected_for_p2";
} else if (schemaPass && schemaContractPass && evidenceReadbackPass && roadmapPass && stageControlPass && stageControlSelfTestPass && reviewPass && preparationBoundaryPass && p2FixtureContractPass && p2FixtureContractSelfTestPass) {
  currentPhaseState = "p1_validated_pending_user_review";
}

const result = {
  validator: "validate-current-phase-state.mjs",
  current_phase: currentPhase,
  current_phase_state: currentPhaseState,
  validation_runs: runs.map((run) => ({
    id: run.id,
    script: run.script,
    exit_code: run.exit_code,
    stdout_parse_ok: run.stdout_parse_ok,
    validation_status: run.validation_status,
    expected_pass: run.expected_pass,
    stderr: run.stderr,
  })),
  p2_entry_allowed:
    p2EntryAllowed && preparationBoundaryPass && p2FixtureContractPass && p2FixtureContractSelfTestPass && hardFailures.length === 0,
  p2_entry_blockers: [...new Set(p2EntryBlockers)],
  blocked_boundaries: {
    runtime_entry: reviewData?.boundary_checks?.runtime_entry === true ? "still_blocked" : "unknown_or_failed",
    real_source_entry: reviewData?.boundary_checks?.real_source_entry === true ? "still_blocked" : "unknown_or_failed",
    relationship_state_write: reviewData?.boundary_checks?.relationship_state_write === true ? "blocked" : "unknown_or_failed",
    identity_merge: reviewData?.boundary_checks?.identity_merge === true ? "blocked" : "unknown_or_failed",
    external_action: reviewData?.boundary_checks?.external_action === true ? "blocked" : "unknown_or_failed",
    learning_weight_promotion: reviewData?.boundary_checks?.learning_weight_promotion === true ? "blocked" : "unknown_or_failed",
    particle_write_back: reviewData?.boundary_checks?.particle_write_back === true ? "blocked" : "unknown_or_failed",
  },
  next_allowed_action:
    p2EntryAllowed && preparationBoundaryPass && p2FixtureContractPass && p2FixtureContractSelfTestPass && hardFailures.length === 0
      ? "enter_P2_fixture_and_reverse_validation_only"
      : reviewStatus === "PASS_NEEDS_SCHEMA_REVISION_BEFORE_P2"
        ? "revise_P1_schema_before_P2"
        : reviewStatus === "PASS_REJECTED_FOR_P2"
          ? "stop_P2_and_wait_for_user_direction"
          : "wait_for_user_review_decision_or_revise_P1",
  hard_failures: hardFailures,
  validation_status:
    hardFailures.length === 0
      ? "PASS_CURRENT_PHASE_STATE"
      : "FAIL_CURRENT_PHASE_STATE",
};

console.log(JSON.stringify(result, null, 2));

if (hardFailures.length > 0) {
  process.exitCode = 1;
}
