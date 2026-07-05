import type { VoiceProfile } from './voice-profile'
import type { VoiceResponsePlan } from './voice-response-plan'

export const STATUS_DIALOGUE_TTS_CONFIG_SCHEMA = 'status_dialogue_tts_config.v1'
export const STATUS_DIALOGUE_TTS_HEALTH_SCHEMA = 'status_dialogue_tts_health.v1'
export const STATUS_DIALOGUE_TTS_SYNTHESIS_SCHEMA = 'status_dialogue_tts_synthesis.v1'
export const STATUS_DIALOGUE_TTS_RUNTIME_CANDIDATE_SCHEMA = 'status_dialogue_tts_runtime_candidate.v1'

export type StatusDialogueTtsAdapterId =
  | 'browser_speech_synthesis'
  | 'cosyvoice_local_http'
  | 'openai_compatible_streaming_http'
  | 'custom_streaming_tts_http'
  | 'edge_readaloud_websocket'
export type StatusDialogueTtsPayloadMode = 'openai_compatible' | 'cosyvoice_simple'
export type StatusDialogueTtsRuntimeCandidateRole =
  | 'live_dialogue_primary'
  | 'high_quality_cache'
  | 'clone_voice_high_quality'
  | 'text_only_fallback'
export type StatusDialogueTtsRuntimeCandidateTransport = 'chunked_http' | 'websocket' | 'sse' | 'none'

export interface StatusDialogueTtsRuntimeEvidence {
  adapter_id: StatusDialogueTtsAdapterId
  native_streaming_supported?: boolean
  first_audio_payload_ms?: number
  total_request_ms?: number
  error?: string
}

export interface StatusDialogueTtsRuntimeCandidate {
  schema: typeof STATUS_DIALOGUE_TTS_RUNTIME_CANDIDATE_SCHEMA
  adapter_id: StatusDialogueTtsAdapterId
  label: string
  role: StatusDialogueTtsRuntimeCandidateRole
  transport: StatusDialogueTtsRuntimeCandidateTransport
  configured: boolean
  enabled: boolean
  replaceable: boolean
  supports_streaming: boolean
  supports_pcm: boolean
  supports_cache: boolean
  supports_voice_clone: boolean
  supports_emotion: boolean
  same_voice_profile_required: boolean
  expected_first_audio_budget_ms: number
  last_first_audio_ms?: number
  last_total_request_ms?: number
  interactive_ready: boolean
  recommendation: string
  boundary: string
  input_refs: string[]
  output_refs: string[]
}

export interface StatusDialogueTtsRuntimeCandidateContext {
  config?: Pick<StatusDialogueTtsAdapterConfig, 'adapter_id' | 'enabled'>
}

export interface StatusDialogueTtsAdapterConfig {
  schema: typeof STATUS_DIALOGUE_TTS_CONFIG_SCHEMA
  enabled: boolean
  adapter_id: StatusDialogueTtsAdapterId
  base_url: string
  endpoint_path: string
  health_path: string
  api_key?: string
  model: string
  voice: string
  response_format: 'wav' | 'mp3' | 'opus' | 'pcm'
  payload_mode: StatusDialogueTtsPayloadMode
  timeout_ms: number
  allow_remote: boolean
  stream_preferred: boolean
}

export interface StatusDialogueTtsHealthResult {
  schema: typeof STATUS_DIALOGUE_TTS_HEALTH_SCHEMA
  generated_at: string
  adapter_id: StatusDialogueTtsAdapterId
  configured: boolean
  reachable: boolean
  status: 'ready' | 'fallback' | 'error'
  base_url_host: string
  latency_ms?: number
  error?: string
}

export interface StatusDialogueTtsSynthesisRequest {
  schema?: typeof STATUS_DIALOGUE_TTS_SYNTHESIS_SCHEMA
  plan: VoiceResponsePlan
  voice_profile: VoiceProfile
}

