import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  applyMvpUserFeedback,
  auditMvpObjectiveEvidence,
  buildDesktopContextBridge,
  buildMvpStatusDashboard,
  buildPt003PilotMaterials,
  buildReadOnlyExpansionGraphLoopVerification,
  evaluateMvpExternalInputReadiness,
  initializeMvpExternalInputTemplates,
  renderMvpStatusDashboard,
  normalizeMvpUserFeedback,
  renderMvpRunReport,
  runMvpLoop,
  runMvpLoopFromPilotImport,
  runMvpLoops,
  runMvpRealInputTrial,
  runMvpSelfAgentCycle,
  runMvpStressTest,
  validateProcessTreeSync,
  writeMvpStressTest,
  writeProcessTreeValidation,
  writeMvpStatusDashboard,
  writeMvpRunReport,
  writeMvpExternalInputReadiness,
  writeReadOnlyExpansionGraphLoopVerification,
  writePt003PilotMaterials
} from '../src/index.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-mvp-'));
}

function copySampleExternalInputs(root) {
  const inputDir = path.join(root, 'runtime/user-inputs');
  mkdirSync(inputDir, { recursive: true });
  copyFileSync(
    path.resolve('examples/pilot-import-batch.sample.json'),
    path.join(inputDir, 'pilot-import.real.json')
  );
  copyFileSync(
    path.resolve('examples/platform-snapshot.sample.html'),
    path.join(inputDir, 'platform-snapshot.real.html')
  );
  copyFileSync(
    path.resolve('examples/platform-snapshot-preview.sample.json'),
    path.join(inputDir, 'platform-snapshot-preview.real.json')
  );
}

function writePreparedExternalInputs(root) {
  const inputDir = path.join(root, 'runtime/user-inputs');
  mkdirSync(inputDir, { recursive: true });

  const batch = JSON.parse(readFileSync(path.resolve('examples/pilot-import-batch.sample.json'), 'utf8'));
  batch.import_id = 'pilot_import_real_client_a_controlled';
  batch.goal.initial_goal = '推动真实测试客户确认一次轻量技术评审';
  batch.records[0].content = '真实测试账号记录：客户希望先确认接口覆盖范围，同时预算仍需内部确认。';
  batch.records[1].content = '真实测试账号记录：公开页面显示客户正在补充运维和数据岗位，可能存在数字化项目窗口。';
  batch.semantic_hints[0].hint_id = 'hint_real_budget_unclear';
  writeFileSync(
    path.join(inputDir, 'pilot-import.real.json'),
    `${JSON.stringify(batch, null, 2)}\n`,
    'utf8'
  );

  const html = readFileSync(path.resolve('examples/platform-snapshot.sample.html'), 'utf8')
    .replace('Platform Snapshot Sample', 'Platform Snapshot Controlled Validation')
    .replace('automation_preview_snapshot_sample', 'automation_preview_real_validation_001')
    .replace(
      'Hi Zhang, I prepared a low-commitment review agenda and will wait for your confirmation before sending anything.',
      'Hi Zhang, this controlled validation draft confirms we will wait for manual approval before sending.'
    );
  writeFileSync(path.join(inputDir, 'platform-snapshot.real.html'), html, 'utf8');

  const preview = JSON.parse(readFileSync(path.resolve('examples/platform-snapshot-preview.sample.json'), 'utf8'));
  preview.preview_id = 'automation_preview_real_validation_001';
  preview.trigger_id = 'trigger_real_validation_001';
  preview.decision_id = 'decision_real_validation_001';
  preview.target.platform_handle = 'controlled_test_wechat_contact_client_a';
  preview.message_preview.draft = 'Hi Zhang, this controlled validation draft confirms we will wait for manual approval before sending.';
  writeFileSync(
    path.join(inputDir, 'platform-snapshot-preview.real.json'),
    `${JSON.stringify(preview, null, 2)}\n`,
    'utf8'
  );
}

