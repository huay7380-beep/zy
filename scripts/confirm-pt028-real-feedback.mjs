#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildPt028RealFeedbackConfirmationResult,
  buildPt028RealFeedbackConfirmationTemplate,
  buildPt028RealFeedbackWorkpack,
  writePt028RealFeedbackConfirmationArtifacts,
  writePt028RealFeedbackTargetFromConfirmation
} from '../packages/decision-cluster/src/index.mjs';

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/confirm-pt028-real-feedback.mjs [--root=<dir>] [--output-dir=<dir>]',
    '  node scripts/confirm-pt028-real-feedback.mjs --decision=<decision.json> [--root=<dir>] [--target=<path>] [--allow-overwrite]',
    '',
    'Without --decision, this command writes a confirmation decision template only.',
    'With --decision, it writes the real feedback target only when the decision and readiness gates pass.',
    'It never sends messages.'
  ].join('\n');
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function resolveInputPath(root, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.resolve(root, maybePath);
}

function defaultOutputDir(root, confirmationId) {
  return path.join(root, 'runtime', 'pt028-real-feedback-confirmations', confirmationId);
}

function relativeToRoot(root, maybePath) {
  if (!maybePath) return null;
  const absolutePath = path.isAbsolute(maybePath) ? maybePath : path.resolve(root, maybePath);
  return path.relative(root, absolutePath).replace(/\\/g, '/');
}

function defaultCoveragePath(root) {
  const coveragePath = path.join(root, 'runtime', 'pt028-feedback-collection-coverages', 'latest.json');
  return existsSync(coveragePath) ? coveragePath : null;
}

function sameResolvedPath(root, left, right) {
  if (!left || !right) return false;
  return path.resolve(root, left) === path.resolve(root, right);
}

function readJsonIfExists(file) {
  if (!file || !existsSync(file)) return null;
  return readJson(file);
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

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve(argValue('root', process.cwd()));
  const decisionPath = resolveInputPath(root, argValue('decision'));
  const targetFeedbackPath = resolveInputPath(root, argValue('target'));
  const coveragePath = resolveInputPath(root, argValue('coverage')) ?? defaultCoveragePath(root);
  const allowOverwriteExistingTarget = process.argv.includes('--allow-overwrite');

  let decision = null;
  let decisionTemplate = null;
  if (decisionPath) {
    decision = readJson(decisionPath);
  } else {
    const workpack = buildPt028RealFeedbackWorkpack({ root });
    decisionTemplate = buildPt028RealFeedbackConfirmationTemplate({ workpack });
    decision = decisionTemplate;
  }

  let result = buildPt028RealFeedbackConfirmationResult({
    decision,
    root,
    targetFeedbackPath,
    allowOverwriteExistingTarget,
    pathExists: (candidate) => existsSync(candidate),
    readJson: (candidate) => readJson(candidate)
  });
  if (decisionPath) {
    result = applyCollectionCoverageGate({
      result,
      root,
      decisionPath,
      coveragePath
    });
  }
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : defaultOutputDir(root, result.confirmation_id);

  let targetWrite = null;
  if (decisionPath && result.writes_real_feedback_target_allowed) {
    targetWrite = writePt028RealFeedbackTargetFromConfirmation({
      decision,
      result,
      root,
      targetFeedbackPath
    });
    result = {
      ...result,
      writes_real_feedback_target: true,
      target_written: true,
      target_written_path: targetWrite.target_feedback_relative_path
    };
  }

  const written = writePt028RealFeedbackConfirmationArtifacts({
    result,
    decisionTemplate: decisionPath ? null : decisionTemplate,
    outputDir
  });

  if (targetWrite) {
    const targetMarkerPath = path.join(outputDir, 'target-write-result.json');
    mkdirSync(path.dirname(targetMarkerPath), { recursive: true });
    writeFileSync(targetMarkerPath, `${JSON.stringify({
      schema_version: 'pt028_real_feedback_target_write_result.v1',
      target_feedback_path: targetWrite.target_feedback_relative_path,
      real_execution_allowed: false,
      real_send_attempted: false,
      writes_real_feedback_target: true
    }, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify({
    command: 'confirm-pt028-real-feedback',
    confirmation_id: result.confirmation_id,
    gate_decision: result.gate_decision,
    decision_path: decisionPath,
    decision_template_path: written.decision_template_path,
    target_feedback_path: result.target_feedback_path,
    writes_real_feedback_target_allowed: result.writes_real_feedback_target_allowed,
    writes_real_feedback_target: result.writes_real_feedback_target,
    real_execution_allowed: result.real_execution_allowed,
    real_send_attempted: result.real_send_attempted,
    required_failures: result.required_failures,
    json_path: written.json_path,
    markdown_path: written.markdown_path,
    latest_path: written.latest_path
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && result.required_failures.length > 0) {
    process.exitCode = 2;
  }
}
