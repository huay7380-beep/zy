const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const {
  RESERVED_STREAMING_TTS_ADAPTER,
  STATUS_DIALOGUE_VOICE_ACK_TEXT,
  STATUS_DIALOGUE_VOICE_OPENING_TEXT,
  VOICE_LATENCY_TRACE_SCHEMA,
  VOICE_OUTPUT_CHUNK_SCHEMA,
  VOICE_PLAYBACK_QUEUE_SCHEMA,
  assembleStreamingTtsAudioFrames,
  buildStatusDialogueVoiceAckText,
  buildStatusDialogueVoiceOpeningText,
  buildDefaultVoicePlaybackQueueState,
  buildDefaultVoiceResponseTextStreamState,
  buildVoiceChunkCacheKey,
  buildVoiceLatencyTrace,
  appendVoiceResponseTextDelta,
  createBufferedStreamingTtsAdapter,
  createHttpStreamingTtsAdapter,
  deriveVoiceEmotionPriority,
  extractPartialJsonStringField,
  finishVoiceResponseTextStream,
  segmentVoiceResponsePlan,
  simulateVoicePlaybackQueue
} = require('../src/core/status-dialogue/voice-output-pipeline.ts')
const { DEFAULT_COSYVOICE_VOICE_PROFILE } = require('../src/core/status-dialogue/voice-profile.ts')
const {
  VOICE_TONE_PARAMETERS_SCHEMA,
  applyVoiceToneToPlan,
  buildVoiceToneParameters
} = require('../src/core/status-dialogue/voice-response-plan.ts')
const {
  STATUS_DIALOGUE_TTS_RUNTIME_CANDIDATE_SCHEMA,
  buildDefaultStatusDialogueTtsRuntimeCandidates,
  buildCosyVoiceRequestBody,
  normalizeStatusDialogueTtsConfig,
  selectStatusDialogueTtsRuntimeCandidate
} = require('../src/core/status-dialogue/tts-adapter.ts')

function buildPlan(text, sourceOutputId = 'voice_pipeline_probe.final') {
  return {
    schema: 'voice_response_plan.v1',
    text,
    voice_profile_id: DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id,
    clone_profile_id: null,
    emotion_hint: 'warm',
    speed: 1,
    pitch: 1,
    volume: 1,
    fallback_allowed: false,
    source_output_id: sourceOutputId
  }
}

function assertEveryChunkUsesCosyVoice(chunks) {
  for (const chunk of chunks) {
    assert.equal(chunk.schema, VOICE_OUTPUT_CHUNK_SCHEMA)
    assert.equal(chunk.voice_profile_id, DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id)
    assert.equal(chunk.cache_key.includes(DEFAULT_COSYVOICE_VOICE_PROFILE.voice_id), true)
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function startMockStreamingAudioServer(chunks) {
  const state = {
    requestStartedAt: 0,
    responseEndedAt: 0,
    chunkWriteTimes: []
  }
  const server = http.createServer(async (_request, response) => {
    state.requestStartedAt = Date.now()
    response.writeHead(200, {
      'content-type': 'audio/wav',
      'cache-control': 'no-store',
      'transfer-encoding': 'chunked'
    })
    for (const item of chunks) {
      if (item.delay_ms) await delay(item.delay_ms)
      state.chunkWriteTimes.push(Date.now())
      response.write(item.bytes)
    }
    await delay(80)
    state.responseEndedAt = Date.now()
    response.end()
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Mock streaming server did not expose a port.'))
        return
      }
      resolve({
        url: `http://127.0.0.1:${address.port}/audio-stream`,
        state,
        close: () => new Promise((closeResolve) => server.close(closeResolve))
      })
    })
  })
}

