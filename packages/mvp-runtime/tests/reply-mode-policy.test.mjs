import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReplyModePlan,
  classifyRelationshipForReply
} from '../src/index.mjs';

test('classifies relationship from user override before heuristic defaults', () => {
  const classification = classifyRelationshipForReply({
    relationship: { type_code: 'client' },
    goalInput: { initial_goal: '推进商务项目' },
    userOverride: 'romantic_interest'
  });

  assert.equal(classification.relationship_class, 'romantic_interest');
  assert.equal(classification.source, 'user_override');
  assert.equal(classification.needs_user_confirmation, false);
});

test('builds first-person and third-person reply outputs with post-generation safety gates', () => {
  const plan = buildReplyModePlan({
    goalInput: {
      initial_goal: '以恋爱关系推进为目标，保持暧昧但不要让对方有压力。',
      scene: 'social_life_wechat_follow_up',
      context_input: '对方使用短句和玩笑继续接话。'
    },
    relationship: { type_code: 'friend' },
    replyMode: 'third_person_explanation',
    userRelationshipClass: 'romantic_interest',
    sensitiveOptimization: true
  });

  assert.equal(plan.schema_version, 'reply_mode_plan.v1');
  assert.equal(plan.selected_mode, 'third_person_explanation');
  assert.equal(plan.relationship_classification.relationship_class, 'romantic_interest');
  assert.equal(plan.drafts.first_person_as_user.speaks_as_user, true);
  assert.equal(plan.drafts.third_person_explanation.speaks_as_user, false);
  assert.ok(plan.drafts.first_person_as_user.draft.includes('靠近'));
  assert.ok(plan.selected_output.includes('建议回复视角'));
  assert.equal(plan.safety_posture.theoretical_prediction_first, true);
  assert.equal(plan.safety_posture.safety_review_after_generation, true);
  assert.ok(plan.safety_posture.send_safety.some((item) => item.includes('真实发送前必须用户确认')));
});
