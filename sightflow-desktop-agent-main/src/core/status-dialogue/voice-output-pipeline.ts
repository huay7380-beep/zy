import type { VoiceEmotionPreset, VoiceProfile } from './voice-profile'
import type { VoiceResponsePlan } from './voice-response-plan'

export const VOICE_OUTPUT_CHUNK_SCHEMA = 'voice_output_chunk.v1'
export const VOICE_PLAYBACK_QUEUE_SCHEMA = 'voice_playback_queue.v1'
export const VOICE_PLAYBACK_QUEUE_SIMULATION_SCHEMA = 'voice_playback_queue_simulation.v1'
export const VOICE_LATENCY_TRACE_SCHEMA = 'voice_latency_trace.v1'
export const STREAMING_TTS_ADAPTER_SCHEMA = 'streaming_tts_adapter.v1'
export const STREAMING_TTS_FRAME_ASSEMBLY_SCHEMA = 'streaming_tts_frame_assembly.v1'
export const VOICE_RESPONSE_TEXT_STREAM_SCHEMA = 'voice_response_text_stream.v1'
export const VOICE_RESPONSE_TEXT_STREAM_EVENT_SCHEMA = 'voice_response_text_stream_event.v1'
export const STATUS_DIALOGUE_VOICE_ACK_TEXT = {
  text: '我收到文字，正在检查状态。',
  speech_transcript: '我听到了，正在检查状态。'
} as const
export const STATUS_DIALOGUE_VOICE_OPENING_TEXT = {
  ok: '我已完成当前状态巡检。',
  warn: '我看到当前状态有缺口，需要先确认。',
  blocked: '我看到当前状态被阻塞，需要先停在只读巡检。',
  unknown: '我正在巡检当前状态。'
} as const

export type VoiceOutputChunkKind = 'ack' | 'final' | 'notice' | 'error'
export type VoiceOutputPriority = 'normal' | 'notice' | 'urgent'
export type VoicePlaybackQueueStatus = 'idle' | 'synthesizing' | 'queued' | 'playing' | 'complete' | 'error'
export type VoicePipelineMode = 'high_quality_chunked' | 'high_quality_streaming_reserved'
export type VoiceOutputIntent =
  | 'patrol_ok'
  | 'patrol_warn'
  | 'patrol_blocked'
  | 'completion_notice'
  | 'casual_chat'
  | 'task_supervision'
  | 'error'
export type VoiceGlobalStatusHint = 'ok' | 'warn' | 'blocked' | 'unknown'
export type StatusDialogueVoiceAckInputKind = keyof typeof STATUS_DIALOGUE_VOICE_ACK_TEXT
export type StatusDialogueVoiceOpeningKind = keyof typeof STATUS_DIALOGUE_VOICE_OPENING_TEXT

export interface VoiceEmotionPriorityPolicy {
  intent: VoiceOutputIntent
  emotion_hint: VoiceEmotionPreset
  priority: VoiceOutputPriority
  reason: string
}

export interface VoiceResponseTextStreamState {
  schema: typeof VOICE_RESPONSE_TEXT_STREAM_SCHEMA
  stream_id: string
  accumulated_text: string
  emitted_first_sentence: boolean
  first_sentence?: string
  emitted_sentence_count: number
  emitted_text_length: number
  updated_at: string
}

export interface VoiceResponseTextStreamEvent {
  schema: typeof VOICE_RESPONSE_TEXT_STREAM_EVENT_SCHEMA
  stream_id: string
  type: 'delta' | 'first_sentence_ready' | 'sentence_ready' | 'done'
  delta?: string
  first_sentence?: string
  sentence?: string
  sentence_index?: number
  spoken_prefix?: string
  accumulated_text: string
  generated_at: string
}

export interface VoiceOutputChunk {
  schema: typeof VOICE_OUTPUT_CHUNK_SCHEMA
  chunk_id: string
  source_output_id: string
  kind: VoiceOutputChunkKind
  index: number
  total: number
  text: string
  voice_profile_id: string
  emotion_hint: VoiceEmotionPreset
  priority: VoiceOutputPriority
  cache_key: string
  interrupt_previous: boolean
}

export interface VoicePlaybackQueueState {
  schema: typeof VOICE_PLAYBACK_QUEUE_SCHEMA
  session_id: string
  mode: VoicePipelineMode
  status: VoicePlaybackQueueStatus
  voice_profile_id: string
  adapter_id: string
  active_chunk_id?: string
  queued_count: number
  completed_count: number
  failed_count: number
  cached_count: number
  updated_at: string
  last_error?: string
}

export interface VoicePlaybackQueueSimulationStep {
  phase: 'queued' | 'synthesizing' | 'cache_hit' | 'playing' | 'complete' | 'error'
  chunk_id?: string
  state: VoicePlaybackQueueState
}

