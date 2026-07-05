import type { StatusDialogueConversationMemoryCard } from './conversation-memory'

export const STATUS_DIALOGUE_CONFIG_SCHEMA = 'status_dialogue_config.v1'
export const STATUS_DIALOGUE_INPUT_SCHEMA = 'status_dialogue_input.v1'
export const STATUS_DIALOGUE_CONTEXT_SCHEMA = 'status_dialogue_context.v1'
export const STATUS_DIALOGUE_OUTPUT_SCHEMA = 'status_dialogue_output.v1'
export const MODULE_STATUS_CARD_SCHEMA = 'module_status_card.v1'
export const STATUS_SNAPSHOT_SCHEMA = 'status_snapshot.v1'
export const SELF_AWARENESS_PROFILE_SCHEMA = 'self_awareness_profile_ref.v1'
export const STATUS_DIALOGUE_SPEECH_PORTS_SCHEMA = 'status_dialogue_speech_ports.v1'
export const STATUS_DIALOGUE_REAL_ENV_CHECK_SCHEMA = 'status_dialogue_real_env_check.v1'
export const STATUS_DIALOGUE_MODEL_TEST_SCHEMA = 'status_dialogue_model_test.v1'
export const STATUS_DIALOGUE_RUNTIME_VOICE_DIAGNOSTIC_SCHEMA = 'status_dialogue_runtime_voice_diagnostic.v1'
export const SYSTEM_PATROL_DIALOGUE_READ_INDEX_SCHEMA = 'system_patrol_dialogue_read_index.v1'
export const SYSTEM_PATROL_DIALOGUE_INDEX_SUMMARY_SCHEMA = 'system_patrol_dialogue_index_summary.v1'
export const STATUS_DIALOGUE_REMOTE_ADAPTER_ID = 'openai_compatible_status_dialogue_adapter'
export const STATUS_DIALOGUE_LOCAL_MODEL_ADAPTER_ID = 'reserved_local_status_dialogue_adapter'
export const STATUS_DIALOGUE_LOCAL_FALLBACK_ADAPTER_ID = 'local_first_person_patrol_fallback'
export const DEFAULT_SYSTEM_PATROL_DIALOGUE_READ_INDEX_PATH = 'runtime/dialogue-system-patrol/dialogue-read-index.json'

export type StatusDialogueMode = 'patrol_only' | 'requirement_forwarding_ready'
export type StatusDialoguePerspective = 'first_person' | 'third_person'
export type StatusDialogueModelLane = 'remote_small_model' | 'local_small_model' | 'local_fallback'
export type StatusDialogueModelProvider = 'openai_compatible' | 'local_runtime' | 'none'
export type StatusDialoguePluginFallback = 'text_input' | 'text_only' | 'browser_speech_synthesis'
export type StatusDialogueStatus = 'ok' | 'warn' | 'blocked' | 'unknown'
export type StatusDialogueFocusDepth = 'global' | 'module' | 'star'
export type StatusSnapshotSource = 'main_process_status_cards' | 'local_default' | 'browser_preview_fallback'
export type StatusDialogueSpeechPortKind = 'stt' | 'tts'
export type StatusDialogueSpeechPortStatus = 'ready' | 'off' | 'fallback' | 'reserved'
export type StatusDialogueRealCheckStatus = 'pass' | 'warn' | 'fail' | 'unknown'
export type SystemPatrolDialogueIndexReadSource =
  | 'main_process_dialogue_read_index'
  | 'local_default'
  | 'browser_preview_fallback'

export interface StatusDialogueConfig {
  schema: typeof STATUS_DIALOGUE_CONFIG_SCHEMA
  mode: StatusDialogueMode
  model: {
    lane: StatusDialogueModelLane
    provider: StatusDialogueModelProvider
    model: string
    base_url: string
    local_runtime: string
  }
  speech_input: {
    enabled: boolean
    adapter: string
    fallback: 'text_input'
  }
  speech_output: {
    enabled: boolean
    adapter: string
    fallback: 'text_only' | 'browser_speech_synthesis'
  }
  status_read: {
    snapshot_path: string
    card_dir: string
    ttl_ms: number
  }
  identity: {
    rules: string
    default_persona: string
  }
  future_requirement_forwarding: {
    enabled: boolean
    target: string
  }
}

export interface DialogueInputEnvelope {
  schema: typeof STATUS_DIALOGUE_INPUT_SCHEMA
  user_query: string
  input_kind: 'text' | 'speech_transcript'
  audio_stream_ref?: string
  received_at: string
  source: 'dialogue_panel' | 'voice_plugin' | 'third_party_window'
}

export interface ModuleStatusCard {
  schema: typeof MODULE_STATUS_CARD_SCHEMA
  module_id: string
  display_name: string
  owner: string
  gate: string
  status: StatusDialogueStatus
  updated_at: string
  ttl_ms: number
  headline: string
  current_focus: string[]
  current_task: string
  inputs: string[]
  outputs: string[]
  blockers: string[]
  risks: string[]
  next: string[]
  confidence: number
  source_refs: string[]
  visibility: 'read_only_summary'
}

export interface ExpectedStatusModule {
  module_id: string
  display_name: string
  owner: string
  gate: string
  compass: string
}

export interface StatusSnapshot {
  schema: typeof STATUS_SNAPSHOT_SCHEMA
  generated_at: string
  cards_total: number
  cards_fresh: number
  cards_stale: number
  cards_missing: number
  global_status: StatusDialogueStatus
  top_focus: string[]
  cards: ModuleStatusCard[]
  missing_module_ids: string[]
  stale_module_ids: string[]
  conflict_module_ids: string[]
  patrol_findings: string[]
  read_errors: string[]
  source?: StatusSnapshotSource
}

export interface StatusSnapshotRequest {
  expected_modules: ExpectedStatusModule[]
  config?: Partial<StatusDialogueConfig>
}

export interface StatusSnapshotReadResult {
  success: boolean
  snapshot: StatusSnapshot
  source: StatusSnapshotSource
  card_dir: string
  errors: string[]
}

