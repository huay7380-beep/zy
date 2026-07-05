import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  auditMvpCompletionEvidence,
  writeMvpCompletionAudit
} from './mvp-audit.mjs';
import {
  evaluateMvpExternalInputReadiness,
  writeMvpExternalInputReadiness
} from './mvp-external-inputs.mjs';
import {
  runMvpLoopFromPilotImport,
  writeMvpRunReport
} from './mvp-runtime.mjs';
import {
  validateProcessTreeSync,
  writeProcessTreeValidation
} from './process-tree-validation.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function projectRoot() {
  return path.resolve(here, '../../..');
}

function nowIso() {
  return new Date().toISOString();
}

function createTrialId(date = new Date()) {
  return `mvp_real_input_trial_${date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function relativeOrNull(root, filePath) {
  if (!filePath) return null;
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function resolveFromRoot(root, maybeRelativePath) {
  if (!maybeRelativePath) return null;
  return path.isAbsolute(maybeRelativePath)
    ? maybeRelativePath
    : path.join(root, maybeRelativePath);
}

function readJsonIfPresent(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function findItem(readiness, issueId) {
  return (readiness.item_results ?? []).find((item) => item.issue_id === issueId) ?? null;
}

function makeCheck({ check_id, label, passed, severity = 'required', evidence = [], next_action = null }) {
  return {
    check_id,
    label,
    severity,
    status: passed ? 'pass' : 'fail',
    passed: Boolean(passed),
    evidence: evidence.filter((item) => item !== undefined && item !== null && item !== ''),
    next_action
  };
}

function summarizeResult(result) {
  if (!result) return null;
  return {
    workflow: result.workflow,
    import_id: result.import_id,
    run_id: result.run_id,
    decision_id: result.decision_id,
    trigger_id: result.trigger_id,
    feedback_id: result.feedback_id,
    raw_events: result.raw_events,
    semantic_events: result.semantic_events,
    feedback_records: result.feedback_records,
    audit_records: result.audit_records,
    quality: {
      closed_loop_complete: result.quality?.closed_loop_complete,
      feedback_complete: result.quality?.feedback_complete,
      writeback_complete: result.quality?.writeback_complete,
      index_rebuild_complete: result.quality?.index_rebuild_complete,
      audit_complete: result.quality?.audit_complete,
      automation_preview_complete: result.quality?.automation_preview_complete,
      platform_dry_run_connector_complete: result.quality?.platform_dry_run_connector_complete,
      real_execution_allowed: result.quality?.real_execution_allowed,
      real_user_review_complete: result.quality?.real_user_review_complete,
      optimization_result_complete: result.quality?.optimization_result_complete
    }
  };
}

function trialMarkdown(trial) {
  const rows = trial.checks
    .map((check) => `| ${check.check_id} | ${check.severity} | ${check.status} | ${check.label} |`)
    .join('\n');
  const artifacts = Object.entries(trial.artifacts ?? {})
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n') || '- none';
  const next = trial.next_actions.length
    ? trial.next_actions.map((item) => `- ${item}`).join('\n')
    : '- none';

  return `# MVP Real Input Trial

- trial_id: ${trial.trial_id}
- created_at: ${trial.created_at}
- gate_decision: ${trial.gate_decision}
- ready_for_user_special_testing: ${trial.ready_for_user_special_testing}
- ready_for_issue_register_review: ${trial.ready_for_issue_register_review}
- ready_to_expand_sample_or_real_connector: ${trial.ready_to_expand_sample_or_real_connector}

## Checks

| check_id | severity | status | label |
| --- | --- | --- | --- |
${rows}

## Artifacts

${artifacts}

## Required Failures

${trial.required_failures.length ? trial.required_failures.map((item) => `- ${item}`).join('\n') : '- none'}

## Expansion Failures

${trial.expansion_failures.length ? trial.expansion_failures.map((item) => `- ${item}`).join('\n') : '- none'}

## Next Actions

${next}
`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusClass(status) {
  if (status === 'pass' || status === true || status === 'ready') return 'good';
  if (status === 'fail' || status === false || status === 'missing' || status === 'invalid') return 'bad';
  return 'warn';
}

function renderList(items) {
  if (!items?.length) return '<li>none</li>';
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

function renderChecks(checks) {
  return checks.map((check) => `
        <tr>
          <td>${escapeHtml(check.check_id)}</td>
          <td><span class="pill ${statusClass(check.status)}">${escapeHtml(check.status)}</span></td>
          <td>${escapeHtml(check.label)}</td>
          <td>${escapeHtml(check.evidence?.join('；') ?? '')}</td>
        </tr>`).join('');
}

function renderInputResults(items) {
  return items.map((item) => `
        <tr>
          <td>${escapeHtml(item.issue_id)}</td>
          <td><span class="pill ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td>
          <td>${escapeHtml(item.ready)}</td>
          <td>${escapeHtml(item.evidence?.join('；') ?? '')}</td>
        </tr>`).join('');
}

export function renderMvpRealInputTrialReport(trial) {
  const blocked = trial.gate_decision === 'external_inputs_not_ready_stop_before_trial';
  const title = blocked ? '真实输入试跑被阻断' : '真实输入试跑报告';
  const subtitle = blocked
    ? '真实材料尚未 ready，系统没有运行完整 MVP 闭环。'
    : '真实材料已进入受控试跑，以下为闭环、审计和同步证据。';
  const artifacts = Object.entries(trial.artifacts ?? {})
    .filter(([, value]) => value)
    .map(([key, value]) => `<li><span>${escapeHtml(key)}</span><code>${escapeHtml(value)}</code></li>`)
    .join('') || '<li>none</li>';
  const result = trial.result_summary;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MVP真实输入试跑 - ${escapeHtml(trial.trial_id)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, "Microsoft YaHei", sans-serif; color: #17212f; background: #f6f7f9; }
    body { margin: 0; }
    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 48px; }
    header { display: grid; gap: 10px; margin-bottom: 24px; }
    h1 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 18px; letter-spacing: 0; }
    p { margin: 0; line-height: 1.65; }
    .muted { color: #5d6978; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 18px 0 24px; }
    .metric, section { background: #fff; border: 1px solid #dce1e7; border-radius: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
    .metric { padding: 14px; min-height: 86px; }
    .metric b { display: block; font-size: 13px; color: #5d6978; margin-bottom: 8px; font-weight: 600; }
    .metric span { font-size: 16px; font-weight: 700; overflow-wrap: anywhere; }
    section { padding: 18px; margin-top: 14px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { padding: 10px; border-top: 1px solid #e5e9ef; text-align: left; vertical-align: top; font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; }
    th { color: #5d6978; font-weight: 600; border-top: 0; }
    code { background: #eef2f6; border-radius: 4px; padding: 2px 5px; font-family: Consolas, monospace; font-size: 12px; }
    ul { margin: 0; padding-left: 20px; }
    li { margin: 7px 0; line-height: 1.55; }
    .pill { display: inline-block; border-radius: 999px; padding: 3px 9px; font-size: 12px; font-weight: 700; }
    .good { background: #e7f5ee; color: #127046; }
    .bad { background: #fdecec; color: #aa2d2d; }
    .warn { background: #fff4d8; color: #7a5700; }
    .banner { padding: 14px 16px; border-radius: 8px; border: 1px solid ${blocked ? '#efb8b8' : '#b8dfca'}; background: ${blocked ? '#fff3f3' : '#effaf4'}; }
    .artifacts li { display: grid; grid-template-columns: minmax(150px, 0.32fr) minmax(0, 1fr); gap: 10px; padding: 6px 0; }
    @media (max-width: 760px) {
      main { padding: 22px 12px 36px; }
      .grid { grid-template-columns: 1fr; }
      table, thead, tbody, tr, th, td { display: block; }
      th { display: none; }
      td { border-top: 0; padding: 7px 0; }
      tr { border-top: 1px solid #e5e9ef; padding: 8px 0; }
      .artifacts li { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body data-report-contract="mvp_real_input_trial_report.v1" data-trial-contract="${escapeHtml(trial.schema_version)}">
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <p class="muted">${escapeHtml(subtitle)}</p>
      <p class="muted">${escapeHtml(trial.trial_id)} · ${escapeHtml(trial.created_at)}</p>
      <div class="banner">
        <p><strong>当前结论：</strong>${escapeHtml(trial.gate_decision)}</p>
      </div>
    </header>

    <div class="grid">
      <div class="metric"><b>用户专项测试</b><span>${escapeHtml(trial.ready_for_user_special_testing)}</span></div>
      <div class="metric"><b>问题台账复核</b><span>${escapeHtml(trial.ready_for_issue_register_review)}</span></div>
      <div class="metric"><b>扩大样本/连接器</b><span>${escapeHtml(trial.ready_to_expand_sample_or_real_connector)}</span></div>
      <div class="metric"><b>输入状态</b><span>${escapeHtml(trial.external_input_readiness.gate_decision)}</span></div>
    </div>

    <section>
      <h2>外部输入</h2>
      <table>
        <thead><tr><th>项目</th><th>状态</th><th>ready</th><th>证据</th></tr></thead>
        <tbody>${renderInputResults(trial.external_input_readiness.item_results)}</tbody>
      </table>
    </section>

    <section>
      <h2>试跑检查</h2>
      <table>
        <thead><tr><th>检查项</th><th>状态</th><th>说明</th><th>证据</th></tr></thead>
        <tbody>${renderChecks(trial.checks)}</tbody>
      </table>
    </section>

    <section>
      <h2>闭环结果</h2>
      ${result ? `
      <div class="grid">
        <div class="metric"><b>run_id</b><span>${escapeHtml(result.run_id)}</span></div>
        <div class="metric"><b>原始事件</b><span>${escapeHtml(result.raw_events)}</span></div>
        <div class="metric"><b>语义事件</b><span>${escapeHtml(result.semantic_events)}</span></div>
        <div class="metric"><b>真实执行阻断</b><span>${escapeHtml(result.quality.real_execution_allowed === false)}</span></div>
      </div>` : '<p class="muted">本次未进入完整闭环，因为真实输入尚未 ready。</p>'}
    </section>

    <section>
      <h2>运行产物</h2>
      <ul class="artifacts">${artifacts}</ul>
    </section>

    <section>
      <h2>下一步</h2>
      <ul>${renderList(trial.next_actions)}</ul>
    </section>

    <section>
      <h2>停止或调整</h2>
      <ul>${renderList(trial.stop_or_adjust_when)}</ul>
    </section>
  </main>
</body>
</html>
`;
}

