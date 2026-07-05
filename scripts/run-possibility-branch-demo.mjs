#!/usr/bin/env node
import path from 'node:path';
import {
  buildPossibilityBranchAnalysis,
  writePossibilityBranchAnalysis
} from '../packages/possibility-branch/src/index.mjs';

const observation = {
  observation_id: 'obs_complex_zhou_b2b_demo',
  source_adapter_id: 'sightflow_desktop.wechat',
  source_type: 'desktop',
  platform: 'wechat',
  captured_at: '2026-06-18T09:30:00+08:00',
  thread_hint: {
    thread_id: 'wechat-thread-zhou-project-demo',
    conversation_title: '周总 项目沟通'
  },
  participants_hint: ['user', '周总', '李工', '王姐'],
  content_text: '刚才周总在群里说预算她能帮忙推进，但她同时是甲方采购负责人、也是我们老同学介绍来的朋友。她提到李工担心接口改造会拖到下周，财务那边要王姐看合同条款。周总又说如果我们先给合规材料，她可以约技术会；不过她私下提醒别把价格发群里，先发她个人微信。',
  content_summary: '周总同时呈现采购负责人、预算推进人和私下朋友身份，并牵出接口延期、合同条款、合规材料、技术会和价格沟通渠道。',
  confidence: 0.88,
  raw_artifact_refs: ['screenshot:wechat-thread-zhou-project-demo']
};

const goal = {
  goal_id: 'goal_followup_zhou_project_demo',
  scene: 'b2b_followup',
  objective: '判断下一步如何跟进周总，同时保留她多重身份、多个关联人物、多个事件和嵌套事件的可能性。',
  target_person_hint: '周总',
  priority_keywords: ['预算', '合规材料', '技术会', '合同', '价格', '接口']
};

const analysis = buildPossibilityBranchAnalysis({
  observation,
  goal,
  branchId: 'possibility_branch_demo_zhou_complex'
});
const written = writePossibilityBranchAnalysis({
  analysis,
  outputDir: path.resolve('runtime/possibility-branches', analysis.branch_id)
});

console.log(JSON.stringify({
  command: 'run-possibility-branch-demo',
  branch_id: analysis.branch_id,
  gate_decision: analysis.validation.gate_decision,
  required_failures: analysis.validation.required_failures,
  identity_hypothesis_count: analysis.identity_hypotheses.length,
  event_hypothesis_count: analysis.event_hypotheses.length,
  primary_context_edge_count: analysis.branch_weight_matrix.identity_event_edges
    .filter((edge) => edge.read_order === 'primary_context').length,
  main_graph_write_attempted: analysis.branch_boundary.main_graph_write_attempted,
  real_send_attempted: analysis.validation.real_send_attempted,
  json_path: written.json_path,
  markdown_path: written.markdown_path,
  next_step: 'Review the branch artifact, then promote only user-confirmed candidates or events through the existing identity/event workflows.'
}, null, 2));

