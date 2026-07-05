#!/usr/bin/env node
import path from 'node:path';
import {
  buildMvpStatusDashboard,
  writeMvpStatusDashboard
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/write-mvp-status-dashboard.mjs',
    '',
    'Options:',
    '  --root=<dir>                  Workspace root. Defaults to current directory.',
    '  --preflight=<file>            Optional mvp-self-agent-preflight.json.',
    '  --objective-audit=<file>      Optional mvp-objective-audit.json.',
    '  --read-only-targets=<file>    Optional read-only-expansion-targets.json.',
    '  --read-only-expansion-status=<file> Optional read-only-expansion-status.json.',
    '  --source-intake-matrix=<file> Optional source-intake-matrix.json.',
    '  --read-only-manifest-readiness=<file> Optional read-only-source-collection-manifest-readiness.json.',
    '  --read-only-collection=<file> Optional read-only-source-collection.json.',
    '  --read-only-workpack=<file>   Optional read-only-expansion-workpack.json.',
    '  --read-only-duplicate-confirmation=<file> Optional read-only-duplicate-observation-confirmation.json.',
    '  --real-input-trial=<file>     Optional mvp-real-input-trial.json.',
    '  --completion-audit=<file>     Defaults to runtime/audits/mvp-completion-audit.json.',
    '  --process-tree-validation=<file> Optional process-tree-validation.json.',
    '  --stress=<file>               Optional mvp-stress-test.json.',
    '  --current-status=<file>       Defaults to runtime/state/current-status.json.',
    '  --output-dir=<dir>            Defaults to runtime/status-dashboards/<dashboard_id>.'
  ].join('\n');
}

function optionalPath(root, name) {
  return argValue(name) ? path.resolve(root, argValue(name)) : null;
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const dashboard = buildMvpStatusDashboard({
    root,
    preflightPath: optionalPath(root, 'preflight') ?? undefined,
    objectiveAuditPath: optionalPath(root, 'objective-audit') ?? undefined,
    readOnlyTargetsPath: optionalPath(root, 'read-only-targets') ?? undefined,
    readOnlyExpansionStatusPath: optionalPath(root, 'read-only-expansion-status') ?? undefined,
    sourceIntakeMatrixPath: optionalPath(root, 'source-intake-matrix') ?? undefined,
    readOnlyManifestReadinessPath: optionalPath(root, 'read-only-manifest-readiness') ?? undefined,
    readOnlyCollectionPath: optionalPath(root, 'read-only-collection') ?? undefined,
    readOnlyWorkpackPath: optionalPath(root, 'read-only-workpack') ?? undefined,
    readOnlyDuplicateConfirmationPath: optionalPath(root, 'read-only-duplicate-confirmation') ?? undefined,
    realInputTrialPath: optionalPath(root, 'real-input-trial') ?? undefined,
    completionAuditPath: optionalPath(root, 'completion-audit') ?? undefined,
    processTreeValidationPath: optionalPath(root, 'process-tree-validation') ?? undefined,
    stressPath: optionalPath(root, 'stress') ?? undefined,
    currentStatusPath: optionalPath(root, 'current-status') ?? undefined
  });
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : undefined;
  const written = writeMvpStatusDashboard({
    dashboard,
    outputDir
  });

  console.log(JSON.stringify({
    command: 'write-mvp-status-dashboard',
    dashboard_id: dashboard.dashboard_id,
    overall_status: dashboard.overall_status,
    ready_for_user_special_testing: dashboard.ready_for_user_special_testing,
    ready_to_expand_sample_or_real_connector: dashboard.ready_to_expand_sample_or_real_connector,
    blockers: dashboard.blockers,
    json_path: written.json_path,
    markdown_path: written.markdown_path,
    html_path: written.html_path
  }, null, 2));
}
