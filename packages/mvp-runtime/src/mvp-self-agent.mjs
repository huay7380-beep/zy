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
import {
  runMvpLoopFromPilotImport,
  writeMvpRunReport
} from './mvp-runtime.mjs';
import {
  auditMvpCompletionEvidence,
  writeMvpCompletionAudit
} from './mvp-audit.mjs';
import {
  validateProcessTreeSync,
  writeProcessTreeValidation
} from './process-tree-validation.mjs';
import {
  runMvpStressTest,
  writeMvpStressTest
} from './mvp-stress.mjs';
import {
  auditMvpObjectiveEvidence,
  writeMvpObjectiveAudit
} from './mvp-objective-audit.mjs';
import {
  evaluateMvpExternalInputReadiness,
  initializeMvpExternalInputTemplates,
  writeMvpExternalInputReadiness
} from './mvp-external-inputs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const objectiveFlow = [
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

function createPreflightId(date = new Date()) {
  return `mvp_self_agent_preflight_${date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function createInputKitId(preflightId) {
  return `mvp_external_input_kit_${preflightId.replace(/^mvp_self_agent_preflight_/, '')}`;
}

function relativeOrNull(root, filePath) {
  if (!filePath) return null;
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function readJson(filePath, fallback = null) {
  if (!filePath || !existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function latestFile(dir, fileName) {
  if (!existsSync(dir)) return null;
  const candidates = readdirSync(dir)
    .map((name) => path.join(dir, name, fileName))
    .filter((filePath) => existsSync(filePath) && statSync(filePath).isFile())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] ?? null;
}

function latestPlatformSnapshotValidation(root) {
  const filePath = latestFile(
    path.join(root, 'runtime/platform-snapshot-validations'),
    'platform-snapshot-validation.json'
  );
  const validation = readJson(filePath, null);
  return validation
    ? {
      path: filePath,
      validation
    }
    : null;
}

function makeCheck({ check_id, status, evidence = [], next_action = null }) {
  return {
    check_id,
    status,
    passed: status === 'pass',
    evidence: evidence.filter(Boolean),
    next_action
  };
}

function mapOpenItem(issue) {
  if (issue.issue_id === 'PT-003') {
    return {
      issue_id: issue.issue_id,
      node_id: issue.node_id,
      external_input_required: 'real_pilot_import_batch',
      required_materials: [
        '真实用户目标和主要对象',
        '单个客户 10 到 30 条聊天、网页或手工记录',
        '人物和关系边',
        '至少 1 条执行后反馈，若要跑完整闭环'
      ],
      validation_command: 'node scripts/validate-pilot-intake.mjs --input=<PilotImportBatch.json>',
      continue_when: [
        'required_failures 为空',
        'ready_for_closed_loop_mvp=true',
        'semantic_coverage >= 0.7'
      ],
      stop_or_adjust_when: [
        '连续 2 轮修正后关键线索召回率仍低于 70%',
        '单个客户试点耗时超过 1 小时仍无法闭环',
        '状态上报出现不可重建错误'
      ]
    };
  }

  if (issue.issue_id === 'PT-004') {
    return {
      issue_id: issue.issue_id,
      node_id: issue.node_id,
      external_input_required: 'real_test_account_platform_snapshot',
      required_materials: [
        '真实测试账号的平台页面快照 HTML',
        '与该页面对应的 AutomationPreview JSON',
        '页面必须保留草稿可见和发送阻断标记'
      ],
      validation_command: 'node scripts/validate-platform-snapshot.mjs --snapshot=<platform_snapshot.html> --preview=<automation-preview.json>',
      continue_when: [
        'ready_for_platform_dry_run=true',
        'send_blocked=true',
        'real_execution_allowed=false'
      ],
      stop_or_adjust_when: [
        '自动化预览连续失败 3 次',
        '发送阻断失效',
        '页面快照缺少草稿或契约标记'
      ]
    };
  }

  return {
    issue_id: issue.issue_id,
    node_id: issue.node_id,
    external_input_required: 'review_issue_next_action',
    required_materials: [issue.title],
    validation_command: issue.next_action ?? 'review process tree issue register',
    continue_when: ['issue status closed'],
    stop_or_adjust_when: ['issue remains in_progress without evidence']
  };
}

function buildPreflightMarkdown(preflight) {
  const checks = preflight.checks
    .map((check) => `| ${check.check_id} | ${check.status} | ${check.evidence.join('<br>')} |`)
    .join('\n');
  const externalInputs = preflight.external_inputs_required.length
    ? preflight.external_inputs_required.map((item) => [
      `### ${item.issue_id}`,
      '',
      `- node: ${item.node_id}`,
      `- required: ${item.external_input_required}`,
      `- validation: \`${item.validation_command}\``,
      `- materials: ${item.required_materials.join('；')}`,
      `- continue_when: ${item.continue_when.join('；')}`,
      `- stop_or_adjust_when: ${item.stop_or_adjust_when.join('；')}`
    ].join('\n')).join('\n\n')
    : 'none';

  return `# MVP Self-Agent Preflight

- preflight_id: ${preflight.preflight_id}
- created_at: ${preflight.created_at}
- gate_decision: ${preflight.gate_decision}
- active_run_id: ${preflight.current_cycle.run_id}
- report_path: ${preflight.current_cycle.report_path}
- audit_path: ${preflight.current_cycle.audit_path}
- process_tree_validation_path: ${preflight.current_cycle.process_tree_validation_path}
- mvp_stress_path: ${preflight.current_cycle.mvp_stress_path}
- external_input_kit_path: ${preflight.current_cycle.external_input_kit_path ?? 'pending'}
- external_input_templates_path: ${preflight.current_cycle.external_input_templates_path ?? 'pending'}
- external_input_readiness_path: ${preflight.current_cycle.external_input_readiness_path ?? 'pending'}
- objective_audit_path: ${preflight.current_cycle.objective_audit_path ?? 'pending'}

## Objective Flow

${preflight.objective_flow.map((node) => `- ${node}`).join('\n')}

## Checks

| check_id | status | evidence |
| --- | --- | --- |
${checks}

## External Inputs Required

${externalInputs}

## Next Self-Agent Sequence

${preflight.next_self_agent_sequence.map((item, index) => `${index + 1}. ${item}`).join('\n')}
`;
}

