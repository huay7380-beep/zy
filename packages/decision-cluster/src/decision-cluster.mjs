import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSocialProcessPlan,
  extractEventCandidates
} from '../../social-graph/src/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function projectRoot() {
  return path.resolve(here, '../../..');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function createRuntimeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function loadDecisionKnowledge(root = projectRoot()) {
  return {
    criteria: readJson(path.join(root, 'knowledge/decision-cluster/decision-criteria.json')),
    agents: readJson(path.join(root, 'knowledge/decision-cluster/agent-cluster.json')),
    skills: readJson(path.join(root, 'knowledge/skills/skill-registry.json'))
  };
}

function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, Number((value / total).toFixed(4))])
  );
}

export function adjustWeights(userPreferences = {}, knowledge = loadDecisionKnowledge()) {
  const weights = Object.fromEntries(
    knowledge.criteria.criteria.map((item) => [item.key, item.default_weight])
  );
  const adjustments = knowledge.criteria.preference_adjustments ?? {};

  for (const [prefKey, prefValue] of Object.entries(userPreferences)) {
    const adjustment = adjustments[`${prefKey}.${prefValue}`];
    if (!adjustment) continue;
    for (const [criterion, delta] of Object.entries(adjustment)) {
      weights[criterion] = (weights[criterion] ?? 0) + delta;
    }
  }

  return normalizeWeights(weights);
}

function findSkill(knowledge, skillId) {
  return knowledge.skills.skills.find((skill) => skill.skill_id === skillId) ?? null;
}

function hasEvent(eventCandidates, code) {
  return eventCandidates.some((event) => event.event_type_code === code);
}

function hasRecentEvent(plan, code) {
  return plan.event_summary.recent_events.some((event) => event.event_type_code === code);
}

function containsPersonalRelationshipSignal(text = '') {
  return /亲爱的|男朋友|女朋友|对象|暧昧|恋爱|情侣|试用期|转正|现在算|男友|女友|喜欢你|想你|抱抱|亲亲|捏捏|不拧巴|boyfriend|girlfriend|dating|flirt/i
    .test(text);
}

const personalSocialRelationshipTypes = new Set([
  'acquaintance',
  'friend',
  'normal_friend',
  'romantic',
  'romantic_partner',
  'romantic_interest',
  'lover',
  'partner',
  'boyfriend',
  'girlfriend',
  'family'
]);

function isConfirmedRomanticRelationship(plan) {
  const relationshipType = String(
    plan.relationship_summary.type_code ?? plan.relationship_summary.relationship_type ?? ''
  ).toLowerCase();
  const phase = String(plan.relationship_summary.phase ?? '').toLowerCase();
  return ['romantic_partner', 'romantic', 'lover', 'partner', 'boyfriend', 'girlfriend'].includes(relationshipType)
    || phase === 'confirmed_romantic';
}

function isPersonalSocialContext(goalInput, plan) {
  const scene = String(goalInput.scene ?? plan.scene ?? '').toLowerCase();
  const relationshipType = String(
    plan.relationship_summary.type_code ?? plan.relationship_summary.relationship_type ?? ''
  ).toLowerCase();
  const text = `${goalInput.initial_goal ?? ''}\n${goalInput.context_input ?? ''}`;
  if (isConfirmedRomanticRelationship(plan)) return true;
  if (scene === 'personal_social') return true;
  return ['social', 'family', 'mixed'].includes(scene)
    && (
      containsPersonalRelationshipSignal(text)
      || personalSocialRelationshipTypes.has(relationshipType)
    );
}

function inferGoalCategory(goalInput) {
  const goal = goalInput.initial_goal ?? '';
  const text = `${goal}\n${goalInput.context_input ?? ''}`;
  if (
    goalInput.scene === 'personal_social'
    || containsPersonalRelationshipSignal(text)
    || goal.includes('私人社交')
    || goal.includes('亲密调侃')
  ) return 'personal_social';
  if (goal.includes('修复') || goal.includes('道歉') || goal.includes('缓和')) return 'repair';
  if (goal.includes('评审') || goal.includes('会议') || goal.includes('推进')) return 'advance';
  if (goal.includes('好感') || goal.includes('维护') || goal.includes('感谢')) return 'maintain';
  if (goal.includes('签约') || goal.includes('购买') || goal.includes('成交')) return 'commercial_close';
  return 'general';
}

function inferNamedStakeholder(text = '') {
  const genericRole = /客户|技术|业务|采购|财务|项目|内部|对方|目标|相关|主要/u;
  const normalize = (value) => value.replace(/^[我你他她给让请和与先把]+/u, '');
  const namedTitles = [...text.matchAll(/[一-龥]{1,3}(?:总|工|经理|老师|主任)/gu)]
    .map((match) => normalize(match[0]))
    .filter((value) => value.length >= 2 && !genericRole.test(value));
  if (namedTitles.length) return namedTitles[0];

  const responsibleTitles = [...text.matchAll(/[一-龥]{1,3}负责人/gu)]
    .map((match) => normalize(match[0]))
    .filter((value) => value.length >= 2 && !genericRole.test(value));
  return responsibleTitles[0] ?? null;
}

function inferMessageFocus(goalInput) {
  const text = `${goalInput.initial_goal ?? ''}\n${goalInput.context_input ?? ''}`;
  const focus = [];
  if (text.includes('接口')) focus.push('接口覆盖');
  if (text.includes('部署') || text.includes('风险')) focus.push('部署风险');
  if (text.includes('预算') || text.includes('报价') || text.includes('价格')) focus.push('不提前做报价承诺');
  if (text.includes('评审')) focus.push('轻量评审');
  if (text.includes('下周') || text.includes('时间')) focus.push('时间确认');
  return unique(focus).slice(0, 4);
}

function hasAnyTextSignal(text, signals) {
  return signals.some((signal) => {
    if (signal instanceof RegExp) return signal.test(text);
    return text.includes(signal);
  });
}

function buildIntimateRelationshipPlaybook(goalInput, plan) {
  const goalText = goalInput.initial_goal ?? '';
  const contextText = goalInput.context_input ?? '';
  const text = `${goalText}\n${contextText}`;
  const relationshipEvidenceText = contextText || text;
  const inputRelationshipLabels = [
    ...(Array.isArray(goalInput.identity_labels) ? goalInput.identity_labels : []),
    ...(Array.isArray(goalInput.relationship_identity_labels) ? goalInput.relationship_identity_labels : [])
  ].map((label) => String(label).toLowerCase());
  const confirmedByInputLabels = inputRelationshipLabels.some((label) =>
    ['romantic_partner', 'romantic', 'lover', 'partner', 'boyfriend', 'girlfriend', 'confirmed_romantic']
      .includes(label)
  );
  const candidateByInputLabels = inputRelationshipLabels.some((label) =>
    ['romantic_interest', 'candidate_romantic_interest', 'intimate_relationship_candidate']
      .includes(label)
  );
  const confirmedRomanticRelationship = isConfirmedRomanticRelationship(plan) || confirmedByInputLabels;
  const playfulRelationshipCheck = containsPersonalRelationshipSignal(text) || candidateByInputLabels;
  const signals = {
    playful_affection: hasAnyTextSignal(relationshipEvidenceText, [
      '捏捏',
      '抱抱',
      '亲亲',
      '不拧巴',
      '哈哈',
      '哼',
      '撒娇',
      '想你'
    ]),
    relationship_probe: hasAnyTextSignal(relationshipEvidenceText, [
      '男朋友',
      '女朋友',
      '对象',
      '现在算',
      '试用期',
      '转正',
      '关系',
      /boyfriend|girlfriend|dating/i
    ]),
    repair_or_tension: hasAnyTextSignal(relationshipEvidenceText, [
      '对不起',
      '抱歉',
      '生气',
      '难受',
      '误会',
      '不舒服',
      '冷战',
      '委屈',
      '别扭'
    ]),
    boundary_pressure: hasAnyTextSignal(relationshipEvidenceText, [
      '冒犯',
      '压力',
      '过了',
      '别这样',
      '拒绝',
      '边界',
      '越界',
      '开黄腔'
    ])
  };
  const relationshipStage = confirmedRomanticRelationship
    ? 'confirmed_romantic_partner'
    : playfulRelationshipCheck
      ? 'candidate_intimate_relationship'
      : 'general_personal_social';
  const contextStage = signals.boundary_pressure
    ? 'boundary_review'
    : signals.repair_or_tension
      ? 'repair_or_tension'
      : signals.relationship_probe && !confirmedRomanticRelationship
        ? 'relationship_definition_probe'
        : signals.playful_affection
          ? 'light_affection_play'
          : text.trim().length <= 28
            ? 'short_context_collecting'
            : 'warm_everyday_continuation';
  const interactionStyle = contextStage === 'repair_or_tension'
    ? 'repair_first'
    : contextStage === 'boundary_review'
      ? 'soft_boundary_first'
      : signals.relationship_probe && !confirmedRomanticRelationship
        ? 'playful_definition_probe'
        : signals.playful_affection
          ? 'playful_teasing_and_affection'
          : 'warm_low_pressure_chat';
  const toneStrategy = contextStage === 'repair_or_tension'
    ? 'slow_repair_responsibility'
    : contextStage === 'boundary_review'
      ? 'gentle_boundary_and_autonomy'
      : confirmedRomanticRelationship && signals.playful_affection
        ? 'warm_affection_with_low_pressure'
        : signals.relationship_probe
          ? 'playful_low_commitment_clarification'
          : 'warm_context_collecting';

  const templates = {
    confirmed_playful_affection: {
      template_id: 'confirmed_playful_affection',
      draft: '那我接住这个捏捏，今天先不拧巴，认真陪你聊一会儿。',
      rationale: '主身份已确认是恋爱对象，先承接亲密玩笑和当前热度，用微推进建立舒适感，不把最终目标直接压进这一句。'
    },
    candidate_relationship_probe: {
      template_id: 'candidate_relationship_probe',
      draft: '那我先认真申请一个试用期，表现好再转正，可以吗？',
      rationale: '关系仍是候选或试探阶段，用玩笑式低承诺回应，不替双方直接下结论。'
    },
    repair_or_tension: {
      template_id: 'repair_or_tension',
      draft: '我先不急着解释，刚才让你不舒服的地方我接住。我们慢慢说，我会认真听。',
      rationale: '出现不适或冲突信号时，优先降速、承认感受、保留修复空间。'
    },
    boundary_review: {
      template_id: 'boundary_review',
      draft: '我接住这个玩笑，但不把话说过头；你舒服的节奏最重要。',
      rationale: '边界或压力信号优先于亲密推进，回复应保护对方自主和舒适度。'
    },
    confirmed_warm_presence: {
      template_id: 'confirmed_warm_presence',
      draft: '我挺在意你的感受，今天我先认真陪你聊，等你舒服的时候我们再把见面的事慢慢安排。',
      rationale: '已确认恋人但当前上下文不足时，不停留在观察，而是先给出陪伴和见面方向的软推进，等待对方舒适反馈。'
    },
    general_warm_collecting: {
      template_id: 'general_warm_collecting',
      draft: '我接住啦，我们先轻松聊着，不急着把话说重。',
      rationale: '私人社交上下文不足时，先轻量承接并继续观察。'
    }
  };
  const selectedTemplate = contextStage === 'boundary_review'
    ? templates.boundary_review
    : contextStage === 'repair_or_tension'
      ? templates.repair_or_tension
      : confirmedRomanticRelationship && signals.playful_affection
        ? templates.confirmed_playful_affection
        : !confirmedRomanticRelationship && signals.relationship_probe
          ? templates.candidate_relationship_probe
          : confirmedRomanticRelationship
          ? templates.confirmed_warm_presence
            : templates.general_warm_collecting;
  const dialogueIntentByTemplate = {
    confirmed_playful_affection: {
      dialogue_act: 'warm_affection_micro_progression',
      intent: '承接对方亲密调侃，并把关系热度提高一个很小、可回退的梯度。',
      stage_delta: 'R2 -> R2_plus',
      heat_delta: 1,
      comfort_guard: '不要求对方立即承诺，不把下一阶段身体亲密写进默认句。',
      expected_signal: '对方继续玩笑、表达轻松、延续话题或主动给出靠近信号。',
      fallback: '如果对方降温或回避，切回陪伴、修复或边界优先。'
    },
    candidate_relationship_probe: {
      dialogue_act: 'playful_relationship_definition_probe',
      intent: '用低承诺玩笑试探关系定义意愿，不把候选身份写成事实。',
      stage_delta: 'R1 -> R1_plus',
      heat_delta: 1,
      comfort_guard: '保留玩笑退路，避免单方面宣布关系。',
      expected_signal: '对方接梗、澄清关系期待或继续轻松互动。',
      fallback: '若对方回避关系定义，回到普通轻松聊天。'
    },
    repair_or_tension: {
      dialogue_act: 'repair_acknowledgement',
      intent: '承认对方不适并恢复安全感，暂停推进。',
      stage_delta: 'hold_or_step_down',
      heat_delta: -1,
      comfort_guard: '优先接住感受，不争辩、不用玩笑覆盖不适。',
      expected_signal: '对方愿意继续说明感受或关系恢复平稳。',
      fallback: '若对方仍不适，继续降速并请求具体边界。'
    },
    boundary_review: {
      dialogue_act: 'boundary_respect',
      intent: '保护边界和自主感，阻断越界升级。',
      stage_delta: 'hold',
      heat_delta: -1,
      comfort_guard: '明确舒服节奏优先，停止任何让对方有压力的推进。',
      expected_signal: '对方表达舒适边界或愿意继续轻松交流。',
      fallback: '若对方拒绝或沉默，停止推进并等待对方重新打开话题。'
    },
    confirmed_warm_presence: {
      dialogue_act: 'warm_presence_soft_invitation',
      intent: '在上下文不足时主动表达陪伴和未来见面方向，但不强行升级亲密。',
      stage_delta: 'R2 -> R2_plus',
      heat_delta: 1,
      comfort_guard: '把“见面”作为方向而非要求，让对方舒适度决定节奏。',
      expected_signal: '对方接受陪伴、继续聊天或回应见面安排。',
      fallback: '若对方没有接住，保持陪伴，不追加压力。'
    },
    general_warm_collecting: {
      dialogue_act: 'warm_context_holding',
      intent: '上下文不足时保持温和连接，继续收集关系信号。',
      stage_delta: 'R0_or_R1_hold',
      heat_delta: 0,
      comfort_guard: '不替双方定义关系，也不把单句推断成长期事实。',
      expected_signal: '对方给出更多语气、意图或关系信息。',
      fallback: '如果仍无上下文，提示用户采集更多消息。'
    }
  };
  const dialogueIntentContract = {
    schema_version: 'dialogue_intent_contract.v1',
    output_perspective: 'user_first_person_draft',
    selected_template_id: selectedTemplate.template_id,
    ...dialogueIntentByTemplate[selectedTemplate.template_id],
    not_sent_to_target: false,
    target_visible_text_only: selectedTemplate.draft
  };
  const progressionContract = {
    schema_version: 'romantic_relationship_progression_contract.v1',
    final_goal_state: 'R6_physical_intimacy_confirmed_relationship_goal_state',
    final_goal_interpretation: 'relationship_goal_state_not_automatic_send_or_forced_kpi',
    current_turn_goal: contextStage === 'repair_or_tension'
      ? 'repair_trust_before_progression'
      : contextStage === 'boundary_review'
        ? 'protect_boundary_before_progression'
        : confirmedRomanticRelationship
          ? 'advance_one_reversible_step_toward_offline_or_affection_context'
          : 'clarify_candidate_relationship_interest',
    active_progression_allowed: contextStage !== 'repair_or_tension' && contextStage !== 'boundary_review',
    next_step_recommendations: confirmedRomanticRelationship
      ? [
          'give_one_stage_bounded_micro_progression',
          'choose_soft_invitation_or_closeness_check_by_heat',
          'ask_for_comfort_or_preference_in_plain_language_when_next_step_touches_body',
          'record_target_response_as_next_stage_evidence'
        ]
      : [
          'confirm_identity_and_relationship_interest',
          'use_light_probe_before_writing_confirmed_relationship_fact'
        ],
    blocked_actions: [
      'stage_skip_to_R6_from_single_turn',
      'pressure_guilt_or_threat_based_progression',
      'unconsented_physical_intimacy_claim',
      'send_internal_goal_or_stage_analysis_to_target'
    ]
  };

  return {
    schema_version: 'intimate_relationship_reply_playbook.v1',
    playbook_id: 'intimate_relationship_reply_playbook.v1',
    selected_template_id: selectedTemplate.template_id,
    relationship_context_status: relationshipStage,
    relationship_stage: relationshipStage,
    context_stage: contextStage,
    interaction_style: interactionStyle,
    tone_strategy: toneStrategy,
    selected_draft: selectedTemplate.draft,
    selected_template_rationale: selectedTemplate.rationale,
    relationship_goal_contract: progressionContract,
    dialogue_intent_contract: dialogueIntentContract,
    current_turn_goal: progressionContract.current_turn_goal,
    next_step_recommendations: progressionContract.next_step_recommendations,
    dynamic_context_basis: {
      primary_identity_status: confirmedRomanticRelationship ? 'confirmed_by_user_or_graph' : 'candidate_or_inferred',
      primary_identity_priority: confirmedRomanticRelationship ? 'romantic_partner_template_first' : 'relationship_probe_template_first',
      secondary_templates_allowed: ['business', 'friend', 'work', 'family'].map((templateId) => ({
        template_id: templateId,
        usage: 'only_as_secondary_context_modifier_not_primary_template'
      })),
      detected_signals: signals,
      target_context_windows: ['today', 'last_7_days', 'last_30_days', 'historical_stage']
    },
    possible_developments: [
      {
        development_id: 'continue_light_affection',
        when_to_use: '对方继续轻松调侃、亲昵称呼或主动靠近时',
        reply_style: '温暖承接、短句、可玩笑化',
        avoid_when: '对方出现不适、回避、压力或明确拒绝信号'
      },
      {
        development_id: 'clarify_relationship_expectation',
        when_to_use: '对方主动追问关系定义、承诺或排他性时',
        reply_style: '先确认感受，再把定义交给双方共同确认',
        avoid_when: '证据不足或用户并不想推进关系定义时'
      },
      {
        development_id: 'repair_or_deescalate',
        when_to_use: '出现误会、生气、冷淡、委屈或节奏失配时',
        reply_style: '先降速、接住感受、请求继续沟通',
        avoid_when: '用户只想用玩笑压过对方真实不适时'
      },
      {
        development_id: 'set_soft_boundary',
        when_to_use: '出现越界、成人玩笑、隐私或压力信号时',
        reply_style: '承接但不升级，明确舒服节奏优先',
        avoid_when: '对方已经明确要求停止，应直接停止而不是继续试探'
      },
      {
        development_id: 'collect_more_context',
        when_to_use: '只有单句短上下文，无法判断稳定互动风格时',
        reply_style: '轻量回应并等待下一条信号',
        avoid_when: '系统试图从单句推断长期关系事实时'
      }
    ],
    alternative_drafts: [
      {
        style_id: 'warmer',
        draft: confirmedRomanticRelationship
          ? '我接住你这句，也接住你今天的小别扭。慢慢来，我在。'
          : '我有点被你这句逗到了，那我们先轻松聊，不急着定结论。',
        use_when: '想更温柔、更少玩笑时'
      },
      {
        style_id: 'more_playful',
        draft: confirmedRomanticRelationship
          ? '行，那今天给你一个认真版回应，捏捏也盖章接收。'
          : '那我先排队拿个候选号，表现好再升级，可以吗？',
        use_when: '双方连续调侃且没有压力信号时'
      },
      {
        style_id: 'slower_boundary',
        draft: '我想靠近一点，但不想让你有压力。你舒服的时候，我们就慢慢聊。',
        use_when: '对方反应不明、上下文很短或需要降速时'
      },
      {
        style_id: 'higher_heat_closeness_check',
        draft: '那我就认真接住你。下次见面牵着你慢慢聊，可以吗？',
        use_when: '已确认恋人身份，连续多轮高热度、对方主动靠近且没有边界或压力信号时'
      }
    ],
    confirmation_framework: {
      framework_id: 'intimate_relationship_reply_confirmation.v1',
      identity_checks: [
        '确认目标人物身份来自已确认图谱或本轮用户确认，不用临时候选覆盖主身份。',
        '确认主身份若为恋人，则优先套用恋人模板；商务、朋友、工作等只作为次级场景修饰。'
      ],
      context_checks: [
        '分别查看今天、一周内、一个月内和历史阶段性互动，判断语气是否稳定。',
        '检查是否存在冲突、拒绝、边界、隐私或压力信号；这些信号优先级高于亲密推进。'
      ],
      tone_checks: [
        '草稿应低压力、可编辑、可撤回，不制造承诺或替对方定义关系。',
        '如果用户目标是认真确认关系，应切换到清晰确认模板，而不是继续玩笑模板。'
      ],
      send_gate: [
        '真实发送前必须由用户确认目标窗口、草稿文本、平台预览和发送动作。',
        '当前系统只输出草稿和确认清单，不自动发送。'
      ],
      feedback_writeback: [
        '发送后或用户放弃发送后，都要记录对方回应、用户反馈和是否调整关系权重。',
        '若对方降温或不适，后续模板降级到修复或边界优先。'
      ]
    },
    blocked_or_adjust_when: [
      '目标人物身份未确认或窗口对象与图谱对象不一致。',
      '出现拒绝、厌烦、明显不适、越界、隐私或高风险安全信号。',
      '用户要求真实发送但没有完成平台预览和人工确认。',
      '主身份与模板冲突，例如已确认恋人却仍使用商务推进主模板。'
    ]
  };
}

function buildPersonalSocialMessageDraft(goalInput, plan, option) {
  const targetName = plan.relationship_summary.person_name ?? goalInput.primary_person_id ?? null;
  const playbook = buildIntimateRelationshipPlaybook(goalInput, plan);

  return {
    channel: goalInput.preferred_channel ?? 'wechat',
    tone: playbook.tone_strategy,
    target_person_id: goalInput.primary_person_id ?? null,
    target_display_name: targetName,
    draft: playbook.selected_draft,
    relationship_context_status: playbook.relationship_context_status,
    playbook_schema_version: playbook.schema_version,
    playbook_id: playbook.playbook_id,
    selected_template_id: playbook.selected_template_id,
    relationship_stage: playbook.relationship_stage,
    context_stage: playbook.context_stage,
    interaction_style: playbook.interaction_style,
    tone_strategy: playbook.tone_strategy,
    dynamic_context_basis: playbook.dynamic_context_basis,
    relationship_goal_contract: playbook.relationship_goal_contract,
    dialogue_intent_contract: playbook.dialogue_intent_contract,
    current_turn_goal: playbook.current_turn_goal,
    next_step_recommendations: playbook.next_step_recommendations,
    possible_developments: playbook.possible_developments,
    alternative_drafts: playbook.alternative_drafts,
    confirmation_framework: playbook.confirmation_framework,
    blocked_or_adjust_when: playbook.blocked_or_adjust_when,
    editable: true,
    must_confirm_before_send: true,
    evidence_refs: option.evidence_refs,
    rationale: [
      playbook.selected_template_rationale,
      '接住对方的轻松调侃，但不替对方做关系结论。',
      '用可撤回、可玩笑化的表达降低压力，避免把关系推进成单方面承诺。',
      '仍保留人工确认和可编辑草稿，不触发真实发送。'
    ],
    send_before_check: [
      ...playbook.confirmation_framework.identity_checks,
      ...playbook.confirmation_framework.context_checks,
      ...playbook.confirmation_framework.tone_checks,
      ...playbook.confirmation_framework.send_gate
    ]
  };
}

function buildMessageDraft(goalInput, plan, option) {
  if (isPersonalSocialContext(goalInput, plan)) {
    return buildPersonalSocialMessageDraft(goalInput, plan, option);
  }

  const targetName = plan.relationship_summary.person_name ?? '您好';
  const stakeholder = inferNamedStakeholder(goalInput.context_input);
  const focus = inferMessageFocus(goalInput);
  const focusText = focus.length ? focus.join('、') : '目标、风险和下一步';
  const reviewerText = stakeholder && stakeholder !== targetName
    ? `，也方便${stakeholder}先判断是否需要继续看`
    : '';
  const category = inferGoalCategory(goalInput);
  const lowCommitmentClose = category === 'advance'
    ? `您看我先把议程和材料发您确认一下，合适的话再约一个不超过半小时的线上评审？`
    : `您看我先按这个方向整理一版，您方便时确认是否合适？`;
  const draft = `${targetName}，我这边先按低承诺方式准备，不把话说满。这次只聚焦${focusText}${reviewerText}。${lowCommitmentClose}`;

  return {
    channel: goalInput.preferred_channel ?? 'wechat',
    tone: 'low_commitment_specific',
    target_person_id: goalInput.primary_person_id ?? null,
    target_display_name: targetName,
    draft,
    editable: true,
    must_confirm_before_send: true,
    evidence_refs: option.evidence_refs,
    rationale: [
      '保持低承诺，避免在关系探索期制造压力。',
      '把会议或跟进目标限定到可验证的小范围。',
      '明确不提前做报价或最终承诺，降低商业误解风险。'
    ],
    send_before_check: [
      '确认目标对象和平台联系人正确。',
      '确认草稿没有虚假紧迫感、报价承诺或越界信息。',
      '确认用户已经看过证据和触发计划。'
    ]
  };
}

function buildOptions(goalInput, plan, userPreferences) {
  const category = inferGoalCategory(goalInput);
  const candidates = plan.event_summary.candidate_events;
  const relationshipType = plan.relationship_summary.type_code;
  const options = [];

  if (isPersonalSocialContext(goalInput, plan)) {
    const personalOptions = [
      {
        option_id: 'option_personal_social_playful_reply',
        title: '轻松接住调侃',
        description: '用轻松、低压力的方式回应亲密玩笑，保留对方选择空间。',
        action_type: 'message',
        skill_ids: ['communication.message.draft'],
        estimated_cost: 0,
        effort: 0.2,
        directness: 0.42,
        evidence_refs: ['桌面只读截图', '当前对话摘要', '关系阶段候选'],
        best_for: ['personal_social', 'maintain', 'general']
      },
      {
        option_id: 'option_personal_social_soft_boundary',
        title: '温和确认边界',
        description: '在暧昧或玩笑语境中先降低定义压力，避免把关系结论说满。',
        action_type: 'message',
        skill_ids: ['communication.message.draft'],
        estimated_cost: 0,
        effort: 0.25,
        directness: 0.35,
        evidence_refs: ['关系阶段候选', '亲密称呼线索', '用户确认闸门'],
        best_for: ['personal_social', 'repair', 'general']
      },
      {
        option_id: 'option_personal_social_collect_context_first',
        title: '先补充关系上下文',
        description: '当仅有单屏截图时，先补足历史互动、双方关系和用户偏好，再生成更个性化回复。',
        action_type: 'analysis',
        skill_ids: [],
        estimated_cost: 0.05,
        effort: 0.3,
        directness: 0.18,
        evidence_refs: ['身份仍需确认', '历史上下文不足', '单屏截图限制'],
        best_for: ['general', 'personal_social']
      }
    ];

    return personalOptions.map((option) => ({
      ...option,
      context_flags: {
        goal_category: category,
        relationship_type: relationshipType,
        personal_social: true,
        has_budget_event: false,
        has_meeting_event: false,
        disliked: (userPreferences.disliked_actions ?? []).some((action) =>
          option.option_id.includes(action) || option.title.includes(action)
        )
      }
    }));
  }

  options.push({
    option_id: 'option_low_commitment_message',
    title: '发送低承诺沟通消息',
    description: '通过低压力表达推动下一步，不直接要求最终决定。',
    action_type: 'message',
    skill_ids: ['communication.message.draft'],
    estimated_cost: 0,
    effort: 0.25,
    directness: 0.55,
    evidence_refs: ['用户目标', '关系准则', '近期事件线索'],
    best_for: ['advance', 'commercial_close', 'general']
  });

  options.push({
    option_id: 'option_schedule_meeting_path',
    title: '设计见面或会议流程',
    description: '先明确参会人、议题、证据材料和成功标准，再推动邀约。',
    action_type: 'human_process',
    skill_ids: ['human_process.meeting_path', 'communication.message.draft', 'reminder.create'],
    estimated_cost: 0,
    effort: 0.45,
    directness: 0.65,
    evidence_refs: ['目标时间', '参与人', '历史会议事件'],
    best_for: ['advance', 'commercial_close']
  });

  options.push({
    option_id: 'option_gift_roi',
    title: '小礼物或感谢动作 ROI 分析',
    description: '评估低价值、合规、不过度私人化的礼物或感谢动作是否有助于关系维护。',
    action_type: 'human_process',
    skill_ids: ['human_process.gift.roi_analysis'],
    estimated_cost: 0.35,
    effort: 0.5,
    directness: 0.35,
    evidence_refs: ['关系类型', '对方偏好', '近期帮助或维护事件'],
    best_for: ['maintain', 'repair', 'general']
  });

  options.push({
    option_id: 'option_collect_evidence_first',
    title: '先补充证据和线索',
    description: '当事件证据不足或关系判断不稳时，先补充事实，不急于行动。',
    action_type: 'analysis',
    skill_ids: [],
    estimated_cost: 0.1,
    effort: 0.35,
    directness: 0.2,
    evidence_refs: ['缺失事实', '待确认假设'],
    best_for: ['general', 'repair']
  });

  if (hasEvent(candidates, 'conflict') || category === 'repair') {
    options.push({
      option_id: 'option_conflict_repair',
      title: '冲突修复流程',
      description: '先降压、承认感受、澄清事实，再设计可恢复关系的下一步。',
      action_type: 'human_process',
      skill_ids: ['human_process.conflict_repair', 'communication.message.draft'],
      estimated_cost: 0.05,
      effort: 0.55,
      directness: 0.45,
      evidence_refs: ['冲突事件', '敏感话题', '关系阶段'],
      best_for: ['repair']
    });
  }

  if (userPreferences.automation_comfort === 'high') {
    options.push({
      option_id: 'option_platform_send_after_confirmation',
      title: '用户确认后通过平台发送',
      description: '系统准备消息和发送预览，用户确认后再通过外部平台执行。',
      action_type: 'direct_execution',
      skill_ids: ['platform.message.send'],
      estimated_cost: 0,
      effort: 0.15,
      directness: 0.9,
      evidence_refs: ['用户授权', '目标对象确认', '消息预览'],
      best_for: ['advance', 'maintain']
    });
  }

  return options.map((option) => ({
    ...option,
    context_flags: {
      goal_category: category,
      relationship_type: relationshipType,
      has_budget_event: hasEvent(candidates, 'payment_transaction'),
      has_meeting_event: hasEvent(candidates, 'business_meeting') || hasRecentEvent(plan, 'business_meeting'),
      disliked: (userPreferences.disliked_actions ?? []).some((action) =>
        option.option_id.includes(action) || option.title.includes(action)
      )
    }
  }));
}

function criterionScores(option, goalInput, plan, userPreferences) {
  const category = inferGoalCategory(goalInput);
  const candidateCount = plan.event_summary.candidate_events.length;
  const recentCount = plan.event_summary.recent_events.length;
  const health = plan.relationship_summary.health_score ?? 0.5;
  const isBusiness = plan.scene === 'business';
  const disliked = option.context_flags.disliked;
  const highAutomation = option.option_id === 'option_platform_send_after_confirmation';
  const gift = option.option_id === 'option_gift_roi';

  if (option.context_flags.personal_social) {
    const collectContext = option.option_id === 'option_personal_social_collect_context_first';
    const softBoundary = option.option_id === 'option_personal_social_soft_boundary';
    const playfulReply = option.option_id === 'option_personal_social_playful_reply';
    return {
      goal_fit: collectContext ? 0.66 : playfulReply ? 0.96 : option.best_for.includes(category) ? 0.88 : 0.74,
      relationship_fit: playfulReply ? 0.92 : softBoundary ? 0.86 : 0.84,
      event_evidence: clamp(0.45 + candidateCount * 0.12 + recentCount * 0.16),
      norm_compliance: collectContext ? 0.95 : 0.9,
      risk_control: softBoundary || collectContext ? 0.92 : 0.9,
      cost_efficiency: clamp(1 - option.estimated_cost - option.effort * 0.2),
      timing_fit: collectContext ? 0.62 : playfulReply ? 0.88 : 0.8,
      user_preference_fit: disliked ? 0.2 : 0.8,
      feedback_observability: option.skill_ids.length ? 0.78 : 0.56
    };
  }

  const goalFit = option.best_for.includes(category) ? 0.86 : 0.55;
  const relationshipFit = gift && isBusiness ? 0.48 : clamp(0.45 + health * 0.45);
  const eventEvidence = clamp(0.35 + candidateCount * 0.18 + recentCount * 0.12);
  const normCompliance = gift && isBusiness ? 0.62 : highAutomation ? 0.68 : 0.88;
  const riskControl = highAutomation
    ? (userPreferences.automation_comfort === 'high' ? 0.66 : 0.35)
    : gift && isBusiness
      ? 0.58
      : 0.86;
  const costEfficiency = clamp(1 - option.estimated_cost - option.effort * 0.25);
  const timingFit = category === 'advance' && option.action_type === 'message' ? 0.82 : 0.68;
  const userPreferenceFit = disliked ? 0.2 : highAutomation && userPreferences.automation_comfort !== 'high' ? 0.35 : 0.78;
  const feedbackObservability = option.skill_ids.length ? 0.82 : 0.58;

  return {
    goal_fit: goalFit,
    relationship_fit: relationshipFit,
    event_evidence: eventEvidence,
    norm_compliance: normCompliance,
    risk_control: riskControl,
    cost_efficiency: costEfficiency,
    timing_fit: timingFit,
    user_preference_fit: userPreferenceFit,
    feedback_observability: feedbackObservability
  };
}

