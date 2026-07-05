import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePilotIntakeReadiness } from '../../storage-runtime/src/index.mjs';
import {
  buildPlatformDryRunConnector,
  inspectPlatformDryRunConnector
} from '../../trigger-engine/src/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function projectRoot() {
  return path.resolve(here, '../../..');
}

function nowIso() {
  return new Date().toISOString();
}

function createReadinessId(date = new Date()) {
  return `mvp_external_input_readiness_${date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function createTemplateInitId(date = new Date()) {
  return `mvp_external_input_templates_${date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map((item) => stableJson(item));
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stableJson(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function removeKeys(value, keysToRemove) {
  if (Array.isArray(value)) return value.map((item) => removeKeys(item, keysToRemove));
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, nested]) => {
      if (!keysToRemove.has(key)) acc[key] = removeKeys(nested, keysToRemove);
      return acc;
    }, {});
  }
  return value;
}

function sameJsonExceptKeys(left, right, keysToRemove) {
  return JSON.stringify(stableJson(removeKeys(left, keysToRemove)))
    === JSON.stringify(stableJson(removeKeys(right, keysToRemove)));
}

function relativeOrNull(root, filePath) {
  if (!filePath) return null;
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function resolveFromRoot(root, maybeRelativePath) {
  if (!maybeRelativePath) return null;
  return path.isAbsolute(maybeRelativePath)
    ? maybeRelativePath
    : path.join(root, maybeRelativePath);
}

function latestKitPath(root) {
  const inputKitDir = path.join(root, 'runtime/input-kits');
  if (!existsSync(inputKitDir)) return null;
  const candidates = readdirSync(inputKitDir)
    .map((name) => path.join(inputKitDir, name, 'mvp-external-input-kit.json'))
    .filter((filePath) => existsSync(filePath) && statSync(filePath).isFile())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] ?? null;
}

function readAutomationPreview(filePath) {
  const value = readJson(filePath);
  return value.automation_preview ?? value;
}

function readSourceTemplateText(root, sourceTemplate) {
  const absoluteSource = resolveFromRoot(root, sourceTemplate);
  if (!absoluteSource || !existsSync(absoluteSource)) return null;
  return readFileSync(absoluteSource, 'utf8');
}

function sampleInputEvidence({ targetText, sourceText, targetJson = null, sourceJson = null, ignoredKeys = [] }) {
  const evidence = [];
  if (sourceText && normalizeText(targetText) === normalizeText(sourceText)) {
    evidence.push('matches_source_template=true');
  }
  if (targetJson && sourceJson && sameJsonExceptKeys(targetJson, sourceJson, new Set(ignoredKeys))) {
    evidence.push(`matches_source_template_payload_except=${ignoredKeys.join(',') || 'none'}`);
  }
  return evidence;
}

function hasSampleMarker(value) {
  return /\b(sample|template|fixture)\b|realistic_sample|snapshot_sample/i.test(String(value ?? ''));
}

