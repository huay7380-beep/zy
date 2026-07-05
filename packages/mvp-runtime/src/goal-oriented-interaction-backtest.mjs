import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const requiredTheoryContextKeys = [
  'daily_topic_summary',
  'historical_relationship_stage',
  'current_chat_focus',
  'counterpart_focus',
  'counterpart_emotion',
  'target_object_goal',
  'dynamic_strategy'
];

const fullCodeContextKeys = [
  ...requiredTheoryContextKeys,
  'role_and_power_context',
  'risk_boundary_state',
  'evidence_state',
  'open_commitments',
  'conversation_momentum',
  'retrieved_memory_refs',
  'context_sufficiency_score',
  'next_best_action',
  'writeback_plan'
];

function projectRoot() {
  return path.resolve(here, '../../..');
}

function nowIso() {
  return new Date().toISOString();
}

function createBacktestId(date = new Date()) {
  return `goal_oriented_backtest_${date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function relativeOrNull(root, filePath) {
  if (!filePath) return null;
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function hashJson(value) {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function stripInlineCode(value) {
  return String(value ?? '')
    .replaceAll('`', '')
    .trim();
}

function stripMarkdownValue(value) {
  return stripInlineCode(value)
    .replace(/^候选，?/, '')
    .trim();
}

function splitMarkdownRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function parseMarkdownTable(block) {
  const rows = {};
  for (const line of block.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    if (/^\|\s*-+/.test(line)) continue;
    const [key, value] = splitMarkdownRow(line);
    if (!key || key === '模块' || key === '项目' || key === '字段') continue;
    rows[stripInlineCode(key)] = stripMarkdownValue(value);
  }
  return rows;
}

function sectionBetween(text, startPattern, endPattern) {
  const start = text.search(startPattern);
  if (start < 0) return '';
  const afterStart = text.slice(start).replace(startPattern, '');
  const end = afterStart.search(endPattern);
  return end < 0 ? afterStart : afterStart.slice(0, end);
}

function cleanBlockquote(block) {
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.startsWith('>') ? line.slice(1).trim() : line)
    .join('\n')
    .trim();
}

function parseStorageTags(section) {
  const marker = section.indexOf('存储标签：');
  if (marker < 0) return {};
  const rest = section.slice(marker);
  const match = rest.match(/```text\s*([\s\S]*?)```/);
  if (!match) return {};
  const tags = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('=')) continue;
    const [key, value] = trimmed.split('=');
    tags[key.trim()] = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return tags;
}

function scenarioIdFromTitle(title) {
  if (title.includes('B2B')) return 'b2b_customer_pilot_meeting';
  if (title.includes('项目延期') || title.includes('责任边界')) return 'project_liability_boundary';
  if (title.includes('借钱')) return 'private_borrow_pressure';
  return title
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '_')
    .replace(/^_+|_+$/g, '') || 'scenario';
}

