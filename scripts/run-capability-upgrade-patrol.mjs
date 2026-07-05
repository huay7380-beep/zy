import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function nowIso() {
  return new Date().toISOString();
}

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSlash(value) {
  return String(value).replace(/\\/g, '/');
}

function isScriptPath(value) {
  return /(^|\/)scripts\/.+\.(mjs|js|ts)$/.test(normalizeSlash(value));
}

function isRuntimePath(value) {
  return normalizeSlash(value).startsWith('runtime/');
}

function isSchemaPath(value) {
  return normalizeSlash(value).startsWith('schemas/');
}

function isExampleOrDataPath(value) {
  const normalized = normalizeSlash(value);
  return normalized.startsWith('examples/')
    || normalized.startsWith('data/')
    || normalized.includes('/sample')
    || normalized.includes('.sample.');
}

function isProcessingPath(value) {
  const normalized = normalizeSlash(value);
  return normalized.startsWith('packages/')
    || normalized.startsWith('scripts/')
    || normalized.startsWith('sightflow-desktop-agent-main/')
    || normalized.startsWith('3d-particle-display-os/')
    || normalized.startsWith('capability-upgrade-registry/');
}

function scriptStem(filePath) {
  return path.basename(filePath).replace(/\.(mjs|js|ts)$/, '');
}

function packageValidationCommandsForNode(node, packageScripts) {
  const sourceFiles = ensureArray(node.source_files);
  const stems = sourceFiles.filter(isScriptPath).map(scriptStem);
  const nodeTokens = [
    node.node_id,
    ...(node.node_id ?? '').split('_'),
    ...stems
  ].filter(Boolean);

  return Object.entries(packageScripts)
    .filter(([name, command]) => {
      const haystack = `${name} ${command}`.toLowerCase();
      return nodeTokens.some((token) => token && haystack.includes(String(token).toLowerCase()));
    })
    .map(([name]) => `npm run ${name}`)
    .slice(0, 12);
}

function processFamilyFor(node) {
  const id = String(node.node_id ?? '').toLowerCase();
  if (id.includes('identity') || id.includes('relationship')) return 'identity_resolution';
  if (id.includes('event') || id.includes('intake')) return 'event_ingestion';
  if (id.includes('decision')) return 'decision_ranking';
  if (id.includes('trigger')) return 'workflow_orchestration';
  if (id.includes('platform') || id.includes('gui')) return 'gui_state_projection';
  if (id.includes('writeback') || id.includes('index')) return 'data_storage_indexing';
  if (id.includes('audit') || id.includes('governance')) return 'audit_and_validation';
  if (id.includes('capability') || id.includes('tool')) return 'tool_or_adapter_runtime';
  if (id.includes('architecture') || id.includes('goal') || id.includes('engineering')) return 'system_process';

  const text = [
    node.node_id,
    node.label,
    node.purpose,
    ...ensureArray(node.source_files),
    ...ensureArray(node.outputs)
  ].join(' ').toLowerCase();

  if (text.includes('identity') || text.includes('person') || text.includes('channel')) return 'identity_resolution';
  if (text.includes('intake') || text.includes('observation') || text.includes('raw-event') || text.includes('event')) return 'event_ingestion';
  if (text.includes('decision') || text.includes('expert') || text.includes('ranking') || text.includes('romantic')) return 'decision_ranking';
  if (text.includes('trigger') || text.includes('schedule') || text.includes('workflow') || text.includes('timing')) return 'workflow_orchestration';
  if (text.includes('gui') || text.includes('frontend') || text.includes('particle') || text.includes('projection') || text.includes('display')) return 'gui_state_projection';
  if (text.includes('storage') || text.includes('index') || text.includes('writeback')) return 'data_storage_indexing';
  if (text.includes('audit') || text.includes('validation') || text.includes('status')) return 'audit_and_validation';
  if (text.includes('tool') || text.includes('adapter') || text.includes('capability')) return 'tool_or_adapter_runtime';
  return 'system_process';
}

