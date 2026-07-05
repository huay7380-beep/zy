export const XIAOZHI_STYLE_VOICE_BRIDGE_CONFIG_SCHEMA = 'xiaozhi_style_voice_bridge_config.v1'
export const XIAOZHI_STYLE_VOICE_BRIDGE_EVENT_SCHEMA = 'xiaozhi_style_voice_bridge_event.v1'
export const XIAOZHI_STYLE_VOICE_BRIDGE_STATE_SCHEMA = 'xiaozhi_style_voice_bridge_state.v1'
export const XIAOZHI_STYLE_WAKE_CONFIG_SCHEMA = 'xiaozhi_style_wake_config.v1'
export const XIAOZHI_STYLE_VAD_PRECHECK_SCHEMA = 'xiaozhi_style_vad_precheck.v1'
export const XIAOZHI_STYLE_WAKE_DETECTOR_ADAPTER_SCHEMA = 'xiaozhi_style_wake_detector_adapter.v1'
export const XIAOZHI_STYLE_WAKE_DETECTOR_STATE_SCHEMA = 'xiaozhi_style_wake_detector_state.v1'

export type XiaozhiStyleBridgeMode = 'route_a_virtual_desktop_device'
export type XiaozhiStyleAudioCodec = 'text_event_bridge' | 'opus_reserved'
export type XiaozhiStyleVoiceInputMode = 'manual_click' | 'continuous_vad' | 'wake_word' | 'semantic_wake' | 'hybrid'
export type XiaozhiStyleWakeWordMode = 'local_keyword' | 'semantic' | 'hybrid'
export type XiaozhiStyleVadPrecheckStatus = 'idle' | 'checking' | 'voice_detected' | 'silence' | 'blocked' | 'error'
export type XiaozhiStyleWakeDetectorAdapterId =
  | 'none'
  | 'browser_phrase_match_reserved'
  | 'sherpa_onnx_reserved'
  | 'openwakeword_reserved'
  | 'porcupine_reserved'
export type XiaozhiStyleWakeDetectorRuntime = 'not_configured' | 'configured_disabled' | 'ready' | 'blocked' | 'error'
export type XiaozhiStyleVoiceBridgeStage =
  | 'idle'
  | 'hello'
  | 'listening'
  | 'stt'
  | 'llm'
  | 'tts'
  | 'playing'
  | 'complete'
  | 'aborted'
  | 'error'

export type XiaozhiStyleVoiceBridgeEventType =
  | 'hello'
  | 'listen_start'
  | 'listen_detect'
  | 'listen_stop'
  | 'stt_result'
  | 'llm_start'
  | 'llm_emotion'
  | 'tts_start'
  | 'tts_sentence_start'
  | 'tts_stop'
  | 'abort'
  | 'complete'
  | 'error'

export const XIAOZHI_STYLE_DIALOGUE_POLICY_STAGE_ORDER: XiaozhiStyleVoiceBridgeStage[] = [
  'idle',
  'listening',
  'stt',
  'llm',
  'tts',
  'playing',
  'complete',
  'error'
]

export const XIAOZHI_STYLE_DIALOGUE_POLICY_BOUNDARY = [
  'manual_stt_remains_available',
  'wake_window_does_not_equal_full_continuous_listening',
  'tts_playback_pauses_wake_detector_only',
  'formal_stt_and_manual_input_remain_available_during_tts',
  'full_duplex_requires_echo_filter_before_enablement',
  'route_a_virtual_desktop_device_only',
  'no_xiaozhi_hardware_firmware_or_ota'
]

export type XiaozhiStyleEmotion =
  | 'neutral'
  | 'focused'
  | 'warm'
  | 'urgent'
  | 'reflective'
  | 'steady'

export interface XiaozhiStyleVoiceBridgeConfig {
  schema: typeof XIAOZHI_STYLE_VOICE_BRIDGE_CONFIG_SCHEMA
  enabled: boolean
  mode: XiaozhiStyleBridgeMode
  virtual_device_id: string
  audio_codec: XiaozhiStyleAudioCodec
  source_model: 'xiaozhi_style_reference'
  route_a_boundary: string[]
}

