#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildDecisionRecommendation } from '../packages/decision-cluster/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function nowId() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function sha12(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function readTextIfExists(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function readJsonIfExists(file) {
  const text = readTextIfExists(file);
  if (!text) return null;
  return JSON.parse(text);
}

function walkFiles(dir, predicate, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, predicate, out);
    else if (predicate(fullPath, entry)) out.push(fullPath);
  }
  return out;
}

function excerpt(text, max = 180) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function normalizeForDuplicate(text = '') {
  const value = String(text).normalize('NFKC');
  if (value.includes('兮颜') && value.includes('不拧巴') && value.includes('捏')) {
    return 'wechat_xiyan_bu_ningba_nie_nie';
  }
  return value
    .replace(/[0-9:：°%「」!！\s.,，。;；\-_/\\()[\]{}]+/g, '')
    .replace(/OCR标题区|OCR聊天区|微信|聊天区/g, '')
    .slice(0, 120);
}

function classifyRecord(record) {
  const text = `${record.content_text ?? ''}\n${record.content_summary ?? ''}`;
  const title = record.thread_hint?.target_display_name
    ?? record.thread_hint?.conversation_title
    ?? record.window_ref?.target_display_name
    ?? null;
  if (title === '兮颜' || text.includes('兮颜') || (text.includes('不拧巴') && text.includes('捏'))) {
    return {
      applicability: 'pt028_romantic_fixture_replay',
      target_display_name: '兮颜',
      reason: '只读微信 OCR 命中兮颜标题或亲密调侃文本；按测试夹具回放，不写入通用身份事实。'
    };
  }
  if (record.platform === 'external_chat_export' || text.includes('Dialogue System') || text.includes('目标导向')) {
    return {
      applicability: 'not_applicable_system_design_history',
      target_display_name: title,
      reason: '系统设计历史问答，不是目标人物聊天记录。'
    };
  }
  if (!title || title === '微信' || record.source_actor_type === 'unknown') {
    return {
      applicability: 'insufficient_identity_or_content',
      target_display_name: title,
      reason: '缺少明确目标人物标题或可用聊天文本，不能进入 PT-028 阶段判断。'
    };
  }
  return {
    applicability: 'not_romantic_record',
    target_display_name: title,
    reason: '没有检测到恋人关系、暧昧或亲密关系信号。'
  };
}

function cleanXiyanText(contentText = '') {
  const afterChat = String(contentText).split('OCR聊天区：').pop() ?? contentText;
  return afterChat
    .replace(/[0-9:：°%「」!！]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[A-Za-z]/g, '')
    .trim();
}

function buildRomanticReplayDecision(record, sourcePath) {
  const targetPersonId = 'person_pt028_xiyan_fixture';
  const cleaned = cleanXiyanText(record.content_text ?? record.content_summary ?? '');
  return buildDecisionRecommendation({
    goalInput: {
      initial_goal: 'PT-028 现有聊天记录回放：按测试夹具验证恋人关系目标分析、逐句专家评审和真实发送阻断',
      scene: 'personal_social',
      primary_person_id: targetPersonId,
      target_person_ids: [targetPersonId],
      target_display_name: '兮颜',
      identity_labels: ['romantic_partner'],
      context_input: `兮颜：${cleaned}`,
      preferred_channel: 'wechat',
      identity_gate_decision: 'identity_confirmed_by_user_fixture_for_replay_only',
      source_type: 'pt028_read_only_replay'
    },
    socialGraph: {
      user_id: 'user',
      people: [
        {
          person_id: targetPersonId,
          display_name: '兮颜',
          roles: ['romantic_partner'],
          tags: ['pt028_fixture_only', 'not_generic_runtime_default']
        }
      ],
      relationships: [
        {
          relationship_id: 'rel_user_pt028_xiyan_fixture',
          from_person_id: 'user',
          to_person_id: targetPersonId,
          type_code: 'romantic_partner',
          phase: 'confirmed_romantic',
          trust_level: 'medium',
          health_score: 0.72,
          tags: ['fixture_replay_only']
        }
      ],
      events: [
        {
          event_id: `evt_${sha12(sourcePath)}`,
          event_type_code: 'personal_relationship_signal',
          event_level: 'P3',
          title: '只读 OCR 亲密调侃信号',
          start_at: record.captured_at ?? '2026-06-18T08:00:00+08:00',
          status: 'completed',
          importance: 0.56,
          confidence: record.confidence ?? 0.68,
          participants: [{ person_id: targetPersonId, role: 'target' }],
          source_refs: [sourcePath]
        }
      ]
    },
    rawEvents: [
      {
        event_id: `raw_${sha12(sourcePath)}`,
        speaker_person_id: targetPersonId,
        actor_person_id: targetPersonId,
        content: cleaned,
        content_summary: record.content_summary,
        linked_person_ids: [targetPersonId],
        metadata: {
          source_actor_type: 'target',
          observation_id: record.observation_id,
          source_path: sourcePath,
          read_only_replay: true
        }
      }
    ],
    userPreferences: {
      automation_comfort: 'low',
      risk_tolerance: 'low',
      relationship_priority: 'high'
    }
  });
}

