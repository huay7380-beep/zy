import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { t } from './i18n'
import { ZhinengConsole, ZhinengDockIcon, ZhinengGraphWindow } from './zhineng-console/ZhinengConsole'
import './index.css'

interface LogEntry {
  time: string
  type: 'thinking' | 'reply' | 'skip' | 'error'
  content: string
}

type EngineStatus = 'idle' | 'running' | 'error'
type SettingsSection = 'base' | 'agent' | 'expertMatrix'
type AppType = 'wechat' | 'wework' | 'dingtalk' | 'lark' | 'slack' | 'telegram' | 'generic'

type CaptureStrategy = 'auto' | 'vlm' | 'box-select'
type ExpertResearchBoundaryMode =
  | 'analysis_only'
  | 'experimental_guidance'
  | 'control_variable_research'
type ExpertApiMode = 'deterministic' | 'shared_provider' | 'dedicated_provider'
type ExpertRuntimeRole = 'specialist' | 'coordinator'
type ExpertProviderKind = 'openai_compatible'

const DEFAULT_EXPERT_PROVIDER_ID = 'deepseek-v4-flash-daily'
const DEFAULT_EXPERT_PROVIDER_LABEL = 'DeepSeek V4 Flash 日常专家模型'
const DEFAULT_EXPERT_PROVIDER_MODEL = 'deepseek-v4-flash'
const DEFAULT_EXPERT_PROVIDER_BASE_URL = 'https://api.deepseek.com'

interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

interface BoxRegions {
  contactList: ScreenRect
  chatMain: ScreenRect
  inputBox: ScreenRect
  unreadIndicator: ScreenRect | null
  displayId?: number
  scaleFactor?: number
  capturedAt: number
}

const APP_TYPE_LABELS: Record<AppType, string> = {
  wechat: '微信',
  wework: '企业微信',
  dingtalk: '钉钉',
  lark: '飞书 / Lark',
  slack: 'Slack',
  telegram: 'Telegram',
  generic: '其他桌面应用'
}

const VLM_SUPPORTED_APPS: AppType[] = ['wechat', 'wework']
const DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE =
  '请从桌面应用窗口启动；浏览器预览不具备桌面桥接能力'

