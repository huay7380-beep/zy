import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  renderMvpRunReport,
  runMvpLoopFromPilotImport
} from './mvp-runtime.mjs';
import { validateProcessTreeSync } from './process-tree-validation.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function projectRoot() {
  return path.resolve(here, '../../..');
}

function nowIso() {
  return new Date().toISOString();
}

function createStressId(date = new Date()) {
  return `mvp_stress_${date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function readJson(filePath, fallback = null) {
  if (!filePath) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index];
}

function summarizeQuality(results) {
  const count = results.length || 1;
  const complete = (key) => results.filter((item) => item.quality?.[key] === true).length;
  return {
    closed_loop_completion_rate: complete('closed_loop_complete') / count,
    feedback_completion_rate: complete('feedback_complete') / count,
    writeback_completion_rate: complete('writeback_complete') / count,
    index_completion_rate: complete('index_rebuild_complete') / count,
    audit_completion_rate: complete('audit_complete') / count,
    automation_preview_completion_rate: complete('automation_preview_complete') / count,
    platform_dry_run_completion_rate: complete('platform_dry_run_connector_complete') / count,
    real_execution_block_rate: results.filter((item) => item.quality?.real_execution_allowed === false).length / count,
    real_user_review_completion_rate: complete('real_user_review_complete') / count,
    optimization_result_completion_rate: complete('optimization_result_complete') / count,
    user_feedback_review_rate: results.filter((item) => item.user_test_review?.gate_decision).length / count,
    second_pass_optimization_rate: results.filter((item) => item.second_pass_optimization?.optimization_id).length / count,
    agent_opinion_completion_rate: results.filter((item) => item.agent_opinions?.length === 9).length / count
  };
}

function buildHardExitSignals({ failures, quality, processTreeValidation }) {
  const signals = [];
  if (failures.length > 0) signals.push('stress_iteration_failed');
  if (quality.closed_loop_completion_rate < 1) signals.push('closed_loop_incomplete');
  if (quality.feedback_completion_rate < 1) signals.push('feedback_incomplete');
  if (quality.writeback_completion_rate < 1) signals.push('writeback_incomplete');
  if (quality.index_completion_rate < 1) signals.push('index_incomplete');
  if (quality.audit_completion_rate < 1) signals.push('audit_incomplete');
  if (quality.automation_preview_completion_rate < 1) signals.push('automation_preview_incomplete');
  if (quality.real_execution_block_rate < 1) signals.push('real_execution_not_blocked');
  if (quality.real_user_review_completion_rate < 1) signals.push('real_user_review_incomplete');
  if (quality.optimization_result_completion_rate < 1) signals.push('optimization_result_incomplete');
  if (quality.user_feedback_review_rate < 1) signals.push('user_feedback_review_incomplete');
  if (quality.second_pass_optimization_rate < 1) signals.push('second_pass_optimization_incomplete');
  if (quality.agent_opinion_completion_rate < 1) signals.push('strategy_agent_incomplete');
  if ((processTreeValidation?.required_failures ?? []).length > 0) signals.push('process_tree_sync_failed');
  return signals;
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function renderStressMarkdown(stress) {
  const rows = stress.iterations
    .map((item) => `| ${item.iteration} | ${item.status} | ${item.duration_ms} | ${item.run_id ?? ''} | ${escapeCell(item.failure ?? '')} |`)
    .join('\n');
  const exits = stress.hard_exit_signals.length
    ? stress.hard_exit_signals.map((item) => `- ${item}`).join('\n')
    : '- none';

  return `# MVP Stress Test

- stress_id: ${stress.stress_id}
- created_at: ${stress.created_at}
- gate_decision: ${stress.gate_decision}
- runs: ${stress.runs}
- success: ${stress.success}
- failed: ${stress.failed}
- avg_ms: ${stress.metrics.avg_ms}
- p95_ms: ${stress.metrics.p95_ms}

## Quality

\`\`\`json
${JSON.stringify(stress.quality, null, 2)}
\`\`\`

## Hard Exit Signals

${exits}

## Iterations

| iteration | status | duration_ms | run_id | failure |
| --- | --- | --- | --- | --- |
${rows}
`;
}