function evaluatePilotInput({ root, item }) {
  const absolutePath = resolveFromRoot(root, item.target_path);
  if (!existsSync(absolutePath)) {
    return {
      issue_id: item.issue_id,
      target_path: item.target_path,
      status: 'missing',
      ready: false,
      validation_command: item.validation_command,
      evidence: ['target file missing'],
      next_action: `Create ${item.target_path} from ${item.source_template ?? 'the PilotImportBatch sample'} and replace it with real pilot records; unmodified samples/templates are rejected.`
    };
  }

  try {
    const targetText = readFileSync(absolutePath, 'utf8');
    const sourceText = readSourceTemplateText(root, item.source_template);
    const batch = JSON.parse(targetText);
    const sourceBatch = sourceText ? JSON.parse(sourceText) : null;
    const sampleEvidence = sampleInputEvidence({
      targetText,
      sourceText,
      targetJson: batch,
      sourceJson: sourceBatch,
      ignoredKeys: ['import_id']
    });
    if (hasSampleMarker(batch.import_id)) {
      sampleEvidence.push(`import_id_contains_sample_marker=${batch.import_id}`);
    }
    if (sampleEvidence.length) {
      return {
        issue_id: item.issue_id,
        target_path: item.target_path,
        status: 'needs_attention',
        ready: false,
        validation_command: item.validation_command,
        evidence: sampleEvidence,
        next_action: 'Replace the copied sample/template with user-provided pilot records before treating PT-003 as real material.'
      };
    }
    const readiness = analyzePilotIntakeReadiness(batch, {
      inputPath: item.target_path
    });
    const ready = Boolean(
      readiness.required_failures.length === 0
      && readiness.ready_for_closed_loop_mvp
      && Number(readiness.metrics.semantic_coverage ?? 0) >= 0.7
    );
    return {
      issue_id: item.issue_id,
      target_path: item.target_path,
      status: ready ? 'ready' : 'needs_attention',
      ready,
      validation_command: item.validation_command,
      evidence: [
        `gate_decision=${readiness.gate_decision}`,
        `required_failures=${readiness.required_failures.join(',') || 'none'}`,
        `ready_for_closed_loop_mvp=${readiness.ready_for_closed_loop_mvp}`,
        `semantic_coverage=${readiness.metrics.semantic_coverage}`
      ],
      readiness_summary: {
        schema_version: readiness.schema_version,
        readiness_id: readiness.readiness_id,
        gate_decision: readiness.gate_decision,
        ready_for_decision_trial: readiness.ready_for_decision_trial,
        ready_for_closed_loop_mvp: readiness.ready_for_closed_loop_mvp,
        required_failures: readiness.required_failures,
        recommended_failures: readiness.recommended_failures,
        metrics: readiness.metrics
      },
      next_action: ready
        ? 'Run npm run mvp:self-agent with this PilotImportBatch or run mvp:import for a direct closed-loop trial.'
        : 'Fix PilotImportBatch required failures before entering the full MVP closed loop.'
    };
  } catch (error) {
    return {
      issue_id: item.issue_id,
      target_path: item.target_path,
      status: 'invalid',
      ready: false,
      validation_command: item.validation_command,
      evidence: [`error=${error.message}`],
      next_action: 'Fix JSON shape or required fields according to schemas/pilot-import-batch.schema.json.'
    };
  }
}

