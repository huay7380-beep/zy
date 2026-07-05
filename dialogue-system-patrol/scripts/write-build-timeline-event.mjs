import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  BUILD_TIMELINE_PHASES,
  BUILD_TIMELINE_STATUSES,
  BUILD_TIMELINE_EVENT_SCHEMA,
  latestTimelineEvent,
  readTimelineEvents,
  safeRelativePath,
  timelinePathForEntry
} from './build-timeline-lib.mjs'

const ROOT = path.resolve('.')
const REGISTRY_PATH = 'dialogue-system-patrol/registry/system-patrol-registry.json'
const SOURCE_DRIFT_PATH = 'runtime/dialogue-system-patrol-source-drift/latest.json'
const MODULE_GATE_PATH = 'runtime/dialogue-system-patrol-module-gates/latest.json'
const VALIDATION_PATH = 'runtime/dialogue-system-patrol-validations/latest.json'
const DIALOGUE_INDEX_PATH = 'runtime/dialogue-system-patrol/dialogue-read-index.json'

function argValue(name) {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.resolve(ROOT, relativePath), 'utf8'))
}

function readJsonIfExists(relativePath) {
  const resolved = path.resolve(ROOT, relativePath)
  return existsSync(resolved) ? JSON.parse(readFileSync(resolved, 'utf8')) : null
}

function pickArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : []
}

function toIdTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '')
}

function normalizePhase(value) {
  const phase = value || 'implementation_changed'
  if (!BUILD_TIMELINE_PHASES.has(phase)) {
    throw new Error(`Invalid build timeline phase: ${phase}`)
  }
  return phase
}

function normalizeStatus(value) {
  const status = value || 'completed'
  if (!BUILD_TIMELINE_STATUSES.has(status)) {
    throw new Error(`Invalid build timeline status: ${status}`)
  }
  return status
}

function depthLevel() {
  const explicit = argValue('depth')
  if (explicit) return explicit
  if (hasFlag('dialogue-index-updated')) return 'dialogue_surface'
  if (hasFlag('validation-run')) return 'validation'
  if (hasFlag('status-surface-updated')) return 'runtime_surface'
  if (hasFlag('data-flow-updated')) return 'data_flow'
  if (hasFlag('patrol-block-updated')) return 'contract'
  return 'module_shell'
}

function readBlock(entry) {
  const result = safeRelativePath(ROOT, entry.patrol_block_path)
  if (!result.ok || !existsSync(result.resolved)) return null
  try {
    return JSON.parse(readFileSync(result.resolved, 'utf8'))
  } catch {
    return null
  }
}

function findSourceDrift(sourceDrift, moduleId) {
  return (sourceDrift?.modules ?? []).find((item) => item.module_id === moduleId)
}

function findModuleGate(moduleGate, moduleId) {
  return (moduleGate?.modules ?? []).find((item) => item.module_id === moduleId)
}

