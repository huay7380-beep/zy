import path from 'node:path';
import {
  buildIdentityConfirmationUiModel,
  createIdentityStore,
  writeIdentityConfirmationUi
} from '../packages/identity-resolution/src/index.mjs';

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/write-identity-confirmation-ui.mjs --data-dir=<data> [--output-dir=<dir>] [--actor=<name>]',
    '  node scripts/write-identity-confirmation-ui.mjs --run-dir=<run-dir-with-data> [--output-dir=<dir>] [--actor=<name>]'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const dataDir = argValue('data-dir')
    ? path.resolve(argValue('data-dir'))
    : (argValue('run-dir') ? path.resolve(argValue('run-dir'), 'data') : null);
  if (!dataDir) {
    console.error(usage());
    process.exitCode = 2;
  } else {
    const store = createIdentityStore({ dataDir });
    const model = buildIdentityConfirmationUiModel(store, {
      actor: argValue('actor', 'operator')
    });
    const outputDir = argValue('output-dir')
      ? path.resolve(argValue('output-dir'))
      : undefined;
    const written = writeIdentityConfirmationUi({ model, outputDir });
    console.log(JSON.stringify({
      command: 'write-identity-confirmation-ui',
      schema_version: model.schema_version,
      pending_count: model.summary.pending_count,
      confirmation_count: model.summary.confirmation_count,
      html_path: written.html_path,
      json_path: written.json_path
    }, null, 2));
  }
}