function evaluatePlatformInput({ root, item }) {
  const snapshotPath = resolveFromRoot(root, item.target_path);
  const previewPath = resolveFromRoot(root, item.companion_preview_path);
  const missing = [
    !existsSync(snapshotPath) ? item.target_path : null,
    !existsSync(previewPath) ? item.companion_preview_path : null
  ].filter(Boolean);

  if (missing.length) {
    return {
      issue_id: item.issue_id,
      target_path: item.target_path,
      companion_preview_path: item.companion_preview_path,
      status: 'missing',
      ready: false,
      validation_command: item.validation_command,
      evidence: missing.map((filePath) => `missing=${filePath}`),
      next_action: 'Save the platform HTML snapshot and matching AutomationPreview JSON before validating PT-004; unmodified samples/templates are rejected.'
    };
  }

  try {
    const pageHtml = readFileSync(snapshotPath, 'utf8');
    const sourceSnapshotText = readSourceTemplateText(root, item.source_template);
    const sourcePreviewText = readSourceTemplateText(root, item.companion_preview_template);
    const automationPreview = readAutomationPreview(previewPath);
    const sourcePreview = sourcePreviewText ? readAutomationPreview(resolveFromRoot(root, item.companion_preview_template)) : null;
    const sampleEvidence = sampleInputEvidence({
      targetText: pageHtml,
      sourceText: sourceSnapshotText
    });
    sampleEvidence.push(...sampleInputEvidence({
      targetText: readFileSync(previewPath, 'utf8'),
      sourceText: sourcePreviewText,
      targetJson: automationPreview,
      sourceJson: sourcePreview,
      ignoredKeys: ['preview_id', 'trigger_id', 'decision_id']
    }));
    if (hasSampleMarker(automationPreview.preview_id)) {
      sampleEvidence.push(`preview_id_contains_sample_marker=${automationPreview.preview_id}`);
    }
    if (/Platform Snapshot Sample/i.test(pageHtml)) {
      sampleEvidence.push('snapshot_contains_sample_title=true');
    }
    if (sampleEvidence.length) {
      return {
        issue_id: item.issue_id,
        target_path: item.target_path,
        companion_preview_path: item.companion_preview_path,
        status: 'needs_attention',
        ready: false,
        validation_command: item.validation_command,
        evidence: sampleEvidence,
        next_action: 'Replace copied platform sample files with a real test-account snapshot or a controlled preview captured for this validation run.'
      };
    }
    const platform = automationPreview.platform ?? 'wechat_web_test';
    const connector = buildPlatformDryRunConnector({ platform });
    const check = inspectPlatformDryRunConnector({
      connector,
      automationPreview,
      pageHtml,
      operator: 'mvp_external_input_readiness'
    });
    const ready = Boolean(
      check.preview_reached
      && check.send_blocked
      && check.forbidden_markers_absent
      && check.draft_present
      && check.real_execution_allowed === false
    );

    return {
      issue_id: item.issue_id,
      target_path: item.target_path,
      companion_preview_path: item.companion_preview_path,
      status: ready ? 'ready' : 'needs_attention',
      ready,
      validation_command: item.validation_command,
      evidence: [
        `preview_reached=${check.preview_reached}`,
        `send_blocked=${check.send_blocked}`,
        `forbidden_markers_absent=${check.forbidden_markers_absent}`,
        `draft_present=${check.draft_present}`,
        `real_execution_allowed=${check.real_execution_allowed}`
      ],
      validation_summary: {
        platform,
        check_id: check.check_id,
        status: check.status,
        preview_reached: check.preview_reached,
        send_blocked: check.send_blocked,
        forbidden_markers_absent: check.forbidden_markers_absent,
        draft_present: check.draft_present,
        real_execution_allowed: check.real_execution_allowed
      },
      next_action: ready
        ? 'Keep the dry-run gate and rerun npm run mvp:self-agent before expanding automation preview samples.'
        : 'Fix platform snapshot markers, draft visibility or send blocking before automation preview expansion.'
    };
  } catch (error) {
    return {
      issue_id: item.issue_id,
      target_path: item.target_path,
      companion_preview_path: item.companion_preview_path,
      status: 'invalid',
      ready: false,
      validation_command: item.validation_command,
      evidence: [`error=${error.message}`],
      next_action: 'Fix platform snapshot HTML or AutomationPreview JSON before retrying validation.'
    };
  }
}

function evaluateItem({ root, item }) {
  if (item.issue_id === 'PT-003') return evaluatePilotInput({ root, item });
  if (item.issue_id === 'PT-004') return evaluatePlatformInput({ root, item });
  return {
    issue_id: item.issue_id,
    target_path: item.target_path,
    status: 'unsupported',
    ready: false,
    validation_command: item.validation_command,
    evidence: ['unsupported external input type'],
    next_action: 'Review the input kit manually.'
  };
}

function readinessMarkdown(readiness) {
  const rows = readiness.item_results
    .map((item) => `| ${item.issue_id} | ${item.status} | ${item.ready} | ${item.target_path ?? ''} | ${item.validation_command ?? ''} |`)
    .join('\n');
  const next = readiness.next_actions.length
    ? readiness.next_actions.map((item) => `- ${item}`).join('\n')
    : '- none';

  return `# MVP External Input Readiness

- readiness_id: ${readiness.readiness_id}
- created_at: ${readiness.created_at}
- gate_decision: ${readiness.gate_decision}
- ready_for_real_input_trial: ${readiness.ready_for_real_input_trial}
- input_kit_path: ${readiness.input_kit_path}

## Item Results

| issue_id | status | ready | target_path | validation_command |
| --- | --- | --- | --- | --- |
${rows}

## Next Actions

${next}
`;
}

function templateNameFor(item, kind = 'primary') {
  if (item.issue_id === 'PT-003') return 'pilot-import.real.template.json';
  if (item.issue_id === 'PT-004' && kind === 'companion') return 'platform-snapshot-preview.real.template.json';
  if (item.issue_id === 'PT-004') return 'platform-snapshot.real.template.html';
  return `${item.issue_id.toLowerCase()}.template`;
}