export interface StatusDialogueTtsSynthesisResult {
  schema: typeof STATUS_DIALOGUE_TTS_SYNTHESIS_SCHEMA
  generated_at: string
  success: boolean
  adapter_id: StatusDialogueTtsAdapterId
  voice_profile_id: string
  latency_ms?: number
  audio_data_url?: string
  audio_mime_type?: string
  cache_hit?: boolean
  cache_key?: string
  fallback_reason?: string
  error?: string
}

function normalizeTtsAdapterId(value: unknown, fallback: StatusDialogueTtsAdapterId): StatusDialogueTtsAdapterId {
  return value === 'cosyvoice_local_http' ||
    value === 'openai_compatible_streaming_http' ||
    value === 'custom_streaming_tts_http' ||
    value === 'edge_readaloud_websocket' ||
    value === 'browser_speech_synthesis'
    ? value
    : fallback
}

function isInteractiveFirstAudio(value: unknown, budgetMs: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= budgetMs
}

function withRuntimeEvidence(
  candidate: Omit<StatusDialogueTtsRuntimeCandidate, 'schema' | 'last_first_audio_ms' | 'last_total_request_ms' | 'interactive_ready' | 'recommendation'>,
  evidence?: StatusDialogueTtsRuntimeEvidence
): StatusDialogueTtsRuntimeCandidate {
  const lastFirstAudioMs = evidence?.adapter_id === candidate.adapter_id ? evidence.first_audio_payload_ms : undefined
  const lastTotalRequestMs = evidence?.adapter_id === candidate.adapter_id ? evidence.total_request_ms : undefined
  const nativeStreamingOk =
    candidate.supports_streaming && (evidence?.adapter_id === candidate.adapter_id ? evidence.native_streaming_supported !== false : true)
  const interactiveReady =
    candidate.enabled &&
    candidate.configured &&
    nativeStreamingOk &&
    isInteractiveFirstAudio(lastFirstAudioMs, candidate.expected_first_audio_budget_ms)

  let recommendation = 'Keep as a replaceable TTS candidate.'
  if (!candidate.configured) {
    recommendation = 'Configure this adapter before it can be used for audible output.'
  } else if (candidate.role === 'high_quality_cache' || candidate.role === 'clone_voice_high_quality') {
    recommendation = 'Use for high-quality cached phrases, completion notices, clone voice, or non-realtime output.'
  } else if (interactiveReady) {
    recommendation = 'Eligible for live dialogue primary path; keep V0/V4 latency tracing enabled.'
  } else if (candidate.role === 'live_dialogue_primary') {
    recommendation = 'Do not promote to live dialogue primary until first audible payload stays within budget.'
  }

  return {
    ...candidate,
    schema: STATUS_DIALOGUE_TTS_RUNTIME_CANDIDATE_SCHEMA,
    last_first_audio_ms: lastFirstAudioMs,
    last_total_request_ms: lastTotalRequestMs,
    interactive_ready: interactiveReady,
    recommendation
  }
}

