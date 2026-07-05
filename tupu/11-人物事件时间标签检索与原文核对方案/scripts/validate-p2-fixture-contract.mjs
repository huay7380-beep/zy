import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const planDir = path.resolve(scriptDir, "..");

function findPlanFile(prefix) {
  return fs.readdirSync(planDir).find((name) => name.startsWith(prefix) && name.endsWith(".md"));
}

const paths = {
  control: path.join(planDir, findPlanFile("00-") ?? "00-missing.md"),
  readme: path.join(planDir, "README.md"),
  decisionTemplate: path.join(planDir, "review-gates", "P1-review-decision.template.json"),
};

const unauthorizedP2PathNames = [
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
];

const requiredScenarios = [
  "sales_customer_progress_simulated_fixture",
  "romantic_relationship_maintenance_simulated_fixture",
  "public_case_style_complex_multisource_simulated_fixture",
];

const requiredFixtureFields = [
  "fixture_id",
  "scenario_id",
  "scenario_domain",
  "source_archives",
  "source_episodes",
  "raw_events",
  "semantic_events",
  "nested_events",
  "evidence_anchors",
  "tag_assignments",
  "index_expectations",
  "reverse_queries",
  "expected_readback",
  "context_snapshot_expectations",
  "particle_projection_expectations",
  "blocked_actions",
];

const requiredReverseDimensions = [
  "person_readback",
  "event_readback",
  "time_readback",
  "tag_readback",
  "source_readback",
  "evidence_readback",
  "original_text_readback",
  "narrative_readback",
  "weight_readback",
  "particle_readback",
];

const requiredTraceCheckpoints = [
  "source_archive_trace",
  "source_episode_trace",
  "raw_event_trace",
  "semantic_event_trace",
  "nested_event_trace",
  "evidence_anchor_trace",
  "tag_assignment_trace",
  "index_expectation_trace",
  "reverse_query_trace",
  "expected_readback_trace",
  "context_snapshot_trace",
  "particle_projection_trace",
  "blocked_action_trace",
];

const requiredQualityGates = [
  "original_text_preservation_gate",
  "evidence_anchor_required_gate",
  "summary_compactness_gate",
  "summary_non_substitution_gate",
  "readback_fidelity_gate",
  "tag_to_original_text_gate",
  "person_event_query_recall_gate",
  "query_precision_gate",
  "context_snapshot_budget_gate",
  "cold_read_original_gate",
  "conflict_preservation_gate",
  "particle_readback_explainability_gate",
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

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function has(text, value) {
  return text.includes(value);
}

function hasExactLine(text, value) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .includes(value);
}

function containsAll(values, requiredValues) {
  const valueSet = new Set(values ?? []);
  return requiredValues.every((item) => valueSet.has(item));
}

