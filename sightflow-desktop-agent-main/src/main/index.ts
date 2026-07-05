import { app, shell, BrowserWindow, ipcMain, desktopCapturer, screen, session, Menu, Tray, nativeImage, type WebContents } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, watch, writeFileSync, type FSWatcher } from 'fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import { execFileSync, spawn } from 'child_process'
import { createHash, randomBytes, randomUUID } from 'crypto'
import * as http from 'http'
import * as https from 'https'
import * as tls from 'tls'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { checkAndRequestPermissions } from './permission'
import Store from 'electron-store'
import { AIClient } from '../core/ai-client'
import {
  DEFAULT_STATUS_DIALOGUE_CONFIG,
  DEFAULT_STATUS_DIALOGUE_EVENT_DIR,
  DEFAULT_STATUS_DIALOGUE_EVENT_TTL_MS,
  DEFAULT_SYSTEM_PATROL_DIALOGUE_READ_INDEX_PATH,
  STATUS_DIALOGUE_TTS_HEALTH_SCHEMA,
  STATUS_DIALOGUE_TTS_SYNTHESIS_SCHEMA,
  STATUS_DIALOGUE_MODEL_TEST_SCHEMA,
  STATUS_DIALOGUE_REAL_ENV_CHECK_SCHEMA,
  STATUS_DIALOGUE_RUNTIME_VOICE_DIAGNOSTIC_SCHEMA,
  STATUS_DIALOGUE_REMOTE_ADAPTER_ID,
  buildSystemEventSnapshot,
  buildCosyVoiceRequestBody,
  buildStatusSnapshotFromCards,
  normalizeStatusDialogueTtsConfig,
  normalizeExpectedStatusEventPublishers,
  normalizeExpectedStatusModule,
  normalizeModuleStatusEvent,
  normalizeModuleStatusCard,
  normalizeStatusDialogueConfig,
  normalizeSystemPatrolDialogueReadIndex,
  summarizeSystemPatrolDialogueReadIndex,
  type StatusDialogueBrowserSpeechCapabilities,
  type ExpectedStatusModule,
  type ModuleStatusEvent,
  type ModuleStatusCard,
  type StatusDialogueModelTestResult,
  type StatusDialogueProviderReadiness,
  type StatusDialogueRealCheckItem,
  type StatusDialogueRealCheckStatus,
  type StatusDialogueRealEnvCheckResult,
  type StatusDialogueRuntimeVoiceDiagnostic,
  type StatusDialogueTtsAdapterConfig,
  type StatusDialogueTtsHealthResult,
  type StatusDialogueTtsSynthesisRequest,
  type StatusDialogueTtsSynthesisResult,
  type SystemEventSnapshotReadResult,
  type SystemPatrolDialogueIndexReadResult,
  type StatusSnapshotReadResult
} from '../core/status-dialogue-contracts'
import {
  buildVoiceChunkCacheKey,
  createHttpStreamingTtsAdapter,
  type StreamingTtsAudioFrame
} from '../core/status-dialogue/voice-output-pipeline'
import { DEFAULT_COSYVOICE_VOICE_PROFILE, normalizeVoiceProfile } from '../core/status-dialogue/voice-profile'
import { DesktopDevice } from '../core/device'
import { RPADevice } from '../core/rpa-device'
import { BoxSelectDevice } from '../core/box-select-device'
import { RuntimeHost } from '../core/runtime-host'
import {
  createInitialGenericChannelState,
  GenericChannelSession
} from '../core/generic-channel-session'
import {
  createInitialZhinengBridgeState,
  ZhinengBridgeSession
} from '../core/zhineng-bridge-session'
import { ZhinengBridgeClient, type ZhinengBridgeSubmission } from '../core/zhineng-bridge-client'
import type { IntakeObservation } from '../core/send-command-types'
import { AppType, BoxRegions, CaptureStrategy, isWechatLike } from '../core/rpa/types'
import { getWechatWindowInfo } from '../core/rpa/window-utils'
import { runBoxSelectWizard, type WizardStepKey } from './overlay-window'
import {
  BUILTIN_DOUBAO_PROVIDER_ID,
  getBuiltinDoubaoInstalledInfo,
  getBuiltinDoubaoManifestForUi,
  getInstalledProviderManifest,
  installProviderFromUrl,
  InstalledProviderInfo,
  loadBuiltinDoubaoProvider,
  loadInstalledProvider
} from './provider-bundle'
import {
  SkillEngineController,
  SkillPauseResult,
  SkillStartResult,
  startSkillServer,
  stopSkillServer
} from './skill-server'
const StoreClass = typeof Store === 'function' ? Store : ((Store as any).default as typeof Store)

const APP_DISPLAY_TITLE = '人类社交辅助系统v.0.1.0'
const FIXED_ARK_MODEL = 'doubao-seed-2-0-lite-260215'
const FIXED_ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
const DEFAULT_EXPERT_PROVIDER_ID = 'deepseek-v4-flash-daily'
const DEFAULT_EXPERT_PROVIDER_LABEL = 'DeepSeek V4 Flash 日常专家模型'
const DEFAULT_EXPERT_PROVIDER_MODEL = 'deepseek-v4-flash'
const DEFAULT_EXPERT_PROVIDER_BASE_URL = 'https://api.deepseek.com'
const CROSS_BORDER_PROJECT_DIR = 'cross-border-ecommerce-ai-route'
const CROSS_BORDER_ALLOWED_STAGE_ACTIONS = new Set([
  'inspect',
  'validate',
  'generate-draft',
  'review-pack',
  'prepare-controlled'
])

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

interface PerAppCapture {
  strategy: CaptureStrategy
  regions: BoxRegions | null
}

type ExpertResearchBoundaryMode =
  | 'analysis_only'
  | 'experimental_guidance'
  | 'control_variable_research'
type ExpertApiMode = 'deterministic' | 'shared_provider' | 'dedicated_provider'
type ExpertRuntimeRole = 'specialist' | 'coordinator'
type ExpertProviderKind = 'openai_compatible'

interface ExpertMatrixExpertConfig {
  enabled: boolean
  intensity: number
  apiMode: ExpertApiMode
  providerRef: string
  allowWeightImpact: boolean
  role: ExpertRuntimeRole
}

interface ExpertMatrixBoundaryConfig {
  guidanceDefinition: string
  controlDefinition: string
  experimentalQuestion: string
  safetyReviewStage: 'pre_send_gate'
}

interface ExpertMatrixConfig {
  enabled: boolean
  mode: ExpertResearchBoundaryMode
  primaryExpertId: string
  globalIntensity: number
  guidanceControlBoundary: ExpertMatrixBoundaryConfig
  experts: Record<string, ExpertMatrixExpertConfig>
}

interface ExpertProviderConfig {
  id: string
  label: string
  kind: ExpertProviderKind
  enabled: boolean
  apiKey: string
  model: string
  baseURL: string
}

interface ExpertProviderRegistryConfig {
  defaultProviderRef: string
  providers: ExpertProviderConfig[]
}

const EXPERT_MATRIX_DEFAULT_EXPERTS: Array<{
  id: string
  defaultRole: ExpertRuntimeRole
}> = [
  { id: 'game_theory_expert', defaultRole: 'specialist' },
  { id: 'psychology_expert', defaultRole: 'specialist' },
  { id: 'logic_expert', defaultRole: 'specialist' },
  { id: 'evidence_causality_expert', defaultRole: 'specialist' },
  { id: 'social_network_expert', defaultRole: 'specialist' },
  { id: 'language_pragmatics_expert', defaultRole: 'specialist' },
  { id: 'organizational_expert', defaultRole: 'specialist' },
  { id: 'behavioral_economics_expert', defaultRole: 'specialist' },
  { id: 'negotiation_conflict_expert', defaultRole: 'specialist' },
  { id: 'romantic_relationship_coordinator_expert', defaultRole: 'coordinator' }
]

function defaultExpertMatrixConfig(): ExpertMatrixConfig {
  return {
    enabled: true,
    mode: 'experimental_guidance',
    primaryExpertId: 'romantic_relationship_coordinator_expert',
    globalIntensity: 100,
    guidanceControlBoundary: {
      guidanceDefinition:
        '引导=通过信息组织、节奏、语气、选择架构和反馈设计影响对方理解或互动方向；只在专家分析层建模，发送前接受独立审计。',
      controlDefinition:
        '控制=试图改变目标对象情感、判断或行为轨迹的高强度影响变量；在实验阶段用于识别效果和风险，不直接等同于可发送动作。',
      experimentalQuestion:
        '在已知身份、关系阶段、历史上下文和目标约束下，不同专家强度是否会改变回复建议、关系推进节奏和目标对象反馈。',
      safetyReviewStage: 'pre_send_gate'
    },
    experts: EXPERT_MATRIX_DEFAULT_EXPERTS.reduce<Record<string, ExpertMatrixExpertConfig>>((acc, expert) => {
      acc[expert.id] = {
        enabled: true,
        intensity: 100,
        apiMode: 'deterministic',
        providerRef: '',
        allowWeightImpact: true,
        role: expert.defaultRole
      }
      return acc
    }, {})
  }
}

function clampPercent(value: unknown, fallback = 100): number {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.min(100, Math.max(0, Math.round(numberValue)))
}

function normalizeExpertMatrixSettings(raw: any): ExpertMatrixConfig {
  const defaults = defaultExpertMatrixConfig()
  const rawBoundary = raw?.guidanceControlBoundary || raw?.guidance_control_boundary || {}
  const rawExperts = raw?.experts || {}
  const experts = EXPERT_MATRIX_DEFAULT_EXPERTS.reduce<Record<string, ExpertMatrixExpertConfig>>((acc, expert) => {
    const existing = rawExperts[expert.id] || {}
    acc[expert.id] = {
      ...defaults.experts[expert.id],
      ...existing,
      enabled: existing.enabled !== false,
      intensity: clampPercent(existing.intensity, defaults.experts[expert.id].intensity),
      apiMode: existing.apiMode || existing.api_mode || defaults.experts[expert.id].apiMode,
      providerRef: existing.providerRef || existing.provider_ref || '',
      allowWeightImpact: existing.allowWeightImpact !== false && existing.allow_weight_impact !== false,
      role: existing.role || expert.defaultRole
    }
    return acc
  }, {})

  return {
    ...defaults,
    ...(raw || {}),
    enabled: raw?.enabled !== false,
    mode: raw?.mode || defaults.mode,
    primaryExpertId: raw?.primaryExpertId || raw?.primary_expert_id || defaults.primaryExpertId,
    globalIntensity: clampPercent(raw?.globalIntensity ?? raw?.global_intensity, defaults.globalIntensity),
    guidanceControlBoundary: {
      ...defaults.guidanceControlBoundary,
      ...rawBoundary,
      guidanceDefinition:
        rawBoundary.guidanceDefinition ||
        rawBoundary.guidance_definition ||
        defaults.guidanceControlBoundary.guidanceDefinition,
      controlDefinition:
        rawBoundary.controlDefinition ||
        rawBoundary.control_definition ||
        defaults.guidanceControlBoundary.controlDefinition,
      experimentalQuestion:
        rawBoundary.experimentalQuestion ||
        rawBoundary.experimental_question ||
        defaults.guidanceControlBoundary.experimentalQuestion,
      safetyReviewStage: 'pre_send_gate'
    },
    experts
  }
}

function defaultExpertProviderRegistryConfig(): ExpertProviderRegistryConfig {
  return {
    defaultProviderRef: DEFAULT_EXPERT_PROVIDER_ID,
    providers: [
      {
        id: DEFAULT_EXPERT_PROVIDER_ID,
        label: DEFAULT_EXPERT_PROVIDER_LABEL,
        kind: 'openai_compatible',
        enabled: true,
        apiKey: '',
        model: DEFAULT_EXPERT_PROVIDER_MODEL,
        baseURL: DEFAULT_EXPERT_PROVIDER_BASE_URL
      }
    ]
  }
}

function normalizeExpertProviderRegistrySettings(raw: any): ExpertProviderRegistryConfig {
  const defaults = defaultExpertProviderRegistryConfig()
  const rawProviders = Array.isArray(raw?.providers) ? raw.providers : defaults.providers
  const providers = rawProviders
    .map((provider: any, index: number) => {
      const id = String(provider?.id || (index === 0 ? DEFAULT_EXPERT_PROVIDER_ID : `expert-provider-${index + 1}`)).trim()
      return {
        id: id || `expert-provider-${index + 1}`,
        label: String(provider?.label || (id === DEFAULT_EXPERT_PROVIDER_ID ? DEFAULT_EXPERT_PROVIDER_LABEL : id)).trim(),
        kind: 'openai_compatible' as const,
        enabled: provider?.enabled !== false,
        apiKey: String(provider?.apiKey || ''),
        model: String(provider?.model || DEFAULT_EXPERT_PROVIDER_MODEL),
        baseURL: String(provider?.baseURL || provider?.baseUrl || DEFAULT_EXPERT_PROVIDER_BASE_URL)
      }
    })
    .filter((provider: ExpertProviderConfig, index: number, all: ExpertProviderConfig[]) =>
      Boolean(provider.id) && all.findIndex((item) => item.id === provider.id) === index
    )
  const safeProviders = providers.length > 0 ? providers : defaults.providers
  const defaultProviderRef = String(raw?.defaultProviderRef || raw?.default_provider_ref || defaults.defaultProviderRef)
  return {
    defaultProviderRef: safeProviders.some((provider) => provider.id === defaultProviderRef)
      ? defaultProviderRef
      : safeProviders[0].id,
    providers: safeProviders
  }
}

interface AppSettings {
  locale: 'zh' | 'en'
  appType: AppType
  runtimeMode: 'auto_reply' | 'zhineng_bridge'
  vision: {
    apiKey: string
  }
  chatProvider: {
    manifestUrl: string
    installed: InstalledProviderInfo | null
    config: Record<string, any>
  }
  // 默认抓取策略（仅当 appType 没有 per-app 覆盖时生效）
  defaultCaptureStrategy: CaptureStrategy
  // 每个 appType 独立保存的策略 + 框选区域
  capture: Partial<Record<AppType, PerAppCapture>>
  expertMatrix: ExpertMatrixConfig
  expertProviderRegistry: ExpertProviderRegistryConfig
}

type ProviderConfigFieldType = 'text' | 'password' | 'url' | 'select' | 'textarea'

type ProviderConfigField = {
  key: string
  label: string
  type: ProviderConfigFieldType
  required?: boolean
  readonly?: boolean
  placeholder?: string
  hint?: string
  defaultValue?: string
  options?: Array<{ label: string; value: string }>
}

type ProviderCatalogItem = {
  id: string
  name: string
  description?: string
  version: string
  manifestUrl: string
  capabilities?: string[]
  configSchema: {
    fields: ProviderConfigField[]
  }
}

type ProviderHubCache = {
  sourceUrl: string
  fetchedAt: string
  providers: ProviderCatalogItem[]
}

type ProviderHubEntry = {
  id?: unknown
  enabled?: unknown
  manifestUrl?: unknown
}

type ProviderHubManifest = {
  id?: unknown
  name?: unknown
  description?: unknown
  version?: unknown
  capabilities?: unknown
  configSchema?: unknown
}

const DEFAULT_PROVIDER_HUB_URL =
  process.env.SIGHTFLOW_PROVIDER_HUB_URL || 'https://sightflow.dev/provider-hub.json'
const PROVIDER_HUB_CACHE_KEY = 'providerHubCache'

const settingsStore = new StoreClass({
  name: 'settings',
  defaults: {
    locale: 'zh',
    appType: 'wechat',
    vision: { apiKey: '' },
    chatProvider: {
      manifestUrl: '',
      installed: null,
      config: {}
    },
    runtimeMode: 'zhineng_bridge',
    defaultCaptureStrategy: 'auto',
    capture: {},
    expertMatrix: defaultExpertMatrixConfig(),
    expertProviderRegistry: defaultExpertProviderRegistryConfig()
  }
})

let runtime: RuntimeHost<any> | null = null
let runtimeDevice: DesktopDevice | null = null
let settingsWindow: BrowserWindow | null = null
let zhinengConsoleWindow: BrowserWindow | null = null
let zhinengDockWindow: BrowserWindow | null = null
let zhinengGraphWindow: BrowserWindow | null = null
let zhinengTray: Tray | null = null
let zhinengQuitRequested = false
let statusDialogueMediaPermissionHandlersInstalled = false
let zhinengDockTimer: NodeJS.Timeout | null = null
let zhinengDecisionStateWatcher: FSWatcher | null = null
let zhinengDecisionStateBroadcastTimer: NodeJS.Timeout | null = null
let zhinengDecisionStateLastFingerprint = ''

function zhinengProjectRoot(): string {
  if (process.env.ZHINENG_PROJECT_ROOT) return process.env.ZHINENG_PROJECT_ROOT

  const candidates = [
    resolve(process.cwd(), '..'),
    process.cwd(),
    resolve(app.getAppPath(), '..'),
    resolve(app.getAppPath(), '..', '..'),
    resolve(app.getAppPath(), '..', '..', '..')
  ]
  const found = candidates.find((candidate) =>
    existsSync(join(candidate, 'scripts', 'ingest-desktop-real-intake.mjs'))
  )
  return found || resolve(app.getAppPath(), '..')
}

function compactTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}

function writeStatusDialogueRuntimeLog(event: string, payload: Record<string, unknown> = {}): void {
  try {
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
  } catch {
    // Runtime logging must never block voice input fallback.
  }
}

type StatusDialogueTtsAudioCacheEntry = {
  schema: 'status_dialogue_tts_audio_cache.v1'
  cache_key: string
  generated_at: string
  adapter_id: string
  voice_profile_id: string
  audio_data_url: string
  audio_mime_type: string
  text_length: number
  emotion_hint: string
}

function statusDialogueTtsCachePath(cacheKey: string): string {
  const cacheDir = join(zhinengProjectRoot(), 'runtime', 'voice-audio-cache')
  const fileName = `${createHash('sha256').update(cacheKey).digest('hex')}.json`
  return join(cacheDir, fileName)
}

function readStatusDialogueTtsAudioCache(cacheKey: string): StatusDialogueTtsAudioCacheEntry | null {
  try {
    if (process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_CACHE === '0') return null
    const cachePath = statusDialogueTtsCachePath(cacheKey)
    if (!existsSync(cachePath)) return null
    const parsed = JSON.parse(readFileSync(cachePath, 'utf8')) as Partial<StatusDialogueTtsAudioCacheEntry>
    if (
      parsed.schema !== 'status_dialogue_tts_audio_cache.v1' ||
      parsed.cache_key !== cacheKey ||
      typeof parsed.audio_data_url !== 'string' ||
      !parsed.audio_data_url.startsWith('data:') ||
      typeof parsed.audio_mime_type !== 'string'
    ) {
      return null
    }
    return parsed as StatusDialogueTtsAudioCacheEntry
  } catch {
    return null
  }
}

function writeStatusDialogueTtsAudioCache(entry: StatusDialogueTtsAudioCacheEntry): void {
  try {
    if (process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_CACHE === '0') return
    const cachePath = statusDialogueTtsCachePath(entry.cache_key)
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
  } catch {
    // Voice output must still work when disk cache is unavailable.
  }
}

function normalizeExpectedStatusModules(raw: unknown): ExpectedStatusModule[] {
  if (!Array.isArray(raw)) return []
  const modules = raw
    .map((item) => normalizeExpectedStatusModule(item))
    .filter((item): item is ExpectedStatusModule => item !== null)
  const seen = new Set<string>()
  return modules.filter((item) => {
    if (seen.has(item.module_id)) return false
    seen.add(item.module_id)
    return true
  })
}

function safeStatusDialogueBaseUrlHost(baseURL: string): string {
  try {
    return new URL(baseURL).host
  } catch {
    return baseURL ? 'invalid_base_url' : 'not_configured'
  }
}

function normalizeBrowserSpeechCapabilities(raw: unknown): StatusDialogueBrowserSpeechCapabilities {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    mediaDevicesAvailable: source.mediaDevicesAvailable === true,
    getUserMediaAvailable: source.getUserMediaAvailable === true,
    mediaRecorderAvailable: source.mediaRecorderAvailable === true,
    speechSynthesisAvailable: source.speechSynthesisAvailable === true,
    speechRecognitionAvailable: source.speechRecognitionAvailable === true,
    secureContext: source.secureContext === true
  }
}

function getStatusDialogueProviderReadiness(): StatusDialogueProviderReadiness & {
  apiKey: string
  baseURL: string
} {
  const settings = normalizeSettings(settingsStore.store)
  const providerConfig = settings.chatProvider.config || {}
  const apiKey =
    typeof providerConfig.apiKey === 'string' && providerConfig.apiKey ? providerConfig.apiKey : settings.vision.apiKey
  const model =
    typeof providerConfig.model === 'string' && providerConfig.model ? providerConfig.model : FIXED_ARK_MODEL
  const baseURL =
    typeof providerConfig.baseURL === 'string' && providerConfig.baseURL
      ? providerConfig.baseURL
      : typeof providerConfig.baseUrl === 'string' && providerConfig.baseUrl
        ? providerConfig.baseUrl
        : FIXED_ARK_BASE_URL
  const providerLabel = settings.chatProvider.installed?.id || 'openai-compatible'

  return {
    configured: Boolean(apiKey && model && baseURL),
    api_key_configured: Boolean(apiKey),
    model,
    baseURL,
    base_url_host: safeStatusDialogueBaseUrlHost(baseURL),
    provider_label: providerLabel,
    apiKey
  }
}

function getStatusDialogueTtsConfig(): StatusDialogueTtsAdapterConfig {
  const settings = normalizeSettings(settingsStore.store)
  const providerConfig = settings.chatProvider.config || {}
  const raw =
    providerConfig.statusDialogueTts ||
    providerConfig.status_dialogue_tts ||
    providerConfig.cosyVoice ||
    providerConfig.cosyvoice ||
    {}

  return normalizeStatusDialogueTtsConfig({
    ...raw,
    adapter_id:
      process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_ADAPTER_ID ||
      process.env.STATUS_DIALOGUE_TTS_ADAPTER_ID ||
      raw.adapter_id ||
      raw.adapterId,
    enabled: process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_ENABLED
      ? process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_ENABLED !== '0'
      : raw.enabled,
    base_url:
      process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_BASE_URL ||
      process.env.STATUS_DIALOGUE_TTS_BASE_URL ||
      process.env.SIGHTFLOW_COSYVOICE_BASE_URL ||
      raw.base_url ||
      raw.baseURL,
    endpoint_path:
      process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_ENDPOINT ||
      process.env.STATUS_DIALOGUE_TTS_ENDPOINT ||
      process.env.SIGHTFLOW_COSYVOICE_ENDPOINT ||
      raw.endpoint_path ||
      raw.endpointPath,
    health_path:
      process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_HEALTH_PATH ||
      process.env.STATUS_DIALOGUE_TTS_HEALTH_PATH ||
      process.env.SIGHTFLOW_COSYVOICE_HEALTH_PATH ||
      raw.health_path ||
      raw.healthPath,
    api_key:
      process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_API_KEY ||
      process.env.STATUS_DIALOGUE_TTS_API_KEY ||
      process.env.SIGHTFLOW_COSYVOICE_API_KEY ||
      raw.api_key ||
      raw.apiKey,
    model:
      process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_MODEL ||
      process.env.STATUS_DIALOGUE_TTS_MODEL ||
      process.env.SIGHTFLOW_COSYVOICE_MODEL ||
      raw.model,
    voice:
      process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_VOICE ||
      process.env.STATUS_DIALOGUE_TTS_VOICE ||
      process.env.SIGHTFLOW_COSYVOICE_VOICE ||
      raw.voice,
    payload_mode:
      process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_PAYLOAD_MODE ||
      process.env.STATUS_DIALOGUE_TTS_PAYLOAD_MODE ||
      process.env.SIGHTFLOW_COSYVOICE_PAYLOAD_MODE ||
      raw.payload_mode ||
      raw.payloadMode,
    response_format:
      process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_RESPONSE_FORMAT ||
      process.env.STATUS_DIALOGUE_TTS_RESPONSE_FORMAT ||
      process.env.SIGHTFLOW_COSYVOICE_RESPONSE_FORMAT ||
      raw.response_format ||
      raw.responseFormat,
    allow_remote: process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_ALLOW_REMOTE
      ? process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_ALLOW_REMOTE === '1'
      : process.env.STATUS_DIALOGUE_TTS_ALLOW_REMOTE
        ? process.env.STATUS_DIALOGUE_TTS_ALLOW_REMOTE === '1'
        : process.env.SIGHTFLOW_COSYVOICE_ALLOW_REMOTE
          ? process.env.SIGHTFLOW_COSYVOICE_ALLOW_REMOTE === '1'
      : raw.allow_remote ?? raw.allowRemote,
    stream_preferred: process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_STREAM
      ? process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_STREAM !== '0'
      : process.env.STATUS_DIALOGUE_TTS_STREAM
        ? process.env.STATUS_DIALOGUE_TTS_STREAM !== '0'
        : process.env.SIGHTFLOW_COSYVOICE_STREAM
          ? process.env.SIGHTFLOW_COSYVOICE_STREAM !== '0'
      : raw.stream_preferred ?? raw.streamPreferred,
    timeout_ms: process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_TIMEOUT_MS
      ? Number(process.env.SIGHTFLOW_STATUS_DIALOGUE_TTS_TIMEOUT_MS)
      : process.env.STATUS_DIALOGUE_TTS_TIMEOUT_MS
        ? Number(process.env.STATUS_DIALOGUE_TTS_TIMEOUT_MS)
        : process.env.SIGHTFLOW_COSYVOICE_TIMEOUT_MS
          ? Number(process.env.SIGHTFLOW_COSYVOICE_TIMEOUT_MS)
          : raw.timeout_ms ?? raw.timeoutMs
  })
}

function buildStatusDialogueTtsUrl(config: StatusDialogueTtsAdapterConfig, pathValue: string): URL {
  return buildStatusDialogueRelativeUrl(config.base_url, pathValue)
}

function isLoopbackTtsUrl(url: URL): boolean {
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

function ensureAllowedStatusDialogueTtsUrl(config: StatusDialogueTtsAdapterConfig, url: URL): void {
  if (config.allow_remote) return
  if (!isLoopbackTtsUrl(url)) {
    throw new Error('CosyVoice adapter is limited to localhost unless allow_remote is enabled')
  }
}

function statusDialogueTtsHeaders(config: StatusDialogueTtsAdapterConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'audio/*, application/json'
  }
  if (config.api_key) {
    headers.authorization = `Bearer ${config.api_key}`
  }
  return headers
}