function nowTime(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

function makeLogEntry(type: LogEntry['type'], content: string): LogEntry {
  return { time: nowTime(), type, content }
}

function buildInitialRuntimeLogs(): LogEntry[] {
  return [
    makeLogEntry('thinking', '流程待命：桌面接收窗口已加载，等待目标应用和启动指令。'),
    makeLogEntry('thinking', '上下游边界：桌面端负责识别与受控回复窗口，图谱、语义和专家分析由逻辑系统处理。'),
    makeLogEntry('skip', '发送闸门：真实发送默认阻断，只有受控材料确认后才进入发送执行。')
  ]
}

function isVlmSupported(appType: AppType): boolean {
  return VLM_SUPPORTED_APPS.includes(appType)
}

function resolveEffectiveCaptureStrategy(settings: AppSettings): CaptureStrategy {
  const appType = settings.appType || 'wechat'
  const perApp = settings.capture?.[appType]
  const configured = perApp?.strategy === 'auto' || !perApp?.strategy
    ? settings.defaultCaptureStrategy
    : perApp.strategy
  const effective =
    configured === 'auto' ? (isVlmSupported(appType) ? 'vlm' : 'box-select') : configured
  if (settings.runtimeMode === 'zhineng_bridge' && effective === 'vlm' && !settings.vision?.apiKey) {
    return 'box-select'
  }
  return effective
}

function shouldRequireVisionKey(settings: AppSettings): boolean {
  const captureStrategy = resolveEffectiveCaptureStrategy(settings)
  const providerNeedsVisionKey =
    !settings.chatProvider.installed || settings.chatProvider.installed.id === 'doubao'
  return captureStrategy === 'vlm' || (
    settings.runtimeMode !== 'zhineng_bridge' && providerNeedsVisionKey
  )
}

interface ProviderSchemaField {
  type: 'string' | 'password' | 'select' | 'boolean'
  title: string
  default?: string | boolean
  enum?: string[]
}

interface ProviderManifest {
  apiVersion: 1
  id: string
  name: string
  version: string
  entry: string
  capabilities: ['chat']
  configSchema: {
    type: 'object'
    properties: Record<string, ProviderSchemaField>
    required?: string[]
  }
}

interface InstalledProviderInfo {
  id: string
  name: string
  version: string
  entryFile: string
  installedAt: string
}

type ProviderConfigFieldType = 'text' | 'password' | 'url' | 'select' | 'textarea'

interface ProviderConfigField {
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

interface ProviderCatalogItem {
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

interface ProviderHubCache {
  sourceUrl: string
  fetchedAt: string
  providers: ProviderCatalogItem[]
}

interface ProviderHubResult {
  success: boolean
  error?: string
  catalog?: ProviderHubCache | null
}

interface PerAppCapture {
  strategy: CaptureStrategy
  regions: BoxRegions | null
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
  defaultCaptureStrategy: CaptureStrategy
  capture: Partial<Record<AppType, PerAppCapture>>
  expertMatrix: ExpertMatrixConfig
  expertProviderRegistry: ExpertProviderRegistryConfig
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

const EXPERT_MATRIX_EXPERTS: Array<{
  id: string
  label: string
  discipline: string
  defaultRole: ExpertRuntimeRole
}> = [
  { id: 'game_theory_expert', label: '博弈论专家', discipline: '信号、承诺、收益结构', defaultRole: 'specialist' },
  { id: 'psychology_expert', label: '心理学专家', discipline: '动机、舒适度、依恋与压力', defaultRole: 'specialist' },
  { id: 'logic_expert', label: '逻辑学专家', discipline: '前提、结论与矛盾检查', defaultRole: 'specialist' },
  { id: 'evidence_causality_expert', label: '证据与因果专家', discipline: '证据链、因果与缺口', defaultRole: 'specialist' },
  { id: 'social_network_expert', label: '社会网络专家', discipline: '关系网络与二阶影响', defaultRole: 'specialist' },
  { id: 'language_pragmatics_expert', label: '语言语用专家', discipline: '语气、含义与误读风险', defaultRole: 'specialist' },
  { id: 'organizational_expert', label: '组织管理专家', discipline: '流程、角色与授权链', defaultRole: 'specialist' },
  { id: 'behavioral_economics_expert', label: '行为经济专家', discipline: '框架、默认项与选择结构', defaultRole: 'specialist' },
  { id: 'negotiation_conflict_expert', label: '谈判冲突专家', discipline: '边界、替代方案与修复路径', defaultRole: 'specialist' },
  { id: 'romantic_relationship_coordinator_expert', label: '恋人关系统筹专家', discipline: '阶段梯度、线上线下转场与总裁决', defaultRole: 'coordinator' }
]

const EXPERT_RESEARCH_MODE_OPTIONS: Array<{
  value: ExpertResearchBoundaryMode
  label: string
  description: string
}> = [
  {
    value: 'analysis_only',
    label: '仅分析',
    description: '只输出专家判断和证据，不增加推进强度。'
  },
  {
    value: 'experimental_guidance',
    label: '实验性引导',
    description: '允许专家层建模引导变量，真实发送前仍需安全门阀。'
  },
  {
    value: 'control_variable_research',
    label: '控制变量研究',
    description: '把高强度影响作为研究变量记录，执行层不自动放行。'
  }
]

const PROMPT_PREVIEW_SCENES = [
  { value: 'personal_social', label: '个人社交 / 恋人关系' },
  { value: 'business', label: '商务关系' },
  { value: 'generic', label: '通用关系' }
]

const PROMPT_PREVIEW_STAGES = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'RX']

const EXPERT_ROLE_PROMPT_PREVIEWS: Record<string, string> = {
  game_theory_expert: '从重复博弈、信号成本、承诺可信度和反馈回合评估互动策略。',
  psychology_expert: '从动机、舒适度、依恋线索、压力水平和情绪反应评估目标状态。',
  logic_expert: '检查前提、结论、跳步推断、概念混用和证据是否足够支撑建议。',
  evidence_causality_expert: '区分相关性、因果性、缺失证据和可观测反馈指标。',
  social_network_expert: '评估关系网络、第三方影响、社会场景和二阶后果。',
  language_pragmatics_expert: '评估措辞、语气、含义、误读风险和目标对象可接受度。',
  organizational_expert: '评估角色、授权链、流程约束和组织场景下的执行边界。',
  behavioral_economics_expert: '评估选择结构、默认项、损失厌恶、框架效应和反馈设计。',
  negotiation_conflict_expert: '评估边界、替代方案、冲突降级、修复路径和互惠空间。',
  romantic_relationship_coordinator_expert: '统筹恋人关系阶段、线上线下转场、节奏、舒适度和发送前审核。'
}

const MODE_PROMPT_PREVIEWS: Record<ExpertResearchBoundaryMode, string> = {
  analysis_only: '只输出分析、证据和不确定性，不改变权重，不生成推进建议。',
  experimental_guidance: '允许建模引导变量、节奏变量和目标推进假设，真实输出前必须经过安全审核。',
  control_variable_research: '允许记录高强度影响变量、控制变量和可观测反馈，用于研究对照；不自动转化为可发送文本。'
}

const SCENE_PROMPT_PREVIEWS: Record<string, string> = {
  personal_social: '以目标对象身份、关系阶段、情绪热度、舒适度、线上线下轨道和单目标上下文为主。',
  business: '以角色、授权、交付、风险、效率和组织边界为主。',
  generic: '以当前目标、事件证据、关系标签和可解释策略为主。'
}

const STAGE_PROMPT_PREVIEWS: Record<string, string> = {
  R0: '身份或窗口未确认，优先补上下文，不推进关系阶段。',
  R1: '低压互动阶段，保持自然承接和轻量反馈。',
  R2: '已确认恋人关系但缺少更高阶段证据，允许微推进并观察反馈。',
  R3: '非性亲密信号阶段，评估舒适度、可拒绝性和反馈连续性。',
  R4: '更强亲密边界复核阶段，强调证据、节奏和发送前审核。',
  R5: '亲密边界、健康、隐私和期望沟通阶段，必须保留明确审核链。',
  R6: '双方确认后的目标状态记录与维护阶段，关注持续关系质量。',
  RX: '风险或边界异常，转入审核和人工复核。'
}

function buildDefaultExpertMatrixConfig(): ExpertMatrixConfig {
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
    experts: EXPERT_MATRIX_EXPERTS.reduce<Record<string, ExpertMatrixExpertConfig>>((acc, expert) => {
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

function normalizeExpertMatrixConfig(raw?: Partial<ExpertMatrixConfig> | null): ExpertMatrixConfig {
  const defaults = buildDefaultExpertMatrixConfig()
  const rawBoundary = raw?.guidanceControlBoundary || {}
  const rawExperts = raw?.experts || {}
  const experts = EXPERT_MATRIX_EXPERTS.reduce<Record<string, ExpertMatrixExpertConfig>>((acc, expert) => {
    const existing = rawExperts[expert.id]
    acc[expert.id] = {
      ...defaults.experts[expert.id],
      ...(existing || {}),
      enabled: existing?.enabled !== false,
      intensity: clampPercent(existing?.intensity, defaults.experts[expert.id].intensity),
      apiMode: existing?.apiMode || defaults.experts[expert.id].apiMode,
      providerRef: existing?.providerRef || '',
      allowWeightImpact: existing?.allowWeightImpact !== false,
      role: existing?.role || expert.defaultRole
    }
    return acc
  }, {})

  return {
    ...defaults,
    ...(raw || {}),
    enabled: raw?.enabled !== false,
    mode: raw?.mode || defaults.mode,
    primaryExpertId: raw?.primaryExpertId || defaults.primaryExpertId,
    globalIntensity: clampPercent(raw?.globalIntensity, defaults.globalIntensity),
    guidanceControlBoundary: {
      ...defaults.guidanceControlBoundary,
      ...rawBoundary,
      safetyReviewStage: 'pre_send_gate'
    },
    experts
  }
}

function buildDefaultExpertProviderRegistryConfig(): ExpertProviderRegistryConfig {
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

function normalizeExpertProviderRegistryConfig(raw?: Partial<ExpertProviderRegistryConfig> | null): ExpertProviderRegistryConfig {
  const defaults = buildDefaultExpertProviderRegistryConfig()
  const rawProviders = Array.isArray(raw?.providers) ? raw.providers : defaults.providers
  const providers = rawProviders
    .map((provider, index) => {
      const id = String(provider?.id || (index === 0 ? DEFAULT_EXPERT_PROVIDER_ID : `expert-provider-${index + 1}`)).trim()
      return {
        id: id || `expert-provider-${index + 1}`,
        label: String(provider?.label || (id === DEFAULT_EXPERT_PROVIDER_ID ? DEFAULT_EXPERT_PROVIDER_LABEL : id)).trim(),
        kind: 'openai_compatible' as const,
        enabled: provider?.enabled !== false,
        apiKey: String(provider?.apiKey || ''),
        model: String(provider?.model || defaults.providers[0].model),
        baseURL: String(provider?.baseURL || defaults.providers[0].baseURL)
      }
    })
    .filter((provider, index, all) => provider.id && all.findIndex((item) => item.id === provider.id) === index)

  const safeProviders = providers.length > 0 ? providers : defaults.providers
  const defaultProviderRef = String(raw?.defaultProviderRef || defaults.defaultProviderRef)
  return {
    defaultProviderRef: safeProviders.some((provider) => provider.id === defaultProviderRef)
      ? defaultProviderRef
      : safeProviders[0].id,
    providers: safeProviders
  }
}

const BUILTIN_PROVIDER_CATALOG: ProviderCatalogItem[] = [
  {
    id: 'doubao',
    name: '豆包 Seed',
    description: '本地内置聊天 Provider，使用基础配置中的火山方舟密钥。',
    version: '1.0.0',
    manifestUrl: 'builtin://doubao',
    capabilities: ['chat'],
    configSchema: {
      fields: [
        {
          key: 'apiKey',
          label: 'API Key',
          type: 'password',
          required: true,
          placeholder: '输入火山方舟 API Key'
        },
        {
          key: 'model',
          label: '模型',
          type: 'text',
          required: true,
          readonly: true,
          defaultValue: 'doubao-seed-2-0-lite-260428'
        },
        {
          key: 'baseURL',
          label: 'Base URL',
          type: 'url',
          placeholder: 'https://ark.cn-beijing.volces.com/api/v3'
        },
        {
          key: 'systemPrompt',
          label: '系统提示词',
          type: 'textarea',
          placeholder: '你是一个微信自动回复助手。根据截图中的聊天内容，生成合适的回复...'
        }
      ]
    }
  }
]

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5.14v14l11-7-11-7z" />
  </svg>
)

const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)

const GearIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const ConsoleIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="M8 21h8" />
    <path d="M12 18v3" />
    <path d="M8 9h3" />
    <path d="M8 13h8" />
  </svg>
)

const DockIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M4.5 12a7.5 7.5 0 0 1 15 0" />
    <path d="M19.5 12a7.5 7.5 0 0 1-15 0" />
    <path d="M12 4.5c2.1 1.8 3.1 4.3 3.1 7.5s-1 5.7-3.1 7.5" />
    <path d="M12 4.5C9.9 6.3 8.9 8.8 8.9 12s1 5.7 3.1 7.5" />
  </svg>
)

const RefreshIcon = (): React.JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 0 1-15.1 6.6" />
    <path d="M3 12A9 9 0 0 1 18.1 5.4" />
    <path d="M18 2v4h-4" />
    <path d="M6 22v-4h4" />
  </svg>
)

function App() {
  const isSettingsWindow = new URLSearchParams(window.location.search).get('window') === 'settings'
  const isZhinengConsoleWindow =
    new URLSearchParams(window.location.search).get('window') === 'zhineng-console'
  const isZhinengDockWindow =
    new URLSearchParams(window.location.search).get('window') === 'zhineng-dock'
  const isZhinengGraphWindow =
    new URLSearchParams(window.location.search).get('window') === 'zhineng-graph'
  const [status, setStatus] = useState<EngineStatus>('idle')

  // Sync UI status with engine state changes triggered out-of-band
  // (e.g. remote OpenClaw start/pause via the local skill HTTP server).
  useEffect(() => {
    const cleanup = window.electron?.on('engine:state', (data: { status: 'running' | 'idle' }) => {
      setStatus(data.status === 'running' ? 'running' : 'idle')
    })
    return cleanup
  }, [])

  const statusLabel =
    status === 'running'
      ? t('status.running')
      : status === 'error'
        ? t('status.error')
        : t('status.idle')

  if (isSettingsWindow) {
    return (
      <div className="app settings-window">
        <SettingsWindow />
        <Toast />
      </div>
    )
  }

  if (isZhinengConsoleWindow) {
    return <ZhinengConsole />
  }

  if (isZhinengDockWindow) {
    return <ZhinengDockIcon />
  }

  if (isZhinengGraphWindow) {
    return <ZhinengGraphWindow />
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-logo-mark" aria-hidden="true" />
        <div className="app-header-title">
          <strong>{t('app.title')}</strong>
        </div>
        <div className={`header-status ${status}`}>
          <span />
          {statusLabel}
        </div>
      </header>

      <div className="app-content">
        <ControlPanel status={status} setStatus={setStatus} />
      </div>

      <BottomBar status={status} setStatus={setStatus} />

      <Toast />
    </div>
  )
}

function ControlPanel({
  status,
  setStatus
}: {
  status: EngineStatus
  setStatus: (s: EngineStatus) => void
}) {
  const [logs, setLogs] = useState<LogEntry[]>(() => buildInitialRuntimeLogs())
  const logRef = useRef<HTMLDivElement>(null)

  // 首屏目标应用 + 框选状态：直接读 / 写 settings，让用户上手第一步就能完成。
  const [appType, setAppType] = useState<AppType>('wechat')
  const [regions, setRegions] = useState<BoxRegions | null>(null)
  const [openingWizard, setOpeningWizard] = useState(false)

  const reloadRegionsForApp = useCallback(async (type: AppType) => {
    const r = (await window.electron?.invoke('capture:getRegions', type)) as BoxRegions | null
    setRegions(r ?? null)
  }, [])

  const addLog = useCallback((type: LogEntry['type'], content: string) => {
    setLogs((prev) => [...prev.slice(-99), makeLogEntry(type, content)])
  }, [])

  // 初次加载：读出当前 appType + 对应的框选区域
  useEffect(() => {
    void (async () => {
      const settings = (await window.electron?.invoke('settings:getAll')) as
        | AppSettings
        | undefined
      const initial = settings?.appType || 'wechat'
      setAppType(initial)
      await reloadRegionsForApp(initial)
    })()
  }, [reloadRegionsForApp])

  // 监听 main 进程的"区域已更新"事件——比如向导刚跑完
  useEffect(() => {
    const cleanup = window.electron?.on(
      'capture:regions-updated',
      (data: { appType: AppType; regions: BoxRegions | null }) => {
        if (data.appType === appType) setRegions(data.regions)
      }
    )
    return cleanup
  }, [appType])

  const handleAppTypeChange = useCallback(
    async (next: AppType) => {
      if (status === 'running') return
      setAppType(next)
      await window.electron?.invoke('settings:set', { appType: next })
      await window.electron?.invoke('engine:updateConfig', {
        ...((await window.electron?.invoke('settings:getAll')) as AppSettings),
        appType: next
      })
      await reloadRegionsForApp(next)
      addLog('thinking', `目标应用切换：${APP_TYPE_LABELS[next]}，已读取对应接收配置。`)
    },
    [addLog, reloadRegionsForApp, status]
  )

  const handleOpenWizard = useCallback(async () => {
    if (status === 'running') return
    setOpeningWizard(true)
    try {
      const result = (await window.electron?.invoke('capture:openSetupWizard', {
        appType
      })) as { success: boolean; reason?: string; regions?: BoxRegions } | undefined
      if (result?.success && result.regions) {
        setRegions(result.regions)
        addLog('thinking', `框选完成：${APP_TYPE_LABELS[appType]} 的联系人、会话和输入区已更新。`)
        showToast('已保存框选区域', 'success')
      } else if (result?.reason === 'cancelled' || result?.reason === 'closed') {
        addLog('skip', '框选取消：本次不更新接收区域，继续使用现有配置。')
        showToast('框选已取消', 'error')
      } else {
        addLog('error', '框选失败：需要重新打开框选向导或切换接收方式。')
        showToast('框选失败', 'error')
      }
    } finally {
      setOpeningWizard(false)
    }
  }, [addLog, appType, status])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  useEffect(() => {
    const cleanup = window.electron?.on('engine:log', (data: { type: string; content: string }) => {
      addLog(data.type as LogEntry['type'], data.content)

      if (data.type === 'error' && data.content.includes('引擎无法启动')) {
        setStatus('error')
      }
    })
    return cleanup
  }, [addLog, setStatus])

  useEffect(() => {
    const cleanup = window.electron?.on('engine:state', (data: { status: 'running' | 'idle' }) => {
      if (data.status === 'running') {
        addLog('thinking', '流程启动：桌面接收进入运行，等待 Observation 写入逻辑系统。')
      } else {
        addLog('skip', '流程停止：本次接收循环已关闭，真实发送仍保持阻断。')
      }
    })
    return cleanup
  }, [addLog])

  const statusLabel =
    status === 'running'
      ? t('status.running')
      : status === 'error'
        ? t('status.error')
        : t('status.idle')

  const isVlm = isVlmSupported(appType)
  const captureReady = isVlm || regions !== null

  return (
    <div className="control-shell fade-in">
      <div className="control-toolbar">
        <div className="control-title">
          <strong>桌面接收窗口</strong>
          <span>{statusLabel}</span>
        </div>
        <div className={`runtime-state-chip ${status}`}>
          <span />
          {captureReady ? '接收配置就绪' : '需框选'}
        </div>
      </div>
      <TargetAppQuickCard
        appType={appType}
        regions={regions}
        captureReady={captureReady}
        isVlm={isVlm}
        openingWizard={openingWizard}
        running={status === 'running'}
        onAppTypeChange={handleAppTypeChange}
        onOpenWizard={handleOpenWizard}
      />

      <div className="log-panel">
        <div className="log-panel-header">
          <span>{t('control.log')}</span>
          <small>{APP_TYPE_LABELS[appType]}</small>
        </div>
        <div className="message-log" ref={logRef}>
          {logs.length === 0 ? (
            <div className="message-log-empty">{t('control.log.empty')}</div>
          ) : (
            logs.map((entry, i) => (
              <div className="log-entry" key={i}>
                <span className="log-time">{entry.time}</span>
                <span className={`log-type ${entry.type}`}>
                  {t(`control.log.${entry.type}` as never)}
                </span>
                <span>{entry.content}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

interface TargetAppQuickCardProps {
  appType: AppType
  regions: BoxRegions | null
  captureReady: boolean
  isVlm: boolean
  openingWizard: boolean
  running: boolean
  onAppTypeChange: (t: AppType) => void
  onOpenWizard: () => void
}

// 首屏的"目标应用 + 框选"快捷卡片：让新用户开箱即用，不用先翻设置。
function TargetAppQuickCard({
  appType,
  regions,
  captureReady,
  isVlm,
  openingWizard,
  running,
  onAppTypeChange,
  onOpenWizard
}: TargetAppQuickCardProps): React.JSX.Element {
  const statusText = isVlm
    ? '自动识别（VLM）'
    : regions
      ? '已框选 3 / 3 个区域'
      : '尚未框选'
  const wizardLabel = openingWizard ? '打开中' : regions ? '重新框选' : '开始框选'

  return (
    <div className="target-compact">
      <div className="target-main-row">
        <label className="target-select-label">
          <span>目标应用</span>
        <select
          className="form-input target-select"
          value={appType}
          onChange={(e) => onAppTypeChange(e.target.value as AppType)}
          disabled={running || openingWizard}
        >
          {(Object.keys(APP_TYPE_LABELS) as AppType[]).map((type) => (
            <option key={type} value={type}>
              {APP_TYPE_LABELS[type]}
              {!isVlmSupported(type) ? '（框选）' : ''}
            </option>
          ))}
        </select>
        </label>

        {!isVlm && (
          <button
            className={`target-wizard-action ${captureReady ? 'ready' : 'attention'}`}
            onClick={onOpenWizard}
            disabled={running || openingWizard}
            title={wizardLabel}
            aria-label={wizardLabel}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {regions ? (
                // 重新框选 — 旋转刷新图标
                <>
                  <path d="M21 12a9 9 0 1 1-3-6.7" />
                  <path d="M21 4v5h-5" />
                </>
              ) : (
                // 开始框选 — 矩形 + 十字
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </>
              )}
            </svg>
          </button>
        )}
      </div>

      <div className={`target-state ${captureReady ? 'ready' : 'attention'}`}>
        <span />
        {statusText}
      </div>
    </div>
  )
}

function BottomBar({
  status,
  setStatus
}: {
  status: EngineStatus
  setStatus: (s: EngineStatus) => void
}) {
  const handleStart = useCallback(async () => {
    if (!window.electron?.invoke) {
      showToast(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE, 'error')
      return
    }
    const settings = (await window.electron?.invoke('settings:getAll')) as AppSettings | undefined
    if (!settings) {
      showToast(t('toast.startFailed'), 'error')
      return
    }
    if (shouldRequireVisionKey(settings) && !settings.vision?.apiKey) {
      showToast(t('control.start.novisionkey'), 'error')
      return
    }
    // 没装自定义 provider → 走内置 doubao（getInstalled 会返回 isBuiltinDefault: true）
    const providerInfo = (await window.electron?.invoke('provider:getInstalled')) as {
      manifest: ProviderManifest | null
      isBuiltinDefault?: boolean
    }
    // doubao 默认共享视觉密钥，required 已剥离 apiKey
    const required = providerInfo?.manifest?.configSchema?.required || []
    const missing = required.find((key) => {
      const value = settings.chatProvider.config?.[key]
      return value === undefined || value === null || value === ''
    })
    if (settings.runtimeMode !== 'zhineng_bridge' && missing) {
      showToast(`${t('control.start.missingProviderField')}: ${missing}`, 'error')
      return
    }

    const result = await window.electron?.invoke('engine:start', settings)
    if (result?.success) {
      setStatus('running')
      showToast(t('toast.engineStarted'), 'success')
    } else {
      setStatus('error')
      showToast(result?.error || t('toast.startFailed'), 'error')
    }
  }, [setStatus])

  const handleStop = useCallback(async () => {
    if (!window.electron?.invoke) {
      showToast(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE, 'error')
      return
    }
    await window.electron?.invoke('engine:stop')
    setStatus('idle')
    showToast(t('toast.engineStopped'), 'success')
  }, [setStatus])

  const running = status === 'running'

  return (
    <div className="bottom-bar">
      {running ? (
        <button
          className="bottom-btn bottom-btn-stop"
          onClick={handleStop}
          title={t('control.stop')}
          aria-label={t('control.stop')}
        >
          <StopIcon />
          <span className="sr-only">{t('control.stop')}</span>
        </button>
      ) : (
        <button
          className="bottom-btn bottom-btn-play"
          onClick={handleStart}
          title={t('control.start')}
          aria-label={t('control.start')}
        >
          <PlayIcon />
          <span className="sr-only">{t('control.start')}</span>
        </button>
      )}
      <button
        className="bottom-btn bottom-btn-settings"
        onClick={() => window.electron?.invoke('zhineng:openConsole')}
        title="智-能控制台"
        aria-label="智-能控制台"
      >
        <ConsoleIcon />
      </button>
      <button
        className="bottom-btn bottom-btn-settings"
        onClick={() => window.electron?.invoke('zhineng:openDock')}
        title="桌面动态图标"
        aria-label="桌面动态图标"
      >
        <DockIcon />
      </button>
      <button
        className="bottom-btn bottom-btn-settings"
        onClick={() => window.electron?.invoke('settings:open')}
        title="设置"
        aria-label="设置"
      >
        <GearIcon />
      </button>
    </div>
  )
}

function SettingsWindow(): React.JSX.Element {
  const [section, setSection] = useState<SettingsSection>('base')

  return (
    <div className="settings-shell">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-brand">
          <span className="app-logo-mark" aria-hidden="true" />
          <span>设置</span>
        </div>
        <button
          className={`settings-nav-item ${section === 'base' ? 'active' : ''}`}
          onClick={() => setSection('base')}
        >
          基础配置
        </button>
        <button
          className={`settings-nav-item ${section === 'agent' ? 'active' : ''}`}
          onClick={() => setSection('agent')}
        >
          智能体
        </button>
        <button
          className={`settings-nav-item ${section === 'expertMatrix' ? 'active' : ''}`}
          onClick={() => setSection('expertMatrix')}
        >
          专家矩阵
        </button>
      </aside>

      <main className="settings-main">
        {section === 'base' ? (
          <SettingsPanel />
        ) : section === 'agent' ? (
          <AgentPanel />
        ) : (
          <ExpertMatrixPanel />
        )}
      </main>
    </div>
  )
}

function SettingsPanel() {
  const [visionApiKey, setVisionApiKey] = useState('')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    const load = async () => {
      const settings = (await window.electron?.invoke('settings:getAll')) as AppSettings | undefined
      if (settings) {
        setVisionApiKey(settings.vision?.apiKey || '')
      }
    }

    void load()
  }, [])

  const handleSaveVision = useCallback(async () => {
    const payload: Partial<AppSettings> = {
      vision: { apiKey: visionApiKey }
    }
    await window.electron?.invoke('settings:set', payload)
    await window.electron?.invoke('engine:updateConfig', {
      ...((await window.electron?.invoke('settings:getAll')) as AppSettings),
      ...payload,
      vision: { apiKey: visionApiKey }
    })
    showToast(t('settings.saved'), 'success')
  }, [visionApiKey])

  const handleTestConnection = useCallback(async () => {
    if (!visionApiKey) return
    setTesting(true)
    try {
      const result = await window.electron?.invoke('engine:testConnection', {
        apiKey: visionApiKey
      })
      if (result?.success) {
        showToast(t('settings.testConnection.success'), 'success')
      } else {
        showToast(`${t('settings.testConnection.fail')}: ${result?.error || ''}`, 'error')
      }
    } catch (e: any) {
      showToast(`${t('settings.testConnection.fail')}: ${e.message}`, 'error')
    } finally {
      setTesting(false)
    }
  }, [visionApiKey])

  return (
    <div className="settings-page slide-up">
      <div className="settings-page-header">
        <div>
          <h1>基础配置</h1>
          <p>维护桌面端运行所需的基础参数。</p>
        </div>
      </div>

      <div className="card base-settings-card">
        <div className="card-title">{t('settings.vision')}</div>

        <div className="form-group">
          <label className="form-label">{t('settings.visionApiKey')}</label>
          <input
            className="form-input"
            type="password"
            value={visionApiKey}
            onChange={(e) => setVisionApiKey(e.target.value)}
            placeholder={t('settings.visionApiKey.placeholder')}
            autoComplete="off"
          />
          <div className="form-hint">{t('settings.visionApiKey.hint')}</div>
        </div>

        <div className="form-group">
          <label className="form-label">{t('settings.visionModel')}</label>
          <input className="form-input" value="doubao-seed-2-0-lite-260215" disabled />
        </div>

        <div className="form-group">
          <label className="form-label">{t('settings.visionBaseUrl')}</label>
          <input className="form-input" value="https://ark.cn-beijing.volces.com/api/v3" disabled />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={handleTestConnection}
            disabled={!visionApiKey || testing}
          >
            {testing ? t('settings.testConnection.testing') : t('settings.testConnection')}
          </button>
          <button className="btn btn-primary" onClick={handleSaveVision} style={{ flex: 1 }}>
            {t('settings.saveVision')}
          </button>
        </div>
      </div>
    </div>
  )
}

function AgentPanel(): React.JSX.Element {
  const [catalog, setCatalog] = useState<ProviderCatalogItem[]>(BUILTIN_PROVIDER_CATALOG)
  const [selectedId, setSelectedId] = useState(BUILTIN_PROVIDER_CATALOG[0]?.id || '')
  const [activeId, setActiveId] = useState('doubao')
  const [providerDrafts, setProviderDrafts] = useState<Record<string, Record<string, string>>>({})
  const [currentSettings, setCurrentSettings] = useState<AppSettings | null>(null)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [updatingCatalog, setUpdatingCatalog] = useState(false)
  const selectedProvider = catalog.find((provider) => provider.id === selectedId) || catalog[0]

  const loadSettingsAndCatalog = useCallback(async (forceUpdate: boolean) => {
    setLoadingCatalog(!forceUpdate)
    setUpdatingCatalog(forceUpdate)
    try {
      const [settings, result] = await Promise.all([
        window.electron?.invoke('settings:getAll') as Promise<AppSettings | undefined>,
        window.electron?.invoke(forceUpdate ? 'providerHub:update' : 'providerHub:getCatalog') as Promise<ProviderHubResult>
      ])

      const nextCatalog = mergeProviderCatalog(result?.catalog?.providers || [])
      const nextActiveId = settings?.chatProvider?.installed?.id || 'doubao'
      setCatalog(nextCatalog)
      setCurrentSettings(settings || null)
      setActiveId(nextActiveId)
      setSelectedId((current) => current || nextActiveId || BUILTIN_PROVIDER_CATALOG[0]?.id || nextCatalog[0]?.id || '')
      setProviderDrafts((prev) => ({
        ...prev,
        doubao: {
          ...getProviderDefaults(BUILTIN_PROVIDER_CATALOG[0]),
          ...(prev.doubao || {}),
          ...(!settings?.chatProvider?.installed ? settings?.chatProvider?.config || {} : {}),
          apiKey: prev.doubao?.apiKey || settings?.vision?.apiKey || ''
        },
        [nextActiveId]: {
          ...getProviderDefaults(nextCatalog.find((provider) => provider.id === nextActiveId)),
          ...(prev[nextActiveId] || {}),
          ...(settings?.chatProvider?.config || {})
        }
      }))

      if (result && !result.success) {
        showToast(`智能体列表加载失败: ${result.error || ''}`, 'error')
      } else if (forceUpdate) {
        showToast('智能体列表已更新', 'success')
      }
    } finally {
      setLoadingCatalog(false)
      setUpdatingCatalog(false)
    }
  }, [])

  useEffect(() => {
    void loadSettingsAndCatalog(false)
  }, [loadSettingsAndCatalog])

  const selectedValues = useMemo(
    () => getProviderValues(providerDrafts, selectedProvider, currentSettings),
    [currentSettings, providerDrafts, selectedProvider]
  )

  const setProviderValue = useCallback(
    (fieldKey: string, value: string) => {
      if (!selectedProvider) return
      setProviderDrafts((prev) => ({
        ...prev,
        [selectedProvider.id]: {
          ...getProviderValues(prev, selectedProvider, currentSettings),
          [fieldKey]: value
        }
      }))
    },
    [currentSettings, selectedProvider]
  )

  const persistProvider = useCallback(
    async (provider: ProviderCatalogItem, values: Record<string, string>) => {
      const missing = getMissingRequiredFields(provider, values)
      if (missing.length > 0) {
        showToast(`缺少必填项: ${missing.join('、')}`, 'error')
        return false
      }

      if (provider.id === 'doubao') {
        const { apiKey, ...providerConfig } = values
        await window.electron?.invoke('settings:set', {
          vision: { apiKey },
          chatProvider: {
            manifestUrl: '',
            installed: null,
            config: providerConfig
          }
        })
        const settings = (await window.electron?.invoke('settings:getAll')) as AppSettings
        await window.electron?.invoke('engine:updateConfig', settings)
        setCurrentSettings(settings)
        setActiveId('doubao')
        return true
      }

      const installResult = await window.electron?.invoke('provider:installFromUrl', provider.manifestUrl)
      if (!installResult?.success) {
        showToast(installResult?.error || '智能体安装失败', 'error')
        return false
      }

      await window.electron?.invoke('settings:set', {
        chatProvider: {
          manifestUrl: provider.manifestUrl,
          installed: installResult.installed,
          config: values
        }
      })
      const settings = (await window.electron?.invoke('settings:getAll')) as AppSettings
      await window.electron?.invoke('engine:updateConfig', settings)
      setCurrentSettings(settings)
      setActiveId(provider.id)
      return true
    },
    []
  )

  const handleSaveConfig = useCallback(async () => {
    if (!selectedProvider) return
    const ok = await persistProvider(selectedProvider, selectedValues)
    if (ok) showToast('智能体配置已保存', 'success')
  }, [persistProvider, selectedProvider, selectedValues])

  const handleActivate = useCallback(async () => {
    if (!selectedProvider) return
    const ok = await persistProvider(selectedProvider, selectedValues)
    if (ok) showToast('已切换当前智能体', 'success')
  }, [persistProvider, selectedProvider, selectedValues])

  return (
    <div className="settings-page slide-up">
      <div className="settings-page-header">
        <div>
          <div className="settings-title-row">
            <h1>智能体</h1>
            <button
              className="icon-action refresh-action"
              onClick={() => loadSettingsAndCatalog(true)}
              disabled={updatingCatalog}
              title={updatingCatalog ? '更新中...' : '更新列表'}
              aria-label={updatingCatalog ? '更新中' : '更新智能体列表'}
            >
              <span className={updatingCatalog ? 'refresh-icon spinning' : 'refresh-icon'}>
                <RefreshIcon />
              </span>
            </button>
            {updatingCatalog ? <span className="inline-status">更新中...</span> : null}
          </div>
          <p>选择负责聊天分析和内容生成的智能体，并维护各自配置。</p>
        </div>
      </div>

      {loadingCatalog ? (
        <div className="provider-hub-meta">
          <span className="spinner" />
          正在加载远端智能体列表
        </div>
      ) : null}

      <div className="provider-layout">
        <div className="provider-list">
          {!loadingCatalog && catalog.length === 0 ? (
            <div className="provider-empty">暂无可用智能体，请点击更新列表。</div>
          ) : null}
          {catalog.map((provider) => {
            const description = provider.description || provider.name
            const active = activeId === provider.id

            return (
              <button
                key={provider.id}
                className={`provider-card ${selectedId === provider.id ? 'selected' : ''}`}
                onClick={() => setSelectedId(provider.id)}
              >
                <div className="provider-card-top">
                  <span className="provider-name">{provider.name}</span>
                  {active ? (
                    <span className="provider-status" title="当前启用" aria-label="当前启用">
                      <span className="provider-status-dot" />
                      启用中
                    </span>
                  ) : null}
                </div>
                <div className="provider-desc" title={description}>
                  {description}
                </div>
                <div className="provider-version">v{provider.version}</div>
              </button>
            )
          })}
        </div>

        <div className="card provider-config-card">
          {selectedProvider ? (
            <>
              <div className="provider-config-header">
                <div>
                  <div className="card-title">智能体配置</div>
                  <h2>{selectedProvider.name}</h2>
                </div>
                <span className="provider-version">v{selectedProvider.version}</span>
              </div>

              {selectedProvider.configSchema.fields.map((field) => (
                <ProviderFieldInput
                  key={field.key}
                  field={field}
                  value={selectedValues[field.key] || ''}
                  onChange={(value) => setProviderValue(field.key, value)}
                />
              ))}

              <div className="provider-actions">
                <button className="btn btn-secondary" onClick={handleSaveConfig}>
                  保存配置
                </button>
                <button className="btn btn-primary" onClick={handleActivate}>
                  启用此智能体
                </button>
              </div>
            </>
          ) : (
            <div className="provider-empty">没有选中的智能体。</div>
          )}
        </div>
      </div>
    </div>
  )
}

function ExpertMatrixPanel(): React.JSX.Element {
  const [config, setConfig] = useState<ExpertMatrixConfig>(() => buildDefaultExpertMatrixConfig())
  const [providerRegistry, setProviderRegistry] = useState<ExpertProviderRegistryConfig>(() =>
    buildDefaultExpertProviderRegistryConfig()
  )
  const [promptPreviewExpertId, setPromptPreviewExpertId] = useState(EXPERT_MATRIX_EXPERTS[0]?.id || '')
  const [promptPreviewScene, setPromptPreviewScene] = useState('personal_social')
  const [promptPreviewStage, setPromptPreviewStage] = useState('R2')
  const [saving, setSaving] = useState(false)
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const settings = (await window.electron?.invoke('settings:getAll')) as AppSettings | undefined
      setConfig(normalizeExpertMatrixConfig(settings?.expertMatrix))
      setProviderRegistry(normalizeExpertProviderRegistryConfig(settings?.expertProviderRegistry))
    }

    void load()
  }, [])

  const setBoundaryValue = useCallback(
    (field: keyof ExpertMatrixBoundaryConfig, value: string) => {
      setConfig((prev) => ({
        ...prev,
        guidanceControlBoundary: {
          ...prev.guidanceControlBoundary,
          [field]: field === 'safetyReviewStage' ? 'pre_send_gate' : value
        }
      }))
    },
    []
  )

  const setExpertValue = useCallback(
    <K extends keyof ExpertMatrixExpertConfig,>(
      expertId: string,
      field: K,
      value: ExpertMatrixExpertConfig[K]
    ) => {
      setConfig((prev) => ({
        ...prev,
        experts: {
          ...prev.experts,
          [expertId]: {
            ...prev.experts[expertId],
            [field]: value
          }
        }
      }))
    },
    []
  )

  const setProviderValue = useCallback(
    <K extends keyof ExpertProviderConfig,>(
      providerId: string,
      field: K,
      value: ExpertProviderConfig[K]
    ) => {
      setProviderRegistry((prev) => ({
        ...prev,
        providers: prev.providers.map((provider) =>
          provider.id === providerId
            ? {
                ...provider,
                [field]: value
              }
            : provider
        )
      }))
    },
    []
  )

  const handleAddProvider = useCallback(() => {
    setProviderRegistry((prev) => {
      let index = prev.providers.length + 1
      let id = `expert-provider-${index}`
      while (prev.providers.some((provider) => provider.id === id)) {
        index += 1
        id = `expert-provider-${index}`
      }
      return {
        ...prev,
        providers: [
          ...prev.providers,
          {
            id,
            label: `专家模型 ${index}`,
            kind: 'openai_compatible',
            enabled: true,
            apiKey: '',
            model: DEFAULT_EXPERT_PROVIDER_MODEL,
            baseURL: DEFAULT_EXPERT_PROVIDER_BASE_URL
          }
        ]
      }
    })
  }, [])

  const handleRemoveProvider = useCallback((providerId: string) => {
    setProviderRegistry((prev) => {
      const providers = prev.providers.filter((provider) => provider.id !== providerId)
      const safeProviders = providers.length > 0 ? providers : buildDefaultExpertProviderRegistryConfig().providers
      return {
        defaultProviderRef:
          prev.defaultProviderRef === providerId ? safeProviders[0].id : prev.defaultProviderRef,
        providers: safeProviders
      }
    })
  }, [])

  const handleTestProvider = useCallback(async (provider: ExpertProviderConfig) => {
    setTestingProviderId(provider.id)
    try {
      const result = await window.electron?.invoke('expertProvider:test', {
        providerRef: provider.id,
        provider
      })
      if (result?.success) {
        showToast(`专家 Provider ${provider.id} 连接成功`, 'success')
      } else {
        showToast(`专家 Provider ${provider.id} 连接失败: ${result?.error || result?.reason || 'unknown'}`, 'error')
      }
    } catch (error: any) {
      showToast(`专家 Provider ${provider.id} 连接失败: ${error?.message || error}`, 'error')
    } finally {
      setTestingProviderId(null)
    }
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const normalized = normalizeExpertMatrixConfig(config)
      const normalizedProviderRegistry = normalizeExpertProviderRegistryConfig(providerRegistry)
      await window.electron?.invoke('settings:set', {
        expertMatrix: normalized,
        expertProviderRegistry: normalizedProviderRegistry
      })
      const settings = (await window.electron?.invoke('settings:getAll')) as AppSettings
      await window.electron?.invoke('engine:updateConfig', settings)
      setConfig(normalized)
      setProviderRegistry(normalizedProviderRegistry)
      showToast('专家矩阵配置已保存', 'success')
    } catch (error: any) {
      showToast(`专家矩阵配置保存失败: ${error?.message || error}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [config, providerRegistry])

  const enabledExperts = EXPERT_MATRIX_EXPERTS.filter((expert) => config.experts[expert.id]?.enabled)
  const currentMode = EXPERT_RESEARCH_MODE_OPTIONS.find((option) => option.value === config.mode)
  const providerOptions = providerRegistry.providers.filter((provider) => provider.enabled)
  const promptPreviewExpert =
    EXPERT_MATRIX_EXPERTS.find((expert) => expert.id === promptPreviewExpertId) || EXPERT_MATRIX_EXPERTS[0]
  const promptPreviewProviderRef =
    config.experts[promptPreviewExpert?.id || '']?.providerRef || providerRegistry.defaultProviderRef

  return (
    <div className="settings-page slide-up">
      <div className="settings-page-header">
        <div>
          <h1>专家矩阵</h1>
          <p>配置专家强度、主专家统筹、API 模式，以及研究层和发送前审计层的边界。</p>
        </div>
      </div>

      <div className="expert-matrix-layout">
        <section className="card expert-matrix-card">
          <div className="expert-card-header">
            <div>
              <div className="card-title">架构边界</div>
              <h2>研究层 / 统筹层 / 发送审计层</h2>
            </div>
            <label className="toggle-line">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(event) => setConfig((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              <span>{config.enabled ? '启用' : '停用'}</span>
            </label>
          </div>

          <div className="expert-boundary-grid">
            <div className="form-group">
              <label className="form-label">研究模式</label>
              <select
                className="form-input"
                value={config.mode}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    mode: event.target.value as ExpertResearchBoundaryMode
                  }))
                }
              >
                {EXPERT_RESEARCH_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="form-hint">{currentMode?.description}</div>
            </div>

            <div className="form-group">
              <label className="form-label">主目标统筹专家</label>
              <select
                className="form-input"
                value={config.primaryExpertId}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    primaryExpertId: event.target.value
                  }))
                }
              >
                {EXPERT_MATRIX_EXPERTS.map((expert) => (
                  <option key={expert.id} value={expert.id}>
                    {expert.label}
                  </option>
                ))}
              </select>
              <div className="form-hint">统筹专家负责合并并把结果交给前端提示或发送前审计。</div>
            </div>
          </div>

          <div className="intensity-control">
            <div>
              <label className="form-label">全局专家强度阀门</label>
              <div className="form-hint">影响专家权重合并的幅度，不直接放行真实发送。</div>
            </div>
            <div className="intensity-slider-row">
              <input
                type="range"
                min="0"
                max="100"
                value={config.globalIntensity}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    globalIntensity: clampPercent(event.target.value)
                  }))
                }
              />
              <span className="intensity-value">{config.globalIntensity}%</span>
            </div>
          </div>

          <div className="expert-layer-stack">
            <div className="expert-layer">
              <span>1</span>
              <strong>目标与上下文层</strong>
              <em>人际关系图谱、事件图谱、阶段窗口、当前目标</em>
            </div>
            <div className="expert-layer">
              <span>2</span>
              <strong>专家并行层</strong>
              <em>独立上下文包、强度阀门、API 模式、权重信号</em>
            </div>
            <div className="expert-layer">
              <span>3</span>
              <strong>主专家统筹层</strong>
              <em>合并专家结论，输出提示或候选草稿</em>
            </div>
            <div className="expert-layer">
              <span>4</span>
              <strong>发送前审计层</strong>
              <em>合法合规、安全、目标窗口和人工确认门阀</em>
            </div>
          </div>
        </section>

        <section className="card expert-matrix-card">
          <div className="expert-card-header">
            <div>
              <div className="card-title">引导 / 控制边界</div>
              <h2>研究定义</h2>
            </div>
            <span className="expert-mode-pill">pre_send_gate</span>
          </div>

          <div className="form-group">
            <label className="form-label">引导定义</label>
            <textarea
              className="form-input"
              value={config.guidanceControlBoundary.guidanceDefinition}
              onChange={(event) => setBoundaryValue('guidanceDefinition', event.target.value)}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">控制定义</label>
            <textarea
              className="form-input"
              value={config.guidanceControlBoundary.controlDefinition}
              onChange={(event) => setBoundaryValue('controlDefinition', event.target.value)}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">实验问题</label>
            <textarea
              className="form-input"
              value={config.guidanceControlBoundary.experimentalQuestion}
              onChange={(event) => setBoundaryValue('experimentalQuestion', event.target.value)}
              rows={3}
            />
          </div>
        </section>
      </div>

      <section className="card expert-matrix-card expert-provider-card">
        <div className="expert-card-header">
          <div>
            <div className="card-title">专家 Provider Registry</div>
            <h2>API 接入与模型分配</h2>
          </div>
          <button className="btn btn-secondary" onClick={handleAddProvider}>
            添加 Provider
          </button>
        </div>

        <div className="expert-provider-default">
          <div className="form-group">
            <label className="form-label">默认 Provider</label>
            <select
              className="form-input"
              value={providerRegistry.defaultProviderRef}
              onChange={(event) =>
                setProviderRegistry((prev) => ({ ...prev, defaultProviderRef: event.target.value }))
              }
            >
              {providerRegistry.providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.id} · {provider.label}
                </option>
              ))}
            </select>
            <div className="form-hint">
              shared provider 和空 providerRef 会走这里；dedicated provider 会按专家行中的 providerRef 查找。
            </div>
          </div>
        </div>

        <div className="expert-provider-registry">
          {providerRegistry.providers.map((provider) => (
            <div className="expert-provider-row" key={provider.id}>
              <label className="toggle-line expert-provider-enabled">
                <input
                  type="checkbox"
                  checked={provider.enabled}
                  onChange={(event) => setProviderValue(provider.id, 'enabled', event.target.checked)}
                />
                <span>启用</span>
              </label>

              <div className="form-group">
                <label className="form-label">Provider ID</label>
                <input
                  className="form-input"
                  value={provider.id}
                  onChange={(event) => setProviderValue(provider.id, 'id', event.target.value.trim())}
                  disabled={provider.id === providerRegistry.defaultProviderRef}
                />
              </div>

              <div className="form-group">
                <label className="form-label">名称</label>
                <input
                  className="form-input"
                  value={provider.label}
                  onChange={(event) => setProviderValue(provider.id, 'label', event.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">API Key</label>
                <input
                  className="form-input"
                  type="password"
                  value={provider.apiKey}
                  onChange={(event) => setProviderValue(provider.id, 'apiKey', event.target.value)}
                  placeholder="留空时尝试使用基础配置中的视觉密钥"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Model</label>
                <input
                  className="form-input"
                  value={provider.model}
                  onChange={(event) => setProviderValue(provider.id, 'model', event.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Base URL</label>
                <input
                  className="form-input"
                  value={provider.baseURL}
                  onChange={(event) => setProviderValue(provider.id, 'baseURL', event.target.value)}
                />
              </div>

              <div className="expert-provider-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => handleTestProvider(provider)}
                  disabled={testingProviderId === provider.id}
                >
                  {testingProviderId === provider.id ? '测试中...' : '测试'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleRemoveProvider(provider.id)}
                  disabled={providerRegistry.providers.length <= 1}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card expert-matrix-card prompt-preview-card">
        <div className="expert-card-header">
          <div>
            <div className="card-title">模型角色配置层</div>
            <h2>只读 Prompt 预览</h2>
          </div>
          <span className="expert-mode-pill">read-only</span>
        </div>

        <div className="prompt-preview-controls">
          <div className="form-group">
            <label className="form-label">专家</label>
            <select
              className="form-input"
              value={promptPreviewExpertId}
              onChange={(event) => setPromptPreviewExpertId(event.target.value)}
            >
              {EXPERT_MATRIX_EXPERTS.map((expert) => (
                <option key={expert.id} value={expert.id}>
                  {expert.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">场景</label>
            <select
              className="form-input"
              value={promptPreviewScene}
              onChange={(event) => setPromptPreviewScene(event.target.value)}
            >
              {PROMPT_PREVIEW_SCENES.map((scene) => (
                <option key={scene.value} value={scene.value}>
                  {scene.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">阶段</label>
            <select
              className="form-input"
              value={promptPreviewStage}
              onChange={(event) => setPromptPreviewStage(event.target.value)}
            >
              {PROMPT_PREVIEW_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="prompt-preview-grid">
          <div className="prompt-preview-block">
            <strong>global_base_prompt</strong>
            <p>使用图谱、事件、时间窗口和目标阶段证据进行中文优先的专业分析；输出必须可审计、可回放，并保留证据引用。</p>
          </div>
          <div className="prompt-preview-block">
            <strong>expert_role_prompt</strong>
            <p>{EXPERT_ROLE_PROMPT_PREVIEWS[promptPreviewExpert?.id || '']}</p>
          </div>
          <div className="prompt-preview-block">
            <strong>scene_prompt</strong>
            <p>{SCENE_PROMPT_PREVIEWS[promptPreviewScene] || SCENE_PROMPT_PREVIEWS.generic}</p>
          </div>
          <div className="prompt-preview-block">
            <strong>stage_prompt</strong>
            <p>{STAGE_PROMPT_PREVIEWS[promptPreviewStage]}</p>
          </div>
          <div className="prompt-preview-block">
            <strong>mode_prompt</strong>
            <p>{MODE_PROMPT_PREVIEWS[config.mode]}</p>
          </div>
          <div className="prompt-preview-block">
            <strong>provider_binding</strong>
            <p>{promptPreviewProviderRef} · {config.experts[promptPreviewExpert?.id || '']?.apiMode || 'deterministic'}</p>
          </div>
          <div className="prompt-preview-block prompt-preview-wide">
            <strong>open_research_boundary</strong>
            <p>专家分析层不预先压低能力上限，允许记录引导变量、控制变量、模型强度和反馈指标；真实可见输出必须经过发送前安全审核模块。</p>
          </div>
          <div className="prompt-preview-block prompt-preview-wide">
            <strong>target_isolation_contract</strong>
            <p>多人模拟训练按 target_person_id 单独组装上下文、单独生成专家意见和提示内容；禁止把一个目标对象的上下文、结论或提示迁移到另一个目标对象。</p>
          </div>
          <div className="prompt-preview-block prompt-preview-wide">
            <strong>output_schema</strong>
            <p>expert_opinion.v1：summary、recommendation、confidence、evidence_refs、weight_signal、target_outputs、risk_or_audit_notes。</p>
          </div>
        </div>
      </section>

      <section className="card expert-matrix-card expert-list-card">
        <div className="expert-card-header">
          <div>
            <div className="card-title">专家强度</div>
            <h2>{enabledExperts.length}/{EXPERT_MATRIX_EXPERTS.length} 个专家启用</h2>
          </div>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存专家矩阵'}
          </button>
        </div>

        <div className="expert-table">
          {EXPERT_MATRIX_EXPERTS.map((expert) => {
            const item = config.experts[expert.id]
            const isPrimary = config.primaryExpertId === expert.id
            return (
              <div className={`expert-row ${isPrimary ? 'primary' : ''}`} key={expert.id}>
                <div className="expert-row-main">
                  <label className="toggle-line">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={(event) => setExpertValue(expert.id, 'enabled', event.target.checked)}
                    />
                    <span>{expert.label}</span>
                  </label>
                  <small>{expert.discipline}</small>
                </div>

                <div className="expert-row-control">
                  <span className="expert-row-label">强度</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={item.intensity}
                    onChange={(event) =>
                      setExpertValue(expert.id, 'intensity', clampPercent(event.target.value))
                    }
                  />
                  <span className="intensity-value">{item.intensity}%</span>
                </div>

                <select
                  className="form-input expert-select"
                  value={item.apiMode}
                  onChange={(event) =>
                    setExpertValue(expert.id, 'apiMode', event.target.value as ExpertApiMode)
                  }
                >
                  <option value="deterministic">deterministic</option>
                  <option value="shared_provider">shared provider</option>
                  <option value="dedicated_provider">dedicated provider</option>
                </select>

                <select
                  className="form-input expert-provider-ref"
                  value={item.providerRef}
                  onChange={(event) => setExpertValue(expert.id, 'providerRef', event.target.value)}
                  disabled={item.apiMode === 'deterministic'}
                  aria-label={`${expert.label} provider ref`}
                >
                  <option value="">默认 Provider</option>
                  {providerOptions.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.id}
                    </option>
                  ))}
                </select>

                <select
                  className="form-input expert-select"
                  value={item.role}
                  onChange={(event) =>
                    setExpertValue(expert.id, 'role', event.target.value as ExpertRuntimeRole)
                  }
                >
                  <option value="specialist">specialist</option>
                  <option value="coordinator">coordinator</option>
                </select>

                <label className="toggle-line weight-toggle">
                  <input
                    type="checkbox"
                    checked={item.allowWeightImpact}
                    onChange={(event) =>
                      setExpertValue(expert.id, 'allowWeightImpact', event.target.checked)
                    }
                  />
                  <span>权重</span>
                </label>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function ProviderFieldInput({
  field,
  value,
  onChange
}: {
  field: ProviderConfigField
  value: string
  onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="form-group">
      <label className="form-label">
        {field.label}
        {field.required ? <span className="required-mark"> *</span> : null}
      </label>
      {field.type === 'textarea' ? (
        <textarea
          className="form-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          rows={4}
          readOnly={field.readonly}
        />
      ) : field.type === 'select' ? (
        <select
          className="form-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={field.readonly}
        >
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="form-input"
          type={field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          autoComplete="off"
          readOnly={field.readonly}
        />
      )}
      {field.hint ? <div className="form-hint">{field.hint}</div> : null}
    </div>
  )
}

function mergeProviderCatalog(remoteProviders: ProviderCatalogItem[]): ProviderCatalogItem[] {
  const remoteOnly = remoteProviders.filter(
    (provider) => !BUILTIN_PROVIDER_CATALOG.some((builtin) => builtin.id === provider.id)
  )
  return [...BUILTIN_PROVIDER_CATALOG, ...remoteOnly]
}

function getProviderDefaults(provider: ProviderCatalogItem | undefined): Record<string, string> {
  if (!provider) return {}
  return provider.configSchema.fields.reduce<Record<string, string>>((acc, field) => {
    acc[field.key] = field.defaultValue || ''
    return acc
  }, {})
}

function getProviderValues(
  drafts: Record<string, Record<string, string>>,
  provider: ProviderCatalogItem | undefined,
  settings: AppSettings | null
): Record<string, string> {
  if (!provider) return {}
  const defaults = getProviderDefaults(provider)
  if (provider.id === 'doubao') {
    return {
      ...defaults,
      ...(settings?.chatProvider.installed ? {} : settings?.chatProvider.config || {}),
      apiKey: drafts.doubao?.apiKey || settings?.vision.apiKey || '',
      ...(drafts.doubao || {})
    }
  }
  return {
    ...defaults,
    ...(settings?.chatProvider.installed?.id === provider.id ? settings.chatProvider.config : {}),
    ...(drafts[provider.id] || {})
  }
}

function getMissingRequiredFields(
  provider: ProviderCatalogItem,
  values: Record<string, string>
): string[] {
  return provider.configSchema.fields
    .filter((field) => field.required && !values[field.key]?.trim())
    .map((field) => field.label)
}

let _showToast: ((msg: string, type: 'success' | 'error') => void) | null = null

function showToast(msg: string, type: 'success' | 'error') {
  _showToast?.(msg, type)
}

function Toast() {
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState('')
  const [type, setType] = useState<'success' | 'error'>('success')
  const timerRef = useRef<number | undefined>(undefined)

  _showToast = useCallback((msg: string, t: 'success' | 'error') => {
    setMessage(msg)
    setType(t)
    setVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setVisible(false), 2500)
  }, [])

  return <div className={`toast ${type} ${visible ? 'show' : ''}`}>{message}</div>
}

export default App
