import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { nowIso } from './intake-normalizer.mjs';
import { normalizeOutboundSendCommand } from './send-command-validator.mjs';

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameJson(a, b) {
  return stableJson(a) === stableJson(b);
}

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function normalizeSendResultPayload(payload) {
  if (!isObject(payload)) {
    throw new Error('controlled send result payload must be an object');
  }
  if (payload.schema_version !== 'sightflow_real_controlled_send_result.v1') {
    throw new Error('controlled send result schema_version must be sightflow_real_controlled_send_result.v1');
  }
  if (!isObject(payload.command_summary)) {
    throw new Error('controlled send result missing command_summary');
  }
  if (!isObject(payload.send_result)) {
    throw new Error('controlled send result missing send_result');
  }
  return payload;
}

function verificationMode(payload) {
  return payload.verification_mode === 'simulated' ? 'simulated' : 'real';
}

function loadCommandFromTrial(trial) {
  if (!trial.input_path || !existsSync(trial.input_path)) return null;
  return normalizeOutboundSendCommand(readJson(trial.input_path));
}

function completionFailures({ trial, resultPayload, command, mode }) {
  const sendResult = resultPayload.send_result;
  const commandSummary = resultPayload.command_summary;
  const targetVerification = sendResult.target_verification ?? {};
  const metadata = sendResult.metadata ?? {};
  const failures = [];
  const simulated = mode === 'simulated';

  if (trial.ready_for_real_controlled_send !== true) {
    failures.push('trial_not_ready_for_real_controlled_send');
  }
  if (Array.isArray(trial.required_failures) && trial.required_failures.length > 0) {
    failures.push('trial_has_required_failures');
  }
  if (sendResult.status !== 'sent') {
    failures.push('send_result_status_not_sent');
  }
  if (!simulated && (resultPayload.real_send_attempted !== true || metadata.real_send_attempted !== true)) {
    failures.push('real_send_not_attempted');
  }
  if (simulated && (resultPayload.simulated_send_attempted !== true || metadata.simulated_send_attempted !== true)) {
    failures.push('simulated_send_not_attempted');
  }
  if (simulated && (resultPayload.real_send_attempted === true || metadata.real_send_attempted === true)) {
    failures.push('simulated_result_claims_real_send');
  }
  if (targetVerification.dry_run !== false) {
    failures.push('send_result_was_dry_run');
  }
  if (targetVerification.allowed_for_real_execution !== true) {
    failures.push('target_verification_not_allowed');
  }
  if (Array.isArray(targetVerification.blocked_reasons) && targetVerification.blocked_reasons.length > 0) {
    failures.push('target_verification_has_blocked_reasons');
  }
  if (metadata.audit_event_required !== true) {
    failures.push('audit_event_required_missing');
  }
  if (metadata.feedback_entry_required !== true) {
    failures.push('feedback_entry_required_missing');
  }
  const requiredEvidence = simulated ? 'sightflow_desktop_simulated_sent' : 'sightflow_desktop_sent';
  if (!Array.isArray(sendResult.evidence_refs) || !sendResult.evidence_refs.includes(requiredEvidence)) {
    failures.push('sent_evidence_ref_missing');
  }

  const trialCommandId = trial.command?.send_command_id ?? command?.send_command_id ?? null;
  if (trialCommandId && sendResult.send_command_id !== trialCommandId) {
    failures.push('send_command_id_mismatch');
  }
  if (trialCommandId && resultPayload.command_summary.send_command_id !== trialCommandId) {
    failures.push('command_summary_id_mismatch');
  }

  const bindingFields = ['event_id', 'decision_id', 'trigger_id'];
  for (const field of bindingFields) {
    const expected = trial.command?.[field] ?? command?.[field] ?? null;
    if (expected && commandSummary[field] !== expected) {
      failures.push(`command_summary_${field}_mismatch`);
    }
  }

  const expectedPlatform = trial.command?.target_platform ?? command?.target_platform ?? null;
  if (expectedPlatform && commandSummary.target_platform !== expectedPlatform) {
    failures.push('command_summary_target_platform_mismatch');
  }

  const expectedPersonId = trial.command?.target_person_id ?? command?.target_person_id ?? null;
  if (expectedPersonId && commandSummary.target_person_id !== expectedPersonId) {
    failures.push('command_summary_target_person_id_mismatch');
  }

  const expectedThreadHint = trial.command?.target_thread_hint ?? command?.target_thread_hint ?? null;
  if (expectedThreadHint && !sameJson(commandSummary.target_thread_hint, expectedThreadHint)) {
    failures.push('command_summary_target_thread_hint_mismatch');
  }

  const expectedDraftLength = trial.command?.message_draft_length ?? command?.message_draft?.length ?? null;
  if (
    typeof expectedDraftLength === 'number'
    && resultPayload.command_summary.message_draft_length !== expectedDraftLength
  ) {
    failures.push('message_draft_length_mismatch');
  }

  const expectedDraftSha256 = trial.command?.message_draft_sha256 ?? null;
  if (typeof expectedDraftSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDraftSha256)) {
    failures.push('trial_message_draft_sha256_missing');
  } else if (commandSummary.message_draft_sha256 !== expectedDraftSha256) {
    failures.push('message_draft_sha256_mismatch');
  }
  const currentCommandDraftSha256 = typeof command?.message_draft === 'string'
    ? sha256Text(command.message_draft)
    : null;
  if (expectedDraftSha256 && currentCommandDraftSha256 && currentCommandDraftSha256 !== expectedDraftSha256) {
    failures.push('command_message_draft_sha256_changed_after_trial');
  }

  return failures;
}

