import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  evaluateSendCommandForExecution,
  normalizeOutboundSendCommand,
  runSendCommandDryRun
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function nowIso() {
  return new Date().toISOString();
}

function writeJson(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function buildTemplate() {
  return {
    send_command_id: 'send_command_controlled_real_template',
    event_id: 'replace_with_raw_event_or_intake_observation_id',
    decision_id: 'replace_with_decision_id',
    trigger_id: 'replace_with_trigger_id',
    target_platform: 'wechat',
    target_person_id: 'replace_with_test_person_id',
    target_thread_hint: {
      channel: 'wechat',
      conversation_title: 'replace_with_exact_test_window_title',
      target_display_name: 'replace_with_exact_test_target_display_name',
      platform_handle: 'replace_with_test_account_or_window_handle'
    },
    message_draft: 'replace_with_exact_message_draft_to_send_to_test_window',
    requires_user_confirmation: true,
    user_confirmed: false,
    real_execution_allowed: false,
    safety_checks: {
      window_matches: false,
      thread_matches: false,
      draft_matches: false,
      permission_granted: false,
      notes: [
        'Fill this from a real test account or test window only.',
        'Do not use production contacts.',
        'Keep real_execution_allowed=false until the operator has confirmed the target, draft and permission gate.'
      ]
    },
    created_at: nowIso(),
    metadata: {
      controlled_send_scope: 'test_account_or_test_window',
      no_production_contact: false,
      operator_confirmation: 'pending',
      operator_confirmed_at: null,
      prepared_by: 'scripts/prepare-controlled-send-trial.mjs'
    }
  };
}

function buildBoxRegionsTemplate() {
  return {
    contactList: {
      x: 0,
      y: 0,
      width: 0,
      height: 0
    },
    chatMain: {
      x: 0,
      y: 0,
      width: 0,
      height: 0
    },
    inputBox: {
      x: 0,
      y: 0,
      width: 0,
      height: 0
    },
    unreadIndicator: null,
    displayId: 0,
    scaleFactor: 1,
    capturedAt: 0,
    notes: [
      'Replace all zero rectangles with absolute logical screen coordinates from the confirmed test window.',
      'Required regions are contactList, chatMain and inputBox.',
      'This template is not valid as real input until every required rectangle has positive width and height.'
    ]
  };
}

function rectFailures(name, rect) {
  const failures = [];
  if (!rect || typeof rect !== 'object' || Array.isArray(rect)) {
    return [`box_regions.${name}_missing`];
  }
  for (const field of ['x', 'y', 'width', 'height']) {
    if (typeof rect[field] !== 'number' || !Number.isFinite(rect[field])) {
      failures.push(`box_regions.${name}.${field}_must_be_number`);
    }
  }
  if (typeof rect.width === 'number' && rect.width <= 0) {
    failures.push(`box_regions.${name}.width_must_be_positive`);
  }
  if (typeof rect.height === 'number' && rect.height <= 0) {
    failures.push(`box_regions.${name}.height_must_be_positive`);
  }
  return failures;
}

function validateBoxRegions(regions) {
  const failures = [
    ...rectFailures('contactList', regions?.contactList),
    ...rectFailures('chatMain', regions?.chatMain),
    ...rectFailures('inputBox', regions?.inputBox)
  ];
  if (regions?.unreadIndicator !== null && regions?.unreadIndicator !== undefined) {
    failures.push(...rectFailures('unreadIndicator', regions.unreadIndicator));
  }
  if (regions?.scaleFactor !== undefined && (typeof regions.scaleFactor !== 'number' || regions.scaleFactor <= 0)) {
    failures.push('box_regions.scaleFactor_must_be_positive_number');
  }
  if (regions?.capturedAt !== undefined && typeof regions.capturedAt !== 'number') {
    failures.push('box_regions.capturedAt_must_be_number');
  }
  return failures;
}

function boxRegionsSummary(regions) {
  return {
    has_contact_list: Boolean(regions.contactList),
    has_chat_main: Boolean(regions.chatMain),
    has_input_box: Boolean(regions.inputBox),
    has_unread_indicator: Boolean(regions.unreadIndicator),
    display_id: regions.displayId ?? null,
    scale_factor: regions.scaleFactor ?? null,
    captured_at: regions.capturedAt ?? null
  };
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildRunnerEnvironmentContract({ reportPath, inputPath, boxRegionsPath, resultPath }) {
  return {
    contract_version: 'controlled_send_runner_environment.v1',
    ready_for_runner: false,
    allow_real_controlled_send_required: true,
    required_env: {
      ALLOW_REAL_CONTROLLED_SEND: 'true',
      CONTROLLED_SEND_COMMAND_PATH: inputPath,
      CONTROLLED_SEND_READINESS_PATH: reportPath,
      CONTROLLED_SEND_RESULT_PATH: resultPath
    },
    path_bindings: {
      command_path_must_equal: inputPath,
      readiness_path_must_equal: reportPath,
      result_path_must_equal: resultPath,
      box_regions_path_must_equal: boxRegionsPath
    },
    recognition_mode_policy: {
      exactly_one_required: true,
      box_regions_env: 'CONTROLLED_SEND_BOX_REGIONS_PATH',
      box_regions_expected_path: boxRegionsPath,
      vision_api_env: 'CONTROLLED_SEND_VISION_API_KEY',
      vision_api_value_placeholder: '<vision_api_key>',
      forbidden_combination: [
        'CONTROLLED_SEND_BOX_REGIONS_PATH',
        'CONTROLLED_SEND_VISION_API_KEY'
      ]
    },
    readiness_gate: {
      schema_version: 'desktop_controlled_send_trial.v1',
      gate_decision: 'controlled_send_ready_for_test_window',
      ready_for_real_controlled_send: true,
      real_send_attempted: false,
      required_failures: []
    },
    command_snapshot_required_fields: [
      'send_command_id',
      'event_id',
      'decision_id',
      'trigger_id',
      'target_platform',
      'target_person_id',
      'target_thread_hint',
      'message_draft_length',
      'message_draft_sha256'
    ],
    operator_rule: 'Run exactly one runner command in the confirmed test account or test window, then run completion_command immediately.'
  };
}

function buildHandoff({ reportPath, inputPath, boxRegionsPath, outputDir }) {
  const resultPath = path.join(outputDir, 'sightflow-real-controlled-send-result.json');
  const sightflowWorkdir = path.resolve('sightflow-desktop-agent-main');
  return {
    command_path: inputPath,
    readiness_path: reportPath,
    box_regions_path: boxRegionsPath,
    result_path: resultPath,
    sightflow_workdir: sightflowWorkdir,
    runner_environment_contract: buildRunnerEnvironmentContract({
      reportPath,
      inputPath,
      boxRegionsPath,
      resultPath
    }),
    runner_command_with_box_regions: [
      `cd ${psQuote(sightflowWorkdir)}`,
      "$env:ALLOW_REAL_CONTROLLED_SEND='true'",
      `$env:CONTROLLED_SEND_COMMAND_PATH=${psQuote(inputPath)}`,
      `$env:CONTROLLED_SEND_READINESS_PATH=${psQuote(reportPath)}`,
      `$env:CONTROLLED_SEND_BOX_REGIONS_PATH=${psQuote(boxRegionsPath)}`,
      `$env:CONTROLLED_SEND_RESULT_PATH=${psQuote(resultPath)}`,
      'npm.cmd run dev:test-controlled-send-real'
    ].join('; '),
    runner_command_with_vision_api: [
      `cd ${psQuote(sightflowWorkdir)}`,
      "$env:ALLOW_REAL_CONTROLLED_SEND='true'",
      `$env:CONTROLLED_SEND_COMMAND_PATH=${psQuote(inputPath)}`,
      `$env:CONTROLLED_SEND_READINESS_PATH=${psQuote(reportPath)}`,
      "$env:CONTROLLED_SEND_VISION_API_KEY='<vision_api_key>'",
      `$env:CONTROLLED_SEND_RESULT_PATH=${psQuote(resultPath)}`,
      'npm.cmd run dev:test-controlled-send-real'
    ].join('; '),
    completion_command: [
      `cd ${psQuote(path.resolve('.'))}`,
      `npm.cmd run desktop:send:complete-controlled -- --trial=${psQuote(reportPath)} --result=${psQuote(resultPath)} --fail-on-not-complete`
    ].join('; '),
    audit_command: [
      `cd ${psQuote(path.resolve('.'))}`,
      'npm.cmd run desktop:intake:audit -- --fail-on-required'
    ].join('; '),
    notes: [
      'Run exactly one runner command, depending on whether the real test uses box regions or a vision API key.',
      'Do not run the runner until ready_for_real_controlled_send is true and the target test window is active.',
      'Run completion_command immediately after the runner writes result_path.'
    ]
  };
}

function metadataFailures(command) {
  const metadata = command.metadata ?? {};
  const failures = [];
  if (metadata.controlled_send_scope !== 'test_account_or_test_window') {
    failures.push('metadata.controlled_send_scope_must_be_test_account_or_test_window');
  }
  if (metadata.no_production_contact !== true) {
    failures.push('metadata.no_production_contact_must_be_true');
  }
  if (metadata.operator_confirmation !== 'confirmed_for_controlled_send') {
    failures.push('metadata.operator_confirmation_missing');
  }
  if (typeof metadata.operator_confirmed_at !== 'string' || metadata.operator_confirmed_at.trim() === '') {
    failures.push('metadata.operator_confirmed_at_missing');
  }
  return failures;
}

function commandSummary(command) {
  return {
    send_command_id: command.send_command_id,
    event_id: command.event_id,
    decision_id: command.decision_id,
    trigger_id: command.trigger_id,
    target_platform: command.target_platform,
    target_person_id: command.target_person_id ?? null,
    target_thread_hint: command.target_thread_hint,
    message_draft_length: command.message_draft.length,
    message_draft_sha256: sha256Text(command.message_draft),
    requires_user_confirmation: command.requires_user_confirmation,
    user_confirmed: command.user_confirmed,
    real_execution_allowed: command.real_execution_allowed,
    safety_checks: command.safety_checks,
    metadata: command.metadata
  };
}

const inputPath = path.resolve(argValue('input') ?? 'runtime/user-inputs/controlled-send-command.real.json');
const trialId = `desktop_controlled_send_trial_${Date.now()}`;
const outputDir = path.resolve(argValue('output-dir') ?? path.join('runtime/desktop-controlled-send-trials', trialId));
const reportPath = path.join(outputDir, 'desktop-controlled-send-trial.json');
const markdownPath = path.join(outputDir, 'desktop-controlled-send-trial.md');
const templatePath = path.resolve('runtime/user-inputs/templates/controlled-send-command.real.template.json');
const boxRegionsPath = path.resolve(argValue('box-regions') ?? 'runtime/user-inputs/controlled-send-box-regions.real.json');
const boxRegionsTemplatePath = path.resolve('runtime/user-inputs/templates/controlled-send-box-regions.real.template.json');
const requireBoxRegions = process.argv.includes('--require-box-regions');

function usage() {
  return [
    'Usage:',
    '  node scripts/prepare-controlled-send-trial.mjs [--input=<OutboundSendCommand.json>] [--box-regions=<BoxRegions.json>] [--output-dir=<dir>] [--require-box-regions] [--fail-on-not-ready]',
    '',
    'Defaults:',
    '  --input=runtime/user-inputs/controlled-send-command.real.json',
    '  --box-regions=runtime/user-inputs/controlled-send-box-regions.real.json',
    '  --output-dir=runtime/desktop-controlled-send-trials/<trial_id>',
    '',
    'This command never sends a message. It writes a readiness report and, when input is missing, a safe template.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
  process.exit(0);
}

mkdirSync(outputDir, { recursive: true });

const handoff = buildHandoff({
  reportPath,
  inputPath,
  boxRegionsPath,
  outputDir
});

let boxRegionsReport;
if (!existsSync(boxRegionsPath)) {
  writeJson(boxRegionsTemplatePath, buildBoxRegionsTemplate());
  boxRegionsReport = {
    box_regions_path: boxRegionsPath,
    box_regions_ready: false,
    box_regions_template_path: boxRegionsTemplatePath,
    box_regions_required: requireBoxRegions,
    box_regions_failures: ['controlled_send_box_regions_missing'],
    box_regions_required_failures: requireBoxRegions ? ['controlled_send_box_regions_missing'] : []
  };
} else {
  const regions = JSON.parse(readFileSync(boxRegionsPath, 'utf8'));
  const failures = validateBoxRegions(regions);
  boxRegionsReport = {
    box_regions_path: boxRegionsPath,
    box_regions_ready: failures.length === 0,
    box_regions_required: requireBoxRegions,
    box_regions_failures: failures,
    box_regions_required_failures: requireBoxRegions ? failures : [],
    box_regions_summary: failures.length === 0 ? boxRegionsSummary(regions) : null
  };
}

let report;

if (!existsSync(inputPath)) {
  const template = buildTemplate();
  writeJson(templatePath, template);
  report = {
    schema_version: 'desktop_controlled_send_trial.v1',
    trial_id: trialId,
    gate_decision: 'controlled_send_waiting_for_command',
    ready_for_real_controlled_send: false,
    real_send_attempted: false,
    input_path: inputPath,
    template_path: templatePath,
    ...boxRegionsReport,
    handoff,
    required_failures: [
      'controlled_send_command_missing',
      ...boxRegionsReport.box_regions_required_failures
    ],
    next_actions: [
      'Copy the template into runtime/user-inputs/controlled-send-command.real.json after replacing all placeholders.',
      'If using box-select instead of a vision API key, copy the box-regions template into runtime/user-inputs/controlled-send-box-regions.real.json and replace all zero rectangles.',
      'Use only a real test account or test window, never a production contact.',
      'Set user_confirmed=true, real_execution_allowed=true and all safety checks true only after the operator verifies target, draft and permission.',
      'Run npm run desktop:send:prepare-controlled again before any Sightflow controlled-send trial.'
    ],
    created_at: nowIso()
  };
} else {
  const command = normalizeOutboundSendCommand(JSON.parse(readFileSync(inputPath, 'utf8')));
  const evaluation = evaluateSendCommandForExecution(command);
  const dryRunResult = runSendCommandDryRun(command, {
    executor: 'desktop-controlled-send-trial.readiness',
    evidenceRefs: [inputPath]
  });
  const failures = [
    ...evaluation.blocked_reasons,
    ...metadataFailures(command),
    ...boxRegionsReport.box_regions_required_failures
  ];
  const ready = failures.length === 0;
  report = {
    schema_version: 'desktop_controlled_send_trial.v1',
    trial_id: trialId,
    gate_decision: ready ? 'controlled_send_ready_for_test_window' : 'controlled_send_not_ready',
    ready_for_real_controlled_send: ready,
    real_send_attempted: false,
    input_path: inputPath,
    ...boxRegionsReport,
    handoff,
    command: commandSummary(command),
    dry_run_send_result: dryRunResult,
    required_failures: failures,
    next_actions: ready
      ? [
        'Confirm the real test window is active and matches target_thread_hint.',
        'Provide either CONTROLLED_SEND_BOX_REGIONS_PATH with a ready box-regions file or CONTROLLED_SEND_VISION_API_KEY for the Sightflow real runner.',
        'Run the Sightflow controlled-send test only in the confirmed test account/window.',
        'Record SendResult, operator confirmation and post-action feedback after the real test send.'
      ]
      : [
        'Fix required_failures before any real controlled-send attempt.',
        'Keep real execution blocked until user confirmation, target verification and permission evidence are complete.'
      ],
    created_at: nowIso()
  };
}

report.handoff.runner_environment_contract.ready_for_runner = report.ready_for_real_controlled_send === true;

writeJson(reportPath, report);
writeFileSync(markdownPath, [
  '# Desktop Controlled Send Trial',
  '',
  `- trial_id: ${report.trial_id}`,
  `- gate_decision: ${report.gate_decision}`,
  `- ready_for_real_controlled_send: ${report.ready_for_real_controlled_send}`,
  `- real_send_attempted: ${report.real_send_attempted}`,
  `- required_failures: ${report.required_failures.join(', ') || 'none'}`,
  `- input_path: ${report.input_path}`,
  report.template_path ? `- template_path: ${report.template_path}` : null,
  report.box_regions_path ? `- box_regions_path: ${report.box_regions_path}` : null,
  `- box_regions_ready: ${report.box_regions_ready}`,
  report.box_regions_template_path ? `- box_regions_template_path: ${report.box_regions_template_path}` : null,
  '',
  '## Handoff Commands',
  '',
  '### Runner Environment Contract',
  '',
  `- ALLOW_REAL_CONTROLLED_SEND: ${report.handoff.runner_environment_contract.required_env.ALLOW_REAL_CONTROLLED_SEND}`,
  `- CONTROLLED_SEND_COMMAND_PATH: ${report.handoff.runner_environment_contract.required_env.CONTROLLED_SEND_COMMAND_PATH}`,
  `- CONTROLLED_SEND_READINESS_PATH: ${report.handoff.runner_environment_contract.required_env.CONTROLLED_SEND_READINESS_PATH}`,
  `- CONTROLLED_SEND_RESULT_PATH: ${report.handoff.runner_environment_contract.required_env.CONTROLLED_SEND_RESULT_PATH}`,
  `- recognition_mode_policy: exactly one of ${report.handoff.runner_environment_contract.recognition_mode_policy.box_regions_env} or ${report.handoff.runner_environment_contract.recognition_mode_policy.vision_api_env}`,
  '',
  '### Runner With Box Regions',
  '',
  '```powershell',
  report.handoff.runner_command_with_box_regions,
  '```',
  '',
  '### Runner With Vision API',
  '',
  '```powershell',
  report.handoff.runner_command_with_vision_api,
  '```',
  '',
  '### Completion',
  '',
  '```powershell',
  report.handoff.completion_command,
  report.handoff.audit_command,
  '```',
  '',
  '## Next Actions',
  '',
  ...report.next_actions.map((item) => `- ${item}`)
].filter(Boolean).join('\n'), 'utf8');

console.log(JSON.stringify({
  command: 'prepare-controlled-send-trial',
  trial_id: report.trial_id,
  gate_decision: report.gate_decision,
  ready_for_real_controlled_send: report.ready_for_real_controlled_send,
  real_send_attempted: report.real_send_attempted,
  required_failures: report.required_failures,
  json_path: reportPath,
  markdown_path: markdownPath,
  template_path: report.template_path ?? null,
  box_regions_path: report.box_regions_path,
  box_regions_ready: report.box_regions_ready,
  box_regions_template_path: report.box_regions_template_path ?? null,
  result_path: report.handoff.result_path
}, null, 2));

if (process.argv.includes('--fail-on-not-ready') && report.ready_for_real_controlled_send !== true) {
  process.exitCode = 2;
}
