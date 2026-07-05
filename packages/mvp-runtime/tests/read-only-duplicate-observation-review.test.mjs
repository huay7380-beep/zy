import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  buildReadOnlyDuplicateObservationConfirmation,
  buildReadOnlyDuplicateObservationReview,
  writeReadOnlyDuplicateObservationConfirmation,
  writeReadOnlyDuplicateObservationReview
} from '../src/index.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'read-only-duplicate-review-'));
}

function writeObservation(root, dir, capturedAt, overrides = {}) {
  const observationDir = path.join(root, dir);
  mkdirSync(observationDir, { recursive: true });
  const observationPath = path.join(observationDir, 'intake-observation.real.json');
  const base = {
    schema_version: 'intake_observation.v1',
    observation_id: 'intake_obs_sightflow_wechat_real_duplicate',
    source_adapter_id: 'sightflow_desktop.wechat',
    source_type: 'desktop',
    platform: 'wechat',
    source_actor_type: 'human_contact',
    captured_at: capturedAt,
    content_summary: 'PC WeChat window captured as a real read-only intake artifact. OCR/text extraction has not been performed in this step.',
    content_text: '',
    participants_hint: ['user', 'wechat_contact'],
    thread_hint: {
      title: 'PC WeChat'
    },
    raw_artifact_refs: [path.join(observationDir, 'wechat-window.png')],
    privacy_level: 'redacted_text',
    confidence: 0.7,
    metadata: {
      bridge_mode: 'zhineng_bridge',
      read_only_capture: true,
      real_execution_allowed: false,
      real_send_attempted: false,
      screenshot_path: path.join(observationDir, 'wechat-window.png'),
      screenshot_bytes: 297576,
      capture_errors: []
    }
  };
  const observation = {
    ...base,
    ...overrides,
    metadata: {
      ...base.metadata,
      ...(overrides.metadata ?? {})
    }
  };
  writeFileSync(observationPath, JSON.stringify(observation, null, 2), 'utf8');
  return path.relative(root, observationPath).replaceAll(path.sep, '/');
}

function writeStatus(root, paths) {
  const statusDir = path.join(root, 'runtime/read-only-expansion-status/status_test');
  mkdirSync(statusDir, { recursive: true });
  const statusPath = path.join(statusDir, 'read-only-expansion-status.json');
  writeFileSync(statusPath, JSON.stringify({
    schema_version: 'read_only_expansion_status.v1',
    status_id: 'status_test',
    created_at: '2026-06-16T00:00:00.000Z',
    gate_decision: 'read_only_expansion_ready_for_next_source_sample',
    goal_complete: false,
    goal_status: 'in_progress_waiting_required_future_source_samples',
    real_execution_allowed: false,
    real_send_attempted: false,
    current_samples: {
      real_observations: {
        duplicate_observation_groups: [
          {
            observation_id: 'intake_obs_sightflow_wechat_real_duplicate',
            count: paths.length,
            source_type: 'desktop',
            platform: 'wechat',
            representative_path: paths[0],
            paths
          }
        ]
      },
      current_pilot_import: {},
      latest_generated_pilot_import: {}
    },
    graph_loop: {},
    future_intake: {
      source_adapter_kits: [],
      source_adapter_conformance: [],
      required_future_sources: [],
      reusable_gate_sequence: []
    },
    checks: [],
    required_failures: [],
    warning_failures: ['duplicate_observation_ids_need_review'],
    next_actions: []
  }, null, 2), 'utf8');
  return statusPath;
}

test('reviews duplicate read-only observation groups without claiming operator confirmation', () => {
  const root = tempRoot();
  const paths = [
    writeObservation(root, 'runtime/desktop-inbox-real/a', '2026-06-15T11:58:53.743Z'),
    writeObservation(root, 'runtime/desktop-inbox-real/b', '2026-06-15T11:59:52.488Z')
  ];
  const statusPath = writeStatus(root, paths);
  const review = buildReadOnlyDuplicateObservationReview({ root, statusPath });

  assert.equal(review.schema_version, 'read_only_duplicate_observation_review.v1');
  assert.equal(review.gate_decision, 'duplicate_observation_review_ready_for_operator_confirmation');
  assert.equal(review.real_execution_allowed, false);
  assert.equal(review.real_send_attempted, false);
  assert.equal(review.summary.duplicate_group_count, 1);
  assert.equal(review.summary.deterministic_suppression_ready_groups, 1);
  assert.equal(review.summary.operator_confirmation_required, true);
  assert.deepEqual(review.required_failures, []);
  assert.ok(review.warning_failures.includes('operator_confirmation_required'));
  assert.equal(review.groups[0].recommended_action, 'accept_deduplication_pending_operator_confirmation');
  assert.equal(review.groups[0].deterministic_suppression_ready, true);
  assert.equal(review.groups[0].evidence_summary.all_real_send_blocked, true);

  const written = writeReadOnlyDuplicateObservationReview({
    review,
    outputDir: path.join(root, 'runtime/read-only-duplicate-observation-reviews', review.review_id)
  });
  assert.ok(existsSync(written.json_path));
  assert.ok(existsSync(written.markdown_path));
});

