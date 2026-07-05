#!/usr/bin/env node
import path from 'node:path';
import {
  auditMvpObjectiveEvidence,
  writeMvpObjectiveAudit
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/audit-mvp-objective.mjs',
    '',
    'Options:',
    '  --root=<dir>              Workspace root. Defaults to current directory.',
    '  --preflight=<file>        Optional mvp-self-agent-preflight.json. Defaults to latest runtime/self-agent-preflights/**.',
    '  --completion-audit=<file> Optional mvp-completion-audit.json. Defaults to runtime/audits/mvp-completion-audit.json.',
    '  --output=<dir>            Defaults to runtime/objective-audits/<audit_id>.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const preflightPath = argValue('preflight') ? path.resolve(argValue('preflight')) : null;
  const completionAuditPath = argValue('completion-audit')
    ? path.resolve(argValue('completion-audit'))
    : path.join(root, 'runtime/audits/mvp-completion-audit.json');
  const audit = auditMvpObjectiveEvidence({
    root,
    preflightPath,
    completionAuditPath
  });
  const outputDir = argValue('output')
    ? path.resolve(argValue('output'))
    : path.join(root, 'runtime/objective-audits', audit.audit_id);
  const written = writeMvpObjectiveAudit({ audit, outputDir });

  console.log(JSON.stringify({
    command: 'audit-mvp-objective',
    audit_id: audit.audit_id,
    objective_status: audit.objective_status,
    ready_for_user_special_testing: audit.ready_for_user_special_testing,
    ready_to_expand_sample_or_real_connector: audit.ready_to_expand_sample_or_real_connector,
    required_failures: audit.required_failures,
    expansion_failures: audit.expansion_failures,
    external_input_gate: audit.external_input_status.gate_decision,
    json_path: written.json_path,
    markdown_path: written.markdown_path
  }, null, 2));
}