function renderExternalInputKitMarkdown(kit) {
  const rows = kit.files_to_prepare
    .map((item) => `| ${item.issue_id} | ${item.target_path} | ${item.schema_path ?? 'n/a'} | ${item.validation_command} |`)
    .join('\n');
  const gates = kit.acceptance_gates
    .map((gate) => `- ${gate}`)
    .join('\n');
  const steps = kit.handoff_sequence
    .map((step, index) => `${index + 1}. ${step}`)
    .join('\n');

  return `# MVP External Input Kit

- kit_id: ${kit.kit_id}
- created_at: ${kit.created_at}
- source_preflight_id: ${kit.source_preflight_id}
- purpose: ${kit.purpose}

## Files To Prepare

| issue_id | target_path | schema_path | validation_command |
| --- | --- | --- | --- |
${rows}

## Acceptance Gates

${gates}

## Handoff Sequence

${steps}
`;
}

export function buildMvpExternalInputKit({
  root = projectRoot(),
  preflight,
  pilotTemplatePath = path.join(root, 'examples/pilot-import-batch.sample.json'),
  platformSnapshotTemplatePath = path.join(root, 'examples/platform-snapshot.sample.html'),
  platformPreviewTemplatePath = path.join(root, 'examples/platform-snapshot-preview.sample.json')
} = {}) {
  if (!preflight) throw new Error('buildMvpExternalInputKit requires preflight');

  const createdAt = nowIso();
  const inputRoot = 'runtime/user-inputs';
  const openItems = preflight.external_inputs_required.map((item) => item.issue_id);

  return {
    schema_version: 'mvp_external_input_kit.v1',
    kit_id: createInputKitId(preflight.preflight_id),
    created_at: createdAt,
    source_preflight_id: preflight.preflight_id,
    purpose: 'Collect the minimum real pilot materials needed to move from local MVP evidence to user special testing and sample expansion.',
    open_items: openItems,
    files_to_prepare: [
      {
        issue_id: 'PT-003',
        target_path: `${inputRoot}/pilot-import.real.json`,
        source_template: relativeOrNull(root, pilotTemplatePath) ?? pilotTemplatePath,
        schema_path: 'schemas/pilot-import-batch.schema.json',
        required_content: [
          'one real user goal and primary target person',
          'one target customer or contact for the first pilot',
          '10 to 30 raw chat, web or manual records for that target',
          'people and relationship edges referenced by the records',
          'at least one post-action FeedbackRecord for full closed-loop MVP'
        ],
        validation_command: `node scripts/validate-pilot-intake.mjs --input=${inputRoot}/pilot-import.real.json`,
        continue_when: [
          'pilot_intake_readiness.v1.required_failures is empty',
          'ready_for_closed_loop_mvp=true',
          'semantic_coverage >= 0.7'
        ],
        stop_or_adjust_when: [
          'two correction rounds still keep key clue recall below 70%',
          'one customer pilot cannot close within 1 hour',
          'state reporting produces an unrebuildable error'
        ]
      },
      {
        issue_id: 'PT-004',
        target_path: `${inputRoot}/platform-snapshot.real.html`,
        companion_preview_path: `${inputRoot}/platform-snapshot-preview.real.json`,
        source_template: relativeOrNull(root, platformSnapshotTemplatePath) ?? platformSnapshotTemplatePath,
        companion_preview_template: relativeOrNull(root, platformPreviewTemplatePath) ?? platformPreviewTemplatePath,
        schema_path: 'schemas/platform-snapshot-validation.schema.json',
        required_content: [
          'saved HTML from a real test-account platform page or controlled web preview',
          'matching AutomationPreview JSON for that page',
          'visible message draft content',
          'send action blocked before user confirmation',
          'real_execution_allowed=false'
        ],
        validation_command: `node scripts/validate-platform-snapshot.mjs --snapshot=${inputRoot}/platform-snapshot.real.html --preview=${inputRoot}/platform-snapshot-preview.real.json`,
        continue_when: [
          'platform_snapshot_validation.v1.ready_for_platform_dry_run=true',
          'send_blocked=true',
          'real_execution_allowed=false'
        ],
        stop_or_adjust_when: [
          'automation preview fails 3 consecutive times',
          'send blocking fails',
          'snapshot lacks draft or contract markers'
        ]
      }
    ].filter((item) => openItems.includes(item.issue_id)),
    acceptance_gates: [
      'PT-003 can continue only after pilot readiness required_failures is empty.',
      'PT-004 can continue only after platform snapshot validation proves send_blocked=true and real_execution_allowed=false.',
      'Copied sample/template files under runtime/user-inputs are not accepted as real materials.',
      'After either real input is supplied, rerun npm run mvp:self-agent, then npm run mvp:audit, then npm run stress:mvp.'
    ],
    handoff_sequence: [
      `Create ${inputRoot} if it does not exist.`,
      'Copy the relevant sample file into the target_path listed above and replace sample content with real test material.',
      'Do not submit unmodified examples or .template files; readiness will return needs_attention.',
      'Run the validation_command for each prepared file.',
      'If validation passes, rerun npm run mvp:self-agent to refresh the local closed loop and the Obsidian process tree evidence.',
      'Keep PT-003 and PT-004 open until real materials, validation reports and MVP audit evidence all pass.'
    ],
    source: {
      current_gate_decision: preflight.gate_decision,
      current_required_failures: preflight.required_failures,
      current_report_path: preflight.current_cycle.report_path,
      current_audit_path: preflight.current_cycle.audit_path,
      current_stress_path: preflight.current_cycle.mvp_stress_path
    }
  };
}

