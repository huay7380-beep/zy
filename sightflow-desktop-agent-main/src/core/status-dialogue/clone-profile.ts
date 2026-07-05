export const CLONE_PROFILE_SCHEMA = 'clone_profile.v1'

export type CloneProfileStatus = 'not_configured' | 'sample_required' | 'ready' | 'error'

export interface CloneProfile {
  schema: typeof CLONE_PROFILE_SCHEMA
  clone_profile_id: string
  display_name: string
  provider: string
  status: CloneProfileStatus
  consent_status: 'not_required' | 'user_owned_or_authorized' | 'unknown'
  locale: string
  sample_refs: string[]
  embedding_ref: string | null
  speaker_id: string | null
  quality: {
    naturalness: 'unknown' | 'low' | 'medium' | 'high'
    similarity: 'unknown' | 'low' | 'medium' | 'high'
    latency: 'unknown' | 'low' | 'medium' | 'high'
  }
  boundaries: {
    raw_audio_stored_by_app: boolean
    requires_explicit_user_action: boolean
  }
  created_at: string
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

function pickStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : []
}

function normalizeCloneStatus(value: unknown, fallback: CloneProfileStatus): CloneProfileStatus {
  return value === 'not_configured' || value === 'sample_required' || value === 'ready' || value === 'error'
    ? value
    : fallback
}

function normalizeQuality(value: unknown, fallback: 'unknown' | 'low' | 'medium' | 'high') {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'unknown' ? value : fallback
}

export const DEFAULT_UNCONFIGURED_CLONE_PROFILE: CloneProfile = {
  schema: CLONE_PROFILE_SCHEMA,
  clone_profile_id: 'clone.unconfigured',
  display_name: 'Clone voice not configured',
  provider: 'none',
  status: 'not_configured',
  consent_status: 'not_required',
  locale: 'zh-CN',
  sample_refs: [],
  embedding_ref: null,
  speaker_id: null,
  quality: {
    naturalness: 'unknown',
    similarity: 'unknown',
    latency: 'unknown'
  },
  boundaries: {
    raw_audio_stored_by_app: false,
    requires_explicit_user_action: true
  },
  created_at: '2026-06-25T00:00:00.000Z',
  updated_at: '2026-06-25T00:00:00.000Z'
}

export function normalizeCloneProfile(
  raw: unknown,
  fallback: CloneProfile = DEFAULT_UNCONFIGURED_CLONE_PROFILE
): CloneProfile {
  const source = isRecord(raw) ? raw : {}
  const quality = isRecord(source.quality) ? source.quality : {}
  const boundaries = isRecord(source.boundaries) ? source.boundaries : {}
  const consentStatus =
    source.consent_status === 'user_owned_or_authorized' || source.consent_status === 'unknown'
      ? source.consent_status
      : fallback.consent_status

  return {
    schema: CLONE_PROFILE_SCHEMA,
    clone_profile_id: pickString(source.clone_profile_id, fallback.clone_profile_id),
    display_name: pickString(source.display_name, fallback.display_name),
    provider: pickString(source.provider, fallback.provider),
    status: normalizeCloneStatus(source.status, fallback.status),
    consent_status: consentStatus,
    locale: pickString(source.locale, fallback.locale),
    sample_refs: pickStringArray(source.sample_refs),
    embedding_ref: pickNullableString(source.embedding_ref, fallback.embedding_ref),
    speaker_id: pickNullableString(source.speaker_id, fallback.speaker_id),
    quality: {
      naturalness: normalizeQuality(quality.naturalness, fallback.quality.naturalness),
      similarity: normalizeQuality(quality.similarity, fallback.quality.similarity),
      latency: normalizeQuality(quality.latency, fallback.quality.latency)
    },
    boundaries: {
      raw_audio_stored_by_app: boundaries.raw_audio_stored_by_app === true,
      requires_explicit_user_action: boundaries.requires_explicit_user_action !== false
    },
    created_at: pickString(source.created_at, fallback.created_at),
    updated_at: pickString(source.updated_at, fallback.updated_at)
  }
}

export function isCloneProfileReady(profile: CloneProfile): boolean {
  return profile.status === 'ready' && profile.provider !== 'none' && profile.boundaries.raw_audio_stored_by_app === false
}