async function fetchWithTimeout(url: URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function statusDialogueNoProxyMatches(hostname: string, noProxyValue: string | undefined): boolean {
  if (!noProxyValue) return false
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return noProxyValue
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .some((item) => {
      if (item === '*') return true
      if (item.startsWith('.')) return host === item.slice(1) || host.endsWith(item)
      return host === item || host.endsWith(`.${item}`)
    })
}

function statusDialogueProxyUrlFor(targetUrl: URL): URL | undefined {
  if (targetUrl.protocol !== 'https:') return undefined
  if (statusDialogueNoProxyMatches(targetUrl.hostname, process.env.NO_PROXY || process.env.no_proxy)) return undefined
  const rawProxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  if (!rawProxy || !rawProxy.trim()) return undefined
  try {
    const proxyUrl = new URL(rawProxy.trim())
    if (proxyUrl.protocol !== 'http:' && proxyUrl.protocol !== 'https:') return undefined
    return proxyUrl
  } catch {
    return undefined
  }
}

function safeStatusDialogueProxyHost(proxyUrl?: URL): string | undefined {
  if (!proxyUrl) return undefined
  return proxyUrl.port ? `${proxyUrl.hostname}:${proxyUrl.port}` : proxyUrl.hostname
}

function buildStatusDialogueMultipartBody(input: {
  fields: Record<string, string | undefined>
  files: Array<{ name: string; filename: string; contentType: string; data: Buffer }>
}): { contentType: string; body: Buffer } {
  const boundary = `----zhineng-status-dialogue-${randomBytes(12).toString('hex')}`
  const chunks: Buffer[] = []
  const appendLine = (value: string): void => {
    chunks.push(Buffer.from(`${value}\r\n`, 'utf8'))
  }
  for (const [name, value] of Object.entries(input.fields)) {
    if (value === undefined || value === '') continue
    appendLine(`--${boundary}`)
    appendLine(`Content-Disposition: form-data; name="${name}"`)
    appendLine('')
    appendLine(value)
  }
  for (const file of input.files) {
    appendLine(`--${boundary}`)
    appendLine(`Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"`)
    appendLine(`Content-Type: ${file.contentType}`)
    appendLine('')
    chunks.push(file.data)
    chunks.push(Buffer.from('\r\n', 'utf8'))
  }
  appendLine(`--${boundary}--`)
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat(chunks)
  }
}

async function postStatusDialogueMultipartViaProxy(input: {
  url: URL
  proxyUrl: URL
  headers: Record<string, string>
  body: Buffer
  timeoutMs: number
}): Promise<{ ok: boolean; status: number; text: string; latency_ms: number; proxy_host: string }> {
  const startedAt = Date.now()
  return await new Promise((resolvePromise, rejectPromise) => {
    const agent = new HttpsProxyAgent(input.proxyUrl) as unknown as https.Agent
    const request = https.request(
      input.url,
      {
        method: 'POST',
        headers: {
          ...input.headers,
          'content-length': String(input.body.length)
        },
        agent
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        response.on('end', () => {
          resolvePromise({
            ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
            status: response.statusCode ?? 0,
            text: Buffer.concat(chunks).toString('utf8'),
            latency_ms: Date.now() - startedAt,
            proxy_host: safeStatusDialogueProxyHost(input.proxyUrl) || 'configured_proxy'
          })
        })
      }
    )
    request.setTimeout(input.timeoutMs, () => {
      request.destroy(new Error('remote STT request timed out'))
    })
    request.on('error', rejectPromise)
    request.write(input.body)
    request.end()
  })
}

async function postStatusDialogueBufferViaProxy(input: {
  url: URL
  proxyUrl: URL
  headers: Record<string, string>
  body: Buffer
  timeoutMs: number
}): Promise<{ ok: boolean; status: number; text: string; latency_ms: number; proxy_host: string }> {
  return await postStatusDialogueMultipartViaProxy(input)
}

function audioMimeFromFormat(format: StatusDialogueTtsAdapterConfig['response_format']): string {
  if (format === 'mp3') return 'audio/mpeg'
  if (format === 'opus') return 'audio/ogg; codecs=opus'
  if (format === 'pcm') return 'audio/pcm'
  return 'audio/wav'
}

const EDGE_READALOUD_TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const EDGE_READALOUD_DEFAULT_CHROMIUM_VERSION = '143.0.3650.75'

function edgeChromiumMajor(version = EDGE_READALOUD_DEFAULT_CHROMIUM_VERSION): string {
  return String(version).split('.')[0] || '143'
}

function buildEdgeReadAloudSecMsGec(version = EDGE_READALOUD_DEFAULT_CHROMIUM_VERSION): {
  value: string
  version: string
} {
  const windowsEpochSeconds = 11644473600
  let trustedSeconds = Date.now() / 1000 + windowsEpochSeconds
  trustedSeconds -= trustedSeconds % 300
  const ticks = Math.floor(trustedSeconds * 10_000_000)
  return {
    value: createHash('sha256').update(`${ticks}${EDGE_READALOUD_TRUSTED_CLIENT_TOKEN}`, 'ascii').digest('hex').toUpperCase(),
    version: `1-${version}`
  }
}

function edgeBrowserTimestamp(): string {
  return new Date().toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)')
}

function escapeEdgeSsml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildEdgeClientTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8')
  let header: Buffer
  if (payload.length < 126) {
    header = Buffer.from([0x81, 0x80 | payload.length])
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 0x80 | 126
    header.writeUInt16BE(payload.length, 2)
  } else {
    throw new Error('Edge Read Aloud WebSocket frame too large')
  }

  const mask = randomBytes(4)
  const frame = Buffer.alloc(header.length + mask.length + payload.length)
  header.copy(frame, 0)
  mask.copy(frame, header.length)
  for (let index = 0; index < payload.length; index += 1) {
    frame[header.length + mask.length + index] = payload[index] ^ mask[index % mask.length]
  }
  return frame
}

function parseEdgeWebSocketFrames(
  buffer: Buffer,
  onFrame: (frame: { opcode: number; payload: Buffer }) => void
): Buffer {
  let cursor = 0
  while (buffer.length - cursor >= 2) {
    const b0 = buffer[cursor]
    const b1 = buffer[cursor + 1]
    const opcode = b0 & 0x0f
    let length = b1 & 0x7f
    let offset = cursor + 2
    if (length === 126) {
      if (buffer.length - offset < 2) break
      length = buffer.readUInt16BE(offset)
      offset += 2
    } else if (length === 127) {
      if (buffer.length - offset < 8) break
      const bigLength = buffer.readBigUInt64BE(offset)
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Unsupported large Edge Read Aloud frame')
      length = Number(bigLength)
      offset += 8
    }

    let mask: Buffer | undefined
    if (b1 & 0x80) {
      if (buffer.length - offset < 4) break
      mask = buffer.subarray(offset, offset + 4)
      offset += 4
    }

    if (buffer.length - offset < length) break
    const payload = Buffer.from(buffer.subarray(offset, offset + length))
    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % mask.length]
      }
    }
    onFrame({ opcode, payload })
    cursor = offset + length
  }
  return Buffer.from(buffer.subarray(cursor))
}

function buildEdgeReadAloudHandshakeRequest(input: {
  host: string
  requestPath: string
  chromiumVersion: string
}): string {
  const key = randomBytes(16).toString('base64')
  const major = edgeChromiumMajor(input.chromiumVersion)
  const userAgent =
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
    `(KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`

  return [
    `GET ${input.requestPath} HTTP/1.1`,
    `Host: ${input.host}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
    'Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    `User-Agent: ${userAgent}`,
    'Pragma: no-cache',
    'Cache-Control: no-cache',
    `Cookie: muid=${randomBytes(16).toString('hex').toUpperCase()};`,
    '',
    ''
  ].join('\r\n')
}

function buildEdgeSpeechConfig(outputFormat: string): string {
  return (
    `X-Timestamp:${edgeBrowserTimestamp()}\r\n` +
    'Content-Type:application/json; charset=utf-8\r\n' +
    'Path:speech.config\r\n\r\n' +
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: 'false',
              wordBoundaryEnabled: 'false'
            },
            outputFormat
          }
        }
      }
    }) +
    '\r\n'
  )
}

function buildEdgeSsmlMessage(input: { text: string; voice: string; locale: string }): string {
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${input.locale}'>` +
    `<voice name='${input.voice}'>${escapeEdgeSsml(input.text)}</voice></speak>`

  return (
    `X-RequestId:${randomUUID().replace(/-/g, '')}\r\n` +
    'Content-Type:application/ssml+xml\r\n' +
    `X-Timestamp:${edgeBrowserTimestamp()}\r\n` +
    'Path:ssml\r\n\r\n' +
    ssml
  )
}

function synthesizeEdgeReadAloudStream(input: {
  text: string
  voice: string
  locale: string
  outputFormat: string
  chromiumVersion?: string
  timeoutMs: number
}): Promise<{
  first_audio_payload_ms?: number
  total_stream_ms: number
  audio_frame_count: number
  audio_bytes: number
  final_frame_count: number
  audio_base64: string
}> {
  return new Promise((resolvePromise, rejectPromise) => {
    const startedAt = Date.now()
    const chromiumVersion = input.chromiumVersion || EDGE_READALOUD_DEFAULT_CHROMIUM_VERSION
    const secMsGec = buildEdgeReadAloudSecMsGec(chromiumVersion)
    const host = 'speech.platform.bing.com'
    const connectionId = randomUUID().replace(/-/g, '')
    const requestPath =
      `/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_READALOUD_TRUSTED_CLIENT_TOKEN}` +
      `&ConnectionId=${connectionId}&Sec-MS-GEC=${secMsGec.value}&Sec-MS-GEC-Version=${secMsGec.version}`
    const audioFrames: Buffer[] = []
    let firstAudioMs: number | undefined
    let finalFrameCount = 0
    let turnEnded = false
    let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)
    let handshaken = false
    let settled = false
    let audioIdleTimer: NodeJS.Timeout | undefined

    const socket = tls.connect(443, host, { servername: host })
    const cleanup = (): void => {
      clearTimeout(timeout)
      if (audioIdleTimer) clearTimeout(audioIdleTimer)
      settled = true
      try {
        socket.destroy()
      } catch {
        // Best effort cleanup only.
      }
    }
    const fail = (error: Error): void => {
      if (settled) return
      cleanup()
      rejectPromise(error)
    }
    const complete = (): void => {
      if (settled) return
      cleanup()
      resolvePromise({
        first_audio_payload_ms: firstAudioMs,
        total_stream_ms: Date.now() - startedAt,
        audio_frame_count: audioFrames.length,
        audio_bytes: audioFrames.reduce((total, item) => total + item.length, 0),
        final_frame_count: finalFrameCount,
        audio_base64: Buffer.concat(audioFrames).toString('base64')
      })
    }
    const scheduleAudioIdleComplete = (): void => {
      if (audioIdleTimer) clearTimeout(audioIdleTimer)
      audioIdleTimer = setTimeout(() => {
        if (!settled && audioFrames.length > 0) complete()
      }, 900)
    }
    const timeout = setTimeout(() => {
      fail(new Error(`Edge Read Aloud streaming TTS timed out after ${input.timeoutMs}ms`))
    }, input.timeoutMs)

    socket.on('error', fail)
    socket.on('secureConnect', () => {
      socket.write(buildEdgeReadAloudHandshakeRequest({ host, requestPath, chromiumVersion }))
    })
    socket.on('data', (chunk) => {
      try {
        buffer = Buffer.concat([buffer, Buffer.from(chunk)])
        if (!handshaken) {
          const headerEnd = buffer.indexOf('\r\n\r\n')
          if (headerEnd < 0) return
          const header = buffer.subarray(0, headerEnd).toString('latin1')
          if (!header.includes('101')) {
            fail(new Error(`Edge Read Aloud handshake failed: ${header.split('\r\n')[0] || 'unknown'}`))
            return
          }
          handshaken = true
          buffer = Buffer.from(buffer.subarray(headerEnd + 4))
          socket.write(buildEdgeClientTextFrame(buildEdgeSpeechConfig(input.outputFormat)))
          socket.write(buildEdgeClientTextFrame(buildEdgeSsmlMessage(input)))
        }

        buffer = parseEdgeWebSocketFrames(buffer, ({ opcode, payload }) => {
          if (opcode === 8) {
            turnEnded = true
            return
          }
          if (opcode === 1) {
            const text = payload.toString('utf8')
            if (text.includes('Path:turn.end')) {
              turnEnded = true
            }
            return
          }
          if (opcode !== 2 || payload.length < 2) return
          const headerLength = payload.readUInt16BE(0)
          if (payload.length < 2 + headerLength) return
          const headers = payload.subarray(2, 2 + headerLength).toString('utf8')
          const body = payload.subarray(2 + headerLength)
          if (headers.includes('Path:audio') && body.length > 0) {
            firstAudioMs = firstAudioMs ?? Date.now() - startedAt
            audioFrames.push(body)
            scheduleAudioIdleComplete()
          } else if (headers.includes('Path:audio')) {
            finalFrameCount += 1
          } else if (headers.includes('Path:turn.end')) {
            finalFrameCount += 1
            turnEnded = true
          }
        })

        if (turnEnded && audioFrames.length > 0) complete()
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)))
      }
    })
    socket.on('end', () => {
      if (!settled && audioFrames.length > 0) complete()
    })
  })
}

function maybeAudioDataUrlFromJson(json: unknown, fallbackMime: string): { dataUrl?: string; mime?: string } {
  if (!json || typeof json !== 'object') return {}
  const source = json as Record<string, any>
  const direct = source.audio_data_url || source.audioDataUrl || source.data_url || source.dataUrl
  if (typeof direct === 'string' && direct.startsWith('data:')) {
    return { dataUrl: direct, mime: direct.slice(5, direct.indexOf(';')) || fallbackMime }
  }
  const base64 = source.audio_base64 || source.audioBase64 || source.b64_json || source.data
  if (typeof base64 === 'string' && base64.trim()) {
    const mime = typeof source.mime_type === 'string' ? source.mime_type : fallbackMime
    return { dataUrl: `data:${mime};base64,${base64.trim()}`, mime }
  }
  const url = source.audio_url || source.audioUrl || source.url
  if (typeof url === 'string' && url.trim()) {
    return { dataUrl: url.trim(), mime: fallbackMime }
  }
  return {}
}

interface StatusDialogueSttTranscriptionRequest {
  audio_data_url?: string
  audioDataUrl?: string
  mime_type?: string
  mimeType?: string
  language?: string
  model?: string
  adapter_id?: 'local_whisper_persistent_service' | 'local_whisper_ipc' | 'openai_compatible_stt'
  adapterId?: 'local_whisper_persistent_service' | 'local_whisper_ipc' | 'openai_compatible_stt'
  runtime_probe?: string
}

interface StatusDialogueSttTranscriptionResult {
  schema: 'status_dialogue_stt_transcription.v1'
  generated_at: string
  success: boolean
  adapter_id: 'local_whisper_ipc' | 'local_whisper_persistent_service' | 'openai_compatible_stt'
  provider: 'openai_whisper_local' | 'openai_compatible_remote' | 'cloudflare_workers_ai'
  transcript?: string
  language?: string
  model?: string
  latency_ms?: number
  error?: string
  fallback_reason?: string
}

interface StatusDialogueLocalSttHealthRequest {
  model?: string
  ensure?: boolean
}

interface StatusDialogueLocalSttHealthResult {
  schema: 'status_dialogue_local_stt_health.v1'
  generated_at: string
  adapter_id: 'local_whisper_persistent_service'
  configured: boolean
  reachable: boolean
  status: 'ready' | 'fallback' | 'error'
  base_url_host: string
  model: string
  loaded_models?: string[]
  default_model?: string
  device?: string
  uptime_ms?: number
  latency_ms?: number
  service_started?: boolean
  error?: string
}

interface StatusDialogueRemoteSttHealthResult {
  schema: 'status_dialogue_remote_stt_health.v1'
  generated_at: string
  adapter_id: 'openai_compatible_stt'
  configured: boolean
  reachable: boolean
  status: 'ready' | 'fallback' | 'error'
  base_url_host: string
  endpoint_path: string
  model: string
  timeout_ms: number
  latency_ms?: number
  error?: string
}

interface StatusDialogueRemoteSttConfiguredProbeResult {
  schema: 'status_dialogue_remote_stt_configured_probe.v1'
  generated_at: string
  success: boolean
  configured: boolean
  reachable: boolean
  adapter_id: 'openai_compatible_stt'
  provider: 'openai_compatible_remote' | 'cloudflare_workers_ai'
  audio_path?: string
  language: string
  transcript_length?: number
  latency_ms?: number
  error?: string
  fallback_reason?: string
  health?: StatusDialogueRemoteSttHealthResult
  transcription?: Record<string, any>
}

interface StatusDialogueChromeSttRequest {
  session_id?: string
  language?: string
  timeout_ms?: number
  visible?: boolean
  runtime_probe?: string
}

interface StatusDialogueChromeSttResult {
  schema: 'status_dialogue_chrome_stt_result.v1'
  generated_at: string
  success: boolean
  adapter_id: 'chrome_stt_bridge'
  provider: 'chrome_web_speech'
  session_id: string
  transcript?: string
  language?: string
  latency_ms?: number
  error?: string
  fallback_reason?: string
  events?: string[]
}

interface PendingChromeSttSession {
  startedAt: number
  language: string
  runtimeProbe?: string
  lastTranscript: string
  events: string[]
  timer: NodeJS.Timeout
  sender?: WebContents
  resolve: (result: StatusDialogueChromeSttResult) => void
}

let chromeSttBridgeServer: http.Server | null = null
let chromeSttBridgePort: number | null = null
const pendingChromeSttSessions = new Map<string, PendingChromeSttSession>()
let localWhisperServiceProcess: ReturnType<typeof spawn> | null = null
let localWhisperServiceStarting: Promise<boolean> | null = null

function getStatusDialogueSttPythonPath(): string {
  const configured = process.env.ZHINENG_STT_PYTHON
  if (configured && existsSync(configured)) return configured

  const candidate = join(zhinengProjectRoot(), 'third_party', 'envs', 'cosyvoice', process.platform === 'win32' ? 'python.exe' : 'bin/python')
  return candidate
}

function getStatusDialogueSttScriptPath(): string {
  const candidates = [
    join(process.cwd(), 'scripts', 'local-whisper-transcribe.py'),
    join(app.getAppPath(), 'scripts', 'local-whisper-transcribe.py'),
    join(zhinengProjectRoot(), 'sightflow-desktop-agent-main', 'scripts', 'local-whisper-transcribe.py')
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

function getStatusDialogueSttServiceScriptPath(): string {
  const candidates = [
    join(process.cwd(), 'scripts', 'local-whisper-service.py'),
    join(app.getAppPath(), 'scripts', 'local-whisper-service.py'),
    join(zhinengProjectRoot(), 'sightflow-desktop-agent-main', 'scripts', 'local-whisper-service.py')
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

function parseAudioDataUrl(dataUrl: string): { mime: string; data: Buffer } {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) throw new Error('audio_data_url must be a base64 data URL')
  const mime = match[1].toLowerCase()
  if (mime !== 'audio/wav' && mime !== 'audio/x-wav') {
    throw new Error(`unsupported STT audio mime: ${mime}`)
  }
  const data = Buffer.from(match[2], 'base64')
  if (data.length < 2048) throw new Error('audio sample is too small')
  if (data.length > 12 * 1024 * 1024) throw new Error('audio sample is too large')
  return { mime, data }
}

function findChromeExecutablePath(): string | null {
  const candidates =
    process.platform === 'win32'
      ? [
          join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null
}

function chromeSttProfileDir(): string {
  return join(zhinengProjectRoot(), 'runtime', 'chrome-stt-profile')
}

function cleanupChromeSttBridgeProcesses(): void {
  if (process.platform !== 'win32') return
  const profileDir = chromeSttProfileDir()
  const escapedProfileDir = profileDir.replace(/'/g, "''")
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `$bridgeProfile='${escapedProfileDir}'; Get-CimInstance Win32_Process | Where-Object { ($_.Name -match '^(chrome|msedge)\\.exe$') -and ($_.CommandLine -like "*$bridgeProfile*") } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
      ],
      { stdio: 'ignore', windowsHide: true, timeout: 5000 }
    )
  } catch {
    // Best-effort cleanup only; a failed cleanup should not block text fallback.
  }
}

function scheduleChromeSttBridgeCleanup(delayMs = 2000): void {
  const timer = setTimeout(() => {
    if (pendingChromeSttSessions.size === 0) cleanupChromeSttBridgeProcesses()
  }, delayMs)
  timer.unref?.()
}

function stopLocalWhisperService(): void {
  if (!localWhisperServiceProcess) return
  try {
    localWhisperServiceProcess.kill()
  } catch {
    // Best-effort cleanup; the service is only a local fallback helper.
  }
  localWhisperServiceProcess = null
}

function chromeSttBridgePage(sessionId: string, language: string): string {
  const safeSession = JSON.stringify(sessionId)
  const safeLanguage = JSON.stringify(language)
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Zhineng Chrome STT Bridge</title>
  <style>
    body { margin: 0; font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #e5eef9; background: #08111f; }
    main { padding: 18px; max-width: 520px; }
    h1 { font-size: 16px; margin: 0 0 10px; }
    button { border: 1px solid #3b82f6; background: #0f2a4d; color: #e5eef9; padding: 8px 12px; border-radius: 6px; cursor: pointer; }
    code, pre { color: #9dd7ff; white-space: pre-wrap; }
    .warn { color: #fbbf24; }
  </style>
</head>
<body>
  <main>
    <h1>Chrome STT Bridge</h1>
    <p id="status">Preparing microphone recognition...</p>
    <button id="start" type="button">Start recognition</button>
    <pre id="log"></pre>
  </main>
  <script>
    const sessionId = ${safeSession};
    const language = ${safeLanguage};
    const statusEl = document.getElementById('status');
    const logEl = document.getElementById('log');
    const startButton = document.getElementById('start');
    let started = false;
    let recognition = null;

    function write(line) {
      logEl.textContent = (line + '\\n' + logEl.textContent).slice(0, 4000);
    }

    async function post(payload) {
      try {
        await fetch('/status-dialogue/chrome-stt/event', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, ...payload })
        });
      } catch (error) {
        write('post failed: ' + (error && error.message ? error.message : String(error)));
      }
    }

    function finishSoon() {
      setTimeout(() => {
        try { window.close(); } catch {}
      }, 650);
    }

    function startRecognition() {
      if (started) return;
      started = true;
      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Ctor) {
        statusEl.textContent = 'Chrome SpeechRecognition is unavailable.';
        post({ type: 'error', error: 'speech_recognition_unavailable' });
        finishSoon();
        return;
      }

      recognition = new Ctor();
      recognition.lang = language;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        statusEl.textContent = 'Listening through Chrome...';
        write('recognition started');
        post({ type: 'start' });
      };
      recognition.onaudiostart = () => {
        write('audio started');
        post({ type: 'audio_start' });
      };
      recognition.onresult = (event) => {
        const finalParts = [];
        const interimParts = [];
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result && result[0] && result[0].transcript ? result[0].transcript.trim() : '';
          if (!transcript) continue;
          if (result.isFinal) finalParts.push(transcript);
          else interimParts.push(transcript);
        }
        const finalText = finalParts.join(' ').trim();
        const interimText = interimParts.join(' ').trim();
        const transcript = (finalText || interimText).trim();
        if (transcript) {
          statusEl.textContent = transcript;
          write((finalText ? 'final: ' : 'interim: ') + transcript);
          post({ type: finalText ? 'result' : 'interim', transcript, is_final: Boolean(finalText) });
          if (finalText) {
            try { recognition.stop(); } catch {}
            finishSoon();
          }
        }
      };
      recognition.onerror = (event) => {
        const error = event.error || 'unknown';
        statusEl.innerHTML = '<span class="warn">Recognition error: ' + error + '</span>';
        write('error: ' + error);
        post({ type: 'error', error, message: event.message || '' });
        finishSoon();
      };
      recognition.onend = () => {
        write('recognition ended');
        post({ type: 'end' });
      };

      try {
        recognition.start();
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        statusEl.innerHTML = '<span class="warn">Start failed: ' + message + '</span>';
        post({ type: 'error', error: 'start_exception', message });
        finishSoon();
      }
    }

    startButton.addEventListener('click', startRecognition);
    window.addEventListener('load', () => {
      post({ type: 'ready' });
      setTimeout(startRecognition, 350);
    });
  </script>
</body>
</html>`
}

function readHttpBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 128 * 1024) {
        rejectPromise(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolvePromise(body))
    req.on('error', rejectPromise)
  })
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  res.end(JSON.stringify(payload))
}

function completeChromeSttSession(
  sessionId: string,
  patch: Partial<StatusDialogueChromeSttResult>
): void {
  const pending = pendingChromeSttSessions.get(sessionId)
  if (!pending) return
  clearTimeout(pending.timer)
  const result: StatusDialogueChromeSttResult = {
    schema: 'status_dialogue_chrome_stt_result.v1',
    generated_at: new Date().toISOString(),
    success: patch.success === true,
    adapter_id: 'chrome_stt_bridge',
    provider: 'chrome_web_speech',
    session_id: sessionId,
    transcript: patch.transcript,
    language: patch.language ?? pending.language,
    latency_ms: Date.now() - pending.startedAt,
    error: patch.error,
    fallback_reason: patch.fallback_reason,
    events: pending.events.slice(-24)
  }
  writeStatusDialogueRuntimeLog('chrome_stt_complete', {
    session_id: sessionId,
    success: result.success,
    language: result.language,
    latency_ms: result.latency_ms,
    error: result.error,
    fallback_reason: result.fallback_reason,
    transcript_length: result.transcript?.length ?? 0,
    events: result.events,
    runtime_probe: pending.runtimeProbe
  })
  sendChromeSttProgress(sessionId, 'complete', {
    success: result.success,
    transcript: result.transcript,
    error: result.error,
    fallback_reason: result.fallback_reason,
    latency_ms: result.latency_ms
  })
  pendingChromeSttSessions.delete(sessionId)
  pending.resolve(result)
  scheduleChromeSttBridgeCleanup()
}

function sendChromeSttProgress(
  sessionId: string,
  type: string,
  payload: Record<string, unknown> = {}
): void {
  const pending = pendingChromeSttSessions.get(sessionId)
  if (!pending?.sender || pending.sender.isDestroyed()) return
  pending.sender.send('zhineng:status-dialogue:chrome-stt:event', {
    schema: 'status_dialogue_chrome_stt_progress.v1',
    generated_at: new Date().toISOString(),
    session_id: sessionId,
    type,
    events: pending.events.slice(-24),
    ...payload
  })
}

function handleChromeSttBridgeEvent(payload: Record<string, unknown>): { ok: boolean; reason?: string } {
  const sessionId = typeof payload.session_id === 'string' ? payload.session_id : ''
  const pending = pendingChromeSttSessions.get(sessionId)
  if (!sessionId || !pending) return { ok: false, reason: 'unknown_session' }
  const type = typeof payload.type === 'string' ? payload.type : 'unknown'
  const transcript = typeof payload.transcript === 'string' ? payload.transcript.trim() : ''
  const error = typeof payload.error === 'string' ? payload.error : undefined
  const message = typeof payload.message === 'string' ? payload.message : undefined
  pending.events.push(type)
  if (pending.events.length > 48) pending.events.splice(0, pending.events.length - 48)
  if (transcript) pending.lastTranscript = transcript
  sendChromeSttProgress(sessionId, type, {
    transcript,
    error,
    message,
    is_final: payload.is_final === true
  })
  if (type === 'result' && transcript) {
    completeChromeSttSession(sessionId, { success: true, transcript })
  } else if (type === 'error') {
    const error = typeof payload.error === 'string' ? payload.error : 'chrome_stt_error'
    completeChromeSttSession(sessionId, {
      success: false,
      error,
      fallback_reason: error === 'no-speech' ? 'no_speech' : 'chrome_stt_failed'
    })
  } else if (type === 'end') {
    if (pending.lastTranscript) {
      completeChromeSttSession(sessionId, { success: true, transcript: pending.lastTranscript })
    } else {
      const sawAudio = pending.events.includes('audio_start')
      completeChromeSttSession(sessionId, {
        success: false,
        error: sawAudio ? 'no-speech' : 'chrome_stt_ended_without_audio',
        fallback_reason: sawAudio ? 'no_speech' : 'ended_without_audio'
      })
    }
  }
  return { ok: true }
}

async function startChromeSttBridgeServer(): Promise<number> {
  if (chromeSttBridgeServer && chromeSttBridgePort) return chromeSttBridgePort
  chromeSttBridgeServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (req.method === 'GET' && url.pathname === '/status-dialogue/chrome-stt') {
        const sessionId = url.searchParams.get('session') || ''
        const language = url.searchParams.get('lang') || 'zh-CN'
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store'
        })
        res.end(chromeSttBridgePage(sessionId, language))
        return
      }
      if (req.method === 'POST' && url.pathname === '/status-dialogue/chrome-stt/event') {
        const body = await readHttpBody(req)
        const payload = JSON.parse(body) as Record<string, unknown>
        sendJson(res, 200, handleChromeSttBridgeEvent(payload))
        return
      }
      if (req.method === 'GET' && url.pathname === '/status-dialogue/chrome-stt/health') {
        sendJson(res, 200, {
          ok: true,
          pending_sessions: pendingChromeSttSessions.size
        })
        return
      }
      sendJson(res, 404, { ok: false, reason: 'not_found' })
    } catch (error: unknown) {
      sendJson(res, 500, { ok: false, reason: error instanceof Error ? error.message : String(error) })
    }
  })

  await new Promise<void>((resolvePromise, rejectPromise) => {
    chromeSttBridgeServer?.once('error', rejectPromise)
    chromeSttBridgeServer?.listen(0, '127.0.0.1', () => resolvePromise())
  })
  const address = chromeSttBridgeServer.address()
  if (!address || typeof address === 'string') throw new Error('Chrome STT bridge did not expose a TCP port')
  chromeSttBridgePort = address.port
  return chromeSttBridgePort
}

