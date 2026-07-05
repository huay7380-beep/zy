import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StateNotebook } from '../../agent-runtime/src/state-notebook.mjs';
import { buildDecisionRecommendation } from '../../decision-cluster/src/index.mjs';
import {
  appendFeedbackRecord,
  appendRawEvent,
  appendSemanticEvent,
  initializeStorage,
  loadStorageSnapshot,
  analyzePilotIntakeReadiness,
  normalizePilotImportBatch,
  rebuildEventIndexes,
  upsertPeople,
  upsertRelationships
} from '../../storage-runtime/src/index.mjs';
import {
  buildAutomationPreview,
  buildPlatformDryRunConnector,
  buildTriggerPlan,
  inspectAutomationPreviewTestPage,
  inspectPlatformDryRunConnector,
  renderAutomationPreviewTestPage,
  runAutomationPreviewTrial
} from '../../trigger-engine/src/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function projectRoot() {
  return path.resolve(here, '../../..');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function nowIso() {
  return new Date().toISOString();
}

function createRuntimeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function semanticEventsToGraphEvents(events) {
  return events.map((event) => ({
    event_id: event.event_id,
    start_at: event.occurred_at ?? event.created_at ?? nowIso(),
    status: event.status === 'confirmed' ? 'completed' : 'planned',
    event_level: event.event_level,
    event_type_code: event.event_type_code,
    title: event.tags?.join(' / ') ?? event.event_type_code,
    description: event.evidence?.join('；') ?? '',
    importance: event.weight,
    sentiment_score: 0,
    source: 'mvp_loop_fixture',
    confidence: event.confidence,
    participants: (event.linked_person_ids ?? []).map((person_id) => ({
      person_id,
      role: 'target',
      impact_factor: 0.8
    })),
    clues: event.evidence ?? []
  }));
}

function buildGoalInput(loop) {
  const primaryRelationship = loop.relationships[0];
  const rawContext = loop.raw_events
    .map((event) => event.content_summary ?? event.content)
    .filter(Boolean)
    .join('；');
  return {
    initial_goal: loop.initial_goal,
    scene: 'business',
    primary_person_id: primaryRelationship.to_person_id,
    target_person_ids: loop.people.map((person) => person.person_id),
    context_input: rawContext,
    preferred_channel: 'wechat',
    user_constraints: ['不自动发送', '不制造虚假紧迫感', '保留证据']
  };
}

function buildSocialGraph(loop, semanticEvents = loop.semantic_events) {
  return {
    user_id: 'user',
    people: loop.people,
    relationships: loop.relationships,
    events: semanticEventsToGraphEvents(semanticEvents)
  };
}

function buildGoalInputFromPilotImport(normalizedImport) {
  const primaryRelationship = normalizedImport.relationships[0];
  const goal = normalizedImport.goal ?? {};
  const rawContext = normalizedImport.raw_events
    .map((event) => event.content_summary ?? event.content)
    .filter(Boolean)
    .join('；');
  const targetPersonIds = goal.target_person_ids?.length
    ? goal.target_person_ids
    : normalizedImport.people.map((person) => person.person_id);

  return {
    initial_goal: goal.initial_goal ?? `基于导入样本 ${normalizedImport.import_id} 生成下一步跟进建议`,
    scene: goal.scene ?? 'business',
    primary_person_id: goal.primary_person_id ?? primaryRelationship?.to_person_id ?? targetPersonIds[0] ?? null,
    target_person_ids: targetPersonIds,
    context_input: rawContext,
    preferred_channel: goal.preferred_channel ?? 'wechat',
    user_constraints: goal.user_constraints ?? ['不自动发送', '保留证据', '基于导入样本给出建议']
  };
}

function buildSocialGraphFromPilotImport(normalizedImport, semanticEvents = normalizedImport.semantic_events) {
  return {
    user_id: 'user',
    people: normalizedImport.people,
    relationships: normalizedImport.relationships,
    events: semanticEventsToGraphEvents(semanticEvents)
  };
}

function applyRuntimeIds(record, { decisionId, triggerId, feedbackId }) {
  return {
    ...record,
    decision_id: record.decision_id ? decisionId : record.decision_id,
    trigger_id: record.trigger_id ? triggerId : record.trigger_id,
    feedback_id: record.feedback_id ? feedbackId : record.feedback_id
  };
}

function summarizeIntakeReadiness(readiness) {
  if (!readiness) return null;
  return {
    schema_version: readiness.schema_version,
    readiness_id: readiness.readiness_id,
    gate_decision: readiness.gate_decision,
    ready_for_decision_trial: readiness.ready_for_decision_trial,
    ready_for_closed_loop_mvp: readiness.ready_for_closed_loop_mvp,
    required_failures: readiness.required_failures,
    recommended_failures: readiness.recommended_failures,
    metrics: readiness.metrics,
    thresholds: readiness.thresholds
  };
}

function normalizeRuntimeFeedback(feedback, { decisionId, triggerId }) {
  return {
    ...feedback,
    decision_id: decisionId,
    trigger_id: triggerId
  };
}

function normalizePilotFeedback(feedback, { importId, decisionId, triggerId }) {
  return normalizeRuntimeFeedback({
    feedback_id: `feedback_${importId}_runtime`,
    executed: false,
    reply_received: false,
    goal_progress: 0,
    relationship_change: 0,
    user_rating: 0,
    new_event_candidate_ids: [],
    ...feedback
  }, { decisionId, triggerId });
}

function buildPilotWritebackEvent({ importId, feedback, decisionId, triggerId }) {
  const progress = Number(feedback.goal_progress ?? 0);
  const positive = Boolean(feedback.executed && feedback.reply_received && progress > 0);
  return {
    event_id: `semantic_${importId}_runtime_feedback_${feedback.feedback_id}`,
    raw_event_ids: [],
    event_type_code: positive ? 'feedback_positive_progress' : 'feedback_followup_needed',
    event_level: positive ? 'P2' : 'P3',
    status: 'confirmed',
    tags: positive ? ['反馈', '回写', '客户推进'] : ['反馈', '回写', '待跟进'],
    weight: positive ? Math.min(1, 0.55 + progress * 0.35) : 0.45,
    confidence: 0.78,
    evidence: [
      `执行=${feedback.executed}`,
      `收到回复=${feedback.reply_received}`,
      `目标推进=${feedback.goal_progress}`
    ],
    linked_person_ids: feedback.linked_person_ids ?? [],
    linked_relationship_ids: feedback.linked_relationship_ids ?? [],
    decision_id: decisionId,
    trigger_id: triggerId,
    feedback_id: feedback.feedback_id,
    requires_confirmation: false,
    metadata: {
      import_id: importId,
      generated_by: 'mvp_runtime_import_feedback_writeback'
    },
    created_at: nowIso()
  };
}

function selectLoop(fixture, { loopId, loopIndex }) {
  if (loopId) {
    const loop = fixture.closed_loops.find((item) => item.loop_id === loopId);
    if (!loop) throw new Error(`unknown loop_id: ${loopId}`);
    return loop;
  }
  const loop = fixture.closed_loops[loopIndex ?? 0];
  if (!loop) throw new Error(`unknown loop_index: ${loopIndex ?? 0}`);
  return loop;
}

function completeNode(notebook, runId, nodeName, summary) {
  notebook.completeNode(runId, nodeName, summary);
}

function hasPersonIndex(snapshot, personIds) {
  return personIds.every((personId) => snapshot.indexes.person_event.entries[personId]);
}

