import {
  DEFAULT_STATUS_DIALOGUE_CONFIG,
  normalizeStatusDialogueConfig,
  type ModuleStatusCard,
  type StatusDialogueConfig,
  type StatusDialogueContext,
  type StatusDialogueMode,
  type StatusDialogueStatus,
  type StatusSnapshot,
  type SystemPatrolDialogueIndexSummary
} from './contracts'
import type { ModuleStatusEventSeverity, SystemEventSnapshot } from './status-events'

export const DIALOGUE_POLICY_DECISION_SCHEMA = 'dialogue_policy_decision.v1'
export const DIALOGUE_TURN_INTENT_SCHEMA = 'dialogue_turn_intent.v1'
export const PATROL_FINDING_INSERT_SCHEMA = 'patrol_finding_insert.v1'

export type DialogueTurnIntent =
  | 'direct_question'
  | 'execution_request'
  | 'capability_question'
  | 'status_patrol'
  | 'voice_control'
  | 'ambient_or_unclear'
  | 'casual_chat'

export type DialoguePolicyIntentLane =
  | 'status_patrol'
  | 'progress_audit'
  | 'requirement_alignment'
  | 'requirement_handoff'
  | 'command_proposal'
  | 'casual_chat_with_patrol'
  | 'graph_navigation'
  | 'voice_control'
  | 'error_recovery'

export type PatrolFindingSourceType =
  | 'nebula'
  | 'software'
  | 'runtime'
  | 'voice'
  | 'graph'
  | 'task'
  | 'status_card'
  | 'status_event'
  | 'system_patrol_index'
  | 'system_policy'

export type PatrolFindingSeverity = 'info' | 'notice' | 'warn' | 'blocked' | 'critical'
export type PatrolFindingFreshness = 'fresh' | 'stale' | 'missing' | 'conflict' | 'unknown'
export type PatrolFindingInsertMode = 'immediate' | 'inline' | 'idle_reminder' | 'summary' | 'silent'
export type DialoguePolicyResponseShape = 'conclusion_evidence_attention_next'
export type DialoguePolicyTtsPlaybackIntent =
  | 'none'
  | 'status_ok'
  | 'patrol_notice'
  | 'patrol_warn'
  | 'patrol_blocked'
  | 'error_recovery'

export interface PatrolFindingTtsPolicy {
  speakable: boolean
  interrupt_allowed: boolean
  priority: 'normal' | 'notice' | 'urgent'
  emotion_hint: 'steady' | 'focused' | 'warm' | 'urgent' | 'reflective'
}

export interface PatrolFindingInsert {
  schema: typeof PATROL_FINDING_INSERT_SCHEMA
  insert_id: string
  generated_at: string
  source_type: PatrolFindingSourceType
  source_id: string
  node_id: string
  label: string
  severity: PatrolFindingSeverity
  freshness: PatrolFindingFreshness
  gate: string
  compass: string
  evidence_ref?: string
  evidence_refs: string[]
  user_relevance: 'direct' | 'related' | 'background'
  suggested_insert_mode: PatrolFindingInsertMode
  insert_mode: PatrolFindingInsertMode
  tts_policy: PatrolFindingTtsPolicy
  one_sentence_summary: string
  next_action_hint: string
  dedupe_key: string
  ttl_ms: number
  boundary: string[]
}

export interface DialoguePolicyResponsePlan {
  shape: DialoguePolicyResponseShape
  display_sections: Array<'conclusion' | 'evidence' | 'attention' | 'next'>
  voice_sections: Array<'conclusion' | 'key_evidence' | 'next'>
  max_voice_sentences: number
}

export interface DialoguePolicyDecision {
  schema: typeof DIALOGUE_POLICY_DECISION_SCHEMA
  decision_id: string
  generated_at: string
  intent_lane: DialoguePolicyIntentLane
  turn_intent: DialogueTurnIntentDecision
  mode: StatusDialogueMode
  focus_node: string
  policy_sources: string[]
  response_plan: DialoguePolicyResponsePlan
  patrol_insertions: PatrolFindingInsert[]
  voiceText: string
  displayReply: string
  attention_log: string[]
  status_refs: string[]
  missing_status: string[]
  boundary_notes: string[]
  tts_playback_intent: DialoguePolicyTtsPlaybackIntent
  requirement_write_allowed: boolean
  world_model_target: string | null
}

export interface DialogueTurnIntentDecision {
  schema: typeof DIALOGUE_TURN_INTENT_SCHEMA
  intent: DialogueTurnIntent
  confidence: 'low' | 'medium' | 'high'
  user_intent_response: string
  should_run_patrol: boolean
  needs_confirmation: boolean
  status_relevance: 'direct' | 'related' | 'weak'
  evidence: string[]
  boundary: string[]
}

export interface DialoguePolicyDecisionInput {
  userQuery: string
  focus: StatusDialogueContext['focus']
  snapshot?: StatusSnapshot
  config?: Partial<StatusDialogueConfig>
  patrolInsertions?: PatrolFindingInsert[]
  generatedAt?: string
}