export interface VoicePlaybackQueueSimulationResult {
  schema: typeof VOICE_PLAYBACK_QUEUE_SIMULATION_SCHEMA
  session_id: string
  playback_order: string[]
  synthesized_chunk_ids: string[]
  cached_chunk_ids: string[]
  failed_chunk_ids: string[]
  steps: VoicePlaybackQueueSimulationStep[]
  final_state: VoicePlaybackQueueState
  latency_trace: VoiceLatencyTrace
}

export interface VoiceLatencyTrace {
  schema: typeof VOICE_LATENCY_TRACE_SCHEMA
  trace_id: string
  session_id: string
  generated_at: string
  stt_ms?: number
  model_ms?: number
  first_tts_ms?: number
  total_tts_ms?: number
  first_playback_ms?: number
  total_playback_ms?: number
  end_to_end_ms?: number
  chunk_count: number
  cached_chunk_count: number
  failed_chunk_count: number
  slowest_stage?: 'stt' | 'model' | 'tts' | 'playback'
  segments: VoiceLatencySegment[]
}

export interface VoiceLatencySegment {
  chunk_id: string
  source_output_id: string
  kind: VoiceOutputChunkKind
  index: number
  total: number
  text_length: number
  cache_hit: boolean
  status: 'spoken' | 'skipped' | 'error'
  tts_ms?: number
  first_frame_ms?: number
  total_stream_ms?: number
  playback_ms?: number
  error?: string
}

export interface StreamingTtsAdapterDescriptor {
  schema: typeof STREAMING_TTS_ADAPTER_SCHEMA
  adapter_id: string
  transport: 'websocket' | 'sse' | 'chunked_http' | 'reserved'
  configured: boolean
  enabled: boolean
  input_refs: string[]
  output_refs: string[]
  boundary: string
}

export interface StreamingTtsAudioFrame {
  schema: 'streaming_tts_audio_frame.v1'
  frame_id: string
  chunk_id: string
  sequence: number
  audio_mime_type: string
  audio_base64: string
  final: boolean
  generated_at: string
}

export interface StreamingTtsSynthesisRequest {
  schema: 'streaming_tts_synthesis_request.v1'
  chunk: VoiceOutputChunk
  plan: VoiceResponsePlan
  voice_profile: VoiceProfile
}

export interface StreamingTtsAdapter {
  descriptor: StreamingTtsAdapterDescriptor
  synthesizeStream: (request: StreamingTtsSynthesisRequest) => AsyncIterable<StreamingTtsAudioFrame>
}

export interface StreamingTtsFrameAssemblyResult {
  schema: typeof STREAMING_TTS_FRAME_ASSEMBLY_SCHEMA
  generated_at: string
  chunk_id: string
  audio_mime_type: string
  audio_base64: string
  audio_data_url: string
  audio_frame_count: number
  final_frame_count: number
  ordered: boolean
  errors: string[]
}

export interface BufferedStreamingTtsSynthesisResult {
  audio_base64: string
  audio_mime_type: string
  generated_at?: string
}

export interface CreateBufferedStreamingTtsAdapterOptions {
  adapterId: string
  transport?: Exclude<StreamingTtsAdapterDescriptor['transport'], 'reserved'>
  enabled?: boolean
  frameBase64Chars?: number
  boundary?: string
  synthesize: (request: StreamingTtsSynthesisRequest) => Promise<BufferedStreamingTtsSynthesisResult>
}

export interface HttpStreamingTtsFetchRequest {
  url: string
  init?: RequestInit
  audio_mime_type?: string
}

export interface CreateHttpStreamingTtsAdapterOptions {
  adapterId: string
  enabled?: boolean
  boundary?: string
  fetchImpl?: typeof fetch
  buildRequest: (
    request: StreamingTtsSynthesisRequest
  ) => HttpStreamingTtsFetchRequest | Promise<HttpStreamingTtsFetchRequest>
}

export interface SegmentVoicePlanOptions {
  kind: VoiceOutputChunkKind
  priority?: VoiceOutputPriority
  emotionHint?: VoiceEmotionPreset
  maxChars?: number
  minChars?: number
  interruptPrevious?: boolean
}

export function buildStatusDialogueVoiceAckText(inputKind: StatusDialogueVoiceAckInputKind): string {
  return STATUS_DIALOGUE_VOICE_ACK_TEXT[inputKind]
}

