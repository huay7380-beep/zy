export const VOICE_PROFILE_SCHEMA = 'voice_profile.v1'

export type VoiceProfileStatus = 'ready' | 'fallback' | 'disabled' | 'missing'
export type VoiceProfileAdapterKind = 'browser_speech_synthesis' | 'local_http' | 'remote_http' | 'local_process' | 'text_only'
export type VoiceEmotionPreset = 'calm' | 'focused' | 'warm' | 'urgent' | 'reflective' | 'steady'

export interface BrowserSpeechSynthesisVoiceLike {
  name?: string
  lang?: string
  voiceURI?: string
  localService?: boolean
  default?: boolean
}

export interface VoiceProfile {
  schema: typeof VOICE_PROFILE_SCHEMA
  profile_id: string
  display_name: string
  enabled: boolean
  status: VoiceProfileStatus
  adapter_id: VoiceProfileAdapterKind | string
  voice_id: string
  locale: string
  style: 'calm_first_person' | 'neutral_system' | 'custom'
  speed: number
  pitch: number
  volume: number
  emotion_defaults: {
    neutral: VoiceEmotionPreset
    warn: VoiceEmotionPreset
    blocked: VoiceEmotionPreset
  }
  clone_profile_id: string | null
  fallback_profile_id: string | null
  source: 'browser_voice_list' | 'runtime_config' | 'fallback_default'
  updated_at: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function pickNullableString(value: unknown, fallback: string | null): string | null {
  if (value === null) return null
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function pickNumberInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function normalizeVoiceProfileStatus(value: unknown, fallback: VoiceProfileStatus): VoiceProfileStatus {
  return value === 'ready' || value === 'fallback' || value === 'disabled' || value === 'missing' ? value : fallback
}

function normalizeVoiceEmotionPreset(value: unknown, fallback: VoiceEmotionPreset): VoiceEmotionPreset {
  return value === 'calm' ||
    value === 'focused' ||
    value === 'warm' ||
    value === 'urgent' ||
    value === 'reflective' ||
    value === 'steady'
    ? value
    : fallback
}

function stableVoiceId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}

export const DEFAULT_TEXT_ONLY_VOICE_PROFILE: VoiceProfile = {
  schema: VOICE_PROFILE_SCHEMA,
  profile_id: 'voice.text_only',
  display_name: 'Text only',
  enabled: false,
  status: 'fallback',
  adapter_id: 'text_only',
  voice_id: 'text_only',
  locale: 'zh-CN',
  style: 'calm_first_person',
  speed: 1,
  pitch: 1,
  volume: 1,
  emotion_defaults: {
    neutral: 'calm',
    warn: 'steady',
    blocked: 'reflective'
  },
  clone_profile_id: null,
  fallback_profile_id: null,
  source: 'fallback_default',
  updated_at: '2026-06-25T00:00:00.000Z'
}

export const DEFAULT_BROWSER_VOICE_PROFILE: VoiceProfile = {
  schema: VOICE_PROFILE_SCHEMA,
  profile_id: 'voice.default.browser.zh-CN',
  display_name: 'Browser default zh-CN',
  enabled: true,
  status: 'fallback',
  adapter_id: 'browser_speech_synthesis',
  voice_id: 'browser_default_zh-CN',
  locale: 'zh-CN',
  style: 'calm_first_person',
  speed: 1,
  pitch: 1,
  volume: 1,
  emotion_defaults: {
    neutral: 'calm',
    warn: 'steady',
    blocked: 'reflective'
  },
  clone_profile_id: null,
  fallback_profile_id: DEFAULT_TEXT_ONLY_VOICE_PROFILE.profile_id,
  source: 'fallback_default',
  updated_at: '2026-06-25T00:00:00.000Z'
}

export const DEFAULT_COSYVOICE_VOICE_PROFILE: VoiceProfile = {
  schema: VOICE_PROFILE_SCHEMA,
  profile_id: 'voice.cosyvoice.local.default',
  display_name: 'CosyVoice local default',
  enabled: true,
  status: 'ready',
  adapter_id: 'cosyvoice_local_http',
  voice_id: 'default',
  locale: 'zh-CN',
  style: 'calm_first_person',
  speed: 1,
  pitch: 1,
  volume: 1,
  emotion_defaults: {
    neutral: 'warm',
    warn: 'steady',
    blocked: 'reflective'
  },
  clone_profile_id: null,
  fallback_profile_id: DEFAULT_BROWSER_VOICE_PROFILE.profile_id,
  source: 'runtime_config',
  updated_at: '2026-06-25T00:00:00.000Z'
}

export function normalizeVoiceProfile(raw: unknown, fallback: VoiceProfile = DEFAULT_BROWSER_VOICE_PROFILE): VoiceProfile {
  const source = isRecord(raw) ? raw : {}
  const emotions = isRecord(source.emotion_defaults) ? source.emotion_defaults : {}
  const style =
    source.style === 'neutral_system' || source.style === 'custom' || source.style === 'calm_first_person'
      ? source.style
      : fallback.style
  const sourceKind =
    source.source === 'browser_voice_list' || source.source === 'runtime_config' || source.source === 'fallback_default'
      ? source.source
      : fallback.source

  return {
    schema: VOICE_PROFILE_SCHEMA,
    profile_id: stableVoiceId(pickString(source.profile_id, fallback.profile_id)) || fallback.profile_id,
    display_name: pickString(source.display_name, fallback.display_name),
    enabled: pickBoolean(source.enabled, fallback.enabled),
    status: normalizeVoiceProfileStatus(source.status, fallback.status),
    adapter_id: pickString(source.adapter_id, fallback.adapter_id),
    voice_id: pickString(source.voice_id, fallback.voice_id),
    locale: pickString(source.locale, fallback.locale),
    style,
    speed: pickNumberInRange(source.speed, fallback.speed, 0.4, 2),
    pitch: pickNumberInRange(source.pitch, fallback.pitch, 0, 2),
    volume: pickNumberInRange(source.volume, fallback.volume, 0, 1),
    emotion_defaults: {
      neutral: normalizeVoiceEmotionPreset(emotions.neutral, fallback.emotion_defaults.neutral),
      warn: normalizeVoiceEmotionPreset(emotions.warn, fallback.emotion_defaults.warn),
      blocked: normalizeVoiceEmotionPreset(emotions.blocked, fallback.emotion_defaults.blocked)
    },
    clone_profile_id: pickNullableString(source.clone_profile_id, fallback.clone_profile_id),
    fallback_profile_id: pickNullableString(source.fallback_profile_id, fallback.fallback_profile_id),
    source: sourceKind,
    updated_at: pickString(source.updated_at, fallback.updated_at)
  }
}

export function buildBrowserVoiceProfiles(
  voices: BrowserSpeechSynthesisVoiceLike[],
  generatedAt = new Date().toISOString()
): VoiceProfile[] {
  const mapped = voices
    .filter((voice) => voice && (voice.name || voice.voiceURI))
    .map((voice, index): VoiceProfile => {
      const name = pickString(voice.name, `Browser voice ${index + 1}`)
      const locale = pickString(voice.lang, 'und')
      const voiceId = pickString(voice.voiceURI, name)
      const normalizedId = stableVoiceId(`${locale}.${voiceId}`) || `browser_voice_${index + 1}`
      return normalizeVoiceProfile(
        {
          profile_id: `voice.browser.${normalizedId}`,
          display_name: `${name}${locale !== 'und' ? ` (${locale})` : ''}`,
          enabled: true,
          status: 'ready',
          adapter_id: 'browser_speech_synthesis',
          voice_id: voiceId,
          locale,
          speed: 1,
          pitch: 1,
          volume: 1,
          clone_profile_id: null,
          fallback_profile_id: DEFAULT_BROWSER_VOICE_PROFILE.profile_id,
          source: 'browser_voice_list',
          updated_at: generatedAt
        },
        DEFAULT_BROWSER_VOICE_PROFILE
      )
    })

  return mapped.length > 0 ? mapped : [normalizeVoiceProfile(DEFAULT_BROWSER_VOICE_PROFILE)]
}

export function selectVoiceProfileFallback(
  profiles: VoiceProfile[],
  selectedProfileId: string | undefined,
  fallback: VoiceProfile = DEFAULT_BROWSER_VOICE_PROFILE
): VoiceProfile {
  const enabledProfiles = profiles.filter((profile) => profile.enabled && profile.status !== 'disabled')
  const selected = enabledProfiles.find((profile) => profile.profile_id === selectedProfileId)
  return selected ?? enabledProfiles[0] ?? fallback
}
