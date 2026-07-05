#!/usr/bin/env node
import path from 'node:path';
import {
  buildReadOnlySourceCollectionManifestKit,
  writeReadOnlySourceCollectionManifestKit
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/init-read-only-source-collection-manifest.mjs',
    '',
    'Options:',
    '  --root=<dir>              Workspace root. Defaults to current directory.',
    '  --collection-id=<id>      Optional collection_id for the target manifest template.',
    '  --target-manifest=<file>  Defaults to runtime/user-inputs/read-only-source-collection.manifest.json.',
    '  --source-dir=<dir>        Defaults to runtime/user-inputs/read-only-sources.',
    '  --output-dir=<dir>        Defaults to runtime/read-only-source-collection-manifest-kits/<kit_id>.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const kit = buildReadOnlySourceCollectionManifestKit({
    root,
    collectionId: argValue('collection-id'),
    targetManifestPath: argValue('target-manifest') ?? undefined,
    sourceDir: argValue('source-dir') ?? undefined,
    generatedBy: 'scripts/init-read-only-source-collection-manifest.mjs'
  });
  const outputDir = argValue('output-dir') ? path.resolve(root, argValue('output-dir')) : undefined;
  const { kit: report, written } = writeReadOnlySourceCollectionManifestKit({
    kit,
    root,
    outputDir
  });

  console.log(JSON.stringify({
    command: 'init-read-only-source-collection-manifest',
    kit_id: report.kit_id,
    collection_id: report.collection_id,
    template_only: report.template_only,
    real_execution_allowed: report.real_execution_allowed,
    real_send_attempted: report.real_send_attempted,
    target_manifest_path: report.target_manifest_path,
    target_manifest_exists: report.target_manifest_exists,
    target_manifest_intentionally_not_written: report.target_manifest_intentionally_not_written,
    recommended_source_dir: report.recommended_source_dir,
    template_path: written.template_path,
    readme_path: written.readme_path,
    json_path: written.json_path,
    markdown_path: written.markdown_path,
    next_commands: report.next_commands
  }, null, 2));
}
