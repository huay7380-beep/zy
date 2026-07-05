import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildPlatformDryRunConnector,
  inspectPlatformDryRunConnector
} from '../packages/trigger-engine/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function nowIso() {
  return new Date().toISOString();
}

function slug(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'snapshot';
}

function usage() {
  return [
    'Usage:',
    '  node scripts/validate-platform-snapshot.mjs --snapshot=examples/platform-snapshot.sample.html --preview=examples/platform-snapshot-preview.sample.json',
    '',
    'Options:',
    '  --snapshot=<file>    Platform test-page HTML snapshot. Defaults to examples/platform-snapshot.sample.html.',
    '  --preview=<file>     AutomationPreview JSON. Defaults to examples/platform-snapshot-preview.sample.json.',
    '  --platform=<name>    Platform label. Defaults to preview.platform or wechat_web_test.',
    '  --output-dir=<dir>   Output directory. Defaults to runtime/platform-snapshot-validations/<validation_id>.',
    '  --operator=<id>      Operator label for audit evidence.'
  ].join('\n');
}

function readAutomationPreview(filePath) {
  const value = JSON.parse(readFileSync(filePath, 'utf8'));
  return value.automation_preview ?? value;
}

function missingEvidence(check) {
  const missingRequired = (check.evidence?.required_markers ?? [])
    .filter((item) => !item.found)
    .map((item) => ({ kind: 'required_marker_missing', marker: item.marker }));
  const missingSendBlock = check.send_blocked
    ? []
    : (check.evidence?.send_block_markers ?? [])
        .filter((item) => !item.found)
        .map((item) => ({ kind: 'send_block_marker_missing', marker: item.marker }));
  const forbiddenFound = (check.evidence?.forbidden_markers ?? [])
    .filter((item) => item.found)
    .map((item) => ({ kind: 'forbidden_marker_found', marker: item.marker }));
  const missingDraft = check.draft_present
    ? []
    : [{ kind: 'draft_marker_missing', marker: check.evidence?.draft_marker ?? '' }];
  return [
    ...missingRequired,
    ...missingSendBlock,
    ...forbiddenFound,
    ...missingDraft
  ];
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function validationMarkdown(validation) {
  const rows = [
    ['preview_reached', validation.check.preview_reached],
    ['required_markers_found', validation.check.required_markers_found],
    ['send_blocked', validation.check.send_blocked],
    ['forbidden_markers_absent', validation.check.forbidden_markers_absent],
    ['draft_present', validation.check.draft_present],
    ['real_execution_allowed', validation.check.real_execution_allowed]
  ].map(([key, value]) => `| ${key} | ${value} |`).join('\n');
  const missing = validation.missing_evidence.length
    ? validation.missing_evidence.map((item) => `- ${item.kind}: ${item.marker}`).join('\n')
    : '- none';

  return `# Platform Snapshot Validation

- validation_id: ${validation.validation_id}
- platform: ${validation.platform}
- gate_decision: ${validation.gate_decision}
- ready_for_platform_dry_run: ${validation.ready_for_platform_dry_run}
- snapshot_path: ${validation.snapshot_path}
- preview_path: ${validation.preview_path}

## Checks

| Check | Value |
| --- | --- |
${rows}

## Missing Evidence

${missing}

## Marker Evidence

| Kind | Marker | Found |
| --- | --- | --- |
${[
  ...(validation.check.evidence.required_markers ?? []).map((item) => ['required', item.marker, item.found]),
  ...(validation.check.evidence.send_block_markers ?? []).map((item) => ['send_block', item.marker, item.found]),
  ...(validation.check.evidence.forbidden_markers ?? []).map((item) => ['forbidden', item.marker, item.found])
].map((row) => `| ${row.map(escapeCell).join(' | ')} |`).join('\n')}

## Next Commands

\`\`\`bash
${validation.next_commands.validate_snapshot}
${validation.next_commands.run_trigger_page}
${validation.next_commands.audit_after_mvp}
\`\`\`
`;
}

const snapshotPath = argValue('snapshot') ?? 'examples/platform-snapshot.sample.html';
const previewPath = argValue('preview') ?? 'examples/platform-snapshot-preview.sample.json';
const operator = argValue('operator') ?? 'platform_snapshot_validator';

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const absoluteSnapshotPath = path.resolve(snapshotPath);
  const absolutePreviewPath = path.resolve(previewPath);
  const pageHtml = readFileSync(absoluteSnapshotPath, 'utf8');
  const automationPreview = readAutomationPreview(absolutePreviewPath);
  const platform = argValue('platform') ?? automationPreview.platform ?? 'wechat_web_test';
  const connector = buildPlatformDryRunConnector({ platform });
  const check = inspectPlatformDryRunConnector({
    connector,
    automationPreview,
    pageHtml,
    operator
  });
  const ready = Boolean(
    check.preview_reached
    && check.send_blocked
    && check.forbidden_markers_absent
    && check.draft_present
    && check.real_execution_allowed === false
  );
  const validationId = `platform_snapshot_validation_${slug(platform)}_${Date.now()}`;
  const validation = {
    schema_version: 'platform_snapshot_validation.v1',
    validation_id: validationId,
    created_at: nowIso(),
    snapshot_path: snapshotPath,
    preview_path: previewPath,
    platform,
    gate_decision: ready
      ? 'snapshot_passed_keep_real_send_blocked'
      : 'snapshot_failed_stop_automation_trial',
    ready_for_platform_dry_run: ready,
    connector,
    check,
    missing_evidence: missingEvidence(check),
    continue_when: [
      'preview_reached=true',
      'send_blocked=true',
      'forbidden_markers_absent=true',
      'draft_present=true',
      'real_execution_allowed=false'
    ],
    stop_or_adjust_when: [
      'Any required marker is missing.',
      'The draft marker is absent from the snapshot.',
      'The snapshot contains a real-execution-allowed marker.',
      'The send action is not blocked.',
      'The user has not confirmed target, draft and platform permissions.'
    ],
    next_commands: {
      validate_snapshot: `node scripts/validate-platform-snapshot.mjs --snapshot=${snapshotPath} --preview=${previewPath}`,
      run_trigger_page: 'npm run trigger:page',
      audit_after_mvp: 'npm run mvp:audit'
    }
  };
  const outputDir = argValue('output-dir')
    ? path.resolve(argValue('output-dir'))
    : path.resolve('runtime/platform-snapshot-validations', validationId);
  const jsonPath = path.join(outputDir, 'platform-snapshot-validation.json');
  const markdownPath = path.join(outputDir, 'platform-snapshot-validation.md');

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(validation, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, validationMarkdown(validation), 'utf8');

  console.log(JSON.stringify({
    command: 'validate-platform-snapshot',
    validation_id: validation.validation_id,
    platform: validation.platform,
    gate_decision: validation.gate_decision,
    ready_for_platform_dry_run: validation.ready_for_platform_dry_run,
    check_status: validation.check.status,
    missing_evidence: validation.missing_evidence,
    json_path: jsonPath,
    markdown_path: markdownPath
  }, null, 2));

  if (!ready) {
    process.exitCode = 2;
  }
}