function scoreOption(option, scores, weights) {
  const weighted = Object.entries(weights).reduce((sum, [criterion, weight]) => {
    return sum + (scores[criterion] ?? 0) * weight;
  }, 0);

  return Number(weighted.toFixed(4));
}

function buildAgentOpinions({ goalInput, plan, options, skillPlan, evidencePack, feedbackPlan, validationPlan, roiPreview }) {
  const bestOptionTitle = options[0]?.title ?? '暂无';
  return [
    {
      agent_id: 'goal_agent',
      opinion: `当前目标是“${goalInput.initial_goal}”，应优先选择能产生可验证下一步的动作。`,
      confidence: 0.78,
      evidence_refs: ['goal_input'],
      assumptions: ['用户目标已按当前输入理解，未做长期偏好学习。']
    },
    {
      agent_id: 'relationship_agent',
      opinion: `目标对象关系为${plan.relationship_summary.relationship_type ?? '未知关系'}，阶段为${plan.relationship_summary.phase ?? '未知'}，需遵守：${plan.relationship_summary.guideline ?? '保持边界和清晰表达'}。`,
      confidence: plan.relationship_summary.relationship_type ? 0.8 : 0.48,
      evidence_refs: ['relationship_context'],
      assumptions: ['关系健康度和阶段来自当前图谱快照。']
    },
    {
      agent_id: 'event_agent',
      opinion: `近期事件 ${plan.event_summary.recent_events.length} 条，候选事件 ${plan.event_summary.candidate_events.length} 条，建议把事件作为证据而非直接结论。`,
      confidence: 0.72,
      evidence_refs: ['recent_event_*', 'candidate_event_*'],
      assumptions: ['候选事件仍可能需要用户确认。']
    },
    {
      agent_id: 'norm_agent',
      opinion: '所有外部互动都需要避免隐私越界、虚假承诺、胁迫和未经确认的高风险事件入库。',
      confidence: 0.88,
      evidence_refs: ['safety_rules', 'risk_controls'],
      assumptions: ['当前动作必须停留在用户确认和 dry-run 边界内。']
    },
    {
      agent_id: 'option_agent',
      opinion: `当前排序最高的行动是：${bestOptionTitle}。`,
      confidence: 0.74,
      evidence_refs: ['ranked_options', 'weights'],
      assumptions: ['排序基于当前权重，不代表长期最优。']
    },
    {
      agent_id: 'skill_agent',
      opinion: skillPlan.skills.length
        ? `推荐动作需要 ${skillPlan.skills.length} 个技能步骤，执行模式为 ${skillPlan.execution_mode}，确认要求为 ${skillPlan.confirmation_required ? '需要确认' : '无需额外确认'}。`
        : `推荐动作暂不需要系统技能，主要由人类流程执行，执行模式为 ${skillPlan.execution_mode}。`,
      confidence: skillPlan.skills.length ? 0.76 : 0.62,
      evidence_refs: skillPlan.skills.map((skill) => skill.skill_id),
      assumptions: ['技能注册表状态代表第一版能力边界。']
    },
    {
      agent_id: 'roi_agent',
      opinion: `按当前选项预估，ROI 预览分为 ${roiPreview.roi_score}，解释为：${roiPreview.interpretation}`,
      confidence: 0.64,
      evidence_refs: ['recommended_option', 'feedback_observability'],
      assumptions: ['ROI 是行动前预估，必须等待执行反馈校正。']
    },
    {
      agent_id: 'evidence_agent',
      opinion: `当前建议绑定 ${evidencePack.length} 条证据，仍需保留事实、推理和假设的区分。`,
      confidence: evidencePack.length >= 3 ? 0.78 : 0.52,
      evidence_refs: evidencePack.map((item) => item.evidence_id),
      assumptions: ['证据强度来自当前输入和图谱摘要，未等同于事实裁定。']
    },
    {
      agent_id: 'feedback_agent',
      opinion: `反馈计划包含 ${feedbackPlan.feedback_questions.length} 个问题，回写要求为 ${feedbackPlan.event_writeback.requires_user_review ? '需要用户复核' : '可自动处理'}；验证项 ${validationPlan.success_criteria.length} 条。`,
      confidence: 0.74,
      evidence_refs: ['feedback_plan', 'validation_plan'],
      assumptions: ['反馈能否填写，将决定后续权重校准质量。']
    }
  ];
}

function contextText(goalInput) {
  return `${goalInput.initial_goal ?? ''}\n${goalInput.context_input ?? ''}\n${goalInput.preferred_channel ?? ''}`.toLowerCase();
}

function expertSignalTags({ goalInput, plan, recommended, skillPlan, evidencePack }) {
  const text = contextText(goalInput);
  const tags = new Set(['all']);
  if (goalInput.scene) tags.add(goalInput.scene);
  if (goalInput.source_type) tags.add(goalInput.source_type);
  if (goalInput.platform) tags.add(goalInput.platform);
  if (goalInput.identity_gate_decision) tags.add(goalInput.identity_gate_decision);
  if (goalInput.preferred_channel) tags.add(goalInput.preferred_channel);
  if (plan.scene) tags.add(plan.scene);
  if (isPersonalSocialContext(goalInput, plan)) {
    tags.add('personal_social');
    tags.add('intimacy');
  }
  if (recommended.action_type) tags.add(recommended.action_type);
  if (recommended.option_id === 'option_platform_send_after_confirmation') tags.add('direct_execution');
  if (skillPlan.skills.some((skill) => skill.requires_external_connector)) tags.add('direct_execution');
  if (evidencePack.length < 5) tags.add('low_evidence');
  if (/budget|price|quote|预算|报价|价格/u.test(text)) tags.add('budget');
  if (/meeting|review|appointment|评审|会议|见面|邀约/u.test(text)) {
    tags.add('meeting');
    tags.add('advance');
  }
  if (/contract|privacy|compliance|合规|合同|隐私/u.test(text)) {
    tags.add('contract');
    tags.add('privacy');
  }
  if (/gift|thanks|礼物|感谢|拜访|文化|称呼/u.test(text)) {
    tags.add('gift');
    tags.add('culture');
  }
  if (/risk|complaint|stop|拒绝|投诉|不要再联系/u.test(text)) tags.add('risk');
  const category = inferGoalCategory(goalInput);
  if (category !== 'general') tags.add(category);
  return tags;
}

export function selectParallelExperts({
  goalInput,
  plan,
  recommended,
  skillPlan,
  evidencePack,
  knowledge = loadDecisionKnowledge(),
  maxExperts = 6
}) {
  const experts = knowledge.agents.specialist_experts ?? [];
  const signals = expertSignalTags({ goalInput, plan, recommended, skillPlan, evidencePack });
  const selected = experts
    .filter((expert) => (expert.trigger_tags ?? []).some((tag) => signals.has(tag)))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return {
    signal_tags: [...signals].sort(),
    experts: selected.slice(0, maxExperts)
  };
}

function expertOpinionFor(expert, { goalInput, recommended, skillPlan, evidencePack, validationPlan }) {
  const identityGate = goalInput.identity_gate_decision ?? goalInput.identity_status ?? 'not_provided';
  const unresolvedIdentity = [
    'identity_unmatched',
    'identity_requires_user_confirmation',
    'identity_unverified_desktop_context',
    'unresolved'
  ].includes(identityGate);
  const externalConnector = skillPlan.skills.some((skill) => skill.requires_external_connector);
  const base = {
    expert_id: expert.expert_id,
    role: expert.role,
    confidence: Number((expert.priority ?? 0.7).toFixed(2)),
    scope: 'parallel_specialist_review',
    evidence_refs: ['goal_input', 'relationship_context', 'selected_option'],
    risk_flags: [],
    blocks_execution: false
  };
  switch (expert.expert_id) {
    case 'sales_strategy_expert':
      return {
        ...base,
        opinion: 'Use a low-commitment B2B next step: clarify stakeholder, evidence material and meeting objective before asking for a decision.',
        recommendation: 'Prefer a concrete message draft that asks for a lightweight review or next confirmation, not a final close.',
        evidence_refs: [...base.evidence_refs, 'ranked_options']
      };
    case 'customer_success_expert':
      return {
        ...base,
        opinion: 'Keep a post-action feedback loop: whether the customer replied, whether the relationship warmed, and what new event should be written back.',
        recommendation: 'Add follow-up questions and review metrics before treating the action as successful.',
        evidence_refs: [...base.evidence_refs, 'feedback_plan']
      };
    case 'relationship_boundary_expert':
      return {
        ...base,
        opinion: 'The draft should avoid pressure, false urgency, emotional overreach and repeated contact after refusal.',
        recommendation: 'Keep the message editable, low pressure and user-confirmed before any external action.',
        risk_flags: recommended.message_draft?.must_confirm_before_send ? [] : ['message_not_marked_for_confirmation']
      };
    case 'compliance_risk_expert':
      return {
        ...base,
        opinion: 'Money, contract, privacy and compliance details must remain evidence-backed and should not become unverified commitments.',
        recommendation: 'Verify that the draft does not promise price, contract terms, private information handling or final delivery dates.',
        evidence_refs: [...base.evidence_refs, 'risk_controls', 'validation_plan']
      };
    case 'desktop_send_safety_expert':
      return {
        ...base,
        opinion: 'Desktop sending must stay blocked until target window, target person, draft hash, operator confirmation and audit path are verified.',
        recommendation: 'Use dry-run or controlled-send material gates only; never let a recommendation call the desktop sender directly.',
        risk_flags: externalConnector ? ['external_connector_requires_gate'] : [],
        blocks_execution: externalConnector
      };
    case 'identity_context_expert':
      return {
        ...base,
        opinion: unresolvedIdentity
          ? `Identity gate is ${identityGate}; person linking is not strong enough for real send or relationship writeback.`
          : 'Identity gate is resolved or not required for this decision.',
        recommendation: unresolvedIdentity
          ? 'Process identity_confirmation_queue and rerun identity resolution before using linked_person_ids for execution.'
          : 'Keep confirmed identity evidence attached to the RawEvent and decision audit.',
        risk_flags: unresolvedIdentity ? ['identity_not_confirmed'] : [],
        blocks_execution: unresolvedIdentity
      };
    case 'culture_context_expert':
      return {
        ...base,
        opinion: 'Tone, timing and etiquette should match the relationship phase; avoid wording that feels scripted or culturally tone-deaf.',
        recommendation: 'Keep honorifics, meeting invitation and thanks proportional to the existing relationship evidence.',
        evidence_refs: [...base.evidence_refs, 'relationship_context']
      };
    case 'evidence_quality_expert':
      return {
        ...base,
        opinion: `The current evidence pack has ${evidencePack.length} items; assumptions must remain explicit until feedback or stronger records arrive.`,
        recommendation: evidencePack.length < 5
          ? 'Add evidence or lower commitment before execution.'
          : 'Evidence is sufficient for a low-risk draft, but still requires user review.',
        risk_flags: evidencePack.length < 5 ? ['evidence_pack_thin'] : [],
        evidence_refs: evidencePack.map((item) => item.evidence_id)
      };
    default:
      return {
        ...base,
        opinion: 'Specialist reviewed the decision context with no additional hard stop.',
        recommendation: 'Proceed only through existing confirmation and audit gates.',
        evidence_refs: validationPlan.proof_required
      };
  }
}

export function buildParallelExpertAnalysis({
  goalInput,
  plan,
  recommended,
  rankedOptions,
  skillPlan,
  evidencePack,
  validationPlan,
  knowledge = loadDecisionKnowledge()
}) {
  const selected = selectParallelExperts({
    goalInput,
    plan,
    recommended,
    skillPlan,
    evidencePack,
    knowledge
  });
  const expertOpinions = selected.experts.map((expert) =>
    expertOpinionFor(expert, {
      goalInput,
      plan,
      recommended,
      rankedOptions,
      skillPlan,
      evidencePack,
      validationPlan
    })
  );
  const hardStopSignals = expertOpinions.flatMap((opinion) =>
    opinion.blocks_execution
      ? opinion.risk_flags.map((flag) => ({
        expert_id: opinion.expert_id,
        signal: flag,
        recommendation: opinion.recommendation
      }))
      : []
  );
  return {
    schema_version: 'parallel_expert_analysis.v1',
    execution_mode: 'parallel_rule_based_v1',
    signal_tags: selected.signal_tags,
    selected_expert_ids: expertOpinions.map((opinion) => opinion.expert_id),
    expert_opinions: expertOpinions,
    hard_stop_signals: hardStopSignals,
    consensus: {
      recommended_option_id: recommended.option_id,
      support_level: hardStopSignals.length ? 'conditional' : 'supported',
      summary: hardStopSignals.length
        ? 'Experts agree on analysis value but require confirmation gates before execution.'
        : 'Experts do not raise a hard stop beyond existing user confirmation gates.'
    },
    required_followups: unique([
      ...hardStopSignals.map((signal) => signal.recommendation),
      'Keep user confirmation before execution.'
    ]),
    coverage: {
      available_experts: (knowledge.agents.specialist_experts ?? []).map((expert) => expert.expert_id),
      selected_experts: expertOpinions.map((opinion) => opinion.expert_id),
      minimum_required: 3,
      complete: expertOpinions.length >= 3
    }
  };
}

function buildDeliberation({ options, recommended, agentOpinions, skillPlan, evidencePack, validationPlan, parallelExpertAnalysis = null }) {
  const runnerUp = options[1] ?? null;
  const scoreGap = runnerUp
    ? Number((recommended.weighted_score - runnerUp.weighted_score).toFixed(4))
    : 1;
  const minorityOpinions = [];

  if (scoreGap < 0.05 && runnerUp) {
    minorityOpinions.push({
      agent_id: 'option_agent',
      concern: `第一选项与第二选项分差仅 ${scoreGap}，第二选项为“${runnerUp.title}”。`,
      evidence_refs: ['ranked_options'],
      effect: '需要保留备选方案，避免把排序结果误认为确定结论。'
    });
  }

  if (recommended.option_id === 'option_platform_send_after_confirmation') {
    minorityOpinions.push({
      agent_id: 'norm_agent',
      concern: '推荐项涉及外部平台发送，必须停留在 dry-run 和用户确认之后。',
      evidence_refs: ['skill_plan', 'risk_controls'],
      effect: '未授权前不得自动发送。'
    });
  }

  if (recommended.option_id === 'option_gift_roi') {
    minorityOpinions.push({
      agent_id: 'roi_agent',
      concern: '礼物或感谢动作存在成本、边界和误解风险，收益必须由反馈校正。',
      evidence_refs: ['roi_preview', 'feedback_plan'],
      effect: '建议先做低成本、低私人化方案。'
    });
  }

  if (evidencePack.length < 4) {
    minorityOpinions.push({
      agent_id: 'evidence_agent',
      concern: '当前证据包较薄，行动前应补事实或降低承诺强度。',
      evidence_refs: evidencePack.map((item) => item.evidence_id),
      effect: '倾向先补充线索或选择低承诺动作。'
    });
  }

  const hasExternalConnector = skillPlan.skills.some((skill) => skill.requires_external_connector);
  const requiresHumanReview = skillPlan.confirmation_required
    || hasExternalConnector
    || scoreGap < 0.05
    || minorityOpinions.length >= 2
    || (parallelExpertAnalysis?.hard_stop_signals?.length ?? 0) > 0;
  const disagreementLevel = scoreGap < 0.03 || minorityOpinions.length >= 3
    ? 'high'
    : scoreGap < 0.08 || minorityOpinions.length
      ? 'medium'
      : 'low';
  const expertProofBeforeExecution = unique([
    parallelExpertAnalysis?.hard_stop_signals?.some((signal) => signal.signal === 'identity_not_confirmed')
      ? '身份确认记录'
      : null,
    parallelExpertAnalysis ? '专家并行分析记录' : null,
    ...(parallelExpertAnalysis?.required_followups ?? [])
  ]);

  return {
    status: 'rule_based_v1',
    disagreement_level: disagreementLevel,
    score_gap_to_runner_up: scoreGap,
    runner_up_option: runnerUp
      ? {
        option_id: runnerUp.option_id,
        title: runnerUp.title,
        weighted_score: runnerUp.weighted_score
      }
      : null,
    tie_break_rules: [
      '先排除违反安全、授权、证据和边界要求的选项。',
      '安全可行时，优先选择目标推进清晰且反馈可观察的选项。',
      '分差小于 0.05 时保留第二选项作为备选，不把排序当作确定事实。',
      '涉及外部平台、礼物、金钱、合同或关系修复时进入人工复核。'
    ],
    selected_by_tie_break: {
      option_id: recommended.option_id,
      reason: '当前推荐项在安全、目标匹配、成本效率和反馈可观察性之间综合得分最高。'
    },
    minority_opinions: minorityOpinions,
    requires_human_review: requiresHumanReview,
    proof_before_execution: unique([
      ...validationPlan.proof_required,
      requiresHumanReview ? '人工复核记录' : null,
      hasExternalConnector ? '外部连接器授权记录' : null
    ]),
    expert_proof_before_execution: expertProofBeforeExecution,
    agent_coverage: {
      expected_agents: [
        'goal_agent',
        'relationship_agent',
        'event_agent',
        'norm_agent',
        'option_agent',
        'skill_agent',
        'roi_agent',
        'evidence_agent',
        'feedback_agent'
      ],
      actual_agents: agentOpinions.map((opinion) => opinion.agent_id)
    },
    parallel_expert_coverage: parallelExpertAnalysis?.coverage ?? null,
    parallel_expert_hard_stop_signals: parallelExpertAnalysis?.hard_stop_signals ?? []
  };
}

function buildSkillPlan(option, knowledge) {
  const skills = option.skill_ids.map((skillId) => findSkill(knowledge, skillId)).filter(Boolean);
  return {
    option_id: option.option_id,
    skills: skills.map((skill) => ({
      skill_id: skill.skill_id,
      name: skill.name,
      layer: skill.layer,
      status: skill.status,
      requires_user_confirmation: skill.requires_user_confirmation,
      requires_external_connector: skill.requires_external_connector,
      dry_run_default: skill.dry_run_default,
      evidence_required: skill.evidence_required,
      feedback_metrics: skill.feedback_metrics,
      risk_controls: skill.risk_controls ?? []
    })),
    execution_mode: skills.some((skill) => skill.layer === 'direct_execution' && skill.requires_external_connector)
      ? 'dry_run_until_user_confirms_connector'
      : 'assistive_plan',
    confirmation_required: skills.some((skill) => skill.requires_user_confirmation)
  };
}

function buildEvidencePack(goalInput, plan, option) {
  return [
    {
      evidence_id: 'goal_input',
      type: 'user_goal',
      content: goalInput.initial_goal,
      strength: 0.9
    },
    {
      evidence_id: 'relationship_context',
      type: 'relationship',
      content: `${plan.relationship_summary.relationship_type ?? '未知关系'} / ${plan.relationship_summary.phase ?? '未知阶段'} / health ${plan.relationship_summary.health_score ?? 'unknown'}`,
      strength: plan.relationship_summary.relationship_type ? 0.78 : 0.4
    },
    ...plan.event_summary.recent_events.map((event, index) => ({
      evidence_id: `recent_event_${index + 1}`,
      type: 'recent_event',
      content: `${event.event_type_code}: ${event.title ?? event.event_id}`,
      strength: 0.7
    })),
    ...plan.event_summary.candidate_events.map((event, index) => ({
      evidence_id: `candidate_event_${index + 1}`,
      type: 'candidate_event',
      content: `${event.event_type_code} / confidence ${event.confidence}`,
      strength: event.confidence
    })),
    {
      evidence_id: 'selected_option',
      type: 'decision_basis',
      content: `${option.title}: ${option.description}`,
      strength: 0.76
    }
  ];
}

function buildFeedbackPlan(option) {
  const base = [
    '本次行动是否执行？',
    '目标对象是否回应？',
    '是否推进了用户目标？',
    '关系状态是变好、持平还是变差？',
    '是否产生新的事件或线索？'
  ];

  const giftQuestions = option.option_id === 'option_gift_roi'
    ? ['礼物成本是多少？', '对方是否自然接受？', '是否产生负面压力或误解？', '是否带来后续互动？']
    : [];

  return {
    feedback_questions: [...base, ...giftQuestions],
    metrics: {
      executed: 'boolean',
      reply_received: 'boolean',
      goal_progress: '0-1',
      relationship_change: '-1 to 1',
      cost: 'number',
      user_rating: '1-5'
    },
    event_writeback: {
      create_candidate_event: true,
      auto_confirm: false,
      requires_user_review: true
    }
  };
}

function buildValidationPlan(option) {
  return {
    success_criteria: [
      '行动符合用户确认的目标和边界',
      '至少一个反馈指标可被观察',
      '没有触发禁止性安全规则',
      '行动后可生成事件候选或复盘记录'
    ],
    proof_required: unique([
      '用户确认',
      '行动结果反馈',
      option.skill_ids.length ? '技能执行日志或人工执行记录' : null,
      '事件候选或复盘记录'
    ]),
    failure_signals: [
      '目标对象反感或明确拒绝',
      '用户认为行动不符合偏好',
      '产生隐私、合规或关系越界风险',
      '无法观察任何反馈'
    ]
  };
}

function eventTime(event) {
  return event.start_at ?? event.occurred_at ?? event.created_at ?? null;
}

function timeWindow(events) {
  const timestamps = events
    .map((event) => Date.parse(eventTime(event)))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!timestamps.length) return null;
  return {
    start_at: new Date(timestamps[0]).toISOString(),
    end_at: new Date(timestamps[timestamps.length - 1]).toISOString()
  };
}

function referenceTimestamp(events = []) {
  const timestamps = events
    .map((event) => Date.parse(eventTime(event)))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length) return Math.max(...timestamps);
  return Date.now();
}

function itemPersonIds(item = {}) {
  return unique([
    ...(item.participant_person_ids ?? []),
    ...(item.linked_person_ids ?? []),
    ...(item.participants ?? []).map((participant) =>
      typeof participant === 'string' ? participant : participant.person_id
    )
  ]);
}

function eventMatchesTarget(item, targetPersonId) {
  if (!targetPersonId) return true;
  const people = itemPersonIds(item);
  return people.length === 0 || people.includes(targetPersonId);
}

function itemSummary(item = {}) {
  return item.content_summary
    ?? item.title
    ?? item.content
    ?? item.event_type_code
    ?? item.event_id
    ?? 'context_item';
}

const TEMPORAL_CONTEXT_WINDOWS = [
  { window_id: 'today', label: 'today', max_age_days: 1 },
  { window_id: 'last_7_days', label: 'last_7_days', max_age_days: 7 },
  { window_id: 'last_30_days', label: 'last_30_days', max_age_days: 30 },
  { window_id: 'historical', label: 'historical', max_age_days: null }
];

function inTemporalWindow(item, windowDef, referenceMs) {
  if (windowDef.max_age_days === null) return true;
  const timestamp = Date.parse(eventTime(item));
  if (!Number.isFinite(timestamp)) return false;
  const ageMs = referenceMs - timestamp;
  return ageMs >= 0 && ageMs <= windowDef.max_age_days * 24 * 60 * 60 * 1000;
}

function summarizeWindowItems({ windowDef, items, referenceMs }) {
  const eventItems = items.filter((item) => item.kind === 'event');
  const rawItems = items.filter((item) => item.kind === 'raw_event');
  const timestamps = items
    .map((item) => Date.parse(eventTime(item)))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const uniqueEventTypes = unique(eventItems.map((item) => item.event_type_code));
  const summaries = items
    .map(itemSummary)
    .filter(Boolean)
    .slice(0, 6);
  const evidenceDensity = Math.min(1, items.length / 6);
  const startMs = windowDef.max_age_days === null
    ? timestamps[0] ?? null
    : referenceMs - windowDef.max_age_days * 24 * 60 * 60 * 1000;
  return {
    window_id: windowDef.window_id,
    label: windowDef.label,
    start_at: Number.isFinite(startMs) ? new Date(startMs).toISOString() : null,
    end_at: new Date(referenceMs).toISOString(),
    event_count: eventItems.length,
    raw_event_count: rawItems.length,
    total_items: items.length,
    event_type_codes: uniqueEventTypes,
    summaries,
    source_refs: unique(items.map((item) => item.event_id).filter(Boolean)).slice(0, 10),
    evidence_density: Number(evidenceDensity.toFixed(4)),
    has_context: items.length > 0
  };
}

function buildTargetTemporalContext({ goalInput, socialGraph, events, rawEvents }) {
  const targetPersonIds = unique([goalInput.primary_person_id, ...(goalInput.target_person_ids ?? [])]);
  const peopleById = new Map((socialGraph.people ?? []).map((person) => [person.person_id, person]));
  const referenceMs = referenceTimestamp([...events, ...rawEvents]);
  const normalizedEvents = events.map((event) => ({ ...event, kind: 'event' }));
  const normalizedRawEvents = rawEvents.map((event) => ({ ...event, kind: 'raw_event' }));
  const allItems = [...normalizedEvents, ...normalizedRawEvents];

  return targetPersonIds.map((targetPersonId) => {
    const targetItems = allItems.filter((item) => eventMatchesTarget(item, targetPersonId));
    const windows = TEMPORAL_CONTEXT_WINDOWS.map((windowDef) =>
      summarizeWindowItems({
        windowDef,
        referenceMs,
        items: targetItems.filter((item) => inTemporalWindow(item, windowDef, referenceMs))
      })
    );
    const activeWindows = windows.filter((window) => window.has_context).map((window) => window.window_id);
    const missingWindows = windows.filter((window) => !window.has_context).map((window) => window.window_id);
    const coverageScore = windows.length ? activeWindows.length / windows.length : 0;
    return {
      target_person_id: targetPersonId,
      display_name: peopleById.get(targetPersonId)?.display_name ?? targetPersonId,
      reference_time: new Date(referenceMs).toISOString(),
      windows,
      active_windows: activeWindows,
      missing_windows: missingWindows,
      temporal_coverage_score: Number(coverageScore.toFixed(4)),
      analysis_policy: {
        expert_dependency: 'each_expert_reads_all_windows_independently',
        required_windows: TEMPORAL_CONTEXT_WINDOWS.map((window) => window.window_id),
        latest_message_only_allowed: false
      }
    };
  });
}

function sourceBreakdown(rawEvents = []) {
  return rawEvents.reduce((breakdown, event) => {
    const source = event.source ?? 'unknown';
    breakdown[source] = (breakdown[source] ?? 0) + 1;
    return breakdown;
  }, {});
}

function contextSufficiency({ goalInput, plan, socialGraph, rawEvents = [] }) {
  const checks = [
    {
      check_id: 'goal_defined',
      passed: Boolean(goalInput.initial_goal && goalInput.primary_person_id),
      weight: 0.2
    },
    {
      check_id: 'relationship_snapshot_present',
      passed: Boolean(plan.relationship_summary?.type_code || plan.relationship_summary?.relationship_type),
      weight: 0.18
    },
    {
      check_id: 'event_timeline_present',
      passed: (socialGraph.events ?? []).length > 0 || rawEvents.length > 0,
      weight: 0.18
    },
    {
      check_id: 'evidence_text_present',
      passed: Boolean(goalInput.context_input && goalInput.context_input.length >= 20),
      weight: 0.18
    },
    {
      check_id: 'time_anchor_present',
      passed: Boolean(timeWindow([...(socialGraph.events ?? []), ...rawEvents])),
      weight: 0.12
    },
    {
      check_id: 'target_people_present',
      passed: (goalInput.target_person_ids ?? []).length > 0 || (socialGraph.people ?? []).length > 0,
      weight: 0.14
    }
  ];
  const score = checks.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0);
  return {
    score: Number(score.toFixed(4)),
    level: score >= 0.82 ? 'high' : score >= 0.58 ? 'medium' : 'low',
    checks
  };
}

export function buildContextSnapshot({
  goalInput,
  socialGraph,
  plan,
  rawEvents = [],
  source = 'decision_request'
}) {
  const targetPersonIds = unique([goalInput.primary_person_id, ...(goalInput.target_person_ids ?? [])]);
  const targetPeople = (socialGraph.people ?? [])
    .filter((person) => targetPersonIds.includes(person.person_id))
    .map((person) => ({
      person_id: person.person_id,
      display_name: person.display_name,
      roles: person.roles ?? [],
      tags: person.tags ?? []
    }));
  const relationships = (socialGraph.relationships ?? [])
    .filter((relationship) =>
      targetPersonIds.includes(relationship.from_person_id)
      || targetPersonIds.includes(relationship.to_person_id)
    )
    .map((relationship) => ({
      relationship_id: relationship.relationship_id,
      from_person_id: relationship.from_person_id,
      to_person_id: relationship.to_person_id,
      type_code: relationship.type_code,
      phase: relationship.phase ?? 'unknown',
      trust_level: relationship.trust_level ?? 'unknown',
      health_score: relationship.health_score ?? null
    }));
  const events = (socialGraph.events ?? []).map((event) => ({
    event_id: event.event_id,
    event_type_code: event.event_type_code,
    event_level: event.event_level,
    title: event.title ?? event.event_type_code,
    start_at: eventTime(event),
    confidence: event.confidence ?? null,
    importance: event.importance ?? null,
    participant_person_ids: (event.participants ?? []).map((participant) => participant.person_id).filter(Boolean)
  }));
  const sufficiency = contextSufficiency({ goalInput, plan, socialGraph, rawEvents });
  const targetTemporalContext = buildTargetTemporalContext({
    goalInput,
    socialGraph,
    events,
    rawEvents
  });

  return {
    schema_version: 'context_snapshot.v1',
    snapshot_id: createRuntimeId('context_snapshot'),
    source,
    built_at: new Date().toISOString(),
    goal: {
      initial_goal: goalInput.initial_goal,
      scene: goalInput.scene ?? plan.scene,
      primary_person_id: goalInput.primary_person_id ?? null,
      target_person_ids: targetPersonIds,
      preferred_channel: goalInput.preferred_channel ?? null,
      user_constraints: goalInput.user_constraints ?? []
    },
    relationship_snapshot: {
      summary: plan.relationship_summary,
      target_people: targetPeople,
      relationships
    },
    event_snapshot: {
      time_window: timeWindow([...events, ...rawEvents]),
      event_count: events.length,
      raw_event_count: rawEvents.length,
      event_timeline: events,
      raw_event_digest: rawEvents.map((event) => ({
        event_id: event.event_id,
        source: event.source,
        occurred_at: event.occurred_at,
        content_summary: event.content_summary,
        linked_person_ids: event.linked_person_ids ?? [],
        source_actor_type: event.metadata?.source_actor_type
          ?? event.source_ref?.source_actor_type
          ?? 'unknown',
        content_fingerprint: event.metadata?.content_fingerprint
          ?? event.source_ref?.content_fingerprint
          ?? null
      })),
      source_breakdown: sourceBreakdown(rawEvents)
    },
    target_context_windows: targetTemporalContext,
    decision_inputs: {
      context_text: goalInput.context_input ?? '',
      candidate_event_count: plan.event_summary.candidate_events.length,
      recent_event_count: plan.event_summary.recent_events.length,
      constraints: plan.constraints ?? [],
      risk_controls: plan.risk_controls ?? []
    },
    retrieval_reasons: [
      '读取目标对象和目标场景，用于选择专家和生成草稿。',
      '读取关系摘要、阶段、信任和健康度，用于判断行动强度。',
      '读取事件时间线和原始摘要，用于区分事实、线索和假设。',
      '读取风险约束和用户限制，用于后置审查和人工确认。'
    ],
    context_sufficiency_score: sufficiency.score,
    context_sufficiency_level: sufficiency.level,
    context_sufficiency_checks: sufficiency.checks
  };
}

