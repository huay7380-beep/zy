const assert = require('node:assert/strict')
const { execFile } = require('node:child_process')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)

const {
  STATUS_DIALOGUE_VOICE_ACK_TEXT,
  STATUS_DIALOGUE_VOICE_OPENING_TEXT,
  appendVoiceResponseTextDelta,
  buildStatusDialogueVoiceOpeningText,
  buildDefaultVoiceResponseTextStreamState,
  buildVoiceChunkCacheKey,
  buildVoiceLatencyTrace,
  createBufferedStreamingTtsAdapter,
  deriveVoiceEmotionPriority,
  extractPartialJsonStringField,
  finishVoiceResponseTextStream,
  segmentVoiceResponsePlan
} = require('../src/core/status-dialogue/voice-output-pipeline.ts')
const { AIClient } = require('../src/core/ai-client.ts')
const { DEFAULT_COSYVOICE_VOICE_PROFILE } = require('../src/core/status-dialogue/voice-profile.ts')

const repoRoot = path.resolve(__dirname, '..')
const zhinengRoot = path.resolve(repoRoot, '..')
const outputDir = path.join(repoRoot, 'runtime', 'voice-loop-probes')
const defaultAudio = path.join(repoRoot, 'runtime', 'verification-audio', 'chrome-stt-bridge-test-zh-20260625.wav')
const defaultPython = path.join(zhinengRoot, 'third_party', 'envs', 'cosyvoice', 'python.exe')
const defaultWhisperScript = path.join(repoRoot, 'scripts', 'local-whisper-transcribe.py')
const defaultSttServiceBaseUrl = `http://127.0.0.1:${process.env.ZHINENG_STT_SERVICE_PORT || '17858'}`
const defaultModel = 'doubao-seed-2-0-lite-260215'
const defaultModelBaseUrl = 'https://ark.cn-beijing.volces.com/api/v3'
const expectedWarnOpening = buildStatusDialogueVoiceOpeningText({
  globalStatus: 'warn',
  missingStatusCount: 19
})

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]
  return fallback
}

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function firstSentencePreservesWarnOpeningMeaning(sentence) {
  const normalized = compactText(sentence)
  return (
    normalized.includes('19') &&
    (normalized.includes('模块') || normalized.includes('状态卡')) &&
    (normalized.includes('缺') || normalized.includes('没') || normalized.includes('未')) &&
    normalized.includes('巡检')
  )
}