function summarizeLoopQuality({
  loop,
  decision,
  triggerPlan,
  automationPreviewTrial,
  automationPreviewTestPage,
  snapshot,
  writebackEvents,
  intakeReadiness = null
}) {
  const feedback = snapshot.feedback_records[0] ?? null;
  const agentOpinionComplete = decision.agent_opinions.length === 9;
  const feedbackComplete = Boolean(feedback?.executed && feedback?.reply_received);
  const writebackComplete = writebackEvents.length > 0
    && writebackEvents.every((event) => snapshot.semantic_events.some((stored) => stored.event_id === event.event_id));
  const indexRebuildComplete = hasPersonIndex(snapshot, loop.people.map((person) => person.person_id))
    && Object.keys(snapshot.indexes.tag_event.entries).length > 0;
  const auditComplete = snapshot.audit_records.length >= 8;
  const triggerReadyForReview = triggerPlan.status === 'waiting_confirmation';
  const automationPreviewComplete = Boolean(
    automationPreviewTrial?.preview_reached
    && automationPreviewTrial.real_execution_allowed === false
    && automationPreviewTestPage?.inspection?.send_button_disabled
    && automationPreviewTestPage?.inspection?.real_execution_blocked
  );
  const platformDryRunConnectorComplete = Boolean(
    automationPreviewTestPage?.platform_dry_run_connector_check?.preview_reached
    && automationPreviewTestPage.platform_dry_run_connector_check.send_blocked
    && automationPreviewTestPage.platform_dry_run_connector_check.real_execution_allowed === false
  );
  const intakeReadinessComplete = intakeReadiness
    ? Boolean(
        intakeReadiness.ready_for_closed_loop_mvp
        && intakeReadiness.required_failures.length === 0
      )
    : true;
  const closedLoopComplete = feedbackComplete
    && writebackComplete
    && indexRebuildComplete
    && auditComplete
    && automationPreviewComplete
    && platformDryRunConnectorComplete
    && intakeReadinessComplete;

  return {
    loop_id: loop.loop_id,
    closed_loop_complete: closedLoopComplete,
    feedback_complete: feedbackComplete,
    writeback_complete: writebackComplete,
    index_rebuild_complete: indexRebuildComplete,
    audit_complete: auditComplete,
    agent_opinion_complete: agentOpinionComplete,
    trigger_ready_for_review: triggerReadyForReview,
    automation_preview_complete: automationPreviewComplete,
    platform_dry_run_connector_complete: platformDryRunConnectorComplete,
    intake_readiness_required: Boolean(intakeReadiness),
    intake_readiness_complete: intakeReadinessComplete,
    intake_gate_decision: intakeReadiness?.gate_decision ?? 'not_required',
    intake_required_failures: intakeReadiness?.required_failures ?? [],
    automation_preview_reached: automationPreviewTrial?.preview_reached === true,
    real_execution_allowed: automationPreviewTrial?.real_execution_allowed === true,
    automation_test_page_blocked: automationPreviewTestPage?.inspection?.real_execution_blocked === true,
    raw_event_count: snapshot.raw_events.length,
    semantic_event_count: snapshot.semantic_events.length,
    feedback_count: snapshot.feedback_records.length,
    audit_count: snapshot.audit_records.length
  };
}

function ratio(count, total) {
  return total > 0 ? Number((count / total).toFixed(4)) : 0;
}

function summarizeBatch(results) {
  const total = results.length;
  const countWhere = (predicate) => results.filter((result) => predicate(result.quality)).length;
  const feedbackCompleteLoops = countWhere((quality) => quality.feedback_complete);
  const closedLoopCompleteLoops = countWhere((quality) => quality.closed_loop_complete);
  const agentOpinionCompleteLoops = countWhere((quality) => quality.agent_opinion_complete);
  const indexCompleteLoops = countWhere((quality) => quality.index_rebuild_complete);
  const auditCompleteLoops = countWhere((quality) => quality.audit_complete);
  const triggerReviewLoops = countWhere((quality) => quality.trigger_ready_for_review);
  const automationPreviewLoops = countWhere((quality) => quality.automation_preview_complete);
  const platformDryRunConnectorLoops = countWhere((quality) => quality.platform_dry_run_connector_complete);
  const realUserReviewCompleteLoops = countWhere((quality) => quality.real_user_review_complete);
  const optimizationCompleteLoops = countWhere((quality) => quality.optimization_result_complete);

  const hardExitSignals = [];
  if (total >= 3 && feedbackCompleteLoops < 2) {
    hardExitSignals.push('3 条闭环中少于 2 条完成反馈，停止扩大样本。');
  }
  if (agentOpinionCompleteLoops < total) {
    hardExitSignals.push('策略小组未完整输出 9 个 Agent 意见，停止扩大样本。');
  }
  if (indexCompleteLoops < total) {
    hardExitSignals.push('索引重建未覆盖全部试点样本，先修复存储或索引。');
  }
  if (auditCompleteLoops < total) {
    hardExitSignals.push('审计记录不足，先修复状态可重建性。');
  }
  if (automationPreviewLoops < total) {
    hardExitSignals.push('自动化预览未能在全部样本到达执行前预览，先暂停自动化扩大。');
  }
  if (platformDryRunConnectorLoops < total) {
    hardExitSignals.push('平台 dry-run 连接器检查未全部通过，先暂停真实平台预览扩大。');
  }
  if (realUserReviewCompleteLoops < total) {
    hardExitSignals.push('真实用户视角回顾未完整覆盖总目标、场景、检查项和优化焦点，先暂停扩大样本。');
  }
  if (optimizationCompleteLoops < total) {
    hardExitSignals.push('闭环反馈后的优化结果不完整，先补齐下一步、变更依据和停止标准。');
  }

  const continueSignals = [
    total >= 3,
    feedbackCompleteLoops >= 2,
    closedLoopCompleteLoops >= 2,
    agentOpinionCompleteLoops === total,
    indexCompleteLoops === total,
    auditCompleteLoops === total,
    automationPreviewLoops === total,
    platformDryRunConnectorLoops === total,
    realUserReviewCompleteLoops === total,
    optimizationCompleteLoops === total
  ];
  const gateDecision = hardExitSignals.length
    ? 'stop_or_adjust'
    : continueSignals.every(Boolean)
      ? 'continue'
      : 'adjust';

  return {
    total_loops: total,
    closed_loop_complete_loops: closedLoopCompleteLoops,
    feedback_complete_loops: feedbackCompleteLoops,
    agent_opinion_complete_loops: agentOpinionCompleteLoops,
    index_complete_loops: indexCompleteLoops,
    audit_complete_loops: auditCompleteLoops,
    trigger_review_loops: triggerReviewLoops,
    automation_preview_complete_loops: automationPreviewLoops,
    platform_dry_run_connector_complete_loops: platformDryRunConnectorLoops,
    real_user_review_complete_loops: realUserReviewCompleteLoops,
    optimization_complete_loops: optimizationCompleteLoops,
    raw_event_count: results.reduce((sum, result) => sum + result.quality.raw_event_count, 0),
    semantic_event_count: results.reduce((sum, result) => sum + result.quality.semantic_event_count, 0),
    feedback_count: results.reduce((sum, result) => sum + result.quality.feedback_count, 0),
    audit_count: results.reduce((sum, result) => sum + result.quality.audit_count, 0),
    rates: {
      closed_loop_completion: ratio(closedLoopCompleteLoops, total),
      feedback_completion: ratio(feedbackCompleteLoops, total),
      agent_opinion_completion: ratio(agentOpinionCompleteLoops, total),
      index_completion: ratio(indexCompleteLoops, total),
      audit_completion: ratio(auditCompleteLoops, total),
      automation_preview_completion: ratio(automationPreviewLoops, total),
      platform_dry_run_connector_completion: ratio(platformDryRunConnectorLoops, total),
      real_user_review_completion: ratio(realUserReviewCompleteLoops, total),
      optimization_completion: ratio(optimizationCompleteLoops, total)
    },
    gate_decision: gateDecision,
    continue_when: [
      '至少 3 条闭环样本完成运行。',
      '3 条闭环中至少 2 条完成反馈。',
      '至少 2 条闭环完成反馈、回写、索引和审计。',
      '每条闭环都输出 9 个 Agent 意见。',
      '每条闭环都能重建索引并留下审计记录。',
      '每条闭环都能到达 dry-run 自动化预览，且真实执行保持阻断。',
      '每条闭环都能通过平台 dry-run 连接器检查。',
      '每条闭环都能输出完整真实用户视角回顾和优化结果。'
    ],
    stop_or_adjust_when: [
      '3 条闭环中少于 2 条完成反馈。',
      'Agent 意见、索引或审计任一关键节点缺失。',
      '自动化预览未到达执行前页面或真实发送阻断失效。',
      '平台 dry-run 连接器检查失败。',
      '真实用户视角回顾、优化结果或停止标准缺失。',
      '状态上报出现不可重建错误。'
    ],
    hard_exit_signals: hardExitSignals
  };
}

function checkStatus(condition) {
  return condition ? 'pass' : 'needs_attention';
}