function eventFor({ entry, now, phase, status, summary, operationId }) {
  const output = timelinePathForEntry(entry)
  const read = readTimelineEvents({ root: ROOT, relativePath: output })
  const latest = latestTimelineEvent(read.events)
  const sequence = Number.isInteger(latest?.sequence) ? latest.sequence + 1 : read.events.length + 1
  const sourceDrift = readJsonIfExists(SOURCE_DRIFT_PATH)
  const moduleGate = readJsonIfExists(MODULE_GATE_PATH)
  const validation = readJsonIfExists(VALIDATION_PATH)
  const block = readBlock(entry)
  const sourceDriftModule = findSourceDrift(sourceDrift, entry.module_id)
  const moduleGateModule = findModuleGate(moduleGate, entry.module_id)
  const validationFinding = (validation?.module_findings ?? []).find((item) => item.module_id === entry.module_id)

  return {
    schema: BUILD_TIMELINE_EVENT_SCHEMA,
    event_id: `build_timeline_${entry.module_id}_${toIdTimestamp(now)}_${sequence}`,
    generated_at: now.toISOString(),
    module_id: entry.module_id,
    operation_id: operationId,
    sequence,
    phase,
    status,
    summary,
    construction_depth: {
      level: depthLevel(),
      patrol_block_updated: hasFlag('patrol-block-updated'),
      data_flow_updated: hasFlag('data-flow-updated'),
      status_surface_updated: hasFlag('status-surface-updated'),
      validation_run: hasFlag('validation-run'),
      dialogue_index_updated: hasFlag('dialogue-index-updated')
    },
    source_refs: pickArray(block?.evidence?.source_refs).slice(0, 20),
    evidence_refs: [
      entry.patrol_block_path,
      entry.status_card_output,
      entry.status_event_output,
      output
    ],
    validation_refs: [
      ...(validation ? [VALIDATION_PATH] : []),
      ...(sourceDrift ? [SOURCE_DRIFT_PATH] : []),
      ...(moduleGate ? [MODULE_GATE_PATH] : [])
    ],
    source_hash: {
      status: sourceDriftModule?.status ?? 'missing_source_drift_report',
      hash: sourceDriftModule?.computed_hash ?? null,
      report_ref: sourceDrift ? SOURCE_DRIFT_PATH : null
    },
    module_gate: {
      decision: moduleGateModule?.gate_decision ?? 'missing_module_gate',
      report_ref: moduleGate ? MODULE_GATE_PATH : null
    },
    dialogue_visibility: {
      index_ref: DIALOGUE_INDEX_PATH,
      included: existsSync(path.resolve(ROOT, DIALOGUE_INDEX_PATH))
        && (readJsonIfExists(DIALOGUE_INDEX_PATH)?.modules ?? []).some((item) => item.module_id === entry.module_id)
    },
    boundaries: [
      'append-only construction status',
      'summary-only evidence refs',
      'no raw private payload',
      'no business module rewrite',
      'no external action',
      ...(validationFinding?.patrol_state ? [`latest_patrol_state:${validationFinding.patrol_state}`] : [])
    ]
  }
}

function writeEvent(entry, options) {
  const output = timelinePathForEntry(entry)
  const result = safeRelativePath(ROOT, output)
  if (!result.ok) throw new Error(`${entry.module_id}: invalid build timeline output path: ${result.error}`)
  mkdirSync(path.dirname(result.resolved), { recursive: true })
  const event = eventFor({ entry, ...options })
  appendFileSync(result.resolved, `${JSON.stringify(event)}\n`)
  return {
    module_id: entry.module_id,
    build_timeline_output: output,
    event_id: event.event_id,
    sequence: event.sequence,
    phase: event.phase,
    status: event.status
  }
}

function usage() {
  return [
    'Usage:',
    '  npm.cmd run system-patrol:timeline -- --module-id=<module_id> --phase=<phase> --status=<status> --summary=<summary>',
    '  npm.cmd run system-patrol:timeline -- --all --phase=<phase> --status=<status> --summary=<summary>',
    '',
    'Writes append-only module_build_timeline_event.v1 records for construction-time patrol visibility.'
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

  const registry = readJson(REGISTRY_PATH)
  const phase = normalizePhase(argValue('phase'))
  const status = normalizeStatus(argValue('status'))
  const now = new Date()
  const operationId = argValue('operation-id') ?? `patrol_timeline_${toIdTimestamp(now)}`
  const summary = argValue('summary') ?? `Recorded ${phase} as ${status} for patrol construction visibility.`
  const entries = (registry.entries ?? [])
    .filter((entry) => entry.coverage !== 'excluded')
    .filter((entry) => all || entry.module_id === moduleId)
  if (!entries.length) {
    console.error(`No patrol registry entries matched ${moduleId ?? 'all'}.`)
    process.exitCode = 2
    return
  }

  const written = entries.map((entry) => writeEvent(entry, { now, phase, status, summary, operationId }))
  console.log(JSON.stringify({
    command: 'write-build-timeline-event',
    operation_id: operationId,
    phase,
    status,
    modules_total: written.length,
    written
  }, null, 2))
}

main()
