import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

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
  {
    id: "generated_artifacts_freshness",
    args: ["validate-generated-artifacts-freshness.mjs"],
    allowed_statuses: ["PASS_GENERATED_ARTIFACTS_FRESHNESS"],
  },
  {
    id: "p2_entry_gate_self_test",
    args: ["validate-p2-entry-gate.mjs", "--self-test"],
    allowed_statuses: ["PASS_P2_ENTRY_GATE_SELF_TEST"],
  },
  {
    id: "p1_review_pack",
    args: ["write-p1-review-pack.mjs", "--check"],
    allowed_statuses: [
      "PASS_P1_REVIEW_PACK_PENDING_USER_DECISION",
      "PASS_P1_REVIEW_PACK_APPROVED_FOR_P2_FIXTURE_ONLY",
      "PASS_P1_REVIEW_PACK_NEEDS_SCHEMA_REVISION_BEFORE_P2",
      "PASS_P1_REVIEW_PACK_REJECTED_FOR_P2",
    ],
  },
];

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

function allBlocked(boundaries) {
  return (
    boundaries?.runtime_entry === "still_blocked" &&
    boundaries?.real_source_entry === "still_blocked" &&
    boundaries?.relationship_state_write === "blocked" &&
    boundaries?.identity_merge === "blocked" &&
    boundaries?.external_action === "blocked" &&
    boundaries?.learning_weight_promotion === "blocked" &&
    boundaries?.particle_write_back === "blocked"
  );
}

function includesAll(values, requiredValues) {
  const valueSet = new Set(values ?? []);
  return requiredValues.every((item) => valueSet.has(item));
}

function setEquals(values, requiredValues) {
  const valueSet = new Set(values ?? []);
  return valueSet.size === requiredValues.length && requiredValues.every((item) => valueSet.has(item));
}

function idsFromValidationRequirements(requirements) {
  return (requirements ?? [])
    .filter((item) => item && typeof item.id === "string")
    .map((item) => item.id);
}

function validationStatusById(requirements, id) {
  return (requirements ?? []).find((item) => item?.id === id)?.required_status ?? null;
}

function allTrueObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).length > 0 &&
    Object.values(value).every((item) => item === true)
  );
}

function allScenarioCoverageTrue(items, contractKey, coverageKey) {
  return (
    Array.isArray(items) &&
    items.length > 0 &&
    items.every(
      (item) =>
        item?.[contractKey] === true &&
        allTrueObject(item?.[coverageKey])
    )
  );
}

function buildP2FixtureContractOutputChecks(p2FixtureContract) {
  return {
    p2_fixture_contract_validation_status_ready:
      p2FixtureContract?.validation_status === "PASS_P2_FIXTURE_CONTRACT_READY",
    p2_fixture_contract_has_trace_checkpoint_checks: allTrueObject(
      p2FixtureContract?.trace_checkpoint_checks
    ),
    p2_fixture_contract_has_scenario_trace_checks: allScenarioCoverageTrue(
      p2FixtureContract?.scenario_trace_checks,
      "trace_contract_declared",
      "checkpoint_coverage"
    ),
    p2_fixture_contract_has_quality_gate_checks: allTrueObject(
      p2FixtureContract?.quality_gate_checks
    ),
    p2_fixture_contract_has_scenario_quality_checks: allScenarioCoverageTrue(
      p2FixtureContract?.scenario_quality_checks,
      "quality_contract_declared",
      "quality_gate_coverage"
    ),
    p2_fixture_contract_preserves_non_write_flags:
      p2FixtureContract?.writes_fixture_artifacts === false &&
      p2FixtureContract?.writes_runtime_artifacts === false &&
      p2FixtureContract?.writes_real_data_artifacts === false &&
      p2FixtureContract?.p2_entry_authorized_by_this_validator === false,
    p2_fixture_contract_preserves_high_risk_boundaries: allBlocked(
      p2FixtureContract?.high_risk_boundaries
    ),
  };
}

