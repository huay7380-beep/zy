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

const objectiveText = '根据修订过的流程树目标安排自代理，完成用户目标-人物关系-事件记录-决策建议-触发计划-反馈-回写-索引-审计的 MVP 闭环，并从真实用户目标角度回顾后优化。';

const expectedFlow = [
  'user_goal',
  'relationship_context',
  'event_recording',
  'decision_recommendation',
  'trigger_plan',
  'platform_snapshot_validation',
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

function createObjectiveAuditId(date = new Date()) {
  return `mvp_objective_audit_${date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function readJson(filePath, fallback = null) {
  if (!filePath || !existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
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

function latestNestedFile(dir, fileName) {
  if (!existsSync(dir)) return null;
  const candidates = readdirSync(dir)
    .map((name) => path.join(dir, name, fileName))
    .filter((filePath) => existsSync(filePath) && statSync(filePath).isFile())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] ?? null;
}

function newestExistingFile(...filePaths) {
  const candidates = filePaths
    .filter((filePath) => filePath && existsSync(filePath) && statSync(filePath).isFile())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] ?? null;
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

function makeCheck({
  check_id,
  label,
  passed,
  severity = 'required',
  evidence = [],
  next_action = null
}) {
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

function checkPassed(checks, checkId) {
  return checks?.some((check) => check.check_id === checkId && check.passed) ?? false;
}

function existingPathEvidence(root, paths) {
  return paths.map((item) => {
    const absolute = resolveFromRoot(root, item);
    return `${item ?? 'missing'}=${absolute ? existsSync(absolute) : false}`;
  });
}

function objectiveMarkdown(audit) {
  const rows = audit.checks
    .map((check) => `| ${check.check_id} | ${check.severity} | ${check.status} | ${check.label} |`)
    .join('\n');
  const external = audit.external_input_status.required_failures.length
    ? audit.external_input_status.required_failures.map((item) => `- ${item}`).join('\n')
    : '- none';

  return `# MVP Objective Audit

- audit_id: ${audit.audit_id}
- created_at: ${audit.created_at}
- objective_status: ${audit.objective_status}
- ready_for_user_special_testing: ${audit.ready_for_user_special_testing}
- ready_to_expand_sample_or_real_connector: ${audit.ready_to_expand_sample_or_real_connector}

## Objective

${audit.objective}

## Checks

| check_id | severity | status | label |
| --- | --- | --- | --- |
${rows}

## External Input Status

- gate_decision: ${audit.external_input_status.gate_decision}
- ready_for_real_input_trial: ${audit.external_input_status.ready_for_real_input_trial}
- required_failures:
${external}

## Next Actions

${audit.next_actions.map((item) => `- ${item}`).join('\n')}
`;
}

export function auditMvpObjectiveEvidence({
  root = projectRoot(),
  preflightPath = null,
  completionAuditPath = path.join(root, 'runtime/audits/mvp-completion-audit.json')
} = {}) {
  const createdAt = nowIso();
  const finalPreflightPath = preflightPath
    ?? latestNestedFile(path.join(root, 'runtime/self-agent-preflights'), 'mvp-self-agent-preflight.json');
  const preflight = readJson(finalPreflightPath, {});
  const completionAudit = readJson(completionAuditPath, {});
  const cycle = preflight.current_cycle ?? {};
  const processTreeValidationPath = resolveFromRoot(root, cycle.process_tree_validation_path);
  const stressPath = resolveFromRoot(root, cycle.mvp_stress_path);
  const inputKitPath = resolveFromRoot(root, cycle.external_input_kit_path);
  const inputTemplatesPath = resolveFromRoot(root, cycle.external_input_templates_path);
  const selfAgentInputReadinessPath = resolveFromRoot(root, cycle.external_input_readiness_path);
  const latestInputReadinessPath = latestNestedFile(
    path.join(root, 'runtime/input-readiness'),
    'mvp-external-input-readiness.json'
  );
  const inputReadinessPath = newestExistingFile(latestInputReadinessPath, selfAgentInputReadinessPath);
  const realInputTrialPath = latestNestedFile(path.join(root, 'runtime/real-input-trials'), 'mvp-real-input-trial.json');
  const processTreeValidation = readJson(processTreeValidationPath, {});
  const stress = readJson(stressPath, {});
  const inputKit = readJson(inputKitPath, {});
  const inputTemplates = readJson(inputTemplatesPath, {});
  const inputReadiness = readJson(inputReadinessPath, {});
  const realInputTrial = readJson(realInputTrialPath, {});
  const realInputTrialReady = Boolean(
    realInputTrial.schema_version === 'mvp_real_input_trial.v1'
    && realInputTrial.ready_for_issue_register_review === true
    && (realInputTrial.required_failures ?? []).length === 0
  );

  const requiredArtifactPaths = [
    cycle.report_path,
    cycle.audit_path,
    cycle.process_tree_validation_path,
    cycle.mvp_stress_path,
    cycle.external_input_kit_path,
    cycle.external_input_templates_path,
    cycle.external_input_readiness_path
  ];

  const checks = [
    makeCheck({
      check_id: 'objective_flow_matches_revised_process_tree',
      label: '自代理目标流覆盖修订后的主流程树闭环',
      passed: includesAllInOrder(preflight.objective_flow, expectedFlow),
      evidence: [`objective_flow=${(preflight.objective_flow ?? []).join(' -> ')}`]
    }),
    makeCheck({
      check_id: 'mvp_completion_audit_passed',
      label: 'MVP 完成度审计证明闭环、真实用户回顾和优化结果完整',
      passed: completionAudit.schema_version === 'mvp_completion_audit.v1'
        && completionAudit.ready_for_user_special_testing === true
        && (completionAudit.required_failures ?? []).length === 0
        && checkPassed(completionAudit.checks, 'real_user_review_and_optimization_present')
        && checkPassed(completionAudit.checks, 'quality_closed_loop_complete'),
      evidence: [
        `schema_version=${completionAudit.schema_version ?? 'missing'}`,
        `ready_for_user_special_testing=${completionAudit.ready_for_user_special_testing}`,
        `required_failures=${(completionAudit.required_failures ?? []).join(',') || 'none'}`,
        `real_user_review_and_optimization_present=${checkPassed(completionAudit.checks, 'real_user_review_and_optimization_present')}`,
        `quality_closed_loop_complete=${checkPassed(completionAudit.checks, 'quality_closed_loop_complete')}`
      ]
    }),
    makeCheck({
      check_id: 'self_agent_preflight_passed',
      label: '自代理预检已按流程树安排闭环、输入包、模板和就绪检查',
      passed: preflight.schema_version === 'mvp_self_agent_preflight.v1'
        && preflight.gate_decision === 'local_mvp_ready_waiting_external_inputs'
        && (preflight.required_failures ?? []).length === 0
        && checkPassed(preflight.checks, 'self_agent_external_input_templates_written')
        && checkPassed(preflight.checks, 'self_agent_mvp_stress_passed')
        && checkPassed(preflight.checks, 'self_agent_process_tree_sync_passed'),
      evidence: [
        `schema_version=${preflight.schema_version ?? 'missing'}`,
        `gate_decision=${preflight.gate_decision ?? 'missing'}`,
        `required_failures=${(preflight.required_failures ?? []).join(',') || 'none'}`,
        `templates_written=${checkPassed(preflight.checks, 'self_agent_external_input_templates_written')}`,
        `stress_passed=${checkPassed(preflight.checks, 'self_agent_mvp_stress_passed')}`,
        `process_tree_sync_passed=${checkPassed(preflight.checks, 'self_agent_process_tree_sync_passed')}`
      ]
    }),
    makeCheck({
      check_id: 'runtime_artifacts_exist',
      label: '自代理当前周期关键运行产物均可被外部读取',
      passed: requiredArtifactPaths.every((item) => {
        const absolute = resolveFromRoot(root, item);
        return absolute && existsSync(absolute);
      }),
      evidence: existingPathEvidence(root, requiredArtifactPaths)
    }),
    makeCheck({
      check_id: 'process_tree_validation_passed',
      label: '流程树、文档和 Obsidian 显化结构同步通过',
      passed: processTreeValidation.schema_version === 'process_tree_validation.v1'
        && processTreeValidation.gate_decision === 'process_tree_synced'
        && (processTreeValidation.required_failures ?? []).length === 0,
      evidence: [
        `schema_version=${processTreeValidation.schema_version ?? 'missing'}`,
        `gate_decision=${processTreeValidation.gate_decision ?? 'missing'}`,
        `required_failures=${(processTreeValidation.required_failures ?? []).join(',') || 'none'}`
      ]
    }),
    makeCheck({
      check_id: 'full_chain_stress_passed',
      label: 'MVP 全链路压力测试通过且没有硬退出信号',
      passed: stress.schema_version === 'mvp_stress_test.v1'
        && stress.gate_decision === 'stress_passed_continue_to_user_materials'
        && (stress.hard_exit_signals ?? []).length === 0
        && Number(stress.success ?? 0) === Number(stress.runs ?? -1),
      evidence: [
        `schema_version=${stress.schema_version ?? 'missing'}`,
        `gate_decision=${stress.gate_decision ?? 'missing'}`,
        `runs=${stress.runs ?? 'missing'}`,
        `success=${stress.success ?? 'missing'}`,
        `hard_exit_signals=${(stress.hard_exit_signals ?? []).join(',') || 'none'}`
      ]
    }),
    makeCheck({
      check_id: 'external_input_handoff_complete',
      label: '外部真实材料交接包、安全模板和就绪报告齐全',
      passed: inputKit.schema_version === 'mvp_external_input_kit.v1'
        && inputTemplates.schema_version === 'mvp_external_input_templates.v1'
        && inputReadiness.schema_version === 'mvp_external_input_readiness.v1'
        && (inputKit.files_to_prepare ?? []).length >= 2
        && (inputTemplates.templates ?? []).length >= 3
        && (inputReadiness.item_results ?? []).length >= 2,
      evidence: [
        `input_kit=${inputKit.schema_version ?? 'missing'}`,
        `input_templates=${inputTemplates.schema_version ?? 'missing'}`,
        `input_readiness=${inputReadiness.schema_version ?? 'missing'}`,
        `files_to_prepare=${inputKit.files_to_prepare?.length ?? 0}`,
        `templates=${inputTemplates.templates?.length ?? 0}`,
        `item_results=${inputReadiness.item_results?.length ?? 0}`
      ]
    }),
    makeCheck({
      check_id: 'real_external_inputs_ready',
      label: '真实试点样本和真实平台快照已准备好进入扩大试点',
      severity: 'expansion',
      passed: inputReadiness.ready_for_real_input_trial === true
        && (inputReadiness.required_failures ?? []).length === 0,
      evidence: [
        `gate_decision=${inputReadiness.gate_decision ?? 'missing'}`,
        `ready_for_real_input_trial=${inputReadiness.ready_for_real_input_trial}`,
        `required_failures=${(inputReadiness.required_failures ?? []).join(',') || 'none'}`
      ],
      next_action: 'Prepare PT-003 and PT-004 real target files under runtime/user-inputs, then rerun npm run mvp:inputs:check and npm run mvp:self-agent.'
    }),
    makeCheck({
      check_id: 'real_input_trial_passed',
      label: '真实材料 ready 后已完成受控 MVP 试跑',
      severity: 'expansion',
      passed: inputReadiness.ready_for_real_input_trial !== true
        || realInputTrialReady,
      evidence: [
        `input_ready=${inputReadiness.ready_for_real_input_trial === true}`,
        `trial_path=${relativeOrNull(root, realInputTrialPath) ?? 'missing'}`,
        `schema_version=${realInputTrial.schema_version ?? 'missing'}`,
        `ready_for_issue_register_review=${realInputTrial.ready_for_issue_register_review}`,
        `required_failures=${(realInputTrial.required_failures ?? []).join(',') || 'none'}`
      ],
      next_action: 'After PT-003 and PT-004 are ready, run npm run mvp:real-trial and continue only when ready_for_issue_register_review=true.'
    }),
    makeCheck({
      check_id: 'issue_register_open_items_resolved',
      label: '真实试跑通过后 PT-003/PT-004 问题台账已复核关闭或更新',
      severity: 'expansion',
      passed: !realInputTrialReady
        || (completionAudit.open_expansion_items ?? []).length === 0,
      evidence: [
        `real_input_trial_ready=${realInputTrialReady}`,
        `open_expansion_items=${(completionAudit.open_expansion_items ?? []).map((item) => item.issue_id).join(',') || 'none'}`
      ],
      next_action: 'Review the real-input trial evidence, then close or update PT-003/PT-004 in the process tree before expanding samples or real connectors.'
    })
  ];

  const requiredFailures = checks
    .filter((check) => check.severity === 'required' && !check.passed)
    .map((check) => check.check_id);
  const expansionFailures = checks
    .filter((check) => check.severity === 'expansion' && !check.passed)
    .map((check) => check.check_id);
  let objectiveStatus = 'objective_ready_to_expand_sample_or_real_connector';
  if (requiredFailures.length) {
    objectiveStatus = 'objective_evidence_incomplete';
  } else if (expansionFailures.includes('real_external_inputs_ready')) {
    objectiveStatus = 'local_objective_evidence_complete_waiting_external_inputs';
  } else if (expansionFailures.includes('real_input_trial_passed')) {
    objectiveStatus = 'real_inputs_ready_waiting_real_trial';
  } else if (expansionFailures.includes('issue_register_open_items_resolved')) {
    objectiveStatus = 'real_trial_complete_waiting_issue_register_review';
  }

  return {
    schema_version: 'mvp_objective_audit.v1',
    audit_id: createObjectiveAuditId(new Date(createdAt)),
    created_at: createdAt,
    objective: objectiveText,
    objective_status: objectiveStatus,
    ready_for_user_special_testing: requiredFailures.length === 0,
    ready_to_expand_sample_or_real_connector: requiredFailures.length === 0 && expansionFailures.length === 0,
    source: {
      root,
      preflight_path: relativeOrNull(root, finalPreflightPath),
      completion_audit_path: relativeOrNull(root, completionAuditPath),
      input_readiness_path: relativeOrNull(root, inputReadinessPath),
      real_input_trial_path: relativeOrNull(root, realInputTrialPath),
      run_id: cycle.run_id ?? null,
      report_path: cycle.report_path ?? null
    },
    checks,
    required_failures: requiredFailures,
    expansion_failures: expansionFailures,
    external_input_status: {
      gate_decision: inputReadiness.gate_decision ?? 'missing',
      ready_for_real_input_trial: inputReadiness.ready_for_real_input_trial === true,
      required_failures: inputReadiness.required_failures ?? [],
      item_results: inputReadiness.item_results ?? []
    },
    continue_when: [
      'required_failures 为空',
      'mvp_completion_audit.v1 ready_for_user_special_testing=true',
      'mvp_self_agent_preflight.v1 required_failures 为空',
      'process_tree_validation.v1 required_failures 为空',
      'mvp_stress_test.v1 hard_exit_signals 为空'
    ],
    stop_or_adjust_when: [
      '任一 required check 失败',
      '自代理预检不能生成输入包、模板或就绪报告',
      '流程树与 Obsidian 显化结构不同步',
      '真实用户回顾或优化结果缺失'
    ],
    next_actions: requiredFailures.length
      ? requiredFailures.map((item) => `fix:${item}`)
      : expansionFailures.length
        ? [
          ...(expansionFailures.includes('real_external_inputs_ready')
            ? [
              '准备 runtime/user-inputs/pilot-import.real.json',
              '准备 runtime/user-inputs/platform-snapshot.real.html',
              '准备 runtime/user-inputs/platform-snapshot-preview.real.json',
              '运行 npm run mvp:inputs:check',
              '运行 npm run mvp:self-agent'
            ]
            : []),
          ...(expansionFailures.includes('real_input_trial_passed')
            ? ['运行 npm run mvp:real-trial，并确认 ready_for_issue_register_review=true']
            : []),
          ...(expansionFailures.includes('issue_register_open_items_resolved')
            ? ['复核 runtime/real-input-trials/** 证据，并更新 PT-003/PT-004 问题台账状态']
            : [])
        ]
        : [
          '扩大真实样本试点',
          '进入真实测试账号平台快照复验',
          '继续压力测试和专项用户反馈优化'
        ]
  };
}

export function writeMvpObjectiveAudit({
  audit,
  outputDir = path.join(projectRoot(), 'runtime/objective-audits', audit?.audit_id ?? createObjectiveAuditId())
} = {}) {
  if (!audit) throw new Error('writeMvpObjectiveAudit requires audit');
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'mvp-objective-audit.json');
  const markdownPath = path.join(outputDir, 'mvp-objective-audit.md');
  writeFileSync(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, objectiveMarkdown(audit), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath,
    contract: audit.schema_version,
    objective_status: audit.objective_status,
    ready_for_user_special_testing: audit.ready_for_user_special_testing,
    ready_to_expand_sample_or_real_connector: audit.ready_to_expand_sample_or_real_connector
  };
}
