import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  adjustWeights,
  buildDecisionRecommendation,
  buildExpertMatrixAnalysisV2Async,
  buildPt028FinalSpecialAcceptance,
  buildPt028GuiDecisionState,
  buildPt028GuiEventStream,
  buildPt028MultiWindowFeedbackCalibration,
  buildPt028RealFeedbackConfirmationResult,
  buildPt028RealFeedbackConfirmationTemplate,
  buildPt028RealFeedbackReadiness,
  buildPt028RealFeedbackWorkpack,
  calculateFeedbackROI,
  writePt028RealFeedbackWorkpack
} from '../src/index.mjs';

const socialGraph = JSON.parse(readFileSync('examples/social-graph-snapshot.json', 'utf8'));

test('adjusts weights based on user preferences', () => {
  const weights = adjustWeights({
    risk_tolerance: 'low',
    relationship_priority: 'high'
  });

  assert.ok(weights.risk_control > 0.14);
  assert.ok(weights.relationship_fit > 0.14);
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(total - 1) < 0.01);
});

test('builds ranked decision recommendation with evidence and skills', () => {
  const decision = buildDecisionRecommendation({
    goalInput: {
      initial_goal: '推动客户进入技术评审',
      scene: 'business',
      primary_person_id: 'person_client_a',
      target_person_ids: ['person_client_a', 'person_tech_lead'],
      context_input: '客户说预算需要内部确认，客户技术负责人李工还没有参与。',
      preferred_channel: 'wechat'
    },
    socialGraph,
    userPreferences: {
      risk_tolerance: 'low',
      relationship_priority: 'high',
      automation_comfort: 'low'
    }
  });

  assert.ok(decision.ranked_options.length >= 4);
  assert.ok(decision.recommended_option.weighted_score > 0);
  assert.ok(decision.evidence_pack.length >= 3);
  assert.ok(decision.skill_plan.skills.length >= 1);
  assert.equal(decision.agent_opinions.length, 9);
  assert.deepEqual(
    decision.agent_opinions.map((opinion) => opinion.agent_id),
    [
      'goal_agent',
      'relationship_agent',
      'event_agent',
      'norm_agent',
      'option_agent',
      'skill_agent',
      'roi_agent',
      'evidence_agent',
      'feedback_agent'
    ]
  );
  assert.ok(decision.agent_opinions.every((opinion) => Array.isArray(opinion.evidence_refs)));
  assert.equal(decision.deliberation.status, 'rule_based_v1');
  assert.equal(decision.context_snapshot.schema_version, 'context_snapshot.v1');
  assert.equal(decision.context_snapshot.context_sufficiency_level, 'high');
  assert.ok(decision.context_snapshot.context_sufficiency_score >= 0.8);
  assert.equal(decision.expert_matrix_analysis.schema_version, 'expert_matrix_analysis.v2');
  assert.equal(
    decision.expert_matrix_analysis.execution_mode,
    'parallel_llm_orchestration_contract_with_deterministic_fallback.v1'
  );
  assert.equal(decision.expert_matrix_analysis.parallel_analysis.parallelizable, true);
  assert.ok(decision.expert_matrix_analysis.parallel_analysis.completed_expert_count >= 4);
  assert.ok(decision.expert_matrix_analysis.selected_expert_ids.includes('game_theory_expert'));
  assert.ok(decision.expert_matrix_analysis.selected_expert_ids.includes('psychology_expert'));
  assert.ok(decision.expert_matrix_analysis.selected_expert_ids.includes('logic_expert'));
  assert.equal(decision.theoretical_prediction.schema_version, 'theoretical_prediction_value.v1');
  assert.equal(decision.theoretical_prediction.ranking_basis, 'predictive_value_only');
  assert.ok(decision.theoretical_prediction.ranked_hypotheses.length >= 3);
  assert.equal(decision.independent_review.schema_version, 'independent_reasonable_legal_safety_review.v1');
  assert.equal(decision.independent_review.real_execution_allowed, false);
  assert.equal(decision.expert_matrix_analysis.message_draft.draft, decision.recommended_option.message_draft.draft);
  assert.deepEqual(
    decision.deliberation.agent_coverage.actual_agents,
    decision.agent_opinions.map((opinion) => opinion.agent_id)
  );
  assert.ok(decision.deliberation.tie_break_rules.length >= 4);
  assert.ok(Array.isArray(decision.deliberation.minority_opinions));
  assert.equal(typeof decision.deliberation.requires_human_review, 'boolean');
  assert.ok(decision.deliberation.proof_before_execution.includes('用户确认'));
  assert.ok(decision.roi_preview.roi_score >= 0);
  assert.equal(decision.skill_plan.execution_mode, 'assistive_plan');
  assert.equal(decision.feedback_plan.event_writeback.requires_user_review, true);
  assert.equal(decision.recommended_option.message_draft.channel, 'wechat');
  assert.equal(decision.recommended_option.message_draft.must_confirm_before_send, true);
  assert.ok(decision.recommended_option.message_draft.draft.includes('低承诺'));
  assert.ok(decision.recommended_option.message_draft.draft.includes('轻量评审'));
  assert.ok(decision.recommended_option.message_draft.draft.includes('李工'));
  assert.equal(decision.recommended_option.message_draft.draft.includes('也方便户技术负责人'), false);
  assert.ok(decision.recommended_option.message_draft.send_before_check.length >= 3);
  assert.equal(decision.structured_cot_trace.schema_version, 'structured_cot_trace.v1');
  assert.equal(decision.structured_cot_trace.visibility_policy.raw_hidden_chain_of_thought_logged, false);
  assert.equal(
    decision.structured_cot_trace.dialogue_generation_logic.draft_ref,
    'recommended_option.message_draft.draft'
  );
  assert.ok(decision.structured_cot_trace.generation_path.some((step) => step.step_id === 'context_snapshot'));
  assert.ok(decision.structured_cot_trace.generation_path.some((step) => step.step_id === 'expert_context_pack_fanout'));
});

test('builds personal social recommendation without business template drift', () => {
  const decision = buildDecisionRecommendation({
    goalInput: {
      initial_goal: '基于当前微信亲密调侃对话，生成轻松自然、低压力、可人工确认的下一句回复建议',
      scene: 'personal_social',
      primary_person_id: 'person_xiyan',
      target_person_ids: ['person_xiyan'],
      context_input: '会话对象：兮颜。用户：咋就亲爱的了。兮颜：哈哈哈哈哈哈。兮颜：那是不是我男朋友嘛。兮颜：哼。用户：现在算吗？',
      preferred_channel: 'wechat',
      identity_gate_decision: 'identity_unverified_desktop_context'
    },
    socialGraph: {
      user_id: 'user',
      people: [
        { person_id: 'person_xiyan', display_name: '兮颜', tags: ['desktop_intake_candidate'] }
      ],
      relationships: [
        {
          relationship_id: 'rel_user_xiyan',
          from_person_id: 'user',
          to_person_id: 'person_xiyan',
          type_code: 'acquaintance',
          phase: 'exploring',
          trust_level: 'low',
          health_score: 0.55
        }
      ],
      events: [
        {
          event_id: 'semantic_xiyan_personal_relationship_signal',
          event_type_code: 'personal_relationship_signal',
          event_level: 'P3',
          title: '私人社交 / 关系定义候选 / 亲密调侃',
          start_at: '2026-06-18T15:24:00+08:00',
          status: 'planned',
          importance: 0.58,
          confidence: 0.68,
          participants: [{ person_id: 'person_xiyan', role: 'target' }]
        }
      ]
    },
    userPreferences: {
      automation_comfort: 'low',
      risk_tolerance: 'low'
    }
  });

  assert.equal(decision.scene, 'personal_social');
  assert.equal(decision.recommended_option.option_id, 'option_personal_social_playful_reply');
  assert.ok(decision.recommended_option.message_draft.draft.includes('试用期'));
  assert.equal(decision.recommended_option.message_draft.draft.includes('评审'), false);
  assert.equal(
    decision.recommended_option.message_draft.playbook_schema_version,
    'intimate_relationship_reply_playbook.v1'
  );
  assert.equal(decision.recommended_option.message_draft.selected_template_id, 'candidate_relationship_probe');
  assert.equal(decision.recommended_option.message_draft.relationship_stage, 'candidate_intimate_relationship');
  assert.ok(
    decision.recommended_option.message_draft.possible_developments
      .some((item) => item.development_id === 'clarify_relationship_expectation')
  );
  assert.ok(
    decision.recommended_option.message_draft.confirmation_framework.identity_checks
      .some((item) => item.includes('主身份若为恋人'))
  );
  assert.ok(decision.theoretical_prediction.top_prediction.hypothesis_id.includes('playful_low_pressure'));
  assert.ok(decision.expert_matrix_analysis.selected_expert_ids.includes('psychology_expert'));
  assert.equal(
    decision.independent_review.checks.find((check) => check.check_id === 'identity_safety')?.status,
    'needs_human_review'
  );
});

test('confirmed romantic relationship overrides business scene template', () => {
  const decision = buildDecisionRecommendation({
    goalInput: {
      initial_goal: '根据当前微信对话生成下一步回复建议',
      scene: 'business',
      primary_person_id: 'person_xiyan_confirmed',
      target_person_ids: ['person_xiyan_confirmed'],
      context_input: '兮颜：哎，对你不拧巴，你捏捏捏。用户想要自然回复。',
      preferred_channel: 'wechat',
      identity_gate_decision: 'identity_confirmed_by_user_context'
    },
    socialGraph: {
      user_id: 'user',
      people: [
        {
          person_id: 'person_xiyan_confirmed',
          display_name: '兮颜',
          roles: ['romantic_partner'],
          tags: ['confirmed_by_user']
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
          health_score: 0.72,
          tags: ['user_confirmed_relationship'],
          metadata: {
            relationship_fact_status: 'confirmed',
            confirmed_by: 'user'
          }
        }
      ],
      events: []
    },
    userPreferences: {
      automation_comfort: 'low',
      risk_tolerance: 'low'
    }
  });

  assert.equal(decision.recommended_option.option_id, 'option_personal_social_playful_reply');
  assert.equal(decision.recommended_option.message_draft.relationship_context_status, 'confirmed_romantic_partner');
  assert.equal(
    decision.recommended_option.message_draft.playbook_schema_version,
    'intimate_relationship_reply_playbook.v1'
  );
  assert.equal(decision.recommended_option.message_draft.selected_template_id, 'confirmed_playful_affection');
  assert.equal(decision.recommended_option.message_draft.dynamic_context_basis.primary_identity_priority, 'romantic_partner_template_first');
  assert.equal(
    decision.recommended_option.message_draft.relationship_goal_contract.current_turn_goal,
    'advance_one_reversible_step_toward_offline_or_affection_context'
  );
  assert.ok(
    decision.recommended_option.message_draft.next_step_recommendations
      .includes('give_one_stage_bounded_micro_progression')
  );
  assert.ok(decision.recommended_option.message_draft.alternative_drafts.length >= 4);
  assert.ok(decision.recommended_option.message_draft.draft.includes('捏捏'));
  assert.equal(decision.recommended_option.message_draft.draft.includes('牵'), false);
  assert.ok(
    decision.recommended_option.message_draft.alternative_drafts
      .some((item) => item.style_id === 'higher_heat_closeness_check' && item.draft.includes('牵'))
  );
  assert.equal(
    decision.recommended_option.message_draft.dialogue_intent_contract.schema_version,
    'dialogue_intent_contract.v1'
  );
  assert.equal(
    decision.recommended_option.message_draft.dialogue_intent_contract.dialogue_act,
    'warm_affection_micro_progression'
  );
  assert.equal(
    decision.recommended_option.message_draft.dialogue_intent_contract.output_perspective,
    'user_first_person_draft'
  );
  assert.equal(decision.recommended_option.message_draft.draft.includes('抱一下'), false);
  assert.equal(decision.recommended_option.message_draft.draft.includes('抱抱'), false);
  assert.equal(
    decision.romantic_goal_analysis.context_gap_diagnosis.diagnosis,
    'current_message_available_but_history_incomplete'
  );
  assert.equal(
    decision.romantic_goal_analysis.output_delivery_policy.current_output_mode,
    'content_suggestion'
  );
  assert.equal(decision.romantic_goal_analysis.relationship_goal_contract.final_goal_state, 'R6_physical_intimacy_confirmed_relationship_goal_state');
  assert.equal(decision.romantic_goal_analysis.relationship_goal_contract.active_progression_allowed, true);
  assert.equal(
    decision.romantic_goal_analysis.relationship_gradient_framework.schema_version,
    'relationship_gradient_framework.v1'
  );
  assert.ok(
    decision.romantic_goal_analysis.relationship_gradient_framework.applies_to_relationship_types.includes('sales')
  );
  assert.equal(
    decision.romantic_goal_analysis.romantic_stage_gradient.stage_upgrade_policy.dynamic_feature_based,
    true
  );
  assert.equal(
    decision.romantic_goal_analysis.semantic_feature_assessment.fixed_phrase_matching_is_only_rule_based_evidence,
    true
  );
  assert.equal(
    decision.romantic_goal_analysis.psychological_comfort_model.schema_version,
    'psychological_comfort_model.v1'
  );
  assert.equal(
    decision.romantic_goal_analysis.psychological_comfort_model.progression_intensity,
    'micro_warmth'
  );
  assert.equal(
    decision.romantic_goal_analysis.online_offline_progression_track.schema_version,
    'online_offline_progression_track.v1'
  );
  assert.equal(
    decision.romantic_goal_analysis.online_offline_progression_track.online_track.stage,
    'O3'
  );
  assert.equal(
    decision.romantic_goal_analysis.online_offline_progression_track.offline_track.stage,
    'F0'
  );
  assert.equal(
    decision.romantic_goal_analysis.date_transition_readiness.schema_version,
    'date_transition_readiness.v1'
  );
  assert.equal(
    decision.romantic_goal_analysis.romantic_progression_cadence.current_turn_intent,
    'micro_progression'
  );
  assert.equal(
    decision.romantic_goal_analysis.stage_transition_assessment.dynamic_feature_policy.features_are_semantic_families_not_fixed_phrases,
    true
  );
  assert.equal(
    decision.romantic_goal_analysis.user_visible_reasoning_log.visible_to_target,
    false
  );
  assert.equal(decision.romantic_goal_analysis.draft_scope.no_physical_intimacy_advancement_draft, false);
  assert.equal(decision.romantic_goal_analysis.draft_scope.no_stage_skipping_or_unconsented_progression, true);
  assert.equal(decision.recommended_option.message_draft.draft.includes('评审'), false);
  assert.equal(
    decision.independent_review.checks.find((check) => check.check_id === 'identity_safety')?.status,
    'pass'
  );
});

test('intimate playbook shifts confirmed romantic replies to repair when tension appears', () => {
  const decision = buildDecisionRecommendation({
    goalInput: {
      initial_goal: '已确认兮颜为恋爱对象，根据阶段上下文生成下一句回复建议',
      scene: 'personal_social',
      primary_person_id: 'person_xiyan_confirmed',
      target_person_ids: ['person_xiyan_confirmed'],
      context_input: '兮颜：刚才那句我有点不舒服，也有点难受。用户想认真修复，不想继续开玩笑。',
      preferred_channel: 'wechat',
      identity_gate_decision: 'identity_confirmed_by_user_context'
    },
    socialGraph: {
      user_id: 'user',
      people: [
        {
          person_id: 'person_xiyan_confirmed',
          display_name: '兮颜',
          roles: ['romantic_partner'],
          tags: ['confirmed_by_user']
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
          health_score: 0.72,
          tags: ['user_confirmed_relationship'],
          metadata: {
            relationship_fact_status: 'confirmed',
            confirmed_by: 'user'
          }
        }
      ],
      events: []
    },
    userPreferences: {
      automation_comfort: 'low',
      risk_tolerance: 'low'
    }
  });

  assert.equal(decision.recommended_option.message_draft.relationship_context_status, 'confirmed_romantic_partner');
  assert.equal(decision.recommended_option.message_draft.selected_template_id, 'repair_or_tension');
  assert.equal(decision.recommended_option.message_draft.context_stage, 'repair_or_tension');
  assert.equal(decision.recommended_option.message_draft.tone_strategy, 'slow_repair_responsibility');
  assert.ok(decision.recommended_option.message_draft.draft.includes('认真听'));
  assert.equal(decision.recommended_option.message_draft.draft.includes('评审'), false);
});

test('expert matrix independently analyzes target temporal windows and integrates weight signals', () => {
  const decision = buildDecisionRecommendation({
    goalInput: {
      initial_goal: '\u5df2\u786e\u8ba4\u516e\u989c\u4e3a\u604b\u7231\u5bf9\u8c61\uff0c\u57fa\u4e8e\u9636\u6bb5\u6027\u4e0a\u4e0b\u6587\u751f\u6210\u4f4e\u538b\u529b\u56de\u590d',
      scene: 'personal_social',
      primary_person_id: 'person_xiyan',
      target_person_ids: ['person_xiyan'],
      context_input: '\u4eca\u5929\u516e\u989c\u8bf4\u5bf9\u4f60\u4e0d\u62e7\u5df4\uff0c\u4f60\u637b\u637b\u637b\u3002\u9700\u7ed3\u5408\u4eca\u5929\u3001\u4e00\u5468\u3001\u4e00\u4e2a\u6708\u548c\u5386\u53f2\u9636\u6bb5\u5224\u65ad\u8bed\u6c14\u3002',
      preferred_channel: 'wechat',
      identity_gate_decision: 'identity_confirmed_by_user_context'
    },
    socialGraph: {
      user_id: 'user',
      people: [
        {
          person_id: 'person_xiyan',
          display_name: '\u516e\u989c',
          roles: ['romantic_partner']
        }
      ],
      relationships: [
        {
          relationship_id: 'rel_user_xiyan_romantic_partner',
          from_person_id: 'user',
          to_person_id: 'person_xiyan',
          type_code: 'romantic_partner',
          phase: 'confirmed_romantic',
          trust_level: 'medium',
          health_score: 0.72
        }
      ],
      events: [
        {
          event_id: 'evt_xiyan_today',
          event_type_code: 'personal_relationship_signal',
          event_level: 'P3',
          title: '\u4eca\u5929\u4eb2\u5bc6\u8c03\u4f83',
          start_at: '2026-06-18T10:00:00+08:00',
          status: 'completed',
          importance: 0.7,
          confidence: 0.82,
          participants: [{ person_id: 'person_xiyan', role: 'target' }]
        },
        {
          event_id: 'evt_xiyan_week',
          event_type_code: 'invitation',
          event_level: 'P3',
          title: '\u4e00\u5468\u5185\u4e3b\u52a8\u5ef6\u5c55\u8bdd\u9898',
          start_at: '2026-06-15T20:00:00+08:00',
          status: 'completed',
          importance: 0.58,
          confidence: 0.72,
          participants: [{ person_id: 'person_xiyan', role: 'target' }]
        },
        {
          event_id: 'evt_xiyan_month',
          event_type_code: 'celebration',
          event_level: 'P3',
          title: '\u4e00\u4e2a\u6708\u5185\u6b63\u5411\u4e92\u52a8',
          start_at: '2026-06-02T19:30:00+08:00',
          status: 'completed',
          importance: 0.52,
          confidence: 0.7,
          participants: [{ person_id: 'person_xiyan', role: 'target' }]
        },
        {
          event_id: 'evt_xiyan_history',
          event_type_code: 'help',
          event_level: 'P3',
          title: '\u5386\u53f2\u9636\u6bb5\u7a33\u5b9a\u652f\u6301',
          start_at: '2026-04-01T18:00:00+08:00',
          status: 'completed',
          importance: 0.5,
          confidence: 0.68,
          participants: [{ person_id: 'person_xiyan', role: 'target' }]
        }
      ]
    },
    userPreferences: {
      risk_tolerance: 'low',
      relationship_priority: 'high',
      automation_comfort: 'low'
    }
  });

  const targetWindows = decision.context_snapshot.target_context_windows.find(
    (target) => target.target_person_id === 'person_xiyan'
  );
  assert.ok(targetWindows);
  assert.deepEqual(
    targetWindows.windows.map((window) => window.window_id),
    ['today', 'last_7_days', 'last_30_days', 'historical']
  );
  assert.equal(targetWindows.missing_windows.length, 0);
  const psychology = decision.expert_matrix_analysis.independent_context_analysis.find(
    (analysis) => analysis.expert_id === 'psychology_expert'
  );
  assert.ok(psychology);
  assert.equal(psychology.context_policy.latest_message_only_allowed, false);
  assert.deepEqual(
    psychology.target_analyses[0].window_analyses.map((window) => window.window_id),
    ['today', 'last_7_days', 'last_30_days', 'historical']
  );
  assert.ok(psychology.target_analyses[0].window_analyses.every((window) => window.status === 'has_stage_context'));
  assert.equal(decision.expert_weight_integration.schema_version, 'expert_weight_integration.v1');
  assert.ok(decision.expert_weight_integration.criterion_adjustments.relationship_fit > 0);
  assert.equal(decision.weight_revision.changed, true);
  assert.notEqual(decision.base_weights.relationship_fit, decision.weights.relationship_fit);
  assert.ok(decision.expert_matrix_analysis.llm_orchestration_contract.required_output_keys.includes('independent_context_analysis'));
  assert.ok(decision.expert_matrix_analysis.llm_orchestration_contract.required_output_keys.includes('expert_context_packs'));
  assert.ok(decision.expert_matrix_analysis.llm_orchestration_contract.required_output_keys.includes('parallel_expert_run_log'));
  assert.equal(decision.expert_matrix_analysis.system_goal_policy.append_only, true);
  assert.ok(decision.expert_matrix_analysis.expert_context_packs.length >= 3);
  assert.equal(decision.expert_matrix_analysis.expert_context_packs[0].schema_version, 'expert_context_pack.v1');
  assert.equal(decision.expert_matrix_analysis.expert_context_packs[0].context_policy.can_run_in_parallel, true);
  assert.equal(decision.expert_matrix_analysis.expert_context_packs[0].context_policy.context_must_be_human_readable, true);
  assert.equal(
    decision.expert_matrix_analysis.parallel_expert_run_log.schema_version,
    'parallel_expert_run_log.v1'
  );
  assert.equal(decision.expert_matrix_analysis.parallel_expert_run_log.concurrency_policy.parallelizable, true);
  assert.equal(
    decision.expert_matrix_analysis.parallel_expert_run_log.completed_lane_count,
    decision.expert_matrix_analysis.parallel_analysis.completed_expert_count
  );
});

test('expert matrix runtime config gates expert strength and primary coordinator', () => {
  const decision = buildDecisionRecommendation({
    goalInput: {
      initial_goal: 'Move the current relationship conversation toward a testable next-step recommendation.',
      scene: 'business',
      primary_person_id: 'person_client_a',
      target_person_ids: ['person_client_a'],
      context_input: 'The target replied with uncertainty. Build a recommendation using configured expert intensity.',
      preferred_channel: 'wechat'
    },
    socialGraph,
    userPreferences: {
      risk_tolerance: 'low',
      relationship_priority: 'high',
      automation_comfort: 'low'
    },
    expertMatrixConfig: {
      enabled: true,
      mode: 'control_variable_research',
      primaryExpertId: 'romantic_relationship_coordinator_expert',
      globalIntensity: 50,
      guidanceControlBoundary: {
        guidanceDefinition: 'Guidance is a research-layer influence variable.',
        controlDefinition: 'Control is a high-intensity research variable and not an execution permission.',
        experimentalQuestion: 'Does expert intensity change the recommendation?',
        safetyReviewStage: 'pre_send_gate'
      },
      experts: {
        psychology_expert: {
          enabled: false,
          intensity: 0,
          apiMode: 'dedicated_provider',
          providerRef: 'lab-psychology-provider',
          allowWeightImpact: false,
          role: 'specialist'
        },
        romantic_relationship_coordinator_expert: {
          enabled: true,
          intensity: 100,
          apiMode: 'shared_provider',
          providerRef: 'shared-romantic-coordinator',
          allowWeightImpact: true,
          role: 'coordinator'
        }
      }
    }
  });

  const runtimeConfig = decision.expert_matrix_analysis.expert_matrix_runtime_config;
  assert.equal(runtimeConfig.schema_version, 'expert_matrix_runtime_config.v1');
  assert.equal(runtimeConfig.mode, 'control_variable_research');
  assert.equal(runtimeConfig.global_intensity, 50);
  assert.equal(runtimeConfig.primary_expert_id, 'romantic_relationship_coordinator_expert');
  assert.equal(runtimeConfig.boundary_policy.safety_review_stage, 'pre_send_gate');
  assert.equal(runtimeConfig.experts.psychology_expert.enabled, false);
  assert.equal(runtimeConfig.experts.romantic_relationship_coordinator_expert.role, 'coordinator');
  assert.equal(
    decision.expert_matrix_analysis.selected_expert_ids[0],
    'romantic_relationship_coordinator_expert'
  );
  assert.equal(decision.expert_matrix_analysis.selected_expert_ids.includes('psychology_expert'), false);
  assert.equal(
    decision.expert_weight_integration.expert_signals.some((signal) => signal.expert_id === 'psychology_expert'),
    false
  );
  const coordinatorSignal = decision.expert_weight_integration.expert_signals.find(
    (signal) => signal.expert_id === 'romantic_relationship_coordinator_expert'
  );
  assert.ok(coordinatorSignal);
  assert.equal(coordinatorSignal.runtime_config.global_intensity, 50);
  assert.equal(coordinatorSignal.runtime_config.effective_intensity_multiplier, 0.5);
  assert.equal(
    decision.structured_cot_trace.expert_matrix_logic.runtime_config.global_intensity,
    50
  );
});

test('expert matrix analysis_only mode disables weight deltas but keeps context and templates', () => {
  const decision = buildDecisionRecommendation({
    goalInput: {
      initial_goal: 'Analyze the current customer relationship without changing strategy weights.',
      scene: 'business',
      primary_person_id: 'person_client_a',
      target_person_ids: ['person_client_a'],
      context_input: 'Customer is uncertain; only analyze evidence and uncertainty.',
      preferred_channel: 'wechat'
    },
    socialGraph,
    userPreferences: {
      risk_tolerance: 'low',
      relationship_priority: 'high',
      automation_comfort: 'low'
    },
    expertMatrixConfig: {
      enabled: true,
      mode: 'analysis_only',
      globalIntensity: 100,
      experts: {
        game_theory_expert: {
          enabled: true,
          intensity: 100,
          apiMode: 'shared_provider',
          providerRef: 'default',
          allowWeightImpact: true,
          role: 'specialist'
        }
      }
    }
  });

  assert.equal(decision.expert_matrix_analysis.mode_strategy.mode, 'analysis_only');
  assert.equal(decision.expert_matrix_analysis.mode_strategy.weight_delta_enabled, false);
  assert.equal(decision.weight_revision.changed, false);
  assert.ok(
    Object.values(decision.expert_weight_integration.criterion_adjustments)
      .every((value) => value === 0)
  );
  assert.equal(
    decision.expert_matrix_analysis.expert_context_packs[0].prompt_template.schema_version,
    'expert_prompt_templates.v1'
  );
  assert.equal(
    decision.expert_matrix_analysis.expert_context_packs[0].prompt_template.selected_dimensions.mode,
    'analysis_only'
  );
});

test('async expert provider executor routes shared and dedicated providers with isolated context packs', async () => {
  const goalInput = {
    initial_goal: 'Use provider-backed experts to analyze a staged recommendation.',
    scene: 'business',
    primary_person_id: 'person_client_a',
    target_person_ids: ['person_client_a'],
    context_input: 'The customer asked for timing and confidence. Use expert providers.',
    preferred_channel: 'wechat'
  };
  const expertMatrixConfig = {
    enabled: true,
    mode: 'control_variable_research',
    primaryExpertId: 'game_theory_expert',
    globalIntensity: 80,
    experts: {
      game_theory_expert: {
        enabled: true,
        intensity: 100,
        apiMode: 'shared_provider',
        providerRef: '',
        allowWeightImpact: true,
        role: 'specialist'
      },
      psychology_expert: {
        enabled: true,
        intensity: 90,
        apiMode: 'dedicated_provider',
        providerRef: 'psych-api',
        allowWeightImpact: true,
        role: 'specialist'
      }
    }
  };
  const decision = buildDecisionRecommendation({
    goalInput,
    socialGraph,
    userPreferences: {
      risk_tolerance: 'low',
      relationship_priority: 'high',
      automation_comfort: 'low'
    },
    expertMatrixConfig
  });
  const calls = [];
  const providerRegistry = {
    default: async (request) => {
      calls.push({ provider: 'default', expert_id: request.expert_id, request });
      assert.equal(request.context_pack.expert_id, request.expert_id);
      assert.equal(request.isolation_policy.one_expert_context_pack_only, true);
      assert.equal(request.prompt.user.includes('context_pack'), true);
      return {
        schema_version: 'expert_opinion.v1',
        expert_id: request.expert_id,
        summary: `shared ${request.expert_id}`,
        recommendation: 'shared provider recommendation',
        confidence: 0.71,
        evidence_refs: [request.context_pack.context_pack_id],
        weight_signal: { allow_weight_impact: true },
        risk_or_audit_notes: ['pre_send_gate_required']
      };
    },
    'psych-api': async (request) => {
      calls.push({ provider: 'psych-api', expert_id: request.expert_id, request });
      assert.equal(request.expert_id, 'psychology_expert');
      assert.equal(request.context_pack.expert_id, 'psychology_expert');
      return JSON.stringify({
        schema_version: 'expert_opinion.v1',
        expert_id: request.expert_id,
        summary: 'dedicated psychology summary',
        recommendation: 'dedicated psychology recommendation',
        confidence: 0.83,
        evidence_refs: [request.context_pack.context_pack_id],
        weight_signal: { allow_weight_impact: true, target: 'relationship_fit' },
        influence_variable_hypotheses: ['comfort pacing changes reply warmth'],
        observable_feedback_metrics: ['target_affective_tone_shift'],
        risk_or_audit_notes: ['pre_send_gate_required']
      });
    }
  };

  const expertMatrix = await buildExpertMatrixAnalysisV2Async({
    goalInput,
    plan: decision.social_process_plan,
    recommended: decision.recommended_option,
    contextSnapshot: decision.context_snapshot,
    parallelExpertAnalysis: decision.parallel_expert_analysis,
    weights: decision.base_weights,
    expertMatrixConfig,
    providerRegistry,
    defaultProviderRef: 'default',
    providerTimeoutMs: 5000
  });

  assert.equal(expertMatrix.provider_execution.schema_version, 'expert_provider_execution.v1');
  assert.equal(expertMatrix.provider_execution.executor, 'parallel_expert_provider_executor');
  assert.ok(calls.some((call) => call.provider === 'default' && call.expert_id === 'game_theory_expert'));
  assert.ok(calls.some((call) => call.provider === 'psych-api' && call.expert_id === 'psychology_expert'));
  assert.equal(
    calls.every((call) => call.request.context_pack.expert_id === call.expert_id),
    true
  );
  const psychologyOpinion = expertMatrix.provider_expert_opinions.find(
    (opinion) => opinion.expert_id === 'psychology_expert'
  );
  assert.ok(psychologyOpinion);
  assert.equal(psychologyOpinion.schema_version, 'expert_opinion.v1');
  assert.equal(psychologyOpinion.provider.provider_ref, 'psych-api');
  assert.equal(psychologyOpinion.provider.fallback_used, false);
  assert.equal(psychologyOpinion.target_isolation_policy.output_partition_key, 'target_person_id');
  assert.ok(psychologyOpinion.target_outputs.length >= 1);
  assert.ok(psychologyOpinion.target_outputs.every((item) => item.target_person_id));
  assert.deepEqual(psychologyOpinion.observable_feedback_metrics, ['target_affective_tone_shift']);
  assert.equal(expertMatrix.influence_variable_research_plan.active, true);
  assert.ok(expertMatrix.llm_orchestration_contract.required_output_keys.includes('provider_execution'));
});