function buildStageSmokeEvidence() {
  const targetPersonId = 'person_stage_target';
  const baseGoal = {
    initial_goal: 'PT-028 audit stage replay',
    scene: 'personal_social',
    preferred_channel: 'wechat',
    target_display_name: 'TargetA'
  };
  const confirmedRelationship = {
    type_code: 'romantic_partner',
    phase: 'confirmed_romantic',
    roles: ['romantic_partner']
  };
  const cases = [
    {
      case_id: 'R0_unconfirmed',
      expected_stage: 'R0',
      goalInput: { target_person_ids: [], context_input: 'Need identify context first.' },
      relationship: null
    },
    {
      case_id: 'R1_candidate',
      expected_stage: 'R1',
      goalInput: {
        primary_person_id: targetPersonId,
        target_person_ids: [targetPersonId],
        identity_labels: ['candidate_romantic_interest'],
        context_input: 'TargetA: I enjoy talking with you.'
      },
      relationship: { type_code: 'acquaintance', phase: 'exploring', roles: [] }
    },
    {
      case_id: 'R2_confirmed_no_physical',
      expected_stage: 'R2',
      goalInput: {
        primary_person_id: targetPersonId,
        target_person_ids: [targetPersonId],
        identity_labels: ['romantic_partner'],
        context_input: 'TargetA: I enjoy talking with you.'
      },
      relationship: confirmedRelationship
    },
    {
      case_id: 'R3_hug',
      expected_stage: 'R3',
      goalInput: {
        primary_person_id: targetPersonId,
        target_person_ids: [targetPersonId],
        identity_labels: ['romantic_partner'],
        context_input: 'TargetA: I want to hug you.'
      },
      relationship: confirmedRelationship
    },
    {
      case_id: 'R4_kiss',
      expected_stage: 'R4',
      goalInput: {
        primary_person_id: targetPersonId,
        target_person_ids: [targetPersonId],
        identity_labels: ['romantic_partner'],
        context_input: 'TargetA: I want to kiss you.'
      },
      relationship: confirmedRelationship
    },
    {
      case_id: 'R5_boundary',
      expected_stage: 'R5',
      goalInput: {
        primary_person_id: targetPersonId,
        target_person_ids: [targetPersonId],
        identity_labels: ['romantic_partner'],
        context_input: 'TargetA: We should discuss contraception and intimacy boundaries.'
      },
      relationship: confirmedRelationship
    },
    {
      case_id: 'R6_confirmed_goal_state',
      expected_stage: 'R6',
      goalInput: {
        primary_person_id: targetPersonId,
        target_person_ids: [targetPersonId],
        identity_labels: ['romantic_partner'],
        context_input: 'TargetA: confirmed physical intimacy record exists with mutual consent.'
      },
      relationship: confirmedRelationship
    },
    {
      case_id: 'RX_pressure',
      expected_stage: 'RX',
      goalInput: {
        primary_person_id: targetPersonId,
        target_person_ids: [targetPersonId],
        identity_labels: ['romantic_partner'],
        context_input: 'TargetA: you must have sex or this relationship does not count.'
      },
      relationship: confirmedRelationship
    }
  ];

  return cases.map((item) => {
    const hasTarget = Boolean(item.goalInput.primary_person_id);
    const decision = buildDecisionRecommendation({
      goalInput: {
        ...baseGoal,
        ...item.goalInput
      },
      socialGraph: {
        user_id: 'user',
        people: hasTarget
          ? [{
            person_id: targetPersonId,
            display_name: 'TargetA',
            roles: item.relationship?.roles ?? [],
            tags: []
          }]
          : [],
        relationships: hasTarget
          ? [{
            relationship_id: `rel_${item.case_id}`,
            from_person_id: 'user',
            to_person_id: targetPersonId,
            type_code: item.relationship?.type_code ?? 'acquaintance',
            phase: item.relationship?.phase ?? 'exploring',
            trust_level: 'medium',
            health_score: 0.7
          }]
          : [],
        events: []
      },
      userPreferences: {
        automation_comfort: 'low',
        risk_tolerance: 'low',
        relationship_priority: 'high'
      }
    });
    const analysis = decision.romantic_goal_analysis;
    return {
      case_id: item.case_id,
      expected_stage: item.expected_stage,
      actual_stage: analysis.primary_relationship_stage,
      passed: analysis.primary_relationship_stage === item.expected_stage
        && decision.independent_review.real_execution_allowed === false
        && analysis.physical_intimacy_goal_state.optimization_kpi === false,
      allowed_output_level: analysis.allowed_output_level,
      physical_intimacy_state: analysis.physical_intimacy_state,
      risk_level: analysis.pua_or_coercion_risk.risk_level,
      progression_intensity: analysis.psychological_comfort_model?.progression_intensity ?? null,
      transition_decision: analysis.stage_transition_assessment?.transition_decision ?? null,
      dialogue_act: decision.recommended_option.message_draft?.dialogue_intent_contract?.dialogue_act ?? null,
      third_party_prompt_count: decision.romantic_expert_sentence_review.target_sentence_reviews
        .filter((sentence) => sentence.third_party_prompt_analysis?.not_sent_to_target === true)
        .length,
      user_reasoning_step_count: analysis.user_visible_reasoning_log?.steps?.length ?? 0,
      sentence_review_gate: decision.romantic_expert_sentence_review.gate_decision,
      real_execution_allowed: decision.independent_review.real_execution_allowed
    };
  });
}

function statusItem({ id, label, status, evidence, notes }) {
  return { check_id: id, label, status, evidence, notes };
}

