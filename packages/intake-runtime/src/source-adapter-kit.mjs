import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { nowIso, stableSlug } from './intake-normalizer.mjs';

const SOURCE_TYPES = new Set(['desktop', 'browser', 'api', 'file', 'ocr', 'webhook']);

function requireNonEmpty(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`source adapter kit missing required string: ${field}`);
  }
  return value.trim();
}

function defaultCapabilities(sourceType, canSend) {
  return {
    can_receive: true,
    can_send: canSend,
    can_capture_screenshot: sourceType === 'desktop' || sourceType === 'ocr',
    can_read_dom: sourceType === 'browser',
    can_identify_thread: true,
    can_verify_target: canSend,
    requires_user_confirmation: true
  };
}

function templateBaseName(adapterId) {
  return stableSlug(adapterId).replace(/_/g, '-');
}

export function buildSourceAdapterInitKit({
  adapterId,
  sourceType,
  platform,
  adapterVersion = '0.1.0',
  canSend = false,
  generatedBy = 'init-source-adapter-kit'
}) {
  const normalizedAdapterId = requireNonEmpty(adapterId, 'adapterId');
  const normalizedSourceType = requireNonEmpty(sourceType, 'sourceType');
  const normalizedPlatform = requireNonEmpty(platform, 'platform');
  const normalizedAdapterVersion = requireNonEmpty(adapterVersion, 'adapterVersion');

  if (!SOURCE_TYPES.has(normalizedSourceType)) {
    throw new Error(`source adapter kit sourceType is invalid: ${normalizedSourceType}`);
  }

  const kitId = `source_adapter_init_${stableSlug(normalizedAdapterId)}_${Date.now()}`;
  const baseName = templateBaseName(normalizedAdapterId);
  const capabilityFile = `${baseName}.source-adapter-capability.template.json`;
  const observationFile = `${baseName}.intake-observation.template.json`;
  const capability = {
    adapter_id: normalizedAdapterId,
    adapter_version: normalizedAdapterVersion,
    source_type: normalizedSourceType,
    platform: normalizedPlatform,
    capabilities: defaultCapabilities(normalizedSourceType, Boolean(canSend)),
    metadata: {
      template_only: true,
      real_execution_default: false,
      generated_by: generatedBy,
      onboarding_note: 'Replace template values, keep real execution disabled until controlled validation is approved.'
    }
  };
  const observation = {
    observation_id: `${stableSlug(normalizedAdapterId)}_observation_template_001`,
    source_adapter_id: normalizedAdapterId,
    source_type: normalizedSourceType,
    platform: normalizedPlatform,
    captured_at: nowIso(),
    content_summary: 'Replace with a redacted summary from the source adapter before validation.',
    participants_hint: ['user', 'counterparty_or_system'],
    thread_hint: {
      external_thread_id: 'replace_with_source_thread_id',
      title: 'replace_with_thread_title'
    },
    raw_artifact_refs: [],
    privacy_level: 'summary_only',
    confidence: 0.5,
    metadata: {
      template_only: true,
      real_execution_allowed: false,
      onboarding_note: 'Do not put production secrets or raw private content into the template.'
    }
  };

  return {
    schema_version: 'source_adapter_init_kit.v1',
    kit_id: kitId,
    generated_at: nowIso(),
    generated_by: generatedBy,
    adapter_id: normalizedAdapterId,
    source_type: normalizedSourceType,
    platform: normalizedPlatform,
    can_send_requested: Boolean(canSend),
    templates: {
      capability_file: capabilityFile,
      observation_file: observationFile
    },
    safety_defaults: {
      real_execution_default: false,
      observation_real_execution_allowed: false,
      requires_user_confirmation: true,
      template_only: true
    },
    next_steps: [
      'Edit the capability and observation templates for the new source adapter.',
      'Run source adapter conformance validation before adding the adapter to any intake workflow.',
      'Keep send-capable adapters behind SendCommand, user confirmation, permission, target verification and audit gates.'
    ],
    validation_command: null,
    template_payloads: {
      capability,
      observation
    }
  };
}

export function writeSourceAdapterInitKit({
  kit,
  outputDir = path.resolve('runtime/source-adapter-kits', kit.kit_id)
}) {
  mkdirSync(outputDir, { recursive: true });
  const capabilityPath = path.join(outputDir, kit.templates.capability_file);
  const observationPath = path.join(outputDir, kit.templates.observation_file);
  const validationCommand = [
    'npm.cmd run intake:adapter:validate --',
    `--capability="${capabilityPath}"`,
    `--observation="${observationPath}"`,
    '--fail-on-required'
  ].join(' ');
  const report = {
    ...kit,
    validation_command: validationCommand,
    capability_template_path: capabilityPath,
    observation_template_path: observationPath
  };
  const jsonPath = path.join(outputDir, 'source-adapter-init-kit.json');
  const markdownPath = path.join(outputDir, 'source-adapter-init-kit.md');

  writeFileSync(capabilityPath, `${JSON.stringify(kit.template_payloads.capability, null, 2)}\n`, 'utf8');
  writeFileSync(observationPath, `${JSON.stringify(kit.template_payloads.observation, null, 2)}\n`, 'utf8');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, [
    '# Source Adapter Init Kit',
    '',
    `- kit_id: ${report.kit_id}`,
    `- adapter_id: ${report.adapter_id}`,
    `- source_type: ${report.source_type}`,
    `- platform: ${report.platform}`,
    `- can_send_requested: ${report.can_send_requested}`,
    `- capability_template_path: ${report.capability_template_path}`,
    `- observation_template_path: ${report.observation_template_path}`,
    '',
    '## Safety Defaults',
    '',
    `- real_execution_default: ${report.safety_defaults.real_execution_default}`,
    `- observation_real_execution_allowed: ${report.safety_defaults.observation_real_execution_allowed}`,
    `- requires_user_confirmation: ${report.safety_defaults.requires_user_confirmation}`,
    '',
    '## Next Validation',
    '',
    '```powershell',
    report.validation_command,
    '```'
  ].join('\n'), 'utf8');

  return {
    kit: report,
    written: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      capability_template_path: capabilityPath,
      observation_template_path: observationPath
    }
  };
}
