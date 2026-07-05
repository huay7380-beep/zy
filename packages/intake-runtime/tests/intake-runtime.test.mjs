import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  appendObservationAsRawEvent,
  auditIntakeImplementation,
  buildBusinessApiSnapshotObservation,
  buildBrowserHtmlObservation,
  buildControlledSendCommandPreflight,
  buildControlledSendCommandDraft,
  buildControlledSendCommandConfirmation,
  buildControlledSendMaterialKit,
  buildControlledSendOperatorPack,
  buildControlledSendRealWindowReadiness,
  buildDocs16ImplementationStatus,
  buildExternalChatExportObservation,
  buildReadOnlySourceCollection,
  buildReadOnlySourceCollectionManifestReadiness,
  buildReadOnlySourceCollectionManifestKit,
  buildSourceIntakeMatrix,
  buildSourceAdapterInitKit,
  buildControlledSendHandoff,
  buildObservationContentFingerprint,
  completeControlledSendTrial,
  createBuiltInAdapterRegistry,
  evaluateSendCommandForExecution,
  mapObservationToRawEvent,
  normalizeIntakeObservation,
  normalizeSourceActorType,
  normalizeOutboundSendCommand,
  normalizeSourceAdapterCapability,
  runSendCommandDryRun,
  summarizeObservationDeduplication,
  validateSourceAdapterConformance,
  writeControlledSendCommandPreflight,
  writeControlledSendCommandDraft,
  writeControlledSendCommandConfirmation,
  writeControlledSendMaterialKit,
  writeControlledSendOperatorPack,
  writeControlledSendRealWindowReadiness,
  writeDocs16ImplementationStatus,
  writeControlledSendCompletion,
  writeControlledSendHandoff,
  writeBusinessApiSnapshotObservation,
  writeBrowserHtmlObservation,
  writeExternalChatExportObservation,
  writeIntakeImplementationAudit,
  writeReadOnlySourceCollection,
  writeReadOnlySourceCollectionManifestReadiness,
  writeReadOnlySourceCollectionManifestKit,
  writeSourceIntakeMatrix,
  writeSourceAdapterInitKit,
  writeSourceAdapterConformance
} from '../src/index.mjs';
import {
  initializeStorage,
  loadStorageSnapshot
} from '../../storage-runtime/src/index.mjs';

function fixture(name) {
  return JSON.parse(readFileSync(path.join('examples', name), 'utf8'));
}

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-intake-'));
}

