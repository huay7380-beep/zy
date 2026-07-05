#!/usr/bin/env node
import path from 'node:path';
import {
  auditIntakeImplementation,
  writeIntakeImplementationAudit
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/audit-intake-implementation.mjs [--root=<dir>] [--output-dir=<dir>] [--fail-on-required]',
    '',
    'This command checks the automated implementation evidence for docs/16 multi-source intake and controlled desktop sending.',
    'It does not perform a real send; real test-window completion remains an external pending item until explicitly confirmed.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const audit = auditIntakeImplementation({ root });
  const written = writeIntakeImplementationAudit({
    audit,
    outputDir: argValue('output-dir')
      ? path.resolve(root, argValue('output-dir'))
      : undefined
  });

  console.log(JSON.stringify({
    command: 'audit-intake-implementation',
    audit_id: audit.audit_id,
    gate_decision: audit.gate_decision,
    automated_requirements_ready: audit.automated_requirements_ready,
    real_send_verified: audit.real_send_verified,
    simulated_send_verified: audit.simulated_send_verified,
    required_failures: audit.required_failures,
    external_pending: audit.external_pending,
    json_path: written.json_path,
    markdown_path: written.markdown_path
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && audit.required_failures.length > 0) {
    process.exitCode = 2;
  }
}