function buildApprovalTransitionChecks({
  reviewPack,
  review,
  currentPhase,
  completionAudit,
  requiredAllowedOutputs,
  requiredForbiddenOutputs,
}) {
  const transition = reviewPack.approval_transition_requirements ?? null;
  const transitionState = transition?.current_transition_state ?? {};
  const validationIds = idsFromValidationRequirements(transition?.required_validation_statuses);
  const allowedStates = transition?.allowed_decision_states_for_p2 ?? [];
  const requiredFields = transition?.required_decision_fields ?? [];
  const requiredHardGateOutputs = transition?.required_hard_gate_outputs ?? [];
  const requiredFixtureContractOutputChecks =
    transition?.required_fixture_contract_output_checks ?? [];
  const requiredParticleStageFollowupOutputs =
    transition?.required_particle_stage_followup_outputs ?? [];
  const firstAllowedOutputs = transition?.first_allowed_p2_outputs ?? [];
  const transitionForbiddenOutputs = transition?.forbidden_outputs ?? [];
  const nonAuthorizedOutputs = transition?.non_authorized_even_after_p2_approval ?? [];
  const particle = transition?.particle_sync_invariants ?? {};

  const requiredValidationIds = [
    "p1_schema",
    "p1_json_schema_contract",
    "p1_evidence_readback_coverage",
    "full_roadmap_and_particle_sync",
    "p0_p12_stage_control",
    "p0_p12_stage_control_self_test",
    "p1_review_decision",
    "current_phase_state",
    "p1_completion_audit",
    "p2_preparation_boundary",
    "p2_fixture_contract",
    "p2_fixture_contract_self_test",
    "generated_artifacts_freshness",
    "p1_review_pack",
    "p2_entry_gate_self_test",
    "p2_entry_gate",
  ];
  const requiredHardGateOutputIds = [
    "approval_transition_checks",
    "p2_fixture_contract_output_checks",
    "scope_checks",
    "high_risk_boundaries",
    "validation_runs",
  ];
  const requiredFixtureContractOutputIds = [
    "p2_fixture_contract_validation_status_ready",
    "p2_fixture_contract_has_trace_checkpoint_checks",
    "p2_fixture_contract_has_scenario_trace_checks",
    "p2_fixture_contract_has_quality_gate_checks",
    "p2_fixture_contract_has_scenario_quality_checks",
    "p2_fixture_contract_preserves_non_write_flags",
    "p2_fixture_contract_preserves_high_risk_boundaries",
  ];
  const requiredParticleStageFollowupIds = [
    "ProjectionDecisionDraft",
    "ReadbackRouteDraft",
    "VisualSemanticsDraft",
    "ForbiddenWriteDraft",
    "ParticleSyncCheckpoint",
    "ProjectionValidationReport",
  ];

  return {
    review_pack_has_approval_transition_requirements:
      transition !== null &&
      typeof transition.purpose === "string" &&
      transition.purpose.includes("does not approve P2 by itself"),
    transition_allowed_decision_states_are_fixture_only: setEquals(allowedStates, [
      "approved_for_p2_fixture_only",
      "approved_with_minor_notes_for_p2_fixture_only",
    ]),
    transition_required_decision_fields_complete: includesAll(requiredFields, [
      "decision_state in allowed_decision_states_for_p2",
      "reviewer is non-empty",
      "decided_at is an ISO timestamp",
      "all checklist items are accepted or accepted_with_minor_notes",
      "boundary_assertions keep runtime, real source, relationship state write, identity merge, external action, learning weight promotion, and particle write-back blocked",
    ]),
    transition_required_validation_ids_complete: includesAll(validationIds, requiredValidationIds),
    transition_required_hard_gate_outputs_complete: includesAll(
      requiredHardGateOutputs,
      requiredHardGateOutputIds
    ),
    transition_required_fixture_contract_output_checks_complete: includesAll(
      requiredFixtureContractOutputChecks,
      requiredFixtureContractOutputIds
    ),
    transition_required_particle_stage_followup_outputs_complete: includesAll(
      requiredParticleStageFollowupOutputs,
      requiredParticleStageFollowupIds
    ),
    transition_requires_review_decision_approval_status:
      validationStatusById(transition?.required_validation_statuses, "p1_review_decision") ===
      "PASS_APPROVED_FOR_P2_FIXTURE_ONLY",
    transition_requires_current_phase_p2_allowed:
      validationStatusById(transition?.required_validation_statuses, "current_phase_state") ===
      "PASS_CURRENT_PHASE_STATE with p2_entry_allowed=true",
    transition_requires_p2_entry_gate_approval:
      validationStatusById(transition?.required_validation_statuses, "p2_entry_gate") ===
      "PASS_P2_ENTRY_APPROVED_FOR_FIXTURE_ONLY",
    transition_requires_p2_entry_gate_self_test:
      validationStatusById(transition?.required_validation_statuses, "p2_entry_gate_self_test") ===
      "PASS_P2_ENTRY_GATE_SELF_TEST",
    transition_requires_p2_fixture_contract:
      validationStatusById(transition?.required_validation_statuses, "p2_fixture_contract") ===
      "PASS_P2_FIXTURE_CONTRACT_READY",
    transition_requires_p2_fixture_contract_self_test:
      validationStatusById(transition?.required_validation_statuses, "p2_fixture_contract_self_test") ===
      "PASS_P2_FIXTURE_CONTRACT_SELF_TEST",
    transition_current_state_matches_review_gate:
      transitionState.review_validation_status === review.validation_status &&
      transitionState.p2_entry_allowed === reviewPack.p2_entry_allowed,
    transition_current_state_matches_current_phase:
      transitionState.current_phase_state === currentPhase.current_phase_state &&
      transitionState.p2_entry_allowed === currentPhase.p2_entry_allowed,
    transition_current_state_matches_completion_audit:
      transitionState.completion_validation_status === completionAudit.validation_status &&
      transitionState.p1_ready_for_user_review === completionAudit.p1_ready_for_user_review &&
      transitionState.p1_approved_for_p2_fixture_only ===
        completionAudit.p1_approved_for_p2_fixture_only &&
      transitionState.remaining_gate === completionAudit.remaining_gate,
    transition_allowed_outputs_fixture_only: includesAll(firstAllowedOutputs, requiredAllowedOutputs),
    transition_forbidden_outputs_preserved:
      includesAll(transitionForbiddenOutputs, requiredForbiddenOutputs) &&
      includesAll(nonAuthorizedOutputs, requiredForbiddenOutputs),
    transition_particle_invariants_read_only:
      particle.projection_is_read_only === true &&
      particle.particle_write_back_allowed === false &&
      particle.particle_layer_is_not_fact_source === true &&
      particle.visual_weight_is_not_truth === true &&
      particle.p2_allows_mock_particle_readback_report_only === true,
  };
}