function chromeSttShouldShowWindow(requestVisible: boolean | undefined): boolean {
  if (requestVisible === true) return true
  if (requestVisible === false) return false
  return process.env.ZHINENG_CHROME_STT_VISIBLE === '1'
}

function launchChromeSttBridgePage(
  url: string,
  visible: boolean
): { ok: boolean; error?: string; fakeAudioPath?: string; fakeAudioExists?: boolean } {
  const chromePath = findChromeExecutablePath()
  if (!chromePath) return { ok: false, error: 'Chrome executable not found' }
  cleanupChromeSttBridgeProcesses()
  const profileDir = chromeSttProfileDir()
  mkdirSync(profileDir, { recursive: true })
  let resolvedTestAudioPath: string | undefined
  let fakeAudioExists = false
  const args = [
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--use-fake-ui-for-media-stream',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--autoplay-policy=no-user-gesture-required',
    `--app=${url}`
  ]
  const testAudioPath = process.env.ZHINENG_CHROME_STT_TEST_AUDIO
  if (testAudioPath) {
    resolvedTestAudioPath = resolve(testAudioPath)
    fakeAudioExists = existsSync(resolvedTestAudioPath)
    if (fakeAudioExists) {
      args.splice(
        args.length - 1,
        0,
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${resolvedTestAudioPath}`
      )
    }
  }
  if (!visible) {
    args.splice(args.length - 1, 0, '--window-position=-32000,-32000', '--window-size=360,240', '--start-minimized')
  }
  try {
    const child = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: !visible
    })
    child.unref()
    return { ok: true, fakeAudioPath: resolvedTestAudioPath, fakeAudioExists }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), fakeAudioPath: resolvedTestAudioPath, fakeAudioExists }
  }
}

async function transcribeStatusDialogueChromeStt(
  request?: StatusDialogueChromeSttRequest,
  sender?: WebContents
): Promise<StatusDialogueChromeSttResult> {
  const startedAt = Date.now()
  const sessionId = safePathSegment(request?.session_id || `chrome-stt-${compactTimestamp()}-${Math.random().toString(36).slice(2, 8)}`)
  const language = typeof request?.language === 'string' && request.language.trim() ? request.language.trim() : 'zh-CN'
  const timeoutMs = Math.max(3000, Math.min(60000, typeof request?.timeout_ms === 'number' ? request.timeout_ms : 22000))
  const runtimeProbe = typeof request?.runtime_probe === 'string' ? safePathSegment(request.runtime_probe) : undefined
  try {
    const port = await startChromeSttBridgeServer()
    const visible = chromeSttShouldShowWindow(request?.visible)
    const url = `http://127.0.0.1:${port}/status-dialogue/chrome-stt?session=${encodeURIComponent(sessionId)}&lang=${encodeURIComponent(language)}`
    writeStatusDialogueRuntimeLog('chrome_stt_start', {
      session_id: sessionId,
      language,
      timeout_ms: timeoutMs,
      visible,
      runtime_probe: runtimeProbe
    })
    const resultPromise = new Promise<StatusDialogueChromeSttResult>((resolvePromise) => {
      const timer = setTimeout(() => {
        completeChromeSttSession(sessionId, {
          success: false,
          error: 'chrome_stt_timeout',
          fallback_reason: 'timeout'
        })
      }, timeoutMs)
      pendingChromeSttSessions.set(sessionId, {
        startedAt,
        language,
        runtimeProbe,
        lastTranscript: '',
        events: [],
        timer,
        sender,
        resolve: resolvePromise
      })
    })
    const launch = launchChromeSttBridgePage(url, visible)
    writeStatusDialogueRuntimeLog('chrome_stt_bridge_launch', {
      session_id: sessionId,
      ok: launch.ok,
      visible,
      fake_audio_requested: Boolean(process.env.ZHINENG_CHROME_STT_TEST_AUDIO),
      fake_audio_path: launch.fakeAudioPath,
      fake_audio_exists: launch.fakeAudioExists,
      fake_audio_enabled: Boolean(launch.fakeAudioPath && launch.fakeAudioExists),
      runtime_probe: runtimeProbe
    })
    if (!launch.ok) {
      writeStatusDialogueRuntimeLog('chrome_stt_launch_failed', {
        session_id: sessionId,
        error: launch.error,
        runtime_probe: runtimeProbe
      })
      completeChromeSttSession(sessionId, {
        success: false,
        error: launch.error ?? 'chrome_stt_launch_failed',
        fallback_reason: 'launch_failed'
      })
    }
    return await resultPromise
  } catch (error: unknown) {
    writeStatusDialogueRuntimeLog('chrome_stt_bridge_failed', {
      session_id: sessionId,
      language,
      error: error instanceof Error ? error.message : String(error),
      runtime_probe: runtimeProbe
    })
    return {
      schema: 'status_dialogue_chrome_stt_result.v1',
      generated_at: new Date().toISOString(),
      success: false,
      adapter_id: 'chrome_stt_bridge',
      provider: 'chrome_web_speech',
      session_id: sessionId,
      language,
      latency_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      fallback_reason: 'bridge_failed'
    }
  }
}

function cancelStatusDialogueChromeStt(request?: StatusDialogueChromeSttRequest): { success: boolean } {
  const sessionId = typeof request?.session_id === 'string' ? request.session_id : ''
  if (!sessionId) return { success: false }
  completeChromeSttSession(sessionId, {
    success: false,
    error: 'chrome_stt_cancelled',
    fallback_reason: 'cancelled'
  })
  return { success: true }
}

async function removeTransientFile(filePath: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      if (existsSync(filePath)) unlinkSync(filePath)
      return
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 120 * (attempt + 1)))
    }
  }
}

function statusDialogueLocalWhisperServiceEnabled(): boolean {
  return process.env.ZHINENG_STT_PERSISTENT_SERVICE !== '0'
}

function statusDialogueLocalWhisperServicePort(): number {
  const configured = Number(process.env.ZHINENG_STT_SERVICE_PORT)
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 17858
}

function statusDialogueLocalWhisperServiceUrl(pathname: '/health' | '/transcribe'): URL {
  return new URL(`http://127.0.0.1:${statusDialogueLocalWhisperServicePort()}${pathname}`)
}

interface StatusDialogueRemoteSttConfig {
  provider: 'openai_compatible_remote' | 'cloudflare_workers_ai'
  enabled: boolean
  base_url: string
  endpoint_path: string
  api_key: string
  model: string
  timeout_ms: number
  account_id?: string
}

function safeStatusDialogueEndpointOrigin(value: unknown): string {
  const text = String(value || '')
  if (!/^https?:\/\//i.test(text)) return ''
  try {
    return new URL(text).origin
  } catch {
    return ''
  }
}

function statusDialogueUrlHost(value: unknown): string {
  const text = String(value || '')
  if (!/^https?:\/\//i.test(text)) return ''
  try {
    return new URL(text).host.toLowerCase()
  } catch {
    return ''
  }
}

function normalizeStatusDialogueRemoteSttProvider(value: unknown): StatusDialogueRemoteSttConfig['provider'] {
  const text = String(value || '').trim().toLowerCase()
  if (text === 'cloudflare' || text === 'cloudflare_workers_ai' || text === 'workers_ai') return 'cloudflare_workers_ai'
  return 'openai_compatible_remote'
}

function getStatusDialogueRemoteSttConfig(): StatusDialogueRemoteSttConfig {
  const settings = normalizeSettings(settingsStore.store)
  const providerConfig = settings.chatProvider.config || {}
  const raw =
    providerConfig.statusDialogueStt ||
    providerConfig.status_dialogue_stt ||
    {}
  const providerEnv = process.env.SIGHTFLOW_STATUS_DIALOGUE_STT_PROVIDER || process.env.STATUS_DIALOGUE_STT_PROVIDER
  const rawProvider = normalizeStatusDialogueRemoteSttProvider(raw.provider || raw.adapter || raw.adapter_id)
  const provider = normalizeStatusDialogueRemoteSttProvider(providerEnv || rawProvider)
  const providerChangedByEnv = Boolean(providerEnv) && provider !== rawProvider
  const accountId =
    process.env.SIGHTFLOW_STATUS_DIALOGUE_STT_CLOUDFLARE_ACCOUNT_ID ||
    process.env.STATUS_DIALOGUE_STT_CLOUDFLARE_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    raw.account_id ||
    raw.accountId ||
    raw.cloudflare_account_id ||
    raw.cloudflareAccountId ||
    ''
  const explicitBaseUrl =
    process.env.SIGHTFLOW_STATUS_DIALOGUE_STT_BASE_URL ||
    process.env.STATUS_DIALOGUE_STT_BASE_URL ||
    (!providerChangedByEnv ? raw.base_url || raw.baseURL : '') ||
    process.env.OPENAI_STT_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    (provider === 'cloudflare_workers_ai' ? 'https://api.cloudflare.com/client/v4' : '')
  const providerBaseUrl = providerConfig.baseURL || ''
  const allowProviderCredentialFallback =
    Boolean(providerConfig.apiKey) &&
    (!explicitBaseUrl || statusDialogueUrlHost(explicitBaseUrl) === statusDialogueUrlHost(providerBaseUrl))
  const apiKey =
    process.env.SIGHTFLOW_STATUS_DIALOGUE_STT_API_KEY ||
    process.env.STATUS_DIALOGUE_STT_API_KEY ||
    raw.api_key ||
    raw.apiKey ||
    (provider === 'cloudflare_workers_ai' ? process.env.CLOUDFLARE_API_TOKEN : '') ||
    process.env.OPENAI_STT_API_KEY ||
    process.env.OPENAI_API_KEY ||
    (allowProviderCredentialFallback ? providerConfig.apiKey : '') ||
    ''
  const baseUrl =
    explicitBaseUrl ||
    providerConfig.baseURL ||
    ''
  const endpointPath =
    process.env.SIGHTFLOW_STATUS_DIALOGUE_STT_ENDPOINT ||
    process.env.STATUS_DIALOGUE_STT_ENDPOINT ||
    (!providerChangedByEnv ? raw.endpoint_path || raw.endpointPath : '') ||
    process.env.OPENAI_AUDIO_TRANSCRIPTIONS_ENDPOINT ||
    process.env.OPENAI_STT_ENDPOINT ||
    (provider === 'cloudflare_workers_ai' && accountId
      ? `/accounts/${accountId}/ai/run/@cf/openai/whisper-large-v3-turbo`
      : provider === 'cloudflare_workers_ai'
        ? '/accounts/<account_id>/ai/run/@cf/openai/whisper-large-v3-turbo'
        : '/audio/transcriptions')
  const resolvedBaseUrl =
    baseUrl ||
    safeStatusDialogueEndpointOrigin(endpointPath)
  const model =
    process.env.SIGHTFLOW_STATUS_DIALOGUE_STT_MODEL ||
    process.env.STATUS_DIALOGUE_STT_MODEL ||
    (!providerChangedByEnv ? raw.model : '') ||
    process.env.OPENAI_STT_MODEL ||
    process.env.OPENAI_AUDIO_MODEL ||
    (provider === 'cloudflare_workers_ai' ? '@cf/openai/whisper-large-v3-turbo' : 'whisper-1')
  const timeoutMs = Number(
    process.env.SIGHTFLOW_STATUS_DIALOGUE_STT_TIMEOUT_MS ||
      process.env.STATUS_DIALOGUE_STT_TIMEOUT_MS ||
      process.env.OPENAI_STT_TIMEOUT_MS ||
      raw.timeout_ms ||
      raw.timeoutMs ||
      30000
  )
  const envEnabled =
    process.env.SIGHTFLOW_STATUS_DIALOGUE_STT_REMOTE_ENABLED ||
    process.env.STATUS_DIALOGUE_STT_REMOTE_ENABLED ||
    process.env.OPENAI_STT_REMOTE_ENABLED
  const enabled =
    envEnabled !== undefined
      ? envEnabled === '1' || envEnabled === 'true'
      : raw.enabled === true
  const hasProviderRequiredFields =
    provider === 'cloudflare_workers_ai' ? Boolean(apiKey && resolvedBaseUrl && accountId) : Boolean(apiKey && resolvedBaseUrl)
  return {
    provider,
    enabled: Boolean(enabled && hasProviderRequiredFields),
    base_url: String(resolvedBaseUrl || '').replace(/\/+$/, ''),
    endpoint_path: String(endpointPath || '/audio/transcriptions'),
    api_key: String(apiKey || ''),
    model: String(model || 'whisper-1'),
    timeout_ms: Number.isFinite(timeoutMs) ? Math.max(3000, Math.min(120000, Math.round(timeoutMs))) : 30000,
    account_id: String(accountId || '')
  }
}

function buildStatusDialogueRemoteSttUrl(config: StatusDialogueRemoteSttConfig): URL {
  if (/^https?:\/\//i.test(config.endpoint_path)) {
    try {
      return new URL(config.endpoint_path)
    } catch {
      return buildStatusDialogueRelativeUrl(config.base_url, 'audio/transcriptions')
    }
  }
  return buildStatusDialogueRelativeUrl(config.base_url, config.endpoint_path)
}

function buildStatusDialogueRelativeUrl(baseUrl: string, pathValue: string): URL {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const normalizedPath = String(pathValue || '').replace(/^\/+/, '')
  return new URL(normalizedPath, normalizedBase)
}

async function isLocalWhisperServiceHealthy(timeoutMs = 700): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(statusDialogueLocalWhisperServiceUrl('/health'), { method: 'GET' }, timeoutMs)
    if (!response.ok) return false
    const payload = (await response.json()) as Record<string, unknown>
    return payload.ok === true
  } catch {
    return false
  }
}

async function ensureLocalWhisperService(model: string): Promise<boolean> {
  if (!statusDialogueLocalWhisperServiceEnabled()) return false
  if (await isLocalWhisperServiceHealthy()) return true
  if (localWhisperServiceStarting) return await localWhisperServiceStarting

  localWhisperServiceStarting = (async () => {
    const pythonPath = getStatusDialogueSttPythonPath()
    const servicePath = getStatusDialogueSttServiceScriptPath()
    if (!existsSync(pythonPath) || !existsSync(servicePath)) return false
    try {
      const args = [
        servicePath,
        '--host',
        '127.0.0.1',
        '--port',
        String(statusDialogueLocalWhisperServicePort()),
        '--model',
        model
      ]
      if (process.env.ZHINENG_STT_SERVICE_PRELOAD === '1') {
        args.push('--preload')
      }
      localWhisperServiceProcess = spawn(pythonPath, args, {
        cwd: dirname(servicePath),
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          WHISPER_CACHE_DIR: process.env.WHISPER_CACHE_DIR || join(zhinengProjectRoot(), 'third_party', 'whisper-cache')
        },
        windowsHide: true,
        stdio: 'ignore'
      })
      localWhisperServiceProcess.once('exit', () => {
        localWhisperServiceProcess = null
      })
      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (await isLocalWhisperServiceHealthy(500)) {
          writeStatusDialogueRuntimeLog('local_stt_service_ready', {
            adapter_id: 'local_whisper_persistent_service',
            port: statusDialogueLocalWhisperServicePort(),
            model
          })
          return true
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
      }
      return false
    } catch (error: unknown) {
      writeStatusDialogueRuntimeLog('local_stt_service_start_failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  })()

  try {
    return await localWhisperServiceStarting
  } finally {
    localWhisperServiceStarting = null
  }
}

async function runLocalWhisperServiceTranscription(input: {
  audioPath: string
  language: string
  model: string
  timeoutMs: number
}): Promise<Record<string, unknown> & { service_available?: boolean }> {
  if (!(await ensureLocalWhisperService(input.model))) {
    return {
      success: false,
      service_available: false,
      error: 'local whisper persistent service unavailable',
      fallback_reason: 'cold_subprocess'
    }
  }
  try {
    const response = await fetchWithTimeout(
      statusDialogueLocalWhisperServiceUrl('/transcribe'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          audio_path: input.audioPath,
          language: input.language,
          model: input.model
        })
      },
      input.timeoutMs
    )
    const payload = (await response.json()) as Record<string, unknown>
    return {
      ...payload,
      service_available: true
    }
  } catch (error: unknown) {
    return {
      success: false,
      service_available: false,
      error: error instanceof Error ? error.message : String(error),
      fallback_reason: 'cold_subprocess'
    }
  }
}

function runLocalWhisperTranscription(input: {
  audioPath: string
  language: string
  model: string
  timeoutMs: number
}): Promise<Record<string, unknown>> {
  const pythonPath = getStatusDialogueSttPythonPath()
  const scriptPath = getStatusDialogueSttScriptPath()
  if (!existsSync(pythonPath)) {
    return Promise.resolve({ success: false, error: `local STT python not found: ${pythonPath}` })
  }
  if (!existsSync(scriptPath)) {
    return Promise.resolve({ success: false, error: `local STT script not found: ${scriptPath}` })
  }

  return new Promise((resolvePromise) => {
    const child = spawn(
      pythonPath,
      [
        scriptPath,
        '--audio',
        input.audioPath,
        '--language',
        input.language,
        '--model',
        input.model
      ],
      {
        cwd: dirname(scriptPath),
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          WHISPER_CACHE_DIR: process.env.WHISPER_CACHE_DIR || join(zhinengProjectRoot(), 'third_party', 'whisper-cache')
        },
        windowsHide: true
      }
    )
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      resolvePromise({ success: false, error: `local STT timeout after ${input.timeoutMs}ms` })
    }, input.timeoutMs)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolvePromise({ success: false, error: error.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const trimmed = stdout.trim()
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed)
          resolvePromise(parsed as Record<string, unknown>)
          return
        } catch {
          // Fall through to structured error below.
        }
      }
      resolvePromise({
        success: false,
        error: `local STT exited ${code ?? 'unknown'}${stderr ? `: ${stderr.slice(-800)}` : ''}`
      })
    })
  })
}

async function runOpenAiCompatibleSttTranscription(input: {
  audioPath: string
  language: string
  model?: string
  timeoutMs?: number
}): Promise<Record<string, any> & { success: boolean }> {
  const config = getStatusDialogueRemoteSttConfig()
  const startedAt = Date.now()
  if (!config.enabled) {
    return {
      success: false,
      adapter_id: 'openai_compatible_stt',
      provider: config.provider,
      error: 'remote STT is not configured',
      fallback_reason: 'remote_stt_not_configured'
    }
  }
  try {
    const url = buildStatusDialogueRemoteSttUrl(config)
    const audioBytes = readFileSync(input.audioPath)
    const proxyUrl = statusDialogueProxyUrlFor(url)
    let responseOk = false
    let responseStatus = 0
    let text = ''
    let latencyMs = 0
    let proxyHost: string | undefined

    if (config.provider === 'cloudflare_workers_ai') {
      const cloudflareBody = Buffer.from(
        JSON.stringify({
          audio: audioBytes.toString('base64'),
          language: input.language || undefined
        }),
        'utf8'
      )
      writeStatusDialogueRuntimeLog('remote_stt_cloudflare_route_selected', {
        adapter_id: 'openai_compatible_stt',
        provider: config.provider,
        base_url_host: safeStatusDialogueBaseUrlHost(config.base_url),
        account_configured: Boolean(config.account_id),
        proxy_host: safeStatusDialogueProxyHost(proxyUrl),
        model: config.model,
        boundary: 'Cloudflare Workers AI Whisper request; binary audio upload only after explicit remote STT selection; no api key logging'
      })
      if (proxyUrl) {
        const proxyResponse = await postStatusDialogueBufferViaProxy({
          url,
          proxyUrl,
          headers: {
            authorization: `Bearer ${config.api_key}`,
            accept: 'application/json',
            'content-type': 'application/json'
          },
          body: cloudflareBody,
          timeoutMs: input.timeoutMs ?? config.timeout_ms
        })
        responseOk = proxyResponse.ok
        responseStatus = proxyResponse.status
        text = proxyResponse.text
        latencyMs = proxyResponse.latency_ms
        proxyHost = proxyResponse.proxy_host
      } else {
        const response = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${config.api_key}`,
              accept: 'application/json',
              'content-type': 'application/json'
            },
            body: cloudflareBody
          },
          input.timeoutMs ?? config.timeout_ms
        )
        responseOk = response.ok
        responseStatus = response.status
        text = await response.text()
        latencyMs = Date.now() - startedAt
      }
    } else if (proxyUrl) {
      const multipart = buildStatusDialogueMultipartBody({
        fields: {
          model: input.model || config.model,
          language: input.language
        },
        files: [
          {
            name: 'file',
            filename: basename(input.audioPath),
            contentType: 'audio/wav',
            data: audioBytes
          }
        ]
      })
      writeStatusDialogueRuntimeLog('remote_stt_proxy_route_selected', {
        adapter_id: 'openai_compatible_stt',
        base_url_host: safeStatusDialogueBaseUrlHost(config.base_url),
        proxy_host: safeStatusDialogueProxyHost(proxyUrl),
        boundary: 'remote STT request uses environment proxy; no api key logging; no proxy credentials logging'
      })
      const proxyResponse = await postStatusDialogueMultipartViaProxy({
        url,
        proxyUrl,
        headers: {
          authorization: `Bearer ${config.api_key}`,
          accept: 'application/json',
          'content-type': multipart.contentType
        },
        body: multipart.body,
        timeoutMs: input.timeoutMs ?? config.timeout_ms
      })
      responseOk = proxyResponse.ok
      responseStatus = proxyResponse.status
      text = proxyResponse.text
      latencyMs = proxyResponse.latency_ms
      proxyHost = proxyResponse.proxy_host
    } else {
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(audioBytes)], { type: 'audio/wav' }), basename(input.audioPath))
      form.append('model', input.model || config.model)
      if (input.language) form.append('language', input.language)
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.api_key}`
          },
          body: form
        },
        input.timeoutMs ?? config.timeout_ms
      )
      responseOk = response.ok
      responseStatus = response.status
      text = await response.text()
      latencyMs = Date.now() - startedAt
    }
    let payload: Record<string, any> = {}
    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      payload = { raw: text }
    }
    const transcript =
      typeof payload.text === 'string'
        ? payload.text.trim()
        : typeof payload.transcript === 'string'
        ? payload.transcript.trim()
        : typeof payload.result?.text === 'string'
        ? payload.result.text.trim()
        : ''
    return {
      ...payload,
      success: responseOk && transcript.length > 0,
      adapter_id: 'openai_compatible_stt',
      provider: config.provider,
      transcript,
      language: typeof payload.language === 'string' ? payload.language : input.language,
      model: input.model || config.model,
      latency_ms: latencyMs,
      error: responseOk ? (transcript ? undefined : 'remote STT returned no transcript') : `remote STT returned ${responseStatus}`,
      fallback_reason: responseOk && transcript ? undefined : 'local_whisper_fallback',
      base_url_host: safeStatusDialogueBaseUrlHost(config.base_url),
      proxy_used: Boolean(proxyUrl),
      proxy_host: proxyHost
    }
  } catch (error: unknown) {
    return {
      success: false,
      adapter_id: 'openai_compatible_stt',
      provider: config.provider,
      language: input.language,
      model: input.model || config.model,
      latency_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      fallback_reason: 'local_whisper_fallback'
    }
  }
}

