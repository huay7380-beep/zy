import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function nowIso() {
  return new Date().toISOString();
}

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function writeJson(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function resolveMessageDraft(messageDraft) {
  if (typeof messageDraft === 'string') return messageDraft.trim();
  if (messageDraft && typeof messageDraft === 'object' && typeof messageDraft.draft === 'string') {
    return messageDraft.draft.trim();
  }
  return '';
}

function findTargetPerson({ mvpLoopResult = {}, pilotImport = {} }) {
  const messageDraft = mvpLoopResult.message_draft && typeof mvpLoopResult.message_draft === 'object'
    ? mvpLoopResult.message_draft
    : {};
  const targetPersonId = messageDraft.target_person_id
    ?? pilotImport.scenario?.target_person_ids?.[0]
    ?? null;
  const targetPerson = (pilotImport.people ?? []).find((person) => person.person_id === targetPersonId) ?? null;
  return {
    target_person_id: targetPersonId,
    target_display_name: messageDraft.target_display_name
      ?? targetPerson?.display_name
      ?? 'replace_with_exact_test_target_display_name'
  };
}

function buildNextCommands({ targetCommandPath, draftCommandPath, boxRegionsPath }) {
  return {
    review_instruction: [
      `Review ${psQuote(draftCommandPath)} manually.`,
      `Only after confirming a real test account/window, copy it to ${psQuote(targetCommandPath)} and update all confirmation gates.`
    ].join(' '),
    command_check_with_box_regions: [
      'npm.cmd run desktop:send:command:check --',
      `--input=${psQuote(targetCommandPath)}`,
      `--box-regions=${psQuote(boxRegionsPath)}`,
      '--require-box-regions',
      '--fail-on-required'
    ].join(' '),
    command_check_without_box_regions: [
      'npm.cmd run desktop:send:command:check --',
      `--input=${psQuote(targetCommandPath)}`,
      '--fail-on-required'
    ].join(' '),
    prepare_with_box_regions: [
      'npm.cmd run desktop:send:prepare-controlled --',
      `--input=${psQuote(targetCommandPath)}`,
      `--box-regions=${psQuote(boxRegionsPath)}`,
      '--require-box-regions',
      '--fail-on-not-ready'
    ].join(' '),
    handoff: 'npm.cmd run desktop:send:handoff',
    docs16_status: 'npm.cmd run desktop:intake:docs16-status'
  };
}

function buildOperatorChecklist() {
  return [
    'Use only a controlled test account or test window.',
    'Do not copy the draft to runtime/user-inputs/controlled-send-command.real.json until every target value is verified.',
    'Replace replace_with_exact_test_window_title and replace_with_test_account_or_window_handle with real test-window values.',
    'Confirm target_display_name against the active test window.',
    'Set user_confirmed=true only after the operator verifies the target and draft.',
    'Set real_execution_allowed=true only after the test window, permission and draft are verified.',
    'Set all safety_checks fields to true only after direct verification.',
    'Set metadata.no_production_contact=true only for a non-production test contact/window.',
    'Set metadata.operator_confirmation=confirmed_for_controlled_send and fill operator_confirmed_at.',
    'Run desktop:send:command:check before prepare-controlled.',
    'Run desktop:send:prepare-controlled before any real Sightflow runner command.',
    'After the real runner writes a result, run desktop:send:complete-controlled, desktop:intake:audit and desktop:intake:docs16-status.'
  ];
}

export function buildControlledSendCommandDraft({
  mvpLoopResult,
  pilotImport,
  root = process.cwd(),
  outputDir = null,
  targetCommandPath = path.resolve(root, 'runtime/user-inputs/controlled-send-command.real.json'),
  boxRegionsPath = path.resolve(root, 'runtime/user-inputs/controlled-send-box-regions.real.json'),
  targetThreadHint = {},
  createdAt = nowIso()
} = {}) {
  if (!mvpLoopResult || typeof mvpLoopResult !== 'object') {
    throw new Error('buildControlledSendCommandDraft requires mvpLoopResult');
  }
  if (!pilotImport || typeof pilotImport !== 'object') {
    throw new Error('buildControlledSendCommandDraft requires pilotImport');
  }

  const resolvedRoot = path.resolve(root);
  const draftId = `controlled_send_command_draft_${Date.now()}`;
  const resolvedOutputDir = path.resolve(outputDir ?? path.join(resolvedRoot, 'runtime/controlled-send-command-drafts', draftId));
  const draftCommandPath = path.join(resolvedOutputDir, 'controlled-send-command.real.draft.json');
  const draftMarkdownPath = path.join(resolvedOutputDir, 'controlled-send-command-draft.md');
  const draftReportPath = path.join(resolvedOutputDir, 'controlled-send-command-draft.json');
  const resolvedTargetCommandPath = path.resolve(targetCommandPath);
  const resolvedBoxRegionsPath = path.resolve(boxRegionsPath);
  const messageDraft = resolveMessageDraft(mvpLoopResult.message_draft);
  if (!messageDraft) {
    throw new Error('mvpLoopResult.message_draft is required to build controlled-send command draft');
  }
  const targetPerson = findTargetPerson({ mvpLoopResult, pilotImport });
  const channel = mvpLoopResult.message_draft?.channel
    ?? pilotImport.scenario?.channel
    ?? 'wechat';

  const command = {
    send_command_id: `${draftId}_command`,
    event_id: pilotImport.import_id ?? mvpLoopResult.import_id ?? 'replace_with_raw_event_or_intake_observation_id',
    decision_id: mvpLoopResult.decision_id,
    trigger_id: mvpLoopResult.trigger_id,
    target_platform: channel.includes('wechat') ? 'wechat' : channel,
    target_person_id: targetPerson.target_person_id,
    target_thread_hint: {
      channel,
      conversation_title: targetThreadHint.conversation_title ?? 'replace_with_exact_test_window_title',
      target_display_name: targetThreadHint.target_display_name ?? targetPerson.target_display_name,
      platform_handle: targetThreadHint.platform_handle ?? 'replace_with_test_account_or_window_handle'
    },
    message_draft: messageDraft,
    requires_user_confirmation: true,
    user_confirmed: false,
    real_execution_allowed: false,
    safety_checks: {
      window_matches: false,
      thread_matches: false,
      draft_matches: false,
      permission_granted: false,
      notes: [
        'Generated from the latest MVP loop as a review draft only.',
        'Do not use production contacts.',
        'Keep real_execution_allowed=false until target, draft and permission are verified in a controlled test window.'
      ]
    },
    created_at: createdAt,
    metadata: {
      controlled_send_scope: 'test_account_or_test_window',
      no_production_contact: false,
      operator_confirmation: 'pending',
      operator_confirmed_at: null,
      prepared_by: 'controlled_send_command_draft.v1',
      source_workflow: mvpLoopResult.workflow ?? null,
      source_import_id: pilotImport.import_id ?? mvpLoopResult.import_id ?? null,
      source_run_id: mvpLoopResult.run_id ?? null,
      message_draft_sha256: sha256Text(messageDraft),
      draft_must_not_be_used_as_real_command: true
    }
  };

  const nextCommands = buildNextCommands({
    targetCommandPath: resolvedTargetCommandPath,
    draftCommandPath,
    boxRegionsPath: resolvedBoxRegionsPath
  });
  const operatorChecklist = buildOperatorChecklist();

  return {
    schema_version: 'controlled_send_command_draft.v1',
    draft_id: draftId,
    gate_decision: 'controlled_send_command_draft_waiting_operator_confirmation',
    real_send_attempted: false,
    target_command_path: resolvedTargetCommandPath,
    box_regions_path: resolvedBoxRegionsPath,
    draft_command_path: draftCommandPath,
    draft_markdown_path: draftMarkdownPath,
    draft_report_path: draftReportPath,
    source: {
      workflow: mvpLoopResult.workflow ?? null,
      import_id: pilotImport.import_id ?? mvpLoopResult.import_id ?? null,
      run_id: mvpLoopResult.run_id ?? null,
      decision_id: mvpLoopResult.decision_id,
      trigger_id: mvpLoopResult.trigger_id
    },
    command,
    command_summary: {
      send_command_id: command.send_command_id,
      event_id: command.event_id,
      decision_id: command.decision_id,
      trigger_id: command.trigger_id,
      target_platform: command.target_platform,
      target_person_id: command.target_person_id,
      target_thread_hint: command.target_thread_hint,
      message_draft_length: messageDraft.length,
      message_draft_sha256: sha256Text(messageDraft),
      user_confirmed: command.user_confirmed,
      real_execution_allowed: command.real_execution_allowed
    },
    next_commands: nextCommands,
    operator_checklist: operatorChecklist,
    created_at: createdAt
  };
}

export function writeControlledSendCommandDraft({ draft }) {
  if (!draft) throw new Error('writeControlledSendCommandDraft requires draft');
  mkdirSync(path.dirname(draft.draft_report_path), { recursive: true });
  writeJson(draft.draft_command_path, draft.command);
  writeJson(draft.draft_report_path, draft);
  writeFileSync(draft.draft_markdown_path, [
    '# Controlled Send Command Draft',
    '',
    `- draft_id: ${draft.draft_id}`,
    `- gate_decision: ${draft.gate_decision}`,
    `- real_send_attempted: ${draft.real_send_attempted}`,
    `- target_command_path: ${draft.target_command_path}`,
    `- draft_command_path: ${draft.draft_command_path}`,
    `- message_draft_sha256: ${draft.command_summary.message_draft_sha256}`,
    '',
    '## Next Commands',
    '',
    '```powershell',
    draft.next_commands.command_check_with_box_regions,
    draft.next_commands.prepare_with_box_regions,
    draft.next_commands.handoff,
    draft.next_commands.docs16_status,
    '```',
    '',
    '## Operator Checklist',
    '',
    ...draft.operator_checklist.map((item) => `- ${item}`)
  ].join('\n'), 'utf8');
  return {
    json_path: draft.draft_report_path,
    markdown_path: draft.draft_markdown_path,
    command_draft_path: draft.draft_command_path,
    gate_decision: draft.gate_decision,
    real_send_attempted: draft.real_send_attempted,
    target_command_path: draft.target_command_path
  };
}
