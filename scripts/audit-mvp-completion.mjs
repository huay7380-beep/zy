#!/usr/bin/env node
import path from 'node:path';
import {
  auditMvpCompletionEvidence,
  writeMvpCompletionAudit
} from '../packages/mvp-runtime/src/index.mjs';

function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, ...valueParts] = item.slice(2).split('=');
    args[key] = valueParts.length ? valueParts.join('=') : true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const root = args.root ? path.resolve(String(args.root)) : process.cwd();
const reportPath = args.report ? path.resolve(String(args.report)) : null;
const outputDir = args.output
  ? path.resolve(String(args.output))
  : path.join(root, 'runtime/audits');

const audit = auditMvpCompletionEvidence({ root, reportPath });
const written = writeMvpCompletionAudit({ audit, outputDir });

console.log(JSON.stringify({
  command: 'audit-mvp-completion',
  audit_id: audit.audit_id,
  overall_status: audit.overall_status,
  ready_for_user_special_testing: audit.ready_for_user_special_testing,
  ready_to_expand_sample_or_real_connector: audit.ready_to_expand_sample_or_real_connector,
  required_failures: audit.required_failures,
  warning_failures: audit.warning_failures,
  open_expansion_items: audit.open_expansion_items.map((issue) => issue.issue_id),
  json_path: written.json_path,
  markdown_path: written.markdown_path
}, null, 2));
