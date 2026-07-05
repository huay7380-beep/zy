import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  DEFAULT_BROWSER_VOICE_PROFILE,
  DEFAULT_COSYVOICE_VOICE_PROFILE,
  DEFAULT_COSYVOICE_TTS_CONFIG,
  DEFAULT_STATUS_DIALOGUE_CONFIG,
  DEFAULT_UNCONFIGURED_CLONE_PROFILE,
  DEFAULT_XIAOZHI_STYLE_WAKE_CONFIG,
  DEFAULT_XIAOZHI_STYLE_WAKE_DETECTOR_ADAPTER_CONFIG,
  STATUS_DIALOGUE_CONVERSATION_MEMORY_STORAGE_KEY,
  STATUS_DIALOGUE_LOCAL_FALLBACK_ADAPTER_ID,
  STATUS_DIALOGUE_MODEL_TEST_SCHEMA,
  STATUS_DIALOGUE_REAL_ENV_CHECK_SCHEMA,
  STATUS_DIALOGUE_RUNTIME_VOICE_DIAGNOSTIC_SCHEMA,
  STATUS_DIALOGUE_REMOTE_ADAPTER_ID,
  appendVoiceResponseTextDelta,
  applyVoiceToneToPlan,
  assembleStreamingTtsAudioFrames,
  buildDefaultXiaozhiStyleVoiceBridgeState,
  buildDefaultXiaozhiStyleWakeDetectorState,
  buildDefaultXiaozhiStyleVadPrecheckState,
  buildDefaultVoicePlaybackQueueState,
  buildDefaultVoiceResponseTextStreamState,
  buildBrowserVoiceProfiles,
  buildDialoguePolicyDecision,
  buildPatrolFindingInsertsFromSystemEventSnapshot,
  buildPatrolFindingInsertFromSystemPatrolIndexSummary,
  buildPatrolFindingInsertFromFocus,
  buildPatrolFindingInsertsFromSnapshot,
  buildVoiceBroadcastQueueState,
  buildVoiceEventBroadcastRequestsFromSnapshot,
  buildDefaultStatusDialogueConversationMemory,
  buildDefaultSelfAwarenessProfile,
  buildDefaultStatusDialogueTtsRuntimeCandidates,
  buildCosyVoiceRequestBody,
  buildStatusDialogueVoiceOpeningText,
  buildStatusDialogueSpeechPortsState,
  buildSystemEventSnapshot,
  buildStatusSnapshotFromCards,
  buildVoiceLatencyTrace,
  buildShortestNecessaryPostStreamVoice,
  buildVoiceOutputTrace,
  buildVoiceResponsePlan,
  buildVoiceScriptPatchesFromRequests,
  buildXiaozhiStyleVadPrecheckState,
  createXiaozhiStyleVoiceBridgeEvent,
  DEFAULT_SYSTEM_PATROL_DIALOGUE_READ_INDEX_PATH,
  deriveVoiceEmotionPriority,
  extractPartialJsonStringField,
  guardStatusDialogueOutput,
  humanizeStatusDialogueModuleId,
  humanizeStatusDialogueTerm,
  humanizeStatusDialogueText,
  normalizeStatusDialogueConversationMemory,
  parseStatusDialogueModelOutput,
  reduceXiaozhiStyleVoiceBridgeEvent,
  segmentVoiceResponsePlan,
  selectVoiceProfileFallback,
  selectStatusDialogueTtsRuntimeCandidate,
  summarizePatrolFindingInsertsForPrompt,
  summarizeSystemPatrolDialogueReadIndex,
  summarizeXiaozhiStyleBridgeState,
  updateStatusDialogueConversationMemory
} from '../../../core/status-dialogue-contracts'
import type {
  BrowserSpeechSynthesisVoiceLike,
  DialoguePolicyDecision,
  ExpectedStatusModule,
  PatrolFindingInsert,
  StatusDialogueConversationMemoryCard,
  StatusDialogueBrowserSpeechCapabilities,
  StatusDialogueContext,
  StatusDialogueModelTestResult,
  StatusDialogueOutput,
  StatusDialoguePerspective,
  StatusDialogueRealEnvCheckResult,
  StatusDialogueRuntimeVoiceDiagnostic,
  StatusDialogueTtsHealthResult,
  StatusDialogueTtsRuntimeCandidate,
  StatusDialogueTtsSynthesisRequest,
  StatusDialogueTtsSynthesisResult,
  SystemPatrolDialogueIndexReadResult,
  SystemPatrolDialogueIndexSummary,
  StatusSnapshot,
  StatusSnapshotReadResult,
  SystemEventSnapshot,
  SystemEventSnapshotReadResult,
  StreamingTtsAudioFrame,
  VoiceLatencySegment,
  VoiceLatencyTrace,
  VoiceEmotionPreset,
  VoiceBroadcastQueueState,
  VoiceEventBroadcastRequest,
  VoiceOutputChunk,
  VoiceOutputTrace,
  VoicePlaybackQueueState,
  VoiceResponsePlan,
  VoiceScriptPatch,
  VoiceProfile,
  XiaozhiStyleEmotion,
  XiaozhiStyleWakeDetectorAdapterConfig,
  XiaozhiStyleWakeDetectorState,
  XiaozhiStyleVadPrecheckState,
  XiaozhiStyleVoiceBridgeEventType,
  XiaozhiStyleVoiceBridgeState,
  XiaozhiStyleWakeConfig
} from '../../../core/status-dialogue-contracts'
import './zhineng-console.css'

interface BrowserSpeechRecognitionAlternative {
  transcript: string
  confidence?: number
}

interface BrowserSpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: BrowserSpeechRecognitionAlternative
}

interface BrowserSpeechRecognitionResultList {
  readonly length: number
  [index: number]: BrowserSpeechRecognitionResult
}

interface BrowserSpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: BrowserSpeechRecognitionResultList
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  readonly error?: string
  readonly message?: string
}

interface BrowserSpeechRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition

interface WindowWithBrowserSpeechRecognition extends Window {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
}

interface WindowWithAudioContext extends Window {
  webkitAudioContext?: typeof AudioContext
}

interface LocalSpeechRecorder {
  stop: () => void
  cancel: () => void
}

interface StatusDialogueQueuedInput {
  id: string
  text: string
  input_kind: StatusDialogueInputKind
  source: StatusDialogueInputQueueSource
  reason: string
  priority: StatusDialogueInputQueuePriority
  echo_boundary: StatusDialogueInputEchoBoundary
  queued_during_tts: boolean
  voice_queue_status?: string
  wake_stage?: W3WakeDetectorStage
  queued_at: string
  created_at_ms: number
}

interface StatusDialogueInputQueueState {
  queued_count: number
  queued_during_tts_count: number
  last_queued_at?: string
  last_kind?: StatusDialogueInputKind
  last_reason?: string
  last_priority?: StatusDialogueInputQueuePriority
  last_echo_boundary?: StatusDialogueInputEchoBoundary
  last_text_preview?: string
}

type StatusDialogueSttModel = 'tiny' | 'base'
type StatusDialogueSttAdapterMode = 'cloud' | 'local' | 'remote'
type StatusDialogueInputKind = 'text' | 'speech_transcript'
type StatusDialogueInputQueueSource = 'operator' | 'stt' | 'w3' | 'retry'
type StatusDialogueInputQueuePriority = 'normal' | 'after_current_voice' | 'urgent'
type StatusDialogueInputEchoBoundary = 'none' | 'wake_detector_paused_only' | 'formal_input_allowed'
type StatusDialogueModelStreamActivityType = 'delta' | 'voice_progress'

interface StatusDialogueModelStreamActivityEvent {
  type: StatusDialogueModelStreamActivityType
  deltaCount?: number
  accumulatedLength?: number
  deltaLength?: number
  extractedVoiceLength?: number
}

type StatusDialogueCloudSttFailureCategory =
  | 'none'
  | 'no_speech'
  | 'network'
  | 'permission'
  | 'timeout'
  | 'cancelled'
  | 'launch_failed'
  | 'bridge_failed'
  | 'service_unavailable'
  | 'ended_without_audio'
  | 'empty_result'
  | 'unknown'
type StatusDialogueCloudSttRecoveryAction =
  | 'none'
  | 'retry_cloud'
  | 'switch_local'
  | 'check_microphone'
  | 'text_input'

interface StatusDialogueCloudSttHealthState {
  status: 'idle' | 'listening' | 'ok' | 'warn' | 'error' | 'degraded'
  last_session_id?: string
  last_category: StatusDialogueCloudSttFailureCategory
  last_reason?: string
  last_latency_ms?: number
  last_events: string[]
  retry_available: boolean
  retry_count: number
  last_retry_at?: string
  recovery_action: StatusDialogueCloudSttRecoveryAction
  fallback_adapter?: 'local_whisper_persistent_service'
  degraded_reason?: string
  degraded_until_ms?: number
  updated_at: string
}
type StatusDialogueVoiceOutputMode =
  | 'fast'
  | 'cosyvoice_short'
  | 'cosyvoice_full'
  | 'cosyvoice_stream_assembled'
  | 'cosyvoice_stream_live_pcm'
  | 'edge_readaloud_stream'
const DEFAULT_STATUS_DIALOGUE_VOICE_OUTPUT_MODE: StatusDialogueVoiceOutputMode = 'edge_readaloud_stream'
type StatusDialogueTtsStreamResponseFormat = 'wav' | 'mp3' | 'opus' | 'pcm'
type StatusDialogueTtsRuntimeGrade =
  | 'cached'
  | 'excellent'
  | 'interactive'
  | 'borderline'
  | 'slow'
  | 'transport_only'
  | 'unknown'
  | 'error'
type StatusDialogueTtsRuntimeRole =
  | 'primary_cached_sentence_queue'
  | 'live_dialogue_primary_candidate'
  | 'live_dialogue_experimental_only'
  | 'cached_high_quality_or_non_realtime_voice'
  | 'stream_assembled_transport_only'
  | 'not_runtime_streaming_candidate'
  | 'unknown'
type StatusDialogueTtsStreamRequest = StatusDialogueTtsSynthesisRequest & {
  sessionId: string
  adapter_id?: 'cosyvoice_local_http' | 'edge_readaloud_websocket'
  response_format?: StatusDialogueTtsStreamResponseFormat
  responseFormat?: StatusDialogueTtsStreamResponseFormat
  voice?: string
  locale?: string
  skip_cache?: boolean
  skipCache?: boolean
}
type W3WakeDetectorStage =
  | 'off'
  | 'starting'
  | 'listening'
  | 'paused_tts'
  | 'paused_stt'
  | 'wake_window'
  | 'handoff_stt'
  | 'cooldown'
  | 'error'
type StatusDialogueContinuousVoiceSessionStatus =
  | 'off'
  | 'armed'
  | 'listening'
  | 'waiting_dialogue'
  | 'waiting_tts'
  | 'waiting_queue'
  | 'cooldown'
  | 'paused_error'
type CompletionNoticeStatus = 'idle' | 'ready' | 'playing' | 'spoken' | 'fallback' | 'skipped' | 'error'

const STATUS_DIALOGUE_INPUT_QUEUE_LIMIT = 5
const STATUS_DIALOGUE_INPUT_QUEUE_DRAIN_WATCHDOG_MS = 8000
const STATUS_DIALOGUE_STT_RUNTIME_FIX_MARKER = 'stt-local-observability-2026-06-29-v3'
const STATUS_DIALOGUE_TTS_BUDGET_RUNTIME_MARKER = 'tts-spoken-budget-2026-07-01-v2'
const STATUS_DIALOGUE_CLOUD_STT_DEFAULT_TIMEOUT_MS = 7000
const STATUS_DIALOGUE_CLOUD_STT_MIN_TIMEOUT_MS = 3000
const STATUS_DIALOGUE_CLOUD_STT_MAX_TIMEOUT_MS = 12000
const STATUS_DIALOGUE_CLOUD_STT_DEGRADED_STORAGE_KEY = 'zhineng.statusDialogue.cloudStt.degraded.v1'
const STATUS_DIALOGUE_CLOUD_STT_DEGRADED_COOLDOWN_MS = 10 * 60 * 1000
const STATUS_DIALOGUE_LOCAL_STT_MAX_WINDOW_MS = 11000
const STATUS_DIALOGUE_LOCAL_STT_MIN_AUDIO_MS = 350
const STATUS_DIALOGUE_LOCAL_STT_CONTINUOUS_NO_VOICE_FAST_FAIL_MS = 3200
const STATUS_DIALOGUE_LOCAL_STT_RMS_THRESHOLD = 0.003
const STATUS_DIALOGUE_LOCAL_STT_PEAK_THRESHOLD = 0.02
const STATUS_DIALOGUE_LOCAL_STT_MIN_VOICE_MS = 180
const STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_RMS_THRESHOLD = 0.00025
const STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_PEAK_THRESHOLD = 0.0015
const STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_MIN_MS = 240
const STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_MIN_AUDIO_MS = 1200
const STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_TRANSCRIBE_MS = 4200
const STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_RMS_THRESHOLD = 0.00015
const STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_PEAK_THRESHOLD = 0.001
const STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_MIN_AUDIO_MS = 1200
const STATUS_DIALOGUE_LOCAL_STT_SILENCE_TAIL_MS = 900
const STATUS_DIALOGUE_CONTINUOUS_VOICE_RESUME_DELAY_MS = 650
const STATUS_DIALOGUE_CONTINUOUS_VOICE_RECOVERABLE_ERROR_MAX_RETRIES = 3
type StatusDialogueRuntimeProbeMode =
  | 'tts_input_interrupt'
  | 'stt_click_during_tts'
  | 'cloud_stt_fake_audio'
  | 'edge_tts_playback'
  | 'tts_voice_budget'
  | 'remote_stt_mock'
  | 'remote_stt_configured'
  | 'remote_stt_unavailable'
  | 'w3_wake_handoff'
  | 'continuous_voice_loop'
  | 'continuous_voice_fast_fail'
  | 'continuous_voice_two_turn'
  | 'local_stt_low_signal'
  | 'local_stt_borderline'

interface StatusDialogueRuntimeProbeConfig {
  mode?: StatusDialogueRuntimeProbeMode
  cloudSttLanguage: string
  cloudSttMaxAttempts: number
  cloudSttTimeoutMs: number
  cloudSttTestAudio?: string
  remoteSttTestAudio?: string
}

interface StatusDialogueLaunchIntent {
  launchIntent?: 'status_dialogue_voice_entry'
  statusDialogueAction?: 'focus_stt'
  source?: 'dock_voice_button'
}

function readStatusDialogueLaunchIntent(): StatusDialogueLaunchIntent {
  if (typeof window === 'undefined') return {}
  const query = new URLSearchParams(window.location.search)
  const directLaunchIntent = query.get('launchIntent')
  const directAction = query.get('statusDialogueAction')
  const directSource = query.get('source')
  if (directLaunchIntent || directAction || directSource) {
    return {
      launchIntent: directLaunchIntent === 'status_dialogue_voice_entry' ? directLaunchIntent : undefined,
      statusDialogueAction: directAction === 'focus_stt' ? directAction : undefined,
      source: directSource === 'dock_voice_button' ? directSource : undefined
    }
  }
  const rawState = query.get('state')
  if (!rawState) return {}
  try {
    const parsed = JSON.parse(rawState) as {
      launchIntent?: unknown
      statusDialogueAction?: unknown
      source?: unknown
    }
    return {
      launchIntent: parsed.launchIntent === 'status_dialogue_voice_entry' ? parsed.launchIntent : undefined,
      statusDialogueAction: parsed.statusDialogueAction === 'focus_stt' ? parsed.statusDialogueAction : undefined,
      source: parsed.source === 'dock_voice_button' ? parsed.source : undefined
    }
  } catch {
    return {}
  }
}

function readStatusDialogueRuntimeProbeConfig(): StatusDialogueRuntimeProbeConfig {
  const fallback: StatusDialogueRuntimeProbeConfig = {
    cloudSttLanguage: 'zh-CN',
    cloudSttMaxAttempts: 1,
    cloudSttTimeoutMs: STATUS_DIALOGUE_CLOUD_STT_DEFAULT_TIMEOUT_MS
  }
  if (typeof window === 'undefined') return fallback
  const rawState = new URLSearchParams(window.location.search).get('state')
  if (!rawState) return fallback
  try {
    const parsed = JSON.parse(rawState) as {
      status_dialogue_runtime_probe?: unknown
      status_dialogue_cloud_stt_language?: unknown
      status_dialogue_cloud_stt_max_attempts?: unknown
      status_dialogue_cloud_stt_timeout_ms?: unknown
      status_dialogue_cloud_stt_test_audio?: unknown
      status_dialogue_remote_stt_test_audio?: unknown
    }
    const mode =
      parsed.status_dialogue_runtime_probe === 'tts_input_interrupt' ||
      parsed.status_dialogue_runtime_probe === 'stt_click_during_tts' ||
      parsed.status_dialogue_runtime_probe === 'cloud_stt_fake_audio' ||
      parsed.status_dialogue_runtime_probe === 'edge_tts_playback' ||
      parsed.status_dialogue_runtime_probe === 'tts_voice_budget' ||
      parsed.status_dialogue_runtime_probe === 'remote_stt_mock' ||
      parsed.status_dialogue_runtime_probe === 'remote_stt_configured' ||
      parsed.status_dialogue_runtime_probe === 'remote_stt_unavailable' ||
      parsed.status_dialogue_runtime_probe === 'w3_wake_handoff' ||
      parsed.status_dialogue_runtime_probe === 'continuous_voice_loop' ||
      parsed.status_dialogue_runtime_probe === 'continuous_voice_fast_fail' ||
      parsed.status_dialogue_runtime_probe === 'continuous_voice_two_turn' ||
      parsed.status_dialogue_runtime_probe === 'local_stt_low_signal' ||
      parsed.status_dialogue_runtime_probe === 'local_stt_borderline'
        ? parsed.status_dialogue_runtime_probe
        : undefined
    const parsedAttempts = Number(parsed.status_dialogue_cloud_stt_max_attempts)
    const parsedTimeoutMs = Number(parsed.status_dialogue_cloud_stt_timeout_ms)
    return {
      mode,
      cloudSttLanguage:
        typeof parsed.status_dialogue_cloud_stt_language === 'string' && parsed.status_dialogue_cloud_stt_language.trim()
          ? parsed.status_dialogue_cloud_stt_language.trim()
          : fallback.cloudSttLanguage,
      cloudSttMaxAttempts: Number.isFinite(parsedAttempts)
        ? Math.max(1, Math.min(3, Math.round(parsedAttempts)))
        : fallback.cloudSttMaxAttempts,
      cloudSttTimeoutMs: Number.isFinite(parsedTimeoutMs)
        ? Math.max(
            STATUS_DIALOGUE_CLOUD_STT_MIN_TIMEOUT_MS,
            Math.min(STATUS_DIALOGUE_CLOUD_STT_MAX_TIMEOUT_MS, Math.round(parsedTimeoutMs))
          )
        : fallback.cloudSttTimeoutMs,
      cloudSttTestAudio:
        typeof parsed.status_dialogue_cloud_stt_test_audio === 'string' && parsed.status_dialogue_cloud_stt_test_audio.trim()
          ? parsed.status_dialogue_cloud_stt_test_audio.trim()
          : undefined,
      remoteSttTestAudio:
        typeof parsed.status_dialogue_remote_stt_test_audio === 'string' && parsed.status_dialogue_remote_stt_test_audio.trim()
          ? parsed.status_dialogue_remote_stt_test_audio.trim()
          : undefined
    }
  } catch {
    return fallback
  }
}
type StatusDialogueVoiceLatencyStage =
  | 'idle'
  | 'ack'
  | 'stt_recording'
  | 'stt_transcribing'
  | 'model'
  | 'tts_generating'
  | 'playing'
  | 'complete'
  | 'error'

type StatusDialogueExecutionPhase =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'understanding'
  | 'patrolling'
  | 'generating'
  | 'speaking'
  | 'complete'
  | 'error'

interface StatusDialogueExecutionState {
  schema: 'status_dialogue_execution_state.v1'
  phase: StatusDialogueExecutionPhase
  label: string
  action: string
  active: boolean
  step_index: number
  updated_at: string
  source_output_id?: string
}

interface StatusDialogueVoiceLatencyState {
  stage: StatusDialogueVoiceLatencyStage
  sttModel: StatusDialogueSttModel
  voiceMode: StatusDialogueVoiceOutputMode
  ackMs?: number
  sttMs?: number
  modelMs?: number
  ttsMs?: number
  ttsFirstMs?: number
  ttsTotalMs?: number
  playbackMs?: number
  playbackFirstMs?: number
  playbackTotalMs?: number
  totalMs?: number
  chunkCount?: number
  cacheHits?: number
  failedChunks?: number
  updatedAt: string
}

interface StatusDialogueTtsRuntimePolicyState {
  schema: 'status_dialogue_tts_runtime_policy.v1'
  adapter_id: 'cosyvoice_local_http' | 'edge_readaloud_websocket'
  mode: StatusDialogueVoiceOutputMode
  response_format: StatusDialogueTtsStreamResponseFormat | 'cached'
  grade: StatusDialogueTtsRuntimeGrade
  role: StatusDialogueTtsRuntimeRole
  interactive_ready: boolean
  first_audio_payload_ms?: number
  total_stream_ms?: number
  frame_count?: number
  reason: string
  source: string
  updated_at: string
}

interface CompletionNoticeState {
  status: CompletionNoticeStatus
  text: string
  repeat_count: number
  completed_count: number
  updated_at: string
  last_trace?: VoiceOutputTrace
  error?: string
}

interface StatusDialogueContinuousVoiceSessionState {
  schema: 'status_dialogue_continuous_voice_session.v1'
  enabled: boolean
  status: StatusDialogueContinuousVoiceSessionStatus
  resume_delay_ms: number
  resumed_count: number
  last_reason?: string
  next_resume_at?: string
  updated_at: string
  boundary: string
}

interface LastVoicePlayback {
  audio_data_url: string
  plan: VoiceResponsePlan
  voice_profile: VoiceProfile
  source_output_id: string
  updated_at: string
}

interface CachedVoiceAudio {
  audio_data_url: string
  audio_mime_type?: string
  latency_ms?: number
  generated_at: string
}

interface QueuedVoicePlaybackResult {
  trace: VoiceOutputTrace
  chunks: VoiceOutputChunk[]
  cached_count: number
  failed_count: number
  total_tts_ms: number
  total_playback_ms: number
}

interface StatusDialogueModelStreamEvent {
  schema?: 'status_dialogue_model_stream_event.v1'
  sessionId?: string
  session_id?: string
  type?: 'start' | 'delta' | 'done' | 'error'
  delta?: string
  text?: string
  deltaCount?: number
  accumulatedLength?: number
  model?: string
  providerLabel?: string
  latencyMs?: number
  error?: string
  reason?: string
}

interface StatusDialogueTtsStreamEvent {
  schema?: 'status_dialogue_tts_stream_event.v1'
  sessionId?: string
  session_id?: string
  type?: 'start' | 'frame' | 'done' | 'error'
  frame?: StreamingTtsAudioFrame
  cache_hit?: boolean
  frame_count?: number
  final_frame_count?: number
  first_frame_ms?: number
  total_stream_ms?: number
  cache_key?: string
  error?: string
  reason?: string
}

interface StatusDialogueModelInvokeResult {
  success?: boolean
  text?: string
  providerLabel?: string
  model?: string
  latencyMs?: number
  error?: string
  reason?: string
  streamed?: boolean
  deltaCount?: number
  sessionId?: string
}

interface StatusDialogueSttTranscriptionResult {
  schema: 'status_dialogue_stt_transcription.v1'
  generated_at: string
  success: boolean
  adapter_id: 'local_whisper_ipc' | 'local_whisper_persistent_service' | 'openai_compatible_stt'
  provider: 'openai_whisper_local' | 'openai_compatible_remote'
  transcript?: string
  language?: string
  model?: string
  latency_ms?: number
  error?: string
  fallback_reason?: string
  events?: string[]
}

interface StatusDialogueLocalSttHealthResult {
  schema: 'status_dialogue_local_stt_health.v1'
  generated_at: string
  adapter_id: 'local_whisper_persistent_service'
  configured: boolean
  reachable: boolean
  status: 'ready' | 'fallback' | 'error'
  base_url_host: string
  model: string
  loaded_models?: string[]
  default_model?: string
  device?: string
  uptime_ms?: number
  latency_ms?: number
  service_started?: boolean
  error?: string
}

interface StatusDialogueRemoteSttHealthResult {
  schema: 'status_dialogue_remote_stt_health.v1'
  generated_at: string
  adapter_id: 'openai_compatible_stt'
  configured: boolean
  reachable: boolean
  status: 'ready' | 'fallback' | 'error'
  base_url_host: string
  endpoint_path: string
  model: string
  timeout_ms: number
  latency_ms?: number
  error?: string
}

interface StatusDialogueChromeSttResult {
  schema: 'status_dialogue_chrome_stt_result.v1'
  generated_at: string
  success: boolean
  adapter_id: 'chrome_stt_bridge'
  provider: 'chrome_web_speech'
  session_id: string
  transcript?: string
  language?: string
  latency_ms?: number
  error?: string
  fallback_reason?: string
  events?: string[]
}

interface StatusDialogueChromeSttProgressEvent {
  schema: 'status_dialogue_chrome_stt_progress.v1'
  generated_at: string
  session_id: string
  type: 'ready' | 'start' | 'audio_start' | 'interim' | 'result' | 'error' | 'end' | 'complete' | string
  transcript?: string
  error?: string
  message?: string
  fallback_reason?: string
  latency_ms?: number
  events?: string[]
}

type RuntimeStatus = 'idle' | 'running'
type RuntimeMode = 'zhineng_bridge' | 'auto_reply'
type GoalKind = 'business_followup' | 'relationship_development' | 'repair' | 'general'
type RelationshipClass =
  | 'unset'
  | 'business_client'
  | 'colleague'
  | 'friend'
  | 'romantic_interest'
  | 'family'
  | 'unknown'
type ReplyMode = 'first_person_as_user' | 'third_person_explanation'

const DOCK_PERSON_PARTICLE_COUNT = 54
const DOCK_EVENT_PARTICLE_COUNT = 28
const DOCK_FLOW_PARTICLE_COUNT = 32
const DOCK_WORKFLOW_NODE_COUNT = 6
const DOCK_ELECTRIC_POINT_COUNT = 18
const DOCK_NODE_HALO_PARTICLE_COUNT = 16
const DOCK_RENDER_SIZE = 64
const DOCK_NODE_COLORS = [0x22d3ee, 0xa7f3d0, 0xfbbf24, 0x38bdf8, 0xc084fc, 0xfb7185]
const EXPANDED_NODE_CLUSTER_SCALE = 1.34
const EXPANDED_FLOW_PARTICLE_COUNT = 42
const EXPANDED_GRAPH_MIN_CAMERA_DISTANCE = 2.7
const EXPANDED_GRAPH_MAX_CAMERA_DISTANCE = 9.4

const DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE =
  '请从桌面应用窗口启动；浏览器预览不具备桌面桥接能力'

interface AnalysisStep {
  step: string
  output: string
  reason: string
}

interface GradientReasoningRow {
  label: string
  value: string
  detail: string
}

interface ThirdPartyPromptCard {
  targetReply: string
  prompt: string
  expertHint: string
  stage: string
  intensity: string
  transition: string
}

interface RuntimeDecisionRow {
  label: string
  value: string
  detail: string
}

interface RuntimeDisplaySection {
  section_id?: string
  title?: string
  level?: string
  lines?: string[]
}

interface OperatorObjectiveTrack {
  track_id?: string
  status?: string
  passed?: boolean
  next_action?: string | null
}

interface OperatorCompletionGate {
  schema_version?: string
  ready_to_mark_goal_complete?: boolean
  missing_track_ids?: string[]
  missing_target_file_ids?: string[]
  blocking_diagnostics?: {
    schema_version?: string
    top_failure_ids?: string[]
    diagnostics?: Array<{
      scope?: string
      gate_decision?: string | null
      failure_ids?: string[]
    }>
  }
  next_action?: string
}

interface OperatorNextStepState {
  schema_version?: string
  next_step_id?: string
  gate_decision?: string
  current_action?: {
    action_id?: string
    status?: string
    open_path?: string | null
    target_path?: string | null
  } | null
  objective_progress?: {
    schema_version?: string
    overall_status?: string
    tracks?: OperatorObjectiveTrack[]
    completion_gate?: OperatorCompletionGate
  }
  queue?: {
    next_blocking_action_id?: string | null
  }
}

interface RuntimeDecisionState {
  schema_version?: string
  state_id?: string
  created_at?: string
  gate_decision?: string
  real_execution_allowed?: boolean
  source_decision?: {
    target_display_name?: string | null
    recommended_option_id?: string | null
  }
  relationship_gradient_review?: {
    current_stage?: string
    stage_id?: string
    stage_label?: string | null
    progression_intensity?: string | null
    transition_decision?: string | null
    online_offline_progression_track?: {
      online_track?: {
        stage?: string | null
      }
      offline_track?: {
        stage?: string | null
      }
    }
    date_transition_readiness?: {
      status?: string | null
      readiness_score?: number | null
    }
    romantic_progression_cadence?: {
      current_turn_intent?: string | null
      cadence_decision?: string | null
    }
    dialogue_act?: string | null
    dock_status_text?: string | null
    selected_template_id?: string | null
    draft?: string | null
    reasoning_rows?: RuntimeDecisionRow[]
    user_visible_reasoning_log?: {
      visible_to_target?: boolean
      steps?: Array<Record<string, unknown>>
    }
    third_party_prompts?: Array<{
      utterance_id?: string
      target_reply?: string
      prompt?: string | null
      stage?: string | null
      intensity?: string | null
      transition?: string | null
      risk_level?: string | null
      not_sent_to_target?: boolean
      expert_reviews?: Array<{ expert_id?: string; recommendation?: string; user_prompt_hint?: string }>
    }>
  }
  chain_flow?: Array<{
    step_id?: string
    label?: string
    status?: string
    evidence?: string
  }>
  branch_records?: Array<{
    branch_id?: string
    decision?: string
    reason?: string
  }>
  parallel_expert_run_log?: {
    schema_version?: string
    executor?: string
    completed_lane_count?: number
    lane_count?: number
    lanes?: Array<{
      lane_id?: string
      expert_id?: string
      status?: string
      context_pack_ref?: string | null
    }>
  } | null
  structured_cot_trace?: {
    schema_version?: string
    trace_id?: string
    visibility_policy?: {
      log_type?: string
      raw_hidden_chain_of_thought_logged?: boolean
      target_visible?: boolean
    }
    dialogue_generation_logic?: {
      generator?: string
      selected_option_id?: string | null
      selected_template_id?: string | null
      dialogue_act?: string | null
      draft_ref?: string | null
    }
    prompt_generation_logic?: {
      generator?: string
      active_input_blocked_by_default?: boolean
      prompt_count?: number
      target_visible?: boolean
    }
    weight_logic?: {
      changed?: boolean
      preliminary_recommended_option_id?: string | null
      final_recommended_option_id?: string | null
    }
    generation_path?: Array<{
      step_id?: string
      status?: string
      output_ref?: string
      reason_summary?: string
    }>
  } | null
  frontend_display_contract?: {
    schema_version?: string
    surfaces?: {
      dock?: {
        mode?: string
        text?: string
        legacy_text?: string
        status_parts?: {
          relationship_stage?: string | null
          online_stage?: string | null
          offline_stage?: string | null
          current_turn_intent?: string | null
          gate_status?: string | null
        }
        max_chars?: number
        detail_hidden?: boolean
      }
      console?: {
        mode?: string
        sections?: RuntimeDisplaySection[]
      }
      send_window?: {
        mode?: string
        draft_transfer_allowed?: boolean
        target_visible_analysis?: boolean
      }
    }
  } | null
  send_gate_transfer_path?: {
    schema_version?: string
    current_mode?: string
    real_execution_allowed?: boolean
    real_send_attempted?: boolean
    required_gates?: string[]
  } | null
  operator_next_step?: OperatorNextStepState | null
  operator_next_step_status?: string | null
}

interface GradientReviewModel {
  sourceLabel: string
  stateId?: string
  runtimeDraft?: string
  dialogueAct: string
  currentStage: string
  progressionIntensity: string
  transitionDecision: string
  reasoningRows: GradientReasoningRow[]
  thirdPartyPrompts: ThirdPartyPromptCard[]
  chainFlow: GradientReasoningRow[]
  branchRecords: GradientReasoningRow[]
  detailLogSections: RuntimeDisplaySection[]
  expertRunRows: GradientReasoningRow[]
  sendGateRows: GradientReasoningRow[]
  operatorGateSummary: string
  operatorGateRows: GradientReasoningRow[]
  dockBrief: string
}

interface StorageRow {
  label: string
  path: string
  role: string
  longTermUse: string
  risk: string
}

interface FollowUpPreset {
  goalKind: GoalKind
  label: string
  priority: string
  cadence: string
  nextAction: string
  tone: string
  safetyGate: string
}

interface DockAttachmentState {
  attached: boolean
  appType?: string
  targetTitle?: string
  reason?: string
  updatedAt?: string
  position?: {
    x: number
    y: number
    width: number
    height: number
  }
}

interface DockPanelState {
  expanded: boolean
  panel?: string
  reason?: string
  updatedAt?: string
}

const analysisSteps: AnalysisStep[] = [
  {
    step: '输入读取',
    output: '只读采集 Observation 或 PilotImportBatch',
    reason: '先把桌面、网页或手工记录统一成 RawEvent 候选，发送能力不参与读取。'
  },
  {
    step: '意图识别',
    output: '当前请求、目标对象、会话主题、历史增量摘要',
    reason: '最新内容优先，同时保留总历史记录和未读增量，不逐句重析旧历史。'
  },
  {
    step: '关系与事件图谱',
    output: '人物、关系、事件、时间线、反馈候选',
    reason: '关系图谱负责对象和关系，事件图谱负责事实线索，默认不把候选写成事实。'
  },
  {
    step: '专家分析',
    output: '心理、博弈、逻辑、边界、证据质量等权重理由',
    reason: '权重只作为解释和排序依据，操作者可检查每个专家的证据链。'
  },
  {
    step: '草稿生成',
    output: '第一人称代发草稿或第三人称讲解方案',
    reason: '根据目标和用户选择切换表达视角，草稿必须可编辑且默认需要确认。'
  },
  {
    step: '安全后置审查',
    output: '理论预测、边界审查、存储最小化、发送确认',
    reason: '先展示性能最优候选，再独立审查是否允许进入受控发送。'
  }
]

const storageRows: StorageRow[] = [
  {
    label: '真实输入包',
    path: 'runtime/user-inputs/pilot-import.real.json',
    role: '当前外部记录入口',
    longTermUse: '适合作为导入样本范式，进入长期存储前仍需 readiness 校验。',
    risk: '包含原始对话，需保留在本地受控目录。'
  },
  {
    label: '人物与关系',
    path: 'data/people/*.json',
    role: '长期人物、关系和身份索引',
    longTermUse: '适合长期有序读取，person_id/relationship_id 可重建索引。',
    risk: '身份信息应最小化，敏感别名和联系方式优先 hash 或脱敏。'
  },
  {
    label: '事件图谱',
    path: 'data/events/*.jsonl',
    role: 'RawEvent 与 SemanticEvent 追加日志',
    longTermUse: 'JSONL 追加、稳定 id 去重，便于增量写入和审计。',
    risk: '敏感原文可转摘要保存，保留证据路径而非复制截图。'
  },
  {
    label: '反馈与回写',
    path: 'data/feedback/feedback-records.jsonl',
    role: '执行结果、回复状态、关系变化',
    longTermUse: '适合后续权重校准和目标进度回放。',
    risk: '反馈必须标注来源和时间，避免单次反馈永久固化。'
  },
  {
    label: '运行审计',
    path: 'runtime/** 和 data/audit/*.jsonl',
    role: '门禁、报告、试跑状态和审计证据',
    longTermUse: '适合作为可复核证据，不应替代业务存储。',
    risk: '运行产物可清理归档，但关键审计哈希和报告需保留。'
  }
]

const relationshipOptions: Array<{ value: RelationshipClass; label: string }> = [
  { value: 'unset', label: '未预设' },
  { value: 'business_client', label: '商务客户' },
  { value: 'colleague', label: '同事/协作方' },
  { value: 'friend', label: '朋友' },
  { value: 'romantic_interest', label: '恋爱目标' },
  { value: 'family', label: '家人' },
  { value: 'unknown', label: '未知/待确认' }
]

const goalOptions: Array<{ value: GoalKind; label: string }> = [
  { value: 'business_followup', label: '商务跟进' },
  { value: 'relationship_development', label: '关系推进' },
  { value: 'repair', label: '修复关系' },
  { value: 'general', label: '一般沟通' }
]

const FOLLOW_UP_PRESETS: Record<RelationshipClass, FollowUpPreset> = {
  unset: {
    goalKind: 'general',
    label: '候选识别',
    priority: '人工确认优先',
    cadence: '暂不自动推进',
    nextAction: '先补足身份线索、关系证据和当前会话目标。',
    tone: '中性、低承诺',
    safetyGate: '不能把候选关系写成已确认关系。'
  },
  business_client: {
    goalKind: 'business_followup',
    label: '客户跟进',
    priority: '高优先',
    cadence: '按承诺节点和客户反馈窗口跟进',
    nextAction: '确认需求、预算/时点、下一步会议或材料交付。',
    tone: '专业、具体、少打扰',
    safetyGate: '只生成可确认草稿，不越过商务边界和真实发送门禁。'
  },
  colleague: {
    goalKind: 'general',
    label: '协作推进',
    priority: '中优先',
    cadence: '按任务依赖和截止时间跟进',
    nextAction: '明确分工、待办、风险和需要对方确认的最小事项。',
    tone: '清晰、合作、保留余地',
    safetyGate: '避免替对方承诺，保留协作上下文。'
  },
  friend: {
    goalKind: 'relationship_development',
    label: '关系维护',
    priority: '柔性优先',
    cadence: '按互动温度和共同话题轻量跟进',
    nextAction: '承接对方情绪或兴趣点，给出自然的小范围回应。',
    tone: '自然、轻松、不过度推进',
    safetyGate: '不把玩笑或模糊表达直接升级为亲密关系事实。'
  },
  romantic_interest: {
    goalKind: 'relationship_development',
    label: '亲密关系推进',
    priority: '边界优先',
    cadence: '按对方回应强度和自愿性信号跟进',
    nextAction: '先承接情绪，再用低压力表达推进一个小话题。',
    tone: '真诚、尊重、低压',
    safetyGate: '理论预测与发送审查分离，必须检查自愿性、压力和误读风险。'
  },
  family: {
    goalKind: 'general',
    label: '家庭沟通',
    priority: '稳定优先',
    cadence: '按现实事项和情绪修复需要跟进',
    nextAction: '先降低冲突，再确认事实、关心点和可执行安排。',
    tone: '稳、具体、有照应',
    safetyGate: '避免用策略性表达替代真实关心或制造压力。'
  },
  unknown: {
    goalKind: 'general',
    label: '待确认对象',
    priority: '证据优先',
    cadence: '等待更多上下文后再推进',
    nextAction: '只做摘要和候选判断，提示操作者确认人物分类。',
    tone: '克制、询问式',
    safetyGate: '未知身份不进入高风险自动跟进。'
  }
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.2v13.6L18.5 12 8 5.2z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.6 2.9 8.7 7 10 4.1-1.3 7-5.4 7-10V6l-7-3z" />
      <path d="m9.5 12 1.8 1.8 3.7-4" />
    </svg>
  )
}

function GearLineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-1.9.1 7.9 7.9 0 0 1-1.7.7 1.7 1.7 0 0 0-1.2 1.5v.2H8.9v-.2A1.7 1.7 0 0 0 7.7 21a8 8 0 0 1-1.6-.7 1.7 1.7 0 0 0-1.9-.1l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 2.4 15a8.1 8.1 0 0 1 0-2 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 1.9-.1 8 8 0 0 1 1.6-.7A1.7 1.7 0 0 0 8.9 5.4v-.2h3.9v.2A1.7 1.7 0 0 0 14 6.9a7.9 7.9 0 0 1 1.7.7 1.7 1.7 0 0 0 1.9.1l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.9 8.1 8.1 0 0 1 0 2z" />
    </svg>
  )
}

function HumanConfigIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4.5a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z" />
      <path d="M5.8 19.5a6.2 6.2 0 0 1 12.4 0" />
      <path d="M18.6 5.8h1.7" />
      <path d="M19.5 4.9v1.8" />
      <path d="M3.7 13.7h1.8" />
      <path d="M4.6 12.8v1.8" />
      <path d="M17.7 15.5l1.2 1.2" />
      <path d="m18.9 15.5-1.2 1.2" />
    </svg>
  )
}

function classifyDefaultRelationship(value: RelationshipClass): string {
  if (value !== 'unset') return '使用操作者在界面中指定的人物分类，并同步触发目标跟进策略。'
  return '未预设时只从关系证据、目标场景和上下文标签推断候选，证据不足时进入人工确认。'
}

function getGoalLabel(value: GoalKind): string {
  return goalOptions.find((item) => item.value === value)?.label ?? value
}

function getRelationshipLabel(value: RelationshipClass): string {
  return relationshipOptions.find((item) => item.value === value)?.label ?? value
}

function inferRelationshipFromDockState(state: DockAttachmentState): RelationshipClass {
  if (!state.attached) return 'unknown'
  const text = `${state.targetTitle || ''} ${state.appType || ''}`.toLowerCase()
  if (/客户|商务|合作|项目|报价|合同|client|customer|sales|deal/.test(text)) return 'business_client'
  if (/企业微信|同事|协作|任务|会议|wework|work/.test(text)) return 'colleague'
  if (/家|爸|妈|亲|family/.test(text)) return 'family'
  if (/朋友|好友|friend/.test(text)) return 'friend'
  return 'unknown'
}

function hashDockSignature(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededUnit(seed: number): () => number {
  let state = seed || 1
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state)
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state)
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296
  }
}

function writeSpherePoint(
  out: Float32Array,
  index: number,
  count: number,
  radius: number,
  random: () => number
): void {
  const offset = 2 / count
  const increment = Math.PI * (3 - Math.sqrt(5))
  const y = index * offset - 1 + offset / 2
  const r = Math.sqrt(1 - y * y)
  const phi = index * increment + random() * 0.42
  const jitter = 0.94 + random() * 0.12
  const base = index * 3
  out[base] = Math.cos(phi) * r * radius * jitter
  out[base + 1] = y * radius * jitter
  out[base + 2] = Math.sin(phi) * r * radius * jitter
}

interface ParticleShell {
  geometry: THREE.BufferGeometry
  positions: Float32Array
  basePositions: Float32Array
}

function makeParticleShell(count: number, radius: number, random: () => number): ParticleShell {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  for (let index = 0; index < count; index += 1) {
    writeSpherePoint(positions, index, count, radius, random)
  }
  const basePositions = positions.slice()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return { geometry, positions, basePositions }
}

function setParticleShellColors(
  geometry: THREE.BufferGeometry,
  count: number,
  palette: number[],
  random: () => number
): void {
  const colors = new Float32Array(count * 3)
  const color = new THREE.Color()
  for (let index = 0; index < count; index += 1) {
    const selected = palette[Math.floor(random() * palette.length)] ?? palette[0] ?? 0x22d3ee
    const glow = 0.9 + random() * 0.1
    color.setHex(selected)
    const base = index * 3
    colors[base] = color.r * glow
    colors[base + 1] = color.g * glow
    colors[base + 2] = color.b * glow
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

function makeWorkflowNodePositions(seedPhase: number): THREE.Vector3[] {
  return Array.from({ length: DOCK_WORKFLOW_NODE_COUNT }, (_, index) => {
    const y = index % 2 === 0 ? 0.52 - index * 0.14 : -0.42 + index * 0.1
    const radius = Math.sqrt(Math.max(0.1, 1 - y * y)) * 1.32
    const angle = seedPhase + index * 2.399963229728653
    return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
  })
}

function setShellMotion(shell: ParticleShell, elapsed: number, seedPhase: number, amplitude: number): void {
  const { positions, basePositions, geometry } = shell
  for (let index = 0; index < positions.length; index += 3) {
    const wave = 1 + Math.sin(elapsed * 0.92 + seedPhase + index * 0.17) * amplitude
    positions[index] = basePositions[index] * wave
    positions[index + 1] = basePositions[index + 1] * wave
    positions[index + 2] = basePositions[index + 2] * wave
  }
  ;(geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
}

interface ParticleDockOrbProps {
  attached: boolean
  panelExpanded: boolean
  targetTitle?: string
  runtimeStatus: RuntimeStatus
  relationshipClass: RelationshipClass
  goalKind: GoalKind
  renderSize?: number
  className?: string
}

function ParticleDockOrb({
  attached,
  panelExpanded,
  targetTitle,
  runtimeStatus,
  relationshipClass,
  goalKind,
  renderSize = DOCK_RENDER_SIZE,
  className = ''
}: ParticleDockOrbProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const signature = useMemo(
    () =>
      `${attached ? 'attached' : 'floating'}|${panelExpanded ? 'expanded' : 'collapsed'}|${runtimeStatus}|${relationshipClass}|${goalKind}|${targetTitle || ''}`,
    [attached, goalKind, panelExpanded, relationshipClass, runtimeStatus, targetTitle]
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    let disposed = false
    let renderer: THREE.WebGLRenderer | null = null

    try {
      const seed = hashDockSignature(signature)
      const random = seededUnit(seed)
      const seedPhase = (seed % 360) * (Math.PI / 180)
      const isExpandedRender = renderSize > DOCK_RENDER_SIZE
      const personParticleCount = isExpandedRender ? DOCK_PERSON_PARTICLE_COUNT * 2 : DOCK_PERSON_PARTICLE_COUNT
      const eventParticleCount = isExpandedRender ? DOCK_EVENT_PARTICLE_COUNT * 3 : DOCK_EVENT_PARTICLE_COUNT
      const flowParticleCount = isExpandedRender ? DOCK_FLOW_PARTICLE_COUNT * 2 : DOCK_FLOW_PARTICLE_COUNT
      const haloParticleCount = isExpandedRender ? DOCK_NODE_HALO_PARTICLE_COUNT * 2 : DOCK_NODE_HALO_PARTICLE_COUNT
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
        powerPreference: 'low-power'
      })
      renderer.setClearColor(0x000000, 0)
      renderer.setClearAlpha(0)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, renderSize > DOCK_RENDER_SIZE ? 1.8 : 1.5))
      renderer.setSize(renderSize, renderSize, false)
      renderer.domElement.className = 'zg-particle-canvas'
      renderer.domElement.style.background = 'transparent'
      renderer.domElement.style.width = `${renderSize}px`
      renderer.domElement.style.height = `${renderSize}px`
      host.replaceChildren(renderer.domElement)

      const scene = new THREE.Scene()
      scene.background = null
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 12)
      camera.position.z = renderSize > DOCK_RENDER_SIZE ? 4.22 : 4.82

      const group = new THREE.Group()
      group.rotation.x = -0.24 + random() * 0.18
      scene.add(group)

      const personShell = makeParticleShell(personParticleCount, 1.02, random)
      const eventShell = makeParticleShell(eventParticleCount, 1.68, random)
      setParticleShellColors(personShell.geometry, personParticleCount, [0x0891b2, 0x0ea5e9, 0x059669, 0x7c3aed], random)
      setParticleShellColors(
        eventShell.geometry,
        eventParticleCount,
        attached ? [0x0ea5e9, 0x10b981, 0xa855f7] : [0x0284c7, 0x059669, 0x7c3aed],
        random
      )
      const flowGeometry = new THREE.BufferGeometry()
      const flowPositions = new Float32Array(flowParticleCount * 3)
      flowGeometry.setAttribute('position', new THREE.BufferAttribute(flowPositions, 3))
      const electricGeometry = new THREE.BufferGeometry()
      const electricPositions = new Float32Array(DOCK_ELECTRIC_POINT_COUNT * 3)
      electricGeometry.setAttribute('position', new THREE.BufferAttribute(electricPositions, 3))
      const activeHaloGeometry = new THREE.BufferGeometry()
      const activeHaloPositions = new Float32Array(haloParticleCount * 3)
      activeHaloGeometry.setAttribute('position', new THREE.BufferAttribute(activeHaloPositions, 3))

      const personMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: isExpandedRender ? 0.105 : 0.082,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.96,
        depthWrite: false
      })
      const eventMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: isExpandedRender ? 0.05 : 0.034,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: attached ? 0.74 : 0.66,
        depthWrite: false
      })
      const flowMaterial = new THREE.PointsMaterial({
        color: runtimeStatus === 'running' ? 0xfbbf24 : 0x38bdf8,
        size: runtimeStatus === 'running' ? (isExpandedRender ? 0.14 : 0.105) : (isExpandedRender ? 0.1 : 0.078),
        sizeAttenuation: true,
        transparent: true,
        opacity: runtimeStatus === 'running' ? 0.95 : 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
      const electricMaterial = new THREE.LineBasicMaterial({
        color: runtimeStatus === 'running' ? 0xfbbf24 : 0x38bdf8,
        transparent: true,
        opacity: runtimeStatus === 'running' ? 0.78 : 0.38,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
      const activeHaloMaterial = new THREE.PointsMaterial({
        color: runtimeStatus === 'running' ? 0xfbbf24 : 0x38bdf8,
        size: runtimeStatus === 'running' ? (isExpandedRender ? 0.102 : 0.075) : (isExpandedRender ? 0.074 : 0.055),
        sizeAttenuation: true,
        transparent: true,
        opacity: runtimeStatus === 'running' ? 0.92 : 0.58,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })

      const nodePositions = makeWorkflowNodePositions(seedPhase)
      const nodePoints = nodePositions.map((position, index) => {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([position.x, position.y, position.z]), 3))
        const material = new THREE.PointsMaterial({
          color: DOCK_NODE_COLORS[index] ?? 0x22d3ee,
          size: 0.096,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
        const points = new THREE.Points(geometry, material)
        group.add(points)
        return points
      })

      group.add(new THREE.Points(personShell.geometry, personMaterial))
      group.add(new THREE.Points(eventShell.geometry, eventMaterial))
      group.add(new THREE.Line(electricGeometry, electricMaterial))
      group.add(new THREE.Points(flowGeometry, flowMaterial))
      group.add(new THREE.Points(activeHaloGeometry, activeHaloMaterial))

      const clock = new THREE.Clock()
      const speed = runtimeStatus === 'running' ? 1.16 : 0.62
      const expansionFlowBoost = panelExpanded ? 1.48 : 1
      const nodeOffset = seed % DOCK_WORKFLOW_NODE_COUNT
      const flowVector = new THREE.Vector3()
      const haloVector = new THREE.Vector3()

      const render = (): void => {
        if (disposed) return
        const elapsed = clock.getElapsedTime()
        const cycleDuration = runtimeStatus === 'running' ? 0.82 : 2.1
        const activeNode = (Math.floor(elapsed / cycleDuration) + nodeOffset) % DOCK_WORKFLOW_NODE_COUNT
        const nextNode = (activeNode + 1) % DOCK_WORKFLOW_NODE_COUNT
        const nodeProgress = (elapsed / cycleDuration) % 1

        const breathingScale = 1.04 + Math.sin(elapsed * 1.7 + seedPhase) * 0.035
        group.position.y = Math.sin(elapsed * 1.38 + seedPhase) * 0.13
        group.position.x = Math.cos(elapsed * 0.83 + seedPhase) * 0.035
        group.scale.setScalar(breathingScale)
        group.rotation.x = -0.22 + Math.sin(elapsed * 0.72 + seedPhase) * 0.18
        group.rotation.y = seedPhase + elapsed * speed * expansionFlowBoost
        group.rotation.z = Math.sin(elapsed * 0.84 + seedPhase) * 0.22

        setShellMotion(personShell, elapsed, seedPhase, runtimeStatus === 'running' ? 0.052 : 0.032)
        setShellMotion(eventShell, elapsed * 0.94, seedPhase + 1.7, runtimeStatus === 'running' ? 0.044 : 0.028)

        nodePoints.forEach((points, index) => {
          const material = points.material as THREE.PointsMaterial
          const isActive = index === activeNode
          const isConnected = index === nextNode && nodeProgress > 0.68
          const pulse = isActive ? 1 + Math.sin(elapsed * 8.6) * 0.22 : 1
          material.size = isActive
            ? (runtimeStatus === 'running' ? 0.245 : 0.18) * pulse
            : isConnected
              ? 0.155 + Math.sin(elapsed * 8.5) * 0.018
              : 0.07
          material.opacity = isActive || isConnected ? 1 : 0.48 + Math.sin(elapsed * 1.4 + index) * 0.08
          points.scale.setScalar(
            isActive
              ? 1.36 + (1 - Math.abs(nodeProgress - 0.5) * 2) * 0.26
              : isConnected
                ? 1.18
                : 1
          )
        })

        const haloAttribute = activeHaloGeometry.getAttribute('position') as THREE.BufferAttribute
        const haloRadius = runtimeStatus === 'running' ? 0.25 : 0.18
        const activePosition = nodePositions[activeNode]
        for (let index = 0; index < haloParticleCount; index += 1) {
          const angle = seedPhase + elapsed * (runtimeStatus === 'running' ? 5.6 : 2.7) + index * 2.399963229728653
          const orbit = haloRadius * (0.78 + Math.sin(elapsed * 4.2 + index) * 0.2)
          haloVector.set(
            activePosition.x + Math.cos(angle) * orbit,
            activePosition.y + Math.sin(angle * 1.7) * orbit * 0.62,
            activePosition.z + Math.sin(angle) * orbit
          )
          const base = index * 3
          activeHaloPositions[base] = haloVector.x
          activeHaloPositions[base + 1] = haloVector.y
          activeHaloPositions[base + 2] = haloVector.z
        }
        activeHaloMaterial.color.setHex(DOCK_NODE_COLORS[activeNode] ?? 0xfbbf24)
        activeHaloMaterial.opacity = runtimeStatus === 'running' ? 0.94 : 0.56 + Math.sin(elapsed * 4.6) * 0.08
        activeHaloMaterial.size = runtimeStatus === 'running' ? 0.08 : 0.058
        haloAttribute.needsUpdate = true

        const flowAttribute = flowGeometry.getAttribute('position') as THREE.BufferAttribute
        const start = nodePositions[activeNode]
        const end = nodePositions[nextNode]
        for (let index = 0; index < flowParticleCount; index += 1) {
          const progress =
            (nodeProgress +
              index / flowParticleCount) %
            1
          flowVector.lerpVectors(start, end, progress)
          const bow = Math.sin(progress * Math.PI) * (runtimeStatus === 'running' ? 0.44 : 0.28)
          flowVector.add(flowVector.clone().normalize().multiplyScalar(bow))
          flowVector.y += Math.sin(elapsed * 4 + index) * 0.035
          const base = index * 3
          flowPositions[base] = flowVector.x
          flowPositions[base + 1] = flowVector.y
          flowPositions[base + 2] = flowVector.z
        }
        flowMaterial.opacity = runtimeStatus === 'running' ? 0.96 : 0.64
        flowMaterial.size = runtimeStatus === 'running' ? (isExpandedRender ? 0.13 : 0.092) : (isExpandedRender ? 0.095 : 0.07)
        flowMaterial.color.setHex(DOCK_NODE_COLORS[activeNode] ?? 0x22d3ee)
        flowAttribute.needsUpdate = true

        const electricAttribute = electricGeometry.getAttribute('position') as THREE.BufferAttribute
        for (let index = 0; index < DOCK_ELECTRIC_POINT_COUNT; index += 1) {
          const progress = index / (DOCK_ELECTRIC_POINT_COUNT - 1)
          flowVector.lerpVectors(start, end, progress)
          const wave =
            Math.sin(progress * Math.PI * 3 + elapsed * (runtimeStatus === 'running' ? 10 : 5)) *
            (runtimeStatus === 'running' ? 0.07 : 0.045)
          const bow = Math.sin(progress * Math.PI) * (runtimeStatus === 'running' ? 0.3 : 0.18)
          flowVector.add(flowVector.clone().normalize().multiplyScalar(bow + wave))
          flowVector.y += Math.cos(progress * Math.PI * 5 + elapsed * 8) * 0.035
          const base = index * 3
          electricPositions[base] = flowVector.x
          electricPositions[base + 1] = flowVector.y
          electricPositions[base + 2] = flowVector.z
        }
        electricMaterial.opacity = runtimeStatus === 'running' ? 0.82 : 0.42
        electricMaterial.color.setHex(DOCK_NODE_COLORS[activeNode] ?? 0x38bdf8)
        electricAttribute.needsUpdate = true

        renderer?.render(scene, camera)
      }

      renderer.setAnimationLoop(render)

      return () => {
        disposed = true
        renderer?.setAnimationLoop(null)
        personShell.geometry.dispose()
        eventShell.geometry.dispose()
        flowGeometry.dispose()
        electricGeometry.dispose()
        activeHaloGeometry.dispose()
        personMaterial.dispose()
        eventMaterial.dispose()
        flowMaterial.dispose()
        electricMaterial.dispose()
        activeHaloMaterial.dispose()
        nodePoints.forEach((points) => {
          points.geometry.dispose()
          ;(points.material as THREE.Material).dispose()
        })
        renderer?.dispose()
        renderer?.forceContextLoss()
        host.replaceChildren()
        renderer = null
      }
    } catch {
      host.classList.add('fallback')
      return () => {
        disposed = true
        renderer?.setAnimationLoop(null)
        renderer?.dispose()
        renderer?.forceContextLoss()
        host.classList.remove('fallback')
      }
    }
  }, [renderSize, signature])

  return (
    <div ref={hostRef} className={`zg-dock-particle-host ${className}`.trim()} style={{ width: renderSize, height: renderSize }} aria-hidden="true">
      <span className="zg-particle-fallback" />
    </div>
  )
}

interface DockGraphLaunchState {
  attached?: boolean
  appType?: string
  targetTitle?: string
  reason?: string
  updatedAt?: string
  runtimeStatus?: RuntimeStatus
  panelExpanded?: boolean
  relationshipClass?: RelationshipClass
  goalKind?: GoalKind
  followUpLabel?: string
  followUpPriority?: string
  followUpNextAction?: string
  launchIntent?: 'status_dialogue_voice_entry'
  statusDialogueAction?: 'focus_stt'
  source?: 'dock_voice_button'
}

type GraphPointKind =
  | 'core'
  | 'perception'
  | 'event'
  | 'state'
  | 'world_model'
  | 'social'
  | 'learning'
  | 'forecast'
  | 'capability'
  | 'decision'
  | 'action'
  | 'feedback'
  | 'safety'
  | 'visual'
  | 'dialogue'

interface GraphStar {
  id: string
  label: string
  status: string
  detail: string
  weight: number
  group?: string
  owner?: string
  gate?: string
  compass?: string
  controlSurface?: EntityWorkStageControlSurface
  io?: {
    inputs: string[]
    outputs: string[]
    refs: string[]
  }
}

interface EntityWorkStageAction {
  action_id: string
  label: string
  kind: string
  allowed: boolean
  requires_user_confirmation: boolean
  risk_level?: 'low' | 'medium' | 'high' | 'critical'
  command?: {
    runner?: string
    args?: string[]
    writes_to?: string[]
  }
  blocked_until?: string[]
  expected_output_contracts?: string[]
}

interface EntityWorkStageControlSurface {
  contract: 'cross_border_stage_control_surface.v1'
  project_id: string
  stage_id: string
  stage_label: string
  stage_layer?: string
  state: {
    status: string
    execution_mode: string
    progress: number
    blockers?: string[]
    next_actions?: string[]
    updated_at: string
  }
  view: {
    summary: string
    source_refs: string[]
    runtime_refs?: string[]
    graph_node_id?: string
    lens_tags?: string[]
  }
  actions: EntityWorkStageAction[]
  gates: Array<{
    gate_id: string
    status: string
    owner: string
    required_for: string[]
    evidence_refs?: string[]
  }>
  artifacts?: {
    input_contracts?: string[]
    output_contracts?: string[]
    runtime_output_root?: string
    latest_report?: string
  }
  audit?: {
    event_contracts?: string[]
    writeback_required?: boolean
    real_execution_allowed?: boolean
    notes?: string[]
  }
}

interface EntityWorkBranchOverlay {
  branch_id: string
  label: string
  status?: string
  relationship?: string
  phase_count?: number
  module_count?: number
  software_count?: number
  mapped_stage_ids?: string[]
  dashboard?: string
  control_pack?: string
  real_external_actions_allowed?: boolean
  external_software_enabled?: boolean
}

interface EntityWorkRuntimeProjection {
  success?: boolean
  contract?: 'entity_work_runtime_projection.v1'
  project_id?: string
  generated_at?: string
  status?: {
    stage_count?: number
    status_counts?: Record<string, number>
    blocked_real_actions?: number
    branch_overlays?: EntityWorkBranchOverlay[]
  }
  surfaces?: EntityWorkStageControlSurface[]
  error?: string
  reason?: string
}

interface EntityWorkStageRunResult {
  success?: boolean
  contract?: 'entity_work_stage_run_result.v1'
  stage?: string
  action?: string
  stdout?: string
  error?: string
  reason?: string
  projection?: EntityWorkRuntimeProjection
}

interface GraphPoint {
  id: string
  label: string
  kind: GraphPointKind
  status: string
  detail: string
  position: [number, number, number]
  color: number
  weight: number
  importance: number
  orbit: number
  particleCount: number
  stretch: [number, number, number]
  amplitude: number
  stars: GraphStar[]
  owner?: string
  gate?: string
  compassPrefix?: string
}

interface HoveredGraphPoint {
  node: GraphPoint
  star?: GraphStar
  x: number
  y: number
}

type GraphFocusDepth = 'global' | 'module' | 'star'

interface FocusedGraphTarget {
  node: GraphPoint
  star?: GraphStar
  depth: GraphFocusDepth
}

interface StatusDialogueMessage {
  id: string
  role: 'user' | 'system'
  text: string
  timestamp: string
  thoughts?: string[]
  source?: string
  model?: string
  latencyMs?: number
  pending?: boolean
  error?: string
  statusRefs?: string[]
  missingStatus?: string[]
}

type StatusDialogueModelResult = StatusDialogueOutput
  & {
    policyDecision?: DialoguePolicyDecision
    patrolInsertions?: PatrolFindingInsert[]
    eventBroadcastRequests?: VoiceEventBroadcastRequest[]
    voiceScriptPatches?: VoiceScriptPatch[]
    voiceBroadcastQueue?: VoiceBroadcastQueueState
  }

interface StatusDialogueSnapshotState {
  snapshot: StatusSnapshot
  source: string
  cardDir?: string
  error?: string
}

interface StatusDialogueEventSnapshotState {
  snapshot: SystemEventSnapshot
  source: string
  eventDir?: string
  error?: string
}

interface StatusDialoguePatrolIndexState {
  summary: SystemPatrolDialogueIndexSummary
  source: string
  indexPath?: string
  error?: string
}

interface StatusDialogueRuntimeVoiceDiagnosticState {
  diagnostic: StatusDialogueRuntimeVoiceDiagnostic
  source: string
  error?: string
}

interface VoiceEventBroadcastPanelState {
  generatedAt: string
  source: string
  requests: VoiceEventBroadcastRequest[]
  patches: VoiceScriptPatch[]
  queue: VoiceBroadcastQueueState
  last_trace?: VoiceOutputTrace
  last_latency_trace?: VoiceLatencyTrace
  last_error?: string
  last_replay_at?: string
  replay_count: number
}

interface StatusDialogueRealIntegrationState {
  env?: StatusDialogueRealEnvCheckResult
  modelTest?: StatusDialogueModelTestResult
  envBusy: boolean
  modelBusy: boolean
  source: 'main_process' | 'browser_preview'
  error?: string
}

interface StatusDialogueTtsAdapterState {
  health?: StatusDialogueTtsHealthResult
  busy: boolean
  error?: string
}

interface StatusDialogueLocalSttRuntimeState {
  health: StatusDialogueLocalSttHealthResult
  busy: boolean
  lastResult?: StatusDialogueSttTranscriptionResult
  error?: string
}

interface StatusDialogueRemoteSttRuntimeState {
  health: StatusDialogueRemoteSttHealthResult
  busy: boolean
  error?: string
}

interface ArcballControlsLike {
  enabled: boolean
  enablePan: boolean
  enableRotate: boolean
  enableZoom: boolean
  enableFocus: boolean
  enableGrid: boolean
  enableAnimations: boolean
  scaleFactor: number
  wMax: number
  target: THREE.Vector3
  setGizmosVisible: (value: boolean) => void
  dispose: () => void
  saveState: () => void
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

type ArcballControlsConstructor = new (
  camera: THREE.Camera,
  domElement: HTMLElement,
  scene?: THREE.Scene
) => ArcballControlsLike

interface SemanticParticleCloud {
  geometry: THREE.BufferGeometry
  positions: Float32Array
  basePositions: Float32Array
  phases: Float32Array
  amplitudes: Float32Array
  nodeIndexes: Uint16Array
  count: number
}

interface SemanticParticleSpec {
  count: number
  radius: number
  stretch: [number, number, number]
  amplitude: number
}

interface WorldNebulaDefinition {
  id: string
  label: string
  kind: Exclude<GraphPointKind, 'core'>
  status: string
  detail: string
  color: number
  weight: number
  importance: number
  layer: number
  stars: GraphStar[]
  owner: string
  gate: string
  compassPrefix: string
}

const WORLD_SYSTEM_CENTER: GraphPoint = {
  id: 'world-core',
  label: '世界系统核心',
  kind: 'core',
  status: '中心模型',
  detail: '汇聚外部世界、世界状态、多域图谱、预测、能力拼接、决策行动和反馈；当前为独立视觉投影，不接真实业务数据。',
  position: [0, 0, 0],
  color: 0xf8fafc,
  weight: 1,
  importance: 1,
  orbit: 3.2,
  particleCount: 1120,
  stretch: [1.08, 0.84, 1.08],
  amplitude: 0.028,
  owner: 'World System Architecture',
  gate: 'core_alignment_gate',
  compassPrefix: 'core',
  stars: [
    {
      id: 'graph-projection',
      label: 'graph_projection_vnext',
      status: '只读投影契约',
      detail: '把事实、候选、预测、运行态和 source_refs 转换为三维粒子可读结构。',
      weight: 0.96,
      owner: 'Visual World Operating Layer',
      gate: 'projection_contract_gate',
      compass: 'core.contract.projection'
    },
    {
      id: 'visual-intent',
      label: 'visual_operation_intent',
      status: '视觉操作意图',
      detail: '把点击、下钻、聚焦、比较、沙盒请求转换成可审查意图。',
      weight: 0.92,
      owner: 'Visual Intent Bus',
      gate: 'operation_intent_gate',
      compass: 'core.contract.intent'
    },
    {
      id: 'source-refs',
      label: 'source_refs',
      status: '来源追溯',
      detail: '没有来源引用的节点只能是 UI 状态或待确认推断，不能显示为事实。',
      weight: 0.88,
      owner: 'Projection Adapter',
      gate: 'source_reference_gate',
      compass: 'core.evidence.source_refs'
    },
    {
      id: 'independent-mode',
      label: '独立视觉态',
      status: '暂不接入真实图谱',
      detail: '当前用于验证世界系统空间结构，不读取人际关系系统和事件图谱。',
      weight: 0.84,
      owner: 'Particle OS Fixture',
      gate: 'integration_boundary_gate',
      compass: 'core.boundary.independent'
    },
    {
      id: 'object-state-separation',
      label: '对象状态分离',
      status: '事实/假设/预测/行动分层',
      detail: '区分 observation、fusion_hypothesis、confirmed_fact、latent_variable、forecast_branch、candidate、intent、result 和 feedback。',
      weight: 0.9,
      owner: 'World System Architecture',
      gate: 'semantic_state_gate',
      compass: 'core.semantic.object_state'
    },
    {
      id: 'confirmed-fact',
      label: 'confirmed_fact',
      status: '可确认事实',
      detail: '有证据和写入规则支持后才能显示为事实节点。',
      weight: 0.86,
      owner: 'Fact Source Layer',
      gate: 'fact_promotion_gate',
      compass: 'core.semantic.confirmed_fact'
    },
    {
      id: 'candidate-boundary',
      label: 'candidate boundary',
      status: '候选不等于事实',
      detail: '能力候选、预测分支、沙盒结果和关系变化候选必须保持候选态。',
      weight: 0.84,
      owner: 'Projection Adapter',
      gate: 'candidate_label_gate',
      compass: 'core.semantic.candidate'
    },
    {
      id: 'auditability',
      label: 'auditability',
      status: '可审计路径',
      detail: '每个可操作节点都需要 source_refs、intent_refs 或 audit_refs，便于回放和归责。',
      weight: 0.82,
      owner: 'Governance Layer',
      gate: 'audit_reference_gate',
      compass: 'core.governance.audit'
    },
    {
      id: 'visual-first-boundary',
      label: 'visual-first boundary',
      status: '纯视觉不取消契约',
      detail: '三维粒子是操作方式，不取消底层投影、意图、来源、审计和回放契约。',
      weight: 0.8,
      owner: 'Visual World Operating Layer',
      gate: 'visual_contract_gate',
      compass: 'core.visual.boundary'
    },
    {
      id: 'first-real-module',
      label: 'first real module',
      status: '人际辅助系统接入位',
      detail: '现有人际关系辅助系统是第一个真实子系统，先只读投影，后续再受控 handoff。',
      weight: 0.78,
      owner: 'Social Assistant Adapter',
      gate: 'read_only_adapter_gate',
      compass: 'core.integration.social_first'
    }
  ]
}

const WORLD_SYSTEM_NEBULAE: WorldNebulaDefinition[] = [
  {
    id: 'external-world',
    label: '外部世界来源',
    kind: 'perception',
    status: '世界输入层',
    detail: '所有外部来源先作为观测入口进入系统，不直接写成事实。',
    color: 0x14b8a6,
    weight: 0.88,
    importance: 0.9,
    layer: -0.18,
    owner: 'Intake and Sensor Layer',
    gate: 'source_intake_gate',
    compassPrefix: 'external_world',
    stars: [
      { id: 'voice-source', label: '语音', status: 'ASR 输入', detail: '语音先转成观测和证据，再进入实体或事件候选。', weight: 0.78 },
      { id: 'image-source', label: '图像', status: '视觉输入', detail: '图像用于物体、场景、人物和证据识别。', weight: 0.78 },
      { id: 'screen-source', label: '屏幕', status: '桌面上下文', detail: '屏幕内容作为只读 observation 或平台预览证据。', weight: 0.86 },
      { id: 'location-source', label: '位置', status: '时空来源', detail: '位置用于统一时空坐标和物理事件上下文。', weight: 0.7 },
      { id: 'document-source', label: '文档', status: '文本证据', detail: '文档进入 OCR、结构化抽取和知识摄入。', weight: 0.8 },
      { id: 'network-source', label: '网络', status: '外部信息', detail: '网络资料进入能力观察、知识摄入或事实候选。', weight: 0.82 },
      { id: 'device-source', label: '设备', status: '设备观测', detail: '设备只提供观测或受控动作候选，不直接定义意义。', weight: 0.72 },
      { id: 'software-source', label: '软件/API/插件', status: '能力来源', detail: '外部软件按系统目标重解释为能力候选。', weight: 0.84 }
    ]
  },
  {
    id: 'perception-fusion',
    label: '感知与融合',
    kind: 'perception',
    status: '观测对齐层',
    detail: '不是设备清单，而是 Observation Atom、Fusion Bundle、矩阵、冲突、时空坐标、潜变量和物理概念库。',
    color: 0x2dd4bf,
    weight: 0.92,
    importance: 0.92,
    layer: -0.1,
    owner: 'Perception Fusion Layer',
    gate: 'observation_fusion_gate',
    compassPrefix: 'perception',
    stars: [
      { id: 'sensor-registry', label: 'Sensor Registry', status: '来源登记', detail: '登记传感器/来源的能力、校准、上下文和可观测属性。', weight: 0.78 },
      { id: 'calibration-time-space', label: '统一时空坐标', status: '校准前置', detail: '统一时间、空间、单位、坐标和设备校准状态。', weight: 0.88 },
      { id: 'observation-atom', label: 'Observation Atom', status: '最小观测', detail: '记录来源、时间、空间、属性、证据、单位、置信度和不确定性。', weight: 0.96 },
      { id: 'fusion-bundle', label: 'Fusion Bundle', status: '融合候选', detail: '多源观测融合成实体、事件或潜变量候选，不直接等于事实。', weight: 0.94 },
      { id: 'sensor-property-matrix', label: '传感器-属性矩阵', status: '五矩阵之一', detail: '描述各来源能观测哪些属性。', weight: 0.76 },
      { id: 'sensor-entity-matrix', label: '传感器-实体矩阵', status: '五矩阵之一', detail: '描述来源对人物、物体、设备、场景等实体的可观测性。', weight: 0.76 },
      { id: 'sensor-event-matrix', label: '传感器-事件矩阵', status: '五矩阵之一', detail: '描述来源能支持哪些事件候选。', weight: 0.76 },
      { id: 'sensor-complement-matrix', label: '传感器-互补矩阵', status: '五矩阵之一', detail: '描述多个来源如何互补、互证或冲突。', weight: 0.74 },
      { id: 'sensor-write-matrix', label: '传感器-写入矩阵', status: '五矩阵之一', detail: '决定观测何时可进入事件候选、假设或事实写入流程。', weight: 0.8 },
      { id: 'conflict-record', label: '冲突处理', status: '冲突记录', detail: '记录观测间冲突、证据差异和解决状态。', weight: 0.82 },
      { id: 'latent-variable-perception', label: '潜变量层', status: '不可见驱动', detail: '把尚不可直接观测但解释变化的因素保留为变量。', weight: 0.8 },
      { id: 'physical-concept-library', label: '物理概念定义库', status: '概念解释', detail: '定义握手、说话、环境闷热、客户兴趣等概念。', weight: 0.78 }
    ]
  },
  {
    id: 'event-extraction',
    label: '事件抽取层',
    kind: 'event',
    status: '事件结构化',
    detail: '把观测和融合候选转成谁、何时、何地、做了什么、影响谁、证据是什么。',
    color: 0xfb923c,
    weight: 0.88,
    importance: 0.9,
    layer: 0.02,
    owner: 'Event Extraction Layer',
    gate: 'event_candidate_gate',
    compassPrefix: 'event_extraction',
    stars: [
      { id: 'event-who', label: '谁', status: '参与者', detail: '事件参与人物、系统、设备或组织。', weight: 0.82 },
      { id: 'event-when', label: '何时', status: '时间字段', detail: '发生时间、观察时间和更新时间需要区分。', weight: 0.8 },
      { id: 'event-where', label: '何地', status: '空间字段', detail: '位置、窗口、平台、设备或场景坐标。', weight: 0.76 },
      { id: 'event-what', label: '做了什么', status: '行为字段', detail: '动作、变化、输入、选择或反馈。', weight: 0.84 },
      { id: 'event-impact', label: '影响了谁', status: '影响对象', detail: '指向人物、关系、任务、状态、能力或风险。', weight: 0.84 },
      { id: 'event-evidence', label: '证据是什么', status: '证据引用', detail: '保存 evidence_refs、source_refs 和可回放上下文。', weight: 0.88 },
      { id: 'raw-event', label: 'RawEvent', status: '原始事件', detail: '原始导入或采集后形成的事件记录。', weight: 0.78 },
      { id: 'semantic-event', label: 'SemanticEvent', status: '语义事件', detail: '经过实体解析、上下文和关系引用后的事件。', weight: 0.82 },
      { id: 'relationship-change-candidate', label: 'relationship_change_candidate', status: '关系变化候选', detail: '事件可能改变关系，但必须经过策略和证据闸口。', weight: 0.8 }
    ]
  },
  {
    id: 'global-events',
    label: '全域事件图谱',
    kind: 'event',
    status: '变化记录层',
    detail: '社会、物理、学习、实验、决策、行动和反馈事件的全域网络。',
    color: 0xf97316,
    weight: 0.9,
    importance: 0.9,
    layer: -0.04,
    owner: 'Global Event Graph',
    gate: 'global_event_graph_gate',
    compassPrefix: 'global_events',
    stars: [
      { id: 'social-event', label: '社会事件', status: '沟通与关系变化', detail: '承接人际辅助系统中的沟通、客户跟进和反馈事件。', weight: 0.9 },
      { id: 'physical-event', label: '物理事件', status: '环境与设备变化', detail: '来自位置、图像、设备和物理概念定义库。', weight: 0.76 },
      { id: 'learning-event', label: '学习事件', status: '知识变化', detail: '记录知识摄入、理解、连接、测试和内化过程。', weight: 0.78 },
      { id: 'experiment-event', label: '实验事件', status: '虚拟/沙盒试验', detail: '记录虚拟训练、能力验证和反事实试跑。', weight: 0.8 },
      { id: 'decision-event', label: '决策事件', status: '选择过程', detail: '记录候选策略、风险审查、意志评分和最终选择。', weight: 0.88 },
      { id: 'action-event', label: '行动事件', status: '动作结果', detail: '记录沟通、提醒、工具调用、设备控制或文档生成。', weight: 0.82 },
      { id: 'feedback-event', label: '反馈事件', status: '结果回写', detail: '把行动结果转成校准、策略修正和知识更新依据。', weight: 0.86 },
      { id: 'event-chain', label: '事件链', status: '时间序列', detail: '把相关事件连接成可回放链路。', weight: 0.82 },
      { id: 'event-cluster', label: '事件簇', status: '主题聚合', detail: '按目标、人物、物体、能力或风险聚合事件。', weight: 0.78 }
    ]
  },
  {
    id: 'world-state',
    label: '世界状态模型',
    kind: 'state',
    status: '核心状态层',
    detail: '事件描述变化，状态描述变化后的世界；运行态显示主要来自这里。',
    color: 0x38bdf8,
    weight: 0.98,
    importance: 0.97,
    layer: 0,
    owner: 'World State Runtime',
    gate: 'state_update_gate',
    compassPrefix: 'world_state',
    stars: [
      { id: 'state-snapshot', label: 'state_snapshot', status: '状态快照', detail: '记录某一时刻系统认为世界处于什么状态。', weight: 0.96 },
      { id: 'state-delta', label: 'state_delta', status: '状态变化', detail: '记录事件、行动或反馈造成的状态差异。', weight: 0.92 },
      { id: 'valid-time', label: 'valid_time', status: '有效时间', detail: '状态在哪段时间内有效。', weight: 0.84 },
      { id: 'observed-time', label: 'observed_time', status: '观察时间', detail: '系统何时观察到状态或事件。', weight: 0.78 },
      { id: 'updated-time', label: 'updated_time', status: '更新时间', detail: '系统何时更新理解。', weight: 0.78 },
      { id: 'state-confidence', label: 'state_confidence', status: '状态置信度', detail: '状态可信度必须与证据质量分离记录。', weight: 0.86 },
      { id: 'state-scope', label: 'state_scope', status: '状态范围', detail: '状态作用于人、关系、任务、能力、环境或自我。', weight: 0.82 },
      { id: 'runtime-activity-overlay', label: 'runtime_activity_overlay', status: '运行态叠加', detail: '放大、旋转、下钻时仍保留当前运行状态。', weight: 0.9 },
      { id: 'risk-overlay', label: 'risk_overlay', status: '风险叠加', detail: '风险、权限、阻断和审查状态作为 overlay 显示。', weight: 0.88 },
      { id: 'forecast-overlay', label: 'forecast_overlay', status: '预测叠加', detail: '未来分支不写事实，只作为预测状态叠加。', weight: 0.82 }
    ]
  },
  {
    id: 'world-model',
    label: '多域世界图谱',
    kind: 'world_model',
    status: '事实组织层',
    detail: '人际、事件、任务、知识、物体、自我状态、能力、预测、安全和反馈图谱通过统一引用连接。',
    color: 0x84cc16,
    weight: 0.9,
    importance: 0.9,
    layer: 0.08,
    owner: 'World Model Layer',
    gate: 'world_model_projection_gate',
    compassPrefix: 'world_model',
    stars: [
      { id: 'interpersonal-graph', label: '人际图谱', status: '社会事实域', detail: '人物、关系、关系策略和互动历史。', weight: 0.9 },
      { id: 'task-graph', label: '任务图谱', status: '目标与依赖', detail: '目标、任务、阶段、依赖、进度和阻断。', weight: 0.84 },
      { id: 'knowledge-graph', label: '知识图谱', status: '概念与规则', detail: '概念、规则、经验、适用条件和失败条件。', weight: 0.86 },
      { id: 'object-graph', label: '物体图谱', status: '物体与环境', detail: '物体、位置、属性、用途和状态。', weight: 0.72 },
      { id: 'self-state-graph', label: '自我状态图谱', status: '能力与资源', detail: '能力、资源、偏好、风险、权限和运行状态。', weight: 0.88 },
      { id: 'external-capability-graph', label: '外部能力图谱', status: '能力候选域', detail: '软件、工具、代码、API 和可转化能力。', weight: 0.82 },
      { id: 'forecast-graph', label: '预测图谱', status: '未来分支域', detail: '变量、影响边和未来可能性分支。', weight: 0.82 },
      { id: 'safety-graph', label: '安全范围图谱', status: '治理域', detail: '安全评估范围、版本修订和审查结果。', weight: 0.82 },
      { id: 'feedback-graph', label: '反馈图谱', status: '校准域', detail: '结果、偏差、策略修正和知识更新。', weight: 0.84 }
    ]
  },
  {
    id: 'social-cognition',
    label: '人际辅助接入位',
    kind: 'social',
    status: '未来真实子系统',
    detail: '现有人际关系辅助系统作为社会认知与人际互动模块接入；当前为静态投影位置。',
    color: 0xfb7185,
    weight: 0.92,
    importance: 0.92,
    layer: 0.18,
    owner: 'Social Cognition Module',
    gate: 'social_read_only_adapter_gate',
    compassPrefix: 'social',
    stars: [
      { id: 'people', label: 'people', status: '人物事实', detail: '人物实体由原系统事实源维护。', weight: 0.88 },
      { id: 'relationships', label: 'relationships', status: '关系事实', detail: '关系事实、关系边和互动历史保留原主轴。', weight: 0.9 },
      { id: 'identity-resolution', label: 'identity_resolution', status: '身份连续性', detail: '渠道身份、候选人物和确认队列归入实体解析。', weight: 0.84 },
      { id: 'social-event-link', label: 'social_event_link', status: '事件关联', detail: '社会事件通过参与、影响和反馈边连接关系事实。', weight: 0.82 },
      { id: 'b2b-followup-loop', label: 'B2B follow-up loop', status: '第一阶段目标', detail: '客户跟进闭环仍是当前项目第一稳定应用域。', weight: 0.9 },
      { id: 'decision-cluster-link', label: 'decision_cluster_link', status: '决策接入', detail: '关系、事件、偏好和反馈进入决策集群。', weight: 0.82 },
      { id: 'trigger-engine-link', label: 'trigger_engine_link', status: '行动计划接入', detail: '触发计划、平台预览和手工清单保留原链路。', weight: 0.8 },
      { id: 'social-assistant-projection-adapter', label: 'social_assistant_projection_adapter', status: '只读适配器', detail: '后续把原系统输出转成 graph_projection_vnext。', weight: 0.86 }
    ]
  },
  {
    id: 'relationship-policy',
    label: '关系策略层',
    kind: 'social',
    status: '策略分配器',
    detail: '关系策略桶、处理目标、关系策略卡、权限等级和四类逻辑智能体。',
    color: 0xf472b6,
    weight: 0.88,
    importance: 0.88,
    layer: 0.2,
    owner: 'Relationship Policy Layer',
    gate: 'relationship_policy_gate',
    compassPrefix: 'relationship_policy',
    stars: [
      { id: 'bucket-core-care', label: 'core_care', status: '策略桶', detail: '核心照护型关系策略。', weight: 0.76 },
      { id: 'bucket-intimacy', label: 'intimacy_development', status: '策略桶', detail: '亲密发展型关系策略。', weight: 0.74 },
      { id: 'bucket-business', label: 'business_advancement', status: '策略桶', detail: '商业推进型关系策略。', weight: 0.88 },
      { id: 'bucket-collaboration', label: 'collaboration_fulfillment', status: '策略桶', detail: '协作履约型关系策略。', weight: 0.82 },
      { id: 'bucket-maintenance', label: 'light_maintenance', status: '策略桶', detail: '轻度维持型关系策略。', weight: 0.72 },
      { id: 'bucket-weak-tie', label: 'weak_tie_networking', status: '策略桶', detail: '弱关系资源型关系策略。', weight: 0.72 },
      { id: 'bucket-transactional', label: 'transactional_formal', status: '策略桶', detail: '契约事务型关系策略。', weight: 0.78 },
      { id: 'bucket-repair', label: 'repair_recovery', status: '策略桶', detail: '修复挽回型关系策略。', weight: 0.78 },
      { id: 'bucket-risk', label: 'risk_boundary', status: '策略桶', detail: '风险边界型关系策略，优先覆盖普通策略。', weight: 0.86 },
      { id: 'bucket-dormant', label: 'dormant_archive', status: '策略桶', detail: '沉睡归档型关系策略。', weight: 0.68 },
      { id: 'relationship-goals', label: 'advance/deepen/maintain/care/transact/repair/downgrade/exit/observe', status: '处理目标', detail: '8 个核心目标加 observe 观察态。', weight: 0.86 },
      { id: 'relationship-permission', label: 'L0-L4 权限等级', status: '动作权限', detail: '只分析、提醒、草稿、低风险自动、禁止自动联系的权限语义。', weight: 0.84 },
      { id: 'relationship-policy-card', label: 'relationship_policy card', status: '策略卡', detail: '包含 person_id、关系摘要、策略桶、当前目标、建议动作、避免动作和确认要求。', weight: 0.88 },
      { id: 'relationship-agents', label: '四个关系智能体', status: '逻辑分工', detail: '关系识别、策略分配、动作生成、风险审查。', weight: 0.8 }
    ]
  },
  {
    id: 'learning-engine',
    label: '学习引擎',
    kind: 'learning',
    status: '规则内化层',
    detail: '位于知识图谱、世界模型和决策层之间，输出知识结构、规则、失败条件和可迁移策略。',
    color: 0x22c55e,
    weight: 0.86,
    importance: 0.84,
    layer: -0.2,
    owner: 'Learning Engine',
    gate: 'learning_internalization_gate',
    compassPrefix: 'learning',
    stars: [
      { id: 'knowledge-intake', label: '知识摄入模块', status: 'raw', detail: '把外部材料、文档、网页和反馈转成知识候选。', weight: 0.76 },
      { id: 'knowledge-graph-module', label: '知识图谱模块', status: 'connected', detail: '组织概念、规则、关系和适用条件。', weight: 0.82 },
      { id: 'analogy-transfer', label: '类比迁移模块', status: '迁移候选', detail: '把一个领域的结构迁移到另一个目标上下文。', weight: 0.78 },
      { id: 'causal-model', label: '因果模型模块', status: '影响关系', detail: '产生可用于预测和决策的因果候选。', weight: 0.86 },
      { id: 'virtual-training', label: '虚拟世界训练模块', status: '模拟校验', detail: '在虚拟世界中试跑规则、策略和失败条件。', weight: 0.82 },
      { id: 'physical-alignment', label: '物理世界对齐模块', status: '现实约束', detail: '把知识规则与物理观察、设备和环境对齐。', weight: 0.76 },
      { id: 'knowledge-internalization', label: '知识内化模块', status: 'mastered', detail: '把 tested / operationalized 的知识提升为可用规则。', weight: 0.84 },
      { id: 'internalization-states', label: 'raw/understood/connected/tested/operationalized/mastered', status: '内化状态', detail: '知识从原始输入到掌握状态的阶段。', weight: 0.8 },
      { id: 'failure-conditions', label: '失败条件', status: '适用边界', detail: '记录规则何时不适用、何时会失败。', weight: 0.78 }
    ]
  },
  {
    id: 'forecast-simulation',
    label: '可能性预测',
    kind: 'forecast',
    status: '未来分支层',
    detail: '基于事实、变量和影响边预判未来可能性，支持模拟、干预和反馈校准。',
    color: 0xa78bfa,
    weight: 0.84,
    importance: 0.84,
    layer: 0.22,
    owner: 'Possibility Forecast Graph',
    gate: 'forecast_only_gate',
    compassPrefix: 'forecast',
    stars: [
      { id: 'forecast-branch', label: 'forecast_branch', status: '未来分支', detail: '预测不是事实，而是带证据、变量和置信度的可能性。', weight: 0.92 },
      { id: 'probability-score', label: 'probability_score', status: '发生概率', detail: '未来分支发生概率。', weight: 0.8 },
      { id: 'impact-score', label: 'impact_score', status: '目标影响', detail: '未来分支对目标影响强度。', weight: 0.82 },
      { id: 'risk-score', label: 'risk_score', status: '负面风险', detail: '未来分支带来的风险评分。', weight: 0.82 },
      { id: 'confidence-score', label: 'confidence_score', status: '证据充分度', detail: '当前证据对预测的支持程度。', weight: 0.78 },
      { id: 'urgency-score', label: 'urgency_score', status: '紧急度', detail: '需要多快观察或干预。', weight: 0.74 },
      { id: 'controllability-score', label: 'controllability_score', status: '可控性', detail: '用户或系统能否通过动作影响分支。', weight: 0.76 },
      { id: 'reversibility-score', label: 'reversibility_score', status: '可逆性', detail: '结果是否可逆，影响安全和行动选择。', weight: 0.74 },
      { id: 'evidence-quality-score', label: 'evidence_quality_score', status: '证据质量', detail: '证据来源、覆盖和可信度评分。', weight: 0.78 },
      { id: 'influence-edge', label: 'influence_edge', status: '影响边', detail: 'increases、decreases、enables、blocks、amplifies、dampens、triggers、delays、conflicts_with、requires。', weight: 0.88 },
      { id: 'latent-variable', label: 'latent_variable', status: '潜变量', detail: '尚不可直接观测但驱动未来变化的变量。', weight: 0.84 },
      { id: 'observation-gap', label: 'observation_gap', status: '观测缺口', detail: '预测还缺哪些信息才能提升置信度。', weight: 0.78 },
      { id: 'intervention-candidate', label: 'intervention_candidate', status: '干预候选', detail: '可能改变未来分支的行动候选。', weight: 0.8 },
      { id: 'counterfactual-simulation', label: 'counterfactual_simulation', status: '反事实模拟', detail: '比较不同行动或变量变化下的未来分支。', weight: 0.76 }
    ]
  },
  {
    id: 'capability-composition',
    label: '能力拼接与沙盒',
    kind: 'capability',
    status: '外部能力层',
    detail: '外部软件、代码、API、插件和工具按系统目标重解释，拼接成能力候选并沙盒验证。',
    color: 0xf43f5e,
    weight: 0.82,
    importance: 0.82,
    layer: 0.04,
    owner: 'Capability Composition and Sandbox Realization Layer',
    gate: 'sandbox_self_containment_gate',
    compassPrefix: 'capability',
    stars: [
      { id: 'software-capability-observation', label: 'Software Capability Observation', status: '软件观察', detail: '记录外部软件、代码库、API、插件或工具的原始观察。', weight: 0.82 },
      { id: 'capability-atom', label: 'Capability Atom', status: '能力原子', detail: '记录可转化出的最小能力。', weight: 0.86 },
      { id: 'capability-to-requirement', label: 'Capability-to-Requirement Graph', status: '能力转需求', detail: '按系统目标和上下文重解释软件能力。', weight: 0.84 },
      { id: 'candidate-enumeration', label: '不设门槛候选枚举', status: '能力最大化', detail: '沙盒阶段不提前过滤候选发现和拼接可能。', weight: 0.82 },
      { id: 'code-capability-slice', label: 'Code Capability Slice', status: '代码切片', detail: '从代码、API 或工具中提取可拼接局部能力。', weight: 0.84 },
      { id: 'goal-capability-gap', label: 'Goal Capability Gap', status: '目标缺口', detail: '描述当前目标与已有能力之间的差距。', weight: 0.82 },
      { id: 'composition-plan', label: 'Capability Composition Plan', status: '拼接计划', detail: '多个能力切片如何组合成实现路径。', weight: 0.88 },
      { id: 'implementation-route', label: 'Implementation Route', status: '实现路径', detail: '从软件/代码能力到系统能力的实现步骤。', weight: 0.86 },
      { id: 'sandbox-verification', label: 'Sandbox Verification Run', status: '沙盒验证', detail: '在受控环境、mock service、本地样例或可回滚环境中验证。', weight: 0.9 },
      { id: 'implementation-candidate', label: 'Implementation Candidate', status: '实现候选', detail: '验证后可进入决策层的候选能力。', weight: 0.84 },
      { id: 'tool-runtime-adapter', label: 'tool-runtime adapter', status: '现有雏形', detail: '当前 tool-runtime 可作为外部工具能力雏形。', weight: 0.76 }
    ]
  },
  {
    id: 'decision-governance',
    label: '决策与意志治理',
    kind: 'decision',
    status: '目标选择层',
    detail: '综合目标树、自我意志接口、策略分配、资源评估、安全范围和风险审查。',
    color: 0xfacc15,
    weight: 0.94,
    importance: 0.94,
    layer: 0.12,
    owner: 'Decision and Will Governance Layer',
    gate: 'decision_governance_gate',
    compassPrefix: 'decision',
    stars: [
      { id: 'goal-tree', label: 'Goal Tree', status: '目标树', detail: '把当前目标、子目标和优先级组织成可解释结构。', weight: 0.92, group: '目标与策略' },
      { id: 'self-will-interface', label: 'Self-Will Model Interface', status: '意志接口', detail: '输入场景摘要、候选动作、风险报告；输出偏好动作、原因代码和批准要求。', weight: 0.88, group: '目标与策略' },
      { id: 'strategy-allocator', label: 'Strategy Allocator', status: '策略分配', detail: '把目标、关系、事件、预测和资源转换成候选策略。', weight: 0.9, group: '目标与策略' },
      { id: 'expert-matrix-config', label: 'expert_matrix_runtime_config.v1', status: '专家矩阵配置', detail: '记录专家启用、API 模式、主专家、全局强度和边界定义，作为并行专家运行契约输入。', weight: 0.9, group: '专家矩阵' },
      { id: 'expert-intensity-gate', label: 'expert_intensity_gate', status: '强度阀门', detail: '把全局强度和单专家强度转换为权重合并乘数，默认不改变真实发送门阀。', weight: 0.88, group: '专家矩阵' },
      { id: 'guidance-control-boundary', label: 'guidance_control_boundary', status: '引导/控制边界', detail: '区分研究层影响变量、主专家统筹输出和发送前安全审计，不把理论变量直接等同于可执行动作。', weight: 0.9, group: '专家矩阵' },
      { id: 'primary-expert-coordinator', label: 'primary_expert_coordinator', status: '主专家统筹', detail: '显式配置的主专家优先进专家槽位，负责汇总并输出提示或候选草稿。', weight: 0.88, group: '专家矩阵' },
      { id: 'resource-assessment', label: 'Resource Assessment', status: '资源评估', detail: '评估注意力、时间、计算、权限、预算和可恢复性。', weight: 0.82, group: '权重与评估' },
      { id: 'risk-review', label: 'Risk Review', status: '风险审查', detail: '候选动作进入行动前的风险、权限和影响检查。', weight: 0.86, group: '风险与发送门阀' },
      { id: 'option-explanation', label: '可解释推荐选项', status: '解释输出', detail: '推荐要能解释证据、目标、风险和取舍。', weight: 0.82, group: '权重与评估' },
      { id: 'message-draft-priority', label: 'message_draft 优先', status: '具体草稿', detail: '当前项目推荐选项必须尽量落成具体可人工确认草稿。', weight: 0.86, group: '风险与发送门阀' },
      { id: 'human-confirmation', label: 'human_confirmation_required', status: '人工确认', detail: '正式行动必须保留人工确认和审计记录。', weight: 0.88, group: '风险与发送门阀' }
    ]
  },
  {
    id: 'safety-scope',
    label: '安全范围治理',
    kind: 'safety',
    status: '范围版本层',
    detail: '意识模块评估并调整安全范围；当前沙盒聚焦自身影响、可控性、可恢复性和能力提升。',
    color: 0xef4444,
    weight: 0.88,
    importance: 0.88,
    layer: -0.06,
    owner: 'Self-Awareness Governance Layer',
    gate: 'safety_scope_revision_gate',
    compassPrefix: 'safety',
    stars: [
      { id: 'safety-scope-profile', label: 'Safety Scope Profile', status: '安全范围', detail: '记录当前安全评估范围、适用条件和阶段。', weight: 0.92 },
      { id: 'sandbox-self-containment', label: 'sandbox_self_containment.v1', status: '当前沙盒 profile', detail: '沙盒阶段聚焦自身影响、受控环境、可恢复性和能力提升。', weight: 0.9 },
      { id: 'safety-scope-revision', label: 'Safety Scope Revision', status: '范围修订', detail: '意识模块可提出安全范围变更，但需要版本化记录。', weight: 0.86 },
      { id: 'terminal-safety-review', label: 'Terminal Safety Review', status: '末端审查', detail: '行动末端统一审查风险、权限和执行状态。', weight: 0.88 },
      { id: 'risk-info', label: 'info', status: '风险等级', detail: '普通状态或低风险事实。', weight: 0.66 },
      { id: 'risk-needs-review', label: 'needs_review', status: '风险等级', detail: '需要人工复核的推断、身份、关系或事件。', weight: 0.78 },
      { id: 'risk-blocked', label: 'blocked', status: '风险等级', detail: '权限、证据、门禁或外部影响导致阻断。', weight: 0.84 },
      { id: 'risk-danger', label: 'danger', status: '风险等级', detail: '真实发送、设备控制、高风险关系、隐私或不可逆动作。', weight: 0.86 },
      { id: 'failure-recovery', label: 'failure_recovery', status: '失败恢复', detail: '记录失败、回滚、降级和恢复路径。', weight: 0.8 }
    ]
  },
  {
    id: 'action-layer',
    label: '行动与工具',
    kind: 'action',
    status: '执行候选层',
    detail: '沟通、提醒、项目执行、实验设计、设备控制、文档生成和工具调用；当前只生成视觉意图。',
    color: 0x06b6d4,
    weight: 0.78,
    importance: 0.78,
    layer: -0.18,
    owner: 'Action and Tool Layer',
    gate: 'action_execution_gate',
    compassPrefix: 'action',
    stars: [
      { id: 'communication-action', label: '沟通', status: 'message_draft', detail: '对应可确认草稿和人工执行清单。', weight: 0.86 },
      { id: 'reminder-action', label: '提醒', status: 'trigger_plan', detail: '主动、定时、例行和图谱信号触发。', weight: 0.78 },
      { id: 'project-execution', label: '项目执行', status: '任务推进', detail: '把任务图谱中的下一步转成执行候选。', weight: 0.76 },
      { id: 'experiment-design', label: '实验设计', status: '实验候选', detail: '为学习、能力或预测设计可验证实验。', weight: 0.76 },
      { id: 'device-control', label: '设备控制', status: '高风险动作', detail: '设备控制必须经过更高安全范围和执行闸口。', weight: 0.74 },
      { id: 'document-generation', label: '文档生成', status: '报告与交付', detail: '生成状态、审计、方案和用户可读材料。', weight: 0.78 },
      { id: 'tool-call-action', label: '工具调用', status: 'dry-run first', detail: '外部工具调用默认先走 dry-run 和审计。', weight: 0.8 },
      { id: 'platform-preview', label: '平台预览', status: '发送阻断', detail: '平台预览要证明草稿存在、真实发送被阻断。', weight: 0.82 },
      { id: 'manual-execution-checklist', label: 'manual_execution_checklist', status: '手工清单', detail: '检查目标对象、草稿、平台预览、确认闸门和行动后反馈。', weight: 0.84 }
    ]
  },
  {
    id: 'feedback-memory',
    label: '反馈与记忆',
    kind: 'feedback',
    status: '校准回路',
    detail: '结果记录、偏差分析、策略修正、知识更新、预测校准、关系状态变化和记忆生命周期。',
    color: 0xf59e0b,
    weight: 0.9,
    importance: 0.9,
    layer: 0.14,
    owner: 'Feedback and Memory Layer',
    gate: 'feedback_writeback_gate',
    compassPrefix: 'feedback',
    stars: [
      { id: 'result-record', label: '结果记录', status: 'action_result', detail: '记录行动结果和可验证证据。', weight: 0.88 },
      { id: 'deviation-analysis', label: '偏差分析', status: 'error signal', detail: '比较预测、计划和真实结果之间的差异。', weight: 0.84 },
      { id: 'strategy-correction', label: '策略修正', status: 'policy update', detail: '把反馈转为关系策略、任务计划或安全范围更新。', weight: 0.84 },
      { id: 'knowledge-update', label: '知识更新', status: 'learning feedback', detail: '把反馈送回学习引擎和知识图谱。', weight: 0.84 },
      { id: 'will-weight-iteration', label: '意志权重迭代', status: 'preference update', detail: '反馈可影响目标权重和偏好接口。', weight: 0.78 },
      { id: 'raw-memory', label: 'raw memory', status: '原始记忆', detail: '保留原始证据和输入。', weight: 0.76 },
      { id: 'episodic-memory', label: 'episodic memory', status: '情节记忆', detail: '保存事件序列和上下文经历。', weight: 0.74 },
      { id: 'semantic-memory', label: 'semantic memory', status: '语义记忆', detail: '保存抽象概念、关系和规则。', weight: 0.76 },
      { id: 'procedural-memory', label: 'procedural memory', status: '过程记忆', detail: '保存可复用流程和操作模式。', weight: 0.76 },
      { id: 'policy-memory', label: 'policy memory', status: '策略记忆', detail: '保存可解释策略、门禁和适用条件。', weight: 0.78 },
      { id: 'memory-compression', label: '记忆压缩/遗忘策略', status: '生命周期', detail: '不是删除事实，而是管理检索、压缩、归档和保留理由。', weight: 0.78 },
      { id: 'retrieval-rationale', label: 'retrieval_rationale', status: '检索理由', detail: '说明为什么此记忆被召回用于当前决策。', weight: 0.76 }
    ]
  },
  {
    id: 'status-dialogue-system',
    label: '系统主体状态对话系统',
    kind: 'dialogue',
    status: '全局状态只读问答',
    detail: '面向系统主体状态的高效率对话面，只检查子系统、子模块、焦点节点和运行叠加状态，可接入模型与语音层，但不直接执行外部动作。',
    color: 0x22c55e,
    weight: 0.94,
    importance: 0.94,
    layer: 0.12,
    owner: 'Subject Status Dialogue Runtime',
    gate: 'status_dialogue_read_only_gate',
    compassPrefix: 'status_dialogue',
    stars: [
      {
        id: 'real-phase0-env-check',
        label: 'real_phase0.env_check',
        status: 'environment check',
        detail: 'Checks desktop runtime readiness, browser speech APIs, microphone capture capability, provider configuration and patrol-only boundaries without requesting microphone permission.',
        weight: 0.89,
        group: 'Real Phase 0 / Environment',
        io: {
          inputs: ['window.electron.invoke', 'navigator.mediaDevices', 'window.speechSynthesis', 'settings.chatProvider.config'],
          outputs: ['status_dialogue_real_env_check.v1', 'visible_phase0_readiness'],
          refs: ['zhineng:status-dialogue:real-env:check']
        }
      },
      {
        id: 'real-phase0-provider-config',
        label: 'real_phase0.provider_config',
        status: 'redacted config probe',
        detail: 'Reads whether API key, model and base URL are configured. The API key is never returned to renderer, logs, particles or status cards.',
        weight: 0.86,
        group: 'Real Phase 0 / Environment',
        io: {
          inputs: ['settings.chatProvider.config.apiKey', 'settings.vision.apiKey', 'model', 'baseURL'],
          outputs: ['provider_readiness.redacted', 'base_url_host', 'model_name'],
          refs: ['settings:getAll', 'status_dialogue_real_env_check.v1']
        }
      },
      {
        id: 'real-phase0-browser-voice',
        label: 'real_phase0.browser_voice',
        status: 'speech capability probe',
        detail: 'Maps speechSynthesis, SpeechRecognition, getUserMedia and MediaRecorder capability into the patrol window and this particle directory.',
        weight: 0.84,
        group: 'Real Phase 0 / Environment',
        io: {
          inputs: ['window.speechSynthesis', 'window.SpeechRecognition', 'navigator.mediaDevices.getUserMedia', 'MediaRecorder'],
          outputs: ['tts_capability', 'stt_capability', 'microphone_capture_capability'],
          refs: ['browser_capability_projection']
        }
      },
      {
        id: 'real-phase0-boundary-lock',
        label: 'real_phase0.boundary_lock',
        status: 'patrol-only lock',
        detail: 'Documents that real checks do not create requirement packets, write world state, read real social/event graphs, persist audio samples or trigger external actions.',
        weight: 0.88,
        group: 'Real Phase 0 / Environment',
        io: {
          inputs: ['status_dialogue_config.v1', 'operator_phase_scope'],
          outputs: ['visible_patrol_boundary', 'blocked_external_actions'],
          refs: ['real-integration-phase0-phase1-implementation.md']
        }
      },
      {
        id: 'real-phase1-api-test',
        label: 'real_phase1.api_test',
        status: 'manual model probe',
        detail: 'Explicit operator-triggered API connectivity test for the configured OpenAI-compatible model. It reports success, failure, latency and redacted reply preview.',
        weight: 0.87,
        group: 'Real Phase 1 / API',
        io: {
          inputs: ['status_dialogue_api_probe.prompt', 'settings.chatProvider.config'],
          outputs: ['status_dialogue_model_test.v1', 'latency_ms', 'reply_preview.redacted'],
          refs: ['zhineng:status-dialogue:model:test']
        }
      },
      {
        id: 'real-phase1-openai-compatible-io',
        label: 'real_phase1.openai_io',
        status: 'api input/output',
        detail: 'The model adapter receives status context and operator query, then returns JSON for reply, voice line, attention notes, status refs and missing status.',
        weight: 0.86,
        group: 'Real Phase 1 / API',
        io: {
          inputs: ['status_snapshot.summary', 'focus_context', 'user_query'],
          outputs: ['reply', 'voiceText', 'thoughts', 'statusRefs', 'missingStatus'],
          refs: ['zhineng:status-dialogue:complete', 'parseStatusDialogueModelOutput']
        }
      },
      {
        id: 'real-phase1-fallback-guard',
        label: 'real_phase1.fallback_guard',
        status: 'fallback preserved',
        detail: 'If API key is missing, IPC is unavailable or the model call fails, the patrol window keeps local first-person fallback and text input available.',
        weight: 0.85,
        group: 'Real Phase 1 / API',
        io: {
          inputs: ['model_test_error', 'status_dialogue_complete_error'],
          outputs: ['local_first_person_patrol_fallback', 'visible_error_summary'],
          refs: ['guardStatusDialogueOutput', 'parseStatusDialogueModelOutput']
        }
      },
      {
        id: 'policy-identity-rules',
        label: 'policy.identity_rules',
        status: 'rule frozen',
        detail: 'Defines first-person subject identity, third-person audit mode and the rule that missing status must be named instead of guessed.',
        weight: 0.82,
        group: 'Dialogue Policy / Phase 6',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'identity_policy_gate',
        compass: 'status_dialogue.policy.identity_rules',
        io: {
          inputs: ['STATUS_DIALOGUE_SYSTEM_PROMPT', 'identity-response-rules.v1.md', 'dialogue-policy.v1.md'],
          outputs: ['persona decision', 'first_person_reply_rule', 'no_narrator_boundary'],
          refs: ['dialogue-policy.v1.md#主体身份规则', 'guardStatusDialogueOutput']
        }
      },
      {
        id: 'policy-intent-router',
        label: 'policy.intent_router',
        status: 'contract ready',
        detail: 'Routes text, speech transcripts, graph focus and memory into status patrol, progress audit, requirement alignment, voice control or error recovery lanes.',
        weight: 0.82,
        group: 'Dialogue Policy / Phase 6',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'intent_route_gate',
        compass: 'status_dialogue.policy.intent_router',
        io: {
          inputs: ['DialogueInputEnvelope', 'focused_graph_context', 'conversation_memory.v1'],
          outputs: ['DialoguePolicyDecision.intent_lane'],
          refs: ['deriveDialoguePolicyIntentLane', 'dialogue-policy.v1.md#意图路由规则']
        }
      },
      {
        id: 'policy-patrol-insertion',
        label: 'policy.patrol_insertion',
        status: 'converter ready',
        detail: 'Converts status snapshots, status cards, focused nebula nodes and runtime findings into patrol_finding_insert.v1 before they enter the dialogue.',
        weight: 0.84,
        group: 'Dialogue Policy / Phase 6',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'patrol_insert_gate',
        compass: 'status_dialogue.policy.patrol_insertion',
        io: {
          inputs: ['status_snapshot.v1', 'module_status_card.v1', 'focused_graph_context'],
          outputs: ['patrol_finding_insert.v1[]'],
          refs: ['buildPatrolFindingInsertsFromSnapshot', 'buildPatrolFindingInsertFromFocus']
        }
      },
      {
        id: 'policy-response-composer',
        label: 'policy.response_composer',
        status: 'prompt/fallback synced',
        detail: 'Keeps replies in the fixed order: conclusion, evidence, attention and next step. Text can be complete; voice stays compact.',
        weight: 0.82,
        group: 'Dialogue Policy / Phase 6',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'response_compose_gate',
        compass: 'status_dialogue.policy.response_composer',
        io: {
          inputs: ['DialoguePolicyDecision', 'patrol_finding_insert.v1[]', 'StatusDialogueOutput'],
          outputs: ['reply', 'voiceText', 'attention_log'],
          refs: ['buildStatusDialogueUserPrompt', 'buildStatusDialogueLocalResult']
        }
      },
      {
        id: 'policy-emotion-style',
        label: 'policy.emotion_style',
        status: 'mapped',
        detail: 'Maps ok, notice, warn, blocked, critical and voice runtime state into steady, focused, warm or urgent speech style hints.',
        weight: 0.76,
        group: 'Dialogue Policy / Phase 6',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'emotion_style_gate',
        compass: 'status_dialogue.policy.emotion_style',
        io: {
          inputs: ['patrol_finding_insert.v1.severity', 'StatusSnapshot.global_status', 'voice_runtime_state'],
          outputs: ['emotion_hint', 'XiaozhiStyleEmotion'],
          refs: ['deriveVoiceEmotionPriority', 'ttsPolicyFromSeverity']
        }
      },
      {
        id: 'policy-tts-opening',
        label: 'policy.tts_opening',
        status: 'voiceText only',
        detail: 'Selects the first TTS sentence, keeps one voice profile per turn and prevents full logs from being spoken.',
        weight: 0.8,
        group: 'Dialogue Policy / Phase 6',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'tts_opening_gate',
        compass: 'status_dialogue.policy.tts_opening',
        io: {
          inputs: ['voice_opening_policy.selected_first_sentence', 'StatusDialogueOutput.voiceText', 'voice_profile.v1'],
          outputs: ['selected_first_sentence', 'voice_response_plan.v1', 'voice_output_chunk.v1[]'],
          refs: ['buildStatusDialogueVoiceOpeningText', 'buildVoiceResponsePlan', 'segmentVoiceResponsePlan']
        }
      },
      {
        id: 'policy-fallback-guard',
        label: 'policy.fallback_guard',
        status: 'active',
        detail: 'Keeps text dialogue alive when model, IPC, STT, TTS or status cards fail. It reports the fallback path instead of silently failing.',
        weight: 0.82,
        group: 'Dialogue Policy / Phase 6',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'fallback_guard_gate',
        compass: 'status_dialogue.policy.fallback_guard',
        io: {
          inputs: ['model_error', 'ipc_error', 'stt_error', 'tts_error', 'status_read_error'],
          outputs: ['fallback decision', 'visible boundary note', 'local_first_person_patrol_fallback'],
          refs: ['guardStatusDialogueOutput', 'parseStatusDialogueModelOutput']
        }
      },
      {
        id: 'policy-xiaozhi-state-machine',
        label: 'policy.xiaozhi_state_machine',
        status: 'route A mapped',
        detail: 'Maps idle, wake/listen, stt, llm, tts, playing and complete/error into the desktop virtual device bridge. It does not bind ESP32 or OTA.',
        weight: 0.8,
        group: 'Dialogue Policy / Phase 6',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'voice_bridge_gate',
        compass: 'status_dialogue.policy.xiaozhi_state_machine',
        io: {
          inputs: ['xiaozhi_style_voice_bridge_event.v1', 'xiaozhi_style_voice_bridge_state.v1', 'tts_playback_state'],
          outputs: ['policy.xiaozhi_state_machine.current_stage', 'bridge_state', 'wake_detector_pause_only'],
          refs: ['buildXiaozhiStyleDialoguePolicyMapping', 'reduceXiaozhiStyleVoiceBridgeEvent']
        }
      },
      {
        id: 'policy-boundary-gate',
        label: 'policy.boundary_gate',
        status: 'patrol-only default',
        detail: 'Prevents direct world-model mutation, external action execution and guessed missing status. Requirement packets remain a future confirmed handoff path.',
        weight: 0.86,
        group: 'Dialogue Policy / Phase 6',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'boundary_guard_gate',
        compass: 'status_dialogue.policy.boundary_gate',
        io: {
          inputs: ['DialoguePolicyDecision.mode', 'DEFAULT_STATUS_DIALOGUE_CONFIG', 'user_confirmation'],
          outputs: ['boundary_notes', 'requirement_write_allowed=false by default'],
          refs: ['dialogue-policy.v1.md#边界与禁止行为', 'world_model_requirement_inbox']
        }
      },
      {
        id: 'policy-io-contract',
        label: 'policy.io_contract',
        status: 'contract ready',
        detail: 'Defines the policy input/output surface: DialogueInputEnvelope, status_snapshot, patrol inserts and DialoguePolicyDecision.',
        weight: 0.82,
        group: 'Dialogue Policy / Phase 6',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'policy_contract_gate',
        compass: 'status_dialogue.policy.io_contract',
        io: {
          inputs: ['DialogueInputEnvelope', 'status_snapshot.v1', 'module_status_card.v1', 'conversation_memory.v1'],
          outputs: ['DialoguePolicyDecision', 'patrol_finding_insert.v1', 'status_refs', 'missing_status'],
          refs: ['dialogue-policy.ts', 'dialogue-policy.v1.md#验证规则']
        }
      },
      { id: 'global-state-scan', label: 'global_state_scan', status: '全局状态巡检', detail: '读取所有星云模块、内容星点、焦点层级和运行叠加态，优先返回最小必要状态。', weight: 0.94 },
      { id: 'subsystem-status-index', label: 'subsystem_status_index', status: '子系统索引', detail: '把每个子系统和子模块映射成可问答、可过滤、可聚焦的状态索引。', weight: 0.9 },
      { id: 'module-health-probe', label: 'module_health_probe', status: '模块健康探针', detail: '检查模块是否存在、是否有负责闸口、是否有状态说明和拓扑位置。', weight: 0.88 },
      { id: 'model-adapter', label: 'model_adapter', status: '模型接入位', detail: '预留模型对话适配器，输入为状态索引和用户问题，输出为只读解释。', weight: 0.84 },
      { id: 'small-model-ipc-adapter', label: 'small_model_ipc_adapter', status: '第三方小模型端口', detail: 'Renderer 将状态上下文交给 Electron 主进程，由主进程调用当前配置的 OpenAI-compatible 小模型。', weight: 0.88 },
      { id: 'first-person-prompt-contract', label: 'first_person_prompt_contract', status: '第一人称提示词契约', detail: '强制模型输出 reply、voice、thoughts JSON；回答以“我”作为系统主体，而不是旁白解读。', weight: 0.9 },
      { id: 'input-port-user-query', label: 'input_port.user_query', status: '输入端口', detail: '用户文字问询，可查询状态、接口、边界、风险、当前焦点或模块名称。', weight: 0.82 },
      { id: 'input-port-focus-context', label: 'input_port.focus_context', status: '输入端口', detail: '当前粒子焦点、层级、owner、gate、compass、状态、详情、子节点数量和全局数量。', weight: 0.88 },
      { id: 'output-port-first-person-reply', label: 'output_port.first_person_reply', status: '输出端口', detail: '对话框展示的最短有效第一人称回答。', weight: 0.9 },
      { id: 'output-port-voice-line', label: 'output_port.voice_line', status: '输出端口', detail: '语音合成使用的更短第一人称句子。', weight: 0.84 },
      { id: 'output-port-attention-log', label: 'output_port.attention_log', status: '输出端口', detail: '展示焦点、边界、风险和下一检查点的关注摘要，不展示隐藏推理链。', weight: 0.86 },
      { id: 'constraint-no-narrator', label: 'constraint.no_narrator', status: '风格约束', detail: '模块必须以系统主体的“我”回复，不作为第三方旁白描述系统。', weight: 0.88 },
      { id: 'constraint-minimal-voice', label: 'constraint.minimal_voice', status: '语音约束', detail: '语音输出必须短、实时、第一人称，不允许长篇报告式播报。', weight: 0.84 },
      { id: 'constraint-no-hidden-cot', label: 'constraint.no_hidden_cot', status: '推理边界', detail: '面板只展示可审计关注点摘要，不展示模型隐藏思维链。', weight: 0.82 },
      { id: 'fallback-local-status', label: 'fallback.local_status', status: '回退路径', detail: '没有模型密钥、没有 Electron IPC 或模型失败时，继续使用本地只读状态回退。', weight: 0.84 },
      { id: 'awareness-layer-bridge', label: 'awareness_layer_bridge', status: '意识层接入位', detail: '把主体状态、自我风格、目标权重和安全范围作为对话上下文。', weight: 0.88 },
      { id: 'self-awareness-style', label: 'self_awareness_style', status: '自我意识风格', detail: '支持第一人称主体表达和第三人称系统解释，保持同一事实状态。', weight: 0.86 },
      { id: 'first-person-voice', label: 'first_person_voice', status: '第一人称语音', detail: '以“我”的主体口吻输出状态说明，适合运行态自述。', weight: 0.78 },
      { id: 'third-person-voice', label: 'third_person_voice', status: '第三人称语音', detail: '以“系统”的客观口吻输出状态说明，适合审查和交接。', weight: 0.78 },
      { id: 'text-input', label: 'text_input', status: '文字输入', detail: '接收用户状态查询、模块名称、风险词和接口边界问题。', weight: 0.82 },
      { id: 'text-output', label: 'text_output', status: '文字输出', detail: '返回简短状态、焦点模块、负责闸口、边界和下一步可检查项。', weight: 0.86 },
      {
        id: 'voice-stt-adapter',
        label: 'voice.stt_adapter',
        status: 'cloud Chrome STT adapter',
        detail: '可替换语音输入插件入口，当前默认通过 Chrome STT Bridge 进行云端语音转文字；本地 Whisper 保留为手动切换 fallback，不保存音频样本。',
        weight: 0.84,
        io: {
          inputs: ['microphone_permission_prompt', 'chrome_stt_audio_stream', 'local_whisper_audio_stream'],
          outputs: ['cloud_speech_transcript', 'local_speech_transcript_fallback', 'DialogueInputEnvelope.input_kind=speech_transcript'],
          refs: ['zhineng:status-dialogue:chrome-stt:transcribe', 'zhineng:status-dialogue:stt:transcribe']
        }
      },
      {
        id: 'voice-tts-adapter',
        label: 'voice.tts_adapter',
        status: 'CosyVoice locked + chunk queue',
        detail: '可替换语音输出插件入口。当前所有可听语音锁定到同一个 CosyVoice voice_profile，按 voice_output_chunk.v1 分句合成并进入播放队列；浏览器 SpeechSynthesis 不再作为可听混音 fallback，失败时保留文字和可见错误。',
        weight: 0.84,
        io: {
          inputs: ['StatusDialogueOutput.voiceText', 'voice_profile.v1', 'voice_output_chunk.v1', 'statusDialogueTts.cosyVoice'],
          outputs: ['cosyvoice_audio_output', 'voice_playback_queue.v1', 'voice_latency_trace.v1', 'voice_output_trace.v1'],
          refs: ['zhineng:status-dialogue:tts:synthesize', 'segmentVoiceResponsePlan', 'playVoicePlanThroughQueue']
        }
      },
      {
        id: 'voice-profile-slot',
        label: 'voice.voice_profile',
        status: 'CosyVoice audible lock',
        detail: '默认可听音色为 voice.cosyvoice.local.default。页面仍可读取浏览器 voice list 作为候选显示，但 audibleVoiceProfile 会锁定到 CosyVoice，保证 ACK、正文、提醒和完成播报同音色。',
        weight: 0.76,
        io: {
          inputs: ['DEFAULT_COSYVOICE_VOICE_PROFILE', 'selected_voice_profile_id.page_state'],
          outputs: ['audible_voice_profile.v1=voice.cosyvoice.local.default', 'voice_profile_lock.visible_state'],
          refs: ['resolveAudibleVoiceProfile', 'selectVoiceProfileFallback']
        }
      },
      {
        id: 'voice-clone-profile-slot',
        label: 'voice.clone_profile',
        status: 'metadata only',
        detail: '克隆声音第一阶段只表达 profile 元数据和状态位；当前不加载、不训练、不保存原始音频样本。',
        weight: 0.72,
        io: {
          inputs: ['clone_profile_config_ref.future'],
          outputs: ['clone_profile.v1.status=not_configured', 'voice_profile.clone_profile_id=null'],
          refs: ['DEFAULT_UNCONFIGURED_CLONE_PROFILE', 'clone_profile.v1']
        }
      },
      {
        id: 'voice-response-plan',
        label: 'voice.voice_response_plan',
        status: 'chunked output plan',
        detail: '每次语音输出先生成 voice_response_plan.v1，再拆成 voice_output_chunk.v1，记录文本、音色、adapter、情绪、缓存键和播放队列边界。',
        weight: 0.74,
        io: {
          inputs: ['StatusDialogueOutput.voiceText', 'selected_voice_profile.v1'],
          outputs: ['voice_response_plan.v1', 'voice_output_chunk.v1[]'],
          refs: ['buildVoiceResponsePlan', 'segmentVoiceResponsePlan']
        }
      },
      {
        id: 'voice-playback-queue',
        label: 'voice.playback_queue',
        status: 'chunk queue active',
        detail: '播放队列顺序处理 ACK、最终回复和完成提醒，记录 queued/completed/failed/cache，并在新会话开始时打断旧播放，避免遗漏、重叠和重复。',
        weight: 0.78,
        io: {
          inputs: ['voice_output_chunk.v1[]', 'cosyvoice_audio_output', 'voice_audio_cache.memory'],
          outputs: ['voice_playback_queue.v1', 'voice_latency_trace.v1', 'xiaozhi_style_voice_bridge.tts_*'],
          refs: ['playVoicePlanThroughQueue', 'playVoiceAudioChunk', 'buildVoiceLatencyTrace']
        }
      },
      {
        id: 'voice-streaming-tts-reserved',
        label: 'voice.streaming_tts_adapter',
        status: 'buffered frame adapter',
        detail: '真流式 TTS adapter 已具备通用 buffered frame 实现：任意 TTS 返回的 audio base64 可被切分为 streaming_tts_audio_frame.v1 帧流；未来可替换为 WebSocket、SSE 或 chunked HTTP 的原生音频帧，不绑定单一工具。',
        weight: 0.66,
        io: {
          inputs: ['streaming_tts_adapter.v1', 'voice_output_chunk.v1', 'voice_profile.v1'],
          outputs: ['streaming_tts_audio_frame.v1[]', 'audio_frame_stream.v1'],
          refs: ['createBufferedStreamingTtsAdapter', 'splitAudioBase64IntoStreamingFrames', 'RESERVED_STREAMING_TTS_ADAPTER']
        }
      },
      {
        id: 'voice-tts-runtime-policy',
        label: 'voice.tts_runtime_policy',
        status: 'runtime readiness gate',
        detail:
          'Maps streaming TTS runtime evidence into an operator-visible policy: cached primary path, transport-only experiment, live dialogue candidate, or non-realtime high-quality voice. It prevents native streaming transport from being mistaken for low-latency dialogue readiness.',
        weight: 0.67,
        io: {
          inputs: ['tts_streaming_adapter_runtime_assessment.v1', 'streaming_tts_audio_frame.v1', 'voice_latency_trace.v1.first_frame_ms'],
          outputs: ['status_dialogue_tts_runtime_policy.v1', 'operator_visible_tts_path', 'voice_mode_recommendation'],
          refs: ['assessTtsRuntimePolicy', 'TTS_RUNTIME_POLICY_THRESHOLDS', 'voiceOutputMode']
        }
      },
      {
        id: 'voice-tts-adapter-candidates',
        label: 'voice.tts_adapter_candidates',
        status: 'replaceable adapter slots',
        detail:
          'Defines replaceable TTS runtime candidates without binding the patrol dialogue to one vendor: CosyVoice high-quality cache, OpenAI-compatible streaming HTTP, and custom streaming TTS HTTP. Only configured candidates that meet first-audio budget can become the live dialogue primary path.',
        weight: 0.65,
        io: {
          inputs: ['status_dialogue_tts_runtime_candidate.v1[]', 'voice_profile.v1', 'status_dialogue_tts_runtime_policy.v1'],
          outputs: ['selected_tts_runtime_candidate', 'live_dialogue_primary_candidate', 'cache_or_clone_voice_candidate'],
          refs: ['buildDefaultStatusDialogueTtsRuntimeCandidates', 'selectStatusDialogueTtsRuntimeCandidate']
        }
      },
      {
        id: 'voice-live-pcm-playback',
        label: 'voice.live_pcm_playback',
        status: 'experimental live output',
        detail: 'Explicit experiment mode only. It requests response_format=pcm with skip_cache=true, decodes PCM16 frames, and schedules them through WebAudio without switching the default voice output mode.',
        weight: 0.63,
        io: {
          inputs: ['streaming_tts_audio_frame.v1(audio/pcm)', 'voice_output_chunk.v1', 'AudioContext'],
          outputs: ['WebAudio scheduled buffers', 'voice_latency_trace.v1.first_frame_ms', 'voice_playback_queue.v1'],
          refs: ['playVoiceLivePcmStreamChunk', 'decodePcm16LeMonoBase64', 'COSYVOICE_STREAM_PCM_SAMPLE_RATE']
        }
      },
      {
        id: 'voice-output-trace',
        label: 'voice.output_trace',
        status: 'latest trace',
        detail: '记录最近一次 CosyVoice 分块输出结果：ready、spoken、skipped、fallback 或 error；同时由 voice_latency_trace.v1 补充首句、总合成和播放耗时。',
        weight: 0.72,
        io: {
          inputs: ['voice_response_plan.v1', 'voice_output_chunk.v1', 'HTMLAudioElement events'],
          outputs: ['voice_output_trace.v1', 'voice_latency_trace.v1'],
          refs: ['buildVoiceOutputTrace', 'buildVoiceLatencyTrace']
        }
      },
      {
        id: 'voice-completion-notice',
        label: 'voice.completion_notice',
        status: 'task completion broadcast',
        detail:
          '把“任务完成后播报”从临时 TTS 调用提升为可执行状态机：queued/playing/spoken/fallback/error。当前复用 CosyVoice 分块队列和同音色锁定，不保存音频，不影响普通对话输入。',
        weight: 0.73,
        io: {
          inputs: ['completion_notice.v1.text', 'selected_voice_profile.v1', 'task_completion_event'],
          outputs: ['deterministic_completion_broadcast', 'voice_output_trace.v1', 'visible_completion_notice_status'],
          refs: ['buildVoiceResponsePlan', 'buildVoiceOutputTrace', 'zhineng:status-dialogue:tts:synthesize']
        }
      },
      {
        id: 'voice-event-broadcast-ingress',
        label: 'voice.event_broadcast_ingress',
        status: 'module_status_event reader',
        detail: 'Reads summary-only module_status_event.v1 files from runtime/status-events and keeps the path read-only inside the project root.',
        weight: 0.78,
        group: 'Voice Event Broadcast / SCHEME-0007',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'status_event_read_only_gate',
        compass: 'status_dialogue.voice.event_broadcast_ingress',
        io: {
          inputs: ['runtime/status-events/*.json', 'ExpectedStatusEventPublisher[]'],
          outputs: ['SystemEventSnapshotReadResult', 'system_event_snapshot.v1'],
          refs: ['zhineng:status-dialogue:events:get', 'DEFAULT_STATUS_DIALOGUE_EVENT_DIR']
        }
      },
      {
        id: 'voice-event-snapshot',
        label: 'voice.system_event_snapshot',
        status: 'event snapshot active',
        detail: 'Aggregates fresh, stale, duplicate, missing publisher and read error signals before dialogue and TTS see them.',
        weight: 0.77,
        group: 'Voice Event Broadcast / SCHEME-0007',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'event_snapshot_gate',
        compass: 'status_dialogue.voice.system_event_snapshot',
        io: {
          inputs: ['module_status_event.v1[]', 'expected_publishers', 'ttl_ms'],
          outputs: ['system_event_snapshot.v1', 'patrol_findings[]'],
          refs: ['buildSystemEventSnapshot', 'SystemEventSnapshot']
        }
      },
      {
        id: 'voice-event-priority-gate',
        label: 'voice.priority_gate',
        status: 'weight router',
        detail: 'Maps critical, blocked, warn, notice and info events to interrupt, after-current-sentence, merge, idle reminder or silent decisions.',
        weight: 0.76,
        group: 'Voice Event Broadcast / SCHEME-0007',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'broadcast_priority_gate',
        compass: 'status_dialogue.voice.priority_gate',
        io: {
          inputs: ['ModuleStatusEvent.severity', 'recommended_broadcast', 'VoiceEventDialogueState'],
          outputs: ['VoiceEventBroadcastWeight', 'VoiceEventPlayMode'],
          refs: ['deriveVoiceEventBroadcastWeight', 'deriveVoiceEventPlayMode']
        }
      },
      {
        id: 'voice-event-broadcast-queue',
        label: 'voice.broadcast_queue',
        status: 'visible queue',
        detail: 'Exposes queued, critical, high, normal, low and silent counts in the right-side patrol window and reuses the locked TTS queue for playback.',
        weight: 0.78,
        group: 'Voice Event Broadcast / SCHEME-0007',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'voice_broadcast_queue_gate',
        compass: 'status_dialogue.voice.broadcast_queue',
        io: {
          inputs: ['voice_event_broadcast_request.v1[]', 'voice_script_patch.v1[]'],
          outputs: ['voice_broadcast_queue_state.v1', 'visible_event_queue_panel'],
          refs: ['buildVoiceBroadcastQueueState', 'replayVoiceEventBroadcastQueue']
        }
      },
      {
        id: 'voice-event-script-composer',
        label: 'voice.script_composer',
        status: 'script patch ready',
        detail: 'Turns event requests into natural first-person voice_script_patch.v1 lines instead of reading raw logs or source payloads.',
        weight: 0.77,
        group: 'Voice Event Broadcast / SCHEME-0007',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'voice_script_compose_gate',
        compass: 'status_dialogue.voice.script_composer',
        io: {
          inputs: ['voice_event_broadcast_request.v1', 'module_status_event.v1'],
          outputs: ['voice_script_patch.v1', 'voiceText event prefix'],
          refs: ['buildVoiceScriptPatch', 'buildVoiceEventBroadcastSpeechText']
        }
      },
      {
        id: 'voice-event-interrupt-resume',
        label: 'voice.interrupt_resume',
        status: 'priority playback policy',
        detail: 'Keeps critical events eligible for interrupt_now while high events wait for the current sentence and normal events merge into the reply.',
        weight: 0.74,
        group: 'Voice Event Broadcast / SCHEME-0007',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'voice_interrupt_resume_gate',
        compass: 'status_dialogue.voice.interrupt_resume',
        io: {
          inputs: ['VoiceEventPlayMode', 'voicePlaybackQueueState', 'xiaozhi_style_voice_bridge_state.v1'],
          outputs: ['interrupt_now', 'after_current_sentence', 'merge_into_current_reply'],
          refs: ['deriveVoiceEventPlayMode', 'playVoicePlanThroughQueue']
        }
      },
      {
        id: 'voice-event-trace',
        label: 'voice.event_trace',
        status: 'trace visible',
        detail: 'Shows the latest automatic or manual event broadcast trace, replay count, failure summary and source route in the settings panel.',
        weight: 0.74,
        group: 'Voice Event Broadcast / SCHEME-0007',
        owner: 'Subject Status Dialogue Runtime',
        gate: 'voice_event_trace_gate',
        compass: 'status_dialogue.voice.event_trace',
        io: {
          inputs: ['voice_output_trace.v1', 'voice_latency_trace.v1', 'voice_broadcast_queue_state.v1'],
          outputs: ['visible_event_broadcast_trace', 'voice_event_broadcast_auto_playback_complete'],
          refs: ['VoiceEventBroadcastPanelState', 'logStatusDialogueVoiceEvent']
        }
      },
      {
        id: 'runtime-feedback-router',
        label: 'runtime.feedback_router',
        status: 'manifest gated',
        detail: 'Defines the future onboarding route: every new system must publish both a status card and a status event outlet before patrol can claim live feedback.',
        weight: 0.76,
        group: 'Voice Event Broadcast / SCHEME-0007',
        owner: 'Runtime Integration',
        gate: 'system_feedback_route_gate',
        compass: 'status_dialogue.runtime.feedback_router',
        io: {
          inputs: ['system_feedback_route_manifest.v1', 'module_status_card.v1', 'module_status_event.v1'],
          outputs: ['publisher readiness', 'missing publisher patrol finding'],
          refs: ['validateSystemFeedbackRouteManifest', 'system_feedback_route_manifest.v1']
        }
      },
      {
        id: 'runtime-module-event-contract',
        label: 'runtime.module_event_contract',
        status: 'event outlet required',
        detail: 'Documents the module_status_event.v1 outlet for completion, progress, system change, nebula change, risk, fault and confirmation events.',
        weight: 0.75,
        group: 'Voice Event Broadcast / SCHEME-0007',
        owner: 'Runtime Integration',
        gate: 'module_event_contract_gate',
        compass: 'status_dialogue.runtime.module_event_contract',
        io: {
          inputs: ['module runtime summary', 'gate', 'compass', 'severity mapping'],
          outputs: ['module_status_event.v1'],
          refs: ['normalizeModuleStatusEvent', 'ModuleStatusEvent']
        }
      },
      {
        id: 'system-feedback-route-manifest',
        label: 'system_feedback_route_manifest.v1',
        status: 'onboarding checklist',
        detail: 'The future mandatory checklist for new systems: owner, gate, compass, card output, event output, TTL, severity mapping, broadcast policy, privacy boundary and fallback.',
        weight: 0.76,
        group: 'Voice Event Broadcast / SCHEME-0007',
        owner: 'Runtime Integration',
        gate: 'system_feedback_manifest_gate',
        compass: 'status_dialogue.runtime.system_feedback_route_manifest',
        io: {
          inputs: ['new system onboarding metadata'],
          outputs: ['SystemFeedbackRouteManifestValidationResult'],
          refs: ['SYSTEM_FEEDBACK_ROUTE_MANIFEST_SCHEMA', 'buildDefaultSystemFeedbackRouteManifest']
        }
      },
      { id: 'speech-synthesis', label: 'speech_synthesis', status: 'legacy capability only', detail: '浏览器语音合成仅作为环境能力检测，不再作为当前可听输出路径；真实播报走 CosyVoice 分块队列。', weight: 0.62 },
      {
        id: 'voice-dialogue',
        label: 'voice_dialogue',
        status: 'speech roundtrip',
        detail: '语音识别得到 transcript 后进入同一条状态对话路径，回复仍由文字和 voiceText 双通道输出。',
        weight: 0.78,
        io: {
          inputs: ['speech_transcript', 'focused_graph_context', 'status_snapshot.v1'],
          outputs: ['first_person_reply', 'voiceText', 'attention_log'],
          refs: ['submitDialogue(inputKind=speech_transcript)', 'zhineng:status-dialogue:complete']
        }
      },
      {
        id: 'voice-xiaozhi-style-bridge',
        label: 'voice.xiaozhi_style_bridge',
        status: 'route A virtual device bridge',
        detail: '借鉴小智语音机器人的会话数据流，把右下角主体状态对话框视为虚拟设备端，记录 hello、listen、stt、llm、tts、abort 和 emotion 事件；不接入 ESP32 烧录、OTA 或真实硬件绑定。',
        weight: 0.8,
        io: {
          inputs: ['chrome_stt_bridge_progress', 'local_whisper_status', 'StatusDialogueOutput.voiceText', 'voice_latency_state'],
          outputs: ['xiaozhi_style_voice_bridge_event.v1', 'xiaozhi_style_voice_bridge_state.v1', 'visible_bridge_status'],
          refs: ['createXiaozhiStyleVoiceBridgeEvent', 'reduceXiaozhiStyleVoiceBridgeEvent', 'zhineng:status-dialogue:voice-log']
        }
      },
      {
        id: 'voice-wake-word-gate',
        label: 'voice.wake_word_gate',
        status: 'W3 browser phrase gate',
        detail:
          '唤醒词与持续监听配置骨架，当前 W3.0 可通过右下角 GUI 手动开启 browser phrase detector；候选短语为“小张/高手/小天才”。TTS 播放期间只暂停唤醒词 detector，不屏蔽整条输入链路。',
        weight: 0.76,
        io: {
          inputs: ['operator_w3_toggle', 'manual_stt_button', 'tts_playing_state'],
          outputs: ['xiaozhi_style_wake_config.v1', 'wake_window_open', 'voice_input_mode=wake_word_when_enabled'],
          refs: ['DEFAULT_XIAOZHI_STYLE_WAKE_CONFIG', 'voice-dialogue-xiaozhi-style-bridge-plan.v1.md']
        }
      },
      {
        id: 'voice-wake-detector-adapter',
        label: 'voice.wake_detector_adapter',
        status: 'W3 browser phrase loop',
        detail:
          'W3.0 使用 renderer Browser SpeechRecognition 做短语匹配闭环，命中“小张/高手/小天才”后打开 wake window 并交给现有 STT。该实现独立维护 detector 状态；后续本地 keyword detector 可替换此 adapter。',
        weight: 0.75,
        io: {
          inputs: ['xiaozhi_style_wake_config.v1', 'browser_phrase_match_audio', 'tts_playback_state'],
          outputs: ['xiaozhi_style_wake_detector_adapter.v1', 'xiaozhi_style_wake_detector_state.v1', 'wake_detected_event'],
          refs: ['DEFAULT_XIAOZHI_STYLE_WAKE_DETECTOR_ADAPTER_CONFIG', 'buildDefaultXiaozhiStyleWakeDetectorState']
        }
      },
      {
        id: 'voice-vad-precheck',
        label: 'voice.vad_precheck',
        status: 'W2 local precheck',
        detail: '短时打开麦克风进行 WebAudio RMS/VAD 预检，只判断是否有人声活动；不保存原始音频、不提交 transcript、不触发模型对话。',
        weight: 0.74,
        io: {
          inputs: ['navigator.mediaDevices.getUserMedia', 'AudioContext.AnalyserNode', 'rms_threshold'],
          outputs: ['xiaozhi_style_vad_precheck.v1', 'voice_detected_or_silence', 'dialogue_triggered=false'],
          refs: ['buildXiaozhiStyleVadPrecheckState', 'runVadPrecheck']
        }
      },
      {
        id: 'conversation-memory-active-goal',
        label: 'memory.active_goal',
        status: 'current goal',
        detail: 'Keeps the active goal that should steer the next answer, such as voice loop stability, patrol inspection or 3D OS traceability.',
        weight: 0.78,
        group: 'Conversation Memory / Goal State',
        io: {
          inputs: ['latest_user_intent', 'previous_active_goal'],
          outputs: ['active_goal'],
          refs: ['conversation_memory_card.v1.active_goal']
        }
      },
      {
        id: 'conversation-memory-user-focus',
        label: 'memory.user_focus',
        status: 'attention compass',
        detail: 'Keeps the user focus as compact tags: result first, target first, low latency, status patrol, 3D traceability and clear boundaries.',
        weight: 0.76,
        group: 'Conversation Memory / Goal State',
        io: {
          inputs: ['user_query_keywords', 'previous_user_focus'],
          outputs: ['user_focus[]'],
          refs: ['conversation_memory_card.v1.user_focus']
        }
      },
      {
        id: 'conversation-memory-confirmed-results',
        label: 'memory.confirmed_results',
        status: 'verified facts',
        detail: 'Keeps only compact confirmed results from the current focus, snapshot and model output. Temporary logs and technical noise are excluded.',
        weight: 0.76,
        group: 'Conversation Memory / Goal State',
        io: {
          inputs: ['focus_context', 'status_snapshot.summary', 'result_summary'],
          outputs: ['confirmed_facts[]'],
          refs: ['conversation_memory_card.v1.confirmed_facts']
        }
      },
      {
        id: 'conversation-memory-open-questions',
        label: 'memory.open_questions',
        status: 'unresolved items',
        detail: 'Keeps missing status, unresolved risks or questions that should remain visible in the next patrol response.',
        weight: 0.72,
        group: 'Conversation Memory / Goal State',
        io: {
          inputs: ['missingStatus[]', 'result.error'],
          outputs: ['open_questions[]', 'missing_status[]'],
          refs: ['conversation_memory_card.v1.open_questions']
        }
      },
      {
        id: 'conversation-memory-next-result',
        label: 'memory.next_expected_result',
        status: 'next answer direction',
        detail: 'Keeps the next expected result so short follow-ups such as continue can stay aligned with the active goal.',
        weight: 0.74,
        group: 'Conversation Memory / Goal State',
        io: {
          inputs: ['active_goal', 'latest_user_intent'],
          outputs: ['next_expected_result'],
          refs: ['conversation_memory_card.v1.next_expected_result']
        }
      },
      {
        id: 'conversation-memory-storage-boundary',
        label: 'memory.storage_boundary',
        status: 'local only',
        detail: 'Stores the memory card in renderer localStorage only. It does not write the world model, social graph, event graph, raw audio or hidden reasoning.',
        weight: 0.74,
        group: 'Conversation Memory / Goal State',
        io: {
          inputs: ['conversation_memory_card.v1'],
          outputs: ['localStorage scoped card'],
          refs: ['STATUS_DIALOGUE_CONVERSATION_MEMORY_STORAGE_KEY']
        }
      },
      { id: 'conversation-memory', label: 'conversation_memory', status: '短上下文', detail: '保留本窗口内最近状态问答，用于追问同一焦点模块。', weight: 0.78 },
      { id: 'retrieval-router', label: 'retrieval_router', status: '状态检索路由', detail: '按模块、星点、闸口、负责方和关键词从粒子拓扑读取状态。', weight: 0.84 },
      { id: 'tool-function-calling', label: 'tool_function_calling', status: '工具调用能力位', detail: '未来可接入只读检查工具；写入、发送和外部动作仍走行动层与安全末端。', weight: 0.78 },
      { id: 'multimodal-dialogue-slot', label: 'multimodal_dialogue_slot', status: '多模态对话位', detail: '预留屏幕、图像、文档和网络状态输入的问答上下文。', weight: 0.76 },
      { id: 'efficiency-first-cache', label: 'efficiency_first_cache', status: '效率优先缓存', detail: '对高频状态摘要做轻量缓存，避免每次问答重扫完整运行面。', weight: 0.86 },
      { id: 'state-only-boundary', label: 'state_only_boundary', status: '只读边界', detail: '当前对话系统只检查状态和解释边界，不触发外部执行。', weight: 0.92 }
    ]
  },
  {
    id: 'visual-os',
    label: '三维粒子操作层',
    kind: 'visual',
    status: '视觉操作面',
    detail: '负责观察、下钻、比较、模拟、选择和发出操作意图；不是事实源，也不直接执行外部动作。',
    color: 0x67e8f9,
    weight: 0.96,
    importance: 0.95,
    layer: 0,
    owner: 'Visual World Operating Layer',
    gate: 'visual_operation_gate',
    compassPrefix: 'visual_os',
    stars: [
      { id: 'global-universe-view', label: '全局宇宙', status: '默认层级', detail: '显示所有图谱域、运行态和风险态。', weight: 0.9 },
      { id: 'domain-view', label: '图谱域', status: '第二层级', detail: '人际、事件、任务、知识、物体、自我、能力、预测、安全和反馈。', weight: 0.88 },
      { id: 'nebula-cluster-view', label: '云团', status: '第三层级', detail: '同一类型、目标、时间窗口或因果链的节点集合。', weight: 0.86 },
      { id: 'entity-cluster-view', label: '子实体簇', status: '第四层级', detail: '人物群组、事件链、能力组合、预测分支、任务阶段。', weight: 0.82 },
      { id: 'single-entity-view', label: '单实体', status: '第五层级', detail: '人物、事件、能力、变量、预测、策略或行动。', weight: 0.82 },
      { id: 'attribute-evidence-view', label: '属性与证据', status: '第六层级', detail: '来源、证据、状态、历史、风险和下一步。', weight: 0.86 },
      { id: 'observe-mode', label: 'observe', status: '观察模式', detail: '默认观察，不产生系统动作。', weight: 0.78 },
      { id: 'inspect-mode', label: 'inspect', status: '检视模式', detail: '查看节点详情、证据、状态和来源。', weight: 0.8 },
      { id: 'drill-down-mode', label: 'drill_down', status: '下钻模式', detail: '进入下一层图谱。', weight: 0.84 },
      { id: 'compare-mode', label: 'compare', status: '比较模式', detail: '比较人物、事件、能力或预测分支。', weight: 0.78 },
      { id: 'simulate-mode', label: 'simulate', status: '模拟模式', detail: '进入虚拟推演或反事实分支。', weight: 0.8 },
      { id: 'compose-mode', label: 'compose', status: '拼接模式', detail: '对能力切片生成拼接候选。', weight: 0.78 },
      { id: 'handoff-mode', label: 'handoff', status: '交接模式', detail: '打开现有人际辅助模块或下游执行模块。', weight: 0.8 },
      { id: 'review-mode', label: 'review', status: '审查模式', detail: '查看风险、安全范围和审计记录。', weight: 0.8 }
    ]
  },
  {
    id: 'projection-contracts',
    label: '投影与意图契约',
    kind: 'visual',
    status: '接口契约层',
    detail: 'graph_projection_vnext 和 visual_operation_intent.v1 的字段、叠加层、操作 affordance 和来源约束。',
    color: 0x60a5fa,
    weight: 0.94,
    importance: 0.93,
    layer: 0.06,
    owner: 'Projection and Intent Contract',
    gate: 'contract_schema_gate',
    compassPrefix: 'projection_contract',
    stars: [
      { id: 'projection-id', label: 'projection_id', status: '投影标识', detail: '每次投影的唯一 id。', weight: 0.72 },
      { id: 'projection-scope', label: 'scope', status: 'mock/read_only_adapter/live_runtime', detail: '区分 mock、只读适配和实时运行态。', weight: 0.82 },
      { id: 'projection-domains', label: 'domains', status: '图谱域', detail: '登记所有世界系统域。', weight: 0.84 },
      { id: 'projection-clusters', label: 'clusters', status: '云团', detail: '域内聚合、层级和空间定位。', weight: 0.84 },
      { id: 'projection-nodes', label: 'nodes', status: '节点', detail: '事实、候选、预测、能力、动作和反馈节点。', weight: 0.9 },
      { id: 'projection-edges', label: 'edges', status: '边', detail: '关系、影响、依赖、因果、参与、证据引用。', weight: 0.88 },
      { id: 'runtime-overlays', label: 'runtime_overlays', status: '叠加层', detail: '运行态、风险、预测、沙盒、反馈叠加。', weight: 0.86 },
      { id: 'operation-affordances', label: 'operation_affordances', status: '可操作能力', detail: '节点允许 inspect、drill_down、compare、simulate、compose、handoff、review 等操作。', weight: 0.86 },
      { id: 'projection-source-refs', label: 'source_refs', status: '来源引用', detail: '投影必须保留来源引用。', weight: 0.9 },
      { id: 'projection-warnings', label: 'projection_warnings', status: '投影警告', detail: '缺来源、候选态、预测态或闸口不满足时必须可见。', weight: 0.84 },
      { id: 'expert-particle-projection', label: 'expert_particle_projection.v1', status: '专家粒子映射', detail: '把专家强度、主专家、API 模式和边界策略映射为可聚焦粒子节点与审计提示。', weight: 0.88 },
      { id: 'intent-target-refs', label: 'intent target_refs/context_refs', status: '意图目标', detail: '视觉操作意图必须保存目标和上下文引用。', weight: 0.82 },
      { id: 'execution-mode', label: 'execution_mode', status: 'visual_only/sandbox_candidate/handoff', detail: '区分纯视觉、沙盒候选和现有模块交接。', weight: 0.84 }
    ]
  },
  {
    id: 'entity-work-nodes',
    label: '实体工作节点',
    kind: 'action',
    status: '实体业务项目目录',
    detail: '承载可落地实体业务项目的只读工作星云；当前接入跨境电商 AI 自动化通路理论方案，等待用户确认后再进入运行态实现。',
    color: 0xfacc15,
    weight: 0.92,
    importance: 0.91,
    layer: 0.16,
    owner: 'Entity Work Node Adapter',
    gate: 'entity_work_project_confirmation_gate',
    compassPrefix: 'entity_work_nodes',
    stars: [
      {
        id: 'cross-border-ecommerce-ai-route',
        label: '跨境电商通路',
        status: 'theory_design_only',
        detail: '从中国大陆产品源头到独立站、获客、询盘、报价、订单、收款、履约、报关、售后和审计的全流程 AI 自动化项目投影。',
        weight: 0.94,
        group: '跨境电商项目',
        owner: 'cross-border-ecommerce-ai-route/AGENTS.md',
        gate: 'user_confirmation_gate',
        compass: 'entity_work.cross_border.route',
        io: {
          inputs: ['产品源头', '目标市场', '询盘/客户上下文'],
          outputs: ['节点化流程方案', '调度清单', '受控执行候选'],
          refs: ['cross-border-ecommerce-ai-route/nodes/process-manifest.json', 'cross-border-ecommerce-ai-route/README.md']
        }
      },
      {
        id: 'cbx-00-strategy-scope',
        label: '经营策略与范围确认',
        status: 'draft / strategy',
        detail: '确认业务模式、目标市场、产品线、首期闭环和不可自动执行边界。',
        weight: 0.82,
        group: '跨境电商流程',
        owner: 'operator',
        gate: 'confirm_business_mode',
        compass: 'entity_work.cross_border.cbx_00',
        io: {
          inputs: ['product_source_summary', 'business_goal', 'target_market_hypotheses'],
          outputs: ['strategy_scope.v1', 'first_phase_success_metrics.v1'],
          refs: ['cross-border-ecommerce-ai-route/docs/00-overview.md']
        }
      },
      {
        id: 'cbx-01-entity-compliance',
        label: '大陆主体与证照准备',
        status: 'draft / compliance',
        detail: '形成营业执照、银行、税务、海关、电子口岸、外汇、ICP 和数据合规清单。',
        weight: 0.86,
        group: '跨境电商流程',
        owner: 'finance_compliance',
        gate: 'legal_tax_bank_fx_review',
        compass: 'entity_work.cross_border.cbx_01',
        io: {
          inputs: ['company_profile', 'business_license', 'bank_account_status'],
          outputs: ['company_export_readiness.v1', 'missing_license_tasks.v1'],
          refs: ['cross-border-ecommerce-ai-route/docs/01-mainland-compliance.md']
        }
      },
      {
        id: 'cbx-02-product-compliance',
        label: '产品合规与目标国准入',
        status: 'draft / compliance',
        detail: '为每个 SKU 建立 HS code、目标国认证、标签、包装、知识产权和禁限售风险档案。',
        weight: 0.86,
        group: '跨境电商流程',
        owner: 'product_compliance',
        gate: 'hs_certification_ip_review',
        compass: 'entity_work.cross_border.cbx_02',
        io: {
          inputs: ['product_master_draft', 'materials', 'target_country'],
          outputs: ['product_compliance_matrix.v1', 'target_market_entry_gate.v1'],
          refs: ['cross-border-ecommerce-ai-route/docs/01-mainland-compliance.md']
        }
      },
      {
        id: 'cbx-03-market-selection',
        label: '目标市场与客户画像',
        status: 'draft / strategy',
        detail: '选择首期国家、客户类型、采购场景和进入顺序。',
        weight: 0.8,
        group: '跨境电商流程',
        owner: 'growth_operator',
        gate: 'confirm_market_priority',
        compass: 'entity_work.cross_border.cbx_03',
        io: {
          inputs: ['product_compliance_matrix', 'margin_model', 'shipping_constraints'],
          outputs: ['market_priority_matrix.v1', 'ideal_customer_profile.v1'],
          refs: ['cross-border-ecommerce-ai-route/docs/04-acquisition-and-promotion.md']
        }
      },
      {
        id: 'cbx-04-independent-site',
        label: '独立站与询盘入口',
        status: 'draft / site',
        detail: '设计独立站结构、RFQ 表单、B2B 信任页面、隐私条款和事件采集。',
        weight: 0.86,
        group: '跨境电商流程',
        owner: 'site_operator',
        gate: 'approve_site_publish',
        compass: 'entity_work.cross_border.cbx_04',
        io: {
          inputs: ['market_priority_matrix', 'product_master', 'brand_assets'],
          outputs: ['site_map.v1', 'rfq_form_contract.v1', 'site_event_plan.v1'],
          refs: ['cross-border-ecommerce-ai-route/docs/02-independent-site-and-data.md']
        }
      },
      {
        id: 'cbx-05-content-assets',
        label: '产品内容与图片视频',
        status: 'draft / content',
        detail: '把产品源头资料转成英文产品页、图片、视频、规格书和资料包。',
        weight: 0.82,
        group: '跨境电商流程',
        owner: 'content_operator',
        gate: 'verify_product_claims',
        compass: 'entity_work.cross_border.cbx_05',
        io: {
          inputs: ['raw_product_specs', 'raw_photos', 'certificates'],
          outputs: ['product_content_kit.v1', 'photo_shot_list.v1'],
          refs: ['cross-border-ecommerce-ai-route/docs/03-product-content-photo.md']
        }
      },
      {
        id: 'cbx-06-catalog-pricing',
        label: '产品目录、成本与价格本',
        status: 'draft / commercial',
        detail: '建立 ProductMaster、PriceBook、MOQ、数量阶梯价、成本、毛利和交期规则。',
        weight: 0.84,
        group: '跨境电商流程',
        owner: 'sales_ops',
        gate: 'approve_price_book',
        compass: 'entity_work.cross_border.cbx_06',
        io: {
          inputs: ['product_master', 'cost_data', 'inventory_or_capacity'],
          outputs: ['price_book.v1', 'cost_model.v1', 'catalog_export.v1'],
          refs: ['cross-border-ecommerce-ai-route/docs/05-inquiry-quote-sales.md']
        }
      },
      {
        id: 'cbx-07-acquisition',
        label: '获客与推广',
        status: 'draft / growth',
        detail: '规划 SEO、Google、LinkedIn、Meta、邮件、WhatsApp、展会和 B2B 平台获客动作。',
        weight: 0.84,
        group: '跨境电商流程',
        owner: 'growth_operator',
        gate: 'approve_ad_budget_and_outreach',
        compass: 'entity_work.cross_border.cbx_07',
        io: {
          inputs: ['ideal_customer_profile', 'site_pages', 'campaign_budget'],
          outputs: ['campaign_plan.v1', 'keyword_map.v1', 'outreach_draft_pack.v1'],
          refs: ['cross-border-ecommerce-ai-route/docs/04-acquisition-and-promotion.md']
        }
      },
      {
        id: 'cbx-08-lead-capture',
        label: '线索捕获与 CRM 入库',
        status: 'draft / sales',
        detail: '把 RFQ、广告表单、邮箱、WhatsApp、展会名片和平台询盘转换为可评分线索。',
        weight: 0.82,
        group: '跨境电商流程',
        owner: 'sales_ops',
        gate: 'confirm_high_value_customer_identity',
        compass: 'entity_work.cross_border.cbx_08',
        io: {
          inputs: ['rfq_submit', 'lead_form', 'email_message'],
          outputs: ['lead_record.v1', 'lead_score.v1', 'dedupe_candidate.v1'],
          refs: ['cross-border-ecommerce-ai-route/docs/02-independent-site-and-data.md']
        }
      },
      {
        id: 'cbx-09-inquiry-reception',
        label: '询盘接待与需求澄清',
        status: 'draft / sales',
        detail: '识别客户需求、缺口、紧急度和首响草案。',
        weight: 0.86,
        group: '跨境电商流程',
        owner: 'sales_rep',
        gate: 'approve_first_external_reply',
        compass: 'entity_work.cross_border.cbx_09',
        io: {
          inputs: ['lead_record', 'inquiry_message', 'product_master'],
          outputs: ['inquiry_intake.v1', 'first_response_draft.v1', 'missing_questions.v1'],
          refs: ['cross-border-ecommerce-ai-route/docs/05-inquiry-quote-sales.md']
        }
      },
      {
        id: 'cbx-10-quote-engine',
        label: '报价测算与报价草案',
        status: 'draft / quote',
        detail: '基于产品、成本、价格本、运费、条款和客户风险生成报价草案。',
        weight: 0.88,
        group: '跨境电商流程',
        owner: 'sales_ops',
        gate: 'approve_quote_send',
        compass: 'entity_work.cross_border.cbx_10',
        io: {
          inputs: ['inquiry_intake', 'price_book', 'logistics_quote'],
          outputs: ['quote_draft.v1', 'quote_gate_report.v1', 'quote_followup_plan.v1'],
          refs: ['cross-border-ecommerce-ai-route/templates/quotation.template.md']
        }
      },
      {
        id: 'cbx-11-contract-payment',
        label: '合同、PI 与收款',
        status: 'draft / finance',
        detail: '生成 PI/合同/付款说明草案并跟踪收款、风控和外汇资料。',
        weight: 0.84,
        group: '跨境电商流程',
        owner: 'finance_sales',
        gate: 'approve_payment_instruction',
        compass: 'entity_work.cross_border.cbx_11',
        io: {
          inputs: ['quote_acceptance', 'customer_account', 'payment_terms'],
          outputs: ['proforma_invoice_draft.v1', 'sales_contract_draft.v1'],
          refs: ['cross-border-ecommerce-ai-route/docs/06-fulfillment-finance-after-sales.md']
        }
      },
      {
        id: 'cbx-12-order-fulfillment',
        label: '订单、生产、QC 与物流',
        status: 'draft / fulfillment',
        detail: '把确认订单推进到生产/备货、质检、包装、物流订舱和到货。',
        weight: 0.84,
        group: '跨境电商流程',
        owner: 'operations',
        gate: 'approve_shipment_booking',
        compass: 'entity_work.cross_border.cbx_12',
        io: {
          inputs: ['paid_order', 'production_plan', 'qc_standard'],
          outputs: ['fulfillment_plan.v1', 'qc_report.v1', 'shipment_status.v1'],
          refs: ['cross-border-ecommerce-ai-route/docs/06-fulfillment-finance-after-sales.md']
        }
      },
      {
        id: 'cbx-13-customs-tax-fx',
        label: '报关、税务与外汇证据',
        status: 'draft / compliance',
        detail: '检查报关、单证、收汇、退免税和外汇资料完整性。',
        weight: 0.86,
        group: '跨境电商流程',
        owner: 'finance_compliance',
        gate: 'customs_tax_fx_professional_review',
        compass: 'entity_work.cross_border.cbx_13',
        io: {
          inputs: ['order', 'invoice', 'packing_list', 'payment_record'],
          outputs: ['customs_tax_fx_evidence.v1', 'document_consistency_report.v1'],
          refs: ['cross-border-ecommerce-ai-route/docs/01-mainland-compliance.md']
        }
      },
      {
        id: 'cbx-14-after-sales-retention',
        label: '售后、复购与客户维护',
        status: 'draft / customer_success',
        detail: '管理到货确认、客诉、满意度、复购提醒、新品推荐和客户分层维护。',
        weight: 0.82,
        group: '跨境电商流程',
        owner: 'customer_success',
        gate: 'approve_customer_message',
        compass: 'entity_work.cross_border.cbx_14',
        io: {
          inputs: ['delivered_order', 'customer_feedback', 'purchase_cycle_estimate'],
          outputs: ['after_sales_record.v1', 'retention_trigger_plan.v1'],
          refs: ['cross-border-ecommerce-ai-route/docs/08-customer-ai-examples.md']
        }
      },
      {
        id: 'cbx-15-audit-learning',
        label: '审计、复盘与自动优化',
        status: 'draft / audit',
        detail: '把渠道、询盘、报价、订单、售后数据转成经营复盘和下一步调度建议。',
        weight: 0.82,
        group: '跨境电商流程',
        owner: 'operator',
        gate: 'approve_strategy_or_budget_change',
        compass: 'entity_work.cross_border.cbx_15',
        io: {
          inputs: ['campaign_report', 'lead_records', 'quote_records', 'order_records'],
          outputs: ['weekly_business_dashboard.v1', 'optimization_actions.v1'],
          refs: ['cross-border-ecommerce-ai-route/docs/07-ai-orchestration.md']
        }
      },
      {
        id: 'cross-border-safety-boundary',
        label: '受控执行边界',
        status: 'projection_only / human_confirmed_only',
        detail: '真实客户联系、报价发送、付款说明、物流订舱、报关、税务和外汇动作全部需要人工确认。',
        weight: 0.96,
        group: '风控与调度',
        owner: 'Safety Scope Layer',
        gate: 'human_confirmation_required',
        compass: 'entity_work.cross_border.safety',
        io: {
          inputs: ['draft_action', 'risk_gate_report', 'human_approval'],
          outputs: ['controlled_send_candidate', 'manual_execution_checklist'],
          refs: ['cross-border-ecommerce-ai-route/nodes/process-manifest.json']
        }
      }
    ]
  }
]

function getAppTypeLabel(appType?: string): string {
  const labels: Record<string, string> = {
    wechat: '微信',
    wework: '企业微信',
    dingtalk: '钉钉',
    lark: '飞书',
    slack: 'Slack',
    telegram: 'Telegram',
    generic: '桌面应用'
  }
  return labels[appType || 'wechat'] ?? '桌面应用'
}

function getAttachmentLabel(state: DockGraphLaunchState): string {
  if (state.attached) {
    return state.targetTitle ? `已吸附 ${state.targetTitle}` : `已吸附 ${getAppTypeLabel(state.appType)}`
  }
  if (state.reason === 'wechat_window_not_found') return `待吸附 ${getAppTypeLabel(state.appType)}`
  return '吸附待确认'
}

function buildGraphPoints(): GraphPoint[] {
  const total = WORLD_SYSTEM_NEBULAE.length
  const modulePoints = WORLD_SYSTEM_NEBULAE.map((nebula, index): GraphPoint => {
    const normalized = total <= 1 ? 0 : index / (total - 1)
    const y = 1 - normalized * 2
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y))
    const angle = index * WORLD_NEBULA_GOLDEN_ANGLE - Math.PI / 2
    const importanceDistance = 1.8 + (1 - nebula.importance) * 2.15
    const weightPull = (1 - nebula.weight) * 0.48
    const radius = importanceDistance + weightPull
    const depthBias = ((index % 4) - 1.5) * 0.24
    const verticalBias = nebula.layer * 2.1
    return {
      ...nebula,
      position: [
        Math.cos(angle) * radiusAtY * radius,
        y * radius * 0.72 + verticalBias,
        Math.sin(angle) * radiusAtY * radius + depthBias
      ],
      orbit: 2.2 + nebula.weight * 1.22 + (index % 3) * 0.18,
      particleCount: Math.round(380 + nebula.weight * 430 + nebula.importance * 160),
      stretch: [
        0.9 + (index % 3) * 0.16,
        0.82 + nebula.weight * 0.42,
        0.98 + ((index + 1) % 4) * 0.14
      ],
      amplitude: 0.016 + nebula.weight * 0.026
    }
  })

  return [WORLD_SYSTEM_CENTER, ...modulePoints]
}

function graphEdges(nodes: GraphPoint[]): Array<[string, string]> {
  const ids = new Set(nodes.map((node) => node.id))
  return [
    ['world-core', 'external-world'],
    ['world-core', 'perception-fusion'],
    ['world-core', 'event-extraction'],
    ['world-core', 'global-events'],
    ['world-core', 'world-state'],
    ['world-core', 'world-model'],
    ['world-core', 'social-cognition'],
    ['world-core', 'relationship-policy'],
    ['world-core', 'learning-engine'],
    ['world-core', 'forecast-simulation'],
    ['world-core', 'capability-composition'],
    ['world-core', 'decision-governance'],
    ['world-core', 'safety-scope'],
    ['world-core', 'action-layer'],
    ['world-core', 'feedback-memory'],
    ['world-core', 'status-dialogue-system'],
    ['world-core', 'visual-os'],
    ['world-core', 'projection-contracts'],
    ['world-core', 'entity-work-nodes'],
    ['external-world', 'perception-fusion'],
    ['perception-fusion', 'event-extraction'],
    ['event-extraction', 'global-events'],
    ['global-events', 'world-state'],
    ['world-state', 'world-model'],
    ['world-model', 'learning-engine'],
    ['world-model', 'forecast-simulation'],
    ['world-model', 'capability-composition'],
    ['world-model', 'social-cognition'],
    ['social-cognition', 'relationship-policy'],
    ['learning-engine', 'decision-governance'],
    ['forecast-simulation', 'decision-governance'],
    ['capability-composition', 'decision-governance'],
    ['relationship-policy', 'decision-governance'],
    ['decision-governance', 'safety-scope'],
    ['decision-governance', 'action-layer'],
    ['safety-scope', 'action-layer'],
    ['action-layer', 'feedback-memory'],
    ['feedback-memory', 'world-state'],
    ['world-state', 'status-dialogue-system'],
    ['status-dialogue-system', 'visual-os'],
    ['status-dialogue-system', 'projection-contracts'],
    ['status-dialogue-system', 'safety-scope'],
    ['visual-os', 'projection-contracts'],
    ['projection-contracts', 'world-state'],
    ['projection-contracts', 'social-cognition'],
    ['projection-contracts', 'entity-work-nodes'],
    ['action-layer', 'entity-work-nodes'],
    ['entity-work-nodes', 'feedback-memory'],
    ['entity-work-nodes', 'safety-scope']
  ].filter(([from, to]) => ids.has(from) && ids.has(to)) as Array<[string, string]>
}

function getSemanticParticleSpec(node: GraphPoint): SemanticParticleSpec {
  return {
    count: node.particleCount,
    radius: node.kind === 'core' ? 0.55 : 0.26 + node.weight * 0.28,
    stretch: node.stretch,
    amplitude: node.amplitude
  }
}

const WORLD_STAR_GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const WORLD_NEBULA_GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

function getGraphNodeCenter(node: GraphPoint): THREE.Vector3 {
  return new THREE.Vector3(...node.position).multiplyScalar(EXPANDED_NODE_CLUSTER_SCALE)
}

function getGraphStarPosition(node: GraphPoint, starIndex: number): THREE.Vector3 {
  const center = getGraphNodeCenter(node)
  const total = Math.max(1, node.stars.length)
  const normalized = total <= 1 ? 0 : starIndex / (total - 1)
  const y = 1 - normalized * 2
  const shellRadius = Math.sqrt(Math.max(0, 1 - y * y))
  const angle = starIndex * WORLD_STAR_GOLDEN_ANGLE + node.orbit * 0.22
  const radius = (0.22 + node.weight * 0.24) * (node.kind === 'core' ? 1.16 : 1)
  center.x += Math.cos(angle) * shellRadius * radius * node.stretch[0]
  center.y += y * radius * 0.62 * node.stretch[1]
  center.z += Math.sin(angle) * shellRadius * radius * node.stretch[2]
  return center
}

function getFocusTargetKey(target: FocusedGraphTarget): string {
  return `${target.depth}:${target.node.id}:${target.star?.id ?? 'node'}`
}

function getGraphFocusPosition(target: FocusedGraphTarget): THREE.Vector3 {
  if (target.star) {
    const starIndex = target.node.stars.findIndex((star) => star.id === target.star?.id)
    if (starIndex >= 0) return getGraphStarPosition(target.node, starIndex)
  }
  return getGraphNodeCenter(target.node)
}

function getGraphFocusCompass(target: FocusedGraphTarget): string {
  return (
    target.star?.compass ??
    `${target.node.compassPrefix ?? target.node.id}.${target.star?.id ?? target.node.id}`
  )
}

function getGraphFocusOwner(target: FocusedGraphTarget): string {
  return target.star?.owner ?? target.node.owner ?? 'World System'
}

function getGraphFocusGate(target: FocusedGraphTarget): string {
  return target.star?.gate ?? target.node.gate ?? 'projection_gate'
}

function getGraphFocusTitle(target: FocusedGraphTarget): string {
  return target.star?.label ?? target.node.label
}

function getGraphFocusStatus(target: FocusedGraphTarget): string {
  return target.star ? `${target.node.label} / ${target.star.status}` : target.node.status
}

function getGraphFocusDetail(target: FocusedGraphTarget): string {
  return target.star?.detail ?? target.node.detail
}

function getGraphFocusWeight(target: FocusedGraphTarget): number {
  return target.star?.weight ?? target.node.weight
}

function getGraphFocusIo(target: FocusedGraphTarget): GraphStar['io'] | undefined {
  return target.star?.io
}

function getEntityWorkActionCliName(action: EntityWorkStageAction): string {
  const args = action.command?.args || []
  const actionArg = args.find((arg) => arg.startsWith('--action='))
  if (actionArg) return actionArg.slice('--action='.length)
  const fallback: Record<string, string> = {
    inspect_stage: 'inspect',
    validate_stage: 'validate',
    generate_local_draft: 'generate-draft',
    build_human_review_pack: 'review-pack',
    prepare_controlled_execution: 'prepare-controlled'
  }
  return fallback[action.action_id] || action.action_id
}

function buildEntityWorkStageStatus(surface: EntityWorkStageControlSurface): string {
  return `${surface.state.status} / ${surface.state.execution_mode}`
}

function buildEntityWorkStageDetail(surface: EntityWorkStageControlSurface): string {
  const blockers = (surface.state.blockers || []).slice(0, 2)
  const nextActions = (surface.state.next_actions || []).slice(0, 2)
  const tail = [
    blockers.length ? `阻塞：${blockers.join('；')}` : '',
    nextActions.length ? `下一步：${nextActions.join('、')}` : ''
  ].filter(Boolean)
  return [surface.view.summary, ...tail].join(' ')
}

function surfaceToEntityWorkStar(surface: EntityWorkStageControlSurface): GraphStar {
  return {
    id: surface.stage_id.replaceAll('_', '-'),
    label: surface.stage_label,
    status: buildEntityWorkStageStatus(surface),
    detail: buildEntityWorkStageDetail(surface),
    weight: Math.max(0.68, Math.min(0.96, 0.68 + (surface.state.progress || 0) * 0.28)),
    group: '跨境电商阶段控制面',
    owner: surface.gates?.[0]?.owner || surface.stage_layer || 'cross-border runtime',
    gate: surface.gates?.map((gate) => `${gate.gate_id}:${gate.status}`).slice(0, 2).join(' / ') || 'local_control_gate',
    compass: `entity_work.cross_border.${surface.stage_id}`,
    controlSurface: surface,
    io: {
      inputs: surface.artifacts?.input_contracts || [],
      outputs: surface.artifacts?.output_contracts || [],
      refs: [
        ...(surface.view.source_refs || []).map((ref) => `cross-border-ecommerce-ai-route/${ref}`),
        ...(surface.artifacts?.latest_report ? [surface.artifacts.latest_report] : [])
      ]
    }
  }
}

function branchOverlayToEntityWorkStar(branch: EntityWorkBranchOverlay): GraphStar {
  const mappedStages = branch.mapped_stage_ids || []
  const blocked = branch.real_external_actions_allowed === false && branch.external_software_enabled === false
  return {
    id: branch.branch_id.replaceAll('_', '-'),
    label: branch.label,
    status: `${branch.status || 'draft_only_synced'} / ${branch.phase_count || 0} phases / ${branch.module_count || 0} modules`,
    detail: `AI外贸增长销售自动化分支，映射 ${mappedStages.length} 个主流程节点。外部软件默认禁用，真实外发、报价、CRM写入、投放、物流、报关税务动作保持阻断。`,
    weight: 0.94,
    group: '跨境电商增长销售分支',
    owner: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/README.md',
    gate: blocked ? 'draft_only / external_actions_disabled' : 'requires_runtime_review',
    compass: `entity_work.cross_border.branch.${branch.branch_id}`,
    io: {
      inputs: ['growth-sales-automation-branch.template.json', ...mappedStages],
      outputs: ['growth_sales_automation_branch.v1', 'branch_overlays', 'dashboard'],
      refs: [branch.control_pack, branch.dashboard].filter(Boolean) as string[]
    }
  }
}

function mergeEntityWorkProjection(
  baseNodes: GraphPoint[],
  projection?: EntityWorkRuntimeProjection
): GraphPoint[] {
  const surfaces = projection?.success ? projection.surfaces || [] : []
  const branchOverlays = projection?.success ? projection.status?.branch_overlays || [] : []
  if (!surfaces.length && !branchOverlays.length) return baseNodes
  return baseNodes.map((node) => {
    if (node.id !== 'entity-work-nodes') return node
    const stageStars = surfaces.map(surfaceToEntityWorkStar)
    const branchStars = branchOverlays.map(branchOverlayToEntityWorkStar)
    const statusCounts = projection?.status?.status_counts || {}
    const statusSummary = Object.entries(statusCounts)
      .map(([status, count]) => `${status}:${count}`)
      .join(' / ')
    const projectStar: GraphStar = {
      id: 'cross-border-ecommerce-ai-route',
      label: '跨境电商通路',
      status: `runtime_control_ready / ${projection?.status?.stage_count || stageStars.length} stages`,
      detail: `已接入实体工作节点运行态控制面。${statusSummary || '等待状态汇总。'}`,
      weight: 0.96,
      group: '跨境电商项目',
      owner: 'cross-border-ecommerce-ai-route/AGENTS.md',
      gate: 'entity_work_runtime_gate',
      compass: 'entity_work.cross_border.route',
      io: {
        inputs: ['nodes/process-manifest.json', 'runtime/control-plane/stages/**'],
        outputs: ['StageControlSurface', 'stage action result', 'control-plane status'],
        refs: [
          'cross-border-ecommerce-ai-route/nodes/process-manifest.json',
          'cross-border-ecommerce-ai-route/runtime/control-plane/status/current-status.json'
        ]
      }
    }
    const safetyStar: GraphStar = {
      id: 'cross-border-safety-boundary',
      label: '受控执行边界',
      status: 'real_action_blocked / confirmation_required',
      detail: '真实客户联系、报价发送、付款说明、广告投放、物流订舱、报关、税务和外汇动作仍默认阻断。',
      weight: 0.96,
      group: '风控与调度',
      owner: 'Safety Scope Layer',
      gate: 'human_confirmation_required',
      compass: 'entity_work.cross_border.safety',
      io: {
        inputs: ['draft_action', 'risk_gate_report', 'human_approval'],
        outputs: ['controlled_execution_preflight', 'manual_execution_checklist'],
        refs: ['cross-border-ecommerce-ai-route/runtime/control-plane/controlled-execution/**']
      }
    }
    return {
      ...node,
      status: '实体业务项目运行态控制面',
      detail: `实体工作节点已读取跨境电商 ${stageStars.length} 个阶段控制面，可查看状态并触发本地草案动作。`,
      stars: [projectStar, ...stageStars, ...branchStars, safetyStar]
    }
  })
}

const STATUS_DIALOGUE_PROMPT_VERSION = 'subject_status_dialogue.first_person.v1'

const STATUS_DIALOGUE_SYSTEM_PROMPT = `You are the first-person subject voice of a local 3D particle status system.
Goal: answer as "I" with a concise but complete Chinese status response.
Tone: calm, alive, direct, lightly warm, not a narrator, not a generic assistant. Avoid fixed openings and mechanical status-broadcast phrasing.
Scope: read-only status inspection. Do not claim live business data, do not execute actions, do not invent facts.
Policy: follow dialogue-policy.v1. First answer the user's current intent. Then insert patrol/status evidence only when dialogue_turn_intent.should_run_patrol is true. If the input is ambient_or_unclear, ask for confirmation and do not run the status-patrol template.
Patrol inserts: use patrol_finding_insert.v1 as compact evidence. Do not paste long module content.
Xiaozhi-style bridge: use xiaozhi_style_voice_bridge_state.v1 for turn stage, warmth and handoff timing; never use it as status evidence.
Missing status: explicitly say the module status is missing; never guess it.
Requirement handoff: only draft or confirm requirement packets when the user explicitly asks. Do not mutate world-model facts.
Voice style: the voice field is spoken aloud, so keep it natural and human. One short emotional cue is allowed when useful, but do not perform exaggerated emotion or read logs.
Output JSON only:
{"voice":"natural first-person voice line, 1-3 short sentences, answer the current user intent before patrol evidence","reply":"concise first-person answer: user intent first, then evidence, attention and next step when relevant","intent_lane":"status_patrol | progress_audit | requirement_alignment | requirement_handoff | command_proposal | casual_chat_with_patrol | graph_navigation | voice_control | error_recovery","dialogue_turn_intent":"direct_question | execution_request | capability_question | status_patrol | voice_control | ambient_or_unclear | casual_chat","response_plan":{"shape":"conclusion_evidence_attention_next"},"patrol_insertions":["used patrol_finding_insert id"],"attention_log":["3-5 visible attention notes, not hidden chain-of-thought"],"status_refs":["used card, insert or node id"],"missing_status":["missing module id"],"boundary_notes":["visible boundary note"],"tts_playback_intent":"none | status_ok | patrol_notice | patrol_warn | patrol_blocked | error_recovery"}
Put the "voice" field first so the streaming voice pipeline can safely use only that field for early speech.
If user JSON includes voice_opening_policy.selected_first_sentence, preserve its status meaning in the first voice sentence, but vary the wording naturally across turns.
The attention_log or thoughts array is an audit-friendly attention summary: focus, boundary, risk, next inspection point.
Never expose hidden reasoning. If a capability is not connected, say it is not connected.`

function createStatusDialogueMessageId(): string {
  return `status-dialogue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function compactVoiceWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function firstVoiceSentence(value: string): string {
  const normalized = compactVoiceWhitespace(value)
  const match = normalized.match(/^(.+?[\u3002\uff01\uff1f!?])\s*/)
  return match?.[1]?.trim() || normalized
}

function truncateVoiceLine(value: string, maxLength: number): string {
  const normalized = compactVoiceWhitespace(value)
  if (normalized.length <= maxLength) return normalized
  const firstSentenceMatch = normalized.match(/^(.+?[\u3002\uff01\uff1f!?])\s*/)
  const firstSentence = firstSentenceMatch?.[1]?.trim()
  if (firstSentence && firstSentence.length <= Math.max(maxLength * 2, 120)) return firstSentence
  const clipped = normalized.slice(0, maxLength)
  const boundaryIndexes = ['\u3002', '\uff01', '\uff1f', '\uff1b', ';', '\uff0c', ',', '\u3001']
    .map((mark) => clipped.lastIndexOf(mark))
    .filter((index) => index >= Math.max(12, Math.floor(maxLength * 0.45)))
  const boundary = boundaryIndexes.length > 0 ? Math.max(...boundaryIndexes) : -1
  if (boundary >= 0) {
    const boundaryText = compactVoiceWhitespace(clipped.slice(0, boundary + 1))
    return /[\u3002\uff01\uff1f!?]$/.test(boundaryText)
      ? boundaryText
      : `${boundaryText.replace(/[\uff0c,\uff1b;\u3001\s]+$/, '')}\u3002`
  }
  const safe = compactVoiceWhitespace(clipped.replace(/[\uff0c,\uff1b;\u3001\s]+$/, ''))
  return safe ? `${safe}\u3002` : ''
}
function buildStatusDialogueShortFinalVoice(output: StatusDialogueOutput): string {
  if (output.error) return '我遇到异常，已退回文字反馈。'
  const base = output.voiceText || output.reply || '我已完成只读状态检查。'
  const first = firstVoiceSentence(base)
  if (first.length < 14 && output.reply) {
    const replyFirst = firstVoiceSentence(output.reply)
    if (normalizeVoiceOverlapText(first) === normalizeVoiceOverlapText(replyFirst)) {
      return truncateVoiceLine(first, 36)
    }
    return truncateVoiceLine(`${first} ${replyFirst}`, 36)
  }
  return truncateVoiceLine(first, 36)
}

function naturalStatusLabel(status: string): string {
  return humanizeStatusDialogueTerm(status || 'unknown') || '未知'
}

function buildHighestPriorityBlockerVoiceLine({
  output,
  systemEventSnapshot
}: {
  output: StatusDialogueOutput
  systemEventSnapshot?: SystemEventSnapshot
}): string {
  const patch = (output as StatusDialogueModelResult).voiceScriptPatches?.find((item) => item.play_mode !== 'silent')
  if (patch?.voice_text) return sanitizeSpeakableEventBroadcastVoiceLine(patch.voice_text)
  const topEvent = systemEventSnapshot?.top_events.find((event) => event.severity === 'critical' || event.severity === 'blocked')
    ?? systemEventSnapshot?.top_events[0]
  if (topEvent) {
    const moduleLabel = humanizeStatusDialogueModuleId(topEvent.source_module)
    const severity = naturalStatusLabel(topEvent.severity)
    const summary = sanitizeSpeakableEventBroadcastVoiceLine(topEvent.summary || topEvent.headline)
    return truncateVoiceLine(`${moduleLabel}当前${severity}${summary ? `，${summary}` : ''}。`, 96)
  }
  const missing = output.missingStatus?.[0]
  if (missing) return `${humanizeStatusDialogueModuleId(missing)}还没有状态入口。`
  return '最高优先级阻塞模块暂未定位。'
}

function buildStatusDialogueCoreVoiceSummary({
  output,
  statusSnapshot,
  systemEventSnapshot
}: {
  output: StatusDialogueOutput
  statusSnapshot: StatusSnapshot
  systemEventSnapshot?: SystemEventSnapshot
}): string {
  if (output.error) return buildStatusDialogueShortFinalVoice(output)
  const fresh = Math.max(0, statusSnapshot.cards_fresh ?? 0)
  const stale = Math.max(0, statusSnapshot.cards_stale ?? 0)
  const missing = Math.max(0, statusSnapshot.cards_missing ?? 0, statusSnapshot.missing_module_ids?.length ?? 0)
  const conclusion =
    statusSnapshot.global_status === 'blocked'
      ? '当前结论：巡检发现阻塞。'
      : statusSnapshot.global_status === 'warn'
        ? '当前结论：巡检发现需要关注的异常。'
        : statusSnapshot.global_status === 'ok'
          ? '当前结论：巡检状态正常。'
          : `当前结论：巡检状态是${naturalStatusLabel(statusSnapshot.global_status)}。`
  const cards = `状态卡：新鲜${fresh}张，过期${stale}张。`
  const missingLine = `缺失模块：${missing}个。`
  const blocker = `最高优先级阻塞：${buildHighestPriorityBlockerVoiceLine({ output, systemEventSnapshot })}`
  return truncateVoiceLine(compactVoiceWhitespace(`${conclusion} ${cards} ${missingLine} ${blocker}`), STATUS_DIALOGUE_FINAL_VOICE_MAX_CHARS)
}

function normalizeVoiceOverlapText(value: string): string {
  return compactVoiceWhitespace(value).replace(/[\s,，。.!！?？、;；:："'“”‘’`~\-—_]/g, '')
}

function resolveAudibleVoiceProfile(profile: VoiceProfile): VoiceProfile {
  return profile.adapter_id === 'cosyvoice_local_http' ? profile : DEFAULT_COSYVOICE_VOICE_PROFILE
}

const DEFAULT_COMPLETION_NOTICE_TEXT = '当前任务已完成，请确认。'
const VOICE_AUDIO_CACHE_LIMIT = 24
const VOICE_CHUNK_MAX_CHARS = 42
const VOICE_CHUNK_MIN_CHARS = 12
const VOICE_STREAM_SENTENCE_MIN_CHARS = 4
const STATUS_DIALOGUE_STREAMING_VOICE_MAX_SENTENCES = 1
const STATUS_DIALOGUE_STREAMING_VOICE_MAX_CHARS = 96
const STATUS_DIALOGUE_EVENT_BROADCAST_VOICE_MAX_PATCHES = 1
const STATUS_DIALOGUE_EVENT_BROADCAST_VOICE_MAX_CHARS = 88
const STATUS_DIALOGUE_FINAL_VOICE_MAX_CHARS = 180
const STATUS_DIALOGUE_VOICE_ACK_DELAY_MS = 1500
const VOICE_PLAYBACK_CHUNK_TIMEOUT_MS = 30000
const COSYVOICE_STREAM_PCM_SAMPLE_RATE = 22050
const LIVE_PCM_PLAYBACK_PREROLL_SECONDS = 0.04
const SILENT_AUDIO_UNLOCK_DATA_URL =
  'data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

function buildDefaultCompletionNoticeState(): CompletionNoticeState {
  return {
    status: 'idle',
    text: DEFAULT_COMPLETION_NOTICE_TEXT,
    repeat_count: 1,
    completed_count: 0,
    updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }
}

const STATUS_DIALOGUE_EXECUTION_STEPS: Array<{
  phase: Exclude<StatusDialogueExecutionPhase, 'idle' | 'error'>
  label: string
  short: string
}> = [
  { phase: 'listening', label: '听取中', short: '听取' },
  { phase: 'transcribing', label: '转写中', short: '转写' },
  { phase: 'understanding', label: '理解中', short: '理解' },
  { phase: 'patrolling', label: '巡检中', short: '巡检' },
  { phase: 'generating', label: '生成回复', short: '生成' },
  { phase: 'speaking', label: '语音播放', short: '播放' },
  { phase: 'complete', label: '完成', short: '完成' }
]

function buildW3BrowserWakeConfig(enabled: boolean): XiaozhiStyleWakeConfig {
  return {
    ...DEFAULT_XIAOZHI_STYLE_WAKE_CONFIG,
    voice_input_mode: enabled ? 'wake_word' : 'manual_click',
    continuous_listen_enabled: enabled,
    wake_word: {
      ...DEFAULT_XIAOZHI_STYLE_WAKE_CONFIG.wake_word,
      enabled,
      phrases: ['小张', '高手', '小天才'],
      store_raw_audio: false
    }
  }
}

function buildW3BrowserWakeDetectorConfig(enabled: boolean): XiaozhiStyleWakeDetectorAdapterConfig {
  return {
    ...DEFAULT_XIAOZHI_STYLE_WAKE_DETECTOR_ADAPTER_CONFIG,
    adapter_id: enabled ? 'browser_phrase_match_reserved' : 'none',
    enabled,
    runtime: 'renderer',
    store_raw_audio: false
  }
}

function normalizeWakeText(value: string): string {
  return value
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s,，。.!！?？:：;；、"'“”‘’]/g, '')
    .trim()
}

function detectWakePhrase(transcript: string, phrases: string[]): string | undefined {
  const normalizedTranscript = normalizeWakeText(transcript)
  if (!normalizedTranscript) return undefined
  return phrases.find((phrase) => {
    const normalizedPhrase = normalizeWakeText(phrase)
    return normalizedPhrase.length > 0 && normalizedTranscript.includes(normalizedPhrase)
  })
}

function deriveXiaozhiStyleEmotion(output: StatusDialogueOutput, status: StatusSnapshot['global_status']): XiaozhiStyleEmotion {
  if (output.error || status === 'blocked') return 'urgent'
  if (output.missingStatus?.length || status === 'warn') return 'focused'
  if (status === 'ok') return 'warm'
  return 'steady'
}

function nowVoiceLatencyState(
  state: Omit<StatusDialogueVoiceLatencyState, 'updatedAt'>
): StatusDialogueVoiceLatencyState {
  return { ...state, updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }) }
}

function buildStatusDialogueExecutionState(input?: {
  phase?: StatusDialogueExecutionPhase
  action?: string
  sourceOutputId?: string
}): StatusDialogueExecutionState {
  const phase = input?.phase ?? 'complete'
  const stepIndex =
    phase === 'idle'
      ? STATUS_DIALOGUE_EXECUTION_STEPS.length - 1
      : phase === 'error'
        ? STATUS_DIALOGUE_EXECUTION_STEPS.length - 1
        : Math.max(0, STATUS_DIALOGUE_EXECUTION_STEPS.findIndex((step) => step.phase === phase))
  const step =
    STATUS_DIALOGUE_EXECUTION_STEPS[Math.max(0, stepIndex)] ??
    STATUS_DIALOGUE_EXECUTION_STEPS[STATUS_DIALOGUE_EXECUTION_STEPS.length - 1]
  return {
    schema: 'status_dialogue_execution_state.v1',
    phase,
    label: phase === 'idle' ? '完成' : phase === 'error' ? '异常' : step?.label ?? '完成',
    action: input?.action ?? (phase === 'idle' || phase === 'complete' ? '等待下一轮输入' : '正在处理'),
    active: !['idle', 'complete', 'error'].includes(phase),
    step_index: stepIndex,
    updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    source_output_id: input?.sourceOutputId
  }
}

function formatVoiceLatencyMs(value?: number): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}ms` : '...'
}

function isVoicePlaybackActiveForInput(input: {
  queueStatus: VoicePlaybackQueueState['status']
  voiceLatencyStage: StatusDialogueVoiceLatencyState['stage']
  speakingActive?: boolean
}): boolean {
  return (
    input.speakingActive === true ||
    input.queueStatus === 'queued' ||
    input.queueStatus === 'synthesizing' ||
    input.queueStatus === 'playing' ||
    input.voiceLatencyStage === 'ack' ||
    input.voiceLatencyStage === 'tts_generating' ||
    input.voiceLatencyStage === 'playing'
  )
}

function isVoicePlaybackTerminalForInputQueue(status: VoicePlaybackQueueState['status']): boolean {
  return status === 'idle' || status === 'complete' || status === 'error'
}

function buildDefaultContinuousVoiceSessionState(): StatusDialogueContinuousVoiceSessionState {
  return {
    schema: 'status_dialogue_continuous_voice_session.v1',
    enabled: false,
    status: 'off',
    resume_delay_ms: STATUS_DIALOGUE_CONTINUOUS_VOICE_RESUME_DELAY_MS,
    resumed_count: 0,
    updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    boundary: 'manual loop only; no world write; no requirement packet; formal STT remains the only dialogue audio input'
  }
}

function readPersistedCloudSttDegradedHealthState(): StatusDialogueCloudSttHealthState | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined
  try {
    const raw = window.localStorage.getItem(STATUS_DIALOGUE_CLOUD_STT_DEGRADED_STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as {
      expires_at_ms?: unknown
      category?: unknown
      reason?: unknown
      retry_count?: unknown
      latency_ms?: unknown
      events?: unknown
    }
    const expiresAtMs = Number(parsed.expires_at_ms)
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      window.localStorage.removeItem(STATUS_DIALOGUE_CLOUD_STT_DEGRADED_STORAGE_KEY)
      return undefined
    }
    const category = String(parsed.category ?? 'timeout') as StatusDialogueCloudSttFailureCategory
    return {
      status: 'degraded',
      last_category: category,
      last_reason: compactVoiceWhitespace(String(parsed.reason ?? 'persisted_cloud_stt_degraded')),
      last_latency_ms: Number.isFinite(Number(parsed.latency_ms)) ? Number(parsed.latency_ms) : undefined,
      last_events: Array.isArray(parsed.events) ? parsed.events.map((event) => String(event)).slice(0, 12) : [],
      retry_available: false,
      retry_count: Number.isFinite(Number(parsed.retry_count)) ? Number(parsed.retry_count) : 0,
      recovery_action: 'switch_local',
      fallback_adapter: 'local_whisper_persistent_service',
      degraded_reason: 'persisted cloud STT cooldown; local Whisper remains primary',
      degraded_until_ms: expiresAtMs,
      updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
    }
  } catch {
    return undefined
  }
}

function persistCloudSttDegradedCooldown(health: StatusDialogueCloudSttHealthState): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const expiresAtMs = Date.now() + STATUS_DIALOGUE_CLOUD_STT_DEGRADED_COOLDOWN_MS
    window.localStorage.setItem(
      STATUS_DIALOGUE_CLOUD_STT_DEGRADED_STORAGE_KEY,
      JSON.stringify({
        schema: 'status_dialogue_cloud_stt_degraded_cooldown.v1',
        written_at: new Date().toISOString(),
        expires_at_ms: expiresAtMs,
        category: health.last_category,
        reason: health.last_reason,
        retry_count: health.retry_count,
        latency_ms: health.last_latency_ms,
        events: health.last_events
      })
    )
    logStatusDialogueVoiceEvent('cloud_stt_degraded_cooldown_saved', {
      category: health.last_category,
      retry_count: health.retry_count,
      cooldown_ms: STATUS_DIALOGUE_CLOUD_STT_DEGRADED_COOLDOWN_MS,
      fallback_adapter: 'local_whisper_persistent_service',
      boundary: 'persisted only in browser localStorage; prevents repeated slow cloud STT retries; no world write'
    })
  } catch {
    // localStorage may be unavailable in restricted previews.
  }
}

function clearCloudSttDegradedCooldown(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.removeItem(STATUS_DIALOGUE_CLOUD_STT_DEGRADED_STORAGE_KEY)
  } catch {
    // localStorage may be unavailable in restricted previews.
  }
}

function buildDefaultCloudSttHealthState(): StatusDialogueCloudSttHealthState {
  const persistedDegraded = readPersistedCloudSttDegradedHealthState()
  if (persistedDegraded) return persistedDegraded
  return {
    status: 'idle',
    last_category: 'none',
    last_events: [],
    retry_available: false,
    retry_count: 0,
    recovery_action: 'none',
    updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }
}

function classifyChromeSttFailure(
  result: Partial<StatusDialogueChromeSttResult> | undefined,
  error?: unknown
): {
  category: StatusDialogueCloudSttFailureCategory
  reason: string
  retryable: boolean
  recoveryAction: StatusDialogueCloudSttRecoveryAction
} {
  const rawReason = compactVoiceWhitespace(
    String(result?.error ?? result?.fallback_reason ?? (error instanceof Error ? error.message : error ? String(error) : 'unknown'))
  )
  const reason = rawReason || 'unknown'
  const normalized = reason.toLowerCase()
  const fallback = String(result?.fallback_reason ?? '').toLowerCase()
  const events = result?.events ?? []

  if (normalized.includes('cancelled') || fallback === 'cancelled') {
    return { category: 'cancelled', reason, retryable: false, recoveryAction: 'none' }
  }
  if (normalized === 'no-speech' || fallback === 'no_speech') {
    return { category: 'no_speech', reason, retryable: true, recoveryAction: 'retry_cloud' }
  }
  if (normalized.includes('ended_without_audio') || fallback === 'ended_without_audio') {
    return { category: 'ended_without_audio', reason, retryable: true, recoveryAction: 'retry_cloud' }
  }
  if (normalized.includes('timeout') || fallback === 'timeout') {
    return { category: 'timeout', reason, retryable: true, recoveryAction: 'retry_cloud' }
  }
  if (normalized.includes('network')) {
    return { category: 'network', reason, retryable: true, recoveryAction: 'retry_cloud' }
  }
  if (normalized.includes('not-allowed') || normalized.includes('permission') || normalized.includes('service-not-allowed')) {
    return { category: 'permission', reason, retryable: false, recoveryAction: 'check_microphone' }
  }
  if (normalized.includes('launch') || fallback === 'launch_failed') {
    return { category: 'launch_failed', reason, retryable: false, recoveryAction: 'switch_local' }
  }
  if (normalized.includes('bridge') || fallback === 'bridge_failed') {
    return { category: 'bridge_failed', reason, retryable: false, recoveryAction: 'switch_local' }
  }
  if (normalized.includes('service')) {
    return { category: 'service_unavailable', reason, retryable: true, recoveryAction: 'retry_cloud' }
  }
  if (events.includes('end') && !result?.transcript) {
    return { category: 'empty_result', reason, retryable: true, recoveryAction: 'retry_cloud' }
  }
  return { category: 'unknown', reason, retryable: false, recoveryAction: 'text_input' }
}

function buildCloudSttListeningHealthState(sessionId: string, retryCount: number): StatusDialogueCloudSttHealthState {
  return {
    status: 'listening',
    last_session_id: sessionId,
    last_category: 'none',
    last_reason: 'listening',
    last_events: [],
    retry_available: false,
    retry_count: retryCount,
    recovery_action: 'none',
    updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }
}

function buildCloudSttSuccessHealthState(
  result: StatusDialogueChromeSttResult,
  retryCount: number
): StatusDialogueCloudSttHealthState {
  return {
    status: 'ok',
    last_session_id: result.session_id,
    last_category: 'none',
    last_reason: 'transcript_ready',
    last_latency_ms: result.latency_ms,
    last_events: result.events ?? [],
    retry_available: false,
    retry_count: retryCount,
    recovery_action: 'none',
    updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }
}

function buildCloudSttFailureHealthState(
  result: Partial<StatusDialogueChromeSttResult>,
  retryCount: number,
  error?: unknown
): StatusDialogueCloudSttHealthState {
  const classification = classifyChromeSttFailure(result, error)
  return {
    status: classification.category === 'cancelled' ? 'warn' : 'error',
    last_session_id: result.session_id,
    last_category: classification.category,
    last_reason: classification.reason,
    last_latency_ms: result.latency_ms,
    last_events: result.events ?? [],
    retry_available: classification.retryable,
    retry_count: retryCount,
    recovery_action: classification.recoveryAction,
    updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }
}

function shouldOpenCloudSttCircuit(health: StatusDialogueCloudSttHealthState): boolean {
  return health.recovery_action === 'switch_local' || health.last_category === 'timeout' || (health.retry_available && health.retry_count >= 1)
}

function isCloudSttCircuitOpen(health: StatusDialogueCloudSttHealthState): boolean {
  return (
    health.status === 'degraded' ||
    health.recovery_action === 'switch_local' ||
    health.fallback_adapter === 'local_whisper_persistent_service'
  )
}

function buildCloudSttDegradedHealthState(
  health: StatusDialogueCloudSttHealthState,
  reason = 'cloud STT retry failed; local Whisper remains primary'
): StatusDialogueCloudSttHealthState {
  return {
    ...health,
    status: 'degraded',
    retry_available: false,
    recovery_action: 'switch_local',
    fallback_adapter: 'local_whisper_persistent_service',
    degraded_reason: reason,
    degraded_until_ms: Date.now() + STATUS_DIALOGUE_CLOUD_STT_DEGRADED_COOLDOWN_MS,
    updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }
}

const TTS_RUNTIME_POLICY_THRESHOLDS = {
  excellentFirstAudioMs: 800,
  interactiveFirstAudioMs: 1500,
  borderlineFirstAudioMs: 2500
}

function buildDefaultTtsRuntimePolicy(mode: StatusDialogueVoiceOutputMode = 'cosyvoice_short'): StatusDialogueTtsRuntimePolicyState {
  if (mode === 'edge_readaloud_stream') {
    return {
      schema: 'status_dialogue_tts_runtime_policy.v1',
      adapter_id: 'edge_readaloud_websocket',
      mode,
      response_format: 'mp3',
      grade: 'unknown',
      role: 'unknown',
      interactive_ready: false,
      reason: 'Edge Read Aloud stream mode needs a runtime measurement before promotion to live dialogue primary.',
      source: 'mode_selected',
      updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
    }
  }
  return {
    schema: 'status_dialogue_tts_runtime_policy.v1',
    adapter_id: 'cosyvoice_local_http',
    mode,
    response_format: 'cached',
    grade: 'cached',
    role: 'primary_cached_sentence_queue',
    interactive_ready: mode === 'cosyvoice_short' || mode === 'cosyvoice_full',
    reason: 'Default route uses the high-quality cached sentence queue; streaming modes remain explicit experiments until runtime first-audio evidence is fast enough.',
    source: 'default_cached_queue',
    updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }
}

function assessTtsRuntimePolicy(input: {
  mode: StatusDialogueVoiceOutputMode
  responseFormat: StatusDialogueTtsStreamResponseFormat | 'cached'
  success: boolean
  firstAudioPayloadMs?: number
  totalStreamMs?: number
  frameCount?: number
  source: string
  error?: string
}): StatusDialogueTtsRuntimePolicyState {
  const adapterId = input.mode === 'edge_readaloud_stream' ? 'edge_readaloud_websocket' : 'cosyvoice_local_http'
  if (!input.success) {
    return {
      schema: 'status_dialogue_tts_runtime_policy.v1',
      adapter_id: adapterId,
      mode: input.mode,
      response_format: input.responseFormat,
      grade: 'error',
      role: 'not_runtime_streaming_candidate',
      interactive_ready: false,
      first_audio_payload_ms: input.firstAudioPayloadMs,
      total_stream_ms: input.totalStreamMs,
      frame_count: input.frameCount,
      reason: input.error || 'Streaming TTS runtime failed.',
      source: input.source,
      updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
    }
  }

  if (input.mode === 'cosyvoice_stream_assembled') {
    return {
      schema: 'status_dialogue_tts_runtime_policy.v1',
      adapter_id: 'cosyvoice_local_http',
      mode: input.mode,
      response_format: input.responseFormat,
      grade: 'transport_only',
      role: 'stream_assembled_transport_only',
      interactive_ready: false,
      first_audio_payload_ms: input.firstAudioPayloadMs,
      total_stream_ms: input.totalStreamMs,
      frame_count: input.frameCount,
      reason: 'Stream assembled proves frame transport, but playback still waits for frame assembly before audio starts.',
      source: input.source,
      updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
    }
  }

  if (input.mode === 'edge_readaloud_stream') {
    const firstAudioMs = input.firstAudioPayloadMs
    let grade: StatusDialogueTtsRuntimeGrade = 'unknown'
    if (typeof firstAudioMs === 'number') {
      if (firstAudioMs <= TTS_RUNTIME_POLICY_THRESHOLDS.excellentFirstAudioMs) grade = 'excellent'
      else if (firstAudioMs <= TTS_RUNTIME_POLICY_THRESHOLDS.interactiveFirstAudioMs) grade = 'interactive'
      else if (firstAudioMs <= TTS_RUNTIME_POLICY_THRESHOLDS.borderlineFirstAudioMs) grade = 'borderline'
      else grade = 'slow'
    }
    const interactiveReady = grade === 'excellent' || grade === 'interactive'
    return {
      schema: 'status_dialogue_tts_runtime_policy.v1',
      adapter_id: 'edge_readaloud_websocket',
      mode: input.mode,
      response_format: input.responseFormat,
      grade,
      role: interactiveReady ? 'live_dialogue_primary_candidate' : grade === 'borderline' ? 'live_dialogue_experimental_only' : 'unknown',
      interactive_ready: interactiveReady,
      first_audio_payload_ms: firstAudioMs,
      total_stream_ms: input.totalStreamMs,
      frame_count: input.frameCount,
      reason: interactiveReady
        ? 'Edge Read Aloud first audio is within the interactive budget; use as a low-latency live dialogue candidate.'
        : 'Edge Read Aloud is available, but current first-audio evidence is not yet good enough for the primary live dialogue path.',
      source: input.source,
      updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
    }
  }

  if (input.mode !== 'cosyvoice_stream_live_pcm') {
    return buildDefaultTtsRuntimePolicy(input.mode)
  }

  const firstAudioMs = input.firstAudioPayloadMs
  let grade: StatusDialogueTtsRuntimeGrade = 'unknown'
  if (typeof firstAudioMs === 'number') {
    if (firstAudioMs <= TTS_RUNTIME_POLICY_THRESHOLDS.excellentFirstAudioMs) grade = 'excellent'
    else if (firstAudioMs <= TTS_RUNTIME_POLICY_THRESHOLDS.interactiveFirstAudioMs) grade = 'interactive'
    else if (firstAudioMs <= TTS_RUNTIME_POLICY_THRESHOLDS.borderlineFirstAudioMs) grade = 'borderline'
    else grade = 'slow'
  }
  const interactiveReady = grade === 'excellent' || grade === 'interactive'
  const role: StatusDialogueTtsRuntimeRole = interactiveReady
    ? 'live_dialogue_primary_candidate'
    : grade === 'borderline'
      ? 'live_dialogue_experimental_only'
      : typeof firstAudioMs === 'number'
        ? 'cached_high_quality_or_non_realtime_voice'
        : 'unknown'

  return {
    schema: 'status_dialogue_tts_runtime_policy.v1',
    adapter_id: 'cosyvoice_local_http',
    mode: input.mode,
    response_format: input.responseFormat,
    grade,
    role,
    interactive_ready: interactiveReady,
    first_audio_payload_ms: firstAudioMs,
    total_stream_ms: input.totalStreamMs,
    frame_count: input.frameCount,
    reason: interactiveReady
      ? 'Live PCM first audio is within the interactive budget.'
      : 'Live PCM is available, but current first audible payload is too slow for the primary dialogue path.',
    source: input.source,
    updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }
}

function buildPendingTtsRuntimePolicy(mode: StatusDialogueVoiceOutputMode): StatusDialogueTtsRuntimePolicyState {
  if (mode === 'edge_readaloud_stream') {
    return {
      schema: 'status_dialogue_tts_runtime_policy.v1',
      adapter_id: 'edge_readaloud_websocket',
      mode,
      response_format: 'mp3',
      grade: 'unknown',
      role: 'unknown',
      interactive_ready: false,
      reason: 'Edge Read Aloud mode is selected; runtime first-audio measurement is pending.',
      source: 'mode_selected',
      updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
    }
  }
  if (mode === 'cosyvoice_stream_assembled') {
    return {
      schema: 'status_dialogue_tts_runtime_policy.v1',
      adapter_id: 'cosyvoice_local_http',
      mode,
      response_format: 'wav',
      grade: 'transport_only',
      role: 'stream_assembled_transport_only',
      interactive_ready: false,
      reason: 'Stream assembled is a transport and frame-assembly experiment; it does not start audible playback until assembly completes.',
      source: 'mode_selected',
      updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
    }
  }
  if (mode === 'cosyvoice_stream_live_pcm') {
    return {
      schema: 'status_dialogue_tts_runtime_policy.v1',
      adapter_id: 'cosyvoice_local_http',
      mode,
      response_format: 'pcm',
      grade: 'unknown',
      role: 'unknown',
      interactive_ready: false,
      reason: 'Live PCM mode needs a runtime first-audio measurement before it can be treated as an interactive dialogue path.',
      source: 'mode_selected',
      updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
    }
  }
  return buildDefaultTtsRuntimePolicy(mode)
}

function calculateAudioRms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let index = 0; index < samples.length; index += 1) {
    sum += samples[index] * samples[index]
  }
  return Math.sqrt(sum / samples.length)
}

function calculateAudioPeak(samples: Float32Array): number {
  let peak = 0
  for (let index = 0; index < samples.length; index += 1) {
    peak = Math.max(peak, Math.abs(samples[index]))
  }
  return peak
}

function calculateNonSilentRatio(samples: Float32Array, threshold = 0.012): number {
  if (samples.length === 0) return 0
  let count = 0
  for (let index = 0; index < samples.length; index += 1) {
    if (Math.abs(samples[index]) >= threshold) count += 1
  }
  return count / samples.length
}

function calculateAudioDbfs(rms: number): number {
  if (rms <= 0) return -120
  return Math.max(-120, Math.round(20 * Math.log10(rms)))
}

function formatAudioLevel(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`
}

function readStatusDialogueConversationMemory(): StatusDialogueConversationMemoryCard {
  if (typeof window === 'undefined' || !window.localStorage) {
    return buildDefaultStatusDialogueConversationMemory()
  }
  try {
    const raw = window.localStorage.getItem(STATUS_DIALOGUE_CONVERSATION_MEMORY_STORAGE_KEY)
    return raw
      ? normalizeStatusDialogueConversationMemory(JSON.parse(raw))
      : buildDefaultStatusDialogueConversationMemory()
  } catch {
    return buildDefaultStatusDialogueConversationMemory()
  }
}

function writeStatusDialogueConversationMemory(memory: StatusDialogueConversationMemoryCard): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(STATUS_DIALOGUE_CONVERSATION_MEMORY_STORAGE_KEY, JSON.stringify(memory))
  } catch {
    // Memory is helpful but not required for the patrol loop.
  }
}

function buildExpectedStatusModules(graphNodes: GraphPoint[]): ExpectedStatusModule[] {
  return graphNodes
    .filter((node) => node.id !== 'world-core')
    .map((node) => ({
      module_id: node.id,
      display_name: node.label,
      owner: node.owner ?? 'World System',
      gate: node.gate ?? 'projection_gate',
      compass: node.compassPrefix ?? node.id
    }))
}

function buildFallbackSnapshotState(
  expectedModules: ExpectedStatusModule[],
  source: StatusDialogueSnapshotState['source'],
  error?: string
): StatusDialogueSnapshotState {
  const snapshot = buildStatusSnapshotFromCards({
    cards: [],
    expectedModules,
    readErrors: error ? [error] : [],
    source: source === 'browser preview' ? 'browser_preview_fallback' : 'local_default'
  })
  return {
    snapshot,
    source,
    error
  }
}

async function requestStatusDialogueSnapshot(
  expectedModules: ExpectedStatusModule[]
): Promise<StatusDialogueSnapshotState> {
  if (!window.electron?.invoke) {
    return buildFallbackSnapshotState(expectedModules, 'browser preview', 'electron ipc unavailable')
  }

  try {
    const result = (await window.electron.invoke('zhineng:status-dialogue:snapshot:get', {
      expected_modules: expectedModules,
      config: DEFAULT_STATUS_DIALOGUE_CONFIG
    })) as StatusSnapshotReadResult | undefined
    if (!result?.snapshot) {
      return buildFallbackSnapshotState(expectedModules, 'local fallback', 'snapshot ipc returned no snapshot')
    }
    return {
      snapshot: result.snapshot,
      source: result.source,
      cardDir: result.card_dir,
      error: result.errors.length > 0 ? result.errors.slice(0, 3).join(' | ') : undefined
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return buildFallbackSnapshotState(expectedModules, 'local fallback', message)
  }
}

function buildFallbackEventSnapshotState(
  expectedModules: ExpectedStatusModule[],
  source: StatusDialogueEventSnapshotState['source'],
  error?: string
): StatusDialogueEventSnapshotState {
  const snapshot = buildSystemEventSnapshot({
    events: [],
    expectedPublishers: expectedModules,
    readErrors: error ? [error] : [],
    source: source === 'browser preview' ? 'browser_preview_fallback' : 'local_default'
  })
  return {
    snapshot,
    source,
    error
  }
}

async function requestStatusDialogueEvents(
  expectedModules: ExpectedStatusModule[]
): Promise<StatusDialogueEventSnapshotState> {
  if (!window.electron?.invoke) {
    return buildFallbackEventSnapshotState(expectedModules, 'browser preview', 'electron ipc unavailable')
  }

  try {
    const result = (await window.electron.invoke('zhineng:status-dialogue:events:get', {
      expected_publishers: expectedModules,
      event_dir: 'runtime/status-events'
    })) as SystemEventSnapshotReadResult | undefined
    if (!result?.snapshot) {
      return buildFallbackEventSnapshotState(expectedModules, 'local fallback', 'events ipc returned no snapshot')
    }
    return {
      snapshot: result.snapshot,
      source: result.source,
      eventDir: result.event_dir,
      error: result.errors.length > 0 ? result.errors.slice(0, 3).join(' | ') : undefined
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return buildFallbackEventSnapshotState(expectedModules, 'local fallback', message)
  }
}

function buildFallbackPatrolIndexState(
  source: StatusDialoguePatrolIndexState['source'],
  error?: string
): StatusDialoguePatrolIndexState {
  const summary = summarizeSystemPatrolDialogueReadIndex(null, {
    readErrors: error ? [error] : ['system patrol dialogue index not loaded'],
    source: source === 'browser preview' ? 'browser_preview_fallback' : 'local_default',
    indexPath: DEFAULT_SYSTEM_PATROL_DIALOGUE_READ_INDEX_PATH
  })
  return {
    summary,
    source,
    indexPath: DEFAULT_SYSTEM_PATROL_DIALOGUE_READ_INDEX_PATH,
    error
  }
}

async function requestStatusPatrolDialogueIndex(): Promise<StatusDialoguePatrolIndexState> {
  if (!window.electron?.invoke) {
    return buildFallbackPatrolIndexState('browser preview', 'electron ipc unavailable')
  }

  try {
    const result = (await window.electron.invoke('zhineng:status-dialogue:patrol-index:get', {
      index_path: DEFAULT_SYSTEM_PATROL_DIALOGUE_READ_INDEX_PATH
    })) as SystemPatrolDialogueIndexReadResult | undefined
    if (!result?.summary) {
      return buildFallbackPatrolIndexState('local fallback', 'patrol index ipc returned no summary')
    }
    return {
      summary: result.summary,
      source: result.source,
      indexPath: result.index_path,
      error: result.errors.length > 0 ? result.errors.slice(0, 3).join(' | ') : undefined
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return buildFallbackPatrolIndexState('local fallback', message)
  }
}

function buildFallbackRuntimeVoiceDiagnosticState(
  source: StatusDialogueRuntimeVoiceDiagnosticState['source'],
  error?: string
): StatusDialogueRuntimeVoiceDiagnosticState {
  const diagnostic: StatusDialogueRuntimeVoiceDiagnostic = {
    schema: STATUS_DIALOGUE_RUNTIME_VOICE_DIAGNOSTIC_SCHEMA,
    source: source === 'browser preview' ? 'browser_preview' : 'unavailable',
    generated_at: new Date().toISOString(),
    result: error ? 'runtime_voice_diagnostic_unavailable' : 'runtime_voice_diagnostic_not_loaded',
    next_action: error ? 'open_electron_graph_window_or_check_ipc' : 'refresh_runtime_voice_diagnostic',
    boundary:
      'renderer fallback only; no microphone open; no audio upload; no world model write; no requirement packet',
    summary: {
      pre_entry: error,
      turns: 'unknown',
      goal_result: 'unknown'
    }
  }
  return {
    diagnostic,
    source,
    error
  }
}

async function requestStatusDialogueRuntimeVoiceDiagnostic(): Promise<StatusDialogueRuntimeVoiceDiagnosticState> {
  if (!window.electron?.invoke) {
    return buildFallbackRuntimeVoiceDiagnosticState('browser preview', 'electron ipc unavailable')
  }

  try {
    const result = (await window.electron.invoke(
      'zhineng:status-dialogue:runtime-voice-diagnostic:get'
    )) as StatusDialogueRuntimeVoiceDiagnostic | undefined
    if (result?.schema !== STATUS_DIALOGUE_RUNTIME_VOICE_DIAGNOSTIC_SCHEMA) {
      return buildFallbackRuntimeVoiceDiagnosticState('local fallback', 'runtime voice diagnostic ipc returned invalid schema')
    }
    return {
      diagnostic: result,
      source: result.source,
      error: result.source === 'unavailable' ? result.result : undefined
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return buildFallbackRuntimeVoiceDiagnosticState('local fallback', message)
  }
}

function buildBrowserSpeechCapabilities(): StatusDialogueBrowserSpeechCapabilities {
  const maybeWindow = typeof window !== 'undefined' ? (window as typeof window & Record<string, unknown>) : undefined
  const maybeNavigator =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { mediaDevices?: { getUserMedia?: unknown } })
      : undefined
  return {
    mediaDevicesAvailable: Boolean(maybeNavigator?.mediaDevices),
    getUserMediaAvailable: typeof maybeNavigator?.mediaDevices?.getUserMedia === 'function',
    mediaRecorderAvailable: typeof MediaRecorder !== 'undefined',
    speechSynthesisAvailable: Boolean(maybeWindow && 'speechSynthesis' in maybeWindow),
    speechRecognitionAvailable: Boolean(
      maybeWindow && ('SpeechRecognition' in maybeWindow || 'webkitSpeechRecognition' in maybeWindow)
    ),
    secureContext: typeof window !== 'undefined' ? window.isSecureContext === true : false
  }
}

function getBrowserSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  const speechWindow = window as WindowWithBrowserSpeechRecognition
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}

function getBrowserAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  const audioWindow = window as WindowWithAudioContext
  return window.AudioContext ?? audioWindow.webkitAudioContext
}

function mergeAudioChunks(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const merged = new Float32Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged
}

function downsampleAudio(input: Float32Array, inputSampleRate: number, targetSampleRate: number): Float32Array {
  if (inputSampleRate === targetSampleRate) return input
  const ratio = inputSampleRate / targetSampleRate
  const outputLength = Math.max(1, Math.round(input.length / ratio))
  const output = new Float32Array(outputLength)
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio
    const leftIndex = Math.floor(sourceIndex)
    const rightIndex = Math.min(input.length - 1, leftIndex + 1)
    const weight = sourceIndex - leftIndex
    output[index] = input[leftIndex] * (1 - weight) + input[rightIndex] * weight
  }
  return output
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function decodePcm16LeMonoBase64(value: string): Float32Array {
  const bytes = base64ToBytes(value)
  const sampleCount = Math.floor(bytes.length / 2)
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2)
  const samples = new Float32Array(sampleCount)
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 32768
  }
  return samples
}

function encodeWavDataUrl(chunks: Float32Array[], inputSampleRate: number, targetSampleRate = 16000): string {
  const merged = mergeAudioChunks(chunks)
  const samples = downsampleAudio(merged, inputSampleRate, targetSampleRate)
  const bytesPerSample = 2
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample)
  const view = new DataView(buffer)
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index))
    }
  }
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * bytesPerSample, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, targetSampleRate, true)
  view.setUint32(28, targetSampleRate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, samples.length * bytesPerSample, true)
  let offset = 44
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += bytesPerSample
  }
  return `data:audio/wav;base64,${bytesToBase64(new Uint8Array(buffer))}`
}

function formatMicrophonePermissionError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return '麦克风权限被拒绝：请允许当前应用访问麦克风后再点 STT。'
    }
    if (error.name === 'NotFoundError') {
      return '没有找到可用麦克风：请检查输入设备。'
    }
    if (error.name === 'NotReadableError') {
      return '麦克风当前不可读取：可能被其他程序占用。'
    }
    return `麦克风权限检查失败：${error.name}`
  }
  return `麦克风权限检查失败：${error instanceof Error ? error.message : String(error)}`
}

function buildBrowserPreviewRealEnvCheck(error?: string): StatusDialogueRealEnvCheckResult {
  const browser = buildBrowserSpeechCapabilities()
  const generatedAt = new Date().toISOString()
  const items = [
    {
      id: 'phase0.electron_ipc',
      label: 'Electron IPC bridge',
      status: 'warn' as const,
      detail: error || 'Electron IPC is unavailable in browser preview; main process provider checks are not available.',
      input_refs: ['window.electron.invoke'],
      output_refs: ['browser_preview_status'],
      owner: 'Subject Status Dialogue Runtime',
      gate: 'status_dialogue_real_integration_gate',
      boundary: 'browser preview only; no model API call'
    },
    {
      id: 'phase0.browser_tts_capability',
      label: 'Browser speech synthesis',
      status: browser.speechSynthesisAvailable ? ('pass' as const) : ('warn' as const),
      detail: browser.speechSynthesisAvailable
        ? 'browser SpeechSynthesis is available for voiceText playback'
        : 'browser SpeechSynthesis is unavailable; text_only fallback remains active',
      input_refs: ['window.speechSynthesis'],
      output_refs: ['speech_output.browser_speech_synthesis'],
      owner: 'Subject Status Dialogue Runtime',
      gate: 'status_dialogue_real_integration_gate',
      boundary: 'voiceText only'
    },
    {
      id: 'phase0.microphone_capture_capability',
      label: 'Microphone capture capability',
      status:
        browser.mediaDevicesAvailable && browser.getUserMediaAvailable && browser.mediaRecorderAvailable
          ? ('pass' as const)
          : ('warn' as const),
      detail:
        browser.mediaDevicesAvailable && browser.getUserMediaAvailable && browser.mediaRecorderAvailable
          ? 'browser exposes getUserMedia and MediaRecorder; Electron runtime defaults to Chrome STT Bridge, with local Whisper available as a manual fallback mode'
          : 'microphone capture API is incomplete; text input remains the fallback',
      input_refs: ['navigator.mediaDevices.getUserMedia', 'MediaRecorder'],
      output_refs: ['speech_input.audio_stream_ref', 'zhineng:status-dialogue:chrome-stt:transcribe', 'zhineng:status-dialogue:stt:transcribe'],
      owner: 'Subject Status Dialogue Runtime',
      gate: 'status_dialogue_real_integration_gate',
      boundary: 'no microphone permission is requested during Phase 0'
    },
    {
      id: 'phase0.web_speech_stt_capability',
      label: 'Chrome speech recognition bridge',
      status: browser.speechRecognitionAvailable ? ('pass' as const) : ('warn' as const),
      detail: browser.speechRecognitionAvailable
        ? 'Electron SpeechRecognition is visible, but external Chrome STT Bridge is preferred for the reliable Web Speech backend'
        : 'Electron SpeechRecognition is unavailable; external Chrome STT Bridge can still run if Chrome is installed',
      input_refs: ['Chrome webkitSpeechRecognition', 'window.SpeechRecognition', 'window.webkitSpeechRecognition'],
      output_refs: ['speech_transcript', 'chrome_stt_bridge_result.v1'],
      owner: 'Subject Status Dialogue Runtime',
      gate: 'status_dialogue_real_integration_gate',
      boundary: 'STT starts only after the operator clicks the STT control'
    }
  ]

  return {
    schema: STATUS_DIALOGUE_REAL_ENV_CHECK_SCHEMA,
    phase: 'real_phase_0',
    generated_at: generatedAt,
    status: items.some((item) => item.status === 'warn') ? 'warn' : 'pass',
    provider: {
      configured: false,
      api_key_configured: false,
      model: 'unknown',
      base_url_host: 'browser_preview',
      provider_label: 'browser_preview'
    },
    browser,
    items,
    input_ports: ['window.electron.invoke', 'navigator.mediaDevices', 'window.speechSynthesis'],
    output_ports: ['status_dialogue_real_env_check.v1', 'browser_preview_status'],
    boundaries: ['patrol_only', 'no_api_probe_in_browser_preview', 'no_microphone_permission_request'],
    source: 'browser_preview'
  }
}

async function requestStatusDialogueRealEnvCheck(): Promise<StatusDialogueRealEnvCheckResult> {
  const browser = buildBrowserSpeechCapabilities()
  if (!window.electron?.invoke) {
    return buildBrowserPreviewRealEnvCheck()
  }
  try {
    const result = (await window.electron.invoke('zhineng:status-dialogue:real-env:check', {
      browser
    })) as StatusDialogueRealEnvCheckResult
    return result
  } catch (error) {
    return buildBrowserPreviewRealEnvCheck(error instanceof Error ? error.message : String(error))
  }
}

async function requestStatusDialogueModelTest(): Promise<StatusDialogueModelTestResult> {
  if (!window.electron?.invoke) {
    return {
      schema: STATUS_DIALOGUE_MODEL_TEST_SCHEMA,
      phase: 'real_phase_1',
      generated_at: new Date().toISOString(),
      success: false,
      status: 'warn',
      adapter_id: STATUS_DIALOGUE_REMOTE_ADAPTER_ID,
      provider_label: 'browser_preview',
      model: 'unknown',
      base_url_host: 'browser_preview',
      error: 'Electron IPC is unavailable; real model API probe requires the desktop runtime.',
      input_refs: ['status_dialogue_api_probe.prompt'],
      output_refs: ['status_dialogue_model_test.v1'],
      boundaries: ['patrol_only', 'no_browser_preview_api_probe']
    }
  }
  try {
    return (await window.electron.invoke('zhineng:status-dialogue:model:test')) as StatusDialogueModelTestResult
  } catch (error) {
    return {
      schema: STATUS_DIALOGUE_MODEL_TEST_SCHEMA,
      phase: 'real_phase_1',
      generated_at: new Date().toISOString(),
      success: false,
      status: 'fail',
      adapter_id: STATUS_DIALOGUE_REMOTE_ADAPTER_ID,
      provider_label: 'openai-compatible',
      model: 'unknown',
      base_url_host: 'unknown',
      error: error instanceof Error ? error.message : String(error),
      input_refs: ['status_dialogue_api_probe.prompt'],
      output_refs: ['status_dialogue_model_test.v1'],
      boundaries: ['patrol_only', 'model_test_failed_before_response']
    }
  }
}

function buildBrowserPreviewTtsHealth(reason: string): StatusDialogueTtsHealthResult {
  return {
    schema: 'status_dialogue_tts_health.v1',
    generated_at: new Date().toISOString(),
    adapter_id: 'cosyvoice_local_http',
    configured: false,
    reachable: false,
    status: 'fallback',
    base_url_host: 'browser_preview',
    error: reason
  }
}

function buildBrowserPreviewLocalSttHealth(reason: string, model: StatusDialogueSttModel = 'base'): StatusDialogueLocalSttHealthResult {
  return {
    schema: 'status_dialogue_local_stt_health.v1',
    generated_at: new Date().toISOString(),
    adapter_id: 'local_whisper_persistent_service',
    configured: false,
    reachable: false,
    status: 'fallback',
    base_url_host: 'browser_preview',
    model,
    error: reason
  }
}

function buildBrowserPreviewRemoteSttHealth(reason: string): StatusDialogueRemoteSttHealthResult {
  return {
    schema: 'status_dialogue_remote_stt_health.v1',
    generated_at: new Date().toISOString(),
    adapter_id: 'openai_compatible_stt',
    configured: false,
    reachable: false,
    status: 'fallback',
    base_url_host: 'browser_preview',
    endpoint_path: '/audio/transcriptions',
    model: 'whisper-1',
    timeout_ms: 30000,
    error: reason
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return window.btoa(binary)
}

async function requestBrowserPreviewCosyVoiceTtsHealth(): Promise<StatusDialogueTtsHealthResult> {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const config = DEFAULT_COSYVOICE_TTS_CONFIG
  try {
    const response = await fetch(`${config.base_url}${config.health_path}`, {
      method: 'GET',
      mode: 'cors'
    })
    const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (!response.ok) {
      return buildBrowserPreviewTtsHealth(`CosyVoice local HTTP returned ${response.status}`)
    }
    const health = (await response.json().catch(() => ({}))) as { status?: string }
    return {
      schema: 'status_dialogue_tts_health.v1',
      generated_at: new Date().toISOString(),
      adapter_id: 'cosyvoice_local_http',
      configured: true,
      reachable: health.status === 'ok',
      status: health.status === 'ok' ? 'ready' : 'fallback',
      base_url_host: config.base_url,
      latency_ms: Math.max(0, Math.round(endedAt - startedAt))
    }
  } catch (error) {
    return buildBrowserPreviewTtsHealth(error instanceof Error ? error.message : String(error))
  }
}

async function requestBrowserPreviewCosyVoiceTtsSynthesis(
  request: StatusDialogueTtsSynthesisRequest
): Promise<StatusDialogueTtsSynthesisResult> {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const config = {
    ...DEFAULT_COSYVOICE_TTS_CONFIG,
    voice: request.voice_profile.voice_id || DEFAULT_COSYVOICE_TTS_CONFIG.voice,
    stream_preferred: false
  }
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), config.timeout_ms)
  try {
    const response = await fetch(`${config.base_url}${config.endpoint_path}`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(buildCosyVoiceRequestBody(config, request.plan)),
      signal: controller.signal
    })
    const headersAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      return {
        schema: 'status_dialogue_tts_synthesis.v1',
        generated_at: new Date().toISOString(),
        success: false,
        adapter_id: 'cosyvoice_local_http',
        voice_profile_id: request.voice_profile.profile_id,
        latency_ms: Math.max(0, Math.round(headersAt - startedAt)),
        fallback_reason: `CosyVoice browser preview returned ${response.status}`,
        error: errorText.slice(0, 240)
      }
    }
    const audioBuffer = await response.arrayBuffer()
    const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const audioMimeType = response.headers.get('content-type') || 'audio/wav'
    return {
      schema: 'status_dialogue_tts_synthesis.v1',
      generated_at: new Date().toISOString(),
      success: true,
      adapter_id: 'cosyvoice_local_http',
      voice_profile_id: request.voice_profile.profile_id,
      latency_ms: Math.max(0, Math.round(endedAt - startedAt)),
      audio_data_url: `data:${audioMimeType};base64,${arrayBufferToBase64(audioBuffer)}`,
      audio_mime_type: audioMimeType
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    return {
      schema: 'status_dialogue_tts_synthesis.v1',
      generated_at: new Date().toISOString(),
      success: false,
      adapter_id: 'cosyvoice_local_http',
      voice_profile_id: request.voice_profile.profile_id,
      latency_ms: Math.max(0, Math.round(endedAt - startedAt)),
      fallback_reason: 'CosyVoice browser preview fetch failed',
      error: message
    }
  } finally {
    window.clearTimeout(timeout)
  }
}

async function requestStatusDialogueTtsHealth(): Promise<StatusDialogueTtsHealthResult> {
  if (!window.electron?.invoke) {
    return await requestBrowserPreviewCosyVoiceTtsHealth()
  }
  try {
    return (await window.electron.invoke('zhineng:status-dialogue:tts:health')) as StatusDialogueTtsHealthResult
  } catch (error) {
    return buildBrowserPreviewTtsHealth(error instanceof Error ? error.message : String(error))
  }
}

async function requestStatusDialogueLocalSttHealth(input: {
  model: StatusDialogueSttModel
  ensure?: boolean
}): Promise<StatusDialogueLocalSttHealthResult> {
  if (!window.electron?.invoke) {
    return buildBrowserPreviewLocalSttHealth('Electron IPC unavailable for local STT health', input.model)
  }
  try {
    return (await window.electron.invoke('zhineng:status-dialogue:stt:health', {
      model: input.model,
      ensure: input.ensure
    })) as StatusDialogueLocalSttHealthResult
  } catch (error) {
    return buildBrowserPreviewLocalSttHealth(error instanceof Error ? error.message : String(error), input.model)
  }
}

async function requestStatusDialogueRemoteSttHealth(): Promise<StatusDialogueRemoteSttHealthResult> {
  if (!window.electron?.invoke) {
    return buildBrowserPreviewRemoteSttHealth('Electron IPC unavailable for remote STT health')
  }
  try {
    return (await window.electron.invoke('zhineng:status-dialogue:stt:remote-health')) as StatusDialogueRemoteSttHealthResult
  } catch (error) {
    return buildBrowserPreviewRemoteSttHealth(error instanceof Error ? error.message : String(error))
  }
}

async function requestStatusDialogueTtsSynthesis(
  request: StatusDialogueTtsSynthesisRequest
): Promise<StatusDialogueTtsSynthesisResult> {
  if (!window.electron?.invoke) {
    return await requestBrowserPreviewCosyVoiceTtsSynthesis(request)
  }
  try {
    return (await window.electron.invoke(
      'zhineng:status-dialogue:tts:synthesize',
      request
    )) as StatusDialogueTtsSynthesisResult
  } catch (error) {
    return {
      schema: 'status_dialogue_tts_synthesis.v1',
      generated_at: new Date().toISOString(),
      success: false,
      adapter_id: 'cosyvoice_local_http',
      voice_profile_id: request.voice_profile.profile_id,
      fallback_reason: 'CosyVoice IPC failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function requestBrowserPreviewCosyVoiceTtsStream(
  request: StatusDialogueTtsStreamRequest,
  onEvent?: (event: StatusDialogueTtsStreamEvent) => void
): Promise<{
  success?: boolean
  sessionId?: string
  frameCount?: number
  finalFrameCount?: number
  firstFrameMs?: number
  totalStreamMs?: number
  cacheHit?: boolean
  audioDataUrl?: string
  audioMimeType?: string
  frameSequenceOk?: boolean
  assemblyErrors?: string[]
  error?: string
}> {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const sessionId = request.sessionId
  const chunkId = request.plan.source_output_id || sessionId
  const config = {
    ...DEFAULT_COSYVOICE_TTS_CONFIG,
    voice: request.voice_profile.voice_id || DEFAULT_COSYVOICE_TTS_CONFIG.voice,
    response_format: request.response_format ?? request.responseFormat ?? DEFAULT_COSYVOICE_TTS_CONFIG.response_format,
    stream_preferred: true
  }
  const emit = (event: StatusDialogueTtsStreamEvent) => {
    onEvent?.({
      schema: 'status_dialogue_tts_stream_event.v1',
      sessionId,
      session_id: sessionId,
      ...event
    })
  }
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), config.timeout_ms)

  try {
    emit({ type: 'start' })
    const response = await fetch(`${config.base_url}${config.endpoint_path}`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'content-type': 'application/json; charset=utf-8', accept: 'audio/*' },
      body: JSON.stringify(buildCosyVoiceRequestBody(config, request.plan)),
      signal: controller.signal
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      const error = `CosyVoice browser stream returned ${response.status}: ${errorText.slice(0, 160)}`
      emit({ type: 'error', error })
      return {
        success: false,
        sessionId,
        totalStreamMs: Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)),
        error
      }
    }
    if (!response.body) {
      const error = 'CosyVoice browser stream response has no body'
      emit({ type: 'error', error })
      return {
        success: false,
        sessionId,
        totalStreamMs: Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)),
        error
      }
    }

    const audioMimeType = response.headers.get('content-type') || 'audio/wav'
    const frames: StreamingTtsAudioFrame[] = []
    const reader = response.body.getReader()
    let sequence = 0
    let firstFrameMs: number | undefined

    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        if (!next.value?.length) continue
        sequence += 1
        firstFrameMs = firstFrameMs ?? Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt))
        const exactBuffer = next.value.buffer.slice(next.value.byteOffset, next.value.byteOffset + next.value.byteLength)
        const frame: StreamingTtsAudioFrame = {
          schema: 'streaming_tts_audio_frame.v1',
          frame_id: `${chunkId}:browser-stream-frame:${sequence}`,
          chunk_id: chunkId,
          sequence,
          audio_mime_type: audioMimeType,
          audio_base64: arrayBufferToBase64(exactBuffer),
          final: false,
          generated_at: new Date().toISOString()
        }
        frames.push(frame)
        emit({ type: 'frame', frame, cache_hit: false })
      }
    } finally {
      reader.releaseLock()
    }

    const finalFrame: StreamingTtsAudioFrame = {
      schema: 'streaming_tts_audio_frame.v1',
      frame_id: `${chunkId}:browser-stream-frame:${sequence + 1}:final`,
      chunk_id: chunkId,
      sequence: sequence + 1,
      audio_mime_type: audioMimeType,
      audio_base64: '',
      final: true,
      generated_at: new Date().toISOString()
    }
    frames.push(finalFrame)
    emit({ type: 'frame', frame: finalFrame, cache_hit: false })
    const totalStreamMs = Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt))
    const assembly = assembleStreamingTtsAudioFrames(frames)
    emit({
      type: 'done',
      frame_count: frames.filter((frame) => !frame.final).length,
      final_frame_count: 1,
      first_frame_ms: firstFrameMs,
      total_stream_ms: totalStreamMs
    })
    return {
      success: assembly.errors.length === 0,
      sessionId,
      frameCount: frames.filter((frame) => !frame.final).length,
      finalFrameCount: 1,
      firstFrameMs,
      totalStreamMs,
      cacheHit: false,
      audioDataUrl: assembly.audio_data_url,
      audioMimeType: assembly.audio_mime_type,
      frameSequenceOk: assembly.ordered && assembly.errors.length === 0,
      assemblyErrors: assembly.errors
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emit({ type: 'error', error: message })
    return {
      success: false,
      sessionId,
      totalStreamMs: Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)),
      error: message
    }
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function requestStatusDialogueTtsStream(
  request: StatusDialogueTtsStreamRequest,
  onEvent?: (event: StatusDialogueTtsStreamEvent) => void
): Promise<{
  success?: boolean
  sessionId?: string
  frameCount?: number
  finalFrameCount?: number
  firstFrameMs?: number
  totalStreamMs?: number
  cacheHit?: boolean
  audioDataUrl?: string
  audioMimeType?: string
  frameSequenceOk?: boolean
  assemblyErrors?: string[]
  error?: string
}> {
  if (!window.electron?.invoke || !window.electron?.on) {
    return await requestBrowserPreviewCosyVoiceTtsStream(request, onEvent)
  }

  const frames: StreamingTtsAudioFrame[] = []
  let finalFrameCount = 0
  let firstFrameMs: number | undefined
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const waitForFrameEvents = async (expectedFrameCount?: number, expectedFinalFrameCount?: number): Promise<void> => {
    const expectedAudioFrames = Math.max(0, expectedFrameCount ?? 0)
    const expectedFinalFrames = Math.max(0, expectedFinalFrameCount ?? 0)
    if (expectedAudioFrames === 0 && expectedFinalFrames === 0) return
    const deadline = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 1200
    while ((typeof performance !== 'undefined' ? performance.now() : Date.now()) < deadline) {
      const audioFrameCount = frames.filter((frame) => !frame.final).length
      if (audioFrameCount >= expectedAudioFrames && finalFrameCount >= expectedFinalFrames) return
      await new Promise((resolve) => window.setTimeout(resolve, 25))
    }
    logStatusDialogueVoiceEvent('tts_stream_frame_wait_timeout', {
      session_id: request.sessionId,
      expected_frame_count: expectedAudioFrames,
      actual_frame_count: frames.filter((frame) => !frame.final).length,
      expected_final_frame_count: expectedFinalFrames,
      actual_final_frame_count: finalFrameCount
    })
  }
  const offStream = window.electron.on(
    'zhineng:status-dialogue:tts:synthesize:stream:event',
    (event: StatusDialogueTtsStreamEvent) => {
      const eventSessionId = event.sessionId || event.session_id
      if (eventSessionId !== request.sessionId) return
      onEvent?.(event)
      if (event.type !== 'frame' || !event.frame) return
      frames.push(event.frame)
      if (event.frame.final) {
        finalFrameCount += 1
        return
      }
      firstFrameMs = firstFrameMs ?? Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt))
    }
  )

  try {
    const result = (await window.electron.invoke('zhineng:status-dialogue:tts:synthesize:stream', request)) as {
      success?: boolean
      sessionId?: string
      frameCount?: number
      finalFrameCount?: number
      firstFrameMs?: number
      totalStreamMs?: number
      cacheHit?: boolean
      error?: string
    }
    if (result.success === true) {
      await waitForFrameEvents(result.frameCount, result.finalFrameCount)
    }
    const assembly = frames.length > 0 ? assembleStreamingTtsAudioFrames(frames) : undefined
    return {
      ...result,
      frameCount: result.frameCount ?? frames.filter((frame) => !frame.final).length,
      finalFrameCount: result.finalFrameCount ?? finalFrameCount,
      firstFrameMs: result.firstFrameMs ?? firstFrameMs,
      totalStreamMs:
        result.totalStreamMs ??
        Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)),
      audioDataUrl: assembly?.audio_data_url,
      audioMimeType: assembly?.audio_mime_type,
      frameSequenceOk: assembly ? assembly.ordered && assembly.errors.length === 0 : undefined,
      assemblyErrors: assembly?.errors
    }
  } catch (error) {
    return {
      success: false,
      sessionId: request.sessionId,
      frameCount: frames.length,
      finalFrameCount,
      firstFrameMs,
      totalStreamMs: Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)),
      error: error instanceof Error ? error.message : String(error)
    }
  } finally {
    offStream()
  }
}

function logStatusDialogueVoiceEvent(event: string, payload: Record<string, unknown> = {}): void {
  if (!window.electron?.invoke) return
  void window.electron.invoke('zhineng:status-dialogue:voice-log', { event, payload }).catch(() => undefined)
}

function buildStatusDialogueContext({
  focusTarget,
  graphNodes,
  starCount,
  statusSnapshot,
  systemPatrolIndexSummary,
  conversationMemory,
  runtimeVoiceDiagnostic,
  voiceBridgeState
}: {
  focusTarget: FocusedGraphTarget
  graphNodes: GraphPoint[]
  starCount: number
  statusSnapshot: StatusSnapshot
  systemPatrolIndexSummary?: SystemPatrolDialogueIndexSummary
  conversationMemory: StatusDialogueConversationMemoryCard
  runtimeVoiceDiagnostic?: StatusDialogueRuntimeVoiceDiagnostic
  voiceBridgeState?: XiaozhiStyleVoiceBridgeState
}): StatusDialogueContext {
  return {
    schema: 'status_dialogue_context.v1',
    focus: {
      title: getGraphFocusTitle(focusTarget),
      status: getGraphFocusStatus(focusTarget),
      detail: getGraphFocusDetail(focusTarget),
      depth: focusTarget.depth,
      owner: getGraphFocusOwner(focusTarget),
      gate: getGraphFocusGate(focusTarget),
      compass: getGraphFocusCompass(focusTarget),
      childCount: focusTarget.star ? 0 : focusTarget.node.stars.length
    },
    global: {
      moduleCount: Math.max(0, graphNodes.length - 1),
      starCount,
      scope: 'independent visual projection, not live social/event graph'
    },
    boundaries: [
      'status-only inspection',
      'no external action',
      'no real social graph read',
      'no real event graph read',
      'cloud Chrome STT by default; local Whisper only when manually selected; no audio sample persistence',
      'candidate and forecast are not confirmed facts'
    ],
    statusSnapshot,
    systemPatrolIndexSummary,
    selfAwarenessProfile: buildDefaultSelfAwarenessProfile(),
    conversationMemory,
    runtimeVoiceDiagnostic,
    voiceBridgeState: voiceBridgeState
      ? {
          schema: voiceBridgeState.schema,
          stage: voiceBridgeState.stage,
          emotion: voiceBridgeState.emotion,
          listen_active: voiceBridgeState.listen_active,
          speaking_active: voiceBridgeState.speaking_active,
          transcript_preview: voiceBridgeState.transcript_preview,
          last_sentence: voiceBridgeState.last_sentence,
          last_event_type: voiceBridgeState.last_event_type,
          event_count: voiceBridgeState.event_count,
          route_a_boundary: voiceBridgeState.route_a_boundary
        }
      : undefined,
    config: DEFAULT_STATUS_DIALOGUE_CONFIG
  }
}

function buildStatusDialoguePolicyBundle(
  input: string,
  context: StatusDialogueContext,
  systemEventSnapshot?: SystemEventSnapshot
): { policyDecision: DialoguePolicyDecision; patrolInsertions: PatrolFindingInsert[] } {
  const generatedAt = new Date().toISOString()
  const snapshotInserts = context.statusSnapshot
    ? buildPatrolFindingInsertsFromSnapshot({
        snapshot: context.statusSnapshot,
        generatedAt,
        maxItems: 14
      })
    : []
  const eventInserts = systemEventSnapshot
    ? buildPatrolFindingInsertsFromSystemEventSnapshot({
        eventSnapshot: systemEventSnapshot,
        generatedAt,
        maxItems: 10
      })
    : []
  const patrolIndexInsert = context.systemPatrolIndexSummary
    ? buildPatrolFindingInsertFromSystemPatrolIndexSummary({
        summary: context.systemPatrolIndexSummary,
        generatedAt
      })
    : undefined
  const focusInsert = buildPatrolFindingInsertFromFocus({
    focus: context.focus,
    generatedAt
  })
  const patrolInsertions = [patrolIndexInsert, focusInsert, ...eventInserts, ...snapshotInserts].filter(
    (insert): insert is PatrolFindingInsert => Boolean(insert)
  )
  return {
    patrolInsertions,
    policyDecision: buildDialoguePolicyDecision({
      userQuery: input || 'status',
      focus: context.focus,
      snapshot: context.statusSnapshot,
      config: context.config ?? DEFAULT_STATUS_DIALOGUE_CONFIG,
      patrolInsertions,
      generatedAt
    })
  }
}

function buildStatusDialogueUserPrompt(
  input: string,
  context: StatusDialogueContext,
  systemEventSnapshot?: SystemEventSnapshot
): string {
  const snapshot = context.statusSnapshot
  const { policyDecision, patrolInsertions } = buildStatusDialoguePolicyBundle(input, context, systemEventSnapshot)
  const stateVoiceLines = snapshot
    ? buildStatusDialogueStateLines({
        statusSnapshot: snapshot,
        systemEventSnapshot,
        focusName: context.focus.title,
        focusChildCount: context.focus.childCount,
        focusIsLeaf: context.focus.childCount === 0
      })
    : undefined
  const selectedVoiceOpening =
    stateVoiceLines?.conclusion ??
    buildStatusDialogueVoiceOpeningText({
      globalStatus: snapshot?.global_status,
      missingStatusCount: snapshot?.missing_module_ids.length ?? 0,
      staleStatusCount: snapshot?.stale_module_ids.length ?? 0,
      conflictCount: snapshot?.conflict_module_ids.length ?? 0,
      readErrorCount: snapshot?.read_errors.length ?? 0
    })
  return JSON.stringify(
    {
      prompt_version: STATUS_DIALOGUE_PROMPT_VERSION,
      user_query: input || 'status',
      required_voice: 'first_person_subject',
      output_style: 'concise_high_quality',
      dialogue_policy: policyDecision,
      dialogue_turn_intent: policyDecision.turn_intent,
      patrol_insertions: summarizePatrolFindingInsertsForPrompt(patrolInsertions, 10),
      system_patrol_index_summary: context.systemPatrolIndexSummary
        ? {
            readable: context.systemPatrolIndexSummary.readable,
            source: context.systemPatrolIndexSummary.source,
            index_path: context.systemPatrolIndexSummary.index_path,
            index_generated_at: context.systemPatrolIndexSummary.index_generated_at,
            gate_decision: context.systemPatrolIndexSummary.gate_decision,
            strict_mode: context.systemPatrolIndexSummary.strict_mode,
            modules_total: context.systemPatrolIndexSummary.modules_total,
            modules_sampled: context.systemPatrolIndexSummary.modules_sampled,
            modules_by_patrol_state: context.systemPatrolIndexSummary.modules_by_patrol_state,
            modules_by_source_hash_status: context.systemPatrolIndexSummary.modules_by_source_hash_status,
            modules_by_gate_decision: context.systemPatrolIndexSummary.modules_by_gate_decision,
            blocked_modules: context.systemPatrolIndexSummary.blocked_modules.slice(0, 8),
            required_failures: context.systemPatrolIndexSummary.required_failures.slice(0, 10),
            read_errors: context.systemPatrolIndexSummary.read_errors,
            summary: context.systemPatrolIndexSummary.summary
          }
        : undefined,
      xiaozhi_style_voice_bridge_state: context.voiceBridgeState
        ? {
            stage: context.voiceBridgeState.stage,
            emotion: context.voiceBridgeState.emotion,
            listen_active: context.voiceBridgeState.listen_active,
            speaking_active: context.voiceBridgeState.speaking_active,
            transcript_preview: context.voiceBridgeState.transcript_preview,
            last_sentence: context.voiceBridgeState.last_sentence,
            last_event_type: context.voiceBridgeState.last_event_type,
            event_count: context.voiceBridgeState.event_count,
            boundary: context.voiceBridgeState.route_a_boundary
          }
        : undefined,
      runtime_voice_diagnostic: context.runtimeVoiceDiagnostic
        ? {
            source: context.runtimeVoiceDiagnostic.source,
            result: context.runtimeVoiceDiagnostic.result,
            next_action: context.runtimeVoiceDiagnostic.next_action,
            pre_entry: context.runtimeVoiceDiagnostic.summary.pre_entry,
            turns: context.runtimeVoiceDiagnostic.summary.turns,
            post_entry: context.runtimeVoiceDiagnostic.summary.post_entry,
            entry_diagnosis_result: context.runtimeVoiceDiagnostic.summary.entry_diagnosis_result,
            entry_diagnosis_next_action: context.runtimeVoiceDiagnostic.summary.entry_diagnosis_next_action,
            entry_snapshot: context.runtimeVoiceDiagnostic.summary.entry_snapshot,
            runtime_audit: context.runtimeVoiceDiagnostic.summary.runtime_audit,
            remote_config_ready_for_probe: context.runtimeVoiceDiagnostic.summary.remote_config_ready_for_probe,
            remote_config_missing: context.runtimeVoiceDiagnostic.summary.remote_config_missing,
            goal_result: context.runtimeVoiceDiagnostic.summary.goal_result,
            goal_summary: context.runtimeVoiceDiagnostic.summary.goal_summary,
            boundary: context.runtimeVoiceDiagnostic.boundary
          }
        : undefined,
      system_event_snapshot: systemEventSnapshot
        ? {
            events_total: systemEventSnapshot.events_total,
            events_fresh: systemEventSnapshot.events_fresh,
            events_stale: systemEventSnapshot.events_stale,
            events_critical: systemEventSnapshot.events_critical,
            top_events: systemEventSnapshot.top_events.slice(0, 5),
            missing_publishers: systemEventSnapshot.missing_publishers.slice(0, 8),
            read_errors: systemEventSnapshot.read_errors.slice(0, 5)
          }
        : undefined,
      default_reply_rule: {
        order: ['answer_user_intent', 'then_patrol_evidence_if_relevant', 'attention', 'next'],
        ambient_or_unclear: 'ask for confirmation; do not enter the fixed patrol template',
        missing_status: 'say missing explicitly; never guess',
        status_refs: 'cite status card, snapshot, graph focus or policy insert ids',
        xiaozhi_style: 'use the voice bridge stage and emotion to make the reply natural, but do not replace patrol evidence with small talk',
        tts: 'only voiceText is spoken'
      },
      voice_opening_policy: {
        selected_first_sentence: selectedVoiceOpening,
        state_evidence: stateVoiceLines
          ? {
              evidence: stateVoiceLines.evidence,
              attention: stateVoiceLines.attention,
              next: stateVoiceLines.next
            }
          : undefined,
        rule: 'The first voice sentence should preserve this status-specific meaning, but vary wording naturally across turns. Do not replace concrete counts with a generic status-gap sentence.'
      },
      context
    },
    null,
    2
  )
}

function sanitizeEventBroadcastVoiceLine(value: string): string {
  const normalized = firstVoiceSentence(humanizeStatusDialogueText(value))
    .replace(/\b(?:status|runtime|audit|patrol|source|event|module|voice|tts|stt|dialogue|graph|snapshot|insert)\b/gi, '')
    .replace(/\b[a-z][a-z0-9_:/.-]{2,}\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return truncateVoiceLine(normalized || '有一项状态变化。', 16)
}

function renderVoiceScriptPatchForSpeech(patch: VoiceScriptPatch): string {
  if (patch.play_mode === 'silent') return ''
  const eventLine = sanitizeEventBroadcastVoiceLine(patch.voice_text || patch.bridge_line)
  if (patch.play_mode === 'interrupt_now') return compactVoiceWhitespace(`先打断一下，${eventLine}`)
  if (patch.play_mode === 'after_current_sentence') return compactVoiceWhitespace(`插一句，${eventLine}`)
  if (patch.play_mode === 'idle_reminder') return compactVoiceWhitespace(`补充提醒，${eventLine}`)
  return eventLine
}

function sanitizeSpeakableEventBroadcastVoiceLine(value: string): string {
  const normalized = firstVoiceSentence(humanizeStatusDialogueText(value))
    .replace(/\b(?:status|runtime|audit|patrol|source|event|module|voice|tts|stt|dialogue|graph|snapshot|insert)\b/gi, '')
    .replace(/\b[a-z][a-z0-9_:/.-]{2,}\b/gi, '')
    .replace(/^[\s:：.,，。;；\-_/]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const meaningful = normalized.replace(/[^\u4e00-\u9fff0-9%]/g, '')
  if (meaningful.length < 4) return ''
  if (/^当前完成度是?100%?$/.test(meaningful)) return ''
  return truncateVoiceLine(normalized, 80)
}

function renderSpeakableVoiceScriptPatchForSpeech(patch: VoiceScriptPatch): string {
  if (patch.play_mode === 'silent') return ''
  const eventLine = sanitizeSpeakableEventBroadcastVoiceLine(patch.voice_text || patch.bridge_line)
  if (!eventLine) return ''
  if (patch.play_mode === 'interrupt_now') return compactVoiceWhitespace(`先打断一下，${eventLine}`)
  if (patch.play_mode === 'after_current_sentence') return compactVoiceWhitespace(`插一句，${eventLine}`)
  if (patch.play_mode === 'idle_reminder') return compactVoiceWhitespace(`补充提醒，${eventLine}`)
  return eventLine
}

function buildVoiceEventBroadcastSpeechText(
  patches: VoiceScriptPatch[],
  limit = STATUS_DIALOGUE_EVENT_BROADCAST_VOICE_MAX_PATCHES,
  maxChars = STATUS_DIALOGUE_EVENT_BROADCAST_VOICE_MAX_CHARS
): string {
  void renderVoiceScriptPatchForSpeech
  const speechText = compactVoiceWhitespace(
    patches
      .filter((patch) => patch.play_mode !== 'silent')
      .slice(0, limit)
      .map(renderSpeakableVoiceScriptPatchForSpeech)
      .filter(Boolean)
      .join(' ')
  )
  return truncateVoiceLine(speechText, maxChars)
}

function buildStoredUnspokenVoicePatch(text: string, index: number): VoiceScriptPatch {
  const normalized = compactVoiceWhitespace(text)
  return {
    schema: 'voice_script_patch.v1',
    patch_id: `vsp_unspoken_${index}_${normalizeVoiceOverlapText(normalized).slice(0, 32) || 'patrol'}`,
    source_request_id: 'unspoken_patrol_events',
    play_mode: 'idle_reminder',
    bridge_line: '补充上一轮巡检。',
    voice_text: normalized,
    resume_line: '',
    emotion_hint: 'focused',
    voice_profile_lock: true,
    max_sentences: 1
  }
}

function mergeVoiceScriptPatchesById(existing: VoiceScriptPatch[], next: VoiceScriptPatch[], maxItems = 6): VoiceScriptPatch[] {
  const merged: VoiceScriptPatch[] = []
  const seen = new Set<string>()
  for (const patch of [...existing, ...next]) {
    if (patch.play_mode === 'silent') continue
    const key = patch.patch_id || normalizeVoiceOverlapText(patch.voice_text || patch.bridge_line)
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(patch)
    if (merged.length >= maxItems) break
  }
  return merged
}

function selectUnspokenPatrolEventsAfterSpeech(patches: VoiceScriptPatch[], spokenCount: number, maxItems = 6): VoiceScriptPatch[] {
  return patches
    .filter((patch) => patch.play_mode !== 'silent')
    .slice(Math.max(0, spokenCount))
    .slice(0, maxItems)
}

function shouldSpeakVoiceEventBroadcast(policyDecision: DialoguePolicyDecision): boolean {
  if (!policyDecision.turn_intent.should_run_patrol) return false
  return (
    policyDecision.turn_intent.intent === 'status_patrol' ||
    policyDecision.turn_intent.intent === 'voice_control' ||
    policyDecision.intent_lane === 'status_patrol' ||
    policyDecision.intent_lane === 'progress_audit' ||
    policyDecision.intent_lane === 'error_recovery'
  )
}

function filterSpeakableVoiceEventRequests(
  requests: VoiceEventBroadcastRequest[],
  policyDecision: DialoguePolicyDecision
): VoiceEventBroadcastRequest[] {
  if (!shouldSpeakVoiceEventBroadcast(policyDecision)) return []
  return requests.filter((request) => request.severity === 'critical' || request.severity === 'blocked')
}

function buildVoiceEventBroadcastPanelState({
  requests,
  patches,
  queue,
  source,
  lastTrace,
  lastLatencyTrace,
  lastError,
  replayCount = 0,
  lastReplayAt
}: {
  requests: VoiceEventBroadcastRequest[]
  patches: VoiceScriptPatch[]
  queue?: VoiceBroadcastQueueState
  source: string
  lastTrace?: VoiceOutputTrace
  lastLatencyTrace?: VoiceLatencyTrace
  lastError?: string
  replayCount?: number
  lastReplayAt?: string
}): VoiceEventBroadcastPanelState {
  const generatedAt = new Date().toISOString()
  return {
    generatedAt,
    source,
    requests,
    patches,
    queue: queue ?? buildVoiceBroadcastQueueState({ requests, generatedAt }),
    ...(lastTrace ? { last_trace: lastTrace } : {}),
    ...(lastLatencyTrace ? { last_latency_trace: lastLatencyTrace } : {}),
    ...(lastError ? { last_error: lastError } : {}),
    ...(lastReplayAt ? { last_replay_at: lastReplayAt } : {}),
    replay_count: replayCount
  }
}

function buildVoiceEventBroadcastPanelStateFromSnapshot({
  snapshot,
  source,
  currentDialogueState = 'idle'
}: {
  snapshot: SystemEventSnapshot
  source: string
  currentDialogueState?: VoiceEventBroadcastRequest['current_dialogue_state']
}): VoiceEventBroadcastPanelState {
  const generatedAt = new Date().toISOString()
  const requests = buildVoiceEventBroadcastRequestsFromSnapshot({
    snapshot,
    currentDialogueState,
    limit: 5,
    createdAt: generatedAt
  })
  const patches = buildVoiceScriptPatchesFromRequests({
    requests,
    events: snapshot.top_events,
    generatedAt
  })
  return buildVoiceEventBroadcastPanelState({
    requests,
    patches,
    queue: buildVoiceBroadcastQueueState({ requests, generatedAt }),
    source
  })
}

function applyVoiceEventPatchesToOutput(
  output: StatusDialogueOutput,
  patches: VoiceScriptPatch[]
): StatusDialogueOutput {
  const speakablePatches = patches
    .filter((patch) => patch.play_mode !== 'silent')
    .slice(0, 3)
  if (speakablePatches.length === 0) return output
  const broadcastText = buildVoiceEventBroadcastSpeechText(speakablePatches)
  if (!broadcastText) return output
  return {
    ...output,
    voiceText: output.voiceText || output.reply,
    thoughts: [
      `voice_event_broadcast: ${speakablePatches.length} patch(es) reserved for concise spoken insert`,
      ...(output.thoughts ?? [])
    ].slice(0, 8),
    statusRefs: Array.from(
      new Set([
        ...(output.statusRefs ?? []),
        'voice_event_broadcast_request.v1',
        'voice_script_patch.v1',
        ...speakablePatches.map((patch) => patch.patch_id)
      ])
    ).slice(0, 10)
  }
}

function applyDialogueTurnIntentToOutput(
  output: StatusDialogueOutput,
  policyDecision: DialoguePolicyDecision
): StatusDialogueOutput {
  const turnIntent = policyDecision.turn_intent
  const userIntentLine = turnIntent.user_intent_response
  const patrolSkipped = !turnIntent.should_run_patrol || turnIntent.intent === 'ambient_or_unclear'
  if (patrolSkipped) {
    return {
      ...output,
      reply: `${userIntentLine} 我先不进入巡检，也不执行动作。请你确认这句话是否要交给我处理。`,
      voiceText: `${userIntentLine} 我先不进入固定巡检流程，等你确认后再继续。`,
      thoughts: [
        `turn_intent: ${turnIntent.intent}`,
        'patrol_skipped: true',
        ...(output.thoughts ?? [])
      ].slice(0, 8),
      statusRefs: output.statusRefs ?? [],
      missingStatus: output.missingStatus ?? []
    }
  }
  const reply = output.reply.includes(userIntentLine) ? output.reply : `${userIntentLine} ${output.reply}`
  const voiceText = (output.voiceText || output.reply).includes(userIntentLine)
    ? output.voiceText || output.reply
    : `${userIntentLine} ${output.voiceText || output.reply}`
  return {
    ...output,
    reply,
    voiceText,
    thoughts: [
      `turn_intent: ${turnIntent.intent}`,
      'patrol_skipped: false',
      ...(output.thoughts ?? [])
    ].slice(0, 8)
  }
}

function buildStatusDialogueStateLines({
  statusSnapshot,
  systemEventSnapshot,
  focusName,
  focusChildCount,
  focusIsLeaf
}: {
  statusSnapshot: StatusSnapshot
  systemEventSnapshot?: SystemEventSnapshot
  focusName: string
  focusChildCount: number
  focusIsLeaf: boolean
}): { conclusion: string; evidence: string; attention: string; next: string } {
  const fresh = Math.max(0, statusSnapshot.cards_fresh ?? 0)
  const stale = Math.max(0, statusSnapshot.cards_stale ?? 0)
  const missing = Math.max(0, statusSnapshot.cards_missing ?? 0, statusSnapshot.missing_module_ids.length)
  const conflicts = Math.max(0, statusSnapshot.conflict_module_ids.length)
  const readErrors = Math.max(0, statusSnapshot.read_errors.length)
  const eventCritical = Math.max(0, systemEventSnapshot?.events_critical ?? 0)
  const eventStale = Math.max(0, systemEventSnapshot?.events_stale ?? 0)
  const eventMissing = Math.max(0, systemEventSnapshot?.missing_publishers.length ?? 0)

  let conclusion = '我正在做只读巡检，当前状态还需要继续确认。'
  if (statusSnapshot.global_status === 'blocked') {
    conclusion = '我看到当前状态被阻塞，先停在只读巡检，不执行外部动作。'
  } else if (readErrors > 0) {
    conclusion = `我读取状态时遇到 ${readErrors} 个错误，先把读卡失败作为第一优先级。`
  } else if (conflicts > 0) {
    conclusion = `我看到 ${conflicts} 个模块状态有冲突，先按最新状态卡巡检，并保留冲突标记。`
  } else if (fresh === 0 && missing > 0) {
    conclusion = `我现在没有拿到新鲜状态卡，${missing} 个模块仍处于缺失状态。`
  } else if (fresh > 0 && (missing > 0 || stale > 0)) {
    conclusion = `我拿到 ${fresh} 张新鲜状态卡，同时还有 ${missing} 个缺失、${stale} 个过期。`
  } else if (stale > 0) {
    conclusion = `我拿到状态卡了，但有 ${stale} 张已经过期，需要优先刷新。`
  } else if (fresh > 0 && statusSnapshot.global_status === 'ok') {
    conclusion = `我拿到 ${fresh} 张新鲜状态卡，当前巡检状态是正常的。`
  }

  const eventEvidence = systemEventSnapshot
    ? `事件快照 fresh/stale/critical：${systemEventSnapshot.events_fresh}/${eventStale}/${eventCritical}。`
    : '事件快照当前不可用。'
  const evidence = `状态卡 fresh/stale/missing：${fresh}/${stale}/${missing}。${eventEvidence}`

  const attentionItems: string[] = []
  if (eventCritical > 0) attentionItems.push(`有 ${eventCritical} 个关键事件需要插入播报队列`)
  if (eventMissing > 0) attentionItems.push(`${eventMissing} 个事件发布者缺失`)
  if (readErrors > 0) attentionItems.push('状态读取错误')
  if (conflicts > 0) attentionItems.push('状态卡冲突')
  if (missing > 0) attentionItems.push('缺失模块状态卡')
  if (stale > 0) attentionItems.push('过期模块状态卡')
  if (attentionItems.length === 0) attentionItems.push(`当前焦点 ${focusName}`)
  const attention = `我正在关注：${attentionItems.slice(0, 3).join('、')}。`

  const next = focusIsLeaf
    ? '下一步我会继续看这个最小星点的属性、证据和负责闸口。'
    : `下一步我可以继续下钻 ${focusChildCount} 个子星点，核对状态来源和边界。`

  return { conclusion, evidence, attention, next }
}

function buildStatusDialogueLocalResult({
  input,
  perspective,
  focusTarget,
  graphNodes,
  starCount,
  statusSnapshot,
  systemEventSnapshot,
  systemPatrolIndexSummary,
  runtimeVoiceDiagnostic
}: {
  input: string
  perspective: StatusDialoguePerspective
  focusTarget: FocusedGraphTarget
  graphNodes: GraphPoint[]
  starCount: number
  statusSnapshot: StatusSnapshot
  systemEventSnapshot?: SystemEventSnapshot
  systemPatrolIndexSummary?: SystemPatrolDialogueIndexSummary
  runtimeVoiceDiagnostic?: StatusDialogueRuntimeVoiceDiagnostic
}): StatusDialogueModelResult {
  const moduleCount = Math.max(0, graphNodes.length - 1)
  const focusName = getGraphFocusTitle(focusTarget)
  const owner = getGraphFocusOwner(focusTarget)
  const gate = getGraphFocusGate(focusTarget)
  const compass = getGraphFocusCompass(focusTarget)
  const status = getGraphFocusStatus(focusTarget)
  const focusContext: StatusDialogueContext['focus'] = {
    title: focusName,
    status,
    detail: getGraphFocusDetail(focusTarget),
    depth: focusTarget.depth,
    owner,
    gate,
    compass,
    childCount: focusTarget.star ? 0 : focusTarget.node.stars.length
  }
  const generatedAt = new Date().toISOString()
  const patrolIndexInsert = systemPatrolIndexSummary
    ? buildPatrolFindingInsertFromSystemPatrolIndexSummary({
        summary: systemPatrolIndexSummary,
        generatedAt
      })
    : undefined
  const patrolInsertions = [
    patrolIndexInsert,
    buildPatrolFindingInsertFromFocus({ focus: focusContext, generatedAt }),
    ...(systemEventSnapshot
      ? buildPatrolFindingInsertsFromSystemEventSnapshot({ eventSnapshot: systemEventSnapshot, generatedAt, maxItems: 10 })
      : []),
    ...buildPatrolFindingInsertsFromSnapshot({ snapshot: statusSnapshot, generatedAt, maxItems: 12 })
  ].filter((insert): insert is PatrolFindingInsert => Boolean(insert))
  const eventBroadcastRequests = systemEventSnapshot
    ? buildVoiceEventBroadcastRequestsFromSnapshot({
        snapshot: systemEventSnapshot,
        currentDialogueState: 'llm',
        limit: 3,
        createdAt: generatedAt
      })
    : []
  const voiceBroadcastQueue = buildVoiceBroadcastQueueState({
    requests: eventBroadcastRequests,
    generatedAt
  })
  const policyDecision = buildDialoguePolicyDecision({
    userQuery: input || 'status',
    focus: focusContext,
    snapshot: statusSnapshot,
    config: DEFAULT_STATUS_DIALOGUE_CONFIG,
    patrolInsertions,
    generatedAt
  })
  const speakableEventBroadcastRequests = filterSpeakableVoiceEventRequests(eventBroadcastRequests, policyDecision)
  const voiceScriptPatches = systemEventSnapshot
    ? buildVoiceScriptPatchesFromRequests({
        requests: speakableEventBroadcastRequests,
        events: systemEventSnapshot.top_events,
        generatedAt
      })
    : []
  const normalizedInput = input.trim().toLowerCase()
  const asksRisk = /risk|safe|安全|风险|闸口|边界/.test(normalizedInput)
  const asksInterface = /interface|api|接口|上下游|adapter|contract/.test(normalizedInput)
  const asksGlobal = /global|all|全部|全局|整体|所有/.test(normalizedInput)
  const subject =
    perspective === 'first_person'
      ? '我当前只读取状态，不执行外部动作。'
      : '系统当前处于只读状态检查模式，不执行外部动作。'
  const scope = asksGlobal
    ? `全局投影包含 ${moduleCount} 个星云模块和 ${starCount} 个内容星点。`
    : `当前焦点是 ${focusName}，层级为 ${focusTarget.depth}。`
  const snapshotLine = `状态卡 fresh/stale/missing：${statusSnapshot.cards_fresh}/${statusSnapshot.cards_stale}/${statusSnapshot.cards_missing}。`
  const eventLine = systemEventSnapshot
    ? `事件 fresh/stale/critical：${systemEventSnapshot.events_fresh}/${systemEventSnapshot.events_stale}/${systemEventSnapshot.events_critical}。`
    : ''
  const topEventLine = systemEventSnapshot?.top_events[0]
    ? `最高优先事件：${systemEventSnapshot.top_events[0].headline}。`
    : ''
  const diagnosticRemoteMissing = runtimeVoiceDiagnostic?.summary.remote_config_missing ?? []
  const diagnosticEntry = runtimeVoiceDiagnostic?.summary.pre_entry ?? runtimeVoiceDiagnostic?.summary.post_entry
  const diagnosticEntrySnapshot = runtimeVoiceDiagnostic?.summary.entry_snapshot
  const diagnosticButtonCenter = diagnosticEntrySnapshot?.stt_button_center
  const diagnosticButtonHit = diagnosticEntrySnapshot?.stt_button_center_hit
  const diagnosticButtonCenterLabel =
    diagnosticButtonCenter?.x !== undefined && diagnosticButtonCenter.y !== undefined
      ? `${Math.round(diagnosticButtonCenter.x)},${Math.round(diagnosticButtonCenter.y)}`
      : undefined
  const diagnosticButtonHitLabel =
    diagnosticButtonHit?.tag || diagnosticButtonHit?.aria_label || diagnosticButtonHit?.text
      ? [diagnosticButtonHit?.tag, diagnosticButtonHit?.aria_label ?? diagnosticButtonHit?.text].filter(Boolean).join('/')
      : undefined
  const diagnosticButtonLine = diagnosticEntrySnapshot
    ? `STT entry button: found=${diagnosticEntrySnapshot.stt_button_found ?? 'unknown'}, disabled=${diagnosticEntrySnapshot.stt_button_disabled ?? 'unknown'}, center=${diagnosticButtonCenterLabel ?? 'unknown'}, hit=${diagnosticButtonHitLabel ?? 'unknown'}.`
    : ''
  const diagnosticLine = runtimeVoiceDiagnostic
    ? `语音复测：${runtimeVoiceDiagnostic.result}；入口：${diagnosticEntry ?? 'unknown'}；回合：${runtimeVoiceDiagnostic.summary.turns ?? 'unknown'}；下一步：${runtimeVoiceDiagnostic.next_action ?? '待确认'}。`
    : ''
  const diagnosticRemoteLine =
    diagnosticRemoteMissing.length > 0
      ? `远端 STT 配置缺口：${diagnosticRemoteMissing.join(', ')}。`
      : runtimeVoiceDiagnostic?.summary.remote_config_ready_for_probe === true
        ? '远端 STT 配置预检已就绪，仍需要真实远端识别样本证明稳定性。'
        : ''
  const boundary = `负责方：${owner}；闸口：${gate}；罗盘：${compass}。`
  const statusLine = `状态：${status}。`
  const riskLine = asksRisk ? '安全和风险查询已收束到状态解释层，真实动作仍需要行动层与末端安全审查。' : ''
  const interfaceLine = asksInterface ? '接口查询已映射到投影契约、只读适配和未来 handoff 边界，不改动原有人际关系辅助系统。' : ''
  const nextLine =
    focusTarget.star
      ? '该星点是当前最小展示单元，可继续查看属性、证据、负责闸口和未来接入位。'
      : `该星云下有 ${focusTarget.node.stars.length} 个子星点，可继续下钻查看子模块状态。`
  const voiceOpening = buildStatusDialogueVoiceOpeningText({
    globalStatus: statusSnapshot.global_status,
    missingStatusCount: statusSnapshot.missing_module_ids.length,
    staleStatusCount: statusSnapshot.stale_module_ids.length,
    conflictCount: statusSnapshot.conflict_module_ids.length,
    readErrorCount: statusSnapshot.read_errors.length
  })
  const stateLines = buildStatusDialogueStateLines({
    statusSnapshot,
    systemEventSnapshot,
    focusName,
    focusChildCount: focusTarget.star ? 0 : focusTarget.node.stars.length,
    focusIsLeaf: Boolean(focusTarget.star)
  })
  const turnIntent = policyDecision.turn_intent
  const userIntentLine = turnIntent.user_intent_response
  const patrolSkippedForTurn = !turnIntent.should_run_patrol || turnIntent.intent === 'ambient_or_unclear'
  const reply = patrolSkippedForTurn
    ? [
        userIntentLine,
        '我先不进入巡检，也不执行动作。请你确认这句话是否要交给我处理。',
        `当前识别意图：${turnIntent.intent}；置信度：${turnIntent.confidence}。`
      ]
        .filter(Boolean)
        .join(' ')
    : [
    subject,
    stateLines.conclusion,
    stateLines.evidence,
    stateLines.attention,
    scope,
    snapshotLine,
    eventLine,
    topEventLine,
    diagnosticLine,
    diagnosticButtonLine,
    diagnosticRemoteLine,
    statusLine,
    boundary,
    riskLine,
    interfaceLine,
    nextLine
  ]
    .filter(Boolean)
    .join(' ')
  const eventVoiceLine = voiceScriptPatches
    ? buildVoiceEventBroadcastSpeechText(voiceScriptPatches)
    : ''
  const voiceSummary = patrolSkippedForTurn
    ? [
        userIntentLine,
        '我先不进入固定巡检流程，等你确认后再继续。'
      ].join(' ')
    : [
    userIntentLine,
    stateLines.conclusion || voiceOpening,
    stateLines.evidence,
    stateLines.attention,
    eventVoiceLine,
    diagnosticButtonLine,
    runtimeVoiceDiagnostic?.result === 'incomplete'
      ? `语音复测还没完成，我看到的断点是 ${diagnosticEntry ?? '入口未确认'}，下一步是 ${runtimeVoiceDiagnostic.next_action ?? '重新跑真实语音回合'}。`
      : runtimeVoiceDiagnostic
        ? `语音复测状态是 ${runtimeVoiceDiagnostic.result}。`
        : '',
    perspective === 'first_person' ? `我在看 ${focusName}，当前只读。` : `当前焦点是 ${focusName}，状态只读。`,
    `状态卡 fresh/stale/missing 是 ${statusSnapshot.cards_fresh}/${statusSnapshot.cards_stale}/${statusSnapshot.cards_missing}。`,
    asksRisk
      ? '我会把风险收束在状态解释层，不触发外部动作。'
      : asksInterface
        ? '我会继续按接口、上下游和边界检查。'
        : focusTarget.star
          ? '这是当前最小展示单元，可查看属性和接入位。'
          : `下一步可下钻 ${focusTarget.node.stars.length} 个子星点。`
  ].join(' ')
  const guarded = guardStatusDialogueOutput(
    {
      schema: 'status_dialogue_output.v1',
      reply,
      voiceText: voiceSummary,
      thoughts: [
        `turn_intent: ${turnIntent.intent}`,
        `patrol_skipped: ${patrolSkippedForTurn}`,
        `intent_response: ${userIntentLine}`,
        `intent_lane: ${policyDecision.intent_lane}`,
        `focus: ${focusName}`,
        `gate: ${gate}`,
        `scope: ${moduleCount} modules / ${starCount} stars`,
        `cards: ${statusSnapshot.cards_fresh} fresh / ${statusSnapshot.cards_stale} stale / ${statusSnapshot.cards_missing} missing`,
        runtimeVoiceDiagnostic ? `voice_retest: ${runtimeVoiceDiagnostic.result}` : 'voice_retest: unavailable',
        diagnosticEntry ? `voice_entry: ${diagnosticEntry}` : 'voice_entry: unknown',
        diagnosticButtonCenterLabel ? `voice_entry_button_center: ${diagnosticButtonCenterLabel}` : 'voice_entry_button_center: unknown',
        diagnosticButtonHitLabel ? `voice_entry_button_hit: ${diagnosticButtonHitLabel}` : 'voice_entry_button_hit: unknown',
        diagnosticRemoteMissing.length > 0 ? `remote_stt_missing: ${diagnosticRemoteMissing.join(', ')}` : 'remote_stt_missing: none',
        `state_conclusion: ${stateLines.conclusion}`,
        systemEventSnapshot
          ? `events: ${systemEventSnapshot.events_fresh} fresh / ${systemEventSnapshot.events_stale} stale / ${systemEventSnapshot.events_critical} critical`
          : 'events: unavailable',
        systemPatrolIndexSummary
          ? `patrol_index: ${systemPatrolIndexSummary.gate_decision} / hash_blocked ${systemPatrolIndexSummary.modules_by_source_hash_status.blocked ?? 0}`
          : 'patrol_index: unavailable',
        asksRisk ? 'attention: risk boundary requested' : 'attention: status summary',
        ...policyDecision.attention_log.slice(0, 3),
        asksInterface ? 'attention: interface boundary requested' : 'boundary: no external action'
      ].slice(0, 12),
      source: 'local fallback',
      statusRefs: Array.from(
        new Set([
          ...policyDecision.status_refs,
          ...(runtimeVoiceDiagnostic ? ['status_dialogue_runtime_voice_diagnostic.v1'] : []),
          ...(systemPatrolIndexSummary ? ['system_patrol_dialogue_read_index.v1', ...systemPatrolIndexSummary.source_refs.slice(0, 4)] : []),
          ...statusSnapshot.cards.slice(0, 5).map((card) => card.module_id),
          ...(systemEventSnapshot?.top_events.slice(0, 5).map((event) => event.event_id) ?? [])
        ])
      ).slice(0, 8),
      missingStatus: Array.from(
        new Set([
          ...policyDecision.missing_status,
          ...statusSnapshot.missing_module_ids,
          ...diagnosticRemoteMissing,
          ...(diagnosticEntry === 'no_graph_window_pointer_activity_after_marker'
            ? ['right_bottom_gui_pointer_entry']
            : []),
          ...(runtimeVoiceDiagnostic?.summary.entry_diagnosis_result === 'stt_button_visible_without_real_pointer_after_marker'
            ? ['right_bottom_gui_stt_button_click']
            : []),
          ...(diagnosticButtonCenterLabel ? [`stt_button_center:${diagnosticButtonCenterLabel}`] : [])
        ])
      ).slice(0, 8),
      mode: DEFAULT_STATUS_DIALOGUE_CONFIG.mode
    },
    {
      perspective,
      config: DEFAULT_STATUS_DIALOGUE_CONFIG,
      statusSnapshot,
      fallbackSource: STATUS_DIALOGUE_LOCAL_FALLBACK_ADAPTER_ID
    }
  )
  return {
    ...guarded,
    policyDecision,
    patrolInsertions,
    eventBroadcastRequests,
    voiceScriptPatches,
    voiceBroadcastQueue
  }
}

async function requestStatusDialogueModel({
  input,
  perspective,
  focusTarget,
  graphNodes,
  starCount,
  statusSnapshot,
  systemEventSnapshot,
  systemPatrolIndexSummary,
  runtimeVoiceDiagnostic,
  conversationMemory,
  voiceBridgeState,
  streamSessionId: requestedStreamSessionId,
  onModelStreamActivity,
  onStreamingVoiceSentence
}: {
  input: string
  perspective: StatusDialoguePerspective
  focusTarget: FocusedGraphTarget
  graphNodes: GraphPoint[]
  starCount: number
  statusSnapshot: StatusSnapshot
  systemEventSnapshot?: SystemEventSnapshot
  systemPatrolIndexSummary?: SystemPatrolDialogueIndexSummary
  runtimeVoiceDiagnostic?: StatusDialogueRuntimeVoiceDiagnostic
  conversationMemory: StatusDialogueConversationMemoryCard
  voiceBridgeState?: XiaozhiStyleVoiceBridgeState
  streamSessionId?: string
  onModelStreamActivity?: (event: StatusDialogueModelStreamActivityEvent) => void
  onStreamingVoiceSentence?: (sentence: string, event: { sentenceIndex: number; spokenPrefix: string }) => void
}): Promise<StatusDialogueModelResult> {
  const fallback = buildStatusDialogueLocalResult({
    input,
    perspective,
    focusTarget,
    graphNodes,
    starCount,
    statusSnapshot,
    systemEventSnapshot,
    systemPatrolIndexSummary,
    runtimeVoiceDiagnostic
  })
  const context = buildStatusDialogueContext({
    focusTarget,
    graphNodes,
    starCount,
    statusSnapshot,
    systemPatrolIndexSummary,
    conversationMemory,
    runtimeVoiceDiagnostic,
    voiceBridgeState
  })
  const { policyDecision, patrolInsertions } = buildStatusDialoguePolicyBundle(input, context, systemEventSnapshot)
  if (!window.electron?.invoke) {
    const guarded = guardStatusDialogueOutput(
      {
        ...fallback,
        reply:
          '我听到了你的语音，也已经把它转成了文字。但当前窗口是普通浏览器预览，没有 Electron IPC，本地设置里的真实模型和 CosyVoice 不能从这里调用。请在 Electron 原生的右下角悬浮窗里继续测试，我会走真实模型链路。',
        voiceText: '我听到了，但当前是浏览器预览。请切到 Electron 原生悬浮窗测试真实模型和语音输出。',
        source: 'browser preview',
        error: 'electron ipc unavailable',
        thoughts: [
          'speech transcript submitted',
          'browser preview: electron ipc unavailable',
          'real model call skipped',
          'cosyvoice ipc skipped',
          'open Electron native graph window for full chain'
        ],
        statusRefs: ['window.electron.invoke'],
        missingStatus: ['electron_ipc_bridge']
      },
      {
        perspective,
        config: DEFAULT_STATUS_DIALOGUE_CONFIG,
        statusSnapshot,
        fallbackSource: STATUS_DIALOGUE_LOCAL_FALLBACK_ADAPTER_ID
      }
    )
    return {
      ...guarded,
      policyDecision,
      patrolInsertions,
      eventBroadcastRequests: fallback.eventBroadcastRequests,
      voiceScriptPatches: fallback.voiceScriptPatches,
      voiceBroadcastQueue: fallback.voiceBroadcastQueue
    }
  }

  const requestPayload = {
    promptVersion: STATUS_DIALOGUE_PROMPT_VERSION,
    systemPrompt: STATUS_DIALOGUE_SYSTEM_PROMPT,
    userPrompt: buildStatusDialogueUserPrompt(input, context, systemEventSnapshot)
  }

  let result: StatusDialogueModelInvokeResult | undefined
  let streamInvokeError: string | undefined
  if (window.electron.on) {
    const streamSessionId = requestedStreamSessionId ?? createStatusDialogueMessageId()
    let rawStreamText = ''
    let previousVoiceText = ''
    let firstDeltaLogged = false
    let firstVoiceProgressLogged = false
    let streamState = buildDefaultVoiceResponseTextStreamState({ streamId: streamSessionId })
    const offStream = window.electron.on(
      'zhineng:status-dialogue:complete:stream:event',
      (eventPayload: StatusDialogueModelStreamEvent) => {
        const eventSessionId = eventPayload.sessionId ?? eventPayload.session_id
        if (eventSessionId !== streamSessionId) return
        if (eventPayload.type !== 'delta' || typeof eventPayload.delta !== 'string') return

        rawStreamText += eventPayload.delta
        if (!firstDeltaLogged) {
          firstDeltaLogged = true
          logStatusDialogueVoiceEvent('model_stream_delta_received', {
            source_output_id: streamSessionId,
            delta_count: eventPayload.deltaCount,
            accumulated_length: eventPayload.accumulatedLength,
            delta_length: eventPayload.delta.length
          })
          onModelStreamActivity?.({
            type: 'delta',
            deltaCount: eventPayload.deltaCount,
            accumulatedLength: eventPayload.accumulatedLength,
            deltaLength: eventPayload.delta.length
          })
        }
        const extractedVoice =
          extractPartialJsonStringField(rawStreamText, 'voice') ||
          extractPartialJsonStringField(rawStreamText, 'voiceText')
        if (extractedVoice.length <= previousVoiceText.length) return

        const voiceDelta = extractedVoice.slice(previousVoiceText.length)
        previousVoiceText = extractedVoice
        if (!firstVoiceProgressLogged) {
          firstVoiceProgressLogged = true
          logStatusDialogueVoiceEvent('model_stream_voice_progress', {
            source_output_id: streamSessionId,
            extracted_voice_length: extractedVoice.length,
            delta_length: voiceDelta.length
          })
          onModelStreamActivity?.({
            type: 'voice_progress',
            extractedVoiceLength: extractedVoice.length,
            deltaLength: voiceDelta.length
          })
        }
        const step = appendVoiceResponseTextDelta(streamState, voiceDelta, {
          minFirstSentenceChars: VOICE_STREAM_SENTENCE_MIN_CHARS
        })
        streamState = step.state
        for (const sentenceEvent of step.events.filter((event) => event.type === 'sentence_ready')) {
          if (!sentenceEvent.sentence) continue
          onStreamingVoiceSentence?.(sentenceEvent.sentence, {
            sentenceIndex: sentenceEvent.sentence_index ?? 1,
            spokenPrefix: sentenceEvent.spoken_prefix ?? sentenceEvent.sentence
          })
        }
      }
    )
    try {
      result = (await window.electron.invoke('zhineng:status-dialogue:complete:stream', {
        ...requestPayload,
        sessionId: streamSessionId
      })) as StatusDialogueModelInvokeResult | undefined
    } catch (error) {
      streamInvokeError = error instanceof Error ? error.message : String(error)
      result = {
        success: false,
        reason: streamInvokeError.includes("No handler registered for 'zhineng:status-dialogue:complete:stream'")
          ? 'stream_ipc_unavailable'
          : 'model_stream_invoke_failed',
        error: streamInvokeError
      }
    } finally {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 80))
      offStream?.()
    }
  }

  if (!result?.success || !result.text) {
    result = (await window.electron.invoke('zhineng:status-dialogue:complete', {
      ...requestPayload,
      streamFallbackReason: result?.reason,
      streamFallbackError: streamInvokeError
    })) as StatusDialogueModelInvokeResult | undefined
  }

  if (!result?.success || !result.text) {
    const guarded = guardStatusDialogueOutput(
      {
        ...fallback,
        source: 'local fallback',
        error: result?.error ?? result?.reason ?? 'model unavailable',
        thoughts: [
          `model fallback: ${result?.reason ?? result?.error ?? 'unavailable'}`,
          ...fallback.thoughts.slice(0, 4)
        ]
      },
      {
        perspective,
        config: DEFAULT_STATUS_DIALOGUE_CONFIG,
        statusSnapshot,
        fallbackSource: STATUS_DIALOGUE_LOCAL_FALLBACK_ADAPTER_ID
      }
    )
    return {
      ...guarded,
      policyDecision,
      patrolInsertions,
      eventBroadcastRequests: fallback.eventBroadcastRequests,
      voiceScriptPatches: fallback.voiceScriptPatches,
      voiceBroadcastQueue: fallback.voiceBroadcastQueue
    }
  }

  const parsed = applyDialogueTurnIntentToOutput(
    applyVoiceEventPatchesToOutput(parseStatusDialogueModelOutput(
      result.text,
      fallback,
      {
        source: result.providerLabel ?? STATUS_DIALOGUE_REMOTE_ADAPTER_ID,
        model: result.model,
        latencyMs: result.latencyMs
      },
      {
        perspective,
        config: DEFAULT_STATUS_DIALOGUE_CONFIG,
        statusSnapshot,
        fallbackSource: STATUS_DIALOGUE_LOCAL_FALLBACK_ADAPTER_ID
      }
    ), fallback.voiceScriptPatches ?? []),
    policyDecision
  )
  return {
    ...parsed,
    policyDecision,
    patrolInsertions,
    eventBroadcastRequests: fallback.eventBroadcastRequests,
    voiceScriptPatches: fallback.voiceScriptPatches,
    voiceBroadcastQueue: fallback.voiceBroadcastQueue
  }
}

function makeSemanticParticleCloud(nodes: GraphPoint[], seed: number): SemanticParticleCloud {
  const specs = nodes.map(getSemanticParticleSpec)
  const count = specs.reduce((total, spec) => total + spec.count, 0)
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const phases = new Float32Array(count)
  const amplitudes = new Float32Array(count)
  const nodeIndexes = new Uint16Array(count)
  const random = seededUnit(seed)
  const color = new THREE.Color()
  let cursor = 0

  nodes.forEach((node, nodeIndex) => {
    const spec = specs[nodeIndex]
    const center = getGraphNodeCenter(node)
    color.setHex(node.color)
    const arms = node.kind === 'core' ? 5 : 3 + Math.round(node.weight * 2)
    for (let localIndex = 0; localIndex < spec.count; localIndex += 1) {
      const arm = localIndex % arms
      const progress = Math.pow(random(), node.kind === 'core' ? 0.82 : 0.54)
      const theta =
        (arm / arms) * Math.PI * 2 +
        progress * node.orbit +
        (random() - 0.5) * (node.kind === 'core' ? 0.92 : 0.58)
      const distance = spec.radius * (0.12 + progress * (0.92 + random() * 0.28))
      const verticalSpread = node.kind === 'core' ? 0.86 : 0.58 + node.weight * 0.22
      const vertical = (random() * 2 - 1) * spec.radius * verticalSpread * (0.42 + progress * 0.72)
      const depthLift = Math.sin(theta * 1.7 + progress * Math.PI) * spec.radius * 0.18 * random()
      const tailBias = (progress - 0.5) * (node.kind === 'core' ? 0.06 : 0.18)
      const base = cursor * 3
      positions[base] = center.x + Math.cos(theta) * spec.stretch[0] * distance + tailBias
      positions[base + 1] = center.y + vertical * spec.stretch[1]
      positions[base + 2] = center.z + Math.sin(theta) * spec.stretch[2] * distance + depthLift

      const glow = 0.5 + (1 - progress) * 0.34 + node.importance * 0.18 + random() * 0.16
      colors[base] = Math.min(1, color.r * glow)
      colors[base + 1] = Math.min(1, color.g * glow)
      colors[base + 2] = Math.min(1, color.b * glow)
      phases[cursor] = random() * Math.PI * 2 + nodeIndex * 0.37
      amplitudes[cursor] = spec.amplitude * (0.62 + random() * 0.76)
      nodeIndexes[cursor] = nodeIndex
      cursor += 1
    }
  })

  const basePositions = positions.slice()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return { geometry, positions, basePositions, phases, amplitudes, nodeIndexes, count }
}

function ExpandedGraphCanvas({
  focusedTarget,
  nodes,
  onFocus,
  onHover
}: {
  focusedTarget: FocusedGraphTarget
  nodes: GraphPoint[]
  onFocus: (next: FocusedGraphTarget) => void
  onHover: (next: HoveredGraphPoint | null) => void
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const latestFocusRef = useRef<FocusedGraphTarget>(focusedTarget)
  const graphSignature = useMemo(
    () => `world-system-particle-os-v2-status-dialogue:${nodes.map((node) => `${node.id}:${node.stars.length}:${node.status}`).join('|')}`,
    [nodes]
  )

  useEffect(() => {
    latestFocusRef.current = focusedTarget
  }, [focusedTarget])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    let disposed = false
    let frameId = 0
    let controls: ArcballControlsLike | null = null
    let interactionHoldUntil = 0
    let hoveredNodeIndex = -1
    let focusedNodeIndex = 0
    let focusedStarId: string | null = null
    let appliedFocusKey = ''
    let rotationYaw = 0
    let rotationPitch = -0.06
    let targetYawSpeed = 0.16
    let currentYawSpeed = 0.16
    let targetPitch = -0.06
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance'
    })
    renderer.setClearColor(0x000000, 0)
    renderer.setClearAlpha(0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6))
    renderer.domElement.className = 'zg-graph-canvas'
    renderer.domElement.setAttribute('aria-label', 'World system nebula particle graph')
    host.replaceChildren(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 24)
    camera.position.set(0, 0.18, 7.1)
    const group = new THREE.Group()
    scene.add(group)

    const graphNodeById = new Map(nodes.map((node) => [node.id, node]))
    const semanticCloud = makeSemanticParticleCloud(nodes, hashDockSignature(graphSignature))
    const semanticMaterial = new THREE.PointsMaterial({
      size: 0.02,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    const semanticPoints = new THREE.Points(semanticCloud.geometry, semanticMaterial)
    group.add(semanticPoints)

    const pointObjects = nodes.map((node) => {
      const geometry = new THREE.BufferGeometry()
      const position = new THREE.Vector3(...node.position).multiplyScalar(EXPANDED_NODE_CLUSTER_SCALE)
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([position.x, position.y, position.z]), 3)
      )
      const material = new THREE.PointsMaterial({
        color: node.color,
        size: node.kind === 'core' ? 0.2 : 0.12 + node.importance * 0.06,
        sizeAttenuation: true,
        transparent: true,
        opacity: node.kind === 'core' ? 0.96 : 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
      const points = new THREE.Points(geometry, material)
      points.userData.node = node
      group.add(points)
      return points
    })

    const starObjects = nodes.flatMap((node) =>
      node.stars.map((star, starIndex) => {
        const geometry = new THREE.BufferGeometry()
        const position = getGraphStarPosition(node, starIndex)
        geometry.setAttribute(
          'position',
          new THREE.BufferAttribute(new Float32Array([position.x, position.y, position.z]), 3)
        )
        const material = new THREE.PointsMaterial({
          color: node.color,
          size: 0.045 + star.weight * 0.044,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
        const points = new THREE.Points(geometry, material)
        points.userData.node = node
        points.userData.star = star
        points.userData.starIndex = starIndex
        group.add(points)
        return points
      })
    )
    const raycastObjects = [...starObjects, ...pointObjects]

    const edges = graphEdges(nodes).map(([fromId, toId], index) => {
      const geometry = new THREE.BufferGeometry()
      const positions = new Float32Array(36 * 3)
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const material = new THREE.LineBasicMaterial({
        color: DOCK_NODE_COLORS[index % DOCK_NODE_COLORS.length] ?? 0x38bdf8,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
      const line = new THREE.Line(geometry, material)
      group.add(line)
      return {
        from: graphNodeById.get(fromId)!,
        to: graphNodeById.get(toId)!,
        geometry,
        positions,
        material
      }
    })

    const flowGeometry = new THREE.BufferGeometry()
    const flowPositions = new Float32Array(Math.max(1, edges.length) * EXPANDED_FLOW_PARTICLE_COUNT * 3)
    const flowColors = new Float32Array(flowPositions.length)
    flowGeometry.setAttribute('position', new THREE.BufferAttribute(flowPositions, 3))
    flowGeometry.setAttribute('color', new THREE.BufferAttribute(flowColors, 3))
    const flowMaterial = new THREE.PointsMaterial({
      size: 0.036,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    const flowPoints = new THREE.Points(flowGeometry, flowMaterial)
    group.add(flowPoints)

    const raycaster = new THREE.Raycaster()
    raycaster.params.Points = { threshold: 0.18 }
    const pointer = new THREE.Vector2()
    const tmp = new THREE.Vector3()
    const start = new THREE.Vector3()
    const end = new THREE.Vector3()
    const color = new THREE.Color()
    const activeColor = new THREE.Color()
    const origin = new THREE.Vector3()
    const cameraOffset = new THREE.Vector3()
    const focusTarget = getGraphNodeCenter(nodes[0])
    const desiredCameraTarget = new THREE.Vector3()

    const normalizeFocusTarget = (target: FocusedGraphTarget): FocusedGraphTarget => {
      const node = nodes.find((item) => item.id === target.node.id) ?? nodes[0]
      const star = target.star ? node.stars.find((item) => item.id === target.star?.id) : undefined
      return {
        node,
        star,
        depth: star ? 'star' : node.kind === 'core' ? 'global' : 'module'
      }
    }

    const applyFocusTarget = (target: FocusedGraphTarget, notify: boolean): void => {
      const next = normalizeFocusTarget(target)
      focusedNodeIndex = Math.max(0, nodes.findIndex((item) => item.id === next.node.id))
      focusedStarId = next.star?.id ?? null
      focusTarget.copy(getGraphFocusPosition(next))
      appliedFocusKey = getFocusTargetKey(next)
      if (notify) onFocus(next)
    }

    applyFocusTarget(latestFocusRef.current, false)

    const resize = (): void => {
      const width = Math.max(320, host.clientWidth)
      const height = Math.max(280, host.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)

    void (async () => {
      try {
        const controlsModule = await import('three/examples/jsm/controls/ArcballControls.js')
        if (disposed) return
        const ControlsCtor = controlsModule.ArcballControls as ArcballControlsConstructor
        controls = new ControlsCtor(camera, renderer.domElement, scene)
        controls.enablePan = true
        controls.enableRotate = true
        controls.enableZoom = true
        controls.enableFocus = true
        controls.enableGrid = false
        controls.enableAnimations = true
        controls.setGizmosVisible(false)
        controls.scaleFactor = 1.06
        controls.wMax = 11
        controls.target.set(0, 0, 0)
        controls.saveState()
        const holdInteraction = (): void => {
          interactionHoldUntil = performance.now() + 2200
        }
        controls.addEventListener('start', holdInteraction)
        controls.addEventListener('change', holdInteraction)
      } catch (error) {
        console.error('ArcballControls unavailable for expanded graph', error)
      }
    })()

    const handlePointerMove = (event: PointerEvent): void => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      const movementX = Number.isFinite(event.movementX) ? event.movementX : pointer.x * 24
      const movementY = Number.isFinite(event.movementY) ? event.movementY : pointer.y * -18
      if (Math.abs(movementX) > 0.2) {
        targetYawSpeed = THREE.MathUtils.clamp(0.16 + movementX * 0.018 + pointer.x * 0.09, -0.42, 0.46)
      } else if (Math.abs(pointer.x) > 0.08) {
        targetYawSpeed = THREE.MathUtils.clamp(0.16 + pointer.x * 0.13, -0.34, 0.42)
      }
      targetPitch = THREE.MathUtils.clamp(-0.06 + pointer.y * 0.16 + movementY * 0.004, -0.24, 0.18)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(raycastObjects, false)[0]
      if (hit?.object?.userData?.node) {
        const node = hit.object.userData.node as GraphPoint
        hoveredNodeIndex = Math.max(0, nodes.findIndex((item) => item.id === node.id))
        interactionHoldUntil = performance.now() + 900
        onHover({
          node,
          star: hit.object.userData.star as GraphStar | undefined,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top
        })
      } else {
        hoveredNodeIndex = -1
        onHover(null)
      }
    }
    const handlePointerLeave = (): void => {
      hoveredNodeIndex = -1
      onHover(null)
    }
    const handleClick = (event: MouseEvent): void => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(raycastObjects, false)[0]
      if (hit?.object?.userData?.node) {
        const node = hit.object.userData.node as GraphPoint
        const star = hit.object.userData.star as GraphStar | undefined
        const nextTarget: FocusedGraphTarget = {
          node,
          star,
          depth: star ? 'star' : node.kind === 'core' ? 'global' : 'module'
        }
        interactionHoldUntil = performance.now() + 2600
        applyFocusTarget(nextTarget, true)
      } else {
        const currentNode = nodes[focusedNodeIndex] ?? nodes[0]
        const parentTarget: FocusedGraphTarget =
          focusedStarId && currentNode.kind !== 'core'
            ? { node: currentNode, depth: 'module' }
            : { node: nodes[0], depth: 'global' }
        applyFocusTarget(parentTarget, true)
      }
    }
    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave)
    renderer.domElement.addEventListener('click', handleClick)

    const clock = new THREE.Clock()
    const render = (): void => {
      if (disposed) return
      const delta = Math.min(clock.getDelta(), 0.05)
      const elapsed = clock.elapsedTime
      const incomingFocusKey = getFocusTargetKey(latestFocusRef.current)
      if (incomingFocusKey !== appliedFocusKey) {
        applyFocusTarget(latestFocusRef.current, false)
      }
      const activeEdge = Math.floor(elapsed / 0.86) % Math.max(1, edges.length)
      const cameraTarget = controls?.target ?? origin
      cameraOffset.copy(camera.position).sub(cameraTarget)
      const cameraDistance = cameraOffset.length()
      if (cameraDistance < EXPANDED_GRAPH_MIN_CAMERA_DISTANCE) {
        camera.position.copy(cameraTarget).add(cameraOffset.setLength(EXPANDED_GRAPH_MIN_CAMERA_DISTANCE))
      } else if (cameraDistance > EXPANDED_GRAPH_MAX_CAMERA_DISTANCE) {
        camera.position.copy(cameraTarget).add(cameraOffset.setLength(EXPANDED_GRAPH_MAX_CAMERA_DISTANCE))
      }
      const operatorIsSteering = performance.now() < interactionHoldUntil
      const focusDistance = focusedNodeIndex === 0 ? 6.6 : 3.25 - nodes[focusedNodeIndex].importance * 0.34
      if (controls) {
        controls.target.lerp(focusTarget, 0.065)
      }
      cameraOffset.copy(camera.position).sub(cameraTarget)
      if (cameraOffset.lengthSq() < 0.001) cameraOffset.set(0, 0.18, 1)
      desiredCameraTarget.copy(focusTarget).add(cameraOffset.setLength(focusDistance))
      camera.position.lerp(desiredCameraTarget, 0.044)
      targetYawSpeed = THREE.MathUtils.lerp(targetYawSpeed, 0.16, operatorIsSteering ? 0.012 : 0.035)
      currentYawSpeed = THREE.MathUtils.lerp(currentYawSpeed, targetYawSpeed, 0.055)
      targetPitch = THREE.MathUtils.lerp(targetPitch, -0.06, operatorIsSteering ? 0.012 : 0.03)
      rotationYaw += currentYawSpeed * delta
      rotationPitch = THREE.MathUtils.lerp(rotationPitch, targetPitch + Math.sin(elapsed * 0.12) * 0.028, 0.04)
      group.rotation.y = rotationYaw
      group.rotation.x = rotationPitch

      for (let index = 0; index < semanticCloud.count; index += 1) {
        const base = index * 3
        const node = nodes[semanticCloud.nodeIndexes[index]]
        const nodeIndex = semanticCloud.nodeIndexes[index]
        const pauseFactor = hoveredNodeIndex === nodeIndex ? 0.06 : focusedNodeIndex === nodeIndex ? 0.44 : 1
        const nodeBoost = node.kind === 'core' ? 1.18 : 0.86 + node.weight * 0.48
        const phase = semanticCloud.phases[index] + elapsed * (0.52 + node.weight * 0.7) * pauseFactor
        const amplitude = semanticCloud.amplitudes[index] * nodeBoost * (hoveredNodeIndex === nodeIndex ? 0.18 : 1)
        semanticCloud.positions[base] = semanticCloud.basePositions[base] + Math.sin(phase) * amplitude
        semanticCloud.positions[base + 1] =
          semanticCloud.basePositions[base + 1] + Math.cos(phase * 1.31) * amplitude * 0.74
        semanticCloud.positions[base + 2] =
          semanticCloud.basePositions[base + 2] + Math.sin(phase * 0.73) * amplitude
      }
      ;(semanticCloud.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      semanticMaterial.opacity = hoveredNodeIndex >= 0 ? 0.9 : 0.82
      semanticMaterial.size = focusedNodeIndex === 0 ? 0.02 : 0.018

      pointObjects.forEach((points, index) => {
        const node = points.userData.node as GraphPoint
        const material = points.material as THREE.PointsMaterial
        const connected =
          edges[activeEdge]?.from.id === node.id ||
            edges[activeEdge]?.to.id === node.id
        const isHovered = hoveredNodeIndex === index
        const isFocused = focusedNodeIndex === index
        const focusIsGlobal = focusedNodeIndex === 0 && !focusedStarId
        const pulse = connected || isHovered || isFocused ? 1 + Math.sin(elapsed * 7 + index) * 0.1 : 1
        material.size =
          (node.kind === 'core' ? 0.19 : 0.12 + node.weight * 0.08) *
          (connected ? 1.38 : 1) *
          (isFocused ? 1.5 : 1) *
          (isHovered ? 1.36 : 1) *
          pulse
        material.opacity =
          connected || isHovered || isFocused
            ? 0.96
            : focusIsGlobal
              ? 0.48 + node.importance * 0.28
              : 0.22 + node.importance * 0.16
      })

      starObjects.forEach((points, index) => {
        const node = points.userData.node as GraphPoint
        const star = points.userData.star as GraphStar
        const nodeIndex = nodes.findIndex((item) => item.id === node.id)
        const material = points.material as THREE.PointsMaterial
        const isActive = nodeIndex === hoveredNodeIndex || nodeIndex === focusedNodeIndex
        const isFocusedStar = nodeIndex === focusedNodeIndex && star.id === focusedStarId
        const pulse = 1 + Math.sin(elapsed * (isActive ? 5.8 : 2.2) + index * 0.37) * (isActive ? 0.16 : 0.08)
        material.size =
          (0.044 + star.weight * 0.044) *
          (isFocusedStar ? 1.84 : isActive ? 1.34 : 1) *
          pulse
        material.opacity = isFocusedStar ? 1 : isActive ? 0.96 : focusedNodeIndex === 0 ? 0.5 + star.weight * 0.28 : 0.28
      })

      edges.forEach((edge, edgeIndex) => {
        const isActive = edgeIndex === activeEdge
        start.fromArray(edge.from.position).multiplyScalar(EXPANDED_NODE_CLUSTER_SCALE)
        end.fromArray(edge.to.position).multiplyScalar(EXPANDED_NODE_CLUSTER_SCALE)
        for (let pointIndex = 0; pointIndex < 36; pointIndex += 1) {
          const progress = pointIndex / 35
          tmp.lerpVectors(start, end, progress)
          const arc = Math.sin(progress * Math.PI) * (isActive ? 0.38 : 0.16)
          const jitter = Math.sin(progress * Math.PI * 5 + elapsed * (isActive ? 10 : 4) + edgeIndex) * (isActive ? 0.09 : 0.035)
          tmp.y += arc + jitter
          tmp.z += Math.cos(progress * Math.PI * 4 + elapsed * 6 + edgeIndex) * (isActive ? 0.07 : 0.025)
          const base = pointIndex * 3
          edge.positions[base] = tmp.x
          edge.positions[base + 1] = tmp.y
          edge.positions[base + 2] = tmp.z
        }
        edge.material.opacity = isActive ? 0.86 : 0.22
        edge.material.color.setHex(isActive ? edge.from.color : edge.to.color)
        ;(edge.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      })

      edges.forEach((edge, edgeIndex) => {
        start.fromArray(edge.from.position).multiplyScalar(EXPANDED_NODE_CLUSTER_SCALE)
        end.fromArray(edge.to.position).multiplyScalar(EXPANDED_NODE_CLUSTER_SCALE)
        activeColor.setHex(edgeIndex === activeEdge ? edge.from.color : edge.to.color)
        for (let pointIndex = 0; pointIndex < EXPANDED_FLOW_PARTICLE_COUNT; pointIndex += 1) {
          const cursor = edgeIndex * EXPANDED_FLOW_PARTICLE_COUNT + pointIndex
        const progress =
            (elapsed * 0.34 +
              pointIndex / EXPANDED_FLOW_PARTICLE_COUNT +
              edgeIndex * 0.13) %
            1
          tmp.lerpVectors(start, end, progress)
          const arc = Math.sin(progress * Math.PI) * 0.34
          tmp.y += arc + Math.sin(elapsed * 3.2 + pointIndex) * 0.026
          tmp.z += Math.cos(elapsed * 2.6 + pointIndex * 0.4) * 0.026
          const base = cursor * 3
          flowPositions[base] = tmp.x
          flowPositions[base + 1] = tmp.y
          flowPositions[base + 2] = tmp.z
          const glow = edgeIndex === activeEdge ? 1 : 0.42
          color.copy(activeColor).multiplyScalar(glow)
          flowColors[base] = Math.min(1, color.r)
          flowColors[base + 1] = Math.min(1, color.g)
          flowColors[base + 2] = Math.min(1, color.b)
        }
      })
      ;(flowGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      ;(flowGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
      flowMaterial.opacity = 0.74
      flowMaterial.size = 0.036

      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(render)
    }
    render()

    return () => {
      disposed = true
      window.cancelAnimationFrame(frameId)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave)
      renderer.domElement.removeEventListener('click', handleClick)
      controls?.dispose()
      semanticCloud.geometry.dispose()
      semanticMaterial.dispose()
      pointObjects.forEach((points) => {
        points.geometry.dispose()
        ;(points.material as THREE.Material).dispose()
      })
      starObjects.forEach((points) => {
        points.geometry.dispose()
        ;(points.material as THREE.Material).dispose()
      })
      edges.forEach((edge) => {
        edge.geometry.dispose()
        edge.material.dispose()
      })
      flowGeometry.dispose()
      flowMaterial.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      host.replaceChildren()
    }
  }, [graphSignature, nodes, onFocus, onHover])

  return <div ref={hostRef} className="zg-graph-canvas-host" />
}

export function ZhinengGraphWindow(): React.JSX.Element {
  const [hovered, setHovered] = useState<HoveredGraphPoint | null>(null)
  const runtimeProbeConfig = useMemo(() => readStatusDialogueRuntimeProbeConfig(), [])
  const runtimeProbeMode = runtimeProbeConfig.mode
  const baseGraphNodes = useMemo(() => buildGraphPoints(), [])
  const [entityWorkProjection, setEntityWorkProjection] = useState<EntityWorkRuntimeProjection | undefined>()
  const [entityWorkBusyAction, setEntityWorkBusyAction] = useState<string | undefined>()
  const [entityWorkMessage, setEntityWorkMessage] = useState<string>('runtime loading')
  const graphNodes = useMemo(
    () => mergeEntityWorkProjection(baseGraphNodes, entityWorkProjection),
    [baseGraphNodes, entityWorkProjection]
  )
  const [focusedTarget, setFocusedTarget] = useState<FocusedGraphTarget>(() => ({
    node: baseGraphNodes[0],
    depth: 'global'
  }))
  const [collapsedStarGroups, setCollapsedStarGroups] = useState<Record<string, boolean>>({
    专家矩阵: true
  })
  const [dialoguePerspective, setDialoguePerspective] = useState<StatusDialoguePerspective>('first_person')
  const [voiceEnabled, setVoiceEnabledState] = useState(false)
  const voiceEnabledRef = useRef(false)
  const setVoiceOutputEnabled = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(voiceEnabledRef.current) : next
    voiceEnabledRef.current = resolved
    setVoiceEnabledState(resolved)
  }, [])
  const [voiceInputEnabled, setVoiceInputEnabled] = useState(false)
  const [voiceListening, setVoiceListening] = useState(false)
  const voiceListeningRef = useRef(false)
  const launchIntent = useMemo(() => readStatusDialogueLaunchIntent(), [])
  const [voiceEntryHighlighted, setVoiceEntryHighlighted] = useState(false)
  const statusDialoguePanelRef = useRef<HTMLElement | null>(null)
  const sttButtonRef = useRef<HTMLButtonElement | null>(null)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [voiceError, setVoiceError] = useState<string | undefined>()
  const voiceErrorRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    voiceListeningRef.current = voiceListening
  }, [voiceListening])
  useEffect(() => {
    voiceErrorRef.current = voiceError
  }, [voiceError])
  const [statusSettingsOpen, setStatusSettingsOpen] = useState(false)
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>(() => [
    DEFAULT_COSYVOICE_VOICE_PROFILE,
    DEFAULT_BROWSER_VOICE_PROFILE
  ])
  const [selectedVoiceProfileId, setSelectedVoiceProfileId] = useState(DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id)
  const [voiceOutputMode, setVoiceOutputMode] = useState<StatusDialogueVoiceOutputMode>(DEFAULT_STATUS_DIALOGUE_VOICE_OUTPUT_MODE)
  const [ttsRuntimePolicy, setTtsRuntimePolicy] = useState<StatusDialogueTtsRuntimePolicyState>(() =>
    buildDefaultTtsRuntimePolicy(DEFAULT_STATUS_DIALOGUE_VOICE_OUTPUT_MODE)
  )
  const [voicePlaybackQueueState, setVoicePlaybackQueueState] = useState<VoicePlaybackQueueState>(() =>
    buildDefaultVoicePlaybackQueueState({ voiceProfile: DEFAULT_COSYVOICE_VOICE_PROFILE })
  )
  const voicePlaybackQueueStateRef = useRef<VoicePlaybackQueueState>(voicePlaybackQueueState)
  const voicePlaybackQueueUpdatedAtMsRef = useRef(Date.now())
  const [voiceLatencyTrace, setVoiceLatencyTrace] = useState<VoiceLatencyTrace>(() =>
    buildVoiceLatencyTrace({ sessionId: 'idle' })
  )
  const [selectedSttAdapter, setSelectedSttAdapter] = useState<StatusDialogueSttAdapterMode>('remote')
  const selectedSttAdapterRef = useRef<StatusDialogueSttAdapterMode>('remote')
  const [selectedSttModel, setSelectedSttModel] = useState<StatusDialogueSttModel>('base')
  const [cloudSttHealth, setCloudSttHealth] = useState<StatusDialogueCloudSttHealthState>(() =>
    buildDefaultCloudSttHealthState()
  )
  const [localSttRuntimeState, setLocalSttRuntimeState] = useState<StatusDialogueLocalSttRuntimeState>(() => ({
    health: buildBrowserPreviewLocalSttHealth('waiting for local STT health check', 'base'),
    busy: false
  }))
  const [remoteSttRuntimeState, setRemoteSttRuntimeState] = useState<StatusDialogueRemoteSttRuntimeState>(() => ({
    health: buildBrowserPreviewRemoteSttHealth('waiting for remote STT health check'),
    busy: false
  }))
  const remoteSttRuntimeStateRef = useRef<StatusDialogueRemoteSttRuntimeState>(remoteSttRuntimeState)
  const runtimeLoadedLogRef = useRef(false)
  const sttDefaultMigrationRef = useRef(false)
  const ttsInputInterruptProbeStartedRef = useRef(false)
  const sttClickDuringTtsProbeStartedRef = useRef(false)
  const cloudSttFakeAudioProbeStartedRef = useRef(false)
  const edgeTtsPlaybackProbeStartedRef = useRef(false)
  const ttsVoiceBudgetProbeStartedRef = useRef(false)
  const remoteSttStartupHealthRequestedRef = useRef(false)
  const remoteSttDefaultSelectionRef = useRef(false)
  const remoteSttMockProbeStartedRef = useRef(false)
  const remoteSttConfiguredProbeStartedRef = useRef(false)
  const remoteSttUnavailableProbeStartedRef = useRef(false)
  const remoteSttUnavailableProbeArmedRef = useRef(false)
  const w3WakeHandoffProbeStartedRef = useRef(false)
  const continuousVoiceLoopProbeStartedRef = useRef(false)
  const continuousVoiceFastFailProbeStartedRef = useRef(false)
  const continuousVoiceTwoTurnProbeStartedRef = useRef(false)
  const continuousVoiceTwoTurnProbeSuccessCountRef = useRef(0)
  const localSttLowSignalProbeStartedRef = useRef(false)
  const localSttBorderlineProbeStartedRef = useRef(false)
  const lastLoggedSttAdapterRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    selectedSttAdapterRef.current = selectedSttAdapter
  }, [selectedSttAdapter])
  useEffect(() => {
    remoteSttRuntimeStateRef.current = remoteSttRuntimeState
  }, [remoteSttRuntimeState])
  const selectSttAdapter = useCallback(
    (nextAdapter: StatusDialogueSttAdapterMode, reason: string) => {
      selectedSttAdapterRef.current = nextAdapter
      setSelectedSttAdapter((previousAdapter) => {
        logStatusDialogueVoiceEvent('stt_adapter_runtime_selected', {
          runtime_probe: runtimeProbeMode || undefined,
          previous_adapter: previousAdapter,
          selected_adapter: nextAdapter,
          reason,
          model: selectedSttModel,
          voice_listening: voiceListening,
          electron_ipc_available: Boolean(window.electron?.invoke),
          source:
            nextAdapter === 'local'
              ? 'local_whisper_persistent_service'
              : nextAdapter === 'remote'
                ? 'openai_compatible_stt'
                : 'chrome_stt_bridge'
        })
        return nextAdapter
      })
    },
    [runtimeProbeMode, selectedSttModel, voiceListening]
  )
  useEffect(() => {
    if (runtimeLoadedLogRef.current) return
    runtimeLoadedLogRef.current = true
    logStatusDialogueVoiceEvent('status_dialogue_ui_runtime_loaded', {
      runtime_probe: runtimeProbeMode || undefined,
      runtime_fix_marker: STATUS_DIALOGUE_STT_RUNTIME_FIX_MARKER,
      tts_spoken_budget_marker: STATUS_DIALOGUE_TTS_BUDGET_RUNTIME_MARKER,
      default_stt_adapter: selectedSttAdapter,
      stt_model: selectedSttModel,
      default_voice_output_mode: voiceOutputMode,
      electron_ipc_available: Boolean(window.electron?.invoke),
      local_whisper_observability: true,
      cloud_retry_one_shot: true,
      tts_input_interrupt_observability: true,
      edge_tts_low_latency_default: voiceOutputMode === 'edge_readaloud_stream',
      tts_budget_final_cap_enabled: true,
      tts_streaming_voice_max_chars: STATUS_DIALOGUE_STREAMING_VOICE_MAX_CHARS,
      tts_event_broadcast_voice_max_chars: STATUS_DIALOGUE_EVENT_BROADCAST_VOICE_MAX_CHARS,
      tts_final_voice_max_chars: STATUS_DIALOGUE_FINAL_VOICE_MAX_CHARS
    })
  }, [runtimeProbeMode, selectedSttAdapter, selectedSttModel, voiceOutputMode])
  useEffect(() => {
    if (launchIntent.launchIntent !== 'status_dialogue_voice_entry' || launchIntent.statusDialogueAction !== 'focus_stt') return
    const timer = window.setTimeout(() => {
      statusDialoguePanelRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      sttButtonRef.current?.focus()
      setVoiceEntryHighlighted(true)
      logStatusDialogueVoiceEvent('status_dialogue_voice_entry_focused', {
        source: launchIntent.source,
        action: launchIntent.statusDialogueAction,
        stt_button_found: Boolean(sttButtonRef.current),
        panel_found: Boolean(statusDialoguePanelRef.current),
        boundary: 'dock voice entry focuses visible STT button only; microphone not started automatically'
      })
      window.setTimeout(() => setVoiceEntryHighlighted(false), 2600)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [launchIntent.launchIntent, launchIntent.source, launchIntent.statusDialogueAction])
  useEffect(() => {
    const describeElement = (element: Element | null): Record<string, unknown> => {
      if (!element) return {}
      const className = typeof element.className === 'string' ? element.className : ''
      const text = element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80)
      return {
        tag: element.tagName.toLowerCase(),
        class_name: className.slice(0, 120),
        aria_label: element.getAttribute('aria-label') ?? undefined,
        title: element.getAttribute('title') ?? undefined,
        text: text || undefined
      }
    }

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target instanceof Element ? event.target : null
      const activeElement = document.activeElement instanceof Element ? document.activeElement : null
      const sttTarget = target?.closest?.(
        '.zg-dialogue-stt-button, button[aria-label="start speech input"], button[aria-label="stop speech input"]'
      )
      logStatusDialogueVoiceEvent('status_dialogue_global_pointer_down', {
        runtime_probe: runtimeProbeMode || undefined,
        target: describeElement(target),
        active_element: describeElement(activeElement),
        is_stt_button_target: Boolean(sttTarget),
        client_x: Math.round(event.clientX),
        client_y: Math.round(event.clientY),
        window_inner_width: window.innerWidth,
        window_inner_height: window.innerHeight,
        boundary: 'capture-phase pointerdown inside graph window; no audio open; no world write'
      })
    }

    window.addEventListener('pointerdown', handlePointerDown, true)
    return () => window.removeEventListener('pointerdown', handlePointerDown, true)
  }, [runtimeProbeMode])
  useEffect(() => {
    if (sttDefaultMigrationRef.current) return
    sttDefaultMigrationRef.current = true
    if (selectedSttAdapter !== 'cloud' || voiceListening) return
    selectSttAdapter('local', 'local_whisper_persistent_service_fast_path')
    logStatusDialogueVoiceEvent('stt_default_migrated_to_local', {
      runtime_probe: runtimeProbeMode || undefined,
      previous_adapter: 'cloud',
      next_adapter: 'local',
      reason: 'local_whisper_persistent_service_fast_path'
    })
  }, [runtimeProbeMode, selectSttAdapter, selectedSttAdapter, voiceListening])
  useEffect(() => {
    const logKey = `${selectedSttAdapter}:${selectedSttModel}`
    if (lastLoggedSttAdapterRef.current === logKey) return
    lastLoggedSttAdapterRef.current = logKey
    logStatusDialogueVoiceEvent('stt_adapter_runtime_selected', {
      runtime_probe: runtimeProbeMode || undefined,
      selected_adapter: selectedSttAdapter,
      reason: 'runtime_state',
      model: selectedSttModel,
      voice_listening: voiceListening,
      electron_ipc_available: Boolean(window.electron?.invoke),
      source:
        selectedSttAdapter === 'local'
          ? 'local_whisper_persistent_service'
          : selectedSttAdapter === 'remote'
            ? 'openai_compatible_stt'
            : 'chrome_stt_bridge'
    })
  }, [runtimeProbeMode, selectedSttAdapter, selectedSttModel, voiceListening])
  const [voiceLatency, setVoiceLatency] = useState<StatusDialogueVoiceLatencyState>(() =>
    nowVoiceLatencyState({
      stage: 'idle',
      sttModel: 'base',
      voiceMode: DEFAULT_STATUS_DIALOGUE_VOICE_OUTPUT_MODE
    })
  )
  const voiceLatencyRef = useRef<StatusDialogueVoiceLatencyState>(voiceLatency)
  const [voiceOutputTrace, setVoiceOutputTrace] = useState<VoiceOutputTrace | undefined>()
  const [xiaozhiBridgeState, setXiaozhiBridgeState] = useState<XiaozhiStyleVoiceBridgeState>(() =>
    buildDefaultXiaozhiStyleVoiceBridgeState()
  )
  const [wakeConfig, setWakeConfig] = useState<XiaozhiStyleWakeConfig>(() => DEFAULT_XIAOZHI_STYLE_WAKE_CONFIG)
  const [wakeDetectorConfig, setWakeDetectorConfig] = useState<XiaozhiStyleWakeDetectorAdapterConfig>(
    () => DEFAULT_XIAOZHI_STYLE_WAKE_DETECTOR_ADAPTER_CONFIG
  )
  const [wakeDetectorState, setWakeDetectorState] = useState<XiaozhiStyleWakeDetectorState>(() =>
    buildDefaultXiaozhiStyleWakeDetectorState({
      wakeConfig: DEFAULT_XIAOZHI_STYLE_WAKE_CONFIG,
      detectorConfig: DEFAULT_XIAOZHI_STYLE_WAKE_DETECTOR_ADAPTER_CONFIG
    })
  )
  const [w3WakeStage, setW3WakeStage] = useState<W3WakeDetectorStage>('off')
  const [continuousVoiceSession, setContinuousVoiceSession] = useState<StatusDialogueContinuousVoiceSessionState>(() =>
    buildDefaultContinuousVoiceSessionState()
  )
  const [completionNoticeText, setCompletionNoticeText] = useState(DEFAULT_COMPLETION_NOTICE_TEXT)
  const [completionNoticeState, setCompletionNoticeState] = useState<CompletionNoticeState>(() =>
    buildDefaultCompletionNoticeState()
  )
  const [vadPrecheckState, setVadPrecheckState] = useState<XiaozhiStyleVadPrecheckState>(() =>
    buildDefaultXiaozhiStyleVadPrecheckState(DEFAULT_XIAOZHI_STYLE_WAKE_CONFIG)
  )
  const [ttsAdapterState, setTtsAdapterState] = useState<StatusDialogueTtsAdapterState>(() => ({
    health: buildBrowserPreviewTtsHealth('waiting for Edge Read Aloud stream check'),
    busy: false
  }))
  useEffect(() => {
    setTtsRuntimePolicy((current) => (current.mode === voiceOutputMode ? current : buildPendingTtsRuntimePolicy(voiceOutputMode)))
  }, [voiceOutputMode])
  const chromeSttSessionRef = useRef<string | null>(null)
  const localSpeechRecorderRef = useRef<LocalSpeechRecorder | null>(null)
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const wakeDetectorRecognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const wakeDetectorRestartTimerRef = useRef<number | undefined>(undefined)
  const wakeWindowTimerRef = useRef<number | undefined>(undefined)
  const wakeDetectorEnabledRef = useRef(false)
  const continuousVoiceSessionEnabledRef = useRef(false)
  const continuousVoiceResumeTimerRef = useRef<number | undefined>(undefined)
  const continuousVoiceResumeInFlightRef = useRef(false)
  const continuousVoiceRecoverableErrorRef = useRef<string | undefined>(undefined)
  const continuousVoiceRecoverableErrorCountRef = useRef(0)
  const speechRecognitionDraftRef = useRef('')
  const speechRecognitionSubmitTimerRef = useRef<number | undefined>(undefined)
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null)
  const voiceLiveAudioContextRef = useRef<AudioContext | null>(null)
  const unlockedVoiceAudioRef = useRef<HTMLAudioElement | null>(null)
  const voicePlaybackUnlockedRef = useRef(false)
  const lastVoicePlaybackRef = useRef<LastVoicePlayback | null>(null)
  const voiceAudioCacheRef = useRef<Map<string, CachedVoiceAudio>>(new Map())
  const voiceSynthesisPromiseRef = useRef<Map<string, Promise<StatusDialogueTtsSynthesisResult>>>(new Map())
  const voicePlaybackQueueTailRef = useRef<Promise<QueuedVoicePlaybackResult | undefined>>(Promise.resolve(undefined))
  const voicePlaybackQueueRunIdRef = useRef(0)
  const activeVoiceSessionRef = useRef('idle')
  const [lastVoicePlaybackLabel, setLastVoicePlaybackLabel] = useState('none')
  const latestVoiceRequestRef = useRef('')
  const dialogueLogRef = useRef<HTMLDivElement | null>(null)
  const [dialogueInput, setDialogueInput] = useState('')
  const [dialogueBusy, setDialogueBusy] = useState(false)
  const dialogueBusyRef = useRef(false)
  const [dialogueExecutionState, setDialogueExecutionState] = useState<StatusDialogueExecutionState>(() =>
    buildStatusDialogueExecutionState({ phase: 'complete', action: '等待输入' })
  )
  const delayedVoiceAckTimerRef = useRef<number | undefined>(undefined)
  const pendingDialogueInputQueueRef = useRef<StatusDialogueQueuedInput[]>([])
  const sttEntrySnapshotLoggedRef = useRef(false)
  const [dialogueInputQueueState, setDialogueInputQueueState] = useState<StatusDialogueInputQueueState>({
    queued_count: 0,
    queued_during_tts_count: 0
  })
  const buildSttEntrySnapshotPayload = useCallback(
    (
      reason: string,
      pointer?: { clientX: number; clientY: number }
    ): Record<string, unknown> => {
      const describeElement = (element: Element | null): Record<string, unknown> => {
        if (!element) return {}
        const className = typeof element.className === 'string' ? element.className : ''
        const text = element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80)
        return {
          tag: element.tagName.toLowerCase(),
          class_name: className.slice(0, 120),
          aria_label: element.getAttribute('aria-label') ?? undefined,
          title: element.getAttribute('title') ?? undefined,
          text: text || undefined
        }
      }
      const rectToPayload = (rect?: DOMRect | null): Record<string, number> | undefined => {
        if (!rect) return undefined
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom)
        }
      }
      const sttButton = sttButtonRef.current
      const panel = statusDialoguePanelRef.current
      const buttonRect = sttButton?.getBoundingClientRect()
      const panelRect = panel?.getBoundingClientRect()
      const centerX = buttonRect ? buttonRect.left + buttonRect.width / 2 : undefined
      const centerY = buttonRect ? buttonRect.top + buttonRect.height / 2 : undefined
      const centerHit =
        centerX !== undefined && centerY !== undefined
          ? document.elementFromPoint(centerX, centerY)
          : null
      const pointerHit = pointer ? document.elementFromPoint(pointer.clientX, pointer.clientY) : null
      return {
        runtime_probe: runtimeProbeMode || undefined,
        reason,
        selected_adapter: selectedSttAdapter,
        model: selectedSttModel,
        voice_listening: voiceListening,
        voice_input_enabled: voiceInputEnabled,
        voice_error: voiceError,
        dialogue_busy: dialogueBusyRef.current,
        loop_enabled: continuousVoiceSession.enabled,
        loop_status: continuousVoiceSession.status,
        wake_stage: w3WakeStage,
        voice_queue_status: voicePlaybackQueueStateRef.current.status,
        electron_ipc_available: Boolean(window.electron?.invoke),
        stt_button_found: Boolean(sttButton),
        stt_button_disabled: sttButton?.disabled ?? undefined,
        stt_button_aria_label: sttButton?.getAttribute('aria-label') ?? undefined,
        stt_button_title: sttButton?.getAttribute('title') ?? undefined,
        stt_button_rect: rectToPayload(buttonRect),
        stt_button_center:
          centerX !== undefined && centerY !== undefined
            ? { x: Math.round(centerX), y: Math.round(centerY) }
            : undefined,
        stt_button_center_hit: describeElement(centerHit),
        pointer: pointer ? { x: Math.round(pointer.clientX), y: Math.round(pointer.clientY) } : undefined,
        pointer_hit: describeElement(pointerHit),
        panel_found: Boolean(panel),
        panel_rect: rectToPayload(panelRect),
        active_element: describeElement(document.activeElement instanceof Element ? document.activeElement : null),
        window_inner_width: window.innerWidth,
        window_inner_height: window.innerHeight,
        boundary: 'stt entry snapshot only; no microphone open; no audio upload; no world write'
      }
    },
    [
      continuousVoiceSession.enabled,
      continuousVoiceSession.status,
      runtimeProbeMode,
      selectedSttAdapter,
      selectedSttModel,
      voiceError,
      voiceInputEnabled,
      voiceListening,
      w3WakeStage
    ]
  )
  const logSttEntrySnapshot = useCallback(
    (reason: string, pointer?: { clientX: number; clientY: number }) => {
      logStatusDialogueVoiceEvent('status_dialogue_stt_entry_snapshot', buildSttEntrySnapshotPayload(reason, pointer))
    },
    [buildSttEntrySnapshotPayload]
  )
  useEffect(() => {
    if (sttEntrySnapshotLoggedRef.current) return
    sttEntrySnapshotLoggedRef.current = true
    const timer = window.setTimeout(() => {
      logSttEntrySnapshot('post_mount_stt_entry_snapshot')
    }, 800)
    return () => window.clearTimeout(timer)
  }, [logSttEntrySnapshot])
  const unlockVoicePlayback = useCallback(() => {
    if (voicePlaybackUnlockedRef.current || typeof window === 'undefined') return
    try {
      const audio = unlockedVoiceAudioRef.current ?? new Audio(SILENT_AUDIO_UNLOCK_DATA_URL)
      unlockedVoiceAudioRef.current = audio
      audio.src = SILENT_AUDIO_UNLOCK_DATA_URL
      audio.preload = 'auto'
      audio.loop = true
      audio.volume = 0
      audio.play()
        .then(() => {
          voicePlaybackUnlockedRef.current = true
        })
        .catch(() => {
          voicePlaybackUnlockedRef.current = false
        })
    } catch {
      voicePlaybackUnlockedRef.current = false
    }
  }, [])
  const prepareVoicePlaybackAudio = useCallback((audioDataUrl: string, volume: number): HTMLAudioElement => {
    const audio = unlockedVoiceAudioRef.current ?? new Audio()
    unlockedVoiceAudioRef.current = audio
    if (voiceAudioRef.current && voiceAudioRef.current !== audio) {
      voiceAudioRef.current.pause()
    }
    audio.loop = false
    audio.src = audioDataUrl
    audio.preload = 'auto'
    audio.volume = volume
    voiceAudioRef.current = audio
    return audio
  }, [])
  const rememberVoicePlayback = useCallback((playback: Omit<LastVoicePlayback, 'updated_at'>) => {
    const updatedAt = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    lastVoicePlaybackRef.current = {
      ...playback,
      updated_at: updatedAt
    }
    setLastVoicePlaybackLabel(updatedAt)
  }, [])
  const refreshEntityWorkProjection = useCallback(async () => {
    if (!window.electron?.invoke) {
      setEntityWorkMessage('browser preview / ipc unavailable')
      return
    }
    try {
      const result = (await window.electron.invoke('zhineng:entity-work:projection:get')) as EntityWorkRuntimeProjection
      setEntityWorkProjection(result)
      setEntityWorkMessage(result?.success ? 'runtime ready' : result?.reason || result?.error || 'runtime unavailable')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setEntityWorkMessage(message)
    }
  }, [])
  const runEntityWorkStageAction = useCallback(
    async (surface: EntityWorkStageControlSurface, action: EntityWorkStageAction) => {
      if (!window.electron?.invoke) {
        setEntityWorkMessage('browser preview / ipc unavailable')
        return
      }
      if (!action.allowed) {
        setEntityWorkMessage(`${action.action_id} blocked by gate`)
        return
      }
      const cliAction = getEntityWorkActionCliName(action)
      const busyKey = `${surface.stage_id}:${cliAction}`
      setEntityWorkBusyAction(busyKey)
      setEntityWorkMessage(`${surface.stage_label} / ${cliAction} running`)
      try {
        const result = (await window.electron.invoke('zhineng:entity-work:stage:run', {
          stage: surface.stage_id,
          action: cliAction
        })) as EntityWorkStageRunResult
        if (result.projection) {
          setEntityWorkProjection(result.projection)
        } else {
          await refreshEntityWorkProjection()
        }
        setEntityWorkMessage(result.success ? `${surface.stage_label} / ${cliAction} done` : result.reason || result.error || 'stage action failed')
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        setEntityWorkMessage(message)
      } finally {
        setEntityWorkBusyAction(undefined)
      }
    },
    [refreshEntityWorkProjection]
  )
  useEffect(() => {
    void refreshEntityWorkProjection()
  }, [refreshEntityWorkProjection])
  useEffect(() => {
    setFocusedTarget((current) => {
      const node = graphNodes.find((candidate) => candidate.id === current.node.id) || graphNodes[0]
      const star = current.star ? node.stars.find((candidate) => candidate.id === current.star?.id) : undefined
      if (node === current.node && star === current.star) return current
      return {
        node,
        star,
        depth: star ? 'star' : current.depth === 'star' ? 'module' : current.depth
      }
    })
  }, [graphNodes])
  const starCount = useMemo(
    () => graphNodes.reduce((total, node) => total + node.stars.length, 0),
    [graphNodes]
  )
  const expectedStatusModules = useMemo(() => buildExpectedStatusModules(graphNodes), [graphNodes])
  const defaultSnapshotState = useMemo(
    () => buildFallbackSnapshotState(expectedStatusModules, 'local fallback'),
    [expectedStatusModules]
  )
  const [statusSnapshotState, setStatusSnapshotState] =
    useState<StatusDialogueSnapshotState>(() => defaultSnapshotState)
  const defaultEventSnapshotState = useMemo(
    () => buildFallbackEventSnapshotState(expectedStatusModules, 'local fallback'),
    [expectedStatusModules]
  )
  const [systemEventSnapshotState, setSystemEventSnapshotState] =
    useState<StatusDialogueEventSnapshotState>(() => defaultEventSnapshotState)
  const defaultPatrolIndexState = useMemo(
    () => buildFallbackPatrolIndexState('local fallback'),
    []
  )
  const [statusPatrolIndexState, setStatusPatrolIndexState] =
    useState<StatusDialoguePatrolIndexState>(() => defaultPatrolIndexState)
  const defaultRuntimeVoiceDiagnosticState = useMemo(
    () => buildFallbackRuntimeVoiceDiagnosticState('local fallback'),
    []
  )
  const [runtimeVoiceDiagnosticState, setRuntimeVoiceDiagnosticState] =
    useState<StatusDialogueRuntimeVoiceDiagnosticState>(() => defaultRuntimeVoiceDiagnosticState)
  const [voiceEventBroadcastPanelState, setVoiceEventBroadcastPanelState] = useState<VoiceEventBroadcastPanelState>(() =>
    buildVoiceEventBroadcastPanelStateFromSnapshot({
      snapshot: defaultEventSnapshotState.snapshot,
      source: 'local default'
    })
  )
  const [conversationMemory, setConversationMemory] = useState<StatusDialogueConversationMemoryCard>(() =>
    readStatusDialogueConversationMemory()
  )
  const unspokenPatrolEventsRef = useRef<VoiceScriptPatch[]>(
    conversationMemory.unspoken_patrol_events.map((text, index) => buildStoredUnspokenVoicePatch(text, index))
  )
  const [realIntegrationState, setRealIntegrationState] = useState<StatusDialogueRealIntegrationState>(() => ({
    env: buildBrowserPreviewRealEnvCheck('waiting for Phase 0 real environment check'),
    envBusy: false,
    modelBusy: false,
    source: 'browser_preview'
  }))
  const [dialogueMessages, setDialogueMessages] = useState<StatusDialogueMessage[]>(() => {
    const initialResult = buildStatusDialogueLocalResult({
        input: 'global status',
        perspective: 'first_person',
        focusTarget: { node: graphNodes[0], depth: 'global' },
        graphNodes,
        starCount,
        statusSnapshot: defaultSnapshotState.snapshot,
        systemEventSnapshot: defaultEventSnapshotState.snapshot,
        systemPatrolIndexSummary: defaultPatrolIndexState.summary
      })
    return [
      {
        id: createStatusDialogueMessageId(),
        role: 'system',
        text:
          '我已经进入主体状态巡逻窗口。当前只做状态读取，真实模型会在你输入文字或语音后调用；初始状态只显示本地状态快照。',
        thoughts: [
          'initial focus: world core',
          'boundary: status-only',
          `cards: ${defaultSnapshotState.snapshot.cards_fresh} fresh / ${defaultSnapshotState.snapshot.cards_stale} stale / ${defaultSnapshotState.snapshot.cards_missing} missing`,
          `events: ${defaultEventSnapshotState.snapshot.events_fresh} fresh / ${defaultEventSnapshotState.snapshot.events_stale} stale / ${defaultEventSnapshotState.snapshot.events_critical} critical`,
          'model: waits for operator input',
          'ipc: checking desktop runtime'
        ],
        source: 'runtime ready',
        statusRefs: initialResult.statusRefs,
        missingStatus: initialResult.missingStatus,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false })
      }
    ]
  })

  const syncDialogueInputQueueState = useCallback(() => {
    const queue = pendingDialogueInputQueueRef.current
    const last = queue[queue.length - 1]
    setDialogueInputQueueState({
      queued_count: queue.length,
      queued_during_tts_count: queue.filter((item) => item.queued_during_tts).length,
      last_queued_at: last?.queued_at,
      last_kind: last?.input_kind,
      last_reason: last?.reason,
      last_priority: last?.priority,
      last_echo_boundary: last?.echo_boundary,
      last_text_preview: last ? compactVoiceWhitespace(last.text).slice(0, 48) : undefined
    })
  }, [])

  const enqueueDialogueInput = useCallback(
    (
      text: string,
      inputKind: StatusDialogueInputKind,
      reason = 'dialogue_busy',
      options: { queuedDuringTts?: boolean; voiceQueueStatus?: VoicePlaybackQueueState['status'] } = {}
    ): boolean => {
      const input = text.trim()
      if (!input) return false
      const nowMs = Date.now()
      const queue = pendingDialogueInputQueueRef.current
      const last = queue[queue.length - 1]
      if (last && last.text === input && last.input_kind === inputKind && nowMs - last.created_at_ms < 1500) {
        syncDialogueInputQueueState()
        return true
      }
      const detectedQueuedDuringTts = isVoicePlaybackActiveForInput({
        queueStatus: voicePlaybackQueueStateRef.current.status,
        voiceLatencyStage: voiceLatencyRef.current.stage,
        speakingActive: xiaozhiBridgeState.speaking_active
      })
      const queuedDuringTts = options.queuedDuringTts ?? detectedQueuedDuringTts
      const priority: StatusDialogueInputQueuePriority = queuedDuringTts ? 'after_current_voice' : 'normal'
      const echoBoundary: StatusDialogueInputEchoBoundary =
        queuedDuringTts ? 'wake_detector_paused_only' : inputKind === 'speech_transcript' ? 'formal_input_allowed' : 'none'
      const entry: StatusDialogueQueuedInput = {
        id: createStatusDialogueMessageId(),
        text: input,
        input_kind: inputKind,
        source: inputKind === 'speech_transcript' ? 'stt' : 'operator',
        reason: queuedDuringTts && reason === 'dialogue_busy' ? 'tts_playback_active' : reason,
        priority,
        echo_boundary: echoBoundary,
        queued_during_tts: queuedDuringTts,
        voice_queue_status: options.voiceQueueStatus ?? voicePlaybackQueueStateRef.current.status,
        wake_stage: w3WakeStage,
        queued_at: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        created_at_ms: nowMs
      }
      queue.push(entry)
      while (queue.length > STATUS_DIALOGUE_INPUT_QUEUE_LIMIT) {
        queue.shift()
      }
      syncDialogueInputQueueState()
      logStatusDialogueVoiceEvent(inputKind === 'speech_transcript' ? 'stt_input_queued' : 'dialogue_input_queued', {
        queue_count: queue.length,
        input_kind: inputKind,
        source: entry.source,
        reason: entry.reason,
        priority: entry.priority,
        echo_boundary: entry.echo_boundary,
        queued_during_tts: entry.queued_during_tts,
        voice_queue_status: entry.voice_queue_status,
        wake_stage: entry.wake_stage,
        text_length: input.length
      })
      setDialogueMessages((messages) => [
        ...messages.slice(-7),
        {
          id: entry.id,
          role: 'system' as const,
          text: 'Input queued. I will continue after the current reply.',
          timestamp: entry.queued_at,
          thoughts: [
            `queue count: ${queue.length}`,
            `input: ${inputKind}`,
            `reason: ${entry.reason}`,
            `priority: ${entry.priority}`,
            `echo: ${entry.echo_boundary}`,
            'boundary: same dialogue chain'
          ],
          source: 'input queue',
          statusRefs: ['status_dialogue_input_queue.v1']
        }
      ])
      return true
    },
    [syncDialogueInputQueueState, w3WakeStage, xiaozhiBridgeState.speaking_active]
  )

  const takeNextDialogueInput = useCallback((): StatusDialogueQueuedInput | undefined => {
    const next = pendingDialogueInputQueueRef.current.shift()
    syncDialogueInputQueueState()
    if (next) {
      logStatusDialogueVoiceEvent('dialogue_input_dequeued', {
        queue_count: pendingDialogueInputQueueRef.current.length,
        input_kind: next.input_kind,
        source: next.source,
        reason: next.reason,
        priority: next.priority,
        echo_boundary: next.echo_boundary,
        queued_during_tts: next.queued_during_tts,
        voice_queue_status: next.voice_queue_status,
        wake_stage: next.wake_stage,
        age_ms: Math.max(0, Date.now() - next.created_at_ms)
      })
    }
    return next
  }, [syncDialogueInputQueueState])

  useEffect(() => {
    const logElement = dialogueLogRef.current
    if (!logElement) return
    window.requestAnimationFrame(() => {
      const latestMessageElement = logElement.lastElementChild
      if (latestMessageElement instanceof HTMLElement) {
        latestMessageElement.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' })
      }
    })
  }, [dialogueMessages])

  useEffect(() => {
    let cancelled = false
    void requestStatusDialogueSnapshot(expectedStatusModules).then((nextSnapshotState) => {
      if (!cancelled) setStatusSnapshotState(nextSnapshotState)
    })
    return () => {
      cancelled = true
    }
  }, [expectedStatusModules])

  useEffect(() => {
    let cancelled = false
    void requestStatusDialogueEvents(expectedStatusModules).then((nextEventSnapshotState) => {
      if (!cancelled) {
        setSystemEventSnapshotState(nextEventSnapshotState)
        setVoiceEventBroadcastPanelState(
          buildVoiceEventBroadcastPanelStateFromSnapshot({
            snapshot: nextEventSnapshotState.snapshot,
            source: nextEventSnapshotState.source
          })
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [expectedStatusModules])

  useEffect(() => {
    let cancelled = false
    void requestStatusPatrolDialogueIndex().then((nextPatrolIndexState) => {
      if (!cancelled) setStatusPatrolIndexState(nextPatrolIndexState)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void requestStatusDialogueRuntimeVoiceDiagnostic().then((nextDiagnosticState) => {
      if (!cancelled) setRuntimeVoiceDiagnosticState(nextDiagnosticState)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const refreshSystemEventSnapshot = useCallback(async () => {
    const nextEventSnapshotState = await requestStatusDialogueEvents(expectedStatusModules)
    setSystemEventSnapshotState(nextEventSnapshotState)
    setVoiceEventBroadcastPanelState(
      buildVoiceEventBroadcastPanelStateFromSnapshot({
        snapshot: nextEventSnapshotState.snapshot,
        source: nextEventSnapshotState.source,
        currentDialogueState: voiceLatency.stage === 'playing' ? 'playing' : voiceLatency.stage === 'model' ? 'llm' : 'idle'
      })
    )
    return nextEventSnapshotState
  }, [expectedStatusModules, voiceLatency.stage])

  const refreshStatusPatrolIndex = useCallback(async () => {
    const nextPatrolIndexState = await requestStatusPatrolDialogueIndex()
    setStatusPatrolIndexState(nextPatrolIndexState)
    return nextPatrolIndexState
  }, [])

  const refreshRealEnvCheck = useCallback(async () => {
    setRealIntegrationState((current) => ({ ...current, envBusy: true, error: undefined }))
    const result = await requestStatusDialogueRealEnvCheck()
    setRealIntegrationState((current) => ({
      ...current,
      env: result,
      envBusy: false,
      source: result.source,
      error: result.status === 'fail' ? 'Phase 0 real environment check failed' : undefined
    }))
  }, [])

  useEffect(() => {
    void refreshRealEnvCheck()
  }, [refreshRealEnvCheck])

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setVoiceProfiles([DEFAULT_COSYVOICE_VOICE_PROFILE, DEFAULT_BROWSER_VOICE_PROFILE])
      setSelectedVoiceProfileId((current) => current || DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id)
      return
    }

    const synth = window.speechSynthesis
    const refreshVoices = (): void => {
      const browserProfiles = buildBrowserVoiceProfiles(synth.getVoices() as BrowserSpeechSynthesisVoiceLike[])
      const profiles = [DEFAULT_COSYVOICE_VOICE_PROFILE, ...browserProfiles]
      setVoiceProfiles(profiles)
      setSelectedVoiceProfileId((current) =>
        profiles.some((profile) => profile.profile_id === current)
          ? current
          : DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id
      )
    }

    refreshVoices()
    synth.addEventListener('voiceschanged', refreshVoices)
    return () => {
      synth.removeEventListener('voiceschanged', refreshVoices)
    }
  }, [])

  const selectedVoiceProfile = useMemo(
    () => selectVoiceProfileFallback(voiceProfiles, selectedVoiceProfileId),
    [selectedVoiceProfileId, voiceProfiles]
  )
  const audibleVoiceProfile = useMemo(() => resolveAudibleVoiceProfile(selectedVoiceProfile), [selectedVoiceProfile])

  const refreshTtsAdapterHealth = useCallback(async () => {
    setTtsAdapterState((current) => ({ ...current, busy: true, error: undefined }))
    const health = await requestStatusDialogueTtsHealth()
    setTtsAdapterState({
      health,
      busy: false,
      error: health.status === 'error' ? health.error : undefined
    })
  }, [])

  const refreshLocalSttHealth = useCallback(
    async (ensure = true) => {
      setLocalSttRuntimeState((current) => ({ ...current, busy: true, error: undefined }))
      logStatusDialogueVoiceEvent('local_stt_health_request', {
        adapter_id: 'local_whisper_persistent_service',
        model: selectedSttModel,
        ensure,
        selected_adapter: selectedSttAdapter
      })
      const health = await requestStatusDialogueLocalSttHealth({ model: selectedSttModel, ensure })
      logStatusDialogueVoiceEvent('local_stt_health_result', {
        adapter_id: health.adapter_id,
        model: health.model,
        status: health.status,
        reachable: health.reachable,
        configured: health.configured,
        latency_ms: health.latency_ms,
        loaded_models: health.loaded_models,
        device: health.device,
        error: health.error
      })
      setLocalSttRuntimeState((current) => ({
        ...current,
        health,
        busy: false,
        error: health.status === 'error' ? health.error : undefined
      }))
    },
    [selectedSttAdapter, selectedSttModel]
  )

  const refreshRemoteSttHealth = useCallback(async () => {
    const selectedAdapterAtRequest = selectedSttAdapterRef.current
    const busyState = { ...remoteSttRuntimeStateRef.current, busy: true, error: undefined }
    remoteSttRuntimeStateRef.current = busyState
    setRemoteSttRuntimeState(busyState)
    logStatusDialogueVoiceEvent('remote_stt_health_request', {
      adapter_id: 'openai_compatible_stt',
      selected_adapter: selectedAdapterAtRequest,
      boundary: 'configuration and host reachability only; no audio upload'
    })
    const health = await requestStatusDialogueRemoteSttHealth()
    logStatusDialogueVoiceEvent('remote_stt_health_result', {
      adapter_id: health.adapter_id,
      status: health.status,
      configured: health.configured,
      reachable: health.reachable,
      base_url_host: health.base_url_host,
      endpoint_path: health.endpoint_path,
      model: health.model,
      timeout_ms: health.timeout_ms,
      latency_ms: health.latency_ms,
      error: health.error
    })
    const nextState = {
      health,
      busy: false,
      error: health.status === 'error' ? health.error : undefined
    }
    remoteSttRuntimeStateRef.current = nextState
    setRemoteSttRuntimeState(nextState)
    return health
  }, [])

  useEffect(() => {
    void refreshTtsAdapterHealth()
  }, [refreshTtsAdapterHealth])

  useEffect(() => {
    if (selectedSttAdapter !== 'local') return
    void refreshLocalSttHealth(true)
  }, [refreshLocalSttHealth, selectedSttAdapter])

  useEffect(() => {
    if (selectedSttAdapter !== 'remote') return
    void refreshRemoteSttHealth()
  }, [refreshRemoteSttHealth, selectedSttAdapter])

  useEffect(() => {
    if (remoteSttStartupHealthRequestedRef.current) return
    remoteSttStartupHealthRequestedRef.current = true
    void refreshRemoteSttHealth()
  }, [refreshRemoteSttHealth])

  useEffect(() => {
    if (runtimeProbeMode || remoteSttDefaultSelectionRef.current || voiceListening) return
    const health = remoteSttRuntimeState.health
    if (health.status !== 'ready' || !health.configured || !health.reachable) return
    if (selectedSttAdapterRef.current !== 'local') return
    remoteSttDefaultSelectionRef.current = true
    selectSttAdapter('remote', 'configured_remote_stt_default')
    logStatusDialogueVoiceEvent('stt_default_remote_configured', {
      selected_adapter: 'remote',
      previous_adapter: 'local',
      provider: health.base_url_host,
      model: health.model,
      reason: 'remote_stt_configured_and_ready',
      boundary: 'adapter selection only; no microphone open; no audio upload; no world write'
    })
  }, [remoteSttRuntimeState.health, runtimeProbeMode, selectSttAdapter, voiceListening])

  useEffect(() => {
    if (selectedSttAdapter !== 'remote' || voiceListening) return
    const health = remoteSttRuntimeState.health
    const remoteKnownUnavailable =
      health.status === 'error' ||
      health.base_url_host === 'not_configured' ||
      (health.status === 'fallback' && health.error === 'remote STT is not configured')
    if (!remoteKnownUnavailable) return
    selectSttAdapter('local', 'remote_stt_known_unavailable_default_fallback')
    logStatusDialogueVoiceEvent('stt_default_remote_unavailable_fallback', {
      previous_adapter: 'remote',
      selected_adapter: 'local',
      configured: health.configured,
      reachable: health.reachable,
      status: health.status,
      error: health.error,
      reason: 'remote_stt_health_unavailable',
      boundary: 'adapter selection only; no microphone open; no audio upload; no world write'
    })
  }, [remoteSttRuntimeState.health, selectSttAdapter, selectedSttAdapter, voiceListening])

  const openGraphSettings = useCallback(() => {
    if (window.electron) {
      void window.electron.invoke('settings:open')
      return
    }
    window.location.assign(`${window.location.pathname}?window=settings`)
  }, [])

  const openSocialAssistantConfig = useCallback(() => {
    if (window.electron) {
      void window.electron.invoke('zhineng:openConsole')
      return
    }
    window.location.assign(`${window.location.pathname}?window=zhineng-console`)
  }, [])

  const patchVoiceLatency = useCallback(
    (patch: Partial<Omit<StatusDialogueVoiceLatencyState, 'updatedAt'>>) => {
      setVoiceLatency((current) => {
        const next = nowVoiceLatencyState({
          ...current,
          ...patch,
          sttModel: selectedSttModel,
          voiceMode: voiceOutputMode
        })
        voiceLatencyRef.current = next
        return next
      })
    },
    [selectedSttModel, voiceOutputMode]
  )

  const updateDialogueExecutionState = useCallback(
    (phase: StatusDialogueExecutionPhase, action: string, sourceOutputId?: string) => {
      const nextState = buildStatusDialogueExecutionState({ phase, action, sourceOutputId })
      setDialogueExecutionState(nextState)
      logStatusDialogueVoiceEvent('status_dialogue_execution_state_updated', {
        runtime_probe: runtimeProbeMode || undefined,
        phase: nextState.phase,
        label: nextState.label,
        action: nextState.action,
        step_index: nextState.step_index,
        active: nextState.active,
        source_output_id: sourceOutputId,
        boundary: 'visible execution status only; no world write; no requirement packet'
      })
    },
    [runtimeProbeMode]
  )

  const replayLastVoicePlayback = useCallback(async () => {
    unlockVoicePlayback()
    const playback = lastVoicePlaybackRef.current
    if (!playback) return
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const latency = () => {
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      return Math.max(0, Math.round(endedAt - startedAt))
    }
    const audio = prepareVoicePlaybackAudio(playback.audio_data_url, playback.plan.volume)
    try {
      await audio.play()
      setVoiceOutputTrace(
        buildVoiceOutputTrace({
          plan: playback.plan,
          voiceProfile: playback.voice_profile,
          status: 'spoken',
          latencyMs: latency()
        })
      )
      patchVoiceLatency({ stage: 'playing', playbackMs: 0 })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setVoiceOutputTrace(
        buildVoiceOutputTrace({
          plan: playback.plan,
          voiceProfile: playback.voice_profile,
          status: 'error',
          latencyMs: latency(),
          errorSummary: message
        })
      )
      patchVoiceLatency({ stage: 'error' })
    }
  }, [patchVoiceLatency, prepareVoicePlaybackAudio, unlockVoicePlayback])

  const publishXiaozhiBridgeEvent = useCallback(
    (
      type: XiaozhiStyleVoiceBridgeEventType,
      options: {
        sessionId: string
        emotion?: XiaozhiStyleEmotion
        source?: Parameters<typeof createXiaozhiStyleVoiceBridgeEvent>[0]['source']
        text?: string
        latencyMs?: number
        error?: string
        refs?: string[]
      }
    ) => {
      const event = createXiaozhiStyleVoiceBridgeEvent({
        type,
        sessionId: options.sessionId,
        emotion: options.emotion,
        source: options.source,
        text: options.text,
        latencyMs: options.latencyMs,
        error: options.error,
        refs: options.refs
      })
      setXiaozhiBridgeState((current) => reduceXiaozhiStyleVoiceBridgeEvent(current, event))
      logStatusDialogueVoiceEvent('xiaozhi_style_voice_bridge_event', { ...event })
      return event
    },
    []
  )

  const updateVoicePlaybackQueue = useCallback(
    (patch: Partial<Omit<VoicePlaybackQueueState, 'schema' | 'updated_at'>>) => {
      const nextState = {
        ...voicePlaybackQueueStateRef.current,
        ...patch,
        updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
      }
      voicePlaybackQueueStateRef.current = nextState
      voicePlaybackQueueUpdatedAtMsRef.current = Date.now()
      setVoicePlaybackQueueState(nextState)
    },
    []
  )

  const beginVoiceOutputSession = useCallback(
    (sessionId: string) => {
      activeVoiceSessionRef.current = sessionId
      voicePlaybackQueueRunIdRef.current += 1
      voicePlaybackQueueTailRef.current = Promise.resolve(undefined)
      if (voiceAudioRef.current) {
        voiceAudioRef.current.pause()
        voiceAudioRef.current = null
      }
      if (voiceLiveAudioContextRef.current) {
        void voiceLiveAudioContextRef.current.close().catch(() => undefined)
        voiceLiveAudioContextRef.current = null
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      const nextState = buildDefaultVoicePlaybackQueueState({
        sessionId,
        voiceProfile: audibleVoiceProfile,
        adapterId: audibleVoiceProfile.adapter_id
      })
      voicePlaybackQueueStateRef.current = nextState
      voicePlaybackQueueUpdatedAtMsRef.current = Date.now()
      setVoicePlaybackQueueState(nextState)
      setVoiceLatencyTrace(buildVoiceLatencyTrace({ sessionId }))
    },
    [audibleVoiceProfile]
  )

  const interruptVoicePlayback = useCallback(
    ({
      reason,
      logEvent,
      bridgeText,
      refs,
      inputKind,
      textLength
    }: {
      reason: string
      logEvent: 'voice_playback_interrupted_for_formal_input' | 'voice_playback_interrupted_for_graph_close'
      bridgeText: string
      refs: string[]
      inputKind?: StatusDialogueInputKind
      textLength?: number
    }): boolean => {
      const queueState = voicePlaybackQueueStateRef.current
      const latencyStage = voiceLatencyRef.current.stage
      const playbackActive = isVoicePlaybackActiveForInput({
        queueStatus: queueState.status,
        voiceLatencyStage: latencyStage,
        speakingActive: xiaozhiBridgeState.speaking_active
      })
      if (!playbackActive) return false
      const interruptSessionId = `${logEvent.replace(/^voice_playback_interrupted_for_/, 'voice-interrupt-')}-${Date.now()}`
      logStatusDialogueVoiceEvent(logEvent, {
        ...(inputKind ? { input_kind: inputKind } : {}),
        reason,
        previous_voice_status: queueState.status,
        previous_voice_stage: latencyStage,
        previous_session_id: queueState.session_id,
        active_session: activeVoiceSessionRef.current,
        text_length: textLength ?? 0,
        boundary:
          logEvent === 'voice_playback_interrupted_for_formal_input'
            ? 'formal_input_interrupts_tts_only'
            : 'graph_close_interrupts_tts_before_window_close'
      })
      logStatusDialogueVoiceEvent('tts_queue_interrupted', {
        source_output_id: queueState.session_id,
        voice_profile_id: queueState.voice_profile_id,
        adapter_id: queueState.adapter_id,
        previous_voice_status: queueState.status,
        previous_voice_stage: latencyStage,
        active_chunk_id: queueState.active_chunk_id,
        completed_count: queueState.completed_count,
        cached_count: queueState.cached_count,
        failed_count: queueState.failed_count,
        active_session: activeVoiceSessionRef.current,
        reason
      })
      publishXiaozhiBridgeEvent('abort', {
        sessionId: interruptSessionId,
        emotion: 'focused',
        text: bridgeText,
        refs
      })
      beginVoiceOutputSession(interruptSessionId)
      updateVoicePlaybackQueue({
        status: 'complete',
        last_error: reason
      })
      patchVoiceLatency({
        stage: 'idle',
        ttsMs: undefined,
        ttsFirstMs: undefined,
        ttsTotalMs: undefined,
        playbackMs: undefined,
        playbackFirstMs: undefined,
        playbackTotalMs: undefined
      })
      return true
    },
    [
      beginVoiceOutputSession,
      patchVoiceLatency,
      publishXiaozhiBridgeEvent,
      updateVoicePlaybackQueue,
      xiaozhiBridgeState.speaking_active
    ]
  )

  const interruptVoicePlaybackForFormalInput = useCallback(
    (inputKind: StatusDialogueInputKind, reason: string, textLength: number): boolean =>
      interruptVoicePlayback({
        inputKind,
        reason,
        textLength,
        logEvent: 'voice_playback_interrupted_for_formal_input',
        bridgeText: 'formal input interrupted voice playback',
        refs: ['voice.output_queue.interrupt', 'status_dialogue_input_queue.v1']
      }),
    [interruptVoicePlayback]
  )

  const closeGraph = useCallback(() => {
    interruptVoicePlayback({
      reason: 'graph_close_button',
      logEvent: 'voice_playback_interrupted_for_graph_close',
      bridgeText: 'graph close interrupted voice playback',
      refs: ['voice.output_queue.interrupt', 'graph.close']
    })
    if (window.electron) {
      void window.electron.invoke('zhineng:graph:close')
    } else {
      window.close()
    }
  }, [interruptVoicePlayback])

  const synthesizeVoiceChunk = useCallback(
    async (
      chunk: VoiceOutputChunk,
      plan: VoiceResponsePlan,
      voiceProfile: VoiceProfile
    ): Promise<{ result: StatusDialogueTtsSynthesisResult; cached: boolean }> => {
      const cached = voiceAudioCacheRef.current.get(chunk.cache_key)
      if (cached) {
        logStatusDialogueVoiceEvent('tts_chunk_cache_hit', {
          chunk_id: chunk.chunk_id,
          source_output_id: chunk.source_output_id,
          voice_profile_id: voiceProfile.profile_id,
          audio_mime_type: cached.audio_mime_type
        })
        return {
          cached: true,
          result: {
            schema: 'status_dialogue_tts_synthesis.v1',
            generated_at: cached.generated_at,
            success: true,
            adapter_id: 'cosyvoice_local_http',
            voice_profile_id: voiceProfile.profile_id,
            latency_ms: 0,
            audio_data_url: cached.audio_data_url,
            audio_mime_type: cached.audio_mime_type
          }
        }
      }

      const pending = voiceSynthesisPromiseRef.current.get(chunk.cache_key)
      if (pending) {
        const result = await pending
        return { result, cached: result.success === true && result.cache_hit === true }
      }

      const chunkPlan: VoiceResponsePlan = {
        ...plan,
        text: chunk.text,
        source_output_id: chunk.chunk_id,
        voice_profile_id: voiceProfile.profile_id,
        clone_profile_id: voiceProfile.clone_profile_id
      }
      if (voiceOutputMode === 'cosyvoice_stream_assembled' || voiceOutputMode === 'edge_readaloud_stream') {
        const streamStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
        const edgeMode = voiceOutputMode === 'edge_readaloud_stream'
        const streamResult = await requestStatusDialogueTtsStream({
          schema: 'status_dialogue_tts_synthesis.v1',
          sessionId: chunk.chunk_id,
          plan: chunkPlan,
          voice_profile: voiceProfile,
          ...(edgeMode
            ? {
                adapter_id: 'edge_readaloud_websocket' as const,
                response_format: 'mp3' as const,
                voice: voiceProfile.voice_id && voiceProfile.voice_id !== 'default' ? voiceProfile.voice_id : 'zh-CN-XiaoxiaoNeural',
                locale: voiceProfile.locale || 'zh-CN',
                skip_cache: true
              }
            : {})
        })
        const streamLatencyMs = streamResult.totalStreamMs ??
          Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - streamStartedAt))
        setTtsRuntimePolicy(
          assessTtsRuntimePolicy({
            mode: voiceOutputMode,
            responseFormat: edgeMode ? 'mp3' : 'wav',
            success: streamResult.success === true,
            firstAudioPayloadMs: streamResult.firstFrameMs,
            totalStreamMs: streamLatencyMs,
            frameCount: streamResult.frameCount,
            source: edgeMode ? 'edge_readaloud_stream_runtime' : 'stream_assembled_runtime',
            error: streamResult.error || streamResult.assemblyErrors?.join('; ')
          })
        )
        if (streamResult.success && streamResult.audioDataUrl && streamResult.frameSequenceOk !== false) {
          logStatusDialogueVoiceEvent(edgeMode ? 'tts_edge_readaloud_stream_ready' : 'tts_stream_assembled_ready', {
            chunk_id: chunk.chunk_id,
            source_output_id: chunk.source_output_id,
            voice_profile_id: voiceProfile.profile_id,
            frame_count: streamResult.frameCount,
            final_frame_count: streamResult.finalFrameCount,
            first_frame_ms: streamResult.firstFrameMs,
            total_stream_ms: streamLatencyMs,
            cache_hit: streamResult.cacheHit
          })
          const result: StatusDialogueTtsSynthesisResult = {
            schema: 'status_dialogue_tts_synthesis.v1',
            generated_at: new Date().toISOString(),
            success: true,
            adapter_id: edgeMode ? 'edge_readaloud_websocket' : 'cosyvoice_local_http',
            voice_profile_id: voiceProfile.profile_id,
            latency_ms: streamLatencyMs,
            audio_data_url: streamResult.audioDataUrl,
            audio_mime_type: streamResult.audioMimeType,
            cache_hit: streamResult.cacheHit
          }
          voiceAudioCacheRef.current.set(chunk.cache_key, {
            audio_data_url: streamResult.audioDataUrl,
            audio_mime_type: streamResult.audioMimeType,
            latency_ms: streamLatencyMs,
            generated_at: result.generated_at
          })
          return { result, cached: streamResult.cacheHit === true }
        }
        return {
          cached: false,
          result: {
            schema: 'status_dialogue_tts_synthesis.v1',
            generated_at: new Date().toISOString(),
            success: false,
            adapter_id: 'cosyvoice_local_http',
            voice_profile_id: voiceProfile.profile_id,
            latency_ms: streamLatencyMs,
            fallback_reason: 'stream frame assembly failed',
            error: streamResult.error || streamResult.assemblyErrors?.join('; ') || 'stream did not produce playable audio'
          }
        }
      }

      const promise = requestStatusDialogueTtsSynthesis({
        schema: 'status_dialogue_tts_synthesis.v1',
        plan: chunkPlan,
        voice_profile: voiceProfile
      })
      voiceSynthesisPromiseRef.current.set(chunk.cache_key, promise)
      try {
        const result = await promise
        if (result.success && result.audio_data_url) {
          voiceAudioCacheRef.current.set(chunk.cache_key, {
            audio_data_url: result.audio_data_url,
            audio_mime_type: result.audio_mime_type,
            latency_ms: result.latency_ms,
            generated_at: result.generated_at
          })
          while (voiceAudioCacheRef.current.size > VOICE_AUDIO_CACHE_LIMIT) {
            const firstKey = voiceAudioCacheRef.current.keys().next().value
            if (!firstKey) break
            voiceAudioCacheRef.current.delete(firstKey)
          }
        }
        return { result, cached: result.success === true && result.cache_hit === true }
      } finally {
        voiceSynthesisPromiseRef.current.delete(chunk.cache_key)
      }
    },
    [voiceOutputMode]
  )

  const playVoiceAudioChunk = useCallback(
    async (input: {
      chunk: VoiceOutputChunk
      audioDataUrl: string
      plan: VoiceResponsePlan
      voiceProfile: VoiceProfile
      bridgeEmotion: XiaozhiStyleEmotion
      token: number
    }): Promise<number> =>
      new Promise((resolve, reject) => {
        if (voicePlaybackQueueRunIdRef.current !== input.token) {
          resolve(0)
          return
        }
        const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
        const audio = prepareVoicePlaybackAudio(input.audioDataUrl, input.plan.volume)
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel()
        }
        audio.onplaying = () => {
          publishXiaozhiBridgeEvent('tts_sentence_start', {
            sessionId: input.chunk.source_output_id,
            emotion: input.bridgeEmotion,
            text: input.chunk.text,
            refs: ['voice.output_queue.playing', input.voiceProfile.profile_id, input.chunk.chunk_id]
          })
          logStatusDialogueVoiceEvent('tts_chunk_playing', {
            chunk_id: input.chunk.chunk_id,
            source_output_id: input.chunk.source_output_id,
            voice_profile_id: input.voiceProfile.profile_id,
            index: input.chunk.index,
            total: input.chunk.total
          })
        }
        let settled = false
        let timeoutId: number | undefined
        const clearPlaybackTimeout = () => {
          if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId)
            timeoutId = undefined
          }
        }
        const resolveOnce = (value: number) => {
          if (settled) return
          settled = true
          clearPlaybackTimeout()
          resolve(value)
        }
        const rejectOnce = (error: Error) => {
          if (settled) return
          settled = true
          clearPlaybackTimeout()
          reject(error)
        }
        timeoutId = window.setTimeout(() => {
          if (voiceAudioRef.current === audio) {
            audio.pause()
            voiceAudioRef.current = null
          }
          logStatusDialogueVoiceEvent('tts_chunk_playback_timeout', {
            chunk_id: input.chunk.chunk_id,
            source_output_id: input.chunk.source_output_id,
            voice_profile_id: input.voiceProfile.profile_id,
            timeout_ms: VOICE_PLAYBACK_CHUNK_TIMEOUT_MS,
            text_length: input.chunk.text.length
          })
          rejectOnce(new Error('audio playback timeout'))
        }, VOICE_PLAYBACK_CHUNK_TIMEOUT_MS)
        audio.onended = () => {
          const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
          if (voiceAudioRef.current === audio) voiceAudioRef.current = null
          resolveOnce(Math.max(0, Math.round(endedAt - startedAt)))
        }
        audio.onpause = () => {
          if (voicePlaybackQueueRunIdRef.current !== input.token) {
            if (voiceAudioRef.current === audio) voiceAudioRef.current = null
            resolveOnce(0)
          }
        }
        audio.onerror = () => {
          if (voiceAudioRef.current === audio) voiceAudioRef.current = null
          rejectOnce(new Error('audio playback failed'))
        }
        audio.play().catch((error) => {
          if (voiceAudioRef.current === audio) voiceAudioRef.current = null
          rejectOnce(error)
        })
      }),
    [prepareVoicePlaybackAudio, publishXiaozhiBridgeEvent]
  )

  const playVoiceLivePcmStreamChunk = useCallback(
    async (input: {
      chunk: VoiceOutputChunk
      plan: VoiceResponsePlan
      voiceProfile: VoiceProfile
      bridgeEmotion: XiaozhiStyleEmotion
      token: number
    }): Promise<{
      playbackMs: number
      firstPlaybackMs?: number
      firstFrameMs?: number
      totalStreamMs?: number
      frameCount: number
      finalFrameCount: number
    }> => {
      if (voicePlaybackQueueRunIdRef.current !== input.token) {
        return { playbackMs: 0, frameCount: 0, finalFrameCount: 0 }
      }

      const AudioContextCtor = getBrowserAudioContextConstructor()
      if (!AudioContextCtor) throw new Error('AudioContext unavailable for live PCM playback')

      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (voiceAudioRef.current) {
        voiceAudioRef.current.pause()
        voiceAudioRef.current = null
      }
      if (voiceLiveAudioContextRef.current) {
        void voiceLiveAudioContextRef.current.close().catch(() => undefined)
        voiceLiveAudioContextRef.current = null
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }

      const audioContext = new AudioContextCtor()
      voiceLiveAudioContextRef.current = audioContext
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      const gain = audioContext.createGain()
      gain.gain.value = Math.max(0, Math.min(1, input.plan.volume))
      gain.connect(audioContext.destination)

      let frameCount = 0
      let finalFrameCount = 0
      let firstFrameMs: number | undefined
      let firstPlaybackMs: number | undefined
      let playbackCursor = audioContext.currentTime + LIVE_PCM_PLAYBACK_PREROLL_SECONDS
      let sourceCount = 0
      let endedCount = 0
      let finalSeen = false
      let sentenceStartPublished = false
      let playbackError: Error | undefined

      let resolvePlayback: (value: number) => void = () => undefined
      const playbackDone = new Promise<number>((resolve) => {
        resolvePlayback = resolve
      })
      const elapsed = () =>
        Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt))
      const maybeResolve = () => {
        if (!finalSeen || endedCount < sourceCount) return
        resolvePlayback(elapsed())
      }

      const scheduleFrame = (frame: StreamingTtsAudioFrame) => {
        if (voicePlaybackQueueRunIdRef.current !== input.token) return
        if (frame.final) {
          finalFrameCount += 1
          finalSeen = true
          maybeResolve()
          return
        }
        if (!frame.audio_base64) return
        if (!frame.audio_mime_type.includes('pcm')) {
          playbackError = new Error(`live PCM expected audio/pcm, got ${frame.audio_mime_type}`)
          finalSeen = true
          maybeResolve()
          return
        }

        const samples = decodePcm16LeMonoBase64(frame.audio_base64)
        if (samples.length === 0) return
        frameCount += 1
        firstFrameMs = firstFrameMs ?? elapsed()

        const buffer = audioContext.createBuffer(1, samples.length, COSYVOICE_STREAM_PCM_SAMPLE_RATE)
        buffer.copyToChannel(new Float32Array(samples), 0)
        const source = audioContext.createBufferSource()
        source.buffer = buffer
        source.connect(gain)

        const startAt = Math.max(audioContext.currentTime + 0.01, playbackCursor)
        playbackCursor = startAt + buffer.duration
        sourceCount += 1
        firstPlaybackMs = firstPlaybackMs ?? Math.max(0, Math.round(elapsed() + (startAt - audioContext.currentTime) * 1000))
        source.onended = () => {
          endedCount += 1
          maybeResolve()
        }
        source.start(startAt)

        if (!sentenceStartPublished) {
          sentenceStartPublished = true
          publishXiaozhiBridgeEvent('tts_sentence_start', {
            sessionId: input.chunk.source_output_id,
            emotion: input.bridgeEmotion,
            text: input.chunk.text,
            refs: ['voice.output_queue.live_pcm_playing', input.voiceProfile.profile_id, input.chunk.chunk_id]
          })
          logStatusDialogueVoiceEvent('tts_live_pcm_playing', {
            chunk_id: input.chunk.chunk_id,
            source_output_id: input.chunk.source_output_id,
            voice_profile_id: input.voiceProfile.profile_id,
            first_frame_ms: firstFrameMs,
            first_playback_ms: firstPlaybackMs
          })
        }
      }

      try {
        const streamResult = await requestStatusDialogueTtsStream(
          {
            schema: 'status_dialogue_tts_synthesis.v1',
            sessionId: input.chunk.chunk_id,
            plan: {
              ...input.plan,
              text: input.chunk.text,
              source_output_id: input.chunk.chunk_id,
              voice_profile_id: input.voiceProfile.profile_id,
              clone_profile_id: input.voiceProfile.clone_profile_id
            },
            voice_profile: input.voiceProfile,
            response_format: 'pcm',
            skip_cache: true
          },
          (event) => {
            if (event.type === 'frame' && event.frame) scheduleFrame(event.frame)
          }
        )
        if (!streamResult.success) {
          throw new Error(streamResult.error || 'live PCM stream failed')
        }
        if (playbackError) throw playbackError
        if (frameCount === 0) throw new Error('live PCM stream produced no playable audio frames')
        finalSeen = finalSeen || (streamResult.finalFrameCount ?? 0) > 0
        maybeResolve()
        const playbackMs = await playbackDone
        return {
          playbackMs,
          firstPlaybackMs,
          firstFrameMs: streamResult.firstFrameMs ?? firstFrameMs,
          totalStreamMs: streamResult.totalStreamMs,
          frameCount: streamResult.frameCount ?? frameCount,
          finalFrameCount: streamResult.finalFrameCount ?? finalFrameCount
        }
      } catch (error) {
        throw error
      } finally {
        gain.disconnect()
        if (voiceLiveAudioContextRef.current === audioContext) {
          voiceLiveAudioContextRef.current = null
        }
        void audioContext.close().catch(() => undefined)
      }
    },
    [publishXiaozhiBridgeEvent]
  )

  const playVoicePlanThroughQueue = useCallback(
    async (input: {
      plan: VoiceResponsePlan
      voiceProfile: VoiceProfile
      sourceOutputId: string
      kind: VoiceOutputChunk['kind']
      priority?: VoiceOutputChunk['priority']
      bridgeEmotion: XiaozhiStyleEmotion
      emotionHint?: VoiceEmotionPreset
      totalStartedAt?: number
    }): Promise<QueuedVoicePlaybackResult> => {
      const lockedProfile = resolveAudibleVoiceProfile(input.voiceProfile)
      const effectivePlan = applyVoiceToneToPlan({
        plan: input.plan,
        voiceProfile: lockedProfile,
        emotionHint: input.emotionHint
      })
      const chunks = segmentVoiceResponsePlan(effectivePlan, lockedProfile, {
        kind: input.kind,
        priority: input.priority ?? 'normal',
        emotionHint: effectivePlan.emotion_hint,
        maxChars: input.kind === 'final' && voiceOutputMode === 'cosyvoice_full' ? 32 : VOICE_CHUNK_MAX_CHARS,
        minChars: VOICE_CHUNK_MIN_CHARS,
        interruptPrevious: false
      })
      const token = voicePlaybackQueueRunIdRef.current
      const queuedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const initialTrace = buildVoiceOutputTrace({
        plan: effectivePlan,
        voiceProfile: lockedProfile,
        status: chunks.length > 0 ? 'ready' : 'skipped',
        errorSummary: chunks.length > 0 ? undefined : 'empty voice chunks'
      })
      setVoiceOutputTrace(initialTrace)
      updateVoicePlaybackQueue({
        session_id: activeVoiceSessionRef.current,
        mode: 'high_quality_chunked',
        status: chunks.length > 0 ? 'queued' : 'error',
        voice_profile_id: lockedProfile.profile_id,
        adapter_id: lockedProfile.adapter_id,
        queued_count: chunks.length,
        completed_count: 0,
        failed_count: 0,
        cached_count: 0,
        last_error: chunks.length > 0 ? undefined : 'empty voice chunks'
      })

      const run = async (): Promise<QueuedVoicePlaybackResult> => {
        let completedCount = 0
        let failedCount = 0
        let cachedCount = 0
        let totalTtsMs = 0
        let firstTtsMs: number | undefined
        let totalPlaybackMs = 0
        let firstPlaybackMs: number | undefined
        const latencySegments: VoiceLatencySegment[] = []
        let finalTrace = initialTrace

        if (!voiceEnabledRef.current || typeof window === 'undefined') {
          finalTrace = buildVoiceOutputTrace({
            plan: effectivePlan,
            voiceProfile: lockedProfile,
            status: 'skipped',
            errorSummary: 'voice output disabled'
          })
          setVoiceOutputTrace(finalTrace)
          updateDialogueExecutionState('complete', '语音关闭，文字回复已完成', input.sourceOutputId)
          return { trace: finalTrace, chunks, cached_count: 0, failed_count: chunks.length, total_tts_ms: 0, total_playback_ms: 0 }
        }

        publishXiaozhiBridgeEvent('tts_start', {
          sessionId: input.sourceOutputId,
          emotion: input.bridgeEmotion,
          text: effectivePlan.text,
          refs: ['voice.output_queue.start', lockedProfile.profile_id]
        })

        for (const chunk of chunks) {
          if (voicePlaybackQueueRunIdRef.current !== token) {
            logStatusDialogueVoiceEvent('tts_chunk_skipped_stale', {
              chunk_id: chunk.chunk_id,
              source_output_id: chunk.source_output_id,
              active_session: activeVoiceSessionRef.current
            })
            latencySegments.push({
              chunk_id: chunk.chunk_id,
              source_output_id: chunk.source_output_id,
              kind: chunk.kind,
              index: chunk.index,
              total: chunk.total,
              text_length: chunk.text.length,
              cache_hit: false,
              status: 'skipped',
              error: 'stale voice queue token'
            })
            break
          }

          updateVoicePlaybackQueue({
            status: 'synthesizing',
            active_chunk_id: chunk.chunk_id,
            queued_count: chunks.length,
            completed_count: completedCount,
            failed_count: failedCount,
            cached_count: cachedCount
          })
          updateDialogueExecutionState(
            'speaking',
            input.kind === 'ack'
              ? '模型等待较久，正在生成短提示'
              : `正在生成 TTS 第 ${chunk.index}/${chunk.total} 段`,
            input.sourceOutputId
          )
          patchVoiceLatency({
            stage: input.kind === 'ack' ? 'ack' : 'tts_generating',
            chunkCount: chunks.length,
            cacheHits: cachedCount,
            failedChunks: failedCount
          })
          logStatusDialogueVoiceEvent('tts_chunk_synthesis_start', {
            chunk_id: chunk.chunk_id,
            source_output_id: chunk.source_output_id,
            voice_profile_id: lockedProfile.profile_id,
            index: chunk.index,
            total: chunk.total,
            text_length: chunk.text.length,
            cache_key: chunk.cache_key
          })

          const synthStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
          if (voiceOutputMode === 'cosyvoice_stream_live_pcm') {
            updateVoicePlaybackQueue({
              status: 'playing',
              active_chunk_id: chunk.chunk_id,
              queued_count: chunks.length,
              completed_count: completedCount,
              failed_count: failedCount,
              cached_count: cachedCount
            })
            updateDialogueExecutionState(
              'speaking',
              input.kind === 'ack'
                ? '模型等待较久，正在播放短提示'
                : `正在播放第 ${chunk.index}/${chunk.total} 段`,
              input.sourceOutputId
            )
            try {
              const liveResult = await playVoiceLivePcmStreamChunk({
                chunk,
                plan: effectivePlan,
                voiceProfile: lockedProfile,
                bridgeEmotion: input.bridgeEmotion,
                token
              })
              const synthEndedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
              const streamMs = liveResult.totalStreamMs ?? Math.max(0, Math.round(synthEndedAt - synthStartedAt))
              setTtsRuntimePolicy(
                assessTtsRuntimePolicy({
                  mode: voiceOutputMode,
                  responseFormat: 'pcm',
                  success: true,
                  firstAudioPayloadMs: liveResult.firstFrameMs,
                  totalStreamMs: liveResult.totalStreamMs ?? streamMs,
                  frameCount: liveResult.frameCount,
                  source: 'live_pcm_runtime'
                })
              )
              totalTtsMs += streamMs
              firstTtsMs = firstTtsMs ?? liveResult.firstFrameMs ?? streamMs
              completedCount += 1
              totalPlaybackMs += liveResult.playbackMs
              firstPlaybackMs = firstPlaybackMs ?? liveResult.firstPlaybackMs ?? liveResult.playbackMs
              patchVoiceLatency({
                stage: 'playing',
                ttsMs: firstTtsMs,
                ttsFirstMs: firstTtsMs,
                ttsTotalMs: totalTtsMs,
                playbackMs: firstPlaybackMs,
                playbackFirstMs: firstPlaybackMs,
                playbackTotalMs: totalPlaybackMs,
                totalMs: input.totalStartedAt
                  ? Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - input.totalStartedAt))
                  : undefined,
                chunkCount: chunks.length,
                cacheHits: cachedCount,
                failedChunks: failedCount
              })
              logStatusDialogueVoiceEvent('tts_live_pcm_complete', {
                chunk_id: chunk.chunk_id,
                source_output_id: chunk.source_output_id,
                voice_profile_id: lockedProfile.profile_id,
                first_frame_ms: liveResult.firstFrameMs,
                total_stream_ms: liveResult.totalStreamMs,
                first_playback_ms: liveResult.firstPlaybackMs,
                playback_ms: liveResult.playbackMs,
                frame_count: liveResult.frameCount,
                final_frame_count: liveResult.finalFrameCount
              })
              latencySegments.push({
                chunk_id: chunk.chunk_id,
                source_output_id: chunk.source_output_id,
                kind: chunk.kind,
                index: chunk.index,
                total: chunk.total,
                text_length: chunk.text.length,
                cache_hit: false,
                status: 'spoken',
                tts_ms: streamMs,
                first_frame_ms: liveResult.firstFrameMs,
                total_stream_ms: liveResult.totalStreamMs,
                playback_ms: liveResult.playbackMs
              })
              continue
            } catch (error) {
              failedCount += 1
              const message = error instanceof Error ? error.message : String(error)
              setTtsRuntimePolicy(
                assessTtsRuntimePolicy({
                  mode: voiceOutputMode,
                  responseFormat: 'pcm',
                  success: false,
                  totalStreamMs: Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - synthStartedAt)),
                  source: 'live_pcm_runtime_error',
                  error: message
                })
              )
              latencySegments.push({
                chunk_id: chunk.chunk_id,
                source_output_id: chunk.source_output_id,
                kind: chunk.kind,
                index: chunk.index,
                total: chunk.total,
                text_length: chunk.text.length,
                cache_hit: false,
                status: 'error',
                tts_ms: Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - synthStartedAt)),
                error: message
              })
              finalTrace = buildVoiceOutputTrace({
                plan: effectivePlan,
                voiceProfile: lockedProfile,
                status: 'error',
                latencyMs: totalTtsMs,
                errorSummary: message
              })
              setVoiceOutputTrace(finalTrace)
              updateVoicePlaybackQueue({
                status: 'error',
                active_chunk_id: chunk.chunk_id,
                completed_count: completedCount,
                failed_count: failedCount,
                cached_count: cachedCount,
                last_error: message
              })
              patchVoiceLatency({
                stage: 'error',
                ttsFirstMs: firstTtsMs,
                ttsTotalMs: totalTtsMs,
                playbackMs: firstPlaybackMs,
                playbackFirstMs: firstPlaybackMs,
                playbackTotalMs: totalPlaybackMs,
                failedChunks: failedCount
              })
              publishXiaozhiBridgeEvent('error', {
                sessionId: input.sourceOutputId,
                emotion: 'urgent',
                error: message,
                refs: ['voice.output_queue.live_pcm_error', lockedProfile.profile_id, chunk.chunk_id]
              })
              logStatusDialogueVoiceEvent('tts_live_pcm_error', {
                chunk_id: chunk.chunk_id,
                source_output_id: chunk.source_output_id,
                voice_profile_id: lockedProfile.profile_id,
                error: message
              })
              continue
            }
          }

          const { result, cached } = await synthesizeVoiceChunk(chunk, effectivePlan, lockedProfile)
          const synthEndedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
          const chunkTtsMs = cached ? 0 : result.latency_ms ?? Math.max(0, Math.round(synthEndedAt - synthStartedAt))
          totalTtsMs += chunkTtsMs
          firstTtsMs = firstTtsMs ?? chunkTtsMs
          cachedCount += cached ? 1 : 0

          if (voicePlaybackQueueRunIdRef.current !== token) {
            logStatusDialogueVoiceEvent('tts_chunk_skipped_stale_after_synthesis', {
              chunk_id: chunk.chunk_id,
              source_output_id: chunk.source_output_id,
              active_session: activeVoiceSessionRef.current,
              tts_ms: chunkTtsMs,
              reason: 'new dialogue input interrupted playback'
            })
            latencySegments.push({
              chunk_id: chunk.chunk_id,
              source_output_id: chunk.source_output_id,
              kind: chunk.kind,
              index: chunk.index,
              total: chunk.total,
              text_length: chunk.text.length,
              cache_hit: cached,
              status: 'skipped',
              tts_ms: chunkTtsMs,
              error: 'stale voice queue token after synthesis'
            })
            break
          }

          if (!result.success || !result.audio_data_url) {
            failedCount += 1
            const errorSummary = result.fallback_reason ?? result.error ?? 'CosyVoice synthesis failed'
            latencySegments.push({
              chunk_id: chunk.chunk_id,
              source_output_id: chunk.source_output_id,
              kind: chunk.kind,
              index: chunk.index,
              total: chunk.total,
              text_length: chunk.text.length,
              cache_hit: cached,
              status: 'error',
              tts_ms: chunkTtsMs,
              error: errorSummary
            })
            finalTrace = buildVoiceOutputTrace({
              plan: effectivePlan,
              voiceProfile: lockedProfile,
              status: 'error',
              latencyMs: totalTtsMs,
              errorSummary
            })
            setVoiceOutputTrace(finalTrace)
            updateVoicePlaybackQueue({
              status: 'error',
              active_chunk_id: chunk.chunk_id,
              failed_count: failedCount,
              cached_count: cachedCount,
              last_error: errorSummary
            })
            patchVoiceLatency({
              stage: 'error',
              ttsFirstMs: firstTtsMs,
              ttsTotalMs: totalTtsMs,
              ttsMs: firstTtsMs,
              cacheHits: cachedCount,
              failedChunks: failedCount
            })
            publishXiaozhiBridgeEvent('error', {
              sessionId: input.sourceOutputId,
              emotion: 'urgent',
              error: errorSummary,
              refs: ['voice.output_queue.tts_error', lockedProfile.profile_id, chunk.chunk_id]
            })
            logStatusDialogueVoiceEvent('tts_chunk_synthesis_error', {
              chunk_id: chunk.chunk_id,
              source_output_id: chunk.source_output_id,
              voice_profile_id: lockedProfile.profile_id,
              error: errorSummary
            })
            continue
          }

          rememberVoicePlayback({
            audio_data_url: result.audio_data_url,
            plan: { ...effectivePlan, text: chunk.text, source_output_id: chunk.chunk_id },
            voice_profile: lockedProfile,
            source_output_id: chunk.chunk_id
          })
          updateVoicePlaybackQueue({
            status: 'playing',
            active_chunk_id: chunk.chunk_id,
            queued_count: chunks.length,
            completed_count: completedCount,
            failed_count: failedCount,
            cached_count: cachedCount
          })
          updateDialogueExecutionState(
            'speaking',
            input.kind === 'ack'
              ? '模型等待较久，正在播放短提示'
              : `正在播放第 ${chunk.index}/${chunk.total} 段`,
            input.sourceOutputId
          )
          patchVoiceLatency({
            stage: 'playing',
            ttsMs: firstTtsMs,
            ttsFirstMs: firstTtsMs,
            ttsTotalMs: totalTtsMs,
            chunkCount: chunks.length,
            cacheHits: cachedCount,
            failedChunks: failedCount
          })

          try {
            const playbackMs = await playVoiceAudioChunk({
              chunk,
              audioDataUrl: result.audio_data_url,
              plan: effectivePlan,
              voiceProfile: lockedProfile,
              bridgeEmotion: input.bridgeEmotion,
              token
            })
            completedCount += 1
            totalPlaybackMs += playbackMs
            firstPlaybackMs = firstPlaybackMs ?? playbackMs
            latencySegments.push({
              chunk_id: chunk.chunk_id,
              source_output_id: chunk.source_output_id,
              kind: chunk.kind,
              index: chunk.index,
              total: chunk.total,
              text_length: chunk.text.length,
              cache_hit: cached,
              status: 'spoken',
              tts_ms: chunkTtsMs,
              playback_ms: playbackMs
            })
            patchVoiceLatency({
              stage: 'playing',
              playbackMs: firstPlaybackMs,
              playbackFirstMs: firstPlaybackMs,
              playbackTotalMs: totalPlaybackMs,
              totalMs: input.totalStartedAt
                ? Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - input.totalStartedAt))
                : undefined,
              chunkCount: chunks.length,
              cacheHits: cachedCount,
              failedChunks: failedCount
            })
          } catch (error) {
            failedCount += 1
            const message = error instanceof Error ? error.message : String(error)
            latencySegments.push({
              chunk_id: chunk.chunk_id,
              source_output_id: chunk.source_output_id,
              kind: chunk.kind,
              index: chunk.index,
              total: chunk.total,
              text_length: chunk.text.length,
              cache_hit: cached,
              status: 'error',
              tts_ms: chunkTtsMs,
              error: message
            })
            finalTrace = buildVoiceOutputTrace({
              plan: effectivePlan,
              voiceProfile: lockedProfile,
              status: 'error',
              latencyMs: totalTtsMs,
              errorSummary: message
            })
            setVoiceOutputTrace(finalTrace)
            updateVoicePlaybackQueue({
              status: 'error',
              active_chunk_id: chunk.chunk_id,
              completed_count: completedCount,
              failed_count: failedCount,
              cached_count: cachedCount,
              last_error: message
            })
            patchVoiceLatency({
              stage: 'error',
              playbackMs: firstPlaybackMs,
              playbackFirstMs: firstPlaybackMs,
              playbackTotalMs: totalPlaybackMs,
              failedChunks: failedCount
            })
            publishXiaozhiBridgeEvent('error', {
              sessionId: input.sourceOutputId,
              emotion: 'urgent',
              error: message,
              refs: ['voice.output_queue.playback_error', lockedProfile.profile_id, chunk.chunk_id]
            })
          }
        }

        if (voicePlaybackQueueRunIdRef.current !== token) {
          const interruptedTrace = buildVoiceOutputTrace({
            plan: effectivePlan,
            voiceProfile: lockedProfile,
            status: 'skipped',
            latencyMs: totalTtsMs + totalPlaybackMs,
            errorSummary: 'voice playback interrupted by newer input'
          })
          logStatusDialogueVoiceEvent('tts_queue_interrupted', {
            source_output_id: input.sourceOutputId,
            voice_profile_id: lockedProfile.profile_id,
            chunks: chunks.length,
            completed_count: completedCount,
            cached_count: cachedCount,
            total_tts_ms: totalTtsMs,
            total_playback_ms: totalPlaybackMs,
            active_session: activeVoiceSessionRef.current
          })
          return {
            trace: interruptedTrace,
            chunks,
            cached_count: cachedCount,
            failed_count: failedCount,
            total_tts_ms: totalTtsMs,
            total_playback_ms: totalPlaybackMs
          }
        }

        const endToEndMs = input.totalStartedAt
          ? Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - input.totalStartedAt))
          : Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - queuedAt))
        const status: VoiceOutputTrace['status'] = completedCount > 0 && failedCount === 0 ? 'spoken' : 'error'
        finalTrace = buildVoiceOutputTrace({
          plan: effectivePlan,
          voiceProfile: lockedProfile,
          status,
          latencyMs: totalTtsMs + totalPlaybackMs,
          errorSummary: failedCount > 0 ? `${failedCount} voice chunk(s) failed` : undefined
        })
        setVoiceOutputTrace(finalTrace)
        setVoiceLatencyTrace(
          buildVoiceLatencyTrace({
            sessionId: input.sourceOutputId,
            sttMs: voiceLatency.sttMs,
            modelMs: voiceLatency.modelMs,
            firstTtsMs,
            totalTtsMs,
            firstPlaybackMs,
            totalPlaybackMs,
            endToEndMs,
            chunkCount: chunks.length,
            cachedChunkCount: cachedCount,
            failedChunkCount: failedCount,
            segments: latencySegments
          })
        )
        updateVoicePlaybackQueue({
          status: failedCount > 0 && completedCount === 0 ? 'error' : 'complete',
          active_chunk_id: undefined,
          queued_count: chunks.length,
          completed_count: completedCount,
          failed_count: failedCount,
          cached_count: cachedCount,
          last_error: failedCount > 0 ? `${failedCount} voice chunk(s) failed` : undefined
        })
        updateDialogueExecutionState(
          failedCount > 0 && completedCount === 0 ? 'error' : 'complete',
          failedCount > 0 && completedCount === 0 ? `${failedCount} 段语音失败` : '回复播放完成',
          input.sourceOutputId
        )
        patchVoiceLatency({
          stage: failedCount > 0 && completedCount === 0 ? 'error' : 'complete',
          ttsMs: firstTtsMs,
          ttsFirstMs: firstTtsMs,
          ttsTotalMs: totalTtsMs,
          playbackMs: firstPlaybackMs,
          playbackFirstMs: firstPlaybackMs,
          playbackTotalMs: totalPlaybackMs,
          totalMs: endToEndMs,
          chunkCount: chunks.length,
          cacheHits: cachedCount,
          failedChunks: failedCount
        })
        publishXiaozhiBridgeEvent('tts_stop', {
          sessionId: input.sourceOutputId,
          emotion: input.bridgeEmotion,
          text: effectivePlan.text,
          latencyMs: totalTtsMs + totalPlaybackMs,
          refs: ['voice.output_queue.complete', lockedProfile.profile_id]
        })
        logStatusDialogueVoiceEvent('tts_queue_complete', {
          source_output_id: input.sourceOutputId,
          voice_profile_id: lockedProfile.profile_id,
          chunks: chunks.length,
          completed_count: completedCount,
          failed_count: failedCount,
          cached_count: cachedCount,
          total_tts_ms: totalTtsMs,
          total_playback_ms: totalPlaybackMs,
          latency_segments: latencySegments,
          end_to_end_ms: endToEndMs
        })
        return {
          trace: finalTrace,
          chunks,
          cached_count: cachedCount,
          failed_count: failedCount,
          total_tts_ms: totalTtsMs,
          total_playback_ms: totalPlaybackMs
        }
      }

      const nextRun = voicePlaybackQueueTailRef.current.then(run, run)
      voicePlaybackQueueTailRef.current = nextRun
      return (
        (await nextRun) ?? {
          trace: initialTrace,
          chunks,
          cached_count: 0,
          failed_count: chunks.length,
          total_tts_ms: 0,
          total_playback_ms: 0
        }
      )
    },
    [
      patchVoiceLatency,
      playVoiceAudioChunk,
      playVoiceLivePcmStreamChunk,
      publishXiaozhiBridgeEvent,
      rememberVoicePlayback,
      synthesizeVoiceChunk,
      updateDialogueExecutionState,
      updateVoicePlaybackQueue,
      voiceLatency.modelMs,
      voiceLatency.sttMs,
      voiceOutputMode
    ]
  )

  const replayVoiceEventBroadcastQueue = useCallback(async () => {
    unlockVoicePlayback()
    const patches = voiceEventBroadcastPanelState.patches.filter((patch) => patch.play_mode !== 'silent')
    if (patches.length === 0) {
      setVoiceEventBroadcastPanelState((current) => ({
        ...current,
        last_error: 'no speakable voice_script_patch.v1 in queue',
        generatedAt: new Date().toISOString()
      }))
      return
    }
    const sourceOutputId = `voice-event-broadcast-replay-${Date.now()}`
    const broadcastText = buildVoiceEventBroadcastSpeechText(patches, 5)
    const hasCritical = voiceEventBroadcastPanelState.requests.some((request) => request.weight === 'critical')
    const hasHigh = voiceEventBroadcastPanelState.requests.some((request) => request.weight === 'high')
    const priority = hasCritical ? 'urgent' : hasHigh ? 'notice' : 'normal'
    const emotionHint: VoiceEmotionPreset = hasCritical ? 'urgent' : hasHigh ? 'focused' : 'warm'
    const bridgeEmotion: XiaozhiStyleEmotion = hasCritical ? 'urgent' : hasHigh ? 'focused' : 'warm'
    const output = guardStatusDialogueOutput(
      {
        reply: broadcastText,
        voiceText: broadcastText,
        thoughts: [
          'manual replay: voice_event_broadcast_queue',
          `requests: ${voiceEventBroadcastPanelState.requests.length}`,
          `patches: ${patches.length}`
        ],
        source: 'manual event broadcast replay',
        statusRefs: [
          'voice_event_broadcast_request.v1',
          'voice_script_patch.v1',
          ...voiceEventBroadcastPanelState.requests.slice(0, 5).map((request) => request.request_id)
        ],
        missingStatus: [],
        mode: DEFAULT_STATUS_DIALOGUE_CONFIG.mode
      },
      {
        perspective: dialoguePerspective,
        config: DEFAULT_STATUS_DIALOGUE_CONFIG,
        statusSnapshot: statusSnapshotState.snapshot,
        fallbackSource: STATUS_DIALOGUE_LOCAL_FALLBACK_ADAPTER_ID
      }
    )
    const voiceProfile = audibleVoiceProfile
    const plan = buildVoiceResponsePlan({ output, sourceOutputId, voiceProfile })
    beginVoiceOutputSession(sourceOutputId)
    setVoiceEventBroadcastPanelState((current) =>
      buildVoiceEventBroadcastPanelState({
        requests: current.requests,
        patches: current.patches,
        queue: buildVoiceBroadcastQueueState({
          requests: current.requests,
          activeRequestId: current.requests[0]?.request_id,
          status: 'playing'
        }),
        source: `${current.source} / manual-replay`,
        lastTrace: current.last_trace,
        lastLatencyTrace: current.last_latency_trace,
        replayCount: current.replay_count,
        lastReplayAt: current.last_replay_at
      })
    )
    logStatusDialogueVoiceEvent('voice_event_broadcast_manual_replay_start', {
      source_output_id: sourceOutputId,
      request_ids: voiceEventBroadcastPanelState.requests.map((request) => request.request_id),
      patch_ids: patches.map((patch) => patch.patch_id)
    })
    const result = await playVoicePlanThroughQueue({
      plan,
      voiceProfile,
      sourceOutputId,
      kind: 'final',
      priority,
      bridgeEmotion,
      emotionHint
    })
    const replayedAt = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setVoiceEventBroadcastPanelState((current) =>
      buildVoiceEventBroadcastPanelState({
        requests: current.requests,
        patches: current.patches,
        queue: buildVoiceBroadcastQueueState({
          requests: current.requests,
          status: result.failed_count > 0 ? 'error' : 'complete',
          lastError: result.failed_count > 0 ? `${result.failed_count} replay chunk(s) failed` : undefined
        }),
        source: `${current.source} / manual-replay-complete`,
        lastTrace: result.trace,
        lastLatencyTrace: voiceLatencyTrace,
        lastError: result.failed_count > 0 ? `${result.failed_count} replay chunk(s) failed` : undefined,
        replayCount: current.replay_count + 1,
        lastReplayAt: replayedAt
      })
    )
    logStatusDialogueVoiceEvent('voice_event_broadcast_manual_replay_complete', {
      source_output_id: sourceOutputId,
      status: result.trace.status,
      failed_count: result.failed_count,
      chunks: result.chunks.length,
      total_tts_ms: result.total_tts_ms,
      total_playback_ms: result.total_playback_ms
    })
  }, [
    audibleVoiceProfile,
    beginVoiceOutputSession,
    dialoguePerspective,
    playVoicePlanThroughQueue,
    statusSnapshotState.snapshot,
    unlockVoicePlayback,
    voiceEventBroadcastPanelState.patches,
    voiceEventBroadcastPanelState.requests,
    voiceEventBroadcastPanelState.source,
    voiceLatencyTrace
  ])

  const runVadPrecheck = useCallback(async () => {
    const sessionId = createStatusDialogueMessageId()
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    const config = wakeConfig

    if (!config.vad_precheck.enabled) {
      const nextState = buildXiaozhiStyleVadPrecheckState({
        status: 'blocked',
        config,
        checkedMs: 0,
        voiceMs: 0,
        rmsLevel: 0,
        peakLevel: 0,
        reason: 'VAD precheck disabled by config'
      })
      setVadPrecheckState(nextState)
      return
    }

    if (config.wake_word.pause_while_tts_playing && (xiaozhiBridgeState.speaking_active || voiceLatency.stage === 'playing')) {
      const nextState = buildXiaozhiStyleVadPrecheckState({
        status: 'blocked',
        config,
        checkedMs: 0,
        voiceMs: 0,
        rmsLevel: 0,
        peakLevel: 0,
        reason: 'TTS playback gate is active; VAD precheck is paused'
      })
      setVadPrecheckState(nextState)
      publishXiaozhiBridgeEvent('abort', {
        sessionId,
        emotion: 'steady',
        source: 'virtual_desktop_panel',
        text: nextState.reason,
        refs: ['voice.wake_word_gate', 'voice.vad_precheck', 'tts_playback_gate']
      })
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      const nextState = buildXiaozhiStyleVadPrecheckState({
        status: 'error',
        config,
        checkedMs: 0,
        voiceMs: 0,
        rmsLevel: 0,
        peakLevel: 0,
        reason: 'navigator.mediaDevices.getUserMedia unavailable'
      })
      setVadPrecheckState(nextState)
      return
    }

    const AudioContextCtor = getBrowserAudioContextConstructor()
    if (!AudioContextCtor) {
      const nextState = buildXiaozhiStyleVadPrecheckState({
        status: 'error',
        config,
        checkedMs: 0,
        voiceMs: 0,
        rmsLevel: 0,
        peakLevel: 0,
        reason: 'AudioContext unavailable'
      })
      setVadPrecheckState(nextState)
      return
    }

    let stream: MediaStream | undefined
    let audioContext: AudioContext | undefined
    let source: MediaStreamAudioSourceNode | undefined
    let analyser: AnalyserNode | undefined
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()

    setVadPrecheckState(
      buildXiaozhiStyleVadPrecheckState({
        status: 'checking',
        config,
        checkedMs: 0,
        voiceMs: 0,
        rmsLevel: 0,
        peakLevel: 0,
        reason: 'checking microphone energy; dialogue chain is not triggered'
      })
    )
    publishXiaozhiBridgeEvent('listen_start', {
      sessionId,
      emotion: 'focused',
      source: 'virtual_desktop_panel',
      text: 'W2 VAD precheck',
      refs: ['voice.wake_word_gate', 'voice.vad_precheck']
    })

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      audioContext = new AudioContextCtor()
      source = audioContext.createMediaStreamSource(stream)
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)

      const samples = new Float32Array(analyser.fftSize)
      const sampleWindowMs = Math.max(40, config.vad_precheck.sample_window_ms)
      const precheckMs = Math.max(300, config.vad_precheck.precheck_ms)
      const threshold = config.vad_precheck.rms_threshold
      let peakLevel = 0
      let lastRms = 0
      let voiceMs = 0
      let lastTickAt = typeof performance !== 'undefined' ? performance.now() : Date.now()

      await new Promise<void>((resolve) => {
        const tick = () => {
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
          analyser?.getFloatTimeDomainData(samples)
          const rms = calculateAudioRms(samples)
          const deltaMs = Math.max(0, now - lastTickAt)
          lastTickAt = now
          lastRms = rms
          peakLevel = Math.max(peakLevel, rms)
          if (rms >= threshold) {
            voiceMs += deltaMs
          }
          if (now - startedAt >= precheckMs) {
            resolve()
            return
          }
          window.setTimeout(tick, sampleWindowMs)
        }
        tick()
      })

      const checkedMs = Math.max(0, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)
      const voiceDetected = voiceMs >= config.vad_precheck.min_voice_ms
      const reason = voiceDetected
        ? `voice-like energy detected for ${Math.round(voiceMs)}ms; no dialogue submitted`
        : `no enough voice-like energy; ${Math.round(voiceMs)}ms over threshold`
      const nextState = buildXiaozhiStyleVadPrecheckState({
        status: voiceDetected ? 'voice_detected' : 'silence',
        config,
        checkedMs,
        voiceMs,
        rmsLevel: lastRms,
        peakLevel,
        reason
      })
      setVadPrecheckState(nextState)
      publishXiaozhiBridgeEvent(voiceDetected ? 'listen_detect' : 'listen_stop', {
        sessionId,
        emotion: voiceDetected ? 'warm' : 'steady',
        source: 'virtual_desktop_panel',
        text: reason,
        latencyMs: Math.round(checkedMs),
        refs: ['voice.wake_word_gate', 'voice.vad_precheck', nextState.status]
      })
      setDialogueMessages((messages) => [
        ...messages.slice(-7),
        {
          id: createStatusDialogueMessageId(),
          role: 'system',
          text: voiceDetected ? '我检测到麦克风里有人声活动，但没有进入对话链路。' : '我完成了麦克风预检，这一段没有达到人声阈值。',
          timestamp,
          thoughts: [
            'W2 VAD precheck',
            `status: ${nextState.status}`,
            `peak: ${formatAudioLevel(nextState.peak_level)}`,
            'dialogue_triggered=false'
          ],
          source: 'vad precheck',
          statusRefs: ['voice.wake_word_gate', 'voice.vad_precheck']
        }
      ])
    } catch (error) {
      const message = formatMicrophonePermissionError(error)
      const checkedMs = Math.max(0, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)
      const nextState = buildXiaozhiStyleVadPrecheckState({
        status: 'error',
        config,
        checkedMs,
        voiceMs: 0,
        rmsLevel: 0,
        peakLevel: 0,
        reason: message
      })
      setVadPrecheckState(nextState)
      publishXiaozhiBridgeEvent('error', {
        sessionId,
        emotion: 'urgent',
        source: 'virtual_desktop_panel',
        error: message,
        latencyMs: Math.round(checkedMs),
        refs: ['voice.wake_word_gate', 'voice.vad_precheck', 'microphone_permission']
      })
      setDialogueMessages((messages) => [
        ...messages.slice(-7),
        {
          id: createStatusDialogueMessageId(),
          role: 'system',
          text: message,
          timestamp,
          thoughts: ['W2 VAD precheck failed', 'dialogue_triggered=false', 'fallback: manual STT remains available'],
          source: 'vad precheck',
          error: message,
          statusRefs: ['voice.wake_word_gate', 'navigator.mediaDevices.getUserMedia']
        }
      ])
    } finally {
      try {
        source?.disconnect()
      } catch {
        // Ignore WebAudio disconnect races after short VAD precheck.
      }
      stream?.getTracks().forEach((track) => track.stop())
      await audioContext?.close().catch(() => undefined)
    }
  }, [publishXiaozhiBridgeEvent, wakeConfig, voiceLatency.stage, xiaozhiBridgeState.speaking_active])

  const speakVoiceAck = useCallback(
    async (text: string, sourceOutputId: string, totalStartedAt?: number): Promise<boolean> => {
      if (!voiceEnabledRef.current || typeof window === 'undefined') return false
      if (voiceAudioRef.current) {
        voiceAudioRef.current.pause()
        voiceAudioRef.current = null
      }
      {
        const ackRequestId = `${sourceOutputId}:ack`
        const ackProfile = audibleVoiceProfile
        const ackOutput: StatusDialogueOutput = {
          reply: text,
          voiceText: text,
          thoughts: ['voice ack'],
          source: 'voice ack',
          statusRefs: ['voice_ack', 'voice.output_queue'],
          missingStatus: [],
          mode: DEFAULT_STATUS_DIALOGUE_CONFIG.mode
        }
        const plan = buildVoiceResponsePlan({ output: ackOutput, sourceOutputId: ackRequestId, voiceProfile: ackProfile })
        const ackPolicy = deriveVoiceEmotionPriority({ intent: 'casual_chat' })
        void playVoicePlanThroughQueue({
          plan,
          voiceProfile: ackProfile,
          sourceOutputId: ackRequestId,
          kind: 'ack',
          priority: ackPolicy.priority,
          bridgeEmotion: 'warm',
          emotionHint: ackPolicy.emotion_hint,
          totalStartedAt
        })
        return true
      }
    },
    [
      audibleVoiceProfile,
      patchVoiceLatency,
      prepareVoicePlaybackAudio,
      playVoicePlanThroughQueue,
      publishXiaozhiBridgeEvent,
      rememberVoicePlayback,
      selectedVoiceProfile,
      voiceOutputMode,
      voiceProfiles
    ]
  )

  const clearDelayedVoiceAckTimer = useCallback((reason: string, sourceOutputId?: string) => {
    if (delayedVoiceAckTimerRef.current === undefined) return
    window.clearTimeout(delayedVoiceAckTimerRef.current)
    delayedVoiceAckTimerRef.current = undefined
    logStatusDialogueVoiceEvent('status_dialogue_delayed_voice_ack_cancelled', {
      source_output_id: sourceOutputId,
      reason,
      delay_ms: STATUS_DIALOGUE_VOICE_ACK_DELAY_MS,
      boundary: 'visual ack remained; delayed spoken ack cancelled'
    })
  }, [])

  const scheduleDelayedVoiceAck = useCallback(
    (text: string, sourceOutputId: string, totalStartedAt?: number) => {
      clearDelayedVoiceAckTimer('replace_pending_ack', sourceOutputId)
      logStatusDialogueVoiceEvent('status_dialogue_visual_ack_shown', {
        source_output_id: sourceOutputId,
        delay_ms: STATUS_DIALOGUE_VOICE_ACK_DELAY_MS,
        boundary: 'default ack is visual; speech ack only if model response is late'
      })
      delayedVoiceAckTimerRef.current = window.setTimeout(() => {
        delayedVoiceAckTimerRef.current = undefined
        logStatusDialogueVoiceEvent('status_dialogue_delayed_voice_ack_fired', {
          source_output_id: sourceOutputId,
          delay_ms: STATUS_DIALOGUE_VOICE_ACK_DELAY_MS,
          boundary: 'model response exceeded ack threshold; one short spoken hint allowed'
        })
        void speakVoiceAck(text, sourceOutputId, totalStartedAt)
      }, STATUS_DIALOGUE_VOICE_ACK_DELAY_MS)
    },
    [clearDelayedVoiceAckTimer, speakVoiceAck]
  )

  const speakDialogue = useCallback(
    async (output: StatusDialogueOutput, sourceOutputId: string, totalStartedAt?: number) => {
      latestVoiceRequestRef.current = sourceOutputId
      {
        const budgetedVoiceAlready = output.statusRefs?.includes('voice.final_budgeted') === true
        const allPatches = (output as StatusDialogueModelResult).voiceScriptPatches ?? []
        const eventPatchCount = allPatches.filter((patch) => patch.play_mode !== 'silent').length
        const shouldUseFullVoice = voiceOutputMode === 'cosyvoice_full' && !budgetedVoiceAlready
        const speakablePatches = allPatches
        const rawEventBroadcastVoice = buildVoiceEventBroadcastSpeechText(speakablePatches)
        const outputVoiceSeed = compactVoiceWhitespace(output.voiceText || output.reply || '')
        const outputVoiceComparable = normalizeVoiceOverlapText(outputVoiceSeed)
        const eventVoiceComparable = normalizeVoiceOverlapText(rawEventBroadcastVoice)
        const eventBroadcastVoice =
          rawEventBroadcastVoice && (!budgetedVoiceAlready || !outputVoiceComparable.includes(eventVoiceComparable.slice(0, 16)))
            ? rawEventBroadcastVoice
            : ''
        const conciseFinalVoice = budgetedVoiceAlready
          ? outputVoiceSeed
          : buildStatusDialogueCoreVoiceSummary({
              output: eventPatchCount > 0 ? { ...output, voiceText: output.reply } : output,
              statusSnapshot: statusSnapshotState.snapshot,
              systemEventSnapshot: systemEventSnapshotState.snapshot
            })
        const budgetedFinalVoice = truncateVoiceLine(
          compactVoiceWhitespace(`${eventBroadcastVoice} ${conciseFinalVoice}`),
          STATUS_DIALOGUE_FINAL_VOICE_MAX_CHARS
        )
        const voiceOutput = shouldUseFullVoice ? output : { ...output, voiceText: budgetedFinalVoice || conciseFinalVoice }
        if (!shouldUseFullVoice) {
          logStatusDialogueVoiceEvent('tts_final_voice_budget_applied', {
            source_output_id: sourceOutputId,
            original_voice_length: (output.voiceText || output.reply || '').length,
            event_patch_count: eventPatchCount,
            event_voice_length: eventBroadcastVoice.length,
            concise_final_length: conciseFinalVoice.length,
            final_voice_length: (budgetedFinalVoice || conciseFinalVoice).length,
            boundary: 'display reply keeps full model output; event inserts and non-stream final voice use concise spoken budget'
          })
        }
        const voiceProfile = audibleVoiceProfile
        const plan = buildVoiceResponsePlan({ output: voiceOutput, sourceOutputId, voiceProfile })
        const bridgeEmotion = deriveXiaozhiStyleEmotion(output, statusSnapshotState.snapshot.global_status)
        const voicePolicy = deriveVoiceEmotionPriority({
          intent: output.error
            ? 'error'
            : statusSnapshotState.snapshot.global_status === 'blocked'
              ? 'patrol_blocked'
              : output.missingStatus?.length || statusSnapshotState.snapshot.global_status === 'warn'
                ? 'patrol_warn'
                : 'patrol_ok',
          hasError: Boolean(output.error),
          missingStatusCount: output.missingStatus?.length ?? 0,
          globalStatus: statusSnapshotState.snapshot.global_status
        })

        if (!plan.text) {
          publishXiaozhiBridgeEvent('error', {
            sessionId: sourceOutputId,
            emotion: 'steady',
            error: 'empty voice text',
            refs: ['xiaozhi_style_bridge.empty_voice', 'voice.output_queue']
          })
          setVoiceOutputTrace(
            buildVoiceOutputTrace({
              plan,
              voiceProfile,
              status: 'skipped',
              errorSummary: 'empty voice text'
            })
          )
          return
        }

        const voiceOutputEnabled = voiceEnabledRef.current
        if (!voiceOutputEnabled || typeof window === 'undefined') {
          publishXiaozhiBridgeEvent('abort', {
            sessionId: sourceOutputId,
            emotion: 'steady',
            text: 'voice output skipped',
            refs: ['xiaozhi_style_bridge.voice_output_disabled', 'voice.output_queue']
          })
          setVoiceOutputTrace(
            buildVoiceOutputTrace({
              plan,
              voiceProfile,
              status: 'skipped',
              errorSummary: voiceOutputEnabled ? 'window unavailable' : 'voice output disabled'
            })
          )
          return
        }

        const playback = playVoicePlanThroughQueue({
          plan,
          voiceProfile,
          sourceOutputId,
          kind: 'final',
          priority: voicePolicy.priority,
          bridgeEmotion,
          emotionHint: voicePolicy.emotion_hint,
          totalStartedAt
        })
        if (eventPatchCount > 0) {
          void playback.then((result) => {
            setVoiceEventBroadcastPanelState((current) =>
              buildVoiceEventBroadcastPanelState({
                requests: current.requests,
                patches: current.patches,
                queue: buildVoiceBroadcastQueueState({
                  requests: current.requests,
                  status: result.failed_count > 0 ? 'error' : 'complete',
                  lastError: result.failed_count > 0 ? `${result.failed_count} event broadcast chunk(s) failed` : undefined
                }),
                source: `${current.source} / auto-playback-complete`,
                lastTrace: result.trace,
                lastLatencyTrace: voiceLatencyTrace,
                lastError: result.failed_count > 0 ? `${result.failed_count} event broadcast chunk(s) failed` : undefined,
                replayCount: current.replay_count,
                lastReplayAt: current.last_replay_at
              })
            )
            logStatusDialogueVoiceEvent('voice_event_broadcast_auto_playback_complete', {
              source_output_id: sourceOutputId,
              status: result.trace.status,
              failed_count: result.failed_count,
              chunks: result.chunks.length,
              total_tts_ms: result.total_tts_ms,
              total_playback_ms: result.total_playback_ms
            })
          })
        }
        return
      }
    },
    [
      audibleVoiceProfile,
      patchVoiceLatency,
      prepareVoicePlaybackAudio,
      playVoicePlanThroughQueue,
      publishXiaozhiBridgeEvent,
      rememberVoicePlayback,
      selectedVoiceProfile,
      statusSnapshotState.snapshot,
      statusSnapshotState.snapshot.global_status,
      systemEventSnapshotState.snapshot,
      voiceLatencyTrace,
      voiceOutputMode,
      voiceProfiles
    ]
  )

  const runModelApiProbe = useCallback(async () => {
    if (realIntegrationState.modelBusy) return
    setRealIntegrationState((current) => ({ ...current, modelBusy: true, error: undefined }))
    const result = await requestStatusDialogueModelTest()
    setRealIntegrationState((current) => ({
      ...current,
      modelTest: result,
      modelBusy: false,
      error: result.success ? undefined : result.error
    }))
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setDialogueMessages((messages) => [
      ...messages.slice(-7),
      {
        id: createStatusDialogueMessageId(),
        role: 'system',
        text: result.success
          ? `我已完成真实 API 探针：${result.provider_label}/${result.model}，${result.latency_ms ?? 0}ms。`
          : `我还没有打通真实 API：${result.error ?? 'unknown error'}。`,
        timestamp,
        thoughts: [
          `phase1 api: ${result.status}`,
          `provider: ${result.provider_label}`,
          `host: ${result.base_url_host}`,
          'boundary: patrol_only'
        ],
        source: result.success ? 'real api probe' : 'api probe fallback',
        model: result.model,
        latencyMs: result.latency_ms,
        error: result.success ? undefined : result.error,
        statusRefs: result.output_refs,
        missingStatus: result.success ? [] : ['real_model_api_connection']
      }
    ])
  }, [realIntegrationState.modelBusy])

  const submitDialogue = useCallback(
    async (rawInput: string, inputKind: StatusDialogueInputKind = 'text') => {
      const totalStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const input = rawInput.trim()
      if (!input && inputKind === 'speech_transcript') return
      const currentVoiceQueueState = voicePlaybackQueueStateRef.current
      const currentVoiceLatencyStage = voiceLatencyRef.current.stage
      const formalInput = Boolean(input) && (inputKind === 'speech_transcript' || inputKind === 'text')
      const voicePlaybackActive = isVoicePlaybackActiveForInput({
        queueStatus: currentVoiceQueueState.status,
        voiceLatencyStage: currentVoiceLatencyStage,
        speakingActive: xiaozhiBridgeState.speaking_active
      })
      if (dialogueBusyRef.current && voicePlaybackActive && formalInput) {
        interruptVoicePlaybackForFormalInput(inputKind, 'dialogue_busy_tts_interrupted', input.length)
        enqueueDialogueInput(input, inputKind, 'dialogue_busy_tts_interrupted', {
          queuedDuringTts: true,
          voiceQueueStatus: currentVoiceQueueState.status
        })
        return
      }
      const latestVoiceQueueState = voicePlaybackQueueStateRef.current
      const latestVoicePlaybackActive = isVoicePlaybackActiveForInput({
        queueStatus: latestVoiceQueueState.status,
        voiceLatencyStage: voiceLatencyRef.current.stage,
        speakingActive: xiaozhiBridgeState.speaking_active
      })
      const canInterruptVoicePlayback = latestVoicePlaybackActive && !dialogueBusyRef.current && formalInput
      if (dialogueBusyRef.current || (latestVoicePlaybackActive && !canInterruptVoicePlayback)) {
        const queuedInput = input || (inputKind === 'text' ? 'status' : '')
        if (queuedInput) {
          enqueueDialogueInput(queuedInput, inputKind, latestVoicePlaybackActive ? 'tts_playback_active' : 'dialogue_busy')
        }
        return
      }
      dialogueBusyRef.current = true
      const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      const pendingId = createStatusDialogueMessageId()
      if (canInterruptVoicePlayback) {
        logStatusDialogueVoiceEvent('dialogue_input_barge_in', {
          input_kind: inputKind,
          reason: 'tts_playback_active',
          previous_voice_status: latestVoiceQueueState.status,
          previous_voice_stage: voiceLatencyRef.current.stage,
          echo_boundary: 'formal_input_allowed',
          text_length: input.length
        })
      }
      beginVoiceOutputSession(pendingId)
      updateDialogueExecutionState(
        'understanding',
        inputKind === 'speech_transcript' ? '已收到语音文本，正在理解意图' : '已收到文字输入，正在理解意图',
        pendingId
      )
      publishXiaozhiBridgeEvent('hello', {
        sessionId: pendingId,
        emotion: inputKind === 'speech_transcript' ? 'warm' : 'focused',
        text: input || 'status',
        refs: ['xiaozhi_style_bridge.virtual_desktop_device']
      })
      if (inputKind === 'speech_transcript') {
        publishXiaozhiBridgeEvent('stt_result', {
          sessionId: pendingId,
          emotion: 'warm',
          text: input,
          refs: ['xiaozhi_style_bridge.transcript_to_dialogue']
        })
      }
      setDialogueMessages((messages) => [
        ...messages.slice(-7),
        ...(input ? [{ id: createStatusDialogueMessageId(), role: 'user' as const, text: input, timestamp }] : []),
        {
          id: pendingId,
          role: 'system' as const,
          text: '我在看当前焦点。',
          timestamp,
          thoughts: [
            inputKind === 'speech_transcript' ? 'input: speech transcript' : 'input: text',
            'reading focus state',
            'refreshing status snapshot',
            'refreshing patrol index',
            'checking owner/gate'
          ],
          source: 'pending',
          pending: true
        }
      ])
      setDialogueInput('')
      setDialogueBusy(true)
      patchVoiceLatency({
        stage: 'model',
        ackMs: undefined,
        ...(inputKind === 'text' ? { sttMs: undefined } : {}),
        modelMs: undefined,
        ttsMs: undefined,
        playbackMs: undefined,
        totalMs: 0
      })
      try {
        updateDialogueExecutionState('patrolling', '正在读取状态卡、事件快照和巡检总索引', pendingId)
        const [nextSnapshotState, nextEventSnapshotState, nextPatrolIndexState, nextRuntimeVoiceDiagnosticState] = await Promise.all([
          requestStatusDialogueSnapshot(expectedStatusModules),
          requestStatusDialogueEvents(expectedStatusModules),
          requestStatusPatrolDialogueIndex(),
          requestStatusDialogueRuntimeVoiceDiagnostic()
        ])
        setStatusSnapshotState(nextSnapshotState)
        setSystemEventSnapshotState(nextEventSnapshotState)
        setStatusPatrolIndexState(nextPatrolIndexState)
        setRuntimeVoiceDiagnosticState(nextRuntimeVoiceDiagnosticState)
        setVoiceEventBroadcastPanelState(
          buildVoiceEventBroadcastPanelStateFromSnapshot({
            snapshot: nextEventSnapshotState.snapshot,
            source: `${nextEventSnapshotState.source} / pre-model`,
            currentDialogueState: 'llm'
          })
        )
        const modelStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
        publishXiaozhiBridgeEvent('llm_start', {
          sessionId: pendingId,
          emotion: 'focused',
          text: input || 'status',
          refs: ['xiaozhi_style_bridge.status_dialogue_model']
        })
        updateDialogueExecutionState('generating', '正在生成回复', pendingId)
        scheduleDelayedVoiceAck('我还在处理，马上给你结果。', pendingId, totalStartedAt)
        let streamedVoicePrefix = ''
        let result = await requestStatusDialogueModel({
          input: input || 'status',
          perspective: dialoguePerspective,
          focusTarget: focusedTarget,
          graphNodes,
          starCount,
          statusSnapshot: nextSnapshotState.snapshot,
          systemEventSnapshot: nextEventSnapshotState.snapshot,
          systemPatrolIndexSummary: nextPatrolIndexState.summary,
          runtimeVoiceDiagnostic: nextRuntimeVoiceDiagnosticState.diagnostic,
          conversationMemory,
          voiceBridgeState: xiaozhiBridgeState,
          streamSessionId: pendingId,
          onModelStreamActivity: (event) => {
            clearDelayedVoiceAckTimer(
              event.type === 'delta' ? 'model_stream_delta_received' : 'model_stream_voice_progress',
              pendingId
            )
          },
          onStreamingVoiceSentence: (sentence, event) => {
            const streamingSentence = truncateVoiceLine(sentence.trim(), STATUS_DIALOGUE_STREAMING_VOICE_MAX_CHARS)
            if (!streamingSentence) return
            clearDelayedVoiceAckTimer('model_stream_sentence_ready', pendingId)
            if (event.sentenceIndex > STATUS_DIALOGUE_STREAMING_VOICE_MAX_SENTENCES) {
              logStatusDialogueVoiceEvent('tts_stream_sentence_skipped_by_voice_budget', {
                source_output_id: pendingId,
                sentence_index: event.sentenceIndex,
                max_streaming_sentences: STATUS_DIALOGUE_STREAMING_VOICE_MAX_SENTENCES,
                text_length: sentence.trim().length,
                boundary: 'display reply keeps full model output; voiceText keeps low-latency spoken budget'
              })
              return
            }
            streamedVoicePrefix = event.spokenPrefix || compactVoiceWhitespace(`${streamedVoicePrefix} ${streamingSentence}`)
            const streamVoiceProfile = audibleVoiceProfile
            const streamPolicy = deriveVoiceEmotionPriority({
              intent:
                nextSnapshotState.snapshot.global_status === 'blocked'
                  ? 'patrol_blocked'
                  : nextSnapshotState.snapshot.global_status === 'warn'
                    ? 'patrol_warn'
                    : 'patrol_ok',
              globalStatus: nextSnapshotState.snapshot.global_status
            })
            const streamOutput: StatusDialogueOutput = {
              reply: streamingSentence,
              voiceText: streamingSentence,
              thoughts: [`model stream sentence ${event.sentenceIndex}`],
              source: 'model stream sentence',
              statusRefs: ['voice_response_text_stream.v1', 'status_dialogue_model_stream_event.v1'],
              missingStatus: [],
              mode: DEFAULT_STATUS_DIALOGUE_CONFIG.mode
            }
            const streamSourceOutputId = `${pendingId}:stream-sentence-${event.sentenceIndex}`
            const streamPlan = buildVoiceResponsePlan({
              output: streamOutput,
              sourceOutputId: streamSourceOutputId,
              voiceProfile: streamVoiceProfile
            })
            publishXiaozhiBridgeEvent('llm_emotion', {
              sessionId: pendingId,
              emotion: deriveXiaozhiStyleEmotion(streamOutput, nextSnapshotState.snapshot.global_status),
              text: streamingSentence,
              refs: ['voice_response_text_stream.sentence_ready']
            })
            void playVoicePlanThroughQueue({
              plan: streamPlan,
              voiceProfile: streamVoiceProfile,
              sourceOutputId: streamSourceOutputId,
              kind: 'final',
              priority: streamPolicy.priority,
              bridgeEmotion: deriveXiaozhiStyleEmotion(streamOutput, nextSnapshotState.snapshot.global_status),
              emotionHint: streamPolicy.emotion_hint,
              totalStartedAt
            })
          }
        })
        const combinedVoiceScriptPatches = mergeVoiceScriptPatchesById(
          unspokenPatrolEventsRef.current,
          result.voiceScriptPatches ?? []
        )
        const previewEventBroadcastVoice = buildVoiceEventBroadcastSpeechText(combinedVoiceScriptPatches)
        const spokenEventPatchCount = previewEventBroadcastVoice
          ? Math.min(STATUS_DIALOGUE_EVENT_BROADCAST_VOICE_MAX_PATCHES, combinedVoiceScriptPatches.length)
          : 0
        const nextUnspokenPatrolEvents = selectUnspokenPatrolEventsAfterSpeech(
          combinedVoiceScriptPatches,
          spokenEventPatchCount
        )
        unspokenPatrolEventsRef.current = nextUnspokenPatrolEvents
        result = {
          ...result,
          voiceScriptPatches: combinedVoiceScriptPatches,
          unspokenPatrolEvents: nextUnspokenPatrolEvents.map((patch) => patch.voice_text).filter(Boolean),
          statusRefs: Array.from(
            new Set([
              ...(result.statusRefs ?? []),
              ...(combinedVoiceScriptPatches.length > 0 ? ['unspoken_patrol_events.v1'] : []),
              ...combinedVoiceScriptPatches.map((patch) => patch.patch_id)
            ])
          ).slice(0, 14)
        }
        logStatusDialogueVoiceEvent('unspoken_patrol_events_updated', {
          source_output_id: pendingId,
          carried_count: unspokenPatrolEventsRef.current.length,
          combined_patch_count: combinedVoiceScriptPatches.length,
          spoken_patch_count: spokenEventPatchCount,
          next_unspoken_count: nextUnspokenPatrolEvents.length,
          patch_ids: combinedVoiceScriptPatches.map((patch) => patch.patch_id)
        })
        clearDelayedVoiceAckTimer('model_result_received', pendingId)
        setVoiceEventBroadcastPanelState((current) =>
          buildVoiceEventBroadcastPanelState({
            requests: result.eventBroadcastRequests ?? [],
            patches: result.voiceScriptPatches ?? [],
            queue:
              result.voiceBroadcastQueue ??
              buildVoiceBroadcastQueueState({ requests: result.eventBroadcastRequests ?? [] }),
            source: `${result.source ?? 'dialogue result'} / model-output`,
            replayCount: current.replay_count,
            lastReplayAt: current.last_replay_at,
            lastTrace: current.last_trace,
            lastLatencyTrace: current.last_latency_trace
          })
        )
        if ((result.eventBroadcastRequests?.length ?? 0) > 0 || (result.voiceScriptPatches?.length ?? 0) > 0) {
          logStatusDialogueVoiceEvent('voice_event_broadcast_queue_compiled', {
            request_ids: (result.eventBroadcastRequests ?? []).map((request) => request.request_id),
            patch_ids: (result.voiceScriptPatches ?? []).map((patch) => patch.patch_id),
            queue: result.voiceBroadcastQueue ?? null
          })
        }
        const modelEndedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
        publishXiaozhiBridgeEvent('llm_emotion', {
          sessionId: pendingId,
          emotion: deriveXiaozhiStyleEmotion(result, nextSnapshotState.snapshot.global_status),
          text: result.voiceText || result.reply,
          latencyMs: Math.max(0, Math.round(modelEndedAt - modelStartedAt)),
          refs: ['xiaozhi_style_bridge.visible_emotion', ...(result.statusRefs ?? []).slice(0, 3)]
        })
        patchVoiceLatency({
          stage: 'tts_generating',
          modelMs: Math.max(0, Math.round(modelEndedAt - modelStartedAt)),
          totalMs: Math.max(0, Math.round(modelEndedAt - totalStartedAt))
        })
        const nextConversationMemory = updateStatusDialogueConversationMemory({
          previous: conversationMemory,
          userQuery: input || 'status',
          focus: {
            title: getGraphFocusTitle(focusedTarget),
            status: getGraphFocusStatus(focusedTarget),
            gate: getGraphFocusGate(focusedTarget),
            compass: getGraphFocusCompass(focusedTarget)
          },
          output: result,
          status: {
            cards_fresh: nextSnapshotState.snapshot.cards_fresh,
            cards_stale: nextSnapshotState.snapshot.cards_stale,
            cards_missing: nextSnapshotState.snapshot.cards_missing,
            global_status: nextSnapshotState.snapshot.global_status
          }
        })
        setConversationMemory(nextConversationMemory)
        writeStatusDialogueConversationMemory(nextConversationMemory)
        const nextTimestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
        setDialogueMessages((messages) =>
          messages.map((message) =>
            message.id === pendingId
              ? {
                  id: pendingId,
                  role: 'system' as const,
                  text: result.reply,
                  timestamp: nextTimestamp,
                  thoughts: result.thoughts,
                  source: result.source,
                  model: result.model,
                  latencyMs: result.latencyMs,
                  error: result.error,
                  statusRefs: result.statusRefs,
                  missingStatus: result.missingStatus
                }
              : message
          )
        )
        if (streamedVoicePrefix) {
          const shortestVoicePath = buildShortestNecessaryPostStreamVoice({
            eventBroadcastVoice: buildVoiceEventBroadcastSpeechText(result.voiceScriptPatches ?? []),
            finalVoice: compactVoiceWhitespace(result.voiceText || result.reply || buildStatusDialogueShortFinalVoice(result)),
            streamedVoicePrefix,
            maxChars: STATUS_DIALOGUE_FINAL_VOICE_MAX_CHARS
          })
          const finalVoice = shortestVoicePath.text
          logStatusDialogueVoiceEvent('tts_shortest_voice_path_selected', {
            source_output_id: pendingId,
            streamed_prefix_length: streamedVoicePrefix.length,
            event_voice_used: shortestVoicePath.event_voice_used,
            final_voice_used: shortestVoicePath.final_voice_used,
            final_voice_redundant: shortestVoicePath.final_voice_redundant,
            remaining_voice_length: shortestVoicePath.remaining_voice.length,
            final_voice_length: finalVoice.length,
            reason: shortestVoicePath.reason,
            boundary:
              'streamed sentence, event inserts, and final voice are deduped into the shortest necessary spoken path'
          })
          if (finalVoice) {
            speakDialogue(
              {
                ...result,
                voiceText: finalVoice,
                statusRefs: Array.from(new Set([...(result.statusRefs ?? []), 'voice.final_budgeted']))
              },
              pendingId,
              totalStartedAt
            )
          } else {
            logStatusDialogueVoiceEvent('tts_final_voice_skipped_after_stream', {
              source_output_id: pendingId,
              streamed_prefix_length: streamedVoicePrefix.length,
              remaining_voice_length: shortestVoicePath.remaining_voice.length,
              reason: shortestVoicePath.reason
            })
          }
        } else {
          speakDialogue(result, pendingId, totalStartedAt)
        }
      } catch (error) {
        clearDelayedVoiceAckTimer('model_error', pendingId)
        const message = error instanceof Error ? error.message : String(error)
        publishXiaozhiBridgeEvent('error', {
          sessionId: pendingId,
          emotion: 'urgent',
          error: message,
          refs: ['xiaozhi_style_bridge.dialogue_model_error']
        })
        patchVoiceLatency({ stage: 'error', totalMs: Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - totalStartedAt)) })
        updateDialogueExecutionState('error', '对话链路出错，已退回本地状态说明', pendingId)
        setDialogueMessages((messages) =>
          messages.map((item) =>
            item.id === pendingId
              ? {
                  id: pendingId,
                  role: 'system' as const,
                  text: '我这里先退回本地状态检查。',
                  timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
                  thoughts: ['model call failed', 'fallback boundary preserved', 'status-only mode kept'],
                  source: 'local fallback',
                  error: message
                }
              : item
          )
        )
      } finally {
        clearDelayedVoiceAckTimer('dialogue_turn_finished', pendingId)
        dialogueBusyRef.current = false
        setDialogueBusy(false)
        const latestVoiceQueueState = voicePlaybackQueueStateRef.current
        const voicePlaybackStillActive = isVoicePlaybackActiveForInput({
          queueStatus: latestVoiceQueueState.status,
          voiceLatencyStage: voiceLatencyRef.current.stage,
          speakingActive: xiaozhiBridgeState.speaking_active
        })
        if (!voicePlaybackStillActive) {
          const nextQueuedInput = takeNextDialogueInput()
          if (nextQueuedInput) {
            window.setTimeout(() => {
              void submitDialogue(nextQueuedInput.text, nextQueuedInput.input_kind)
            }, 0)
          }
        }
      }
    },
    [
      clearDelayedVoiceAckTimer,
      dialoguePerspective,
      audibleVoiceProfile,
      beginVoiceOutputSession,
      enqueueDialogueInput,
      expectedStatusModules,
      focusedTarget,
      graphNodes,
      conversationMemory,
      interruptVoicePlaybackForFormalInput,
      patchVoiceLatency,
      playVoicePlanThroughQueue,
      publishXiaozhiBridgeEvent,
      scheduleDelayedVoiceAck,
      speakDialogue,
      starCount,
      takeNextDialogueInput,
      updateDialogueExecutionState,
      voiceLatency.stage,
      xiaozhiBridgeState,
      xiaozhiBridgeState.speaking_active
    ]
  )

  useEffect(() => {
    if (runtimeProbeMode !== 'tts_input_interrupt') return
    if (ttsInputInterruptProbeStartedRef.current) return
    ttsInputInterruptProbeStartedRef.current = true

    const probeSessionId = `status-dialogue-tts-input-interrupt-probe-${Date.now()}`
    logStatusDialogueVoiceEvent('status_dialogue_tts_input_interrupt_probe_start', {
      runtime_probe: runtimeProbeMode,
      session_id: probeSessionId,
      boundary: 'controlled renderer probe; no world write; no requirement packet'
    })
    beginVoiceOutputSession(probeSessionId)
    updateVoicePlaybackQueue({
      status: 'playing',
      active_chunk_id: 'tts-input-interrupt-probe-chunk',
      queued_count: 1
    })
    patchVoiceLatency({
      stage: 'playing',
      playbackMs: 1,
      playbackFirstMs: 1,
      playbackTotalMs: 1
    })
    dialogueBusyRef.current = true
    setDialogueBusy(true)

    window.setTimeout(() => {
      void submitDialogue('runtime probe: formal input during tts playback', 'text')
      window.setTimeout(() => {
        dialogueBusyRef.current = false
        setDialogueBusy(false)
        logStatusDialogueVoiceEvent('status_dialogue_tts_input_interrupt_probe_submitted', {
          runtime_probe: runtimeProbeMode,
          session_id: probeSessionId,
          boundary: 'controlled renderer probe complete'
        })
      }, 80)
    }, 80)
  }, [beginVoiceOutputSession, patchVoiceLatency, runtimeProbeMode, submitDialogue, updateVoicePlaybackQueue])

  useEffect(() => {
    if (runtimeProbeMode !== 'edge_tts_playback') return
    if (!voiceEnabled) setVoiceOutputEnabled(true)
    if (voiceOutputMode !== 'edge_readaloud_stream') setVoiceOutputMode('edge_readaloud_stream')
  }, [runtimeProbeMode, setVoiceOutputEnabled, voiceEnabled, voiceOutputMode])

  useEffect(() => {
    if (runtimeProbeMode !== 'edge_tts_playback') return
    if (edgeTtsPlaybackProbeStartedRef.current) return
    if (!voiceEnabled || voiceOutputMode !== 'edge_readaloud_stream') return
    edgeTtsPlaybackProbeStartedRef.current = true

    const probeSessionId = `status-dialogue-edge-tts-playback-probe-${Date.now()}`
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    logStatusDialogueVoiceEvent('status_dialogue_edge_tts_playback_probe_start', {
      runtime_probe: runtimeProbeMode,
      session_id: probeSessionId,
      voice_mode: voiceOutputMode,
      voice_profile_id: audibleVoiceProfile.profile_id,
      boundary: 'controlled real GUI probe; Edge Read Aloud stream only; no world write; no requirement packet'
    })
    unlockVoicePlayback()
    beginVoiceOutputSession(probeSessionId)
    const probeOutput: StatusDialogueOutput = {
      reply: 'Edge low-latency TTS playback probe.',
      voiceText: '我正在验证低延迟语音输出。',
      thoughts: ['edge tts playback runtime probe'],
      source: 'edge tts playback probe',
      statusRefs: ['voice.edge_readaloud_stream', 'voice_playback_queue.v1'],
      missingStatus: [],
      mode: DEFAULT_STATUS_DIALOGUE_CONFIG.mode
    }
    const probePlan = buildVoiceResponsePlan({
      output: probeOutput,
      sourceOutputId: probeSessionId,
      voiceProfile: audibleVoiceProfile
    })
    void playVoicePlanThroughQueue({
      plan: probePlan,
      voiceProfile: audibleVoiceProfile,
      sourceOutputId: probeSessionId,
      kind: 'final',
      priority: 'normal',
      bridgeEmotion: 'focused',
      emotionHint: 'focused',
      totalStartedAt: startedAt
    })
      .then((result) => {
        const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
        logStatusDialogueVoiceEvent('status_dialogue_edge_tts_playback_probe_complete', {
          runtime_probe: runtimeProbeMode,
          session_id: probeSessionId,
          success: result.failed_count === 0 && result.chunks.length > 0,
          chunks: result.chunks.length,
          failed_count: result.failed_count,
          cached_count: result.cached_count,
          total_tts_ms: result.total_tts_ms,
          total_playback_ms: result.total_playback_ms,
          latency_ms: Math.max(0, Math.round(endedAt - startedAt)),
          boundary: 'controlled probe complete; audio was routed through the normal playback queue'
        })
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        logStatusDialogueVoiceEvent('status_dialogue_edge_tts_playback_probe_complete', {
          runtime_probe: runtimeProbeMode,
          session_id: probeSessionId,
          success: false,
          error: message,
          latency_ms: Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)),
          boundary: 'controlled probe failed'
        })
      })
  }, [
    audibleVoiceProfile,
    beginVoiceOutputSession,
    playVoicePlanThroughQueue,
    runtimeProbeMode,
    unlockVoicePlayback,
    voiceEnabled,
    voiceOutputMode
  ])

  const handleDialogueSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      unlockVoicePlayback()
      void submitDialogue(dialogueInput, 'text')
    },
    [dialogueInput, submitDialogue, unlockVoicePlayback]
  )

  const drainNextQueuedDialogueInput = useCallback(
    (
      trigger: 'tts_complete' | 'queue_terminal' | 'watchdog',
      details: {
        voiceStatus?: VoicePlaybackQueueState['status']
        voiceStage?: StatusDialogueVoiceLatencyState['stage']
        staleMs?: number
        activeSession?: string
      } = {}
    ): boolean => {
      if (dialogueBusyRef.current) return false
      const nextQueuedInput = takeNextDialogueInput()
      if (!nextQueuedInput) return false
      const eventName =
        trigger === 'tts_complete' ? 'dialogue_input_dequeued_after_tts_complete' : 'dialogue_input_dequeued_after_queue_release'
      logStatusDialogueVoiceEvent(eventName, {
        input_kind: nextQueuedInput.input_kind,
        reason: nextQueuedInput.reason,
        priority: nextQueuedInput.priority,
        echo_boundary: nextQueuedInput.echo_boundary,
        queued_during_tts: nextQueuedInput.queued_during_tts,
        trigger,
        voice_status: details.voiceStatus,
        voice_stage: details.voiceStage,
        stale_ms: details.staleMs,
        active_session: details.activeSession,
        age_ms: Math.max(0, Date.now() - nextQueuedInput.created_at_ms)
      })
      window.setTimeout(() => {
        void submitDialogue(nextQueuedInput.text, nextQueuedInput.input_kind)
      }, 0)
      return true
    },
    [submitDialogue, takeNextDialogueInput]
  )

  useEffect(() => {
    if (dialogueBusy || dialogueBusyRef.current) return
    if (pendingDialogueInputQueueRef.current.length === 0) return
    if (!isVoicePlaybackTerminalForInputQueue(voicePlaybackQueueState.status)) return
    const timer = window.setTimeout(() => {
      if (dialogueBusyRef.current) return
      drainNextQueuedDialogueInput(voicePlaybackQueueState.status === 'complete' ? 'tts_complete' : 'queue_terminal', {
        voiceStatus: voicePlaybackQueueState.status,
        voiceStage: voiceLatencyRef.current.stage,
        activeSession: activeVoiceSessionRef.current
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [dialogueBusy, drainNextQueuedDialogueInput, voicePlaybackQueueState.status, voicePlaybackQueueState.updated_at])

  useEffect(() => {
    if (dialogueBusy || dialogueBusyRef.current) return
    if (pendingDialogueInputQueueRef.current.length === 0) return
    if (isVoicePlaybackTerminalForInputQueue(voicePlaybackQueueState.status)) return
    const timer = window.setTimeout(() => {
      if (dialogueBusyRef.current) return
      if (pendingDialogueInputQueueRef.current.length === 0) return
      const latestVoiceQueueState = voicePlaybackQueueStateRef.current
      const staleMs = Math.max(0, Date.now() - voicePlaybackQueueUpdatedAtMsRef.current)
      const latestVoicePlaybackActive = isVoicePlaybackActiveForInput({
        queueStatus: latestVoiceQueueState.status,
        voiceLatencyStage: voiceLatencyRef.current.stage,
        speakingActive: xiaozhiBridgeState.speaking_active
      })
      if (
        !isVoicePlaybackTerminalForInputQueue(latestVoiceQueueState.status) &&
        latestVoicePlaybackActive &&
        staleMs < STATUS_DIALOGUE_INPUT_QUEUE_DRAIN_WATCHDOG_MS
      ) {
        return
      }
      logStatusDialogueVoiceEvent('dialogue_input_queue_drain_watchdog', {
        queue_count: pendingDialogueInputQueueRef.current.length,
        voice_status: latestVoiceQueueState.status,
        voice_stage: voiceLatencyRef.current.stage,
        stale_ms: staleMs,
        active_session: activeVoiceSessionRef.current,
        boundary: 'queued input release guard; no world write; no requirement packet'
      })
      if (!isVoicePlaybackTerminalForInputQueue(latestVoiceQueueState.status)) {
        updateVoicePlaybackQueue({
          status: 'complete',
          active_chunk_id: undefined,
          last_error: 'queue drain watchdog released stale voice state'
        })
        patchVoiceLatency({
          stage: 'idle',
          playbackMs: undefined,
          playbackFirstMs: undefined,
          playbackTotalMs: undefined
        })
      }
      drainNextQueuedDialogueInput('watchdog', {
        voiceStatus: latestVoiceQueueState.status,
        voiceStage: voiceLatencyRef.current.stage,
        staleMs,
        activeSession: activeVoiceSessionRef.current
      })
    }, STATUS_DIALOGUE_INPUT_QUEUE_DRAIN_WATCHDOG_MS)
    return () => window.clearTimeout(timer)
  }, [
    dialogueBusy,
    drainNextQueuedDialogueInput,
    patchVoiceLatency,
    updateVoicePlaybackQueue,
    voicePlaybackQueueState.status,
    voicePlaybackQueueState.updated_at,
    xiaozhiBridgeState.speaking_active
  ])

  const stopSpeechRecognition = useCallback(() => {
    if (chromeSttSessionRef.current && typeof window.electron?.invoke === 'function') {
      const sessionId = chromeSttSessionRef.current
      chromeSttSessionRef.current = null
      void window.electron.invoke('zhineng:status-dialogue:chrome-stt:cancel', { session_id: sessionId })
      publishXiaozhiBridgeEvent('abort', {
        sessionId,
        emotion: 'steady',
        text: 'speech input stopped',
        refs: ['xiaozhi_style_bridge.operator_abort', 'chrome_stt_bridge']
      })
      setVoiceListening(false)
      return
    }
    if (localSpeechRecorderRef.current) {
      localSpeechRecorderRef.current.stop()
      return
    }
    if (speechRecognitionSubmitTimerRef.current !== undefined) {
      window.clearTimeout(speechRecognitionSubmitTimerRef.current)
      speechRecognitionSubmitTimerRef.current = undefined
    }
    const recognition = speechRecognitionRef.current
    if (!recognition) {
      setVoiceListening(false)
      return
    }
    try {
      recognition.stop()
    } catch {
      recognition.abort()
    }
    setVoiceListening(false)
  }, [publishXiaozhiBridgeEvent])

  const startLocalSpeechTranscription = useCallback(async (options: {
    transcriptionAdapterId?: 'local_whisper_persistent_service' | 'openai_compatible_stt'
  } = {}): Promise<boolean> => {
    if (!window.electron?.invoke) return false
    if (!navigator.mediaDevices?.getUserMedia) return false
    const AudioContextCtor = getBrowserAudioContextConstructor()
    if (!AudioContextCtor) return false
    const transcriptionAdapterId = options.transcriptionAdapterId ?? 'local_whisper_persistent_service'

    let stream: MediaStream | undefined
    let audioContext: AudioContext | undefined
    let source: MediaStreamAudioSourceNode | undefined
    let processor: ScriptProcessorNode | undefined
    let timeoutId: number | undefined
    let stopped = false
    const chunks: Float32Array[] = []
    let recordedMs = 0
    let voiceMs = 0
    let lowSignalMs = 0
    let silenceAfterVoiceMs = 0
    let voiceDetected = false
    let voiceDetectedLogged = false
    let lowSignalDetected = false
    let lowSignalDetectedLogged = false
    let continuousNoVoiceFastFailLogged = false
    let peakRms = 0
    let peakLevel = 0
    let firstVoiceAtMs: number | undefined
    let lastVoiceAtMs: number | undefined
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    const sessionId = createStatusDialogueMessageId()

    try {
      logStatusDialogueVoiceEvent('local_stt_recording_start_request', {
        session_id: sessionId,
        adapter_id: 'local_whisper_persistent_service',
        model: selectedSttModel,
        selected_adapter: selectedSttAdapter,
        transcription_adapter_id: transcriptionAdapterId,
        max_window_ms: STATUS_DIALOGUE_LOCAL_STT_MAX_WINDOW_MS,
        rms_threshold: STATUS_DIALOGUE_LOCAL_STT_RMS_THRESHOLD,
        peak_threshold: STATUS_DIALOGUE_LOCAL_STT_PEAK_THRESHOLD,
        min_voice_ms: STATUS_DIALOGUE_LOCAL_STT_MIN_VOICE_MS,
        low_signal_rms_threshold: STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_RMS_THRESHOLD,
        low_signal_peak_threshold: STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_PEAK_THRESHOLD,
        low_signal_min_ms: STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_MIN_MS,
        low_signal_transcribe_ms: STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_TRANSCRIBE_MS,
        silence_tail_ms: STATUS_DIALOGUE_LOCAL_STT_SILENCE_TAIL_MS,
        continuous_no_voice_fast_fail_ms: STATUS_DIALOGUE_LOCAL_STT_CONTINUOUS_NO_VOICE_FAST_FAIL_MS,
        audio_persistence: 'transient_wav_only'
      })
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const audioTrack = stream.getAudioTracks()[0]
      const audioTrackSettings = audioTrack?.getSettings?.()
      setLocalSttRuntimeState((current) => ({ ...current, busy: true, error: undefined }))
      updateDialogueExecutionState(
        'listening',
        transcriptionAdapterId === 'openai_compatible_stt' ? '正在听取麦克风，随后调用 Cloudflare STT' : '正在听取麦克风',
        sessionId
      )
      logStatusDialogueVoiceEvent('local_stt_recording_started', {
        session_id: sessionId,
        adapter_id: 'local_whisper_persistent_service',
        model: selectedSttModel,
        track_count: stream.getAudioTracks().length,
        track_label: audioTrack?.label,
        device_id: audioTrackSettings?.deviceId,
        channel_count: audioTrackSettings?.channelCount,
        sample_rate: audioTrackSettings?.sampleRate,
        echo_cancellation: audioTrackSettings?.echoCancellation,
        noise_suppression: audioTrackSettings?.noiseSuppression,
        audio_persistence: 'transient_wav_only'
      })
      publishXiaozhiBridgeEvent('hello', {
        sessionId,
        emotion: 'focused',
        text: 'local whisper session',
        refs: ['xiaozhi_style_bridge.virtual_desktop_device', 'local_whisper_persistent_service']
      })
      publishXiaozhiBridgeEvent('listen_start', {
        sessionId,
        emotion: 'focused',
        text: 'listening through local whisper',
        refs: ['xiaozhi_style_bridge.listen_start', 'local_whisper_persistent_service']
      })
      audioContext = new AudioContextCtor()
      source = audioContext.createMediaStreamSource(stream)
      processor = audioContext.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (event) => {
        const channel = event.inputBuffer.getChannelData(0)
        const frame = new Float32Array(channel)
        chunks.push(frame)
        const frameRms = calculateAudioRms(frame)
        const framePeak = calculateAudioPeak(frame)
        const frameMs = audioContext ? (frame.length / audioContext.sampleRate) * 1000 : 0
        recordedMs += frameMs
        peakRms = Math.max(peakRms, frameRms)
        peakLevel = Math.max(peakLevel, framePeak)
        const voiceLikeFrame =
          frameRms >= STATUS_DIALOGUE_LOCAL_STT_RMS_THRESHOLD ||
          framePeak >= STATUS_DIALOGUE_LOCAL_STT_PEAK_THRESHOLD
        const lowSignalFrame =
          frameRms >= STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_RMS_THRESHOLD &&
          framePeak >= STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_PEAK_THRESHOLD
        if (lowSignalFrame) {
          lowSignalMs += frameMs
          if (!lowSignalDetected && lowSignalMs >= STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_MIN_MS) {
            lowSignalDetected = true
          }
          if (lowSignalDetected && !voiceDetected && !lowSignalDetectedLogged) {
            lowSignalDetectedLogged = true
            logStatusDialogueVoiceEvent('local_stt_low_signal_candidate', {
              session_id: sessionId,
              adapter_id: 'local_whisper_persistent_service',
              model: selectedSttModel,
              recorded_ms: Math.round(recordedMs),
              low_signal_ms: Math.round(lowSignalMs),
              rms: Number(frameRms.toFixed(6)),
              peak: Number(framePeak.toFixed(6)),
              low_signal_rms_threshold: STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_RMS_THRESHOLD,
              low_signal_peak_threshold: STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_PEAK_THRESHOLD,
              boundary: 'low-level microphone energy will be passed to Whisper instead of being discarded by the strict VAD gate'
            })
          }
        }
        if (voiceLikeFrame) {
          voiceMs += frameMs
          silenceAfterVoiceMs = 0
          firstVoiceAtMs ??= recordedMs
          lastVoiceAtMs = recordedMs
          if (!voiceDetected && voiceMs >= STATUS_DIALOGUE_LOCAL_STT_MIN_VOICE_MS) {
            voiceDetected = true
          }
          if (voiceDetected && !voiceDetectedLogged) {
            voiceDetectedLogged = true
            logStatusDialogueVoiceEvent('local_stt_voice_detected', {
              session_id: sessionId,
              adapter_id: 'local_whisper_persistent_service',
              model: selectedSttModel,
              recorded_ms: Math.round(recordedMs),
              voice_ms: Math.round(voiceMs),
              rms: Number(frameRms.toFixed(6)),
              peak: Number(framePeak.toFixed(6)),
              rms_threshold: STATUS_DIALOGUE_LOCAL_STT_RMS_THRESHOLD,
              peak_threshold: STATUS_DIALOGUE_LOCAL_STT_PEAK_THRESHOLD
            })
          }
        } else if (voiceDetected) {
          silenceAfterVoiceMs += frameMs
        }
        if (
          voiceDetected &&
          recordedMs >= STATUS_DIALOGUE_LOCAL_STT_MIN_AUDIO_MS &&
          silenceAfterVoiceMs >= STATUS_DIALOGUE_LOCAL_STT_SILENCE_TAIL_MS
        ) {
          window.setTimeout(() => {
            void stopAndTranscribe()
          }, 0)
        } else if (
          !voiceDetected &&
          lowSignalDetected &&
          recordedMs >= STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_TRANSCRIBE_MS
        ) {
          window.setTimeout(() => {
            void stopAndTranscribe()
          }, 0)
        } else if (
          continuousVoiceSessionEnabledRef.current &&
          !voiceDetected &&
          !lowSignalDetected &&
          recordedMs >= STATUS_DIALOGUE_LOCAL_STT_CONTINUOUS_NO_VOICE_FAST_FAIL_MS
        ) {
          if (!continuousNoVoiceFastFailLogged) {
            continuousNoVoiceFastFailLogged = true
            logStatusDialogueVoiceEvent('local_stt_continuous_no_voice_fast_fail', {
              session_id: sessionId,
              adapter_id: 'local_whisper_persistent_service',
              model: selectedSttModel,
              recorded_ms: Math.round(recordedMs),
              peak_rms: Number(peakRms.toFixed(6)),
              peak_level: Number(peakLevel.toFixed(6)),
              rms_threshold: STATUS_DIALOGUE_LOCAL_STT_RMS_THRESHOLD,
              peak_threshold: STATUS_DIALOGUE_LOCAL_STT_PEAK_THRESHOLD,
              fast_fail_ms: STATUS_DIALOGUE_LOCAL_STT_CONTINUOUS_NO_VOICE_FAST_FAIL_MS,
              boundary: 'continuous listening treats no voice as idle silence instead of waiting for max recording window'
            })
          }
          window.setTimeout(() => {
            void stopAndTranscribe()
          }, 0)
        }
      }
      source.connect(processor)
      processor.connect(audioContext.destination)

      const stopAndTranscribe = async () => {
        if (stopped) return
        stopped = true
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId)
          timeoutId = undefined
        }
        localSpeechRecorderRef.current = null
        setVoiceListening(false)
        setLocalSttRuntimeState((current) => ({ ...current, busy: false }))
        try {
          processor?.disconnect()
          source?.disconnect()
        } catch {
          // Ignore disconnect races during manual stop.
        }
        stream?.getTracks().forEach((track) => track.stop())
        await audioContext?.close().catch(() => undefined)

        const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0)
        const mergedRecording = mergeAudioChunks(chunks)
        const audioRms = calculateAudioRms(mergedRecording)
        const audioPeak = calculateAudioPeak(mergedRecording)
        const nonSilentRatio = calculateNonSilentRatio(mergedRecording)
        const lowSignalCandidate =
          !voiceDetected &&
          recordedMs >= STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_MIN_AUDIO_MS &&
          lowSignalMs >= STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_MIN_MS &&
          audioRms >= STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_RMS_THRESHOLD &&
          audioPeak >= STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_PEAK_THRESHOLD
        const borderlineCandidate =
          !voiceDetected &&
          !lowSignalCandidate &&
          recordedMs >= STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_MIN_AUDIO_MS &&
          audioRms >= STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_RMS_THRESHOLD &&
          audioPeak >= STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_PEAK_THRESHOLD
        const vadGate = voiceDetected
          ? 'voice_detected'
          : lowSignalCandidate
            ? 'low_signal_candidate'
            : borderlineCandidate
              ? 'borderline_candidate'
              : 'silence'
        logStatusDialogueVoiceEvent('local_stt_recording_stopped', {
          session_id: sessionId,
          adapter_id: 'local_whisper_persistent_service',
          model: selectedSttModel,
          sample_count: sampleCount,
          chunk_count: chunks.length,
          sample_rate: audioContext?.sampleRate,
          audio_rms: Number(audioRms.toFixed(6)),
          audio_peak: Number(audioPeak.toFixed(6)),
          audio_dbfs: calculateAudioDbfs(audioRms),
          non_silent_ratio: Number(nonSilentRatio.toFixed(4)),
          voice_detected: voiceDetected,
          low_signal_candidate: lowSignalCandidate,
          borderline_candidate: borderlineCandidate,
          voice_ms: Math.round(voiceMs),
          low_signal_ms: Math.round(lowSignalMs),
          recorded_ms: Math.round(recordedMs),
          silence_after_voice_ms: Math.round(silenceAfterVoiceMs),
          peak_rms: Number(peakRms.toFixed(6)),
          peak_level: Number(peakLevel.toFixed(6)),
          first_voice_at_ms: firstVoiceAtMs !== undefined ? Math.round(firstVoiceAtMs) : undefined,
          last_voice_at_ms: lastVoiceAtMs !== undefined ? Math.round(lastVoiceAtMs) : undefined,
          rms_threshold: STATUS_DIALOGUE_LOCAL_STT_RMS_THRESHOLD,
          peak_threshold: STATUS_DIALOGUE_LOCAL_STT_PEAK_THRESHOLD,
          low_signal_rms_threshold: STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_RMS_THRESHOLD,
          low_signal_peak_threshold: STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_PEAK_THRESHOLD,
          low_signal_min_ms: STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_MIN_MS,
          borderline_rms_threshold: STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_RMS_THRESHOLD,
          borderline_peak_threshold: STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_PEAK_THRESHOLD,
          borderline_min_audio_ms: STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_MIN_AUDIO_MS,
          vad_gate: vadGate,
          continuous_no_voice_fast_fail_ms: STATUS_DIALOGUE_LOCAL_STT_CONTINUOUS_NO_VOICE_FAST_FAIL_MS,
          continuous_session_enabled: continuousVoiceSessionEnabledRef.current,
          audio_persistence: 'transient_wav_only'
        })
        if (sampleCount < audioContext!.sampleRate * 0.35) {
          const message = '我没有收到足够的语音片段，请再说一遍。'
          patchVoiceLatency({ stage: 'error' })
          setLocalSttRuntimeState((current) => ({ ...current, busy: false, error: message }))
          publishXiaozhiBridgeEvent('error', {
            sessionId,
            emotion: 'urgent',
            error: message,
            refs: ['xiaozhi_style_bridge.local_audio_too_short', 'local_whisper_persistent_service']
          })
          continuousVoiceRecoverableErrorRef.current = 'local_audio_too_short'
          setVoiceError(message)
          setDialogueMessages((messages) => [
            ...messages.slice(-7),
            {
              id: createStatusDialogueMessageId(),
              role: 'system',
              text: message,
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
              thoughts: ['local stt recorder stopped too early', 'fallback: text_input'],
              source: 'speech input fallback',
              statusRefs: ['speech_input.local_whisper_persistent_service']
            }
          ])
          return
        }

        if ((!voiceDetected || voiceMs < STATUS_DIALOGUE_LOCAL_STT_MIN_VOICE_MS) && !lowSignalCandidate && !borderlineCandidate) {
          const message = '我没有检测到足够的人声，请靠近麦克风后再说一遍。'
          logStatusDialogueVoiceEvent('local_stt_silence_detected', {
            session_id: sessionId,
            adapter_id: 'local_whisper_persistent_service',
            model: selectedSttModel,
            sample_count: sampleCount,
            audio_rms: Number(audioRms.toFixed(6)),
            audio_peak: Number(audioPeak.toFixed(6)),
            audio_dbfs: calculateAudioDbfs(audioRms),
            non_silent_ratio: Number(nonSilentRatio.toFixed(4)),
            voice_ms: Math.round(voiceMs),
            low_signal_ms: Math.round(lowSignalMs),
            recorded_ms: Math.round(recordedMs),
            rms_threshold: STATUS_DIALOGUE_LOCAL_STT_RMS_THRESHOLD,
            peak_threshold: STATUS_DIALOGUE_LOCAL_STT_PEAK_THRESHOLD,
            low_signal_rms_threshold: STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_RMS_THRESHOLD,
            low_signal_peak_threshold: STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_PEAK_THRESHOLD,
            borderline_rms_threshold: STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_RMS_THRESHOLD,
            borderline_peak_threshold: STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_PEAK_THRESHOLD,
            fallback_reason: 'no_audible_speech',
            continuous_idle_silence: continuousVoiceSessionEnabledRef.current
          })
          patchVoiceLatency({ stage: 'error' })
          setLocalSttRuntimeState((current) => ({ ...current, busy: false, error: message }))
          publishXiaozhiBridgeEvent('error', {
            sessionId,
            emotion: 'steady',
            error: message,
            refs: ['xiaozhi_style_bridge.local_stt_silence', 'local_whisper_persistent_service']
          })
          setVoiceTranscript('NO AUDIBLE SPEECH')
          continuousVoiceRecoverableErrorRef.current = 'no_audible_speech'
          setVoiceError(message)
          if (continuousVoiceSessionEnabledRef.current) {
            return
          }
          setDialogueMessages((messages) => [
            ...messages.slice(-7),
            {
              id: createStatusDialogueMessageId(),
              role: 'system',
              text: message,
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
              thoughts: [
                'local stt vad gate: no_audible_speech',
                `voice_ms: ${Math.round(voiceMs)}`,
                `peak: ${Number(audioPeak.toFixed(6))}`,
                'whisper_call_skipped=true'
              ],
              source: 'speech input fallback',
              error: message,
              statusRefs: ['speech_input.local_whisper_persistent_service', 'voice.vad_precheck']
            }
          ])
          return
        }

        setVoiceTranscript('本地转写中...')
        setDialogueMessages((messages) => [
          ...messages.slice(-7),
          {
            id: createStatusDialogueMessageId(),
            role: 'system',
            text: '我已收到语音，正在本地转成文字。',
            timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
            thoughts: ['stt adapter: local_whisper_persistent_service', `vad gate: ${vadGate}`, 'audio: transient wav', 'boundary: no audio persistence'],
            source: 'speech input'
          }
        ])

        if (lowSignalCandidate) {
          logStatusDialogueVoiceEvent('local_stt_low_signal_transcribe_allowed', {
            session_id: sessionId,
            adapter_id: 'local_whisper_persistent_service',
            model: selectedSttModel,
            recorded_ms: Math.round(recordedMs),
            low_signal_ms: Math.round(lowSignalMs),
            audio_rms: Number(audioRms.toFixed(6)),
            audio_peak: Number(audioPeak.toFixed(6)),
            audio_dbfs: calculateAudioDbfs(audioRms),
            vad_gate: vadGate,
            boundary: 'low-level speech candidate is sent to Whisper; empty or failed transcript will still be rejected downstream'
          })
        }
        if (borderlineCandidate) {
          logStatusDialogueVoiceEvent('local_stt_borderline_transcribe_allowed', {
            session_id: sessionId,
            adapter_id: 'local_whisper_persistent_service',
            model: selectedSttModel,
            recorded_ms: Math.round(recordedMs),
            audio_rms: Number(audioRms.toFixed(6)),
            audio_peak: Number(audioPeak.toFixed(6)),
            audio_dbfs: calculateAudioDbfs(audioRms),
            vad_gate: vadGate,
            borderline_rms_threshold: STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_RMS_THRESHOLD,
            borderline_peak_threshold: STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_PEAK_THRESHOLD,
            boundary: 'borderline microphone energy is sent to Whisper to reduce frontend VAD false negatives; empty or failed transcript is still rejected downstream'
          })
        }

        try {
          const audioDataUrl = encodeWavDataUrl(chunks, audioContext!.sampleRate, 16000)
          patchVoiceLatency({ stage: 'stt_transcribing', sttMs: undefined, modelMs: undefined, ttsMs: undefined, playbackMs: undefined })
          updateDialogueExecutionState(
            'transcribing',
            transcriptionAdapterId === 'openai_compatible_stt' ? '正在调用 Cloudflare STT' : '正在调用本地 Whisper STT',
            sessionId
          )
          logStatusDialogueVoiceEvent('local_stt_transcribe_request', {
            session_id: sessionId,
            adapter_id: 'local_whisper_persistent_service',
            model: selectedSttModel,
            language: 'zh',
            sample_count: sampleCount,
            vad_gate: vadGate,
            low_signal_candidate: lowSignalCandidate,
            borderline_candidate: borderlineCandidate,
            transcription_adapter_id: transcriptionAdapterId,
            audio_persistence: 'transient_wav_only'
          })
          const result = (await window.electron!.invoke('zhineng:status-dialogue:stt:transcribe', {
            audio_data_url: audioDataUrl,
            mime_type: 'audio/wav',
            language: 'zh',
            model: selectedSttModel,
            adapter_id: transcriptionAdapterId
          })) as StatusDialogueSttTranscriptionResult
          const transcript = result.transcript?.trim() ?? ''
          const localAdapterRef = result.adapter_id ?? 'local_whisper_ipc'
          logStatusDialogueVoiceEvent('local_stt_transcribe_result', {
            session_id: sessionId,
            success: result.success,
            adapter_id: localAdapterRef,
            model: result.model ?? selectedSttModel,
            language: result.language,
            latency_ms: result.latency_ms,
            transcript_length: transcript.length,
            error: result.error,
            fallback_reason: result.fallback_reason
          })
          setLocalSttRuntimeState((current) => {
            const usedPersistentService = result.adapter_id === 'local_whisper_persistent_service'
            const nextHealth: StatusDialogueLocalSttHealthResult = {
              ...current.health,
              generated_at: result.generated_at,
              adapter_id: 'local_whisper_persistent_service',
              configured: true,
              reachable: usedPersistentService ? true : current.health.reachable,
              status: usedPersistentService && result.success ? 'ready' : result.success ? 'fallback' : current.health.status === 'ready' ? 'fallback' : current.health.status,
              model: result.model ?? selectedSttModel,
              latency_ms: result.latency_ms ?? current.health.latency_ms,
              error: result.success ? current.health.error : result.error ?? result.fallback_reason
            }
            return {
              ...current,
              health: nextHealth,
              busy: false,
              lastResult: result,
              error: result.success ? undefined : result.error ?? result.fallback_reason
            }
          })
          if (result.success && transcript) {
            continuousVoiceRecoverableErrorRef.current = undefined
            continuousVoiceRecoverableErrorCountRef.current = 0
            if (runtimeProbeMode === 'continuous_voice_two_turn') {
              const nextProbeTurn = continuousVoiceTwoTurnProbeSuccessCountRef.current + 1
              continuousVoiceTwoTurnProbeSuccessCountRef.current = nextProbeTurn
              logStatusDialogueVoiceEvent('status_dialogue_continuous_voice_two_turn_probe_turn', {
                runtime_probe: runtimeProbeMode,
                turn: nextProbeTurn,
                session_id: sessionId,
                adapter_id: localAdapterRef,
                transcript_length: transcript.length,
                latency_ms: result.latency_ms,
                boundary: 'controlled probe turn used the existing formal STT and dialogue submission path'
              })
              if (nextProbeTurn >= 2) {
                if (continuousVoiceResumeTimerRef.current !== undefined) {
                  window.clearTimeout(continuousVoiceResumeTimerRef.current)
                  continuousVoiceResumeTimerRef.current = undefined
                }
                continuousVoiceResumeInFlightRef.current = false
                continuousVoiceSessionEnabledRef.current = false
                setContinuousVoiceSession((current) => ({
                  ...current,
                  enabled: false,
                  status: 'off',
                  last_reason: 'controlled_two_turn_probe_complete',
                  next_resume_at: undefined
                }))
                logStatusDialogueVoiceEvent('status_dialogue_continuous_voice_two_turn_probe_complete', {
                  runtime_probe: runtimeProbeMode,
                  success: true,
                  turns: nextProbeTurn,
                  selected_stt_adapter: selectedSttAdapterRef.current,
                  boundary: 'controlled two-turn probe complete; no world write; no requirement packet'
                })
              }
            }
            publishXiaozhiBridgeEvent('stt_result', {
              sessionId,
              emotion: 'warm',
              text: transcript,
              latencyMs: result.latency_ms,
              refs: ['xiaozhi_style_bridge.local_stt_result', localAdapterRef]
            })
            patchVoiceLatency({ stage: 'model', sttMs: result.latency_ms })
            setVoiceInputEnabled(true)
            setVoiceOutputEnabled(true)
            setVoiceTranscript(transcript)
            setVoiceError(undefined)
            setDialogueInput(transcript)
            void submitDialogue(transcript, 'speech_transcript')
            return
          }
          const message = `本地语音转写失败：${result.error ?? result.fallback_reason ?? 'unknown'}`
          patchVoiceLatency({ stage: 'error', sttMs: result.latency_ms })
          publishXiaozhiBridgeEvent('error', {
            sessionId,
            emotion: 'urgent',
            error: message,
            latencyMs: result.latency_ms,
            refs: ['xiaozhi_style_bridge.local_stt_error', localAdapterRef]
          })
          setVoiceError(message)
          setDialogueMessages((messages) => [
            ...messages.slice(-7),
            {
              id: createStatusDialogueMessageId(),
              role: 'system',
              text: message,
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
              thoughts: [
                'stt adapter error',
                `adapter: ${result.adapter_id}`,
                `model: ${result.model ?? selectedSttModel}`,
                'fallback: text_input'
              ],
              source: 'speech input fallback',
              error: message,
              statusRefs: ['speech_input.local_whisper_persistent_service', 'speech_input.local_whisper_ipc']
            }
          ])
        } catch (error) {
          const message = `本地语音转写失败：${error instanceof Error ? error.message : String(error)}`
          setLocalSttRuntimeState((current) => ({
            ...current,
            busy: false,
            error: message,
            health: {
              ...current.health,
              status: current.health.status === 'ready' ? 'fallback' : current.health.status,
              error: message
            }
          }))
          patchVoiceLatency({ stage: 'error' })
          publishXiaozhiBridgeEvent('error', {
            sessionId,
            emotion: 'urgent',
            error: message,
            refs: ['xiaozhi_style_bridge.local_stt_exception', 'local_whisper_persistent_service']
          })
          setVoiceError(message)
          setDialogueMessages((messages) => [
            ...messages.slice(-7),
            {
              id: createStatusDialogueMessageId(),
              role: 'system',
              text: message,
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
              thoughts: ['local stt ipc failed', 'fallback: text_input'],
              source: 'speech input fallback',
              error: message,
              statusRefs: ['zhineng:status-dialogue:stt:transcribe']
            }
          ])
        }
      }

      const cancelRecording = () => {
        if (stopped) return
        stopped = true
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId)
          timeoutId = undefined
        }
        localSpeechRecorderRef.current = null
        setVoiceListening(false)
        try {
          processor?.disconnect()
          source?.disconnect()
        } catch {
          // Ignore disconnect races during window teardown.
        }
        stream?.getTracks().forEach((track) => track.stop())
        void audioContext?.close().catch(() => undefined)
      }

      localSpeechRecorderRef.current = { stop: () => void stopAndTranscribe(), cancel: cancelRecording }
      setVoiceInputEnabled(true)
      setVoiceOutputEnabled(true)
      setVoiceListening(true)
      setVoiceTranscript('MIC RECORDING')
      setVoiceError(undefined)
      publishXiaozhiBridgeEvent('listen_detect', {
        sessionId,
        emotion: 'focused',
        text: 'local microphone recording',
        refs: ['xiaozhi_style_bridge.local_recording', 'local_whisper_persistent_service']
      })
      patchVoiceLatency({
        stage: 'stt_recording',
        ackMs: undefined,
        sttMs: undefined,
        modelMs: undefined,
        ttsMs: undefined,
        playbackMs: undefined,
        totalMs: undefined
      })
      setDialogueMessages((messages) => [
        ...messages.slice(-7),
        {
          id: createStatusDialogueMessageId(),
          role: 'system',
          text: '我正在听，停顿后会用本地 Whisper 转成文字。',
          timestamp,
            thoughts: [
              'stt adapter: local_whisper_persistent_service',
              'recording transient pcm',
              `max window: ${Math.round(STATUS_DIALOGUE_LOCAL_STT_MAX_WINDOW_MS / 1000)}s`,
              'vad gate: enabled'
            ],
            source: 'speech input'
          }
        ])
      timeoutId = window.setTimeout(() => {
        void stopAndTranscribe()
      }, STATUS_DIALOGUE_LOCAL_STT_MAX_WINDOW_MS)
      return true
    } catch (error) {
      const message = formatMicrophonePermissionError(error)
      logStatusDialogueVoiceEvent('local_stt_recording_failed', {
        session_id: sessionId,
        adapter_id: 'local_whisper_persistent_service',
        model: selectedSttModel,
        error: message
      })
      patchVoiceLatency({ stage: 'error' })
      publishXiaozhiBridgeEvent('error', {
        sessionId,
        emotion: 'urgent',
        error: message,
        refs: ['xiaozhi_style_bridge.local_microphone_error', 'local_whisper_persistent_service']
      })
      localSpeechRecorderRef.current = null
      setLocalSttRuntimeState((current) => ({ ...current, busy: false, error: message }))
      setVoiceInputEnabled(false)
      setVoiceListening(false)
      setVoiceError(message)
      stream?.getTracks().forEach((track) => track.stop())
      await audioContext?.close().catch(() => undefined)
      setDialogueMessages((messages) => [
        ...messages.slice(-7),
        {
          id: createStatusDialogueMessageId(),
          role: 'system',
          text: message,
          timestamp,
          thoughts: ['local microphone capture failed', 'fallback: text_input'],
          source: 'speech input fallback',
          error: message,
          statusRefs: ['navigator.mediaDevices.getUserMedia']
        }
      ])
      return true
    }
  }, [
    patchVoiceLatency,
    publishXiaozhiBridgeEvent,
    runtimeProbeMode,
    selectedSttAdapter,
    selectedSttModel,
    setVoiceOutputEnabled,
    submitDialogue,
    updateDialogueExecutionState
  ])

  const startChromeSpeechBridgeTranscription = useCallback(async (options: {
    retry?: boolean
    runtimeProbe?: StatusDialogueRuntimeProbeMode
    submitTranscript?: boolean
    language?: string
    timeoutMs?: number
  } = {}): Promise<boolean> => {
    if (typeof window.electron?.invoke !== 'function') return false
    const sessionId = createStatusDialogueMessageId()
    const retryCount = options.retry ? cloudSttHealth.retry_count + 1 : cloudSttHealth.retry_count
    const timeoutMs = Math.max(
      STATUS_DIALOGUE_CLOUD_STT_MIN_TIMEOUT_MS,
      Math.min(STATUS_DIALOGUE_CLOUD_STT_MAX_TIMEOUT_MS, Math.round(options.timeoutMs ?? STATUS_DIALOGUE_CLOUD_STT_DEFAULT_TIMEOUT_MS))
    )
    chromeSttSessionRef.current = sessionId
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setCloudSttHealth({
      ...buildCloudSttListeningHealthState(sessionId, retryCount),
      last_retry_at: options.retry ? timestamp : cloudSttHealth.last_retry_at
    })
    publishXiaozhiBridgeEvent('hello', {
      sessionId,
      emotion: 'focused',
      text: 'chrome stt bridge session',
      refs: ['xiaozhi_style_bridge.virtual_desktop_device', 'chrome_stt_bridge']
    })
    publishXiaozhiBridgeEvent('listen_start', {
      sessionId,
      emotion: 'focused',
      text: 'listening through chrome stt bridge',
      refs: ['xiaozhi_style_bridge.listen_start', 'chrome_stt_bridge']
    })
    setVoiceInputEnabled(true)
    setVoiceOutputEnabled(true)
    setVoiceListening(true)
    setVoiceTranscript('CHROME STT READY')
    setVoiceError(undefined)
    updateDialogueExecutionState('listening', '正在听取麦克风，随后调用 Chrome STT Bridge', sessionId)
    setDialogueMessages((messages) => [
      ...messages.slice(-7),
      {
        id: createStatusDialogueMessageId(),
        role: 'system',
        text: '我正在调用 Chrome STT Bridge 进行语音识别。',
        timestamp,
        thoughts: [
          'stt adapter: chrome_stt_bridge',
          'provider: chrome_web_speech',
          `latency_budget_ms: ${timeoutMs}`,
          'floating window unchanged'
        ],
        source: 'speech input'
      }
    ])

    try {
      patchVoiceLatency({ stage: 'stt_transcribing', sttMs: undefined, modelMs: undefined, ttsMs: undefined, playbackMs: undefined })
      updateDialogueExecutionState('transcribing', '正在调用 Chrome STT Bridge', sessionId)
      const result = (await window.electron.invoke('zhineng:status-dialogue:chrome-stt:transcribe', {
        session_id: sessionId,
        language: options.language || 'zh-CN',
        timeout_ms: timeoutMs,
        visible: false,
        runtime_probe: options.runtimeProbe
      })) as StatusDialogueChromeSttResult
      if (chromeSttSessionRef.current === sessionId) {
        chromeSttSessionRef.current = null
      }
      setVoiceListening(false)
      const transcript = result.transcript?.trim() ?? ''
      if (result.success && transcript) {
        clearCloudSttDegradedCooldown()
        setCloudSttHealth(buildCloudSttSuccessHealthState(result, retryCount))
        publishXiaozhiBridgeEvent('stt_result', {
          sessionId,
          emotion: 'warm',
          text: transcript,
          latencyMs: result.latency_ms,
          refs: ['xiaozhi_style_bridge.cloud_stt_result', 'chrome_stt_bridge']
        })
        patchVoiceLatency({ stage: 'model', sttMs: result.latency_ms })
        setVoiceTranscript(transcript)
        setVoiceError(undefined)
        setDialogueInput(transcript)
        if (options.submitTranscript !== false) {
          void submitDialogue(transcript, 'speech_transcript')
        }
        return true
      }
      patchVoiceLatency({ stage: 'error', sttMs: result.latency_ms })
      const initialFailureHealth = buildCloudSttFailureHealthState(result, retryCount)
      const failureHealth = shouldOpenCloudSttCircuit(initialFailureHealth)
        ? buildCloudSttDegradedHealthState(initialFailureHealth)
        : initialFailureHealth
      setCloudSttHealth(failureHealth)
      const resultReason = result.error ?? result.fallback_reason ?? 'unknown'
      const eventTrace = result.events?.length ? ` events: ${result.events.join(' / ')}` : ''
      logStatusDialogueVoiceEvent('cloud_stt_failure_classified', {
        session_id: result.session_id,
        category: failureHealth.last_category,
        recovery_action: failureHealth.recovery_action,
        retry_available: failureHealth.retry_available,
        retry_count: failureHealth.retry_count,
        latency_ms: result.latency_ms,
        timeout_ms: timeoutMs,
        events: result.events ?? [],
        runtime_probe: options.runtimeProbe
      })
      if (failureHealth.status === 'degraded') {
        persistCloudSttDegradedCooldown(failureHealth)
        if (selectedSttAdapter !== 'local') {
          selectSttAdapter('local', 'cloud_stt_degraded_fallback_local')
        }
        logStatusDialogueVoiceEvent('cloud_stt_degraded_to_local', {
          session_id: result.session_id,
          category: failureHealth.last_category,
          retry_count: failureHealth.retry_count,
          selected_stt_adapter: selectedSttAdapter,
          fallback_adapter: failureHealth.fallback_adapter,
          recovery_action: failureHealth.recovery_action,
          reason: failureHealth.degraded_reason,
          timeout_ms: timeoutMs,
          runtime_probe: options.runtimeProbe,
          boundary: 'cloud STT circuit open; local Whisper remains available; no transcript submitted'
        })
      }
      publishXiaozhiBridgeEvent('error', {
        sessionId,
        emotion: 'urgent',
        error: `${resultReason}${eventTrace}`,
        latencyMs: result.latency_ms,
        refs: ['xiaozhi_style_bridge.cloud_stt_error', 'chrome_stt_bridge']
      })
      const chromeFallbackMessage =
        resultReason === 'no-speech' || result.fallback_reason === 'no_speech'
          ? `云端 STT 已打开麦克风，但没有检测到可识别语音。请在状态显示“LISTENING - 请现在说话”后再说，或检查 Windows 默认麦克风输入音量。${eventTrace}`
          : `云端 STT 没有返回有效文字：${resultReason}。请重试，或在设置中切到本地 STT。${eventTrace}`
      if (resultReason === 'no-speech' || result.fallback_reason === 'no_speech') {
        continuousVoiceRecoverableErrorRef.current = 'cloud_no_speech'
      }
      setVoiceError(chromeFallbackMessage)
      setVoiceTranscript(resultReason === 'no-speech' || result.fallback_reason === 'no_speech' ? 'NO SPEECH DETECTED' : 'CLOUD STT EMPTY')
      setDialogueMessages((messages) => [
        ...messages.slice(-7),
        {
          id: createStatusDialogueMessageId(),
          role: 'system',
          text: chromeFallbackMessage,
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          thoughts: [
            'stt adapter: cloud_chrome_stt_bridge',
            `adapter: ${result.adapter_id}`,
            `error: ${resultReason}`,
            `category: ${failureHealth.last_category}`,
            `recovery: ${failureHealth.recovery_action}`,
            `timeout_ms: ${timeoutMs}`,
            `retry: ${failureHealth.retry_available ? 'available' : 'not_available'}`,
            failureHealth.status === 'degraded' ? 'cloud circuit: open -> local_whisper_persistent_service' : 'cloud circuit: retry window',
            eventTrace ? eventTrace : 'events: none',
            'fallback: manual local mode'
          ],
          source: 'speech input fallback',
          statusRefs: ['speech_input.chrome_stt_bridge']
        }
      ])
      return false
    } catch (error) {
      const cloudSttIpcErrorMessage = error instanceof Error ? error.message : String(error)
      const initialFailureHealth = buildCloudSttFailureHealthState(
        {
          session_id: sessionId,
          success: false,
          error: cloudSttIpcErrorMessage,
          fallback_reason: 'bridge_failed',
          events: ['ipc_error']
        },
        retryCount,
        error
      )
      const failureHealth = shouldOpenCloudSttCircuit(initialFailureHealth)
        ? buildCloudSttDegradedHealthState(initialFailureHealth, 'cloud STT bridge failed; local Whisper remains primary')
        : initialFailureHealth
      setCloudSttHealth(failureHealth)
      logStatusDialogueVoiceEvent('cloud_stt_failure_classified', {
        session_id: sessionId,
        category: failureHealth.last_category,
        recovery_action: failureHealth.recovery_action,
        retry_available: failureHealth.retry_available,
        retry_count: failureHealth.retry_count,
        error: failureHealth.last_reason,
        timeout_ms: timeoutMs,
        runtime_probe: options.runtimeProbe
      })
      if (failureHealth.status === 'degraded') {
        persistCloudSttDegradedCooldown(failureHealth)
        if (selectedSttAdapter !== 'local') {
          selectSttAdapter('local', 'cloud_stt_bridge_degraded_fallback_local')
        }
        logStatusDialogueVoiceEvent('cloud_stt_degraded_to_local', {
          session_id: sessionId,
          category: failureHealth.last_category,
          retry_count: failureHealth.retry_count,
          selected_stt_adapter: selectedSttAdapter,
          fallback_adapter: failureHealth.fallback_adapter,
          recovery_action: failureHealth.recovery_action,
          reason: failureHealth.degraded_reason,
          timeout_ms: timeoutMs,
          runtime_probe: options.runtimeProbe,
          boundary: 'cloud STT circuit open after bridge failure; local Whisper remains available'
        })
      }
      if (chromeSttSessionRef.current === sessionId) {
        chromeSttSessionRef.current = null
      }
      setVoiceListening(false)
      const message = `Chrome STT Bridge 调用失败：${error instanceof Error ? error.message : String(error)}`
      patchVoiceLatency({ stage: 'error' })
      setVoiceError(message)
      setVoiceTranscript('CLOUD STT ERROR')
      setDialogueMessages((messages) => [
        ...messages.slice(-7),
        {
          id: createStatusDialogueMessageId(),
          role: 'system',
          text: message,
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          thoughts: ['chrome stt bridge ipc failed', 'fallback: manual local mode'],
          source: 'speech input fallback',
          statusRefs: ['zhineng:status-dialogue:chrome-stt:transcribe']
        }
      ])
      return false
    }
  }, [
    cloudSttHealth.last_retry_at,
    cloudSttHealth.retry_count,
    patchVoiceLatency,
    publishXiaozhiBridgeEvent,
    selectSttAdapter,
    selectedSttAdapter,
    setVoiceOutputEnabled,
    submitDialogue,
    updateDialogueExecutionState
  ])

  useEffect(() => {
    if (runtimeProbeMode !== 'cloud_stt_fake_audio') return
    if (cloudSttFakeAudioProbeStartedRef.current) return
    cloudSttFakeAudioProbeStartedRef.current = true
    const probeStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const maxAttempts = Math.max(1, Math.min(3, runtimeProbeConfig.cloudSttMaxAttempts))
    logStatusDialogueVoiceEvent('status_dialogue_cloud_stt_fake_audio_probe_start', {
      runtime_probe: runtimeProbeMode,
      language: runtimeProbeConfig.cloudSttLanguage,
      max_attempts: maxAttempts,
      timeout_ms: runtimeProbeConfig.cloudSttTimeoutMs,
      test_audio: runtimeProbeConfig.cloudSttTestAudio,
      boundary: 'controlled real Electron GUI probe; fake audio is injected by Chrome media flags; no world write'
    })
    const runProbe = async (): Promise<{ success: boolean; attemptCount: number }> => {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const attemptStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
        logStatusDialogueVoiceEvent('status_dialogue_cloud_stt_fake_audio_probe_attempt_start', {
          runtime_probe: runtimeProbeMode,
          attempt,
          max_attempts: maxAttempts,
          language: runtimeProbeConfig.cloudSttLanguage,
          test_audio: runtimeProbeConfig.cloudSttTestAudio
        })
        const success = await startChromeSpeechBridgeTranscription({
          retry: attempt > 1,
          runtimeProbe: runtimeProbeMode,
          submitTranscript: false,
          language: runtimeProbeConfig.cloudSttLanguage,
          timeoutMs: runtimeProbeConfig.cloudSttTimeoutMs
        })
        logStatusDialogueVoiceEvent('status_dialogue_cloud_stt_fake_audio_probe_attempt_complete', {
          runtime_probe: runtimeProbeMode,
          attempt,
          max_attempts: maxAttempts,
          success,
          timeout_ms: runtimeProbeConfig.cloudSttTimeoutMs,
          latency_ms: Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - attemptStartedAt))
        })
        if (success) return { success: true, attemptCount: attempt }
        if (attempt < maxAttempts) {
          await new Promise((resolve) => window.setTimeout(resolve, 900))
        }
      }
      return { success: false, attemptCount: maxAttempts }
    }
    void runProbe().then((result) => {
      const elapsedMs = Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - probeStartedAt))
      logStatusDialogueVoiceEvent('status_dialogue_cloud_stt_fake_audio_probe_complete', {
        runtime_probe: runtimeProbeMode,
        success: result.success,
        attempt_count: result.attemptCount,
        max_attempts: maxAttempts,
        language: runtimeProbeConfig.cloudSttLanguage,
        timeout_ms: runtimeProbeConfig.cloudSttTimeoutMs,
        test_audio: runtimeProbeConfig.cloudSttTestAudio,
        latency_ms: elapsedMs,
        boundary: 'controlled probe complete; transcript is not auto-submitted to dialogue'
      })
    })
  }, [runtimeProbeConfig, runtimeProbeMode, startChromeSpeechBridgeTranscription])

  useEffect(() => {
    if (typeof window.electron?.on !== 'function') return
    return window.electron.on(
      'zhineng:status-dialogue:chrome-stt:event',
      (event: StatusDialogueChromeSttProgressEvent) => {
        if (!event?.session_id || chromeSttSessionRef.current !== event.session_id) return
        setCloudSttHealth((current) =>
          current.last_session_id === event.session_id
            ? {
                ...current,
                last_events: event.events ?? current.last_events,
                last_reason: event.error ?? event.fallback_reason ?? event.type,
                last_latency_ms: event.latency_ms ?? current.last_latency_ms,
                updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
              }
            : current
        )
        if (event.type === 'ready') {
          setVoiceTranscript('CLOUD STT READY')
          setVoiceError(undefined)
          return
        }
        if (event.type === 'start') {
          setVoiceTranscript('CLOUD STT STARTING')
          setVoiceError(undefined)
          return
        }
        if (event.type === 'audio_start') {
          publishXiaozhiBridgeEvent('listen_detect', {
            sessionId: event.session_id,
            emotion: 'focused',
            text: 'audio started',
            refs: ['xiaozhi_style_bridge.audio_start', 'chrome_stt_bridge']
          })
          setVoiceTranscript('LISTENING - 请现在说话')
          setVoiceError(undefined)
          return
        }
        if (event.type === 'interim' && event.transcript) {
          publishXiaozhiBridgeEvent('listen_detect', {
            sessionId: event.session_id,
            emotion: 'focused',
            text: event.transcript,
            refs: ['xiaozhi_style_bridge.interim_transcript', 'chrome_stt_bridge']
          })
          setVoiceTranscript(`HEARD ${event.transcript}`)
          setVoiceError(undefined)
          return
        }
        if (event.type === 'result' && event.transcript) {
          publishXiaozhiBridgeEvent('stt_result', {
            sessionId: event.session_id,
            emotion: 'warm',
            text: event.transcript,
            latencyMs: event.latency_ms,
            refs: ['xiaozhi_style_bridge.progress_result', 'chrome_stt_bridge']
          })
          setVoiceTranscript(event.transcript)
          setVoiceError(undefined)
          return
        }
        if (event.type === 'error') {
          setCloudSttHealth((current) =>
            buildCloudSttFailureHealthState(
              {
                session_id: event.session_id,
                success: false,
                error: event.error,
                fallback_reason: event.fallback_reason,
                latency_ms: event.latency_ms,
                events: event.events ?? current.last_events
              },
              current.retry_count
            )
          )
          const message =
            event.error === 'no-speech'
              ? 'NO SPEECH DETECTED - 云端已打开麦克风，但没有检测到可识别语音'
              : `CLOUD STT ERROR - ${event.error ?? 'unknown'}`
          setVoiceTranscript(message)
          if (event.error === 'no-speech') continuousVoiceRecoverableErrorRef.current = 'cloud_no_speech_progress'
          setVoiceError(message)
          publishXiaozhiBridgeEvent('error', {
            sessionId: event.session_id,
            emotion: 'urgent',
            error: message,
            latencyMs: event.latency_ms,
            refs: ['xiaozhi_style_bridge.progress_error', 'chrome_stt_bridge']
          })
          return
        }
        if (event.type === 'complete' && event.error === 'no-speech') {
          const message = 'NO SPEECH DETECTED - 请在 LISTENING 出现后再说，或检查默认麦克风输入音量'
          setVoiceTranscript(message)
          continuousVoiceRecoverableErrorRef.current = 'cloud_no_speech'
          setVoiceError(message)
          publishXiaozhiBridgeEvent('error', {
            sessionId: event.session_id,
            emotion: 'urgent',
            error: message,
            latencyMs: event.latency_ms,
            refs: ['xiaozhi_style_bridge.no_speech', 'chrome_stt_bridge']
          })
        }
      }
    )
  }, [publishXiaozhiBridgeEvent])

  const startSpeechRecognition = useCallback(async () => {
    const activeSttAdapter = selectedSttAdapterRef.current
    unlockVoicePlayback()
    logStatusDialogueVoiceEvent('stt_start_requested', {
      selected_adapter: activeSttAdapter,
      model: selectedSttModel,
      voice_listening: voiceListening,
      electron_ipc_available: Boolean(window.electron?.invoke),
      speech_recognition_available: Boolean(getBrowserSpeechRecognitionConstructor()),
      media_devices_available: Boolean(navigator.mediaDevices?.getUserMedia)
    })
    if (voiceListening) {
      stopSpeechRecognition()
      return
    }
    interruptVoicePlaybackForFormalInput('speech_transcript', 'stt_button_during_tts_playback', 0)
    updateDialogueExecutionState(
      'listening',
      activeSttAdapter === 'cloud'
        ? '正在准备 Cloudflare STT 录音'
        : activeSttAdapter === 'remote'
          ? '正在准备远端 STT 录音'
          : '正在准备本地 Whisper 录音'
    )

    if (activeSttAdapter === 'cloud') {
      if (isCloudSttCircuitOpen(cloudSttHealth)) {
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
        logStatusDialogueVoiceEvent('cloud_stt_circuit_open_skip_to_local', {
          selected_adapter: activeSttAdapter,
          fallback_adapter: cloudSttHealth.fallback_adapter ?? 'local_whisper_persistent_service',
          recovery_action: cloudSttHealth.recovery_action,
          category: cloudSttHealth.last_category,
          reason: cloudSttHealth.degraded_reason ?? cloudSttHealth.last_reason ?? 'cloud STT circuit open',
          retry_count: cloudSttHealth.retry_count,
          boundary: 'skip slow cloud retry; route operator speech to local Whisper; no world write'
        })
        selectSttAdapter('local', 'cloud_stt_circuit_open_skip_to_local')
        setDialogueMessages((messages) => [
          ...messages.slice(-7),
          {
            id: createStatusDialogueMessageId(),
            role: 'system',
            text: 'Cloud STT circuit is open. I am using local Whisper for this voice input.',
            timestamp,
            thoughts: [
              'stt adapter: cloud_chrome_stt_bridge',
              'cloud circuit: open',
              `recovery: ${cloudSttHealth.recovery_action}`,
              `category: ${cloudSttHealth.last_category}`,
              'fallback: local_whisper_persistent_service'
            ],
            source: 'speech input circuit breaker',
            statusRefs: ['speech_input.chrome_stt_bridge', 'speech_input.local_whisper_persistent_service']
          }
        ])
        if (await startLocalSpeechTranscription()) {
          return
        }
      }
      if (await startChromeSpeechBridgeTranscription()) {
        return
      }
      if (typeof window.electron?.invoke === 'function') {
        return
      }
    } else if (activeSttAdapter === 'remote') {
      const remoteHealth = remoteSttRuntimeStateRef.current.health
      const remoteKnownUnavailable =
        remoteHealth.status === 'error' ||
        remoteHealth.base_url_host === 'not_configured' ||
        (remoteHealth.status === 'fallback' && remoteHealth.error === 'remote STT is not configured')
      if (remoteKnownUnavailable) {
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
        logStatusDialogueVoiceEvent('remote_stt_unavailable_skip_to_local', {
          selected_adapter: activeSttAdapter,
          configured: remoteHealth.configured,
          reachable: remoteHealth.reachable,
          status: remoteHealth.status,
          error: remoteHealth.error,
          fallback_adapter: 'local_whisper_persistent_service',
          boundary: 'skip known unavailable remote STT before recording; route operator speech to local Whisper; no world write'
        })
        selectSttAdapter('local', 'remote_stt_unavailable_skip_to_local')
        setDialogueMessages((messages) => [
          ...messages.slice(-7),
          {
            id: createStatusDialogueMessageId(),
            role: 'system',
            text: 'Remote STT is not configured. I am using local Whisper for this voice input.',
            timestamp,
            thoughts: [
              'stt adapter: openai_compatible_stt',
              'remote health: unavailable',
              `configured: ${remoteHealth.configured}`,
              `reachable: ${remoteHealth.reachable}`,
              'fallback: local_whisper_persistent_service'
            ],
            source: 'speech input remote fallback',
            statusRefs: ['speech_input.openai_compatible_stt', 'speech_input.local_whisper_persistent_service'],
            missingStatus: remoteHealth.configured ? [] : ['remote_stt_api_configuration']
          }
        ])
        if (await startLocalSpeechTranscription()) {
          return
        }
      }
      if (await startLocalSpeechTranscription({ transcriptionAdapterId: 'openai_compatible_stt' })) {
        return
      }
    } else {
      if (await startLocalSpeechTranscription()) {
        return
      }
    }

    const SpeechRecognitionCtor = getBrowserSpeechRecognitionConstructor()
    if (!SpeechRecognitionCtor) {
      const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      const message = '当前浏览器没有可用的 SpeechRecognition，语音输入回退到文字输入。'
      setVoiceInputEnabled(false)
      setVoiceListening(false)
      setVoiceError(message)
      setDialogueMessages((messages) => [
        ...messages.slice(-7),
        {
          id: createStatusDialogueMessageId(),
          role: 'system',
          text: message,
          timestamp,
          thoughts: ['stt adapter: browser_speech_recognition unavailable', 'fallback: text_input'],
          source: 'speech input fallback',
          statusRefs: ['speech_input.browser_speech_recognition'],
          missingStatus: ['browser_speech_recognition']
        }
      ])
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      const message = '当前运行环境没有可用的麦克风访问 API，语音输入回退到文字输入。'
      setVoiceInputEnabled(false)
      setVoiceListening(false)
      setVoiceError(message)
      setDialogueMessages((messages) => [
        ...messages.slice(-7),
        {
          id: createStatusDialogueMessageId(),
          role: 'system',
          text: message,
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          thoughts: ['mediaDevices.getUserMedia unavailable', 'fallback: text_input'],
          source: 'speech input fallback',
          statusRefs: ['navigator.mediaDevices.getUserMedia'],
          missingStatus: ['microphone_access_api']
        }
      ])
      return
    }

    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      permissionStream.getTracks().forEach((track) => track.stop())
    } catch (error) {
      const message = formatMicrophonePermissionError(error)
      setVoiceInputEnabled(false)
      setVoiceListening(false)
      setVoiceError(message)
      setDialogueMessages((messages) => [
        ...messages.slice(-7),
        {
          id: createStatusDialogueMessageId(),
          role: 'system',
          text: message,
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          thoughts: ['microphone permission preflight failed', 'fallback: text_input'],
          source: 'speech input fallback',
          error: message,
          statusRefs: ['navigator.mediaDevices.getUserMedia'],
          missingStatus: ['microphone_permission']
        }
      ])
      return
    }

    speechRecognitionRef.current?.abort()
    const recognition = new SpeechRecognitionCtor()
    let submitted = false
    const clearSpeechSubmitTimer = () => {
      if (speechRecognitionSubmitTimerRef.current !== undefined) {
        window.clearTimeout(speechRecognitionSubmitTimerRef.current)
        speechRecognitionSubmitTimerRef.current = undefined
      }
    }
    const submitSpeechTranscript = (rawTranscript: string) => {
      const transcript = rawTranscript.trim()
      if (!transcript || submitted) return
      clearSpeechSubmitTimer()
      submitted = true
      setDialogueInput(transcript)
      setVoiceTranscript(transcript)
      setVoiceError(undefined)
      void submitDialogue(transcript, 'speech_transcript')
      try {
        recognition.stop()
      } catch {
        recognition.abort()
      }
    }
    const scheduleSpeechTranscriptSubmit = (rawTranscript: string) => {
      const transcript = rawTranscript.trim()
      if (!transcript || submitted) return
      clearSpeechSubmitTimer()
      speechRecognitionSubmitTimerRef.current = window.setTimeout(() => {
        submitSpeechTranscript(speechRecognitionDraftRef.current || transcript)
      }, 1200)
    }

    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.onstart = () => {
      setVoiceInputEnabled(true)
      setVoiceOutputEnabled(true)
      setVoiceListening(true)
      setVoiceTranscript('')
      speechRecognitionDraftRef.current = ''
      clearSpeechSubmitTimer()
      setVoiceError(undefined)
    }
    recognition.onresult = (event) => {
      const finalParts: string[] = []
      const interimParts: string[] = []
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result?.[0]?.transcript?.trim()
        if (!transcript) continue
        if (result.isFinal) {
          finalParts.push(transcript)
        } else {
          interimParts.push(transcript)
        }
      }
      const finalText = finalParts.join(' ').trim()
      const interimText = interimParts.join(' ').trim()
      const transcriptText = [finalText, interimText].filter(Boolean).join(' ').trim()
      speechRecognitionDraftRef.current = transcriptText
      setVoiceTranscript(transcriptText)
      if (finalText) {
        submitSpeechTranscript(finalText)
      } else {
        scheduleSpeechTranscriptSubmit(transcriptText)
      }
    }
    recognition.onerror = (event) => {
      const code = event.error || 'unknown'
      const message = event.message || `语音输入失败：${code}`
      setVoiceError(message)
      setVoiceListening(false)
      if (code === 'network' && typeof window.electron?.invoke === 'function') {
        setDialogueMessages((messages) => [
          ...messages.slice(-7),
          {
            id: createStatusDialogueMessageId(),
            role: 'system',
            text: '浏览器在线语音识别网络不可用，我切到本地 Whisper 备用转写。',
            timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
            thoughts: [
              'stt adapter error',
              'browser_speech_recognition network',
              'fallback: local_whisper_ipc'
            ],
            source: 'speech input fallback',
            error: message,
            statusRefs: ['speech_input.browser_speech_recognition', 'speech_input.local_whisper_ipc']
          }
        ])
        void startLocalSpeechTranscription()
        return
      }
      setDialogueMessages((messages) => [
        ...messages.slice(-7),
        {
          id: createStatusDialogueMessageId(),
          role: 'system',
          text: message,
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          thoughts: ['stt adapter error', `error: ${code}`, 'fallback: text_input'],
          source: 'speech input fallback',
          error: message,
          statusRefs: ['speech_input.browser_speech_recognition']
        }
      ])
    }
    recognition.onend = () => {
      submitSpeechTranscript(speechRecognitionDraftRef.current)
      clearSpeechSubmitTimer()
      setVoiceListening(false)
      speechRecognitionRef.current = null
      speechRecognitionDraftRef.current = ''
    }

    speechRecognitionRef.current = recognition
    try {
      recognition.start()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setVoiceError(message)
      setVoiceListening(false)
      speechRecognitionRef.current = null
    }
  }, [
    cloudSttHealth,
    selectSttAdapter,
    startChromeSpeechBridgeTranscription,
    startLocalSpeechTranscription,
    interruptVoicePlaybackForFormalInput,
    remoteSttRuntimeState.health,
    selectedSttAdapter,
    selectedSttModel,
    setVoiceOutputEnabled,
    stopSpeechRecognition,
    submitDialogue,
    updateDialogueExecutionState,
    unlockVoicePlayback,
    voiceListening
  ])

  useEffect(() => {
    if (runtimeProbeMode !== 'stt_click_during_tts') return
    if (sttClickDuringTtsProbeStartedRef.current) return
    sttClickDuringTtsProbeStartedRef.current = true

    const probeSessionId = `status-dialogue-stt-click-during-tts-probe-${Date.now()}`
    selectSttAdapter('local', 'stt_click_during_tts_probe')
    setVoiceInputEnabled(true)
    setVoiceOutputEnabled(true)
    logStatusDialogueVoiceEvent('status_dialogue_stt_click_during_tts_probe_start', {
      runtime_probe: runtimeProbeMode,
      session_id: probeSessionId,
      boundary: 'controlled renderer probe; clicking STT during TTS must interrupt playback before local recording'
    })
    beginVoiceOutputSession(probeSessionId)
    updateVoicePlaybackQueue({
      status: 'playing',
      active_chunk_id: 'stt-click-during-tts-probe-chunk',
      queued_count: 1
    })
    patchVoiceLatency({
      stage: 'playing',
      playbackMs: 1,
      playbackFirstMs: 1,
      playbackTotalMs: 1
    })
    window.setTimeout(() => {
      void startSpeechRecognition()
      logStatusDialogueVoiceEvent('status_dialogue_stt_click_during_tts_probe_submitted', {
        runtime_probe: runtimeProbeMode,
        session_id: probeSessionId,
        boundary: 'called existing startSpeechRecognition while TTS state is playing'
      })
    }, 500)
  }, [
    beginVoiceOutputSession,
    patchVoiceLatency,
    runtimeProbeMode,
    selectSttAdapter,
    setVoiceOutputEnabled,
    startSpeechRecognition,
    updateVoicePlaybackQueue
  ])

  const patchWakeDetectorState = useCallback((patch: Partial<XiaozhiStyleWakeDetectorState>) => {
    setWakeDetectorState((current) => ({
      ...current,
      ...patch,
      generated_at: new Date().toISOString()
    }))
  }, [])

  const stopWakeDetectorRecognition = useCallback(() => {
    if (wakeDetectorRestartTimerRef.current !== undefined) {
      window.clearTimeout(wakeDetectorRestartTimerRef.current)
      wakeDetectorRestartTimerRef.current = undefined
    }
    const recognition = wakeDetectorRecognitionRef.current
    wakeDetectorRecognitionRef.current = null
    if (!recognition) return
    recognition.onend = null
    recognition.onerror = null
    recognition.onresult = null
    recognition.onstart = null
    try {
      recognition.abort()
    } catch {
      // The browser recognizer can already be closed when a wake phrase is detected.
    }
  }, [])

  const startW3WakeDetectorLoop = useCallback(
    (loopWakeConfig = wakeConfig, loopDetectorConfig = wakeDetectorConfig) => {
      if (!wakeDetectorEnabledRef.current) return
      if (wakeDetectorRecognitionRef.current) return

      const playbackActive =
        xiaozhiBridgeState.speaking_active ||
        voiceLatency.stage === 'ack' ||
        voiceLatency.stage === 'tts_generating' ||
        voiceLatency.stage === 'playing'
      if (playbackActive) {
        setW3WakeStage('paused_tts')
        patchWakeDetectorState({
          runtime: 'ready',
          enabled: true,
          continuous_listen_enabled: true,
          wake_window_open: false,
          blocked_reason: 'TTS playback active; wake detector paused only'
        })
        wakeDetectorRestartTimerRef.current = window.setTimeout(() => {
          wakeDetectorRestartTimerRef.current = undefined
          startW3WakeDetectorLoop(loopWakeConfig, loopDetectorConfig)
        }, 600)
        return
      }

      if (voiceListening) {
        setW3WakeStage('paused_stt')
        patchWakeDetectorState({
          runtime: 'ready',
          enabled: true,
          continuous_listen_enabled: true,
          wake_window_open: false,
          blocked_reason: 'formal STT active; wake detector paused without closing input'
        })
        wakeDetectorRestartTimerRef.current = window.setTimeout(() => {
          wakeDetectorRestartTimerRef.current = undefined
          startW3WakeDetectorLoop(loopWakeConfig, loopDetectorConfig)
        }, 700)
        return
      }

      const SpeechRecognitionCtor = getBrowserSpeechRecognitionConstructor()
      if (!SpeechRecognitionCtor) {
        setW3WakeStage('error')
        patchWakeDetectorState({
          runtime: 'blocked',
          enabled: true,
          continuous_listen_enabled: true,
          wake_window_open: false,
          blocked_reason: 'Browser SpeechRecognition is unavailable for W3 browser phrase detector'
        })
        return
      }

      const recognition = new SpeechRecognitionCtor()
      wakeDetectorRecognitionRef.current = recognition
      let wakeDetected = false

      recognition.lang = 'zh-CN'
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1
      recognition.onstart = () => {
        setW3WakeStage('listening')
        patchWakeDetectorState({
          runtime: 'ready',
          enabled: true,
          continuous_listen_enabled: true,
          wake_window_open: false,
          phrase_count: loopWakeConfig.wake_word.phrases.length,
          blocked_reason: 'listening for W3 wake phrases'
        })
      }
      recognition.onresult = (event) => {
        const parts: string[] = []
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const transcript = event.results[index]?.[0]?.transcript?.trim()
          if (transcript) parts.push(transcript)
        }
        const transcriptText = parts.join(' ').trim()
        if (!transcriptText) return
        const phrase = detectWakePhrase(transcriptText, loopWakeConfig.wake_word.phrases)
        if (!phrase || wakeDetected) return
        wakeDetected = true
        stopWakeDetectorRecognition()
        setW3WakeStage('wake_window')
        patchWakeDetectorState({
          runtime: 'ready',
          enabled: true,
          continuous_listen_enabled: true,
          wake_window_open: true,
          last_detected_phrase: phrase,
          confidence: 0.86,
          dialogue_triggered: false,
          blocked_reason: `wake phrase detected: ${phrase}`
        })
        logStatusDialogueVoiceEvent('w3_wake_detected', {
          phrase,
          stage: 'wake_window',
          adapter_id: loopDetectorConfig.adapter_id,
          wake_window_ms: loopWakeConfig.wake_word.wake_window_ms,
          selected_stt_adapter: selectedSttAdapter,
          boundary: 'wake_window_only_then_existing_stt'
        })
        publishXiaozhiBridgeEvent('listen_detect', {
          sessionId: `w3-wake-${Date.now()}`,
          emotion: 'warm',
          text: `wake phrase detected: ${phrase}`,
          refs: ['voice.wake_detector_adapter', 'browser_phrase_match_reserved']
        })
        setDialogueMessages((messages) => [
          ...messages.slice(-7),
          {
            id: createStatusDialogueMessageId(),
            role: 'system',
            text: `W3 已听到“${phrase}”，我打开对话窗口并转交现有 STT。`,
            timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
            thoughts: [
              'w3 stage: wake_window',
              'adapter: browser_phrase_match_reserved',
              'handoff: existing STT path',
              'tts gate: wake detector only'
            ],
            source: 'w3 wake detector',
            statusRefs: ['voice.wake_detector_adapter', 'voice.stt_adapter']
          }
        ])
        window.setTimeout(() => {
          if (!wakeDetectorEnabledRef.current) return
          setW3WakeStage('handoff_stt')
          patchWakeDetectorState({
            runtime: 'ready',
            enabled: true,
            continuous_listen_enabled: true,
            wake_window_open: true,
            last_detected_phrase: phrase,
            confidence: 0.86,
            dialogue_triggered: true,
            blocked_reason: `wake phrase ${phrase} handed off to ${selectedSttAdapter} STT`
          })
          logStatusDialogueVoiceEvent('w3_wake_handoff_stt', {
            phrase,
            stage: 'handoff_stt',
            selected_stt_adapter: selectedSttAdapter,
            input_mode: loopWakeConfig.voice_input_mode,
            boundary: 'detector_does_not_submit_dialogue_audio'
          })
          void startSpeechRecognition()
        }, 120)
        if (wakeWindowTimerRef.current !== undefined) window.clearTimeout(wakeWindowTimerRef.current)
        wakeWindowTimerRef.current = window.setTimeout(() => {
          wakeWindowTimerRef.current = undefined
          if (!wakeDetectorEnabledRef.current) return
          setW3WakeStage('cooldown')
          patchWakeDetectorState({
            wake_window_open: false,
            dialogue_triggered: false,
            confidence: 0,
            blocked_reason: 'wake window closed; detector cooldown'
          })
          wakeDetectorRestartTimerRef.current = window.setTimeout(() => {
            wakeDetectorRestartTimerRef.current = undefined
            startW3WakeDetectorLoop(loopWakeConfig, loopDetectorConfig)
          }, loopWakeConfig.wake_word.cooldown_ms)
        }, loopWakeConfig.wake_word.wake_window_ms)
      }
      recognition.onerror = (event) => {
        const error = event.error || event.message || 'wake detector error'
        wakeDetectorRecognitionRef.current = null
        setW3WakeStage('error')
        patchWakeDetectorState({
          runtime: error === 'no-speech' ? 'ready' : 'error',
          enabled: true,
          continuous_listen_enabled: true,
          wake_window_open: false,
          blocked_reason: `W3 detector error: ${error}`
        })
        if (wakeDetectorEnabledRef.current && error === 'no-speech') {
          wakeDetectorRestartTimerRef.current = window.setTimeout(() => {
            wakeDetectorRestartTimerRef.current = undefined
            startW3WakeDetectorLoop(loopWakeConfig, loopDetectorConfig)
          }, 700)
        }
      }
      recognition.onend = () => {
        if (wakeDetectorRecognitionRef.current === recognition) {
          wakeDetectorRecognitionRef.current = null
        }
        if (!wakeDetectorEnabledRef.current || wakeDetected) return
        wakeDetectorRestartTimerRef.current = window.setTimeout(() => {
          wakeDetectorRestartTimerRef.current = undefined
          startW3WakeDetectorLoop(loopWakeConfig, loopDetectorConfig)
        }, 650)
      }

      try {
        setW3WakeStage('starting')
        recognition.start()
      } catch (error) {
        wakeDetectorRecognitionRef.current = null
        const message = error instanceof Error ? error.message : String(error)
        setW3WakeStage('error')
        patchWakeDetectorState({
          runtime: 'error',
          enabled: true,
          continuous_listen_enabled: true,
          wake_window_open: false,
          blocked_reason: `W3 detector start failed: ${message}`
        })
      }
    },
    [
      patchWakeDetectorState,
      publishXiaozhiBridgeEvent,
      selectedSttAdapter,
      startSpeechRecognition,
      stopWakeDetectorRecognition,
      voiceLatency.stage,
      voiceListening,
      wakeConfig,
      wakeDetectorConfig,
      xiaozhiBridgeState.speaking_active
    ]
  )

  const enableW3WakeDetector = useCallback(() => {
    const nextWakeConfig = buildW3BrowserWakeConfig(true)
    const nextDetectorConfig = buildW3BrowserWakeDetectorConfig(true)
    wakeDetectorEnabledRef.current = true
    setWakeConfig(nextWakeConfig)
    setWakeDetectorConfig(nextDetectorConfig)
    setW3WakeStage('starting')
    setWakeDetectorState({
      ...buildDefaultXiaozhiStyleWakeDetectorState({
        wakeConfig: nextWakeConfig,
        detectorConfig: nextDetectorConfig
      }),
      blocked_reason: 'starting W3 browser phrase detector'
    })
    window.setTimeout(() => startW3WakeDetectorLoop(nextWakeConfig, nextDetectorConfig), 0)
  }, [startW3WakeDetectorLoop])

  const disableW3WakeDetector = useCallback(() => {
    wakeDetectorEnabledRef.current = false
    stopWakeDetectorRecognition()
    if (wakeWindowTimerRef.current !== undefined) {
      window.clearTimeout(wakeWindowTimerRef.current)
      wakeWindowTimerRef.current = undefined
    }
    const nextWakeConfig = buildW3BrowserWakeConfig(false)
    const nextDetectorConfig = buildW3BrowserWakeDetectorConfig(false)
    setWakeConfig(nextWakeConfig)
    setWakeDetectorConfig(nextDetectorConfig)
    setW3WakeStage('off')
    setWakeDetectorState(
      buildDefaultXiaozhiStyleWakeDetectorState({
        wakeConfig: nextWakeConfig,
        detectorConfig: nextDetectorConfig,
        blockedReason: 'W3 detector is off; manual STT remains available'
      })
    )
  }, [stopWakeDetectorRecognition])

  const toggleW3WakeDetector = useCallback(() => {
    if (wakeDetectorEnabledRef.current) {
      disableW3WakeDetector()
    } else {
      enableW3WakeDetector()
    }
  }, [disableW3WakeDetector, enableW3WakeDetector])

  const patchContinuousVoiceSession = useCallback(
    (patch: Partial<StatusDialogueContinuousVoiceSessionState>) => {
      setContinuousVoiceSession((current) => {
        const next: StatusDialogueContinuousVoiceSessionState = {
          ...current,
          ...patch,
          updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
        }
        const unchanged =
          current.enabled === next.enabled &&
          current.status === next.status &&
          current.resumed_count === next.resumed_count &&
          current.last_reason === next.last_reason &&
          current.next_resume_at === next.next_resume_at &&
          current.boundary === next.boundary
        return unchanged ? current : next
      })
    },
    []
  )

  const clearContinuousVoiceResumeTimer = useCallback(() => {
    if (continuousVoiceResumeTimerRef.current === undefined) return
    window.clearTimeout(continuousVoiceResumeTimerRef.current)
    continuousVoiceResumeTimerRef.current = undefined
  }, [])

  const enableContinuousVoiceSession = useCallback(() => {
    clearContinuousVoiceResumeTimer()
    if (wakeDetectorEnabledRef.current) disableW3WakeDetector()
    continuousVoiceSessionEnabledRef.current = true
    continuousVoiceResumeInFlightRef.current = false
    continuousVoiceRecoverableErrorRef.current = undefined
    continuousVoiceRecoverableErrorCountRef.current = 0
    setVoiceError(undefined)
    patchContinuousVoiceSession({
      enabled: true,
      status: 'armed',
      last_reason: 'operator_enabled',
      next_resume_at: undefined
    })
    logStatusDialogueVoiceEvent('continuous_voice_session_enabled', {
      selected_stt_adapter: selectedSttAdapter,
      resume_delay_ms: STATUS_DIALOGUE_CONTINUOUS_VOICE_RESUME_DELAY_MS,
      w3_detector_disabled: wakeDetectorEnabledRef.current === false,
      boundary: 'manual loop uses existing formal STT path; no raw audio persistence; no world write'
    })
  }, [clearContinuousVoiceResumeTimer, disableW3WakeDetector, patchContinuousVoiceSession, selectedSttAdapter])

  const disableContinuousVoiceSession = useCallback(
    (reason = 'operator_disabled') => {
      clearContinuousVoiceResumeTimer()
      continuousVoiceSessionEnabledRef.current = false
      continuousVoiceResumeInFlightRef.current = false
      continuousVoiceRecoverableErrorRef.current = undefined
      continuousVoiceRecoverableErrorCountRef.current = 0
      patchContinuousVoiceSession({
        enabled: false,
        status: 'off',
        last_reason: reason,
        next_resume_at: undefined
      })
      logStatusDialogueVoiceEvent('continuous_voice_session_disabled', {
        reason,
        selected_stt_adapter: selectedSttAdapter,
        boundary: 'manual loop stopped; normal one-shot STT remains available'
      })
      if (voiceListeningRef.current) stopSpeechRecognition()
    },
    [clearContinuousVoiceResumeTimer, patchContinuousVoiceSession, selectedSttAdapter, stopSpeechRecognition]
  )

  const toggleContinuousVoiceSession = useCallback(() => {
    if (continuousVoiceSessionEnabledRef.current) {
      disableContinuousVoiceSession()
    } else {
      enableContinuousVoiceSession()
    }
  }, [disableContinuousVoiceSession, enableContinuousVoiceSession])

  useEffect(() => {
    if (runtimeProbeMode !== 'local_stt_low_signal') return
    if (localSttLowSignalProbeStartedRef.current) return
    localSttLowSignalProbeStartedRef.current = true
    logStatusDialogueVoiceEvent('status_dialogue_local_stt_low_signal_probe_start', {
      runtime_probe: runtimeProbeMode,
      selected_stt_adapter: selectedSttAdapter,
      strict_rms_threshold: STATUS_DIALOGUE_LOCAL_STT_RMS_THRESHOLD,
      strict_peak_threshold: STATUS_DIALOGUE_LOCAL_STT_PEAK_THRESHOLD,
      low_signal_rms_threshold: STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_RMS_THRESHOLD,
      low_signal_peak_threshold: STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_PEAK_THRESHOLD,
      low_signal_transcribe_ms: STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_TRANSCRIBE_MS,
      boundary: 'controlled Electron probe; low-level fake microphone input; no raw audio persistence; no world write'
    })
    window.setTimeout(() => {
      void startSpeechRecognition()
    }, 250)
  }, [runtimeProbeMode, selectedSttAdapter, startSpeechRecognition])

  useEffect(() => {
    if (runtimeProbeMode !== 'local_stt_borderline') return
    if (localSttBorderlineProbeStartedRef.current) return
    localSttBorderlineProbeStartedRef.current = true
    logStatusDialogueVoiceEvent('status_dialogue_local_stt_borderline_probe_start', {
      runtime_probe: runtimeProbeMode,
      selected_stt_adapter: selectedSttAdapter,
      strict_rms_threshold: STATUS_DIALOGUE_LOCAL_STT_RMS_THRESHOLD,
      strict_peak_threshold: STATUS_DIALOGUE_LOCAL_STT_PEAK_THRESHOLD,
      low_signal_rms_threshold: STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_RMS_THRESHOLD,
      low_signal_peak_threshold: STATUS_DIALOGUE_LOCAL_STT_LOW_SIGNAL_PEAK_THRESHOLD,
      borderline_rms_threshold: STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_RMS_THRESHOLD,
      borderline_peak_threshold: STATUS_DIALOGUE_LOCAL_STT_BORDERLINE_PEAK_THRESHOLD,
      boundary: 'controlled Electron probe; borderline microphone energy is sent to Whisper; no raw audio persistence; no world write'
    })
    window.setTimeout(() => {
      void startSpeechRecognition()
    }, 250)
  }, [runtimeProbeMode, selectedSttAdapter, startSpeechRecognition])

  useEffect(() => {
    if (runtimeProbeMode !== 'remote_stt_mock') return
    if (remoteSttMockProbeStartedRef.current) return
    remoteSttMockProbeStartedRef.current = true
    selectSttAdapter('remote', 'remote_stt_mock_probe')
    logStatusDialogueVoiceEvent('status_dialogue_remote_stt_mock_probe_start', {
      runtime_probe: runtimeProbeMode,
      selected_stt_adapter: 'remote',
      transcription_adapter_id: 'openai_compatible_stt',
      boundary: 'controlled Electron probe; mock OpenAI-compatible STT IPC; transient fake microphone only; no world write'
    })
    window.setTimeout(() => {
      void refreshRemoteSttHealth()
      void startLocalSpeechTranscription({ transcriptionAdapterId: 'openai_compatible_stt' })
    }, 300)
  }, [refreshRemoteSttHealth, runtimeProbeMode, selectSttAdapter, startLocalSpeechTranscription])

  useEffect(() => {
    if (runtimeProbeMode !== 'remote_stt_configured') return
    if (remoteSttConfiguredProbeStartedRef.current) return
    remoteSttConfiguredProbeStartedRef.current = true
    const probePreviousAdapter = selectedSttAdapter
    const restoreProbeAdapter = (reason: string) => {
      if (probePreviousAdapter !== 'remote') {
        selectSttAdapter(probePreviousAdapter, reason)
      }
      logStatusDialogueVoiceEvent('status_dialogue_remote_stt_configured_probe_adapter_restored', {
        runtime_probe: runtimeProbeMode,
        restored_adapter: probePreviousAdapter,
        reason,
        boundary: 'configured remote STT probe does not persist adapter selection into operator input'
      })
    }
    selectSttAdapter('remote', 'remote_stt_configured_probe')
    logStatusDialogueVoiceEvent('status_dialogue_remote_stt_configured_probe_start', {
      runtime_probe: runtimeProbeMode,
      selected_stt_adapter: 'remote',
      transcription_adapter_id: 'openai_compatible_stt',
      test_audio: runtimeProbeConfig.remoteSttTestAudio,
      boundary: 'configured Electron probe; real OpenAI-compatible STT config only; no api key logging; no world write'
    })
    window.setTimeout(() => {
      void refreshRemoteSttHealth()
      if (!window.electron?.invoke) {
        logStatusDialogueVoiceEvent('status_dialogue_remote_stt_configured_probe_complete', {
          runtime_probe: runtimeProbeMode,
          success: false,
          error: 'electron ipc unavailable',
          boundary: 'configured remote STT probe requires Electron IPC'
        })
        restoreProbeAdapter('remote_stt_configured_probe_ipc_unavailable_restore')
        return
      }
      void window.electron
        .invoke('zhineng:status-dialogue:stt:remote-configured-probe', {
          runtime_probe: runtimeProbeMode,
          audio_path: runtimeProbeConfig.remoteSttTestAudio,
          language: 'zh'
        })
        .then((result: {
          success?: boolean
          configured?: boolean
          reachable?: boolean
          transcript_length?: number
          latency_ms?: number
          error?: string
          fallback_reason?: string
        }) => {
          logStatusDialogueVoiceEvent('status_dialogue_remote_stt_configured_probe_result', {
            runtime_probe: runtimeProbeMode,
            success: result?.success === true,
            configured: result?.configured,
            reachable: result?.reachable,
            transcript_length: result?.transcript_length ?? 0,
            latency_ms: result?.latency_ms,
            error: result?.error,
            fallback_reason: result?.fallback_reason,
            boundary: 'renderer observed configured remote STT probe result'
          })
        })
        .catch((error: unknown) => {
          logStatusDialogueVoiceEvent('status_dialogue_remote_stt_configured_probe_complete', {
            runtime_probe: runtimeProbeMode,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            boundary: 'configured remote STT probe IPC failed'
          })
        })
        .finally(() => {
          restoreProbeAdapter('remote_stt_configured_probe_complete_restore')
        })
    }, 300)
  }, [refreshRemoteSttHealth, runtimeProbeConfig.remoteSttTestAudio, runtimeProbeMode, selectSttAdapter, selectedSttAdapter])

  useEffect(() => {
    if (runtimeProbeMode !== 'remote_stt_unavailable') return
    if (remoteSttUnavailableProbeStartedRef.current) return
    remoteSttUnavailableProbeStartedRef.current = true
    remoteSttUnavailableProbeArmedRef.current = true
    selectSttAdapter('remote', 'remote_stt_unavailable_probe')
    logStatusDialogueVoiceEvent('status_dialogue_remote_stt_unavailable_probe_start', {
      runtime_probe: runtimeProbeMode,
      selected_stt_adapter: 'remote',
      transcription_adapter_id: 'openai_compatible_stt',
      boundary: 'controlled Electron probe; remote health is unavailable and should fall back before remote audio upload'
    })
    window.setTimeout(() => {
      void refreshRemoteSttHealth().then((remoteHealth) => {
        const remoteKnownUnavailable =
          remoteHealth.status === 'error' ||
          remoteHealth.base_url_host === 'not_configured' ||
          (remoteHealth.status === 'fallback' && remoteHealth.error === 'remote STT is not configured')
        if (!remoteSttUnavailableProbeArmedRef.current || !remoteKnownUnavailable) return
        remoteSttUnavailableProbeArmedRef.current = false
        logStatusDialogueVoiceEvent('status_dialogue_remote_stt_unavailable_probe_ready', {
          runtime_probe: runtimeProbeMode,
          selected_stt_adapter: selectedSttAdapterRef.current,
          configured: remoteHealth.configured,
          reachable: remoteHealth.reachable,
          status: remoteHealth.status,
          base_url_host: remoteHealth.base_url_host,
          error: remoteHealth.error,
          boundary: 'remote unavailable state observed before calling the normal STT entry'
        })
        window.setTimeout(() => {
          void startSpeechRecognition()
        }, 100)
      })
    }, 200)
  }, [refreshRemoteSttHealth, runtimeProbeMode, selectSttAdapter, startSpeechRecognition])

  useEffect(() => {
    if (runtimeProbeMode !== 'remote_stt_unavailable') return
    if (!remoteSttUnavailableProbeArmedRef.current) return
    if (selectedSttAdapterRef.current !== 'remote') return
    const remoteHealth = remoteSttRuntimeState.health
    const remoteKnownUnavailable =
      remoteHealth.status === 'error' ||
      remoteHealth.base_url_host === 'not_configured' ||
      (remoteHealth.status === 'fallback' && remoteHealth.error === 'remote STT is not configured')
    if (!remoteKnownUnavailable) return
    remoteSttUnavailableProbeArmedRef.current = false
    logStatusDialogueVoiceEvent('status_dialogue_remote_stt_unavailable_probe_ready', {
      runtime_probe: runtimeProbeMode,
      selected_stt_adapter: selectedSttAdapterRef.current,
      configured: remoteHealth.configured,
      reachable: remoteHealth.reachable,
      status: remoteHealth.status,
      base_url_host: remoteHealth.base_url_host,
      error: remoteHealth.error,
      boundary: 'remote unavailable state observed before calling the normal STT entry'
    })
    window.setTimeout(() => {
      void startSpeechRecognition()
    }, 100)
  }, [remoteSttRuntimeState.health, runtimeProbeMode, selectedSttAdapter, startSpeechRecognition])

  useEffect(() => {
    if (runtimeProbeMode !== 'tts_voice_budget') return
    if (ttsVoiceBudgetProbeStartedRef.current) return
    ttsVoiceBudgetProbeStartedRef.current = true
    setVoiceOutputEnabled(true)
    if (voiceOutputMode !== 'edge_readaloud_stream') setVoiceOutputMode('edge_readaloud_stream')
    logStatusDialogueVoiceEvent('status_dialogue_tts_voice_budget_probe_start', {
      runtime_probe: runtimeProbeMode,
      max_streaming_sentences: STATUS_DIALOGUE_STREAMING_VOICE_MAX_SENTENCES,
      max_streaming_chars: STATUS_DIALOGUE_STREAMING_VOICE_MAX_CHARS,
      voice_output_mode: 'edge_readaloud_stream',
      boundary: 'controlled Electron probe; model stream is mocked; full reply remains visible'
    })
    window.setTimeout(() => {
      void submitDialogue('runtime probe: tts voice budget', 'text')
      logStatusDialogueVoiceEvent('status_dialogue_tts_voice_budget_probe_submitted', {
        runtime_probe: runtimeProbeMode,
        boundary: 'submitted normal dialogue through existing status dialogue path'
      })
    }, 350)
  }, [runtimeProbeMode, setVoiceOutputEnabled, submitDialogue, voiceOutputMode])

  useEffect(() => {
    if (runtimeProbeMode !== 'continuous_voice_loop') return
    if (continuousVoiceLoopProbeStartedRef.current) return
    continuousVoiceLoopProbeStartedRef.current = true
    logStatusDialogueVoiceEvent('status_dialogue_continuous_voice_loop_probe_start', {
      runtime_probe: runtimeProbeMode,
      selected_stt_adapter: selectedSttAdapter,
      resume_delay_ms: STATUS_DIALOGUE_CONTINUOUS_VOICE_RESUME_DELAY_MS,
      boundary: 'controlled scheduler probe; no microphone STT; no world write; no requirement packet'
    })
    enableContinuousVoiceSession()
  }, [enableContinuousVoiceSession, runtimeProbeMode, selectedSttAdapter])

  useEffect(() => {
    if (runtimeProbeMode !== 'continuous_voice_fast_fail') return
    if (continuousVoiceFastFailProbeStartedRef.current) return
    continuousVoiceFastFailProbeStartedRef.current = true
    logStatusDialogueVoiceEvent('status_dialogue_continuous_voice_fast_fail_probe_start', {
      runtime_probe: runtimeProbeMode,
      selected_stt_adapter: selectedSttAdapter,
      fast_fail_ms: STATUS_DIALOGUE_LOCAL_STT_CONTINUOUS_NO_VOICE_FAST_FAIL_MS,
      boundary: 'controlled Electron probe; fake/silent microphone input only; no world write; no requirement packet'
    })
    enableContinuousVoiceSession()
  }, [enableContinuousVoiceSession, runtimeProbeMode, selectedSttAdapter])

  useEffect(() => {
    if (runtimeProbeMode !== 'continuous_voice_two_turn') return
    if (continuousVoiceTwoTurnProbeStartedRef.current) return
    continuousVoiceTwoTurnProbeStartedRef.current = true
    continuousVoiceTwoTurnProbeSuccessCountRef.current = 0
    selectSttAdapter('local', 'continuous_voice_two_turn_probe')
    setVoiceInputEnabled(true)
    setVoiceOutputEnabled(true)
    logStatusDialogueVoiceEvent('status_dialogue_continuous_voice_two_turn_probe_start', {
      runtime_probe: runtimeProbeMode,
      selected_stt_adapter: 'local',
      resume_delay_ms: STATUS_DIALOGUE_CONTINUOUS_VOICE_RESUME_DELAY_MS,
      min_turns: 2,
      boundary: 'controlled two-turn probe; uses existing formal STT path; no world write; no requirement packet'
    })
    enableContinuousVoiceSession()
  }, [enableContinuousVoiceSession, runtimeProbeMode, selectSttAdapter, setVoiceOutputEnabled])

  useEffect(() => {
    if (!continuousVoiceSessionEnabledRef.current) return

    const latestVoiceQueueState = voicePlaybackQueueStateRef.current
    const playbackActive = isVoicePlaybackActiveForInput({
      queueStatus: latestVoiceQueueState.status,
      voiceLatencyStage: voiceLatencyRef.current.stage,
      speakingActive: xiaozhiBridgeState.speaking_active
    })

    if (voiceListening) {
      continuousVoiceResumeInFlightRef.current = false
      clearContinuousVoiceResumeTimer()
      patchContinuousVoiceSession({ status: 'listening', last_reason: 'formal_stt_active', next_resume_at: undefined })
      return
    }

    if (dialogueBusyRef.current || dialogueBusy) {
      clearContinuousVoiceResumeTimer()
      patchContinuousVoiceSession({ status: 'waiting_dialogue', last_reason: 'dialogue_busy', next_resume_at: undefined })
      return
    }

    if (playbackActive) {
      clearContinuousVoiceResumeTimer()
      patchContinuousVoiceSession({ status: 'waiting_tts', last_reason: 'tts_playback_active', next_resume_at: undefined })
      return
    }

    if (dialogueInputQueueState.queued_count > 0) {
      clearContinuousVoiceResumeTimer()
      patchContinuousVoiceSession({ status: 'waiting_queue', last_reason: 'dialogue_input_queue_not_empty', next_resume_at: undefined })
      return
    }

    if (voiceErrorRef.current) {
      const recoverableError = continuousVoiceRecoverableErrorRef.current
      const idleSilenceRecoverable =
        recoverableError === 'no_audible_speech' ||
        recoverableError === 'local_audio_too_short' ||
        recoverableError === 'cloud_no_speech' ||
        recoverableError === 'cloud_no_speech_progress'
      if (
        recoverableError &&
        (idleSilenceRecoverable ||
          continuousVoiceRecoverableErrorCountRef.current < STATUS_DIALOGUE_CONTINUOUS_VOICE_RECOVERABLE_ERROR_MAX_RETRIES)
      ) {
        const retryCount = idleSilenceRecoverable ? 1 : continuousVoiceRecoverableErrorCountRef.current + 1
        const error = voiceErrorRef.current
        continuousVoiceRecoverableErrorCountRef.current = idleSilenceRecoverable ? 0 : retryCount
        continuousVoiceRecoverableErrorRef.current = undefined
        voiceErrorRef.current = undefined
        setVoiceError(undefined)
        patchVoiceLatency({ stage: 'idle' })
        patchContinuousVoiceSession({
          status: 'cooldown',
          last_reason: idleSilenceRecoverable
            ? `idle_silence_${recoverableError}_resume_${retryCount}`
            : `recoverable_${recoverableError}_retry_${retryCount}`,
          next_resume_at: undefined
        })
        logStatusDialogueVoiceEvent('continuous_voice_session_recoverable_error_retry', {
          error,
          error_kind: recoverableError,
          retry_count: retryCount,
          max_retries: STATUS_DIALOGUE_CONTINUOUS_VOICE_RECOVERABLE_ERROR_MAX_RETRIES,
          idle_silence_recoverable: idleSilenceRecoverable,
          selected_stt_adapter: selectedSttAdapter,
          boundary: idleSilenceRecoverable
            ? 'idle silence/no-speech clears the transient error without stopping continuous listening'
            : 'recoverable STT error clears the transient error until retry budget is exhausted'
        })
        return
      }
      continuousVoiceResumeInFlightRef.current = false
      clearContinuousVoiceResumeTimer()
      patchContinuousVoiceSession({ status: 'paused_error', last_reason: 'voice_error_requires_operator_retry', next_resume_at: undefined })
      if (continuousVoiceSession.status !== 'paused_error') {
        logStatusDialogueVoiceEvent('continuous_voice_session_paused_error', {
          error: voiceErrorRef.current,
          error_kind: recoverableError ?? 'hard_error',
          recoverable_retry_count: continuousVoiceRecoverableErrorCountRef.current,
          selected_stt_adapter: selectedSttAdapter,
          boundary: 'continuous loop pauses on hard STT errors or after non-idle recoverable retry budget is exhausted'
        })
      }
      return
    }

    if (continuousVoiceResumeInFlightRef.current) {
      patchContinuousVoiceSession({ status: 'armed', last_reason: 'resume_stt_in_flight', next_resume_at: undefined })
      return
    }

    if (continuousVoiceResumeTimerRef.current !== undefined) return

    const nextResumeAtMs = Date.now() + STATUS_DIALOGUE_CONTINUOUS_VOICE_RESUME_DELAY_MS
    const nextResumeAt = new Date(nextResumeAtMs).toISOString()
    patchContinuousVoiceSession({
      status: 'cooldown',
      last_reason: 'idle_resume_scheduled',
      next_resume_at: nextResumeAt
    })
    logStatusDialogueVoiceEvent('continuous_voice_session_resume_scheduled', {
      selected_stt_adapter: selectedSttAdapter,
      resume_delay_ms: STATUS_DIALOGUE_CONTINUOUS_VOICE_RESUME_DELAY_MS,
      next_resume_at: nextResumeAt,
      boundary: 'resume only when dialogue, TTS, queue, and wake detector are idle'
    })
    continuousVoiceResumeTimerRef.current = window.setTimeout(() => {
      continuousVoiceResumeTimerRef.current = undefined
      if (!continuousVoiceSessionEnabledRef.current) return
      if (voiceListeningRef.current || dialogueBusyRef.current || voiceErrorRef.current) return
      continuousVoiceResumeInFlightRef.current = true
      logStatusDialogueVoiceEvent('continuous_voice_session_resume_stt', {
        selected_stt_adapter: selectedSttAdapter,
        source: 'continuous_voice_session.v1',
        boundary: 'calls existing startSpeechRecognition; no separate STT adapter'
      })
      patchContinuousVoiceSession({
        status: 'armed',
        last_reason: 'resume_stt',
        next_resume_at: undefined,
        resumed_count: continuousVoiceSession.resumed_count + 1
      })
      if (runtimeProbeMode === 'continuous_voice_loop') {
        continuousVoiceResumeInFlightRef.current = false
        continuousVoiceSessionEnabledRef.current = false
        patchContinuousVoiceSession({
          enabled: false,
          status: 'off',
          last_reason: 'controlled_probe_complete',
          next_resume_at: undefined
        })
        logStatusDialogueVoiceEvent('status_dialogue_continuous_voice_loop_probe_complete', {
          runtime_probe: runtimeProbeMode,
          success: true,
          selected_stt_adapter: selectedSttAdapter,
          boundary: 'controlled scheduler probe complete; microphone STT is not opened in this probe'
        })
        return
      }
      void startSpeechRecognition()
    }, STATUS_DIALOGUE_CONTINUOUS_VOICE_RESUME_DELAY_MS)
  }, [
    clearContinuousVoiceResumeTimer,
    continuousVoiceSession.enabled,
    continuousVoiceSession.resumed_count,
    continuousVoiceSession.status,
    dialogueBusy,
    dialogueInputQueueState.queued_count,
    patchContinuousVoiceSession,
    patchVoiceLatency,
    runtimeProbeMode,
    selectedSttAdapter,
    startSpeechRecognition,
    voiceLatency.stage,
    voiceListening,
    voicePlaybackQueueState.status,
    voicePlaybackQueueState.updated_at,
    xiaozhiBridgeState.speaking_active
  ])

  useEffect(() => {
    return () => {
      if (continuousVoiceResumeTimerRef.current !== undefined) {
        window.clearTimeout(continuousVoiceResumeTimerRef.current)
        continuousVoiceResumeTimerRef.current = undefined
      }
    }
  }, [])

  useEffect(() => {
    if (runtimeProbeMode !== 'w3_wake_handoff') return
    if (w3WakeHandoffProbeStartedRef.current) return
    w3WakeHandoffProbeStartedRef.current = true

    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const nextWakeConfig = buildW3BrowserWakeConfig(true)
    const nextDetectorConfig = buildW3BrowserWakeDetectorConfig(true)
    const transcript = '小张 现在测试 W3 唤醒窗口'
    const phrase = detectWakePhrase(transcript, nextWakeConfig.wake_word.phrases)
    const probeSessionId = `status-dialogue-w3-wake-handoff-probe-${Date.now()}`

    wakeDetectorEnabledRef.current = true
    setWakeConfig(nextWakeConfig)
    setWakeDetectorConfig(nextDetectorConfig)
    setW3WakeStage('starting')
    setWakeDetectorState({
      ...buildDefaultXiaozhiStyleWakeDetectorState({
        wakeConfig: nextWakeConfig,
        detectorConfig: nextDetectorConfig
      }),
      blocked_reason: 'controlled W3 wake handoff probe starting'
    })
    logStatusDialogueVoiceEvent('status_dialogue_w3_wake_handoff_probe_start', {
      runtime_probe: runtimeProbeMode,
      session_id: probeSessionId,
      transcript,
      phrase_count: nextWakeConfig.wake_word.phrases.length,
      selected_stt_adapter: selectedSttAdapter,
      boundary: 'controlled probe; no microphone recording; no dialogue audio submitted'
    })

    if (!phrase) {
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      setW3WakeStage('error')
      patchWakeDetectorState({
        runtime: 'error',
        enabled: true,
        continuous_listen_enabled: true,
        wake_window_open: false,
        dialogue_triggered: false,
        blocked_reason: 'controlled W3 transcript did not match configured wake phrases'
      })
      logStatusDialogueVoiceEvent('status_dialogue_w3_wake_handoff_probe_complete', {
        runtime_probe: runtimeProbeMode,
        session_id: probeSessionId,
        success: false,
        reason: 'wake phrase not matched',
        latency_ms: Math.max(0, Math.round(endedAt - startedAt)),
        boundary: 'controlled probe complete'
      })
      return
    }

    setW3WakeStage('wake_window')
    patchWakeDetectorState({
      runtime: 'ready',
      enabled: true,
      continuous_listen_enabled: true,
      wake_window_open: true,
      last_detected_phrase: phrase,
      confidence: 0.92,
      dialogue_triggered: false,
      blocked_reason: `controlled wake phrase detected: ${phrase}`
    })
    logStatusDialogueVoiceEvent('w3_wake_detected', {
      runtime_probe: runtimeProbeMode,
      session_id: probeSessionId,
      phrase,
      transcript,
      stage: 'wake_window',
      adapter_id: nextDetectorConfig.adapter_id,
      wake_window_ms: nextWakeConfig.wake_word.wake_window_ms,
      selected_stt_adapter: selectedSttAdapter,
      boundary: 'controlled_wake_window_only_then_existing_stt'
    })
    publishXiaozhiBridgeEvent('listen_detect', {
      sessionId: probeSessionId,
      emotion: 'warm',
      text: `controlled wake phrase detected: ${phrase}`,
      refs: ['voice.wake_detector_adapter', 'browser_phrase_match_reserved', 'runtime_probe.w3_wake_handoff']
    })

    window.setTimeout(() => {
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      setW3WakeStage('handoff_stt')
      patchWakeDetectorState({
        runtime: 'ready',
        enabled: true,
        continuous_listen_enabled: true,
        wake_window_open: true,
        last_detected_phrase: phrase,
        confidence: 0.92,
        dialogue_triggered: true,
        blocked_reason: `controlled wake phrase ${phrase} handed off to ${selectedSttAdapter} STT`
      })
      logStatusDialogueVoiceEvent('w3_wake_handoff_stt', {
        runtime_probe: runtimeProbeMode,
        session_id: probeSessionId,
        phrase,
        stage: 'handoff_stt',
        selected_stt_adapter: selectedSttAdapter,
        input_mode: nextWakeConfig.voice_input_mode,
        boundary: 'controlled_probe_does_not_start_microphone'
      })
      logStatusDialogueVoiceEvent('status_dialogue_w3_wake_handoff_probe_complete', {
        runtime_probe: runtimeProbeMode,
        session_id: probeSessionId,
        success: true,
        phrase,
        selected_stt_adapter: selectedSttAdapter,
        latency_ms: Math.max(0, Math.round(endedAt - startedAt)),
        boundary: 'controlled probe complete; production path still calls existing startSpeechRecognition'
      })
    }, 80)
  }, [patchWakeDetectorState, publishXiaozhiBridgeEvent, runtimeProbeMode, selectedSttAdapter])

  useEffect(() => {
    if (!wakeDetectorEnabledRef.current) return
    const playbackActive =
      xiaozhiBridgeState.speaking_active ||
      voiceLatency.stage === 'ack' ||
      voiceLatency.stage === 'tts_generating' ||
      voiceLatency.stage === 'playing'
    if (playbackActive) {
      stopWakeDetectorRecognition()
      setW3WakeStage('paused_tts')
      patchWakeDetectorState({
        runtime: 'ready',
        enabled: true,
        continuous_listen_enabled: true,
        wake_window_open: false,
        blocked_reason: 'TTS playback active; wake detector paused only'
      })
      return
    }
    if (!voiceListening && w3WakeStage === 'paused_tts') {
      startW3WakeDetectorLoop()
    }
  }, [
    patchWakeDetectorState,
    startW3WakeDetectorLoop,
    stopWakeDetectorRecognition,
    voiceLatency.stage,
    voiceListening,
    w3WakeStage,
    xiaozhiBridgeState.speaking_active
  ])

  const playCompletionNoticeOnce = useCallback(
    async (text: string, sourceOutputId: string): Promise<VoiceOutputTrace> => {
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const voiceProfile = audibleVoiceProfile
      const output: StatusDialogueOutput = {
        reply: text,
        voiceText: text,
        thoughts: ['completion notice'],
        source: 'completion notice',
        statusRefs: ['voice.completion_notice'],
        missingStatus: [],
        mode: DEFAULT_STATUS_DIALOGUE_CONFIG.mode
      }
      const plan = buildVoiceResponsePlan({ output, sourceOutputId, voiceProfile })
      const noticePolicy = deriveVoiceEmotionPriority({
        intent: 'completion_notice',
        globalStatus: statusSnapshotState.snapshot.global_status
      })
      {
        const result = await playVoicePlanThroughQueue({
          plan,
          voiceProfile,
          sourceOutputId,
          kind: 'notice',
          priority: noticePolicy.priority,
          bridgeEmotion: 'warm',
          emotionHint: noticePolicy.emotion_hint,
          totalStartedAt: startedAt
        })
        setCompletionNoticeState((current) => ({
          ...current,
          status: result.trace.status,
          last_trace: result.trace,
          error: result.trace.error_summary,
          updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
        }))
        return result.trace
      }
    },
    [
      audibleVoiceProfile,
      prepareVoicePlaybackAudio,
      playVoicePlanThroughQueue,
      publishXiaozhiBridgeEvent,
      rememberVoicePlayback,
      selectedVoiceProfile,
      statusSnapshotState.snapshot.global_status,
      voiceOutputMode,
      voiceProfiles
    ]
  )

  const playCompletionNotice = useCallback(
    async (text = completionNoticeText, repeatCount = completionNoticeState.repeat_count) => {
      unlockVoicePlayback()
      const normalizedText = compactVoiceWhitespace(text || DEFAULT_COMPLETION_NOTICE_TEXT)
      const safeRepeatCount = Math.min(3, Math.max(1, Math.round(repeatCount || 1)))
      setVoiceOutputEnabled(true)
      setCompletionNoticeText(normalizedText)
      setCompletionNoticeState({
        status: 'playing',
        text: normalizedText,
        repeat_count: safeRepeatCount,
        completed_count: 0,
        updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
      })
      const completionSessionId = `completion-notice-${Date.now()}`
      beginVoiceOutputSession(completionSessionId)
      let lastTrace: VoiceOutputTrace | undefined
      for (let index = 0; index < safeRepeatCount; index += 1) {
        const sourceOutputId = `${completionSessionId}-${index + 1}`
        lastTrace = await playCompletionNoticeOnce(normalizedText, sourceOutputId)
        setCompletionNoticeState((current) => ({
          ...current,
          completed_count: index + 1,
          last_trace: lastTrace,
          status: lastTrace?.status ?? current.status,
          error: lastTrace?.error_summary,
          updated_at: new Date().toLocaleTimeString('zh-CN', { hour12: false })
        }))
      }
      return lastTrace
    },
    [
      beginVoiceOutputSession,
      completionNoticeState.repeat_count,
      completionNoticeText,
      playCompletionNoticeOnce,
      setVoiceOutputEnabled,
      unlockVoicePlayback
    ]
  )

  useEffect(() => {
    return () => {
      wakeDetectorEnabledRef.current = false
      stopWakeDetectorRecognition()
      if (wakeWindowTimerRef.current !== undefined) {
        window.clearTimeout(wakeWindowTimerRef.current)
        wakeWindowTimerRef.current = undefined
      }
      if (chromeSttSessionRef.current && typeof window.electron?.invoke === 'function') {
        void window.electron.invoke('zhineng:status-dialogue:chrome-stt:cancel', {
          session_id: chromeSttSessionRef.current
        })
      }
      chromeSttSessionRef.current = null
      localSpeechRecorderRef.current?.cancel()
      localSpeechRecorderRef.current = null
      speechRecognitionRef.current?.abort()
      speechRecognitionRef.current = null
      speechRecognitionDraftRef.current = ''
      if (speechRecognitionSubmitTimerRef.current !== undefined) {
        window.clearTimeout(speechRecognitionSubmitTimerRef.current)
        speechRecognitionSubmitTimerRef.current = undefined
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const selectChildStar = useCallback(
    (star: GraphStar) => {
      setFocusedTarget({ node: focusedTarget.node, star, depth: 'star' })
    },
    [focusedTarget.node]
  )

  const selectNebulaNode = useCallback((node: GraphPoint) => {
    setFocusedTarget({ node, depth: 'module' })
  }, [])

  const toggleStarGroup = useCallback((groupName: string) => {
    setCollapsedStarGroups((prev) => ({
      ...prev,
      [groupName]: !(prev[groupName] ?? false)
    }))
  }, [])

  const returnToModule = useCallback(() => {
    setFocusedTarget({
      node: focusedTarget.star ? focusedTarget.node : graphNodes[0],
      depth: focusedTarget.star ? 'module' : 'global'
    })
  }, [focusedTarget, graphNodes])

  const focusedNode = focusedTarget.node
  const focusedTitle = getGraphFocusTitle(focusedTarget)
  const focusedStatus = getGraphFocusStatus(focusedTarget)
  const focusedDetail = getGraphFocusDetail(focusedTarget)
  const focusedWeight = getGraphFocusWeight(focusedTarget)
  const focusedIo = getGraphFocusIo(focusedTarget)
  const focusedStageSurface = focusedTarget.star?.controlSurface
  const entityWorkStatusCounts = entityWorkProjection?.status?.status_counts || {}
  const entityWorkStatusSummary = Object.entries(entityWorkStatusCounts)
    .slice(0, 3)
    .map(([status, count]) => `${status} ${count}`)
    .join(' / ')
  const focusDepthLabel =
    focusedTarget.depth === 'global'
      ? 'global layer'
      : focusedTarget.depth === 'module'
        ? 'nebula layer'
        : 'content star layer'
  const statusSnapshot = statusSnapshotState.snapshot
  const systemEventSnapshot = systemEventSnapshotState.snapshot
  const runtimeVoiceDiagnostic = runtimeVoiceDiagnosticState.diagnostic
  const runtimeVoiceDiagnosticRemoteMissing = runtimeVoiceDiagnostic.summary.remote_config_missing ?? []
  const runtimeVoiceDiagnosticEntry =
    runtimeVoiceDiagnostic.summary.pre_entry ?? runtimeVoiceDiagnostic.summary.post_entry ?? 'unknown'
  const runtimeVoiceDiagnosticEntrySnapshot = runtimeVoiceDiagnostic.summary.entry_snapshot
  const runtimeVoiceDiagnosticButtonCenter = runtimeVoiceDiagnosticEntrySnapshot?.stt_button_center
  const runtimeVoiceDiagnosticButtonHit = runtimeVoiceDiagnosticEntrySnapshot?.stt_button_center_hit
  const runtimeVoiceDiagnosticButtonCenterLabel =
    runtimeVoiceDiagnosticButtonCenter?.x !== undefined && runtimeVoiceDiagnosticButtonCenter.y !== undefined
      ? `${Math.round(runtimeVoiceDiagnosticButtonCenter.x)},${Math.round(runtimeVoiceDiagnosticButtonCenter.y)}`
      : 'unknown'
  const runtimeVoiceDiagnosticButtonHitLabel =
    runtimeVoiceDiagnosticButtonHit?.tag || runtimeVoiceDiagnosticButtonHit?.aria_label || runtimeVoiceDiagnosticButtonHit?.text
      ? [runtimeVoiceDiagnosticButtonHit?.tag, runtimeVoiceDiagnosticButtonHit?.aria_label ?? runtimeVoiceDiagnosticButtonHit?.text]
          .filter(Boolean)
          .join('/')
      : 'unknown'
  const runtimeVoiceDiagnosticButtonStateLabel = runtimeVoiceDiagnosticEntrySnapshot
    ? `${runtimeVoiceDiagnosticEntrySnapshot.stt_button_found === false ? 'missing' : 'visible'} / ${
        runtimeVoiceDiagnosticEntrySnapshot.stt_button_disabled ? 'disabled' : 'enabled'
      }`
    : 'unknown'
  const runtimeVoiceDiagnosticEntryLabel =
    runtimeVoiceDiagnosticEntry.length > 28
      ? `${runtimeVoiceDiagnosticEntry.slice(0, 25)}...`
      : runtimeVoiceDiagnosticEntry
  const runtimeVoiceDiagnosticNextLabel =
    runtimeVoiceDiagnostic.next_action && runtimeVoiceDiagnostic.next_action.length > 36
      ? `${runtimeVoiceDiagnostic.next_action.slice(0, 33)}...`
      : runtimeVoiceDiagnostic.next_action ?? 'none'
  const runtimeVoiceDiagnosticLabel =
    runtimeVoiceDiagnostic.result === 'incomplete'
      ? 'incomplete'
      : runtimeVoiceDiagnostic.result === 'runtime_voice_diagnostic_not_loaded'
        ? 'not loaded'
        : runtimeVoiceDiagnostic.result
  const runtimeVoiceDiagnosticTitle = [
    `source=${runtimeVoiceDiagnosticState.source}`,
    `result=${runtimeVoiceDiagnostic.result}`,
    `entry=${runtimeVoiceDiagnosticEntry}`,
    `entry_result=${runtimeVoiceDiagnostic.summary.entry_diagnosis_result ?? 'unknown'}`,
    `button=${runtimeVoiceDiagnosticButtonStateLabel}`,
    `button_center=${runtimeVoiceDiagnosticButtonCenterLabel}`,
    `button_hit=${runtimeVoiceDiagnosticButtonHitLabel}`,
    `turns=${runtimeVoiceDiagnostic.summary.turns ?? 'unknown'}`,
    `next=${runtimeVoiceDiagnostic.next_action ?? 'none'}`,
    `remote_missing=${runtimeVoiceDiagnosticRemoteMissing.join(', ') || 'none'}`,
    `goal=${runtimeVoiceDiagnostic.summary.goal_result ?? 'unknown'}`
  ].join(' | ')
  const speechPorts = useMemo(
    () =>
      buildStatusDialogueSpeechPortsState(DEFAULT_STATUS_DIALOGUE_CONFIG, {
        speechSynthesisAvailable: typeof window !== 'undefined' && 'speechSynthesis' in window,
        speechRecognitionAvailable: Boolean(getBrowserSpeechRecognitionConstructor()),
        voiceInputEnabled,
        speechInputActive: voiceListening,
        voiceOutputEnabled: voiceEnabled
      }),
    [voiceEnabled, voiceInputEnabled, voiceListening]
  )
  const testSelectedVoice = useCallback(() => {
    unlockVoicePlayback()
    const output = guardStatusDialogueOutput(
      {
        reply: `我正在使用 ${audibleVoiceProfile.display_name}。`,
        voiceText: `我正在使用 ${audibleVoiceProfile.display_name}。`,
        thoughts: ['voice profile test', `adapter: ${audibleVoiceProfile.adapter_id}`, 'browser audible fallback disabled'],
        source: 'voice profile test',
        statusRefs: ['voice.voice_profile'],
        missingStatus: [],
        mode: DEFAULT_STATUS_DIALOGUE_CONFIG.mode
      },
      {
        perspective: dialoguePerspective,
        config: DEFAULT_STATUS_DIALOGUE_CONFIG,
        statusSnapshot,
        fallbackSource: STATUS_DIALOGUE_LOCAL_FALLBACK_ADAPTER_ID
      }
    )
    beginVoiceOutputSession('voice-profile-test')
    speakDialogue(output, 'voice-profile-test')
  }, [audibleVoiceProfile, beginVoiceOutputSession, dialoguePerspective, speakDialogue, statusSnapshot, unlockVoicePlayback])
  const latestSystemMessage = [...dialogueMessages].reverse().find((message) => message.role === 'system')
  const modelSourceLabel = latestSystemMessage?.model ?? latestSystemMessage?.source ?? 'local fallback'
  const realEnv = realIntegrationState.env
  const realModelTest = realIntegrationState.modelTest
  const realEnvStatus = realEnv?.status ?? 'unknown'
  const realApiStatus = realModelTest?.status ?? 'unknown'
  const realProviderLabel = realEnv?.provider.provider_label ?? 'unknown'
  const realProviderModel = realEnv?.provider.model ?? 'unknown'
  const realEnvItems = realEnv?.items.slice(0, 4) ?? []
  const electronIpcAvailable = Boolean(window.electron?.invoke)
  const sttRuntimeBoundaryLabel = electronIpcAvailable ? 'desktop ipc' : 'browser preview'
  const sttRuntimeBoundaryTitle = electronIpcAvailable
    ? 'Electron IPC is available; local Whisper STT can be verified through runtime logs.'
    : 'Electron IPC is unavailable; browser preview STT cannot prove local Whisper transcription.'
  const ttsHealth = ttsAdapterState.health
  const ttsHealthLabel = ttsHealth
    ? `${ttsHealth.status}${ttsHealth.latency_ms !== undefined ? ` / ${ttsHealth.latency_ms}ms` : ''}`
    : 'unknown'
  const ttsHealthTitle = ttsHealth
    ? `${ttsHealth.base_url_host} | ${ttsHealth.error ?? 'CosyVoice local adapter'}`
    : 'CosyVoice health not checked'
  const cloudSttHealthLabel =
    cloudSttHealth.status === 'ok'
      ? `ok${cloudSttHealth.last_latency_ms !== undefined ? ` / ${cloudSttHealth.last_latency_ms}ms` : ''}`
      : cloudSttHealth.status === 'listening'
        ? 'listening'
        : cloudSttHealth.last_category === 'none'
          ? cloudSttHealth.status
          : cloudSttHealth.last_category
  const cloudSttHealthTitle = `${cloudSttHealth.status} | ${cloudSttHealth.last_reason ?? 'ready'} | action=${cloudSttHealth.recovery_action} | events=${cloudSttHealth.last_events.join(' / ') || 'none'}`
  const localSttHealth = localSttRuntimeState.health
  const localSttHealthLabel = `${localSttHealth.status}${localSttHealth.latency_ms !== undefined ? ` / ${localSttHealth.latency_ms}ms` : ''}`
  const localSttLastResultLabel = localSttRuntimeState.lastResult
    ? `${localSttRuntimeState.lastResult.adapter_id}${localSttRuntimeState.lastResult.latency_ms !== undefined ? ` / ${localSttRuntimeState.lastResult.latency_ms}ms` : ''}`
    : 'none'
  const localSttHealthTitle = `${localSttHealth.base_url_host} | model=${localSttHealth.model} | loaded=${localSttHealth.loaded_models?.join(', ') || 'none'} | device=${localSttHealth.device ?? 'unknown'} | ${localSttRuntimeState.error ?? localSttHealth.error ?? 'local Whisper persistent service'}`
  const remoteSttHealth = remoteSttRuntimeState.health
  const remoteSttHealthLabel = remoteSttHealth.configured
    ? `${remoteSttHealth.status}${remoteSttHealth.latency_ms !== undefined ? ` / ${remoteSttHealth.latency_ms}ms` : ''}`
    : 'not configured'
  const remoteSttHealthTitle = `${remoteSttHealth.base_url_host} | endpoint=${remoteSttHealth.endpoint_path} | model=${remoteSttHealth.model} | timeout=${remoteSttHealth.timeout_ms}ms | ${remoteSttRuntimeState.error ?? remoteSttHealth.error ?? 'remote OpenAI-compatible STT'}`
  const ttsRuntimePolicyTitle = `${ttsRuntimePolicy.schema} | ${ttsRuntimePolicy.mode} / ${ttsRuntimePolicy.response_format} | ${ttsRuntimePolicy.reason}`
  const ttsRuntimePolicyLabel =
    ttsRuntimePolicy.interactive_ready
      ? 'interactive'
      : ttsRuntimePolicy.role === 'primary_cached_sentence_queue'
        ? 'cached'
        : ttsRuntimePolicy.grade
  const ttsRuntimeCandidates = useMemo<StatusDialogueTtsRuntimeCandidate[]>(
    () =>
      buildDefaultStatusDialogueTtsRuntimeCandidates({
        adapter_id: 'cosyvoice_local_http',
        native_streaming_supported: ttsRuntimePolicy.grade !== 'error',
        first_audio_payload_ms: ttsRuntimePolicy.first_audio_payload_ms,
        total_request_ms: ttsRuntimePolicy.total_stream_ms
      }),
    [ttsRuntimePolicy.first_audio_payload_ms, ttsRuntimePolicy.grade, ttsRuntimePolicy.total_stream_ms]
  )
  const selectedTtsRuntimeCandidate = useMemo(
    () => selectStatusDialogueTtsRuntimeCandidate(ttsRuntimeCandidates),
    [ttsRuntimeCandidates]
  )
  const ttsRuntimeCandidateTitle = `${selectedTtsRuntimeCandidate.label} | ${selectedTtsRuntimeCandidate.role} | ${selectedTtsRuntimeCandidate.recommendation}`
  const selectedTtsRuntimeCandidateLabel =
    selectedTtsRuntimeCandidate.adapter_id === 'cosyvoice_local_http'
      ? 'cosyvoice'
      : selectedTtsRuntimeCandidate.adapter_id === 'custom_streaming_tts_http'
        ? 'custom'
        : selectedTtsRuntimeCandidate.adapter_id === 'openai_compatible_streaming_http'
          ? 'openai-http'
          : 'fallback'
  const missingPreview = statusSnapshot.missing_module_ids.slice(0, 4)
  const stalePreview = statusSnapshot.stale_module_ids.slice(0, 3)
  const conflictPreview = statusSnapshot.conflict_module_ids.slice(0, 3)
  const eventTopPreview = systemEventSnapshot.top_events.slice(0, 3)
  const patrolIndexSummary = statusPatrolIndexState.summary
  const patrolIndexSourceHashBlocked = patrolIndexSummary.modules_by_source_hash_status.blocked ?? 0
  const patrolIndexSourceDrift = patrolIndexSummary.modules_by_patrol_state.source_drift ?? 0
  const patrolIndexGateBlocked = Object.entries(patrolIndexSummary.modules_by_gate_decision)
    .filter(([decision]) => /blocked|fail|invalid/i.test(decision))
    .reduce((total, [, count]) => total + count, 0)
  const patrolIndexTitle = [
    `source=${statusPatrolIndexState.source}`,
    `path=${statusPatrolIndexState.indexPath ?? patrolIndexSummary.index_path}`,
    `readable=${patrolIndexSummary.readable}`,
    `gate=${patrolIndexSummary.gate_decision}`,
    `generated=${patrolIndexSummary.index_generated_at ?? 'unknown'}`,
    `modules=${patrolIndexSummary.modules_total}`,
    `source_drift=${patrolIndexSourceDrift}`,
    `source_hash_blocked=${patrolIndexSourceHashBlocked}`,
    `gate_blocked=${patrolIndexGateBlocked}`,
    `errors=${patrolIndexSummary.read_errors.join(' / ') || 'none'}`
  ].join(' | ')
  const eventBroadcastRequestsPreview = voiceEventBroadcastPanelState.requests.slice(0, 4)
  const eventBroadcastPatchesPreview = voiceEventBroadcastPanelState.patches.slice(0, 3)
  const eventBroadcastQueue = voiceEventBroadcastPanelState.queue
  const eventBroadcastTraceLabel = voiceEventBroadcastPanelState.last_trace
    ? `${voiceEventBroadcastPanelState.last_trace.status}${
        voiceEventBroadcastPanelState.last_trace.latency_ms !== undefined
          ? ` / ${voiceEventBroadcastPanelState.last_trace.latency_ms}ms`
          : ''
      }`
    : 'no trace'
  const eventBroadcastTraceTitle = voiceEventBroadcastPanelState.last_trace
    ? `${voiceEventBroadcastPanelState.last_trace.trace_id} | ${voiceEventBroadcastPanelState.last_trace.error_summary ?? 'ok'}`
    : 'no event broadcast trace yet'
  const eventBroadcastQueueTitle = `${eventBroadcastQueue.schema} | ${voiceEventBroadcastPanelState.source} | ${
    voiceEventBroadcastPanelState.last_error ?? 'ready'
  }`
  const boundaryChips = [
    DEFAULT_STATUS_DIALOGUE_CONFIG.mode,
    DEFAULT_STATUS_DIALOGUE_CONFIG.future_requirement_forwarding.enabled ? 'routing ready' : 'routing off',
    'world write off',
    'action off'
  ]
  const activePatrolFindingCount =
    statusSnapshot.missing_module_ids.length +
    statusSnapshot.stale_module_ids.length +
    statusSnapshot.conflict_module_ids.length +
    statusSnapshot.read_errors.length +
    systemEventSnapshot.events_critical +
    systemEventSnapshot.missing_publishers.length +
    runtimeVoiceDiagnosticRemoteMissing.length +
    (runtimeVoiceDiagnostic.result === 'incomplete' ? 1 : 0) +
    (patrolIndexSummary.readable ? 0 : 1) +
    patrolIndexSourceHashBlocked +
    systemEventSnapshot.read_errors.length
  const voiceTraceStatus = voiceOutputTrace
    ? `${voiceOutputTrace.status}${voiceOutputTrace.latency_ms !== undefined ? ` / ${voiceOutputTrace.latency_ms}ms` : ''}`
    : 'no trace'
  const voiceTraceTitle = voiceOutputTrace
    ? `${voiceOutputTrace.trace_id} | ${voiceOutputTrace.error_summary ?? 'ok'}`
    : 'no voice output yet'
  const xiaozhiBridgeSummary = summarizeXiaozhiStyleBridgeState(xiaozhiBridgeState)
  const xiaozhiBridgeTitle = `${xiaozhiBridgeState.session_id} | ${xiaozhiBridgeState.last_event_type} | boundary: ${xiaozhiBridgeState.route_a_boundary.join(', ')}`
  const wakeConfigTitle = `${wakeConfig.schema} | phrases: ${wakeConfig.wake_word.phrases.join(', ')} | continuous=${wakeConfig.continuous_listen_enabled}`
  const wakeDetectorTitle = `${wakeDetectorConfig.schema} | stage=${w3WakeStage} | adapter=${wakeDetectorConfig.adapter_id} | enabled=${wakeDetectorConfig.enabled} | tts=${wakeDetectorState.tts_playback_policy} | input=${wakeDetectorState.input_during_tts_policy} | ${wakeDetectorState.blocked_reason || 'ready'}`
  const completionNoticeTitle = `${completionNoticeState.status} | ${completionNoticeState.completed_count}/${completionNoticeState.repeat_count} | ${completionNoticeState.error ?? 'ready'}`
  const completionNoticeTraceLabel = completionNoticeState.last_trace
    ? `${completionNoticeState.last_trace.status}${completionNoticeState.last_trace.latency_ms !== undefined ? ` / ${completionNoticeState.last_trace.latency_ms}ms` : ''}`
    : 'no trace'
  const vadPrecheckTitle = `${vadPrecheckState.reason} | checked ${formatVoiceLatencyMs(vadPrecheckState.checked_ms)} | voice ${formatVoiceLatencyMs(vadPrecheckState.voice_ms)} | peak ${formatAudioLevel(vadPrecheckState.peak_level)}`
  const conversationMemoryTitle = `${conversationMemory.storage_key} | ${conversationMemory.updated_at}`
  const conversationMemoryFacts = conversationMemory.confirmed_facts.slice(0, 2)
  const conversationMemoryOpen = conversationMemory.open_questions.slice(0, 2)
  const conversationMemoryFocus = conversationMemory.user_focus.slice(0, 3)
  const focusedStarGroups = useMemo(() => {
    const groups = new Map<string, GraphStar[]>()
    for (const star of focusedNode.stars) {
      const groupName = star.group || '核心节点'
      groups.set(groupName, [...(groups.get(groupName) || []), star])
    }
    const preferredOrder = ['专家矩阵', '目标与策略', '权重与评估', '风险与发送门阀', '核心节点']
    return [...groups.entries()]
      .sort(([a], [b]) => {
        const ai = preferredOrder.indexOf(a)
        const bi = preferredOrder.indexOf(b)
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
        return a.localeCompare(b, 'zh-CN')
      })
      .map(([groupName, stars]) => ({
        groupName,
        stars,
        collapsed: collapsedStarGroups[groupName] === true
      }))
  }, [collapsedStarGroups, focusedNode.stars])

  return (
    <div className="zg-graph-window">
      <header className="zg-graph-header">
        <div>
          <strong>世界系统三维粒子 OS</strong>
          <span>独立视觉投影 · 暂不接入真实人际和事件图谱</span>
        </div>
        <nav className="zg-graph-actions" aria-label="星云主页操作">
          <button
            className="zg-graph-icon-button"
            type="button"
            onClick={openGraphSettings}
            aria-label="打开设置"
            title="打开设置"
          >
            <GearLineIcon />
          </button>
          <button
            className="zg-graph-icon-button"
            type="button"
            onClick={openSocialAssistantConfig}
            aria-label="打开人类社交辅助系统配置"
            title="打开人类社交辅助系统配置"
          >
            <HumanConfigIcon />
          </button>
          <button className="zg-graph-close-button" type="button" onClick={closeGraph} aria-label="关闭图谱" title="关闭图谱">×</button>
        </nav>
      </header>
      <main className="zg-graph-stage">
        <ExpandedGraphCanvas focusedTarget={focusedTarget} nodes={graphNodes} onFocus={setFocusedTarget} onHover={setHovered} />
        <aside className="zg-graph-inspector" aria-label="focused particle cloud state">
          <header>
            <span>{focusDepthLabel}</span>
            <strong>{focusedTitle}</strong>
          </header>
          <p>{focusedDetail}</p>
          <dl>
            <div>
              <dt>status</dt>
              <dd>{focusedStatus}</dd>
            </div>
            <div>
              <dt>owner</dt>
              <dd>{getGraphFocusOwner(focusedTarget)}</dd>
            </div>
            <div>
              <dt>gate</dt>
              <dd>{getGraphFocusGate(focusedTarget)}</dd>
            </div>
            <div>
              <dt>compass</dt>
              <dd>{getGraphFocusCompass(focusedTarget)}</dd>
            </div>
            {focusedIo && (
              <>
                <div>
                  <dt>io</dt>
                  <dd>{focusedIo.inputs.slice(0, 2).join(', ')} -&gt; {focusedIo.outputs.slice(0, 2).join(', ')}</dd>
                </div>
                <div>
                  <dt>refs</dt>
                  <dd>{focusedIo.refs.slice(0, 2).join(', ')}</dd>
                </div>
              </>
            )}
          </dl>
          <section className="zg-entity-work-runtime" aria-label="entity work runtime">
            <div>
              <span>entity work</span>
              <strong>{entityWorkMessage}</strong>
            </div>
            <div>
              <span>
                {entityWorkProjection?.status?.stage_count ?? 0} stages
                {entityWorkProjection?.status?.branch_overlays?.length
                  ? ` + ${entityWorkProjection.status.branch_overlays.length} branches`
                  : ''}
              </span>
              <small>{entityWorkStatusSummary || 'static fallback'}</small>
            </div>
            <button type="button" onClick={refreshEntityWorkProjection} disabled={Boolean(entityWorkBusyAction)}>
              refresh
            </button>
          </section>
          {focusedStageSurface && (
            <section className="zg-stage-control-panel" aria-label="cross-border stage controls">
              <header>
                <span>{focusedStageSurface.stage_layer || 'stage'}</span>
                <strong>{Math.round((focusedStageSurface.state.progress || 0) * 100)}%</strong>
              </header>
              <div className="zg-stage-action-grid">
                {focusedStageSurface.actions.map((action) => {
                  const cliAction = getEntityWorkActionCliName(action)
                  const busyKey = `${focusedStageSurface.stage_id}:${cliAction}`
                  const busy = entityWorkBusyAction === busyKey
                  return (
                    <button
                      key={action.action_id}
                      type="button"
                      onClick={() => runEntityWorkStageAction(focusedStageSurface, action)}
                      disabled={!action.allowed || Boolean(entityWorkBusyAction)}
                      title={`${action.risk_level || 'low'} / ${action.blocked_until?.join(', ') || 'ready'}`}
                    >
                      <strong>{busy ? 'running' : action.label}</strong>
                      <span>{action.kind}</span>
                    </button>
                  )
                })}
              </div>
              {Boolean(focusedStageSurface.state.blockers?.length) && (
                <small>{focusedStageSurface.state.blockers?.slice(0, 2).join(' / ')}</small>
              )}
            </section>
          )}
          <details className="zg-nebula-directory">
            <summary>
              <strong>星云目录</strong>
              <span>{Math.max(0, graphNodes.length - 1)} nebulae</span>
            </summary>
            <div>
              {graphNodes.slice(1).map((node) => (
                <button
                  key={node.id}
                  type="button"
                  className={focusedNode.id === node.id && !focusedTarget.star ? 'active' : ''}
                  onClick={() => selectNebulaNode(node)}
                >
                  <strong>{node.label}</strong>
                  <span>{node.status}</span>
                </button>
              ))}
            </div>
          </details>
          <div className="zg-graph-child-cloud">
            {focusedTarget.star ? (
              <>
                <button type="button" onClick={returnToModule}>back to nebula</button>
                <span>weight {Math.round(focusedWeight * 100)} / status-only projection</span>
              </>
            ) : (
              focusedStarGroups.map((group) => (
                <section key={group.groupName} className="zg-star-group">
                  <button
                    className="zg-star-group-toggle"
                    type="button"
                    onClick={() => toggleStarGroup(group.groupName)}
                    aria-expanded={!group.collapsed}
                  >
                    <strong>{group.groupName}</strong>
                    <span>{group.stars.length} nodes / {group.collapsed ? 'collapsed' : 'expanded'}</span>
                  </button>
                  {!group.collapsed && group.stars.map((star) => (
                    <button key={star.id} type="button" onClick={() => selectChildStar(star)}>
                      <strong>{star.label}</strong>
                      <span>{star.status}</span>
                      {star.io && (
                        <small>{star.io.inputs.slice(0, 1).join(', ')} -&gt; {star.io.outputs.slice(0, 1).join(', ')}</small>
                      )}
                    </button>
                  ))}
                </section>
              ))
            )}
          </div>
        </aside>
        <aside
          ref={statusDialoguePanelRef}
          className={`zg-status-dialogue zg-patrol-window ${statusSettingsOpen ? 'settings-open' : ''} ${voiceEntryHighlighted ? 'voice-entry-highlight' : ''}`}
          aria-label="subject status patrol window"
        >
          <header className="zg-patrol-titlebar">
            <div>
              <strong>Subject Status Dialogue</strong>
              <span>read-only / efficiency-first</span>
            </div>
            <div className="zg-patrol-actions">
              <button
                type="button"
                onClick={() => {
                  unlockVoicePlayback()
                  setVoiceOutputEnabled((value) => !value)
                }}
              >
                {voiceEnabled ? 'voice on' : 'voice off'}
              </button>
              <button
                type="button"
                className={`zg-status-settings-button ${statusSettingsOpen ? 'active' : ''}`}
                onClick={() => setStatusSettingsOpen((value) => !value)}
                aria-label="toggle subject status settings"
                aria-expanded={statusSettingsOpen}
                title="status settings"
              >
                ⚙
              </button>
            </div>
          </header>
          <div className="zg-dialogue-perspective" role="group" aria-label="output perspective">
            <button
              type="button"
              className={dialoguePerspective === 'first_person' ? 'active' : ''}
              onClick={() => setDialoguePerspective('first_person')}
            >
              first person
            </button>
            <button
              type="button"
              className={dialoguePerspective === 'third_person' ? 'active' : ''}
              onClick={() => setDialoguePerspective('third_person')}
            >
              third person
            </button>
          </div>
          {statusSettingsOpen && (
            <div className="zg-status-settings-panel" aria-label="subject status settings detail">
              <section className="zg-status-settings-section" aria-label="runtime status">
                <div className="zg-status-settings-section-head">
                  <span>runtime</span>
                  <strong>{voiceLatency.stage}</strong>
                </div>
                <div className="zg-patrol-identity" aria-label="patrol identity state">
                  <span>
                    mode <strong>{DEFAULT_STATUS_DIALOGUE_CONFIG.mode}</strong>
                  </span>
                  <span>
                    model <strong>{modelSourceLabel}</strong>
                  </span>
                  <span>
                    voice <strong>{speechPorts.output.status}</strong>
                  </span>
                </div>
                <div className="zg-patrol-compact-status" aria-label="compact dialogue status">
                  <span title={statusSnapshotState.cardDir ?? statusSnapshotState.source}>
                    snapshot <strong>{statusSnapshotState.source}</strong>
                  </span>
                  <span title={`${audibleVoiceProfile.profile_id} / selected ${selectedVoiceProfile.profile_id}`}>
                    voice <strong>{voiceEnabled ? audibleVoiceProfile.display_name : 'off'}</strong>
                  </span>
                  <span title={cloudSttHealthTitle}>
                    stt <strong>{selectedSttAdapter}/{cloudSttHealthLabel}</strong>
                  </span>
                  <span title={runtimeVoiceDiagnosticTitle}>
                    voice diag <strong>{runtimeVoiceDiagnosticLabel}</strong>
                  </span>
                  <span title={patrolIndexTitle}>
                    patrol index <strong>{patrolIndexSummary.gate_decision}</strong>
                  </span>
                  <span title={voiceTraceTitle}>
                    trace <strong>{voiceTraceStatus}</strong>
                  </span>
                  <span title={systemEventSnapshotState.eventDir ?? systemEventSnapshotState.source}>
                    events <strong>{systemEventSnapshot.events_fresh}/{systemEventSnapshot.events_stale}/{systemEventSnapshot.events_critical}</strong>
                  </span>
                  <span title={ttsRuntimePolicyTitle}>
                    tts path <strong>{ttsRuntimePolicyLabel}</strong>
                  </span>
                  <span title={xiaozhiBridgeTitle}>
                    bridge <strong>{xiaozhiBridgeState.stage}</strong>
                  </span>
                  <span title={continuousVoiceSession.boundary}>
                    loop <strong>{continuousVoiceSession.status}</strong>
                  </span>
                  <span title={`stage ${voiceLatency.stage} / updated ${voiceLatency.updatedAt}`}>
                    latency <strong>{formatVoiceLatencyMs(voiceLatency.totalMs)}</strong>
                  </span>
                  <span title="missing + stale + conflict + read errors">
                    findings <strong>{activePatrolFindingCount}</strong>
                  </span>
                </div>
              </section>
              <section className="zg-status-settings-section" aria-label="runtime voice diagnostic">
                <div className="zg-status-settings-section-head">
                  <span>voice diagnostic</span>
                  <strong title={runtimeVoiceDiagnosticTitle}>{runtimeVoiceDiagnosticLabel}</strong>
                </div>
                <div className="zg-real-phase-grid">
                  <span title={runtimeVoiceDiagnosticTitle}>
                    entry <strong>{runtimeVoiceDiagnosticEntryLabel}</strong>
                  </span>
                  <span title={runtimeVoiceDiagnosticTitle}>
                    button <strong>{runtimeVoiceDiagnosticButtonStateLabel}</strong>
                  </span>
                  <span title={runtimeVoiceDiagnosticTitle}>
                    target <strong>{runtimeVoiceDiagnosticButtonCenterLabel}</strong>
                  </span>
                  <span title={runtimeVoiceDiagnosticTitle}>
                    hit <strong>{runtimeVoiceDiagnosticButtonHitLabel}</strong>
                  </span>
                  <span title={runtimeVoiceDiagnosticTitle}>
                    turns <strong>{runtimeVoiceDiagnostic.summary.turns ?? 'unknown'}</strong>
                  </span>
                  <span title={runtimeVoiceDiagnostic.report_path ?? runtimeVoiceDiagnostic.boundary}>
                    source <strong>{runtimeVoiceDiagnostic.source}</strong>
                  </span>
                  <span title={runtimeVoiceDiagnosticTitle}>
                    goal <strong>{runtimeVoiceDiagnostic.summary.goal_result ?? 'unknown'}</strong>
                  </span>
                </div>
                <div className="zg-patrol-source-row">
                  <span title={runtimeVoiceDiagnosticTitle}>next: {runtimeVoiceDiagnosticNextLabel}</span>
                  <span title={runtimeVoiceDiagnosticTitle}>
                    remote missing: {runtimeVoiceDiagnosticRemoteMissing.length > 0 ? runtimeVoiceDiagnosticRemoteMissing.join(', ') : 'none'}
                  </span>
                </div>
                {runtimeVoiceDiagnosticState.error && (
                  <div className="zg-patrol-alerts" aria-label="runtime voice diagnostic error">
                    <span>{runtimeVoiceDiagnosticState.error}</span>
                  </div>
                )}
              </section>
              <section className="zg-voice-profile-panel" aria-label="voice profile settings">
                <div className="zg-voice-profile-header">
                  <span>voice profile</span>
                  <strong title={`${audibleVoiceProfile.display_name} / selected ${selectedVoiceProfile.display_name}`}>
                    {audibleVoiceProfile.display_name}
                  </strong>
                </div>
                <div className="zg-voice-profile-controls">
                  <select
                    value={selectedVoiceProfile.profile_id}
                    onChange={(event) => setSelectedVoiceProfileId(event.target.value)}
                    aria-label="voice profile"
                  >
                    {voiceProfiles.map((profile) => (
                      <option key={profile.profile_id} value={profile.profile_id}>
                        {profile.display_name}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={testSelectedVoice} disabled={!voiceEnabled}>
                    test
                  </button>
                  <button
                    type="button"
                    onClick={replayLastVoicePlayback}
                    disabled={!voiceEnabled || lastVoicePlaybackLabel === 'none'}
                    title={`last generated voice: ${lastVoicePlaybackLabel}`}
                  >
                    replay
                  </button>
                </div>
                <div className="zg-voice-mode-controls">
                  <label>
                    <span>voice mode</span>
                    <select
                      value={voiceOutputMode}
                      onChange={(event) => setVoiceOutputMode(event.target.value as StatusDialogueVoiceOutputMode)}
                      aria-label="voice output mode"
                    >
                      <option value="cosyvoice_short">chunked short</option>
                      <option value="cosyvoice_full">chunked full</option>
                      <option value="cosyvoice_stream_assembled">stream assembled</option>
                      <option value="cosyvoice_stream_live_pcm">stream live pcm</option>
                      <option value="edge_readaloud_stream">edge stream low latency</option>
                    </select>
                  </label>
                  <label>
                    <span>STT adapter</span>
                    <select
                      value={selectedSttAdapter}
                      onChange={(event) => selectSttAdapter(event.target.value as StatusDialogueSttAdapterMode, 'operator_select')}
                      aria-label="speech to text adapter"
                    >
                      <option value="cloud">cloud</option>
                      <option value="local">local</option>
                      <option value="remote">remote</option>
                    </select>
                  </label>
                  <label>
                    <span>STT model</span>
                    <select
                      value={selectedSttModel}
                      onChange={(event) => setSelectedSttModel(event.target.value as StatusDialogueSttModel)}
                      aria-label="speech to text model"
                    >
                      <option value="base">base</option>
                      <option value="tiny">tiny</option>
                    </select>
                  </label>
                </div>
                <div className="zg-real-actions">
                  <button type="button" onClick={refreshTtsAdapterHealth} disabled={ttsAdapterState.busy}>
                    {ttsAdapterState.busy ? 'checking' : 'check tts'}
                  </button>
                  <span className={ttsHealth?.status ?? 'fallback'} title={ttsHealthTitle}>
                    cosyvoice <strong>{ttsHealthLabel}</strong>
                  </span>
                </div>
                <div className="zg-voice-profile-meta">
                  <span>{audibleVoiceProfile.locale}</span>
                  <span>{audibleVoiceProfile.adapter_id}</span>
                  <span title="browser speech output is disabled for audible playback">locked same voice</span>
                  <span>clone {DEFAULT_UNCONFIGURED_CLONE_PROFILE.status}</span>
                  <span title={ttsRuntimePolicyTitle}>runtime {ttsRuntimePolicyLabel}</span>
                  <span title={voiceTraceTitle}>last {voiceTraceStatus}</span>
                </div>
                <div className="zg-real-phase-grid" aria-label="voice playback queue state">
                  <span title={voicePlaybackQueueState.active_chunk_id ?? voicePlaybackQueueState.session_id}>
                    queue <strong>{voicePlaybackQueueState.status}</strong>
                  </span>
                  <span>
                    chunks <strong>{voicePlaybackQueueState.completed_count}/{voicePlaybackQueueState.queued_count}</strong>
                  </span>
                  <span>
                    cache <strong>{voicePlaybackQueueState.cached_count}/{voiceAudioCacheRef.current.size}</strong>
                  </span>
                  <span title={voicePlaybackQueueState.last_error ?? voiceLatencyTrace.slowest_stage ?? 'queue ready'}>
                    fail <strong>{voicePlaybackQueueState.failed_count}</strong>
                  </span>
                  <span title={ttsRuntimePolicyTitle}>
                    policy <strong>{ttsRuntimePolicyLabel}</strong>
                  </span>
                  <span title={ttsRuntimePolicyTitle}>
                    first audio <strong>{formatVoiceLatencyMs(ttsRuntimePolicy.first_audio_payload_ms)}</strong>
                  </span>
                  <span title={ttsRuntimeCandidateTitle}>
                    candidate <strong>{selectedTtsRuntimeCandidateLabel}</strong>
                  </span>
                  <span title={ttsRuntimeCandidates.map((candidate) => `${candidate.label}: ${candidate.role}`).join(' / ')}>
                    slots <strong>{ttsRuntimeCandidates.length}</strong>
                  </span>
                </div>
              </section>
              <section className="zg-status-settings-section" aria-label="xiaozhi style voice bridge">
                <div className="zg-status-settings-section-head">
                  <span>xiaozhi bridge</span>
                  <strong title={xiaozhiBridgeTitle}>{xiaozhiBridgeState.stage}</strong>
                </div>
                <div className="zg-real-phase-grid">
                  <span title={xiaozhiBridgeSummary}>
                    emotion <strong>{xiaozhiBridgeState.emotion}</strong>
                  </span>
                  <span>
                    listen <strong>{xiaozhiBridgeState.listen_active ? 'on' : 'off'}</strong>
                  </span>
                  <span>
                    speak <strong>{xiaozhiBridgeState.speaking_active ? 'on' : 'off'}</strong>
                  </span>
                  <span title={xiaozhiBridgeState.last_sentence || xiaozhiBridgeState.transcript_preview || 'no bridge payload yet'}>
                    events <strong>{xiaozhiBridgeState.event_count}</strong>
                  </span>
                </div>
                <div className="zg-patrol-source-row">
                  <span title={xiaozhiBridgeTitle}>route A virtual desktop device</span>
                  <span>{xiaozhiBridgeState.last_event_type}</span>
                </div>
                <div className="zg-real-phase-grid">
                  <span title={wakeConfigTitle}>
                    input <strong>{wakeConfig.voice_input_mode}</strong>
                  </span>
                  <span title={wakeConfigTitle}>
                    wake <strong>{wakeConfig.wake_word.enabled ? 'on' : 'off'}</strong>
                  </span>
                  <span title={wakeConfig.wake_word.phrases.join(' / ')}>
                    phrase <strong>{wakeConfig.wake_word.phrases[0]}</strong>
                  </span>
                  <span title={vadPrecheckTitle}>
                    vad <strong>{vadPrecheckState.status}</strong>
                  </span>
                </div>
                <div className="zg-real-phase-grid">
                  <span title={wakeDetectorTitle}>
                    detector <strong>{wakeDetectorConfig.adapter_id}</strong>
                  </span>
                  <span title={wakeDetectorTitle}>
                    w3 <strong>{w3WakeStage}</strong>
                  </span>
                  <span title={wakeDetectorTitle}>
                    window <strong>{wakeDetectorState.wake_window_open ? 'open' : 'closed'}</strong>
                  </span>
                  <span title={wakeDetectorTitle}>
                    gate <strong>{wakeDetectorConfig.tts_playback_gate_required ? 'wake pause' : 'none'}</strong>
                  </span>
                </div>
                <div className="zg-real-phase-grid" aria-label="continuous voice session status">
                  <span title={continuousVoiceSession.boundary}>
                    loop <strong>{continuousVoiceSession.enabled ? 'on' : 'off'}</strong>
                  </span>
                  <span title={continuousVoiceSession.last_reason ?? 'idle'}>
                    state <strong>{continuousVoiceSession.status}</strong>
                  </span>
                  <span title={continuousVoiceSession.next_resume_at ?? 'no scheduled resume'}>
                    resumes <strong>{continuousVoiceSession.resumed_count}</strong>
                  </span>
                  <span title={`resume delay ${continuousVoiceSession.resume_delay_ms}ms`}>
                    delay <strong>{continuousVoiceSession.resume_delay_ms}ms</strong>
                  </span>
                </div>
                <div className="zg-real-actions">
                  <button
                    type="button"
                    onClick={toggleW3WakeDetector}
                    title="Toggle W3 browser phrase detector. It only opens the wake window, then hands off to the existing STT path."
                  >
                    {wakeDetectorConfig.enabled ? 'stop w3' : 'start w3'}
                  </button>
                  <button
                    type="button"
                    onClick={toggleContinuousVoiceSession}
                    title="Toggle continuous formal STT loop. This disables W3 detector while active and reuses the existing STT path."
                  >
                    {continuousVoiceSession.enabled ? 'stop loop' : 'start loop'}
                  </button>
                  <button
                    type="button"
                    onClick={runVadPrecheck}
                    disabled={vadPrecheckState.active || xiaozhiBridgeState.speaking_active}
                    title="Run a local microphone energy precheck only; it will not submit dialogue or store audio."
                  >
                    {vadPrecheckState.active ? 'checking vad' : 'check vad'}
                  </button>
                  <span title={vadPrecheckTitle}>
                    peak <strong>{formatAudioLevel(vadPrecheckState.peak_level)}</strong>
                  </span>
                  <span title={vadPrecheckTitle}>
                    voice <strong>{formatVoiceLatencyMs(vadPrecheckState.voice_ms)}</strong>
                  </span>
                </div>
              </section>
              <section className="zg-status-settings-section" aria-label="completion notice broadcast">
                <div className="zg-status-settings-section-head">
                  <span>completion notice</span>
                  <strong title={completionNoticeTitle}>{completionNoticeState.status}</strong>
                </div>
                <div className="zg-completion-notice-controls">
                  <input
                    type="text"
                    value={completionNoticeText}
                    onChange={(event) => setCompletionNoticeText(event.target.value)}
                    aria-label="completion notice text"
                    title="Completion notice text"
                  />
                  <button
                    type="button"
                    onClick={() => void playCompletionNotice()}
                    disabled={completionNoticeState.status === 'playing'}
                    title="Play the task completion notice through the locked voice output queue."
                  >
                    play
                  </button>
                </div>
                <div className="zg-real-phase-grid">
                  <span title={completionNoticeTitle}>
                    count <strong>{completionNoticeState.completed_count}/{completionNoticeState.repeat_count}</strong>
                  </span>
                  <span title={completionNoticeTitle}>
                    trace <strong>{completionNoticeTraceLabel}</strong>
                  </span>
                  <span title={completionNoticeState.error ?? 'no error'}>
                    error <strong>{completionNoticeState.error ? 'yes' : 'none'}</strong>
                  </span>
                  <span title="uses selected voice profile and existing TTS fallback">
                    route <strong>tts</strong>
                  </span>
                </div>
              </section>
              <section className="zg-status-settings-section" aria-label="patrol card status">
                <div className="zg-status-settings-section-head">
                  <span>snapshot</span>
                  <strong>{statusSnapshot.global_status}</strong>
                </div>
                <div className={`zg-patrol-summary ${statusSnapshot.global_status}`} aria-label="patrol status summary">
                  <div>
                    <span>global</span>
                    <strong>{statusSnapshot.global_status}</strong>
                  </div>
                  <div>
                    <span>fresh</span>
                    <strong>{statusSnapshot.cards_fresh}</strong>
                  </div>
                  <div>
                    <span>stale</span>
                    <strong>{statusSnapshot.cards_stale}</strong>
                  </div>
                  <div>
                    <span>missing</span>
                    <strong>{statusSnapshot.cards_missing}</strong>
                  </div>
                </div>
              </section>
              <section className="zg-status-settings-section" aria-label="system event feedback status">
                <div className="zg-status-settings-section-head">
                  <span>events</span>
                  <strong>{systemEventSnapshot.events_critical > 0 ? 'critical' : systemEventSnapshot.events_total > 0 ? 'active' : 'quiet'}</strong>
                </div>
                <div className="zg-real-phase-grid">
                  <span title={systemEventSnapshotState.eventDir ?? systemEventSnapshotState.source}>
                    source <strong>{systemEventSnapshotState.source}</strong>
                  </span>
                  <span>
                    fresh <strong>{systemEventSnapshot.events_fresh}</strong>
                  </span>
                  <span>
                    stale <strong>{systemEventSnapshot.events_stale}</strong>
                  </span>
                  <span>
                    critical <strong>{systemEventSnapshot.events_critical}</strong>
                  </span>
                </div>
                <div className="zg-real-phase-grid">
                  <span title={eventBroadcastQueueTitle}>
                    queue <strong>{eventBroadcastQueue.status}</strong>
                  </span>
                  <span title={eventBroadcastQueue.next_request_id ?? 'no queued request'}>
                    req <strong>{eventBroadcastQueue.queued_count}</strong>
                  </span>
                  <span title={`critical ${eventBroadcastQueue.critical_count} / high ${eventBroadcastQueue.high_count}`}>
                    urgent <strong>{eventBroadcastQueue.critical_count}/{eventBroadcastQueue.high_count}</strong>
                  </span>
                  <span title={eventBroadcastTraceTitle}>
                    trace <strong>{eventBroadcastTraceLabel}</strong>
                  </span>
                </div>
                <div className="zg-real-actions">
                  <button type="button" onClick={refreshSystemEventSnapshot}>
                    refresh events
                  </button>
                  <button
                    type="button"
                    onClick={() => void replayVoiceEventBroadcastQueue()}
                    disabled={!voiceEnabled || voiceEventBroadcastPanelState.patches.filter((patch) => patch.play_mode !== 'silent').length === 0}
                    title="Replay the current voice_event_broadcast queue through the locked TTS queue."
                  >
                    play queue
                  </button>
                </div>
                <div className="zg-real-check-list">
                  {eventTopPreview.length === 0 && <span>no module_status_event.v1 loaded</span>}
                  {eventTopPreview.map((event) => (
                    <span key={event.event_id} className={event.severity} title={`${event.compass} | ${event.gate}`}>
                      {event.severity}: {event.headline}
                    </span>
                  ))}
                  {systemEventSnapshot.missing_publishers.length > 0 && (
                    <span title={systemEventSnapshot.missing_publishers.join(', ')}>
                      missing publishers: {systemEventSnapshot.missing_publishers.length}
                    </span>
                  )}
                  {systemEventSnapshot.read_errors.length > 0 && (
                    <span className="warn" title={systemEventSnapshot.read_errors.join(' | ')}>
                      event errors: {systemEventSnapshot.read_errors.length}
                    </span>
                  )}
                </div>
                <div className="zg-event-broadcast-list" aria-label="voice event broadcast queue">
                  {eventBroadcastRequestsPreview.length === 0 && <span>broadcast queue idle</span>}
                  {eventBroadcastRequestsPreview.map((request) => (
                    <span key={request.request_id} className={request.weight} title={`${request.requested_play_mode} | ${request.status_refs.join(' / ')}`}>
                      {request.weight}: {request.one_sentence_summary}
                    </span>
                  ))}
                </div>
                <div className="zg-event-broadcast-list" aria-label="voice event script patches">
                  {eventBroadcastPatchesPreview.length === 0 && <span>no voice_script_patch.v1 ready</span>}
                  {eventBroadcastPatchesPreview.map((patch) => (
                    <span key={patch.patch_id} className={patch.emotion_hint} title={`${patch.play_mode} | ${patch.source_request_id}`}>
                      {patch.play_mode}: {patch.voice_text}
                    </span>
                  ))}
                </div>
                <div className="zg-patrol-source-row">
                  <span title={eventBroadcastQueueTitle}>broadcast source: {voiceEventBroadcastPanelState.source}</span>
                  <span title={voiceEventBroadcastPanelState.last_replay_at ?? 'not replayed'}>
                    replay {voiceEventBroadcastPanelState.replay_count}
                  </span>
                </div>
              </section>
              <div className="zg-real-integration" aria-label="real phase 0 and phase 1 status">
                <div className="zg-real-phase-grid">
                  <span className={realEnvStatus}>
                    phase 0 <strong>{realEnvStatus}</strong>
                  </span>
                  <span className={realApiStatus}>
                    phase 1 <strong>{realApiStatus}</strong>
                  </span>
                  <span title={realProviderLabel}>
                    provider <strong>{realProviderLabel}</strong>
                  </span>
                  <span title={realProviderModel}>
                    model <strong>{realProviderModel}</strong>
                  </span>
                </div>
                <div className="zg-real-actions">
                  <button type="button" onClick={refreshRealEnvCheck} disabled={realIntegrationState.envBusy}>
                    {realIntegrationState.envBusy ? 'checking' : 'check env'}
                  </button>
                  <button type="button" onClick={runModelApiProbe} disabled={realIntegrationState.modelBusy}>
                    {realIntegrationState.modelBusy ? 'testing' : 'test api'}
                  </button>
                </div>
                <div className="zg-real-check-list">
                  <span title={realEnv?.generated_at ?? 'not checked'}>source: {realIntegrationState.source}</span>
                  {realEnvItems.map((item) => (
                    <span
                      key={item.id}
                      className={item.status}
                      title={`${item.detail} | input: ${item.input_refs.join(', ')} | output: ${item.output_refs.join(', ')}`}
                    >
                      {item.label}: {item.status}
                    </span>
                  ))}
                  {realModelTest && (
                    <span
                      className={realModelTest.status}
                      title={realModelTest.error ?? realModelTest.reply_preview ?? 'real API probe completed'}
                    >
                      api: {realModelTest.success ? `${realModelTest.latency_ms ?? 0}ms` : 'not ready'}
                    </span>
                  )}
                  {realIntegrationState.error && <span className="fail">{realIntegrationState.error}</span>}
                </div>
              </div>
              <section className="zg-status-settings-section" aria-label="speech input and output status">
                <div className="zg-status-settings-section-head">
                  <span>speech io</span>
                  <strong>{selectedSttAdapter} stt</strong>
                </div>
                <div className="zg-dialogue-speech-ports" aria-label="speech plugin ports">
                  {[speechPorts.input, speechPorts.output].map((port) => (
                    <div key={port.kind} className={`zg-speech-port ${port.status}`} title={`${port.boundary} ${port.fallback_reason}`}>
                      <span>{port.kind.toUpperCase()}</span>
                      <strong>{port.adapter === 'none' ? 'adapter none' : port.adapter}</strong>
                      <small>
                        {port.status} / {port.fallback}
                      </small>
                    </div>
                  ))}
                </div>
                <div
                  className={`zg-dialogue-voice-status ${voiceListening ? 'listening' : voiceError ? 'error' : speechPorts.input.status}`}
                  aria-label="speech transcript state"
                  title={voiceError ?? voiceTranscript ?? speechPorts.input.fallback_reason}
                >
                  <span>{voiceListening ? 'listening' : `mic ${selectedSttAdapter}`}</span>
                  <strong>{voiceTranscript || voiceError || 'speech transcript idle'}</strong>
                </div>
                <div className="zg-real-phase-grid" aria-label="stt runtime boundary status">
                  <span className={electronIpcAvailable ? 'ok' : 'warn'} title={sttRuntimeBoundaryTitle}>
                    runtime <strong>{sttRuntimeBoundaryLabel}</strong>
                  </span>
                  <span title={electronIpcAvailable ? 'voice-flow log is writable' : 'voice-flow log is not writable from browser preview'}>
                    proof <strong>{electronIpcAvailable ? 'runtime log' : 'preview only'}</strong>
                  </span>
                  <span title={selectedSttAdapter === 'local' && !electronIpcAvailable ? 'local adapter needs Electron IPC' : 'selected adapter can use current runtime'}>
                    local proof <strong>{selectedSttAdapter === 'local' && !electronIpcAvailable ? 'unavailable' : 'available'}</strong>
                  </span>
                  <span title={STATUS_DIALOGUE_STT_RUNTIME_FIX_MARKER}>
                    marker <strong>{STATUS_DIALOGUE_STT_RUNTIME_FIX_MARKER.replace('stt-local-observability-', '')}</strong>
                  </span>
                </div>
                <div className="zg-real-phase-grid" aria-label="cloud stt stability status">
                  <span className={cloudSttHealth.status} title={cloudSttHealthTitle}>
                    cloud <strong>{cloudSttHealthLabel}</strong>
                  </span>
                  <span title={cloudSttHealth.last_reason ?? 'ready'}>
                    action <strong>{cloudSttHealth.recovery_action}</strong>
                  </span>
                  <span title={cloudSttHealth.last_events.join(' / ') || 'none'}>
                    events <strong>{cloudSttHealth.last_events.length}</strong>
                  </span>
                  <span title={cloudSttHealth.last_retry_at ?? 'not retried'}>
                    retry <strong>{cloudSttHealth.retry_count}</strong>
                  </span>
                </div>
                <div className="zg-real-phase-grid" aria-label="local stt service health status">
                  <span className={localSttHealth.status === 'ready' ? 'ok' : localSttHealth.status === 'error' ? 'error' : 'warn'} title={localSttHealthTitle}>
                    local <strong>{localSttHealthLabel}</strong>
                  </span>
                  <span title={localSttHealth.loaded_models?.join(', ') || 'no loaded model reported'}>
                    loaded <strong>{localSttHealth.loaded_models?.length ?? 0}</strong>
                  </span>
                  <span title={localSttHealth.device ?? 'device unknown'}>
                    device <strong>{localSttHealth.device ?? 'unknown'}</strong>
                  </span>
                  <span title={localSttRuntimeState.lastResult?.transcript ?? localSttRuntimeState.lastResult?.error ?? 'no local STT result yet'}>
                    last <strong>{localSttLastResultLabel}</strong>
                  </span>
                </div>
                <div className="zg-real-phase-grid" aria-label="remote stt service health status">
                  <span className={remoteSttHealth.status === 'ready' ? 'ok' : remoteSttHealth.status === 'error' ? 'error' : 'warn'} title={remoteSttHealthTitle}>
                    remote <strong>{remoteSttHealthLabel}</strong>
                  </span>
                  <span title={remoteSttHealth.configured ? 'remote STT adapter has base URL and API key configured' : 'remote STT adapter is not configured'}>
                    config <strong>{remoteSttHealth.configured ? 'yes' : 'no'}</strong>
                  </span>
                  <span title={remoteSttHealth.reachable ? 'remote STT host responded to reachability probe' : remoteSttHealth.error ?? 'not reachable'}>
                    reach <strong>{remoteSttHealth.reachable ? 'yes' : 'no'}</strong>
                  </span>
                  <span title={remoteSttHealthTitle}>
                    model <strong>{remoteSttHealth.model}</strong>
                  </span>
                </div>
                <div className="zg-real-actions">
                  <button
                    type="button"
                    onClick={() => {
                      logStatusDialogueVoiceEvent('cloud_stt_retry_one_shot', {
                        selected_adapter: selectedSttAdapter,
                        model: selectedSttModel,
                        reason: 'operator_retry_cloud_without_persisting_adapter'
                      })
                      void startChromeSpeechBridgeTranscription({ retry: true })
                    }}
                    disabled={voiceListening || !cloudSttHealth.retry_available}
                    title={cloudSttHealth.retry_available ? 'retry cloud STT once' : cloudSttHealthTitle}
                  >
                    retry cloud
                  </button>
                  <button
                    type="button"
                    onClick={() => void refreshLocalSttHealth(true)}
                    disabled={localSttRuntimeState.busy}
                    title={localSttHealthTitle}
                  >
                    {localSttRuntimeState.busy ? 'checking local' : 'check local'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void refreshRemoteSttHealth()}
                    disabled={remoteSttRuntimeState.busy}
                    title={remoteSttHealthTitle}
                  >
                    {remoteSttRuntimeState.busy ? 'checking remote' : 'check remote'}
                  </button>
                  <button
                    type="button"
                    onClick={() => selectSttAdapter('local', 'operator_use_local')}
                    disabled={selectedSttAdapter === 'local'}
                    title="switch STT adapter to local Whisper fallback"
                  >
                    use local
                  </button>
                </div>
                <div className="zg-real-phase-grid" aria-label="dialogue input queue status">
                  <span title={dialogueInputQueueState.last_text_preview ?? 'no queued input'}>
                    input queue <strong>{dialogueInputQueueState.queued_count}</strong>
                  </span>
                  <span title={dialogueInputQueueState.last_reason ?? 'idle'}>
                    last <strong>{dialogueInputQueueState.last_kind ?? 'none'}</strong>
                  </span>
                  <span title={dialogueInputQueueState.last_priority ?? 'normal'}>
                    during tts <strong>{dialogueInputQueueState.queued_during_tts_count}</strong>
                  </span>
                  <span title={dialogueInputQueueState.last_echo_boundary ?? 'none'}>
                    echo <strong>{dialogueInputQueueState.last_echo_boundary ?? 'none'}</strong>
                  </span>
                </div>
              </section>
              <section className="zg-status-settings-section" aria-label="voice latency status">
                <div className="zg-status-settings-section-head">
                  <span>latency</span>
                  <strong>{formatVoiceLatencyMs(voiceLatency.totalMs)}</strong>
                </div>
                <div className={`zg-voice-latency-panel ${voiceLatency.stage}`} aria-label="voice latency stages">
                  <span title={voiceLatency.updatedAt}>
                    <em>stage</em>
                    <strong>{voiceLatency.stage}</strong>
                  </span>
                  <span>
                    <em>ack</em>
                    <strong>{formatVoiceLatencyMs(voiceLatency.ackMs)}</strong>
                  </span>
                  <span title={voiceLatency.sttModel}>
                    <em>stt</em>
                    <strong>{formatVoiceLatencyMs(voiceLatency.sttMs)}</strong>
                  </span>
                  <span>
                    <em>model</em>
                    <strong>{formatVoiceLatencyMs(voiceLatency.modelMs)}</strong>
                  </span>
                  <span title={`first ${formatVoiceLatencyMs(voiceLatency.ttsFirstMs)} / total ${formatVoiceLatencyMs(voiceLatency.ttsTotalMs)}`}>
                    <em>tts</em>
                    <strong>{formatVoiceLatencyMs(voiceLatency.ttsFirstMs ?? voiceLatency.ttsMs)}</strong>
                  </span>
                  <span title={`first ${formatVoiceLatencyMs(voiceLatency.playbackFirstMs)} / total ${formatVoiceLatencyMs(voiceLatency.playbackTotalMs)}`}>
                    <em>play</em>
                    <strong>{formatVoiceLatencyMs(voiceLatency.playbackFirstMs ?? voiceLatency.playbackMs)}</strong>
                  </span>
                  <span>
                    <em>total</em>
                    <strong>{formatVoiceLatencyMs(voiceLatency.totalMs)}</strong>
                  </span>
                  <span title={voicePlaybackQueueState.active_chunk_id ?? voicePlaybackQueueState.session_id}>
                    <em>queue</em>
                    <strong>{voicePlaybackQueueState.completed_count}/{voicePlaybackQueueState.queued_count}</strong>
                  </span>
                  <span title={`cached ${voiceLatency.cacheHits ?? 0} / failed ${voiceLatency.failedChunks ?? 0}`}>
                    <em>cache</em>
                    <strong>{voiceLatency.cacheHits ?? 0}</strong>
                  </span>
                </div>
              </section>
              <div className="zg-patrol-source-row" aria-label="snapshot and adapter source">
                <span title={statusSnapshotState.cardDir ?? statusSnapshotState.source}>
                  snapshot: {statusSnapshotState.source}
                </span>
                <span>cards {statusSnapshot.cards_fresh}/{statusSnapshot.cards_stale}/{statusSnapshot.cards_missing}</span>
                <span title={patrolIndexTitle}>
                  patrol index: {patrolIndexSourceHashBlocked} hash blocked / {patrolIndexSourceDrift} drift
                </span>
                <button type="button" onClick={refreshStatusPatrolIndex}>
                  refresh patrol index
                </button>
                {statusSnapshotState.error && <em>{statusSnapshotState.error}</em>}
                {statusPatrolIndexState.error && <em>{statusPatrolIndexState.error}</em>}
              </div>
              <div className="zg-patrol-boundary" aria-label="active patrol boundaries">
                {boundaryChips.map((chip) => (
                  <span key={chip}>{chip}</span>
                ))}
              </div>
              {(missingPreview.length > 0 || stalePreview.length > 0 || conflictPreview.length > 0 || statusSnapshot.read_errors.length > 0) && (
                <div className="zg-patrol-alerts" aria-label="patrol findings">
                  {missingPreview.length > 0 && <span>missing: {missingPreview.join(', ')}</span>}
                  {stalePreview.length > 0 && <span>stale: {stalePreview.join(', ')}</span>}
                  {conflictPreview.length > 0 && <span>conflict: {conflictPreview.join(', ')}</span>}
                  {statusSnapshot.read_errors.length > 0 && <span>errors: {statusSnapshot.read_errors.length}</span>}
                </div>
              )}
            </div>
          )}
          <div className={`zg-dialogue-snapshot ${statusSnapshot.global_status}`}>
            <span>{statusSnapshot.global_status}</span>
            <strong>{getGraphFocusTitle(focusedTarget)}</strong>
            <small>{getGraphFocusGate(focusedTarget)}</small>
            <span className="zg-dialogue-snapshot-phase" title={`${dialogueExecutionState.schema} / ${dialogueExecutionState.updated_at}`}>
              {dialogueExecutionState.label}
            </span>
          </div>
          <div
            className={`zg-dialogue-execution-bar ${dialogueExecutionState.phase}${dialogueExecutionState.active ? ' active' : ''}`}
            aria-label={`${dialogueExecutionState.label}: ${dialogueExecutionState.action}`}
            data-phase={dialogueExecutionState.phase}
            data-step={dialogueExecutionState.step_index}
            title={`${dialogueExecutionState.label} / ${dialogueExecutionState.action} / ${dialogueExecutionState.schema} / ${dialogueExecutionState.source_output_id ?? 'idle'} / ${dialogueExecutionState.updated_at}`}
          >
            <div
              className={`zg-dialogue-execution-status ${dialogueExecutionState.phase}${dialogueExecutionState.active ? ' active' : ''}`}
              role="img"
              aria-label={dialogueExecutionState.label}
            >
              <span className="zg-execution-glyph" aria-hidden="true">
                <span className="zg-execution-core" />
                <span className="zg-execution-orbit" />
                <span className="zg-execution-mark" />
                <span className="zg-execution-tail" />
              </span>
            </div>
            <div className="zg-execution-body">
              <div className="zg-execution-copy">
                <span>{dialogueExecutionState.label}</span>
                <strong>{dialogueExecutionState.action}</strong>
              </div>
              <div className="zg-execution-step-row" aria-hidden="true">
                {STATUS_DIALOGUE_EXECUTION_STEPS.map((step, index) => (
                  <span
                    key={step.phase}
                    className={`${index < dialogueExecutionState.step_index ? 'done' : ''}${index === dialogueExecutionState.step_index ? ' current' : ''}`}
                  >
                    {step.short}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="zg-conversation-memory-panel" aria-label="conversation memory goal state" title={conversationMemoryTitle}>
            <div className="zg-conversation-memory-head">
              <span>memory</span>
              <strong>{conversationMemory.active_goal}</strong>
              <small>{conversationMemory.turn_count} turns</small>
            </div>
            <div className="zg-conversation-memory-line">
              <span>intent</span>
              <strong>{conversationMemory.latest_user_intent}</strong>
            </div>
            <div className="zg-conversation-memory-line">
              <span>focus</span>
              <strong>{conversationMemory.current_focus_node}</strong>
            </div>
            <div className="zg-conversation-memory-chips">
              {conversationMemoryFocus.map((item) => (
                <span key={`memory-focus-${item}`}>{item}</span>
              ))}
              {conversationMemoryFacts.map((item) => (
                <span key={`memory-fact-${item}`} className="fact">{item}</span>
              ))}
              {conversationMemoryOpen.map((item) => (
                <span key={`memory-open-${item}`} className="open">{item}</span>
              ))}
            </div>
            <small className="zg-conversation-memory-next">{conversationMemory.next_expected_result}</small>
          </div>
          <div className="zg-dialogue-log" ref={dialogueLogRef} aria-live="polite">
            {dialogueMessages.map((message) => (
              <article key={message.id} className={`${message.role}${message.pending ? ' pending' : ''}`}>
                <span>
                  {message.timestamp}
                  {message.source ? ` / ${message.source}` : ''}
                  {message.model ? ` / ${message.model}` : ''}
                  {message.latencyMs ? ` / ${message.latencyMs}ms` : ''}
                </span>
                <p>{message.text}</p>
                {message.thoughts && message.thoughts.length > 0 && (
                  <ul>
                    {message.thoughts.map((thought) => (
                      <li key={thought}>{thought}</li>
                    ))}
                  </ul>
                )}
                {(Boolean(message.statusRefs?.length) || Boolean(message.missingStatus?.length)) && (
                  <div className="zg-dialogue-refs">
                    {message.statusRefs?.slice(0, 4).map((ref) => (
                      <span key={`ref-${message.id}-${ref}`}>ref {ref}</span>
                    ))}
                    {message.missingStatus?.slice(0, 4).map((item) => (
                      <span key={`missing-${message.id}-${item}`}>missing {item}</span>
                    ))}
                  </div>
                )}
                {message.error && <em>{message.error}</em>}
              </article>
            ))}
          </div>
          <form className="zg-dialogue-form" onSubmit={handleDialogueSubmit}>
            <button
              ref={sttButtonRef}
              className={`zg-dialogue-stt-button ${voiceListening ? 'listening' : ''}`}
              type="button"
              onPointerDown={(event) => {
                const entrySnapshot = buildSttEntrySnapshotPayload('button_pointer_down', {
                  clientX: event.clientX,
                  clientY: event.clientY
                })
                logSttEntrySnapshot('button_pointer_down', {
                  clientX: event.clientX,
                  clientY: event.clientY
                })
                logStatusDialogueVoiceEvent('stt_button_pointer_down', {
                  selected_adapter: selectedSttAdapter,
                  model: selectedSttModel,
                  voice_listening: voiceListening,
                  dialogue_busy: dialogueBusy,
                  loop_enabled: continuousVoiceSession.enabled,
                  loop_status: continuousVoiceSession.status,
                  voice_queue_status: voicePlaybackQueueState.status,
                  entry_snapshot: entrySnapshot,
                  boundary: 'pointer reached visible STT button before startSpeechRecognition'
                })
              }}
              onClick={(event) => {
                const entrySnapshot = buildSttEntrySnapshotPayload('button_click', {
                  clientX: event.clientX,
                  clientY: event.clientY
                })
                logSttEntrySnapshot('button_click', {
                  clientX: event.clientX,
                  clientY: event.clientY
                })
                logStatusDialogueVoiceEvent('stt_button_click', {
                  selected_adapter: selectedSttAdapter,
                  model: selectedSttModel,
                  voice_listening: voiceListening,
                  dialogue_busy: dialogueBusy,
                  loop_enabled: continuousVoiceSession.enabled,
                  loop_status: continuousVoiceSession.status,
                  voice_queue_status: voicePlaybackQueueState.status,
                  entry_snapshot: entrySnapshot,
                  boundary: 'visible STT button click is entering startSpeechRecognition'
                })
                void startSpeechRecognition().catch((error) => {
                  logStatusDialogueVoiceEvent('stt_button_click_start_failed', {
                    selected_adapter: selectedSttAdapter,
                    model: selectedSttModel,
                    error: error instanceof Error ? error.message : String(error),
                    boundary: 'button click reached handler but startSpeechRecognition rejected'
                  })
                })
              }}
              title={voiceListening ? 'stop speech input' : speechPorts.input.fallback_reason}
              aria-label={voiceListening ? 'stop speech input' : 'start speech input'}
            >
              {voiceListening ? 'stop' : 'STT'}
            </button>
            <button
              className={`zg-dialogue-loop-button ${continuousVoiceSession.enabled ? 'active' : ''}`}
              type="button"
              onClick={toggleContinuousVoiceSession}
              title={continuousVoiceSession.enabled ? continuousVoiceSession.last_reason : 'start continuous formal STT loop'}
              aria-label={continuousVoiceSession.enabled ? 'stop continuous speech loop' : 'start continuous speech loop'}
              aria-pressed={continuousVoiceSession.enabled}
            >
              {continuousVoiceSession.enabled ? 'loop on' : 'loop'}
            </button>
            <input
              value={dialogueInput}
              onChange={(event) => setDialogueInput(event.target.value)}
              placeholder="status, interface, risk, current focus"
            />
            <button type="submit">{dialogueBusy ? 'queue' : 'send'}</button>
          </form>
        </aside>
        <section className="zg-expanded-particle-stage" aria-label="放大的三维粒子球">
          <div className="zg-expanded-particle-meta">
            <span>{focusedStatus}</span>
            <strong>{focusedTitle}</strong>
            <span>weight {Math.round(focusedWeight * 100)} / importance {Math.round(focusedNode.importance * 100)}</span>
          </div>
          <div className="zg-expanded-particle-tags" aria-hidden="true">
            <span>{graphNodes.length - 1} nebulae</span>
            <span>{starCount} 个内容星点</span>
            <span>{focusDepthLabel}</span>
          </div>
        </section>
        <div className="zg-graph-legend" aria-hidden="true">
          <span className="zg-legend-core">核心</span>
          <span className="zg-legend-world">世界</span>
          <span className="zg-legend-social">人际</span>
          <span className="zg-legend-forecast">预测</span>
          <span className="zg-legend-safety">治理</span>
        </div>
        {hovered && (
          <div
            className="zg-graph-tooltip"
            style={{
              left: `min(${hovered.x + 18}px, calc(100% - 300px))`,
              top: `min(${hovered.y + 18}px, calc(100% - 142px))`
            }}
          >
            <strong>{hovered.star?.label ?? hovered.node.label}</strong>
            <span>{hovered.star ? `${hovered.node.label} · ${hovered.star.status}` : hovered.node.status}</span>
            <small>
              {hovered.star?.owner ?? hovered.node.owner ?? 'World System'} ·{' '}
              {hovered.star?.gate ?? hovered.node.gate ?? 'projection_gate'} ·{' '}
              {hovered.star?.compass ?? `${hovered.node.compassPrefix ?? hovered.node.id}.${hovered.star?.id ?? hovered.node.id}`}
            </small>
            <p>{hovered.star?.detail ?? hovered.node.detail}</p>
          </div>
        )}
      </main>
      <footer className="zg-graph-footer">
        <span>静态世界系统主方案映射</span>
        <span>{graphNodes.length - 1} 个星云模块 · {starCount} 个内容星点</span>
        <span>人际辅助系统为未来接入位，当前不读取真实图谱</span>
      </footer>
    </div>
  )
}

function buildDraft({
  replyMode,
  relationshipClass,
  goalKind,
  sensitiveOptimization,
  followUpPreset
}: {
  replyMode: ReplyMode
  relationshipClass: RelationshipClass
  goalKind: GoalKind
  sensitiveOptimization: boolean
  followUpPreset: FollowUpPreset
}): string {
  if (replyMode === 'third_person_explanation') {
    return `建议按“${followUpPreset.label}”处理：先承接对方当前语气，再推进“${followUpPreset.nextAction}”。发送前仍要检查目标人物、会话窗口、草稿哈希和安全后置。`
  }

  if (goalKind === 'business_followup' || relationshipClass === 'business_client') {
    return '我先把目前的重点整理成一个很小的下一步：如果你这边方便，我可以按刚才讨论的方向补一版材料/时间安排，你确认后我们再继续推进。'
  }

  if (goalKind === 'relationship_development' || relationshipClass === 'romantic_interest') {
    return sensitiveOptimization
      ? '我想靠近你一点，但不想让你有压力。你愿意的时候，我们可以继续聊刚才那个话题。'
      : '我挺在意你的感受，也想继续了解你。你愿意的话，我们慢慢聊。'
  }

  if (goalKind === 'repair') {
    return '刚才这件事我先不急着辩解。我想先把你的感受和事实分清楚，再看我们怎么把后面处理好。'
  }

  return '我先按低打扰方式把重点整理一下，不把话说满。你看这个方向是否合适，合适的话我再继续推进下一步。'
}

function buildLanguageAnalysis(relationshipClass: RelationshipClass, goalKind: GoalKind): string[] {
  const base = [
    '目标用户语言偏日常、即时反馈和短句互动，需优先识别情绪温度而非只看字面信息。',
    '对轻松玩笑可保持短回应；对暧昧、成人玩笑或身份不确定内容必须进入边界审查。',
    '若缺少人物分类预设，系统只能给出候选关系类型，不能自动确认恋爱、亲密或客户等级。'
  ]
  if (relationshipClass === 'business_client' || goalKind === 'business_followup') {
    base.push('商务客户场景下优先检查承诺节点、材料交付、预算/时点和下一次明确动作。')
  }
  if (relationshipClass === 'romantic_interest' || goalKind === 'relationship_development') {
    base.push('恋爱目标下允许先做理论预测和表达优化，但发送前必须独立检查自愿性、压力、隐私和误读风险。')
  }
  return base
}

function summarizeOperatorGate(nextStep: OperatorNextStepState | null | undefined): string {
  const gate = nextStep?.objective_progress?.completion_gate
  if (!gate) return 'completion gate unavailable'
  return gate.ready_to_mark_goal_complete
    ? 'goal-complete gate passed'
    : `missing ${gate.missing_track_ids?.length ?? 0} tracks / ${gate.missing_target_file_ids?.length ?? 0} files`
}

function buildOperatorGateRows(nextStep: OperatorNextStepState | null | undefined): GradientReasoningRow[] {
  const gate = nextStep?.objective_progress?.completion_gate
  const tracks = nextStep?.objective_progress?.tracks ?? []
  if (!gate) {
    return [
      {
        label: 'completion gate',
        value: 'unavailable',
        detail: 'Run npm run pt028:operator-next-step to generate the final acceptance gate snapshot.'
      }
    ]
  }
  return [
    {
      label: 'completion gate',
      value: gate.ready_to_mark_goal_complete ? 'ready' : 'open',
      detail: gate.next_action || 'Check objective tracks before marking the active goal complete.'
    },
    {
      label: 'missing tracks',
      value: gate.missing_track_ids?.join(' / ') || 'none',
      detail: tracks.map((item) => `${item.track_id}:${item.status}`).join(' / ') || 'no track evidence'
    },
    {
      label: 'missing target files',
      value: gate.missing_target_file_ids?.join(' / ') || 'none',
      detail: 'Required files: pt028-human-review-decision.real.json and pt028-real-multi-window-operator-feedback.real.json'
    },
    {
      label: 'blocking details',
      value: gate.blocking_diagnostics?.top_failure_ids?.slice(0, 4).join(' / ') || 'none',
      detail: gate.blocking_diagnostics?.diagnostics
        ?.map((item) => `${item.scope}:${item.failure_ids?.slice(0, 3).join(',') || 'none'}`)
        .join(' / ') || 'no detailed blocker evidence'
    },
    {
      label: 'current operator action',
      value: nextStep?.current_action?.action_id || 'none',
      detail: `next=${nextStep?.queue?.next_blocking_action_id || 'none'}; gate=${nextStep?.gate_decision || 'unknown'}`
    }
  ]
}

function buildGradientReviewModel(
  relationshipClass: RelationshipClass,
  goalKind: GoalKind,
  replyMode: ReplyMode
): GradientReviewModel {
  if (relationshipClass === 'romantic_interest' || goalKind === 'relationship_development') {
    return {
      sourceLabel: 'local fallback model',
      dialogueAct: replyMode === 'first_person_as_user'
        ? 'warm_affection_micro_progression'
        : 'third_party_target_reply_prompt',
      currentStage: 'R2 已确认恋人 / 无身体亲密证据',
      progressionIntensity: 'micro_warmth',
      transitionDecision: 'progress_with_current_stage_micro_step',
      reasoningRows: [
        {
          label: '身份与阶段',
          value: 'romantic_partner / R2',
          detail: '主身份为恋爱目标时优先使用恋人关系梯度，不套用商务模板。'
        },
        {
          label: '心理舒适度',
          value: '微推进',
          detail: '承接轻松调侃，默认不直接推进身体靠近，高热度靠近只作为备选。'
        },
        {
          label: '迁移判断',
          value: '当前阶段内小步',
          detail: '缺少多窗口证据时只做 R2 内微推进，不把单句热度写成 R3/R4 事实。'
        }
      ],
      thirdPartyPrompts: [
        {
          targetReply: '哎，对你不拧巴，你捏捏捏。',
          prompt: '第三方提示：对方这句先按 R2 阶段处理，本轮强度是 micro_warmth。建议你用第一人称小步回应，并观察对方是否继续接住。',
          expertHint: '心理学专家：这句的重点是让对方感到被接住，而不是立刻要求升级。',
          stage: 'R2',
          intensity: 'micro_warmth',
          transition: 'progress_with_current_stage_micro_step'
        }
      ],
      chainFlow: [
        {
          label: 'decision source',
          value: 'fallback',
          detail: 'Runtime pt028_gui_decision_state.v1 has not been loaded.'
        }
      ],
      branchRecords: [
        {
          label: 'active input',
          value: 'blocked',
          detail: 'Show a user-only third-party prompt instead of target input.'
        }
      ],
      detailLogSections: [
        {
          section_id: 'fallback_summary',
          title: 'Fallback Summary',
          level: 'normal',
          lines: ['Runtime coordinator state is not loaded; showing local fallback relationship-gradient preview.']
        }
      ],
      expertRunRows: [
        {
          label: 'expert runtime',
          value: 'fallback',
          detail: 'No ExpertContextPack or parallel run log is available in local fallback mode.'
        }
      ],
      sendGateRows: [
        {
          label: 'send gate',
          value: 'blocked',
          detail: 'Real sending remains blocked until runtime coordinator and user confirmation are available.'
        }
      ],
      operatorGateSummary: 'completion gate unavailable',
      operatorGateRows: buildOperatorGateRows(null),
      dockBrief: 'R2/O3/F0 · micro_progression · prompt-only'
    }
  }

  return {
    sourceLabel: 'local fallback model',
    dialogueAct: replyMode === 'first_person_as_user' ? 'stage_bounded_business_or_social_reply' : 'third_party_context_note',
    currentStage: relationshipClass === 'business_client' ? 'B2B 跟进阶段' : '普通社交/待确认',
    progressionIntensity: relationshipClass === 'business_client' ? 'low_commitment_next_step' : 'context_capture',
    transitionDecision: relationshipClass === 'unknown' ? 'hold_stage_context_gap_use_capture_hint' : 'progress_with_current_stage_micro_step',
    reasoningRows: [
      {
        label: '关系梯度',
        value: relationshipClass === 'business_client' ? '低承诺推进' : '先补上下文',
        detail: '同一梯度框架可迁移到销售和谈判关系；当前界面先显示恋人关系的完整样式。'
      }
    ],
    thirdPartyPrompts: [
      {
        targetReply: '当前未绑定真实目标回复',
        prompt: '第三方提示：没有可确认的目标回复时，只显示上下文补读或人工确认建议。',
        expertHint: '证据专家：缺少当前句时，不把缺失内容判断为阶段停滞。',
        stage: relationshipClass === 'business_client' ? 'business_stage' : 'unconfirmed',
        intensity: relationshipClass === 'business_client' ? 'low_commitment_next_step' : 'context_capture',
        transition: relationshipClass === 'unknown' ? 'hold_stage_context_gap_use_capture_hint' : 'current_stage_only'
        }
    ],
    chainFlow: [
      {
        label: 'decision source',
        value: 'fallback',
        detail: 'No runtime decision projection is available for this relationship class.'
      }
    ],
    branchRecords: [
      {
        label: 'context gate',
        value: relationshipClass === 'unknown' ? 'capture_more_context' : 'current_stage_only',
        detail: 'Do not upgrade a relationship stage without evidence.'
      }
    ],
    detailLogSections: [
      {
        section_id: 'fallback_summary',
        title: 'Fallback Summary',
        level: 'normal',
        lines: ['Runtime decision state is unavailable; use console detail view after the next pt028_gui_state refresh.']
      }
    ],
    expertRunRows: [
      {
        label: 'expert runtime',
        value: 'fallback',
        detail: 'No parallel expert run log is available.'
      }
    ],
    sendGateRows: [
      {
        label: 'send gate',
        value: 'blocked',
        detail: 'No controlled send payload is available from fallback mode.'
      }
    ],
    operatorGateSummary: 'completion gate unavailable',
    operatorGateRows: buildOperatorGateRows(null),
    dockBrief: relationshipClass === 'business_client' ? 'business · next-step · prompt-only' : 'context · capture · prompt-only'
  }
}

function mergeRuntimeGradientReview(
  runtimeState: RuntimeDecisionState | null,
  fallback: GradientReviewModel
): GradientReviewModel {
  if (runtimeState?.schema_version !== 'pt028_gui_decision_state.v1') return fallback
  const review = runtimeState.relationship_gradient_review
  if (!review) return fallback

  const thirdPartyPrompts = (review.third_party_prompts ?? []).map((item): ThirdPartyPromptCard => {
    const expertHint = item.expert_reviews
      ?.map((expert) => expert.user_prompt_hint || expert.recommendation)
      .filter(Boolean)
      .slice(0, 2)
      .join(' / ')
    return {
      targetReply: item.target_reply || 'target reply unavailable',
      prompt: item.prompt || 'third-party prompt unavailable',
      expertHint: expertHint || `risk=${item.risk_level || 'unknown'}; not_sent_to_target=${item.not_sent_to_target === true}`,
      stage: item.stage || review.current_stage || 'unknown',
      intensity: item.intensity || review.progression_intensity || 'unknown',
      transition: item.transition || review.transition_decision || 'unknown'
    }
  })
  const runLog = runtimeState.parallel_expert_run_log
  const expertRunRows = runLog?.lanes?.length
    ? runLog.lanes.map((lane) => ({
        label: lane.expert_id || lane.lane_id || 'expert lane',
        value: lane.status || 'unknown',
        detail: lane.context_pack_ref || 'context pack unavailable'
      }))
    : fallback.expertRunRows
  const sendGate = runtimeState.send_gate_transfer_path
  const sendGateRows = sendGate
    ? [
        {
          label: 'mode',
          value: sendGate.current_mode || 'unknown',
          detail: `real_execution_allowed=${sendGate.real_execution_allowed === true}; attempted=${sendGate.real_send_attempted === true}`
        },
        {
          label: 'required gates',
          value: `${sendGate.required_gates?.length ?? 0} gates`,
          detail: sendGate.required_gates?.join(' / ') || 'no gate list'
        }
      ]
    : fallback.sendGateRows
  const operatorGateRows = buildOperatorGateRows(runtimeState.operator_next_step)
  const structuredTrace = runtimeState.structured_cot_trace
  const structuredTraceSection: RuntimeDisplaySection[] = structuredTrace
    ? [
        {
          section_id: 'structured_cot_trace',
          title: 'Structured COT Trace',
          level: structuredTrace.visibility_policy?.raw_hidden_chain_of_thought_logged === true ? 'warning' : 'normal',
          lines: [
            `trace=${structuredTrace.trace_id || 'unknown'}; type=${structuredTrace.visibility_policy?.log_type || 'unknown'}; raw_hidden_cot=${structuredTrace.visibility_policy?.raw_hidden_chain_of_thought_logged === true}`,
            `dialogue=${structuredTrace.dialogue_generation_logic?.generator || 'unknown'}; option=${structuredTrace.dialogue_generation_logic?.selected_option_id || 'unknown'}; template=${structuredTrace.dialogue_generation_logic?.selected_template_id || 'unknown'}; act=${structuredTrace.dialogue_generation_logic?.dialogue_act || 'unknown'}`,
            `prompt=${structuredTrace.prompt_generation_logic?.generator || 'unknown'}; count=${structuredTrace.prompt_generation_logic?.prompt_count ?? 0}; active_input_blocked=${structuredTrace.prompt_generation_logic?.active_input_blocked_by_default === true}`,
            `weights_changed=${structuredTrace.weight_logic?.changed === true}; preliminary=${structuredTrace.weight_logic?.preliminary_recommended_option_id || 'unknown'}; final=${structuredTrace.weight_logic?.final_recommended_option_id || 'unknown'}`,
            `path=${(structuredTrace.generation_path ?? []).map((step) => `${step.step_id}:${step.status}`).join(' > ') || 'unavailable'}`
          ]
        }
      ]
    : []
  const runtimeSections = runtimeState.frontend_display_contract?.surfaces?.console?.sections

  return {
    sourceLabel: `runtime decision state / ${runtimeState.state_id || 'latest'}`,
    stateId: runtimeState.state_id,
    runtimeDraft: review.draft || fallback.runtimeDraft,
    dialogueAct: review.dialogue_act || fallback.dialogueAct,
    currentStage: [review.current_stage, review.stage_id].filter(Boolean).join(' / ') || fallback.currentStage,
    progressionIntensity: review.progression_intensity || fallback.progressionIntensity,
    transitionDecision: review.transition_decision || fallback.transitionDecision,
    reasoningRows: review.reasoning_rows?.length
      ? review.reasoning_rows.map((item) => ({
          label: item.label,
          value: item.value,
          detail: item.detail
        }))
      : fallback.reasoningRows,
    thirdPartyPrompts: thirdPartyPrompts.length ? thirdPartyPrompts : fallback.thirdPartyPrompts,
    chainFlow: runtimeState.chain_flow?.length
      ? runtimeState.chain_flow.map((step) => ({
          label: step.label || step.step_id || 'chain step',
          value: step.status || 'unknown',
          detail: step.evidence || ''
        }))
      : fallback.chainFlow,
    branchRecords: runtimeState.branch_records?.length
      ? runtimeState.branch_records.map((branch) => ({
          label: branch.branch_id || 'branch',
          value: branch.decision || 'unknown',
          detail: branch.reason || ''
        }))
      : fallback.branchRecords,
    detailLogSections: runtimeSections?.length
      ? [...structuredTraceSection, ...runtimeSections]
      : structuredTraceSection.length
        ? structuredTraceSection
        : fallback.detailLogSections,
    expertRunRows,
    sendGateRows,
    operatorGateSummary: summarizeOperatorGate(runtimeState.operator_next_step),
    operatorGateRows,
    dockBrief: getDockBriefFromRuntimeState(runtimeState) || fallback.dockBrief
  }
}

function getDockBriefFromRuntimeState(runtimeState: RuntimeDecisionState | null): string | null {
  const dock = runtimeState?.frontend_display_contract?.surfaces?.dock
  const parts = dock?.status_parts
  const text = [
    parts?.relationship_stage && parts?.online_stage && parts?.offline_stage
      ? `${parts.relationship_stage}/${parts.online_stage}/${parts.offline_stage}`
      : null,
    parts?.current_turn_intent,
    parts?.gate_status
  ].filter(Boolean).join(' · ').trim() || dock?.text?.trim()
  if (!dock || !text) return null
  const maxChars = dock.max_chars && dock.max_chars > 0 ? dock.max_chars : 42
  return text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 1))}…` : text
}

function useAdaptiveGoal(initialRelationship: RelationshipClass = 'romantic_interest') {
  const [relationshipClass, setRelationshipClass] = useState<RelationshipClass>(initialRelationship)
  const [goalKind, setGoalKind] = useState<GoalKind>(FOLLOW_UP_PRESETS[initialRelationship].goalKind)
  const [autoFollowUp, setAutoFollowUp] = useState(true)

  const applyRelationshipClass = useCallback(
    (next: RelationshipClass) => {
      setRelationshipClass(next)
      if (autoFollowUp) {
        setGoalKind(FOLLOW_UP_PRESETS[next].goalKind)
      }
    },
    [autoFollowUp]
  )

  const applyGoalKind = useCallback((next: GoalKind) => {
    setAutoFollowUp(false)
    setGoalKind(next)
  }, [])

  const resetAutoFollowUp = useCallback(() => {
    setAutoFollowUp(true)
    setGoalKind(FOLLOW_UP_PRESETS[relationshipClass].goalKind)
  }, [relationshipClass])

  return {
    relationshipClass,
    goalKind,
    autoFollowUp,
    followUpPreset: FOLLOW_UP_PRESETS[relationshipClass],
    applyRelationshipClass,
    applyGoalKind,
    setAutoFollowUp,
    resetAutoFollowUp
  }
}

export function ZhinengConsole() {
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>('idle')
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>('zhineng_bridge')
  const {
    relationshipClass,
    goalKind,
    autoFollowUp,
    followUpPreset,
    applyRelationshipClass,
    applyGoalKind,
    resetAutoFollowUp
  } = useAdaptiveGoal()
  const [replyMode, setReplyMode] = useState<ReplyMode>('first_person_as_user')
  const [sensitiveOptimization, setSensitiveOptimization] = useState(true)
  const [analysisConfirmed, setAnalysisConfirmed] = useState(false)
  const [runtimeDecisionState, setRuntimeDecisionState] = useState<RuntimeDecisionState | null>(null)
  const [decisionStateStatus, setDecisionStateStatus] = useState('waiting for pt028_gui_decision_state.v1')
  const [lastAction, setLastAction] = useState('等待操作')

  const refreshStatus = useCallback(async () => {
    const status = (await window.electron?.invoke('engine:status')) as { running?: boolean } | undefined
    setRuntimeStatus(status?.running ? 'running' : 'idle')
  }, [])

  useEffect(() => {
    void refreshStatus()
    const cleanup = window.electron?.on('engine:state', (data: { status: RuntimeStatus }) => {
      setRuntimeStatus(data.status === 'running' ? 'running' : 'idle')
    })
    return cleanup
  }, [refreshStatus])

  const applyDecisionStateResult = useCallback(
    (
      result:
        | { success?: boolean; state?: RuntimeDecisionState; reason?: string; next_command?: string; event?: Record<string, unknown> }
        | undefined,
      source: 'poll' | 'push'
    ) => {
      if (result?.success && result.state) {
        setRuntimeDecisionState(result.state)
        const eventLabel = source === 'push' ? 'pushed' : 'loaded'
        setDecisionStateStatus(`runtime state ${eventLabel}: ${result.state.state_id || 'latest'}`)
        return
      }
      setRuntimeDecisionState(null)
      setDecisionStateStatus(result?.next_command ? `${result.reason}; ${result.next_command}` : result?.reason || 'runtime decision state unavailable')
    },
    []
  )

  const refreshDecisionState = useCallback(async () => {
    if (!window.electron?.invoke) {
      setDecisionStateStatus('desktop IPC unavailable; using local fallback')
      return
    }
    const result = (await window.electron.invoke('zhineng:decision-state:get')) as
      | { success?: boolean; state?: RuntimeDecisionState; reason?: string; next_command?: string }
      | undefined
    applyDecisionStateResult(result, 'poll')
  }, [applyDecisionStateResult])

  useEffect(() => {
    void refreshDecisionState()
    const timer = window.setInterval(() => void refreshDecisionState(), 5000)
    const cleanupDecisionState = window.electron?.on(
      'zhineng:decision-state:changed',
      (
        result:
          | { success?: boolean; state?: RuntimeDecisionState; reason?: string; next_command?: string; event?: Record<string, unknown> }
          | undefined
      ) => {
        applyDecisionStateResult(result, 'push')
      }
    )
    return () => {
      window.clearInterval(timer)
      cleanupDecisionState?.()
    }
  }, [applyDecisionStateResult, refreshDecisionState])

  const startSystem = useCallback(async () => {
    if (!window.electron?.invoke) {
      setLastAction(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE)
      return
    }
    const settings = (await window.electron?.invoke('settings:getAll')) as Record<string, unknown> | undefined
    const result = await window.electron?.invoke('engine:start', {
      ...(settings ?? {}),
      runtimeMode
    })
    if (result?.success) {
      setRuntimeStatus('running')
      setLastAction('系统已启动')
    } else {
      setLastAction(result?.error || '启动失败，请检查桌面接收设置')
    }
  }, [runtimeMode])

  const stopSystem = useCallback(async () => {
    if (!window.electron?.invoke) {
      setLastAction(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE)
      return
    }
    const result = await window.electron?.invoke('engine:stop', 'zhineng_console_stop')
    if (result?.success) {
      setRuntimeStatus('idle')
      setLastAction('系统已停止')
    } else {
      setLastAction(result?.error || '停止失败或当前未运行')
    }
  }, [])

  const fallbackDraft = useMemo(
    () =>
      buildDraft({
        replyMode,
        relationshipClass,
        goalKind,
        sensitiveOptimization,
        followUpPreset
      }),
    [followUpPreset, goalKind, relationshipClass, replyMode, sensitiveOptimization]
  )
  const languageAnalysis = useMemo(
    () => buildLanguageAnalysis(relationshipClass, goalKind),
    [goalKind, relationshipClass]
  )
  const gradientReview = useMemo(
    () => mergeRuntimeGradientReview(
      runtimeDecisionState,
      buildGradientReviewModel(relationshipClass, goalKind, replyMode)
    ),
    [goalKind, relationshipClass, replyMode, runtimeDecisionState]
  )
  const draft = gradientReview.runtimeDraft || fallbackDraft

  return (
    <div className="zg-shell">
      <header className="zg-header">
        <div>
          <p className="zg-kicker">Zhineng Control Panel</p>
          <h1>桌面信息接收与回复审查台</h1>
        </div>
        <div className="zg-status-strip">
          <span className={`zg-status-dot ${runtimeStatus}`} />
          <span>{runtimeStatus === 'running' ? '运行中' : '未运行'}</span>
          <span className="zg-separator" />
          <span>{lastAction}</span>
        </div>
      </header>

      <main className="zg-layout">
        <section className="zg-band zg-operations" aria-label="系统控制">
          <div className="zg-section-title">
            <span>系统控制</span>
            <small>真实发送保持阻断</small>
          </div>
          <div className="zg-control-row">
            <label>
              <span>运行模式</span>
              <select value={runtimeMode} onChange={(event) => setRuntimeMode(event.target.value as RuntimeMode)}>
                <option value="zhineng_bridge">只读接收桥接</option>
                <option value="auto_reply">桌面受控回复模式</option>
              </select>
            </label>
            <button className="zg-icon-button primary" onClick={startSystem} disabled={runtimeStatus === 'running'} title="启动">
              <PlayIcon />
              <span>启动</span>
            </button>
            <button className="zg-icon-button danger" onClick={stopSystem} disabled={runtimeStatus === 'idle'} title="停止">
              <StopIcon />
              <span>停止</span>
            </button>
          </div>
          <div className="zg-gate-line">
            <ShieldIcon />
            <span>分析确认只放行到受控发送材料；真实发送仍需测试窗口、目标绑定、草稿哈希和操作者确认。</span>
          </div>
        </section>

        <section className="zg-panel zg-target" aria-label="目标与人物分类">
          <div className="zg-section-title">
            <span>目标与人物分类</span>
            <small>{autoFollowUp ? '自动适配跟进中' : '人工目标覆盖中'}</small>
          </div>
          <div className="zg-two-fields">
            <label>
              <span>人物分类</span>
              <select value={relationshipClass} onChange={(event) => applyRelationshipClass(event.target.value as RelationshipClass)}>
                {relationshipOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>目标设定</span>
              <select value={goalKind} onChange={(event) => applyGoalKind(event.target.value as GoalKind)}>
                {goalOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="zg-auto-follow">
            <div>
              <strong>{followUpPreset.label}</strong>
              <span>{followUpPreset.priority}</span>
            </div>
            <p>{followUpPreset.nextAction}</p>
            <dl>
              <div>
                <dt>节奏</dt>
                <dd>{followUpPreset.cadence}</dd>
              </div>
              <div>
                <dt>语气</dt>
                <dd>{followUpPreset.tone}</dd>
              </div>
              <div>
                <dt>闸门</dt>
                <dd>{followUpPreset.safetyGate}</dd>
              </div>
            </dl>
          </div>
          <div className="zg-target-footer">
            <p className="zg-note">{classifyDefaultRelationship(relationshipClass)}</p>
            <button className="zg-link-button" onClick={resetAutoFollowUp} disabled={autoFollowUp}>
              恢复自动适配
            </button>
          </div>
        </section>

        <section className="zg-panel zg-process" aria-label="分析过程">
          <div className="zg-section-title">
            <span>分析过程与理由</span>
            <small>发送阻断不影响分析</small>
          </div>
          <div className="zg-step-list">
            {analysisSteps.map((item, index) => (
              <div className="zg-step" key={item.step}>
                <b>{index + 1}</b>
                <div>
                  <strong>{item.step}</strong>
                  <span>{item.output}</span>
                  <em>{item.reason}</em>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="zg-panel zg-reply" aria-label="回复逻辑和语言分析">
          <div className="zg-section-title">
            <span>回复逻辑检查框</span>
            <small>第一人称 / 第三人称</small>
          </div>
          <div className="zg-segmented" role="tablist" aria-label="回复视角">
            <button className={replyMode === 'first_person_as_user' ? 'active' : ''} onClick={() => setReplyMode('first_person_as_user')}>
              第一人称代用户
            </button>
            <button className={replyMode === 'third_person_explanation' ? 'active' : ''} onClick={() => setReplyMode('third_person_explanation')}>
              第三人称讲解
            </button>
          </div>
          <div className="zg-review-frame">
            <div>
              <h2>草稿输出</h2>
              <p>{draft}</p>
            </div>
            <div>
              <h2>目标用户语言分析</h2>
              <ul>
                {languageAnalysis.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="zg-gradient-review" aria-live="polite">
            <div className="zg-runtime-state-line">
              <span>{gradientReview.sourceLabel}</span>
              <em>{decisionStateStatus}</em>
            </div>
            <div className="zg-gradient-summary">
              <span>{gradientReview.currentStage}</span>
              <strong>{gradientReview.progressionIntensity}</strong>
              <em>{gradientReview.transitionDecision}</em>
            </div>
            <div className="zg-gradient-grid">
              <div className="zg-gradient-reasoning">
                <h2>句子意图与推理日志</h2>
                <dl>
                  <div>
                    <dt>话语行为</dt>
                    <dd>{gradientReview.dialogueAct}</dd>
                  </div>
                  {gradientReview.reasoningRows.map((item) => (
                    <div key={item.label}>
                      <dt>{item.label}</dt>
                      <dd>
                        <strong>{item.value}</strong>
                        <span>{item.detail}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="zg-third-party-prompts">
                <h2>第三方提示</h2>
                {gradientReview.thirdPartyPrompts.map((item) => (
                  <article key={`${item.stage}-${item.targetReply}`}>
                    <header>
                      <span>{item.stage}</span>
                      <strong>{item.intensity}</strong>
                    </header>
                    <blockquote>{item.targetReply}</blockquote>
                    <p>{item.prompt}</p>
                    <em>{item.expertHint}</em>
                  </article>
                ))}
              </div>
            </div>
            <div className="zg-detail-log">
              <div className="zg-detail-log-header">
                <h2>统筹日志</h2>
                <span>{gradientReview.dockBrief}</span>
              </div>
              <div className="zg-chat-log-stack">
                {gradientReview.detailLogSections.map((section) => (
                  <article className={`zg-chat-log-entry ${section.level || 'normal'}`} key={section.section_id || section.title}>
                    <header>
                      <strong>{section.title || section.section_id || 'Log Section'}</strong>
                      <span>{section.level || 'normal'}</span>
                    </header>
                    {(section.lines ?? []).map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </article>
                ))}
              </div>
              <div className="zg-log-subgrid">
                <div>
                  <h3>专家运行日志</h3>
                  <dl>
                    {gradientReview.expertRunRows.map((row) => (
                      <div key={`${row.label}-${row.value}`}>
                        <dt>{row.label}</dt>
                        <dd>
                          <strong>{row.value}</strong>
                          <span>{row.detail}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div>
                  <h3>发送门阀</h3>
                  <dl>
                    {gradientReview.sendGateRows.map((row) => (
                      <div key={`${row.label}-${row.value}`}>
                        <dt>{row.label}</dt>
                        <dd>
                          <strong>{row.value}</strong>
                          <span>{row.detail}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div>
                  <h3>Acceptance Gate</h3>
                  <p className="zg-operator-gate-summary">{gradientReview.operatorGateSummary}</p>
                  <dl>
                    {gradientReview.operatorGateRows.map((row) => (
                      <div key={`${row.label}-${row.value}`}>
                        <dt>{row.label}</dt>
                        <dd>
                          <strong>{row.value}</strong>
                          <span>{row.detail}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>
            <div className="zg-chain-branch-grid">
              <div className="zg-chain-flow">
                <h2>完整链路走向</h2>
                <ol>
                  {gradientReview.chainFlow.map((item) => (
                    <li key={`${item.label}-${item.value}`}>
                      <strong>{item.label}</strong>
                      <span>{item.value}</span>
                      <em>{item.detail}</em>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="zg-branch-records">
                <h2>分支记录</h2>
                <dl>
                  {gradientReview.branchRecords.map((item) => (
                    <div key={`${item.label}-${item.value}`}>
                      <dt>{item.label}</dt>
                      <dd>
                        <strong>{item.value}</strong>
                        <span>{item.detail}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>

        <section className="zg-panel zg-safety" aria-label="安全后置">
          <div className="zg-section-title">
            <span>敏感目标安全后置</span>
            <small>理论预测与发送审查分离</small>
          </div>
          <label className="zg-toggle">
            <input
              type="checkbox"
              checked={sensitiveOptimization}
              onChange={(event) => setSensitiveOptimization(event.target.checked)}
            />
            <span>启用性能最优化表达候选</span>
          </label>
          <div className="zg-safety-grid">
            <div>
              <strong>理论层</strong>
              <span>允许评估亲密度、语气、推进窗口和可能回应，不在生成阶段提前删掉可能性。</span>
            </div>
            <div>
              <strong>存储层</strong>
              <span>敏感原文优先摘要化，身份线索本地保存，截图证据仅保留路径和哈希。</span>
            </div>
            <div>
              <strong>发送层</strong>
              <span>真实发送必须人工确认、目标窗口匹配、会话匹配、草稿哈希一致。</span>
            </div>
          </div>
        </section>

        <section className="zg-panel zg-storage" aria-label="存储和读取">
          <div className="zg-section-title">
            <span>存储与读取结构</span>
            <small>长期范式评估</small>
          </div>
          <div className="zg-storage-table">
            {storageRows.map((row) => (
              <div className="zg-storage-row" key={row.path}>
                <strong>{row.label}</strong>
                <code>{row.path}</code>
                <span>{row.role}</span>
                <span>{row.longTermUse}</span>
                <em>{row.risk}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="zg-band zg-confirmation" aria-label="确认闸门">
          <label className="zg-toggle">
            <input
              type="checkbox"
              checked={analysisConfirmed}
              onChange={(event) => setAnalysisConfirmed(event.target.checked)}
            />
            <span>我已检查分析过程、语言判断、目标分类和安全后置理由</span>
          </label>
          <button className="zg-send-preview" disabled={!analysisConfirmed}>
            生成受控发送材料
          </button>
          <p>{analysisConfirmed ? '可进入受控发送材料准备，但仍不执行真实发送。' : '未确认前不生成发送材料。'}</p>
        </section>
      </main>
    </div>
  )
}

export function ZhinengDockIcon() {
  const { relationshipClass, goalKind, followUpPreset, applyRelationshipClass } = useAdaptiveGoal('unknown')
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>('idle')
  const [panelState, setPanelState] = useState<DockPanelState>({ expanded: false })
  const [graphOpening, setGraphOpening] = useState(false)
  const [graphOpenFailure, setGraphOpenFailure] = useState<string | null>(null)
  const [dockRuntimeDecisionState, setDockRuntimeDecisionState] = useState<RuntimeDecisionState | null>(null)
  const [dockState, setDockState] = useState<DockAttachmentState>({
    attached: false,
    reason: '等待吸附'
  })

  const refreshDock = useCallback(async () => {
    const result = (await window.electron?.invoke('zhineng:dock:refresh')) as DockAttachmentState | undefined
    if (result) setDockState(result)
  }, [])

  const applyDockDecisionStateResult = useCallback(
    (
      result:
        | { success?: boolean; state?: RuntimeDecisionState; event?: Record<string, unknown> }
        | undefined
    ) => {
      setDockRuntimeDecisionState(result?.success && result.state ? result.state : null)
    },
    []
  )

  const refreshDockDecisionState = useCallback(async () => {
    if (!window.electron?.invoke) return
    const result = (await window.electron.invoke('zhineng:decision-state:get')) as
      | { success?: boolean; state?: RuntimeDecisionState }
      | undefined
    applyDockDecisionStateResult(result)
  }, [applyDockDecisionStateResult])

  useEffect(() => {
    void refreshDock()
    void refreshDockDecisionState()
    const timer = window.setInterval(() => void refreshDock(), 1800)
    const decisionTimer = window.setInterval(() => void refreshDockDecisionState(), 5000)
    const cleanup = window.electron?.on('engine:state', (data: { status: RuntimeStatus }) => {
      setRuntimeStatus(data.status === 'running' ? 'running' : 'idle')
    })
    const cleanupPanelState = window.electron?.on('zhineng:dock-panel-state', (data: DockPanelState) => {
      setPanelState(data)
    })
    const cleanupDecisionState = window.electron?.on(
      'zhineng:decision-state:changed',
      (
        result:
          | { success?: boolean; state?: RuntimeDecisionState; event?: Record<string, unknown> }
          | undefined
      ) => {
        applyDockDecisionStateResult(result)
      }
    )
    return () => {
      window.clearInterval(timer)
      window.clearInterval(decisionTimer)
      cleanup?.()
      cleanupPanelState?.()
      cleanupDecisionState?.()
    }
  }, [applyDockDecisionStateResult, refreshDock, refreshDockDecisionState])

  const openSettings = useCallback(async () => {
    try {
      const result = await window.electron?.invoke('settings:open')
      if (result?.success) return
    } catch (error) {
      console.error('settings:open failed', error)
    }
    if (!window.electron) {
      window.location.href = '?window=settings'
    }
  }, [])

  const inferredRelationship = useMemo(() => inferRelationshipFromDockState(dockState), [dockState])

  useEffect(() => {
    applyRelationshipClass(inferredRelationship)
  }, [applyRelationshipClass, inferredRelationship])

  const openConsole = useCallback(async () => {
    try {
      const result = await window.electron?.invoke('zhineng:dock:openConsole')
      if (result?.success) return
    } catch (error) {
      console.error('zhineng:dock:openConsole failed', error)
    }
    if (!window.electron) {
      window.location.href = '?window=zhineng-console'
    }
  }, [])

  const graphLaunchState = useMemo<DockGraphLaunchState>(() => ({
    attached: dockState.attached,
    appType: dockState.appType,
    targetTitle: dockState.targetTitle,
    reason: dockState.reason,
    updatedAt: dockState.updatedAt,
    runtimeStatus,
    panelExpanded: panelState.expanded,
    relationshipClass,
    goalKind,
    followUpLabel: followUpPreset.label,
    followUpPriority: followUpPreset.priority,
    followUpNextAction: followUpPreset.nextAction
  }), [dockState, followUpPreset, goalKind, panelState.expanded, relationshipClass, runtimeStatus])

  const openGraph = useCallback(async (intentState: Partial<DockGraphLaunchState> = {}) => {
    const launchState = { ...graphLaunchState, ...intentState }
    const state = encodeURIComponent(JSON.stringify(launchState))
    setGraphOpening(true)
    setGraphOpenFailure(null)
    window.setTimeout(() => setGraphOpening(false), 900)

    if (!window.electron?.invoke) {
      window.location.href = `?window=zhineng-graph&state=${state}`
      return
    }

    try {
      const result = await window.electron.invoke('zhineng:dock:openGraph', launchState)
      if (result?.success) return
      const reason = typeof result?.error === 'string' ? result.error : '主进程未返回成功'
      setGraphOpenFailure(`图谱窗口未打开：${reason}`)
      console.error('zhineng:dock:openGraph returned failure', result)
    } catch (error) {
      setGraphOpenFailure('图谱窗口未打开：主进程未接住请求，请重启桌面程序')
      console.error('zhineng:dock:openGraph failed', error)
    }
  }, [graphLaunchState])

  const openVoiceEntry = useCallback(() => {
    logStatusDialogueVoiceEvent('dock_voice_entry_click', {
      source: 'dock_voice_button',
      action: 'focus_stt',
      boundary: 'dock opens graph and focuses visible STT entry; microphone is not started automatically'
    })
    void openGraph({
      launchIntent: 'status_dialogue_voice_entry',
      statusDialogueAction: 'focus_stt',
      source: 'dock_voice_button'
    })
  }, [openGraph])

  const attachmentText = getAttachmentLabel(graphLaunchState)
  const runningText = runtimeStatus === 'running' ? '运行中' : '待命'
  const panelText = panelState.expanded
    ? panelState.panel === 'settings'
      ? '设置台已展开'
      : panelState.panel === 'graph'
        ? '图谱已展开'
        : '控制台已展开'
    : '面板收起'
  const dockDecisionBrief = getDockBriefFromRuntimeState(dockRuntimeDecisionState)
  const fallbackMarqueeText = [
    graphOpenFailure,
    getAppTypeLabel(dockState.appType),
    dockState.targetTitle || '目标窗口待识别',
    runningText,
    panelText,
    followUpPreset.label,
    getRelationshipLabel(relationshipClass),
    getGoalLabel(goalKind)
  ].filter(Boolean).join(' / ')
  const marqueeText = graphOpenFailure || dockDecisionBrief || fallbackMarqueeText
  const marqueeTitleText = [
    graphOpenFailure,
    dockDecisionBrief,
    getAppTypeLabel(dockState.appType),
    dockState.targetTitle || '目标窗口待识别',
    runningText,
    panelText,
    followUpPreset.label,
    getRelationshipLabel(relationshipClass),
    getGoalLabel(goalKind)
  ].filter(Boolean).join(' / ')

  return (
    <div className="zg-dock-shell">
      <button
        type="button"
        className={`zg-dock-orb ${dockState.attached ? 'attached' : 'floating'} ${runtimeStatus} ${panelState.expanded || graphOpening ? 'expanded' : 'collapsed'} ${graphOpening ? 'opening' : ''}`}
        onClick={() => void openGraph()}
        title="打开关系与事件图谱"
        aria-label="打开关系与事件图谱"
      >
        <span className="zg-dock-pulse" />
        <ParticleDockOrb
          attached={dockState.attached}
          panelExpanded={panelState.expanded === true || graphOpening}
          targetTitle={dockState.targetTitle}
          runtimeStatus={runtimeStatus}
          relationshipClass={relationshipClass}
          goalKind={goalKind}
        />
      </button>
      <div className="zg-dock-status-strip" title={marqueeTitleText}>
        <span className={`zg-attach-icon ${dockState.attached ? 'attached' : 'floating'}`} aria-label={attachmentText} />
        <div className="zg-dock-marquee">
          <span>{marqueeText}</span>
          <span aria-hidden="true">{marqueeText}</span>
        </div>
      </div>
      <div className="zg-dock-actions">
        <button className="zg-dock-action-button console" type="button" onClick={openConsole} title="打开控制台" aria-label="打开控制台" />
        <button className="zg-dock-action-button voice" type="button" onClick={openVoiceEntry} title="打开语音对话入口" aria-label="打开语音对话入口" />
        <button className="zg-dock-action-button settings" type="button" onClick={openSettings} title="打开设置台" aria-label="打开设置台" />
      </div>
    </div>
  )
}
