import path from 'node:path';
import { readdirSync } from 'node:fs';
import {
  validateProcessTreeSync,
  writeProcessTreeValidation
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function findDocsMainPath(root) {
  const docsDir = path.join(root, 'docs');
  const match = readdirSync(docsDir).find((name) => name.startsWith('15-') && name.endsWith('.md'));
  return match ? path.join(docsDir, match) : path.join(docsDir, '15-系统流程树与扩展问题台账.md');
}

function usage() {
  return [
    'Usage:',
    '  node scripts/validate-process-tree.mjs',
    '',
    'Options:',
    '  --process-tree=<file>       Defaults to examples/system-process-tree.json.',
    '  --docs-main=<file>          Defaults to docs/15-系统流程树与扩展问题台账.md.',
    '  --obsidian-md=<file>        Defaults to views/obsidian/system-process-tree.md.',
    '  --obsidian-canvas=<file>    Defaults to views/obsidian/system-process-tree.canvas.',
    '  --output-dir=<dir>          Defaults to runtime/process-tree-validations/<validation_id>.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const root = path.resolve('.');
  const validation = validateProcessTreeSync({
    root,
    processTreePath: path.resolve(argValue('process-tree') ?? 'examples/system-process-tree.json'),
    docsMainPath: path.resolve(argValue('docs-main') ?? findDocsMainPath(root)),
    obsidianMarkdownPath: path.resolve(argValue('obsidian-md') ?? 'views/obsidian/system-process-tree.md'),
    obsidianCanvasPath: path.resolve(argValue('obsidian-canvas') ?? 'views/obsidian/system-process-tree.canvas')
  });
  const written = writeProcessTreeValidation({
    validation,
    outputDir: argValue('output-dir')
      ? path.resolve(argValue('output-dir'))
      : undefined
  });

  console.log(JSON.stringify({
    command: 'validate-process-tree',
    validation_id: validation.validation_id,
    gate_decision: validation.gate_decision,
    required_failures: validation.required_failures,
    warning_failures: validation.warning_failures,
    json_path: written.json_path,
    markdown_path: written.markdown_path
  }, null, 2));

  if (validation.required_failures.length > 0) {
    process.exitCode = 2;
  }
}
