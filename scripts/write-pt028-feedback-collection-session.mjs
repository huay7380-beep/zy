#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function nowCompactId(prefix) {
  return `${prefix}_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function resolveInputPath(root, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.resolve(root, maybePath);
}

function relativeToRoot(root, maybePath) {
  if (!maybePath) return null;
  const absolutePath = path.isAbsolute(maybePath) ? maybePath : path.resolve(root, maybePath);
  return path.relative(root, absolutePath).replace(/\\/g, '/');
}

function readJsonIfExists(file) {
  if (!file || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function defaultHandoffPath(root) {
  return path.join(root, 'runtime', 'pt028-feedback-handoff-validations', 'latest.json');
}

function defaultPackPath(root, handoff) {
  return resolveInputPath(root, handoff?.source?.pack_path)
    ?? path.join(root, 'runtime', 'pt028-final-feedback-decision-packs', 'latest.json');
}

function check({ checkId, status, evidence = [], required = true }) {
  return {
    check_id: checkId,
    status: status ? 'passed' : 'failed',
    required,
    evidence
  };
}

function uniqueCount(values) {
  return new Set(values.filter(Boolean)).size;
}

function allFieldsPresent(rows) {
  const required = [
    'real_window_observed',
    'state_target_verified',
    'prompt_only_confirmed',
    'no_real_send_attempted',
    'privacy_boundary_confirmed',
    'reviewed_at',
    'evidence_refs'
  ];
  return rows.every((row) => {
    const fields = new Set(row.operator_must_confirm ?? []);
    return required.every((field) => fields.has(field));
  });
}

function capturePrompts(row) {
  return [
    `Open and visually verify the real ${row.app_type ?? 'desktop'} window ${row.window_id ?? '<window_id>'}.`,
    `Confirm the target identity matches ${row.target_person_id ?? '<target_person_id>'}.`,
    `Confirm dock/send state remains prompt-only/no-send before recording feedback.`,
    `Confirm the privacy boundary allows storing only the reviewed evidence refs for ${row.draft_record_pointer}.`,
    `Fill the corresponding decision template row, not the real feedback target file directly.`
  ];
}

function buildTasks(rows) {
  return rows.map((row, index) => {
    const slotIndex = row.slot_index ?? index + 1;
    return {
      task_id: `feedback_collection_window_${String(slotIndex).padStart(3, '0')}`,
      checklist_row_id: row.row_id ?? `operator_feedback_window_${String(slotIndex).padStart(3, '0')}`,
      slot_index: slotIndex,
      source_task_id: row.task_id ?? null,
      app_type: row.app_type ?? null,
      window_id: row.window_id ?? null,
      target_person_id: row.target_person_id ?? null,
      target_display_name_hint: row.target_display_name_hint ?? null,
      draft_record_pointer: row.draft_record_pointer ?? `draft.window_feedback_records[${index}]`,
      decision_template_record_pointer: `feedback_batch.window_feedback_records[${index}]`,
      state_path: row.state_path ?? null,
      dock_status_text: row.dock_status_text ?? null,
      send_gate_mode: row.send_gate_mode ?? null,
      evidence_refs: row.evidence_refs ?? [],
      required_operator_confirmations: row.operator_must_confirm ?? [],
      capture_prompts: capturePrompts(row),
      candidate_prefill_only: true,
      real_send_allowed: false,
      ready_for_real_feedback_target_write: false,
      status: 'pending_operator_real_window_review'
    };
  });
}

function buildSession({ root, handoffPath, packPath, outputDir }) {
  const sessionId = nowCompactId('pt028_feedback_collection_session');
  const handoff = readJsonIfExists(handoffPath);
  const pack = readJsonIfExists(packPath);
  const checklist = pack?.operator_feedback_window_checklist;
  const rows = checklist?.rows ?? [];
  const tasks = buildTasks(rows);
  const targetFeedbackPath = resolveInputPath(root, pack?.target_feedback_path);
  const decisionTemplatePath = pack?.artifact_refs?.confirmation_decision_template_path ?? null;
  const distinctTargets = uniqueCount(tasks.map((task) => task.target_person_id));
  const requiredWindowCount = checklist?.required_window_count ?? 2;
  const requiredUniqueTargetCount = checklist?.required_unique_target_count ?? 2;
  const allCandidatePrefillOnly = tasks.every((task) => task.candidate_prefill_only === true);
  const allRealSendDisallowed = tasks.every((task) => task.real_send_allowed === false)
    && checklist?.boundary_policy?.real_send_allowed === false;

  const checks = [
    check({
      checkId: 'handoff_ready_for_operator_collection',
      status: handoff?.schema_version === 'pt028_feedback_handoff_validation.v1'
        && handoff?.ready_for_operator_feedback_collection === true
        && (handoff?.required_failures ?? []).length === 0,
      evidence: [
        `handoff_path=${relativeToRoot(root, handoffPath)}`,
        `handoff_gate=${handoff?.gate_decision ?? 'missing'}`,
        `handoff_failures=${(handoff?.required_failures ?? []).join(',') || 'none'}`
      ]
    }),
    check({
      checkId: 'decision_pack_linked',
      status: pack?.schema_version === 'pt028_final_feedback_decision_pack.v1'
        && existsSync(resolveInputPath(root, pack?.output_paths?.html_path) ?? ''),
      evidence: [
        `pack_path=${relativeToRoot(root, packPath)}`,
        `pack_id=${pack?.pack_id ?? 'missing'}`,
        `html=${pack?.output_paths?.html_path ?? 'missing'}`
      ]
    }),
    check({
      checkId: 'collection_rows_cover_required_scope',
      status: tasks.length >= requiredWindowCount && distinctTargets >= requiredUniqueTargetCount,
      evidence: [
        `task_count=${tasks.length}`,
        `required_window_count=${requiredWindowCount}`,
        `distinct_target_count=${distinctTargets}`,
        `required_unique_target_count=${requiredUniqueTargetCount}`
      ]
    }),
    check({
      checkId: 'task_confirmation_fields_present',
      status: allFieldsPresent(rows),
      evidence: [
        `rows_with_required_fields=${rows.filter((row) => allFieldsPresent([row])).length}`,
        `row_count=${rows.length}`
      ]
    }),
    check({
      checkId: 'collection_session_is_read_only',
      status: pack?.real_execution_allowed === false
        && pack?.real_send_attempted === false
        && pack?.writes_real_feedback_target === false
        && (targetFeedbackPath ? !existsSync(targetFeedbackPath) : true),
      evidence: [
        `target_feedback_path=${relativeToRoot(root, targetFeedbackPath)}`,
        `target_feedback_exists=${targetFeedbackPath ? existsSync(targetFeedbackPath) : false}`,
        `pack_real_execution_allowed=${pack?.real_execution_allowed}`,
        `pack_real_send_attempted=${pack?.real_send_attempted}`,
        `pack_writes_real_feedback_target=${pack?.writes_real_feedback_target}`
      ]
    })
  ];

  const requiredFailures = checks
    .filter((item) => item.required && item.status !== 'passed')
    .map((item) => item.check_id);
  const warningFailures = checks
    .filter((item) => !item.required && item.status !== 'passed')
    .map((item) => item.check_id);

  return {
    schema_version: 'pt028_feedback_collection_session.v1',
    session_id: sessionId,
    created_at: new Date().toISOString(),
    gate_decision: requiredFailures.length === 0
      ? 'ready_for_operator_window_feedback_collection'
      : 'feedback_collection_session_needs_attention',
    ready_for_operator_feedback_collection: requiredFailures.length === 0,
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: false,
    source: {
      root,
      handoff_path: relativeToRoot(root, handoffPath),
      pack_path: relativeToRoot(root, packPath),
      output_dir: relativeToRoot(root, outputDir)
    },
    linked_handoff: {
      validation_id: handoff?.validation_id ?? null,
      gate_decision: handoff?.gate_decision ?? null,
      ready_for_operator_feedback_collection: handoff?.ready_for_operator_feedback_collection === true,
      required_failures: handoff?.required_failures ?? []
    },
    linked_pack: {
      pack_id: pack?.pack_id ?? null,
      gate_decision: pack?.gate_decision ?? null,
      target_feedback_path: pack?.target_feedback_path ?? null,
      target_feedback_exists: targetFeedbackPath ? existsSync(targetFeedbackPath) : false,
      decision_template_path: decisionTemplatePath,
      html_path: pack?.output_paths?.html_path ?? null,
      draft_feedback_path: pack?.artifact_refs?.draft_feedback_path ?? null
    },
    collection_scope: {
      required_window_count: requiredWindowCount,
      required_unique_target_count: requiredUniqueTargetCount,
      task_count: tasks.length,
      distinct_target_count: distinctTargets,
      candidate_prefill_only: allCandidatePrefillOnly,
      all_real_send_disallowed: allRealSendDisallowed
    },
    operator_collection_tasks: tasks,
    checks,
    required_failures: requiredFailures,
    warning_failures: warningFailures,
    next_commands: requiredFailures.length === 0
      ? [
        `Open ${pack?.output_paths?.html_path ?? 'the PT-028 final feedback HTML'} and review each collection task.`,
        `Fill ${decisionTemplatePath ?? '<confirmation decision template>'} using the task decision_template_record_pointer values.`,
        `npm.cmd run pt028:feedback-finalize -- --decision=${decisionTemplatePath ?? '<decision.json>'}`,
        `npm.cmd run pt028:feedback-confirm:preflight -- --decision=${decisionTemplatePath ?? '<decision.json>'}`,
        'Manual fallback: after preflight returns ready_for_controlled_target_write=true, run npm.cmd run pt028:feedback-confirm -- --decision=<decision.json>, then npm.cmd run pt028:acceptance-chain -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json.'
      ]
      : [
        'Run npm.cmd run pt028:feedback-decision-pack.',
        'Run npm.cmd run pt028:feedback-handoff:validate.',
        'Rerun npm.cmd run pt028:feedback-collection:session after the handoff is ready.'
      ],
    boundary_policy: {
      session_is_read_only: true,
      operator_confirmation_required: true,
      preflight_required_before_target_write: true,
      real_feedback_target_writer: 'pt028:feedback-confirm -- --decision=<decision.json>',
      real_execution_allowed: false,
      real_send_attempted: false,
      writes_real_feedback_target: false
    }
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderMarkdown(session) {
  const tasks = session.operator_collection_tasks.map((task) => `| ${task.task_id} | ${task.target_person_id ?? ''} | ${task.window_id ?? ''} | ${task.draft_record_pointer} | ${task.decision_template_record_pointer} | ${task.status} |`).join('\n');
  const checks = session.checks.map((item) => `- ${item.status.toUpperCase()} ${item.check_id}: ${(item.evidence ?? []).join('; ')}`).join('\n');
  const commands = session.next_commands.map((item) => `- ${item}`).join('\n');
  return `# PT-028 Feedback Collection Session

