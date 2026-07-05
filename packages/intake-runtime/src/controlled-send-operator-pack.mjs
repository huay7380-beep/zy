import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function relativePath(root, filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function isSimulationArtifact(candidate) {
  const payload = candidate?.payload ?? candidate;
  const values = [
    candidate?.filePath,
    payload?.path,
    payload?.command_target_path,
    payload?.box_regions_target_path,
    payload?.command_template_path,
    payload?.box_regions_template_path,
    payload?.command_path,
    payload?.box_regions_path,
    payload?.input_path,
    payload?.verification_mode,
    payload?.latest_controlled_send_material_kit?.path,
    payload?.latest_controlled_send_trial?.path,
    payload?.latest_controlled_send_real_window_readiness?.path,
    payload?.handoff?.command_path,
    payload?.handoff?.box_regions_path,
    payload?.handoff?.result_path
  ].filter(Boolean);
  return values.some((value) => {
    const normalized = String(value).replaceAll('\\', '/');
    return normalized.includes('/controlled-send-simulations/')
      || normalized.includes('controlled_send_simulation')
      || normalized === 'simulated';
  });
}

function latestNestedJson(root, runtimeDir, fileName, { ignoreSimulation = false } = {}) {
  const baseDir = path.resolve(root, runtimeDir);
  if (!existsSync(baseDir)) return null;
  return readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(baseDir, entry.name, fileName))
    .filter((filePath) => existsSync(filePath))
    .map((filePath) => ({
      filePath,
      payload: readJson(filePath),
      mtimeMs: statSync(filePath).mtimeMs
    }))
    .filter((candidate) => !ignoreSimulation || !isSimulationArtifact(candidate))
    .sort((a, b) => {
      const aTime = a.payload.created_at ?? a.payload.generated_at ?? '';
      const bTime = b.payload.created_at ?? b.payload.generated_at ?? '';
      return String(bTime).localeCompare(String(aTime)) || b.mtimeMs - a.mtimeMs;
    })[0] ?? null;
}

function artifactSummary(root, candidate, idFields = []) {
  if (!candidate) return null;
  const payload = candidate.payload;
  const id = idFields.map((field) => payload[field]).find(Boolean) ?? null;
  return {
    path: relativePath(root, candidate.filePath),
    id,
    gate_decision: payload.gate_decision ?? null,
    required_failures: payload.required_failures ?? [],
    current_blockers: payload.current_blockers ?? [],
    real_send_attempted: payload.real_send_attempted ?? payload.real_send_attempted_by_readiness ?? false,
    real_send_verified: payload.real_send_verified === true,
    created_at: payload.created_at ?? null
  };
}