test('PT-028 romantic goal analysis uses optional identity labels and generic target sentence review', () => {
  const decision = buildDecisionRecommendation({
    goalInput: {
      initial_goal: '已确认测试对象A为恋爱对象，基于阶段性上下文生成低压力回复，并逐句进行专家评审',
      scene: 'personal_social',
      primary_person_id: 'person_generic_partner',
      target_person_ids: ['person_generic_partner'],
      identity_labels: ['romantic_partner', 'friend'],
      context_input: '测试对象A：今天想见你，也想继续靠近。测试对象A：你别老躲，我会认真。用户：我想按流程推进关系。',
      preferred_channel: 'wechat',
      identity_gate_decision: 'identity_confirmed_by_user_context'
    },
    socialGraph: {
      user_id: 'user',
      people: [
        {
          person_id: 'person_generic_partner',
          display_name: '测试对象A',
          roles: ['romantic_partner', 'friend'],
          tags: ['confirmed_by_user']
        }
      ],
      relationships: [
        {
          relationship_id: 'rel_user_generic_partner',
          from_person_id: 'user',
          to_person_id: 'person_generic_partner',
          type_code: 'romantic_partner',
          phase: 'confirmed_romantic',
          trust_level: 'medium',
          health_score: 0.74
        }
      ],
      events: [
        {
          event_id: 'evt_generic_today',
          event_type_code: 'personal_relationship_signal',
          event_level: 'P3',
          title: '今天轻松靠近表达',
          start_at: '2026-06-18T10:00:00+08:00',
          status: 'completed',
          importance: 0.7,
          confidence: 0.82,
          participants: [{ person_id: 'person_generic_partner', role: 'target' }]
        },
        {
          event_id: 'evt_generic_week',
          event_type_code: 'invitation',
          event_level: 'P3',
          title: '一周内主动互动',
          start_at: '2026-06-15T20:00:00+08:00',
          status: 'completed',
          importance: 0.58,
          confidence: 0.72,
          participants: [{ person_id: 'person_generic_partner', role: 'target' }]
        },
        {
          event_id: 'evt_generic_month',
          event_type_code: 'celebration',
          event_level: 'P3',
          title: '一个月内正向互动',
          start_at: '2026-06-02T19:30:00+08:00',
          status: 'completed',
          importance: 0.52,
          confidence: 0.7,
          participants: [{ person_id: 'person_generic_partner', role: 'target' }]
        },
        {
          event_id: 'evt_generic_history',
          event_type_code: 'help',
          event_level: 'P3',
          title: '历史阶段稳定支持',
          start_at: '2026-04-01T18:00:00+08:00',
          status: 'completed',
          importance: 0.5,
          confidence: 0.68,
          participants: [{ person_id: 'person_generic_partner', role: 'target' }]
        }
      ]
    },
    userPreferences: {
      risk_tolerance: 'low',
      relationship_priority: 'high',
      automation_comfort: 'low'
    }
  });

  assert.equal(decision.romantic_goal_analysis.schema_version, 'romantic_goal_analysis.v1');
  assert.equal(decision.romantic_goal_analysis.target_person_id, 'person_generic_partner');
  assert.equal(decision.romantic_goal_analysis.identity_label_policy.identity_labels_are_optional_inputs, true);
  assert.equal(decision.romantic_goal_analysis.test_fixture_policy.specific_person_name_hardcoded, false);
  assert.equal(decision.romantic_goal_analysis.primary_relationship_stage, 'R2');
  assert.equal(decision.romantic_goal_analysis.primary_relationship_stage_id, 'confirmed_romantic_no_physical_intimacy');
  assert.equal(decision.romantic_goal_analysis.physical_intimacy_state, 'none_or_unknown');
  assert.equal(decision.romantic_goal_analysis.physical_intimacy_goal_state.relationship_goal_state, true);
  assert.equal(decision.romantic_goal_analysis.physical_intimacy_goal_state.optimization_kpi, false);
  assert.equal(decision.romantic_goal_analysis.physical_intimacy_goal_state.automatic_send_metric, false);
  assert.equal(
    decision.romantic_goal_analysis.output_delivery_policy.current_output_mode,
    'content_suggestion'
  );
  assert.equal(decision.romantic_goal_analysis.output_delivery_policy.automatic_send_allowed, false);
  assert.equal(
    decision.romantic_goal_analysis.context_gap_diagnosis.diagnosis,
    'sufficient_multi_window_context'
  );
  assert.equal(
    decision.romantic_goal_analysis.context_gap_diagnosis.treats_missing_history_as_stage_stability,
    false
  );
  assert.equal(
    decision.romantic_goal_analysis.relationship_gradient_framework.framework_id,
    'stage_progression_strategy_framework.v1'
  );
  assert.equal(
    decision.romantic_goal_analysis.romantic_stage_gradient.schema_version,
    'romantic_stage_gradient.v1'
  );
  assert.equal(
    decision.romantic_goal_analysis.semantic_feature_assessment.dynamic_feature_based,
    true
  );
  assert.equal(
    decision.romantic_goal_analysis.psychological_comfort_model.schema_version,
    'psychological_comfort_model.v1'
  );
  assert.equal(
    decision.romantic_goal_analysis.stage_transition_assessment.schema_version,
    'romantic_stage_transition_assessment.v1'
  );
  assert.equal(
    decision.romantic_goal_analysis.online_offline_progression_track.schema_version,
    'online_offline_progression_track.v1'
  );
  assert.match(
    decision.romantic_relationship_coordinator.frontend_display_contract.surfaces.dock.text,
    /^R2\/O[0-7X]\/F[0-7X] · .+ · prompt-only$/
  );
  assert.deepEqual(
    decision.romantic_relationship_coordinator.frontend_display_contract.surfaces.dock.status_parts,
    {
      relationship_stage: decision.romantic_goal_analysis.primary_relationship_stage,
      online_stage: decision.romantic_goal_analysis.online_offline_progression_track.online_track.stage,
      offline_stage: decision.romantic_goal_analysis.online_offline_progression_track.offline_track.stage,
      current_turn_intent: decision.romantic_goal_analysis.romantic_progression_cadence.current_turn_intent,
      gate_status: 'prompt-only'
    }
  );
  assert.ok(decision.romantic_goal_analysis.user_visible_reasoning_log.steps.length >= 4);
  assert.equal(
    decision.romantic_goal_analysis.upstream_downstream_closure.gate_decision,
    'pt028_upstream_downstream_closed'
  );
  assert.ok(decision.romantic_goal_analysis.target_utterances.length >= 2);
  assert.equal(decision.romantic_expert_sentence_review.schema_version, 'romantic_expert_sentence_review.v1');
  assert.equal(decision.romantic_expert_sentence_review.gate_decision, 'sentence_expert_review_completed');
  assert.deepEqual(
    decision.romantic_expert_sentence_review.required_expert_ids,
    [
      'relationship_stage_expert',
      'attachment_psychology_expert',
      'game_theory_signal_expert',
      'logic_and_evidence_expert',
      'consent_and_boundary_expert',
      'coercion_and_pua_risk_expert',
      'privacy_and_safety_expert',
      'communication_pragmatics_expert',
      'feedback_learning_expert'
    ]
  );
  assert.ok(
    decision.romantic_expert_sentence_review.target_sentence_reviews
      .every((sentence) => sentence.expert_reviews.length === 9)
  );
  assert.equal(
    decision.romantic_expert_sentence_review.active_input_blocked_display_policy.active_input_blocked_by_default,
    true
  );
  assert.equal(
    decision.romantic_expert_sentence_review.target_sentence_reviews[0].third_party_prompt_analysis.display_mode,
    'user_visible_third_party_prompt_not_sent_to_target'
  );
  assert.equal(
    decision.romantic_expert_sentence_review.target_sentence_reviews[0].third_party_prompt_analysis.not_sent_to_target,
    true
  );
  const coercionReview = decision.romantic_expert_sentence_review.target_sentence_reviews[0].expert_reviews
    .find((review) => review.expert_id === 'coercion_and_pua_risk_expert');
  assert.equal(coercionReview.scope, 'target_to_user_only');
  const gameTheoryReview = decision.romantic_expert_sentence_review.target_sentence_reviews[0].expert_reviews
    .find((review) => review.expert_id === 'game_theory_signal_expert');
  assert.equal(
    gameTheoryReview.review_recommendation,
    'choose_small_reversible_signal_and_measure_feedback'
  );
  assert.equal(gameTheoryReview.progression_gradient_advice.advice_id, 'small_reversible_signal');
  assert.ok(gameTheoryReview.user_prompt_hint.includes('当前阶段'));
  assert.equal(
    decision.romantic_expert_sentence_review.safety_module_reviews[0].reviewer_id,
    'user_side_manipulation_reviewer'
  );
  assert.equal(
    decision.romantic_expert_sentence_review.safety_module_reviews[0].separate_from_romantic_expert_matrix,
    true
  );
  assert.equal(
    decision.expert_matrix_analysis.romantic_goal_analysis.analysis_id,
    decision.romantic_goal_analysis.analysis_id
  );
  assert.equal(
    decision.romantic_relationship_coordinator.schema_version,
    'romantic_relationship_coordinator_expert.v1'
  );
  assert.equal(
    decision.romantic_relationship_coordinator.coordinator_expert.expert_id,
    'romantic_relationship_coordinator_expert'
  );
  assert.equal(
    decision.romantic_relationship_coordinator.frontend_display_contract.schema_version,
    'frontend_display_contract.v1'
  );
  assert.equal(
    decision.romantic_relationship_coordinator.frontend_display_contract.surfaces.dock.mode,
    'brief_status_only'
  );
  assert.equal(
    decision.romantic_relationship_coordinator.frontend_display_contract.surfaces.dock.placement_policy.preferred_anchor,
    'target_application_window_edge'
  );
  assert.equal(
    decision.romantic_relationship_coordinator.frontend_display_contract.surfaces.dock.boundary_policy.detailed_logs_allowed,
    false
  );
  assert.equal(
    decision.romantic_relationship_coordinator.frontend_display_contract.surfaces.console.mode,
    'chat_model_style_detail_log'
  );
  assert.equal(
    decision.romantic_relationship_coordinator.frontend_display_contract.surfaces.console.reasoning_policy.show_user_visible_structured_reasoning_log,
    true
  );
  assert.equal(
    decision.romantic_relationship_coordinator.frontend_display_contract.surfaces.console.reasoning_policy.show_hidden_chain_of_thought,
    false
  );
  assert.equal(
    decision.romantic_relationship_coordinator.send_gate_transfer_path.schema_version,
    'send_gate_transfer_path.v1'
  );
  assert.equal(
    decision.romantic_relationship_coordinator.send_gate_transfer_path.current_mode,
    'blocked_prompt_only'
  );
  assert.equal(
    decision.romantic_relationship_coordinator.send_gate_transfer_path.real_execution_allowed,
    false
  );
  assert.equal(JSON.stringify(decision).includes('兮颜'), false);
  assert.equal(decision.independent_review.real_execution_allowed, false);
});

test('PT-028 controlled send preview path transfers only confirmed draft payload after explicit gate authorization', () => {
  const decision = buildDecisionRecommendation({
    goalInput: {
      initial_goal: '已确认 TargetA 是恋人关系，请根据当前轻松互动给出一句自然回复，并准备受控发送预览',
      scene: 'personal_social',
      primary_person_id: 'person_romantic_preview_target',
      target_person_ids: ['person_romantic_preview_target'],
      target_display_name: 'TargetA',
      identity_labels: ['romantic_partner'],
      context_input: 'TargetA 说：你今天也太可爱了吧，想下次见面继续聊。',
      content_text: '你今天也太可爱了吧，想下次见面继续聊。',
      preferred_channel: 'wechat',
      identity_gate_decision: 'identity_confirmed_by_user_context'
    },
    socialGraph: {
      user_id: 'user',
      people: [
        {
          person_id: 'person_romantic_preview_target',
          display_name: 'TargetA',
          roles: ['romantic_partner'],
          tags: ['confirmed_by_user']
        }
      ],
      relationships: [
        {
          relationship_id: 'rel_user_romantic_preview_target',
          from_person_id: 'user',
          to_person_id: 'person_romantic_preview_target',
          relationship_type: 'romantic_partner',
          phase: 'confirmed_romantic_partner',
          health_score: 0.82,
          tags: ['confirmed_romantic_partner']
        }
      ]
    },
    controlledSendPreviewAuthorized: true
  });

  const transferPath = decision.romantic_relationship_coordinator.send_gate_transfer_path;
  assert.equal(decision.independent_review.real_execution_allowed, true);
  assert.equal(transferPath.current_mode, 'controlled_send_preview_candidate');
  assert.equal(transferPath.real_execution_allowed, true);
  assert.equal(transferPath.real_send_attempted, false);
  assert.equal(transferPath.transfer_payload.target_person_id, 'person_romantic_preview_target');
  assert.equal(transferPath.transfer_payload.coordinator_decision_required, true);
  assert.equal(typeof transferPath.transfer_payload.draft, 'string');
  assert.ok(transferPath.required_gates.includes('operator_confirmation'));
  assert.ok(transferPath.required_gates.includes('draft_hash_matches_preview'));
  assert.equal(
    decision.romantic_relationship_coordinator.frontend_display_contract.surfaces.send_window.mode,
    'controlled_send_preview_candidate'
  );
  assert.equal(
    decision.romantic_relationship_coordinator.frontend_display_contract.surfaces.send_window.target_visible_analysis,
    false
  );
  assert.deepEqual(
    decision.romantic_relationship_coordinator.frontend_display_contract.surfaces.send_window.context_interface.allowed_fields,
    [
      'send_gate_transfer_path.transfer_payload',
      'send_gate_transfer_path.required_gates'
    ]
  );
  assert.equal(
    decision.romantic_relationship_coordinator.frontend_display_contract.surfaces.send_window.boundary_policy.only_confirmed_draft_payload_allowed,
    true
  );
});

test('PT-028 distinguishes unread or uncaptured messages from stable relationship stage', () => {
  const decision = buildDecisionRecommendation({
    goalInput: {
      initial_goal: '已确认 TargetA 为恋人关系，但当前 OCR 没有读取到可用聊天内容，请判断是否直接给回复还是先补读消息',
      scene: 'personal_social',
      primary_person_id: 'person_context_gap_target',
      target_person_ids: ['person_context_gap_target'],
      target_display_name: 'TargetA',
      identity_labels: ['romantic_partner'],
      context_input: 'OCR did not return usable visible chat text; current messages may not be read yet.',
      preferred_channel: 'wechat',
      identity_gate_decision: 'identity_confirmed_by_user_context'
    },
    socialGraph: {
      user_id: 'user',
      people: [
        {
          person_id: 'person_context_gap_target',
          display_name: 'TargetA',
          roles: ['romantic_partner'],
          tags: ['confirmed_by_user']
        }
      ],
      relationships: [
        {
          relationship_id: 'rel_user_context_gap_target',
          from_person_id: 'user',
          to_person_id: 'person_context_gap_target',
          type_code: 'romantic_partner',
          phase: 'confirmed_romantic',
          trust_level: 'medium',
          health_score: 0.72
        }
      ],
      events: []
    },
    userPreferences: {
      automation_comfort: 'low',
      risk_tolerance: 'low',
      relationship_priority: 'high'
    }
  });

  assert.equal(decision.romantic_goal_analysis.primary_relationship_stage, 'R2');
  assert.equal(decision.romantic_goal_analysis.target_utterances.length, 0);
  assert.equal(
    decision.romantic_goal_analysis.context_gap_diagnosis.diagnosis,
    'messages_may_exist_but_not_read_or_extracted'
  );
  assert.equal(
    decision.romantic_goal_analysis.context_gap_diagnosis.current_state_process_decision,
    'read_or_capture_more_messages_before_stage_progression'
  );
  assert.equal(
    decision.romantic_goal_analysis.context_gap_diagnosis.treats_missing_history_as_stage_stability,
    false
  );
  assert.equal(
    decision.romantic_goal_analysis.output_delivery_policy.current_output_mode,
    'context_capture_hint'
  );
  assert.equal(decision.romantic_goal_analysis.output_delivery_policy.content_suggestion_available, false);
  assert.equal(decision.romantic_goal_analysis.output_delivery_policy.automatic_send_allowed, false);
  assert.equal(decision.independent_review.real_execution_allowed, false);
});

test('PT-028 GUI decision state projects runtime decision, chain flow and branch records', () => {
  const state = buildPt028GuiDecisionState({
    source: {
      source_type: 'unit_test_runtime_projection',
      observation_path: 'runtime/desktop-inbox-real/sample/intake-observation.real.json'
    },
    stateId: 'pt028_gui_decision_state_test'
  });

  assert.equal(state.schema_version, 'pt028_gui_decision_state.v1');
  assert.equal(state.gate_decision, 'ready_for_gui_operator_review');
  assert.equal(state.real_execution_allowed, false);
  assert.equal(state.real_send_attempted, false);
  assert.equal(state.relationship_gradient_review.current_stage, 'R2');
  assert.equal(
    state.relationship_gradient_review.dialogue_act,
    'warm_affection_micro_progression'
  );
  assert.equal(
    state.relationship_gradient_review.output_perspective,
    'user_first_person_draft'
  );
  assert.ok(state.relationship_gradient_review.draft.length > 0);
  assert.ok(state.relationship_gradient_review.reasoning_rows.length >= 4);
  assert.equal(
    state.relationship_gradient_review.user_visible_reasoning_log.visible_to_target,
    false
  );
  assert.ok(state.relationship_gradient_review.third_party_prompts.length >= 1);
  assert.ok(
    state.relationship_gradient_review.third_party_prompts
      .every((prompt) => prompt.not_sent_to_target === true)
  );
  assert.ok(state.expert_context_packs.length >= 3);
  assert.equal(state.parallel_expert_run_log.schema_version, 'parallel_expert_run_log.v1');
  assert.equal(state.structured_cot_trace.schema_version, 'structured_cot_trace.v1');
  assert.equal(state.structured_cot_trace.visibility_policy.raw_hidden_chain_of_thought_logged, false);
  assert.ok(state.structured_cot_trace.generation_path.some((step) => step.step_id === 'prompt_generation'));
  assert.equal(state.romantic_coordinator_decision.schema_version, 'romantic_relationship_coordinator_expert.v1');
  assert.equal(state.frontend_display_contract.schema_version, 'frontend_display_contract.v1');
  assert.equal(state.frontend_display_contract.surfaces.dock.mode, 'brief_status_only');
  assert.equal(
    state.frontend_display_contract.surfaces.dock.text,
    'R2/O3/F0 · micro_progression · prompt-only'
  );
  assert.deepEqual(
    state.frontend_display_contract.surfaces.dock.status_parts,
    {
      relationship_stage: 'R2',
      online_stage: 'O3',
      offline_stage: 'F0',
      current_turn_intent: 'micro_progression',
      gate_status: 'prompt-only'
    }
  );
  assert.equal(
    state.relationship_gradient_review.online_offline_progression_track.schema_version,
    'online_offline_progression_track.v1'
  );
  assert.equal(
    state.relationship_gradient_review.romantic_progression_cadence.current_turn_intent,
    'micro_progression'
  );
  assert.ok(state.relationship_gradient_review.reasoning_rows.some((row) => row.label === 'online_offline_track'));
  assert.ok(state.chain_flow.some((step) => step.step_id === 'online_offline_progression_track'));
  assert.equal(state.send_gate_transfer_path.schema_version, 'send_gate_transfer_path.v1');
  assert.equal(state.send_gate_transfer_path.current_mode, 'blocked_prompt_only');
  assert.ok(state.chain_flow.some((step) => step.step_id === 'expert_sentence_review'));
  assert.ok(state.chain_flow.some((step) => step.step_id === 'expert_context_pack'));
  assert.ok(state.chain_flow.some((step) => step.step_id === 'parallel_expert_run_log'));
  assert.ok(state.chain_flow.some((step) => step.step_id === 'structured_cot_trace'));
  assert.ok(state.chain_flow.some((step) => step.step_id === 'romantic_relationship_coordinator'));
  assert.ok(state.chain_flow.some((step) => step.step_id === 'blocked_active_input_display'));
  assert.ok(state.branch_records.some((branch) => branch.branch_id === 'identity_branch'));
  assert.ok(state.branch_records.some((branch) => branch.branch_id === 'stage_transition_branch'));
  assert.ok(state.branch_records.some((branch) => branch.branch_id === 'active_input_blocked_branch'));
  assert.ok(state.branch_records.some((branch) => branch.branch_id === 'coordinator_delivery_branch'));
  assert.ok(state.branch_records.some((branch) => branch.branch_id === 'send_gate_transfer_branch'));
  assert.ok(state.acceptance_evidence.includes('real_execution_allowed_false'));
  assert.ok(state.acceptance_evidence.includes('expert_context_pack_per_selected_expert'));
  assert.ok(state.acceptance_evidence.includes('structured_cot_trace_no_raw_hidden_cot'));
  assert.ok(state.acceptance_evidence.includes('romantic_relationship_coordinator_expert'));
});

test('PT-028 GUI event stream exposes low-latency prompt-only state updates', () => {
  const state = buildPt028GuiDecisionState({
    stateId: 'pt028_gui_decision_state_event_test',
    source: {
      source_type: 'unit_test_event_stream',
      window_id: 'wechat_window_unit',
      app_type: 'wechat'
    }
  });
  const stream = buildPt028GuiEventStream({
    states: [{
      window_id: 'wechat_window_unit',
      app_type: 'wechat',
      state
    }],
    streamId: 'pt028_gui_event_stream_test'
  });

  assert.equal(stream.schema_version, 'pt028_gui_event_stream.v1');
  assert.equal(stream.gate_decision, 'ready_for_low_latency_gui_subscription');
  assert.equal(stream.low_latency_policy.desktop_ipc_channel, 'zhineng:decision-state:changed');
  assert.equal(stream.low_latency_policy.target_dispatch_latency_ms, 50);
  assert.equal(stream.low_latency_policy.debounce_ms, 50);
  assert.equal(stream.low_latency_policy.fallback_poll_interval_ms, 1000);
  assert.equal(stream.low_latency_policy.user_control_policy.pause_stop_hide_or_frequency_control_required, true);
  assert.equal(stream.stream_integrity.event_count, 1);
  assert.equal(stream.stream_integrity.all_events_prompt_only, true);
  assert.equal(stream.stream_integrity.real_execution_allowed, false);
  assert.equal(stream.events[0].dock_status_text, state.frontend_display_contract.surfaces.dock.text);
  assert.equal(stream.events[0].send_gate_mode, 'blocked_prompt_only');
  assert.ok(stream.events[0].changed_fields.includes('dock_status_text'));
});

test('PT-028 GUI event stream CLI can bind to real feedback batch window states', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'zhineng-pt028-event-stream-feedback-'));
  try {
    mkdirSync(path.join(root, 'runtime/user-inputs'), { recursive: true });
    const records = ['a', 'b', 'c'].map((suffix, index) => {
      const targetPersonId = `person_event_stream_real_${suffix}`;
      const state = buildPt028GuiDecisionState({
        stateId: `state_event_stream_real_${suffix}`,
        source: {
          source_type: 'unit_test_feedback_event_stream',
          window_id: `wechat_window_real_${suffix}`,
          app_type: 'wechat'
        }
      });
      const stateSnapshot = {
        ...state,
        source_decision: {
          ...state.source_decision,
          target_person_id: targetPersonId,
          target_display_name: `Real${suffix.toUpperCase()}`
        }
      };
      return {
        feedback_id: `feedback_event_stream_${suffix}`,
        window_id: `wechat_window_real_${suffix}`,
        app_type: 'wechat',
        target_person_id: targetPersonId,
        target_display_name: `Real${suffix.toUpperCase()}`,
        source_type: 'human_reviewed_real_window_feedback',
        operator_decision: index === 2
          ? 'hold_and_show_safety_prompt'
          : 'prompt_accepted_for_manual_edit',
        target_response_signal: index === 2
          ? 'pressure_or_boundary_risk'
          : 'warm_or_positive',
        state_path: `runtime/pt028-gui-decision-states/state_event_stream_real_${suffix}/pt028-gui-decision-state.json`,
        state_snapshot: stateSnapshot,
        real_window_observed: true,
        state_target_verified: true,
        prompt_only_confirmed: true,
        no_real_send_attempted: true,
        privacy_boundary_confirmed: true,
        reviewed_at: '2026-06-20T13:30:00+08:00',
        evidence_refs: [`https://example.test/evidence/${suffix}`]
      };
    });
    const feedbackPath = path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json');
    writeFileSync(feedbackPath, `${JSON.stringify({
      schema_version: 'pt028_real_multi_window_operator_feedback.v1',
      feedback_batch_id: 'feedback_event_stream_real_batch_test',
      created_at: '2026-06-20T13:30:00+08:00',
      reviewer: {
        reviewer_id: 'event_stream_operator',
        reviewed_at: '2026-06-20T13:30:00+08:00'
      },
      window_feedback_records: records,
      human_special_review: {
        approved_for_final_special_acceptance: false,
        reviewer_id: 'pending',
        reviewed_at: '2026-06-20T13:30:00+08:00',
        approval_scope: ['low_latency_event_stream'],
        notes: 'Unit test keeps final approval false.'
      }
    }, null, 2)}\n`, 'utf8');

    const outputDir = path.join(root, 'runtime/pt028-gui-event-streams/feedback-bound-stream');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-gui-event-stream.mjs'),
      `--root=${root}`,
      `--feedback=${feedbackPath}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'write-pt028-gui-event-stream');
    assert.equal(stdout.input_mode, 'real_feedback_batch_window_states');
    assert.equal(stdout.event_count, 3);
    assert.equal(stdout.window_count, 3);
    assert.equal(stdout.target_count, 3);
    assert.equal(stdout.real_execution_allowed, false);
    const stream = JSON.parse(readFileSync(path.join(outputDir, 'pt028-gui-event-stream.json'), 'utf8'));
    assert.equal(stream.stream_integrity.event_count, 3);
    assert.equal(stream.stream_integrity.unique_window_count, 3);
    assert.equal(stream.stream_integrity.unique_target_count, 3);
    assert.equal(stream.stream_integrity.all_events_prompt_only, true);
    assert.equal(stream.source.feedback_batch_id, 'feedback_event_stream_real_batch_test');
    assert.deepEqual(
      stream.events.map((event) => event.target_person_id),
      ['person_event_stream_real_a', 'person_event_stream_real_b', 'person_event_stream_real_c']
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 GUI event stream CLI can prebind collection session window states', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'zhineng-pt028-event-stream-session-'));
  try {
    const stateDir = path.join(root, 'runtime/pt028-session-state-fixtures');
    mkdirSync(stateDir, { recursive: true });
    const tasks = ['a', 'b'].map((suffix, index) => {
      const targetPersonId = `person_event_stream_session_${suffix}`;
      const windowId = `wechat_window_session_${suffix}`;
      const state = buildPt028GuiDecisionState({
        stateId: `state_event_stream_session_${suffix}`,
        source: {
          source_type: 'unit_test_collection_session_event_stream',
          window_id: windowId,
          app_type: 'wechat'
        }
      });
      const stateWithTarget = {
        ...state,
        source_decision: {
          ...state.source_decision,
          target_person_id: targetPersonId,
          target_display_name: `Session${suffix.toUpperCase()}`
        }
      };
      const statePath = path.join(stateDir, `${stateWithTarget.state_id}.json`);
      writeFileSync(statePath, `${JSON.stringify(stateWithTarget, null, 2)}\n`, 'utf8');
      return {
        task_id: `feedback_collection_window_${String(index + 1).padStart(3, '0')}`,
        window_id: windowId,
        app_type: 'wechat',
        target_person_id: targetPersonId,
        state_path: path.relative(root, statePath).replace(/\\/g, '/'),
        candidate_prefill_only: true,
        real_send_allowed: false,
        ready_for_real_feedback_target_write: false,
        status: 'pending_operator_real_window_review'
      };
    });

    const sessionPath = path.join(root, 'runtime/pt028-feedback-collection-sessions/session-for-event-stream.json');
    mkdirSync(path.dirname(sessionPath), { recursive: true });
    writeFileSync(sessionPath, `${JSON.stringify({
      schema_version: 'pt028_feedback_collection_session.v1',
      session_id: 'pt028_feedback_collection_session_event_stream_test',
      gate_decision: 'ready_for_operator_window_feedback_collection',
      ready_for_operator_feedback_collection: true,
      real_execution_allowed: false,
      real_send_attempted: false,
      writes_real_feedback_target: false,
      collection_scope: {
        task_count: 2,
        distinct_target_count: 2,
        candidate_prefill_only: true,
        all_real_send_disallowed: true
      },
      operator_collection_tasks: tasks
    }, null, 2)}\n`, 'utf8');

    const outputDir = path.join(root, 'runtime/pt028-gui-event-streams/session-bound-stream');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-gui-event-stream.mjs'),
      `--root=${root}`,
      `--session=${sessionPath}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'write-pt028-gui-event-stream');
    assert.equal(stdout.input_mode, 'operator_collection_session_window_states');
    assert.equal(stdout.event_count, 2);
    assert.equal(stdout.window_count, 2);
    assert.equal(stdout.target_count, 2);
    assert.equal(stdout.real_execution_allowed, false);
    const stream = JSON.parse(readFileSync(path.join(outputDir, 'pt028-gui-event-stream.json'), 'utf8'));
    assert.equal(stream.source.collection_session_id, 'pt028_feedback_collection_session_event_stream_test');
    assert.equal(stream.stream_integrity.all_events_prompt_only, true);
    assert.deepEqual(
      stream.events.map((event) => event.target_person_id),
      ['person_event_stream_session_a', 'person_event_stream_session_b']
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 event stream health validates low-latency subscription evidence', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'zhineng-pt028-event-stream-health-'));
  try {
    const stateDir = path.join(root, 'runtime/pt028-health-state-fixtures');
    mkdirSync(stateDir, { recursive: true });
    const tasks = ['a', 'b'].map((suffix, index) => {
      const targetPersonId = `person_event_stream_health_${suffix}`;
      const windowId = `wechat_window_health_${suffix}`;
      const state = buildPt028GuiDecisionState({
        stateId: `state_event_stream_health_${suffix}`,
        source: {
          source_type: 'unit_test_event_stream_health',
          window_id: windowId,
          app_type: 'wechat'
        }
      });
      const stateWithTarget = {
        ...state,
        source_decision: {
          ...state.source_decision,
          target_person_id: targetPersonId,
          target_display_name: `Health${suffix.toUpperCase()}`
        }
      };
      const statePath = path.join(stateDir, `${stateWithTarget.state_id}.json`);
      writeFileSync(statePath, `${JSON.stringify(stateWithTarget, null, 2)}\n`, 'utf8');
      return {
        task_id: `feedback_health_window_${String(index + 1).padStart(3, '0')}`,
        window_id: windowId,
        app_type: 'wechat',
        target_person_id: targetPersonId,
        state_path: path.relative(root, statePath).replace(/\\/g, '/'),
        candidate_prefill_only: true,
        real_send_allowed: false,
        ready_for_real_feedback_target_write: false,
        status: 'pending_operator_real_window_review'
      };
    });
    const sessionPath = path.join(root, 'runtime/pt028-feedback-collection-sessions/session-for-health.json');
    mkdirSync(path.dirname(sessionPath), { recursive: true });
    writeFileSync(sessionPath, `${JSON.stringify({
      schema_version: 'pt028_feedback_collection_session.v1',
      session_id: 'pt028_feedback_collection_session_health_test',
      gate_decision: 'ready_for_operator_window_feedback_collection',
      ready_for_operator_feedback_collection: true,
      real_execution_allowed: false,
      real_send_attempted: false,
      writes_real_feedback_target: false,
      collection_scope: {
        task_count: 2,
        distinct_target_count: 2,
        candidate_prefill_only: true,
        all_real_send_disallowed: true
      },
      operator_collection_tasks: tasks
    }, null, 2)}\n`, 'utf8');

    const streamOutputDir = path.join(root, 'runtime/pt028-gui-event-streams/health-stream');
    const streamResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-gui-event-stream.mjs'),
      `--root=${root}`,
      `--session=${sessionPath}`,
      `--output-dir=${streamOutputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(streamResult.status, 0, streamResult.stderr || streamResult.stdout);

    const streamPath = path.join(streamOutputDir, 'pt028-gui-event-stream.json');
    const healthOutputDir = path.join(root, 'runtime/pt028-event-stream-health/health-check');
    const healthResult = spawnSync(process.execPath, [
      path.resolve('scripts/validate-pt028-event-stream-health.mjs'),
      `--root=${root}`,
      `--stream=${streamPath}`,
      `--output-dir=${healthOutputDir}`,
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(healthResult.status, 0, healthResult.stderr || healthResult.stdout);
    const stdout = JSON.parse(healthResult.stdout);
    assert.equal(stdout.command, 'validate-pt028-event-stream-health');
    assert.equal(stdout.gate_decision, 'event_stream_ready_for_low_latency_gui_subscription');
    assert.deepEqual(stdout.required_failures, []);
    assert.equal(stdout.event_count, 2);
    assert.equal(stdout.unique_window_count, 2);
    assert.equal(stdout.unique_target_count, 2);
    assert.equal(stdout.target_dispatch_latency_ms, 50);
    assert.equal(stdout.debounce_ms, 50);
    assert.equal(stdout.fallback_poll_interval_ms, 1000);
    assert.equal(stdout.real_execution_allowed, false);
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.equal(existsSync(stdout.json_path), true);
    assert.equal(existsSync(stdout.markdown_path), true);
    const health = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(health.schema_version, 'pt028_event_stream_health.v1');
    assert.ok(health.checks.every((item) => item.status === 'passed'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 multi-window feedback calibration keeps target contexts isolated', () => {
  const calibration = buildPt028MultiWindowFeedbackCalibration({
    calibrationId: 'pt028_multi_window_feedback_calibration_test'
  });

  assert.equal(calibration.schema_version, 'pt028_multi_window_feedback_calibration.v1');
  assert.equal(calibration.required_window_count, 2);
  assert.equal(calibration.required_unique_target_count, 2);
  assert.equal(calibration.window_count, 3);
  assert.equal(calibration.target_count, 3);
  assert.equal(calibration.multi_target_feedback_ready, true);
  assert.equal(calibration.no_cross_target_state_reuse, true);
  assert.equal(calibration.prompt_only_all_windows, true);
  assert.equal(calibration.real_execution_allowed, false);
  assert.equal(calibration.real_send_attempted, false);
  assert.ok(calibration.required_open_items.includes('real_operator_feedback_missing_for_one_or_more_windows'));
  assert.ok(calibration.calibration_rows.every((row) => row.isolation_check.state_target_matches_window_target));
  assert.ok(calibration.calibration_rows.some((row) => row.calibration_result.calibrated_cadence === 'hold_and_surface_safety_review'));
});

test('PT-028 final special acceptance blocks production until real feedback and human review exist', () => {
  const state = buildPt028GuiDecisionState({
    stateId: 'pt028_gui_decision_state_acceptance_test'
  });
  const eventStream = buildPt028GuiEventStream({
    states: [state],
    streamId: 'pt028_gui_event_stream_acceptance_test'
  });
  const feedbackCalibration = buildPt028MultiWindowFeedbackCalibration({
    calibrationId: 'pt028_multi_window_feedback_calibration_acceptance_test'
  });
  const acceptance = buildPt028FinalSpecialAcceptance({
    guiState: state,
    eventStream,
    feedbackCalibration,
    audit: {
      audit_id: 'pt028_audit_acceptance_test',
      core_runtime_stage_tests_passed: true,
      real_execution_allowed: false,
      real_send_attempted: false
    },
    acceptanceId: 'pt028_final_special_acceptance_test'
  });

  assert.equal(acceptance.schema_version, 'pt028_final_special_acceptance.v1');
  assert.equal(acceptance.gate_decision, 'blocked_pending_real_special_acceptance_evidence');
  assert.equal(acceptance.pt028_fully_accepted_for_production, false);
  assert.equal(acceptance.real_execution_allowed, false);
  assert.ok(acceptance.checks.find((check) => check.check_id === 'low_latency_event_stream')?.status === 'passed');
  assert.ok(
    acceptance.checks.find((check) =>
      check.check_id === 'feedback_bound_multi_window_event_stream'
    )?.status === 'open'
  );
  assert.ok(acceptance.checks.find((check) => check.check_id === 'multi_window_context_isolation')?.status === 'passed');
  assert.ok(
    acceptance.required_failures.some((failure) =>
      failure.check_id === 'feedback_bound_multi_window_event_stream'
    )
  );
  assert.ok(acceptance.required_failures.some((failure) => failure.check_id === 'real_feedback_readiness_gate'));
  assert.ok(acceptance.required_failures.some((failure) => failure.check_id === 'real_feedback_calibration_evidence'));
  assert.ok(acceptance.required_failures.some((failure) => failure.check_id === 'final_human_special_review'));
});

test('PT-028 final special acceptance can pass with complete real multi-window feedback and human review', () => {
  function stateForTarget({ stateId, windowId, targetPersonId, targetDisplayName }) {
    const state = buildPt028GuiDecisionState({
      stateId,
      source: {
        source_type: 'unit_test_real_feedback_state',
        window_id: windowId,
        app_type: 'wechat'
      }
    });
    return {
      ...state,
      source_decision: {
        ...state.source_decision,
        target_person_id: targetPersonId,
        target_display_name: targetDisplayName
      }
    };
  }

  const windowSpecs = [
    { windowId: 'real_window_a', stateId: 'state_real_a', targetPersonId: 'person_real_a', targetDisplayName: 'RealA', signal: 'warm_or_positive', decision: 'prompt_accepted_for_manual_edit' },
    { windowId: 'real_window_b', stateId: 'state_real_b', targetPersonId: 'person_real_b', targetDisplayName: 'RealB', signal: 'neutral_or_unknown', decision: 'needs_context_before_progression' },
    { windowId: 'real_window_c', stateId: 'state_real_c', targetPersonId: 'person_real_c', targetDisplayName: 'RealC', signal: 'pressure_or_boundary_risk', decision: 'hold_and_show_safety_prompt' }
  ];
  const windows = windowSpecs.map((spec) => ({
    window_id: spec.windowId,
    app_type: 'wechat',
    target_person_id: spec.targetPersonId,
    target_display_name: spec.targetDisplayName,
    state: stateForTarget(spec),
    feedback_record: {
      feedback_id: `feedback_${spec.windowId}`,
      source_type: 'human_reviewed_real_window_feedback',
      operator_decision: spec.decision,
      target_response_signal: spec.signal,
      real_window_observed: true,
      state_target_verified: true,
      prompt_only_confirmed: true,
      no_real_send_attempted: true,
      privacy_boundary_confirmed: true,
      reviewed_at: '2026-06-20T12:20:00+08:00',
      evidence_refs: [`runtime/pt028-gui-decision-states/${spec.stateId}/pt028-gui-decision-state.json`],
      notes: 'Human reviewer confirmed the real window state without exposing private raw text.'
    }
  }));
  const feedbackCalibration = buildPt028MultiWindowFeedbackCalibration({
    windows,
    calibrationId: 'pt028_multi_window_feedback_calibration_real_test'
  });
  const feedbackBatch = {
    schema_version: 'pt028_real_multi_window_operator_feedback.v1',
    feedback_batch_id: 'feedback_batch_real_test',
    created_at: '2026-06-20T12:20:00+08:00',
    reviewer: {
      reviewer_id: 'operator_real_test',
      role: 'operator',
      reviewed_at: '2026-06-20T12:20:00+08:00'
    },
    window_feedback_records: windows.map((window, index) => ({
      ...window.feedback_record,
      window_id: window.window_id,
      app_type: window.app_type,
      target_person_id: window.target_person_id,
      target_display_name: window.target_display_name,
      state_path: `runtime/pt028-gui-decision-states/${window.state.state_id}/pt028-gui-decision-state.json`,
      state_snapshot: window.state,
      evidence_refs: [`https://example.test/evidence/window-${index + 1}`]
    })),
    human_special_review: {
      approved_for_final_special_acceptance: true,
      reviewer_id: 'final_reviewer_real_test',
      reviewed_at: '2026-06-20T12:30:00+08:00',
      approval_scope: [
        'low_latency_event_stream',
        'real_multi_window_feedback_calibration',
        'prompt_only_send_gate',
        'privacy_boundary',
        'final_special_acceptance'
      ],
      notes: 'Human reviewer approved this unit-test acceptance fixture.'
    }
  };
  const realFeedbackReadiness = buildPt028RealFeedbackReadiness({
    feedbackBatch,
    feedbackPath: 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
    root: '.',
    pathExists: () => false
  });
  const guiState = windows[0].state;
  const eventStream = buildPt028GuiEventStream({
    states: windows.map((window) => ({ window_id: window.window_id, app_type: window.app_type, state: window.state })),
    streamId: 'pt028_gui_event_stream_real_feedback_test'
  });
  const acceptance = buildPt028FinalSpecialAcceptance({
    guiState,
    eventStream,
    feedbackCalibration,
    realFeedbackReadiness,
    audit: {
      audit_id: 'pt028_audit_real_feedback_test',
      core_runtime_stage_tests_passed: true,
      real_execution_allowed: false,
      real_send_attempted: false
    },
    acceptanceId: 'pt028_final_special_acceptance_real_test',
    source: {
      human_special_review_approved: true
    }
  });

  assert.equal(feedbackCalibration.schema_version, 'pt028_multi_window_feedback_calibration.v1');
  assert.equal(feedbackCalibration.state_binding_complete, true);
  assert.equal(feedbackCalibration.no_cross_target_state_reuse, true);
  assert.equal(feedbackCalibration.multi_target_feedback_ready, true);
  assert.equal(feedbackCalibration.prompt_only_all_windows, true);
  assert.equal(feedbackCalibration.real_feedback_record_count, 3);
  assert.deepEqual(feedbackCalibration.required_open_items, []);
  assert.equal(feedbackCalibration.gate_decision, 'ready_for_real_multi_window_feedback_review');
  assert.equal(realFeedbackReadiness.final_acceptance_ready, true);
  assert.deepEqual(realFeedbackReadiness.required_failures, []);
  assert.equal(acceptance.gate_decision, 'pt028_final_special_acceptance_passed');
  assert.equal(acceptance.pt028_fully_accepted_for_production, true);
  assert.deepEqual(acceptance.required_failures, []);
  assert.equal(acceptance.real_execution_allowed, false);
});