export function buildStatusDialogueVoiceOpeningText(input: {
  globalStatus?: VoiceGlobalStatusHint | string
  missingStatusCount?: number
  staleStatusCount?: number
  conflictCount?: number
  readErrorCount?: number
  hasError?: boolean
} = {}): string {
  const status = input.globalStatus === 'ok' ||
    input.globalStatus === 'warn' ||
    input.globalStatus === 'blocked' ||
    input.globalStatus === 'unknown'
    ? input.globalStatus
    : 'unknown'
  const missingStatusCount = Math.max(0, input.missingStatusCount ?? 0)
  const staleStatusCount = Math.max(0, input.staleStatusCount ?? 0)
  const conflictCount = Math.max(0, input.conflictCount ?? 0)
  const readErrorCount = Math.max(0, input.readErrorCount ?? 0)
  const problemCount =
    missingStatusCount +
    staleStatusCount +
    conflictCount +
    readErrorCount
  if (input.hasError || status === 'blocked') return STATUS_DIALOGUE_VOICE_OPENING_TEXT.blocked
  if (missingStatusCount > 0) return `我看到 ${missingStatusCount} 个模块还没有状态卡，先按只读巡检继续。`
  if (staleStatusCount > 0) return `我看到 ${staleStatusCount} 个状态卡已经过期，先按最新可读快照巡检。`
  if (conflictCount > 0) return `我看到 ${conflictCount} 个模块状态有冲突，先用最新卡片并保留冲突。`
  if (readErrorCount > 0) return `我看到 ${readErrorCount} 个状态读取错误，先把错误作为巡检重点。`
  if (status === 'warn' || problemCount > 0) return '我看到当前巡检有风险项，先说清依据和下一步。'
  if (status === 'ok') return STATUS_DIALOGUE_VOICE_OPENING_TEXT.ok
  return STATUS_DIALOGUE_VOICE_OPENING_TEXT.unknown
}

function compactVoiceText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function splitCandidateSentences(text: string): string[] {
  const normalized = compactVoiceText(text)
  if (!normalized) return []
  const sentencePattern = /[^\u3002\uff01\uff1f\uff1b.!?;]+[\u3002\uff01\uff1f\uff1b.!?;]?/g
  const matches = normalized.match(sentencePattern)
  return matches?.map((item) => item.trim()).filter(Boolean) ?? [normalized]
}

function splitLongSentence(sentence: string, maxChars: number): string[] {
  if (sentence.length <= maxChars) return [sentence]
  const chunks: string[] = []
  let cursor = 0
  while (cursor < sentence.length) {
    chunks.push(sentence.slice(cursor, cursor + maxChars).trim())
    cursor += maxChars
  }
  return chunks.filter(Boolean)
}

function hasSpeakableContent(sentence: string): boolean {
  return /[0-9A-Za-z\u3400-\u9fff]/.test(sentence)
}

function mergeVoiceTextFragments(left: string, right: string): string {
  const leftText = compactVoiceText(left)
  const rightText = compactVoiceText(right)
  if (!leftText) return rightText
  if (!rightText) return leftText
  if (/[\u3002\uff01\uff1f\uff1b.!?;]$/.test(leftText) && /^[\u3002\uff01\uff1f\uff1b.!?;]+$/.test(rightText)) return leftText
  return compactVoiceText(`${leftText}${rightText}`)
}

function mergeVoiceSentenceParts(parts: string[], minChars: number, maxChars: number): string[] {
  const merged: string[] = []

  for (const part of parts) {
    const sentence = compactVoiceText(part)
    if (!sentence) continue

    const previous = merged[merged.length - 1]
    if (!hasSpeakableContent(sentence)) {
      if (previous) merged[merged.length - 1] = mergeVoiceTextFragments(previous, sentence)
      continue
    }

    if (
      previous &&
      (previous.length < minChars || sentence.length < minChars) &&
      mergeVoiceTextFragments(previous, sentence).length <= Math.max(maxChars, previous.length + minChars)
    ) {
      merged[merged.length - 1] = mergeVoiceTextFragments(previous, sentence)
      continue
    }

    merged.push(sentence)
  }

  if (merged.length > 1 && merged[merged.length - 1].length < minChars) {
    const last = merged.pop()
    if (last) merged[merged.length - 1] = mergeVoiceTextFragments(merged[merged.length - 1], last)
  }

  return merged
}

function normalizeBase64FrameSize(value: number | undefined): number {
  const raw = Number.isFinite(value) ? Math.max(4, Math.floor(value ?? 4096)) : 4096
  return Math.max(4, raw - (raw % 4))
}

function uint8ArrayToBase64(value: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let cursor = 0; cursor < value.length; cursor += chunkSize) {
    const chunk = value.subarray(cursor, cursor + chunkSize)
    for (let index = 0; index < chunk.length; index += 1) {
      binary += String.fromCharCode(chunk[index])
    }
  }
  return btoa(binary)
}