function buildRealUserScenarioReview({
  source,
  goalInput,
  decision,
  triggerPlan,
  feedback,
  quality,
  importSummary = null
}) {
  const checks = [
    {
      check_id: 'goal_clarity',
      status: checkStatus(Boolean(goalInput.initial_goal && goalInput.primary_person_id)),
      evidence: [
        `目标=${goalInput.initial_goal}`,
        `主要对象=${goalInput.primary_person_id ?? '缺失'}`
      ],
      real_user_feedback: '真实用户需要一眼看懂这次跟进对象、目标和最低成功标准，否则后续建议难以执行。',
      optimization_hint: '在应用内把目标、对象和最低成功标准放在执行页顶部。'
    },
    {
      check_id: 'relationship_context',
      status: checkStatus(decision.social_process_plan?.relationship_summary?.target_person_id || goalInput.primary_person_id),
      evidence: [
        `关系对象=${decision.social_process_plan?.relationship_summary?.target_person_id ?? goalInput.primary_person_id ?? '缺失'}`,
        `推荐动作=${decision.recommended_option?.title ?? '缺失'}`
      ],
      real_user_feedback: '建议必须贴合当前关系阶段，不能像群发话术，也不能跳过已有信任水平。',
      optimization_hint: '展示关系阶段、信任度和为什么不建议强推进。'
    },
    {
      check_id: 'event_evidence',
      status: checkStatus(quality.raw_event_count >= 10 && (importSummary?.semantic_coverage ?? 1) >= 0.7),
      evidence: [
        `原始事件=${quality.raw_event_count}`,
        `语义覆盖率=${importSummary?.semantic_coverage ?? 'fixture'}`
      ],
      real_user_feedback: '如果事件太少或线索覆盖不足，真实用户会怀疑建议只是凭空猜测。',
      optimization_hint: '低于门槛时要求继续补聊天记录或网页线索。'
    },
    {
      check_id: 'decision_realism',
      status: checkStatus(decision.agent_opinions.length === 9 && decision.recommended_option?.weighted_score >= 0.6),
      evidence: [
        `Agent意见数=${decision.agent_opinions.length}`,
        `推荐分=${decision.recommended_option?.weighted_score ?? '缺失'}`
      ],
      real_user_feedback: '真实用户更需要可执行的下一步，而不是抽象判断；推荐动作要低成本、低风险、能马上确认。',
      optimization_hint: '默认给一个低承诺行动，并展示备选动作和证据来源。'
    },
    {
      check_id: 'trigger_safety',
      status: checkStatus(triggerPlan.status === 'waiting_confirmation' && quality.real_execution_allowed === false),
      evidence: [
        `触发状态=${triggerPlan.status}`,
        `真实执行允许=${quality.real_execution_allowed}`
      ],
      real_user_feedback: '应用内可以帮用户准备动作，但在测试阶段不能替用户真实发送或确认预约。',
      optimization_hint: '保留 dry-run 预览、确认闸门和发送阻断。'
    },
    {
      check_id: 'feedback_observability',
      status: checkStatus(Boolean(feedback?.feedback_id) && quality.writeback_complete && quality.index_rebuild_complete),
      evidence: [
        `反馈=${feedback?.feedback_id ?? '缺失'}`,
        `回写=${quality.writeback_complete}`,
        `索引=${quality.index_rebuild_complete}`
      ],
      real_user_feedback: '用户执行后必须能看到结果被记录，否则系统不会越用越准。',
      optimization_hint: '把反馈入口压缩为执行、回复、推进度、评分四项。'
    }
  ];
  const passCount = checks.filter((check) => check.status === 'pass').length;
  const realismScore = Number((passCount / checks.length).toFixed(4));
  const needsAttention = checks.filter((check) => check.status !== 'pass');
  const conclusion = realismScore >= 0.85
    ? 'usable_with_minor_optimization'
    : realismScore >= 0.67
      ? 'usable_after_targeted_adjustment'
      : 'not_ready_for_real_user_trial';

  return {
    review_id: createRuntimeId('real_user_review'),
    source,
    reviewer_persona: '真实B2B跟进用户',
    total_goal: '让系统从用户目标、人物关系和事件证据出发，给出可执行、可回写、可审计的社交辅助建议。',
    app_scene: '客户跟进、预约评审、风险澄清和低承诺推进',
    realism_score: realismScore,
    conclusion,
    checks,
    feedback_summary: needsAttention.length
      ? needsAttention.map((check) => check.real_user_feedback)
      : [
          '闭环已经能支撑一次真实用户试点，但应用内需要继续降低填写成本，并把证据、确认闸门和下一步动作放在同一屏。'
        ],
    optimization_focus: needsAttention.length
      ? needsAttention.map((check) => check.optimization_hint)
      : [
          '把执行页优化成目标、证据、推荐动作、确认闸门、反馈入口五段式。',
          '默认展示低承诺跟进动作，保留用户手动确认。'
        ]
  };
}

function buildOptimizationResult({ review, decision, triggerPlan, feedback }) {
  const primaryAction = decision.recommended_option?.title ?? '生成低承诺跟进动作';
  const feedbackFields = ['executed', 'reply_received', 'goal_progress', 'user_rating'];
  const messageDraft = triggerPlan.message_draft ?? decision.recommended_option?.message_draft ?? null;
  return {
    optimization_id: createRuntimeId('mvp_optimization'),
    based_on_review_id: review.review_id,
    applied_to: 'runtime_output',
    optimized_user_next_step: `先在应用内确认“${primaryAction}”的证据和语气，再进入 ${triggerPlan.status === 'waiting_confirmation' ? '人工确认' : '人工复核'}。`,
    optimized_message_draft: messageDraft,
    manual_execution_checklist: triggerPlan.manual_execution_checklist ?? [],
    applied_changes: [
      {
        change_id: 'show_evidence_before_action',
        status: 'applied_to_output',
        reason: '真实用户需要先看到事件证据和关系依据，才会信任建议。'
      },
      {
        change_id: 'keep_confirmation_gate',
        status: 'applied_to_output',
        reason: '触发计划继续保持 waiting_confirmation 和 dry-run 阻断，符合测试账号环境。'
      },
      {
        change_id: 'compress_feedback_form',
        status: 'applied_to_output',
        reason: `反馈入口按 ${feedbackFields.join(', ')} 四项收敛，降低真实用户填写负担。`
      },
      {
        change_id: 'writeback_after_feedback_only',
        status: 'applied_to_output',
        reason: `反馈 ${feedback?.feedback_id ?? '缺失'} 之后才生成回写事件，避免未来信息进入决策。`
      }
    ],
    next_iteration_inputs: [
      '真实用户确认的目标和对象',
      '10 到 30 条真实互动记录',
      '执行后四项反馈',
      '用户对推荐动作是否自然的主观评分'
    ],
    stop_or_adjust_when: [
      '真实用户认为推荐动作不符合关系阶段。',
      '事件证据不足导致用户不信任建议。',
      '确认闸门或反馈入口让用户完成一次闭环超过 1 小时。'
    ]
  };
}

function isRealUserReviewComplete(review) {
  return Boolean(
    review?.total_goal
    && review?.app_scene
    && review?.reviewer_persona
    && Number(review?.realism_score ?? 0) >= 0.67
    && Array.isArray(review?.checks)
    && review.checks.length >= 6
    && review.checks.every((check) => check.check_id && check.status && check.real_user_feedback && check.optimization_hint)
    && Array.isArray(review?.feedback_summary)
    && review.feedback_summary.length > 0
    && Array.isArray(review?.optimization_focus)
    && review.optimization_focus.length > 0
  );
}

function isOptimizationResultComplete(optimization) {
  return Boolean(
    optimization?.optimization_id
    && optimization?.based_on_review_id
    && optimization?.optimized_user_next_step
    && Array.isArray(optimization?.applied_changes)
    && optimization.applied_changes.length >= 4
    && Array.isArray(optimization?.next_iteration_inputs)
    && optimization.next_iteration_inputs.length >= 4
    && Array.isArray(optimization?.stop_or_adjust_when)
    && optimization.stop_or_adjust_when.length >= 3
  );
}

function summarizeRealUserReview(review) {
  return {
    review_id: review.review_id,
    reviewer_persona: review.reviewer_persona,
    total_goal: review.total_goal,
    app_scene: review.app_scene,
    realism_score: review.realism_score,
    conclusion: review.conclusion,
    checks: review.checks.map((check) => ({
      check_id: check.check_id,
      status: check.status,
      evidence: check.evidence,
      real_user_feedback: check.real_user_feedback,
      optimization_hint: check.optimization_hint
    })),
    feedback_summary: review.feedback_summary,
    optimization_focus: review.optimization_focus
  };
}

function attachReviewQuality({ quality, review, optimization }) {
  return {
    ...quality,
    real_user_review_complete: isRealUserReviewComplete(review),
    real_user_realism_score: review?.realism_score ?? 0,
    optimization_result_complete: isOptimizationResultComplete(optimization)
  };
}

const USER_FEEDBACK_SCORE_LABELS = {
  goal_matches_user_intent: '目标是否符合用户真实意图',
  relationship_context_is_correct: '人物关系判断是否正确',
  recommendation_feels_natural: '推荐动作是否自然',
  evidence_is_sufficient: '证据是否足够',
  action_is_executable: '行动是否可执行',
  feedback_form_is_lightweight: '反馈入口是否轻量'
};

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(5, Math.max(1, Math.round(number)));
}

function average(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  if (!numbers.length) return null;
  return Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(4));
}

function uniqueText(items) {
  return [...new Set((items ?? []).filter(Boolean).map(String))];
}