assert.equal(buildStatusDialogueVoiceAckText('speech_transcript'), STATUS_DIALOGUE_VOICE_ACK_TEXT.speech_transcript)
assert.equal(buildStatusDialogueVoiceAckText('text'), STATUS_DIALOGUE_VOICE_ACK_TEXT.text)
for (const [ackKind, ackText] of Object.entries(STATUS_DIALOGUE_VOICE_ACK_TEXT)) {
  const ackPolicy = deriveVoiceEmotionPriority({ intent: 'casual_chat' })
  const ackChunks = segmentVoiceResponsePlan(
    buildPlan(ackText, `voice_pipeline_probe.ack.${ackKind}`),
    DEFAULT_COSYVOICE_VOICE_PROFILE,
    {
      kind: 'ack',
      priority: ackPolicy.priority,
      emotionHint: ackPolicy.emotion_hint,
      maxChars: 32,
      minChars: 4
    }
  )
  assert.equal(ackChunks.length, 1, `Ack text should stay as one cached playback chunk for ${ackKind}.`)
  assert.equal(ackChunks[0].kind, 'ack')
  assert.equal(ackChunks[0].emotion_hint, 'warm')
  assertEveryChunkUsesCosyVoice(ackChunks)
}
assert.equal(buildStatusDialogueVoiceOpeningText({ globalStatus: 'ok' }), STATUS_DIALOGUE_VOICE_OPENING_TEXT.ok)
assert.equal(
  buildStatusDialogueVoiceOpeningText({ globalStatus: 'warn' }),
  '\u6211\u770b\u5230\u5f53\u524d\u5de1\u68c0\u6709\u98ce\u9669\u9879\uff0c\u5148\u8bf4\u6e05\u4f9d\u636e\u548c\u4e0b\u4e00\u6b65\u3002'
)
assert.equal(buildStatusDialogueVoiceOpeningText({ globalStatus: 'blocked' }), STATUS_DIALOGUE_VOICE_OPENING_TEXT.blocked)
assert.equal(buildStatusDialogueVoiceOpeningText({ globalStatus: 'unknown' }), STATUS_DIALOGUE_VOICE_OPENING_TEXT.unknown)
assert.equal(
  buildStatusDialogueVoiceOpeningText({ globalStatus: 'ok', missingStatusCount: 1 }),
  '\u6211\u770b\u5230 1 \u4e2a\u6a21\u5757\u8fd8\u6ca1\u6709\u72b6\u6001\u5361\uff0c\u5148\u6309\u53ea\u8bfb\u5de1\u68c0\u7ee7\u7eed\u3002',
  'Missing status cards should promote the formal opening to a concrete warning phrase.'
)
for (const [openingKind, openingText] of Object.entries(STATUS_DIALOGUE_VOICE_OPENING_TEXT)) {
  const openingPolicy = deriveVoiceEmotionPriority({
    intent: openingKind === 'blocked' ? 'patrol_blocked' : openingKind === 'warn' ? 'patrol_warn' : 'patrol_ok',
    globalStatus: openingKind === 'blocked' || openingKind === 'warn' || openingKind === 'ok' ? openingKind : 'unknown'
  })
  const openingChunks = segmentVoiceResponsePlan(
    buildPlan(openingText, `voice_pipeline_probe.opening.${openingKind}`),
    DEFAULT_COSYVOICE_VOICE_PROFILE,
    {
      kind: 'final',
      priority: openingPolicy.priority,
      emotionHint: openingPolicy.emotion_hint,
      maxChars: 32,
      minChars: 4
    }
  )
  assert.equal(openingChunks.length, 1, `Formal opening should stay as one cached playback chunk for ${openingKind}.`)
  assert.equal(openingChunks[0].text, openingText)
  assertEveryChunkUsesCosyVoice(openingChunks)
}

const sentenceText =
  '\u7b2c\u4e00\u53e5\u5df2\u5b8c\u6210\u3002' +
  '\u7b2c\u4e8c\u53e5\u9700\u8981\u63d0\u9192\uff01' +
  '\u7b2c\u4e09\u53e5\u7b49\u5f85\u786e\u8ba4\uff1f'
const sentenceChunks = segmentVoiceResponsePlan(buildPlan(sentenceText), DEFAULT_COSYVOICE_VOICE_PROFILE, {
  kind: 'final',
  maxChars: 32,
  minChars: 4
})
assert.equal(sentenceChunks.length, 3, 'Chinese sentence punctuation should create three output chunks.')
assert.deepEqual(
  sentenceChunks.map((chunk) => chunk.index),
  [1, 2, 3],
  'Chunk indexes should preserve playback order.'
)
assertEveryChunkUsesCosyVoice(sentenceChunks)

const commaText = '\u72b6\u6001\u7a33\u5b9a\uff0c\u7b49\u5f85\u4f60\u786e\u8ba4\u3002'
const commaChunks = segmentVoiceResponsePlan(buildPlan(commaText, 'voice_pipeline_probe.comma'), DEFAULT_COSYVOICE_VOICE_PROFILE, {
  kind: 'notice',
  maxChars: 32,
  minChars: 8
})
assert.equal(commaChunks.length, 1, 'Chinese comma should not create an overly short voice chunk.')

const orphanPunctuationChunks = segmentVoiceResponsePlan(
  buildPlan(
    '\u5f53\u524d\u5de5\u4f5c\u5df2\u5b8c\u6210\u3002 . \u8bf7\u8fc7\u6765\u786e\u8ba4\u3002',
    'voice_pipeline_probe.orphan_punctuation'
  ),
  DEFAULT_COSYVOICE_VOICE_PROFILE,
  {
    kind: 'notice',
    maxChars: 32,
    minChars: 8
  }
)
assert.equal(
  orphanPunctuationChunks.every((chunk) => /[0-9A-Za-z\u3400-\u9fff]/.test(chunk.text)),
  true,
  'Orphan punctuation must not become a standalone voice chunk.'
)
assert.equal(
  orphanPunctuationChunks.every((chunk) => chunk.text.length > 1),
  true,
  'Single-character TTS chunks should be merged or skipped to avoid adapter timeouts.'
)
assert.equal(
  orphanPunctuationChunks.some((chunk) => chunk.text.includes('\u3002.')),
  false,
  'Duplicate punctuation should be absorbed instead of spoken as a strange tail.'
)