export function writeMvpRealInputTrial({
  trial,
  outputDir
} = {}) {
  if (!trial) throw new Error('writeMvpRealInputTrial requires trial');
  const finalOutputDir = outputDir ?? path.join(projectRoot(), 'runtime/real-input-trials', trial.trial_id);
  mkdirSync(finalOutputDir, { recursive: true });
  const jsonPath = path.join(finalOutputDir, 'mvp-real-input-trial.json');
  const markdownPath = path.join(finalOutputDir, 'mvp-real-input-trial.md');
  const htmlPath = path.join(finalOutputDir, 'mvp-real-input-trial-report.html');
  writeFileSync(jsonPath, `${JSON.stringify(trial, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, trialMarkdown(trial), 'utf8');
  writeFileSync(htmlPath, renderMvpRealInputTrialReport(trial), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath,
    html_path: htmlPath,
    contract: trial.schema_version,
    report_contract: 'mvp_real_input_trial_report.v1',
    gate_decision: trial.gate_decision,
    required_failures: trial.required_failures,
    expansion_failures: trial.expansion_failures
  };
}

export function runMvpRealInputTrial({
  root = projectRoot(),
  inputKitPath = null,
  userFeedbackPath = null,
  processTreePath = path.join(root, 'examples/system-process-tree.json'),
  outputDir = null,
  reportDir = null,
  auditDir = null
} = {}) {
  const createdAt = nowIso();
  const trialId = createTrialId(new Date(createdAt));
  const trialDir = outputDir ?? path.join(root, 'runtime/real-input-trials', trialId);
  mkdirSync(trialDir, { recursive: true });

  const readiness = evaluateMvpExternalInputReadiness({
    root,
    inputKitPath
  });
  const readinessWritten = writeMvpExternalInputReadiness({
    readiness,
    outputDir: path.join(trialDir, 'input-readiness')
  });
  const pilotItem = findItem(readiness, 'PT-003');
  const platformItem = findItem(readiness, 'PT-004');
  const checks = [
    makeCheck({
      check_id: 'external_inputs_ready',
      label: 'PT-003 和 PT-004 真实材料均通过聚合就绪检查',
      passed: readiness.ready_for_real_input_trial,
      evidence: [
        `gate_decision=${readiness.gate_decision}`,
        `required_failures=${readiness.required_failures.join(',') || 'none'}`
      ],
      next_action: 'Prepare real target files under runtime/user-inputs, then rerun npm run mvp:real-trial.'
    }),
    makeCheck({
      check_id: 'pt003_pilot_import_ready',
      label: '真实 PilotImportBatch 可进入完整 MVP 闭环',
      passed: pilotItem?.ready === true,
      evidence: [
        `status=${pilotItem?.status ?? 'missing'}`,
        ...(pilotItem?.evidence ?? [])
      ],
      next_action: pilotItem?.next_action ?? 'Prepare runtime/user-inputs/pilot-import.real.json.'
    }),
    makeCheck({
      check_id: 'pt004_platform_snapshot_ready',
      label: '真实平台测试账号快照证明预览到达且真实发送阻断',
      passed: platformItem?.ready === true,
      evidence: [
        `status=${platformItem?.status ?? 'missing'}`,
        ...(platformItem?.evidence ?? [])
      ],
      next_action: platformItem?.next_action ?? 'Prepare platform snapshot HTML and matching preview JSON.'
    })
  ];

  const artifacts = {
    input_readiness_path: relativeOrNull(root, readinessWritten.json_path)
  };
  artifacts.trial_report_path = relativeOrNull(root, path.join(trialDir, 'mvp-real-input-trial-report.html'));
  let result = null;
  let report = null;
  let completionAudit = null;
  let completionAuditWritten = null;
  let processTreeValidation = null;
  let processTreeValidationWritten = null;
  let gateDecision = 'external_inputs_not_ready_stop_before_trial';
  let readyForIssueRegisterReview = false;

  if (readiness.ready_for_real_input_trial) {
    const pilotImportPath = resolveFromRoot(root, pilotItem.target_path);
    const userTestFeedback = readJsonIfPresent(userFeedbackPath);
    result = runMvpLoopFromPilotImport({
      root,
      importPath: pilotImportPath,
      userTestFeedback
    });
    report = writeMvpRunReport({
      result,
      outputDir: reportDir ?? path.join(trialDir, 'mvp-report')
    });
    completionAudit = auditMvpCompletionEvidence({
      root,
      reportPath: report.file_path,
      processTreePath
    });
    completionAuditWritten = writeMvpCompletionAudit({
      audit: completionAudit,
      outputDir: auditDir ?? path.join(trialDir, 'completion-audit')
    });
    const treeRoot = existsSync(path.join(root, 'views/obsidian/system-process-tree.md'))
      ? root
      : projectRoot();
    processTreeValidation = validateProcessTreeSync({
      root: treeRoot,
      processTreePath
    });
    processTreeValidationWritten = writeProcessTreeValidation({
      validation: processTreeValidation,
      outputDir: path.join(trialDir, 'process-tree-validation')
    });

    artifacts.report_path = relativeOrNull(root, report.file_path);
    artifacts.completion_audit_path = relativeOrNull(root, completionAuditWritten.json_path);
    artifacts.process_tree_validation_path = relativeOrNull(root, processTreeValidationWritten.json_path);

    checks.push(
      makeCheck({
        check_id: 'real_pilot_mvp_loop_complete',
        label: '真实 PilotImportBatch 已完成用户目标到审计的闭环',
        passed: result.quality?.closed_loop_complete === true
          && result.quality?.real_execution_allowed === false,
        evidence: [
          `workflow=${result.workflow}`,
          `run_id=${result.run_id}`,
          `closed_loop_complete=${result.quality?.closed_loop_complete}`,
          `real_execution_allowed=${result.quality?.real_execution_allowed}`
        ]
      }),
      makeCheck({
        check_id: 'real_trial_completion_audit_passed',
        label: '真实输入试跑完成度审计 required failures 为空',
        passed: completionAudit.required_failures.length === 0,
        evidence: [
          `overall_status=${completionAudit.overall_status}`,
          `required_failures=${completionAudit.required_failures.join(',') || 'none'}`,
          `open_expansion_items=${completionAudit.open_expansion_items.map((item) => item.issue_id).join(',') || 'none'}`
        ]
      }),
      makeCheck({
        check_id: 'real_trial_process_tree_synced',
        label: '真实输入试跑后流程树与 Obsidian 显化结构保持同步',
        passed: processTreeValidation.gate_decision === 'process_tree_synced'
          && processTreeValidation.required_failures.length === 0,
        evidence: [
          `gate_decision=${processTreeValidation.gate_decision}`,
          `required_failures=${processTreeValidation.required_failures.join(',') || 'none'}`
        ]
      })
    );

    readyForIssueRegisterReview = Boolean(
      completionAudit.required_failures.length === 0
      && processTreeValidation.required_failures.length === 0
      && result.quality?.closed_loop_complete === true
      && platformItem?.ready === true
    );
    gateDecision = readyForIssueRegisterReview
      ? 'real_input_trial_complete_waiting_issue_register_review'
      : 'real_input_trial_needs_attention';
  }

  const requiredFailures = checks
    .filter((check) => check.severity === 'required' && !check.passed)
    .map((check) => check.check_id);
  const expansionFailures = [];
  if (readyForIssueRegisterReview && (completionAudit?.open_expansion_items ?? []).length > 0) {
    expansionFailures.push('issue_register_open_items');
  }
  if (!readiness.ready_for_real_input_trial) {
    expansionFailures.push('real_external_inputs_ready');
  }

  const readyForUserSpecialTesting = requiredFailures.length === 0;
  const readyToExpand = Boolean(
    readyForIssueRegisterReview
    && completionAudit?.ready_to_expand_sample_or_real_connector === true
    && expansionFailures.length === 0
  );

  const trial = {
    schema_version: 'mvp_real_input_trial.v1',
    trial_id: trialId,
    created_at: createdAt,
    gate_decision: requiredFailures.length
      ? readiness.ready_for_real_input_trial
        ? 'real_input_trial_needs_attention'
        : 'external_inputs_not_ready_stop_before_trial'
      : gateDecision,
    ready_for_user_special_testing: readyForUserSpecialTesting,
    ready_for_issue_register_review: readyForIssueRegisterReview,
    ready_to_expand_sample_or_real_connector: readyToExpand,
    source: {
      root,
      input_kit_path: inputKitPath ? relativeOrNull(root, inputKitPath) : readiness.input_kit_path,
      pilot_import_path: pilotItem?.target_path ?? null,
      platform_snapshot_path: platformItem?.target_path ?? null,
      platform_preview_path: platformItem?.companion_preview_path ?? null,
      user_feedback_path: userFeedbackPath ? relativeOrNull(root, userFeedbackPath) : null,
      process_tree_path: relativeOrNull(root, processTreePath)
    },
    external_input_readiness: {
      gate_decision: readiness.gate_decision,
      ready_for_real_input_trial: readiness.ready_for_real_input_trial,
      required_failures: readiness.required_failures,
      item_results: readiness.item_results.map((item) => ({
        issue_id: item.issue_id,
        status: item.status,
        ready: item.ready,
        evidence: item.evidence
      }))
    },
    result_summary: summarizeResult(result),
    completion_audit_summary: completionAudit
      ? {
        overall_status: completionAudit.overall_status,
        ready_for_user_special_testing: completionAudit.ready_for_user_special_testing,
        ready_to_expand_sample_or_real_connector: completionAudit.ready_to_expand_sample_or_real_connector,
        required_failures: completionAudit.required_failures,
        open_expansion_items: completionAudit.open_expansion_items.map((item) => item.issue_id)
      }
      : null,
    process_tree_validation_summary: processTreeValidation
      ? {
        gate_decision: processTreeValidation.gate_decision,
        required_failures: processTreeValidation.required_failures,
        warning_failures: processTreeValidation.warning_failures
      }
      : null,
    checks,
    required_failures: requiredFailures,
    expansion_failures: expansionFailures,
    artifacts,
    continue_when: [
      'external_input_readiness.ready_for_real_input_trial=true',
      'required_failures 为空',
      'ready_for_issue_register_review=true',
      '人工复核 PT-003/PT-004 证据后，再更新问题台账状态'
    ],
    stop_or_adjust_when: [
      'PT-003 或 PT-004 任一材料缺失、无效或 needs_attention',
      '真实输入闭环 completion audit 出现 required failure',
      '流程树或 Obsidian 显化结构不同步',
      '真实执行阻断失效'
    ],
    next_actions: requiredFailures.length
      ? readiness.next_actions
      : readyForIssueRegisterReview
        ? [
          'Review trial artifacts and real input evidence.',
          'If evidence is accepted, update PT-003/PT-004 status or next_action in the process tree.',
          'Rerun npm run process-tree:validate and npm run mvp:objective:audit.'
        ]
        : [
          'Fix failed trial checks, then rerun npm run mvp:real-trial.'
        ]
  };
  const written = writeMvpRealInputTrial({
    trial,
    outputDir: trialDir
  });

  return {
    trial,
    written,
    readiness,
    readiness_written: readinessWritten,
    result,
    report,
    completion_audit: completionAudit,
    completion_audit_written: completionAuditWritten,
    process_tree_validation: processTreeValidation,
    process_tree_validation_written: processTreeValidationWritten
  };
}
