const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  DEFAULT_COSYVOICE_TTS_CONFIG,
  buildCosyVoiceRequestBody
} = require('../src/core/status-dialogue/tts-adapter.ts')
const { DEFAULT_COSYVOICE_VOICE_PROFILE } = require('../src/core/status-dialogue/voice-profile.ts')
const {
  buildVoiceLatencyTrace,
  createBufferedStreamingTtsAdapter,
  segmentVoiceResponsePlan
} = require('../src/core/status-dialogue/voice-output-pipeline.ts')

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function buildUrl(pathValue) {
  return new URL(pathValue, DEFAULT_COSYVOICE_TTS_CONFIG.base_url).toString()
}

function buildProbePlan(text) {
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
    source_output_id: `voice_runtime_probe_${Date.now()}`
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function wavHeaderInfo(bytes) {
  const header = Buffer.from(bytes.slice(0, 12)).toString('ascii')
  return {
    riff: header.slice(0, 4),
    wave: header.slice(8, 12),
    valid: header.slice(0, 4) === 'RIFF' && header.slice(8, 12) === 'WAVE'
  }
}

async function readAudioResponseBody(response, requestStartedAt) {
  const buffers = []
  const chunkSizes = []
  const chunkArrivalMs = []
  let firstChunkMs

  const pushChunk = (chunk) => {
    const buffer = Buffer.from(chunk)
    if (buffer.length === 0) return
    const arrivedMs = Math.round(nowMs() - requestStartedAt)
    firstChunkMs = firstChunkMs ?? arrivedMs
    if (chunkSizes.length < 16) chunkSizes.push(buffer.length)
    if (chunkArrivalMs.length < 16) chunkArrivalMs.push(arrivedMs)
    buffers.push(buffer)
  }

  if (response.body && 'getReader' in response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader()
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        if (next.value?.length) pushChunk(next.value)
      }
    } finally {
      reader.releaseLock()
    }
  } else if (response.body && typeof response.body[Symbol.asyncIterator] === 'function') {
    for await (const chunk of response.body) {
      if (chunk?.length) pushChunk(chunk)
    }
  } else {
    pushChunk(await response.arrayBuffer())
  }

  return {
    audioBuffer: Buffer.concat(buffers),
    firstChunkMs,
    firstAudioPayloadChunkMs:
      buffers[0]?.length === 44 && Buffer.from(buffers[0].slice(0, 4)).toString('ascii') === 'RIFF'
        ? chunkArrivalMs[1]
        : chunkArrivalMs[0],
    totalAudioMs: Math.round(nowMs() - requestStartedAt),
    chunkCount: buffers.length,
    chunkSizes,
    chunkArrivalMs
  }
}