test('duplicate review CLI writes audit artifacts', () => {
  const root = tempRoot();
  const paths = [
    writeObservation(root, 'runtime/desktop-inbox-real/a', '2026-06-15T11:58:53.743Z'),
    writeObservation(root, 'runtime/desktop-inbox-real/b', '2026-06-15T11:59:52.488Z')
  ];
  const statusPath = writeStatus(root, paths);
  const stdout = execFileSync('node', [
    path.resolve('scripts/review-read-only-duplicate-observations.mjs'),
    `--root=${root}`,
    `--status=${statusPath}`
  ], { encoding: 'utf8' });
  const result = JSON.parse(stdout);

  assert.equal(result.command, 'review-read-only-duplicate-observations');
  assert.equal(result.gate_decision, 'duplicate_observation_review_ready_for_operator_confirmation');
  assert.equal(result.duplicate_group_count, 1);
  assert.equal(result.deterministic_suppression_ready_groups, 1);
  assert.equal(result.operator_confirmation_required, true);
  assert.deepEqual(result.required_failures, []);
  assert.ok(existsSync(result.json_path));
  assert.equal(path.relative(root, result.json_path).startsWith('..'), false);
});

test('reviews strict content-fingerprint duplicate groups with different observation ids', () => {
  const root = tempRoot();
  const paths = [
    writeObservation(root, 'runtime/desktop-inbox-real/a', '2026-06-15T11:58:53.743Z', {
      observation_id: 'intake_obs_sightflow_wechat_real_fingerprint_a'
    }),
    writeObservation(root, 'runtime/desktop-inbox-real/b', '2026-06-15T11:59:52.488Z', {
      observation_id: 'intake_obs_sightflow_wechat_real_fingerprint_b'
    })
  ];
  const statusDir = path.join(root, 'runtime/read-only-expansion-status/status_fingerprint');
  mkdirSync(statusDir, { recursive: true });
  const statusPath = path.join(statusDir, 'read-only-expansion-status.json');
  writeFileSync(statusPath, JSON.stringify({
    schema_version: 'read_only_expansion_status.v1',
    status_id: 'status_fingerprint',
    current_samples: {
      real_observations: {
        duplicate_observation_groups: [
          {
            dedupe_level: 'strict_content_fingerprint',
            observation_id: 'intake_obs_sightflow_wechat_real_fingerprint_a',
            count: paths.length,
            source_type: 'desktop',
            platform: 'wechat',
            representative_path: paths[0],
            paths,
            content_fingerprint: {
              schema_version: 'observation_content_fingerprint.v1',
              strategy: 'strict_platform_thread_time_speaker_text_screenshot.v1',
              fingerprint: 'sha256:strict-test-fingerprint',
              dedupe_ready: true,
              missing_required: []
            }
          }
        ]
      }
    }
  }, null, 2), 'utf8');

  const review = buildReadOnlyDuplicateObservationReview({ root, statusPath });

  assert.equal(review.summary.deterministic_suppression_ready_groups, 1);
  assert.equal(review.groups[0].dedupe_level, 'strict_content_fingerprint');
  assert.equal(review.groups[0].evidence_summary.same_observation_id, false);
  assert.equal(review.groups[0].evidence_summary.strict_content_fingerprint_ready, true);
  assert.equal(review.groups[0].deterministic_suppression_ready, true);
  assert.equal(review.groups[0].operator_confirmation_required, true);
  assert.deepEqual(review.required_failures, []);
});

test('duplicate confirmation writes a decision template without claiming operator review', () => {
  const root = tempRoot();
  const paths = [
    writeObservation(root, 'runtime/desktop-inbox-real/a', '2026-06-15T11:58:53.743Z'),
    writeObservation(root, 'runtime/desktop-inbox-real/b', '2026-06-15T11:59:52.488Z')
  ];
  const statusPath = writeStatus(root, paths);
  const review = buildReadOnlyDuplicateObservationReview({ root, statusPath });
  const writtenReview = writeReadOnlyDuplicateObservationReview({
    review,
    outputDir: path.join(root, 'runtime/read-only-duplicate-observation-reviews', review.review_id)
  });

  const confirmation = buildReadOnlyDuplicateObservationConfirmation({
    root,
    reviewPath: writtenReview.json_path
  });

  assert.equal(confirmation.schema_version, 'read_only_duplicate_observation_confirmation.v1');
  assert.equal(confirmation.gate_decision, 'duplicate_observation_confirmation_template_written');
  assert.equal(confirmation.real_execution_allowed, false);
  assert.equal(confirmation.real_send_attempted, false);
  assert.equal(confirmation.summary.decision_present, false);
  assert.equal(confirmation.summary.duplicate_suppression_confirmed, false);
  assert.equal(confirmation.summary.operator_confirmation_recorded, false);
  assert.ok(confirmation.warning_failures.includes('confirmation_decision_present'));

  const written = writeReadOnlyDuplicateObservationConfirmation({
    confirmation,
    outputDir: path.join(root, 'runtime/read-only-duplicate-observation-confirmations', confirmation.confirmation_id)
  });
  assert.ok(existsSync(written.json_path));
  assert.ok(existsSync(written.markdown_path));
  assert.ok(existsSync(written.template_path));
  const template = JSON.parse(readFileSync(written.template_path, 'utf8'));
  assert.equal(template.review_id, review.review_id);
  assert.equal(template.decisions[0].decision, 'accept_suppression');
});