const longChunks = segmentVoiceResponsePlan(buildPlan('abcdefghijklmnopqrstuvwxzy0123456789'), DEFAULT_COSYVOICE_VOICE_PROFILE, {
  kind: 'final',
  maxChars: 12,
  minChars: 6
})
assert.equal(longChunks.length > 1, true, 'Long text should be split into bounded chunks.')
assert.equal(longChunks.every((chunk) => chunk.text.length <= 12), true, 'Every long-text chunk should honor maxChars.')

const errorPolicy = deriveVoiceEmotionPriority({ intent: 'error', hasError: true, globalStatus: 'warn' })
assert.equal(errorPolicy.priority, 'urgent')
assert.equal(errorPolicy.emotion_hint, 'urgent')

const patrolWarnPolicy = deriveVoiceEmotionPriority({
  intent: 'patrol_warn',
  missingStatusCount: 3,
  globalStatus: 'warn'
})
assert.equal(patrolWarnPolicy.priority, 'notice')
assert.equal(patrolWarnPolicy.emotion_hint, 'focused')

const completionNoticePolicy = deriveVoiceEmotionPriority({ intent: 'completion_notice', globalStatus: 'ok' })
assert.equal(completionNoticePolicy.priority, 'notice')
assert.equal(completionNoticePolicy.emotion_hint, 'warm')

const casualChatPolicy = deriveVoiceEmotionPriority({ intent: 'casual_chat', globalStatus: 'unknown' })
assert.equal(casualChatPolicy.priority, 'normal')
assert.equal(casualChatPolicy.emotion_hint, 'warm')

const taskSupervisionPolicy = deriveVoiceEmotionPriority({ intent: 'task_supervision', globalStatus: 'ok' })
assert.equal(taskSupervisionPolicy.priority, 'notice')
assert.equal(taskSupervisionPolicy.emotion_hint, 'focused')

const emotionOverrideChunks = segmentVoiceResponsePlan(
  buildPlan('Task supervision voice policy should keep the same profile.', 'voice_pipeline_probe.emotion'),
  DEFAULT_COSYVOICE_VOICE_PROFILE,
  {
    kind: 'notice',
    priority: taskSupervisionPolicy.priority,
    emotionHint: taskSupervisionPolicy.emotion_hint,
    maxChars: 24,
    minChars: 6
  }
)
assert.equal(
  emotionOverrideChunks.every((chunk) => chunk.emotion_hint === taskSupervisionPolicy.emotion_hint),
  true,
  'Emotion policy should be applied to every chunk.'
)
assert.equal(
  emotionOverrideChunks.every((chunk) => chunk.voice_profile_id === DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id),
  true,
  'Emotion policy must not change the locked voice profile.'
)
const urgentTone = buildVoiceToneParameters({
  voiceProfile: DEFAULT_COSYVOICE_VOICE_PROFILE,
  emotionHint: errorPolicy.emotion_hint
})
const focusedTone = buildVoiceToneParameters({
  voiceProfile: DEFAULT_COSYVOICE_VOICE_PROFILE,
  emotionHint: taskSupervisionPolicy.emotion_hint
})
const warmTone = buildVoiceToneParameters({
  voiceProfile: DEFAULT_COSYVOICE_VOICE_PROFILE,
  emotionHint: completionNoticePolicy.emotion_hint
})
assert.equal(urgentTone.schema, VOICE_TONE_PARAMETERS_SCHEMA)
assert.equal(urgentTone.same_voice_profile, true)
assert.equal(urgentTone.speed > warmTone.speed, true, 'Urgent tone should be quicker than warm completion voice.')
assert.equal(focusedTone.volume >= warmTone.volume, true, 'Focused patrol voice should stay clearly audible.')
const focusedPlan = applyVoiceToneToPlan({
  plan: buildPlan('Task supervision tone should alter parameters only.', 'voice_pipeline_probe.tone'),
  voiceProfile: DEFAULT_COSYVOICE_VOICE_PROFILE,
  emotionHint: taskSupervisionPolicy.emotion_hint
})
assert.equal(focusedPlan.voice_profile_id, DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id)
assert.equal(focusedPlan.emotion_hint, taskSupervisionPolicy.emotion_hint)
assert.equal(focusedPlan.speed, focusedTone.speed)
assert.equal(focusedPlan.pitch, focusedTone.pitch)
assert.equal(focusedPlan.volume, focusedTone.volume)

