#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildBrowserHtmlObservation,
  writeBrowserHtmlObservation
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/capture-browser-html-observation.mjs --html=<saved-page.html>',
    '',
    'Options:',
    '  --root=<dir>                  Workspace root. Defaults to current directory.',
    '  --url=<url>                   Optional source page URL.',
    '  --adapter-id=<id>             Defaults to browser_dom.next.',
    '  --platform=<platform>         Defaults to web.',
    '  --privacy-level=<level>       Defaults to redacted_text.',
    '  --confidence=<0..1>           Defaults to 0.76.',
    '  --output-dir=<dir>            Defaults to runtime/browser-intake-real/<observation_id>.',
    '',
    'This command reads a saved HTML page and writes an IntakeObservation. It does not open a browser, submit forms, or send messages.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const htmlArg = argValue('html');
  if (!htmlArg) {
    console.error(usage());
    process.exit(1);
  }

  const htmlPath = path.resolve(root, htmlArg);
  const html = readFileSync(htmlPath, 'utf8');
  const preview = buildBrowserHtmlObservation({
    html,
    htmlPath,
    root,
    adapterId: argValue('adapter-id') ?? 'browser_dom.next',
    platform: argValue('platform') ?? 'web',
    pageUrl: argValue('url'),
    privacyLevel: argValue('privacy-level') ?? 'redacted_text',
    confidence: argValue('confidence') ? Number(argValue('confidence')) : 0.76
  });
  const outputDir = argValue('output-dir')
    ? path.resolve(root, argValue('output-dir'))
    : path.join(root, 'runtime/browser-intake-real', preview.observation_id);
  mkdirSync(outputDir, { recursive: true });
  const written = writeBrowserHtmlObservation({
    htmlPath,
    outputDir,
    root,
    adapterId: preview.source_adapter_id,
    platform: preview.platform,
    pageUrl: argValue('url'),
    privacyLevel: preview.privacy_level,
    confidence: preview.confidence
  });

  console.log(JSON.stringify({
    command: 'capture-browser-html-observation',
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