export interface SystemPatrolDialogueReadIndexModule {
  module_id: string
  display_name: string
  owner: string
  gate: string
  compass: string
  process_tree_node_id: string
  coverage: string
  status_card_output: string
  status_event_output: string
  build_timeline_output: string
  build_timeline_events_total: number
  build_timeline_event_id: string
  build_timeline_generated_at: string
  build_timeline_phase: string
  build_timeline_status: string
  build_timeline_summary: string
  build_timeline_operation_id: string
  build_timeline_required_failures: string[]
  patrol_block_path: string
  patrol_state: string
  patrol_findings: string[]
  source_hash_status: string
  source_hash: string
  source_hash_required_failures: string[]
  module_gate_decision: string
  required_failures: string[]
  warning_failures: string[]
}

export interface SystemPatrolDialogueReadIndex {
  schema: typeof SYSTEM_PATROL_DIALOGUE_READ_INDEX_SCHEMA
  generated_at: string
  gate_decision: string
  strict_mode: boolean
  modules_total: number
  source: Record<string, string>
  dialogue_reader_contracts?: Record<string, unknown>
  modules: SystemPatrolDialogueReadIndexModule[]
}

export interface SystemPatrolDialogueIndexBlockedModuleSummary {
  module_id: string
  display_name: string
  patrol_state: string
  source_hash_status: string
  module_gate_decision: string
  required_failures: string[]
  evidence_refs: string[]
}

export interface SystemPatrolDialogueIndexSummary {
  schema: typeof SYSTEM_PATROL_DIALOGUE_INDEX_SUMMARY_SCHEMA
  generated_at: string
  readable: boolean
  source: SystemPatrolDialogueIndexReadSource
  index_path: string
  index_generated_at?: string
  gate_decision: string
  strict_mode: boolean
  modules_total: number
  modules_sampled: number
  modules_by_patrol_state: Record<string, number>
  modules_by_source_hash_status: Record<string, number>
  modules_by_gate_decision: Record<string, number>
  modules_by_build_timeline_status: Record<string, number>
  modules_by_build_timeline_phase: Record<string, number>
  blocked_modules: SystemPatrolDialogueIndexBlockedModuleSummary[]
  required_failures: string[]
  source_refs: string[]
  read_errors: string[]
  summary: string
}

export interface SystemPatrolDialogueIndexReadResult {
  success: boolean
  source: SystemPatrolDialogueIndexReadSource
  index_path: string
  index?: SystemPatrolDialogueReadIndex
  summary: SystemPatrolDialogueIndexSummary
  errors: string[]
}

export interface SelfAwarenessProfileRef {
  schema: typeof SELF_AWARENESS_PROFILE_SCHEMA
  profile_id: string
  mode: 'default_first_person_patrol' | 'self_graph_ref'
  stance: string
  long_goal: string
  style: {
    perspective: StatusDialoguePerspective
    tone: 'calm' | 'focused' | 'warm' | 'urgent' | 'reflective'
    concise: boolean
  }
  boundaries: string[]
  source_refs: string[]
}

export interface StatusDialogueRuntimeVoiceDiagnostic {
  schema: typeof STATUS_DIALOGUE_RUNTIME_VOICE_DIAGNOSTIC_SCHEMA
  source: 'main_process_report' | 'browser_preview' | 'unavailable'
  generated_at: string
  report_path?: string
  entry_report_path?: string
  result: string
  next_action?: string
  boundary: string
  summary: {
    pre_entry?: string
    turns?: string
    post_entry?: string
    entry_diagnosis_result?: string
    entry_diagnosis_next_action?: string
    entry_snapshot?: {
      stt_button_found?: boolean
      stt_button_disabled?: boolean
      stt_button_aria_label?: string
      stt_button_rect?: {
        x?: number
        y?: number
        width?: number
        height?: number
        top?: number
        left?: number
        right?: number
        bottom?: number
      }
      stt_button_center?: {
        x?: number
        y?: number
      }
      stt_button_center_hit?: {
        tag?: string
        class_name?: string
        aria_label?: string
        title?: string
        text?: string
      }
      panel_found?: boolean
      panel_rect?: {
        x?: number
        y?: number
        width?: number
        height?: number
        top?: number
        left?: number
        right?: number
        bottom?: number
      }
      selected_adapter?: string
      reason?: string
      ts?: string
      line?: number
    }
    runtime_audit?: string
    remote_config_ready_for_probe?: boolean
    remote_config_missing?: string[]
    goal_result?: string
    goal_summary?: {
      proved?: number
      partial?: number
      missing?: number
      total?: number
    }
  }
}

export interface StatusDialogueContext {
  schema?: typeof STATUS_DIALOGUE_CONTEXT_SCHEMA
  focus: {
    title: string
    status: string
    detail: string
    depth: StatusDialogueFocusDepth
    owner: string
    gate: string
    compass: string
    childCount: number
  }
  global: {
    moduleCount: number
    starCount: number
    scope: string
  }
  boundaries: string[]
  statusSnapshot?: StatusSnapshot
  systemPatrolIndexSummary?: SystemPatrolDialogueIndexSummary
  selfAwarenessProfile?: SelfAwarenessProfileRef
  conversationMemory?: StatusDialogueConversationMemoryCard
  runtimeVoiceDiagnostic?: StatusDialogueRuntimeVoiceDiagnostic
  voiceBridgeState?: {
    schema?: string
    stage: string
    emotion: string
    listen_active: boolean
    speaking_active: boolean
    transcript_preview?: string
    last_sentence?: string
    last_event_type?: string
    event_count?: number
    route_a_boundary?: string[]
  }
  config?: StatusDialogueConfig
}

export interface StatusDialogueOutput {
  schema?: typeof STATUS_DIALOGUE_OUTPUT_SCHEMA
  reply: string
  voiceText: string
  thoughts: string[]
  source: string
  model?: string
  latencyMs?: number
  error?: string
  statusRefs?: string[]
  missingStatus?: string[]
  unspokenPatrolEvents?: string[]
  mode?: StatusDialogueMode
}

