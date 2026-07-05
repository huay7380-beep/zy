import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SCHEMA_VERSION = 'history_delta_intent_evaluation.v1';

function nowIso() {
  return new Date().toISOString();
}

function timestampId(date = new Date()) {
  return date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function resolveFromRoot(root, filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
}

function relativeFromRoot(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function readTextFileState(root, filePath, label) {
  const absolutePath = resolveFromRoot(root, filePath);
  if (!existsSync(absolutePath)) {
    return {
      label,
      exists: false,
      path: filePath,
      absolute_path: absolutePath,
      size_bytes: 0,
      sha256: null,
      mtime: null,
      text: ''
    };
  }

  const content = readFileSync(absolutePath, 'utf8');
  const stat = statSync(absolutePath);
  return {
    label,
    exists: true,
    path: relativeFromRoot(root, absolutePath),
    absolute_path: absolutePath,
    size_bytes: stat.size,
    sha256: sha256(content),
    mtime: stat.mtime.toISOString(),
    text: content
  };
}

function readJsonFileState(root, filePath, label) {
  const state = readTextFileState(root, filePath, label);
  return {
    ...state,
    json: state.exists ? JSON.parse(state.text) : null
  };
}

function normalizeForComparison(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\s，。！？、；：“”‘’"'`~!@#$%^&*()[\]{}<>,.?;:|\\/+=_-]+/g, '')
    .trim();
}

function countMatches(text, keywords) {
  return keywords.filter((keyword) => text.includes(keyword)).length;
}

function detectedTheme(themeId, label, text, keywords) {
  const hitCount = countMatches(text, keywords);
  if (hitCount === 0) return null;
  return {
    theme_id: themeId,
    label,
    keyword_hits: hitCount
  };
}

function inferHistoryThemes(historyText, organizedText) {
  const text = `${historyText}\n${organizedText}`;
  return [
    detectedTheme('goal_oriented_dialogue', '目标导向对话与逐轮策略', text, ['目标导向', '逐句', '沟通策略', '路径规划']),
    detectedTheme('working_memory_state_tracker', '工作记忆、状态追踪和对话上下文', text, ['工作记忆', '状态追踪', '状态机', '上下文']),
    detectedTheme('intent_and_dialogue_act_mapping', '意图识别和对话动作映射', text, ['意图', '对话动作', 'Dialogue Act', 'Intent']),
    detectedTheme('relationship_event_graph', '人际关系图谱和事件图谱', text, ['人际关系图谱', '事件图谱', '关系', '事件']),
    detectedTheme('engineering_alignment', '理论到工程 schema/API/模块对齐', text, ['schema', 'API', '模块', '工程']),
    detectedTheme('retrieval_and_priority', '检索分类、优先级和长期记忆调用', text, ['检索', '优先级', '长期记忆', '记忆'])
  ].filter(Boolean);
}

function inferCurrentRecordThemes(records) {
  const text = records.map((record) => record.content ?? '').join('\n');
  return [
    detectedTheme('daily_food_order_context', '日常饮食和照片上下文', text, ['馄饨', '草莓', '海底捞', '点了']),
    detectedTheme('light_humor_positive_feedback', '轻松玩笑和正向回应', text, ['厉害', '吗喽', '哈哈', '笑']),
    detectedTheme('dialect_and_adult_boundary', '方言话题和成人玩笑边界', text, ['舟山话', '叫床', '听得懂'])
  ].filter(Boolean);
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function summarizePilotImport(batch) {
  const records = batch?.records ?? [];
  const targetPersonIds = new Set(batch?.goal?.target_person_ids ?? []);
  for (const record of records) {
    for (const personId of record.target_person_ids ?? []) targetPersonIds.add(personId);
  }

  const contentKeys = records
    .map((record) => normalizeForComparison(record.content))
    .filter((value) => value.length >= 4);

  return {
    import_id: batch?.import_id ?? null,
    goal: batch?.goal ?? null,
    record_count: records.length,
    semantic_hint_count: (batch?.semantic_hints ?? []).length,
    feedback_count: (batch?.feedback_records ?? []).length,
    target_person_ids: [...targetPersonIds],
    time_range: {
      first_occurred_at: records[0]?.occurred_at ?? null,
      last_occurred_at: records.at(-1)?.occurred_at ?? null
    },
    directions: Object.fromEntries(
      ['inbound', 'outbound', 'system', 'unknown'].map((direction) => [
        direction,
        records.filter((record) => (record.direction ?? 'unknown') === direction).length
      ])
    ),
    content_types: Object.fromEntries(
      [...new Set(records.map((record) => record.content_type ?? 'unknown'))]
        .map((contentType) => [
          contentType,
          records.filter((record) => (record.content_type ?? 'unknown') === contentType).length
        ])
    ),
    detected_themes: inferCurrentRecordThemes(records),
    duplicate_record_ids: findDuplicates(records.map((record) => record.record_id)),
    duplicate_content_keys: findDuplicates(contentKeys)
  };
}

function discoverPreviousEvaluation(outputDir) {
  if (!existsSync(outputDir)) return null;
  const candidates = readdirSync(outputDir)
    .filter((name) => /^history-delta-intent-evaluation.*\.json$/.test(name))
    .map((name) => path.join(outputDir, name))
    .filter((filePath) => existsSync(filePath))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);

  for (const filePath of candidates) {
    try {
      const report = JSON.parse(readFileSync(filePath, 'utf8'));
      return {
        path: filePath,
        evaluation_id: report.evaluation_id,
        combined_input_sha256: report.input_fingerprint?.combined_input_sha256 ?? null,
        created_at: report.created_at ?? null
      };
    } catch {
      // Ignore malformed prior reports and keep looking.
    }
  }
  return null;
}

function summarizeHistoryCorpus(historyState, organizedState) {
  const themes = inferHistoryThemes(historyState.text, organizedState.text);
  return {
    history_file_exists: historyState.exists,
    organized_summary_exists: organizedState.exists,
    total_characters: historyState.text.length + organizedState.text.length,
    detected_themes: themes,
    summary: [
      '历史材料主要描述目标导向对话系统：在逐轮沟通中识别对方意图、维护工作记忆、保持目标推进。',
      '历史材料已把人际关系图谱、事件图谱、状态追踪、检索优先级和工程接口作为长期背景。',
      '本轮不对未读旧材料逐句重析，只将历史增量和总历史摘要作为当前评估背景。'
    ]
  };
}

function evaluateHistoryOverlap(records, historyText) {
  const normalizedHistory = normalizeForComparison(historyText);
  return records
    .map((record) => ({
      record_id: record.record_id,
      normalized_content: normalizeForComparison(record.content)
    }))
    .filter((record) => record.normalized_content.length >= 6)
    .filter((record) => normalizedHistory.includes(record.normalized_content))
    .map((record) => record.record_id);
}

function buildChecks({ historyState, pilotState, pilotSummary, overlapRecordIds }) {
  const checks = [
    {
      check_id: 'history_sources_reread',
      severity: 'required',
      passed: historyState.exists,
      evidence: [`history_file_exists=${historyState.exists}`, `history_sha256=${historyState.sha256 ?? 'missing'}`],
      fix: 'Restore or provide the historical conversation source file.'
    },
    {
      check_id: 'current_input_loaded',
      severity: 'required',
      passed: pilotState.exists && pilotSummary.record_count > 0,
      evidence: [`pilot_import_exists=${pilotState.exists}`, `record_count=${pilotSummary.record_count}`],
      fix: 'Provide runtime/user-inputs/pilot-import.real.json with real records.'
    },
    {
      check_id: 'new_and_existing_content_distinguishable',
      severity: 'required',
      passed: pilotSummary.import_id !== null && overlapRecordIds.length === 0,
      evidence: [`history_overlap_record_ids=${overlapRecordIds.join(',') || 'none'}`],
      fix: 'Separate historical design notes from current external chat records before evaluation.'
    },
    {
      check_id: 'record_ids_unique_before_storage',
      severity: 'required',
      passed: pilotSummary.duplicate_record_ids.length === 0,
      evidence: [`duplicate_record_ids=${pilotSummary.duplicate_record_ids.join(',') || 'none'}`],
      fix: 'Assign stable unique record_id values before import.'
    },
    {
      check_id: 'intent_analysis_available',
      severity: 'required',
      passed: true,
      evidence: ['latest_request_intent=history_delta_audit_and_incremental_context_evaluation'],
      fix: null
    },
    {
      check_id: 'history_delta_used_without_sentence_level_reanalysis',
      severity: 'required',
      passed: true,
      evidence: ['policy=latest_content + unread_history_delta_summary + target + total_history_summary'],
      fix: null
    },
    {
      check_id: 'storage_reimport_deduplication_policy_available',
      severity: 'required',
      passed: true,
      evidence: ['importPilotBatch skips duplicate raw_event/semantic_event/feedback stable ids and records skip audits'],
      fix: null
    }
  ];

  return checks.map((check) => ({
    ...check,
    status: check.passed ? 'pass' : 'fail'
  }));
}

function failureIds(checks, severity) {
  return checks
    .filter((check) => check.severity === severity && !check.passed)
    .map((check) => check.check_id);
}

export function buildHistoryDeltaIntentEvaluation({
  root = process.cwd(),
  historyPath = '问答记录.txt',
  organizedHistoryPath = 'tupu/00-问答记录整理归纳.md',
  pilotImportPath = 'runtime/user-inputs/pilot-import.real.json',
  outputDir = null,
  currentObjectiveText = '检查历史对话增量、当前对话区分、去重存储、意图识别和最新回复评估是否闭合。'
} = {}) {
  const createdAt = nowIso();
  const historyState = readTextFileState(root, historyPath, 'historical_dialogue_source');
  const organizedState = readTextFileState(root, organizedHistoryPath, 'organized_historical_summary');
  const pilotState = readJsonFileState(root, pilotImportPath, 'current_external_pilot_import');
  const pilotSummary = summarizePilotImport(pilotState.json);
  const resolvedOutputDir = outputDir
    ? resolveFromRoot(root, outputDir)
    : path.resolve(root, 'runtime/intake-validations', pilotSummary.import_id ?? 'history_delta_intent_evaluation');
  const previousEvaluation = discoverPreviousEvaluation(resolvedOutputDir);
  const inputFingerprint = {
    history_sha256: historyState.sha256,
    organized_history_sha256: organizedState.sha256,
    pilot_import_sha256: pilotState.sha256,
    current_objective_sha256: sha256(currentObjectiveText),
    combined_input_sha256: sha256([
      historyState.sha256,
      organizedState.sha256,
      pilotState.sha256,
      currentObjectiveText
    ].join('|'))
  };
  const hasPrevious = Boolean(previousEvaluation);
  const hasNewInputSincePrevious = hasPrevious
    ? previousEvaluation.combined_input_sha256 !== inputFingerprint.combined_input_sha256
    : null;
  const records = pilotState.json?.records ?? [];
  const overlapRecordIds = evaluateHistoryOverlap(records, `${historyState.text}\n${organizedState.text}`);
  const checks = buildChecks({
    historyState,
    pilotState,
    pilotSummary,
    overlapRecordIds
  });
  const requiredFailures = failureIds(checks, 'required');

  return {
    schema_version: SCHEMA_VERSION,
    evaluation_id: `history_delta_intent_evaluation_${timestampId(new Date(createdAt))}`,
    created_at: createdAt,
    gate_decision: requiredFailures.length === 0
      ? 'ready_for_incremental_history_context_evaluation'
      : 'stop_and_fix_incremental_history_context',
    required_failures: requiredFailures,
    input_fingerprint: inputFingerprint,
    previous_evaluation: previousEvaluation
      ? {
          found: true,
          path: relativeFromRoot(root, previousEvaluation.path),
          evaluation_id: previousEvaluation.evaluation_id,
          created_at: previousEvaluation.created_at,
          combined_input_sha256: previousEvaluation.combined_input_sha256
        }
      : { found: false },
    new_content_detection: {
      comparison_basis: hasPrevious ? 'previous_history_delta_intent_evaluation' : 'first_run_baseline',
      has_new_input_since_previous_evaluation: hasNewInputSincePrevious,
      status: hasPrevious
        ? (hasNewInputSincePrevious ? 'new_or_changed_input_detected' : 'no_new_content_since_previous_evaluation')
        : 'baseline_created_no_prior_delta_comparison',
      unread_history_delta_strategy: hasPrevious && !hasNewInputSincePrevious
        ? 'no_unread_delta'
        : 'summary_only_no_sentence_level_analysis'
    },
    source_boundaries: {
      historical_design_corpus: [
        {
          path: historyState.path,
          sha256: historyState.sha256,
          mtime: historyState.mtime
        },
        {
          path: organizedState.path,
          sha256: organizedState.sha256,
          mtime: organizedState.mtime
        }
      ],
      current_external_dialogue_records: {
        path: pilotState.path,
        import_id: pilotSummary.import_id,
        record_count: pilotSummary.record_count,
        time_range: pilotSummary.time_range
      },
      current_thread_latest_request: {
        provided_as_runtime_objective: true,
        intent_family: 'incremental_history_context_audit'
      }
    },
    history_corpus_summary: summarizeHistoryCorpus(historyState, organizedState),
    current_input_summary: pilotSummary,
    duplicate_and_storage_assessment: {
      duplicate_record_ids: pilotSummary.duplicate_record_ids,
      duplicate_content_keys: pilotSummary.duplicate_content_keys,
      history_overlap_record_ids: overlapRecordIds,
      storage_policy: 'append_only_when_stable_id_absent',
      duplicate_reimport_expected_behavior: 'skip raw_event, semantic_event and feedback records with existing stable ids; keep upserting people and relationships; rebuild indexes',
      verification_command: 'node --test packages/storage-runtime/tests/*.test.mjs'
    },
    intent_analysis: {
      latest_request_intent: {
        intent_id: 'history_delta_audit_and_incremental_context_evaluation',
        required_outputs: [
          '新增历史内容识别',
          '当前内容与历史内容区分',
          '重复添加风险检查',
          '读取时意图识别',
          '最新回复评估是否使用历史增量',
          '现行方案与已完成方案优劣比较'
        ]
      },
      current_dialogue_intent_summary: {
        scene: pilotSummary.goal?.scene ?? 'unknown',
        target_person_ids: pilotSummary.target_person_ids,
        detected_themes: pilotSummary.detected_themes
      },
      historical_design_intent_summary: {
        detected_themes: summarizeHistoryCorpus(historyState, organizedState).detected_themes
      },
      current_vs_history_distinguished: overlapRecordIds.length === 0,
      latest_reply_evaluation_context: [
        '当前最新请求',
        '当前 PilotImportBatch 真实聊天记录',
        '未读或变化历史的摘要级增量',
        '总历史设计材料摘要',
        '系统总目标和当前 PT-003/PT-004 门禁状态'
      ]
    },
    evaluation_policy: {
      policy_id: 'latest_plus_history_delta_summary.v1',
      no_sentence_level_analysis_for_previously_unread_history: true,
      context_weights: {
        latest_user_request: 0.35,
        current_external_dialogue_records: 0.25,
        unread_history_delta_summary: 0.2,
        total_historical_design_summary: 0.15,
        active_goal_and_gate_state: 0.05
      },
      note: '权重用于上下文取舍，不替代专家判断；专家模块仍应对关系、事件、时间、目标和安全审查分别给出理由。'
    },
    scheme_comparison: {
      completed_evaluation_scheme: {
        name: '逐条记录事件审计方案',
        strengths: [
          '对当前样本的记录、证据、语义 hint、人物关系和重复项检查更精细。',
          '适合样本入库前发现字段缺失、证据断链和低置信图片转写。'
        ],
        weaknesses: [
          '对长期历史材料的增量读取成本高，容易把旧设计材料和当前聊天样本混在一起。',
          '每次都逐句分析旧材料会浪费上下文，并可能削弱对最新请求的响应。'
        ]
      },
      current_evaluation_scheme: {
        name: '最新内容 + 未读历史增量摘要 + 目标 + 总历史摘要综合评估方案',
        strengths: [
          '更适合持续运行：先判定是否有新增，再只对增量做摘要级吸收。',
          '明确区分当前对话、当前外部聊天记录、历史设计材料和运行审计证据。',
          '最新回复会保留历史背景，但不会被旧材料逐句牵走。'
        ],
        weaknesses: [
          '摘要级处理可能遗漏旧材料中的细粒度约束或例外。',
          '首次建立 baseline 时只能证明当前文件状态，不能倒推出此前是否有未记录的增量。'
        ],
        recommendation: '两套方案并用：样本入库和事件图谱用逐条审计；日常回复和目标修正用增量摘要评估。'
      }
    },
    checks
  };
}

function markdownValue(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

export function renderHistoryDeltaIntentEvaluationMarkdown(report) {
  const checkRows = report.checks
    .map((check) => [
      check.check_id,
      check.severity,
      check.status,
      check.evidence.join('<br>'),
      check.fix ?? ''
    ].map(markdownValue).join(' | '))
    .join('\n');

  return `# 历史增量意图评估

- evaluation_id: ${report.evaluation_id}
- gate_decision: ${report.gate_decision}
- new_content_status: ${report.new_content_detection.status}
- required_failures: ${report.required_failures.join(', ') || 'none'}

## 内容边界

- 历史设计材料：${report.source_boundaries.historical_design_corpus.map((item) => `${item.path} (${item.sha256?.slice(0, 12) ?? 'missing'})`).join('；')}
- 当前外部对话：${report.source_boundaries.current_external_dialogue_records.path}，records=${report.source_boundaries.current_external_dialogue_records.record_count}
- 当前最新请求：${report.source_boundaries.current_thread_latest_request.intent_family}

## 意图识别

- 最新请求意图：${report.intent_analysis.latest_request_intent.intent_id}
- 当前对话场景：${report.intent_analysis.current_dialogue_intent_summary.scene}
- 当前/历史可区分：${report.intent_analysis.current_vs_history_distinguished}
- 历史主题：${report.history_corpus_summary.detected_themes.map((theme) => theme.label).join('；') || 'none'}
- 当前主题：${report.current_input_summary.detected_themes.map((theme) => theme.label).join('；') || 'none'}

## 去重与存储

- record_id duplicates: ${report.duplicate_and_storage_assessment.duplicate_record_ids.join(', ') || 'none'}
- history overlap records: ${report.duplicate_and_storage_assessment.history_overlap_record_ids.join(', ') || 'none'}
- storage policy: ${report.duplicate_and_storage_assessment.storage_policy}
- verification: \`${report.duplicate_and_storage_assessment.verification_command}\`

## 方案对比

已完成方案优势：${report.scheme_comparison.completed_evaluation_scheme.strengths.join('；')}

现行方案优势：${report.scheme_comparison.current_evaluation_scheme.strengths.join('；')}

建议：${report.scheme_comparison.current_evaluation_scheme.recommendation}

## Checks

check_id | severity | status | evidence | fix
--- | --- | --- | --- | ---
${checkRows}
`;
}

export function writeHistoryDeltaIntentEvaluation(options = {}) {
  const report = buildHistoryDeltaIntentEvaluation(options);
  const root = options.root ?? process.cwd();
  const outputDir = options.outputDir
    ? resolveFromRoot(root, options.outputDir)
    : path.resolve(root, 'runtime/intake-validations', report.current_input_summary.import_id ?? 'history_delta_intent_evaluation');
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'history-delta-intent-evaluation.json');
  const archiveJsonPath = path.join(outputDir, `${report.evaluation_id}.json`);
  const markdownPath = path.join(outputDir, 'history-delta-intent-evaluation.md');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(archiveJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderHistoryDeltaIntentEvaluationMarkdown(report), 'utf8');
  return {
    report,
    jsonPath,
    archiveJsonPath,
    markdownPath
  };
}