async function transcribeStatusDialogueStt(
  request?: StatusDialogueSttTranscriptionRequest
): Promise<StatusDialogueSttTranscriptionResult> {
  const startedAt = Date.now()
  const language = typeof request?.language === 'string' && request.language.trim() ? request.language.trim() : 'zh'
  const model = typeof request?.model === 'string' && request.model.trim() ? request.model.trim() : 'base'
  const requestedAdapter = request?.adapter_id || request?.adapterId
  const audioDataUrl = request?.audio_data_url || request?.audioDataUrl
  let audioPath: string | undefined

  try {
    writeStatusDialogueRuntimeLog('local_stt_start', {
      language,
      model,
      requested_adapter: requestedAdapter,
      has_audio_data_url: typeof audioDataUrl === 'string'
    })
    if (!audioDataUrl || typeof audioDataUrl !== 'string') {
      throw new Error('audio_data_url is required')
    }
    const parsed = parseAudioDataUrl(audioDataUrl)
    const outputDir = join(zhinengProjectRoot(), 'runtime', 'status-dialogue-stt')
    mkdirSync(outputDir, { recursive: true })
    audioPath = join(outputDir, `status-dialogue-stt-${compactTimestamp()}-${Math.random().toString(36).slice(2, 8)}.wav`)
    writeFileSync(audioPath, parsed.data)

    let result: Record<string, any> | undefined
    if (requestedAdapter === 'openai_compatible_stt') {
      const remoteConfig = getStatusDialogueRemoteSttConfig()
      writeStatusDialogueRuntimeLog('remote_stt_start', {
        adapter_id: 'openai_compatible_stt',
        provider: remoteConfig.provider,
        language,
        configured: remoteConfig.enabled,
        boundary: 'explicit remote STT request; transient audio file is removed after transcription; local Whisper fallback preserved'
      })
      const remoteResult = await runOpenAiCompatibleSttTranscription({
        audioPath,
        language,
        timeoutMs: remoteConfig.timeout_ms
      })
      writeStatusDialogueRuntimeLog('remote_stt_complete', {
        adapter_id: 'openai_compatible_stt',
        provider: remoteResult.provider,
        success: remoteResult.success === true,
        transcript_length: typeof remoteResult.transcript === 'string' ? remoteResult.transcript.trim().length : 0,
        latency_ms: remoteResult.latency_ms,
        error: remoteResult.error,
        fallback_reason: remoteResult.fallback_reason,
        base_url_host: remoteResult.base_url_host
      })
      if (remoteResult.success === true && typeof remoteResult.transcript === 'string' && remoteResult.transcript.trim()) {
        result = remoteResult
      } else {
        writeStatusDialogueRuntimeLog('remote_stt_fallback_to_local', {
          adapter_id: 'openai_compatible_stt',
          fallback_adapter_id: 'local_whisper_persistent_service',
          reason: remoteResult.error ?? remoteResult.fallback_reason ?? 'remote STT returned no transcript'
        })
      }
    }

    if (!result) {
      const serviceResult = await runLocalWhisperServiceTranscription({
        audioPath,
        language,
        model,
        timeoutMs: 120000
      })
      result =
        serviceResult.service_available === false
          ? await runLocalWhisperTranscription({
              audioPath,
              language,
              model,
              timeoutMs: 120000
            })
          : serviceResult
      if (serviceResult.service_available === false) {
        writeStatusDialogueRuntimeLog('local_stt_service_fallback', {
          adapter_id: 'local_whisper_persistent_service',
          fallback_adapter_id: 'local_whisper_ipc',
          reason: serviceResult.error
        })
      }
    }
    const success = result.success === true
    const transcript = typeof result.transcript === 'string' ? result.transcript.trim() : ''
    const adapterId =
      result.adapter_id === 'openai_compatible_stt'
        ? 'openai_compatible_stt'
        : result.adapter_id === 'local_whisper_persistent_service'
        ? 'local_whisper_persistent_service'
        : 'local_whisper_ipc'
    const output: StatusDialogueSttTranscriptionResult = {
      schema: 'status_dialogue_stt_transcription.v1',
      generated_at: new Date().toISOString(),
      success: success && transcript.length > 0,
      adapter_id: adapterId,
      provider:
        adapterId === 'openai_compatible_stt'
          ? ((typeof result.provider === 'string' ? result.provider : 'openai_compatible_remote') as StatusDialogueSttTranscriptionResult['provider'])
          : 'openai_whisper_local',
      transcript: transcript || undefined,
      language: typeof result.language === 'string' ? result.language : language,
      model: typeof result.model === 'string' ? result.model : model,
      latency_ms: Date.now() - startedAt,
      error: success ? undefined : typeof result.error === 'string' ? result.error : 'local STT returned no transcript',
      fallback_reason: success && transcript.length > 0 ? undefined : 'text_input'
    }
    writeStatusDialogueRuntimeLog('local_stt_complete', {
      success: output.success,
      adapter_id: output.adapter_id,
      language: output.language,
      model: output.model,
      latency_ms: output.latency_ms,
      transcript_length: output.transcript?.length ?? 0,
      error: output.error,
      fallback_reason: output.fallback_reason
    })
    return output
  } catch (error: unknown) {
    writeStatusDialogueRuntimeLog('local_stt_failed', {
      language,
      model,
      error: error instanceof Error ? error.message : String(error)
    })
    return {
      schema: 'status_dialogue_stt_transcription.v1',
      generated_at: new Date().toISOString(),
      success: false,
      adapter_id: 'local_whisper_ipc',
      provider: 'openai_whisper_local',
      language,
      model,
      latency_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      fallback_reason: 'text_input'
    }
  } finally {
    if (audioPath) {
      await removeTransientFile(audioPath)
    }
  }
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return items.length > 0 ? items : undefined
}

async function runStatusDialogueLocalSttHealth(
  request?: StatusDialogueLocalSttHealthRequest
): Promise<StatusDialogueLocalSttHealthResult> {
  const startedAt = Date.now()
  const model = typeof request?.model === 'string' && request.model.trim() ? request.model.trim() : 'base'
  const url = statusDialogueLocalWhisperServiceUrl('/health')
  const baseUrlHost = url.host
  const configured = statusDialogueLocalWhisperServiceEnabled()

  if (!configured) {
    return {
      schema: 'status_dialogue_local_stt_health.v1',
      generated_at: new Date().toISOString(),
      adapter_id: 'local_whisper_persistent_service',
      configured: false,
      reachable: false,
      status: 'fallback',
      base_url_host: baseUrlHost,
      model,
      latency_ms: Date.now() - startedAt,
      error: 'local Whisper persistent service disabled'
    }
  }

  const healthyBeforeEnsure = await isLocalWhisperServiceHealthy(300)
  let ensured = healthyBeforeEnsure
  if (request?.ensure !== false && !healthyBeforeEnsure) {
    ensured = await ensureLocalWhisperService(model)
  }

  try {
    const response = await fetchWithTimeout(url, { method: 'GET' }, 1500)
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
    const ok = response.ok && payload.ok === true
    const result: StatusDialogueLocalSttHealthResult = {
      schema: 'status_dialogue_local_stt_health.v1',
      generated_at: new Date().toISOString(),
      adapter_id: 'local_whisper_persistent_service',
      configured: true,
      reachable: ok,
      status: ok ? 'ready' : ensured ? 'fallback' : 'error',
      base_url_host: baseUrlHost,
      model,
      loaded_models: normalizeStringArray(payload.loaded_models),
      default_model: typeof payload.default_model === 'string' ? payload.default_model : undefined,
      device: typeof payload.device === 'string' ? payload.device : undefined,
      uptime_ms: typeof payload.uptime_ms === 'number' ? payload.uptime_ms : undefined,
      latency_ms: Date.now() - startedAt,
      service_started: !healthyBeforeEnsure && ensured,
      error: ok ? undefined : `local STT health returned ${response.status}`
    }
    writeStatusDialogueRuntimeLog('local_stt_health_check', {
      adapter_id: result.adapter_id,
      status: result.status,
      reachable: result.reachable,
      model: result.model,
      loaded_models: result.loaded_models,
      default_model: result.default_model,
      device: result.device,
      latency_ms: result.latency_ms,
      service_started: result.service_started,
      error: result.error
    })
    return result
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const result: StatusDialogueLocalSttHealthResult = {
      schema: 'status_dialogue_local_stt_health.v1',
      generated_at: new Date().toISOString(),
      adapter_id: 'local_whisper_persistent_service',
      configured: true,
      reachable: false,
      status: ensured ? 'fallback' : 'error',
      base_url_host: baseUrlHost,
      model,
      latency_ms: Date.now() - startedAt,
      service_started: !healthyBeforeEnsure && ensured,
      error: message
    }
    writeStatusDialogueRuntimeLog('local_stt_health_check', {
      adapter_id: result.adapter_id,
      status: result.status,
      reachable: result.reachable,
      model: result.model,
      latency_ms: result.latency_ms,
      service_started: result.service_started,
      error: result.error
    })
    return result
  }
}

async function runStatusDialogueRemoteSttHealth(input: { runtimeProbe?: string } = {}): Promise<StatusDialogueRemoteSttHealthResult> {
  const startedAt = Date.now()
  const config = getStatusDialogueRemoteSttConfig()
  const baseUrlHost = safeStatusDialogueBaseUrlHost(config.base_url)

  if (!config.enabled) {
    const result: StatusDialogueRemoteSttHealthResult = {
      schema: 'status_dialogue_remote_stt_health.v1',
      generated_at: new Date().toISOString(),
      adapter_id: 'openai_compatible_stt',
      configured: false,
      reachable: false,
      status: 'fallback',
      base_url_host: baseUrlHost,
      endpoint_path: config.endpoint_path,
      model: config.model,
      timeout_ms: config.timeout_ms,
      latency_ms: Date.now() - startedAt,
      error: 'remote STT is not configured'
    }
    writeStatusDialogueRuntimeLog('remote_stt_health_check', {
      runtime_probe: input.runtimeProbe,
      adapter_id: result.adapter_id,
      configured: result.configured,
      reachable: result.reachable,
      status: result.status,
      base_url_host: result.base_url_host,
      endpoint_path: result.endpoint_path,
      model: result.model,
      timeout_ms: result.timeout_ms,
      latency_ms: result.latency_ms,
      error: result.error
    })
    return result
  }

  try {
    const base = new URL(config.base_url)
    const probeUrl = new URL('/', `${base.protocol}//${base.host}`)
    const response = await fetchWithTimeout(probeUrl, { method: 'HEAD' }, Math.min(3000, config.timeout_ms))
    const result: StatusDialogueRemoteSttHealthResult = {
      schema: 'status_dialogue_remote_stt_health.v1',
      generated_at: new Date().toISOString(),
      adapter_id: 'openai_compatible_stt',
      configured: true,
      reachable: true,
      status: 'ready',
      base_url_host: baseUrlHost,
      endpoint_path: config.endpoint_path,
      model: config.model,
      timeout_ms: config.timeout_ms,
      latency_ms: Date.now() - startedAt,
      error: response.ok ? undefined : `remote STT host returned ${response.status} to HEAD probe`
    }
    writeStatusDialogueRuntimeLog('remote_stt_health_check', {
      runtime_probe: input.runtimeProbe,
      adapter_id: result.adapter_id,
      configured: result.configured,
      reachable: result.reachable,
      status: result.status,
      base_url_host: result.base_url_host,
      endpoint_path: result.endpoint_path,
      model: result.model,
      timeout_ms: result.timeout_ms,
      latency_ms: result.latency_ms,
      http_status: response.status,
      error: result.error,
      boundary: 'remote STT health uses host reachability only; no audio upload; no api key logging'
    })
    return result
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const result: StatusDialogueRemoteSttHealthResult = {
      schema: 'status_dialogue_remote_stt_health.v1',
      generated_at: new Date().toISOString(),
      adapter_id: 'openai_compatible_stt',
      configured: true,
      reachable: false,
      status: 'error',
      base_url_host: baseUrlHost,
      endpoint_path: config.endpoint_path,
      model: config.model,
      timeout_ms: config.timeout_ms,
      latency_ms: Date.now() - startedAt,
      error: message
    }
    writeStatusDialogueRuntimeLog('remote_stt_health_check', {
      runtime_probe: input.runtimeProbe,
      adapter_id: result.adapter_id,
      configured: result.configured,
      reachable: result.reachable,
      status: result.status,
      base_url_host: result.base_url_host,
      endpoint_path: result.endpoint_path,
      model: result.model,
      timeout_ms: result.timeout_ms,
      latency_ms: result.latency_ms,
      error: result.error,
      boundary: 'remote STT health failed before transcription; no audio upload; no api key logging'
    })
    return result
  }
}

function isPathInsideDirectory(parent: string, target: string): boolean {
  const relativePath = relative(resolve(parent), resolve(target))
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

function resolveStatusDialogueRemoteSttProbeAudioPath(rawPath?: unknown): { audioPath?: string; error?: string } {
  const defaultCandidates = [
    join(process.cwd(), 'runtime', 'verification-audio', 'cloud-stt-clear-zh-huihui-20260630.wav'),
    join(zhinengProjectRoot(), 'sightflow-desktop-agent-main', 'runtime', 'verification-audio', 'cloud-stt-clear-zh-huihui-20260630.wav')
  ]
  const requested =
    typeof rawPath === 'string' && rawPath.trim()
      ? rawPath.trim()
      : defaultCandidates.find((candidate) => existsSync(candidate)) || defaultCandidates[0]
  const audioPath = isAbsolute(requested) ? resolve(requested) : resolve(process.cwd(), requested)
  const allowedRoots = Array.from(new Set([resolve(process.cwd()), resolve(app.getAppPath()), resolve(zhinengProjectRoot())]))
  if (!allowedRoots.some((root) => isPathInsideDirectory(root, audioPath))) {
    return { error: `remote STT probe audio path is outside allowed roots: ${audioPath}` }
  }
  if (!existsSync(audioPath)) {
    return { error: `remote STT probe audio file does not exist: ${audioPath}` }
  }
  if (!/\.wav$/i.test(audioPath)) {
    return { error: 'remote STT probe currently accepts .wav test audio only' }
  }
  return { audioPath }
}

async function runStatusDialogueRemoteSttConfiguredProbe(
  request?: Record<string, unknown>
): Promise<StatusDialogueRemoteSttConfiguredProbeResult> {
  const startedAt = Date.now()
  const runtimeProbe =
    typeof request?.runtime_probe === 'string' && request.runtime_probe.trim()
      ? safePathSegment(request.runtime_probe)
      : 'remote_stt_configured'
  const language = typeof request?.language === 'string' && request.language.trim() ? request.language.trim() : 'zh'
  const remoteConfig = getStatusDialogueRemoteSttConfig()
  const { audioPath, error: audioPathError } = resolveStatusDialogueRemoteSttProbeAudioPath(
    request?.audio_path ?? request?.audioPath
  )

  writeStatusDialogueRuntimeLog('status_dialogue_remote_stt_configured_probe_start', {
    runtime_probe: runtimeProbe,
    adapter_id: 'openai_compatible_stt',
    language,
    audio_path: audioPath,
    audio_path_error: audioPathError,
    boundary: 'configured remote STT probe; reads a local verification wav; no api key logging; no world write'
  })

  const health = await runStatusDialogueRemoteSttHealth({ runtimeProbe })
  const complete = (
    result: StatusDialogueRemoteSttConfiguredProbeResult
  ): StatusDialogueRemoteSttConfiguredProbeResult => {
    writeStatusDialogueRuntimeLog('status_dialogue_remote_stt_configured_probe_complete', {
      runtime_probe: runtimeProbe,
      success: result.success,
      configured: result.configured,
      reachable: result.reachable,
      transcript_length: result.transcript_length ?? 0,
      latency_ms: result.latency_ms,
      error: result.error,
      fallback_reason: result.fallback_reason
    })
    return result
  }

  if (audioPathError || !audioPath) {
    return complete({
      schema: 'status_dialogue_remote_stt_configured_probe.v1',
      generated_at: new Date().toISOString(),
      success: false,
      configured: health.configured,
      reachable: health.reachable,
      adapter_id: 'openai_compatible_stt',
      provider: remoteConfig.provider,
      language,
      latency_ms: Date.now() - startedAt,
      error: audioPathError,
      health
    })
  }

  if (!health.configured) {
    return complete({
      schema: 'status_dialogue_remote_stt_configured_probe.v1',
      generated_at: new Date().toISOString(),
      success: false,
      configured: health.configured,
      reachable: health.reachable,
      adapter_id: 'openai_compatible_stt',
      provider: remoteConfig.provider,
      audio_path: audioPath,
      language,
      latency_ms: Date.now() - startedAt,
      error: health.error ?? 'remote STT health is not ready',
      fallback_reason: 'remote_stt_not_configured',
      health
    })
  }

  if (health.status !== 'ready') {
    writeStatusDialogueRuntimeLog('remote_stt_health_probe_non_blocking', {
      runtime_probe: runtimeProbe,
      adapter_id: 'openai_compatible_stt',
      configured: health.configured,
      reachable: health.reachable,
      status: health.status,
      base_url_host: health.base_url_host,
      endpoint_path: health.endpoint_path,
      model: health.model,
      error: health.error,
      boundary:
        'configured remote STT probe treats host health as advisory; authorized transcription POST is definitive; no api key logging'
    })
  }

  writeStatusDialogueRuntimeLog('remote_stt_start', {
    runtime_probe: runtimeProbe,
    adapter_id: 'openai_compatible_stt',
    provider: remoteConfig.provider,
    language,
    configured: true,
    base_url_host: health.base_url_host,
    boundary: 'configured remote STT probe transcription; verification wav only; no api key logging'
  })
  const transcription = await runOpenAiCompatibleSttTranscription({
    audioPath,
    language,
    timeoutMs: remoteConfig.timeout_ms
  })
  const transcript = typeof transcription.transcript === 'string' ? transcription.transcript.trim() : ''
  const result: StatusDialogueRemoteSttConfiguredProbeResult = {
    schema: 'status_dialogue_remote_stt_configured_probe.v1',
    generated_at: new Date().toISOString(),
    success: transcription.success === true && transcript.length > 0,
    configured: health.configured,
    reachable: health.reachable || transcription.success === true,
    adapter_id: 'openai_compatible_stt',
    provider: remoteConfig.provider,
    audio_path: audioPath,
    language,
    transcript_length: transcript.length,
    latency_ms: Date.now() - startedAt,
    error: transcription.error,
    fallback_reason: transcription.fallback_reason,
    health,
    transcription
  }
  writeStatusDialogueRuntimeLog('remote_stt_complete', {
    runtime_probe: runtimeProbe,
    adapter_id: 'openai_compatible_stt',
    provider: transcription.provider ?? remoteConfig.provider,
    success: result.success,
    transcript_length: result.transcript_length,
    latency_ms: transcription.latency_ms,
    error: transcription.error,
    fallback_reason: transcription.fallback_reason,
    base_url_host: transcription.base_url_host
  })
  return complete(result)
}

async function runStatusDialogueTtsHealth(): Promise<StatusDialogueTtsHealthResult> {
  const startedAt = Date.now()
  const config = getStatusDialogueTtsConfig()
  let host = 'invalid_base_url'
  try {
    const url = buildStatusDialogueTtsUrl(config, config.health_path)
    host = url.host
    ensureAllowedStatusDialogueTtsUrl(config, url)
    if (!config.enabled) {
      return {
        schema: STATUS_DIALOGUE_TTS_HEALTH_SCHEMA,
        generated_at: new Date().toISOString(),
        adapter_id: config.adapter_id,
        configured: false,
        reachable: false,
        status: 'fallback',
        base_url_host: host,
        error: 'CosyVoice adapter disabled'
      }
    }
    const response = await fetchWithTimeout(url, { method: 'GET', headers: statusDialogueTtsHeaders(config) }, 3000)
    return {
      schema: STATUS_DIALOGUE_TTS_HEALTH_SCHEMA,
      generated_at: new Date().toISOString(),
      adapter_id: config.adapter_id,
      configured: true,
      reachable: response.ok,
      status: response.ok ? 'ready' : 'fallback',
      base_url_host: host,
      latency_ms: Date.now() - startedAt,
      error: response.ok ? undefined : `health returned ${response.status}`
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      schema: STATUS_DIALOGUE_TTS_HEALTH_SCHEMA,
      generated_at: new Date().toISOString(),
      adapter_id: config.adapter_id,
      configured: config.enabled,
      reachable: false,
      status: 'fallback',
      base_url_host: host,
      latency_ms: Date.now() - startedAt,
      error: message
    }
  }
}

async function synthesizeStatusDialogueTts(
  request?: StatusDialogueTtsSynthesisRequest
): Promise<StatusDialogueTtsSynthesisResult> {
  const startedAt = Date.now()
  const config = getStatusDialogueTtsConfig()
  const voiceProfile = normalizeVoiceProfile(request?.voice_profile, DEFAULT_COSYVOICE_VOICE_PROFILE)
  const voiceProfileId = voiceProfile.profile_id

  try {
    const plan = request?.plan
    const text = plan?.text?.trim()
    if (!config.enabled) {
      writeStatusDialogueRuntimeLog('tts_synthesis_skipped', {
        adapter_id: config.adapter_id,
        voice_profile_id: voiceProfileId,
        reason: 'disabled'
      })
      return {
        schema: STATUS_DIALOGUE_TTS_SYNTHESIS_SCHEMA,
        generated_at: new Date().toISOString(),
        success: false,
        adapter_id: config.adapter_id,
        voice_profile_id: voiceProfileId,
        fallback_reason: 'CosyVoice adapter disabled'
      }
    }
    if (!plan || !text) {
      writeStatusDialogueRuntimeLog('tts_synthesis_skipped', {
        adapter_id: config.adapter_id,
        voice_profile_id: voiceProfileId,
        reason: 'empty_voice_text'
      })
      return {
        schema: STATUS_DIALOGUE_TTS_SYNTHESIS_SCHEMA,
        generated_at: new Date().toISOString(),
        success: false,
        adapter_id: config.adapter_id,
        voice_profile_id: voiceProfileId,
        fallback_reason: 'empty voice text'
      }
    }

    const emotionHint = plan.emotion_hint || 'focused'
    const cacheKey = buildVoiceChunkCacheKey({
      text,
      voiceProfile,
      emotionHint
    })
    const cachedAudio = readStatusDialogueTtsAudioCache(cacheKey)
    if (cachedAudio) {
      writeStatusDialogueRuntimeLog('tts_synthesis_cache_hit', {
        adapter_id: config.adapter_id,
        voice_profile_id: voiceProfileId,
        cache_key: cacheKey,
        text_length: text.length,
        audio_mime_type: cachedAudio.audio_mime_type
      })
      return {
        schema: STATUS_DIALOGUE_TTS_SYNTHESIS_SCHEMA,
        generated_at: new Date().toISOString(),
        success: true,
        adapter_id: config.adapter_id,
        voice_profile_id: voiceProfileId,
        latency_ms: Date.now() - startedAt,
        audio_data_url: cachedAudio.audio_data_url,
        audio_mime_type: cachedAudio.audio_mime_type,
        cache_hit: true,
        cache_key: cacheKey
      }
    }

    writeStatusDialogueRuntimeLog('tts_synthesis_start', {
      adapter_id: config.adapter_id,
      voice_profile_id: voiceProfileId,
      cache_key: cacheKey,
      text_length: text.length,
      response_format: config.response_format
    })

    const url = buildStatusDialogueTtsUrl(config, config.endpoint_path)
    ensureAllowedStatusDialogueTtsUrl(config, url)
    const body = buildCosyVoiceRequestBody(config, plan)
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: statusDialogueTtsHeaders(config),
        body: JSON.stringify(body)
      },
      config.timeout_ms
    )

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      writeStatusDialogueRuntimeLog('tts_synthesis_failed', {
        adapter_id: config.adapter_id,
        voice_profile_id: voiceProfileId,
        status: response.status,
        latency_ms: Date.now() - startedAt,
        error_length: errorText.length
      })
      return {
        schema: STATUS_DIALOGUE_TTS_SYNTHESIS_SCHEMA,
        generated_at: new Date().toISOString(),
        success: false,
        adapter_id: config.adapter_id,
        voice_profile_id: voiceProfileId,
        latency_ms: Date.now() - startedAt,
        fallback_reason: `CosyVoice returned ${response.status}`,
        error: errorText.slice(0, 240)
      }
    }

    const fallbackMime = audioMimeFromFormat(config.response_format)
    const contentType = response.headers.get('content-type') || fallbackMime
    if (contentType.includes('application/json')) {
      const json = await response.json()
      const audio = maybeAudioDataUrlFromJson(json, fallbackMime)
      if (audio.dataUrl) {
        const audioMime = audio.mime || fallbackMime
        writeStatusDialogueRuntimeLog('tts_synthesis_complete', {
          adapter_id: config.adapter_id,
          voice_profile_id: voiceProfileId,
          cache_key: cacheKey,
          latency_ms: Date.now() - startedAt,
          audio_mime_type: audioMime,
          audio_data_url_length: audio.dataUrl.length
        })
        writeStatusDialogueTtsAudioCache({
          schema: 'status_dialogue_tts_audio_cache.v1',
          cache_key: cacheKey,
          generated_at: new Date().toISOString(),
          adapter_id: config.adapter_id,
          voice_profile_id: voiceProfileId,
          audio_data_url: audio.dataUrl,
          audio_mime_type: audioMime,
          text_length: text.length,
          emotion_hint: emotionHint
        })
        return {
          schema: STATUS_DIALOGUE_TTS_SYNTHESIS_SCHEMA,
          generated_at: new Date().toISOString(),
          success: true,
          adapter_id: config.adapter_id,
          voice_profile_id: voiceProfileId,
          latency_ms: Date.now() - startedAt,
          audio_data_url: audio.dataUrl,
          audio_mime_type: audioMime,
          cache_hit: false,
          cache_key: cacheKey
        }
      }
      writeStatusDialogueRuntimeLog('tts_synthesis_failed', {
        adapter_id: config.adapter_id,
        voice_profile_id: voiceProfileId,
        latency_ms: Date.now() - startedAt,
        reason: 'json_without_audio'
      })
      return {
        schema: STATUS_DIALOGUE_TTS_SYNTHESIS_SCHEMA,
        generated_at: new Date().toISOString(),
        success: false,
        adapter_id: config.adapter_id,
        voice_profile_id: voiceProfileId,
        latency_ms: Date.now() - startedAt,
        fallback_reason: 'CosyVoice JSON response did not include audio'
      }
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer())
    const audioDataUrl = `data:${contentType};base64,${audioBuffer.toString('base64')}`
    writeStatusDialogueRuntimeLog('tts_synthesis_complete', {
      adapter_id: config.adapter_id,
      voice_profile_id: voiceProfileId,
      cache_key: cacheKey,
      latency_ms: Date.now() - startedAt,
      audio_mime_type: contentType,
      audio_bytes: audioBuffer.length
    })
    writeStatusDialogueTtsAudioCache({
      schema: 'status_dialogue_tts_audio_cache.v1',
      cache_key: cacheKey,
      generated_at: new Date().toISOString(),
      adapter_id: config.adapter_id,
      voice_profile_id: voiceProfileId,
      audio_data_url: audioDataUrl,
      audio_mime_type: contentType,
      text_length: text.length,
      emotion_hint: emotionHint
    })
    return {
      schema: STATUS_DIALOGUE_TTS_SYNTHESIS_SCHEMA,
      generated_at: new Date().toISOString(),
      success: true,
      adapter_id: config.adapter_id,
      voice_profile_id: voiceProfileId,
      latency_ms: Date.now() - startedAt,
      audio_data_url: audioDataUrl,
      audio_mime_type: contentType,
      cache_hit: false,
      cache_key: cacheKey
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    writeStatusDialogueRuntimeLog('tts_synthesis_failed', {
      adapter_id: config.adapter_id,
      voice_profile_id: voiceProfileId,
      latency_ms: Date.now() - startedAt,
      error: message.slice(0, 240)
    })
    return {
      schema: STATUS_DIALOGUE_TTS_SYNTHESIS_SCHEMA,
      generated_at: new Date().toISOString(),
      success: false,
      adapter_id: config.adapter_id,
      voice_profile_id: voiceProfileId,
      latency_ms: Date.now() - startedAt,
      fallback_reason: 'CosyVoice synthesis failed',
      error: message
    }
  }
}