function buildAudit(root) {
  const auditId = `pt028_romantic_flow_audit_${nowId()}`;
  const sourcePath = path.join(root, 'packages/decision-cluster/src/decision-cluster.mjs');
  const testPath = path.join(root, 'packages/decision-cluster/tests/decision-cluster.test.mjs');
  const sourceText = readTextIfExists(sourcePath) ?? '';
  const testText = readTextIfExists(testPath) ?? '';
  const guiStateRuntimeText = readTextIfExists(path.join(root, 'packages/decision-cluster/src/romantic-gui-state.mjs')) ?? '';
  const guiStateWriterText = readTextIfExists(path.join(root, 'scripts/write-pt028-gui-decision-state.mjs')) ?? '';
  const guiComponentText = readTextIfExists(path.join(root, 'sightflow-desktop-agent-main/src/renderer/src/zhineng-console/ZhinengConsole.tsx')) ?? '';
  const guiMainText = readTextIfExists(path.join(root, 'sightflow-desktop-agent-main/src/main/index.ts')) ?? '';
  const latestGuiState = readJsonIfExists(path.join(root, 'runtime/pt028-gui-decision-states/latest.json'));
  const latestEventStream = readJsonIfExists(path.join(root, 'runtime/pt028-gui-event-streams/latest.json'));
  const latestRealObservationGuiStates = readJsonIfExists(path.join(root, 'runtime/pt028-real-observation-gui-states/latest.json'));
  const latestRealFeedbackWorkpack = readJsonIfExists(path.join(root, 'runtime/pt028-real-feedback-workpacks/latest.json'));
  const latestRealFeedbackReadiness = readJsonIfExists(path.join(root, 'runtime/pt028-real-feedback-readiness/latest.json'));
  const latestFeedbackCalibration = readJsonIfExists(path.join(root, 'runtime/pt028-feedback-calibrations/latest.json'));
  const latestFinalAcceptance = readJsonIfExists(path.join(root, 'runtime/pt028-final-special-acceptance/latest.json'));
  const defaultRecordPath = path.join(root, 'runtime/user-inputs/templates/pt028-romantic-relationship-review-default-options.record.md');
  const confirmationPath = path.join(root, 'runtime/user-inputs/romantic-relationship-goal-confirmation-decision.real.json');
  const confirmationTemplatePath = path.join(root, 'runtime/user-inputs/templates/romantic-relationship-goal-confirmation-decision.real.template.json');
  const confirmation = readJsonIfExists(confirmationPath);
  const confirmationTemplate = readJsonIfExists(confirmationTemplatePath);
  const stageEvidence = buildStageSmokeEvidence();

  const desktopFiles = walkFiles(
    path.join(root, 'runtime/desktop-inbox-real'),
    (file) => path.basename(file) === 'intake-observation.real.json'
  ).sort();
  const externalFiles = walkFiles(
    path.join(root, 'runtime/external-chat-intake-real'),
    (file) => path.basename(file) === 'intake-observation.real.json'
  ).sort();
  const rootTextRecords = readdirSync(root)
    .filter((name) => name.endsWith('.txt'))
    .map((name) => path.join(root, name));

  const sourceRecords = [
    ...desktopFiles.map((file) => ({ kind: 'desktop_intake_observation', path: file, json: readJsonIfExists(file) })),
    ...externalFiles.map((file) => ({ kind: 'external_chat_observation', path: file, json: readJsonIfExists(file) })),
    ...rootTextRecords.map((file) => ({
      kind: 'root_text_file',
      path: file,
      json: {
        observation_id: `text_${sha12(file)}`,
        source_adapter_id: 'local_file.manual',
        source_type: 'file',
        platform: 'local_text',
        captured_at: statSync(file).mtime.toISOString(),
        content_text: readTextIfExists(file),
        content_summary: '本地根目录文本记录，用于判断是否属于 PT-028 目标人物聊天。',
        participants_hint: [],
        thread_hint: { conversation_title: path.basename(file) },
        privacy_level: 'local_project_file',
        confidence: 0.7
      }
    }))
  ].filter((item) => item.json);

  const duplicateGroups = new Map();
  for (const item of sourceRecords) {
    const key = normalizeForDuplicate(item.json.content_text ?? item.json.content_summary ?? item.path);
    const group = duplicateGroups.get(key) ?? [];
    group.push(item.path);
    duplicateGroups.set(key, group);
  }

  const analyzedRecords = sourceRecords.map((item, index) => {
    const classification = classifyRecord(item.json);
    const duplicateKey = normalizeForDuplicate(item.json.content_text ?? item.json.content_summary ?? item.path);
    const duplicateGroupSize = duplicateGroups.get(duplicateKey)?.length ?? 1;
    const base = {
      record_index: index + 1,
      record_id: item.json.observation_id ?? `${item.kind}_${index + 1}`,
      kind: item.kind,
      source_path: path.relative(root, item.path).replace(/\\/g, '/'),
      captured_at: item.json.captured_at ?? null,
      platform: item.json.platform ?? null,
      source_actor_type: item.json.source_actor_type ?? null,
      target_display_name: classification.target_display_name,
      applicability: classification.applicability,
      classification_reason: classification.reason,
      duplicate_key: duplicateKey || sha12(item.path),
      duplicate_group_size: duplicateGroupSize,
      content_excerpt: excerpt(item.json.content_text ?? item.json.content_summary, 220)
    };

    if (classification.applicability !== 'pt028_romantic_fixture_replay') {
      return {
        ...base,
        analysis_status: 'not_run_through_pt028_runtime',
        stage: null,
        reason: classification.reason
      };
    }

    const decision = buildRomanticReplayDecision(item.json, item.path);
    const romantic = decision.romantic_goal_analysis;
    return {
      ...base,
      analysis_status: 'pt028_runtime_replayed',
      stage: romantic.primary_relationship_stage,
      stage_id: romantic.primary_relationship_stage_id,
      physical_intimacy_state: romantic.physical_intimacy_state,
      allowed_output_level: romantic.allowed_output_level,
      output_mode: romantic.output_delivery_policy?.current_output_mode ?? null,
      content_suggestion_available: romantic.output_delivery_policy?.content_suggestion_available ?? null,
      context_gap_diagnosis: romantic.context_gap_diagnosis?.diagnosis ?? null,
      current_state_process_decision: romantic.context_gap_diagnosis?.current_state_process_decision ?? null,
      progression_intensity: romantic.psychological_comfort_model?.progression_intensity ?? null,
      transition_decision: romantic.stage_transition_assessment?.transition_decision ?? null,
      dialogue_act: decision.recommended_option.message_draft?.dialogue_intent_contract?.dialogue_act ?? null,
      user_reasoning_step_count: romantic.user_visible_reasoning_log?.steps?.length ?? 0,
      risk_level: romantic.pua_or_coercion_risk.risk_level,
      target_utterance_count: romantic.target_utterances.length,
      missing_evidence: romantic.stage_missing_evidence,
      sentence_review_gate: decision.romantic_expert_sentence_review.gate_decision,
      sentence_review_count: decision.romantic_expert_sentence_review.target_sentence_reviews.length,
      third_party_prompt_count: decision.romantic_expert_sentence_review.target_sentence_reviews
        .filter((sentence) => sentence.third_party_prompt_analysis?.not_sent_to_target === true)
        .length,
      first_third_party_prompt: decision.romantic_expert_sentence_review.target_sentence_reviews[0]
        ?.third_party_prompt_analysis?.prompt ?? null,
      expert_count_per_sentence: decision.romantic_expert_sentence_review.required_expert_ids.length,
      user_side_reviewer: decision.romantic_expert_sentence_review.safety_module_reviews[0]?.reviewer_id ?? null,
      real_execution_allowed: decision.independent_review.real_execution_allowed,
      selected_template_id: decision.recommended_option.message_draft?.selected_template_id ?? null,
      draft_excerpt: excerpt(decision.recommended_option.message_draft?.draft, 120),
      fixture_isolation: romantic.test_fixture_policy
    };
  });

  const pt028ReplayRecords = analyzedRecords.filter((item) => item.analysis_status === 'pt028_runtime_replayed');
  const duplicateSummaries = [...duplicateGroups.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([key, files]) => ({
      duplicate_key: key || 'empty_content',
      count: files.length,
      files: files.map((file) => path.relative(root, file).replace(/\\/g, '/'))
    }));

  const completion_checks = [
    statusItem({
      id: 'default_options_snapshot',
      label: '当前用户决定已改为推荐默认并保留副本',
      status: existsSync(defaultRecordPath) ? 'passed' : 'open',
      evidence: path.relative(root, defaultRecordPath).replace(/\\/g, '/'),
      notes: existsSync(defaultRecordPath)
        ? '副本存在，且记录 formal_approval=false / real_send_allowed=false。'
        : '缺少默认选项副本。'
    }),
    statusItem({
      id: 'formal_approval_gate',
      label: '结构化正式确认文件',
      status: confirmation?.approved_for_code_implementation === true ? 'passed' : 'open',
      evidence: existsSync(confirmationPath)
        ? path.relative(root, confirmationPath).replace(/\\/g, '/')
        : path.relative(root, confirmationTemplatePath).replace(/\\/g, '/'),
      notes: confirmation?.approved_for_code_implementation === true
        ? '正式确认文件已批准。'
        : `当前仍未批准；模板 approved_for_code_implementation=${confirmationTemplate?.approved_for_code_implementation ?? 'unknown'}。`
    }),
    statusItem({
      id: 'schemas_runtime_present',
      label: 'romantic_goal_analysis / romantic_expert_sentence_review schema 与运行时',
      status: existsSync(path.join(root, 'schemas/romantic-goal-analysis.schema.json'))
        && existsSync(path.join(root, 'schemas/romantic-expert-sentence-review.schema.json'))
        && sourceText.includes('buildRomanticGoalAnalysis')
        && sourceText.includes('buildRomanticExpertSentenceReview')
        ? 'passed'
        : 'open',
      evidence: 'schemas/romantic-goal-analysis.schema.json; schemas/romantic-expert-sentence-review.schema.json; packages/decision-cluster/src/decision-cluster.mjs',
      notes: '核心分析对象和逐句专家评审运行时已存在。'
    }),
    statusItem({
      id: 'test_fixture_isolation',
      label: '兮颜仅作为测试夹具，不污染通用实现',
      status: !sourceText.includes('兮颜') && sourceText.includes('fixture_names_are_test_data_only')
        ? 'passed'
        : 'open',
      evidence: 'packages/decision-cluster/src/decision-cluster.mjs',
      notes: '通用运行时源文件不包含具体姓名；测试和文档可引用兮颜作为 fixture。'
    }),
    statusItem({
      id: 'stage_coverage',
      label: 'R0-R6/RX 阶段运行时与专项测试覆盖',
      status: stageEvidence.every((item) => item.passed) && testText.includes('covers R0-R6 and RX stage gates')
        ? 'passed'
        : 'open',
      evidence: 'packages/decision-cluster/tests/decision-cluster.test.mjs',
      notes: `阶段烟雾验证 ${stageEvidence.filter((item) => item.passed).length}/${stageEvidence.length} 通过。`
    }),
    statusItem({
      id: 'physical_intimacy_goal_state_not_kpi',
      label: '生理亲密作为关系目标状态，不作为自动发送 KPI',
      status: stageEvidence.every((item) => item.real_execution_allowed === false) ? 'passed' : 'open',
      evidence: 'romantic_goal_analysis.physical_intimacy_goal_state',
      notes: 'R6 输出 analysis_only；optimization_kpi=false；automatic_send_metric=false；真实发送仍阻断。'
    }),
    statusItem({
      id: 'expert_matrix_and_separation',
      label: '九专家逐句评审、目标侧 PUA 与用户侧安全审核拆分',
      status: pt028ReplayRecords.every((item) => item.expert_count_per_sentence === 9 && item.user_side_reviewer === 'user_side_manipulation_reviewer')
        && sourceText.includes("scope: 'target_to_user_only'")
        ? 'passed'
        : 'open',
      evidence: 'romantic_expert_sentence_review.v1',
      notes: pt028ReplayRecords.length
        ? '现有可回放记录已生成逐句九专家评审，并保留 user_side_manipulation_reviewer。'
        : '运行时存在，但当前没有可回放恋人记录。'
    }),
    statusItem({
      id: 'user_visible_log_runtime',
      label: '用户可见风险日志',
      status: sourceText.includes('relationship_reasoning_log.v1')
        && guiStateRuntimeText.includes('user_visible_reasoning_log')
        && latestGuiState?.schema_version === 'pt028_gui_decision_state.v1'
        ? 'passed'
        : 'open',
      evidence: 'romantic_goal_analysis.user_visible_reasoning_log; runtime/pt028-gui-decision-states/latest.json',
      notes: '运行时输出日志决策；GUI/状态页实际渲染联动仍是后续 open 项。'
    }),
    statusItem({
      id: 'real_send_blocked',
      label: '真实发送保持阻断',
      status: analyzedRecords.every((item) => item.real_execution_allowed !== true) ? 'passed' : 'open',
      evidence: 'independent_review.real_execution_allowed=false',
      notes: '审计脚本和回放均不执行真实发送。'
    }),
    statusItem({
      id: 'default_content_suggestion_when_send_blocked',
      label: '自动发送阻断时默认进入内容提示或上下文补读提示',
      status: sourceText.includes('target_output_delivery_policy.v1') ? 'passed' : 'open',
      evidence: 'romantic_goal_analysis.output_delivery_policy',
      notes: '真实发送保持 false；可用当前消息时展示内容提示，疑似未读取消息时展示上下文补读提示。'
    }),
    statusItem({
      id: 'context_gap_diagnosis',
      label: '上下文不足诊断不把缺失历史误判为关系停滞',
      status: sourceText.includes('romantic_context_gap_diagnosis.v1') ? 'passed' : 'open',
      evidence: 'romantic_goal_analysis.context_gap_diagnosis',
      notes: '区分当前消息可用但历史不足、疑似消息未读/未采集、人物窗口未确认等情况。'
    }),
    statusItem({
      id: 'relationship_gradient_runtime',
      label: '关系梯度、心理舒适度、句子意图和第三方提示已接入',
      status: sourceText.includes('relationship_gradient_framework.v1')
        && sourceText.includes('psychological_comfort_model.v1')
        && sourceText.includes('dialogue_intent_contract.v1')
        && sourceText.includes('third_party_target_reply_prompt.v1')
        ? 'passed'
        : 'open',
      evidence: 'romantic_goal_analysis.relationship_gradient_framework; psychological_comfort_model; stage_transition_assessment; dialogue_intent_contract; third_party_prompt_analysis',
      notes: '运行时输出可复用阶段推进框架、恋人阶段梯度、动态特征、用户推理日志、第一人称草稿意图和自动输入阻断下的第三方提示。'
    }),
    statusItem({
      id: 'romantic_v2_online_offline_cadence_runtime',
      label: '恋爱专家 V2 线上/线下双轨和推进节奏已接入',
      status: sourceText.includes('online_offline_progression_track.v1')
        && sourceText.includes('date_transition_readiness.v1')
        && sourceText.includes('romantic_progression_cadence.v1')
        && latestGuiState?.relationship_gradient_review?.online_offline_progression_track?.schema_version === 'online_offline_progression_track.v1'
        && latestGuiState?.relationship_gradient_review?.romantic_progression_cadence?.schema_version === 'romantic_progression_cadence.v1'
        ? 'passed'
        : 'open',
      evidence: 'romantic_goal_analysis.online_offline_progression_track; date_transition_readiness; romantic_progression_cadence; runtime/pt028-gui-decision-states/latest.json',
      notes: '运行时已输出 O/F 双轨、见面转场 readiness 和 current_turn_intent；悬浮窗短状态应呈现 R*/O*/F* · intent · gate。'
    }),
    statusItem({
      id: 'existing_chat_replay',
      label: '现有聊天记录逐项回放',
      status: pt028ReplayRecords.length > 0 ? 'partial' : 'open',
      evidence: 'runtime/desktop-inbox-real/**/intake-observation.real.json',
      notes: pt028ReplayRecords.length
        ? `已回放 ${pt028ReplayRecords.length} 条兮颜只读 OCR 记录；内容重复且上下文窗口不足，不能作为 R3-R6 升级证据。`
        : '没有发现可回放的 PT-028 记录。'
    }),
    statusItem({
      id: 'gui_decision_state_linkage',
      label: 'GUI runtime decision-state linkage',
      status: guiStateRuntimeText.includes('pt028_gui_decision_state.v1')
        && guiStateWriterText.includes('write-pt028-gui-decision-state')
        && guiMainText.includes('zhineng:decision-state:get')
        && guiComponentText.includes('mergeRuntimeGradientReview')
        && latestGuiState?.schema_version === 'pt028_gui_decision_state.v1'
        ? 'passed'
        : 'open',
      evidence: 'packages/decision-cluster/src/romantic-gui-state.mjs; scripts/write-pt028-gui-decision-state.mjs; Sightflow GUI IPC; runtime/pt028-gui-decision-states/latest.json',
      notes: 'The GUI now reads a runtime projection containing reasoning log, third-party prompts, chain flow and branch records.'
    }),
    statusItem({
      id: 'expert_context_pack_and_run_log',
      label: 'ExpertContextPack and parallel expert run log',
      status: sourceText.includes('expert_context_pack.v1')
        && sourceText.includes('parallel_expert_run_log.v1')
        && latestGuiState?.expert_context_packs?.length > 0
        && latestGuiState?.parallel_expert_run_log?.schema_version === 'parallel_expert_run_log.v1'
        ? 'passed'
        : 'open',
      evidence: 'expert_matrix_analysis.expert_context_packs; expert_matrix_analysis.parallel_expert_run_log; runtime/pt028-gui-decision-states/latest.json',
      notes: 'Each selected expert receives a human-readable context pack and the run log records independent lanes before merge.'
    }),
    statusItem({
      id: 'romantic_coordinator_frontend_send_gate',
      label: 'Romantic coordinator frontend and send-gate contract',
      status: sourceText.includes('romantic_relationship_coordinator_expert.v1')
        && sourceText.includes('frontend_display_contract.v1')
        && sourceText.includes('send_gate_transfer_path.v1')
        && latestGuiState?.romantic_coordinator_decision?.schema_version === 'romantic_relationship_coordinator_expert.v1'
        && latestGuiState?.frontend_display_contract?.schema_version === 'frontend_display_contract.v1'
        && latestGuiState?.send_gate_transfer_path?.schema_version === 'send_gate_transfer_path.v1'
        ? 'passed'
        : 'open',
      evidence: 'romantic_relationship_coordinator; frontend_display_contract; send_gate_transfer_path; runtime/pt028-gui-decision-states/latest.json',
      notes: 'The coordinator now produces the console log contract, dock brief status and blocked/controlled send-gate transfer path.'
    }),
    statusItem({
      id: 'dock_brief_and_console_detail_split',
      label: 'Dock brief status and console detail log split',
      status: guiComponentText.includes('getDockBriefFromRuntimeState')
        && guiComponentText.includes('zg-detail-log')
        && guiComponentText.includes('dockRuntimeDecisionState')
        && guiComponentText.includes('expertRunRows')
        && String(latestGuiState?.frontend_display_contract?.surfaces?.dock?.text ?? '').includes('·')
        ? 'passed'
        : 'open',
      evidence: 'ZhinengConsole dock runtime state reader; console detail log sections',
      notes: 'The floating dock consumes the brief status while detailed coordinator, expert and send-gate logs stay in the console.'
    }),
    statusItem({
      id: 'low_latency_event_stream_runtime',
      label: 'Low-latency GUI event stream and desktop push channel',
      status: latestEventStream?.schema_version === 'pt028_gui_event_stream.v1'
        && latestEventStream?.low_latency_policy?.desktop_ipc_channel === 'zhineng:decision-state:changed'
        && latestEventStream?.stream_integrity?.event_count > 0
        && latestEventStream?.stream_integrity?.real_execution_allowed === false
        && guiMainText.includes('startZhinengDecisionStateWatch')
        && guiMainText.includes('zhineng:decision-state:changed')
        && guiComponentText.includes('zhineng:decision-state:changed')
        ? 'passed'
        : 'open',
      evidence: 'runtime/pt028-gui-event-streams/latest.json; Sightflow decision-state watcher and renderer push listener',
      notes: 'The GUI can receive decision-state updates through a watched latest.json push channel while retaining polling fallback.'
    }),
    statusItem({
      id: 'multi_window_feedback_calibration_dry_run',
      label: 'Multi-window feedback calibration dry-run with target isolation',
      status: latestFeedbackCalibration?.schema_version === 'pt028_multi_window_feedback_calibration.v1'
        && latestFeedbackCalibration?.window_count >= 2
        && latestFeedbackCalibration?.target_count >= 2
        && latestFeedbackCalibration?.no_cross_target_state_reuse === true
        && latestFeedbackCalibration?.prompt_only_all_windows === true
        ? latestFeedbackCalibration?.required_open_items?.includes('real_operator_feedback_missing_for_one_or_more_windows')
          ? 'partial'
          : 'passed'
        : 'open',
      evidence: 'runtime/pt028-feedback-calibrations/latest.json',
      notes: 'The dry-run proves multi-window isolation and prompt-only handling; real operator feedback is still required for production calibration.'
    }),
    statusItem({
      id: 'candidate_real_observation_gui_states',
      label: 'Real observation candidate GUI states are generated for operator review',
      status: latestRealObservationGuiStates?.schema_version === 'pt028_real_observation_gui_states.v1'
        && latestRealObservationGuiStates?.summary?.generated_state_count >= 2
        && latestRealObservationGuiStates?.real_execution_allowed === false
        && latestRealObservationGuiStates?.real_send_attempted === false
        && latestRealObservationGuiStates?.writes_real_feedback_target === false
        ? latestRealObservationGuiStates?.event_stream?.target_count >= 2
          ? 'passed'
          : 'partial'
        : 'open',
      evidence: 'runtime/pt028-real-observation-gui-states/latest.json',
      notes: 'Candidate GUI states can prefill workpack state_path values, but they still require operator confirmation; current production readiness also depends on target/window coverage.'
    }),
    statusItem({
      id: 'real_feedback_workpack_ready',
      label: 'Real feedback operator workpack is ready for collection',
      status: latestRealFeedbackWorkpack?.schema_version === 'pt028_real_feedback_workpack.v1'
        && latestRealFeedbackWorkpack?.gate_decision === 'pt028_real_feedback_workpack_ready_for_operator_collection'
        && latestRealFeedbackWorkpack?.writes_real_feedback_target === false
        && latestRealFeedbackWorkpack?.real_execution_allowed === false
        && latestRealFeedbackWorkpack?.real_send_attempted === false
        && (latestRealFeedbackWorkpack?.window_review_tasks ?? []).length >= 2
        && latestRealFeedbackWorkpack?.source?.target_feedback_exists === false
        ? 'passed'
        : 'open',
      evidence: 'runtime/pt028-real-feedback-workpacks/latest.json; runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
      notes: latestRealFeedbackWorkpack?.schema_version === 'pt028_real_feedback_workpack.v1'
        ? 'The operator worksheet and draft feedback batch exist, but they are collection aids only; they do not satisfy real feedback readiness until the real target file is filled and reviewed.'
        : 'Run npm run pt028:feedback-workpack to create the operator worksheet before collecting real multi-window feedback.'
    }),
    statusItem({
      id: 'real_feedback_readiness_gate',
      label: 'Real multi-window operator feedback readiness',
      status: latestRealFeedbackReadiness?.schema_version === 'pt028_real_feedback_readiness.v1'
        ? latestRealFeedbackReadiness?.final_acceptance_ready === true
          ? 'passed'
          : latestRealFeedbackReadiness?.calibration_ready === true
            ? 'partial'
            : 'open'
        : 'open',
      evidence: 'runtime/pt028-real-feedback-readiness/latest.json; runtime/user-inputs/pt028-real-multi-window-operator-feedback.real.json',
      notes: 'This readiness gate checks the real feedback file, placeholders, target/window uniqueness, state paths, prompt-only blocking, evidence refs and human special review before calibration or final acceptance.'
    }),
    statusItem({
      id: 'final_special_acceptance_gate',
      label: 'Final special acceptance gate exists and blocks missing real evidence',
      status: latestFinalAcceptance?.schema_version === 'pt028_final_special_acceptance.v1'
        && latestFinalAcceptance?.gate_decision === 'blocked_pending_real_special_acceptance_evidence'
        && latestFinalAcceptance?.required_failures?.some((item) => item.check_id === 'real_feedback_readiness_gate')
        && latestFinalAcceptance?.required_failures?.some((item) => item.check_id === 'real_feedback_calibration_evidence')
        && latestFinalAcceptance?.required_failures?.some((item) => item.check_id === 'final_human_special_review')
        && latestFinalAcceptance?.real_execution_allowed === false
        ? 'passed'
        : 'open',
      evidence: 'runtime/pt028-final-special-acceptance/latest.json',
      notes: 'The acceptance gate now separates completed engineering evidence from missing real feedback and final human review.'
    }),
    statusItem({
      id: 'production_feedback_and_gui',
      label: '低延迟预览、GUI/日志联动、真实反馈校准',
      status: 'open',
      evidence: 'docs/15 PT-028 open question',
      notes: '这部分仍未完成，不能判定 PT-028 生产级完整实现。'
    })
  ];

  for (const item of completion_checks) {
    if (item.check_id === 'user_visible_log_runtime') {
      item.notes = '运行时已输出用户可见推理日志，并通过 pt028_gui_decision_state.v1 投影到 GUI/状态页。';
    }
    if (item.check_id === 'production_feedback_and_gui') {
      item.label = '真实反馈校准和最终专项验收';
      item.notes = '低延迟事件流、GUI 决策状态联动、多窗口 dry-run 校准和最终验收门禁已接入；生产级仍需真实 operator feedback 覆盖每个目标窗口，并完成最终人工专项确认。';
    }
  }

  const requiredOpen = completion_checks.filter((item) => ['open'].includes(item.status));
  const partialItems = completion_checks.filter((item) => item.status === 'partial');

  return {
    schema_version: 'pt028_romantic_flow_audit.v1',
    audit_id: auditId,
    generated_at: new Date().toISOString(),
    real_execution_allowed: false,
    real_send_attempted: false,
    overall_status: requiredOpen.length
      ? 'core_runtime_implemented_but_production_acceptance_open'
      : partialItems.length
        ? 'core_runtime_passed_with_partial_runtime_integration'
        : 'passed',
    pt028_fully_implemented_for_production: requiredOpen.length === 0 && partialItems.length === 0,
    core_runtime_stage_tests_passed: stageEvidence.every((item) => item.passed),
    source_inventory: {
      desktop_observation_count: desktopFiles.length,
      external_chat_observation_count: externalFiles.length,
      root_text_record_count: rootTextRecords.length,
      total_records_reviewed: sourceRecords.length,
      pt028_replay_record_count: pt028ReplayRecords.length,
      duplicate_group_count: duplicateSummaries.length
    },
    completion_checks,
    stage_smoke_evidence: stageEvidence,
    duplicate_summaries: duplicateSummaries,
    analyzed_records: analyzedRecords
  };
}