export interface StatusDialogueIdentityGuardOptions {
  perspective?: StatusDialoguePerspective
  config?: StatusDialogueConfig
  statusSnapshot?: StatusSnapshot
  fallbackSource?: string
  maxThoughts?: number
}

export interface StatusDialogueModelAdapter {
  id: string
  lane: StatusDialogueModelLane
  complete: (
    input: DialogueInputEnvelope,
    context: StatusDialogueContext,
    config: StatusDialogueConfig
  ) => Promise<StatusDialogueOutput>
}

export interface SpeechToTextInput {
  audio_stream_ref: string
  language: string
  realtime: boolean
}

export interface SpeechToTextResult {
  transcript: string
  confidence: number
  segments: Array<{ text: string; start_ms?: number; end_ms?: number }>
  latency_ms?: number
  provider: string
  fallback_reason?: string
}

export interface SpeechToTextAdapter {
  id: string
  enabled: boolean
  transcribe: (input: SpeechToTextInput, config: StatusDialogueConfig) => Promise<SpeechToTextResult>
}

export interface TextToSpeechInput {
  voice_line: string
  voice_profile: string
  emotion_hint: 'calm' | 'focused' | 'warm' | 'urgent' | 'reflective'
  speed: number
  locale: string
}

export interface TextToSpeechResult {
  playable_audio_ref?: string
  duration_ms?: number
  provider: string
  fallback_reason?: string
}

export interface TextToSpeechAdapter {
  id: string
  enabled: boolean
  speak: (input: TextToSpeechInput, config: StatusDialogueConfig) => Promise<TextToSpeechResult>
}

export interface StatusDialogueSpeechPortState {
  kind: StatusDialogueSpeechPortKind
  label: string
  enabled: boolean
  adapter: string
  status: StatusDialogueSpeechPortStatus
  fallback: StatusDialoguePluginFallback
  fallback_reason: string
  direction: 'audio_to_text' | 'text_to_audio'
  replaceable: boolean
  boundary: string
}

export interface StatusDialogueSpeechPortsState {
  schema: typeof STATUS_DIALOGUE_SPEECH_PORTS_SCHEMA
  generated_at: string
  input: StatusDialogueSpeechPortState
  output: StatusDialogueSpeechPortState
}

export interface StatusDialogueSpeechRuntimeState {
  speechSynthesisAvailable?: boolean
  speechRecognitionAvailable?: boolean
  voiceInputEnabled?: boolean
  voiceOutputEnabled?: boolean
  speechInputActive?: boolean
}

export interface StatusDialogueBrowserSpeechCapabilities {
  mediaDevicesAvailable: boolean
  getUserMediaAvailable: boolean
  mediaRecorderAvailable: boolean
  speechSynthesisAvailable: boolean
  speechRecognitionAvailable: boolean
  secureContext: boolean
}

export interface StatusDialogueRealCheckItem {
  id: string
  label: string
  status: StatusDialogueRealCheckStatus
  detail: string
  input_refs: string[]
  output_refs: string[]
  owner: string
  gate: string
  boundary: string
}

export interface StatusDialogueProviderReadiness {
  configured: boolean
  api_key_configured: boolean
  model: string
  base_url_host: string
  provider_label: string
}

export interface StatusDialogueRealEnvCheckResult {
  schema: typeof STATUS_DIALOGUE_REAL_ENV_CHECK_SCHEMA
  phase: 'real_phase_0'
  generated_at: string
  status: StatusDialogueRealCheckStatus
  provider: StatusDialogueProviderReadiness
  browser: StatusDialogueBrowserSpeechCapabilities
  items: StatusDialogueRealCheckItem[]
  input_ports: string[]
  output_ports: string[]
  boundaries: string[]
  source: 'main_process' | 'browser_preview'
}

export interface StatusDialogueModelTestResult {
  schema: typeof STATUS_DIALOGUE_MODEL_TEST_SCHEMA
  phase: 'real_phase_1'
  generated_at: string
  success: boolean
  status: StatusDialogueRealCheckStatus
  adapter_id: string
  provider_label: string
  model: string
  base_url_host: string
  latency_ms?: number
  reply_preview?: string
  error?: string
  input_refs: string[]
  output_refs: string[]
  boundaries: string[]
}

export const DEFAULT_STATUS_DIALOGUE_CONFIG: StatusDialogueConfig = {
  schema: STATUS_DIALOGUE_CONFIG_SCHEMA,
  mode: 'patrol_only',
  model: {
    lane: 'remote_small_model',
    provider: 'openai_compatible',
    model: 'configurable',
    base_url: 'configurable',
    local_runtime: 'none'
  },
  speech_input: {
    enabled: true,
    adapter: 'chrome_stt_bridge',
    fallback: 'text_input'
  },
  speech_output: {
    enabled: true,
    adapter: 'browser_speech_synthesis',
    fallback: 'text_only'
  },
  status_read: {
    snapshot_path: 'runtime/status-snapshots/current-status-snapshot.json',
    card_dir: 'runtime/status-cards',
    ttl_ms: 30000
  },
  identity: {
    rules: 'identity-response-rules.v1',
    default_persona: 'first_person_patrol'
  },
  future_requirement_forwarding: {
    enabled: false,
    target: 'world_model_requirement_inbox'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function pickNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function pickStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : []
}

function normalizeStatus(value: unknown): StatusDialogueStatus {
  return value === 'ok' || value === 'warn' || value === 'blocked' || value === 'unknown' ? value : 'unknown'
}

function pickStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0)
      .map(([key, item]) => [key, item.trim()])
  )
}

function countByString(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const value of values) {
    const key = value || 'unknown'
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

function uniqueLimitedStrings(values: string[], limit = 12): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
    if (result.length >= limit) break
  }
  return result
}

