import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  analyzePilotIntakeReadiness,
  normalizePilotImportBatch
} from '../../storage-runtime/src/index.mjs';

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function slug(value) {
  return String(value ?? 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function relativeOrOriginal(root, filePath) {
  if (!filePath) return null;
  const relative = path.relative(root, filePath);
  return relative.startsWith('..') ? filePath : relative.replaceAll(path.sep, '/');
}

function requireNumber(value, field, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${field} must be a number between ${min} and ${max}`);
  }
  return number;
}

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`);
  return value;
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function summarizeReadiness(readiness) {
  return {
    gate_decision: readiness.gate_decision,
    ready_for_decision_trial: readiness.ready_for_decision_trial,
    ready_for_closed_loop_mvp: readiness.ready_for_closed_loop_mvp,
    required_failures: readiness.required_failures,
    recommended_failures: readiness.recommended_failures,
    metrics: readiness.metrics
  };
}

export function buildPilotFeedbackTemplate({
  batch,
  pilotImportPath = null,
  createdAt = nowIso()
} = {}) {
  const normalized = normalizePilotImportBatch(batch);
  const firstRecord = normalized.raw_events[0] ?? null;
  return {
    feedback_id: `feedback_${slug(normalized.import_id)}_manual_001`,
    executed: false,
    reply_received: false,
    goal_progress: 0,
    relationship_change: 0,
    user_rating: 3,
    new_event_candidate_ids: [],
    notes: 'Replace this template with real post-action feedback before appending. Do not use unchanged templates as real feedback.',
    linked_person_ids: firstRecord?.linked_person_ids ?? [],
    linked_relationship_ids: firstRecord?.linked_relationship_ids ?? [],
    created_at: createdAt,
    metadata: {
      template_only: true,
      generated_by: 'pilot_feedback_append.v1',
      pilot_import_path: pilotImportPath,
      real_execution_allowed: false,
      real_send_attempted: false
    }
  };
}

export function normalizePilotFeedbackAppendRecord(feedback, { importId, createdAt = nowIso() } = {}) {
  if (!feedback || typeof feedback !== 'object' || Array.isArray(feedback)) {
    throw new Error('feedback must be an object');
  }
  if (feedback.metadata?.template_only === true || feedback.template_only === true) {
    throw new Error('feedback_template_cannot_be_appended_as_real_feedback');
  }
  const feedbackId = requireString(feedback.feedback_id, 'feedback_id');
  if (/replace_with|template/i.test(feedbackId)) {
    throw new Error('feedback_id still looks like a template placeholder');
  }
  const normalized = {
    ...feedback,
    feedback_id: feedbackId,
    executed: requireBoolean(feedback.executed, 'executed'),
    reply_received: requireBoolean(feedback.reply_received, 'reply_received'),
    goal_progress: requireNumber(feedback.goal_progress, 'goal_progress', 0, 1),
    relationship_change: feedback.relationship_change === undefined
      ? 0
      : requireNumber(feedback.relationship_change, 'relationship_change', -1, 1),
    user_rating: requireNumber(feedback.user_rating, 'user_rating', 1, 5),
    new_event_candidate_ids: Array.isArray(feedback.new_event_candidate_ids)
      ? feedback.new_event_candidate_ids
      : [],
    created_at: feedback.created_at ?? createdAt,
    metadata: {
      ...(feedback.metadata ?? {}),
      appended_by: 'pilot_feedback_append.v1',
      import_id: importId,
      real_execution_allowed: false,
      real_send_attempted: false
    }
  };
  if (normalized.decision_id !== undefined) {
    normalized.decision_id = requireString(normalized.decision_id, 'decision_id');
  }
  if (normalized.trigger_id !== undefined) {
    normalized.trigger_id = requireString(normalized.trigger_id, 'trigger_id');
  }
  return normalized;
}

export function buildPilotFeedbackAppend({
  pilotImportPath,
  feedbackPath = null,
  root = process.cwd(),
  createdAt = nowIso()
} = {}) {
  if (!pilotImportPath) {
    throw new Error('pilotImportPath is required');
  }
  const absolutePilotImportPath = path.resolve(root, pilotImportPath);
  const batch = readJson(absolutePilotImportPath);
  const beforeReadiness = analyzePilotIntakeReadiness(normalizePilotImportBatch(batch), {
    inputPath: relativeOrOriginal(root, absolutePilotImportPath)
  });
  const reportId = `pilot_feedback_append_${slug(batch.import_id)}_${Date.now()}`;
  const template = buildPilotFeedbackTemplate({
    batch,
    pilotImportPath: relativeOrOriginal(root, absolutePilotImportPath),
    createdAt
  });

  if (!feedbackPath) {
    return {
      schema_version: 'pilot_feedback_append.v1',
      report_id: reportId,
      created_at: createdAt,
      gate_decision: 'feedback_template_written_no_import_changed',
      real_execution_allowed: false,
      real_send_attempted: false,
      source: {
        pilot_import_path: relativeOrOriginal(root, absolutePilotImportPath),
        feedback_path: null
      },
      before_readiness: summarizeReadiness(beforeReadiness),
      after_readiness: null,
      appended_feedback: null,
      updated_pilot_import: null,
      template,
      required_failures: [],
      next_actions: [
        'Fill feedback-record.template.json with real post-action feedback.',
        'Re-run npm run pilot:feedback:append -- --pilot-import=<PilotImportBatch.json> --feedback=<feedback.json>.',
        'Validate the generated pilot-import.with-feedback.json before running a closed-loop MVP trial.'
      ]
    };
  }

  const absoluteFeedbackPath = path.resolve(root, feedbackPath);
  const feedback = normalizePilotFeedbackAppendRecord(readJson(absoluteFeedbackPath), {
    importId: batch.import_id,
    createdAt
  });
  const existingFeedbackIds = new Set((batch.feedback_records ?? []).map((item) => item.feedback_id));
  if (existingFeedbackIds.has(feedback.feedback_id)) {
    throw new Error(`feedback_id already exists in PilotImportBatch: ${feedback.feedback_id}`);
  }
  const updatedBatch = {
    ...batch,
    feedback_records: [
      ...(batch.feedback_records ?? []),
      feedback
    ]
  };
  const afterReadiness = analyzePilotIntakeReadiness(normalizePilotImportBatch(updatedBatch), {
    inputPath: 'pilot-import.with-feedback.json'
  });
  return {
    schema_version: 'pilot_feedback_append.v1',
    report_id: reportId,
    created_at: createdAt,
    gate_decision: afterReadiness.ready_for_closed_loop_mvp
      ? 'pilot_feedback_appended_ready_for_closed_loop'
      : 'pilot_feedback_appended_needs_attention',
    real_execution_allowed: false,
    real_send_attempted: false,
    source: {
      pilot_import_path: relativeOrOriginal(root, absolutePilotImportPath),
      feedback_path: relativeOrOriginal(root, absoluteFeedbackPath)
    },
    before_readiness: summarizeReadiness(beforeReadiness),
    after_readiness: summarizeReadiness(afterReadiness),
    appended_feedback: {
      feedback_id: feedback.feedback_id,
      executed: feedback.executed,
      reply_received: feedback.reply_received,
      goal_progress: feedback.goal_progress,
      user_rating: feedback.user_rating
    },
    updated_pilot_import: updatedBatch,
    template,
    required_failures: afterReadiness.required_failures,
    next_actions: afterReadiness.ready_for_closed_loop_mvp
      ? [
        'Run node scripts/validate-pilot-intake.mjs --input=<pilot-import.with-feedback.json>.',
        'Run node scripts/run-mvp-loop.mjs --pilot-import=<pilot-import.with-feedback.json> --write-report when ready.'
      ]
      : [
        'Fix readiness failures before running the full MVP closed loop.',
        'Do not treat appended feedback as real unless it came from a completed or reviewed action.'
      ]
  };
}

export function renderPilotFeedbackAppendMarkdown(report) {
  return `# Pilot Feedback Append

- report_id: ${report.report_id}
- gate_decision: ${report.gate_decision}
- real_execution_allowed: ${report.real_execution_allowed}
- real_send_attempted: ${report.real_send_attempted}
- pilot_import_path: ${report.source.pilot_import_path}
- feedback_path: ${report.source.feedback_path ?? 'not_provided'}

## Readiness

- before: ${report.before_readiness.gate_decision}
- before_ready_for_closed_loop_mvp: ${report.before_readiness.ready_for_closed_loop_mvp}
- after: ${report.after_readiness?.gate_decision ?? 'not_appended'}
- after_ready_for_closed_loop_mvp: ${report.after_readiness?.ready_for_closed_loop_mvp ?? 'not_appended'}

## Appended Feedback

${report.appended_feedback ? JSON.stringify(report.appended_feedback, null, 2) : 'No feedback appended. Template only.'}

## Next Actions

${report.next_actions.map((item) => `- ${item}`).join('\n')}
`;
}

export function writePilotFeedbackAppend({
  report,
  outputDir = path.join(process.cwd(), 'runtime/pilot-feedback-append', report.report_id)
} = {}) {
  ensureDir(outputDir);
  const reportPath = path.join(outputDir, 'pilot-feedback-append.json');
  const markdownPath = path.join(outputDir, 'pilot-feedback-append.md');
  const templatePath = path.join(outputDir, 'feedback-record.template.json');
  const updatedPilotImportPath = report.updated_pilot_import
    ? path.join(outputDir, 'pilot-import.with-feedback.json')
    : null;
  writeFileSync(reportPath, `${JSON.stringify({
    ...report,
    updated_pilot_import: report.updated_pilot_import
      ? {
        import_id: report.updated_pilot_import.import_id,
        feedback_records: report.updated_pilot_import.feedback_records.length
      }
      : null
  }, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderPilotFeedbackAppendMarkdown(report), 'utf8');
  writeFileSync(templatePath, `${JSON.stringify(report.template, null, 2)}\n`, 'utf8');
  if (updatedPilotImportPath) {
    writeFileSync(updatedPilotImportPath, `${JSON.stringify(report.updated_pilot_import, null, 2)}\n`, 'utf8');
  }
  return {
    output_dir: outputDir,
    report_path: reportPath,
    markdown_path: markdownPath,
    template_path: templatePath,
    updated_pilot_import_path: updatedPilotImportPath
  };
}
