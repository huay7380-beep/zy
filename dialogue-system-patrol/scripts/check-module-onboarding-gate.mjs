import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { computeBlockSourceFingerprint, sourceHashMatches } from './source-hash-lib.mjs'
import {
  latestTimelineEvent,
  readTimelineEvents,
  timelinePathForEntry,
  validateTimelineEvents
} from './build-timeline-lib.mjs'

const ROOT = path.resolve('.')
const PROCESS_TREE_PATH = 'examples/system-process-tree.json'
const REGISTRY_PATH = 'dialogue-system-patrol/registry/system-patrol-registry.json'
const SYSTEM_PATROL_VALIDATION_PATH = 'runtime/dialogue-system-patrol-validations/latest.json'
const PROCESS_TREE_VALIDATION_DIR = 'runtime/process-tree-validations'
const OUTPUT_DIR = 'runtime/dialogue-system-patrol-module-gates'

function argValue(name) {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function nowIso() {
  return new Date().toISOString()
}

function gateId(date = new Date()) {
  return `module_onboarding_gate_${date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.resolve(ROOT, relativePath), 'utf8'))
}

function readJsonIfExists(relativePath) {
  const resolved = path.resolve(ROOT, relativePath)
  if (!existsSync(resolved)) return null
  return JSON.parse(readFileSync(resolved, 'utf8'))
}

function mtimeMsIfExists(relativePath) {
  if (!relativePath) return 0
  const resolved = path.resolve(ROOT, relativePath)
  return existsSync(resolved) ? statSync(resolved).mtimeMs : 0
}

function safeRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    return { ok: false, error: 'path_empty' }
  }
  if (path.isAbsolute(relativePath)) {
    return { ok: false, error: 'path_must_be_relative' }
  }
  const resolved = path.resolve(ROOT, relativePath)
  const rel = path.relative(ROOT, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: 'path_escapes_workspace' }
  }
  return { ok: true, resolved, rel: rel.replace(/\\/g, '/') }
}

function latestProcessTreeValidationPath() {
  const resolved = path.resolve(ROOT, PROCESS_TREE_VALIDATION_DIR)
  if (!existsSync(resolved)) return null
  const dirs = readdirSync(resolved)
    .filter((name) => name.startsWith('process_tree_validation_'))
    .sort()
  const latest = dirs.at(-1)
  return latest ? `${PROCESS_TREE_VALIDATION_DIR}/${latest}/process-tree-validation.json` : null
}

function makeCheck({
  check_id,
  label,
  passed,
  severity = 'required',
  evidence = [],
  fix = null
}) {
  return {
    check_id,
    label,
    severity,
    status: passed ? 'pass' : 'fail',
    passed: Boolean(passed),
    evidence: evidence.filter((item) => item !== undefined && item !== null && item !== ''),
    fix
  }
}

function loadBlock(entry) {
  if (!entry?.patrol_block_path) return { path_ok: false, exists: false, block: null, error: 'missing_patrol_block_path' }
  const blockPath = safeRelativePath(entry.patrol_block_path)
  if (!blockPath.ok) return { path_ok: false, exists: false, block: null, error: blockPath.error }
  if (!existsSync(blockPath.resolved)) return { path_ok: true, exists: false, block: null, error: 'missing_patrol_block' }
  try {
    return { path_ok: true, exists: true, block: JSON.parse(readFileSync(blockPath.resolved, 'utf8')), error: null }
  } catch (error) {
    return { path_ok: true, exists: true, block: null, error: `patrol_block_unreadable:${String(error).slice(0, 100)}` }
  }
}

function loadStatusCard(entry) {
  if (!entry?.status_card_output) return { path_ok: false, exists: false, card: null, error: 'missing_status_card_path' }
  const cardPath = safeRelativePath(entry.status_card_output)
  if (!cardPath.ok) return { path_ok: false, exists: false, card: null, error: cardPath.error }
  if (!existsSync(cardPath.resolved)) return { path_ok: true, exists: false, card: null, error: 'missing_status_card' }
  try {
    return { path_ok: true, exists: true, card: JSON.parse(readFileSync(cardPath.resolved, 'utf8')), error: null }
  } catch (error) {
    return { path_ok: true, exists: true, card: null, error: `status_card_unreadable:${String(error).slice(0, 100)}` }
  }
}

function loadStatusEvents(entry) {
  if (!entry?.status_event_output) return { path_ok: false, exists: false, events: [], error: 'missing_status_event_path' }
  const eventPath = safeRelativePath(entry.status_event_output)
  if (!eventPath.ok) return { path_ok: false, exists: false, events: [], error: eventPath.error }
  if (!existsSync(eventPath.resolved)) return { path_ok: true, exists: false, events: [], error: 'missing_status_event' }
  try {
    const parsed = JSON.parse(readFileSync(eventPath.resolved, 'utf8'))
    const events = Array.isArray(parsed?.events) ? parsed.events : [parsed].filter(Boolean)
    return { path_ok: true, exists: true, events, error: null }
  } catch (error) {
    return { path_ok: true, exists: true, events: [], error: `status_event_unreadable:${String(error).slice(0, 100)}` }
  }
}

function loadBuildTimeline(entry) {
  if (!entry?.build_timeline_output) return {
    path_ok: false,
    exists: false,
    events: [],
    latest: null,
    mtime_ms: 0,
    errors: ['missing_build_timeline_path']
  }
  const read = readTimelineEvents({ root: ROOT, relativePath: timelinePathForEntry(entry) })
  const errors = read.exists
    ? [...read.errors, ...validateTimelineEvents(read.events, { moduleId: entry.module_id })]
    : read.errors
  return {
    path_ok: read.path_ok,
    exists: read.exists,
    events: read.events,
    latest: latestTimelineEvent(read.events),
    mtime_ms: read.mtime_ms,
    errors
  }
}

function checkModule({
  moduleId,
  processTree,
  registry,
  systemPatrolValidation,
  processTreeValidation,
  processTreeValidationPath
}) {
  const processNode = (processTree.nodes ?? []).find((node) => node.node_id === moduleId)
  const entry = (registry.entries ?? []).find((item) => item.module_id === moduleId)
  const blockResult = loadBlock(entry)
  const cardResult = loadStatusCard(entry)
  const eventResult = loadStatusEvents(entry)
  const timelineResult = loadBuildTimeline(entry)
  const sourceFingerprint = blockResult.block
    ? computeBlockSourceFingerprint({ root: ROOT, block: blockResult.block, entry })
    : null
  const sourceHashFailures = sourceFingerprint
    ? [
        ...sourceFingerprint.errors,
        ...(sourceHashMatches(blockResult.block?.versioning?.source_hash, sourceFingerprint.hash)
          ? []
          : [`stored=${blockResult.block?.versioning?.source_hash || 'missing'} computed=${sourceFingerprint.hash}`])
      ]
    : ['missing_patrol_block']
  const finding = (systemPatrolValidation?.module_findings ?? []).find((item) => item.module_id === moduleId)
  const systemPatrolValidationMtime = mtimeMsIfExists(SYSTEM_PATROL_VALIDATION_PATH)
  const processTreeValidationMtime = mtimeMsIfExists(processTreeValidationPath)
  const patrolInputsMtime = Math.max(
    mtimeMsIfExists(REGISTRY_PATH),
    mtimeMsIfExists(entry?.patrol_block_path),
    mtimeMsIfExists(entry?.status_card_output),
    mtimeMsIfExists(entry?.status_event_output)
  )
  const processTreeInputsMtime = Math.max(
    mtimeMsIfExists(PROCESS_TREE_PATH),
    mtimeMsIfExists('views/obsidian/system-process-tree.md'),
    mtimeMsIfExists('views/obsidian/system-process-tree.canvas')
  )
  const checks = []

  checks.push(makeCheck({
    check_id: 'process_tree_node_registered',
    label: 'Module has a process-tree node',
    passed: Boolean(processNode),
    evidence: [moduleId],
    fix: 'Register the module in examples/system-process-tree.json before exposing it as a visible module.'
  }))
  checks.push(makeCheck({
    check_id: 'registry_entry_registered',
    label: 'Module has a system patrol registry entry',
    passed: Boolean(entry),
    evidence: [entry?.patrol_block_path],
    fix: 'Add or initialize a registry entry through system-patrol:blocks:init or a confirmed manual entry.'
  }))
  checks.push(makeCheck({
    check_id: 'registry_maps_process_tree_node',
    label: 'Registry entry maps to the process-tree node',
    passed: Boolean(entry && entry.source === 'process_tree' && entry.process_tree_node_id === moduleId),
    evidence: [`source=${entry?.source}`, `process_tree_node_id=${entry?.process_tree_node_id}`],
    fix: 'Set entry.source to process_tree and entry.process_tree_node_id to the module id, unless a confirmed manual exception exists.'
  }))
  checks.push(makeCheck({
    check_id: 'patrol_block_exists',
    label: 'Module patrol block exists and is readable',
    passed: Boolean(blockResult.path_ok && blockResult.exists && blockResult.block),
    evidence: [entry?.patrol_block_path, blockResult.error],
    fix: 'Create or repair the module patrol block before claiming module status.'
  }))
  checks.push(makeCheck({
    check_id: 'patrol_block_matches_module',
    label: 'Module patrol block matches module id',
    passed: Boolean(blockResult.block?.module_id === moduleId),
    evidence: [`block.module_id=${blockResult.block?.module_id}`],
    fix: 'Set module_id in the patrol block to the target module id.'
  }))
  checks.push(makeCheck({
    check_id: 'source_hash_current',
    label: 'Module patrol source hash matches current evidence source refs',
    passed: sourceHashFailures.length === 0,
    evidence: [
      `stored=${blockResult.block?.versioning?.source_hash}`,
      `computed=${sourceFingerprint?.hash}`,
      `source_files=${sourceFingerprint?.source_files.length ?? 0}`,
      ...sourceHashFailures
    ],
    fix: 'After reviewing the module change and updating the patrol block, run npm.cmd run system-patrol:source-drift -- --update --module-id=<module_id>.'
  }))
  checks.push(makeCheck({
    check_id: 'status_card_exists',
    label: 'Dialogue-readable status card exists and matches module id',
    passed: Boolean(cardResult.path_ok && cardResult.exists && cardResult.card?.module_id === moduleId),
    evidence: [entry?.status_card_output, cardResult.error, `card.module_id=${cardResult.card?.module_id}`],
    fix: 'Run npm.cmd run system-patrol:publish after patrol validation passes.'
  }))
  checks.push(makeCheck({
    check_id: 'status_event_exists',
    label: 'Dialogue-readable status event exists and matches module id',
    passed: Boolean(eventResult.path_ok && eventResult.exists && eventResult.events.some((event) => event.source_module === moduleId)),
    evidence: [entry?.status_event_output, eventResult.error, `events=${eventResult.events.length}`],
    fix: 'Run npm.cmd run system-patrol:publish and keep at least one event for this module.'
  }))
  checks.push(makeCheck({
    check_id: 'build_timeline_output_registered',
    label: 'Module registry declares a build timeline output',
    passed: typeof entry?.build_timeline_output === 'string'
      && entry.build_timeline_output.startsWith('runtime/module-build-timelines/')
      && entry.build_timeline_output.endsWith('.jsonl'),
    evidence: [entry?.build_timeline_output],
    fix: 'Set entry.build_timeline_output to runtime/module-build-timelines/<module_id>.jsonl.'
  }))
  checks.push(makeCheck({
    check_id: 'build_timeline_exists',
    label: 'Module build timeline exists and is readable',
    passed: Boolean(timelineResult.path_ok && timelineResult.exists && timelineResult.events.length > 0),
    evidence: [
      entry?.build_timeline_output,
      `events=${timelineResult.events.length}`,
      ...timelineResult.errors
    ],
    fix: 'Run npm.cmd run system-patrol:timeline -- --module-id=<module_id> --phase=implementation_changed --status=in_progress.'
  }))
  checks.push(makeCheck({
    check_id: 'build_timeline_latest_matches_module',
    label: 'Latest build timeline event matches module and exposes phase/status',
    passed: Boolean(
      timelineResult.latest?.module_id === moduleId
      && typeof timelineResult.latest?.phase === 'string'
      && typeof timelineResult.latest?.status === 'string'
      && timelineResult.errors.length === 0
    ),
    evidence: [
      `latest_event_id=${timelineResult.latest?.event_id}`,
      `phase=${timelineResult.latest?.phase}`,
      `status=${timelineResult.latest?.status}`,
      ...timelineResult.errors
    ],
    fix: 'Append a valid module_build_timeline_event.v1 record for this module.'
  }))
  checks.push(makeCheck({
    check_id: 'build_timeline_fresh',
    label: 'Latest build timeline is newer than patrol/status inputs',
    passed: Boolean(timelineResult.mtime_ms >= patrolInputsMtime && timelineResult.mtime_ms > 0),
    evidence: [
      `timeline_mtime=${timelineResult.mtime_ms}`,
      `patrol_inputs_mtime=${patrolInputsMtime}`
    ],
    fix: 'Record a build timeline event after patrol block, status card, or status event changes.'
  }))
  checks.push(makeCheck({
    check_id: 'system_patrol_validation_passed',
    label: 'Latest system patrol validation passes',
    passed: systemPatrolValidation?.gate_decision === 'system_patrol_validated'
      && (systemPatrolValidation.required_failures ?? []).length === 0
      && (systemPatrolValidation.warning_failures ?? []).length === 0,
    evidence: [
      `gate_decision=${systemPatrolValidation?.gate_decision}`,
      `required_failures=${(systemPatrolValidation?.required_failures ?? []).length}`,
      `warning_failures=${(systemPatrolValidation?.warning_failures ?? []).length}`
    ],
    fix: 'Run npm.cmd run system-patrol:validate and resolve required or warning failures.'
  }))
  checks.push(makeCheck({
    check_id: 'system_patrol_validation_fresh',
    label: 'Latest system patrol validation is newer than module patrol inputs',
    passed: Boolean(systemPatrolValidationMtime >= patrolInputsMtime && systemPatrolValidationMtime > 0),
    evidence: [
      `validation_mtime=${systemPatrolValidationMtime}`,
      `patrol_inputs_mtime=${patrolInputsMtime}`
    ],
    fix: 'Run npm.cmd run system-patrol:validate after registry, patrol block, status card, or status event changes.'
  }))
  checks.push(makeCheck({
    check_id: 'module_finding_validated',
    label: 'Latest system patrol validation marks this module validated',
    passed: Boolean(finding?.patrol_state === 'validated' && (finding.findings ?? []).includes('ok')),
    evidence: [`patrol_state=${finding?.patrol_state}`, `findings=${(finding?.findings ?? []).join(',')}`],
    fix: 'Resolve this module finding in runtime/dialogue-system-patrol-validations/latest.json.'
  }))
  checks.push(makeCheck({
    check_id: 'process_tree_validation_synced',
    label: 'Latest process-tree validation is synced',
    passed: processTreeValidation?.gate_decision === 'process_tree_synced'
      && (processTreeValidation.required_failures ?? []).length === 0
      && (processTreeValidation.warning_failures ?? []).length === 0,
    evidence: [
      `gate_decision=${processTreeValidation?.gate_decision}`,
      `required_failures=${(processTreeValidation?.required_failures ?? []).length}`,
      `warning_failures=${(processTreeValidation?.warning_failures ?? []).length}`
    ],
    fix: 'Run npm.cmd run process-tree:validate and resolve process-tree or Obsidian sync failures.'
  }))
  checks.push(makeCheck({
    check_id: 'process_tree_validation_fresh',
    label: 'Latest process-tree validation is newer than process-tree and Obsidian inputs',
    passed: Boolean(processTreeValidationMtime >= processTreeInputsMtime && processTreeValidationMtime > 0),
    evidence: [
      `validation_mtime=${processTreeValidationMtime}`,
      `process_tree_inputs_mtime=${processTreeInputsMtime}`
    ],
    fix: 'Run npm.cmd run process-tree:validate after process-tree or Obsidian view changes.'
  }))

  const required_failures = checks
    .filter((check) => check.severity === 'required' && !check.passed)
    .map((check) => check.check_id)
  const warning_failures = checks
    .filter((check) => check.severity === 'warning' && !check.passed)
    .map((check) => check.check_id)

  return {
    module_id: moduleId,
    gate_decision: required_failures.length ? 'module_onboarding_blocked' : 'module_onboarding_ready',
    checks,
    required_failures,
    warning_failures
  }
}

function makeMarkdown(report) {
  const rows = report.modules
    .map((item) => `| ${item.module_id} | ${item.gate_decision} | ${item.required_failures.join(', ') || 'none'} | ${item.warning_failures.join(', ') || 'none'} |`)
    .join('\n')
  return [
    '# Module Onboarding Gate',
    '',
    `- schema: ${report.schema}`,
    `- gate_id: ${report.gate_id}`,
    `- generated_at: ${report.generated_at}`,
    `- gate_decision: ${report.gate_decision}`,
    `- required_failures: ${report.required_failures.join(', ') || 'none'}`,
    `- warning_failures: ${report.warning_failures.join(', ') || 'none'}`,
    '',
    '| Module | Decision | Required failures | Warning failures |',
    '| --- | --- | --- | --- |',
    rows,
    ''
  ].join('\n')
}

function usage() {
  return [
    'Usage:',
    '  npm.cmd run system-patrol:module-gate -- --module-id=<module_id>',
    '  npm.cmd run system-patrol:module-gate -- --all',
    '',
    'This is a non-enforcing read-only gate. It reports whether a visible module has process-tree, registry, patrol block, status card/event, and validation evidence.'
  ].join('\n')
}

function main() {
  if (hasFlag('help')) {
    console.log(usage())
    return
  }

  const moduleId = argValue('module-id')
  const all = hasFlag('all')
  if (!moduleId && !all) {
    console.error(usage())
    process.exitCode = 2
    return
  }

  const generatedAt = nowIso()
  const id = gateId(new Date(generatedAt))
  const processTree = readJson(PROCESS_TREE_PATH)
  const registry = readJson(REGISTRY_PATH)
  const systemPatrolValidation = readJsonIfExists(SYSTEM_PATROL_VALIDATION_PATH)
  const processTreeValidationPath = latestProcessTreeValidationPath()
  const processTreeValidation = processTreeValidationPath ? readJsonIfExists(processTreeValidationPath) : null
  const moduleIds = all
    ? (registry.entries ?? []).filter((entry) => entry.coverage !== 'excluded').map((entry) => entry.module_id)
    : [moduleId]

  const modules = moduleIds.map((targetModuleId) => checkModule({
    moduleId: targetModuleId,
    processTree,
    registry,
    systemPatrolValidation,
    processTreeValidation,
    processTreeValidationPath
  }))
  const required_failures = modules.flatMap((item) => item.required_failures.map((failure) => `${item.module_id}:${failure}`))
  const warning_failures = modules.flatMap((item) => item.warning_failures.map((failure) => `${item.module_id}:${failure}`))
  const report = {
    schema: 'module_onboarding_gate.v1',
    gate_id: id,
    generated_at: generatedAt,
    gate_decision: required_failures.length ? 'module_onboarding_blocked' : 'module_onboarding_ready',
    source: {
      process_tree_path: PROCESS_TREE_PATH,
      registry_path: REGISTRY_PATH,
      system_patrol_validation_path: SYSTEM_PATROL_VALIDATION_PATH,
      process_tree_validation_path: processTreeValidationPath
    },
    modules,
    required_failures,
    warning_failures,
    boundary: [
      'read-only gate',
      'no business module rewrite',
      'no dialogue reader rewrite',
      'strict required coverage respected',
      'no external action'
    ]
  }

  const outputDir = path.resolve(ROOT, OUTPUT_DIR, id)
  mkdirSync(outputDir, { recursive: true })
  mkdirSync(path.resolve(ROOT, OUTPUT_DIR), { recursive: true })
  writeFileSync(path.join(outputDir, 'module-onboarding-gate.json'), JSON.stringify(report, null, 2))
  writeFileSync(path.join(outputDir, 'module-onboarding-gate.md'), makeMarkdown(report))
  writeFileSync(path.resolve(ROOT, OUTPUT_DIR, 'latest.json'), JSON.stringify(report, null, 2))
  writeFileSync(path.resolve(ROOT, OUTPUT_DIR, 'latest.md'), makeMarkdown(report))

  console.log(JSON.stringify({
    command: 'check-module-onboarding-gate',
    gate_id: report.gate_id,
    gate_decision: report.gate_decision,
    modules_total: report.modules.length,
    required_failures: report.required_failures,
    warning_failures: report.warning_failures,
    latest_json: path.resolve(ROOT, OUTPUT_DIR, 'latest.json')
  }, null, 2))

  if (required_failures.length > 0) process.exitCode = 2
}

main()