function buildSelfTestFixture() {
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
  const p2FixtureContract = {
    validation_status: "PASS_P2_FIXTURE_CONTRACT_READY",
    trace_checkpoint_checks: {
      source_archive_trace: true,
      source_episode_trace: true,
    },
    scenario_trace_checks: [
      {
        scenario_id: "sales_customer_progress_simulated_fixture",
        trace_contract_declared: true,
        checkpoint_coverage: {
          source_archive_trace: true,
          source_episode_trace: true,
        },
      },
    ],
    quality_gate_checks: {
      original_text_preservation_gate: true,
      evidence_anchor_required_gate: true,
      summary_compactness_gate: true,
    },
    scenario_quality_checks: [
      {
        scenario_id: "sales_customer_progress_simulated_fixture",
        quality_contract_declared: true,
        quality_gate_coverage: {
          original_text_preservation_gate: true,
          evidence_anchor_required_gate: true,
          summary_compactness_gate: true,
        },
      },
    ],
    writes_fixture_artifacts: false,
    writes_runtime_artifacts: false,
    writes_real_data_artifacts: false,
    p2_entry_authorized_by_this_validator: false,
    high_risk_boundaries: {
      runtime_entry: "still_blocked",
      real_source_entry: "still_blocked",
      relationship_state_write: "blocked",
      identity_merge: "blocked",
      external_action: "blocked",
      learning_weight_promotion: "blocked",
      particle_write_back: "blocked",
    },
  };
  const review = {
    validation_status: "PASS_PENDING_USER_DECISION",
  };
  const currentPhase = {
    current_phase_state: "p1_validated_pending_user_review",
    p2_entry_allowed: false,
  };
  const completionAudit = {
    validation_status: "PASS_P1_COMPLETION_AUDIT_PENDING_USER_REVIEW",
    p1_ready_for_user_review: true,
    p1_approved_for_p2_fixture_only: false,
    remaining_gate: "user_review_decision",
  };
  const reviewPack = {
    p2_entry_allowed: false,
    approval_transition_requirements: {
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
        { id: "p1_schema", required_status: "PASS" },
        { id: "p1_json_schema_contract", required_status: "PASS_P1_JSON_SCHEMA_CONTRACT" },
        { id: "p1_evidence_readback_coverage", required_status: "PASS_EVIDENCE_READBACK_COVERAGE" },
        { id: "full_roadmap_and_particle_sync", required_status: "PASS" },
        { id: "p0_p12_stage_control", required_status: "PASS_P0_P12_STAGE_CONTROL" },
        {
          id: "p0_p12_stage_control_self_test",
          required_status: "PASS_P0_P12_STAGE_CONTROL_SELF_TEST",
        },
        { id: "p1_review_decision", required_status: "PASS_APPROVED_FOR_P2_FIXTURE_ONLY" },
        {
          id: "current_phase_state",
          required_status: "PASS_CURRENT_PHASE_STATE with p2_entry_allowed=true",
        },
        {
          id: "p1_completion_audit",
          required_status: "PASS_P1_COMPLETION_AUDIT_APPROVED_FOR_P2_FIXTURE_ONLY",
        },
        {
          id: "p2_preparation_boundary",
          required_status: "PASS_P2_PREPARATION_BOUNDARY_APPROVED_FOR_FIXTURE_ONLY",
        },
        {
          id: "p2_fixture_contract",
          required_status: "PASS_P2_FIXTURE_CONTRACT_READY",
        },
        {
          id: "p2_fixture_contract_self_test",
          required_status: "PASS_P2_FIXTURE_CONTRACT_SELF_TEST",
        },
        {
          id: "generated_artifacts_freshness",
          required_status: "PASS_GENERATED_ARTIFACTS_FRESHNESS",
        },
        {
          id: "p1_review_pack",
          required_status: "PASS_P1_REVIEW_PACK_APPROVED_FOR_P2_FIXTURE_ONLY",
        },
        {
          id: "p2_entry_gate_self_test",
          required_status: "PASS_P2_ENTRY_GATE_SELF_TEST",
        },
        { id: "p2_entry_gate", required_status: "PASS_P2_ENTRY_APPROVED_FOR_FIXTURE_ONLY" },
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
        review_validation_status: "PASS_PENDING_USER_DECISION",
        current_phase_state: "p1_validated_pending_user_review",
        completion_validation_status: "PASS_P1_COMPLETION_AUDIT_PENDING_USER_REVIEW",
        p1_ready_for_user_review: true,
        p1_approved_for_p2_fixture_only: false,
        p2_entry_allowed: false,
        remaining_gate: "user_review_decision",
      },
      first_allowed_p2_outputs: requiredAllowedOutputs,
      forbidden_outputs: requiredForbiddenOutputs,
      non_authorized_even_after_p2_approval: requiredForbiddenOutputs,
      particle_sync_invariants: {
        projection_is_read_only: true,
        particle_write_back_allowed: false,
        particle_layer_is_not_fact_source: true,
        visual_weight_is_not_truth: true,
        p2_allows_mock_particle_readback_report_only: true,
      },
    },
  };

  return {
    reviewPack,
    review,
    currentPhase,
    completionAudit,
    p2FixtureContract,
    requiredAllowedOutputs,
    requiredForbiddenOutputs,
  };
}

