const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const zhinengRoot = process.env.ZHINENG_PROJECT_ROOT
  ? path.resolve(process.env.ZHINENG_PROJECT_ROOT)
  : path.resolve(repoRoot, '..')
const logDir = path.join(zhinengRoot, 'runtime', 'status-dialogue-logs')
const reportDir = path.join(repoRoot, 'runtime', 'verification-reports')
const rendererPath = path.join(repoRoot, 'src', 'renderer', 'src', 'zhineng-console', 'ZhinengConsole.tsx')
const mainPath = path.join(repoRoot, 'src', 'main', 'index.ts')
const packagePath = path.join(repoRoot, 'package.json')
const continuousLoopWaitPath = path.join(repoRoot, 'scripts', 'wait-status-dialogue-continuous-loop.cjs')
const settingsPath = path.join(
  process.env.APPDATA || '',
  'zhineng-social-assistant-desktop',
  'settings.json'
)
const expectedTtsBudgetRuntimeMarker = 'tts-spoken-budget-2026-07-01-v2'
const slowTtsQueueThresholds = {
  end_to_end_ms: 8_000,
  total_tts_ms: 5_000,
  total_playback_ms: 8_000
}

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
}

function voiceFlowLogs() {
  if (!fs.existsSync(logDir)) return []
  return fs
    .readdirSync(logDir)
    .filter((name) => /^voice-flow-\d{8}\.jsonl$/.test(name))
    .map((name) => {
      const filePath = path.join(logDir, name)
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

function parseJsonl(filePath) {
  const events = []
  const parseErrors = []
  if (!fs.existsSync(filePath)) return { events, parseErrors }
  const lines = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
  for (const [index, line] of lines.entries()) {
    try {
      events.push({ ...JSON.parse(line), __file: filePath, __line: index + 1 })
    } catch (error) {
      parseErrors.push({
        file: filePath,
        line: index + 1,
        error: String(error?.message ?? error).slice(0, 200)
      })
    }
  }
  return { events, parseErrors }
}

function eventTimeMs(event) {
  const raw = typeof event.ts === 'string' ? event.ts : typeof event.generated_at === 'string' ? event.generated_at : undefined
  const ms = raw ? Date.parse(raw) : NaN
  return Number.isFinite(ms) ? ms : 0
}

function latest(events, predicate) {
  return events.filter(predicate).sort((a, b) => eventTimeMs(b) - eventTimeMs(a))[0]
}

function count(events, predicate) {
  return events.filter(predicate).length
}

function buildRuntimeProbeWindows(events) {
  const windows = []
  const activeByProbe = new Map()
  const sortedEvents = [...events].sort((a, b) => eventTimeMs(a) - eventTimeMs(b))

  for (const event of sortedEvents) {
    const probe = event.runtime_probe
    const timeMs = eventTimeMs(event)
    if (!probe || !timeMs) continue

    const eventName = String(event.event ?? '')
    const isProbeStart = eventName.includes('_probe_start') && !eventName.includes('_attempt_')
    const isProbeEnd =
      (eventName.includes('_probe_complete') && !eventName.includes('_attempt_')) || eventName.includes('_probe_observed')

    if (isProbeStart && !activeByProbe.has(probe)) {
      activeByProbe.set(probe, { probe, startMs: Math.max(0, timeMs - 1500), endMs: timeMs + 60_000 })
    }

    const activeWindow = activeByProbe.get(probe)
    if (activeWindow) activeWindow.endMs = Math.max(activeWindow.endMs, timeMs + 1500)

    if (isProbeEnd && activeWindow) {
      windows.push({ ...activeWindow, endMs: timeMs + 1500 })
      activeByProbe.delete(probe)
    }
  }

  for (const activeWindow of activeByProbe.values()) {
    windows.push(activeWindow)
  }

  return windows
}

function isRuntimeProbeEvent(event, runtimeProbeWindows) {
  if (event.marker_probe === true || event.runtime_probe) return true
  const timeMs = eventTimeMs(event)
  if (!timeMs) return false
  return runtimeProbeWindows.some((window) => timeMs >= window.startMs && timeMs <= window.endMs)
}

function compact(event) {
  if (!event) return undefined
  return {
    event: event.event,
    type: event.type,
    ts: event.ts ?? event.generated_at,
    session_id: event.session_id,
    adapter_id: event.adapter_id,
    selected_adapter: event.selected_adapter,
    source: event.source,
    status: event.status,
    success: event.success,
    latency_ms: event.latency_ms,
    transcript_length: event.transcript_length,
    sample_count: event.sample_count,
    chunk_count: event.chunk_count,
    audio_rms: event.audio_rms,
    audio_peak: event.audio_peak,
    audio_dbfs: event.audio_dbfs,
    non_silent_ratio: event.non_silent_ratio,
    voice_detected: event.voice_detected,
    voice_ms: event.voice_ms,
    recorded_ms: event.recorded_ms,
    peak_rms: event.peak_rms,
    peak_level: event.peak_level,
    fallback_reason: event.fallback_reason,
    marker_probe: event.marker_probe === true,
    runtime_probe: event.runtime_probe,
    runtime_fix_marker: event.runtime_fix_marker,
    tts_spoken_budget_marker: event.tts_spoken_budget_marker,
    default_stt_adapter: event.default_stt_adapter,
    default_voice_output_mode: event.default_voice_output_mode,
    reason: event.reason,
    file: event.__file,
    line: event.__line
  }
}

function statusFrom(ok, partial) {
  if (ok) return 'proved'
  if (partial) return 'partial'
  return 'missing'
}

function requirement(id, label, status, evidence, missing = []) {
  return { id, label, status, evidence, missing }
}

function summarizeRequirementForConsole(item) {
  const evidence = item.evidence || {}
  const base = {
    id: item.id,
    status: item.status,
    missing_count: item.missing.length,
    missing: item.missing.slice(0, 5)
  }

  if (item.id === 'real_gui_runtime') {
    return {
      ...base,
      latest_marker_ts: evidence.marker?.ts,
      runtime_fix_marker: evidence.marker?.runtime_fix_marker,
      tts_budget_marker: evidence.marker?.tts_spoken_budget_marker
    }
  }

  if (item.id === 'cloud_stt_stability') {
    return {
      ...base,
      source_ready: evidence.source_ready,
      remote_source_ready: evidence.remote_source_ready,
      remote_config_ready: evidence.remote_config_preflight?.ready_for_remote_probe,
      remote_config_missing: evidence.remote_config_preflight?.missing || [],
      remote_next_action: evidence.remote_config_preflight?.next_action,
      current_remote_health_ready: evidence.remote_health_ready,
      current_remote_successes: evidence.remote_successes,
      current_cloud_successes: evidence.successes,
      historical_cloud_failures: evidence.historical_failures,
      historical_remote_failures: evidence.historical_remote_failures,
      controlled_remote_probe_passed: evidence.controlled_remote_probe_passed
    }
  }

  if (item.id === 'dialogue_input_queue') {
    return {
      ...base,
      queued: evidence.queued,
      dequeued: evidence.dequeued,
      latest_queue_ts: evidence.latest_queue?.ts,
      latest_dequeue_ts: evidence.latest_dequeue?.ts
    }
  }

  if (item.id === 'continuous_listening_w3') {
    return {
      ...base,
      source_ready: evidence.source_ready,
      formal_loop_source_ready: evidence.formal_loop_source_ready,
      controlled_probe_passed: evidence.controlled_probe_passed,
      controlled_two_turn_probe_passed: evidence.controlled_continuous_two_turn_probe_passed,
      controlled_two_turn_count: evidence.controlled_continuous_two_turn_turns,
      real_wake_detected: Boolean(evidence.wake_detected),
      real_formal_loop_resume: Boolean(evidence.continuous_loop_resume)
    }
  }

  if (item.id === 'tts_during_input') {
    return {
      ...base,
      queued_during_tts: evidence.queued_during_tts,
      interrupt_or_stale_skip_events: evidence.interrupt_or_stale_skip_events,
      controlled_probe_seen: Boolean(evidence.controlled_probe)
    }
  }

  if (item.id === 'local_whisper_persistent_service') {
    return {
      ...base,
      health_status: evidence.health?.status,
      health_latency_ms: evidence.health?.latency_ms,
      recording_seen: Boolean(evidence.recording),
      main_complete_seen: Boolean(evidence.main_complete),
      renderer_result_seen: Boolean(evidence.renderer_result),
      retest_result: evidence.retest_readiness?.result
    }
  }

  if (item.id === 'dialogue_state_context') {
    return {
      ...base,
      source_ready: evidence.source_ready,
      runtime_status_snapshot_seen: Boolean(evidence.runtime_status_snapshot_ref),
      runtime_status_snapshot_ts: evidence.runtime_status_snapshot_ref?.ts
    }
  }

  if (item.id === 'xiaozhi_style_logic') {
    return {
      ...base,
      source_ready: evidence.source_ready,
      observed_types: evidence.observed_types || [],
      missing_types: evidence.missing_types || []
    }
  }

  return base
}

function firstPresent(candidates) {
  for (const candidate of candidates) {
    const value = process.env[candidate]
    if (typeof value === 'string' && value.trim()) return { name: candidate, value: value.trim() }
  }
  return { name: undefined, value: '' }
}

function fromRaw(raw, keys) {
  for (const key of keys) {
    const value = raw?.[key]
    if (typeof value === 'string' && value.trim()) {
      return { name: `settings.chatProvider.config.statusDialogueStt.${key}`, value: value.trim() }
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return { name: `settings.chatProvider.config.statusDialogueStt.${key}`, value: String(value) }
    }
  }
  return { name: undefined, value: '' }
}

function fromProviderConfig(raw, keys) {
  for (const key of keys) {
    const value = raw?.[key]
    if (typeof value === 'string' && value.trim()) {
      return { name: `settings.chatProvider.config.${key}`, value: value.trim() }
    }
  }
  return { name: undefined, value: '' }
}

function firstPresentWithRaw(envCandidates, raw, rawKeys, providerRaw, providerKeys = []) {
  const envValue = firstPresent(envCandidates)
  if (envValue.name) return envValue
  const sttValue = fromRaw(raw, rawKeys)
  if (sttValue.name) return sttValue
  return fromProviderConfig(providerRaw, providerKeys)
}

function readSettingsStatusDialogueStt() {
  if (!settingsPath || !fs.existsSync(settingsPath)) {
    return { path: settingsPath || undefined, found: false, raw: {} }
  }
  try {
    const settingsText = fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, '')
    const settings = JSON.parse(settingsText)
    const providerConfig =
      settings?.chatProvider?.config && typeof settings.chatProvider.config === 'object'
        ? settings.chatProvider.config
        : {}
    const raw =
      providerConfig.statusDialogueStt && typeof providerConfig.statusDialogueStt === 'object'
        ? providerConfig.statusDialogueStt
        : providerConfig.status_dialogue_stt && typeof providerConfig.status_dialogue_stt === 'object'
          ? providerConfig.status_dialogue_stt
          : {}
    return { path: settingsPath, found: true, raw, provider_config: providerConfig }
  } catch (error) {
    return {
      path: settingsPath,
      found: true,
      error: String(error?.message ?? error).slice(0, 240),
      raw: {}
    }
  }
}

function readRemoteSttEnabled(raw) {
  const envValue = firstPresent([
    'SIGHTFLOW_STATUS_DIALOGUE_STT_REMOTE_ENABLED',
    'STATUS_DIALOGUE_STT_REMOTE_ENABLED',
    'OPENAI_STT_REMOTE_ENABLED'
  ])
  if (envValue.name) {
    const normalized = envValue.value.toLowerCase()
    return {
      configured: true,
      enabled: normalized === '1' || normalized === 'true',
      source: envValue.name
    }
  }
  if (typeof raw?.enabled === 'boolean') {
    return {
      configured: true,
      enabled: raw.enabled === true,
      source: 'settings.chatProvider.config.statusDialogueStt.enabled'
    }
  }
  return { configured: false, enabled: false, source: undefined }
}

function hostOf(value) {
  if (!value) return 'not_configured'
  try {
    return new URL(value).host || 'invalid_url'
  } catch {
    return 'invalid_url'
  }
}

function hostsMatch(left, right) {
  const leftHost = hostOf(left)
  const rightHost = hostOf(right)
  return Boolean(leftHost && rightHost && leftHost !== 'not_configured' && rightHost !== 'not_configured' && leftHost === rightHost)
}

function normalizeProvider(value) {
  const text = String(value || '').trim().toLowerCase()
  if (text === 'cloudflare' || text === 'cloudflare_workers_ai' || text === 'workers_ai') return 'cloudflare_workers_ai'
  return 'openai_compatible_remote'
}

function redacted(value) {
  if (!value) return undefined
  return {
    present: true,
    length: value.length,
    preview: `${value.slice(0, 3)}...${value.slice(-2)}`
  }
}

function buildRemoteSttConfigPreflight() {
  const settings = readSettingsStatusDialogueStt()
  const raw = settings.raw || {}
  const providerConfig = settings.provider_config || {}
  const enabled = readRemoteSttEnabled(raw)
  const rawProviderValue = fromRaw(raw, ['provider', 'adapter', 'adapter_id'])
  const providerValue = firstPresent(['SIGHTFLOW_STATUS_DIALOGUE_STT_PROVIDER', 'STATUS_DIALOGUE_STT_PROVIDER'])
  const provider = normalizeProvider(providerValue.value || rawProviderValue.value)
  const rawProvider = normalizeProvider(rawProviderValue.value)
  const providerChangedByEnv = Boolean(providerValue.name) && provider !== rawProvider
  const accountId = firstPresentWithRaw(
    [
      'SIGHTFLOW_STATUS_DIALOGUE_STT_CLOUDFLARE_ACCOUNT_ID',
      'STATUS_DIALOGUE_STT_CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_ACCOUNT_ID'
    ],
    raw,
    ['account_id', 'accountId', 'cloudflare_account_id', 'cloudflareAccountId']
  )
  const explicitApiKey = firstPresentWithRaw(
    [
      'SIGHTFLOW_STATUS_DIALOGUE_STT_API_KEY',
      'STATUS_DIALOGUE_STT_API_KEY',
      'OPENAI_STT_API_KEY',
      'OPENAI_API_KEY',
      'CLOUDFLARE_API_TOKEN'
    ],
    raw,
    ['api_key', 'apiKey']
  )
  const explicitBaseUrl = firstPresentWithRaw(
    ['SIGHTFLOW_STATUS_DIALOGUE_STT_BASE_URL', 'STATUS_DIALOGUE_STT_BASE_URL', 'OPENAI_STT_BASE_URL', 'OPENAI_BASE_URL'],
    providerChangedByEnv ? {} : raw,
    ['base_url', 'baseURL']
  )
  const providerApiKey = fromProviderConfig(providerConfig, ['apiKey'])
  const providerBaseUrl = fromProviderConfig(providerConfig, ['baseURL'])
  const providerApiKeyFallbackAllowed =
    provider !== 'cloudflare_workers_ai' &&
    Boolean(providerApiKey.name) &&
    (!explicitBaseUrl.value || hostsMatch(explicitBaseUrl.value, providerBaseUrl.value))
  const apiKey = explicitApiKey.name
    ? explicitApiKey
    : providerApiKeyFallbackAllowed
      ? providerApiKey
      : { name: undefined, value: '' }
  const baseUrl = explicitBaseUrl.name
    ? explicitBaseUrl
    : provider === 'cloudflare_workers_ai'
      ? { name: 'provider_default.cloudflare_workers_ai.baseURL', value: 'https://api.cloudflare.com/client/v4' }
      : providerBaseUrl
  const endpoint = firstPresentWithRaw(
    [
      'SIGHTFLOW_STATUS_DIALOGUE_STT_ENDPOINT',
      'STATUS_DIALOGUE_STT_ENDPOINT',
      'OPENAI_AUDIO_TRANSCRIPTIONS_ENDPOINT',
      'OPENAI_STT_ENDPOINT'
    ],
    providerChangedByEnv ? {} : raw,
    ['endpoint_path', 'endpointPath']
  )
  const model = firstPresentWithRaw(
    ['SIGHTFLOW_STATUS_DIALOGUE_STT_MODEL', 'STATUS_DIALOGUE_STT_MODEL', 'OPENAI_STT_MODEL', 'OPENAI_AUDIO_MODEL'],
    providerChangedByEnv ? {} : raw,
    ['model']
  )
  const modelValue = model.value || (provider === 'cloudflare_workers_ai' ? '@cf/openai/whisper-large-v3-turbo' : 'whisper-1')
  const endpointValue =
    endpoint.value ||
    (provider === 'cloudflare_workers_ai' && accountId.value
      ? `/accounts/${accountId.value}/ai/run/${modelValue}`
      : provider === 'cloudflare_workers_ai'
        ? '/accounts/<account_id>/ai/run/@cf/openai/whisper-large-v3-turbo'
        : '/audio/transcriptions')
  const endpointHost = /^https?:\/\//i.test(endpointValue) ? hostOf(endpointValue) : undefined
  const hasBaseUrl = Boolean(baseUrl.value || endpointHost)
  const hasProviderRequiredFields =
    provider === 'cloudflare_workers_ai' ? Boolean(apiKey.value && hasBaseUrl && accountId.value) : Boolean(apiKey.value && hasBaseUrl)
  const providerApiKeyFallbackBlocked =
    Boolean(providerApiKey.name) && !explicitApiKey.name && !providerApiKeyFallbackAllowed
  const missing = []
  if (!enabled.configured) missing.push('remote_stt_enable_flag')
  if (enabled.configured && !enabled.enabled) missing.push('remote_stt_enabled_true')
  if (!apiKey.value) missing.push('remote_stt_api_key')
  if (!hasBaseUrl) missing.push('remote_stt_base_url_or_full_endpoint')
  if (provider === 'cloudflare_workers_ai' && !accountId.value) missing.push('remote_stt_cloudflare_account_id')
  const readyForRemoteProbe = enabled.enabled && hasProviderRequiredFields
  return {
    schema: 'status_dialogue_remote_stt_config_preflight.v1',
    ready_for_remote_probe: readyForRemoteProbe,
    boundary: 'read-only config preflight embedded in goal audit; no audio upload; no network request; api keys are redacted',
    settings: {
      path: settings.path,
      found: settings.found,
      error: settings.error,
      status_dialogue_stt_keys: Object.keys(raw)
    },
    sources: {
      enabled: enabled.source,
      provider: providerValue.name || rawProviderValue.name,
      api_key: apiKey.name,
      cloudflare_account_id: accountId.name,
      base_url: baseUrl.name,
      endpoint: endpoint.name,
      model: model.name,
      provider_api_key_fallback_blocked: providerApiKeyFallbackBlocked
        ? 'chatProvider.config.apiKey host does not match statusDialogueStt.baseURL'
        : undefined
    },
    config: {
      provider,
      enabled: enabled.enabled,
      api_key: redacted(apiKey.value),
      cloudflare_account_id_configured: Boolean(accountId.value),
      base_url_host: hostOf(baseUrl.value),
      endpoint_path_or_url: endpointValue,
      endpoint_host: endpointHost,
      model: modelValue
    },
    missing,
    next_action: readyForRemoteProbe
      ? 'run_voice_runtime_flow_probe_remote_stt_configured'
      : missing.includes('remote_stt_enable_flag') && missing.includes('remote_stt_api_key') && missing.includes('remote_stt_base_url_or_full_endpoint')
        ? 'apply_nonsecret_defaults_then_set_remote_stt_api_key'
      : missing.includes('remote_stt_enable_flag') || missing.includes('remote_stt_enabled_true')
        ? 'set_remote_stt_enable_flag'
        : missing.includes('remote_stt_cloudflare_account_id')
          ? 'set_cloudflare_account_id_and_api_token'
        : missing.includes('remote_stt_api_key')
          ? 'set_remote_stt_api_key'
          : 'set_remote_stt_base_url_or_full_endpoint'
  }
}

function isSttSuccess(event) {
  if (event.event === 'local_stt_transcribe_result' || event.event === 'local_stt_complete') {
    return event.success === true && Number(event.transcript_length ?? 0) > 0
  }
  if (event.event === 'remote_stt_complete' || event.event === 'chrome_stt_complete') {
    return event.success === true && Number(event.transcript_length ?? 0) > 0
  }
  return false
}

function isSttFailure(event) {
  if (['local_stt_failed', 'local_stt_recording_failed', 'chrome_stt_failure'].includes(event.event)) return true
  if (['local_stt_complete', 'local_stt_transcribe_result', 'remote_stt_complete', 'chrome_stt_complete'].includes(event.event)) {
    return event.success === false
  }
  return false
}

function isSlowTtsQueue(event) {
  return (
    Number(event.end_to_end_ms ?? 0) >= slowTtsQueueThresholds.end_to_end_ms ||
    Number(event.total_tts_ms ?? 0) >= slowTtsQueueThresholds.total_tts_ms ||
    Number(event.total_playback_ms ?? 0) >= slowTtsQueueThresholds.total_playback_ms
  )
}

function buildVoiceTurnRecords(sttStartEvents, actionEvents) {
  const sortedStarts = [...sttStartEvents].sort((a, b) => eventTimeMs(a) - eventTimeMs(b))
  return sortedStarts.map((startEvent, index) => {
    const startMs = eventTimeMs(startEvent)
    const nextStartMs = sortedStarts[index + 1] ? eventTimeMs(sortedStarts[index + 1]) : Number.POSITIVE_INFINITY
    const turnEvents = actionEvents.filter((event) => {
      const timeMs = eventTimeMs(event)
      return timeMs >= startMs && timeMs < nextStartMs
    })
    const sttSuccesses = turnEvents.filter(isSttSuccess)
    const sttFailures = turnEvents.filter(isSttFailure)
    const dialogueEvents = turnEvents.filter((event) =>
      ['dialogue_input_dequeued', 'dialogue_input_dequeued_after_tts_complete', 'model_stream_delta_received'].includes(event.event) ||
      String(event.source ?? '').includes('fallback')
    )
    const ttsQueues = turnEvents.filter((event) => event.event === 'tts_queue_complete')
    const ttsFailures = turnEvents.filter((event) =>
      ['tts_stream_failed', 'tts_chunk_synthesis_error'].includes(event.event)
    )
    const slowTtsQueues = ttsQueues.filter(isSlowTtsQueue)
    const xiaozhiEvents = turnEvents.filter((event) => event.event === 'xiaozhi_style_voice_bridge_event')
    const complete =
      sttSuccesses.length > 0 &&
      dialogueEvents.length > 0 &&
      ttsQueues.length > 0 &&
      sttFailures.length === 0 &&
      ttsFailures.length === 0 &&
      slowTtsQueues.length === 0

    return {
      index: index + 1,
      start: compact(startEvent),
      stt_success: compact(sttSuccesses.at(-1)),
      stt_failure: compact(sttFailures.at(-1)),
      dialogue: compact(dialogueEvents.at(-1)),
      tts_queue: compact(ttsQueues.at(-1)),
      tts_failure: compact(ttsFailures.at(-1)),
      slow_tts_queue: compact(slowTtsQueues.at(-1)),
      xiaozhi_types: Array.from(new Set(xiaozhiEvents.map((event) => event.type).filter(Boolean))).sort(),
      complete,
      checks: {
        stt_success: sttSuccesses.length > 0,
        no_stt_failure: sttFailures.length === 0,
        dialogue_chain: dialogueEvents.length > 0,
        tts_queue_complete: ttsQueues.length > 0,
        no_tts_failure: ttsFailures.length === 0,
        no_slow_tts_queue: slowTtsQueues.length === 0,
        xiaozhi_events: xiaozhiEvents.length > 0
      }
    }
  })
}

function main() {
  const renderer = read(rendererPath)
  const mainSource = read(mainPath)
  const packageSource = read(packagePath)
  const continuousLoopWaitSource = read(continuousLoopWaitPath)
  const parsedLogs = voiceFlowLogs()
    .slice(0, 3)
    .map((log) => ({ filePath: log.filePath, parsed: parseJsonl(log.filePath) }))
  const parseErrors = parsedLogs.flatMap((entry) => entry.parsed.parseErrors)
  const events = parsedLogs.flatMap((entry) => entry.parsed.events)
  const runtimeProbeWindows = buildRuntimeProbeWindows(events)
  const realEvents = events.filter((event) => !isRuntimeProbeEvent(event, runtimeProbeWindows))
  const ttsInputEvidenceEvents = events.filter(
    (event) => !isRuntimeProbeEvent(event, runtimeProbeWindows) || event.runtime_probe === 'tts_input_interrupt'
  )

  const realMarker = latest(
    realEvents,
    (event) => event.event === 'status_dialogue_ui_runtime_loaded' && event.runtime_fix_marker === 'stt-local-observability-2026-06-29-v3'
  )
  const latestRealMarkerMs = realMarker ? eventTimeMs(realMarker) : 0
  const currentRuntimeEvents = latestRealMarkerMs > 0 ? realEvents.filter((event) => eventTimeMs(event) >= latestRealMarkerMs) : realEvents
  const realTtsBudgetMarker = latest(
    realEvents,
    (event) =>
      event.event === 'status_dialogue_ui_runtime_loaded' &&
      event.tts_spoken_budget_marker === expectedTtsBudgetRuntimeMarker
  )
  const latestRealTtsBudgetMarkerMs = realTtsBudgetMarker ? eventTimeMs(realTtsBudgetMarker) : 0
  const currentTtsBudgetEvents =
    latestRealTtsBudgetMarkerMs > 0 ? realEvents.filter((event) => eventTimeMs(event) >= latestRealTtsBudgetMarkerMs) : currentRuntimeEvents
  const remoteSttConfigPreflight = buildRemoteSttConfigPreflight()
  const controlledCloudProbeEvents = events.filter(
    (event) => event.marker_probe !== true && event.runtime_probe === 'cloud_stt_fake_audio'
  )
  const controlledRemoteProbeEvents = events.filter(
    (event) => event.marker_probe !== true && event.runtime_probe === 'remote_stt_configured'
  )
  const cloudSttSourceReady =
    renderer.includes("logStatusDialogueVoiceEvent('cloud_stt_failure_classified'") &&
    renderer.includes("logStatusDialogueVoiceEvent('cloud_stt_retry_one_shot'") &&
    renderer.includes("startChromeSpeechBridgeTranscription({ retry: true })")
  const cloudStarts = count(currentRuntimeEvents, (event) => event.event === 'chrome_stt_start')
  const cloudCompletes = currentRuntimeEvents.filter((event) => event.event === 'chrome_stt_complete')
  const cloudSuccesses = cloudCompletes.filter((event) => event.success === true)
  const cloudFailures = cloudCompletes.filter((event) => event.success !== true)
  const cloudClassifiedFailures = count(currentRuntimeEvents, (event) => event.event === 'cloud_stt_failure_classified')
  const cloudDegradedEvents = currentRuntimeEvents.filter((event) => event.event === 'cloud_stt_degraded_to_local')
  const slowCloudCompletes = cloudCompletes.filter((event) => Number(event.latency_ms ?? 0) > 8000)
  const historicalCloudCompletes = realEvents.filter((event) => event.event === 'chrome_stt_complete')
  const historicalSlowCloudCompletes = historicalCloudCompletes.filter((event) => Number(event.latency_ms ?? 0) > 8000)
  const historicalCloudFailures = historicalCloudCompletes.filter((event) => event.success !== true)
  const historicalCloudDegradedEvents = realEvents.filter((event) => event.event === 'cloud_stt_degraded_to_local')
  const controlledCloudCompletes = controlledCloudProbeEvents.filter((event) => event.event === 'chrome_stt_complete')
  const controlledCloudSuccesses = controlledCloudCompletes.filter(
    (event) => event.success === true && Number(event.transcript_length ?? 0) > 0
  )
  const controlledCloudFailures = controlledCloudCompletes.filter((event) => event.success !== true)
  const controlledCloudDegradedEvents = controlledCloudProbeEvents.filter((event) => event.event === 'cloud_stt_degraded_to_local')
  const controlledCloudProbeComplete = latest(
    controlledCloudProbeEvents,
    (event) => event.event === 'status_dialogue_cloud_stt_fake_audio_probe_complete'
  )
  const controlledCloudProbePassed = Boolean(controlledCloudSuccesses.length > 0 && controlledCloudProbeComplete?.success === true)
  const controlledRemoteHealthEvents = controlledRemoteProbeEvents.filter((event) => event.event === 'remote_stt_health_check')
  const controlledRemoteHealthReady = controlledRemoteHealthEvents.filter(
    (event) => event.status === 'ready' && event.reachable === true
  )
  const controlledRemoteCompletes = controlledRemoteProbeEvents.filter((event) => event.event === 'remote_stt_complete')
  const controlledRemoteSuccesses = controlledRemoteCompletes.filter(
    (event) => event.success === true && Number(event.transcript_length ?? 0) > 0
  )
  const controlledRemoteFailures = controlledRemoteCompletes.filter((event) => event.success !== true)
  const controlledRemoteProbeComplete = latest(
    controlledRemoteProbeEvents,
    (event) => event.event === 'status_dialogue_remote_stt_configured_probe_complete'
  )
  const controlledRemoteProbePassed = Boolean(
    controlledRemoteSuccesses.length > 0 && controlledRemoteProbeComplete?.success === true
  )
  const remoteSttSourceReady =
    mainSource.includes('runOpenAiCompatibleSttTranscription') &&
    mainSource.includes('runStatusDialogueRemoteSttHealth') &&
    mainSource.includes('runStatusDialogueRemoteSttConfiguredProbe') &&
    mainSource.includes("ipcMain.handle('zhineng:status-dialogue:stt:remote-health'") &&
    mainSource.includes("ipcMain.handle('zhineng:status-dialogue:stt:remote-configured-probe'") &&
    renderer.includes("transcriptionAdapterId: 'openai_compatible_stt'") &&
    renderer.includes('requestStatusDialogueRemoteSttHealth') &&
    renderer.includes("'remote_stt_configured'") &&
    packageSource.includes('voice:runtime-flow:probe-remote-stt-configured')
  const currentRemoteHealthEvents = currentRuntimeEvents.filter((event) => event.event === 'remote_stt_health_check')
  const currentRemoteStarts = currentRuntimeEvents.filter((event) => event.event === 'remote_stt_start')
  const currentRemoteCompletes = currentRuntimeEvents.filter((event) => event.event === 'remote_stt_complete')
  const currentRemoteSuccesses = currentRemoteCompletes.filter((event) => event.success === true && Number(event.transcript_length ?? 0) > 0)
  const currentRemoteFailures = currentRemoteCompletes.filter((event) => event.success !== true)
  const currentRemoteHealthReady = currentRemoteHealthEvents.filter((event) => event.status === 'ready' && event.reachable === true)
  const historicalRemoteCompletes = realEvents.filter((event) => event.event === 'remote_stt_complete')
  const historicalRemoteSuccesses = historicalRemoteCompletes.filter(
    (event) => event.success === true && Number(event.transcript_length ?? 0) > 0
  )
  const historicalRemoteFailures = historicalRemoteCompletes.filter((event) => event.success !== true)
  const cloudOrRemoteSttSourceReady = cloudSttSourceReady || remoteSttSourceReady
  const currentCloudOrRemoteSuccess =
    (cloudCompletes.length > 0 && slowCloudCompletes.length === 0 && cloudFailures.length === 0) ||
    (currentRemoteSuccesses.length > 0 && currentRemoteFailures.length === 0)

  const queueEvents = realEvents.filter((event) => event.event === 'stt_input_queued' || event.event === 'dialogue_input_queued')
  const dequeueEvents = realEvents.filter((event) => event.event === 'dialogue_input_dequeued' || event.event === 'dialogue_input_dequeued_after_tts_complete')
  const ttsQueueEvents = ttsInputEvidenceEvents.filter((event) => event.event === 'stt_input_queued' || event.event === 'dialogue_input_queued')
  const ttsQueuedInput = ttsQueueEvents.filter(
    (event) => event.reason === 'tts_playback_active' || event.queued_during_tts === true || event.reason === 'dialogue_busy_tts_interrupted'
  )
  const bargeInEvents = ttsInputEvidenceEvents.filter(
    (event) =>
      event.event === 'dialogue_input_barge_in' ||
      event.event === 'voice_playback_interrupted_for_formal_input' ||
      event.event === 'tts_queue_interrupted' ||
      event.event === 'tts_chunk_skipped_stale_after_synthesis'
  )
  const controlledTtsInputProbe = latest(events, (event) => event.event === 'status_dialogue_tts_input_interrupt_probe_complete')

  const localHealth = latest(
    realEvents,
    (event) => event.event === 'local_stt_health_check' && event.adapter_id === 'local_whisper_persistent_service'
  )
  const localAdapterEvent = latest(
    realEvents,
    (event) =>
      event.event === 'stt_adapter_runtime_selected' &&
      (event.selected_adapter === 'local' || event.source === 'local_whisper_persistent_service')
  )
  const currentLocalSttStartRequest = latest(
    currentRuntimeEvents,
    (event) => event.event === 'stt_start_requested' && event.selected_adapter === 'local'
  )
  const currentAnySttStartRequest = latest(currentRuntimeEvents, (event) => event.event === 'stt_start_requested')
  const currentRecordingFailure = latest(
    currentRuntimeEvents,
    (event) => event.event === 'local_stt_recording_failed' && event.adapter_id === 'local_whisper_persistent_service'
  )
  const currentTranscriptionFailure = latest(currentRuntimeEvents, (event) => event.event === 'local_stt_failed')
  const currentSilenceDetected = latest(
    currentRuntimeEvents,
    (event) => event.event === 'local_stt_silence_detected' && event.adapter_id === 'local_whisper_persistent_service'
  )
  const currentLocalCompleteFailure = latest(
    currentRuntimeEvents,
    (event) =>
      event.event === 'local_stt_complete' &&
      event.adapter_id === 'local_whisper_persistent_service' &&
      event.success !== true
  )
  const currentRendererResultFailure = latest(
    currentRuntimeEvents,
    (event) =>
      event.event === 'local_stt_transcribe_result' &&
      event.adapter_id === 'local_whisper_persistent_service' &&
      event.success !== true
  )
  const localRecording = latest(
    realEvents,
    (event) => event.event === 'local_stt_recording_started' && event.adapter_id === 'local_whisper_persistent_service'
  )
  const localComplete = latest(
    realEvents,
    (event) =>
      event.event === 'local_stt_complete' &&
      event.adapter_id === 'local_whisper_persistent_service' &&
      event.success === true &&
      Number(event.transcript_length ?? 0) > 0
  )
  const localRendererResult = latest(
    realEvents,
    (event) =>
      event.event === 'local_stt_transcribe_result' &&
      event.adapter_id === 'local_whisper_persistent_service' &&
      event.success === true &&
      Number(event.transcript_length ?? 0) > 0
  )
  const localSttCompletionProof = Boolean(localHealth && localComplete && localRendererResult)
  const currentLocalEmptyOrFailedTranscription = Boolean(
    currentTranscriptionFailure || currentLocalCompleteFailure || currentRendererResultFailure || currentSilenceDetected
  )
  const localRetestReadyForOperator =
    Boolean(realMarker) &&
    Boolean(localAdapterEvent) &&
    localHealth?.status === 'ready' &&
    localHealth?.reachable === true &&
    !localSttCompletionProof &&
    (!currentAnySttStartRequest || currentLocalEmptyOrFailedTranscription)
  const localRetestNextAction = (() => {
    if (localSttCompletionProof) return 'local_stt_transcription_already_proved'
    if (!realMarker) return 'restart_real_gui_and_wait_for_non_probe_runtime_marker'
    if (!localAdapterEvent) return 'select_local_stt_adapter_or_restart_real_gui'
    if (localHealth?.status !== 'ready' || localHealth?.reachable !== true) return 'start_or_fix_local_whisper_persistent_service'
    if (!currentAnySttStartRequest) return 'click_right_bottom_electron_gui_stt_and_speak_one_complete_chinese_sentence'
    if (!currentLocalSttStartRequest) return 'stt_request_seen_but_not_routed_to_local'
    if (currentRecordingFailure) return 'fix_microphone_permission_or_input_device'
    if (currentSilenceDetected) return 'retry_right_bottom_gui_stt_after_mic_local_is_recording_and_speak_audibly'
    if (currentTranscriptionFailure || currentLocalCompleteFailure || currentRendererResultFailure)
      return 'retry_right_bottom_gui_stt_with_audible_speech_or_inspect_empty_transcript'
    return 'continue_from_current_local_stt_runtime_evidence'
  })()
  const localRetestReadiness = {
    schema: 'status_dialogue_goal_manual_retest_readiness.v1',
    scope: 'local_whisper_persistent_service_real_microphone_retest',
    ready_for_operator_action: localRetestReadyForOperator,
    completion_proof: localSttCompletionProof,
    result: localSttCompletionProof
      ? 'local_stt_transcription_already_proved'
      : localRetestReadyForOperator
        ? 'ready_for_operator_stt_test'
        : localRetestNextAction,
    next_action: localRetestNextAction,
    boundary:
      'readiness only; this does not prove microphone recording, local transcription, W3 handoff, TTS interruption, or cloud STT current-window stability',
    evidence: {
      real_marker: compact(realMarker),
      adapter_event: compact(localAdapterEvent),
      health: compact(localHealth),
      current_stt_start_request: compact(currentAnySttStartRequest),
      current_local_stt_start_request: compact(currentLocalSttStartRequest),
      current_recording_failure: compact(currentRecordingFailure),
      current_silence_detected: compact(currentSilenceDetected),
      current_transcription_failure: compact(currentTranscriptionFailure),
      current_local_complete_failure: compact(currentLocalCompleteFailure),
      current_renderer_result_failure: compact(currentRendererResultFailure)
    }
  }
  const realVoiceTurnMinTurns = 2
  const realTurnSttStarts = currentTtsBudgetEvents.filter((event) => event.event === 'stt_start_requested')
  const realTurnSttSuccesses = currentTtsBudgetEvents.filter(isSttSuccess)
  const realTurnSttFailures = currentTtsBudgetEvents.filter(isSttFailure)
  const realTurnDialogueEvents = currentTtsBudgetEvents.filter((event) =>
    ['dialogue_input_dequeued', 'dialogue_input_dequeued_after_tts_complete', 'model_stream_delta_received'].includes(event.event)
  )
  const realTurnTtsQueues = currentTtsBudgetEvents.filter((event) => event.event === 'tts_queue_complete')
  const realTurnTtsFailures = currentTtsBudgetEvents.filter((event) =>
    ['tts_stream_failed', 'tts_chunk_synthesis_error'].includes(event.event)
  )
  const realTurnSlowTtsQueues = realTurnTtsQueues.filter(isSlowTtsQueue)
  const realTurnXiaozhiEvents = currentTtsBudgetEvents.filter((event) => event.event === 'xiaozhi_style_voice_bridge_event')
  const realTurnRecords = buildVoiceTurnRecords(realTurnSttStarts, currentTtsBudgetEvents)
  const realTurnSttSuccessTurnCount = realTurnRecords.filter((turn) => turn.checks.stt_success).length
  const realTurnDialogueTurnCount = realTurnRecords.filter((turn) => turn.checks.dialogue_chain).length
  const realTurnTtsQueueTurnCount = realTurnRecords.filter((turn) => turn.checks.tts_queue_complete).length
  const realTurnXiaozhiTurnCount = realTurnRecords.filter((turn) => turn.checks.xiaozhi_events).length
  const realTurnPairs = realTurnRecords.map((turn) => ({
    start: turn.start,
    stt: turn.stt_success,
    tts: turn.tts_queue,
    complete: turn.complete,
    slow_tts: Boolean(turn.slow_tts_queue)
  }))
  const realTurnClosedLoopCount = realTurnRecords.filter((turn) => turn.complete).length
  const realVoiceTurnsCompletionProof =
    Boolean(realTtsBudgetMarker) &&
    realTurnSttStarts.length >= realVoiceTurnMinTurns &&
    realTurnSttSuccessTurnCount >= realVoiceTurnMinTurns &&
    realTurnDialogueTurnCount >= realVoiceTurnMinTurns &&
    realTurnTtsQueueTurnCount >= realVoiceTurnMinTurns &&
    realTurnClosedLoopCount >= realVoiceTurnMinTurns &&
    realTurnSttFailures.length === 0 &&
    realTurnTtsFailures.length === 0 &&
    realTurnSlowTtsQueues.length === 0 &&
    realTurnXiaozhiTurnCount >= realVoiceTurnMinTurns
  const realVoiceTurnsReadyForOperator =
    Boolean(realMarker) &&
    Boolean(realTtsBudgetMarker) &&
    Boolean(localAdapterEvent || localHealth) &&
    !realVoiceTurnsCompletionProof &&
    realTurnSttStarts.length < realVoiceTurnMinTurns &&
    realTurnSttFailures.length === 0 &&
    realTurnTtsFailures.length === 0 &&
    realTurnSlowTtsQueues.length === 0
  const realVoiceTurnsNextAction = (() => {
    if (realVoiceTurnsCompletionProof) return 'real_two_turn_voice_chain_already_proved'
    if (!realMarker) return 'restart_real_gui_and_wait_runtime_marker'
    if (!realTtsBudgetMarker) return 'restart_real_gui_with_tts_budget_marker'
    if (!localAdapterEvent && !localHealth) return 'wait_for_stt_adapter_health_or_restart_gui'
    if (realTurnSttFailures.length > 0) return 'inspect_latest_stt_failure_event_then_retry'
    if (realTurnTtsFailures.length > 0) return 'inspect_latest_tts_failure_event_then_retry'
    if (realTurnSlowTtsQueues.length > 0) return 'inspect_latest_tts_queue_latency_segments'
    if (realTurnSttStarts.length < realVoiceTurnMinTurns) return 'run_two_real_voice_turns_in_right_bottom_gui'
    if (realTurnSttSuccessTurnCount < realVoiceTurnMinTurns) return 'inspect_missing_stt_success_after_real_turns'
    if (realTurnDialogueTurnCount < realVoiceTurnMinTurns) return 'inspect_missing_dialogue_chain_after_stt'
    if (realTurnTtsQueueTurnCount < realVoiceTurnMinTurns) return 'inspect_missing_tts_queue_complete_after_dialogue'
    if (realTurnClosedLoopCount < realVoiceTurnMinTurns) return 'inspect_missing_stt_to_tts_pairing'
    if (realTurnXiaozhiTurnCount < realVoiceTurnMinTurns) return 'inspect_missing_xiaozhi_bridge_events_in_real_turn_window'
    return 'continue_from_real_voice_turn_report'
  })()
  const realVoiceTurnsReadiness = {
    schema: 'status_dialogue_real_voice_turns_preflight.v1',
    scope: 'right_bottom_gui_two_real_voice_turns',
    ready_for_operator_action: realVoiceTurnsReadyForOperator,
    completion_proof: realVoiceTurnsCompletionProof,
    result: realVoiceTurnsCompletionProof
      ? 'real_two_turn_voice_chain_already_proved'
      : realVoiceTurnsReadyForOperator
        ? 'ready_for_operator_real_voice_turns'
        : realVoiceTurnsNextAction,
    next_action: realVoiceTurnsNextAction,
    boundary:
      'readiness only unless completion_proof=true; this does not configure remote STT or write world model',
    evidence: {
      latest_real_marker: compact(realMarker),
      latest_real_tts_budget_marker: compact(realTtsBudgetMarker),
      min_turns: realVoiceTurnMinTurns,
      stt_start_count: realTurnSttStarts.length,
      stt_success_count: realTurnSttSuccesses.length,
      turn_count: realTurnRecords.length,
      turn_stt_success_count: realTurnSttSuccessTurnCount,
      turn_dialogue_chain_count: realTurnDialogueTurnCount,
      turn_tts_queue_count: realTurnTtsQueueTurnCount,
      turn_xiaozhi_event_count: realTurnXiaozhiTurnCount,
      stt_failure_count: realTurnSttFailures.length,
      dialogue_chain_event_count: realTurnDialogueEvents.length,
      tts_queue_complete_count: realTurnTtsQueues.length,
      tts_failure_count: realTurnTtsFailures.length,
      slow_tts_queue_count: realTurnSlowTtsQueues.length,
      closed_loop_turn_count: realTurnClosedLoopCount,
      xiaozhi_event_count: realTurnXiaozhiEvents.length,
      latest_stt_start: compact(realTurnSttStarts.at(-1)),
      latest_stt_success: compact(realTurnSttSuccesses.at(-1)),
      latest_stt_failure: compact(realTurnSttFailures.at(-1)),
      latest_tts_queue: compact(realTurnTtsQueues.at(-1)),
      latest_slow_tts_queue: compact(realTurnSlowTtsQueues.at(-1)),
      voice_turns: realTurnRecords,
      stt_tts_pairs: realTurnPairs
    }
  }

  const w3Detected = latest(realEvents, (event) => event.event === 'w3_wake_detected')
  const w3Handoff = latest(realEvents, (event) => event.event === 'w3_wake_handoff_stt')
  const controlledW3ProbeEvents = events.filter(
    (event) => event.marker_probe !== true && event.runtime_probe === 'w3_wake_handoff'
  )
  const controlledW3Detected = latest(controlledW3ProbeEvents, (event) => event.event === 'w3_wake_detected')
  const controlledW3Handoff = latest(controlledW3ProbeEvents, (event) => event.event === 'w3_wake_handoff_stt')
  const controlledW3ProbeComplete = latest(
    controlledW3ProbeEvents,
    (event) => event.event === 'status_dialogue_w3_wake_handoff_probe_complete'
  )
  const controlledW3ProbePassed = Boolean(controlledW3Detected && controlledW3Handoff && controlledW3ProbeComplete?.success === true)
  const w3SourceReady =
    renderer.includes('recognition.continuous = true') &&
    renderer.includes("logStatusDialogueVoiceEvent('w3_wake_detected'") &&
    renderer.includes("logStatusDialogueVoiceEvent('w3_wake_handoff_stt'") &&
    packageSource.includes('voice:runtime-flow:probe-w3-wake')
  const continuousVoiceEnabled = latest(realEvents, (event) => event.event === 'continuous_voice_session_enabled')
  const continuousVoiceScheduled = latest(realEvents, (event) => event.event === 'continuous_voice_session_resume_scheduled')
  const continuousVoiceResume = latest(realEvents, (event) => event.event === 'continuous_voice_session_resume_stt')
  const continuousVoicePausedError = latest(realEvents, (event) => event.event === 'continuous_voice_session_paused_error')
  const controlledContinuousLoopProbeEvents = events.filter(
    (event) => event.marker_probe !== true && event.runtime_probe === 'continuous_voice_loop'
  )
  const isolatedContinuousLoopProbeEvents = events.filter(
    (event) => event.marker_probe === true && event.runtime_probe === 'continuous_voice_loop'
  )
  const continuousTwoTurnProbeEvents = events.filter(
    (event) => event.runtime_probe === 'continuous_voice_two_turn'
  )
  const controlledContinuousLoopComplete = latest(
    controlledContinuousLoopProbeEvents,
    (event) => event.event === 'status_dialogue_continuous_voice_loop_probe_complete'
  )
  const isolatedContinuousLoopObserved = latest(
    isolatedContinuousLoopProbeEvents,
    (event) => event.event === 'status_dialogue_continuous_voice_loop_probe_observed'
  )
  const continuousTwoTurnComplete = latest(
    continuousTwoTurnProbeEvents,
    (event) => event.event === 'status_dialogue_continuous_voice_two_turn_probe_complete'
  )
  const continuousTwoTurnObserved = latest(
    continuousTwoTurnProbeEvents,
    (event) => event.event === 'status_dialogue_continuous_voice_two_turn_probe_observed'
  )
  const continuousTwoTurnTurnCount = continuousTwoTurnProbeEvents.filter(
    (event) => event.event === 'status_dialogue_continuous_voice_two_turn_probe_turn'
  ).length
  const controlledContinuousLoopProbePassed = Boolean(controlledContinuousLoopComplete?.success === true || isolatedContinuousLoopObserved)
  const controlledContinuousTwoTurnProbePassed = Boolean(
    continuousTwoTurnComplete?.success === true &&
      continuousTwoTurnTurnCount >= 2 &&
      Number(continuousTwoTurnObserved?.transcribe_count ?? continuousTwoTurnTurnCount) >= 2
  )
  const continuousVoiceSourceReady =
    renderer.includes('status_dialogue_continuous_voice_session.v1') &&
    renderer.includes("logStatusDialogueVoiceEvent('continuous_voice_session_resume_stt'") &&
    renderer.includes('calls existing startSpeechRecognition; no separate STT adapter') &&
    renderer.includes('status_dialogue_continuous_voice_two_turn_probe_complete') &&
    continuousLoopWaitSource.includes('status_dialogue_continuous_loop_wait.v1') &&
    continuousLoopWaitSource.includes('click_start_loop_and_speak_two_complete_chinese_sentences') &&
    packageSource.includes('voice:continuous-listening:validate') &&
    packageSource.includes('voice:runtime-flow:probe-continuous-loop') &&
    packageSource.includes('voice:runtime-flow:probe-continuous-two-turn') &&
    packageSource.includes('voice:runtime-flow:wait-continuous-loop') &&
    packageSource.includes('voice:runtime-flow:check-continuous-loop')

  const xiaozhiEvents = realEvents.filter((event) => event.event === 'xiaozhi_style_voice_bridge_event')
  const xiaozhiTypes = Array.from(new Set(xiaozhiEvents.map((event) => event.type).filter(Boolean))).sort()
  const requiredXiaozhiTypes = ['hello', 'listen_start', 'listen_detect', 'stt_result', 'llm_start', 'tts_start', 'tts_stop']
  const missingXiaozhiTypes = requiredXiaozhiTypes.filter((type) => !xiaozhiTypes.includes(type))
  const xiaozhiSourceReady =
    renderer.includes('xiaozhi_style_voice_bridge_state: context.voiceBridgeState') &&
    renderer.includes('Xiaozhi-style bridge: use xiaozhi_style_voice_bridge_state.v1') &&
    packageSource.includes('voice:dialogue-state-policy:validate')

  const statusSnapshotRuntime = latest(
    realEvents,
    (event) =>
      event.event === 'xiaozhi_style_voice_bridge_event' &&
      Array.isArray(event.refs) &&
      event.refs.includes('status_snapshot.v1')
  )
  const statusPolicySourceReady =
    renderer.includes('status_snapshot.v1') &&
    renderer.includes('focused_graph_context') &&
    renderer.includes('buildStatusDialogueUserPrompt') &&
    renderer.includes('missing_module_ids')

  const requirements = [
    requirement(
      'real_gui_runtime',
      '右下角真实 GUI 加载最新运行时',
      statusFrom(Boolean(realMarker), false),
      { marker: compact(realMarker) },
      realMarker ? [] : ['missing non-probe status_dialogue_ui_runtime_loaded marker']
    ),
    requirement(
      'cloud_stt_stability',
      '云端 STT 稳定性与失败分类',
      statusFrom(
        currentCloudOrRemoteSuccess,
        cloudOrRemoteSttSourceReady ||
          cloudCompletes.length > 0 ||
          historicalCloudCompletes.length > 0 ||
          currentRemoteHealthEvents.length > 0 ||
          historicalRemoteCompletes.length > 0
      ),
      {
        source_ready: cloudOrRemoteSttSourceReady,
        chrome_source_ready: cloudSttSourceReady,
        remote_source_ready: remoteSttSourceReady,
        remote_config_preflight: remoteSttConfigPreflight,
        current_window_after_latest_real_marker: Boolean(realMarker),
        starts: cloudStarts,
        completes: cloudCompletes.length,
        successes: cloudSuccesses.length,
        failures: cloudFailures.length,
        classified_failures: cloudClassifiedFailures,
        degraded_to_local: cloudDegradedEvents.length,
        slow_completes_over_8000ms: slowCloudCompletes.length,
        historical_slow_completes_over_8000ms: historicalSlowCloudCompletes.length,
        historical_failures: historicalCloudFailures.length,
        historical_degraded_to_local: historicalCloudDegradedEvents.length,
        remote_health_checks: currentRemoteHealthEvents.length,
        remote_health_ready: currentRemoteHealthReady.length,
        remote_starts: currentRemoteStarts.length,
        remote_completes: currentRemoteCompletes.length,
        remote_successes: currentRemoteSuccesses.length,
        remote_failures: currentRemoteFailures.length,
        historical_remote_successes: historicalRemoteSuccesses.length,
        historical_remote_failures: historicalRemoteFailures.length,
        latest_remote_health: compact(latest(currentRemoteHealthEvents, () => true)),
        latest_remote_complete: compact(latest(currentRemoteCompletes, () => true)),
        controlled_probe_passed: controlledCloudProbePassed,
        controlled_probe_completes: controlledCloudCompletes.length,
        controlled_probe_successes: controlledCloudSuccesses.length,
        controlled_probe_failures: controlledCloudFailures.length,
        controlled_probe_degraded_to_local: controlledCloudDegradedEvents.length,
        controlled_remote_probe_passed: controlledRemoteProbePassed,
        controlled_remote_health_checks: controlledRemoteHealthEvents.length,
        controlled_remote_health_ready: controlledRemoteHealthReady.length,
        controlled_remote_completes: controlledRemoteCompletes.length,
        controlled_remote_successes: controlledRemoteSuccesses.length,
        controlled_remote_failures: controlledRemoteFailures.length,
        latest_controlled_probe_complete: compact(controlledCloudProbeComplete),
        latest_controlled_remote_probe_complete: compact(controlledRemoteProbeComplete),
        latest_controlled_remote_health: compact(latest(controlledRemoteHealthEvents, () => true)),
        latest_controlled_remote_complete: compact(latest(controlledRemoteCompletes, () => true)),
        latest_controlled_degraded: compact(latest(controlledCloudDegradedEvents, () => true)),
        latest_controlled_cloud_complete: compact(latest(controlledCloudProbeEvents, (event) => event.event === 'chrome_stt_complete')),
        latest_complete: compact(latest(realEvents, (event) => event.event === 'chrome_stt_complete')),
        latest_degraded: compact(latest(cloudDegradedEvents, () => true))
      },
      [
        ...(cloudCompletes.length === 0 && currentRemoteCompletes.length === 0 && !controlledCloudProbePassed
          ? ['no current-window cloud or remote STT retry/sample after latest real GUI marker']
          : []),
        ...(controlledCloudProbePassed && cloudCompletes.length === 0 && currentRemoteCompletes.length === 0
          ? ['controlled cloud STT fake-audio probe passed; real operator cloud/remote microphone sample is still unproved']
          : []),
        ...(remoteSttSourceReady && currentRemoteHealthEvents.length === 0
          ? ['remote OpenAI-compatible STT is code-ready, but current-window remote health check is not observed']
          : []),
        ...(remoteSttSourceReady && !remoteSttConfigPreflight.ready_for_remote_probe
          ? [
              `remote STT config preflight is not ready: ${
                remoteSttConfigPreflight.missing.length ? remoteSttConfigPreflight.missing.join(', ') : remoteSttConfigPreflight.next_action
              }`
            ]
          : []),
        ...(currentRemoteHealthEvents.length > 0 && currentRemoteHealthReady.length === 0
          ? ['remote OpenAI-compatible STT health check did not prove a reachable configured host']
          : []),
        ...(remoteSttSourceReady && controlledRemoteProbeEvents.length === 0
          ? ['configured remote STT probe is registered but has not been run in the current evidence set']
          : []),
        ...(controlledRemoteProbeComplete?.fallback_reason === 'remote_stt_not_configured'
          ? ['configured remote STT probe reports missing api key/base url/model configuration']
          : []),
        ...(controlledRemoteProbeComplete?.fallback_reason === 'remote_stt_health_not_ready'
          ? ['configured remote STT probe health check is not ready']
          : []),
        ...(controlledRemoteProbeComplete && controlledRemoteProbeComplete.success !== true && !controlledRemoteProbeComplete.fallback_reason
          ? ['configured remote STT probe completed but did not return a successful transcript']
          : []),
        ...(controlledRemoteProbePassed
          ? ['controlled remote STT configured-audio probe passed; real operator microphone sample is still unproved']
          : []),
        ...(currentRemoteHealthReady.length > 0 && currentRemoteCompletes.length === 0
          ? ['remote OpenAI-compatible STT host is reachable, but real transcription sample is still unproved']
          : []),
        ...(currentRemoteFailures.length > 0 ? ['current-window remote STT still has failure samples'] : []),
        ...(slowCloudCompletes.length > 0 ? ['current-window cloud STT still has slow samples over 8000ms'] : []),
        ...(cloudFailures.length > 0 ? ['current-window cloud STT still has failure samples'] : []),
        ...(historicalSlowCloudCompletes.length > 0 ? ['historical cloud STT slow samples remain as latency evidence'] : []),
        ...(historicalCloudFailures.length > 0 ? ['historical cloud STT failure samples remain as stability evidence'] : []),
        ...(historicalRemoteFailures.length > 0 ? ['historical remote STT failure samples remain as stability evidence'] : []),
        ...(controlledCloudDegradedEvents.length > 0 || cloudDegradedEvents.length > 0
          ? ['cloud STT failure is guarded by degraded-to-local fallback, but cloud recognition itself is not stable']
          : []),
        ...(cloudClassifiedFailures === 0 && controlledCloudFailures.length === 0 && currentRemoteFailures.length === 0
          ? ['current-window cloud STT failure classification not observed']
          : [])
      ]
    ),
    requirement(
      'dialogue_input_queue',
      '输入队列不丢弃忙碌期间输入',
      statusFrom(queueEvents.length > 0 && dequeueEvents.length > 0, queueEvents.length > 0),
      {
        queued: queueEvents.length,
        dequeued: dequeueEvents.length,
        latest_queue: compact(latest(queueEvents, () => true)),
        latest_dequeue: compact(latest(dequeueEvents, () => true))
      },
      queueEvents.length && dequeueEvents.length ? [] : ['runtime queue/dequeue evidence incomplete']
    ),
    requirement(
      'continuous_listening_w3',
      'continuous listening / W3 wake detector / formal STT loop',
      statusFrom(
        Boolean((w3Detected && w3Handoff) || continuousVoiceResume),
        w3SourceReady ||
          controlledW3ProbePassed ||
          continuousVoiceSourceReady ||
          controlledContinuousLoopProbePassed ||
          controlledContinuousTwoTurnProbePassed
      ),
      {
        source_ready: w3SourceReady,
        formal_loop_source_ready: continuousVoiceSourceReady,
        real_operator_loop_wait_available: continuousLoopWaitSource.includes('status_dialogue_continuous_loop_wait.v1'),
        wake_detected: compact(w3Detected),
        wake_handoff: compact(w3Handoff),
        controlled_probe_passed: controlledW3ProbePassed,
        controlled_wake_detected: compact(controlledW3Detected),
        controlled_wake_handoff: compact(controlledW3Handoff),
        controlled_probe_complete: compact(controlledW3ProbeComplete),
        continuous_loop_enabled: compact(continuousVoiceEnabled),
        continuous_loop_scheduled: compact(continuousVoiceScheduled),
        continuous_loop_resume: compact(continuousVoiceResume),
        continuous_loop_paused_error: compact(continuousVoicePausedError),
        controlled_continuous_loop_probe_passed: controlledContinuousLoopProbePassed,
        controlled_continuous_loop_complete: compact(controlledContinuousLoopComplete),
        isolated_continuous_loop_observed: compact(isolatedContinuousLoopObserved),
        controlled_continuous_two_turn_probe_passed: controlledContinuousTwoTurnProbePassed,
        controlled_continuous_two_turn_turns: continuousTwoTurnTurnCount,
        controlled_continuous_two_turn_complete: compact(continuousTwoTurnComplete),
        controlled_continuous_two_turn_observed: compact(continuousTwoTurnObserved)
      },
      (w3Detected && w3Handoff) || continuousVoiceResume
        ? []
        : controlledW3ProbePassed && controlledContinuousTwoTurnProbePassed
          ? ['controlled W3 wake handoff probe and controlled two-turn formal STT loop probe passed; real operator continuous listening is still unproved']
          : controlledContinuousTwoTurnProbePassed
            ? ['controlled two-turn formal STT loop probe passed; real operator continuous listening is still unproved']
        : controlledW3ProbePassed && controlledContinuousLoopProbePassed
          ? ['controlled W3 wake handoff probe and scheduler-only continuous STT loop probe passed; real operator continuous listening is still unproved']
          : controlledW3ProbePassed
            ? ['controlled W3 wake handoff probe passed; real operator continuous listening or formal STT loop is still unproved']
          : controlledContinuousLoopProbePassed
            ? ['controlled scheduler-only continuous STT loop probe passed; two-turn formal STT and real operator loop are still unproved']
            : continuousVoiceSourceReady
              ? ['formal continuous STT loop source is ready; real operator loop resume is still unproved']
              : ['no controlled W3 evidence and no formal continuous STT loop source evidence yet']
    ),
    requirement(
      'tts_during_input',
      'TTS 播放期间接收输入',
      statusFrom(bargeInEvents.length > 0, ttsQueuedInput.length > 0),
      {
        queued_during_tts: ttsQueuedInput.length,
        interrupt_or_stale_skip_events: bargeInEvents.length,
        latest_queued: compact(latest(ttsQueuedInput, () => true)),
        latest_interrupt: compact(latest(bargeInEvents, () => true)),
        controlled_probe: compact(controlledTtsInputProbe)
      },
      bargeInEvents.length ? [] : ['input during TTS is queued, but formal interruption/stale-skip evidence is missing']
    ),
    requirement(
      'local_whisper_persistent_service',
      '本地 Whisper 常驻服务与真实麦克风转写',
      statusFrom(Boolean(localHealth && localComplete && localRendererResult), Boolean(localHealth)),
      {
        health: compact(localHealth),
        recording: compact(localRecording),
        main_complete: compact(localComplete),
        renderer_result: compact(localRendererResult),
        retest_readiness: localRetestReadiness
      },
      localComplete && localRendererResult
        ? []
        : ['health is ready, but real microphone recording/transcription through persistent service is not proven yet']
    ),
    requirement(
      'dialogue_state_context',
      '对话状态补全与状态快照进入回复上下文',
      statusFrom(Boolean(statusPolicySourceReady && statusSnapshotRuntime), statusPolicySourceReady),
      {
        source_ready: statusPolicySourceReady,
        runtime_status_snapshot_ref: compact(statusSnapshotRuntime)
      },
      statusSnapshotRuntime ? [] : ['runtime status_snapshot.v1 reference not observed after latest GUI refresh']
    ),
    requirement(
      'xiaozhi_style_logic',
      '小智式对话逻辑应用',
      statusFrom(xiaozhiSourceReady && missingXiaozhiTypes.length === 0, xiaozhiSourceReady || xiaozhiTypes.length > 0),
      {
        source_ready: xiaozhiSourceReady,
        observed_types: xiaozhiTypes,
        missing_types: missingXiaozhiTypes
      },
      missingXiaozhiTypes
    )
  ]

  const proved = requirements.filter((item) => item.status === 'proved').length
  const partial = requirements.filter((item) => item.status === 'partial').length
  const missing = requirements.filter((item) => item.status === 'missing').length
  const result = missing === 0 && partial === 0 ? 'complete' : 'incomplete'
  const nextRequiredEvidence = requirements
    .filter((item) => item.status !== 'proved')
    .flatMap((item) => item.missing.map((missingItem) => `${item.id}: ${missingItem}`))
  const requirementsSummary = requirements.map(summarizeRequirementForConsole)

  const report = {
    schema: 'status_dialogue_goal_completion_audit.v1',
    generated_at: new Date().toISOString(),
    objective:
      '进入 STT 专项：云端 STT 稳定性、输入队列、连续监听、TTS 播放期间接收输入、以及本地 Whisper 常驻服务。另外补全对话状态，当前只会说当前状态有缺口，需要先确认。检查小智的对话逻辑是否被应用。',
    zhineng_root: zhinengRoot,
    repo_root: repoRoot,
    inspected_logs: parsedLogs.map((entry) => entry.filePath),
    parse_errors: parseErrors,
    runtime_probe_windows: runtimeProbeWindows,
    current_runtime_window: {
      latest_real_marker_ts: realMarker?.ts ?? realMarker?.generated_at,
      latest_real_marker_ts_ms: latestRealMarkerMs || undefined,
      event_count: currentRuntimeEvents.length
    },
    remote_stt_config_preflight: remoteSttConfigPreflight,
    manual_retest_readiness: {
      local_stt: localRetestReadiness,
      real_voice_turns: realVoiceTurnsReadiness
    },
    summary: { proved, partial, missing, total: requirements.length },
    result,
    requirements_summary: requirementsSummary,
    requirements,
    next_required_evidence: nextRequiredEvidence
  }

  fs.mkdirSync(reportDir, { recursive: true })
  const outputPath = path.join(reportDir, `status-dialogue-goal-completion-audit-${Date.now()}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(
    JSON.stringify(
      {
        ok: true,
        outputPath,
        result,
        summary: report.summary,
        requirements_summary: requirementsSummary,
        remote_stt_config_preflight: report.remote_stt_config_preflight,
        manual_retest_readiness: report.manual_retest_readiness,
        next_required_evidence: nextRequiredEvidence
      },
      null,
      2
    )
  )
}

main()
