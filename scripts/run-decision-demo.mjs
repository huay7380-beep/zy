import { readFileSync } from 'node:fs';
import {
  buildDecisionRecommendation,
  calculateFeedbackROI
} from '../packages/decision-cluster/src/index.mjs';

const socialGraph = JSON.parse(readFileSync('examples/social-graph-snapshot.json', 'utf8'));

const decision = buildDecisionRecommendation({
  goalInput: {
    initial_goal: '推动客户进入技术评审，同时避免让对方觉得被强压',
    scene: 'business',
    primary_person_id: 'person_client_a',
    target_person_ids: ['person_client_a', 'person_tech_lead'],
    context_input: '客户说预算需要内部确认，技术负责人还没有参与，希望先内部再看看。',
    preferred_channel: 'wechat',
    user_constraints: ['不要强压', '不要过度承诺']
  },
  socialGraph,
  userPreferences: {
    risk_tolerance: 'low',
    budget_sensitivity: 'medium',
    relationship_priority: 'high',
    goal_urgency: 'medium',
    automation_comfort: 'low',
    preferred_channels: ['wechat'],
    disliked_actions: ['strong_pressure']
  }
});

const roi = calculateFeedbackROI({
  decision_id: decision.decision_id,
  option_id: decision.recommended_option.option_id,
  outcome: {
    executed: true,
    reply_received: true,
    goal_progress: 0.7,
    relationship_change: 0.2,
    cost: 0,
    user_rating: 4
  }
});

console.log(JSON.stringify({
  decision_id: decision.decision_id,
  recommended_option: {
    option_id: decision.recommended_option.option_id,
    title: decision.recommended_option.title,
    weighted_score: decision.recommended_option.weighted_score,
    scores: decision.recommended_option.scores
  },
  weights: decision.weights,
  agent_opinions: decision.agent_opinions,
  skill_plan: decision.skill_plan,
  evidence_pack: decision.evidence_pack,
  feedback_plan: decision.feedback_plan,
  roi_example: roi
}, null, 2));
