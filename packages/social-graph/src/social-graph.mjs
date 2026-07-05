import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function projectRoot() {
  return path.resolve(here, '../../..');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function nowIso() {
  return new Date().toISOString();
}

export function loadSocialGraphKnowledge(root = projectRoot()) {
  return {
    relationshipTypes: readJson(path.join(root, 'knowledge/social-graph/relationship-types-core.json')),
    eventTypes: readJson(path.join(root, 'knowledge/social-graph/event-types-core.json')),
    impactRules: readJson(path.join(root, 'knowledge/social-graph/event-impact-rules.json'))
  };
}

function findPerson(graph, personId) {
  return graph?.people?.find((person) => person.person_id === personId) ?? null;
}

function findRelationship(graph, personId) {
  return graph?.relationships?.find((relationship) =>
    relationship.to_person_id === personId || relationship.from_person_id === personId
  ) ?? null;
}

function relationshipTypeByCode(knowledge, typeCode) {
  return knowledge.relationshipTypes.relationship_types.find((item) => item.type_code === typeCode) ?? null;
}

function recentEventsForPerson(graph, personId, limit = 5) {
  const events = graph?.events ?? [];
  return events
    .filter((event) => event.participants?.some((participant) => participant.person_id === personId))
    .sort((a, b) => String(b.start_at).localeCompare(String(a.start_at)))
    .slice(0, limit);
}

export function buildRelationshipContext({ graph, primaryPersonId, scene = 'business', knowledge = loadSocialGraphKnowledge() }) {
  const person = findPerson(graph, primaryPersonId);
  const relationship = findRelationship(graph, primaryPersonId);
  const type = relationshipTypeByCode(knowledge, relationship?.type_code);
  const recentEvents = recentEventsForPerson(graph, primaryPersonId);

  return {
    person,
    relationship,
    relationship_type: type,
    scene,
    scene_rule: knowledge.relationshipTypes.scene_switching?.[scene] ?? '根据当前场景选择主要关系策略。',
    strategy_constraints: unique([
      ...(type?.default_strategy?.sensitive_topics ?? []).map((topic) => `避免敏感话题：${topic}`),
      type?.default_strategy?.interest_protection,
      relationship?.phase === 'conflict' ? '关系处于冲突期，先降压和澄清，不宜强推进。' : null,
      relationship?.health_score < 0.45 ? '关系健康度偏低，优先修复信任或降低请求强度。' : null
    ]),
    recent_events: recentEvents.map((event) => ({
      event_id: event.event_id,
      event_type_code: event.event_type_code,
      event_level: event.event_level,
      title: event.title,
      sentiment_score: event.sentiment_score,
      importance: event.importance,
      start_at: event.start_at
    }))
  };
}

function eventTypeExists(knowledge, code) {
  return knowledge.eventTypes.event_types.some((item) => item.event_type_code === code);
}

function defaultEventLevel(knowledge, code) {
  return knowledge.eventTypes.event_types.find((item) => item.event_type_code === code)?.default_level ?? 'P3';
}

export function extractEventCandidates({ text, participants = [], source = 'user_input', knowledge = loadSocialGraphKnowledge() }) {
  const input = text ?? '';
  const candidates = [];

  const patterns = [
    {
      event_type_code: 'business_meeting',
      confidence: 0.72,
      sentiment_score: 0.2,
      importance: 0.6,
      keywords: ['会议', '沟通', '评审', '演示', '对齐']
    },
    {
      event_type_code: 'contract_signing',
      confidence: 0.78,
      sentiment_score: 0.4,
      importance: 0.75,
      keywords: ['签约', '续约', '合同', '协议']
    },
    {
      event_type_code: 'payment_transaction',
      confidence: 0.76,
      sentiment_score: 0,
      importance: 0.7,
      keywords: ['付款', '收款', '预算', '报价', '费用', '借款', '还款']
    },
    {
      event_type_code: 'conflict',
      confidence: 0.7,
      sentiment_score: -0.55,
      importance: 0.7,
      keywords: ['争吵', '冲突', '投诉', '不满', '责怪', '甩锅']
    },
    {
      event_type_code: 'help',
      confidence: 0.66,
      sentiment_score: 0.55,
      importance: 0.55,
      keywords: ['帮忙', '帮助', '支持', '协助', '救急']
    },
    {
      event_type_code: 'betrayal',
      confidence: 0.62,
      sentiment_score: -0.85,
      importance: 0.9,
      keywords: ['背叛', '泄密', '出卖', '欺骗']
    },
    {
      event_type_code: 'regular_patronage',
      confidence: 0.58,
      sentiment_score: 0.25,
      importance: 0.35,
      keywords: ['经常光顾', '老顾客', '常去', '消费']
    },
    {
      event_type_code: 'invitation',
      confidence: 0.6,
      sentiment_score: 0.2,
      importance: 0.4,
      keywords: ['邀请', '约', '一起', '参加']
    },
    {
      event_type_code: 'personal_relationship_signal',
      confidence: 0.68,
      sentiment_score: 0.35,
      importance: 0.45,
      keywords: ['亲爱的', '男朋友', '女朋友', '对象', '暧昧', '恋爱', '试用期', '转正', '现在算', '喜欢你', '想你', '抱抱', '亲亲', '捏捏', '不拧巴']
    }
  ];

  for (const pattern of patterns) {
    if (!eventTypeExists(knowledge, pattern.event_type_code)) continue;
    if (!includesAny(input, pattern.keywords)) continue;
    candidates.push({
      candidate_id: `candidate_${pattern.event_type_code}_${candidates.length + 1}`,
      event_type_code: pattern.event_type_code,
      event_level: defaultEventLevel(knowledge, pattern.event_type_code),
      confidence: pattern.confidence,
      participants: participants.map((person_id) => ({
        person_id,
        role: 'other',
        confidence: 0.8
      })),
      time_anchor: {
        estimated_start: nowIso(),
        estimated_end: null,
        time_confidence: 0.4
      },
      evidence_clues: [
        {
          clue_id: `clue_${pattern.event_type_code}_1`,
          clue_type: 'keyword',
          content: pattern.keywords.find((keyword) => input.includes(keyword)),
          at: nowIso(),
          weight: 0.6
        }
      ],
      importance: pattern.importance,
      sentiment_score: pattern.sentiment_score,
      source,
      requires_confirmation: pattern.event_type_code === 'betrayal' || pattern.importance >= 0.85
    });
  }

  return candidates;
}

function decideScene(goalInput, relationshipContext) {
  if (goalInput.scene) return goalInput.scene;
  const dimension = relationshipContext.relationship_type?.dimension;
  if (dimension === 4) return 'business';
  if (dimension === 1) return 'family';
  if (dimension === 2 || dimension === 3) return 'social';
  return 'mixed';
}

function businessSteps(goalInput, relationshipContext, eventCandidates) {
  const hasBudget = eventCandidates.some((event) => event.event_type_code === 'payment_transaction');
  const hasMeeting = eventCandidates.some((event) => event.event_type_code === 'business_meeting');
  return [
    {
      step_id: 'step_1',
      objective: '整理当前关系和事件线索',
      recommended_action: '确认对方角色、最近关键事件、主要阻力和可推进的低承诺动作。',
      channel: 'internal',
      timing: '立即',
      required_evidence: relationshipContext.recent_events.map((event) => event.title).filter(Boolean),
      risk_notes: ['事实和判断分开', '商业机密和合同边界不外泄'],
      success_signal: '形成可执行的下一步目标',
      fallback: '如果信息不足，先向用户追问关键人、预算、技术或审批状态。'
    },
    {
      step_id: 'step_2',
      objective: hasBudget ? '把价格问题转成价值评估问题' : '降低对方决策压力',
      recommended_action: hasMeeting
        ? '基于已有会议线索，推动一次更具体的评审或确认参会人。'
        : '发送低承诺评审邀请，不直接要求最终决定。',
      channel: goalInput.preferred_channel ?? 'wechat',
      timing: goalInput.deadline ? `在 ${goalInput.deadline} 前完成` : '24-48 小时内',
      required_evidence: ['最近沟通记录', '对方已表达的顾虑', '可验证的业务价值或风险清单'],
      risk_notes: ['不制造虚假紧迫感', '不过度承诺', '合同范围外需求需说明边界'],
      success_signal: '对方同意评审、提供真实卡点或确认关键参与人',
      fallback: '若未回复，降级为信息获取目标：确认目前卡在预算、技术、审批还是优先级。'
    },
    {
      step_id: 'step_3',
      objective: '将结果回写为事件候选',
      recommended_action: '根据对方回复生成 business_meeting、payment_transaction、conflict 或 help 等事件候选，等待用户确认入库。',
      channel: 'system',
      timing: '沟通后',
      required_evidence: ['对方回复', '会议结果', '用户复盘'],
      risk_notes: ['P1 事件必须确认', '原始证据默认脱敏'],
      success_signal: '事件候选进入确认队列或复盘完成',
      fallback: '若没有结果，只记录一次 P3 线索，不更新关系权重。'
    }
  ];
}

function socialSteps(goalInput, relationshipContext, eventCandidates) {
  const hasConflict = eventCandidates.some((event) => event.event_type_code === 'conflict');
  return [
    {
      step_id: 'step_1',
      objective: '判断关系温度和维护必要性',
      recommended_action: '结合近期事件、健康度和关系阶段判断是否适合主动联系。',
      channel: 'internal',
      timing: '立即',
      required_evidence: relationshipContext.recent_events.map((event) => event.title).filter(Boolean),
      risk_notes: ['不过度索取', '不触碰敏感话题', '尊重隐私边界'],
      success_signal: '明确是维护、修复、感谢、邀约还是降频',
      fallback: '如果关系健康度低，先选择低压力问候或暂缓推进。'
    },
    {
      step_id: 'step_2',
      objective: hasConflict ? '降低冲突和修复关系' : '做低压力维护动作',
      recommended_action: hasConflict
        ? '先承认对方感受，澄清事实，不急着证明自己正确。'
        : '根据关系类型选择问候、感谢、轻邀约或信息同步。',
      channel: goalInput.preferred_channel ?? 'wechat',
      timing: goalInput.deadline ? `在 ${goalInput.deadline} 前完成` : '合适时机',
      required_evidence: ['最近一次互动', '对方可能敏感点'],
      risk_notes: ['不情绪勒索', '不以关系施压', '不越界打探隐私'],
      success_signal: '对方正向回应或关系压力下降',
      fallback: '若对方冷淡，降低频率并记录关系淡化线索。'
    }
  ];
}

export function buildSocialProcessPlan({
  goalInput,
  graph,
  eventCandidates = null,
  knowledge = loadSocialGraphKnowledge()
}) {
  const relationshipContext = buildRelationshipContext({
    graph,
    primaryPersonId: goalInput.primary_person_id,
    scene: goalInput.scene,
    knowledge
  });
  const scene = decideScene(goalInput, relationshipContext);
  const participants = unique([goalInput.primary_person_id, ...(goalInput.target_person_ids ?? [])]);
  const candidates = eventCandidates ?? extractEventCandidates({
    text: goalInput.context_input ?? '',
    participants,
    knowledge
  });
  const steps = scene === 'business'
    ? businessSteps(goalInput, relationshipContext, candidates)
    : socialSteps(goalInput, relationshipContext, candidates);

  const highRiskCandidates = candidates.filter((candidate) => candidate.event_level === 'P1' || candidate.requires_confirmation);

  return {
    plan_id: `plan_${Date.now()}`,
    initial_goal: goalInput.initial_goal,
    scene,
    primary_person_id: goalInput.primary_person_id,
    relationship_summary: {
      person_name: relationshipContext.person?.display_name ?? goalInput.primary_person_id,
      type_code: relationshipContext.relationship?.type_code ?? null,
      relationship_type: relationshipContext.relationship_type?.relationship_type ?? null,
      phase: relationshipContext.relationship?.phase ?? null,
      trust_level: relationshipContext.relationship?.trust_level ?? relationshipContext.relationship_type?.default_strategy?.default_trust ?? null,
      health_score: relationshipContext.relationship?.health_score ?? null,
      guideline: relationshipContext.relationship_type?.default_strategy?.interaction_guideline ?? null
    },
    event_summary: {
      recent_events: relationshipContext.recent_events,
      candidate_events: candidates
    },
    constraints: unique([
      ...(goalInput.user_constraints ?? []),
      ...relationshipContext.strategy_constraints
    ]),
    steps,
    risk_controls: unique([
      '不自动发送消息',
      'P1 高风险事件必须用户确认',
      '原始证据默认脱敏或本地保留',
      '不利用隐私、脆弱性或信息差操控对方',
      ...highRiskCandidates.map((event) => `候选 ${event.event_type_code} 需要确认后入库`)
    ]),
    confirmation_required: true,
    next_review_questions: [
      '本次进程是否达成最小成功标准？',
      '是否出现新的事件或线索？',
      '关系权重、阶段或健康度是否需要人工修正？'
    ]
  };
}

export function buildSocialGraphContext({ goalInput, graph, knowledge = loadSocialGraphKnowledge() }) {
  const plan = buildSocialProcessPlan({ goalInput, graph, knowledge });
  return {
    relationship_context: plan.relationship_summary,
    event_context: plan.event_summary,
    process_plan: plan
  };
}
