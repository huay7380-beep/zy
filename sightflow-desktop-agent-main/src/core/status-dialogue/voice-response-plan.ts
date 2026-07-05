import type { StatusDialogueOutput } from './contracts'
import {
  DEFAULT_BROWSER_VOICE_PROFILE,
  DEFAULT_TEXT_ONLY_VOICE_PROFILE,
  type VoiceEmotionPreset,
  type VoiceProfile
} from './voice-profile'

export const VOICE_RESPONSE_PLAN_SCHEMA = 'voice_response_plan.v1'
export const VOICE_OUTPUT_TRACE_SCHEMA = 'voice_output_trace.v1'
export const VOICE_TONE_PARAMETERS_SCHEMA = 'voice_tone_parameters.v1'

export interface VoiceResponsePlan {
  schema: typeof VOICE_RESPONSE_PLAN_SCHEMA
  text: string
  voice_profile_id: string
  clone_profile_id: string | null
  emotion_hint: VoiceEmotionPreset
  speed: number
  pitch: number
  volume: number
  fallback_allowed: boolean
  source_output_id: string
}

export interface VoiceToneParameters {
  schema: typeof VOICE_TONE_PARAMETERS_SCHEMA
  emotion_hint: VoiceEmotionPreset
  speed: number
  pitch: number
  volume: number
  same_voice_profile: true
  reason: string
}

export interface VoiceOutputTrace {
  schema: typeof VOICE_OUTPUT_TRACE_SCHEMA
  trace_id: string
  generated_at: string
  source_output_id: string
  voice_profile_id: string
  clone_profile_id: string | null
  adapter_id: string
  status: 'ready' | 'spoken' | 'fallback' | 'skipped' | 'error'
  fallback_used: boolean
  latency_ms?: number
  error_summary?: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

function buildTraceId(sourceOutputId: string, generatedAt = new Date().toISOString()): string {
  return `voice_trace_${sourceOutputId}_${generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}`
}

export function buildVoiceToneParameters({
  voiceProfile,
  emotionHint
}: {
  voiceProfile: VoiceProfile
  emotionHint: VoiceEmotionPreset
}): VoiceToneParameters {
  const baseSpeed = clamp(voiceProfile.speed, 0.4, 2)
  const basePitch = clamp(voiceProfile.pitch, 0, 2)
  const baseVolume = clamp(voiceProfile.volume, 0, 1)
  const toneByEmotion: Record<VoiceEmotionPreset, { speed: number; pitch: number; volume: number; reason: string }> = {
    calm: {
      speed: 0.96,
      pitch: 0.99,
      volume: 0.92,
      reason: 'calm_voice_keeps_idle_dialogue_soft'
    },
    focused: {
      speed: 1.03,
      pitch: 0.98,
      volume: 0.98,
      reason: 'focused_voice_keeps_patrol_and_task_supervision_crisp'
    },
    warm: {
      speed: 0.98,
      pitch: 1.02,
      volume: 0.95,
      reason: 'warm_voice_keeps_completion_and_casual_chat_natural'
    },
    urgent: {
      speed: 1.08,
      pitch: 1.01,
      volume: 1,
      reason: 'urgent_voice_marks_blocked_or_error_state_without_changing_voice_profile'
    },
    reflective: {
      speed: 0.92,
      pitch: 0.96,
      volume: 0.92,
      reason: 'reflective_voice_slows_down_for_boundary_or_blocked_review'
    },
    steady: {
      speed: 1,
      pitch: 1,
      volume: 0.96,
      reason: 'steady_voice_keeps_normal_patrol_even'
    }
  }
  const tone = toneByEmotion[emotionHint] ?? toneByEmotion.steady
  return {
    schema: VOICE_TONE_PARAMETERS_SCHEMA,
    emotion_hint: emotionHint,
    speed: clamp(baseSpeed * tone.speed, 0.4, 2),
    pitch: clamp(basePitch * tone.pitch, 0, 2),
    volume: clamp(baseVolume * tone.volume, 0, 1),
    same_voice_profile: true,
    reason: tone.reason
  }
}

export function applyVoiceToneToPlan({
  plan,
  voiceProfile,
  emotionHint
}: {
  plan: VoiceResponsePlan
  voiceProfile: VoiceProfile
  emotionHint?: VoiceEmotionPreset
}): VoiceResponsePlan {
  const tone = buildVoiceToneParameters({
    voiceProfile,
    emotionHint: emotionHint ?? plan.emotion_hint
  })
  return {
    ...plan,
    emotion_hint: tone.emotion_hint,
    voice_profile_id: voiceProfile.profile_id,
    clone_profile_id: voiceProfile.clone_profile_id,
    speed: tone.speed,
    pitch: tone.pitch,
    volume: tone.volume
  }
}

export function buildVoiceResponsePlan({
  output,
  sourceOutputId,
  voiceProfile = DEFAULT_BROWSER_VOICE_PROFILE
}: {
  output: StatusDialogueOutput
  sourceOutputId: string
  voiceProfile?: VoiceProfile
}): VoiceResponsePlan {
  const status = output.mode === 'patrol_only' ? 'neutral' : 'warn'
  const emotion = output.error
    ? voiceProfile.emotion_defaults.warn
    : status === 'neutral'
      ? voiceProfile.emotion_defaults.neutral
      : voiceProfile.emotion_defaults.warn
  const text = (output.voiceText || output.reply || '').replace(/\s+/g, ' ').trim()

  return {
    schema: VOICE_RESPONSE_PLAN_SCHEMA,
    text,
    voice_profile_id: voiceProfile.profile_id,
    clone_profile_id: voiceProfile.clone_profile_id,
    emotion_hint: emotion,
    speed: clamp(voiceProfile.speed, 0.4, 2),
    pitch: clamp(voiceProfile.pitch, 0, 2),
    volume: clamp(voiceProfile.volume, 0, 1),
    fallback_allowed: true,
    source_output_id: sourceOutputId
  }
}

export function buildVoiceOutputTrace({
  plan,
  voiceProfile = DEFAULT_BROWSER_VOICE_PROFILE,
  status,
  latencyMs,
  errorSummary
}: {
  plan: VoiceResponsePlan
  voiceProfile?: VoiceProfile
  status: VoiceOutputTrace['status']
  latencyMs?: number
  errorSummary?: string
}): VoiceOutputTrace {
  const fallbackUsed =
    status === 'fallback' ||
    status === 'skipped' ||
    voiceProfile.profile_id === DEFAULT_TEXT_ONLY_VOICE_PROFILE.profile_id ||
    voiceProfile.status === 'fallback'

  return {
    schema: VOICE_OUTPUT_TRACE_SCHEMA,
    trace_id: buildTraceId(plan.source_output_id),
    generated_at: new Date().toISOString(),
    source_output_id: plan.source_output_id,
    voice_profile_id: plan.voice_profile_id,
    clone_profile_id: plan.clone_profile_id,
    adapter_id: voiceProfile.adapter_id,
    status,
    fallback_used: fallbackUsed,
    latency_ms: latencyMs,
    error_summary: errorSummary
  }
}