function normalizeSystemPatrolDialogueReadIndexModule(raw: unknown): SystemPatrolDialogueReadIndexModule | null {
  if (!isRecord(raw)) return null
  const moduleId = pickString(raw.module_id, '')
  if (!moduleId) return null
  return {
    module_id: moduleId,
    display_name: pickString(raw.display_name, moduleId),
    owner: pickString(raw.owner, 'unknown'),
    gate: pickString(raw.gate, 'system_patrol_coverage_gate'),
    compass: pickString(raw.compass, `system_patrol.${moduleId}`),
    process_tree_node_id: pickString(raw.process_tree_node_id, moduleId),
    coverage: pickString(raw.coverage, 'unknown'),
    status_card_output: pickString(raw.status_card_output, ''),
    status_event_output: pickString(raw.status_event_output, ''),
    build_timeline_output: pickString(raw.build_timeline_output, ''),
    build_timeline_events_total: Math.max(0, pickNumber(raw.build_timeline_events_total, 0)),
    build_timeline_event_id: pickString(raw.build_timeline_event_id, ''),
    build_timeline_generated_at: pickString(raw.build_timeline_generated_at, ''),
    build_timeline_phase: pickString(raw.build_timeline_phase, 'unknown'),
    build_timeline_status: pickString(raw.build_timeline_status, 'unknown'),
    build_timeline_summary: pickString(raw.build_timeline_summary, ''),
    build_timeline_operation_id: pickString(raw.build_timeline_operation_id, ''),
    build_timeline_required_failures: pickStringArray(raw.build_timeline_required_failures),
    patrol_block_path: pickString(raw.patrol_block_path, ''),
    patrol_state: pickString(raw.patrol_state, 'unknown'),
    patrol_findings: pickStringArray(raw.patrol_findings),
    source_hash_status: pickString(raw.source_hash_status, 'unknown'),
    source_hash: pickString(raw.source_hash, ''),
    source_hash_required_failures: pickStringArray(raw.source_hash_required_failures),
    module_gate_decision: pickString(raw.module_gate_decision, 'unknown'),
    required_failures: pickStringArray(raw.required_failures),
    warning_failures: pickStringArray(raw.warning_failures)
  }
}

export function normalizeSystemPatrolDialogueReadIndex(raw: unknown): SystemPatrolDialogueReadIndex | null {
  if (!isRecord(raw) || raw.schema !== SYSTEM_PATROL_DIALOGUE_READ_INDEX_SCHEMA) return null
  const modules = Array.isArray(raw.modules)
    ? raw.modules
        .map(normalizeSystemPatrolDialogueReadIndexModule)
        .filter((item): item is SystemPatrolDialogueReadIndexModule => Boolean(item))
    : []
  return {
    schema: SYSTEM_PATROL_DIALOGUE_READ_INDEX_SCHEMA,
    generated_at: pickString(raw.generated_at, new Date().toISOString()),
    gate_decision: pickString(raw.gate_decision, 'unknown'),
    strict_mode: pickBoolean(raw.strict_mode, false),
    modules_total: Math.max(0, pickNumber(raw.modules_total, modules.length)),
    source: pickStringRecord(raw.source),
    dialogue_reader_contracts: isRecord(raw.dialogue_reader_contracts) ? raw.dialogue_reader_contracts : undefined,
    modules
  }
}

export function summarizeSystemPatrolDialogueReadIndex(
  index: SystemPatrolDialogueReadIndex | null,
  options: {
    readErrors?: string[]
    source?: SystemPatrolDialogueIndexReadSource
    indexPath?: string
  } = {}
): SystemPatrolDialogueIndexSummary {
  const generatedAt = new Date().toISOString()
  const source = options.source ?? 'local_default'
  const indexPath = options.indexPath ?? DEFAULT_SYSTEM_PATROL_DIALOGUE_READ_INDEX_PATH
  const readErrors = uniqueLimitedStrings(options.readErrors ?? [], 8)
  if (!index) {
    const summary = readErrors.length
      ? `System patrol dialogue read index unavailable: ${readErrors[0]}`
      : 'System patrol dialogue read index unavailable.'
    return {
      schema: SYSTEM_PATROL_DIALOGUE_INDEX_SUMMARY_SCHEMA,
      generated_at: generatedAt,
      readable: false,
      source,
      index_path: indexPath,
      gate_decision: 'index_unavailable',
      strict_mode: false,
      modules_total: 0,
      modules_sampled: 0,
      modules_by_patrol_state: {},
      modules_by_source_hash_status: {},
      modules_by_gate_decision: {},
      modules_by_build_timeline_status: {},
      modules_by_build_timeline_phase: {},
      blocked_modules: [],
      required_failures: [],
      source_refs: [indexPath],
      read_errors: readErrors,
      summary
    }
  }

  const modulesByPatrolState = countByString(index.modules.map((module) => module.patrol_state))
  const modulesBySourceHashStatus = countByString(index.modules.map((module) => module.source_hash_status))
  const modulesByGateDecision = countByString(index.modules.map((module) => module.module_gate_decision))
  const modulesByBuildTimelineStatus = countByString(index.modules.map((module) => module.build_timeline_status))
  const modulesByBuildTimelinePhase = countByString(index.modules.map((module) => module.build_timeline_phase))
  const blockedModules = index.modules
    .filter((module) => {
      if (module.required_failures.length > 0 || module.source_hash_required_failures.length > 0) return true
      if (module.build_timeline_required_failures.length > 0) return true
      if (/blocked|fail|invalid|missing/i.test(module.build_timeline_status)) return true
      if (/blocked|fail|invalid|drift/i.test(module.source_hash_status)) return true
      if (/blocked|fail|invalid/i.test(module.module_gate_decision)) return true
      return /blocked|fail|invalid|drift/i.test(module.patrol_state)
    })
    .slice(0, 10)
    .map((module) => ({
      module_id: module.module_id,
      display_name: module.display_name,
      patrol_state: module.patrol_state,
      source_hash_status: module.source_hash_status,
      module_gate_decision: module.module_gate_decision,
      required_failures: uniqueLimitedStrings(
        [
          ...module.required_failures,
          ...module.source_hash_required_failures,
          ...module.build_timeline_required_failures
        ],
        6
      ),
      evidence_refs: uniqueLimitedStrings(
        [module.patrol_block_path, module.status_card_output, module.status_event_output, module.build_timeline_output].filter(Boolean),
        6
      )
    }))
  const requiredFailures = uniqueLimitedStrings(
    index.modules.flatMap((module) => [
      ...module.required_failures,
      ...module.source_hash_required_failures,
      ...module.build_timeline_required_failures
    ]),
    14
  )
  const sourceRefs = uniqueLimitedStrings([indexPath, ...Object.values(index.source)], 12)
  const sourceHashBlocked = modulesBySourceHashStatus.blocked ?? 0
  const sourceDrift = modulesByPatrolState.source_drift ?? 0
  const gateBlocked = Object.entries(modulesByGateDecision)
    .filter(([decision]) => /blocked|fail|invalid/i.test(decision))
    .reduce((total, [, count]) => total + count, 0)
  const timelineBlocked = Object.entries(modulesByBuildTimelineStatus)
    .filter(([status]) => /blocked|fail|invalid|missing/i.test(status))
    .reduce((total, [, count]) => total + count, 0)
  const moduleTotal = Math.max(index.modules_total, index.modules.length)
  const summaryParts = [
    `gate=${index.gate_decision || 'unknown'}`,
    `modules=${moduleTotal}`,
    `source_drift=${sourceDrift}`,
    `source_hash_blocked=${sourceHashBlocked}`,
    `gate_blocked=${gateBlocked}`,
    `timeline_blocked=${timelineBlocked}`
  ]
  return {
    schema: SYSTEM_PATROL_DIALOGUE_INDEX_SUMMARY_SCHEMA,
    generated_at: generatedAt,
    readable: readErrors.length === 0,
    source,
    index_path: indexPath,
    index_generated_at: index.generated_at,
    gate_decision: index.gate_decision,
    strict_mode: index.strict_mode,
    modules_total: moduleTotal,
    modules_sampled: index.modules.length,
    modules_by_patrol_state: modulesByPatrolState,
    modules_by_source_hash_status: modulesBySourceHashStatus,
    modules_by_gate_decision: modulesByGateDecision,
    modules_by_build_timeline_status: modulesByBuildTimelineStatus,
    modules_by_build_timeline_phase: modulesByBuildTimelinePhase,
    blocked_modules: blockedModules,
    required_failures: requiredFailures,
    source_refs: sourceRefs,
    read_errors: readErrors,
    summary: `System patrol dialogue index: ${summaryParts.join(', ')}.`
  }
}

