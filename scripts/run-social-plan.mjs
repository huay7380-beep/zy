import { readFileSync } from 'node:fs';
import { buildSocialProcessPlan } from '../packages/social-graph/src/index.mjs';

const graph = JSON.parse(readFileSync('examples/social-graph-snapshot.json', 'utf8'));

const plan = buildSocialProcessPlan({
  goalInput: {
    initial_goal: '推动客户进入技术评审',
    scene: 'business',
    primary_person_id: 'person_client_a',
    target_person_ids: ['person_client_a', 'person_tech_lead'],
    context_input: '客户说预算需要内部确认，技术负责人还没有参与，希望先内部再看看。',
    preferred_channel: 'wechat',
    user_constraints: ['不要强压', '不要过度承诺']
  },
  graph
});

console.log(JSON.stringify({
  plan_id: plan.plan_id,
  scene: plan.scene,
  relationship: plan.relationship_summary,
  candidate_events: plan.event_summary.candidate_events.map((event) => ({
    event_type_code: event.event_type_code,
    event_level: event.event_level,
    confidence: event.confidence
  })),
  steps: plan.steps,
  risk_controls: plan.risk_controls
}, null, 2));