function audioDataUrlToCachedFrame(input: {
  dataUrl: string
  mime: string
  chunkId: string
  sequence?: number
}): StreamingTtsAudioFrame {
  const audioBase64 = input.dataUrl.includes(',') ? input.dataUrl.split(',').slice(1).join(',') : input.dataUrl
  const sequence = input.sequence ?? 1
  return {
    schema: 'streaming_tts_audio_frame.v1',
    frame_id: `${input.chunkId}:cache-frame:${sequence}`,
    chunk_id: input.chunkId,
    sequence,
    audio_mime_type: input.mime,
    audio_base64: audioBase64,
    final: false,
    generated_at: new Date().toISOString()
  }
}

async function streamStatusDialogueTts(
  sender: WebContents,
  request?: StatusDialogueTtsSynthesisRequest & {
    sessionId?: string
    session_id?: string
    adapter_id?: StatusDialogueTtsAdapterConfig['adapter_id']
    adapterId?: StatusDialogueTtsAdapterConfig['adapter_id']
    response_format?: StatusDialogueTtsAdapterConfig['response_format']
    responseFormat?: StatusDialogueTtsAdapterConfig['response_format']
    voice?: string
    locale?: string
    skip_cache?: boolean
    skipCache?: boolean
  }
): Promise<Record<string, unknown>> {
  const startedAt = Date.now()
  const sessionId =
    request?.sessionId ||
    request?.session_id ||
    request?.plan?.source_output_id ||
    `status-dialogue-tts-stream-${startedAt}-${Math.random().toString(36).slice(2, 8)}`
  const channel = 'zhineng:status-dialogue:tts:synthesize:stream:event'
  const emit = (payload: Record<string, unknown>): void => {
    if (sender.isDestroyed()) return
    sender.send(channel, {
      schema: 'status_dialogue_tts_stream_event.v1',
      sessionId,
      session_id: sessionId,
      generated_at: new Date().toISOString(),
      ...payload
    })
  }

  const baseConfig = getStatusDialogueTtsConfig()
  const requestedFormat = request?.response_format ?? request?.responseFormat
  const requestedAdapterId = request?.adapter_id ?? request?.adapterId
  const config: StatusDialogueTtsAdapterConfig = {
    ...baseConfig,
    adapter_id:
      requestedAdapterId === 'edge_readaloud_websocket' ||
      requestedAdapterId === 'openai_compatible_streaming_http' ||
      requestedAdapterId === 'custom_streaming_tts_http' ||
      requestedAdapterId === 'browser_speech_synthesis' ||
      requestedAdapterId === 'cosyvoice_local_http'
        ? requestedAdapterId
        : baseConfig.adapter_id,
    voice: request?.voice || baseConfig.voice,
    response_format:
      requestedFormat === 'pcm' || requestedFormat === 'wav' || requestedFormat === 'mp3' || requestedFormat === 'opus'
        ? requestedFormat
        : baseConfig.response_format
  }
  const voiceProfile = normalizeVoiceProfile(request?.voice_profile, DEFAULT_COSYVOICE_VOICE_PROFILE)
  const voiceProfileId = voiceProfile.profile_id
  const skipCache =
    request?.skip_cache === true ||
    request?.skipCache === true ||
    config.response_format !== baseConfig.response_format ||
    config.adapter_id !== voiceProfile.adapter_id
  const plan = request?.plan
  const text = plan?.text?.trim()
  const chunkId = plan?.source_output_id || sessionId

  try {
    if (!config.enabled) {
      const reason = 'CosyVoice adapter disabled'
      emit({ type: 'error', error: reason, reason: 'disabled', adapter_id: config.adapter_id })
      return { success: false, reason: 'disabled', error: reason, sessionId, latencyMs: Date.now() - startedAt }
    }
    if (!plan || !text) {
      const reason = 'empty voice text'
      emit({ type: 'error', error: reason, reason: 'empty_voice_text', adapter_id: config.adapter_id })
      return { success: false, reason: 'empty_voice_text', error: reason, sessionId, latencyMs: Date.now() - startedAt }
    }

    const emotionHint = plan.emotion_hint || 'focused'
    const cacheKey = buildVoiceChunkCacheKey({ text, voiceProfile, emotionHint })
    emit({
      type: 'start',
      adapter_id: config.adapter_id,
      adapterId: 'streaming_tts_adapter.runtime.status_dialogue_http',
      voice_profile_id: voiceProfileId,
      cache_key: cacheKey,
      text_length: text.length
    })

    const cachedAudio = skipCache ? null : readStatusDialogueTtsAudioCache(cacheKey)
    if (cachedAudio) {
      const frame = audioDataUrlToCachedFrame({
        dataUrl: cachedAudio.audio_data_url,
        mime: cachedAudio.audio_mime_type,
        chunkId
      })
      emit({ type: 'frame', cache_hit: true, frame })
      emit({
        type: 'frame',
        cache_hit: true,
        frame: {
          ...frame,
          frame_id: `${chunkId}:cache-frame:2:final`,
          sequence: 2,
          audio_base64: '',
          final: true,
          generated_at: new Date().toISOString()
        }
      })
      const latencyMs = Date.now() - startedAt
      emit({
        type: 'done',
        success: true,
        cache_hit: true,
        frame_count: 1,
        final_frame_count: 1,
        first_frame_ms: latencyMs,
        total_stream_ms: latencyMs,
        cache_key: cacheKey
      })
      return {
        success: true,
        sessionId,
        adapterId: 'streaming_tts_adapter.runtime.status_dialogue_http',
        cacheHit: true,
        cacheKey,
        frameCount: 1,
        finalFrameCount: 1,
        firstFrameMs: latencyMs,
        totalStreamMs: latencyMs,
        latencyMs
      }
    }

    if (config.adapter_id === 'edge_readaloud_websocket') {
      const edgeStartedAt = Date.now()
      const voice = config.voice && config.voice !== 'default' ? config.voice : 'zh-CN-XiaoxiaoNeural'
      const locale = request?.locale || voiceProfile.locale || 'zh-CN'
      const outputFormat = 'audio-24khz-48kbitrate-mono-mp3'
      writeStatusDialogueRuntimeLog('tts_stream_start', {
        adapter_id: config.adapter_id,
        streaming_adapter_id: 'streaming_tts_adapter.runtime.edge_readaloud_websocket',
        session_id: sessionId,
        source_output_id: plan.source_output_id,
        voice_profile_id: voiceProfileId,
        cache_key: cacheKey,
        text_length: text.length,
        voice,
        locale
      })
      const edgeResult = await synthesizeEdgeReadAloudStream({
        text,
        voice,
        locale,
        outputFormat,
        timeoutMs: Math.min(config.timeout_ms, 10000)
      })
      const audioMimeType = 'audio/mpeg'
      const emittedFrameCount = 1
      const frame: StreamingTtsAudioFrame = {
        schema: 'streaming_tts_audio_frame.v1',
        frame_id: `${chunkId}:edge-readaloud-frame:1`,
        chunk_id: chunkId,
        sequence: 1,
        audio_mime_type: audioMimeType,
        audio_base64: edgeResult.audio_base64,
        final: false,
        generated_at: new Date().toISOString()
      }
      emit({ type: 'frame', cache_hit: false, frame })
      emit({
        type: 'frame',
        cache_hit: false,
        frame: {
          ...frame,
          frame_id: `${chunkId}:edge-readaloud-frame:2:final`,
          sequence: 2,
          audio_base64: '',
          final: true,
          generated_at: new Date().toISOString()
        }
      })
      const latencyMs = Date.now() - edgeStartedAt
      if (!skipCache && edgeResult.audio_base64) {
        writeStatusDialogueTtsAudioCache({
          schema: 'status_dialogue_tts_audio_cache.v1',
          cache_key: cacheKey,
          generated_at: new Date().toISOString(),
          adapter_id: config.adapter_id,
          voice_profile_id: voiceProfileId,
          audio_data_url: `data:${audioMimeType};base64,${edgeResult.audio_base64}`,
          audio_mime_type: audioMimeType,
          text_length: text.length,
          emotion_hint: emotionHint
        })
      }
      writeStatusDialogueRuntimeLog('tts_stream_complete', {
        adapter_id: config.adapter_id,
        streaming_adapter_id: 'streaming_tts_adapter.runtime.edge_readaloud_websocket',
        session_id: sessionId,
        source_output_id: plan.source_output_id,
        voice_profile_id: voiceProfileId,
        cache_key: cacheKey,
        first_frame_ms: edgeResult.first_audio_payload_ms,
        total_stream_ms: edgeResult.total_stream_ms,
        frame_count: emittedFrameCount,
        native_frame_count: edgeResult.audio_frame_count,
        final_frame_count: edgeResult.final_frame_count,
        audio_bytes: edgeResult.audio_bytes
      })
      emit({
        type: 'done',
        success: true,
        cache_hit: false,
        frame_count: emittedFrameCount,
        native_frame_count: edgeResult.audio_frame_count,
        final_frame_count: edgeResult.final_frame_count,
        first_frame_ms: edgeResult.first_audio_payload_ms,
        total_stream_ms: edgeResult.total_stream_ms,
        cache_key: cacheKey
      })
      return {
        success: true,
        sessionId,
        adapterId: 'streaming_tts_adapter.runtime.edge_readaloud_websocket',
        cacheHit: false,
        cacheKey,
        frameCount: emittedFrameCount,
        nativeFrameCount: edgeResult.audio_frame_count,
        finalFrameCount: edgeResult.final_frame_count,
        firstFrameMs: edgeResult.first_audio_payload_ms,
        totalStreamMs: edgeResult.total_stream_ms,
        latencyMs
      }
    }

    const url = buildStatusDialogueTtsUrl(config, config.endpoint_path)
    ensureAllowedStatusDialogueTtsUrl(config, url)
    const body = buildCosyVoiceRequestBody(config, { ...plan, text })
    const audioBytes: Buffer[] = []
    let frameCount = 0
    let finalFrameCount = 0
    let firstFrameMs: number | undefined
    let audioMimeType = audioMimeFromFormat(config.response_format)
    const adapter = createHttpStreamingTtsAdapter({
      adapterId: 'streaming_tts_adapter.runtime.status_dialogue_http',
      buildRequest: async () => ({
        url: url.toString(),
        init: {
          method: 'POST',
          headers: statusDialogueTtsHeaders(config),
          body: JSON.stringify(body)
        },
        audio_mime_type: audioMimeType
      })
    })

    writeStatusDialogueRuntimeLog('tts_stream_start', {
      adapter_id: config.adapter_id,
      streaming_adapter_id: adapter.descriptor.adapter_id,
      voice_profile_id: voiceProfileId,
      cache_key: cacheKey,
      text_length: text.length
    })

    for await (const frame of adapter.synthesizeStream({
      schema: 'streaming_tts_synthesis_request.v1',
      chunk: {
        schema: 'voice_output_chunk.v1',
        chunk_id: chunkId,
        source_output_id: plan.source_output_id,
        kind: 'final',
        index: 1,
        total: 1,
        text,
        voice_profile_id: voiceProfileId,
        emotion_hint: emotionHint,
        priority: 'normal',
        cache_key: cacheKey,
        interrupt_previous: false
      },
      plan: { ...plan, text },
      voice_profile: voiceProfile
    })) {
      audioMimeType = frame.audio_mime_type || audioMimeType
      if (frame.audio_base64) {
        frameCount += 1
        firstFrameMs = firstFrameMs ?? Date.now() - startedAt
        audioBytes.push(Buffer.from(frame.audio_base64, 'base64'))
      }
      if (frame.final) finalFrameCount += 1
      emit({ type: 'frame', cache_hit: false, frame })
    }

    const latencyMs = Date.now() - startedAt
    if (!skipCache && audioBytes.length > 0) {
      const audioDataUrl = `data:${audioMimeType};base64,${Buffer.concat(audioBytes).toString('base64')}`
      writeStatusDialogueTtsAudioCache({
        schema: 'status_dialogue_tts_audio_cache.v1',
        cache_key: cacheKey,
        generated_at: new Date().toISOString(),
        adapter_id: config.adapter_id,
        voice_profile_id: voiceProfileId,
        audio_data_url: audioDataUrl,
        audio_mime_type: audioMimeType,
        text_length: text.length,
        emotion_hint: emotionHint
      })
    }

    writeStatusDialogueRuntimeLog('tts_stream_complete', {
      adapter_id: config.adapter_id,
      streaming_adapter_id: adapter.descriptor.adapter_id,
      voice_profile_id: voiceProfileId,
      cache_key: cacheKey,
      first_frame_ms: firstFrameMs,
      total_stream_ms: latencyMs,
      frame_count: frameCount,
      final_frame_count: finalFrameCount
    })
    emit({
      type: 'done',
      success: true,
      cache_hit: false,
      frame_count: frameCount,
      final_frame_count: finalFrameCount,
      first_frame_ms: firstFrameMs,
      total_stream_ms: latencyMs,
      cache_key: cacheKey
    })
    return {
      success: true,
      sessionId,
      adapterId: adapter.descriptor.adapter_id,
      cacheHit: false,
      cacheKey,
      frameCount,
      finalFrameCount,
      firstFrameMs,
      totalStreamMs: latencyMs,
      latencyMs
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    writeStatusDialogueRuntimeLog('tts_stream_failed', {
      adapter_id: config.adapter_id,
      session_id: sessionId,
      source_output_id: plan?.source_output_id,
      voice_profile_id: voiceProfileId,
      latency_ms: Date.now() - startedAt,
      error: message.slice(0, 240)
    })
    emit({
      type: 'error',
      success: false,
      adapter_id: config.adapter_id,
      voice_profile_id: voiceProfileId,
      error: message,
      latencyMs: Date.now() - startedAt
    })
    return {
      success: false,
      sessionId,
      reason: 'tts_stream_failed',
      error: message,
      latencyMs: Date.now() - startedAt
    }
  }
}

function buildRealCheckItem(input: {
  id: string
  label: string
  status: StatusDialogueRealCheckStatus
  detail: string
  input_refs: string[]
  output_refs: string[]
  owner?: string
  gate?: string
  boundary?: string
}): StatusDialogueRealCheckItem {
  return {
    owner: input.owner ?? 'Subject Status Dialogue Runtime',
    gate: input.gate ?? 'status_dialogue_real_integration_gate',
    boundary: input.boundary ?? 'patrol_only; no world model write; no external action',
    ...input
  }
}

function summarizeRealCheckStatus(items: StatusDialogueRealCheckItem[]): StatusDialogueRealCheckStatus {
  if (items.some((item) => item.status === 'fail')) return 'fail'
  if (items.some((item) => item.status === 'warn')) return 'warn'
  if (items.some((item) => item.status === 'unknown')) return 'unknown'
  return 'pass'
}

function buildStatusDialogueRealEnvCheck(request?: Record<string, unknown>): StatusDialogueRealEnvCheckResult {
  const provider = getStatusDialogueProviderReadiness()
  const browser = normalizeBrowserSpeechCapabilities(request?.browser)
  const generatedAt = new Date().toISOString()
  const providerPublic: StatusDialogueProviderReadiness = {
    configured: provider.configured,
    api_key_configured: provider.api_key_configured,
    model: provider.model,
    base_url_host: provider.base_url_host,
    provider_label: provider.provider_label
  }
  const items = [
    buildRealCheckItem({
      id: 'phase0.electron_ipc',
      label: 'Electron IPC bridge',
      status: 'pass',
      detail: 'main process real environment check is reachable',
      input_refs: ['renderer.real_env_request'],
      output_refs: ['status_dialogue_real_env_check.v1']
    }),
    buildRealCheckItem({
      id: 'phase0.model_provider_config',
      label: 'OpenAI-compatible model config',
      status: provider.configured ? 'pass' : 'fail',
      detail: provider.configured
        ? `provider ${provider.provider_label} is configured for ${provider.model} at ${provider.base_url_host}`
        : 'model provider is missing api key, model, or base URL',
      input_refs: ['settings.chatProvider.config', 'settings.vision.apiKey'],
      output_refs: ['provider_readiness.redacted'],
      boundary: 'api key is checked but never returned to renderer'
    }),
    buildRealCheckItem({
      id: 'phase0.browser_tts_capability',
      label: 'Browser speech synthesis',
      status: browser.speechSynthesisAvailable ? 'pass' : 'warn',
      detail: browser.speechSynthesisAvailable
        ? 'browser SpeechSynthesis is available for voiceText playback'
        : 'browser SpeechSynthesis is unavailable; text_only fallback remains active',
      input_refs: ['window.speechSynthesis'],
      output_refs: ['speech_output.browser_speech_synthesis']
    }),
    buildRealCheckItem({
      id: 'phase0.microphone_capture_capability',
      label: 'Microphone capture capability',
      status: browser.mediaDevicesAvailable && browser.getUserMediaAvailable && browser.mediaRecorderAvailable ? 'pass' : 'warn',
      detail: browser.mediaDevicesAvailable && browser.getUserMediaAvailable && browser.mediaRecorderAvailable
        ? 'browser exposes getUserMedia and MediaRecorder; current STT prefers Chrome STT Bridge and falls back to Electron/local adapters'
        : 'microphone capture API is incomplete; text input remains the fallback',
      input_refs: ['navigator.mediaDevices.getUserMedia', 'MediaRecorder'],
      output_refs: ['speech_input.audio_stream_ref', 'zhineng:status-dialogue:chrome-stt:transcribe', 'zhineng:status-dialogue:stt:transcribe'],
      boundary: 'no microphone permission is requested during Phase 0'
    }),
    buildRealCheckItem({
      id: 'phase0.web_speech_stt_capability',
      label: 'Chrome speech recognition bridge',
      status: browser.speechRecognitionAvailable ? 'pass' : 'warn',
      detail: browser.speechRecognitionAvailable
        ? 'Electron exposes SpeechRecognition, but Chrome STT Bridge is preferred because real Chrome has the reliable Web Speech backend'
        : 'Electron SpeechRecognition is unavailable; Chrome STT Bridge can still run in the external Chrome process when installed',
      input_refs: ['Chrome webkitSpeechRecognition', 'window.SpeechRecognition', 'window.webkitSpeechRecognition'],
      output_refs: ['speech_transcript', 'chrome_stt_bridge_result.v1']
    }),
    buildRealCheckItem({
      id: 'phase0.boundary_lock',
      label: 'Patrol-only boundary',
      status: 'pass',
      detail: 'real checks only inspect readiness and model connectivity; they do not create requirement packets or write world state',
      input_refs: ['status_dialogue_config.v1'],
      output_refs: ['visible_patrol_boundary']
    })
  ]

  return {
    schema: STATUS_DIALOGUE_REAL_ENV_CHECK_SCHEMA,
    phase: 'real_phase_0',
    generated_at: generatedAt,
    status: summarizeRealCheckStatus(items),
    provider: providerPublic,
    browser,
    items,
    input_ports: [
      'settings.chatProvider.config',
      'settings.vision.apiKey',
      'navigator.mediaDevices',
      'window.speechSynthesis',
      'window.SpeechRecognition'
    ],
    output_ports: [
      'status_dialogue_real_env_check.v1',
      'provider_readiness.redacted',
      'speech_port_readiness',
      'visible_particle_projection'
    ],
    boundaries: [
      'patrol_only',
      'no_requirement_packet',
      'no_world_model_write',
      'no_social_or_event_graph_read',
      'no_audio_sample_persistence',
      'no_external_action'
    ],
    source: 'main_process'
  }
}

function buildFailedStatusDialogueModelTest(input: {
  status?: StatusDialogueRealCheckStatus
  error: string
  provider?: ReturnType<typeof getStatusDialogueProviderReadiness>
  latencyMs?: number
}): StatusDialogueModelTestResult {
  const provider = input.provider ?? getStatusDialogueProviderReadiness()
  return {
    schema: STATUS_DIALOGUE_MODEL_TEST_SCHEMA,
    phase: 'real_phase_1',
    generated_at: new Date().toISOString(),
    success: false,
    status: input.status ?? 'fail',
    adapter_id: STATUS_DIALOGUE_REMOTE_ADAPTER_ID,
    provider_label: provider.provider_label,
    model: provider.model,
    base_url_host: provider.base_url_host,
    latency_ms: input.latencyMs,
    error: input.error,
    input_refs: ['status_dialogue_api_probe.prompt', 'settings.chatProvider.config'],
    output_refs: ['status_dialogue_model_test.v1'],
    boundaries: [
      'patrol_only',
      'api_key_redacted',
      'no_requirement_packet',
      'no_world_model_write',
      'no_external_action'
    ]
  }
}

async function runStatusDialogueModelTest(): Promise<StatusDialogueModelTestResult> {
  const startedAt = Date.now()
  const provider = getStatusDialogueProviderReadiness()
  if (!provider.apiKey) {
    return buildFailedStatusDialogueModelTest({
      provider,
      error: 'status dialogue model api key is not configured',
      latencyMs: Date.now() - startedAt
    })
  }

  try {
    const client = new AIClient({
      apiKey: provider.apiKey,
      model: provider.model,
      baseURL: provider.baseURL,
      systemPrompt:
        'You are a concise first-person subject status patrol module. Return only a short JSON object.'
    })
    const text = await client.callChat([
      {
        role: 'system',
        content:
          'Return JSON only: {"reply":"I can reach the configured model.","voice":"Model link ready.","thoughts":["api reachable"],"status_refs":["phase1.model_api_test"],"missing_status":[]}'
      },
      {
        role: 'user',
        content:
          'Run a connectivity probe for the subject status dialogue module. Do not mention secrets. Keep it first person.'
      }
    ])

    return {
      schema: STATUS_DIALOGUE_MODEL_TEST_SCHEMA,
      phase: 'real_phase_1',
      generated_at: new Date().toISOString(),
      success: true,
      status: 'pass',
      adapter_id: STATUS_DIALOGUE_REMOTE_ADAPTER_ID,
      provider_label: provider.provider_label,
      model: provider.model,
      base_url_host: provider.base_url_host,
      latency_ms: Date.now() - startedAt,
      reply_preview: text.replace(/\s+/g, ' ').slice(0, 180),
      input_refs: ['status_dialogue_api_probe.prompt', 'status_snapshot.summary', 'settings.chatProvider.config'],
      output_refs: ['status_dialogue_model_test.v1', 'model_reply_preview.redacted'],
      boundaries: [
        'patrol_only',
        'api_key_redacted',
        'no_requirement_packet',
        'no_world_model_write',
        'no_external_action'
      ]
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return buildFailedStatusDialogueModelTest({
      provider,
      error: message,
      latencyMs: Date.now() - startedAt
    })
  }
}

function resolveStatusDialogueCardDir(projectRoot: string, cardDir: string): { path?: string; error?: string } {
  if (isAbsolute(cardDir)) {
    return { error: 'status card directory must be relative to project root' }
  }
  const resolved = resolve(projectRoot, cardDir || DEFAULT_STATUS_DIALOGUE_CONFIG.status_read.card_dir)
  const relativePath = relative(projectRoot, resolved)
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return { error: 'status card directory escapes project root' }
  }
  return { path: resolved }
}

function resolveStatusDialogueEventDir(projectRoot: string, eventDir: string): { path?: string; error?: string } {
  if (isAbsolute(eventDir)) {
    return { error: 'status event directory must be relative to project root' }
  }
  const resolved = resolve(projectRoot, eventDir || DEFAULT_STATUS_DIALOGUE_EVENT_DIR)
  const relativePath = relative(projectRoot, resolved)
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return { error: 'status event directory escapes project root' }
  }
  return { path: resolved }
}

function resolveStatusPatrolDialogueIndexPath(projectRoot: string, indexPath: string): { path?: string; error?: string } {
  if (isAbsolute(indexPath)) {
    return { error: 'system patrol dialogue index path must be relative to project root' }
  }
  const resolved = resolve(projectRoot, indexPath || DEFAULT_SYSTEM_PATROL_DIALOGUE_READ_INDEX_PATH)
  const relativePath = relative(projectRoot, resolved)
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return { error: 'system patrol dialogue index path escapes project root' }
  }
  return { path: resolved }
}