export function normalizeMvpUserFeedback(feedback = {}) {
  if (!feedback || typeof feedback !== 'object' || Array.isArray(feedback)) {
    throw new Error('normalizeMvpUserFeedback requires a feedback object');
  }

  const scores = {};
  const rawScores = feedback.scores ?? {};
  for (const field of Object.keys(USER_FEEDBACK_SCORE_LABELS)) {
    const score = clampScore(rawScores[field]);
    if (score !== null) scores[field] = score;
  }

  const flags = Array.isArray(feedback.flags)
    ? uniqueText(feedback.flags)
    : [];
  const scoreAverage = average(Object.values(scores));
  const lowScoreFields = Object.entries(scores)
    .filter(([, score]) => score <= 3)
    .map(([field, score]) => ({
      field,
      label: USER_FEEDBACK_SCORE_LABELS[field],
      score
    }));

  return {
    schema_version: feedback.schema_version ?? '0.1.0',
    feedback_id: feedback.feedback_id ?? createRuntimeId('mvp_user_feedback'),
    source_run_id: feedback.source_run_id ?? null,
    reviewer_role: feedback.reviewer_role ?? 'pilot_user',
    reviewed_at: feedback.reviewed_at ?? nowIso(),
    scores,
    score_average: scoreAverage,
    low_score_fields: lowScoreFields,
    flags,
    stop_signal: Boolean(feedback.stop_signal),
    comments: {
      most_useful: feedback.comments?.most_useful ?? '',
      least_realistic: feedback.comments?.least_realistic ?? '',
      suggested_change: feedback.comments?.suggested_change ?? ''
    }
  };
}

function feedbackGateDecision(normalized) {
  const scores = normalized.scores;
  const hardStop = normalized.stop_signal
    || scores.goal_matches_user_intent <= 2
    || scores.action_is_executable <= 2
    || normalized.flags.includes('wrong_relationship_stage');

  if (hardStop) return 'stop_or_adjust';
  if (normalized.low_score_fields.length || (normalized.score_average !== null && normalized.score_average < 4)) {
    return 'adjust';
  }
  return 'continue';
}

function buildFeedbackAdjustments(normalized) {
  const lowFields = new Set(normalized.low_score_fields.map((item) => item.field));
  const flags = new Set(normalized.flags);
  const adjustments = [];

  if (lowFields.has('goal_matches_user_intent')) {
    adjustments.push('先要求用户重新确认目标、对象和最低成功标准，再生成下一步动作。');
  }
  if (lowFields.has('relationship_context_is_correct') || flags.has('wrong_relationship_stage')) {
    adjustments.push('回到人物关系节点校准关系阶段、信任水平和行为边界。');
  }
  if (lowFields.has('recommendation_feels_natural') || flags.has('message_too_generic')) {
    adjustments.push('把推荐动作改成更低承诺、更贴近关系阶段的具体表达。');
  }
  if (lowFields.has('evidence_is_sufficient') || flags.has('evidence_missing')) {
    adjustments.push('补充事件证据、来源和反证说明；证据不足时停止扩大样本。');
  }
  if (lowFields.has('action_is_executable') || flags.has('platform_flow_unclear')) {
    adjustments.push('把触发计划拆成可人工确认的最小动作，并保留 dry-run 预览。');
  }
  if (lowFields.has('feedback_form_is_lightweight') || flags.has('feedback_too_heavy')) {
    adjustments.push('进一步压缩反馈入口，只保留执行、回复、推进度和一句备注。');
  }

  return adjustments.length
    ? adjustments
    : ['保留当前闭环结构，下一轮用更多真实样本校准推荐语气和证据排序。'];
}

function buildMvpUserFeedbackAnalysis({ result, userFeedback }) {
  const normalized = normalizeMvpUserFeedback(userFeedback);
  const gateDecision = feedbackGateDecision(normalized);
  const adjustments = buildFeedbackAdjustments(normalized);
  const messageDraft = result.message_draft ?? result.optimization_result?.optimized_message_draft ?? null;
  const manualExecutionChecklist = result.manual_execution_checklist
    ?? result.optimization_result?.manual_execution_checklist
    ?? [];
  const lowScoreEvidence = normalized.low_score_fields.map(
    (item) => `${item.label}=${item.score}/5`
  );

  return {
    normalized_feedback: normalized,
    user_test_review: {
      review_id: createRuntimeId('user_test_review'),
      feedback_id: normalized.feedback_id,
      source_run_id: normalized.source_run_id ?? result?.run_id ?? null,
      reviewer_role: normalized.reviewer_role,
      reviewed_at: normalized.reviewed_at,
      average_score: normalized.score_average,
      gate_decision: gateDecision,
      low_score_fields: normalized.low_score_fields,
      flags: normalized.flags,
      evidence: [
        ...lowScoreEvidence,
        normalized.flags.length ? `flags=${normalized.flags.join(',')}` : 'flags=none',
        normalized.stop_signal ? 'stop_signal=true' : 'stop_signal=false'
      ],
      comments: normalized.comments,
      conclusion: gateDecision === 'continue'
        ? '用户专项测试允许继续扩大样本。'
        : gateDecision === 'adjust'
          ? '用户专项测试要求先小幅修正后再继续。'
          : '用户专项测试触发停止或调整。'
    },
    second_pass_optimization: {
      optimization_id: createRuntimeId('second_pass_optimization'),
      based_on_feedback_id: normalized.feedback_id,
      based_on_run_id: result?.run_id ?? null,
      gate_decision: gateDecision,
      optimized_message_draft: messageDraft
        ? {
          ...messageDraft,
          status: gateDecision === 'continue' ? 'ready_for_calibration' : 'ready_for_user_confirmation'
        }
        : null,
      manual_execution_checklist: manualExecutionChecklist,
      recommended_adjustments: adjustments,
      continue_when: [
        '平均评分达到 4 分及以上，且没有 2 分以下关键项。',
        '用户确认推荐动作自然、证据足够、行动可执行。'
      ],
      stop_or_adjust_when: [
        '目标匹配或行动可执行性低于 3 分。',
        '用户标记关系阶段错误、证据缺失或平台流程不可执行。',
        '用户明确给出 stop_signal。'
      ]
    }
  };
}

function applyMvpUserFeedbackAnalysis(result, analysis) {
  const optimization = result.optimization_result ?? {};
  const userTestReview = analysis.user_test_review;
  const secondPass = analysis.second_pass_optimization;
  const adjustmentChanges = secondPass.recommended_adjustments.map((adjustment, index) => ({
    change_id: `user_feedback_adjustment_${index + 1}`,
    status: secondPass.gate_decision === 'continue' ? 'recorded_for_calibration' : 'proposed_for_next_iteration',
    reason: adjustment
  }));

  const optimizedUserNextStep = secondPass.gate_decision === 'continue'
    ? optimization.optimized_user_next_step
    : `先处理专项测试反馈：${secondPass.recommended_adjustments[0]}`;

  return {
    ...result,
    user_test_review: userTestReview,
    second_pass_optimization: secondPass,
    optimization_result: {
      ...optimization,
      user_feedback_applied: true,
      user_feedback_id: userTestReview.feedback_id,
      second_pass_optimization_id: secondPass.optimization_id,
      optimized_user_next_step: optimizedUserNextStep,
      optimized_message_draft: secondPass.optimized_message_draft ?? optimization.optimized_message_draft ?? null,
      manual_execution_checklist: secondPass.manual_execution_checklist ?? optimization.manual_execution_checklist ?? [],
      applied_changes: [
        ...(optimization.applied_changes ?? []),
        ...adjustmentChanges
      ],
      next_iteration_inputs: uniqueText([
        ...(optimization.next_iteration_inputs ?? []),
        '用户专项测试反馈评分、标记和一句备注'
      ]),
      stop_or_adjust_when: uniqueText([
        ...(optimization.stop_or_adjust_when ?? []),
        ...secondPass.stop_or_adjust_when
      ])
    }
  };
}

export function applyMvpUserFeedback({ result, userFeedback } = {}) {
  if (!result) throw new Error('applyMvpUserFeedback requires result');
  const analysis = buildMvpUserFeedbackAnalysis({ result, userFeedback });
  return applyMvpUserFeedbackAnalysis(result, analysis);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : 'n/a';
}

function yesNo(value) {
  return value ? '是' : '否';
}

