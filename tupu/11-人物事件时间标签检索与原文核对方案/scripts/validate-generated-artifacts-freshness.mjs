import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const planDir = path.resolve(scriptDir, "..");
const generatedDir = path.join(planDir, "review-gates", "generated");

const targets = [
  {
    id: "p1_review_pack",
    command_args: ["write-p1-review-pack.mjs", "--check"],
    generated_json: path.join(generatedDir, "P1-review-pack.generated.json"),
    generated_markdown: path.join(generatedDir, "P1-review-pack.generated.md"),
    allowed_statuses: [
      "PASS_P1_REVIEW_PACK_PENDING_USER_DECISION",
      "PASS_P1_REVIEW_PACK_APPROVED_FOR_P2_FIXTURE_ONLY",
      "PASS_P1_REVIEW_PACK_NEEDS_SCHEMA_REVISION_BEFORE_P2",
      "PASS_P1_REVIEW_PACK_REJECTED_FOR_P2",
    ],
  },
  {
    id: "p0_p12_stage_control_report",
    command_args: ["validate-p0-p12-stage-control.mjs"],
    generated_json: path.join(generatedDir, "P0-P12-stage-control.generated.json"),
    generated_markdown: path.join(generatedDir, "P0-P12-stage-control.generated.md"),
    allowed_statuses: ["PASS_P0_P12_STAGE_CONTROL"],
  },
];

const ignoredComparisonKeys = new Set(["generated_at", "output_files", "write_mode"]);

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function statSnapshot(paths) {
  return Object.fromEntries(
    paths.map((filePath) => [
      filePath,
      fs.existsSync(filePath) ? fs.statSync(filePath).mtimeMs : null,
    ])
  );
}

function snapshotsMatch(before, after) {
  return Object.keys(before).every((filePath) => {
    const beforeValue = before[filePath];
    const afterValue = after[filePath];
    if (beforeValue === null || afterValue === null) return beforeValue === afterValue;
    return Math.abs(beforeValue - afterValue) < 1;
  });
}

function runJsonCommand(commandArgs, watchedPaths) {
  const before = statSnapshot(watchedPaths);
  const child = spawnSync(
    process.execPath,
    [path.join(scriptDir, commandArgs[0]), ...commandArgs.slice(1)],
    {
      cwd: scriptDir,
      encoding: "utf8",
    }
  );
  const after = statSnapshot(watchedPaths);

  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse((child.stdout ?? "").trim());
  } catch (error) {
    parseError = error.message;
  }

  return {
    command: `node ${commandArgs.join(" ")}`,
    exit_code: child.status,
    stdout_parse_ok: parsed !== null,
    parse_error: parseError,
    validation_status: parsed?.validation_status ?? null,
    data: parsed,
    stderr: child.stderr?.trim() || null,
    check_mode_no_write: snapshotsMatch(before, after),
  };
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !ignoredComparisonKeys.has(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalize(item)])
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(normalize(value));
}

function markdownFreshness(jsonPath, markdownPath) {
  if (!fs.existsSync(jsonPath) || !fs.existsSync(markdownPath)) {
    return {
      markdown_exists: fs.existsSync(markdownPath),
      markdown_not_older_than_json: false,
    };
  }
  const jsonStat = fs.statSync(jsonPath);
  const markdownStat = fs.statSync(markdownPath);
  return {
    markdown_exists: true,
    markdown_not_older_than_json: markdownStat.mtimeMs + 1000 >= jsonStat.mtimeMs,
  };
}

function validateTarget(target) {
  const watchedPaths = [target.generated_json, target.generated_markdown];
  const generatedJson = readJsonIfExists(target.generated_json);
  const currentRun = runJsonCommand(target.command_args, watchedPaths);
  const markdown = markdownFreshness(target.generated_json, target.generated_markdown);
  const generatedMatchesCurrent =
    generatedJson !== null &&
    currentRun.data !== null &&
    stableStringify(generatedJson) === stableStringify(currentRun.data);
  const expectedStatus = target.allowed_statuses.includes(currentRun.validation_status);

  const checks = {
    generated_json_exists: generatedJson !== null,
    generated_markdown_exists: markdown.markdown_exists,
    current_check_command_passed: currentRun.exit_code === 0 && currentRun.stdout_parse_ok,
    current_status_allowed: expectedStatus,
    generated_json_matches_current_check: generatedMatchesCurrent,
    markdown_not_older_than_json: markdown.markdown_not_older_than_json,
    check_mode_no_write: currentRun.check_mode_no_write,
  };

  return {
    id: target.id,
    generated_json: target.generated_json,
    generated_markdown: target.generated_markdown,
    command_run: {
      command: currentRun.command,
      exit_code: currentRun.exit_code,
      stdout_parse_ok: currentRun.stdout_parse_ok,
      parse_error: currentRun.parse_error,
      validation_status: currentRun.validation_status,
      stderr: currentRun.stderr,
      check_mode_no_write: currentRun.check_mode_no_write,
    },
    generated_validation_status: generatedJson?.validation_status ?? null,
    checks,
    status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
  };
}

const artifactChecks = targets.map(validateTarget);
const pass = artifactChecks.every((item) => item.status === "PASS");

const result = {
  validator: "validate-generated-artifacts-freshness.mjs",
  purpose:
    "verify generated review/control artifacts still match current check-mode outputs before entering P2",
  artifact_checks: artifactChecks,
  writes_fixture_artifacts: false,
  writes_runtime_artifacts: false,
  writes_real_data_artifacts: false,
  p2_entry_authorized_by_this_validator: false,
  validation_status: pass
    ? "PASS_GENERATED_ARTIFACTS_FRESHNESS"
    : "FAIL_GENERATED_ARTIFACTS_FRESHNESS",
};

console.log(JSON.stringify(result, null, 2));

if (!pass) {
  process.exitCode = 1;
}
