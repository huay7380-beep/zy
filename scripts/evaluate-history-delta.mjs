import { writeHistoryDeltaIntentEvaluation } from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/evaluate-history-delta.mjs',
    '',
    'Options:',
    '  --history=<file>            Historical dialogue source. Defaults to 问答记录.txt.',
    '  --organized-history=<file>  Organized historical summary. Defaults to tupu/00-问答记录整理归纳.md.',
    '  --pilot-import=<file>       Current PilotImportBatch. Defaults to runtime/user-inputs/pilot-import.real.json.',
    '  --output-dir=<dir>          Output directory. Defaults to runtime/intake-validations/<import_id>.',
    '  --current-objective=<text>  Current thread objective text used for intent evaluation.'
  ].join('\n');
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(usage());
  process.exit(0);
}

const currentObjectiveText = argValue('current-objective')
  ?? '重新读取新的历史对话记录，检查新增内容区分、去重存储、读取意图识别、当前/历史对话边界、最新回复评估是否考虑历史增量，并对比现行方案和已完成评估方案。';

const result = writeHistoryDeltaIntentEvaluation({
  historyPath: argValue('history') ?? '问答记录.txt',
  organizedHistoryPath: argValue('organized-history') ?? 'tupu/00-问答记录整理归纳.md',
  pilotImportPath: argValue('pilot-import') ?? 'runtime/user-inputs/pilot-import.real.json',
  outputDir: argValue('output-dir') ?? null,
  currentObjectiveText
});

console.log(JSON.stringify({
  command: 'evaluate-history-delta',
  evaluation_id: result.report.evaluation_id,
  gate_decision: result.report.gate_decision,
  new_content_status: result.report.new_content_detection.status,
  required_failures: result.report.required_failures,
  json_path: result.jsonPath,
  archive_json_path: result.archiveJsonPath,
  markdown_path: result.markdownPath
}, null, 2));