export function completeControlledSendTrial({
  trialPath,
  resultPath
}) {
  const trial = readJson(trialPath);
  const resultPayload = normalizeSendResultPayload(readJson(resultPath));
  const command = loadCommandFromTrial(trial);
  const mode = verificationMode(resultPayload);
  const failures = completionFailures({ trial, resultPayload, command, mode });
  const simulatedSendVerified = mode === 'simulated' && failures.length === 0;
  const realSendVerified = mode === 'real' && failures.length === 0;
  const sendVerified = realSendVerified || simulatedSendVerified;
  const sendResult = resultPayload.send_result;

  return {
    schema_version: 'desktop_controlled_send_completion.v1',
    completion_id: `desktop_controlled_send_completion_${Date.now()}`,
    gate_decision: realSendVerified
      ? 'controlled_send_completed'
      : simulatedSendVerified
        ? 'controlled_send_simulation_completed'
      : 'controlled_send_completion_failed',
    verification_mode: mode,
    real_send_verified: realSendVerified,
    simulated_send_verified: simulatedSendVerified,
    audit_event_ready: sendVerified,
    feedback_entry_ready: sendVerified,
    trial_path: trialPath,
    result_path: resultPath,
    required_failures: failures,
    command_summary: {
      send_command_id: resultPayload.command_summary.send_command_id ?? null,
      event_id: resultPayload.command_summary.event_id ?? null,
      decision_id: resultPayload.command_summary.decision_id ?? null,
      trigger_id: resultPayload.command_summary.trigger_id ?? null,
      target_platform: resultPayload.command_summary.target_platform ?? null,
      target_person_id: resultPayload.command_summary.target_person_id ?? null,
      target_thread_hint: resultPayload.command_summary.target_thread_hint ?? null,
      message_draft_length: resultPayload.command_summary.message_draft_length ?? null,
      message_draft_sha256: resultPayload.command_summary.message_draft_sha256 ?? null
    },
    send_result_summary: {
      send_result_id: sendResult.send_result_id,
      send_command_id: sendResult.send_command_id,
      status: sendResult.status,
      executed_at: sendResult.executed_at,
      evidence_refs: sendResult.evidence_refs ?? [],
      target_verification: sendResult.target_verification ?? {},
      metadata: sendResult.metadata ?? {}
    },
    audit_record: sendVerified
      ? {
        action: realSendVerified ? 'desktop_controlled_send_completed' : 'desktop_controlled_send_simulated',
        result: realSendVerified ? 'sent' : 'simulated_sent',
        send_command_id: sendResult.send_command_id,
        send_result_id: sendResult.send_result_id,
        occurred_at: sendResult.executed_at,
        evidence_refs: [
          trialPath,
          resultPath,
          ...(sendResult.evidence_refs ?? [])
        ]
      }
      : null,
    feedback_entry_template: sendVerified
      ? {
        send_command_id: sendResult.send_command_id,
        send_result_id: sendResult.send_result_id,
        feedback_required: true,
        outcome: 'pending_operator_review',
        next_step: realSendVerified
          ? 'Record whether the test recipient received the exact draft in the confirmed test window.'
          : 'Record simulation observations before any real test-window send is attempted.'
      }
      : null,
    created_at: nowIso()
  };
}

export function writeControlledSendCompletion({
  completion,
  outputDir = path.resolve('runtime/desktop-controlled-send-completions', completion.completion_id)
}) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'desktop-controlled-send-completion.json');
  const markdownPath = path.join(outputDir, 'desktop-controlled-send-completion.md');
  writeFileSync(jsonPath, `${JSON.stringify(completion, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, [
    '# Desktop Controlled Send Completion',
    '',
    `- completion_id: ${completion.completion_id}`,
    `- gate_decision: ${completion.gate_decision}`,
    `- verification_mode: ${completion.verification_mode}`,
    `- real_send_verified: ${completion.real_send_verified}`,
    `- simulated_send_verified: ${completion.simulated_send_verified}`,
    `- audit_event_ready: ${completion.audit_event_ready}`,
    `- feedback_entry_ready: ${completion.feedback_entry_ready}`,
    `- required_failures: ${completion.required_failures.join(', ') || 'none'}`,
    `- trial_path: ${completion.trial_path}`,
    `- result_path: ${completion.result_path}`,
    '',
    '## Command Summary',
    '',
    `- send_command_id: ${completion.command_summary.send_command_id}`,
    `- target_platform: ${completion.command_summary.target_platform}`,
    `- target_person_id: ${completion.command_summary.target_person_id}`,
    `- message_draft_length: ${completion.command_summary.message_draft_length}`,
    `- message_draft_sha256: ${completion.command_summary.message_draft_sha256}`,
    '',
    '## Send Result',
    '',
    `- send_result_id: ${completion.send_result_summary.send_result_id}`,
    `- send_command_id: ${completion.send_result_summary.send_command_id}`,
    `- status: ${completion.send_result_summary.status}`,
    `- executed_at: ${completion.send_result_summary.executed_at}`
  ].join('\n'), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath
  };
}
