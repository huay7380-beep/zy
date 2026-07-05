import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { timelineSummary } from './build-timeline-lib.mjs'

const ROOT = path.resolve('.')
const REGISTRY_PATH = 'dialogue-system-patrol/registry/system-patrol-registry.json'
const LATEST_VALIDATION_PATH = 'runtime/dialogue-system-patrol-validations/latest.json'
const LATEST_SOURCE_DRIFT_PATH = 'runtime/dialogue-system-patrol-source-drift/latest.json'
const LATEST_PUBLISH_DIR = 'runtime/dialogue-system-patrol'

function argValue(name) {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.resolve(ROOT, relativePath), 'utf8'))
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

function readBlock(entry) {
  const blockPath = safeRelativePath(entry.patrol_block_path)
  if (!blockPath.ok || !existsSync(blockPath.resolved)) return null
  try {
    return JSON.parse(readFileSync(blockPath.resolved, 'utf8'))
  } catch {
    return null
  }
}

function pickArray(value, fallback = []) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : fallback
}

function statusFrom(entry, block, finding) {
  if (!block) return { patrol_state: 'missing', status: 'unknown', severity: 'warn', event_type: 'risk' }
  if (finding?.patrol_state === 'source_drift' || (finding?.findings ?? []).some((item) => item.includes('source_hash_invalid'))) {
    return { patrol_state: 'source_drift', status: 'blocked', severity: 'blocked', event_type: 'fault' }
  }
  if (finding?.patrol_state === 'validation_failed') {
    return { patrol_state: 'validation_failed', status: 'blocked', severity: 'blocked', event_type: 'fault' }
  }
  if (finding?.patrol_state === 'stale') {
    return { patrol_state: 'stale', status: 'warn', severity: 'warn', event_type: 'risk' }
  }
  if (block.lifecycle === 'blocked') {
    return { patrol_state: 'blocked', status: 'blocked', severity: 'blocked', event_type: 'fault' }
  }
  if (block.lifecycle === 'validated' || block.lifecycle === 'ready') {
    return { patrol_state: 'validated', status: 'ok', severity: 'info', event_type: 'completion' }
  }
  return { patrol_state: 'building', status: 'warn', severity: 'notice', event_type: 'progress_update' }
}

function broadcastFor(severity, speakable = true) {
  if (!speakable) {
    return { speakable: false, mode: 'silent', priority: 'normal', emotion_hint: 'steady' }
  }
  if (severity === 'blocked' || severity === 'critical') {
    return { speakable: true, mode: 'immediate', priority: 'urgent', emotion_hint: 'urgent' }
  }
  if (severity === 'warn') {
    return { speakable: true, mode: 'inline', priority: 'notice', emotion_hint: 'focused' }
  }
  if (severity === 'notice') {
    return { speakable: true, mode: 'summary', priority: 'notice', emotion_hint: 'steady' }
  }
  return { speakable: false, mode: 'silent', priority: 'normal', emotion_hint: 'steady' }
}

function cardFor(entry, block, finding, now, timeline) {
  const decision = statusFrom(entry, block, finding)
  const missingBlock = !block
  const sourceRefs = missingBlock
    ? [REGISTRY_PATH, entry.patrol_block_path]
    : [...pickArray(block.evidence?.source_refs), entry.patrol_block_path].slice(0, 12)
  return {
    schema: 'module_status_card.v1',
    module_id: entry.module_id,
    display_name: entry.display_name,
    owner: entry.owner,
    gate: entry.gate,
    status: decision.status,
    updated_at: now.toISOString(),
    ttl_ms: entry.ttl_ms,
    headline: missingBlock
      ? `${entry.module_id}: patrol block is missing.`
      : block.state?.headline ?? `${entry.module_id}: patrol block loaded.`,
    current_focus: [
      decision.patrol_state,
      entry.coverage,
      entry.source,
      `build:${timeline.latest_phase}`,
      `build_status:${timeline.latest_status}`
    ],
    current_task: missingBlock
      ? 'Create or assign module patrol coverage before claiming current module state.'
      : block.state?.current_task ?? 'Maintain module patrol status.',
    inputs: missingBlock ? ['patrol block missing'] : pickArray(block.data_flow?.inputs).slice(0, 8),
    outputs: missingBlock ? [entry.status_card_output, entry.status_event_output] : pickArray(block.data_flow?.outputs).slice(0, 8),
    blockers: missingBlock ? [`missing patrol block: ${entry.patrol_block_path}`] : pickArray(block.state?.blockers),
    risks: missingBlock
      ? ['Dialogue module must not infer module health from missing patrol evidence.']
      : pickArray(block.state?.risks),
    next: missingBlock
      ? ['Create module patrol block or mark explicit parent coverage with evidence.', 'Run npm.cmd run system-patrol:validate.']
      : pickArray(block.state?.next),
    confidence: missingBlock ? 0.2 : decision.status === 'ok' ? 0.9 : 0.65,
    source_refs: sourceRefs,
    visibility: 'read_only_summary',
    build_timeline_output: timeline.output,
    latest_build_event: {
      event_id: timeline.latest_event_id,
      phase: timeline.latest_phase,
      status: timeline.latest_status,
      generated_at: timeline.latest_generated_at,
      summary: timeline.latest_summary
    }
  }
}