function analogyPatternFor(family) {
  const patterns = {
    identity_resolution: 'Map weak identity hints to stable entities with confidence, merge policy and human confirmation.',
    event_ingestion: 'Normalize multi-source observations into auditable event contracts with validation and provenance.',
    decision_ranking: 'Rank candidate actions with specialist signals, constraints, risk scoring and explainable tradeoffs.',
    workflow_orchestration: 'Schedule or route next steps with state machines, timing windows, retries and stop conditions.',
    gui_state_projection: 'Project runtime state into a display-only UI model with read-only intent outputs.',
    data_storage_indexing: 'Store, write back and rebuild indexes while preserving event sourcing and auditability.',
    audit_and_validation: 'Validate evidence, report gate status and preserve reproducible review trails.',
    tool_or_adapter_runtime: 'Wrap external tools behind capability contracts, dry-run gates and permission boundaries.',
    system_process: 'Decompose a local system process into contracts, evidence, validation and replacement gates.'
  };
  return patterns[family] ?? patterns.system_process;
}

function candidateSearchTermsFor(node, family) {
  const outputs = ensureArray(node.outputs).slice(0, 4).join(' ');
  const sourceHints = ensureArray(node.source_files)
    .filter((item) => normalizeSlash(item).startsWith('packages/'))
    .map((item) => normalizeSlash(item).split('/').slice(0, 2).join('/'))
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 4);

  return [
    `${family} open source library`,
    `${family} benchmark comparison`,
    `${family} workflow engine adapter`,
    `${node.node_id} replacement candidate`,
    outputs ? `${outputs} ${family}` : null,
    ...sourceHints.map((hint) => `${hint} alternative`)
  ].filter(Boolean);
}

function optimizationSignalsFor(node, relatedIssues) {
  const signals = [];
  const status = String(node.status ?? '').toLowerCase();
  const sourceFiles = ensureArray(node.source_files);
  const openQuestions = ensureArray(node.open_questions);

  if (relatedIssues.some((issue) => issue.status !== 'closed')) signals.push('open_issue_or_in_progress_issue');
  if (openQuestions.length > 0) signals.push('open_questions_present');
  if (status.includes('designed') || status.includes('skeleton') || status.includes('boundary')) signals.push('boundary_or_skeleton_status');
  if (sourceFiles.some((item) => /demo|sample|template/i.test(item))) signals.push('demo_sample_or_template_dependency');
  if (!sourceFiles.some((item) => normalizeSlash(item).includes('/tests/'))) signals.push('missing_explicit_test_surface');
  if (sourceFiles.some(isRuntimePath)) signals.push('runtime_evidence_available_for_comparison');
  if (sourceFiles.some(isSchemaPath) && sourceFiles.some(isProcessingPath)) signals.push('io_contract_can_be_checked');
  if (sourceFiles.some(isExampleOrDataPath)) signals.push('input_output_examples_available');

  return [...new Set(signals)];
}

function priorityFor(signals, relatedIssues) {
  const hasHighOpenIssue = relatedIssues.some((issue) => issue.status !== 'closed' && issue.severity === 'high');
  if (hasHighOpenIssue || signals.includes('open_issue_or_in_progress_issue')) return 'high';
  if (signals.includes('boundary_or_skeleton_status') || signals.includes('open_questions_present')) return 'medium';
  return 'low';
}

function buildProcessDecomposition(node, relatedIssues, packageScripts) {
  const sourceFiles = ensureArray(node.source_files);
  const validationCommands = packageValidationCommandsForNode(node, packageScripts);
  const signals = optimizationSignalsFor(node, relatedIssues);

  return {
    node_id: node.node_id,
    label: node.label ?? node.node_id,
    status: node.status ?? 'unknown',
    purpose: node.purpose ?? '',
    inputs: sourceFiles.filter((item) => isSchemaPath(item) || isExampleOrDataPath(item)),
    processing_surface: sourceFiles.filter(isProcessingPath),
    outputs: ensureArray(node.outputs),
    validation_commands: validationCommands,
    related_open_issues: relatedIssues
      .filter((issue) => issue.status !== 'closed')
      .map((issue) => issue.issue_id),
    known_open_questions: ensureArray(node.open_questions),
    optimization_signals: signals
  };
}