function packAction({
  actionId,
  status,
  description,
  command = null,
  inputPath = null,
  outputPath = null,
  evidenceRefs = [],
  blockers = []
}) {
  return {
    action_id: actionId,
    status,
    description,
    command,
    input_path: inputPath,
    output_path: outputPath,
    evidence_refs: evidenceRefs.filter(Boolean),
    blockers: blockers.filter(Boolean)
  };
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildGateDecision({ docs16, handoff, trial, preflight, confirmation }) {
  if (docs16?.payload?.goal_complete === true || docs16?.payload?.real_send_verified === true) {
    return 'operator_pack_real_send_verified';
  }
  if (trial?.payload?.ready_for_real_controlled_send === true || handoff?.payload?.gate_decision === 'ready_for_real_window_runner') {
    return 'operator_pack_ready_for_runner';
  }
  if (preflight?.payload?.ready_for_prepare_controlled === true || confirmation?.payload?.target_written === true) {
    return 'operator_pack_ready_for_prepare';
  }
  return 'operator_pack_waiting_for_reviewed_decision';
}

function buildNextActions({
  root,
  draft,
  confirmation,
  preflight,
  trial,
  handoff,
  commandTargetPath,
  boxRegionsTargetPath,
  boxRegionsTemplatePath
}) {
  const draftPath = draft ? relativePath(root, draft.filePath) : null;
  const confirmationPath = confirmation ? relativePath(root, confirmation.filePath) : null;
  const confirmationPayload = confirmation?.payload;
  const reviewedDecisionTargetPath = confirmationPayload?.reviewed_decision_target_path
    ?? path.join(root, 'runtime/user-inputs/controlled-send-command-confirmation-decision.real.json');
  const reviewedDecisionTemplatePath = confirmationPayload?.user_input_decision_template_path
    ?? confirmationPayload?.decision_template_path
    ?? null;
  const preflightPayload = preflight?.payload;
  const trialPayload = trial?.payload;
  const handoffPayload = handoff?.payload;
  const targetWritten = confirmationPayload?.target_written === true;
  const decisionValidated = confirmationPayload?.validate_only === true
    && confirmationPayload?.would_write_target === true
    && (confirmationPayload?.required_failures ?? []).length === 0;
  const commandReady = preflightPayload?.ready_for_prepare_controlled === true;
  const trialReady = trialPayload?.ready_for_real_controlled_send === true;
  const runnerCommand = trialPayload?.handoff?.runner_command_with_box_regions
    ?? handoffPayload?.latest_controlled_send_trial?.runner_command_with_box_regions
    ?? null;
  const completionCommand = trialPayload?.handoff?.completion_command
    ?? handoffPayload?.latest_controlled_send_trial?.completion_command
    ?? null;

  return [
    packAction({
      actionId: 'review_generated_command_draft',
      status: draft ? 'ready' : 'blocked',
      description: 'Review the generated SendCommand draft and verify the message is suitable for a controlled test window.',
      inputPath: draft?.payload?.draft_command_path ?? null,
      evidenceRefs: [draftPath],
      blockers: draft ? [] : ['controlled_send_command_draft_missing']
    }),
    packAction({
      actionId: 'fill_reviewed_decision',
      status: targetWritten || decisionValidated ? 'complete' : confirmation ? 'pending' : 'blocked',
      description: 'Fill the reviewed decision template only after confirming a non-production test window, target, draft and permission.',
      inputPath: reviewedDecisionTemplatePath,
      outputPath: reviewedDecisionTargetPath,
      evidenceRefs: [draftPath, confirmationPath],
      blockers: targetWritten || decisionValidated ? [] : confirmationPayload?.required_failures ?? ['controlled_send_command_confirmation_missing']
    }),
    packAction({
      actionId: 'validate_reviewed_decision',
      status: targetWritten || decisionValidated ? 'complete' : confirmation ? 'pending' : 'blocked',
      description: 'Validate the reviewed decision without writing the real SendCommand file.',
      command: confirmation
        ? `npm.cmd run desktop:send:command:confirm -- --decision=${psQuote(reviewedDecisionTargetPath)} --validate-only`
        : null,
      inputPath: reviewedDecisionTargetPath,
      outputPath: 'runtime/controlled-send-command-confirmations/**',
      evidenceRefs: [confirmationPath],
      blockers: targetWritten || decisionValidated
        ? []
        : confirmation
          ? ['reviewed_decision_validation_pending']
          : ['controlled_send_command_confirmation_missing']
    }),
    packAction({
      actionId: 'apply_reviewed_decision',
      status: targetWritten ? 'complete' : decisionValidated ? 'ready' : confirmation ? 'pending' : 'blocked',
      description: 'Apply the reviewed decision to write the real SendCommand file; this still does not send a message.',
      command: confirmation
        ? `npm.cmd run desktop:send:command:confirm -- --decision=${psQuote(reviewedDecisionTargetPath)}`
        : null,
      inputPath: reviewedDecisionTargetPath,
      outputPath: commandTargetPath,
      evidenceRefs: [confirmationPath],
      blockers: targetWritten || decisionValidated ? [] : ['reviewed_decision_validation_pending']
    }),
    packAction({
      actionId: 'fill_box_regions',
      status: preflightPayload?.box_regions_ready === true || trialPayload?.box_regions_ready === true
        ? 'complete'
        : 'pending',
      description: 'Fill box-region coordinates for the confirmed test window, or use the runner vision API path instead of box regions.',
      inputPath: boxRegionsTemplatePath,
      outputPath: boxRegionsTargetPath,
      evidenceRefs: [
        preflight ? relativePath(root, preflight.filePath) : null,
        trial ? relativePath(root, trial.filePath) : null
      ],
      blockers: preflightPayload?.box_regions_required_failures ?? trialPayload?.box_regions_required_failures ?? []
    }),
    packAction({
      actionId: 'run_command_preflight',
      status: commandReady ? 'complete' : targetWritten ? 'ready' : 'blocked',
      description: 'Validate command material and box-region material before prepare-controlled.',
      command: `npm.cmd run desktop:send:command:check -- --input=${psQuote(commandTargetPath)} --box-regions=${psQuote(boxRegionsTargetPath)} --require-box-regions --fail-on-required`,
      inputPath: commandTargetPath,
      evidenceRefs: [preflight ? relativePath(root, preflight.filePath) : null],
      blockers: commandReady ? [] : preflightPayload?.required_failures ?? ['controlled_send_command_preflight_pending']
    }),
    packAction({
      actionId: 'run_prepare_controlled',
      status: trialReady ? 'complete' : commandReady ? 'ready' : 'blocked',
      description: 'Create a ready desktop controlled-send trial before any Sightflow real runner command.',
      command: preflightPayload?.next_commands?.prepare_controlled
        ?? `npm.cmd run desktop:send:prepare-controlled -- --input=${psQuote(commandTargetPath)} --box-regions=${psQuote(boxRegionsTargetPath)} --require-box-regions --fail-on-not-ready`,
      inputPath: commandTargetPath,
      evidenceRefs: [trial ? relativePath(root, trial.filePath) : null],
      blockers: trialReady ? [] : trialPayload?.required_failures ?? ['desktop_controlled_send_trial_not_ready']
    }),
    packAction({
      actionId: 'run_sightflow_real_runner_once',
      status: trialReady ? 'ready' : 'blocked',
      description: 'Run exactly one Sightflow real runner command in the confirmed test window.',
      command: runnerCommand,
      inputPath: trial ? relativePath(root, trial.filePath) : null,
      outputPath: trialPayload?.handoff?.result_path ?? handoffPayload?.latest_controlled_send_trial?.result_path ?? null,
      evidenceRefs: [trial ? relativePath(root, trial.filePath) : null, handoff ? relativePath(root, handoff.filePath) : null],
      blockers: trialReady ? [] : ['desktop_controlled_send_trial.ready_for_real_controlled_send']
    }),
    packAction({
      actionId: 'complete_and_refresh_status',
      status: 'blocked',
      description: 'After the runner writes a real result, complete the trial, refresh audit and refresh docs16 status.',
      command: completionCommand,
      evidenceRefs: [handoff ? relativePath(root, handoff.filePath) : null],
      blockers: ['sightflow_real_runner_result_pending']
    })
  ];
}

function renderMarkdown(pack) {
  return [
    '# Controlled Send Operator Pack',
    '',
    `- pack_id: ${pack.pack_id}`,
    `- gate_decision: ${pack.gate_decision}`,
    `- real_send_attempted: ${pack.real_send_attempted}`,
    `- real_send_verified: ${pack.real_send_verified}`,
    `- command_target_path: ${pack.operator_inputs.command_target_path}`,
    `- box_regions_target_path: ${pack.operator_inputs.box_regions_target_path}`,
    `- reviewed_decision_template_path: ${pack.operator_inputs.reviewed_decision_template_path ?? 'none'}`,
    '',
    '## Current Blockers',
    '',
    ...(pack.current_blockers.length ? pack.current_blockers.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Operator Actions',
    '',
    ...pack.operator_actions.map((item) => [
      `- ${item.status} ${item.action_id}: ${item.description}`,
      item.input_path ? `  - input_path: ${item.input_path}` : null,
      item.output_path ? `  - output_path: ${item.output_path}` : null,
      item.command ? `  - command: ${item.command}` : null,
      item.blockers.length ? `  - blockers: ${item.blockers.join(', ')}` : null
    ].filter(Boolean).join('\n')),
    '',
    '## Safety Rule',
    '',
    '- This pack does not create the real SendCommand and does not send a message.',
    '- Keep docs16 goal_complete=false until a real runner result, completion target binding and refreshed audit all verify real_send_verified=true.'
  ].join('\n');
}

function renderPathValue(value) {
  return value ? `<code>${escapeHtml(value)}</code>` : '<span class="muted">none</span>';
}

function renderList(items, emptyText = 'none') {
  if (!items?.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderCommand(command) {
  if (!command) return '<span class="muted">none</span>';
  return `<pre><code>${escapeHtml(command)}</code></pre>`;
}

function renderStatus(status) {
  const normalized = String(status ?? 'unknown');
  return `<span class="tag tag-${escapeHtml(normalized)}">${escapeHtml(normalized)}</span>`;
}

function renderHtml(pack) {
  const inputRows = Object.entries(pack.operator_inputs)
    .map(([key, value]) => `<tr><th scope="row">${escapeHtml(key)}</th><td>${renderPathValue(value)}</td></tr>`)
    .join('');
  const artifactRows = Object.entries(pack.latest_artifacts)
    .map(([key, value]) => `<tr><th scope="row">${escapeHtml(key)}</th><td>${renderPathValue(value?.path ?? null)}</td><td>${renderStatus(value?.gate_decision ?? 'none')}</td></tr>`)
    .join('');
  const actionRows = pack.operator_actions
    .map((item, index) => `
      <article class="action">
        <div class="action-head">
          <span class="step">${index + 1}</span>
          <div>
            <h3>${escapeHtml(item.action_id)}</h3>
            <p>${escapeHtml(item.description)}</p>
          </div>
          ${renderStatus(item.status)}
        </div>
        <dl>
          <div><dt>Input</dt><dd>${renderPathValue(item.input_path)}</dd></div>
          <div><dt>Output</dt><dd>${renderPathValue(item.output_path)}</dd></div>
          <div><dt>Evidence</dt><dd>${renderList(item.evidence_refs, 'no evidence reference')}</dd></div>
          <div><dt>Blockers</dt><dd>${renderList(item.blockers, 'none')}</dd></div>
        </dl>
        <div class="command">${renderCommand(item.command)}</div>
      </article>
    `)
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Controlled Send Operator Pack</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #1f2937;
      --muted: #5f6b7a;
      --border: #d8dee8;
      --accent: #1457a8;
      --blocked: #8f1d1d;
      --pending: #7a4a00;
      --ready: #0f5e4d;
      --complete: #255c20;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 15px/1.55 "Segoe UI", Arial, sans-serif;
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 28px 20px 44px;
    }
    h1, h2, h3, p { margin-top: 0; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    h2 { font-size: 20px; margin: 28px 0 12px; }
    h3 { font-size: 16px; margin-bottom: 4px; }
    code {
      overflow-wrap: anywhere;
      word-break: break-word;
      font-family: Consolas, "Cascadia Mono", monospace;
      font-size: 13px;
    }
    pre {
      margin: 12px 0 0;
      padding: 12px;
      overflow-x: auto;
      background: #111827;
      color: #f9fafb;
      border-radius: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border: 1px solid var(--border);
    }
    th, td {
      padding: 10px 12px;
      border-top: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
    }
    th { width: 260px; color: #374151; background: #f3f5f8; }
    ul { margin: 0; padding-left: 20px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .metric, .panel, .action {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .metric span {
      display: block;
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 6px;
    }
    .metric strong {
      display: block;
      overflow-wrap: anywhere;
      font-size: 17px;
    }
    .muted { color: var(--muted); }
    .tag {
      display: inline-block;
      min-width: 72px;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid var(--border);
      background: #eef2f7;
      color: #233044;
      font-size: 13px;
      font-weight: 700;
      text-align: center;
    }
    .tag-blocked { background: #fde8e8; color: var(--blocked); border-color: #f3b8b8; }
    .tag-pending { background: #fff3d4; color: var(--pending); border-color: #e7c36a; }
    .tag-ready { background: #dcf7f0; color: var(--ready); border-color: #8fd7c5; }
    .tag-complete { background: #e4f4df; color: var(--complete); border-color: #aad09e; }
    .actions {
      display: grid;
      gap: 12px;
    }
    .action-head {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: start;
      gap: 12px;
    }
    .step {
      display: inline-grid;
      width: 28px;
      height: 28px;
      place-items: center;
      border-radius: 50%;
      background: var(--accent);
      color: #fff;
      font-weight: 700;
    }
    dl {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 12px;
      margin: 12px 0 0;
    }
    dt { color: var(--muted); font-size: 13px; font-weight: 700; }
    dd { margin: 4px 0 0; }
    .warning {
      border-left: 4px solid var(--blocked);
      background: #fff7f7;
    }
    @media (max-width: 720px) {
      main { padding: 20px 12px 32px; }
      th, td { display: block; width: 100%; }
      .action-head { grid-template-columns: auto 1fr; }
      .action-head .tag { grid-column: 1 / -1; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Controlled Send Operator Pack</h1>
    <p class="muted">A local, no-send checklist for reviewing the real test-window send path.</p>

    <section class="summary" aria-label="Pack summary">
      <div class="metric"><span>Pack ID</span><strong>${escapeHtml(pack.pack_id)}</strong></div>
      <div class="metric"><span>Gate</span><strong>${escapeHtml(pack.gate_decision)}</strong></div>
      <div class="metric"><span>Real Send Attempted</span><strong>${escapeHtml(pack.real_send_attempted)}</strong></div>
      <div class="metric"><span>Real Send Verified</span><strong>${escapeHtml(pack.real_send_verified)}</strong></div>
      <div class="metric"><span>Simulation Goal Complete</span><strong>${escapeHtml(pack.simulation_goal_complete)}</strong></div>
      <div class="metric"><span>Docs16 Goal Complete</span><strong>${escapeHtml(pack.docs16_goal_complete)}</strong></div>
    </section>

    <section class="panel warning">
      <h2>Safety Rule</h2>
      <p>This pack does not create the real SendCommand and does not send a message. Keep docs16 goal_complete=false until a real runner result, completion target binding and refreshed audit all verify real_send_verified=true.</p>
    </section>

    <h2>Current Blockers</h2>
    <section class="panel">${renderList(pack.current_blockers)}</section>

    <h2>Operator Inputs</h2>
    <table><tbody>${inputRows}</tbody></table>

    <h2>Operator Actions</h2>
    <section class="actions">${actionRows}</section>

    <h2>Latest Artifacts</h2>
    <table>
      <thead><tr><th scope="col">Artifact</th><th scope="col">Path</th><th scope="col">Gate</th></tr></thead>
      <tbody>${artifactRows}</tbody>
    </table>
  </main>
</body>
</html>
`;
}

export function buildControlledSendOperatorPack({
  root = process.cwd(),
  createdAt = nowIso()
} = {}) {
  const resolvedRoot = path.resolve(root);
  const materialKit = latestNestedJson(resolvedRoot, 'runtime/controlled-send-material-kits', 'controlled-send-material-kit.json', { ignoreSimulation: true });
  const draft = latestNestedJson(resolvedRoot, 'runtime/controlled-send-command-drafts', 'controlled-send-command-draft.json');
  const confirmation = latestNestedJson(resolvedRoot, 'runtime/controlled-send-command-confirmations', 'controlled-send-command-confirmation.json');
  const preflight = latestNestedJson(resolvedRoot, 'runtime/desktop-controlled-send-command-preflights', 'controlled-send-command-preflight.json', { ignoreSimulation: true });
  const trial = latestNestedJson(resolvedRoot, 'runtime/desktop-controlled-send-trials', 'desktop-controlled-send-trial.json', { ignoreSimulation: true });
  const readiness = latestNestedJson(resolvedRoot, 'runtime/controlled-send-real-window-readiness', 'controlled-send-real-window-readiness.json', { ignoreSimulation: true });
  const handoff = latestNestedJson(resolvedRoot, 'runtime/desktop-controlled-send-handoffs', 'desktop-controlled-send-handoff.json', { ignoreSimulation: true });
  const audit = latestNestedJson(resolvedRoot, 'runtime/intake-implementation-audits', 'intake-implementation-audit.json');
  const docs16 = latestNestedJson(resolvedRoot, 'runtime/docs16-implementation-status', 'docs16-implementation-status.json');

  const commandTargetPath = confirmation?.payload?.target_command_path
    ?? draft?.payload?.target_command_path
    ?? materialKit?.payload?.command_target_path
    ?? path.resolve(resolvedRoot, 'runtime/user-inputs/controlled-send-command.real.json');
  const boxRegionsTargetPath = materialKit?.payload?.box_regions_target_path
    ?? trial?.payload?.box_regions_path
    ?? path.resolve(resolvedRoot, 'runtime/user-inputs/controlled-send-box-regions.real.json');
  const boxRegionsTemplatePath = materialKit?.payload?.user_input_box_regions_template_path
    ?? preflight?.payload?.box_regions_template_path
    ?? trial?.payload?.box_regions_template_path
    ?? path.resolve(resolvedRoot, 'runtime/user-inputs/templates/controlled-send-box-regions.real.template.json');

  const gateDecision = buildGateDecision({ docs16, handoff, trial, preflight, confirmation });
  const currentBlockers = [
    ...(confirmation?.payload?.required_failures ?? []),
    ...(preflight?.payload?.required_failures ?? []),
    ...(trial?.payload?.required_failures ?? []),
    ...(readiness?.payload?.current_blockers ?? []),
    ...(audit?.payload?.external_pending ?? []),
    ...(docs16?.payload?.external_pending ?? [])
  ].filter((item, index, list) => item && list.indexOf(item) === index);

  const packId = `controlled_send_operator_pack_${Date.now()}`;
  const outputDir = path.join(resolvedRoot, 'runtime/controlled-send-operator-packs', packId);
  const artifacts = {
    material_kit: artifactSummary(resolvedRoot, materialKit, ['kit_id']),
    command_draft: artifactSummary(resolvedRoot, draft, ['draft_id']),
    command_confirmation: artifactSummary(resolvedRoot, confirmation, ['confirmation_id']),
    command_preflight: artifactSummary(resolvedRoot, preflight, ['preflight_id']),
    desktop_trial: artifactSummary(resolvedRoot, trial, ['trial_id']),
    real_window_readiness: artifactSummary(resolvedRoot, readiness, ['readiness_id']),
    handoff: artifactSummary(resolvedRoot, handoff, ['handoff_id']),
    intake_audit: artifactSummary(resolvedRoot, audit, ['audit_id']),
    docs16_status: artifactSummary(resolvedRoot, docs16, ['status_id'])
  };

  return {
    schema_version: 'controlled_send_operator_pack.v1',
    pack_id: packId,
    created_at: createdAt,
    gate_decision: gateDecision,
    real_send_attempted: false,
    real_send_verified: docs16?.payload?.real_send_verified === true || audit?.payload?.real_send_verified === true,
    simulation_goal_complete: docs16?.payload?.simulation_goal_complete === true,
    docs16_goal_complete: docs16?.payload?.goal_complete === true,
    operator_inputs: {
      command_draft_path: draft?.payload?.draft_command_path ?? null,
      command_draft_report_path: draft ? path.resolve(draft.filePath) : null,
      reviewed_decision_template_path: confirmation?.payload?.decision_template_path ?? null,
      reviewed_decision_user_input_template_path: confirmation?.payload?.user_input_decision_template_path ?? null,
      reviewed_decision_target_path: confirmation?.payload?.reviewed_decision_target_path
        ?? path.resolve(resolvedRoot, 'runtime/user-inputs/controlled-send-command-confirmation-decision.real.json'),
      command_target_path: commandTargetPath,
      box_regions_template_path: boxRegionsTemplatePath,
      box_regions_target_path: boxRegionsTargetPath
    },
    current_blockers: currentBlockers,
    latest_artifacts: artifacts,
    operator_actions: buildNextActions({
      root: resolvedRoot,
      draft,
      confirmation,
      preflight,
      trial,
      handoff,
      commandTargetPath,
      boxRegionsTargetPath,
      boxRegionsTemplatePath
    }),
    safety_gates: [
      'no_production_contact',
      'reviewed_decision_required_before_real_command_file',
      'command_preflight_required_before_prepare',
      'prepare_controlled_required_before_runner',
      'run_exactly_one_real_runner_command',
      'completion_and_refreshed_audit_required_before_docs16_goal_complete'
    ],
    output_dir: outputDir
  };
}

export function writeControlledSendOperatorPack({ pack }) {
  if (!pack) throw new Error('writeControlledSendOperatorPack requires pack');
  mkdirSync(pack.output_dir, { recursive: true });
  const jsonPath = path.join(pack.output_dir, 'controlled-send-operator-pack.json');
  const markdownPath = path.join(pack.output_dir, 'controlled-send-operator-pack.md');
  const htmlPath = path.join(pack.output_dir, 'controlled-send-operator-pack.html');
  writeJson(jsonPath, pack);
  writeFileSync(markdownPath, renderMarkdown(pack), 'utf8');
  writeFileSync(htmlPath, renderHtml(pack), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath,
    html_path: htmlPath
  };
}
