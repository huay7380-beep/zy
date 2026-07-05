import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildReadOnlyDuplicateObservationConfirmation,
  buildReadOnlyDuplicateObservationReview,
  buildReadOnlyExpansionStatus,
  writeReadOnlyDuplicateObservationConfirmation,
  writeReadOnlyDuplicateObservationReview,
  writeReadOnlyExpansionStatus
} from '../src/index.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-read-only-status-'));
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeKit(root, { adapterId, sourceType, platform }) {
  writeJson(
    path.join(root, 'runtime/source-adapter-kits', `kit_${adapterId.replaceAll('.', '_')}`, 'source-adapter-init-kit.json'),
    {
      kit_id: `kit_${adapterId}`,
      adapter_id: adapterId,
      source_type: sourceType,
      platform,
      can_send_requested: false,
      safety_defaults: {
        real_execution_default: false,
        observation_real_execution_allowed: false
      },
      validation_command: 'npm run intake:adapter:validate'
    }
  );
}

test('summarizes read-only expansion without treating templates as complete real samples', () => {
  const root = tempRoot();
  try {
    const pilotPath = path.join(root, 'runtime/user-inputs/pilot-import.real.json');
    mkdirSync(path.dirname(pilotPath), { recursive: true });
    copyFileSync(path.resolve('examples/pilot-import-batch.sample.json'), pilotPath);

    const observationPath = path.join(root, 'runtime/desktop-inbox-real/sample/intake-observation.real.json');
    mkdirSync(path.dirname(observationPath), { recursive: true });
    copyFileSync(path.resolve('examples/intake-observation.sightflow.sample.json'), observationPath);

    const generatedDir = path.join(root, 'runtime/desktop-context-bridges/generated');
    mkdirSync(generatedDir, { recursive: true });
    copyFileSync(path.resolve('examples/pilot-import-batch.sample.json'), path.join(generatedDir, 'pilot-import.generated.json'));
    writeJson(path.join(generatedDir, 'read-only-expansion-graph-loop-verification.json'), {
      gate_decision: 'read_only_expansion_graph_loop_verified',
      required_failures: [],
      real_execution_allowed: false,
      real_send_attempted: false,
      read_only_expansion: {
        pilot_import: {
          ready_for_closed_loop_mvp: true
        }
      },
      graph_closed_loop: {
        quality: {
          closed_loop_complete: true
        },
        path: {
          expert_weight_judgment: {
            completed_expert_count: 5
          },
          feedback_writeback: {
            writeback_complete: true
          }
        }
      }
    });

    writeKit(root, { adapterId: 'browser_dom.next', sourceType: 'browser', platform: 'web' });
    writeKit(root, { adapterId: 'external_chat_export.next', sourceType: 'file', platform: 'external_chat_export' });
    writeKit(root, { adapterId: 'business_api.next', sourceType: 'api', platform: 'business_system' });
    writeJson(path.join(root, 'runtime/source-adapter-conformance/browser/source-adapter-conformance.json'), {
      validation_id: 'source_adapter_conformance_browser_test',
      adapter_id: 'browser_dom.sample',
      source_type: 'browser',
      platform: 'web',
      ready_for_intake: true,
      gate_decision: 'source_adapter_conformant',
      required_failures: []
    });

    const status = buildReadOnlyExpansionStatus({ root, pilotImportPath: pilotPath });
    assert.deepEqual(status.required_failures, []);
    assert.equal(status.goal_complete, false);
    assert.equal(status.current_samples.real_observations.observation_count, 1);
    assert.equal(status.current_samples.real_observations.non_wechat_observation_count, 0);
    assert.ok(status.warning_failures.includes('non_wechat_real_sample_pending'));
    assert.equal(status.graph_loop.closed_loop_complete, true);
    assert.equal(status.future_intake.required_future_sources.length, 3);
    assert.equal(status.real_send_attempted, false);

    const written = writeReadOnlyExpansionStatus({
      status,
      outputDir: path.join(root, 'runtime/read-only-expansion-status/test')
    });
    assert.equal(existsSync(written.json_path), true);
    assert.equal(existsSync(written.markdown_path), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('keeps read-only expansion in progress when only browser real sample is present', () => {
  const root = tempRoot();
  try {
    const pilotPath = path.join(root, 'runtime/user-inputs/pilot-import.real.json');
    mkdirSync(path.dirname(pilotPath), { recursive: true });
    copyFileSync(path.resolve('examples/pilot-import-batch.sample.json'), pilotPath);

    writeJson(path.join(root, 'runtime/browser-intake-real/sample/intake-observation.real.json'), {
      observation_id: 'intake_obs_browser_real_status_test',
      source_adapter_id: 'browser_dom.next',
      source_type: 'browser',
      platform: 'web',
      captured_at: '2026-06-16T10:00:00+08:00',
      content_text: 'Saved web page content for a read-only intake status check.',
      content_summary: 'Saved web page read-only sample.',
      participants_hint: ['user', 'web_portal'],
      thread_hint: {
        url: 'https://example.internal/status',
        page_title: 'Status page'
      },
      raw_artifact_refs: ['runtime/browser-intake-real/sample/source.html'],
      privacy_level: 'redacted_text',
      confidence: 0.86,
      metadata: {
        real_execution_allowed: false,
        real_send_attempted: false
      }
    });

    const generatedDir = path.join(root, 'runtime/desktop-context-bridges/generated');
    mkdirSync(generatedDir, { recursive: true });
    copyFileSync(path.resolve('examples/pilot-import-batch.sample.json'), path.join(generatedDir, 'pilot-import.generated.json'));
    writeJson(path.join(generatedDir, 'read-only-expansion-graph-loop-verification.json'), {
      gate_decision: 'read_only_expansion_graph_loop_verified',
      required_failures: [],
      real_execution_allowed: false,
      real_send_attempted: false,
      read_only_expansion: {
        pilot_import: {
          ready_for_closed_loop_mvp: true
        }
      },
      graph_closed_loop: {
        quality: {
          closed_loop_complete: true
        },
        path: {
          expert_weight_judgment: {
            completed_expert_count: 8
          },
          feedback_writeback: {
            writeback_complete: true
          }
        }
      }
    });

    writeKit(root, { adapterId: 'browser_dom.next', sourceType: 'browser', platform: 'web' });
    writeKit(root, { adapterId: 'external_chat_export.next', sourceType: 'file', platform: 'external_chat_export' });
    writeKit(root, { adapterId: 'business_api.next', sourceType: 'api', platform: 'business_system' });
    writeJson(path.join(root, 'runtime/source-adapter-conformance/browser/source-adapter-conformance.json'), {
      validation_id: 'source_adapter_conformance_browser_status_test',
      adapter_id: 'browser_dom.next',
      source_type: 'browser',
      platform: 'web',
      ready_for_intake: true,
      gate_decision: 'source_adapter_conformant',
      required_failures: []
    });

    const status = buildReadOnlyExpansionStatus({ root, pilotImportPath: pilotPath });
    assert.deepEqual(status.required_failures, []);
    assert.equal(status.goal_complete, false);
    assert.equal(status.goal_status, 'in_progress_waiting_required_future_source_samples');
    assert.equal(status.current_samples.real_observations.non_wechat_observation_count, 1);
    assert.equal(
      status.future_intake.required_future_sources.find((item) => item.source === 'browser_web')?.real_sample_present,
      true
    );
    assert.ok(!status.warning_failures.includes('browser_web_real_sample_present'));
    assert.ok(status.warning_failures.includes('external_chat_export_real_sample_present'));
    assert.ok(status.warning_failures.includes('business_system_api_real_sample_present'));
    assert.equal(status.next_actions.some((action) => action.includes('browser DOM real observation')), false);
    assert.equal(status.next_actions.some((action) => action.includes('external chat export')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports external chat and business API conformance without treating samples as real observations', () => {
  const root = tempRoot();
  try {
    const pilotPath = path.join(root, 'runtime/user-inputs/pilot-import.real.json');
    mkdirSync(path.dirname(pilotPath), { recursive: true });
    copyFileSync(path.resolve('examples/pilot-import-batch.sample.json'), pilotPath);

    writeJson(path.join(root, 'runtime/browser-intake-real/sample/intake-observation.real.json'), {
      observation_id: 'intake_obs_browser_only_for_future_status_test',
      source_adapter_id: 'browser_dom.next',
      source_type: 'browser',
      platform: 'web',
      captured_at: '2026-06-16T10:00:00+08:00',
      content_summary: 'Saved web page read-only sample.',
      participants_hint: ['user', 'web_portal'],
      raw_artifact_refs: ['runtime/browser-intake-real/sample/source.html'],
      privacy_level: 'redacted_text',
      confidence: 0.86,
      metadata: {
        real_execution_allowed: false,
        real_send_attempted: false
      }
    });

    const generatedDir = path.join(root, 'runtime/desktop-context-bridges/generated');
    mkdirSync(generatedDir, { recursive: true });
    copyFileSync(path.resolve('examples/pilot-import-batch.sample.json'), path.join(generatedDir, 'pilot-import.generated.json'));
    writeJson(path.join(generatedDir, 'read-only-expansion-graph-loop-verification.json'), {
      gate_decision: 'read_only_expansion_graph_loop_verified',
      required_failures: [],
      real_execution_allowed: false,
      real_send_attempted: false,
      read_only_expansion: {
        pilot_import: {
          ready_for_closed_loop_mvp: true
        }
      },
      graph_closed_loop: {
        quality: {
          closed_loop_complete: true
        },
        path: {
          expert_weight_judgment: {
            completed_expert_count: 8
          },
          feedback_writeback: {
            writeback_complete: true
          }
        }
      }
    });

    writeKit(root, { adapterId: 'browser_dom.next', sourceType: 'browser', platform: 'web' });
    writeKit(root, { adapterId: 'external_chat_export.next', sourceType: 'file', platform: 'external_chat_export' });
    writeKit(root, { adapterId: 'business_api.next', sourceType: 'api', platform: 'business_system' });
    writeJson(path.join(root, 'runtime/source-adapter-conformance/browser/source-adapter-conformance.json'), {
      validation_id: 'source_adapter_conformance_browser_future_status_test',
      adapter_id: 'browser_dom.next',
      source_type: 'browser',
      platform: 'web',
      ready_for_intake: true,
      gate_decision: 'source_adapter_conformant',
      required_failures: []
    });
    writeJson(path.join(root, 'runtime/source-adapter-conformance/external-chat/source-adapter-conformance.json'), {
      validation_id: 'source_adapter_conformance_external_chat_future_status_test',
      adapter_id: 'external_chat_export.sample',
      source_type: 'file',
      platform: 'external_chat_export',
      ready_for_intake: true,
      gate_decision: 'source_adapter_conformant',
      required_failures: []
    });
    writeJson(path.join(root, 'runtime/source-adapter-conformance/business-api/source-adapter-conformance.json'), {
      validation_id: 'source_adapter_conformance_business_api_future_status_test',
      adapter_id: 'business_api.sample',
      source_type: 'api',
      platform: 'business_system',
      ready_for_intake: true,
      gate_decision: 'source_adapter_conformant',
      required_failures: []
    });

    const status = buildReadOnlyExpansionStatus({ root, pilotImportPath: pilotPath });
    const externalChat = status.future_intake.required_future_sources.find((item) => item.source === 'external_chat_export');
    const businessApi = status.future_intake.required_future_sources.find((item) => item.source === 'business_system_api');
    assert.equal(externalChat.conformance_ready, true);
    assert.equal(businessApi.conformance_ready, true);
    assert.equal(externalChat.real_sample_present, false);
    assert.equal(businessApi.real_sample_present, false);
    assert.ok(status.warning_failures.includes('external_chat_export_real_sample_present'));
    assert.ok(status.warning_failures.includes('business_system_api_real_sample_present'));
    assert.equal(status.goal_complete, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('finds latest generated PilotImportBatch from read-only expansion trial artifacts', () => {
  const root = tempRoot();
  try {
    const pilotPath = path.join(root, 'runtime/user-inputs/pilot-import.real.json');
    mkdirSync(path.dirname(pilotPath), { recursive: true });
    copyFileSync(path.resolve('examples/pilot-import-batch.sample.json'), pilotPath);

    const trialDir = path.join(root, 'runtime/read-only-expansion-trials/trial-generated');
    mkdirSync(trialDir, { recursive: true });
    copyFileSync(path.resolve('examples/pilot-import-batch.sample.json'), path.join(trialDir, 'pilot-import.generated.json'));
    writeJson(path.join(trialDir, 'read-only-expansion-graph-loop-verification.json'), {
      gate_decision: 'read_only_expansion_graph_loop_verified',
      required_failures: [],
      real_execution_allowed: false,
      real_send_attempted: false,
      read_only_expansion: {
        pilot_import: {
          ready_for_closed_loop_mvp: true
        }
      },
      graph_closed_loop: {
        quality: {
          closed_loop_complete: true
        },
        path: {
          expert_weight_judgment: {
            completed_expert_count: 8
          },
          feedback_writeback: {
            writeback_complete: true
          }
        }
      }
    });

    const status = buildReadOnlyExpansionStatus({ root, pilotImportPath: pilotPath });
    assert.equal(
      status.current_samples.latest_generated_pilot_import.path,
      'runtime/read-only-expansion-trials/trial-generated/pilot-import.generated.json'
    );
    assert.equal(
      status.graph_loop.path,
      'runtime/read-only-expansion-trials/trial-generated/read-only-expansion-graph-loop-verification.json'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports effective read-only sample counts without deleting duplicate evidence', () => {
  const root = tempRoot();
  try {
    const pilotPath = path.join(root, 'runtime/user-inputs/pilot-import.real.json');
    mkdirSync(path.dirname(pilotPath), { recursive: true });
    copyFileSync(path.resolve('examples/pilot-import-batch.sample.json'), pilotPath);

    const duplicateObservation = {
      observation_id: 'intake_obs_duplicate_wechat_status_test',
      source_adapter_id: 'sightflow_desktop.wechat',
      source_type: 'desktop',
      platform: 'wechat',
      captured_at: '2026-06-16T10:05:00+08:00',
      content_summary: 'Duplicate WeChat read-only artifact.',
      participants_hint: ['user', 'wechat_contact'],
      raw_artifact_refs: ['runtime/desktop-inbox-real/duplicate-a/screenshot.png'],
      privacy_level: 'artifact_allowed',
      confidence: 0.68,
      metadata: {
        real_execution_allowed: false,
        real_send_attempted: false
      }
    };
    writeJson(path.join(root, 'runtime/desktop-inbox-real/duplicate-a/intake-observation.real.json'), duplicateObservation);
    writeJson(path.join(root, 'runtime/desktop-inbox-real/duplicate-b/intake-observation.real.json'), {
      ...duplicateObservation,
      raw_artifact_refs: ['runtime/desktop-inbox-real/duplicate-b/screenshot.png']
    });
    writeJson(path.join(root, 'runtime/browser-intake-real/sample/intake-observation.real.json'), {
      observation_id: 'intake_obs_browser_unique_status_test',
      source_adapter_id: 'browser_dom.next',
      source_type: 'browser',
      platform: 'web',
      captured_at: '2026-06-16T10:07:00+08:00',
      content_summary: 'Unique browser read-only sample.',
      participants_hint: ['user', 'web_portal'],
      raw_artifact_refs: ['runtime/browser-intake-real/sample/source.html'],
      privacy_level: 'redacted_text',
      confidence: 0.8,
      metadata: {
        real_execution_allowed: false,
        real_send_attempted: false
      }
    });
    writeJson(path.join(root, 'runtime/external-chat-intake-real/sample/intake-observation.real.json'), {
      observation_id: 'intake_obs_external_chat_unique_status_test',
      source_adapter_id: 'external_chat_export.next',
      source_type: 'file',
      platform: 'external_chat_export',
      captured_at: '2026-06-16T10:08:00+08:00',
      content_summary: 'Unique external chat export read-only sample.',
      participants_hint: ['user', 'external_contact'],
      raw_artifact_refs: ['runtime/external-chat-intake-real/sample/chat-export.txt'],
      privacy_level: 'redacted_text',
      confidence: 0.79,
      metadata: {
        real_execution_allowed: false,
        real_send_attempted: false
      }
    });
    writeJson(path.join(root, 'runtime/business-api-intake-real/sample/intake-observation.real.json'), {
      observation_id: 'intake_obs_business_api_unique_status_test',
      source_adapter_id: 'business_api.next',
      source_type: 'api',
      platform: 'business_system',
      captured_at: '2026-06-16T10:09:00+08:00',
      content_summary: 'Unique business API snapshot read-only sample.',
      participants_hint: ['user', 'business_record'],
      raw_artifact_refs: ['runtime/business-api-intake-real/sample/snapshot.json'],
      privacy_level: 'redacted_text',
      confidence: 0.81,
      metadata: {
        real_execution_allowed: false,
        real_send_attempted: false
      }
    });

    const generatedDir = path.join(root, 'runtime/desktop-context-bridges/generated');
    mkdirSync(generatedDir, { recursive: true });
    copyFileSync(path.resolve('examples/pilot-import-batch.sample.json'), path.join(generatedDir, 'pilot-import.generated.json'));
    writeJson(path.join(generatedDir, 'read-only-expansion-graph-loop-verification.json'), {
      gate_decision: 'read_only_expansion_graph_loop_verified',
      required_failures: [],
      real_execution_allowed: false,
      real_send_attempted: false,
      read_only_expansion: {
        pilot_import: {
          ready_for_closed_loop_mvp: true
        }
      },
      graph_closed_loop: {
        quality: {
          closed_loop_complete: true
        },
        path: {
          expert_weight_judgment: {
            completed_expert_count: 8
          },
          feedback_writeback: {
            writeback_complete: true
          }
        }
      }
    });

    writeKit(root, { adapterId: 'browser_dom.next', sourceType: 'browser', platform: 'web' });
    writeKit(root, { adapterId: 'external_chat_export.next', sourceType: 'file', platform: 'external_chat_export' });
    writeKit(root, { adapterId: 'business_api.next', sourceType: 'api', platform: 'business_system' });
    writeJson(path.join(root, 'runtime/source-adapter-conformance/browser/source-adapter-conformance.json'), {
      validation_id: 'source_adapter_conformance_browser_dedupe_test',
      adapter_id: 'browser_dom.next',
      source_type: 'browser',
      platform: 'web',
      ready_for_intake: true,
      gate_decision: 'source_adapter_conformant',
      required_failures: []
    });
    writeJson(path.join(root, 'runtime/source-adapter-conformance/external-chat/source-adapter-conformance.json'), {
      validation_id: 'source_adapter_conformance_external_chat_dedupe_test',
      adapter_id: 'external_chat_export.next',
      source_type: 'file',
      platform: 'external_chat_export',
      ready_for_intake: true,
      gate_decision: 'source_adapter_conformant',
      required_failures: []
    });
    writeJson(path.join(root, 'runtime/source-adapter-conformance/business-api/source-adapter-conformance.json'), {
      validation_id: 'source_adapter_conformance_business_api_dedupe_test',
      adapter_id: 'business_api.next',
      source_type: 'api',
      platform: 'business_system',
      ready_for_intake: true,
      gate_decision: 'source_adapter_conformant',
      required_failures: []
    });

    const status = buildReadOnlyExpansionStatus({ root, pilotImportPath: pilotPath });
    const realObservations = status.current_samples.real_observations;
    assert.equal(realObservations.observation_count, 5);
    assert.equal(realObservations.effective_observation_count, 4);
    assert.equal(realObservations.duplicate_suppressed_count, 1);
    assert.equal(realObservations.effective_non_wechat_observation_count, 3);
    assert.equal(realObservations.duplicate_observation_groups.length, 1);
    assert.equal(realObservations.duplicate_observation_groups[0].paths.length, 2);
    assert.equal(status.goal_status, 'in_progress_waiting_duplicate_observation_confirmation');
    assert.ok(status.warning_failures.includes('duplicate_observation_ids_need_review'));
    assert.ok(status.next_actions.some((action) => action.includes('duplicate observation IDs')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('closes duplicate warning only after operator confirmation covers current duplicate groups', () => {
  const root = tempRoot();
  try {
    const pilotPath = path.join(root, 'runtime/user-inputs/pilot-import.real.json');
    mkdirSync(path.dirname(pilotPath), { recursive: true });
    copyFileSync(path.resolve('examples/pilot-import-batch.sample.json'), pilotPath);

    const duplicateObservation = {
      observation_id: 'intake_obs_duplicate_confirmed_status_test',
      source_adapter_id: 'sightflow_desktop.wechat',
      source_type: 'desktop',
      platform: 'wechat',
      captured_at: '2026-06-16T10:05:00+08:00',
      content_summary: 'Confirmed duplicate WeChat read-only artifact.',
      participants_hint: ['user', 'wechat_contact'],
      raw_artifact_refs: ['runtime/desktop-inbox-real/duplicate-a/screenshot.png'],
      privacy_level: 'artifact_allowed',
      confidence: 0.68,
      metadata: {
        real_execution_allowed: false,
        real_send_attempted: false,
        screenshot_bytes: 100
      }
    };
    writeJson(path.join(root, 'runtime/desktop-inbox-real/duplicate-a/intake-observation.real.json'), duplicateObservation);
    writeJson(path.join(root, 'runtime/desktop-inbox-real/duplicate-b/intake-observation.real.json'), {
      ...duplicateObservation,
      raw_artifact_refs: ['runtime/desktop-inbox-real/duplicate-b/screenshot.png']
    });

    const generatedDir = path.join(root, 'runtime/desktop-context-bridges/generated');
    mkdirSync(generatedDir, { recursive: true });
    copyFileSync(path.resolve('examples/pilot-import-batch.sample.json'), path.join(generatedDir, 'pilot-import.generated.json'));
    writeJson(path.join(generatedDir, 'read-only-expansion-graph-loop-verification.json'), {
      gate_decision: 'read_only_expansion_graph_loop_verified',
      required_failures: [],
      real_execution_allowed: false,
      real_send_attempted: false,
      read_only_expansion: {
        pilot_import: {
          ready_for_closed_loop_mvp: true
        }
      },
      graph_closed_loop: {
        quality: {
          closed_loop_complete: true
        },
        path: {
          expert_weight_judgment: {
            completed_expert_count: 8
          },
          feedback_writeback: {
            writeback_complete: true
          }
        }
      }
    });
    writeKit(root, { adapterId: 'browser_dom.next', sourceType: 'browser', platform: 'web' });
    writeKit(root, { adapterId: 'external_chat_export.next', sourceType: 'file', platform: 'external_chat_export' });
    writeKit(root, { adapterId: 'business_api.next', sourceType: 'api', platform: 'business_system' });

    const statusBefore = buildReadOnlyExpansionStatus({ root, pilotImportPath: pilotPath });
    assert.ok(statusBefore.warning_failures.includes('duplicate_observation_ids_need_review'));
    const writtenStatus = writeReadOnlyExpansionStatus({
      status: statusBefore,
      outputDir: path.join(root, 'runtime/read-only-expansion-status/status_for_confirmation')
    });
    const review = buildReadOnlyDuplicateObservationReview({
      root,
      statusPath: writtenStatus.json_path
    });
    const writtenReview = writeReadOnlyDuplicateObservationReview({
      review,
      outputDir: path.join(root, 'runtime/read-only-duplicate-observation-reviews', review.review_id)
    });
    const decisionPath = path.join(root, 'duplicate-confirmation.reviewed.json');
    writeJson(decisionPath, {
      schema_version: 'read_only_duplicate_observation_confirmation_decision.v1',
      review_id: review.review_id,
      operator: {
        operator_id: 'operator_test',
        confirmed_at: '2026-06-16T00:00:00.000Z'
      },
      decisions: [
        {
          observation_id: 'intake_obs_duplicate_confirmed_status_test',
          decision: 'accept_suppression',
          reason: 'Confirmed duplicate read-only observation.',
          confirmed_paths: statusBefore.current_samples.real_observations.duplicate_observation_groups[0].paths
        }
      ]
    });
    const confirmation = buildReadOnlyDuplicateObservationConfirmation({
      root,
      reviewPath: writtenReview.json_path,
      decisionPath
    });
    assert.equal(confirmation.summary.duplicate_suppression_confirmed, true);
    writeReadOnlyDuplicateObservationConfirmation({
      confirmation,
      outputDir: path.join(root, 'runtime/read-only-duplicate-observation-confirmations', confirmation.confirmation_id)
    });

    const statusAfter = buildReadOnlyExpansionStatus({ root, pilotImportPath: pilotPath });
    assert.equal(statusAfter.duplicate_confirmation.current_duplicate_groups_confirmed, true);
    assert.equal(statusAfter.current_samples.real_observations.duplicate_observation_groups.length, 1);
    assert.equal(statusAfter.warning_failures.includes('duplicate_observation_ids_need_review'), false);
    assert.equal(statusAfter.next_actions.some((action) => action.includes('duplicate observation IDs')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
