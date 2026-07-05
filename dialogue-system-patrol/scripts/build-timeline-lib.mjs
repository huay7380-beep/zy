import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export const BUILD_TIMELINE_EVENT_SCHEMA = 'module_build_timeline_event.v1'
export const DEFAULT_BUILD_TIMELINE_DIR = 'runtime/module-build-timelines'
export const BUILD_TIMELINE_PHASES = new Set([
  'module_registered',
  'design_started',
  'contract_declared',
  'implementation_changed',
  'validation_started',
  'validation_failed',
  'validation_passed',
  'publication_done',
  'dialogue_visibility_ready',
  'source_drift_checked',
  'source_drift_updated',
  'hook_checked',
  'ci_checked',
  'blocked',
  'completed'
])
export const BUILD_TIMELINE_STATUSES = new Set([
  'started',
  'in_progress',
  'blocked',
  'failed',
  'passed',
  'completed',
  'skipped'
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function slug(value) {
  return String(value ?? 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'unknown'
}

export function timelinePathForEntry(entry) {
  return entry?.build_timeline_output || `${DEFAULT_BUILD_TIMELINE_DIR}/${slug(entry?.module_id)}.jsonl`
}

export function safeRelativePath(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    return { ok: false, error: 'path_empty' }
  }
  if (path.isAbsolute(relativePath)) {
    return { ok: false, error: 'path_must_be_relative' }
  }
  const resolved = path.resolve(root, relativePath)
  const rel = path.relative(root, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: 'path_escapes_workspace' }
  }
  return { ok: true, resolved, rel: rel.replace(/\\/g, '/') }
}

export function readTimelineEvents({ root, relativePath }) {
  const result = safeRelativePath(root, relativePath)
  if (!result.ok) {
    return { path_ok: false, exists: false, events: [], errors: [`build_timeline_path_${result.error}`], mtime_ms: 0 }
  }
  if (!existsSync(result.resolved)) {
    return { path_ok: true, exists: false, events: [], errors: ['build_timeline_missing'], mtime_ms: 0 }
  }

  const errors = []
  const events = []
  const lines = readFileSync(result.resolved, 'utf8').split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line) continue
    try {
      events.push(JSON.parse(line))
    } catch (error) {
      errors.push(`line_${index + 1}_invalid_json:${String(error).slice(0, 120)}`)
    }
  }
  return {
    path_ok: true,
    exists: true,
    events,
    errors,
    mtime_ms: statSync(result.resolved).mtimeMs,
    resolved: result.resolved,
    rel: result.rel
  }
}

export function latestTimelineEvent(events) {
  return [...events]
    .filter(isRecord)
    .sort((left, right) => {
      const sequenceDelta = (right.sequence ?? 0) - (left.sequence ?? 0)
      if (sequenceDelta !== 0) return sequenceDelta
      return Date.parse(right.generated_at ?? '') - Date.parse(left.generated_at ?? '')
    })[0] ?? null
}

export function validateTimelineEvents(events, { moduleId }) {
  const errors = []
  if (!events.length) errors.push('build_timeline_empty')
  for (const event of events) {
    if (!isRecord(event)) {
      errors.push('event_not_object')
      continue
    }
    const eventId = typeof event.event_id === 'string' && event.event_id.trim() ? event.event_id : 'unknown'
    if (event.schema !== BUILD_TIMELINE_EVENT_SCHEMA) errors.push(`${eventId}.schema`)
    if (event.module_id !== moduleId) errors.push(`${eventId}.module_id_mismatch:${event.module_id}`)
    if (typeof event.operation_id !== 'string' || !event.operation_id.trim()) errors.push(`${eventId}.operation_id`)
    if (!(Number.isInteger(event.sequence) && event.sequence > 0)) errors.push(`${eventId}.sequence`)
    if (!BUILD_TIMELINE_PHASES.has(event.phase)) errors.push(`${eventId}.phase:${event.phase}`)
    if (!BUILD_TIMELINE_STATUSES.has(event.status)) errors.push(`${eventId}.status:${event.status}`)
    if (typeof event.summary !== 'string' || !event.summary.trim()) errors.push(`${eventId}.summary`)
    if (!isRecord(event.construction_depth)) errors.push(`${eventId}.construction_depth`)
    if (!Array.isArray(event.source_refs)) errors.push(`${eventId}.source_refs`)
    if (!Array.isArray(event.evidence_refs)) errors.push(`${eventId}.evidence_refs`)
    if (!Array.isArray(event.validation_refs)) errors.push(`${eventId}.validation_refs`)
    if (!isRecord(event.source_hash)) errors.push(`${eventId}.source_hash`)
    if (!isRecord(event.module_gate)) errors.push(`${eventId}.module_gate`)
    if (!isRecord(event.dialogue_visibility)) errors.push(`${eventId}.dialogue_visibility`)
    if (!Array.isArray(event.boundaries)) errors.push(`${eventId}.boundaries`)
  }
  return errors
}

export function timelineSummary({ root, entry }) {
  const timelinePath = timelinePathForEntry(entry)
  const read = readTimelineEvents({ root, relativePath: timelinePath })
  const validation_errors = read.errors.length ? read.errors : validateTimelineEvents(read.events, { moduleId: entry.module_id })
  const latest = latestTimelineEvent(read.events)
  return {
    output: timelinePath,
    exists: read.exists,
    events_total: read.events.length,
    latest_event_id: latest?.event_id ?? null,
    latest_generated_at: latest?.generated_at ?? null,
    latest_phase: latest?.phase ?? 'missing',
    latest_status: latest?.status ?? 'missing',
    latest_summary: latest?.summary ?? 'No build timeline event has been recorded.',
    operation_id: latest?.operation_id ?? null,
    validation_errors,
    mtime_ms: read.mtime_ms
  }
}