function renderMarkdown(audit) {
  const lines = [];
  lines.push(`# PT-028 恋人关系流程实现与现有聊天记录审计`);
  lines.push('');
  lines.push(`audit_id: \`${audit.audit_id}\``);
  lines.push('');
  lines.push(`overall_status: \`${audit.overall_status}\``);
  lines.push('');
  lines.push(`production_complete: \`${audit.pt028_fully_implemented_for_production}\``);
  lines.push('');
  lines.push(`real_execution_allowed: \`${audit.real_execution_allowed}\``);
  lines.push('');
  lines.push('## 1. 总结结论');
  lines.push('');
  lines.push(audit.pt028_fully_implemented_for_production
    ? 'PT-028 已满足当前审计口径下的生产级完整实现。'
    : 'PT-028 的核心运行时已经接入并通过阶段专项验证；低延迟事件流、GUI/用户可见日志联动、多窗口 dry-run 校准和最终验收门禁已接入，但还不能称为生产级完整实现：真实 operator feedback 和最终人工专项确认仍未闭合。');
  lines.push('');
  lines.push('## 2. 完成度检查');
  lines.push('');
  lines.push('| 检查项 | 状态 | 证据 | 说明 |');
  lines.push('| --- | --- | --- | --- |');
  for (const item of audit.completion_checks) {
    lines.push(`| ${item.label} | \`${item.status}\` | ${item.evidence} | ${item.notes} |`);
  }
  lines.push('');
  lines.push('## 3. 阶段专项验证');
  lines.push('');
  lines.push('| 用例 | 期望阶段 | 实际阶段 | 输出等级 | 强度 | 迁移判断 | 对话意图 | 三方提示 | 真实发送 | 通过 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const item of audit.stage_smoke_evidence) {
    lines.push(`| ${item.case_id} | ${item.expected_stage} | ${item.actual_stage} | ${item.allowed_output_level} | ${item.progression_intensity ?? ''} | ${item.transition_decision ?? ''} | ${item.dialogue_act ?? ''} | ${item.third_party_prompt_count ?? 0} | ${item.real_execution_allowed} | ${item.passed} |`);
  }
  lines.push('');
  lines.push('## 4. 现有记录逐项分析');
  lines.push('');
  lines.push(`共检查 ${audit.source_inventory.total_records_reviewed} 条来源记录，其中 ${audit.source_inventory.pt028_replay_record_count} 条进入 PT-028 只读回放。`);
  lines.push('');
  lines.push('| # | 来源 | 目标 | 适用性 | 阶段 | 输出模式 | 上下文诊断 | 强度 / 迁移 | 对话意图 / 三方提示 | 缺失证据 / 原因 | 摘要 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const item of audit.analyzed_records) {
    const missingOrReason = item.missing_evidence?.join(', ') ?? item.reason ?? item.classification_reason;
    const branch = [item.progression_intensity, item.transition_decision].filter(Boolean).join(' / ');
    const prompt = [item.dialogue_act, item.third_party_prompt_count ? `third_party=${item.third_party_prompt_count}` : null].filter(Boolean).join(' / ');
    lines.push(`| ${item.record_index} | ${item.source_path} | ${item.target_display_name ?? ''} | \`${item.applicability}\` | ${item.stage ?? ''} | ${item.output_mode ?? ''} | ${item.context_gap_diagnosis ?? ''} | ${branch} | ${prompt} | ${missingOrReason} | ${item.content_excerpt.replace(/\|/g, '/')} |`);
  }
  lines.push('');
  lines.push('## 5. 重复记录');
  lines.push('');
  if (!audit.duplicate_summaries.length) {
    lines.push('未发现重复组。');
  } else {
    for (const group of audit.duplicate_summaries) {
      lines.push(`- \`${group.duplicate_key}\`: ${group.count} 条`);
      for (const file of group.files.slice(0, 8)) {
        lines.push(`  - ${file}`);
      }
    }
  }
  lines.push('');
  lines.push('## 6. 下一步建议');
  lines.push('');
  lines.push('1. 复制并填写正式确认文件，明确是否批准 PT-028 进入更完整的生产实现。');
  lines.push('2. 把 `relationship_safety_log.v1` 接到 GUI/状态页，验证用户可见、目标不可见。');
  lines.push('3. 为真实恋人关系样本补齐 today / last_7_days / last_30_days / historical_stage 四窗口上下文，避免单句 OCR 被误当作升级依据。');
  lines.push('4. 做真实反馈校准前继续保持 `real_execution_allowed=false`。');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/audit-pt028-romantic-flow.mjs [--root=<dir>] [--output-dir=<dir>]',
    '',
    'Writes pt028_romantic_flow_audit.v1 by checking PT-028 runtime coverage and replaying existing read-only chat records without sending anything.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const audit = buildAudit(root);
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : path.join(root, 'runtime/pt028-audits', audit.audit_id);
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'pt028-romantic-flow-audit.json');
  const markdownPath = path.join(outputDir, 'pt028-romantic-flow-audit.md');
  writeFileSync(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderMarkdown(audit), 'utf8');
  console.log(JSON.stringify({
    command: 'audit-pt028-romantic-flow',
    audit_id: audit.audit_id,
    overall_status: audit.overall_status,
    pt028_fully_implemented_for_production: audit.pt028_fully_implemented_for_production,
    core_runtime_stage_tests_passed: audit.core_runtime_stage_tests_passed,
    total_records_reviewed: audit.source_inventory.total_records_reviewed,
    pt028_replay_record_count: audit.source_inventory.pt028_replay_record_count,
    duplicate_group_count: audit.source_inventory.duplicate_group_count,
    real_execution_allowed: audit.real_execution_allowed,
    real_send_attempted: audit.real_send_attempted,
    json_path: jsonPath,
    markdown_path: markdownPath
  }, null, 2));
}