export interface XiaozhiStyleVoiceBridgeEvent {
  schema: typeof XIAOZHI_STYLE_VOICE_BRIDGE_EVENT_SCHEMA
  event_id: string
  generated_at: string
  session_id: string
  type: XiaozhiStyleVoiceBridgeEventType
  stage: XiaozhiStyleVoiceBridgeStage
  emotion: XiaozhiStyleEmotion
  source: 'virtual_desktop_panel' | 'chrome_stt_bridge' | 'local_stt' | 'dialogue_model' | 'cosyvoice_tts' | 'browser_tts'
  text?: string
  latency_ms?: number
  error?: string
  refs: string[]
}

export interface XiaozhiStyleVoiceBridgeState {
  schema: typeof XIAOZHI_STYLE_VOICE_BRIDGE_STATE_SCHEMA
  generated_at: string
  session_id: string
  stage: XiaozhiStyleVoiceBridgeStage
  emotion: XiaozhiStyleEmotion
  listen_active: boolean
  speaking_active: boolean
  transcript_preview: string
  last_sentence: string
  last_event_type: XiaozhiStyleVoiceBridgeEventType | 'none'
  event_count: number
  route_a_boundary: string[]
}

export interface XiaozhiStyleWakeConfig {
  schema: typeof XIAOZHI_STYLE_WAKE_CONFIG_SCHEMA
  voice_input_mode: XiaozhiStyleVoiceInputMode
  continuous_listen_enabled: boolean
  wake_word: {
    enabled: boolean
    mode: XiaozhiStyleWakeWordMode
    phrases: string[]
    sensitivity: number
    wake_window_ms: number
    cooldown_ms: number
    pause_while_tts_playing: boolean
    store_raw_audio: boolean
  }
  vad_precheck: {
    enabled: boolean
    precheck_ms: number
    sample_window_ms: number
    rms_threshold: number
    min_voice_ms: number
  }
}

export interface XiaozhiStyleVadPrecheckState {
  schema: typeof XIAOZHI_STYLE_VAD_PRECHECK_SCHEMA
  generated_at: string
  status: XiaozhiStyleVadPrecheckStatus
  active: boolean
  input_mode: XiaozhiStyleVoiceInputMode
  wake_enabled: boolean
  dialogue_triggered: false
  store_raw_audio: false
  checked_ms: number
  voice_ms: number
  rms_level: number
  peak_level: number
  threshold: number
  reason: string
}

export interface XiaozhiStyleWakeDetectorAdapterConfig {
  schema: typeof XIAOZHI_STYLE_WAKE_DETECTOR_ADAPTER_SCHEMA
  adapter_id: XiaozhiStyleWakeDetectorAdapterId
  enabled: boolean
  runtime: 'renderer' | 'main_process' | 'external_local_service'
  phrase_source: 'wake_config_phrases'
  requires_continuous_audio: boolean
  requires_vad_gate: boolean
  tts_playback_gate_required: boolean
  tts_playback_policy: 'pause_wake_detector_only'
  input_during_tts_policy: 'input_stream_allowed_echo_filter_required'
  store_raw_audio: false
  raw_audio_persistence_control: 'separate_confirmation_visible_toggle_required'
  output_event: 'wake_detected'
  boundary: string[]
}

export interface XiaozhiStyleWakeDetectorState {
  schema: typeof XIAOZHI_STYLE_WAKE_DETECTOR_STATE_SCHEMA
  generated_at: string
  adapter_id: XiaozhiStyleWakeDetectorAdapterId
  runtime: XiaozhiStyleWakeDetectorRuntime
  enabled: boolean
  continuous_listen_enabled: boolean
  wake_window_open: boolean
  wake_window_ms: number
  cooldown_ms: number
  phrase_count: number
  last_detected_phrase: string
  confidence: number
  dialogue_triggered: boolean
  store_raw_audio: false
  blocked_reason: string
  tts_playback_policy: XiaozhiStyleWakeDetectorAdapterConfig['tts_playback_policy']
  input_during_tts_policy: XiaozhiStyleWakeDetectorAdapterConfig['input_during_tts_policy']
  boundary: string[]
}

