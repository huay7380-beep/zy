#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

function defaultDecisionPath(root) {
  const pack = readJsonIfExists(path.join(root, 'runtime', 'pt028-final-feedback-decision-packs', 'latest.json'));
  const fromPack = resolveInputPath(root, pack?.artifact_refs?.confirmation_decision_template_path);
  return fromPack && existsSync(fromPack) ? fromPack : null;
}

function defaultSessionPath(root) {
  const sessionPath = path.join(root, 'runtime', 'pt028-feedback-collection-sessions', 'latest.json');
  return existsSync(sessionPath) ? sessionPath : null;
}

function defaultTargetFeedbackPath(root) {
  return path.join(root, 'runtime', 'user-inputs', 'pt028-real-multi-window-operator-feedback.real.json');
}

function repoScript(name) {
  return path.resolve('scripts', name);
}

function parseJsonStdout(stdout) {
  const text = String(stdout ?? '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    return null;
  }
}

function runNodeScript({ script, args = [], cwd = process.cwd() }) {
  const result = spawnSync(process.execPath, [repoScript(script), ...args], {
    cwd,
    encoding: 'utf8'
  });
  return {
    script,
    args,
    exit_status: result.status,
    ok: result.status === 0,
    stdout_json: parseJsonStdout(result.stdout),
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function stepSummary(stepId, run, extra = {}) {
  const out = run?.stdout_json ?? {};
  return {
    step_id: stepId,
    script: run?.script ?? null,
    args: run?.args ?? [],
    exit_status: run?.exit_status ?? null,
    ok: run?.ok === true,
    gate_decision: out.gate_decision ?? out.overall_status ?? extra.gate_decision ?? null,
    required_failures: out.required_failures ?? extra.required_failures ?? [],
    json_path: out.json_path ?? extra.json_path ?? null,
    markdown_path: out.markdown_path ?? extra.markdown_path ?? null,
    latest_path: out.latest_path ?? extra.latest_path ?? null,
    stdout_json: out,
    ...extra
  };
}

function skippedStep(stepId, reason, requiredFailures = []) {
  return {
    step_id: stepId,
    script: null,
    args: [],
    exit_status: null,
    ok: false,
    gate_decision: 'skipped',
    required_failures: requiredFailures,
    skip_reason: reason,
    json_path: null,
    markdown_path: null,
    latest_path: null,
    stdout_json: null
  };
}

function renderMarkdown(report) {
  const rows = report.steps.map((step) => (
    `| ${step.step_id} | ${step.ok} | ${step.gate_decision ?? ''} | ${(step.required_failures ?? []).join(', ') || 'none'} | ${step.json_path ?? ''} |`
  )).join('\n');
  const failures = report.required_failures.length
    ? report.required_failures.map((item) => `- ${item}`).join('\n')
    : '- none';
  const commands = report.next_commands.map((item) => `- ${item}`).join('\n');
  return `# PT-028 Real Feedback Finalization

- finalization_id: ${report.finalization_id}
- gate_decision: ${report.gate_decision}
- ready_for_final_acceptance: ${report.ready_for_final_acceptance}
- target_feedback_exists: ${report.target_feedback_exists}
- writes_real_feedback_target: ${report.writes_real_feedback_target}
- real_execution_allowed: ${report.real_execution_allowed}
- real_send_attempted: ${report.real_send_attempted}

## Steps

| step | ok | gate | required failures | json |
| --- | --- | --- | --- | --- |
${rows}

## Required Failures

${failures}

## Next Commands

${commands}

## Boundary

- This runner never sends messages.
- The only target writer is confirm-pt028-real-feedback.mjs after coverage and preflight are ready.
- If the decision is incomplete, this runner writes only finalization artifacts.
`;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/run-pt028-real-feedback-finalization.mjs --decision=<decision.json> [--root=<dir>] [--session=<session.json>] [--target=<feedback.json>] [--audit=<audit.json>] [--output-dir=<dir>] [--fail-on-required]',
    '',
    'Runs PT-028 collection coverage, preflight, controlled confirmation write, feedback-bound event stream, readiness, calibration and acceptance-chain.',
    'It never sends messages and does not write the real feedback target unless coverage and preflight are ready.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve(argValue('root', process.cwd()));
  const finalizationId = nowCompactId('pt028_real_feedback_finalization');
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : path.join(root, 'runtime', 'pt028-real-feedback-finalizations', finalizationId);
  const artifactsDir = path.join(outputDir, 'artifacts');
  mkdirSync(artifactsDir, { recursive: true });

  const decisionPath = resolveInputPath(root, argValue('decision')) ?? defaultDecisionPath(root);
  const sessionPath = resolveInputPath(root, argValue('session')) ?? defaultSessionPath(root);
  const targetFeedbackPath = resolveInputPath(root, argValue('target')) ?? defaultTargetFeedbackPath(root);
  const auditPath = resolveInputPath(root, argValue('audit'));
  const steps = [];

  if (!decisionPath || !existsSync(decisionPath)) {
    steps.push(skippedStep('decision_input', 'missing_decision', ['decision_input_missing']));
  } else {
    const coverageRun = runNodeScript({
      script: 'validate-pt028-feedback-collection-coverage.mjs',
      args: [
        `--root=${root}`,
        ...(sessionPath ? [`--session=${sessionPath}`] : []),
        `--decision=${decisionPath}`,
        `--output-dir=${path.join(artifactsDir, 'collection-coverage')}`
      ]
    });
    const coverageStep = stepSummary('collection_coverage', coverageRun);
    steps.push(coverageStep);

    const coveragePath = coverageStep.json_path;
    const preflightRun = runNodeScript({
      script: 'preflight-pt028-real-feedback-confirmation.mjs',
      args: [
        `--root=${root}`,
        `--decision=${decisionPath}`,
        ...(coveragePath ? [`--coverage=${coveragePath}`] : []),
        `--target=${targetFeedbackPath}`,
        `--output-dir=${path.join(artifactsDir, 'confirmation-preflight')}`
      ]
    });
    const preflightStep = stepSummary('confirmation_preflight', preflightRun);
    steps.push(preflightStep);

    if (preflightStep.stdout_json?.ready_for_controlled_target_write === true) {
      const confirmRun = runNodeScript({
        script: 'confirm-pt028-real-feedback.mjs',
        args: [
          `--root=${root}`,
          `--decision=${decisionPath}`,
          ...(coveragePath ? [`--coverage=${coveragePath}`] : []),
          `--target=${targetFeedbackPath}`,
          `--output-dir=${path.join(artifactsDir, 'confirmation-write')}`
        ]
      });
      steps.push(stepSummary('confirmation_write', confirmRun));
    } else {
      steps.push(skippedStep(
        'confirmation_write',
        'preflight_not_ready',
        ['confirmation_preflight_not_ready']
      ));
    }
  }

  const targetExistsAfterConfirm = existsSync(targetFeedbackPath);
  if (targetExistsAfterConfirm) {
    const feedbackArg = [`--feedback=${targetFeedbackPath}`];
    const feedbackEventStreamStep = stepSummary('feedback_bound_event_stream', runNodeScript({
      script: 'write-pt028-gui-event-stream.mjs',
      args: [
        `--root=${root}`,
        ...feedbackArg,
        `--output-dir=${path.join(artifactsDir, 'feedback-bound-event-stream')}`
      ]
    }));
    steps.push(feedbackEventStreamStep);
    steps.push(stepSummary('feedback_bound_event_stream_health', runNodeScript({
      script: 'validate-pt028-event-stream-health.mjs',
      args: [
        `--root=${root}`,
        ...(feedbackEventStreamStep.json_path ? [`--stream=${feedbackEventStreamStep.json_path}`] : []),
        `--output-dir=${path.join(artifactsDir, 'feedback-bound-event-stream-health')}`
      ]
    })));
    steps.push(stepSummary('feedback_readiness', runNodeScript({
      script: 'validate-pt028-real-feedback-readiness.mjs',
      args: [
        `--root=${root}`,
        ...feedbackArg,
        `--output-dir=${path.join(artifactsDir, 'feedback-readiness')}`
      ]
    })));
    steps.push(stepSummary('feedback_calibration', runNodeScript({
      script: 'run-pt028-multi-window-feedback-calibration.mjs',
      args: [
        `--root=${root}`,
        ...feedbackArg,
        `--output-dir=${path.join(artifactsDir, 'feedback-calibration')}`
      ]
    })));
    steps.push(stepSummary('acceptance_chain', runNodeScript({
      script: 'run-pt028-acceptance-chain.mjs',
      args: [
        `--root=${root}`,
        ...feedbackArg,
        ...(auditPath ? [`--audit=${auditPath}`] : []),
        `--output-dir=${path.join(artifactsDir, 'acceptance-chain')}`
      ]
    })));
  } else {
    if (sessionPath) {
      const collectionEventStreamStep = stepSummary('collection_session_event_stream', runNodeScript({
        script: 'write-pt028-gui-event-stream.mjs',
        args: [
          `--root=${root}`,
          `--session=${sessionPath}`,
          `--output-dir=${path.join(artifactsDir, 'collection-session-event-stream')}`
        ]
      }));
      steps.push(collectionEventStreamStep);
      steps.push(stepSummary('collection_session_event_stream_health', runNodeScript({
        script: 'validate-pt028-event-stream-health.mjs',
        args: [
          `--root=${root}`,
          ...(collectionEventStreamStep.json_path ? [`--stream=${collectionEventStreamStep.json_path}`] : []),
          `--output-dir=${path.join(artifactsDir, 'collection-session-event-stream-health')}`
        ]
      })));
    }
    steps.push(stepSummary('acceptance_chain_blocked_preview', runNodeScript({
      script: 'run-pt028-acceptance-chain.mjs',
      args: [
        `--root=${root}`,
        ...(auditPath ? [`--audit=${auditPath}`] : []),
        `--output-dir=${path.join(artifactsDir, 'acceptance-chain-blocked-preview')}`
      ]
    })));
  }

  const commandFailures = steps
    .filter((step) => step.ok !== true && step.gate_decision !== 'skipped')
    .map((step) => `${step.step_id}_command_failed`);
  const stepRequiredFailures = steps.flatMap((step) => (
    (step.required_failures ?? []).map((failure) => `${step.step_id}:${failure}`)
  ));
  const acceptanceStep = steps.find((step) => step.step_id === 'acceptance_chain');
  const readyForFinalAcceptance = acceptanceStep?.stdout_json?.pt028_fully_accepted_for_production === true;
  const requiredFailures = [
    ...commandFailures,
    ...stepRequiredFailures
  ];
  const report = {
    schema_version: 'pt028_real_feedback_finalization.v1',
    finalization_id: finalizationId,
    created_at: new Date().toISOString(),
    root,
    gate_decision: readyForFinalAcceptance && requiredFailures.length === 0
      ? 'pt028_real_feedback_finalization_passed'
      : 'pt028_real_feedback_finalization_blocked',
    ready_for_final_acceptance: readyForFinalAcceptance && requiredFailures.length === 0,
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: steps.some((step) => step.stdout_json?.writes_real_feedback_target === true),
    target_feedback_path: relativeToRoot(root, targetFeedbackPath),
    target_feedback_exists: existsSync(targetFeedbackPath),
    source: {
      decision_path: relativeToRoot(root, decisionPath),
      session_path: relativeToRoot(root, sessionPath),
      audit_path: relativeToRoot(root, auditPath),
      output_dir: relativeToRoot(root, outputDir)
    },
    steps,
    required_failures: requiredFailures,
    warning_failures: [],
    next_commands: requiredFailures.length === 0
      ? [
        `npm.cmd run pt028:acceptance-chain -- --feedback=${relativeToRoot(root, targetFeedbackPath)}`
      ]
      : [
        decisionPath
          ? `Fill and rerun npm.cmd run pt028:feedback-finalize -- --decision=${relativeToRoot(root, decisionPath)}`
          : 'Run npm.cmd run pt028:feedback-decision-pack and fill the generated confirmation decision template.',
        'Do not enable real sending; this chain remains prompt-only.'
      ],
    boundary_policy: {
      runner_never_sends_messages: true,
      controlled_target_writer: 'confirm-pt028-real-feedback.mjs',
      requires_collection_coverage_ready: true,
      requires_preflight_ready: true,
      real_execution_allowed: false,
      real_send_attempted: false
    }
  };

  const jsonPath = path.join(outputDir, 'pt028-real-feedback-finalization.json');
  const markdownPath = path.join(outputDir, 'pt028-real-feedback-finalization.md');
  const latestPath = path.join(root, 'runtime', 'pt028-real-feedback-finalizations', 'latest.json');
  mkdirSync(path.dirname(latestPath), { recursive: true });
  const reportWithPaths = {
    ...report,
    output_paths: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      latest_path: latestPath
    }
  };
  writeFileSync(jsonPath, `${JSON.stringify(reportWithPaths, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdown(reportWithPaths), 'utf8');
  writeFileSync(latestPath, `${JSON.stringify(reportWithPaths, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    command: 'run-pt028-real-feedback-finalization',
    finalization_id: report.finalization_id,
    gate_decision: report.gate_decision,
    ready_for_final_acceptance: report.ready_for_final_acceptance,
    target_feedback_exists: report.target_feedback_exists,
    writes_real_feedback_target: report.writes_real_feedback_target,
    required_failures: report.required_failures,
    real_execution_allowed: report.real_execution_allowed,
    real_send_attempted: report.real_send_attempted,
    json_path: jsonPath,
    markdown_path: markdownPath,
    latest_path: latestPath
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && report.required_failures.length > 0) {
    process.exitCode = 2;
  }
}
