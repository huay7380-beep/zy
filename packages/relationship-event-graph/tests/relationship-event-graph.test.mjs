import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildLearningWeightPromotionConfirmation,
  buildRelationshipEventGraphPhaseRun,
  validateLearningWeightPromotionConfirmation,
  validateRelationshipEventGraphPhaseRun,
  writeLearningWeightPromotionConfirmation,
  writeRelationshipEventGraphPhaseRun
} from '../src/index.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-relationship-event-'));
}

function fixtureRecords() {
  return [
    {
      source_id: 'desktop_wechat_test',
      source_type: 'desktop',
      platform: 'wechat',
      adapter_id: 'sightflow_desktop.wechat',
      captured_at: '2026-07-01T09:00:00+08:00',
      content_text: 'Customer says budget is still under internal confirmation and technical review is available tomorrow.',
      content_summary: 'Customer budget confirmation and technical review window.',
      participants_hint: ['user', 'customer_contact'],
      thread_hint: { thread_key: 'wechat:test' },
      raw_artifact_refs: ['runtime/test/desktop.png'],
      privacy_level: 'redacted_text',
      metadata: { test: true }
    },
    {
      source_id: 'browser_web_test',
      source_type: 'browser',
      platform: 'web',
      adapter_id: 'browser_dom.sample',
      captured_at: '2026-07-01T09:05:00+08:00',
      content_text: 'Customer portal status waits for customer review and asks for security whitelist evidence.',
      content_summary: 'Portal asks for security whitelist evidence before review.',
      participants_hint: ['user', 'customer_portal'],
      thread_hint: { url: 'https://example.test/project' },
      raw_artifact_refs: ['runtime/test/page.html'],
      privacy_level: 'redacted_text',
      metadata: { test: true }
    },
    {
      source_id: 'manual_romance_test',
      source_type: 'manual',
      platform: 'operator_note',
      adapter_id: 'manual.operator_note',
      captured_at: '2026-07-01T09:10:00+08:00',
      content_text: "Manual note: target joked 'are we dating now?' and user wants a warm low-pressure reply without confirming relationship state.",
      content_summary: 'Relationship label probe and low-pressure boundary requirement.',
      participants_hint: ['user', 'romantic_target_hint'],
      thread_hint: { thread_key: 'manual:romance:test' },
      raw_artifact_refs: [],
      privacy_level: 'redacted_text',
      metadata: { test: true }
    }
  ];
}