function base64ToUint8Array(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function concatUint8Arrays(values: Uint8Array[]): Uint8Array {
  const totalLength = values.reduce((total, item) => total + item.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const item of values) {
    result.set(item, offset)
    offset += item.length
  }
  return result
}

async function* responseBodyToUint8Chunks(body: Response['body']): AsyncIterable<Uint8Array> {
  if (!body) return
  if ('getReader' in body && typeof body.getReader === 'function') {
    const reader = body.getReader()
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        if (next.value?.length) yield next.value
      }
    } finally {
      reader.releaseLock()
    }
    return
  }

  const iterable = body as unknown as AsyncIterable<Uint8Array>
  if (iterable && typeof iterable[Symbol.asyncIterator] === 'function') {
    for await (const chunk of iterable) {
      if (chunk?.length) yield chunk
    }
  }
}

function findNextCompleteVoiceSentence(
  text: string,
  emittedTextLength: number,
  minChars: number
): { sentence: string; endIndex: number } | undefined {
  const normalized = compactVoiceText(text)
  if (normalized.length <= emittedTextLength) return undefined
  const remaining = normalized.slice(emittedTextLength).trimStart()
  const skipped = normalized.length - emittedTextLength - remaining.length
  if (remaining.length < minChars) return undefined
  const match = remaining.match(/^(.+?[\u3002\uff01\uff1f\uff1b.!?;])/)
  if (!match?.[1]) return undefined
  const sentence = match[1].trim()
  if (sentence.length < minChars) return undefined
  return {
    sentence,
    endIndex: emittedTextLength + skipped + match[1].length
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function extractPartialJsonStringField(text: string, fieldName: string): string {
  const match = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*"`).exec(text)
  if (!match) return ''

  let value = ''
  let escaped = false
  for (let cursor = match.index + match[0].length; cursor < text.length; cursor += 1) {
    const char = text[cursor]
    if (escaped) {
      if (char === 'n') value += '\n'
      else if (char === 'r') value += '\r'
      else if (char === 't') value += '\t'
      else value += char
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') break
    value += char
  }
  return value
}

export function buildDefaultVoiceResponseTextStreamState(input: {
  streamId: string
  generatedAt?: string
}): VoiceResponseTextStreamState {
  return {
    schema: VOICE_RESPONSE_TEXT_STREAM_SCHEMA,
    stream_id: input.streamId,
    accumulated_text: '',
    emitted_first_sentence: false,
    emitted_sentence_count: 0,
    emitted_text_length: 0,
    updated_at: input.generatedAt ?? new Date().toISOString()
  }
}

export function appendVoiceResponseTextDelta(
  state: VoiceResponseTextStreamState,
  delta: string,
  options: { minFirstSentenceChars?: number; generatedAt?: string } = {}
): { state: VoiceResponseTextStreamState; events: VoiceResponseTextStreamEvent[] } {
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const accumulatedText = compactVoiceText(`${state.accumulated_text}${delta}`)
  const events: VoiceResponseTextStreamEvent[] = [
    {
      schema: VOICE_RESPONSE_TEXT_STREAM_EVENT_SCHEMA,
      stream_id: state.stream_id,
      type: 'delta',
      delta,
      accumulated_text: accumulatedText,
      generated_at: generatedAt
    }
  ]
  let firstSentence = state.first_sentence
  let emittedFirstSentence = state.emitted_first_sentence
  let emittedSentenceCount = state.emitted_sentence_count ?? 0
  let emittedTextLength = state.emitted_text_length ?? 0

  while (true) {
    const nextSentence = findNextCompleteVoiceSentence(
      accumulatedText,
      emittedTextLength,
      options.minFirstSentenceChars ?? 8
    )
    if (!nextSentence) break
    emittedSentenceCount += 1
    emittedTextLength = nextSentence.endIndex
    if (!emittedFirstSentence) {
      firstSentence = nextSentence.sentence
      emittedFirstSentence = true
      events.push({
        schema: VOICE_RESPONSE_TEXT_STREAM_EVENT_SCHEMA,
        stream_id: state.stream_id,
        type: 'first_sentence_ready',
        first_sentence: firstSentence,
        accumulated_text: accumulatedText,
        generated_at: generatedAt
      })
    }
    events.push({
      schema: VOICE_RESPONSE_TEXT_STREAM_EVENT_SCHEMA,
      stream_id: state.stream_id,
      type: 'sentence_ready',
      sentence: nextSentence.sentence,
      sentence_index: emittedSentenceCount,
      spoken_prefix: compactVoiceText(accumulatedText.slice(0, emittedTextLength)),
      accumulated_text: accumulatedText,
      generated_at: generatedAt
    })
  }

  return {
    state: {
      ...state,
      accumulated_text: accumulatedText,
      emitted_first_sentence: emittedFirstSentence,
      first_sentence: firstSentence,
      emitted_sentence_count: emittedSentenceCount,
      emitted_text_length: emittedTextLength,
      updated_at: generatedAt
    },
    events
  }
}

export function finishVoiceResponseTextStream(
  state: VoiceResponseTextStreamState,
  options: { generatedAt?: string } = {}
): { state: VoiceResponseTextStreamState; event: VoiceResponseTextStreamEvent } {
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const finalState = {
    ...state,
    accumulated_text: compactVoiceText(state.accumulated_text),
    updated_at: generatedAt
  }
  return {
    state: finalState,
    event: {
      schema: VOICE_RESPONSE_TEXT_STREAM_EVENT_SCHEMA,
      stream_id: state.stream_id,
      type: 'done',
      accumulated_text: finalState.accumulated_text,
      generated_at: generatedAt
    }
  }
}

export function buildVoiceChunkCacheKey(input: {
  text: string
  voiceProfile: VoiceProfile
  emotionHint: VoiceEmotionPreset
}): string {
  const normalized = compactVoiceText(input.text).toLocaleLowerCase('zh-CN')
  return [
    'voice-cache.v1',
    input.voiceProfile.profile_id,
    input.voiceProfile.voice_id,
    input.voiceProfile.adapter_id,
    input.emotionHint,
    stableHash(normalized)
  ].join(':')
}

export function deriveVoiceEmotionPriority(input: {
  intent: VoiceOutputIntent
  hasError?: boolean
  missingStatusCount?: number
  globalStatus?: VoiceGlobalStatusHint
}): VoiceEmotionPriorityPolicy {
  const missingStatusCount = Math.max(0, input.missingStatusCount ?? 0)
  const blocked = input.globalStatus === 'blocked' || input.intent === 'patrol_blocked'
  const warned = input.globalStatus === 'warn' || missingStatusCount > 0 || input.intent === 'patrol_warn'

  if (input.hasError || input.intent === 'error') {
    return {
      intent: input.intent,
      emotion_hint: 'urgent',
      priority: 'urgent',
      reason: 'error_output_requires_immediate_attention'
    }
  }

  if (blocked) {
    return {
      intent: input.intent,
      emotion_hint: 'urgent',
      priority: 'urgent',
      reason: 'blocked_status_requires_interruptible_attention'
    }
  }

  if (input.intent === 'completion_notice') {
    return {
      intent: input.intent,
      emotion_hint: 'warm',
      priority: 'notice',
      reason: 'completion_notice_should_be_clear_and_warm'
    }
  }

  if (input.intent === 'task_supervision') {
    return {
      intent: input.intent,
      emotion_hint: 'focused',
      priority: 'notice',
      reason: 'task_supervision_should_keep_attention_on_progress'
    }
  }

  if (input.intent === 'casual_chat') {
    return {
      intent: input.intent,
      emotion_hint: 'warm',
      priority: 'normal',
      reason: 'casual_chat_should_stay_natural_without_raising_priority'
    }
  }

  if (warned) {
    return {
      intent: input.intent,
      emotion_hint: 'focused',
      priority: 'notice',
      reason: 'warning_or_missing_status_requires_patrol_focus'
    }
  }

  return {
    intent: input.intent,
    emotion_hint: 'steady',
    priority: 'normal',
    reason: 'normal_patrol_output_should_remain_steady'
  }
}

export function segmentVoiceResponsePlan(
  plan: VoiceResponsePlan,
  voiceProfile: VoiceProfile,
  options: SegmentVoicePlanOptions
): VoiceOutputChunk[] {
  const maxChars = Math.max(8, options.maxChars ?? 28)
  const minChars = Math.max(4, options.minChars ?? 8)
  const priority = options.priority ?? 'normal'
  const emotionHint = options.emotionHint ?? plan.emotion_hint
  const rawSentences = splitCandidateSentences(plan.text).flatMap((sentence) => splitLongSentence(sentence, maxChars))
  const merged = mergeVoiceSentenceParts(rawSentences, minChars, maxChars)

  const sentences = merged.length > 0 ? merged : [plan.text]
  return sentences.map((text, index) => ({
    schema: VOICE_OUTPUT_CHUNK_SCHEMA,
    chunk_id: `${plan.source_output_id}:${options.kind}:${index + 1}`,
    source_output_id: plan.source_output_id,
    kind: options.kind,
    index: index + 1,
    total: sentences.length,
    text,
    voice_profile_id: voiceProfile.profile_id,
    emotion_hint: emotionHint,
    priority,
    cache_key: buildVoiceChunkCacheKey({ text, voiceProfile, emotionHint }),
    interrupt_previous: index === 0 ? options.interruptPrevious === true : false
  }))
}

export function splitAudioBase64IntoStreamingFrames(input: {
  audioBase64: string
  audioMimeType: string
  chunkId: string
  frameBase64Chars?: number
  generatedAt?: string
}): StreamingTtsAudioFrame[] {
  const normalizedAudio = input.audioBase64.replace(/\s+/g, '')
  if (!normalizedAudio) return []

  const frameSize = normalizeBase64FrameSize(input.frameBase64Chars)
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const frames: StreamingTtsAudioFrame[] = []

  for (let cursor = 0; cursor < normalizedAudio.length; cursor += frameSize) {
    const sequence = frames.length + 1
    const audioBase64 = normalizedAudio.slice(cursor, cursor + frameSize)
    frames.push({
      schema: 'streaming_tts_audio_frame.v1',
      frame_id: `${input.chunkId}:frame:${sequence}`,
      chunk_id: input.chunkId,
      sequence,
      audio_mime_type: input.audioMimeType,
      audio_base64: audioBase64,
      final: cursor + frameSize >= normalizedAudio.length,
      generated_at: generatedAt
    })
  }

  return frames
}

export function createBufferedStreamingTtsAdapter(options: CreateBufferedStreamingTtsAdapterOptions): StreamingTtsAdapter {
  return {
    descriptor: {
      schema: STREAMING_TTS_ADAPTER_SCHEMA,
      adapter_id: options.adapterId,
      transport: options.transport ?? 'chunked_http',
      configured: true,
      enabled: options.enabled ?? true,
      input_refs: ['voice_output_chunk.v1', 'voice_profile.v1', 'voice_response_plan.v1'],
      output_refs: ['streaming_tts_audio_frame.v1', 'audio_frame_stream.v1', 'voice_playback_queue.v1'],
      boundary:
        options.boundary ??
        'Generic buffered streaming adapter. It wraps any TTS synthesis result into ordered audio frames without binding to one TTS tool.'
    },
    async *synthesizeStream(request: StreamingTtsSynthesisRequest): AsyncIterable<StreamingTtsAudioFrame> {
      const result = await options.synthesize(request)
      const frames = splitAudioBase64IntoStreamingFrames({
        audioBase64: result.audio_base64,
        audioMimeType: result.audio_mime_type,
        chunkId: request.chunk.chunk_id,
        frameBase64Chars: options.frameBase64Chars,
        generatedAt: result.generated_at
      })
      if (frames.length === 0) {
        throw new Error('Streaming TTS adapter received empty audio.')
      }
      for (const frame of frames) {
        yield frame
      }
    }
  }
}

export function assembleStreamingTtsAudioFrames(frames: StreamingTtsAudioFrame[]): StreamingTtsFrameAssemblyResult {
  const errors: string[] = []
  const firstFrame = frames[0]
  const chunkId = firstFrame?.chunk_id || 'unknown'
  const audioMimeType = firstFrame?.audio_mime_type || 'application/octet-stream'
  let expectedSequence = 1
  let ordered = true
  let finalFrameCount = 0
  const audioByteParts: Uint8Array[] = []

  for (const frame of frames) {
    if (frame.chunk_id !== chunkId) {
      errors.push(`mixed chunk id: ${frame.chunk_id}`)
    }
    if (frame.audio_mime_type !== audioMimeType) {
      errors.push(`mixed audio mime type: ${frame.audio_mime_type}`)
    }
    if (frame.sequence !== expectedSequence) {
      ordered = false
      errors.push(`unexpected sequence ${frame.sequence}, expected ${expectedSequence}`)
    }
    expectedSequence += 1
    if (frame.final) {
      finalFrameCount += 1
      if (frame.audio_base64) {
        audioByteParts.push(base64ToUint8Array(frame.audio_base64))
      }
      continue
    }
    if (!frame.audio_base64) {
      errors.push(`empty audio frame at sequence ${frame.sequence}`)
      continue
    }
    audioByteParts.push(base64ToUint8Array(frame.audio_base64))
  }

  if (frames.length === 0) errors.push('empty frame stream')
  if (finalFrameCount === 0) errors.push('missing final frame')

  const audioBase64 = uint8ArrayToBase64(concatUint8Arrays(audioByteParts))
  if (!audioBase64) errors.push('empty assembled audio')

  return {
    schema: STREAMING_TTS_FRAME_ASSEMBLY_SCHEMA,
    generated_at: new Date().toISOString(),
    chunk_id: chunkId,
    audio_mime_type: audioMimeType,
    audio_base64: audioBase64,
    audio_data_url: `data:${audioMimeType};base64,${audioBase64}`,
    audio_frame_count: frames.filter((frame) => frame.audio_base64.length > 0).length,
    final_frame_count: finalFrameCount,
    ordered,
    errors
  }
}

export function createHttpStreamingTtsAdapter(options: CreateHttpStreamingTtsAdapterOptions): StreamingTtsAdapter {
  return {
    descriptor: {
      schema: STREAMING_TTS_ADAPTER_SCHEMA,
      adapter_id: options.adapterId,
      transport: 'chunked_http',
      configured: true,
      enabled: options.enabled ?? true,
      input_refs: ['voice_output_chunk.v1', 'voice_profile.v1', 'voice_response_plan.v1', 'http_stream_request'],
      output_refs: ['streaming_tts_audio_frame.v1', 'audio_frame_stream.v1', 'voice_playback_queue.v1'],
      boundary:
        options.boundary ??
        'Generic true HTTP streaming TTS adapter. It consumes response body chunks as audio frames without binding to one TTS tool.'
    },
    async *synthesizeStream(request: StreamingTtsSynthesisRequest): AsyncIterable<StreamingTtsAudioFrame> {
      const fetchRequest = await options.buildRequest(request)
      const fetchImpl = options.fetchImpl ?? fetch
      const response = await fetchImpl(fetchRequest.url, fetchRequest.init)
      if (!response.ok) {
        throw new Error(`Streaming TTS HTTP adapter failed with status ${response.status}`)
      }

      const audioMimeType =
        fetchRequest.audio_mime_type ||
        response.headers.get('content-type')?.split(';')[0]?.trim() ||
        'application/octet-stream'
      let sequence = 0
      for await (const chunk of responseBodyToUint8Chunks(response.body)) {
        sequence += 1
        yield {
          schema: 'streaming_tts_audio_frame.v1',
          frame_id: `${request.chunk.chunk_id}:stream-frame:${sequence}`,
          chunk_id: request.chunk.chunk_id,
          sequence,
          audio_mime_type: audioMimeType,
          audio_base64: uint8ArrayToBase64(chunk),
          final: false,
          generated_at: new Date().toISOString()
        }
      }

      yield {
        schema: 'streaming_tts_audio_frame.v1',
        frame_id: `${request.chunk.chunk_id}:stream-frame:${sequence + 1}:final`,
        chunk_id: request.chunk.chunk_id,
        sequence: sequence + 1,
        audio_mime_type: audioMimeType,
        audio_base64: '',
        final: true,
        generated_at: new Date().toISOString()
      }
    }
  }
}

export function buildDefaultVoicePlaybackQueueState(input: {
  sessionId?: string
  voiceProfile: VoiceProfile
  adapterId?: string
}): VoicePlaybackQueueState {
  return {
    schema: VOICE_PLAYBACK_QUEUE_SCHEMA,
    session_id: input.sessionId ?? 'idle',
    mode: 'high_quality_chunked',
    status: 'idle',
    voice_profile_id: input.voiceProfile.profile_id,
    adapter_id: input.adapterId ?? input.voiceProfile.adapter_id,
    queued_count: 0,
    completed_count: 0,
    failed_count: 0,
    cached_count: 0,
    updated_at: new Date().toISOString()
  }
}

export function simulateVoicePlaybackQueue(input: {
  sessionId: string
  chunks: VoiceOutputChunk[]
  voiceProfile: VoiceProfile
  adapterId?: string
  cachedChunkKeys?: string[]
  failedChunkIds?: string[]
  synthesisMsPerChunk?: number
  playbackMsPerChunk?: number
}): VoicePlaybackQueueSimulationResult {
  const cachedKeys = new Set(input.cachedChunkKeys ?? [])
  const failedIds = new Set(input.failedChunkIds ?? [])
  const synthesisMsPerChunk = Math.max(0, input.synthesisMsPerChunk ?? 120)
  const playbackMsPerChunk = Math.max(0, input.playbackMsPerChunk ?? 80)
  const steps: VoicePlaybackQueueSimulationStep[] = []
  const playbackOrder: string[] = []
  const synthesizedChunkIds: string[] = []
  const cachedChunkIds: string[] = []
  const failedChunkIds: string[] = []
  let completedCount = 0
  let failedCount = 0
  let cachedCount = 0
  let totalTtsMs = 0
  let totalPlaybackMs = 0
  let firstTtsMs: number | undefined
  let firstPlaybackMs: number | undefined

  const buildState = (
    status: VoicePlaybackQueueStatus,
    chunk: VoiceOutputChunk | undefined,
    lastError?: string
  ): VoicePlaybackQueueState => ({
    schema: VOICE_PLAYBACK_QUEUE_SCHEMA,
    session_id: input.sessionId,
    mode: 'high_quality_chunked',
    status,
    voice_profile_id: input.voiceProfile.profile_id,
    adapter_id: input.adapterId ?? input.voiceProfile.adapter_id,
    active_chunk_id: chunk?.chunk_id,
    queued_count: input.chunks.length,
    completed_count: completedCount,
    failed_count: failedCount,
    cached_count: cachedCount,
    updated_at: new Date().toISOString(),
    last_error: lastError
  })

  const pushStep = (
    phase: VoicePlaybackQueueSimulationStep['phase'],
    status: VoicePlaybackQueueStatus,
    chunk?: VoiceOutputChunk,
    lastError?: string
  ) => {
    steps.push({
      phase,
      chunk_id: chunk?.chunk_id,
      state: buildState(status, chunk, lastError)
    })
  }

  pushStep('queued', input.chunks.length > 0 ? 'queued' : 'idle')

  for (const chunk of input.chunks) {
    if (cachedKeys.has(chunk.cache_key)) {
      cachedCount += 1
      cachedChunkIds.push(chunk.chunk_id)
      firstTtsMs = firstTtsMs ?? 0
      pushStep('cache_hit', 'queued', chunk)
    } else {
      synthesizedChunkIds.push(chunk.chunk_id)
      totalTtsMs += synthesisMsPerChunk
      firstTtsMs = firstTtsMs ?? synthesisMsPerChunk
      pushStep('synthesizing', 'synthesizing', chunk)
    }

    if (failedIds.has(chunk.chunk_id)) {
      failedCount += 1
      failedChunkIds.push(chunk.chunk_id)
      pushStep('error', 'error', chunk, 'simulated chunk failure')
      continue
    }

    pushStep('playing', 'playing', chunk)
    completedCount += 1
    playbackOrder.push(chunk.chunk_id)
    totalPlaybackMs += playbackMsPerChunk
    firstPlaybackMs = firstPlaybackMs ?? playbackMsPerChunk
    pushStep('complete', 'complete', chunk)
  }

  const finalState = buildState(failedCount > 0 && completedCount === 0 ? 'error' : 'complete', undefined, failedCount > 0 ? `${failedCount} voice chunk(s) failed` : undefined)
  const latencyTrace = buildVoiceLatencyTrace({
    sessionId: input.sessionId,
    firstTtsMs,
    totalTtsMs,
    firstPlaybackMs,
    totalPlaybackMs,
    endToEndMs: totalTtsMs + totalPlaybackMs,
    chunkCount: input.chunks.length,
    cachedChunkCount: cachedCount,
    failedChunkCount: failedCount
  })

  return {
    schema: VOICE_PLAYBACK_QUEUE_SIMULATION_SCHEMA,
    session_id: input.sessionId,
    playback_order: playbackOrder,
    synthesized_chunk_ids: synthesizedChunkIds,
    cached_chunk_ids: cachedChunkIds,
    failed_chunk_ids: failedChunkIds,
    steps,
    final_state: finalState,
    latency_trace: latencyTrace
  }
}

export function buildVoiceLatencyTrace(input: {
  sessionId: string
  sttMs?: number
  modelMs?: number
  firstTtsMs?: number
  totalTtsMs?: number
  firstPlaybackMs?: number
  totalPlaybackMs?: number
  endToEndMs?: number
  chunkCount?: number
  cachedChunkCount?: number
  failedChunkCount?: number
  segments?: VoiceLatencySegment[]
}): VoiceLatencyTrace {
  const stages = [
    ['stt', input.sttMs],
    ['model', input.modelMs],
    ['tts', input.totalTtsMs ?? input.firstTtsMs],
    ['playback', input.totalPlaybackMs ?? input.firstPlaybackMs]
  ] as const
  const slowest = stages.reduce<(typeof stages)[number] | undefined>((current, candidate) => {
    if (typeof candidate[1] !== 'number') return current
    if (!current || (candidate[1] ?? 0) > (current[1] ?? 0)) return candidate
    return current
  }, undefined)

  return {
    schema: VOICE_LATENCY_TRACE_SCHEMA,
    trace_id: `voice_latency_${input.sessionId}_${Date.now().toString(36)}`,
    session_id: input.sessionId,
    generated_at: new Date().toISOString(),
    stt_ms: input.sttMs,
    model_ms: input.modelMs,
    first_tts_ms: input.firstTtsMs,
    total_tts_ms: input.totalTtsMs,
    first_playback_ms: input.firstPlaybackMs,
    total_playback_ms: input.totalPlaybackMs,
    end_to_end_ms: input.endToEndMs,
    chunk_count: input.chunkCount ?? 0,
    cached_chunk_count: input.cachedChunkCount ?? 0,
    failed_chunk_count: input.failedChunkCount ?? 0,
    slowest_stage: slowest?.[0],
    segments: input.segments?.slice(0, 64) ?? []
  }
}

export const RESERVED_STREAMING_TTS_ADAPTER: StreamingTtsAdapterDescriptor = {
  schema: STREAMING_TTS_ADAPTER_SCHEMA,
  adapter_id: 'streaming_tts_adapter.reserved',
  transport: 'reserved',
  configured: false,
  enabled: false,
  input_refs: ['voice_output_chunk.v1', 'voice_profile.v1'],
  output_refs: ['audio_frame_stream.v1', 'voice_playback_queue.v1'],
  boundary: 'Reserved for true streaming TTS. Current runtime uses high_quality_chunked synthesis.'
}
