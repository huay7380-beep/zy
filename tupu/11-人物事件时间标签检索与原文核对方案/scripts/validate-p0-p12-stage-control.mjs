import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const planDir = path.resolve(scriptDir, "..");
const writeReport = process.argv.includes("--write-report");
const selfTest = process.argv.includes("--self-test");
const generatedDir = path.join(planDir, "review-gates", "generated");
const generatedJsonPath = path.join(generatedDir, "P0-P12-stage-control.generated.json");
const generatedMarkdownPath = path.join(generatedDir, "P0-P12-stage-control.generated.md");
const controlPath = path.join(planDir, "00-总目标与执行控制台.md");

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

function extractHeadingBlock(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(
    new RegExp(`${escaped}\\s*\\n\\s*\`\`\`text\\n([\\s\\S]*?)\\n\`\`\``)
  );
  return match ? match[1].trim() : "";
}

function missingTerms(text, terms) {
  return terms.filter((term) => !has(text, term));
}

function lines(block) {
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildMarkdown(report) {
  const bulletList = (items) =>
    items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- -";

  const rows = report.stage_checks
    .map((stage) => {
      const missingBlocks = stage.missing_structural_blocks.join(", ") || "-";
      const missingDrift = stage.missing_drift_terms.join(", ") || "-";
      return `| ${stage.phase} | ${stage.status} | ${missingBlocks} | ${missingDrift} | ${
        stage.boundary_control_present ? "PASS" : "FAIL"
      } | ${stage.drift_verdict_present ? "PASS" : "FAIL"} | ${
        stage.particle_control_present ? "PASS" : "FAIL"
      } | ${stage.particle_checkpoint_present ? "PASS" : "FAIL"} | ${
        stage.validation_control_present ? "PASS" : "FAIL"
      } | ${
        stage.next_gate_control_present ? "PASS" : "FAIL"
      } |`;
    })
    .join("\n");

  const contractSections = report.stage_contracts
    .map(
      (contract) => `## ${contract.phase} Contract

Goal:
${bulletList(contract.goal)}

Inputs:
${bulletList(contract.inputs)}

Outputs:
${bulletList(contract.outputs)}

Boundaries:
${bulletList(contract.boundaries)}

Drift Checks:
${bulletList(contract.drift_checks)}

3D Particle Sync:
${bulletList(contract.particle_sync_notes)}

Validation:
${bulletList(contract.validation)}

Next Gate:
${bulletList(contract.next_gate)}
`
    )
    .join("\n");

  return `# P0-P12 Stage Control Report

validation_status = ${report.validation_status}

write_mode = ${report.write_mode}

This report is generated from \`00-总目标与执行控制台.md\`. It is a read-only control artifact and does not authorize P2, runtime, real data ingestion, relationship writes, identity merges, external actions, learning-weight promotion, or particle write-back.

| Phase | Status | Missing Blocks | Missing Drift Terms | Boundary | Drift | Particle | Checkpoint | Validation | Next Gate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

${contractSections}
`;
}

const stageExpectations = [
  {
    phase: "P0",
    drift_terms: ["ROOT", "P1 审查门", "3D 粒子"],
  },
  {
    phase: "P1",
    drift_terms: ["SourceArchive", "EvidenceAnchor", "runtime", "ParticleProjectionEntry"],
  },
  {
    phase: "P2",
    drift_terms: ["fixture", "EvidenceAnchor", "公开案件"],
  },
  {
    phase: "P3",
    drift_terms: ["原文归档", "SQLite", "tombstone"],
  },
  {
    phase: "P4",
    drift_terms: ["检索命中", "EvidenceAnchor", "降级状态"],
  },
  {
    phase: "P5",
    drift_terms: ["ContextSnapshot", "SummaryShard", "确认包"],
  },
  {
    phase: "P6",
    drift_terms: ["visual_weight", "V0-V5", "学习权重"],
  },
  {
    phase: "P7",
    drift_terms: ["三维粒子 OS", "NebulaProjection", "object_ref"],
  },
  {
    phase: "P8",
    drift_terms: ["embedding", "semantic_similarity", "EvidenceAnchor"],
  },
  {
    phase: "P9",
    drift_terms: ["图数据库", "图路径", "SQLite"],
  },
  {
    phase: "P10",
    drift_terms: ["runtime", "dry-run", "fixture replay"],
  },
  {
    phase: "P11",
    drift_terms: ["真实信源", "关系状态写入", "删除"],
  },
  {
    phase: "P12",
    drift_terms: ["人际关系框架", "摘要", "确认门"],
  },
];

function replacePhase(text, phase, transform) {
  const escaped = phase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const phasePattern = new RegExp(
    `(### ${escaped}[^\\n]*\\n)([\\s\\S]*?)(?=\\n### P\\d+ |\\n## \\d+\\.|$)`
  );
  return text.replace(phasePattern, (match, heading, body) => `${heading}${transform(body)}`);
}

function removePhase(text, phase) {
  const escaped = phase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(
    new RegExp(`\\n### ${escaped}[^\\n]*\\n[\\s\\S]*?(?=\\n### P\\d+ |\\n## \\d+\\.|$)`),
    ""
  );
}

function runValidatorInTemp(controlText) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tupu-stage-control-"));
  const tempPlanDir = path.join(tempRoot, "plan");
  const tempScriptDir = path.join(tempPlanDir, "scripts");
  const tempScriptPath = path.join(tempScriptDir, path.basename(fileURLToPath(import.meta.url)));
  const tempControlPath = path.join(tempPlanDir, path.basename(controlPath));

  fs.mkdirSync(tempScriptDir, { recursive: true });
  fs.copyFileSync(fileURLToPath(import.meta.url), tempScriptPath);
  fs.writeFileSync(tempControlPath, controlText, "utf8");

  try {
    const stdout = execFileSync(process.execPath, [tempScriptPath], {
      cwd: tempScriptDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(stdout);
  } catch (error) {
    const stdout = error?.stdout?.toString?.() ?? "";
    if (stdout.trim()) {
      return JSON.parse(stdout);
    }
    throw error;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runSelfTest() {
  const actualControl = readText(controlPath);
  const cases = [
    {
      id: "baseline_actual_control_passes",
      mutate: (text) => text,
      expect: (report) => report.validation_status === "PASS_P0_P12_STAGE_CONTROL",
    },
    {
      id: "missing_p2_phase_blocks",
      mutate: (text) => removePhase(text, "P2"),
      expect: (report) =>
        report.validation_status === "FAIL_P0_P12_STAGE_CONTROL" &&
        report.stage_checks.some((stage) => stage.phase === "P2" && !stage.found),
    },
    {
      id: "missing_p3_sqlite_drift_term_blocks",
      mutate: (text) => replacePhase(text, "P3", (body) => body.replaceAll("SQLite", "SQLITE_REMOVED")),
      expect: (report) =>
        report.validation_status === "FAIL_P0_P12_STAGE_CONTROL" &&
        report.stage_checks.some(
          (stage) => stage.phase === "P3" && stage.missing_drift_terms.includes("SQLite")
        ),
    },
    {
      id: "missing_p7_particle_checkpoint_blocks",
      mutate: (text) =>
        replacePhase(text, "P7", (body) =>
          body.replaceAll("ParticleSyncCheckpoint", "CheckpointRemoved")
        ),
      expect: (report) =>
        report.validation_status === "FAIL_P0_P12_STAGE_CONTROL" &&
        report.stage_checks.some(
          (stage) =>
            stage.phase === "P7" &&
            stage.hard_failures.includes("particle_sync_checkpoint_not_explicit")
        ),
    },
    {
      id: "missing_global_projection_sync_gate_blocks",
      mutate: (text) =>
        text.replaceAll("projection_sync_drift_gate_active", "projection_sync_drift_gate_REMOVED"),
      expect: (report) =>
        report.validation_status === "FAIL_P0_P12_STAGE_CONTROL" &&
        report.global_checks.has_particle_drift_gate === false,
    },
  ];

  const caseResults = cases.map((testCase) => {
    let report = null;
    let error = null;
    let passed = false;
    try {
      report = runValidatorInTemp(testCase.mutate(actualControl));
      passed = testCase.expect(report);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    return {
      id: testCase.id,
      passed,
      observed_status: report?.validation_status ?? null,
      error,
    };
  });

  const allPassed = caseResults.every((testCase) => testCase.passed);
  const report = {
    validator: "validate-p0-p12-stage-control.mjs --self-test",
    writes_fixture_artifacts: false,
    writes_runtime_artifacts: false,
    writes_real_data_artifacts: false,
    writes_particle_runtime_artifacts: false,
    cases: caseResults,
    validation_status: allPassed
      ? "PASS_P0_P12_STAGE_CONTROL_SELF_TEST"
      : "FAIL_P0_P12_STAGE_CONTROL_SELF_TEST",
  };

  console.log(JSON.stringify(report, null, 2));
  if (!allPassed) {
    process.exitCode = 1;
  }
}

if (selfTest) {
  runSelfTest();
  process.exit();
}

const result = {
  validator: "validate-p0-p12-stage-control.mjs",
  control_path: controlPath,
  control_file_exists: fs.existsSync(controlPath),
  global_checks: {},
  stage_checks: [],
  stage_contracts: [],
  write_mode: writeReport ? "write_report" : "check",
  validation_status: "PENDING",
};

if (result.control_file_exists) {
  const control = readText(controlPath);

  result.global_checks = {
    has_goal_drift_rules: has(control, "## 3. 目标漂移检测规则"),
    has_particle_drift_gate: has(control, "### 16.5 3D 同步防偏离门"),
    has_particle_sync_checkpoint: has(control, "### 16.6 ParticleSyncCheckpoint 标准格式"),
    has_full_roadmap: has(control, "## 17. 图谱完整构建路线图"),
    has_review_gate_block: has(control, "## 20. P1 用户审查确认门"),
  };

  result.global_checks.has_particle_drift_gate =
    result.global_checks.has_particle_drift_gate &&
    has(control, "projection_sync_drift_gate_active");

  for (const expectation of stageExpectations) {
    const phaseText = extractPhase(control, expectation.phase);
    const goalBlock = extractHeadingBlock(phaseText, "目标：");
    const inputBlock = extractHeadingBlock(phaseText, "输入：");
    const outputBlock = extractHeadingBlock(phaseText, "输出：");
    const boundaryBlock = extractHeadingBlock(phaseText, "边界：");
    const driftBlock = extractHeadingBlock(phaseText, "目标偏离检测：");
    const particleBlock = extractHeadingBlock(phaseText, "3D 粒子说明：");
    const validationBlock = extractHeadingBlock(phaseText, "验证：");
    const nextGateBlock =
      expectation.phase === "P12"
        ? extractHeadingBlock(phaseText, "持续运行条件：")
        : extractHeadingBlock(phaseText, "进入下一阶段条件：");

    const missingStructuralBlocks = [];
    if (!goalBlock) missingStructuralBlocks.push("目标");
    if (!inputBlock) missingStructuralBlocks.push("输入");
    if (!outputBlock) missingStructuralBlocks.push("输出");
    if (!boundaryBlock) missingStructuralBlocks.push("边界");
    if (!driftBlock) missingStructuralBlocks.push("目标偏离检测");
    if (!particleBlock) missingStructuralBlocks.push("3D 粒子说明");
    if (!validationBlock) missingStructuralBlocks.push("验证");
    if (!nextGateBlock) {
      missingStructuralBlocks.push(expectation.phase === "P12" ? "持续运行条件" : "进入下一阶段条件");
    }

    const boundaryControlPresent = /不|不得|只读|blocked|禁止/.test(boundaryBlock);
    const driftVerdictPresent = has(driftBlock, "判定为目标偏离");
    const particleControlPresent = /粒子|Particle|Nebula|projection|投影|3D|三维|显示|边|节点/.test(particleBlock);
    const particleCheckpointPresent = has(particleBlock, "ParticleSyncCheckpoint");
    const validationControlPresent = /PASS|检查|验证|audit|replay|dry-run|报告|反推|找回|可追溯|可解析|重建|召回|组装/.test(validationBlock);
    const gateControlPresent = /用户确认|PASS|blocked|仍|不得|条件|持续/.test(nextGateBlock);
    const missingDriftTerms = missingTerms(driftBlock, expectation.drift_terms);
    const stageContract = {
      phase: expectation.phase,
      goal: lines(goalBlock),
      inputs: lines(inputBlock),
      outputs: lines(outputBlock),
      boundaries: lines(boundaryBlock),
      drift_checks: lines(driftBlock),
      particle_sync_notes: lines(particleBlock),
      validation: lines(validationBlock),
      next_gate: lines(nextGateBlock),
    };

    const hardFailures = [
      ...missingStructuralBlocks.map((item) => `missing_${item}`),
      ...(boundaryControlPresent ? [] : ["boundary_control_not_explicit"]),
      ...(driftVerdictPresent ? [] : ["drift_verdict_not_explicit"]),
      ...(particleControlPresent ? [] : ["particle_control_not_explicit"]),
      ...(particleCheckpointPresent ? [] : ["particle_sync_checkpoint_not_explicit"]),
      ...(validationControlPresent ? [] : ["validation_control_not_explicit"]),
      ...(gateControlPresent ? [] : ["next_gate_control_not_explicit"]),
      ...missingDriftTerms.map((item) => `missing_drift_term:${item}`),
    ];

    result.stage_checks.push({
      phase: expectation.phase,
      found: phaseText.length > 0,
      required_drift_terms: expectation.drift_terms,
      missing_structural_blocks: missingStructuralBlocks,
      missing_drift_terms: missingDriftTerms,
      boundary_control_present: boundaryControlPresent,
      drift_verdict_present: driftVerdictPresent,
      particle_control_present: particleControlPresent,
      particle_checkpoint_present: particleCheckpointPresent,
      validation_control_present: validationControlPresent,
      next_gate_control_present: gateControlPresent,
      hard_failures: hardFailures,
      status: phaseText.length > 0 && hardFailures.length === 0 ? "PASS" : "FAIL",
    });
    result.stage_contracts.push(stageContract);
  }
}

const pass =
  result.control_file_exists &&
  Object.values(result.global_checks).every(Boolean) &&
  result.stage_checks.length === stageExpectations.length &&
  result.stage_checks.every((stage) => stage.status === "PASS");

result.validation_status = pass ? "PASS_P0_P12_STAGE_CONTROL" : "FAIL_P0_P12_STAGE_CONTROL";

if (writeReport) {
  fs.mkdirSync(generatedDir, { recursive: true });
  const reportForWrite = {
    ...result,
    generated_at: new Date().toISOString(),
    output_files: [generatedJsonPath, generatedMarkdownPath],
  };
  fs.writeFileSync(generatedJsonPath, `${JSON.stringify(reportForWrite, null, 2)}\n`, "utf8");
  fs.writeFileSync(generatedMarkdownPath, buildMarkdown(reportForWrite), "utf8");
  result.output_files = reportForWrite.output_files;
}

console.log(JSON.stringify(result, null, 2));

if (!pass) {
  process.exitCode = 1;
}