function renderList(items, className = '') {
  const values = (items ?? []).filter(Boolean);
  if (!values.length) return '<p class="muted">暂无</p>';
  return `<ul class="${className}">${values.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderMetric(label, value, tone = 'neutral') {
  return `<div class="metric ${tone}">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
  </div>`;
}

function renderChecks(checks) {
  return (checks ?? []).map((check) => `<article class="check ${check.status === 'pass' ? 'pass' : 'attention'}">
    <div class="check-head">
      <strong>${escapeHtml(check.check_id)}</strong>
      <span>${escapeHtml(check.status)}</span>
    </div>
    ${renderList(check.evidence, 'compact')}
    <p>${escapeHtml(check.real_user_feedback)}</p>
    <p class="muted">${escapeHtml(check.optimization_hint)}</p>
  </article>`).join('');
}

function renderChanges(changes) {
  return (changes ?? []).map((change) => `<tr>
    <td>${escapeHtml(change.change_id)}</td>
    <td>${escapeHtml(change.status)}</td>
    <td>${escapeHtml(change.reason)}</td>
  </tr>`).join('');
}

function renderManualChecklist(items) {
  const values = (items ?? []).filter(Boolean);
  if (!values.length) return '<p class="muted">暂无</p>';
  return `<ol class="manual-list">${values.map((item) => `<li>
    <strong>${escapeHtml(item.label ?? item.item_id)}</strong>
    <p>${escapeHtml(item.check ?? '')}</p>
    <span class="muted">${escapeHtml(item.status ?? 'pending')}</span>
  </li>`).join('')}</ol>`;
}

function reportTitle(result) {
  return result.import_id ?? result.loop_id ?? result.run_id ?? 'mvp-loop';
}

export function renderMvpRunReport(result) {
  const review = result.real_user_review ?? {};
  const userTestReview = result.user_test_review ?? null;
  const secondPass = result.second_pass_optimization ?? null;
  const optimization = result.optimization_result ?? {};
  const quality = result.quality ?? {};
  const decision = result.decision ?? {};
  const triggerPlan = result.trigger_plan ?? {};
  const automation = result.automation_preview ?? {};
  const messageDraft = result.message_draft
    ?? optimization.optimized_message_draft
    ?? decision.recommended_option?.message_draft
    ?? null;
  const manualChecklist = result.manual_execution_checklist
    ?? optimization.manual_execution_checklist
    ?? triggerPlan.manual_execution_checklist
    ?? [];
  const importSummary = result.import_summary ?? null;
  const intakeReadiness = result.intake_readiness ?? null;
  const snapshot = result.storage_snapshot ?? {};
  const rawEvents = snapshot.raw_events ?? [];
  const semanticEvents = snapshot.semantic_events ?? [];
  const feedbackRecords = snapshot.feedback_records ?? [];
  const auditRecords = snapshot.audit_records ?? [];
  const flowNodes = [
    ['Intake Gate', !quality.intake_readiness_required || quality.intake_readiness_complete],
    ['用户目标', true],
    ['人物关系', true],
    ['事件记录', quality.raw_event_count > 0],
    ['决策建议', quality.agent_opinion_complete],
    ['触发计划', quality.trigger_ready_for_review],
    ['反馈', quality.feedback_complete],
    ['回写', quality.writeback_complete],
    ['索引', quality.index_rebuild_complete],
    ['审计', quality.audit_complete]
  ];

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MVP闭环报告 - ${escapeHtml(reportTitle(result))}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --ink: #17202a;
      --muted: #607080;
      --line: #d9e0e7;
      --accent: #226f54;
      --warn: #9b5b00;
      --bad: #a33b3b;
      --soft: #edf4f0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 14px/1.55 "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    }
    header, main { max-width: 1280px; margin: 0 auto; }
    header {
      padding: 24px 24px 12px;
    }
    h1, h2, h3, p { margin-top: 0; }
    h1 { font-size: 24px; margin-bottom: 6px; letter-spacing: 0; }
    h2 { font-size: 16px; margin-bottom: 12px; }
    h3 { font-size: 14px; margin-bottom: 8px; }
    main {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.8fr);
      gap: 16px;
      padding: 0 24px 28px;
    }
    section, article.panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 1px 2px rgba(20, 35, 50, 0.04);
    }
    .stack { display: grid; gap: 16px; }
    .muted { color: var(--muted); }
    .flow {
      display: grid;
      grid-template-columns: repeat(9, minmax(76px, 1fr));
      gap: 8px;
    }
    .node {
      min-height: 58px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px 8px;
      background: #fafbfc;
      display: grid;
      align-content: center;
      text-align: center;
      font-weight: 600;
    }
    .node.pass { background: var(--soft); border-color: #b6d8c7; color: #164735; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      background: #fbfcfd;
      min-height: 68px;
    }
    .metric span { display: block; color: var(--muted); font-size: 12px; }
    .metric strong { display: block; margin-top: 4px; font-size: 20px; }
    .metric.good strong { color: var(--accent); }
    .metric.warn strong { color: var(--warn); }
    .two-col {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 12px;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      border-top: 1px solid var(--line);
      padding: 9px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { color: var(--muted); font-weight: 600; }
    .checks {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .check {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px;
      background: #fbfcfd;
    }
    .check.pass { border-color: #b6d8c7; }
    .check.attention { border-color: #e0b16a; }
    .check-head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }
    .check-head span {
      color: var(--accent);
      font-weight: 600;
    }
    .feedback-grid {
      display: grid;
      grid-template-columns: minmax(0, 0.7fr) minmax(0, 1fr);
      gap: 12px;
    }
    .feedback-grid article {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px;
      background: #fbfcfd;
    }
    .draft-box {
      border: 1px solid #b6d8c7;
      border-radius: 6px;
      background: #fbfffd;
      padding: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 15px;
    }
    .manual-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      padding-left: 0;
      list-style-position: inside;
    }
    .manual-list li {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fbfcfd;
      padding: 10px;
      min-height: 96px;
    }
    .manual-list p { margin-bottom: 6px; }
    ul { margin: 0; padding-left: 18px; }
    .compact { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      border-radius: 999px;
      border: 1px solid #b6d8c7;
      background: var(--soft);
      color: #164735;
      padding: 2px 9px;
      font-weight: 600;
      margin-right: 6px;
      margin-bottom: 6px;
    }
    .side-summary {
      position: sticky;
      top: 12px;
      align-self: start;
    }
    @media (max-width: 940px) {
      main { grid-template-columns: 1fr; padding: 0 14px 20px; }
      header { padding: 18px 14px 10px; }
      .flow { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .metrics, .checks, .two-col, .feedback-grid, .manual-list { grid-template-columns: 1fr; }
      .side-summary { position: static; }
    }
  </style>
</head>
<body data-report-contract="mvp_run_report.v1" data-user-feedback-contract="${userTestReview ? 'mvp_user_feedback.v1' : 'none'}">
  <header>
    <h1>MVP闭环报告</h1>
    <p class="muted">${escapeHtml(reportTitle(result))} · ${escapeHtml(result.workflow)} · ${escapeHtml(result.run_id)}</p>
  </header>
  <main>
    <div class="stack">
      <section>
        <h2>闭环流程</h2>
        <div class="flow">
          ${flowNodes.map(([label, ok]) => `<div class="node ${ok ? 'pass' : ''}">${escapeHtml(label)}</div>`).join('')}
        </div>
      </section>

      <section>
        <h2>运行指标</h2>
        <div class="metrics">
          ${renderMetric('原始事件', quality.raw_event_count ?? result.raw_events ?? 0, 'good')}
          ${renderMetric('语义事件', quality.semantic_event_count ?? result.semantic_events ?? 0, 'good')}
          ${renderMetric('反馈记录', quality.feedback_count ?? result.feedback_records ?? 0, 'good')}
          ${renderMetric('真实执行阻断', yesNo(quality.real_execution_allowed === false), 'good')}
          ${renderMetric('Intake gate', intakeReadiness ? yesNo(quality.intake_readiness_complete) : 'not required', quality.intake_readiness_complete ? 'good' : 'warn')}
          ${renderMetric('Platform dry-run', yesNo(quality.platform_dry_run_connector_complete), quality.platform_dry_run_connector_complete ? 'good' : 'warn')}
          ${renderMetric('回写完成', yesNo(quality.writeback_complete), quality.writeback_complete ? 'good' : 'warn')}
          ${renderMetric('索引完成', yesNo(quality.index_rebuild_complete), quality.index_rebuild_complete ? 'good' : 'warn')}
          ${renderMetric('审计完成', yesNo(quality.audit_complete), quality.audit_complete ? 'good' : 'warn')}
          ${renderMetric('场景现实分', percent(review.realism_score), 'good')}
        </div>
      </section>

      <section>
        <h2>目标与建议</h2>
        <div class="two-col">
          <article class="panel">
            <h3>推荐动作</h3>
            <p><strong>${escapeHtml(decision.recommended_option?.title ?? '暂无推荐')}</strong></p>
            <p class="muted">${escapeHtml(decision.recommended_option?.description ?? '')}</p>
            <p>${renderMetric('推荐分', decision.recommended_option?.weighted_score ?? 'n/a', 'good')}</p>
          </article>
          <article class="panel">
            <h3>触发状态</h3>
            <p><span class="badge">${escapeHtml(triggerPlan.status ?? 'unknown')}</span><span class="badge">${escapeHtml(automation.status ?? 'dry-run')}</span></p>
            <p class="muted">确认闸门：${escapeHtml((triggerPlan.confirmation_gates ?? []).length)} · 技能步骤：${escapeHtml((triggerPlan.skill_steps ?? []).length)}</p>
          </article>
        </div>
      </section>

      <section>
        <h2>可执行草稿</h2>
        <p><span class="badge">${escapeHtml(messageDraft?.channel ?? 'wechat')}</span><span class="badge">${escapeHtml(messageDraft?.tone ?? 'low_commitment')}</span></p>
        <div class="draft-box">${escapeHtml(messageDraft?.draft ?? '暂无草稿')}</div>
        <h3>人工确认清单</h3>
        ${renderManualChecklist(manualChecklist)}
      </section>

      <section>
        <h2>真实用户视角回顾</h2>
        <p><span class="badge">${escapeHtml(review.conclusion ?? 'unknown')}</span><span class="badge">${escapeHtml(review.reviewer_persona ?? '真实用户')}</span></p>
        <p><strong>总目标：</strong>${escapeHtml(review.total_goal ?? '缺失')}</p>
        <p class="muted"><strong>应用场景：</strong>${escapeHtml(review.app_scene ?? '缺失')}</p>
        <div class="checks">${renderChecks(review.checks)}</div>
      </section>

      ${userTestReview ? `<section>
        <h2>专项测试反馈</h2>
        <div class="feedback-grid">
          <article>
            <h3>用户判断</h3>
            <p><span class="badge">${escapeHtml(userTestReview.gate_decision)}</span><span class="badge">${escapeHtml(userTestReview.reviewer_role)}</span></p>
            <p class="muted">平均分：${escapeHtml(userTestReview.average_score ?? 'n/a')} · 反馈：${escapeHtml(userTestReview.feedback_id)}</p>
            ${renderList(userTestReview.evidence)}
          </article>
          <article>
            <h3>备注</h3>
            <p><strong>有用：</strong>${escapeHtml(userTestReview.comments?.most_useful ?? '暂无')}</p>
            <p><strong>不现实：</strong>${escapeHtml(userTestReview.comments?.least_realistic ?? '暂无')}</p>
            <p><strong>建议：</strong>${escapeHtml(userTestReview.comments?.suggested_change ?? '暂无')}</p>
          </article>
        </div>
      </section>` : ''}

      ${secondPass ? `<section>
        <h2>二次优化</h2>
        <p><span class="badge">${escapeHtml(secondPass.gate_decision)}</span><span class="badge">${escapeHtml(secondPass.optimization_id)}</span></p>
        ${renderList(secondPass.recommended_adjustments)}
      </section>` : ''}

      <section>
        <h2>优化结果</h2>
        <p><strong>${escapeHtml(optimization.optimized_user_next_step ?? '暂无')}</strong></p>
        <table>
          <thead><tr><th>优化项</th><th>状态</th><th>依据</th></tr></thead>
          <tbody>${renderChanges(optimization.applied_changes)}</tbody>
        </table>
      </section>
    </div>

    <aside class="stack side-summary">
      <section>
        <h2>证据概览</h2>
        ${importSummary ? `<p class="muted">导入覆盖率：${escapeHtml(percent(importSummary.semantic_coverage))} · 样本门槛：${escapeHtml(yesNo(importSummary.ready_for_mvp_sample))}</p>` : ''}
        <p class="muted">Raw ${escapeHtml(rawEvents.length)} · Semantic ${escapeHtml(semanticEvents.length)} · Feedback ${escapeHtml(feedbackRecords.length)} · Audit ${escapeHtml(auditRecords.length)}</p>
      </section>
      <section>
        <h2>下一轮输入</h2>
        ${renderList(optimization.next_iteration_inputs)}
      </section>
      <section>
        <h2>停止或调整</h2>
        ${renderList(optimization.stop_or_adjust_when)}
      </section>
      <section>
        <h2>Agent会审</h2>
        <p>${(result.agent_opinions ?? []).map((agent) => `<span class="badge">${escapeHtml(agent)}</span>`).join('')}</p>
      </section>
    </aside>
  </main>
</body>
</html>`;
}

