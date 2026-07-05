const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const {
  assembleStreamingTtsAudioFrames,
  buildVoiceChunkCacheKey,
  createHttpStreamingTtsAdapter
} = require('../src/core/status-dialogue/voice-output-pipeline.ts')
const { DEFAULT_COSYVOICE_VOICE_PROFILE } = require('../src/core/status-dialogue/voice-profile.ts')
const {
  buildCosyVoiceRequestBody,
  buildDefaultStatusDialogueTtsRuntimeCandidates,
  normalizeStatusDialogueTtsConfig,
  selectStatusDialogueTtsRuntimeCandidate
} = require('../src/core/status-dialogue/tts-adapter.ts')

const repoRoot = path.resolve(__dirname, '..')
const outputDir = path.join(repoRoot, 'runtime', 'voice-loop-probes')

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]
  return fallback
}

function argFlag(name) {
  return process.argv.includes(name)
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === '1' || value === 'true' || value === 'yes') return true
  if (value === false || value === '0' || value === 'false' || value === 'no') return false
  return fallback
}

function isLoopbackUrl(value) {
  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}

function audioMimeFromFormat(responseFormat) {
  if (responseFormat === 'opus') return 'audio/ogg; codecs=opus'
  if (responseFormat === 'mp3') return 'audio/mpeg'
  if (responseFormat === 'wav') return 'audio/wav'
  return 'audio/pcm'
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    request.on('error', reject)
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch (error) {
        reject(error)
      }
    })
  })
}

async function startMockStreamingTtsServer(options) {
  const state = {
    health_hits: 0,
    tts_hits: 0,
    last_body: null,
    first_write_at: undefined,
    response_end_at: undefined
  }
  const audioChunks = [
    Buffer.from('status-dialogue-mock-pcm-frame-1'),
    Buffer.from('status-dialogue-mock-pcm-frame-2'),
    Buffer.from('status-dialogue-mock-pcm-frame-3')
  ]
  const server = http.createServer(async (request, response) => {
    try {
      if (request.url === '/healthz') {
        state.health_hits += 1
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ ok: true, adapter: 'mock_generic_streaming_tts' }))
        return
      }

      if (request.url === '/tts/stream' && request.method === 'POST') {
        state.tts_hits += 1
        state.last_body = await readJsonBody(request)
        response.writeHead(200, {
          'content-type': options.mime,
          'transfer-encoding': 'chunked'
        })
        for (const chunk of audioChunks) {
          await delay(options.chunkDelayMs)
          state.first_write_at = state.first_write_at ?? nowMs()
          response.write(chunk)
        }
        await delay(options.chunkDelayMs)
        state.response_end_at = nowMs()
        response.end()
        return
      }

      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: false, error: 'not_found' }))
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    }
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.equal(typeof address, 'object')
  assert.notEqual(address, null)
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    state,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}

function readConfiguredRawConfig(fallbacks = {}) {
  return {
    adapter_id:
      argValue(
        '--adapter-id',
        process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_ADAPTER_ID || process.env.STATUS_DIALOGUE_TTS_ADAPTER_ID
      ) || fallbacks.adapter_id,
    base_url:
      argValue(
        '--base-url',
        process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_BASE_URL || process.env.STATUS_DIALOGUE_TTS_BASE_URL
      ) || fallbacks.base_url,
    endpoint_path:
      argValue(
        '--endpoint',
        process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_ENDPOINT || process.env.STATUS_DIALOGUE_TTS_ENDPOINT
      ) || fallbacks.endpoint_path,
    health_path:
      argValue(
        '--health-path',
        process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_HEALTH_PATH || process.env.STATUS_DIALOGUE_TTS_HEALTH_PATH
      ) || fallbacks.health_path,
    api_key:
      argValue('--api-key', process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_API_KEY || process.env.STATUS_DIALOGUE_TTS_API_KEY) ||
      fallbacks.api_key,
    model:
      argValue('--model', process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_MODEL || process.env.STATUS_DIALOGUE_TTS_MODEL) ||
      fallbacks.model,
    voice:
      argValue('--voice', process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_VOICE || process.env.STATUS_DIALOGUE_TTS_VOICE) ||
      fallbacks.voice,
    response_format:
      argValue(
        '--format',
        process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_RESPONSE_FORMAT || process.env.STATUS_DIALOGUE_TTS_RESPONSE_FORMAT
      ) || fallbacks.response_format,
    payload_mode:
      argValue(
        '--payload-mode',
        process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_PAYLOAD_MODE || process.env.STATUS_DIALOGUE_TTS_PAYLOAD_MODE
      ) || fallbacks.payload_mode,
    allow_remote: parseBoolean(
      argValue(
        '--allow-remote',
        process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_ALLOW_REMOTE || process.env.STATUS_DIALOGUE_TTS_ALLOW_REMOTE
      ),
      fallbacks.allow_remote ?? false
    ),
    stream_preferred: parseBoolean(
      argValue('--stream', process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_STREAM || process.env.STATUS_DIALOGUE_TTS_STREAM),
      fallbacks.stream_preferred ?? true
    ),
    timeout_ms:
      Number(
        argValue(
          '--timeout-ms',
          process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_TIMEOUT_MS || process.env.STATUS_DIALOGUE_TTS_TIMEOUT_MS
        )
      ) || fallbacks.timeout_ms
  }
}

