import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  parseTheoryBacktestMarkdown,
  runGoalOrientedInteractionBacktest,
  writeGoalOrientedInteractionBacktest
} from '../src/index.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-goal-backtest-'));
}

test('parses theory backtest markdown into three scenarios and twelve turns', () => {
  const markdown = readFileSync(path.resolve('tupu/05-三类真实事件逐轮回测结果.md'), 'utf8');
  const scenarios = parseTheoryBacktestMarkdown(markdown);

  assert.equal(scenarios.length, 3);
  assert.deepEqual(
    scenarios.map((scenario) => scenario.turns.length),
    [4, 4, 4]
  );
  assert.equal(scenarios[0].turns[0].theory_context.daily_topic_summary, '今日围绕方案是否值得进入技术评审，对方先抛出预算顾虑。');
  assert.equal(scenarios[1].turns[1].theory_context.dynamic_strategy, 'reframe + document_and_confirm：承认协助义务，守住确认权责。');
  assert.equal(scenarios[2].turns[2].writeback['事件候选'], 'boundary.borrow_refusal_with_support');
  assert.ok(scenarios.every((scenario) => Object.keys(scenario.storage_tags).length >= 5));
});

test('runs goal-oriented code backtest and matches theory signatures', () => {
  const backtest = runGoalOrientedInteractionBacktest({
    root: path.resolve('.'),
    theoryMarkdownPath: path.resolve('tupu/05-三类真实事件逐轮回测结果.md')
  });

  assert.equal(backtest.schema_version, 'goal_oriented_interaction_backtest.v1');
  assert.equal(backtest.gate_decision, 'goal_oriented_backtest_passed');
  assert.deepEqual(backtest.hard_exit_signals, []);
  assert.equal(backtest.metrics.scenario_count, 3);
  assert.equal(backtest.metrics.turn_count, 12);
  assert.equal(backtest.metrics.required_theory_context_completion_rate, 1);
  assert.equal(backtest.metrics.full_code_context_completion_rate, 1);
  assert.equal(backtest.metrics.theory_code_match_rate, 1);
  assert.equal(backtest.metrics.strategy_evolution_rate, 1);
  assert.equal(backtest.metrics.message_draft_completion_rate, 1);
  assert.equal(backtest.metrics.writeback_completion_rate, 1);
  assert.equal(backtest.source.theory_signature_hash, backtest.source.code_signature_hash);

  for (const scenario of backtest.scenarios) {
    assert.equal(scenario.strategy_evolved, true);
    for (const turn of scenario.turns) {
      assert.ok(turn.code_context_snapshot.role_and_power_context);
      assert.ok(turn.code_context_snapshot.risk_boundary_state);
      assert.ok(turn.code_context_snapshot.evidence_state);
      assert.ok(turn.code_context_snapshot.retrieved_memory_refs.length >= 3);
      assert.equal(turn.decision.manual_confirmation_required, true);
      assert.ok(turn.decision.message_draft.length > 20);
      assert.ok(turn.code_context_snapshot.writeback_plan.event_candidate);
    }
  }
});

test('writes goal-oriented backtest artifacts and optional tupu summary', () => {
  const root = tempRoot();
  try {
    const backtest = runGoalOrientedInteractionBacktest({
      root: path.resolve('.'),
      theoryMarkdownPath: path.resolve('tupu/05-三类真实事件逐轮回测结果.md')
    });
    const outputDir = path.join(root, 'runtime/goal-oriented-backtests', backtest.backtest_id);
    const tupuSummaryPath = path.join(root, 'tupu/07-理论与代码工程回测一致性结果.md');
    const written = writeGoalOrientedInteractionBacktest({
      backtest,
      outputDir,
      tupuSummaryPath
    });

    assert.ok(existsSync(written.json_path));
    assert.ok(existsSync(written.markdown_path));
    assert.ok(existsSync(written.tupu_summary_path));
    const markdown = readFileSync(written.markdown_path, 'utf8');
    assert.ok(markdown.includes('# 目标导向人际交互代码工程回测'));
    assert.ok(markdown.includes('gate_decision: goal_oriented_backtest_passed'));
    assert.ok(!markdown.includes('<script'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