export function buildDefaultStatusDialogueTtsRuntimeCandidates(
  evidence?: StatusDialogueTtsRuntimeEvidence,
  context: StatusDialogueTtsRuntimeCandidateContext = {}
): StatusDialogueTtsRuntimeCandidate[] {
  const configuredAdapterId = context.config?.adapter_id
  const configuredAdapterEnabled = context.config?.enabled !== false
  const adapterConfigured = (adapterId: StatusDialogueTtsAdapterId, defaultConfigured: boolean): boolean =>
    configuredAdapterId ? configuredAdapterId === adapterId : defaultConfigured
  const adapterEnabled = (adapterId: StatusDialogueTtsAdapterId, defaultEnabled: boolean): boolean =>
    configuredAdapterId ? configuredAdapterId === adapterId && configuredAdapterEnabled : defaultEnabled

  return [
    withRuntimeEvidence(
      {
        adapter_id: 'cosyvoice_local_http',
        label: 'CosyVoice local HTTP',
        role: 'high_quality_cache',
        transport: 'chunked_http',
        configured: adapterConfigured('cosyvoice_local_http', true),
        enabled: adapterEnabled('cosyvoice_local_http', true),
        replaceable: true,
        supports_streaming: true,
        supports_pcm: true,
        supports_cache: true,
        supports_voice_clone: true,
        supports_emotion: true,
        same_voice_profile_required: true,
        expected_first_audio_budget_ms: 1500,
        boundary:
          'Current local high-quality voice path. It must keep the same voice profile and should remain cache/non-realtime unless first-audio latency becomes interactive.',
        input_refs: ['voice_output_chunk.v1', 'voice_profile.v1', 'status_dialogue_tts_runtime_policy.v1'],
        output_refs: ['cosyvoice_audio_output', 'streaming_tts_audio_frame.v1', 'voice_audio_cache']
      },
      evidence
    ),
    withRuntimeEvidence(
      {
        adapter_id: 'openai_compatible_streaming_http',
        label: 'OpenAI-compatible streaming HTTP',
        role: 'live_dialogue_primary',
        transport: 'chunked_http',
        configured: adapterConfigured('openai_compatible_streaming_http', false),
        enabled: adapterEnabled('openai_compatible_streaming_http', false),
        replaceable: true,
        supports_streaming: true,
        supports_pcm: true,
        supports_cache: true,
        supports_voice_clone: false,
        supports_emotion: true,
        same_voice_profile_required: true,
        expected_first_audio_budget_ms: 1500,
        boundary:
          'Future low-latency streaming candidate. It must preserve the same audible voice profile contract before replacing the current primary path.',
        input_refs: ['voice_output_chunk.v1', 'voice_profile.v1', 'openai_compatible_tts_config.v1'],
        output_refs: ['streaming_tts_audio_frame.v1', 'audio_frame_stream.v1', 'voice_playback_queue.v1']
      },
      evidence
    ),
    withRuntimeEvidence(
      {
        adapter_id: 'edge_readaloud_websocket',
        label: 'Edge Read Aloud WebSocket',
        role: 'live_dialogue_primary',
        transport: 'websocket',
        configured: adapterConfigured('edge_readaloud_websocket', false),
        enabled: adapterEnabled('edge_readaloud_websocket', false),
        replaceable: true,
        supports_streaming: true,
        supports_pcm: false,
        supports_cache: true,
        supports_voice_clone: false,
        supports_emotion: true,
        same_voice_profile_required: true,
        expected_first_audio_budget_ms: 1500,
        boundary:
          'Real remote WebSocket streaming candidate for low-latency live dialogue. It must remain replaceable and cannot bypass the same-voice, latency trace, or no-browser-audible-TTS rules.',
        input_refs: ['voice_output_chunk.v1', 'voice_profile.v1', 'edge_readaloud_tts_config.v1'],
        output_refs: ['streaming_tts_audio_frame.v1', 'audio_frame_stream.v1', 'voice_playback_queue.v1']
      },
      evidence
    ),
    withRuntimeEvidence(
      {
        adapter_id: 'custom_streaming_tts_http',
        label: 'Custom streaming TTS HTTP',
        role: 'live_dialogue_primary',
        transport: 'chunked_http',
        configured: adapterConfigured('custom_streaming_tts_http', false),
        enabled: adapterEnabled('custom_streaming_tts_http', false),
        replaceable: true,
        supports_streaming: true,
        supports_pcm: true,
        supports_cache: true,
        supports_voice_clone: true,
        supports_emotion: true,
        same_voice_profile_required: true,
        expected_first_audio_budget_ms: 1500,
        boundary:
          'Generic vendor-neutral streaming slot for a faster local or remote TTS engine. It cannot bypass the same-voice and latency trace rules.',
        input_refs: ['voice_output_chunk.v1', 'voice_profile.v1', 'custom_streaming_tts_config.v1'],
        output_refs: ['streaming_tts_audio_frame.v1', 'audio_frame_stream.v1', 'voice_playback_queue.v1']
      },
      evidence
    )
  ]
}