function hashText(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runnerEnvironmentContractFixture({
  commandPath = 'D:\\zhineng\\runtime\\user-inputs\\controlled-send-command.real.json',
  readinessPath = null,
  resultPath = null,
  boxRegionsPath = 'D:\\zhineng\\runtime\\user-inputs\\controlled-send-box-regions.real.json',
  readyForRunner = false
} = {}) {
  return {
    contract_version: 'controlled_send_runner_environment.v1',
    ready_for_runner: readyForRunner,
    required_env: {
      ALLOW_REAL_CONTROLLED_SEND: 'true',
      CONTROLLED_SEND_COMMAND_PATH: commandPath,
      CONTROLLED_SEND_READINESS_PATH: readinessPath,
      CONTROLLED_SEND_RESULT_PATH: resultPath
    },
    path_bindings: {
      command_path_must_equal: commandPath,
      readiness_path_must_equal: readinessPath,
      result_path_must_equal: resultPath,
      box_regions_path_must_equal: boxRegionsPath
    },
    recognition_mode_policy: {
      exactly_one_required: true,
      box_regions_env: 'CONTROLLED_SEND_BOX_REGIONS_PATH',
      box_regions_expected_path: boxRegionsPath,
      vision_api_env: 'CONTROLLED_SEND_VISION_API_KEY',
      vision_api_value_placeholder: '<vision_api_key>',
      forbidden_combination: [
        'CONTROLLED_SEND_BOX_REGIONS_PATH',
        'CONTROLLED_SEND_VISION_API_KEY'
      ]
    },
    readiness_gate: {
      schema_version: 'desktop_controlled_send_trial.v1',
      gate_decision: 'controlled_send_ready_for_test_window',
      ready_for_real_controlled_send: true,
      real_send_attempted: false,
      required_failures: []
    },
    command_snapshot_required_fields: [
      'send_command_id',
      'event_id',
      'decision_id',
      'trigger_id',
      'target_platform',
      'target_person_id',
      'target_thread_hint',
      'message_draft_length',
      'message_draft_sha256'
    ],
    operator_rule: 'Run exactly one runner command in the confirmed test account or test window, then run completion_command immediately.'
  };
}

test('normalizes built-in adapter capabilities', () => {
  const registry = createBuiltInAdapterRegistry();

  assert.equal(registry.list().length, 3);
  assert.equal(registry.require('sightflow_desktop.wechat').capabilities.can_send, true);
  assert.equal(registry.require('browser_dom.sample').capabilities.can_read_dom, true);
  assert.equal(registry.require('fake_test.adapter').capabilities.can_receive, true);

  assert.throws(
    () => normalizeSourceAdapterCapability({
      adapter_id: 'bad',
      adapter_version: '0.1.0',
      source_type: 'desktop',
      platform: 'wechat',
      capabilities: {
        can_receive: false,
        can_send: false,
        can_capture_screenshot: false,
        can_read_dom: false,
        can_identify_thread: false,
        can_verify_target: false,
        requires_user_confirmation: true
      }
    }),
    /at least receive or send/
  );
});

test('maps sightflow, browser and fake observations through one RawEvent path', () => {
  const sightflow = fixture('intake-observation.sightflow.sample.json');
  const browser = fixture('intake-observation.browser.sample.json');
  const fake = fixture('intake-observation.fake.sample.json');

  for (const observation of [sightflow, browser, fake]) {
    assert.equal(normalizeIntakeObservation(observation).content_summary.length > 0, true);
  }

  const sightflowRaw = mapObservationToRawEvent(sightflow);
  assert.equal(sightflowRaw.event_id, sightflow.observation_id);
  assert.equal(sightflowRaw.event_kind, 'raw_interaction');
  assert.equal(sightflowRaw.source, 'desktop:sightflow_desktop.wechat:wechat');
  assert.equal(sightflowRaw.source_ref.screenshot_hash, 'sha256:sightflow_sample_hash');
  assert.ok(sightflowRaw.content.includes('预算'));

  const browserRaw = mapObservationToRawEvent(browser);
  assert.equal(browserRaw.event_kind, 'web_observation');
  assert.equal(browserRaw.source, 'browser:browser_dom.sample:web');
  assert.ok(browserRaw.content.includes('客户门户'));

  const fakeRaw = mapObservationToRawEvent(fake);
  assert.equal(fakeRaw.event_kind, 'raw_interaction');
  assert.equal(fakeRaw.source, 'api:fake_test.adapter:test');
  assert.equal(fakeRaw.content, undefined);
  assert.deepEqual(fakeRaw.participants, ['user', 'fake_counterparty']);
});

test('keeps source actor type conservative and writes strict content fingerprints', () => {
  const sightflow = fixture('intake-observation.sightflow.sample.json');
  const browser = fixture('intake-observation.browser.sample.json');

  assert.equal(normalizeSourceActorType('human_contact'), 'human_contact');
  assert.throws(() => normalizeSourceActorType('personal_guess'), /source_actor_type is invalid/);
  assert.equal(normalizeIntakeObservation(sightflow).source_actor_type, 'human_contact');
  assert.equal(normalizeIntakeObservation(browser).source_actor_type, 'unknown');

  const raw = mapObservationToRawEvent(sightflow);
  assert.equal(raw.source_ref.source_actor_type, 'human_contact');
  assert.equal(raw.metadata.source_actor_type, 'human_contact');
  assert.equal(raw.metadata.content_fingerprint.dedupe_ready, true);
  assert.equal(raw.metadata.content_fingerprint.strategy, 'strict_platform_thread_time_speaker_text_screenshot.v1');

  const fingerprint = buildObservationContentFingerprint(sightflow);
  assert.equal(fingerprint.dedupe_ready, true);
  assert.ok(fingerprint.fingerprint.startsWith('sha256:'));
  assert.equal(fingerprint.components.platform, 'wechat');
  assert.equal(fingerprint.components.source_actor_type, 'human_contact');
});

test('deduplicates only strict content fingerprint matches and avoids weak text-only merges', () => {
  const base = fixture('intake-observation.sightflow.sample.json');
  const duplicate = {
    ...base,
    observation_id: 'intake_obs_sightflow_wechat_002',
    captured_at: '2026-06-10T08:34:00+08:00'
  };
  const differentSpeaker = {
    ...duplicate,
    observation_id: 'intake_obs_sightflow_wechat_003',
    source_identity_hints: [
      {
        ...duplicate.source_identity_hints[0],
        handle: 'wxid_other_contact'
      }
    ]
  };
  const withoutScreenshotHash = {
    ...base,
    observation_id: 'intake_obs_sightflow_wechat_004',
    screenshot_hash: undefined
  };
  const withoutScreenshotHashCopy = {
    ...withoutScreenshotHash,
    observation_id: 'intake_obs_sightflow_wechat_005'
  };

  const strict = summarizeObservationDeduplication({
    observations: [base, duplicate],
    observationPaths: ['a.json', 'b.json']
  });
  assert.equal(strict.raw_observation_count, 2);
  assert.equal(strict.effective_observation_count, 1);
  assert.equal(strict.duplicate_suppressed_count, 1);
  assert.equal(strict.duplicate_observation_groups[0].dedupe_level, 'strict_content_fingerprint');

  const separateSpeaker = summarizeObservationDeduplication({
    observations: [base, differentSpeaker],
    observationPaths: ['a.json', 'c.json']
  });
  assert.equal(separateSpeaker.effective_observation_count, 2);
  assert.equal(separateSpeaker.duplicate_suppressed_count, 0);

  const weak = summarizeObservationDeduplication({
    observations: [withoutScreenshotHash, withoutScreenshotHashCopy],
    observationPaths: ['d.json', 'e.json']
  });
  assert.equal(weak.effective_observation_count, 2);
  assert.equal(weak.duplicate_suppressed_count, 0);
  assert.ok(weak.entries.every((entry) => entry.content_fingerprint.missing_required.includes('screenshot_hash')));
});

test('builds a real browser HTML observation from a saved page without sending', () => {
  const root = tempRoot();
  try {
    const htmlPath = path.join(root, 'runtime/user-inputs/page.real.html');
    mkdirSync(path.dirname(htmlPath), { recursive: true });
    writeFileSync(htmlPath, '<!doctype html><title>Customer Portal</title><main><h1>Project Status</h1><p>Customer asks for security whitelist before review.</p><button disabled>Send blocked</button></main>', 'utf8');

    const html = readFileSync(htmlPath, 'utf8');
    const observation = buildBrowserHtmlObservation({
      html,
      htmlPath,
      root,
      adapterId: 'browser_dom.next',
      pageUrl: 'https://example.test/customer/project'
    });
    assert.equal(observation.source_type, 'browser');
    assert.equal(observation.platform, 'web');
    assert.equal(observation.metadata.real_execution_allowed, false);
    assert.equal(observation.metadata.real_send_attempted, false);
    assert.ok(observation.content_summary.includes('Customer Portal'));

    const rawEvent = mapObservationToRawEvent(observation);
    assert.equal(rawEvent.event_kind, 'web_observation');
    assert.equal(rawEvent.source, 'browser:browser_dom.next:web');

    const written = writeBrowserHtmlObservation({
      htmlPath,
      root,
      outputDir: path.join(root, 'runtime/browser-intake-real/test'),
      adapterId: 'browser_dom.next',
      pageUrl: 'https://example.test/customer/project'
    });
    assert.equal(existsSync(written.observation_path), true);
    assert.equal(existsSync(written.report_path), true);
    assert.equal(existsSync(written.markdown_path), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('browser HTML observation CLI writes a real observation artifact', () => {
  const root = tempRoot();
  try {
    const htmlPath = path.join(root, 'page.html');
    const outputDir = path.join(root, 'browser-real');
    writeFileSync(htmlPath, '<html><head><title>Business System Page</title></head><body><p>Approval status changed to waiting for user review.</p></body></html>', 'utf8');

    const result = spawnSync(process.execPath, [
      path.resolve('scripts/capture-browser-html-observation.mjs'),
      `--root=${root}`,
      '--html=page.html',
      '--url=https://example.test/business/status',
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(result.status, 0);
    const observationPath = path.join(outputDir, 'intake-observation.real.json');
    assert.equal(existsSync(observationPath), true);
    const observation = JSON.parse(readFileSync(observationPath, 'utf8'));
    assert.equal(observation.source_type, 'browser');
    assert.equal(observation.metadata.real_send_attempted, false);
    assert.equal(mapObservationToRawEvent(observation).event_kind, 'web_observation');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('external chat export observation maps a saved file without sending', () => {
  const root = tempRoot();
  try {
    const exportPath = path.join(root, 'chat-export.txt');
    const outputDir = path.join(root, 'external-chat-real');
    writeFileSync(exportPath, [
      '2026-06-16 09:00 User: Can we confirm the project review next week?',
      '2026-06-16 09:02 Customer: Please send the security whitelist first. email alice@example.test token=abc123'
    ].join('\n'), 'utf8');

    const exportText = readFileSync(exportPath, 'utf8');
    const observation = buildExternalChatExportObservation({
      exportText,
      exportPath,
      root,
      threadTitle: 'Customer Project Chat',
      participantHints: 'user,customer'
    });
    assert.equal(observation.source_type, 'file');
    assert.equal(observation.platform, 'external_chat_export');
    assert.equal(observation.metadata.real_execution_allowed, false);
    assert.equal(observation.metadata.real_send_attempted, false);
    assert.ok(observation.content_text.includes('[redacted_email]'));
    assert.ok(observation.content_text.includes('token=[redacted]'));

    const rawEvent = mapObservationToRawEvent(observation);
    assert.equal(rawEvent.event_kind, 'imported_record');
    assert.equal(rawEvent.source, 'file:external_chat_export.next:external_chat_export');
    const conformance = validateSourceAdapterConformance({
      capability: {
        adapter_id: 'external_chat_export.next',
        adapter_version: 'next',
        source_type: 'file',
        platform: 'external_chat_export',
        capabilities: {
          can_receive: true,
          can_send: false,
          can_capture_screenshot: false,
          can_read_dom: false,
          can_identify_thread: true,
          can_verify_target: false,
          requires_user_confirmation: true
        },
        metadata: {
          real_execution_default: false
        }
      },
      observation
    });
    assert.equal(conformance.ready_for_intake, true);
    assert.equal(conformance.raw_event_preview.event_kind, 'imported_record');

    const written = writeExternalChatExportObservation({
      exportPath,
      outputDir,
      root,
      threadTitle: 'Customer Project Chat',
      participantHints: 'user,customer'
    });
    assert.equal(existsSync(written.observation_path), true);
    assert.equal(existsSync(written.report_path), true);
    assert.equal(existsSync(written.markdown_path), true);

    const result = spawnSync(process.execPath, [
      path.resolve('scripts/capture-external-chat-export-observation.mjs'),
      `--root=${root}`,
      '--file=chat-export.txt',
      '--thread-title=Customer Project Chat',
      '--participants=user,customer',
      `--output-dir=${path.join(root, 'external-chat-cli')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(result.status, 0);
    const cliObservation = JSON.parse(readFileSync(path.join(root, 'external-chat-cli/intake-observation.real.json'), 'utf8'));
    assert.equal(cliObservation.metadata.real_send_attempted, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('business API snapshot observation maps saved JSON without external calls', () => {
  const root = tempRoot();
  try {
    const snapshotPath = path.join(root, 'business-snapshot.json');
    const outputDir = path.join(root, 'business-api-real');
    writeFileSync(snapshotPath, JSON.stringify({
      account_id: 'acct_001',
      stage: 'waiting_for_customer_review',
      next_action: 'prepare whitelist evidence',
      owner: { name: 'Ops Lead', email: 'ops@example.test' },
      auth: { api_key: 'secret-value' }
    }, null, 2), 'utf8');

    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    const observation = buildBusinessApiSnapshotObservation({
      snapshot,
      snapshotPath,
      root,
      endpoint: 'crm.project_status',
      recordId: 'acct_001',
      threadTitle: 'CRM Project Status',
      participantHints: 'user,crm'
    });
    assert.equal(observation.source_type, 'api');
    assert.equal(observation.platform, 'business_system');
    assert.equal(observation.metadata.real_execution_allowed, false);
    assert.equal(observation.metadata.real_send_attempted, false);
    assert.ok(observation.content_text.includes('[redacted_email]'));
    assert.ok(observation.content_text.includes('api_key=[redacted]'));
    assert.equal(observation.content_text.includes('secret-value'), false);

    const rawEvent = mapObservationToRawEvent(observation);
    assert.equal(rawEvent.event_kind, 'raw_interaction');
    assert.equal(rawEvent.source, 'api:business_api.next:business_system');
    const conformance = validateSourceAdapterConformance({
      capability: {
        adapter_id: 'business_api.next',
        adapter_version: 'next',
        source_type: 'api',
        platform: 'business_system',
        capabilities: {
          can_receive: true,
          can_send: false,
          can_capture_screenshot: false,
          can_read_dom: false,
          can_identify_thread: true,
          can_verify_target: true,
          requires_user_confirmation: true
        },
        metadata: {
          real_execution_default: false
        }
      },
      observation
    });
    assert.equal(conformance.ready_for_intake, true);
    assert.equal(conformance.raw_event_preview.source, 'api:business_api.next:business_system');

    const written = writeBusinessApiSnapshotObservation({
      snapshotPath,
      outputDir,
      root,
      endpoint: 'crm.project_status',
      recordId: 'acct_001',
      threadTitle: 'CRM Project Status',
      participantHints: 'user,crm'
    });
    assert.equal(existsSync(written.observation_path), true);
    assert.equal(existsSync(written.report_path), true);
    assert.equal(existsSync(written.markdown_path), true);

    const result = spawnSync(process.execPath, [
      path.resolve('scripts/capture-business-api-snapshot-observation.mjs'),
      `--root=${root}`,
      '--json=business-snapshot.json',
      '--endpoint=crm.project_status',
      '--record-id=acct_001',
      '--thread-title=CRM Project Status',
      '--participants=user,crm',
      `--output-dir=${path.join(root, 'business-api-cli')}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(result.status, 0);
    const cliObservation = JSON.parse(readFileSync(path.join(root, 'business-api-cli/intake-observation.real.json'), 'utf8'));
    assert.equal(cliObservation.metadata.real_send_attempted, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('read-only source collection manifest kit writes templates without real material', () => {
  const root = tempRoot();
  try {
    const targetManifest = 'runtime/user-inputs/read-only-source-collection.manifest.json';
    const sourceDir = 'runtime/user-inputs/read-only-sources';
    const outputDir = path.join(root, 'runtime/read-only-source-collection-manifest-kits/kit-test');
    const kit = buildReadOnlySourceCollectionManifestKit({
      root,
      collectionId: 'Operator Batch 001',
      targetManifestPath: targetManifest,
      sourceDir
    });
    const { kit: report, written } = writeReadOnlySourceCollectionManifestKit({
      kit,
      root,
      outputDir
    });
    const template = JSON.parse(readFileSync(written.template_path, 'utf8'));
    const persisted = JSON.parse(readFileSync(written.json_path, 'utf8'));

    assert.equal(report.schema_version, 'read_only_source_collection_manifest_kit.v1');
    assert.equal(report.collection_id, 'operator_batch_001');
    assert.equal(report.template_only, true);
    assert.equal(report.real_execution_allowed, false);
    assert.equal(report.real_send_attempted, false);
    assert.equal(report.target_manifest_path, targetManifest);
    assert.equal(report.target_manifest_exists, false);
    assert.equal(report.target_manifest_intentionally_not_written, true);
    assert.equal(existsSync(path.join(root, targetManifest)), false);
    assert.equal(existsSync(written.template_path), true);
    assert.equal(existsSync(written.readme_path), true);
    assert.equal(template.schema_version, 'read_only_source_collection_manifest.v1');
    assert.equal(template.metadata.template_only, true);
    assert.equal(template.metadata.real_execution_allowed, false);
    assert.equal(template.sources.length, 4);
    assert.ok(template.sources.some((item) => item.source_kind === 'browser_html'));
    assert.ok(template.sources.every((item) => item.file.startsWith(`${sourceDir}/`)));
    assert.ok(report.next_commands[0].includes('intake:read-only:manifest:check'));
    assert.ok(report.next_commands[0].includes(`--manifest=${targetManifest}`));
    assert.ok(report.next_commands[1].includes('intake:read-only:collect'));
    assert.equal(persisted.template_path, 'runtime/read-only-source-collection-manifest-kits/kit-test/read-only-source-collection.manifest.template.json');

    const cli = spawnSync(process.execPath, [
      path.resolve('scripts/init-read-only-source-collection-manifest.mjs'),
      `--root=${root}`,
      '--collection-id=Cli Batch 001',
      `--target-manifest=${targetManifest}`,
      `--source-dir=${sourceDir}`,
      '--output-dir=runtime/read-only-source-collection-manifest-kits/kit-cli'
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8'
    });
    assert.equal(cli.status, 0, cli.stderr);
    const stdout = JSON.parse(cli.stdout);
    assert.equal(stdout.command, 'init-read-only-source-collection-manifest');
    assert.equal(stdout.collection_id, 'cli_batch_001');
    assert.equal(stdout.target_manifest_exists, false);
    assert.equal(stdout.target_manifest_intentionally_not_written, true);
    assert.ok(existsSync(stdout.json_path));
    assert.ok(existsSync(stdout.template_path));
    assert.equal(existsSync(path.join(root, targetManifest)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('read-only source collection manifest readiness checks real saved files before collection', () => {
  const root = tempRoot();
  try {
    const sourceDir = path.join(root, 'runtime/user-inputs/read-only-sources');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(path.join(sourceDir, 'wechat-export.real.txt'), [
      '2026-06-16 10:00 user: 项目资料我下午发你。',
      '2026-06-16 10:03 customer_a: 好的，我会和采购确认。'
    ].join('\n'), 'utf8');
    writeFileSync(path.join(sourceDir, 'web-page.real.html'), '<html><title>Customer Project</title><body>Project status page</body></html>', 'utf8');
    writeFileSync(path.join(sourceDir, 'business-snapshot.real.json'), JSON.stringify({
      account_id: 'acct_real_001',
      stage: 'procurement_review',
      next_action: 'confirm material list'
    }, null, 2), 'utf8');

    const templateManifest = {
      schema_version: 'read_only_source_collection_manifest.v1',
      collection_id: 'template_manifest_should_fail',
      metadata: {
        template_only: true,
        real_execution_allowed: false,
        real_send_attempted: false
      },
      sources: [
        {
          source_id: 'template_external_chat',
          source_kind: 'external_chat_export',
          file: 'examples/read-only-chat-export.sample.txt',
          thread_title: 'replace_with_thread_title',
          participants: ['user', 'replace_with_counterparty']
        }
      ]
    };
    const templateReadiness = buildReadOnlySourceCollectionManifestReadiness({
      root,
      manifest: templateManifest,
      manifestPath: path.join(root, 'runtime/user-inputs/read-only-source-collection.manifest.json')
    });
    assert.equal(templateReadiness.schema_version, 'read_only_source_collection_manifest_readiness.v1');
    assert.equal(templateReadiness.ready_for_collection, false);
    assert.ok(templateReadiness.required_failures.includes('manifest_not_template'));
    assert.ok(templateReadiness.required_failures.some((item) => item.includes('source_path_points_to_sample_or_template')));
    assert.ok(templateReadiness.required_failures.some((item) => item.includes('source_contains_placeholder_value')));

    const manifestPath = path.join(root, 'runtime/user-inputs/read-only-source-collection.manifest.json');
    const validManifest = {
      schema_version: 'read_only_source_collection_manifest.v1',
      collection_id: 'read_only_source_collection_ready_real_files',
      metadata: {
        real_execution_allowed: false,
        real_send_attempted: false
      },
      sources: [
        {
          source_id: 'wechat_export_real_001',
          source_kind: 'external_chat_export',
          file: 'runtime/user-inputs/read-only-sources/wechat-export.real.txt',
          thread_title: 'Customer A project discussion',
          participants: ['user', 'customer_a']
        },
        {
          source_id: 'web_page_real_001',
          source_kind: 'browser_html',
          file: 'runtime/user-inputs/read-only-sources/web-page.real.html',
          url: 'https://portal.example.test/customer-a/project'
        },
        {
          source_id: 'business_snapshot_real_001',
          source_kind: 'business_api_snapshot',
          file: 'runtime/user-inputs/read-only-sources/business-snapshot.real.json',
          endpoint: 'crm.project_status',
          record_id: 'acct_real_001'
        }
      ]
    };
    writeJson(manifestPath, validManifest);
    const readiness = buildReadOnlySourceCollectionManifestReadiness({
      root,
      manifest: validManifest,
      manifestPath
    });
    const written = writeReadOnlySourceCollectionManifestReadiness({
      readiness,
      outputDir: path.join(root, 'runtime/read-only-source-collection-manifest-readiness/readiness-test')
    });
    assert.equal(readiness.gate_decision, 'read_only_source_collection_manifest_ready_for_collection');
    assert.equal(readiness.ready_for_collection, true);
    assert.deepEqual(readiness.required_failures, []);
    assert.equal(readiness.summary.ready_sources, 3);
    assert.equal(readiness.summary.source_kind_counts.external_chat_export, 1);
    assert.equal(readiness.real_send_attempted, false);
    assert.ok(readiness.next_commands[0].includes('intake:read-only:collect'));
    assert.equal(existsSync(written.json_path), true);
    assert.equal(existsSync(written.markdown_path), true);

    const cli = spawnSync(process.execPath, [
      path.resolve('scripts/validate-read-only-source-collection-manifest.mjs'),
      `--root=${root}`,
      '--manifest=runtime/user-inputs/read-only-source-collection.manifest.json',
      '--output-dir=runtime/read-only-source-collection-manifest-readiness/cli-ready',
      '--fail-on-required'
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8'
    });
    assert.equal(cli.status, 0, cli.stderr);
    const stdout = JSON.parse(cli.stdout);
    assert.equal(stdout.command, 'validate-read-only-source-collection-manifest');
    assert.equal(stdout.ready_for_collection, true);
    assert.deepEqual(stdout.required_failures, []);
    assert.ok(existsSync(stdout.json_path));

    const missingCli = spawnSync(process.execPath, [
      path.resolve('scripts/validate-read-only-source-collection-manifest.mjs'),
      `--root=${root}`,
      '--manifest=runtime/user-inputs/missing-read-only-source-collection.manifest.json',
      '--output-dir=runtime/read-only-source-collection-manifest-readiness/cli-missing',
      '--fail-on-required'
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8'
    });
    assert.notEqual(missingCli.status, 0);
    const missingStdout = JSON.parse(missingCli.stdout);
    assert.equal(missingStdout.ready_for_collection, false);
    assert.ok(missingStdout.required_failures.includes('manifest_readable'));
    assert.ok(existsSync(missingStdout.json_path));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('read-only source collection manifest batches saved sources without sending', () => {
  const root = tempRoot();
  try {
    const chatPath = path.join(root, 'chat-export.txt');
    const htmlPath = path.join(root, 'saved-page.html');
    const snapshotPath = path.join(root, 'business-snapshot.json');
    const manifestPath = path.join(root, 'read-only-source-manifest.json');
    const pilotImportPath = path.join(root, 'runtime/user-inputs/pilot-import.real.json');
    const outputDir = path.join(root, 'runtime/read-only-source-collections/collection-test');
    mkdirSync(path.dirname(pilotImportPath), { recursive: true });
    writeFileSync(pilotImportPath, readFileSync(path.resolve('examples/pilot-import-batch.sample.json'), 'utf8'), 'utf8');
    writeFileSync(chatPath, [
      '2026-06-16 09:00 User: Can we confirm the review next week?',
      '2026-06-16 09:02 Customer: Please send whitelist evidence first.'
    ].join('\n'), 'utf8');
    writeFileSync(htmlPath, '<html><head><title>Customer Portal</title></head><body>Review waits for deployment notes.</body></html>', 'utf8');
    writeFileSync(snapshotPath, JSON.stringify({
      account_id: 'acct_001',
      stage: 'waiting_for_review',
      owner: { email: 'owner@example.test' },
      auth: { api_key: 'secret-value' }
    }, null, 2), 'utf8');
    const manifest = {
      schema_version: 'read_only_source_collection_manifest.v1',
      collection_id: 'collection-test',
      sources: [
        {
          source_id: 'external_chat_a',
          source_kind: 'external_chat_export',
          file: 'chat-export.txt',
          thread_title: 'Customer Project Chat',
          participants: ['user', 'customer']
        },
        {
          source_id: 'browser_page_a',
          source_kind: 'browser_html',
          file: 'saved-page.html',
          url: 'https://example.test/customer'
        },
        {
          source_id: 'business_snapshot_a',
          source_kind: 'business_api_snapshot',
          file: 'business-snapshot.json',
          endpoint: 'crm.project_status',
          record_id: 'acct_001',
          participants: ['user', 'crm']
        }
      ]
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const collection = buildReadOnlySourceCollection({
      manifest,
      manifestPath,
      root,
      outputDir
    });
    assert.equal(collection.schema_version, 'read_only_source_collection.v1');
    assert.equal(collection.gate_decision, 'read_only_source_collection_ready_for_trial');
    assert.equal(collection.real_execution_allowed, false);
    assert.equal(collection.real_send_attempted, false);
    assert.equal(collection.summary.collected_observations, 3);
    assert.equal(collection.summary.ready_for_read_only_trial, true);
    assert.deepEqual(collection.warning_failures, []);
    assert.equal(collection.observations.every((item) => item.ready_for_intake), true);
    assert.equal(collection.observations.every((item) => item.real_send_attempted === false), true);
    assert.ok(collection.next_commands.some((item) => item.includes('intake:read-only:trial')));

    const written = writeReadOnlySourceCollection({
      collection,
      outputDir,
      manifest
    });
    assert.equal(existsSync(written.json_path), true);
    assert.equal(existsSync(written.markdown_path), true);
    assert.equal(existsSync(written.manifest_snapshot_path), true);

    const result = spawnSync(process.execPath, [
      path.resolve('scripts/capture-read-only-source-collection.mjs'),
      `--root=${root}`,
      '--manifest=read-only-source-manifest.json',
      `--output-dir=${path.join(root, 'runtime/read-only-source-collections/collection-cli')}`,
      '--run-trial',
      '--pilot-import=runtime/user-inputs/pilot-import.real.json',
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'capture-read-only-source-collection');
    assert.equal(stdout.collected_observations, 3);
    assert.equal(stdout.ready_for_read_only_trial, true);
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(stdout.observation_paths.length, 3);
    assert.equal(stdout.downstream_trial.requested, true);
    assert.equal(stdout.downstream_trial.skipped, false);
    assert.equal(stdout.downstream_trial.gate_decision, 'read_only_expansion_trial_ready_for_feedback_collection');
    assert.equal(stdout.downstream_trial.real_send_attempted, false);
    assert.ok(stdout.downstream_trial.generated_pilot_import_path.endsWith('pilot-import.generated.json'));
    assert.ok(existsSync(path.join(root, 'runtime/read-only-source-collections/collection-cli/trial/pilot-import.generated.json')));
    const cliReport = JSON.parse(readFileSync(path.join(root, 'runtime/read-only-source-collections/collection-cli/read-only-source-collection.json'), 'utf8'));
    assert.equal(cliReport.downstream_trial.generated_pilot_import_ready_for_decision, true);
    assert.equal(cliReport.downstream_trial.generated_pilot_import_ready_for_closed_loop_mvp, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validates source adapter conformance before future sources enter intake', () => {
  const root = tempRoot();
  try {
    const capability = fixture('source-adapter-capability.sample.json');
    const observation = fixture('intake-observation.sightflow.sample.json');
    const conformance = validateSourceAdapterConformance({
      capability,
      observation,
      capabilityPath: 'examples/source-adapter-capability.sample.json',
      observationPath: 'examples/intake-observation.sightflow.sample.json'
    });
    const written = writeSourceAdapterConformance({
      conformance,
      outputDir: path.join(root, 'adapter-conformance')
    });

    assert.equal(conformance.schema_version, 'source_adapter_conformance.v1');
    assert.equal(conformance.ready_for_intake, true);
    assert.equal(conformance.required_failures.length, 0);
    assert.equal(conformance.raw_event_preview.source, 'desktop:sightflow_desktop.wechat:wechat');
    assert.equal(existsSync(written.json_path), true);

    const mismatch = validateSourceAdapterConformance({
      capability: {
        ...capability,
        adapter_id: 'different.adapter'
      },
      observation
    });
    assert.equal(mismatch.ready_for_intake, false);
    assert.ok(mismatch.required_failures.includes('adapter_id_mismatch'));

    const browserConformance = validateSourceAdapterConformance({
      capability: fixture('source-adapter-capability.browser.sample.json'),
      observation: fixture('intake-observation.browser.sample.json'),
      capabilityPath: 'examples/source-adapter-capability.browser.sample.json',
      observationPath: 'examples/intake-observation.browser.sample.json'
    });
    assert.equal(browserConformance.ready_for_intake, true);
    assert.equal(browserConformance.required_failures.length, 0);
    assert.equal(browserConformance.raw_event_preview.event_kind, 'web_observation');
    assert.equal(browserConformance.raw_event_preview.source, 'browser:browser_dom.sample:web');

    const externalChatConformance = validateSourceAdapterConformance({
      capability: fixture('source-adapter-capability.external-chat-export.sample.json'),
      observation: fixture('intake-observation.external-chat-export.sample.json'),
      capabilityPath: 'examples/source-adapter-capability.external-chat-export.sample.json',
      observationPath: 'examples/intake-observation.external-chat-export.sample.json'
    });
    assert.equal(externalChatConformance.ready_for_intake, true);
    assert.equal(externalChatConformance.required_failures.length, 0);
    assert.equal(externalChatConformance.raw_event_preview.event_kind, 'imported_record');
    assert.equal(externalChatConformance.raw_event_preview.source, 'file:external_chat_export.sample:external_chat_export');

    const businessApiConformance = validateSourceAdapterConformance({
      capability: fixture('source-adapter-capability.business-api.sample.json'),
      observation: fixture('intake-observation.business-api.sample.json'),
      capabilityPath: 'examples/source-adapter-capability.business-api.sample.json',
      observationPath: 'examples/intake-observation.business-api.sample.json'
    });
    assert.equal(businessApiConformance.ready_for_intake, true);
    assert.equal(businessApiConformance.required_failures.length, 0);
    assert.equal(businessApiConformance.raw_event_preview.source, 'api:business_api.sample:business_system');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adapter conformance CLI writes reusable future-source validation evidence', () => {
  const root = tempRoot();
  try {
    const scriptPath = path.resolve('scripts/validate-source-adapter-conformance.mjs');
    const outputDir = path.join(root, 'source-adapter-conformance');
    const result = spawnSync(process.execPath, [
      scriptPath,
      '--capability=examples/source-adapter-capability.sample.json',
      '--observation=examples/intake-observation.sightflow.sample.json',
      `--output-dir=${outputDir}`,
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0);
    const report = JSON.parse(readFileSync(path.join(outputDir, 'source-adapter-conformance.json'), 'utf8'));
    assert.equal(report.gate_decision, 'source_adapter_conformant');
    assert.equal(report.ready_for_intake, true);
    assert.equal(report.required_failures.length, 0);

    const browserOutputDir = path.join(root, 'source-adapter-conformance-browser');
    const browser = spawnSync(process.execPath, [
      scriptPath,
      '--capability=examples/source-adapter-capability.browser.sample.json',
      '--observation=examples/intake-observation.browser.sample.json',
      `--output-dir=${browserOutputDir}`,
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(browser.status, 0);
    const browserReport = JSON.parse(readFileSync(path.join(browserOutputDir, 'source-adapter-conformance.json'), 'utf8'));
    assert.equal(browserReport.gate_decision, 'source_adapter_conformant');
    assert.equal(browserReport.raw_event_preview.event_kind, 'web_observation');

    const externalChatOutputDir = path.join(root, 'source-adapter-conformance-external-chat');
    const externalChat = spawnSync(process.execPath, [
      scriptPath,
      '--capability=examples/source-adapter-capability.external-chat-export.sample.json',
      '--observation=examples/intake-observation.external-chat-export.sample.json',
      `--output-dir=${externalChatOutputDir}`,
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(externalChat.status, 0);
    const externalChatReport = JSON.parse(readFileSync(path.join(externalChatOutputDir, 'source-adapter-conformance.json'), 'utf8'));
    assert.equal(externalChatReport.gate_decision, 'source_adapter_conformant');
    assert.equal(externalChatReport.raw_event_preview.event_kind, 'imported_record');

    const businessApiOutputDir = path.join(root, 'source-adapter-conformance-business-api');
    const businessApi = spawnSync(process.execPath, [
      scriptPath,
      '--capability=examples/source-adapter-capability.business-api.sample.json',
      '--observation=examples/intake-observation.business-api.sample.json',
      `--output-dir=${businessApiOutputDir}`,
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(businessApi.status, 0);
    const businessApiReport = JSON.parse(readFileSync(path.join(businessApiOutputDir, 'source-adapter-conformance.json'), 'utf8'));
    assert.equal(businessApiReport.gate_decision, 'source_adapter_conformant');
    assert.equal(businessApiReport.raw_event_preview.source, 'api:business_api.sample:business_system');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('source intake matrix summarizes reusable lanes without treating missing real samples as complete', () => {
  const root = tempRoot();
  try {
    [
      'source-adapter-capability.sample.json',
      'intake-observation.sightflow.sample.json',
      'source-adapter-capability.browser.sample.json',
      'intake-observation.browser.sample.json',
      'source-adapter-capability.external-chat-export.sample.json',
      'intake-observation.external-chat-export.sample.json',
      'source-adapter-capability.business-api.sample.json',
      'intake-observation.business-api.sample.json'
    ].forEach((name) => {
      writeJson(path.join(root, 'examples', name), fixture(name));
    });

    const htmlPath = path.join(root, 'runtime/user-inputs/page.real.html');
    mkdirSync(path.dirname(htmlPath), { recursive: true });
    writeFileSync(htmlPath, '<html><head><title>Portal</title></head><body><p>Customer review waits for whitelist evidence.</p></body></html>', 'utf8');
    const browserWritten = writeBrowserHtmlObservation({
      htmlPath,
      root,
      outputDir: path.join(root, 'runtime/browser-intake-real/portal'),
      adapterId: 'browser_dom.next',
      pageUrl: 'https://example.test/portal'
    });
    writeJson(path.join(root, 'runtime/read-only-expansion-trials/latest/pilot-import.generated.json'), {
      schema_version: 'pilot_import_batch.v1',
      import_id: 'generated_from_browser_sample',
      created_at: '2026-06-16T00:00:00.000Z',
      source: { kind: 'test' },
      scenario: { initial_goal: 'verify source intake matrix' },
      people: [],
      relationships: [],
      records: [
        {
          record_id: 'record_browser_001',
          source_ref: {
            source_type: 'browser',
            platform: 'web'
          }
        }
      ],
      feedback_records: []
    });

    const matrix = buildSourceIntakeMatrix({ root });
    assert.equal(matrix.schema_version, 'source_intake_matrix.v1');
    assert.equal(matrix.gate_decision, 'source_intake_matrix_ready_waiting_real_samples');
    assert.equal(matrix.summary.conformance_ready_lanes, 4);
    assert.equal(matrix.summary.lanes_with_real_samples, 1);
    assert.equal(matrix.summary.required_goal_lanes_with_real_samples, 1);
    assert.equal(matrix.summary.ready_for_new_adapter_without_main_flow_change, true);
    assert.equal(matrix.required_failures.length, 0);
    assert.ok(matrix.warning_failures.includes('required_goal_lanes_have_real_read_only_samples'));
    assert.ok(matrix.warning_failures.includes('external_chat_export:lane_real_observation_missing'));
    assert.ok(matrix.warning_failures.includes('business_system_api:lane_real_observation_missing'));

    const browserLane = matrix.lanes.find((lane) => lane.lane_id === 'browser_web');
    assert.equal(browserLane.observations.effective_observation_count, 1);
    assert.equal(browserLane.observations.raw_event_mapped_count, 1);
    assert.equal(browserLane.latest_generated_pilot_import.matching_records, 1);
    assert.equal(browserLane.observations.real_send_attempted, false);
    assert.equal(browserLane.observations.observations[0].path, path.relative(root, browserWritten.observation_path).replaceAll(path.sep, '/'));

    const written = writeSourceIntakeMatrix({
      matrix,
      outputDir: path.join(root, 'runtime/source-intake-matrix/test')
    });
    assert.equal(existsSync(written.json_path), true);
    assert.equal(existsSync(written.markdown_path), true);

    const scriptResult = spawnSync(process.execPath, [
      path.resolve('scripts/write-source-intake-matrix.mjs'),
      `--root=${root}`,
      '--output-dir=runtime/source-intake-matrix/cli',
      '--fail-on-required'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    assert.equal(scriptResult.status, 0, scriptResult.stderr);
    const cliReport = JSON.parse(readFileSync(path.join(root, 'runtime/source-intake-matrix/cli/source-intake-matrix.json'), 'utf8'));
    assert.equal(cliReport.summary.ready_for_new_adapter_without_main_flow_change, true);
    assert.equal(cliReport.required_failures.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('source adapter init kit writes safe templates for future software intake', () => {
  const root = tempRoot();
  try {
    const kit = buildSourceAdapterInitKit({
      adapterId: 'browser_dom.next',
      sourceType: 'browser',
      platform: 'web',
      canSend: false
    });
    const { kit: report, written } = writeSourceAdapterInitKit({
      kit,
      outputDir: path.join(root, 'source-adapter-kit')
    });

    assert.equal(report.schema_version, 'source_adapter_init_kit.v1');
    assert.equal(report.safety_defaults.real_execution_default, false);
    assert.equal(report.safety_defaults.observation_real_execution_allowed, false);
    assert.equal(report.template_payloads.capability.capabilities.can_read_dom, true);
    assert.equal(report.template_payloads.capability.capabilities.can_send, false);
    assert.equal(existsSync(written.capability_template_path), true);
    assert.equal(existsSync(written.observation_template_path), true);
    assert.ok(report.validation_command.includes('intake:adapter:validate'));

    const conformance = validateSourceAdapterConformance({
      capability: JSON.parse(readFileSync(written.capability_template_path, 'utf8')),
      observation: JSON.parse(readFileSync(written.observation_template_path, 'utf8'))
    });
    assert.equal(conformance.ready_for_intake, true);
    assert.equal(conformance.raw_event_preview.event_kind, 'web_observation');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('source adapter init CLI creates send-capable templates that still default to blocked real execution', () => {
  const root = tempRoot();
  try {
    const scriptPath = path.resolve('scripts/init-source-adapter-kit.mjs');
    const outputDir = path.join(root, 'api-adapter-kit');
    const result = spawnSync(process.execPath, [
      scriptPath,
      '--adapter-id=crm_api.next',
      '--source-type=api',
      '--platform=crm',
      '--can-send',
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(path.join(outputDir, 'source-adapter-init-kit.json'), 'utf8'));
    const capability = JSON.parse(readFileSync(report.capability_template_path, 'utf8'));
    const observation = JSON.parse(readFileSync(report.observation_template_path, 'utf8'));

    assert.equal(report.can_send_requested, true);
    assert.equal(capability.capabilities.can_send, true);
    assert.equal(capability.capabilities.requires_user_confirmation, true);
    assert.equal(capability.metadata.real_execution_default, false);
    assert.equal(observation.metadata.real_execution_allowed, false);

    const conformance = validateSourceAdapterConformance({ capability, observation });
    assert.equal(conformance.ready_for_intake, true);
    assert.equal(conformance.required_failures.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects incomplete intake observations before RawEvent mapping', () => {
  const observation = fixture('intake-observation.sightflow.sample.json');
  delete observation.content_summary;

  assert.throws(
    () => normalizeIntakeObservation(observation),
    /content_summary/
  );
});

test('appends observation as RawEvent through storage-runtime audit path', () => {
  const root = tempRoot();
  try {
    const storage = initializeStorage({ root });
    const observation = fixture('intake-observation.sightflow.sample.json');
    const rawEvent = appendObservationAsRawEvent(storage, observation, {
      actor: 'intake_test'
    });
    const snapshot = loadStorageSnapshot(storage);

    assert.equal(rawEvent.event_id, observation.observation_id);
    assert.equal(snapshot.raw_events.length, 1);
    assert.equal(snapshot.raw_events[0].source, 'desktop:sightflow_desktop.wechat:wechat');
    assert.ok(snapshot.audit_records.some((record) =>
      record.action === 'append_raw_event'
      && record.actor === 'intake_test'
      && record.entity_id === observation.observation_id
    ));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validates outbound send commands and blocks dry-run execution by default', () => {
  const command = fixture('outbound-send-command.sample.json');
  const normalized = normalizeOutboundSendCommand(command);
  const evaluation = evaluateSendCommandForExecution(command);
  const result = runSendCommandDryRun(command);

  assert.equal(normalized.send_command_id, 'send_command_sightflow_001');
  assert.equal(evaluation.allowed, false);
  assert.ok(evaluation.blocked_reasons.includes('real_execution_not_allowed'));
  assert.ok(evaluation.blocked_reasons.includes('user_confirmation_missing'));
  assert.ok(evaluation.blocked_reasons.includes('permission_not_granted'));
  assert.equal(result.status, 'blocked');
  assert.equal(result.metadata.real_send_attempted, false);
});

test('dry-run previews only when all real-send gates are satisfied', () => {
  const command = fixture('outbound-send-command.sample.json');
  command.user_confirmed = true;
  command.real_execution_allowed = true;
  command.safety_checks.permission_granted = true;

  const result = runSendCommandDryRun(command);

  assert.equal(result.status, 'previewed');
  assert.equal(result.target_verification.dry_run, true);
  assert.equal(result.metadata.real_send_attempted, false);
});

test('controlled send trial preparation writes template and readiness evidence without sending', () => {
  const root = tempRoot();
  try {
    const scriptPath = path.resolve('scripts/prepare-controlled-send-trial.mjs');
    const missingInput = path.join(root, 'runtime/user-inputs/controlled-send-command.real.json');
    const missingOutput = path.join(root, 'missing-report');
    const missing = spawnSync(process.execPath, [
      scriptPath,
      `--input=${missingInput}`,
      `--output-dir=${missingOutput}`
    ], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(missing.status, 0);
    const missingReport = JSON.parse(readFileSync(path.join(missingOutput, 'desktop-controlled-send-trial.json'), 'utf8'));
    assert.equal(missingReport.gate_decision, 'controlled_send_waiting_for_command');
    assert.equal(missingReport.ready_for_real_controlled_send, false);
    assert.equal(missingReport.real_send_attempted, false);
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/templates/controlled-send-command.real.template.json')), true);
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/templates/controlled-send-box-regions.real.template.json')), true);
    assert.equal(missingReport.box_regions_ready, false);
    assert.ok(missingReport.box_regions_failures.includes('controlled_send_box_regions_missing'));
    assert.ok(missingReport.handoff.runner_command_with_box_regions.includes('dev:test-controlled-send-real'));
    assert.ok(missingReport.handoff.completion_command.includes('desktop:send:complete-controlled'));
    assert.ok(missingReport.handoff.audit_command.includes('desktop:intake:audit'));
    assert.equal(missingReport.handoff.runner_environment_contract.contract_version, 'controlled_send_runner_environment.v1');
    assert.equal(missingReport.handoff.runner_environment_contract.ready_for_runner, false);
    assert.equal(missingReport.handoff.runner_environment_contract.required_env.ALLOW_REAL_CONTROLLED_SEND, 'true');
    assert.equal(missingReport.handoff.runner_environment_contract.recognition_mode_policy.exactly_one_required, true);
    assert.ok(missingReport.handoff.runner_environment_contract.command_snapshot_required_fields.includes('message_draft_sha256'));

    const command = fixture('outbound-send-command.sample.json');
    command.user_confirmed = true;
    command.real_execution_allowed = true;
    command.safety_checks.window_matches = true;
    command.safety_checks.thread_matches = true;
    command.safety_checks.draft_matches = true;
    command.safety_checks.permission_granted = true;
    command.metadata = {
      controlled_send_scope: 'test_account_or_test_window',
      no_production_contact: true,
      operator_confirmation: 'confirmed_for_controlled_send',
      operator_confirmed_at: '2026-06-10T09:30:00+08:00'
    };
    const readyInput = path.join(root, 'controlled-send-command.ready.json');
    const boxRegionsInput = path.join(root, 'controlled-send-box-regions.ready.json');
    const readyOutput = path.join(root, 'ready-report');
    writeFileSync(readyInput, `${JSON.stringify(command, null, 2)}\n`, 'utf8');
    writeFileSync(boxRegionsInput, `${JSON.stringify({
      contactList: { x: 10, y: 20, width: 180, height: 700 },
      chatMain: { x: 210, y: 20, width: 760, height: 650 },
      inputBox: { x: 210, y: 690, width: 760, height: 120 },
      unreadIndicator: null,
      displayId: 1,
      scaleFactor: 1,
      capturedAt: Date.now()
    }, null, 2)}\n`, 'utf8');

    const ready = spawnSync(process.execPath, [
      scriptPath,
      `--input=${readyInput}`,
      `--box-regions=${boxRegionsInput}`,
      `--output-dir=${readyOutput}`,
      '--require-box-regions',
      '--fail-on-not-ready'
    ], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(ready.status, 0);
    const readyReport = JSON.parse(readFileSync(path.join(readyOutput, 'desktop-controlled-send-trial.json'), 'utf8'));
    assert.equal(readyReport.gate_decision, 'controlled_send_ready_for_test_window');
    assert.equal(readyReport.ready_for_real_controlled_send, true);
    assert.equal(readyReport.real_send_attempted, false);
    assert.equal(readyReport.box_regions_ready, true);
    assert.equal(readyReport.box_regions_required, true);
    assert.deepEqual(readyReport.box_regions_required_failures, []);
    assert.equal(readyReport.handoff.command_path, readyInput);
    assert.equal(readyReport.handoff.box_regions_path, boxRegionsInput);
    assert.ok(readyReport.handoff.result_path.endsWith('sightflow-real-controlled-send-result.json'));
    assert.equal(readyReport.handoff.runner_environment_contract.ready_for_runner, true);
    assert.equal(readyReport.handoff.runner_environment_contract.required_env.CONTROLLED_SEND_COMMAND_PATH, readyInput);
    assert.equal(readyReport.handoff.runner_environment_contract.required_env.CONTROLLED_SEND_READINESS_PATH, path.join(readyOutput, 'desktop-controlled-send-trial.json'));
    assert.equal(readyReport.handoff.runner_environment_contract.required_env.CONTROLLED_SEND_RESULT_PATH, readyReport.handoff.result_path);
    assert.deepEqual(
      readyReport.handoff.runner_environment_contract.recognition_mode_policy.forbidden_combination,
      ['CONTROLLED_SEND_BOX_REGIONS_PATH', 'CONTROLLED_SEND_VISION_API_KEY']
    );
    assert.equal(readyReport.command.message_draft_sha256, hashText(command.message_draft));
    assert.equal(readyReport.dry_run_send_result.status, 'previewed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controlled send material kit writes operator templates without sending', () => {
  const root = tempRoot();
  try {
    const kit = buildControlledSendMaterialKit({
      root,
      commandTargetPath: path.join(root, 'runtime/user-inputs/controlled-send-command.real.json'),
      boxRegionsTargetPath: path.join(root, 'runtime/user-inputs/controlled-send-box-regions.real.json'),
      outputDir: path.join(root, 'material-kit'),
      createdAt: '2026-06-10T09:30:00+08:00'
    });
    assert.equal(kit.schema_version, 'controlled_send_material_kit.v1');
    assert.equal(kit.gate_decision, 'controlled_send_materials_ready_for_operator_fill');
    assert.equal(kit.real_send_attempted, false);
    assert.equal(kit.command_template.user_confirmed, false);
    assert.equal(kit.command_template.real_execution_allowed, false);
    assert.ok(kit.operator_checklist.some((item) => item.includes('desktop:send:complete-controlled')));
    assert.ok(kit.operator_checklist.some((item) => item.includes('desktop:send:readiness')));
    assert.ok(kit.next_commands.command_check_with_box_regions.includes('desktop:send:command:check'));
    assert.ok(kit.next_commands.readiness_with_box_regions.includes('desktop:send:readiness'));
    assert.ok(kit.next_commands.readiness_with_box_regions.includes('--require-box-regions'));
    assert.ok(kit.next_commands.prepare_with_box_regions.includes('desktop:send:prepare-controlled'));

    const written = writeControlledSendMaterialKit({ kit });
    assert.equal(existsSync(written.json_path), true);
    assert.equal(existsSync(written.markdown_path), true);
    assert.equal(existsSync(written.command_template_path), true);
    assert.equal(existsSync(written.box_regions_template_path), true);
    assert.equal(existsSync(written.user_input_command_template_path), true);
    assert.equal(existsSync(written.user_input_box_regions_template_path), true);
    assert.equal(existsSync(written.operator_checklist_path), true);

    const persisted = JSON.parse(readFileSync(written.json_path, 'utf8'));
    assert.equal(persisted.real_send_attempted, false);
    assert.equal(persisted.command_template.metadata.no_production_contact, false);
    assert.equal(persisted.box_regions_template.contactList.width, 0);
    const userInputTemplate = JSON.parse(readFileSync(written.user_input_command_template_path, 'utf8'));
    assert.equal(userInputTemplate.real_execution_allowed, false);
    assert.equal(userInputTemplate.user_confirmed, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controlled send material kit CLI writes reusable handoff materials', () => {
  const root = tempRoot();
  try {
    const scriptPath = path.resolve('scripts/init-controlled-send-material-kit.mjs');
    const outputDir = path.join(root, 'material-kit-cli');
    const result = spawnSync(process.execPath, [
      scriptPath,
      `--command-target=${path.join(root, 'runtime/user-inputs/controlled-send-command.real.json')}`,
      `--box-regions-target=${path.join(root, 'runtime/user-inputs/controlled-send-box-regions.real.json')}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('init-controlled-send-material-kit'));
    const stdout = JSON.parse(result.stdout);
    assert.ok(stdout.next_readiness_with_box_regions.includes('desktop:send:readiness'));
    const kitPath = path.join(outputDir, 'controlled-send-material-kit.json');
    const kit = JSON.parse(readFileSync(kitPath, 'utf8'));
    assert.equal(kit.real_send_attempted, false);
    assert.ok(kit.next_commands.command_check_with_box_regions.includes('--require-box-regions'));
    assert.ok(kit.next_commands.readiness_with_box_regions.includes('desktop:send:readiness'));
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/templates/controlled-send-command.real.template.json')), true);
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/templates/controlled-send-box-regions.real.template.json')), true);
    assert.equal(existsSync(path.join(outputDir, 'operator-checklist.md')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controlled send real-window readiness aggregates current blockers without sending', () => {
  const root = tempRoot();
  try {
    const commandTargetPath = path.join(root, 'runtime/user-inputs/controlled-send-command.real.json');
    const boxRegionsTargetPath = path.join(root, 'runtime/user-inputs/controlled-send-box-regions.real.json');
    const kit = buildControlledSendMaterialKit({
      root,
      commandTargetPath,
      boxRegionsTargetPath,
      outputDir: path.join(root, 'runtime/controlled-send-material-kits/kit_current'),
      createdAt: '2026-06-10T09:30:00+08:00'
    });
    writeControlledSendMaterialKit({ kit });

    const missing = buildControlledSendRealWindowReadiness({
      root,
      requireBoxRegions: true,
      createdAt: '2026-06-10T09:31:00+08:00'
    });
    assert.equal(missing.schema_version, 'controlled_send_real_window_readiness.v1');
    assert.equal(missing.gate_decision, 'real_window_command_missing');
    assert.equal(missing.real_send_attempted_by_readiness, false);
    assert.equal(missing.ready_for_prepare_controlled, false);
    assert.ok(missing.current_blockers.includes('controlled_send_command_missing'));
    assert.equal(missing.latest_controlled_send_material_kit.kit_id, kit.kit_id);
    assert.equal(missing.runner_environment_contract.contract_version, 'controlled_send_runner_environment.v1');
    assert.equal(missing.runner_environment_contract.ready_for_runner, false);
    assert.equal(missing.runner_environment_contract.required_env.ALLOW_REAL_CONTROLLED_SEND, 'true');
    assert.equal(missing.runner_environment_contract.required_env.CONTROLLED_SEND_COMMAND_PATH, commandTargetPath);
    assert.equal(missing.runner_environment_contract.required_env.CONTROLLED_SEND_READINESS_PATH, null);
    assert.equal(missing.runner_environment_contract.path_bindings.box_regions_path_must_equal, boxRegionsTargetPath);
    const writtenMissing = writeControlledSendRealWindowReadiness({
      readiness: missing,
      outputDir: path.join(root, 'readiness-missing')
    });
    assert.equal(existsSync(writtenMissing.json_path), true);
    assert.equal(existsSync(writtenMissing.markdown_path), true);

    const command = fixture('outbound-send-command.sample.json');
    command.user_confirmed = true;
    command.real_execution_allowed = true;
    command.safety_checks.window_matches = true;
    command.safety_checks.thread_matches = true;
    command.safety_checks.draft_matches = true;
    command.safety_checks.permission_granted = true;
    command.metadata = {
      controlled_send_scope: 'test_account_or_test_window',
      no_production_contact: true,
      operator_confirmation: 'confirmed_for_controlled_send',
      operator_confirmed_at: '2026-06-10T09:32:00+08:00'
    };
    mkdirSync(path.dirname(commandTargetPath), { recursive: true });
    writeFileSync(commandTargetPath, `${JSON.stringify(command, null, 2)}\n`, 'utf8');
    writeFileSync(boxRegionsTargetPath, `${JSON.stringify({
      contactList: { x: 10, y: 20, width: 180, height: 700 },
      chatMain: { x: 210, y: 20, width: 760, height: 650 },
      inputBox: { x: 210, y: 690, width: 760, height: 120 },
      unreadIndicator: null,
      displayId: 1,
      scaleFactor: 1,
      capturedAt: Date.now()
    }, null, 2)}\n`, 'utf8');

    const readyForPrepare = buildControlledSendRealWindowReadiness({
      root,
      requireBoxRegions: true,
      createdAt: '2026-06-10T09:33:00+08:00'
    });
    assert.equal(readyForPrepare.gate_decision, 'real_window_ready_for_prepare_controlled');
    assert.equal(readyForPrepare.ready_for_prepare_controlled, true);
    assert.equal(readyForPrepare.ready_for_real_runner, false);
    assert.ok(readyForPrepare.current_blockers.includes('controlled_send_prepare_controlled_pending'));
    assert.ok(readyForPrepare.next_commands.prepare_controlled.includes('desktop:send:prepare-controlled'));
    assert.equal(readyForPrepare.runner_environment_contract.ready_for_runner, false);
    assert.equal(readyForPrepare.runner_environment_contract.path_bindings.command_path_must_equal, commandTargetPath);
    assert.equal(readyForPrepare.runner_environment_contract.recognition_mode_policy.box_regions_expected_path, boxRegionsTargetPath);

    rmSync(commandTargetPath, { force: true });
    const staleTrialPath = path.join(root, 'runtime/desktop-controlled-send-trials/stale-ready/desktop-controlled-send-trial.json');
    mkdirSync(path.dirname(staleTrialPath), { recursive: true });
    writeFileSync(staleTrialPath, `${JSON.stringify({
      schema_version: 'desktop_controlled_send_trial.v1',
      trial_id: 'desktop_controlled_send_trial_stale_ready',
      created_at: '2026-06-10T09:34:00+08:00',
      gate_decision: 'controlled_send_ready_for_test_window',
      ready_for_real_controlled_send: true,
      real_send_attempted: false,
      required_failures: [],
      input_path: commandTargetPath,
      handoff: {
        command_path: commandTargetPath,
        readiness_path: staleTrialPath,
        result_path: path.join(root, 'runtime/user-inputs/controlled-send-result.real.json'),
        box_regions_path: boxRegionsTargetPath
      }
    }, null, 2)}\n`, 'utf8');
    const staleTrialMissingCommand = buildControlledSendRealWindowReadiness({
      root,
      requireBoxRegions: true,
      trialPath: staleTrialPath,
      createdAt: '2026-06-10T09:34:30+08:00'
    });
    assert.equal(staleTrialMissingCommand.gate_decision, 'real_window_command_missing');
    assert.equal(staleTrialMissingCommand.ready_for_real_runner, false);
    assert.equal(staleTrialMissingCommand.runner_environment_contract.ready_for_runner, false);
    assert.ok(staleTrialMissingCommand.current_blockers.includes('controlled_send_command_missing'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controlled send real-window readiness ignores simulation material kits unless explicit', () => {
  const root = tempRoot();
  try {
    const realKit = buildControlledSendMaterialKit({
      root,
      commandTargetPath: path.join(root, 'runtime/user-inputs/controlled-send-command.real.json'),
      boxRegionsTargetPath: path.join(root, 'runtime/user-inputs/controlled-send-box-regions.real.json'),
      outputDir: path.join(root, 'runtime/controlled-send-material-kits/kit_real'),
      createdAt: '2026-06-10T09:59:00+08:00'
    });
    writeControlledSendMaterialKit({ kit: realKit });

    const runId = 'controlled_send_simulation_fixture';
    const simulationDir = path.join(root, 'runtime/controlled-send-simulations', runId);
    const commandPath = path.join(simulationDir, 'controlled-send-command.simulated.json');
    const boxRegionsPath = path.join(simulationDir, 'controlled-send-box-regions.simulated.json');
    const kit = buildControlledSendMaterialKit({
      root,
      commandTargetPath: commandPath,
      boxRegionsTargetPath: boxRegionsPath,
      outputDir: path.join(root, 'runtime/controlled-send-material-kits', runId),
      createdAt: '2026-06-10T10:00:00+08:00'
    });
    const kitPaths = writeControlledSendMaterialKit({ kit });

    const command = fixture('outbound-send-command.sample.json');
    command.user_confirmed = true;
    command.real_execution_allowed = true;
    command.safety_checks.window_matches = true;
    command.safety_checks.thread_matches = true;
    command.safety_checks.draft_matches = true;
    command.safety_checks.permission_granted = true;
    command.metadata = {
      controlled_send_scope: 'test_account_or_test_window',
      no_production_contact: true,
      operator_confirmation: 'confirmed_for_controlled_send',
      operator_confirmed_at: '2026-06-10T10:01:00+08:00',
      verification_mode: 'simulated',
      simulation_only: true
    };
    mkdirSync(path.dirname(commandPath), { recursive: true });
    writeFileSync(commandPath, `${JSON.stringify(command, null, 2)}\n`, 'utf8');
    writeFileSync(boxRegionsPath, `${JSON.stringify({
      contactList: { x: 10, y: 20, width: 180, height: 700 },
      chatMain: { x: 210, y: 20, width: 760, height: 650 },
      inputBox: { x: 210, y: 690, width: 760, height: 120 },
      unreadIndicator: null,
      displayId: 1,
      scaleFactor: 1,
      capturedAt: Date.parse('2026-06-10T10:01:00+08:00')
    }, null, 2)}\n`, 'utf8');

    const trialPath = path.join(root, 'runtime/desktop-controlled-send-trials', runId, 'desktop-controlled-send-trial.json');
    mkdirSync(path.dirname(trialPath), { recursive: true });
    writeFileSync(trialPath, `${JSON.stringify({
      schema_version: 'desktop_controlled_send_trial.v1',
      trial_id: 'desktop_controlled_send_trial_simulation_fixture',
      created_at: '2026-06-10T10:02:00+08:00',
      gate_decision: 'controlled_send_ready_for_test_window',
      ready_for_real_controlled_send: true,
      real_send_attempted: false,
      required_failures: [],
      input_path: commandPath,
      handoff: {
        command_path: commandPath,
        readiness_path: trialPath,
        result_path: path.join(simulationDir, 'sightflow-real-controlled-send-result.json'),
        box_regions_path: boxRegionsPath
      }
    }, null, 2)}\n`, 'utf8');

    const defaultReadiness = buildControlledSendRealWindowReadiness({
      root,
      requireBoxRegions: true,
      createdAt: '2026-06-10T10:03:00+08:00'
    });
    assert.equal(defaultReadiness.ready_for_real_runner, false);
    assert.equal(defaultReadiness.latest_controlled_send_material_kit.kit_id, realKit.kit_id);
    assert.equal(defaultReadiness.current_blockers.includes('controlled_send_material_kit_missing'), false);
    assert.ok(defaultReadiness.current_blockers.includes('controlled_send_command_missing'));
    assert.equal(defaultReadiness.current_blockers.includes('sightflow_real_runner_result_pending'), false);
    assert.equal(defaultReadiness.latest_controlled_send_trial, null);

    const explicitSimulationReadiness = buildControlledSendRealWindowReadiness({
      root,
      commandPath,
      boxRegionsPath,
      materialKitPath: kitPaths.json_path,
      trialPath,
      requireBoxRegions: true,
      createdAt: '2026-06-10T10:04:00+08:00'
    });
    assert.equal(explicitSimulationReadiness.ready_for_real_runner, true);
    assert.equal(explicitSimulationReadiness.latest_controlled_send_material_kit.kit_id, kit.kit_id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controlled send real-window readiness CLI writes current readiness evidence', () => {
  const root = tempRoot();
  try {
    const scriptPath = path.resolve('scripts/check-controlled-send-real-window-readiness.mjs');
    const outputDir = path.join(root, 'readiness-cli');
    const result = spawnSync(process.execPath, [
      scriptPath,
      `--output-dir=${outputDir}`
    ], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'check-controlled-send-real-window-readiness');
    assert.equal(stdout.real_send_attempted_by_readiness, false);
    assert.equal(existsSync(path.join(outputDir, 'controlled-send-real-window-readiness.json')), true);
    assert.ok([
      'real_window_material_kit_missing',
      'real_window_command_missing',
      'real_window_material_needs_attention'
    ].includes(stdout.gate_decision));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controlled send command draft uses MVP draft without enabling real send', () => {
  const root = tempRoot();
  try {
    const pilotImport = {
      import_id: 'pilot_import_test',
      scenario: {
        channel: 'wechat_desktop',
        target_person_ids: ['person_test_contact']
      },
      people: [
        {
          person_id: 'person_test_contact',
          display_name: '测试联系人'
        }
      ]
    };
    const mvpLoopResult = {
      workflow: 'mvp_loop_from_pilot_import',
      import_id: 'pilot_import_test',
      run_id: 'run_test',
      decision_id: 'decision_test',
      trigger_id: 'trigger_test',
      message_draft: {
        channel: 'wechat',
        target_person_id: 'person_test_contact',
        target_display_name: '测试联系人',
        draft: '测试联系人，我先把下一步整理成一版，您方便时确认是否合适？'
      }
    };
    const targetCommandPath = path.join(root, 'runtime/user-inputs/controlled-send-command.real.json');
    const draft = buildControlledSendCommandDraft({
      root,
      pilotImport,
      mvpLoopResult,
      targetCommandPath,
      createdAt: '2026-06-17T12:00:00.000Z'
    });
    const written = writeControlledSendCommandDraft({ draft });

    assert.equal(draft.schema_version, 'controlled_send_command_draft.v1');
    assert.equal(draft.gate_decision, 'controlled_send_command_draft_waiting_operator_confirmation');
    assert.equal(draft.real_send_attempted, false);
    assert.equal(draft.command.user_confirmed, false);
    assert.equal(draft.command.real_execution_allowed, false);
    assert.equal(draft.command.metadata.no_production_contact, false);
    assert.equal(draft.command.metadata.operator_confirmation, 'pending');
    assert.equal(draft.command.target_thread_hint.conversation_title, 'replace_with_exact_test_window_title');
    assert.equal(existsSync(written.command_draft_path), true);
    assert.equal(existsSync(written.json_path), true);
    assert.equal(existsSync(written.markdown_path), true);
    assert.equal(existsSync(targetCommandPath), false);

    const draftPreflight = buildControlledSendCommandPreflight({
      root,
      commandPath: written.command_draft_path
    });
    assert.equal(draftPreflight.ready_for_prepare_controlled, false);
    assert.ok(draftPreflight.required_failures.includes('controlled_send_command_has_template_placeholders'));
    assert.ok(draftPreflight.required_failures.includes('real_execution_not_allowed'));
    assert.ok(draftPreflight.required_failures.includes('user_confirmation_missing'));
    assert.ok(draftPreflight.required_failures.includes('metadata.no_production_contact_must_be_true'));
    assert.ok(draftPreflight.required_failures.includes('metadata.operator_confirmation_missing'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controlled send command confirmation writes real command only after reviewed decision', () => {
  const root = tempRoot();
  try {
    const pilotImport = {
      import_id: 'pilot_import_test',
      scenario: {
        channel: 'wechat_desktop',
        target_person_ids: ['person_test_contact']
      },
      people: [
        {
          person_id: 'person_test_contact',
          display_name: '测试联系人'
        }
      ]
    };
    const mvpLoopResult = {
      workflow: 'mvp_loop_from_pilot_import',
      import_id: 'pilot_import_test',
      run_id: 'run_test',
      decision_id: 'decision_test',
      trigger_id: 'trigger_test',
      message_draft: {
        channel: 'wechat',
        target_person_id: 'person_test_contact',
        target_display_name: '测试联系人',
        draft: '测试联系人，我先把下一步整理成一版，您方便时确认是否合适？'
      }
    };
    const targetCommandPath = path.join(root, 'runtime/user-inputs/controlled-send-command.real.json');
    const draft = buildControlledSendCommandDraft({
      root,
      pilotImport,
      mvpLoopResult,
      targetCommandPath,
      createdAt: '2026-06-17T12:00:00.000Z'
    });
    const draftWritten = writeControlledSendCommandDraft({ draft });

    const templateConfirmation = buildControlledSendCommandConfirmation({
      root,
      draftPath: draftWritten.json_path,
      targetCommandPath,
      createdAt: '2026-06-17T12:01:00.000Z'
    });
    const templateWritten = writeControlledSendCommandConfirmation({ confirmation: templateConfirmation });
    assert.equal(templateConfirmation.gate_decision, 'controlled_send_command_confirmation_template_written');
    assert.equal(templateConfirmation.target_written, false);
    assert.ok(templateConfirmation.required_failures.includes('confirmation_decision_missing'));
    assert.equal(existsSync(templateWritten.decision_template_path), true);
    assert.equal(
      templateConfirmation.reviewed_decision_target_path,
      path.join(root, 'runtime/user-inputs/controlled-send-command-confirmation-decision.real.json')
    );
    assert.equal(
      templateConfirmation.user_input_decision_template_path,
      path.join(root, 'runtime/user-inputs/templates/controlled-send-command-confirmation-decision.real.template.json')
    );
    assert.equal(existsSync(templateWritten.user_input_decision_template_path), true);
    assert.equal(existsSync(targetCommandPath), false);

    const missingDecisionPath = path.join(root, 'runtime/user-inputs/controlled-send-command-confirmation-decision.real.json');
    const missingDecisionConfirmation = buildControlledSendCommandConfirmation({
      root,
      draftPath: draftWritten.json_path,
      decisionPath: missingDecisionPath,
      targetCommandPath,
      validateOnly: true,
      createdAt: '2026-06-17T12:02:00.000Z'
    });
    const missingDecisionWritten = writeControlledSendCommandConfirmation({ confirmation: missingDecisionConfirmation });
    assert.equal(missingDecisionConfirmation.gate_decision, 'controlled_send_command_confirmation_needs_attention');
    assert.equal(missingDecisionConfirmation.validate_only, true);
    assert.equal(missingDecisionConfirmation.would_write_target, false);
    assert.equal(missingDecisionConfirmation.target_written, false);
    assert.equal(missingDecisionConfirmation.source.decision_path, missingDecisionPath);
    assert.ok(missingDecisionConfirmation.required_failures.includes('confirmation_decision_missing'));
    assert.equal(existsSync(missingDecisionWritten.target_command_path), false);

    const cliMissingDecision = spawnSync(process.execPath, [
      path.resolve('scripts/confirm-controlled-send-command.mjs'),
      `--draft=${draftWritten.json_path}`,
      `--decision=${missingDecisionPath}`,
      '--validate-only'
    ], {
      cwd: root,
      encoding: 'utf8'
    });
    assert.equal(cliMissingDecision.status, 0, cliMissingDecision.stderr);
    const cliMissingDecisionStdout = JSON.parse(cliMissingDecision.stdout);
    assert.equal(cliMissingDecisionStdout.gate_decision, 'controlled_send_command_confirmation_needs_attention');
    assert.equal(cliMissingDecisionStdout.target_written, false);
    assert.ok(cliMissingDecisionStdout.required_failures.includes('confirmation_decision_missing'));
    assert.equal(existsSync(cliMissingDecisionStdout.target_command_path), false);

    const decisionPath = path.join(root, 'reviewed-controlled-send-decision.json');
    writeJson(decisionPath, {
      schema_version: 'controlled_send_command_confirmation_decision.v1',
      draft_id: draft.draft_id,
      decision: 'approve_for_controlled_test_window',
      operator_id: 'operator_test',
      operator_confirmed_at: '2026-06-17T12:05:00.000Z',
      test_window: {
        conversation_title: '微信测试窗口',
        target_display_name: '测试联系人',
        platform_handle: 'wechat-test-window'
      },
      confirmations: {
        no_production_contact: true,
        window_matches: true,
        thread_matches: true,
        draft_matches: true,
        permission_granted: true
      },
      evidence_refs: [draftWritten.command_draft_path],
      notes: ['unit-test reviewed decision']
    });

    const validateOnlyConfirmation = buildControlledSendCommandConfirmation({
      root,
      draftPath: draftWritten.json_path,
      decisionPath,
      targetCommandPath,
      validateOnly: true,
      createdAt: '2026-06-17T12:05:30.000Z'
    });
    const validateOnlyWritten = writeControlledSendCommandConfirmation({ confirmation: validateOnlyConfirmation });
    assert.equal(validateOnlyConfirmation.gate_decision, 'controlled_send_command_confirmation_validated_without_write');
    assert.equal(validateOnlyConfirmation.validate_only, true);
    assert.equal(validateOnlyConfirmation.would_write_target, true);
    assert.equal(validateOnlyConfirmation.target_written, false);
    assert.deepEqual(validateOnlyConfirmation.required_failures, []);
    assert.equal(existsSync(validateOnlyWritten.target_command_path), false);
    assert.equal(existsSync(validateOnlyWritten.reviewed_decision_target_path), false);

    const confirmed = buildControlledSendCommandConfirmation({
      root,
      draftPath: draftWritten.json_path,
      decisionPath,
      targetCommandPath,
      createdAt: '2026-06-17T12:06:00.000Z'
    });
    const confirmedWritten = writeControlledSendCommandConfirmation({ confirmation: confirmed });
    assert.equal(confirmed.gate_decision, 'controlled_send_command_confirmed_for_preflight');
    assert.equal(confirmed.target_written, true);
    assert.deepEqual(confirmed.required_failures, []);
    assert.equal(existsSync(confirmedWritten.target_command_path), true);

    const readyPreflight = buildControlledSendCommandPreflight({
      root,
      commandPath: targetCommandPath
    });
    assert.equal(readyPreflight.gate_decision, 'controlled_send_command_ready_for_prepare_controlled');
    assert.equal(readyPreflight.ready_for_prepare_controlled, true);
    assert.equal(readyPreflight.real_send_attempted, false);
    assert.deepEqual(readyPreflight.required_failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controlled send command preflight checks command material without sending', () => {
  const root = tempRoot();
  try {
    const missingPath = path.join(root, 'runtime/user-inputs/controlled-send-command.real.json');
    const missingPreflight = buildControlledSendCommandPreflight({
      root,
      commandPath: missingPath,
      boxRegionsPath: path.join(root, 'runtime/user-inputs/controlled-send-box-regions.real.json')
    });
    assert.equal(missingPreflight.schema_version, 'controlled_send_command_preflight.v1');
    assert.equal(missingPreflight.gate_decision, 'controlled_send_command_missing');
    assert.equal(missingPreflight.ready_for_prepare_controlled, false);
    assert.equal(missingPreflight.real_send_attempted, false);
    assert.ok(missingPreflight.required_failures.includes('controlled_send_command_missing'));
    const missingPaths = writeControlledSendCommandPreflight({
      preflight: missingPreflight,
      outputDir: path.join(root, 'preflight-missing')
    });
    assert.equal(existsSync(missingPaths.json_path), true);
    assert.equal(existsSync(missingPaths.markdown_path), true);

    const placeholderCommand = fixture('outbound-send-command.sample.json');
    placeholderCommand.send_command_id = 'send_command_controlled_real_template';
    placeholderCommand.event_id = 'replace_with_event_id';
    placeholderCommand.user_confirmed = true;
    placeholderCommand.real_execution_allowed = true;
    placeholderCommand.safety_checks.window_matches = true;
    placeholderCommand.safety_checks.thread_matches = true;
    placeholderCommand.safety_checks.draft_matches = true;
    placeholderCommand.safety_checks.permission_granted = true;
    placeholderCommand.metadata = {
      controlled_send_scope: 'test_account_or_test_window',
      no_production_contact: true,
      operator_confirmation: 'confirmed_for_controlled_send',
      operator_confirmed_at: '2026-06-10T09:30:00+08:00'
    };
    const placeholderPath = path.join(root, 'controlled-send-command.placeholder.json');
    writeFileSync(placeholderPath, `${JSON.stringify(placeholderCommand, null, 2)}\n`, 'utf8');

    const placeholderPreflight = buildControlledSendCommandPreflight({
      root,
      commandPath: placeholderPath
    });
    assert.equal(placeholderPreflight.gate_decision, 'controlled_send_command_needs_attention');
    assert.ok(placeholderPreflight.required_failures.includes('controlled_send_command_has_template_placeholders'));
    assert.ok(placeholderPreflight.placeholder_paths.includes('$.send_command_id'));
    assert.ok(placeholderPreflight.placeholder_paths.includes('$.event_id'));

    const readyCommand = fixture('outbound-send-command.sample.json');
    readyCommand.user_confirmed = true;
    readyCommand.real_execution_allowed = true;
    readyCommand.safety_checks.window_matches = true;
    readyCommand.safety_checks.thread_matches = true;
    readyCommand.safety_checks.draft_matches = true;
    readyCommand.safety_checks.permission_granted = true;
    readyCommand.metadata = {
      controlled_send_scope: 'test_account_or_test_window',
      no_production_contact: true,
      operator_confirmation: 'confirmed_for_controlled_send',
      operator_confirmed_at: '2026-06-10T09:30:00+08:00'
    };
    const readyPath = path.join(root, 'controlled-send-command.ready.json');
    const boxRegionsPath = path.join(root, 'controlled-send-box-regions.ready.json');
    writeFileSync(readyPath, `${JSON.stringify(readyCommand, null, 2)}\n`, 'utf8');
    writeFileSync(boxRegionsPath, `${JSON.stringify({
      contactList: { x: 10, y: 20, width: 180, height: 700 },
      chatMain: { x: 210, y: 20, width: 760, height: 650 },
      inputBox: { x: 210, y: 690, width: 760, height: 120 },
      unreadIndicator: null,
      displayId: 1,
      scaleFactor: 1,
      capturedAt: Date.now()
    }, null, 2)}\n`, 'utf8');

    const readyPreflight = buildControlledSendCommandPreflight({
      root,
      commandPath: readyPath,
      boxRegionsPath,
      requireBoxRegions: true
    });
    assert.equal(readyPreflight.gate_decision, 'controlled_send_command_ready_for_prepare_controlled');
    assert.equal(readyPreflight.ready_for_prepare_controlled, true);
    assert.equal(readyPreflight.real_send_attempted, false);
    assert.deepEqual(readyPreflight.required_failures, []);
    assert.equal(readyPreflight.dry_run_send_result.status, 'previewed');
    assert.ok(readyPreflight.next_commands.prepare_controlled.includes('desktop:send:prepare-controlled'));
    assert.ok(readyPreflight.next_commands.prepare_controlled.includes('--require-box-regions'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controlled send command preflight CLI writes readiness evidence', () => {
  const root = tempRoot();
  try {
    const scriptPath = path.resolve('scripts/check-controlled-send-command.mjs');
    const outputDir = path.join(root, 'preflight-cli');
    const result = spawnSync(process.execPath, [
      scriptPath,
      `--input=${path.join(root, 'runtime/user-inputs/controlled-send-command.real.json')}`,
      `--output-dir=${outputDir}`
    ], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'check-controlled-send-command');
    assert.equal(stdout.gate_decision, 'controlled_send_command_missing');
    assert.equal(stdout.ready_for_prepare_controlled, false);
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(existsSync(path.join(outputDir, 'controlled-send-command-preflight.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controlled send handoff summarizes latest readiness without sending', () => {
  const root = tempRoot();
  try {
    const trialDir = path.join(root, 'runtime/desktop-controlled-send-trials/trial_ready');
    const auditDir = path.join(root, 'runtime/intake-implementation-audits/audit_ready');
    const materialKitDir = path.join(root, 'runtime/controlled-send-material-kits/kit_ready');
    const readinessDir = path.join(root, 'runtime/controlled-send-real-window-readiness/readiness_ready');
    const preflightDir = path.join(root, 'runtime/desktop-controlled-send-command-preflights/preflight_ready');
    const draftDir = path.join(root, 'runtime/controlled-send-command-drafts/draft_ready');
    const confirmationDir = path.join(root, 'runtime/controlled-send-command-confirmations/confirmation_pending');
    const bridgeDir = path.join(root, 'runtime/tool-intake-bridges/bridge_ready');
    mkdirSync(trialDir, { recursive: true });
    mkdirSync(auditDir, { recursive: true });
    mkdirSync(materialKitDir, { recursive: true });
    mkdirSync(readinessDir, { recursive: true });
    mkdirSync(preflightDir, { recursive: true });
    mkdirSync(draftDir, { recursive: true });
    mkdirSync(confirmationDir, { recursive: true });
    mkdirSync(bridgeDir, { recursive: true });

    writeFileSync(path.join(trialDir, 'desktop-controlled-send-trial.json'), `${JSON.stringify({
      schema_version: 'desktop_controlled_send_trial.v1',
      trial_id: 'trial_ready',
      gate_decision: 'controlled_send_ready_for_test_window',
      ready_for_real_controlled_send: true,
      real_send_attempted: false,
      required_failures: [],
      input_path: path.join(root, 'controlled-send-command.ready.json'),
      handoff: {
        command_path: path.join(root, 'controlled-send-command.ready.json'),
        readiness_path: path.join(trialDir, 'desktop-controlled-send-trial.json'),
        box_regions_path: path.join(root, 'box-regions.ready.json'),
        result_path: path.join(root, 'sightflow-real-controlled-send-result.json'),
        runner_command_with_box_regions: 'npm.cmd run dev:test-controlled-send-real',
        runner_command_with_vision_api: 'npm.cmd run dev:test-controlled-send-real',
        completion_command: 'npm.cmd run desktop:send:complete-controlled',
        audit_command: 'npm.cmd run desktop:intake:audit'
      },
      created_at: '2026-06-10T11:00:00.000Z'
    }, null, 2)}\n`, 'utf8');
    writeFileSync(path.join(auditDir, 'intake-implementation-audit.json'), `${JSON.stringify({
      schema_version: 'intake_implementation_audit.v1',
      audit_id: 'audit_ready',
      gate_decision: 'intake_implementation_ready_for_real_window_trial',
      automated_requirements_ready: true,
      real_send_verified: false,
      required_failures: [],
      external_pending: ['real_test_window_send_result_pending'],
      created_at: '2026-06-10T11:01:00.000Z'
    }, null, 2)}\n`, 'utf8');
    writeFileSync(path.join(materialKitDir, 'controlled-send-material-kit.json'), `${JSON.stringify({
      schema_version: 'controlled_send_material_kit.v1',
      kit_id: 'kit_ready',
      gate_decision: 'controlled_send_materials_ready_for_operator_fill',
      real_send_attempted: false,
      command_target_path: path.join(root, 'controlled-send-command.ready.json'),
      box_regions_target_path: path.join(root, 'box-regions.ready.json'),
      command_template_path: path.join(materialKitDir, 'controlled-send-command.real.template.json'),
      box_regions_template_path: path.join(materialKitDir, 'controlled-send-box-regions.real.template.json'),
      operator_checklist_path: path.join(materialKitDir, 'operator-checklist.md'),
      next_commands: {
        command_check_with_box_regions: 'npm.cmd run desktop:send:command:check -- --require-box-regions',
        prepare_with_box_regions: 'npm.cmd run desktop:send:prepare-controlled -- --require-box-regions',
        handoff: 'npm.cmd run desktop:send:handoff'
      },
      created_at: '2026-06-10T11:01:15.000Z'
    }, null, 2)}\n`, 'utf8');
    writeFileSync(path.join(readinessDir, 'controlled-send-real-window-readiness.json'), `${JSON.stringify({
      schema_version: 'controlled_send_real_window_readiness.v1',
      readiness_id: 'readiness_ready',
      gate_decision: 'real_window_ready_for_runner',
      ready_for_prepare_controlled: true,
      ready_for_real_runner: true,
      real_send_verified: false,
      real_send_attempted_by_readiness: false,
      command_path: path.join(root, 'controlled-send-command.ready.json'),
      box_regions_path: path.join(root, 'box-regions.ready.json'),
      box_regions_required: true,
      latest_controlled_send_material_kit: {
        path: path.join(materialKitDir, 'controlled-send-material-kit.json'),
        kit_id: 'kit_ready'
      },
      latest_controlled_send_trial: {
        path: path.join(trialDir, 'desktop-controlled-send-trial.json'),
        trial_id: 'trial_ready',
        ready_for_real_controlled_send: true,
        real_send_attempted: false
      },
      current_blockers: ['sightflow_real_runner_result_pending', 'desktop_controlled_send_completion_pending'],
      next_commands: {
        handoff: 'npm.cmd run desktop:send:handoff',
        runner_with_box_regions: 'npm.cmd run dev:test-controlled-send-real',
        complete_controlled: 'npm.cmd run desktop:send:complete-controlled',
        audit: 'npm.cmd run desktop:intake:audit -- --fail-on-required'
      },
      created_at: '2026-06-10T11:01:20.000Z'
    }, null, 2)}\n`, 'utf8');
    writeFileSync(path.join(preflightDir, 'controlled-send-command-preflight.json'), `${JSON.stringify({
      schema_version: 'controlled_send_command_preflight.v1',
      preflight_id: 'preflight_ready',
      gate_decision: 'controlled_send_command_ready_for_prepare_controlled',
      ready_for_prepare_controlled: true,
      real_send_attempted: false,
      command_path: path.join(root, 'controlled-send-command.ready.json'),
      command_exists: true,
      box_regions_path: path.join(root, 'box-regions.ready.json'),
      box_regions_exists: true,
      box_regions_ready: true,
      box_regions_required: true,
      required_failures: [],
      warnings: [],
      next_commands: {
        prepare_controlled: 'npm.cmd run desktop:send:prepare-controlled -- --fail-on-not-ready',
        handoff: 'npm.cmd run desktop:send:handoff'
      },
      created_at: '2026-06-10T11:01:30.000Z'
    }, null, 2)}\n`, 'utf8');
    writeFileSync(path.join(draftDir, 'controlled-send-command-draft.json'), `${JSON.stringify({
      schema_version: 'controlled_send_command_draft.v1',
      draft_id: 'draft_ready',
      gate_decision: 'controlled_send_command_draft_waiting_operator_confirmation',
      real_send_attempted: false,
      target_command_path: path.join(root, 'controlled-send-command.ready.json'),
      box_regions_path: path.join(root, 'box-regions.ready.json'),
      draft_command_path: path.join(draftDir, 'controlled-send-command.real.draft.json'),
      draft_markdown_path: path.join(draftDir, 'controlled-send-command-draft.md'),
      draft_report_path: path.join(draftDir, 'controlled-send-command-draft.json'),
      source: {
        workflow: 'mvp_loop_from_pilot_import',
        import_id: 'pilot_import_test',
        run_id: 'run_test',
        decision_id: 'decision_test',
        trigger_id: 'trigger_test'
      },
      command_summary: {
        send_command_id: 'send_command_test',
        event_id: 'event_test',
        decision_id: 'decision_test',
        trigger_id: 'trigger_test',
        target_platform: 'wechat',
        target_person_id: 'person_test',
        target_thread_hint: {
          conversation_title: 'replace_with_exact_test_window_title'
        },
        message_draft_length: 12,
        message_draft_sha256: 'a'.repeat(64),
        user_confirmed: false,
        real_execution_allowed: false
      },
      created_at: '2026-06-10T11:01:35.000Z'
    }, null, 2)}\n`, 'utf8');
    writeFileSync(path.join(confirmationDir, 'controlled-send-command-confirmation.json'), `${JSON.stringify({
      schema_version: 'controlled_send_command_confirmation.v1',
      confirmation_id: 'confirmation_pending',
      created_at: '2026-06-10T11:01:40.000Z',
      gate_decision: 'controlled_send_command_confirmation_template_written',
      real_send_attempted: false,
      target_written: false,
      source: {
        root,
        draft_path: path.join(draftDir, 'controlled-send-command-draft.json'),
        decision_path: null
      },
      target_command_path: path.join(root, 'controlled-send-command.ready.json'),
      decision_template_path: path.join(confirmationDir, 'controlled-send-command-confirmation-decision.template.json'),
      reviewed_decision_target_path: path.join(root, 'runtime/user-inputs/controlled-send-command-confirmation-decision.real.json'),
      user_input_decision_template_path: path.join(root, 'runtime/user-inputs/templates/controlled-send-command-confirmation-decision.real.template.json'),
      confirmed_command_path: null,
      required_failures: ['confirmation_decision_missing'],
      next_actions: ['Review the decision template.']
    }, null, 2)}\n`, 'utf8');
    writeFileSync(path.join(bridgeDir, 'tool-intake-bridge.json'), `${JSON.stringify({
      schema_version: 'tool_intake_bridge.v1',
      bridge_id: 'bridge_ready',
      gate_decision: 'tool_bridge_ready_with_blocked_send_template',
      capability_summary: {
        capability_id: 'cli_anything.feishu'
      },
      command_executed: false,
      real_execution_allowed: false,
      send_command_template_path: path.join(bridgeDir, 'outbound-send-command.template.json'),
      dry_run_send_result_path: path.join(bridgeDir, 'outbound-send-result.dry-run.json'),
      source_adapter_init_path: path.join(bridgeDir, 'source-adapter-kit/source-adapter-init-kit.json'),
      created_at: '2026-06-10T11:02:00.000Z'
    }, null, 2)}\n`, 'utf8');

    const handoff = buildControlledSendHandoff({ root });
    const written = writeControlledSendHandoff({
      handoff,
      outputDir: path.join(root, 'handoff-output')
    });

    assert.equal(handoff.schema_version, 'desktop_controlled_send_handoff.v1');
    assert.equal(handoff.gate_decision, 'ready_for_real_window_runner');
    assert.equal(handoff.automated_requirements_ready, true);
    assert.equal(handoff.real_send_verified, false);
    assert.equal(handoff.real_send_attempted_by_handoff, false);
    assert.equal(handoff.latest_controlled_send_material_kit.kit_id, 'kit_ready');
    assert.equal(handoff.latest_controlled_send_material_kit.real_send_attempted, false);
    assert.equal(handoff.latest_controlled_send_real_window_readiness.readiness_id, 'readiness_ready');
    assert.equal(handoff.latest_controlled_send_real_window_readiness.real_send_attempted_by_readiness, false);
    assert.equal(handoff.latest_controlled_send_real_window_readiness.ready_for_real_runner, true);
    assert.equal(handoff.latest_controlled_send_command_preflight.ready_for_prepare_controlled, true);
    assert.equal(handoff.latest_controlled_send_command_preflight.real_send_attempted, false);
    assert.equal(handoff.latest_controlled_send_command_draft.draft_id, 'draft_ready');
    assert.equal(handoff.latest_controlled_send_command_draft.real_send_attempted, false);
    assert.equal(handoff.latest_controlled_send_command_confirmation.confirmation_id, 'confirmation_pending');
    assert.equal(handoff.latest_controlled_send_command_confirmation.target_written, false);
    assert.equal(
      handoff.latest_controlled_send_command_confirmation.reviewed_decision_target_path,
      path.join(root, 'runtime/user-inputs/controlled-send-command-confirmation-decision.real.json')
    );
    assert.equal(
      handoff.latest_controlled_send_command_confirmation.user_input_decision_template_path,
      path.join(root, 'runtime/user-inputs/templates/controlled-send-command-confirmation-decision.real.template.json')
    );
    assert.equal(handoff.latest_controlled_send_trial.ready_for_real_controlled_send, true);
    assert.equal(handoff.latest_tool_intake_bridge.command_executed, false);
    assert.equal(handoff.runner_environment_contract.contract_version, 'controlled_send_runner_environment.v1');
    assert.equal(handoff.runner_environment_contract.ready_for_runner, true);
    assert.equal(handoff.runner_environment_contract.required_env.ALLOW_REAL_CONTROLLED_SEND, 'true');
    assert.equal(handoff.runner_environment_contract.required_env.CONTROLLED_SEND_COMMAND_PATH, path.join(root, 'controlled-send-command.ready.json'));
    assert.equal(handoff.runner_environment_contract.required_env.CONTROLLED_SEND_RESULT_PATH, path.join(root, 'sightflow-real-controlled-send-result.json'));
    assert.equal(handoff.runner_environment_contract.path_bindings.box_regions_path_must_equal, path.join(root, 'box-regions.ready.json'));
    assert.ok(handoff.runner_environment_contract.command_snapshot_required_fields.includes('message_draft_sha256'));
    assert.ok(handoff.operator_next_actions.some((item) => item.action_id === 'run_real_test_window_runner'
      && item.status === 'ready'
      && item.command.includes('dev:test-controlled-send-real')));
    assert.ok(handoff.operator_next_actions.some((item) => item.action_id === 'build_controlled_send_command_draft'
      && item.status === 'complete'));
    assert.ok(handoff.operator_next_actions.some((item) => item.action_id === 'confirm_controlled_send_command'
      && item.status === 'complete'));
    assert.ok(handoff.operator_next_actions.some((item) => item.action_id === 'validate_reviewed_decision'
      && item.status === 'complete'));
    assert.ok(handoff.operator_next_actions.some((item) => item.action_id === 'complete_and_refresh_audit'
      && item.status === 'blocked'
      && item.blockers.includes('sightflow_real_runner_result_pending')));
    assert.ok(handoff.operator_next_steps.some((step) => step.includes('runner command')));
    assert.equal(existsSync(written.json_path), true);
    assert.equal(existsSync(written.markdown_path), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controlled send handoff CLI writes the current operator handoff report', () => {
  const root = tempRoot();
  try {
    const scriptPath = path.resolve('scripts/write-controlled-send-handoff.mjs');
    const outputDir = path.join(root, 'handoff-cli');
    const result = spawnSync(process.execPath, [
      scriptPath,
      `--output-dir=${outputDir}`
    ], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(path.join(outputDir, 'desktop-controlled-send-handoff.json'), 'utf8'));
    assert.equal(report.schema_version, 'desktop_controlled_send_handoff.v1');
    assert.equal(report.gate_decision, 'waiting_for_real_window_inputs');
    assert.equal(report.real_send_attempted_by_handoff, false);
    assert.ok(report.operator_next_actions.some((item) => item.action_id === 'initialize_controlled_send_material_kit'
      && item.status === 'pending'));
    assert.ok(report.operator_next_actions.some((item) => item.action_id === 'build_controlled_send_command_draft'
      && item.status === 'ready'
      && item.command.includes('desktop:send:command:draft')));
    assert.ok(report.operator_next_actions.some((item) => item.action_id === 'confirm_controlled_send_command'
      && item.status === 'blocked'
      && item.blockers.includes('controlled_send_command_draft_pending')));
    assert.ok(report.operator_next_actions.some((item) => item.action_id === 'validate_reviewed_decision'
      && item.status === 'blocked'
      && item.blockers.includes('controlled_send_command_draft_pending')));
    assert.ok(report.operator_next_actions.some((item) => item.action_id === 'run_command_preflight'
      && item.status === 'blocked'
      && item.blockers.includes('controlled_send_material_kit_pending')));
    assert.ok(report.operator_next_steps.some((step) => step.includes('desktop:send:prepare-controlled')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controlled send operator pack bundles latest real-window actions without sending', () => {
  const root = tempRoot();
  try {
    const targetCommandPath = path.join(root, 'runtime/user-inputs/controlled-send-command.real.json');
    const boxRegionsPath = path.join(root, 'runtime/user-inputs/controlled-send-box-regions.real.json');
    const materialKit = buildControlledSendMaterialKit({
      root,
      commandTargetPath: targetCommandPath,
      boxRegionsTargetPath: boxRegionsPath,
      createdAt: '2026-06-17T12:00:00.000Z'
    });
    writeControlledSendMaterialKit({ kit: materialKit });

    const pilotImport = {
      import_id: 'pilot_import_test',
      scenario: {
        channel: 'wechat_desktop',
        target_person_ids: ['person_test_contact']
      },
      people: [
        {
          person_id: 'person_test_contact',
          display_name: 'Test Contact'
        }
      ]
    };
    const mvpLoopResult = {
      workflow: 'mvp_loop_from_pilot_import',
      import_id: 'pilot_import_test',
      run_id: 'run_test',
      decision_id: 'decision_test',
      trigger_id: 'trigger_test',
      message_draft: {
        channel: 'wechat',
        target_person_id: 'person_test_contact',
        target_display_name: 'Test Contact',
        draft: 'Test Contact, I prepared the next step for your confirmation.'
      }
    };
    const draft = buildControlledSendCommandDraft({
      root,
      pilotImport,
      mvpLoopResult,
      targetCommandPath,
      boxRegionsPath,
      createdAt: '2026-06-17T12:01:00.000Z'
    });
    const draftWritten = writeControlledSendCommandDraft({ draft });
    const confirmation = buildControlledSendCommandConfirmation({
      root,
      draftPath: draftWritten.json_path,
      targetCommandPath,
      createdAt: '2026-06-17T12:02:00.000Z'
    });
    writeControlledSendCommandConfirmation({ confirmation });
    const preflight = buildControlledSendCommandPreflight({
      root,
      commandPath: targetCommandPath,
      boxRegionsPath,
      requireBoxRegions: true
    });
    writeControlledSendCommandPreflight({
      preflight,
      outputDir: path.join(root, 'runtime/desktop-controlled-send-command-preflights', preflight.preflight_id)
    });

    const pack = buildControlledSendOperatorPack({
      root,
      createdAt: '2026-06-17T12:03:00.000Z'
    });
    const written = writeControlledSendOperatorPack({ pack });

    assert.equal(pack.schema_version, 'controlled_send_operator_pack.v1');
    assert.equal(pack.gate_decision, 'operator_pack_waiting_for_reviewed_decision');
    assert.equal(pack.real_send_attempted, false);
    assert.equal(pack.real_send_verified, false);
    assert.equal(pack.operator_inputs.command_target_path, targetCommandPath);
    assert.equal(pack.operator_inputs.box_regions_target_path, boxRegionsPath);
    assert.equal(pack.operator_inputs.reviewed_decision_template_path, confirmation.decision_template_path);
    assert.equal(pack.operator_inputs.reviewed_decision_user_input_template_path, confirmation.user_input_decision_template_path);
    assert.equal(pack.operator_inputs.reviewed_decision_target_path, confirmation.reviewed_decision_target_path);
    assert.ok(pack.current_blockers.includes('confirmation_decision_missing'));
    assert.ok(pack.current_blockers.includes('controlled_send_command_missing'));
    assert.ok(pack.latest_artifacts.command_draft.path.includes('runtime/controlled-send-command-drafts/'));
    assert.ok(pack.latest_artifacts.command_confirmation.path.includes('runtime/controlled-send-command-confirmations/'));
    assert.ok(pack.operator_actions.some((item) => item.action_id === 'validate_reviewed_decision'
      && item.status === 'pending'
      && item.command.includes('--validate-only')
      && item.command.includes('controlled-send-command-confirmation-decision.real.json')));
    assert.ok(pack.operator_actions.some((item) => item.action_id === 'apply_reviewed_decision'
      && item.status === 'pending'
      && item.input_path === confirmation.reviewed_decision_target_path
      && item.output_path === targetCommandPath));
    assert.ok(pack.operator_actions.some((item) => item.action_id === 'run_sightflow_real_runner_once'
      && item.status === 'blocked'
      && item.blockers.includes('desktop_controlled_send_trial.ready_for_real_controlled_send')));
    assert.equal(existsSync(targetCommandPath), false);
    assert.equal(existsSync(written.json_path), true);
    assert.equal(existsSync(written.markdown_path), true);
    assert.equal(existsSync(written.html_path), true);
    assert.ok(readFileSync(written.html_path, 'utf8').includes('Controlled Send Operator Pack'));

    const decisionPath = path.join(root, 'reviewed-decision.valid.json');
    writeJson(decisionPath, {
      schema_version: 'controlled_send_command_confirmation_decision.v1',
      draft_id: draft.draft_id,
      decision: 'approve_for_controlled_test_window',
      operator_id: 'operator_test',
      operator_confirmed_at: '2026-06-17T12:04:00.000Z',
      test_window: {
        conversation_title: 'WeChat controlled test window',
        target_display_name: 'Test Contact',
        platform_handle: 'wechat-test-window'
      },
      confirmations: {
        no_production_contact: true,
        window_matches: true,
        thread_matches: true,
        draft_matches: true,
        permission_granted: true
      },
      evidence_refs: [draftWritten.command_draft_path],
      notes: ['operator-pack validate-only test']
    });
    const validateOnly = buildControlledSendCommandConfirmation({
      root,
      draftPath: draftWritten.json_path,
      decisionPath,
      targetCommandPath,
      validateOnly: true,
      createdAt: '2026-06-17T12:04:00.000Z'
    });
    writeControlledSendCommandConfirmation({ confirmation: validateOnly });
    const postValidatePack = buildControlledSendOperatorPack({
      root,
      createdAt: '2026-06-17T12:05:00.000Z'
    });
    assert.equal(postValidatePack.latest_artifacts.command_confirmation.gate_decision, 'controlled_send_command_confirmation_validated_without_write');
    assert.ok(postValidatePack.operator_actions.some((item) => item.action_id === 'validate_reviewed_decision'
      && item.status === 'complete'));
    assert.ok(postValidatePack.operator_actions.some((item) => item.action_id === 'apply_reviewed_decision'
      && item.status === 'ready'
      && item.input_path === confirmation.reviewed_decision_target_path
      && item.blockers.length === 0));
    assert.equal(existsSync(targetCommandPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controlled send operator pack CLI writes no-send handoff even without materials', () => {
  const root = tempRoot();
  try {
    const scriptPath = path.resolve('scripts/write-controlled-send-operator-pack.mjs');
    const outputDir = path.join(root, 'operator-pack-cli');
    const result = spawnSync(process.execPath, [
      scriptPath,
      `--output-dir=${outputDir}`
    ], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'write-controlled-send-operator-pack');
    assert.equal(stdout.gate_decision, 'operator_pack_waiting_for_reviewed_decision');
    assert.equal(stdout.real_send_attempted, false);
    assert.equal(stdout.real_send_verified, false);
    assert.ok(stdout.html_path.endsWith('controlled-send-operator-pack.html'));
    assert.equal(existsSync(path.join(outputDir, 'controlled-send-operator-pack.json')), true);
    assert.equal(existsSync(path.join(outputDir, 'controlled-send-operator-pack.html')), true);
    assert.equal(existsSync(path.join(root, 'runtime/user-inputs/controlled-send-command.real.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('audits docs/16 intake implementation readiness without claiming real send completion', () => {
  const root = process.cwd();
  const outputDir = path.join(tempRoot(), 'intake-audit');
  try {
    const audit = auditIntakeImplementation({ root });
    const written = writeIntakeImplementationAudit({ audit, outputDir });

    assert.equal(audit.schema_version, 'intake_implementation_audit.v1');
    assert.equal(audit.automated_requirements_ready, true);
    assert.equal(audit.real_send_verified, false);
    assert.equal(typeof audit.simulated_send_verified, 'boolean');
    if (audit.simulated_send_verified) {
      assert.equal(audit.gate_decision, 'intake_implementation_simulated_send_verified');
    }
    assert.equal(audit.required_failures.length, 0);
    assert.equal(Object.hasOwn(audit, 'latest_controlled_send_command_draft'), true);
    assert.equal(Object.hasOwn(audit, 'latest_controlled_send_command_confirmation'), true);
    assert.equal(Object.hasOwn(audit, 'latest_controlled_send_operator_pack'), true);
    assert.equal(Object.hasOwn(audit, 'latest_controlled_send_command_preflight'), true);
    assert.equal(Object.hasOwn(audit, 'latest_controlled_send_handoff'), true);
    assert.ok([
      'controlled_send_command_preflight_pending',
      'controlled_send_command_confirmation_pending',
      'controlled_send_command_material_pending',
      'controlled_send_prepare_controlled_pending',
      'real_test_account_or_window_confirmation_pending',
      'real_test_window_send_result_pending'
    ].some((pending) => audit.external_pending.includes(pending)));
    assert.ok(audit.checks.some((check) => check.check_id === 'handoff:structured-operator-actions' && check.passed));
    assert.ok(audit.checks.some((check) => check.check_id === 'handoff:runner-environment-contract' && check.passed));
    assert.ok(audit.checks.some((check) => check.check_id === 'readiness:runner-environment-contract' && check.passed));
    assert.ok(audit.checks.some((check) => check.check_id === 'schema:handoff-structured-operator-actions' && check.passed));
    assert.ok(audit.checks.some((check) => check.check_id === 'schema:handoff-runner-environment-contract' && check.passed));
    assert.ok(audit.checks.some((check) => check.check_id === 'schema:readiness-runner-environment-contract' && check.passed));
    assert.ok(audit.checks.some((check) => check.check_id === 'completion:trial-draft-hash-binding' && check.passed));
    assert.ok(audit.checks.some((check) => check.check_id === 'schema:completion-message-draft-sha256' && check.passed));
    assert.ok(audit.checks.some((check) => check.check_id === 'schema:trial-message-draft-sha256' && check.passed));
    assert.ok(audit.checks.some((check) => check.check_id === 'schema:trial-runner-environment-contract' && check.passed));
    assert.ok(audit.checks.some((check) => check.check_id === 'docs16-status:runner-environment-contract-gate' && check.passed));
    assert.ok(audit.checks.some((check) => check.check_id === 'schema:docs16-status-runner-environment-contract-ready' && check.passed));
    assert.ok(audit.checks.some((check) => check.check_id === 'script:desktop:intake:audit' && check.passed));
    assert.equal(existsSync(written.json_path), true);
    assert.equal(existsSync(written.markdown_path), true);
  } finally {
    rmSync(path.dirname(outputDir), { recursive: true, force: true });
  }
});

test('writes docs/16 implementation status without claiming real send completion', () => {
  const root = tempRoot();
  try {
    const status = buildDocs16ImplementationStatus({
      root,
      fileExists: () => true,
      latestIntakeAudit: {
        path: 'runtime/intake-implementation-audits/audit/intake-implementation-audit.json',
        automated_requirements_ready: true,
        real_send_verified: false,
        external_pending: ['controlled_send_command_material_pending'],
        required_failures: []
      },
      latestMaterialKit: {
        path: 'runtime/controlled-send-material-kits/kit/controlled-send-material-kit.json',
        gate_decision: 'controlled_send_materials_ready_for_operator_fill',
        real_send_attempted: false,
        command_target_path: 'D:\\zhineng\\runtime\\user-inputs\\controlled-send-command.real.json',
        user_input_command_template_path: 'D:\\zhineng\\runtime\\user-inputs\\templates\\controlled-send-command.real.template.json',
        next_commands: {
          command_check_without_box_regions: "npm.cmd run desktop:send:command:check -- --input='D:\\zhineng\\runtime\\user-inputs\\controlled-send-command.real.json' --fail-on-required"
        }
      },
      latestCommandDraft: {
        path: 'runtime/controlled-send-command-drafts/draft/controlled-send-command-draft.json',
        draft_id: 'draft_pending_confirmation',
        gate_decision: 'controlled_send_command_draft_waiting_operator_confirmation',
        real_send_attempted: false,
        target_command_path: 'D:\\zhineng\\runtime\\user-inputs\\controlled-send-command.real.json',
        command_summary: {
          user_confirmed: false,
          real_execution_allowed: false
        }
      },
      latestCommandConfirmation: {
        path: 'runtime/controlled-send-command-confirmations/confirmation/controlled-send-command-confirmation.json',
        confirmation_id: 'confirmation_template',
        gate_decision: 'controlled_send_command_confirmation_template_written',
        real_send_attempted: false,
        target_written: false,
        target_command_path: 'D:\\zhineng\\runtime\\user-inputs\\controlled-send-command.real.json',
        decision_template_path: 'runtime/controlled-send-command-confirmations/confirmation/controlled-send-command-confirmation-decision.template.json',
        reviewed_decision_target_path: 'D:\\zhineng\\runtime\\user-inputs\\controlled-send-command-confirmation-decision.real.json',
        user_input_decision_template_path: 'D:\\zhineng\\runtime\\user-inputs\\templates\\controlled-send-command-confirmation-decision.real.template.json',
        required_failures: ['confirmation_decision_missing']
      },
      latestOperatorPack: {
        path: 'runtime/controlled-send-operator-packs/pack/controlled-send-operator-pack.json',
        gate_decision: 'operator_pack_waiting_for_reviewed_decision',
        real_send_attempted: false,
        real_send_verified: false,
        docs16_goal_complete: false,
        simulation_goal_complete: false,
        current_blockers: ['confirmation_decision_missing']
      },
      latestRealWindowReadiness: {
        path: 'runtime/controlled-send-real-window-readiness/readiness/controlled-send-real-window-readiness.json',
        gate_decision: 'real_window_command_missing',
        real_send_attempted_by_readiness: false,
        real_send_verified: false,
        runner_environment_contract: runnerEnvironmentContractFixture()
      },
      latestCommandPreflight: {
        path: 'runtime/desktop-controlled-send-command-preflights/preflight/controlled-send-command-preflight.json',
        ready_for_prepare_controlled: false,
        real_send_attempted: false,
        required_failures: ['controlled_send_command_missing'],
        warnings: []
      },
      latestHandoff: {
        path: 'runtime/desktop-controlled-send-handoffs/handoff/desktop-controlled-send-handoff.json',
        real_send_attempted_by_handoff: false,
        latest_controlled_send_material_kit: {
          path: 'runtime/controlled-send-material-kits/kit/controlled-send-material-kit.json'
        },
        latest_controlled_send_real_window_readiness: {
          path: 'runtime/controlled-send-real-window-readiness/readiness/controlled-send-real-window-readiness.json'
        },
        runner_environment_contract: runnerEnvironmentContractFixture(),
        operator_next_actions: [
          {
            action_id: 'run_command_preflight',
            status: 'ready',
            description: 'check command',
            target_path: 'runtime/user-inputs/controlled-send-command.real.json',
            template_path: null,
            command: 'npm.cmd run desktop:send:command:check',
            evidence_refs: [],
            blockers: []
          },
          {
            action_id: 'prepare_controlled_send_trial',
            status: 'blocked',
            description: 'prepare trial',
            target_path: null,
            template_path: null,
            command: null,
            evidence_refs: [],
            blockers: ['controlled_send_command_preflight_pending']
          },
          {
            action_id: 'run_real_test_window_runner',
            status: 'blocked',
            description: 'run real runner',
            target_path: null,
            template_path: null,
            command: null,
            evidence_refs: [],
            blockers: ['controlled_send_trial_not_ready']
          },
          {
            action_id: 'complete_and_refresh_audit',
            status: 'blocked',
            description: 'complete and audit',
            target_path: null,
            template_path: null,
            command: null,
            evidence_refs: [],
            blockers: ['sightflow_real_runner_result_pending']
          }
        ],
        real_send_verified: false
      },
      latestCompletion: null,
      latestProcessTreeValidation: {
        path: 'runtime/process-tree-validations/process/process-tree-validation.json',
        required_failures: []
      },
      createdAt: '2026-06-10T12:20:00.000Z'
    });
    const written = writeDocs16ImplementationStatus({
      status,
      outputDir: path.join(root, 'docs16-status')
    });

    assert.equal(status.schema_version, 'docs16_implementation_status.v1');
    assert.equal(status.goal_complete, false);
    assert.equal(status.simulation_goal_complete, false);
    assert.equal(status.real_send_verified, false);
    assert.equal(status.simulated_send_verified, false);
    assert.equal(status.runner_environment_contract_ready, true);
    assert.equal(status.automated_requirements_ready, true);
    assert.equal(status.gate_decision, 'docs16_waiting_for_real_controlled_send');
    assert.ok(status.requirements.some((item) => item.requirement_id === 'docs16.controlled_send_material_kit'
      && item.status === 'complete'));
    assert.ok(status.requirements.some((item) => item.requirement_id === 'docs16.real_window_readiness'
      && item.status === 'complete'));
    assert.ok(status.requirements.some((item) => item.requirement_id === 'docs16.runner_environment_contract'
      && item.status === 'complete'));
    assert.ok(status.requirements.some((item) => item.requirement_id === 'docs16.real_controlled_send_verified'
      && item.status === 'incomplete'));
    assert.ok(status.operator_next_actions.some((item) => item.action_id === 'prepare_controlled_send_command_material'
      && item.status === 'pending'
      && item.target_path
      && item.template_path));
    assert.ok(status.operator_next_actions.some((item) => item.action_id === 'build_controlled_send_command_draft'
      && item.status === 'complete'));
    assert.ok(status.operator_next_actions.some((item) => item.action_id === 'confirm_controlled_send_command'
      && item.status === 'pending'
      && item.command.includes('controlled-send-command-confirmation-decision.real.json')
      && item.blockers.includes('confirmation_decision_missing')));
    assert.ok(status.operator_next_actions.some((item) => item.action_id === 'validate_reviewed_decision'
      && item.status === 'pending'
      && item.command.includes('--validate-only')
      && item.command.includes('controlled-send-command-confirmation-decision.real.json')
      && item.blockers.includes('reviewed_decision_validation_pending')));
    assert.ok(status.operator_next_actions.some((item) => item.action_id === 'run_command_preflight'
      && item.status === 'blocked'
      && item.blockers.includes('controlled_send_command_missing')));
    assert.equal(status.latest_artifacts.controlled_send_command_draft, 'runtime/controlled-send-command-drafts/draft/controlled-send-command-draft.json');
    assert.equal(status.latest_artifacts.controlled_send_command_confirmation, 'runtime/controlled-send-command-confirmations/confirmation/controlled-send-command-confirmation.json');
    assert.equal(status.latest_artifacts.controlled_send_operator_pack, 'runtime/controlled-send-operator-packs/pack/controlled-send-operator-pack.json');
    assert.equal(existsSync(written.json_path), true);
    assert.equal(existsSync(written.markdown_path), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('docs/16 status requires completion target binding and refreshed audit for final completion', () => {
  const root = tempRoot();
  try {
    const commandPath = 'D:\\zhineng\\runtime\\user-inputs\\controlled-send-command.real.json';
    const readinessPath = 'D:\\zhineng\\runtime\\desktop-controlled-send-trials\\trial\\desktop-controlled-send-trial.json';
    const resultPath = 'D:\\zhineng\\runtime\\desktop-controlled-send-trials\\trial\\sightflow-real-controlled-send-result.json';
    const boxRegionsPath = 'D:\\zhineng\\runtime\\user-inputs\\controlled-send-box-regions.real.json';
    const readyRunnerContract = runnerEnvironmentContractFixture({
      commandPath,
      readinessPath,
      resultPath,
      boxRegionsPath,
      readyForRunner: true
    });
    const baseInput = {
      root,
      fileExists: () => true,
      latestIntakeAudit: {
        path: 'runtime/intake-implementation-audits/audit/intake-implementation-audit.json',
        automated_requirements_ready: true,
        real_send_verified: true,
        external_pending: [],
        required_failures: []
      },
      latestMaterialKit: {
        path: 'runtime/controlled-send-material-kits/kit/controlled-send-material-kit.json',
        gate_decision: 'controlled_send_materials_ready_for_operator_fill',
        real_send_attempted: false
      },
      latestRealWindowReadiness: {
        path: 'runtime/controlled-send-real-window-readiness/readiness/controlled-send-real-window-readiness.json',
        real_send_attempted_by_readiness: false,
        ready_for_prepare_controlled: true,
        ready_for_real_runner: true,
        runner_environment_contract: readyRunnerContract,
        next_commands: {
          command_check: 'npm.cmd run desktop:send:command:check -- --fail-on-required',
          prepare_controlled: 'npm.cmd run desktop:send:prepare-controlled -- --fail-on-not-ready',
          runner_with_box_regions: 'cd D:\\zhineng\\sightflow-desktop-agent-main; npm.cmd run dev:test-controlled-send-real',
          complete_controlled: 'npm.cmd run desktop:send:complete-controlled -- --fail-on-not-complete'
        }
      },
      latestCommandPreflight: {
        path: 'runtime/desktop-controlled-send-command-preflights/preflight/controlled-send-command-preflight.json',
        ready_for_prepare_controlled: true,
        real_send_attempted: false
      },
      latestHandoff: {
        path: 'runtime/desktop-controlled-send-handoffs/handoff/desktop-controlled-send-handoff.json',
        real_send_attempted_by_handoff: false,
        latest_controlled_send_trial: {
          path: 'runtime/desktop-controlled-send-trials/trial/desktop-controlled-send-trial.json',
          readiness_path: readinessPath,
          result_path: resultPath,
          runner_environment_contract: readyRunnerContract,
          runner_command_with_box_regions: 'cd D:\\zhineng\\sightflow-desktop-agent-main; npm.cmd run dev:test-controlled-send-real',
          completion_command: 'npm.cmd run desktop:send:complete-controlled -- --fail-on-not-complete'
        },
        latest_controlled_send_material_kit: {
          path: 'runtime/controlled-send-material-kits/kit/controlled-send-material-kit.json'
        },
        latest_controlled_send_real_window_readiness: {
          path: 'runtime/controlled-send-real-window-readiness/readiness/controlled-send-real-window-readiness.json'
        },
        runner_environment_contract: readyRunnerContract,
        operator_next_actions: [
          {
            action_id: 'run_command_preflight',
            status: 'complete',
            description: 'check command',
            target_path: 'runtime/user-inputs/controlled-send-command.real.json',
            template_path: null,
            command: null,
            evidence_refs: ['runtime/desktop-controlled-send-command-preflights/preflight/controlled-send-command-preflight.json'],
            blockers: []
          },
          {
            action_id: 'prepare_controlled_send_trial',
            status: 'complete',
            description: 'prepare trial',
            target_path: 'runtime/desktop-controlled-send-trials/trial/desktop-controlled-send-trial.json',
            template_path: null,
            command: null,
            evidence_refs: ['runtime/desktop-controlled-send-trials/trial/desktop-controlled-send-trial.json'],
            blockers: []
          },
          {
            action_id: 'run_real_test_window_runner',
            status: 'ready',
            description: 'run real runner',
            target_path: 'runtime/desktop-controlled-send-trials/trial/sightflow-real-controlled-send-result.json',
            template_path: null,
            command: 'cd D:\\zhineng\\sightflow-desktop-agent-main; npm.cmd run dev:test-controlled-send-real',
            evidence_refs: ['runtime/desktop-controlled-send-trials/trial/desktop-controlled-send-trial.json'],
            blockers: []
          },
          {
            action_id: 'complete_and_refresh_audit',
            status: 'blocked',
            description: 'complete and audit',
            target_path: null,
            template_path: null,
            command: 'npm.cmd run desktop:send:complete-controlled -- --fail-on-not-complete',
            evidence_refs: [],
            blockers: ['sightflow_real_runner_result_pending']
          }
        ]
      },
      latestProcessTreeValidation: {
        path: 'runtime/process-tree-validations/process/process-tree-validation.json',
        required_failures: []
      },
      createdAt: '2026-06-10T12:22:00.000Z'
    };
    const validCompletion = {
      path: 'runtime/desktop-controlled-send-completions/completion/desktop-controlled-send-completion.json',
      real_send_verified: true,
      command_summary: {
        send_command_id: 'send_cmd_test_001',
        event_id: 'event_test_001',
        decision_id: 'decision_test_001',
        trigger_id: 'trigger_test_001',
        target_platform: 'wechat',
        target_person_id: 'person_test_001',
        target_thread_hint: { thread_id: 'thread_test_001' },
        message_draft_length: 18,
        message_draft_sha256: hashText('docs16-completion-binding')
      }
    };
    const simulatedCompletion = {
      ...validCompletion,
      real_send_verified: false,
      simulated_send_verified: true,
      verification_mode: 'simulated',
      gate_decision: 'controlled_send_simulation_completed'
    };

    const missingCompletion = buildDocs16ImplementationStatus({
      ...baseInput,
      latestCompletion: null
    });
    assert.equal(missingCompletion.real_send_verified, false);
    assert.ok(missingCompletion.requirements
      .find((item) => item.requirement_id === 'docs16.real_controlled_send_verified')
      .missing.includes('desktop_controlled_send_completion.command_summary_target_binding'));

    const weakCompletion = buildDocs16ImplementationStatus({
      ...baseInput,
      latestCompletion: {
        ...validCompletion,
        command_summary: {
          ...validCompletion.command_summary,
          target_person_id: null
        }
      }
    });
    assert.equal(weakCompletion.real_send_verified, false);
    assert.ok(weakCompletion.requirements
      .find((item) => item.requirement_id === 'docs16.real_controlled_send_verified')
      .missing.includes('desktop_controlled_send_completion.command_summary_target_binding'));

    const staleAudit = buildDocs16ImplementationStatus({
      ...baseInput,
      latestIntakeAudit: {
        ...baseInput.latestIntakeAudit,
        real_send_verified: false,
        external_pending: ['real_test_window_send_result_pending']
      },
      latestCompletion: validCompletion
    });
    assert.equal(staleAudit.real_send_verified, false);
    assert.ok(staleAudit.requirements
      .find((item) => item.requirement_id === 'docs16.real_controlled_send_verified')
      .missing.includes('intake_implementation_audit.real_send_verified_true'));

    const simulatedStatus = buildDocs16ImplementationStatus({
      ...baseInput,
      latestIntakeAudit: {
        ...baseInput.latestIntakeAudit,
        real_send_verified: false,
        simulated_send_verified: true,
        external_pending: ['real_test_window_send_result_pending']
      },
      latestCompletion: simulatedCompletion
    });
    assert.equal(simulatedStatus.real_send_verified, false);
    assert.equal(simulatedStatus.simulated_send_verified, true);
    assert.equal(simulatedStatus.goal_complete, false);
    assert.equal(simulatedStatus.simulation_goal_complete, true);
    assert.equal(simulatedStatus.gate_decision, 'docs16_simulated_controlled_send_verified');
    assert.equal(
      simulatedStatus.requirements.find((item) =>
        item.requirement_id === 'docs16.simulated_controlled_send_verified'
      ).status,
      'complete'
    );
    assert.equal(
      simulatedStatus.requirements.find((item) =>
        item.requirement_id === 'docs16.real_controlled_send_verified'
      ).status,
      'incomplete'
    );
    assert.ok(simulatedStatus.operator_next_actions.some((item) => item.action_id === 'complete_and_refresh_audit'
      && item.status === 'complete'
      && item.blockers.length === 0));

    const legacyHandoff = buildDocs16ImplementationStatus({
      ...baseInput,
      latestHandoff: {
        ...baseInput.latestHandoff,
        operator_next_actions: []
      },
      latestCompletion: validCompletion
    });
    assert.equal(legacyHandoff.goal_complete, false);
    assert.ok(legacyHandoff.requirements
      .find((item) => item.requirement_id === 'docs16.operator_handoff')
      .missing.includes('desktop_controlled_send_handoff.operator_next_actions'));

    const missingRunnerContract = buildDocs16ImplementationStatus({
      ...baseInput,
      latestRealWindowReadiness: {
        ...baseInput.latestRealWindowReadiness,
        runner_environment_contract: null
      },
      latestHandoff: {
        ...baseInput.latestHandoff,
        runner_environment_contract: null,
        latest_controlled_send_trial: {
          ...baseInput.latestHandoff.latest_controlled_send_trial,
          runner_environment_contract: null
        }
      },
      latestCompletion: validCompletion
    });
    assert.equal(missingRunnerContract.runner_environment_contract_ready, false);
    assert.equal(missingRunnerContract.goal_complete, false);
    assert.equal(missingRunnerContract.gate_decision, 'docs16_implementation_incomplete');
    assert.ok(missingRunnerContract.requirements
      .find((item) => item.requirement_id === 'docs16.runner_environment_contract')
      .missing.includes('controlled_send_real_window_readiness.runner_environment_contract'));
    assert.ok(missingRunnerContract.requirements
      .find((item) => item.requirement_id === 'docs16.runner_environment_contract')
      .missing.includes('desktop_controlled_send_handoff.runner_environment_contract'));
    assert.ok(missingRunnerContract.requirements
      .find((item) => item.requirement_id === 'docs16.runner_environment_contract')
      .missing.includes('desktop_controlled_send_trial.handoff.runner_environment_contract'));

    const completeStatus = buildDocs16ImplementationStatus({
      ...baseInput,
      latestCompletion: validCompletion
    });
    assert.equal(completeStatus.real_send_verified, true);
    assert.equal(completeStatus.simulated_send_verified, false);
    assert.equal(completeStatus.runner_environment_contract_ready, true);
    assert.equal(completeStatus.goal_complete, true);
    assert.equal(completeStatus.gate_decision, 'docs16_implementation_complete');
    assert.ok(completeStatus.operator_next_actions.some((item) => item.action_id === 'run_real_test_window_runner'
      && item.status === 'ready'
      && item.command));
    assert.ok(completeStatus.operator_next_actions.some((item) => item.action_id === 'complete_and_refresh_audit'
      && item.status === 'complete'
      && item.blockers.length === 0));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('docs/16 implementation status CLI writes current status evidence', () => {
  const root = tempRoot();
  try {
    const scriptPath = path.resolve('scripts/write-docs16-implementation-status.mjs');
    const outputDir = path.join(root, 'docs16-status-cli');
    const result = spawnSync(process.execPath, [
      scriptPath,
      `--output-dir=${outputDir}`
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    const stdout = JSON.parse(result.stdout);
    assert.equal(stdout.command, 'write-docs16-implementation-status');
    assert.equal(stdout.real_send_verified, false);
    assert.equal(typeof stdout.simulated_send_verified, 'boolean');
    assert.equal(typeof stdout.runner_environment_contract_ready, 'boolean');
    assert.equal(stdout.goal_complete, false);
    assert.equal(typeof stdout.simulation_goal_complete, 'boolean');
    assert.ok(stdout.operator_next_action_count > 0);
    assert.ok(Array.isArray(stdout.pending_operator_actions));
    if (stdout.simulation_goal_complete) {
      assert.equal(stdout.simulated_send_verified, true);
      if (stdout.pending_operator_actions.length > 0) {
        assert.ok(stdout.pending_operator_actions.includes('prepare_controlled_send_command_material'));
      }
    } else {
      assert.ok(stdout.pending_operator_actions.includes('prepare_controlled_send_command_material'));
    }
    assert.equal(existsSync(path.join(outputDir, 'docs16-implementation-status.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('completes a controlled send trial only from a sent non-dry-run Sightflow result', () => {
  const root = tempRoot();
  try {
    const scriptPath = path.resolve('scripts/prepare-controlled-send-trial.mjs');
    const command = fixture('outbound-send-command.sample.json');
    command.user_confirmed = true;
    command.real_execution_allowed = true;
    command.safety_checks.window_matches = true;
    command.safety_checks.thread_matches = true;
    command.safety_checks.draft_matches = true;
    command.safety_checks.permission_granted = true;
    command.metadata = {
      controlled_send_scope: 'test_account_or_test_window',
      no_production_contact: true,
      operator_confirmation: 'confirmed_for_controlled_send',
      operator_confirmed_at: '2026-06-10T10:20:00+08:00'
    };
    const commandPath = path.join(root, 'controlled-send-command.ready.json');
    const trialOutput = path.join(root, 'trial');
    writeFileSync(commandPath, `${JSON.stringify(command, null, 2)}\n`, 'utf8');
    const prepared = spawnSync(process.execPath, [
      scriptPath,
      `--input=${commandPath}`,
      `--output-dir=${trialOutput}`,
      '--fail-on-not-ready'
    ], {
      cwd: root,
      encoding: 'utf8'
    });
    assert.equal(prepared.status, 0);

    const resultPath = path.join(root, 'sightflow-result.json');
    const resultPayload = {
      schema_version: 'sightflow_real_controlled_send_result.v1',
      command_summary: {
        send_command_id: command.send_command_id,
        event_id: command.event_id,
        decision_id: command.decision_id,
        trigger_id: command.trigger_id,
        target_platform: command.target_platform,
        target_person_id: command.target_person_id,
        target_thread_hint: command.target_thread_hint,
        message_draft_length: command.message_draft.length,
        message_draft_sha256: hashText(command.message_draft)
      },
      send_result: {
        send_result_id: `send_result_${command.send_command_id}`,
        send_command_id: command.send_command_id,
        status: 'sent',
        target_verification: {
          dry_run: false,
          allowed_for_real_execution: true,
          blocked_reasons: []
        },
        executed_at: '2026-06-10T10:21:00+08:00',
        evidence_refs: ['sightflow_desktop_sent'],
        metadata: {
          executor: 'sightflow_desktop',
          real_send_attempted: true,
          audit_event_required: true,
          feedback_entry_required: true
        }
      },
      real_send_attempted: true
    };
    writeFileSync(resultPath, `${JSON.stringify(resultPayload, null, 2)}\n`, 'utf8');

    const completion = completeControlledSendTrial({
      trialPath: path.join(trialOutput, 'desktop-controlled-send-trial.json'),
      resultPath
    });
    const written = writeControlledSendCompletion({
      completion,
      outputDir: path.join(root, 'completion')
    });

    assert.equal(completion.gate_decision, 'controlled_send_completed');
    assert.equal(completion.verification_mode, 'real');
    assert.equal(completion.real_send_verified, true);
    assert.equal(completion.simulated_send_verified, false);
    assert.equal(completion.audit_event_ready, true);
    assert.equal(completion.feedback_entry_ready, true);
    assert.equal(completion.required_failures.length, 0);
    assert.equal(completion.command_summary.target_person_id, command.target_person_id);
    assert.equal(completion.audit_record.action, 'desktop_controlled_send_completed');
    assert.equal(completion.feedback_entry_template.feedback_required, true);
    assert.equal(existsSync(written.json_path), true);
    assert.equal(completion.command_summary.message_draft_sha256, hashText(command.message_draft));

    const simulatedPayload = {
      ...resultPayload,
      verification_mode: 'simulated',
      real_send_attempted: false,
      simulated_send_attempted: true,
      send_result: {
        ...resultPayload.send_result,
        evidence_refs: ['sightflow_desktop_simulated_sent'],
        metadata: {
          ...resultPayload.send_result.metadata,
          executor: 'sightflow_desktop_simulator',
          real_send_attempted: false,
          simulated_send_attempted: true
        }
      }
    };
    writeFileSync(resultPath, `${JSON.stringify(simulatedPayload, null, 2)}\n`, 'utf8');
    const simulated = completeControlledSendTrial({
      trialPath: path.join(trialOutput, 'desktop-controlled-send-trial.json'),
      resultPath
    });
    assert.equal(simulated.gate_decision, 'controlled_send_simulation_completed');
    assert.equal(simulated.verification_mode, 'simulated');
    assert.equal(simulated.real_send_verified, false);
    assert.equal(simulated.simulated_send_verified, true);
    assert.equal(simulated.audit_record.action, 'desktop_controlled_send_simulated');
    assert.equal(simulated.audit_record.result, 'simulated_sent');
    assert.equal(simulated.required_failures.length, 0);

    const simulatedClaimsRealPayload = {
      ...simulatedPayload,
      real_send_attempted: true,
      send_result: {
        ...simulatedPayload.send_result,
        metadata: {
          ...simulatedPayload.send_result.metadata,
          real_send_attempted: true
        }
      }
    };
    writeFileSync(resultPath, `${JSON.stringify(simulatedClaimsRealPayload, null, 2)}\n`, 'utf8');
    const simulatedClaimsReal = completeControlledSendTrial({
      trialPath: path.join(trialOutput, 'desktop-controlled-send-trial.json'),
      resultPath
    });
    assert.equal(simulatedClaimsReal.simulated_send_verified, false);
    assert.ok(simulatedClaimsReal.required_failures.includes('simulated_result_claims_real_send'));

    resultPayload.send_result.status = 'previewed';
    writeFileSync(resultPath, `${JSON.stringify(resultPayload, null, 2)}\n`, 'utf8');
    const failed = completeControlledSendTrial({
      trialPath: path.join(trialOutput, 'desktop-controlled-send-trial.json'),
      resultPath
    });
    assert.equal(failed.real_send_verified, false);
    assert.ok(failed.required_failures.includes('send_result_status_not_sent'));

    resultPayload.send_result.status = 'sent';
    resultPayload.command_summary.target_person_id = 'wrong_test_person';
    writeFileSync(resultPath, `${JSON.stringify(resultPayload, null, 2)}\n`, 'utf8');
    const targetFailed = completeControlledSendTrial({
      trialPath: path.join(trialOutput, 'desktop-controlled-send-trial.json'),
      resultPath
    });
    assert.equal(targetFailed.real_send_verified, false);
    assert.ok(targetFailed.required_failures.includes('command_summary_target_person_id_mismatch'));

    resultPayload.command_summary.target_person_id = command.target_person_id;
    resultPayload.command_summary.message_draft_sha256 = hashText('same length wrong text');
    writeFileSync(resultPath, `${JSON.stringify(resultPayload, null, 2)}\n`, 'utf8');
    const hashFailed = completeControlledSendTrial({
      trialPath: path.join(trialOutput, 'desktop-controlled-send-trial.json'),
      resultPath
    });
    assert.equal(hashFailed.real_send_verified, false);
    assert.ok(hashFailed.required_failures.includes('message_draft_sha256_mismatch'));

    resultPayload.command_summary.message_draft_sha256 = hashText(command.message_draft);
    writeFileSync(resultPath, `${JSON.stringify(resultPayload, null, 2)}\n`, 'utf8');
    const tamperedTrial = JSON.parse(readFileSync(path.join(trialOutput, 'desktop-controlled-send-trial.json'), 'utf8'));
    tamperedTrial.input_path = path.join(root, 'missing-original-command.json');
    delete tamperedTrial.command.message_draft_sha256;
    const tamperedTrialPath = path.join(root, 'tampered-trial.json');
    writeFileSync(tamperedTrialPath, `${JSON.stringify(tamperedTrial, null, 2)}\n`, 'utf8');
    const missingExpectedHash = completeControlledSendTrial({
      trialPath: tamperedTrialPath,
      resultPath
    });
    assert.equal(missingExpectedHash.real_send_verified, false);
    assert.ok(missingExpectedHash.required_failures.includes('trial_message_draft_sha256_missing'));

    command.message_draft = 'same prepared target, but command changed after trial';
    writeFileSync(commandPath, `${JSON.stringify(command, null, 2)}\n`, 'utf8');
    resultPayload.command_summary.message_draft_length = command.message_draft.length;
    resultPayload.command_summary.message_draft_sha256 = hashText(command.message_draft);
    writeFileSync(resultPath, `${JSON.stringify(resultPayload, null, 2)}\n`, 'utf8');
    const changedAfterTrial = completeControlledSendTrial({
      trialPath: path.join(trialOutput, 'desktop-controlled-send-trial.json'),
      resultPath
    });
    assert.equal(changedAfterTrial.real_send_verified, false);
    assert.ok(changedAfterTrial.required_failures.includes('message_draft_length_mismatch'));
    assert.ok(changedAfterTrial.required_failures.includes('message_draft_sha256_mismatch'));
    assert.ok(changedAfterTrial.required_failures.includes('command_message_draft_sha256_changed_after_trial'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controlled send simulation CLI writes a simulated result for the shared acceptance chain', () => {
  const root = tempRoot();
  try {
    const simulationScript = path.resolve('scripts/run-controlled-send-simulation.mjs');
    const simulationOutput = path.join(root, 'controlled-send-simulation');
    const simulation = spawnSync(process.execPath, [
      simulationScript,
      `--output-dir=${simulationOutput}`
    ], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(simulation.status, 0, simulation.stderr || simulation.stdout);
    const summary = JSON.parse(readFileSync(path.join(simulationOutput, 'controlled-send-simulation.json'), 'utf8'));
    assert.equal(summary.schema_version, 'controlled_send_simulation.v1');
    assert.equal(summary.verification_mode, 'simulated');
    assert.equal(summary.real_send_attempted, false);
    assert.equal(summary.simulated_send_attempted, true);
    assert.equal(summary.gates.command_preflight_ready, true);
    assert.equal(summary.gates.trial_ready_for_real_controlled_send, true);
    assert.equal(summary.gates.readiness_ready_for_real_runner, true);
    assert.equal(existsSync(summary.result_path), true);

    const resultPayload = JSON.parse(readFileSync(summary.result_path, 'utf8'));
    assert.equal(resultPayload.verification_mode, 'simulated');
    assert.equal(resultPayload.real_send_attempted, false);
    assert.equal(resultPayload.simulated_send_attempted, true);
    assert.ok(resultPayload.send_result.evidence_refs.includes('sightflow_desktop_simulated_sent'));

    const completeScript = path.resolve('scripts/complete-controlled-send-trial.mjs');
    const completionOutput = path.join(root, 'completion');
    const completionRun = spawnSync(process.execPath, [
      completeScript,
      `--trial=${summary.trial_path}`,
      `--result=${summary.result_path}`,
      `--output-dir=${completionOutput}`,
      '--fail-on-not-complete',
      '--allow-simulation'
    ], {
      cwd: root,
      encoding: 'utf8'
    });
    assert.equal(completionRun.status, 0, completionRun.stderr || completionRun.stdout);
    const completion = JSON.parse(readFileSync(path.join(completionOutput, 'desktop-controlled-send-completion.json'), 'utf8'));
    assert.equal(completion.gate_decision, 'controlled_send_simulation_completed');
    assert.equal(completion.real_send_verified, false);
    assert.equal(completion.simulated_send_verified, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