function readStatusDialogueSnapshot(request?: Record<string, unknown>): StatusSnapshotReadResult {
  const config = normalizeStatusDialogueConfig(request?.config)
  const expectedModules = normalizeExpectedStatusModules(request?.expected_modules)
  const projectRoot = zhinengProjectRoot()
  const readErrors: string[] = []
  const cardDirResult = resolveStatusDialogueCardDir(projectRoot, config.status_read.card_dir)
  const fallbackSnapshot = buildStatusSnapshotFromCards({
    cards: [],
    expectedModules,
    ttlMs: config.status_read.ttl_ms,
    readErrors,
    source: 'main_process_status_cards'
  })

  if (cardDirResult.error || !cardDirResult.path) {
    const error = cardDirResult.error ?? 'status card directory could not be resolved'
    return {
      success: false,
      snapshot: {
        ...fallbackSnapshot,
        read_errors: [error],
        patrol_findings: [error, ...fallbackSnapshot.patrol_findings].slice(0, 8)
      },
      source: 'main_process_status_cards',
      card_dir: config.status_read.card_dir,
      errors: [error]
    }
  }

  if (!existsSync(cardDirResult.path)) {
    return {
      success: true,
      snapshot: fallbackSnapshot,
      source: 'main_process_status_cards',
      card_dir: cardDirResult.path,
      errors: []
    }
  }

  const cards: ModuleStatusCard[] = []
  try {
    const entries = readdirSync(cardDirResult.path, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue
      const filePath = join(cardDirResult.path, entry.name)
      try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown
        const card = normalizeModuleStatusCard(parsed)
        if (card) {
          cards.push(card)
        } else {
          readErrors.push(`${entry.name}: invalid module_status_card.v1`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        readErrors.push(`${entry.name}: ${message.slice(0, 120)}`)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    readErrors.push(`status card dir read failed: ${message.slice(0, 120)}`)
  }

  return {
    success: readErrors.length === 0,
    snapshot: buildStatusSnapshotFromCards({
      cards,
      expectedModules,
      ttlMs: config.status_read.ttl_ms,
      readErrors,
      source: 'main_process_status_cards'
    }),
    source: 'main_process_status_cards',
    card_dir: cardDirResult.path,
    errors: readErrors
  }
}

function extractModuleStatusEvents(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>
    if (Array.isArray(record.events)) return record.events
  }
  return [parsed]
}

function readStatusDialogueEvents(request?: Record<string, unknown>): SystemEventSnapshotReadResult {
  const eventDir =
    typeof request?.event_dir === 'string' && request.event_dir.trim()
      ? request.event_dir.trim()
      : DEFAULT_STATUS_DIALOGUE_EVENT_DIR
  const ttlMs =
    typeof request?.ttl_ms === 'number' && Number.isFinite(request.ttl_ms)
      ? Math.max(0, request.ttl_ms)
      : DEFAULT_STATUS_DIALOGUE_EVENT_TTL_MS
  const expectedPublishers = normalizeExpectedStatusEventPublishers(
    request?.expected_publishers ?? request?.expected_modules
  )
  const projectRoot = zhinengProjectRoot()
  const readErrors: string[] = []
  const eventDirResult = resolveStatusDialogueEventDir(projectRoot, eventDir)
  const fallbackSnapshot = buildSystemEventSnapshot({
    events: [],
    expectedPublishers,
    ttlMs,
    readErrors,
    source: 'main_process_status_events',
    eventDir
  })

  if (eventDirResult.error || !eventDirResult.path) {
    const error = eventDirResult.error ?? 'status event directory could not be resolved'
    return {
      success: false,
      snapshot: {
        ...fallbackSnapshot,
        read_errors: [error],
        patrol_findings: [error, ...fallbackSnapshot.patrol_findings].slice(0, 8)
      },
      source: 'main_process_status_events',
      event_dir: eventDir,
      errors: [error]
    }
  }

  if (!existsSync(eventDirResult.path)) {
    return {
      success: true,
      snapshot: {
        ...fallbackSnapshot,
        event_dir: eventDirResult.path
      },
      source: 'main_process_status_events',
      event_dir: eventDirResult.path,
      errors: []
    }
  }

  const events: ModuleStatusEvent[] = []
  try {
    const entries = readdirSync(eventDirResult.path, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue
      const filePath = join(eventDirResult.path, entry.name)
      try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown
        const rawEvents = extractModuleStatusEvents(parsed)
        let accepted = 0
        for (const rawEvent of rawEvents) {
          const event = normalizeModuleStatusEvent(rawEvent)
          if (event) {
            events.push(event)
            accepted += 1
          }
        }
        if (accepted === 0) {
          readErrors.push(`${entry.name}: invalid module_status_event.v1`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        readErrors.push(`${entry.name}: ${message.slice(0, 120)}`)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    readErrors.push(`status event dir read failed: ${message.slice(0, 120)}`)
  }

  return {
    success: readErrors.length === 0,
    snapshot: buildSystemEventSnapshot({
      events,
      expectedPublishers,
      ttlMs,
      readErrors,
      source: 'main_process_status_events',
      eventDir: eventDirResult.path
    }),
    source: 'main_process_status_events',
    event_dir: eventDirResult.path,
    errors: readErrors
  }
}

function readStatusPatrolDialogueIndex(request?: Record<string, unknown>): SystemPatrolDialogueIndexReadResult {
  const requestedIndexPath =
    typeof request?.index_path === 'string' && request.index_path.trim()
      ? request.index_path.trim()
      : DEFAULT_SYSTEM_PATROL_DIALOGUE_READ_INDEX_PATH
  const projectRoot = zhinengProjectRoot()
  const indexPathResult = resolveStatusPatrolDialogueIndexPath(projectRoot, requestedIndexPath)
  const source = 'main_process_dialogue_read_index'

  if (indexPathResult.error || !indexPathResult.path) {
    const error = indexPathResult.error ?? 'system patrol dialogue index path could not be resolved'
    return {
      success: false,
      source,
      index_path: requestedIndexPath,
      summary: summarizeSystemPatrolDialogueReadIndex(null, {
        readErrors: [error],
        source,
        indexPath: requestedIndexPath
      }),
      errors: [error]
    }
  }

  if (!existsSync(indexPathResult.path)) {
    const error = 'system patrol dialogue index file is missing'
    return {
      success: false,
      source,
      index_path: indexPathResult.path,
      summary: summarizeSystemPatrolDialogueReadIndex(null, {
        readErrors: [error],
        source,
        indexPath: indexPathResult.path
      }),
      errors: [error]
    }
  }

  try {
    const parsed = JSON.parse(readFileSync(indexPathResult.path, 'utf8')) as unknown
    const index = normalizeSystemPatrolDialogueReadIndex(parsed)
    if (!index) {
      const error = 'invalid system_patrol_dialogue_read_index.v1'
      return {
        success: false,
        source,
        index_path: indexPathResult.path,
        summary: summarizeSystemPatrolDialogueReadIndex(null, {
          readErrors: [error],
          source,
          indexPath: indexPathResult.path
        }),
        errors: [error]
      }
    }
    return {
      success: true,
      source,
      index_path: indexPathResult.path,
      index,
      summary: summarizeSystemPatrolDialogueReadIndex(index, {
        source,
        indexPath: indexPathResult.path
      }),
      errors: []
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const readError = `system patrol dialogue index read failed: ${message.slice(0, 120)}`
    return {
      success: false,
      source,
      index_path: indexPathResult.path,
      summary: summarizeSystemPatrolDialogueReadIndex(null, {
        readErrors: [readError],
        source,
        indexPath: indexPathResult.path
      }),
      errors: [readError]
    }
  }
}

const STATUS_DIALOGUE_REAL_VOICE_RETEST_SUITE_REPORT_PREFIX = 'status-dialogue-real-voice-retest-suite-'
const STATUS_DIALOGUE_REAL_STT_ENTRY_DIAGNOSIS_REPORT_PREFIX = 'status-dialogue-real-stt-entry-diagnosis-'

function compactStatusDialogueString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 180) : fallback
}

function compactStatusDialogueStringArray(value: unknown, limit = 6): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 120))
    .slice(0, limit)
  return items.length > 0 ? items : undefined
}

function compactStatusDialogueNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function findLatestStatusDialogueRuntimeVoiceReport(
  reportPrefix: string
): { fileName: string; filePath: string } | undefined {
  const candidates: Array<{ fileName: string; filePath: string }> = []
  for (const dir of getStatusDialogueRuntimeVoiceReportDirs()) {
    if (!existsSync(dir)) continue
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.startsWith(reportPrefix) && entry.name.toLowerCase().endsWith('.json')) {
        candidates.push({
          fileName: entry.name,
          filePath: join(dir, entry.name)
        })
      }
    }
  }

  candidates.sort((left, right) => right.fileName.localeCompare(left.fileName))
  return candidates[0]
}

function compactStatusDialogueRuntimeRect(value: unknown):
  | {
      x?: number
      y?: number
      width?: number
      height?: number
      top?: number
      left?: number
      right?: number
      bottom?: number
    }
  | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const rect: {
    x?: number
    y?: number
    width?: number
    height?: number
    top?: number
    left?: number
    right?: number
    bottom?: number
  } = {}
  for (const key of ['x', 'y', 'width', 'height', 'top', 'left', 'right', 'bottom'] as const) {
    const numberValue = compactStatusDialogueNumber(record[key])
    if (numberValue !== undefined) rect[key] = numberValue
  }
  return Object.keys(rect).length > 0 ? rect : undefined
}

function compactStatusDialogueRuntimeElement(value: unknown):
  | {
      tag?: string
      class_name?: string
      aria_label?: string
      title?: string
      text?: string
    }
  | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const element: {
    tag?: string
    class_name?: string
    aria_label?: string
    title?: string
    text?: string
  } = {}
  const tag = compactStatusDialogueString(record.tag)
  const className = compactStatusDialogueString(record.class_name)
  const ariaLabel = compactStatusDialogueString(record.aria_label)
  const title = compactStatusDialogueString(record.title)
  const text = compactStatusDialogueString(record.text)
  if (tag) element.tag = tag
  if (className) element.class_name = className
  if (ariaLabel) element.aria_label = ariaLabel
  if (title) element.title = title
  if (text) element.text = text
  return Object.keys(element).length > 0 ? element : undefined
}

function compactStatusDialogueEntrySnapshot(
  value: unknown
): StatusDialogueRuntimeVoiceDiagnostic['summary']['entry_snapshot'] | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const snapshot: NonNullable<StatusDialogueRuntimeVoiceDiagnostic['summary']['entry_snapshot']> = {}
  if (typeof record.stt_button_found === 'boolean') snapshot.stt_button_found = record.stt_button_found
  if (typeof record.stt_button_disabled === 'boolean') snapshot.stt_button_disabled = record.stt_button_disabled
  if (typeof record.panel_found === 'boolean') snapshot.panel_found = record.panel_found
  const ariaLabel = compactStatusDialogueString(record.stt_button_aria_label)
  const selectedAdapter = compactStatusDialogueString(record.selected_adapter)
  const reason = compactStatusDialogueString(record.reason)
  const ts = compactStatusDialogueString(record.ts)
  const line = compactStatusDialogueNumber(record.line)
  const buttonRect = compactStatusDialogueRuntimeRect(record.stt_button_rect)
  const buttonCenter = compactStatusDialogueRuntimeRect(record.stt_button_center)
  const centerHit = compactStatusDialogueRuntimeElement(record.stt_button_center_hit)
  const panelRect = compactStatusDialogueRuntimeRect(record.panel_rect)
  if (ariaLabel) snapshot.stt_button_aria_label = ariaLabel
  if (buttonRect) snapshot.stt_button_rect = buttonRect
  if (buttonCenter) snapshot.stt_button_center = { x: buttonCenter.x, y: buttonCenter.y }
  if (centerHit) snapshot.stt_button_center_hit = centerHit
  if (panelRect) snapshot.panel_rect = panelRect
  if (selectedAdapter) snapshot.selected_adapter = selectedAdapter
  if (reason) snapshot.reason = reason
  if (ts) snapshot.ts = ts
  if (line !== undefined) snapshot.line = line
  return Object.keys(snapshot).length > 0 ? snapshot : undefined
}

function getStatusDialogueRuntimeVoiceReportDirs(): string[] {
  const candidates = [
    resolve(process.cwd(), 'runtime', 'verification-reports'),
    resolve(app.getAppPath(), 'runtime', 'verification-reports'),
    join(zhinengProjectRoot(), 'sightflow-desktop-agent-main', 'runtime', 'verification-reports'),
    join(zhinengProjectRoot(), 'runtime', 'verification-reports')
  ]
  return Array.from(new Set(candidates.map((candidate) => resolve(candidate))))
}

function buildUnavailableStatusDialogueRuntimeVoiceDiagnostic(
  result: string,
  nextAction: string,
  summary: StatusDialogueRuntimeVoiceDiagnostic['summary'] = {}
): StatusDialogueRuntimeVoiceDiagnostic {
  return {
    schema: STATUS_DIALOGUE_RUNTIME_VOICE_DIAGNOSTIC_SCHEMA,
    source: 'unavailable',
    generated_at: new Date().toISOString(),
    result,
    next_action: nextAction,
    boundary:
      'read-only runtime voice diagnostic; no microphone open; no audio upload; no world model write; no requirement packet',
    summary
  }
}

function readLatestStatusDialogueRuntimeVoiceDiagnostic(): StatusDialogueRuntimeVoiceDiagnostic {
  try {
    const latest = findLatestStatusDialogueRuntimeVoiceReport(STATUS_DIALOGUE_REAL_VOICE_RETEST_SUITE_REPORT_PREFIX)
    if (!latest) {
      return buildUnavailableStatusDialogueRuntimeVoiceDiagnostic(
        'no_retest_suite_report',
        'run_voice_runtime_flow_real_voice_suite'
      )
    }

    const parsed = JSON.parse(readFileSync(latest.filePath, 'utf8')) as Record<string, unknown>
    const latestEntry = findLatestStatusDialogueRuntimeVoiceReport(STATUS_DIALOGUE_REAL_STT_ENTRY_DIAGNOSIS_REPORT_PREFIX)
    let entryReportPath: string | undefined
    let entryDiagnosisResult: string | undefined
    let entryDiagnosisNextAction: string | undefined
    let entrySnapshot: StatusDialogueRuntimeVoiceDiagnostic['summary']['entry_snapshot'] | undefined
    if (latestEntry) {
      try {
        const parsedEntry = JSON.parse(readFileSync(latestEntry.filePath, 'utf8')) as Record<string, unknown>
        const latestRecord =
          parsedEntry.latest && typeof parsedEntry.latest === 'object'
            ? (parsedEntry.latest as Record<string, unknown>)
            : {}
        entryReportPath = latestEntry.filePath
        entryDiagnosisResult = compactStatusDialogueString(parsedEntry.result) || undefined
        entryDiagnosisNextAction = compactStatusDialogueString(parsedEntry.next_action) || undefined
        entrySnapshot = compactStatusDialogueEntrySnapshot(latestRecord.entry_snapshot)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        entryDiagnosisResult = 'entry_diagnosis_read_failed'
        entryDiagnosisNextAction = message.slice(0, 120)
      }
    }
    const summaryRecord =
      parsed.summary && typeof parsed.summary === 'object'
        ? (parsed.summary as Record<string, unknown>)
        : {}
    const goalSummaryRecord =
      summaryRecord.goal_summary && typeof summaryRecord.goal_summary === 'object'
        ? (summaryRecord.goal_summary as Record<string, unknown>)
        : undefined
    const remoteReady = summaryRecord.remote_config_ready_for_probe

    return {
      schema: STATUS_DIALOGUE_RUNTIME_VOICE_DIAGNOSTIC_SCHEMA,
      source: 'main_process_report',
      generated_at: compactStatusDialogueString(parsed.generated_at, new Date().toISOString()),
      report_path: latest.filePath,
      entry_report_path: entryReportPath,
      result: compactStatusDialogueString(parsed.result, 'unknown'),
      next_action: compactStatusDialogueString(parsed.next_action) || undefined,
      boundary:
        'read-only latest status-dialogue real voice retest suite report; no microphone open; no audio upload; no world model write; no requirement packet',
      summary: {
        pre_entry: compactStatusDialogueString(summaryRecord.pre_entry) || undefined,
        turns: compactStatusDialogueString(summaryRecord.turns) || undefined,
        post_entry: compactStatusDialogueString(summaryRecord.post_entry) || undefined,
        entry_diagnosis_result: entryDiagnosisResult,
        entry_diagnosis_next_action: entryDiagnosisNextAction,
        entry_snapshot: entrySnapshot,
        runtime_audit: compactStatusDialogueString(summaryRecord.runtime_audit) || undefined,
        remote_config_ready_for_probe:
          typeof remoteReady === 'boolean' ? remoteReady : undefined,
        remote_config_missing: compactStatusDialogueStringArray(summaryRecord.remote_config_missing),
        goal_result: compactStatusDialogueString(summaryRecord.goal_result) || undefined,
        goal_summary: goalSummaryRecord
          ? {
              proved: compactStatusDialogueNumber(goalSummaryRecord.proved),
              partial: compactStatusDialogueNumber(goalSummaryRecord.partial),
              missing: compactStatusDialogueNumber(goalSummaryRecord.missing),
              total: compactStatusDialogueNumber(goalSummaryRecord.total)
            }
          : undefined
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return buildUnavailableStatusDialogueRuntimeVoiceDiagnostic(
      'runtime_voice_diagnostic_read_failed',
      'inspect_verification_report_dir',
      {
        pre_entry: message.slice(0, 160)
      }
    )
  }
}

function renderBridgeIngressMarkdown(report: Record<string, any>): string {
  return `# Desktop Target Flow Ingress

- report_id: ${report.report_id}
- created_at: ${report.created_at}
- gate_decision: ${report.gate_decision}
- observation_id: ${report.observation_id}
- observation_path: ${report.observation_path}

## Boundary

The desktop receiver only provides window recognition, read-only capture and the controlled reply shell. Storage, readback, semantic analysis, event decomposition, graph updates, expert analysis and draft generation remain owned by the Zhineng logic system.

Compatibility fields that still contain "sightflow" identify the upstream desktop adapter contract, not backend ownership.

## Next Commands

\`\`\`powershell
npm run desktop:inbox:real:ingest -- --observation="${report.observation_path}"
npm run desktop:context -- --observation="${report.observation_path}"
\`\`\`
`
}

function latestZhinengDecisionStatePath(): string {
  return join(zhinengProjectRoot(), 'runtime', 'pt028-gui-decision-states', 'latest.json')
}

function latestZhinengOperatorNextStepPath(): string {
  return join(zhinengProjectRoot(), 'runtime', 'pt028-operator-next-steps', 'latest.json')
}

function readLatestZhinengOperatorNextStep(): {
  latest_path: string
  operator_next_step: Record<string, unknown> | null
  status: string
  error?: string
  next_command?: string
} {
  const latestPath = latestZhinengOperatorNextStepPath()
  if (!existsSync(latestPath)) {
    return {
      latest_path: latestPath,
      operator_next_step: null,
      status: 'pt028_operator_next_step_missing',
      next_command: 'npm run pt028:operator-next-step'
    }
  }

  try {
    return {
      latest_path: latestPath,
      operator_next_step: JSON.parse(readFileSync(latestPath, 'utf8')) as Record<string, unknown>,
      status: 'pt028_operator_next_step_loaded'
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      latest_path: latestPath,
      operator_next_step: null,
      status: 'pt028_operator_next_step_parse_failed',
      error: message,
      next_command: 'npm run pt028:operator-next-step'
    }
  }
}

function readLatestZhinengDecisionState(): Record<string, unknown> {
  const latestPath = latestZhinengDecisionStatePath()
  if (!existsSync(latestPath)) {
    return {
      success: false,
      reason: 'pt028_gui_decision_state_missing',
      latest_path: latestPath,
      next_command: 'npm run pt028:gui-state'
    }
  }

  try {
    const state = JSON.parse(readFileSync(latestPath, 'utf8')) as Record<string, unknown>
    const nextStep = readLatestZhinengOperatorNextStep()
    return {
      success: true,
      latest_path: latestPath,
      operator_next_step_path: nextStep.latest_path,
      operator_next_step_status: nextStep.status,
      operator_next_step_error: nextStep.error,
      operator_next_step_next_command: nextStep.next_command,
      state: {
        ...state,
        operator_next_step: nextStep.operator_next_step,
        operator_next_step_status: nextStep.status
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      reason: 'pt028_gui_decision_state_parse_failed',
      latest_path: latestPath,
      error: message,
      next_command: 'npm run pt028:gui-state'
    }
  }
}

function broadcastZhinengDecisionState(reason: string): void {
  const result = readLatestZhinengDecisionState()
  const fingerprint = JSON.stringify(result)
  if (fingerprint === zhinengDecisionStateLastFingerprint && reason !== 'manual_refresh') return
  zhinengDecisionStateLastFingerprint = fingerprint
  const payload = {
    ...result,
    event: {
      schema_version: 'pt028_gui_state_event.v1',
      event_type: 'decision_state_file_changed',
      reason,
      created_at: new Date().toISOString(),
      ipc_channel: 'zhineng:decision-state:changed',
      target_dispatch_latency_ms: 1000,
      fallback_poll_interval_ms: 5000,
      real_execution_allowed: result.success === true
        ? (result.state as Record<string, unknown> | undefined)?.real_execution_allowed === true
        : false
    }
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('zhineng:decision-state:changed', payload)
    }
  }
}

function scheduleZhinengDecisionStateBroadcast(reason: string): void {
  if (zhinengDecisionStateBroadcastTimer) clearTimeout(zhinengDecisionStateBroadcastTimer)
  zhinengDecisionStateBroadcastTimer = setTimeout(() => {
    zhinengDecisionStateBroadcastTimer = null
    broadcastZhinengDecisionState(reason)
  }, 250)
}

function startZhinengDecisionStateWatch(): void {
  if (zhinengDecisionStateWatcher) return
  const latestPath = latestZhinengDecisionStatePath()
  const latestDir = dirname(latestPath)
  mkdirSync(latestDir, { recursive: true })
  try {
    zhinengDecisionStateWatcher = watch(latestDir, { persistent: false }, (_eventType, filename) => {
      if (!filename || basename(filename.toString()) === 'latest.json') {
        scheduleZhinengDecisionStateBroadcast('latest_json_changed')
      }
    })
    scheduleZhinengDecisionStateBroadcast('watch_started')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[ZhinengDecisionState] watch failed', message)
  }
}

function stopZhinengDecisionStateWatch(): void {
  if (zhinengDecisionStateBroadcastTimer) {
    clearTimeout(zhinengDecisionStateBroadcastTimer)
    zhinengDecisionStateBroadcastTimer = null
  }
  if (zhinengDecisionStateWatcher) {
    zhinengDecisionStateWatcher.close()
    zhinengDecisionStateWatcher = null
  }
}

async function submitZhinengBridgeObservationToLogicSystem(
  observation: IntakeObservation
): Promise<ZhinengBridgeSubmission> {
  const createdAt = new Date().toISOString()
  const observationId = observation.observation_id
  const runId = `desktop_bridge_ingress_${compactTimestamp(new Date(createdAt))}_${safePathSegment(
    observationId
  ).slice(-24)}`
  const outputDir = join(zhinengProjectRoot(), 'runtime', 'desktop-inbox-real', runId)
  mkdirSync(outputDir, { recursive: true })

  const enrichedObservation: IntakeObservation = {
    ...observation,
    metadata: {
      ...(observation.metadata ?? {}),
      bridge_ingress_schema_version: 'sightflow_to_zhineng_logic_handoff.v1',
      backend_processing_owner: 'zhineng_logic_system',
      sightflow_capability_scope: ['desktop_recognition', 'controlled_reply_shell'],
      sightflow_backend_processing_allowed: false,
      logic_system_handoff_required: true,
      provider_reply_allowed: false,
      read_only_capture: true,
      real_execution_allowed: false,
      real_send_attempted: false
    }
  }

  const observationPath = join(outputDir, 'intake-observation.real.json')
  writeFileSync(observationPath, `${JSON.stringify(enrichedObservation, null, 2)}\n`, 'utf8')

  const report = {
    schema_version: 'sightflow_target_flow_ingress.v1',
    report_id: runId,
    created_at: createdAt,
    gate_decision: 'ready_for_zhineng_logic_system_ingest',
    observation_id: observationId,
    output_dir: outputDir,
    observation_path: observationPath,
    target_boundary: {
      sightflow_allowed_roles: ['desktop_recognition', 'controlled_reply_shell'],
      zhineng_logic_system_roles: [
        'storage',
        'readback',
        'semantic_analysis',
        'event_decomposition',
        'relationship_graph',
        'event_graph',
        'expert_matrix',
        'message_draft_generation'
      ],
      provider_direct_reply_allowed: false,
      real_execution_allowed: false,
      real_send_attempted: false
    },
    next_commands: [
      `npm run desktop:inbox:real:ingest -- --observation="${observationPath}"`,
      `npm run desktop:context -- --observation="${observationPath}"`
    ]
  }
  const reportPath = join(outputDir, 'sightflow-target-flow-ingress.json')
  const markdownPath = join(outputDir, 'sightflow-target-flow-ingress.md')
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  writeFileSync(markdownPath, renderBridgeIngressMarkdown(report), 'utf8')

  return {
    success: true,
    observation_id: observationId,
    output_dir: outputDir,
    observation_path: observationPath,
    report_path: reportPath,
    gate_decision: report.gate_decision
  }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 420,
    height: 700,
    minWidth: 360,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    title: APP_DISPLAY_TITLE,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#0a0b10',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore()
    settingsWindow.show()
    settingsWindow.focus()
    notifyZhinengDockPanelState(true, 'settings_window_reused', 'settings')
    return
  }

  settingsWindow = new BrowserWindow({
    width: 900,
    height: 720,
    minWidth: 860,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: APP_DISPLAY_TITLE,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#0a0b10',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  settingsWindow.on('ready-to-show', () => {
    settingsWindow?.show()
    notifyZhinengDockPanelState(true, 'settings_window_ready', 'settings')
  })

  settingsWindow.on('minimize', () => {
    notifyZhinengDockPanelState(false, 'settings_window_minimized', 'settings')
  })

  settingsWindow.on('restore', () => {
    notifyZhinengDockPanelState(true, 'settings_window_restored', 'settings')
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
    notifyZhinengDockPanelState(false, 'settings_window_closed', 'settings')
  })

  settingsWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    settingsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?window=settings`)
  } else {
    settingsWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: 'settings' }
    })
  }
}

function createZhinengConsoleWindow(): void {
  if (zhinengConsoleWindow && !zhinengConsoleWindow.isDestroyed()) {
    if (zhinengConsoleWindow.isMinimized()) zhinengConsoleWindow.restore()
    zhinengConsoleWindow.show()
    zhinengConsoleWindow.focus()
    notifyZhinengDockPanelState(true, 'console_window_reused')
    return
  }

  zhinengConsoleWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: APP_DISPLAY_TITLE,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#f5f7fb',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  zhinengConsoleWindow.on('ready-to-show', () => {
    zhinengConsoleWindow?.show()
    notifyZhinengDockPanelState(true, 'console_window_ready')
  })

  zhinengConsoleWindow.on('minimize', () => {
    notifyZhinengDockPanelState(false, 'console_window_minimized')
  })

  zhinengConsoleWindow.on('restore', () => {
    notifyZhinengDockPanelState(true, 'console_window_restored')
  })

  zhinengConsoleWindow.on('closed', () => {
    zhinengConsoleWindow = null
    notifyZhinengDockPanelState(false, 'console_window_closed')
  })

  zhinengConsoleWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    zhinengConsoleWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?window=zhineng-console`)
  } else {
    zhinengConsoleWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: 'zhineng-console' }
    })
  }
}

type ZhinengDockAttachmentState = {
  attached: boolean
  appType: AppType
  targetTitle?: string
  reason: string
  updatedAt: string
  position: { x: number; y: number; width: number; height: number }
}

type ZhinengDockPanelState = {
  expanded: boolean
  panel: 'settings' | 'zhineng_console' | 'graph'
  reason: string
  updatedAt: string
}

const ZHINENG_DOCK_SIZE = { width: 132, height: 136 }
const ZHINENG_DOCK_MARGIN = 12
const ZHINENG_GRAPH_SIZE = { width: 760, height: 580 }

function isZhinengGraphWebContents(webContents: WebContents | null | undefined): boolean {
  if (!webContents) return false
  if (zhinengGraphWindow && !zhinengGraphWindow.isDestroyed() && webContents.id === zhinengGraphWindow.webContents.id) {
    return true
  }
  try {
    return webContents.getURL().includes('window=zhineng-graph')
  } catch {
    return false
  }
}