let textStreamState = buildDefaultVoiceResponseTextStreamState({
  streamId: 'voice_pipeline_probe.text_stream',
  generatedAt: '2026-06-28T00:00:00.000Z'
})
const streamEvents = []
let rawJsonStream = ''
let previousVoiceField = ''
for (const delta of ['{"voice":"我正在检查', '当前状态。', '后续重点会继续补充。","reply":"完整回复"}']) {
  rawJsonStream += delta
  const currentVoiceField = extractPartialJsonStringField(rawJsonStream, 'voice')
  const voiceDelta = currentVoiceField.slice(previousVoiceField.length)
  previousVoiceField = currentVoiceField
  if (!voiceDelta) continue
  const step = appendVoiceResponseTextDelta(textStreamState, voiceDelta, {
    minFirstSentenceChars: 6,
    generatedAt: '2026-06-28T00:00:01.000Z'
  })
  textStreamState = step.state
  streamEvents.push(...step.events)
}
const firstSentenceEvents = streamEvents.filter((event) => event.type === 'first_sentence_ready')
assert.equal(firstSentenceEvents.length, 1, 'Text stream should emit first_sentence_ready exactly once.')
assert.equal(firstSentenceEvents[0].first_sentence, '我正在检查当前状态。')
const sentenceReadyEvents = streamEvents.filter((event) => event.type === 'sentence_ready')
assert.equal(sentenceReadyEvents.length, 2, 'Text stream should emit every complete voice sentence as sentence_ready.')
assert.deepEqual(
  sentenceReadyEvents.map((event) => event.sentence),
  ['我正在检查当前状态。', '后续重点会继续补充。']
)
assert.deepEqual(
  sentenceReadyEvents.map((event) => event.sentence_index),
  [1, 2],
  'Sentence indexes should preserve streaming playback order.'
)
assert.equal(
  sentenceReadyEvents[1].spoken_prefix,
  '我正在检查当前状态。后续重点会继续补充。',
  'Spoken prefix should support final voice dedupe after multi-sentence streaming.'
)
const finishedTextStream = finishVoiceResponseTextStream(textStreamState, {
  generatedAt: '2026-06-28T00:00:02.000Z'
})
assert.equal(finishedTextStream.event.type, 'done')
assert.equal(finishedTextStream.event.accumulated_text, '我正在检查当前状态。后续重点会继续补充。')
const firstSentenceChunks = segmentVoiceResponsePlan(
  buildPlan(firstSentenceEvents[0].first_sentence, 'voice_pipeline_probe.text_stream_first_sentence'),
  DEFAULT_COSYVOICE_VOICE_PROFILE,
  {
    kind: 'final',
    priority: patrolWarnPolicy.priority,
    emotionHint: patrolWarnPolicy.emotion_hint,
    maxChars: 32,
    minChars: 6
  }
)
assert.equal(firstSentenceChunks.length, 1, 'Streamed first sentence should be queueable before final text is complete.')
assert.equal(firstSentenceChunks[0].text, '我正在检查当前状态。')
assert.equal(firstSentenceChunks[0].voice_profile_id, DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id)

const cacheKeyA = buildVoiceChunkCacheKey({
  text: 'Hello   World',
  voiceProfile: DEFAULT_COSYVOICE_VOICE_PROFILE,
  emotionHint: 'warm'
})
const cacheKeyB = buildVoiceChunkCacheKey({
  text: 'hello world',
  voiceProfile: DEFAULT_COSYVOICE_VOICE_PROFILE,
  emotionHint: 'warm'
})
assert.equal(cacheKeyA, cacheKeyB, 'Cache keys should normalize case and repeated whitespace.')

const queueState = buildDefaultVoicePlaybackQueueState({
  sessionId: 'voice_pipeline_probe.session',
  voiceProfile: DEFAULT_COSYVOICE_VOICE_PROFILE
})
assert.equal(queueState.schema, VOICE_PLAYBACK_QUEUE_SCHEMA)
assert.equal(queueState.mode, 'high_quality_chunked')
assert.equal(queueState.status, 'idle')
assert.equal(queueState.voice_profile_id, DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id)

