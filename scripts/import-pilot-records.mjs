import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  importPilotBatch,
  initializeStorage,
  normalizePilotImportBatch
} from '../packages/storage-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/import-pilot-records.mjs --input=examples/pilot-import-batch.sample.json',
    '',
    'Options:',
    '  --input=<file>     PilotImportBatch JSON file.',
    '  --data-dir=<dir>   Output data directory. Defaults to runtime/imports/<import_id>/data.',
    '  --dry-run          Normalize and score without writing storage files.'
  ].join('\n');
}

const inputPath = argValue('input');
const dataDirArg = argValue('data-dir');
const dryRun = process.argv.includes('--dry-run');

if (!inputPath) {
  console.error(usage());
  process.exitCode = 1;
} else {
  const batch = JSON.parse(readFileSync(inputPath, 'utf8'));
  const normalized = normalizePilotImportBatch(batch);
  const dataDir = dataDirArg
    ? path.resolve(dataDirArg)
    : path.resolve('runtime/imports', normalized.import_id, 'data');

  const result = dryRun
    ? {
        import_id: normalized.import_id,
        data_dir: null,
        dry_run: true,
        summary: normalized.summary
      }
    : (() => {
        const storage = initializeStorage({ dataDir });
        const imported = importPilotBatch(storage, batch, {
          actor: `pilot_import:${normalized.import_id}`
        });
        return {
          import_id: imported.import_id,
          data_dir: dataDir,
          dry_run: false,
          summary: imported.summary,
          skipped_duplicates: imported.skipped_duplicates,
          indexes_rebuilt: imported.indexes_rebuilt
        };
      })();

  console.log(JSON.stringify(result, null, 2));
}
