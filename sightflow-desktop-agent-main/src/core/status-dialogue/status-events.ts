export const MODULE_STATUS_EVENT_SCHEMA = 'module_status_event.v1'
export const SYSTEM_EVENT_SNAPSHOT_SCHEMA = 'system_event_snapshot.v1'
export const VOICE_EVENT_BROADCAST_REQUEST_SCHEMA = 'voice_event_broadcast_request.v1'
export const VOICE_BROADCAST_QUEUE_STATE_SCHEMA = 'voice_broadcast_queue_state.v1'
export const VOICE_SCRIPT_PATCH_SCHEMA = 'voice_script_patch.v1'
export const SYSTEM_FEEDBACK_ROUTE_MANIFEST_SCHEMA = 'system_feedback_route_manifest.v1'
export const DEFAULT_STATUS_DIALOGUE_EVENT_DIR = 'runtime/status-events'
export const DEFAULT_STATUS_DIALOGUE_EVENT_TTL_MS = 300000

export type ModuleStatusEventType =
  | 'system_change'
  | 'nebula_change'
  | 'progress_update'
  | 'completion'
  | 'risk'
  | 'fault'
  | 'confirmation_needed'

export type ModuleStatusEventSeverity = 'info' | 'notice' | 'warn' | 'blocked' | 'critical'
export type ModuleStatusEventFreshness = 'fresh' | 'stale' | 'unknown'
export type SystemEventSnapshotSource = 'main_process_status_events' | 'local_default' | 'browser_preview_fallback'
export type VoiceEventBroadcastWeight = 'critical' | 'high' | 'normal' | 'low' | 'silent'
export type VoiceEventDialogueState =
  | 'idle'
  | 'listening'
  | 'stt'
  | 'llm'
  | 'tts'
  | 'playing'
  | 'complete'
  | 'error'
export type VoiceEventPlayMode =
  | 'interrupt_now'
  | 'after_current_sentence'
  | 'merge_into_current_reply'
  | 'idle_reminder'
  | 'silent'
export type VoiceEventEmotionHint = 'steady' | 'focused' | 'warm' | 'urgent' | 'reflective'

export interface ExpectedStatusEventPublisher {
  module_id: string
  display_name: string
  gate: string
  compass: string
}

export interface SystemFeedbackRouteManifest {
  schema: typeof SYSTEM_FEEDBACK_ROUTE_MANIFEST_SCHEMA
  module_id: string
  display_name: string
  owner: string
  gate: string
  compass: string
  status_card_output: string
  status_event_output: string
  ttl_ms: number
  severity_mapping: Record<string, ModuleStatusEventSeverity>
  broadcast_policy: {
    default_mode: ModuleStatusEventBroadcastRecommendation['mode']
    critical_interrupt_allowed: boolean
    idle_reminder_allowed: boolean
    max_events_per_snapshot: number
  }
  privacy_boundary: string[]
  fallback_behavior: string
}

export interface SystemFeedbackRouteManifestValidationResult {
  schema: 'system_feedback_route_manifest_validation.v1'
  generated_at: string
  module_id: string
  ok: boolean
  missing_fields: string[]
  warnings: string[]
  required_outputs: {
    module_status_card: boolean
    module_status_event: boolean
  }
}

export interface ModuleStatusEventCompletion {
  current: number
  label: string
}

export interface ModuleStatusEventBroadcastRecommendation {
  speakable: boolean
  mode: 'immediate' | 'inline' | 'idle_reminder' | 'summary' | 'silent'
  priority: 'normal' | 'notice' | 'urgent'
  emotion_hint: VoiceEventEmotionHint
}

export interface ModuleStatusEvent {
  schema: typeof MODULE_STATUS_EVENT_SCHEMA
  event_id: string
  generated_at: string
  source_module: string
  source_node: string
  event_type: ModuleStatusEventType
  severity: ModuleStatusEventSeverity
  headline: string
  summary: string
  completion?: ModuleStatusEventCompletion
  gate: string
  compass: string
  evidence_refs: string[]
  recommended_broadcast: ModuleStatusEventBroadcastRecommendation
  ttl_ms: number
  dedupe_key: string
  boundary: string[]
}

export interface SystemEventSnapshot {
  schema: typeof SYSTEM_EVENT_SNAPSHOT_SCHEMA
  generated_at: string
  events_total: number
  events_fresh: number
  events_stale: number
  events_critical: number
  events_by_source: Record<string, number>
  top_events: ModuleStatusEvent[]
  stale_event_ids: string[]
  conflict_event_ids: string[]
  read_errors: string[]
  missing_publishers: string[]
  patrol_findings: string[]
  source: SystemEventSnapshotSource
  event_dir?: string
}

