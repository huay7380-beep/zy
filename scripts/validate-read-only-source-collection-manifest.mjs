#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  buildReadOnlySourceCollectionManifestReadiness,
  readReadOnlySourceCollectionManifest,
  writeReadOnlySourceCollectionManifestReadiness
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/validate-read-only-source-collection-manifest.mjs --manifest=<manifest.json>',
    '',
    'Options:',
    '  --root=<dir>                    Workspace root. Defaults to current directory.',
    '  --output-dir=<dir>              Defaults to runtime/read-only-source-collection-manifest-readiness/<readiness_id>.',
    '  --require-recommended-kinds     Treat missing external_chat_export/browser_html/business_api_snapshot as required.',
    '  --fail-on-required              Exit non-zero when required_failures is not empty.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const manifestArg = argValue('manifest');
  if (!manifestArg) {
    console.error(usage());
    process.exit(1);
  }

  const manifestPath = path.resolve(root, manifestArg);
  let manifest = null;
  let manifestReadError = null;
  try {
    if (!existsSync(manifestPath)) {
      manifestReadError = 'manifest_file_not_found';
    } else {
      manifest = readReadOnlySourceCollectionManifest(manifestPath);
    }
  } catch (error) {
    manifestReadError = error.message;
  }

  const readiness = buildReadOnlySourceCollectionManifestReadiness({
    root,
    manifest,
    manifestPath,
    manifestReadError,
    requireRecommendedKinds: process.argv.includes('--require-recommended-kinds')
  });
  const outputDir = argValue('output-dir') ? path.resolve(root, argValue('output-dir')) : undefined;
  const written = writeReadOnlySourceCollectionManifestReadiness({
    readiness,
    outputDir
  });

  console.log(JSON.stringify({
    command: 'validate-read-only-source-collection-manifest',
    readiness_id: readiness.readiness_id,
    gate_decision: readiness.gate_decision,
    ready_for_collection: readiness.ready_for_collection,
    real_execution_allowed: readiness.real_execution_allowed,
    real_send_attempted: readiness.real_send_attempted,
    manifest_sources: readiness.summary.manifest_sources,
    ready_sources: readiness.summary.ready_sources,
    required_failures: readiness.required_failures,
    warning_failures: readiness.warning_failures,
    json_path: written.json_path,
    markdown_path: written.markdown_path
  }, null, 2));

  if (process.argv.includes('--fail-on-required') && readiness.required_failures.length) {
    process.exit(1);
  }
}
