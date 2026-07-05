import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeHistoryDeltaIntentEvaluation } from '../src/index.mjs';

function tempRoot() {
  const root = path.join(tmpdir(), `zhineng-history-delta-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  return root;
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('evaluates historical delta context and detects unchanged follow-up runs', () => {
  const root = tempRoot();
  try {
    writeFileSync(
      path.join(root, 'history.txt'),
      '目标导向对话需要维护工作记忆、识别意图，并把人际关系图谱和事件图谱作为长期背景。',
      'utf8'
    );
    writeFileSync(
      path.join(root, 'organized.md'),
      '# 历史摘要\n\n保留对话动作、状态追踪、检索优先级和工程 schema 对齐。',
      'utf8'
    );
    writeJson(path.join(root, 'pilot.json'), {
      import_id: 'pilot_history_delta_test',
      goal: {
        initial_goal: '验证当前记录与历史材料可区分。',
        scene: 'social_life_wechat_follow_up',
        primary_person_id: 'person_test',
        target_person_ids: ['person_test']
      },
      people: [
        { person_id: 'user_self', display_name: 'User' },
        { person_id: 'person_test', display_name: 'Test Person' }
      ],
      relationships: [
        {
          relationship_id: 'rel_user_test',
          from_person_id: 'user_self',
          to_person_id: 'person_test',
          type_code: 'friend'
        }
      ],
      records: [
        {
          record_id: 'chat_001',
          occurred_at: '2026-06-15T12:00:00+08:00',
          source: 'wechat_screenshot_manual_transcription',
          channel: 'wechat_desktop',
          speaker_person_id: 'user_self',
          direction: 'outbound',
          content_type: 'text',
          content: '点了，还没到。',
          target_person_ids: ['person_test'],
          linked_relationship_ids: ['rel_user_test']
        }
      ],
      feedback_records: []
    });

    const first = writeHistoryDeltaIntentEvaluation({
      root,
      historyPath: 'history.txt',
      organizedHistoryPath: 'organized.md',
      pilotImportPath: 'pilot.json',
      outputDir: 'out',
      currentObjectiveText: '检查历史增量和当前记录边界。'
    });
    const second = writeHistoryDeltaIntentEvaluation({
      root,
      historyPath: 'history.txt',
      organizedHistoryPath: 'organized.md',
      pilotImportPath: 'pilot.json',
      outputDir: 'out',
      currentObjectiveText: '检查历史增量和当前记录边界。'
    });

    assert.equal(first.report.new_content_detection.status, 'baseline_created_no_prior_delta_comparison');
    assert.equal(second.report.previous_evaluation.found, true);
    assert.equal(second.report.new_content_detection.status, 'no_new_content_since_previous_evaluation');
    assert.equal(second.report.intent_analysis.current_vs_history_distinguished, true);
    assert.deepEqual(second.report.required_failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
