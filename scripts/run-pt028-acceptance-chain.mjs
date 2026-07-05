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

function defaultFeedbackPath(root) {
  return path.join(root, 'runtime', 'user-inputs', 'pt028-real-multi-window-operator-feedback.real.json');
}

function defaultCollectionSessionPath(root) {
  const sessionPath = path.join(root, 'runtime', 'pt028-feedback-collection-sessions', 'latest.json');
  return existsSync(sessionPath) ? sessionPath : null;
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
    stdout_json: parseJsonStdout(result.stdout),
    stdout: result.stdout,
    stderr: result.stderr,
    ok: result.status === 0
  };
}

function commandSummary(stepId, run) {
  const out = run.stdout_json ?? {};
  return {
    step_id: stepId,
    script: run.script,
    exit_status: run.exit_status,
    ok: run.ok,
    gate_decision: out.gate_decision ?? out.overall_status ?? null,
    required_failures: out.required_failures ?? [],
    json_path: out.json_path ?? null,
    markdown_path: out.markdown_path ?? null,
    latest_path: out.latest_path ?? null,
    stdout_json: out
  };
}

function renderMarkdown(chain) {
  const steps = chain.steps
    .map((step) => `| ${step.step_id} | ${step.ok} | ${step.gate_decision ?? ''} | ${(step.required_failures ?? []).join(', ') || 'none'} | ${step.json_path ?? ''} |`)
    .join('\n');
  const failures = (chain.required_failures ?? []).map((failure) => `- ${failure}`).join('\n') || 'No required failures.';
  return `# PT-028 Acceptance Chain

- chain_id: ${chain.chain_id}
- gate_decision: ${chain.gate_decision}
- pt028_fully_accepted_for_production: ${chain.pt028_fully_accepted_for_production === true}
- feedback_path: ${chain.feedback_path ?? 'missing'}
- feedback_exists: ${chain.feedback_exists === true}
- real_execution_allowed: ${chain.real_execution_allowed === true}
- real_send_attempted: ${chain.real_send_attempted === true}

## Steps

| step | ok | gate | failures | json |
| --- | --- | --- | --- | --- |
${steps}

## Required Failures

${failures}

## Boundary

- This chain never sends messages.
- If a confirmation decision is supplied, the target feedback file is written only by the confirmation gate.
- Final production acceptance still requires real multi-window feedback, low-latency event stream evidence and final human special review.
`;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/run-pt028-acceptance-chain.mjs [--root=<dir>] [--feedback=<file>] [--decision=<file>] [--audit=<file>]',
    '',
    'Runs PT-028 confirmation/event-stream/readiness/calibration/audit/final-acceptance in order.',
    'It never sends messages.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve(argValue('root', process.cwd()));
  const chainId = nowCompactId('pt028_acceptance_chain');
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : path.join(root, 'runtime', 'pt028-acceptance-chains', chainId);
  const artifactsDir = path.join(outputDir, 'artifacts');
  mkdirSync(artifactsDir, { recursive: true });

  const explicitFeedbackPath = resolveInputPath(root, argValue('feedback'));
  const decisionPath = resolveInputPath(root, argValue('decision'));
  const explicitAuditPath = resolveInputPath(root, argValue('audit'));
  const targetFeedbackPath = explicitFeedbackPath ?? defaultFeedbackPath(root);
  const collectionSessionPath = defaultCollectionSessionPath(root);
  const initialFeedbackExists = existsSync(targetFeedbackPath);
  const steps = [];

  if (decisionPath) {
    steps.push(commandSummary('feedback_confirm', runNodeScript({
      script: 'confirm-pt028-real-feedback.mjs',
      args: [
        `--root=${root}`,
        `--decision=${decisionPath}`,
        `--target=${targetFeedbackPath}`,
        `--output-dir=${path.join(artifactsDir, 'feedback-confirm')}`
      ]
    })));
  } else if (initialFeedbackExists) {
    steps.push({
      step_id: 'existing_feedback_reference',
      script: 'external-feedback',
      exit_status: 0,
      ok: true,
      gate_decision: 'existing_feedback_bound',
      required_failures: [],
      json_path: targetFeedbackPath,
      markdown_path: null,
      latest_path: null,
      stdout_json: {
        feedback_path: targetFeedbackPath
      }
    });
  } else {
    steps.push(commandSummary('feedback_confirm_template', runNodeScript({
      script: 'confirm-pt028-real-feedback.mjs',
      args: [
        `--root=${root}`,
        `--target=${targetFeedbackPath}`,
        `--output-dir=${path.join(artifactsDir, 'feedback-confirm-template')}`
      ]
    })));
  }

  const feedbackExists = existsSync(targetFeedbackPath);
  const feedbackArg = feedbackExists ? [`--feedback=${targetFeedbackPath}`] : [];
  const eventStreamInputArg = feedbackExists
    ? feedbackArg
    : collectionSessionPath
      ? [`--session=${collectionSessionPath}`]
      : [];

  const eventStreamStep = commandSummary('event_stream', runNodeScript({
    script: 'write-pt028-gui-event-stream.mjs',
    args: [
      `--root=${root}`,
      ...eventStreamInputArg,
      `--output-dir=${path.join(artifactsDir, 'event-stream')}`
    ]
  }));
  steps.push(eventStreamStep);
  steps.push(commandSummary('event_stream_health', runNodeScript({
    script: 'validate-pt028-event-stream-health.mjs',
    args: [
      `--root=${root}`,
      ...(eventStreamStep.json_path ? [`--stream=${eventStreamStep.json_path}`] : []),
      `--output-dir=${path.join(artifactsDir, 'event-stream-health')}`
    ]
  })));
  steps.push(commandSummary('feedback_readiness', runNodeScript({
    script: 'validate-pt028-real-feedback-readiness.mjs',
    args: [
      `--root=${root}`,
      ...feedbackArg,
      `--output-dir=${path.join(artifactsDir, 'feedback-readiness')}`
    ]
  })));
  steps.push(commandSummary('feedback_calibration', runNodeScript({
    script: 'run-pt028-multi-window-feedback-calibration.mjs',
    args: [
      `--root=${root}`,
      ...feedbackArg,
      `--output-dir=${path.join(artifactsDir, 'feedback-calibration')}`
    ]
  })));

  let auditPath = explicitAuditPath;
  if (auditPath) {
    steps.push({
      step_id: 'explicit_audit_reference',
      script: 'external-audit',
      exit_status: 0,
      ok: true,
      gate_decision: 'explicit_audit_bound',
      required_failures: [],
      json_path: auditPath,
      markdown_path: null,
      latest_path: null,
      stdout_json: {
        audit_path: auditPath
      }
    });
  } else {
    const auditPre = commandSummary('audit_before_final', runNodeScript({
      script: 'audit-pt028-romantic-flow.mjs',
      args: [
        `--root=${root}`,
        `--output-dir=${path.join(root, 'runtime', 'pt028-audits', `${chainId}_before_final`)}`
      ]
    }));
    steps.push(auditPre);
    auditPath = auditPre.json_path;
  }

  steps.push(commandSummary('final_acceptance_first_pass', runNodeScript({
    script: 'validate-pt028-final-special-acceptance.mjs',
    args: [
      `--root=${root}`,
      ...feedbackArg,
      ...(auditPath ? [`--audit=${auditPath}`] : []),
      `--output-dir=${path.join(artifactsDir, 'final-acceptance-first-pass')}`
    ]
  })));

  let auditPost = null;
  if (!explicitAuditPath) {
    auditPost = commandSummary('audit_after_first_final', runNodeScript({
      script: 'audit-pt028-romantic-flow.mjs',
      args: [
        `--root=${root}`,
        `--output-dir=${path.join(root, 'runtime', 'pt028-audits', `${chainId}_after_first_final`)}`
      ]
    }));
    steps.push(auditPost);
    auditPath = auditPost.json_path;
  }

  const finalPass = commandSummary('final_acceptance_final_pass', runNodeScript({
    script: 'validate-pt028-final-special-acceptance.mjs',
    args: [
      `--root=${root}`,
      ...feedbackArg,
      ...(auditPath ? [`--audit=${auditPath}`] : []),
      `--output-dir=${path.join(artifactsDir, 'final-acceptance-final-pass')}`
    ]
  }));
  steps.push(finalPass);

  const finalOut = finalPass.stdout_json ?? {};
  const commandFailures = steps
    .filter((step) => !step.ok)
    .map((step) => `${step.step_id}_command_failed`);
  const healthFailures = steps
    .filter((step) => step.step_id === 'event_stream_health')
    .flatMap((step) => (step.required_failures ?? [])
      .map((failure) => `${step.step_id}:${failure}`));
  const finalFailures = finalOut.required_failures ?? [];
  const requiredFailures = [
    ...commandFailures,
    ...healthFailures,
    ...finalFailures
  ];
  const accepted = finalOut.pt028_fully_accepted_for_production === true && requiredFailures.length === 0;
  const chain = {
    schema_version: 'pt028_acceptance_chain.v1',
    chain_id: chainId,
    created_at: new Date().toISOString(),
    root,
    feedback_path: path.relative(root, targetFeedbackPath).replace(/\\/g, '/'),
    feedback_exists: existsSync(targetFeedbackPath),
    collection_session_path: collectionSessionPath ? path.relative(root, collectionSessionPath).replace(/\\/g, '/') : null,
    decision_path: decisionPath ? path.relative(root, decisionPath).replace(/\\/g, '/') : null,
    audit_path: auditPath,
    gate_decision: accepted
      ? 'pt028_acceptance_chain_passed'
      : 'pt028_acceptance_chain_blocked',
    pt028_fully_accepted_for_production: accepted,
    real_execution_allowed: false,
    real_send_attempted: false,
    final_acceptance_gate_decision: finalOut.gate_decision ?? null,
    final_acceptance_path: finalPass.json_path,
    required_failures: requiredFailures,
    steps
  };

  const jsonPath = path.join(outputDir, 'pt028-acceptance-chain.json');
  const markdownPath = path.join(outputDir, 'pt028-acceptance-chain.md');
  const latestPath = path.join(root, 'runtime', 'pt028-acceptance-chains', 'latest.json');
  mkdirSync(path.dirname(latestPath), { recursive: true });
  const chainWithPaths = {
    ...chain,
    output_paths: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      latest_path: latestPath
    }
  };
  writeFileSync(jsonPath, `${JSON.stringify(chainWithPaths, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdown(chainWithPaths), 'utf8');
  writeFileSync(latestPath, `${JSON.stringify(chainWithPaths, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    command: 'run-pt028-acceptance-chain',
    chain_id: chain.chain_id,
    gate_decision: chain.gate_decision,
    pt028_fully_accepted_for_production: chain.pt028_fully_accepted_for_production,
    feedback_exists: chain.feedback_exists,
    required_failures: chain.required_failures,
    final_acceptance_path: chain.final_acceptance_path,
    json_path: jsonPath,
    markdown_path: markdownPath,
    latest_path: latestPath
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && chain.required_failures.length > 0) {
    process.exitCode = 2;
  }
}
