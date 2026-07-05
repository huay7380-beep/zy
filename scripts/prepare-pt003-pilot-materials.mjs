#!/usr/bin/env node
import path from 'node:path';
import {
  buildPt003PilotMaterials,
  writePt003PilotMaterials
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function resolvedArg(name) {
  const value = argValue(name);
  return value ? path.resolve(value) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/prepare-pt003-pilot-materials.mjs',
    '',
    'Options:',
    '  --root=<dir>              Workspace root. Defaults to current directory.',
    '  --input-readiness=<file>  Optional mvp-external-input-readiness.json. Defaults to latest runtime/input-readiness/**.',
    '  --observation=<file>      Optional intake-observation.real.json. Defaults to latest runtime/desktop-inbox-real/**.',
    '  --ingestion=<file>        Optional desktop-real-intake-ingestion.json. Defaults to latest runtime/desktop-inbox-real/**.',
    '  --output-dir=<dir>        Defaults to runtime/pt003-pilot-materials/<material_id>.',
    '',
    'This command prepares PT-003 handoff materials only. It never writes runtime/user-inputs/pilot-import.real.json and never attempts a real send.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const materials = buildPt003PilotMaterials({
    root,
    inputReadinessPath: resolvedArg('input-readiness'),
    observationPath: resolvedArg('observation'),
    ingestionPath: resolvedArg('ingestion')
  });
  const written = writePt003PilotMaterials({
    root,
    materials,
    outputDir: resolvedArg('output-dir') ?? undefined
  });

  console.log(JSON.stringify({
    command: 'prepare-pt003-pilot-materials',
    material_id: materials.material_id,
    gate_decision: materials.gate_decision,
    blockers: materials.blockers,
    target_file: materials.target_file,
    current_readiness: materials.current_readiness,
    evidence_summary: materials.available_evidence.usable_for_pt003,
    json_path: written.json_path,
    markdown_path: written.markdown_path,
    draft_path: written.draft_path,
    real_send_attempted: false,
    next_commands: materials.validation_commands
  }, null, 2));
}