const ROMANTIC_STAGE_DEFINITIONS = {
  R0: {
    code: 'R0',
    stage_id: 'unconfirmed_person_or_context',
    allowed_output_level: 'analysis_only'
  },
  R1: {
    code: 'R1',
    stage_id: 'candidate_romantic_interest',
    allowed_output_level: 'draft_allowed'
  },
  R2: {
    code: 'R2',
    stage_id: 'confirmed_romantic_no_physical_intimacy',
    allowed_output_level: 'draft_allowed'
  },
  R3: {
    code: 'R3',
    stage_id: 'early_physical_affection',
    allowed_output_level: 'draft_allowed'
  },
  R4: {
    code: 'R4',
    stage_id: 'romantic_kissing_or_stronger_affection',
    allowed_output_level: 'manual_review_required'
  },
  R5: {
    code: 'R5',
    stage_id: 'explicit_intimacy_boundary_discussion',
    allowed_output_level: 'manual_review_required'
  },
  R6: {
    code: 'R6',
    stage_id: 'physical_intimacy_confirmed_relationship_goal_state',
    allowed_output_level: 'analysis_only'
  },
  RX: {
    code: 'RX',
    stage_id: 'review_or_risk_exception',
    allowed_output_level: 'send_blocked'
  }
};

const ROMANTIC_LABELS = new Set([
  'romantic_partner',
  'romantic',
  'lover',
  'partner',
  'boyfriend',
  'girlfriend',
  'confirmed_romantic',
  'romantic_interest',
  'candidate_romantic_interest',
  'intimate_relationship_candidate'
]);

const RELATIONSHIP_GRADIENT_FRAMEWORK = {
  schema_version: 'relationship_gradient_framework.v1',
  framework_id: 'stage_progression_strategy_framework.v1',
  applies_to_relationship_types: ['romantic', 'sales', 'negotiation'],
  design_principle: '所有阶段性关系先分离目标梯度、证据梯度、心理舒适梯度、行动梯度和反馈回写；具体关系只替换阶段定义与专家口径。',
  reusable_dimensions: [
    'identity_clarity',
    'reciprocity_and_responsiveness',
    'self_disclosure_breadth_depth',
    'affective_heat',
    'commitment_or_investment',
    'boundary_and_autonomy',
    'conflict_repair_capacity',
    'offline_or_behavioral_evidence',
    'multi_window_evidence_coverage'
  ],
  scientific_basis: [
    {
      basis_id: 'social_penetration_theory',
      source: 'Altman & Taylor social penetration theory',
      engineering_mapping: '用自我披露的广度、深度、互惠和历史窗口稳定性判断是否能从轻松互动进入更深关系阶段。'
    },
    {
      basis_id: 'triangular_theory_of_love',
      source: 'Sternberg triangular theory: intimacy, passion and commitment',
      engineering_mapping: '恋人关系阶段同时看亲密感、激情/吸引和承诺信号，避免只用单一身体目标驱动句子。'
    },
    {
      basis_id: 'investment_model',
      source: 'Rusbult investment model of commitment',
      engineering_mapping: '把投入、替代选择、满意度和持续反馈作为关系稳定度证据，而不是只看最新一句。'
    },
    {
      basis_id: 'perceived_partner_responsiveness',
      source: 'Reis, Clark & Holmes intimacy process model',
      engineering_mapping: '对方是否理解、确认、照顾用户感受，会提高舒适推进强度；不回应或回避会降速。'
    },
    {
      basis_id: 'attachment_and_emotional_safety',
      source: 'Attachment theory and adult attachment research',
      engineering_mapping: '依恋安全感、可撤回性和不羞辱的回应方式决定草稿热度上限。'
    },
    {
      basis_id: 'consent_and_autonomy',
      source: 'freely given, informed, reversible consent principles',
      engineering_mapping: '边界与自主权单独作为审核层，不把恋人身份自动写成身体亲密同意。'
    }
  ],
  relation_specific_extension_points: [
    'stage_catalog',
    'stage_entry_feature_families',
    'allowed_dialogue_acts',
    'transition_readiness_thresholds',
    'expert_matrix_roles',
    'feedback_writeback_fields'
  ]
};

const ROMANTIC_STAGE_GRADIENT_DEFINITIONS = {
  schema_version: 'romantic_stage_gradient.v1',
  stage_catalog: [
    {
      stage: 'R0',
      stage_id: 'unconfirmed_person_or_context',
      label: '人物或窗口未确认',
      scientific_anchor: ['identity_clarity', 'evidence_coverage'],
      entry_feature_families: ['target_identity_missing', 'current_message_missing'],
      allowed_dialogue_acts: ['context_capture_hint'],
      next_stage: 'R1'
    },
    {
      stage: 'R1',
      stage_id: 'candidate_romantic_interest',
      label: '候选暧昧或恋爱兴趣',
      scientific_anchor: ['reciprocity_and_responsiveness', 'self_disclosure_breadth_depth'],
      entry_feature_families: ['轻松调侃', '关系定义试探', '主动延续话题', '低深度自我披露'],
      allowed_dialogue_acts: ['playful_relationship_definition_probe', 'warm_context_holding'],
      next_stage: 'R2'
    },
    {
      stage: 'R2',
      stage_id: 'confirmed_romantic_no_physical_intimacy',
      label: '已确认恋人但无身体亲密证据',
      scientific_anchor: ['commitment_or_investment', 'perceived_partner_responsiveness', 'affective_heat'],
      entry_feature_families: ['用户或图谱确认恋人身份', '稳定互相回应', '温暖/亲昵称呼/调侃'],
      allowed_dialogue_acts: ['warm_affection_micro_progression', 'warm_presence_soft_invitation'],
      next_stage: 'R3'
    },
    {
      stage: 'R3',
      stage_id: 'early_physical_affection',
      label: '非性身体亲密或明确靠近',
      scientific_anchor: ['affective_heat', 'boundary_and_autonomy', 'offline_or_behavioral_evidence'],
      entry_feature_families: ['牵手', '拥抱', '依偎', '对身体靠近表达舒适'],
      allowed_dialogue_acts: ['stage_bounded_closeness_check', 'soft_next_date_boundary_check'],
      next_stage: 'R4'
    },
    {
      stage: 'R4',
      stage_id: 'romantic_kissing_or_stronger_affection',
      label: '接吻或更强亲密信号',
      scientific_anchor: ['passion_signal', 'boundary_and_autonomy', 'multi_window_evidence_coverage'],
      entry_feature_families: ['接吻', '更强亲密表达', '双方舒适反馈'],
      allowed_dialogue_acts: ['manual_review_before_stronger_intimacy'],
      next_stage: 'R5'
    },
    {
      stage: 'R5',
      stage_id: 'explicit_intimacy_boundary_discussion',
      label: '明确亲密边界与现实条件讨论',
      scientific_anchor: ['consent_and_autonomy', 'privacy_and_health', 'commitment_or_investment'],
      entry_feature_families: ['边界', '健康', '排他性', '安全措施', '双方明确讨论节奏'],
      allowed_dialogue_acts: ['manual_review_boundary_conversation'],
      next_stage: 'R6'
    },
    {
      stage: 'R6',
      stage_id: 'physical_intimacy_confirmed_relationship_goal_state',
      label: '双方确认后的生理亲密关系状态',
      scientific_anchor: ['consent_and_autonomy', 'commitment_or_investment'],
      entry_feature_families: ['双方确认', '可回写事实', '隐私保护'],
      allowed_dialogue_acts: ['relationship_health_maintenance'],
      next_stage: null
    },
    {
      stage: 'RX',
      stage_id: 'review_or_risk_exception',
      label: '风险例外或人工复核',
      scientific_anchor: ['coercion_risk', 'boundary_and_autonomy'],
      entry_feature_families: ['威胁', '羞辱', '胁迫', '隐私勒索', '明确不适'],
      allowed_dialogue_acts: ['risk_review_or_safety_hint'],
      next_stage: null
    }
  ],
  stage_upgrade_policy: {
    dynamic_feature_based: true,
    fixed_phrase_matching_is_only_rule_based_evidence: true,
    required_evidence_windows: ['today', 'last_7_days', 'last_30_days', 'historical_stage'],
    missing_history_policy: '允许当前阶段微推进，但不允许把缺失历史误判成阶段停滞或阶段升级证据。',
    no_stage_skip_policy: '只能建议当前阶段到下一阶段的一阶、可拒绝、可回写动作。'
  }
};

const ROMANTIC_ONLINE_TRACK_DEFINITIONS = [
  {
    stage: 'O0',
    stage_id: 'identity_or_current_message_capture',
    label: '身份、窗口或当前消息未确认',
    goal: '先确认目标人物、窗口和当前消息，不推进关系阶段。'
  },
  {
    stage: 'O1',
    stage_id: 'low_pressure_opening',
    label: '低压开场',
    goal: '自然承接当前消息，保持可回应和低负担。'
  },
  {
    stage: 'O2',
    stage_id: 'reciprocal_rhythm_and_lightness',
    label: '互惠节奏和轻松感',
    goal: '观察对方是否接梗、回问、主动延续话题。'
  },
  {
    stage: 'O3',
    stage_id: 'emotional_disclosure_and_responsiveness',
    label: '情绪披露和回应性',
    goal: '承接对方情绪、自我披露或亲密调侃，让对方感觉被看见。'
  },
  {
    stage: 'O4',
    stage_id: 'relationship_intent_probe',
    label: '关系意图轻试探',
    goal: '用可撤回方式测试好感、关系定义或未来互动意愿。'
  },
  {
    stage: 'O5',
    stage_id: 'offline_invitation_readiness',
    label: '线下邀约准备',
    goal: '把稳定线上互动转成低压、可拒绝的线下邀约。'
  },
  {
    stage: 'O6',
    stage_id: 'pre_meet_expectation_alignment',
    label: '见面前校准',
    goal: '确认时间地点、舒适度、退出空间和见面期待。'
  },
  {
    stage: 'O7',
    stage_id: 'post_meet_feedback_writeback',
    label: '见面后复盘',
    goal: '写回体验、热度、边界和下一次互动建议。'
  },
  {
    stage: 'OX',
    stage_id: 'online_risk_or_boundary_exception',
    label: '线上风险或边界例外',
    goal: '停止推进，进入用户可见风险提示或人工复核。'
  }
];

const ROMANTIC_OFFLINE_TRACK_DEFINITIONS = [
  {
    stage: 'F0',
    stage_id: 'offline_not_started_or_public_first_meet',
    label: '未线下或公开安全初见',
    goal: '保持公开、短时、可退出的低压线下基础。'
  },
  {
    stage: 'F1',
    stage_id: 'first_meet_comfort_building',
    label: '初见现场舒适建立',
    goal: '通过轻松话题和节奏观察降低尴尬。'
  },
  {
    stage: 'F2',
    stage_id: 'in_person_connection_bids',
    label: '线下连接请求和回应',
    goal: '观察共同体验、具体赞赏和反向发起。'
  },
  {
    stage: 'F3',
    stage_id: 'nonsexual_closeness_readiness',
    label: '非性亲密准备',
    goal: '只允许低强度、可拒绝、可停止的靠近建议。'
  },
  {
    stage: 'F4',
    stage_id: 'stronger_affection_boundary_review',
    label: '更强亲密边界复核',
    goal: '更强亲密前先确认舒适度、边界和持续同意。'
  },
  {
    stage: 'F5',
    stage_id: 'intimacy_boundary_health_privacy_talk',
    label: '亲密边界、健康和隐私沟通',
    goal: '把节奏、健康、安全、隐私和期待说清楚。'
  },
  {
    stage: 'F6',
    stage_id: 'confirmed_physical_intimacy_goal_state',
    label: '双方确认后的生理亲密目标状态',
    goal: '只做事实记录、隐私保护、关系健康和后续维护。'
  },
  {
    stage: 'F7',
    stage_id: 'maintenance_and_repair',
    label: '维护和修复',
    goal: '稳定关系体验、修复冲突、规划下一阶段。'
  },
  {
    stage: 'FX',
    stage_id: 'offline_risk_or_boundary_exception',
    label: '线下风险或边界例外',
    goal: '停止推进，进入安全提示或人工复核。'
  }
];

const ROMANTIC_SIGNAL_PATTERNS = {
  playful_affection: [
    ['playful_touch_language', /捏捏|揉揉|抱抱|亲亲|撒娇|不拧巴/iu],
    ['laughter_or_lightness', /哈哈|hhh|笑死|逗|开玩笑|好玩/iu],
    ['warm_address', /宝贝|宝宝|亲爱的|乖|想你|喜欢你|在意你/iu]
  ],
  relationship_definition: [
    ['relationship_label', /男朋友|女朋友|对象|恋人|情侣|在一起|转正|试用期|boyfriend|girlfriend|dating/iu],
    ['commitment_probe', /算吗|是不是|什么关系|确认关系|排他|只喜欢/iu]
  ],
  emotional_disclosure: [
    ['positive_feeling', /开心|想你|喜欢|在意|舍不得|安心|舒服|期待|不拧巴/iu],
    ['vulnerable_feeling', /难受|委屈|害怕|担心|不舒服|有点乱|没安全感/iu]
  ],
  responsiveness: [
    ['question_or_invitation', /吗|呢|吧|要不要|可以吗|想不想|见面|一起|下次/iu],
    ['continuation_signal', /然后|继续|再聊|慢慢说|听你说|我在/iu]
  ],
  nonsexual_affection: [
    ['hand_or_hug', /牵手|牵着|拥抱|抱一下|抱在一起|依偎|搂着|hand.?hold|hug/iu]
  ],
  stronger_affection: [
    ['kissing_signal', /接吻|亲吻|热吻|kiss|更强亲密/iu]
  ],
  explicit_boundary: [
    ['comfort_boundary', /边界|节奏|舒服|不舒服|可以拒绝|慢一点|停|别这样|过了/iu],
    ['consent_or_health', /同意|自愿|安全套|避孕|健康|排他性|隐私|成年人|consent|contraception|std/iu]
  ],
  offline_behavior: [
    ['meet_or_date', /见面|约会|吃饭|散步|电影|下次见|陪你待一会儿|date|meet/iu],
    ['shared_time', /今天|周末|晚上|明天|一起待|陪你/iu]
  ],
  conflict_repair: [
    ['repair_signal', /对不起|抱歉|误会|修复|认真听|刚才|让你不舒服|我接住|慢慢说/iu]
  ],
  pressure_or_coercion: [
    ['pressure_or_threat', /必须|不然|威胁|逼|羞辱|孤立|勒索|不给就|不做就|must|threat/iu]
  ],
  post_meet_feedback: [
    ['post_meet_signal', /见完|见面后|刚见完|上次见|今天见面.*开心|after.?date|after.?meet/iu],
    ['next_meet_feedback', /下次还想见|下次再见|见到你很开心|今天和你.*开心/iu]
  ],
  pre_meet_alignment: [
    ['time_place_confirmation', /几点|地址|位置|到哪|到时候|明天见|今晚见|周末见|见面前|出发|到了/iu],
    ['expectation_alignment', /方便吗|可以改|不急|不舒服就说|到时候看你状态/iu]
  ]
};

function matchRomanticSignalFamily(text, family) {
  return (ROMANTIC_SIGNAL_PATTERNS[family] ?? [])
    .filter(([, pattern]) => pattern.test(text))
    .map(([signalId]) => signalId);
}

function scoreFromMatches(matches, base = 0, step = 0.22, max = 0.9) {
  return clamp(base + matches.length * step, 0, max);
}

function semanticFeature({ featureId, label, value, evidenceSignals, interpretation }) {
  const rounded = Number(clamp(value).toFixed(4));
  return {
    feature_id: featureId,
    label,
    value: rounded,
    status: rounded >= 0.72
      ? 'strong'
      : rounded >= 0.48
        ? 'present'
        : rounded > 0.18
          ? 'weak'
          : 'missing',
    evidence_signals: unique(evidenceSignals).slice(0, 8),
    interpretation
  };
}

function buildRomanticSemanticFeatures({
  goalInput,
  identityAnalysis,
  riskAnalysis,
  utterances,
  evidenceWindows,
  rawEvents = []
}) {
  const text = [
    goalInput.initial_goal,
    goalInput.context_input,
    goalInput.content_text,
    ...utterances.map((item) => item.text),
    ...rawEvents.flatMap((event) => [
      event.content,
      event.text,
      event.content_summary,
      event.metadata?.ocr_text
    ])
  ].filter(Boolean).join('\n');
  const activeWindows = evidenceWindows.filter((window) => window.has_context).length;
  const coverageValue = clamp(activeWindows / 4 + Math.min(utterances.length, 3) * 0.08, 0, 1);
  const relationshipMatches = matchRomanticSignalFamily(text, 'relationship_definition');
  const playfulMatches = matchRomanticSignalFamily(text, 'playful_affection');
  const disclosureMatches = matchRomanticSignalFamily(text, 'emotional_disclosure');
  const responsivenessMatches = matchRomanticSignalFamily(text, 'responsiveness');
  const nonsexualMatches = matchRomanticSignalFamily(text, 'nonsexual_affection');
  const strongerMatches = matchRomanticSignalFamily(text, 'stronger_affection');
  const boundaryMatches = matchRomanticSignalFamily(text, 'explicit_boundary');
  const offlineMatches = matchRomanticSignalFamily(text, 'offline_behavior');
  const repairMatches = matchRomanticSignalFamily(text, 'conflict_repair');
  const pressureMatches = matchRomanticSignalFamily(text, 'pressure_or_coercion');
  const riskPenalty = riskAnalysis.risk_level === 'critical'
    ? 0.65
    : riskAnalysis.risk_level === 'warning'
      ? 0.42
      : riskAnalysis.risk_level === 'watch'
        ? 0.22
        : 0;
  return [
    semanticFeature({
      featureId: 'identity_clarity',
      label: '人物与主关系身份清晰度',
      value: identityAnalysis.has_confirmed_romantic_identity
        ? 0.92
        : identityAnalysis.has_candidate_romantic_identity
          ? 0.58
          : identityAnalysis.target_person_ids.length ? 0.36 : 0.08,
      evidenceSignals: [
        identityAnalysis.has_confirmed_romantic_identity ? 'confirmed_romantic_identity' : null,
        identityAnalysis.has_candidate_romantic_identity ? 'candidate_romantic_identity' : null,
        ...relationshipMatches
      ],
      interpretation: '身份越清晰，越能选择恋人关系主模板；身份不清时只能先采集上下文。'
    }),
    semanticFeature({
      featureId: 'reciprocity_and_responsiveness',
      label: '互惠回应与伴侣回应性',
      value: scoreFromMatches([...responsivenessMatches, ...playfulMatches], 0.24 + utterances.length * 0.06, 0.16, 0.88),
      evidenceSignals: [...responsivenessMatches, ...playfulMatches],
      interpretation: '对方主动延续、提问、接梗或回应用户感受时，可提高微推进强度。'
    }),
    semanticFeature({
      featureId: 'self_disclosure_breadth_depth',
      label: '自我披露广度与深度',
      value: scoreFromMatches(disclosureMatches, 0.18, 0.2, 0.82),
      evidenceSignals: disclosureMatches,
      interpretation: '情绪表达越明确，越需要根据舒适度承接，而不是只按目标推进。'
    }),
    semanticFeature({
      featureId: 'affective_heat',
      label: '当轮亲密热度',
      value: scoreFromMatches([...playfulMatches, ...nonsexualMatches, ...strongerMatches], 0.2, 0.18, 0.92),
      evidenceSignals: [...playfulMatches, ...nonsexualMatches, ...strongerMatches],
      interpretation: '热度决定草稿强度；热度高也只允许一阶、可拒绝推进。'
    }),
    semanticFeature({
      featureId: 'commitment_or_investment',
      label: '承诺、投入与关系定义信号',
      value: clamp((identityAnalysis.has_confirmed_romantic_identity ? 0.5 : 0.12)
        + relationshipMatches.length * 0.16
        + offlineMatches.length * 0.08
        + coverageValue * 0.12, 0, 0.92),
      evidenceSignals: [...relationshipMatches, ...offlineMatches],
      interpretation: '承诺与投入信号用于确认关系稳定度，不替代边界和同意。'
    }),
    semanticFeature({
      featureId: 'boundary_and_autonomy',
      label: '边界、自主与舒适度',
      value: clamp(0.62 + boundaryMatches.length * 0.08 - riskPenalty - pressureMatches.length * 0.18, 0, 0.9),
      evidenceSignals: [...boundaryMatches, ...pressureMatches],
      interpretation: '边界清晰且无压力信号时允许低压力草稿；压力或拒绝信号会降速或阻断。'
    }),
    semanticFeature({
      featureId: 'offline_or_behavioral_evidence',
      label: '线下或可观察行为证据',
      value: scoreFromMatches([...offlineMatches, ...nonsexualMatches, ...strongerMatches], 0.1, 0.2, 0.88),
      evidenceSignals: [...offlineMatches, ...nonsexualMatches, ...strongerMatches],
      interpretation: '真实见面、非性亲密和可观察互动能增强阶段判定，但仍需反馈回写。'
    }),
    semanticFeature({
      featureId: 'conflict_repair_capacity',
      label: '冲突修复能力',
      value: clamp(0.46 + repairMatches.length * 0.18 - riskPenalty * 0.42, 0, 0.86),
      evidenceSignals: repairMatches,
      interpretation: '有修复信号时应先恢复安全感；无修复需求时作为关系韧性背景。'
    }),
    semanticFeature({
      featureId: 'multi_window_evidence_coverage',
      label: '多时间窗证据覆盖',
      value: coverageValue,
      evidenceSignals: evidenceWindows
        .filter((window) => window.has_context)
        .map((window) => `${window.window_id}_context`),
      interpretation: '今天、一周、一月和历史窗口越完整，阶段升级判断越可靠。'
    })
  ];
}

function featureValue(features, featureId) {
  return features.find((feature) => feature.feature_id === featureId)?.value ?? 0;
}

function romanticSourceText({ goalInput, utterances = [], rawEvents = [] }) {
  return [
    goalInput.initial_goal,
    goalInput.context_input,
    goalInput.content_text,
    ...utterances.map((item) => item.text),
    ...rawEvents.flatMap((event) => [
      event.content,
      event.text,
      event.content_summary,
      event.metadata?.ocr_text
    ])
  ].filter(Boolean).join('\n');
}

function trackDefinition(definitions, stageCode) {
  return definitions.find((item) => item.stage === stageCode) ?? definitions[0];
}

function inferOnlineProgressionStage({
  stage,
  contextGapDiagnosis,
  riskAnalysis,
  features,
  signalMatches,
  utterances
}) {
  const captureOnly = [
    'identity_confirmation_or_context_collection_hint',
    'read_or_capture_more_messages_before_stage_progression',
    'ask_for_current_message_or_keep_analysis_only'
  ].includes(contextGapDiagnosis.current_state_process_decision);
  if (riskAnalysis.risk_level === 'critical' || stage.code === 'RX') return 'OX';
  if (captureOnly || stage.code === 'R0') return 'O0';
  if (signalMatches.post_meet_feedback.length) return 'O7';
  if (signalMatches.pre_meet_alignment.length) return 'O6';
  if (signalMatches.offline_behavior.length || featureValue(features, 'offline_or_behavioral_evidence') >= 0.56) {
    return 'O5';
  }
  if (signalMatches.relationship_definition.length || featureValue(features, 'commitment_or_investment') >= 0.68) {
    return 'O4';
  }
  if (signalMatches.emotional_disclosure.length || featureValue(features, 'self_disclosure_breadth_depth') >= 0.38) {
    return 'O3';
  }
  if (
    signalMatches.playful_affection.length
    || signalMatches.responsiveness.length
    || featureValue(features, 'reciprocity_and_responsiveness') >= 0.42
  ) {
    return 'O2';
  }
  return utterances.length ? 'O1' : 'O0';
}

function inferOfflineProgressionStage({ stage, riskAnalysis, signalMatches }) {
  if (riskAnalysis.risk_level === 'critical' || stage.code === 'RX') return 'FX';
  if (stage.code === 'R6') return 'F6';
  if (stage.code === 'R5') return 'F5';
  if (stage.code === 'R4' || signalMatches.stronger_affection.length) return 'F4';
  if (stage.code === 'R3' || signalMatches.nonsexual_affection.length) return 'F3';
  if (signalMatches.post_meet_feedback.length) return 'F7';
  if (signalMatches.pre_meet_alignment.length) return 'F1';
  if (signalMatches.offline_behavior.length) return 'F1';
  return 'F0';
}

function buildOnlineOfflineProgressionTrack({
  stage,
  contextGapDiagnosis,
  riskAnalysis,
  features,
  utterances,
  sourceText
}) {
  const signalMatches = {
    playful_affection: matchRomanticSignalFamily(sourceText, 'playful_affection'),
    relationship_definition: matchRomanticSignalFamily(sourceText, 'relationship_definition'),
    emotional_disclosure: matchRomanticSignalFamily(sourceText, 'emotional_disclosure'),
    responsiveness: matchRomanticSignalFamily(sourceText, 'responsiveness'),
    nonsexual_affection: matchRomanticSignalFamily(sourceText, 'nonsexual_affection'),
    stronger_affection: matchRomanticSignalFamily(sourceText, 'stronger_affection'),
    explicit_boundary: matchRomanticSignalFamily(sourceText, 'explicit_boundary'),
    offline_behavior: matchRomanticSignalFamily(sourceText, 'offline_behavior'),
    conflict_repair: matchRomanticSignalFamily(sourceText, 'conflict_repair'),
    pressure_or_coercion: matchRomanticSignalFamily(sourceText, 'pressure_or_coercion'),
    post_meet_feedback: matchRomanticSignalFamily(sourceText, 'post_meet_feedback'),
    pre_meet_alignment: matchRomanticSignalFamily(sourceText, 'pre_meet_alignment')
  };
  const onlineStage = inferOnlineProgressionStage({
    stage,
    contextGapDiagnosis,
    riskAnalysis,
    features,
    signalMatches,
    utterances
  });
  const offlineStage = inferOfflineProgressionStage({ stage, riskAnalysis, signalMatches });
  const onlineDefinition = trackDefinition(ROMANTIC_ONLINE_TRACK_DEFINITIONS, onlineStage);
  const offlineDefinition = trackDefinition(ROMANTIC_OFFLINE_TRACK_DEFINITIONS, offlineStage);
  const bridgeActive = ['O5', 'O6'].includes(onlineStage) || ['F1', 'F2'].includes(offlineStage);
  const activeTrack = riskAnalysis.risk_level === 'critical' || onlineStage === 'OX' || offlineStage === 'FX'
    ? 'risk_review'
    : ['O7'].includes(onlineStage) || ['F7'].includes(offlineStage)
      ? 'post_meet_feedback'
      : bridgeActive
        ? 'online_to_offline_transition'
        : offlineStage !== 'F0'
          ? 'offline'
          : 'online';
  return {
    schema_version: 'online_offline_progression_track.v1',
    track_catalog: {
      online: ROMANTIC_ONLINE_TRACK_DEFINITIONS,
      offline: ROMANTIC_OFFLINE_TRACK_DEFINITIONS
    },
    active_track: activeTrack,
    online_track: {
      stage: onlineDefinition.stage,
      stage_id: onlineDefinition.stage_id,
      label: onlineDefinition.label,
      goal: onlineDefinition.goal,
      evidence_signals: unique([
        ...signalMatches.relationship_definition,
        ...signalMatches.emotional_disclosure,
        ...signalMatches.responsiveness,
        ...signalMatches.playful_affection,
        ...signalMatches.offline_behavior,
        ...signalMatches.pre_meet_alignment,
        ...signalMatches.post_meet_feedback
      ]).slice(0, 10)
    },
    offline_track: {
      stage: offlineDefinition.stage,
      stage_id: offlineDefinition.stage_id,
      label: offlineDefinition.label,
      goal: offlineDefinition.goal,
      evidence_signals: unique([
        ...signalMatches.offline_behavior,
        ...signalMatches.nonsexual_affection,
        ...signalMatches.stronger_affection,
        ...signalMatches.explicit_boundary,
        ...signalMatches.pre_meet_alignment,
        ...signalMatches.post_meet_feedback,
        ...signalMatches.conflict_repair
      ]).slice(0, 10)
    },
    signal_summary: {
      has_online_reciprocity: Boolean(signalMatches.responsiveness.length || signalMatches.playful_affection.length),
      has_emotional_disclosure: Boolean(signalMatches.emotional_disclosure.length),
      has_relationship_probe: Boolean(signalMatches.relationship_definition.length),
      has_offline_invitation_or_meet_signal: Boolean(signalMatches.offline_behavior.length),
      has_pre_meet_alignment: Boolean(signalMatches.pre_meet_alignment.length),
      has_post_meet_feedback: Boolean(signalMatches.post_meet_feedback.length),
      has_nonsexual_affection: Boolean(signalMatches.nonsexual_affection.length),
      has_stronger_affection: Boolean(signalMatches.stronger_affection.length),
      has_boundary_discussion: Boolean(signalMatches.explicit_boundary.length),
      has_pressure_or_coercion: Boolean(signalMatches.pressure_or_coercion.length)
    },
    progression_policy: {
      online_lacks_nonverbal_feedback: true,
      offline_requires_context_and_exit_space: true,
      no_stage_skip: true,
      one_reversible_step_per_turn: true
    }
  };
}

function buildDateTransitionReadiness({
  stage,
  contextGapDiagnosis,
  riskAnalysis,
  features,
  psychologicalComfortModel,
  onlineOfflineProgressionTrack
}) {
  const activeOnlineStage = onlineOfflineProgressionTrack.online_track.stage;
  const activeOfflineStage = onlineOfflineProgressionTrack.offline_track.stage;
  const captureOnly = [
    'identity_confirmation_or_context_collection_hint',
    'read_or_capture_more_messages_before_stage_progression',
    'ask_for_current_message_or_keep_analysis_only'
  ].includes(contextGapDiagnosis.current_state_process_decision);
  const score = Number(clamp(
    featureValue(features, 'reciprocity_and_responsiveness') * 0.26
    + featureValue(features, 'commitment_or_investment') * 0.22
    + featureValue(features, 'boundary_and_autonomy') * 0.2
    + featureValue(features, 'multi_window_evidence_coverage') * 0.14
    + featureValue(features, 'offline_or_behavioral_evidence') * 0.18
  ).toFixed(4));
  let status = 'not_ready';
  if (riskAnalysis.risk_level === 'critical' || ['OX', 'FX'].includes(activeOnlineStage) || activeOfflineStage === 'FX') {
    status = 'blocked_for_risk_review';
  } else if (captureOnly || stage.code === 'R0') {
    status = 'context_capture_required';
  } else if (activeOnlineStage === 'O7' || activeOfflineStage === 'F7') {
    status = 'post_meet_feedback_required';
  } else if (activeOnlineStage === 'O6' || activeOfflineStage === 'F1') {
    status = 'pre_meet_confirmation';
  } else if (activeOnlineStage === 'O5' || score >= 0.6 || psychologicalComfortModel.progression_intensity === 'soft_invitation') {
    status = 'ready_for_low_pressure_invitation';
  } else if (score >= 0.42) {
    status = 'candidate_for_future_invitation';
  }
  return {
    schema_version: 'date_transition_readiness.v1',
    status,
    readiness_score: score,
    online_stage: activeOnlineStage,
    offline_stage: activeOfflineStage,
    recommended_transition_action: status === 'ready_for_low_pressure_invitation'
      ? 'offer_two_low_pressure_options_and_keep_refusal_space'
      : status === 'pre_meet_confirmation'
        ? 'confirm_time_place_expectation_and_exit_space'
        : status === 'post_meet_feedback_required'
          ? 'write_post_meet_feedback_and_next_step_signal'
          : status === 'candidate_for_future_invitation'
            ? 'continue_warmth_and_wait_for_more_reciprocal_or_context_signal'
            : status === 'context_capture_required'
              ? 'capture_current_message_and_identity_before_invitation'
              : status === 'blocked_for_risk_review'
                ? 'do_not_invite_until_risk_review_passes'
                : 'hold_online_warmth_without_invitation',
    gates: {
      target_identity_confirmed: !captureOnly && stage.code !== 'R0',
      risk_review_clear: riskAnalysis.risk_level !== 'critical',
      low_pressure_and_refusable: true,
      public_or_safe_meeting_context_required: true,
      no_automatic_send: true
    },
    evidence_refs: [
      'romantic_goal_analysis.semantic_feature_assessment',
      'romantic_goal_analysis.online_offline_progression_track',
      'romantic_goal_analysis.context_gap_diagnosis'
    ]
  };
}

function intentFromProgressionIntensity({ stage, psychologicalComfortModel, onlineOfflineProgressionTrack, riskAnalysis }) {
  if (riskAnalysis.risk_level === 'critical' || stage.code === 'RX') return 'risk_review';
  if (stage.code === 'R6') return 'maintenance';
  if (onlineOfflineProgressionTrack.online_track.stage === 'O7' || onlineOfflineProgressionTrack.offline_track.stage === 'F7') {
    return 'maintenance';
  }
  const mapping = {
    context_capture: 'observe_or_hold',
    manual_review_or_safety_hint: 'risk_review',
    repair_or_boundary_first: 'repair_or_downshift',
    warm_hold: 'warm_response',
    micro_warmth: 'micro_progression',
    soft_invitation: 'soft_invitation',
    closeness_check: 'boundary_review',
    manual_review_before_stronger_intimacy: 'boundary_review',
    hold: 'observe_or_hold'
  };
  return mapping[psychologicalComfortModel.progression_intensity] ?? 'observe_or_hold';
}

