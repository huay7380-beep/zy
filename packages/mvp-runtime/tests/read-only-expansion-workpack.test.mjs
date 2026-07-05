import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  buildReadOnlyExpansionWorkpack,
  writeReadOnlyExpansionWorkpack
} from '../src/index.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-read-only-workpack-'));
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
    path.join(root, 'runtime/source-adapter-kits', adapterId.replaceAll('.', '_'), 'source-adapter-init-kit.json'),
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

function prepareWorkpackRoot() {
  const root = tempRoot();
  const pilotPath = path.join(root, 'runtime/user-inputs/pilot-import.real.json');
  copyJson('examples/pilot-import-batch.sample.json', pilotPath);

  writeJson(path.join(root, 'runtime/desktop-inbox-real/wechat-a/intake-observation.real.json'), {
    observation_id: 'intake_obs_workpack_wechat_a',
    source_adapter_id: 'sightflow_desktop.wechat',
    source_type: 'desktop',
    platform: 'wechat',
    captured_at: '2026-06-16T10:00:00+08:00',
    content_summary: 'WeChat read-only sample for workpack.',
    participants_hint: ['user', 'client_a'],
    raw_artifact_refs: ['runtime/desktop-inbox-real/wechat-a/screenshot.png'],
    privacy_level: 'artifact_allowed',
    confidence: 0.72,
    metadata: {
      real_execution_allowed: false,
      real_send_attempted: false
    }
  });
  writeJson(path.join(root, 'runtime/browser-intake-real/web-a/intake-observation.real.json'), {
    observation_id: 'intake_obs_workpack_browser_a',
    source_adapter_id: 'browser_dom.next',
    source_type: 'browser',
    platform: 'web',
    captured_at: '2026-06-16T10:05:00+08:00',
    content_summary: 'Browser read-only sample for workpack.',
    participants_hint: ['user', 'portal_a'],
    raw_artifact_refs: ['runtime/browser-intake-real/web-a/source.html'],
    privacy_level: 'redacted_text',
    confidence: 0.8,
    metadata: {
      real_execution_allowed: false,
      real_send_attempted: false
    }
  });

  const generatedBatch = readJson(path.resolve('examples/pilot-import-batch.sample.json'));
  generatedBatch.import_id = 'generated_workpack_test_without_feedback';
  generatedBatch.feedback_records = [];
  const trialDir = path.join(root, 'runtime/read-only-expansion-trials/workpack-trial');
  const generatedPath = path.join(trialDir, 'pilot-import.generated.json');
  const graphPath = path.join(trialDir, 'read-only-expansion-graph-loop-verification.json');
  writeJson(generatedPath, generatedBatch);
  writeJson(graphPath, {
    schema_version: 'read_only_expansion_graph_loop_verification.v1',
    verification_id: 'read_only_expansion_graph_loop_workpack_test',
    gate_decision: 'read_only_expansion_graph_loop_verified',
    real_execution_allowed: false,
    real_send_attempted: false,
    required_failures: [],
    graph_closed_loop: {
      quality: {
        closed_loop_complete: true
      },
      path: {
        expert_weight_judgment: {
          weights: {
            goal_fit: 0.13,
            relationship_fit: 0.16,
            risk_control: 0.2
          },
          selected_expert_ids: ['game_theory_expert', 'psychology_expert', 'logic_expert'],
          completed_expert_count: 5,
          ranking_basis: 'predictive_value_only'
        },
        draft_output: {
          decision_id: 'decision_workpack_test',
          draft_present: true,
          draft_chars: 64,
          must_confirm_before_send: true
        },
        feedback_writeback: {
          feedback_id: 'feedback_workpack_reference',
          feedback_complete: true,
          writeback_complete: true,
          index_rebuild_complete: true,
          audit_complete: true
        }
      }
    }
  });
  const trialPath = path.join(trialDir, 'read-only-expansion-trial.json');
  writeJson(trialPath, {
    schema_version: 'read_only_expansion_trial.v1',
    trial_id: 'read_only_expansion_trial_workpack_test',
    created_at: '2026-06-16T10:10:00+08:00',
    gate_decision: 'read_only_expansion_trial_ready_for_feedback_collection',
    real_execution_allowed: false,
    real_send_attempted: false,
    source: {
      root,
      source_dirs: ['runtime/desktop-inbox-real', 'runtime/browser-intake-real'],
      observation_paths: [
        'runtime/desktop-inbox-real/wechat-a/intake-observation.real.json',
        'runtime/browser-intake-real/web-a/intake-observation.real.json'
      ],
      pilot_import_path: 'runtime/user-inputs/pilot-import.real.json'
    },
    bridge: {
      bridge_id: 'desktop_context_bridge_workpack_test',
      gate_decision: 'desktop_context_ready_for_decision_trial',
      raw_observation_count: 2,
      effective_observation_count: 2,
      duplicate_suppressed_count: 0,
      duplicate_observation_groups: [],
      decision_id: 'decision_workpack_test',
      expert_count: 8,
      message_draft_length: 80
    },
    generated_pilot_import: {
      import_id: generatedBatch.import_id,
      records: generatedBatch.records.length,
      feedback_records: 0,
      ready_for_decision_trial: true,
      ready_for_closed_loop_mvp: false
    },
    graph_loop: {
      verification_id: 'read_only_expansion_graph_loop_workpack_test',
      gate_decision: 'read_only_expansion_graph_loop_verified',
      required_failures: [],
      closed_loop_complete: true,
      completed_expert_count: 5,
      writeback_complete: true
    },
    artifacts: {
      output_dir: trialDir,
      generated_pilot_import_path: generatedPath,
      graph_loop_verification_path: graphPath
    },
    checks: [],
    required_failures: [],
    next_actions: []
  });

  writeKit(root, { adapterId: 'browser_dom.next', sourceType: 'browser', platform: 'web' });
  writeKit(root, { adapterId: 'external_chat_export.next', sourceType: 'file', platform: 'external_chat_export' });
  writeKit(root, { adapterId: 'business_api.next', sourceType: 'api', platform: 'business_system' });
  writeConformance(root, { adapterId: 'browser_dom.next', sourceType: 'browser', platform: 'web' });
  writeConformance(root, { adapterId: 'external_chat_export.sample', sourceType: 'file', platform: 'external_chat_export' });
  writeConformance(root, { adapterId: 'business_api.sample', sourceType: 'api', platform: 'business_system' });

  return { root, trialPath, generatedPath };
}

