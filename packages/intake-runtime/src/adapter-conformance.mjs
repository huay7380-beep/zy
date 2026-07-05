import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeIntakeObservation, normalizeSourceAdapterCapability, nowIso } from './intake-normalizer.mjs';
import { mapObservationToRawEvent } from './raw-event-mapper.mjs';

function conformanceFailures(capability, observation) {
  const failures = [];
  if (capability.adapter_id !== observation.source_adapter_id) {
    failures.push('adapter_id_mismatch');
  }
  if (capability.source_type !== observation.source_type) {
    failures.push('source_type_mismatch');
  }
  if (capability.platform !== observation.platform) {
    failures.push('platform_mismatch');
  }
  if (capability.capabilities.can_receive !== true) {
    failures.push('adapter_cannot_receive_observation');
  }
  if (capability.capabilities.can_send === true) {
    if (capability.capabilities.requires_user_confirmation !== true) {
      failures.push('send_capable_adapter_requires_user_confirmation');
    }
    if (capability.metadata?.real_execution_default !== false) {
      failures.push('send_capable_adapter_real_execution_default_must_be_false');
    }
  }
  if (observation.metadata?.real_execution_allowed === true) {
    failures.push('observation_must_not_allow_real_execution');
  }
  return failures;
}

export function validateSourceAdapterConformance({
  capability,
  observation,
  capabilityPath = null,
  observationPath = null
}) {
  const validationId = `source_adapter_conformance_${Date.now()}`;
  let normalizedCapability;
  let normalizedObservation;
  let rawEventPreview = null;
  let failures = [];

  try {
    normalizedCapability = normalizeSourceAdapterCapability(capability);
    normalizedObservation = normalizeIntakeObservation(observation);
    failures = conformanceFailures(normalizedCapability, normalizedObservation);
    if (failures.length === 0) {
      rawEventPreview = mapObservationToRawEvent(normalizedObservation);
    }
  } catch (error) {
    failures = [error.message];
  }

  return {
    schema_version: 'source_adapter_conformance.v1',
    validation_id: validationId,
    gate_decision: failures.length === 0
      ? 'source_adapter_conformant'
      : 'source_adapter_not_conformant',
    ready_for_intake: failures.length === 0,
    adapter_id: normalizedCapability?.adapter_id ?? capability?.adapter_id ?? 'unknown',
    source_adapter_id: normalizedObservation?.source_adapter_id ?? observation?.source_adapter_id ?? 'unknown',
    source_type: normalizedObservation?.source_type ?? observation?.source_type ?? 'unknown',
    platform: normalizedObservation?.platform ?? observation?.platform ?? 'unknown',
    required_failures: failures,
    capability_summary: normalizedCapability
      ? {
        adapter_id: normalizedCapability.adapter_id,
        adapter_version: normalizedCapability.adapter_version,
        source_type: normalizedCapability.source_type,
        platform: normalizedCapability.platform,
        capabilities: normalizedCapability.capabilities,
        metadata: normalizedCapability.metadata
      }
      : null,
    observation_summary: normalizedObservation
      ? {
        observation_id: normalizedObservation.observation_id,
        source_adapter_id: normalizedObservation.source_adapter_id,
        source_type: normalizedObservation.source_type,
        platform: normalizedObservation.platform,
        privacy_level: normalizedObservation.privacy_level,
        confidence: normalizedObservation.confidence,
        has_content_text: typeof normalizedObservation.content_text === 'string',
        raw_artifact_refs_count: normalizedObservation.raw_artifact_refs.length
      }
      : null,
    raw_event_preview: rawEventPreview,
    evidence_refs: [
      capabilityPath,
      observationPath
    ].filter(Boolean),
    created_at: nowIso()
  };
}

export function writeSourceAdapterConformance({
  conformance,
  outputDir = path.resolve('runtime/source-adapter-conformance', conformance.validation_id)
}) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'source-adapter-conformance.json');
  const markdownPath = path.join(outputDir, 'source-adapter-conformance.md');
  writeFileSync(jsonPath, `${JSON.stringify(conformance, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, [
    '# Source Adapter Conformance',
    '',
    `- validation_id: ${conformance.validation_id}`,
    `- gate_decision: ${conformance.gate_decision}`,
    `- ready_for_intake: ${conformance.ready_for_intake}`,
    `- adapter_id: ${conformance.adapter_id}`,
    `- source_adapter_id: ${conformance.source_adapter_id}`,
    `- source_type: ${conformance.source_type}`,
    `- platform: ${conformance.platform}`,
    `- required_failures: ${conformance.required_failures.join(', ') || 'none'}`,
    '',
    '## RawEvent Preview',
    '',
    '```json',
    JSON.stringify(conformance.raw_event_preview, null, 2),
    '```'
  ].join('\n'), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath
  };
}
