import { nowIso } from './intake-normalizer.mjs';

export function buildIntakeAuditEvent({
  action,
  result,
  observation = null,
  rawEvent = null,
  actor = 'intake-runtime',
  reason = null,
  metadata = {}
}) {
  return {
    audit_id: `intake_audit_${action}_${Date.now()}`,
    action,
    result,
    actor,
    occurred_at: nowIso(),
    observation_id: observation?.observation_id ?? null,
    raw_event_id: rawEvent?.event_id ?? null,
    reason,
    metadata
  };
}

