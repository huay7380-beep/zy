import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-read-only-trial-'));
}

function copyJson(source, target) {
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(path.resolve(source), target);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

test('read-only expansion trial scans real observation files and keeps generated batch feedback-gated', () => {
  const root = tempRoot();
  try {
    copyJson(
      'examples/pilot-import-batch.sample.json',
      path.join(root, 'runtime/user-inputs/pilot-import.real.json')
    );
    copyJson(
      'examples/intake-observation.sightflow.sample.json',
      path.join(root, 'runtime/desktop-inbox-real/wechat-a/intake-observation.real.json')
    );
    copyJson(
      'examples/intake-observation.browser.sample.json',
      path.join(root, 'runtime/browser-intake-real/browser-a/intake-observation.real.json')
    );

    const outputDir = path.join(root, 'runtime/read-only-expansion-trials/test-trial');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/run-read-only-expansion-trial.mjs'),
      `--root=${process.cwd()}`,
      `--source-dir=${path.join(root, 'runtime/desktop-inbox-real')}`,
      `--source-dir=${path.join(root, 'runtime/browser-intake-real')}`,
      `--pilot-import=${path.join(root, 'runtime/user-inputs/pilot-import.real.json')}`,
      `--output-dir=${outputDir}`,
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'run-read-only-expansion-trial');
    assert.equal(stdout.real_execution_allowed, false);
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(stdout.raw_observation_count, 2);
    assert.equal(stdout.effective_observation_count, 2);
    assert.equal(stdout.generated_pilot_import_ready_for_decision, true);
    assert.equal(stdout.generated_pilot_import_ready_for_closed_loop_mvp, false);
    assert.equal(stdout.graph_loop_gate_decision, 'read_only_expansion_graph_loop_verified');

    const report = readJson(path.join(outputDir, 'read-only-expansion-trial.json'));
    assert.equal(report.schema_version, 'read_only_expansion_trial.v1');
    assert.equal(report.gate_decision, 'read_only_expansion_trial_ready_for_feedback_collection');
    assert.equal(report.generated_pilot_import.records, 2);
    assert.equal(report.generated_pilot_import.feedback_records, 0);
    assert.equal(report.graph_loop.closed_loop_complete, true);
    assert.equal(report.graph_loop.writeback_complete, true);
    assert.ok(report.checks.some((check) =>
      check.check_id === 'generated_batch_needs_feedback_before_closed_loop'
        && check.severity === 'warning'
        && check.passed === true
    ));
    assert.equal(existsSync(path.join(outputDir, 'pilot-import.generated.json')), true);
    assert.equal(existsSync(path.join(outputDir, 'read-only-expansion-graph-loop-verification.json')), true);

    const graphVerification = readJson(path.join(outputDir, 'read-only-expansion-graph-loop-verification.json'));
    assert.ok(graphVerification.read_only_expansion.source_adapter_conformance
      .some((item) => item.source_id === 'external_chat_export_sample' && item.ready_for_intake === true));
    assert.ok(graphVerification.read_only_expansion.source_adapter_conformance
      .some((item) => item.source_id === 'business_api_sample' && item.ready_for_intake === true));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
