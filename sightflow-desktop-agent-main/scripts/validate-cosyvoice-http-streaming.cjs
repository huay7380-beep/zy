const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const outputDir = path.resolve(__dirname, '..', 'runtime', 'voice-loop-probes')

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]
  return fallback
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

function headerRecord(headers) {
  const result = {}
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === 'authorization') continue
    result[key] = value
  }
  return result
}

function positiveNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function buildAdapterRuntimeAssessment(input) {
  const firstAudioPayloadMs =
    typeof input.firstAudioPayloadMsFromRequest === 'number' ? input.firstAudioPayloadMsFromRequest : undefined
  const totalRequestMs = typeof input.totalRequestMs === 'number' ? input.totalRequestMs : undefined
  const firstChunkMs = typeof input.firstChunkMsFromRequest === 'number' ? input.firstChunkMsFromRequest : undefined
  const transportStreamingOk = input.nativeStreamingSupported === true
  const firstAudioObserved = typeof firstAudioPayloadMs === 'number'
  const firstChunkObserved = typeof firstChunkMs === 'number'
  const totalRequestWithinBudget =
    typeof totalRequestMs === 'number' ? totalRequestMs <= input.maxTotalRequestMs : undefined
  const firstAudioGapMs =
    firstAudioObserved && firstChunkObserved ? Math.max(0, firstAudioPayloadMs - firstChunkMs) : undefined

  let dialogueRealtimeGrade = 'unknown'
  if (!transportStreamingOk) {
    dialogueRealtimeGrade = 'not_streaming'
  } else if (!firstAudioObserved) {
    dialogueRealtimeGrade = 'unknown'
  } else if (firstAudioPayloadMs <= input.excellentFirstAudioMs) {
    dialogueRealtimeGrade = 'excellent'
  } else if (firstAudioPayloadMs <= input.interactiveFirstAudioMs) {
    dialogueRealtimeGrade = 'interactive'
  } else if (firstAudioPayloadMs <= input.borderlineFirstAudioMs) {
    dialogueRealtimeGrade = 'borderline'
  } else {
    dialogueRealtimeGrade = 'slow'
  }

  const interactiveReady =
    transportStreamingOk &&
    firstAudioObserved &&
    firstAudioPayloadMs <= input.interactiveFirstAudioMs &&
    totalRequestWithinBudget !== false
  const highQualityCacheReady = transportStreamingOk && firstAudioObserved && input.audioBytes > 0 && input.chunkCount > 0

  let adapterRole = 'not_runtime_streaming_candidate'
  if (interactiveReady) {
    adapterRole = 'live_dialogue_primary_candidate'
  } else if (transportStreamingOk && firstAudioObserved && firstAudioPayloadMs <= input.borderlineFirstAudioMs) {
    adapterRole = 'live_dialogue_experimental_only'
  } else if (highQualityCacheReady) {
    adapterRole = 'cached_high_quality_or_non_realtime_voice'
  }

  const recommendation = interactiveReady
    ? 'Use this adapter as a live dialogue TTS candidate, while continuing per-sentence latency tracing.'
    : highQualityCacheReady
      ? 'Keep this adapter for high-quality cached phrases, completion notices, and non-realtime voice; use cache/prewarm or a faster streaming adapter for live dialogue.'
      : 'Do not use this adapter for audible live dialogue until streaming audio payload timing is proven.'

  return {
    schema: 'tts_streaming_adapter_runtime_assessment.v1',
    adapter_id: 'cosyvoice_local_http',
    response_format: input.responseFormat,
    thresholds: {
      excellent_first_audio_ms: input.excellentFirstAudioMs,
      interactive_first_audio_ms: input.interactiveFirstAudioMs,
      borderline_first_audio_ms: input.borderlineFirstAudioMs,
      max_total_request_ms: input.maxTotalRequestMs
    },
    transport_streaming_ok: transportStreamingOk,
    first_audio_payload_observed: firstAudioObserved,
    first_audio_payload_ms: firstAudioPayloadMs,
    first_chunk_ms: firstChunkMs,
    first_audio_gap_after_first_chunk_ms: firstAudioGapMs,
    total_request_ms: totalRequestMs,
    total_request_within_budget: totalRequestWithinBudget,
    chunk_count: input.chunkCount,
    audio_bytes: input.audioBytes,
    dialogue_realtime_grade: dialogueRealtimeGrade,
    interactive_ready: interactiveReady,
    high_quality_cache_ready: highQualityCacheReady,
    adapter_role: adapterRole,
    recommendation,
    next_actions: interactiveReady
      ? [
          'Keep V0/V4 per-sentence latency trace enabled.',
          'Verify real GUI playback under multi-turn dialogue before promoting this mode to default.'
        ]
      : [
          'Prefer prewarmed/cached short phrases for immediate feedback.',
          'Keep CosyVoice as the high-quality or clone-voice path unless first audio payload falls under the interactive budget.',
          'Evaluate a faster TTS adapter for live dialogue while preserving the same voice profile contract.'
        ]
  }
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function readResponseChunks(response) {
  const startedAt = nowMs()
  const chunkSizes = []
  const chunkArrivalMs = []
  const firstChunkPrefix = []
  let chunkCount = 0
  let audioBytes = 0
  let firstChunkMs

  if (!response.body) {
    return {
      chunk_count: 0,
      audio_bytes: 0,
      first_chunk_ms: undefined,
      total_stream_ms: Math.round(nowMs() - startedAt),
      chunk_sizes: [],
      first_chunk_prefix_ascii: '',
      first_chunk_prefix_hex: ''
    }
  }

  const pushChunk = (chunk) => {
    const buffer = Buffer.from(chunk)
    if (buffer.length === 0) return
    chunkCount += 1
    audioBytes += buffer.length
    const arrivedMs = Math.round(nowMs() - startedAt)
    firstChunkMs = firstChunkMs ?? arrivedMs
    if (chunkSizes.length < 16) chunkSizes.push(buffer.length)
    if (chunkArrivalMs.length < 16) chunkArrivalMs.push(arrivedMs)
    if (firstChunkPrefix.length < 16) {
      for (const byte of buffer.subarray(0, 16 - firstChunkPrefix.length)) {
        firstChunkPrefix.push(byte)
      }
    }
  }

  if ('getReader' in response.body && typeof response.body.getReader === 'function') {
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
  } else if (typeof response.body[Symbol.asyncIterator] === 'function') {
    for await (const chunk of response.body) {
      if (chunk?.length) pushChunk(chunk)
    }
  }

  const totalStreamMs = Math.round(nowMs() - startedAt)
  const prefix = Buffer.from(firstChunkPrefix)
  const firstAudioPayloadChunkMs =
    chunkSizes[0] === 44 && prefix.toString('ascii', 0, 4) === 'RIFF' ? chunkArrivalMs[1] : chunkArrivalMs[0]
  return {
    chunk_count: chunkCount,
    audio_bytes: audioBytes,
    first_chunk_ms: firstChunkMs,
    first_audio_payload_chunk_ms: firstAudioPayloadChunkMs,
    total_stream_ms: totalStreamMs,
    chunk_sizes: chunkSizes,
    chunk_arrival_ms: chunkArrivalMs,
    first_chunk_prefix_ascii: prefix.toString('ascii').replace(/[^\x20-\x7E]/g, '.'),
    first_chunk_prefix_hex: prefix.toString('hex')
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  const generatedAt = new Date().toISOString()
  const baseUrl = argValue('--base-url', process.env.SIGHTFLOW_COSYVOICE_BASE_URL || 'http://127.0.0.1:8000').replace(
    /\/+$/,
    ''
  )
  const text = argValue('--text', '我正在测试真实流式语音输出，请尽快返回第一段音频。')
  const responseFormat = argValue('--format', process.env.SIGHTFLOW_COSYVOICE_RESPONSE_FORMAT || 'wav')
  const voice = argValue('--voice', process.env.SIGHTFLOW_COSYVOICE_VOICE || 'default')
  const timeoutMs = Number(argValue('--timeout-ms', process.env.SIGHTFLOW_COSYVOICE_TIMEOUT_MS || '60000'))
  const excellentFirstAudioMs = positiveNumber(argValue('--excellent-first-audio-ms', undefined), 800)
  const interactiveFirstAudioMs = positiveNumber(
    argValue('--interactive-first-audio-ms', process.env.STATUS_DIALOGUE_TTS_INTERACTIVE_FIRST_AUDIO_MS),
    1500
  )
  const borderlineFirstAudioMs = positiveNumber(
    argValue('--borderline-first-audio-ms', process.env.STATUS_DIALOGUE_TTS_BORDERLINE_FIRST_AUDIO_MS),
    2500
  )
  const maxTotalRequestMs = positiveNumber(
    argValue('--max-total-request-ms', process.env.STATUS_DIALOGUE_TTS_MAX_TOTAL_REQUEST_MS),
    12000
  )
  const url = `${baseUrl}/api/v1/audio/speech`

  const healthStartedAt = nowMs()
  const healthResponse = await fetchWithTimeout(`${baseUrl}/health`, {}, 10000)
  const healthMs = Math.round(nowMs() - healthStartedAt)
  assert.equal(healthResponse.ok, true, `CosyVoice health failed: ${healthResponse.status}`)
  const health = await healthResponse.json().catch(() => ({}))

  const requestBody = {
    model: 'cosyvoice',
    input: text,
    voice,
    response_format: responseFormat,
    speed: 1,
    stream: true
  }

  const requestStartedAt = nowMs()
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'audio/*'
      },
      body: JSON.stringify(requestBody)
    },
    timeoutMs
  )
  const headersMs = Math.round(nowMs() - requestStartedAt)
  const headers = headerRecord(response.headers)

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    const failedReport = {
      schema: 'cosyvoice_http_streaming_validation.v1',
      generated_at: generatedAt,
      probe_completed: false,
      service_reachable: true,
      request: {
        base_url_host: new URL(baseUrl).host,
        text_length: text.length,
        response_format: responseFormat,
        stream_requested: true
      },
      health: {
        ok: true,
        latency_ms: healthMs,
        adapter: health.adapter,
        sample_rate: health.sample_rate
      },
      response: {
        status: response.status,
        headers_ms: headersMs,
        headers,
        error_preview: errorText.slice(0, 240)
      },
      boundary: {
        no_audio_written: true,
        external_world_write: false,
        requirement_packet_created: false
      }
    }
    const failedPath = path.join(outputDir, `cosyvoice-http-streaming-validation-${compactTimestamp()}.failed.json`)
    fs.writeFileSync(failedPath, `${JSON.stringify(failedReport, null, 2)}\n`, 'utf8')
    console.error(JSON.stringify({ ok: false, reportPath: failedPath, status: response.status }, null, 2))
    process.exitCode = 1
    return
  }

  const chunks = await readResponseChunks(response)
  const totalMs = Math.round(nowMs() - requestStartedAt)
  const firstChunkMsFromRequest =
    typeof chunks.first_chunk_ms === 'number' ? headersMs + chunks.first_chunk_ms : undefined
  const firstAudioPayloadMsFromRequest =
    typeof chunks.first_audio_payload_chunk_ms === 'number' ? headersMs + chunks.first_audio_payload_chunk_ms : undefined
  const responseGapMs =
    typeof firstChunkMsFromRequest === 'number' ? Math.max(0, totalMs - firstChunkMsFromRequest) : undefined
  const streamingLikely =
    chunks.chunk_count > 1 &&
    typeof firstChunkMsFromRequest === 'number' &&
    firstChunkMsFromRequest < totalMs &&
    (responseGapMs ?? 0) >= 50
  const adapterRuntimeAssessment = buildAdapterRuntimeAssessment({
    nativeStreamingSupported: streamingLikely,
    firstChunkMsFromRequest,
    firstAudioPayloadMsFromRequest,
    totalRequestMs: totalMs,
    chunkCount: chunks.chunk_count,
    audioBytes: chunks.audio_bytes,
    responseFormat,
    excellentFirstAudioMs,
    interactiveFirstAudioMs,
    borderlineFirstAudioMs,
    maxTotalRequestMs
  })

  const report = {
    schema: 'cosyvoice_http_streaming_validation.v1',
    generated_at: generatedAt,
    probe_completed: true,
    service_reachable: true,
    native_streaming_supported: streamingLikely,
    request: {
      base_url_host: new URL(baseUrl).host,
      text_length: text.length,
      response_format: responseFormat,
      stream_requested: true
    },
    health: {
      ok: true,
      latency_ms: healthMs,
      adapter: health.adapter,
      sample_rate: health.sample_rate,
      cuda: health.cuda
    },
    response: {
      status: response.status,
      content_type: response.headers.get('content-type') || '',
      transfer_encoding: response.headers.get('transfer-encoding') || '',
      content_length: response.headers.get('content-length') || '',
      headers_ms: headersMs,
      first_chunk_ms_from_headers: chunks.first_chunk_ms,
      first_chunk_ms_from_request: firstChunkMsFromRequest,
      first_audio_payload_chunk_ms_from_headers: chunks.first_audio_payload_chunk_ms,
      first_audio_payload_chunk_ms_from_request: firstAudioPayloadMsFromRequest,
      total_stream_ms: chunks.total_stream_ms,
      total_request_ms: totalMs,
      response_gap_after_first_chunk_ms: responseGapMs,
      chunk_count: chunks.chunk_count,
      audio_bytes: chunks.audio_bytes,
      chunk_sizes: chunks.chunk_sizes,
      chunk_arrival_ms: chunks.chunk_arrival_ms,
      first_chunk_prefix_ascii: chunks.first_chunk_prefix_ascii,
      first_chunk_prefix_hex: chunks.first_chunk_prefix_hex
    },
    interpretation: {
      service_honored_stream_flag_likely: streamingLikely,
      one_chunk_full_body: chunks.chunk_count === 1,
      reason: streamingLikely
        ? 'The server returned multiple body chunks and the first chunk arrived before the full response completed.'
        : 'The server did not provide enough evidence of native audio streaming for lower first-audio latency.'
    },
    adapter_runtime_assessment: adapterRuntimeAssessment,
    boundary: {
      no_audio_written: true,
      external_world_write: false,
      requirement_packet_created: false
    }
  }

  const outputPath = path.join(outputDir, `cosyvoice-http-streaming-validation-${compactTimestamp()}.json`)
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(
    JSON.stringify(
      {
        ok: true,
        reportPath: outputPath,
        native_streaming_supported: report.native_streaming_supported,
        chunk_count: report.response.chunk_count,
        first_chunk_ms_from_request: report.response.first_chunk_ms_from_request,
        first_audio_payload_chunk_ms_from_request: report.response.first_audio_payload_chunk_ms_from_request,
        total_request_ms: report.response.total_request_ms,
        audio_bytes: report.response.audio_bytes,
        adapter_role: report.adapter_runtime_assessment.adapter_role,
        dialogue_realtime_grade: report.adapter_runtime_assessment.dialogue_realtime_grade,
        interactive_ready: report.adapter_runtime_assessment.interactive_ready,
        recommendation: report.adapter_runtime_assessment.recommendation
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  fs.mkdirSync(outputDir, { recursive: true })
  const reportPath = path.join(outputDir, `cosyvoice-http-streaming-validation-${compactTimestamp()}.failed.json`)
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        schema: 'cosyvoice_http_streaming_validation.v1',
        generated_at: new Date().toISOString(),
        probe_completed: false,
        service_reachable: false,
        error: error instanceof Error ? error.message : String(error),
        boundary: {
          no_audio_written: true,
          external_world_write: false,
          requirement_packet_created: false
        }
      },
      null,
      2
    )}\n`,
    'utf8'
  )
  console.error(JSON.stringify({ ok: false, reportPath, error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