function compact(value: string | undefined, fallback = ''): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim()
  return normalized || fallback
}

function normalizeDialoguePolicyInput(value: string): string {
  return value
    .replace(/\u6aa2/g, '\u68c0')
    .replace(/\u7576/g, '\u5f53')
    .replace(/\u72c0/g, '\u72b6')
    .replace(/\u614b/g, '\u6001')
    .replace(/\u904b/g, '\u8fd0')
    .replace(/\u7d71/g, '\u7edf')
    .replace(/\u584a/g, '\u5757')
    .replace(/\u9032/g, '\u8fdb')
    .replace(/\u5c0d/g, '\u5bf9')
    .replace(/\u8a71/g, '\u8bdd')
    .replace(/\u8a9e/g, '\u8bed')
    .replace(/\u97f3/g, '\u97f3')
    .replace(/\u57f7/g, '\u6267')
    .replace(/\u8072/g, '\u58f0')
    .replace(/\u95dc/g, '\u5173')
    .replace(/\u9589/g, '\u95ed')
    .replace(/\u958b/g, '\u5f00')
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

function buildInsertId(parts: string[], generatedAt: string): string {
  const stable = parts.map(slug).filter(Boolean).join('__')
  const stamp = generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14)
  return `pfi_${stamp}_${stable}`.slice(0, 128)
}

function severityFromStatus(status: StatusDialogueStatus): PatrolFindingSeverity {
  if (status === 'blocked') return 'blocked'
  if (status === 'warn') return 'warn'
  if (status === 'ok') return 'info'
  return 'notice'
}

function severityFromStatusEvent(severity: ModuleStatusEventSeverity): PatrolFindingSeverity {
  if (severity === 'critical') return 'critical'
  if (severity === 'blocked') return 'blocked'
  if (severity === 'warn') return 'warn'
  if (severity === 'notice') return 'notice'
  return 'info'
}

function insertModeFromSeverity(severity: PatrolFindingSeverity): PatrolFindingInsertMode {
  if (severity === 'critical' || severity === 'blocked') return 'immediate'
  if (severity === 'warn') return 'inline'
  if (severity === 'notice') return 'summary'
  return 'silent'
}

