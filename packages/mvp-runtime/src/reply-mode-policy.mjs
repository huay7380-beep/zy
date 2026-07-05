function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function normalizeRelationshipClass(value) {
  const allowed = new Set([
    'business_client',
    'colleague',
    'friend',
    'romantic_interest',
    'family',
    'unknown'
  ]);
  return allowed.has(value) ? value : 'unknown';
}

export function classifyRelationshipForReply({
  relationship = null,
  goalInput = {},
  userOverride = null
} = {}) {
  if (userOverride && userOverride !== 'unset') {
    return {
      relationship_class: normalizeRelationshipClass(userOverride),
      source: 'user_override',
      confidence: 1,
      needs_user_confirmation: false,
      rationale: ['操作者在 GUI 中显式选择人物分类，优先于系统候选识别。']
    };
  }

  const typeCode = relationship?.type_code ?? '';
  const goalText = `${goalInput.initial_goal ?? ''}\n${goalInput.scene ?? ''}\n${goalInput.context_input ?? ''}`;
  const rationale = [];
  let relationshipClass = 'unknown';
  let confidence = 0.35;

  if (/client|customer|business|sales|商务|客户|成交|采购/u.test(typeCode) || containsAny(goalText, ['客户', '商务', '成交', '采购'])) {
    relationshipClass = 'business_client';
    confidence = 0.72;
    rationale.push('关系 type_code 或目标语义包含商务/客户线索。');
  } else if (/colleague|coworker|同事|协作/u.test(typeCode) || containsAny(goalText, ['同事', '协作', '项目'])) {
    relationshipClass = 'colleague';
    confidence = 0.68;
    rationale.push('关系 type_code 或目标语义包含协作/项目线索。');
  } else if (/friend|朋友/u.test(typeCode) || containsAny(goalText, ['朋友', '日常', '维护关系'])) {
    relationshipClass = 'friend';
    confidence = 0.62;
    rationale.push('关系 type_code 或目标语义包含朋友/日常维护线索。');
  } else if (/romantic|date|恋爱|暧昧|好感/u.test(typeCode) || containsAny(goalText, ['恋爱', '好感', '暧昧', '亲密'])) {
    relationshipClass = 'romantic_interest';
    confidence = 0.58;
    rationale.push('目标语义包含恋爱、好感、亲密或暧昧线索，但仍需操作者确认。');
  }

  if (rationale.length === 0) {
    rationale.push('缺少足够的关系 type_code 或目标线索，不能自动确认人物分类。');
  }

  return {
    relationship_class: relationshipClass,
    source: relationshipClass === 'unknown' ? 'insufficient_evidence' : 'heuristic_candidate',
    confidence,
    needs_user_confirmation: relationshipClass === 'unknown' || confidence < 0.7,
    rationale
  };
}

function romanticDraft({ sensitiveOptimization }) {
  if (sensitiveOptimization) {
    return '我确实有点想靠近你，但不想让你有压力。你愿意的时候，我们就顺着刚才的感觉慢慢聊。';
  }
  return '我挺在意你的感受，也想继续了解你。你愿意的话，我们慢慢聊。';
}

function fallbackFirstPersonDraft({ relationshipClass, goalInput, sensitiveOptimization }) {
  if (relationshipClass === 'romantic_interest') return romanticDraft({ sensitiveOptimization });
  if (containsAny(goalInput.initial_goal ?? '', ['修复', '道歉', '缓和'])) {
    return '刚才这件事我先不急着辩解。我想先把你的感受和事实分清楚，再看我们怎么把后面处理好。';
  }
  if (relationshipClass === 'business_client') {
    return '我先按低承诺方式把重点整理一下，不把话说满。你看这个方向是否合适，合适的话我再继续推进下一步。';
  }
  return '我先回应你的重点，再给一个不增加压力的小下一步。你看这样是否合适。';
}

function thirdPersonExplanation({ relationshipClass, firstPersonDraft, classification }) {
  return [
    `建议回复视角：${relationshipClass === 'romantic_interest' ? '亲密关系候选' : relationshipClass}。`,
    `可用草稿：${firstPersonDraft}`,
    `判断依据：${classification.rationale.join('；')}`,
    '发送前应由用户确认目标对象、关系分类、语气边界和是否允许进入受控发送。'
  ].join('\n');
}

export function buildReplyModePlan({
  goalInput = {},
  relationship = null,
  messageDraft = null,
  replyMode = 'auto',
  userRelationshipClass = null,
  sensitiveOptimization = false
} = {}) {
  const classification = classifyRelationshipForReply({
    relationship,
    goalInput,
    userOverride: userRelationshipClass
  });
  const relationshipClass = classification.relationship_class;
  const existingDraft = typeof messageDraft?.draft === 'string' && messageDraft.draft.trim()
    ? messageDraft.draft.trim()
    : null;
  const firstPersonDraft = existingDraft
    ?? fallbackFirstPersonDraft({ relationshipClass, goalInput, sensitiveOptimization });
  const explanation = thirdPersonExplanation({
    relationshipClass,
    firstPersonDraft,
    classification
  });

  const selectedMode = replyMode === 'third_person_explanation'
    ? 'third_person_explanation'
    : replyMode === 'first_person_as_user'
      ? 'first_person_as_user'
      : 'first_person_as_user';

  return {
    schema_version: 'reply_mode_plan.v1',
    selected_mode: selectedMode,
    relationship_classification: classification,
    drafts: {
      first_person_as_user: {
        mode: 'first_person_as_user',
        draft: firstPersonDraft,
        speaks_as_user: true,
        must_confirm_before_send: true
      },
      third_person_explanation: {
        mode: 'third_person_explanation',
        draft: explanation,
        speaks_as_user: false,
        must_confirm_before_send: false
      }
    },
    selected_output: selectedMode === 'third_person_explanation' ? explanation : firstPersonDraft,
    safety_posture: {
      theoretical_prediction_first: true,
      safety_review_after_generation: true,
      storage_safety: [
        '敏感原文优先摘要化或本地加密保存。',
        '身份线索与截图证据保留路径、哈希和审计 id，避免复制到不必要的运行报告。',
        '关系分类低置信时只保存候选，不写成确认事实。'
      ],
      send_safety: [
        '真实发送前必须用户确认目标对象、窗口、会话、草稿和权限。',
        'SendCommand 需要 message_draft_sha256 与准备阶段一致。',
        '未完成受控发送验收前，GUI 只能生成材料或预览，不直接发送。'
      ]
    }
  };
}
