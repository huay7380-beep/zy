import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildDesktopContextBridge,
  buildReadOnlyExpansionGraphLoopVerification,
  writeReadOnlyExpansionGraphLoopVerification,
  writeDesktopContextBridge
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const item = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

function argValues(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(2)
    .filter((arg) => arg.startsWith(prefix))
    .map((arg) => arg.slice(prefix.length));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function observationFilesFromDir(dirPath) {
  if (!dirPath || !existsSync(dirPath)) return [];
  return readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(dirPath, entry.name))
    .filter((filePath) => {
      try {
        const value = readJson(filePath);
        return Boolean(value.observation_id && value.source_adapter_id);
      } catch {
        return false;
      }
    })
    .sort();
}

function latestRealObservationDir(root = process.cwd()) {
  const base = path.resolve(root, 'runtime/desktop-inbox-real');
  if (!existsSync(base)) return null;
  const dirs = readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(base, entry.name))
    .filter((dir) => existsSync(path.join(dir, 'intake-observation.real.json')))
    .sort();
  return dirs.at(-1) ?? null;
}

const root = path.resolve(argValue('root', process.cwd()));
const observationArgs = argValues('observation').map((item) => path.resolve(item));
const observationDir = argValue('observation-dir');
const latestReal = process.argv.includes('--latest-real');
const verifyExpansion = process.argv.includes('--verify-expansion');
const pilotImportPath = argValue('pilot-import')
  ? path.resolve(argValue('pilot-import'))
  : path.join(root, 'runtime/user-inputs/pilot-import.real.json');
const defaultObservation = path.resolve('examples/intake-observation.sightflow.sample.json');
const candidateDir = observationDir
  ? path.resolve(observationDir)
  : latestReal
    ? latestRealObservationDir(root)
    : null;
const observationPaths = [
  ...observationArgs,
  ...observationFilesFromDir(candidateDir)
];
if (!observationPaths.length && existsSync(defaultObservation)) {
  observationPaths.push(defaultObservation);
}
if (!observationPaths.length) {
  console.error(JSON.stringify({
    command: 'run-desktop-context-bridge',
    gate_decision: 'desktop_context_bridge_missing_observation',
    expected: 'Pass --observation=<IntakeObservation.json>, --observation-dir=<dir>, --latest-real, or keep examples/intake-observation.sightflow.sample.json.'
  }, null, 2));
  process.exit(1);
}

const goal = {
  initial_goal: argValue('goal', '基于桌面接收对话生成下一步回复建议'),
  scene: argValue('scene', null),
  primary_person_id: argValue('primary-person-id', null),
  preferred_channel: argValue('channel', null)
};
Object.keys(goal).forEach((key) => {
  if (goal[key] === null) delete goal[key];
});

const bridge = buildDesktopContextBridge({
  observationPaths,
  goal
});
const outputDirArg = argValue('output-dir');
const outputDir = outputDirArg
  ? path.resolve(outputDirArg)
  : path.resolve('runtime/desktop-context-bridges', bridge.bridge_id);
mkdirSync(outputDir, { recursive: true });
const written = writeDesktopContextBridge({
  bridge,
  outputDir
});
const expansionWritten = verifyExpansion
  ? writeReadOnlyExpansionGraphLoopVerification({
    report: buildReadOnlyExpansionGraphLoopVerification({
      root,
      pilotImportPath,
      observationPaths
    }),
    outputDir
  })
  : null;

console.log(JSON.stringify({
  command: 'run-desktop-context-bridge',
  bridge_id: bridge.bridge_id,
  gate_decision: bridge.gate_decision,
  observation_count: bridge.observation_count,
  raw_observation_count: bridge.raw_observation_count,
  effective_observation_count: bridge.effective_observation_count,
  duplicate_suppressed_count: bridge.duplicate_suppressed_count,
  decision_id: bridge.decision_id,
  context_snapshot_id: bridge.context_snapshot.snapshot_id,
  expert_matrix_schema: bridge.expert_matrix_analysis.schema_version,
  parallel_expert_count: bridge.expert_matrix_analysis.parallel_analysis.completed_expert_count,
  theoretical_top_hypothesis: bridge.theoretical_prediction.top_prediction.hypothesis_id,
  independent_review_level: bridge.independent_review.output_level,
  message_draft_length: bridge.message_draft.draft.length,
  real_execution_allowed: bridge.real_execution_allowed,
  json_path: written.json_path,
  markdown_path: written.markdown_path,
  pilot_import_path: written.pilot_import_path,
  context_snapshot_path: written.context_snapshot_path,
  expansion_verification_path: expansionWritten?.json_path ?? null,
  expansion_verification_markdown_path: expansionWritten?.markdown_path ?? null,
  expansion_raw_observation_count: expansionWritten ? bridge.raw_observation_count : null,
  expansion_effective_observation_count: expansionWritten ? bridge.effective_observation_count : null
}, null, 2));

if (bridge.checks.some((check) => check.status !== 'pass')) {
  process.exitCode = 1;
}
