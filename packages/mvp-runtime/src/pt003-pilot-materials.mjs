import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function projectRoot() {
  return path.resolve(here, '../../..');
}

function nowIso() {
  return new Date().toISOString();
}

function createMaterialId(date = new Date()) {
  return `pt003_pilot_materials_${date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function readJson(filePath, fallback = null) {
  if (!filePath || !existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function latestNestedFile(dir, fileName) {
  const resolvedDir = path.resolve(dir);
  if (!existsSync(resolvedDir)) return null;
  const candidates = readdirSync(resolvedDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(resolvedDir, entry.name, fileName))
    .filter((filePath) => existsSync(filePath))
    .map((filePath) => ({
      filePath,
      mtimeMs: existsSync(filePath) ? new Date(readJson(filePath, {})?.created_at ?? 0).getTime() || 0 : 0,
      statTimeMs: statSync(filePath).mtimeMs
    }));
  const enriched = candidates.map((item) => ({
    ...item,
    statTimeMs: item.statTimeMs || 0
  }));
  return enriched
    .sort((a, b) => {
      const aTime = a.mtimeMs || a.statTimeMs;
      const bTime = b.mtimeMs || b.statTimeMs;
      return bTime - aTime;
    })[0]?.filePath ?? null;
}

function latestNestedFileByName(dir, fileName) {
  const resolvedDir = path.resolve(dir);
  if (!existsSync(resolvedDir)) return null;
  return readdirSync(resolvedDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(resolvedDir, entry.name, fileName))
    .filter((filePath) => existsSync(filePath))
    .sort((a, b) => String(b).localeCompare(String(a)))[0] ?? null;
}

function relativeOrNull(root, filePath) {
  if (!filePath) return null;
  return path.relative(root, path.resolve(filePath)).replaceAll(path.sep, '/');
}

function pt003Item(readiness) {
  return readiness?.item_results?.find((item) => item.issue_id === 'PT-003')
    ?? readiness?.external_inputs?.items?.find((item) => item.issue_id === 'PT-003')
    ?? null;
}

function summarizeObservation(root, observationPath, ingestionPath) {
  const observation = readJson(observationPath, null);
  const ingestion = readJson(ingestionPath, null);
  if (!observation && !ingestion) return null;
  return {
    observation_path: relativeOrNull(root, observationPath),
    ingestion_path: relativeOrNull(root, ingestionPath),
    observation_id: observation?.observation_id ?? null,
    captured_at: observation?.captured_at ?? null,
    platform: observation?.platform ?? null,
    privacy_level: observation?.privacy_level ?? null,
    confidence: observation?.confidence ?? null,
    content_summary: observation?.content_summary ?? null,
    content_text_available: typeof observation?.content_text === 'string' && observation.content_text.length > 0,
    participant_hint_count: observation?.participants_hint?.length ?? 0,
    identity_hint_count: observation?.source_identity_hints?.length ?? 0,
    raw_artifact_refs: observation?.raw_artifact_refs ?? [],
    identity_gate_decision: ingestion?.identity?.gate_decision ?? null,
    identity_candidate_count: ingestion?.identity?.candidate_count ?? null,
    confirmed_person_ids: ingestion?.identity?.confirmed_person_ids ?? []
  };
}

function recordWorksheet() {
  return Array.from({ length: 10 }, (_, index) => ({
    slot: index + 1,
    required: true,
    record_id: `replace_with_real_record_${String(index + 1).padStart(2, '0')}`,
    source: 'wechat_or_web_or_manual_note',
    occurred_at: 'replace_with_iso_datetime',
    speaker_person_id: index % 2 === 0 ? 'replace_with_user_person_id' : 'replace_with_target_person_id',
    content_required: '真实聊天、网页线索或手工记录原文/摘要，不能使用样例或模板文本。',
    semantic_hint_expected: index < 7
  }));
}

function buildDraftPilotImport({ createdAt, observationSummary }) {
  const seedEvidence = observationSummary?.observation_path
    ? [observationSummary.observation_path]
    : [];
  return {
    schema_version: 'pilot_import_batch.v1',
    import_id: 'replace_with_real_pt003_import_id',
    goal: {
      initial_goal: 'replace_with_real_user_goal_for_one_target',
      scene: 'b2b_follow_up',
      primary_person_id: 'replace_with_target_person_id',
      target_person_ids: ['replace_with_target_person_id']
    },
    people: [
      {
        person_id: 'replace_with_user_person_id',
        display_name: 'replace_with_user_display_name',
        role: 'user'
      },
      {
        person_id: 'replace_with_target_person_id',
        display_name: 'replace_with_target_display_name',
        role: 'target_contact'
      }
    ],
    relationships: [
      {
        relationship_id: 'replace_with_relationship_id',
        from_person_id: 'replace_with_user_person_id',
        to_person_id: 'replace_with_target_person_id',
        relationship_type: 'business_contact',
        source: 'real_pt003_material'
      }
    ],
    records: recordWorksheet().map((slot) => ({
      record_id: slot.record_id,
      event_kind: 'raw_interaction',
      source: slot.source,
      source_ref: {
        material_slot: slot.slot,
        latest_read_only_evidence: slot.slot === 1 ? seedEvidence : []
      },
      occurred_at: slot.occurred_at,
      speaker_person_id: slot.speaker_person_id,
      participant_person_ids: [
        'replace_with_user_person_id',
        'replace_with_target_person_id'
      ],
      target_person_ids: ['replace_with_target_person_id'],
      content: slot.content_required,
      content_summary: 'replace_with_short_summary',
      linked_person_ids: [
        'replace_with_user_person_id',
        'replace_with_target_person_id'
      ],
      linked_relationship_ids: ['replace_with_relationship_id'],
      evidence_refs: slot.slot === 1 ? seedEvidence : [],
      metadata: {
        draft_template: true,
        created_for: 'PT-003',
        created_at: createdAt
      }
    })),
    semantic_hints: [
      {
        hint_id: 'replace_with_semantic_hint_001',
        raw_record_ids: ['replace_with_real_record_01'],
        event_type_code: 'replace_with_event_type_code',
        event_level: 'P2',
        status: 'candidate',
        tags: ['replace_with_real_tag'],
        weight: 0.7,
        confidence: 0.7,
        evidence: ['replace_with_real_evidence_text'],
        linked_person_ids: ['replace_with_target_person_id'],
        linked_relationship_ids: ['replace_with_relationship_id'],
        occurred_at: 'replace_with_iso_datetime',
        requires_confirmation: true
      }
    ],
    feedback_records: [
      {
        feedback_id: 'replace_with_real_feedback_001',
        source: 'human_review_after_action',
        related_record_ids: ['replace_with_real_record_01'],
        outcome: 'replace_with_observed_result',
        lesson: 'replace_with_what_to_optimize_next'
      }
    ]
  };
}

function buildBlockers({ targetExists, observationSummary, pt003, draft }) {
  const blockers = [];
  if (!targetExists) {
    blockers.push('pt003_target_file_missing');
    blockers.push('pt003_real_record_count_unverified');
  }
  if ((draft.records?.length ?? 0) < 10) blockers.push('pt003_record_count_below_minimum');
  if (!observationSummary?.content_text_available) blockers.push('pt003_real_chat_text_not_extracted');
  if ((observationSummary?.identity_hint_count ?? 0) === 0 && (observationSummary?.confirmed_person_ids?.length ?? 0) === 0) {
    blockers.push('pt003_identity_evidence_missing');
  }
  if (pt003?.status && pt003.status !== 'ready') {
    blockers.push(`pt003_readiness_${pt003.status}`);
  } else if (!pt003) {
    blockers.push('pt003_readiness_missing');
  }
  blockers.push('pt003_feedback_record_must_be_real_after_action');
  return [...new Set(blockers)];
}

function renderMarkdown(materials) {
  const blockers = materials.blockers.map((item) => `- ${item}`).join('\n') || '- none';
  const evidenceRows = [
    ['target_file', materials.target_file.exists ? 'present' : 'missing', materials.target_file.path],
    ['latest_observation', materials.available_evidence.latest_desktop_observation ? 'present' : 'missing', materials.available_evidence.latest_desktop_observation?.observation_path ?? 'none'],
    ['input_readiness', materials.current_readiness.gate_decision ?? 'unknown', materials.current_readiness.path ?? 'none']
  ].map((row) => `| ${row[0]} | ${row[1]} | ${row[2]} |`).join('\n');
  const actions = materials.next_actions.map((item) => `- ${item}`).join('\n');
  return `# PT-003 Pilot Materials

- material_id: ${materials.material_id}
- gate_decision: ${materials.gate_decision}
- target_file: ${materials.target_file.path}
- target_file_exists: ${materials.target_file.exists}
- draft_path: ${materials.draft_path}
- real_send_attempted: false

## Current Evidence

| item | status | path |
| --- | --- | --- |
${evidenceRows}

## Blockers

${blockers}

## Next Actions

${actions}

## Acceptance Gates

${materials.acceptance_gates.map((item) => `- ${item}`).join('\n')}
`;
}

export function buildPt003PilotMaterials({
  root = projectRoot(),
  createdAt = nowIso(),
  inputReadinessPath = null,
  observationPath = null,
  ingestionPath = null
} = {}) {
  const resolvedRoot = path.resolve(root);
  const targetPath = path.join(resolvedRoot, 'runtime/user-inputs/pilot-import.real.json');
  const latestReadinessPath = inputReadinessPath
    ?? latestNestedFile(path.join(resolvedRoot, 'runtime/input-readiness'), 'mvp-external-input-readiness.json');
  const readiness = readJson(latestReadinessPath, null);
  const latestObservationPath = observationPath
    ?? latestNestedFileByName(path.join(resolvedRoot, 'runtime/desktop-inbox-real'), 'intake-observation.real.json');
  const latestIngestionPath = ingestionPath
    ?? latestNestedFileByName(path.join(resolvedRoot, 'runtime/desktop-inbox-real'), 'desktop-real-intake-ingestion.json');
  const observationSummary = summarizeObservation(resolvedRoot, latestObservationPath, latestIngestionPath);
  const draft = buildDraftPilotImport({ createdAt, observationSummary });
  const pt003 = pt003Item(readiness);
  const targetExists = existsSync(targetPath);
  const blockers = buildBlockers({
    targetExists,
    observationSummary,
    pt003,
    draft
  });
  const materialId = createMaterialId(new Date(createdAt));

  return {
    schema_version: 'pt003_pilot_materials.v1',
    material_id: materialId,
    created_at: createdAt,
    gate_decision: blockers.length ? 'pt003_materials_need_real_input' : 'pt003_materials_ready_for_validation',
    target_file: {
      path: 'runtime/user-inputs/pilot-import.real.json',
      exists: targetExists,
      write_policy: 'not_written_by_this_command'
    },
    current_readiness: {
      path: relativeOrNull(resolvedRoot, latestReadinessPath),
      gate_decision: readiness?.gate_decision ?? null,
      pt003_status: pt003?.status ?? null,
      required_failures: readiness?.required_failures ?? []
    },
    available_evidence: {
      latest_desktop_observation: observationSummary,
      usable_for_pt003: {
        can_seed_evidence_refs: Boolean(observationSummary?.observation_path),
        can_satisfy_record_text: Boolean(observationSummary?.content_text_available),
        can_confirm_identity: (observationSummary?.confirmed_person_ids?.length ?? 0) > 0
      }
    },
    minimum_dataset_requirements: {
      record_count_min: 10,
      record_count_max: 30,
      one_target_contact: true,
      people_and_relationship_edges_required: true,
      feedback_records_min_for_closed_loop_mvp: 1,
      semantic_coverage_min: 0.7,
      copied_sample_or_template_rejected: true
    },
    blockers,
    worksheet: recordWorksheet(),
    draft_pilot_import: draft,
    draft_path: null,
    validation_commands: [
      'node scripts/validate-pilot-intake.mjs --input=runtime/user-inputs/pilot-import.real.json',
      'npm.cmd run mvp:inputs:check',
      'npm.cmd run mvp:real-trial',
      'npm.cmd run mvp:objective:audit',
      'npm.cmd run mvp:status'
    ],
    acceptance_gates: [
      'runtime/user-inputs/pilot-import.real.json exists and is not copied unchanged from examples or .template files.',
      'pilot_intake_readiness.v1.required_failures is empty.',
      'ready_for_closed_loop_mvp=true.',
      'semantic_coverage >= 0.7.',
      'At least one real feedback record exists before full closed-loop MVP.',
      'No true desktop send is attempted while PT-003 is being prepared.'
    ],
    next_actions: [
      'Collect 10 to 30 real records for one target contact; current read-only WeChat capture is only artifact evidence unless OCR/text is extracted.',
      'Confirm or provide stable person identity and relationship edge for the target contact.',
      'Add at least one real post-action feedback record before running full closed-loop MVP.',
      'Create runtime/user-inputs/pilot-import.real.json from the draft in this material package, then replace every placeholder with real material.',
      'Run validation_commands in order and stop at the first required failure.'
    ],
    real_send_attempted: false
  };
}

export function writePt003PilotMaterials({
  materials,
  root = projectRoot(),
  outputDir = path.join(root, 'runtime/pt003-pilot-materials', materials?.material_id ?? createMaterialId())
} = {}) {
  if (!materials) throw new Error('writePt003PilotMaterials requires materials');
  mkdirSync(outputDir, { recursive: true });
  const resolvedRoot = path.resolve(root);
  const relativeOutputDir = path.relative(resolvedRoot, outputDir).replaceAll(path.sep, '/');
  const finalMaterials = {
    ...materials,
    draft_path: `${relativeOutputDir}/pilot-import.real.draft.json`
  };
  const jsonPath = path.join(outputDir, 'pt003-pilot-materials.json');
  const markdownPath = path.join(outputDir, 'pt003-pilot-materials.md');
  const draftPath = path.join(outputDir, 'pilot-import.real.draft.json');
  writeFileSync(draftPath, `${JSON.stringify(finalMaterials.draft_pilot_import, null, 2)}\n`, 'utf8');
  writeFileSync(jsonPath, `${JSON.stringify(finalMaterials, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdown(finalMaterials), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath,
    draft_path: draftPath
  };
}
