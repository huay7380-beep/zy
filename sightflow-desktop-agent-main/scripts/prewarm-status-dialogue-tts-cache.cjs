const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const {
  DEFAULT_COSYVOICE_TTS_CONFIG,
  buildCosyVoiceRequestBody
} = require('../src/core/status-dialogue/tts-adapter.ts')
const { DEFAULT_COSYVOICE_VOICE_PROFILE } = require('../src/core/status-dialogue/voice-profile.ts')
const {
  STATUS_DIALOGUE_VOICE_ACK_TEXT,
  STATUS_DIALOGUE_VOICE_OPENING_TEXT,
  buildStatusDialogueVoiceOpeningText,
  buildVoiceChunkCacheKey
} = require('../src/core/status-dialogue/voice-output-pipeline.ts')

const repoRoot = path.resolve(__dirname, '..')
const zhinengRoot = process.env.ZHINENG_PROJECT_ROOT
  ? path.resolve(process.env.ZHINENG_PROJECT_ROOT)
  : path.resolve(repoRoot, '..')
const outputDir = path.join(repoRoot, 'runtime', 'voice-loop-probes')
const cacheDir = path.join(zhinengRoot, 'runtime', 'voice-audio-cache')

const defaultPhrases = [
  {
    id: 'ack_speech_transcript_checking',
    text: STATUS_DIALOGUE_VOICE_ACK_TEXT.speech_transcript,
    emotion: 'warm'
  },
  {
    id: 'ack_text_checking',
    text: STATUS_DIALOGUE_VOICE_ACK_TEXT.text,
    emotion: 'warm'
  },
  {
    id: 'opening_ok_patrol_complete',
    text: STATUS_DIALOGUE_VOICE_OPENING_TEXT.ok,
    emotion: 'steady'
  },
  {
    id: 'opening_warn_patrol_gap',
    text: STATUS_DIALOGUE_VOICE_OPENING_TEXT.warn,
    emotion: 'focused'
  },
  {
    id: 'opening_warn_18_missing_cards',
    text: buildStatusDialogueVoiceOpeningText({ globalStatus: 'warn', missingStatusCount: 18 }),
    emotion: 'focused'
  },
  {
    id: 'opening_warn_19_missing_cards',
    text: buildStatusDialogueVoiceOpeningText({ globalStatus: 'warn', missingStatusCount: 19 }),
    emotion: 'focused'
  },
  {
    id: 'opening_blocked_patrol_blocked',
    text: STATUS_DIALOGUE_VOICE_OPENING_TEXT.blocked,
    emotion: 'urgent'
  },
  {
    id: 'opening_unknown_patrol_checking',
    text: STATUS_DIALOGUE_VOICE_OPENING_TEXT.unknown,
    emotion: 'steady'
  },
  {
    id: 'completion_notice_confirm',
    text: '我已完成工作，张博先过来确认方案。',
    emotion: 'warm'
  },
  {
    id: 'demand_received_checking',
    text: '我收到你的需求，正在检查状态。',
    emotion: 'focused'
  },
  {
    id: 'voice_chain_error_text_fallback',
    text: '语音链路出现异常，我先切回文字反馈。',
    emotion: 'urgent'
  },
  {
    id: 'patrol_complete_no_blocker',
    text: '当前巡检完成，没有发现新的阻塞。',
    emotion: 'steady'
  },
  {
    id: 'patrol_gap_all_modules_empty_scan',
    text: '所有模块都没接入，但我正在扫描，目前是空载状态。',
    emotion: 'focused'
  },
  {
    id: 'patrol_gap_all_status_cards_missing',
    text: '所有19个模块都未连接状态卡，正在等待它们发布状态。',
    emotion: 'focused'
  },
  {
    id: 'patrol_complete_status_cards_missing',
    text: '我已完成只读状态巡逻，仍有状态卡缺失，需要继续补齐。',
    emotion: 'focused'
  }
]

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

function buildUrl(pathValue) {
  return new URL(pathValue, DEFAULT_COSYVOICE_TTS_CONFIG.base_url).toString()
}

function cachePath(cacheKey) {
  return path.join(cacheDir, `${crypto.createHash('sha256').update(cacheKey).digest('hex')}.json`)
}

function readCache(cacheKey) {
  try {
    if (process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_CACHE === '0') return null
    const filePath = cachePath(cacheKey)
    if (!fs.existsSync(filePath)) return null
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (
      parsed?.schema !== 'status_dialogue_tts_audio_cache.v1' ||
      parsed?.cache_key !== cacheKey ||
      typeof parsed?.audio_data_url !== 'string' ||
      !parsed.audio_data_url.startsWith('data:') ||
      typeof parsed?.audio_mime_type !== 'string'
    ) {
      return null
    }
    return { ...parsed, file_path: filePath }
  } catch {
    return null
  }
}

