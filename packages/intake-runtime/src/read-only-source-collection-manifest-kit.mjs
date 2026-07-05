import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { nowIso, stableSlug } from './intake-normalizer.mjs';

function timestampId(date = new Date()) {
  return date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function relativeOrNull(root, filePath) {
  if (!filePath) return null;
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function sourcePath(sourceDir, fileName) {
  return path.join(sourceDir, fileName).replaceAll(path.sep, '/');
}

function defaultTemplateSources(sourceDir) {
  return [
    {
      source_id: 'wechat_export_real_001',
      source_kind: 'external_chat_export',
      file: sourcePath(sourceDir, 'wechat-export.real.txt'),
      platform: 'wechat_desktop_or_export',
      thread_title: 'replace_with_contact_or_group_title',
      participants: ['user', 'replace_with_counterparty'],
      privacy_level: 'redacted_text',
      confidence: 0.7
    },
    {
      source_id: 'web_page_real_001',
      source_kind: 'browser_html',
      file: sourcePath(sourceDir, 'web-page.real.html'),
      platform: 'browser_saved_html',
      url: 'replace_with_source_page_url',
      privacy_level: 'redacted_text',
      confidence: 0.7
    },
    {
      source_id: 'business_snapshot_real_001',
      source_kind: 'business_api_snapshot',
      file: sourcePath(sourceDir, 'business-snapshot.real.json'),
      platform: 'business_system_snapshot',
      endpoint: 'replace_with_read_only_endpoint_or_export_name',
      record_id: 'replace_with_business_record_id',
      thread_title: 'replace_with_customer_or_project_title',
      participants: ['user', 'business_system'],
      privacy_level: 'redacted_text',
      confidence: 0.7
    },
    {
      source_id: 'other_software_export_real_001',
      source_kind: 'external_chat_export',
      file: sourcePath(sourceDir, 'other-software-export.real.txt'),
      platform: 'other_chat_or_software_export',
      thread_title: 'replace_with_external_thread_title',
      participants: ['user', 'replace_with_counterparty_or_system'],
      privacy_level: 'redacted_text',
      confidence: 0.6
    }
  ];
}

function manifestTemplate({ collectionId, sourceDir }) {
  return {
    schema_version: 'read_only_source_collection_manifest.v1',
    collection_id: collectionId,
    metadata: {
      template_only: true,
      real_execution_allowed: false,
      real_send_attempted: false,
      generated_by: 'read_only_source_collection_manifest_kit.v1',
      note: 'Replace placeholder paths and values before using this as a real manifest.'
    },
    sources: defaultTemplateSources(sourceDir)
  };
}

function renderMarkdown(kit) {
  const rows = kit.recommended_sources
    .map((item) => `| ${item.source_id} | ${item.source_kind} | ${item.platform} | ${item.file} |`)
    .join('\n');
  const commands = kit.next_commands.map((item) => `- ${item}`).join('\n');

  return `# Read-Only Source Collection Manifest Kit

- kit_id: ${kit.kit_id}
- collection_id: ${kit.collection_id}
- template_only: ${kit.template_only}
- real_execution_allowed: ${kit.real_execution_allowed}
- real_send_attempted: ${kit.real_send_attempted}
- target_manifest_path: ${kit.target_manifest_path}
- target_manifest_intentionally_not_written: ${kit.target_manifest_intentionally_not_written}
- template_path: ${kit.template_path}

## Recommended Sources

| source_id | source_kind | platform | file |
| --- | --- | --- | --- |
${rows}

## Next Commands

${commands}

## Stop Or Adjust When

${kit.stop_or_adjust_when.map((item) => `- ${item}`).join('\n')}
`;
}

function renderReadme(kit) {
  return `# Read-Only Source Collection Inputs

This directory is a staging area for saved read-only source files referenced by ${kit.kit_id}.

The kit does not create real source files or the real target manifest. Template files must not be treated as real samples.

## Expected Files

${kit.recommended_sources.map((item) => `- ${item.file}: ${item.source_kind} from ${item.platform}`).join('\n')}

## Validation Flow

${kit.next_commands.map((item) => `- ${item}`).join('\n')}
`;
}

export function buildReadOnlySourceCollectionManifestKit({
  root = process.cwd(),
  collectionId = null,
  targetManifestPath = 'runtime/user-inputs/read-only-source-collection.manifest.json',
  sourceDir = 'runtime/user-inputs/read-only-sources',
  generatedBy = 'read-only-source-collection-manifest-kit'
} = {}) {
  const normalizedCollectionId = collectionId
    ? stableSlug(collectionId)
    : `read_only_source_collection_${timestampId()}`;
  const kitId = `read_only_source_collection_manifest_kit_${timestampId()}`;
  const templateFile = 'read-only-source-collection.manifest.template.json';
  const readmeFile = 'README.md';
  const template = manifestTemplate({
    collectionId: normalizedCollectionId,
    sourceDir
  });
  const collectCommand = [
    'npm.cmd run intake:read-only:collect --',
    `--manifest=${targetManifestPath}`,
    '--run-trial',
    '--pilot-import=runtime/user-inputs/pilot-import.real.json',
    '--fail-on-required'
  ].join(' ');
  const checkCommand = [
    'npm.cmd run intake:read-only:manifest:check --',
    `--manifest=${targetManifestPath}`,
    '--fail-on-required'
  ].join(' ');

  return {
    schema_version: 'read_only_source_collection_manifest_kit.v1',
    kit_id: kitId,
    created_at: nowIso(),
    generated_by: generatedBy,
    collection_id: normalizedCollectionId,
    template_only: true,
    real_execution_allowed: false,
    real_send_attempted: false,
    target_manifest_path: targetManifestPath,
    target_manifest_intentionally_not_written: true,
    recommended_source_dir: sourceDir,
    recommended_sources: template.sources,
    templates: {
      manifest_template_file: templateFile,
      readme_file: readmeFile
    },
    template_payloads: {
      manifest: template
    },
    next_commands: [
      checkCommand,
      collectCommand,
      'npm.cmd run intake:read-only:workpack',
      'npm.cmd run mvp:status'
    ],
    continue_when: [
      'The target manifest exists outside this template kit.',
      'All source file paths in the target manifest point to saved local read-only files.',
      'read_only_source_collection.v1.required_failures is empty.',
      'read_only_source_collection.v1.real_send_attempted=false.',
      'downstream graph_loop_gate_decision is read_only_expansion_graph_loop_verified before using generated drafts.'
    ],
    stop_or_adjust_when: [
      'Any source requires logging in, clicking send/submit, or calling a live external API from this command.',
      'A source file is a copied sample, placeholder, or template.',
      'The manifest references files outside the intended local staging or evidence directories without operator review.',
      'Any downstream artifact sets real_execution_allowed=true or real_send_attempted=true.'
    ]
  };
}

export function writeReadOnlySourceCollectionManifestKit({
  kit,
  root = process.cwd(),
  outputDir = path.join(root, 'runtime/read-only-source-collection-manifest-kits', kit?.kit_id ?? `read_only_source_collection_manifest_kit_${timestampId()}`)
} = {}) {
  if (!kit) throw new Error('writeReadOnlySourceCollectionManifestKit requires kit');
  mkdirSync(outputDir, { recursive: true });
  const sourceDir = path.resolve(root, kit.recommended_source_dir);
  mkdirSync(sourceDir, { recursive: true });

  const templatePath = path.join(outputDir, kit.templates.manifest_template_file);
  const readmePath = path.join(sourceDir, kit.templates.readme_file);
  const jsonPath = path.join(outputDir, 'read-only-source-collection-manifest-kit.json');
  const markdownPath = path.join(outputDir, 'read-only-source-collection-manifest-kit.md');
  const targetManifestExists = existsSync(path.resolve(root, kit.target_manifest_path));
  const report = {
    ...kit,
    output_dir: relativeOrNull(root, outputDir),
    template_path: relativeOrNull(root, templatePath),
    readme_path: relativeOrNull(root, readmePath),
    target_manifest_exists: targetManifestExists
  };

  writeFileSync(templatePath, `${JSON.stringify(kit.template_payloads.manifest, null, 2)}\n`, 'utf8');
  writeFileSync(readmePath, renderReadme(report), 'utf8');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdown(report), 'utf8');

  return {
    kit: report,
    written: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      template_path: templatePath,
      readme_path: readmePath,
      contract: report.schema_version
    }
  };
}
