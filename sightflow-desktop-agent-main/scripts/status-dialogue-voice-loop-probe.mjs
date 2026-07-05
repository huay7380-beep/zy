import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repoRoot = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const zhinengRoot = resolve(repoRoot, '..')
const defaultAudio = join(repoRoot, 'runtime', 'verification-audio', 'chrome-stt-bridge-test-zh-20260625.wav')
const defaultPython = join(zhinengRoot, 'third_party', 'envs', 'cosyvoice', 'python.exe')
const defaultWhisperScript = join(repoRoot, 'scripts', 'local-whisper-transcribe.py')
const outputDir = join(repoRoot, 'runtime', 'voice-loop-probes')

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]
  return fallback
}

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

function compactVoiceWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function firstVoiceSentence(value) {
  const normalized = compactVoiceWhitespace(value)
  const match = normalized.match(/^(.+?[。！？!?])\s*/)
  return match?.[1]?.trim() || normalized
}

function truncateVoiceLine(value, maxLength) {
  const normalized = compactVoiceWhitespace(value)
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 1))}…` : normalized
}

function buildShortFinalVoice(fullVoiceText) {
  const first = firstVoiceSentence(fullVoiceText)
  if (first.length >= 20) return truncateVoiceLine(first, 36)
  return truncateVoiceLine(`${first} 我已进入只读状态巡逻链路。`, 36)
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

  const durationSeconds = dataBytes / (sampleRate * channels * (bitsPerSample / 8))
  return {
    sample_rate: sampleRate,
    channels,
    bits_per_sample: bitsPerSample,
    data_bytes: dataBytes,
    duration_seconds: Math.round(durationSeconds * 1000) / 1000
  }
}

async function run() {
  const startedAt = Date.now()
  const audioPath = resolve(argValue('--audio', defaultAudio))
  const pythonPath = resolve(argValue('--python', defaultPython))
  const whisperScript = resolve(argValue('--whisper-script', defaultWhisperScript))
  const ttsBaseUrl = argValue('--tts-base-url', 'http://127.0.0.1:8000')
  const model = argValue('--model', 'base')
  const language = argValue('--language', 'zh')
  const voiceMode = argValue('--voice-mode', 'cosyvoice_short')
  const runId = `status-dialogue-e2e-${compactTimestamp()}`
  await mkdir(outputDir, { recursive: true })

  const report = {
    schema: 'status_dialogue_voice_loop_probe.v1',
    run_id: runId,
    generated_at: new Date().toISOString(),
    input_audio: audioPath,
    steps: [],
    success: false
  }

  const healthStarted = Date.now()
  const healthResponse = await fetch(`${ttsBaseUrl}/health`)
  const healthText = await healthResponse.text()
  report.steps.push({
    id: 'tts_health',
    ok: healthResponse.ok,
    latency_ms: Date.now() - healthStarted,
    status: healthResponse.status,
    body_preview: healthText.slice(0, 240)
  })
  if (!healthResponse.ok) throw new Error(`CosyVoice health failed: ${healthResponse.status}`)

  const sttStarted = Date.now()
  const { stdout, stderr } = await execFileAsync(pythonPath, [
    whisperScript,
    '--audio',
    audioPath,
    '--language',
    language,
    '--model',
    model
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      WHISPER_CACHE_DIR: process.env.WHISPER_CACHE_DIR || join(zhinengRoot, 'third_party', 'whisper-cache')
    },
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024
  })
  const sttResult = JSON.parse(stdout.trim())
  const transcript = typeof sttResult.transcript === 'string' ? sttResult.transcript.trim() : ''
  report.steps.push({
    id: 'stt_local_whisper',
    ok: sttResult.success === true && transcript.length > 0,
    latency_ms: Date.now() - sttStarted,
    adapter: 'local_whisper_ipc_equivalent',
    model,
    language,
    transcript_length: transcript.length,
    transcript,
    stderr_preview: stderr.slice(0, 240),
    error: sttResult.error
  })
  if (!transcript) throw new Error('STT returned no transcript')

  const ackText = '我听到了，正在检查状态。'
  const fullVoiceText = `我听到了：${transcript}。我已经进入只读状态巡逻链路，语音输入、文本理解和语音输出已连接。`
  const voiceText = voiceMode === 'cosyvoice_full' ? fullVoiceText : buildShortFinalVoice(fullVoiceText)
  report.steps.push({
    id: 'voice_ack',
    ok: true,
    mode: 'cosyvoice_local_http',
    voice: 'default',
    voice_text: ackText,
    voice_text_length: ackText.length
  })
  report.steps.push({
    id: 'dialogue_compose',
    ok: voiceMode === 'cosyvoice_full' || (voiceText.length >= 20 && voiceText.length <= 36),
    voice_mode: voiceMode,
    reply_length: fullVoiceText.length,
    voice_text_length: voiceText.length,
    full_voice_text: fullVoiceText,
    voice_text: voiceText
  })

  const ackTtsStarted = Date.now()
  const ackSpeechResponse = await fetch(`${ttsBaseUrl}/api/v1/audio/speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'cosyvoice',
      voice: 'default',
      input: ackText,
      response_format: 'wav',
      speed: 1
    })
  })
  const ackAudioBuffer = Buffer.from(await ackSpeechResponse.arrayBuffer())
  const ackOutputAudio = join(outputDir, `${runId}.ack.wav`)
  await writeFile(ackOutputAudio, ackAudioBuffer)
  const ackWavInfo = ackSpeechResponse.ok ? parseWavInfo(ackAudioBuffer) : undefined
  report.steps.push({
    id: 'tts_cosyvoice_ack',
    ok: ackSpeechResponse.ok && ackAudioBuffer.length > 4096 && Boolean(ackWavInfo),
    latency_ms: Date.now() - ackTtsStarted,
    status: ackSpeechResponse.status,
    audio_path: ackOutputAudio,
    audio_bytes: ackAudioBuffer.length,
    wav: ackWavInfo,
    adapter: 'cosyvoice_local_http',
    voice: 'default',
    error_preview: ackSpeechResponse.ok ? undefined : ackAudioBuffer.toString('utf8', 0, 240)
  })
  if (!ackSpeechResponse.ok || !ackWavInfo) throw new Error(`Ack TTS failed: ${ackSpeechResponse.status}`)

  const ttsStarted = Date.now()
  const speechResponse = await fetch(`${ttsBaseUrl}/api/v1/audio/speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'cosyvoice',
      voice: 'default',
      input: voiceText,
      response_format: 'wav',
      speed: 1
    })
  })
  const audioBuffer = Buffer.from(await speechResponse.arrayBuffer())
  const outputAudio = join(outputDir, `${runId}.wav`)
  await writeFile(outputAudio, audioBuffer)
  const wavInfo = speechResponse.ok ? parseWavInfo(audioBuffer) : undefined
  report.steps.push({
    id: 'tts_cosyvoice',
    ok: speechResponse.ok && audioBuffer.length > 4096 && Boolean(wavInfo),
    latency_ms: Date.now() - ttsStarted,
    status: speechResponse.status,
    audio_path: outputAudio,
    audio_bytes: audioBuffer.length,
    wav: wavInfo,
    adapter: 'cosyvoice_local_http',
    voice: 'default',
    error_preview: speechResponse.ok ? undefined : audioBuffer.toString('utf8', 0, 240)
  })
  if (!speechResponse.ok || !wavInfo) throw new Error(`TTS failed: ${speechResponse.status}`)

  report.success = true
  report.total_latency_ms = Date.now() - startedAt
  report.summary = `STT transcript ${transcript.length} chars, TTS ${wavInfo.duration_seconds}s audio, ${basename(outputAudio)}`

  const reportPath = join(outputDir, `${runId}.json`)
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ success: true, report_path: reportPath, audio_path: outputAudio, summary: report.summary }, null, 2))
}

run().catch(async (error) => {
  const failedAt = compactTimestamp()
  const reportPath = join(outputDir, `status-dialogue-e2e-${failedAt}.failed.json`)
  await mkdir(outputDir, { recursive: true })
  await writeFile(
    reportPath,
    `${JSON.stringify({
      schema: 'status_dialogue_voice_loop_probe.v1',
      generated_at: new Date().toISOString(),
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, null, 2)}\n`,
    'utf8'
  )
  console.error(JSON.stringify({ success: false, report_path: reportPath, error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
