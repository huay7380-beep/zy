#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildAutomationPreview,
  buildTriggerPlan,
  renderAutomationPreviewTestPage,
  runAutomationPreviewTrial
} from '../packages/trigger-engine/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/prepare-controlled-platform-snapshot.mjs',
    '',
    'Options:',
    '  --root=<dir>          Workspace root. Defaults to current directory.',
    '  --output-dir=<dir>    Defaults to runtime/user-inputs.',
    '  --platform=<name>     Defaults to wechat_web_test.'
  ].join('\n');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const outputDir = argValue('output-dir')
    ? path.resolve(argValue('output-dir'))
    : path.join(root, 'runtime/user-inputs');
  const platform = argValue('platform') ?? 'wechat_web_test';
  const socialGraph = readJson(path.join(root, 'examples/social-graph-snapshot.json'));

  const triggerPlan = buildTriggerPlan({
    trigger_type: 'user_initiated',
    goal_input: {
      initial_goal: '受控验证：生成一条平台预览草稿并确认真实发送被阻断',
      scene: 'business',
      primary_person_id: 'person_client_a',
      target_person_ids: ['person_client_a'],
      context_input: '本轮只验证平台预览、草稿可见和发送阻断，不执行真实发送。',
      preferred_channel: 'wechat',
      user_constraints: ['必须保留人工确认', '不得真实发送']
    },
    social_graph: socialGraph,
    user_preferences: {
      automation_comfort: 'high',
      risk_tolerance: 'low',
      relationship_priority: 'high',
      preferred_channels: ['wechat']
    },
    allow_platform_send: true,
    activation: {
      mode: 'immediate',
      run_at: new Date().toISOString(),
      recurrence: null,
      timezone: 'Asia/Shanghai'
    },
    notification_preferences: {
      channels: ['in_app'],
      notify_on: ['send_failed']
    }
  });

  const automationPreview = buildAutomationPreview({
    triggerPlan,
    platform,
    target: {
      display_name: '受控测试联系人',
      platform_handle: 'controlled_test_contact_pt004',
      channel: 'wechat'
    },
    messageDraft: '受控验证草稿：这条消息只用于检查预览和发送阻断，等待人工确认前不会发送。',
    operator: 'pt004_controlled_validation'
  });

  const previewTrial = runAutomationPreviewTrial({
    automationPreview,
    environment: {
      test_page_available: true,
      connector_authorized: false,
      user_confirmed_gate_ids: []
    },
    operator: 'pt004_controlled_validation'
  });
  const pageHtml = renderAutomationPreviewTestPage({
    automationPreview,
    previewTrial
  });

  mkdirSync(outputDir, { recursive: true });
  const htmlPath = path.join(outputDir, 'platform-snapshot.real.html');
  const previewPath = path.join(outputDir, 'platform-snapshot-preview.real.json');
  const previewPayload = {
    schema_version: 'pt004_controlled_platform_snapshot.v1',
    created_at: new Date().toISOString(),
    purpose: 'Controlled PT-004 validation snapshot. This is not copied from examples and does not permit real sending.',
    automation_preview: automationPreview,
    preview_trial: previewTrial,
    control_assertions: {
      source: 'scripts/prepare-controlled-platform-snapshot.mjs',
      copied_from_examples: false,
      real_execution_allowed: false,
      requires_user_confirmation: automationPreview.message_preview.requires_user_confirmation === true,
      send_allowed: automationPreview.message_preview.send_allowed === true
    }
  };

  writeFileSync(htmlPath, pageHtml, 'utf8');
  writeFileSync(previewPath, `${JSON.stringify(previewPayload, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    command: 'prepare-controlled-platform-snapshot',
    html_path: htmlPath,
    preview_path: previewPath,
    platform,
    preview_id: automationPreview.preview_id,
    trial_id: previewTrial.trial_id,
    preview_reached: previewTrial.preview_reached,
    real_execution_allowed: previewTrial.real_execution_allowed,
    send_allowed: automationPreview.message_preview.send_allowed,
    next_command: 'npm run mvp:inputs:check'
  }, null, 2));
}
