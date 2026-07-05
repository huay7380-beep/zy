import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildPossibilityBranchAnalysis,
  writePossibilityBranchAnalysis
} from '../src/index.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-possibility-branch-'));
}

function complexObservation() {
  return {
    observation_id: 'obs_complex_zhou_b2b_001',
    source_adapter_id: 'sightflow_desktop.wechat',
    source_type: 'desktop',
    platform: 'wechat',
    captured_at: '2026-06-18T09:30:00+08:00',
    thread_hint: {
      thread_id: 'wechat-thread-zhou-project',
      conversation_title: '周总 项目沟通'
    },
    participants_hint: ['user', '周总', '李工', '王姐'],
    content_text: '刚才周总在群里说预算她能帮忙推进，但她同时是甲方采购负责人、也是我们老同学介绍来的朋友。她提到李工担心接口改造会拖到下周，财务那边要王姐看合同条款。周总又说如果我们先给合规材料，她可以约技术会；不过她私下提醒别把价格发群里，先发她个人微信。',
    content_summary: '周总同时呈现采购负责人、预算推进人和私下朋友身份，并牵出接口延期、合同条款、合规材料、技术会和价格沟通渠道。',
    confidence: 0.88,
    raw_artifact_refs: ['screenshot:wechat-thread-zhou-project']
  };
}

function b2bGoal() {
  return {
    goal_id: 'goal_followup_zhou_project',
    scene: 'b2b_followup',
    objective: '判断下一步如何跟进周总，同时保留她多重身份、多个关联人物、多个事件和嵌套事件的可能性。',
    target_person_hint: '周总',
    priority_keywords: ['预算', '合规材料', '技术会', '合同', '价格', '接口']
  };
}

test('builds an independent branch for multi-identity and nested event reasoning', () => {
  const analysis = buildPossibilityBranchAnalysis({
    observation: complexObservation(),
    goal: b2bGoal(),
    branchId: 'possibility_branch_test_complex'
  });

  assert.equal(analysis.schema_version, 'possibility_branch_analysis.v1');
  assert.equal(analysis.branch_boundary.main_graph_write_attempted, false);
  assert.ok(analysis.branch_boundary.prohibited_write_paths.includes('data/people/**'));
  assert.ok(analysis.branch_boundary.prohibited_write_paths.includes('data/events/**'));
  assert.equal(analysis.validation.real_send_attempted, false);
  assert.deepEqual(analysis.validation.required_failures, []);

  const zhou = analysis.identity_hypotheses.find((identity) => identity.display_name === '周总');
  assert.ok(zhou);
  assert.ok(zhou.possible_identity_bindings.length >= 4);
  assert.ok(zhou.possible_identity_bindings.some((binding) => binding.role === 'procurement_owner'));
  assert.ok(zhou.possible_identity_bindings.some((binding) => binding.role === 'referral_friend'));
  assert.ok(zhou.possible_identity_bindings.some((binding) => binding.role === 'private_channel_advisor'));
  assert.equal(zhou.possible_identity_bindings.some((binding) => binding.role === 'technical_reviewer'), false);

  const li = analysis.identity_hypotheses.find((identity) => identity.display_name === '李工');
  assert.ok(li);
  assert.ok(li.possible_identity_bindings.some((binding) => binding.role === 'technical_reviewer'));

  assert.ok(analysis.event_hypotheses.length >= 5);
  assert.ok(analysis.event_hypotheses.some((event) => event.event_type_code === 'technical_integration_delay_risk'));
  assert.ok(analysis.event_hypotheses.some((event) => event.event_type_code === 'contract_clause_review'));
  assert.ok(analysis.event_hypotheses.some((event) => event.participants.length >= 2));
  assert.ok(analysis.event_hypotheses.some((event) => event.parent_event_hypothesis_id));
  assert.ok(analysis.branch_weight_matrix.identity_event_edges.some((edge) => edge.read_order === 'primary_context'));
  assert.ok(analysis.retrieval_plan.read_sets.some((readSet) =>
    readSet.scope === 'data/people/** and data/events/**' && readSet.mode === 'read_only'
  ));
  assert.ok(analysis.retrieval_plan.write_sets.some((writeSet) =>
    writeSet.scope === 'data/people/** and data/events/**'
    && writeSet.mode === 'blocked_without_user_confirmation'
  ));
});

test('writes branch artifacts without creating main graph people or event stores', () => {
  const root = tempRoot();
  try {
    const analysis = buildPossibilityBranchAnalysis({
      observation: complexObservation(),
      goal: b2bGoal(),
      branchId: 'possibility_branch_test_write'
    });
    const written = writePossibilityBranchAnalysis({
      analysis,
      outputDir: path.join(root, 'runtime/possibility-branches', analysis.branch_id)
    });

    assert.ok(existsSync(written.json_path));
    assert.ok(existsSync(written.markdown_path));
    assert.equal(existsSync(path.join(root, 'data/people')), false);
    assert.equal(existsSync(path.join(root, 'data/events')), false);
    assert.equal(existsSync(path.join(root, 'data/indexes')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