function runSelfTest() {
  const cases = [
    {
      id: "valid_transition_passes_all_checks",
      mutate: () => {},
      expected_false_checks: [],
    },
    {
      id: "missing_transition_blocks",
      mutate: (fixture) => {
        delete fixture.reviewPack.approval_transition_requirements;
      },
      expected_false_checks: ["review_pack_has_approval_transition_requirements"],
    },
    {
      id: "missing_p2_entry_gate_requirement_blocks",
      mutate: (fixture) => {
        const requirements =
          fixture.reviewPack.approval_transition_requirements.required_validation_statuses;
        fixture.reviewPack.approval_transition_requirements.required_validation_statuses =
          requirements.filter((item) => item.id !== "p2_entry_gate");
      },
      expected_false_checks: ["transition_required_validation_ids_complete"],
    },
    {
      id: "missing_p2_fixture_contract_self_test_requirement_blocks",
      mutate: (fixture) => {
        const requirements =
          fixture.reviewPack.approval_transition_requirements.required_validation_statuses;
        fixture.reviewPack.approval_transition_requirements.required_validation_statuses =
          requirements.filter((item) => item.id !== "p2_fixture_contract_self_test");
      },
      expected_false_checks: ["transition_required_validation_ids_complete"],
    },
    {
      id: "missing_required_hard_gate_output_blocks",
      mutate: (fixture) => {
        fixture.reviewPack.approval_transition_requirements.required_hard_gate_outputs =
          fixture.reviewPack.approval_transition_requirements.required_hard_gate_outputs.filter(
            (item) => item !== "p2_fixture_contract_output_checks"
          );
      },
      expected_false_checks: ["transition_required_hard_gate_outputs_complete"],
    },
    {
      id: "missing_required_fixture_contract_output_check_blocks",
      mutate: (fixture) => {
        fixture.reviewPack.approval_transition_requirements.required_fixture_contract_output_checks =
          fixture.reviewPack.approval_transition_requirements.required_fixture_contract_output_checks.filter(
            (item) => item !== "p2_fixture_contract_has_quality_gate_checks"
          );
      },
      expected_false_checks: [
        "transition_required_fixture_contract_output_checks_complete",
      ],
    },
    {
      id: "missing_required_particle_stage_followup_output_blocks",
      mutate: (fixture) => {
        fixture.reviewPack.approval_transition_requirements.required_particle_stage_followup_outputs =
          fixture.reviewPack.approval_transition_requirements.required_particle_stage_followup_outputs.filter(
            (item) => item !== "ParticleSyncCheckpoint"
          );
      },
      expected_false_checks: [
        "transition_required_particle_stage_followup_outputs_complete",
      ],
    },
    {
      id: "state_mismatch_blocks",
      mutate: (fixture) => {
        fixture.reviewPack.approval_transition_requirements.current_transition_state.p2_entry_allowed = true;
      },
      expected_false_checks: [
        "transition_current_state_matches_review_gate",
        "transition_current_state_matches_current_phase",
      ],
    },
    {
      id: "particle_writeback_blocks",
      mutate: (fixture) => {
        fixture.reviewPack.approval_transition_requirements.particle_sync_invariants.particle_write_back_allowed = true;
      },
      expected_false_checks: ["transition_particle_invariants_read_only"],
    },
    {
      id: "missing_quality_gate_output_blocks",
      mutate: (fixture) => {
        delete fixture.p2FixtureContract.quality_gate_checks;
      },
      expected_false_checks: ["p2_fixture_contract_has_quality_gate_checks"],
    },
    {
      id: "missing_scenario_quality_output_blocks",
      mutate: (fixture) => {
        fixture.p2FixtureContract.scenario_quality_checks[0].quality_gate_coverage.summary_compactness_gate = false;
      },
      expected_false_checks: ["p2_fixture_contract_has_scenario_quality_checks"],
    },
    {
      id: "p2_contract_authorization_blocks",
      mutate: (fixture) => {
        fixture.p2FixtureContract.p2_entry_authorized_by_this_validator = true;
      },
      expected_false_checks: ["p2_fixture_contract_preserves_non_write_flags"],
    },
  ];

  const results = cases.map((testCase) => {
    const fixture = buildSelfTestFixture();
    testCase.mutate(fixture);
    const checks = buildApprovalTransitionChecks(fixture);
    const fixtureContractChecks = buildP2FixtureContractOutputChecks(fixture.p2FixtureContract);
    const falseChecks = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([id]) => id)
      .concat(
        Object.entries(fixtureContractChecks)
          .filter(([, passed]) => !passed)
          .map(([id]) => id)
      );
    const expectedSet = new Set(testCase.expected_false_checks);
    const actualSet = new Set(falseChecks);
    const expectedMatches =
      expectedSet.size === 0
        ? actualSet.size === 0
        : [...expectedSet].every((id) => actualSet.has(id));

    return {
      id: testCase.id,
      expected_false_checks: testCase.expected_false_checks,
      actual_false_checks: falseChecks,
      status: expectedMatches ? "PASS" : "FAIL",
    };
  });

  const passed = results.every((item) => item.status === "PASS");
  console.log(
    JSON.stringify(
      {
        validator: "validate-p2-entry-gate.mjs --self-test",
        cases: results,
        writes_fixture_artifacts: false,
        writes_runtime_artifacts: false,
        writes_real_data_artifacts: false,
        p2_entry_authorized_by_this_validator: false,
        validation_status: passed
          ? "PASS_P2_ENTRY_GATE_SELF_TEST"
          : "FAIL_P2_ENTRY_GATE_SELF_TEST",
      },
      null,
      2
    )
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit();
}

