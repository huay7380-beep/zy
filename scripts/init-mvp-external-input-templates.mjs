#!/usr/bin/env node
import path from 'node:path';
import {
  initializeMvpExternalInputTemplates
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/init-mvp-external-input-templates.mjs',
    '',
    'Options:',
    '  --kit=<file>          Optional mvp-external-input-kit.json. Defaults to latest runtime/input-kits/**.',
    '  --root=<dir>          Workspace root. Defaults to current directory.',
    '  --templates-dir=<dir> Defaults to runtime/user-inputs/templates.',
    '  --output-dir=<dir>    Defaults to runtime/input-templates/<template_init_id>.',
    '  --overwrite           Replace existing template files.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
  const inputKitPath = argValue('kit') ? path.resolve(argValue('kit')) : null;
  const templatesDir = argValue('templates-dir')
    ? path.resolve(argValue('templates-dir'))
    : path.join(root, 'runtime/user-inputs/templates');
  const outputDir = argValue('output-dir') ? path.resolve(argValue('output-dir')) : null;
  const { init, written } = initializeMvpExternalInputTemplates({
    root,
    inputKitPath,
    templatesDir,
    outputDir,
    overwrite: process.argv.includes('--overwrite')
  });

  console.log(JSON.stringify({
    command: 'init-mvp-external-input-templates',
    template_init_id: init.template_init_id,
    source_kit_id: init.source_kit_id,
    templates_dir: init.templates_dir,
    readme_path: init.readme_path,
    templates: init.templates.map((item) => ({
      issue_id: item.issue_id,
      kind: item.kind,
      status: item.status,
      template_path: item.template_path,
      real_target_path: item.real_target_path
    })),
    json_path: written.json_path,
    markdown_path: written.markdown_path
  }, null, 2));
}