function buildAnalogicalTask(node, decomposition) {
  const family = processFamilyFor(node);
  return {
    task_id: `analogical_${node.node_id}`,
    target_node_id: node.node_id,
    target_module_paths: decomposition.processing_surface
      .filter((item) => normalizeSlash(item).startsWith('packages/') || normalizeSlash(item).startsWith('3d-particle-display-os/') || normalizeSlash(item).startsWith('sightflow-desktop-agent-main/'))
      .slice(0, 8),
    process_family: family,
    analogy_pattern: analogyPatternFor(family),
    candidate_search_terms: candidateSearchTermsFor(node, family),
    confirmation_criteria: [
      'io_contract_consistency',
      'event_latency_fit',
      'effectiveness_gain',
      'replacement_complexity_inverse',
      'previous_requirements_alignment',
      'security_and_license_fit',
      'adapter_first_or_rollback_path'
    ],
    network_action_allowed: false,
    replacement_allowed: false
  };
}

function renderMarkdown(report) {
  const queueRows = report.priority_queue
    .map((item) => `| ${item.priority} | ${item.target_node_id} | ${item.reason} | ${item.next_action} |`)
    .join('\n');
  const decompositionRows = report.process_decompositions
    .map((item) => `| ${item.node_id} | ${item.status} | ${item.outputs.length} | ${item.validation_commands.length} | ${item.optimization_signals.join(', ') || 'none'} |`)
    .join('\n');
  const taskRows = report.analogical_search_tasks
    .map((item) => `| ${item.target_node_id} | ${item.process_family} | ${item.candidate_search_terms.slice(0, 3).join('; ')} |`)
    .join('\n');

  return `# Capability Upgrade Patrol

- patrol_id: ${report.patrol_id}
- created_at: ${report.created_at}
- mode: ${report.mode}
- canonical_flow: ${report.execution_mode_summary.canonical_flow.join(' -> ')}
- registered_nodes: ${report.execution_mode_summary.registered_nodes}
- open_or_in_progress_issues: ${report.execution_mode_summary.open_or_in_progress_issues}
- candidate_modules: ${report.execution_mode_summary.candidate_modules}

## Priority Queue

| priority | target_node_id | reason | next_action |
| --- | --- | --- | --- |
${queueRows || '| low | none | no optimization signal found | keep monitoring |'}

## Process Decompositions

| node_id | status | outputs | validation_commands | optimization_signals |
| --- | --- | --- | --- | --- |
${decompositionRows}

## Analogical Search Tasks

| target_node_id | process_family | initial_search_terms |
| --- | --- | --- |
${taskRows}

## Skill Creation Gate

- schema: ${report.skill_creation_gate_standard.schema}
- default_decision_order: ${report.skill_creation_gate_standard.default_decision_order.join(' -> ')}
- required_search_sources: ${report.skill_creation_gate_standard.required_search_sources.join(', ')}
- creation_allowed_only_after_gate_record: ${report.skill_creation_gate_standard.creation_allowed_only_after_gate_record}

## Boundaries

${report.boundaries.map((item) => `- ${item}`).join('\n')}
`;
}

