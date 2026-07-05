import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const expectedObjectiveFlow = [
  'user_goal',
  'relationship_context',
  'event_recording',
  'decision_recommendation',
  'trigger_plan',
  'platform_snapshot_validation',
  'feedback',
  'writeback',
  'index_rebuild',
  'audit'
];

const requiredStaticObsidianFiles = [
  'examples/system-process-tree.json',
  'views/obsidian/system-process-tree.md',
  'views/obsidian/system-process-tree.canvas'
];

const requiredValidationArtifacts = [
  'schemas/process-tree-validation.schema.json',
  'packages/mvp-runtime/src/process-tree-validation.mjs',
  'scripts/validate-process-tree.mjs',
  'runtime/process-tree-validations/**'
];

const allowedOpenIssueIds = new Set([
  'PT-003',
  'PT-004',
  'PT-028',
  'PT-029',
  'PT-030',
  'PT-031'
]);

function projectRoot() {
  return path.resolve(here, '../../..');
}

function findDefaultDocsMainPath(root) {
  const docsDir = path.join(root, 'docs');
  const match = readdirSync(docsDir).find((name) => name.startsWith('15-') && name.endsWith('.md'));
  return match ? path.join(docsDir, match) : path.join(docsDir, '15.md');
}

function nowIso() {
  return new Date().toISOString();
}

