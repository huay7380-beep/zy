import { app, BrowserWindow, ipcMain } from 'electron'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { runScreenshotTest } from '../src/core/rpa/tests/test-screenshot'
import { runReplyTest } from '../src/core/rpa/tests/test-reply'
import { runSwitchTest } from '../src/core/rpa/tests/test-switch'
import { runBridgeObservationTest } from '../src/core/rpa/tests/test-bridge-observation'
import { runSendDryRunTest } from '../src/core/rpa/tests/test-send-dry-run'
import { runControlledSendTest } from '../src/core/rpa/tests/test-controlled-send'
import { runRealControlledSendTest } from '../src/core/rpa/tests/test-controlled-send-real'
import { runRealIntakeObservationTest } from '../src/core/rpa/tests/test-real-intake-observation'
import { checkAndRequestPermissions } from '../src/main/permission'

const STATUS_DIALOGUE_RUNTIME_FIX_MARKER = 'stt-local-observability-2026-06-29-v3'

function writeSilentWav(filePath: string, durationMs = 5000, sampleRate = 48000): void {
  const buffer = createSilentWavBuffer(durationMs, sampleRate)
  mkdirSync(resolve(filePath, '..'), { recursive: true })
  writeFileSync(filePath, buffer)
}

function createSilentWavBuffer(durationMs = 5000, sampleRate = 48000): Buffer {
  const sampleCount = Math.floor((durationMs / 1000) * sampleRate)
  const dataSize = sampleCount * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

function writeSineWav(filePath: string, durationMs = 5200, sampleRate = 48000, amplitude = 0.0006, frequency = 440): void {
  const sampleCount = Math.floor((durationMs / 1000) * sampleRate)
  const dataSize = sampleCount * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * amplitude
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), 44 + index * 2)
  }
  mkdirSync(resolve(filePath, '..'), { recursive: true })
  writeFileSync(filePath, buffer)
}

function writeSpeechBurstWav(
  filePath: string,
  durationMs = 4200,
  sampleRate = 48000,
  amplitude = 0.026,
  frequency = 440,
  speechMs = 1200
): void {
  const sampleCount = Math.floor((durationMs / 1000) * sampleRate)
  const speechSampleCount = Math.floor((speechMs / 1000) * sampleRate)
  const dataSize = sampleCount * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  for (let index = 0; index < sampleCount; index += 1) {
    const sample =
      index < speechSampleCount ? Math.sin((2 * Math.PI * frequency * index) / sampleRate) * amplitude : 0
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), 44 + index * 2)
  }
  mkdirSync(resolve(filePath, '..'), { recursive: true })
  writeFileSync(filePath, buffer)
}

function configureContinuousFastFailFakeAudio(): string {
  const audioPath = resolve(process.cwd(), 'runtime', 'verification-audio', 'continuous-stt-silence-48k.wav')
  writeSilentWav(audioPath)
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', audioPath)
  return audioPath
}

function configureContinuousTwoTurnFakeAudio(): string {
  const audioPath = resolve(process.cwd(), 'runtime', 'verification-audio', 'continuous-stt-two-turn-48k.wav')
  writeSpeechBurstWav(audioPath)
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', audioPath)
  return audioPath
}

function configureSttClickDuringTtsFakeAudio(): string {
  const audioPath = resolve(process.cwd(), 'runtime', 'verification-audio', 'stt-click-during-tts-48k.wav')
  writeSpeechBurstWav(audioPath)
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', audioPath)
  return audioPath
}

function configureLocalSttLowSignalFakeAudio(): string {
  const audioPath = resolve(process.cwd(), 'runtime', 'verification-audio', 'local-stt-low-signal-48k.wav')
  writeSineWav(audioPath)
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', audioPath)
  return audioPath
}

function configureLocalSttBorderlineFakeAudio(): string {
  const audioPath = resolve(process.cwd(), 'runtime', 'verification-audio', 'local-stt-borderline-48k.wav')
  writeSineWav(audioPath, 5200, 48000, 0.00022)
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', audioPath)
  return audioPath
}

function configureRemoteSttMockFakeAudio(): string {
  const audioPath = resolve(process.cwd(), 'runtime', 'verification-audio', 'remote-stt-mock-48k.wav')
  writeSineWav(audioPath, 5200, 48000, 0.0022)
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', audioPath)
  return audioPath
}

const continuousFastFailFakeAudioPath =
  process.env.TEST_MODE === 'status-dialogue-continuous-fast-fail' ? configureContinuousFastFailFakeAudio() : undefined
const continuousTwoTurnFakeAudioPath =
  process.env.TEST_MODE === 'status-dialogue-continuous-two-turn' ? configureContinuousTwoTurnFakeAudio() : undefined
const sttClickDuringTtsFakeAudioPath =
  process.env.TEST_MODE === 'status-dialogue-stt-click-during-tts' ? configureSttClickDuringTtsFakeAudio() : undefined
const visibleSttButtonClickFakeAudioPath =
  process.env.TEST_MODE === 'status-dialogue-visible-stt-button-click' ? configureSttClickDuringTtsFakeAudio() : undefined
const localSttLowSignalFakeAudioPath =
  process.env.TEST_MODE === 'status-dialogue-local-stt-low-signal' ? configureLocalSttLowSignalFakeAudio() : undefined
const localSttBorderlineFakeAudioPath =
  process.env.TEST_MODE === 'status-dialogue-local-stt-borderline' ? configureLocalSttBorderlineFakeAudio() : undefined
const remoteSttMockFakeAudioPath =
  process.env.TEST_MODE === 'status-dialogue-remote-stt-mock' ||
  process.env.TEST_MODE === 'status-dialogue-remote-stt-unavailable'
    ? configureRemoteSttMockFakeAudio()
    : undefined

function compactTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

function zhinengProjectRoot(): string {
  if (process.env.ZHINENG_PROJECT_ROOT) return process.env.ZHINENG_PROJECT_ROOT
  const candidates = [
    resolve(process.cwd(), '..'),
    process.cwd(),
    resolve(app.getAppPath(), '..'),
    resolve(app.getAppPath(), '..', '..'),
    resolve(app.getAppPath(), '..', '..', '..')
  ]
  const found = candidates.find((candidate) => existsSync(join(candidate, 'scripts', 'ingest-desktop-real-intake.mjs')))
  return found || resolve(app.getAppPath(), '..')
}

function writeStatusDialogueRuntimeLog(event: string, payload: Record<string, unknown> = {}): void {
  const outputDir = join(zhinengProjectRoot(), 'runtime', 'status-dialogue-logs')
  mkdirSync(outputDir, { recursive: true })
  const logPath = join(outputDir, `voice-flow-${compactTimestamp().slice(0, 8)}.jsonl`)
  appendFileSync(
    logPath,
    `${JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...payload
    })}\n`,
    'utf8'
  )
}

async function runStatusDialogueMarkerTest(): Promise<void> {
  const startedAt = Date.now()
  let markerResolved = false

  const markerPromise = new Promise<void>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (markerResolved) return
      rejectPromise(new Error('status dialogue runtime marker was not observed within 15s'))
    }, 15000)

    ipcMain.handle('zhineng:status-dialogue:voice-log', async (_event, request?: Record<string, unknown>) => {
      const event = typeof request?.event === 'string' ? request.event.slice(0, 80) : 'renderer_voice_event'
      const payload = request?.payload && typeof request.payload === 'object' ? (request.payload as Record<string, unknown>) : {}
      writeStatusDialogueRuntimeLog(event, {
        ...payload,
        marker_probe: true
      })
      if (event === 'status_dialogue_ui_runtime_loaded' && payload.runtime_fix_marker === STATUS_DIALOGUE_RUNTIME_FIX_MARKER) {
        markerResolved = true
        clearTimeout(timeout)
        resolvePromise()
      }
      return { success: true }
    })
  })

  const window = new BrowserWindow({
    width: 760,
    height: 580,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    throw new Error(`graph marker probe failed to load renderer: ${errorCode} ${errorDescription}`)
  })

  await window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: {
      window: 'zhineng-graph',
      state: JSON.stringify({ marker_probe: true })
    }
  })
  await markerPromise
  writeStatusDialogueRuntimeLog('status_dialogue_marker_probe_complete', {
    marker_probe: true,
    runtime_fix_marker: STATUS_DIALOGUE_RUNTIME_FIX_MARKER,
    latency_ms: Date.now() - startedAt
  })
  window.destroy()
}

async function runStatusDialogueTtsInputInterruptProbe(): Promise<void> {
  const startedAt = Date.now()
  const seenEvents = new Set<string>()
  let probeResolved = false

  const probePromise = new Promise<void>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (probeResolved) return
      rejectPromise(
        new Error(
          `status dialogue TTS input interrupt probe missing events: ${[
            'voice_playback_interrupted_for_formal_input',
            'tts_queue_interrupted',
            'dialogue_input_queued',
            'dialogue_input_dequeued_after_tts_complete'
          ]
            .filter((event) => !seenEvents.has(event))
            .join(', ')}`
        )
      )
    }, 15000)

    ipcMain.handle('zhineng:status-dialogue:voice-log', async (_event, request?: Record<string, unknown>) => {
      const event = typeof request?.event === 'string' ? request.event.slice(0, 80) : 'renderer_voice_event'
      const payload = request?.payload && typeof request.payload === 'object' ? (request.payload as Record<string, unknown>) : {}
      seenEvents.add(event)
      writeStatusDialogueRuntimeLog(event, {
        ...payload,
        marker_probe: true,
        runtime_probe: 'tts_input_interrupt'
      })
      if (
        seenEvents.has('voice_playback_interrupted_for_formal_input') &&
        seenEvents.has('tts_queue_interrupted') &&
        seenEvents.has('dialogue_input_queued') &&
        seenEvents.has('dialogue_input_dequeued_after_tts_complete')
      ) {
        probeResolved = true
        clearTimeout(timeout)
        resolvePromise()
      }
      return { success: true }
    })
  })

  const window = new BrowserWindow({
    width: 760,
    height: 580,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    throw new Error(`TTS input interrupt probe failed to load renderer: ${errorCode} ${errorDescription}`)
  })

  await window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: {
      window: 'zhineng-graph',
      state: JSON.stringify({ status_dialogue_runtime_probe: 'tts_input_interrupt' })
    }
  })
  await probePromise
  writeStatusDialogueRuntimeLog('status_dialogue_tts_input_interrupt_probe_complete', {
    marker_probe: true,
    runtime_probe: 'tts_input_interrupt',
    runtime_fix_marker: STATUS_DIALOGUE_RUNTIME_FIX_MARKER,
    latency_ms: Date.now() - startedAt,
    observed_events: Array.from(seenEvents).sort()
  })
  window.destroy()
}

