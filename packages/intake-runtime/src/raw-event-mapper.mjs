import { appendRawEvent } from '../../storage-runtime/src/index.mjs';
import {
  buildObservationContentFingerprint,
  normalizeIntakeObservation,
  observationSource
} from './intake-normalizer.mjs';

function eventKindForObservation(observation) {
  if (observation.source_type === 'browser' || observation.platform === 'web') {
    return 'web_observation';
  }
  if (observation.source_type === 'file') {
    return 'imported_record';
  }
  return 'raw_interaction';
}

function contentAllowed(observation) {
  return ['redacted_text', 'raw_text_allowed', 'artifact_allowed'].includes(observation.privacy_level);
}

export function mapObservationToRawEvent(observation, { identityResolution = null } = {}) {
  const normalized = normalizeIntakeObservation(observation);
  const contentFingerprint = buildObservationContentFingerprint(normalized);
  const participants = normalized.participants_hint.length
    ? normalized.participants_hint
    : ['unknown_counterparty'];
  const resolvedPersonIds = identityResolution?.confirmed_person_ids ?? [];
  const rawEvent = {
    event_id: normalized.observation_id,
    event_kind: eventKindForObservation(normalized),
    source: observationSource(normalized),
    source_ref: {
      source_adapter_id: normalized.source_adapter_id,
      source_type: normalized.source_type,
      platform: normalized.platform,
      thread_hint: normalized.thread_hint ?? null,
      window_ref: normalized.window_ref ?? null,
      raw_artifact_refs: normalized.raw_artifact_refs,
      screenshot_hash: normalized.screenshot_hash ?? null,
      source_actor_type: normalized.source_actor_type,
      content_fingerprint: contentFingerprint
    },
    occurred_at: normalized.captured_at,
    participants,
    content_summary: normalized.content_summary,
    linked_person_ids: resolvedPersonIds,
    metadata: {
      ...normalized.metadata,
      adapter_id: normalized.source_adapter_id,
      confidence: normalized.confidence,
      privacy_level: normalized.privacy_level,
      intake_observation_id: normalized.observation_id,
      source_actor_type: normalized.source_actor_type,
      content_fingerprint: contentFingerprint,
      identity_resolution: identityResolution ? {
        resolution_id: identityResolution.resolution_id,
        gate_decision: identityResolution.gate_decision,
        confirmed_person_ids: identityResolution.confirmed_person_ids,
        candidate_count: identityResolution.candidates?.length ?? 0,
        confirmation_required: Boolean(identityResolution.confirmation_required)
      } : null
    }
  };

  if (contentAllowed(normalized) && normalized.content_text) {
    rawEvent.content = normalized.content_text;
  }

  return rawEvent;
}

export function appendObservationAsRawEvent(storage, observation, { actor = 'intake-runtime', identityResolution = null } = {}) {
  const rawEvent = mapObservationToRawEvent(observation, { identityResolution });
  return appendRawEvent(storage, rawEvent, { actor });
}