function createValidationId(date = new Date()) {
  return `process_tree_validation_${date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readText(filePath) {
  return readFileSync(filePath, 'utf8');
}

function normalizePath(value) {
  return String(value ?? '').replaceAll('\\', '/');
}

function relativeOrNull(root, filePath) {
  if (!filePath) return null;
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function includesAllInOrder(actual, expected) {
  if (!Array.isArray(actual)) return false;
  let cursor = 0;
  for (const item of actual) {
    if (item === expected[cursor]) cursor += 1;
    if (cursor === expected.length) return true;
  }
  return false;
}

function makeCheck({
  check_id,
  label,
  passed,
  severity = 'required',
  evidence = [],
  fix = null
}) {
  return {
    check_id,
    label,
    severity,
    status: passed ? 'pass' : 'fail',
    passed: Boolean(passed),
    evidence: evidence.filter((item) => item !== undefined && item !== null && item !== ''),
    fix
  };
}

function registeredPaths(processTree) {
  const artifactPaths = (processTree.artifact_registry ?? []).map((item) => normalizePath(item.path));
  const flowArtifacts = (processTree.flow_artifacts ?? []).map(normalizePath);
  const requiredTargets = (processTree.document_governance?.required_sync_targets ?? []).map(normalizePath);
  return new Set([...artifactPaths, ...flowArtifacts, ...requiredTargets]);
}

function canvasText(canvas) {
  return [
    ...(canvas.nodes ?? []).map((node) => [
      node.id,
      node.file,
      node.text
    ].filter(Boolean).join('\n')),
    ...(canvas.edges ?? []).map((edge) => [
      edge.id,
      edge.fromNode,
      edge.toNode,
      edge.label
    ].filter(Boolean).join('\n'))
  ].join('\n');
}

function canvasNodeIds(canvas) {
  return new Set((canvas.nodes ?? []).map((node) => node.id));
}

function issueNodeId(issueId) {
  return String(issueId ?? '').toLowerCase().replace('-', '_');
}

function markdownHasIssue(markdown, issueId) {
  return markdown.includes(issueId);
}

function canvasHasIssue(canvas, issueId) {
  const text = canvasText(canvas);
  return text.includes(issueId) || canvasNodeIds(canvas).has(issueNodeId(issueId));
}

function markdownHasNode(markdown, node) {
  return markdown.includes(node.node_id) || markdown.includes(node.label);
}

function registryHasAll(registered, expectedPaths) {
  return expectedPaths.every((item) => registered.has(item));
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function validationMarkdown(validation) {
  const rows = validation.checks
    .map((check) => `| ${escapeCell(check.check_id)} | ${escapeCell(check.severity)} | ${escapeCell(check.status)} | ${escapeCell(check.label)} |`)
    .join('\n');
  const failures = validation.required_failures.length
    ? validation.required_failures.map((item) => `- ${item}`).join('\n')
    : '- none';

  return `# Process Tree Validation

- validation_id: ${validation.validation_id}
- created_at: ${validation.created_at}
- gate_decision: ${validation.gate_decision}
- required_failures: ${validation.required_failures.join(', ') || 'none'}
- warning_failures: ${validation.warning_failures.join(', ') || 'none'}

## Sources

- process_tree: ${validation.source.process_tree_path}
- docs_main: ${validation.source.docs_main_path}
- obsidian_markdown: ${validation.source.obsidian_markdown_path}
- obsidian_canvas: ${validation.source.obsidian_canvas_path}

## Checks

| check_id | severity | status | label |
| --- | --- | --- | --- |
${rows}

## Required Failures

${failures}
`;
}

export function validateProcessTreeSync({
  root = projectRoot(),
  processTreePath = path.join(root, 'examples/system-process-tree.json'),
  docsMainPath = findDefaultDocsMainPath(root),
  obsidianMarkdownPath = path.join(root, 'views/obsidian/system-process-tree.md'),
  obsidianCanvasPath = path.join(root, 'views/obsidian/system-process-tree.canvas')
} = {}) {
  const createdAt = nowIso();
  const processTree = readJson(processTreePath);
  const docsMain = readText(docsMainPath);
  const obsidianMarkdown = readText(obsidianMarkdownPath);
  const obsidianCanvas = readJson(obsidianCanvasPath);
  const nodeIds = new Set((processTree.nodes ?? []).map((node) => node.node_id));
  const canonicalNodes = expectedObjectiveFlow
    .map((nodeId) => (processTree.nodes ?? []).find((node) => node.node_id === nodeId))
    .filter(Boolean);
  const issues = processTree.issue_register ?? [];
  const registered = registeredPaths(processTree);
  const canvasIds = canvasNodeIds(obsidianCanvas);
  const canvasBody = canvasText(obsidianCanvas);
  const docsMainRelativePath = normalizePath(relativeOrNull(root, docsMainPath));
  const requiredObsidianFiles = [docsMainRelativePath, ...requiredStaticObsidianFiles];
  const docsMainRequiredFiles = requiredObsidianFiles;

  const checks = [
    makeCheck({
      check_id: 'process_tree_json_readable',
      label: 'Process tree JSON is readable and contains nodes plus issue register',
      passed: processTree.tree_id === 'human_social_assistant_process_tree'
        && Array.isArray(processTree.nodes)
        && processTree.nodes.length >= expectedObjectiveFlow.length
        && Array.isArray(processTree.issue_register),
      evidence: [`tree_id=${processTree.tree_id}`, `nodes=${processTree.nodes?.length}`, `issues=${processTree.issue_register?.length}`],
      fix: 'Repair examples/system-process-tree.json structure or required fields.'
    }),
    makeCheck({
      check_id: 'canonical_flow_matches_objective',
      label: 'Canonical flow matches the objective loop order',
      passed: includesAllInOrder(processTree.canonical_flow, expectedObjectiveFlow),
      evidence: [`canonical_flow=${(processTree.canonical_flow ?? []).join(' -> ')}`],
      fix: 'Update canonical_flow to follow the objective loop order.'
    }),
    makeCheck({
      check_id: 'canonical_nodes_registered',
      label: 'Every canonical node is registered in nodes',
      passed: expectedObjectiveFlow.every((nodeId) => nodeIds.has(nodeId)),
      evidence: expectedObjectiveFlow.map((nodeId) => `${nodeId}=${nodeIds.has(nodeId)}`),
      fix: 'Add missing nodes to examples/system-process-tree.json.nodes.'
    }),
    makeCheck({
      check_id: 'docs_main_mentions_observability_views',
      label: 'Docs main mentions the machine tree and Obsidian views',
      passed: docsMainRequiredFiles.every((item) => docsMain.includes(item)),
      evidence: docsMainRequiredFiles.map((item) => `${item}=${docsMain.includes(item)}`),
      fix: 'Add machine tree, Obsidian Markdown and Canvas entries to docs/15.'
    }),
    makeCheck({
      check_id: 'obsidian_markdown_has_sync_rule',
      label: 'Obsidian Markdown keeps the sync rule',
      passed: obsidianMarkdown.toLowerCase().includes('sync rule')
        && obsidianMarkdown.includes('system-process-tree.canvas'),
      evidence: [
        `has_sync_rule=${obsidianMarkdown.toLowerCase().includes('sync rule')}`,
        `mentions_canvas=${obsidianMarkdown.includes('system-process-tree.canvas')}`
      ],
      fix: 'Add the sync rule to views/obsidian/system-process-tree.md.'
    }),
    makeCheck({
      check_id: 'obsidian_markdown_has_all_canonical_nodes',
      label: 'Obsidian Markdown shows all canonical nodes',
      passed: canonicalNodes.every((node) => markdownHasNode(obsidianMarkdown, node)),
      evidence: canonicalNodes.map((node) => `${node.node_id}/${node.label}=${markdownHasNode(obsidianMarkdown, node)}`),
      fix: 'Add missing canonical nodes to the Obsidian Markdown view.'
    }),
    makeCheck({
      check_id: 'obsidian_canvas_json_readable',
      label: 'Obsidian Canvas JSON is readable and contains nodes plus edges',
      passed: Array.isArray(obsidianCanvas.nodes) && obsidianCanvas.nodes.length > 0 && Array.isArray(obsidianCanvas.edges) && obsidianCanvas.edges.length > 0,
      evidence: [`nodes=${obsidianCanvas.nodes?.length}`, `edges=${obsidianCanvas.edges?.length}`],
      fix: 'Repair views/obsidian/system-process-tree.canvas JSON or Canvas structure.'
    }),
    makeCheck({
      check_id: 'obsidian_canvas_has_all_canonical_nodes',
      label: 'Obsidian Canvas shows all canonical nodes',
      passed: expectedObjectiveFlow.every((nodeId) => canvasIds.has(nodeId)),
      evidence: expectedObjectiveFlow.map((nodeId) => `${nodeId}=${canvasIds.has(nodeId)}`),
      fix: 'Add missing canonical node cards to the Canvas view.'
    }),
    makeCheck({
      check_id: 'issue_register_synced_to_obsidian',
      label: 'Issue register IDs are synced to Obsidian Markdown and Canvas',
      passed: issues.every((issue) => markdownHasIssue(obsidianMarkdown, issue.issue_id) && canvasHasIssue(obsidianCanvas, issue.issue_id)),
      evidence: issues.map((issue) => `${issue.issue_id}=md:${markdownHasIssue(obsidianMarkdown, issue.issue_id)},canvas:${canvasHasIssue(obsidianCanvas, issue.issue_id)}`),
      fix: 'Add missing PT items to the Obsidian Markdown issue table and Canvas cards.'
    }),
    makeCheck({
      check_id: 'required_observability_files_registered',
      label: 'Process tree, Obsidian and validation files are registered',
      passed: registryHasAll(registered, [...requiredObsidianFiles, ...requiredValidationArtifacts]),
      evidence: [...requiredObsidianFiles, ...requiredValidationArtifacts].map((item) => `${item}=${registered.has(item)}`),
      fix: 'Register missing files in flow_artifacts, required_sync_targets or artifact_registry.'
    }),
    makeCheck({
      check_id: 'process_tree_validation_node_visible',
      label: 'Process-tree validation command is visible in Canvas and Markdown',
      passed: obsidianMarkdown.includes('process-tree:validate') && canvasBody.includes('process-tree:validate'),
      evidence: [`markdown_process_tree_validate=${obsidianMarkdown.includes('process-tree:validate')}`, `canvas_process_tree_validate=${canvasBody.includes('process-tree:validate')}`],
      fix: 'Add process-tree:validate to the Obsidian Markdown and Canvas governance views.'
    }),
    makeCheck({
      check_id: 'open_items_limited_to_external_inputs',
      label: 'Open items are limited to real-material gates or registered extension designs',
      severity: 'warning',
      passed: issues.filter((issue) => issue.status !== 'closed').every((issue) => allowedOpenIssueIds.has(issue.issue_id)),
      evidence: issues.filter((issue) => issue.status !== 'closed').map((issue) => `${issue.issue_id}:${issue.status}`)
    })
  ];
  const requiredFailures = checks
    .filter((check) => check.severity === 'required' && !check.passed)
    .map((check) => check.check_id);
  const warningFailures = checks
    .filter((check) => check.severity === 'warning' && !check.passed)
    .map((check) => check.check_id);

  return {
    schema_version: 'process_tree_validation.v1',
    validation_id: createValidationId(new Date(createdAt)),
    created_at: createdAt,
    gate_decision: requiredFailures.length
      ? 'process_tree_sync_failed'
      : 'process_tree_synced',
    source: {
      root,
      process_tree_path: relativeOrNull(root, processTreePath),
      docs_main_path: relativeOrNull(root, docsMainPath),
      obsidian_markdown_path: relativeOrNull(root, obsidianMarkdownPath),
      obsidian_canvas_path: relativeOrNull(root, obsidianCanvasPath)
    },
    expected_objective_flow: expectedObjectiveFlow,
    checks,
    required_failures: requiredFailures,
    warning_failures: warningFailures,
    continue_when: ['gate_decision=process_tree_synced', 'required_failures is empty', 'Obsidian Markdown and Canvas show the main flow and issue register'],
    stop_or_adjust_when: ['Any required check fails', 'A new file is missing from artifact_registry or flow_artifacts', 'A PT issue exists only in conversation and is not synced to process tree and Obsidian']
  };
}

export function writeProcessTreeValidation({
  validation,
  outputDir = path.join(projectRoot(), 'runtime/process-tree-validations', validation?.validation_id ?? createValidationId())
} = {}) {
  if (!validation) throw new Error('writeProcessTreeValidation requires validation');
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'process-tree-validation.json');
  const markdownPath = path.join(outputDir, 'process-tree-validation.md');
  writeFileSync(jsonPath, `${JSON.stringify(validation, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, validationMarkdown(validation), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath,
    contract: validation.schema_version,
    gate_decision: validation.gate_decision,
    required_failures: validation.required_failures
  };
}