test('runs the complete MVP loop through process-tree nodes', () => {
  const root = tempRoot();
  try {
    const result = runMvpLoop({
      root,
      fixturePath: path.resolve('examples/closed-loop-storage-mapping.json')
    });

    assert.equal(result.workflow, 'mvp_loop');
    assert.equal(result.loop_id, 'loop_client_a_tech_review');
    assert.equal(result.agent_opinions.length, 9);
    assert.ok(result.agent_opinions.includes('skill_agent'));
    assert.ok(result.agent_opinions.includes('roi_agent'));
    assert.ok(result.agent_opinions.includes('evidence_agent'));
    assert.ok(result.agent_opinions.includes('feedback_agent'));
    assert.equal(result.raw_events, 10);
    assert.equal(result.semantic_events, 6);
    assert.equal(result.feedback_records, 1);
    assert.ok(result.audit_records >= 8);
    assert.equal(result.quality.closed_loop_complete, true);
    assert.equal(result.quality.agent_opinion_complete, true);
    assert.equal(result.quality.index_rebuild_complete, true);
    assert.equal(result.quality.automation_preview_complete, true);
    assert.equal(result.quality.platform_dry_run_connector_complete, true);
    assert.equal(result.quality.automation_preview_reached, true);
    assert.equal(result.quality.real_execution_allowed, false);
    assert.equal(result.quality.automation_test_page_blocked, true);
    assert.equal(result.quality.real_user_review_complete, true);
    assert.equal(result.quality.optimization_result_complete, true);
    assert.equal(result.real_user_review.reviewer_persona, '真实B2B跟进用户');
    assert.ok(result.real_user_review.total_goal.includes('用户目标'));
    assert.ok(result.real_user_review.app_scene.includes('客户跟进'));
    assert.equal(result.real_user_review.checks.length, 6);
    assert.equal(result.real_user_review.conclusion, 'usable_with_minor_optimization');
    assert.ok(result.real_user_review.realism_score >= 0.85);
    assert.ok(result.optimization_result.applied_changes.some((change) => change.change_id === 'keep_confirmation_gate'));
    assert.ok(result.optimization_result.optimized_user_next_step.includes('人工确认'));
    assert.equal(result.automation_preview_trial.preview_reached, true);
    assert.equal(result.automation_preview_trial.real_execution_allowed, false);
    assert.equal(result.automation_preview_test_page.inspection.send_button_disabled, true);
    assert.equal(result.automation_preview_test_page.inspection.real_execution_blocked, true);
    assert.equal(result.automation_preview_test_page.platform_dry_run_connector_check.preview_reached, true);
    assert.equal(result.automation_preview_test_page.platform_dry_run_connector_check.send_blocked, true);
    assert.ok(
      result.decision.social_process_plan.event_summary.recent_events.every(
        (event) => event.event_id !== 'semantic_client_a_review_confirmed'
      )
    );
    assert.ok(result.storage_snapshot.indexes.person_event.entries.person_client_a);
    assert.ok(result.storage_snapshot.indexes.tag_event.entries['技术评审']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runs all MVP fixture loops and summarizes pilot gates', () => {
  const root = tempRoot();
  try {
    const batch = runMvpLoops({
      root,
      fixturePath: path.resolve('examples/closed-loop-storage-mapping.json')
    });

    assert.equal(batch.workflow, 'mvp_loop_batch');
    assert.equal(batch.results.length, 3);
    assert.equal(batch.summary.total_loops, 3);
    assert.equal(batch.summary.feedback_complete_loops, 3);
    assert.equal(batch.summary.closed_loop_complete_loops, 3);
    assert.equal(batch.summary.agent_opinion_complete_loops, 3);
    assert.equal(batch.summary.index_complete_loops, 3);
    assert.equal(batch.summary.audit_complete_loops, 3);
    assert.equal(batch.summary.automation_preview_complete_loops, 3);
    assert.equal(batch.summary.platform_dry_run_connector_complete_loops, 3);
    assert.equal(batch.summary.real_user_review_complete_loops, 3);
    assert.equal(batch.summary.optimization_complete_loops, 3);
    assert.equal(batch.summary.raw_event_count, 30);
    assert.equal(batch.summary.semantic_event_count, 18);
    assert.equal(batch.summary.gate_decision, 'continue');
    assert.equal(batch.summary.hard_exit_signals.length, 0);
    assert.ok(batch.summary.rates.closed_loop_completion >= 0.66);
    assert.equal(batch.summary.rates.automation_preview_completion, 1);
    assert.equal(batch.summary.rates.platform_dry_run_connector_completion, 1);
    assert.equal(batch.summary.rates.real_user_review_completion, 1);
    assert.equal(batch.summary.rates.optimization_completion, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runs a complete MVP loop from a pilot import batch', () => {
  const root = tempRoot();
  try {
    const result = runMvpLoopFromPilotImport({
      root,
      importPath: path.resolve('examples/pilot-import-batch.sample.json')
    });

    assert.equal(result.workflow, 'mvp_loop_from_pilot_import');
    assert.equal(result.import_id, 'pilot_import_client_a_realistic_sample');
    assert.equal(result.intake_readiness.schema_version, 'pilot_intake_readiness.v1');
    assert.equal(result.intake_readiness.gate_decision, 'continue_to_mvp_closed_loop');
    assert.deepEqual(result.intake_readiness.required_failures, []);
    assert.equal(result.import_summary.ready_for_mvp_sample, true);
    assert.equal(result.quality.import_semantic_coverage, 1);
    assert.equal(result.quality.intake_readiness_required, true);
    assert.equal(result.quality.intake_readiness_complete, true);
    assert.equal(result.agent_opinions.length, 9);
    assert.equal(result.raw_events, 10);
    assert.equal(result.semantic_events, 8);
    assert.equal(result.feedback_records, 1);
    assert.equal(result.decision.context_snapshot.event_snapshot.raw_event_count, 10);
    assert.equal(result.decision.context_snapshot.event_snapshot.raw_event_digest.length, 10);
    assert.ok(result.decision.context_snapshot.event_snapshot.raw_event_digest[0].content_summary.length > 0);
    assert.ok(result.audit_records >= 8);
    assert.equal(result.quality.closed_loop_complete, true);
    assert.equal(result.quality.feedback_complete, true);
    assert.equal(result.quality.writeback_complete, true);
    assert.equal(result.quality.index_rebuild_complete, true);
    assert.equal(result.quality.automation_preview_complete, true);
    assert.equal(result.quality.platform_dry_run_connector_complete, true);
    assert.equal(result.quality.real_execution_allowed, false);
    assert.equal(result.quality.real_user_review_complete, true);
    assert.equal(result.quality.optimization_result_complete, true);
    assert.equal(result.real_user_review.source, 'pilot_import_loop');
    assert.ok(result.real_user_review.total_goal.includes('用户目标'));
    assert.ok(result.real_user_review.app_scene.includes('客户跟进'));
    assert.equal(result.real_user_review.checks.length, 6);
    assert.equal(result.real_user_review.conclusion, 'usable_with_minor_optimization');
    assert.ok(result.message_draft.draft.includes('低承诺'));
    assert.ok(result.message_draft.draft.includes('接口覆盖'));
    assert.ok(result.message_draft.draft.includes('李工'));
    assert.equal(result.message_draft.draft.includes('我给李工'), false);
    assert.equal(result.message_draft.draft.includes('也方便户技术负责人'), false);
    assert.ok(result.manual_execution_checklist.some((item) => item.item_id === 'review_message_draft'));
    assert.ok(result.automation_preview.message_preview.draft.includes('低承诺'));
    assert.equal(result.automation_preview_test_page.platform_dry_run_connector_check.preview_reached, true);
    assert.equal(result.automation_preview_test_page.platform_dry_run_connector_check.real_execution_allowed, false);
    assert.ok(result.real_user_review.checks.some((check) => check.check_id === 'event_evidence'));
    assert.ok(result.optimization_result.next_iteration_inputs.includes('10 到 30 条真实互动记录'));
    assert.ok(result.storage_snapshot.indexes.tag_event.entries['客户推进']);
    assert.ok(
      result.storage_snapshot.semantic_events.some(
        (event) => event.metadata?.generated_by === 'mvp_runtime_import_feedback_writeback'
      )
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('bridges desktop observations into ContextSnapshot, parallel experts and message draft', () => {
  const observation = JSON.parse(readFileSync(path.resolve('examples/intake-observation.sightflow.sample.json'), 'utf8'));
  const bridge = buildDesktopContextBridge({
    observations: [observation],
    goal: {
      initial_goal: '根据桌面微信对话生成下一步低承诺回复',
      scene: 'business'
    }
  });

  assert.equal(bridge.schema_version, 'desktop_context_bridge.v1');
  assert.equal(bridge.gate_decision, 'desktop_context_ready_for_decision_trial');
  assert.equal(bridge.observation_count, 1);
  assert.equal(bridge.raw_observation_count, 1);
  assert.equal(bridge.effective_observation_count, 1);
  assert.equal(bridge.duplicate_suppressed_count, 0);
  assert.equal(bridge.real_execution_allowed, false);
  assert.equal(bridge.pilot_import_batch.records.length, 1);
  assert.equal(bridge.context_snapshot.schema_version, 'context_snapshot.v1');
  assert.equal(bridge.context_snapshot.event_snapshot.raw_event_count, 1);
  assert.ok(bridge.context_snapshot.context_sufficiency_score > 0);
  assert.equal(bridge.expert_matrix_analysis.schema_version, 'expert_matrix_analysis.v2');
  assert.equal(bridge.expert_matrix_analysis.parallel_analysis.parallelizable, true);
  assert.ok(bridge.expert_matrix_analysis.parallel_analysis.completed_expert_count >= 4);
  assert.ok(bridge.expert_matrix_analysis.selected_expert_ids.includes('game_theory_expert'));
  assert.ok(bridge.expert_matrix_analysis.selected_expert_ids.includes('psychology_expert'));
  assert.ok(bridge.expert_matrix_analysis.selected_expert_ids.includes('logic_expert'));
  assert.equal(bridge.theoretical_prediction.ranking_basis, 'predictive_value_only');
  assert.ok(bridge.theoretical_prediction.ranked_hypotheses.length >= 3);
  assert.equal(bridge.independent_review.real_execution_allowed, false);
  assert.ok(['needs_human_review', 'actionable_draft'].includes(bridge.independent_review.output_level));
  assert.ok(bridge.message_draft.draft.includes('低承诺'));
  assert.ok(bridge.checks.every((check) => check.status === 'pass'));
});

test('bridges personal social desktop observation without B2B reply drift', () => {
  const root = tempRoot();
  try {
    const bridge = buildDesktopContextBridge({
      graphRoot: root,
      observations: [
        {
          observation_id: 'intake_obs_sightflow_wechat_xiyan_reviewed_test',
          source_adapter_id: 'sightflow_desktop.wechat.reviewed_transcript',
          source_type: 'desktop',
          platform: 'wechat',
          source_actor_type: 'human_contact',
          captured_at: '2026-06-18T15:24:00+08:00',
          content_text: '会话对象：兮颜。用户发送表情；用户：咋就亲爱的了。兮颜：哈哈哈哈哈哈。兮颜：那是不是我男朋友嘛。兮颜：哼。用户：现在算吗？',
          content_summary: '当前选中的微信 1:1 对话对象为兮颜，内容呈现轻松亲密调侃和关系称呼试探。',
          participants_hint: ['user', '兮颜'],
          thread_hint: {
            channel: 'wechat',
            conversation_title: '兮颜',
            target_display_name: '兮颜'
          },
          window_ref: {
            app_type: 'wechat',
            window_title: '微信',
            capture_strategy: 'manual_visual_review'
          },
          raw_artifact_refs: ['runtime/desktop-inbox-real/test/wechat-window.png'],
          screenshot_hash: 'sha256:test_xiyan_screenshot_hash',
          privacy_level: 'artifact_allowed',
          confidence: 0.78,
          source_identity_hints: [
            {
              identity_type: 'thread_display_name',
              source_actor_type: 'human_contact',
              display_name: '兮颜',
              thread_key: 'wechat:兮颜',
              evidence_ref: 'runtime/desktop-inbox-real/test/wechat-window.png',
              confidence: 0.78
            }
          ],
          metadata: {
            real_execution_allowed: false,
            real_send_attempted: false,
            manual_visual_review: true
          }
        }
      ],
      goal: {
        initial_goal: '基于当前微信亲密调侃对话，生成轻松自然、低压力、可人工确认的下一句回复建议',
        scene: 'personal_social',
        preferred_channel: 'wechat'
      }
    });

    assert.equal(bridge.decision.scene, 'personal_social');
    assert.equal(bridge.pilot_import_batch.people[0].display_name, '兮颜');
    assert.equal(bridge.pilot_import_batch.relationships[0].type_code, 'acquaintance');
    assert.equal(bridge.candidate_intimate_relationships.length, 1);
    assert.equal(bridge.candidate_intimate_relationships[0].target_display_name, '兮颜');
    assert.equal(bridge.candidate_intimate_relationships[0].status, 'candidate');
    assert.equal(bridge.candidate_intimate_relationships[0].type_code, 'romantic_intimacy_candidate');
    assert.equal(bridge.candidate_intimate_relationships[0].requires_user_confirmation, true);
    assert.equal(
      bridge.pilot_import_batch.relationships[0].metadata.candidate_intimate_relationship_id,
      bridge.candidate_intimate_relationships[0].candidate_relationship_id
    );
    assert.ok(
      bridge.context_snapshot.event_snapshot.event_timeline.some(
        (event) => event.event_type_code === 'personal_relationship_signal'
      )
    );
    assert.equal(bridge.decision.recommended_option.option_id, 'option_personal_social_playful_reply');
    assert.ok(bridge.message_draft.draft.includes('试用期'));
    assert.equal(bridge.message_draft.draft.includes('评审'), false);
    assert.equal(bridge.independent_review.real_execution_allowed, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('uses confirmed romantic partner relationship instead of candidate intimacy after user confirmation', () => {
  const bridge = buildDesktopContextBridge({
    observations: [
      {
        observation_id: 'intake_obs_sightflow_wechat_xiyan_confirmed_test',
        source_adapter_id: 'sightflow_desktop.wechat.ocr',
        source_type: 'desktop',
        platform: 'wechat',
        source_actor_type: 'human_contact',
        captured_at: '2026-06-18T16:10:00+08:00',
        content_text: '\u5bf9\u8bdd\u5bf9\u8c61\uff1a\u516e\u989c\u3002\u516e\u989c\uff1a\u54ce\uff0c\u5bf9\u4f60\u4e0d\u62e7\u5df4\uff0c\u4f60\u637b\u637b\u637b\u3002',
        content_summary: '\u5f53\u524d\u9009\u4e2d\u7684\u5fae\u4fe1 1:1 \u5bf9\u8bdd\u5bf9\u8c61\u4e3a\u516e\u989c\uff0c\u5185\u5bb9\u5448\u73b0\u8f7b\u677e\u4eb2\u5bc6\u4e92\u52a8\u3002',
        participants_hint: ['user', '\u516e\u989c'],
        thread_hint: {
          channel: 'wechat',
          conversation_title: '\u516e\u989c',
          target_display_name: '\u516e\u989c'
        },
        window_ref: {
          app_type: 'wechat',
          window_title: 'wechat',
          capture_strategy: 'ocr'
        },
        raw_artifact_refs: ['runtime/desktop-inbox-real/test/wechat-window.png'],
        screenshot_hash: 'sha256:test_xiyan_confirmed_screenshot_hash',
        privacy_level: 'raw_text_allowed',
        confidence: 0.82,
        source_identity_hints: [
          {
            identity_type: 'thread_display_name',
            source_actor_type: 'human_contact',
            display_name: '\u516e\u989c',
            thread_key: 'wechat:\u516e\u989c',
            evidence_ref: 'runtime/desktop-inbox-real/test/wechat-window.png',
            confidence: 0.82
          }
        ],
        metadata: {
          real_execution_allowed: false,
          real_send_attempted: false,
          ocr_succeeded: true
        }
      }
    ],
    people: [
      {
        person_id: 'person_xiyan_confirmed',
        display_name: '\u516e\u989c',
        roles: ['romantic_partner'],
        tags: ['confirmed_by_user', 'desktop_intake_candidate', 'source_actor_type_human_contact'],
        source: 'user_confirmation'
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
        recent_event_ids: [],
        tags: ['confirmed_romantic_relationship', 'user_confirmed_relationship'],
        metadata: {
          relationship_fact_status: 'confirmed',
          confirmed_by: 'user',
          confirmation_source: 'user_message',
          previous_candidate_relationship_id: 'candidate_intimacy_rel_user_person_desktop_contact_5h7ef6',
          real_execution_allowed: false
        }
      }
    ],
    goal: {
      initial_goal: '\u5df2\u786e\u8ba4\u516e\u989c\u4e3a\u604b\u7231\u5bf9\u8c61\uff0c\u751f\u6210\u8f7b\u677e\u81ea\u7136\u3001\u4f4e\u538b\u529b\u3001\u53ef\u4eba\u5de5\u786e\u8ba4\u7684\u4e0b\u4e00\u53e5\u56de\u590d\u5efa\u8bae',
      scene: 'personal_social',
      primary_person_id: 'person_xiyan_confirmed',
      preferred_channel: 'wechat'
    }
  });

  assert.equal(bridge.pilot_import_batch.people[0].display_name, '\u516e\u989c');
  assert.equal(bridge.pilot_import_batch.relationships[0].type_code, 'romantic_partner');
  assert.equal(bridge.pilot_import_batch.relationships[0].metadata.relationship_fact_status, 'confirmed');
  assert.equal(bridge.candidate_intimate_relationships.length, 0);
  assert.equal(bridge.message_draft.relationship_context_status, 'confirmed_romantic_partner');
  assert.equal(bridge.message_draft.playbook_schema_version, 'intimate_relationship_reply_playbook.v1');
  assert.equal(bridge.message_draft.dynamic_context_basis.primary_identity_priority, 'romantic_partner_template_first');
  assert.equal(bridge.message_draft.must_confirm_before_send, true);
  assert.equal(
    bridge.independent_review.checks.find((check) => check.check_id === 'identity_safety').status,
    'pass'
  );
  assert.equal(
    bridge.independent_review.hard_stop_signals.some((signal) => signal.signal === 'identity_not_confirmed'),
    false
  );
  assert.equal(bridge.independent_review.output_level, 'actionable_draft');
  assert.equal(bridge.independent_review.real_execution_allowed, false);
});

test('reuses confirmed local graph identity for desktop observations before creating candidates', () => {
  const root = tempRoot();
  try {
    mkdirSync(path.join(root, 'data/people'), { recursive: true });
    writeFileSync(path.join(root, 'data/people/people.json'), JSON.stringify({
      schema_version: '0.1.0',
      people: [
        {
          person_id: 'person_xiyan_romantic_partner',
          display_name: '兮颜',
          aliases: ['兮颜', 'wechat:兮颜'],
          roles: ['romantic_partner'],
          tags: ['confirmed_by_user', 'romantic_partner', 'wechat_active_contact'],
          source: 'user_confirmation',
          metadata: {
            confirmed_by: 'user',
            source_thread_key: 'wechat:兮颜'
          }
        }
      ]
    }, null, 2));
    writeFileSync(path.join(root, 'data/people/relationships.json'), JSON.stringify({
      schema_version: '0.1.0',
      relationships: [
        {
          relationship_id: 'rel_user_xiyan_romantic_partner',
          from_person_id: 'user',
          to_person_id: 'person_xiyan_romantic_partner',
          type_code: 'romantic_partner',
          phase: 'confirmed_romantic',
          trust_level: 'medium',
          health_score: 0.72,
          recent_event_ids: [],
          tags: ['confirmed_romantic_relationship', 'user_confirmed_relationship'],
          metadata: {
            relationship_fact_status: 'confirmed',
            confirmed_by: 'user',
            previous_candidate_relationship_id: 'candidate_intimacy_rel_user_person_desktop_contact_5h7ef6'
          }
        }
      ]
    }, null, 2));

    const bridge = buildDesktopContextBridge({
      graphRoot: root,
      observations: [
        {
          observation_id: 'intake_obs_sightflow_wechat_xiyan_local_graph_test',
          source_adapter_id: 'sightflow_desktop.wechat.ocr',
          source_type: 'desktop',
          platform: 'wechat',
          source_actor_type: 'human_contact',
          captured_at: '2026-06-18T16:28:00+08:00',
          content_text: 'OCR标题区：兮颜。OCR聊天区：哎，对你不拧巴，你捏捏捏。',
          content_summary: 'PC WeChat window captured as a real read-only intake artifact; target is 兮颜.',
          participants_hint: ['user', '兮颜'],
          source_identity_hints: [
            {
              identity_type: 'thread_display_name',
              source_actor_type: 'human_contact',
              display_name: '兮颜',
              thread_key: 'wechat:兮颜',
              evidence_ref: 'runtime/desktop-inbox-real/test/ocr/title.png',
              confidence: 0.82
            }
          ],
          thread_hint: {
            channel: 'wechat',
            conversation_title: '兮颜',
            target_display_name: '兮颜',
            thread_key: 'wechat:兮颜'
          },
          raw_artifact_refs: ['runtime/desktop-inbox-real/test/wechat-window.png'],
          screenshot_hash: 'sha256:test_xiyan_confirmed_local_graph_hash',
          privacy_level: 'raw_text_allowed',
          confidence: 0.82,
          metadata: {
            real_execution_allowed: false,
            real_send_attempted: false
          }
        }
      ],
      goal: {
        initial_goal: '根据桌面微信对话生成下一步回复建议',
        scene: 'business',
        preferred_channel: 'wechat'
      }
    });

    assert.equal(bridge.identity_continuity.matched_from_confirmed_graph, true);
    assert.equal(bridge.identity_continuity.matched_person_id, 'person_xiyan_romantic_partner');
    assert.deepEqual(bridge.identity_continuity.matched_relationship_ids, ['rel_user_xiyan_romantic_partner']);
    assert.equal(bridge.pilot_import_batch.people[0].person_id, 'person_xiyan_romantic_partner');
    assert.equal(bridge.pilot_import_batch.relationships[0].type_code, 'romantic_partner');
    assert.equal(bridge.pilot_import_batch.records[0].linked_person_ids.includes('person_xiyan_romantic_partner'), true);
    assert.equal(bridge.pilot_import_batch.records[0].linked_relationship_ids.includes('rel_user_xiyan_romantic_partner'), true);
    assert.equal(
      bridge.pilot_import_batch.records[0].metadata.identity_continuity.previous_candidate_relationship_ids[0],
      'candidate_intimacy_rel_user_person_desktop_contact_5h7ef6'
    );
    assert.equal(bridge.candidate_intimate_relationships.length, 0);
    assert.equal(bridge.message_draft.relationship_context_status, 'confirmed_romantic_partner');
    assert.equal(bridge.message_draft.playbook_schema_version, 'intimate_relationship_reply_playbook.v1');
    assert.equal(bridge.message_draft.selected_template_id, 'confirmed_playful_affection');
    assert.equal(bridge.message_draft.draft.includes('评审'), false);
    assert.equal(bridge.decision.recommended_option.option_id, 'option_personal_social_playful_reply');
    assert.equal(
      bridge.independent_review.checks.find((check) => check.check_id === 'identity_safety').status,
      'pass'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('deduplicates repeated observations before generating PilotImportBatch records', () => {
  const observation = JSON.parse(readFileSync(path.resolve('examples/intake-observation.sightflow.sample.json'), 'utf8'));
  const bridge = buildDesktopContextBridge({
    observations: [observation, {
      ...observation,
      content_summary: `${observation.content_summary} repeated artifact copy`
    }],
    goal: {
      initial_goal: '鏍规嵁妗岄潰寰俊瀵硅瘽鐢熸垚涓嬩竴姝ヤ綆鎵胯鍥炲',
      scene: 'business'
    }
  });

  assert.equal(bridge.raw_observation_count, 2);
  assert.equal(bridge.observation_count, 1);
  assert.equal(bridge.effective_observation_count, 1);
  assert.equal(bridge.duplicate_suppressed_count, 1);
  assert.equal(bridge.duplicate_observation_groups.length, 1);
  assert.equal(bridge.pilot_import_batch.records.length, 1);
  assert.equal(bridge.context_snapshot.event_snapshot.raw_event_count, 1);
  assert.ok(
    bridge.checks.some((check) => check.check_id === 'duplicate_observations_deduplicated_for_pilot_import')
  );
  assert.ok(bridge.checks.every((check) => check.status === 'pass'));
});

test('deduplicates strict content fingerprint observations with different ids', () => {
  const observation = JSON.parse(readFileSync(path.resolve('examples/intake-observation.sightflow.sample.json'), 'utf8'));
  const duplicate = {
    ...observation,
    observation_id: 'intake_obs_sightflow_wechat_same_content_002',
    captured_at: '2026-06-10T08:34:00+08:00'
  };
  const bridge = buildDesktopContextBridge({
    observations: [observation, duplicate],
    goal: {
      initial_goal: 'Verify strict content-fingerprint duplicate handling',
      scene: 'business'
    }
  });

  assert.equal(bridge.raw_observation_count, 2);
  assert.equal(bridge.effective_observation_count, 1);
  assert.equal(bridge.duplicate_suppressed_count, 1);
  assert.equal(bridge.duplicate_observation_groups[0].dedupe_level, 'strict_content_fingerprint');
  assert.equal(bridge.duplicate_observation_groups[0].content_fingerprint.dedupe_ready, true);
  assert.equal(bridge.pilot_import_batch.records.length, 1);
  assert.equal(bridge.context_snapshot.event_snapshot.raw_event_count, 1);
});

test('does not infer official or unknown desktop sources as human contacts', () => {
  const observation = JSON.parse(readFileSync(path.resolve('examples/intake-observation.sightflow.sample.json'), 'utf8'));
  const officialAccountObservation = {
    ...observation,
    observation_id: 'intake_obs_wechat_official_account_001',
    source_actor_type: 'official_account',
    participants_hint: ['user', '微信'],
    source_identity_hints: [],
    thread_hint: {
      channel: 'wechat',
      conversation_title: '微信'
    }
  };
  const bridge = buildDesktopContextBridge({
    observations: [officialAccountObservation],
    goal: {
      initial_goal: 'Verify non-human source gate',
      scene: 'social'
    }
  });

  assert.equal(bridge.pilot_import_batch.people[0].display_name, 'unresolved_source_actor');
  assert.ok(bridge.pilot_import_batch.people[0].tags.includes('source_actor_requires_confirmation'));
  assert.ok(bridge.pilot_import_batch.people[0].tags.includes('source_actor_type_official_account'));
  assert.equal(bridge.pilot_import_batch.relationships[0].type_code, 'unverified_source_context');
  assert.equal(bridge.decision.context_snapshot.relationship_snapshot.target_people[0].display_name, 'unresolved_source_actor');
  assert.equal(bridge.decision.context_snapshot.goal.primary_person_id.startsWith('source_actor_'), true);
  assert.equal(bridge.decision.independent_review.output_level, 'needs_human_review');
  assert.equal(bridge.decision.independent_review.real_execution_allowed, false);
});

test('verifies read-only expansion and graph closed loop through shared intake gates', () => {
  const root = tempRoot();
  try {
    const report = buildReadOnlyExpansionGraphLoopVerification({
      root,
      pilotImportPath: path.resolve('examples/pilot-import-batch.sample.json'),
      observationPaths: [
        path.resolve('examples/intake-observation.sightflow.sample.json'),
        path.resolve('examples/intake-observation.sightflow.sample.json'),
        path.resolve('examples/intake-observation.browser.sample.json')
      ],
      conformancePairs: [
        {
          source_id: 'desktop_wechat_sample',
          capability_path: path.resolve('examples/source-adapter-capability.sample.json'),
          observation_path: path.resolve('examples/intake-observation.sightflow.sample.json')
        },
        {
          source_id: 'browser_dom_sample',
          capability_path: path.resolve('examples/source-adapter-capability.browser.sample.json'),
          observation_path: path.resolve('examples/intake-observation.browser.sample.json')
        }
      ]
    });
    const written = writeReadOnlyExpansionGraphLoopVerification({
      report,
      outputDir: path.join(root, 'runtime/desktop-context-bridges', report.verification_id)
    });

    assert.equal(report.schema_version, 'read_only_expansion_graph_loop_verification.v1');
    assert.equal(report.gate_decision, 'read_only_expansion_graph_loop_verified');
    assert.equal(report.real_execution_allowed, false);
    assert.equal(report.real_send_attempted, false);
    assert.equal(report.read_only_expansion.pilot_import.ready_for_closed_loop_mvp, true);
    assert.equal(report.read_only_expansion.raw_observation_count, 3);
    assert.equal(report.read_only_expansion.effective_observation_count, 2);
    assert.equal(report.read_only_expansion.duplicate_suppressed_count, 1);
    assert.equal(report.read_only_expansion.observations.length, 2);
    assert.equal(report.read_only_expansion.duplicate_observation_groups.length, 1);
    assert.ok(report.read_only_expansion.observations.every((item) => item.can_map_to_raw_event));
    assert.equal(report.read_only_expansion.source_adapter_conformance.filter((item) => item.ready_for_intake).length, 2);
    assert.equal(report.graph_closed_loop.quality.closed_loop_complete, true);
    assert.equal(report.graph_closed_loop.quality.real_execution_allowed, false);
    assert.ok(report.graph_closed_loop.path.relationship_event_graph.relationships >= 1);
    assert.ok(report.graph_closed_loop.path.relationship_event_graph.semantic_events >= 1);
    assert.ok(report.graph_closed_loop.path.expert_weight_judgment.completed_expert_count >= 3);
    assert.ok(report.graph_closed_loop.path.expert_weight_judgment.selected_expert_ids.includes('game_theory_expert'));
    assert.ok(Object.keys(report.graph_closed_loop.path.expert_weight_judgment.weights).length > 0);
    assert.equal(report.graph_closed_loop.path.draft_output.must_confirm_before_send, true);
    assert.ok(report.graph_closed_loop.path.feedback_writeback.writeback_event_ids.length > 0);
    assert.ok(report.future_intake_path.adapter_templates.some((item) => item.source_type === 'api'));
    assert.ok(report.checks.every((check) => check.severity !== 'required' || check.passed));
    assert.ok(existsSync(written.json_path));
    assert.ok(existsSync(written.markdown_path));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('blocks pilot import MVP loop when intake readiness is not closed-loop ready', () => {
  const root = tempRoot();
  try {
    const batch = JSON.parse(readFileSync(path.resolve('examples/pilot-import-batch.sample.json'), 'utf8'));
    batch.feedback_records = [];

    assert.throws(
      () => runMvpLoopFromPilotImport({
        root,
        importBatch: batch
      }),
      /Pilot intake readiness failed for full MVP loop/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('normalizes and applies user special-test feedback', () => {
  const feedback = JSON.parse(readFileSync(path.resolve('examples/mvp-user-feedback.sample.json'), 'utf8'));
  const normalized = normalizeMvpUserFeedback(feedback);

  assert.equal(normalized.feedback_id, 'mvp_user_feedback_client_a_001');
  assert.equal(normalized.score_average, 3.6667);
  assert.equal(normalized.low_score_fields.length, 2);
  assert.ok(normalized.flags.includes('message_too_generic'));

  const result = applyMvpUserFeedback({
    result: {
      workflow: 'mvp_loop_from_pilot_import',
      run_id: 'run_for_feedback_test',
      optimization_result: {
        optimization_id: 'mvp_optimization_test',
        optimized_user_next_step: '原始下一步',
        applied_changes: [],
        next_iteration_inputs: [],
        stop_or_adjust_when: []
      }
    },
    userFeedback: feedback
  });

  assert.equal(result.user_test_review.feedback_id, 'mvp_user_feedback_client_a_001');
  assert.equal(result.user_test_review.gate_decision, 'adjust');
  assert.equal(result.second_pass_optimization.gate_decision, 'adjust');
  assert.equal(result.optimization_result.user_feedback_applied, true);
  assert.ok(result.optimization_result.optimized_user_next_step.includes('专项测试反馈'));
  assert.ok(result.optimization_result.applied_changes.some(
    (change) => change.change_id === 'user_feedback_adjustment_1'
  ));
});

test('runs a pilot import loop with user feedback and renders second-pass report sections', () => {
  const root = tempRoot();
  try {
    const feedback = JSON.parse(readFileSync(path.resolve('examples/mvp-user-feedback.sample.json'), 'utf8'));
    const result = runMvpLoopFromPilotImport({
      root,
      importPath: path.resolve('examples/pilot-import-batch.sample.json'),
      userTestFeedback: feedback
    });
    const html = renderMvpRunReport(result);

    assert.equal(result.user_test_review.feedback_id, 'mvp_user_feedback_client_a_001');
    assert.equal(result.user_test_review.gate_decision, 'adjust');
    assert.equal(result.second_pass_optimization.gate_decision, 'adjust');
    assert.ok(result.second_pass_optimization.optimized_message_draft.draft.includes('低承诺'));
    assert.ok(result.second_pass_optimization.manual_execution_checklist.some(
      (item) => item.item_id === 'preview_platform_before_send'
    ));
    assert.equal(result.optimization_result.user_feedback_applied, true);
    assert.ok(result.optimization_result.optimized_message_draft.draft.includes('低承诺'));
    assert.ok(result.optimization_result.applied_changes.some(
      (change) => change.status === 'proposed_for_next_iteration'
    ));
    assert.ok(html.includes('data-user-feedback-contract="mvp_user_feedback.v1"'));
    assert.ok(html.includes('专项测试反馈'));
    assert.ok(html.includes('二次优化'));
    assert.ok(html.includes('可执行草稿'));
    assert.ok(html.includes('人工确认清单'));
    assert.ok(!html.includes('<script'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('renders and writes an app-style MVP run report', () => {
  const root = tempRoot();
  try {
    const result = runMvpLoopFromPilotImport({
      root,
      importPath: path.resolve('examples/pilot-import-batch.sample.json')
    });
    const html = renderMvpRunReport(result);

    assert.ok(html.includes('data-report-contract="mvp_run_report.v1"'));
    assert.ok(html.includes('用户目标'));
    assert.ok(html.includes('决策建议'));
    assert.ok(html.includes('真实用户视角回顾'));
    assert.ok(html.includes('总目标'));
    assert.ok(html.includes('应用场景'));
    assert.ok(html.includes('可执行草稿'));
    assert.ok(html.includes('人工确认清单'));
    assert.ok(html.includes('optimization_result') === false);
    assert.ok(html.includes('发送低承诺沟通消息'));
    assert.ok(html.includes('真实执行阻断'));
    assert.ok(!html.includes('<script'));

    const outputDir = path.join(root, 'runtime/mvp-reports');
    const report = writeMvpRunReport({ result, outputDir });
    assert.equal(report.contract, 'mvp_run_report.v1');
    assert.ok(report.bytes > 1000);
    assert.ok(existsSync(report.file_path));
    const written = readFileSync(report.file_path, 'utf8');
    assert.equal(written, html);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runs a self-agent MVP preflight cycle and writes next-input evidence', () => {
  const root = tempRoot();
  try {
    const processTree = JSON.parse(readFileSync(path.resolve('examples/system-process-tree.json'), 'utf8'));
    const openIssueIds = processTree.issue_register
      .filter((issue) => issue.status !== 'closed')
      .map((issue) => issue.issue_id);
    const cycle = runMvpSelfAgentCycle({
      root,
      importPath: path.resolve('examples/pilot-import-batch.sample.json'),
      userFeedbackPath: path.resolve('examples/mvp-user-feedback.sample.json'),
      processTreePath: path.resolve('examples/system-process-tree.json')
    });

    assert.equal(cycle.preflight.schema_version, 'mvp_self_agent_preflight.v1');
    assert.equal(cycle.preflight.gate_decision, 'local_mvp_ready_waiting_external_inputs');
    assert.deepEqual(cycle.preflight.required_failures, []);
    assert.equal(cycle.preflight.current_cycle.workflow, 'mvp_loop_from_pilot_import');
    assert.equal(cycle.preflight.current_cycle.ready_for_user_special_testing, true);
    assert.equal(cycle.preflight.current_cycle.ready_to_expand_sample_or_real_connector, false);
    assert.ok(cycle.preflight.current_cycle.process_tree_validation_path.includes('process-tree-validation.json'));
    assert.ok(cycle.preflight.current_cycle.mvp_stress_path.includes('mvp-stress-test.json'));
    assert.ok(cycle.preflight.current_cycle.external_input_kit_path.includes('mvp-external-input-kit.json'));
    assert.ok(cycle.preflight.current_cycle.external_input_templates_path.includes('mvp-external-input-templates.json'));
    assert.ok(cycle.preflight.current_cycle.external_input_readiness_path.includes('mvp-external-input-readiness.json'));
    assert.ok(cycle.preflight.current_cycle.objective_audit_path.includes('mvp-objective-audit.json'));
    assert.ok(cycle.preflight.objective_flow.includes('platform_snapshot_validation'));
    assert.ok(cycle.preflight.checks.some((check) => check.check_id === 'self_agent_completion_audit_passed' && check.passed));
    assert.ok(cycle.preflight.checks.some((check) => check.check_id === 'self_agent_process_tree_sync_passed' && check.passed));
    assert.ok(cycle.preflight.checks.some((check) => check.check_id === 'self_agent_mvp_stress_passed' && check.passed));
    assert.ok(cycle.preflight.checks.some((check) => check.check_id === 'self_agent_external_input_templates_written' && check.passed));
    assert.deepEqual(
      cycle.preflight.external_inputs_required.map((item) => item.issue_id),
      openIssueIds
    );
    assert.ok(cycle.preflight.external_inputs_required.some(
      (item) => item.validation_command.includes('validate-pilot-intake')
    ));
    assert.ok(cycle.preflight.external_inputs_required.some(
      (item) => item.validation_command.includes('validate-platform-snapshot')
    ));
    assert.equal(cycle.written.contract, 'mvp_self_agent_preflight.v1');
    assert.ok(existsSync(cycle.written.json_path));
    assert.ok(existsSync(cycle.written.markdown_path));
    assert.ok(existsSync(cycle.report.file_path));
    assert.ok(existsSync(cycle.audit_written.json_path));
    assert.equal(cycle.process_tree_validation.schema_version, 'process_tree_validation.v1');
    assert.equal(cycle.process_tree_validation.gate_decision, 'process_tree_synced');
    assert.ok(existsSync(cycle.process_tree_validation_written.json_path));
    assert.equal(cycle.stress.schema_version, 'mvp_stress_test.v1');
    assert.equal(cycle.stress.gate_decision, 'stress_passed_continue_to_user_materials');
    assert.deepEqual(cycle.stress.hard_exit_signals, []);
    assert.ok(existsSync(cycle.stress_written.json_path));
    assert.equal(cycle.input_kit.schema_version, 'mvp_external_input_kit.v1');
    assert.deepEqual(cycle.input_kit.open_items, openIssueIds);
    assert.deepEqual(cycle.input_kit.files_to_prepare.map((item) => item.issue_id), ['PT-003', 'PT-004']);
    assert.ok(cycle.input_kit.files_to_prepare.some((item) => item.target_path === 'runtime/user-inputs/pilot-import.real.json'));
    assert.ok(cycle.input_kit.files_to_prepare.some((item) => item.target_path === 'runtime/user-inputs/platform-snapshot.real.html'));
    assert.ok(cycle.input_kit.files_to_prepare.every((item) => item.validation_command.startsWith('node scripts/')));
    assert.ok(existsSync(cycle.input_kit_written.json_path));
    assert.ok(existsSync(cycle.input_kit_written.markdown_path));
    assert.equal(cycle.input_templates.schema_version, 'mvp_external_input_templates.v1');
    assert.equal(cycle.input_templates.source_kit_id, cycle.input_kit.kit_id);
    assert.equal(cycle.input_templates.templates.length, 3);
    assert.ok(cycle.input_templates.target_files_intentionally_not_written.includes('runtime/user-inputs/pilot-import.real.json'));
    assert.ok(existsSync(cycle.input_templates_written.json_path));
    assert.ok(existsSync(cycle.input_templates_written.markdown_path));
    assert.ok(existsSync(cycle.input_templates_written.readme_path));
    assert.ok(existsSync(path.join(root, 'runtime/user-inputs/templates/pilot-import.real.template.json')));
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/pilot-import.real.json')), false);
    assert.equal(cycle.input_readiness.schema_version, 'mvp_external_input_readiness.v1');
    assert.equal(cycle.input_readiness.gate_decision, 'external_inputs_waiting_for_materials');
    assert.equal(cycle.input_readiness.ready_for_real_input_trial, false);
    assert.deepEqual(cycle.input_readiness.item_results.map((item) => item.status), ['missing', 'missing']);
    assert.ok(existsSync(cycle.input_readiness_written.json_path));
    assert.ok(existsSync(cycle.input_readiness_written.markdown_path));
    assert.equal(cycle.objective_audit.schema_version, 'mvp_objective_audit.v1');
    assert.equal(cycle.objective_audit.objective_status, 'local_objective_evidence_complete_waiting_external_inputs');
    assert.equal(cycle.objective_audit.ready_for_user_special_testing, true);
    assert.equal(cycle.objective_audit.ready_to_expand_sample_or_real_connector, false);
    assert.deepEqual(cycle.objective_audit.required_failures, []);
    assert.deepEqual(cycle.objective_audit.expansion_failures, ['real_external_inputs_ready']);
    assert.ok(cycle.objective_audit.checks.some((check) => check.check_id === 'self_agent_preflight_passed' && check.passed));
    assert.ok(cycle.objective_audit.checks.some((check) => check.check_id === 'external_input_handoff_complete' && check.passed));
    assert.ok(existsSync(cycle.objective_audit_written.json_path));
    assert.ok(existsSync(cycle.objective_audit_written.markdown_path));

    const latestReadiness = evaluateMvpExternalInputReadiness({ root });
    assert.equal(latestReadiness.source_kit_id, cycle.input_kit.kit_id);
    assert.equal(latestReadiness.gate_decision, 'external_inputs_waiting_for_materials');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('evaluates external input readiness when prepared files are present', () => {
  const root = tempRoot();
  try {
    const cycle = runMvpSelfAgentCycle({
      root,
      importPath: path.resolve('examples/pilot-import-batch.sample.json'),
      userFeedbackPath: path.resolve('examples/mvp-user-feedback.sample.json'),
      processTreePath: path.resolve('examples/system-process-tree.json')
    });
    writePreparedExternalInputs(root);

    const readiness = evaluateMvpExternalInputReadiness({
      root,
      inputKitPath: cycle.input_kit_written.json_path
    });

    assert.equal(readiness.schema_version, 'mvp_external_input_readiness.v1');
    assert.equal(readiness.gate_decision, 'external_inputs_ready_for_mvp_self_agent');
    assert.equal(readiness.ready_for_real_input_trial, true);
    assert.deepEqual(readiness.required_failures, []);
    assert.deepEqual(readiness.item_results.map((item) => item.status), ['ready', 'ready']);
    assert.ok(readiness.item_results.some((item) => item.issue_id === 'PT-003' && item.readiness_summary.ready_for_closed_loop_mvp));
    assert.ok(readiness.item_results.some((item) => item.issue_id === 'PT-004' && item.validation_summary.send_blocked));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('objective audit uses latest refreshed external input readiness', () => {
  const root = tempRoot();
  try {
    const cycle = runMvpSelfAgentCycle({
      root,
      importPath: path.resolve('examples/pilot-import-batch.sample.json'),
      userFeedbackPath: path.resolve('examples/mvp-user-feedback.sample.json'),
      processTreePath: path.resolve('examples/system-process-tree.json')
    });
    assert.deepEqual(cycle.objective_audit.expansion_failures, ['real_external_inputs_ready']);

    writePreparedExternalInputs(root);
    const readiness = evaluateMvpExternalInputReadiness({
      root,
      inputKitPath: cycle.input_kit_written.json_path
    });
    writeMvpExternalInputReadiness({
      readiness,
      outputDir: path.join(root, 'runtime/input-readiness', readiness.readiness_id)
    });

    const audit = auditMvpObjectiveEvidence({
      root,
      preflightPath: cycle.written.json_path
    });

    assert.equal(audit.external_input_status.gate_decision, 'external_inputs_ready_for_mvp_self_agent');
    assert.equal(audit.external_input_status.ready_for_real_input_trial, true);
    assert.deepEqual(audit.external_input_status.required_failures, []);
    assert.equal(audit.objective_status, 'real_inputs_ready_waiting_real_trial');
    assert.deepEqual(audit.expansion_failures, ['real_input_trial_passed']);
    assert.ok(audit.source.input_readiness_path.includes('mvp-external-input-readiness.json'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects copied sample files as real external inputs', () => {
  const root = tempRoot();
  try {
    const cycle = runMvpSelfAgentCycle({
      root,
      importPath: path.resolve('examples/pilot-import-batch.sample.json'),
      userFeedbackPath: path.resolve('examples/mvp-user-feedback.sample.json'),
      processTreePath: path.resolve('examples/system-process-tree.json')
    });
    copySampleExternalInputs(root);

    const readiness = evaluateMvpExternalInputReadiness({
      root,
      inputKitPath: cycle.input_kit_written.json_path
    });

    assert.equal(readiness.gate_decision, 'external_inputs_need_attention');
    assert.equal(readiness.ready_for_real_input_trial, false);
    assert.deepEqual(readiness.required_failures, ['PT-003:needs_attention', 'PT-004:needs_attention']);
    assert.ok(readiness.item_results.some((item) =>
      item.issue_id === 'PT-003' && item.evidence.some((line) => line.includes('matches_source_template'))
    ));
    assert.ok(readiness.item_results.some((item) =>
      item.issue_id === 'PT-004' && item.evidence.some((line) => line.includes('preview_id_contains_sample_marker'))
    ));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('real input trial stops before MVP when external materials are missing', () => {
  const root = tempRoot();
  try {
    const cycle = runMvpSelfAgentCycle({
      root,
      importPath: path.resolve('examples/pilot-import-batch.sample.json'),
      userFeedbackPath: path.resolve('examples/mvp-user-feedback.sample.json'),
      processTreePath: path.resolve('examples/system-process-tree.json')
    });

    const trial = runMvpRealInputTrial({
      root,
      inputKitPath: cycle.input_kit_written.json_path,
      processTreePath: path.resolve('examples/system-process-tree.json')
    });

    assert.equal(trial.trial.schema_version, 'mvp_real_input_trial.v1');
    assert.equal(trial.trial.gate_decision, 'external_inputs_not_ready_stop_before_trial');
    assert.equal(trial.trial.ready_for_user_special_testing, false);
    assert.equal(trial.trial.ready_for_issue_register_review, false);
    assert.deepEqual(trial.trial.required_failures, [
      'external_inputs_ready',
      'pt003_pilot_import_ready',
      'pt004_platform_snapshot_ready'
    ]);
    assert.deepEqual(trial.trial.expansion_failures, ['real_external_inputs_ready']);
    assert.equal(trial.result, null);
    assert.ok(existsSync(trial.written.json_path));
    assert.ok(existsSync(trial.written.markdown_path));
    assert.ok(existsSync(trial.written.html_path));
    const html = readFileSync(trial.written.html_path, 'utf8');
    assert.ok(html.includes('data-report-contract="mvp_real_input_trial_report.v1"'));
    assert.ok(html.includes('真实输入试跑被阻断'));
    assert.ok(html.includes('PT-003'));
    assert.ok(html.includes('PT-004'));
    assert.equal(html.includes('<script'), false);
    assert.ok(trial.trial.artifacts.trial_report_path.includes('mvp-real-input-trial-report.html'));
    assert.ok(existsSync(trial.readiness_written.json_path));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('prepares PT-003 pilot materials without writing the real input target', () => {
  const root = tempRoot();
  try {
    const readinessDir = path.join(root, 'runtime/input-readiness/mvp_external_input_readiness_test');
    mkdirSync(readinessDir, { recursive: true });
    const readinessPath = path.join(readinessDir, 'mvp-external-input-readiness.json');
    writeFileSync(readinessPath, JSON.stringify({
      schema_version: 'mvp_external_input_readiness.v1',
      readiness_id: 'mvp_external_input_readiness_test',
      created_at: '2026-06-15T00:00:00.000Z',
      gate_decision: 'external_inputs_need_attention',
      required_failures: ['PT-003:missing'],
      item_results: [
        {
          issue_id: 'PT-003',
          status: 'missing',
          readiness_summary: {
            ready_for_closed_loop_mvp: false
          }
        }
      ]
    }, null, 2), 'utf8');

    const inboxDir = path.join(root, 'runtime/desktop-inbox-real/desktop_real_intake_test');
    mkdirSync(inboxDir, { recursive: true });
    const observationPath = path.join(inboxDir, 'intake-observation.real.json');
    writeFileSync(observationPath, JSON.stringify({
      schema_version: 'intake_observation.v1',
      observation_id: 'desktop_real_intake_test',
      captured_at: '2026-06-15T00:00:00.000Z',
      platform: 'wechat_desktop',
      privacy_level: 'artifact_allowed',
      confidence: 0.72,
      content_summary: 'PC WeChat window captured as a real read-only intake artifact. OCR/text extraction has not been performed in this step.',
      participants_hint: ['user', 'unknown_counterparty'],
      source_identity_hints: [],
      raw_artifact_refs: ['runtime/desktop-inbox-real/desktop_real_intake_test/window.png']
    }, null, 2), 'utf8');
    const ingestionPath = path.join(inboxDir, 'desktop-real-intake-ingestion.json');
    writeFileSync(ingestionPath, JSON.stringify({
      schema_version: 'desktop_real_intake_ingestion.v1',
      identity: {
        gate_decision: 'identity_unmatched',
        candidate_count: 0,
        confirmed_person_ids: []
      }
    }, null, 2), 'utf8');

    const materials = buildPt003PilotMaterials({
      root,
      createdAt: '2026-06-15T00:00:00.000Z',
      inputReadinessPath: readinessPath,
      observationPath,
      ingestionPath
    });
    const written = writePt003PilotMaterials({ root, materials });
    const targetPath = path.join(root, 'runtime/user-inputs/pilot-import.real.json');
    const persisted = JSON.parse(readFileSync(written.json_path, 'utf8'));
    const draft = JSON.parse(readFileSync(written.draft_path, 'utf8'));

    assert.equal(materials.schema_version, 'pt003_pilot_materials.v1');
    assert.equal(materials.gate_decision, 'pt003_materials_need_real_input');
    assert.equal(materials.target_file.exists, false);
    assert.equal(materials.real_send_attempted, false);
    assert.equal(materials.available_evidence.usable_for_pt003.can_seed_evidence_refs, true);
    assert.equal(materials.available_evidence.usable_for_pt003.can_satisfy_record_text, false);
    assert.equal(materials.available_evidence.usable_for_pt003.can_confirm_identity, false);
    assert.ok(materials.blockers.includes('pt003_target_file_missing'));
    assert.ok(materials.blockers.includes('pt003_real_record_count_unverified'));
    assert.ok(materials.blockers.includes('pt003_real_chat_text_not_extracted'));
    assert.ok(materials.blockers.includes('pt003_identity_evidence_missing'));
    assert.ok(materials.blockers.includes('pt003_readiness_missing'));
    assert.ok(materials.blockers.includes('pt003_feedback_record_must_be_real_after_action'));
    assert.equal(existsSync(targetPath), false);
    assert.ok(existsSync(written.json_path));
    assert.ok(existsSync(written.markdown_path));
    assert.ok(existsSync(written.draft_path));
    assert.equal(persisted.draft_path, 'runtime/pt003-pilot-materials/pt003_pilot_materials_20260615000000/pilot-import.real.draft.json');
    assert.equal(draft.records.length, 10);
    assert.ok(draft.records[0].evidence_refs.includes('runtime/desktop-inbox-real/desktop_real_intake_test/intake-observation.real.json'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writes a unified MVP status dashboard from latest runtime artifacts', () => {
  const root = tempRoot();
  try {
    const cycle = runMvpSelfAgentCycle({
      root,
      importPath: path.resolve('examples/pilot-import-batch.sample.json'),
      userFeedbackPath: path.resolve('examples/mvp-user-feedback.sample.json'),
      processTreePath: path.resolve('examples/system-process-tree.json')
    });
    const trial = runMvpRealInputTrial({
      root,
      inputKitPath: cycle.input_kit_written.json_path,
      processTreePath: path.resolve('examples/system-process-tree.json')
    });
    const readOnlyTargetsDir = path.join(root, 'runtime/read-only-expansion-targets/read_only_expansion_targets_test');
    mkdirSync(readOnlyTargetsDir, { recursive: true });
    writeFileSync(path.join(readOnlyTargetsDir, 'read-only-expansion-targets.json'), JSON.stringify({
      schema_version: 'read_only_expansion_targets.v1',
      target_plan_id: 'read_only_expansion_targets_test',
      gate_decision: 'read_only_expansion_targets_ready',
      real_execution_allowed: false,
      real_send_attempted: false,
      target_recommendations: [
        {
          target_id: 'external_chat_export_real_sample',
          rank: 1,
          platform: 'external_chat_export',
          weighted_score: 0.947,
          commands: ['npm.cmd run intake:external-chat:export -- --file=<chat-export.txt>']
        }
      ],
      blocking_target_ids: ['external_chat_export_real_sample'],
      required_failures: [],
      warning_failures: ['external_chat_export_real_sample_present'],
      next_actions: ['npm.cmd run intake:external-chat:export -- --file=<chat-export.txt>']
    }, null, 2), 'utf8');
    const readOnlyStatusDir = path.join(root, 'runtime/read-only-expansion-status/read_only_expansion_status_test');
    mkdirSync(readOnlyStatusDir, { recursive: true });
    writeFileSync(path.join(readOnlyStatusDir, 'read-only-expansion-status.json'), JSON.stringify({
      schema_version: 'read_only_expansion_status.v1',
      status_id: 'read_only_expansion_status_test',
      created_at: '2026-06-16T00:00:00.000Z',
      gate_decision: 'read_only_expansion_ready_for_next_source_sample',
      goal_complete: false,
      goal_status: 'in_progress_waiting_required_future_source_samples',
      real_execution_allowed: false,
      real_send_attempted: false,
      source: {
        root,
        pilot_import_path: 'runtime/user-inputs/pilot-import.real.json'
      },
      current_samples: {
        real_observations: {
          observation_count: 12,
          effective_observation_count: 10,
          duplicate_suppressed_count: 2,
          non_wechat_observation_count: 1,
          effective_non_wechat_observation_count: 1,
          duplicate_observation_groups: [
            {
              observation_id: 'wechat_duplicate_observation_001',
              count: 2,
              platform: 'wechat',
              paths: [
                'runtime/desktop-context-bridges/a/intake-observation.real.json',
                'runtime/desktop-context-bridges/b/intake-observation.real.json'
              ]
            }
          ]
        },
        current_pilot_import: {
          ready_for_closed_loop_mvp: true
        },
        latest_generated_pilot_import: {
          path: 'runtime/read-only-expansion-trials/latest/pilot-import.generated.json',
          raw_event_count: 10,
          feedback_count: 0,
          ready_for_decision_trial: true,
          ready_for_closed_loop_mvp: false
        }
      },
      graph_loop: {
        path: 'runtime/read-only-expansion-trials/latest/read-only-expansion-graph-loop-verification.json',
        gate_decision: 'read_only_expansion_graph_loop_verified',
        closed_loop_complete: true,
        completed_expert_count: 5,
        writeback_complete: true
      },
      future_intake: {
        required_future_sources: [
          {
            source: 'browser_web',
            template_ready: true,
            conformance_ready: true,
            real_sample_present: true
          },
          {
            source: 'external_chat_export',
            template_ready: true,
            conformance_ready: true,
            real_sample_present: false
          },
          {
            source: 'business_system_api',
            template_ready: true,
            conformance_ready: true,
            real_sample_present: false
          }
        ]
      },
      duplicate_confirmation: {
        path: 'runtime/read-only-duplicate-observation-confirmations/read_only_duplicate_confirmation_test/read-only-duplicate-observation-confirmation.json',
        exists: true,
        confirmation_id: 'read_only_duplicate_confirmation_test',
        gate_decision: 'duplicate_observation_confirmation_template_written',
        duplicate_suppression_confirmed: false,
        current_duplicate_groups_confirmed: false,
        current_duplicate_observation_ids: ['wechat_duplicate_observation_001'],
        accepted_observation_ids: [],
        required_failures: [],
        warning_failures: ['confirmation_decision_present']
      },
      checks: [],
      required_failures: [],
      warning_failures: [
        'external_chat_export_real_sample_present',
        'business_system_api_real_sample_present',
        'duplicate_observation_ids_need_review'
      ],
      next_actions: [
        'Review duplicate observation IDs before treating the expanded read-only sample set as complete.'
      ]
    }, null, 2), 'utf8');
    const sourceMatrixDir = path.join(root, 'runtime/source-intake-matrix/source_intake_matrix_test');
    mkdirSync(sourceMatrixDir, { recursive: true });
    writeFileSync(path.join(sourceMatrixDir, 'source-intake-matrix.json'), JSON.stringify({
      schema_version: 'source_intake_matrix.v1',
      matrix_id: 'source_intake_matrix_test',
      created_at: '2026-06-16T00:00:00.000Z',
      gate_decision: 'source_intake_matrix_ready_waiting_real_samples',
      real_execution_allowed: false,
      real_send_attempted: false,
      source: {
        root,
        latest_generated_pilot_import_path: 'runtime/read-only-expansion-trials/latest/pilot-import.generated.json'
      },
      summary: {
        lane_count: 4,
        conformance_ready_lanes: 4,
        lanes_with_real_samples: 2,
        required_goal_lanes: 4,
        required_goal_lanes_with_real_samples: 2,
        total_effective_observations: 10,
        total_duplicate_suppressed: 2,
        latest_generated_pilot_import_records: 10,
        latest_generated_pilot_import_feedback_records: 0,
        all_real_send_blocked: true,
        all_required_goal_lanes_have_real_samples: false,
        ready_for_new_adapter_without_main_flow_change: true
      },
      reusable_gate_sequence: [
        'SourceAdapterCapability',
        'IntakeObservation',
        'source_adapter_conformance.v1',
        'RawEvent',
        'PilotImportBatch'
      ],
      lanes: [
        {
          lane_id: 'desktop_wechat',
          label: 'Sightflow desktop WeChat',
          source_type: 'desktop',
          platform: 'wechat',
          gate_decision: 'source_intake_lane_has_real_read_only_sample',
          conformance_ready: true,
          observations: {
            effective_observation_count: 9,
            raw_event_mapped_count: 9
          },
          latest_generated_pilot_import: {
            matching_records: 9
          },
          required_failures: [],
          warning_failures: ['lane_duplicate_observation_review_needed']
        },
        {
          lane_id: 'browser_web',
          label: 'Saved browser or DOM snapshot',
          source_type: 'browser',
          platform: 'web',
          gate_decision: 'source_intake_lane_has_real_read_only_sample',
          conformance_ready: true,
          observations: {
            effective_observation_count: 1,
            raw_event_mapped_count: 1
          },
          latest_generated_pilot_import: {
            matching_records: 1
          },
          required_failures: [],
          warning_failures: []
        },
        {
          lane_id: 'external_chat_export',
          label: 'External chat export file',
          source_type: 'file',
          platform: 'external_chat_export',
          gate_decision: 'source_intake_lane_waiting_real_sample',
          conformance_ready: true,
          observations: {
            effective_observation_count: 0,
            raw_event_mapped_count: 0
          },
          latest_generated_pilot_import: {
            matching_records: 0
          },
          required_failures: [],
          warning_failures: ['lane_real_observation_missing']
        },
        {
          lane_id: 'business_system_api',
          label: 'Saved business-system API snapshot',
          source_type: 'api',
          platform: 'business_system',
          gate_decision: 'source_intake_lane_waiting_real_sample',
          conformance_ready: true,
          observations: {
            effective_observation_count: 0,
            raw_event_mapped_count: 0
          },
          latest_generated_pilot_import: {
            matching_records: 0
          },
          required_failures: [],
          warning_failures: ['lane_real_observation_missing']
        }
      ],
      checks: [],
      required_failures: [],
      warning_failures: [
        'required_goal_lanes_have_real_read_only_samples',
        'external_chat_export:lane_real_observation_missing',
        'business_system_api:lane_real_observation_missing'
      ],
      next_actions: [
        'Collect a saved read-only External chat export file artifact and convert it into intake-observation.real.json.',
        'Collect a saved read-only Saved business-system API snapshot artifact and convert it into intake-observation.real.json.'
      ],
      stop_or_adjust_when: []
    }, null, 2), 'utf8');
    const manifestReadinessDir = path.join(root, 'runtime/read-only-source-collection-manifest-readiness/read_only_manifest_readiness_test');
    mkdirSync(manifestReadinessDir, { recursive: true });
    writeFileSync(path.join(manifestReadinessDir, 'read-only-source-collection-manifest-readiness.json'), JSON.stringify({
      schema_version: 'read_only_source_collection_manifest_readiness.v1',
      readiness_id: 'read_only_manifest_readiness_test',
      gate_decision: 'read_only_source_collection_manifest_ready_for_collection',
      ready_for_collection: true,
      real_execution_allowed: false,
      real_send_attempted: false,
      source: {
        root,
        manifest_path: 'runtime/user-inputs/read-only-source-collection.manifest.json'
      },
      summary: {
        manifest_sources: 3,
        ready_sources: 3,
        missing_source_files: 0,
        source_kind_counts: {
          external_chat_export: 1,
          browser_html: 1,
          business_api_snapshot: 1
        },
        missing_recommended_source_kinds: [],
        duplicate_source_ids: []
      },
      source_results: [],
      checks: [],
      required_failures: [],
      warning_failures: []
    }, null, 2), 'utf8');
    const readOnlyCollectionDir = path.join(root, 'runtime/read-only-source-collections/read_only_source_collection_test');
    mkdirSync(readOnlyCollectionDir, { recursive: true });
    const generatedPilotImportPath = path.join(readOnlyCollectionDir, 'pilot-import.generated.json');
    const graphLoopVerificationPath = path.join(readOnlyCollectionDir, 'read-only-expansion-graph-loop-verification.json');
    writeFileSync(generatedPilotImportPath, JSON.stringify({
      schema_version: 'pilot_import_batch.v1',
      import_id: 'pilot_import_generated_from_collection_test',
      records: [],
      feedback_records: []
    }, null, 2), 'utf8');
    writeFileSync(graphLoopVerificationPath, JSON.stringify({
      schema_version: 'read_only_expansion_graph_loop_verification.v1',
      gate_decision: 'read_only_expansion_graph_loop_verified'
    }, null, 2), 'utf8');
    writeFileSync(path.join(readOnlyCollectionDir, 'read-only-source-collection.json'), JSON.stringify({
      schema_version: 'read_only_source_collection.v1',
      collection_id: 'read_only_source_collection_test',
      created_at: '2026-06-15T00:00:00.000Z',
      gate_decision: 'read_only_source_collection_ready',
      real_execution_allowed: false,
      real_send_attempted: false,
      source: {
        root,
        manifest_path: 'examples/read-only-source-collection.manifest.sample.json',
        output_dir: readOnlyCollectionDir
      },
      summary: {
        manifest_sources: 3,
        collected_observations: 3,
        failed_sources: 0,
        source_kind_counts: {
          external_chat_export: 1,
          browser_html: 1,
          business_api_snapshot: 1
        },
        missing_recommended_source_kinds: [],
        ready_for_read_only_trial: true
      },
      observations: [],
      failed_sources: [],
      downstream_trial: {
        requested: true,
        skipped: false,
        command: 'node scripts/run-read-only-expansion-trial.mjs --source-dir=runtime/read-only-source-collections/read_only_source_collection_test',
        exit_code: 0,
        gate_decision: 'read_only_expansion_trial_ready_for_feedback_collection',
        trial_id: 'read_only_expansion_trial_from_collection_test',
        real_execution_allowed: false,
        real_send_attempted: false,
        raw_observation_count: 3,
        effective_observation_count: 3,
        generated_pilot_import_ready_for_decision: true,
        generated_pilot_import_ready_for_closed_loop_mvp: false,
        graph_loop_gate_decision: 'read_only_expansion_graph_loop_verified',
        required_failures: [],
        json_path: path.join(readOnlyCollectionDir, 'read-only-expansion-trial.json'),
        markdown_path: path.join(readOnlyCollectionDir, 'read-only-expansion-trial.md'),
        generated_pilot_import_path: generatedPilotImportPath,
        graph_loop_verification_path: graphLoopVerificationPath
      },
      checks: [],
      required_failures: [],
      warning_failures: [],
      next_commands: ['npm.cmd run pilot:feedback:append -- --pilot-import=runtime/read-only-source-collections/read_only_source_collection_test/pilot-import.generated.json'],
      stop_or_adjust_when: ['real_send_attempted=true']
    }, null, 2), 'utf8');
    const readOnlyWorkpackDir = path.join(root, 'runtime/read-only-expansion-workpacks/read_only_expansion_workpack_test');
    const readOnlyFeedbackDir = path.join(readOnlyWorkpackDir, 'feedback');
    mkdirSync(readOnlyFeedbackDir, { recursive: true });
    const feedbackTemplatePath = path.join(readOnlyFeedbackDir, 'feedback-record.template.json');
    writeFileSync(feedbackTemplatePath, JSON.stringify({
      feedback_id: 'feedback_read_only_workpack_manual_001',
      executed: false,
      reply_received: false,
      goal_progress: 0,
      user_rating: 3,
      metadata: {
        template_only: true,
        real_execution_allowed: false,
        real_send_attempted: false
      }
    }, null, 2), 'utf8');
    writeFileSync(path.join(readOnlyWorkpackDir, 'read-only-expansion-workpack.json'), JSON.stringify({
      schema_version: 'read_only_expansion_workpack.v1',
      workpack_id: 'read_only_expansion_workpack_test',
      gate_decision: 'read_only_expansion_workpack_ready_for_operator_review',
      real_execution_allowed: false,
      real_send_attempted: false,
      sample_summary: {
        raw_observation_count: 12,
        effective_observation_count: 10,
        duplicate_suppressed_count: 2,
        generated_records: 10,
        generated_feedback_records: 0,
        ready_for_decision_trial: true,
        ready_for_closed_loop_mvp: false
      },
      graph_loop_summary: {
        gate_decision: 'read_only_expansion_graph_loop_verified',
        closed_loop_complete: true,
        expert_weight_judgment: {
          completed_expert_count: 5
        },
        feedback_writeback: {
          writeback_complete: true
        }
      },
      artifacts: {
        feedback_template_path: feedbackTemplatePath
      },
      next_sampling_targets: {
        top_targets: [
          {
            target_id: 'generated_batch_real_feedback_writeback',
            rank: 1,
            platform: 'operator_review',
            weighted_score: 0.905,
            first_command: 'npm.cmd run pilot:feedback:append -- --pilot-import=<generated-pilot-import.json>'
          }
        ]
      },
      required_failures: [],
      warning_failures: [],
      next_actions: ['npm.cmd run pilot:feedback:append -- --pilot-import=<generated-pilot-import.json>']
    }, null, 2), 'utf8');
    const duplicateConfirmationDir = path.join(root, 'runtime/read-only-duplicate-observation-confirmations/read_only_duplicate_confirmation_test');
    mkdirSync(duplicateConfirmationDir, { recursive: true });
    const duplicateConfirmationTemplatePath = path.join(duplicateConfirmationDir, 'duplicate-confirmation-decision.template.json');
    writeFileSync(duplicateConfirmationTemplatePath, JSON.stringify({
      schema_version: 'read_only_duplicate_observation_confirmation_decision.v1',
      review_id: 'read_only_duplicate_review_test',
      operator: {
        operator_id: '',
        operator_name: '',
        confirmed_at: '2026-06-16T00:00:00.000Z'
      },
      decisions: [
        {
          observation_id: 'wechat_duplicate_observation_001',
          decision: 'accept_suppression',
          reason: 'Operator reviews deterministic duplicate evidence before accepting suppression.',
          confirmed_paths: [
            'runtime/desktop-context-bridges/a/intake-observation.real.json',
            'runtime/desktop-context-bridges/b/intake-observation.real.json'
          ]
        }
      ]
    }, null, 2), 'utf8');
    writeFileSync(path.join(duplicateConfirmationDir, 'read-only-duplicate-observation-confirmation.json'), JSON.stringify({
      schema_version: 'read_only_duplicate_observation_confirmation.v1',
      confirmation_id: 'read_only_duplicate_confirmation_test',
      created_at: '2026-06-16T00:00:00.000Z',
      gate_decision: 'duplicate_observation_confirmation_template_written',
      real_execution_allowed: false,
      real_send_attempted: false,
      source: {
        root,
        review_path: 'runtime/read-only-duplicate-observation-reviews/read_only_duplicate_review_test/read-only-duplicate-observation-review.json',
        decision_path: null,
        read_only_expansion_status_path: 'runtime/read-only-expansion-status/read_only_expansion_status_test/read-only-expansion-status.json'
      },
      summary: {
        review_id: 'read_only_duplicate_review_test',
        decision_present: false,
        duplicate_group_count: 1,
        accepted_group_count: 0,
        duplicate_suppression_confirmed: false,
        operator_confirmation_recorded: false
      },
      groups: [
        {
          observation_id: 'wechat_duplicate_observation_001',
          decision_found: false,
          decision: 'needs_more_review',
          paths_match: false,
          accepted: false
        }
      ],
      checks: [],
      required_failures: [],
      warning_failures: ['confirmation_decision_present'],
      next_actions: [
        'Review duplicate-confirmation-decision.template.json, fill operator fields, and save a reviewed decision file.',
        'Run npm run intake:read-only:duplicate:confirm -- --review=<review.json> --decision=<decision.json> --fail-on-required.'
      ]
    }, null, 2), 'utf8');
    const dashboard = buildMvpStatusDashboard({ root });
    const html = renderMvpStatusDashboard(dashboard);
    const written = writeMvpStatusDashboard({
      dashboard,
      outputDir: path.join(root, 'runtime/status-dashboards', dashboard.dashboard_id)
    });

    assert.equal(dashboard.schema_version, 'mvp_status_dashboard.v1');
    assert.equal(dashboard.overall_status, 'local_objective_evidence_complete_waiting_external_inputs');
    assert.equal(dashboard.ready_for_user_special_testing, true);
    assert.equal(dashboard.ready_to_expand_sample_or_real_connector, false);
    assert.equal(dashboard.self_agent.preflight_id, cycle.preflight.preflight_id);
    assert.equal(dashboard.real_input_trial.trial_id, trial.trial.trial_id);
    assert.ok(dashboard.blockers.includes('expansion:real_external_inputs_ready'));
    assert.ok(dashboard.blockers.includes('real_trial:external_inputs_ready'));
    assert.ok(dashboard.external_inputs.items.some((item) => item.issue_id === 'PT-003' && item.status === 'missing'));
    assert.equal(dashboard.read_only_expansion_targets.target_plan_id, 'read_only_expansion_targets_test');
    assert.equal(dashboard.read_only_expansion_targets.real_send_attempted, false);
    assert.equal(dashboard.read_only_expansion_targets.top_targets[0].target_id, 'external_chat_export_real_sample');
    assert.equal(dashboard.read_only_expansion_status.status_id, 'read_only_expansion_status_test');
    assert.equal(dashboard.read_only_expansion_status.real_send_attempted, false);
    assert.equal(dashboard.read_only_expansion_status.effective_observation_count, 10);
    assert.equal(dashboard.read_only_expansion_status.duplicate_suppressed_count, 2);
    assert.equal(dashboard.read_only_expansion_status.generated_pilot_import_records, 10);
    assert.equal(dashboard.read_only_expansion_status.generated_feedback_records, 0);
    assert.equal(dashboard.read_only_expansion_status.graph_loop_gate_decision, 'read_only_expansion_graph_loop_verified');
    assert.equal(dashboard.read_only_expansion_status.graph_loop_closed, true);
    assert.equal(dashboard.read_only_expansion_status.feedback_writeback_complete, true);
    assert.equal(dashboard.read_only_expansion_status.completed_expert_count, 5);
    assert.equal(dashboard.read_only_expansion_status.required_future_sources.find((item) => item.source === 'external_chat_export').real_sample_present, false);
    assert.equal(dashboard.read_only_expansion_status.duplicate_observation_groups.length, 1);
    assert.equal(dashboard.read_only_duplicate_confirmation.confirmation_id, 'read_only_duplicate_confirmation_test');
    assert.equal(dashboard.read_only_duplicate_confirmation.gate_decision, 'duplicate_observation_confirmation_template_written');
    assert.equal(dashboard.read_only_duplicate_confirmation.duplicate_suppression_confirmed, false);
    assert.equal(dashboard.read_only_duplicate_confirmation.current_duplicate_groups_confirmed, false);
    assert.equal(dashboard.read_only_duplicate_confirmation.operator_confirmation_recorded, false);
    assert.equal(dashboard.read_only_duplicate_confirmation.decision_template_path, 'runtime/read-only-duplicate-observation-confirmations/read_only_duplicate_confirmation_test/duplicate-confirmation-decision.template.json');
    assert.equal(dashboard.source_intake_matrix.matrix_id, 'source_intake_matrix_test');
    assert.equal(dashboard.source_intake_matrix.real_send_attempted, false);
    assert.equal(dashboard.source_intake_matrix.conformance_ready_lanes, 4);
    assert.equal(dashboard.source_intake_matrix.required_goal_lanes_with_real_samples, 2);
    assert.equal(dashboard.source_intake_matrix.ready_for_new_adapter_without_main_flow_change, true);
    assert.equal(dashboard.source_intake_matrix.lanes.find((lane) => lane.lane_id === 'browser_web').effective_observation_count, 1);
    assert.equal(dashboard.source_intake_matrix.lanes.find((lane) => lane.lane_id === 'external_chat_export').generated_pilot_import_matching_records, 0);
    assert.equal(dashboard.read_only_manifest_readiness.readiness_id, 'read_only_manifest_readiness_test');
    assert.equal(dashboard.read_only_manifest_readiness.ready_for_collection, true);
    assert.equal(dashboard.read_only_manifest_readiness.real_send_attempted, false);
    assert.equal(dashboard.read_only_manifest_readiness.manifest_sources, 3);
    assert.equal(dashboard.read_only_manifest_readiness.ready_sources, 3);
    assert.equal(dashboard.read_only_manifest_readiness.source_kind_counts.business_api_snapshot, 1);
    assert.equal(dashboard.read_only_source_collection.collection_id, 'read_only_source_collection_test');
    assert.equal(dashboard.read_only_source_collection.real_send_attempted, false);
    assert.equal(dashboard.read_only_source_collection.collected_observations, 3);
    assert.equal(dashboard.read_only_source_collection.source_kind_counts.browser_html, 1);
    assert.equal(dashboard.read_only_source_collection.downstream_trial_requested, true);
    assert.equal(dashboard.read_only_source_collection.downstream_trial_gate_decision, 'read_only_expansion_trial_ready_for_feedback_collection');
    assert.equal(dashboard.read_only_source_collection.generated_pilot_import_ready_for_decision, true);
    assert.equal(dashboard.read_only_source_collection.generated_pilot_import_ready_for_closed_loop_mvp, false);
    assert.equal(dashboard.read_only_source_collection.graph_loop_gate_decision, 'read_only_expansion_graph_loop_verified');
    assert.equal(dashboard.read_only_source_collection.generated_pilot_import_path, generatedPilotImportPath);
    assert.equal(dashboard.read_only_expansion_workpack.workpack_id, 'read_only_expansion_workpack_test');
    assert.equal(dashboard.read_only_expansion_workpack.real_send_attempted, false);
    assert.equal(dashboard.read_only_expansion_workpack.effective_observation_count, 10);
    assert.equal(dashboard.read_only_expansion_workpack.graph_loop_gate_decision, 'read_only_expansion_graph_loop_verified');
    assert.equal(dashboard.read_only_expansion_workpack.feedback_template_path, feedbackTemplatePath);
    assert.equal(dashboard.read_only_expansion_workpack.top_targets[0].target_id, 'generated_batch_real_feedback_writeback');
    assert.ok(dashboard.next_actions.includes('npm.cmd run intake:external-chat:export -- --file=<chat-export.txt>'));
    assert.ok(dashboard.next_actions.includes('npm.cmd run pilot:feedback:append -- --pilot-import=runtime/read-only-source-collections/read_only_source_collection_test/pilot-import.generated.json'));
    assert.ok(dashboard.next_actions.includes('npm.cmd run pilot:feedback:append -- --pilot-import=<generated-pilot-import.json>'));
    assert.ok(dashboard.next_actions.includes('Collect a saved read-only External chat export file artifact and convert it into intake-observation.real.json.'));
    assert.ok(dashboard.next_actions.includes('Review duplicate observation IDs before treating the expanded read-only sample set as complete.'));
    assert.ok(dashboard.next_actions.includes('Review duplicate-confirmation-decision.template.json, fill operator fields, and save a reviewed decision file.'));
    assert.ok(dashboard.artifacts.read_only_expansion_targets_path.includes('read-only-expansion-targets.json'));
    assert.ok(dashboard.artifacts.read_only_expansion_status_path.includes('read-only-expansion-status.json'));
    assert.ok(dashboard.artifacts.read_only_duplicate_confirmation_path.includes('read-only-duplicate-observation-confirmation.json'));
    assert.ok(dashboard.artifacts.read_only_duplicate_confirmation_template_path.includes('duplicate-confirmation-decision.template.json'));
    assert.ok(dashboard.artifacts.source_intake_matrix_path.includes('source-intake-matrix.json'));
    assert.ok(dashboard.artifacts.read_only_manifest_readiness_path.includes('read-only-source-collection-manifest-readiness.json'));
    assert.ok(dashboard.artifacts.read_only_source_collection_path.includes('read-only-source-collection.json'));
    assert.equal(dashboard.artifacts.read_only_source_collection_generated_pilot_import_path, generatedPilotImportPath);
    assert.ok(dashboard.artifacts.read_only_expansion_workpack_path.includes('read-only-expansion-workpack.json'));
    assert.ok(dashboard.artifacts.real_input_trial_report_path.includes('mvp-real-input-trial-report.html'));
    assert.ok(html.includes('data-report-contract="mvp_status_dashboard.v1"'));
    assert.ok(html.includes('Read-only Expansion Targets'));
    assert.ok(html.includes('Read-only Expansion Status'));
    assert.ok(html.includes('Read-only Duplicate Confirmation'));
    assert.ok(html.includes('Source Intake Matrix'));
    assert.ok(html.includes('Read-only Manifest Readiness'));
    assert.ok(html.includes('Read-only Source Collection'));
    assert.ok(html.includes('Read-only Expansion Workpack'));
    assert.ok(html.includes('external_chat_export_real_sample'));
    assert.ok(html.includes('in_progress_waiting_required_future_source_samples'));
    assert.ok(html.includes('source_intake_lane_waiting_real_sample'));
    assert.ok(html.includes('pilot-import.generated.json'));
    assert.ok(html.includes('generated_batch_real_feedback_writeback'));
    assert.ok(html.includes('duplicate-confirmation-decision.template.json'));
    assert.ok(html.includes('MVP状态看板'));
    assert.ok(html.includes('PT-003'));
    assert.equal(html.includes('<script'), false);
    assert.ok(existsSync(written.json_path));
    assert.ok(existsSync(written.markdown_path));
    assert.ok(existsSync(written.html_path));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('status dashboard prefers latest real-trial external readiness over stale objective audit', () => {
  const root = tempRoot();
  try {
    const objectiveDir = path.join(root, 'runtime/objective-audits/mvp_objective_audit_stale');
    const trialDir = path.join(root, 'runtime/real-input-trials/mvp_real_input_trial_ready');
    const workpackDir = path.join(root, 'runtime/read-only-expansion-workpacks/read_only_workpack_collect_exception');
    mkdirSync(objectiveDir, { recursive: true });
    mkdirSync(trialDir, { recursive: true });
    mkdirSync(workpackDir, { recursive: true });
    writeFileSync(path.join(objectiveDir, 'mvp-objective-audit.json'), JSON.stringify({
      schema_version: 'mvp_objective_audit.v1',
      audit_id: 'mvp_objective_audit_stale',
      objective_status: 'local_objective_evidence_complete_waiting_external_inputs',
      required_failures: [],
      expansion_failures: ['real_external_inputs_ready'],
      external_input_status: {
        gate_decision: 'external_inputs_need_attention',
        ready_for_real_input_trial: false,
        required_failures: ['PT-003:missing'],
        item_results: [
          {
            issue_id: 'PT-003',
            status: 'missing',
            ready: false,
            evidence: ['target file missing']
          }
        ]
      }
    }, null, 2), 'utf8');
    writeFileSync(path.join(trialDir, 'mvp-real-input-trial.json'), JSON.stringify({
      schema_version: 'mvp_real_input_trial.v1',
      trial_id: 'mvp_real_input_trial_ready',
      gate_decision: 'real_input_trial_needs_attention',
      required_failures: ['real_trial_completion_audit_passed'],
      external_input_readiness: {
        gate_decision: 'external_inputs_ready_for_mvp_self_agent',
        ready_for_real_input_trial: true,
        required_failures: [],
        item_results: [
          {
            issue_id: 'PT-003',
            status: 'ready',
            ready: true,
            evidence: ['ready_for_closed_loop_mvp=true']
          },
          {
            issue_id: 'PT-004',
            status: 'ready',
            ready: true,
            evidence: ['send_blocked=true']
          }
        ]
      },
      artifacts: {
        trial_report_path: 'runtime/real-input-trials/mvp_real_input_trial_ready/mvp-real-input-trial-report.html'
      }
    }, null, 2), 'utf8');
    writeFileSync(path.join(workpackDir, 'read-only-expansion-workpack.json'), JSON.stringify({
      schema_version: 'read_only_expansion_workpack.v1',
      workpack_id: 'read_only_workpack_collect_exception',
      gate_decision: 'read_only_expansion_workpack_ready_for_operator_review',
      real_execution_allowed: false,
      real_send_attempted: false,
      sample_summary: {
        raw_observation_count: 0,
        effective_observation_count: 0,
        duplicate_suppressed_count: 0,
        generated_records: 0,
        generated_feedback_records: 0,
        ready_for_decision_trial: false,
        ready_for_closed_loop_mvp: false
      },
      graph_loop_summary: {
        gate_decision: 'missing',
        closed_loop_complete: false
      },
      next_sampling_targets: {
        top_targets: []
      },
      required_failures: [],
      warning_failures: [],
      next_actions: [
        'npm.cmd run intake:read-only:collect -- --manifest=runtime/user-inputs/read-only-source-collection.manifest.json --run-trial --pilot-import=runtime/user-inputs/pilot-import.real.json --fail-on-required',
        'Prepare runtime/user-inputs/pilot-import.real.json for PT-003'
      ]
    }, null, 2), 'utf8');

    const dashboard = buildMvpStatusDashboard({ root });

    assert.equal(dashboard.external_inputs.gate_decision, 'external_inputs_ready_for_mvp_self_agent');
    assert.equal(dashboard.external_inputs.ready_for_real_input_trial, true);
    assert.deepEqual(dashboard.external_inputs.required_failures, []);
    assert.ok(dashboard.external_inputs.items.some((item) => item.issue_id === 'PT-003' && item.status === 'ready'));
    assert.equal(dashboard.blockers.includes('external_input:PT-003:missing'), false);
    assert.ok(dashboard.next_actions.some((action) => action.includes('intake:read-only:collect')));
    assert.equal(dashboard.next_actions.some((action) => action.includes('Prepare runtime/user-inputs/pilot-import.real.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('self-agent accepts prepared real files and waits for real input trial', () => {
  const root = tempRoot();
  try {
    runMvpSelfAgentCycle({
      root,
      importPath: path.resolve('examples/pilot-import-batch.sample.json'),
      userFeedbackPath: path.resolve('examples/mvp-user-feedback.sample.json'),
      processTreePath: path.resolve('examples/system-process-tree.json')
    });
    writePreparedExternalInputs(root);

    const cycle = runMvpSelfAgentCycle({
      root,
      importPath: path.resolve('examples/pilot-import-batch.sample.json'),
      userFeedbackPath: path.resolve('examples/mvp-user-feedback.sample.json'),
      processTreePath: path.resolve('examples/system-process-tree.json')
    });

    assert.ok(cycle.preflight.checks.some(
      (check) => check.check_id === 'self_agent_external_input_templates_written' && check.passed
    ));
    assert.equal(cycle.input_readiness.gate_decision, 'external_inputs_ready_for_mvp_self_agent');
    assert.equal(cycle.input_readiness.ready_for_real_input_trial, true);
    assert.deepEqual(cycle.input_readiness.required_failures, []);
    assert.equal(cycle.objective_audit.objective_status, 'real_inputs_ready_waiting_real_trial');
    assert.deepEqual(cycle.objective_audit.expansion_failures, ['real_input_trial_passed']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('real input trial runs the full loop when prepared files are ready', () => {
  const root = tempRoot();
  try {
    const cycle = runMvpSelfAgentCycle({
      root,
      importPath: path.resolve('examples/pilot-import-batch.sample.json'),
      userFeedbackPath: path.resolve('examples/mvp-user-feedback.sample.json'),
      processTreePath: path.resolve('examples/system-process-tree.json')
    });
    writePreparedExternalInputs(root);

    const trial = runMvpRealInputTrial({
      root,
      inputKitPath: cycle.input_kit_written.json_path,
      userFeedbackPath: path.resolve('examples/mvp-user-feedback.sample.json'),
      processTreePath: path.resolve('examples/system-process-tree.json')
    });

    assert.equal(trial.trial.schema_version, 'mvp_real_input_trial.v1');
    assert.equal(trial.trial.gate_decision, 'real_input_trial_complete_waiting_issue_register_review');
    assert.equal(trial.trial.ready_for_user_special_testing, true);
    assert.equal(trial.trial.ready_for_issue_register_review, true);
    assert.equal(trial.trial.ready_to_expand_sample_or_real_connector, false);
    assert.deepEqual(trial.trial.required_failures, []);
    assert.deepEqual(trial.trial.expansion_failures, ['issue_register_open_items']);
    assert.equal(trial.trial.external_input_readiness.ready_for_real_input_trial, true);
    assert.equal(trial.trial.result_summary.quality.closed_loop_complete, true);
    assert.equal(trial.trial.result_summary.quality.real_execution_allowed, false);
    assert.equal(trial.completion_audit.required_failures.length, 0);
    assert.equal(trial.process_tree_validation.gate_decision, 'process_tree_synced');
    assert.ok(existsSync(trial.written.json_path));
    assert.ok(existsSync(trial.written.markdown_path));
    assert.ok(existsSync(trial.written.html_path));
    const html = readFileSync(trial.written.html_path, 'utf8');
    assert.ok(html.includes('data-report-contract="mvp_real_input_trial_report.v1"'));
    assert.ok(html.includes('真实输入试跑报告'));
    assert.ok(html.includes('run_id'));
    assert.equal(html.includes('<script'), false);
    assert.ok(existsSync(trial.report.file_path));
    assert.ok(existsSync(trial.completion_audit_written.json_path));
    assert.ok(existsSync(trial.process_tree_validation_written.json_path));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('initializes external input templates without writing real target files', () => {
  const root = tempRoot();
  try {
    const cycle = runMvpSelfAgentCycle({
      root,
      importPath: path.resolve('examples/pilot-import-batch.sample.json'),
      userFeedbackPath: path.resolve('examples/mvp-user-feedback.sample.json'),
      processTreePath: path.resolve('examples/system-process-tree.json')
    });

    const { init, written } = initializeMvpExternalInputTemplates({ root });

    assert.equal(init.schema_version, 'mvp_external_input_templates.v1');
    assert.equal(init.source_kit_id, cycle.input_kit.kit_id);
    assert.equal(init.templates.length, 3);
    assert.deepEqual(
      init.templates.map((item) => item.template_path).sort(),
      [
        'runtime/user-inputs/templates/pilot-import.real.template.json',
        'runtime/user-inputs/templates/platform-snapshot-preview.real.template.json',
        'runtime/user-inputs/templates/platform-snapshot.real.template.html'
      ].sort()
    );
    assert.ok(existsSync(written.json_path));
    assert.ok(existsSync(written.markdown_path));
    assert.ok(existsSync(written.readme_path));
    assert.ok(existsSync(path.join(root, 'runtime/user-inputs/templates/pilot-import.real.template.json')));
    assert.ok(existsSync(path.join(root, 'runtime/user-inputs/templates/platform-snapshot.real.template.html')));
    assert.ok(existsSync(path.join(root, 'runtime/user-inputs/templates/platform-snapshot-preview.real.template.json')));
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/pilot-import.real.json')), false);
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/platform-snapshot.real.html')), false);
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/platform-snapshot-preview.real.json')), false);
    assert.deepEqual(
      init.target_files_intentionally_not_written.sort(),
      [
        'runtime/user-inputs/pilot-import.real.json',
        'runtime/user-inputs/platform-snapshot-preview.real.json',
        'runtime/user-inputs/platform-snapshot.real.html'
      ].sort()
    );

    const readiness = evaluateMvpExternalInputReadiness({ root });
    assert.equal(readiness.gate_decision, 'external_inputs_waiting_for_materials');
    assert.deepEqual(readiness.required_failures, ['PT-003:missing', 'PT-004:missing']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validates process tree and Obsidian views are synchronized', () => {
  const root = path.resolve('.');
  const outputRoot = tempRoot();
  try {
    const validation = validateProcessTreeSync({ root });

    assert.equal(validation.schema_version, 'process_tree_validation.v1');
    assert.equal(validation.gate_decision, 'process_tree_synced');
    assert.deepEqual(validation.required_failures, []);
    assert.ok(validation.expected_objective_flow.includes('platform_snapshot_validation'));
    assert.ok(validation.checks.some(
      (check) => check.check_id === 'obsidian_markdown_has_all_canonical_nodes' && check.passed
    ));
    assert.ok(validation.checks.some(
      (check) => check.check_id === 'issue_register_synced_to_obsidian' && check.passed
    ));

    const written = writeProcessTreeValidation({
      validation,
      outputDir: path.join(outputRoot, 'runtime/process-tree-validations', validation.validation_id)
    });
    assert.equal(written.contract, 'process_tree_validation.v1');
    assert.ok(existsSync(written.json_path));
    assert.ok(existsSync(written.markdown_path));
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('runs a small full-chain MVP stress test and writes evidence', () => {
  const outputRoot = tempRoot();
  try {
    const stress = runMvpStressTest({
      workspaceRoot: path.resolve('.'),
      runs: 2,
      outputDir: path.join(outputRoot, 'runtime/mvp-stress-tests/test_stress')
    });

    assert.equal(stress.schema_version, 'mvp_stress_test.v1');
    assert.equal(stress.gate_decision, 'stress_passed_continue_to_user_materials');
    assert.equal(stress.runs, 2);
    assert.equal(stress.success, 2);
    assert.equal(stress.failed, 0);
    assert.deepEqual(stress.hard_exit_signals, []);
    assert.equal(stress.quality.closed_loop_completion_rate, 1);
    assert.equal(stress.quality.real_execution_block_rate, 1);
    assert.equal(stress.quality.real_user_review_completion_rate, 1);
    assert.equal(stress.quality.optimization_result_completion_rate, 1);
    assert.equal(stress.quality.user_feedback_review_rate, 1);
    assert.equal(stress.quality.second_pass_optimization_rate, 1);
    assert.equal(stress.process_tree_validation.gate_decision, 'process_tree_synced');
    assert.ok(stress.iterations.every((item) => item.report_contract_present));
    assert.ok(stress.iterations.every((item) => item.feedback_contract_present));
    assert.ok(stress.iterations.every((item) => item.script_absent));

    const written = writeMvpStressTest({
      stress,
      outputDir: path.join(outputRoot, 'runtime/mvp-stress-tests/test_stress')
    });
    assert.equal(written.contract, 'mvp_stress_test.v1');
    assert.ok(existsSync(written.json_path));
    assert.ok(existsSync(written.markdown_path));
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
});