test('PT-028 real feedback rejects same-target multi-window evidence before final acceptance', () => {
  const baseState = buildPt028GuiDecisionState({
    stateId: 'state_same_target_a',
    source: {
      source_type: 'unit_test_same_target_feedback',
      window_id: 'same_target_window_a',
      app_type: 'wechat'
    }
  });
  const sameTargetId = 'person_same_target_real';
  const windows = ['a', 'b'].map((suffix) => {
    const state = {
      ...baseState,
      state_id: `state_same_target_${suffix}`,
      source: {
        ...baseState.source,
        window_id: `same_target_window_${suffix}`
      },
      source_decision: {
        ...baseState.source_decision,
        target_person_id: sameTargetId,
        target_display_name: 'SameTarget'
      }
    };
    return {
      window_id: `same_target_window_${suffix}`,
      app_type: 'wechat',
      target_person_id: sameTargetId,
      target_display_name: 'SameTarget',
      state,
      feedback_record: {
        feedback_id: `feedback_same_target_${suffix}`,
        source_type: 'human_reviewed_real_window_feedback',
        operator_decision: 'prompt_accepted_for_manual_edit',
        target_response_signal: 'warm_or_positive',
        real_window_observed: true,
        state_target_verified: true,
        prompt_only_confirmed: true,
        no_real_send_attempted: true,
        privacy_boundary_confirmed: true,
        reviewed_at: '2026-06-20T14:10:00+08:00',
        evidence_refs: [`https://example.test/same-target/${suffix}`],
        notes: 'Same-target regression fixture.'
      }
    };
  });
  const feedbackBatch = {
    schema_version: 'pt028_real_multi_window_operator_feedback.v1',
    feedback_batch_id: 'feedback_same_target_batch_test',
    created_at: '2026-06-20T14:10:00+08:00',
    reviewer: {
      reviewer_id: 'same_target_operator',
      role: 'operator',
      reviewed_at: '2026-06-20T14:10:00+08:00'
    },
    window_feedback_records: windows.map((window) => ({
      ...window.feedback_record,
      window_id: window.window_id,
      app_type: window.app_type,
      target_person_id: window.target_person_id,
      target_display_name: window.target_display_name,
      state_path: `runtime/pt028-gui-decision-states/${window.state.state_id}/pt028-gui-decision-state.json`,
      state_snapshot: window.state
    })),
    human_special_review: {
      approved_for_final_special_acceptance: true,
      reviewer_id: 'same_target_final_reviewer',
      reviewed_at: '2026-06-20T14:15:00+08:00',
      approval_scope: [
        'low_latency_event_stream',
        'real_multi_window_feedback_calibration',
        'prompt_only_send_gate',
        'privacy_boundary',
        'final_special_acceptance'
      ],
      notes: 'This approval must not override same-target coverage failure.'
    }
  };
  const readiness = buildPt028RealFeedbackReadiness({
    feedbackBatch,
    feedbackPath: 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
    root: '.'
  });
  const calibration = buildPt028MultiWindowFeedbackCalibration({
    windows,
    calibrationId: 'pt028_multi_window_feedback_calibration_same_target_test'
  });
  const eventStream = buildPt028GuiEventStream({
    states: windows.map((window) => ({ window_id: window.window_id, app_type: window.app_type, state: window.state })),
    streamId: 'pt028_gui_event_stream_same_target_test'
  });
  const acceptance = buildPt028FinalSpecialAcceptance({
    guiState: windows[0].state,
    eventStream,
    feedbackCalibration: calibration,
    realFeedbackReadiness: readiness,
    audit: {
      audit_id: 'pt028_audit_same_target_test',
      core_runtime_stage_tests_passed: true,
      real_execution_allowed: false,
      real_send_attempted: false
    },
    acceptanceId: 'pt028_final_special_acceptance_same_target_test',
    source: {
      human_special_review_approved: true
    }
  });

  assert.equal(readiness.unique_target_count, 1);
  assert.equal(readiness.required_unique_target_count, 2);
  assert.ok(readiness.required_failures.some((failure) =>
    failure.failure_id === 'minimum_unique_targets_required'
  ));
  assert.equal(readiness.final_acceptance_ready, false);
  assert.equal(calibration.target_count, 1);
  assert.equal(calibration.required_unique_target_count, 2);
  assert.equal(calibration.multi_target_feedback_ready, false);
  assert.ok(calibration.required_open_items.includes('need_at_least_two_unique_targets_for_multi_target_calibration'));
  assert.equal(eventStream.stream_integrity.unique_target_count, 1);
  assert.equal(acceptance.pt028_fully_accepted_for_production, false);
  assert.ok(
    acceptance.required_failures.some((failure) =>
      failure.check_id === 'feedback_bound_multi_window_event_stream'
    )
  );
  assert.ok(acceptance.required_failures.some((failure) => failure.check_id === 'multi_window_context_isolation'));
  assert.ok(acceptance.required_failures.some((failure) => failure.check_id === 'real_feedback_readiness_gate'));
});