function installStatusDialogueMediaPermissionHandlers(): void {
  if (statusDialogueMediaPermissionHandlersInstalled) return
  statusDialogueMediaPermissionHandlersInstalled = true

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission !== 'media') {
      callback(false)
      return
    }

    const mediaDetails = details as { mediaTypes?: string[]; mediaType?: string }
    const mediaTypes = Array.isArray(mediaDetails.mediaTypes) ? mediaDetails.mediaTypes : []
    const requestsAudio = mediaTypes.includes('audio') || mediaDetails.mediaType === 'audio'
    const requestsVideo = mediaTypes.includes('video') || mediaDetails.mediaType === 'video'
    callback(isZhinengGraphWebContents(webContents) && requestsAudio && !requestsVideo)
  })

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission !== 'media') return false
    return isZhinengGraphWebContents(webContents)
  })
}

function getCenteredGraphBounds(): Electron.Rectangle {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { width, height } = ZHINENG_GRAPH_SIZE
  return {
    width,
    height,
    x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y: Math.round(display.workArea.y + (display.workArea.height - height) / 2)
  }
}

function notifyZhinengDockPanelState(
  expanded: boolean,
  reason: string,
  panel: ZhinengDockPanelState['panel'] = 'zhineng_console'
): void {
  if (zhinengDockWindow && !zhinengDockWindow.isDestroyed()) {
    const state: ZhinengDockPanelState = {
      expanded,
      panel,
      reason,
      updatedAt: new Date().toISOString()
    }
    zhinengDockWindow.webContents.send('zhineng:dock-panel-state', state)
  }
}

function showZhinengGraphWindow(reason: string): boolean {
  if (!zhinengGraphWindow || zhinengGraphWindow.isDestroyed()) return false
  if (zhinengGraphWindow.isMinimized()) zhinengGraphWindow.restore()
  zhinengGraphWindow.setBounds(getCenteredGraphBounds(), false)
  zhinengGraphWindow.setAlwaysOnTop(true, 'floating')
  zhinengGraphWindow.show()
  zhinengGraphWindow.moveTop()
  zhinengGraphWindow.focus()
  notifyZhinengDockPanelState(true, reason, 'graph')
  return true
}

function closeZhinengGraphWindowFromTray(): void {
  if (zhinengGraphWindow && !zhinengGraphWindow.isDestroyed()) {
    zhinengGraphWindow.close()
  }
  updateZhinengTrayMenu()
}

function closeZhinengDockWindowFromTray(): void {
  if (zhinengDockWindow && !zhinengDockWindow.isDestroyed()) {
    zhinengDockWindow.close()
  } else {
    stopZhinengDockTracking()
  }
  updateZhinengTrayMenu()
}

function updateZhinengTrayMenu(): void {
  if (!zhinengTray) return
  const dockOpen = Boolean(zhinengDockWindow && !zhinengDockWindow.isDestroyed())
  const graphOpen = Boolean(zhinengGraphWindow && !zhinengGraphWindow.isDestroyed())
  zhinengTray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '打开右下角悬浮窗',
        enabled: !dockOpen,
        click: () => {
          createZhinengDockWindow()
          updateZhinengTrayMenu()
        }
      },
      {
        label: '关闭右下角悬浮窗',
        enabled: dockOpen,
        click: closeZhinengDockWindowFromTray
      },
      { type: 'separator' },
      {
        label: '打开 3D 粒子 OS',
        click: () => {
          createZhinengGraphWindow()
          updateZhinengTrayMenu()
        }
      },
      {
        label: '关闭 3D 粒子 OS',
        enabled: graphOpen,
        click: closeZhinengGraphWindowFromTray
      },
      { type: 'separator' },
      {
        label: '退出程序',
        click: () => {
          zhinengQuitRequested = true
          app.quit()
        }
      }
    ])
  )
}

function createZhinengTray(): void {
  if (zhinengTray) return
  const trayIcon = nativeImage.createFromPath(icon)
  zhinengTray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon.resize({ width: 16, height: 16 }))
  zhinengTray.setToolTip(`${APP_DISPLAY_TITLE} 悬浮窗`)
  zhinengTray.on('click', () => {
    createZhinengDockWindow()
    updateZhinengTrayMenu()
  })
  zhinengTray.on('right-click', updateZhinengTrayMenu)
  updateZhinengTrayMenu()
}

function createZhinengGraphWindow(state: Record<string, unknown> = {}): void {
  const serializedState = JSON.stringify(state)
  const encodedState = encodeURIComponent(serializedState)
  if (zhinengGraphWindow && !zhinengGraphWindow.isDestroyed()) {
    showZhinengGraphWindow('graph_window_reused')
    zhinengGraphWindow.webContents.send('zhineng:graph-state', state)
    return
  }

  const { x, y, width, height } = getCenteredGraphBounds()

  zhinengGraphWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 680,
    minHeight: 520,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    skipTaskbar: false,
    alwaysOnTop: true,
    hasShadow: true,
    title: APP_DISPLAY_TITLE,
    backgroundColor: '#00000000',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  zhinengGraphWindow.setAlwaysOnTop(true, 'floating')

  const showFallbackTimer = setTimeout(() => {
    if (zhinengGraphWindow && !zhinengGraphWindow.isDestroyed() && !zhinengGraphWindow.isVisible()) {
      showZhinengGraphWindow('graph_window_show_fallback')
    }
  }, 1200)

  zhinengGraphWindow.on('ready-to-show', () => {
    showZhinengGraphWindow('graph_window_ready')
  })

  zhinengGraphWindow.webContents.on('did-finish-load', () => {
    showZhinengGraphWindow('graph_window_loaded')
  })

  zhinengGraphWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[ZhinengGraphWindow] did-fail-load', { errorCode, errorDescription })
  })

  zhinengGraphWindow.on('closed', () => {
    clearTimeout(showFallbackTimer)
    zhinengGraphWindow = null
    notifyZhinengDockPanelState(false, 'graph_window_closed', 'graph')
    updateZhinengTrayMenu()
  })

  zhinengGraphWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    zhinengGraphWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?window=zhineng-graph&state=${encodedState}`)
  } else {
    zhinengGraphWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: 'zhineng-graph', state: serializedState }
    })
  }
}

function createZhinengDockWindow(): void {
  if (zhinengDockWindow && !zhinengDockWindow.isDestroyed()) {
    zhinengDockWindow.showInactive()
    void refreshZhinengDockAttachment()
    return
  }

  zhinengDockWindow = new BrowserWindow({
    width: ZHINENG_DOCK_SIZE.width,
    height: ZHINENG_DOCK_SIZE.height,
    minWidth: ZHINENG_DOCK_SIZE.width,
    minHeight: ZHINENG_DOCK_SIZE.height,
    maxWidth: ZHINENG_DOCK_SIZE.width,
    maxHeight: ZHINENG_DOCK_SIZE.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  zhinengDockWindow.setAlwaysOnTop(true, 'floating')
  zhinengDockWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  zhinengDockWindow.on('ready-to-show', () => {
    zhinengDockWindow?.showInactive()
    startZhinengDockTracking()
    void refreshZhinengDockAttachment()
  })

  zhinengDockWindow.on('closed', () => {
    zhinengDockWindow = null
    stopZhinengDockTracking()
    updateZhinengTrayMenu()
  })

  zhinengDockWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    zhinengDockWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?window=zhineng-dock`)
  } else {
    zhinengDockWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: 'zhineng-dock' }
    })
  }
}

function startZhinengDockTracking(): void {
  stopZhinengDockTracking()
  zhinengDockTimer = setInterval(() => {
    void refreshZhinengDockAttachment()
  }, 1400)
}

function stopZhinengDockTracking(): void {
  if (zhinengDockTimer) {
    clearInterval(zhinengDockTimer)
    zhinengDockTimer = null
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getWindowTitle(windowInfo: any): string | undefined {
  try {
    if (typeof windowInfo?.wechatWindow?.getTitle === 'function') return windowInfo.wechatWindow.getTitle()
    if (typeof windowInfo?.wechatWindow?.title === 'string') return windowInfo.wechatWindow.title
  } catch {
    return undefined
  }
  return undefined
}

function fallbackDockState(appType: AppType, reason: string): ZhinengDockAttachmentState {
  const workArea = screen.getPrimaryDisplay().workArea
  const x = workArea.x + workArea.width - ZHINENG_DOCK_SIZE.width - ZHINENG_DOCK_MARGIN
  const y = workArea.y + workArea.height - ZHINENG_DOCK_SIZE.height - ZHINENG_DOCK_MARGIN
  return {
    attached: false,
    appType,
    reason,
    updatedAt: new Date().toISOString(),
    position: { x, y, ...ZHINENG_DOCK_SIZE }
  }
}

function positionFromTargetBounds(
  appType: AppType,
  windowInfo: any
): ZhinengDockAttachmentState {
  const bounds = windowInfo.bounds
  const display = screen.getDisplayMatching({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  })
  const workArea = display.workArea
  const outsideRight = bounds.x + bounds.width + 8
  const insideRight = bounds.x + bounds.width - ZHINENG_DOCK_SIZE.width - ZHINENG_DOCK_MARGIN
  const targetX =
    outsideRight + ZHINENG_DOCK_SIZE.width <= workArea.x + workArea.width
      ? outsideRight
      : insideRight
  const targetY = bounds.y + clamp(Math.round(bounds.height * 0.18), 48, 110)
  const x = clamp(
    targetX,
    workArea.x + ZHINENG_DOCK_MARGIN,
    workArea.x + workArea.width - ZHINENG_DOCK_SIZE.width - ZHINENG_DOCK_MARGIN
  )
  const y = clamp(
    targetY,
    workArea.y + ZHINENG_DOCK_MARGIN,
    workArea.y + workArea.height - ZHINENG_DOCK_SIZE.height - ZHINENG_DOCK_MARGIN
  )

  return {
    attached: true,
    appType,
    targetTitle: getWindowTitle(windowInfo),
    reason: 'attached_to_wechat_window',
    updatedAt: new Date().toISOString(),
    position: { x, y, ...ZHINENG_DOCK_SIZE }
  }
}

async function refreshZhinengDockAttachment(): Promise<ZhinengDockAttachmentState> {
  const appType = coerceAppType(normalizeSettings(settingsStore.store).appType)
  let state: ZhinengDockAttachmentState
  try {
    const windowInfo = await getWechatWindowInfo(appType)
    state = windowInfo
      ? positionFromTargetBounds(appType, windowInfo)
      : fallbackDockState(appType, 'wechat_window_not_found')
  } catch (error: any) {
    state = fallbackDockState(appType, error?.message || 'dock_attachment_failed')
  }

  if (zhinengDockWindow && !zhinengDockWindow.isDestroyed()) {
    zhinengDockWindow.setBounds(state.position, false)
    zhinengDockWindow.webContents.send('zhineng:dock-state', state)
  }
  return state
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeFieldType(value: unknown, format?: unknown): ProviderConfigFieldType {
  if (value === 'password' || value === 'url' || value === 'select' || value === 'textarea') {
    return value
  }
  if (format === 'password') return 'password'
  if (format === 'uri' || format === 'url') return 'url'
  return 'text'
}

function normalizeOptions(value: unknown): Array<{ label: string; value: string }> | undefined {
  if (!Array.isArray(value)) return undefined
  const options = value
    .map((item) => {
      if (typeof item === 'string') return { label: item, value: item }
      if (!isRecord(item)) return null
      const label = typeof item.label === 'string' ? item.label : String(item.value || '')
      const optionValue = typeof item.value === 'string' ? item.value : ''
      return optionValue ? { label, value: optionValue } : null
    })
    .filter(Boolean) as Array<{ label: string; value: string }>
  return options.length ? options : undefined
}

function normalizeManifestConfigFields(configSchema: unknown): ProviderConfigField[] {
  if (!isRecord(configSchema)) return []

  const required = Array.isArray(configSchema.required)
    ? configSchema.required.filter((key): key is string => typeof key === 'string')
    : []

  if (Array.isArray(configSchema.fields)) {
    return configSchema.fields
      .map((field) => {
        if (!isRecord(field) || typeof field.key !== 'string') return null
        return {
          key: field.key,
          label: typeof field.label === 'string' ? field.label : field.key,
          type: normalizeFieldType(field.type),
          required: field.required === true || required.includes(field.key),
          readonly: field.readonly === true,
          placeholder: typeof field.placeholder === 'string' ? field.placeholder : undefined,
          hint: typeof field.hint === 'string' ? field.hint : undefined,
          defaultValue: typeof field.defaultValue === 'string' ? field.defaultValue : undefined,
          options: normalizeOptions(field.options)
        }
      })
      .filter(Boolean) as ProviderConfigField[]
  }

  if (!isRecord(configSchema.properties)) return []

  return Object.entries(configSchema.properties).map(([key, property]) => {
    const schema = isRecord(property) ? property : {}
    const title = typeof schema.title === 'string' ? schema.title : key
    return {
      key,
      label: title,
      type: normalizeFieldType(schema.type, schema.format),
      required: required.includes(key),
      readonly: schema.readonly === true || schema.readOnly === true,
      placeholder: typeof schema.placeholder === 'string' ? schema.placeholder : undefined,
      hint: typeof schema.description === 'string' ? schema.description : undefined,
      defaultValue: typeof schema.default === 'string' ? schema.default : undefined,
      options: normalizeOptions(schema.enum)
    }
  })
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  return response.json()
}

function getCachedProviderHub(): ProviderHubCache | null {
  const cached = settingsStore.get(PROVIDER_HUB_CACHE_KEY)
  if (!isRecord(cached) || !Array.isArray(cached.providers)) return null
  return cached as ProviderHubCache
}

async function fetchProviderHub(url = DEFAULT_PROVIDER_HUB_URL): Promise<ProviderHubCache> {
  const hub = await fetchJson(url)
  if (!isRecord(hub) || !Array.isArray(hub.providers)) {
    throw new Error('Provider hub JSON must contain a providers array')
  }

  const providers = await Promise.all(
    (hub.providers as ProviderHubEntry[])
      .filter((entry) => entry?.enabled !== false && typeof entry?.manifestUrl === 'string')
      .map(async (entry) => {
        const manifestUrl = entry.manifestUrl as string
        const manifest = (await fetchJson(manifestUrl)) as ProviderHubManifest
        const id =
          typeof manifest.id === 'string'
            ? manifest.id
            : typeof entry.id === 'string'
              ? entry.id
              : manifestUrl
        const name = typeof manifest.name === 'string' ? manifest.name : id
        const version = typeof manifest.version === 'string' ? manifest.version : '0.0.0'
        const capabilities = Array.isArray(manifest.capabilities)
          ? manifest.capabilities.filter((item): item is string => typeof item === 'string')
          : undefined
        const description =
          typeof manifest.description === 'string' ? manifest.description : undefined

        return {
          id,
          name,
          description,
          version,
          manifestUrl,
          capabilities,
          configSchema: {
            fields: normalizeManifestConfigFields(manifest.configSchema)
          }
        }
      })
  )

  const cache = {
    sourceUrl: url,
    fetchedAt: new Date().toISOString(),
    providers
  }
  settingsStore.set(PROVIDER_HUB_CACHE_KEY, cache)
  return cache
}

function findWorkspaceRootForEntityWork(): string | null {
  const candidates = [
    resolve(process.cwd(), '..'),
    resolve(process.cwd()),
    resolve(app.getAppPath(), '..'),
    resolve(app.getAppPath(), '..', '..'),
    resolve(__dirname, '..', '..', '..'),
    resolve(__dirname, '..', '..', '..', '..')
  ]
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue
    seen.add(candidate)
    if (existsSync(join(candidate, CROSS_BORDER_PROJECT_DIR, 'nodes', 'process-manifest.json'))) {
      return candidate
    }
  }
  return null
}

function readEntityWorkJson(path: string): any | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function runCrossBorderScript(
  workspaceRoot: string,
  script: string,
  args: string[] = []
): { success: boolean; stdout?: string; error?: string } {
  const scriptPath = join(workspaceRoot, CROSS_BORDER_PROJECT_DIR, 'scripts', script)
  if (!existsSync(scriptPath)) {
    return { success: false, error: `missing script: ${script}` }
  }
  try {
    const stdout = execFileSync('node', [scriptPath, ...args], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      timeout: 30_000
    })
    return { success: true, stdout }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

function ensureCrossBorderControlSurfaces(workspaceRoot: string): { success: boolean; error?: string } {
  const statusPath = join(workspaceRoot, CROSS_BORDER_PROJECT_DIR, 'runtime', 'control-plane', 'status', 'current-status.json')
  const status = readEntityWorkJson(statusPath)
  if (status?.stage_count === 16) return { success: true }
  const build = runCrossBorderScript(workspaceRoot, 'build-stage-control-surfaces.mjs')
  return build.success ? { success: true } : { success: false, error: build.error }
}

function readCrossBorderEntityWorkProjection(): Record<string, unknown> {
  const workspaceRoot = findWorkspaceRootForEntityWork()
  if (!workspaceRoot) {
    return {
      success: false,
      reason: 'workspace_root_not_found',
      error: 'cannot locate cross-border-ecommerce-ai-route from current app path'
    }
  }

  const ensured = ensureCrossBorderControlSurfaces(workspaceRoot)
  if (!ensured.success) {
    return {
      success: false,
      reason: 'control_surface_build_failed',
      error: ensured.error
    }
  }

  const projectRoot = join(workspaceRoot, CROSS_BORDER_PROJECT_DIR)
  const manifest = readEntityWorkJson(join(projectRoot, 'nodes', 'process-manifest.json'))
  const status = readEntityWorkJson(join(projectRoot, 'runtime', 'control-plane', 'status', 'current-status.json'))
  const stageRoot = join(projectRoot, 'runtime', 'control-plane', 'stages')
  const stageIds = existsSync(stageRoot)
    ? readdirSync(stageRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : []
  const surfaces = stageIds
    .map((stageId) => readEntityWorkJson(join(stageRoot, stageId, 'stage-control-surface.json')))
    .filter(Boolean)

  return {
    success: true,
    contract: 'entity_work_runtime_projection.v1',
    project_id: 'cross_border_ecommerce_ai_route',
    project_root: CROSS_BORDER_PROJECT_DIR,
    generated_at: new Date().toISOString(),
    manifest,
    status,
    surfaces,
    safety: {
      real_execution_allowed: false,
      renderer_direct_file_access: false,
      allowed_stage_actions: [...CROSS_BORDER_ALLOWED_STAGE_ACTIONS]
    }
  }
}

function runCrossBorderStageFromMain(request?: Record<string, unknown>): Record<string, unknown> {
  const workspaceRoot = findWorkspaceRootForEntityWork()
  const stage = typeof request?.stage === 'string' ? request.stage : ''
  const action = typeof request?.action === 'string' ? request.action : ''
  if (!workspaceRoot) {
    return { success: false, reason: 'workspace_root_not_found' }
  }
  if (!/^cbx_\d{2}_[a-z0-9_]+$/.test(stage)) {
    return { success: false, reason: 'invalid_stage', stage }
  }
  if (!CROSS_BORDER_ALLOWED_STAGE_ACTIONS.has(action)) {
    return { success: false, reason: 'unsupported_action', action }
  }
  const result = runCrossBorderScript(workspaceRoot, 'run-cross-border-stage.mjs', [
    `--stage=${stage}`,
    `--action=${action}`
  ])
  const projection = readCrossBorderEntityWorkProjection()
  return {
    success: result.success,
    contract: 'entity_work_stage_run_result.v1',
    stage,
    action,
    stdout: result.stdout,
    error: result.error,
    projection
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  app.setName(APP_DISPLAY_TITLE)
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.zhineng.social-assistant')

  // 检查和请求 macOS 需要的权限
  await checkAndRequestPermissions()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  installStatusDialogueMediaPermissionHandlers()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // ── Settings 持久化 ──
  ipcMain.handle('settings:getAll', async () => {
    return normalizeSettings(settingsStore.store)
  })

  ipcMain.handle('settings:get', async (_event, key: string) => {
    const settings = normalizeSettings(settingsStore.store)
    return (settings as Record<string, any>)[key]
  })

  ipcMain.handle('settings:set', async (_event, data: Record<string, any>) => {
    const current = normalizeSettings(settingsStore.store)
    const next = {
      ...current,
      ...data,
      vision: {
        ...current.vision,
        ...(data.vision || {})
      },
      chatProvider: {
        ...current.chatProvider,
        ...(data.chatProvider || {}),
        config: {
          ...current.chatProvider.config,
          ...(data.chatProvider?.config || {})
        }
      },
      capture: {
        ...current.capture,
        ...(data.capture || {})
      },
      expertMatrix: normalizeExpertMatrixSettings({
        ...current.expertMatrix,
        ...(data.expertMatrix || {}),
        guidanceControlBoundary: {
          ...current.expertMatrix.guidanceControlBoundary,
          ...(data.expertMatrix?.guidanceControlBoundary || data.expertMatrix?.guidance_control_boundary || {})
        },
        experts: {
          ...current.expertMatrix.experts,
          ...(data.expertMatrix?.experts || {})
        }
      }),
      expertProviderRegistry: normalizeExpertProviderRegistrySettings({
        ...current.expertProviderRegistry,
        ...(data.expertProviderRegistry || {})
      })
    } satisfies AppSettings

    settingsStore.set(next as any)
    return { success: true }
  })

  ipcMain.handle('expertProvider:test', async (_event, request?: Record<string, any>) => {
    const startedAt = Date.now()
    try {
      const settings = normalizeSettings(settingsStore.store)
      const registry = normalizeExpertProviderRegistrySettings(settings.expertProviderRegistry)
      const requestProvider = request?.provider
      const providerRef =
        typeof request?.providerRef === 'string' && request.providerRef
          ? request.providerRef
          : registry.defaultProviderRef
      const storedProvider = registry.providers.find((provider) => provider.id === providerRef)
      const provider = normalizeExpertProviderRegistrySettings({
        defaultProviderRef: providerRef,
        providers: [requestProvider || storedProvider || registry.providers[0]]
      }).providers[0]

      if (!provider.enabled) {
        return {
          success: false,
          reason: 'provider_disabled',
          error: `expert provider ${provider.id} is disabled`
        }
      }

      const apiKey =
        provider.apiKey
        || (typeof settings.chatProvider.config?.apiKey === 'string' ? settings.chatProvider.config.apiKey : '')
        || settings.vision.apiKey
      if (!apiKey) {
        return {
          success: false,
          reason: 'api_key_missing',
          error: '请先在专家 Provider Registry 或基础配置中填写 API Key'
        }
      }

      const client = new AIClient({
        apiKey,
        model: provider.model || DEFAULT_EXPERT_PROVIDER_MODEL,
        baseURL: (provider.baseURL || DEFAULT_EXPERT_PROVIDER_BASE_URL).replace(/\/+$/, ''),
        systemPrompt: 'You are a connection test assistant. Reply with a short OK.'
      })
      const text = await client.callChat([
        { role: 'system', content: 'You are a connection test assistant. Reply with a short OK.' },
        { role: 'user', content: 'Return OK for expert provider registry test.' }
      ])

      return {
        success: true,
        providerRef: provider.id,
        model: provider.model || DEFAULT_EXPERT_PROVIDER_MODEL,
        baseURL: (provider.baseURL || DEFAULT_EXPERT_PROVIDER_BASE_URL).replace(/\/+$/, ''),
        text: text.slice(0, 120),
        latencyMs: Date.now() - startedAt
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        reason: 'model_call_failed',
        error: message,
        latencyMs: Date.now() - startedAt
      }
    }
  })

  ipcMain.handle('provider:installFromUrl', async (_event, manifestUrl: string) => {
    try {
      const result = await installProviderFromUrl(manifestUrl)
      const current = normalizeSettings(settingsStore.store)
      settingsStore.set({
        ...current,
        chatProvider: {
          ...current.chatProvider,
          manifestUrl,
          installed: result.installed,
          config: withSchemaDefaults(result.manifest.configSchema, current.chatProvider.config)
        }
      } as any)

      return {
        success: true,
        installed: result.installed,
        manifest: result.manifest
      }
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) }
    }
  })

  ipcMain.handle('provider:getInstalled', async () => {
    const settings = normalizeSettings(settingsStore.store)

    // 用户安装过自定义 provider：原样返回
    if (settings.chatProvider.installed) {
      const manifest = await getInstalledProviderManifest(settings.chatProvider.installed)
      return {
        installed: settings.chatProvider.installed,
        manifest,
        isBuiltinDefault: false
      }
    }

    // 没装过 → 回退到内置 doubao（apiKey 字段已剥离，使用视觉密钥）
    const installed = await getBuiltinDoubaoInstalledInfo()
    const manifest = await getBuiltinDoubaoManifestForUi()
    return {
      installed,
      manifest,
      isBuiltinDefault: true
    }
  })

  ipcMain.handle('providerHub:getCatalog', async () => {
    const cached = getCachedProviderHub()
    if (cached) return { success: true, catalog: cached }

    try {
      const catalog = await fetchProviderHub()
      return { success: true, catalog }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message, catalog: null }
    }
  })

  ipcMain.handle('providerHub:update', async () => {
    try {
      const catalog = await fetchProviderHub()
      return { success: true, catalog }
    } catch (error: unknown) {
      const cached = getCachedProviderHub()
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message, catalog: cached }
    }
  })

  ipcMain.handle('settings:open', async () => {
    createSettingsWindow()
    return { success: true }
  })

  ipcMain.handle('zhineng:openConsole', async () => {
    createZhinengConsoleWindow()
    return { success: true }
  })

  ipcMain.handle('zhineng:openDock', async () => {
    createZhinengDockWindow()
    return { success: true }
  })

  ipcMain.handle('zhineng:dock:openConsole', async () => {
    createZhinengConsoleWindow()
    return { success: true }
  })

  ipcMain.handle('zhineng:dock:openGraph', async (_event, state?: Record<string, unknown>) => {
    try {
      createZhinengGraphWindow(state ?? {})
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[ZhinengDock] openGraph failed', message)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('zhineng:graph:close', async () => {
    if (zhinengGraphWindow && !zhinengGraphWindow.isDestroyed()) {
      zhinengGraphWindow.close()
    }
    return { success: true }
  })

  ipcMain.handle('zhineng:entity-work:projection:get', async () => {
    return readCrossBorderEntityWorkProjection()
  })

  ipcMain.handle('zhineng:entity-work:stage:run', async (_event, request?: Record<string, unknown>) => {
    return runCrossBorderStageFromMain(request)
  })

  ipcMain.handle('zhineng:dock:refresh', async () => {
    return await refreshZhinengDockAttachment()
  })

  ipcMain.handle('zhineng:decision-state:get', async () => {
    const result = readLatestZhinengDecisionState()
    scheduleZhinengDecisionStateBroadcast('manual_refresh')
    return result
  })

  // ── Runtime / Session IPC（沿用 legacy engine:* 通道名） ──
  ipcMain.handle('zhineng:status-dialogue:snapshot:get', async (_event, request?: Record<string, unknown>) => {
    return readStatusDialogueSnapshot(request)
  })

  ipcMain.handle('zhineng:status-dialogue:events:get', async (_event, request?: Record<string, unknown>) => {
    return readStatusDialogueEvents(request)
  })

  ipcMain.handle('zhineng:status-dialogue:patrol-index:get', async (_event, request?: Record<string, unknown>) => {
    return readStatusPatrolDialogueIndex(request)
  })

  ipcMain.handle('zhineng:status-dialogue:runtime-voice-diagnostic:get', async () => {
    return readLatestStatusDialogueRuntimeVoiceDiagnostic()
  })

  ipcMain.handle('zhineng:status-dialogue:real-env:check', async (_event, request?: Record<string, unknown>) => {
    return buildStatusDialogueRealEnvCheck(request)
  })

  ipcMain.handle('zhineng:status-dialogue:model:test', async () => {
    return await runStatusDialogueModelTest()
  })

  ipcMain.handle('zhineng:status-dialogue:voice-log', async (_event, request?: Record<string, unknown>) => {
    const event = typeof request?.event === 'string' ? request.event.slice(0, 80) : 'renderer_voice_event'
    const payload = request?.payload && typeof request.payload === 'object' ? (request.payload as Record<string, unknown>) : {}
    writeStatusDialogueRuntimeLog(event, payload)
    return { success: true }
  })

  ipcMain.handle('zhineng:status-dialogue:tts:health', async () => {
    return await runStatusDialogueTtsHealth()
  })

  ipcMain.handle('zhineng:status-dialogue:tts:synthesize', async (_event, request?: StatusDialogueTtsSynthesisRequest) => {
    return await synthesizeStatusDialogueTts(request)
  })

  ipcMain.handle('zhineng:status-dialogue:tts:synthesize:stream', async (event, request?: StatusDialogueTtsSynthesisRequest & {
    sessionId?: string
    session_id?: string
    adapter_id?: StatusDialogueTtsAdapterConfig['adapter_id']
    adapterId?: StatusDialogueTtsAdapterConfig['adapter_id']
    response_format?: StatusDialogueTtsAdapterConfig['response_format']
    responseFormat?: StatusDialogueTtsAdapterConfig['response_format']
    voice?: string
    locale?: string
    skip_cache?: boolean
    skipCache?: boolean
  }) => {
    return await streamStatusDialogueTts(event.sender, request)
  })

  ipcMain.handle('zhineng:status-dialogue:stt:health', async (_event, request?: StatusDialogueLocalSttHealthRequest) => {
    return await runStatusDialogueLocalSttHealth(request)
  })

  ipcMain.handle('zhineng:status-dialogue:stt:remote-health', async () => {
    return await runStatusDialogueRemoteSttHealth()
  })

  ipcMain.handle('zhineng:status-dialogue:stt:remote-configured-probe', async (_event, request?: Record<string, unknown>) => {
    return await runStatusDialogueRemoteSttConfiguredProbe(request)
  })

  ipcMain.handle('zhineng:status-dialogue:stt:transcribe', async (_event, request?: StatusDialogueSttTranscriptionRequest) => {
    return await transcribeStatusDialogueStt(request)
  })

  ipcMain.handle('zhineng:status-dialogue:chrome-stt:transcribe', async (event, request?: StatusDialogueChromeSttRequest) => {
    return await transcribeStatusDialogueChromeStt(request, event.sender)
  })

  ipcMain.handle('zhineng:status-dialogue:chrome-stt:cancel', async (_event, request?: StatusDialogueChromeSttRequest) => {
    return cancelStatusDialogueChromeStt(request)
  })

  ipcMain.handle('zhineng:status-dialogue:complete', async (_event, request?: Record<string, unknown>) => {
    const startedAt = Date.now()
    try {
      const settings = normalizeSettings(settingsStore.store)
      const providerConfig = settings.chatProvider.config || {}
      const apiKey =
        typeof providerConfig.apiKey === 'string' && providerConfig.apiKey
          ? providerConfig.apiKey
          : settings.vision.apiKey
      if (!apiKey) {
        return {
          success: false,
          reason: 'api_key_missing',
          error: 'status dialogue model api key is not configured'
        }
      }

      const model =
        typeof providerConfig.model === 'string' && providerConfig.model
          ? providerConfig.model
          : FIXED_ARK_MODEL
      const baseURL =
        typeof providerConfig.baseURL === 'string' && providerConfig.baseURL
          ? providerConfig.baseURL
          : typeof providerConfig.baseUrl === 'string' && providerConfig.baseUrl
            ? providerConfig.baseUrl
            : FIXED_ARK_BASE_URL
      const systemPrompt =
        typeof request?.systemPrompt === 'string' && request.systemPrompt
          ? request.systemPrompt
          : 'Reply as a concise first-person subject status assistant.'
      const userPrompt =
        typeof request?.userPrompt === 'string' && request.userPrompt
          ? request.userPrompt
          : 'Summarize current status.'

      const client = new AIClient({
        apiKey,
        model,
        baseURL,
        systemPrompt
      })
      const text = await client.callChat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ])

      return {
        success: true,
        text,
        model,
        baseURL,
        adapterId: STATUS_DIALOGUE_REMOTE_ADAPTER_ID,
        providerLabel: settings.chatProvider.installed?.id || 'openai-compatible',
        latencyMs: Date.now() - startedAt
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        reason: 'model_call_failed',
        error: message,
        latencyMs: Date.now() - startedAt
      }
    }
  })

  ipcMain.handle('zhineng:status-dialogue:complete:stream', async (event, request?: Record<string, unknown>) => {
    const startedAt = Date.now()
    const sessionId =
      typeof request?.sessionId === 'string' && request.sessionId
        ? request.sessionId
        : `status-dialogue-stream-${startedAt}-${Math.random().toString(36).slice(2, 8)}`
    const channel = 'zhineng:status-dialogue:complete:stream:event'
    const emit = (payload: Record<string, unknown>): void => {
      if (event.sender.isDestroyed()) return
      event.sender.send(channel, {
        schema: 'status_dialogue_model_stream_event.v1',
        sessionId,
        session_id: sessionId,
        generated_at: new Date().toISOString(),
        ...payload
      })
    }

    try {
      const settings = normalizeSettings(settingsStore.store)
      const providerConfig = settings.chatProvider.config || {}
      const apiKey =
        typeof providerConfig.apiKey === 'string' && providerConfig.apiKey
          ? providerConfig.apiKey
          : settings.vision.apiKey
      if (!apiKey) {
        const reason = 'status dialogue model api key is not configured'
        emit({ type: 'error', reason: 'api_key_missing', error: reason, latencyMs: Date.now() - startedAt })
        return {
          success: false,
          reason: 'api_key_missing',
          error: reason,
          sessionId,
          latencyMs: Date.now() - startedAt
        }
      }

      const model =
        typeof providerConfig.model === 'string' && providerConfig.model
          ? providerConfig.model
          : FIXED_ARK_MODEL
      const baseURL =
        typeof providerConfig.baseURL === 'string' && providerConfig.baseURL
          ? providerConfig.baseURL
          : typeof providerConfig.baseUrl === 'string' && providerConfig.baseUrl
            ? providerConfig.baseUrl
            : FIXED_ARK_BASE_URL
      const systemPrompt =
        typeof request?.systemPrompt === 'string' && request.systemPrompt
          ? request.systemPrompt
          : 'Reply as a concise first-person subject status assistant.'
      const userPrompt =
        typeof request?.userPrompt === 'string' && request.userPrompt
          ? request.userPrompt
          : 'Summarize current status.'

      const client = new AIClient({
        apiKey,
        model,
        baseURL,
        systemPrompt
      })
      let text = ''
      let deltaCount = 0
      emit({
        type: 'start',
        model,
        baseURL,
        adapterId: STATUS_DIALOGUE_REMOTE_ADAPTER_ID,
        providerLabel: settings.chatProvider.installed?.id || 'openai-compatible'
      })

      for await (const delta of client.callChatStream([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ])) {
        text += delta
        deltaCount += 1
        emit({
          type: 'delta',
          delta,
          deltaCount,
          accumulatedLength: text.length
        })
      }

      const latencyMs = Date.now() - startedAt
      const result = {
        success: true,
        text,
        model,
        baseURL,
        adapterId: STATUS_DIALOGUE_REMOTE_ADAPTER_ID,
        providerLabel: settings.chatProvider.installed?.id || 'openai-compatible',
        sessionId,
        streamed: true,
        deltaCount,
        latencyMs
      }
      emit({ type: 'done', text, deltaCount, latencyMs })
      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      const latencyMs = Date.now() - startedAt
      emit({ type: 'error', reason: 'model_stream_failed', error: message, latencyMs })
      return {
        success: false,
        reason: 'model_stream_failed',
        error: message,
        sessionId,
        latencyMs
      }
    }
  })

  ipcMain.handle('engine:start', async (_event, config) => {
    const result = await startEngineCore(config)
    if (result.ok) return { success: true }
    return { success: false, error: result.message || result.reason }
  })

  ipcMain.handle('engine:stop', async (_event, reason?: string) => {
    const result = await stopEngineCore(reason || 'ipc_stop')
    if (result.ok) return { success: true }
    return { success: false, error: result.message || result.reason }
  })

  ipcMain.handle('engine:status', async () => {
    return { running: runtime?.isRunning() ?? false }
  })

  ipcMain.handle('engine:updateConfig', async (_event, config) => {
    const settings = normalizeSettings(config || settingsStore.store)
    if (runtimeDevice) {
      // setApiKey 在 BoxSelectDevice 上是 no-op，对 RPADevice 才生效。
      runtimeDevice.setApiKey(settings.vision.apiKey)
      runtimeDevice.setAppType(settings.appType)
    }
    if (runtime) {
      runtime.updateAppType(settings.appType)
    }
    return { success: true }
  })

  ipcMain.handle('engine:testConnection', async (_event, config) => {
    const apiKey = config?.apiKey || normalizeSettings(settingsStore.store).vision.apiKey
    const client = new AIClient({
      apiKey,
      model: FIXED_ARK_MODEL,
      baseURL: FIXED_ARK_BASE_URL
    })
    return client.testConnection()
  })

  // ── Capture / 框选向导 IPC ──

  ipcMain.handle(
    'capture:openSetupWizard',
    async (_event, args: { appType: AppType; steps?: WizardStepKey[] }) => {
      const settings = normalizeSettings(settingsStore.store)
      const appType = coerceAppType(args?.appType)
      const prefill = settings.capture[appType]?.regions ?? null

      const result = await runBoxSelectWizard({ appType, steps: args?.steps, prefill })
      if (!result.ok || !result.regions) {
        return { success: false, reason: result.reason || 'cancelled' }
      }

      // 持久化区域到 settings.capture[appType]，但保留已有 strategy（默认 'auto'）
      const current = normalizeSettings(settingsStore.store)
      const next: AppSettings = {
        ...current,
        capture: {
          ...current.capture,
          [appType]: {
            strategy: current.capture[appType]?.strategy ?? 'auto',
            regions: result.regions
          }
        }
      }
      settingsStore.set(next as any)
      notifyCaptureRegionsUpdated(appType, result.regions)
      return { success: true, regions: result.regions }
    }
  )

  ipcMain.handle('capture:getRegions', async (_event, appType: AppType) => {
    const settings = normalizeSettings(settingsStore.store)
    return settings.capture[coerceAppType(appType)]?.regions ?? null
  })

  ipcMain.handle('capture:resetRegions', async (_event, appType: AppType) => {
    const current = normalizeSettings(settingsStore.store)
    const key = coerceAppType(appType)
    const next: AppSettings = {
      ...current,
      capture: {
        ...current.capture,
        [key]: { strategy: current.capture[key]?.strategy ?? 'auto', regions: null }
      }
    }
    settingsStore.set(next as any)
    notifyCaptureRegionsUpdated(key, null)
    return { success: true }
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('capture-screen', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      })
      if (sources && sources.length > 0) {
        return sources[0].thumbnail.toDataURL()
      }
      return null
    } catch (error) {
      console.error('Screen capture failed:', error)
      return null
    }
  })

  // ── 测试入口：VLM 并行 vs 串行 ──
  ipcMain.handle('test:vlm-parallel', async () => {
    const apiKey = normalizeSettings(settingsStore.store).vision.apiKey
    if (!apiKey) return { error: '请先在设置中填写视觉接口密钥' }
    const { runVlmParallelTest } = await import('../core/rpa/tests/test-vlm-parallel')
    return await runVlmParallelTest(apiKey, 'wechat')
  })

  // ── Skill HTTP Server（OpenClaw 远程启动 / 暂停接入点） ──
  startSkillServer(skillEngineController)
  startZhinengDecisionStateWatch()

  createWindow()
  if (process.env.SIGHTFLOW_OPEN_ZHINENG_CONSOLE === '1') {
    createZhinengConsoleWindow()
  }
  createZhinengTray()
  createZhinengDockWindow()
  if (process.env.ZHINENG_STATUS_DIALOGUE_OPEN_GRAPH_ON_START === '1') {
    createZhinengGraphWindow({
      runtime_marker_retest: true,
      opened_by: 'ZHINENG_STATUS_DIALOGUE_OPEN_GRAPH_ON_START',
      status_dialogue_runtime_probe: process.env.ZHINENG_STATUS_DIALOGUE_RUNTIME_PROBE || undefined,
      status_dialogue_cloud_stt_test_audio: process.env.ZHINENG_CHROME_STT_TEST_AUDIO || undefined,
      status_dialogue_cloud_stt_language: process.env.ZHINENG_CHROME_STT_TEST_LANGUAGE || undefined,
      status_dialogue_cloud_stt_max_attempts: process.env.ZHINENG_CHROME_STT_MAX_ATTEMPTS || undefined,
      status_dialogue_cloud_stt_timeout_ms: process.env.ZHINENG_CHROME_STT_TIMEOUT_MS || undefined,
      status_dialogue_remote_stt_test_audio: process.env.ZHINENG_STATUS_DIALOGUE_REMOTE_STT_TEST_AUDIO || undefined
    })
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && (!zhinengTray || zhinengQuitRequested)) {
    app.quit()
  }
})

