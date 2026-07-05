import { readFileSync } from 'node:fs';
import { runCommunicationWorkflow } from '../packages/agent-runtime/src/index.mjs';

const socialGraph = JSON.parse(readFileSync('examples/social-graph-snapshot.json', 'utf8'));

const output = await runCommunicationWorkflow({
  user_role: '销售负责人',
  audience_role: '客户采购负责人',
  final_goal: '推动客户进入技术评审',
  current_goal: '确认下周 30 分钟技术评审时间',
  channel: '微信',
  tone_preference: '专业、强一点但不要冒犯',
  context_input: '客户说预算需要内部确认，技术负责人还没有参与，希望先内部再看看。',
  social_goal: {
    initial_goal: '推动客户进入技术评审',
    scene: 'business',
    primary_person_id: 'person_client_a',
    target_person_ids: ['person_client_a', 'person_tech_lead'],
    context_input: '客户说预算需要内部确认，技术负责人还没有参与，希望先内部再看看。',
    preferred_channel: 'wechat',
    user_constraints: ['不要强压', '不要过度承诺']
  },
  social_graph: socialGraph
});

console.log(JSON.stringify({
  run_id: output.run_id,
  relationship_context: output.strategy_card.social_graph_context,
  process_next_step: output.strategy_card.process_plan_next_step,
  avoid: output.strategy_card.avoid,
  draft: output.draft_versions.best,
  event_candidates: output.social_graph_context.event_context.candidate_events.map((event) => ({
    event_type_code: event.event_type_code,
    event_level: event.event_level,
    confidence: event.confidence
  }))
}, null, 2));
