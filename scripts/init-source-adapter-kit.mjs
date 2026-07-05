#!/usr/bin/env node
import path from 'node:path';
import {
  buildSourceAdapterInitKit,
  writeSourceAdapterInitKit
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/init-source-adapter-kit.mjs --adapter-id=<id> --source-type=<desktop|browser|api|file|ocr|webhook> --platform=<platform>',
    '',
    'Options:',
    '  --adapter-version=<version> Defaults to 0.1.0.',
    '  --can-send                  Mark adapter as send-capable, still defaulting real execution to false.',
    '  --output-dir=<dir>          Defaults to runtime/source-adapter-kits/<kit_id>.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const adapterId = argValue('adapter-id');
  const sourceType = argValue('source-type');
  const platform = argValue('platform');
  if (!adapterId || !sourceType || !platform) {
    console.error(usage());
    process.exit(1);
  }

  const kit = buildSourceAdapterInitKit({
    adapterId,
    sourceType,
    platform,
    adapterVersion: argValue('adapter-version') ?? '0.1.0',
    canSend: process.argv.includes('--can-send'),
    generatedBy: 'scripts/init-source-adapter-kit.mjs'
  });
  const outputDir = argValue('output-dir') ? path.resolve(argValue('output-dir')) : undefined;
  const { kit: report, written } = writeSourceAdapterInitKit({ kit, outputDir });

  console.log(JSON.stringify({
    command: 'init-source-adapter-kit',
    kit_id: report.kit_id,
    adapter_id: report.adapter_id,
    source_type: report.source_type,
    platform: report.platform,
    can_send_requested: report.can_send_requested,
    capability_template_path: written.capability_template_path,
    observation_template_path: written.observation_template_path,
    validation_command: report.validation_command,
    json_path: written.json_path,
    markdown_path: written.markdown_path
  }, null, 2));
}
