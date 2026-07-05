import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const runs = [
  {
    id: "p1_schema",
    args: ["validate-p1-schema.mjs"],
    expected_statuses: ["PASS"],
  },
  {
    id: "p1_json_schema_contract",
    args: ["validate-p1-json-schema-contract.mjs"],
    expected_statuses: ["PASS_P1_JSON_SCHEMA_CONTRACT"],
  },
  {
    id: "p1_evidence_readback_coverage",
    args: ["validate-p1-evidence-readback-coverage.mjs"],
    expected_statuses: ["PASS_EVIDENCE_READBACK_COVERAGE"],
  },
  {
    id: "full_roadmap_and_particle_sync",
    args: ["validate-full-roadmap-and-particle-sync.mjs"],
    expected_statuses: ["PASS"],
  },
  {
    id: "p0_p12_stage_control",
    args: ["validate-p0-p12-stage-control.mjs"],
    expected_statuses: ["PASS_P0_P12_STAGE_CONTROL"],
  },
  {
    id: "p0_p12_stage_control_self_test",
    args: ["validate-p0-p12-stage-control.mjs", "--self-test"],
    expected_statuses: ["PASS_P0_P12_STAGE_CONTROL_SELF_TEST"],
  },
  {
    id: "p1_review_decision",
    args: ["validate-p1-review-decision.mjs"],
    expected_statuses: [
      "PASS_PENDING_USER_DECISION",
      "PASS_APPROVED_FOR_P2_FIXTURE_ONLY",
      "PASS_NEEDS_SCHEMA_REVISION_BEFORE_P2",
      "PASS_REJECTED_FOR_P2",
    ],
  },
  {
    id: "p1_review_gate_state_machine",
    args: ["validate-p1-review-decision.mjs", "--self-test"],
    expected_statuses: ["PASS_REVIEW_GATE_STATE_MACHINE"],
  },
  {
    id: "current_phase_state",
    args: ["validate-current-phase-state.mjs"],
    expected_statuses: ["PASS_CURRENT_PHASE_STATE"],
  },
  {
    id: "p2_preparation_boundary",
    args: ["validate-p2-preparation-boundary.mjs"],
    expected_statuses: [
      "PASS_P2_PREPARATION_BOUNDARY_BLOCKED_PENDING_USER_DECISION",
      "PASS_P2_PREPARATION_BOUNDARY_APPROVED_FOR_FIXTURE_ONLY",
      "PASS_P2_PREPARATION_BOUNDARY_NEEDS_SCHEMA_REVISION",
      "PASS_P2_PREPARATION_BOUNDARY_REJECTED",
    ],
  },
  {
    id: "p2_fixture_contract",
    args: ["validate-p2-fixture-contract.mjs"],
    expected_statuses: ["PASS_P2_FIXTURE_CONTRACT_READY"],
  },
  {
    id: "p2_fixture_contract_self_test",
    args: ["validate-p2-fixture-contract.mjs", "--self-test"],
    expected_statuses: ["PASS_P2_FIXTURE_CONTRACT_SELF_TEST"],
  },
];