function ttsPolicyFromSeverity(severity: PatrolFindingSeverity): PatrolFindingTtsPolicy {
  if (severity === 'critical' || severity === 'blocked') {
    return { speakable: true, interrupt_allowed: true, priority: 'urgent', emotion_hint: 'urgent' }
  }
  if (severity === 'warn') {
    return { speakable: true, interrupt_allowed: false, priority: 'notice', emotion_hint: 'focused' }
  }
  if (severity === 'notice') {
    return { speakable: true, interrupt_allowed: false, priority: 'notice', emotion_hint: 'steady' }
  }
  return { speakable: false, interrupt_allowed: false, priority: 'normal', emotion_hint: 'steady' }
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

function createPatrolFindingInsert({
  generatedAt,
  source_type,
  source_id,
  node_id,
  label,
  severity,
  freshness,
  gate,
  compass,
  evidence_refs,
  user_relevance = 'related',
  insert_mode,
  one_sentence_summary,
  next_action_hint,
  ttl_ms = DEFAULT_STATUS_DIALOGUE_CONFIG.status_read.ttl_ms,
  boundary = ['summary_only', 'do_not_read_module_internal_data', 'do_not_guess_missing_status']
}: {
  generatedAt: string
  source_type: PatrolFindingSourceType
  source_id: string
  node_id: string
  label: string
  severity: PatrolFindingSeverity
  freshness: PatrolFindingFreshness
  gate: string
  compass: string
  evidence_refs: string[]
  user_relevance?: PatrolFindingInsert['user_relevance']
  insert_mode?: PatrolFindingInsertMode
  one_sentence_summary: string
  next_action_hint: string
  ttl_ms?: number
  boundary?: string[]
}): PatrolFindingInsert {
  const resolvedInsertMode = insert_mode ?? insertModeFromSeverity(severity)
  const resolvedEvidenceRefs = unique(evidence_refs, 8)
  return {
    schema: PATROL_FINDING_INSERT_SCHEMA,
    insert_id: buildInsertId([source_type, source_id, node_id, severity, freshness], generatedAt),
    generated_at: generatedAt,
    source_type,
    source_id,
    node_id,
    label,
    severity,
    freshness,
    gate,
    compass,
    evidence_ref: resolvedEvidenceRefs[0],
    evidence_refs: resolvedEvidenceRefs,
    user_relevance,
    suggested_insert_mode: resolvedInsertMode,
    insert_mode: resolvedInsertMode,
    tts_policy: ttsPolicyFromSeverity(severity),
    one_sentence_summary: truncate(one_sentence_summary, 180),
    next_action_hint: truncate(next_action_hint, 160),
    dedupe_key: `${source_id}:${node_id}:${severity}:${freshness}`,
    ttl_ms,
    boundary
  }
}

export function buildPatrolFindingInsertFromStatusCard({
  card,
  freshness = 'fresh',
  generatedAt = new Date().toISOString()
}: {
  card: ModuleStatusCard
  freshness?: PatrolFindingFreshness
  generatedAt?: string
}): PatrolFindingInsert {
  const hasBlocker = card.blockers.length > 0 || card.status === 'blocked'
  const hasRisk = card.risks.length > 0 || card.status === 'warn'
  const severity: PatrolFindingSeverity = hasBlocker ? 'blocked' : hasRisk ? 'warn' : severityFromStatus(card.status)
  const summary = hasBlocker
    ? `${card.display_name}: ${card.blockers[0] ?? card.headline}`
    : hasRisk
      ? `${card.display_name}: ${card.risks[0] ?? card.headline}`
      : `${card.display_name}: ${card.headline}`
  return createPatrolFindingInsert({
    generatedAt,
    source_type: 'status_card',
    source_id: card.module_id,
    node_id: card.module_id,
    label: card.display_name,
    severity,
    freshness,
    gate: card.gate,
    compass: card.module_id,
    evidence_refs: card.source_refs.length ? card.source_refs : [`runtime/status-cards/${card.module_id}.json`],
    user_relevance: severity === 'info' ? 'background' : 'related',
    one_sentence_summary: summary,
    next_action_hint: card.next[0] ?? card.current_task ?? 'Keep this module visible in the patrol summary.',
    ttl_ms: card.ttl_ms
  })
}

export function buildPatrolFindingInsertFromFocus({
  focus,
  generatedAt = new Date().toISOString()
}: {
  focus: StatusDialogueContext['focus']
  generatedAt?: string
}): PatrolFindingInsert {
  const severity: PatrolFindingSeverity =
    /blocked|error|fail/i.test(focus.status) ? 'blocked' : /warn|risk|missing/i.test(focus.status) ? 'warn' : 'notice'
  return createPatrolFindingInsert({
    generatedAt,
    source_type: 'nebula',
    source_id: compact(focus.compass, focus.title),
    node_id: compact(focus.compass, focus.title),
    label: focus.title,
    severity,
    freshness: 'unknown',
    gate: focus.gate,
    compass: focus.compass,
    evidence_refs: ['focused_graph_context'],
    user_relevance: 'direct',
    insert_mode: severity === 'blocked' ? 'immediate' : 'inline',
    one_sentence_summary: `${focus.title}: ${focus.status}`,
    next_action_hint:
      focus.childCount > 0
        ? `This nebula has ${focus.childCount} child particles available for drill-down.`
        : 'This is the current leaf-level focus.'
  })
}

export function buildPatrolFindingInsertFromSystemPatrolIndexSummary({
  summary,
  generatedAt = summary.generated_at || new Date().toISOString()
}: {
  summary: SystemPatrolDialogueIndexSummary
  generatedAt?: string
}): PatrolFindingInsert {
  const sourceHashBlocked = summary.modules_by_source_hash_status.blocked ?? 0
  const sourceDrift = summary.modules_by_patrol_state.source_drift ?? 0
  const gateBlocked = Object.entries(summary.modules_by_gate_decision)
    .filter(([decision]) => /blocked|fail|invalid/i.test(decision))
    .reduce((total, [, count]) => total + count, 0)
  const severity: PatrolFindingSeverity = !summary.readable
    ? 'warn'
    : sourceHashBlocked > 0 || gateBlocked > 0 || /blocked|attention|required/i.test(summary.gate_decision)
      ? 'blocked'
      : sourceDrift > 0 || summary.required_failures.length > 0
        ? 'warn'
        : 'info'
  return createPatrolFindingInsert({
    generatedAt,
    source_type: 'system_patrol_index',
    source_id: 'dialogue_read_index',
    node_id: 'dialogue_system_patrol',
    label: 'dialogue system patrol index',
    severity,
    freshness: summary.readable ? 'fresh' : 'missing',
    gate: summary.gate_decision || 'system_patrol_dialogue_read_gate',
    compass: 'system_patrol.dialogue_read_index',
    evidence_refs: summary.source_refs.length ? summary.source_refs : [summary.index_path],
    user_relevance: 'direct',
    insert_mode: severity === 'blocked' ? 'immediate' : severity === 'warn' ? 'inline' : 'summary',
    one_sentence_summary: summary.summary,
    next_action_hint:
      severity === 'blocked'
        ? 'Keep dialogue replies marked attention-required until source drift and module gates are cleared.'
        : 'Use the dialogue read index as the global patrol summary source.',
    boundary: ['summary_only', 'read_dialogue_read_index_only', 'do_not_guess_missing_modules']
  })
}

export function buildPatrolFindingInsertsFromSnapshot({
  snapshot,
  generatedAt = snapshot.generated_at || new Date().toISOString(),
  maxItems = 18
}: {
  snapshot: StatusSnapshot
  generatedAt?: string
  maxItems?: number
}): PatrolFindingInsert[] {
  const inserts: PatrolFindingInsert[] = []
  const snapshotSeverity = severityFromStatus(snapshot.global_status)
  inserts.push(
    createPatrolFindingInsert({
      generatedAt,
      source_type: 'runtime',
      source_id: snapshot.source ?? 'status_snapshot',
      node_id: 'status_snapshot',
      label: 'status_snapshot.v1',
      severity: snapshotSeverity,
      freshness: snapshot.cards_stale > 0 ? 'stale' : snapshot.cards_missing > 0 ? 'missing' : 'fresh',
      gate: 'status_snapshot_gate',
      compass: 'status_dialogue.status_snapshot',
      evidence_refs: ['status_snapshot.v1'],
      user_relevance: snapshotSeverity === 'info' ? 'background' : 'related',
      insert_mode: snapshotSeverity === 'info' ? 'summary' : 'inline',
      one_sentence_summary: `cards fresh/stale/missing: ${snapshot.cards_fresh}/${snapshot.cards_stale}/${snapshot.cards_missing}`,
      next_action_hint: snapshot.cards_missing > 0 ? 'Ask missing modules to publish status cards.' : 'Keep status snapshot visible.'
    })
  )

  for (const card of snapshot.cards) {
    const freshness: PatrolFindingFreshness = snapshot.stale_module_ids.includes(card.module_id) ? 'stale' : 'fresh'
    inserts.push(buildPatrolFindingInsertFromStatusCard({ card, freshness, generatedAt }))
  }

  for (const moduleId of snapshot.missing_module_ids) {
    inserts.push(
      createPatrolFindingInsert({
        generatedAt,
        source_type: 'runtime',
        source_id: 'status_snapshot',
        node_id: moduleId,
        label: moduleId,
        severity: 'warn',
        freshness: 'missing',
        gate: 'status_card_publish_gate',
        compass: `status_dialogue.missing.${moduleId}`,
        evidence_refs: ['status_snapshot.v1'],
        user_relevance: 'related',
        insert_mode: 'inline',
        one_sentence_summary: `${moduleId}: status card is missing.`,
        next_action_hint: 'Do not guess this module state; wait for a status card.'
      })
    )
  }

  for (const moduleId of snapshot.stale_module_ids) {
    inserts.push(
      createPatrolFindingInsert({
        generatedAt,
        source_type: 'runtime',
        source_id: 'status_snapshot',
        node_id: moduleId,
        label: moduleId,
        severity: 'notice',
        freshness: 'stale',
        gate: 'status_card_ttl_gate',
        compass: `status_dialogue.stale.${moduleId}`,
        evidence_refs: ['status_snapshot.v1'],
        user_relevance: 'related',
        insert_mode: 'summary',
        one_sentence_summary: `${moduleId}: status card is stale.`,
        next_action_hint: 'Refresh this module status before making claims.'
      })
    )
  }

  for (const moduleId of snapshot.conflict_module_ids) {
    inserts.push(
      createPatrolFindingInsert({
        generatedAt,
        source_type: 'runtime',
        source_id: 'status_snapshot',
        node_id: moduleId,
        label: moduleId,
        severity: 'warn',
        freshness: 'conflict',
        gate: 'status_card_dedupe_gate',
        compass: `status_dialogue.conflict.${moduleId}`,
        evidence_refs: ['status_snapshot.v1'],
        user_relevance: 'related',
        insert_mode: 'inline',
        one_sentence_summary: `${moduleId}: duplicate status cards were detected.`,
        next_action_hint: 'Use the newest card and keep the conflict visible.'
      })
    )
  }

  snapshot.read_errors.forEach((error, index) => {
    inserts.push(
      createPatrolFindingInsert({
        generatedAt,
        source_type: 'runtime',
        source_id: 'status_snapshot',
        node_id: `read_error_${index + 1}`,
        label: 'status read error',
        severity: 'warn',
        freshness: 'unknown',
        gate: 'status_card_read_gate',
        compass: 'status_dialogue.read_error',
        evidence_refs: ['status_snapshot.v1'],
        user_relevance: 'related',
        insert_mode: 'inline',
        one_sentence_summary: error,
        next_action_hint: 'Keep text dialogue available and inspect the bad status card.'
      })
    )
  })

  snapshot.patrol_findings.slice(0, 5).forEach((finding, index) => {
    inserts.push(
      createPatrolFindingInsert({
        generatedAt,
        source_type: 'runtime',
        source_id: 'status_snapshot',
        node_id: `patrol_finding_${index + 1}`,
        label: 'snapshot patrol finding',
        severity: snapshotSeverity,
        freshness: 'unknown',
        gate: 'patrol_insert_gate',
        compass: 'status_dialogue.patrol_findings',
        evidence_refs: ['status_snapshot.v1'],
        user_relevance: 'background',
        insert_mode: 'summary',
        one_sentence_summary: finding,
        next_action_hint: 'Use this as a compact patrol note, not as module internal data.'
      })
    )
  })

  return selectTopPatrolFindingInserts(inserts, maxItems)
}

export function buildPatrolFindingInsertsFromSystemEventSnapshot({
  eventSnapshot,
  generatedAt = eventSnapshot.generated_at || new Date().toISOString(),
  maxItems = 12
}: {
  eventSnapshot: SystemEventSnapshot
  generatedAt?: string
  maxItems?: number
}): PatrolFindingInsert[] {
  const inserts: PatrolFindingInsert[] = []
  for (const event of eventSnapshot.top_events) {
    const severity = severityFromStatusEvent(event.severity)
    const freshness: PatrolFindingFreshness = eventSnapshot.stale_event_ids.includes(event.event_id) ? 'stale' : 'fresh'
    inserts.push(
      createPatrolFindingInsert({
        generatedAt,
        source_type: 'status_event',
        source_id: event.source_module,
        node_id: event.source_node,
        label: event.headline,
        severity,
        freshness,
        gate: event.gate,
        compass: event.compass,
        evidence_refs: event.evidence_refs.length ? event.evidence_refs : ['module_status_event.v1'],
        user_relevance: severity === 'critical' || severity === 'blocked' ? 'direct' : severity === 'info' ? 'background' : 'related',
        insert_mode:
          event.recommended_broadcast.mode === 'immediate'
            ? 'immediate'
            : event.recommended_broadcast.mode === 'inline'
              ? 'inline'
              : event.recommended_broadcast.mode === 'idle_reminder'
                ? 'idle_reminder'
                : event.recommended_broadcast.mode === 'summary'
                  ? 'summary'
                  : 'silent',
        one_sentence_summary: event.summary || event.headline,
        next_action_hint:
          event.completion?.label ||
          (event.event_type === 'confirmation_needed' ? 'Wait for user confirmation.' : 'Keep this event visible in patrol.'),
        ttl_ms: event.ttl_ms,
        boundary: event.boundary.length
          ? event.boundary
          : ['summary_only', 'do_not_read_module_internal_data', 'do_not_guess_missing_status']
      })
    )
  }

  for (const publisherId of eventSnapshot.missing_publishers) {
    inserts.push(
      createPatrolFindingInsert({
        generatedAt,
        source_type: 'runtime',
        source_id: 'system_event_snapshot',
        node_id: publisherId,
        label: publisherId,
        severity: 'notice',
        freshness: 'missing',
        gate: 'status_event_publish_gate',
        compass: `status_dialogue.events.missing.${publisherId}`,
        evidence_refs: ['system_event_snapshot.v1'],
        user_relevance: 'background',
        insert_mode: 'summary',
        one_sentence_summary: `${publisherId}: module_status_event.v1 publisher is missing.`,
        next_action_hint: 'Future systems must publish module_status_event.v1 to report changes or faults.'
      })
    )
  }

  eventSnapshot.read_errors.forEach((error, index) => {
    inserts.push(
      createPatrolFindingInsert({
        generatedAt,
        source_type: 'runtime',
        source_id: 'system_event_snapshot',
        node_id: `event_read_error_${index + 1}`,
        label: 'status event read error',
        severity: 'warn',
        freshness: 'unknown',
        gate: 'status_event_read_gate',
        compass: 'status_dialogue.events.read_error',
        evidence_refs: ['system_event_snapshot.v1'],
        user_relevance: 'related',
        insert_mode: 'inline',
        one_sentence_summary: error,
        next_action_hint: 'Inspect the bad module_status_event.v1 file and keep dialogue text available.'
      })
    )
  })

  eventSnapshot.patrol_findings.slice(0, 4).forEach((finding, index) => {
    inserts.push(
      createPatrolFindingInsert({
        generatedAt,
        source_type: 'runtime',
        source_id: 'system_event_snapshot',
        node_id: `system_event_finding_${index + 1}`,
        label: 'system event finding',
        severity: eventSnapshot.events_critical > 0 ? 'critical' : eventSnapshot.events_total > 0 ? 'notice' : 'info',
        freshness: eventSnapshot.events_stale > 0 ? 'stale' : 'unknown',
        gate: 'status_event_snapshot_gate',
        compass: 'status_dialogue.events.snapshot',
        evidence_refs: ['system_event_snapshot.v1'],
        user_relevance: 'background',
        insert_mode: eventSnapshot.events_critical > 0 ? 'immediate' : 'summary',
        one_sentence_summary: finding,
        next_action_hint: 'Use this as event feedback context, not as module internal data.'
      })
    )
  })

  return selectTopPatrolFindingInserts(inserts, maxItems)
}

export function selectTopPatrolFindingInserts(inserts: PatrolFindingInsert[], limit = 12): PatrolFindingInsert[] {
  const severityWeight: Record<PatrolFindingSeverity, number> = {
    critical: 5,
    blocked: 4,
    warn: 3,
    notice: 2,
    info: 1
  }
  const relevanceWeight: Record<PatrolFindingInsert['user_relevance'], number> = {
    direct: 3,
    related: 2,
    background: 1
  }
  const deduped = new Map<string, PatrolFindingInsert>()
  for (const insert of inserts) {
    const existing = deduped.get(insert.dedupe_key)
    if (!existing) {
      deduped.set(insert.dedupe_key, insert)
      continue
    }
    const existingScore = severityWeight[existing.severity] + relevanceWeight[existing.user_relevance]
    const nextScore = severityWeight[insert.severity] + relevanceWeight[insert.user_relevance]
    if (nextScore >= existingScore) deduped.set(insert.dedupe_key, insert)
  }
  return Array.from(deduped.values())
    .sort((a, b) => {
      const bScore = severityWeight[b.severity] + relevanceWeight[b.user_relevance]
      const aScore = severityWeight[a.severity] + relevanceWeight[a.user_relevance]
      return bScore - aScore || a.node_id.localeCompare(b.node_id)
    })
    .slice(0, limit)
}

export function summarizePatrolFindingInsertsForPrompt(inserts: PatrolFindingInsert[], limit = 8): Array<Record<string, string>> {
  return inserts.slice(0, limit).map((insert) => ({
    id: insert.insert_id,
    source_type: insert.source_type,
    node_id: insert.node_id,
    severity: insert.severity,
    freshness: insert.freshness,
    insert_mode: insert.insert_mode,
    summary: insert.one_sentence_summary,
    next: insert.next_action_hint,
    gate: insert.gate,
    compass: insert.compass
  }))
}

export function deriveDialogueTurnIntent(userQuery: string, _context?: StatusDialogueContext): DialogueTurnIntentDecision {
  const originalRaw = compact(userQuery)
  const raw = normalizeDialoguePolicyInput(originalRaw)
  const text = raw.toLowerCase()
  const evidence: string[] = []
  if (raw !== originalRaw) evidence.push('common_chinese_variant_normalized')
  const hasSystemAnchor =
    /system|module|status|patrol|graph|voice|speech|tts|stt|action|task|execute|系统|模块|状态|巡检|图谱|星云|粒子|语音|音频|对话|执行|动作|任务|功能|接口|进度|目标/.test(text)
  const ambientLike =
    /有画面|你现在有画面了吗|孩子|叔叔|阿姨|院子|冬天|白茫茫|干嘛呢|电视|视频里|旁边|背景声|别人说|环境音/.test(raw)
  const asksCapability =
    /是否能够|能否|能不能|可以不可以|可不可以|你能|你可以|能做什么|能力|按照.*(言语|语音|话).*(执行|动作)|按.*(言语|语音|话).*(执行|动作)/.test(raw)
  const asksQuestion =
    /[?？]|是否|吗$|呢$|什么|怎么|怎样|如何|为什么|哪个|哪些|能否|能不能|可以吗|能够/.test(raw)
  const asksVoice = /tts|stt|voice|speech|wake|mic|audio|语音|音频|唤醒|麦克风|转写|播报|声音/.test(text)
  const asksStatus = /status|progress|phase|patrol|audit|状态|进度|阶段|节点|审查|巡检|完成|日志|检查/.test(text)
  const asksOperationalStatus =
    /(?:runtime|running).{0,8}(?:status)|(?:status).{0,8}(?:runtime|running)/i.test(text) ||
    /(?:\u8fd0\u884c).{0,8}(?:\u72b6\u6001)|(?:\u72b6\u6001).{0,8}(?:\u8fd0\u884c)/.test(raw)
  const asksExecution =
    /执行|动作|开始|打开|关闭|发送|生成|修改|实现|优化|新增|删除|帮我|给我|把.*变成|部署|运行|测试|验证/.test(raw)
  const casual = /hi|hello|你好|哈喽|在吗|聊聊|闲聊|谢谢|辛苦/.test(text)

  if (!raw || raw.length < 2) {
    evidence.push('empty_or_too_short')
    return {
      schema: DIALOGUE_TURN_INTENT_SCHEMA,
      intent: 'ambient_or_unclear',
      confidence: 'high',
      user_intent_response: '我刚才没有拿到清晰的话语，先不按指令处理。',
      should_run_patrol: false,
      needs_confirmation: true,
      status_relevance: 'weak',
      evidence,
      boundary: ['no external action', 'ask user to repeat or confirm']
    }
  }

  if (ambientLike && !hasSystemAnchor) {
    evidence.push('ambient_like_transcript', 'no_system_anchor')
    return {
      schema: DIALOGUE_TURN_INTENT_SCHEMA,
      intent: 'ambient_or_unclear',
      confidence: 'high',
      user_intent_response: '我可能听到了背景声或别人的话，先不把它当成你的指令。',
      should_run_patrol: false,
      needs_confirmation: true,
      status_relevance: 'weak',
      evidence,
      boundary: ['no patrol answer for likely ambient speech', 'no external action']
    }
  }

  if (asksVoice) {
    evidence.push('voice_keywords')
    return {
      schema: DIALOGUE_TURN_INTENT_SCHEMA,
      intent: 'voice_control',
      confidence: 'high',
      user_intent_response: '我先按语音链路问题处理，再补充必要的状态证据。',
      should_run_patrol: true,
      needs_confirmation: false,
      status_relevance: 'direct',
      evidence,
      boundary: ['voice control still respects patrol_only mode']
    }
  }

  if (asksCapability) {
    evidence.push('capability_question_keywords')
    return {
      schema: DIALOGUE_TURN_INTENT_SCHEMA,
      intent: 'capability_question',
      confidence: 'high',
      user_intent_response: '可以，我能先把你的语音转成任务意图和执行草案；但当前阶段不会直接执行外部动作。',
      should_run_patrol: true,
      needs_confirmation: false,
      status_relevance: 'related',
      evidence,
      boundary: ['execution must be converted to confirmed task intent first', 'no external action']
    }
  }

  if (asksOperationalStatus) {
    evidence.push('operational_status_keywords', 'status_patrol_priority_over_execution')
    return {
      schema: DIALOGUE_TURN_INTENT_SCHEMA,
      intent: 'status_patrol',
      confidence: 'high',
      user_intent_response: '\u6211\u6309\u72b6\u6001\u5de1\u68c0\u6765\u5904\u7406\uff0c\u5148\u770b\u5f53\u524d\u8bc1\u636e\u518d\u7ed9\u4e0b\u4e00\u6b65\u3002',
      should_run_patrol: true,
      needs_confirmation: false,
      status_relevance: 'direct',
      evidence,
      boundary: ['read-only status patrol']
    }
  }

  if (asksExecution) {
    evidence.push('execution_request_keywords')
    return {
      schema: DIALOGUE_TURN_INTENT_SCHEMA,
      intent: 'execution_request',
      confidence: 'medium',
      user_intent_response: '我会先把这句话整理成可执行步骤和确认点，当前不会直接触发真实动作。',
      should_run_patrol: true,
      needs_confirmation: true,
      status_relevance: 'related',
      evidence,
      boundary: ['draft before execution', 'confirmation required before action']
    }
  }

  if (asksStatus) {
    evidence.push('status_patrol_keywords')
    return {
      schema: DIALOGUE_TURN_INTENT_SCHEMA,
      intent: 'status_patrol',
      confidence: 'high',
      user_intent_response: '我按状态巡检来处理，先看当前证据再给下一步。',
      should_run_patrol: true,
      needs_confirmation: false,
      status_relevance: 'direct',
      evidence,
      boundary: ['read-only status patrol']
    }
  }

  if (asksQuestion) {
    evidence.push('question_shape')
    return {
      schema: DIALOGUE_TURN_INTENT_SCHEMA,
      intent: 'direct_question',
      confidence: hasSystemAnchor ? 'high' : 'medium',
      user_intent_response: '我先回答你这句话本身，再补充和当前系统状态有关的部分。',
      should_run_patrol: hasSystemAnchor,
      needs_confirmation: false,
      status_relevance: hasSystemAnchor ? 'related' : 'weak',
      evidence,
      boundary: ['answer user question before patrol insert']
    }
  }

  if (casual) {
    evidence.push('casual_chat_keywords')
    return {
      schema: DIALOGUE_TURN_INTENT_SCHEMA,
      intent: 'casual_chat',
      confidence: 'medium',
      user_intent_response: '我在，先自然回应你，同时保留轻量状态观察。',
      should_run_patrol: false,
      needs_confirmation: false,
      status_relevance: 'weak',
      evidence,
      boundary: ['no heavy patrol insert during casual chat']
    }
  }

  evidence.push(hasSystemAnchor ? 'system_anchor_default' : 'weak_context_default')
  return {
    schema: DIALOGUE_TURN_INTENT_SCHEMA,
    intent: hasSystemAnchor ? 'status_patrol' : 'ambient_or_unclear',
    confidence: hasSystemAnchor ? 'medium' : 'low',
    user_intent_response: hasSystemAnchor
      ? '我先按当前系统上下文处理这句话。'
      : '这句话和当前系统目标的关联不清楚，我先不按指令执行。',
    should_run_patrol: hasSystemAnchor,
    needs_confirmation: !hasSystemAnchor,
    status_relevance: hasSystemAnchor ? 'related' : 'weak',
    evidence,
    boundary: hasSystemAnchor ? ['read-only status patrol'] : ['ask for confirmation before processing']
  }
}

export function deriveDialoguePolicyIntentLane(userQuery: string, context?: StatusDialogueContext): DialoguePolicyIntentLane {
  const turnIntent = deriveDialogueTurnIntent(userQuery, context)
  if (turnIntent.intent === 'voice_control') return 'voice_control'
  if (turnIntent.intent === 'capability_question') return 'command_proposal'
  if (turnIntent.intent === 'execution_request') return 'requirement_alignment'
  if (turnIntent.intent === 'ambient_or_unclear') return 'casual_chat_with_patrol'
  if (turnIntent.intent === 'casual_chat') return 'casual_chat_with_patrol'
  const text = normalizeDialoguePolicyInput(compact(userQuery)).toLowerCase()
  const focus = `${context?.focus.title ?? ''} ${context?.focus.status ?? ''}`.toLowerCase()
  if (/error|failed|failure|fallback|not-allowed|network|失败|错误|故障/.test(text)) return 'error_recovery'
  if (/tts|stt|voice|speech|wake|mic|audio|语音|音频|唤醒|麦克风/.test(text)) return 'voice_control'
  if (/requirement|handoff|world model|需求传递|写入世界模型|需求包/.test(text)) return 'requirement_handoff'
  if (/实现|新增|修改|优化|方案|需求|计划|执行/.test(text)) return 'requirement_alignment'
  if (/progress|phase|完成|进度|节点|审查|巡检/.test(text)) return 'progress_audit'
  if (/graph|nebula|particle|3d|星云|粒子|点云|下钻/.test(text) || /nebula|particle/.test(focus)) {
    return 'graph_navigation'
  }
  if (/hi|hello|聊天|闲聊/.test(text)) return 'casual_chat_with_patrol'
  return 'status_patrol'
}

function ttsIntentFromInserts(inserts: PatrolFindingInsert[], lane: DialoguePolicyIntentLane): DialoguePolicyTtsPlaybackIntent {
  if (lane === 'error_recovery') return 'error_recovery'
  if (inserts.some((insert) => insert.severity === 'critical' || insert.severity === 'blocked')) return 'patrol_blocked'
  if (inserts.some((insert) => insert.severity === 'warn')) return 'patrol_warn'
  if (inserts.some((insert) => insert.severity === 'notice')) return 'patrol_notice'
  return 'status_ok'
}

export function buildDialoguePolicyDecision({
  userQuery,
  focus,
  snapshot,
  config,
  patrolInsertions = [],
  generatedAt = new Date().toISOString()
}: DialoguePolicyDecisionInput): DialoguePolicyDecision {
  const normalizedConfig = normalizeStatusDialogueConfig(config)
  const contextLike: StatusDialogueContext = {
    focus,
    global: { moduleCount: 0, starCount: 0, scope: 'policy decision context' },
    boundaries: [],
    statusSnapshot: snapshot,
    config: normalizedConfig
  }
  const intentLane = deriveDialoguePolicyIntentLane(userQuery, contextLike)
  const turnIntent = deriveDialogueTurnIntent(userQuery, contextLike)
  const focusNode = compact(focus.compass, focus.title)
  const selectedInserts = selectTopPatrolFindingInserts(patrolInsertions, 10)
  const statusRefs = unique(
    [
      focusNode,
      ...selectedInserts.map((insert) => insert.node_id),
      ...selectedInserts.flatMap((insert) => insert.evidence_refs),
      ...(snapshot?.cards.slice(0, 5).map((card) => card.module_id) ?? [])
    ],
    12
  )
  const missingStatus = unique(
    [
      ...(snapshot?.missing_module_ids ?? []),
      ...selectedInserts.filter((insert) => insert.freshness === 'missing').map((insert) => insert.node_id)
    ],
    12
  )
  const boundaryNotes = unique(
    [
      'voiceText only for TTS',
      'missing status must not be guessed',
      'no direct world-model state mutation',
      normalizedConfig.future_requirement_forwarding.enabled
        ? 'confirmed requirement packets may target world_model_requirement_inbox'
        : 'requirement forwarding disabled',
      normalizedConfig.mode === 'patrol_only' ? 'patrol_only mode' : 'requirement_forwarding_ready mode'
    ],
    8
  )
  const attentionLog = unique(
    [
      `turn_intent: ${turnIntent.intent}`,
      `intent_lane: ${intentLane}`,
      `intent_response: ${turnIntent.user_intent_response}`,
      `focus: ${focus.title}`,
      `gate: ${focus.gate}`,
      snapshot
        ? `cards fresh/stale/missing: ${snapshot.cards_fresh}/${snapshot.cards_stale}/${snapshot.cards_missing}`
        : 'status snapshot unavailable',
      ...selectedInserts.slice(0, 4).map((insert) => `${insert.severity}: ${insert.one_sentence_summary}`)
    ],
    8
  )
  const requirementWriteAllowed =
    normalizedConfig.mode === 'requirement_forwarding_ready' && normalizedConfig.future_requirement_forwarding.enabled
  return {
    schema: DIALOGUE_POLICY_DECISION_SCHEMA,
    decision_id: `dpd_${generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}_${slug(intentLane)}_${slug(focusNode)}`.slice(0, 128),
    generated_at: generatedAt,
    intent_lane: intentLane,
    turn_intent: turnIntent,
    mode: normalizedConfig.mode,
    focus_node: focusNode,
    policy_sources: ['dialogue-policy.v1', 'status_snapshot.v1', 'focused_graph_context'],
    response_plan: {
      shape: 'conclusion_evidence_attention_next',
      display_sections: ['conclusion', 'evidence', 'attention', 'next'],
      voice_sections: ['conclusion', 'key_evidence', 'next'],
      max_voice_sentences: intentLane === 'error_recovery' ? 2 : 3
    },
    patrol_insertions: selectedInserts,
    voiceText: '我会先说结论，再说依据和下一步。',
    displayReply: '先说结论，再说依据、关注点和下一步。',
    attention_log: attentionLog,
    status_refs: statusRefs,
    missing_status: missingStatus,
    boundary_notes: boundaryNotes,
    tts_playback_intent: turnIntent.should_run_patrol ? ttsIntentFromInserts(selectedInserts, intentLane) : 'none',
    requirement_write_allowed: requirementWriteAllowed,
    world_model_target: requirementWriteAllowed ? normalizedConfig.future_requirement_forwarding.target : null
  }
}
