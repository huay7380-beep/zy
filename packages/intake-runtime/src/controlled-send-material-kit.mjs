import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function nowIso() {
  return new Date().toISOString();
}

function writeJson(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildCommandTemplate({ createdAt }) {
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
        'Use only a real test account or a controlled test window.',
        'Do not use production contacts.',
        'Set all true gates only after the operator verifies target, draft and permission.'
      ]
    },
    created_at: createdAt,
    metadata: {
      controlled_send_scope: 'test_account_or_test_window',
      no_production_contact: false,
      operator_confirmation: 'pending',
      operator_confirmed_at: null,
      prepared_by: 'controlled_send_material_kit.v1'
    }
  };
}

function buildBoxRegionsTemplate({ createdAt }) {
  return {
    contactList: { x: 0, y: 0, width: 0, height: 0 },
    chatMain: { x: 0, y: 0, width: 0, height: 0 },
    inputBox: { x: 0, y: 0, width: 0, height: 0 },
    unreadIndicator: null,
    displayId: 0,
    scaleFactor: 1,
    capturedAt: 0,
    capturedAtIso: createdAt,
    notes: [
      'Replace all zero rectangles with absolute logical screen coordinates from the confirmed test window.',
      'Required regions are contactList, chatMain and inputBox.',
      'This template is invalid as real input until every required rectangle has positive width and height.'
    ]
  };
}

function buildNextCommands({ commandTargetPath, boxRegionsTargetPath }) {
  return {
    copy_instruction: [
      `Copy ${psQuote('controlled-send-command.real.template.json')} to ${psQuote(commandTargetPath)} after replacing placeholders.`,
      `Copy ${psQuote('controlled-send-box-regions.real.template.json')} to ${psQuote(boxRegionsTargetPath)} if using box regions.`
    ].join(' '),
    command_check_with_box_regions: [
      'npm.cmd run desktop:send:command:check --',
      `--input=${psQuote(commandTargetPath)}`,
      `--box-regions=${psQuote(boxRegionsTargetPath)}`,
      '--require-box-regions',
      '--fail-on-required'
    ].join(' '),
    command_check_without_box_regions: [
      'npm.cmd run desktop:send:command:check --',
      `--input=${psQuote(commandTargetPath)}`,
      '--fail-on-required'
    ].join(' '),
    prepare_with_box_regions: [
      'npm.cmd run desktop:send:prepare-controlled --',
      `--input=${psQuote(commandTargetPath)}`,
      `--box-regions=${psQuote(boxRegionsTargetPath)}`,
      '--require-box-regions',
      '--fail-on-not-ready'
    ].join(' '),
    prepare_without_box_regions: [
      'npm.cmd run desktop:send:prepare-controlled --',
      `--input=${psQuote(commandTargetPath)}`,
      '--fail-on-not-ready'
    ].join(' '),
    readiness_with_box_regions: [
      'npm.cmd run desktop:send:readiness --',
      `--command=${psQuote(commandTargetPath)}`,
      `--box-regions=${psQuote(boxRegionsTargetPath)}`,
      '--require-box-regions'
    ].join(' '),
    readiness_without_box_regions: [
      'npm.cmd run desktop:send:readiness --',
      `--command=${psQuote(commandTargetPath)}`
    ].join(' '),
    handoff: 'npm.cmd run desktop:send:handoff',
    docs16_status: 'npm.cmd run desktop:intake:docs16-status'
  };
}

function buildOperatorChecklist({ commandTargetPath, boxRegionsTargetPath }) {
  return [
    'Use a controlled test account or test window only.',
    `Create the command file at ${commandTargetPath} from the command template.`,
    'Replace every replace_with_* placeholder with real test-window values.',
    'Set user_confirmed=true only after the operator confirms the target and draft.',
    'Set real_execution_allowed=true only after the test window, permission and draft are verified.',
    'Set safety_checks.window_matches, thread_matches, draft_matches and permission_granted to true only after direct verification.',
    'Set metadata.controlled_send_scope=test_account_or_test_window.',
    'Set metadata.no_production_contact=true.',
    'Set metadata.operator_confirmation=confirmed_for_controlled_send and fill operator_confirmed_at.',
    `If using local box regions, create ${boxRegionsTargetPath} from the box-region template and replace all zero rectangles.`,
    'Run desktop:send:readiness whenever command material changes so blockers are visible in the unified handoff.',
    'Run command_check before prepare-controlled.',
    'Run prepare-controlled before any Sightflow real runner command.',
    'Run exactly one real runner command from the handoff report.',
    'Run desktop:send:complete-controlled immediately after the runner writes a result file.',
    'Refresh desktop:intake:audit and desktop:intake:docs16-status after completion.'
  ];
}