function writeCache(entry) {
  if (process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_CACHE === '0') return undefined
  fs.mkdirSync(cacheDir, { recursive: true })
  const filePath = cachePath(entry.cache_key)
  fs.writeFileSync(filePath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
  return filePath
}

function wavHeaderValid(buffer) {
  return buffer.length > 44 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE'
}

function buildPlan(text, id, emotion) {
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
    source_output_id: `prewarm_${id}_${Date.now()}`
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

async function synthesizePhrase(phrase) {
  const plan = buildPlan(phrase.text, phrase.id, phrase.emotion)
  const cacheKey = buildVoiceChunkCacheKey({
    text: phrase.text,
    voiceProfile: DEFAULT_COSYVOICE_VOICE_PROFILE,
    emotionHint: phrase.emotion
  })
  const cached = readCache(cacheKey)
  if (cached) {
    return {
      id: phrase.id,
      text_length: phrase.text.length,
      emotion_hint: phrase.emotion,
      cache_key: cacheKey,
      cache_hit: true,
      generated: false,
      latency_ms: 0,
      audio_mime_type: cached.audio_mime_type,
      cache_path: cached.file_path
    }
  }

  const config = {
    ...DEFAULT_COSYVOICE_TTS_CONFIG,
    response_format: 'wav',
    stream_preferred: false
  }
  const startedAt = nowMs()
  const response = await fetchWithTimeout(
    buildUrl(config.endpoint_path),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'audio/wav'
      },
      body: JSON.stringify(buildCosyVoiceRequestBody(config, plan))
    },
    config.timeout_ms
  )
  const audioBuffer = Buffer.from(await response.arrayBuffer())
  assert.equal(response.ok, true, `CosyVoice prewarm failed for ${phrase.id}: ${response.status}`)
  assert.equal(wavHeaderValid(audioBuffer), true, `CosyVoice prewarm returned invalid WAV for ${phrase.id}`)

  const audioMimeType = response.headers.get('content-type') || 'audio/wav'
  const cacheEntry = {
    schema: 'status_dialogue_tts_audio_cache.v1',
    cache_key: cacheKey,
    generated_at: new Date().toISOString(),
    adapter_id: DEFAULT_COSYVOICE_TTS_CONFIG.adapter_id,
    voice_profile_id: DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id,
    audio_data_url: `data:${audioMimeType};base64,${audioBuffer.toString('base64')}`,
    audio_mime_type: audioMimeType,
    text_length: phrase.text.length,
    emotion_hint: phrase.emotion
  }
  const filePath = writeCache(cacheEntry)
  return {
    id: phrase.id,
    text_length: phrase.text.length,
    emotion_hint: phrase.emotion,
    cache_key: cacheKey,
    cache_hit: false,
    generated: true,
    latency_ms: Math.round(nowMs() - startedAt),
    audio_mime_type: audioMimeType,
    audio_bytes: audioBuffer.length,
    cache_path: filePath
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  const generatedAt = new Date().toISOString()
  const healthStartedAt = nowMs()
  const healthResponse = await fetchWithTimeout(buildUrl(DEFAULT_COSYVOICE_TTS_CONFIG.health_path), {}, 10000)
  const healthMs = Math.round(nowMs() - healthStartedAt)
  assert.equal(healthResponse.ok, true, `CosyVoice health failed: ${healthResponse.status}`)
  const health = await healthResponse.json().catch(() => ({}))

  const phrases = defaultPhrases
  const items = []
  for (const phrase of phrases) {
    items.push(await synthesizePhrase(phrase))
  }

  const report = {
    schema: 'status_dialogue_tts_cache_prewarm.v1',
    generated_at: generatedAt,
    health: {
      ok: true,
      latency_ms: healthMs,
      adapter: health.adapter,
      sample_rate: health.sample_rate
    },
    voice_profile_id: DEFAULT_COSYVOICE_VOICE_PROFILE.profile_id,
    adapter_id: DEFAULT_COSYVOICE_TTS_CONFIG.adapter_id,
    phrase_count: items.length,
    generated_count: items.filter((item) => item.generated).length,
    cache_hit_count: items.filter((item) => item.cache_hit).length,
    items,
    boundary: {
      browser_tts_used: false,
      external_world_write: false,
      requirement_packet_created: false,
      microphone_audio_saved: false
    }
  }

  const outputPath = path.join(outputDir, `status-dialogue-tts-cache-prewarm-${compactTimestamp()}.json`)
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ ok: true, outputPath, generated_count: report.generated_count, cache_hit_count: report.cache_hit_count }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
