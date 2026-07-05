import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  applyIdentityConfirmationDecision,
  createIdentityStore
} from '../packages/identity-resolution/src/index.mjs';

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const item = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function nowIso() {
  return new Date().toISOString();
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function renderMarkdown(report) {
  return [
    '# Identity Confirmation Decision Report',
    '',
    `- decision_id: ${report.decision_id}`,
    `- gate_decision: ${report.gate_decision}`,
    `- action: ${report.action}`,
    `- confirmation_id: ${report.confirmation_id}`,
    `- confirmed_person_id: ${report.confirmed_person_id ?? 'none'}`,
    `- created_link_id: ${report.created_link_id ?? 'none'}`,
    '',
    '## Evidence',
    '',
    ...report.evidence.map((item) => `- ${item}`),
    '',
    '## Paths',
    '',
    ...Object.entries(report.output_paths).map(([key, value]) => `- ${key}: ${value}`)
  ].join('\n') + '\n';
}

const dataDirArg = argValue('data-dir');
const runDirArg = argValue('run-dir');
const dataDir = dataDirArg
  ? path.resolve(dataDirArg)
  : (runDirArg ? path.resolve(runDirArg, 'data') : null);
const confirmationId = argValue('confirmation-id') ?? argValue('confirmation');
const candidateId = argValue('candidate-id') ?? argValue('candidate');
const personId = argValue('person-id') ?? argValue('person');
const actor = argValue('actor', 'operator');
const rejectAll = hasFlag('reject-all');

if (!dataDir || !confirmationId || (!rejectAll && !candidateId && !personId)) {
  console.error(JSON.stringify({
    command: 'apply-identity-confirmation-decision',
    gate_decision: 'identity_confirmation_decision_missing_arguments',
    usage: 'node scripts/apply-identity-confirmation-decision.mjs --data-dir=<data> --confirmation-id=<id> (--candidate-id=<id>|--person-id=<id>|--reject-all)'
  }, null, 2));
  process.exit(1);
}

if (!existsSync(dataDir)) {
  console.error(JSON.stringify({
    command: 'apply-identity-confirmation-decision',
    gate_decision: 'identity_confirmation_data_dir_missing',
    data_dir: dataDir
  }, null, 2));
  process.exit(1);
}

const store = createIdentityStore({ dataDir });
const applied = applyIdentityConfirmationDecision(store, {
  confirmation_id: confirmationId,
  candidate_id: candidateId,
  person_id: personId,
  action: rejectAll ? 'reject_all' : 'confirm_candidate',
  confirmed_by: actor,
  evidence_refs: argValue('evidence')
    ? argValue('evidence').split(',').map((item) => item.trim()).filter(Boolean)
    : []
}, { actor });

const outputDir = path.resolve(argValue(
  'output-dir',
  path.join('runtime', 'identity-confirmation-decisions', applied.decision.decision_id)
));
const report = {
  schema_version: 'identity_confirmation_decision_report.v1',
  report_id: `identity_confirmation_decision_report_${Date.now()}`,
  decision_id: applied.decision.decision_id,
  created_at: nowIso(),
  gate_decision: applied.gate_decision,
  action: applied.decision.action,
  confirmation_id: applied.decision.confirmation_id,
  selected_candidate_id: applied.decision.selected_candidate_id ?? null,
  confirmed_person_id: applied.decision.confirmed_person_id ?? null,
  created_link_id: applied.decision.created_link_id ?? null,
  raw_event_replay_required: Boolean(applied.decision.raw_event_replay_required),
  evidence: [
    `data_dir=${dataDir}`,
    `confirmation_id=${applied.decision.confirmation_id}`,
    `decision_status=${applied.decision.decision_status}`,
    `created_link_id=${applied.decision.created_link_id ?? 'none'}`
  ],
  decision: applied.decision,
  created_link: applied.created_link,
  output_paths: {
    report_json: path.join(outputDir, 'identity-confirmation-decision-report.json'),
    report_markdown: path.join(outputDir, 'identity-confirmation-decision-report.md'),
    identity_confirmation_queue: store.paths.identityConfirmationQueue,
    person_identity_links: store.paths.personIdentityLinks,
    identity_audit: store.paths.identityAudit
  }
};

writeJson(report.output_paths.report_json, report);
writeFileSync(report.output_paths.report_markdown, renderMarkdown(report), 'utf8');

console.log(JSON.stringify({
  command: 'apply-identity-confirmation-decision',
  gate_decision: report.gate_decision,
  decision_id: report.decision_id,
  confirmed_person_id: report.confirmed_person_id,
  created_link_id: report.created_link_id,
  raw_event_replay_required: report.raw_event_replay_required,
  json_path: report.output_paths.report_json,
  markdown_path: report.output_paths.report_markdown
}, null, 2));
