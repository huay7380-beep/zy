#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildBusinessApiSnapshotObservation,
  writeBusinessApiSnapshotObservation
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/capture-business-api-snapshot-observation.mjs --json=<snapshot.json>',
    '',
    'Options:',
    '  --root=<dir>                  Workspace root. Defaults to current directory.',
    '  --endpoint=<url-or-name>       Optional source endpoint or API name.',
    '  --record-id=<id>              Optional external record id.',
    '  --thread-title=<title>        Optional business thread title.',
    '  --participants=<a,b>          Optional comma-separated participant hints.',
    '  --adapter-id=<id>             Defaults to business_api.next.',
    '  --platform=<platform>         Defaults to business_system.',
    '  --privacy-level=<level>       Defaults to redacted_text.',
    '  --confidence=<0..1>           Defaults to 0.74.',
    '  --output-dir=<dir>            Defaults to runtime/business-api-intake-real/<observation_id>.',
    '',
    'This command reads a saved API JSON snapshot and writes an IntakeObservation. It does not call external APIs or send messages.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const jsonArg = argValue('json');
  if (!jsonArg) {
    console.error(usage());
    process.exit(1);
  }

  const snapshotPath = path.resolve(root, jsonArg);
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const preview = buildBusinessApiSnapshotObservation({
    snapshot,
    snapshotPath,
    root,
    adapterId: argValue('adapter-id') ?? 'business_api.next',
    platform: argValue('platform') ?? 'business_system',
    endpoint: argValue('endpoint'),
    recordId: argValue('record-id'),
    threadTitle: argValue('thread-title'),
    participantHints: argValue('participants'),
    privacyLevel: argValue('privacy-level') ?? 'redacted_text',
    confidence: argValue('confidence') ? Number(argValue('confidence')) : 0.74
  });
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : path.join(root, 'runtime/business-api-intake-real', preview.observation_id);
  mkdirSync(outputDir, { recursive: true });
  const written = writeBusinessApiSnapshotObservation({
    snapshotPath,
    outputDir,
    root,
    adapterId: preview.source_adapter_id,
    platform: preview.platform,
    endpoint: argValue('endpoint'),
    recordId: argValue('record-id'),
    threadTitle: argValue('thread-title'),
    participantHints: argValue('participants'),
    privacyLevel: preview.privacy_level,
    confidence: preview.confidence
  });

  console.log(JSON.stringify({
    command: 'capture-business-api-snapshot-observation',
    observation_id: written.observation.observation_id,
    source_adapter_id: written.observation.source_adapter_id,
    platform: written.observation.platform,
    real_execution_allowed: written.observation.metadata.real_execution_allowed,
    real_send_attempted: written.observation.metadata.real_send_attempted,
    observation_path: written.observation_path,
    report_path: written.report_path,
    markdown_path: written.markdown_path,
    validation_command: written.report.validation_command,
    next_bridge_command: written.report.next_bridge_command
  }, null, 2));
}