const latencyTrace = buildVoiceLatencyTrace({
  sessionId: 'voice_pipeline_probe.session',
  sttMs: 100,
  modelMs: 250,
  firstTtsMs: 80,
  totalTtsMs: 140,
  firstPlaybackMs: 90,
  totalPlaybackMs: 180,
  endToEndMs: 610,
  chunkCount: 3,
  cachedChunkCount: 1,
  failedChunkCount: 0,
  segments: [
    {
      chunk_id: 'voice_pipeline_probe.segment.1',
      source_output_id: 'voice_pipeline_probe.session',
      kind: 'final',
      index: 1,
      total: 2,
      text_length: 12,
      cache_hit: true,
      status: 'spoken',
      tts_ms: 0,
      playback_ms: 90
    },
    {
      chunk_id: 'voice_pipeline_probe.segment.2',
      source_output_id: 'voice_pipeline_probe.session',
      kind: 'final',
      index: 2,
      total: 2,
      text_length: 18,
      cache_hit: false,
      status: 'spoken',
      tts_ms: 140,
      playback_ms: 90
    }
  ]
})
assert.equal(latencyTrace.schema, VOICE_LATENCY_TRACE_SCHEMA)
assert.equal(latencyTrace.slowest_stage, 'model')
assert.equal(latencyTrace.chunk_count, 3)
assert.equal(latencyTrace.cached_chunk_count, 1)
assert.equal(latencyTrace.segments.length, 2)
assert.equal(latencyTrace.segments[0].cache_hit, true)
assert.equal(latencyTrace.segments[1].tts_ms, 140)

assert.equal(RESERVED_STREAMING_TTS_ADAPTER.schema, 'streaming_tts_adapter.v1')
assert.equal(RESERVED_STREAMING_TTS_ADAPTER.transport, 'reserved')
assert.equal(RESERVED_STREAMING_TTS_ADAPTER.configured, false)
assert.equal(RESERVED_STREAMING_TTS_ADAPTER.enabled, false)
assert.equal(RESERVED_STREAMING_TTS_ADAPTER.input_refs.includes('voice_output_chunk.v1'), true)
assert.equal(RESERVED_STREAMING_TTS_ADAPTER.output_refs.includes('audio_frame_stream.v1'), true)

const slowCosyVoiceCandidates = buildDefaultStatusDialogueTtsRuntimeCandidates({
  adapter_id: 'cosyvoice_local_http',
  native_streaming_supported: true,
  first_audio_payload_ms: 7690,
  total_request_ms: 10883
})
assert.equal(slowCosyVoiceCandidates.every((candidate) => candidate.schema === STATUS_DIALOGUE_TTS_RUNTIME_CANDIDATE_SCHEMA), true)
assert.equal(slowCosyVoiceCandidates.length >= 3, true)
const slowCosyVoiceCandidate = slowCosyVoiceCandidates.find((candidate) => candidate.adapter_id === 'cosyvoice_local_http')
assert.equal(slowCosyVoiceCandidate?.interactive_ready, false)
assert.equal(slowCosyVoiceCandidate?.role, 'high_quality_cache')
assert.equal(slowCosyVoiceCandidate?.supports_voice_clone, true)
assert.equal(slowCosyVoiceCandidate?.same_voice_profile_required, true)
assert.equal(selectStatusDialogueTtsRuntimeCandidate(slowCosyVoiceCandidates).adapter_id, 'cosyvoice_local_http')

const fastRuntimeCandidate = {
  ...slowCosyVoiceCandidates.find((candidate) => candidate.adapter_id === 'custom_streaming_tts_http'),
  configured: true,
  enabled: true,
  last_first_audio_ms: 420,
  interactive_ready: true
}
const selectedFastCandidate = selectStatusDialogueTtsRuntimeCandidate([
  slowCosyVoiceCandidates[0],
  slowCosyVoiceCandidates[1],
  fastRuntimeCandidate
])
assert.equal(selectedFastCandidate.adapter_id, 'custom_streaming_tts_http')
assert.equal(selectedFastCandidate.interactive_ready, true)

const defaultTtsConfig = normalizeStatusDialogueTtsConfig({})
assert.equal(defaultTtsConfig.adapter_id, 'cosyvoice_local_http')
assert.equal(defaultTtsConfig.allow_remote, false)
assert.equal(defaultTtsConfig.stream_preferred, true)

const customStreamingTtsConfig = normalizeStatusDialogueTtsConfig({
  adapter_id: 'custom_streaming_tts_http',
  base_url: 'http://127.0.0.1:9911',
  endpoint_path: '/tts/stream',
  health_path: '/healthz',
  model: 'fast-local-tts',
  voice: 'same-profile-voice',
  response_format: 'pcm',
  payload_mode: 'openai_compatible',
  allow_remote: false,
  stream_preferred: true,
  timeout_ms: 2500
})
assert.equal(customStreamingTtsConfig.adapter_id, 'custom_streaming_tts_http')
assert.equal(customStreamingTtsConfig.base_url, 'http://127.0.0.1:9911')
assert.equal(customStreamingTtsConfig.endpoint_path, '/tts/stream')
assert.equal(customStreamingTtsConfig.response_format, 'pcm')
assert.equal(customStreamingTtsConfig.timeout_ms, 2500)
const configuredFastCandidates = buildDefaultStatusDialogueTtsRuntimeCandidates(
  {
    adapter_id: 'custom_streaming_tts_http',
    native_streaming_supported: true,
    first_audio_payload_ms: 420,
    total_request_ms: 900
  },
  { config: customStreamingTtsConfig }
)
const configuredFastCandidate = configuredFastCandidates.find((candidate) => candidate.adapter_id === 'custom_streaming_tts_http')
assert.equal(configuredFastCandidate?.configured, true)
assert.equal(configuredFastCandidate?.enabled, true)
assert.equal(configuredFastCandidate?.interactive_ready, true)
assert.equal(selectStatusDialogueTtsRuntimeCandidate(configuredFastCandidates).adapter_id, 'custom_streaming_tts_http')

