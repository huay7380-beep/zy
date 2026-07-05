import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function nowIso() {
  return new Date().toISOString();
}

function writeJson(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function latestNestedFile(dir, fileName) {
  if (!existsSync(dir)) return null;
  const candidates = [];
  for (const entry of readdirSafe(dir)) {
    const filePath = path.join(dir, entry, fileName);
    if (existsSync(filePath)) candidates.push(filePath);
  }
  return candidates
    .sort((a, b) => readFileMtimeMs(b) - readFileMtimeMs(a))[0] ?? null;
}

function readdirSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function readFileMtimeMs(filePath) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function makeDecisionTemplate(draft) {
  return {
    schema_version: 'controlled_send_command_confirmation_decision.v1',
    draft_id: draft.draft_id,
    decision: 'pending',
    operator_id: 'replace_with_operator_id',
    operator_confirmed_at: 'replace_with_iso_datetime',
    test_window: {
      conversation_title: 'replace_with_exact_test_window_title',
      target_display_name: draft.command?.target_thread_hint?.target_display_name ?? 'replace_with_exact_test_target_display_name',
      platform_handle: 'replace_with_test_account_or_window_handle'
    },
    confirmations: {
      no_production_contact: false,
      window_matches: false,
      thread_matches: false,
      draft_matches: false,
      permission_granted: false
    },
    evidence_refs: [
      draft.draft_command_path
    ],
    notes: [
      'Change decision to approve_for_controlled_test_window only after reviewing a real test account or test window.',
      'Keep decision=pending or reject if any confirmation is uncertain.',
      'This decision can create runtime/user-inputs/controlled-send-command.real.json, so do not use production contacts.'
    ]
  };
}

function isPlaceholder(value) {
  return typeof value === 'string'
    && (value.trim() === '' || value.includes('replace_with_') || value.includes('<'));
}

function collectDecisionFailures({ decision, draft }) {
  const failures = [];
  if (!decision) {
    failures.push('confirmation_decision_missing');
    return failures;
  }
  if (decision.schema_version !== 'controlled_send_command_confirmation_decision.v1') {
    failures.push('confirmation_decision_invalid_schema');
  }
  if (decision.draft_id !== draft.draft_id) {
    failures.push('confirmation_decision_draft_id_mismatch');
  }
  if (decision.decision !== 'approve_for_controlled_test_window') {
    failures.push('confirmation_decision_not_approved');
  }
  if (isPlaceholder(decision.operator_id)) failures.push('operator_id_missing');
  if (isPlaceholder(decision.operator_confirmed_at)) failures.push('operator_confirmed_at_missing');
  for (const field of ['conversation_title', 'target_display_name', 'platform_handle']) {
    if (isPlaceholder(decision.test_window?.[field])) {
      failures.push(`test_window.${field}_missing`);
    }
  }
  for (const field of ['no_production_contact', 'window_matches', 'thread_matches', 'draft_matches', 'permission_granted']) {
    if (decision.confirmations?.[field] !== true) {
      failures.push(`confirmations.${field}_must_be_true`);
    }
  }
  return failures;
}

function buildConfirmedCommand({ draft, decision }) {
  return {
    ...draft.command,
    target_thread_hint: {
      ...draft.command.target_thread_hint,
      conversation_title: decision.test_window.conversation_title,
      target_display_name: decision.test_window.target_display_name,
      platform_handle: decision.test_window.platform_handle
    },
    user_confirmed: true,
    real_execution_allowed: true,
    safety_checks: {
      ...draft.command.safety_checks,
      window_matches: true,
      thread_matches: true,
      draft_matches: true,
      permission_granted: true,
      notes: [
        'Confirmed for controlled test window only.',
        ...(draft.command.safety_checks?.notes ?? [])
      ]
    },
    metadata: {
      ...draft.command.metadata,
      controlled_send_scope: 'test_account_or_test_window',
      no_production_contact: true,
      operator_confirmation: 'confirmed_for_controlled_send',
      operator_confirmed_at: decision.operator_confirmed_at,
      operator_id: decision.operator_id,
      confirmation_decision_schema: decision.schema_version,
      source_draft_id: draft.draft_id,
      draft_must_not_be_used_as_real_command: false,
      evidence_refs: decision.evidence_refs ?? []
    }
  };
}

function renderMarkdown(report) {
  return [
    '# Controlled Send Command Confirmation',
    '',
    `- confirmation_id: ${report.confirmation_id}`,
    `- gate_decision: ${report.gate_decision}`,
    `- real_send_attempted: ${report.real_send_attempted}`,
    `- validate_only: ${report.validate_only}`,
    `- would_write_target: ${report.would_write_target}`,
    `- target_written: ${report.target_written}`,
    `- target_command_path: ${report.target_command_path}`,
    `- reviewed_decision_target_path: ${report.reviewed_decision_target_path}`,
    `- user_input_decision_template_path: ${report.user_input_decision_template_path}`,
    '',
    '## Required Failures',
    '',
    ...(report.required_failures.length ? report.required_failures.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Next Actions',
    '',
    ...report.next_actions.map((item) => `- ${item}`)
  ].join('\n');
}

export function buildControlledSendCommandConfirmation({
  root = process.cwd(),
  draftPath = null,
  decisionPath = null,
  targetCommandPath = path.resolve(root, 'runtime/user-inputs/controlled-send-command.real.json'),
  reviewedDecisionTargetPath = path.resolve(root, 'runtime/user-inputs/controlled-send-command-confirmation-decision.real.json'),
  userInputDecisionTemplatePath = path.resolve(root, 'runtime/user-inputs/templates/controlled-send-command-confirmation-decision.real.template.json'),
  validateOnly = false,
  createdAt = nowIso()
} = {}) {
  const resolvedRoot = path.resolve(root);
  const discoveredDraftPath = draftPath ?? latestNestedFile(
    path.join(resolvedRoot, 'runtime/controlled-send-command-drafts'),
    'controlled-send-command-draft.json'
  );
  if (!discoveredDraftPath) {
    throw new Error('No controlled-send command draft found. Run npm.cmd run desktop:send:command:draft first.');
  }
  const finalDraftPath = path.resolve(discoveredDraftPath);
  const draft = readJson(finalDraftPath);
  const resolvedDecisionPath = decisionPath ? path.resolve(decisionPath) : null;
  const decision = resolvedDecisionPath && existsSync(resolvedDecisionPath)
    ? readJson(resolvedDecisionPath)
    : null;
  const decisionTemplate = makeDecisionTemplate(draft);
  const requiredFailures = collectDecisionFailures({ decision, draft });
  const wouldWriteTarget = requiredFailures.length === 0;
  const targetWritten = wouldWriteTarget && validateOnly !== true;
  const confirmationId = `controlled_send_command_confirmation_${Date.now()}`;
  const outputDir = path.join(resolvedRoot, 'runtime/controlled-send-command-confirmations', confirmationId);
  const confirmedCommand = wouldWriteTarget ? buildConfirmedCommand({ draft, decision }) : null;

  return {
    schema_version: 'controlled_send_command_confirmation.v1',
    confirmation_id: confirmationId,
    created_at: createdAt,
    gate_decision: targetWritten
      ? 'controlled_send_command_confirmed_for_preflight'
      : wouldWriteTarget && validateOnly === true
        ? 'controlled_send_command_confirmation_validated_without_write'
        : decision || decisionPath
        ? 'controlled_send_command_confirmation_needs_attention'
        : 'controlled_send_command_confirmation_template_written',
    real_send_attempted: false,
    validate_only: validateOnly === true,
    would_write_target: wouldWriteTarget,
    target_written: targetWritten,
    source: {
      root: resolvedRoot,
      draft_path: finalDraftPath,
      decision_path: resolvedDecisionPath
    },
    target_command_path: path.resolve(targetCommandPath),
    reviewed_decision_target_path: path.resolve(reviewedDecisionTargetPath),
    decision_template_path: path.join(outputDir, 'controlled-send-command-confirmation-decision.template.json'),
    user_input_decision_template_path: path.resolve(userInputDecisionTemplatePath),
    confirmed_command_path: targetWritten ? path.resolve(targetCommandPath) : null,
    decision_template: decisionTemplate,
    confirmed_command: confirmedCommand,
    required_failures: requiredFailures,
    next_actions: targetWritten
      ? [
        'Run npm.cmd run desktop:send:command:check -- --fail-on-required.',
        'Run npm.cmd run desktop:send:prepare-controlled -- --fail-on-not-ready.',
        'Run the real Sightflow runner only after prepare-controlled is ready.'
      ]
      : wouldWriteTarget && validateOnly === true
        ? [
        'Reviewed decision is valid, but validate-only mode did not write the real command file.',
          `Rerun this command without --validate-only when the operator is ready to create ${path.resolve(targetCommandPath)}.`,
          'After writing the real command, run desktop:send:command:check before prepare-controlled.'
        ]
      : [
        `Review the decision template and fill ${path.resolve(reviewedDecisionTargetPath)}.`,
        'Use only a controlled test account or test window.',
        `Rerun this command with --decision=${path.resolve(reviewedDecisionTargetPath)}.`
      ],
    output_dir: outputDir
  };
}

export function writeControlledSendCommandConfirmation({ confirmation }) {
  if (!confirmation) throw new Error('writeControlledSendCommandConfirmation requires confirmation');
  mkdirSync(confirmation.output_dir, { recursive: true });
  const jsonPath = path.join(confirmation.output_dir, 'controlled-send-command-confirmation.json');
  const markdownPath = path.join(confirmation.output_dir, 'controlled-send-command-confirmation.md');
  writeJson(jsonPath, confirmation);
  writeFileSync(markdownPath, renderMarkdown(confirmation), 'utf8');
  writeJson(confirmation.decision_template_path, confirmation.decision_template);
  writeJson(confirmation.user_input_decision_template_path, confirmation.decision_template);
  if (confirmation.target_written && confirmation.confirmed_command) {
    writeJson(confirmation.target_command_path, confirmation.confirmed_command);
  }
  return {
    json_path: jsonPath,
    markdown_path: markdownPath,
    decision_template_path: confirmation.decision_template_path,
    user_input_decision_template_path: confirmation.user_input_decision_template_path,
    reviewed_decision_target_path: confirmation.reviewed_decision_target_path,
    target_command_path: confirmation.target_command_path,
    target_written: confirmation.target_written,
    gate_decision: confirmation.gate_decision,
    required_failures: confirmation.required_failures
  };
}