async function runStatusDialogueSttClickDuringTtsProbe(): Promise<void> {
  const startedAt = Date.now()
  const seenEvents = new Set<string>()
  let probeResolved = false

  const requiredEvents = [
    'status_dialogue_stt_click_during_tts_probe_start',
    'status_dialogue_stt_click_during_tts_probe_submitted',
    'stt_start_requested',
    'voice_playback_interrupted_for_formal_input',
    'tts_queue_interrupted',
    'local_stt_recording_started',
    'local_stt_transcribe_request',
    'local_stt_transcribe_result'
  ]

  ipcMain.handle('zhineng:status-dialogue:stt:health', async () => ({
    schema: 'status_dialogue_local_stt_health.v1',
    generated_at: new Date().toISOString(),
    adapter_id: 'local_whisper_persistent_service',
    configured: true,
    reachable: true,
    status: 'ready',
    base_url_host: 'isolated-test-cli',
    model: 'base',
    loaded_models: ['base'],
    default_model: 'base',
    device: 'mock',
    latency_ms: 1
  }))

  ipcMain.handle('zhineng:status-dialogue:stt:transcribe', async (_event, request?: Record<string, unknown>) => {
    writeStatusDialogueRuntimeLog('local_stt_start', {
      marker_probe: true,
      runtime_probe: 'stt_click_during_tts',
      adapter_id: 'local_whisper_persistent_service',
      model: typeof request?.model === 'string' ? request.model : 'base',
      language: typeof request?.language === 'string' ? request.language : 'zh',
      boundary: 'isolated STT-click-during-TTS probe; mock Whisper response; no raw audio persistence'
    })
    const result = {
      schema: 'status_dialogue_stt_transcription.v1',
      generated_at: new Date().toISOString(),
      success: true,
      adapter_id: 'local_whisper_persistent_service',
      provider: 'openai_whisper_local',
      transcript: 'stt click during tts probe passed',
      language: 'zh',
      model: typeof request?.model === 'string' ? request.model : 'base',
      latency_ms: 12,
      events: ['mock_stt_click_during_tts_transcribe']
    }
    writeStatusDialogueRuntimeLog('local_stt_complete', {
      marker_probe: true,
      runtime_probe: 'stt_click_during_tts',
      adapter_id: 'local_whisper_persistent_service',
      success: true,
      transcript_length: result.transcript.length,
      latency_ms: result.latency_ms,
      boundary: 'isolated STT-click-during-TTS probe completed mocked local Whisper transcription'
    })
    return result
  })

  const probePromise = new Promise<void>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (probeResolved) return
      rejectPromise(
        new Error(
          `status dialogue STT-click-during-TTS probe missing events: ${requiredEvents
            .filter((event) => !seenEvents.has(event))
            .join(', ')}`
        )
      )
    }, 30000)

    ipcMain.handle('zhineng:status-dialogue:voice-log', async (_event, request?: Record<string, unknown>) => {
      const event = typeof request?.event === 'string' ? request.event.slice(0, 80) : 'renderer_voice_event'
      const payload = request?.payload && typeof request.payload === 'object' ? (request.payload as Record<string, unknown>) : {}
      seenEvents.add(event)
      writeStatusDialogueRuntimeLog(event, {
        ...payload,
        marker_probe: true,
        runtime_probe: 'stt_click_during_tts'
      })
      if (requiredEvents.every((requiredEvent) => seenEvents.has(requiredEvent))) {
        probeResolved = true
        clearTimeout(timeout)
        resolvePromise()
      }
      return { success: true }
    })
  })

  const window = new BrowserWindow({
    width: 760,
    height: 580,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    throw new Error(`STT-click-during-TTS probe failed to load renderer: ${errorCode} ${errorDescription}`)
  })

  await window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: {
      window: 'zhineng-graph',
      state: JSON.stringify({ status_dialogue_runtime_probe: 'stt_click_during_tts' })
    }
  })
  await probePromise
  writeStatusDialogueRuntimeLog('status_dialogue_stt_click_during_tts_probe_complete', {
    marker_probe: true,
    runtime_probe: 'stt_click_during_tts',
    runtime_fix_marker: STATUS_DIALOGUE_RUNTIME_FIX_MARKER,
    fake_audio_path: sttClickDuringTtsFakeAudioPath,
    latency_ms: Date.now() - startedAt,
    observed_events: Array.from(seenEvents).sort(),
    boundary: 'isolated Electron probe proved STT click interrupts TTS before local recording'
  })
  window.destroy()
}