const runs = validators.map(runValidator);
const byId = Object.fromEntries(runs.map((run) => [run.id, run]));
const hardFailures = runs
  .filter((run) => !run.expected_pass)
  .map((run) => `${run.id}:${run.validation_status ?? "NO_STATUS"}`);

const review = byId.p1_review_decision.data ?? {};
const currentPhase = byId.current_phase_state.data ?? {};
const completionAudit = byId.p1_completion_audit.data ?? {};
const reviewPack = byId.p1_review_pack.data ?? {};
const p2FixtureContract = byId.p2_fixture_contract.data ?? {};

const currentPhaseAllowsP2 = currentPhase.p2_entry_allowed === true;
const completionAllowsP2 = completionAudit.p2_entry_allowed === true;
const reviewPackAllowsP2 = reviewPack.p2_entry_allowed === true;
const reviewAllowsP2 =
  review.validation_status === "PASS_APPROVED_FOR_P2_FIXTURE_ONLY" &&
  review.p2_entry_allowed === true;

const allowedOutputs = new Set(review.allowed_outputs_if_approved ?? reviewPack.allowed_outputs_if_approved ?? []);
const forbiddenOutputs = new Set(review.forbidden_outputs ?? reviewPack.forbidden_outputs ?? []);

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

const scopeChecks = {
  p2_allowed_outputs_fixture_only: requiredAllowedOutputs.every((item) => allowedOutputs.has(item)),
  p2_forbidden_outputs_preserved: requiredForbiddenOutputs.every((item) => forbiddenOutputs.has(item)),
  current_phase_boundaries_blocked: allBlocked(currentPhase.blocked_boundaries),
  completion_boundaries_blocked: allBlocked(completionAudit.blocked_boundaries),
  review_boundaries_blocked:
    review.boundary_checks?.runtime_entry === true &&
    review.boundary_checks?.real_source_entry === true &&
    review.boundary_checks?.relationship_state_write === true &&
    review.boundary_checks?.identity_merge === true &&
    review.boundary_checks?.external_action === true &&
    review.boundary_checks?.learning_weight_promotion === true &&
    review.boundary_checks?.particle_write_back === true,
};