export function runMvpStressTest({
  workspaceRoot = projectRoot(),
  runs = 10,
  importPath = path.join(workspaceRoot, 'examples/pilot-import-batch.sample.json'),
  userFeedbackPath = path.join(workspaceRoot, 'examples/mvp-user-feedback.sample.json'),
  outputDir = null,
  keepWorkspaces = false,
  processTreePath = path.join(workspaceRoot, 'examples/system-process-tree.json')
} = {}) {
  const createdAt = nowIso();
  const stressId = createStressId(new Date(createdAt));
  const finalOutputDir = outputDir ?? path.join(workspaceRoot, 'runtime/mvp-stress-tests', stressId);
  const workspacesDir = path.join(finalOutputDir, 'workspaces');
  mkdirSync(workspacesDir, { recursive: true });

  const userTestFeedback = readJson(userFeedbackPath, null);
  const iterations = [];
  const successfulResults = [];
  const failures = [];
  const durations = [];

  for (let index = 0; index < runs; index += 1) {
    const iteration = index + 1;
    const iterationRoot = path.join(workspacesDir, `iteration_${String(iteration).padStart(3, '0')}`);
    const start = performance.now();
    try {
      const result = runMvpLoopFromPilotImport({
        root: iterationRoot,
        importPath,
        userTestFeedback
      });
      const reportHtml = renderMvpRunReport(result);
      const durationMs = Math.round(performance.now() - start);
      durations.push(durationMs);
      successfulResults.push(result);
      iterations.push({
        iteration,
        status: 'pass',
        duration_ms: durationMs,
        run_id: result.run_id,
        workflow: result.workflow,
        report_contract_present: reportHtml.includes('data-report-contract="mvp_run_report.v1"'),
        feedback_contract_present: reportHtml.includes('data-user-feedback-contract="mvp_user_feedback.v1"'),
        script_absent: !reportHtml.includes('<script'),
        quality: result.quality
      });
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      durations.push(durationMs);
      const failure = {
        iteration,
        message: error.message
      };
      failures.push(failure);
      iterations.push({
        iteration,
        status: 'fail',
        duration_ms: durationMs,
        failure: error.message
      });
    } finally {
      if (!keepWorkspaces) {
        rmSync(iterationRoot, { recursive: true, force: true });
      }
    }
  }

  const processTreeValidation = validateProcessTreeSync({
    root: workspaceRoot,
    processTreePath
  });
  const quality = summarizeQuality(successfulResults);
  const hardExitSignals = buildHardExitSignals({
    failures,
    quality,
    processTreeValidation
  });
  const durationTotal = durations.reduce((sum, value) => sum + value, 0);
  const stress = {
    schema_version: 'mvp_stress_test.v1',
    stress_id: stressId,
    created_at: createdAt,
    runs,
    success: successfulResults.length,
    failed: failures.length,
    gate_decision: hardExitSignals.length
      ? 'stress_failed_adjust_before_expansion'
      : 'stress_passed_continue_to_user_materials',
    source: {
      workspace_root: workspaceRoot,
      import_path: path.relative(workspaceRoot, importPath).replaceAll(path.sep, '/'),
      user_feedback_path: path.relative(workspaceRoot, userFeedbackPath).replaceAll(path.sep, '/'),
      process_tree_path: path.relative(workspaceRoot, processTreePath).replaceAll(path.sep, '/')
    },
    metrics: {
      total_ms: durationTotal,
      avg_ms: runs ? Math.round(durationTotal / runs) : 0,
      min_ms: durations.length ? Math.min(...durations) : 0,
      max_ms: durations.length ? Math.max(...durations) : 0,
      p95_ms: percentile(durations, 0.95)
    },
    quality,
    process_tree_validation: {
      gate_decision: processTreeValidation.gate_decision,
      required_failures: processTreeValidation.required_failures,
      warning_failures: processTreeValidation.warning_failures
    },
    hard_exit_signals: hardExitSignals,
    continue_when: [
      'failed=0',
      'closed_loop_completion_rate=1',
      'real_execution_block_rate=1',
      'real_user_review_completion_rate=1',
      'optimization_result_completion_rate=1',
      'user_feedback_review_rate=1',
      'second_pass_optimization_rate=1',
      'process_tree_validation.required_failures 为空'
    ],
    stop_or_adjust_when: [
      '任一 iteration 失败',
      '闭环、反馈、回写、索引或审计完成率低于 100%',
      '真实用户视角回顾、专项反馈或二次优化完成率低于 100%',
      '真实发送阻断率低于 100%',
      '流程树同步校验出现 required failure'
    ],
    failures,
    iterations
  };

  return stress;
}

export function writeMvpStressTest({
  stress,
  outputDir = path.join(projectRoot(), 'runtime/mvp-stress-tests', stress?.stress_id ?? createStressId())
} = {}) {
  if (!stress) throw new Error('writeMvpStressTest requires stress');
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'mvp-stress-test.json');
  const markdownPath = path.join(outputDir, 'mvp-stress-test.md');
  writeFileSync(jsonPath, `${JSON.stringify(stress, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderStressMarkdown(stress), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath,
    contract: stress.schema_version,
    gate_decision: stress.gate_decision
  };
}