function renderTemplateReadme({ kit, templateRecords }) {
  const rows = templateRecords
    .map((item) => `| ${item.issue_id} | ${item.template_path} | ${item.real_target_path} | ${item.validation_command} |`)
    .join('\n');

  return `# MVP User Input Templates

These templates are generated from ${kit.kit_id}.

Do not treat files in this templates directory as real pilot inputs. Real inputs are only read from the target paths in the table below.

| issue_id | template_path | real_target_path | validation_command |
| --- | --- | --- | --- |
${rows}

## Safe Workflow

1. Use the template shape to prepare the matching real target file.
2. Replace sample/template content; copied examples are rejected by readiness checks.
3. Keep test-account or pilot-only material in the real target file.
4. Run npm run mvp:inputs:check after the real target files are prepared.
5. Continue only when the readiness report says ready_for_real_input_trial=true.
`;
}

function templateInitMarkdown(init) {
  const rows = init.templates
    .map((item) => `| ${item.issue_id} | ${item.kind} | ${item.status} | ${item.template_path} | ${item.real_target_path} |`)
    .join('\n');

  return `# MVP External Input Template Init

- template_init_id: ${init.template_init_id}
- created_at: ${init.created_at}
- source_kit_id: ${init.source_kit_id}
- templates_dir: ${init.templates_dir}
- readme_path: ${init.readme_path}

## Templates

| issue_id | kind | status | template_path | real_target_path |
| --- | --- | --- | --- | --- |
${rows}

## Next Commands

${init.next_commands.map((item) => `- ${item}`).join('\n')}
`;
}

function makeTemplateRecord({
  root,
  item,
  templatesDir,
  sourceTemplate,
  realTargetPath,
  kind,
  overwrite
}) {
  const name = templateNameFor(item, kind);
  const templatePath = path.join(templatesDir, name);
  const relativeTemplatePath = relativeOrNull(root, templatePath);
  const absoluteSource = resolveFromRoot(root, sourceTemplate);
  const sourceExists = Boolean(absoluteSource && existsSync(absoluteSource));
  const alreadyExists = existsSync(templatePath);
  let status = 'written';

  if (alreadyExists && !overwrite) {
    status = 'kept_existing';
  } else if (sourceExists) {
    writeFileSync(templatePath, readFileSync(absoluteSource, 'utf8'), 'utf8');
  } else {
    status = 'missing_source';
    writeFileSync(templatePath, '', 'utf8');
  }

  return {
    issue_id: item.issue_id,
    kind,
    status,
    template_path: relativeTemplatePath,
    real_target_path: realTargetPath,
    source_template: sourceTemplate,
    source_found: sourceExists,
    validation_command: item.validation_command
  };
}

export function evaluateMvpExternalInputReadiness({
  root = projectRoot(),
  inputKitPath = null,
  inputKit = null
} = {}) {
  const finalInputKitPath = inputKitPath ?? latestKitPath(root);
  if (!inputKit && !finalInputKitPath) {
    throw new Error('No mvp external input kit found. Run npm run mvp:self-agent first.');
  }

  const kit = inputKit ?? readJson(finalInputKitPath);
  const createdAt = nowIso();
  const itemResults = (kit.files_to_prepare ?? []).map((item) => evaluateItem({ root, item }));
  const allReady = itemResults.length > 0 && itemResults.every((item) => item.ready);
  const anyMaterialPresent = itemResults.some((item) => item.status !== 'missing');
  const gateDecision = allReady
    ? 'external_inputs_ready_for_mvp_self_agent'
    : anyMaterialPresent
      ? 'external_inputs_need_attention'
      : 'external_inputs_waiting_for_materials';

  return {
    schema_version: 'mvp_external_input_readiness.v1',
    readiness_id: createReadinessId(new Date(createdAt)),
    created_at: createdAt,
    source_kit_id: kit.kit_id,
    input_kit_path: finalInputKitPath ? relativeOrNull(root, finalInputKitPath) : null,
    gate_decision: gateDecision,
    ready_for_real_input_trial: allReady,
    item_results: itemResults,
    required_failures: itemResults
      .filter((item) => !item.ready)
      .map((item) => `${item.issue_id}:${item.status}`),
    next_actions: itemResults
      .filter((item) => !item.ready)
      .map((item) => `${item.issue_id}: ${item.next_action}`),
    continue_when: [
      'PT-003 status=ready.',
      'PT-004 status=ready.',
      'ready_for_real_input_trial=true.'
    ],
    stop_or_adjust_when: [
      'Any required input is missing.',
      'PilotImportBatch readiness required_failures is not empty.',
      'Platform snapshot does not prove send_blocked=true and real_execution_allowed=false.'
    ]
  };
}

