import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  buildReadOnlyExpansionTargets,
  writeReadOnlyExpansionTargets
} from '../src/index.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-read-only-targets-'));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function copyJson(source, target) {
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(path.resolve(source), target);
}

function writeKit(root, { adapterId, sourceType, platform }) {
  writeJson(
    path.join(root, 'runtime/source-adapter-kits', `kit_${adapterId.replaceAll('.', '_')}`, 'source-adapter-init-kit.json'),
    {
      kit_id: `kit_${adapterId}`,
      adapter_id: adapterId,
      source_type: sourceType,
      platform,
      can_send_requested: false,
      safety_defaults: {
        real_execution_default: false,
        observation_real_execution_allowed: false
      },
      validation_command: 'npm run intake:adapter:validate'
    }
  );
}

function writeConformance(root, { adapterId, sourceType, platform }) {
  writeJson(
    path.join(root, 'runtime/source-adapter-conformance', adapterId.replaceAll('.', '_'), 'source-adapter-conformance.json'),
    {
      validation_id: `source_adapter_conformance_${adapterId}`,
      adapter_id: adapterId,
      source_type: sourceType,
      platform,
      ready_for_intake: true,
      gate_decision: 'source_adapter_conformant',
      required_failures: []
    }
  );
}

function prepareTargetRoot() {
  const root = tempRoot();
  const pilotPath = path.join(root, 'runtime/user-inputs/pilot-import.real.json');
  copyJson('examples/pilot-import-batch.sample.json', pilotPath);

  const duplicateObservation = {
    observation_id: 'intake_obs_duplicate_wechat_targets_test',
    source_adapter_id: 'sightflow_desktop.wechat',
    source_type: 'desktop',
    platform: 'wechat',
    captured_at: '2026-06-16T10:05:00+08:00',
    content_summary: 'Duplicate WeChat read-only artifact.',
    participants_hint: ['user', 'wechat_contact'],
    raw_artifact_refs: ['runtime/desktop-inbox-real/duplicate-a/screenshot.png'],
    privacy_level: 'artifact_allowed',
    confidence: 0.68,
    metadata: {
      real_execution_allowed: false,
      real_send_attempted: false
    }
  };
  writeJson(path.join(root, 'runtime/desktop-inbox-real/duplicate-a/intake-observation.real.json'), duplicateObservation);
  writeJson(path.join(root, 'runtime/desktop-inbox-real/duplicate-b/intake-observation.real.json'), {
    ...duplicateObservation,
    raw_artifact_refs: ['runtime/desktop-inbox-real/duplicate-b/screenshot.png']
  });
  writeJson(path.join(root, 'runtime/browser-intake-real/browser-a/intake-observation.real.json'), {
    observation_id: 'intake_obs_browser_targets_test',
    source_adapter_id: 'browser_dom.next',
    source_type: 'browser',
    platform: 'web',
    captured_at: '2026-06-16T10:07:00+08:00',
    content_summary: 'Browser read-only sample.',
    participants_hint: ['user', 'web_portal'],
    raw_artifact_refs: ['runtime/browser-intake-real/browser-a/source.html'],
    privacy_level: 'redacted_text',
    confidence: 0.8,
    metadata: {
      real_execution_allowed: false,
      real_send_attempted: false
    }
  });

  const generatedBatch = readJson(path.resolve('examples/pilot-import-batch.sample.json'));
  generatedBatch.import_id = 'generated_targets_test_without_feedback';
  generatedBatch.feedback_records = [];
  const generatedDir = path.join(root, 'runtime/read-only-expansion-trials/generated-targets-test');
  writeJson(path.join(generatedDir, 'pilot-import.generated.json'), generatedBatch);
  writeJson(path.join(generatedDir, 'read-only-expansion-graph-loop-verification.json'), {
    gate_decision: 'read_only_expansion_graph_loop_verified',
    required_failures: [],
    real_execution_allowed: false,
    real_send_attempted: false,
    read_only_expansion: {
      pilot_import: {
        ready_for_closed_loop_mvp: true
      }
    },
    graph_closed_loop: {
      quality: {
        closed_loop_complete: true
      },
      path: {
        expert_weight_judgment: {
          completed_expert_count: 8
        },
        feedback_writeback: {
          writeback_complete: true
        }
      }
    }
  });

  writeKit(root, { adapterId: 'browser_dom.next', sourceType: 'browser', platform: 'web' });
  writeKit(root, { adapterId: 'external_chat_export.next', sourceType: 'file', platform: 'external_chat_export' });
  writeKit(root, { adapterId: 'business_api.next', sourceType: 'api', platform: 'business_system' });
  writeConformance(root, { adapterId: 'browser_dom.next', sourceType: 'browser', platform: 'web' });
  writeConformance(root, { adapterId: 'external_chat_export.sample', sourceType: 'file', platform: 'external_chat_export' });
  writeConformance(root, { adapterId: 'business_api.sample', sourceType: 'api', platform: 'business_system' });

  return { root, pilotPath };
}

