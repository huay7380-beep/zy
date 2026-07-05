#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildExternalChatExportObservation,
  writeExternalChatExportObservation
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/capture-external-chat-export-observation.mjs --file=<chat-export.txt>',
    '',
    'Options:',
    '  --root=<dir>                  Workspace root. Defaults to current directory.',
    '  --thread-title=<title>        Optional source conversation title.',
    '  --thread-id=<id>              Optional source conversation/thread id.',
    '  --participants=<a,b>          Optional comma-separated participant hints.',
    '  --adapter-id=<id>             Defaults to external_chat_export.next.',
    '  --platform=<platform>         Defaults to external_chat_export.',
    '  --privacy-level=<level>       Defaults to redacted_text.',
    '  --confidence=<0..1>           Defaults to 0.72.',
    '  --output-dir=<dir>            Defaults to runtime/external-chat-intake-real/<observation_id>.',
    '',
    'This command reads a saved chat export and writes an IntakeObservation. It does not open chat software or send messages.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const fileArg = argValue('file');
  if (!fileArg) {
    console.error(usage());
    process.exit(1);
  }

  const exportPath = path.resolve(root, fileArg);
  const exportText = readFileSync(exportPath, 'utf8');
  const preview = buildExternalChatExportObservation({
    exportText,
    exportPath,
    root,
    adapterId: argValue('adapter-id') ?? 'external_chat_export.next',
    platform: argValue('platform') ?? 'external_chat_export',
    threadTitle: argValue('thread-title'),
    threadId: argValue('thread-id'),
    participantHints: argValue('participants'),
    privacyLevel: argValue('privacy-level') ?? 'redacted_text',
    confidence: argValue('confidence') ? Number(argValue('confidence')) : 0.72
  });
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : path.join(root, 'runtime/external-chat-intake-real', preview.observation_id);
  mkdirSync(outputDir, { recursive: true });
  const written = writeExternalChatExportObservation({
    exportPath,
    outputDir,
    root,
    adapterId: preview.source_adapter_id,
    platform: preview.platform,
    threadTitle: argValue('thread-title'),
    threadId: argValue('thread-id'),
    participantHints: argValue('participants'),
    privacyLevel: preview.privacy_level,
    confidence: preview.confidence
  });

  console.log(JSON.stringify({
    command: 'capture-external-chat-export-observation',
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