const approvalTransitionChecks = buildApprovalTransitionChecks({
  reviewPack,
  review,
  currentPhase,
  completionAudit,
  requiredAllowedOutputs,
  requiredForbiddenOutputs,
});

const p2FixtureContractOutputChecks = buildP2FixtureContractOutputChecks(p2FixtureContract);

const p2EntryAllowed =
  hardFailures.length === 0 &&
  Object.values(scopeChecks).every(Boolean) &&
  Object.values(approvalTransitionChecks).every(Boolean) &&
  Object.values(p2FixtureContractOutputChecks).every(Boolean) &&
  reviewAllowsP2 &&
  currentPhaseAllowsP2 &&
  completionAllowsP2 &&
  reviewPackAllowsP2;

const blockers = new Set();

for (const failure of hardFailures) {
  blockers.add(failure);
}
for (const [key, passed] of Object.entries(scopeChecks)) {
  if (!passed) blockers.add(key);
}
for (const [key, passed] of Object.entries(approvalTransitionChecks)) {
  if (!passed) blockers.add(key);
}
for (const [key, passed] of Object.entries(p2FixtureContractOutputChecks)) {
  if (!passed) blockers.add(key);
}
if (!reviewAllowsP2) blockers.add("p1_review_decision_not_approved_for_p2_fixture_only");
if (!currentPhaseAllowsP2) blockers.add("current_phase_preflight_blocks_p2");
if (!completionAllowsP2) blockers.add("p1_completion_audit_blocks_p2");
if (!reviewPackAllowsP2) blockers.add("p1_review_pack_blocks_p2");