function buildRomanticProgressionCadence({
  stage,
  riskAnalysis,
  contextGapDiagnosis,
  psychologicalComfortModel,
  stageTransitionAssessment,
  onlineOfflineProgressionTrack,
  dateTransitionReadiness
}) {
  const currentTurnIntent = intentFromProgressionIntensity({
    stage,
    psychologicalComfortModel,
    onlineOfflineProgressionTrack,
    riskAnalysis
  });
  const missingWindows = contextGapDiagnosis.missing_context_windows ?? [];
  let cadenceDecision = 'hold_or_low_pressure';
  if (currentTurnIntent === 'risk_review') {
    cadenceDecision = 'stop_progression_and_review';
  } else if (currentTurnIntent === 'observe_or_hold') {
    cadenceDecision = 'collect_context_before_progression';
  } else if (dateTransitionReadiness.status === 'ready_for_low_pressure_invitation') {
    cadenceDecision = 'advance_to_soft_invitation';
  } else if (currentTurnIntent === 'micro_progression') {
    cadenceDecision = 'advance_one_reversible_micro_step';
  } else if (currentTurnIntent === 'repair_or_downshift') {
    cadenceDecision = 'repair_before_progression';
  } else if (currentTurnIntent === 'boundary_review') {
    cadenceDecision = 'manual_or_boundary_review_before_progression';
  } else if (currentTurnIntent === 'maintenance') {
    cadenceDecision = 'maintain_and_write_feedback';
  }
  return {
    schema_version: 'romantic_progression_cadence.v1',
    current_turn_intent: currentTurnIntent,
    cadence_decision: cadenceDecision,
    stage_delta_policy: 'one_reversible_stage_bounded_step_per_turn',
    no_fixed_day_count_progression: true,
    evidence_window_policy: {
      today_sets_tone: true,
      last_7_days_sets_rhythm: true,
      last_30_days_sets_stability: true,
      historical_sets_identity_and_commitment: true,
      missing_windows_reduce_upgrade_confidence: missingWindows.length > 0
    },
    pacing_factors: [
      `online_stage=${onlineOfflineProgressionTrack.online_track.stage}`,
      `offline_stage=${onlineOfflineProgressionTrack.offline_track.stage}`,
      `date_transition=${dateTransitionReadiness.status}`,
      `comfort=${psychologicalComfortModel.comfort_score}`,
      `heat=${psychologicalComfortModel.heat_score}`,
      `transition=${stageTransitionAssessment.transition_decision}`,
      missingWindows.length ? `missing=${missingWindows.join(',')}` : 'missing=none'
    ],
    fallback_when_rejected_or_unclear: currentTurnIntent === 'risk_review'
      ? 'do_not_progress_and_show_user_visible_review'
      : currentTurnIntent === 'boundary_review'
        ? 'ask_or_hold_boundary_without_pressure'
        : 'downshift_to_warm_response_or_context_capture'
  };
}

function buildRomanticStageTransitionAssessment({
  stage,
  relationshipGoalContract,
  psychologicalComfortModel,
  features,
  contextGapDiagnosis,
  riskAnalysis
}) {
  const stageCode = stage.code;
  const nextStage = ROMANTIC_STAGE_GRADIENT_DEFINITIONS.stage_catalog
    .find((item) => item.stage === stageCode)?.next_stage ?? null;
  const nextStageRequirements = {
    R0: ['identity_clarity', 'reciprocity_and_responsiveness'],
    R1: ['identity_clarity', 'commitment_or_investment', 'reciprocity_and_responsiveness'],
    R2: ['affective_heat', 'boundary_and_autonomy', 'offline_or_behavioral_evidence'],
    R3: ['affective_heat', 'boundary_and_autonomy', 'offline_or_behavioral_evidence'],
    R4: ['boundary_and_autonomy', 'commitment_or_investment', 'multi_window_evidence_coverage'],
    R5: ['boundary_and_autonomy', 'commitment_or_investment', 'multi_window_evidence_coverage']
  };
  const requiredFeatureIds = nextStageRequirements[stageCode] ?? [];
  const requiredFeatures = requiredFeatureIds.map((featureId) =>
    features.find((feature) => feature.feature_id === featureId)
  ).filter(Boolean);
  const readinessScore = requiredFeatures.length
    ? Number((requiredFeatures.reduce((sum, feature) => sum + feature.value, 0) / requiredFeatures.length).toFixed(4))
    : 0;
  const sufficientCoverage = featureValue(features, 'multi_window_evidence_coverage') >= 0.5;
  const contextCapture = [
    'identity_confirmation_or_context_collection_hint',
    'read_or_capture_more_messages_before_stage_progression',
    'ask_for_current_message_or_keep_analysis_only'
  ].includes(contextGapDiagnosis.current_state_process_decision);
  let transitionDecision = 'hold_stage_or_collect_context';
  if (riskAnalysis.risk_level === 'critical' || stageCode === 'RX') {
    transitionDecision = 'route_to_risk_exception_no_progression';
  } else if (contextCapture) {
    transitionDecision = 'hold_stage_context_gap_use_capture_hint';
  } else if (!nextStage) {
    transitionDecision = stageCode === 'R6'
      ? 'maintain_relationship_health_no_next_stage'
      : 'manual_review_without_next_stage';
  } else if (readinessScore >= 0.75 && sufficientCoverage) {
    transitionDecision = 'eligible_for_next_stage_review_not_auto_commit';
  } else if (relationshipGoalContract.active_progression_allowed) {
    transitionDecision = 'progress_with_current_stage_micro_step';
  }
  return {
    schema_version: 'romantic_stage_transition_assessment.v1',
    current_stage: stageCode,
    next_stage_candidate: nextStage,
    dynamic_feature_policy: {
      features_are_semantic_families_not_fixed_phrases: true,
      phrase_matches_are_rule_based_test_evidence_only: true,
      stage_upgrade_requires_signal_convergence: true
    },
    required_feature_ids_for_next_stage: requiredFeatureIds,
    required_features: requiredFeatures,
    next_stage_feature_readiness_score: readinessScore,
    evidence_coverage_sufficient_for_stage_upgrade: sufficientCoverage,
    transition_decision: transitionDecision,
    current_turn_action_intensity: psychologicalComfortModel.progression_intensity,
    upgrade_blockers: unique([
      contextCapture ? 'context_capture_or_identity_gap' : null,
      sufficientCoverage ? null : 'multi_window_evidence_insufficient_for_stage_upgrade',
      riskAnalysis.risk_level === 'critical' ? 'critical_target_to_user_risk' : null,
      readinessScore >= 0.75 ? null : 'next_stage_feature_convergence_insufficient'
    ]),
    allowed_current_turn: relationshipGoalContract.active_progression_allowed
      ? 'one_reversible_stage_bounded_prompt'
      : 'analysis_or_context_capture_only'
  };
}

function buildPsychologicalComfortModel({
  stage,
  features,
  riskAnalysis,
  contextGapDiagnosis
}) {
  const heatScore = Number(clamp((
    featureValue(features, 'affective_heat')
    + featureValue(features, 'reciprocity_and_responsiveness')
    + featureValue(features, 'self_disclosure_breadth_depth')
  ) / 3).toFixed(4));
  const comfortScore = Number(clamp((
    featureValue(features, 'boundary_and_autonomy')
    + featureValue(features, 'conflict_repair_capacity')
    + featureValue(features, 'multi_window_evidence_coverage') * 0.7
    + featureValue(features, 'reciprocity_and_responsiveness')
  ) / 3.7).toFixed(4));
  const captureOnly = [
    'identity_confirmation_or_context_collection_hint',
    'read_or_capture_more_messages_before_stage_progression',
    'ask_for_current_message_or_keep_analysis_only'
  ].includes(contextGapDiagnosis.current_state_process_decision);
  let progressionIntensity = 'hold';
  if (riskAnalysis.risk_level === 'critical' || stage.code === 'RX') {
    progressionIntensity = 'manual_review_or_safety_hint';
  } else if (captureOnly || stage.code === 'R0') {
    progressionIntensity = 'context_capture';
  } else if (comfortScore < 0.38 || riskAnalysis.risk_level === 'warning') {
    progressionIntensity = 'repair_or_boundary_first';
  } else if (heatScore < 0.32) {
    progressionIntensity = 'warm_hold';
  } else if (heatScore < 0.62 || featureValue(features, 'multi_window_evidence_coverage') < 0.5) {
    progressionIntensity = 'micro_warmth';
  } else if (stage.code === 'R1' || stage.code === 'R2') {
    progressionIntensity = 'soft_invitation';
  } else if (stage.code === 'R3') {
    progressionIntensity = 'closeness_check';
  } else {
    progressionIntensity = 'manual_review_before_stronger_intimacy';
  }
  const dialogueActsByIntensity = {
    context_capture: ['context_capture_hint'],
    manual_review_or_safety_hint: ['risk_review_or_safety_hint'],
    repair_or_boundary_first: ['repair_acknowledgement', 'boundary_respect'],
    warm_hold: ['warm_context_holding'],
    micro_warmth: ['warm_affection_micro_progression'],
    soft_invitation: ['warm_presence_soft_invitation'],
    closeness_check: ['stage_bounded_closeness_check'],
    manual_review_before_stronger_intimacy: ['manual_review_before_stronger_intimacy']
  };
  return {
    schema_version: 'psychological_comfort_model.v1',
    current_stage: stage.code,
    heat_score: heatScore,
    comfort_score: comfortScore,
    progression_intensity: progressionIntensity,
    recommended_dialogue_act_ids: dialogueActsByIntensity[progressionIntensity] ?? ['warm_context_holding'],
    selected_default_intent_policy: progressionIntensity === 'micro_warmth'
      ? 'use_micro_progression_not_physical_closeness_by_default'
      : progressionIntensity === 'soft_invitation'
        ? 'use_soft_future_context_or_presence_invitation'
        : progressionIntensity === 'closeness_check'
          ? 'ask_plain_comfort_check_before_next_closeness'
          : 'hold_or_review_before_progression',
    comfort_guardrails: [
      'final_goal_does_not_directly_control_each_sentence',
      'every_sentence_has_stage_delta_heat_delta_expected_signal_and_fallback',
      'high_heat_physical_closeness_draft_requires_stronger_context_than_default',
      'target_can_decline_without_penalty'
    ],
    expected_feedback_to_observe: [
      'target_continues_or_stops_playful_tone',
      'target_accepts_or_declines_specific_next_step',
      'target_expresses_comfort_or_discomfort',
      'user_reports_whether_the_prompt_felt_natural'
    ]
  };
}

function buildRomanticUserVisibleReasoningLog({
  stage,
  identityAnalysis,
  contextGapDiagnosis,
  features,
  psychologicalComfortModel,
  stageTransitionAssessment,
  onlineOfflineProgressionTrack,
  dateTransitionReadiness,
  romanticProgressionCadence,
  relationshipGoalContract,
  recommended
}) {
  const strongestFeatures = [...features]
    .sort((a, b) => b.value - a.value)
    .slice(0, 4)
    .map((feature) => `${feature.feature_id}:${feature.status}`);
  return {
    schema_version: 'relationship_reasoning_log.v1',
    visible_to_user: true,
    visible_to_target: false,
    summary: '系统先判断目标人物和关系阶段，再用多时间窗、心理舒适度和专家矩阵决定本轮只做多大强度的提示。',
    steps: [
      {
        step_id: 'identity_and_stage',
        explanation: `主身份=${identityAnalysis.selected_primary_identity}，当前阶段=${stage.code}/${stage.stage_id}。`
      },
      {
        step_id: 'context_gap',
        explanation: `上下文诊断=${contextGapDiagnosis.diagnosis}，缺口=${contextGapDiagnosis.missing_context_windows.join(',') || 'none'}。`
      },
      {
        step_id: 'feature_convergence',
        explanation: `主要特征=${strongestFeatures.join('; ')}；特征是语义族，不是固定句式清单。`
      },
      {
        step_id: 'comfort_and_intensity',
        explanation: `热度=${psychologicalComfortModel.heat_score}，舒适度=${psychologicalComfortModel.comfort_score}，本轮强度=${psychologicalComfortModel.progression_intensity}。`
      },
      {
        step_id: 'transition_decision',
        explanation: `阶段迁移判断=${stageTransitionAssessment.transition_decision}，当前轮目标=${relationshipGoalContract.current_turn_goal}。`
      },
      {
        step_id: 'online_offline_progression',
        explanation: `线上轨=${onlineOfflineProgressionTrack.online_track.stage}/${onlineOfflineProgressionTrack.online_track.stage_id}，线下轨=${onlineOfflineProgressionTrack.offline_track.stage}/${onlineOfflineProgressionTrack.offline_track.stage_id}。`
      },
      {
        step_id: 'cadence_and_date_transition',
        explanation: `本轮意图=${romanticProgressionCadence.current_turn_intent}，节奏=${romanticProgressionCadence.cadence_decision}，见面转场=${dateTransitionReadiness.status}。`
      },
      {
        step_id: 'draft_intent',
        explanation: `草稿以用户第一人称输出，当前默认句=${recommended?.message_draft?.draft ?? '无'}。自动发送仍阻断。`
      }
    ]
  };
}

const ROMANTIC_EXPERT_DEFINITIONS = [
  {
    expert_id: 'relationship_stage_expert',
    discipline: 'relationship_stage',
    scope: 'romantic_goal_layer',
    weight_focus: { relationship_fit: 0.018, event_evidence: 0.01 }
  },
  {
    expert_id: 'attachment_psychology_expert',
    discipline: 'psychology_attachment_and_emotion',
    scope: 'romantic_goal_layer',
    weight_focus: { relationship_fit: 0.016, user_preference_fit: 0.008 }
  },
  {
    expert_id: 'game_theory_signal_expert',
    discipline: 'game_theory_and_repeated_interaction',
    scope: 'romantic_goal_layer',
    weight_focus: { goal_fit: 0.014, feedback_observability: 0.01 }
  },
  {
    expert_id: 'logic_and_evidence_expert',
    discipline: 'logic_and_evidence',
    scope: 'romantic_goal_layer',
    weight_focus: { event_evidence: 0.02, risk_control: 0.008 }
  },
  {
    expert_id: 'consent_and_boundary_expert',
    discipline: 'consent_boundary_and_autonomy_review',
    scope: 'audit_safety_layer',
    weight_focus: { risk_control: 0.02, norm_compliance: 0.012 }
  },
  {
    expert_id: 'coercion_and_pua_risk_expert',
    discipline: 'target_to_user_coercion_and_pua_risk',
    scope: 'target_to_user_only',
    weight_focus: { risk_control: 0.024, norm_compliance: 0.012 }
  },
  {
    expert_id: 'privacy_and_safety_expert',
    discipline: 'privacy_platform_and_real_world_safety',
    scope: 'audit_safety_layer',
    weight_focus: { risk_control: 0.018, norm_compliance: 0.012 }
  },
  {
    expert_id: 'communication_pragmatics_expert',
    discipline: 'communication_pragmatics',
    scope: 'romantic_goal_layer',
    weight_focus: { user_preference_fit: 0.014, relationship_fit: 0.008 }
  },
  {
    expert_id: 'feedback_learning_expert',
    discipline: 'feedback_learning_and_future_calibration',
    scope: 'feedback_layer',
    weight_focus: { feedback_observability: 0.018, timing_fit: 0.008 }
  }
];

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function targetDisplayNames({ goalInput, plan, contextSnapshot }) {
  const names = [
    plan.relationship_summary.person_name,
    ...(contextSnapshot.relationship_snapshot?.target_people ?? []).map((person) => person.display_name),
    goalInput.target_display_name,
    goalInput.primary_person_name
  ];
  return unique(names.map((name) => typeof name === 'string' ? name.trim() : null))
    .filter((name) => name && !['unknown', 'target'].includes(name.toLowerCase()));
}

function romanticIdentityLabels({ goalInput, plan, contextSnapshot }) {
  const targetPersonIds = contextSnapshot.goal?.target_person_ids ?? [];
  const targetPeople = contextSnapshot.relationship_snapshot?.target_people ?? [];
  const relationships = contextSnapshot.relationship_snapshot?.relationships ?? [];
  const inputLabels = Array.isArray(goalInput.identity_labels)
    ? goalInput.identity_labels
    : Array.isArray(goalInput.relationship_identity_labels)
      ? goalInput.relationship_identity_labels
      : [];
  const graphLabels = [
    plan.relationship_summary.type_code,
    plan.relationship_summary.relationship_type,
    plan.relationship_summary.phase,
    ...targetPeople.flatMap((person) => [...(person.roles ?? []), ...(person.tags ?? [])]),
    ...relationships.flatMap((relationship) => [relationship.type_code, relationship.phase])
  ];
  const labels = unique([...inputLabels, ...graphLabels]
    .map((label) => typeof label === 'string' ? label.trim() : null));
  const romanticLabels = labels.filter((label) => ROMANTIC_LABELS.has(label.toLowerCase()));
  const hasConfirmedRomantic = isConfirmedRomanticRelationship(plan)
    || romanticLabels.some((label) =>
      ['romantic_partner', 'romantic', 'lover', 'partner', 'boyfriend', 'girlfriend', 'confirmed_romantic']
        .includes(label.toLowerCase())
    );
  const hasCandidateRomantic = romanticLabels.length > 0 || containsPersonalRelationshipSignal(
    `${goalInput.initial_goal ?? ''}\n${goalInput.context_input ?? ''}`
  );
  return {
    target_person_ids: targetPersonIds,
    identity_labels: labels,
    romantic_identity_labels: romanticLabels,
    has_confirmed_romantic_identity: hasConfirmedRomantic,
    has_candidate_romantic_identity: hasCandidateRomantic,
    selected_primary_identity: hasConfirmedRomantic
      ? 'romantic_partner'
      : hasCandidateRomantic
        ? 'candidate_romantic_interest'
        : 'unconfirmed_or_non_romantic',
    label_source_policy: {
      identity_labels_are_optional_inputs: true,
      absence_behavior: 'continue_as_candidate_or_analysis_only_without_writing_confirmed_relationship_fact',
      multiple_identity_labels_allowed: true,
      template_priority_owned_by_identity_resolution_module: true,
      pt028_consumes_romantic_labels_only: true
    }
  };
}

