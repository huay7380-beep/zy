const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const reportDir = path.join(repoRoot, 'runtime', 'verification-reports')
const settingsPath = path.join(
  process.env.APPDATA || '',
  'zhineng-social-assistant-desktop',
  'settings.json'
)

function readSettingsStatusDialogueStt() {
  if (!settingsPath || !fs.existsSync(settingsPath)) {
    return {
      settings_path: settingsPath || undefined,
      settings_found: false,
      raw: {}
    }
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
    return {
      settings_path: settingsPath,
      settings_found: true,
      provider_config: providerConfig,
      raw
    }
  } catch (error) {
    return {
      settings_path: settingsPath,
      settings_found: true,
      settings_error: String(error?.message ?? error).slice(0, 240),
      raw: {}
    }
  }
}

function firstPresent(candidates) {
  for (const candidate of candidates) {
    const value = process.env[candidate]
    if (typeof value === 'string' && value.trim()) {
      return { name: candidate, value: value.trim() }
    }
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

function readEnabled(raw) {
  const candidate = firstPresent([
    'SIGHTFLOW_STATUS_DIALOGUE_STT_REMOTE_ENABLED',
    'STATUS_DIALOGUE_STT_REMOTE_ENABLED',
    'OPENAI_STT_REMOTE_ENABLED'
  ])
  if (!candidate.name) {
    if (typeof raw?.enabled === 'boolean') {
      return {
        configured: true,
        enabled: raw.enabled === true,
        source: 'settings.chatProvider.config.statusDialogueStt.enabled'
      }
    }
    return { configured: false, enabled: false, source: undefined }
  }
  const normalized = candidate.value.toLowerCase()
  return {
    configured: true,
    enabled: normalized === '1' || normalized === 'true',
    source: candidate.name
  }
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

const settingsSource = readSettingsStatusDialogueStt()
const rawSettings = settingsSource.raw || {}
const providerConfig = settingsSource.provider_config || {}
const rawProviderValue = fromRaw(rawSettings, ['provider', 'adapter', 'adapter_id'])
const providerValue = firstPresent([
  'SIGHTFLOW_STATUS_DIALOGUE_STT_PROVIDER',
  'STATUS_DIALOGUE_STT_PROVIDER'
])
const provider = normalizeProvider(providerValue.value || rawProviderValue.value)
const rawProvider = normalizeProvider(rawProviderValue.value)
const providerChangedByEnv = Boolean(providerValue.name) && provider !== rawProvider
const accountId = firstPresentWithRaw([
  'SIGHTFLOW_STATUS_DIALOGUE_STT_CLOUDFLARE_ACCOUNT_ID',
  'STATUS_DIALOGUE_STT_CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_ACCOUNT_ID'
], rawSettings, ['account_id', 'accountId', 'cloudflare_account_id', 'cloudflareAccountId'])

const explicitApiKey = firstPresentWithRaw([
  'SIGHTFLOW_STATUS_DIALOGUE_STT_API_KEY',
  'STATUS_DIALOGUE_STT_API_KEY',
  'OPENAI_STT_API_KEY',
  'OPENAI_API_KEY',
  'CLOUDFLARE_API_TOKEN'
], rawSettings, ['api_key', 'apiKey'])
const explicitBaseUrl = firstPresentWithRaw([
  'SIGHTFLOW_STATUS_DIALOGUE_STT_BASE_URL',
  'STATUS_DIALOGUE_STT_BASE_URL',
  'OPENAI_STT_BASE_URL',
  'OPENAI_BASE_URL'
], providerChangedByEnv ? {} : rawSettings, ['base_url', 'baseURL'])
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
const endpoint = firstPresentWithRaw([
  'SIGHTFLOW_STATUS_DIALOGUE_STT_ENDPOINT',
  'STATUS_DIALOGUE_STT_ENDPOINT',
  'OPENAI_AUDIO_TRANSCRIPTIONS_ENDPOINT',
  'OPENAI_STT_ENDPOINT'
], providerChangedByEnv ? {} : rawSettings, ['endpoint_path', 'endpointPath'])
const model = firstPresentWithRaw([
  'SIGHTFLOW_STATUS_DIALOGUE_STT_MODEL',
  'STATUS_DIALOGUE_STT_MODEL',
  'OPENAI_STT_MODEL',
  'OPENAI_AUDIO_MODEL'
], providerChangedByEnv ? {} : rawSettings, ['model'])
const timeoutMs = firstPresentWithRaw([
  'SIGHTFLOW_STATUS_DIALOGUE_STT_TIMEOUT_MS',
  'STATUS_DIALOGUE_STT_TIMEOUT_MS',
  'OPENAI_STT_TIMEOUT_MS'
], rawSettings, ['timeout_ms', 'timeoutMs'])
const enabled = readEnabled(rawSettings)
const modelValue = model.value || (provider === 'cloudflare_workers_ai' ? '@cf/openai/whisper-large-v3-turbo' : 'whisper-1')
const endpointValue =
  endpoint.value ||
  (provider === 'cloudflare_workers_ai' && accountId.value
    ? `/accounts/${accountId.value}/ai/run/${modelValue}`
    : provider === 'cloudflare_workers_ai'
      ? '/accounts/<account_id>/ai/run/@cf/openai/whisper-large-v3-turbo'
      : '/audio/transcriptions')
const timeoutValue = Number(timeoutMs.value || 30000)
const baseUrlHost = hostOf(baseUrl.value)
const endpointHost = /^https?:\/\//i.test(endpointValue) ? hostOf(endpointValue) : undefined
const hasBaseUrl = Boolean(baseUrl.value || endpointHost)
const hasProviderRequiredFields =
  provider === 'cloudflare_workers_ai' ? Boolean(apiKey.value && hasBaseUrl && accountId.value) : Boolean(apiKey.value && hasBaseUrl)
const readyForRemoteProbe = enabled.enabled && hasProviderRequiredFields
const providerApiKeyFallbackBlocked =
  Boolean(providerApiKey.name) && !explicitApiKey.name && !providerApiKeyFallbackAllowed

const missing = []
if (!enabled.configured) missing.push('remote_stt_enable_flag')
if (enabled.configured && !enabled.enabled) missing.push('remote_stt_enabled_true')
if (!apiKey.value) missing.push('remote_stt_api_key')
if (!hasBaseUrl) missing.push('remote_stt_base_url_or_full_endpoint')
if (provider === 'cloudflare_workers_ai' && !accountId.value) missing.push('remote_stt_cloudflare_account_id')

const report = {
  schema: 'status_dialogue_remote_stt_config_preflight.v1',
  generated_at: new Date().toISOString(),
  ok: true,
  ready_for_remote_probe: readyForRemoteProbe,
  boundary: 'read-only config preflight; no audio upload; no network request; api keys are redacted',
  settings: {
    path: settingsSource.settings_path,
    found: settingsSource.settings_found,
    error: settingsSource.settings_error,
    status_dialogue_stt_keys: Object.keys(rawSettings)
  },
  accepted_sources: {
    env: {
      enabled: [
        'SIGHTFLOW_STATUS_DIALOGUE_STT_REMOTE_ENABLED',
        'STATUS_DIALOGUE_STT_REMOTE_ENABLED',
        'OPENAI_STT_REMOTE_ENABLED'
      ],
      provider: [
        'SIGHTFLOW_STATUS_DIALOGUE_STT_PROVIDER',
        'STATUS_DIALOGUE_STT_PROVIDER'
      ],
      api_key: [
        'SIGHTFLOW_STATUS_DIALOGUE_STT_API_KEY',
        'STATUS_DIALOGUE_STT_API_KEY',
        'OPENAI_STT_API_KEY',
        'OPENAI_API_KEY',
        'CLOUDFLARE_API_TOKEN'
      ],
      cloudflare_account_id: [
        'SIGHTFLOW_STATUS_DIALOGUE_STT_CLOUDFLARE_ACCOUNT_ID',
        'STATUS_DIALOGUE_STT_CLOUDFLARE_ACCOUNT_ID',
        'CLOUDFLARE_ACCOUNT_ID'
      ],
      base_url: [
        'SIGHTFLOW_STATUS_DIALOGUE_STT_BASE_URL',
        'STATUS_DIALOGUE_STT_BASE_URL',
        'OPENAI_STT_BASE_URL',
        'OPENAI_BASE_URL'
      ],
      endpoint: [
        'SIGHTFLOW_STATUS_DIALOGUE_STT_ENDPOINT',
        'STATUS_DIALOGUE_STT_ENDPOINT',
        'OPENAI_AUDIO_TRANSCRIPTIONS_ENDPOINT',
        'OPENAI_STT_ENDPOINT'
      ],
      model: [
        'SIGHTFLOW_STATUS_DIALOGUE_STT_MODEL',
        'STATUS_DIALOGUE_STT_MODEL',
        'OPENAI_STT_MODEL',
        'OPENAI_AUDIO_MODEL'
      ],
      timeout_ms: [
        'SIGHTFLOW_STATUS_DIALOGUE_STT_TIMEOUT_MS',
        'STATUS_DIALOGUE_STT_TIMEOUT_MS',
        'OPENAI_STT_TIMEOUT_MS'
      ]
    },
    app_settings:
      'chatProvider.config.statusDialogueStt or chatProvider.config.status_dialogue_stt; api key may fall back to chatProvider.config.apiKey only when STT baseURL host matches chatProvider.config.baseURL'
  },
  sources: {
    enabled: enabled.source,
    provider: providerValue.name || rawProviderValue.name,
    api_key: apiKey.name,
    cloudflare_account_id: accountId.name,
    base_url: baseUrl.name,
    endpoint: endpoint.name,
    model: model.name,
    timeout_ms: timeoutMs.name,
    provider_api_key_fallback_blocked: providerApiKeyFallbackBlocked
      ? 'chatProvider.config.apiKey host does not match statusDialogueStt.baseURL'
      : undefined
  },
  config: {
    provider,
    enabled: enabled.enabled,
    api_key: redacted(apiKey.value),
    cloudflare_account_id_configured: Boolean(accountId.value),
    base_url_host: baseUrlHost,
    endpoint_path_or_url: endpointValue,
    endpoint_host: endpointHost,
    model: modelValue,
    timeout_ms: Number.isFinite(timeoutValue) ? timeoutValue : 30000
  },
  missing,
  configuration_template: {
    env_minimum: [
      'SIGHTFLOW_STATUS_DIALOGUE_STT_REMOTE_ENABLED=1',
      'SIGHTFLOW_STATUS_DIALOGUE_STT_API_KEY=<redacted>',
      'SIGHTFLOW_STATUS_DIALOGUE_STT_BASE_URL=https://api.openai.com/v1',
      'SIGHTFLOW_STATUS_DIALOGUE_STT_ENDPOINT=/audio/transcriptions',
      'SIGHTFLOW_STATUS_DIALOGUE_STT_MODEL=whisper-1',
      'SIGHTFLOW_STATUS_DIALOGUE_STT_TIMEOUT_MS=30000'
    ],
    cloudflare_env_minimum: [
      'SIGHTFLOW_STATUS_DIALOGUE_STT_REMOTE_ENABLED=1',
      'SIGHTFLOW_STATUS_DIALOGUE_STT_PROVIDER=cloudflare_workers_ai',
      'SIGHTFLOW_STATUS_DIALOGUE_STT_API_KEY=<cloudflare_api_token>',
      'SIGHTFLOW_STATUS_DIALOGUE_STT_CLOUDFLARE_ACCOUNT_ID=<cloudflare_account_id>',
      'SIGHTFLOW_STATUS_DIALOGUE_STT_MODEL=@cf/openai/whisper-large-v3-turbo',
      'SIGHTFLOW_STATUS_DIALOGUE_STT_TIMEOUT_MS=30000'
    ],
    app_settings_example: {
      chatProvider: {
        config: {
          statusDialogueStt: {
            enabled: true,
            provider: 'openai_compatible_remote',
            apiKey: '<redacted>',
            baseURL: 'https://api.openai.com/v1',
            endpointPath: '/audio/transcriptions',
            model: 'whisper-1',
            timeoutMs: 30000
          }
        }
      }
    },
    cloudflare_app_settings_example: {
      chatProvider: {
        config: {
          statusDialogueStt: {
            enabled: true,
            provider: 'cloudflare_workers_ai',
            apiKey: '<cloudflare_api_token>',
            accountId: '<cloudflare_account_id>',
            baseURL: 'https://api.cloudflare.com/client/v4',
            model: '@cf/openai/whisper-large-v3-turbo',
            timeoutMs: 30000
          }
        }
      }
    },
    validation_commands: [
      'npm.cmd run voice:remote-stt-config:validate',
      'npm.cmd run voice:remote-stt-config:apply-defaults',
      'set one accepted API-key env var, then npm.cmd run voice:remote-stt-config:apply',
      'npm.cmd run voice:runtime-flow:probe-remote-stt-configured',
      'npm.cmd run voice:goal:audit'
    ]
  },
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

fs.mkdirSync(reportDir, { recursive: true })
const outputPath = path.join(reportDir, `status-dialogue-remote-stt-config-${Date.now()}.json`)
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

console.log(JSON.stringify({ ok: true, outputPath, ...report }, null, 2))