function stripAlreadySpokenVoicePrefix(value, prefix) {
  const normalized = compactText(value)
  const spoken = compactText(prefix)
  if (!normalized || !spoken || !normalized.startsWith(spoken)) return normalized
  return compactText(normalized.slice(spoken.length))
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function safeBaseUrlHost(baseURL) {
  try {
    return new URL(baseURL).host
  } catch {
    return baseURL ? 'invalid_base_url' : 'not_configured'
  }
}

async function readJsonFile(filePath) {
  const raw = await fsp.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

function normalizeModelConfigFromRaw(raw, source) {
  const providerConfig =
    raw?.chatProvider?.config && typeof raw.chatProvider.config === 'object' ? raw.chatProvider.config : raw || {}
  const oldApiKey = typeof raw?.apiKey === 'string' ? raw.apiKey : ''
  const oldModel = typeof raw?.model === 'string' && raw.model ? raw.model : ''
  const apiKey = firstNonEmpty(providerConfig.apiKey, raw?.vision?.apiKey, oldApiKey)
  const model = firstNonEmpty(providerConfig.model, oldModel, defaultModel)
  const baseURL = firstNonEmpty(providerConfig.baseURL, providerConfig.baseUrl, raw?.baseURL, raw?.baseUrl, defaultModelBaseUrl)
  const providerLabel = firstNonEmpty(raw?.chatProvider?.installed?.id, raw?.providerLabel, 'openai-compatible')
  return {
    source,
    apiKey,
    api_key_configured: Boolean(apiKey),
    model,
    baseURL: baseURL.replace(/\/+$/, ''),
    base_url_host: safeBaseUrlHost(baseURL),
    provider_label: providerLabel
  }
}

async function loadModelConfigFromAppSettings() {
  const StoreModule = await import('electron-store')
  const StoreClass = typeof StoreModule.default === 'function' ? StoreModule.default : StoreModule.default?.default
  if (typeof StoreClass !== 'function') {
    throw new Error('electron-store default export is not a constructor')
  }
  const store = new StoreClass({ name: 'settings', projectName: 'zhineng-social-assistant-desktop' })
  return normalizeModelConfigFromRaw(store.store, 'electron_store.settings')
}

async function resolveModelConfig(modelMode) {
  if (process.env.STATUS_DIALOGUE_MODEL_API_KEY) {
    return {
      source: 'environment',
      apiKey: process.env.STATUS_DIALOGUE_MODEL_API_KEY,
      api_key_configured: true,
      model: process.env.STATUS_DIALOGUE_MODEL || defaultModel,
      baseURL: (process.env.STATUS_DIALOGUE_MODEL_BASE_URL || defaultModelBaseUrl).replace(/\/+$/, ''),
      base_url_host: safeBaseUrlHost(process.env.STATUS_DIALOGUE_MODEL_BASE_URL || defaultModelBaseUrl),
      provider_label: 'environment'
    }
  }

  const configPath = argValue('--model-config', '')
  if (configPath) {
    const raw = await readJsonFile(path.resolve(configPath))
    return normalizeModelConfigFromRaw(raw, 'model_config_file')
  }

  if (modelMode === 'app-settings' || modelMode === 'real') {
    return await loadModelConfigFromAppSettings()
  }

  return {
    source: 'local_simulated',
    apiKey: '',
    api_key_configured: false,
    model: 'simulated-status-dialogue-stream',
    baseURL: 'local-simulated',
    base_url_host: 'local-simulated',
    provider_label: 'local-simulated'
  }
}

function parseWavInfo(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('TTS output is not a RIFF/WAVE file')
  }

  let offset = 12
  let sampleRate = 0
  let channels = 0
  let bitsPerSample = 0
  let dataBytes = 0

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    if (chunkId === 'fmt ') {
      channels = buffer.readUInt16LE(chunkStart + 2)
      sampleRate = buffer.readUInt32LE(chunkStart + 4)
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14)
    }
    if (chunkId === 'data') {
      dataBytes = chunkSize
      break
    }
    offset = chunkStart + chunkSize + (chunkSize % 2)
  }

  if (!sampleRate || !channels || !bitsPerSample || !dataBytes) {
    throw new Error('TTS output WAV header is incomplete')
  }

  return {
    sample_rate: sampleRate,
    channels,
    bits_per_sample: bitsPerSample,
    data_bytes: dataBytes,
    duration_ms: Math.round((dataBytes / (sampleRate * channels * (bitsPerSample / 8))) * 1000)
  }
}

function buildPlan(text, sourceOutputId, emotion = 'focused') {
  return {
    schema: 'voice_response_plan.v1',
    text,
    voice_profile_id: DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id,
    clone_profile_id: null,
    emotion_hint: emotion,
    speed: 1,
    pitch: 1,
    volume: 1,
    fallback_allowed: false,
    source_output_id: sourceOutputId
  }
}

function ttsAudioCachePath(cacheKey) {
  const cacheDir = path.join(process.env.ZHINENG_PROJECT_ROOT ? path.resolve(process.env.ZHINENG_PROJECT_ROOT) : zhinengRoot, 'runtime', 'voice-audio-cache')
  const fileName = `${require('node:crypto').createHash('sha256').update(cacheKey).digest('hex')}.json`
  return path.join(cacheDir, fileName)
}

