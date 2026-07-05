import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  mapObservationToRawEvent,
  normalizeIntakeObservation
} from '../packages/intake-runtime/src/index.mjs';
import {
  initializeStorage,
  appendRawEvent,
  loadStorageSnapshot,
  rebuildEventIndexes
} from '../packages/storage-runtime/src/index.mjs';
import {
  initializeIdentityStore,
  loadIdentitySnapshot,
  resolveObservationIdentities
} from '../packages/identity-resolution/src/index.mjs';

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const item = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function latestRealObservationPath(root = process.cwd()) {
  const base = path.resolve(root, 'runtime/desktop-inbox-real');
  if (!existsSync(base)) return null;
  const runDirs = readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(base, entry.name))
    .filter((dir) => existsSync(path.join(dir, 'intake-observation.real.json')))
    .sort();
  const latest = runDirs.at(-1);
  return latest ? path.join(latest, 'intake-observation.real.json') : null;
}

function check({ check_id, label, passed, severity = 'required', evidence = [], fix = null }) {
  return {
    check_id,
    label,
    severity,
    status: passed ? 'pass' : 'fail',
    passed: Boolean(passed),
    evidence: evidence.filter((item) => item !== undefined && item !== null && item !== ''),
    fix
  };
}

function renderMarkdown(report) {
  const lines = [
    '# Desktop Real Intake Ingestion Report',
    '',
    `- ingestion_id: ${report.ingestion_id}`,
    `- gate_decision: ${report.gate_decision}`,
    `- required_failures: ${report.required_failures.join(', ') || 'none'}`,
    '',
    '## Metrics',
    '',
    ...Object.entries(report.metrics).map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(', ') : value}`),
    '',
    '## Checks',
    '',
    ...report.checks.flatMap((item) => [
      `- ${item.status.toUpperCase()} ${item.check_id}: ${item.label}`,
      item.evidence.length ? `  evidence: ${item.evidence.join('; ')}` : null,
      item.fix ? `  fix: ${item.fix}` : null
    ].filter(Boolean)),
    '',
    '## Identity',
    '',
    `- identity_gate_decision: ${report.identity.gate_decision}`,
    `- confirmed_person_ids: ${report.identity.confirmed_person_ids.join(', ') || 'none'}`,
    `- confirmation_required: ${report.identity.confirmation_required}`,
    `- confirmation_ids: ${report.identity.confirmation_ids.join(', ') || 'none'}`,
    '',
    '## Paths',
    '',
    ...Object.entries(report.output_paths).map(([key, value]) => `- ${key}: ${value}`)
  ];
  return `${lines.join('\n')}\n`;
}

const root = path.resolve(argValue('root', process.cwd()));
const observationArg = argValue('observation', latestRealObservationPath(root));
const observationPath = observationArg ? path.resolve(observationArg) : null;
if (!observationPath || !existsSync(observationPath)) {
  console.error(JSON.stringify({
    command: 'ingest-desktop-real-intake',
    gate_decision: 'desktop_real_intake_missing_observation',
    expected: 'runtime/desktop-inbox-real/<run_id>/intake-observation.real.json'
  }, null, 2));
  process.exit(1);
}

const outputDir = path.resolve(argValue('output-dir', path.dirname(observationPath)));
const dataDir = path.resolve(argValue('data-dir', path.join(outputDir, 'data')));
const runId = path.basename(outputDir);
const actor = argValue('actor', runId);
mkdirSync(outputDir, { recursive: true });

const observation = readJson(observationPath);
const normalized = normalizeIntakeObservation(observation);
const storage = initializeStorage({ root: outputDir, dataDir });
const identityStore = initializeIdentityStore({ storage });
const resolution = resolveObservationIdentities({
  storage,
  identityStore,
  observation: normalized,
  actor
});
const rawPreview = mapObservationToRawEvent(normalized, { identityResolution: resolution });
const beforeSnapshot = loadStorageSnapshot(storage);
const existingRawEvent = beforeSnapshot.raw_events.find((event) => event.event_id === rawPreview.event_id);
const rawEvent = existingRawEvent ?? appendRawEvent(storage, rawPreview, { actor });
rebuildEventIndexes(storage, { actor });

const storageSnapshot = loadStorageSnapshot(storage);
const identitySnapshot = loadIdentitySnapshot(identityStore);
const rawEventWriteStatus = existingRawEvent ? 'already_present' : 'appended';
const checks = [
  check({
    check_id: 'observation_file_present',
    label: 'Real desktop observation file exists',
    passed: existsSync(observationPath),
    evidence: [observationPath]
  }),
  check({
    check_id: 'desktop_source_confirmed',
    label: 'Observation comes from a desktop source adapter',
    passed: normalized.source_type === 'desktop' && normalized.source_adapter_id.includes('sightflow_desktop'),
    evidence: [`source_type=${normalized.source_type}`, `source_adapter_id=${normalized.source_adapter_id}`],
    fix: 'Capture through the Sightflow desktop bridge or pass a desktop observation file.'
  }),
  check({
    check_id: 'read_only_and_send_blocked',
    label: 'Real desktop intake is read-only and does not attempt sending',
    passed: normalized.metadata?.read_only_capture === true
      && normalized.metadata?.real_execution_allowed === false
      && normalized.metadata?.real_send_attempted === false,
    evidence: [
      `read_only_capture=${normalized.metadata?.read_only_capture}`,
      `real_execution_allowed=${normalized.metadata?.real_execution_allowed}`,
      `real_send_attempted=${normalized.metadata?.real_send_attempted}`
    ],
    fix: 'Real intake must keep read_only_capture=true, real_execution_allowed=false and real_send_attempted=false.'
  }),
  check({
    check_id: 'raw_event_stored',
    label: 'Observation is represented as a RawEvent in isolated storage',
    passed: storageSnapshot.raw_events.some((event) => event.event_id === rawPreview.event_id),
    evidence: [`raw_event_id=${rawPreview.event_id}`, `write_status=${rawEventWriteStatus}`]
  }),
  check({
    check_id: 'identity_gate_recorded',
    label: 'Identity resolution gate decision is recorded on the RawEvent metadata',
    passed: Boolean(rawEvent.metadata?.identity_resolution?.gate_decision),
    evidence: [`identity_gate_decision=${rawEvent.metadata?.identity_resolution?.gate_decision ?? 'missing'}`],
    fix: 'Run resolveObservationIdentities before RawEvent write.'
  }),
  check({
    check_id: 'channel_identity_recorded',
    label: 'At least one channel identity candidate is stored',
    passed: identitySnapshot.channel_identities.channel_identities.length > 0,
    evidence: [`channel_identity_count=${identitySnapshot.channel_identities.channel_identities.length}`],
    fix: 'Observation must include source_identity_hints, participant hints or a usable thread hint.'
  }),
  check({
    check_id: 'unresolved_identity_stays_unsent',
    label: 'Unresolved identity does not enable real execution',
    severity: 'required',
    passed: resolution.gate_decision === 'identity_resolved'
      || normalized.metadata?.real_execution_allowed === false,
    evidence: [`identity_gate_decision=${resolution.gate_decision}`, `real_execution_allowed=${normalized.metadata?.real_execution_allowed}`],
    fix: 'Keep real execution blocked until identity is confirmed.'
  })
];
const requiredFailures = checks.filter((item) => item.severity === 'required' && !item.passed);
const report = {
  schema_version: 'desktop_real_intake_ingestion.v1',
  ingestion_id: `desktop_real_intake_ingestion_${Date.now()}`,
  run_id: runId,
  created_at: nowIso(),
  gate_decision: requiredFailures.length ? 'desktop_real_intake_needs_attention' : 'desktop_real_intake_ingested',
  observation_path: observationPath,
  data_dir: dataDir,
  raw_event_write_status: rawEventWriteStatus,
  metrics: {
    raw_event_count: storageSnapshot.raw_events.length,
    channel_identity_count: identitySnapshot.channel_identities.channel_identities.length,
    person_identity_link_count: identitySnapshot.person_identity_links.person_identity_links.length,
    identity_confirmation_queue_count: identitySnapshot.identity_confirmation_queue.length,
    storage_audit_count: storageSnapshot.audit_records.length,
    identity_audit_count: identitySnapshot.identity_audit_records.length
  },
  identity: {
    gate_decision: resolution.gate_decision,
    confirmed_person_ids: resolution.confirmed_person_ids,
    confirmation_required: resolution.confirmation_required,
    confirmation_ids: resolution.confirmation_ids,
    candidate_count: resolution.candidates.length,
    channel_identity_ids: resolution.channel_identity_ids
  },
  raw_event: {
    event_id: rawEvent.event_id,
    event_kind: rawEvent.event_kind,
    source: rawEvent.source,
    linked_person_ids: rawEvent.linked_person_ids ?? [],
    identity_resolution: rawEvent.metadata?.identity_resolution ?? null
  },
  checks,
  required_failures: requiredFailures.map((item) => item.check_id),
  output_paths: {
    observation: observationPath,
    report_json: path.join(outputDir, 'desktop-real-intake-ingestion.json'),
    report_markdown: path.join(outputDir, 'desktop-real-intake-ingestion.md'),
    data_dir: dataDir,
    raw_events: storage.paths.rawEvents,
    storage_audit: storage.paths.audit,
    channel_identities: identityStore.paths.channelIdentities,
    identity_audit: identityStore.paths.identityAudit,
    identity_confirmation_queue: identityStore.paths.identityConfirmationQueue
  },
  real_execution_allowed: false,
  real_send_attempted: false
};

writeJson(report.output_paths.report_json, report);
writeFileSync(report.output_paths.report_markdown, renderMarkdown(report), 'utf8');

console.log(JSON.stringify({
  command: 'ingest-desktop-real-intake',
  ingestion_id: report.ingestion_id,
  gate_decision: report.gate_decision,
  observation_id: normalized.observation_id,
  raw_event_id: rawEvent.event_id,
  raw_event_write_status: rawEventWriteStatus,
  identity_gate_decision: resolution.gate_decision,
  confirmation_required: resolution.confirmation_required,
  required_failures: report.required_failures,
  json_path: report.output_paths.report_json,
  markdown_path: report.output_paths.report_markdown
}, null, 2));

if (report.required_failures.length) process.exitCode = 1;