function buildValidationResult({
  control,
  readme,
  decisionTemplate,
  unauthorizedExistingPaths,
  validator = "validate-p2-fixture-contract.mjs",
}) {
  const requiredValidationCommands = (decisionTemplate?.required_validation ?? []).map(
    (item) => item.command
  );
  const reviewedArtifacts = (decisionTemplate?.reviewed_artifacts ?? []).map((item) => item.path);

  const contractChecks = {
    control_has_contract_section: has(control, "### 20.10 P2 fixture"),
    contract_declares_not_started: has(control, "p2_fixture_contract_status = defined_not_started"),
    contract_has_no_fixture_write_boundary:
      has(control, "\u4e0d\u751f\u6210 P2 fixture") &&
      has(control, "\u4e0d\u6388\u6743\u8fdb\u5165 P2"),
    readme_mentions_contract_validator: has(readme, "validate-p2-fixture-contract.mjs"),
    readme_mentions_contract_self_test: has(readme, "validate-p2-fixture-contract.mjs --self-test"),
    decision_template_requires_contract_validator: containsAll(requiredValidationCommands, [
      "node .\\validate-p2-fixture-contract.mjs",
    ]),
    decision_template_requires_contract_self_test: containsAll(requiredValidationCommands, [
      "node .\\validate-p2-fixture-contract.mjs --self-test",
    ]),
    reviewed_artifacts_include_contract_validator: containsAll(reviewedArtifacts, [
      "scripts/validate-p2-fixture-contract.mjs",
    ]),
    no_unauthorized_p2_artifacts_present: unauthorizedExistingPaths.length === 0,
    forbidden_outputs_preserved: containsAll(
      decisionTemplate?.forbidden_outputs ?? [],
      requiredForbiddenOutputs
    ),
  };

  const scenarioChecks = requiredScenarios.map((scenarioId) => ({
    scenario_id: scenarioId,
    mentioned_in_control: hasExactLine(control, scenarioId),
    listed_as_allowed_output: containsAll(decisionTemplate?.allowed_outputs_if_approved ?? [], [
      scenarioId,
    ]),
  }));

  const fixtureFieldChecks = Object.fromEntries(
    requiredFixtureFields.map((field) => [field, hasExactLine(control, field)])
  );

  const reverseDimensionChecks = Object.fromEntries(
    requiredReverseDimensions.map((field) => [field, hasExactLine(control, field)])
  );

  const traceCheckpointChecks = Object.fromEntries(
    requiredTraceCheckpoints.map((checkpoint) => [checkpoint, hasExactLine(control, checkpoint)])
  );

  const scenarioTraceChecks = requiredScenarios.map((scenarioId) => ({
    scenario_id: scenarioId,
    trace_contract_declared: hasExactLine(control, `${scenarioId}_trace_contract`),
    checkpoint_coverage: Object.fromEntries(
      requiredTraceCheckpoints.map((checkpoint) => [
        checkpoint,
        hasExactLine(control, `${scenarioId}:${checkpoint}`),
      ])
    ),
  }));

  const qualityGateChecks = Object.fromEntries(
    requiredQualityGates.map((gate) => [gate, hasExactLine(control, gate)])
  );

  const scenarioQualityChecks = requiredScenarios.map((scenarioId) => ({
    scenario_id: scenarioId,
    quality_contract_declared: hasExactLine(control, `${scenarioId}_quality_contract`),
    quality_gate_coverage: Object.fromEntries(
      requiredQualityGates.map((gate) => [gate, hasExactLine(control, `${scenarioId}:${gate}`)])
    ),
  }));

  const pass =
    Object.values(contractChecks).every(Boolean) &&
    scenarioChecks.every((item) => item.mentioned_in_control && item.listed_as_allowed_output) &&
    Object.values(fixtureFieldChecks).every(Boolean) &&
    Object.values(reverseDimensionChecks).every(Boolean) &&
    Object.values(traceCheckpointChecks).every(Boolean) &&
    scenarioTraceChecks.every(
      (item) =>
        item.trace_contract_declared &&
        Object.values(item.checkpoint_coverage).every(Boolean)
    ) &&
    Object.values(qualityGateChecks).every(Boolean) &&
    scenarioQualityChecks.every(
      (item) =>
        item.quality_contract_declared &&
        Object.values(item.quality_gate_coverage).every(Boolean)
    );

  return {
    validator,
    purpose:
      "validate P2 fixture, trace matrix, summary quality gates, and reverse-readback execution contract without generating fixtures or authorizing P2",
    p2_fixture_contract_defined: pass,
    p2_fixture_artifacts_present: unauthorizedExistingPaths.length > 0,
    unauthorized_paths: unauthorizedExistingPaths,
    contract_checks: contractChecks,
    scenario_checks: scenarioChecks,
    fixture_field_checks: fixtureFieldChecks,
    reverse_dimension_checks: reverseDimensionChecks,
    trace_checkpoint_checks: traceCheckpointChecks,
    scenario_trace_checks: scenarioTraceChecks,
    quality_gate_checks: qualityGateChecks,
    scenario_quality_checks: scenarioQualityChecks,
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
    validation_status: pass ? "PASS_P2_FIXTURE_CONTRACT_READY" : "FAIL_P2_FIXTURE_CONTRACT",
  };
}