test('duplicate confirmation accepts suppression only with reviewed matching paths', () => {
  const root = tempRoot();
  const paths = [
    writeObservation(root, 'runtime/desktop-inbox-real/a', '2026-06-15T11:58:53.743Z'),
    writeObservation(root, 'runtime/desktop-inbox-real/b', '2026-06-15T11:59:52.488Z')
  ];
  const statusPath = writeStatus(root, paths);
  const review = buildReadOnlyDuplicateObservationReview({ root, statusPath });
  const writtenReview = writeReadOnlyDuplicateObservationReview({
    review,
    outputDir: path.join(root, 'runtime/read-only-duplicate-observation-reviews', review.review_id)
  });
  const decisionPath = path.join(root, 'duplicate-confirmation.reviewed.json');
  writeFileSync(decisionPath, JSON.stringify({
    schema_version: 'read_only_duplicate_observation_confirmation_decision.v1',
    review_id: review.review_id,
    operator: {
      operator_id: 'operator_test',
      operator_name: 'Operator Test',
      confirmed_at: '2026-06-16T00:00:00.000Z'
    },
    decisions: [
      {
        observation_id: 'intake_obs_sightflow_wechat_real_duplicate',
        decision: 'accept_suppression',
        reason: 'Confirmed repeated capture of the same read-only WeChat window.',
        confirmed_paths: paths
      }
    ]
  }, null, 2), 'utf8');

  const confirmation = buildReadOnlyDuplicateObservationConfirmation({
    root,
    reviewPath: writtenReview.json_path,
    decisionPath
  });

  assert.equal(confirmation.gate_decision, 'duplicate_observation_suppression_confirmed');
  assert.equal(confirmation.summary.duplicate_suppression_confirmed, true);
  assert.equal(confirmation.summary.operator_confirmation_recorded, true);
  assert.deepEqual(confirmation.required_failures, []);
  assert.deepEqual(confirmation.warning_failures, []);
  assert.equal(confirmation.groups[0].paths_match, true);
  assert.equal(confirmation.groups[0].accepted, true);
});

test('duplicate confirmation CLI writes template or applied confirmation artifacts', () => {
  const root = tempRoot();
  const paths = [
    writeObservation(root, 'runtime/desktop-inbox-real/a', '2026-06-15T11:58:53.743Z'),
    writeObservation(root, 'runtime/desktop-inbox-real/b', '2026-06-15T11:59:52.488Z')
  ];
  const statusPath = writeStatus(root, paths);
  const review = buildReadOnlyDuplicateObservationReview({ root, statusPath });
  const writtenReview = writeReadOnlyDuplicateObservationReview({
    review,
    outputDir: path.join(root, 'runtime/read-only-duplicate-observation-reviews', review.review_id)
  });
  const templateStdout = execFileSync('node', [
    path.resolve('scripts/confirm-read-only-duplicate-observations.mjs'),
    `--root=${root}`,
    `--review=${writtenReview.json_path}`
  ], { encoding: 'utf8' });
  const templateResult = JSON.parse(templateStdout);
  assert.equal(templateResult.command, 'confirm-read-only-duplicate-observations');
  assert.equal(templateResult.gate_decision, 'duplicate_observation_confirmation_template_written');
  assert.equal(templateResult.duplicate_suppression_confirmed, false);
  assert.ok(existsSync(templateResult.template_path));
  assert.equal(path.relative(root, templateResult.json_path).startsWith('..'), false);

  const decisionPath = path.join(root, 'duplicate-confirmation.reviewed.json');
  writeFileSync(decisionPath, JSON.stringify({
    schema_version: 'read_only_duplicate_observation_confirmation_decision.v1',
    review_id: review.review_id,
    operator: {
      operator_id: 'operator_test',
      confirmed_at: '2026-06-16T00:00:00.000Z'
    },
    decisions: [
      {
        observation_id: 'intake_obs_sightflow_wechat_real_duplicate',
        decision: 'accept_suppression',
        reason: 'Confirmed duplicate evidence.',
        confirmed_paths: paths
      }
    ]
  }, null, 2), 'utf8');
  const applyStdout = execFileSync('node', [
    path.resolve('scripts/confirm-read-only-duplicate-observations.mjs'),
    `--root=${root}`,
    `--review=${writtenReview.json_path}`,
    `--decision=${decisionPath}`,
    '--fail-on-required'
  ], { encoding: 'utf8' });
  const applyResult = JSON.parse(applyStdout);
  assert.equal(applyResult.gate_decision, 'duplicate_observation_suppression_confirmed');
  assert.equal(applyResult.duplicate_suppression_confirmed, true);
  assert.deepEqual(applyResult.required_failures, []);
  assert.equal(path.relative(root, applyResult.json_path).startsWith('..'), false);
});