function run(item) {
  const child = spawnSync(process.execPath, [path.join(scriptDir, item.args[0]), ...item.args.slice(1)], {
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
  return {
    id: item.id,
    command: `node ${item.args.join(" ")}`,
    exit_code: child.status,
    stdout_parse_ok: parsed !== null,
    parse_error: parseError,
    validation_status: validationStatus,
    expected_pass: item.expected_statuses.includes(validationStatus),
    stderr: child.stderr?.trim() || null,
    data: parsed,
  };
}

const validationRuns = runs.map(run);
const byId = Object.fromEntries(validationRuns.map((item) => [item.id, item]));

const currentPhase = byId.current_phase_state.data ?? {};
const reviewDecision = byId.p1_review_decision.data ?? {};
const blockedBoundaries = currentPhase.blocked_boundaries ?? {};

const highRiskBoundariesBlocked =
  blockedBoundaries.runtime_entry === "still_blocked" &&
  blockedBoundaries.real_source_entry === "still_blocked" &&
  blockedBoundaries.relationship_state_write === "blocked" &&
  blockedBoundaries.identity_merge === "blocked" &&
  blockedBoundaries.external_action === "blocked" &&
  blockedBoundaries.learning_weight_promotion === "blocked" &&
  blockedBoundaries.particle_write_back === "blocked";

const hardFailures = validationRuns
  .filter((item) => !item.expected_pass)
  .map((item) => `${item.id}:${item.validation_status ?? "NO_STATUS"}`);

const infrastructureReady =
  hardFailures.length === 0 &&
  highRiskBoundariesBlocked &&
  byId.p1_schema.expected_pass &&
  byId.p1_json_schema_contract.expected_pass &&
  byId.p1_evidence_readback_coverage.expected_pass &&
  byId.full_roadmap_and_particle_sync.expected_pass &&
  byId.p0_p12_stage_control.expected_pass &&
  byId.p0_p12_stage_control_self_test.expected_pass &&
  byId.p1_review_gate_state_machine.expected_pass &&
  byId.current_phase_state.expected_pass &&
  byId.p2_fixture_contract.expected_pass &&
  byId.p2_fixture_contract_self_test.expected_pass &&
  byId.p2_preparation_boundary.expected_pass;

const p2EntryAllowed = currentPhase.p2_entry_allowed === true;
const reviewStatus = reviewDecision.validation_status ?? null;

let auditStatus = "FAIL_P1_COMPLETION_AUDIT";
let nextAllowedAction = currentPhase.next_allowed_action ?? "unknown";

if (infrastructureReady && p2EntryAllowed) {
  auditStatus = "PASS_P1_COMPLETION_AUDIT_APPROVED_FOR_P2_FIXTURE_ONLY";
} else if (infrastructureReady && reviewStatus === "PASS_PENDING_USER_DECISION") {
  auditStatus = "PASS_P1_COMPLETION_AUDIT_PENDING_USER_REVIEW";
} else if (infrastructureReady && reviewStatus === "PASS_NEEDS_SCHEMA_REVISION_BEFORE_P2") {
  auditStatus = "PASS_P1_COMPLETION_AUDIT_NEEDS_SCHEMA_REVISION_BEFORE_P2";
} else if (infrastructureReady && reviewStatus === "PASS_REJECTED_FOR_P2") {
  auditStatus = "PASS_P1_COMPLETION_AUDIT_REJECTED_FOR_P2";
}

const result = {
  validator: "validate-p1-completion-audit.mjs",
  current_phase: currentPhase.current_phase ?? "unknown",
  current_phase_state: currentPhase.current_phase_state ?? "unknown",
  p1_artifacts_ready: infrastructureReady,
  p1_ready_for_user_review:
    infrastructureReady &&
    ["PASS_PENDING_USER_DECISION", "PASS_APPROVED_FOR_P2_FIXTURE_ONLY"].includes(reviewStatus),
  p1_approved_for_p2_fixture_only:
    infrastructureReady && reviewStatus === "PASS_APPROVED_FOR_P2_FIXTURE_ONLY" && p2EntryAllowed,
  p2_entry_allowed: infrastructureReady && p2EntryAllowed,
  remaining_gate:
    infrastructureReady && p2EntryAllowed
      ? null
      : reviewStatus === "PASS_PENDING_USER_DECISION"
        ? "user_review_decision"
        : reviewStatus === "PASS_NEEDS_SCHEMA_REVISION_BEFORE_P2"
          ? "schema_revision_before_p2"
          : reviewStatus === "PASS_REJECTED_FOR_P2"
            ? "user_direction_after_rejection"
            : "validator_failure_or_unknown_review_state",
  next_allowed_action: nextAllowedAction,
  p2_entry_blockers: currentPhase.p2_entry_blockers ?? [],
  requirements: {
    p1_schema_contract_ready: byId.p1_schema.expected_pass,
    p1_json_schema_contract_runtime_validated: byId.p1_json_schema_contract.expected_pass,
    evidence_readback_coverage_ready: byId.p1_evidence_readback_coverage.expected_pass,
    full_roadmap_and_particle_sync_ready: byId.full_roadmap_and_particle_sync.expected_pass,
    p0_p12_stage_control_ready: byId.p0_p12_stage_control.expected_pass,
    p0_p12_stage_control_self_test_ready: byId.p0_p12_stage_control_self_test.expected_pass,
    review_gate_state_valid: byId.p1_review_decision.expected_pass,
    review_gate_state_machine_ready: byId.p1_review_gate_state_machine.expected_pass,
    current_phase_preflight_ready: byId.current_phase_state.expected_pass,
    p2_fixture_contract_ready: byId.p2_fixture_contract.expected_pass,
    p2_fixture_contract_self_test_ready: byId.p2_fixture_contract_self_test.expected_pass,
    p2_preparation_boundary_ready: byId.p2_preparation_boundary.expected_pass,
    high_risk_boundaries_blocked: highRiskBoundariesBlocked,
  },
  blocked_boundaries: blockedBoundaries,
  validation_runs: validationRuns.map((item) => ({
    id: item.id,
    command: item.command,
    exit_code: item.exit_code,
    stdout_parse_ok: item.stdout_parse_ok,
    validation_status: item.validation_status,
    expected_pass: item.expected_pass,
    stderr: item.stderr,
  })),
  hard_failures: hardFailures,
  validation_status: auditStatus,
};

console.log(JSON.stringify(result, null, 2));

if (!auditStatus.startsWith("PASS")) {
  process.exitCode = 1;
}