function eventFor(entry, block, finding, card, now, timeline) {
  const decision = statusFrom(entry, block, finding)
  const eventId = `system_patrol_${entry.module_id}_${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '')}`
  return {
    schema: 'module_status_event.v1',
    event_id: eventId,
    generated_at: now.toISOString(),
    source_module: entry.module_id,
    source_node: entry.process_tree_node_id ?? entry.module_id,
    event_type: decision.event_type,
    severity: decision.severity,
    headline: card.headline,
    summary: block
      ? `${entry.module_id} patrol state: ${decision.patrol_state}. Build timeline: ${timeline.latest_phase}/${timeline.latest_status}.`
      : `${entry.module_id} is expected by the patrol registry but has no module patrol block yet.`,
    completion: {
      current: block && typeof block.state?.progress === 'number' ? block.state.progress : 0,
      label: `${decision.patrol_state}:${timeline.latest_phase}:${timeline.latest_status}`
    },
    gate: entry.gate,
    compass: entry.compass,
    evidence_refs: [...card.source_refs, timeline.output].slice(0, 14),
    recommended_broadcast: broadcastFor(decision.severity, false),
    ttl_ms: entry.ttl_ms,
    dedupe_key: `system_patrol:${entry.module_id}:${decision.patrol_state}`,
    boundary: [
      'summary-only status event',
      'build timeline summarized from append-only runtime events',
      'no raw business payload',
      'no external action'
    ]
  }
}

function countBy(values) {
  const counts = {}
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1
  return counts
}

function aggregateDecision(published) {
  if (published.some((item) => item.status === 'blocked')) {
    return { status: 'blocked', severity: 'blocked', event_type: 'fault', label: 'blocked' }
  }
  if (published.some((item) => item.status === 'warn')) {
    return { status: 'warn', severity: 'warn', event_type: 'risk', label: 'attention_required' }
  }
  return { status: 'ok', severity: 'info', event_type: 'completion', label: 'validated' }
}

function aggregateEventFor({ entry, published, validation, sourceDrift, now }) {
  const decision = aggregateDecision(published)
  const patrolStateCounts = countBy(published.map((item) => item.patrol_state))
  const sourceDriftCount = patrolStateCounts.source_drift ?? 0
  const blockedCount = published.filter((item) => item.status === 'blocked').length
  const warnCount = published.filter((item) => item.status === 'warn').length
  const okCount = published.filter((item) => item.status === 'ok').length
  const moduleTotal = published.length
  const driftCommonRefs = commonRefsFromSourceDrift(sourceDrift)
  const rootCause = sourceDriftCount > 0
    ? `${sourceDriftCount}/${moduleTotal} modules report source_hash drift`
    : `${blockedCount} blocked, ${warnCount} warning, ${okCount} ok modules`
  const commonRefNote = driftCommonRefs.length ? ` Common hash ref: ${driftCommonRefs.slice(0, 3).join(', ')}.` : ''
  const eventTime = new Date(now.getTime() + 1)
  return {
    schema: 'module_status_event.v1',
    event_id: `system_patrol_global_${eventTime.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '')}`,
    generated_at: eventTime.toISOString(),
    source_module: entry.module_id,
    source_node: `${entry.process_tree_node_id ?? entry.module_id}.global`,
    event_type: decision.event_type,
    severity: decision.severity,
    headline: decision.status === 'ok'
      ? `Global system patrol validated across ${moduleTotal} modules.`
      : `Global system patrol ${decision.status}: ${rootCause}.`,
    summary: decision.status === 'ok'
      ? `System patrol is current across ${moduleTotal} registered modules.`
      : `System patrol requires attention: ${rootCause}.${commonRefNote} Review source changes before refreshing source_hash baselines.`,
    completion: {
      current: moduleTotal > 0 ? okCount / moduleTotal : 0,
      label: decision.label
    },
    gate: entry.gate,
    compass: `${entry.compass}.global`,
    evidence_refs: [
      REGISTRY_PATH,
      LATEST_VALIDATION_PATH,
      LATEST_SOURCE_DRIFT_PATH,
      'runtime/dialogue-system-patrol-module-gates/latest.json',
      'runtime/dialogue-system-patrol/dialogue-read-index.json'
    ],
    recommended_broadcast: broadcastFor(decision.severity, decision.status !== 'ok'),
    ttl_ms: entry.ttl_ms,
    dedupe_key: `system_patrol:global:${decision.label}`,
    boundary: [
      'global summary-only status event',
      'no raw business payload',
      'no external action',
      'module-level patrol events remain silent'
    ]
  }
}

function commonRefsFromSourceDrift(sourceDrift) {
  const modules = Array.isArray(sourceDrift?.modules) ? sourceDrift.modules : []
  if (modules.length === 0) return []
  let common = null
  for (const module of modules) {
    const refs = new Set(pickArray(module.included_refs))
    common = common ? new Set([...common].filter((ref) => refs.has(ref))) : refs
  }
  return [...(common ?? [])].sort()
}