let validationStatus = "FAIL_P2_ENTRY_GATE";

if (p2EntryAllowed) {
  validationStatus = "PASS_P2_ENTRY_APPROVED_FOR_FIXTURE_ONLY";
} else if (hardFailures.length === 0 && review.validation_status === "PASS_PENDING_USER_DECISION") {
  validationStatus = "PASS_P2_ENTRY_BLOCKED_PENDING_USER_DECISION";
} else if (hardFailures.length === 0 && review.validation_status === "PASS_NEEDS_SCHEMA_REVISION_BEFORE_P2") {
  validationStatus = "PASS_P2_ENTRY_BLOCKED_NEEDS_SCHEMA_REVISION";
} else if (hardFailures.length === 0 && review.validation_status === "PASS_REJECTED_FOR_P2") {
  validationStatus = "PASS_P2_ENTRY_BLOCKED_REJECTED";
}

const result = {
  validator: "validate-p2-entry-gate.mjs",
  p2_entry_allowed: p2EntryAllowed,
  next_allowed_action: p2EntryAllowed
    ? "enter_P2_fixture_and_reverse_validation_only"
    : "wait_for_user_review_decision_or_revise_P1",
  p2_scope: p2EntryAllowed ? "fixture_and_reverse_validation_only" : "blocked",
  blockers: [...blockers],
  scope_checks: scopeChecks,
  approval_transition_checks: approvalTransitionChecks,
  p2_fixture_contract_output_checks: p2FixtureContractOutputChecks,
  validation_runs: runs.map((run) => ({
    id: run.id,
    command: run.command,
    exit_code: run.exit_code,
    stdout_parse_ok: run.stdout_parse_ok,
    validation_status: run.validation_status,
    expected_pass: run.expected_pass,
    stderr: run.stderr,
  })),
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