function missingConfiguredFields(rawConfig) {
  return ['adapter_id', 'base_url', 'endpoint_path', 'model', 'voice'].filter((key) => !rawConfig[key])
}

function writeReport(prefix, report) {
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `${prefix}-${compactTimestamp()}.json`)
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return outputPath
}

async function validateStreamingTtsRuntime(input) {
  const config = normalizeStatusDialogueTtsConfig(input.rawConfig)
  const missing = missingConfiguredFields(input.rawConfig)
  if (missing.length > 0) {
    const report = {
      schema: 'status_dialogue_generic_streaming_tts_validation.v1',
      generated_at: input.generatedAt,
      mode: input.mode,
      configured: false,
      missing_config_fields: missing,
      boundary: {
        external_network_used: false,
        browser_tts_used: false,
        requirement_packet_created: false,
        world_model_written: false
      }
    }
    const outputPath = writeReport(`generic-streaming-tts-${input.mode}-unconfigured`, report)
    return { ok: false, outputPath, report, error: `missing generic streaming TTS config: ${missing.join(', ')}` }
  }

  if (!config.allow_remote && !isLoopbackUrl(config.base_url)) {
    throw new Error('Generic streaming TTS remote URL requires allow_remote=true')
  }

  const healthUrl = `${config.base_url.replace(/\/+$/, '')}${config.health_path.startsWith('/') ? config.health_path : `/${config.health_path}`}`
  const endpointUrl = `${config.base_url.replace(/\/+$/, '')}${config.endpoint_path.startsWith('/') ? config.endpoint_path : `/${config.endpoint_path}`}`
  const headers = {
    'content-type': 'application/json',
    accept: 'audio/*'
  }
  if (config.api_key) headers.authorization = `Bearer ${config.api_key}`

  const healthStartedAt = nowMs()
  const healthResponse = await fetch(healthUrl, { headers: config.api_key ? { authorization: `Bearer ${config.api_key}` } : undefined })
  const healthMs = Math.round(nowMs() - healthStartedAt)
  assert.equal(healthResponse.ok, true, `TTS health failed: ${healthResponse.status}`)

  const voiceProfile = DEFAULT_COSYVOICE_VOICE_PROFILE
  const plan = {
    schema: 'voice_response_plan.v1',
    text: argValue('--text', 'I am validating the replaceable streaming voice route.'),
    voice_profile_id: voiceProfile.profile_id,
    clone_profile_id: voiceProfile.clone_profile_id,
    emotion_hint: 'focused',
    speed: 1.03,
    pitch: 0.98,
    volume: 0.98,
    fallback_allowed: false,
    source_output_id: 'generic-streaming-tts-probe'
  }
  const cacheKey = buildVoiceChunkCacheKey({ text: plan.text, voiceProfile, emotionHint: plan.emotion_hint })
  const body = buildCosyVoiceRequestBody(config, plan)
  assert.equal(body.stream, true)

  const mime = audioMimeFromFormat(config.response_format)
  const adapter = createHttpStreamingTtsAdapter({
    adapterId: `streaming_tts_adapter.runtime.${config.adapter_id}`,
    buildRequest: async () => ({
      url: endpointUrl,
      init: {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      },
      audio_mime_type: mime
    })
  })

  const startedAt = nowMs()
  const frames = []
  let firstFrameMs
  for await (const frame of adapter.synthesizeStream({
    schema: 'streaming_tts_synthesis_request.v1',
    chunk: {
      schema: 'voice_output_chunk.v1',
      chunk_id: 'generic-streaming-tts-probe:chunk:1',
      source_output_id: plan.source_output_id,
      kind: 'final',
      index: 1,
      total: 1,
      text: plan.text,
      voice_profile_id: voiceProfile.profile_id,
      emotion_hint: plan.emotion_hint,
      priority: 'normal',
      cache_key: cacheKey,
      interrupt_previous: false
    },
    plan,
    voice_profile: voiceProfile
  })) {
    if (frame.audio_base64 && firstFrameMs === undefined) {
      firstFrameMs = Math.round(nowMs() - startedAt)
    }
    frames.push(frame)
  }
  const totalStreamMs = Math.round(nowMs() - startedAt)
  const audioFrames = frames.filter((frame) => frame.audio_base64)
  const finalFrames = frames.filter((frame) => frame.final)
  const assembly = assembleStreamingTtsAudioFrames(frames)
  const mockStreamingObserved =
    input.mockState?.response_end_at !== undefined &&
    input.mockState?.first_write_at !== undefined &&
    input.mockState.first_write_at < input.mockState.response_end_at
  const nativeStreamingSupported =
    mockStreamingObserved || (typeof firstFrameMs === 'number' && audioFrames.length > 1 && firstFrameMs < totalStreamMs)
  const candidates = buildDefaultStatusDialogueTtsRuntimeCandidates(
    {
      adapter_id: config.adapter_id,
      native_streaming_supported: nativeStreamingSupported,
      first_audio_payload_ms: firstFrameMs,
      total_request_ms: totalStreamMs
    },
    { config }
  )
  const selectedCandidate = selectStatusDialogueTtsRuntimeCandidate(candidates)

  assert.equal(audioFrames.length > 0, true)
  assert.equal(finalFrames.length, 1)
  assert.equal(assembly.errors.length, 0)
  assert.equal(assembly.ordered, true)
  assert.equal(nativeStreamingSupported, true)
  assert.equal(firstFrameMs <= input.interactiveFirstAudioMs, true)
  assert.equal(selectedCandidate.adapter_id, config.adapter_id)
  assert.equal(selectedCandidate.interactive_ready, true)
  assert.equal(plan.voice_profile_id, voiceProfile.profile_id)

  const report = {
    schema: 'status_dialogue_generic_streaming_tts_validation.v1',
    generated_at: input.generatedAt,
    mode: input.mode,
    adapter_id: config.adapter_id,
    selected_candidate_id: selectedCandidate.adapter_id,
    selected_candidate_interactive_ready: selectedCandidate.interactive_ready,
    configured: true,
    health_ms: healthMs,
    response_format: config.response_format,
    payload_mode: config.payload_mode,
    stream_preferred: config.stream_preferred,
    allow_remote: config.allow_remote,
    same_voice_profile: plan.voice_profile_id === voiceProfile.profile_id,
    native_streaming_supported: nativeStreamingSupported,
    first_audio_payload_ms: firstFrameMs,
    interactive_first_audio_ms: input.interactiveFirstAudioMs,
    total_stream_ms: totalStreamMs,
    audio_frame_count: audioFrames.length,
    final_frame_count: finalFrames.length,
    assembly_playable: assembly.audio_base64.length > 0 && assembly.errors.length === 0,
    assembly_ordered: assembly.ordered,
    request_body: {
      stream: body.stream,
      model: body.model,
      voice: body.voice,
      response_format: body.response_format
    },
    boundary: {
      external_network_used: !isLoopbackUrl(config.base_url),
      browser_tts_used: false,
      requirement_packet_created: false,
      world_model_written: false
    }
  }
  const outputPath = writeReport(`generic-streaming-tts-validation-${input.mode}`, report)
  return { ok: true, outputPath, report }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  const mode = argValue('--mode', process.env.STATUS_DIALOGUE_GENERIC_TTS_PROBE_MODE || 'mock')
  const generatedAt = new Date().toISOString()
  const interactiveFirstAudioMs = Number(argValue('--interactive-first-audio-ms', '1500'))
  const responseFormat = argValue('--format', process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_RESPONSE_FORMAT || 'pcm')
  const chunkDelayMs = Number(argValue('--chunk-delay-ms', '30'))
  const startMock = mode === 'mock' || mode === 'configured-mock'
  let mockServer

  try {
    if (startMock) {
      mockServer = await startMockStreamingTtsServer({ chunkDelayMs, mime: audioMimeFromFormat(responseFormat) })
    }

    const mockFallbacks =
      mockServer && mode === 'mock'
        ? {
            adapter_id: argValue('--adapter-id', 'custom_streaming_tts_http'),
            base_url: mockServer.baseUrl,
            endpoint_path: '/tts/stream',
            health_path: '/healthz',
            model: 'mock-fast-streaming-tts',
            voice: 'same-profile-voice',
            response_format: responseFormat,
            payload_mode: 'openai_compatible',
            allow_remote: false,
            stream_preferred: true,
            timeout_ms: 5000
          }
        : mockServer && mode === 'configured-mock'
          ? {
              adapter_id: 'custom_streaming_tts_http',
              base_url: mockServer.baseUrl,
              endpoint_path: '/tts/stream',
              health_path: '/healthz',
              model: 'mock-fast-streaming-tts',
              voice: 'same-profile-voice',
              response_format: responseFormat,
              payload_mode: 'openai_compatible',
              allow_remote: false,
              stream_preferred: true,
              timeout_ms: 5000
            }
          : {}

    const rawConfig = mode === 'mock' ? mockFallbacks : readConfiguredRawConfig(mockFallbacks)
    const result = await validateStreamingTtsRuntime({
      mode,
      generatedAt,
      rawConfig,
      interactiveFirstAudioMs,
      mockState: mockServer?.state
    })
    if (!result.ok) {
      console.error(JSON.stringify({ ok: false, outputPath: result.outputPath, error: result.error, checks: result.report }, null, 2))
      process.exitCode = 1
      return
    }
    console.log(JSON.stringify({ ok: true, outputPath: result.outputPath, checks: result.report }, null, 2))
  } finally {
    if (mockServer) await mockServer.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