export function normalizeStatusDialogueConfig(raw?: unknown): StatusDialogueConfig {
  const source = isRecord(raw) ? raw : {}
  const defaults = DEFAULT_STATUS_DIALOGUE_CONFIG
  const model = isRecord(source.model) ? source.model : {}
  const speechInput = isRecord(source.speech_input) ? source.speech_input : {}
  const speechOutput = isRecord(source.speech_output) ? source.speech_output : {}
  const statusRead = isRecord(source.status_read) ? source.status_read : {}
  const identity = isRecord(source.identity) ? source.identity : {}
  const futureRequirementForwarding = isRecord(source.future_requirement_forwarding)
    ? source.future_requirement_forwarding
    : {}

  return {
    schema: STATUS_DIALOGUE_CONFIG_SCHEMA,
    mode: source.mode === 'requirement_forwarding_ready' ? 'requirement_forwarding_ready' : 'patrol_only',
    model: {
      lane:
        model.lane === 'local_small_model' || model.lane === 'local_fallback'
          ? model.lane
          : defaults.model.lane,
      provider:
        model.provider === 'local_runtime' || model.provider === 'none'
          ? model.provider
          : defaults.model.provider,
      model: pickString(model.model, defaults.model.model),
      base_url: pickString(model.base_url, defaults.model.base_url),
      local_runtime: pickString(model.local_runtime, defaults.model.local_runtime)
    },
    speech_input: {
      enabled: pickBoolean(speechInput.enabled, defaults.speech_input.enabled),
      adapter: pickString(speechInput.adapter, defaults.speech_input.adapter),
      fallback: 'text_input'
    },
    speech_output: {
      enabled: pickBoolean(speechOutput.enabled, defaults.speech_output.enabled),
      adapter: pickString(speechOutput.adapter, defaults.speech_output.adapter),
      fallback:
        speechOutput.fallback === 'browser_speech_synthesis'
          ? 'browser_speech_synthesis'
          : defaults.speech_output.fallback
    },
    status_read: {
      snapshot_path: pickString(statusRead.snapshot_path, defaults.status_read.snapshot_path),
      card_dir: pickString(statusRead.card_dir, defaults.status_read.card_dir),
      ttl_ms: pickNumber(statusRead.ttl_ms, defaults.status_read.ttl_ms)
    },
    identity: {
      rules: pickString(identity.rules, defaults.identity.rules),
      default_persona: pickString(identity.default_persona, defaults.identity.default_persona)
    },
    future_requirement_forwarding: {
      enabled: pickBoolean(
        futureRequirementForwarding.enabled,
        defaults.future_requirement_forwarding.enabled
      ),
      target: pickString(futureRequirementForwarding.target, defaults.future_requirement_forwarding.target)
    }
  }
}

export function buildDefaultStatusSnapshot(generatedAt = new Date().toISOString()): StatusSnapshot {
  return {
    schema: STATUS_SNAPSHOT_SCHEMA,
    generated_at: generatedAt,
    cards_total: 0,
    cards_fresh: 0,
    cards_stale: 0,
    cards_missing: 0,
    global_status: 'unknown',
    top_focus: ['subject_status_dialogue'],
    cards: [],
    missing_module_ids: [],
    stale_module_ids: [],
    conflict_module_ids: [],
    patrol_findings: ['status snapshot fallback: no module status cards loaded'],
    read_errors: [],
    source: 'local_default'
  }
}

export function normalizeExpectedStatusModule(raw: unknown): ExpectedStatusModule | null {
  if (!isRecord(raw)) return null
  const moduleId = pickString(raw.module_id, '')
  if (!moduleId) return null
  return {
    module_id: moduleId,
    display_name: pickString(raw.display_name, moduleId),
    owner: pickString(raw.owner, 'unknown'),
    gate: pickString(raw.gate, 'status_card_gate'),
    compass: pickString(raw.compass, moduleId)
  }
}

