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

const here = path.dirname(fileURLToPath(import.meta.url));

function projectRoot() {
  return path.resolve(here, '../../..');
}

function nowIso() {
  return new Date().toISOString();
}

function createDashboardId(date = new Date()) {
  return `mvp_status_dashboard_${date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function latestNestedFile(dir, fileName) {
  if (!existsSync(dir)) return null;
  const candidates = readdirSync(dir)
    .map((name) => path.join(dir, name, fileName))
    .filter((filePath) => existsSync(filePath) && statSync(filePath).isFile())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] ?? null;
}

function readJson(filePath, fallback = null) {
  if (!filePath || !existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
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

function siblingFileOrNull(filePath, fileName) {
  if (!filePath) return null;
  const candidate = path.join(path.dirname(filePath), fileName);
  return existsSync(candidate) ? candidate : null;
}

function unique(items) {
  return [...new Set((items ?? []).filter(Boolean))];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusClass(value) {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('ready') || text.includes('complete') || text.includes('synced') || text.includes('passed') || text === 'true' || text === 'completed') return 'good';
  if (text.includes('missing') || text.includes('fail') || text.includes('blocked') || text.includes('not_ready') || text === 'false') return 'bad';
  return 'warn';
}

function pathExists(root, maybeRelativePath) {
  const absolute = resolveFromRoot(root, maybeRelativePath);
  return Boolean(absolute && existsSync(absolute));
}

function summarizeExternalItems(source) {
  return (source?.item_results ?? []).map((item) => ({
    issue_id: item.issue_id,
    status: item.status ?? (item.ready ? 'ready' : 'unknown'),
    ready: item.ready === true,
    evidence: item.evidence ?? [],
    next_action: item.next_action ?? null
  }));
}

function dashboardMarkdown(dashboard) {
  const blockers = dashboard.blockers.length
    ? dashboard.blockers.map((item) => `- ${item}`).join('\n')
    : '- none';
  const actions = dashboard.next_actions.length
    ? dashboard.next_actions.map((item) => `- ${item}`).join('\n')
    : '- none';
  const artifacts = Object.entries(dashboard.artifacts)
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n') || '- none';
  const readOnlyTargets = dashboard.read_only_expansion_targets.top_targets.length
    ? dashboard.read_only_expansion_targets.top_targets
      .map((item) => `- ${item.rank}. ${item.target_id} (${item.platform}, score=${item.weighted_score})`)
      .join('\n')
    : '- none';
  const manifestReadinessFailures = dashboard.read_only_manifest_readiness.required_failures.length
    ? dashboard.read_only_manifest_readiness.required_failures.map((item) => `  - ${item}`).join('\n')
    : '  - none';
  const readOnlyWorkpackTargets = dashboard.read_only_expansion_workpack.top_targets.length
    ? dashboard.read_only_expansion_workpack.top_targets
      .map((item) => `- ${item.rank}. ${item.target_id} (${item.platform}, score=${item.weighted_score})`)
      .join('\n')
    : '- none';
  const sourceKindCounts = Object.entries(dashboard.read_only_source_collection.source_kind_counts ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join(', ') || 'none';
  const futureSourceStatus = dashboard.read_only_expansion_status.required_future_sources.length
    ? dashboard.read_only_expansion_status.required_future_sources
      .map((item) => `- ${item.source}: template=${item.template_ready}, conformance=${item.conformance_ready}, real_sample=${item.real_sample_present}`)
      .join('\n')
    : '- none';
  const sourceMatrixLanes = dashboard.source_intake_matrix.lanes.length
    ? dashboard.source_intake_matrix.lanes
      .map((lane) => `- ${lane.lane_id}: conformance=${lane.conformance_ready}, real_samples=${lane.effective_observation_count}, pilot_records=${lane.generated_pilot_import_matching_records}, gate=${lane.gate_decision}`)
      .join('\n')
    : '- none';

  return `# MVP Status Dashboard

- dashboard_id: ${dashboard.dashboard_id}
- created_at: ${dashboard.created_at}
- overall_status: ${dashboard.overall_status}
- ready_for_user_special_testing: ${dashboard.ready_for_user_special_testing}
- ready_to_expand_sample_or_real_connector: ${dashboard.ready_to_expand_sample_or_real_connector}

## Current Blockers

${blockers}

## Next Actions

${actions}

## Read-Only Expansion Targets

${readOnlyTargets}

## Read-Only Expansion Status

- status_id: ${dashboard.read_only_expansion_status.status_id ?? 'missing'}
- gate_decision: ${dashboard.read_only_expansion_status.gate_decision}
- goal_status: ${dashboard.read_only_expansion_status.goal_status}
- real_observations: ${dashboard.read_only_expansion_status.real_observation_count}
- effective_observations: ${dashboard.read_only_expansion_status.effective_observation_count}
- duplicate_suppressed_count: ${dashboard.read_only_expansion_status.duplicate_suppressed_count}
- generated_pilot_import_records: ${dashboard.read_only_expansion_status.generated_pilot_import_records}
- generated_feedback_records: ${dashboard.read_only_expansion_status.generated_feedback_records}
- graph_loop_gate_decision: ${dashboard.read_only_expansion_status.graph_loop_gate_decision}
- graph_loop_closed: ${dashboard.read_only_expansion_status.graph_loop_closed}
- feedback_writeback_complete: ${dashboard.read_only_expansion_status.feedback_writeback_complete}

${futureSourceStatus}

## Read-Only Duplicate Confirmation

- confirmation_id: ${dashboard.read_only_duplicate_confirmation.confirmation_id ?? 'missing'}
- gate_decision: ${dashboard.read_only_duplicate_confirmation.gate_decision}
- duplicate_suppression_confirmed: ${dashboard.read_only_duplicate_confirmation.duplicate_suppression_confirmed}
- current_duplicate_groups_confirmed: ${dashboard.read_only_duplicate_confirmation.current_duplicate_groups_confirmed}
- operator_confirmation_recorded: ${dashboard.read_only_duplicate_confirmation.operator_confirmation_recorded}
- decision_template_path: ${dashboard.read_only_duplicate_confirmation.decision_template_path ?? 'missing'}

## Source Intake Matrix

- matrix_id: ${dashboard.source_intake_matrix.matrix_id ?? 'missing'}
- gate_decision: ${dashboard.source_intake_matrix.gate_decision}
- conformance_ready_lanes: ${dashboard.source_intake_matrix.conformance_ready_lanes}/${dashboard.source_intake_matrix.lane_count}
- lanes_with_real_samples: ${dashboard.source_intake_matrix.lanes_with_real_samples}
- required_goal_lanes_with_real_samples: ${dashboard.source_intake_matrix.required_goal_lanes_with_real_samples}/${dashboard.source_intake_matrix.required_goal_lanes}
- latest_generated_pilot_import_records: ${dashboard.source_intake_matrix.latest_generated_pilot_import_records}
- ready_for_new_adapter_without_main_flow_change: ${dashboard.source_intake_matrix.ready_for_new_adapter_without_main_flow_change}

${sourceMatrixLanes}

## Read-Only Manifest Readiness

- readiness_id: ${dashboard.read_only_manifest_readiness.readiness_id ?? 'missing'}
- gate_decision: ${dashboard.read_only_manifest_readiness.gate_decision}
- ready_for_collection: ${dashboard.read_only_manifest_readiness.ready_for_collection}
- manifest_path: ${dashboard.read_only_manifest_readiness.manifest_path ?? 'missing'}
- manifest_sources: ${dashboard.read_only_manifest_readiness.manifest_sources}
- ready_sources: ${dashboard.read_only_manifest_readiness.ready_sources}
- required_failures:
${manifestReadinessFailures}

## Read-Only Source Collection

- collection_id: ${dashboard.read_only_source_collection.collection_id ?? 'missing'}
- gate_decision: ${dashboard.read_only_source_collection.gate_decision}
- manifest_sources: ${dashboard.read_only_source_collection.manifest_sources}
- collected_observations: ${dashboard.read_only_source_collection.collected_observations}
- failed_sources: ${dashboard.read_only_source_collection.failed_sources}
- ready_for_read_only_trial: ${dashboard.read_only_source_collection.ready_for_read_only_trial}
- source_kind_counts: ${sourceKindCounts}
- downstream_trial_requested: ${dashboard.read_only_source_collection.downstream_trial_requested}
- downstream_trial_gate_decision: ${dashboard.read_only_source_collection.downstream_trial_gate_decision}
- generated_pilot_import_path: ${dashboard.read_only_source_collection.generated_pilot_import_path ?? 'missing'}
- graph_loop_verification_path: ${dashboard.read_only_source_collection.graph_loop_verification_path ?? 'missing'}

## Read-Only Expansion Workpack

- workpack_id: ${dashboard.read_only_expansion_workpack.workpack_id ?? 'missing'}
- gate_decision: ${dashboard.read_only_expansion_workpack.gate_decision}
- raw_observation_count: ${dashboard.read_only_expansion_workpack.raw_observation_count}
- effective_observation_count: ${dashboard.read_only_expansion_workpack.effective_observation_count}
- graph_loop_gate_decision: ${dashboard.read_only_expansion_workpack.graph_loop_gate_decision}
- feedback_template_path: ${dashboard.read_only_expansion_workpack.feedback_template_path ?? 'missing'}

${readOnlyWorkpackTargets}

## Artifacts

${artifacts}
`;
}

function listItems(items) {
  if (!items?.length) return '<li>none</li>';
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

function artifactRows(artifacts, root) {
  return Object.entries(artifacts)
    .filter(([, value]) => value)
    .map(([key, value]) => `
        <tr>
          <td>${escapeHtml(key)}</td>
          <td><code>${escapeHtml(value)}</code></td>
          <td><span class="pill ${pathExists(root, value) ? 'good' : 'bad'}">${pathExists(root, value)}</span></td>
        </tr>`).join('');
}

function externalRows(items) {
  if (!items.length) {
    return '<tr><td colspan="4">none</td></tr>';
  }
  return items.map((item) => `
        <tr>
          <td>${escapeHtml(item.issue_id)}</td>
          <td><span class="pill ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td>
          <td>${escapeHtml(item.ready)}</td>
          <td>${escapeHtml((item.evidence ?? []).join('；'))}</td>
        </tr>`).join('');
}

function targetRows(items) {
  if (!items.length) {
    return '<tr><td colspan="5">none</td></tr>';
  }
  return items.map((item) => `
        <tr>
          <td>${escapeHtml(item.rank)}</td>
          <td>${escapeHtml(item.target_id)}</td>
          <td>${escapeHtml(item.platform)}</td>
          <td>${escapeHtml(item.weighted_score)}</td>
          <td>${escapeHtml((item.commands ?? []).slice(0, 1).join(''))}</td>
        </tr>`).join('');
}

function workpackTargetRows(items) {
  if (!items.length) {
    return '<tr><td colspan="5">none</td></tr>';
  }
  return items.map((item) => `
        <tr>
          <td>${escapeHtml(item.rank)}</td>
          <td>${escapeHtml(item.target_id)}</td>
          <td>${escapeHtml(item.platform)}</td>
          <td>${escapeHtml(item.weighted_score)}</td>
          <td>${escapeHtml(item.first_command ?? '')}</td>
        </tr>`).join('');
}

function sourceMatrixRows(items) {
  if (!items.length) {
    return '<tr><td colspan="6">none</td></tr>';
  }
  return items.map((item) => `
        <tr>
          <td>${escapeHtml(item.lane_id)}</td>
          <td>${escapeHtml(`${item.source_type}/${item.platform}`)}</td>
          <td><span class="pill ${statusClass(item.conformance_ready)}">${escapeHtml(item.conformance_ready)}</span></td>
          <td>${escapeHtml(item.effective_observation_count)}</td>
          <td>${escapeHtml(item.generated_pilot_import_matching_records)}</td>
          <td><span class="pill ${statusClass(item.gate_decision)}">${escapeHtml(item.gate_decision)}</span></td>
        </tr>`).join('');
}

function futureSourceRows(items) {
  if (!items.length) {
    return '<tr><td colspan="4">none</td></tr>';
  }
  return items.map((item) => `
        <tr>
          <td>${escapeHtml(item.source)}</td>
          <td><span class="pill ${statusClass(item.template_ready)}">${escapeHtml(item.template_ready)}</span></td>
          <td><span class="pill ${statusClass(item.conformance_ready)}">${escapeHtml(item.conformance_ready)}</span></td>
          <td><span class="pill ${statusClass(item.real_sample_present)}">${escapeHtml(item.real_sample_present)}</span></td>
        </tr>`).join('');
}

export function renderMvpStatusDashboard(dashboard) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MVP状态看板 - ${escapeHtml(dashboard.dashboard_id)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, "Microsoft YaHei", sans-serif; color: #182231; background: #f5f7fa; }
    body { margin: 0; }
    main { max-width: 1180px; margin: 0 auto; padding: 30px 20px 48px; }
    header { margin-bottom: 22px; }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 18px; letter-spacing: 0; }
    p { margin: 0; line-height: 1.6; }
    .muted { color: #627083; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 18px 0; }
    .metric, section { background: #fff; border: 1px solid #dfe5ec; border-radius: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
    .metric { padding: 14px; min-height: 84px; }
    .metric b { display: block; font-size: 13px; color: #627083; margin-bottom: 8px; }
    .metric span { font-size: 15px; font-weight: 700; overflow-wrap: anywhere; }
    section { padding: 18px; margin-top: 14px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border-top: 1px solid #e6ebf1; padding: 10px; text-align: left; vertical-align: top; font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; }
    th { border-top: 0; color: #627083; font-weight: 600; }
    code { background: #eef2f7; border-radius: 4px; padding: 2px 5px; font-family: Consolas, monospace; font-size: 12px; }
    ul { margin: 0; padding-left: 20px; }
    li { margin: 7px 0; line-height: 1.55; }
    .pill { display: inline-block; border-radius: 999px; padding: 3px 9px; font-size: 12px; font-weight: 700; }
    .good { background: #e7f5ee; color: #127046; }
    .bad { background: #fdecec; color: #aa2d2d; }
    .warn { background: #fff4d8; color: #7a5700; }
    .banner { border: 1px solid #d7dfea; background: #fff; border-radius: 8px; padding: 14px 16px; }
    @media (max-width: 780px) {
      main { padding: 22px 12px 36px; }
      .grid { grid-template-columns: 1fr; }
      table, thead, tbody, tr, th, td { display: block; }
      th { display: none; }
      tr { border-top: 1px solid #e6ebf1; padding: 8px 0; }
      td { border-top: 0; padding: 7px 0; }
    }
  </style>
</head>
<body data-report-contract="mvp_status_dashboard.v1">
  <main>
    <header>
      <h1>MVP状态看板</h1>
      <p class="muted">${escapeHtml(dashboard.dashboard_id)} · ${escapeHtml(dashboard.created_at)}</p>
      <div class="banner">
        <p><strong>当前结论：</strong>${escapeHtml(dashboard.overall_status)}</p>
      </div>
    </header>

    <div class="grid">
      <div class="metric"><b>用户专项测试</b><span>${escapeHtml(dashboard.ready_for_user_special_testing)}</span></div>
      <div class="metric"><b>扩大样本/连接器</b><span>${escapeHtml(dashboard.ready_to_expand_sample_or_real_connector)}</span></div>
      <div class="metric"><b>目标审计</b><span>${escapeHtml(dashboard.objective.status)}</span></div>
      <div class="metric"><b>真实试跑</b><span>${escapeHtml(dashboard.real_input_trial.gate_decision)}</span></div>
    </div>

    <section>
      <h2>当前阻断</h2>
      <ul>${listItems(dashboard.blockers)}</ul>
    </section>

    <section>
      <h2>外部输入状态</h2>
      <table>
        <thead><tr><th>项目</th><th>状态</th><th>ready</th><th>证据</th></tr></thead>
        <tbody>${externalRows(dashboard.external_inputs.items)}</tbody>
      </table>
    </section>

    <section>
      <h2>Read-only Expansion Targets</h2>
      <p class="muted">Source: <code>${escapeHtml(dashboard.read_only_expansion_targets.path ?? 'missing')}</code></p>
      <table>
        <thead><tr><th>Rank</th><th>Target</th><th>Platform</th><th>Score</th><th>First command</th></tr></thead>
        <tbody>${targetRows(dashboard.read_only_expansion_targets.top_targets)}</tbody>
      </table>
    </section>

    <section>
      <h2>Read-only Expansion Status</h2>
      <p class="muted">Source: <code>${escapeHtml(dashboard.read_only_expansion_status.path ?? 'missing')}</code></p>
      <div class="grid">
        <div class="metric"><b>Gate</b><span>${escapeHtml(dashboard.read_only_expansion_status.gate_decision)}</span></div>
        <div class="metric"><b>Effective samples</b><span>${escapeHtml(dashboard.read_only_expansion_status.effective_observation_count)}</span></div>
        <div class="metric"><b>Graph loop</b><span>${escapeHtml(dashboard.read_only_expansion_status.graph_loop_gate_decision)}</span></div>
        <div class="metric"><b>Feedback writeback</b><span>${escapeHtml(dashboard.read_only_expansion_status.feedback_writeback_complete)}</span></div>
      </div>
      <div class="grid">
        <div class="metric"><b>Generated records</b><span>${escapeHtml(dashboard.read_only_expansion_status.generated_pilot_import_records)}</span></div>
        <div class="metric"><b>Feedback records</b><span>${escapeHtml(dashboard.read_only_expansion_status.generated_feedback_records)}</span></div>
        <div class="metric"><b>Duplicates suppressed</b><span>${escapeHtml(dashboard.read_only_expansion_status.duplicate_suppressed_count)}</span></div>
        <div class="metric"><b>Goal status</b><span>${escapeHtml(dashboard.read_only_expansion_status.goal_status)}</span></div>
      </div>
      <table>
        <thead><tr><th>Source</th><th>Template</th><th>Conformance</th><th>Real sample</th></tr></thead>
        <tbody>${futureSourceRows(dashboard.read_only_expansion_status.required_future_sources)}</tbody>
      </table>
    </section>

    <section>
      <h2>Read-only Duplicate Confirmation</h2>
      <p class="muted">Source: <code>${escapeHtml(dashboard.read_only_duplicate_confirmation.path ?? 'missing')}</code></p>
      <div class="grid">
        <div class="metric"><b>Gate</b><span>${escapeHtml(dashboard.read_only_duplicate_confirmation.gate_decision)}</span></div>
        <div class="metric"><b>Suppression confirmed</b><span>${escapeHtml(dashboard.read_only_duplicate_confirmation.duplicate_suppression_confirmed)}</span></div>
        <div class="metric"><b>Current groups</b><span>${escapeHtml(dashboard.read_only_duplicate_confirmation.current_duplicate_groups_confirmed)}</span></div>
        <div class="metric"><b>Operator recorded</b><span>${escapeHtml(dashboard.read_only_duplicate_confirmation.operator_confirmation_recorded)}</span></div>
      </div>
      <p class="muted">Decision template: <code>${escapeHtml(dashboard.read_only_duplicate_confirmation.decision_template_path ?? 'missing')}</code></p>
    </section>

    <section>
      <h2>Source Intake Matrix</h2>
      <p class="muted">Source: <code>${escapeHtml(dashboard.source_intake_matrix.path ?? 'missing')}</code></p>
      <div class="grid">
        <div class="metric"><b>Gate</b><span>${escapeHtml(dashboard.source_intake_matrix.gate_decision)}</span></div>
        <div class="metric"><b>Conformance lanes</b><span>${escapeHtml(`${dashboard.source_intake_matrix.conformance_ready_lanes}/${dashboard.source_intake_matrix.lane_count}`)}</span></div>
        <div class="metric"><b>Real-sample lanes</b><span>${escapeHtml(`${dashboard.source_intake_matrix.required_goal_lanes_with_real_samples}/${dashboard.source_intake_matrix.required_goal_lanes}`)}</span></div>
        <div class="metric"><b>Main-flow reuse</b><span>${escapeHtml(dashboard.source_intake_matrix.ready_for_new_adapter_without_main_flow_change)}</span></div>
      </div>
      <table>
        <thead><tr><th>Lane</th><th>Type/platform</th><th>Conformance</th><th>Real samples</th><th>Pilot records</th><th>Gate</th></tr></thead>
        <tbody>${sourceMatrixRows(dashboard.source_intake_matrix.lanes)}</tbody>
      </table>
    </section>

    <section>
      <h2>Read-only Manifest Readiness</h2>
      <p class="muted">Source: <code>${escapeHtml(dashboard.read_only_manifest_readiness.path ?? 'missing')}</code></p>
      <div class="grid">
        <div class="metric"><b>Gate</b><span>${escapeHtml(dashboard.read_only_manifest_readiness.gate_decision)}</span></div>
        <div class="metric"><b>Ready</b><span>${escapeHtml(dashboard.read_only_manifest_readiness.ready_for_collection)}</span></div>
        <div class="metric"><b>Sources</b><span>${escapeHtml(`${dashboard.read_only_manifest_readiness.ready_sources}/${dashboard.read_only_manifest_readiness.manifest_sources}`)}</span></div>
        <div class="metric"><b>Required failures</b><span>${escapeHtml(dashboard.read_only_manifest_readiness.required_failures.length)}</span></div>
      </div>
      <p class="muted">Manifest: <code>${escapeHtml(dashboard.read_only_manifest_readiness.manifest_path ?? 'missing')}</code></p>
    </section>

    <section>
      <h2>Read-only Source Collection</h2>
      <p class="muted">Source: <code>${escapeHtml(dashboard.read_only_source_collection.path ?? 'missing')}</code></p>
      <div class="grid">
        <div class="metric"><b>Gate</b><span>${escapeHtml(dashboard.read_only_source_collection.gate_decision)}</span></div>
        <div class="metric"><b>Collected</b><span>${escapeHtml(dashboard.read_only_source_collection.collected_observations)}</span></div>
        <div class="metric"><b>Downstream trial</b><span>${escapeHtml(dashboard.read_only_source_collection.downstream_trial_gate_decision)}</span></div>
        <div class="metric"><b>Graph loop</b><span>${escapeHtml(dashboard.read_only_source_collection.graph_loop_gate_decision)}</span></div>
      </div>
      <p class="muted">Generated PilotImportBatch: <code>${escapeHtml(dashboard.read_only_source_collection.generated_pilot_import_path ?? 'missing')}</code></p>
      <p class="muted">Graph loop verification: <code>${escapeHtml(dashboard.read_only_source_collection.graph_loop_verification_path ?? 'missing')}</code></p>
    </section>

    <section>
      <h2>Read-only Expansion Workpack</h2>
      <p class="muted">Source: <code>${escapeHtml(dashboard.read_only_expansion_workpack.path ?? 'missing')}</code></p>
      <div class="grid">
        <div class="metric"><b>Gate</b><span>${escapeHtml(dashboard.read_only_expansion_workpack.gate_decision)}</span></div>
        <div class="metric"><b>有效样本</b><span>${escapeHtml(dashboard.read_only_expansion_workpack.effective_observation_count)}</span></div>
        <div class="metric"><b>图谱闭环</b><span>${escapeHtml(dashboard.read_only_expansion_workpack.graph_loop_gate_decision)}</span></div>
        <div class="metric"><b>反馈模板</b><span>${escapeHtml(Boolean(dashboard.read_only_expansion_workpack.feedback_template_path))}</span></div>
      </div>
      <p class="muted">Feedback template: <code>${escapeHtml(dashboard.read_only_expansion_workpack.feedback_template_path ?? 'missing')}</code></p>
      <table>
        <thead><tr><th>Rank</th><th>Target</th><th>Platform</th><th>Score</th><th>First command</th></tr></thead>
        <tbody>${workpackTargetRows(dashboard.read_only_expansion_workpack.top_targets)}</tbody>
      </table>
    </section>

    <section>
      <h2>运行状态</h2>
      <div class="grid">
        <div class="metric"><b>自代理</b><span>${escapeHtml(dashboard.self_agent.gate_decision)}</span></div>
        <div class="metric"><b>完成度审计</b><span>${escapeHtml(dashboard.completion_audit.overall_status)}</span></div>
        <div class="metric"><b>流程树同步</b><span>${escapeHtml(dashboard.process_tree.gate_decision)}</span></div>
        <div class="metric"><b>压测</b><span>${escapeHtml(dashboard.stress.gate_decision)}</span></div>
      </div>
    </section>

    <section>
      <h2>下一步</h2>
      <ul>${listItems(dashboard.next_actions)}</ul>
    </section>

    <section>
      <h2>关键产物</h2>
      <table>
        <thead><tr><th>名称</th><th>路径</th><th>存在</th></tr></thead>
        <tbody>${artifactRows(dashboard.artifacts, dashboard.source.root)}</tbody>
      </table>
    </section>
  </main>
</body>
</html>
`;
}

