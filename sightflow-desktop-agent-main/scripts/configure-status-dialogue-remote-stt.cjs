const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const reportDir = path.join(repoRoot, 'runtime', 'verification-reports')
const defaultSettingsPath = path.join(
  process.env.APPDATA || '',
  'zhineng-social-assistant-desktop',
  'settings.json'
)

function hasFlag(name) {
  return process.argv.includes(name)
}

function argValue(name, fallback = '') {
  const inline = process.argv.find((item) => item.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  if (index === -1 || index + 1 >= process.argv.length) return fallback
  return process.argv[index + 1]
}

function redacted(value) {
  if (!value) return undefined
  return {
    present: true,
    length: value.length,
    preview: `${value.slice(0, 3)}...${value.slice(-2)}`
  }
}

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {}
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  return text.trim() ? JSON.parse(text) : {}
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

function normalizeTimeout(value, fallback = 30000) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.max(3000, Math.min(120000, Math.round(numberValue)))
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

const REMOTE_STT_API_KEY_ENV_CANDIDATES = [
  'SIGHTFLOW_STATUS_DIALOGUE_STT_API_KEY',
  'STATUS_DIALOGUE_STT_API_KEY',
  'OPENAI_STT_API_KEY',
  'OPENAI_API_KEY',
  'CLOUDFLARE_API_TOKEN'
]

const REMOTE_STT_CLOUDFLARE_ACCOUNT_ID_ENV_CANDIDATES = [
  'SIGHTFLOW_STATUS_DIALOGUE_STT_CLOUDFLARE_ACCOUNT_ID',
  'STATUS_DIALOGUE_STT_CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_ACCOUNT_ID'
]

function normalizeProvider(value) {
  const text = String(value || '').trim().toLowerCase()
  if (text === 'cloudflare' || text === 'cloudflare_workers_ai' || text === 'workers_ai') return 'cloudflare_workers_ai'
  return 'openai_compatible_remote'
}

function resolveApiKey(existingConfig, providerConfig = {}, desiredBaseUrl = '', provider = 'openai_compatible_remote') {
  const apiKeyFromArg = argValue('--api-key')
  const apiKeyEnvName = argValue('--api-key-env')
  if (apiKeyFromArg) {
    return {
      value: apiKeyFromArg,
      source: 'argv.--api-key',
      warning: 'Passing API keys on the command line can leave them in shell history; prefer --api-key-env.'
    }
  }
  if (apiKeyEnvName) {
    const value = process.env[apiKeyEnvName] || ''
    return {
      value,
      source: `env.${apiKeyEnvName}`,
      warning: value ? undefined : `Environment variable ${apiKeyEnvName} is empty or missing.`
    }
  }
  if (typeof existingConfig.apiKey === 'string' && existingConfig.apiKey.trim()) {
    return { value: existingConfig.apiKey.trim(), source: 'existing_settings.apiKey' }
  }
  if (typeof existingConfig.api_key === 'string' && existingConfig.api_key.trim()) {
    return { value: existingConfig.api_key.trim(), source: 'existing_settings.api_key' }
  }
  for (const envName of REMOTE_STT_API_KEY_ENV_CANDIDATES) {
    const value = process.env[envName]
    if (typeof value === 'string' && value.trim()) {
      return { value: value.trim(), source: `env.${envName}` }
    }
  }
  if (typeof providerConfig.apiKey === 'string' && providerConfig.apiKey.trim()) {
    if (provider === 'cloudflare_workers_ai') {
      return {
        value: '',
        source: undefined,
        warning: 'chatProvider.config.apiKey was not reused because Cloudflare STT requires a Cloudflare API token.'
      }
    }
    const providerBaseUrl = typeof providerConfig.baseURL === 'string' ? providerConfig.baseURL : ''
    if (!desiredBaseUrl || hostsMatch(desiredBaseUrl, providerBaseUrl)) {
      return { value: providerConfig.apiKey.trim(), source: 'settings.chatProvider.config.apiKey' }
    }
    return {
      value: '',
      source: undefined,
      warning: 'chatProvider.config.apiKey was not reused because statusDialogueStt.baseURL host does not match chatProvider.config.baseURL.'
    }
  }
  return { value: '', source: undefined }
}

function resolveCloudflareAccountId(existingConfig) {
  const accountIdFromArg = argValue('--cloudflare-account-id') || argValue('--account-id')
  const accountIdEnvName = argValue('--cloudflare-account-id-env') || argValue('--account-id-env')
  if (accountIdFromArg) return { value: accountIdFromArg, source: 'argv.--cloudflare-account-id' }
  if (accountIdEnvName) {
    const value = process.env[accountIdEnvName] || ''
    return {
      value,
      source: `env.${accountIdEnvName}`,
      warning: value ? undefined : `Environment variable ${accountIdEnvName} is empty or missing.`
    }
  }
  for (const key of ['accountId', 'account_id', 'cloudflareAccountId', 'cloudflare_account_id']) {
    if (typeof existingConfig[key] === 'string' && existingConfig[key].trim()) {
      return { value: existingConfig[key].trim(), source: `existing_settings.${key}` }
    }
  }
  for (const envName of REMOTE_STT_CLOUDFLARE_ACCOUNT_ID_ENV_CANDIDATES) {
    const value = process.env[envName]
    if (typeof value === 'string' && value.trim()) {
      return { value: value.trim(), source: `env.${envName}` }
    }
  }
  return { value: '', source: undefined }
}

function buildNextSettings(settings, desiredConfig) {
  const currentChatProvider =
    settings.chatProvider && typeof settings.chatProvider === 'object' ? settings.chatProvider : {}
  const currentConfig =
    currentChatProvider.config && typeof currentChatProvider.config === 'object' ? currentChatProvider.config : {}
  return {
    ...settings,
    chatProvider: {
      ...currentChatProvider,
      config: {
        ...currentConfig,
        statusDialogueStt: desiredConfig
      }
    }
  }
}

function main() {
  const apply = hasFlag('--apply')
  const applyNonSecretDefaults = hasFlag('--apply-nonsecret-defaults') || hasFlag('--allow-missing-secret')
  const settingsPath = path.resolve(argValue('--settings-path', defaultSettingsPath))
  const settings = readJsonFile(settingsPath)
  const currentStatusDialogueStt =
    settings?.chatProvider?.config?.statusDialogueStt && typeof settings.chatProvider.config.statusDialogueStt === 'object'
      ? settings.chatProvider.config.statusDialogueStt
      : settings?.chatProvider?.config?.status_dialogue_stt && typeof settings.chatProvider.config.status_dialogue_stt === 'object'
        ? settings.chatProvider.config.status_dialogue_stt
        : {}
  const providerConfig =
    settings?.chatProvider?.config && typeof settings.chatProvider.config === 'object'
      ? settings.chatProvider.config
      : {}
  const enabledValue = argValue('--enabled', 'true').toLowerCase()
  const currentProvider = normalizeProvider(
    currentStatusDialogueStt.provider || currentStatusDialogueStt.adapter || currentStatusDialogueStt.adapter_id
  )
  const providerArg = argValue('--provider')
  const desiredProvider = normalizeProvider(providerArg || currentProvider)
  const providerChanged = Boolean(providerArg) && desiredProvider !== currentProvider
  const cloudflareAccountId = resolveCloudflareAccountId(currentStatusDialogueStt)
  const desiredBaseURL =
    argValue('--base-url') ||
    (!providerChanged ? currentStatusDialogueStt.baseURL || currentStatusDialogueStt.base_url : '') ||
    (desiredProvider === 'cloudflare_workers_ai' ? 'https://api.cloudflare.com/client/v4' : providerConfig.baseURL) ||
    'https://api.openai.com/v1'
  const desiredModel =
    argValue('--model') ||
    (!providerChanged ? currentStatusDialogueStt.model : '') ||
    (desiredProvider === 'cloudflare_workers_ai' ? '@cf/openai/whisper-large-v3-turbo' : 'whisper-1')
  const apiKey = resolveApiKey(currentStatusDialogueStt, providerConfig, desiredBaseURL, desiredProvider)
  const desiredConfig = {
    enabled: enabledValue === '1' || enabledValue === 'true',
    provider: desiredProvider,
    apiKey: apiKey.value,
    accountId: desiredProvider === 'cloudflare_workers_ai' ? cloudflareAccountId.value : currentStatusDialogueStt.accountId || currentStatusDialogueStt.account_id,
    baseURL: desiredBaseURL,
    endpointPath:
      argValue('--endpoint') ||
      (!providerChanged ? currentStatusDialogueStt.endpointPath || currentStatusDialogueStt.endpoint_path : '') ||
      (desiredProvider === 'cloudflare_workers_ai' && cloudflareAccountId.value
        ? `/accounts/${cloudflareAccountId.value}/ai/run/${desiredModel}`
        : desiredProvider === 'cloudflare_workers_ai'
          ? '/accounts/<account_id>/ai/run/@cf/openai/whisper-large-v3-turbo'
          : '/audio/transcriptions'),
    model: desiredModel,
    timeoutMs: normalizeTimeout(
      argValue('--timeout-ms') || currentStatusDialogueStt.timeoutMs || currentStatusDialogueStt.timeout_ms || 30000
    )
  }
  const missing = []
  if (!desiredConfig.enabled) missing.push('remote_stt_enabled_true')
  if (!desiredConfig.apiKey) missing.push('remote_stt_api_key')
  if (desiredProvider === 'cloudflare_workers_ai' && !desiredConfig.accountId) missing.push('remote_stt_cloudflare_account_id')
  if (!desiredConfig.baseURL && !/^https?:\/\//i.test(desiredConfig.endpointPath)) {
    missing.push('remote_stt_base_url_or_full_endpoint')
  }
  const readyForRemoteProbe = missing.length === 0
  const nonSecretDefaultsOnly =
    applyNonSecretDefaults &&
    !desiredConfig.apiKey &&
    desiredConfig.enabled &&
    Boolean(desiredConfig.baseURL || /^https?:\/\//i.test(desiredConfig.endpointPath)) &&
    missing.every((item) => item === 'remote_stt_api_key' || item === 'remote_stt_cloudflare_account_id')
  const canApplySettings = readyForRemoteProbe || nonSecretDefaultsOnly
  const nextSettings = buildNextSettings(settings, desiredConfig)
  const backupPath = `${settingsPath}.status-dialogue-stt-backup-${Date.now()}.bak`
  const warnings = [
    apiKey.warning,
    cloudflareAccountId.warning,
    apply && !readyForRemoteProbe && !nonSecretDefaultsOnly
      ? 'Apply was requested, but required remote STT config is still incomplete.'
      : undefined,
    apply && nonSecretDefaultsOnly
      ? 'Only non-secret remote STT defaults will be written; remote audio upload remains disabled until an API key is configured.'
      : undefined
  ].filter(Boolean)

  const report = {
    schema: 'status_dialogue_remote_stt_configure.v1',
    generated_at: new Date().toISOString(),
    ok: true,
    mode: apply ? 'apply' : 'dry_run',
    boundary:
      'local settings configuration only; no audio upload; no network request; API key is redacted in reports',
    settings_path: settingsPath,
    settings_found: fs.existsSync(settingsPath),
    backup_path: apply ? backupPath : undefined,
    apply_nonsecret_defaults: applyNonSecretDefaults,
    nonsecret_defaults_only: nonSecretDefaultsOnly,
    api_key_source: apiKey.source,
    cloudflare_account_id_source: cloudflareAccountId.source,
    accepted_api_key_env: REMOTE_STT_API_KEY_ENV_CANDIDATES,
    accepted_cloudflare_account_id_env: REMOTE_STT_CLOUDFLARE_ACCOUNT_ID_ENV_CANDIDATES,
    desired_config: {
      enabled: desiredConfig.enabled,
      provider: desiredConfig.provider,
      api_key: redacted(desiredConfig.apiKey),
      cloudflare_account_id_configured: Boolean(desiredConfig.accountId),
      baseURL: desiredConfig.baseURL,
      endpointPath: desiredConfig.endpointPath,
      model: desiredConfig.model,
      timeoutMs: desiredConfig.timeoutMs
    },
    missing,
    ready_for_remote_probe: readyForRemoteProbe,
    ready_for_nonsecret_default_apply: nonSecretDefaultsOnly,
    warnings,
    changed: false,
    next_action: readyForRemoteProbe
      ? 'run_voice_remote_stt_config_validate_then_probe_remote_stt_configured'
      : nonSecretDefaultsOnly
        ? apply
          ? desiredProvider === 'cloudflare_workers_ai'
            ? 'provide_cloudflare_api_token_and_account_id'
            : 'provide_api_key_with_api_key_env_or_api_key'
          : desiredProvider === 'cloudflare_workers_ai'
            ? 'apply_nonsecret_defaults_then_provide_cloudflare_api_token_and_account_id'
            : 'apply_nonsecret_defaults_then_provide_api_key'
        : missing.includes('remote_stt_cloudflare_account_id')
          ? 'provide_cloudflare_api_token_and_account_id'
        : missing.includes('remote_stt_api_key')
          ? 'provide_api_key_with_api_key_env_or_api_key'
          : 'complete_missing_remote_stt_config'
  }

  if (apply) {
    if (!canApplySettings) {
      report.ok = false
      report.changed = false
    } else {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
      if (fs.existsSync(settingsPath)) {
        fs.copyFileSync(settingsPath, backupPath)
      }
      writeJsonFile(settingsPath, nextSettings)
      report.changed = true
    }
  }

  fs.mkdirSync(reportDir, { recursive: true })
  const outputPath = path.join(reportDir, `status-dialogue-remote-stt-configure-${Date.now()}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify({ outputPath, ...report }, null, 2))
  if (!report.ok) process.exitCode = 1
}

main()