export function writeMvpExternalInputKit({
  kit,
  outputDir = path.join(projectRoot(), 'runtime/input-kits', kit?.kit_id ?? createInputKitId(createPreflightId()))
} = {}) {
  if (!kit) throw new Error('writeMvpExternalInputKit requires kit');
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'mvp-external-input-kit.json');
  const markdownPath = path.join(outputDir, 'mvp-external-input-kit.md');
  writeFileSync(jsonPath, `${JSON.stringify(kit, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderExternalInputKitMarkdown(kit), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath,
    contract: kit.schema_version,
    kit_id: kit.kit_id
  };
}

export function buildMvpSelfAgentPreflight({
  root = projectRoot(),
  result,
  report,
  audit,
  auditWritten,
  processTreeValidation = null,
  processTreeValidationWritten = null,
  stress = null,
  stressWritten = null,
  platformSnapshotValidation = latestPlatformSnapshotValidation(root),
  importPath = 'examples/pilot-import-batch.sample.json',
  userFeedbackPath = 'examples/mvp-user-feedback.sample.json'
} = {}) {
  if (!result) throw new Error('buildMvpSelfAgentPreflight requires result');
  if (!report) throw new Error('buildMvpSelfAgentPreflight requires report');
  if (!audit) throw new Error('buildMvpSelfAgentPreflight requires audit');

  const auditRequiredFailures = audit.required_failures ?? [];
  const processTreeRequiredFailures = processTreeValidation?.required_failures ?? [];
  const stressRequiredFailures = stress?.hard_exit_signals ?? ['mvp_stress_missing'];
  const requiredFailures = [
    ...auditRequiredFailures,
    ...processTreeRequiredFailures,
    ...stressRequiredFailures
  ];
  const externalInputs = (audit.open_expansion_items ?? []).map(mapOpenItem);
  const platformValidation = platformSnapshotValidation?.validation ?? null;
  const createdAt = nowIso();
  const gateDecision = requiredFailures.length
    ? 'fix_required_before_user_testing'
    : externalInputs.length
      ? 'local_mvp_ready_waiting_external_inputs'
      : 'ready_to_expand_sample_or_real_connector';

  const checks = [
    makeCheck({
      check_id: 'self_agent_cycle_ran_import_loop',
      status: result.workflow === 'mvp_loop_from_pilot_import' ? 'pass' : 'fail',
      evidence: [
        `workflow=${result.workflow}`,
        `run_id=${result.run_id}`,
        `import_path=${importPath}`
      ]
    }),
    makeCheck({
      check_id: 'self_agent_report_written',
      status: report.contract === 'mvp_run_report.v1' && report.bytes > 1000 ? 'pass' : 'fail',
      evidence: [
        `contract=${report.contract}`,
        `bytes=${report.bytes}`,
        `report=${relativeOrNull(root, report.file_path)}`
      ]
    }),
    makeCheck({
      check_id: 'self_agent_completion_audit_passed',
      status: auditRequiredFailures.length === 0 ? 'pass' : 'fail',
      evidence: [
        `overall_status=${audit.overall_status}`,
        `required_failures=${auditRequiredFailures.join(',') || 'none'}`,
        `audit=${relativeOrNull(root, auditWritten?.json_path)}`
      ]
    }),
    makeCheck({
      check_id: 'self_agent_process_tree_sync_passed',
      status: processTreeValidation?.gate_decision === 'process_tree_synced'
        && processTreeRequiredFailures.length === 0
        ? 'pass'
        : 'fail',
      evidence: [
        `gate_decision=${processTreeValidation?.gate_decision ?? 'missing'}`,
        `required_failures=${processTreeRequiredFailures.join(',') || 'none'}`,
        `validation=${relativeOrNull(root, processTreeValidationWritten?.json_path)}`
      ],
      next_action: 'Run npm run process-tree:validate after process-tree, issue-register, artifact-registry or Obsidian view changes.'
    }),
    makeCheck({
      check_id: 'self_agent_mvp_stress_passed',
      status: stress?.gate_decision === 'stress_passed_continue_to_user_materials'
        && (stress?.hard_exit_signals ?? []).length === 0
        ? 'pass'
        : 'fail',
      evidence: [
        `gate_decision=${stress?.gate_decision ?? 'missing'}`,
        `runs=${stress?.runs ?? 'missing'}`,
        `success=${stress?.success ?? 'missing'}`,
        `failed=${stress?.failed ?? 'missing'}`,
        `hard_exit_signals=${(stress?.hard_exit_signals ?? []).join(',') || 'none'}`,
        `stress=${relativeOrNull(root, stressWritten?.json_path)}`
      ],
      next_action: 'Run npm run stress:mvp before expanding sample size or automation preview testing.'
    }),
    makeCheck({
      check_id: 'self_agent_real_user_review_present',
      status: result.real_user_review?.conclusion && result.optimization_result?.optimized_user_next_step ? 'pass' : 'fail',
      evidence: [
        `real_user_review=${result.real_user_review?.conclusion ?? 'missing'}`,
        `optimization=${result.optimization_result?.optimization_id ?? 'missing'}`
      ]
    }),
    makeCheck({
      check_id: 'self_agent_platform_snapshot_sample_valid',
      status: platformValidation?.ready_for_platform_dry_run === true
        && platformValidation?.check?.send_blocked === true
        && platformValidation?.check?.real_execution_allowed === false
        ? 'pass'
        : 'warn',
      evidence: [
        `validation=${relativeOrNull(root, platformSnapshotValidation?.path) ?? 'missing'}`,
        `ready_for_platform_dry_run=${platformValidation?.ready_for_platform_dry_run}`,
        `send_blocked=${platformValidation?.check?.send_blocked}`,
        `real_execution_allowed=${platformValidation?.check?.real_execution_allowed}`
      ],
      next_action: 'Run npm run platform:snapshot:validate before real platform snapshot testing.'
    })
  ];

  return {
    schema_version: 'mvp_self_agent_preflight.v1',
    preflight_id: createPreflightId(new Date(createdAt)),
    created_at: createdAt,
    objective: '完整 MVP 闭环自代理预检与下一步外部材料安排',
    objective_flow: objectiveFlow,
    gate_decision: gateDecision,
    current_cycle: {
      import_path: relativeOrNull(root, path.resolve(importPath)) ?? importPath,
      user_feedback_path: relativeOrNull(root, path.resolve(userFeedbackPath)) ?? userFeedbackPath,
      workflow: result.workflow,
      run_id: result.run_id,
      report_path: relativeOrNull(root, report.file_path),
      audit_path: relativeOrNull(root, auditWritten?.json_path),
      process_tree_validation_path: relativeOrNull(root, processTreeValidationWritten?.json_path),
      mvp_stress_path: relativeOrNull(root, stressWritten?.json_path),
      external_input_kit_path: null,
      external_input_templates_path: null,
      external_input_readiness_path: null,
      objective_audit_path: null,
      ready_for_user_special_testing: audit.ready_for_user_special_testing,
      ready_to_expand_sample_or_real_connector: audit.ready_to_expand_sample_or_real_connector
    },
    checks,
    required_failures: checks.filter((check) => check.status === 'fail').map((check) => check.check_id),
    external_inputs_required: externalInputs,
    next_self_agent_sequence: [
      'Run npm run mvp:self-agent after each implementation or document change.',
      'If PT-003 material is provided, run pilot:validate, then mvp:import or mvp:feedback-report.',
      'If PT-004 material is provided, run validate-platform-snapshot with the real test-account snapshot.',
      'Run npm run mvp:audit and continue only when required_failures is empty.',
      'Run npm run process-tree:validate and continue only when required_failures is empty.',
      'Run npm run stress:mvp and continue only when hard_exit_signals is empty.',
      'Keep Obsidian Markdown and Canvas synchronized when process tree status changes.'
    ],
    evidence: {
      message_draft: result.message_draft?.draft ?? null,
      real_user_review_conclusion: result.real_user_review?.conclusion ?? null,
      optimization_next_step: result.optimization_result?.optimized_user_next_step ?? null,
      process_tree_validation_gate: processTreeValidation?.gate_decision ?? null,
      mvp_stress_gate: stress?.gate_decision ?? null,
      external_input_kit_path: null,
      external_input_templates_path: null,
      external_input_readiness_path: null,
      objective_audit_path: null,
      open_expansion_items: audit.open_expansion_items?.map((item) => item.issue_id) ?? []
    }
  };
}

export function writeMvpSelfAgentPreflight({
  preflight,
  outputDir = path.join(projectRoot(), 'runtime/self-agent-preflights', preflight?.preflight_id ?? createPreflightId())
} = {}) {
  if (!preflight) throw new Error('writeMvpSelfAgentPreflight requires preflight');
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'mvp-self-agent-preflight.json');
  const mdPath = path.join(outputDir, 'mvp-self-agent-preflight.md');
  writeFileSync(jsonPath, `${JSON.stringify(preflight, null, 2)}\n`, 'utf8');
  writeFileSync(mdPath, buildPreflightMarkdown(preflight), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: mdPath,
    contract: preflight.schema_version,
    gate_decision: preflight.gate_decision
  };
}

export function runMvpSelfAgentCycle({
  root = projectRoot(),
  importPath = path.join(root, 'examples/pilot-import-batch.sample.json'),
  userFeedbackPath = path.join(root, 'examples/mvp-user-feedback.sample.json'),
  reportDir = path.join(root, 'runtime/mvp-reports'),
  auditDir = path.join(root, 'runtime/audits'),
  outputDir = null,
  processTreePath = path.join(root, 'examples/system-process-tree.json'),
  processTreeValidationRoot = null,
  processTreeValidationDir = path.join(root, 'runtime/process-tree-validations'),
  stressRuns = 2,
  stressDir = path.join(root, 'runtime/mvp-stress-tests')
} = {}) {
  const userTestFeedback = readJson(userFeedbackPath, null);
  const result = runMvpLoopFromPilotImport({
    root,
    importPath,
    userTestFeedback
  });
  const report = writeMvpRunReport({ result, outputDir: reportDir });
  const audit = auditMvpCompletionEvidence({
    root,
    reportPath: report.file_path,
    processTreePath
  });
  const auditWritten = writeMvpCompletionAudit({ audit, outputDir: auditDir });
  const treeRoot = processTreeValidationRoot
    ?? (existsSync(path.join(root, 'views/obsidian/system-process-tree.md')) ? root : projectRoot());
  const processTreeValidation = validateProcessTreeSync({
    root: treeRoot,
    processTreePath
  });
  const processTreeValidationWritten = writeProcessTreeValidation({
    validation: processTreeValidation,
    outputDir: path.join(processTreeValidationDir, processTreeValidation.validation_id)
  });
  const stress = runMvpStressTest({
    workspaceRoot: treeRoot,
    runs: stressRuns,
    importPath,
    userFeedbackPath,
    processTreePath,
    outputDir: path.join(stressDir, 'self-agent-preflight-workspace')
  });
  const stressWritten = writeMvpStressTest({
    stress,
    outputDir: path.join(stressDir, stress.stress_id)
  });
  const preflight = buildMvpSelfAgentPreflight({
    root,
    result,
    report,
    audit,
    auditWritten,
    processTreeValidation,
    processTreeValidationWritten,
    stress,
    stressWritten,
    importPath,
    userFeedbackPath
  });
  const inputKit = buildMvpExternalInputKit({
    root,
    preflight,
    pilotTemplatePath: importPath,
    platformSnapshotTemplatePath: path.join(treeRoot, 'examples/platform-snapshot.sample.html'),
    platformPreviewTemplatePath: path.join(treeRoot, 'examples/platform-snapshot-preview.sample.json')
  });
  const inputKitWritten = writeMvpExternalInputKit({
    kit: inputKit,
    outputDir: path.join(root, 'runtime/input-kits', inputKit.kit_id)
  });
  const inputTemplates = initializeMvpExternalInputTemplates({
    root,
    inputKitPath: inputKitWritten.json_path,
    inputKit
  });
  const inputReadiness = evaluateMvpExternalInputReadiness({
    root,
    inputKitPath: inputKitWritten.json_path,
    inputKit
  });
  const inputReadinessWritten = writeMvpExternalInputReadiness({
    readiness: inputReadiness,
    outputDir: path.join(root, 'runtime/input-readiness', inputReadiness.readiness_id)
  });
  preflight.current_cycle.external_input_kit_path = relativeOrNull(root, inputKitWritten.json_path);
  preflight.current_cycle.external_input_templates_path = relativeOrNull(root, inputTemplates.written.json_path);
  preflight.current_cycle.external_input_readiness_path = relativeOrNull(root, inputReadinessWritten.json_path);
  preflight.evidence.external_input_kit_path = preflight.current_cycle.external_input_kit_path;
  preflight.evidence.external_input_templates_path = preflight.current_cycle.external_input_templates_path;
  preflight.evidence.external_input_readiness_path = preflight.current_cycle.external_input_readiness_path;
  preflight.checks.push(makeCheck({
    check_id: 'self_agent_external_input_templates_written',
    status: inputTemplates.init.templates.length > 0
      && inputTemplates.init.templates.every((item) => item.source_found)
      && existsSync(inputTemplates.written.json_path)
      && existsSync(inputTemplates.written.readme_path)
      ? 'pass'
      : 'fail',
    evidence: [
      `templates=${inputTemplates.init.templates.length}`,
      `missing_sources=${inputTemplates.init.templates.filter((item) => !item.source_found).map((item) => item.source_template).join(',') || 'none'}`,
      `template_report=${preflight.current_cycle.external_input_templates_path}`,
      `templates_dir=${relativeOrNull(root, inputTemplates.written.templates_dir)}`,
      `real_targets_present=${inputTemplates.init.target_files_intentionally_not_written.filter(
        (filePath) => existsSync(path.join(root, filePath))
      ).join(',') || 'none'}`
    ],
    next_action: 'Use generated .template files only as references; prepare real files under runtime/user-inputs and rerun npm run mvp:inputs:check.'
  }));
  preflight.required_failures = preflight.checks
    .filter((check) => check.status === 'fail')
    .map((check) => check.check_id);
  if (preflight.required_failures.length) {
    preflight.gate_decision = 'fix_required_before_user_testing';
  }
  const written = writeMvpSelfAgentPreflight({
    preflight,
    outputDir: outputDir ?? path.join(root, 'runtime/self-agent-preflights', preflight.preflight_id)
  });
  const objectiveAudit = auditMvpObjectiveEvidence({
    root,
    preflightPath: written.json_path,
    completionAuditPath: auditWritten.json_path
  });
  const objectiveAuditWritten = writeMvpObjectiveAudit({
    audit: objectiveAudit,
    outputDir: path.join(root, 'runtime/objective-audits', objectiveAudit.audit_id)
  });
  preflight.current_cycle.objective_audit_path = relativeOrNull(root, objectiveAuditWritten.json_path);
  preflight.evidence.objective_audit_path = preflight.current_cycle.objective_audit_path;
  const finalWritten = writeMvpSelfAgentPreflight({
    preflight,
    outputDir: outputDir ?? path.join(root, 'runtime/self-agent-preflights', preflight.preflight_id)
  });

  return {
    result,
    report,
    audit,
    audit_written: auditWritten,
    process_tree_validation: processTreeValidation,
    process_tree_validation_written: processTreeValidationWritten,
    stress,
    stress_written: stressWritten,
    input_kit: inputKit,
    input_kit_written: inputKitWritten,
    input_templates: inputTemplates.init,
    input_templates_written: inputTemplates.written,
    input_readiness: inputReadiness,
    input_readiness_written: inputReadinessWritten,
    objective_audit: objectiveAudit,
    objective_audit_written: objectiveAuditWritten,
    preflight,
    written: finalWritten
  };
}