const openaiCompatibleTtsConfig = normalizeStatusDialogueTtsConfig({
  adapterId: 'openai_compatible_streaming_http',
  baseURL: 'https://tts.example.invalid',
  endpointPath: '/v1/audio/speech',
  apiKey: 'test-key',
  model: 'tts-streaming',
  voice: 'zhineng-same-voice',
  responseFormat: 'opus',
  allowRemote: true,
  streamPreferred: true
})
assert.equal(openaiCompatibleTtsConfig.adapter_id, 'openai_compatible_streaming_http')
assert.equal(openaiCompatibleTtsConfig.allow_remote, true)
assert.equal(openaiCompatibleTtsConfig.response_format, 'opus')
const openaiCompatibleBody = buildCosyVoiceRequestBody(openaiCompatibleTtsConfig, buildPlan('我正在验证可替换流式语音。'))
assert.equal(openaiCompatibleBody.model, 'tts-streaming')
assert.equal(openaiCompatibleBody.input, '我正在验证可替换流式语音。')
assert.equal(openaiCompatibleBody.voice, 'zhineng-same-voice')
assert.equal(openaiCompatibleBody.stream, true)

const queueSimulation = simulateVoicePlaybackQueue({
  sessionId: 'voice_pipeline_probe.queue',
  chunks: sentenceChunks,
  voiceProfile: DEFAULT_COSYVOICE_VOICE_PROFILE,
  cachedChunkKeys: [sentenceChunks[1].cache_key],
  synthesisMsPerChunk: 120,
  playbackMsPerChunk: 80
})
assert.deepEqual(
  queueSimulation.playback_order,
  sentenceChunks.map((chunk) => chunk.chunk_id),
  'Playback queue simulation should preserve chunk order.'
)
assert.deepEqual(queueSimulation.cached_chunk_ids, [sentenceChunks[1].chunk_id])
assert.equal(queueSimulation.synthesized_chunk_ids.includes(sentenceChunks[1].chunk_id), false)
assert.equal(queueSimulation.final_state.status, 'complete')
assert.equal(queueSimulation.final_state.completed_count, sentenceChunks.length)
assert.equal(queueSimulation.final_state.cached_count, 1)
assert.equal(queueSimulation.latency_trace.cached_chunk_count, 1)

const queueFailureSimulation = simulateVoicePlaybackQueue({
  sessionId: 'voice_pipeline_probe.queue_failure',
  chunks: sentenceChunks,
  voiceProfile: DEFAULT_COSYVOICE_VOICE_PROFILE,
  failedChunkIds: [sentenceChunks[1].chunk_id],
  synthesisMsPerChunk: 120,
  playbackMsPerChunk: 80
})
assert.deepEqual(queueFailureSimulation.failed_chunk_ids, [sentenceChunks[1].chunk_id])
assert.equal(queueFailureSimulation.final_state.status, 'complete')
assert.equal(queueFailureSimulation.final_state.failed_count, 1)
assert.equal(queueFailureSimulation.playback_order.includes(sentenceChunks[1].chunk_id), false)
assert.equal(queueFailureSimulation.latency_trace.failed_chunk_count, 1)