export function writeMvpRunReport({
  result,
  outputDir = path.join(projectRoot(), 'runtime/mvp-reports')
} = {}) {
  if (!result) throw new Error('writeMvpRunReport requires result');
  mkdirSync(outputDir, { recursive: true });
  const fileName = `${result.workflow ?? 'mvp'}_${result.run_id ?? createRuntimeId('run')}.html`;
  const filePath = path.join(outputDir, fileName);
  const html = renderMvpRunReport(result);
  writeFileSync(filePath, html, 'utf8');
  return {
    file_path: filePath,
    bytes: Buffer.byteLength(html, 'utf8'),
    contract: 'mvp_run_report.v1'
  };
}

export function runMvpLoop({
  root = projectRoot(),
  fixturePath = path.join(projectRoot(), 'examples/closed-loop-storage-mapping.json'),
  loopId = null,
  loopIndex = 0,
  dataDir = null,
  stateDir = null,
  userTestFeedback = null,
  userPreferences = {
    risk_tolerance: 'low',
    relationship_priority: 'high',
    automation_comfort: 'low',
    preferred_channels: ['wechat'],
    disliked_actions: ['strong_pressure']
  }
} = {}) {
  const fixture = readJson(fixturePath);
  const loop = selectLoop(fixture, { loopId, loopIndex });
  const notebook = new StateNotebook({
    projectRoot: root,
    stateDir: stateDir ?? path.join(root, 'runtime/state')
  });
  const runId = notebook.startRun({
    workflow: 'mvp_loop',
    loop_id: loop.loop_id,
    initial_goal: loop.initial_goal
  });
  const mvpDataDir = dataDir ?? path.join(root, 'runtime/mvp-runs', runId, 'data');
  mkdirSync(mvpDataDir, { recursive: true });

  try {
    const storage = initializeStorage({ root, dataDir: mvpDataDir });
    const goalInput = buildGoalInput(loop);
    const writebackEventId = loop.docs10_step_mapping.step_10_writeback_event;
    const initialSemanticEvents = loop.semantic_events.filter((event) => event.event_id !== writebackEventId);
    const socialGraph = buildSocialGraph(loop, initialSemanticEvents);

    notebook.enterNode(runId, 'user_goal');
    completeNode(notebook, runId, 'user_goal', {
      initial_goal: goalInput.initial_goal,
      primary_person_id: goalInput.primary_person_id
    });

    notebook.enterNode(runId, 'relationship_context');
    upsertPeople(storage, loop.people, { actor: runId });
    upsertRelationships(storage, loop.relationships, { actor: runId });
    completeNode(notebook, runId, 'relationship_context', {
      people: loop.people.length,
      relationships: loop.relationships.length
    });

    notebook.enterNode(runId, 'event_recording');
    for (const rawEvent of loop.raw_events) {
      appendRawEvent(storage, rawEvent, { actor: runId });
    }
    for (const semanticEvent of initialSemanticEvents) {
      appendSemanticEvent(storage, semanticEvent, { actor: runId });
    }
    completeNode(notebook, runId, 'event_recording', {
      raw_events: loop.raw_events.length,
      initial_semantic_events: initialSemanticEvents.length
    });

    notebook.enterNode(runId, 'decision_recommendation');
    const decision = buildDecisionRecommendation({
      goalInput,
      socialGraph,
      rawEvents: loop.raw_events,
      userPreferences
    });
    completeNode(notebook, runId, 'decision_recommendation', {
      decision_id: decision.decision_id,
      recommended_option: decision.recommended_option.option_id,
      agent_opinions: decision.agent_opinions.length
    });

    notebook.enterNode(runId, 'trigger_plan');
    const triggerPlan = buildTriggerPlan({
      trigger_type: loop.trigger.trigger_type,
      goal_input: goalInput,
      social_graph: socialGraph,
      user_preferences: userPreferences,
      allow_platform_send: true,
      notification_preferences: {
        channels: ['in_app'],
        notify_on: ['appointment_confirmed', 'followup_due']
      }
    });
    triggerPlan.decision_id = decision.decision_id;
    const automationPreview = buildAutomationPreview({
      triggerPlan,
      platform: 'wechat_web_test',
      target: {
        display_name: loop.people[0]?.display_name ?? null,
        platform_handle: `${loop.loop_id}_test_contact`,
        channel: goalInput.preferred_channel
      },
      messageDraft: triggerPlan.message_draft?.draft ?? triggerPlan.recommended_option?.description,
      operator: runId
    });
    const automationPreviewTrial = runAutomationPreviewTrial({
      automationPreview,
      environment: {
        test_page_available: true,
        connector_authorized: false,
        user_confirmed_gate_ids: []
      },
      operator: runId
    });
    const automationPreviewTestPageHtml = renderAutomationPreviewTestPage({
      automationPreview,
      previewTrial: automationPreviewTrial
    });
    const platformDryRunConnector = buildPlatformDryRunConnector({
      platform: automationPreview.platform
    });
    const platformDryRunConnectorCheck = inspectPlatformDryRunConnector({
      connector: platformDryRunConnector,
      automationPreview,
      pageHtml: automationPreviewTestPageHtml,
      operator: runId
    });
    const automationPreviewTestPage = {
      bytes: Buffer.byteLength(automationPreviewTestPageHtml, 'utf8'),
      inspection: inspectAutomationPreviewTestPage(automationPreviewTestPageHtml),
      platform_dry_run_connector: platformDryRunConnector,
      platform_dry_run_connector_check: platformDryRunConnectorCheck
    };
    completeNode(notebook, runId, 'trigger_plan', {
      trigger_id: triggerPlan.trigger_id,
      skill_steps: triggerPlan.skill_steps.length,
      confirmation_gates: triggerPlan.confirmation_gates.length,
      automation_preview_id: automationPreview.preview_id,
      automation_trial_id: automationPreviewTrial.trial_id,
      automation_preview_reached: automationPreviewTrial.preview_reached,
      platform_dry_run_connector_check: platformDryRunConnectorCheck.status,
      real_execution_allowed: automationPreviewTrial.real_execution_allowed
    });

    notebook.enterNode(runId, 'feedback');
    const feedback = normalizeRuntimeFeedback(loop.feedback, {
      decisionId: decision.decision_id,
      triggerId: triggerPlan.trigger_id
    });
    appendFeedbackRecord(storage, feedback, { actor: runId });
    completeNode(notebook, runId, 'feedback', {
      feedback_id: feedback.feedback_id,
      goal_progress: feedback.goal_progress,
      reply_received: feedback.reply_received
    });

    notebook.enterNode(runId, 'writeback');
    const writebackEvents = loop.semantic_events.filter((event) => event.event_id === writebackEventId);
    for (const event of writebackEvents) {
      appendSemanticEvent(storage, applyRuntimeIds(event, {
        decisionId: decision.decision_id,
        triggerId: triggerPlan.trigger_id,
        feedbackId: feedback.feedback_id
      }), { actor: runId });
    }
    completeNode(notebook, runId, 'writeback', {
      writeback_events: writebackEvents.length,
      writeback_event_ids: writebackEvents.map((event) => event.event_id)
    });

    notebook.enterNode(runId, 'index_rebuild');
    const indexes = rebuildEventIndexes(storage, { actor: runId });
    completeNode(notebook, runId, 'index_rebuild', {
      person_index_keys: Object.keys(indexes.personIndex.entries).length,
      tag_index_keys: Object.keys(indexes.tagIndex.entries).length
    });

    notebook.enterNode(runId, 'audit');
    const snapshot = loadStorageSnapshot(storage);
    completeNode(notebook, runId, 'audit', {
      audit_records: snapshot.audit_records.length,
      semantic_events: snapshot.semantic_events.length,
      feedback_records: snapshot.feedback_records.length
    });

    const quality = summarizeLoopQuality({
      loop,
      decision,
      triggerPlan,
      automationPreviewTrial,
      automationPreviewTestPage,
      snapshot,
      writebackEvents
    });
    const realUserReview = buildRealUserScenarioReview({
      source: 'fixture_loop',
      goalInput,
      decision,
      triggerPlan,
      feedback,
      quality
    });
    const optimizationResult = buildOptimizationResult({
      review: realUserReview,
      decision,
      triggerPlan,
      feedback
    });
    const reviewedQuality = attachReviewQuality({
      quality,
      review: realUserReview,
      optimization: optimizationResult
    });
    const outputSummary = {
      workflow: 'mvp_loop',
      loop_id: loop.loop_id,
      run_id: runId,
      data_dir: mvpDataDir,
      decision_id: decision.decision_id,
      trigger_id: triggerPlan.trigger_id,
      feedback_id: feedback.feedback_id,
      automation_preview_id: automationPreview.preview_id,
      automation_trial_id: automationPreviewTrial.trial_id,
      platform_dry_run_connector_check_id: platformDryRunConnectorCheck.check_id,
      platform_dry_run_connector_status: platformDryRunConnectorCheck.status,
      message_draft: triggerPlan.message_draft,
      manual_execution_checklist: triggerPlan.manual_execution_checklist,
      agent_opinions: decision.agent_opinions.map((opinion) => opinion.agent_id),
      raw_events: snapshot.raw_events.length,
      semantic_events: snapshot.semantic_events.length,
      feedback_records: snapshot.feedback_records.length,
      audit_records: snapshot.audit_records.length,
      real_user_review: summarizeRealUserReview(realUserReview),
      optimization_result: {
        optimization_id: optimizationResult.optimization_id,
        optimized_user_next_step: optimizationResult.optimized_user_next_step,
        optimized_message_draft: optimizationResult.optimized_message_draft,
        manual_execution_checklist: optimizationResult.manual_execution_checklist,
        applied_changes: optimizationResult.applied_changes,
        next_iteration_inputs: optimizationResult.next_iteration_inputs,
        stop_or_adjust_when: optimizationResult.stop_or_adjust_when
      },
      quality: reviewedQuality
    };
    const feedbackAnalysis = userTestFeedback
      ? buildMvpUserFeedbackAnalysis({ result: outputSummary, userFeedback: userTestFeedback })
      : null;
    const finalOutputSummary = feedbackAnalysis
      ? applyMvpUserFeedbackAnalysis(outputSummary, feedbackAnalysis)
      : outputSummary;
    notebook.completeRun(runId, finalOutputSummary);

    const fullOutput = {
      ...outputSummary,
      decision,
      trigger_plan: triggerPlan,
      automation_preview: automationPreview,
      automation_preview_trial: automationPreviewTrial,
      automation_preview_test_page: automationPreviewTestPage,
      real_user_review: realUserReview,
      optimization_result: optimizationResult,
      storage_snapshot: snapshot
    };
    return feedbackAnalysis
      ? applyMvpUserFeedbackAnalysis(fullOutput, feedbackAnalysis)
      : fullOutput;
  } catch (error) {
    notebook.failRun(runId, error);
    throw error;
  }
}