async function runStatusDialogueVisibleSttButtonClickProbe(): Promise<void> {
  const startedAt = Date.now()
  const seenEvents = new Set<string>()
  let probeResolved = false

  const requiredEvents = [
    'stt_button_pointer_down',
    'stt_button_click',
    'stt_start_requested',
    'local_stt_recording_start_request',
    'local_stt_recording_started',
    'local_stt_transcribe_request',
    'local_stt_transcribe_result'
  ]

  ipcMain.handle('zhineng:entity-work:projection:get', async () => ({
    success: false,
    error: 'runtime probe stub: entity work projection unavailable'
  }))

  ipcMain.handle('zhineng:status-dialogue:snapshot:get', async () => ({
    success: true,
    source: 'runtime_probe_stub',
    snapshot: {
      schema: 'status_snapshot.v1',
      generated_at: new Date().toISOString(),
      source: 'runtime_probe_stub',
      global_status: 'unknown',
      cards_total: 0,
      cards_fresh: 0,
      cards_stale: 0,
      cards_missing: 0,
      expected_modules: [],
      module_cards: [],
      missing_module_ids: [],
      stale_module_ids: [],
      conflict_module_ids: [],
      patrol_findings: [],
      read_errors: []
    }
  }))

  ipcMain.handle('zhineng:status-dialogue:events:get', async () => ({
    success: true,
    events: [],
    source: 'runtime_probe_stub'
  }))

  ipcMain.handle('zhineng:status-dialogue:real-env:check', async () => ({
    success: true,
    configured: false,
    source: 'runtime_probe_stub',
    boundary: 'visible STT button click probe does not inspect real secrets'
  }))

  ipcMain.handle('zhineng:status-dialogue:tts:health', async () => ({
    schema: 'status_dialogue_tts_health.v1',
    generated_at: new Date().toISOString(),
    adapter_id: 'edge_readaloud_websocket',
    configured: true,
    reachable: true,
    status: 'ready',
    base_url_host: 'isolated-test-cli',
    latency_ms: 1
  }))

  ipcMain.handle('zhineng:status-dialogue:stt:health', async () => ({
    schema: 'status_dialogue_local_stt_health.v1',
    generated_at: new Date().toISOString(),
    adapter_id: 'local_whisper_persistent_service',
    configured: true,
    reachable: true,
    status: 'ready',
    base_url_host: 'isolated-test-cli',
    model: 'base',
    loaded_models: ['base'],
    default_model: 'base',
    device: 'mock',
    latency_ms: 1
  }))

  ipcMain.handle('zhineng:status-dialogue:stt:transcribe', async (_event, request?: Record<string, unknown>) => {
    writeStatusDialogueRuntimeLog('local_stt_start', {
      marker_probe: true,
      runtime_probe: 'visible_stt_button_click',
      adapter_id: 'local_whisper_persistent_service',
      model: typeof request?.model === 'string' ? request.model : 'base',
      language: typeof request?.language === 'string' ? request.language : 'zh',
      boundary: 'visible STT button click probe; mock Whisper response; no raw audio persistence'
    })
    const result = {
      schema: 'status_dialogue_stt_transcription.v1',
      generated_at: new Date().toISOString(),
      success: true,
      adapter_id: 'local_whisper_persistent_service',
      provider: 'openai_whisper_local',
      transcript: 'visible stt button click probe passed',
      language: 'zh',
      model: typeof request?.model === 'string' ? request.model : 'base',
      latency_ms: 12,
      events: ['mock_visible_stt_button_click_transcribe']
    }
    writeStatusDialogueRuntimeLog('local_stt_complete', {
      marker_probe: true,
      runtime_probe: 'visible_stt_button_click',
      adapter_id: 'local_whisper_persistent_service',
      success: true,
      transcript_length: result.transcript.length,
      latency_ms: result.latency_ms,
      boundary: 'visible STT button click probe completed mocked local Whisper transcription'
    })
    return result
  })

  const probePromise = new Promise<void>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (probeResolved) return
      rejectPromise(
        new Error(
          `status dialogue visible STT button click probe missing events: ${requiredEvents
            .filter((event) => !seenEvents.has(event))
            .join(', ')}`
        )
      )
    }, 30000)

    ipcMain.handle('zhineng:status-dialogue:voice-log', async (_event, request?: Record<string, unknown>) => {
      const event = typeof request?.event === 'string' ? request.event.slice(0, 80) : 'renderer_voice_event'
      const payload = request?.payload && typeof request.payload === 'object' ? (request.payload as Record<string, unknown>) : {}
      seenEvents.add(event)
      writeStatusDialogueRuntimeLog(event, {
        ...payload,
        marker_probe: true,
        runtime_probe: 'visible_stt_button_click'
      })
      if (requiredEvents.every((requiredEvent) => seenEvents.has(requiredEvent))) {
        probeResolved = true
        clearTimeout(timeout)
        resolvePromise()
      }
      return { success: true }
    })
  })

  const window = new BrowserWindow({
    width: 760,
    height: 580,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    throw new Error(`visible STT button click probe failed to load renderer: ${errorCode} ${errorDescription}`)
  })

  await window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: {
      window: 'zhineng-graph',
      state: JSON.stringify({ marker_probe: true })
    }
  })

  const clickResult = await window.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const clickButton = () => {
        const button = document.querySelector('button[aria-label="start speech input"], button.zg-dialogue-stt-button');
        if (!button) {
          if (Date.now() - startedAt > 10000) {
            reject(new Error('visible STT button not found'));
            return;
          }
          setTimeout(clickButton, 100);
          return;
        }
        const pointerEvent =
          typeof PointerEvent === 'function'
            ? new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true })
            : new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
        button.dispatchEvent(pointerEvent);
        button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        button.click();
        resolve({
          found: true,
          text: button.textContent,
          ariaLabel: button.getAttribute('aria-label'),
          disabled: button.disabled === true
        });
      };
      clickButton();
    })
  `)
  seenEvents.add('status_dialogue_visible_stt_button_click_probe_submitted')
  writeStatusDialogueRuntimeLog('status_dialogue_visible_stt_button_click_probe_submitted', {
    marker_probe: true,
    runtime_probe: 'visible_stt_button_click',
    click_result: clickResult,
    boundary: 'test-cli dispatched pointerdown and click on the visible STT button'
  })

  await probePromise
  writeStatusDialogueRuntimeLog('status_dialogue_visible_stt_button_click_probe_complete', {
    marker_probe: true,
    runtime_probe: 'visible_stt_button_click',
    runtime_fix_marker: STATUS_DIALOGUE_RUNTIME_FIX_MARKER,
    fake_audio_path: visibleSttButtonClickFakeAudioPath,
    latency_ms: Date.now() - startedAt,
    observed_events: Array.from(seenEvents).sort(),
    boundary: 'isolated Electron probe proved visible STT button click enters the formal STT path'
  })
  window.destroy()
}

async function runStatusDialogueDockVoiceEntryProbe(): Promise<void> {
  const startedAt = Date.now()
  const seenEvents = new Set<string>()
  let launchState: Record<string, unknown> | undefined
  let graphFocusResolved = false

  ipcMain.handle('zhineng:dock:refresh', async () => ({
    attached: false,
    reason: 'runtime probe dock floating',
    targetTitle: 'runtime probe'
  }))

  ipcMain.handle('zhineng:decision-state:get', async () => ({
    success: false,
    error: 'runtime probe decision state unavailable'
  }))

  ipcMain.handle('zhineng:dock:openConsole', async () => ({ success: true }))
  ipcMain.handle('settings:open', async () => ({ success: true }))

  ipcMain.handle('zhineng:dock:openGraph', async (_event, state?: Record<string, unknown>) => {
    launchState = state ?? {}
    return { success: true }
  })

  ipcMain.handle('zhineng:entity-work:projection:get', async () => ({
    success: false,
    error: 'runtime probe stub: entity work projection unavailable'
  }))

  ipcMain.handle('zhineng:status-dialogue:snapshot:get', async () => ({
    success: true,
    source: 'runtime_probe_stub',
    snapshot: {
      schema: 'status_snapshot.v1',
      generated_at: new Date().toISOString(),
      source: 'runtime_probe_stub',
      global_status: 'unknown',
      cards_total: 0,
      cards_fresh: 0,
      cards_stale: 0,
      cards_missing: 0,
      expected_modules: [],
      module_cards: [],
      missing_module_ids: [],
      stale_module_ids: [],
      conflict_module_ids: [],
      patrol_findings: [],
      read_errors: []
    }
  }))

  ipcMain.handle('zhineng:status-dialogue:events:get', async () => ({
    success: true,
    events: [],
    source: 'runtime_probe_stub'
  }))

  ipcMain.handle('zhineng:status-dialogue:real-env:check', async () => ({
    success: true,
    configured: false,
    source: 'runtime_probe_stub',
    boundary: 'dock voice entry probe does not inspect real secrets'
  }))

  ipcMain.handle('zhineng:status-dialogue:tts:health', async () => ({
    schema: 'status_dialogue_tts_health.v1',
    generated_at: new Date().toISOString(),
    adapter_id: 'edge_readaloud_websocket',
    configured: true,
    reachable: true,
    status: 'ready',
    base_url_host: 'isolated-test-cli',
    latency_ms: 1
  }))

  ipcMain.handle('zhineng:status-dialogue:stt:health', async () => ({
    schema: 'status_dialogue_local_stt_health.v1',
    generated_at: new Date().toISOString(),
    adapter_id: 'local_whisper_persistent_service',
    configured: true,
    reachable: true,
    status: 'ready',
    base_url_host: 'isolated-test-cli',
    model: 'base',
    loaded_models: ['base'],
    default_model: 'base',
    device: 'mock',
    latency_ms: 1
  }))

  const focusPromise = new Promise<void>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (graphFocusResolved) return
      rejectPromise(new Error('dock voice entry probe did not focus the graph STT button'))
    }, 30000)

    ipcMain.handle('zhineng:status-dialogue:voice-log', async (_event, request?: Record<string, unknown>) => {
      const event = typeof request?.event === 'string' ? request.event.slice(0, 80) : 'renderer_voice_event'
      const payload = request?.payload && typeof request.payload === 'object' ? (request.payload as Record<string, unknown>) : {}
      seenEvents.add(event)
      writeStatusDialogueRuntimeLog(event, {
        ...payload,
        marker_probe: true,
        runtime_probe: 'dock_voice_entry'
      })
      if (event === 'status_dialogue_voice_entry_focused') {
        graphFocusResolved = true
        clearTimeout(timeout)
        resolvePromise()
      }
      return { success: true }
    })
  })

  const dockWindow = new BrowserWindow({
    width: 132,
    height: 136,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  dockWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    throw new Error(`dock voice entry probe failed to load dock renderer: ${errorCode} ${errorDescription}`)
  })

  await dockWindow.loadFile(join(__dirname, '../renderer/index.html'), {
    query: {
      window: 'zhineng-dock'
    }
  })

  const dockClickResult = await dockWindow.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const clickButton = () => {
        const button = document.querySelector('button[aria-label="打开语音对话入口"], button.zg-dock-action-button.voice');
        if (!button) {
          if (Date.now() - startedAt > 10000) {
            reject(new Error('dock voice entry button not found'));
            return;
          }
          setTimeout(clickButton, 100);
          return;
        }
        button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        button.click();
        resolve({
          found: true,
          ariaLabel: button.getAttribute('aria-label'),
          className: button.className
        });
      };
      clickButton();
    })
  `)

  if (
    launchState?.launchIntent !== 'status_dialogue_voice_entry' ||
    launchState?.statusDialogueAction !== 'focus_stt' ||
    launchState?.source !== 'dock_voice_button'
  ) {
    throw new Error(`dock voice entry launch state mismatch: ${JSON.stringify(launchState)}`)
  }
  const graphIntentState = {
    launchIntent: launchState.launchIntent,
    statusDialogueAction: launchState.statusDialogueAction,
    source: launchState.source
  }

  dockWindow.destroy()

  const graphWindow = new BrowserWindow({
    width: 760,
    height: 580,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  graphWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    if (errorCode === -2 && graphFocusResolved) return
    throw new Error(`dock voice entry probe failed to load graph renderer: ${errorCode} ${errorDescription}`)
  })

  await graphWindow.loadFile(join(__dirname, '../renderer/index.html'), {
    query: {
      window: 'zhineng-graph',
      launchIntent: 'status_dialogue_voice_entry',
      statusDialogueAction: 'focus_stt',
      source: 'dock_voice_button'
    }
  })

  await focusPromise

  const graphFocusResult = await graphWindow.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('button.zg-dialogue-stt-button');
      const active = document.activeElement;
      const panel = document.querySelector('.zg-status-dialogue');
      return {
        buttonFound: Boolean(button),
        activeIsStt: Boolean(button && active === button),
        highlighted: Boolean(panel && panel.classList.contains('voice-entry-highlight')),
        ariaLabel: button ? button.getAttribute('aria-label') : null
      };
    })()
  `)

  if (!graphFocusResult?.buttonFound || graphFocusResult?.activeIsStt !== true) {
    throw new Error(`dock voice entry did not focus STT button: ${JSON.stringify(graphFocusResult)}`)
  }

  writeStatusDialogueRuntimeLog('status_dialogue_dock_voice_entry_probe_complete', {
    marker_probe: true,
    runtime_probe: 'dock_voice_entry',
    runtime_fix_marker: STATUS_DIALOGUE_RUNTIME_FIX_MARKER,
    latency_ms: Date.now() - startedAt,
    dock_click_result: dockClickResult,
    launch_state: launchState,
    graph_intent_state: graphIntentState,
    graph_focus_result: graphFocusResult,
    observed_events: Array.from(seenEvents).sort(),
    boundary: 'isolated Electron probe proved dock voice button focuses existing graph STT entry without starting microphone'
  })
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 600))
  graphWindow.close()
}

async function runStatusDialogueContinuousVoiceLoopProbe(): Promise<void> {
  const startedAt = Date.now()
  const seenEvents = new Set<string>()
  let probeResolved = false

  const requiredEvents = [
    'status_dialogue_continuous_voice_loop_probe_start',
    'continuous_voice_session_enabled',
    'continuous_voice_session_resume_scheduled',
    'continuous_voice_session_resume_stt',
    'status_dialogue_continuous_voice_loop_probe_complete'
  ]

  const probePromise = new Promise<void>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (probeResolved) return
      rejectPromise(
        new Error(
          `status dialogue continuous voice loop probe missing events: ${requiredEvents
            .filter((event) => !seenEvents.has(event))
            .join(', ')}`
        )
      )
    }, 15000)

    ipcMain.handle('zhineng:status-dialogue:voice-log', async (_event, request?: Record<string, unknown>) => {
      const event = typeof request?.event === 'string' ? request.event.slice(0, 80) : 'renderer_voice_event'
      const payload = request?.payload && typeof request.payload === 'object' ? (request.payload as Record<string, unknown>) : {}
      seenEvents.add(event)
      writeStatusDialogueRuntimeLog(event, {
        ...payload,
        marker_probe: true,
        runtime_probe: 'continuous_voice_loop'
      })
      if (requiredEvents.every((requiredEvent) => seenEvents.has(requiredEvent))) {
        probeResolved = true
        clearTimeout(timeout)
        resolvePromise()
      }
      return { success: true }
    })
  })

  const window = new BrowserWindow({
    width: 760,
    height: 580,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    throw new Error(`continuous voice loop probe failed to load renderer: ${errorCode} ${errorDescription}`)
  })

  await window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: {
      window: 'zhineng-graph',
      state: JSON.stringify({ status_dialogue_runtime_probe: 'continuous_voice_loop' })
    }
  })
  await probePromise
  writeStatusDialogueRuntimeLog('status_dialogue_continuous_voice_loop_probe_observed', {
    marker_probe: true,
    runtime_probe: 'continuous_voice_loop',
    runtime_fix_marker: STATUS_DIALOGUE_RUNTIME_FIX_MARKER,
    latency_ms: Date.now() - startedAt,
    observed_events: Array.from(seenEvents).sort(),
    boundary: 'isolated Electron probe observed scheduler events only'
  })
  window.destroy()
}

async function runStatusDialogueContinuousVoiceFastFailProbe(): Promise<void> {
  const startedAt = Date.now()
  const seenEvents = new Set<string>()
  let probeResolved = false

  const requiredEvents = [
    'status_dialogue_continuous_voice_fast_fail_probe_start',
    'continuous_voice_session_enabled',
    'continuous_voice_session_resume_scheduled',
    'continuous_voice_session_resume_stt',
    'local_stt_recording_started',
    'local_stt_continuous_no_voice_fast_fail',
    'local_stt_silence_detected',
    'continuous_voice_session_recoverable_error_retry'
  ]

  const probePromise = new Promise<void>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (probeResolved) return
      rejectPromise(
        new Error(
          `status dialogue continuous fast-fail probe missing events: ${requiredEvents
            .filter((event) => !seenEvents.has(event))
            .join(', ')}`
        )
      )
    }, 25000)

    ipcMain.handle('zhineng:status-dialogue:voice-log', async (_event, request?: Record<string, unknown>) => {
      const event = typeof request?.event === 'string' ? request.event.slice(0, 80) : 'renderer_voice_event'
      const payload = request?.payload && typeof request.payload === 'object' ? (request.payload as Record<string, unknown>) : {}
      seenEvents.add(event)
      writeStatusDialogueRuntimeLog(event, {
        ...payload,
        marker_probe: true,
        runtime_probe: 'continuous_voice_fast_fail'
      })
      if (requiredEvents.every((requiredEvent) => seenEvents.has(requiredEvent))) {
        probeResolved = true
        clearTimeout(timeout)
        resolvePromise()
      }
      return { success: true }
    })
  })

  const window = new BrowserWindow({
    width: 760,
    height: 580,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    throw new Error(`continuous fast-fail probe failed to load renderer: ${errorCode} ${errorDescription}`)
  })

  await window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: {
      window: 'zhineng-graph',
      state: JSON.stringify({ status_dialogue_runtime_probe: 'continuous_voice_fast_fail' })
    }
  })
  await probePromise
  writeStatusDialogueRuntimeLog('status_dialogue_continuous_voice_fast_fail_probe_observed', {
    marker_probe: true,
    runtime_probe: 'continuous_voice_fast_fail',
    runtime_fix_marker: STATUS_DIALOGUE_RUNTIME_FIX_MARKER,
    fake_audio_path: continuousFastFailFakeAudioPath,
    latency_ms: Date.now() - startedAt,
    observed_events: Array.from(seenEvents).sort(),
    boundary: 'isolated Electron probe observed continuous listening idle-silence fast-fail path'
  })
  window.destroy()
}

async function runStatusDialogueContinuousVoiceTwoTurnProbe(): Promise<void> {
  const startedAt = Date.now()
  const seenEvents = new Set<string>()
  let probeResolved = false
  let transcribeCount = 0

  const requiredEvents = [
    'status_dialogue_continuous_voice_two_turn_probe_start',
    'continuous_voice_session_enabled',
    'continuous_voice_session_resume_scheduled',
    'continuous_voice_session_resume_stt',
    'stt_start_requested',
    'local_stt_recording_started',
    'local_stt_transcribe_request',
    'local_stt_transcribe_result',
    'status_dialogue_continuous_voice_two_turn_probe_turn',
    'status_dialogue_continuous_voice_two_turn_probe_complete'
  ]

  ipcMain.handle('zhineng:status-dialogue:stt:health', async () => ({
    schema: 'status_dialogue_local_stt_health.v1',
    generated_at: new Date().toISOString(),
    adapter_id: 'local_whisper_persistent_service',
    configured: true,
    reachable: true,
    status: 'ready',
    base_url_host: 'isolated-test-cli',
    model: 'base',
    loaded_models: ['base'],
    default_model: 'base',
    device: 'mock',
    latency_ms: 1
  }))

  ipcMain.handle('zhineng:status-dialogue:stt:transcribe', async (_event, request?: Record<string, unknown>) => {
    transcribeCount += 1
    seenEvents.add('local_stt_start')
    writeStatusDialogueRuntimeLog('local_stt_start', {
      marker_probe: true,
      runtime_probe: 'continuous_voice_two_turn',
      turn: transcribeCount,
      adapter_id: 'local_whisper_persistent_service',
      model: typeof request?.model === 'string' ? request.model : 'base',
      language: typeof request?.language === 'string' ? request.language : 'zh',
      boundary: 'controlled two-turn loop probe; mock Whisper response; no raw audio persistence'
    })
    const transcript = transcribeCount === 1 ? 'continuous loop first turn passed' : 'continuous loop second turn passed'
    const result = {
      schema: 'status_dialogue_stt_transcription.v1',
      generated_at: new Date().toISOString(),
      success: true,
      adapter_id: 'local_whisper_persistent_service',
      provider: 'openai_whisper_local',
      transcript,
      language: 'zh',
      model: typeof request?.model === 'string' ? request.model : 'base',
      latency_ms: 12,
      events: [`mock_continuous_two_turn_${transcribeCount}`]
    }
    seenEvents.add('local_stt_complete')
    writeStatusDialogueRuntimeLog('local_stt_complete', {
      marker_probe: true,
      runtime_probe: 'continuous_voice_two_turn',
      turn: transcribeCount,
      adapter_id: 'local_whisper_persistent_service',
      success: true,
      transcript_length: result.transcript.length,
      latency_ms: result.latency_ms,
      boundary: 'controlled two-turn loop probe completed mocked local Whisper transcription'
    })
    return result
  })

  ipcMain.handle('zhineng:status-dialogue:complete:stream', async (event, request?: Record<string, unknown>) => {
    const sessionId = typeof request?.sessionId === 'string' ? request.sessionId : `continuous-two-turn-dialogue-${Date.now()}`
    const inputText = typeof request?.input === 'string' ? request.input : ''
    const text = JSON.stringify({
      voice: 'I heard this turn and kept the loop ready.',
      reply: `I heard this turn and kept the loop ready. Input: ${inputText}`,
      intent_lane: 'voice_control',
      response_plan: { shape: 'conclusion_evidence_attention_next' },
      patrol_insertions: [],
      attention_log: ['continuous listening probe', 'formal STT path used', 'loop resumes after idle'],
      status_refs: ['status_dialogue_continuous_voice_session.v1', 'local_whisper_persistent_service'],
      missing_status: [],
      boundary_notes: ['controlled probe only', 'no world write', 'no requirement packet'],
      tts_playback_intent: 'status_ok'
    })
    event.sender.send('zhineng:status-dialogue:complete:stream:event', {
      schema: 'status_dialogue_model_stream_event.v1',
      sessionId,
      session_id: sessionId,
      generated_at: new Date().toISOString(),
      type: 'delta',
      delta: text,
      deltaCount: 1,
      accumulatedLength: text.length
    })
    return {
      success: true,
      text,
      model: 'mock-status-dialogue-model',
      providerLabel: 'runtime-probe',
      sessionId,
      streamed: true,
      deltaCount: 1,
      latencyMs: 5
    }
  })

  ipcMain.handle('zhineng:status-dialogue:tts:synthesize:stream', async (event, request?: Record<string, unknown>) => {
    const sessionId = typeof request?.sessionId === 'string' ? request.sessionId : `continuous-two-turn-tts-${Date.now()}`
    const plan = request?.plan && typeof request.plan === 'object' ? (request.plan as Record<string, unknown>) : {}
    const chunkId = typeof plan.source_output_id === 'string' ? plan.source_output_id : sessionId
    const audioBase64 = createSilentWavBuffer(80, 16000).toString('base64')
    const generatedAt = new Date().toISOString()
    event.sender.send('zhineng:status-dialogue:tts:synthesize:stream:event', {
      schema: 'status_dialogue_tts_stream_event.v1',
      sessionId,
      session_id: sessionId,
      type: 'frame',
      frame: {
        schema: 'streaming_tts_audio_frame.v1',
        frame_id: `${chunkId}:mock-frame:1`,
        chunk_id: chunkId,
        sequence: 1,
        audio_mime_type: 'audio/wav',
        audio_base64: audioBase64,
        final: false,
        generated_at: generatedAt
      }
    })
    event.sender.send('zhineng:status-dialogue:tts:synthesize:stream:event', {
      schema: 'status_dialogue_tts_stream_event.v1',
      sessionId,
      session_id: sessionId,
      type: 'frame',
      frame: {
        schema: 'streaming_tts_audio_frame.v1',
        frame_id: `${chunkId}:mock-frame:2:final`,
        chunk_id: chunkId,
        sequence: 2,
        audio_mime_type: 'audio/wav',
        audio_base64: '',
        final: true,
        generated_at: generatedAt
      }
    })
    return {
      success: true,
      sessionId,
      frameCount: 1,
      finalFrameCount: 1,
      firstFrameMs: 8,
      totalStreamMs: 10,
      cacheHit: false
    }
  })

  const probePromise = new Promise<void>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (probeResolved) return
      rejectPromise(
        new Error(
          `status dialogue continuous two-turn probe missing events: ${requiredEvents
            .filter((event) => !seenEvents.has(event))
            .join(', ')}; transcribeCount=${transcribeCount}`
        )
      )
    }, 45000)

    ipcMain.handle('zhineng:status-dialogue:voice-log', async (_event, request?: Record<string, unknown>) => {
      const event = typeof request?.event === 'string' ? request.event.slice(0, 80) : 'renderer_voice_event'
      const payload = request?.payload && typeof request.payload === 'object' ? (request.payload as Record<string, unknown>) : {}
      seenEvents.add(event)
      writeStatusDialogueRuntimeLog(event, {
        ...payload,
        marker_probe: true,
        runtime_probe: 'continuous_voice_two_turn'
      })
      if (
        transcribeCount >= 2 &&
        requiredEvents.every((requiredEvent) => seenEvents.has(requiredEvent))
      ) {
        probeResolved = true
        clearTimeout(timeout)
        resolvePromise()
      }
      return { success: true }
    })
  })

  const window = new BrowserWindow({
    width: 760,
    height: 580,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    throw new Error(`continuous two-turn probe failed to load renderer: ${errorCode} ${errorDescription}`)
  })

  await window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: {
      window: 'zhineng-graph',
      state: JSON.stringify({ status_dialogue_runtime_probe: 'continuous_voice_two_turn' })
    }
  })
  await probePromise
  writeStatusDialogueRuntimeLog('status_dialogue_continuous_voice_two_turn_probe_observed', {
    marker_probe: true,
    runtime_probe: 'continuous_voice_two_turn',
    runtime_fix_marker: STATUS_DIALOGUE_RUNTIME_FIX_MARKER,
    fake_audio_path: continuousTwoTurnFakeAudioPath,
    latency_ms: Date.now() - startedAt,
    transcribe_count: transcribeCount,
    observed_events: Array.from(seenEvents).sort(),
    boundary: 'isolated Electron probe proved two consecutive formal STT turns can enter the dialogue path'
  })
  window.destroy()
}

async function runStatusDialogueLocalSttLowSignalProbe(): Promise<void> {
  const startedAt = Date.now()
  const seenEvents = new Set<string>()
  let probeResolved = false

  const requiredEvents = [
    'status_dialogue_local_stt_low_signal_probe_start',
    'local_stt_recording_started',
    'local_stt_low_signal_candidate',
    'local_stt_low_signal_transcribe_allowed',
    'local_stt_transcribe_request',
    'local_stt_transcribe_result'
  ]

  ipcMain.handle('zhineng:status-dialogue:stt:health', async () => ({
    schema: 'status_dialogue_local_stt_health.v1',
    generated_at: new Date().toISOString(),
    adapter_id: 'local_whisper_persistent_service',
    configured: true,
    reachable: true,
    status: 'ready',
    base_url_host: 'isolated-test-cli',
    model: 'base',
    loaded_models: ['base'],
    default_model: 'base',
    device: 'mock',
    latency_ms: 1
  }))

  ipcMain.handle('zhineng:status-dialogue:stt:transcribe', async (_event, request?: Record<string, unknown>) => {
    writeStatusDialogueRuntimeLog('local_stt_start', {
      marker_probe: true,
      runtime_probe: 'local_stt_low_signal',
      adapter_id: 'local_whisper_persistent_service',
      model: typeof request?.model === 'string' ? request.model : 'base',
      language: typeof request?.language === 'string' ? request.language : 'zh',
      boundary: 'isolated low-signal VAD probe; mock Whisper response; no raw audio persistence'
    })
    const result = {
      schema: 'status_dialogue_stt_transcription.v1',
      generated_at: new Date().toISOString(),
      success: true,
      adapter_id: 'local_whisper_persistent_service',
      provider: 'openai_whisper_local',
      transcript: '低音量语音探针通过',
      language: 'zh',
      model: typeof request?.model === 'string' ? request.model : 'base',
      latency_ms: 12,
      events: ['mock_low_signal_transcribe']
    }
    writeStatusDialogueRuntimeLog('local_stt_complete', {
      marker_probe: true,
      runtime_probe: 'local_stt_low_signal',
      adapter_id: 'local_whisper_persistent_service',
      success: true,
      transcript_length: result.transcript.length,
      latency_ms: result.latency_ms,
      boundary: 'isolated low-signal VAD probe completed mocked local Whisper transcription'
    })
    return result
  })

  const probePromise = new Promise<void>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (probeResolved) return
      rejectPromise(
        new Error(
          `status dialogue local STT low-signal probe missing events: ${requiredEvents
            .filter((event) => !seenEvents.has(event))
            .join(', ')}`
        )
      )
    }, 25000)

    ipcMain.handle('zhineng:status-dialogue:voice-log', async (_event, request?: Record<string, unknown>) => {
      const event = typeof request?.event === 'string' ? request.event.slice(0, 80) : 'renderer_voice_event'
      const payload = request?.payload && typeof request.payload === 'object' ? (request.payload as Record<string, unknown>) : {}
      seenEvents.add(event)
      writeStatusDialogueRuntimeLog(event, {
        ...payload,
        marker_probe: true,
        runtime_probe: 'local_stt_low_signal'
      })
      if (requiredEvents.every((requiredEvent) => seenEvents.has(requiredEvent))) {
        probeResolved = true
        clearTimeout(timeout)
        resolvePromise()
      }
      return { success: true }
    })
  })

  const window = new BrowserWindow({
    width: 760,
    height: 580,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    throw new Error(`local STT low-signal probe failed to load renderer: ${errorCode} ${errorDescription}`)
  })

  await window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: {
      window: 'zhineng-graph',
      state: JSON.stringify({ status_dialogue_runtime_probe: 'local_stt_low_signal' })
    }
  })
  await probePromise
  writeStatusDialogueRuntimeLog('status_dialogue_local_stt_low_signal_probe_observed', {
    marker_probe: true,
    runtime_probe: 'local_stt_low_signal',
    runtime_fix_marker: STATUS_DIALOGUE_RUNTIME_FIX_MARKER,
    fake_audio_path: localSttLowSignalFakeAudioPath,
    latency_ms: Date.now() - startedAt,
    observed_events: Array.from(seenEvents).sort(),
    boundary: 'isolated Electron probe proved low-level microphone energy reaches the local STT transcription path'
  })
  window.destroy()
}

async function runStatusDialogueLocalSttBorderlineProbe(): Promise<void> {
  const startedAt = Date.now()
  const seenEvents = new Set<string>()
  let probeResolved = false

  const requiredEvents = [
    'status_dialogue_local_stt_borderline_probe_start',
    'local_stt_recording_started',
    'local_stt_borderline_transcribe_allowed',
    'local_stt_transcribe_request',
    'local_stt_transcribe_result'
  ]

  ipcMain.handle('zhineng:status-dialogue:stt:health', async () => ({
    schema: 'status_dialogue_local_stt_health.v1',
    generated_at: new Date().toISOString(),
    adapter_id: 'local_whisper_persistent_service',
    configured: true,
    reachable: true,
    status: 'ready',
    base_url_host: 'isolated-test-cli',
    model: 'base',
    loaded_models: ['base'],
    default_model: 'base',
    device: 'mock',
    latency_ms: 1
  }))

  ipcMain.handle('zhineng:status-dialogue:stt:transcribe', async (_event, request?: Record<string, unknown>) => {
    writeStatusDialogueRuntimeLog('local_stt_start', {
      marker_probe: true,
      runtime_probe: 'local_stt_borderline',
      adapter_id: 'local_whisper_persistent_service',
      model: typeof request?.model === 'string' ? request.model : 'base',
      language: typeof request?.language === 'string' ? request.language : 'zh',
      boundary: 'isolated borderline VAD probe; mock Whisper response; no raw audio persistence'
    })
    const result = {
      schema: 'status_dialogue_stt_transcription.v1',
      generated_at: new Date().toISOString(),
      success: true,
      adapter_id: 'local_whisper_persistent_service',
      provider: 'openai_whisper_local',
      transcript: 'borderline stt probe passed',
      language: 'zh',
      model: typeof request?.model === 'string' ? request.model : 'base',
      latency_ms: 12,
      events: ['mock_borderline_transcribe']
    }
    writeStatusDialogueRuntimeLog('local_stt_complete', {
      marker_probe: true,
      runtime_probe: 'local_stt_borderline',
      adapter_id: 'local_whisper_persistent_service',
      success: true,
      transcript_length: result.transcript.length,
      latency_ms: result.latency_ms,
      boundary: 'isolated borderline VAD probe completed mocked local Whisper transcription'
    })
    return result
  })

  const probePromise = new Promise<void>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (probeResolved) return
      rejectPromise(
        new Error(
          `status dialogue local STT borderline probe missing events: ${requiredEvents
            .filter((event) => !seenEvents.has(event))
            .join(', ')}`
        )
      )
    }, 25000)

    ipcMain.handle('zhineng:status-dialogue:voice-log', async (_event, request?: Record<string, unknown>) => {
      const event = typeof request?.event === 'string' ? request.event.slice(0, 80) : 'renderer_voice_event'
      const payload = request?.payload && typeof request.payload === 'object' ? (request.payload as Record<string, unknown>) : {}
      seenEvents.add(event)
      writeStatusDialogueRuntimeLog(event, {
        ...payload,
        marker_probe: true,
        runtime_probe: 'local_stt_borderline'
      })
      if (requiredEvents.every((requiredEvent) => seenEvents.has(requiredEvent))) {
        probeResolved = true
        clearTimeout(timeout)
        resolvePromise()
      }
      return { success: true }
    })
  })

  const window = new BrowserWindow({
    width: 760,
    height: 580,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    throw new Error(`local STT borderline probe failed to load renderer: ${errorCode} ${errorDescription}`)
  })

  await window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: {
      window: 'zhineng-graph',
      state: JSON.stringify({ status_dialogue_runtime_probe: 'local_stt_borderline' })
    }
  })
  await probePromise
  writeStatusDialogueRuntimeLog('status_dialogue_local_stt_borderline_probe_observed', {
    marker_probe: true,
    runtime_probe: 'local_stt_borderline',
    runtime_fix_marker: STATUS_DIALOGUE_RUNTIME_FIX_MARKER,
    fake_audio_path: localSttBorderlineFakeAudioPath,
    latency_ms: Date.now() - startedAt,
    observed_events: Array.from(seenEvents).sort(),
    boundary: 'isolated Electron probe proved borderline microphone energy reaches the local STT transcription path'
  })
  window.destroy()
}

async function runStatusDialogueCloudSttBudgetProbe(): Promise<void> {
  const startedAt = Date.now()
  const seenEvents = new Set<string>()
  let observedTimeoutMs = 0
  let probeResolved = false

  const requiredEvents = [
    'status_dialogue_cloud_stt_fake_audio_probe_start',
    'cloud_stt_failure_classified',
    'cloud_stt_degraded_cooldown_saved',
    'cloud_stt_degraded_to_local',
    'status_dialogue_cloud_stt_fake_audio_probe_complete'
  ]

  ipcMain.handle('zhineng:status-dialogue:chrome-stt:transcribe', async (_event, request?: Record<string, unknown>) => {
    observedTimeoutMs = typeof request?.timeout_ms === 'number' ? request.timeout_ms : 0
    const sessionId = typeof request?.session_id === 'string' ? request.session_id : `cloud-stt-budget-${Date.now()}`
    writeStatusDialogueRuntimeLog('chrome_stt_start', {
      marker_probe: true,
      runtime_probe: 'cloud_stt_fake_audio',
      session_id: sessionId,
      language: typeof request?.language === 'string' ? request.language : 'zh-CN',
      timeout_ms: observedTimeoutMs,
      visible: false,
      boundary: 'isolated cloud STT budget probe; mocked timeout result; no external Chrome launch'
    })
    return {
      schema: 'status_dialogue_chrome_stt_result.v1',
      generated_at: new Date().toISOString(),
      success: false,
      adapter_id: 'chrome_stt_bridge',
      provider: 'chrome_web_speech',
      session_id: sessionId,
      language: typeof request?.language === 'string' ? request.language : 'zh-CN',
      latency_ms: observedTimeoutMs,
      error: 'chrome_stt_timeout',
      fallback_reason: 'timeout',
      transcript: '',
      events: ['ready', 'start', 'timeout']
    }
  })

  const probePromise = new Promise<void>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (probeResolved) return
      rejectPromise(
        new Error(
          `status dialogue cloud STT budget probe missing events: ${requiredEvents
            .filter((event) => !seenEvents.has(event))
            .join(', ')}; observedTimeoutMs=${observedTimeoutMs}`
        )
      )
    }, 18000)

    ipcMain.handle('zhineng:status-dialogue:voice-log', async (_event, request?: Record<string, unknown>) => {
      const event = typeof request?.event === 'string' ? request.event.slice(0, 80) : 'renderer_voice_event'
      const payload = request?.payload && typeof request.payload === 'object' ? (request.payload as Record<string, unknown>) : {}
      seenEvents.add(event)
      writeStatusDialogueRuntimeLog(event, {
        ...payload,
        marker_probe: true,
        runtime_probe: 'cloud_stt_fake_audio'
      })
      if (observedTimeoutMs === 7000 && requiredEvents.every((requiredEvent) => seenEvents.has(requiredEvent))) {
        probeResolved = true
        clearTimeout(timeout)
        resolvePromise()
      }
      return { success: true }
    })
  })

  const window = new BrowserWindow({
    width: 760,
    height: 580,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    throw new Error(`cloud STT budget probe failed to load renderer: ${errorCode} ${errorDescription}`)
  })

  await window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: {
      window: 'zhineng-graph',
      state: JSON.stringify({
        status_dialogue_runtime_probe: 'cloud_stt_fake_audio',
        status_dialogue_cloud_stt_language: 'zh-CN',
        status_dialogue_cloud_stt_max_attempts: 1,
        status_dialogue_cloud_stt_timeout_ms: 7000
      })
    }
  })
  await probePromise
  writeStatusDialogueRuntimeLog('status_dialogue_cloud_stt_budget_probe_observed', {
    marker_probe: true,
    runtime_probe: 'cloud_stt_fake_audio',
    runtime_fix_marker: STATUS_DIALOGUE_RUNTIME_FIX_MARKER,
    timeout_ms: observedTimeoutMs,
    latency_ms: Date.now() - startedAt,
    observed_events: Array.from(seenEvents).sort(),
    boundary: 'isolated Electron probe observed cloud STT latency budget and degraded fallback path'
  })
  window.destroy()
}

async function runStatusDialogueRemoteSttMockProbe(): Promise<void> {
  const startedAt = Date.now()
  const seenEvents = new Set<string>()
  let probeResolved = false

  const requiredEvents = [
    'status_dialogue_remote_stt_mock_probe_start',
    'remote_stt_health_request',
    'remote_stt_health_result',
    'local_stt_transcribe_request',
    'remote_stt_start',
    'remote_stt_complete',
    'local_stt_transcribe_result'
  ]

  ipcMain.handle('zhineng:status-dialogue:stt:remote-health', async () => {
    seenEvents.add('remote_stt_health_check')
    writeStatusDialogueRuntimeLog('remote_stt_health_check', {
      marker_probe: true,
      runtime_probe: 'remote_stt_mock',
      adapter_id: 'openai_compatible_stt',
      configured: true,
      reachable: true,
      status: 'ready',
      base_url_host: 'mock-openai-compatible-stt.local',
      endpoint_path: '/audio/transcriptions',
      model: 'mock-whisper-1',
      timeout_ms: 30000,
      latency_ms: 1,
      boundary: 'controlled remote STT mock health; no external network; no audio upload; no api key logging'
    })
    return {
      schema: 'status_dialogue_remote_stt_health.v1',
      generated_at: new Date().toISOString(),
      adapter_id: 'openai_compatible_stt',
      configured: true,
      reachable: true,
      status: 'ready',
      base_url_host: 'mock-openai-compatible-stt.local',
      endpoint_path: '/audio/transcriptions',
      model: 'mock-whisper-1',
      timeout_ms: 30000,
      latency_ms: 1
    }
  })

  ipcMain.handle('zhineng:status-dialogue:stt:transcribe', async (_event, request?: Record<string, unknown>) => {
    const sessionId = `remote-stt-mock-${Date.now()}`
    const adapterId = typeof request?.adapter_id === 'string' ? request.adapter_id : 'unknown'
    seenEvents.add('remote_stt_start')
    writeStatusDialogueRuntimeLog('remote_stt_start', {
      marker_probe: true,
      runtime_probe: 'remote_stt_mock',
      session_id: sessionId,
      adapter_id: adapterId,
      configured: true,
      has_audio_data_url: typeof request?.audio_data_url === 'string',
      boundary: 'controlled remote STT mock transcription; no external network'
    })
    seenEvents.add('remote_stt_complete')
    writeStatusDialogueRuntimeLog('remote_stt_complete', {
      marker_probe: true,
      runtime_probe: 'remote_stt_mock',
      session_id: sessionId,
      adapter_id: 'openai_compatible_stt',
      success: true,
      transcript_length: 12,
      latency_ms: 38,
      provider: 'mock_openai_compatible_remote',
      boundary: 'controlled remote STT mock transcription complete'
    })
    return {
      schema: 'status_dialogue_stt_transcription.v1',
      generated_at: new Date().toISOString(),
      success: true,
      adapter_id: 'openai_compatible_stt',
      provider: 'mock_openai_compatible_remote',
      model: 'mock-whisper-1',
      language: 'zh',
      transcript: '远端语音测试成功',
      latency_ms: 38
    }
  })

  ipcMain.handle('zhineng:status-dialogue:complete:stream', async (event, request?: Record<string, unknown>) => {
    const sessionId = typeof request?.sessionId === 'string' ? request.sessionId : `remote-stt-mock-dialogue-${Date.now()}`
    const text = JSON.stringify({
      voice: '我已经收到远端 STT 的模拟转写。',
      reply: '我已经收到远端 STT 的模拟转写。这只证明 OpenAI-compatible 适配器链路可用，不代表真实云端 API 已稳定。',
      intent_lane: 'status_patrol',
      response_plan: { shape: 'conclusion_evidence_attention_next' },
      patrol_insertions: [],
      attention_log: ['remote stt mock path', 'no external network', 'real api still unproved'],
      status_refs: ['openai_compatible_stt', 'runtime_probe.remote_stt_mock'],
      missing_status: [],
      boundary_notes: ['controlled probe only'],
      tts_playback_intent: 'status_ok'
    })
    event.sender.send('zhineng:status-dialogue:complete:stream:event', {
      schema: 'status_dialogue_model_stream_event.v1',
      sessionId,
      session_id: sessionId,
      generated_at: new Date().toISOString(),
      type: 'delta',
      delta: text,
      deltaCount: 1,
      accumulatedLength: text.length
    })
    return {
      success: true,
      text,
      model: 'mock-status-dialogue-model',
      providerLabel: 'runtime-probe',
      sessionId,
      streamed: true,
      deltaCount: 1,
      latencyMs: 5
    }
  })

  const probePromise = new Promise<void>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (probeResolved) return
      rejectPromise(
        new Error(
          `status dialogue remote STT mock probe missing events: ${requiredEvents
            .filter((event) => !seenEvents.has(event))
            .join(', ')}`
        )
      )
    }, 22000)

    ipcMain.handle('zhineng:status-dialogue:voice-log', async (_event, request?: Record<string, unknown>) => {
      const event = typeof request?.event === 'string' ? request.event.slice(0, 80) : 'renderer_voice_event'
      const payload = request?.payload && typeof request.payload === 'object' ? (request.payload as Record<string, unknown>) : {}
      seenEvents.add(event)
      writeStatusDialogueRuntimeLog(event, {
        ...payload,
        marker_probe: true,
        runtime_probe: 'remote_stt_mock'
      })
      if (requiredEvents.every((requiredEvent) => seenEvents.has(requiredEvent))) {
        probeResolved = true
        clearTimeout(timeout)
        resolvePromise()
      }
      return { success: true }
    })
  })

  const window = new BrowserWindow({
    width: 760,
    height: 580,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    throw new Error(`remote STT mock probe failed to load renderer: ${errorCode} ${errorDescription}`)
  })

  await window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: {
      window: 'zhineng-graph',
      state: JSON.stringify({ status_dialogue_runtime_probe: 'remote_stt_mock' })
    }
  })
  await probePromise
  writeStatusDialogueRuntimeLog('status_dialogue_remote_stt_mock_probe_complete', {
    marker_probe: true,
    runtime_probe: 'remote_stt_mock',
    runtime_fix_marker: STATUS_DIALOGUE_RUNTIME_FIX_MARKER,
    fake_audio_path: remoteSttMockFakeAudioPath,
    latency_ms: Date.now() - startedAt,
    observed_events: Array.from(seenEvents).sort(),
    boundary: 'controlled Electron probe proved remote STT adapter route with a mock OpenAI-compatible result'
  })
  window.destroy()
}

async function runStatusDialogueRemoteSttUnavailableProbe(): Promise<void> {
  const startedAt = Date.now()
  const seenEvents = new Set<string>()
  let probeResolved = false

  const requiredEvents = [
    'status_dialogue_remote_stt_unavailable_probe_start',
    'remote_stt_health_request',
    'remote_stt_health_result',
    'status_dialogue_remote_stt_unavailable_probe_ready',
    'stt_start_requested',
    'remote_stt_unavailable_skip_to_local',
    'local_stt_transcribe_request',
    'local_stt_start',
    'local_stt_complete',
    'local_stt_transcribe_result'
  ]

  ipcMain.handle('zhineng:status-dialogue:stt:health', async () => ({
    schema: 'status_dialogue_local_stt_health.v1',
    generated_at: new Date().toISOString(),
    adapter_id: 'local_whisper_persistent_service',
    configured: true,
    reachable: true,
    status: 'ready',
    base_url_host: 'isolated-test-cli',
    model: 'base',
    loaded_models: ['base'],
    default_model: 'base',
    device: 'mock',
    latency_ms: 1
  }))

  ipcMain.handle('zhineng:entity-work:projection:get', async () => ({
    success: false,
    error: 'runtime probe stub: entity work projection unavailable'
  }))

  ipcMain.handle('zhineng:status-dialogue:snapshot:get', async () => ({
    success: true,
    source: 'runtime_probe_stub',
    snapshot: {
      schema: 'status_snapshot.v1',
      generated_at: new Date().toISOString(),
      source: 'runtime_probe_stub',
      global_status: 'unknown',
      cards_total: 0,
      cards_fresh: 0,
      cards_stale: 0,
      cards_missing: 0,
      expected_modules: [],
      module_cards: [],
      missing_module_ids: [],
      stale_module_ids: [],
      conflict_module_ids: [],
      patrol_findings: [],
      read_errors: []
    }
  }))

  ipcMain.handle('zhineng:status-dialogue:events:get', async () => ({
    success: true,
    events: [],
    source: 'runtime_probe_stub'
  }))

  ipcMain.handle('zhineng:status-dialogue:real-env:check', async () => ({
    success: true,
    configured: false,
    source: 'runtime_probe_stub',
    boundary: 'remote unavailable probe does not inspect real secrets'
  }))

  ipcMain.handle('zhineng:status-dialogue:tts:health', async () => ({
    schema: 'status_dialogue_tts_health.v1',
    generated_at: new Date().toISOString(),
    adapter_id: 'edge_readaloud_websocket',
    configured: true,
    reachable: true,
    status: 'ready',
    base_url_host: 'isolated-test-cli',
    latency_ms: 1
  }))

  ipcMain.handle('zhineng:status-dialogue:stt:remote-health', async () => {
    seenEvents.add('remote_stt_health_check')
    writeStatusDialogueRuntimeLog('remote_stt_health_check', {
      marker_probe: true,
      runtime_probe: 'remote_stt_unavailable',
      adapter_id: 'openai_compatible_stt',
      configured: false,
      reachable: false,
      status: 'fallback',
      base_url_host: 'not_configured',
      endpoint_path: '/audio/transcriptions',
      model: 'not_configured',
      timeout_ms: 30000,
      latency_ms: 1,
      error: 'remote STT is not configured',
      boundary: 'controlled unavailable remote STT health; no external network; no audio upload; no api key logging'
    })
    return {
      schema: 'status_dialogue_remote_stt_health.v1',
      generated_at: new Date().toISOString(),
      adapter_id: 'openai_compatible_stt',
      configured: false,
      reachable: false,
      status: 'fallback',
      base_url_host: 'not_configured',
      endpoint_path: '/audio/transcriptions',
      model: 'not_configured',
      timeout_ms: 30000,
      latency_ms: 1,
      error: 'remote STT is not configured'
    }
  })

  ipcMain.handle('zhineng:status-dialogue:stt:transcribe', async (_event, request?: Record<string, unknown>) => {
    const adapterId = typeof request?.adapter_id === 'string' ? request.adapter_id : 'unknown'
    if (adapterId !== 'local_whisper_persistent_service') {
      writeStatusDialogueRuntimeLog('remote_stt_unavailable_probe_unexpected_remote_upload', {
        marker_probe: true,
        runtime_probe: 'remote_stt_unavailable',
        adapter_id: adapterId,
        boundary: 'probe failure: unavailable remote STT must fall back before transcription upload'
      })
      throw new Error(`remote unavailable probe expected local fallback, got ${adapterId}`)
    }
    seenEvents.add('local_stt_start')
    writeStatusDialogueRuntimeLog('local_stt_start', {
      marker_probe: true,
      runtime_probe: 'remote_stt_unavailable',
      adapter_id: 'local_whisper_persistent_service',
      model: typeof request?.model === 'string' ? request.model : 'base',
      language: typeof request?.language === 'string' ? request.language : 'zh',
      boundary: 'remote unavailable probe reached local Whisper fallback; no remote audio upload'
    })
    const result = {
      schema: 'status_dialogue_stt_transcription.v1',
      generated_at: new Date().toISOString(),
      success: true,
      adapter_id: 'local_whisper_persistent_service',
      provider: 'openai_whisper_local',
      transcript: 'remote unavailable local fallback passed',
      language: 'zh',
      model: typeof request?.model === 'string' ? request.model : 'base',
      latency_ms: 16,
      events: ['mock_remote_unavailable_local_fallback']
    }
    seenEvents.add('local_stt_complete')
    writeStatusDialogueRuntimeLog('local_stt_complete', {
      marker_probe: true,
      runtime_probe: 'remote_stt_unavailable',
      adapter_id: 'local_whisper_persistent_service',
      success: true,
      transcript_length: result.transcript.length,
      latency_ms: result.latency_ms,
      boundary: 'remote unavailable probe completed local Whisper fallback transcription'
    })
    return result
  })

  ipcMain.handle('zhineng:status-dialogue:complete:stream', async (event, request?: Record<string, unknown>) => {
    const sessionId = typeof request?.sessionId === 'string' ? request.sessionId : `remote-unavailable-dialogue-${Date.now()}`
    const text = JSON.stringify({
      voice: 'Remote STT is unavailable, so I used local Whisper.',
      reply: 'Remote STT is unavailable, so I used local Whisper. This proves the fallback route, not real cloud STT stability.',
      intent_lane: 'voice_control',
      response_plan: { shape: 'conclusion_evidence_attention_next' },
      patrol_insertions: [],
      attention_log: ['remote health unavailable', 'local fallback used', 'cloud stability still unproved'],
      status_refs: ['openai_compatible_stt', 'local_whisper_persistent_service', 'runtime_probe.remote_stt_unavailable'],
      missing_status: ['remote_stt_api_configuration'],
      boundary_notes: ['controlled probe only', 'no world write', 'no remote audio upload'],
      tts_playback_intent: 'status_ok'
    })
    event.sender.send('zhineng:status-dialogue:complete:stream:event', {
      schema: 'status_dialogue_model_stream_event.v1',
      sessionId,
      session_id: sessionId,
      generated_at: new Date().toISOString(),
      type: 'delta',
      delta: text,
      deltaCount: 1,
      accumulatedLength: text.length
    })
    return {
      success: true,
      text,
      model: 'mock-status-dialogue-model',
      providerLabel: 'runtime-probe',
      sessionId,
      streamed: true,
      deltaCount: 1,
      latencyMs: 5
    }
  })

  ipcMain.handle('zhineng:status-dialogue:tts:synthesize:stream', async (event, request?: Record<string, unknown>) => {
    const sessionId = typeof request?.sessionId === 'string' ? request.sessionId : `remote-unavailable-tts-${Date.now()}`
    const plan = request?.plan && typeof request.plan === 'object' ? (request.plan as Record<string, unknown>) : {}
    const chunkId = typeof plan.source_output_id === 'string' ? plan.source_output_id : sessionId
    const audioBase64 = createSilentWavBuffer(120, 16000).toString('base64')
    const generatedAt = new Date().toISOString()
    event.sender.send('zhineng:status-dialogue:tts:synthesize:stream:event', {
      schema: 'status_dialogue_tts_stream_event.v1',
      sessionId,
      session_id: sessionId,
      type: 'frame',
      frame: {
        schema: 'streaming_tts_audio_frame.v1',
        frame_id: `${chunkId}:mock-frame:1`,
        chunk_id: chunkId,
        sequence: 1,
        audio_mime_type: 'audio/wav',
        audio_base64: audioBase64,
        final: true,
        generated_at: generatedAt
      }
    })
    return {
      success: true,
      sessionId,
      frameCount: 1,
      finalFrameCount: 1,
      firstFrameMs: 10,
      totalStreamMs: 12,
      cacheHit: false
    }
  })

  const probePromise = new Promise<void>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (probeResolved) return
      rejectPromise(
        new Error(
          `status dialogue remote unavailable probe missing events: ${requiredEvents
            .filter((event) => !seenEvents.has(event))
            .join(', ')}`
        )
      )
    }, 26000)

    ipcMain.handle('zhineng:status-dialogue:voice-log', async (_event, request?: Record<string, unknown>) => {
      const event = typeof request?.event === 'string' ? request.event.slice(0, 80) : 'renderer_voice_event'
      const payload = request?.payload && typeof request.payload === 'object' ? (request.payload as Record<string, unknown>) : {}
      seenEvents.add(event)
      writeStatusDialogueRuntimeLog(event, {
        ...payload,
        marker_probe: true,
        runtime_probe: 'remote_stt_unavailable'
      })
      if (requiredEvents.every((requiredEvent) => seenEvents.has(requiredEvent))) {
        probeResolved = true
        clearTimeout(timeout)
        resolvePromise()
      }
      return { success: true }
    })
  })

  const window = new BrowserWindow({
    width: 760,
    height: 580,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    throw new Error(`remote STT unavailable probe failed to load renderer: ${errorCode} ${errorDescription}`)
  })

  await window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: {
      window: 'zhineng-graph',
      state: JSON.stringify({ status_dialogue_runtime_probe: 'remote_stt_unavailable' })
    }
  })
  await probePromise
  writeStatusDialogueRuntimeLog('status_dialogue_remote_stt_unavailable_probe_complete', {
    marker_probe: true,
    runtime_probe: 'remote_stt_unavailable',
    runtime_fix_marker: STATUS_DIALOGUE_RUNTIME_FIX_MARKER,
    fake_audio_path: remoteSttMockFakeAudioPath,
    latency_ms: Date.now() - startedAt,
    observed_events: Array.from(seenEvents).sort(),
    boundary: 'controlled Electron probe proved unavailable remote STT skips to local Whisper before remote transcription'
  })
  window.destroy()
}

async function runStatusDialogueTtsVoiceBudgetProbe(): Promise<void> {
  const startedAt = Date.now()
  const seenEvents = new Set<string>()
  let probeResolved = false
  const requiredEvents = [
    'status_dialogue_tts_voice_budget_probe_start',
    'status_dialogue_tts_voice_budget_probe_submitted',
    'tts_stream_sentence_skipped_by_voice_budget',
    'tts_shortest_voice_path_selected'
  ]

  ipcMain.handle('zhineng:status-dialogue:complete:stream', async (event, request?: Record<string, unknown>) => {
    const sessionId = typeof request?.sessionId === 'string' ? request.sessionId : `tts-voice-budget-${Date.now()}`
    const text = JSON.stringify({
      voice: '我先给结论。第二句不应该进入语音队列。第三句也只保留在界面里。',
      reply:
        '我先给结论。第二句不应该进入语音队列。第三句也只保留在界面里。完整回复仍然展示在状态对话框中，用于证明 TTS spoken budget 不丢失文本信息。',
      intent_lane: 'status_patrol',
      response_plan: { shape: 'conclusion_evidence_attention_next' },
      patrol_insertions: [],
      attention_log: ['voice budget probe', 'streaming sentence budget', 'full reply visible'],
      status_refs: ['voice_response_text_stream.v1', 'status_dialogue_tts_spoken_budget.v1'],
      missing_status: [],
      boundary_notes: ['controlled probe only'],
      tts_playback_intent: 'status_ok'
    })
    const chunks = text.match(/.{1,18}/g) ?? [text]
    for (const [index, delta] of chunks.entries()) {
      event.sender.send('zhineng:status-dialogue:complete:stream:event', {
        schema: 'status_dialogue_model_stream_event.v1',
        sessionId,
        session_id: sessionId,
        generated_at: new Date().toISOString(),
        type: 'delta',
        delta,
        deltaCount: index + 1,
        accumulatedLength: chunks.slice(0, index + 1).join('').length
      })
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 15))
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 80))
    return {
      success: true,
      text,
      model: 'mock-status-dialogue-model',
      providerLabel: 'runtime-probe',
      sessionId,
      streamed: true,
      deltaCount: chunks.length,
      latencyMs: 12
    }
  })

  ipcMain.handle('zhineng:status-dialogue:tts:synthesize:stream', async (event, request?: Record<string, unknown>) => {
    const sessionId = typeof request?.sessionId === 'string' ? request.sessionId : `tts-stream-${Date.now()}`
    const plan = request?.plan && typeof request.plan === 'object' ? (request.plan as Record<string, unknown>) : {}
    const chunkId = typeof plan.source_output_id === 'string' ? plan.source_output_id : sessionId
    const audioBase64 = createSilentWavBuffer(160, 16000).toString('base64')
    const generatedAt = new Date().toISOString()
    event.sender.send('zhineng:status-dialogue:tts:synthesize:stream:event', {
      schema: 'status_dialogue_tts_stream_event.v1',
      sessionId,
      session_id: sessionId,
      type: 'frame',
      frame: {
        schema: 'streaming_tts_audio_frame.v1',
        frame_id: `${chunkId}:mock-frame:1`,
        chunk_id: chunkId,
        sequence: 1,
        audio_mime_type: 'audio/wav',
        audio_base64: audioBase64,
        final: false,
        generated_at: generatedAt
      }
    })
    event.sender.send('zhineng:status-dialogue:tts:synthesize:stream:event', {
      schema: 'status_dialogue_tts_stream_event.v1',
      sessionId,
      session_id: sessionId,
      type: 'frame',
      frame: {
        schema: 'streaming_tts_audio_frame.v1',
        frame_id: `${chunkId}:mock-frame:2:final`,
        chunk_id: chunkId,
        sequence: 2,
        audio_mime_type: 'audio/wav',
        audio_base64: '',
        final: true,
        generated_at: generatedAt
      }
    })
    return {
      success: true,
      sessionId,
      frameCount: 1,
      finalFrameCount: 1,
      firstFrameMs: 20,
      totalStreamMs: 30,
      cacheHit: false
    }
  })

  const probePromise = new Promise<void>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (probeResolved) return
      rejectPromise(
        new Error(
          `status dialogue TTS voice budget probe missing events: ${requiredEvents
            .filter((event) => !seenEvents.has(event))
            .join(', ')}`
        )
      )
    }, 22000)

    ipcMain.handle('zhineng:status-dialogue:voice-log', async (_event, request?: Record<string, unknown>) => {
      const event = typeof request?.event === 'string' ? request.event.slice(0, 80) : 'renderer_voice_event'
      const payload = request?.payload && typeof request.payload === 'object' ? (request.payload as Record<string, unknown>) : {}
      seenEvents.add(event)
      writeStatusDialogueRuntimeLog(event, {
        ...payload,
        marker_probe: true,
        runtime_probe: 'tts_voice_budget'
      })
      if (requiredEvents.every((requiredEvent) => seenEvents.has(requiredEvent))) {
        probeResolved = true
        clearTimeout(timeout)
        resolvePromise()
      }
      return { success: true }
    })
  })

  const window = new BrowserWindow({
    width: 760,
    height: 580,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    throw new Error(`TTS voice budget probe failed to load renderer: ${errorCode} ${errorDescription}`)
  })

  await window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: {
      window: 'zhineng-graph',
      state: JSON.stringify({ status_dialogue_runtime_probe: 'tts_voice_budget' })
    }
  })
  await probePromise
  writeStatusDialogueRuntimeLog('status_dialogue_tts_voice_budget_probe_complete', {
    marker_probe: true,
    runtime_probe: 'tts_voice_budget',
    runtime_fix_marker: STATUS_DIALOGUE_RUNTIME_FIX_MARKER,
    latency_ms: Date.now() - startedAt,
    observed_events: Array.from(seenEvents).sort(),
    boundary: 'controlled Electron probe proved streaming voice budget keeps full reply visible while reducing spoken queue'
  })
  window.destroy()
}

app.whenReady().then(async () => {
  try {
    await checkAndRequestPermissions()

    const action = process.env.TEST_MODE
    console.log(`\n\n--- 🚀 Running isolated atom CLI test: ${action} ---\n\n`)
    
    if (action === 'screenshot') await runScreenshotTest()
    else if (action === 'reply') await runReplyTest()
    else if (action === 'switch') await runSwitchTest()
    else if (action === 'status-dialogue-marker') await runStatusDialogueMarkerTest()
    else if (action === 'status-dialogue-tts-input-interrupt') await runStatusDialogueTtsInputInterruptProbe()
    else if (action === 'status-dialogue-stt-click-during-tts') await runStatusDialogueSttClickDuringTtsProbe()
    else if (action === 'status-dialogue-visible-stt-button-click') await runStatusDialogueVisibleSttButtonClickProbe()
    else if (action === 'status-dialogue-dock-voice-entry') await runStatusDialogueDockVoiceEntryProbe()
    else if (action === 'status-dialogue-continuous-loop') await runStatusDialogueContinuousVoiceLoopProbe()
    else if (action === 'status-dialogue-continuous-fast-fail') await runStatusDialogueContinuousVoiceFastFailProbe()
    else if (action === 'status-dialogue-continuous-two-turn') await runStatusDialogueContinuousVoiceTwoTurnProbe()
    else if (action === 'status-dialogue-local-stt-low-signal') await runStatusDialogueLocalSttLowSignalProbe()
    else if (action === 'status-dialogue-local-stt-borderline') await runStatusDialogueLocalSttBorderlineProbe()
    else if (action === 'status-dialogue-cloud-stt-budget') await runStatusDialogueCloudSttBudgetProbe()
    else if (action === 'status-dialogue-remote-stt-mock') await runStatusDialogueRemoteSttMockProbe()
    else if (action === 'status-dialogue-remote-stt-unavailable') await runStatusDialogueRemoteSttUnavailableProbe()
    else if (action === 'status-dialogue-tts-voice-budget') await runStatusDialogueTtsVoiceBudgetProbe()
    else if (action === 'bridge-observation') await runBridgeObservationTest()
    else if (action === 'send-dry-run') await runSendDryRunTest()
    else if (action === 'real-intake-observation') await runRealIntakeObservationTest()
    else if (action === 'controlled-send') {
      if (process.env.ALLOW_CONTROLLED_SEND !== 'true') {
        throw new Error('controlled-send requires ALLOW_CONTROLLED_SEND=true and a test account/window')
      }
      await runControlledSendTest()
    }
    else if (action === 'controlled-send-real') {
      await runRealControlledSendTest()
    }
    else {
      console.error(`Unknown test mode: ${action}`)
      process.exitCode = 1
    }

  } catch (err) {
    console.error(err)
    process.exitCode = 1
  } finally {
    console.log('\n\n--- 🏁 CLI Test Finished ---\n\n')
    app.exit(process.exitCode ?? 0)
  }
})