async function main() {
  const generatedAt = new Date().toISOString()
  const outputDir = path.resolve(__dirname, '..', 'runtime', 'voice-loop-probes')
  fs.mkdirSync(outputDir, { recursive: true })
  const totalStartedAt = nowMs()
  const healthStartedAt = nowMs()
  const healthResponse = await fetchWithTimeout(buildUrl(DEFAULT_COSYVOICE_TTS_CONFIG.health_path), {}, 10000)
  const healthMs = Math.round(nowMs() - healthStartedAt)
  assert.equal(healthResponse.ok, true, `CosyVoice health failed: ${healthResponse.status}`)
  const health = await healthResponse.json().catch(() => ({}))

  const probeText = '\u6211\u5728\u8fd9\u91cc\uff0c\u8bed\u97f3\u94fe\u8def\u5df2\u5c31\u7eea\u3002'
  const plan = buildProbePlan(probeText)
  const chunks = segmentVoiceResponsePlan(plan, DEFAULT_COSYVOICE_VOICE_PROFILE, {
    kind: 'notice',
    priority: 'notice',
    maxChars: 32,
    minChars: 8
  })
  assert.equal(chunks.length, 1, 'Runtime probe text should remain a single natural notice chunk.')
  assert.equal(chunks[0].voice_profile_id, DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id)

  const synthesizeRealAudio = async (request) => {
    const body = buildCosyVoiceRequestBody(DEFAULT_COSYVOICE_TTS_CONFIG, request.plan)
    const startedAt = nowMs()
    const response = await fetchWithTimeout(
      buildUrl(DEFAULT_COSYVOICE_TTS_CONFIG.endpoint_path),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'audio/wav'
        },
        body: JSON.stringify(body)
      },
      DEFAULT_COSYVOICE_TTS_CONFIG.timeout_ms
    )
    const headersMs = Math.round(nowMs() - startedAt)
    assert.equal(response.ok, true, `CosyVoice synthesis failed: ${response.status}`)
    const audio = await readAudioResponseBody(response, startedAt)
    const audioBuffer = audio.audioBuffer
    assert.equal(audioBuffer.length > 44, true, 'Synthesized audio should be larger than a WAV header.')
    const header = wavHeaderInfo(audioBuffer)
    assert.equal(header.valid, true, `Expected WAV audio, got ${header.riff}/${header.wave}.`)
    const audioPath = path.join(outputDir, `voice-runtime-tts-chain-audio-${Date.now()}.wav`)
    fs.writeFileSync(audioPath, audioBuffer)
    return {
      audio_base64: audioBuffer.toString('base64'),
      audio_mime_type: 'audio/wav',
      generated_at: new Date().toISOString(),
      latency_ms: audio.totalAudioMs,
      headers_ms: headersMs,
      first_audio_chunk_ms: audio.firstChunkMs,
      first_audio_payload_chunk_ms: audio.firstAudioPayloadChunkMs,
      total_audio_ms: audio.totalAudioMs,
      response_chunk_count: audio.chunkCount,
      response_chunk_sizes: audio.chunkSizes,
      response_chunk_arrival_ms: audio.chunkArrivalMs,
      byte_length: audioBuffer.length,
      audio_path: audioPath,
      wav_header: header
    }
  }

  let synthesisMeta
  const streamingAdapter = createBufferedStreamingTtsAdapter({
    adapterId: 'streaming_tts_adapter.runtime.cosyvoice_buffered',
    frameBase64Chars: 4096,
    synthesize: async (request) => {
      synthesisMeta = await synthesizeRealAudio(request)
      return synthesisMeta
    }
  })

  const frames = []
  for await (const frame of streamingAdapter.synthesizeStream({
    schema: 'streaming_tts_synthesis_request.v1',
    chunk: chunks[0],
    plan,
    voice_profile: DEFAULT_COSYVOICE_VOICE_PROFILE
  })) {
    frames.push(frame)
  }

  assert.equal(frames.length >= 1, true, 'Runtime streaming adapter should emit at least one audio frame.')
  assert.equal(frames[frames.length - 1].final, true)
  assert.equal(frames.map((frame) => frame.audio_base64).join(''), synthesisMeta.audio_base64)

  const totalMs = Math.round(nowMs() - totalStartedAt)
  const latencyTrace = buildVoiceLatencyTrace({
    sessionId: plan.source_output_id,
    firstTtsMs: synthesisMeta.first_audio_payload_chunk_ms ?? synthesisMeta.latency_ms,
    totalTtsMs: synthesisMeta.latency_ms,
    endToEndMs: totalMs,
    chunkCount: chunks.length,
    cachedChunkCount: 0,
    failedChunkCount: 0
  })

  const report = {
    schema: 'voice_runtime_tts_chain_validation.v1',
    generated_at: generatedAt,
    health: {
      ok: true,
      latency_ms: healthMs,
      adapter: health.adapter ?? 'cosyvoice_local_http',
      sample_rate: health.sample_rate
    },
    tts: {
      adapter_id: DEFAULT_COSYVOICE_TTS_CONFIG.adapter_id,
      voice_profile_id: DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id,
      voice_id: DEFAULT_COSYVOICE_VOICE_PROFILE.voice_id,
      text_length: probeText.length,
      chunk_count: chunks.length,
      latency_ms: synthesisMeta.latency_ms,
      headers_ms: synthesisMeta.headers_ms,
      first_audio_chunk_ms: synthesisMeta.first_audio_chunk_ms,
      first_audio_payload_chunk_ms: synthesisMeta.first_audio_payload_chunk_ms,
      total_audio_ms: synthesisMeta.total_audio_ms,
      response_chunk_count: synthesisMeta.response_chunk_count,
      response_chunk_sizes: synthesisMeta.response_chunk_sizes,
      response_chunk_arrival_ms: synthesisMeta.response_chunk_arrival_ms,
      audio_mime_type: synthesisMeta.audio_mime_type,
      byte_length: synthesisMeta.byte_length,
      audio_path: synthesisMeta.audio_path,
      wav_header_valid: synthesisMeta.wav_header.valid
    },
    stream: {
      adapter_id: streamingAdapter.descriptor.adapter_id,
      frame_count: frames.length,
      final_frame: frames[frames.length - 1].final,
      recombined: frames.map((frame) => frame.audio_base64).join('') === synthesisMeta.audio_base64
    },
    latency_trace: latencyTrace,
    boundary: {
      browser_tts_used: false,
      external_world_write: false,
      requirement_packet_created: false
    }
  }

  const outputPath = path.join(outputDir, `voice-runtime-tts-chain-validation-${Date.now()}.json`)
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ ok: true, outputPath, report }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