test('builds weighted read-only expansion targets from current status gaps', () => {
  const { root, pilotPath } = prepareTargetRoot();
  try {
    const plan = buildReadOnlyExpansionTargets({ root, pilotImportPath: pilotPath });
    assert.equal(plan.schema_version, 'read_only_expansion_targets.v1');
    assert.equal(plan.gate_decision, 'read_only_expansion_targets_ready');
    assert.equal(plan.real_execution_allowed, false);
    assert.equal(plan.real_send_attempted, false);
    assert.deepEqual(plan.required_failures, []);
    assert.equal(plan.weighting_policy.dimensions.reduce((sum, item) => sum + item.weight, 0), 1);

    const targetIds = plan.target_recommendations.map((target) => target.target_id);
    assert.equal(targetIds[0], 'read_only_source_collection_manifest_batch');
    assert.ok(targetIds.includes('external_chat_export_real_sample'));
    assert.ok(targetIds.includes('business_system_api_real_sample'));
    assert.ok(targetIds.includes('generated_batch_real_feedback_writeback'));
    assert.ok(targetIds.includes('duplicate_observation_quality_review'));
    assert.ok(plan.blocking_target_ids.includes('read_only_source_collection_manifest_batch'));
    assert.ok(plan.blocking_target_ids.includes('generated_batch_real_feedback_writeback'));
    const batchTarget = plan.target_recommendations[0];
    assert.equal(batchTarget.commands[0], 'npm.cmd run intake:read-only:manifest:init');
    assert.ok(batchTarget.acceptance_gates.includes('read_only_source_collection_manifest_kit.v1.target_manifest_intentionally_not_written is true'));
    assert.ok(batchTarget.commands[1].includes('intake:read-only:manifest:check'));
    assert.ok(batchTarget.commands[1].includes('runtime/user-inputs/read-only-source-collection.manifest.json'));
    assert.ok(batchTarget.commands[2].includes('intake:read-only:collect'));
    assert.ok(batchTarget.acceptance_gates.includes('read_only_source_collection_manifest_readiness.v1.ready_for_collection is true'));
    assert.ok(plan.next_actions.some((action) => action.includes('intake:read-only:collect')));
    assert.ok(plan.next_actions.some((action) => action.includes('intake:read-only:manifest:check')));
    assert.ok(plan.next_actions.some((action) => action.includes('intake:read-only:manifest:init')));
    assert.ok(plan.next_actions.some((action) => action.includes('--run-trial')));
    assert.ok(plan.target_recommendations.every((target) =>
      target.safety_gates.includes('real_send_attempted=false')
    ));

    const written = writeReadOnlyExpansionTargets({
      plan,
      outputDir: path.join(root, 'runtime/read-only-expansion-targets/test-targets')
    });
    assert.equal(existsSync(written.json_path), true);
    assert.equal(existsSync(written.markdown_path), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('read-only expansion target CLI writes operator-facing next targets without sending', () => {
  const { root, pilotPath } = prepareTargetRoot();
  try {
    const outputDir = path.join(root, 'runtime/read-only-expansion-targets/cli-targets');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/write-read-only-expansion-targets.mjs'),
      `--root=${root}`,
      `--pilot-import=${pilotPath}`,
      `--output-dir=${outputDir}`,
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'write-read-only-expansion-targets');
    assert.equal(stdout.real_execution_allowed, false);
    assert.equal(stdout.real_send_attempted, false);
    assert.ok(stdout.top_target_ids.includes('read_only_source_collection_manifest_batch'));
    assert.ok(stdout.blocking_target_ids.includes('business_system_api_real_sample'));

    const report = readJson(path.join(outputDir, 'read-only-expansion-targets.json'));
    assert.equal(report.schema_version, 'read_only_expansion_targets.v1');
    assert.equal(report.target_recommendations[0].rank, 1);
    assert.equal(report.target_recommendations[0].weighted_score > report.target_recommendations.at(-1).weighted_score, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