export function buildControlledSendMaterialKit({
  root = process.cwd(),
  commandTargetPath = path.resolve(root, 'runtime/user-inputs/controlled-send-command.real.json'),
  boxRegionsTargetPath = path.resolve(root, 'runtime/user-inputs/controlled-send-box-regions.real.json'),
  userInputCommandTemplatePath = path.resolve(root, 'runtime/user-inputs/templates/controlled-send-command.real.template.json'),
  userInputBoxRegionsTemplatePath = path.resolve(root, 'runtime/user-inputs/templates/controlled-send-box-regions.real.template.json'),
  outputDir = null,
  createdAt = nowIso()
} = {}) {
  const resolvedRoot = path.resolve(root);
  const kitId = `controlled_send_material_kit_${Date.now()}`;
  const resolvedOutputDir = path.resolve(outputDir ?? path.join(resolvedRoot, 'runtime/controlled-send-material-kits', kitId));
  const resolvedCommandTargetPath = path.resolve(commandTargetPath);
  const resolvedBoxRegionsTargetPath = path.resolve(boxRegionsTargetPath);
  const resolvedUserInputCommandTemplatePath = path.resolve(userInputCommandTemplatePath);
  const resolvedUserInputBoxRegionsTemplatePath = path.resolve(userInputBoxRegionsTemplatePath);
  const commandTemplatePath = path.join(resolvedOutputDir, 'controlled-send-command.real.template.json');
  const boxRegionsTemplatePath = path.join(resolvedOutputDir, 'controlled-send-box-regions.real.template.json');
  const operatorChecklistPath = path.join(resolvedOutputDir, 'operator-checklist.md');
  const kitJsonPath = path.join(resolvedOutputDir, 'controlled-send-material-kit.json');
  const kitMarkdownPath = path.join(resolvedOutputDir, 'controlled-send-material-kit.md');

  return {
    schema_version: 'controlled_send_material_kit.v1',
    kit_id: kitId,
    gate_decision: 'controlled_send_materials_ready_for_operator_fill',
    real_send_attempted: false,
    command_target_path: resolvedCommandTargetPath,
    box_regions_target_path: resolvedBoxRegionsTargetPath,
    command_template_path: commandTemplatePath,
    box_regions_template_path: boxRegionsTemplatePath,
    user_input_command_template_path: resolvedUserInputCommandTemplatePath,
    user_input_box_regions_template_path: resolvedUserInputBoxRegionsTemplatePath,
    operator_checklist_path: operatorChecklistPath,
    kit_json_path: kitJsonPath,
    kit_markdown_path: kitMarkdownPath,
    command_template: buildCommandTemplate({ createdAt }),
    box_regions_template: buildBoxRegionsTemplate({ createdAt }),
    next_commands: buildNextCommands({
      commandTargetPath: resolvedCommandTargetPath,
      boxRegionsTargetPath: resolvedBoxRegionsTargetPath
    }),
    operator_checklist: buildOperatorChecklist({
      commandTargetPath: resolvedCommandTargetPath,
      boxRegionsTargetPath: resolvedBoxRegionsTargetPath
    }),
    safety_gates: [
      'test_account_or_test_window_only',
      'no_production_contact',
      'user_confirmed_true_only_after_operator_review',
      'real_execution_allowed_true_only_after_permission_and_target_verification',
      'desktop_send_command_check_passes_before_prepare',
      'desktop_send_prepare_controlled_passes_before_real_runner',
      'desktop_send_complete_controlled_required_after_runner'
    ],
    created_at: createdAt
  };
}

export function writeControlledSendMaterialKit({ kit }) {
  mkdirSync(path.dirname(kit.kit_json_path), { recursive: true });
  writeJson(kit.command_template_path, kit.command_template);
  writeJson(kit.box_regions_template_path, kit.box_regions_template);
  writeJson(kit.user_input_command_template_path, kit.command_template);
  writeJson(kit.user_input_box_regions_template_path, kit.box_regions_template);
  writeFileSync(kit.operator_checklist_path, [
    '# Controlled Send Operator Checklist',
    '',
    ...kit.operator_checklist.map((item) => `- ${item}`)
  ].join('\n'), 'utf8');
  writeJson(kit.kit_json_path, kit);
  writeFileSync(kit.kit_markdown_path, [
    '# Controlled Send Material Kit',
    '',
    `- kit_id: ${kit.kit_id}`,
    `- gate_decision: ${kit.gate_decision}`,
    `- real_send_attempted: ${kit.real_send_attempted}`,
    `- command_target_path: ${kit.command_target_path}`,
    `- box_regions_target_path: ${kit.box_regions_target_path}`,
    `- command_template_path: ${kit.command_template_path}`,
    `- box_regions_template_path: ${kit.box_regions_template_path}`,
    `- user_input_command_template_path: ${kit.user_input_command_template_path}`,
    `- user_input_box_regions_template_path: ${kit.user_input_box_regions_template_path}`,
    `- operator_checklist_path: ${kit.operator_checklist_path}`,
    '',
    '## Next Commands',
    '',
    '```powershell',
    kit.next_commands.command_check_with_box_regions,
    kit.next_commands.readiness_with_box_regions,
    kit.next_commands.prepare_with_box_regions,
    kit.next_commands.handoff,
    kit.next_commands.docs16_status,
    '```',
    '',
    '## Operator Checklist',
    '',
    ...kit.operator_checklist.map((item) => `- ${item}`)
  ].join('\n'), 'utf8');
  return {
    json_path: kit.kit_json_path,
    markdown_path: kit.kit_markdown_path,
    command_template_path: kit.command_template_path,
    box_regions_template_path: kit.box_regions_template_path,
    user_input_command_template_path: kit.user_input_command_template_path,
    user_input_box_regions_template_path: kit.user_input_box_regions_template_path,
    operator_checklist_path: kit.operator_checklist_path
  };
}