export function normalizeModuleStatusCard(raw: unknown): ModuleStatusCard | null {
  if (!isRecord(raw)) return null
  const moduleId = pickString(raw.module_id, '')
  if (!moduleId) return null
  const now = new Date().toISOString()
  return {
    schema: MODULE_STATUS_CARD_SCHEMA,
    module_id: moduleId,
    display_name: pickString(raw.display_name, moduleId),
    owner: pickString(raw.owner, 'unknown'),
    gate: pickString(raw.gate, 'status_card_gate'),
    status: normalizeStatus(raw.status),
    updated_at: pickString(raw.updated_at, now),
    ttl_ms: Math.max(0, pickNumber(raw.ttl_ms, DEFAULT_STATUS_DIALOGUE_CONFIG.status_read.ttl_ms)),
    headline: pickString(raw.headline, 'status card has no headline'),
    current_focus: pickStringArray(raw.current_focus),
    current_task: pickString(raw.current_task, ''),
    inputs: pickStringArray(raw.inputs),
    outputs: pickStringArray(raw.outputs),
    blockers: pickStringArray(raw.blockers),
    risks: pickStringArray(raw.risks),
    next: pickStringArray(raw.next),
    confidence: Math.max(0, Math.min(1, pickNumber(raw.confidence, 0))),
    source_refs: pickStringArray(raw.source_refs),
    visibility: 'read_only_summary'
  }
}

function cardTimeValue(card: ModuleStatusCard): number {
  const value = Date.parse(card.updated_at)
  return Number.isFinite(value) ? value : 0
}

function normalizeSnapshotNow(value: Date | string | number | undefined): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (Number.isFinite(parsed.getTime())) return parsed
  }
  return new Date()
}

export function buildStatusSnapshotFromCards({
  cards,
  expectedModules,
  now = new Date(),
  ttlMs = DEFAULT_STATUS_DIALOGUE_CONFIG.status_read.ttl_ms,
  readErrors = [],
  source = 'main_process_status_cards'
}: {
  cards: ModuleStatusCard[]
  expectedModules: ExpectedStatusModule[]
  now?: Date | string | number
  ttlMs?: number
  readErrors?: string[]
  source?: StatusSnapshotSource
}): StatusSnapshot {
  const snapshotNow = normalizeSnapshotNow(now)
  const generatedAt = snapshotNow.toISOString()
  const nowMs = snapshotNow.getTime()
  const expectedIds = new Set(expectedModules.map((module) => module.module_id))
  const byModule = new Map<string, ModuleStatusCard>()
  const conflictIds = new Set<string>()

  for (const card of cards) {
    const existing = byModule.get(card.module_id)
    if (!existing) {
      byModule.set(card.module_id, card)
      continue
    }
    conflictIds.add(card.module_id)
    if (cardTimeValue(card) >= cardTimeValue(existing)) {
      byModule.set(card.module_id, card)
    }
  }

  const normalizedCards = Array.from(byModule.values()).sort((a, b) => a.module_id.localeCompare(b.module_id))
  const missingIds = Array.from(expectedIds).filter((id) => !byModule.has(id)).sort()
  const staleIds = normalizedCards
    .filter((card) => {
      const updatedAt = cardTimeValue(card)
      const effectiveTtl = card.ttl_ms > 0 ? card.ttl_ms : ttlMs
      return updatedAt <= 0 || updatedAt + effectiveTtl < nowMs
    })
    .map((card) => card.module_id)
    .sort()

  const freshCount = normalizedCards.length - staleIds.length
  const blocked = normalizedCards.some((card) => card.status === 'blocked')
  const warn =
    normalizedCards.some((card) => card.status === 'warn') ||
    missingIds.length > 0 ||
    staleIds.length > 0 ||
    conflictIds.size > 0 ||
    readErrors.length > 0
  const globalStatus: StatusDialogueStatus =
    blocked ? 'blocked' : warn ? 'warn' : normalizedCards.length > 0 || expectedModules.length > 0 ? 'ok' : 'unknown'

  const patrolFindings = [
    `cards fresh/stale/missing: ${Math.max(0, freshCount)}/${staleIds.length}/${missingIds.length}`,
    ...(missingIds.length > 0 ? [`missing modules: ${missingIds.slice(0, 6).join(', ')}`] : []),
    ...(staleIds.length > 0 ? [`stale modules: ${staleIds.slice(0, 6).join(', ')}`] : []),
    ...(conflictIds.size > 0 ? [`duplicate module cards: ${Array.from(conflictIds).slice(0, 6).join(', ')}`] : []),
    ...(readErrors.length > 0 ? [`read errors: ${readErrors.slice(0, 3).join(' | ')}`] : [])
  ]

  return {
    schema: STATUS_SNAPSHOT_SCHEMA,
    generated_at: generatedAt,
    cards_total: normalizedCards.length,
    cards_fresh: Math.max(0, freshCount),
    cards_stale: staleIds.length,
    cards_missing: missingIds.length,
    global_status: globalStatus,
    top_focus: normalizedCards.length > 0 ? normalizedCards.slice(0, 5).map((card) => card.module_id) : ['subject_status_dialogue'],
    cards: normalizedCards,
    missing_module_ids: missingIds,
    stale_module_ids: staleIds,
    conflict_module_ids: Array.from(conflictIds).sort(),
    patrol_findings: patrolFindings,
    read_errors: readErrors,
    source
  }
}

export function buildDefaultSelfAwarenessProfile(): SelfAwarenessProfileRef {
  return {
    schema: SELF_AWARENESS_PROFILE_SCHEMA,
    profile_id: 'default_first_person_patrol',
    mode: 'default_first_person_patrol',
    stance: 'I inspect status, explain boundaries, and do not execute actions in this phase.',
    long_goal: 'Keep the 3D particle OS observable, bounded, and ready for future world-model handoff.',
    style: {
      perspective: 'first_person',
      tone: 'focused',
      concise: true
    },
    boundaries: [
      'patrol_only',
      'no_requirement_forwarding_in_phase_1',
      'no_world_model_write',
      'no_real_social_or_event_graph_read',
      'no_external_action'
    ],
    source_refs: ['subject-status-dialogue-module/identity-response-rules.v1.md']
  }
}

