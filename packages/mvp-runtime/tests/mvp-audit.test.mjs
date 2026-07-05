import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  auditMvpCompletionEvidence,
  writeMvpCompletionAudit
} from '../src/index.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-mvp-audit-'));
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function buildCompleteStatus() {
  const nodeCounts = Object.fromEntries([
    'user_goal',
    'relationship_context',
    'event_recording',
    'decision_recommendation',
    'trigger_plan',
    'feedback',
    'writeback',
    'index_rebuild',
    'audit'
  ].map((nodeId) => [nodeId, 1]));

  return {
    status: 'completed',
    current_run_id: null,
    node_counts: nodeCounts,
    last_run: {
      run_id: 'run_audit_test',
      status: 'completed',
      output_summary: {
        workflow: 'mvp_loop_from_pilot_import',
        run_id: 'run_audit_test',
        decision_id: 'decision_test',
        trigger_id: 'trigger_test',
        feedback_id: 'feedback_test',
        automation_preview_id: 'preview_test',
        automation_trial_id: 'trial_test',
        platform_dry_run_connector_check_id: 'platform_check_test',
        platform_dry_run_connector_status: 'preview_contract_passed_blocked_before_send',
        import_summary: {
          ready_for_mvp_sample: true,
          semantic_coverage: 0.9
        },
        intake_readiness: {
          schema_version: 'pilot_intake_readiness.v1',
          gate_decision: 'continue_to_mvp_closed_loop',
          ready_for_closed_loop_mvp: true,
          required_failures: []
        },
        agent_opinions: [
          'goal_agent',
          'relationship_agent',
          'event_agent',
          'norm_agent',
          'option_agent',
          'skill_agent',
          'roi_agent',
          'evidence_agent',
          'feedback_agent'
        ],
        message_draft: {
          channel: 'wechat',
          draft: 'test draft',
          must_confirm_before_send: true
        },
        manual_execution_checklist: [
          { item_id: 'review_message_draft' },
          { item_id: 'preview_platform_before_send' },
          { item_id: 'record_feedback_after_action' }
        ],
        quality: {
          closed_loop_complete: true,
          feedback_complete: true,
          writeback_complete: true,
          index_rebuild_complete: true,
          audit_complete: true,
          intake_readiness_complete: true,
          automation_preview_complete: true,
          platform_dry_run_connector_complete: true,
          real_execution_allowed: false,
          real_user_review_complete: true,
          real_user_realism_score: 1,
          optimization_result_complete: true
        },
        real_user_review: {
          review_id: 'real_user_review_test',
          reviewer_persona: '真实B2B跟进用户',
          total_goal: '让系统从用户目标、人物关系和事件证据出发，给出可执行、可回写、可审计的社交辅助建议。',
          app_scene: '客户跟进、预约评审、风险澄清和低承诺推进',
          realism_score: 1,
          conclusion: 'usable_with_minor_optimization',
          checks: [
            'goal_clarity',
            'relationship_context',
            'event_evidence',
            'decision_realism',
            'trigger_safety',
            'feedback_observability'
          ].map((check_id) => ({
            check_id,
            status: 'pass',
            evidence: [`${check_id}=ok`],
            real_user_feedback: '真实用户反馈',
            optimization_hint: '优化提示'
          })),
          feedback_summary: ['可以进入真实用户试点。'],
          optimization_focus: ['保持证据、确认闸门和反馈入口同屏。']
        },
        optimization_result: {
          optimization_id: 'mvp_optimization_test',
          optimized_user_next_step: 'confirm next step',
          applied_changes: [
            { change_id: 'show_evidence_before_action', status: 'applied_to_output', reason: 'reason' },
            { change_id: 'keep_confirmation_gate', status: 'applied_to_output', reason: 'reason' },
            { change_id: 'compress_feedback_form', status: 'applied_to_output', reason: 'reason' },
            { change_id: 'writeback_after_feedback_only', status: 'applied_to_output', reason: 'reason' }
          ],
          next_iteration_inputs: ['目标', '事件', '反馈', '评分'],
          stop_or_adjust_when: ['关系阶段错误', '证据不足', '超过 1 小时']
        },
        user_test_review: {
          gate_decision: 'adjust'
        },
        second_pass_optimization: {
          optimization_id: 'second_pass_test'
        }
      }
    }
  };
}

