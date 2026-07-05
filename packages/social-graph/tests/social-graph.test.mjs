import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildRelationshipContext,
  buildSocialProcessPlan,
  extractEventCandidates
} from '../src/index.mjs';

const graph = JSON.parse(readFileSync('examples/social-graph-snapshot.json', 'utf8'));

test('builds relationship context from graph snapshot', () => {
  const context = buildRelationshipContext({
    graph,
    primaryPersonId: 'person_client_a',
    scene: 'business'
  });

  assert.equal(context.person.display_name, '张总');
  assert.equal(context.relationship.type_code, 'client');
  assert.equal(context.relationship_type.relationship_type, '客户');
  assert.ok(context.strategy_constraints.some((item) => item.includes('过度承诺')));
});

test('builds relationship context for confirmed romantic partner', () => {
  const context = buildRelationshipContext({
    graph: {
      user_id: 'user',
      people: [
        {
          person_id: 'person_xiyan_confirmed',
          display_name: '\u516e\u989c'
        }
      ],
      relationships: [
        {
          relationship_id: 'rel_user_xiyan_romantic_partner',
          from_person_id: 'user',
          to_person_id: 'person_xiyan_confirmed',
          type_code: 'romantic_partner',
          phase: 'confirmed_romantic',
          trust_level: 'medium',
          health_score: 0.72
        }
      ],
      events: []
    },
    primaryPersonId: 'person_xiyan_confirmed',
    scene: 'social'
  });

  assert.equal(context.relationship.type_code, 'romantic_partner');
  assert.equal(context.relationship_type.relationship_type, '\u604b\u7231\u5bf9\u8c61');
  assert.equal(context.relationship_type.default_strategy.default_trust, 'medium');
  assert.ok(context.strategy_constraints.length >= 2);
});

test('extracts event candidates from goal context', () => {
  const candidates = extractEventCandidates({
    text: '客户说预算需要内部确认，技术负责人还没有参与，建议安排一次技术评审会议。',
    participants: ['person_client_a']
  });

  assert.ok(candidates.some((event) => event.event_type_code === 'business_meeting'));
  assert.ok(candidates.some((event) => event.event_type_code === 'payment_transaction'));
});

test('extracts personal relationship signal from intimate teasing context', () => {
  const candidates = extractEventCandidates({
    text: '兮颜说那是不是我男朋友嘛，用户回复现在算吗？',
    participants: ['person_xiyan']
  });

  assert.ok(candidates.some((event) => event.event_type_code === 'personal_relationship_signal'));
});

test('builds a business process plan with risk controls', () => {
  const plan = buildSocialProcessPlan({
    goalInput: {
      initial_goal: '推动客户进入技术评审',
      scene: 'business',
      primary_person_id: 'person_client_a',
      target_person_ids: ['person_client_a'],
      context_input: '客户说预算需要内部确认，技术负责人还没有参与。',
      preferred_channel: 'wechat'
    },
    graph
  });

  assert.equal(plan.scene, 'business');
  assert.equal(plan.relationship_summary.relationship_type, '客户');
  assert.ok(plan.steps.length >= 3);
  assert.equal(plan.confirmation_required, true);
  assert.ok(plan.risk_controls.includes('不自动发送消息'));
});
