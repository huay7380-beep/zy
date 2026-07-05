import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildTagRegistrySeed,
  buildTenEventTagScenario,
  queryEventsByAllTags,
  queryEventsByTag,
  runTagRegistryValidation,
  validateTagRegistryScenario
} from '../src/index.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-tag-registry-'));
}

test('validates ten-event tag registry scenario with compact evidence and zero side effects', () => {
  const registry = buildTagRegistrySeed();
  const scenario = buildTenEventTagScenario();
  const report = validateTagRegistryScenario({ registry, scenario });

  assert.equal(report.gate_decision, 'tag_registry_validation_passed');
  assert.deepEqual(report.required_failures, []);
  assert.equal(report.metrics.event_count, 10);
  assert.equal(report.metrics.registry_miss_count, 0);
  assert.equal(report.metrics.required_bucket_failures, 0);
  assert.equal(report.metrics.evidence_failures, 0);
  assert.equal(report.metrics.tag_signature_roundtrip_failures, 0);
  assert.equal(report.metrics.query_failures, 0);
  assert.equal(report.metrics.context_failures, 0);
  assert.equal(report.boundary.relationship_state_writes, 0);
  assert.equal(report.boundary.identity_merges_applied, 0);
  assert.equal(report.boundary.external_actions_executed, 0);
  assert.ok(report.metrics.max_tag_count <= 36);
  assert.ok(report.metrics.avg_evidence_compression_ratio <= 0.72);
});

test('finds specific people and events through tags', () => {
  const { events } = buildTenEventTagScenario();

  assert.deepEqual(
    queryEventsByTag(events, 'person:zhang_001').map((event) => event.event_id).sort(),
    ['evt_001_sales_budget_pending', 'evt_002_technical_review_window', 'evt_006_warehouse_notification_blocked'].sort()
  );
  assert.deepEqual(
    queryEventsByTag(events, 'relationship_signal:needs_space').map((event) => event.event_id),
    ['evt_003_relationship_space_request']
  );
  assert.deepEqual(
    queryEventsByAllTags(events, ['source:home_sensor', 'risk:high']).map((event) => event.event_id),
    ['evt_009_water_leak_detected']
  );
});

test('writes validation report, registry seed and ten-event sample under runtime output', () => {
  const root = tempRoot();
  try {
    const result = runTagRegistryValidation({
      root,
      outputDir: path.join(root, 'runtime/tag-registry-validation/test_run')
    });

    assert.equal(result.gate_decision, 'tag_registry_validation_passed');
    assert.ok(existsSync(path.join(root, result.paths.registry_path)));
    assert.ok(existsSync(path.join(root, result.paths.scenario_path)));
    assert.ok(existsSync(path.join(root, result.paths.report_path)));
    assert.ok(existsSync(path.join(root, result.paths.markdown_path)));

    const report = JSON.parse(readFileSync(path.join(root, result.paths.report_path), 'utf8'));
    assert.equal(report.metrics.event_count, 10);
    assert.equal(report.metrics.query_failures, 0);
    assert.equal(report.metrics.context_failures, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
