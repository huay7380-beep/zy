import {
  VOICE_SCRIPT_PATCH_SCHEMA,
  type ModuleStatusEventSeverity,
  type VoiceEventEmotionHint,
  type VoiceEventPlayMode,
  type VoiceScriptPatch
} from './status-events'

export interface ShortestVoicePathInput {
  eventBroadcastVoice?: string
  finalVoice?: string
  streamedVoicePrefix?: string
  maxChars?: number
  minNewChars?: number
}

export interface ShortestVoicePathResult {
  text: string
  event_voice_used: boolean
  final_voice_used: boolean
  final_voice_redundant: boolean
  remaining_voice: string
  reason: 'event_only' | 'final_only' | 'event_and_final' | 'stream_already_covered' | 'empty'
}

export interface ModuleFeedbackVoiceInsertInput {
  moduleLabel: string
  previousFocusLabel?: string
  newStatus: string
  severity: ModuleStatusEventSeverity
  userRelevance: 'direct' | 'related' | 'background'
  playMode?: VoiceEventPlayMode
  generatedAt?: string
}

function compactVoiceWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateVoiceLine(value: string, maxLength: number): string {
  const normalized = compactVoiceWhitespace(value)
  if (normalized.length <= maxLength) return normalized
  const firstSentenceMatch = normalized.match(/^(.+?[\u3002\uff01\uff1f!?])\s*/)
  const firstSentence = firstSentenceMatch?.[1]?.trim()
  if (firstSentence && firstSentence.length <= Math.max(maxLength * 2, 120)) return firstSentence
  const clipped = normalized.slice(0, maxLength)
  const boundaryIndexes = ['\u3002', '\uff01', '\uff1f', '\uff1b', ';', '\uff0c', ',', '\u3001']
    .map((mark) => clipped.lastIndexOf(mark))
    .filter((index) => index >= Math.max(8, Math.floor(maxLength * 0.45)))
  const boundary = boundaryIndexes.length > 0 ? Math.max(...boundaryIndexes) : -1
  if (boundary >= 0) {
    const boundaryText = compactVoiceWhitespace(clipped.slice(0, boundary + 1))
    return /[\u3002\uff01\uff1f!?]$/.test(boundaryText)
      ? boundaryText
      : `${boundaryText.replace(/[\uff0c,\uff1b;\u3001\s]+$/, '')}\u3002`
  }
  const safe = compactVoiceWhitespace(clipped.replace(/[\uff0c,\uff1b;\u3001\s]+$/, ''))
  return safe ? `${safe}\u3002` : ''
}
function normalizeVoiceOverlapText(value: string): string {
  return compactVoiceWhitespace(value)
    .replace(/[\s,，。.!！?？:：;；'"“”‘’~\-—_、/\\()[\]{}]/g, '')
    .toLowerCase()
}

function stripAlreadySpokenPrefix(value: string, spokenPrefix: string): string {
  const normalized = compactVoiceWhitespace(value)
  const spoken = compactVoiceWhitespace(spokenPrefix)
  if (!normalized || !spoken) return normalized
  if (normalized.startsWith(spoken)) return compactVoiceWhitespace(normalized.slice(spoken.length))
  const normalizedComparable = normalizeVoiceOverlapText(normalized)
  const spokenComparable = normalizeVoiceOverlapText(spoken)
  if (normalizedComparable.startsWith(spokenComparable)) {
    return ''
  }
  return normalized
}

function firstCompleteClause(value: string): string {
  const normalized = compactVoiceWhitespace(value)
  const match = normalized.match(/^(.+?[。！？!?])\s*/)
  return match?.[1]?.trim() || normalized
}

function isGenericProcessNarration(value: string): boolean {
  const normalized = normalizeVoiceOverlapText(value)
  return [
    '我先回答你这句话本身',
    '再补充和当前系统状态有关',
    '我先不进入固定巡检流程',
    '等你确认后再继续'
  ].some((pattern) => normalized.includes(normalizeVoiceOverlapText(pattern)))
}

function hasVoiceIntentOverlap(finalVoice: string, streamedVoicePrefix: string): boolean {
  const finalComparable = normalizeVoiceOverlapText(finalVoice)
  const streamedComparable = normalizeVoiceOverlapText(streamedVoicePrefix)
  if (!finalComparable || !streamedComparable) return false
  const bothMentionVoice = finalComparable.includes('语音') && streamedComparable.includes('语音')
  const bothMentionIntent =
    ['意图', '草案', '转成', '听清', '听懂'].some((word) => finalComparable.includes(word)) &&
    ['意图', '草案', '转成', '听清', '听懂'].some((word) => streamedComparable.includes(word))
  return bothMentionVoice && bothMentionIntent
}

function extractContrastOrBoundaryClause(value: string): string {
  const normalized = compactVoiceWhitespace(value)
  const candidates = ['；但', ';但', '。但', '，但', ',但', ' 但', '不过', '只是', '当前阶段']
    .map((marker) => {
      const index = normalized.indexOf(marker)
      if (index < 0) return undefined
      return {
        index,
        marker,
        start: marker.endsWith('但') && marker.length > 1 ? index + marker.length - 1 : index
      }
    })
    .filter((item): item is { index: number; marker: string; start: number } => Boolean(item))
    .sort((left, right) => left.index - right.index)
  const candidate = candidates[0]
  if (!candidate) return ''
  const tail = compactVoiceWhitespace(normalized.slice(candidate.start))
  const clause = firstCompleteClause(tail)
  if (!clause) return ''
  return /[。！？!?]$/.test(clause) ? clause : `${clause.replace(/[，,；;、]\s*$/, '')}。`
}

function buildRemainingFinalVoice(finalVoice: string, streamedVoicePrefix: string): string {
  const remaining = stripAlreadySpokenPrefix(finalVoice, streamedVoicePrefix)
  if (!remaining || !streamedVoicePrefix) return remaining
  if (isGenericProcessNarration(remaining)) return ''
  if (hasVoiceIntentOverlap(remaining, streamedVoicePrefix)) {
    return extractContrastOrBoundaryClause(remaining)
  }
  return remaining
}

function characterOverlapRatio(candidate: string, spoken: string): number {
  const candidateChars = Array.from(normalizeVoiceOverlapText(candidate))
  const spokenChars = new Set(Array.from(normalizeVoiceOverlapText(spoken)))
  if (candidateChars.length === 0 || spokenChars.size === 0) return 0
  const overlapCount = candidateChars.filter((char) => spokenChars.has(char)).length
  return overlapCount / candidateChars.length
}

export function isVoiceLineRedundantWithSpoken(candidate: string, spoken: string, minNewChars = 8): boolean {
  const candidateComparable = normalizeVoiceOverlapText(candidate)
  const spokenComparable = normalizeVoiceOverlapText(spoken)
  if (!candidateComparable) return true
  if (!spokenComparable) return false
  if (candidateComparable === spokenComparable) return true
  if (spokenComparable.includes(candidateComparable)) return true
  if (candidateComparable.includes(spokenComparable) && candidateComparable.length - spokenComparable.length < minNewChars) {
    return true
  }
  return characterOverlapRatio(candidateComparable, spokenComparable) >= 0.82 && candidateComparable.length < 24
}

export function buildShortestNecessaryPostStreamVoice(input: ShortestVoicePathInput): ShortestVoicePathResult {
  const maxChars = input.maxChars ?? 44
  const minNewChars = input.minNewChars ?? 8
  const streamedVoicePrefix = compactVoiceWhitespace(input.streamedVoicePrefix ?? '')
  const eventVoice = compactVoiceWhitespace(input.eventBroadcastVoice ?? '')
  const finalVoice = compactVoiceWhitespace(input.finalVoice ?? '')
  const eventVoiceUsed = Boolean(eventVoice) && !isVoiceLineRedundantWithSpoken(eventVoice, streamedVoicePrefix, minNewChars)
  const remainingVoice = buildRemainingFinalVoice(finalVoice, streamedVoicePrefix)
  const finalVoiceRedundant =
    !remainingVoice ||
    normalizeVoiceOverlapText(remainingVoice).length < minNewChars ||
    isVoiceLineRedundantWithSpoken(remainingVoice, streamedVoicePrefix, minNewChars)
  const finalVoiceUsed = Boolean(remainingVoice) && !finalVoiceRedundant
  const text = truncateVoiceLine(
    compactVoiceWhitespace(`${eventVoiceUsed ? eventVoice : ''} ${finalVoiceUsed ? remainingVoice : ''}`),
    maxChars
  )

  return {
    text,
    event_voice_used: eventVoiceUsed,
    final_voice_used: finalVoiceUsed,
    final_voice_redundant: finalVoiceRedundant,
    remaining_voice: remainingVoice,
    reason: text
      ? eventVoiceUsed && finalVoiceUsed
        ? 'event_and_final'
        : eventVoiceUsed
          ? 'event_only'
          : 'final_only'
      : finalVoice || eventVoice
        ? 'stream_already_covered'
        : 'empty'
  }
}

function deriveSimulatedPlayMode(input: ModuleFeedbackVoiceInsertInput): VoiceEventPlayMode {
  if (input.playMode) return input.playMode
  if (input.severity === 'critical' || input.severity === 'blocked') return 'interrupt_now'
  if (input.userRelevance === 'direct') return 'after_current_sentence'
  if (input.userRelevance === 'related') return 'merge_into_current_reply'
  return 'idle_reminder'
}

function emotionForSeverity(severity: ModuleStatusEventSeverity): VoiceEventEmotionHint {
  if (severity === 'critical' || severity === 'blocked') return 'urgent'
  if (severity === 'warn') return 'focused'
  if (severity === 'notice') return 'warm'
  return 'steady'
}

export function buildNaturalModuleFeedbackInsertVoice(input: ModuleFeedbackVoiceInsertInput): string {
  const moduleLabel = compactVoiceWhitespace(input.moduleLabel || '相关模块')
  const previousFocus = compactVoiceWhitespace(input.previousFocusLabel || moduleLabel)
  const status = compactVoiceWhitespace(input.newStatus || '有状态更新')
  if (input.severity === 'critical' || input.severity === 'blocked') {
    return truncateVoiceLine(`先提醒你，${moduleLabel}现在是${status}，这和你之前关注的${previousFocus}有关。`, 54)
  }
  if (input.userRelevance === 'direct') {
    return truncateVoiceLine(`${moduleLabel}刚更新，当前是${status}，我把它接到你刚才问的进度里。`, 54)
  }
  if (input.userRelevance === 'related') {
    return truncateVoiceLine(`你之前关注的${previousFocus}有更新，${moduleLabel}现在是${status}。`, 54)
  }
  return truncateVoiceLine(`补充一条状态，${moduleLabel}现在是${status}。`, 42)
}

export function buildSimulatedModuleFeedbackVoicePatch(input: ModuleFeedbackVoiceInsertInput): VoiceScriptPatch {
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const playMode = deriveSimulatedPlayMode(input)
  const voiceText = buildNaturalModuleFeedbackInsertVoice(input)
  const bridgeLine =
    playMode === 'interrupt_now'
      ? '先提醒你。'
      : playMode === 'after_current_sentence'
        ? '接着补一句。'
        : playMode === 'idle_reminder'
          ? '空档提醒。'
          : '顺手合并。'
  return {
    schema: VOICE_SCRIPT_PATCH_SCHEMA,
    patch_id: `vsp_sim_${generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}_${normalizeVoiceOverlapText(input.moduleLabel).slice(0, 24) || 'module'}`,
    source_request_id: `sim_module_feedback_${normalizeVoiceOverlapText(input.moduleLabel).slice(0, 32) || 'module'}`,
    play_mode: playMode,
    bridge_line: bridgeLine,
    voice_text: voiceText,
    resume_line: playMode === 'interrupt_now' ? '我说完这条提醒后继续刚才的内容。' : '',
    emotion_hint: emotionForSeverity(input.severity),
    voice_profile_lock: true,
    max_sentences: input.severity === 'critical' || input.severity === 'blocked' ? 2 : 1
  }
}