function collectFalseChecks(result) {
  return [
    ...Object.entries(result.contract_checks)
      .filter(([, passed]) => !passed)
      .map(([id]) => id),
    ...result.scenario_checks.flatMap((item) => {
      const failed = [];
      if (!item.mentioned_in_control) failed.push(`scenario:${item.scenario_id}:mentioned_in_control`);
      if (!item.listed_as_allowed_output) {
        failed.push(`scenario:${item.scenario_id}:listed_as_allowed_output`);
      }
      return failed;
    }),
    ...Object.entries(result.fixture_field_checks)
      .filter(([, passed]) => !passed)
      .map(([id]) => `fixture_field:${id}`),
    ...Object.entries(result.reverse_dimension_checks)
      .filter(([, passed]) => !passed)
      .map(([id]) => `reverse_dimension:${id}`),
    ...Object.entries(result.trace_checkpoint_checks)
      .filter(([, passed]) => !passed)
      .map(([id]) => `trace_checkpoint:${id}`),
    ...result.scenario_trace_checks.flatMap((item) => {
      const failed = [];
      if (!item.trace_contract_declared) {
        failed.push(`scenario_trace:${item.scenario_id}:trace_contract_declared`);
      }
      for (const [checkpoint, passed] of Object.entries(item.checkpoint_coverage)) {
        if (!passed) failed.push(`scenario_trace:${item.scenario_id}:${checkpoint}`);
      }
      return failed;
    }),
    ...Object.entries(result.quality_gate_checks)
      .filter(([, passed]) => !passed)
      .map(([id]) => `quality_gate:${id}`),
    ...result.scenario_quality_checks.flatMap((item) => {
      const failed = [];
      if (!item.quality_contract_declared) {
        failed.push(`scenario_quality:${item.scenario_id}:quality_contract_declared`);
      }
      for (const [gate, passed] of Object.entries(item.quality_gate_coverage)) {
        if (!passed) failed.push(`scenario_quality:${item.scenario_id}:${gate}`);
      }
      return failed;
    }),
  ];
}

function buildSyntheticInputs() {
  const control = `
### 20.10 P2 fixture \u6267\u884c\u5951\u7ea6
p2_fixture_contract_status = defined_not_started
\u4e0d\u751f\u6210 P2 fixture
\u4e0d\u6388\u6743\u8fdb\u5165 P2
${requiredScenarios.join("\n")}
${requiredFixtureFields.join("\n")}
${requiredReverseDimensions.join("\n")}
${requiredTraceCheckpoints.join("\n")}
${requiredScenarios
  .flatMap((scenarioId) => [
    `${scenarioId}_trace_contract`,
    ...requiredTraceCheckpoints.map((checkpoint) => `${scenarioId}:${checkpoint}`),
  ])
  .join("\n")}
${requiredQualityGates.join("\n")}
${requiredScenarios
  .flatMap((scenarioId) => [
    `${scenarioId}_quality_contract`,
    ...requiredQualityGates.map((gate) => `${scenarioId}:${gate}`),
  ])
  .join("\n")}
`;

  return {
    control,
    readme: "validate-p2-fixture-contract.mjs\nvalidate-p2-fixture-contract.mjs --self-test\n",
    decisionTemplate: {
      reviewed_artifacts: [{ path: "scripts/validate-p2-fixture-contract.mjs" }],
      required_validation: [
        { command: "node .\\validate-p2-fixture-contract.mjs" },
        { command: "node .\\validate-p2-fixture-contract.mjs --self-test" },
      ],
      allowed_outputs_if_approved: [...requiredScenarios],
      forbidden_outputs: [...requiredForbiddenOutputs],
    },
    unauthorizedExistingPaths: [],
  };
}