app.on('before-quit', () => {
  zhinengQuitRequested = true
  zhinengTray?.destroy()
  zhinengTray = null
  cleanupChromeSttBridgeProcesses()
  stopLocalWhisperService()
  stopZhinengDockTracking()
  stopZhinengDecisionStateWatch()
  stopSkillServer()
})

// ── 引擎启动 / 暂停核心逻辑（IPC 与 Skill HTTP Server 共用） ──

async function startEngineCore(rawConfig?: any): Promise<SkillStartResult> {
  if (runtime?.isRunning()) {
    return { ok: false, reason: 'already_running', message: '引擎已在运行中' }
  }

  try {
    const settings = normalizeSettings(rawConfig || settingsStore.store)
    const appType: AppType = settings.appType || 'wechat'
    const isBridgeMode = settings.runtimeMode === 'zhineng_bridge'
    const startupStrategy = resolveSettingsStrategy(appType, settings)
    const providerNeedsVisionKey =
      !settings.chatProvider.installed ||
      settings.chatProvider.installed.id === BUILTIN_DOUBAO_PROVIDER_ID
    const needsVisionKey = startupStrategy === 'vlm' || (!isBridgeMode && providerNeedsVisionKey)

    if (needsVisionKey && !settings.vision.apiKey) {
      return { ok: false, reason: 'no_vision_key', message: '请先填写视觉接口密钥' }
    }

    let provider: any = {
      async *run() {
        yield { type: 'skip' as const }
      }
    }
    if (!isBridgeMode) {
      // 没有自定义 provider → 走内置 doubao，使用视觉密钥
      if (!settings.chatProvider.installed) {
        const loaded = await loadBuiltinDoubaoProvider({
          ...settings.chatProvider.config,
          apiKey: settings.vision.apiKey
        })
        provider = loaded.provider
      } else {
        const installedManifest = await getInstalledProviderManifest(settings.chatProvider.installed)
        // doubao（无论是用户主动装的还是内置的）apiKey 由视觉密钥共享提供，不强校验
        const isDoubao = settings.chatProvider.installed.id === BUILTIN_DOUBAO_PROVIDER_ID
        const required = (installedManifest?.configSchema?.required || []).filter(
          (key) => !(isDoubao && key === 'apiKey')
        )
        const missing = required.find((key) => {
          const value = settings.chatProvider.config?.[key]
          return value === undefined || value === null || value === ''
        })
        if (missing) {
          return {
            ok: false,
            reason: 'missing_required_field',
            message: `缺少必填配置: ${missing}`
          }
        }

        const effectiveConfig = isDoubao
          ? { ...settings.chatProvider.config, apiKey: settings.vision.apiKey }
          : settings.chatProvider.config

        const loaded = await loadInstalledProvider(settings.chatProvider.installed, effectiveConfig)
        provider = loaded.provider
      }
    }

    const mainWindow = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null
    const log = (type: 'thinking' | 'reply' | 'skip' | 'error', content: string): void => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('engine:log', { type, content })
      }
    }

    let device: DesktopDevice
    let strategy: CaptureStrategy
    try {
      const built = await buildDevice(appType, settings, settings.vision.apiKey, log)
      device = built.device
      strategy = built.strategy
    } catch (err: any) {
      const message = err?.message || String(err)
      if (message === 'user_cancelled_box_select_wizard') {
        return { ok: false, reason: 'wizard_cancelled', message: '已取消框选，引擎未启动' }
      }
      throw err
    }
    log('thinking', `已选用抓取策略：${strategy}`)
    log('thinking', `运行模式：${settings.runtimeMode}`)
    runtimeDevice = device

    const channel = isBridgeMode
      ? new ZhinengBridgeSession(
          device,
          new ZhinengBridgeClient(submitZhinengBridgeObservationToLogicSystem)
        )
      : new GenericChannelSession(device)
    runtime = new RuntimeHost({
      appType,
      channel,
      provider,
      initialState: isBridgeMode
        ? createInitialZhinengBridgeState()
        : createInitialGenericChannelState(),
      onLog: log
    })

    runtime.startSession().catch((err: any) => {
      console.error('[Main] Runtime session error:', err)
    })

    notifyEngineStateChanged('running')

    return { ok: true }
  } catch (error: any) {
    return {
      ok: false,
      reason: 'engine_failed',
      message: error?.message || String(error)
    }
  }
}

async function stopEngineCore(stopReason: string): Promise<SkillPauseResult> {
  if (!runtime?.isRunning()) {
    return { ok: false, reason: 'not_running', message: '引擎未运行' }
  }
  try {
    await runtime.stopSession(stopReason)
    notifyEngineStateChanged('idle')
    return { ok: true }
  } catch (error: any) {
    return {
      ok: false,
      reason: 'pause_failed',
      message: error?.message || String(error)
    }
  }
}

/** 通知 Renderer 引擎状态变化（让 UI 在远程启停时同步切换） */
function notifyEngineStateChanged(status: 'running' | 'idle'): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('engine:state', { status })
    }
  }
}

/** 通知 Renderer：某个 appType 的框选区域被向导/重置更新了，UI 上的 chip 立即重渲染。 */
function notifyCaptureRegionsUpdated(appType: AppType, regions: BoxRegions | null): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('capture:regions-updated', { appType, regions })
    }
  }
}

/**
 * 选取实际生效的 capture strategy。
 * 用户在 settings 里给 appType 显式设置过策略，就用它；否则用全局默认；
 * 全局默认是 'auto' 时，wechat/wework 优先 VLM，其它直接 box-select。
 */
function resolveEffectiveStrategy(
  appType: AppType,
  perAppStrategy: CaptureStrategy,
  defaultStrategy: CaptureStrategy
): CaptureStrategy {
  const effective = perAppStrategy === 'auto' ? defaultStrategy : perAppStrategy
  if (effective === 'auto') {
    return isWechatLike(appType) ? 'vlm' : 'box-select'
  }
  return effective
}

function resolveSettingsStrategy(appType: AppType, settings: AppSettings): CaptureStrategy {
  const perApp = settings.capture[appType] ?? { strategy: 'auto' as CaptureStrategy, regions: null }
  const effective = resolveEffectiveStrategy(appType, perApp.strategy, settings.defaultCaptureStrategy)
  if (settings.runtimeMode === 'zhineng_bridge' && effective === 'vlm' && !settings.vision.apiKey) {
    return 'box-select'
  }
  return effective
}

/**
 * 把 capture 配置 + strategy 解析成具体设备实例。
 * VLM 和 box-select 只决定"如何测量 LayoutCache"，后续运行统一消费 LayoutCache。
 * 本轮不做 VLM 失败自动 fallback；VLM 测量失败由 session bootstrap 报错停止。
 */
async function buildDevice(
  appType: AppType,
  settings: AppSettings,
  apiKey: string,
  log: (type: 'thinking' | 'reply' | 'skip' | 'error', content: string) => void
): Promise<{ device: DesktopDevice; strategy: CaptureStrategy }> {
  const perApp = settings.capture[appType] ?? { strategy: 'auto' as CaptureStrategy, regions: null }
  const effective = resolveSettingsStrategy(appType, settings)

  if (effective === 'vlm') {
    const rpa = new RPADevice()
    rpa.setAppType(appType)
    rpa.setApiKey(apiKey)
    return { device: rpa, strategy: 'vlm' }
  }

  // box-select 路线：缺区域则拉向导
  let regions = perApp.regions
  if (!regions) {
    log('thinking', `首次配置 ${appType}：请框选 3 个关键区域`)
    const wizardResult = await runBoxSelectWizard({ appType, prefill: null })
    if (!wizardResult.ok || !wizardResult.regions) {
      throw new Error('user_cancelled_box_select_wizard')
    }
    regions = wizardResult.regions
    persistRegionsAndStickyStrategy(appType, regions, perApp.strategy)
  }
  return { device: new BoxSelectDevice(regions), strategy: 'box-select' }
}

/** 把向导产出的 regions 写回 settings，并保留当前策略配置。 */
function persistRegionsAndStickyStrategy(
  appType: AppType,
  regions: BoxRegions,
  strategy: CaptureStrategy
): void {
  const current = normalizeSettings(settingsStore.store)
  const next: AppSettings = {
    ...current,
    capture: {
      ...current.capture,
      [appType]: { strategy, regions }
    }
  }
  settingsStore.set(next as any)
  notifyCaptureRegionsUpdated(appType, regions)
}

const skillEngineController: SkillEngineController = {
  start: () => startEngineCore(),
  pause: () => stopEngineCore('skill_pause'),
  isRunning: () => runtime?.isRunning() ?? false
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

const VALID_APP_TYPES: AppType[] = [
  'wechat',
  'wework',
  'dingtalk',
  'lark',
  'slack',
  'telegram',
  'generic'
]
const VALID_CAPTURE_STRATEGIES: CaptureStrategy[] = ['auto', 'vlm', 'box-select']

function coerceAppType(raw: unknown): AppType {
  return typeof raw === 'string' && (VALID_APP_TYPES as string[]).includes(raw)
    ? (raw as AppType)
    : 'wechat'
}

function coerceStrategy(raw: unknown, fallback: CaptureStrategy = 'auto'): CaptureStrategy {
  return typeof raw === 'string' && (VALID_CAPTURE_STRATEGIES as string[]).includes(raw)
    ? (raw as CaptureStrategy)
    : fallback
}

function coerceRect(raw: unknown): BoxRegions['contactList'] | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const x = Number(r.x),
    y = Number(r.y),
    w = Number(r.width),
    h = Number(r.height)
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null
  return { x, y, width: w, height: h }
}

function coerceRegions(raw: unknown): BoxRegions | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const contactList = coerceRect(r.contactList)
  const chatMain = coerceRect(r.chatMain)
  const inputBox = coerceRect(r.inputBox)
  if (!contactList || !chatMain || !inputBox) return null
  return {
    contactList,
    chatMain,
    inputBox,
    unreadIndicator: coerceRect(r.unreadIndicator),
    displayId: typeof r.displayId === 'number' ? r.displayId : undefined,
    scaleFactor: typeof r.scaleFactor === 'number' ? r.scaleFactor : undefined,
    capturedAt: typeof r.capturedAt === 'number' ? r.capturedAt : Date.now()
  }
}

function normalizeCapture(raw: unknown): Partial<Record<AppType, PerAppCapture>> {
  const out: Partial<Record<AppType, PerAppCapture>> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const key of VALID_APP_TYPES) {
    const value = (raw as Record<string, unknown>)[key]
    if (!value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    out[key] = {
      strategy: coerceStrategy(v.strategy),
      regions: coerceRegions(v.regions)
    }
  }
  return out
}

function normalizeSettings(raw: any): AppSettings {
  const oldApiKey = typeof raw?.apiKey === 'string' ? raw.apiKey : ''
  const oldModel = typeof raw?.model === 'string' && raw.model ? raw.model : FIXED_ARK_MODEL
  const oldSystemPrompt = typeof raw?.systemPrompt === 'string' ? raw.systemPrompt : ''
  const rawProviderConfig =
    raw?.chatProvider?.config && typeof raw.chatProvider.config === 'object'
      ? { ...raw.chatProvider.config }
      : {}

  // Keep arbitrary provider config keys, and only backfill legacy volcengine fields for old persisted settings.
  if (rawProviderConfig.apiKey === undefined && oldApiKey) {
    rawProviderConfig.apiKey = oldApiKey
  }
  if (rawProviderConfig.model === undefined && oldModel) {
    rawProviderConfig.model = oldModel
  }
  if (rawProviderConfig.systemPrompt === undefined && oldSystemPrompt) {
    rawProviderConfig.systemPrompt = oldSystemPrompt
  }

  return {
    locale: raw?.locale === 'en' ? 'en' : 'zh',
    appType: coerceAppType(raw?.appType),
    runtimeMode:
      process.env.SIGHTFLOW_FORCE_ZHINENG_BRIDGE === '1'
        ? 'zhineng_bridge'
        : raw?.runtimeMode === 'auto_reply'
          ? 'auto_reply'
          : 'zhineng_bridge',
    vision: {
      apiKey: raw?.vision?.apiKey || oldApiKey || ''
    },
    chatProvider: {
      manifestUrl: raw?.chatProvider?.manifestUrl || raw?.providerManifestUrl || '',
      installed: raw?.chatProvider?.installed || null,
      config: rawProviderConfig
    },
    defaultCaptureStrategy: coerceStrategy(raw?.defaultCaptureStrategy, 'auto'),
    capture: normalizeCapture(raw?.capture),
    expertMatrix: normalizeExpertMatrixSettings(raw?.expertMatrix),
    expertProviderRegistry: normalizeExpertProviderRegistrySettings(raw?.expertProviderRegistry)
  }
}

function withSchemaDefaults(
  schema: { properties: Record<string, { default?: unknown }> },
  current: Record<string, any>
): Record<string, any> {
  const next = { ...current }
  for (const [key, field] of Object.entries(schema.properties || {})) {
    if (next[key] === undefined && field.default !== undefined) {
      next[key] = field.default
    }
  }
  return next
}
