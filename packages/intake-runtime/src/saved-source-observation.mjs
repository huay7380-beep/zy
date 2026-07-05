import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeIntakeObservation, nowIso, stableSlug } from './intake-normalizer.mjs';

function hashText(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function relativeOrOriginal(root, filePath) {
  if (!filePath) return null;
  const relative = path.relative(root, filePath);
  return relative.startsWith('..') ? filePath : relative.replaceAll(path.sep, '/');
}

function normalizeWhitespace(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function parseParticipantHints(value, fallback) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    const parsed = value.split(',').map((item) => item.trim()).filter(Boolean);
    return parsed.length ? parsed : fallback;
  }
  return fallback;
}

function redactText(text) {
  return String(text ?? '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted_email]')
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, '[redacted_phone]')
    .replace(/\b(token|secret|password|authorization|cookie|api[_-]?key)\b\s*[:=]\s*["']?[^"',\s}]+/gi, '$1=[redacted]');
}

function jsonSummaryLines(value, prefix = '', lines = []) {
  if (lines.length >= 80) return lines;
  if (value === null || value === undefined) {
    if (prefix) lines.push(`${prefix}: null`);
    return lines;
  }
  if (Array.isArray(value)) {
    lines.push(`${prefix || 'array'}: ${value.length} items`);
    value.slice(0, 8).forEach((item, index) => jsonSummaryLines(item, `${prefix}[${index}]`, lines));
    return lines;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (lines.length >= 80) break;
      const childPrefix = prefix ? `${prefix}.${key}` : key;
      if (/token|secret|password|authorization|cookie|credential|api[_-]?key/i.test(key)) {
        lines.push(`${childPrefix}: [redacted]`);
      } else {
        jsonSummaryLines(child, childPrefix, lines);
      }
    }
    return lines;
  }
  lines.push(`${prefix}: ${String(value)}`);
  return lines;
}

function baseReport({
  schemaVersion,
  observation,
  sourcePath,
  observationPath,
  root,
  sourceLabel,
  validationCommand,
  nextBridgeCommand
}) {
  return {
    schema_version: schemaVersion,
    observation_id: observation.observation_id,
    source_adapter_id: observation.source_adapter_id,
    source_type: observation.source_type,
    platform: observation.platform,
    source_path: relativeOrOriginal(root, sourcePath),
    observation_path: relativeOrOriginal(root, observationPath),
    source_label: sourceLabel,
    real_execution_allowed: false,
    real_send_attempted: false,
    content_chars: observation.content_text?.length ?? 0,
    summary_chars: observation.content_summary.length,
    validation_command: validationCommand,
    next_bridge_command: nextBridgeCommand
  };
}

export function buildExternalChatExportObservation({
  exportText,
  exportPath = null,
  root = process.cwd(),
  adapterId = 'external_chat_export.next',
  platform = 'external_chat_export',
  threadTitle = null,
  threadId = null,
  capturedAt = nowIso(),
  privacyLevel = 'redacted_text',
  confidence = 0.72,
  maxContentChars = 1800,
  maxSummaryChars = 240,
  participantHints = ['user', 'external_chat_contact'],
  metadata = {}
} = {}) {
  if (typeof exportText !== 'string' || exportText.trim() === '') {
    throw new Error('buildExternalChatExportObservation requires non-empty exportText');
  }
  const artifactRef = exportPath ? relativeOrOriginal(root, exportPath) : null;
  const sourceLabel = threadTitle ?? threadId ?? artifactRef ?? 'external_chat_export';
  const redactedText = redactText(normalizeWhitespace(exportText));
  const hash = hashText(`${sourceLabel}\n${exportText}`);
  return normalizeIntakeObservation({
    observation_id: `intake_obs_external_chat_real_${hash.slice(0, 12)}`,
    source_adapter_id: adapterId,
    source_type: 'file',
    platform,
    captured_at: capturedAt,
    content_text: truncateText(redactedText, maxContentChars),
    content_summary: truncateText(`${sourceLabel}: ${redactedText}`, maxSummaryChars),
    participants_hint: parseParticipantHints(participantHints, ['user', 'external_chat_contact']),
    thread_hint: {
      external_thread_id: threadId,
      title: threadTitle ?? sourceLabel,
      artifact_ref: artifactRef
    },
    raw_artifact_refs: artifactRef ? [artifactRef] : [],
    privacy_level: privacyLevel,
    confidence,
    metadata: {
      ...metadata,
      generated_by: 'external_chat_export_observation.v1',
      source_file_sha256: `sha256:${hash}`,
      source_slug: stableSlug(sourceLabel),
      real_execution_allowed: false,
      real_send_attempted: false
    }
  });
}