function extractStrategyCodes(value) {
  const text = String(value ?? '');
  const codeMatches = [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  if (codeMatches.length) return codeMatches;
  return text
    .split(/[：:+，,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function inferMomentum(strategyCodes, round) {
  const joined = strategyCodes.join(',');
  if (/document|confirm|commitment/.test(joined)) return round >= 4 ? 'confirmed_or_closing' : 'commitment_window';
  if (/boundary|evidence|deescalate|safety/.test(joined)) return 'risk_control';
  if (/value|clarify|acknowledge/.test(joined)) return 'exploring_and_shaping';
  return 'active';
}

function clampScore(value) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function makeContextSnapshot({ scenario, turn, previousTurns }) {
  const strategyCodes = extractStrategyCodes(turn.theory_context.dynamic_strategy);
  const theoryComplete = requiredTheoryContextKeys.every((key) => turn.theory_context[key]);
  const roundScore = theoryComplete ? 0.7 + (turn.round * 0.06) : 0.45;
  const role = scenario.setting['使用者角色'] ?? 'unknown_user_role';
  const target = scenario.setting['目标对象'] ?? scenario.title;
  const relationship = scenario.setting['当前关系'] ?? 'unknown_relationship';
  const riskSource = turn.writeback['风险标签'] ?? turn.writeback['风险'] ?? scenario.setting['硬约束'] ?? 'none';
  const openCommitments = turn.writeback['开放事项'] ?? turn.writeback['下一轮观察'] ?? scenario.setting['最小成功'] ?? 'none';

  return {
    ...turn.theory_context,
    role_and_power_context: `${role} -> ${target}；${relationship}`,
    risk_boundary_state: riskSource,
    evidence_state: {
      fact: turn.counterpart_message,
      event_candidate: turn.writeback['事件候选'] ?? null,
      evidence_confidence: 'theory_backtest_structured_case'
    },
    open_commitments: openCommitments,
    conversation_momentum: inferMomentum(strategyCodes, turn.round),
    retrieved_memory_refs: [
      `${scenario.scenario_id}:target_profile`,
      `${scenario.scenario_id}:relationship_stage`,
      `${scenario.scenario_id}:turns_1_${turn.round}`,
      ...(previousTurns.length ? [`${scenario.scenario_id}:previous_strategy_${previousTurns.at(-1).round}`] : [])
    ],
    context_sufficiency_score: clampScore(roundScore),
    next_best_action: `执行 ${strategyCodes.join('+') || 'current_strategy'}，并使用推荐话术推进本轮目标。`,
    writeback_plan: {
      event_candidate: turn.writeback['事件候选'] ?? null,
      metric_effect: turn.writeback['指标变化'] ?? turn.writeback['关系指标'] ?? null,
      next_observation: turn.writeback['下一轮观察'] ?? turn.writeback['下一轮策略'] ?? null,
      result: turn.writeback['结果'] ?? null
    }
  };
}

function makeDecision(turn) {
  const strategyCodes = extractStrategyCodes(turn.theory_context.dynamic_strategy);
  return {
    action_type: 'message_draft',
    dialogue_act_codes: strategyCodes,
    message_draft: turn.message_draft,
    manual_confirmation_required: true,
    expected_event: turn.writeback['事件候选'] ?? null,
    expected_effect: turn.writeback['指标变化'] ?? turn.writeback['关系指标'] ?? null
  };
}

function makeStrategyState(turn, previousTurn) {
  const strategyCodes = extractStrategyCodes(turn.theory_context.dynamic_strategy);
  const previousCodes = previousTurn
    ? extractStrategyCodes(previousTurn.theory_context.dynamic_strategy)
    : [];
  return {
    current_strategy: strategyCodes,
    previous_strategy: previousCodes,
    changed_from_previous: previousTurn
      ? strategyCodes.join('|') !== previousCodes.join('|')
      : true,
    transition_reason: turn.theory_context.current_chat_focus,
    target_object_goal: turn.theory_context.target_object_goal
  };
}

export function parseTheoryBacktestMarkdown(markdown) {
  const scenarioMatches = [...markdown.matchAll(/^##\s+\d+\.\s+回测[一二三]：(.+)$/gm)];
  return scenarioMatches.map((match, index) => {
    const title = match[1].trim();
    const start = match.index;
    const end = scenarioMatches[index + 1]?.index ?? markdown.length;
    const section = markdown.slice(start, end);
    const settingBlock = sectionBetween(section, /###\s+\d+\.\d+\s+场景设定\s*/, /###\s+\d+\.\d+\s+逐轮回测/);
    const setting = parseMarkdownTable(settingBlock);
    const roundMatches = [...section.matchAll(/^####\s+Round\s+(\d+)/gm)];
    const turns = roundMatches.map((roundMatch, roundIndex) => {
      const roundStart = roundMatch.index;
      const roundEnd = roundMatches[roundIndex + 1]?.index
        ?? section.search(/^###\s+\d+\.\d+\s+回测结论/m);
      const roundSection = section.slice(roundStart, roundEnd < 0 ? section.length : roundEnd);
      const messageBlock = sectionBetween(roundSection, /对方消息：\s*/, /上下文分析：/);
      const contextBlock = sectionBetween(roundSection, /上下文分析：\s*/, /推荐话术：/);
      const draftBlock = sectionBetween(roundSection, /推荐话术：\s*/, /事件与回写：/);
      const writebackBlock = sectionBetween(roundSection, /事件与回写：\s*/, /(?:####\s+Round|###\s+\d+\.\d+\s+回测结论|$)/);
      return {
        round: Number(roundMatch[1]),
        counterpart_message: cleanBlockquote(messageBlock),
        theory_context: parseMarkdownTable(contextBlock),
        message_draft: cleanBlockquote(draftBlock),
        writeback: parseMarkdownTable(writebackBlock)
      };
    });
    return {
      scenario_id: scenarioIdFromTitle(title),
      title,
      setting,
      storage_tags: parseStorageTags(section),
      turns
    };
  });
}

function signatureFromScenarios(scenarios, source = 'theory') {
  return scenarios.map((scenario) => ({
    scenario_id: scenario.scenario_id,
    title: scenario.title,
    turns: scenario.turns.map((turn) => {
      const context = source === 'code' ? turn.code_context_snapshot : turn.theory_context;
      return {
        round: turn.round,
        daily_topic_summary: context.daily_topic_summary,
        dynamic_strategy: context.dynamic_strategy,
        target_object_goal: context.target_object_goal
      };
    })
  }));
}

function makeCheck({ check_id, label, passed, evidence, severity = 'required', fix = null }) {
  return {
    check_id,
    label,
    severity,
    status: passed ? 'pass' : 'fail',
    passed,
    evidence,
    fix
  };
}

function completionRate(items, predicate) {
  if (!items.length) return 0;
  return items.filter(predicate).length / items.length;
}

function buildHardExitSignals(checks) {
  return checks
    .filter((check) => check.severity === 'required' && !check.passed)
    .map((check) => check.check_id);
}

function renderScenarioRows(scenarios) {
  return scenarios.map((scenario) => {
    const strategyPath = scenario.turns
      .map((turn) => turn.strategy_state.current_strategy.join('+'))
      .join(' -> ');
    return `| ${scenario.title} | ${scenario.turns.length} | ${scenario.strategy_evolved} | ${strategyPath} | ${scenario.result} |`;
  }).join('\n');
}

function renderTurnRows(scenario) {
  return scenario.turns.map((turn) => `| ${turn.round} | ${turn.theory_context.daily_topic_summary} | ${turn.theory_context.dynamic_strategy} | ${turn.decision.message_draft} | ${turn.writeback['事件候选'] ?? ''} |`)
    .join('\n');
}

export function renderGoalOrientedInteractionBacktestMarkdown(backtest) {
  const checks = backtest.alignment.checks
    .map((check) => `| ${check.check_id} | ${check.severity} | ${check.status} | ${check.evidence.join('<br>')} |`)
    .join('\n');
  const hardExits = backtest.hard_exit_signals.length
    ? backtest.hard_exit_signals.map((item) => `- ${item}`).join('\n')
    : '- none';
  const scenarioDetails = backtest.scenarios.map((scenario) => `## ${scenario.title}

| round | daily_topic_summary | dynamic_strategy | message_draft | event_candidate |
| --- | --- | --- | --- | --- |
${renderTurnRows(scenario)}

Storage tags:

\`\`\`json
${JSON.stringify(scenario.storage_tags, null, 2)}
\`\`\`
`).join('\n');

  return `# 目标导向人际交互代码工程回测

- backtest_id: ${backtest.backtest_id}
- created_at: ${backtest.created_at}
- gate_decision: ${backtest.gate_decision}
- theory_markdown_path: ${backtest.source.theory_markdown_path}
- theory_signature_hash: ${backtest.source.theory_signature_hash}
- code_signature_hash: ${backtest.source.code_signature_hash}

## Metrics

\`\`\`json
${JSON.stringify(backtest.metrics, null, 2)}
\`\`\`

## Hard Exit Signals

${hardExits}

## Scenario Summary

| scenario | turns | strategy_evolved | strategy_path | result |
| --- | ---: | --- | --- | --- |
${renderScenarioRows(backtest.scenarios)}

## Alignment Checks

| check_id | severity | status | evidence |
| --- | --- | --- | --- |
${checks}

${scenarioDetails}
`;
}

export function runGoalOrientedInteractionBacktest({
  root = projectRoot(),
  theoryMarkdownPath = path.join(root, 'tupu/05-三类真实事件逐轮回测结果.md')
} = {}) {
  if (!existsSync(theoryMarkdownPath)) {
    throw new Error(`Theory backtest markdown not found: ${theoryMarkdownPath}`);
  }
  const createdAt = nowIso();
  const backtestId = createBacktestId(new Date(createdAt));
  const markdown = readFileSync(theoryMarkdownPath, 'utf8');
  const parsedScenarios = parseTheoryBacktestMarkdown(markdown);
  const scenarios = parsedScenarios.map((scenario) => {
    const turns = scenario.turns.map((turn, index) => {
      const previousTurn = scenario.turns[index - 1] ?? null;
      const previousTurns = scenario.turns.slice(0, index);
      const codeContextSnapshot = makeContextSnapshot({ scenario, turn, previousTurns });
      return {
        ...turn,
        code_context_snapshot: codeContextSnapshot,
        strategy_state: makeStrategyState(turn, previousTurn),
        decision: makeDecision(turn)
      };
    });
    const uniqueStrategies = new Set(turns.map((turn) => turn.strategy_state.current_strategy.join('|')));
    return {
      ...scenario,
      turns,
      strategy_evolved: uniqueStrategies.size > 1,
      result: turns.at(-1)?.writeback?.['结果'] ?? 'not_marked'
    };
  });

  const allTurns = scenarios.flatMap((scenario) => scenario.turns);
  const theorySignature = signatureFromScenarios(parsedScenarios, 'theory');
  const codeSignature = signatureFromScenarios(scenarios, 'code');
  const theorySignatureHash = hashJson(theorySignature);
  const codeSignatureHash = hashJson(codeSignature);
  const requiredTheoryContextCompletionRate = completionRate(
    allTurns,
    (turn) => requiredTheoryContextKeys.every((key) => Boolean(turn.theory_context[key]))
  );
  const fullCodeContextCompletionRate = completionRate(
    allTurns,
    (turn) => fullCodeContextKeys.every((key) => turn.code_context_snapshot[key] !== undefined && turn.code_context_snapshot[key] !== '')
  );
  const messageDraftCompletionRate = completionRate(
    allTurns,
    (turn) => Boolean(turn.decision.message_draft)
      && turn.decision.manual_confirmation_required === true
  );
  const writebackCompletionRate = completionRate(
    allTurns,
    (turn) => Boolean(turn.writeback['事件候选'])
      && Boolean(turn.code_context_snapshot.writeback_plan)
  );
  const strategyEvolutionRate = completionRate(scenarios, (scenario) => scenario.strategy_evolved);
  const theoryCodeMatchRate = theorySignatureHash === codeSignatureHash ? 1 : 0;

  const checks = [
    makeCheck({
      check_id: 'scenario_count_is_three',
      label: '理论回测包含三类不同事件场景',
      passed: scenarios.length === 3,
      evidence: [`scenario_count=${scenarios.length}`],
      fix: '在 tupu/05 中补齐三类回测场景。'
    }),
    makeCheck({
      check_id: 'turn_count_is_twelve',
      label: '三类回测共包含十二轮逐轮对话',
      passed: allTurns.length === 12,
      evidence: [`turn_count=${allTurns.length}`],
      fix: '每类场景至少保留四轮 Round。'
    }),
    makeCheck({
      check_id: 'required_theory_context_complete',
      label: '理论回测每轮包含用户要求的上下文核心字段',
      passed: requiredTheoryContextCompletionRate === 1,
      evidence: [`rate=${requiredTheoryContextCompletionRate}`],
      fix: `补齐字段：${requiredTheoryContextKeys.join(', ')}`
    }),
    makeCheck({
      check_id: 'full_code_context_complete',
      label: '代码工程回测补齐完整上下文快照字段',
      passed: fullCodeContextCompletionRate === 1,
      evidence: [`rate=${fullCodeContextCompletionRate}`, `keys=${fullCodeContextKeys.join(',')}`],
      fix: '补齐代码层 ContextSnapshot 派生字段。'
    }),
    makeCheck({
      check_id: 'theory_code_signature_match',
      label: '理论回测和代码工程回测核心字段签名一致',
      passed: theoryCodeMatchRate === 1,
      evidence: [
        `theory=${theorySignatureHash}`,
        `code=${codeSignatureHash}`
      ],
      fix: '修正代码解析或理论回测中的 daily_topic_summary、dynamic_strategy、target_object_goal。'
    }),
    makeCheck({
      check_id: 'strategy_evolves_per_scenario',
      label: '每类场景的策略会随对话逐轮演化',
      passed: strategyEvolutionRate === 1,
      evidence: [`rate=${strategyEvolutionRate}`],
      fix: '为每个场景补充至少两个不同动态策略。'
    }),
    makeCheck({
      check_id: 'message_draft_complete',
      label: '每轮都有可人工确认的具体话术',
      passed: messageDraftCompletionRate === 1,
      evidence: [`rate=${messageDraftCompletionRate}`],
      fix: '补齐每轮推荐话术。'
    }),
    makeCheck({
      check_id: 'writeback_complete',
      label: '每轮都有事件候选和回写计划',
      passed: writebackCompletionRate === 1,
      evidence: [`rate=${writebackCompletionRate}`],
      fix: '补齐每轮事件与回写表。'
    }),
    makeCheck({
      check_id: 'storage_tags_present',
      label: '每类回测都有目标对象、关系、线程和标签索引',
      passed: scenarios.every((scenario) => Object.keys(scenario.storage_tags).length >= 5),
      evidence: scenarios.map((scenario) => `${scenario.scenario_id}=${Object.keys(scenario.storage_tags).join(',')}`),
      fix: '在每个场景结论中补齐存储标签代码块。'
    })
  ];
  const hardExitSignals = buildHardExitSignals(checks);

  return {
    schema_version: 'goal_oriented_interaction_backtest.v1',
    backtest_id: backtestId,
    created_at: createdAt,
    gate_decision: hardExitSignals.length
      ? 'goal_oriented_backtest_failed'
      : 'goal_oriented_backtest_passed',
    source: {
      theory_markdown_path: relativeOrNull(root, theoryMarkdownPath),
      theory_signature_hash: theorySignatureHash,
      code_signature_hash: codeSignatureHash,
      theory_signature: theorySignature,
      code_signature: codeSignature
    },
    metrics: {
      scenario_count: scenarios.length,
      turn_count: allTurns.length,
      required_theory_context_completion_rate: requiredTheoryContextCompletionRate,
      full_code_context_completion_rate: fullCodeContextCompletionRate,
      theory_code_match_rate: theoryCodeMatchRate,
      strategy_evolution_rate: strategyEvolutionRate,
      message_draft_completion_rate: messageDraftCompletionRate,
      writeback_completion_rate: writebackCompletionRate
    },
    alignment: {
      checks
    },
    hard_exit_signals: hardExitSignals,
    continue_when: [
      'gate_decision=goal_oriented_backtest_passed',
      'theory_code_match_rate=1',
      'full_code_context_completion_rate=1',
      'strategy_evolution_rate=1',
      'message_draft_completion_rate=1',
      'writeback_completion_rate=1'
    ],
    stop_or_adjust_when: [
      '理论回测场景或轮次数少于要求',
      '理论字段和代码字段签名不一致',
      '逐轮上下文缺少目标、当日主题、历史阶段、当前焦点、对方侧重、情绪或动态策略',
      '代码层无法生成完整上下文快照、话术或回写计划'
    ],
    scenarios
  };
}

export function writeGoalOrientedInteractionBacktest({
  backtest,
  outputDir = path.join(projectRoot(), 'runtime/goal-oriented-backtests', backtest?.backtest_id ?? createBacktestId()),
  tupuSummaryPath = null
} = {}) {
  if (!backtest) throw new Error('writeGoalOrientedInteractionBacktest requires backtest');
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'goal-oriented-interaction-backtest.json');
  const markdownPath = path.join(outputDir, 'goal-oriented-interaction-backtest.md');
  const markdown = renderGoalOrientedInteractionBacktestMarkdown(backtest);
  writeFileSync(jsonPath, `${JSON.stringify(backtest, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, markdown, 'utf8');
  if (tupuSummaryPath) {
    mkdirSync(path.dirname(tupuSummaryPath), { recursive: true });
    writeFileSync(tupuSummaryPath, markdown, 'utf8');
  }
  return {
    json_path: jsonPath,
    markdown_path: markdownPath,
    tupu_summary_path: tupuSummaryPath
  };
}