export function writeMvpExternalInputReadiness({
  readiness,
  outputDir = path.join(projectRoot(), 'runtime/input-readiness', readiness?.readiness_id ?? createReadinessId())
} = {}) {
  if (!readiness) throw new Error('writeMvpExternalInputReadiness requires readiness');
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'mvp-external-input-readiness.json');
  const markdownPath = path.join(outputDir, 'mvp-external-input-readiness.md');
  writeFileSync(jsonPath, `${JSON.stringify(readiness, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, readinessMarkdown(readiness), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath,
    contract: readiness.schema_version,
    gate_decision: readiness.gate_decision,
    ready_for_real_input_trial: readiness.ready_for_real_input_trial
  };
}

export function initializeMvpExternalInputTemplates({
  root = projectRoot(),
  inputKitPath = null,
  inputKit = null,
  templatesDir = path.join(root, 'runtime/user-inputs/templates'),
  outputDir = null,
  overwrite = false
} = {}) {
  const finalInputKitPath = inputKitPath ?? latestKitPath(root);
  if (!inputKit && !finalInputKitPath) {
    throw new Error('No mvp external input kit found. Run npm run mvp:self-agent first.');
  }

  const kit = inputKit ?? readJson(finalInputKitPath);
  const createdAt = nowIso();
  const templateInitId = createTemplateInitId(new Date(createdAt));
  const finalOutputDir = outputDir ?? path.join(root, 'runtime/input-templates', templateInitId);
  mkdirSync(templatesDir, { recursive: true });
  mkdirSync(finalOutputDir, { recursive: true });

  const templateRecords = [];
  for (const item of kit.files_to_prepare ?? []) {
    templateRecords.push(makeTemplateRecord({
      root,
      item,
      templatesDir,
      sourceTemplate: item.source_template,
      realTargetPath: item.target_path,
      kind: 'primary',
      overwrite
    }));
    if (item.companion_preview_path) {
      templateRecords.push(makeTemplateRecord({
        root,
        item,
        templatesDir,
        sourceTemplate: item.companion_preview_template,
        realTargetPath: item.companion_preview_path,
        kind: 'companion',
        overwrite
      }));
    }
  }

  const readmePath = path.join(templatesDir, 'README.md');
  writeFileSync(readmePath, renderTemplateReadme({ kit, templateRecords }), 'utf8');

  const init = {
    schema_version: 'mvp_external_input_templates.v1',
    template_init_id: templateInitId,
    created_at: createdAt,
    source_kit_id: kit.kit_id,
    input_kit_path: finalInputKitPath ? relativeOrNull(root, finalInputKitPath) : null,
    templates_dir: relativeOrNull(root, templatesDir),
    readme_path: relativeOrNull(root, readmePath),
    overwrite,
    templates: templateRecords,
    target_files_intentionally_not_written: (kit.files_to_prepare ?? []).flatMap((item) => [
      item.target_path,
      item.companion_preview_path
    ].filter(Boolean)),
    next_commands: [
      'npm run mvp:inputs:check',
      'npm run mvp:self-agent after readiness says ready_for_real_input_trial=true'
    ]
  };
  const jsonPath = path.join(finalOutputDir, 'mvp-external-input-templates.json');
  const markdownPath = path.join(finalOutputDir, 'mvp-external-input-templates.md');
  writeFileSync(jsonPath, `${JSON.stringify(init, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, templateInitMarkdown(init), 'utf8');

  return {
    init,
    written: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      contract: init.schema_version,
      templates_dir: templatesDir,
      readme_path: readmePath
    }
  };
}