export function selectStatusDialogueTtsRuntimeCandidate(
  candidates: StatusDialogueTtsRuntimeCandidate[]
): StatusDialogueTtsRuntimeCandidate {
  const liveReady = candidates
    .filter((candidate) => candidate.role === 'live_dialogue_primary' && candidate.interactive_ready)
    .sort((a, b) => (a.last_first_audio_ms ?? Infinity) - (b.last_first_audio_ms ?? Infinity))[0]
  if (liveReady) return liveReady

  return (
    candidates.find((candidate) => candidate.adapter_id === 'cosyvoice_local_http') ??
    candidates.find((candidate) => candidate.enabled && candidate.configured) ??
    candidates[0]
  )
}

export const DEFAULT_COSYVOICE_TTS_CONFIG: StatusDialogueTtsAdapterConfig = {
  schema: STATUS_DIALOGUE_TTS_CONFIG_SCHEMA,
  enabled: true,
  adapter_id: 'cosyvoice_local_http',
  base_url: 'http://127.0.0.1:8000',
  endpoint_path: '/api/v1/audio/speech',
  health_path: '/health',
  model: 'cosyvoice',
  voice: 'default',
  response_format: 'wav',
  payload_mode: 'openai_compatible',
  timeout_ms: 60000,
  allow_remote: false,
  stream_preferred: true
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

export function normalizeStatusDialogueTtsConfig(raw: unknown): StatusDialogueTtsAdapterConfig {
  const source = isRecord(raw) ? raw : {}
  const defaults = DEFAULT_COSYVOICE_TTS_CONFIG
  const rawResponseFormat = source.response_format ?? source.responseFormat
  const rawPayloadMode = source.payload_mode ?? source.payloadMode
  const responseFormat =
    rawResponseFormat === 'mp3' ||
    rawResponseFormat === 'opus' ||
    rawResponseFormat === 'pcm' ||
    rawResponseFormat === 'wav'
      ? rawResponseFormat
      : defaults.response_format
  const payloadMode =
    rawPayloadMode === 'cosyvoice_simple' || rawPayloadMode === 'openai_compatible' ? rawPayloadMode : defaults.payload_mode

  return {
    schema: STATUS_DIALOGUE_TTS_CONFIG_SCHEMA,
    enabled: pickBoolean(source.enabled, defaults.enabled),
    adapter_id: normalizeTtsAdapterId(source.adapter_id ?? source.adapterId, defaults.adapter_id),
    base_url: pickString(source.base_url ?? source.baseURL ?? source.baseUrl, defaults.base_url),
    endpoint_path: pickString(source.endpoint_path ?? source.endpointPath, defaults.endpoint_path),
    health_path: pickString(source.health_path ?? source.healthPath, defaults.health_path),
    api_key: pickString(source.api_key ?? source.apiKey, ''),
    model: pickString(source.model, defaults.model),
    voice: pickString(source.voice, defaults.voice),
    response_format: responseFormat,
    payload_mode: payloadMode,
    timeout_ms: Math.max(1000, Math.min(60000, pickNumber(source.timeout_ms ?? source.timeoutMs, defaults.timeout_ms))),
    allow_remote: pickBoolean(source.allow_remote ?? source.allowRemote, defaults.allow_remote),
    stream_preferred: pickBoolean(source.stream_preferred ?? source.streamPreferred, defaults.stream_preferred)
  }
}

export function buildCosyVoiceRequestBody(config: StatusDialogueTtsAdapterConfig, plan: VoiceResponsePlan): Record<string, unknown> {
  if (config.payload_mode === 'cosyvoice_simple') {
    return {
      text: plan.text,
      voice: config.voice,
      speed: plan.speed,
      pitch: plan.pitch,
      format: config.response_format,
      stream: config.stream_preferred
    }
  }

  return {
    model: config.model,
    input: plan.text,
    voice: config.voice,
    response_format: config.response_format,
    speed: plan.speed,
    stream: config.stream_preferred
  }
}
