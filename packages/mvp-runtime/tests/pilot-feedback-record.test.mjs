import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildPilotFeedbackAppend,
  writePilotFeedbackAppend
} from '../src/index.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-pilot-feedback-'));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sampleWithoutFeedback() {
  const sample = readJson(path.resolve('examples/pilot-import-batch.sample.json'));
  return {
    ...sample,
    import_id: 'pilot_import_feedback_append_test',
    feedback_records: []
  };
}

test('writes a feedback template without modifying the PilotImportBatch', () => {
  const root = tempRoot();
  try {
    const pilotImportPath = path.join(root, 'runtime/user-inputs/pilot-import.generated.json');
    writeJson(pilotImportPath, sampleWithoutFeedback());

    const report = buildPilotFeedbackAppend({
      root,
      pilotImportPath: 'runtime/user-inputs/pilot-import.generated.json',
      createdAt: '2026-06-16T12:00:00.000Z'
    });
    assert.equal(report.gate_decision, 'feedback_template_written_no_import_changed');
    assert.equal(report.real_execution_allowed, false);
    assert.equal(report.real_send_attempted, false);
    assert.equal(report.before_readiness.ready_for_decision_trial, true);
    assert.equal(report.before_readiness.ready_for_closed_loop_mvp, false);
    assert.equal(report.after_readiness, null);
    assert.equal(report.updated_pilot_import, null);
    assert.equal(report.template.metadata.template_only, true);

    const written = writePilotFeedbackAppend({
      report,
      outputDir: path.join(root, 'runtime/pilot-feedback-append/template')
    });
    assert.equal(existsSync(written.report_path), true);
    assert.equal(existsSync(written.markdown_path), true);
    assert.equal(existsSync(written.template_path), true);
    assert.equal(written.updated_pilot_import_path, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('appends real feedback into a new PilotImportBatch ready for closed-loop validation', () => {
  const root = tempRoot();
  try {
    const pilotImportPath = path.join(root, 'runtime/user-inputs/pilot-import.generated.json');
    const feedbackPath = path.join(root, 'runtime/user-inputs/manual-feedback.real.json');
    writeJson(pilotImportPath, sampleWithoutFeedback());
    writeJson(feedbackPath, {
      feedback_id: 'feedback_feedback_append_test_real_001',
      decision_id: 'decision_feedback_append_test_001',
      trigger_id: 'trigger_feedback_append_test_001',
      executed: true,
      reply_received: true,
      goal_progress: 0.62,
      relationship_change: 0.1,
      user_rating: 4,
      new_event_candidate_ids: ['semantic_feedback_append_test_reply_001'],
      notes: 'Manual reviewed feedback after a controlled action.'
    });

    const report = buildPilotFeedbackAppend({
      root,
      pilotImportPath: 'runtime/user-inputs/pilot-import.generated.json',
      feedbackPath: 'runtime/user-inputs/manual-feedback.real.json',
      createdAt: '2026-06-16T12:05:00.000Z'
    });
    assert.equal(report.gate_decision, 'pilot_feedback_appended_ready_for_closed_loop');
    assert.equal(report.after_readiness.ready_for_closed_loop_mvp, true);
    assert.deepEqual(report.required_failures, []);
    assert.equal(report.updated_pilot_import.feedback_records.length, 1);
    assert.equal(report.updated_pilot_import.feedback_records[0].metadata.real_send_attempted, false);

    const written = writePilotFeedbackAppend({
      report,
      outputDir: path.join(root, 'runtime/pilot-feedback-append/appended')
    });
    assert.equal(existsSync(written.updated_pilot_import_path), true);
    const updatedBatch = readJson(written.updated_pilot_import_path);
    assert.equal(updatedBatch.feedback_records.length, 1);
    assert.equal(updatedBatch.feedback_records[0].feedback_id, 'feedback_feedback_append_test_real_001');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects unchanged feedback templates as real feedback', () => {
  const root = tempRoot();
  try {
    const pilotImportPath = path.join(root, 'runtime/user-inputs/pilot-import.generated.json');
    writeJson(pilotImportPath, sampleWithoutFeedback());

    const templateReport = buildPilotFeedbackAppend({
      root,
      pilotImportPath: 'runtime/user-inputs/pilot-import.generated.json'
    });
    const templatePath = path.join(root, 'runtime/user-inputs/feedback-record.template.json');
    writeJson(templatePath, templateReport.template);

    assert.throws(
      () => buildPilotFeedbackAppend({
        root,
        pilotImportPath: 'runtime/user-inputs/pilot-import.generated.json',
        feedbackPath: 'runtime/user-inputs/feedback-record.template.json'
      }),
      /feedback_template_cannot_be_appended_as_real_feedback/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