function readTtsAudioCache(cacheKey) {
  try {
    if (process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_CACHE === '0') return null
    const cachePath = ttsAudioCachePath(cacheKey)
    if (!fs.existsSync(cachePath)) return null
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
    if (
      parsed?.schema !== 'status_dialogue_tts_audio_cache.v1' ||
      parsed?.cache_key !== cacheKey ||
      typeof parsed?.audio_data_url !== 'string' ||
      !parsed.audio_data_url.startsWith('data:')
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

async function writeTtsAudioCache(cacheKey, text, emotion, audioBase64, audioMimeType) {
  if (process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_CACHE === '0') return
  const cachePath = ttsAudioCachePath(cacheKey)
  await fsp.mkdir(path.dirname(cachePath), { recursive: true })
  await fsp.writeFile(
    cachePath,
    `${JSON.stringify(
      {
        schema: 'status_dialogue_tts_audio_cache.v1',
        cache_key: cacheKey,
        generated_at: new Date().toISOString(),
        adapter_id: 'cosyvoice_local_http',
        voice_profile_id: DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id,
        audio_data_url: `data:${audioMimeType};base64,${audioBase64}`,
        audio_mime_type: audioMimeType,
        text_length: text.length,
        emotion_hint: emotion
      },
      null,
      2
    )}\n`,
    'utf8'
  )
}

async function synthesizeCosyVoice({ ttsBaseUrl, text, outputPath }) {
  const startedAt = Date.now()
  const response = await fetch(`${ttsBaseUrl}/api/v1/audio/speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'cosyvoice',
      voice: DEFAULT_COSYVOICE_VOICE_PROFILE.voice_id,
      input: text,
      response_format: 'wav',
      speed: 1
    })
  })
  const audioBuffer = Buffer.from(await response.arrayBuffer())
  await fsp.writeFile(outputPath, audioBuffer)
  const wav = response.ok ? parseWavInfo(audioBuffer) : undefined
  return {
    ok: response.ok && audioBuffer.length > 4096 && Boolean(wav),
    status: response.status,
    latency_ms: Date.now() - startedAt,
    audio_path: outputPath,
    audio_bytes: audioBuffer.length,
    audio_base64: audioBuffer.toString('base64'),
    audio_mime_type: 'audio/wav',
    wav,
    error_preview: response.ok ? undefined : audioBuffer.toString('utf8', 0, 240)
  }
}

async function synthesizeCosyVoiceCached({ ttsBaseUrl, text, outputPath, emotion = 'focused' }) {
  const cacheKey = buildVoiceChunkCacheKey({
    text,
    voiceProfile: DEFAULT_COSYVOICE_VOICE_PROFILE,
    emotionHint: emotion
  })
  const startedAt = Date.now()
  const cached = readTtsAudioCache(cacheKey)
  if (cached) {
    const audioBase64 = cached.audio_data_url.split(',')[1] || ''
    const audioBuffer = Buffer.from(audioBase64, 'base64')
    await fsp.writeFile(outputPath, audioBuffer)
    const wav = parseWavInfo(audioBuffer)
    return {
      ok: audioBuffer.length > 4096 && Boolean(wav),
      status: 200,
      latency_ms: Date.now() - startedAt,
      audio_path: outputPath,
      audio_bytes: audioBuffer.length,
      audio_base64: audioBase64,
      audio_mime_type: cached.audio_mime_type || 'audio/wav',
      wav,
      cache_hit: true,
      cache_key: cacheKey
    }
  }

  const result = await synthesizeCosyVoice({ ttsBaseUrl, text, outputPath })
  if (result.ok) {
    await writeTtsAudioCache(cacheKey, text, emotion, result.audio_base64, result.audio_mime_type)
  }
  return {
    ...result,
    cache_hit: false,
    cache_key: cacheKey
  }
}

function serviceUrl(baseUrl, pathname) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}${pathname}`
}

async function readJsonResponse(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return {
      success: false,
      error: `invalid json response: ${text.slice(0, 240)}`
    }
  }
}

async function transcribeWithPersistentWhisperService({ serviceBaseUrl, audioPath, language, model }) {
  const healthStartedAt = Date.now()
  const healthResponse = await fetch(serviceUrl(serviceBaseUrl, '/health'), { method: 'GET' })
  const healthPayload = await readJsonResponse(healthResponse)
  const health = {
    ok: healthResponse.ok && healthPayload.ok === true,
    status: healthResponse.status,
    latency_ms: Date.now() - healthStartedAt,
    payload: healthPayload
  }
  if (!health.ok) {
    return {
      result: {
        success: false,
        adapter_id: 'local_whisper_persistent_service',
        error: healthPayload.error || `local whisper service health failed: ${healthResponse.status}`,
        fallback_reason: 'service_unavailable'
      },
      health,
      latency_ms: health.latency_ms
    }
  }

  const startedAt = Date.now()
  const response = await fetch(serviceUrl(serviceBaseUrl, '/transcribe'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      audio_path: audioPath,
      language,
      model
    })
  })
  const payload = await readJsonResponse(response)
  return {
    result: {
      ...payload,
      success: response.ok && payload.success === true,
      adapter_id: payload.adapter_id || 'local_whisper_persistent_service'
    },
    health,
    latency_ms: Date.now() - startedAt
  }
}

async function transcribeWithColdWhisperProcess({ pythonPath, whisperScript, audioPath, language, model }) {
  const startedAt = Date.now()
  const { stdout, stderr } = await execFileAsync(
    pythonPath,
    [whisperScript, '--audio', audioPath, '--language', language, '--model', model],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        WHISPER_CACHE_DIR: process.env.WHISPER_CACHE_DIR || path.join(zhinengRoot, 'third_party', 'whisper-cache')
      },
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024
    }
  )
  return {
    result: JSON.parse(stdout.trim()),
    stderr,
    latency_ms: Date.now() - startedAt
  }
}