function buildProcessTree() {
  return {
    canonical_flow: [
      'user_goal',
      'relationship_context',
      'event_recording',
      'decision_recommendation',
      'trigger_plan',
      'platform_snapshot_validation',
      'feedback',
      'writeback',
      'index_rebuild',
      'audit'
    ],
    issue_register: [
      {
        issue_id: 'PT-003',
        node_id: 'event_recording',
        status: 'in_progress',
        title: 'sample volume',
        next_action: 'replace sample'
      },
      {
        issue_id: 'PT-004',
        node_id: 'trigger_plan',
        status: 'in_progress',
        title: 'dry-run connector',
        next_action: 'verify platform preview'
      },
      {
        issue_id: 'PT-011',
        node_id: 'decision_recommendation',
        status: 'closed',
        title: 'message draft'
      },
      {
        issue_id: 'PT-012',
        node_id: 'audit',
        status: 'closed',
        title: 'completion audit'
      }
    ]
  };
}

function writeReport(root) {
  const reportDir = path.join(root, 'runtime/mvp-reports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'report.html');
  writeFileSync(reportPath, [
    '<main data-report-contract="mvp_run_report.v1" data-user-feedback-contract="mvp_user_feedback.v1">',
    '<section>可执行草稿</section>',
    '<section>人工确认清单</section>',
    '<section>总目标</section>',
    '<section>应用场景</section>',
    '<section>专项测试反馈</section>',
    '<section>二次优化</section>',
    '</main>'
  ].join('\n'), 'utf8');
  return reportPath;
}

test('audits current MVP completion evidence from state, process tree and report', () => {
  const root = tempRoot();
  try {
    writeJson(path.join(root, 'runtime/state/current-status.json'), buildCompleteStatus());
    writeJson(path.join(root, 'examples/system-process-tree.json'), buildProcessTree());
    writeReport(root);

    const audit = auditMvpCompletionEvidence({ root });

    assert.equal(audit.schema_version, 'mvp_completion_audit.v1');
    assert.equal(audit.overall_status, 'pilot_mvp_evidence_complete_with_open_expansion_items');
    assert.equal(audit.ready_for_user_special_testing, true);
    assert.equal(audit.ready_to_expand_sample_or_real_connector, false);
    assert.deepEqual(audit.required_failures, []);
    assert.deepEqual(audit.warning_failures, []);
    assert.deepEqual(audit.open_expansion_items.map((issue) => issue.issue_id), ['PT-003', 'PT-004']);
    assert.ok(audit.checks.some((check) => check.check_id === 'decision_has_message_draft' && check.passed));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writes externally readable MVP completion audit artifacts', () => {
  const root = tempRoot();
  try {
    writeJson(path.join(root, 'runtime/state/current-status.json'), buildCompleteStatus());
    writeJson(path.join(root, 'examples/system-process-tree.json'), buildProcessTree());
    writeReport(root);

    const audit = auditMvpCompletionEvidence({ root });
    const written = writeMvpCompletionAudit({
      audit,
      outputDir: path.join(root, 'runtime/audits')
    });

    assert.equal(written.contract, 'mvp_completion_audit.v1');
    assert.ok(existsSync(written.json_path));
    assert.ok(existsSync(written.markdown_path));
    const saved = JSON.parse(readFileSync(written.json_path, 'utf8'));
    assert.equal(saved.audit_id, audit.audit_id);
    const markdown = readFileSync(written.markdown_path, 'utf8');
    assert.ok(markdown.includes('MVP Completion Audit'));
    assert.ok(markdown.includes('decision_has_message_draft'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
