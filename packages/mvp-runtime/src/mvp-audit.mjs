import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const expectedFlow = [
  'user_goal',
  'relationship_context',
  'event_recording',
  'decision_recommendation',
  'trigger_plan',
  'feedback',
  'writeback',
  'index_rebuild',
  'audit'
];

function projectRoot() {
  return path.resolve(here, '../../..');
}

function nowIso() {
  return new Date().toISOString();
}

function createAuditId(date = new Date()) {
  return `mvp_completion_audit_${date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readText(filePath, fallback = '') {
  if (!filePath || !existsSync(filePath)) return fallback;
  return readFileSync(filePath, 'utf8');
}

function latestFile(dir, extension) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((filePath) => {
      if (extension && path.extname(filePath) !== extension) return false;
      return statSync(filePath).isFile();
    })
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

function getIssue(processTree, issueId) {
  return (processTree?.issue_register ?? []).find((issue) => issue.issue_id === issueId) ?? null;
}

function makeCheck({ check_id, label, passed, evidence = [], severity = 'required' }) {
  return {
    check_id,
    label,
    severity,
    status: passed ? 'pass' : 'fail',
    passed: Boolean(passed),
    evidence: evidence.filter((item) => item !== undefined && item !== null && item !== '')
  };
}

function hasChecklistItem(checklist, itemId) {
  return checklist.some((item) => item.item_id === itemId);
}

function hasNoStateResidue(stateDir) {
  if (!existsSync(stateDir)) return false;
  const names = readdirSync(stateDir);
  return !names.some((name) => name === 'state.lock' || name.endsWith('.tmp'));
}

function hasCompleteRealUserReview(review) {
  return Boolean(
    review?.total_goal
    && review?.app_scene
    && review?.reviewer_persona
    && Number(review?.realism_score ?? 0) >= 0.67
    && Array.isArray(review?.checks)
    && review.checks.length >= 6
    && review.checks.every((check) => check.check_id && check.status && check.real_user_feedback && check.optimization_hint)
    && Array.isArray(review?.feedback_summary)
    && review.feedback_summary.length > 0
    && Array.isArray(review?.optimization_focus)
    && review.optimization_focus.length > 0
  );
}

function hasCompleteOptimizationResult(optimization) {
  return Boolean(
    optimization?.optimization_id
    && optimization?.optimized_user_next_step
    && Array.isArray(optimization?.applied_changes)
    && optimization.applied_changes.length >= 4
    && Array.isArray(optimization?.next_iteration_inputs)
    && optimization.next_iteration_inputs.length >= 4
    && Array.isArray(optimization?.stop_or_adjust_when)
    && optimization.stop_or_adjust_when.length >= 3
  );
}

function includesAllInOrder(actual, expected) {
  if (!Array.isArray(actual)) return false;
  let cursor = 0;
  for (const item of actual) {
    if (item === expected[cursor]) cursor += 1;
    if (cursor === expected.length) return true;
  }
  return false;
}

function relativeOrNull(root, filePath) {
  if (!filePath) return null;
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

export function auditMvpCompletionEvidence({
  root = projectRoot(),
  statusPath = path.join(root, 'runtime/state/current-status.json'),
  processTreePath = path.join(root, 'examples/system-process-tree.json'),
  reportPath = null,
  stateDir = path.join(root, 'runtime/state')
} = {}) {
  const createdAt = nowIso();
  const status = readJson(statusPath, {});
  const processTree = readJson(processTreePath, {});
  const latestReportPath = reportPath ?? latestFile(path.join(root, 'runtime/mvp-reports'), '.html');
  const reportHtml = readText(latestReportPath);
  const summary = status?.last_run?.output_summary ?? {};
  const quality = summary.quality ?? {};
  const intakeReadiness = summary.intake_readiness ?? null;
  const messageDraft = summary.message_draft ?? {};
  const checklist = Array.isArray(summary.manual_execution_checklist)
    ? summary.manual_execution_checklist
    : [];
  const reportRelativePath = relativeOrNull(root, latestReportPath);
  const openExpansionItems = (processTree.issue_register ?? [])
    .filter((issue) => issue.status !== 'closed')
    .map((issue) => ({
      issue_id: issue.issue_id,
      node_id: issue.node_id,
      status: issue.status,
      title: issue.title,
      next_action: issue.next_action
    }));
  const pt011 = getIssue(processTree, 'PT-011');
  const pt003 = getIssue(processTree, 'PT-003');
  const pt004 = getIssue(processTree, 'PT-004');
  const pt012 = getIssue(processTree, 'PT-012');

  const checks = [
    makeCheck({
      check_id: 'canonical_flow_registered',
      label: '主流程树已按闭环顺序登记',
      passed: includesAllInOrder(processTree.canonical_flow, expectedFlow),
      evidence: [`canonical_flow=${(processTree.canonical_flow ?? []).join(' -> ')}`]
    }),
    makeCheck({
      check_id: 'state_last_run_completed',
      label: '状态笔记记录最近一次闭环完成',
      passed: status.status === 'completed'
        && status.current_run_id === null
        && status.last_run?.status === 'completed',
      evidence: [
        `status=${status.status}`,
        `current_run_id=${status.current_run_id}`,
        `last_run_status=${status.last_run?.status}`
      ]
    }),
    makeCheck({
      check_id: 'all_runtime_nodes_observed',
      label: '九个闭环节点都有运行计数',
      passed: expectedFlow.every((nodeId) => Number(status.node_counts?.[nodeId] ?? 0) > 0),
      evidence: expectedFlow.map((nodeId) => `${nodeId}=${status.node_counts?.[nodeId] ?? 0}`)
    }),
    makeCheck({
      check_id: 'pilot_import_workflow',
      label: '最近闭环由 PilotImportBatch 驱动',
      passed: summary.workflow === 'mvp_loop_from_pilot_import'
        && summary.import_summary?.ready_for_mvp_sample === true
        && Number(summary.import_summary?.semantic_coverage ?? 0) >= 0.7,
      evidence: [
        `workflow=${summary.workflow}`,
        `ready_for_mvp_sample=${summary.import_summary?.ready_for_mvp_sample}`,
        `semantic_coverage=${summary.import_summary?.semantic_coverage}`
      ]
    }),
    makeCheck({
      check_id: 'pilot_intake_readiness_gate',
      label: 'PilotImportBatch intake readiness gate passed before MVP',
      passed: Boolean(
        intakeReadiness?.schema_version === 'pilot_intake_readiness.v1'
        && intakeReadiness?.gate_decision === 'continue_to_mvp_closed_loop'
        && intakeReadiness?.ready_for_closed_loop_mvp === true
        && Array.isArray(intakeReadiness?.required_failures)
        && intakeReadiness.required_failures.length === 0
        && quality.intake_readiness_complete === true
      ),
      evidence: [
        `schema_version=${intakeReadiness?.schema_version ?? 'missing'}`,
        `gate_decision=${intakeReadiness?.gate_decision ?? 'missing'}`,
        `ready_for_closed_loop_mvp=${intakeReadiness?.ready_for_closed_loop_mvp}`,
        `required_failures=${(intakeReadiness?.required_failures ?? []).join(',') || 'none'}`,
        `quality_intake_readiness_complete=${quality.intake_readiness_complete}`
      ]
    }),
    makeCheck({
      check_id: 'core_ids_present',
      label: '决策、触发、反馈、预览和试运行 ID 可追踪',
      passed: Boolean(
        summary.decision_id
        && summary.trigger_id
        && summary.feedback_id
        && summary.automation_preview_id
        && summary.automation_trial_id
        && summary.platform_dry_run_connector_check_id
      ),
      evidence: [
        `decision_id=${summary.decision_id ?? 'missing'}`,
        `trigger_id=${summary.trigger_id ?? 'missing'}`,
        `feedback_id=${summary.feedback_id ?? 'missing'}`,
        `automation_preview_id=${summary.automation_preview_id ?? 'missing'}`,
        `automation_trial_id=${summary.automation_trial_id ?? 'missing'}`,
        `platform_dry_run_connector_check_id=${summary.platform_dry_run_connector_check_id ?? 'missing'}`
      ]
    }),
    makeCheck({
      check_id: 'strategy_agent_group_complete',
      label: '策略小组输出 9 个 Agent 意见',
      passed: Array.isArray(summary.agent_opinions) && summary.agent_opinions.length === 9,
      evidence: [`agent_opinions=${(summary.agent_opinions ?? []).join(',')}`]
    }),
    makeCheck({
      check_id: 'decision_has_message_draft',
      label: '决策建议包含可人工确认的具体草稿',
      passed: typeof messageDraft.draft === 'string'
        && messageDraft.draft.trim().length > 0
        && messageDraft.must_confirm_before_send === true,
      evidence: [
        `channel=${messageDraft.channel ?? 'missing'}`,
        `must_confirm_before_send=${messageDraft.must_confirm_before_send}`,
        `draft_chars=${typeof messageDraft.draft === 'string' ? messageDraft.draft.length : 0}`
      ]
    }),
    makeCheck({
      check_id: 'trigger_has_manual_checklist',
      label: '触发计划包含人工执行确认清单',
      passed: checklist.length >= 3
        && hasChecklistItem(checklist, 'review_message_draft')
        && hasChecklistItem(checklist, 'preview_platform_before_send')
        && hasChecklistItem(checklist, 'record_feedback_after_action'),
      evidence: checklist.map((item) => item.item_id)
    }),
    makeCheck({
      check_id: 'quality_closed_loop_complete',
      label: '反馈、回写、索引、审计和自动化预览均完成',
      passed: Boolean(
        quality.closed_loop_complete
        && quality.feedback_complete
        && quality.writeback_complete
        && quality.index_rebuild_complete
        && quality.audit_complete
        && quality.intake_readiness_complete
        && quality.automation_preview_complete
        && quality.platform_dry_run_connector_complete
        && quality.real_execution_allowed === false
      ),
      evidence: [
        `closed_loop_complete=${quality.closed_loop_complete}`,
        `feedback_complete=${quality.feedback_complete}`,
        `writeback_complete=${quality.writeback_complete}`,
        `index_rebuild_complete=${quality.index_rebuild_complete}`,
        `audit_complete=${quality.audit_complete}`,
        `intake_readiness_complete=${quality.intake_readiness_complete}`,
        `automation_preview_complete=${quality.automation_preview_complete}`,
        `platform_dry_run_connector_complete=${quality.platform_dry_run_connector_complete}`,
        `real_execution_allowed=${quality.real_execution_allowed}`
      ]
    }),
    makeCheck({
      check_id: 'real_user_review_and_optimization_present',
      label: '真实用户视角回顾和二次优化已按总目标进入输出',
      passed: Boolean(
        hasCompleteRealUserReview(summary.real_user_review)
        && hasCompleteOptimizationResult(summary.optimization_result)
        && quality.real_user_review_complete === true
        && quality.optimization_result_complete === true
        && summary.user_test_review?.gate_decision
        && summary.second_pass_optimization?.optimization_id
      ),
      evidence: [
        `real_user_review=${summary.real_user_review?.conclusion ?? 'missing'}`,
        `reviewer=${summary.real_user_review?.reviewer_persona ?? 'missing'}`,
        `review_checks=${summary.real_user_review?.checks?.length ?? 0}`,
        `total_goal=${summary.real_user_review?.total_goal ? 'present' : 'missing'}`,
        `app_scene=${summary.real_user_review?.app_scene ? 'present' : 'missing'}`,
        `optimization_changes=${summary.optimization_result?.applied_changes?.length ?? 0}`,
        `quality_real_user_review_complete=${quality.real_user_review_complete}`,
        `quality_optimization_result_complete=${quality.optimization_result_complete}`,
        `user_test_gate=${summary.user_test_review?.gate_decision ?? 'missing'}`,
        `second_pass=${summary.second_pass_optimization?.optimization_id ?? 'missing'}`
      ]
    }),
    makeCheck({
      check_id: 'report_contracts_present',
      label: '最新应用内报告页包含闭环、专项反馈和二次优化契约',
      passed: Boolean(
        latestReportPath
        && reportHtml.includes('data-report-contract="mvp_run_report.v1"')
        && reportHtml.includes('data-user-feedback-contract="mvp_user_feedback.v1"')
        && reportHtml.includes('可执行草稿')
        && reportHtml.includes('人工确认清单')
        && reportHtml.includes('总目标')
        && reportHtml.includes('应用场景')
        && reportHtml.includes('专项测试反馈')
        && reportHtml.includes('二次优化')
        && !reportHtml.includes('<script')
      ),
      evidence: [
        `report=${reportRelativePath ?? 'missing'}`,
        `has_report_contract=${reportHtml.includes('data-report-contract="mvp_run_report.v1"')}`,
        `has_feedback_contract=${reportHtml.includes('data-user-feedback-contract="mvp_user_feedback.v1"')}`,
        `has_script=${reportHtml.includes('<script')}`
      ]
    }),
    makeCheck({
      check_id: 'state_residue_absent',
      label: '状态目录没有残留 lock 或 tmp 文件',
      passed: hasNoStateResidue(stateDir),
      evidence: [`state_dir=${relativeOrNull(root, stateDir) ?? stateDir}`]
    }),
    makeCheck({
      check_id: 'process_tree_open_items_are_expansion_not_blockers',
      label: '流程树中剩余未关闭项属于扩大试点前置工作',
      severity: 'warning',
      passed: Boolean(pt003?.status === 'in_progress' && pt004?.status === 'in_progress'),
      evidence: [
        `PT-003=${pt003?.status ?? 'missing'}`,
        `PT-004=${pt004?.status ?? 'missing'}`
      ]
    }),
    makeCheck({
      check_id: 'pt011_closed',
      label: '专项反馈中的草稿和平台流程问题已关闭',
      severity: 'warning',
      passed: pt011?.status === 'closed',
      evidence: [`PT-011=${pt011?.status ?? 'missing'}`]
    }),
    makeCheck({
      check_id: 'pt012_registered',
      label: 'MVP 完成度审计入口已登记到流程树',
      severity: 'warning',
      passed: pt012?.status === 'closed',
      evidence: [`PT-012=${pt012?.status ?? 'missing'}`]
    })
  ];

  const requiredFailures = checks.filter((check) => check.severity === 'required' && !check.passed);
  const warningFailures = checks.filter((check) => check.severity === 'warning' && !check.passed);
  const overallStatus = requiredFailures.length
    ? 'needs_attention'
    : openExpansionItems.length
      ? 'pilot_mvp_evidence_complete_with_open_expansion_items'
      : 'pilot_mvp_evidence_complete';

  return {
    schema_version: 'mvp_completion_audit.v1',
    audit_id: createAuditId(new Date(createdAt)),
    created_at: createdAt,
    overall_status: overallStatus,
    ready_for_user_special_testing: requiredFailures.length === 0,
    ready_to_expand_sample_or_real_connector: requiredFailures.length === 0 && openExpansionItems.length === 0,
    source: {
      root,
      status_path: relativeOrNull(root, statusPath),
      process_tree_path: relativeOrNull(root, processTreePath),
      report_path: reportRelativePath,
      run_id: summary.run_id ?? status.last_run?.run_id ?? null,
      workflow: summary.workflow ?? null
    },
    checks,
    required_failures: requiredFailures.map((check) => check.check_id),
    warning_failures: warningFailures.map((check) => check.check_id),
    open_expansion_items: openExpansionItems,
    continue_when: [
      'required_failures 为空',
      '用户专项测试评分达到继续阈值',
      '真实样本替换后 semantic_coverage 仍不低于 0.7',
      '真实平台预览仍保持发送前阻断'
    ],
    stop_or_adjust_when: [
      '任一 required check 失败',
      '状态上报出现不可重建错误',
      '真实样本导入后关键线索召回率连续 2 轮低于 70%',
      '自动化预览连续失败 3 次',
      '单个客户试点超过 1 小时仍无法闭环'
    ],
    recommended_next_actions: requiredFailures.length
      ? requiredFailures.map((check) => `fix:${check.check_id}`)
      : openExpansionItems.map((issue) => issue.next_action).filter(Boolean)
  };
}

function markdownTableRows(audit) {
  return audit.checks
    .map((check) => `| ${check.check_id} | ${check.severity} | ${check.status} | ${check.label} |`)
    .join('\n');
}

function renderAuditMarkdown(audit) {
  return `# MVP Completion Audit

- audit_id: ${audit.audit_id}
- created_at: ${audit.created_at}
- overall_status: ${audit.overall_status}
- ready_for_user_special_testing: ${audit.ready_for_user_special_testing}
- ready_to_expand_sample_or_real_connector: ${audit.ready_to_expand_sample_or_real_connector}
- source_run_id: ${audit.source.run_id ?? 'missing'}
- source_report: ${audit.source.report_path ?? 'missing'}

## Checks

| check_id | severity | status | label |
| --- | --- | --- | --- |
${markdownTableRows(audit)}

## Open Expansion Items

${audit.open_expansion_items.length
    ? audit.open_expansion_items.map((issue) => `- ${issue.issue_id} (${issue.status}): ${issue.title}`).join('\n')
    : '- none'}

## Continue When

${audit.continue_when.map((item) => `- ${item}`).join('\n')}

## Stop Or Adjust When

${audit.stop_or_adjust_when.map((item) => `- ${item}`).join('\n')}
`;
}

export function writeMvpCompletionAudit({
  audit,
  outputDir = path.join(projectRoot(), 'runtime/audits')
} = {}) {
  if (!audit) throw new Error('audit is required');
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'mvp-completion-audit.json');
  const mdPath = path.join(outputDir, 'mvp-completion-audit.md');
  writeFileSync(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  writeFileSync(mdPath, renderAuditMarkdown(audit), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: mdPath,
    contract: audit.schema_version,
    overall_status: audit.overall_status,
    ready_for_user_special_testing: audit.ready_for_user_special_testing,
    ready_to_expand_sample_or_real_connector: audit.ready_to_expand_sample_or_real_connector
  };
}