async function collectModelDeltas({ modelMode, transcript }) {
  if (modelMode === 'real' || modelMode === 'app-settings') {
    const modelConfig = await resolveModelConfig(modelMode)
    if (!modelConfig.apiKey) {
      const error = new Error(`${modelMode} requires configured model api key`)
      error.model_config = {
        source: modelConfig.source,
        api_key_configured: false,
        model: modelConfig.model,
        base_url_host: modelConfig.base_url_host,
        provider_label: modelConfig.provider_label
      }
      throw error
    }
    const client = new AIClient({
      apiKey: modelConfig.apiKey,
      model: modelConfig.model,
      baseURL: modelConfig.baseURL,
      systemPrompt:
        `Return JSON only. Put voice first. The first voice sentence must preserve this status meaning, but use natural wording: ${expectedWarnOpening}`
    })
    const deltas = []
    const startedAt = Date.now()
    for await (const delta of client.callChatStream([
      {
        role: 'system',
        content:
          `Return JSON only with voice first. Speak as a concise first-person Chinese subject status patrol. Preserve this status meaning in the first voice sentence, without repeating it exactly: ${expectedWarnOpening}`
      },
      {
        role: 'user',
        content: `Voice transcript: ${transcript}. Reply with status-only patrol feedback.`
      }
    ])) {
      deltas.push(delta)
    }
    return {
      mode: 'real',
      deltas,
      latency_ms: Date.now() - startedAt,
      model: modelConfig.model,
      base_url: modelConfig.baseURL,
      base_url_host: modelConfig.base_url_host,
      provider_label: modelConfig.provider_label,
      config_source: modelConfig.source,
      api_key_configured: modelConfig.api_key_configured
    }
  }

  const modelConfig = await resolveModelConfig(modelMode)

  const voice =
    `我看到还有 19 个模块没拿到状态卡，先按只读巡检继续。我听到了你的语音，下一步关注语音延迟。`
  const reply = `${voice} Transcript length ${transcript.length}.`
  const json = JSON.stringify({
    voice,
    reply,
    thoughts: ['stt complete', 'stream first sentence before done', 'tts queue active'],
    status_refs: ['voice_response_text_stream.v1', 'voice_playback_queue.v1'],
    missing_status: []
  })
  return {
    mode: 'simulated_openai_delta',
    deltas: [json.slice(0, 18), json.slice(18, 34), json.slice(34, 58), json.slice(58)],
    latency_ms: 0,
    model: 'simulated-status-dialogue-stream',
    base_url: modelConfig.baseURL,
    base_url_host: modelConfig.base_url_host,
    provider_label: modelConfig.provider_label,
    config_source: modelConfig.source,
    api_key_configured: modelConfig.api_key_configured
  }
}