export interface SystemEventSnapshotRequest {
  expected_publishers?: ExpectedStatusEventPublisher[]
  event_dir?: string
  ttl_ms?: number
}

export interface SystemEventSnapshotReadResult {
  success: boolean
  snapshot: SystemEventSnapshot
  source: SystemEventSnapshotSource
  event_dir: string
  errors: string[]
}

export interface VoiceEventBroadcastRequest {
  schema: typeof VOICE_EVENT_BROADCAST_REQUEST_SCHEMA
  request_id: string
  created_at: string
  source_event_id: string
  event_type: ModuleStatusEventType
  severity: ModuleStatusEventSeverity
  weight: VoiceEventBroadcastWeight
  user_relevance: 'direct' | 'related' | 'background'
  current_dialogue_state: VoiceEventDialogueState
  requested_play_mode: VoiceEventPlayMode
  script_goal: string
  one_sentence_summary: string
  next_action_hint: string
  status_refs: string[]
  requires_confirmation: boolean
}

export interface VoiceBroadcastQueueState {
  schema: typeof VOICE_BROADCAST_QUEUE_STATE_SCHEMA
  generated_at: string
  status: 'idle' | 'queued' | 'playing' | 'complete' | 'error'
  active_request_id?: string
  queued_count: number
  critical_count: number
  high_count: number
  normal_count: number
  low_count: number
  silent_count: number
  next_request_id?: string
  last_error?: string
}

export interface VoiceScriptPatch {
  schema: typeof VOICE_SCRIPT_PATCH_SCHEMA
  patch_id: string
  source_request_id: string
  play_mode: VoiceEventPlayMode
  bridge_line: string
  voice_text: string
  resume_line: string
  emotion_hint: VoiceEventEmotionHint
  voice_profile_lock: boolean
  max_sentences: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function pickNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function pickStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : []
}

function compact(value: string | undefined, fallback = ''): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim()
  return normalized || fallback
}