test('builds a read-only expansion workpack from latest trial, targets and feedback template', () => {
  const { root, trialPath, generatedPath } = prepareWorkpackRoot();
  try {
    const workpack = buildReadOnlyExpansionWorkpack({ root, trialPath });
    assert.equal(workpack.schema_version, 'read_only_expansion_workpack.v1');
    assert.equal(workpack.gate_decision, 'read_only_expansion_workpack_ready_for_operator_review');
    assert.equal(workpack.real_execution_allowed, false);
    assert.equal(workpack.real_send_attempted, false);
    assert.deepEqual(workpack.required_failures, []);
    assert.equal(workpack.sample_summary.raw_observation_count, 2);
    assert.equal(workpack.sample_summary.ready_for_decision_trial, true);
    assert.equal(workpack.sample_summary.ready_for_closed_loop_mvp, false);
    assert.equal(workpack.graph_loop_summary.closed_loop_complete, true);
    assert.equal(workpack.graph_loop_summary.expert_weight_judgment.completed_expert_count, 5);
    assert.equal(workpack.feedback_collection.summary.template_only, true);
    assert.ok(workpack.feedback_collection.append_commands.some((command) => command.includes('pilot:feedback:append')));
    assert.ok(workpack.next_sampling_targets.top_targets.some((target) => target.target_id === 'external_chat_export_real_sample'));
    assert.ok(workpack.next_sampling_targets.top_targets.some((target) => target.target_id === 'business_system_api_real_sample'));
    assert.ok(workpack.next_actions.some((command) => command.includes('intake:read-only:manifest:init')));
    assert.ok(workpack.next_actions.some((command) => command.includes('intake:read-only:manifest:check')));
    assert.ok(workpack.next_actions.some((command) => command.includes('intake:read-only:collect')));
    assert.ok(workpack.next_actions.some((command) => command.includes('runtime/user-inputs/read-only-source-collection.manifest.json')));
    assert.equal(workpack.operator_checklist.some((item) => item.includes('do not append it unchanged')), true);
    assert.ok(workpack.source.generated_pilot_import_path.endsWith('pilot-import.generated.json'));

    const written = writeReadOnlyExpansionWorkpack({
      workpack,
      outputDir: path.join(root, 'runtime/read-only-expansion-workpacks/workpack-test')
    });
    assert.equal(existsSync(written.workpack_json_path), true);
    assert.equal(existsSync(written.workpack_markdown_path), true);
    assert.equal(existsSync(written.feedback_template_path), true);
    assert.equal(existsSync(written.target_plan_path), true);
    const saved = readJson(written.workpack_json_path);
    assert.equal(saved.artifacts.feedback_template_path.endsWith('feedback-record.template.json'), true);
    assert.equal(saved.embedded.target_plan_id, workpack.next_sampling_targets.target_plan_id);
    assert.equal(readJson(written.feedback_template_path).metadata.template_only, true);
    assert.equal(path.resolve(root, saved.source.generated_pilot_import_path), generatedPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('read-only expansion workpack CLI writes operator package without sending', () => {
  const { root, trialPath } = prepareWorkpackRoot();
  try {
    const outputDir = path.join(root, 'runtime/read-only-expansion-workpacks/cli-workpack');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/write-read-only-expansion-workpack.mjs'),
      `--root=${root}`,
      `--trial=${trialPath}`,
      `--output-dir=${outputDir}`,
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'write-read-only-expansion-workpack');
    assert.equal(stdout.gate_decision, 'read_only_expansion_workpack_ready_for_operator_review');
    assert.equal(stdout.real_execution_allowed, false);
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(stdout.generated_batch_ready_for_closed_loop_mvp, false);
    assert.ok(stdout.top_target_ids.includes('external_chat_export_real_sample'));
    assert.equal(existsSync(stdout.feedback_template_path), true);

    const report = readJson(path.join(outputDir, 'read-only-expansion-workpack.json'));
    assert.equal(report.schema_version, 'read_only_expansion_workpack.v1');
    assert.equal(report.feedback_collection.summary.template_only, true);
    assert.equal(report.required_failures.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