function runSelfTest() {
  const cases = [
    {
      id: "valid_contract_passes",
      mutate: () => {},
      expected_false_checks: [],
    },
    {
      id: "missing_required_scenario_blocks",
      mutate: (input) => {
        input.control = input.control.replace("romantic_relationship_maintenance_simulated_fixture", "");
      },
      expected_false_checks: [
        "scenario:romantic_relationship_maintenance_simulated_fixture:mentioned_in_control",
      ],
    },
    {
      id: "missing_fixture_field_blocks",
      mutate: (input) => {
        input.control = input.control.replace("evidence_anchors", "");
      },
      expected_false_checks: ["fixture_field:evidence_anchors"],
    },
    {
      id: "missing_reverse_dimension_blocks",
      mutate: (input) => {
        input.control = input.control.replace("original_text_readback", "");
      },
      expected_false_checks: ["reverse_dimension:original_text_readback"],
    },
    {
      id: "missing_trace_checkpoint_blocks",
      mutate: (input) => {
        input.control = input.control.replace("source_archive_trace", "");
      },
      expected_false_checks: ["trace_checkpoint:source_archive_trace"],
    },
    {
      id: "missing_scenario_trace_contract_blocks",
      mutate: (input) => {
        input.control = input.control.replace(
          "sales_customer_progress_simulated_fixture_trace_contract",
          ""
        );
      },
      expected_false_checks: [
        "scenario_trace:sales_customer_progress_simulated_fixture:trace_contract_declared",
      ],
    },
    {
      id: "missing_scenario_trace_checkpoint_blocks",
      mutate: (input) => {
        input.control = input.control.replace(
          "public_case_style_complex_multisource_simulated_fixture:particle_projection_trace",
          ""
        );
      },
      expected_false_checks: [
        "scenario_trace:public_case_style_complex_multisource_simulated_fixture:particle_projection_trace",
      ],
    },
    {
      id: "missing_quality_gate_blocks",
      mutate: (input) => {
        input.control = input.control.replace("summary_compactness_gate", "");
      },
      expected_false_checks: ["quality_gate:summary_compactness_gate"],
    },
    {
      id: "missing_scenario_quality_contract_blocks",
      mutate: (input) => {
        input.control = input.control.replace(
          "romantic_relationship_maintenance_simulated_fixture_quality_contract",
          ""
        );
      },
      expected_false_checks: [
        "scenario_quality:romantic_relationship_maintenance_simulated_fixture:quality_contract_declared",
      ],
    },
    {
      id: "missing_scenario_quality_gate_blocks",
      mutate: (input) => {
        input.control = input.control.replace(
          "sales_customer_progress_simulated_fixture:tag_to_original_text_gate",
          ""
        );
      },
      expected_false_checks: [
        "scenario_quality:sales_customer_progress_simulated_fixture:tag_to_original_text_gate",
      ],
    },
    {
      id: "unauthorized_p2_artifact_blocks",
      mutate: (input) => {
        input.unauthorizedExistingPaths = [path.join(planDir, "fixtures")];
      },
      expected_false_checks: ["no_unauthorized_p2_artifacts_present"],
    },
    {
      id: "forbidden_output_weakened_blocks",
      mutate: (input) => {
        input.decisionTemplate.forbidden_outputs = input.decisionTemplate.forbidden_outputs.filter(
          (item) => item !== "particle_write_back"
        );
      },
      expected_false_checks: ["forbidden_outputs_preserved"],
    },
    {
      id: "self_test_requirement_missing_blocks",
      mutate: (input) => {
        input.decisionTemplate.required_validation = input.decisionTemplate.required_validation.filter(
          (item) => item.command !== "node .\\validate-p2-fixture-contract.mjs --self-test"
        );
      },
      expected_false_checks: ["decision_template_requires_contract_self_test"],
    },
  ];

  const results = cases.map((testCase) => {
    const input = buildSyntheticInputs();
    testCase.mutate(input);
    const result = buildValidationResult({
      ...input,
      validator: "validate-p2-fixture-contract.mjs --self-test synthetic case",
    });
    const actualFalseChecks = collectFalseChecks(result);
    const actualSet = new Set(actualFalseChecks);
    const expectedSet = new Set(testCase.expected_false_checks);
    const matches =
      expectedSet.size === 0
        ? actualSet.size === 0
        : [...expectedSet].every((id) => actualSet.has(id));

    return {
      id: testCase.id,
      expected_false_checks: testCase.expected_false_checks,
      actual_false_checks: actualFalseChecks,
      status: matches ? "PASS" : "FAIL",
    };
  });

  const passed = results.every((item) => item.status === "PASS");
  console.log(
    JSON.stringify(
      {
        validator: "validate-p2-fixture-contract.mjs --self-test",
        purpose: "prove the P2 fixture contract validator blocks missing fields, missing readback dimensions, missing trace checkpoints, missing summary quality gates, forbidden-output weakening, and unauthorized P2 artifacts",
        cases: results,
        writes_fixture_artifacts: false,
        writes_runtime_artifacts: false,
        writes_real_data_artifacts: false,
        p2_entry_authorized_by_this_validator: false,
        validation_status: passed
          ? "PASS_P2_FIXTURE_CONTRACT_SELF_TEST"
          : "FAIL_P2_FIXTURE_CONTRACT_SELF_TEST",
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
} else {
  const unauthorizedExistingPaths = unauthorizedP2PathNames
    .map((item) => path.join(planDir, item))
    .filter((item) => fs.existsSync(item));

  const result = buildValidationResult({
    control: readText(paths.control),
    readme: readText(paths.readme),
    decisionTemplate: readJson(paths.decisionTemplate),
    unauthorizedExistingPaths,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.p2_fixture_contract_defined) {
    process.exitCode = 1;
  }
}
