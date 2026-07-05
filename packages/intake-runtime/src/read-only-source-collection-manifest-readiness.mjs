import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { nowIso } from './intake-normalizer.mjs';

const RECOMMENDED_SOURCE_KINDS = [
  'external_chat_export',
  'browser_html',
  'business_api_snapshot'
];

function timestampId(date = new Date()) {
  return date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function relativeOrOriginal(root, filePath) {
  if (!filePath) return null;
  const relative = path.relative(root, filePath);
  return relative.startsWith('..') ? filePath : relative.replaceAll(path.sep, '/');
}

function sourceIdFor(source, index) {
  return source?.source_id
    ?? source?.id
    ?? `${normalizeSourceKind(source?.source_kind ?? source?.kind ?? source?.type) || 'source'}_${index + 1}`;
}

function normalizeSourceKind(kind) {
  const normalized = String(kind ?? '').trim().toLowerCase();
  const aliases = {
    chat_export: 'external_chat_export',
    external_chat: 'external_chat_export',
    external_chat_file: 'external_chat_export',
    web_html: 'browser_html',
    saved_page_html: 'browser_html',
    browser: 'browser_html',
    business_api: 'business_api_snapshot',
    api_snapshot: 'business_api_snapshot',
    business_snapshot: 'business_api_snapshot'
  };
  return aliases[normalized] ?? normalized;
}

function sourceFile(source) {
  return source?.file
    ?? source?.path
    ?? source?.html
    ?? source?.json
    ?? source?.export_path
    ?? source?.snapshot_path
    ?? null;
}

function sourceKindCounts(results) {
  return results.reduce((acc, item) => {
    if (item.normalized_source_kind) {
      acc[item.normalized_source_kind] = (acc[item.normalized_source_kind] ?? 0) + 1;
    }
    return acc;
  }, {});
}

function includesPlaceholder(value) {
  return /replace_with|template_only|sample_|\.sample\.|\.template/i.test(String(value ?? ''));
}

function manifestHasPlaceholder(source) {
  return [
    source?.source_id,
    source?.file,
    source?.path,
    source?.html,
    source?.json,
    source?.export_path,
    source?.snapshot_path,
    source?.thread_title,
    source?.thread_id,
    source?.platform,
    source?.endpoint,
    source?.record_id,
    ...(Array.isArray(source?.participants) ? source.participants : [source?.participants]),
    ...(Array.isArray(source?.participant_hints) ? source.participant_hints : [source?.participant_hints])
  ].some(includesPlaceholder);
}

function unsafeTemplatePath(filePath) {
  const normalized = String(filePath ?? '').replaceAll('\\', '/').toLowerCase();
  return normalized.includes('/examples/')
    || normalized.startsWith('examples/')
    || normalized.includes('/read-only-source-collection-manifest-kits/')
    || normalized.endsWith('.template')
    || normalized.includes('.template.')
    || normalized.endsWith('/readme.md')
    || normalized.endsWith('read-only-source-collection.manifest.template.json');
}

function check(checkId, passed, evidence, severity = 'required') {
  return {
    check_id: checkId,
    severity,
    status: passed ? 'pass' : 'fail',
    passed: Boolean(passed),
    evidence
  };
}

function evaluateSource({ root, source, index }) {
  const sourceId = sourceIdFor(source, index);
  const sourceKind = source?.source_kind ?? source?.kind ?? source?.type ?? null;
  const normalizedSourceKind = normalizeSourceKind(sourceKind);
  const fileArg = sourceFile(source);
  const absolutePath = fileArg ? path.resolve(root, fileArg) : null;
  const exists = Boolean(absolutePath && existsSync(absolutePath));
  const isFile = Boolean(exists && statSync(absolutePath).isFile());
  const sizeBytes = isFile ? statSync(absolutePath).size : 0;
  const requiredFailures = [];
  const warningFailures = [];

  if (!sourceId) requiredFailures.push('source_id_missing');
  if (!RECOMMENDED_SOURCE_KINDS.includes(normalizedSourceKind)) {
    requiredFailures.push(`unsupported_source_kind:${sourceKind ?? 'missing'}`);
  }
  if (!fileArg) requiredFailures.push('source_file_missing');
  if (fileArg && !exists) requiredFailures.push('source_file_not_found');
  if (exists && !isFile) requiredFailures.push('source_path_not_file');
  if (isFile && sizeBytes === 0) requiredFailures.push('source_file_empty');
  if (fileArg && unsafeTemplatePath(fileArg)) requiredFailures.push('source_path_points_to_sample_or_template');
  if (manifestHasPlaceholder(source)) requiredFailures.push('source_contains_placeholder_value');
  if (source?.real_execution_allowed === true) requiredFailures.push('source_real_execution_allowed_true');
  if (source?.real_send_attempted === true) requiredFailures.push('source_real_send_attempted_true');
  if (absolutePath && path.relative(root, absolutePath).startsWith('..')) {
    warningFailures.push('source_path_outside_workspace_requires_operator_review');
  }

  return {
    source_id: sourceId,
    source_kind: sourceKind,
    normalized_source_kind: normalizedSourceKind,
    source_path: fileArg,
    absolute_source_path: absolutePath,
    source_exists: exists,
    source_is_file: isFile,
    source_size_bytes: sizeBytes,
    ready_for_collection: requiredFailures.length === 0,
    required_failures: requiredFailures,
    warning_failures: warningFailures
  };
}

function duplicateSourceIds(results) {
  const counts = results.reduce((acc, item) => {
    acc[item.source_id] = (acc[item.source_id] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([sourceId]) => sourceId);
}

function renderMarkdown(readiness) {
  const rows = readiness.source_results.length
    ? readiness.source_results
      .map((item) => `| ${item.source_id} | ${item.normalized_source_kind} | ${item.ready_for_collection} | ${item.source_path ?? 'missing'} | ${item.required_failures.join(',') || 'none'} |`)
      .join('\n')
    : '| none | none | false | none | none |';
  const checks = readiness.checks
    .map((item) => `- ${item.status.toUpperCase()} ${item.check_id}: ${item.evidence.join('; ')}`)
    .join('\n');
  return `# Read-Only Source Collection Manifest Readiness

- readiness_id: ${readiness.readiness_id}
- gate_decision: ${readiness.gate_decision}
- ready_for_collection: ${readiness.ready_for_collection}
- real_execution_allowed: ${readiness.real_execution_allowed}
- real_send_attempted: ${readiness.real_send_attempted}
- manifest_path: ${readiness.source.manifest_path ?? 'missing'}

## Sources

| source_id | source_kind | ready | source_path | required_failures |
| --- | --- | --- | --- | --- |
${rows}

## Checks

${checks}

## Next Commands

\`\`\`powershell
${readiness.next_commands.join('\n')}
\`\`\`
`;
}

export function buildReadOnlySourceCollectionManifestReadiness({
  root = process.cwd(),
  manifest = null,
  manifestPath = null,
  manifestReadError = null,
  requireRecommendedKinds = false
} = {}) {
  const createdAt = nowIso();
  const readinessId = `read_only_source_collection_manifest_readiness_${timestampId(new Date(createdAt))}`;
  const sources = Array.isArray(manifest?.sources) ? manifest.sources : [];
  const sourceResults = sources.map((source, index) => evaluateSource({ root, source, index }));
  const duplicateIds = duplicateSourceIds(sourceResults);
  const counts = sourceKindCounts(sourceResults);
  const missingRecommendedKinds = RECOMMENDED_SOURCE_KINDS.filter((kind) => !counts[kind]);
  const manifestMetadata = manifest?.metadata ?? {};
  const manifestPathLabel = manifestPath ? relativeOrOriginal(root, manifestPath) : null;
  const requiredChecks = [
    check('manifest_readable', !manifestReadError && Boolean(manifest), [
      `manifest_error=${manifestReadError ?? 'none'}`
    ]),
    check('manifest_schema_version_valid', manifest?.schema_version === 'read_only_source_collection_manifest.v1', [
      `schema_version=${manifest?.schema_version ?? 'missing'}`
    ]),
    check('manifest_not_template', manifestMetadata.template_only !== true, [
      `template_only=${manifestMetadata.template_only === true}`
    ]),
    check('manifest_sources_present', sources.length > 0, [`sources=${sources.length}`]),
    check('source_ids_unique', duplicateIds.length === 0, [
      `duplicate_source_ids=${duplicateIds.join(',') || 'none'}`
    ]),
    check('all_sources_ready_for_collection', sourceResults.length > 0
      && sourceResults.every((item) => item.ready_for_collection), [
      `ready=${sourceResults.filter((item) => item.ready_for_collection).length}`,
      `sources=${sourceResults.length}`
    ]),
    check('real_send_blocked', manifestMetadata.real_execution_allowed !== true
      && manifestMetadata.real_send_attempted !== true
      && sourceResults.every((item) => !item.required_failures.includes('source_real_execution_allowed_true')
        && !item.required_failures.includes('source_real_send_attempted_true')), [
      `manifest_real_execution_allowed=${manifestMetadata.real_execution_allowed === true}`,
      `manifest_real_send_attempted=${manifestMetadata.real_send_attempted === true}`
    ])
  ];
  const warningChecks = [
    check('recommended_source_kind_coverage', missingRecommendedKinds.length === 0, [
      `missing_recommended_source_kinds=${missingRecommendedKinds.join(',') || 'none'}`
    ], requireRecommendedKinds ? 'required' : 'warning')
  ];
  const checks = [...requiredChecks, ...warningChecks];
  const sourceRequiredFailures = sourceResults.flatMap((item) =>
    item.required_failures.map((failure) => `source:${item.source_id}:${failure}`));
  const sourceWarningFailures = sourceResults.flatMap((item) =>
    item.warning_failures.map((failure) => `source:${item.source_id}:${failure}`));
  const requiredFailures = [
    ...checks.filter((item) => item.severity === 'required' && !item.passed).map((item) => item.check_id),
    ...sourceRequiredFailures
  ];
  const warningFailures = [
    ...checks.filter((item) => item.severity === 'warning' && !item.passed).map((item) => item.check_id),
    ...sourceWarningFailures
  ];
  const ready = requiredFailures.length === 0;
  const collectCommand = [
    'npm.cmd run intake:read-only:collect --',
    `--manifest=${manifestPathLabel ?? '<read-only-source-collection.manifest.json>'}`,
    '--run-trial',
    '--pilot-import=runtime/user-inputs/pilot-import.real.json',
    '--fail-on-required'
  ].join(' ');

  return {
    schema_version: 'read_only_source_collection_manifest_readiness.v1',
    readiness_id: readinessId,
    created_at: createdAt,
    gate_decision: ready
      ? 'read_only_source_collection_manifest_ready_for_collection'
      : 'read_only_source_collection_manifest_needs_attention',
    ready_for_collection: ready,
    real_execution_allowed: false,
    real_send_attempted: false,
    source: {
      root,
      manifest_path: manifestPathLabel
    },
    summary: {
      manifest_sources: sources.length,
      ready_sources: sourceResults.filter((item) => item.ready_for_collection).length,
      missing_source_files: sourceResults.filter((item) => item.required_failures.includes('source_file_not_found')).length,
      source_kind_counts: counts,
      missing_recommended_source_kinds: missingRecommendedKinds,
      duplicate_source_ids: duplicateIds
    },
    source_results: sourceResults.map((item) => ({
      ...item,
      absolute_source_path: undefined
    })),
    checks,
    required_failures: requiredFailures,
    warning_failures: warningFailures,
    next_commands: ready
      ? [
        collectCommand,
        'npm.cmd run intake:read-only:workpack',
        'npm.cmd run mvp:status'
      ]
      : [
        'Fix read_only_source_collection_manifest_readiness.v1.required_failures.',
        `npm.cmd run intake:read-only:manifest:check -- --manifest=${manifestPathLabel ?? '<read-only-source-collection.manifest.json>'} --fail-on-required`
      ],
    continue_when: [
      'ready_for_collection=true.',
      'required_failures is empty.',
      'Every source file exists locally and is not a sample/template path.',
      'real_execution_allowed=false and real_send_attempted=false.'
    ],
    stop_or_adjust_when: [
      'The manifest still has metadata.template_only=true.',
      'Any source path points to examples, template files, generated handoff kits or README placeholders.',
      'Any source requires opening external software, calling a live API or clicking send/submit.',
      'Any source or manifest sets real_execution_allowed=true or real_send_attempted=true.'
    ]
  };
}

export function readReadOnlySourceCollectionManifest(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

export function writeReadOnlySourceCollectionManifestReadiness({
  readiness,
  outputDir = path.join(process.cwd(), 'runtime/read-only-source-collection-manifest-readiness', readiness?.readiness_id ?? `read_only_source_collection_manifest_readiness_${timestampId()}`)
} = {}) {
  if (!readiness) throw new Error('writeReadOnlySourceCollectionManifestReadiness requires readiness');
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'read-only-source-collection-manifest-readiness.json');
  const markdownPath = path.join(outputDir, 'read-only-source-collection-manifest-readiness.md');
  writeFileSync(jsonPath, `${JSON.stringify(readiness, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdown(readiness), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath,
    contract: readiness.schema_version,
    gate_decision: readiness.gate_decision,
    ready_for_collection: readiness.ready_for_collection
  };
}