- session_id: ${session.session_id}
- gate_decision: ${session.gate_decision}
- ready_for_operator_feedback_collection: ${session.ready_for_operator_feedback_collection}
- real_execution_allowed: ${session.real_execution_allowed}
- real_send_attempted: ${session.real_send_attempted}
- writes_real_feedback_target: ${session.writes_real_feedback_target}

## Scope

- task_count: ${session.collection_scope.task_count}
- distinct_target_count: ${session.collection_scope.distinct_target_count}
- candidate_prefill_only: ${session.collection_scope.candidate_prefill_only}
- all_real_send_disallowed: ${session.collection_scope.all_real_send_disallowed}

## Collection Tasks

| task | target | window | draft pointer | decision template pointer | status |
| --- | --- | --- | --- | --- | --- |
${tasks}

## Checks

${checks}

## Next Commands

${commands}

## Boundary

- This session is read-only.
- It does not write runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json.
- It does not send messages.
`;
}

function renderHtml(session) {
  const rows = session.operator_collection_tasks.map((task) => `<tr>
<td>${escapeHtml(task.task_id)}</td>
<td>${escapeHtml(task.target_person_id)}</td>
<td>${escapeHtml(task.window_id)}</td>
<td><code>${escapeHtml(task.draft_record_pointer)}</code></td>
<td><code>${escapeHtml(task.decision_template_record_pointer)}</code></td>
<td>${escapeHtml(task.status)}</td>
</tr>`).join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>PT-028 Feedback Collection Session</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #1f2937; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    code { white-space: nowrap; }
    .badge { display: inline-block; padding: 2px 6px; border: 1px solid #9ca3af; border-radius: 4px; }
  </style>
</head>
<body data-report-contract="pt028_feedback_collection_session.v1">
  <h1>PT-028 Feedback Collection Session</h1>
  <p><strong>Session:</strong> ${escapeHtml(session.session_id)}</p>
  <p><strong>Gate:</strong> <span class="badge">${escapeHtml(session.gate_decision)}</span></p>
  <p><strong>Boundary:</strong> read-only, prompt-only, no-send, no target write.</p>
  <table>
    <thead>
      <tr><th>Task</th><th>Target</th><th>Window</th><th>Draft Pointer</th><th>Decision Pointer</th><th>Status</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>
`;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/write-pt028-feedback-collection-session.mjs [--root=<dir>] [--handoff=<latest.json>] [--pack=<pack.json>] [--output-dir=<dir>] [--fail-on-required]',
    '',
    'Writes a read-only PT-028 operator feedback collection session from a validated handoff package.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve(argValue('root', process.cwd()));
  const handoffPath = resolveInputPath(root, argValue('handoff')) ?? defaultHandoffPath(root);
  const handoff = readJsonIfExists(handoffPath);
  const packPath = resolveInputPath(root, argValue('pack')) ?? defaultPackPath(root, handoff);
  const provisionalId = nowCompactId('pt028_feedback_collection_session');
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : path.join(root, 'runtime', 'pt028-feedback-collection-sessions', provisionalId);
  const session = buildSession({ root, handoffPath, packPath, outputDir });
  const finalOutputDir = argValue('output-dir')
    ? outputDir
    : path.join(root, 'runtime', 'pt028-feedback-collection-sessions', session.session_id);
  ensureDir(finalOutputDir);
  const jsonPath = path.join(finalOutputDir, 'pt028-feedback-collection-session.json');
  const markdownPath = path.join(finalOutputDir, 'pt028-feedback-collection-session.md');
  const htmlPath = path.join(finalOutputDir, 'pt028-feedback-collection-session.html');
  const latestPath = path.join(root, 'runtime', 'pt028-feedback-collection-sessions', 'latest.json');
  const manifest = {
    ...session,
    source: {
      ...session.source,
      output_dir: relativeToRoot(root, finalOutputDir)
    },
    output_paths: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      html_path: htmlPath,
      latest_path: latestPath
    }
  };
  writeFileSync(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdown(manifest), 'utf8');
  writeFileSync(htmlPath, renderHtml(manifest), 'utf8');
  ensureDir(path.dirname(latestPath));
  writeFileSync(latestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    command: 'write-pt028-feedback-collection-session',
    session_id: manifest.session_id,
    gate_decision: manifest.gate_decision,
    ready_for_operator_feedback_collection: manifest.ready_for_operator_feedback_collection,
    task_count: manifest.collection_scope.task_count,
    distinct_target_count: manifest.collection_scope.distinct_target_count,
    required_failures: manifest.required_failures,
    real_execution_allowed: manifest.real_execution_allowed,
    real_send_attempted: manifest.real_send_attempted,
    writes_real_feedback_target: manifest.writes_real_feedback_target,
    json_path: manifest.output_paths.json_path,
    markdown_path: manifest.output_paths.markdown_path,
    html_path: manifest.output_paths.html_path,
    latest_path: manifest.output_paths.latest_path
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && manifest.required_failures.length > 0) {
    process.exitCode = 2;
  }
}