async function run() {
  const runStartedAt = Date.now()
  const runId = `status-dialogue-stream-loop-${compactTimestamp()}`
  const audioPath = path.resolve(argValue('--audio', defaultAudio))
  const pythonPath = path.resolve(argValue('--python', defaultPython))
  const whisperScript = path.resolve(argValue('--whisper-script', defaultWhisperScript))
  const ttsBaseUrl = argValue('--tts-base-url', 'http://127.0.0.1:8000')
  const whisperModel = argValue('--whisper-model', 'base')
  const sttMode = argValue('--stt-mode', 'service')
  const sttServiceBaseUrl = argValue('--stt-service-url', defaultSttServiceBaseUrl)
  const language = argValue('--language', 'zh')
  const modelMode = argValue('--model-mode', process.env.STATUS_DIALOGUE_MODEL_API_KEY ? 'real' : 'simulated')

  await fsp.mkdir(outputDir, { recursive: true })
  assert.equal(fs.existsSync(audioPath), true, `Audio file missing: ${audioPath}`)

  const report = {
    schema: 'status_dialogue_voice_stream_loop_validation.v1',
    run_id: runId,
    generated_at: new Date().toISOString(),
    input_audio: audioPath,
    model_mode: modelMode,
    model_config: {
      source: 'pending',
      api_key_configured: false,
      model: '',
      base_url_host: ''
    },
    voice_profile_id: DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id,
    steps: [],
    checks: {},
    success: false
  }

  const healthStartedAt = Date.now()
  const healthResponse = await fetch(`${ttsBaseUrl}/health`)
  const healthText = await healthResponse.text()
  report.steps.push({
    id: 'tts_health',
    ok: healthResponse.ok,
    latency_ms: Date.now() - healthStartedAt,
    status: healthResponse.status,
    body_preview: healthText.slice(0, 240)
  })
  if (!healthResponse.ok) throw new Error(`CosyVoice health failed: ${healthResponse.status}`)

  const sttProbe =
    sttMode === 'cold'
      ? await transcribeWithColdWhisperProcess({
          pythonPath,
          whisperScript,
          audioPath,
          language,
          model: whisperModel
        })
      : await transcribeWithPersistentWhisperService({
          serviceBaseUrl: sttServiceBaseUrl,
          audioPath,
          language,
          model: whisperModel
        })
  const sttResult = sttProbe.result
  const transcript = compactText(sttResult.transcript)
  const sttMs = sttProbe.latency_ms
  const sttAdapter =
    sttMode === 'cold'
      ? 'local_whisper_ipc_equivalent'
      : sttResult.adapter_id || sttProbe.health?.payload?.adapter_id || 'local_whisper_persistent_service'
  report.steps.push({
    id: 'stt_local_whisper',
    ok: sttResult.success === true && transcript.length > 0,
    latency_ms: sttMs,
    adapter: sttAdapter,
    stt_mode: sttMode,
    service_base_url: sttMode === 'cold' ? undefined : sttServiceBaseUrl,
    service_health: sttProbe.health,
    model: whisperModel,
    language,
    transcript_length: transcript.length,
    transcript,
    stderr_preview: sttProbe.stderr ? sttProbe.stderr.slice(0, 240) : undefined,
    error: sttResult.error
  })
  if (!transcript) throw new Error('STT returned no transcript')

  const modelStartedAt = Date.now()
  const streamStateInitial = buildDefaultVoiceResponseTextStreamState({ streamId: runId })
  let textStreamState = streamStateInitial
  let rawModelText = ''
  let previousVoiceText = ''
  let firstSentence = ''
  let firstSentenceReadyAt = 0
  let firstTtsStartedAt = 0
  let streamedVoicePrefix = ''
  const streamedTtsTasks = []
  const model = await collectModelDeltas({ modelMode, transcript })
  report.model_config = {
    source: model.config_source || 'unknown',
    api_key_configured: model.api_key_configured === true,
    model: model.model,
    base_url_host: model.base_url_host || safeBaseUrlHost(model.base_url || '')
  }

  for (const delta of model.deltas) {
    rawModelText += delta
    const voiceText =
      extractPartialJsonStringField(rawModelText, 'voice') || extractPartialJsonStringField(rawModelText, 'voiceText')
    if (voiceText.length <= previousVoiceText.length) continue
    const voiceDelta = voiceText.slice(previousVoiceText.length)
    previousVoiceText = voiceText
    const step = appendVoiceResponseTextDelta(textStreamState, voiceDelta, { minFirstSentenceChars: 8 })
    textStreamState = step.state
    const sentenceEvents = step.events.filter((item) => item.type === 'sentence_ready' && item.sentence)
    for (const event of sentenceEvents) {
      const sentence = event.sentence
      const sentenceIndex = event.sentence_index ?? streamedTtsTasks.length + 1
      if (!firstSentence) {
        firstSentence = sentence
        firstSentenceReadyAt = Date.now()
      }
      streamedVoicePrefix = event.spoken_prefix || `${streamedVoicePrefix}${sentence}`
      const policy = deriveVoiceEmotionPriority({ intent: 'patrol_warn', globalStatus: 'warn' })
      const sentencePlan = buildPlan(sentence, `${runId}:stream_sentence_${sentenceIndex}`, policy.emotion_hint)
      const sentenceChunks = segmentVoiceResponsePlan(sentencePlan, DEFAULT_COSYVOICE_VOICE_PROFILE, {
        kind: 'final',
        priority: policy.priority,
        emotionHint: policy.emotion_hint,
        maxChars: 32,
        minChars: 8
      })
      const ttsStartedAt = Date.now()
      firstTtsStartedAt = firstTtsStartedAt || ttsStartedAt
      const task = synthesizeCosyVoiceCached({
        ttsBaseUrl,
        text: sentence,
        outputPath: path.join(outputDir, `${runId}.stream-${sentenceIndex}.wav`),
        emotion: policy.emotion_hint
      }).then(async (tts) => {
        const streamingAdapter = createBufferedStreamingTtsAdapter({
          adapterId: `streaming_tts_adapter.runtime.sentence_${sentenceIndex}_buffered`,
          frameBase64Chars: 4096,
          synthesize: async () => ({
            audio_base64: tts.audio_base64,
            audio_mime_type: tts.audio_mime_type,
            generated_at: new Date().toISOString()
          })
        })
        const frames = []
        for await (const frame of streamingAdapter.synthesizeStream({
          schema: 'streaming_tts_synthesis_request.v1',
          chunk: sentenceChunks[0],
          plan: sentencePlan,
          voice_profile: DEFAULT_COSYVOICE_VOICE_PROFILE
        })) {
          frames.push(frame)
        }
        return {
          sentence,
          sentence_index: sentenceIndex,
          ready_ms: ttsStartedAt - modelStartedAt,
          spoken_prefix: event.spoken_prefix,
          ...tts,
          chunks: sentenceChunks.length,
          streaming_frames: frames.length,
          streaming_recombined: frames.map((frame) => frame.audio_base64).join('') === tts.audio_base64
        }
      })
      streamedTtsTasks.push({ sentence, sentence_index: sentenceIndex, spoken_prefix: event.spoken_prefix, promise: task })
    }
  }

  const finishedStream = finishVoiceResponseTextStream(textStreamState)
  const modelDoneAt = Date.now()
  const streamedTtsResults = await Promise.all(streamedTtsTasks.map((item) => item.promise))
  const firstTts = streamedTtsResults[0]
  if (!firstTts?.ok) throw new Error('First sentence TTS did not run successfully')

  const fullVoiceText = finishedStream.event.accumulated_text
  const remainingVoiceText = stripAlreadySpokenVoicePrefix(fullVoiceText, streamedVoicePrefix || firstSentence)
  let finalTts
  if (remainingVoiceText) {
    finalTts = await synthesizeCosyVoiceCached({
      ttsBaseUrl,
      text: remainingVoiceText,
      outputPath: path.join(outputDir, `${runId}.remaining.wav`),
      emotion: 'focused'
    })
    if (!finalTts.ok) throw new Error('Remaining voice TTS failed')
  }

  const cacheProbeText = '\u6211\u5df2\u5b8c\u6210\u68c0\u67e5\u3002'
  const cacheProbeFirst = await synthesizeCosyVoiceCached({
    ttsBaseUrl,
    text: cacheProbeText,
    outputPath: path.join(outputDir, `${runId}.cache-probe-first.wav`),
    emotion: 'warm'
  })
  const cacheProbeSecond = await synthesizeCosyVoiceCached({
    ttsBaseUrl,
    text: cacheProbeText,
    outputPath: path.join(outputDir, `${runId}.cache-probe-second.wav`),
    emotion: 'warm'
  })
  if (!cacheProbeFirst.ok || !cacheProbeSecond.ok || cacheProbeSecond.cache_hit !== true) {
    throw new Error('TTS cache probe did not hit on the second synthesis')
  }

  const ackCacheProbeItems = []
  for (const [kind, text] of Object.entries(STATUS_DIALOGUE_VOICE_ACK_TEXT)) {
    const result = await synthesizeCosyVoiceCached({
      ttsBaseUrl,
      text,
      outputPath: path.join(outputDir, `${runId}.ack-${kind}.wav`),
      emotion: 'warm'
    })
    if (!result.ok) throw new Error(`Ack TTS cache probe failed for ${kind}`)
    ackCacheProbeItems.push({
      kind,
      text_length: text.length,
      cache_hit: result.cache_hit,
      latency_ms: result.latency_ms,
      cache_key: result.cache_key,
      audio_bytes: result.audio_bytes,
      wav: result.wav
    })
  }

  const modelMs = modelDoneAt - modelStartedAt
  const firstTtsMs = firstTts.latency_ms
  const finalTtsMs = finalTts?.latency_ms ?? 0
  const streamedTtsMs = streamedTtsResults.reduce((total, item) => total + (item.latency_ms ?? 0), 0)
  const runtimeVoiceCacheHits =
    streamedTtsResults.filter((item) => item.cache_hit).length + (finalTts?.cache_hit ? 1 : 0)
  const firstPlaybackMs = firstTts.wav?.duration_ms
  const streamedPlaybackMs = streamedTtsResults.reduce((total, item) => total + (item.wav?.duration_ms ?? 0), 0)
  const totalPlaybackMs = streamedPlaybackMs + (finalTts?.wav?.duration_ms ?? 0)
  const latencySegments = streamedTtsResults.map((item) => ({
    chunk_id: `${runId}:stream-sentence-${item.sentence_index}`,
    source_output_id: runId,
    kind: 'final',
    index: item.sentence_index,
    total: streamedTtsResults.length,
    text_length: item.sentence.length,
    cache_hit: item.cache_hit === true,
    status: item.ok ? 'spoken' : 'error',
    tts_ms: item.latency_ms,
    playback_ms: item.wav?.duration_ms,
    error: item.ok ? undefined : item.error_preview
  }))
  const latencyTrace = buildVoiceLatencyTrace({
    sessionId: runId,
    sttMs,
    modelMs,
    firstTtsMs,
    totalTtsMs: streamedTtsMs + finalTtsMs,
    firstPlaybackMs,
    totalPlaybackMs,
    endToEndMs: Date.now() - runStartedAt,
    chunkCount: streamedTtsResults.length + (remainingVoiceText ? 1 : 0),
    cachedChunkCount: runtimeVoiceCacheHits,
    failedChunkCount: 0,
    segments: latencySegments
  })

  report.steps.push({
    id: 'model_stream',
    ok: model.deltas.length > 0 && Boolean(firstSentence),
    mode: model.mode,
    model: model.model,
    base_url_host: model.base_url_host || safeBaseUrlHost(model.base_url || ''),
    provider_label: model.provider_label,
    config_source: model.config_source,
    api_key_configured: model.api_key_configured === true,
    delta_count: model.deltas.length,
    model_latency_ms: model.latency_ms || modelMs,
    first_sentence: firstSentence,
    first_sentence_ready_ms: firstSentenceReadyAt - modelStartedAt,
    model_done_ms: modelDoneAt - modelStartedAt,
    raw_text_length: rawModelText.length,
    voice_text_length: fullVoiceText.length,
    streamed_sentence_count: streamedTtsResults.length,
    streamed_voice_prefix_length: streamedVoicePrefix.length,
    remaining_voice_text_length: remainingVoiceText.length,
    expected_opening_first_sentence: expectedWarnOpening,
    formal_opening_meaning_matched: firstSentencePreservesWarnOpeningMeaning(firstSentence)
  })
  report.steps.push({
    id: 'tts_streamed_sentences',
    ok: streamedTtsResults.length >= 2 && streamedTtsResults.every((item) => item.ok === true),
    sentence_count: streamedTtsResults.length,
    all_cache_hit: streamedTtsResults.every((item) => item.cache_hit === true),
    all_streaming_recombined: streamedTtsResults.every((item) => item.streaming_recombined === true),
    total_latency_ms: streamedTtsMs,
    total_playback_ms: streamedPlaybackMs,
    remaining_voice_text_length: remainingVoiceText.length,
    sentences: streamedTtsResults.map((item) => ({
      sentence_index: item.sentence_index,
      text_length: item.sentence.length,
      latency_ms: item.latency_ms,
      cache_hit: item.cache_hit,
      streaming_frames: item.streaming_frames,
      streaming_recombined: item.streaming_recombined,
      wav: item.wav
    }))
  })
  report.steps.push({
    id: 'tts_first_sentence',
    ok: firstTts.ok,
    latency_ms: firstTts.latency_ms,
    audio_path: firstTts.audio_path,
    audio_bytes: firstTts.audio_bytes,
    wav: firstTts.wav,
    cache_hit: firstTts.cache_hit,
    cache_key: firstTts.cache_key,
    streaming_frames: firstTts.streaming_frames,
    streaming_recombined: firstTts.streaming_recombined
  })
  if (finalTts) {
    report.steps.push({
      id: 'tts_remaining_voice',
      ok: finalTts.ok,
      latency_ms: finalTts.latency_ms,
      audio_path: finalTts.audio_path,
      audio_bytes: finalTts.audio_bytes,
      wav: finalTts.wav,
      cache_hit: finalTts.cache_hit,
      cache_key: finalTts.cache_key
    })
  }
  report.steps.push({
    id: 'tts_cache_probe',
    ok: cacheProbeSecond.cache_hit === true,
    text_length: cacheProbeText.length,
    first_cache_hit: cacheProbeFirst.cache_hit,
    second_cache_hit: cacheProbeSecond.cache_hit,
    first_latency_ms: cacheProbeFirst.latency_ms,
    second_latency_ms: cacheProbeSecond.latency_ms,
    cache_key: cacheProbeSecond.cache_key,
    audio_bytes: cacheProbeSecond.audio_bytes,
    wav: cacheProbeSecond.wav
  })
  report.steps.push({
    id: 'tts_ack_cache_probe',
    ok: ackCacheProbeItems.every((item) => item.cache_hit === true && item.latency_ms < 1000),
    voice_profile_id: DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id,
    items: ackCacheProbeItems
  })

  report.latency_trace = latencyTrace
  report.checks = {
    stt_ok: transcript.length > 0,
    stt_uses_persistent_service: sttMode === 'service' ? sttAdapter === 'local_whisper_persistent_service' : true,
    stt_service_health_ok: sttMode === 'service' ? sttProbe.health?.ok === true : true,
    first_sentence_ready_before_model_done: firstSentenceReadyAt > 0 && firstSentenceReadyAt < modelDoneAt,
    first_tts_started_before_model_done: firstTtsStartedAt > 0 && firstTtsStartedAt < modelDoneAt,
    streamed_sentence_count_at_least_two: streamedTtsResults.length >= 2,
    streamed_sentences_tts_ok: streamedTtsResults.every((item) => item.ok === true),
    streamed_sentences_no_final_duplicate: remainingVoiceText.length === 0,
    latency_segments_cover_streamed_sentences: latencyTrace.segments.length === streamedTtsResults.length,
    formal_opening_first_sentence: firstSentencePreservesWarnOpeningMeaning(firstSentence),
    formal_opening_cache_hit: firstTts.cache_hit === true,
    formal_opening_low_latency: firstTts.latency_ms < 1000,
    first_sentence_tts_ok: firstTts.ok === true,
    remaining_voice_tts_ok: remainingVoiceText ? finalTts?.ok === true : true,
    same_voice_profile: DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id === 'voice.cosyvoice.local.default',
    browser_tts_used: false,
    external_world_write: false,
    requirement_packet_created: false,
    streaming_frames_recombined: firstTts.streaming_recombined === true,
    tts_cache_second_hit: cacheProbeSecond.cache_hit === true,
    tts_cache_second_low_latency: cacheProbeSecond.latency_ms < 1000,
    tts_cache_second_latency_ms: cacheProbeSecond.latency_ms,
    ack_cache_all_hit: ackCacheProbeItems.every((item) => item.cache_hit === true),
    ack_cache_low_latency: ackCacheProbeItems.every((item) => item.latency_ms < 1000),
    ack_cache_hit_count: ackCacheProbeItems.filter((item) => item.cache_hit).length,
    runtime_voice_cache_hits: runtimeVoiceCacheHits,
    slowest_stage: latencyTrace.slowest_stage
  }

  for (const [name, value] of Object.entries(report.checks)) {
    if (
      name === 'slowest_stage' ||
      name === 'runtime_voice_cache_hits' ||
      name === 'tts_cache_second_latency_ms' ||
      name === 'ack_cache_hit_count'
    ) {
      continue
    }
    assert.equal(value, name === 'browser_tts_used' || name === 'external_world_write' || name === 'requirement_packet_created' ? false : true)
  }

  report.success = true
  report.total_latency_ms = Date.now() - runStartedAt
  const reportPath = path.join(outputDir, `${runId}.json`)
  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ ok: true, reportPath, checks: report.checks, latency_trace: latencyTrace }, null, 2))
}

run().catch(async (error) => {
  await fsp.mkdir(outputDir, { recursive: true })
  const reportPath = path.join(outputDir, `status-dialogue-stream-loop-${compactTimestamp()}.failed.json`)
  await fsp.writeFile(
    reportPath,
    `${JSON.stringify(
      {
        schema: 'status_dialogue_voice_stream_loop_validation.v1',
        generated_at: new Date().toISOString(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        model_config: error?.model_config
      },
      null,
      2
    )}\n`,
    'utf8'
  )
  console.error(JSON.stringify({ ok: false, reportPath, error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