export function runMvpLoopFromPilotImport({
  root = projectRoot(),
  importPath = path.join(projectRoot(), 'examples/pilot-import-batch.sample.json'),
  importBatch = null,
  dataDir = null,
  stateDir = null,
  userTestFeedback = null,
  userPreferences = {
    risk_tolerance: 'low',
    relationship_priority: 'high',
    automation_comfort: 'low',
    preferred_channels: ['wechat'],
    disliked_actions: ['strong_pressure']
  }
} = {}) {
  const sourceBatch = importBatch ?? readJson(importPath);
  const normalizedImport = normalizePilotImportBatch(sourceBatch);
  const intakeReadiness = analyzePilotIntakeReadiness(normalizedImport, {
    inputPath: importBatch ? null : importPath
  });
  const intakeReadinessSummary = summarizeIntakeReadiness(intakeReadiness);
  const notebook = new StateNotebook({
    projectRoot: root,
    stateDir: stateDir ?? path.join(root, 'runtime/state')
  });
  const runId = notebook.startRun({
    workflow: 'mvp_loop_from_pilot_import',
    import_id: normalizedImport.import_id,
    initial_goal: normalizedImport.goal?.initial_goal ?? null,
    intake_gate_decision: intakeReadiness.gate_decision
  });
  const mvpDataDir = dataDir ?? path.join(root, 'runtime/mvp-runs', runId, 'data');
  mkdirSync(mvpDataDir, { recursive: true });

  try {
    if (!intakeReadiness.ready_for_closed_loop_mvp) {
      throw new Error(`Pilot intake readiness failed for full MVP loop: ${intakeReadiness.gate_decision}; required_failures=${intakeReadiness.required_failures.join(',') || 'none'}`);
    }
    const storage = initializeStorage({ root, dataDir: mvpDataDir });
    const goalInput = buildGoalInputFromPilotImport(normalizedImport);
    const socialGraph = buildSocialGraphFromPilotImport(normalizedImport);
    const loopForQuality = {
      loop_id: normalizedImport.import_id,
      people: normalizedImport.people
    };

    notebook.enterNode(runId, 'user_goal');
    completeNode(notebook, runId, 'user_goal', {
      initial_goal: goalInput.initial_goal,
      primary_person_id: goalInput.primary_person_id,
      import_id: normalizedImport.import_id
    });

    notebook.enterNode(runId, 'relationship_context');
    upsertPeople(storage, normalizedImport.people, { actor: runId });
    upsertRelationships(storage, normalizedImport.relationships, { actor: runId });
    completeNode(notebook, runId, 'relationship_context', {
      people: normalizedImport.people.length,
      relationships: normalizedImport.relationships.length
    });

    notebook.enterNode(runId, 'event_recording');
    for (const rawEvent of normalizedImport.raw_events) {
      appendRawEvent(storage, rawEvent, { actor: runId });
    }
    for (const semanticEvent of normalizedImport.semantic_events) {
      appendSemanticEvent(storage, semanticEvent, { actor: runId });
    }
    completeNode(notebook, runId, 'event_recording', {
      raw_events: normalizedImport.raw_events.length,
      semantic_events: normalizedImport.semantic_events.length,
      semantic_coverage: normalizedImport.summary.semantic_coverage,
      ready_for_mvp_sample: normalizedImport.summary.ready_for_mvp_sample,
      intake_readiness_id: intakeReadiness.readiness_id,
      intake_gate_decision: intakeReadiness.gate_decision,
      intake_required_failures: intakeReadiness.required_failures
    });

    notebook.enterNode(runId, 'decision_recommendation');
    const decision = buildDecisionRecommendation({
      goalInput,
      socialGraph,
      rawEvents: normalizedImport.raw_events,
      userPreferences
    });
    completeNode(notebook, runId, 'decision_recommendation', {
      decision_id: decision.decision_id,
      recommended_option: decision.recommended_option.option_id,
      agent_opinions: decision.agent_opinions.length
    });

    notebook.enterNode(runId, 'trigger_plan');
    const triggerPlan = buildTriggerPlan({
      trigger_type: 'user_initiated',
      goal_input: goalInput,
      social_graph: socialGraph,
      user_preferences: userPreferences,
      allow_platform_send: true,
      notification_preferences: {
        channels: ['in_app'],
        notify_on: ['appointment_confirmed', 'followup_due']
      }
    });
    triggerPlan.decision_id = decision.decision_id;
    const primaryPerson = normalizedImport.people.find((person) => person.person_id === goalInput.primary_person_id)
      ?? normalizedImport.people[0];
    const automationPreview = buildAutomationPreview({
      triggerPlan,
      platform: 'wechat_web_test',
      target: {
        display_name: primaryPerson?.display_name ?? null,
        platform_handle: `${normalizedImport.import_id}_test_contact`,
        channel: goalInput.preferred_channel
      },
      messageDraft: triggerPlan.message_draft?.draft ?? triggerPlan.recommended_option?.description,
      operator: runId
    });
    const automationPreviewTrial = runAutomationPreviewTrial({
      automationPreview,
      environment: {
        test_page_available: true,
        connector_authorized: false,
        user_confirmed_gate_ids: []
      },
      operator: runId
    });
    const automationPreviewTestPageHtml = renderAutomationPreviewTestPage({
      automationPreview,
      previewTrial: automationPreviewTrial
    });
    const platformDryRunConnector = buildPlatformDryRunConnector({
      platform: automationPreview.platform
    });
    const platformDryRunConnectorCheck = inspectPlatformDryRunConnector({
      connector: platformDryRunConnector,
      automationPreview,
      pageHtml: automationPreviewTestPageHtml,
      operator: runId
    });
    const automationPreviewTestPage = {
      bytes: Buffer.byteLength(automationPreviewTestPageHtml, 'utf8'),
      inspection: inspectAutomationPreviewTestPage(automationPreviewTestPageHtml),
      platform_dry_run_connector: platformDryRunConnector,
      platform_dry_run_connector_check: platformDryRunConnectorCheck
    };
    completeNode(notebook, runId, 'trigger_plan', {
      trigger_id: triggerPlan.trigger_id,
      skill_steps: triggerPlan.skill_steps.length,
      confirmation_gates: triggerPlan.confirmation_gates.length,
      automation_preview_id: automationPreview.preview_id,
      automation_trial_id: automationPreviewTrial.trial_id,
      automation_preview_reached: automationPreviewTrial.preview_reached,
      platform_dry_run_connector_check: platformDryRunConnectorCheck.status,
      real_execution_allowed: automationPreviewTrial.real_execution_allowed
    });

    notebook.enterNode(runId, 'feedback');
    const feedback = normalizePilotFeedback(normalizedImport.feedback_records[0], {
      importId: normalizedImport.import_id,
      decisionId: decision.decision_id,
      triggerId: triggerPlan.trigger_id
    });
    appendFeedbackRecord(storage, feedback, { actor: runId });
    completeNode(notebook, runId, 'feedback', {
      feedback_id: feedback.feedback_id,
      goal_progress: feedback.goal_progress,
      reply_received: feedback.reply_received
    });

    notebook.enterNode(runId, 'writeback');
    const writebackEvents = [
      buildPilotWritebackEvent({
        importId: normalizedImport.import_id,
        feedback,
        decisionId: decision.decision_id,
        triggerId: triggerPlan.trigger_id
      })
    ];
    for (const event of writebackEvents) {
      appendSemanticEvent(storage, event, { actor: runId });
    }
    completeNode(notebook, runId, 'writeback', {
      writeback_events: writebackEvents.length,
      writeback_event_ids: writebackEvents.map((event) => event.event_id)
    });

    notebook.enterNode(runId, 'index_rebuild');
    const indexes = rebuildEventIndexes(storage, { actor: runId });
    completeNode(notebook, runId, 'index_rebuild', {
      person_index_keys: Object.keys(indexes.personIndex.entries).length,
      tag_index_keys: Object.keys(indexes.tagIndex.entries).length
    });

    notebook.enterNode(runId, 'audit');
    const snapshot = loadStorageSnapshot(storage);
    completeNode(notebook, runId, 'audit', {
      audit_records: snapshot.audit_records.length,
      semantic_events: snapshot.semantic_events.length,
      feedback_records: snapshot.feedback_records.length
    });

    const quality = summarizeLoopQuality({
      loop: loopForQuality,
      decision,
      triggerPlan,
      automationPreviewTrial,
      automationPreviewTestPage,
      snapshot,
      writebackEvents,
      intakeReadiness
    });
    const importQuality = {
      ...quality,
      import_ready_for_mvp_sample: normalizedImport.summary.ready_for_mvp_sample,
      import_semantic_coverage: normalizedImport.summary.semantic_coverage
    };
    const realUserReview = buildRealUserScenarioReview({
      source: 'pilot_import_loop',
      goalInput,
      decision,
      triggerPlan,
      feedback,
      quality: importQuality,
      importSummary: normalizedImport.summary
    });
    const optimizationResult = buildOptimizationResult({
      review: realUserReview,
      decision,
      triggerPlan,
      feedback
    });
    const reviewedImportQuality = attachReviewQuality({
      quality: importQuality,
      review: realUserReview,
      optimization: optimizationResult
    });
    const outputSummary = {
      workflow: 'mvp_loop_from_pilot_import',
      import_id: normalizedImport.import_id,
      loop_id: normalizedImport.import_id,
      run_id: runId,
      data_dir: mvpDataDir,
      decision_id: decision.decision_id,
      trigger_id: triggerPlan.trigger_id,
      feedback_id: feedback.feedback_id,
      automation_preview_id: automationPreview.preview_id,
      automation_trial_id: automationPreviewTrial.trial_id,
      platform_dry_run_connector_check_id: platformDryRunConnectorCheck.check_id,
      platform_dry_run_connector_status: platformDryRunConnectorCheck.status,
      message_draft: triggerPlan.message_draft,
      manual_execution_checklist: triggerPlan.manual_execution_checklist,
      agent_opinions: decision.agent_opinions.map((opinion) => opinion.agent_id),
      raw_events: snapshot.raw_events.length,
      semantic_events: snapshot.semantic_events.length,
      feedback_records: snapshot.feedback_records.length,
      audit_records: snapshot.audit_records.length,
      intake_readiness: intakeReadinessSummary,
      import_summary: normalizedImport.summary,
      real_user_review: summarizeRealUserReview(realUserReview),
      optimization_result: {
        optimization_id: optimizationResult.optimization_id,
        optimized_user_next_step: optimizationResult.optimized_user_next_step,
        optimized_message_draft: optimizationResult.optimized_message_draft,
        manual_execution_checklist: optimizationResult.manual_execution_checklist,
        applied_changes: optimizationResult.applied_changes,
        next_iteration_inputs: optimizationResult.next_iteration_inputs,
        stop_or_adjust_when: optimizationResult.stop_or_adjust_when
      },
      quality: reviewedImportQuality
    };
    const feedbackAnalysis = userTestFeedback
      ? buildMvpUserFeedbackAnalysis({ result: outputSummary, userFeedback: userTestFeedback })
      : null;
    const finalOutputSummary = feedbackAnalysis
      ? applyMvpUserFeedbackAnalysis(outputSummary, feedbackAnalysis)
      : outputSummary;
    notebook.completeRun(runId, finalOutputSummary);

    const fullOutput = {
      ...outputSummary,
      decision,
      trigger_plan: triggerPlan,
      automation_preview: automationPreview,
      automation_preview_trial: automationPreviewTrial,
      automation_preview_test_page: automationPreviewTestPage,
      intake_readiness: intakeReadiness,
      real_user_review: realUserReview,
      optimization_result: optimizationResult,
      storage_snapshot: snapshot
    };
    return feedbackAnalysis
      ? applyMvpUserFeedbackAnalysis(fullOutput, feedbackAnalysis)
      : fullOutput;
  } catch (error) {
    notebook.failRun(runId, error);
    throw error;
  }
}

export function runMvpLoops({
  root = projectRoot(),
  fixturePath = path.join(projectRoot(), 'examples/closed-loop-storage-mapping.json'),
  loopIds = null,
  dataDir = null,
  stateDir = null,
  userTestFeedback = null,
  userPreferences
} = {}) {
  const fixture = readJson(fixturePath);
  const selectedLoops = loopIds
    ? loopIds.map((loopId) => selectLoop(fixture, { loopId }))
    : fixture.closed_loops;
  const results = selectedLoops.map((loop) => runMvpLoop({
    root,
    fixturePath,
    loopId: loop.loop_id,
    dataDir: dataDir ? path.join(dataDir, loop.loop_id) : null,
    stateDir,
    userTestFeedback,
    userPreferences
  }));
  const summary = summarizeBatch(results);

  return {
    workflow: 'mvp_loop_batch',
    fixture_path: fixturePath,
    loop_ids: selectedLoops.map((loop) => loop.loop_id),
    summary,
    results
  };
}
