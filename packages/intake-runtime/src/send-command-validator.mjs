import { nowIso } from './intake-normalizer.mjs';

function requireObject(value, entityName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${entityName} must be an object`);
  }
}

function requireString(record, field, entityName) {
  if (typeof record[field] !== 'string' || record[field].trim() === '') {
    throw new Error(`${entityName} missing required string: ${field}`);
  }
}

function requireBoolean(record, field, entityName) {
  if (typeof record[field] !== 'boolean') {
    throw new Error(`${entityName}.${field} must be a boolean`);
  }
}

export function normalizeOutboundSendCommand(command) {
  requireObject(command, 'OutboundSendCommand');
  for (const field of [
    'send_command_id',
    'event_id',
    'decision_id',
    'trigger_id',
    'target_platform',
    'message_draft',
    'created_at'
  ]) {
    requireString(command, field, 'OutboundSendCommand');
  }
  for (const field of [
    'requires_user_confirmation',
    'user_confirmed',
    'real_execution_allowed'
  ]) {
    requireBoolean(command, field, 'OutboundSendCommand');
  }
  requireObject(command.target_thread_hint, 'OutboundSendCommand.target_thread_hint');
  requireObject(command.safety_checks, 'OutboundSendCommand.safety_checks');

  return {
    target_person_id: null,
    metadata: {},
    ...command,
    send_command_id: command.send_command_id.trim(),
    event_id: command.event_id.trim(),
    decision_id: command.decision_id.trim(),
    trigger_id: command.trigger_id.trim(),
    target_platform: command.target_platform.trim(),
    message_draft: command.message_draft.trim(),
    created_at: command.created_at.trim()
  };
}

export function evaluateSendCommandForExecution(command) {
  const normalized = normalizeOutboundSendCommand(command);
  const checks = normalized.safety_checks;
  const blockedReasons = [];

  if (normalized.real_execution_allowed !== true) {
    blockedReasons.push('real_execution_not_allowed');
  }
  if (normalized.requires_user_confirmation && normalized.user_confirmed !== true) {
    blockedReasons.push('user_confirmation_missing');
  }
  if (checks.window_matches !== true) {
    blockedReasons.push('target_window_mismatch');
  }
  if (checks.thread_matches !== true) {
    blockedReasons.push('target_thread_mismatch');
  }
  if (checks.draft_matches !== true) {
    blockedReasons.push('message_draft_mismatch');
  }
  if (checks.permission_granted !== true) {
    blockedReasons.push('permission_not_granted');
  }

  return {
    command: normalized,
    allowed: blockedReasons.length === 0,
    blocked_reasons: blockedReasons
  };
}

export function buildOutboundSendResult({
  command,
  status,
  blockedReason = null,
  targetVerification = {},
  evidenceRefs = [],
  metadata = {},
  executedAt = nowIso()
}) {
  const normalized = normalizeOutboundSendCommand(command);
  if (!['blocked', 'previewed', 'sent', 'failed'].includes(status)) {
    throw new Error(`OutboundSendResult.status is invalid: ${status}`);
  }

  return {
    send_result_id: `send_result_${normalized.send_command_id}`,
    send_command_id: normalized.send_command_id,
    status,
    ...(blockedReason ? { blocked_reason: blockedReason } : {}),
    target_verification: targetVerification,
    executed_at: executedAt,
    evidence_refs: evidenceRefs,
    metadata
  };
}

export function runSendCommandDryRun(command, options = {}) {
  const evaluation = evaluateSendCommandForExecution(command);
  const targetVerification = {
    dry_run: true,
    allowed_for_real_execution: evaluation.allowed,
    blocked_reasons: evaluation.blocked_reasons,
    ...(options.targetVerification ?? {})
  };

  if (!evaluation.allowed) {
    return buildOutboundSendResult({
      command: evaluation.command,
      status: 'blocked',
      blockedReason: evaluation.blocked_reasons.join(','),
      targetVerification,
      evidenceRefs: options.evidenceRefs ?? ['dry_run_send_blocked'],
      metadata: {
        executor: options.executor ?? 'intake-runtime.dry-run',
        real_send_attempted: false
      }
    });
  }

  return buildOutboundSendResult({
    command: evaluation.command,
    status: 'previewed',
    targetVerification,
    evidenceRefs: options.evidenceRefs ?? ['dry_run_preview_only'],
    metadata: {
      executor: options.executor ?? 'intake-runtime.dry-run',
      real_send_attempted: false
    }
  });
}