test('PT-028 final acceptance CLI derives readiness and calibration from explicit feedback batch', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'zhineng-pt028-final-feedback-cli-'));
  try {
    mkdirSync(path.join(root, 'runtime/user-inputs'), { recursive: true });
    mkdirSync(path.join(root, 'runtime/pt028-real-feedback-readiness'), { recursive: true });
    mkdirSync(path.join(root, 'runtime/pt028-feedback-calibrations'), { recursive: true });
    mkdirSync(path.join(root, 'runtime/pt028-audits'), { recursive: true });

    writeFileSync(path.join(root, 'runtime/pt028-real-feedback-readiness/latest.json'), `${JSON.stringify({
      schema_version: 'pt028_real_feedback_readiness.v1',
      readiness_id: 'stale_readiness_should_not_be_used',
      final_acceptance_ready: false,
      real_execution_allowed: false,
      required_failures: [{ failure_id: 'stale_failure', severity: 'required_for_calibration' }]
    }, null, 2)}\n`, 'utf8');
    writeFileSync(path.join(root, 'runtime/pt028-feedback-calibrations/latest.json'), `${JSON.stringify({
      schema_version: 'pt028_multi_window_feedback_calibration.v1',
      calibration_id: 'stale_calibration_should_not_be_used',
      window_count: 3,
      target_count: 3,
      real_feedback_record_count: 0,
      no_cross_target_state_reuse: true,
      prompt_only_all_windows: true,
      required_open_items: ['real_operator_feedback_missing_for_one_or_more_windows']
    }, null, 2)}\n`, 'utf8');
    writeFileSync(path.join(root, 'runtime/pt028-audits/latest.json'), `${JSON.stringify({
      schema_version: 'pt028_romantic_flow_audit.v1',
      audit_id: 'pt028_audit_cli_feedback_test',
      core_runtime_stage_tests_passed: true,
      real_execution_allowed: false,
      real_send_attempted: false
    }, null, 2)}\n`, 'utf8');

    const records = ['a', 'b', 'c'].map((suffix, index) => {
      const targetPersonId = `person_final_cli_${suffix}`;
      const state = buildPt028GuiDecisionState({
        stateId: `state_final_cli_${suffix}`,
        source: {
          source_type: 'unit_test_final_acceptance_cli',
          window_id: `wechat_window_final_cli_${suffix}`,
          app_type: 'wechat'
        }
      });
      const stateSnapshot = {
        ...state,
        source_decision: {
          ...state.source_decision,
          target_person_id: targetPersonId,
          target_display_name: `Final${suffix.toUpperCase()}`
        }
      };
      return {
        feedback_id: `feedback_final_cli_${suffix}`,
        window_id: `wechat_window_final_cli_${suffix}`,
        app_type: 'wechat',
        target_person_id: targetPersonId,
        target_display_name: `Final${suffix.toUpperCase()}`,
        source_type: 'human_reviewed_real_window_feedback',
        operator_decision: index === 1
          ? 'needs_context_before_progression'
          : 'prompt_accepted_for_manual_edit',
        target_response_signal: index === 1
          ? 'neutral_or_unknown'
          : 'warm_or_positive',
        state_path: `runtime/pt028-gui-decision-states/state_final_cli_${suffix}/pt028-gui-decision-state.json`,
        state_snapshot: stateSnapshot,
        real_window_observed: true,
        state_target_verified: true,
        prompt_only_confirmed: true,
        no_real_send_attempted: true,
        privacy_boundary_confirmed: true,
        reviewed_at: '2026-06-20T13:45:00+08:00',
        evidence_refs: [`https://example.test/final-cli/${suffix}`],
        notes: 'Unit-test reviewed feedback.'
      };
    });
    const feedbackPath = path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json');
    writeFileSync(feedbackPath, `${JSON.stringify({
      schema_version: 'pt028_real_multi_window_operator_feedback.v1',
      feedback_batch_id: 'feedback_final_acceptance_cli_batch_test',
      created_at: '2026-06-20T13:45:00+08:00',
      reviewer: {
        reviewer_id: 'final_cli_operator',
        role: 'operator',
        reviewed_at: '2026-06-20T13:45:00+08:00'
      },
      window_feedback_records: records,
      human_special_review: {
        approved_for_final_special_acceptance: true,
        reviewer_id: 'final_cli_reviewer',
        reviewed_at: '2026-06-20T13:50:00+08:00',
        approval_scope: [
          'low_latency_event_stream',
          'real_multi_window_feedback_calibration',
          'prompt_only_send_gate',
          'privacy_boundary',
          'final_special_acceptance'
        ],
        notes: 'Unit test final approval.'
      }
    }, null, 2)}\n`, 'utf8');

    const outputDir = path.join(root, 'runtime/pt028-final-special-acceptance/final-cli');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/validate-pt028-final-special-acceptance.mjs'),
      `--root=${root}`,
      `--feedback=${feedbackPath}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'validate-pt028-final-special-acceptance');
    assert.equal(stdout.gate_decision, 'pt028_final_special_acceptance_passed');
    assert.equal(stdout.pt028_fully_accepted_for_production, true);
    assert.deepEqual(stdout.required_failures, []);
    assert.equal(stdout.event_stream_input_mode, 'real_feedback_batch_window_states');
    assert.equal(stdout.event_stream_window_count, 3);
    assert.equal(stdout.event_stream_target_count, 3);
    assert.equal(stdout.calibration_input_mode, 'real_feedback_batch_window_states');
    assert.equal(stdout.readiness_input_mode, 'real_feedback_batch');
    assert.equal(stdout.real_execution_allowed, false);

    const acceptance = JSON.parse(readFileSync(path.join(outputDir, 'pt028-final-special-acceptance.json'), 'utf8'));
    assert.equal(acceptance.linked_artifacts.real_feedback_readiness_id.startsWith('pt028_real_feedback_readiness_'), true);
    assert.equal(acceptance.linked_artifacts.feedback_calibration_id.startsWith('pt028_multi_window_feedback_calibration_'), true);
    assert.equal(acceptance.source.feedback_batch_id, 'feedback_final_acceptance_cli_batch_test');
    assert.equal(existsSync(acceptance.supporting_artifacts.event_stream_used_path), true);
    assert.equal(existsSync(acceptance.supporting_artifacts.real_feedback_readiness_used_path), true);
    assert.equal(existsSync(acceptance.supporting_artifacts.feedback_calibration_used_path), true);
    const usedEventStream = JSON.parse(readFileSync(acceptance.supporting_artifacts.event_stream_used_path, 'utf8'));
    const usedReadiness = JSON.parse(readFileSync(acceptance.supporting_artifacts.real_feedback_readiness_used_path, 'utf8'));
    const usedCalibration = JSON.parse(readFileSync(acceptance.supporting_artifacts.feedback_calibration_used_path, 'utf8'));
    assert.equal(usedEventStream.source.feedback_batch_id, 'feedback_final_acceptance_cli_batch_test');
    assert.equal(usedReadiness.source.feedback_path, feedbackPath);
    assert.equal(usedCalibration.source.feedback_batch_id, 'feedback_final_acceptance_cli_batch_test');
    assert.equal(usedReadiness.final_acceptance_ready, true);
    assert.equal(usedCalibration.real_feedback_record_count, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function preparePt028FeedbackWorkpackRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'zhineng-pt028-feedback-workpack-'));
  const stateDir = path.join(root, 'runtime/pt028-gui-decision-states/state_workpack_latest');
  const eventDir = path.join(root, 'runtime/pt028-gui-event-streams/stream_workpack_latest');
  const readinessDir = path.join(root, 'runtime/pt028-real-feedback-readiness/readiness_workpack_latest');
  const observationDirA = path.join(root, 'runtime/desktop-inbox-real/wechat-a');
  const observationDirB = path.join(root, 'runtime/desktop-inbox-real/wechat-b');
  const templateDir = path.join(root, 'runtime/user-inputs/templates');
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(eventDir, { recursive: true });
  mkdirSync(readinessDir, { recursive: true });
  mkdirSync(observationDirA, { recursive: true });
  mkdirSync(observationDirB, { recursive: true });
  mkdirSync(templateDir, { recursive: true });

  const statePath = path.join(stateDir, 'pt028-gui-decision-state.json');
  const state = {
    ...buildPt028GuiDecisionState({
      stateId: 'state_workpack_latest',
      source: {
        source_type: 'unit_test_real_window_projection',
        window_id: 'wechat_window_workpack_a',
        app_type: 'wechat'
      }
    }),
    output_paths: {
      json_path: statePath
    }
  };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(root, 'runtime/pt028-gui-decision-states/latest.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  const eventStreamPath = path.join(eventDir, 'pt028-gui-event-stream.json');
  const eventStream = {
    ...buildPt028GuiEventStream({
      states: [{ window_id: 'wechat_window_workpack_a', app_type: 'wechat', state }],
      streamId: 'stream_workpack_latest'
    }),
    output_paths: {
      json_path: eventStreamPath
    }
  };
  writeFileSync(eventStreamPath, `${JSON.stringify(eventStream, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(root, 'runtime/pt028-gui-event-streams/latest.json'), `${JSON.stringify(eventStream, null, 2)}\n`, 'utf8');

  const readiness = buildPt028RealFeedbackReadiness({
    feedbackBatch: null,
    feedbackPath: path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json'),
    root,
    readinessId: 'readiness_workpack_latest',
    pathExists: (candidate) => existsSync(candidate)
  });
  writeFileSync(path.join(readinessDir, 'pt028-real-feedback-readiness.json'), `${JSON.stringify(readiness, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(root, 'runtime/pt028-real-feedback-readiness/latest.json'), `${JSON.stringify(readiness, null, 2)}\n`, 'utf8');
  writeFileSync(
    path.join(templateDir, 'pt028-real-multi-window-operator-feedback.real.template.json'),
    `${JSON.stringify({ schema_version: 'pt028_real_multi_window_operator_feedback.v1', template_only: true }, null, 2)}\n`,
    'utf8'
  );
  writeFileSync(
    path.join(observationDirA, 'intake-observation.real.json'),
    `${JSON.stringify({
      observation_id: 'intake_obs_workpack_real_a',
      source_adapter_id: 'sightflow_desktop.wechat.ocr',
      source_type: 'desktop',
      platform: 'wechat',
      source_actor_type: 'human_contact',
      captured_at: '2026-06-20T12:35:00+08:00',
      raw_artifact_refs: ['runtime/desktop-inbox-real/wechat-a/window.png'],
      content_text: 'TargetA: warm current turn.',
      real_execution_allowed: false,
      real_send_attempted: false,
      content_summary: 'real window summary only',
      participants_hint: ['user', 'TargetA'],
      source_identity_hints: [
        {
          identity_type: 'thread_display_name',
          source_actor_type: 'human_contact',
          display_name: 'TargetA',
          thread_key: 'wechat:TargetA',
          confidence: 0.8
        }
      ],
      privacy_level: 'redacted_text',
      confidence: 0.82
    }, null, 2)}\n`,
    'utf8'
  );
  writeFileSync(
    path.join(observationDirB, 'intake-observation.real.json'),
    `${JSON.stringify({
      observation_id: 'intake_obs_workpack_real_b',
      source_adapter_id: 'sightflow_desktop.wechat.ocr',
      source_type: 'desktop',
      platform: 'wechat',
      source_actor_type: 'human_contact',
      captured_at: '2026-06-20T12:36:00+08:00',
      raw_artifact_refs: ['runtime/desktop-inbox-real/wechat-b/window.png'],
      content_text: 'TargetB: context still unclear.',
      real_execution_allowed: false,
      real_send_attempted: false,
      content_summary: 'real window summary only',
      participants_hint: ['user', 'TargetB'],
      source_identity_hints: [
        {
          identity_type: 'thread_display_name',
          source_actor_type: 'human_contact',
          display_name: 'TargetB',
          thread_key: 'wechat:TargetB',
          confidence: 0.8
        }
      ],
      privacy_level: 'redacted_text',
      confidence: 0.8
    }, null, 2)}\n`,
    'utf8'
  );

  return { root };
}

function buildCompletePt028FeedbackConfirmationDecision(root) {
  const initialWorkpack = buildPt028RealFeedbackWorkpack({
    root,
    workpackId: 'pt028_real_feedback_preflight_initial',
    createdAt: '2026-06-20T16:00:00+08:00'
  });
  writePt028RealFeedbackWorkpack({ workpack: initialWorkpack });

  const stateResult = spawnSync(process.execPath, [
    path.resolve('scripts/write-pt028-real-observation-gui-states.mjs'),
    `--root=${root}`,
    '--limit=2'
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(stateResult.status, 0, stateResult.stderr || stateResult.stdout);

  const refreshedWorkpack = buildPt028RealFeedbackWorkpack({
    root,
    workpackId: 'pt028_real_feedback_preflight_refreshed',
    createdAt: '2026-06-20T16:01:00+08:00',
    minimumWindowSlots: 2
  });
  const decision = buildPt028RealFeedbackConfirmationTemplate({
    workpack: refreshedWorkpack,
    decisionId: 'pt028_real_feedback_preflight_decision_complete',
    createdAt: '2026-06-20T16:02:00+08:00'
  });
  decision.operator_confirmation = {
    approved_to_write_real_feedback_target: true,
    reviewer_id: 'operator_preflight_reviewer',
    reviewed_at: '2026-06-20T16:03:00+08:00',
    confirm_real_windows_observed: true,
    confirm_target_binding: true,
    confirm_prompt_only: true,
    confirm_no_real_send: true,
    confirm_privacy_boundary: true,
    confirm_human_special_review: true,
    notes: 'Unit test confirms all prompt-only real feedback gates for preflight.'
  };
  decision.feedback_batch = {
    ...decision.feedback_batch,
    feedback_batch_id: 'pt028_real_feedback_preflight_batch_complete',
    created_at: '2026-06-20T16:03:00+08:00',
    reviewer: {
      reviewer_id: 'operator_preflight_reviewer',
      role: 'operator',
      reviewed_at: '2026-06-20T16:03:00+08:00'
    },
    window_feedback_records: decision.feedback_batch.window_feedback_records.map((record, index) => ({
      ...record,
      source_type: 'human_reviewed_real_window_feedback',
      operator_decision: index === 0
        ? 'prompt_accepted_for_manual_edit'
        : 'needs_context_before_progression',
      target_response_signal: index === 0
        ? 'warm_or_positive'
        : 'neutral_or_unknown',
      real_window_observed: true,
      state_target_verified: true,
      prompt_only_confirmed: true,
      no_real_send_attempted: true,
      privacy_boundary_confirmed: true,
      reviewed_at: '2026-06-20T16:03:00+08:00',
      evidence_refs: [
        record.state_path,
        record.candidate_observation_ref
      ].filter(Boolean),
      candidate_requires_operator_confirmation: false,
      notes: 'Human reviewer confirmed target binding and prompt-only state in the real window.'
    })),
    human_special_review: {
      approved_for_final_special_acceptance: true,
      reviewer_id: 'final_preflight_reviewer',
      reviewed_at: '2026-06-20T16:04:00+08:00',
      approval_scope: [
        'low_latency_event_stream',
        'real_multi_window_feedback_calibration',
        'prompt_only_send_gate',
        'privacy_boundary',
        'final_special_acceptance'
      ],
      notes: 'Unit test final reviewer approved the confirmation preflight.'
    }
  };
  return decision;
}

function writeReadyPt028CollectionCoverageFixture({ root, decisionPath, decision, coverageId }) {
  const outputDir = path.join(root, 'runtime/pt028-feedback-collection-coverages', coverageId);
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'pt028-feedback-collection-coverage.json');
  const latestPath = path.join(root, 'runtime/pt028-feedback-collection-coverages/latest.json');
  const records = decision.feedback_batch?.window_feedback_records ?? [];
  const relativeDecisionPath = path.relative(root, decisionPath).replace(/\\/g, '/');
  const coverage = {
    schema_version: 'pt028_feedback_collection_coverage.v1',
    coverage_id: coverageId,
    created_at: '2026-06-20T17:30:00+08:00',
    gate_decision: 'ready_for_confirmation_preflight',
    ready_for_confirmation_preflight: true,
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: false,
    source: {
      root,
      session_path: 'runtime/pt028-feedback-collection-sessions/test-session.json',
      decision_path: relativeDecisionPath,
      output_dir: path.relative(root, outputDir).replace(/\\/g, '/')
    },
    linked_session: {
      session_id: 'pt028_feedback_collection_session_test_ready',
      gate_decision: 'ready_for_operator_window_feedback_collection',
      ready_for_operator_feedback_collection: true,
      task_count: records.length,
      distinct_target_count: new Set(records.map((record) => record.target_person_id)).size
    },
    linked_decision: {
      decision_id: decision.decision_id,
      schema_version: decision.schema_version,
      record_count: records.length,
      approved_to_write_real_feedback_target: true
    },
    coverage_summary: {
      task_count: records.length,
      record_count: records.length,
      matched_task_count: records.length,
      confirmed_task_count: records.length,
      unmatched_task_ids: [],
      unconfirmed_task_ids: []
    },
    task_coverage: records.map((record, index) => ({
      task_id: `feedback_collection_window_${String(index + 1).padStart(3, '0')}`,
      status: 'covered_and_confirmed',
      record_pointer: `feedback_batch.window_feedback_records[${index}]`,
      checks: [
        { check_id: 'fixture_record_confirmed', status: 'passed', evidence: [record.window_id] }
      ]
    })),
    checks: [
      { check_id: 'fixture_collection_coverage_ready', status: 'passed', required: true, evidence: [relativeDecisionPath] }
    ],
    required_failures: [],
    warning_failures: [],
    next_commands: [
      `npm.cmd run pt028:feedback-confirm:preflight -- --decision=${relativeDecisionPath}`
    ],
    boundary_policy: {
      coverage_check_is_read_only: true,
      real_execution_allowed: false,
      real_send_attempted: false,
      writes_real_feedback_target: false
    },
    output_paths: {
      json_path: jsonPath,
      markdown_path: path.join(outputDir, 'pt028-feedback-collection-coverage.md'),
      latest_path: latestPath
    }
  };
  writeFileSync(jsonPath, `${JSON.stringify(coverage, null, 2)}\n`, 'utf8');
  writeFileSync(coverage.output_paths.markdown_path, '# Ready coverage fixture\n', 'utf8');
  mkdirSync(path.dirname(latestPath), { recursive: true });
  writeFileSync(latestPath, `${JSON.stringify(coverage, null, 2)}\n`, 'utf8');
  return jsonPath;
}

function writePt028CollectionSessionFixtureForDecision({ root, decision, sessionId }) {
  const outputDir = path.join(root, 'runtime/pt028-feedback-collection-sessions', sessionId);
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'pt028-feedback-collection-session.json');
  const latestPath = path.join(root, 'runtime/pt028-feedback-collection-sessions/latest.json');
  const records = decision.feedback_batch?.window_feedback_records ?? [];
  const session = {
    schema_version: 'pt028_feedback_collection_session.v1',
    session_id: sessionId,
    created_at: '2026-06-20T17:35:00+08:00',
    gate_decision: 'ready_for_operator_window_feedback_collection',
    ready_for_operator_feedback_collection: true,
    real_execution_allowed: false,
    real_send_attempted: false,
    writes_real_feedback_target: false,
    source: {
      root,
      handoff_path: null,
      pack_path: null,
      output_dir: path.relative(root, outputDir).replace(/\\/g, '/')
    },
    collection_scope: {
      required_window_count: 2,
      required_unique_target_count: 2,
      task_count: records.length,
      distinct_target_count: new Set(records.map((record) => record.target_person_id)).size,
      candidate_prefill_only: true,
      all_real_send_disallowed: true
    },
    operator_collection_tasks: records.map((record, index) => ({
      task_id: `feedback_collection_window_${String(index + 1).padStart(3, '0')}`,
      checklist_row_id: `operator_feedback_window_${String(index + 1).padStart(3, '0')}`,
      slot_index: index + 1,
      app_type: record.app_type ?? 'wechat',
      window_id: record.window_id,
      target_person_id: record.target_person_id,
      target_display_name_hint: record.target_display_name ?? null,
      draft_record_pointer: `draft.window_feedback_records[${index}]`,
      decision_template_record_pointer: `feedback_batch.window_feedback_records[${index}]`,
      state_path: record.state_path,
      evidence_refs: record.evidence_refs ?? [],
      required_operator_confirmations: [
        'real_window_observed',
        'state_target_verified',
        'prompt_only_confirmed',
        'no_real_send_attempted',
        'privacy_boundary_confirmed',
        'reviewed_at',
        'evidence_refs'
      ],
      candidate_prefill_only: true,
      real_send_allowed: false,
      ready_for_real_feedback_target_write: false,
      status: 'pending_operator_real_window_review'
    })),
    checks: [],
    required_failures: [],
    next_commands: [],
    boundary_policy: {
      session_is_read_only: true,
      real_execution_allowed: false,
      real_send_attempted: false,
      writes_real_feedback_target: false
    }
  };
  writeFileSync(jsonPath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
  writeFileSync(latestPath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
  return jsonPath;
}

function preparePt028FinalReviewSourceArtifacts({ root, label }) {
  const commands = [
    {
      script: 'write-pt028-final-feedback-decision-pack.mjs',
      args: [
        `--root=${root}`,
        `--output-dir=${path.join(root, `runtime/pt028-final-feedback-decision-packs/${label}-decision-pack`)}`
      ]
    },
    {
      script: 'validate-pt028-feedback-handoff.mjs',
      args: [
        `--root=${root}`,
        `--output-dir=${path.join(root, `runtime/pt028-feedback-handoff-validations/${label}-handoff`)}`
      ]
    },
    {
      script: 'write-pt028-feedback-collection-session.mjs',
      args: [
        `--root=${root}`,
        `--output-dir=${path.join(root, `runtime/pt028-feedback-collection-sessions/${label}-session`)}`
      ]
    },
    {
      script: 'write-pt028-gui-event-stream.mjs',
      args: [
        `--root=${root}`,
        '--session=runtime/pt028-feedback-collection-sessions/latest.json',
        `--output-dir=${path.join(root, `runtime/pt028-gui-event-streams/${label}-stream`)}`
      ]
    },
    {
      script: 'validate-pt028-event-stream-health.mjs',
      args: [
        `--root=${root}`,
        '--stream=runtime/pt028-gui-event-streams/latest.json',
        `--output-dir=${path.join(root, `runtime/pt028-event-stream-health/${label}-health`)}`,
        '--fail-on-required'
      ]
    },
    {
      script: 'validate-pt028-feedback-collection-coverage.mjs',
      args: [
        `--root=${root}`,
        `--output-dir=${path.join(root, `runtime/pt028-feedback-collection-coverages/${label}-coverage`)}`
      ]
    },
    {
      script: 'run-pt028-real-feedback-finalization.mjs',
      args: [
        `--root=${root}`,
        `--output-dir=${path.join(root, `runtime/pt028-real-feedback-finalizations/${label}-finalization`)}`
      ]
    }
  ];

  for (const command of commands) {
    const result = spawnSync(process.execPath, [
      path.resolve('scripts', command.script),
      ...command.args
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
}

test('PT-028 real feedback workpack prepares draft collection without writing real feedback target', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const workpack = buildPt028RealFeedbackWorkpack({
      root,
      workpackId: 'pt028_real_feedback_workpack_unit_test',
      createdAt: '2026-06-20T12:40:00+08:00'
    });
    assert.equal(workpack.schema_version, 'pt028_real_feedback_workpack.v1');
    assert.equal(workpack.gate_decision, 'pt028_real_feedback_workpack_ready_for_operator_collection');
    assert.equal(workpack.real_execution_allowed, false);
    assert.equal(workpack.real_send_attempted, false);
    assert.equal(workpack.writes_real_feedback_target, false);
    assert.equal(workpack.source.target_feedback_exists, false);
    assert.equal(workpack.acceptance_closure_plan.schema_version, 'pt028_acceptance_closure_plan.v1');
    assert.equal(workpack.acceptance_closure_plan.production_acceptance_ready, false);
    assert.equal(workpack.acceptance_closure_plan.can_be_completed_without_human_input, false);
    assert.equal(
      workpack.acceptance_closure_plan.no_real_send_boundary.workpack_writes_real_feedback_target,
      false
    );
    assert.equal(
      workpack.acceptance_closure_plan.low_latency_event_stream.status,
      'needs_real_feedback_bound_event_stream'
    );
    assert.equal(
      workpack.acceptance_closure_plan.real_multi_window_feedback.status,
      'waiting_for_operator_feedback'
    );
    assert.equal(
      workpack.missing_target_collection_plan.schema_version,
      'pt028_missing_target_collection_plan.v1'
    );
    assert.equal(
      workpack.missing_target_collection_plan.gate_decision,
      'missing_distinct_target_real_window_required'
    );
    assert.equal(workpack.missing_target_collection_plan.required_additional_unique_target_count, 2);
    assert.equal(workpack.missing_target_collection_plan.operator_capture_tasks.length, 2);
    assert.equal(workpack.missing_target_collection_plan.real_execution_allowed, false);
    assert.equal(workpack.missing_target_collection_plan.real_send_attempted, false);
    assert.equal(workpack.missing_target_collection_plan.writes_real_feedback_target, false);
    assert.ok(
      workpack.acceptance_closure_plan.ordered_next_actions
        .some((item) => item.includes('different target_person_id'))
    );
    assert.equal(
      workpack.evidence_summary.latest_gui_state.dock_status_text,
      'R2/O3/F0 · micro_progression · prompt-only'
    );
    assert.equal(workpack.window_review_tasks.length, 3);
    assert.equal(workpack.window_review_tasks[0].state_path_hint.endsWith('pt028-gui-decision-state.json'), true);
    assert.equal(
      workpack.window_review_tasks[0].dock_status_text_hint,
      'R2/O3/F0 · micro_progression · prompt-only'
    );
    assert.equal(workpack.candidate_desktop_observations.length, 2);
    assert.equal(
      workpack.candidate_desktop_observations.every((item) =>
        item.candidate_for_feedback_evidence === true
          && item.requires_operator_confirmation === true
      ),
      true
    );
    assert.ok(
      workpack.checks.some((check) =>
        check.check_id === 'candidate_desktop_observations_available_for_operator_review'
          && check.status === 'passed'
          && check.severity === 'warning'
      )
    );
    assert.equal(workpack.draft_feedback_batch.window_feedback_records.length, 3);
    const firstDraftRecord = workpack.draft_feedback_batch.window_feedback_records[0];
    assert.equal(firstDraftRecord.real_window_observed, false);
    assert.equal(firstDraftRecord.state_target_verified, false);
    assert.equal(firstDraftRecord.prompt_only_confirmed, false);
    assert.equal(firstDraftRecord.no_real_send_attempted, false);
    assert.equal(firstDraftRecord.privacy_boundary_confirmed, false);
    assert.equal(firstDraftRecord.candidate_evidence_prefilled, true);
    assert.equal(firstDraftRecord.candidate_requires_operator_confirmation, true);
    const firstCandidate = workpack.candidate_desktop_observations
      .find((item) => item.candidate_for_feedback_evidence);
    assert.equal(
      firstDraftRecord.candidate_observation_ref,
      firstCandidate.observation_path
    );
    assert.deepEqual(firstDraftRecord.evidence_refs, [
      firstCandidate.observation_path,
      ...firstCandidate.raw_artifact_refs
    ]);
    assert.equal(
      firstDraftRecord.state_path.includes('REPLACE_WITH'),
      true
    );
    const draftReadiness = buildPt028RealFeedbackReadiness({
      feedbackBatch: workpack.draft_feedback_batch,
      root,
      pathExists: existsSync,
      readJson: (file) => JSON.parse(readFileSync(file, 'utf8'))
    });
    assert.equal(draftReadiness.final_acceptance_ready, false);
    assert.ok(
      draftReadiness.required_failures.some((failure) =>
        failure.failure_id === 'placeholder_values_present'
      )
    );
    assert.ok(
      draftReadiness.required_failures.some((failure) =>
        failure.failure_id === 'feedback_evidence_incomplete'
      )
    );
    assert.ok(workpack.next_commands.some((command) => command.includes('pt028:feedback-readiness')));

    const written = writePt028RealFeedbackWorkpack({ workpack });
    assert.equal(existsSync(written.workpack_json_path), true);
    assert.equal(existsSync(written.workpack_markdown_path), true);
    assert.equal(existsSync(written.draft_feedback_path), true);
    assert.equal(
      existsSync(path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json')),
      false
    );
    const savedDraft = JSON.parse(readFileSync(written.draft_feedback_path, 'utf8'));
    assert.equal(savedDraft.human_special_review.approved_for_final_special_acceptance, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 real feedback workpack indexes future source lanes without writing target', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const browserDir = path.join(root, 'runtime/browser-intake-real/web-human-chat');
    mkdirSync(browserDir, { recursive: true });
    writeFileSync(
      path.join(browserDir, 'intake-observation.real.json'),
      `${JSON.stringify({
        observation_id: 'intake_obs_browser_human_chat_real_a',
        source_adapter_id: 'browser_dom.next',
        source_type: 'browser',
        platform: 'web',
        source_actor_type: 'human_contact',
        captured_at: '2026-06-20T12:37:00+08:00',
        raw_artifact_refs: ['runtime/browser-intake-real/web-human-chat/page.html'],
        content_text: 'WebTarget: saved human chat page with a warm but separate target.',
        real_execution_allowed: false,
        real_send_attempted: false,
        content_summary: 'saved browser human chat page summary',
        participants_hint: ['user', 'WebTarget'],
        source_identity_hints: [
          {
            identity_type: 'page_contact_name',
            source_actor_type: 'human_contact',
            display_name: 'WebTarget',
            thread_key: 'web:WebTarget',
            confidence: 0.76
          }
        ],
        privacy_level: 'redacted_text',
        confidence: 0.8
      }, null, 2)}\n`,
      'utf8'
    );

    const workpack = buildPt028RealFeedbackWorkpack({
      root,
      workpackId: 'pt028_real_feedback_workpack_source_lane_unit_test',
      createdAt: '2026-06-20T12:45:00+08:00'
    });
    assert.equal(workpack.candidate_source_lane_summary.schema_version, 'pt028_candidate_source_lane_summary.v1');
    assert.equal(workpack.candidate_source_observations.length, workpack.candidate_desktop_observations.length);
    assert.ok(
      workpack.candidate_source_observations.some((item) =>
        item.source_lane === 'browser_saved_human_chat_page'
          && item.candidate_for_feedback_evidence === true
          && item.candidate_blockers.length === 0
      )
    );
    const browserLane = workpack.candidate_source_lane_summary.lanes
      .find((lane) => lane.source_lane === 'browser_saved_human_chat_page');
    assert.equal(browserLane.scanned_observation_count, 1);
    assert.equal(browserLane.candidate_for_feedback_count, 1);
    assert.equal(browserLane.identity_confirmation_required_count, 0);
    assert.ok(
      workpack.missing_target_collection_plan.source_lane_summary.lanes
        .some((lane) => lane.source_lane === 'browser_saved_human_chat_page')
    );
    assert.equal(workpack.real_execution_allowed, false);
    assert.equal(workpack.real_send_attempted, false);
    assert.equal(workpack.writes_real_feedback_target, false);
    const written = writePt028RealFeedbackWorkpack({ workpack });
    assert.equal(existsSync(written.draft_feedback_path), true);
    assert.equal(
      existsSync(path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json')),
      false
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 real observation GUI states prefill workpack state paths without passing readiness', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const initialWorkpack = buildPt028RealFeedbackWorkpack({
      root,
      workpackId: 'pt028_real_feedback_workpack_state_prefill_initial',
      createdAt: '2026-06-20T12:41:00+08:00'
    });
    writePt028RealFeedbackWorkpack({ workpack: initialWorkpack });

    const result = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-real-observation-gui-states.mjs'),
      `--root=${root}`,
      '--limit=2'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'write-pt028-real-observation-gui-states');
    assert.equal(stdout.generated_state_count, 2);
    assert.equal(stdout.target_coverage_status, 'sufficient_for_multi_target_candidate_review');
    assert.equal(stdout.observed_unique_target_count, 2);
    assert.equal(stdout.required_unique_target_count, 2);
    assert.equal(stdout.real_execution_allowed, false);
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.equal(existsSync(stdout.json_path), true);

    const refreshedWorkpack = buildPt028RealFeedbackWorkpack({
      root,
      workpackId: 'pt028_real_feedback_workpack_state_prefill_refreshed',
      createdAt: '2026-06-20T12:42:00+08:00'
    });
    assert.ok(
      refreshedWorkpack.candidate_desktop_observations.some((item) =>
        item.candidate_state_available === true
          && item.candidate_state_path?.includes('runtime/pt028-real-observation-gui-states/')
      )
    );
    assert.ok(
      refreshedWorkpack.checks.some((check) =>
        check.check_id === 'candidate_gui_states_available_for_operator_review'
          && check.status === 'passed'
          && check.severity === 'warning'
      )
    );
    assert.ok(
      refreshedWorkpack.checks.some((check) =>
        check.check_id === 'candidate_target_coverage_ready_for_multi_target_review'
          && check.status === 'passed'
          && check.severity === 'warning'
      )
    );
    assert.equal(
      refreshedWorkpack.candidate_target_coverage.ready_for_multi_target_real_feedback_collection,
      true
    );
    assert.equal(
      refreshedWorkpack.missing_target_collection_plan.gate_decision,
      'multi_target_candidate_coverage_ready_for_operator_review'
    );
    assert.equal(refreshedWorkpack.missing_target_collection_plan.required_additional_unique_target_count, 0);
    assert.equal(refreshedWorkpack.missing_target_collection_plan.operator_capture_tasks.length, 0);
    const firstDraftRecord = refreshedWorkpack.draft_feedback_batch.window_feedback_records[0];
    assert.equal(firstDraftRecord.candidate_state_prefilled, true);
    assert.equal(firstDraftRecord.state_path.includes('runtime/pt028-real-observation-gui-states/'), true);
    assert.equal(firstDraftRecord.state_path.includes('REPLACE_WITH'), false);
    assert.equal(firstDraftRecord.window_id.includes('REPLACE_WITH'), false);
    assert.equal(firstDraftRecord.target_person_id.includes('REPLACE_WITH'), false);
    assert.equal(firstDraftRecord.real_window_observed, false);
    assert.equal(firstDraftRecord.state_target_verified, false);
    assert.equal(firstDraftRecord.prompt_only_confirmed, false);
    assert.equal(firstDraftRecord.no_real_send_attempted, false);
    assert.equal(firstDraftRecord.privacy_boundary_confirmed, false);

    const draftReadiness = buildPt028RealFeedbackReadiness({
      feedbackBatch: refreshedWorkpack.draft_feedback_batch,
      root,
      pathExists: existsSync,
      readJson: (file) => JSON.parse(readFileSync(file, 'utf8'))
    });
    assert.equal(draftReadiness.final_acceptance_ready, false);
    assert.ok(
      draftReadiness.required_failures.some((failure) =>
        failure.failure_id === 'feedback_evidence_incomplete'
      )
    );
    assert.ok(
      draftReadiness.required_failures.some((failure) =>
        failure.failure_id === 'human_special_review_missing_or_not_approved'
      )
    );
    assert.equal(
      existsSync(path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json')),
      false
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 real observation GUI states report target coverage gap for same-target candidates', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const observationBPath = path.join(root, 'runtime/desktop-inbox-real/wechat-b/intake-observation.real.json');
    const observationB = JSON.parse(readFileSync(observationBPath, 'utf8'));
    observationB.content_text = 'TargetA: another real window for the same target.';
    observationB.content_summary = 'real window summary for same target only';
    observationB.participants_hint = ['user', 'TargetA'];
    observationB.source_identity_hints = [
      {
        identity_type: 'thread_display_name',
        source_actor_type: 'human_contact',
        display_name: 'TargetA',
        thread_key: 'wechat:TargetA',
        confidence: 0.8
      }
    ];
    writeFileSync(observationBPath, `${JSON.stringify(observationB, null, 2)}\n`, 'utf8');

    const initialWorkpack = buildPt028RealFeedbackWorkpack({
      root,
      workpackId: 'pt028_real_feedback_workpack_same_target_initial',
      createdAt: '2026-06-20T12:43:00+08:00'
    });
    writePt028RealFeedbackWorkpack({ workpack: initialWorkpack });

    const result = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-real-observation-gui-states.mjs'),
      `--root=${root}`,
      '--limit=2'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.target_coverage_status, 'multi_window_single_target_needs_additional_target');
    assert.equal(stdout.observed_unique_target_count, 1);
    assert.equal(stdout.required_unique_target_count, 2);

    const manifest = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(manifest.target_coverage.ready_for_multi_target_real_feedback_collection, false);
    assert.ok(manifest.target_coverage.required_next_actions.length >= 1);

    const refreshedWorkpack = buildPt028RealFeedbackWorkpack({
      root,
      workpackId: 'pt028_real_feedback_workpack_same_target_refreshed',
      createdAt: '2026-06-20T12:44:00+08:00'
    });
    assert.equal(
      refreshedWorkpack.candidate_target_coverage.ready_for_multi_target_real_feedback_collection,
      false
    );
    assert.equal(
      refreshedWorkpack.acceptance_closure_plan.real_multi_window_feedback.candidate_multi_target_ready,
      false
    );
    assert.equal(
      refreshedWorkpack.missing_target_collection_plan.gate_decision,
      'missing_distinct_target_real_window_required'
    );
    assert.equal(refreshedWorkpack.missing_target_collection_plan.required_additional_unique_target_count, 1);
    assert.equal(refreshedWorkpack.missing_target_collection_plan.operator_capture_tasks.length, 1);
    assert.deepEqual(
      refreshedWorkpack.missing_target_collection_plan.operator_capture_tasks[0]
        .must_be_different_from_target_person_ids,
      refreshedWorkpack.missing_target_collection_plan.covered_target_person_ids
    );
    assert.ok(
      refreshedWorkpack.missing_target_collection_plan.forbidden_inputs
        .includes('same_target_person_id_as_existing_coverage')
    );
    assert.ok(
      refreshedWorkpack.acceptance_closure_plan.ordered_next_actions
        .some((item) => item.includes('additional real human-contact desktop window'))
    );
    assert.ok(
      refreshedWorkpack.checks.some((check) =>
        check.check_id === 'candidate_target_coverage_ready_for_multi_target_review'
          && check.status === 'open'
          && check.severity === 'warning'
      )
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 real feedback workpack CLI writes worksheet and draft only', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const outputDir = path.join(root, 'runtime/pt028-real-feedback-workpacks/cli-workpack');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-real-feedback-workpack.mjs'),
      `--root=${root}`,
      `--output-dir=${outputDir}`,
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'write-pt028-real-feedback-workpack');
    assert.equal(stdout.gate_decision, 'pt028_real_feedback_workpack_ready_for_operator_collection');
    assert.equal(stdout.real_execution_allowed, false);
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.equal(existsSync(stdout.draft_feedback_path), true);
    assert.equal(existsSync(path.join(outputDir, 'pt028-real-feedback-workpack.json')), true);
    assert.equal(
      existsSync(path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json')),
      false
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 real feedback confirmation CLI writes a decision template only by default', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const outputDir = path.join(root, 'runtime/pt028-real-feedback-confirmations/template-only');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/confirm-pt028-real-feedback.mjs'),
      `--root=${root}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'confirm-pt028-real-feedback');
    assert.equal(stdout.gate_decision, 'operator_confirmation_required_before_target_write');
    assert.equal(stdout.writes_real_feedback_target_allowed, false);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.equal(stdout.real_execution_allowed, false);
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(existsSync(stdout.decision_template_path), true);
    assert.equal(existsSync(stdout.json_path), true);
    assert.ok(stdout.required_failures.includes('operator_approved_target_write'));
    assert.ok(stdout.required_failures.includes('no_placeholder_values'));
    assert.equal(
      existsSync(path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json')),
      false
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 real feedback confirmation preflight reports incomplete template without target write', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const templateDir = path.join(root, 'runtime/pt028-real-feedback-confirmations/template-for-preflight');
    const templateRun = spawnSync(process.execPath, [
      path.resolve('scripts/confirm-pt028-real-feedback.mjs'),
      `--root=${root}`,
      `--output-dir=${templateDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(templateRun.status, 0, templateRun.stderr || templateRun.stdout);
    const templateStdout = JSON.parse(templateRun.stdout);

    const outputDir = path.join(root, 'runtime/pt028-feedback-confirmation-preflights/incomplete');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/preflight-pt028-real-feedback-confirmation.mjs'),
      `--root=${root}`,
      `--decision=${templateStdout.decision_template_path}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'preflight-pt028-real-feedback-confirmation');
    assert.equal(stdout.gate_decision, 'confirmation_decision_needs_attention');
    assert.equal(stdout.ready_for_controlled_target_write, false);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.equal(stdout.real_execution_allowed, false);
    assert.equal(stdout.real_send_attempted, false);
    assert.ok(stdout.required_failures.includes('operator_approved_target_write'));
    assert.ok(stdout.required_failures.includes('no_placeholder_values'));
    assert.equal(existsSync(stdout.json_path), true);
    assert.equal(existsSync(stdout.markdown_path), true);
    assert.equal(
      existsSync(path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json')),
      false
    );

    const preflight = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(preflight.schema_version, 'pt028_feedback_confirmation_preflight.v1');
    assert.equal(preflight.boundary_policy.preflight_never_writes_real_feedback_target, true);
    assert.ok(preflight.placeholder_or_missing_field_groups.length >= 1);
    assert.ok(preflight.next_commands.some((command) => command.includes('feedback-confirm:preflight')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 real feedback confirmation preflight can pass without writing target', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const decision = buildCompletePt028FeedbackConfirmationDecision(root);
    const decisionPath = path.join(root, 'runtime/user-inputs/pt028-real-feedback-confirmation-decision.preflight.json');
    mkdirSync(path.dirname(decisionPath), { recursive: true });
    writeFileSync(decisionPath, `${JSON.stringify(decision, null, 2)}\n`, 'utf8');
    const coveragePath = writeReadyPt028CollectionCoverageFixture({
      root,
      decisionPath,
      decision,
      coverageId: 'pt028_feedback_collection_coverage_preflight_ready'
    });

    const outputDir = path.join(root, 'runtime/pt028-feedback-confirmation-preflights/complete');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/preflight-pt028-real-feedback-confirmation.mjs'),
      `--root=${root}`,
      `--decision=${decisionPath}`,
      `--coverage=${coveragePath}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.gate_decision, 'confirmation_decision_ready_for_controlled_target_write');
    assert.equal(stdout.ready_for_controlled_target_write, true);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.deepEqual(stdout.required_failures, []);
    assert.equal(
      existsSync(path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json')),
      false
    );

    const preflight = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(preflight.collection_coverage_summary.ready_for_confirmation_preflight, true);
    assert.equal(preflight.boundary_policy.controlled_target_writer.includes('pt028:feedback-confirm'), true);
    assert.ok(preflight.next_commands.some((command) => command.includes('pt028:feedback-confirm')));
    assert.ok(preflight.next_commands.some((command) => command.includes('pt028:acceptance-chain')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 final feedback decision pack consolidates next human actions without writing target', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const targetPath = path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json');
    const outputDir = path.join(root, 'runtime/pt028-final-feedback-decision-packs/pack-cli');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-final-feedback-decision-pack.mjs'),
      `--root=${root}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'write-pt028-final-feedback-decision-pack');
    assert.equal(stdout.gate_decision, 'operator_feedback_decision_required');
    assert.equal(stdout.target_feedback_exists, false);
    assert.equal(stdout.pt028_fully_accepted_for_production, false);
    assert.equal(stdout.real_execution_allowed, false);
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.ok(stdout.required_failures.includes('feedback_bound_multi_window_event_stream'));
    assert.ok(stdout.required_failures.includes('real_feedback_readiness_gate'));
    assert.equal(existsSync(path.join(root, stdout.decision_template_path)), true);
    assert.equal(existsSync(stdout.json_path), true);
    assert.equal(existsSync(stdout.markdown_path), true);
    assert.equal(existsSync(stdout.html_path), true);
    assert.equal(existsSync(targetPath), false);

    const pack = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(pack.schema_version, 'pt028_final_feedback_decision_pack.v1');
    assert.equal(pack.boundary_policy.command_is_read_only_to_target_feedback_file, true);
    assert.equal(pack.target_write_allowed_by_this_command, false);
    assert.equal(pack.output_paths.html_path, stdout.html_path);
    assert.equal(
      pack.operator_feedback_window_checklist.schema_version,
      'pt028_operator_feedback_window_checklist.v1'
    );
    assert.ok(pack.operator_feedback_window_checklist.rows.length >= 2);
    assert.equal(pack.operator_feedback_window_checklist.boundary_policy.candidate_prefill_only, true);
    assert.equal(pack.operator_feedback_window_checklist.boundary_policy.real_send_allowed, false);
    assert.equal(pack.operator_feedback_window_checklist.rows[0].candidate_prefill_only, true);
    assert.equal(
      pack.operator_feedback_window_checklist.rows[0].confirmation_status.prompt_only_confirmed,
      false
    );
    const reviewAction = pack.required_human_actions
      .find((action) => action.action_id === 'review_candidate_real_windows');
    assert.equal(reviewAction.title, '审查真实桌面窗口候选证据');
    assert.equal(existsSync(path.join(root, reviewAction.artifact_path)), true);
    assert.ok(pack.required_human_actions.some((action) => action.action_id === 'complete_confirmation_decision_template'));
    assert.ok(pack.required_human_actions.some((action) => action.action_id === 'preflight_confirmation_decision_template'));
    assert.ok(pack.required_human_actions.some((action) => (
      action.action_id === 'complete_confirmation_decision_template'
      && action.command_after_completion.includes('pt028:feedback-finalize')
    )));
    assert.ok(pack.required_human_actions.some((action) => (
      action.action_id === 'write_real_feedback_target_through_confirmation_gate'
      && action.command_after_completion.includes('pt028:feedback-finalize')
    )));
    assert.ok(pack.required_human_actions.some((action) => (
      action.action_id === 'rerun_acceptance_chain_with_feedback'
      && action.command_after_completion.includes('pt028:feedback-finalize')
    )));
    assert.ok(pack.next_commands.some((command) => command.includes('pt028:feedback-finalize')));
    assert.ok(pack.next_commands.some((command) => command.includes('pt028:feedback-confirm:preflight')));
    assert.ok(pack.required_human_actions.some((action) => action.action_id === 'rerun_acceptance_chain_with_feedback'));
    assert.ok(pack.next_commands.some((command) => command.includes('pt028:feedback-confirm')));
    assert.ok(pack.next_commands.some((command) => command.includes('pt028:acceptance-chain')));
    assert.equal(existsSync(path.join(root, pack.artifact_refs.workpack_json_path)), true);
    assert.equal(existsSync(path.join(root, pack.artifact_refs.confirmation_preflight_json_path)), true);
    assert.equal(existsSync(path.join(root, pack.artifact_refs.acceptance_chain_json_path)), true);
    const markdown = readFileSync(stdout.markdown_path, 'utf8');
    const html = readFileSync(stdout.html_path, 'utf8');
    assert.ok(markdown.includes('当前验收缺口'));
    assert.ok(markdown.includes('窗口级反馈核对表'));
    assert.ok(markdown.includes('真实发送继续阻断'));
    assert.ok(html.includes('PT-028 最终反馈操作者入口'));
    assert.ok(html.includes('窗口级反馈核对表'));
    assert.ok(html.includes('审查真实桌面窗口候选证据'));
    assert.ok(html.includes('draft.window_feedback_records[0]'));
    assert.ok(html.includes('pt028:feedback-confirm:preflight'));
    assert.ok(html.includes('pt028:feedback-finalize'));
    assert.ok(html.includes('真实发送继续阻断'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 feedback handoff validation proves operator package is complete and read-only', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const targetPath = path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json');
    const packOutputDir = path.join(root, 'runtime/pt028-final-feedback-decision-packs/pack-for-handoff-validation');
    const packResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-final-feedback-decision-pack.mjs'),
      `--root=${root}`,
      `--output-dir=${packOutputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(packResult.status, 0, packResult.stderr || packResult.stdout);
    const packStdout = JSON.parse(packResult.stdout);

    const validationOutputDir = path.join(root, 'runtime/pt028-feedback-handoff-validations/validation-cli');
    const validationResult = spawnSync(process.execPath, [
      path.resolve('scripts/validate-pt028-feedback-handoff.mjs'),
      `--root=${root}`,
      `--pack=${packStdout.json_path}`,
      `--output-dir=${validationOutputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(validationResult.status, 0, validationResult.stderr || validationResult.stdout);
    const stdout = JSON.parse(validationResult.stdout);
    assert.equal(stdout.command, 'validate-pt028-feedback-handoff');
    assert.equal(stdout.gate_decision, 'ready_for_operator_feedback_collection');
    assert.equal(stdout.ready_for_operator_feedback_collection, true);
    assert.deepEqual(stdout.required_failures, []);
    assert.equal(stdout.real_execution_allowed, false);
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.equal(existsSync(stdout.json_path), true);
    assert.equal(existsSync(stdout.markdown_path), true);
    assert.equal(existsSync(targetPath), false);

    const validation = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(validation.schema_version, 'pt028_feedback_handoff_validation.v1');
    assert.equal(validation.boundary_policy.validation_is_read_only, true);
    assert.equal(validation.checklist_summary.row_count >= 2, true);
    assert.equal(validation.checklist_summary.distinct_target_count >= 2, true);
    assert.equal(validation.checklist_summary.all_candidate_prefill_only, true);
    assert.equal(validation.checklist_summary.all_real_send_disallowed, true);
    assert.ok(validation.checks.some((item) => item.check_id === 'operator_report_contains_required_markers' && item.status === 'passed'));
    assert.ok(validation.next_commands.some((command) => command.includes('pt028:feedback-finalize')));
    assert.ok(validation.next_commands.some((command) => command.includes('pt028:feedback-confirm:preflight')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 feedback collection session turns validated handoff into read-only window tasks', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const targetPath = path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json');
    const packOutputDir = path.join(root, 'runtime/pt028-final-feedback-decision-packs/pack-for-collection-session');
    const packResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-final-feedback-decision-pack.mjs'),
      `--root=${root}`,
      `--output-dir=${packOutputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(packResult.status, 0, packResult.stderr || packResult.stdout);
    const packStdout = JSON.parse(packResult.stdout);

    const validationOutputDir = path.join(root, 'runtime/pt028-feedback-handoff-validations/collection-session-handoff');
    const validationResult = spawnSync(process.execPath, [
      path.resolve('scripts/validate-pt028-feedback-handoff.mjs'),
      `--root=${root}`,
      `--pack=${packStdout.json_path}`,
      `--output-dir=${validationOutputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(validationResult.status, 0, validationResult.stderr || validationResult.stdout);
    const validationStdout = JSON.parse(validationResult.stdout);

    const sessionOutputDir = path.join(root, 'runtime/pt028-feedback-collection-sessions/session-cli');
    const sessionResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-feedback-collection-session.mjs'),
      `--root=${root}`,
      `--handoff=${validationStdout.json_path}`,
      `--output-dir=${sessionOutputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(sessionResult.status, 0, sessionResult.stderr || sessionResult.stdout);
    const stdout = JSON.parse(sessionResult.stdout);
    assert.equal(stdout.command, 'write-pt028-feedback-collection-session');
    assert.equal(stdout.gate_decision, 'ready_for_operator_window_feedback_collection');
    assert.equal(stdout.ready_for_operator_feedback_collection, true);
    assert.deepEqual(stdout.required_failures, []);
    assert.equal(stdout.real_execution_allowed, false);
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.equal(existsSync(stdout.json_path), true);
    assert.equal(existsSync(stdout.markdown_path), true);
    assert.equal(existsSync(stdout.html_path), true);
    assert.equal(existsSync(targetPath), false);

    const session = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(session.schema_version, 'pt028_feedback_collection_session.v1');
    assert.equal(session.boundary_policy.session_is_read_only, true);
    assert.equal(session.collection_scope.task_count >= 2, true);
    assert.equal(session.collection_scope.distinct_target_count >= 2, true);
    assert.equal(session.collection_scope.candidate_prefill_only, true);
    assert.equal(session.collection_scope.all_real_send_disallowed, true);
    assert.equal(session.operator_collection_tasks[0].candidate_prefill_only, true);
    assert.equal(session.operator_collection_tasks[0].real_send_allowed, false);
    assert.equal(session.operator_collection_tasks[0].ready_for_real_feedback_target_write, false);
    assert.equal(
      session.operator_collection_tasks[0].decision_template_record_pointer,
      'feedback_batch.window_feedback_records[0]'
    );
    assert.ok(session.operator_collection_tasks[0].capture_prompts.some((item) => item.includes('prompt-only')));
    assert.ok(session.next_commands.some((command) => command.includes('pt028:feedback-finalize')));
    assert.ok(session.next_commands.some((command) => command.includes('pt028:feedback-confirm:preflight')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 feedback collection coverage verifies decision rows against session tasks', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const targetPath = path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json');
    const packOutputDir = path.join(root, 'runtime/pt028-final-feedback-decision-packs/pack-for-coverage');
    const packResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-final-feedback-decision-pack.mjs'),
      `--root=${root}`,
      `--output-dir=${packOutputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(packResult.status, 0, packResult.stderr || packResult.stdout);
    const packStdout = JSON.parse(packResult.stdout);

    const validationOutputDir = path.join(root, 'runtime/pt028-feedback-handoff-validations/coverage-handoff');
    const validationResult = spawnSync(process.execPath, [
      path.resolve('scripts/validate-pt028-feedback-handoff.mjs'),
      `--root=${root}`,
      `--pack=${packStdout.json_path}`,
      `--output-dir=${validationOutputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(validationResult.status, 0, validationResult.stderr || validationResult.stdout);
    const validationStdout = JSON.parse(validationResult.stdout);

    const sessionOutputDir = path.join(root, 'runtime/pt028-feedback-collection-sessions/coverage-session');
    const sessionResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-feedback-collection-session.mjs'),
      `--root=${root}`,
      `--handoff=${validationStdout.json_path}`,
      `--output-dir=${sessionOutputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(sessionResult.status, 0, sessionResult.stderr || sessionResult.stdout);
    const sessionStdout = JSON.parse(sessionResult.stdout);
    const session = JSON.parse(readFileSync(sessionStdout.json_path, 'utf8'));

    const templatePath = path.join(root, session.linked_pack.decision_template_path);
    const incompleteCoverage = spawnSync(process.execPath, [
      path.resolve('scripts/validate-pt028-feedback-collection-coverage.mjs'),
      `--root=${root}`,
      `--session=${sessionStdout.json_path}`,
      `--decision=${templatePath}`,
      `--output-dir=${path.join(root, 'runtime/pt028-feedback-collection-coverages/incomplete')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(incompleteCoverage.status, 0, incompleteCoverage.stderr || incompleteCoverage.stdout);
    const incompleteStdout = JSON.parse(incompleteCoverage.stdout);
    assert.equal(incompleteStdout.gate_decision, 'collection_coverage_needs_attention');
    assert.ok(incompleteStdout.required_failures.includes('all_session_tasks_confirmed'));
    assert.equal(existsSync(targetPath), false);

    const decision = JSON.parse(readFileSync(templatePath, 'utf8'));
    decision.operator_confirmation = {
      approved_to_write_real_feedback_target: true,
      reviewer_id: 'coverage_reviewer',
      reviewed_at: '2026-06-20T17:00:00+08:00',
      confirm_real_windows_observed: true,
      confirm_target_binding: true,
      confirm_prompt_only: true,
      confirm_no_real_send: true,
      confirm_privacy_boundary: true,
      confirm_human_special_review: true,
      notes: 'Coverage test confirms each collection task before preflight.'
    };
    decision.feedback_batch = {
      ...decision.feedback_batch,
      reviewer: {
        reviewer_id: 'coverage_reviewer',
        role: 'operator',
        reviewed_at: '2026-06-20T17:00:00+08:00'
      },
      window_feedback_records: decision.feedback_batch.window_feedback_records.map((record, index) => ({
        ...record,
        source_type: 'human_reviewed_real_window_feedback',
        operator_decision: index === 0
          ? 'prompt_accepted_for_manual_edit'
          : 'needs_context_before_progression',
        target_response_signal: index === 0
          ? 'warm_or_positive'
          : 'neutral_or_unknown',
        real_window_observed: true,
        state_target_verified: true,
        prompt_only_confirmed: true,
        no_real_send_attempted: true,
        privacy_boundary_confirmed: true,
        reviewed_at: '2026-06-20T17:00:00+08:00',
        evidence_refs: [
          record.state_path,
          ...(record.evidence_refs ?? [])
        ].filter(Boolean),
        notes: 'Coverage test reviewer confirmed this collection session task.'
      })),
      human_special_review: {
        approved_for_final_special_acceptance: true,
        reviewer_id: 'coverage_final_reviewer',
        reviewed_at: '2026-06-20T17:01:00+08:00',
        approval_scope: [
          'low_latency_event_stream',
          'real_multi_window_feedback_calibration',
          'prompt_only_send_gate',
          'privacy_boundary',
          'final_special_acceptance'
        ],
        notes: 'Coverage test final reviewer approved the collection coverage.'
      }
    };
    const decisionPath = path.join(root, 'runtime/user-inputs/pt028-real-feedback-confirmation-decision.coverage.json');
    mkdirSync(path.dirname(decisionPath), { recursive: true });
    writeFileSync(decisionPath, `${JSON.stringify(decision, null, 2)}\n`, 'utf8');

    const coverageResult = spawnSync(process.execPath, [
      path.resolve('scripts/validate-pt028-feedback-collection-coverage.mjs'),
      `--root=${root}`,
      `--session=${sessionStdout.json_path}`,
      `--decision=${decisionPath}`,
      `--output-dir=${path.join(root, 'runtime/pt028-feedback-collection-coverages/complete')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(coverageResult.status, 0, coverageResult.stderr || coverageResult.stdout);
    const stdout = JSON.parse(coverageResult.stdout);
    assert.equal(stdout.command, 'validate-pt028-feedback-collection-coverage');
    assert.equal(stdout.gate_decision, 'ready_for_confirmation_preflight');
    assert.equal(stdout.ready_for_confirmation_preflight, true);
    assert.deepEqual(stdout.required_failures, []);
    assert.equal(stdout.real_execution_allowed, false);
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.equal(existsSync(stdout.json_path), true);
    assert.equal(existsSync(stdout.markdown_path), true);
    assert.equal(existsSync(targetPath), false);

    const coverage = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(coverage.schema_version, 'pt028_feedback_collection_coverage.v1');
    assert.equal(coverage.coverage_summary.task_count, session.collection_scope.task_count);
    assert.equal(coverage.coverage_summary.matched_task_count, session.collection_scope.task_count);
    assert.equal(coverage.coverage_summary.confirmed_task_count, session.collection_scope.task_count);
    assert.equal(coverage.boundary_policy.coverage_check_is_read_only, true);
    assert.ok(coverage.task_coverage.every((item) => item.status === 'covered_and_confirmed'));
    assert.ok(coverage.next_commands.some((command) => command.includes('pt028:feedback-confirm:preflight')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 real feedback confirmation writes target only after complete human confirmation', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const initialWorkpack = buildPt028RealFeedbackWorkpack({
      root,
      workpackId: 'pt028_real_feedback_confirmation_initial',
      createdAt: '2026-06-20T15:00:00+08:00'
    });
    writePt028RealFeedbackWorkpack({ workpack: initialWorkpack });

    const stateResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-real-observation-gui-states.mjs'),
      `--root=${root}`,
      '--limit=2'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(stateResult.status, 0, stateResult.stderr || stateResult.stdout);

    const refreshedWorkpack = buildPt028RealFeedbackWorkpack({
      root,
      workpackId: 'pt028_real_feedback_confirmation_refreshed',
      createdAt: '2026-06-20T15:01:00+08:00',
      minimumWindowSlots: 2
    });
    const decision = buildPt028RealFeedbackConfirmationTemplate({
      workpack: refreshedWorkpack,
      decisionId: 'pt028_real_feedback_confirmation_decision_complete',
      createdAt: '2026-06-20T15:02:00+08:00'
    });
    decision.operator_confirmation = {
      approved_to_write_real_feedback_target: true,
      reviewer_id: 'operator_confirmation_reviewer',
      reviewed_at: '2026-06-20T15:03:00+08:00',
      confirm_real_windows_observed: true,
      confirm_target_binding: true,
      confirm_prompt_only: true,
      confirm_no_real_send: true,
      confirm_privacy_boundary: true,
      confirm_human_special_review: true,
      notes: 'Unit test confirms all prompt-only real feedback gates.'
    };
    decision.feedback_batch = {
      ...decision.feedback_batch,
      feedback_batch_id: 'pt028_real_feedback_confirmation_batch_complete',
      created_at: '2026-06-20T15:03:00+08:00',
      reviewer: {
        reviewer_id: 'operator_confirmation_reviewer',
        role: 'operator',
        reviewed_at: '2026-06-20T15:03:00+08:00'
      },
      window_feedback_records: decision.feedback_batch.window_feedback_records.map((record, index) => ({
        ...record,
        source_type: 'human_reviewed_real_window_feedback',
        operator_decision: index === 0
          ? 'prompt_accepted_for_manual_edit'
          : 'needs_context_before_progression',
        target_response_signal: index === 0
          ? 'warm_or_positive'
          : 'neutral_or_unknown',
        real_window_observed: true,
        state_target_verified: true,
        prompt_only_confirmed: true,
        no_real_send_attempted: true,
        privacy_boundary_confirmed: true,
        reviewed_at: '2026-06-20T15:03:00+08:00',
        evidence_refs: [
          record.state_path,
          record.candidate_observation_ref
        ].filter(Boolean),
        candidate_requires_operator_confirmation: false,
        notes: 'Human reviewer confirmed target binding and prompt-only state in the real window.'
      })),
      human_special_review: {
        approved_for_final_special_acceptance: true,
        reviewer_id: 'final_confirmation_reviewer',
        reviewed_at: '2026-06-20T15:04:00+08:00',
        approval_scope: [
          'low_latency_event_stream',
          'real_multi_window_feedback_calibration',
          'prompt_only_send_gate',
          'privacy_boundary',
          'final_special_acceptance'
        ],
        notes: 'Unit test final reviewer approved the confirmation-gated feedback target write.'
      }
    };

    const preflight = buildPt028RealFeedbackConfirmationResult({
      decision,
      root,
      pathExists: (candidate) => existsSync(candidate),
      readJson: (candidate) => JSON.parse(readFileSync(candidate, 'utf8'))
    });
    assert.equal(
      preflight.writes_real_feedback_target_allowed,
      true,
      JSON.stringify(preflight, null, 2)
    );
    assert.deepEqual(preflight.required_failures, []);

    const decisionPath = path.join(root, 'runtime/user-inputs/pt028-real-feedback-confirmation-decision.real.json');
    mkdirSync(path.dirname(decisionPath), { recursive: true });
    writeFileSync(decisionPath, `${JSON.stringify(decision, null, 2)}\n`, 'utf8');
    const coveragePath = writeReadyPt028CollectionCoverageFixture({
      root,
      decisionPath,
      decision,
      coverageId: 'pt028_feedback_collection_coverage_confirm_ready'
    });
    const outputDir = path.join(root, 'runtime/pt028-real-feedback-confirmations/complete');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/confirm-pt028-real-feedback.mjs'),
      `--root=${root}`,
      `--decision=${decisionPath}`,
      `--coverage=${coveragePath}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.gate_decision, 'ready_to_write_real_feedback_target');
    assert.equal(stdout.writes_real_feedback_target_allowed, true);
    assert.equal(stdout.writes_real_feedback_target, true);
    const targetPath = path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json');
    assert.equal(existsSync(targetPath), true);
    const targetBatch = JSON.parse(readFileSync(targetPath, 'utf8'));
    const readiness = buildPt028RealFeedbackReadiness({
      feedbackBatch: targetBatch,
      feedbackPath: targetPath,
      root,
      pathExists: (candidate) => existsSync(candidate),
      readJson: (candidate) => JSON.parse(readFileSync(candidate, 'utf8'))
    });
    assert.equal(readiness.final_acceptance_ready, true);
    assert.deepEqual(readiness.required_failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 real feedback readiness blocks unresolved candidate-prefill confirmations', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const decision = buildCompletePt028FeedbackConfirmationDecision(root);
    decision.feedback_batch = {
      ...decision.feedback_batch,
      window_feedback_records: decision.feedback_batch.window_feedback_records.map((record, index) => ({
        ...record,
        candidate_requires_operator_confirmation: index === 0
      }))
    };

    const readiness = buildPt028RealFeedbackReadiness({
      feedbackBatch: decision.feedback_batch,
      root,
      pathExists: (candidate) => existsSync(candidate),
      readJson: (candidate) => JSON.parse(readFileSync(candidate, 'utf8'))
    });
    assert.equal(readiness.final_acceptance_ready, false);
    assert.ok(
      readiness.required_failures.some((failure) =>
        failure.failure_id === 'candidate_confirmation_not_resolved'
      ),
      JSON.stringify(readiness, null, 2)
    );
    assert.ok(
      readiness.window_rows.some((row) =>
        row.row_failures.includes('candidate_confirmation_not_resolved')
          && row.feedback_requirement_status.candidate_confirmation_resolved === false
      ),
      JSON.stringify(readiness.window_rows, null, 2)
    );

    const confirmation = buildPt028RealFeedbackConfirmationResult({
      decision,
      root,
      pathExists: (candidate) => existsSync(candidate),
      readJson: (candidate) => JSON.parse(readFileSync(candidate, 'utf8'))
    });
    assert.equal(confirmation.writes_real_feedback_target_allowed, false);
    assert.ok(confirmation.required_failures.includes('real_feedback_readiness_final_ready'));

    const decisionPath = path.join(root, 'runtime/user-inputs/pt028-candidate-unresolved-decision.real.json');
    mkdirSync(path.dirname(decisionPath), { recursive: true });
    writeFileSync(decisionPath, `${JSON.stringify(decision, null, 2)}\n`, 'utf8');
    const coveragePath = writeReadyPt028CollectionCoverageFixture({
      root,
      decisionPath,
      decision,
      coverageId: 'pt028_feedback_collection_coverage_candidate_unresolved'
    });
    const preflightResult = spawnSync(process.execPath, [
      path.resolve('scripts/preflight-pt028-real-feedback-confirmation.mjs'),
      `--root=${root}`,
      `--decision=${decisionPath}`,
      `--coverage=${coveragePath}`,
      `--output-dir=${path.join(root, 'runtime/pt028-feedback-confirmation-preflights/candidate-unresolved')}`,
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(preflightResult.status, 2, preflightResult.stderr || preflightResult.stdout);
    const preflightStdout = JSON.parse(preflightResult.stdout);
    assert.ok(preflightStdout.required_failures.includes('real_feedback_readiness_final_ready'));
    assert.ok(preflightStdout.readiness_required_failures.includes('candidate_confirmation_not_resolved'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 real feedback finalization blocks incomplete human decision without target write', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const decision = buildCompletePt028FeedbackConfirmationDecision(root);
    decision.operator_confirmation = {
      ...decision.operator_confirmation,
      approved_to_write_real_feedback_target: false,
      confirm_real_windows_observed: false
    };
    decision.feedback_batch = {
      ...decision.feedback_batch,
      human_special_review: {
        ...decision.feedback_batch.human_special_review,
        approved_for_final_special_acceptance: false,
        reviewed_at: 'REPLACE_WITH_ISO_TIME'
      },
      window_feedback_records: decision.feedback_batch.window_feedback_records.map((record, index) => ({
        ...record,
        real_window_observed: index === 0 ? false : record.real_window_observed
      }))
    };
    const decisionPath = path.join(root, 'runtime/user-inputs/pt028-real-feedback-finalization-incomplete.json');
    mkdirSync(path.dirname(decisionPath), { recursive: true });
    writeFileSync(decisionPath, `${JSON.stringify(decision, null, 2)}\n`, 'utf8');
    const sessionPath = writePt028CollectionSessionFixtureForDecision({
      root,
      decision,
      sessionId: 'pt028_feedback_collection_session_finalization_incomplete'
    });

    const outputDir = path.join(root, 'runtime/pt028-real-feedback-finalizations/incomplete');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/run-pt028-real-feedback-finalization.mjs'),
      `--root=${root}`,
      `--decision=${decisionPath}`,
      `--session=${sessionPath}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.gate_decision, 'pt028_real_feedback_finalization_blocked');
    assert.equal(stdout.ready_for_final_acceptance, false);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.equal(stdout.target_feedback_exists, false);
    assert.ok(stdout.required_failures.some((failure) => failure.includes('collection_coverage')));
    const report = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(report.steps.some((step) => step.step_id === 'confirmation_write' && step.gate_decision === 'skipped'), true);
    assert.equal(report.steps.some((step) => step.step_id === 'collection_session_event_stream'), true);
    assert.equal(report.steps.some((step) => (
      step.step_id === 'collection_session_event_stream_health'
      && step.gate_decision === 'event_stream_ready_for_low_latency_gui_subscription'
    )), true);
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 real feedback finalization writes target and reaches final acceptance after complete decision', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const decision = buildCompletePt028FeedbackConfirmationDecision(root);
    const decisionPath = path.join(root, 'runtime/user-inputs/pt028-real-feedback-finalization-complete.json');
    mkdirSync(path.dirname(decisionPath), { recursive: true });
    writeFileSync(decisionPath, `${JSON.stringify(decision, null, 2)}\n`, 'utf8');
    const sessionPath = writePt028CollectionSessionFixtureForDecision({
      root,
      decision,
      sessionId: 'pt028_feedback_collection_session_finalization_complete'
    });
    const auditPath = path.join(root, 'runtime/pt028-audits/finalization-audit/pt028-romantic-flow-audit.json');
    mkdirSync(path.dirname(auditPath), { recursive: true });
    writeFileSync(auditPath, `${JSON.stringify({
      schema_version: 'pt028_romantic_flow_audit.v1',
      audit_id: 'pt028_finalization_complete_audit',
      core_runtime_stage_tests_passed: true,
      real_execution_allowed: false,
      real_send_attempted: false
    }, null, 2)}\n`, 'utf8');

    const outputDir = path.join(root, 'runtime/pt028-real-feedback-finalizations/complete');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/run-pt028-real-feedback-finalization.mjs'),
      `--root=${root}`,
      `--decision=${decisionPath}`,
      `--session=${sessionPath}`,
      `--audit=${auditPath}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.gate_decision, 'pt028_real_feedback_finalization_passed');
    assert.equal(stdout.ready_for_final_acceptance, true);
    assert.equal(stdout.writes_real_feedback_target, true);
    assert.equal(stdout.target_feedback_exists, true);
    assert.deepEqual(stdout.required_failures, []);
    const report = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(report.steps.some((step) => step.step_id === 'feedback_bound_event_stream'), true);
    assert.equal(report.steps.some((step) => (
      step.step_id === 'feedback_bound_event_stream_health'
      && step.gate_decision === 'event_stream_ready_for_low_latency_gui_subscription'
    )), true);
    assert.equal(report.steps.some((step) => step.step_id === 'acceptance_chain' && step.stdout_json?.gate_decision === 'pt028_acceptance_chain_passed'), true);
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 final special review pack consolidates human review evidence without writing target', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const targetPath = path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json');
    const packResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-final-feedback-decision-pack.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-final-feedback-decision-packs/review-pack-source')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(packResult.status, 0, packResult.stderr || packResult.stdout);

    const handoffResult = spawnSync(process.execPath, [
      path.resolve('scripts/validate-pt028-feedback-handoff.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-feedback-handoff-validations/review-pack-handoff')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(handoffResult.status, 0, handoffResult.stderr || handoffResult.stdout);

    const sessionResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-feedback-collection-session.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-feedback-collection-sessions/review-pack-session')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(sessionResult.status, 0, sessionResult.stderr || sessionResult.stdout);

    const eventStreamResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-gui-event-stream.mjs'),
      `--root=${root}`,
      '--session=runtime/pt028-feedback-collection-sessions/latest.json',
      `--output-dir=${path.join(root, 'runtime/pt028-gui-event-streams/review-pack-stream')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(eventStreamResult.status, 0, eventStreamResult.stderr || eventStreamResult.stdout);

    const healthResult = spawnSync(process.execPath, [
      path.resolve('scripts/validate-pt028-event-stream-health.mjs'),
      `--root=${root}`,
      '--stream=runtime/pt028-gui-event-streams/latest.json',
      `--output-dir=${path.join(root, 'runtime/pt028-event-stream-health/review-pack-health')}`,
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(healthResult.status, 0, healthResult.stderr || healthResult.stdout);

    const coverageResult = spawnSync(process.execPath, [
      path.resolve('scripts/validate-pt028-feedback-collection-coverage.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-feedback-collection-coverages/review-pack-coverage')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(coverageResult.status, 0, coverageResult.stderr || coverageResult.stdout);

    const finalizationResult = spawnSync(process.execPath, [
      path.resolve('scripts/run-pt028-real-feedback-finalization.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-real-feedback-finalizations/review-pack-finalization')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(finalizationResult.status, 0, finalizationResult.stderr || finalizationResult.stdout);

    const reviewPackResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-final-special-review-pack.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-final-special-review-packs/review-pack')}`,
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(reviewPackResult.status, 0, reviewPackResult.stderr || reviewPackResult.stdout);
    const stdout = JSON.parse(reviewPackResult.stdout);
    assert.equal(stdout.command, 'write-pt028-final-special-review-pack');
    assert.equal(stdout.gate_decision, 'ready_for_human_special_review');
    assert.equal(stdout.ready_for_human_special_review, true);
    assert.deepEqual(stdout.required_failures, []);
    assert.equal(stdout.target_feedback_exists, false);
    assert.equal(stdout.real_execution_allowed, false);
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.equal(stdout.event_stream_review_summary.schema_version, 'pt028_human_review_event_stream_summary.v1');
    assert.equal(stdout.event_stream_review_summary.event_count >= 1, true);
    assert.equal(stdout.event_stream_review_summary.unique_window_count >= 1, true);
    assert.equal(stdout.event_stream_review_summary.unique_target_count >= 1, true);
    assert.equal(typeof stdout.event_stream_review_summary.input_mode, 'string');
    assert.equal(stdout.event_stream_review_summary.prompt_only_boundary_preserved, true);
    assert.equal(stdout.feedback_collection_review_summary.schema_version, 'pt028_human_review_feedback_collection_summary.v1');
    assert.equal(stdout.feedback_collection_review_summary.task_count >= 2, true);
    assert.equal(stdout.feedback_collection_review_summary.distinct_target_count >= 2, true);
    assert.equal(existsSync(stdout.json_path), true);
    assert.equal(existsSync(stdout.markdown_path), true);
    assert.equal(existsSync(stdout.html_path), true);
    assert.equal(existsSync(targetPath), false);

    const reviewPack = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(reviewPack.schema_version, 'pt028_final_special_review_pack.v1');
    assert.equal(reviewPack.evidence_summary.event_stream_health_gate, 'event_stream_ready_for_low_latency_gui_subscription');
    assert.equal(typeof reviewPack.evidence_summary.event_stream_input_mode, 'string');
    assert.equal(reviewPack.evidence_summary.event_stream_event_count >= 1, true);
    assert.equal(reviewPack.evidence_summary.event_stream_window_count >= 1, true);
    assert.equal(reviewPack.evidence_summary.event_stream_target_count >= 1, true);
    assert.equal(reviewPack.evidence_summary.event_stream_prompt_only_boundary_preserved, true);
    assert.equal(reviewPack.evidence_summary.collection_task_count >= 2, true);
    assert.equal(reviewPack.human_review_field_guide.schema_version, 'pt028_human_review_field_guide.v1');
    assert.equal(reviewPack.human_review_field_guide.language, 'zh-CN');
    assert.equal(
      reviewPack.human_review_field_guide.event_stream_review_summary.schema_version,
      'pt028_human_review_event_stream_summary.v1'
    );
    assert.equal(
      reviewPack.human_review_field_guide.feedback_collection_review_summary.schema_version,
      'pt028_human_review_feedback_collection_summary.v1'
    );
    assert.equal(
      reviewPack.human_review_field_guide.window_task_map.length,
      reviewPack.evidence_summary.collection_task_count
    );
    assert.ok(reviewPack.human_review_field_guide.operator_confirmation_required_fields.some((field) => (
      field.field_path === 'operator_confirmation.confirm_human_special_review'
    )));
    assert.ok(reviewPack.human_review_field_guide.human_special_review_required_fields.some((field) => (
      field.field_path === 'feedback_batch.human_special_review.approved_for_final_special_acceptance'
    )));
    assert.ok(reviewPack.review_actions.some((action) => action.action_id === 'fill_confirmation_decision_template'));
    assert.ok(reviewPack.next_commands.some((command) => command.includes('pt028:human-review-decision')));
    assert.ok(reviewPack.next_commands.some((command) => command.includes('pt028:feedback-finalize')));
    const html = readFileSync(stdout.html_path, 'utf8');
    assert.ok(html.includes('PT-028 Final Special Review Pack'));
    assert.ok(html.includes('Human Review Field Guide'));
    assert.ok(html.includes('Event stream summary'));
    assert.ok(html.includes('Feedback collection summary'));
    assert.ok(html.includes('pt028:human-review-decision'));
    assert.ok(html.includes('pt028:feedback-finalize'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 human review decision writer converts review sheet without writing target', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const targetPath = path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json');
    const packResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-final-feedback-decision-pack.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-final-feedback-decision-packs/human-review-source')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(packResult.status, 0, packResult.stderr || packResult.stdout);

    const handoffResult = spawnSync(process.execPath, [
      path.resolve('scripts/validate-pt028-feedback-handoff.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-feedback-handoff-validations/human-review-handoff')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(handoffResult.status, 0, handoffResult.stderr || handoffResult.stdout);

    const sessionResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-feedback-collection-session.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-feedback-collection-sessions/human-review-session')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(sessionResult.status, 0, sessionResult.stderr || sessionResult.stdout);
    const sessionStdout = JSON.parse(sessionResult.stdout);
    const needsHumanReplacement = (value) => typeof value !== 'string'
      || value.length === 0
      || value.includes('REPLACE_WITH')
      || value.includes('PLACEHOLDER')
      || value.includes('TEMPLATE');
    const sessionForHumanReview = JSON.parse(readFileSync(sessionStdout.json_path, 'utf8'));
    sessionForHumanReview.operator_collection_tasks = sessionForHumanReview.operator_collection_tasks.map((task, index) => {
      const reviewedTask = {
        ...task,
        window_id: needsHumanReplacement(task.window_id) ? `reviewed_wechat_window_${index + 1}` : task.window_id,
        target_person_id: needsHumanReplacement(task.target_person_id) ? `person_reviewed_${index + 1}` : task.target_person_id,
        target_display_name_hint: needsHumanReplacement(task.target_display_name_hint)
          ? `Reviewed Target ${index + 1}`
          : task.target_display_name_hint,
        state_path: needsHumanReplacement(task.state_path) ? `runtime/reviewed/state-${index + 1}.json` : task.state_path,
        evidence_refs: [
          needsHumanReplacement(task.state_path) ? `runtime/reviewed/state-${index + 1}.json` : task.state_path,
          `runtime/reviewed/evidence-${index + 1}.json`
        ].filter(Boolean)
      };
      const reviewedState = buildPt028GuiDecisionState({
        stateId: `human_review_state_${index + 1}`,
        source: {
          source_type: 'unit_test_human_review_session',
          window_id: reviewedTask.window_id,
          app_type: reviewedTask.app_type ?? 'wechat'
        }
      });
      reviewedState.source_decision = {
        ...reviewedState.source_decision,
        target_person_id: reviewedTask.target_person_id,
        target_display_name: reviewedTask.target_display_name_hint
      };
      const reviewedStatePath = path.join(root, reviewedTask.state_path);
      mkdirSync(path.dirname(reviewedStatePath), { recursive: true });
      writeFileSync(reviewedStatePath, `${JSON.stringify(reviewedState, null, 2)}\n`, 'utf8');
      const evidencePath = path.join(root, `runtime/reviewed/evidence-${index + 1}.json`);
      mkdirSync(path.dirname(evidencePath), { recursive: true });
      writeFileSync(evidencePath, `${JSON.stringify({
        schema_version: 'pt028_human_review_evidence_fixture.v1',
        task_id: reviewedTask.task_id,
        window_id: reviewedTask.window_id,
        target_person_id: reviewedTask.target_person_id,
        real_execution_allowed: false,
        real_send_attempted: false
      }, null, 2)}\n`, 'utf8');
      return reviewedTask;
    });
    sessionForHumanReview.collection_scope = {
      ...sessionForHumanReview.collection_scope,
      distinct_target_count: new Set(sessionForHumanReview.operator_collection_tasks.map((task) => task.target_person_id)).size
    };
    writeFileSync(sessionStdout.json_path, `${JSON.stringify(sessionForHumanReview, null, 2)}\n`, 'utf8');
    writeFileSync(path.join(root, 'runtime/pt028-feedback-collection-sessions/latest.json'), `${JSON.stringify(sessionForHumanReview, null, 2)}\n`, 'utf8');

    const eventStreamResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-gui-event-stream.mjs'),
      `--root=${root}`,
      '--session=runtime/pt028-feedback-collection-sessions/latest.json',
      `--output-dir=${path.join(root, 'runtime/pt028-gui-event-streams/human-review-stream')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(eventStreamResult.status, 0, eventStreamResult.stderr || eventStreamResult.stdout);

    const healthResult = spawnSync(process.execPath, [
      path.resolve('scripts/validate-pt028-event-stream-health.mjs'),
      `--root=${root}`,
      '--stream=runtime/pt028-gui-event-streams/latest.json',
      `--output-dir=${path.join(root, 'runtime/pt028-event-stream-health/human-review-health')}`,
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(healthResult.status, 0, healthResult.stderr || healthResult.stdout);

    const finalizationResult = spawnSync(process.execPath, [
      path.resolve('scripts/run-pt028-real-feedback-finalization.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-real-feedback-finalizations/human-review-finalization')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(finalizationResult.status, 0, finalizationResult.stderr || finalizationResult.stdout);

    const reviewPackResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-final-special-review-pack.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-final-special-review-packs/human-review-pack')}`,
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(reviewPackResult.status, 0, reviewPackResult.stderr || reviewPackResult.stdout);

    const templateResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-human-review-decision.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-human-review-decisions/template')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(templateResult.status, 0, templateResult.stderr || templateResult.stdout);
    const templateStdout = JSON.parse(templateResult.stdout);
    assert.equal(templateStdout.gate_decision, 'human_review_sheet_template_written');
    assert.equal(templateStdout.writes_real_feedback_target, false);
    assert.ok(templateStdout.template_initial_diagnostics.missing_global_confirmations.includes('real_windows_observed'));
    assert.ok(templateStdout.template_initial_diagnostics.failed_required_checks.includes('global_operator_confirmations_complete'));
    assert.ok(templateStdout.template_initial_diagnostics.first_window_failures[0].failed_checks.includes('operator_decision'));
    assert.equal(existsSync(templateStdout.review_sheet_template_path), true);
    assert.equal(existsSync(templateStdout.review_sheet_markdown_path), true);
    assert.equal(existsSync(templateStdout.review_sheet_html_path), true);
    assert.ok(readFileSync(templateStdout.review_sheet_html_path, 'utf8').includes('data-report-contract="pt028_human_review_sheet_view.v1"'));
    const templateReport = JSON.parse(readFileSync(templateStdout.json_path, 'utf8'));
    assert.equal(templateReport.template_initial_diagnostics.schema_version, 'pt028_human_review_sheet_diagnostics.v1');
    assert.ok(templateReport.template_initial_diagnostics.window_review_diagnostics.every((item) => item.ready === false));
    assert.equal(templateReport.human_review_fill_plan.schema_version, 'pt028_human_review_fill_plan.v1');
    assert.equal(
      templateReport.human_review_fill_plan.target_files.filled_review_sheet_target_path,
      'runtime/user-inputs/pt028-human-review-decision.real.json'
    );
    assert.equal(
      templateReport.human_review_fill_plan.target_files.real_feedback_target_path,
      'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json'
    );
    assert.equal(templateReport.human_review_fill_plan.current_review_sheet.exists, false);
    assert.equal(templateReport.human_review_fill_plan.current_diagnostics_summary.source, 'template_initial_diagnostics');
    assert.equal(templateReport.human_review_fill_plan.window_row_tasks.length, templateReport.template_initial_diagnostics.expected_window_review_count);
    assert.ok(templateReport.human_review_fill_plan.window_row_tasks[0].required_boolean_paths.includes('window_reviews[0].prompt_only_confirmed'));
    assert.ok(templateReport.human_review_fill_plan.command_order.some((item) => item.step_id === 'controlled_preflight'));
    assert.equal(templateReport.human_review_fill_plan.boundary_policy.fill_plan_writes_real_feedback_target, false);
    assert.equal(templateStdout.human_review_fill_plan.schema_version, 'pt028_human_review_fill_plan.v1');
    assert.equal(templateStdout.human_review_fill_plan.current_review_sheet_exists, false);
    assert.ok(readFileSync(templateStdout.markdown_path, 'utf8').includes('## Template Initial Diagnostics'));
    assert.ok(readFileSync(templateStdout.markdown_path, 'utf8').includes('## Human Review Fill Plan'));

    const missingReviewPath = path.join(root, 'runtime/user-inputs/pt028-human-review-decision.real.json');
    const missingReviewResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-human-review-decision.mjs'),
      `--root=${root}`,
      `--review=${missingReviewPath}`,
      `--output-dir=${path.join(root, 'runtime/pt028-human-review-decisions/missing-review')}`,
      '--check-only'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(missingReviewResult.status, 0, missingReviewResult.stderr || missingReviewResult.stdout);
    const missingReviewStdout = JSON.parse(missingReviewResult.stdout);
    assert.equal(missingReviewStdout.gate_decision, 'human_review_sheet_input_missing');
    assert.equal(missingReviewStdout.review_sheet_input_status.review_sheet_exists, false);
    assert.equal(missingReviewStdout.review_sheet_input_status.missing_input_failure, 'review_sheet_target_missing');
    assert.ok(missingReviewStdout.required_failures.includes('review_sheet_input_present'));
    const missingReviewReport = JSON.parse(readFileSync(missingReviewStdout.json_path, 'utf8'));
    assert.ok(missingReviewReport.next_commands.some((command) => command.includes('pt028-human-review-decision.real.json')));
    assert.equal(missingReviewReport.human_review_fill_plan.current_review_sheet.exists, false);
    assert.equal(
      missingReviewReport.human_review_fill_plan.target_files.active_review_sheet_path,
      'runtime/user-inputs/pt028-human-review-decision.real.json'
    );
    assert.equal(existsSync(missingReviewPath), false);

    const sheet = JSON.parse(readFileSync(templateStdout.review_sheet_template_path, 'utf8'));
    assert.equal(sheet.evidence_review_summary.schema_version, 'pt028_human_review_evidence_summary.v1');
    assert.equal(
      sheet.evidence_review_summary.event_stream_review_summary.schema_version,
      'pt028_human_review_event_stream_summary.v1'
    );
    assert.equal(sheet.evidence_review_summary.event_stream_review_summary.input_mode, 'operator_collection_session_window_states');
    assert.equal(sheet.evidence_review_summary.event_stream_review_summary.event_count >= 2, true);
    assert.equal(sheet.evidence_review_summary.event_stream_review_summary.prompt_only_boundary_preserved, true);
    assert.equal(
      sheet.evidence_review_summary.feedback_collection_review_summary.schema_version,
      'pt028_human_review_feedback_collection_summary.v1'
    );
    assert.equal(sheet.evidence_review_summary.feedback_collection_review_summary.task_count >= 2, true);
    assert.equal(sheet.evidence_review_summary.feedback_collection_review_summary.distinct_target_count >= 2, true);
    assert.equal(sheet.review_sheet_guidance.schema_version, 'pt028_human_review_sheet_guidance.v1');
    assert.ok(sheet.review_sheet_guidance.allowed_operator_decision_values.includes('prompt_accepted_for_manual_edit'));
    assert.ok(sheet.review_sheet_guidance.allowed_target_response_signal_values.includes('warm_or_positive'));
    assert.ok(sheet.review_sheet_guidance.window_row_ready_when.some((item) => item.includes('operator_decision')));
    assert.equal(sheet.review_sheet_guidance.boundary_policy.this_guidance_writes_real_feedback_target, false);
    const templateMarkdown = readFileSync(templateStdout.review_sheet_markdown_path, 'utf8');
    const templateHtml = readFileSync(templateStdout.review_sheet_html_path, 'utf8');
    assert.ok(templateMarkdown.includes('## Evidence Review Summary'));
    assert.ok(templateMarkdown.includes('event_stream_input_mode: operator_collection_session_window_states'));
    assert.ok(templateMarkdown.includes('collection_task_count'));
    assert.ok(templateMarkdown.includes('## Ready Conditions'));
    assert.ok(templateHtml.includes('Evidence Review Summary'));
    assert.ok(templateHtml.includes('event_stream_input_mode'));
    assert.ok(templateHtml.includes('window_row_ready_when'));
    const collectionSession = JSON.parse(readFileSync(path.join(root, 'runtime/pt028-feedback-collection-sessions/latest.json'), 'utf8'));
    const filledSheet = {
      ...sheet,
      reviewer: {
        reviewer_id: 'human_review_decision_writer_reviewer',
        role: 'operator_or_human_special_reviewer',
        reviewed_at: '2026-06-20T18:00:00+08:00'
      },
      approve_controlled_feedback_target_write: true,
      global_confirmations: {
        real_windows_observed: true,
        target_binding_verified: true,
        prompt_only_confirmed: true,
        no_real_send_attempted: true,
        privacy_boundary_confirmed: true,
        human_special_review_complete: true
      },
      window_reviews: sheet.window_reviews.map((review, index) => {
        const task = collectionSession.operator_collection_tasks[index] ?? {};
        return ({
        ...review,
        window_id: task.window_id,
        target_person_id: task.target_person_id,
        target_display_name_hint: `Reviewed Target ${index + 1}`,
        state_path: task.state_path,
        real_window_observed: true,
        state_target_verified: true,
        prompt_only_confirmed: true,
        no_real_send_attempted: true,
        privacy_boundary_confirmed: true,
        reviewed_at: '2026-06-20T18:00:00+08:00',
        operator_decision: index === 0
          ? 'prompt_accepted_for_manual_edit'
          : 'needs_context_before_progression',
        target_response_signal: index === 0
          ? 'warm_or_positive'
          : 'neutral_or_unknown',
        evidence_refs: [
          task.state_path,
          ...(task.evidence_refs ?? [])
        ].filter(Boolean),
        notes: 'Human reviewer confirmed this real window row for unit coverage.'
      });
      }),
      human_special_review: {
        ...sheet.human_special_review,
        approved_for_final_special_acceptance: true,
        reviewer_id: 'human_review_decision_writer_final_reviewer',
        reviewed_at: '2026-06-20T18:05:00+08:00',
        notes: 'Final reviewer approved the low-latency stream, calibration path and prompt-only boundary.'
      }
    };
    const filledSheetPath = path.join(root, 'runtime/pt028-human-review-decisions/filled-review-sheet.json');
    mkdirSync(path.dirname(filledSheetPath), { recursive: true });
    writeFileSync(filledSheetPath, `${JSON.stringify(filledSheet, null, 2)}\n`, 'utf8');

    const staleSheetPath = path.join(root, 'runtime/pt028-human-review-decisions/stale-review-sheet.json');
    const staleSheet = {
      ...filledSheet,
      source: {
        ...filledSheet.source,
        review_pack_id: 'old_review_pack_id',
        decision_template_path: 'runtime/old/pt028-real-feedback-confirmation-decision.real.template.json'
      },
      window_reviews: filledSheet.window_reviews.map((review, index) => index === 0
        ? {
          ...review,
          task_id: 'old_feedback_collection_window_001',
          target_person_id: 'old_target_person'
        }
        : review)
    };
    writeFileSync(staleSheetPath, `${JSON.stringify(staleSheet, null, 2)}\n`, 'utf8');

    const staleCheckResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-human-review-decision.mjs'),
      `--root=${root}`,
      `--review=${staleSheetPath}`,
      `--output-dir=${path.join(root, 'runtime/pt028-human-review-decisions/check-stale')}`,
      '--check-only',
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(staleCheckResult.status, 2, staleCheckResult.stderr || staleCheckResult.stdout);
    const staleCheckStdout = JSON.parse(staleCheckResult.stdout);
    assert.equal(staleCheckStdout.gate_decision, 'human_review_sheet_check_needs_attention');
    assert.ok(staleCheckStdout.required_failures.includes('review_sheet_source_matches_current_pack'));
    assert.ok(staleCheckStdout.required_failures.includes('review_sheet_window_rows_match_current_tasks'));
    assert.equal(existsSync(targetPath), false);

    const incompleteCheckResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-human-review-decision.mjs'),
      `--root=${root}`,
      `--review=${templateStdout.review_sheet_template_path}`,
      `--output-dir=${path.join(root, 'runtime/pt028-human-review-decisions/check-incomplete')}`,
      '--check-only'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(incompleteCheckResult.status, 0, incompleteCheckResult.stderr || incompleteCheckResult.stdout);
    const incompleteCheckStdout = JSON.parse(incompleteCheckResult.stdout);
    assert.equal(incompleteCheckStdout.gate_decision, 'human_review_sheet_check_needs_attention');
    assert.equal(incompleteCheckStdout.check_only, true);
    assert.equal(incompleteCheckStdout.review_sheet_ready_for_decision_generation, false);
    assert.equal(incompleteCheckStdout.decision_output_path, null);
    assert.ok(incompleteCheckStdout.required_failures.includes('operator_reviewer_identity_complete'));
    assert.ok(incompleteCheckStdout.required_failures.includes('window_operator_decisions_selected'));
    assert.ok(incompleteCheckStdout.review_sheet_diagnostics.missing_global_confirmations.includes('real_windows_observed'));
    assert.ok(incompleteCheckStdout.review_sheet_diagnostics.first_window_failures[0].failed_checks.includes('operator_decision'));
    assert.equal(existsSync(incompleteCheckStdout.review_sheet_html_path), true);
    assert.equal(existsSync(targetPath), false);

    const completeCheckResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-human-review-decision.mjs'),
      `--root=${root}`,
      `--review=${filledSheetPath}`,
      `--output-dir=${path.join(root, 'runtime/pt028-human-review-decisions/check-complete')}`,
      '--check-only',
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(completeCheckResult.status, 0, completeCheckResult.stderr || completeCheckResult.stdout);
    const completeCheckStdout = JSON.parse(completeCheckResult.stdout);
    assert.equal(completeCheckStdout.gate_decision, 'human_review_sheet_check_ready');
    assert.equal(completeCheckStdout.check_only, true);
    assert.equal(completeCheckStdout.review_sheet_ready_for_decision_generation, true);
    assert.equal(completeCheckStdout.ready_for_finalization, false);
    assert.equal(completeCheckStdout.decision_output_path, null);
    assert.equal(existsSync(completeCheckStdout.review_sheet_markdown_path), true);
    assert.equal(existsSync(completeCheckStdout.review_sheet_html_path), true);
    assert.deepEqual(completeCheckStdout.required_failures, []);
    assert.equal(completeCheckStdout.review_sheet_diagnostics.unique_target_count >= 2, true);
    assert.equal(completeCheckStdout.human_review_fill_plan.current_review_sheet_exists, true);
    assert.equal(completeCheckStdout.human_review_fill_plan.unready_window_row_count, 0);
    assert.equal(existsSync(targetPath), false);

    const writerResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-human-review-decision.mjs'),
      `--root=${root}`,
      `--review=${filledSheetPath}`,
      `--output-dir=${path.join(root, 'runtime/pt028-human-review-decisions/complete')}`,
      '--run-controlled-preflight',
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(writerResult.status, 0, writerResult.stderr || writerResult.stdout);
    const writerStdout = JSON.parse(writerResult.stdout);
    assert.equal(writerStdout.gate_decision, 'human_review_decision_ready_for_finalization');
    assert.equal(writerStdout.ready_for_finalization, true);
    assert.equal(writerStdout.writes_real_feedback_target, false);
    assert.equal(writerStdout.controlled_preflight_chain.ready_for_controlled_target_write, true);
    assert.deepEqual(writerStdout.controlled_preflight_chain.required_failures, []);
    assert.deepEqual(writerStdout.controlled_preflight_chain.detail_failures, []);
    assert.deepEqual(writerStdout.controlled_preflight_chain.readiness_required_failures, []);
    assert.ok(writerStdout.human_review_fill_plan.command_order.some((item) => item.step_id === 'feedback_finalize' && item.writes_target_file === true));
    assert.equal(existsSync(writerStdout.decision_output_path), true);
    assert.equal(existsSync(targetPath), false);

    const coverageResult = spawnSync(process.execPath, [
      path.resolve('scripts/validate-pt028-feedback-collection-coverage.mjs'),
      `--root=${root}`,
      `--decision=${writerStdout.decision_output_path}`,
      `--output-dir=${path.join(root, 'runtime/pt028-feedback-collection-coverages/human-review-coverage')}`,
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(coverageResult.status, 0, coverageResult.stderr || coverageResult.stdout);
    const coverageStdout = JSON.parse(coverageResult.stdout);
    assert.equal(coverageStdout.ready_for_confirmation_preflight, true);

    const preflightResult = spawnSync(process.execPath, [
      path.resolve('scripts/preflight-pt028-real-feedback-confirmation.mjs'),
      `--root=${root}`,
      `--decision=${writerStdout.decision_output_path}`,
      `--coverage=${coverageStdout.json_path}`,
      `--output-dir=${path.join(root, 'runtime/pt028-feedback-confirmation-preflights/human-review-preflight')}`,
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(preflightResult.status, 0, preflightResult.stderr || preflightResult.stdout);
    const preflightStdout = JSON.parse(preflightResult.stdout);
    assert.equal(preflightStdout.ready_for_controlled_target_write, true);
    assert.equal(preflightStdout.writes_real_feedback_target, false);
    assert.equal(existsSync(targetPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 acceptance chain remains blocked without real feedback target', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const targetPath = path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json');
    const sessionStateDir = path.join(root, 'runtime/pt028-acceptance-session-states');
    mkdirSync(sessionStateDir, { recursive: true });
    const sessionTasks = ['a', 'b'].map((suffix, index) => {
      const windowId = `acceptance_session_window_${suffix}`;
      const targetPersonId = `person_acceptance_session_${suffix}`;
      const state = buildPt028GuiDecisionState({
        stateId: `acceptance_session_state_${suffix}`,
        source: {
          source_type: 'unit_test_acceptance_chain_collection_session',
          window_id: windowId,
          app_type: 'wechat'
        }
      });
      const stateWithTarget = {
        ...state,
        source_decision: {
          ...state.source_decision,
          target_person_id: targetPersonId,
          target_display_name: `AcceptanceSession${suffix.toUpperCase()}`
        }
      };
      const statePath = path.join(sessionStateDir, `${stateWithTarget.state_id}.json`);
      writeFileSync(statePath, `${JSON.stringify(stateWithTarget, null, 2)}\n`, 'utf8');
      return {
        task_id: `acceptance_session_task_${index + 1}`,
        window_id: windowId,
        app_type: 'wechat',
        target_person_id: targetPersonId,
        state_path: path.relative(root, statePath).replace(/\\/g, '/'),
        candidate_prefill_only: true,
        real_send_allowed: false,
        ready_for_real_feedback_target_write: false,
        status: 'pending_operator_real_window_review'
      };
    });
    const sessionPath = path.join(root, 'runtime/pt028-feedback-collection-sessions/latest.json');
    mkdirSync(path.dirname(sessionPath), { recursive: true });
    writeFileSync(sessionPath, `${JSON.stringify({
      schema_version: 'pt028_feedback_collection_session.v1',
      session_id: 'pt028_acceptance_chain_collection_session',
      gate_decision: 'ready_for_operator_window_feedback_collection',
      ready_for_operator_feedback_collection: true,
      real_execution_allowed: false,
      real_send_attempted: false,
      writes_real_feedback_target: false,
      collection_scope: {
        task_count: 2,
        distinct_target_count: 2,
        candidate_prefill_only: true,
        all_real_send_disallowed: true
      },
      operator_collection_tasks: sessionTasks
    }, null, 2)}\n`, 'utf8');

    const outputDir = path.join(root, 'runtime/pt028-acceptance-chains/no-feedback');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/run-pt028-acceptance-chain.mjs'),
      `--root=${root}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'run-pt028-acceptance-chain');
    assert.equal(stdout.gate_decision, 'pt028_acceptance_chain_blocked');
    assert.equal(stdout.pt028_fully_accepted_for_production, false);
    assert.equal(stdout.feedback_exists, false);
    assert.ok(stdout.required_failures.includes('feedback_bound_multi_window_event_stream'));
    assert.equal(stdout.required_failures.includes('low_latency_event_stream'), false);
    assert.ok(stdout.required_failures.includes('real_feedback_readiness_gate'));
    assert.equal(existsSync(targetPath), false);
    const chain = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(chain.collection_session_path, 'runtime/pt028-feedback-collection-sessions/latest.json');
    const eventStreamStep = chain.steps.find((step) => step.step_id === 'event_stream');
    assert.equal(eventStreamStep.stdout_json.input_mode, 'operator_collection_session_window_states');
    assert.equal(eventStreamStep.stdout_json.window_count, 2);
    assert.equal(eventStreamStep.stdout_json.target_count, 2);
    const healthStep = chain.steps.find((step) => step.step_id === 'event_stream_health');
    assert.equal(healthStep.gate_decision, 'event_stream_ready_for_low_latency_gui_subscription');
    assert.deepEqual(healthStep.required_failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 acceptance status summarizes remaining real feedback and review gates read-only', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    const targetPath = path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json');
    const eventStreamPath = path.join(root, 'runtime/pt028-gui-event-streams/latest.json');
    mkdirSync(path.dirname(eventStreamPath), { recursive: true });
    writeFileSync(eventStreamPath, `${JSON.stringify({
      schema_version: 'pt028_gui_event_stream.v1',
      stream_id: 'pt028_gui_event_stream_status_test',
      created_at: '2026-06-20T10:10:00.000Z',
      gate_decision: 'ready_for_low_latency_gui_subscription',
      required_failures: [],
      source: {
        input_mode: 'operator_collection_session_window_states'
      },
      low_latency_policy: {
        desktop_ipc_channel: 'zhineng:decision-state:changed',
        target_dispatch_latency_ms: 50,
        debounce_ms: 50,
        fallback_poll_interval_ms: 1000
      },
      stream_integrity: {
        event_count: 2,
        unique_window_count: 2,
        unique_target_count: 2,
        all_events_prompt_only: true,
        real_execution_allowed: false,
        real_send_attempted: false
      },
      output_paths: {
        json_path: eventStreamPath
      }
    }, null, 2)}\n`, 'utf8');

    const healthPath = path.join(root, 'runtime/pt028-event-stream-health/latest.json');
    mkdirSync(path.dirname(healthPath), { recursive: true });
    writeFileSync(healthPath, `${JSON.stringify({
      schema_version: 'pt028_gui_event_stream_health.v1',
      health_id: 'pt028_event_stream_health_status_test',
      created_at: '2026-06-20T10:10:30.000Z',
      gate_decision: 'event_stream_ready_for_low_latency_gui_subscription',
      stream_summary: {
        schema_version: 'pt028_gui_event_stream.v1',
        gate_decision: 'ready_for_low_latency_gui_subscription',
        event_count: 2,
        unique_window_count: 2,
        unique_target_count: 2,
        input_mode: 'operator_collection_session_window_states',
        ipc_channel: 'zhineng:decision-state:changed',
        target_dispatch_latency_ms: 50,
        debounce_ms: 50,
        fallback_poll_interval_ms: 1000
      },
      required_failures: [],
      output_paths: {
        json_path: healthPath
      }
    }, null, 2)}\n`, 'utf8');

    const acceptancePath = path.join(root, 'runtime/pt028-acceptance-chains/latest.json');
    mkdirSync(path.dirname(acceptancePath), { recursive: true });
    writeFileSync(acceptancePath, `${JSON.stringify({
      schema_version: 'pt028_acceptance_chain.v1',
      chain_id: 'pt028_acceptance_chain_status_test',
      gate_decision: 'pt028_acceptance_chain_blocked',
      pt028_fully_accepted_for_production: false,
      required_failures: [
        'feedback_bound_multi_window_event_stream',
        'real_feedback_readiness_gate',
        'real_feedback_calibration_evidence',
        'final_human_special_review'
      ]
    }, null, 2)}\n`, 'utf8');

    const finalAcceptancePath = path.join(root, 'runtime/pt028-final-special-acceptance/latest.json');
    mkdirSync(path.dirname(finalAcceptancePath), { recursive: true });
    writeFileSync(finalAcceptancePath, `${JSON.stringify({
      schema_version: 'pt028_final_special_acceptance.v1',
      acceptance_id: 'pt028_final_special_acceptance_status_test',
      gate_decision: 'blocked_pending_real_special_acceptance_evidence',
      pt028_fully_accepted_for_production: false,
      required_failures: ['final_human_special_review']
    }, null, 2)}\n`, 'utf8');

    const finalReviewPackHtmlPath = path.join(root, 'runtime/pt028-final-special-review-packs/status-test/pt028-final-special-review-pack.html');
    mkdirSync(path.dirname(finalReviewPackHtmlPath), { recursive: true });
    writeFileSync(finalReviewPackHtmlPath, '<!doctype html><div data-report-contract="pt028_final_special_review_pack.v1"></div>', 'utf8');
    const finalReviewPackPath = path.join(root, 'runtime/pt028-final-special-review-packs/latest.json');
    writeFileSync(finalReviewPackPath, `${JSON.stringify({
      schema_version: 'pt028_final_special_review_pack.v1',
      pack_id: 'pt028_final_special_review_pack_status_test',
      created_at: '2026-06-20T10:00:00.000Z',
      gate_decision: 'ready_for_human_special_review',
      output_paths: {
        html_path: finalReviewPackHtmlPath,
        latest_path: finalReviewPackPath
      }
    }, null, 2)}\n`, 'utf8');

    const reviewTemplatePath = path.join(root, 'runtime/pt028-human-review-decisions/status-test/pt028-human-review-decision.real.template.json');
    const reviewMarkdownPath = path.join(root, 'runtime/pt028-human-review-decisions/status-test/pt028-human-review-sheet.md');
    const reviewHtmlPath = path.join(root, 'runtime/pt028-human-review-decisions/status-test/pt028-human-review-sheet.html');
    mkdirSync(path.dirname(reviewTemplatePath), { recursive: true });
    writeFileSync(reviewTemplatePath, `${JSON.stringify({ schema_version: 'pt028_human_review_decision_sheet.v1' }, null, 2)}\n`, 'utf8');
    writeFileSync(reviewMarkdownPath, '# PT-028 Human Review Sheet\n', 'utf8');
    writeFileSync(reviewHtmlPath, '<!doctype html><div data-report-contract="pt028_human_review_sheet_view.v1"></div>', 'utf8');
    const humanReviewPath = path.join(root, 'runtime/pt028-human-review-decisions/latest.json');
    writeFileSync(humanReviewPath, `${JSON.stringify({
      schema_version: 'pt028_human_review_decision_writer.v1',
      writer_id: 'pt028_human_review_decision_writer_status_test',
      created_at: '2026-06-20T10:01:00.000Z',
      gate_decision: 'human_review_sheet_input_missing',
      check_only: true,
      review_sheet_ready_for_decision_generation: false,
      ready_for_finalization: false,
      writes_real_feedback_target: false,
      required_failures: ['review_sheet_input_present'],
      review_sheet_input_status: {
        schema_version: 'pt028_review_sheet_input_status.v1',
        review_path_requested: true,
        review_sheet_path: 'runtime/user-inputs/pt028-human-review-decision.real.json',
        review_sheet_exists: false,
        review_sheet_loaded: false,
        missing_input_failure: 'review_sheet_target_missing',
        next_action: 'Prepare runtime/user-inputs/pt028-human-review-decision.real.json from template, then rerun check-only.'
      },
      template_initial_diagnostics: {
        schema_version: 'pt028_human_review_sheet_diagnostics.v1',
        expected_window_review_count: 2,
        actual_window_review_count: 2,
        unique_target_count: 2,
        missing_global_confirmations: [
          'real_windows_observed',
          'target_binding_verified'
        ],
        missing_task_ids: [],
        failed_required_checks: [
          'global_operator_confirmations_complete',
          'window_operator_decisions_selected'
        ],
        window_review_diagnostics: [
          {
            row_index: 0,
            task_id: 'feedback_collection_window_001',
            target_person_id: 'person_status_001',
            target_display_name_hint: 'Status Target 1',
            failed_checks: ['operator_decision'],
            evidence_ref_count: 2,
            ready: false
          },
          {
            row_index: 1,
            task_id: 'feedback_collection_window_002',
            target_person_id: 'person_status_002',
            target_display_name_hint: 'Status Target 2',
            failed_checks: ['real_window_observed'],
            evidence_ref_count: 1,
            ready: false
          }
        ],
        decision_placeholder_paths: []
      },
      output_paths: {
        review_sheet_template_path: reviewTemplatePath,
        review_sheet_markdown_path: reviewMarkdownPath,
        review_sheet_html_path: reviewHtmlPath,
        decision_output_path: null,
        latest_path: humanReviewPath
      }
    }, null, 2)}\n`, 'utf8');

    const outputDir = path.join(root, 'runtime/pt028-acceptance-statuses/status-test');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-acceptance-status.mjs'),
      `--root=${root}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'write-pt028-acceptance-status');
    assert.equal(stdout.gate_decision, 'pt028_goal_open_waiting_for_real_human_feedback');
    assert.equal(stdout.pt028_fully_accepted_for_production, false);
    assert.ok(stdout.blocking_items.includes('real_feedback_readiness_gate'));
    assert.ok(stdout.blocking_items.includes('final_human_special_review'));
    assert.equal(stdout.human_handoff_freshness, 'stale_or_missing');
    assert.ok(stdout.human_handoff_stale_reasons.length >= 1);
    assert.equal(stdout.event_stream_summary.schema_version, 'pt028_acceptance_event_stream_summary.v1');
    assert.equal(stdout.event_stream_summary.event_count, 2);
    assert.equal(stdout.event_stream_summary.unique_window_count, 2);
    assert.equal(stdout.event_stream_summary.unique_target_count, 2);
    assert.equal(stdout.event_stream_summary.input_mode, 'operator_collection_session_window_states');
    assert.equal(stdout.event_stream_summary.ipc_channel, 'zhineng:decision-state:changed');
    assert.equal(stdout.event_stream_summary.prompt_only_boundary_preserved, true);
    assert.equal(stdout.event_stream_summary.writes_real_feedback_target, false);
    assert.equal(
      stdout.human_input_targets.filled_review_sheet_target_path,
      'runtime/user-inputs/pt028-human-review-decision.real.json'
    );
    assert.equal(stdout.human_input_targets.filled_review_sheet_target_exists, false);
    assert.ok(stdout.human_input_targets.check_only_command.includes('pt028-human-review-decision.real.json'));
    assert.equal(stdout.operator_action_queue.schema_version, 'pt028_operator_action_queue.v1');
    assert.equal(stdout.operator_action_queue.queue_status, 'operator_action_required');
    assert.equal(stdout.operator_action_queue.current_action_id, 'open_review_sheet_html');
    assert.equal(stdout.operator_action_queue.next_blocking_action_id, 'prepare_filled_review_sheet');
    assert.equal(stdout.operator_action_queue.boundary_policy.writes_real_user_input_files, false);
    assert.equal(existsSync(targetPath), false);

    const status = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    const byRequirement = Object.fromEntries(status.requirement_status.map((item) => [item.requirement_id, item]));
    assert.equal(byRequirement.low_latency_event_stream.status, 'passed');
    assert.ok(byRequirement.low_latency_event_stream.evidence.includes('event_count=2'));
    assert.ok(byRequirement.low_latency_event_stream.evidence.includes('unique_window_count=2'));
    assert.ok(byRequirement.low_latency_event_stream.evidence.includes('unique_target_count=2'));
    assert.ok(byRequirement.low_latency_event_stream.evidence.includes('input_mode=operator_collection_session_window_states'));
    assert.equal(byRequirement.feedback_bound_multi_window_event_stream.status, 'waiting_for_real_feedback');
    assert.equal(byRequirement.real_feedback_readiness_gate.status, 'waiting_for_real_feedback_target');
    assert.equal(byRequirement.real_feedback_calibration_evidence.status, 'dry_run_only_or_missing_real_feedback');
    assert.equal(byRequirement.final_human_special_review.status, 'waiting_for_filled_human_review');
    assert.equal(status.event_stream_summary.schema_version, 'pt028_acceptance_event_stream_summary.v1');
    assert.equal(status.event_stream_summary.event_count, 2);
    assert.equal(status.event_stream_summary.unique_window_count, 2);
    assert.equal(status.event_stream_summary.unique_target_count, 2);
    assert.equal(status.event_stream_summary.input_mode, 'operator_collection_session_window_states');
    assert.equal(status.event_stream_summary.target_dispatch_latency_ms, 50);
    assert.equal(status.event_stream_summary.prompt_only_boundary_preserved, true);
    assert.equal(status.event_stream_summary.real_execution_allowed, false);
    assert.equal(status.boundary_policy.read_only_status_report, true);
    assert.equal(status.boundary_policy.writes_real_feedback_target, false);
    assert.equal(status.operator_action_queue.schema_version, 'pt028_operator_action_queue.v1');
    assert.equal(status.operator_action_queue.source, 'pt028_acceptance_status');
    assert.equal(status.operator_action_queue.current_action_id, 'open_review_sheet_html');
    assert.equal(status.operator_action_queue.next_blocking_action_id, 'prepare_filled_review_sheet');
    assert.equal(status.operator_action_queue.pending_action_count, 6);
    assert.equal(status.operator_action_queue.boundary_policy.read_only_status_report, true);
    assert.equal(status.operator_action_queue.boundary_policy.writes_real_user_input_files, false);
    assert.equal(status.operator_action_queue.boundary_policy.writes_real_feedback_target, false);
    assert.equal(status.operator_action_queue.boundary_policy.real_send_attempted, false);
    const actionsById = Object.fromEntries(status.operator_action_queue.actions.map((action) => [action.action_id, action]));
    assert.equal(actionsById.open_review_sheet_html.status, 'ready');
    assert.equal(actionsById.open_review_sheet_html.open_path.endsWith('pt028-human-review-sheet.html'), true);
    assert.equal(actionsById.prepare_filled_review_sheet.status, 'waiting_for_operator');
    assert.equal(actionsById.prepare_filled_review_sheet.target_path, 'runtime/user-inputs/pt028-human-review-decision.real.json');
    assert.equal(actionsById.prepare_filled_review_sheet.writes_target_file, true);
    assert.equal(actionsById.run_human_review_check_only.status, 'blocked_until_review_sheet_exists');
    assert.ok(actionsById.run_human_review_check_only.command.includes('--check-only'));
    assert.equal(actionsById.run_human_review_controlled_preflight.status, 'blocked_until_check_only_ready');
    assert.equal(actionsById.run_feedback_finalize.status, 'blocked_until_controlled_preflight_ready');
    assert.equal(actionsById.run_feedback_finalize.real_send_allowed, false);
    assert.equal(actionsById.run_acceptance_chain.status, 'blocked_until_real_feedback_target_exists');
    assert.equal(status.human_handoff.freshness.status, 'stale_or_missing');
    assert.equal(status.human_handoff.freshness.fresh_for_latest_sources, false);
    assert.equal(status.human_handoff.human_review_writer_summary.gate_decision, 'human_review_sheet_input_missing');
    assert.equal(status.human_handoff.human_review_writer_summary.check_only, true);
    assert.ok(status.human_handoff.human_review_writer_summary.required_failures.includes('review_sheet_input_present'));
    assert.equal(status.human_handoff.human_review_writer_summary.review_sheet_input_status.review_sheet_exists, false);
    assert.equal(
      status.human_handoff.human_review_writer_summary.review_sheet_input_status.missing_input_failure,
      'review_sheet_target_missing'
    );
    assert.equal(status.human_handoff.review_sheet_initial_diagnostics_summary.diagnostics_present, true);
    assert.equal(status.human_handoff.review_sheet_initial_diagnostics_summary.actual_window_review_count, 2);
    assert.equal(status.human_handoff.review_sheet_initial_diagnostics_summary.unique_target_count, 2);
    assert.ok(status.human_handoff.review_sheet_initial_diagnostics_summary.missing_global_confirmations.includes('real_windows_observed'));
    assert.ok(status.human_handoff.review_sheet_initial_diagnostics_summary.failed_required_checks.includes('window_operator_decisions_selected'));
    assert.equal(status.human_handoff.review_sheet_initial_diagnostics_summary.unready_window_count, 2);
    assert.ok(status.human_handoff.review_sheet_initial_diagnostics_summary.first_unready_windows[0].failed_checks.includes('operator_decision'));
    assert.ok(status.human_handoff.review_sheet_initial_diagnostics_summary.next_action.includes('pt028-human-review-decision.real.json'));
    assert.equal(
      status.human_handoff.human_review_fill_plan_summary.schema_version,
      'pt028_human_review_fill_plan_summary.v1'
    );
    assert.equal(
      status.human_handoff.human_review_fill_plan_summary.filled_review_sheet_target_path,
      'runtime/user-inputs/pt028-human-review-decision.real.json'
    );
    assert.equal(
      status.human_handoff.human_review_fill_plan_summary.real_feedback_target_path,
      'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json'
    );
    assert.equal(status.human_handoff.human_review_fill_plan_summary.current_review_sheet_exists, false);
    assert.equal(status.human_handoff.human_review_fill_plan_summary.unready_window_row_count, 2);
    assert.equal(status.human_handoff.human_review_fill_plan_summary.check_only_ready, false);
    assert.ok(status.human_handoff.human_review_fill_plan_summary.first_unready_window_rows[0].current_failed_checks.includes('operator_decision'));
    assert.ok(status.human_handoff.human_review_fill_plan_summary.command_order.some((item) => item.step_id === 'check_only'));
    assert.equal(status.human_handoff.human_review_fill_plan_summary.boundary_policy.writes_real_feedback_target, false);
    assert.equal(
      status.human_handoff.feedback_collection_summary.schema_version,
      'pt028_feedback_collection_summary.v1'
    );
    assert.equal(status.human_handoff.feedback_collection_summary.ready_for_operator_feedback_collection, false);
    assert.equal(status.human_handoff.feedback_collection_summary.ready_for_confirmation_preflight, false);
    assert.equal(status.human_handoff.feedback_collection_summary.writes_real_feedback_target, false);
    assert.ok(status.human_handoff.feedback_collection_summary.next_action.includes('pt028:feedback-handoff:validate'));
    assert.equal(
      status.human_handoff.human_input_targets.filled_review_sheet_target_path,
      'runtime/user-inputs/pt028-human-review-decision.real.json'
    );
    assert.equal(status.human_handoff.human_input_targets.filled_review_sheet_target_exists, false);
    assert.equal(status.human_handoff.human_input_targets.real_feedback_target_exists, false);
    assert.equal(status.human_handoff.human_input_targets.boundary_policy.status_report_writes_target_files, false);
    assert.ok(status.human_handoff.human_input_targets.controlled_preflight_command.includes('pt028-human-review-decision.real.json'));
    assert.equal(typeof status.human_handoff.freshness.latest_source_artifact_id, 'string');
    assert.ok(status.human_handoff.freshness.stale_reasons.includes(
      `final_review_pack_older_than_${status.human_handoff.freshness.latest_source_artifact_id}`
    ));
    assert.ok(status.human_handoff.freshness.stale_reasons.includes(
      `human_review_sheet_older_than_${status.human_handoff.freshness.latest_source_artifact_id}`
    ));
    assert.ok(status.next_commands.some((command) => command.includes('pt028:final-review-pack')));
    assert.equal(status.human_handoff.review_sheet_template_path.endsWith('pt028-human-review-decision.real.template.json'), true);
    assert.equal(status.human_handoff.review_sheet_markdown_path.endsWith('pt028-human-review-sheet.md'), true);
    assert.equal(status.human_handoff.review_sheet_html_path.endsWith('pt028-human-review-sheet.html'), true);
    assert.ok(status.next_commands.some((command) => command.includes('pt028:human-review-decision')));
    assert.equal(existsSync(stdout.latest_path), true);
    const markdown = readFileSync(stdout.markdown_path, 'utf8');
    assert.ok(markdown.includes('- event_stream_input_mode: operator_collection_session_window_states'));
    assert.ok(markdown.includes('- event_stream_event_count: 2'));
    assert.ok(markdown.includes('- event_stream_window_count: 2'));
    assert.ok(markdown.includes('- event_stream_target_count: 2'));
    assert.ok(markdown.includes('- prompt_only_boundary_preserved: true'));
    assert.ok(markdown.includes('- review_sheet_markdown: runtime/pt028-human-review-decisions/status-test/pt028-human-review-sheet.md'));
    assert.ok(markdown.includes('- review_sheet_html: runtime/pt028-human-review-decisions/status-test/pt028-human-review-sheet.html'));
    assert.ok(markdown.includes('- human_review_writer_gate: human_review_sheet_input_missing'));
    assert.ok(markdown.includes('- human_review_writer_input_missing: review_sheet_target_missing'));
    assert.ok(markdown.includes('- freshness: stale_or_missing'));
    assert.ok(markdown.includes('## Operator Action Queue'));
    assert.ok(markdown.includes('- queue_schema: pt028_operator_action_queue.v1'));
    assert.ok(markdown.includes('- current_action_id: open_review_sheet_html'));
    assert.ok(markdown.includes('prepare_filled_review_sheet'));
    assert.ok(markdown.includes('- initial_diagnostics_present: true'));
    assert.ok(markdown.includes('- initial_diagnostics_unready_window_count: 2'));
    assert.ok(markdown.includes('- fill_plan_schema: pt028_human_review_fill_plan_summary.v1'));
    assert.ok(markdown.includes('- fill_plan_unready_window_count: 2'));
    assert.ok(markdown.includes('feedback_collection_window_001'));
    assert.ok(markdown.includes('- collection_handoff_gate: missing'));
    assert.ok(markdown.includes('- collection_unconfirmed_task_ids: none'));
    assert.ok(markdown.includes('- filled_review_sheet_target: runtime/user-inputs/pt028-human-review-decision.real.json'));
    assert.ok(markdown.includes(`final_review_pack_older_than_${status.human_handoff.freshness.latest_source_artifact_id}`));

    const schema = JSON.parse(readFileSync(path.resolve('schemas/pt028-acceptance-status.schema.json'), 'utf8'));
    assert.equal(schema.properties.schema_version.const, 'pt028_acceptance_status.v1');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 acceptance status does not treat read-only handoff validation as a freshness source', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'zhineng-pt028-status-handoff-validation-'));
  try {
    const writeJson = (relativePath, payload) => {
      const targetPath = path.join(root, relativePath);
      mkdirSync(path.dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      return targetPath;
    };

    writeJson('runtime/pt028-event-stream-health/latest.json', {
      schema_version: 'pt028_gui_event_stream_health.v1',
      health_id: 'pt028_event_stream_health_handoff_validation_source_test',
      created_at: '2026-06-20T10:01:00.000Z',
      gate_decision: 'event_stream_ready_for_low_latency_gui_subscription',
      stream_summary: {
        schema_version: 'pt028_gui_event_stream.v1',
        gate_decision: 'ready_for_low_latency_gui_subscription',
        event_count: 2,
        unique_window_count: 2,
        unique_target_count: 2,
        input_mode: 'operator_collection_session_window_states',
        ipc_channel: 'zhineng:decision-state:changed',
        target_dispatch_latency_ms: 50,
        debounce_ms: 50,
        fallback_poll_interval_ms: 1000
      },
      required_failures: []
    });
    writeJson('runtime/pt028-acceptance-chains/latest.json', {
      schema_version: 'pt028_acceptance_chain.v1',
      chain_id: 'pt028_acceptance_chain_handoff_validation_source_test',
      created_at: '2026-06-20T10:02:00.000Z',
      gate_decision: 'pt028_acceptance_chain_blocked',
      pt028_fully_accepted_for_production: false,
      required_failures: ['final_human_special_review']
    });
    writeJson('runtime/pt028-final-special-acceptance/latest.json', {
      schema_version: 'pt028_final_special_acceptance.v1',
      acceptance_id: 'pt028_final_special_acceptance_handoff_validation_source_test',
      created_at: '2026-06-20T10:03:00.000Z',
      gate_decision: 'blocked_pending_real_special_acceptance_evidence',
      pt028_fully_accepted_for_production: false,
      required_failures: ['final_human_special_review']
    });

    const reviewTemplatePath = writeJson('runtime/pt028-human-review-decisions/fresh-source/pt028-human-review-decision.real.template.json', {
      schema_version: 'pt028_human_review_decision_sheet.v1'
    });
    const reviewMarkdownPath = path.join(root, 'runtime/pt028-human-review-decisions/fresh-source/pt028-human-review-sheet.md');
    const reviewHtmlPath = path.join(root, 'runtime/pt028-human-review-decisions/fresh-source/pt028-human-review-sheet.html');
    writeFileSync(reviewMarkdownPath, '# PT-028 Human Review Sheet\n', 'utf8');
    writeFileSync(reviewHtmlPath, '<!doctype html><div data-report-contract="pt028_human_review_sheet_view.v1"></div>', 'utf8');

    writeJson('runtime/pt028-final-special-review-packs/latest.json', {
      schema_version: 'pt028_final_special_review_pack.v1',
      pack_id: 'pt028_final_special_review_pack_handoff_validation_source_test',
      created_at: '2026-06-20T10:05:00.000Z',
      gate_decision: 'ready_for_human_special_review',
      output_paths: {
        html_path: 'runtime/pt028-final-special-review-packs/fresh-source/pt028-final-special-review-pack.html'
      }
    });
    writeJson('runtime/pt028-human-review-decisions/latest.json', {
      schema_version: 'pt028_human_review_decision_writer.v1',
      writer_id: 'pt028_human_review_decision_writer_handoff_validation_source_test',
      created_at: '2026-06-20T10:06:00.000Z',
      gate_decision: 'human_review_sheet_template_written',
      check_only: false,
      review_sheet_ready_for_decision_generation: false,
      ready_for_finalization: false,
      writes_real_feedback_target: false,
      required_failures: ['review_sheet_input_present'],
      template_initial_diagnostics: {
        schema_version: 'pt028_human_review_sheet_diagnostics.v1',
        expected_window_review_count: 0,
        actual_window_review_count: 0,
        unique_target_count: 0,
        missing_global_confirmations: [],
        failed_required_checks: [],
        window_review_diagnostics: [],
        decision_placeholder_paths: []
      },
      output_paths: {
        review_sheet_template_path: reviewTemplatePath,
        review_sheet_markdown_path: reviewMarkdownPath,
        review_sheet_html_path: reviewHtmlPath
      }
    });
    writeJson('runtime/pt028-feedback-handoff-validations/latest.json', {
      schema_version: 'pt028_feedback_handoff_validation.v1',
      validation_id: 'pt028_feedback_handoff_validation_newer_than_handoff_test',
      created_at: '2026-06-20T10:07:00.000Z',
      gate_decision: 'ready_for_operator_feedback_collection',
      ready_for_operator_feedback_collection: true,
      required_failures: []
    });

    const result = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-acceptance-status.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-acceptance-statuses/fresh-source-test')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.human_handoff_freshness, 'fresh');
    assert.deepEqual(stdout.human_handoff_stale_reasons, []);

    const status = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(status.human_handoff.freshness.status, 'fresh');
    assert.equal(status.human_handoff.freshness.latest_source_artifact_id, 'final_special_acceptance');
    assert.equal(
      status.human_handoff.freshness.stale_reasons.some((item) => item.includes('feedback_handoff_validation')),
      false
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 operator acceptance handoff summarizes final human actions read-only', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'zhineng-pt028-operator-handoff-'));
  try {
    const reviewPackHtmlPath = path.join(root, 'runtime/pt028-final-special-review-packs/handoff-source/pt028-final-special-review-pack.html');
    const reviewSheetTemplatePath = path.join(root, 'runtime/pt028-human-review-decisions/handoff-source/pt028-human-review-decision.real.template.json');
    const reviewSheetMarkdownPath = path.join(root, 'runtime/pt028-human-review-decisions/handoff-source/pt028-human-review-sheet.md');
    const reviewSheetHtmlPath = path.join(root, 'runtime/pt028-human-review-decisions/handoff-source/pt028-human-review-sheet.html');
    mkdirSync(path.dirname(reviewPackHtmlPath), { recursive: true });
    mkdirSync(path.dirname(reviewSheetTemplatePath), { recursive: true });
    writeFileSync(reviewPackHtmlPath, '<!doctype html><div data-report-contract="pt028_final_special_review_pack.v1"></div>', 'utf8');
    writeFileSync(reviewSheetTemplatePath, `${JSON.stringify({ schema_version: 'pt028_human_review_decision_sheet.v1' }, null, 2)}\n`, 'utf8');
    writeFileSync(reviewSheetMarkdownPath, '# PT-028 Human Review Sheet\n', 'utf8');
    writeFileSync(reviewSheetHtmlPath, '<!doctype html><div data-report-contract="pt028_human_review_sheet_view.v1"></div>', 'utf8');

    const statusPath = path.join(root, 'runtime/pt028-acceptance-statuses/latest.json');
    mkdirSync(path.dirname(statusPath), { recursive: true });
    writeFileSync(statusPath, `${JSON.stringify({
      schema_version: 'pt028_acceptance_status.v1',
      status_id: 'pt028_acceptance_status_operator_handoff_test',
      gate_decision: 'pt028_goal_open_waiting_for_real_human_feedback',
      pt028_fully_accepted_for_production: false,
      blocking_items: [
        'feedback_bound_multi_window_event_stream',
        'real_feedback_readiness_gate',
        'real_feedback_calibration_evidence',
        'final_human_special_review'
      ],
      operator_action_queue: {
        schema_version: 'pt028_operator_action_queue.v1',
        source: 'pt028_acceptance_status',
        queue_status: 'operator_action_required',
        current_action_id: 'open_review_sheet_html',
        next_blocking_action_id: 'prepare_filled_review_sheet',
        pending_action_count: 6,
        actions: [
          {
            action_id: 'open_review_sheet_html',
            label: 'Open human review worksheet',
            status: 'ready',
            open_path: 'runtime/pt028-human-review-decisions/handoff-source/pt028-human-review-sheet.html',
            fallback_open_path: 'runtime/pt028-human-review-decisions/handoff-source/pt028-human-review-sheet.md',
            target_path: null,
            command: null,
            writes_target_file: false,
            writes_real_feedback_target: false,
            real_send_allowed: false,
            prompt_only_required: true
          },
          {
            action_id: 'prepare_filled_review_sheet',
            label: 'Prepare filled human review sheet',
            status: 'waiting_for_operator',
            open_path: 'runtime/pt028-human-review-decisions/handoff-source/pt028-human-review-decision.real.template.json',
            fallback_open_path: 'runtime/pt028-human-review-decisions/handoff-source/pt028-human-review-sheet.html',
            target_path: 'runtime/user-inputs/pt028-human-review-decision.real.json',
            command: 'Prepare runtime/user-inputs/pt028-human-review-decision.real.json from runtime/pt028-human-review-decisions/handoff-source/pt028-human-review-decision.real.template.json',
            writes_target_file: true,
            writes_real_feedback_target: false,
            real_send_allowed: false,
            prompt_only_required: true
          },
          {
            action_id: 'run_human_review_check_only',
            label: 'Run human review check-only gate',
            status: 'blocked_until_review_sheet_exists',
            open_path: null,
            fallback_open_path: null,
            target_path: 'runtime/user-inputs/pt028-human-review-decision.real.json',
            command: 'npm.cmd run pt028:human-review-decision -- --review=runtime/user-inputs/pt028-human-review-decision.real.json --check-only --fail-on-required',
            writes_target_file: false,
            writes_real_feedback_target: false,
            real_send_allowed: false,
            prompt_only_required: true
          },
          {
            action_id: 'run_human_review_controlled_preflight',
            label: 'Run controlled preflight',
            status: 'blocked_until_check_only_ready',
            open_path: null,
            fallback_open_path: null,
            target_path: 'runtime/user-inputs/pt028-human-review-decision.real.json',
            command: 'npm.cmd run pt028:human-review-decision -- --review=runtime/user-inputs/pt028-human-review-decision.real.json --run-controlled-preflight',
            writes_target_file: false,
            writes_real_feedback_target: false,
            real_send_allowed: false,
            prompt_only_required: true
          },
          {
            action_id: 'run_feedback_finalize',
            label: 'Run controlled real feedback finalization',
            status: 'blocked_until_controlled_preflight_ready',
            open_path: null,
            fallback_open_path: null,
            target_path: 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
            command: 'npm.cmd run pt028:feedback-finalize -- --decision=<generated-decision-output-path>',
            writes_target_file: false,
            writes_real_feedback_target: true,
            real_send_allowed: false,
            prompt_only_required: true
          },
          {
            action_id: 'run_acceptance_chain',
            label: 'Run feedback-bound acceptance chain',
            status: 'blocked_until_real_feedback_target_exists',
            open_path: null,
            fallback_open_path: null,
            target_path: 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
            command: 'npm.cmd run pt028:acceptance-chain -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
            writes_target_file: false,
            writes_real_feedback_target: false,
            real_send_allowed: false,
            prompt_only_required: true
          }
        ],
        boundary_policy: {
          read_only_status_report: true,
          writes_real_user_input_files: false,
          writes_real_feedback_target: false,
          real_execution_allowed: false,
          real_send_attempted: false,
          prompt_only_required: true
        }
      },
      event_stream_summary: {
        schema_version: 'pt028_acceptance_event_stream_summary.v1',
        event_stream_gate_decision: 'ready_for_low_latency_gui_subscription',
        event_health_gate_decision: 'event_stream_ready_for_low_latency_gui_subscription',
        event_count: 3,
        unique_window_count: 3,
        unique_target_count: 2,
        input_mode: 'operator_collection_session_window_states',
        ipc_channel: 'zhineng:decision-state:changed',
        target_dispatch_latency_ms: 50,
        debounce_ms: 50,
        fallback_poll_interval_ms: 1000,
        prompt_only_boundary_preserved: true,
        required_failures: [],
        real_execution_allowed: false,
        real_send_attempted: false,
        writes_real_feedback_target: false
      },
      human_handoff: {
        final_review_pack_path: 'runtime/pt028-final-special-review-packs/handoff-source/pt028-final-special-review-pack.html',
        review_sheet_template_path: 'runtime/pt028-human-review-decisions/handoff-source/pt028-human-review-decision.real.template.json',
        review_sheet_markdown_path: 'runtime/pt028-human-review-decisions/handoff-source/pt028-human-review-sheet.md',
        review_sheet_html_path: 'runtime/pt028-human-review-decisions/handoff-source/pt028-human-review-sheet.html',
        generated_decision_output_path: null,
        feedback_collection_summary: {
          schema_version: 'pt028_feedback_collection_summary.v1',
          handoff_gate_decision: 'ready_for_operator_feedback_collection',
          ready_for_operator_feedback_collection: true,
          session_gate_decision: 'ready_for_operator_window_feedback_collection',
          session_ready_for_operator_feedback_collection: true,
          task_count: 3,
          distinct_target_count: 2,
          coverage_gate_decision: 'collection_coverage_needs_attention',
          ready_for_confirmation_preflight: false,
          matched_task_count: 3,
          confirmed_task_count: 0,
          unconfirmed_task_ids: ['feedback_collection_window_001'],
          first_unconfirmed_failed_checks: ['operator_confirmed_real_window'],
          real_execution_allowed: false,
          real_send_attempted: false,
          writes_real_feedback_target: false
        },
        review_sheet_initial_diagnostics_summary: {
          schema_version: 'pt028_review_sheet_initial_diagnostics_summary.v1',
          diagnostics_present: true,
          actual_window_review_count: 3,
          unique_target_count: 2,
          unready_window_count: 3
        },
        human_input_targets: {
          schema_version: 'pt028_human_input_targets.v1',
          filled_review_sheet_target_path: 'runtime/user-inputs/pt028-human-review-decision.real.json',
          filled_review_sheet_target_exists: false,
          real_feedback_target_path: 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
          real_feedback_target_exists: false,
          check_only_command: 'npm.cmd run pt028:human-review-decision -- --review=runtime/user-inputs/pt028-human-review-decision.real.json --check-only --fail-on-required',
          controlled_preflight_command: 'npm.cmd run pt028:human-review-decision -- --review=runtime/user-inputs/pt028-human-review-decision.real.json --run-controlled-preflight',
          finalization_command: 'npm.cmd run pt028:feedback-finalize -- --decision=<generated-decision-output-path>',
          acceptance_chain_command: 'npm.cmd run pt028:acceptance-chain -- --feedback=runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json'
        }
      }
    }, null, 2)}\n`, 'utf8');

    const reviewPackPath = path.join(root, 'runtime/pt028-final-special-review-packs/latest.json');
    writeFileSync(reviewPackPath, `${JSON.stringify({
      schema_version: 'pt028_final_special_review_pack.v1',
      review_pack_id: 'pt028_final_special_review_pack_operator_handoff_test',
      ready_for_human_special_review: true,
      output_paths: {
        html_path: reviewPackHtmlPath,
        latest_path: reviewPackPath
      }
    }, null, 2)}\n`, 'utf8');

    const humanReviewPath = path.join(root, 'runtime/pt028-human-review-decisions/latest.json');
    mkdirSync(path.dirname(humanReviewPath), { recursive: true });
    writeFileSync(humanReviewPath, `${JSON.stringify({
      schema_version: 'pt028_human_review_decision_writer.v1',
      writer_id: 'pt028_human_review_decision_writer_operator_handoff_test',
      gate_decision: 'human_review_sheet_input_missing',
      review_sheet_ready_for_decision_generation: false,
      ready_for_finalization: false,
      output_paths: {
        review_sheet_template_path: reviewSheetTemplatePath,
        review_sheet_markdown_path: reviewSheetMarkdownPath,
        review_sheet_html_path: reviewSheetHtmlPath,
        decision_output_path: null,
        latest_path: humanReviewPath
      }
    }, null, 2)}\n`, 'utf8');

    const outputDir = path.join(root, 'runtime/pt028-operator-acceptance-handoffs/handoff-test');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-operator-acceptance-handoff.mjs'),
      `--root=${root}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'write-pt028-operator-acceptance-handoff');
    assert.equal(stdout.gate_decision, 'ready_for_operator_human_review_completion');
    assert.equal(stdout.pt028_fully_accepted_for_production, false);
    assert.equal(stdout.filled_review_sheet_target_exists, false);
    assert.equal(stdout.real_feedback_target_exists, false);
    assert.equal(stdout.real_execution_allowed, false);
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.ok(stdout.pending_operator_actions.includes('fill_real_human_review_sheet_target'));
    assert.equal(stdout.operator_action_queue.schema_version, 'pt028_operator_action_queue.v1');
    assert.equal(stdout.operator_action_queue.current_action_id, 'open_review_sheet_html');
    assert.equal(stdout.operator_action_queue.next_blocking_action_id, 'prepare_filled_review_sheet');
    assert.equal(stdout.operator_action_queue.boundary_policy.writes_real_user_input_files, false);
    assert.equal(existsSync(stdout.json_path), true);
    assert.equal(existsSync(stdout.html_path), true);

    const handoff = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(handoff.schema_version, 'pt028_operator_acceptance_handoff.v1');
    assert.equal(handoff.event_stream_summary.event_count, 3);
    assert.equal(handoff.event_stream_summary.input_mode, 'operator_collection_session_window_states');
    assert.equal(handoff.feedback_collection_summary.task_count, 3);
    assert.equal(handoff.feedback_collection_summary.confirmed_task_count, 0);
    assert.equal(handoff.boundary_policy.writes_real_user_input_files, false);
    assert.equal(handoff.boundary_policy.approves_human_review, false);
    assert.equal(handoff.operator_quickstart.schema_version, 'pt028_operator_quickstart.v1');
    assert.equal(handoff.operator_quickstart.status, 'operator_action_required');
    assert.equal(handoff.operator_quickstart.primary_next_action_id, 'open_final_special_review_pack');
    assert.equal(handoff.operator_quickstart.target_files.filled_review_sheet_target_path, 'runtime/user-inputs/pt028-human-review-decision.real.json');
    assert.equal(handoff.operator_quickstart.target_files.real_feedback_target_path, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json');
    assert.equal(handoff.operator_quickstart.boundary_policy.real_send_attempted, false);
    assert.equal(handoff.operator_action_queue.schema_version, 'pt028_operator_action_queue.v1');
    assert.equal(handoff.operator_action_queue.source, 'pt028_acceptance_status');
    assert.equal(handoff.operator_action_queue.current_action_id, 'open_review_sheet_html');
    assert.equal(handoff.operator_action_queue.next_blocking_action_id, 'prepare_filled_review_sheet');
    assert.ok(handoff.operator_action_queue.actions.some((item) => item.action_id === 'run_feedback_finalize'));
    assert.equal(handoff.operator_action_queue.boundary_policy.writes_real_feedback_target, false);
    assert.ok(handoff.operator_next_actions.some((item) => item.action_id === 'run_controlled_preflight'));
    assert.ok(readFileSync(stdout.html_path, 'utf8').includes('PT-028 Operator Acceptance Handoff'));
    assert.ok(readFileSync(stdout.html_path, 'utf8').includes('Operator Quickstart'));
    assert.ok(readFileSync(stdout.html_path, 'utf8').includes('Operator Action Queue'));
    assert.ok(readFileSync(stdout.markdown_path, 'utf8').includes('fill_real_human_review_sheet_target'));
    assert.ok(readFileSync(stdout.markdown_path, 'utf8').includes('current_action_id: open_review_sheet_html'));
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/pt028-human-review-decision.real.json')), false);
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json')), false);

    const schema = JSON.parse(readFileSync(path.resolve('schemas/pt028-operator-acceptance-handoff.schema.json'), 'utf8'));
    assert.equal(schema.properties.schema_version.const, 'pt028_operator_acceptance_handoff.v1');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 operator handoff refresh chain regenerates read-only final handoff latest', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    preparePt028FinalReviewSourceArtifacts({ root, label: 'refresh-chain' });

    const outputDir = path.join(root, 'runtime/pt028-operator-handoff-refresh-chains/refresh-chain');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/run-pt028-operator-handoff-refresh.mjs'),
      `--root=${root}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'run-pt028-operator-handoff-refresh');
    assert.equal(stdout.gate_decision, 'operator_handoff_refreshed_waiting_for_human_input');
    assert.equal(stdout.pt028_fully_accepted_for_production, false);
    assert.equal(stdout.step_count, 4);
    assert.deepEqual(stdout.failed_steps, []);
    assert.deepEqual(stdout.required_failures, []);
    assert.equal(stdout.real_execution_allowed, false);
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.equal(stdout.filled_review_sheet_target_exists, false);
    assert.equal(stdout.real_feedback_target_exists, false);
    assert.equal(stdout.feedback_input_detection.default_feedback_target_exists, false);
    assert.equal(stdout.feedback_input_detection.selected_feedback_source, 'none');
    assert.equal(stdout.feedback_input_detection.acceptance_chain_run, false);
    assert.equal(stdout.operator_action_queue_summary.schema_version, 'pt028_operator_action_queue_summary.v1');
    assert.equal(stdout.operator_action_queue_summary.current_action_id, 'open_review_sheet_html');
    assert.equal(stdout.operator_action_queue_summary.next_blocking_action_id, 'prepare_filled_review_sheet');
    assert.equal(stdout.operator_action_queue_summary.boundary_policy.writes_real_feedback_target, false);
    assert.equal(existsSync(stdout.json_path), true);
    assert.equal(existsSync(stdout.html_path), true);

    const chain = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(chain.schema_version, 'pt028_operator_handoff_refresh_chain.v1');
    assert.deepEqual(
      chain.steps.map((step) => step.step_id),
      ['final_review_pack', 'human_review_decision', 'acceptance_status', 'operator_handoff']
    );
    assert.ok(chain.steps.every((step) => step.ok === true));
    assert.ok(chain.steps.every((step) => step.real_send_attempted === false));
    assert.ok(chain.steps.every((step) => step.writes_real_feedback_target === false));
    assert.equal(chain.boundary_policy.writes_real_user_input_files, false);
    assert.equal(chain.boundary_policy.runs_feedback_finalization, false);
    assert.equal(chain.review_input_detection.selected_review_source, 'none');
    assert.equal(chain.review_input_detection.auto_check_only, false);
    assert.equal(chain.review_input_detection.check_only_mode, false);
    assert.equal(chain.review_input_detection.auto_controlled_preflight_run, false);
    assert.equal(chain.review_input_detection.auto_controlled_preflight_reason, 'not_applicable_without_default_review_auto_check');
    assert.equal(chain.controlled_preflight_summary.step_present, false);
    assert.equal(chain.controlled_preflight_summary.finalization_command, null);
    assert.equal(chain.human_review_fill_plan_summary.schema_version, 'pt028_human_review_fill_plan_summary.v1');
    assert.equal(chain.human_review_fill_plan_summary.step_present, true);
    assert.equal(chain.human_review_fill_plan_summary.current_review_sheet_exists, false);
    assert.equal(chain.human_review_fill_plan_summary.filled_review_sheet_target_path, 'runtime/user-inputs/pt028-human-review-decision.real.json');
    assert.equal(chain.human_review_fill_plan_summary.real_feedback_target_path, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json');
    assert.equal(chain.human_review_fill_plan_summary.unready_window_row_count >= 1, true);
    assert.ok(chain.human_review_fill_plan_summary.command_order.some((item) => item.step_id === 'check_only'));
    assert.equal(chain.human_review_fill_plan_summary.boundary_policy.writes_real_feedback_target, false);
    assert.equal(chain.operator_quickstart_summary.schema_version, 'pt028_operator_quickstart_summary.v1');
    assert.equal(chain.operator_quickstart_summary.status, 'operator_action_required');
    assert.equal(chain.operator_quickstart_summary.primary_next_action_id, 'open_final_special_review_pack');
    assert.equal(chain.operator_quickstart_summary.target_files.filled_review_sheet_target_path, 'runtime/user-inputs/pt028-human-review-decision.real.json');
    assert.ok(chain.operator_quickstart_summary.commands_in_order.some((command) => command.includes('pt028:feedback-finalize')));
    assert.equal(chain.operator_quickstart_summary.boundary_policy.real_send_attempted, false);
    assert.equal(chain.operator_action_queue_summary.schema_version, 'pt028_operator_action_queue_summary.v1');
    assert.equal(chain.operator_action_queue_summary.source_schema_version, 'pt028_operator_action_queue.v1');
    assert.equal(chain.operator_action_queue_summary.queue_status, 'operator_action_required');
    assert.equal(chain.operator_action_queue_summary.current_action_id, 'open_review_sheet_html');
    assert.equal(chain.operator_action_queue_summary.next_blocking_action_id, 'prepare_filled_review_sheet');
    assert.equal(chain.operator_action_queue_summary.pending_action_count, 6);
    assert.equal(chain.operator_action_queue_summary.boundary_policy.writes_real_user_input_files, false);
    assert.equal(chain.operator_action_queue_summary.boundary_policy.writes_real_feedback_target, false);
    assert.ok(chain.operator_action_queue_summary.actions.some((item) => item.action_id === 'run_feedback_finalize'));
    assert.equal(chain.feedback_input_detection.selected_feedback_source, 'none');
    assert.equal(chain.feedback_input_detection.acceptance_chain_mode, 'skipped_until_real_feedback_exists');
    assert.equal(chain.feedback_input_detection.acceptance_chain_run, false);
    assert.equal(chain.operator_handoff_summary.gate_decision, 'ready_for_operator_human_review_completion');
    assert.ok(chain.operator_handoff_summary.pending_operator_actions.includes('fill_real_human_review_sheet_target'));
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/pt028-human-review-decision.real.json')), false);
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json')), false);
    assert.ok(readFileSync(stdout.markdown_path, 'utf8').includes('does not run `pt028:feedback-finalize`'));
    assert.ok(readFileSync(stdout.markdown_path, 'utf8').includes('## Human Review Fill Plan Summary'));
    assert.ok(readFileSync(stdout.markdown_path, 'utf8').includes('## Operator Action Queue Summary'));
    assert.ok(readFileSync(stdout.html_path, 'utf8').includes('pt028_operator_handoff_refresh_chain.v1'));
    assert.ok(readFileSync(stdout.html_path, 'utf8').includes('Operator Action Queue Summary'));

    const latest = JSON.parse(readFileSync(path.join(root, 'runtime/pt028-operator-handoff-refresh-chains/latest.json'), 'utf8'));
    assert.equal(latest.refresh_id, chain.refresh_id);

    const nextStepOutputDir = path.join(root, 'runtime/pt028-operator-next-steps/next-step-test');
    const nextStepResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-operator-next-step.mjs'),
      `--root=${root}`,
      `--output-dir=${nextStepOutputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(nextStepResult.status, 0, nextStepResult.stderr || nextStepResult.stdout);
    const nextStepStdout = JSON.parse(nextStepResult.stdout);
    assert.equal(nextStepStdout.command, 'write-pt028-operator-next-step');
    assert.equal(nextStepStdout.gate_decision, 'operator_next_step_waiting_for_human_action');
    assert.equal(nextStepStdout.current_action_id, 'open_review_sheet_html');
    assert.equal(nextStepStdout.current_action_status, 'ready');
    assert.equal(nextStepStdout.next_blocking_action_id, 'prepare_filled_review_sheet');
    assert.equal(nextStepStdout.objective_progress_status, 'open_waiting_for_real_human_feedback');
    assert.ok(nextStepStdout.objective_track_statuses.some((item) => item.track_id === 'low_latency_event_stream' && item.passed === true));
    assert.ok(nextStepStdout.objective_track_statuses.some((item) => item.track_id === 'real_multi_window_feedback_calibration' && item.passed === false));
    assert.ok(nextStepStdout.objective_track_statuses.some((item) => item.track_id === 'final_special_acceptance' && item.passed === false));
    assert.equal(nextStepStdout.filled_review_sheet_target_exists, false);
    assert.equal(nextStepStdout.real_feedback_target_exists, false);
    assert.equal(nextStepStdout.real_send_attempted, false);
    assert.equal(nextStepStdout.writes_real_user_input_files, false);
    assert.equal(nextStepStdout.writes_real_feedback_target, false);
    assert.ok(nextStepStdout.top_blocking_failure_ids.includes('candidate_confirmation_not_resolved'));
    assert.equal(existsSync(nextStepStdout.html_path), true);

    const nextStep = JSON.parse(readFileSync(nextStepStdout.json_path, 'utf8'));
    assert.equal(nextStep.schema_version, 'pt028_operator_next_step.v1');
    assert.equal(nextStep.source_artifacts.real_feedback_finalization_path.endsWith('/latest.json'), true);
    assert.equal(nextStep.queue.schema_version, 'pt028_operator_next_step_queue.v1');
    assert.equal(nextStep.queue.source_schema_version, 'pt028_operator_action_queue.v1');
    assert.equal(nextStep.objective_progress.schema_version, 'pt028_operator_objective_progress.v1');
    assert.equal(nextStep.objective_progress.tracks.length, 3);
    assert.equal(nextStep.objective_progress.tracks.find((item) => item.track_id === 'low_latency_event_stream').status, 'passed');
    assert.equal(nextStep.objective_progress.tracks.find((item) => item.track_id === 'real_multi_window_feedback_calibration').status, 'waiting_for_real_feedback');
    assert.equal(nextStep.objective_progress.tracks.find((item) => item.track_id === 'final_special_acceptance').status, 'waiting_for_filled_human_review');
    assert.equal(nextStep.objective_progress.completion_gate.schema_version, 'pt028_operator_completion_gate.v1');
    assert.equal(nextStep.objective_progress.completion_gate.ready_to_mark_goal_complete, false);
    assert.deepEqual(nextStep.objective_progress.completion_gate.missing_track_ids, [
      'real_multi_window_feedback_calibration',
      'final_special_acceptance'
    ]);
    assert.deepEqual(nextStep.objective_progress.completion_gate.missing_target_file_ids, [
      'filled_human_review_sheet',
      'real_multi_window_operator_feedback'
    ]);
    assert.equal(
      nextStep.objective_progress.completion_gate.blocking_diagnostics.schema_version,
      'pt028_operator_blocking_diagnostics.v1'
    );
    assert.ok(
      nextStep.objective_progress.completion_gate.blocking_diagnostics.diagnostics.some((item) =>
        item.scope === 'readiness'
          && item.failure_ids.includes('candidate_confirmation_not_resolved')
      )
    );
    assert.equal(nextStep.current_action.action_id, 'open_review_sheet_html');
    assert.equal(nextStep.current_action.open_path.endsWith('pt028-human-review-sheet.html'), true);
    assert.equal(nextStep.target_status.filled_review_sheet_target_path, 'runtime/user-inputs/pt028-human-review-decision.real.json');
    assert.ok(nextStep.next_commands.some((command) => command.includes('pt028:feedback-finalize')));
    assert.equal(nextStep.boundary_policy.runs_feedback_finalization, false);
    assert.ok(readFileSync(nextStepStdout.markdown_path, 'utf8').includes('## Objective Progress'));
    assert.ok(readFileSync(nextStepStdout.markdown_path, 'utf8').includes('## Blocking Diagnostics'));
    assert.ok(readFileSync(nextStepStdout.markdown_path, 'utf8').includes('## Current Action'));
    assert.ok(readFileSync(nextStepStdout.html_path, 'utf8').includes('pt028_operator_next_step.v1'));
    assert.ok(readFileSync(nextStepStdout.html_path, 'utf8').includes('Objective Progress'));
    assert.ok(readFileSync(nextStepStdout.html_path, 'utf8').includes('Blocking Diagnostics'));
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/pt028-human-review-decision.real.json')), false);
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json')), false);

    const incompleteGateResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-pt028-operator-next-step.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-operator-next-steps/next-step-fail-test')}`,
      '--fail-on-incomplete'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(incompleteGateResult.status, 1);
    const incompleteGateStdout = JSON.parse(incompleteGateResult.stdout);
    assert.equal(incompleteGateStdout.ready_to_mark_goal_complete, false);
    assert.deepEqual(incompleteGateStdout.missing_target_file_ids, [
      'filled_human_review_sheet',
      'real_multi_window_operator_feedback'
    ]);
    assert.equal(existsSync(incompleteGateStdout.json_path), true);
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/pt028-human-review-decision.real.json')), false);
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json')), false);

    const schema = JSON.parse(readFileSync(path.resolve('schemas/pt028-operator-handoff-refresh-chain.schema.json'), 'utf8'));
    assert.equal(schema.properties.schema_version.const, 'pt028_operator_handoff_refresh_chain.v1');
    const nextStepSchema = JSON.parse(readFileSync(path.resolve('schemas/pt028-operator-next-step.schema.json'), 'utf8'));
    assert.equal(nextStepSchema.properties.schema_version.const, 'pt028_operator_next_step.v1');
    assert.equal(nextStepSchema.properties.objective_progress.properties.completion_gate.properties.schema_version.const, 'pt028_operator_completion_gate.v1');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 operator handoff refresh auto check-only detects default human review target', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    preparePt028FinalReviewSourceArtifacts({ root, label: 'refresh-auto-check' });

    const firstRefreshResult = spawnSync(process.execPath, [
      path.resolve('scripts/run-pt028-operator-handoff-refresh.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-operator-handoff-refresh-chains/first-refresh')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(firstRefreshResult.status, 0, firstRefreshResult.stderr || firstRefreshResult.stdout);
    const firstRefresh = JSON.parse(readFileSync(JSON.parse(firstRefreshResult.stdout).json_path, 'utf8'));
    const humanReviewStep = firstRefresh.steps.find((step) => step.step_id === 'human_review_decision');
    const templatePath = humanReviewStep.stdout_json.review_sheet_template_path;
    const defaultReviewPath = path.join(root, 'runtime/user-inputs/pt028-human-review-decision.real.json');
    mkdirSync(path.dirname(defaultReviewPath), { recursive: true });
    writeFileSync(defaultReviewPath, readFileSync(templatePath, 'utf8'), 'utf8');

    const secondRefreshResult = spawnSync(process.execPath, [
      path.resolve('scripts/run-pt028-operator-handoff-refresh.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-operator-handoff-refresh-chains/second-refresh')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(secondRefreshResult.status, 0, secondRefreshResult.stderr || secondRefreshResult.stdout);
    const stdout = JSON.parse(secondRefreshResult.stdout);
    assert.equal(stdout.review_input_detection.default_review_target_exists, true);
    assert.equal(stdout.review_input_detection.selected_review_source, 'default_user_input_target');
    assert.equal(stdout.review_input_detection.check_only_mode, true);
    assert.equal(stdout.review_input_detection.auto_check_only, true);
    assert.equal(stdout.review_input_detection.auto_controlled_preflight_run, false);
    assert.equal(stdout.review_input_detection.auto_controlled_preflight_reason, 'default_review_check_only_not_ready');
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.equal(stdout.real_feedback_target_exists, false);
    assert.equal(stdout.feedback_input_detection.selected_feedback_source, 'none');
    assert.equal(stdout.feedback_input_detection.acceptance_chain_run, false);

    const chain = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    const checkedHumanReviewStep = chain.steps.find((step) => step.step_id === 'human_review_decision');
    assert.equal(stdout.gate_decision, 'operator_handoff_refresh_needs_attention');
    assert.ok(stdout.required_failures.includes('human_review_decision_operator_reviewer_identity_complete'));
    assert.equal(checkedHumanReviewStep.gate_decision, 'human_review_sheet_check_needs_attention');
    assert.equal(checkedHumanReviewStep.stdout_json.check_only, true);
    assert.equal(checkedHumanReviewStep.stdout_json.review_sheet_ready_for_decision_generation, false);
    assert.ok(checkedHumanReviewStep.required_failures.includes('operator_reviewer_identity_complete'));
    assert.equal(chain.human_input_targets.filled_review_sheet_target_exists, true);
    assert.equal(chain.human_input_targets.real_feedback_target_exists, false);
    assert.equal(chain.steps.some((step) => step.step_id === 'human_review_controlled_preflight'), false);
    assert.equal(chain.controlled_preflight_summary.step_present, false);
    assert.equal(chain.controlled_preflight_summary.ready_for_controlled_target_write, false);
    assert.equal(chain.human_review_fill_plan_summary.current_review_sheet_exists, true);
    assert.equal(chain.human_review_fill_plan_summary.current_review_sheet_loaded, true);
    assert.equal(chain.human_review_fill_plan_summary.check_only_ready, false);
    assert.ok(chain.human_review_fill_plan_summary.failed_required_checks.includes('operator_reviewer_identity_complete'));
    assert.equal(chain.boundary_policy.runs_feedback_finalization, false);
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json')), false);
    assert.ok(readFileSync(stdout.markdown_path, 'utf8').includes('- auto_check_only: true'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 operator handoff refresh auto-runs controlled preflight after default human review passes check-only', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    preparePt028FinalReviewSourceArtifacts({ root, label: 'refresh-review-auto-preflight' });

    const firstRefreshResult = spawnSync(process.execPath, [
      path.resolve('scripts/run-pt028-operator-handoff-refresh.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-operator-handoff-refresh-chains/first-review-preflight-refresh')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(firstRefreshResult.status, 0, firstRefreshResult.stderr || firstRefreshResult.stdout);
    const firstRefresh = JSON.parse(readFileSync(JSON.parse(firstRefreshResult.stdout).json_path, 'utf8'));
    const humanReviewStep = firstRefresh.steps.find((step) => step.step_id === 'human_review_decision');
    const templatePath = humanReviewStep.stdout_json.review_sheet_template_path;
    const template = JSON.parse(readFileSync(templatePath, 'utf8'));
    const needsReplacement = (value) => typeof value !== 'string'
      || value.length === 0
      || value.includes('REPLACE_WITH')
      || value.includes('PLACEHOLDER')
      || value.includes('TEMPLATE');
    const filledReview = {
      ...template,
      reviewer: {
        reviewer_id: 'refresh_auto_preflight_reviewer',
        role: 'operator_or_human_special_reviewer',
        reviewed_at: '2026-06-20T19:00:00+08:00'
      },
      approve_controlled_feedback_target_write: true,
      global_confirmations: {
        real_windows_observed: true,
        target_binding_verified: true,
        prompt_only_confirmed: true,
        no_real_send_attempted: true,
        privacy_boundary_confirmed: true,
        human_special_review_complete: true
      },
      window_reviews: template.window_reviews.map((review, index) => {
        const reviewedWindowId = `refresh_auto_window_${index + 1}`;
        const reviewedTargetId = `person_refresh_auto_${index + 1}`;
        const reviewedTargetName = `Refresh Auto Target ${index + 1}`;
        const reviewedStatePath = needsReplacement(review.state_path)
          ? `runtime/reviewed/refresh-auto-state-${index + 1}.json`
          : review.state_path;
        const state = buildPt028GuiDecisionState({
          stateId: `refresh_auto_state_${index + 1}`,
          source: {
            source_type: 'unit_test_refresh_auto_review',
            window_id: reviewedWindowId,
            app_type: review.app_type ?? 'wechat'
          }
        });
        state.source_decision = {
          ...state.source_decision,
          target_person_id: reviewedTargetId,
          target_display_name: reviewedTargetName
        };
        const absoluteStatePath = path.join(root, reviewedStatePath);
        mkdirSync(path.dirname(absoluteStatePath), { recursive: true });
        writeFileSync(absoluteStatePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
        return ({
          ...review,
          window_id: reviewedWindowId,
          target_person_id: reviewedTargetId,
          target_display_name_hint: reviewedTargetName,
          state_path: reviewedStatePath,
          real_window_observed: true,
          state_target_verified: true,
          prompt_only_confirmed: true,
          no_real_send_attempted: true,
          privacy_boundary_confirmed: true,
          reviewed_at: '2026-06-20T19:00:00+08:00',
          operator_decision: index === 0
            ? 'prompt_accepted_for_manual_edit'
            : 'needs_context_before_progression',
          target_response_signal: index === 0
            ? 'warm_or_positive'
            : 'neutral_or_unknown',
          evidence_refs: [reviewedStatePath],
          notes: 'Human reviewer completed this default review row for refresh-chain controlled preflight.'
        });
      }),
      human_special_review: {
        ...template.human_special_review,
        approved_for_final_special_acceptance: true,
        reviewer_id: 'refresh_auto_preflight_final_reviewer',
        reviewed_at: '2026-06-20T19:05:00+08:00',
        notes: 'Final reviewer approved this default human review sheet for controlled preflight.'
      }
    };
    const sessionPath = path.join(root, 'runtime/pt028-feedback-collection-sessions/latest.json');
    const collectionSession = JSON.parse(readFileSync(sessionPath, 'utf8'));
    collectionSession.operator_collection_tasks = collectionSession.operator_collection_tasks.map((task, index) => {
      const review = filledReview.window_reviews[index] ?? {};
      return {
        ...task,
        window_id: review.window_id ?? task.window_id,
        target_person_id: review.target_person_id ?? task.target_person_id,
        target_display_name_hint: review.target_display_name_hint ?? task.target_display_name_hint,
        state_path: review.state_path ?? task.state_path,
        evidence_refs: review.evidence_refs ?? task.evidence_refs
      };
    });
    collectionSession.collection_scope = {
      ...collectionSession.collection_scope,
      distinct_target_count: new Set(collectionSession.operator_collection_tasks.map((task) => task.target_person_id).filter(Boolean)).size
    };
    writeFileSync(sessionPath, `${JSON.stringify(collectionSession, null, 2)}\n`, 'utf8');
    const defaultReviewPath = path.join(root, 'runtime/user-inputs/pt028-human-review-decision.real.json');
    mkdirSync(path.dirname(defaultReviewPath), { recursive: true });
    writeFileSync(defaultReviewPath, `${JSON.stringify(filledReview, null, 2)}\n`, 'utf8');

    const secondRefreshResult = spawnSync(process.execPath, [
      path.resolve('scripts/run-pt028-operator-handoff-refresh.mjs'),
      `--root=${root}`,
      `--output-dir=${path.join(root, 'runtime/pt028-operator-handoff-refresh-chains/second-review-preflight-refresh')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(secondRefreshResult.status, 0, secondRefreshResult.stderr || secondRefreshResult.stdout);
    const stdout = JSON.parse(secondRefreshResult.stdout);
    assert.equal(stdout.review_input_detection.default_review_target_exists, true);
    assert.equal(stdout.review_input_detection.auto_check_only, true);
    assert.equal(
      stdout.review_input_detection.auto_controlled_preflight_run,
      true,
      JSON.stringify({
        review_input_detection: stdout.review_input_detection,
        required_failures: stdout.required_failures
      }, null, 2)
    );
    assert.equal(stdout.review_input_detection.auto_controlled_preflight_reason, 'default_review_check_only_ready');
    assert.deepEqual(stdout.required_failures, []);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.equal(stdout.real_feedback_target_exists, false);

    const chain = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.deepEqual(
      chain.steps.map((step) => step.step_id),
      ['final_review_pack', 'human_review_decision', 'human_review_controlled_preflight', 'acceptance_status', 'operator_handoff']
    );
    const checkOnlyStep = chain.steps.find((step) => step.step_id === 'human_review_decision');
    const controlledStep = chain.steps.find((step) => step.step_id === 'human_review_controlled_preflight');
    assert.equal(checkOnlyStep.gate_decision, 'human_review_sheet_check_ready');
    assert.equal(checkOnlyStep.stdout_json.decision_output_path, null);
    assert.equal(controlledStep.gate_decision, 'human_review_decision_ready_for_finalization');
    assert.equal(controlledStep.stdout_json.ready_for_finalization, true);
    assert.equal(controlledStep.stdout_json.controlled_preflight_chain.ready_for_controlled_target_write, true);
    assert.equal(existsSync(controlledStep.stdout_json.decision_output_path), true);
    assert.equal(chain.controlled_preflight_summary.schema_version, 'pt028_controlled_preflight_summary.v1');
    assert.equal(chain.controlled_preflight_summary.step_present, true);
    assert.equal(chain.controlled_preflight_summary.ready_for_finalization, true);
    assert.equal(chain.controlled_preflight_summary.ready_for_controlled_target_write, true);
    assert.equal(chain.human_review_fill_plan_summary.current_review_sheet_exists, true);
    assert.equal(chain.human_review_fill_plan_summary.check_only_ready, true);
    assert.equal(chain.human_review_fill_plan_summary.controlled_preflight_ready, true);
    assert.equal(chain.human_review_fill_plan_summary.unready_window_row_count, 0);
    assert.ok(chain.human_review_fill_plan_summary.command_order.some((item) => item.step_id === 'feedback_finalize'));
    assert.equal(
      chain.controlled_preflight_summary.decision_output_path,
      'runtime/pt028-operator-handoff-refresh-chains/second-review-preflight-refresh/artifacts/human-review-controlled-preflight/pt028-real-feedback-confirmation-decision.real.json'
    );
    assert.equal(
      chain.controlled_preflight_summary.finalization_command,
      'npm.cmd run pt028:feedback-finalize -- --decision=runtime/pt028-operator-handoff-refresh-chains/second-review-preflight-refresh/artifacts/human-review-controlled-preflight/pt028-real-feedback-confirmation-decision.real.json'
    );
    assert.equal(chain.latest_artifacts.human_review_controlled_preflight_path, 'runtime/pt028-operator-handoff-refresh-chains/second-review-preflight-refresh/artifacts/human-review-controlled-preflight/pt028-human-review-decision-writer.json');
    assert.equal(chain.operator_handoff_summary.pending_operator_actions.includes('run_controlled_feedback_finalization'), true);
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json')), false);
    assert.ok(readFileSync(stdout.markdown_path, 'utf8').includes('- auto_controlled_preflight_run: true'));
    assert.ok(readFileSync(stdout.markdown_path, 'utf8').includes('controlled_preflight_finalization_command'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 operator handoff refresh auto-runs acceptance chain for default real feedback target', () => {
  const { root } = preparePt028FeedbackWorkpackRoot();
  try {
    preparePt028FinalReviewSourceArtifacts({ root, label: 'refresh-feedback-auto' });
    const decision = buildCompletePt028FeedbackConfirmationDecision(root);
    const feedbackPath = path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json');
    mkdirSync(path.dirname(feedbackPath), { recursive: true });
    writeFileSync(feedbackPath, `${JSON.stringify(decision.feedback_batch, null, 2)}\n`, 'utf8');
    const auditPath = path.join(root, 'runtime/pt028-audits/explicit-refresh-audit/pt028-romantic-flow-audit.json');
    mkdirSync(path.dirname(auditPath), { recursive: true });
    writeFileSync(auditPath, `${JSON.stringify({
      schema_version: 'pt028_romantic_flow_audit.v1',
      audit_id: 'pt028_refresh_feedback_explicit_audit',
      core_runtime_stage_tests_passed: true,
      real_execution_allowed: false,
      real_send_attempted: false
    }, null, 2)}\n`, 'utf8');

    const outputDir = path.join(root, 'runtime/pt028-operator-handoff-refresh-chains/feedback-refresh');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/run-pt028-operator-handoff-refresh.mjs'),
      `--root=${root}`,
      `--audit=${auditPath}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.feedback_input_detection.default_feedback_target_exists, true);
    assert.equal(stdout.feedback_input_detection.selected_feedback_source, 'default_user_input_target');
    assert.equal(stdout.feedback_input_detection.acceptance_chain_run, true);
    assert.equal(stdout.real_feedback_target_exists, true);
    assert.equal(stdout.gate_decision, 'pt028_operator_handoff_refresh_complete');
    assert.equal(stdout.pt028_fully_accepted_for_production, true);
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(stdout.writes_real_feedback_target, false);
    assert.deepEqual(stdout.required_failures, []);
    assert.equal(stdout.step_count, 5);

    const chain = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(chain.gate_decision, 'pt028_operator_handoff_refresh_complete');
    assert.equal(chain.pt028_fully_accepted_for_production, true);
    assert.equal(stdout.operator_quickstart_summary.status, 'final_acceptance_complete');
    assert.equal(chain.operator_quickstart_summary.status, 'final_acceptance_complete');
    assert.equal(chain.operator_quickstart_summary.primary_next_action_id, null);
    assert.deepEqual(chain.operator_quickstart_summary.commands_in_order, []);
    assert.equal(chain.operator_quickstart_summary.boundary_policy.writes_real_feedback_target, false);
    assert.equal(chain.operator_handoff_summary.gate_decision, 'pt028_operator_handoff_complete');
    assert.equal(chain.operator_handoff_summary.pending_operator_action_count, 0);
    assert.deepEqual(chain.operator_handoff_summary.pending_operator_actions, []);
    assert.deepEqual(
      chain.steps.map((step) => step.step_id),
      ['acceptance_chain', 'final_review_pack', 'human_review_decision', 'acceptance_status', 'operator_handoff']
    );
    const acceptanceStep = chain.steps.find((step) => step.step_id === 'acceptance_chain');
    const finalReviewStep = chain.steps.find((step) => step.step_id === 'final_review_pack');
    assert.equal(acceptanceStep.gate_decision, 'pt028_acceptance_chain_passed');
    assert.equal(acceptanceStep.stdout_json.pt028_fully_accepted_for_production, true);
    const finalReviewPack = JSON.parse(readFileSync(finalReviewStep.json_path, 'utf8'));
    assert.equal(finalReviewPack.evidence_summary.acceptance_chain_gate, 'pt028_acceptance_chain_passed');
    assert.equal(finalReviewPack.ready_for_human_special_review, true);
    assert.equal(chain.latest_artifacts.acceptance_chain_path, 'runtime/pt028-operator-handoff-refresh-chains/feedback-refresh/artifacts/acceptance-chain/pt028-acceptance-chain.json');
    assert.equal(chain.feedback_input_detection.acceptance_chain_mode, 'read_only_feedback_bound_validation');
    assert.equal(chain.human_input_targets.real_feedback_target_exists, true);
    assert.equal(chain.boundary_policy.writes_real_feedback_target, false);
    const operatorHandoffStep = chain.steps.find((step) => step.step_id === 'operator_handoff');
    const operatorHandoff = JSON.parse(readFileSync(operatorHandoffStep.json_path, 'utf8'));
    assert.equal(operatorHandoff.pending_operator_action_count, 0);
    assert.ok(operatorHandoff.operator_next_actions.every((action) => action.status === 'completed'));
    assert.equal(operatorHandoff.operator_quickstart.status, 'final_acceptance_complete');
    assert.equal(operatorHandoff.operator_quickstart.primary_next_action_id, null);
    assert.deepEqual(operatorHandoff.operator_quickstart.commands_in_order, []);
    assert.equal(operatorHandoff.operator_quickstart.boundary_policy.writes_real_feedback_target, false);
    assert.ok(readFileSync(stdout.markdown_path, 'utf8').includes('- feedback_acceptance_chain_run: true'));
    assert.ok(readFileSync(stdout.html_path, 'utf8').includes('read_only_feedback_bound_validation'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 acceptance chain passes with complete feedback and explicit audit evidence', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'zhineng-pt028-acceptance-chain-'));
  try {
    function stateForTarget({ stateId, windowId, targetPersonId, targetDisplayName }) {
      const state = buildPt028GuiDecisionState({
        stateId,
        source: {
          source_type: 'unit_test_acceptance_chain_state',
          window_id: windowId,
          app_type: 'wechat'
        }
      });
      return {
        ...state,
        source_decision: {
          ...state.source_decision,
          target_person_id: targetPersonId,
          target_display_name: targetDisplayName
        }
      };
    }

    const specs = [
      {
        windowId: 'chain_window_a',
        stateId: 'chain_state_a',
        targetPersonId: 'person_chain_a',
        targetDisplayName: 'ChainA',
        operatorDecision: 'prompt_accepted_for_manual_edit',
        responseSignal: 'warm_or_positive'
      },
      {
        windowId: 'chain_window_b',
        stateId: 'chain_state_b',
        targetPersonId: 'person_chain_b',
        targetDisplayName: 'ChainB',
        operatorDecision: 'needs_context_before_progression',
        responseSignal: 'neutral_or_unknown'
      }
    ];
    const feedbackBatch = {
      schema_version: 'pt028_real_multi_window_operator_feedback.v1',
      feedback_batch_id: 'pt028_acceptance_chain_complete_feedback',
      created_at: '2026-06-20T16:00:00+08:00',
      reviewer: {
        reviewer_id: 'acceptance_chain_operator',
        role: 'operator',
        reviewed_at: '2026-06-20T16:00:00+08:00'
      },
      window_feedback_records: specs.map((spec, index) => ({
        feedback_id: `feedback_chain_${index + 1}`,
        window_id: spec.windowId,
        app_type: 'wechat',
        target_person_id: spec.targetPersonId,
        target_display_name: spec.targetDisplayName,
        source_type: 'human_reviewed_real_window_feedback',
        operator_decision: spec.operatorDecision,
        target_response_signal: spec.responseSignal,
        state_path: `runtime/pt028-gui-decision-states/${spec.stateId}/pt028-gui-decision-state.json`,
        state_snapshot: stateForTarget(spec),
        real_window_observed: true,
        state_target_verified: true,
        prompt_only_confirmed: true,
        no_real_send_attempted: true,
        privacy_boundary_confirmed: true,
        reviewed_at: '2026-06-20T16:00:00+08:00',
        evidence_refs: [`https://example.test/pt028-chain/${index + 1}`],
        notes: 'Unit test complete real feedback fixture.'
      })),
      human_special_review: {
        approved_for_final_special_acceptance: true,
        reviewer_id: 'acceptance_chain_final_reviewer',
        reviewed_at: '2026-06-20T16:05:00+08:00',
        approval_scope: [
          'low_latency_event_stream',
          'real_multi_window_feedback_calibration',
          'prompt_only_send_gate',
          'privacy_boundary',
          'final_special_acceptance'
        ],
        notes: 'Explicit audit and human special review approve this unit-test fixture.'
      }
    };
    const feedbackPath = path.join(root, 'runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json');
    mkdirSync(path.dirname(feedbackPath), { recursive: true });
    writeFileSync(feedbackPath, `${JSON.stringify(feedbackBatch, null, 2)}\n`, 'utf8');
    const auditPath = path.join(root, 'runtime/pt028-audits/explicit-audit/pt028-romantic-flow-audit.json');
    mkdirSync(path.dirname(auditPath), { recursive: true });
    writeFileSync(auditPath, `${JSON.stringify({
      schema_version: 'pt028_romantic_flow_audit.v1',
      audit_id: 'pt028_acceptance_chain_explicit_audit',
      core_runtime_stage_tests_passed: true,
      real_execution_allowed: false,
      real_send_attempted: false
    }, null, 2)}\n`, 'utf8');

    const outputDir = path.join(root, 'runtime/pt028-acceptance-chains/complete');
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/run-pt028-acceptance-chain.mjs'),
      `--root=${root}`,
      `--feedback=${feedbackPath}`,
      `--audit=${auditPath}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.gate_decision, 'pt028_acceptance_chain_passed');
    assert.equal(stdout.pt028_fully_accepted_for_production, true);
    assert.deepEqual(stdout.required_failures, []);
    const chain = JSON.parse(readFileSync(stdout.json_path, 'utf8'));
    assert.equal(chain.final_acceptance_gate_decision, 'pt028_final_special_acceptance_passed');
    assert.ok(chain.steps.some((step) => step.step_id === 'event_stream' && step.stdout_json.window_count === 2));
    assert.ok(chain.steps.some((step) => (
      step.step_id === 'event_stream_health'
      && step.stdout_json.gate_decision === 'event_stream_ready_for_low_latency_gui_subscription'
    )));
    assert.ok(chain.steps.some((step) => step.step_id === 'feedback_readiness' && step.stdout_json.final_acceptance_ready === true));
    assert.ok(chain.steps.some((step) => step.step_id === 'feedback_calibration' && step.stdout_json.real_feedback_record_count === 2));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PT-028 sends new or identity-unconfirmed targets to context capture before relationship progression', () => {
  const decision = buildDecisionRecommendation({
    goalInput: {
      initial_goal: 'New desktop contact requires identity confirmation before relationship progression.',
      scene: 'personal_social',
      primary_person_id: 'person_new_contact',
      target_person_ids: ['person_new_contact'],
      target_display_name: 'NewContact',
      context_input: 'NewContact: hello, how have you been recently?',
      preferred_channel: 'wechat',
      identity_gate_decision: 'identity_unverified_desktop_context'
    },
    socialGraph: {
      user_id: 'user',
      people: [
        {
          person_id: 'person_new_contact',
          display_name: 'NewContact',
          tags: ['desktop_intake_candidate']
        }
      ],
      relationships: [
        {
          relationship_id: 'rel_user_new_contact',
          from_person_id: 'user',
          to_person_id: 'person_new_contact',
          type_code: 'acquaintance',
          phase: 'new',
          trust_level: 'low',
          health_score: 0.5
        }
      ],
      events: []
    },
    userPreferences: {
      automation_comfort: 'low',
      risk_tolerance: 'low',
      relationship_priority: 'high'
    }
  });

  assert.equal(decision.romantic_goal_analysis.primary_relationship_stage, 'R1');
  assert.equal(
    decision.romantic_goal_analysis.context_gap_diagnosis.diagnosis,
    'identity_or_window_unconfirmed'
  );
  assert.equal(
    decision.romantic_goal_analysis.context_gap_diagnosis.current_state_process_decision,
    'identity_confirmation_or_context_collection_hint'
  );
  assert.equal(
    decision.romantic_goal_analysis.output_delivery_policy.current_output_mode,
    'context_capture_hint'
  );
  assert.equal(decision.romantic_goal_analysis.output_delivery_policy.content_suggestion_available, false);
  assert.equal(decision.romantic_goal_analysis.output_delivery_policy.automatic_send_allowed, false);
  assert.equal(decision.independent_review.real_execution_allowed, false);
});

test('PT-028 romantic goal analysis covers R0-R6 and RX stage gates', () => {
  const buildStageDecision = ({ goalInput, relationship = {}, people = [] }) => {
    const targetPersonId = goalInput.primary_person_id ?? goalInput.target_person_ids?.[0] ?? null;
    const graphPeople = targetPersonId
      ? [
        {
          person_id: targetPersonId,
          display_name: goalInput.target_display_name ?? 'TargetA',
          roles: relationship.roles ?? [],
          tags: relationship.tags ?? []
        },
        ...people
      ]
      : people;
    const graphRelationships = targetPersonId
      ? [
        {
          relationship_id: `rel_user_${targetPersonId}`,
          from_person_id: 'user',
          to_person_id: targetPersonId,
          type_code: relationship.type_code ?? 'acquaintance',
          phase: relationship.phase ?? 'exploring',
          trust_level: relationship.trust_level ?? 'medium',
          health_score: relationship.health_score ?? 0.7,
          tags: relationship.tags ?? []
        }
      ]
      : [];

    return buildDecisionRecommendation({
      goalInput: {
        initial_goal: 'PT-028 阶段专项测试，验证目标分析、专家评审和发送阻断',
        scene: 'personal_social',
        preferred_channel: 'wechat',
        ...goalInput
      },
      socialGraph: {
        user_id: 'user',
        people: graphPeople,
        relationships: graphRelationships,
        events: []
      },
      userPreferences: {
        automation_comfort: 'low',
        risk_tolerance: 'low'
      }
    });
  };

  const cases = [
    {
      expected_stage: 'R0',
      expected_level: 'analysis_only',
      expected_sentence_gate: 'pt028_closure_incomplete_no_sentence_review',
      goalInput: {
        target_person_ids: [],
        context_input: 'Need identify the person and current relationship context first.'
      }
    },
    {
      expected_stage: 'R1',
      expected_level: 'draft_allowed',
      goalInput: {
        primary_person_id: 'person_stage_target',
        target_person_ids: ['person_stage_target'],
        target_display_name: 'TargetA',
        identity_labels: ['candidate_romantic_interest'],
        context_input: 'TargetA: I enjoy talking with you.'
      }
    },
    {
      expected_stage: 'R2',
      expected_level: 'draft_allowed',
      goalInput: {
        primary_person_id: 'person_stage_target',
        target_person_ids: ['person_stage_target'],
        target_display_name: 'TargetA',
        identity_labels: ['romantic_partner'],
        context_input: 'TargetA: I enjoy talking with you.'
      },
      relationship: {
        type_code: 'romantic_partner',
        phase: 'confirmed_romantic',
        roles: ['romantic_partner']
      }
    },
    {
      expected_stage: 'R3',
      expected_level: 'draft_allowed',
      goalInput: {
        primary_person_id: 'person_stage_target',
        target_person_ids: ['person_stage_target'],
        target_display_name: 'TargetA',
        identity_labels: ['romantic_partner'],
        context_input: 'TargetA: I want to hug you.'
      },
      relationship: {
        type_code: 'romantic_partner',
        phase: 'confirmed_romantic',
        roles: ['romantic_partner']
      }
    },
    {
      expected_stage: 'R4',
      expected_level: 'manual_review_required',
      goalInput: {
        primary_person_id: 'person_stage_target',
        target_person_ids: ['person_stage_target'],
        target_display_name: 'TargetA',
        identity_labels: ['romantic_partner'],
        context_input: 'TargetA: I want to kiss you.'
      },
      relationship: {
        type_code: 'romantic_partner',
        phase: 'confirmed_romantic',
        roles: ['romantic_partner']
      }
    },
    {
      expected_stage: 'R5',
      expected_level: 'manual_review_required',
      goalInput: {
        primary_person_id: 'person_stage_target',
        target_person_ids: ['person_stage_target'],
        target_display_name: 'TargetA',
        identity_labels: ['romantic_partner'],
        context_input: 'TargetA: We should discuss contraception and intimacy boundaries.'
      },
      relationship: {
        type_code: 'romantic_partner',
        phase: 'confirmed_romantic',
        roles: ['romantic_partner']
      }
    },
    {
      expected_stage: 'R6',
      expected_level: 'analysis_only',
      goalInput: {
        primary_person_id: 'person_stage_target',
        target_person_ids: ['person_stage_target'],
        target_display_name: 'TargetA',
        identity_labels: ['romantic_partner'],
        context_input: 'TargetA: confirmed physical intimacy record exists with mutual consent.'
      },
      relationship: {
        type_code: 'romantic_partner',
        phase: 'confirmed_romantic',
        roles: ['romantic_partner']
      }
    },
    {
      expected_stage: 'RX',
      expected_level: 'send_blocked',
      expected_risk_level: 'critical',
      goalInput: {
        primary_person_id: 'person_stage_target',
        target_person_ids: ['person_stage_target'],
        target_display_name: 'TargetA',
        identity_labels: ['romantic_partner'],
        context_input: 'TargetA: you must have sex or this relationship does not count.'
      },
      relationship: {
        type_code: 'romantic_partner',
        phase: 'confirmed_romantic',
        roles: ['romantic_partner']
      }
    }
  ];

  for (const item of cases) {
    const decision = buildStageDecision(item);
    assert.equal(decision.romantic_goal_analysis.schema_version, 'romantic_goal_analysis.v1');
    assert.equal(decision.romantic_goal_analysis.primary_relationship_stage, item.expected_stage);
    assert.equal(decision.romantic_goal_analysis.allowed_output_level, item.expected_level);
    assert.equal(decision.romantic_goal_analysis.send_gate_precondition.real_execution_allowed, false);
    assert.equal(decision.independent_review.real_execution_allowed, false);
    assert.equal(decision.romantic_goal_analysis.physical_intimacy_goal_state.optimization_kpi, false);
    assert.equal(decision.romantic_goal_analysis.physical_intimacy_goal_state.automatic_send_metric, false);
    assert.equal(
      decision.romantic_expert_sentence_review.gate_decision,
      item.expected_sentence_gate ?? 'sentence_expert_review_completed'
    );

    if (item.expected_stage === 'R6') {
      assert.equal(decision.romantic_goal_analysis.physical_intimacy_state, 'confirmed_by_mutual_consent');
      assert.equal(
        decision.romantic_goal_analysis.physical_intimacy_goal_state.current_status,
        'achieved_by_confirmed_record'
      );
    }
    if (item.expected_stage === 'RX') {
      assert.equal(decision.romantic_goal_analysis.pua_or_coercion_risk.risk_level, item.expected_risk_level);
      assert.equal(decision.romantic_goal_analysis.user_visible_log_decision.visible_to_user, true);
      assert.equal(decision.romantic_goal_analysis.user_visible_log_decision.visible_to_target, false);
    }
  }
});

test('keeps platform send behind confirmation when automation comfort is high', () => {
  const decision = buildDecisionRecommendation({
    goalInput: {
      initial_goal: '维护客户关系',
      scene: 'business',
      primary_person_id: 'person_client_a',
      context_input: '客户希望后续再沟通。',
      preferred_channel: 'wechat'
    },
    socialGraph,
    userPreferences: {
      automation_comfort: 'high'
    }
  });

  const platformOption = decision.ranked_options.find((option) => option.option_id === 'option_platform_send_after_confirmation');
  assert.ok(platformOption);
  const platformSkill = decision.skill_plan.skills.find((skill) => skill.skill_id === 'platform.message.send');
  if (decision.recommended_option.option_id === 'option_platform_send_after_confirmation') {
    assert.equal(platformSkill.requires_user_confirmation, true);
    assert.equal(decision.skill_plan.execution_mode, 'dry_run_until_user_confirms_connector');
    assert.equal(decision.deliberation.requires_human_review, true);
    assert.ok(decision.deliberation.proof_before_execution.includes('外部连接器授权记录'));
  }
});

test('runs parallel specialist experts and blocks execution when desktop identity is unresolved', () => {
  const decision = buildDecisionRecommendation({
    goalInput: {
      initial_goal: '推动客户进入技术评审',
      scene: 'business',
      source_type: 'desktop',
      platform: 'wechat',
      identity_gate_decision: 'identity_requires_user_confirmation',
      primary_person_id: 'person_client_a',
      target_person_ids: ['person_client_a', 'person_tech_lead'],
      context_input: '客户提到预算、合规材料和下周技术评审，但真实桌面接收只完成了身份候选。',
      preferred_channel: 'wechat'
    },
    socialGraph,
    userPreferences: {
      automation_comfort: 'high',
      risk_tolerance: 'low'
    }
  });

  assert.equal(decision.parallel_expert_analysis.schema_version, 'parallel_expert_analysis.v1');
  assert.equal(decision.parallel_expert_analysis.execution_mode, 'parallel_rule_based_v1');
  assert.ok(decision.parallel_expert_analysis.expert_opinions.length >= 5);
  assert.ok(decision.parallel_expert_analysis.selected_expert_ids.includes('sales_strategy_expert'));
  assert.ok(decision.parallel_expert_analysis.selected_expert_ids.includes('compliance_risk_expert'));
  assert.ok(decision.parallel_expert_analysis.selected_expert_ids.includes('desktop_send_safety_expert'));
  assert.ok(decision.parallel_expert_analysis.selected_expert_ids.includes('identity_context_expert'));
  assert.ok(decision.parallel_expert_analysis.hard_stop_signals.some((signal) => signal.signal === 'identity_not_confirmed'));
  assert.equal(decision.deliberation.requires_human_review, true);
  assert.ok(decision.deliberation.parallel_expert_coverage.complete);
  assert.ok(decision.deliberation.expert_proof_before_execution.includes('身份确认记录'));
});

test('calculates feedback ROI from outcome', () => {
  const roi = calculateFeedbackROI({
    decision_id: 'decision_test',
    option_id: 'option_low_commitment_message',
    outcome: {
      goal_progress: 0.8,
      relationship_change: 0.2,
      cost: 0,
      user_rating: 5
    }
  });

  assert.ok(roi.roi_score > 0.7);
});

test('generates unique decision ids under rapid calls', () => {
  const ids = new Set();
  for (let index = 0; index < 10; index += 1) {
    const decision = buildDecisionRecommendation({
      goalInput: {
        initial_goal: '推动客户进入技术评审',
        scene: 'business',
        primary_person_id: 'person_client_a',
        target_person_ids: ['person_client_a'],
        context_input: '客户说预算需要内部确认，技术负责人还没有参与。',
        preferred_channel: 'wechat'
      },
      socialGraph
    });
    ids.add(decision.decision_id);
  }

  assert.equal(ids.size, 10);
});