function splitUtteranceSentences(text = '') {
  const normalized = String(text)
    .replace(/\s+/g, ' ')
    .replace(/^[\s,，。:：]+|[\s,，。:：]+$/g, '');
  if (!normalized) return [];
  const parts = normalized.match(/[^。！？!?]+[。！？!?]?/gu) ?? [normalized];
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function extractSpeakerSegments(contextText, speakerNames) {
  const names = unique([
    ...speakerNames,
    '用户',
    '我',
    'user',
    'User'
  ]).filter(Boolean);
  if (!contextText || !speakerNames.length) return [];
  const speakerPattern = names.map(escapeRegExp).join('|');
  const segments = [];
  for (const targetName of speakerNames) {
    const regex = new RegExp(
      `(?:^|[\\n。！？!?])\\s*${escapeRegExp(targetName)}\\s*[：:]\\s*([\\s\\S]*?)(?=(?:[\\n。！？!?]\\s*(?:${speakerPattern})\\s*[：:])|$)`,
      'gu'
    );
    let match = regex.exec(contextText);
    while (match) {
      segments.push({
        speaker_name: targetName,
        text: match[1]
      });
      match = regex.exec(contextText);
    }
  }
  return segments;
}

function extractTargetUtterances({ goalInput, plan, contextSnapshot, rawEvents = [] }) {
  const targetPersonId = goalInput.primary_person_id ?? contextSnapshot.goal?.target_person_ids?.[0] ?? null;
  const speakerNames = targetDisplayNames({ goalInput, plan, contextSnapshot });
  const utterances = [];
  const seen = new Set();
  const addUtterance = ({ text, source_type, evidence_refs, speaker_name = null }) => {
    for (const sentence of splitUtteranceSentences(text)) {
      const fingerprint = `${source_type}:${speaker_name ?? ''}:${sentence}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      utterances.push({
        utterance_id: `target_utterance_${utterances.length + 1}`,
        target_person_id: targetPersonId,
        target_display_name: speaker_name ?? speakerNames[0] ?? plan.relationship_summary.person_name ?? null,
        source_type,
        text: sentence,
        evidence_refs,
        window_refs: (contextSnapshot.target_context_windows ?? [])
          .find((target) => target.target_person_id === targetPersonId)
          ?.active_windows ?? []
      });
    }
  };

  for (const segment of extractSpeakerSegments(goalInput.context_input ?? '', speakerNames)) {
    addUtterance({
      text: segment.text,
      source_type: 'context_input_speaker_segment',
      evidence_refs: ['goal_context_input'],
      speaker_name: segment.speaker_name
    });
  }

  for (const rawEvent of rawEvents) {
    const rawTarget = rawEvent.speaker_person_id
      ?? rawEvent.actor_person_id
      ?? rawEvent.metadata?.speaker_person_id
      ?? rawEvent.metadata?.actor_person_id
      ?? null;
    const actorType = rawEvent.metadata?.source_actor_type
      ?? rawEvent.source_ref?.source_actor_type
      ?? rawEvent.actor_type
      ?? null;
    const linked = rawEvent.linked_person_ids ?? [];
    const isTarget = rawTarget === targetPersonId
      || actorType === 'target'
      || (targetPersonId && linked.includes(targetPersonId));
    if (!isTarget) continue;
    const text = rawEvent.content
      ?? rawEvent.text
      ?? rawEvent.content_summary
      ?? rawEvent.metadata?.ocr_text
      ?? null;
    if (!text) continue;
    addUtterance({
      text,
      source_type: 'raw_event_target_actor',
      evidence_refs: [rawEvent.event_id ?? 'raw_event'],
      speaker_name: speakerNames[0] ?? null
    });
  }

  if (!utterances.length && speakerNames.length) {
    const text = goalInput.context_input ?? '';
    for (const name of speakerNames) {
      if (!text.includes(name)) continue;
      const afterName = text
        .split(name)
        .slice(1)
        .join(name)
        .replace(/^[说称：:\s，,]+/u, '');
      if (afterName) {
        addUtterance({
          text: afterName,
          source_type: 'context_input_name_fallback',
          evidence_refs: ['goal_context_input'],
          speaker_name: name
        });
      }
      break;
    }
  }

  return utterances;
}

function detectRomanticRiskSignals(text = '') {
  const normalized = String(text).toLowerCase();
  const families = [];
  const add = (family, level, signals) => {
    if (signals.some((signal) => signal instanceof RegExp ? signal.test(normalized) : normalized.includes(signal))) {
      families.push({ family, level });
    }
  };
  add('explicit_refusal_ignored', 'critical', [/拒绝也没用/u, /不要也得/u, /stop.*does not matter/i]);
  add('threat_or_self_harm_pressure', 'critical', [/威胁/u, /报复/u, /自杀/u, /死给你看/u, /threat/i, /blackmail/i]);
  add('privacy_blackmail', 'critical', [/曝光/u, /公开你的/u, /发出去/u, /隐私/u, /截图/u, /leak/i]);
  add('sexual_boundary_pressure', 'critical', [/不.*亲密.*不算/u, /必须.*亲密/u, /必须.*发生/u, /开房/u, /sex/i]);
  add('guilt_pressure', 'warning', [/愧疚/u, /亏欠/u, /都是你的错/u, /证明你爱我/u, /guilt/i]);
  add('social_isolation', 'warning', [/不许.*朋友/u, /只能.*我/u, /别和.*联系/u, /isolate/i]);
  add('hot_cold_reward_punishment', 'watch', [/惩罚/u, /冷落/u, /不理你/u, /奖励/u]);
  add('boundary_discomfort', 'watch', [/不舒服/u, /别这样/u, /过了/u, /边界/u, /拒绝/u]);
  const levelRank = { low: 0, watch: 1, warning: 2, critical: 3 };
  const riskLevel = families.reduce((level, item) =>
    levelRank[item.level] > levelRank[level] ? item.level : level,
  families.length ? 'watch' : 'low');
  return {
    risk_level: riskLevel,
    signal_families: unique(families.map((item) => item.family)),
    triggered_signals: families
  };
}

function detectUserSideManipulationRisk(goalInput, recommended) {
  const text = `${goalInput.initial_goal ?? ''}\n${goalInput.context_input ?? ''}\n${recommended.message_draft?.draft ?? ''}`.toLowerCase();
  const signals = [];
  const add = (family, patterns) => {
    if (patterns.some((pattern) => pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern))) {
      signals.push(family);
    }
  };
  add('threat_or_pressure_in_user_goal_or_draft', [/威胁/u, /逼/u, /必须回复/u, /不然/u, /threat/i]);
  add('false_promise_or_deception_risk', [/骗/u, /套路/u, /假装/u, /虚假承诺/u]);
  add('privacy_intrusion_risk', [/套.*隐私/u, /曝光/u, /截图/u, /隐私/u]);
  add('boundary_testing_risk', [/试探.*身体/u, /越界/u, /不顾.*拒绝/u]);
  return {
    schema_version: 'user_side_manipulation_reviewer.v1',
    reviewer_id: 'user_side_manipulation_reviewer',
    separate_from_romantic_expert_matrix: true,
    scope: 'user_draft_goal_and_send_action_safety_review',
    risk_level: signals.length ? 'watch' : 'low',
    signal_families: signals,
    review_recommendation: signals.length
      ? 'manual_review_or_rewrite_before_any_external_draft'
      : 'no_user_side_manipulation_signal_detected_in_rule_based_review'
  };
}

function inferRomanticStage({ goalInput, plan, identityAnalysis, riskAnalysis, utterances }) {
  const text = `${goalInput.initial_goal ?? ''}\n${goalInput.context_input ?? ''}\n${utterances.map((item) => item.text).join('\n')}`;
  const hasTarget = Boolean(goalInput.primary_person_id || identityAnalysis.target_person_ids.length);
  if (!hasTarget) return ROMANTIC_STAGE_DEFINITIONS.R0;
  if (riskAnalysis.risk_level === 'critical') return ROMANTIC_STAGE_DEFINITIONS.RX;
  if (/生理亲密已确认|性关系已确认|双方确认.*生理亲密|confirmed physical intimacy|mutual sexual intimacy/iu.test(text)) {
    return ROMANTIC_STAGE_DEFINITIONS.R6;
  }
  if (/避孕|健康|亲密边界|身体边界|排他性|节奏|安全套|std|contraception/iu.test(text)) {
    return ROMANTIC_STAGE_DEFINITIONS.R5;
  }
  if (/接吻|亲吻|热吻|更强亲密|kiss/iu.test(text)) {
    return ROMANTIC_STAGE_DEFINITIONS.R4;
  }
  if (/牵手|拥抱|依偎|搂着|抱在一起|hand.?hold|hug/iu.test(text)) {
    return ROMANTIC_STAGE_DEFINITIONS.R3;
  }
  if (identityAnalysis.has_confirmed_romantic_identity) {
    return ROMANTIC_STAGE_DEFINITIONS.R2;
  }
  if (identityAnalysis.has_candidate_romantic_identity || isPersonalSocialContext(goalInput, plan)) {
    return ROMANTIC_STAGE_DEFINITIONS.R1;
  }
  return ROMANTIC_STAGE_DEFINITIONS.R0;
}

function physicalIntimacyStateForStage(stageCode) {
  if (stageCode === 'R6') return 'confirmed_by_mutual_consent';
  if (stageCode === 'R4' || stageCode === 'R5') return 'kissing_or_stronger_affection';
  if (stageCode === 'R3') return 'nonsexual_affection';
  if (stageCode === 'RX') return 'blocked_or_unsafe';
  return 'none_or_unknown';
}

function buildRomanticRelationshipGoalContract({ stage, riskAnalysis, contextGapDiagnosis, identityAnalysis }) {
  const stageCode = stage.code;
  const captureOnly = [
    'identity_confirmation_or_context_collection_hint',
    'read_or_capture_more_messages_before_stage_progression',
    'ask_for_current_message_or_keep_analysis_only'
  ].includes(contextGapDiagnosis.current_state_process_decision);
  const activeProgressionAllowed = !captureOnly
    && riskAnalysis.risk_level !== 'critical'
    && !['R0', 'RX', 'R6'].includes(stageCode);
  const nextStepByStage = {
    R1: ['confirm_target_identity_and_interest', 'invite_low_pressure_relationship_definition_probe'],
    R2: ['use_warm_affection_micro_progression', 'invite_future_presence_or_meeting_context_when_heat_allows', 'ask_plain_comfort_if_touch_or_closeness_is_suggested', 'write_response_as_R3_candidate_evidence_only_after_feedback'],
    R3: ['stabilize_nonsexual_affection_feedback', 'ask_preference_for_next_date_or_kissing_boundary_conversation'],
    R4: ['manual_review_before_stronger_intimacy_or_boundary_conversation', 'clarify_comfort_boundary_and_revocability'],
    R5: ['manual_review_consent_boundary_health_and_privacy_before_R6_fact_record'],
    R6: ['relationship_health_feedback_and_privacy_protection']
  };
  return {
    schema_version: 'romantic_relationship_goal_contract.v1',
    final_goal_state: 'R6_physical_intimacy_confirmed_relationship_goal_state',
    final_goal_definition: '双方确认后的生理亲密关系状态，可作为关系确认事实和图谱状态记录。',
    current_stage: stageCode,
    stage_gap_to_final_goal: stageCode === 'R6'
      ? []
      : ['R3_nonsexual_affection', 'R4_kissing_or_stronger_affection', 'R5_explicit_boundary_discussion', 'R6_mutual_confirmed_physical_intimacy'].filter((step) => {
          const order = { R1: 1, R2: 2, R3: 3, R4: 4, R5: 5, R6: 6, R0: 0, RX: -1 };
          const stepStage = step.slice(0, 2);
          return (order[stepStage] ?? 0) > (order[stageCode] ?? 0);
        }),
    current_turn_goal: activeProgressionAllowed
      ? 'advance_one_reversible_stage_signal'
      : captureOnly
        ? 'confirm_identity_or_capture_current_message_before_progression'
        : stageCode === 'R6'
          ? 'maintain_relationship_health_and_privacy'
          : 'risk_or_boundary_review_before_progression',
    active_progression_allowed: activeProgressionAllowed,
    direct_progression_policy: {
      direct_progression_allowed: activeProgressionAllowed,
      meaning: '允许给出当前阶段到下一阶段的一阶、可拒绝、可回写推进建议；不是强制推进、越级推进或自动发送。',
      forbids: [
        'pressure_or_guilt',
        'stage_skip_to_R6',
        'claiming_consent_without_evidence',
        'turning_final_goal_into_public_message'
      ]
    },
    next_step_recommendations: nextStepByStage[stageCode] ?? ['collect_context_and_user_confirmation'],
    missing_progression_evidence: unique([
      identityAnalysis.has_confirmed_romantic_identity ? null : 'confirmed_romantic_identity',
      ...(contextGapDiagnosis.missing_context_windows ?? []).map((windowId) => `${windowId}_context`),
      stageCode === 'R6' ? null : 'mutual_confirmed_physical_intimacy_record_for_R6'
    ]),
    feedback_to_record: [
      'target_accepts_or_declines_next_step',
      'target_comfort_level',
      'boundary_signal',
      'user_satisfaction_with_progression'
    ]
  };
}

function consentReadinessForStage({ stage, riskAnalysis, identityAnalysis }) {
  const checks = [
    {
      check_id: 'adult_or_age_safe',
      status: stage.code === 'R4' || stage.code === 'R5' || stage.code === 'R6' ? 'unknown_requires_review' : 'not_required_for_current_output'
    },
    { check_id: 'sober_and_clear', status: 'unknown_requires_review_if_physical_intimacy_is_discussed' },
    { check_id: 'voluntary', status: riskAnalysis.risk_level === 'critical' ? 'failed_or_blocked' : 'not_contraindicated_by_current_signals' },
    { check_id: 'revocable', status: 'must_remain_explicit_in_future_boundary_discussion' },
    { check_id: 'no_coercion', status: riskAnalysis.risk_level === 'critical' ? 'failed_or_blocked' : 'no_target_to_user_critical_signal_detected' },
    { check_id: 'no_pressure', status: riskAnalysis.risk_level === 'warning' || riskAnalysis.risk_level === 'critical' ? 'needs_manual_review' : 'pass_for_low_pressure_draft' },
    { check_id: 'identity_confirmed', status: identityAnalysis.has_confirmed_romantic_identity ? 'confirmed_or_graph_supported' : 'candidate_or_missing' },
    { check_id: 'window_confirmed', status: identityAnalysis.target_person_ids.length ? 'target_person_id_available' : 'missing_target_person_id' }
  ];
  const failed = checks.some((check) => check.status === 'failed_or_blocked');
  const needsReview = checks.some((check) => String(check.status).includes('review') || String(check.status).includes('unknown'));
  return {
    schema_version: 'romantic_consent_readiness.v1',
    status: failed
      ? 'blocked'
      : stage.code === 'R1' || stage.code === 'R2' || stage.code === 'R3'
        ? 'sufficient_for_low_pressure_non_physical_draft'
        : needsReview
          ? 'requires_manual_review'
          : 'pass',
    checks,
    policy: {
      no_physical_intimacy_consent_inferred_from_romantic_identity: true,
      no_physical_intimacy_advancement_draft: true
    }
  };
}

function targetWindowEvidence(contextSnapshot, targetPersonId) {
  const target = (contextSnapshot.target_context_windows ?? [])
    .find((item) => item.target_person_id === targetPersonId)
    ?? (contextSnapshot.target_context_windows ?? [])[0]
    ?? null;
  if (!target) return [];
  return (target.windows ?? []).map((window) => ({
    window_id: window.window_id === 'historical' ? 'historical_stage' : window.window_id,
    has_context: window.has_context,
    event_count: window.event_count,
    raw_event_count: window.raw_event_count,
    summaries: window.summaries ?? [],
    source_refs: window.source_refs ?? []
  }));
}

function diagnoseRomanticContextGap({
  goalInput,
  targetPersonId,
  utterances,
  evidenceWindows,
  stage,
  identityAnalysis,
  rawEvents = []
}) {
  const requiredWindowIds = ['today', 'last_7_days', 'last_30_days', 'historical_stage'];
  const windowContextPresence = evidenceWindows
    .filter((window) => window.has_context)
    .map((window) => window.window_id);
  const rawEventIds = new Set(rawEvents.map((rawEvent) => rawEvent.event_id).filter(Boolean));
  const todayRefs = new Set(
    evidenceWindows.find((window) => window.window_id === 'today')?.source_refs ?? []
  );
  const independentWindows = evidenceWindows
    .filter((window) => {
      if (!window.has_context) return false;
      if (window.window_id === 'today') return true;
      return (window.source_refs ?? []).some((ref) => !todayRefs.has(ref) && !rawEventIds.has(ref));
    })
    .map((window) => window.window_id);
  const missingWindows = requiredWindowIds.filter((windowId) => !independentWindows.includes(windowId));
  const contextText = `${goalInput.context_input ?? ''}\n${goalInput.content_text ?? ''}`;
  const captureGapSignal = /OCR.*not.*return|did not return usable|没有读取|没读取|未读取|未采集|无可用聊天|无聊天内容|截图.*未|capture.*missing|no visible chat text|not read/i
    .test(contextText);
  const targetRawEvents = rawEvents.filter((rawEvent) => {
    const linked = rawEvent.linked_person_ids ?? [];
    const actorId = rawEvent.speaker_person_id
      ?? rawEvent.actor_person_id
      ?? rawEvent.metadata?.speaker_person_id
      ?? rawEvent.metadata?.actor_person_id
      ?? null;
    const actorType = rawEvent.metadata?.source_actor_type
      ?? rawEvent.source_ref?.source_actor_type
      ?? rawEvent.actor_type
      ?? null;
    return actorId === targetPersonId
      || actorType === 'target'
      || (targetPersonId && linked.includes(targetPersonId));
  });
  const rawEventsWithoutReadableText = targetRawEvents.filter((rawEvent) => !(
    rawEvent.content
    || rawEvent.text
    || rawEvent.content_summary
    || rawEvent.metadata?.ocr_text
  ));

  let diagnosis = 'sufficient_multi_window_context';
  let currentStateProcessDecision = 'give_stage_process_content_suggestion';
  let confidence = 0.78;
  if (!targetPersonId || !identityAnalysis.has_candidate_romantic_identity) {
    diagnosis = 'identity_or_window_unconfirmed';
    currentStateProcessDecision = 'identity_confirmation_or_context_collection_hint';
    confidence = 0.64;
  } else if (!utterances.length && (captureGapSignal || rawEventsWithoutReadableText.length || !independentWindows.length)) {
    diagnosis = 'messages_may_exist_but_not_read_or_extracted';
    currentStateProcessDecision = 'read_or_capture_more_messages_before_stage_progression';
    confidence = captureGapSignal ? 0.76 : 0.68;
  } else if (!utterances.length) {
    diagnosis = 'no_current_target_message_available';
    currentStateProcessDecision = 'ask_for_current_message_or_keep_analysis_only';
    confidence = 0.62;
  } else if (missingWindows.length) {
    diagnosis = 'current_message_available_but_history_incomplete';
    currentStateProcessDecision = 'give_current_stage_content_suggestion_and_request_history_capture_for_stage_upgrade';
    confidence = 0.72;
  }

  return {
    schema_version: 'romantic_context_gap_diagnosis.v1',
    diagnosis,
    confidence,
    target_person_id: targetPersonId,
    target_utterance_count: utterances.length,
    available_context_windows: independentWindows,
    missing_context_windows: missingWindows,
    window_context_presence: windowContextPresence,
    independent_window_policy: {
      cumulative_windows_do_not_equal_history_sufficiency: true,
      non_today_windows_require_source_refs_not_already_used_by_today: true,
      current_raw_events_without_time_anchor_do_not_count_as_historical_context: true
    },
    capture_gap_signals: {
      context_text_mentions_unread_or_uncaptured_messages: captureGapSignal,
      target_raw_event_count: targetRawEvents.length,
      target_raw_events_without_readable_text: rawEventsWithoutReadableText.length
    },
    current_relationship_stage: stage.code,
    treats_missing_history_as_stage_stability: false,
    current_state_process_decision: currentStateProcessDecision,
    recommendation: diagnosis === 'messages_may_exist_but_not_read_or_extracted'
      ? '先读取或采集目标对象当前可见消息，再判断是否需要推进阶段；不要把缺失内容误判为关系停滞。'
      : diagnosis === 'current_message_available_but_history_incomplete'
        ? '可以基于当前阶段给出低压力内容提示，但阶段升级必须等待更多历史窗口或用户确认。'
        : diagnosis === 'sufficient_multi_window_context'
          ? '可以把当前阶段与历史窗口一起用于专家矩阵权衡和内容提示。'
          : '先确认目标人物、窗口和当前消息，再生成面向目标对象的内容提示。'
  };
}

function buildRomanticOutputDeliveryPolicy({
  allowedOutputLevel,
  contextGapDiagnosis,
  recommended
}) {
  const captureHintDecisions = new Set([
    'identity_confirmation_or_context_collection_hint',
    'read_or_capture_more_messages_before_stage_progression',
    'ask_for_current_message_or_keep_analysis_only'
  ]);
  const currentMode = allowedOutputLevel === 'send_blocked'
    ? 'user_visible_safety_hint'
    : captureHintDecisions.has(contextGapDiagnosis.current_state_process_decision)
      ? 'context_capture_hint'
      : allowedOutputLevel === 'manual_review_required'
        ? 'manual_review_prompt_with_content_suggestion'
        : allowedOutputLevel === 'analysis_only'
          ? 'analysis_hint'
          : 'content_suggestion';
  return {
    schema_version: 'target_output_delivery_policy.v1',
    system_goal: '根据目标对象与当前关系进程，提供对应内容提示；未来受控代输入必须经过独立发送门禁。',
    auto_send_blocked_default: true,
    default_when_auto_send_blocked: 'content_suggestion_or_context_capture_hint',
    current_output_mode: currentMode,
    content_suggestion_available: Boolean(recommended?.message_draft?.draft)
      && !['send_blocked'].includes(allowedOutputLevel)
      && currentMode !== 'context_capture_hint',
    delegated_input_allowed_after_confirmation: true,
    automatic_send_allowed: false,
    real_send_requires_gates: [
      'target_analysis_review_gate',
      'draft_safety_review_gate',
      'user_confirmation',
      'target_window_verification',
      'platform_preview',
      'audit_record_ready'
    ],
    ui_instruction: currentMode === 'context_capture_hint'
      ? '提示用户先读取或采集目标对象当前消息，不把上下文缺口误当作关系阶段停滞。'
      : currentMode === 'user_visible_safety_hint'
        ? '仅展示用户可见安全提示，不生成对外发送内容。'
        : '展示可编辑内容提示，用户确认后才可进入受控代输入或发送流程。'
  };
}

export function buildRomanticGoalAnalysis({
  goalInput,
  plan,
  contextSnapshot,
  rawEvents = [],
  recommended,
  feedbackPlan,
  validationPlan,
  independentReview = null
}) {
  const identityAnalysis = romanticIdentityLabels({ goalInput, plan, contextSnapshot });
  const utterances = extractTargetUtterances({ goalInput, plan, contextSnapshot, rawEvents });
  const sourceText = romanticSourceText({ goalInput, utterances, rawEvents });
  const riskAnalysis = detectRomanticRiskSignals(sourceText);
  const stage = inferRomanticStage({
    goalInput,
    plan,
    identityAnalysis,
    riskAnalysis,
    utterances
  });
  const consentReadiness = consentReadinessForStage({ stage, riskAnalysis, identityAnalysis });
  const targetPersonId = goalInput.primary_person_id ?? identityAnalysis.target_person_ids[0] ?? null;
  const physicalIntimacyState = physicalIntimacyStateForStage(stage.code);
  const riskBlocksDraft = riskAnalysis.risk_level === 'critical';
  const allowedOutputLevel = riskBlocksDraft
    ? 'send_blocked'
    : stage.allowed_output_level;
  const evidenceWindows = targetWindowEvidence(contextSnapshot, targetPersonId);
  const contextGapDiagnosis = diagnoseRomanticContextGap({
    goalInput,
    targetPersonId,
    utterances,
    evidenceWindows,
    stage,
    identityAnalysis,
    rawEvents
  });
  const semanticFeatures = buildRomanticSemanticFeatures({
    goalInput,
    identityAnalysis,
    riskAnalysis,
    utterances,
    evidenceWindows,
    rawEvents
  });
  const relationshipGoalContract = buildRomanticRelationshipGoalContract({
    stage,
    riskAnalysis,
    contextGapDiagnosis,
    identityAnalysis
  });
  const psychologicalComfortModel = buildPsychologicalComfortModel({
    stage,
    features: semanticFeatures,
    riskAnalysis,
    contextGapDiagnosis
  });
  const stageTransitionAssessment = buildRomanticStageTransitionAssessment({
    stage,
    relationshipGoalContract,
    psychologicalComfortModel,
    features: semanticFeatures,
    contextGapDiagnosis,
    riskAnalysis
  });
  const onlineOfflineProgressionTrack = buildOnlineOfflineProgressionTrack({
    stage,
    contextGapDiagnosis,
    riskAnalysis,
    features: semanticFeatures,
    utterances,
    sourceText
  });
  const dateTransitionReadiness = buildDateTransitionReadiness({
    stage,
    contextGapDiagnosis,
    riskAnalysis,
    features: semanticFeatures,
    psychologicalComfortModel,
    onlineOfflineProgressionTrack
  });
  const romanticProgressionCadence = buildRomanticProgressionCadence({
    stage,
    riskAnalysis,
    contextGapDiagnosis,
    psychologicalComfortModel,
    stageTransitionAssessment,
    onlineOfflineProgressionTrack,
    dateTransitionReadiness
  });
  const outputDeliveryPolicy = buildRomanticOutputDeliveryPolicy({
    allowedOutputLevel,
    contextGapDiagnosis,
    recommended
  });
  const userVisibleReasoningLog = buildRomanticUserVisibleReasoningLog({
    stage,
    identityAnalysis,
    contextGapDiagnosis,
    features: semanticFeatures,
    psychologicalComfortModel,
    stageTransitionAssessment,
    onlineOfflineProgressionTrack,
    dateTransitionReadiness,
    romanticProgressionCadence,
    relationshipGoalContract,
    recommended
  });
  const missingEvidence = unique([
    identityAnalysis.has_confirmed_romantic_identity ? null : 'confirmed_romantic_identity_or_user_confirmation',
    ...contextGapDiagnosis.missing_context_windows.map((windowId) => `${windowId}_context`),
    stage.code === 'R6' ? null : 'mutual_confirmed_physical_intimacy_record_for_R6'
  ]);
  const upstreamChecks = [
    { check_id: 'goal_available', passed: Boolean(goalInput.initial_goal) },
    { check_id: 'target_person_id_available', passed: Boolean(targetPersonId) },
    { check_id: 'identity_labels_optional_contract_available', passed: true },
    { check_id: 'relationship_snapshot_available', passed: Boolean(contextSnapshot.relationship_snapshot) },
    { check_id: 'event_snapshot_available', passed: Boolean(contextSnapshot.event_snapshot) },
    { check_id: 'target_context_windows_available', passed: Array.isArray(contextSnapshot.target_context_windows) }
  ];
  const downstreamChecks = [
    { check_id: 'message_draft_available', passed: Boolean(recommended?.message_draft?.draft) },
    { check_id: 'feedback_writeback_plan_available', passed: Boolean(feedbackPlan?.event_writeback) },
    { check_id: 'validation_plan_available', passed: Boolean(validationPlan?.proof_required) },
    { check_id: 'independent_review_available', passed: Boolean(independentReview?.schema_version) },
    { check_id: 'real_send_blocked_by_default', passed: independentReview?.real_execution_allowed === false }
  ];
  const upstreamClosed = upstreamChecks.every((check) => check.passed);
  const downstreamClosed = downstreamChecks.every((check) => check.passed);

  return {
    schema_version: 'romantic_goal_analysis.v1',
    analysis_id: createRuntimeId('romantic_goal_analysis'),
    target_person_id: targetPersonId,
    target_display_name: targetDisplayNames({ goalInput, plan, contextSnapshot })[0] ?? null,
    source_context_id: contextSnapshot.snapshot_id,
    identity_label_policy: identityAnalysis.label_source_policy,
    identity_label_analysis: identityAnalysis,
    test_fixture_policy: {
      specific_person_name_hardcoded: false,
      generic_runtime_uses_target_person_id_and_identity_labels: true,
      fixture_names_are_test_data_only: true,
      fixture_default_stage_does_not_apply_to_other_targets: true
    },
    primary_relationship_identity: identityAnalysis.selected_primary_identity,
    primary_relationship_stage: stage.code,
    primary_relationship_stage_id: stage.stage_id,
    stage_evidence: {
      confirmed_romantic_identity: identityAnalysis.has_confirmed_romantic_identity,
      candidate_romantic_identity: identityAnalysis.has_candidate_romantic_identity,
      target_utterance_count: utterances.length,
      evidence_windows: evidenceWindows
    },
    stage_missing_evidence: missingEvidence,
    physical_intimacy_state: physicalIntimacyState,
    physical_intimacy_goal_state: {
      relationship_goal_state: true,
      current_status: stage.code === 'R6'
        ? 'achieved_by_confirmed_record'
        : stage.code === 'R0' || stage.code === 'RX'
          ? 'not_applicable_until_identity_and_safety_review_pass'
          : 'not_achieved_or_not_evidenced',
      optimization_kpi: false,
      forced_action_metric: false,
      automatic_send_metric: false,
      future_exception_interface: {
        supported: true,
        current_exception_reason: null,
        allowed_reason_families: ['health', 'psychological', 'values', 'culture', 'other_personal_reason']
      }
    },
    relationship_gradient_framework: RELATIONSHIP_GRADIENT_FRAMEWORK,
    romantic_stage_gradient: ROMANTIC_STAGE_GRADIENT_DEFINITIONS,
    semantic_feature_assessment: {
      schema_version: 'romantic_semantic_feature_assessment.v1',
      dynamic_feature_based: true,
      fixed_phrase_matching_is_only_rule_based_evidence: true,
      features: semanticFeatures
    },
    relationship_goal_contract: relationshipGoalContract,
    psychological_comfort_model: psychologicalComfortModel,
    stage_transition_assessment: stageTransitionAssessment,
    online_offline_progression_track: onlineOfflineProgressionTrack,
    date_transition_readiness: dateTransitionReadiness,
    romantic_progression_cadence: romanticProgressionCadence,
    consent_readiness: consentReadiness,
    context_gap_diagnosis: contextGapDiagnosis,
    output_delivery_policy: outputDeliveryPolicy,
    user_visible_reasoning_log: userVisibleReasoningLog,
    target_utterances: utterances,
    pua_or_coercion_risk: {
      schema_version: 'coercion_and_pua_risk_expert.v1',
      scope: 'target_to_user_only',
      ...riskAnalysis,
      review_recommendation: riskAnalysis.risk_level === 'critical'
        ? 'block_external_draft_and_require_manual_review'
        : riskAnalysis.risk_level === 'warning'
          ? 'manual_review_before_external_draft'
          : riskAnalysis.risk_level === 'watch'
            ? 'write_user_visible_log_and_keep_low_pressure'
            : 'no_target_to_user_coercion_signal_detected'
    },
    user_visible_log_decision: {
      schema_version: 'relationship_safety_log.v1',
      visible_to_user: ['watch', 'warning', 'critical'].includes(riskAnalysis.risk_level),
      visible_to_target: false,
      risk_level: riskAnalysis.risk_level,
      summary: riskAnalysis.risk_level === 'low'
        ? 'no_user_visible_safety_log_required_by_rule_review'
        : 'show_deidentified_risk_summary_to_user_only'
    },
    allowed_output_level: allowedOutputLevel,
    draft_scope: {
      low_pressure_only: true,
      editable: true,
      no_physical_intimacy_advancement_draft: !relationshipGoalContract.active_progression_allowed,
      stage_appropriate_active_progression_allowed: relationshipGoalContract.active_progression_allowed,
      no_stage_skipping_or_unconsented_progression: true,
      no_relationship_fact_externalization: true
    },
    send_gate_precondition: {
      real_execution_allowed: false,
      required_gates: [
        'target_analysis_review_gate',
        'draft_safety_review_gate',
        'user_confirmation',
        'target_window_verification',
        'platform_preview',
        'audit_record_ready'
      ]
    },
    upstream_downstream_closure: {
      schema_version: 'pt028_upstream_downstream_closure.v1',
      upstream_checks: upstreamChecks,
      downstream_checks: downstreamChecks,
      upstream_closed: upstreamClosed,
      downstream_closed: downstreamClosed,
      gate_decision: upstreamClosed && downstreamClosed
        ? 'pt028_upstream_downstream_closed'
        : 'pt028_closure_incomplete'
    }
  };
}

function windowStatusForExpert(romanticGoalAnalysis) {
  return (romanticGoalAnalysis.stage_evidence.evidence_windows ?? []).map((window) => ({
    window_id: window.window_id,
    status: window.has_context ? 'has_stage_context' : 'missing_stage_context',
    signal_count: (window.event_count ?? 0) + (window.raw_event_count ?? 0),
    evidence_refs: window.source_refs ?? []
  }));
}

function romanticGradientAdviceForExpert(expertId, romanticGoalAnalysis) {
  const stage = romanticGoalAnalysis.primary_relationship_stage;
  const intensity = romanticGoalAnalysis.psychological_comfort_model?.progression_intensity ?? 'hold';
  const transitionDecision = romanticGoalAnalysis.stage_transition_assessment?.transition_decision ?? 'unknown';
  const promptBase = `当前阶段 ${stage}，本轮强度 ${intensity}，迁移判断 ${transitionDecision}`;
  const adviceByExpert = {
    relationship_stage_expert: {
      advice_id: 'stage_bounded_progression',
      advice: '只按当前梯度给一阶建议；只有下一阶段语义特征收敛且多窗口证据足够时，才进入下一阶段复核。',
      user_prompt_hint: `${promptBase}。建议你先做当前阶段的一小步，不要把下一阶段当成已经发生。`
    },
    attachment_psychology_expert: {
      advice_id: 'comfort_before_intensity',
      advice: '优先维护安全感、可退路和情绪承接；热度不足时用陪伴和轻微调侃，不直接推动身体靠近。',
      user_prompt_hint: `${promptBase}。这句更适合让对方觉得被接住，而不是被要求立刻升级。`
    },
    game_theory_signal_expert: {
      advice_id: 'small_reversible_signal',
      advice: '选择成本低、可拒绝、可观察反馈的信号，让对方回应决定下一轮权重。',
      user_prompt_hint: `${promptBase}。用一个小信号测试对方是否愿意继续靠近，再记录反馈。`
    },
    logic_and_evidence_expert: {
      advice_id: 'separate_fact_from_inference',
      advice: '把已发生事实、阶段推断和缺失证据分开；缺少历史窗口时不能把当前热度升格为稳定阶段。',
      user_prompt_hint: `${promptBase}。目前只能说明当轮互动倾向，不能直接证明长期阶段已经升级。`
    },
    consent_and_boundary_expert: {
      advice_id: 'autonomy_and_comfort_check',
      advice: ['R4', 'R5', 'R6'].includes(stage)
        ? '涉及更强亲密、边界或身体目标时进入人工复核。'
        : '允许阶段内低压力提示；如果句子触及身体靠近，必须转成明确舒适度询问。',
      user_prompt_hint: `${promptBase}。任何靠近都要让对方能轻松说不，并且不会损害关系。`
    },
    coercion_and_pua_risk_expert: {
      advice_id: 'target_to_user_pressure_watch',
      advice: '只检测目标对象对用户的孤立、羞辱、愧疚施压、威胁或隐私勒索信号，不审查用户侧行为。',
      user_prompt_hint: `${promptBase}。当前提示只记录对方是否对你施压，用户侧行为由独立模块审查。`
    },
    privacy_and_safety_expert: {
      advice_id: 'keep_internal_analysis_private',
      advice: '阶段、风险和目标分析只能给用户看，不得发送给目标对象。',
      user_prompt_hint: `${promptBase}。对方只应看到你最终确认过的自然回复，不应看到系统推理。`
    },
    communication_pragmatics_expert: {
      advice_id: 'first_person_intentful_sentence',
      advice: '草稿必须是用户第一人称自然句，并能解释话语行为、意图、热度变化、预期反馈和退路。',
      user_prompt_hint: `${promptBase}。这句要像你自己说的话，并且知道自己想观察什么反馈。`
    },
    feedback_learning_expert: {
      advice_id: 'write_feedback_for_next_weight',
      advice: '对方下一句、用户体感和是否继续推进都要回写，用于校准下一轮专家权重。',
      user_prompt_hint: `${promptBase}。发不发都要记录你的判断和对方反馈，下一轮才不会重复原地打转。`
    }
  };
  return adviceByExpert[expertId] ?? {
    advice_id: 'keep_user_confirmation_gate',
    advice: '保留用户确认和发送阻断。',
    user_prompt_hint: `${promptBase}。建议保持人工确认。`
  };
}

function romanticSentenceExpertReview(expert, utterance, romanticGoalAnalysis) {
  const windowStatus = windowStatusForExpert(romanticGoalAnalysis);
  const activeWindows = windowStatus.filter((window) => window.status === 'has_stage_context').length;
  const coverage = windowStatus.length ? activeWindows / windowStatus.length : 0;
  const targetRiskLevel = romanticGoalAnalysis.pua_or_coercion_risk.risk_level;
  const baseConfidence = Number(clamp(0.42 + coverage * 0.32 + (utterance.text.length > 8 ? 0.08 : 0)).toFixed(4));
  const riskWeight = targetRiskLevel === 'critical' ? 0.04 : targetRiskLevel === 'warning' ? 0.026 : targetRiskLevel === 'watch' ? 0.012 : 0;
  const weightDelta = Object.fromEntries(
    Object.entries(expert.weight_focus).map(([criterion, value]) => [
      criterion,
      Number((value * baseConfidence + (criterion === 'risk_control' ? riskWeight : 0)).toFixed(4))
    ])
  );
  const stage = romanticGoalAnalysis.primary_relationship_stage;
  const findings = {
    relationship_stage_expert: `sentence_supports_stage_${stage}_and_requires_gradient_transition_assessment_before_upgrade`,
    attachment_psychology_expert: 'analyze_emotional_safety_and_attachment_signal_without_pathologizing_target',
    game_theory_signal_expert: 'treat_sentence_as_repeat_interaction_signal_and_select_smallest_reversible_progression_step',
    logic_and_evidence_expert: 'separate_sentence_fact_from_stage_inference_and_missing_evidence',
    consent_and_boundary_expert: 'no_physical_intimacy_consent_is_inferred_from_this_sentence',
    coercion_and_pua_risk_expert: targetRiskLevel === 'low'
      ? 'no_target_to_user_coercion_signal_detected_in_rule_review'
      : 'target_to_user_coercion_or_pressure_signal_requires_review',
    privacy_and_safety_expert: 'keep_sensitive_relationship_analysis_user_visible_only_and_target_invisible',
    communication_pragmatics_expert: 'prefer_first_person_editable_reply_with_explicit_dialogue_intent',
    feedback_learning_expert: 'record_next_reply_and_user_feedback_for_progression_calibration'
  };
  const reviewRecommendations = {
    relationship_stage_expert: 'use_current_gradient_step_and_do_not_upgrade_without_feature_convergence',
    attachment_psychology_expert: 'match_sentence_intensity_to_psychological_comfort_model',
    game_theory_signal_expert: 'choose_small_reversible_signal_and_measure_feedback',
    logic_and_evidence_expert: 'lower_confidence_when_four_window_evidence_is_missing',
    consent_and_boundary_expert: stage === 'R4' || stage === 'R5' || stage === 'R6'
      ? 'manual_review_before_any_external_draft'
      : 'allow_stage_bounded_prompt_and_require_comfort_check_if_touch_is_suggested',
    coercion_and_pua_risk_expert: targetRiskLevel === 'critical'
      ? 'block_external_draft_and_write_user_visible_risk_log'
      : targetRiskLevel === 'warning'
        ? 'manual_review_before_external_draft'
        : 'keep_monitoring_target_to_user_pressure_only',
    privacy_and_safety_expert: 'do_not_send_internal_stage_or_risk_analysis_to_target',
    communication_pragmatics_expert: 'draft_must_include_dialogue_intent_contract_and_remain_stage_bounded',
    feedback_learning_expert: 'feedback_calibrates_next_progression_step_not_R6_auto_upgrade'
  };
  const gradientAdvice = romanticGradientAdviceForExpert(expert.expert_id, romanticGoalAnalysis);
  return {
    review_id: `${utterance.utterance_id}_${expert.expert_id}`,
    utterance_id: utterance.utterance_id,
    expert_id: expert.expert_id,
    discipline: expert.discipline,
    scope: expert.scope,
    context_policy: {
      reads_today_week_month_and_historical_windows: true,
      latest_message_only_allowed: false,
      independent_before_merge: true
    },
    window_status: windowStatus,
    gradient_stage_id: romanticGoalAnalysis.primary_relationship_stage_id,
    stage_transition_view: {
      transition_decision: romanticGoalAnalysis.stage_transition_assessment?.transition_decision ?? 'unknown',
      next_stage_candidate: romanticGoalAnalysis.stage_transition_assessment?.next_stage_candidate ?? null,
      current_turn_action_intensity: romanticGoalAnalysis.stage_transition_assessment?.current_turn_action_intensity ?? 'unknown'
    },
    finding: findings[expert.expert_id] ?? 'romantic_sentence_review_completed',
    confidence: baseConfidence,
    weight_delta: weightDelta,
    risk_level: expert.expert_id === 'coercion_and_pua_risk_expert' ? targetRiskLevel : 'low',
    progression_gradient_advice: gradientAdvice,
    user_prompt_hint: gradientAdvice.user_prompt_hint,
    review_recommendation: reviewRecommendations[expert.expert_id] ?? 'keep_user_confirmation_gate',
    evidence_refs: unique([...(utterance.evidence_refs ?? []), 'romantic_goal_analysis'])
  };
}

function buildThirdPartyPromptAnalysis(utterance, romanticGoalAnalysis) {
  const stage = romanticGoalAnalysis.primary_relationship_stage;
  const intensity = romanticGoalAnalysis.psychological_comfort_model?.progression_intensity ?? 'hold';
  const transitionDecision = romanticGoalAnalysis.stage_transition_assessment?.transition_decision ?? 'unknown';
  const targetRisk = romanticGoalAnalysis.pua_or_coercion_risk?.risk_level ?? 'low';
  return {
    schema_version: 'third_party_target_reply_prompt.v1',
    display_mode: 'user_visible_third_party_prompt_not_sent_to_target',
    active_input_blocked_by_default: true,
    utterance_id: utterance.utterance_id,
    target_text_excerpt: utterance.text,
    stage,
    progression_intensity: intensity,
    transition_decision: transitionDecision,
    target_to_user_risk_level: targetRisk,
    prompt: targetRisk === 'critical'
      ? `第三方提示：对方这句需要先做安全复核，当前不建议生成可发送回复。`
      : `第三方提示：对方这句先按 ${stage} 阶段处理，本轮强度是 ${intensity}。建议你用第一人称小步回应，并观察对方是否继续接住。`,
    reasoning_refs: [
      'romantic_goal_analysis.semantic_feature_assessment',
      'romantic_goal_analysis.psychological_comfort_model',
      'romantic_goal_analysis.stage_transition_assessment'
    ],
    not_sent_to_target: true
  };
}

export function buildRomanticExpertSentenceReview({
  romanticGoalAnalysis,
  goalInput,
  recommended
}) {
  const closureClosed = romanticGoalAnalysis.upstream_downstream_closure.gate_decision === 'pt028_upstream_downstream_closed';
  const sentenceReviews = closureClosed
    ? romanticGoalAnalysis.target_utterances.map((utterance) => ({
      utterance_id: utterance.utterance_id,
      target_person_id: utterance.target_person_id,
      target_display_name: utterance.target_display_name,
      text: utterance.text,
      third_party_prompt_analysis: buildThirdPartyPromptAnalysis(utterance, romanticGoalAnalysis),
      expert_reviews: ROMANTIC_EXPERT_DEFINITIONS.map((expert) =>
        romanticSentenceExpertReview(expert, utterance, romanticGoalAnalysis)
      )
    }))
    : [];
  const userSideReview = detectUserSideManipulationRisk(goalInput, recommended);
  const expertSignals = sentenceReviews.flatMap((sentence) =>
    sentence.expert_reviews.map((review) => ({
      expert_id: review.expert_id,
      utterance_id: review.utterance_id,
      confidence: review.confidence,
      weight_delta: review.weight_delta,
      risk_level: review.risk_level
    }))
  );
  return {
    schema_version: 'romantic_expert_sentence_review.v1',
    review_id: createRuntimeId('romantic_sentence_review'),
    romantic_goal_analysis_id: romanticGoalAnalysis.analysis_id,
    active_input_blocked_display_policy: {
      schema_version: 'active_input_blocked_display_policy.v1',
      active_input_blocked_by_default: true,
      reason: '真实发送和代输入默认被阻断；界面应显示第三方提示、逐句分析和可编辑草稿，而不是直接向目标对象输入。',
      display_for_each_target_reply: true,
      target_visible: false
    },
    gate_decision: closureClosed && sentenceReviews.length
      ? 'sentence_expert_review_completed'
      : closureClosed
        ? 'no_target_utterance_available_for_sentence_review'
        : 'pt028_closure_incomplete_no_sentence_review',
    closure_required_before_sentence_review: true,
    required_expert_ids: ROMANTIC_EXPERT_DEFINITIONS.map((expert) => expert.expert_id),
    target_sentence_reviews: sentenceReviews,
    romantic_weight_integration: {
      schema_version: 'romantic_expert_weight_integration.v1',
      mechanism: 'deterministic_human_like_multi_factor_weighting',
      factors: [
        'stage_relevance',
        'evidence_strength',
        'multi_window_consistency',
        'signal_convergence',
        'recency_pressure',
        'user_goal_relevance',
        'contradiction_penalty',
        'missing_evidence_penalty'
      ],
      expert_signals: expertSignals,
      rule: 'expert outputs add explainable small deltas and safety recommendations; they cannot bypass user confirmation or real-send gates'
    },
    safety_module_reviews: [userSideReview],
    separation_policy: {
      coercion_and_pua_risk_expert_scope: 'target_to_user_only',
      user_side_manipulation_reviewer_scope: 'user_draft_goal_and_send_action_safety_review',
      user_side_reviewer_separate_from_romantic_expert_matrix: true
    }
  };
}

function buildRomanticRelationshipCoordinatorDecision({
  romanticGoalAnalysis,
  romanticExpertSentenceReview,
  recommended,
  contextSnapshot,
  independentReview
}) {
  const draft = recommended?.message_draft ?? {};
  const intent = draft.dialogue_intent_contract ?? {};
  const transition = romanticGoalAnalysis.stage_transition_assessment ?? {};
  const comfort = romanticGoalAnalysis.psychological_comfort_model ?? {};
  const progressionTrack = romanticGoalAnalysis.online_offline_progression_track ?? {};
  const onlineStage = progressionTrack.online_track?.stage ?? 'O0';
  const offlineStage = progressionTrack.offline_track?.stage ?? 'F0';
  const cadence = romanticGoalAnalysis.romantic_progression_cadence ?? {};
  const targetSentenceReviews = romanticExpertSentenceReview?.target_sentence_reviews ?? [];
  const expertSignals = romanticExpertSentenceReview?.romantic_weight_integration?.expert_signals ?? [];
  const riskLevel = romanticGoalAnalysis.pua_or_coercion_risk?.risk_level ?? 'low';
  const sendBlocked = independentReview?.real_execution_allowed !== true;
  const dockGateText = transition.transition_decision === 'route_to_risk_exception_no_progression'
    ? 'risk-review'
    : sendBlocked
      ? 'prompt-only'
      : 'send-gate-ready';
  const dockBrief = [
    `${romanticGoalAnalysis.primary_relationship_stage}/${onlineStage}/${offlineStage}`,
    cadence.current_turn_intent ?? comfort.progression_intensity ?? 'observe_or_hold',
    dockGateText
  ].filter(Boolean).join(' · ');
  const legacyDockBrief = [
    romanticGoalAnalysis.primary_relationship_stage,
    comfort.progression_intensity ?? 'hold',
    transition.transition_decision === 'route_to_risk_exception_no_progression'
      ? 'risk-review'
      : sendBlocked
        ? 'prompt-only'
        : 'send-gate-ready'
  ].filter(Boolean).join(' / ');
  const consoleSections = [
    {
      section_id: 'coordinator_summary',
      title: 'Coordinator Summary',
      level: riskLevel === 'critical' ? 'critical' : 'normal',
      lines: [
        `stage=${romanticGoalAnalysis.primary_relationship_stage}`,
        `online_stage=${onlineStage}`,
        `offline_stage=${offlineStage}`,
        `turn_intent=${cadence.current_turn_intent ?? 'unknown'}`,
        `intensity=${comfort.progression_intensity ?? 'unknown'}`,
        `transition=${transition.transition_decision ?? 'unknown'}`,
        `dialogue_act=${intent.dialogue_act ?? 'unknown'}`
      ]
    },
    {
      section_id: 'expert_evidence',
      title: 'Expert Evidence',
      level: 'normal',
      lines: [
        `target_sentence_count=${targetSentenceReviews.length}`,
        `expert_signal_count=${expertSignals.length}`,
        `required_experts=${(romanticExpertSentenceReview?.required_expert_ids ?? []).join(',')}`
      ]
    },
    {
      section_id: 'send_gate',
      title: 'Send Gate',
      level: sendBlocked ? 'blocked' : 'ready',
      lines: [
        `real_execution_allowed=${independentReview?.real_execution_allowed === true}`,
        `target_visible_analysis=false`,
        `draft_hash_required_before_send=true`
      ]
    }
  ];

  return {
    schema_version: 'romantic_relationship_coordinator_expert.v1',
    coordinator_decision_id: createRuntimeId('romantic_relationship_coordinator'),
    coordinator_expert: {
      expert_id: 'romantic_relationship_coordinator_expert',
      discipline: 'romantic_relationship_synthesis',
      role: 'Merge relationship-stage evidence, expert sentence reviews and send gates into one frontend/action decision.'
    },
    input_refs: {
      context_snapshot_id: contextSnapshot.snapshot_id,
      romantic_goal_analysis_id: romanticGoalAnalysis.analysis_id,
      romantic_sentence_review_id: romanticExpertSentenceReview?.review_id ?? null,
      recommended_option_id: recommended?.option_id ?? null,
      independent_review_schema: independentReview?.schema_version ?? null
    },
    synthesis: {
      primary_stage: romanticGoalAnalysis.primary_relationship_stage,
      stage_id: romanticGoalAnalysis.primary_relationship_stage_id,
      online_stage: onlineStage,
      offline_stage: offlineStage,
      current_turn_intent: cadence.current_turn_intent ?? null,
      cadence_decision: cadence.cadence_decision ?? null,
      date_transition_status: romanticGoalAnalysis.date_transition_readiness?.status ?? null,
      progression_intensity: comfort.progression_intensity ?? null,
      transition_decision: transition.transition_decision ?? null,
      dialogue_act: intent.dialogue_act ?? null,
      risk_level: riskLevel,
      final_frontend_action: sendBlocked ? 'show_prompt_and_log_only' : 'prepare_controlled_send_preview',
      summary: sendBlocked
        ? 'Show a concise user prompt and detailed reasoning log; do not transfer text into the target window.'
        : 'Transfer only the confirmed draft and audit metadata to the controlled send gate.'
    },
    frontend_display_contract: {
      schema_version: 'frontend_display_contract.v1',
      surfaces: {
        dock: {
          mode: 'brief_status_only',
          text: dockBrief,
          legacy_text: legacyDockBrief,
          status_parts: {
            relationship_stage: romanticGoalAnalysis.primary_relationship_stage,
            online_stage: onlineStage,
            offline_stage: offlineStage,
            current_turn_intent: cadence.current_turn_intent ?? null,
            gate_status: dockGateText
          },
          max_chars: 64,
          detail_hidden: true,
          movement_policy: 'may_scroll_only_as_status_ticker_with_pause_on_hover_or_expand',
          click_target: 'open_graph_or_console_detail',
          placement_policy: {
            preferred_anchor: 'target_application_window_edge',
            target_application: draft.channel ?? 'wechat',
            fallback_anchor: 'screen_right_safe_zone',
            avoid_target_chat_input_overlap: true,
            draggable_by_operator: true,
            persist_user_override: true
          },
          context_interface: {
            read_model: 'read_only_runtime_decision_state',
            ipc_channel: 'zhineng:decision-state:get',
            allowed_fields: [
              'frontend_display_contract.surfaces.dock',
              'send_gate_transfer_path.current_mode',
              'romantic_relationship_coordinator.synthesis.summary'
            ],
            refresh_interval_ms: 5000
          },
          boundary_policy: {
            detailed_logs_allowed: false,
            raw_private_text_allowed: false,
            target_visible_analysis_allowed: false,
            pause_or_expand_required_for_moving_status: true
          }
        },
        console: {
          mode: 'chat_model_style_detail_log',
          show_draft: true,
          show_reasoning_log: true,
          show_expert_run_log: true,
          show_chain_flow: true,
          show_branch_records: true,
          context_interface: {
            read_model: 'read_only_runtime_decision_state',
            ipc_channel: 'zhineng:decision-state:get',
            allowed_fields: [
              'expert_context_packs',
              'parallel_expert_run_log',
              'romantic_coordinator_decision',
              'frontend_display_contract.surfaces.console',
              'send_gate_transfer_path',
              'structured_cot_trace',
              'chain_flow',
              'branch_records'
            ],
            refresh_interval_ms: 5000
          },
          reasoning_policy: {
            show_user_visible_structured_reasoning_log: true,
            show_hidden_chain_of_thought: false,
            include_evidence_refs: true,
            include_expert_lane_status: true
          },
          sections: consoleSections
        },
        send_window: {
          mode: sendBlocked ? 'blocked_prompt_only' : 'controlled_send_preview_candidate',
          target_visible_analysis: false,
          draft_transfer_allowed: !sendBlocked,
          required_confirmation_before_transfer: true,
          context_interface: {
            read_model: 'send_gate_transfer_payload_only',
            allowed_fields: [
              'send_gate_transfer_path.transfer_payload',
              'send_gate_transfer_path.required_gates'
            ]
          },
          boundary_policy: {
            expert_logs_allowed: false,
            raw_context_allowed: false,
            only_confirmed_draft_payload_allowed: true
          }
        }
      }
    },
    send_gate_transfer_path: {
      schema_version: 'send_gate_transfer_path.v1',
      current_mode: sendBlocked ? 'blocked_prompt_only' : 'controlled_send_preview_candidate',
      real_execution_allowed: independentReview?.real_execution_allowed === true,
      real_send_attempted: false,
      transfer_payload: sendBlocked
        ? null
        : {
            channel: draft.channel ?? 'wechat',
            target_person_id: draft.target_person_id ?? romanticGoalAnalysis.target_person_id,
            target_display_name: draft.target_display_name ?? romanticGoalAnalysis.target_display_name,
            draft: draft.draft ?? null,
            dialogue_act: intent.dialogue_act ?? null,
            coordinator_decision_required: true
          },
      blocked_payload_visible_to_user: {
        draft: draft.draft ?? null,
        dock_brief: dockBrief,
        prompt_count: targetSentenceReviews.length,
        detail_log_section_count: consoleSections.length
      },
      required_gates: [
        'coordinator_decision_present',
        'target_window_verified',
        'draft_hash_matches_preview',
        'operator_confirmation',
        'platform_preview_send_blocking_audit',
        'feedback_writeback_plan_present'
      ]
    }
  };
}

const THEORY_EXPERT_DEFINITIONS = [
  {
    expert_id: 'game_theory_expert',
    discipline: '博弈论',
    capability: '分析双方收益结构、信号、承诺、谈判、重复互动和二阶响应。',
    methods: ['支付矩阵', '信号博弈', '重复博弈', '议价路径', '承诺成本'],
    trigger_tags: ['all', 'business', 'budget', 'meeting', 'advance', 'commercial_close']
  },
  {
    expert_id: 'psychology_expert',
    discipline: '心理学',
    capability: '分析认知偏差、情绪压力、动机、依恋、安全感和行为反应。',
    methods: ['社会心理', '认知偏差', '情绪调节', '动机分析', '依恋线索'],
    trigger_tags: ['all', 'repair', 'risk', 'social', 'family', 'intimacy']
  },
  {
    expert_id: 'logic_expert',
    discipline: '逻辑学',
    capability: '检查前提、结论、矛盾、因果链、反事实和证据强度。',
    methods: ['论证图', '必要充分条件', '反例构造', '因果链检查'],
    trigger_tags: ['all', 'low_evidence', 'risk']
  },
  {
    expert_id: 'evidence_causality_expert',
    discipline: '证据与因果',
    capability: '区分事实、迹象、推断和因果关系，标注关键缺口。',
    methods: ['证据分级', '时间线复原', '混杂因素检查', '因果图'],
    trigger_tags: ['all', 'low_evidence', 'meeting', 'budget']
  },
  {
    expert_id: 'social_network_expert',
    discipline: '社会网络',
    capability: '分析关系网络、共同参与者、组织扩散、声誉和二阶影响。',
    methods: ['强弱关系', '结构洞', '影响路径', '圈层压力'],
    trigger_tags: ['business', 'social', 'meeting', 'public']
  },
  {
    expert_id: 'language_pragmatics_expert',
    discipline: '语言学与语用学',
    capability: '分析称呼、语气、暗示、礼貌策略、会话含义和误读风险。',
    methods: ['话语行为', '会话含义', '面子理论', '语气改写'],
    trigger_tags: ['all', 'wechat', 'message', 'meeting']
  },
  {
    expert_id: 'organizational_expert',
    discipline: '组织与管理',
    capability: '分析决策链、角色授权、审批、跨部门阻力和推进路径。',
    methods: ['RACI', '利益相关方分析', '流程约束', '审批链'],
    trigger_tags: ['business', 'advance', 'meeting', 'contract']
  },
  {
    expert_id: 'behavioral_economics_expert',
    discipline: '行为经济学',
    capability: '分析损失厌恶、锚定、默认项、稀缺感和有限理性选择。',
    methods: ['前景理论', '选择架构', '激励设计', '默认选项'],
    trigger_tags: ['budget', 'business', 'commercial_close']
  },
  {
    expert_id: 'negotiation_conflict_expert',
    discipline: '谈判与冲突调解',
    capability: '分析利益、立场、底线、替代方案、升级和修复路径。',
    methods: ['BATNA', '利益分层', '降级路径', '调解流程'],
    trigger_tags: ['repair', 'risk', 'conflict', 'business']
  },
  {
    expert_id: 'romantic_relationship_coordinator_expert',
    discipline: 'romantic_relationship_synthesis',
    capability: 'Synthesize stage gradient, online/offline transition, comfort, cadence and send-gate handoff for romantic relationship goals.',
    methods: ['stage_gradient', 'comfort_model', 'cadence_design', 'online_offline_transition', 'send_gate_handoff'],
    trigger_tags: ['personal_social', 'intimacy', 'romantic', 'romantic_partner']
  }
];

function scorePredictionMetric({ base, contextSnapshot, eventBoost = 0 }) {
  const sufficiency = contextSnapshot.context_sufficiency_score ?? 0.5;
  const eventCount = contextSnapshot.event_snapshot.event_count + contextSnapshot.event_snapshot.raw_event_count;
  return Number(clamp(base + sufficiency * 0.18 + Math.min(eventCount, 8) * 0.015 + eventBoost).toFixed(4));
}

const EXPERT_WEIGHT_FOCUS = {
  game_theory_expert: { goal_fit: 0.018, feedback_observability: 0.012, timing_fit: 0.006 },
  psychology_expert: { relationship_fit: 0.02, risk_control: 0.012, user_preference_fit: 0.006 },
  logic_expert: { event_evidence: 0.018, norm_compliance: 0.012, risk_control: 0.006 },
  evidence_causality_expert: { event_evidence: 0.022, feedback_observability: 0.01 },
  social_network_expert: { relationship_fit: 0.014, timing_fit: 0.01 },
  language_pragmatics_expert: { user_preference_fit: 0.016, relationship_fit: 0.008 },
  organizational_expert: { timing_fit: 0.014, goal_fit: 0.01 },
  behavioral_economics_expert: { cost_efficiency: 0.014, risk_control: 0.008 },
  negotiation_conflict_expert: { risk_control: 0.016, norm_compliance: 0.01 },
  romantic_relationship_coordinator_expert: { relationship_fit: 0.018, goal_fit: 0.014, timing_fit: 0.01 }
};

function expertDisciplineFocus(expertId) {
  if (expertId === 'psychology_expert') return 'stage_emotion_motivation_attachment_and_pressure';
  if (expertId === 'game_theory_expert') return 'signals_incentives_commitment_and_repeated_interaction';
  if (expertId === 'logic_expert') return 'premises_conclusions_contradictions_and_counterexamples';
  if (expertId === 'evidence_causality_expert') return 'fact_trace_inference_causality_and_missing_evidence';
  if (expertId === 'language_pragmatics_expert') return 'tone_implicature_address_terms_and_misread_risk';
  if (expertId === 'social_network_expert') return 'relationship_network_roles_and_second_order_effects';
  if (expertId === 'organizational_expert') return 'decision_chain_role_authority_and_process_constraints';
  if (expertId === 'behavioral_economics_expert') return 'loss_aversion_framing_defaults_and_choice_architecture';
  if (expertId === 'negotiation_conflict_expert') return 'interests_boundaries_alternatives_and_repair_path';
  if (expertId === 'romantic_relationship_coordinator_expert') return 'romantic_stage_gradient_comfort_cadence_and_send_gate_handoff';
  return 'discipline_specific_stage_context_analysis';
}

const EXPERT_PROMPT_TEMPLATES = {
  schema_version: 'expert_prompt_templates.v1',
  default_template_id: 'expert_default_stage_context.v1',
  output_schema_ref: 'expert_opinion.v1',
  common_system_prompt:
    'You are an isolated specialist lane in an expert matrix. Read only the supplied ExpertContextPack, produce an expert_opinion.v1 JSON object, cite evidence refs, and do not send or execute actions.',
  mode_overlays: {
    analysis_only: {
      template_id: 'mode.analysis_only.v1',
      instruction:
        'Analyze evidence and uncertainty only. Do not propose weight deltas or active progression. Mark weight impact as disabled.'
    },
    experimental_guidance: {
      template_id: 'mode.experimental_guidance.v1',
      instruction:
        'Analyze guidance variables, recommend bounded strategy changes, and include observable feedback signals for later review.'
    },
    control_variable_research: {
      template_id: 'mode.control_variable_research.v1',
      instruction:
        'Model high-intensity influence/control variables as research hypotheses. Separate theoretical effect, risk signal, feedback metric, and pre-send audit requirement.'
    }
  },
  scene_overlays: {
    personal_social: {
      template_id: 'scene.personal_social.v1',
      instruction:
        'Prioritize relationship stage, comfort, online/offline transition, target identity labels, and reversible next-step cadence.'
    },
    business: {
      template_id: 'scene.business.v1',
      instruction:
        'Prioritize incentives, roles, decision chain, commitment cost, negotiation path, and evidence-backed next step.'
    }
  },
  stage_overlays: {
    R0: 'No confirmed relationship: focus on identity resolution, context capture, and low-assumption probes.',
    R1: 'Candidate relationship: focus on rapport, reciprocal signals, and low-pressure clarification.',
    R2: 'Confirmed romantic relationship without physical intimacy: focus on warmth, consent-aware progression, online/offline cadence, and comfort.',
    R3: 'Early affection escalation: focus on mutual comfort, reversibility, and feedback observability.',
    R6: 'Physical intimacy confirmed goal state: focus on relationship continuity, consent evidence, and post-action feedback.'
  },
  expert_overlays: {
    game_theory_expert:
      'Evaluate signals, incentives, commitment costs, repeated interaction, and second-order response.',
    psychology_expert:
      'Evaluate comfort, motivation, attachment, emotional pressure, resistance, and readiness.',
    logic_expert:
      'Evaluate premises, conclusions, contradictions, missing conditions, and counterexamples.',
    evidence_causality_expert:
      'Evaluate fact trace, causal chain, missing evidence, confounders, and confidence.',
    social_network_expert:
      'Evaluate relationship network, roles, influence path, public/private context, and second-order effects.',
    language_pragmatics_expert:
      'Evaluate tone, implicature, address terms, face needs, ambiguity, and misread risk.',
    organizational_expert:
      'Evaluate role authority, process blockers, approval chain, and execution constraints.',
    behavioral_economics_expert:
      'Evaluate framing, default options, loss aversion, scarcity, and choice architecture.',
    negotiation_conflict_expert:
      'Evaluate interests, boundaries, alternatives, conflict repair, and escalation risk.',
    romantic_relationship_coordinator_expert:
      'Synthesize romantic stage gradient, online/offline transition, cadence, comfort, and send-gate handoff.'
  }
};

function expertMatrixModeStrategy(mode = 'experimental_guidance') {
  if (mode === 'analysis_only') {
    return {
      schema_version: 'expert_matrix_mode_strategy.v1',
      mode,
      weight_delta_enabled: false,
      provider_execution_required: false,
      output_scope: 'diagnosis_and_evidence_only',
      required_outputs: ['expert_opinion', 'evidence_refs', 'uncertainty'],
      audit_requirements: ['no_weight_delta', 'no_send_payload_transfer']
    };
  }
  if (mode === 'control_variable_research') {
    return {
      schema_version: 'expert_matrix_mode_strategy.v1',
      mode,
      weight_delta_enabled: true,
      provider_execution_required: true,
      output_scope: 'influence_variable_research_and_strategy',
      required_outputs: [
        'expert_opinion',
        'influence_variable_hypotheses',
        'observable_feedback_metrics',
        'pre_send_audit_requirements'
      ],
      audit_requirements: [
        'separate_theoretical_effect_from_execution_permission',
        'pre_send_gate_required',
        'record_guidance_control_boundary'
      ]
    };
  }
  return {
    schema_version: 'expert_matrix_mode_strategy.v1',
    mode: 'experimental_guidance',
    weight_delta_enabled: true,
    provider_execution_required: false,
    output_scope: 'bounded_guidance_strategy',
    required_outputs: ['expert_opinion', 'bounded_strategy', 'observable_feedback_metrics'],
    audit_requirements: ['pre_send_gate_required']
  };
}

function promptStageFor({ recommended, contextSnapshot }) {
  return recommended?.message_draft?.relationship_stage
    ?? contextSnapshot?.relationship_snapshot?.phase
    ?? contextSnapshot?.relationship_snapshot?.relationship_context_status
    ?? 'unknown';
}

function normalizePromptStage(stage) {
  const value = String(stage ?? '').toUpperCase();
  if (value.includes('R6')) return 'R6';
  if (value.includes('R3')) return 'R3';
  if (value.includes('R2') || value.includes('CONFIRMED_ROMANTIC')) return 'R2';
  if (value.includes('R1') || value.includes('CANDIDATE')) return 'R1';
  if (value.includes('R0') || value.includes('UNKNOWN')) return 'R0';
  return 'unknown';
}

function selectExpertPromptTemplate({ expert, goalInput, plan, contextSnapshot, recommended, expertMatrixRuntimeConfig }) {
  const scene = goalInput.scene ?? plan.scene ?? 'unknown';
  const mode = expertMatrixRuntimeConfig?.mode ?? 'experimental_guidance';
  const stage = normalizePromptStage(promptStageFor({ recommended, contextSnapshot }));
  const modeOverlay = EXPERT_PROMPT_TEMPLATES.mode_overlays[mode]
    ?? EXPERT_PROMPT_TEMPLATES.mode_overlays.experimental_guidance;
  const sceneOverlay = EXPERT_PROMPT_TEMPLATES.scene_overlays[scene] ?? null;
  const expertInstruction =
    EXPERT_PROMPT_TEMPLATES.expert_overlays[expert.expert_id]
    ?? 'Evaluate the context according to your discipline and return the unified schema.';
  return {
    schema_version: EXPERT_PROMPT_TEMPLATES.schema_version,
    template_id: [
      'expert_prompt',
      expert.expert_id,
      modeOverlay.template_id,
      sceneOverlay?.template_id ?? `scene.${scene}.v1`,
      `stage.${stage}.v1`
    ].join('::'),
    output_schema_ref: EXPERT_PROMPT_TEMPLATES.output_schema_ref,
    selected_dimensions: {
      expert_id: expert.expert_id,
      mode,
      scene,
      stage
    },
    system_prompt: EXPERT_PROMPT_TEMPLATES.common_system_prompt,
    instructions: [
      expertInstruction,
      modeOverlay.instruction,
      sceneOverlay?.instruction ?? 'Use the scene field from the context pack as the domain boundary.',
      EXPERT_PROMPT_TEMPLATES.stage_overlays[stage] ?? 'Use the stage evidence from the context pack without inventing missing facts.'
    ],
    required_json_keys: [
      'schema_version',
      'expert_id',
      'summary',
      'recommendation',
      'confidence',
      'evidence_refs',
      'weight_signal',
      'risk_or_audit_notes'
    ]
  };
}

function normalizeExpertIntensity(value, fallback = 1) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  if (numberValue > 1) return clamp(numberValue / 100, 0, 1);
  return clamp(numberValue, 0, 1);
}

function readBoundaryValue(boundary, snakeKey, camelKey, fallback) {
  return boundary?.[snakeKey] ?? boundary?.[camelKey] ?? fallback;
}

function normalizeExpertMatrixRuntimeConfig(raw = null) {
  const explicit = Boolean(raw && typeof raw === 'object' && Object.keys(raw).length > 0);
  const boundary = raw?.guidance_control_boundary ?? raw?.guidanceControlBoundary ?? {};
  const rawExperts = raw?.experts ?? {};
  const globalIntensityMultiplier = normalizeExpertIntensity(raw?.global_intensity ?? raw?.globalIntensity, 1);
  const experts = Object.fromEntries(THEORY_EXPERT_DEFINITIONS.map((expert) => {
    const item = rawExperts[expert.expert_id] ?? {};
    const intensityMultiplier = normalizeExpertIntensity(item.intensity ?? item.intensity_multiplier, 1);
    return [
      expert.expert_id,
      {
        expert_id: expert.expert_id,
        enabled: item.enabled !== false,
        intensity: Number((intensityMultiplier * 100).toFixed(2)),
        intensity_multiplier: intensityMultiplier,
        api_mode: item.api_mode ?? item.apiMode ?? 'deterministic',
        provider_ref: item.provider_ref ?? item.providerRef ?? null,
        allow_weight_impact: item.allow_weight_impact !== false && item.allowWeightImpact !== false,
        role: item.role ?? (expert.expert_id === 'romantic_relationship_coordinator_expert' ? 'coordinator' : 'specialist')
      }
    ];
  }));

  const primaryExpertId =
    raw?.primary_expert_id ??
    raw?.primaryExpertId ??
    'romantic_relationship_coordinator_expert';
  const mode = raw?.mode ?? 'experimental_guidance';
  const modeStrategy = expertMatrixModeStrategy(mode);

  return {
    schema_version: 'expert_matrix_runtime_config.v1',
    enabled: raw?.enabled !== false,
    explicit_config_provided: explicit,
    mode,
    mode_strategy: modeStrategy,
    primary_expert_id: primaryExpertId,
    global_intensity: Number((globalIntensityMultiplier * 100).toFixed(2)),
    global_intensity_multiplier: globalIntensityMultiplier,
    boundary_policy: {
      guidance_definition: readBoundaryValue(
        boundary,
        'guidance_definition',
        'guidanceDefinition',
        'Guidance is modeled as information framing, pacing, tone and choice architecture in the analysis layer.'
      ),
      control_definition: readBoundaryValue(
        boundary,
        'control_definition',
        'controlDefinition',
        'Control is treated as a high-intensity influence variable for research logging, not an automatic execution permission.'
      ),
      experimental_question: readBoundaryValue(
        boundary,
        'experimental_question',
        'experimentalQuestion',
        'Measure whether expert intensity changes draft strategy, progression cadence and observable feedback.'
      ),
      analysis_layer_can_model_influence_variables: true,
      send_layer_must_pass_independent_review: true,
      safety_review_stage: boundary?.safety_review_stage ?? boundary?.safetyReviewStage ?? 'pre_send_gate'
    },
    experts
  };
}

function expertRuntimeConfigFor(runtimeConfig, expertId) {
  return runtimeConfig?.experts?.[expertId] ?? {
    expert_id: expertId,
    enabled: true,
    intensity: 100,
    intensity_multiplier: 1,
    api_mode: 'deterministic',
    provider_ref: null,
    allow_weight_impact: true,
    role: expertId === runtimeConfig?.primary_expert_id ? 'coordinator' : 'specialist'
  };
}

function windowFindingForExpert(expert, target, window) {
  const density = window.evidence_density ?? 0;
  const confidence = Number(clamp(0.38 + density * 0.44 + (window.event_type_codes.length ? 0.08 : 0)).toFixed(4));
  const status = window.has_context ? 'has_stage_context' : 'missing_stage_context';
  return {
    window_id: window.window_id,
    status,
    confidence,
    focus: expertDisciplineFocus(expert.expert_id),
    evidence_summary: window.has_context
      ? window.summaries.slice(0, 3)
      : [`No ${window.window_id} context for ${target.display_name ?? target.target_person_id}`],
    event_type_codes: window.event_type_codes,
    interpretation: window.has_context
      ? `${expert.expert_id} independently evaluates ${target.display_name ?? target.target_person_id} from ${window.window_id} context before merge.`
      : `${expert.expert_id} marks ${window.window_id} as a missing context window and lowers certainty instead of relying only on the latest message.`
  };
}

function buildExpertContextPack(expert, { goalInput, plan, contextSnapshot, recommended, expertMatrixRuntimeConfig }) {
  const expertRuntime = expertRuntimeConfigFor(expertMatrixRuntimeConfig, expert.expert_id);
  const promptTemplate = selectExpertPromptTemplate({
    expert,
    goalInput,
    plan,
    contextSnapshot,
    recommended,
    expertMatrixRuntimeConfig
  });
  const targets = contextSnapshot.target_context_windows ?? [];
  const relationship = contextSnapshot.relationship_snapshot ?? {};
  const eventSnapshot = contextSnapshot.event_snapshot ?? {};
  const targetContextBriefs = targets.map((target) => ({
    target_person_id: target.target_person_id,
    display_name: target.display_name ?? target.target_person_id,
    goal_relevance: goalInput.primary_person_id === target.target_person_id ? 'primary_target' : 'secondary_target',
    temporal_coverage_score: target.temporal_coverage_score ?? 0,
    active_windows: target.active_windows ?? [],
    missing_windows: target.missing_windows ?? [],
    windows: (target.windows ?? []).map((window) => ({
      window_id: window.window_id,
      has_context: window.has_context === true,
      summaries: window.summaries ?? [],
      event_type_codes: window.event_type_codes ?? [],
      evidence_density: window.evidence_density ?? 0
    }))
  }));

  return {
    schema_version: 'expert_context_pack.v1',
    context_pack_id: `expert_context_pack_${expert.expert_id}_${contextSnapshot.snapshot_id}`,
    expert_id: expert.expert_id,
    discipline: expert.discipline,
    role: expert.role ?? expert.capability ?? expert.discipline,
    prompt_template: promptTemplate,
    runtime_config: {
      mode: expertMatrixRuntimeConfig?.mode ?? 'experimental_guidance',
      primary_expert_id: expertMatrixRuntimeConfig?.primary_expert_id ?? null,
      expert_role: expertRuntime.role,
      expert_intensity: expertRuntime.intensity,
      expert_api_mode: expertRuntime.api_mode,
      provider_ref: expertRuntime.provider_ref,
      allow_weight_impact: expertRuntime.allow_weight_impact,
      guidance_control_boundary_ref: 'expert_matrix_runtime_config.boundary_policy'
    },
    source_context_id: contextSnapshot.snapshot_id,
    readable_context: {
      system_goal: 'Use graph-backed context and stage evidence to produce an explainable recommendation without bypassing review gates.',
      user_goal: goalInput.initial_goal ?? null,
      scene: goalInput.scene ?? plan.scene ?? null,
      recommended_option: recommended?.option_id ?? null,
      recommended_action_type: recommended?.action_type ?? null,
      draft_preview: recommended?.message_draft?.draft ?? null,
      relationship_summary: relationship.summary ?? null,
      target_context_briefs: targetContextBriefs,
      event_summary: {
        event_count: eventSnapshot.event_count ?? 0,
        raw_event_count: eventSnapshot.raw_event_count ?? 0,
        raw_event_digest: eventSnapshot.raw_event_digest ?? []
      },
      constraints: contextSnapshot.decision_inputs?.constraints ?? [],
      risk_controls: contextSnapshot.decision_inputs?.risk_controls ?? []
    },
    context_policy: {
      reads_today_week_month_and_historical_windows: true,
      latest_message_only_allowed: false,
      no_cross_expert_dependency_before_merge: true,
      can_run_in_parallel: true,
      context_must_be_human_readable: true
    },
    target_isolation_policy: {
      output_partition_key: 'target_person_id',
      single_target_outputs_required: true,
      cross_target_context_mixing_allowed: false,
      no_cross_target_memory: true,
      prompt_content_must_be_target_specific: true
    },
    boundaries: {
      may_adjust_weights: true,
      may_block_or_escalate: true,
      may_not_send_to_target: true,
      may_not_modify_graph_directly: true
    },
    guidance_control_boundary: {
      analysis_layer: 'Expert may model guidance/control variables as research signals.',
      execution_layer: 'Expert output cannot directly execute or bypass pre-send review.',
      safety_review_stage: expertMatrixRuntimeConfig?.boundary_policy?.safety_review_stage ?? 'pre_send_gate'
    },
    evidence_refs: [
      'context_snapshot.goal',
      'context_snapshot.relationship_snapshot',
      'context_snapshot.event_snapshot',
      'context_snapshot.target_context_windows',
      'recommended_option.message_draft'
    ]
  };
}

function buildIndependentExpertContextAnalysis(expert, { goalInput, plan, contextSnapshot, recommended, expertMatrixRuntimeConfig }) {
  const contextPack = buildExpertContextPack(expert, {
    goalInput,
    plan,
    contextSnapshot,
    recommended,
    expertMatrixRuntimeConfig
  });
  const expertRuntime = expertRuntimeConfigFor(expertMatrixRuntimeConfig, expert.expert_id);
  const targets = contextSnapshot.target_context_windows ?? [];
  const targetAnalyses = targets.map((target) => {
    const windowAnalyses = (target.windows ?? []).map((window) =>
      windowFindingForExpert(expert, target, window)
    );
    const activeWindowCount = windowAnalyses.filter((window) => window.status === 'has_stage_context').length;
    const coverageScore = target.temporal_coverage_score ?? 0;
    const confidence = Number(clamp(0.42 + coverageScore * 0.38 + activeWindowCount * 0.03).toFixed(4));
    return {
      target_person_id: target.target_person_id,
      display_name: target.display_name,
      reference_time: target.reference_time,
      temporal_coverage_score: coverageScore,
      active_windows: target.active_windows ?? [],
      missing_windows: target.missing_windows ?? [],
      window_analyses: windowAnalyses,
      expert_target_summary: {
        confidence,
        finding: activeWindowCount
          ? `${expert.expert_id} has ${activeWindowCount} independent temporal windows for this target.`
          : `${expert.expert_id} lacks temporal context and should treat current-message conclusions as provisional.`,
        goal_relevance: goalInput.primary_person_id === target.target_person_id ? 'primary_target' : 'secondary_target'
      }
    };
  });
  const averageCoverage = targetAnalyses.length
    ? targetAnalyses.reduce((sum, item) => sum + item.temporal_coverage_score, 0) / targetAnalyses.length
    : 0;
  const missingWindowCount = targetAnalyses
    .flatMap((item) => item.missing_windows ?? [])
    .length;
  const confidence = Number(clamp(0.45 + averageCoverage * 0.42 - Math.min(missingWindowCount, 8) * 0.015).toFixed(4));
  return {
    analysis_id: `independent_context_${expert.expert_id}_${contextSnapshot.snapshot_id}`,
    schema_version: 'expert_independent_context_analysis.v1',
    expert_id: expert.expert_id,
    discipline: expert.discipline,
    runtime_config: {
      expert_intensity: expertRuntime.intensity,
      intensity_multiplier: expertRuntime.intensity_multiplier,
      allow_weight_impact: expertRuntime.allow_weight_impact,
      api_mode: expertRuntime.api_mode,
      role: expertRuntime.role
    },
    context_pack_ref: contextPack.context_pack_id,
    context_pack: contextPack,
    target_scope: {
      target_count: targetAnalyses.length,
      primary_person_id: goalInput.primary_person_id ?? plan.primary_person_id ?? null,
      scene: goalInput.scene ?? plan.scene ?? null
    },
    context_policy: {
      reads_today_week_month_and_historical_windows: true,
      latest_message_only_allowed: false,
      no_cross_expert_dependency_before_merge: true,
      analysis_before_weight_merge: true
    },
    target_analyses: targetAnalyses,
    aggregate_signal: {
      temporal_coverage_score: Number(averageCoverage.toFixed(4)),
      missing_window_count: missingWindowCount,
      confidence,
      recommended_weight_focus: Object.keys(EXPERT_WEIGHT_FOCUS[expert.expert_id] ?? {})
    }
  };
}

function buildExpertWeightIntegration({ independentContextAnalysis, expertMatrixRuntimeConfig }) {
  const criterionAdjustments = {};
  const expertSignals = [];
  for (const analysis of independentContextAnalysis) {
    const expertRuntime = expertRuntimeConfigFor(expertMatrixRuntimeConfig, analysis.expert_id);
    const focus = EXPERT_WEIGHT_FOCUS[analysis.expert_id] ?? { event_evidence: 0.006 };
    const confidenceFactor = clamp(analysis.aggregate_signal.confidence ?? 0.5, 0.25, 0.95);
    const coverage = analysis.aggregate_signal.temporal_coverage_score ?? 0;
    const missingCount = analysis.aggregate_signal.missing_window_count ?? 0;
    const intensityFactor = expertMatrixRuntimeConfig?.mode_strategy?.weight_delta_enabled === false
      ? 0
      : expertRuntime.allow_weight_impact === false
      ? 0
      : (expertMatrixRuntimeConfig?.global_intensity_multiplier ?? 1) * (expertRuntime.intensity_multiplier ?? 1);
    const adjusted = {};
    for (const [criterion, baseDelta] of Object.entries(focus)) {
      let delta = baseDelta * confidenceFactor;
      if (coverage < 0.5 && ['event_evidence', 'risk_control', 'feedback_observability'].includes(criterion)) {
        delta += 0.004;
      }
      if (missingCount > 0 && ['relationship_fit', 'goal_fit', 'timing_fit'].includes(criterion)) {
        delta *= 0.75;
      }
      delta *= intensityFactor;
      const rounded = Number(delta.toFixed(4));
      criterionAdjustments[criterion] = Number(((criterionAdjustments[criterion] ?? 0) + rounded).toFixed(4));
      adjusted[criterion] = rounded;
    }
    expertSignals.push({
      expert_id: analysis.expert_id,
      confidence: analysis.aggregate_signal.confidence,
      temporal_coverage_score: analysis.aggregate_signal.temporal_coverage_score,
      missing_window_count: analysis.aggregate_signal.missing_window_count,
      runtime_config: {
        global_intensity: expertMatrixRuntimeConfig?.global_intensity ?? 100,
        expert_intensity: expertRuntime.intensity,
        effective_intensity_multiplier: Number(intensityFactor.toFixed(4)),
        allow_weight_impact: expertRuntime.allow_weight_impact,
        mode_weight_delta_enabled: expertMatrixRuntimeConfig?.mode_strategy?.weight_delta_enabled !== false,
        api_mode: expertRuntime.api_mode,
        role: expertRuntime.role
      },
      criterion_adjustments: adjusted
    });
  }
  return {
    schema_version: 'expert_weight_integration.v1',
    merge_policy: 'small_additive_delta_then_normalize_with_expert_intensity_gate',
    criterion_adjustments: criterionAdjustments,
    expert_signals: expertSignals,
    rationale: [
      'Each expert first reads every target through today, last_7_days, last_30_days and historical windows.',
      'Expert outputs only add small explainable deltas to decision criteria; they cannot delete goals or bypass review gates.',
      'Missing temporal windows increase caution and evidence weighting instead of forcing conclusions from the latest message.'
    ]
  };
}

function buildExpertProviderRequest({ contextPack, expertRuntime, expertMatrixRuntimeConfig }) {
  return {
    schema_version: 'expert_provider_request.v1',
    request_id: createRuntimeId(`expert_provider_request_${contextPack.expert_id}`),
    expert_id: contextPack.expert_id,
    provider_ref: expertRuntime.provider_ref ?? 'default',
    api_mode: expertRuntime.api_mode,
    role: expertRuntime.role,
    prompt: {
      system: contextPack.prompt_template?.system_prompt ?? EXPERT_PROMPT_TEMPLATES.common_system_prompt,
      user: JSON.stringify({
        instructions: contextPack.prompt_template?.instructions ?? [],
        required_json_keys: contextPack.prompt_template?.required_json_keys ?? [],
        target_isolation_contract: contextPack.target_isolation_policy ?? null,
        context_pack: contextPack
      }, null, 2)
    },
    context_pack: contextPack,
    output_schema: {
      schema_version: 'expert_opinion.v1',
      required: [
        'schema_version',
        'expert_id',
        'summary',
        'recommendation',
        'confidence',
        'evidence_refs',
        'weight_signal',
        'risk_or_audit_notes'
      ]
    },
    isolation_policy: {
      one_expert_context_pack_only: true,
      no_other_expert_outputs_in_input: true,
      no_cross_lane_memory: true,
      no_cross_target_memory: true,
      output_partition_key: 'target_person_id',
      single_target_outputs_required: true
    },
    boundary_policy: expertMatrixRuntimeConfig?.boundary_policy ?? null,
    mode_strategy: expertMatrixRuntimeConfig?.mode_strategy ?? expertMatrixModeStrategy()
  };
}

function parseExpertProviderResponse(response) {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    if (typeof response.text === 'string') return parseExpertProviderResponse(response.text);
    if (typeof response.content === 'string') return parseExpertProviderResponse(response.content);
    if (response.json && typeof response.json === 'object') return response.json;
    return response;
  }
  if (typeof response !== 'string') return {};
  const text = response.trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {
      summary: text.slice(0, 1200),
      recommendation: text.slice(0, 1200)
    };
  }
}

function normalizeExpertOpinion({
  parsed,
  contextPack,
  analysis,
  expertRuntime,
  providerRef,
  providerStatus,
  fallbackUsed,
  deterministicFinding = null,
  error = null
}) {
  const evidenceRefs = Array.isArray(parsed.evidence_refs)
    ? parsed.evidence_refs
    : contextPack.evidence_refs ?? [];
  const weightSignal = parsed.weight_signal && typeof parsed.weight_signal === 'object'
    ? parsed.weight_signal
    : {
      allow_weight_impact: expertRuntime.allow_weight_impact,
      suggested_criteria: analysis?.aggregate_signal?.recommended_weight_focus ?? []
    };
  const targetScope = contextPack.readable_context?.target_context_briefs?.map((target) => ({
    target_person_id: target.target_person_id,
    display_name: target.display_name,
    active_windows: target.active_windows,
    missing_windows: target.missing_windows
  })) ?? [];
  const parsedTargetOutputs = Array.isArray(parsed.target_outputs) ? parsed.target_outputs : [];
  const targetOutputs = targetScope.map((target) => {
    const found = parsedTargetOutputs.find((item) => item?.target_person_id === target.target_person_id);
    return {
      target_person_id: target.target_person_id,
      display_name: target.display_name,
      summary: found?.summary ?? parsed.summary ?? deterministicFinding?.theoretical_findings?.[0] ?? null,
      recommendation: found?.recommendation ?? parsed.recommendation ?? deterministicFinding?.theoretical_findings?.[1] ?? null,
      confidence: Number(clamp(
        Number(found?.confidence ?? parsed.confidence ?? analysis?.aggregate_signal?.confidence ?? 0.5),
        0,
        1
      ).toFixed(4)),
      evidence_refs: Array.isArray(found?.evidence_refs) ? found.evidence_refs : evidenceRefs,
      isolation_status: 'target_partitioned'
    };
  });
  return {
    schema_version: 'expert_opinion.v1',
    opinion_id: createRuntimeId(`expert_opinion_${contextPack.expert_id}`),
    expert_id: contextPack.expert_id,
    discipline: contextPack.discipline,
    role: expertRuntime.role,
    provider: {
      provider_ref: providerRef,
      api_mode: expertRuntime.api_mode,
      status: providerStatus,
      fallback_used: fallbackUsed,
      error: error ? String(error?.message || error) : null
    },
    prompt_template_ref: contextPack.prompt_template?.template_id ?? null,
    isolated_context_pack_ref: contextPack.context_pack_id,
    summary: parsed.summary
      ?? deterministicFinding?.theoretical_findings?.[0]
      ?? `${contextPack.expert_id} completed isolated context analysis.`,
    recommendation: parsed.recommendation
      ?? deterministicFinding?.theoretical_findings?.[1]
      ?? `${contextPack.expert_id} recommends preserving evidence-linked review before action.`,
    confidence: Number(clamp(
      Number(parsed.confidence ?? analysis?.aggregate_signal?.confidence ?? 0.5),
      0,
      1
    ).toFixed(4)),
    evidence_refs: evidenceRefs,
    weight_signal: weightSignal,
    influence_variable_hypotheses: Array.isArray(parsed.influence_variable_hypotheses)
      ? parsed.influence_variable_hypotheses
      : [],
    observable_feedback_metrics: Array.isArray(parsed.observable_feedback_metrics)
      ? parsed.observable_feedback_metrics
      : [],
    risk_or_audit_notes: Array.isArray(parsed.risk_or_audit_notes)
      ? parsed.risk_or_audit_notes
      : [
        'pre_send_gate_required',
        contextPack.guidance_control_boundary?.execution_layer ?? 'expert_output_cannot_execute_directly'
      ],
    boundary_policy: contextPack.guidance_control_boundary,
    target_isolation_policy: contextPack.target_isolation_policy ?? null,
    target_scope: targetScope,
    target_outputs: targetOutputs
  };
}

function resolveExpertProvider({ providerRegistry = {}, expertRuntime, defaultProviderRef = 'default' }) {
  if (expertRuntime.api_mode === 'deterministic') {
    return { provider: null, providerRef: 'deterministic' };
  }
  const providerRef = expertRuntime.api_mode === 'dedicated_provider'
    ? (expertRuntime.provider_ref || expertRuntime.expert_id || defaultProviderRef)
    : (expertRuntime.provider_ref || defaultProviderRef);
  const provider =
    providerRegistry[providerRef]
    ?? providerRegistry.default
    ?? providerRegistry[defaultProviderRef]
    ?? null;
  return { provider, providerRef };
}

async function callExpertProvider(provider, request, timeoutMs) {
  const call = async () => {
    if (typeof provider === 'function') return provider(request);
    if (provider?.runExpert) return provider.runExpert(request);
    if (provider?.completeExpert) return provider.completeExpert(request);
    if (provider?.complete) return provider.complete(request);
    if (provider?.chat) return provider.chat(request);
    throw new Error('provider_missing_supported_expert_method');
  };
  if (!timeoutMs) return call();
  let timer;
  try {
    return await Promise.race([
      call(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('expert_provider_timeout')), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runExpertProviderExecutor({
  expertMatrixAnalysis,
  providerRegistry = {},
  defaultProviderRef = 'default',
  timeoutMs = 45000
}) {
  const runtimeConfig = expertMatrixAnalysis.expert_matrix_runtime_config
    ?? normalizeExpertMatrixRuntimeConfig();
  const analysesByExpert = new Map(
    (expertMatrixAnalysis.independent_context_analysis ?? []).map((analysis) => [analysis.expert_id, analysis])
  );
  const deterministicByExpert = new Map(
    (expertMatrixAnalysis.expert_opinions ?? []).map((opinion) => [opinion.expert_id, opinion])
  );
  const startedAt = new Date().toISOString();
  const lanes = await Promise.all((expertMatrixAnalysis.expert_context_packs ?? []).map(async (contextPack) => {
    const expertRuntime = expertRuntimeConfigFor(runtimeConfig, contextPack.expert_id);
    const { provider, providerRef } = resolveExpertProvider({
      providerRegistry,
      expertRuntime,
      defaultProviderRef
    });
    const request = buildExpertProviderRequest({
      contextPack,
      expertRuntime,
      expertMatrixRuntimeConfig: runtimeConfig
    });
    if (!provider) {
      const opinion = normalizeExpertOpinion({
        parsed: {},
        contextPack,
        analysis: analysesByExpert.get(contextPack.expert_id),
        expertRuntime,
        providerRef,
        providerStatus: 'deterministic_fallback',
        fallbackUsed: true,
        deterministicFinding: deterministicByExpert.get(contextPack.expert_id)
      });
      return {
        lane_id: `provider_lane_${contextPack.expert_id}`,
        expert_id: contextPack.expert_id,
        provider_ref: providerRef,
        api_mode: expertRuntime.api_mode,
        status: 'fallback_completed',
        isolated_context_pack_ref: contextPack.context_pack_id,
        prompt_template_ref: contextPack.prompt_template?.template_id ?? null,
        request,
        opinion
      };
    }
    try {
      const response = await callExpertProvider(provider, request, timeoutMs);
      const parsed = parseExpertProviderResponse(response);
      const opinion = normalizeExpertOpinion({
        parsed,
        contextPack,
        analysis: analysesByExpert.get(contextPack.expert_id),
        expertRuntime,
        providerRef,
        providerStatus: 'provider_completed',
        fallbackUsed: false,
        deterministicFinding: deterministicByExpert.get(contextPack.expert_id)
      });
      return {
        lane_id: `provider_lane_${contextPack.expert_id}`,
        expert_id: contextPack.expert_id,
        provider_ref: providerRef,
        api_mode: expertRuntime.api_mode,
        status: 'provider_completed',
        isolated_context_pack_ref: contextPack.context_pack_id,
        prompt_template_ref: contextPack.prompt_template?.template_id ?? null,
        request,
        opinion
      };
    } catch (error) {
      const opinion = normalizeExpertOpinion({
        parsed: {},
        contextPack,
        analysis: analysesByExpert.get(contextPack.expert_id),
        expertRuntime,
        providerRef,
        providerStatus: 'provider_failed_fallback_completed',
        fallbackUsed: true,
        deterministicFinding: deterministicByExpert.get(contextPack.expert_id),
        error
      });
      return {
        lane_id: `provider_lane_${contextPack.expert_id}`,
        expert_id: contextPack.expert_id,
        provider_ref: providerRef,
        api_mode: expertRuntime.api_mode,
        status: 'provider_failed_fallback_completed',
        isolated_context_pack_ref: contextPack.context_pack_id,
        prompt_template_ref: contextPack.prompt_template?.template_id ?? null,
        request,
        error: error?.message || String(error),
        opinion
      };
    }
  }));

  return {
    schema_version: 'expert_provider_execution.v1',
    execution_id: createRuntimeId('expert_provider_execution'),
    executor: 'parallel_expert_provider_executor',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    mode: runtimeConfig.mode,
    default_provider_ref: defaultProviderRef,
    lane_count: lanes.length,
    provider_completed_count: lanes.filter((lane) => lane.status === 'provider_completed').length,
    fallback_completed_count: lanes.filter((lane) => lane.status !== 'provider_completed').length,
    isolation_policy: {
      one_context_pack_per_lane: true,
      no_cross_expert_context_in_provider_request: true,
      merge_after_all_lanes_complete: true
    },
    lanes,
    expert_opinions: lanes.map((lane) => lane.opinion)
  };
}

function buildInfluenceVariableResearchPlan({ expertMatrixRuntimeConfig, selectedExpertDefinitions, contextSnapshot, recommended }) {
  const modeStrategy = expertMatrixRuntimeConfig?.mode_strategy ?? expertMatrixModeStrategy();
  return {
    schema_version: 'influence_variable_research_plan.v1',
    mode: modeStrategy.mode,
    active: modeStrategy.mode === 'control_variable_research',
    output_scope: modeStrategy.output_scope,
    theoretical_variables: [
      'message_framing',
      'reply_cadence',
      'emotional_temperature',
      'choice_architecture',
      'online_offline_transition_prompt'
    ],
    expert_variable_owners: selectedExpertDefinitions.map((expert) => ({
      expert_id: expert.expert_id,
      focus: expertDisciplineFocus(expert.expert_id)
    })),
    observable_feedback_metrics: [
      'target_reply_latency',
      'target_affective_tone_shift',
      'topic_continuation_or_drop',
      'reciprocal_question_rate',
      'relationship_stage_signal_change'
    ],
    current_draft_ref: recommended?.message_draft ? 'recommended.message_draft' : null,
    context_refs: [
      contextSnapshot?.snapshot_id,
      'context_snapshot.target_context_windows',
      'expert_context_packs'
    ].filter(Boolean),
    audit_requirements: modeStrategy.audit_requirements,
    boundary: {
      analysis_layer_can_model_variables: true,
      execution_permission_source: 'independent_review.pre_send_gate',
      target_visible: false
    }
  };
}

function buildParallelExpertRunLog({
  contextSnapshot,
  selectedExpertDefinitions,
  independentContextAnalysis,
  weightIntegration,
  expertMatrixRuntimeConfig
}) {
  const startedAt = new Date().toISOString();
  const lanes = selectedExpertDefinitions.map((expert) => {
    const analysis = independentContextAnalysis.find((item) => item.expert_id === expert.expert_id);
    const expertRuntime = expertRuntimeConfigFor(expertMatrixRuntimeConfig, expert.expert_id);
    return {
      lane_id: `expert_lane_${expert.expert_id}`,
      expert_id: expert.expert_id,
      discipline: expert.discipline,
      role: expertRuntime.role,
      expert_intensity: expertRuntime.intensity,
      api_mode: expertRuntime.api_mode,
      status: analysis ? 'completed' : 'missing_analysis',
      context_pack_ref: analysis?.context_pack_ref ?? null,
      independent_context_analysis_ref: analysis?.analysis_id ?? null,
      can_run_without_other_experts: true,
      blocks_other_lanes: false,
      output_refs: [
        analysis?.analysis_id ?? null,
        analysis?.context_pack_ref ?? null
      ].filter(Boolean)
    };
  });

  return {
    schema_version: 'parallel_expert_run_log.v1',
    run_log_id: `parallel_expert_run_${contextSnapshot.snapshot_id}`,
    started_at: startedAt,
    completed_at: startedAt,
    executor: 'deterministic_sync_runner_with_parallel_contract',
    runtime_config_ref: 'expert_matrix_runtime_config.v1',
    runtime_config_summary: {
      enabled: expertMatrixRuntimeConfig?.enabled !== false,
      mode: expertMatrixRuntimeConfig?.mode ?? 'experimental_guidance',
      primary_expert_id: expertMatrixRuntimeConfig?.primary_expert_id ?? null,
      global_intensity: expertMatrixRuntimeConfig?.global_intensity ?? 100,
      safety_review_stage: expertMatrixRuntimeConfig?.boundary_policy?.safety_review_stage ?? 'pre_send_gate'
    },
    concurrency_policy: {
      parallelizable: true,
      no_cross_expert_dependency_before_merge: true,
      current_runtime_note: 'The deterministic runtime evaluates lanes synchronously, but each lane consumes an isolated ExpertContextPack and can be moved to Promise.all, worker, sub-agent, or LLM execution without changing the merge contract.'
    },
    context_snapshot_id: contextSnapshot.snapshot_id,
    lane_count: lanes.length,
    completed_lane_count: lanes.filter((lane) => lane.status === 'completed').length,
    lanes,
    merge_step: {
      status: 'completed',
      merge_policy: weightIntegration.merge_policy,
      output_ref: 'expert_weight_integration.v1',
      criterion_adjustments: weightIntegration.criterion_adjustments
    }
  };
}

function integrateExpertWeights(baseWeights, weightIntegration = null) {
  if (!weightIntegration?.criterion_adjustments) {
    return {
      weights: baseWeights,
      applied_adjustments: {},
      changed: false
    };
  }
  const next = { ...baseWeights };
  for (const [criterion, delta] of Object.entries(weightIntegration.criterion_adjustments)) {
    if (!(criterion in next)) continue;
    next[criterion] = Math.max(0.01, (next[criterion] ?? 0) + delta);
  }
  const weights = normalizeWeights(next);
  return {
    weights,
    applied_adjustments: Object.fromEntries(
      Object.keys(baseWeights).map((criterion) => [
        criterion,
        Number(((weights[criterion] ?? 0) - (baseWeights[criterion] ?? 0)).toFixed(4))
      ])
    ),
    changed: Object.entries(weights).some(([criterion, value]) =>
      Math.abs(value - (baseWeights[criterion] ?? 0)) > 0.0001
    )
  };
}

function expertSignals(goalInput, plan, contextSnapshot, recommended) {
  const text = `${goalInput.initial_goal ?? ''}\n${goalInput.context_input ?? ''}\n${recommended.title ?? ''}`.toLowerCase();
  const tags = new Set(['all']);
  if (goalInput.scene) tags.add(goalInput.scene);
  if (plan.scene) tags.add(plan.scene);
  if (goalInput.preferred_channel) tags.add(goalInput.preferred_channel);
  if (isPersonalSocialContext(goalInput, plan)) {
    tags.add('personal_social');
    tags.add('intimacy');
  }
  if (recommended.action_type) tags.add(recommended.action_type);
  if (/预算|报价|价格|budget|price|quote/u.test(text)) tags.add('budget');
  if (/会议|评审|见面|时间|meeting|review/u.test(text)) tags.add('meeting');
  if (/推进|下一步|确认|advance|next/u.test(text)) tags.add('advance');
  if (/冲突|拒绝|投诉|风险|risk|complaint/u.test(text)) tags.add('risk');
  if ((contextSnapshot.event_snapshot.raw_event_count ?? 0) < 3) tags.add('low_evidence');
  return tags;
}

function theoryFindingFor(expert, { goalInput, plan, contextSnapshot, recommended }) {
  const relationship = plan.relationship_summary;
  const topEvent = plan.event_summary.candidate_events[0] ?? null;
  const targetName = relationship.person_name ?? goalInput.primary_person_id ?? '目标对象';
  const action = recommended.title ?? '当前推荐动作';
  const base = {
    expert_id: expert.expert_id,
    discipline: expert.discipline,
    capability: expert.capability,
    methods: expert.methods,
    input_signals: [
      `目标=${goalInput.initial_goal}`,
      `关系=${relationship.relationship_type ?? relationship.type_code ?? 'unknown'}`,
      `阶段=${relationship.phase ?? 'unknown'}`,
      `事件数=${contextSnapshot.event_snapshot.event_count}`,
      `原始观测=${contextSnapshot.event_snapshot.raw_event_count}`
    ],
    output_artifacts: ['theory_hypothesis', 'prediction_signal', 'followup_question']
  };
  const predictionScore = scorePredictionMetric({
    base: expert.expert_id === 'game_theory_expert' ? 0.62 : 0.56,
    contextSnapshot,
    eventBoost: topEvent ? 0.04 : 0
  });
  const personalSocial = isPersonalSocialContext(goalInput, plan);

  if (personalSocial && expert.expert_id === 'game_theory_expert') {
    return {
      ...base,
      theoretical_findings: [
        `${targetName} 的表达更像是在用玩笑测试关系定义，而不是要求立即给出正式承诺。`,
        `${action} 的理论价值是把互动维持在低承诺、高反馈的范围内，让双方继续观察彼此反应。`
      ],
      predictive_value: {
        score: predictionScore,
        reason: '亲密称呼、玩笑式追问和当前关系阶段能形成可观察的低成本信号。'
      },
      next_observable_signals: ['对方是否继续玩笑接话', '是否主动确认关系称呼', '是否出现回避或降温']
    };
  }
  if (personalSocial && expert.expert_id === 'psychology_expert') {
    return {
      ...base,
      theoretical_findings: [
        '当前回复应优先保护安全感和轻松感，避免把对方玩笑立即解释成稳定关系事实。',
        '带有询问余地的幽默回复，可以给对方保留退路，也给用户保留自然推进空间。'
      ],
      predictive_value: {
        score: predictionScore,
        reason: '单屏聊天能支持语气和压力判断，但不足以确认长期关系状态。'
      },
      next_observable_signals: ['对方是否笑着继续', '是否纠正称呼', '是否转向更认真表达']
    };
  }
  if (personalSocial && expert.expert_id === 'language_pragmatics_expert') {
    return {
      ...base,
      theoretical_findings: [
        '“试用期、转正”这类轻量隐喻能回应“男朋友”话题，又不把关系定义说死。',
        '草稿应短、口语化、可改写，避免出现商务寒暄或解释性长句。'
      ],
      predictive_value: {
        score: predictionScore,
        reason: '当前场景的主要可控变量是措辞强度、幽默程度和是否给对方选择空间。'
      },
      next_observable_signals: ['是否继续使用亲昵称呼', '是否接受试探性玩笑', '是否出现压力反馈']
    };
  }

  if (expert.expert_id === 'game_theory_expert') {
    return {
      ...base,
      theoretical_findings: [
        `${targetName} 当前更像在降低承诺成本而不是拒绝互动。`,
        `${action} 的理论优势是把对方从最终决策拉回到低承诺评审。`
      ],
      predictive_value: {
        score: predictionScore,
        reason: '预算、评审、接口和时间线索能形成较清晰的多轮互动预测。'
      },
      next_observable_signals: ['对方是否确认评审材料', '是否继续引入技术或审批角色', '是否回避价格承诺']
    };
  }
  if (expert.expert_id === 'psychology_expert') {
    return {
      ...base,
      theoretical_findings: [
        '当前表达应降低压力和不确定感，避免让对方感到被催促或被迫承诺。',
        '低承诺草稿能提高对方安全感，同时保留继续沟通空间。'
      ],
      predictive_value: {
        score: predictionScore,
        reason: '回复节奏、预算未定和评审窗口能支持压力与动机预测。'
      },
      next_observable_signals: ['回复语气是否放松', '是否愿意补充真实顾虑', '是否出现拖延或防御']
    };
  }
  if (expert.expert_id === 'logic_expert') {
    return {
      ...base,
      theoretical_findings: [
        '不能从一次预算未定推出采购意向消失，只能推出最终承诺条件不足。',
        '推荐动作的结论依赖两个前提：对方仍愿意看材料，且技术评审是可接受的低承诺步骤。'
      ],
      predictive_value: {
        score: predictionScore,
        reason: '能明确区分事实、假设和需要补证的断点。'
      },
      next_observable_signals: ['技术负责人是否出现', '对方是否要求更多材料', '预算线索是否继续出现']
    };
  }
  if (expert.expert_id === 'language_pragmatics_expert') {
    return {
      ...base,
      theoretical_findings: [
        '草稿应把“确认评审”表达为邀请对方判断是否合适，而不是要求对方立刻承诺。',
        '称呼、低承诺语气和具体范围能降低误读概率。'
      ],
      predictive_value: {
        score: predictionScore,
        reason: '消息渠道和草稿文本可直接产生可观察反馈。'
      },
      next_observable_signals: ['是否回应具体时间', '是否接受材料范围', '是否纠正称呼或语气']
    };
  }
  return {
    ...base,
    theoretical_findings: [
      `该专家认为 ${action} 的理论价值在于保留下一步反馈，同时避免把单一线索误判为最终结论。`
    ],
    predictive_value: {
      score: predictionScore,
      reason: '当前上下文足以形成研究性预测，但仍需行动反馈校准。'
    },
    next_observable_signals: topEvent ? [topEvent.event_type_code, '对方回复', '用户复盘'] : ['对方回复', '用户复盘']
  };
}

function buildRankedHypotheses({ goalInput, plan, recommended, contextSnapshot }) {
  const relationship = plan.relationship_summary;
  const targetName = relationship.person_name ?? goalInput.primary_person_id ?? '目标对象';
  const hasBudget = plan.event_summary.candidate_events.some((event) =>
    ['payment_transaction', 'budget_or_price'].includes(event.event_type_code)
  ) || /预算|报价|价格/u.test(goalInput.context_input ?? '');
  const hasMeeting = plan.event_summary.candidate_events.some((event) =>
    ['business_meeting', 'meeting_or_appointment'].includes(event.event_type_code)
  ) || /会议|评审|时间|接口/u.test(goalInput.context_input ?? '');
  const baseScore = contextSnapshot.context_sufficiency_score ?? 0.6;
  const confirmedRomanticRelationship = isConfirmedRomanticRelationship(plan);
  if (isPersonalSocialContext(goalInput, plan)) {
    const hypotheses = [
      {
        hypothesis_id: 'H1_playful_low_pressure_reply_keeps_interaction_open',
        statement: `${targetName} 对轻松、低压力回应的接受概率高于正式确认关系或沉默回避。`,
        predicted_response: '更可能继续以玩笑、表情或轻松短句回应，而不是立即进入严肃关系承诺。',
        predictive_value_score: Number(clamp(baseScore + 0.14).toFixed(4)),
        key_evidence: [
          '对话中出现亲密称呼和男朋友话题',
          confirmedRomanticRelationship
            ? '用户已确认 relationship_fact_status=confirmed 且 type_code=romantic_partner'
            : '当前关系仍是候选探索阶段',
          recommended.message_draft?.draft ?? recommended.title
        ],
        missing_evidence: ['双方历史互动强度', '用户真实偏好语气', '对方对亲密玩笑的稳定接受度'],
        next_observable_signals: ['是否继续玩笑接话', '是否主动确认关系定义', '是否出现回避或降温'],
        counterfactual_breakpoints: ['如果对方明确表示不想被这样称呼，则该假设失效，应切换为边界修复。']
      },
      {
        hypothesis_id: confirmedRomanticRelationship
          ? 'H2_confirmed_romantic_partner_boundary_and_feedback'
          : 'H2_relationship_definition_should_remain_candidate',
        statement: confirmedRomanticRelationship
          ? '用户已确认关系事实，本轮重点不是再次验证关系，而是检验轻松亲密表达是否符合双方当下节奏。'
          : '单屏截图只能证明当下互动线索，不能证明稳定恋爱关系已经成立。',
        predicted_response: confirmedRomanticRelationship
          ? '系统应保留恋爱对象标签，同时继续观察边界、压力和对方回应，避免把单句互动过度推演为长期承诺。'
          : '系统应把“男朋友/亲爱的”记录为关系定义候选，而不是写成已确认事实。',
        predictive_value_score: confirmedRomanticRelationship
          ? Number(clamp(0.62 + baseScore * 0.24).toFixed(4))
          : Number(clamp(baseScore + 0.08).toFixed(4)),
        key_evidence: confirmedRomanticRelationship
          ? ['用户人工确认关系标签', '关系 type_code=romantic_partner', recommended.message_draft?.draft ?? recommended.title]
          : ['身份仍需确认', '截图文本来自可见窗口', '缺少长期上下文'],
        missing_evidence: confirmedRomanticRelationship
          ? ['更长聊天历史', '对方对当前玩笑强度的反馈', '用户执行后的真实感受']
          : ['更长聊天历史', '用户人工确认的人物身份', '双方关系标签确认'],
        next_observable_signals: confirmedRomanticRelationship
          ? ['对方是否自然接话', '是否出现边界信号', '用户是否满意语气']
          : ['用户是否确认人物标签', '后续对方是否持续使用亲密称呼', '是否有明确关系确认语句'],
        counterfactual_breakpoints: confirmedRomanticRelationship
          ? ['如果对方出现不适、拒绝或降温信号，则降低亲密推进权重并切换为边界修复。']
          : ['如果用户确认双方已经是稳定伴侣，则关系图谱标签和权重可以提升。']
      },
      {
        hypothesis_id: 'H3_feedback_calibrates_tone_weight',
        statement: '本轮最重要的回写不是“是否成功推进”，而是对方对幽默强度和关系定义的反馈。',
        predicted_response: '对方回复的轻松程度、继续程度和边界信号会显著影响下一轮专家权重。',
        predictive_value_score: Number(clamp(0.48 + baseScore * 0.35).toFixed(4)),
        key_evidence: [`context_sufficiency=${baseScore}`],
        missing_evidence: ['真实发送后的对方回复', '用户执行感受', '关系权重变化'],
        next_observable_signals: ['reply_received', 'tone_positive', 'boundary_signal', 'user_rating'],
        counterfactual_breakpoints: ['如果用户不执行或改写为完全不同语气，则不能用本草稿预测结果校准。']
      }
    ];
    return hypotheses.sort((a, b) => b.predictive_value_score - a.predictive_value_score);
  }
  const hypotheses = [
    {
      hypothesis_id: 'H1_low_commitment_review_path',
      statement: `${targetName} 对低承诺评审路径的接受概率高于直接成交或强推进。`,
      predicted_response: '更可能回应材料范围、评审时间或参与人，而不是立即给最终决策。',
      predictive_value_score: Number(clamp(baseScore + (hasMeeting ? 0.16 : 0.04)).toFixed(4)),
      key_evidence: ['目标包含评审或下一步', '关系阶段仍可探索', recommended.message_draft?.draft ?? recommended.title],
      missing_evidence: ['对方真实优先级', '技术负责人是否有明确卡点'],
      next_observable_signals: ['是否确认半小时评审', '是否要求接口清单', '是否引入更多内部角色'],
      counterfactual_breakpoints: ['如果对方明确拒绝继续评审，则该假设失效。']
    },
    {
      hypothesis_id: 'H2_budget_uncertainty_limits_commitment',
      statement: '预算或价格不确定会限制最终承诺，但不必然阻断信息评审。',
      predicted_response: hasBudget ? '对方可能继续避免报价承诺，同时接受低成本信息交换。' : '如果后续出现预算线索，推荐动作需要继续保持不承诺价格。',
      predictive_value_score: Number(clamp(baseScore + (hasBudget ? 0.12 : -0.02)).toFixed(4)),
      key_evidence: hasBudget ? ['上下文出现预算、报价或价格线索'] : ['当前预算证据不足'],
      missing_evidence: ['预算负责人', '竞品报价', '内部审批窗口'],
      next_observable_signals: ['是否继续谈价格', '是否要求报价范围', '是否提及竞品'],
      counterfactual_breakpoints: ['如果对方表示预算已锁定且只比较价格，则策略重点转向价值和边界。']
    },
    {
      hypothesis_id: 'H3_evidence_needs_feedback_calibration',
      statement: '当前预测仍依赖少量上下文摘要，需要后续反馈校准专家权重。',
      predicted_response: '行动后的回复、沉默、推进度和用户评分会显著改变下一轮权重。',
      predictive_value_score: Number(clamp(0.48 + baseScore * 0.35).toFixed(4)),
      key_evidence: [`context_sufficiency=${baseScore}`],
      missing_evidence: ['真实发送后的回复', '用户执行感受', '关系变化'],
      next_observable_signals: ['executed', 'reply_received', 'goal_progress', 'user_rating'],
      counterfactual_breakpoints: ['如果用户未执行或平台对象错误，则不能用结果校准关系判断。']
    }
  ];
  return hypotheses.sort((a, b) => b.predictive_value_score - a.predictive_value_score);
}

function buildIndependentReview({
  goalInput,
  recommended,
  contextSnapshot,
  parallelExpertAnalysis,
  controlledSendPreviewAuthorized = false
}) {
  const hardStops = parallelExpertAnalysis?.hard_stop_signals ?? [];
  const directExecution = recommended.action_type === 'direct_execution';
  const unresolvedIdentity = [
    'identity_unmatched',
    'identity_requires_user_confirmation',
    'identity_unverified_desktop_context',
    'source_actor_unknown_requires_user_confirmation',
    'source_actor_not_human_contact',
    'identity_non_human_source',
    'unresolved'
  ]
    .includes(goalInput.identity_gate_decision ?? goalInput.identity_status);
  const draft = recommended.message_draft ?? null;
  const checks = [
    {
      check_id: 'legality',
      status: 'pass',
      reason: '当前输出只生成可编辑草稿和人工确认清单，不执行外部发送。'
    },
    {
      check_id: 'platform_safety',
      status: directExecution ? 'needs_human_review' : 'pass',
      reason: directExecution ? '涉及外部平台发送，必须继续 dry-run 和授权确认。' : '推荐动作不直接调用外部平台。'
    },
    {
      check_id: 'identity_safety',
      status: unresolvedIdentity ? 'needs_human_review' : 'pass',
      reason: unresolvedIdentity ? '目标身份未确认，不允许真实发送或写成已确认关系事实。' : '未发现身份硬阻断。'
    },
    {
      check_id: 'autonomy_and_consent',
      status: draft?.must_confirm_before_send ? 'pass' : 'needs_human_review',
      reason: draft?.must_confirm_before_send ? '草稿保留用户确认和可编辑性。' : '草稿缺少发送前确认标记。'
    },
    {
      check_id: 'auditability',
      status: contextSnapshot.snapshot_id ? 'pass' : 'needs_human_review',
      reason: 'ContextSnapshot、证据、专家分析和草稿可共同进入审计。'
    }
  ];
  const hasReviewNeed = checks.some((check) => check.status !== 'pass') || hardStops.length > 0;
  const outputLevel = directExecution && (hasReviewNeed || unresolvedIdentity)
    ? 'blocked_execution'
    : hasReviewNeed
      ? 'needs_human_review'
      : 'actionable_draft';
  const realExecutionAllowed = controlledSendPreviewAuthorized === true
    && outputLevel === 'actionable_draft'
    && draft?.must_confirm_before_send === true
    && hardStops.length === 0
    && !unresolvedIdentity;
  return {
    schema_version: 'independent_reasonable_legal_safety_review.v1',
    output_level: outputLevel,
    real_execution_allowed: realExecutionAllowed,
    controlled_send_preview_authorized: controlledSendPreviewAuthorized === true,
    blocked_execution: outputLevel === 'blocked_execution',
    checks,
    hard_stop_signals: hardStops,
    required_confirmations: unique([
      '用户确认目标对象和草稿',
      '执行前确认平台联系人',
      unresolvedIdentity ? '身份确认记录' : null,
      directExecution ? '外部连接器授权记录' : null
    ]),
    review_summary: outputLevel === 'actionable_draft'
      ? realExecutionAllowed
        ? '理论结果可以进入受控发送预览候选；仍需用户确认、目标窗口校验、草稿 hash、平台预览和反馈回写计划。'
        : '理论结果可以转为可编辑草稿，但真实发送仍需用户确认。'
      : '理论结果保留研究价值；进入真实行动前必须补齐审查项。'
  };
}

export function buildExpertMatrixAnalysisV2({
  goalInput,
  plan,
  recommended,
  contextSnapshot,
  parallelExpertAnalysis = null,
  weights = null,
  controlledSendPreviewAuthorized = false,
  expertMatrixConfig = null
}) {
  const signals = expertSignals(goalInput, plan, contextSnapshot, recommended);
  const expertMatrixRuntimeConfig = normalizeExpertMatrixRuntimeConfig(expertMatrixConfig);
  const candidateExpertDefinitions = expertMatrixRuntimeConfig.enabled === false
    ? []
    : THEORY_EXPERT_DEFINITIONS
    .filter((expert) => (expert.trigger_tags ?? []).some((tag) => signals.has(tag)))
    .filter((expert) => expertRuntimeConfigFor(expertMatrixRuntimeConfig, expert.expert_id).enabled !== false);
  const primaryExpert = THEORY_EXPERT_DEFINITIONS.find((expert) =>
    expert.expert_id === expertMatrixRuntimeConfig.primary_expert_id
  );
  const selectedExpertDefinitions = unique([
      expertMatrixRuntimeConfig.explicit_config_provided && primaryExpert
        && expertRuntimeConfigFor(expertMatrixRuntimeConfig, primaryExpert.expert_id).enabled !== false
        ? primaryExpert.expert_id
        : null,
      ...candidateExpertDefinitions.map((expert) => expert.expert_id)
    ].filter(Boolean))
    .map((expertId) => THEORY_EXPERT_DEFINITIONS.find((expert) => expert.expert_id === expertId))
    .filter(Boolean)
    .slice(0, 8);
  const independentContextAnalysis = selectedExpertDefinitions.map((expert) =>
    buildIndependentExpertContextAnalysis(expert, {
      goalInput,
      plan,
      contextSnapshot,
      recommended,
      expertMatrixRuntimeConfig
    })
  );
  const weightIntegration = buildExpertWeightIntegration({
    independentContextAnalysis,
    expertMatrixRuntimeConfig
  });
  const expertContextPacks = independentContextAnalysis.map((analysis) => analysis.context_pack);
  const parallelExpertRunLog = buildParallelExpertRunLog({
    contextSnapshot,
    selectedExpertDefinitions,
    independentContextAnalysis,
    weightIntegration,
    expertMatrixRuntimeConfig
  });
  const selectedExperts = selectedExpertDefinitions.map((expert) => theoryFindingFor(expert, {
      goalInput,
      plan,
      contextSnapshot,
      recommended
    }));
  const rankedHypotheses = buildRankedHypotheses({ goalInput, plan, recommended, contextSnapshot });
  const independentReview = buildIndependentReview({
    goalInput,
    recommended,
    contextSnapshot,
    parallelExpertAnalysis,
    controlledSendPreviewAuthorized
  });

  return {
    schema_version: 'expert_matrix_analysis.v2',
    execution_mode: 'parallel_llm_orchestration_contract_with_deterministic_fallback.v1',
    context_snapshot_id: contextSnapshot.snapshot_id,
    expert_matrix_runtime_config: expertMatrixRuntimeConfig,
    mode_strategy: expertMatrixRuntimeConfig.mode_strategy,
    prompt_templates: {
      schema_version: EXPERT_PROMPT_TEMPLATES.schema_version,
      output_schema_ref: EXPERT_PROMPT_TEMPLATES.output_schema_ref,
      template_refs: expertContextPacks.map((pack) => ({
        expert_id: pack.expert_id,
        template_id: pack.prompt_template?.template_id ?? null,
        selected_dimensions: pack.prompt_template?.selected_dimensions ?? null
      }))
    },
    influence_variable_research_plan: buildInfluenceVariableResearchPlan({
      expertMatrixRuntimeConfig,
      selectedExpertDefinitions,
      contextSnapshot,
      recommended
    }),
    parallel_analysis: {
      schema_version: 'parallel_expert_matrix_execution.v1',
      fan_out: selectedExperts.map((expert) => ({
        expert_id: expert.expert_id,
        discipline: expert.discipline,
        independent_context_ref: contextSnapshot.snapshot_id,
        temporal_context_analysis_ref: independentContextAnalysis.find((analysis) =>
          analysis.expert_id === expert.expert_id
        )?.analysis_id ?? null,
        dependency_policy: 'no_cross_expert_dependency_before_merge'
      })),
      merge_policy: 'merge_independent_temporal_context_then_weight_delta_then_review',
      parallelizable: true,
      completed_expert_count: selectedExperts.length,
      run_log_ref: parallelExpertRunLog.run_log_id
    },
    layer_policy: {
      theory_exploration: '理论探索层只按解释力、预测力和反事实价值排序。',
      review_layer: '合理性、合法性和安全性只在理论输出之后独立审查，不反向删除研究假设。',
      configured_boundary_mode: expertMatrixRuntimeConfig.mode,
      guidance_control_boundary_ref: 'expert_matrix_runtime_config.boundary_policy',
      send_review_stage: expertMatrixRuntimeConfig.boundary_policy.safety_review_stage
    },
    llm_orchestration_contract: {
      schema_version: 'llm_expert_orchestration_contract.v1',
      model_input_ref: contextSnapshot.snapshot_id,
      required_output_keys: [
        'expert_matrix_runtime_config',
        'expert_opinions',
        'expert_context_packs',
        'independent_context_analysis',
        'parallel_expert_run_log',
        'weight_integration',
        'theoretical_prediction',
        'independent_review',
        'message_draft'
      ],
      instruction: '基于 ContextSnapshot 分别输出多学科专家理论预测、目标对象的 today/last_7_days/last_30_days/historical 独立上下文分析、预测值依据和独立合理合法安全审查；不要在理论探索阶段提前删除可能性。'
    },
    system_goal_policy: {
      append_only: true,
      rule: 'Future system goals must be appended into the theoretical implementation target set and cannot delete or silently replace existing goals.',
      current_goal_ref: goalInput.initial_goal,
      target_person_ids: contextSnapshot.goal.target_person_ids
    },
    selected_expert_ids: selectedExperts.map((expert) => expert.expert_id),
    expert_opinions: selectedExperts,
    expert_context_packs: expertContextPacks,
    parallel_expert_run_log: parallelExpertRunLog,
    independent_context_analysis: independentContextAnalysis,
    weight_integration: {
      ...weightIntegration,
      base_weights_ref: weights,
      integrated_weight_preview: weights ? integrateExpertWeights(weights, weightIntegration).weights : null
    },
    theoretical_prediction: {
      schema_version: 'theoretical_prediction_value.v1',
      ranking_basis: 'predictive_value_only',
      ranked_hypotheses: rankedHypotheses,
      metrics: {
        explanation_coverage: scorePredictionMetric({ base: 0.52, contextSnapshot }),
        predictive_discrimination: scorePredictionMetric({ base: 0.5, contextSnapshot }),
        counterfactual_robustness: scorePredictionMetric({ base: 0.46, contextSnapshot }),
        strategy_depth: scorePredictionMetric({ base: 0.5, contextSnapshot }),
        feedback_testability: scorePredictionMetric({ base: 0.58, contextSnapshot })
      },
      top_prediction: rankedHypotheses[0]
    },
    independent_review: independentReview,
    message_draft: recommended.message_draft
  };
}

export async function buildExpertMatrixAnalysisV2Async({
  providerRegistry = {},
  defaultProviderRef = 'default',
  providerTimeoutMs = 45000,
  ...args
}) {
  const base = buildExpertMatrixAnalysisV2(args);
  const providerExecution = await runExpertProviderExecutor({
    expertMatrixAnalysis: base,
    providerRegistry,
    defaultProviderRef,
    timeoutMs: providerTimeoutMs
  });
  return {
    ...base,
    execution_mode: 'parallel_provider_executor_with_deterministic_fallback.v1',
    provider_execution: providerExecution,
    provider_expert_opinions: providerExecution.expert_opinions,
    llm_orchestration_contract: {
      ...base.llm_orchestration_contract,
      actual_executor: providerExecution.executor,
      provider_execution_ref: providerExecution.execution_id,
      required_output_keys: unique([
        ...base.llm_orchestration_contract.required_output_keys,
        'provider_execution',
        'provider_expert_opinions'
      ])
    }
  };
}

function summarizeTargetContextWindows(contextSnapshot) {
  return (contextSnapshot.target_context_windows ?? []).map((target) => ({
    target_person_id: target.target_person_id,
    display_name: target.display_name ?? target.target_person_id,
    temporal_coverage_score: target.temporal_coverage_score ?? 0,
    active_windows: target.active_windows ?? [],
    missing_windows: target.missing_windows ?? [],
    windows: (target.windows ?? []).map((window) => ({
      window_id: window.window_id,
      has_context: window.has_context === true,
      evidence_density: window.evidence_density ?? 0,
      event_type_codes: window.event_type_codes ?? [],
      summary_count: (window.summaries ?? []).length
    }))
  }));
}

function buildStructuredCotTrace({
  decisionId,
  goalInput,
  plan,
  contextSnapshot,
  baseWeights,
  preliminaryArtifacts,
  expertWeightRevision,
  artifacts
}) {
  const expertMatrix = artifacts.expertMatrixAnalysis ?? {};
  const romantic = artifacts.romanticGoalAnalysis ?? null;
  const sentenceReview = artifacts.romanticExpertSentenceReview ?? null;
  const coordinator = artifacts.romanticCoordinatorDecision ?? null;
  const recommended = artifacts.recommended ?? {};
  const draft = recommended.message_draft ?? {};
  const thirdPartyPrompts = (sentenceReview?.target_sentence_reviews ?? []).map((item) => ({
    utterance_id: item.utterance_id,
    target_person_id: item.target_person_id,
    prompt_ref: item.third_party_prompt_analysis?.prompt_id ?? item.utterance_id,
    stage: item.third_party_prompt_analysis?.stage ?? romantic?.primary_relationship_stage ?? null,
    transition_decision: item.third_party_prompt_analysis?.transition_decision ?? null,
    not_sent_to_target: item.third_party_prompt_analysis?.not_sent_to_target === true
  }));
  const expertContextPackIds = (expertMatrix.expert_context_packs ?? [])
    .map((pack) => pack.context_pack_id)
    .filter(Boolean);
  const expertAnalysisIds = (expertMatrix.independent_context_analysis ?? [])
    .map((analysis) => analysis.analysis_id)
    .filter(Boolean);

  return {
    schema_version: 'structured_cot_trace.v1',
    trace_id: createRuntimeId('structured_cot_trace'),
    decision_id: decisionId,
    created_at: new Date().toISOString(),
    visibility_policy: {
      log_type: 'auditable_reasoning_summary',
      raw_hidden_chain_of_thought_logged: false,
      operator_visible: true,
      target_visible: false,
      target_visible_fields_allowed: ['approved_message_draft_only'],
      reason: 'The runtime records structured inputs, branch decisions, evidence refs, expert summaries and weight deltas; it does not persist hidden/raw model chain-of-thought.'
    },
    source_contract: {
      goal_ref: goalInput.initial_goal ?? null,
      scene: plan.scene ?? goalInput.scene ?? null,
      preferred_channel: goalInput.preferred_channel ?? null,
      primary_person_id: goalInput.primary_person_id ?? null,
      target_person_ids: contextSnapshot.goal?.target_person_ids ?? goalInput.target_person_ids ?? [],
      context_snapshot_id: contextSnapshot.snapshot_id
    },
    context_assembly: {
      context_snapshot_id: contextSnapshot.snapshot_id,
      context_sufficiency_level: contextSnapshot.context_sufficiency_level ?? null,
      context_sufficiency_score: contextSnapshot.context_sufficiency_score ?? null,
      target_context_windows: summarizeTargetContextWindows(contextSnapshot),
      event_summary: {
        event_count: contextSnapshot.event_snapshot?.event_count ?? 0,
        raw_event_count: contextSnapshot.event_snapshot?.raw_event_count ?? 0,
        candidate_event_count: plan.event_summary?.candidate_events?.length ?? 0
      },
      evidence_refs: [
        'context_snapshot.goal',
        'context_snapshot.relationship_snapshot',
        'context_snapshot.event_snapshot',
        'context_snapshot.target_context_windows'
      ]
    },
    dialogue_generation_logic: {
      generator: isPersonalSocialContext(goalInput, plan)
        ? 'buildPersonalSocialMessageDraft'
        : 'buildMessageDraft.business_low_commitment',
      selected_option_id: recommended.option_id ?? null,
      selected_template_id: draft.selected_template_id ?? null,
      relationship_stage: draft.relationship_stage ?? romantic?.primary_relationship_stage ?? null,
      output_perspective: draft.dialogue_intent_contract?.output_perspective ?? null,
      dialogue_act: draft.dialogue_intent_contract?.dialogue_act ?? null,
      current_turn_goal: draft.current_turn_goal ?? null,
      draft_ref: 'recommended_option.message_draft.draft',
      draft_preview: draft.draft ?? null,
      evidence_refs: draft.evidence_refs ?? recommended.evidence_refs ?? []
    },
    prompt_generation_logic: {
      generator: sentenceReview
        ? 'buildRomanticExpertSentenceReview.third_party_prompt_analysis'
        : 'no_target_sentence_prompt_generator_for_current_scene',
      active_input_blocked_by_default: sentenceReview?.active_input_blocked_display_policy
        ?.active_input_blocked_by_default === true,
      target_visible: false,
      prompt_count: thirdPartyPrompts.length,
      prompt_refs: thirdPartyPrompts,
      evidence_refs: sentenceReview
        ? ['romantic_expert_sentence_review.target_sentence_reviews']
        : []
    },
    expert_matrix_logic: {
      runtime_config: {
        mode: expertMatrix.expert_matrix_runtime_config?.mode ?? null,
        primary_expert_id: expertMatrix.expert_matrix_runtime_config?.primary_expert_id ?? null,
        global_intensity: expertMatrix.expert_matrix_runtime_config?.global_intensity ?? null,
        send_review_stage: expertMatrix.expert_matrix_runtime_config?.boundary_policy?.safety_review_stage ?? null
      },
      selected_expert_ids: expertMatrix.selected_expert_ids ?? [],
      expert_context_pack_ids: expertContextPackIds,
      independent_context_analysis_ids: expertAnalysisIds,
      parallel_run_log_id: expertMatrix.parallel_expert_run_log?.run_log_id ?? null,
      parallelizable: expertMatrix.parallel_expert_run_log?.concurrency_policy?.parallelizable === true,
      merge_policy: expertMatrix.weight_integration?.merge_policy ?? null,
      required_output_keys: expertMatrix.llm_orchestration_contract?.required_output_keys ?? []
    },
    weight_logic: {
      base_weights: baseWeights,
      preliminary_recommended_option_id: preliminaryArtifacts.recommended?.option_id ?? null,
      final_recommended_option_id: recommended.option_id ?? null,
      final_weights: artifacts.weights,
      changed: expertWeightRevision.changed === true,
      applied_adjustments: expertWeightRevision.applied_adjustments ?? {},
      integration_policy: expertMatrix.weight_integration?.merge_policy ?? null
    },
    generation_path: [
      {
        step_id: 'dialogue_input',
        status: 'received',
        output_ref: 'goalInput',
        reason_summary: 'The runtime receives the current goal, target ids, scene, preferred channel and source text reference.'
      },
      {
        step_id: 'context_snapshot',
        status: contextSnapshot.schema_version === 'context_snapshot.v1' ? 'complete' : 'missing',
        output_ref: 'context_snapshot',
        reason_summary: 'Graph, event and temporal target windows are assembled before scoring any reply.'
      },
      {
        step_id: 'option_scoring',
        status: artifacts.options?.length ? 'complete' : 'missing',
        output_ref: 'ranked_options',
        reason_summary: 'Candidate actions are scored with the current weights and the top option receives a message draft.'
      },
      {
        step_id: 'expert_context_pack_fanout',
        status: expertContextPackIds.length ? 'complete' : 'missing',
        output_ref: 'expert_matrix_analysis.expert_context_packs',
        reason_summary: 'Each selected expert receives a human-readable independent context pack with today/week/month/history windows.'
      },
      {
        step_id: 'parallel_expert_merge',
        status: expertMatrix.parallel_expert_run_log?.schema_version === 'parallel_expert_run_log.v1'
          ? 'complete'
          : 'missing',
        output_ref: 'expert_matrix_analysis.parallel_expert_run_log',
        reason_summary: 'Expert lanes are independent before merge; their outputs become bounded weight deltas and review signals.'
      },
      {
        step_id: 'weight_revision',
        status: expertWeightRevision.changed ? 'changed' : 'unchanged',
        output_ref: 'weight_revision',
        reason_summary: 'Expert deltas may rebuild the ranked recommendation while preserving the same goal and review gates.'
      },
      {
        step_id: 'romantic_goal_analysis',
        status: romantic ? 'complete' : 'not_applicable',
        output_ref: 'romantic_goal_analysis',
        reason_summary: 'When the scene is personal-social, relationship stage, online/offline track and cadence are assessed before final display.'
      },
      {
        step_id: 'prompt_generation',
        status: thirdPartyPrompts.length ? 'complete' : 'not_applicable',
        output_ref: 'romantic_expert_sentence_review.target_sentence_reviews',
        reason_summary: 'Target replies are converted into operator-only prompt cards when active input remains blocked.'
      },
      {
        step_id: 'coordinator_and_send_gate',
        status: coordinator?.schema_version ? 'complete' : 'not_applicable',
        output_ref: 'romantic_relationship_coordinator.send_gate_transfer_path',
        reason_summary: 'The coordinator chooses prompt-only or controlled-send-preview transfer and keeps real sending gated.'
      }
    ],
    final_outputs: {
      recommended_option_id: recommended.option_id ?? null,
      message_draft_ref: 'recommended_option.message_draft',
      prompt_count: thirdPartyPrompts.length,
      coordinator_mode: coordinator?.send_gate_transfer_path?.current_mode ?? null,
      real_execution_allowed: expertMatrix.independent_review?.real_execution_allowed === true
    }
  };
}

export function buildDecisionRecommendation({
  goalInput,
  socialGraph,
  rawEvents = [],
  contextSnapshot = null,
  userPreferences = {},
  knowledge = loadDecisionKnowledge(),
  controlledSendPreviewAuthorized = false,
  expertMatrixConfig = null
}) {
  const participants = unique([goalInput.primary_person_id, ...(goalInput.target_person_ids ?? [])]);
  const eventCandidates = extractEventCandidates({
    text: goalInput.context_input ?? '',
    participants
  });
  const plan = buildSocialProcessPlan({
    goalInput,
    graph: socialGraph,
    eventCandidates
  });
  const builtContextSnapshot = contextSnapshot ?? buildContextSnapshot({
    goalInput,
    socialGraph,
    plan,
    rawEvents,
    source: goalInput.source_type ? `${goalInput.source_type}_decision_input` : 'decision_request'
  });
  const baseWeights = adjustWeights(userPreferences, knowledge);
  const buildArtifacts = (activeWeights) => {
    const options = buildOptions(goalInput, plan, userPreferences).map((option) => {
      const scores = criterionScores(option, goalInput, plan, userPreferences);
      return {
        ...option,
        scores,
        weighted_score: scoreOption(option, scores, activeWeights)
      };
    }).sort((a, b) => b.weighted_score - a.weighted_score);

    const recommended = {
      ...options[0],
      message_draft: buildMessageDraft(goalInput, plan, options[0])
    };
    const rankedOptions = [recommended, ...options.slice(1)];
    const skillPlan = buildSkillPlan(recommended, knowledge);
    const evidencePack = buildEvidencePack(goalInput, plan, recommended);
    const feedbackPlan = buildFeedbackPlan(recommended);
    const validationPlan = buildValidationPlan(recommended);
    const roiPreview = calculateFeedbackROI({
      decision_id: 'roi_preview',
      option_id: recommended.option_id,
      outcome: {
        goal_progress: recommended.scores.goal_fit,
        relationship_change: recommended.scores.relationship_fit * 2 - 1,
        cost: recommended.estimated_cost * 1000,
        user_rating: Math.max(1, Math.round(recommended.scores.user_preference_fit * 5))
      }
    });
    const agentOpinions = buildAgentOpinions({
      goalInput,
      plan,
      options: rankedOptions,
      skillPlan,
      evidencePack,
      feedbackPlan,
      validationPlan,
      roiPreview
    });
    const parallelExpertAnalysis = buildParallelExpertAnalysis({
      goalInput,
      plan,
      recommended,
      rankedOptions,
      skillPlan,
      evidencePack,
      validationPlan,
      knowledge
    });
    const baseExpertMatrixAnalysis = buildExpertMatrixAnalysisV2({
      goalInput,
      plan,
      recommended,
      contextSnapshot: builtContextSnapshot,
      parallelExpertAnalysis,
      weights: baseWeights,
      controlledSendPreviewAuthorized,
      expertMatrixConfig
    });
    const romanticGoalAnalysis = isPersonalSocialContext(goalInput, plan)
      ? buildRomanticGoalAnalysis({
        goalInput,
        plan,
        contextSnapshot: builtContextSnapshot,
        rawEvents,
        recommended,
        feedbackPlan,
        validationPlan,
        independentReview: baseExpertMatrixAnalysis.independent_review
      })
      : null;
    const romanticExpertSentenceReview = romanticGoalAnalysis
      ? buildRomanticExpertSentenceReview({
        romanticGoalAnalysis,
        goalInput,
        recommended
      })
      : null;
    const romanticCoordinatorDecision = romanticGoalAnalysis
      ? buildRomanticRelationshipCoordinatorDecision({
        romanticGoalAnalysis,
        romanticExpertSentenceReview,
        recommended,
        contextSnapshot: builtContextSnapshot,
        independentReview: baseExpertMatrixAnalysis.independent_review
      })
      : null;
    const expertMatrixAnalysis = romanticGoalAnalysis
      ? {
        ...baseExpertMatrixAnalysis,
        llm_orchestration_contract: {
          ...baseExpertMatrixAnalysis.llm_orchestration_contract,
          required_output_keys: unique([
            ...baseExpertMatrixAnalysis.llm_orchestration_contract.required_output_keys,
            'romantic_goal_analysis',
            'romantic_expert_sentence_review',
            'romantic_relationship_coordinator_expert'
          ])
        },
        romantic_goal_analysis: romanticGoalAnalysis,
        romantic_expert_sentence_review: romanticExpertSentenceReview,
        romantic_relationship_coordinator: romanticCoordinatorDecision
      }
      : baseExpertMatrixAnalysis;
    return {
      weights: activeWeights,
      options,
      recommended,
      rankedOptions,
      skillPlan,
      evidencePack,
      feedbackPlan,
      validationPlan,
      roiPreview,
      agentOpinions,
      parallelExpertAnalysis,
      expertMatrixAnalysis,
      romanticGoalAnalysis,
      romanticExpertSentenceReview,
      romanticCoordinatorDecision
    };
  };
  const preliminaryArtifacts = buildArtifacts(baseWeights);
  const expertWeightRevision = integrateExpertWeights(
    baseWeights,
    preliminaryArtifacts.expertMatrixAnalysis.weight_integration
  );
  const artifacts = expertWeightRevision.changed
    ? buildArtifacts(expertWeightRevision.weights)
    : preliminaryArtifacts;
  const decisionId = createRuntimeId('decision');
  const structuredCotTrace = buildStructuredCotTrace({
    decisionId,
    goalInput,
    plan,
    contextSnapshot: builtContextSnapshot,
    baseWeights,
    preliminaryArtifacts,
    expertWeightRevision,
    artifacts
  });

  return {
    decision_id: decisionId,
    goal: goalInput.initial_goal,
    scene: plan.scene,
    weights: artifacts.weights,
    base_weights: baseWeights,
    expert_weight_integration: artifacts.expertMatrixAnalysis.weight_integration,
    weight_revision: {
      schema_version: 'expert_adjusted_decision_weights.v1',
      changed: expertWeightRevision.changed,
      applied_adjustments: expertWeightRevision.applied_adjustments,
      preliminary_recommended_option_id: preliminaryArtifacts.recommended.option_id,
      final_recommended_option_id: artifacts.recommended.option_id
    },
    context_snapshot: builtContextSnapshot,
    social_process_plan: plan,
    agent_opinions: artifacts.agentOpinions,
    parallel_expert_analysis: artifacts.parallelExpertAnalysis,
    expert_matrix_analysis: artifacts.expertMatrixAnalysis,
    structured_cot_trace: structuredCotTrace,
    romantic_goal_analysis: artifacts.romanticGoalAnalysis,
    romantic_expert_sentence_review: artifacts.romanticExpertSentenceReview,
    romantic_relationship_coordinator: artifacts.romanticCoordinatorDecision,
    theoretical_prediction: artifacts.expertMatrixAnalysis.theoretical_prediction,
    independent_review: artifacts.expertMatrixAnalysis.independent_review,
    deliberation: buildDeliberation({
      options: artifacts.options,
      recommended: artifacts.recommended,
      agentOpinions: artifacts.agentOpinions,
      skillPlan: artifacts.skillPlan,
      evidencePack: artifacts.evidencePack,
      validationPlan: artifacts.validationPlan,
      parallelExpertAnalysis: artifacts.parallelExpertAnalysis
    }),
    ranked_options: artifacts.rankedOptions,
    recommended_option: artifacts.recommended,
    skill_plan: artifacts.skillPlan,
    evidence_pack: artifacts.evidencePack,
    feedback_plan: artifacts.feedbackPlan,
    validation_plan: artifacts.validationPlan,
    roi_preview: artifacts.roiPreview,
    safety_notes: [
      '外部平台交互默认只生成预览，不自动发送。',
      'P1 高风险事件必须进入用户确认队列。',
      '礼物、金钱、合同和隐私相关行动必须保留证据和复盘。'
    ]
  };
}

export function calculateFeedbackROI(feedbackRecord) {
  const outcome = feedbackRecord.outcome ?? {};
  const goalProgress = outcome.goal_progress ?? 0;
  const relationshipChange = outcome.relationship_change ?? 0;
  const userRating = outcome.user_rating ? outcome.user_rating / 5 : 0.5;
  const cost = outcome.cost ?? 0;
  const normalizedCostPenalty = clamp(cost / 1000, 0, 0.4);
  const benefit = 0.5 * goalProgress + 0.25 * clamp((relationshipChange + 1) / 2) + 0.25 * userRating;
  const roiScore = clamp(benefit - normalizedCostPenalty);

  return {
    decision_id: feedbackRecord.decision_id,
    option_id: feedbackRecord.option_id,
    roi_score: Number(roiScore.toFixed(4)),
    benefit_score: Number(benefit.toFixed(4)),
    cost_penalty: Number(normalizedCostPenalty.toFixed(4)),
    interpretation: roiScore >= 0.7
      ? '高回报行动，可沉淀为优先策略。'
      : roiScore >= 0.45
        ? '中等回报，需要结合关系变化继续观察。'
        : '低回报或风险偏高，后续应降低成本或调整策略。'
  };
}