export function buildMvpStatusDashboard({
  root = projectRoot(),
  preflightPath = latestNestedFile(path.join(root, 'runtime/self-agent-preflights'), 'mvp-self-agent-preflight.json'),
  objectiveAuditPath = latestNestedFile(path.join(root, 'runtime/objective-audits'), 'mvp-objective-audit.json'),
  inputReadinessPath = latestNestedFile(path.join(root, 'runtime/input-readiness'), 'mvp-external-input-readiness.json'),
  readOnlyTargetsPath = latestNestedFile(path.join(root, 'runtime/read-only-expansion-targets'), 'read-only-expansion-targets.json'),
  readOnlyExpansionStatusPath = latestNestedFile(path.join(root, 'runtime/read-only-expansion-status'), 'read-only-expansion-status.json'),
  sourceIntakeMatrixPath = latestNestedFile(path.join(root, 'runtime/source-intake-matrix'), 'source-intake-matrix.json'),
  readOnlyManifestReadinessPath = latestNestedFile(path.join(root, 'runtime/read-only-source-collection-manifest-readiness'), 'read-only-source-collection-manifest-readiness.json'),
  readOnlyCollectionPath = latestNestedFile(path.join(root, 'runtime/read-only-source-collections'), 'read-only-source-collection.json'),
  readOnlyWorkpackPath = latestNestedFile(path.join(root, 'runtime/read-only-expansion-workpacks'), 'read-only-expansion-workpack.json'),
  readOnlyDuplicateConfirmationPath = latestNestedFile(path.join(root, 'runtime/read-only-duplicate-observation-confirmations'), 'read-only-duplicate-observation-confirmation.json'),
  realInputTrialPath = latestNestedFile(path.join(root, 'runtime/real-input-trials'), 'mvp-real-input-trial.json'),
  completionAuditPath = path.join(root, 'runtime/audits/mvp-completion-audit.json'),
  processTreeValidationPath = latestNestedFile(path.join(root, 'runtime/process-tree-validations'), 'process-tree-validation.json'),
  stressPath = latestNestedFile(path.join(root, 'runtime/mvp-stress-tests'), 'mvp-stress-test.json'),
  currentStatusPath = path.join(root, 'runtime/state/current-status.json')
} = {}) {
  const createdAt = nowIso();
  const preflight = readJson(preflightPath, {});
  const objective = readJson(objectiveAuditPath, {});
  const inputReadiness = readJson(inputReadinessPath, {});
  const readOnlyTargets = readJson(readOnlyTargetsPath, {});
  const readOnlyExpansionStatus = readJson(readOnlyExpansionStatusPath, {});
  const sourceIntakeMatrix = readJson(sourceIntakeMatrixPath, {});
  const readOnlyManifestReadiness = readJson(readOnlyManifestReadinessPath, {});
  const readOnlyCollection = readJson(readOnlyCollectionPath, {});
  const readOnlyWorkpack = readJson(readOnlyWorkpackPath, {});
  const readOnlyDuplicateConfirmation = readJson(readOnlyDuplicateConfirmationPath, {});
  const readOnlyDuplicateConfirmationTemplatePath = siblingFileOrNull(
    readOnlyDuplicateConfirmationPath,
    'duplicate-confirmation-decision.template.json'
  );
  const realTrial = readJson(realInputTrialPath, {});
  const completionAudit = readJson(completionAuditPath, {});
  const processTree = readJson(processTreeValidationPath, {});
  const stress = readJson(stressPath, {});
  const currentStatus = readJson(currentStatusPath, {});
  const externalSource = Object.keys(inputReadiness).length
    ? inputReadiness
    : realTrial.external_input_readiness ?? objective.external_input_status ?? {};
  const externalItems = summarizeExternalItems(externalSource);
  const readyIssueIds = new Set(externalItems
    .filter((item) => item.ready === true)
    .map((item) => item.issue_id));
  const staleExternalAction = (action) => {
    if (/intake:read-only:collect/i.test(action)) return false;
    return (readyIssueIds.has('PT-003') && /(PT-003|pilot-import\.real\.json)/i.test(action))
      || (readyIssueIds.has('PT-004') && /(PT-004|platform-snapshot)/i.test(action));
  };
  const externalNextActions = externalItems
    .filter((item) => item.ready !== true)
    .map((item) => `${item.issue_id}: ${item.next_action}`)
    .filter((item) => item && !staleExternalAction(item));
  const readOnlyTargetActions = (readOnlyTargets.next_actions ?? [])
    .filter((item) => item && !staleExternalAction(item));
  const readOnlyExpansionStatusActions = (readOnlyExpansionStatus.next_actions ?? [])
    .filter((item) => item && !staleExternalAction(item));
  const sourceMatrixActions = (sourceIntakeMatrix.next_actions ?? [])
    .filter((item) => item && !staleExternalAction(item));
  const readOnlyCollectionActions = (readOnlyCollection.next_commands ?? [])
    .filter((item) => item && !staleExternalAction(item));
  const readOnlyWorkpackActions = (readOnlyWorkpack.next_actions ?? [])
    .filter((item) => item && !staleExternalAction(item));
  const readOnlyDuplicateConfirmationActions = (readOnlyDuplicateConfirmation.next_actions ?? [])
    .filter((item) => item && !staleExternalAction(item));
  const blockers = unique([
    ...(objective.required_failures ?? []).map((item) => `required:${item}`),
    ...(objective.expansion_failures ?? []).map((item) => `expansion:${item}`),
    ...(realTrial.required_failures ?? []).map((item) => `real_trial:${item}`),
    ...(externalSource.required_failures ?? []).map((item) => `external_input:${item}`)
  ]);
  const nextActions = unique([
    ...externalNextActions,
    ...readOnlyTargetActions,
    ...readOnlyExpansionStatusActions,
    ...sourceMatrixActions,
    ...readOnlyCollectionActions,
    ...readOnlyWorkpackActions,
    ...readOnlyDuplicateConfirmationActions,
    ...(objective.next_actions ?? []).filter((item) => !staleExternalAction(item)),
    ...(realTrial.next_actions ?? []).filter((item) => !staleExternalAction(item)),
    ...(preflight.next_self_agent_sequence ?? []).filter((item) => !staleExternalAction(item)).slice(0, 3)
  ]);
  const dashboardId = createDashboardId(new Date(createdAt));
  const artifacts = {
    self_agent_preflight_path: relativeOrNull(root, preflightPath),
    objective_audit_path: relativeOrNull(root, objectiveAuditPath),
    real_input_trial_path: relativeOrNull(root, realInputTrialPath),
    real_input_trial_report_path: realTrial.artifacts?.trial_report_path ?? null,
    completion_audit_path: relativeOrNull(root, completionAuditPath),
    process_tree_validation_path: relativeOrNull(root, processTreeValidationPath),
    mvp_stress_path: relativeOrNull(root, stressPath),
    current_status_path: relativeOrNull(root, currentStatusPath),
    read_only_expansion_targets_path: relativeOrNull(root, readOnlyTargetsPath),
    read_only_expansion_status_path: relativeOrNull(root, readOnlyExpansionStatusPath),
    source_intake_matrix_path: relativeOrNull(root, sourceIntakeMatrixPath),
    read_only_manifest_readiness_path: relativeOrNull(root, readOnlyManifestReadinessPath),
    read_only_source_collection_path: relativeOrNull(root, readOnlyCollectionPath),
    read_only_source_collection_generated_pilot_import_path: readOnlyCollection.downstream_trial?.generated_pilot_import_path ?? null,
    read_only_source_collection_graph_loop_verification_path: readOnlyCollection.downstream_trial?.graph_loop_verification_path ?? null,
    read_only_expansion_workpack_path: relativeOrNull(root, readOnlyWorkpackPath),
    read_only_expansion_workpack_feedback_template_path: readOnlyWorkpack.artifacts?.feedback_template_path ?? null,
    read_only_duplicate_confirmation_path: relativeOrNull(root, readOnlyDuplicateConfirmationPath),
    read_only_duplicate_confirmation_template_path: relativeOrNull(root, readOnlyDuplicateConfirmationTemplatePath),
    mvp_report_path: preflight.current_cycle?.report_path ?? objective.source?.report_path ?? null,
    external_input_kit_path: preflight.current_cycle?.external_input_kit_path ?? null,
    external_input_readiness_path: relativeOrNull(root, inputReadinessPath)
      ?? preflight.current_cycle?.external_input_readiness_path
      ?? null
  };

  return {
    schema_version: 'mvp_status_dashboard.v1',
    dashboard_id: dashboardId,
    created_at: createdAt,
    overall_status: objective.objective_status ?? preflight.gate_decision ?? 'unknown',
    ready_for_user_special_testing: objective.ready_for_user_special_testing === true,
    ready_to_expand_sample_or_real_connector: objective.ready_to_expand_sample_or_real_connector === true,
    source: {
      root,
      preflight_path: artifacts.self_agent_preflight_path,
      objective_audit_path: artifacts.objective_audit_path,
      real_input_trial_path: artifacts.real_input_trial_path
    },
    self_agent: {
      preflight_id: preflight.preflight_id ?? null,
      gate_decision: preflight.gate_decision ?? 'missing',
      required_failures: preflight.required_failures ?? [],
      open_expansion_items: preflight.evidence?.open_expansion_items ?? []
    },
    objective: {
      audit_id: objective.audit_id ?? null,
      status: objective.objective_status ?? 'missing',
      required_failures: objective.required_failures ?? [],
      expansion_failures: objective.expansion_failures ?? []
    },
    external_inputs: {
      gate_decision: externalSource.gate_decision ?? 'missing',
      ready_for_real_input_trial: externalSource.ready_for_real_input_trial === true,
      required_failures: externalSource.required_failures ?? [],
      items: externalItems
    },
    read_only_expansion_targets: {
      target_plan_id: readOnlyTargets.target_plan_id ?? null,
      path: artifacts.read_only_expansion_targets_path,
      gate_decision: readOnlyTargets.gate_decision ?? 'missing',
      real_execution_allowed: readOnlyTargets.real_execution_allowed === true,
      real_send_attempted: readOnlyTargets.real_send_attempted === true,
      target_count: readOnlyTargets.target_recommendations?.length ?? 0,
      top_targets: (readOnlyTargets.target_recommendations ?? []).slice(0, 5).map((target) => ({
        target_id: target.target_id,
        rank: target.rank,
        platform: target.platform,
        weighted_score: target.weighted_score,
        commands: target.commands ?? []
      })),
      blocking_target_ids: readOnlyTargets.blocking_target_ids ?? [],
      required_failures: readOnlyTargets.required_failures ?? [],
      warning_failures: readOnlyTargets.warning_failures ?? []
    },
    read_only_expansion_status: {
      status_id: readOnlyExpansionStatus.status_id ?? null,
      path: artifacts.read_only_expansion_status_path,
      gate_decision: readOnlyExpansionStatus.gate_decision ?? 'missing',
      goal_complete: readOnlyExpansionStatus.goal_complete === true,
      goal_status: readOnlyExpansionStatus.goal_status ?? 'missing',
      real_execution_allowed: readOnlyExpansionStatus.real_execution_allowed === true,
      real_send_attempted: readOnlyExpansionStatus.real_send_attempted === true,
      real_observation_count: readOnlyExpansionStatus.current_samples?.real_observations?.observation_count ?? 0,
      effective_observation_count: readOnlyExpansionStatus.current_samples?.real_observations?.effective_observation_count ?? 0,
      duplicate_suppressed_count: readOnlyExpansionStatus.current_samples?.real_observations?.duplicate_suppressed_count ?? 0,
      non_wechat_observation_count: readOnlyExpansionStatus.current_samples?.real_observations?.non_wechat_observation_count ?? 0,
      effective_non_wechat_observation_count: readOnlyExpansionStatus.current_samples?.real_observations?.effective_non_wechat_observation_count ?? 0,
      duplicate_observation_groups: (readOnlyExpansionStatus.current_samples?.real_observations?.duplicate_observation_groups ?? []).map((group) => ({
        observation_id: group.observation_id,
        count: group.count,
        platform: group.platform,
        paths: group.paths ?? []
      })),
      current_pilot_import_ready_for_closed_loop: readOnlyExpansionStatus.current_samples?.current_pilot_import?.ready_for_closed_loop_mvp === true,
      generated_pilot_import_path: readOnlyExpansionStatus.current_samples?.latest_generated_pilot_import?.path ?? null,
      generated_pilot_import_records: readOnlyExpansionStatus.current_samples?.latest_generated_pilot_import?.raw_event_count ?? 0,
      generated_feedback_records: readOnlyExpansionStatus.current_samples?.latest_generated_pilot_import?.feedback_count ?? 0,
      generated_pilot_import_ready_for_decision: readOnlyExpansionStatus.current_samples?.latest_generated_pilot_import?.ready_for_decision_trial === true,
      generated_pilot_import_ready_for_closed_loop: readOnlyExpansionStatus.current_samples?.latest_generated_pilot_import?.ready_for_closed_loop_mvp === true,
      graph_loop_path: readOnlyExpansionStatus.graph_loop?.path ?? null,
      graph_loop_gate_decision: readOnlyExpansionStatus.graph_loop?.gate_decision ?? 'missing',
      graph_loop_closed: readOnlyExpansionStatus.graph_loop?.closed_loop_complete === true,
      completed_expert_count: readOnlyExpansionStatus.graph_loop?.completed_expert_count ?? 0,
      feedback_writeback_complete: readOnlyExpansionStatus.graph_loop?.writeback_complete === true,
      required_future_sources: (readOnlyExpansionStatus.future_intake?.required_future_sources ?? []).map((source) => ({
        source: source.source,
        template_ready: source.template_ready === true,
        conformance_ready: source.conformance_ready === true,
        real_sample_present: source.real_sample_present === true
      })),
      required_failures: readOnlyExpansionStatus.required_failures ?? [],
      warning_failures: readOnlyExpansionStatus.warning_failures ?? []
    },
    read_only_duplicate_confirmation: {
      confirmation_id: readOnlyDuplicateConfirmation.confirmation_id
        ?? readOnlyExpansionStatus.duplicate_confirmation?.confirmation_id
        ?? null,
      path: artifacts.read_only_duplicate_confirmation_path
        ?? readOnlyExpansionStatus.duplicate_confirmation?.path
        ?? null,
      decision_template_path: artifacts.read_only_duplicate_confirmation_template_path,
      gate_decision: readOnlyDuplicateConfirmation.gate_decision
        ?? readOnlyExpansionStatus.duplicate_confirmation?.gate_decision
        ?? 'missing',
      duplicate_suppression_confirmed: readOnlyDuplicateConfirmation.summary?.duplicate_suppression_confirmed === true
        || readOnlyExpansionStatus.duplicate_confirmation?.duplicate_suppression_confirmed === true,
      current_duplicate_groups_confirmed: readOnlyExpansionStatus.duplicate_confirmation?.current_duplicate_groups_confirmed === true,
      operator_confirmation_recorded: readOnlyDuplicateConfirmation.summary?.operator_confirmation_recorded === true,
      decision_present: readOnlyDuplicateConfirmation.summary?.decision_present === true,
      duplicate_group_count: readOnlyDuplicateConfirmation.summary?.duplicate_group_count ?? 0,
      accepted_group_count: readOnlyDuplicateConfirmation.summary?.accepted_group_count ?? 0,
      current_duplicate_observation_ids: readOnlyExpansionStatus.duplicate_confirmation?.current_duplicate_observation_ids ?? [],
      accepted_observation_ids: readOnlyExpansionStatus.duplicate_confirmation?.accepted_observation_ids ?? [],
      required_failures: readOnlyDuplicateConfirmation.required_failures
        ?? readOnlyExpansionStatus.duplicate_confirmation?.required_failures
        ?? [],
      warning_failures: readOnlyDuplicateConfirmation.warning_failures
        ?? readOnlyExpansionStatus.duplicate_confirmation?.warning_failures
        ?? []
    },
    source_intake_matrix: {
      matrix_id: sourceIntakeMatrix.matrix_id ?? null,
      path: artifacts.source_intake_matrix_path,
      gate_decision: sourceIntakeMatrix.gate_decision ?? 'missing',
      real_execution_allowed: sourceIntakeMatrix.real_execution_allowed === true,
      real_send_attempted: sourceIntakeMatrix.real_send_attempted === true,
      lane_count: sourceIntakeMatrix.summary?.lane_count ?? 0,
      conformance_ready_lanes: sourceIntakeMatrix.summary?.conformance_ready_lanes ?? 0,
      lanes_with_real_samples: sourceIntakeMatrix.summary?.lanes_with_real_samples ?? 0,
      required_goal_lanes: sourceIntakeMatrix.summary?.required_goal_lanes ?? 0,
      required_goal_lanes_with_real_samples: sourceIntakeMatrix.summary?.required_goal_lanes_with_real_samples ?? 0,
      total_effective_observations: sourceIntakeMatrix.summary?.total_effective_observations ?? 0,
      total_duplicate_suppressed: sourceIntakeMatrix.summary?.total_duplicate_suppressed ?? 0,
      latest_generated_pilot_import_records: sourceIntakeMatrix.summary?.latest_generated_pilot_import_records ?? 0,
      latest_generated_pilot_import_feedback_records: sourceIntakeMatrix.summary?.latest_generated_pilot_import_feedback_records ?? 0,
      all_real_send_blocked: sourceIntakeMatrix.summary?.all_real_send_blocked === true,
      all_required_goal_lanes_have_real_samples: sourceIntakeMatrix.summary?.all_required_goal_lanes_have_real_samples === true,
      ready_for_new_adapter_without_main_flow_change: sourceIntakeMatrix.summary?.ready_for_new_adapter_without_main_flow_change === true,
      lanes: (sourceIntakeMatrix.lanes ?? []).map((lane) => ({
        lane_id: lane.lane_id,
        label: lane.label,
        source_type: lane.source_type,
        platform: lane.platform,
        gate_decision: lane.gate_decision,
        conformance_ready: lane.conformance_ready === true,
        effective_observation_count: lane.observations?.effective_observation_count ?? 0,
        raw_event_mapped_count: lane.observations?.raw_event_mapped_count ?? 0,
        generated_pilot_import_matching_records: lane.latest_generated_pilot_import?.matching_records ?? 0,
        warning_failures: lane.warning_failures ?? []
      })),
      required_failures: sourceIntakeMatrix.required_failures ?? [],
      warning_failures: sourceIntakeMatrix.warning_failures ?? []
    },
    read_only_manifest_readiness: {
      readiness_id: readOnlyManifestReadiness.readiness_id ?? null,
      path: artifacts.read_only_manifest_readiness_path,
      gate_decision: readOnlyManifestReadiness.gate_decision ?? 'missing',
      ready_for_collection: readOnlyManifestReadiness.ready_for_collection === true,
      real_execution_allowed: readOnlyManifestReadiness.real_execution_allowed === true,
      real_send_attempted: readOnlyManifestReadiness.real_send_attempted === true,
      manifest_path: readOnlyManifestReadiness.source?.manifest_path ?? null,
      manifest_sources: readOnlyManifestReadiness.summary?.manifest_sources ?? 0,
      ready_sources: readOnlyManifestReadiness.summary?.ready_sources ?? 0,
      missing_source_files: readOnlyManifestReadiness.summary?.missing_source_files ?? 0,
      source_kind_counts: readOnlyManifestReadiness.summary?.source_kind_counts ?? {},
      missing_recommended_source_kinds: readOnlyManifestReadiness.summary?.missing_recommended_source_kinds ?? [],
      required_failures: readOnlyManifestReadiness.required_failures ?? [],
      warning_failures: readOnlyManifestReadiness.warning_failures ?? []
    },
    read_only_source_collection: {
      collection_id: readOnlyCollection.collection_id ?? null,
      path: artifacts.read_only_source_collection_path,
      gate_decision: readOnlyCollection.gate_decision ?? 'missing',
      real_execution_allowed: readOnlyCollection.real_execution_allowed === true,
      real_send_attempted: readOnlyCollection.real_send_attempted === true,
      manifest_sources: readOnlyCollection.summary?.manifest_sources ?? 0,
      collected_observations: readOnlyCollection.summary?.collected_observations ?? 0,
      failed_sources: readOnlyCollection.summary?.failed_sources ?? 0,
      ready_for_read_only_trial: readOnlyCollection.summary?.ready_for_read_only_trial === true,
      source_kind_counts: readOnlyCollection.summary?.source_kind_counts ?? {},
      missing_recommended_source_kinds: readOnlyCollection.summary?.missing_recommended_source_kinds ?? [],
      downstream_trial_requested: readOnlyCollection.downstream_trial?.requested === true,
      downstream_trial_skipped: readOnlyCollection.downstream_trial?.skipped === true,
      downstream_trial_gate_decision: readOnlyCollection.downstream_trial?.gate_decision ?? 'missing',
      generated_pilot_import_ready_for_decision: readOnlyCollection.downstream_trial?.generated_pilot_import_ready_for_decision === true,
      generated_pilot_import_ready_for_closed_loop_mvp: readOnlyCollection.downstream_trial?.generated_pilot_import_ready_for_closed_loop_mvp === true,
      generated_pilot_import_path: readOnlyCollection.downstream_trial?.generated_pilot_import_path ?? null,
      graph_loop_gate_decision: readOnlyCollection.downstream_trial?.graph_loop_gate_decision ?? 'missing',
      graph_loop_verification_path: readOnlyCollection.downstream_trial?.graph_loop_verification_path ?? null,
      required_failures: readOnlyCollection.required_failures ?? [],
      warning_failures: readOnlyCollection.warning_failures ?? []
    },
    read_only_expansion_workpack: {
      workpack_id: readOnlyWorkpack.workpack_id ?? null,
      path: artifacts.read_only_expansion_workpack_path,
      gate_decision: readOnlyWorkpack.gate_decision ?? 'missing',
      real_execution_allowed: readOnlyWorkpack.real_execution_allowed === true,
      real_send_attempted: readOnlyWorkpack.real_send_attempted === true,
      raw_observation_count: readOnlyWorkpack.sample_summary?.raw_observation_count ?? 0,
      effective_observation_count: readOnlyWorkpack.sample_summary?.effective_observation_count ?? 0,
      duplicate_suppressed_count: readOnlyWorkpack.sample_summary?.duplicate_suppressed_count ?? 0,
      generated_records: readOnlyWorkpack.sample_summary?.generated_records ?? 0,
      generated_feedback_records: readOnlyWorkpack.sample_summary?.generated_feedback_records ?? 0,
      ready_for_decision_trial: readOnlyWorkpack.sample_summary?.ready_for_decision_trial === true,
      ready_for_closed_loop_mvp: readOnlyWorkpack.sample_summary?.ready_for_closed_loop_mvp === true,
      graph_loop_gate_decision: readOnlyWorkpack.graph_loop_summary?.gate_decision ?? 'missing',
      graph_loop_closed: readOnlyWorkpack.graph_loop_summary?.closed_loop_complete === true,
      expert_completed_count: readOnlyWorkpack.graph_loop_summary?.expert_weight_judgment?.completed_expert_count
        ?? readOnlyWorkpack.graph_loop_summary?.trial_completed_expert_count
        ?? 0,
      feedback_writeback_complete: readOnlyWorkpack.graph_loop_summary?.feedback_writeback?.writeback_complete === true
        || readOnlyWorkpack.graph_loop_summary?.trial_writeback_complete === true,
      feedback_template_path: readOnlyWorkpack.artifacts?.feedback_template_path ?? null,
      top_targets: (readOnlyWorkpack.next_sampling_targets?.top_targets ?? []).slice(0, 5).map((target) => ({
        target_id: target.target_id,
        rank: target.rank,
        platform: target.platform,
        weighted_score: target.weighted_score,
        first_command: target.first_command ?? null
      })),
      required_failures: readOnlyWorkpack.required_failures ?? [],
      warning_failures: readOnlyWorkpack.warning_failures ?? []
    },
    real_input_trial: {
      trial_id: realTrial.trial_id ?? null,
      gate_decision: realTrial.gate_decision ?? 'missing',
      ready_for_issue_register_review: realTrial.ready_for_issue_register_review === true,
      required_failures: realTrial.required_failures ?? [],
      expansion_failures: realTrial.expansion_failures ?? [],
      report_path: realTrial.artifacts?.trial_report_path ?? null
    },
    completion_audit: {
      audit_id: completionAudit.audit_id ?? null,
      overall_status: completionAudit.overall_status ?? 'missing',
      required_failures: completionAudit.required_failures ?? [],
      open_expansion_items: (completionAudit.open_expansion_items ?? []).map((item) => item.issue_id)
    },
    process_tree: {
      validation_id: processTree.validation_id ?? null,
      gate_decision: processTree.gate_decision ?? 'missing',
      required_failures: processTree.required_failures ?? []
    },
    stress: {
      stress_id: stress.stress_id ?? null,
      gate_decision: stress.gate_decision ?? 'missing',
      runs: stress.runs ?? null,
      success: stress.success ?? null,
      hard_exit_signals: stress.hard_exit_signals ?? []
    },
    runtime_state: {
      status: currentStatus.status ?? 'missing',
      current_run_id: currentStatus.current_run_id ?? null,
      last_run_id: currentStatus.last_run?.run_id ?? null,
      last_run_status: currentStatus.last_run?.status ?? null
    },
    blockers,
    next_actions: nextActions,
    artifacts,
    continue_when: [
      'ready_for_user_special_testing=true',
      'external_inputs.ready_for_real_input_trial=true before real trial',
      'real_input_trial.ready_for_issue_register_review=true before issue-register review',
      'ready_to_expand_sample_or_real_connector=true before expansion'
    ],
    stop_or_adjust_when: [
      'Any required failure appears in objective audit, real-input trial, process-tree validation or stress test.',
      'External inputs are missing, invalid or need attention.',
      'State dashboard artifact paths are missing or unreadable.'
    ]
  };
}

export function writeMvpStatusDashboard({
  dashboard,
  outputDir = path.join(projectRoot(), 'runtime/status-dashboards', dashboard?.dashboard_id ?? createDashboardId())
} = {}) {
  if (!dashboard) throw new Error('writeMvpStatusDashboard requires dashboard');
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'mvp-status-dashboard.json');
  const markdownPath = path.join(outputDir, 'mvp-status-dashboard.md');
  const htmlPath = path.join(outputDir, 'mvp-status-dashboard.html');
  writeFileSync(jsonPath, `${JSON.stringify(dashboard, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, dashboardMarkdown(dashboard), 'utf8');
  writeFileSync(htmlPath, renderMvpStatusDashboard(dashboard), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath,
    html_path: htmlPath,
    contract: dashboard.schema_version,
    overall_status: dashboard.overall_status,
    ready_for_user_special_testing: dashboard.ready_for_user_special_testing,
    ready_to_expand_sample_or_real_connector: dashboard.ready_to_expand_sample_or_real_connector
  };
}
