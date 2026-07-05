#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  runMvpLoopFromPilotImport
} from '../packages/mvp-runtime/src/index.mjs';
import {
  buildControlledSendCommandDraft,
  writeControlledSendCommandDraft
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/write-controlled-send-command-draft.mjs',
    '',
    'Options:',
    '  --pilot-import=<file>       Defaults to runtime/user-inputs/pilot-import.real.json.',
    '  --user-feedback=<file>      Defaults to examples/mvp-user-feedback.sample.json.',
    '  --output-dir=<dir>          Defaults to runtime/controlled-send-command-drafts/<draft_id>.',
    '  --conversation-title=<text> Optional confirmed test-window title.',
    '  --platform-handle=<text>    Optional confirmed test account/window handle.',
    '',
    'This command never writes runtime/user-inputs/controlled-send-command.real.json and never sends a message.'
  ].join('\n');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = process.cwd();
  const pilotImportPath = path.resolve(argValue('pilot-import') ?? 'runtime/user-inputs/pilot-import.real.json');
  const userFeedbackPath = path.resolve(argValue('user-feedback') ?? 'examples/mvp-user-feedback.sample.json');
  const outputDir = argValue('output-dir') ? path.resolve(argValue('output-dir')) : null;
  const pilotImport = readJson(pilotImportPath);
  const userTestFeedback = readJson(userFeedbackPath);
  const result = runMvpLoopFromPilotImport({
    root,
    importPath: pilotImportPath,
    userTestFeedback
  });
  const targetThreadHint = {
    ...(argValue('conversation-title') ? { conversation_title: argValue('conversation-title') } : {}),
    ...(argValue('platform-handle') ? { platform_handle: argValue('platform-handle') } : {})
  };
  const draft = buildControlledSendCommandDraft({
    root,
    mvpLoopResult: result,
    pilotImport,
    outputDir,
    targetThreadHint
  });
  const written = writeControlledSendCommandDraft({ draft });

  console.log(JSON.stringify({
    command: 'write-controlled-send-command-draft',
    draft_id: draft.draft_id,
    gate_decision: draft.gate_decision,
    real_send_attempted: draft.real_send_attempted,
    target_command_path: draft.target_command_path,
    json_path: written.json_path,
    markdown_path: written.markdown_path,
    command_draft_path: written.command_draft_path,
    source_run_id: draft.source.run_id,
    decision_id: draft.source.decision_id,
    trigger_id: draft.source.trigger_id,
    message_draft_sha256: draft.command_summary.message_draft_sha256,
    next_commands: draft.next_commands
  }, null, 2));
}
