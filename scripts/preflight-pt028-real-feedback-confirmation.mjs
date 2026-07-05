#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildPt028RealFeedbackConfirmationResult
} from '../packages/decision-cluster/src/index.mjs';

function nowCompactId(prefix) {
  return `${prefix}_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/preflight-pt028-real-feedback-confirmation.mjs --decision=<decision.json> [--root=<dir>] [--target=<path>] [--allow-overwrite] [--output-dir=<dir>]',
    '  node scripts/preflight-pt028-real-feedback-confirmation.mjs [--root=<dir>]',
    '',
    'Validates a PT-028 real feedback confirmation decision without writing the real feedback target.',
    'When --decision is omitted, it tries the latest final feedback decision pack template path.',
    'It never sends messages and never writes runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json.'
  ].join('\n');
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function readJsonIfExists(file) {
  if (!file || !existsSync(file)) return null;
  return readJson(file);
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

function defaultDecisionPath(root) {
  const pack = readJsonIfExists(path.join(root, 'runtime', 'pt028-final-feedback-decision-packs', 'latest.json'));
  const fromPack = pack?.artifact_refs?.confirmation_decision_template_path;
  const resolvedFromPack = resolveInputPath(root, fromPack);
  if (resolvedFromPack && existsSync(resolvedFromPack)) return resolvedFromPack;

  const confirmation = readJsonIfExists(path.join(root, 'runtime', 'pt028-real-feedback-confirmations', 'latest.json'));
  const fromConfirmation = confirmation?.output_paths?.decision_template_path;
  const resolvedFromConfirmation = resolveInputPath(root, fromConfirmation);
  if (resolvedFromConfirmation && existsSync(resolvedFromConfirmation)) return resolvedFromConfirmation;
  return null;
}

function defaultCoveragePath(root) {
  const coveragePath = path.join(root, 'runtime', 'pt028-feedback-collection-coverages', 'latest.json');
  return existsSync(coveragePath) ? coveragePath : null;
}

function sameResolvedPath(root, left, right) {
  if (!left || !right) return false;
  return path.resolve(root, left) === path.resolve(root, right);
}

function applyCollectionCoverageGate({ result, root, decisionPath, coveragePath }) {
  const coverage = readJsonIfExists(coveragePath);
  const decisionRelativePath = relativeToRoot(root, decisionPath);
  const coverageDecisionPath = coverage?.source?.decision_path ?? null;
  const coverageReady = coverage?.schema_version === 'pt028_feedback_collection_coverage.v1'
    && coverage?.ready_for_confirmation_preflight === true
    && (coverage?.required_failures ?? []).length === 0;
  const coveragePathMatchesDecision = sameResolvedPath(root, coverageDecisionPath, decisionPath);
  const coverageGatePassed = coverageReady && coveragePathMatchesDecision;
  const coverageCheck = {
    check_id: 'collection_coverage_ready',
    status: coverageGatePassed ? 'passed' : 'open',
    severity: 'required',
    evidence: [
      `coverage_path=${relativeToRoot(root, coveragePath) ?? 'missing'}`,
      `coverage_gate=${coverage?.gate_decision ?? 'missing'}`,
      `coverage_ready=${coverage?.ready_for_confirmation_preflight === true}`,
      `coverage_failures=${(coverage?.required_failures ?? []).join(',') || 'none'}`,
      `coverage_decision_path=${coverageDecisionPath ?? 'missing'}`,
      `decision_path=${decisionRelativePath ?? 'missing'}`,
      `coverage_matches_decision=${coveragePathMatchesDecision}`
    ]
  };
  const requiredFailures = [
    ...(result.required_failures ?? []),
    ...(coverageCheck.status === 'passed' ? [] : ['collection_coverage_ready'])
  ];
  const writesAllowed = requiredFailures.length === 0;
  return {
    ...result,
    gate_decision: writesAllowed
      ? 'ready_to_write_real_feedback_target'
      : 'operator_confirmation_required_before_target_write',
    writes_real_feedback_target_allowed: writesAllowed,
    checks: [
      ...(result.checks ?? []),
      coverageCheck
    ],
    required_failures: requiredFailures,
    collection_coverage_summary: {
      coverage_path: relativeToRoot(root, coveragePath),
      coverage_id: coverage?.coverage_id ?? null,
      gate_decision: coverage?.gate_decision ?? null,
      ready_for_confirmation_preflight: coverage?.ready_for_confirmation_preflight === true,
      matched_task_count: coverage?.coverage_summary?.matched_task_count ?? 0,
      confirmed_task_count: coverage?.coverage_summary?.confirmed_task_count ?? 0,
      required_failures: coverage?.required_failures ?? [],
      decision_path: coverageDecisionPath,
      matches_decision_path: coveragePathMatchesDecision,
      coverage_gate_passed: coverageGatePassed
    },
    next_commands: writesAllowed
      ? (result.next_commands ?? [])
      : [
        decisionRelativePath
          ? `npm.cmd run pt028:feedback-collection:coverage -- --decision=${decisionRelativePath}`
          : 'Run npm.cmd run pt028:feedback-decision-pack and npm.cmd run pt028:feedback-collection:session first.',
        ...(result.next_commands ?? [])
      ]
  };
}

function fieldHintsForFailures(failures) {
  const hints = {
    confirmation_decision_present: [
      'Provide --decision=<pt028_real_feedback_confirmation_decision.v1 JSON> or run npm.cmd run pt028:feedback-decision-pack first.'
    ],
    confirmation_schema_valid: [
      'schema_version must equal pt028_real_feedback_confirmation_decision.v1.'
    ],
    operator_approved_target_write: [
      'operator_confirmation.approved_to_write_real_feedback_target=true'
    ],
    operator_confirmation_flags_complete: [
      'operator_confirmation.confirm_real_windows_observed=true',
      'operator_confirmation.confirm_target_binding=true',
      'operator_confirmation.confirm_prompt_only=true',
      'operator_confirmation.confirm_no_real_send=true',
      'operator_confirmation.confirm_privacy_boundary=true',
      'operator_confirmation.confirm_human_special_review=true'
    ],
    operator_reviewer_identity_complete: [
      'operator_confirmation.reviewer_id',
      'operator_confirmation.reviewed_at'
    ],
    no_placeholder_values: [
      'Replace every REPLACE_WITH / PLACEHOLDER / _TEMPLATE value in source, operator_confirmation and feedback_batch.'
    ],
    real_feedback_readiness_final_ready: [
      'feedback_batch.window_feedback_records must contain at least two real windows and two distinct target_person_id values.',
      'Every window record must confirm real_window_observed, state_target_verified, prompt_only_confirmed, no_real_send_attempted and privacy_boundary_confirmed.',
      'If a window row was prefilled from candidate evidence, set candidate_requires_operator_confirmation=false only after the operator verifies that row against the real window.',
      'feedback_batch.human_special_review.approved_for_final_special_acceptance=true'
    ],
    collection_coverage_ready: [
      'Run npm.cmd run pt028:feedback-collection:session after the latest handoff is ready.',
      'Fill the confirmation decision template according to the collection session task pointers.',
      'Run npm.cmd run pt028:feedback-collection:coverage -- --decision=<decision.json> until ready_for_confirmation_preflight=true.'
    ],
    target_write_does_not_overwrite_without_permission: [
      'Use --allow-overwrite only after intentionally replacing the current real feedback target file.'
    ],
    real_send_remains_blocked: [
      'decision.real_execution_allowed=false',
      'decision.real_send_attempted=false',
      'feedback_batch.real_execution_allowed=false',
      'feedback_batch.real_send_attempted=false'
    ]
  };
  return failures.map((failure) => ({
    failure_id: failure,
    fields_or_actions: hints[failure] ?? ['Review the matching confirmation check evidence.']
  }));
}

function renderMarkdown(preflight) {
  const checks = (preflight.checks ?? [])
    .map((check) => `- ${check.status.toUpperCase()} ${check.check_id}: ${(check.evidence ?? []).join('; ')}`)
    .join('\n') || '- No checks were generated.';
  const failures = (preflight.required_failures ?? [])
    .map((failure) => `- ${failure}`)
    .join('\n') || '- No required failures.';
  const hints = (preflight.placeholder_or_missing_field_groups ?? [])
    .map((group) => [
      `- ${group.failure_id}`,
      ...group.fields_or_actions.map((item) => `  - ${item}`)
    ].join('\n'))
    .join('\n') || '- No missing field hints.';
  const commands = (preflight.next_commands ?? [])
    .map((command) => `- \`${command}\``)
    .join('\n') || '- No next commands were generated.';

  return `# PT-028 Feedback Confirmation Preflight

- preflight_id: ${preflight.preflight_id}
- gate_decision: ${preflight.gate_decision}
- ready_for_controlled_target_write: ${preflight.ready_for_controlled_target_write === true}
- writes_real_feedback_target: ${preflight.writes_real_feedback_target === true}
- target_feedback_path: ${preflight.target_feedback_path ?? 'missing'}
- target_feedback_exists: ${preflight.target_feedback_exists === true}
- decision_path: ${preflight.source?.decision_path ?? 'missing'}
- real_execution_allowed: ${preflight.real_execution_allowed === true}
- real_send_attempted: ${preflight.real_send_attempted === true}

## Readiness Summary

- readiness_gate: ${preflight.readiness_summary?.gate_decision ?? 'missing'}
- final_acceptance_ready: ${preflight.readiness_summary?.final_acceptance_ready === true}
- window_count: ${preflight.readiness_summary?.window_count ?? 0}
- unique_target_count: ${preflight.readiness_summary?.unique_target_count ?? 0}
- human_special_review_ready: ${preflight.readiness_summary?.human_special_review_ready === true}

## Checks

${checks}

## Required Failures

${failures}

## Missing Fields Or Actions

${hints}

## Next Commands

${commands}

## Boundary

- This preflight never writes the real feedback target.
- It is safe to rerun while the operator edits the confirmation decision.
- If ready_for_controlled_target_write=true, use pt028:feedback-confirm for the controlled target write, then rerun the acceptance chain.
- Real sending remains blocked.
`;
}