function main() {
  const root = path.resolve('.');
  const processTreePath = path.resolve(argValue('process-tree') ?? 'examples/system-process-tree.json');
  const packageJsonPath = path.resolve(argValue('package-json') ?? 'package.json');
  const createdAt = nowIso();
  const patrolId = `capability_patrol_${compactTimestamp(new Date(createdAt))}`;
  const outputRoot = path.resolve(argValue('output-dir') ?? path.join('runtime', 'capability-upgrade-patrols'));
  const outputDir = path.join(outputRoot, patrolId);

  const processTree = readJson(processTreePath);
  const packageJson = existsSync(packageJsonPath) ? readJson(packageJsonPath) : { scripts: {} };
  const issues = ensureArray(processTree.issue_register);
  const nodes = ensureArray(processTree.nodes);
  const packageScripts = packageJson.scripts ?? {};

  const processDecompositions = nodes.map((node) => {
    const relatedIssues = issues.filter((issue) => issue.node_id === node.node_id);
    return buildProcessDecomposition(node, relatedIssues, packageScripts);
  });
  const analogicalSearchTasks = nodes.map((node) => {
    const decomposition = processDecompositions.find((item) => item.node_id === node.node_id);
    return buildAnalogicalTask(node, decomposition);
  });
  const priorityQueue = processDecompositions
    .map((item) => {
      const relatedIssues = issues.filter((issue) => issue.node_id === item.node_id);
      const priority = priorityFor(item.optimization_signals, relatedIssues);
      return {
        target_node_id: item.node_id,
        priority,
        reason: item.optimization_signals.join(', ') || 'no_current_signal',
        next_action: priority === 'high'
          ? 'write_or_refresh_evaluation_report'
          : priority === 'medium'
            ? 'confirm_analogical_search_terms'
            : 'keep_monitoring'
      };
    })
    .filter((item) => item.priority !== 'low')
    .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]));

  const report = {
    schema_version: 'capability_patrol_report.v1',
    patrol_id: patrolId,
    created_at: createdAt,
    mode: 'read_only',
    sources: {
      process_tree: path.relative(root, processTreePath) || processTreePath,
      package_scripts: path.relative(root, packageJsonPath) || packageJsonPath,
      manifests_dir: 'capability-upgrade-registry/manifests',
      evaluations_dir: 'capability-upgrade-registry/evaluations'
    },
    execution_mode_summary: {
      canonical_flow: ensureArray(processTree.canonical_flow),
      registered_nodes: nodes.length,
      open_or_in_progress_issues: issues.filter((issue) => issue.status !== 'closed').length,
      candidate_modules: processDecompositions.filter((item) => item.optimization_signals.length > 0).length
    },
    process_decompositions: processDecompositions,
    analogical_search_tasks: analogicalSearchTasks,
    priority_queue: priorityQueue,
    replacement_alignment_standard: {
      must_preserve: [
        'existing input schemas or versioned migration',
        'existing output contracts or adapter compatibility',
        'current process-tree requirements',
        'current validation commands',
        'runtime audit evidence',
        'human confirmation and rollback boundaries'
      ],
      must_measure: [
        'io_contract_consistency',
        'event_latency_fit',
        'effectiveness_gain',
        'replacement_complexity_inverse'
      ]
    },
    skill_creation_gate_standard: {
      schema: 'skill_creation_gate.v1',
      default_decision_order: [
        'reuse_existing_skill_or_tool',
        'wrap_or_adapt_existing_capability',
        'install_or_request_existing_plugin_or_connector_when_explicitly_requested',
        'create_new_skill_only_after_reuse_search_fails'
      ],
      required_search_sources: [
        'available_session_skills',
        'local_codex_skills',
        'installed_plugins_and_connectors',
        'tool_search_when_available',
        'repository_modules_and_scripts',
        'capability-upgrade-registry',
        'local_tool_catalogs_such_as_cli_anything',
        'reputable_external_software_or_open_source_projects_when_network_research_is_appropriate'
      ],
      creation_allowed_only_after_gate_record: true,
      gate_template: 'capability-upgrade-registry/templates/skill-creation-gate.template.json'
    },
    boundaries: [
      'read_only',
      'no_download_by_default',
      'no_external_code_execution',
      'no_main_system_mutation',
      'no_skill_creation_without_reuse_search',
      'no_replacement_without_full_gate'
    ]
  };

  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'capability-upgrade-patrol.json');
  const markdownPath = path.join(outputDir, 'capability-upgrade-patrol.md');
  const latestJsonPath = path.join(outputRoot, 'latest.json');
  const latestMarkdownPath = path.join(outputRoot, 'latest.md');
  const markdown = renderMarkdown(report);

  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, markdown, 'utf8');
  writeFileSync(latestJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(latestMarkdownPath, markdown, 'utf8');

  console.log(JSON.stringify({
    command: 'capability-upgrade-patrol',
    patrol_id: patrolId,
    mode: report.mode,
    candidate_modules: report.execution_mode_summary.candidate_modules,
    open_or_in_progress_issues: report.execution_mode_summary.open_or_in_progress_issues,
    priority_items: report.priority_queue.length,
    json_path: jsonPath,
    markdown_path: markdownPath
  }, null, 2));
}

main();