test('builds P0-P9 relationship/event graph phase run without sensitive side effects', () => {
  const root = tempRoot();
  try {
    const phaseRun = buildRelationshipEventGraphPhaseRun({
      root: process.cwd(),
      records: fixtureRecords(),
      runId: 'relationship_event_graph_phase_run_test',
      outputDir: path.join(root, 'runtime/relationship-event-graph-phase-runs/test_build')
    });

    assert.equal(phaseRun.schema_version, 'relationship_event_graph_phase_run.v1');
    assert.equal(phaseRun.gate_decision, 'relationship_event_graph_p9_ready');
    assert.equal(phaseRun.execution_scope.completed_through, 'P9');
    assert.equal(phaseRun.execution_scope.p10_learning_weight_implemented, false);
    assert.equal(phaseRun.execution_scope.relationship_state_writes, 0);
    assert.equal(phaseRun.execution_scope.external_actions_executed, 0);
    assert.deepEqual(phaseRun.required_failures, []);
    assert.equal(phaseRun.artifacts.source_archives.length, 3);
    assert.equal(phaseRun.artifacts.source_episodes.length, 3);
    assert.equal(phaseRun.artifacts.raw_events.length, 3);
    assert.equal(phaseRun.artifacts.semantic_events.length, 3);
    assert.ok(phaseRun.artifacts.nested_events.length >= 4);
    assert.ok(
      phaseRun.artifacts.nested_events.some((event, _, all) =>
        all.filter((other) => other.raw_event_id === event.raw_event_id).length >= 2
      )
    );
    assert.ok(phaseRun.artifacts.confirmation_gates.some((gate) => gate.gate_type === 'relationship_state_write'));
    assert.ok(phaseRun.artifacts.confirmation_gates.every((gate) => gate.status === 'blocked_pending_user_confirmation'));
    assert.ok(phaseRun.artifacts.weight_profiles.some((profile) => profile.weight_level === 'V5'));
    assert.ok(phaseRun.artifacts.weight_profiles.every((profile) => profile.writes_fact_state === false));
    assert.equal(phaseRun.artifacts.prewrite_tag_signature_gate.gate_decision, 'prewrite_tag_signature_gate_passed');
    assert.equal(phaseRun.artifacts.prewrite_tag_signature_gate.aggregate.failed_count, 0);
    assert.equal(phaseRun.artifacts.prewrite_tag_signature_gate.aggregate.event_count, phaseRun.artifacts.nested_events.length);
    assert.ok(phaseRun.artifacts.nested_events.every((event) => event.tags.includes('relationship_write:blocked')));
    assert.ok(phaseRun.artifacts.nested_events.every((event) => event.tags.includes('identity_merge:blocked')));
    assert.ok(phaseRun.artifacts.nested_events.every((event) => event.tags.includes('external_action:blocked')));
    assert.ok(phaseRun.artifacts.prewrite_tag_signature_gate.event_reports.every((event) =>
      event.evidence_extraction.status === 'pass'
      && event.evidence_extraction.compression_ratio <= 0.72
      && event.evidence_extraction.snippets_in_source_text === true
    ));
    assert.equal(phaseRun.artifacts.nebula_projection.source_only, true);
    assert.equal(phaseRun.artifacts.nebula_projection.writes_fact_state, false);
    assert.deepEqual(
      [...new Set(phaseRun.artifacts.nebula_projection.nodes.map((node) => node.node_type))].sort(),
      ['confirmation_gate', 'event', 'person', 'source', 'tag']
    );

    const validation = validateRelationshipEventGraphPhaseRun(phaseRun);
    assert.equal(validation.gate_decision, 'relationship_event_graph_phase_validation_passed');
    assert.deepEqual(validation.required_failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('builds P10 learning weight shadow report without promotion or formal consumers', () => {
  const root = tempRoot();
  try {
    const phaseRun = buildRelationshipEventGraphPhaseRun({
      root: process.cwd(),
      records: fixtureRecords(),
      runId: 'relationship_event_graph_phase_run_p10_shadow_test',
      outputDir: path.join(root, 'runtime/relationship-event-graph-phase-runs/test_p10_shadow'),
      includeP10Shadow: true
    });

    assert.equal(phaseRun.gate_decision, 'relationship_event_graph_p10_shadow_ready');
    assert.equal(phaseRun.execution_scope.completed_through, 'P10');
    assert.equal(phaseRun.execution_scope.p10_shadow_mode_executed, true);
    assert.equal(phaseRun.execution_scope.p10_learning_weight_implemented, false);
    assert.equal(phaseRun.execution_scope.learning_weight_promotion_applied, false);

    const shadowReport = phaseRun.artifacts.learning_weight_shadow_report;
    assert.equal(shadowReport.schema_version, 'learning_weight_shadow_report.v1');
    assert.equal(shadowReport.mode, 'shadow_only');
    assert.equal(shadowReport.writes_fact_state, false);
    assert.equal(shadowReport.comparison.length, phaseRun.artifacts.weight_profiles.length);
    assert.ok(shadowReport.comparison.every((item) => item.allowed_effect === 'report_only'));
    assert.ok(shadowReport.comparison.every((item) => item.applied_to_weight_profile === false));
    assert.equal(shadowReport.read_only_consumers.context_snapshot_uses_shadow, false);
    assert.equal(shadowReport.read_only_consumers.nebula_projection_uses_shadow, false);
    assert.equal(shadowReport.read_only_consumers.weight_profile_mutation_allowed, false);
    assert.equal(shadowReport.promotion_confirmation_gate.gate_type, 'learning_weight_promotion');
    assert.equal(shadowReport.promotion_confirmation_gate.status, 'blocked_pending_user_confirmation');
    assert.deepEqual(shadowReport.promotion_confirmation_gate.allowed_operations, []);

    const validation = validateRelationshipEventGraphPhaseRun(phaseRun);
    assert.equal(validation.gate_decision, 'relationship_event_graph_phase_validation_passed');
    assert.deepEqual(validation.required_failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writes phase run artifacts and phase status under runtime only', () => {
  const root = tempRoot();
  try {
    const outputDir = path.join(root, 'runtime/relationship-event-graph-phase-runs/test_run');
    const phaseRun = buildRelationshipEventGraphPhaseRun({
      root: process.cwd(),
      records: fixtureRecords(),
      runId: 'relationship_event_graph_phase_run_write_test',
      outputDir
    });
    const written = writeRelationshipEventGraphPhaseRun({
      phaseRun,
      outputDir,
      root
    });

    assert.ok(existsSync(written.json_path));
    assert.ok(existsSync(written.markdown_path));
    assert.ok(existsSync(written.status_json_path));
    assert.ok(existsSync(path.join(written.artifacts_dir, 'nebula-projection.json')));
    assert.ok(existsSync(path.join(written.artifacts_dir, 'prewrite-tag-signature-gate.json')));

    const status = JSON.parse(readFileSync(written.status_json_path, 'utf8'));
    assert.equal(status.status, 'execution_completed_p9');
    assert.equal(status.completed_through, 'P9');
    assert.equal(status.p10_requires_separate_user_confirmation, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writes P10 shadow phase status without allowing learning-weight promotion', () => {
  const root = tempRoot();
  try {
    const outputDir = path.join(root, 'runtime/relationship-event-graph-phase-runs/test_p10_write');
    const phaseRun = buildRelationshipEventGraphPhaseRun({
      root: process.cwd(),
      records: fixtureRecords(),
      runId: 'relationship_event_graph_phase_run_p10_write_test',
      outputDir,
      includeP10Shadow: true
    });
    const written = writeRelationshipEventGraphPhaseRun({
      phaseRun,
      outputDir,
      root
    });

    assert.ok(existsSync(path.join(written.artifacts_dir, 'learning-weight-shadow-report.json')));

    const status = JSON.parse(readFileSync(written.status_json_path, 'utf8'));
    assert.equal(status.status, 'execution_completed_p10_shadow_pending_learning_weight_promotion_confirmation');
    assert.equal(status.completed_through, 'P10');
    assert.equal(status.next_phase_allowed, false);
    assert.equal(status.p10_requires_separate_user_confirmation, false);
    assert.equal(status.learning_weight_promotion_requires_separate_user_confirmation, true);
    assert.equal(status.learning_weight_promotion_allowed, false);
    assert.ok(status.promotion_confirmation_gate_id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('builds learning weight promotion confirmation pack without approving limited trial', () => {
  const root = tempRoot();
  try {
    const phaseRun = buildRelationshipEventGraphPhaseRun({
      root: process.cwd(),
      records: fixtureRecords(),
      runId: 'relationship_event_graph_phase_run_promotion_confirmation_test',
      outputDir: path.join(root, 'runtime/relationship-event-graph-phase-runs/test_promotion_confirmation'),
      includeP10Shadow: true
    });
    const confirmation = buildLearningWeightPromotionConfirmation({
      root: process.cwd(),
      phaseRun,
      phaseRunPath: 'runtime/relationship-event-graph-phase-runs/test/relationship-event-graph-phase-run.json'
    });

    assert.equal(confirmation.schema_version, 'learning_weight_promotion_confirmation.v1');
    assert.equal(confirmation.gate_decision, 'learning_weight_promotion_confirmation_pending_user_decision');
    assert.deepEqual(confirmation.required_failures, []);
    assert.equal(confirmation.confirmation_scope.requested_scope, 'limited_trial_only');
    assert.equal(confirmation.confirmation_scope.full_promotion_allowed, false);
    assert.equal(confirmation.approval_boundary.this_artifact_approves_nothing, true);
    assert.equal(confirmation.approval_boundary.learning_weight_promotion_allowed, false);
    assert.equal(confirmation.approval_boundary.limited_trial_execution_allowed, false);
    assert.equal(confirmation.decision_template.selected_decision, 'pending');
    assert.equal(confirmation.decision_template.approval_flags.user_final_confirmation, false);

    const validation = validateLearningWeightPromotionConfirmation(confirmation);
    assert.equal(validation.gate_decision, 'learning_weight_promotion_confirmation_validation_passed');
    assert.deepEqual(validation.required_failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writes learning weight promotion confirmation status while keeping promotion blocked', () => {
  const root = tempRoot();
  try {
    const phaseRun = buildRelationshipEventGraphPhaseRun({
      root: process.cwd(),
      records: fixtureRecords(),
      runId: 'relationship_event_graph_phase_run_promotion_confirmation_write_test',
      outputDir: path.join(root, 'runtime/relationship-event-graph-phase-runs/test_promotion_confirmation_write'),
      includeP10Shadow: true
    });
    const confirmation = buildLearningWeightPromotionConfirmation({
      root,
      phaseRun,
      phaseRunPath: path.join(root, 'runtime/relationship-event-graph-phase-runs/test_promotion_confirmation_write/relationship-event-graph-phase-run.json')
    });
    const written = writeLearningWeightPromotionConfirmation({
      confirmation,
      root
    });

    assert.ok(existsSync(written.json_path));
    assert.ok(existsSync(written.markdown_path));
    assert.ok(existsSync(written.decision_template_path));
    assert.ok(existsSync(written.latest_path));

    const status = JSON.parse(readFileSync(written.status_json_path, 'utf8'));
    assert.equal(status.status, 'learning_weight_promotion_confirmation_pending_user_decision');
    assert.equal(status.next_phase_allowed, false);
    assert.equal(status.learning_weight_promotion_allowed, false);
    assert.equal(status.limited_trial_execution_allowed, false);
    assert.equal(status.latest_learning_weight_confirmation_id, confirmation.confirmation_id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects source archive input without original text', () => {
  assert.throws(
    () => buildRelationshipEventGraphPhaseRun({
      root: process.cwd(),
      records: [
        {
          source_id: 'bad',
          source_type: 'manual',
          platform: 'operator_note',
          captured_at: '2026-07-01T09:10:00+08:00',
          content_summary: 'Missing original text'
        }
      ],
      runId: 'relationship_event_graph_phase_run_bad_input',
      outputDir: path.join(tmpdir(), 'zhineng-relationship-event-bad-never-written')
    }),
    /SourceRecord missing required fields: content_text/
  );
});