export function buildBusinessApiSnapshotObservation({
  snapshot,
  snapshotPath = null,
  root = process.cwd(),
  adapterId = 'business_api.next',
  platform = 'business_system',
  endpoint = null,
  recordId = null,
  threadTitle = null,
  capturedAt = nowIso(),
  privacyLevel = 'redacted_text',
  confidence = 0.74,
  maxContentChars = 1800,
  maxSummaryChars = 240,
  participantHints = ['user', 'business_system'],
  metadata = {}
} = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('buildBusinessApiSnapshotObservation requires a JSON object snapshot');
  }
  const artifactRef = snapshotPath ? relativeOrOriginal(root, snapshotPath) : null;
  const sourceLabel = threadTitle ?? recordId ?? endpoint ?? artifactRef ?? 'business_api_snapshot';
  const canonicalJson = JSON.stringify(snapshot);
  const hash = hashText(`${sourceLabel}\n${canonicalJson}`);
  const redactedText = redactText(normalizeWhitespace(jsonSummaryLines(snapshot).join('; ')));
  return normalizeIntakeObservation({
    observation_id: `intake_obs_business_api_real_${hash.slice(0, 12)}`,
    source_adapter_id: adapterId,
    source_type: 'api',
    platform,
    captured_at: capturedAt,
    content_text: truncateText(redactedText, maxContentChars),
    content_summary: truncateText(`${sourceLabel}: ${redactedText}`, maxSummaryChars),
    participants_hint: parseParticipantHints(participantHints, ['user', 'business_system']),
    thread_hint: {
      endpoint,
      external_record_id: recordId,
      title: threadTitle ?? sourceLabel,
      artifact_ref: artifactRef
    },
    raw_artifact_refs: artifactRef ? [artifactRef] : [],
    privacy_level: privacyLevel,
    confidence,
    metadata: {
      ...metadata,
      generated_by: 'business_api_snapshot_observation.v1',
      source_json_sha256: `sha256:${hash}`,
      source_slug: stableSlug(sourceLabel),
      real_execution_allowed: false,
      real_send_attempted: false
    }
  });
}

export function writeExternalChatExportObservation({
  exportPath,
  outputDir,
  root = process.cwd(),
  ...options
}) {
  const absoluteExportPath = path.resolve(root, exportPath);
  const exportText = readFileSync(absoluteExportPath, 'utf8');
  const observation = buildExternalChatExportObservation({
    ...options,
    exportText,
    exportPath: absoluteExportPath,
    root
  });
  mkdirSync(outputDir, { recursive: true });
  const observationPath = path.join(outputDir, 'intake-observation.real.json');
  const reportPath = path.join(outputDir, 'external-chat-export-observation-report.json');
  const markdownPath = path.join(outputDir, 'external-chat-export-observation-report.md');
  const validationCommand = `node scripts/validate-intake-observation.mjs --input=${relativeOrOriginal(root, observationPath)}`;
  const nextBridgeCommand = `node scripts/run-desktop-context-bridge.mjs --observation=${relativeOrOriginal(root, observationPath)}`;
  const report = baseReport({
    schemaVersion: 'external_chat_export_observation_report.v1',
    observation,
    sourcePath: absoluteExportPath,
    observationPath,
    root,
    sourceLabel: observation.thread_hint.title,
    validationCommand,
    nextBridgeCommand
  });
  writeFileSync(observationPath, `${JSON.stringify(observation, null, 2)}\n`, 'utf8');
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderSavedSourceObservationMarkdown('External Chat Export Observation', report, observation), 'utf8');
  return {
    observation,
    report,
    observation_path: observationPath,
    report_path: reportPath,
    markdown_path: markdownPath
  };
}

export function writeBusinessApiSnapshotObservation({
  snapshotPath,
  outputDir,
  root = process.cwd(),
  ...options
}) {
  const absoluteSnapshotPath = path.resolve(root, snapshotPath);
  const snapshot = JSON.parse(readFileSync(absoluteSnapshotPath, 'utf8'));
  const observation = buildBusinessApiSnapshotObservation({
    ...options,
    snapshot,
    snapshotPath: absoluteSnapshotPath,
    root
  });
  mkdirSync(outputDir, { recursive: true });
  const observationPath = path.join(outputDir, 'intake-observation.real.json');
  const reportPath = path.join(outputDir, 'business-api-snapshot-observation-report.json');
  const markdownPath = path.join(outputDir, 'business-api-snapshot-observation-report.md');
  const validationCommand = `node scripts/validate-intake-observation.mjs --input=${relativeOrOriginal(root, observationPath)}`;
  const nextBridgeCommand = `node scripts/run-desktop-context-bridge.mjs --observation=${relativeOrOriginal(root, observationPath)}`;
  const report = baseReport({
    schemaVersion: 'business_api_snapshot_observation_report.v1',
    observation,
    sourcePath: absoluteSnapshotPath,
    observationPath,
    root,
    sourceLabel: observation.thread_hint.title,
    validationCommand,
    nextBridgeCommand
  });
  writeFileSync(observationPath, `${JSON.stringify(observation, null, 2)}\n`, 'utf8');
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderSavedSourceObservationMarkdown('Business API Snapshot Observation', report, observation), 'utf8');
  return {
    observation,
    report,
    observation_path: observationPath,
    report_path: reportPath,
    markdown_path: markdownPath
  };
}

export function renderSavedSourceObservationMarkdown(title, report, observation) {
  return `# ${title}

- observation_id: ${report.observation_id}
- source_adapter_id: ${report.source_adapter_id}
- source_type: ${report.source_type}
- platform: ${report.platform}
- real_execution_allowed: ${report.real_execution_allowed}
- real_send_attempted: ${report.real_send_attempted}
- source_path: ${report.source_path}
- observation_path: ${report.observation_path}

## Summary

${observation.content_summary}

## Next Commands

\`\`\`powershell
${report.validation_command}
${report.next_bridge_command}
\`\`\`
`;
}