function truncate(value: string, maxLength: number): string {
  const normalized = compact(value)
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 1))}...` : normalized
}

function slug(value: string): string {
  return compact(value, 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 96) || 'unknown'
}

function unique(values: Array<string | undefined>, limit = 12): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = compact(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
    if (result.length >= limit) break
  }
  return result
}

const MODULE_LABEL_BY_ID: Record<string, string> = {
  audit: '审计模块',
  capability_upgrade_registry: '能力升级候选库',
  decision_recommendation: '决策建议模块',
  dialogue_system_patrol: '对话系统巡逻',
  document_governance: '文档治理模块',
  engineering_entry: '工程入口模块',
  event_recording: '事件记录模块',
  feedback: '反馈模块',
  identity_resolution: '身份识别模块',
  index_rebuild: '索引重建模块',
  platform_snapshot_validation: '平台快照验证模块',
  runtime_feedback_router: '运行反馈路由',
  status_dialogue_system: '主体状态对话模块',
  trigger_plan: '触发计划模块',
  voice_loop: '语音闭环模块',
  writeback: '写回模块'
}

const STATUS_TERM_BY_TOKEN: Record<string, string> = {
  source_drift: '源引用漂移',
  blocked: '阻塞',
  critical: '关键风险',
  warn: '警告',
  stale: '过期',
  missing: '缺失',
  ok: '正常',
  implemented_skeleton: '骨架已实现但仍需验证',
  designed_boundary_with_read_only_patrol: '已设计只读巡检边界',
  no_module_status_events_loaded: '没有读取到模块事件'
}

function humanizeToken(value: string): string {
  const normalized = compact(value)
  if (!normalized) return ''
  const direct = STATUS_TERM_BY_TOKEN[normalized] ?? MODULE_LABEL_BY_ID[normalized]
  if (direct) return direct
  const safe = normalized.replace(/[_-]+/g, ' ').trim()
  if (!/^[a-z0-9 .:/-]+$/i.test(safe)) return safe
  return safe
    .split(/[ .:/-]+/)
    .filter(Boolean)
    .map((part) => STATUS_TERM_BY_TOKEN[part] ?? MODULE_LABEL_BY_ID[part] ?? part)
    .join('')
}

export function humanizeStatusDialogueModuleId(value: string): string {
  const normalized = compact(value).replace(/[-.]/g, '_')
  if (!normalized) return '相关模块'
  const label = MODULE_LABEL_BY_ID[normalized] ?? humanizeToken(normalized)
  return label && /[\u4e00-\u9fff]/.test(label) ? label : '相关模块'
}

export function humanizeStatusDialogueTerm(value: string): string {
  const normalized = compact(value).replace(/[-.]/g, '_')
  const label = STATUS_TERM_BY_TOKEN[normalized] ?? humanizeToken(normalized)
  return label && /[\u4e00-\u9fff]/.test(label) ? label : normalized
}

export function humanizeStatusDialogueText(value: string): string {
  let normalized = compact(value)
  if (!normalized) return ''
  for (const [token, label] of Object.entries({ ...STATUS_TERM_BY_TOKEN, ...MODULE_LABEL_BY_ID })) {
    normalized = normalized.replace(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), label)
  }
  return normalized.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function firstSentence(value: string): string {
  const normalized = compact(value)
  const match = normalized.match(/^(.+?[。！？!?])\s*/)
  return match?.[1]?.trim() || normalized
}

function deriveEventReason(event: ModuleStatusEvent): string {
  const searchable = compact([
    event.summary,
    event.headline,
    event.completion?.label,
    event.source_node,
    event.event_type
  ].filter(Boolean).join(' '))
  const matchedTerm = Object.keys(STATUS_TERM_BY_TOKEN).find((token) => searchable.includes(token))
  if (matchedTerm) return STATUS_TERM_BY_TOKEN[matchedTerm]
  if (event.event_type === 'fault') return '运行故障'
  if (event.event_type === 'risk') return '风险升高'
  if (event.event_type === 'completion') return '阶段完成'
  if (event.event_type === 'confirmation_needed') return '需要确认'
  const readable = humanizeStatusDialogueText(firstSentence(event.summary || event.headline))
  if (/[\u4e00-\u9fff]/.test(readable)) return truncate(readable, 80)
  return '状态需要巡检确认'
}

function normalizeGeneratedAt(value: unknown): string {
  const raw = pickString(value, new Date().toISOString())
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString()
}

function eventTimeValue(event: ModuleStatusEvent): number {
  const value = Date.parse(event.generated_at)
  return Number.isFinite(value) ? value : 0
}

function normalizeNow(value: Date | string | number | undefined): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (Number.isFinite(parsed.getTime())) return parsed
  }
  return new Date()
}

function normalizeEventType(value: unknown): ModuleStatusEventType {
  if (
    value === 'system_change' ||
    value === 'nebula_change' ||
    value === 'progress_update' ||
    value === 'completion' ||
    value === 'risk' ||
    value === 'fault' ||
    value === 'confirmation_needed'
  ) {
    return value
  }
  return 'progress_update'
}

function normalizeSeverity(value: unknown): ModuleStatusEventSeverity {
  if (value === 'info' || value === 'notice' || value === 'warn' || value === 'blocked' || value === 'critical') {
    return value
  }
  return 'notice'
}

function normalizeEmotionHint(value: unknown, fallback: VoiceEventEmotionHint): VoiceEventEmotionHint {
  if (value === 'steady' || value === 'focused' || value === 'warm' || value === 'urgent' || value === 'reflective') {
    return value
  }
  return fallback
}

function defaultBroadcastRecommendation(severity: ModuleStatusEventSeverity): ModuleStatusEventBroadcastRecommendation {
  if (severity === 'critical' || severity === 'blocked') {
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

function normalizeBroadcastRecommendation(
  raw: unknown,
  severity: ModuleStatusEventSeverity
): ModuleStatusEventBroadcastRecommendation {
  const defaults = defaultBroadcastRecommendation(severity)
  const source = isRecord(raw) ? raw : {}
  const mode =
    source.mode === 'immediate' ||
    source.mode === 'inline' ||
    source.mode === 'idle_reminder' ||
    source.mode === 'summary' ||
    source.mode === 'silent'
      ? source.mode
      : defaults.mode
  const priority =
    source.priority === 'urgent' || source.priority === 'notice' || source.priority === 'normal'
      ? source.priority
      : defaults.priority
  return {
    speakable: pickBoolean(source.speakable, defaults.speakable),
    mode,
    priority,
    emotion_hint: normalizeEmotionHint(source.emotion_hint, defaults.emotion_hint)
  }
}

export function normalizeExpectedStatusEventPublisher(raw: unknown): ExpectedStatusEventPublisher | null {
  if (!isRecord(raw)) return null
  const moduleId = pickString(raw.module_id, '')
  if (!moduleId) return null
  return {
    module_id: moduleId,
    display_name: pickString(raw.display_name, moduleId),
    gate: pickString(raw.gate, 'status_event_publish_gate'),
    compass: pickString(raw.compass, moduleId)
  }
}

export function normalizeExpectedStatusEventPublishers(raw: unknown): ExpectedStatusEventPublisher[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => normalizeExpectedStatusEventPublisher(item))
    .filter((item): item is ExpectedStatusEventPublisher => Boolean(item))
}

export function buildDefaultSystemFeedbackRouteManifest(input: {
  module_id: string
  display_name?: string
  owner?: string
  gate?: string
  compass?: string
  ttl_ms?: number
}): SystemFeedbackRouteManifest {
  const moduleId = compact(input.module_id, 'unknown-module')
  return {
    schema: SYSTEM_FEEDBACK_ROUTE_MANIFEST_SCHEMA,
    module_id: moduleId,
    display_name: compact(input.display_name, moduleId),
    owner: compact(input.owner, 'Unassigned Module Owner'),
    gate: compact(input.gate, 'status_event_publish_gate'),
    compass: compact(input.compass, moduleId),
    status_card_output: `runtime/status-cards/${slug(moduleId)}.json`,
    status_event_output: `runtime/status-events/${slug(moduleId)}.json`,
    ttl_ms: Math.max(1000, input.ttl_ms ?? DEFAULT_STATUS_DIALOGUE_EVENT_TTL_MS),
    severity_mapping: {
      ok: 'info',
      notice: 'notice',
      warn: 'warn',
      blocked: 'blocked',
      critical: 'critical'
    },
    broadcast_policy: {
      default_mode: 'summary',
      critical_interrupt_allowed: true,
      idle_reminder_allowed: true,
      max_events_per_snapshot: 5
    },
    privacy_boundary: [
      'summary-only status card',
      'summary-only status event',
      'no raw business payload',
      'no raw audio payload',
      'no direct world-model write'
    ],
    fallback_behavior: 'If the event output is missing, the dialogue module reports missing publisher and keeps text dialogue available.'
  }
}

export function normalizeSystemFeedbackRouteManifest(raw: unknown): SystemFeedbackRouteManifest | null {
  if (!isRecord(raw)) return null
  const moduleId = pickString(raw.module_id, '')
  if (!moduleId) return null
  const defaults = buildDefaultSystemFeedbackRouteManifest({
    module_id: moduleId,
    display_name: pickString(raw.display_name, moduleId),
    owner: pickString(raw.owner, undefined as unknown as string),
    gate: pickString(raw.gate, undefined as unknown as string),
    compass: pickString(raw.compass, undefined as unknown as string),
    ttl_ms: pickNumber(raw.ttl_ms, DEFAULT_STATUS_DIALOGUE_EVENT_TTL_MS)
  })
  const broadcastPolicyRaw = isRecord(raw.broadcast_policy) ? raw.broadcast_policy : {}
  const severityMappingRaw = isRecord(raw.severity_mapping) ? raw.severity_mapping : {}
  const severityMapping: Record<string, ModuleStatusEventSeverity> = { ...defaults.severity_mapping }
  for (const [key, value] of Object.entries(severityMappingRaw)) {
    severityMapping[key] = normalizeSeverity(value)
  }
  const defaultMode =
    broadcastPolicyRaw.default_mode === 'immediate' ||
    broadcastPolicyRaw.default_mode === 'inline' ||
    broadcastPolicyRaw.default_mode === 'idle_reminder' ||
    broadcastPolicyRaw.default_mode === 'summary' ||
    broadcastPolicyRaw.default_mode === 'silent'
      ? broadcastPolicyRaw.default_mode
      : defaults.broadcast_policy.default_mode
  return {
    ...defaults,
    schema: SYSTEM_FEEDBACK_ROUTE_MANIFEST_SCHEMA,
    display_name: pickString(raw.display_name, defaults.display_name),
    owner: pickString(raw.owner, defaults.owner),
    gate: pickString(raw.gate, defaults.gate),
    compass: pickString(raw.compass, defaults.compass),
    status_card_output: pickString(raw.status_card_output, defaults.status_card_output),
    status_event_output: pickString(raw.status_event_output, defaults.status_event_output),
    ttl_ms: Math.max(1000, pickNumber(raw.ttl_ms, defaults.ttl_ms)),
    severity_mapping: severityMapping,
    broadcast_policy: {
      default_mode: defaultMode,
      critical_interrupt_allowed: pickBoolean(
        broadcastPolicyRaw.critical_interrupt_allowed,
        defaults.broadcast_policy.critical_interrupt_allowed
      ),
      idle_reminder_allowed: pickBoolean(
        broadcastPolicyRaw.idle_reminder_allowed,
        defaults.broadcast_policy.idle_reminder_allowed
      ),
      max_events_per_snapshot: Math.max(
        1,
        Math.min(20, pickNumber(broadcastPolicyRaw.max_events_per_snapshot, defaults.broadcast_policy.max_events_per_snapshot))
      )
    },
    privacy_boundary: unique(pickStringArray(raw.privacy_boundary), 10).length
      ? unique(pickStringArray(raw.privacy_boundary), 10)
      : defaults.privacy_boundary,
    fallback_behavior: pickString(raw.fallback_behavior, defaults.fallback_behavior)
  }
}

export function validateSystemFeedbackRouteManifest(
  raw: unknown,
  generatedAt = new Date().toISOString()
): SystemFeedbackRouteManifestValidationResult {
  const manifest = normalizeSystemFeedbackRouteManifest(raw)
  const source = isRecord(raw) ? raw : {}
  const moduleId = pickString(source.module_id, manifest?.module_id ?? 'unknown-module')
  const requiredFields = [
    'module_id',
    'owner',
    'gate',
    'compass',
    'status_card_output',
    'status_event_output',
    'ttl_ms',
    'severity_mapping',
    'broadcast_policy',
    'privacy_boundary',
    'fallback_behavior'
  ]
  const missingFields = requiredFields.filter((field) => {
    const value = source[field]
    if (field === 'ttl_ms') return !(typeof value === 'number' && Number.isFinite(value) && value > 0)
    if (field === 'severity_mapping' || field === 'broadcast_policy') return !isRecord(value)
    if (field === 'privacy_boundary') return !Array.isArray(value) || value.length === 0
    return typeof value !== 'string' || value.trim().length === 0
  })
  const statusCardOk = manifest?.status_card_output.includes('runtime/status-cards') ?? false
  const statusEventOk = manifest?.status_event_output.includes('runtime/status-events') ?? false
  const warnings = [
    ...(manifest && manifest.broadcast_policy.critical_interrupt_allowed ? [] : ['critical_interrupt_not_allowed']),
    ...(manifest && manifest.broadcast_policy.max_events_per_snapshot < 2 ? ['max_events_per_snapshot_too_low'] : []),
    ...(statusCardOk ? [] : ['status_card_output_should_point_to_runtime/status-cards']),
    ...(statusEventOk ? [] : ['status_event_output_should_point_to_runtime/status-events'])
  ]
  return {
    schema: 'system_feedback_route_manifest_validation.v1',
    generated_at: generatedAt,
    module_id: moduleId,
    ok: Boolean(manifest) && missingFields.length === 0 && statusCardOk && statusEventOk,
    missing_fields: missingFields,
    warnings,
    required_outputs: {
      module_status_card: statusCardOk,
      module_status_event: statusEventOk
    }
  }
}

export function normalizeModuleStatusEvent(raw: unknown): ModuleStatusEvent | null {
  if (!isRecord(raw)) return null
  const eventId = pickString(raw.event_id, '')
  const sourceModule = pickString(raw.source_module, '')
  if (!eventId || !sourceModule) return null
  const severity = normalizeSeverity(raw.severity)
  const sourceNode = pickString(raw.source_node, sourceModule)
  const headline = pickString(raw.headline, 'status event has no headline')
  const summary = pickString(raw.summary, headline)
  const completionRaw = isRecord(raw.completion) ? raw.completion : undefined
  const completion = completionRaw
    ? {
        current: Math.max(0, Math.min(1, pickNumber(completionRaw.current, 0))),
        label: pickString(completionRaw.label, '')
      }
    : undefined
  return {
    schema: MODULE_STATUS_EVENT_SCHEMA,
    event_id: eventId,
    generated_at: normalizeGeneratedAt(raw.generated_at),
    source_module: sourceModule,
    source_node: sourceNode,
    event_type: normalizeEventType(raw.event_type),
    severity,
    headline,
    summary,
    ...(completion ? { completion } : {}),
    gate: pickString(raw.gate, 'status_event_gate'),
    compass: pickString(raw.compass, `${sourceModule}.${sourceNode}`),
    evidence_refs: unique(pickStringArray(raw.evidence_refs), 8),
    recommended_broadcast: normalizeBroadcastRecommendation(raw.recommended_broadcast, severity),
    ttl_ms: Math.max(0, pickNumber(raw.ttl_ms, DEFAULT_STATUS_DIALOGUE_EVENT_TTL_MS)),
    dedupe_key: pickString(raw.dedupe_key, `${sourceModule}:${sourceNode}:${eventId}`),
    boundary: unique(pickStringArray(raw.boundary), 8)
  }
}

function severityWeight(severity: ModuleStatusEventSeverity): number {
  if (severity === 'critical') return 5
  if (severity === 'blocked') return 4
  if (severity === 'warn') return 3
  if (severity === 'notice') return 2
  return 1
}

export function buildSystemEventSnapshot({
  events,
  expectedPublishers = [],
  now = new Date(),
  ttlMs = DEFAULT_STATUS_DIALOGUE_EVENT_TTL_MS,
  readErrors = [],
  source = 'main_process_status_events',
  eventDir
}: {
  events: ModuleStatusEvent[]
  expectedPublishers?: ExpectedStatusEventPublisher[]
  now?: Date | string | number
  ttlMs?: number
  readErrors?: string[]
  source?: SystemEventSnapshotSource
  eventDir?: string
}): SystemEventSnapshot {
  const snapshotNow = normalizeNow(now)
  const generatedAt = snapshotNow.toISOString()
  const nowMs = snapshotNow.getTime()
  const byDedupe = new Map<string, ModuleStatusEvent>()
  const conflictIds = new Set<string>()

  for (const event of events) {
    const key = event.dedupe_key || event.event_id
    const existing = byDedupe.get(key)
    if (!existing) {
      byDedupe.set(key, event)
      continue
    }
    conflictIds.add(key)
    if (eventTimeValue(event) >= eventTimeValue(existing)) byDedupe.set(key, event)
  }

  const normalizedEvents = Array.from(byDedupe.values())
  const staleEventIds = normalizedEvents
    .filter((event) => {
      const generated = eventTimeValue(event)
      const effectiveTtl = event.ttl_ms > 0 ? event.ttl_ms : ttlMs
      return generated <= 0 || generated + effectiveTtl < nowMs
    })
    .map((event) => event.event_id)
    .sort()
  const expectedIds = new Set(expectedPublishers.map((publisher) => publisher.module_id))
  const publishingIds = new Set(normalizedEvents.map((event) => event.source_module))
  const missingPublishers = Array.from(expectedIds).filter((id) => !publishingIds.has(id)).sort()
  const eventsBySource: Record<string, number> = {}
  for (const event of normalizedEvents) {
    eventsBySource[event.source_module] = (eventsBySource[event.source_module] ?? 0) + 1
  }
  const topEvents = normalizedEvents
    .sort((a, b) => {
      const severityDelta = severityWeight(b.severity) - severityWeight(a.severity)
      if (severityDelta !== 0) return severityDelta
      return eventTimeValue(b) - eventTimeValue(a)
    })
    .slice(0, 20)
  const patrolFindings = [
    `events fresh/stale/critical: ${Math.max(0, normalizedEvents.length - staleEventIds.length)}/${staleEventIds.length}/${normalizedEvents.filter((event) => event.severity === 'critical').length}`,
    ...(topEvents.length > 0 ? [`top event: ${topEvents[0].headline}`] : ['no module status events loaded']),
    ...(missingPublishers.length > 0 ? [`missing event publishers: ${missingPublishers.slice(0, 6).join(', ')}`] : []),
    ...(conflictIds.size > 0 ? [`duplicate event keys: ${Array.from(conflictIds).slice(0, 6).join(', ')}`] : []),
    ...(readErrors.length > 0 ? [`event read errors: ${readErrors.slice(0, 3).join(' | ')}`] : [])
  ]

  return {
    schema: SYSTEM_EVENT_SNAPSHOT_SCHEMA,
    generated_at: generatedAt,
    events_total: normalizedEvents.length,
    events_fresh: Math.max(0, normalizedEvents.length - staleEventIds.length),
    events_stale: staleEventIds.length,
    events_critical: normalizedEvents.filter((event) => event.severity === 'critical').length,
    events_by_source: eventsBySource,
    top_events: topEvents,
    stale_event_ids: staleEventIds,
    conflict_event_ids: Array.from(conflictIds).sort(),
    read_errors: readErrors,
    missing_publishers: missingPublishers,
    patrol_findings: patrolFindings,
    source,
    ...(eventDir ? { event_dir: eventDir } : {})
  }
}

export function buildDefaultSystemEventSnapshot(generatedAt = new Date().toISOString()): SystemEventSnapshot {
  return {
    schema: SYSTEM_EVENT_SNAPSHOT_SCHEMA,
    generated_at: generatedAt,
    events_total: 0,
    events_fresh: 0,
    events_stale: 0,
    events_critical: 0,
    events_by_source: {},
    top_events: [],
    stale_event_ids: [],
    conflict_event_ids: [],
    read_errors: [],
    missing_publishers: [],
    patrol_findings: ['no module status events loaded'],
    source: 'local_default'
  }
}

export function deriveVoiceEventBroadcastWeight(event: ModuleStatusEvent): VoiceEventBroadcastWeight {
  if (!event.recommended_broadcast.speakable || event.recommended_broadcast.mode === 'silent') return 'silent'
  if (event.severity === 'critical') return 'critical'
  if (event.severity === 'blocked' || event.severity === 'warn') return 'high'
  if (event.severity === 'notice') return 'normal'
  return 'low'
}

export function deriveVoiceEventPlayMode(
  weight: VoiceEventBroadcastWeight,
  dialogueState: VoiceEventDialogueState
): VoiceEventPlayMode {
  if (weight === 'silent') return 'silent'
  if (weight === 'critical') return 'interrupt_now'
  if (weight === 'high') return dialogueState === 'idle' ? 'merge_into_current_reply' : 'after_current_sentence'
  if (weight === 'normal') return 'merge_into_current_reply'
  return 'idle_reminder'
}

export function buildVoiceEventBroadcastRequest({
  event,
  currentDialogueState = 'idle',
  createdAt = new Date().toISOString()
}: {
  event: ModuleStatusEvent
  currentDialogueState?: VoiceEventDialogueState
  createdAt?: string
}): VoiceEventBroadcastRequest {
  const weight = deriveVoiceEventBroadcastWeight(event)
  const requestedPlayMode = deriveVoiceEventPlayMode(weight, currentDialogueState)
  return {
    schema: VOICE_EVENT_BROADCAST_REQUEST_SCHEMA,
    request_id: `veb_${createdAt.replace(/[-:.TZ]/g, '').slice(0, 14)}_${slug(event.event_id)}`.slice(0, 128),
    created_at: createdAt,
    source_event_id: event.event_id,
    event_type: event.event_type,
    severity: event.severity,
    weight,
    user_relevance: event.severity === 'critical' || event.severity === 'blocked' ? 'direct' : event.severity === 'info' ? 'background' : 'related',
    current_dialogue_state: currentDialogueState,
    requested_play_mode: requestedPlayMode,
    script_goal: '说明发生了什么、影响哪个模块或星云、当前完成度或风险、是否需要确认。',
    one_sentence_summary: truncate(event.summary || event.headline, 180),
    next_action_hint: event.completion?.label || (event.event_type === 'confirmation_needed' ? '等待用户确认。' : '继续保持巡检。'),
    status_refs: unique([event.event_id, event.source_module, event.source_node, event.compass, ...event.evidence_refs], 10),
    requires_confirmation: event.event_type === 'confirmation_needed'
  }
}

export function buildVoiceEventBroadcastRequestsFromSnapshot({
  snapshot,
  currentDialogueState = 'idle',
  limit = 5,
  createdAt = new Date().toISOString()
}: {
  snapshot: SystemEventSnapshot
  currentDialogueState?: VoiceEventDialogueState
  limit?: number
  createdAt?: string
}): VoiceEventBroadcastRequest[] {
  return snapshot.top_events
    .filter((event) => !snapshot.stale_event_ids.includes(event.event_id))
    .map((event) => buildVoiceEventBroadcastRequest({ event, currentDialogueState, createdAt }))
    .filter((request) => request.weight !== 'silent')
    .slice(0, limit)
}

export function buildVoiceBroadcastQueueState({
  requests,
  activeRequestId,
  status,
  generatedAt = new Date().toISOString(),
  lastError
}: {
  requests: VoiceEventBroadcastRequest[]
  activeRequestId?: string
  status?: VoiceBroadcastQueueState['status']
  generatedAt?: string
  lastError?: string
}): VoiceBroadcastQueueState {
  const queued = requests.filter((request) => request.weight !== 'silent')
  return {
    schema: VOICE_BROADCAST_QUEUE_STATE_SCHEMA,
    generated_at: generatedAt,
    status: status ?? (queued.length > 0 ? 'queued' : 'idle'),
    ...(activeRequestId ? { active_request_id: activeRequestId } : {}),
    queued_count: queued.length,
    critical_count: queued.filter((request) => request.weight === 'critical').length,
    high_count: queued.filter((request) => request.weight === 'high').length,
    normal_count: queued.filter((request) => request.weight === 'normal').length,
    low_count: queued.filter((request) => request.weight === 'low').length,
    silent_count: requests.filter((request) => request.weight === 'silent').length,
    next_request_id: queued[0]?.request_id,
    ...(lastError ? { last_error: lastError } : {})
  }
}

function bridgeLineForRequest(request: VoiceEventBroadcastRequest): string {
  if (request.requested_play_mode === 'interrupt_now') return '先打断一下。'
  if (request.requested_play_mode === 'after_current_sentence') return '插一句。'
  if (request.requested_play_mode === 'idle_reminder') return '补充提醒。'
  if (request.requested_play_mode === 'silent') return ''
  return '顺手补充。'
}

function emotionHintForRequest(request: VoiceEventBroadcastRequest): VoiceEventEmotionHint {
  if (request.weight === 'critical') return 'urgent'
  if (request.weight === 'high') return 'focused'
  if (request.weight === 'normal') return 'steady'
  if (request.weight === 'low') return 'warm'
  return 'steady'
}

function buildNaturalVoiceScriptText(request: VoiceEventBroadcastRequest, event: ModuleStatusEvent): string {
  const moduleLabel = humanizeStatusDialogueModuleId(event.source_module)
  const severityLabel = humanizeStatusDialogueTerm(event.severity)
  const reason = deriveEventReason(event)
  const completion = event.completion
    ? `完成度${Math.round(event.completion.current * 100)}%，${humanizeStatusDialogueText(event.completion.label)}。`
    : ''
  const confirmation = request.requires_confirmation
    ? '这需要你确认后再进入下一步。'
    : '当前不需要你立即操作，我会继续跟踪。'
  return [`${moduleLabel}当前${severityLabel}，原因是${reason}。`, completion, confirmation]
    .filter(Boolean)
    .join(' ')
}

export function buildVoiceScriptPatch({
  request,
  event,
  generatedAt = new Date().toISOString()
}: {
  request: VoiceEventBroadcastRequest
  event: ModuleStatusEvent
  generatedAt?: string
}): VoiceScriptPatch {
  const completion = event.completion ? `当前完成度是 ${Math.round(event.completion.current * 100)}%，${event.completion.label}。` : ''
  const confirmation = request.requires_confirmation ? '这需要你确认后再进入下一步。' : '当前不需要你立即操作，我会继续跟踪。'
  const voiceText = [event.summary || event.headline, completion, confirmation].filter(Boolean).join(' ')
  return {
    schema: VOICE_SCRIPT_PATCH_SCHEMA,
    patch_id: `vsp_${generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}_${slug(request.request_id)}`.slice(0, 128),
    source_request_id: request.request_id,
    play_mode: request.requested_play_mode,
    bridge_line: bridgeLineForRequest(request),
    voice_text: truncate(buildNaturalVoiceScriptText(request, event) || voiceText, 260),
    resume_line: request.requested_play_mode === 'interrupt_now' ? '我继续刚才的内容。' : '',
    emotion_hint: emotionHintForRequest(request),
    voice_profile_lock: true,
    max_sentences: request.weight === 'critical' ? 4 : 3
  }
}

export function buildVoiceScriptPatchesFromRequests({
  requests,
  events,
  generatedAt = new Date().toISOString()
}: {
  requests: VoiceEventBroadcastRequest[]
  events: ModuleStatusEvent[]
  generatedAt?: string
}): VoiceScriptPatch[] {
  const eventById = new Map(events.map((event) => [event.event_id, event]))
  return requests
    .map((request) => {
      const event = eventById.get(request.source_event_id)
      return event ? buildVoiceScriptPatch({ request, event, generatedAt }) : null
    })
    .filter((patch): patch is VoiceScriptPatch => Boolean(patch))
}
