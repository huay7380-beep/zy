import { buildSocialGraphContext } from '../../social-graph/src/index.mjs';

function textOf(ctx) {
  const input = ctx.input;
  return [
    input.context_input,
    input.final_goal,
    input.current_goal,
    input.audience_role,
    input.tone_preference
  ].filter(Boolean).join('\n');
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function splitContext(text) {
  return text
    .split(/[\n。！？!?；;]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 1)
    .slice(0, 20);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export const nodeDefinitions = [
  { name: 'social_graph_context', run: socialGraphContext },
  { name: 'scenario_identification', run: scenarioIdentification },
  { name: 'context_structuring', run: contextStructuring },
  { name: 'audience_modeling', run: audienceModeling },
  { name: 'relationship_judgement', run: relationshipJudgement },
  { name: 'goal_planning', run: goalPlanning },
  { name: 'obstacle_diagnosis', run: obstacleDiagnosis },
  { name: 'technique_matching', run: techniqueMatching },
  { name: 'strategy_card_generation', run: strategyCardGeneration },
  { name: 'expression_generation', run: expressionGeneration },
  { name: 'safety_calibration', run: safetyCalibration },
  { name: 'reaction_simulation', run: reactionSimulation },
  { name: 'memory_patch_generation', run: memoryPatchGeneration }
];

function socialGraphContext(ctx) {
  if (!ctx.input.social_goal || !ctx.input.social_graph) {
    ctx.social_graph_context = null;
    return { enabled: false };
  }

  ctx.social_graph_context = buildSocialGraphContext({
    goalInput: ctx.input.social_goal,
    graph: ctx.input.social_graph
  });

  return {
    enabled: true,
    scene: ctx.social_graph_context.process_plan.scene,
    relationship_type: ctx.social_graph_context.relationship_context.relationship_type,
    candidate_events: ctx.social_graph_context.event_context.candidate_events.length
  };
}

function scenarioIdentification(ctx) {
  const text = [
    ctx.input.context_input,
    ctx.input.final_goal,
    ctx.input.current_goal,
    ctx.input.tone_preference
  ].filter(Boolean).join('\n');
  let subScenario = '客户拖延';
  if (includesAny(text, ['竞品', '对比', '比较'])) subScenario = '客户比较竞品';
  else if (includesAny(text, ['内部', '技术负责人', '财务', '老板', '审批'])) subScenario = '客户内部推进慢';
  else if (includesAny(text, ['太贵', '价格', '预算', '报价'])) subScenario = '客户说太贵';
  else if (includesAny(text, ['不回复', '没回复', '沉默', '未回复'])) subScenario = '客户不回复';

  ctx.scenario = {
    scenario: 'B2B 商务沟通',
    sub_scenario: subScenario,
    user_role: ctx.input.user_role,
    channel: ctx.input.channel,
    expected_output: ['策略卡', '多版本表达', '对话模拟', '复盘建议']
  };
  return { scenario: ctx.scenario.scenario, sub_scenario: subScenario };
}

function contextStructuring(ctx) {
  const text = textOf(ctx);
  const lines = splitContext(ctx.input.context_input);
  const objections = [];
  if (includesAny(text, ['预算', '价格', '太贵'])) objections.push('预算或价格阻力');
  if (includesAny(text, ['技术', '实施', '集成', '安全'])) objections.push('技术或实施风险');
  if (includesAny(text, ['内部', '审批', '老板', '财务'])) objections.push('内部决策链不清');
  if (includesAny(text, ['再看看', '晚点', '不急', '之后'])) objections.push('时机或优先级阻力');
  if (includesAny(text, ['竞品', '替代', '对比'])) objections.push('竞品比较');

  ctx.context_asset = {
    facts: lines.slice(0, 6),
    timeline: lines.slice(0, 4).map((event, index) => ({ order: index + 1, event })),
    audience_objections: unique(objections),
    user_commitments: includesAny(text, ['我发', '已发', '承诺']) ? ['用户可能已承诺提供资料或下一步支持'] : [],
    audience_commitments: includesAny(text, ['会讨论', '会看看', '回头']) ? ['对方承诺内部讨论但未给明确时间'] : [],
    unknowns: unique([
      '最终决策人是谁',
      objections.includes('预算或价格阻力') ? '预算卡点是总额还是价值依据不足' : null,
      objections.includes('内部决策链不清') ? '内部还缺少哪个关键人参与' : null
    ]),
    best_next_step: '推动一次低承诺评审或明确真实卡点'
  };
  return {
    facts: ctx.context_asset.facts.length,
    objections: ctx.context_asset.audience_objections
  };
}

function audienceModeling(ctx) {
  const role = ctx.input.audience_role || '客户采购负责人';
  const isTechnical = includesAny(role, ['技术', 'CTO', '研发']);
  const isExecutive = includesAny(role, ['老板', 'CEO', '负责人', '总']);
  const isFinance = includesAny(role, ['财务', '采购']);

  ctx.audience_model = {
    audience_role: role,
    decision_power: isExecutive ? '高' : isFinance ? '中高' : '中',
    likely_needs: unique([
      isTechnical ? '降低实施和集成风险' : null,
      isFinance ? '证明预算合理性和采购风险可控' : null,
      isExecutive ? '看到 ROI、战略价值和资源投入产出' : null,
      '降低内部推进责任'
    ]),
    likely_concerns: unique([
      '投入产出不清',
      '实施周期或风险',
      '内部共识不足'
    ]),
    evidence_preference: unique([
      isTechnical ? '技术评审清单' : null,
      isFinance ? 'ROI 测算和预算说明' : null,
      isExecutive ? '业务结果和机会成本' : null,
      '案例和风险控制表'
    ]),
    communication_style: '谨慎、重证据、不喜欢被强压',
    recommended_approach: '先降低决策压力，再推动低承诺下一步'
  };
  return { role, decision_power: ctx.audience_model.decision_power };
}

function relationshipJudgement(ctx) {
  const text = textOf(ctx);
  let relationshipState = '初步兴趣';
  if (includesAny(text, ['不回复', '没回复', '沉默', '再看看', '晚点'])) relationshipState = '拖延停滞';
  if (ctx.context_asset.audience_objections.length) relationshipState = '有阻力';
  if (includesAny(text, ['别催', '反感', '不考虑', '不要再'])) relationshipState = '防御或反感';

  ctx.relationship_state = {
    state: relationshipState,
    evidence: ctx.context_asset.audience_objections,
    recommended_move: relationshipState === '防御或反感'
      ? '降低压力，先修复信任'
      : '把大决策拆成低承诺下一步'
  };
  return ctx.relationship_state;
}

function goalPlanning(ctx) {
  const finalGoal = ctx.input.final_goal || '推动客户进入下一步评估';
  const currentGoal = ctx.input.current_goal || '让客户确认一次低承诺评审或说明真实卡点';
  ctx.goal_ladder = {
    final_goal: finalGoal,
    stage_goal: '进入正式评估或明确是否值得继续推进',
    current_goal: currentGoal,
    minimum_success: '客户回复并给出下一步判断',
    fallback_goal: '识别真实卡点是预算、技术、内部责任还是优先级',
    learning_goal: '补全客户内部决策链和主要风险',
    failure_signal: '客户继续模糊拖延且不给任何下一步'
  };
  return { current_goal: currentGoal, minimum_success: ctx.goal_ladder.minimum_success };
}

function obstacleDiagnosis(ctx) {
  const text = textOf(ctx);
  const obstacleTypes = [];
  if (includesAny(text, ['预算', '价格', '太贵', '报价'])) obstacleTypes.push('价格阻力');
  if (includesAny(text, ['值不值', 'ROI', '效果', '收益'])) obstacleTypes.push('价值阻力');
  if (includesAny(text, ['信任', '案例', '资质'])) obstacleTypes.push('信任阻力');
  if (includesAny(text, ['不急', '晚点', '之后', '再看看'])) obstacleTypes.push('时机阻力');
  if (includesAny(text, ['老板', '财务', '审批', '内部'])) obstacleTypes.push('权限或内部协同阻力');
  if (includesAny(text, ['技术', '实施', '风险', '安全', '集成'])) obstacleTypes.push('风险阻力');
  if (includesAny(text, ['竞品', '替代', '对比'])) obstacleTypes.push('竞品阻力');

  ctx.obstacle_profile = {
    primary_obstacle: obstacleTypes[0] ?? '信息不足或推进动能不足',
    obstacle_types: unique(obstacleTypes),
    diagnostic_question: obstacleTypes.includes('价格阻力')
      ? '目前主要卡点是总预算本身，还是还缺少判断投入价值的依据？'
      : '目前最需要先确认的是内部流程、技术风险，还是业务优先级？',
    recommended_strategy: '不要直接逼迫最终决定，先把问题收敛到一个低风险验证动作'
  };
  return ctx.obstacle_profile;
}

function techniqueMatching(ctx) {
  const obstacles = ctx.obstacle_profile.obstacle_types.join(' ');
  const techniques = ctx.knowledge.techniques.techniques;
  const selected = techniques
    .filter((technique) => technique.tags.some((tag) => obstacles.includes(tag) || ctx.scenario.sub_scenario.includes(tag)))
    .slice(0, 5);
  const fallback = techniques.slice(0, 5);
  ctx.recommended_techniques = (selected.length ? selected : fallback).map((technique) => ({
    name: technique.name,
    category: technique.category,
    effect: technique.effect,
    expression_pattern: technique.expression_pattern
  }));
  return { techniques: ctx.recommended_techniques.map((item) => item.name) };
}

function strategyCardGeneration(ctx) {
  const techniqueNames = ctx.recommended_techniques.map((item) => item.name);
  const socialPlan = ctx.social_graph_context?.process_plan;
  const relationshipSummary = ctx.social_graph_context?.relationship_context;
  const socialConstraints = socialPlan?.constraints ?? [];
  const nextPlanStep = socialPlan?.steps?.[1];
  ctx.strategy_card = {
    current_situation: `当前不是单纯表达问题，而是${ctx.obstacle_profile.primary_obstacle}导致推进受阻。`,
    current_goal: ctx.goal_ladder.current_goal,
    audience_concerns: ctx.audience_model.likely_concerns,
    recommended_strategy: ctx.obstacle_profile.recommended_strategy,
    techniques_used: techniqueNames,
    social_graph_context: relationshipSummary ? {
      relationship_type: relationshipSummary.relationship_type,
      phase: relationshipSummary.phase,
      trust_level: relationshipSummary.trust_level,
      health_score: relationshipSummary.health_score,
      guideline: relationshipSummary.guideline
    } : null,
    process_plan_next_step: nextPlanStep ? {
      objective: nextPlanStep.objective,
      recommended_action: nextPlanStep.recommended_action,
      success_signal: nextPlanStep.success_signal,
      fallback: nextPlanStep.fallback
    } : null,
    message_structure: '承认处境 -> 降低承诺 -> 提供验证路径 -> 给出明确下一步',
    emphasize: ['评审不等于采购决定', '下一步是降低判断成本', '把风险讲清楚后再决定'],
    avoid: unique(['不要直接催签', '不要制造虚假紧迫感', '不要暗示对方不推进就是失职', ...socialConstraints]),
    expected_reaction: ['同意下一步', '继续拖延', '提出价格异议', '要求先发资料']
  };
  return { techniques: techniqueNames, current_goal: ctx.strategy_card.current_goal };
}

function expressionGeneration(ctx) {
  const goal = ctx.goal_ladder.current_goal;
  const diagnostic = ctx.obstacle_profile.diagnostic_question;
  ctx.draft_versions = {
    best: `我理解你们现在还需要谨慎判断，不适合直接做最终决定。更稳妥的方式是先把下一步限定为一次轻量评审，把实施风险、投入产出和内部需要确认的问题讲清楚。这样你们内部判断会更有依据。你看这周三或周五哪个时间更方便？`,
    strong_but_respectful: `我建议这件事不要继续停留在泛泛讨论。当前最关键的不是马上采购，而是先确认这个方向是否值得进入正式评估。我们可以安排一次评审，把关键风险和收益测算一次性讲清楚，再决定是否继续推进。`,
    soft_follow_up: `你们不用现在做采购判断。我们可以先做一次低压力的评审，把关键问题对齐，之后你们再决定是否继续推进。这样也能减少内部反复沟通的成本。`,
    short_message: `先不推进最终决定，我们可以先做一次轻量评审，把风险和收益讲清楚。${diagnostic}`,
    email: `主题：建议先安排一次轻量评审\n\n您好，\n\n结合目前沟通情况，我建议先不把目标放在最终决定上，而是先完成：${goal}。\n\n这次评审的价值是把关键风险、投入产出和内部需要确认的问题一次性对齐，帮助你们更稳妥地判断是否值得继续推进。\n\n如方便，我们可以在本周安排 30 分钟沟通。\n`
  };
  return { versions: Object.keys(ctx.draft_versions) };
}

function safetyCalibration(ctx) {
  const text = `${textOf(ctx)}\n${Object.values(ctx.draft_versions).join('\n')}`;
  const triggeredRules = ctx.knowledge.safetyRules.rules.filter((rule) =>
    rule.keywords.some((keyword) => text.includes(keyword))
  );
  ctx.safety_review = {
    risk_level: triggeredRules.length ? 'yellow' : 'green',
    triggered_rules: triggeredRules.map((rule) => rule.name),
    allowed: triggeredRules.every((rule) => rule.action !== 'block'),
    recommendation: triggeredRules.length
      ? '保留真实目标，但移除虚假、冒充、胁迫或隐藏重大事实的表达，改为基于事实的风险提醒和低承诺下一步。'
      : '未发现明显越界风险。',
    must_confirm_before_send: true
  };
  return ctx.safety_review;
}

function reactionSimulation(ctx) {
  ctx.simulation_result = {
    simulated_reactions: [
      {
        type: 'positive',
        customer_reply: '可以，你发几个时间。',
        recommended_next: '给出两个具体时间，并确认需要哪些角色参加。'
      },
      {
        type: 'delay',
        customer_reply: '我们再看看吧。',
        recommended_next: ctx.obstacle_profile.diagnostic_question
      },
      {
        type: 'price_objection',
        customer_reply: '你们这个方案可能太贵了。',
        recommended_next: '先确认是总预算问题，还是价值依据不足，不要马上降价。'
      },
      {
        type: 'material_request',
        customer_reply: '你先发资料吧。',
        recommended_next: '发送资料时绑定下一步讨论，避免只发资料后失联。'
      }
    ]
  };
  return { reactions: ctx.simulation_result.simulated_reactions.map((item) => item.type) };
}

function memoryPatchGeneration(ctx) {
  ctx.memory_patch = {
    should_write_long_term: false,
    reason: '第一版只生成记忆补丁，等待用户确认后再写入长期记忆。',
    candidate_learnings: [
      `该场景主要阻力：${ctx.obstacle_profile.primary_obstacle}`,
      `对方可能偏好证据：${ctx.audience_model.evidence_preference.join('、')}`,
      `推荐技巧：${ctx.recommended_techniques.map((item) => item.name).join('、')}`
    ],
    review_questions: [
      '对方是否回复？',
      '是否进入下一步？',
      '是否出现新的异议？',
      '关系状态变好、持平还是变差？'
    ]
  };
  return { candidate_learnings: ctx.memory_patch.candidate_learnings.length };
}