async function main() {
  const streamingAudioBase64 = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='
  const streamingAdapter = createBufferedStreamingTtsAdapter({
    adapterId: 'streaming_tts_adapter.validation.buffered',
    frameBase64Chars: 8,
    synthesize: async () => ({
      audio_base64: streamingAudioBase64,
      audio_mime_type: 'audio/wav',
      generated_at: '2026-06-28T00:00:00.000Z'
    })
  })
  assert.equal(streamingAdapter.descriptor.schema, 'streaming_tts_adapter.v1')
  assert.equal(streamingAdapter.descriptor.transport, 'chunked_http')
  assert.equal(streamingAdapter.descriptor.enabled, true)

  const streamingFrames = []
  for await (const frame of streamingAdapter.synthesizeStream({
    schema: 'streaming_tts_synthesis_request.v1',
    chunk: sentenceChunks[0],
    plan: buildPlan(sentenceChunks[0].text, 'voice_pipeline_probe.streaming'),
    voice_profile: DEFAULT_COSYVOICE_VOICE_PROFILE
  })) {
    streamingFrames.push(frame)
  }
  assert.equal(streamingFrames.length > 1, true, 'Buffered streaming adapter should emit multiple frames.')
  assert.deepEqual(
    streamingFrames.map((frame) => frame.sequence),
    streamingFrames.map((_, index) => index + 1),
    'Streaming frames should be ordered by sequence.'
  )
  assert.equal(streamingFrames.slice(0, -1).every((frame) => frame.final === false), true)
  assert.equal(streamingFrames[streamingFrames.length - 1].final, true)
  assert.equal(streamingFrames.map((frame) => frame.audio_base64).join(''), streamingAudioBase64)
  assert.equal(streamingFrames.every((frame) => frame.chunk_id === sentenceChunks[0].chunk_id), true)

  const streamBytes = [
    { delay_ms: 0, bytes: Buffer.alloc(32769, 65) },
    { delay_ms: 90, bytes: Buffer.alloc(32770, 66) },
    { delay_ms: 90, bytes: Buffer.alloc(32771, 67) }
  ]
  const mockStream = await startMockStreamingAudioServer(streamBytes)
  const httpStreamingAdapter = createHttpStreamingTtsAdapter({
    adapterId: 'streaming_tts_adapter.validation.http_chunked',
    buildRequest: async () => ({
      url: mockStream.url,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: sentenceChunks[0].text, voice: DEFAULT_COSYVOICE_VOICE_PROFILE.voice_id })
      },
      audio_mime_type: 'audio/wav'
    })
  })
  assert.equal(httpStreamingAdapter.descriptor.schema, 'streaming_tts_adapter.v1')
  assert.equal(httpStreamingAdapter.descriptor.transport, 'chunked_http')
  assert.equal(httpStreamingAdapter.descriptor.enabled, true)

  const httpStreamingFrames = []
  const httpFrameArrivalTimes = []
  try {
    for await (const frame of httpStreamingAdapter.synthesizeStream({
      schema: 'streaming_tts_synthesis_request.v1',
      chunk: sentenceChunks[0],
      plan: buildPlan(sentenceChunks[0].text, 'voice_pipeline_probe.http_streaming'),
      voice_profile: DEFAULT_COSYVOICE_VOICE_PROFILE
    })) {
      httpStreamingFrames.push(frame)
      httpFrameArrivalTimes.push(Date.now())
    }
  } finally {
    await mockStream.close()
  }
  const httpAudioFrames = httpStreamingFrames.filter((frame) => frame.audio_base64.length > 0)
  const httpFinalFrames = httpStreamingFrames.filter((frame) => frame.final === true)
  const httpAssembly = assembleStreamingTtsAudioFrames(httpStreamingFrames)
  const recombinedHttpBytes = Buffer.concat(httpAudioFrames.map((frame) => Buffer.from(frame.audio_base64, 'base64')))
  const expectedHttpBytes = Buffer.concat(streamBytes.map((item) => item.bytes))
  assert.equal(httpAudioFrames.length, streamBytes.length, 'HTTP streaming adapter should emit one audio frame per streamed body chunk.')
  assert.equal(httpFinalFrames.length, 1, 'HTTP streaming adapter should emit exactly one final marker.')
  assert.equal(httpFinalFrames[0].audio_base64, '', 'HTTP streaming final marker should not duplicate audio bytes.')
  assert.deepEqual(
    httpStreamingFrames.map((frame) => frame.sequence),
    httpStreamingFrames.map((_, index) => index + 1),
    'HTTP streaming frames should keep strict sequence order.'
  )
  assert.equal(recombinedHttpBytes.equals(expectedHttpBytes), true, 'HTTP streaming frames should recombine to original bytes.')
  assert.equal(httpAssembly.schema, 'streaming_tts_frame_assembly.v1')
  assert.equal(httpAssembly.ordered, true, 'HTTP streaming frame assembly should preserve strict order.')
  assert.deepEqual(httpAssembly.errors, [], 'HTTP streaming frame assembly should be playable without assembly errors.')
  assert.equal(httpAssembly.audio_data_url.startsWith('data:audio/wav;base64,'), true)
  assert.equal(Buffer.from(httpAssembly.audio_base64, 'base64').equals(expectedHttpBytes), true)
  assert.equal(
    httpFrameArrivalTimes[0] < mockStream.state.responseEndedAt,
    true,
    'HTTP streaming adapter should yield the first audio frame before the response completes.'
  )

  const report = {
    schema: 'voice_output_pipeline_validation.v1',
    generated_at: new Date().toISOString(),
    checks: {
      chinese_sentence_chunks: sentenceChunks.length,
      comma_chunks: commaChunks.length,
      long_chunks: longChunks.length,
      cache_key_stable: cacheKeyA === cacheKeyB,
      queue_mode: queueState.mode,
      slowest_stage: latencyTrace.slowest_stage,
      streaming_adapter_reserved: RESERVED_STREAMING_TTS_ADAPTER.adapter_id,
      streaming_adapter_implemented: streamingAdapter.descriptor.adapter_id,
      streaming_frame_count: streamingFrames.length,
      streaming_frames_recombine: streamingFrames.map((frame) => frame.audio_base64).join('') === streamingAudioBase64,
      http_streaming_adapter_implemented: httpStreamingAdapter.descriptor.adapter_id,
      http_streaming_audio_frame_count: httpAudioFrames.length,
      http_streaming_final_marker_count: httpFinalFrames.length,
      http_streaming_first_frame_before_end: httpFrameArrivalTimes[0] < mockStream.state.responseEndedAt,
      http_streaming_recombined_bytes: recombinedHttpBytes.equals(expectedHttpBytes),
      http_streaming_assembly_schema: httpAssembly.schema,
      http_streaming_assembly_playable: httpAssembly.audio_data_url.startsWith('data:audio/wav;base64,'),
      http_streaming_assembly_ordered: httpAssembly.ordered,
      http_streaming_assembly_errors: httpAssembly.errors.length,
      tts_runtime_candidate_schema: slowCosyVoiceCandidate?.schema,
      tts_runtime_candidate_count: slowCosyVoiceCandidates.length,
      tts_runtime_slow_cosyvoice_interactive_ready: slowCosyVoiceCandidate?.interactive_ready,
      tts_runtime_slow_cosyvoice_role: slowCosyVoiceCandidate?.role,
      tts_runtime_fast_candidate_selected: selectedFastCandidate.adapter_id,
      tts_config_default_adapter: defaultTtsConfig.adapter_id,
      tts_config_custom_adapter: customStreamingTtsConfig.adapter_id,
      tts_config_custom_response_format: customStreamingTtsConfig.response_format,
      tts_config_custom_candidate_ready: configuredFastCandidate?.interactive_ready,
      tts_config_custom_candidate_selected: selectStatusDialogueTtsRuntimeCandidate(configuredFastCandidates).adapter_id,
      tts_config_openai_adapter: openaiCompatibleTtsConfig.adapter_id,
      tts_config_openai_remote_allowed: openaiCompatibleTtsConfig.allow_remote,
      tts_config_openai_stream_body: openaiCompatibleBody.stream === true,
      queue_playback_order_ok: queueSimulation.playback_order.join('|') === sentenceChunks.map((chunk) => chunk.chunk_id).join('|'),
      queue_cache_hits: queueSimulation.final_state.cached_count,
      queue_failure_count: queueFailureSimulation.final_state.failed_count,
      emotion_priority_error: `${errorPolicy.emotion_hint}/${errorPolicy.priority}`,
      emotion_priority_patrol_warn: `${patrolWarnPolicy.emotion_hint}/${patrolWarnPolicy.priority}`,
      emotion_priority_completion: `${completionNoticePolicy.emotion_hint}/${completionNoticePolicy.priority}`,
      emotion_priority_casual_chat: `${casualChatPolicy.emotion_hint}/${casualChatPolicy.priority}`,
      emotion_priority_task_supervision: `${taskSupervisionPolicy.emotion_hint}/${taskSupervisionPolicy.priority}`,
      emotion_priority_same_voice: emotionOverrideChunks.every(
        (chunk) => chunk.voice_profile_id === DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id
      ),
      tone_parameters_schema: urgentTone.schema,
      tone_parameters_same_voice: urgentTone.same_voice_profile === true,
      tone_parameters_urgent_speed: urgentTone.speed,
      tone_parameters_focused_speed: focusedTone.speed,
      tone_parameters_warm_speed: warmTone.speed,
      tone_parameters_plan_speed_applied: focusedPlan.speed === focusedTone.speed,
      text_stream_first_sentence_event_count: firstSentenceEvents.length,
      text_stream_first_sentence: firstSentenceEvents[0].first_sentence,
      text_stream_done_length: finishedTextStream.event.accumulated_text.length,
      text_stream_first_sentence_queueable: firstSentenceChunks.length === 1,
      text_stream_json_voice_field_only: !finishedTextStream.event.accumulated_text.includes('"voice"')
    }
  }

  const outputDir = path.resolve(__dirname, '..', 'runtime', 'voice-loop-probes')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `voice-output-pipeline-validation-${Date.now()}.json`)
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ ok: true, outputPath, checks: report.checks }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