export function buildStatusDialogueSpeechPortsState(
  rawConfig?: unknown,
  runtime: StatusDialogueSpeechRuntimeState = {}
): StatusDialogueSpeechPortsState {
  const config = normalizeStatusDialogueConfig(rawConfig)
  const speechSynthesisAvailable = runtime.speechSynthesisAvailable !== false
  const speechRecognitionAvailable = runtime.speechRecognitionAvailable === true
  const voiceInputEnabled = runtime.voiceInputEnabled === true
  const voiceOutputEnabled = runtime.voiceOutputEnabled === true
  const speechInputActive = runtime.speechInputActive === true
  const inputEnabled = config.speech_input.enabled
  const outputEnabled = config.speech_output.enabled
  const inputAdapterAvailable =
    config.speech_input.adapter === 'browser_speech_recognition'
      ? speechRecognitionAvailable
      : config.speech_input.adapter === 'local_whisper_ipc'
        ? true
        : config.speech_input.adapter === 'chrome_stt_bridge'
          ? inputEnabled
        : inputEnabled
  const outputAdapterAvailable =
    config.speech_output.adapter === 'browser_speech_synthesis' ? speechSynthesisAvailable : outputEnabled

  return {
    schema: STATUS_DIALOGUE_SPEECH_PORTS_SCHEMA,
    generated_at: new Date().toISOString(),
    input: {
      kind: 'stt',
      label: 'speech input',
      enabled: inputEnabled && voiceInputEnabled && inputAdapterAvailable,
      adapter: config.speech_input.adapter,
      status: !inputEnabled
        ? 'off'
        : !inputAdapterAvailable
          ? 'fallback'
          : voiceInputEnabled || speechInputActive
            ? 'ready'
            : 'off',
      fallback: config.speech_input.fallback,
      fallback_reason: !inputEnabled
        ? 'STT disabled; text_input fallback active'
        : !inputAdapterAvailable
          ? 'speech input adapter unavailable; text_input fallback active'
          : config.speech_input.adapter === 'chrome_stt_bridge' && (voiceInputEnabled || speechInputActive)
            ? 'chrome_stt_bridge ready; external Chrome Web Speech result routes through desktop IPC'
          : config.speech_input.adapter === 'local_whisper_ipc' && (voiceInputEnabled || speechInputActive)
            ? 'local_whisper_ipc ready; transient microphone audio routes through desktop IPC'
          : voiceInputEnabled || speechInputActive
            ? 'browser_speech_recognition ready; transcript routes through the same status dialogue input'
            : 'microphone input paused by operator; text_input fallback active',
      direction: 'audio_to_text',
      replaceable: true,
      boundary: 'Chrome STT Bridge uses external Chrome Web Speech and returns transcript text through desktop IPC; audio samples are not stored by the floating window.'
    },
    output: {
      kind: 'tts',
      label: 'speech output',
      enabled: outputEnabled && voiceOutputEnabled && outputAdapterAvailable,
      adapter: config.speech_output.adapter,
      status: !outputEnabled
        ? 'off'
        : !outputAdapterAvailable
          ? 'fallback'
          : voiceOutputEnabled
            ? 'ready'
            : 'off',
      fallback: config.speech_output.fallback,
      fallback_reason: !outputEnabled
        ? 'TTS disabled; text_only fallback active'
        : !outputAdapterAvailable
          ? 'speech synthesis unavailable; text_only fallback active'
          : voiceOutputEnabled
            ? 'browser_speech_synthesis ready for voice_line only'
            : 'voice output disabled by operator; text remains active',
      direction: 'text_to_audio',
      replaceable: true,
      boundary: 'Only StatusDialogueOutput.voiceText is spoken; full context and hidden reasoning are never spoken.'
    }
  }
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 1))}…` : normalized
}

function firstSentence(value: string): string {
  const match = value.match(/^(.+?[。！？!?])\s*/)
  return match?.[1]?.trim() || value.trim()
}

function normalizeVoiceText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/([。！？!?])\1+/g, '$1')
    .trim()
}

function firstSentences(value: string, count: number): string {
  const normalized = normalizeVoiceText(value)
  if (!normalized) return ''
  const matches = [...normalized.matchAll(/[^。！？!?]+[。！？!?]?/g)]
    .map((match) => match[0].trim())
    .filter(Boolean)
  return matches.slice(0, Math.max(1, count)).join(' ').trim() || firstSentence(normalized)
}

function buildSpeakableVoiceText(primary: string, fallback: string): string {
  const normalizedPrimary = normalizeVoiceText(primary)
  const normalizedFallback = normalizeVoiceText(fallback)
  if (!normalizedPrimary) return truncateText(firstSentences(normalizedFallback, 3), 220)
  if (normalizedPrimary.length >= 24 || normalizedFallback.length <= normalizedPrimary.length + 16) {
    return truncateText(normalizedPrimary, 220)
  }

  const supplement = firstSentences(normalizedFallback, 2)
  const combined =
    supplement && !normalizedPrimary.includes(supplement)
      ? `${normalizedPrimary} ${supplement}`
      : normalizedPrimary
  return truncateText(normalizeVoiceText(combined), 220)
}

function normalizeVisibleAttentionNotes(value: unknown, fallback: string[], maxThoughts: number): string[] {
  const source = Array.isArray(value) ? value : fallback
  const blockedPatterns = [/隐藏推理链/, /思考过程/, /chain[- ]?of[- ]?thought/i, /internal reasoning/i]
  const seen = new Set<string>()
  const notes = source
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => truncateText(item, 96))
    .filter((item) => !blockedPatterns.some((pattern) => pattern.test(item)))
    .filter((item) => {
      if (seen.has(item)) return false
      seen.add(item)
      return true
    })
    .slice(0, maxThoughts)
  return notes.length > 0 ? notes : ['attention: status summary only']
}

function ensureFirstPersonReply(reply: string, fallback: string): string {
  const normalized = truncateText(reply || fallback, 420)
  if (!normalized) return '我当前只读状态，先保留本地巡逻回答。'
  if (/^(我|这里|当前我|现在我)/.test(normalized)) return normalized
  if (normalized.startsWith('系统当前')) return normalized.replace(/^系统当前/, '我当前')
  if (normalized.startsWith('当前系统')) return normalized.replace(/^当前系统/, '我当前')
  return `我当前看到：${normalized}`
}

function ensureThirdPersonReply(reply: string, fallback: string): string {
  const normalized = truncateText(reply || fallback, 420)
  if (!normalized) return '系统当前处于只读状态检查模式。'
  if (/^(系统|当前系统)/.test(normalized)) return normalized
  return `系统当前视角：${normalized}`
}

function buildCapabilityBoundaryNote(config: StatusDialogueConfig): string | null {
  const missing: string[] = []
  if (!config.speech_input.enabled) missing.push('STT 未接入')
  if (!config.future_requirement_forwarding.enabled) missing.push('需求传递未启用')
  if (config.model.provider === 'none' || config.model.lane === 'local_fallback') missing.push('真实小模型未接入')
  return missing.length > 0 ? `未接入能力：${missing.join('、')}` : null
}

export function guardStatusDialogueOutput(
  output: StatusDialogueOutput,
  options: StatusDialogueIdentityGuardOptions = {}
): StatusDialogueOutput {
  const config = normalizeStatusDialogueConfig(options.config)
  const perspective =
    options.perspective ?? (config.identity.default_persona === 'third_person' ? 'third_person' : 'first_person')
  const maxThoughts = Math.max(1, Math.min(8, options.maxThoughts ?? 6))
  const fallbackReply =
    perspective === 'first_person'
      ? '我当前只读状态，不执行外部动作。'
      : '系统当前处于只读状态检查模式，不执行外部动作。'
  const guardedReply =
    perspective === 'first_person'
      ? ensureFirstPersonReply(output.reply, fallbackReply)
      : ensureThirdPersonReply(output.reply, fallbackReply)
  const voiceBase = output.voiceText || guardedReply
  const guardedVoice =
    perspective === 'first_person'
      ? ensureFirstPersonReply(voiceBase, '我在只读巡逻。')
      : ensureThirdPersonReply(voiceBase, '系统在只读巡逻。')
  const boundaryNote = buildCapabilityBoundaryNote(config)
  const baseThoughts = normalizeVisibleAttentionNotes(output.thoughts, [], maxThoughts)
  const thoughts = normalizeVisibleAttentionNotes(
    [
    ...baseThoughts,
    'policy: conclusion_evidence_attention_next',
    'tts: voiceText only',
    ...(output.missingStatus?.length ? ['missing_status: do not guess'] : []),
    ...(boundaryNote ? [`boundary: ${boundaryNote}`] : []),
    ...(options.statusSnapshot?.read_errors.length ? ['attention: snapshot read errors present'] : [])
    ],
    [],
    maxThoughts
  )

  return {
    ...output,
    schema: STATUS_DIALOGUE_OUTPUT_SCHEMA,
    reply: guardedReply,
    voiceText: buildSpeakableVoiceText(guardedVoice, guardedReply),
    thoughts,
    source: output.source || options.fallbackSource || STATUS_DIALOGUE_LOCAL_FALLBACK_ADAPTER_ID,
    statusRefs: output.statusRefs?.filter((item) => item.trim()).slice(0, 8) ?? [],
    missingStatus: output.missingStatus?.filter((item) => item.trim()).slice(0, 12) ?? [],
    mode: config.mode
  }
}

export function parseStatusDialogueModelOutput(
  text: string,
  fallback: StatusDialogueOutput,
  meta: Partial<StatusDialogueOutput> = {},
  options: StatusDialogueIdentityGuardOptions = {}
): StatusDialogueOutput {
  const trimmed = text.trim()
  let parsedOutput: StatusDialogueOutput
  try {
    const parsedValue = JSON.parse(trimmed) as unknown
    const parsed = isRecord(parsedValue) ? parsedValue : {}
    const reply = pickString(parsed.reply, fallback.reply)
    const voiceText = pickString(parsed.voice, pickString(parsed.voiceText, reply || fallback.voiceText))
    const parsedThoughts = pickStringArray(parsed.thoughts)
    const parsedAttentionLog = pickStringArray(parsed.attention_log)
    const parsedStatusRefs = pickStringArray(parsed.status_refs)
    const parsedCamelStatusRefs = pickStringArray(parsed.statusRefs)
    const parsedMissingStatus = pickStringArray(parsed.missing_status)
    const parsedCamelMissingStatus = pickStringArray(parsed.missingStatus)
    parsedOutput = {
      ...fallback,
      ...meta,
      reply,
      voiceText,
      thoughts: normalizeVisibleAttentionNotes(
        parsedThoughts.length ? parsedThoughts : parsedAttentionLog.length ? parsedAttentionLog : fallback.thoughts,
        fallback.thoughts,
        options.maxThoughts ?? 6
      ),
      statusRefs: parsedStatusRefs.length
        ? parsedStatusRefs
        : parsedCamelStatusRefs.length
          ? parsedCamelStatusRefs
          : fallback.statusRefs,
      missingStatus: parsedMissingStatus.length
        ? parsedMissingStatus
        : parsedCamelMissingStatus.length
          ? parsedCamelMissingStatus
          : fallback.missingStatus
    }
  } catch {
    parsedOutput = {
      ...fallback,
      ...meta,
      reply: trimmed || fallback.reply,
      voiceText: trimmed || fallback.voiceText,
      thoughts: ['model returned plain text', ...fallback.thoughts.slice(0, 4)]
    }
  }
  return guardStatusDialogueOutput(parsedOutput, options)
}
