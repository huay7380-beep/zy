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

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function readTextIfExists(file) {
  if (!file || !existsSync(file)) return '';
  return readFileSync(file, 'utf8');
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function defaultPackPath(root) {
  return path.join(root, 'runtime', 'pt028-final-feedback-decision-packs', 'latest.json');
}

function check({ checkId, status, evidence = [], required = true }) {
  return {
    check_id: checkId,
    status: status ? 'passed' : 'failed',
    required,
    evidence
  };
}

function requiredFields() {
  return [
    'real_window_observed',
    'state_target_verified',
    'prompt_only_confirmed',
    'no_real_send_attempted',
    'privacy_boundary_confirmed',
    'reviewed_at',
    'evidence_refs'
  ];
}

function allArtifactRefsExist(root, pack) {
  const requiredRefs = [
    'workpack_json_path',
    'workpack_markdown_path',
    'draft_feedback_path',
    'confirmation_json_path',
    'confirmation_markdown_path',
    'confirmation_decision_template_path',
    'confirmation_preflight_json_path',
    'confirmation_preflight_markdown_path',
    'acceptance_chain_json_path',
    'acceptance_chain_markdown_path'
  ];
  const missing = requiredRefs
    .map((key) => ({ key, value: pack?.artifact_refs?.[key] }))
    .filter(({ value }) => !value || !existsSync(resolveInputPath(root, value)));
  return {
    ok: missing.length === 0,
    missing,
    requiredRefs
  };
}

function checklistSummary(checklist) {
  const rows = checklist?.rows ?? [];
  const distinctTargets = new Set(rows.map((row) => row.target_person_id).filter(Boolean));
  const missingFields = rows.flatMap((row) => {
    const fields = new Set(row.operator_must_confirm ?? []);
    return requiredFields()
      .filter((field) => !fields.has(field))
      .map((field) => `${row.row_id ?? row.slot_index}:${field}`);
  });
  return {
    row_count: rows.length,
    distinct_target_count: distinctTargets.size,
    all_candidate_prefill_only: rows.every((row) => row.candidate_prefill_only === true),
    all_real_send_disallowed: checklist?.boundary_policy?.real_send_allowed === false,
    missing_operator_fields: missingFields,
    rows_ready_for_target_write: rows.filter((row) => row.ready_for_real_feedback_target_write === true).length
  };
}

function buildValidation({ root, packPath, outputDir }) {
  const validationId = nowCompactId('pt028_feedback_handoff_validation');
  const packExists = existsSync(packPath);
  const pack = packExists ? readJson(packPath) : null;
  const jsonPath = resolveInputPath(root, pack?.output_paths?.json_path);
  const markdownPath = resolveInputPath(root, pack?.output_paths?.markdown_path);
  const htmlPath = resolveInputPath(root, pack?.output_paths?.html_path);
  const targetFeedbackPath = resolveInputPath(root, pack?.target_feedback_path);
  const markdown = readTextIfExists(markdownPath);
  const html = readTextIfExists(htmlPath);
  const artifactRefs = allArtifactRefsExist(root, pack);
  const checklist = pack?.operator_feedback_window_checklist;
  const checklistInfo = checklistSummary(checklist);
  const preflightPath = resolveInputPath(root, pack?.artifact_refs?.confirmation_preflight_json_path);
  const acceptanceChainPath = resolveInputPath(root, pack?.artifact_refs?.acceptance_chain_json_path);
  const preflight = existsSync(preflightPath ?? '') ? readJson(preflightPath) : null;
  const acceptanceChain = existsSync(acceptanceChainPath ?? '') ? readJson(acceptanceChainPath) : null;

  const checks = [
    check({
      checkId: 'decision_pack_present',
      status: packExists && pack?.schema_version === 'pt028_final_feedback_decision_pack.v1',
      evidence: [
        `pack_path=${relativeToRoot(root, packPath)}`,
        `schema=${pack?.schema_version ?? 'missing'}`
      ]
    }),
    check({
      checkId: 'operator_report_files_exist',
      status: Boolean(jsonPath && markdownPath && htmlPath && existsSync(jsonPath) && existsSync(markdownPath) && existsSync(htmlPath)),
      evidence: [
        `json=${relativeToRoot(root, jsonPath)}`,
        `markdown=${relativeToRoot(root, markdownPath)}`,
        `html=${relativeToRoot(root, htmlPath)}`
      ]
    }),
    check({
      checkId: 'operator_report_contains_required_markers',
      status: html.includes('pt028_final_feedback_decision_pack.v1')
        && html.includes('pt028:feedback-confirm:preflight')
        && html.includes('draft.window_feedback_records[0]')
        && markdown.includes('draft.window_feedback_records[0]'),
      evidence: [
        `html_has_contract=${html.includes('pt028_final_feedback_decision_pack.v1')}`,
        `html_has_preflight=${html.includes('pt028:feedback-confirm:preflight')}`,
        `html_has_first_draft_pointer=${html.includes('draft.window_feedback_records[0]')}`,
        `markdown_has_first_draft_pointer=${markdown.includes('draft.window_feedback_records[0]')}`
      ]
    }),
    check({
      checkId: 'window_checklist_ready_for_operator_collection',
      status: checklist?.schema_version === 'pt028_operator_feedback_window_checklist.v1'
        && checklistInfo.row_count >= (checklist?.required_window_count ?? 2)
        && checklistInfo.distinct_target_count >= (checklist?.required_unique_target_count ?? 2)
        && checklistInfo.all_candidate_prefill_only
        && checklistInfo.all_real_send_disallowed
        && checklistInfo.missing_operator_fields.length === 0,
      evidence: [
        `schema=${checklist?.schema_version ?? 'missing'}`,
        `row_count=${checklistInfo.row_count}`,
        `distinct_target_count=${checklistInfo.distinct_target_count}`,
        `candidate_prefill_only=${checklistInfo.all_candidate_prefill_only}`,
        `real_send_allowed=${checklist?.boundary_policy?.real_send_allowed}`,
        `missing_operator_fields=${checklistInfo.missing_operator_fields.join(',') || 'none'}`
      ]
    }),
    check({
      checkId: 'required_artifacts_exist',
      status: artifactRefs.ok,
      evidence: [
        `required_refs=${artifactRefs.requiredRefs.join(',')}`,
        `missing_refs=${artifactRefs.missing.map((item) => item.key).join(',') || 'none'}`
      ]
    }),
    check({
      checkId: 'confirmation_preflight_present_and_safe',
      status: preflight?.schema_version === 'pt028_feedback_confirmation_preflight.v1'
        && preflight?.writes_real_feedback_target === false
        && preflight?.real_send_attempted === false
        && preflight?.real_execution_allowed === false,
      evidence: [
        `preflight_path=${relativeToRoot(root, preflightPath)}`,
        `gate=${preflight?.gate_decision ?? 'missing'}`,
        `writes_real_feedback_target=${preflight?.writes_real_feedback_target}`,
        `real_send_attempted=${preflight?.real_send_attempted}`
      ]
    }),
    check({
      checkId: 'acceptance_chain_present_and_feedback_bound',
      status: acceptanceChain?.schema_version === 'pt028_acceptance_chain.v1'
        && acceptanceChain?.real_send_attempted === false
        && Array.isArray(acceptanceChain?.required_failures),
      evidence: [
        `acceptance_chain_path=${relativeToRoot(root, acceptanceChainPath)}`,
        `gate=${acceptanceChain?.gate_decision ?? 'missing'}`,
        `feedback_exists=${acceptanceChain?.feedback_exists}`,
        `required_failures=${(acceptanceChain?.required_failures ?? []).join(',')}`
      ]
    }),
    check({
      checkId: 'handoff_does_not_write_or_send',
      status: pack?.writes_real_feedback_target === false
        && pack?.real_send_attempted === false
        && pack?.real_execution_allowed === false
        && pack?.target_write_allowed_by_this_command === false,
      evidence: [
        `target_feedback_path=${relativeToRoot(root, targetFeedbackPath)}`,
        `target_feedback_exists=${targetFeedbackPath ? existsSync(targetFeedbackPath) : false}`,
        `writes_real_feedback_target=${pack?.writes_real_feedback_target}`,
        `real_send_attempted=${pack?.real_send_attempted}`,
        `target_write_allowed_by_this_command=${pack?.target_write_allowed_by_this_command}`
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
    schema_version: 'pt028_feedback_handoff_validation.v1',
    validation_id: validationId,
    created_at: new Date().toISOString(),
    gate_decision: requiredFailures.length === 0
      ? 'ready_for_operator_feedback_collection'
      : 'feedback_handoff_needs_attention',
    ready_for_operator_feedback_collection: requiredFailures.length === 0,
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: false,
    source: {
      root,
      pack_path: relativeToRoot(root, packPath),
      output_dir: relativeToRoot(root, outputDir)
    },
    linked_pack: {
      pack_id: pack?.pack_id ?? null,
      gate_decision: pack?.gate_decision ?? null,
      target_feedback_path: pack?.target_feedback_path ?? null,
      target_feedback_exists: targetFeedbackPath ? existsSync(targetFeedbackPath) : false,
      decision_template_path: pack?.artifact_refs?.confirmation_decision_template_path ?? null,
      html_path: pack?.output_paths?.html_path ?? null
    },
    checklist_summary: checklistInfo,
    checks,
    required_failures: requiredFailures,
    warning_failures: warningFailures,
    next_commands: requiredFailures.length === 0
      ? [
        `Open ${pack?.output_paths?.html_path ?? 'the latest PT-028 handoff HTML'} and complete each operator_feedback_window_checklist row.`,
        `Edit ${pack?.artifact_refs?.confirmation_decision_template_path ?? '<confirmation decision template>'} with human-reviewed real-window feedback.`,
        `npm.cmd run pt028:feedback-finalize -- --decision=${pack?.artifact_refs?.confirmation_decision_template_path ?? '<decision.json>'}`,
        `npm.cmd run pt028:feedback-confirm:preflight -- --decision=${pack?.artifact_refs?.confirmation_decision_template_path ?? '<decision.json>'}`,
        'Manual fallback: after preflight reports ready_for_controlled_target_write=true, run npm.cmd run pt028:feedback-confirm -- --decision=<decision.json>, then npm.cmd run pt028:acceptance-chain -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json.'
      ]
      : [
        'Run npm.cmd run pt028:feedback-decision-pack to refresh the handoff package.',
        'Fix the failed handoff validation checks, then rerun npm.cmd run pt028:feedback-handoff:validate.'
      ],
    boundary_policy: {
      validation_is_read_only: true,
      real_feedback_target_writer: 'pt028:feedback-confirm -- --decision=<decision.json>',
      real_execution_allowed: false,
      real_send_attempted: false,
      writes_real_feedback_target: false
    }
  };
}

function renderMarkdown(validation) {
  const checks = validation.checks
    .map((item) => `- ${item.status.toUpperCase()} ${item.check_id}: ${(item.evidence ?? []).join('; ')}`)
    .join('\n');
  const failures = validation.required_failures.map((item) => `- ${item}`).join('\n') || '- none';
  const commands = validation.next_commands.map((item) => `- ${item}`).join('\n');
  return `# PT-028 Feedback Handoff Validation

- validation_id: ${validation.validation_id}
- gate_decision: ${validation.gate_decision}
- ready_for_operator_feedback_collection: ${validation.ready_for_operator_feedback_collection}
- pack_id: ${validation.linked_pack.pack_id ?? 'missing'}
- real_execution_allowed: ${validation.real_execution_allowed}
- real_send_attempted: ${validation.real_send_attempted}
- writes_real_feedback_target: ${validation.writes_real_feedback_target}

## Checklist Summary

- row_count: ${validation.checklist_summary.row_count}
- distinct_target_count: ${validation.checklist_summary.distinct_target_count}
- all_candidate_prefill_only: ${validation.checklist_summary.all_candidate_prefill_only}
- rows_ready_for_target_write: ${validation.checklist_summary.rows_ready_for_target_write}

## Checks

${checks}

## Required Failures

${failures}

## Next Commands

${commands}

## Boundary

- This validation is read-only.
- It does not write runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json.
- It does not send messages.
`;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/validate-pt028-feedback-handoff.mjs [--root=<dir>] [--pack=<latest.json>] [--output-dir=<dir>] [--fail-on-required]',
    '',
    'Validates that the PT-028 final feedback handoff package is ready for operator feedback collection.',
    'This command is read-only: it never writes the real feedback target and never sends messages.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve(argValue('root', process.cwd()));
  const packPath = resolveInputPath(root, argValue('pack')) ?? defaultPackPath(root);
  const provisionalId = nowCompactId('pt028_feedback_handoff_validation');
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : path.join(root, 'runtime', 'pt028-feedback-handoff-validations', provisionalId);
  const validation = buildValidation({ root, packPath, outputDir });
  const finalOutputDir = argValue('output-dir')
    ? outputDir
    : path.join(root, 'runtime', 'pt028-feedback-handoff-validations', validation.validation_id);
  ensureDir(finalOutputDir);
  const jsonPath = path.join(finalOutputDir, 'pt028-feedback-handoff-validation.json');
  const markdownPath = path.join(finalOutputDir, 'pt028-feedback-handoff-validation.md');
  const latestPath = path.join(root, 'runtime', 'pt028-feedback-handoff-validations', 'latest.json');
  const manifest = {
    ...validation,
    source: {
      ...validation.source,
      output_dir: relativeToRoot(root, finalOutputDir)
    },
    output_paths: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      latest_path: latestPath
    }
  };
  writeFileSync(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdown(manifest), 'utf8');
  ensureDir(path.dirname(latestPath));
  writeFileSync(latestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    command: 'validate-pt028-feedback-handoff',
    validation_id: manifest.validation_id,
    gate_decision: manifest.gate_decision,
    ready_for_operator_feedback_collection: manifest.ready_for_operator_feedback_collection,
    required_failures: manifest.required_failures,
    real_execution_allowed: manifest.real_execution_allowed,
    real_send_attempted: manifest.real_send_attempted,
    writes_real_feedback_target: manifest.writes_real_feedback_target,
    json_path: manifest.output_paths.json_path,
    markdown_path: manifest.output_paths.markdown_path,
    latest_path: manifest.output_paths.latest_path
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && manifest.required_failures.length > 0) {
    process.exitCode = 2;
  }
}