function buildPreflight({ result, root, decisionPath, outputDir }) {
  const preflightId = nowCompactId('pt028_feedback_confirmation_preflight');
  const ready = result.writes_real_feedback_target_allowed === true;
  const decisionRelativePath = relativeToRoot(root, decisionPath);
  return {
    schema_version: 'pt028_feedback_confirmation_preflight.v1',
    preflight_id: preflightId,
    created_at: new Date().toISOString(),
    gate_decision: ready
      ? 'confirmation_decision_ready_for_controlled_target_write'
      : 'confirmation_decision_needs_attention',
    ready_for_controlled_target_write: ready,
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: false,
    target_feedback_path: result.target_feedback_path,
    target_feedback_exists: result.target_feedback_exists,
    source: {
      root,
      decision_path: decisionRelativePath,
      confirmation_result_gate: result.gate_decision,
      output_dir: relativeToRoot(root, outputDir)
    },
    operator_confirmation_status: result.operator_confirmation_status,
    readiness_summary: result.readiness_summary,
    collection_coverage_summary: result.collection_coverage_summary ?? null,
    checks: result.checks,
    required_failures: result.required_failures,
    placeholder_or_missing_field_groups: fieldHintsForFailures(result.required_failures ?? []),
    next_commands: ready
      ? [
        `npm.cmd run pt028:feedback-confirm -- --decision=${decisionRelativePath}`,
        'npm.cmd run pt028:acceptance-chain -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
        'npm.cmd run pt028:audit'
      ]
      : [
        decisionRelativePath
          ? `Edit ${decisionRelativePath} until all required_failures are cleared.`
          : 'Run npm.cmd run pt028:feedback-decision-pack to generate a confirmation decision template.',
        decisionRelativePath
          ? `npm.cmd run pt028:feedback-confirm:preflight -- --decision=${decisionRelativePath}`
          : 'npm.cmd run pt028:feedback-confirm:preflight',
        'Do not run pt028:feedback-confirm for target write until this preflight reports ready_for_controlled_target_write=true.'
      ],
    boundary_policy: {
      preflight_never_writes_real_feedback_target: true,
      controlled_target_writer: 'pt028:feedback-confirm -- --decision=<decision.json>',
      real_execution_allowed: false,
      real_send_attempted: false,
      candidate_observations_are_not_final_feedback: true
    }
  };
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve(argValue('root', process.cwd()));
  const decisionPath = resolveInputPath(root, argValue('decision')) ?? defaultDecisionPath(root);
  const targetFeedbackPath = resolveInputPath(root, argValue('target'));
  const coveragePath = resolveInputPath(root, argValue('coverage')) ?? defaultCoveragePath(root);
  const allowOverwriteExistingTarget = process.argv.includes('--allow-overwrite');
  const decision = decisionPath ? readJson(decisionPath) : null;

  const baseResult = buildPt028RealFeedbackConfirmationResult({
    decision,
    root,
    targetFeedbackPath,
    allowOverwriteExistingTarget,
    pathExists: (candidate) => existsSync(candidate),
    readJson: (candidate) => readJson(candidate)
  });
  const result = applyCollectionCoverageGate({
    result: baseResult,
    root,
    decisionPath,
    coveragePath
  });
  const provisionalPreflightId = nowCompactId('pt028_feedback_confirmation_preflight');
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : path.join(root, 'runtime', 'pt028-feedback-confirmation-preflights', provisionalPreflightId);
  const preflight = buildPreflight({ result, root, decisionPath, outputDir });
  const finalOutputDir = argValue('output-dir')
    ? outputDir
    : path.join(root, 'runtime', 'pt028-feedback-confirmation-preflights', preflight.preflight_id);
  ensureDir(finalOutputDir);
  const jsonPath = path.join(finalOutputDir, 'pt028-feedback-confirmation-preflight.json');
  const markdownPath = path.join(finalOutputDir, 'pt028-feedback-confirmation-preflight.md');
  const latestPath = path.join(root, 'runtime', 'pt028-feedback-confirmation-preflights', 'latest.json');
  const manifest = {
    ...preflight,
    source: {
      ...preflight.source,
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
    command: 'preflight-pt028-real-feedback-confirmation',
    preflight_id: manifest.preflight_id,
    gate_decision: manifest.gate_decision,
    decision_path: manifest.source.decision_path,
    ready_for_controlled_target_write: manifest.ready_for_controlled_target_write,
    writes_real_feedback_target: manifest.writes_real_feedback_target,
    target_feedback_path: manifest.target_feedback_path,
    target_feedback_exists: manifest.target_feedback_exists,
    real_execution_allowed: manifest.real_execution_allowed,
    real_send_attempted: manifest.real_send_attempted,
    required_failures: manifest.required_failures,
    readiness_required_failures: manifest.readiness_summary?.required_failures ?? [],
    collection_coverage_required_failures: manifest.collection_coverage_summary?.required_failures ?? [],
    json_path: manifest.output_paths.json_path,
    markdown_path: manifest.output_paths.markdown_path,
    latest_path: manifest.output_paths.latest_path
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && manifest.required_failures.length > 0) {
    process.exitCode = 2;
  }
}