export const DEFAULT_XIAOZHI_STYLE_VOICE_BRIDGE_CONFIG: XiaozhiStyleVoiceBridgeConfig = {
  schema: XIAOZHI_STYLE_VOICE_BRIDGE_CONFIG_SCHEMA,
  enabled: true,
  mode: 'route_a_virtual_desktop_device',
  virtual_device_id: 'subject-status-dialogue.virtual-xiaozhi-device',
  audio_codec: 'text_event_bridge',
  source_model: 'xiaozhi_style_reference',
  route_a_boundary: [
    'no_esp32_firmware_flash',
    'no_hardware_ota',
    'no_physical_device_binding',
    'no_raw_audio_persistence',
    'no_world_model_write',
    'status_dialogue_only'
  ]
}

export const DEFAULT_XIAOZHI_STYLE_WAKE_CONFIG: XiaozhiStyleWakeConfig = {
  schema: XIAOZHI_STYLE_WAKE_CONFIG_SCHEMA,
  voice_input_mode: 'manual_click',
  continuous_listen_enabled: false,
  wake_word: {
    enabled: false,
    mode: 'local_keyword',
    phrases: ['小张', '高手', '小天才'],
    sensitivity: 0.65,
    wake_window_ms: 8000,
    cooldown_ms: 1500,
    pause_while_tts_playing: true,
    store_raw_audio: false
  },
  vad_precheck: {
    enabled: true,
    precheck_ms: 1600,
    sample_window_ms: 80,
    rms_threshold: 0.018,
    min_voice_ms: 260
  }
}

export const DEFAULT_XIAOZHI_STYLE_WAKE_DETECTOR_ADAPTER_CONFIG: XiaozhiStyleWakeDetectorAdapterConfig = {
  schema: XIAOZHI_STYLE_WAKE_DETECTOR_ADAPTER_SCHEMA,
  adapter_id: 'none',
  enabled: false,
  runtime: 'renderer',
  phrase_source: 'wake_config_phrases',
  requires_continuous_audio: true,
  requires_vad_gate: true,
  tts_playback_gate_required: true,
  tts_playback_policy: 'pause_wake_detector_only',
  input_during_tts_policy: 'input_stream_allowed_echo_filter_required',
  store_raw_audio: false,
  raw_audio_persistence_control: 'separate_confirmation_visible_toggle_required',
  output_event: 'wake_detected',
  boundary: [
    'manual_click_remains_default',
    'no_background_listening_until_user_confirmation',
    'no_raw_audio_persistence',
    'raw_audio_requires_separate_confirmation_and_visible_toggle',
    'no_dialogue_submit_before_wake_detected',
    'tts_playback_pauses_wake_detector_only',
    'input_stream_not_blocked_by_wake_gate',
    'playback_echo_filter_required_for_full_duplex',
    'status_dialogue_only'
  ]
}