function makeMarkdown(report) {
  const rows = report.published_modules
    .map((item) => `| ${item.module_id} | ${item.status} | ${item.patrol_state} | ${item.status_card_output} |`)
    .join('\n')
  return [
    '# System Patrol Publish Report',
    '',
    `- schema: ${report.schema}`,
    `- generated_at: ${report.generated_at}`,
    `- modules_total: ${report.modules_total}`,
    `- cards_written: ${report.cards_written}`,
    `- events_written: ${report.events_written}`,
    `- validation_ref: ${report.validation_ref}`,
    '',
    '| Module | Status | Patrol state | Card |',
    '| --- | --- | --- | --- |',
    rows,
    ''
  ].join('\n')
}

function main() {
  const now = new Date()
  const registryPath = argValue('registry') ?? REGISTRY_PATH
  const registry = readJson(registryPath)
  const validation = existsSync(path.resolve(ROOT, LATEST_VALIDATION_PATH)) ? readJson(LATEST_VALIDATION_PATH) : null
  const sourceDrift = existsSync(path.resolve(ROOT, LATEST_SOURCE_DRIFT_PATH)) ? readJson(LATEST_SOURCE_DRIFT_PATH) : null
  const findingsByModule = new Map()
  if (validation && Array.isArray(validation.module_findings)) {
    for (const finding of validation.module_findings) findingsByModule.set(finding.module_id, finding)
  }

  const published = []
  const eventPayloads = new Map()
  for (const entry of registry.entries) {
    if (!isRecord(entry) || entry.coverage === 'excluded') continue
    const block = readBlock(entry)
    const finding = findingsByModule.get(entry.module_id)
    const timeline = timelineSummary({ root: ROOT, entry })
    const card = cardFor(entry, block, finding, now, timeline)
    const event = eventFor(entry, block, finding, card, now, timeline)
    const cardPath = safeRelativePath(entry.status_card_output)
    const eventPath = safeRelativePath(entry.status_event_output)
    if (!cardPath.ok) throw new Error(`${entry.module_id}: invalid card output path: ${cardPath.error}`)
    if (!eventPath.ok) throw new Error(`${entry.module_id}: invalid event output path: ${eventPath.error}`)
    mkdirSync(path.dirname(cardPath.resolved), { recursive: true })
    mkdirSync(path.dirname(eventPath.resolved), { recursive: true })
    writeFileSync(cardPath.resolved, JSON.stringify(card, null, 2))
    eventPayloads.set(eventPath.resolved, { events: [event] })
    published.push({
      module_id: entry.module_id,
      status: card.status,
      patrol_state: statusFrom(entry, block, finding).patrol_state,
      status_card_output: entry.status_card_output,
      status_event_output: entry.status_event_output,
      build_timeline_output: timeline.output,
      build_timeline_phase: timeline.latest_phase,
      build_timeline_status: timeline.latest_status
    })
  }

  const globalEntry = registry.entries.find((entry) => entry.module_id === 'dialogue_system_patrol') ?? registry.entries[0]
  const globalEvent = globalEntry
    ? aggregateEventFor({ entry: globalEntry, published, validation, sourceDrift, now })
    : null
  let globalEventOutput = null
  if (globalEntry && globalEvent) {
    const globalEventPath = safeRelativePath(globalEntry.status_event_output)
    if (!globalEventPath.ok) throw new Error(`${globalEntry.module_id}: invalid global event output path: ${globalEventPath.error}`)
    const payload = eventPayloads.get(globalEventPath.resolved) ?? { events: [] }
    payload.events = [globalEvent, ...payload.events]
    eventPayloads.set(globalEventPath.resolved, payload)
    globalEventOutput = globalEntry.status_event_output
  }

  for (const [filePath, payload] of eventPayloads.entries()) {
    writeFileSync(filePath, JSON.stringify(payload, null, 2))
  }

  const report = {
    schema: 'system_patrol_publish_report.v1',
    generated_at: now.toISOString(),
    registry_ref: registryPath,
    validation_ref: validation ? LATEST_VALIDATION_PATH : 'missing_latest_validation',
    modules_total: published.length,
    cards_written: published.length,
    events_written: published.length + (globalEvent ? 1 : 0),
    global_event_output: globalEventOutput,
    published_modules: published,
    boundary: [
      'summary-only publication',
      'no business module rewrite',
      'no dialogue module rewrite',
      'no external platform action'
    ]
  }
  const outputDir = path.resolve(ROOT, LATEST_PUBLISH_DIR)
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(path.join(outputDir, 'latest.json'), JSON.stringify(report, null, 2))
  writeFileSync(path.join(outputDir, 'latest.md'), makeMarkdown(report))
  console.log(JSON.stringify({
    command: 'publish-system-patrol',
    modules_total: report.modules_total,
    cards_written: report.cards_written,
    events_written: report.events_written,
    latest_json: path.join(outputDir, 'latest.json')
  }, null, 2))
}

main()