function compactText(value: string | undefined, maxLength: number): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim()
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 1))}…` : normalized
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

function eventStage(type: XiaozhiStyleVoiceBridgeEventType): XiaozhiStyleVoiceBridgeStage {
  if (type === 'hello') return 'hello'
  if (type === 'listen_start' || type === 'listen_detect') return 'listening'
  if (type === 'listen_stop' || type === 'stt_result') return 'stt'
  if (type === 'llm_start' || type === 'llm_emotion') return 'llm'
  if (type === 'tts_start' || type === 'tts_sentence_start') return 'tts'
  if (type === 'tts_stop') return 'playing'
  if (type === 'abort') return 'aborted'
  if (type === 'error') return 'error'
  return 'complete'
}

function eventSource(type: XiaozhiStyleVoiceBridgeEventType): XiaozhiStyleVoiceBridgeEvent['source'] {
  if (type === 'listen_start' || type === 'listen_detect' || type === 'listen_stop' || type === 'stt_result') {
    return 'chrome_stt_bridge'
  }
  if (type === 'llm_start' || type === 'llm_emotion') return 'dialogue_model'
  if (type === 'tts_start' || type === 'tts_sentence_start' || type === 'tts_stop') return 'cosyvoice_tts'
  return 'virtual_desktop_panel'
}

export function createXiaozhiStyleVoiceBridgeEvent({
  type,
  sessionId,
  emotion = 'focused',
  source,
  text,
  latencyMs,
  error,
  refs = []
}: {
  type: XiaozhiStyleVoiceBridgeEventType
  sessionId: string
  emotion?: XiaozhiStyleEmotion
  source?: XiaozhiStyleVoiceBridgeEvent['source']
  text?: string
  latencyMs?: number
  error?: string
  refs?: string[]
}): XiaozhiStyleVoiceBridgeEvent {
  const generatedAt = new Date().toISOString()
  return {
    schema: XIAOZHI_STYLE_VOICE_BRIDGE_EVENT_SCHEMA,
    event_id: `xiaozhi_bridge_${generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`,
    generated_at: generatedAt,
    session_id: sessionId,
    type,
    stage: eventStage(type),
    emotion,
    source: source ?? eventSource(type),
    text: compactText(text, 180) || undefined,
    latency_ms: latencyMs,
    error: error ? compactText(error, 160) : undefined,
    refs
  }
}

export function buildDefaultXiaozhiStyleVoiceBridgeState(
  sessionId = 'xiaozhi-style-voice-bridge-idle'
): XiaozhiStyleVoiceBridgeState {
  return {
    schema: XIAOZHI_STYLE_VOICE_BRIDGE_STATE_SCHEMA,
    generated_at: new Date().toISOString(),
    session_id: sessionId,
    stage: 'idle',
    emotion: 'neutral',
    listen_active: false,
    speaking_active: false,
    transcript_preview: '',
    last_sentence: '',
    last_event_type: 'none',
    event_count: 0,
    route_a_boundary: DEFAULT_XIAOZHI_STYLE_VOICE_BRIDGE_CONFIG.route_a_boundary
  }
}

export function buildDefaultXiaozhiStyleVadPrecheckState(
  config: XiaozhiStyleWakeConfig = DEFAULT_XIAOZHI_STYLE_WAKE_CONFIG
): XiaozhiStyleVadPrecheckState {
  return {
    schema: XIAOZHI_STYLE_VAD_PRECHECK_SCHEMA,
    generated_at: new Date().toISOString(),
    status: 'idle',
    active: false,
    input_mode: config.voice_input_mode,
    wake_enabled: config.wake_word.enabled,
    dialogue_triggered: false,
    store_raw_audio: false,
    checked_ms: 0,
    voice_ms: 0,
    rms_level: 0,
    peak_level: 0,
    threshold: config.vad_precheck.rms_threshold,
    reason: 'manual STT remains the default; VAD precheck has not run'
  }
}

export function buildXiaozhiStyleVadPrecheckState({
  status,
  config = DEFAULT_XIAOZHI_STYLE_WAKE_CONFIG,
  checkedMs,
  voiceMs,
  rmsLevel,
  peakLevel,
  reason
}: {
  status: XiaozhiStyleVadPrecheckStatus
  config?: XiaozhiStyleWakeConfig
  checkedMs: number
  voiceMs: number
  rmsLevel: number
  peakLevel: number
  reason: string
}): XiaozhiStyleVadPrecheckState {
  return {
    schema: XIAOZHI_STYLE_VAD_PRECHECK_SCHEMA,
    generated_at: new Date().toISOString(),
    status,
    active: status === 'checking',
    input_mode: config.voice_input_mode,
    wake_enabled: config.wake_word.enabled,
    dialogue_triggered: false,
    store_raw_audio: false,
    checked_ms: Math.max(0, Math.round(checkedMs)),
    voice_ms: Math.max(0, Math.round(voiceMs)),
    rms_level: clampNumber(rmsLevel, 0, 1),
    peak_level: clampNumber(peakLevel, 0, 1),
    threshold: config.vad_precheck.rms_threshold,
    reason: compactText(reason, 160)
  }
}

export function buildDefaultXiaozhiStyleWakeDetectorState({
  wakeConfig = DEFAULT_XIAOZHI_STYLE_WAKE_CONFIG,
  detectorConfig = DEFAULT_XIAOZHI_STYLE_WAKE_DETECTOR_ADAPTER_CONFIG,
  blockedReason
}: {
  wakeConfig?: XiaozhiStyleWakeConfig
  detectorConfig?: XiaozhiStyleWakeDetectorAdapterConfig
  blockedReason?: string
} = {}): XiaozhiStyleWakeDetectorState {
  const runtime: XiaozhiStyleWakeDetectorRuntime =
    detectorConfig.adapter_id === 'none'
      ? 'not_configured'
      : detectorConfig.enabled && wakeConfig.wake_word.enabled && wakeConfig.continuous_listen_enabled
        ? 'ready'
        : 'configured_disabled'
  return {
    schema: XIAOZHI_STYLE_WAKE_DETECTOR_STATE_SCHEMA,
    generated_at: new Date().toISOString(),
    adapter_id: detectorConfig.adapter_id,
    runtime,
    enabled: detectorConfig.enabled,
    continuous_listen_enabled: wakeConfig.continuous_listen_enabled,
    wake_window_open: false,
    wake_window_ms: wakeConfig.wake_word.wake_window_ms,
    cooldown_ms: wakeConfig.wake_word.cooldown_ms,
    phrase_count: wakeConfig.wake_word.phrases.length,
    last_detected_phrase: '',
    confidence: 0,
    dialogue_triggered: false,
    store_raw_audio: false,
    blocked_reason:
      blockedReason ??
      (runtime === 'not_configured'
        ? 'W3 detector adapter is not selected; manual STT remains the only active input'
        : runtime === 'configured_disabled'
          ? 'W3 detector adapter is configured but disabled by wake config'
          : ''),
    tts_playback_policy: detectorConfig.tts_playback_policy,
    input_during_tts_policy: detectorConfig.input_during_tts_policy,
    boundary: detectorConfig.boundary
  }
}

export function reduceXiaozhiStyleVoiceBridgeEvent(
  current: XiaozhiStyleVoiceBridgeState,
  event: XiaozhiStyleVoiceBridgeEvent
): XiaozhiStyleVoiceBridgeState {
  const listenActive =
    event.type === 'listen_start' || event.type === 'listen_detect'
      ? true
      : event.type === 'listen_stop' || event.type === 'stt_result' || event.type === 'abort' || event.type === 'error'
        ? false
        : current.listen_active
  const speakingActive =
    event.type === 'tts_start' || event.type === 'tts_sentence_start'
      ? true
      : event.type === 'tts_stop' || event.type === 'complete' || event.type === 'abort' || event.type === 'error'
        ? false
        : current.speaking_active

  return {
    ...current,
    generated_at: event.generated_at,
    session_id: event.session_id,
    stage: event.stage,
    emotion: event.emotion,
    listen_active: listenActive,
    speaking_active: speakingActive,
    transcript_preview:
      event.type === 'stt_result' || event.type === 'listen_detect'
        ? compactText(event.text, 72)
        : event.type === 'abort'
          ? ''
          : current.transcript_preview,
    last_sentence:
      event.type === 'tts_sentence_start' || event.type === 'tts_stop'
        ? compactText(event.text, 72)
        : event.type === 'error'
          ? compactText(event.error, 72)
          : current.last_sentence,
    last_event_type: event.type,
    event_count: current.event_count + 1
  }
}

export function summarizeXiaozhiStyleBridgeState(state: XiaozhiStyleVoiceBridgeState): string {
  const active = state.listen_active ? 'listening' : state.speaking_active ? 'speaking' : state.stage
  return `${active} / ${state.emotion} / ${state.event_count} events`
}

export function buildXiaozhiStyleDialoguePolicyMapping(state: XiaozhiStyleVoiceBridgeState): {
  policy_node: 'policy.xiaozhi_state_machine'
  current_stage: XiaozhiStyleVoiceBridgeStage
  stage_order: XiaozhiStyleVoiceBridgeStage[]
  listen_active: boolean
  speaking_active: boolean
  boundary: string[]
  refs: string[]
} {
  return {
    policy_node: 'policy.xiaozhi_state_machine',
    current_stage: state.stage,
    stage_order: XIAOZHI_STYLE_DIALOGUE_POLICY_STAGE_ORDER,
    listen_active: state.listen_active,
    speaking_active: state.speaking_active,
    boundary: XIAOZHI_STYLE_DIALOGUE_POLICY_BOUNDARY,
    refs: [
      'xiaozhi_style_voice_bridge_state.v1',
      'voice-dialogue-xiaozhi-style-bridge-plan.v1.md',
      'dialogue-policy.v1.md'
    ]
  }
}
