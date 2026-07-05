import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { AIClient } from '../ai-client'

const DEFAULT_VLM_MODEL = 'doubao-seed-2-0-lite-260215'
const DEFAULT_VLM_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

const GENERIC_WECHAT_TITLES = new Set(['微信', 'WeChat', 'Weixin', 'wechat', 'weixin', '寰俊'])
const VALID_SOURCE_ACTOR_TYPES = new Set([
  'human_contact',
  'official_account',
  'service_account',
  'group_chat',
  'system_notification',
  'unknown'
])
const VALID_SPEAKERS = new Set(['user', 'counterparty', 'system', 'unknown'])
const VALID_SIDES = new Set(['left', 'right', 'center', 'unknown'])

export type StructuredChatMessage = {
  message_id: string
  speaker: 'user' | 'counterparty' | 'system' | 'unknown'
  speaker_display_name: string | null
  side: 'left' | 'right' | 'center' | 'unknown'
  time_text: string | null
  message_type: string
  text: string
  confidence: number
}

export type SightflowVlmStructuredIntakeResult = {
  schema_version: 'sightflow_vlm_structured_chat_intake.v1'
  engine: 'sightflow_vlm'
  model: string
  base_url: string
  succeeded: boolean
  error?: string
  language: string | null
  conversation_title: string | null
  target_display_name: string | null
  source_actor_type:
    | 'human_contact'
    | 'official_account'
    | 'service_account'
    | 'group_chat'
    | 'system_notification'
    | 'unknown'
  messages: StructuredChatMessage[]
  latest_message: StructuredChatMessage | null
  content_text: string | null
  content_summary: string
  participants_hint: string[]
  source_identity_hints: Array<Record<string, unknown>>
  thread_hint: Record<string, unknown>
  confidence: number
  requires_user_review: boolean
  ui_noise_removed: string[]
  extraction_warnings: string[]
  raw_response_artifact_ref?: string
  structured_artifact_ref?: string
}

function clampConfidence(value: unknown, fallback = 0.5): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Number(Math.max(0, Math.min(1, numeric)).toFixed(3))
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeNullableText(value: unknown): string | null {
  const text = normalizeText(value)
  return text ? text : null
}

function stripLikelyJsonFence(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function extractJsonObject(value: string): Record<string, any> {
  const stripped = stripLikelyJsonFence(value)
  try {
    return JSON.parse(stripped)
  } catch {
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('VLM response did not contain a JSON object')
    return JSON.parse(stripped.slice(start, end + 1))
  }
}

function normalizeSourceActorType(value: unknown): SightflowVlmStructuredIntakeResult['source_actor_type'] {
  const normalized = normalizeText(value) as SightflowVlmStructuredIntakeResult['source_actor_type']
  return VALID_SOURCE_ACTOR_TYPES.has(normalized) ? normalized : 'unknown'
}

function normalizeSpeaker(value: unknown): StructuredChatMessage['speaker'] {
  const normalized = normalizeText(value) as StructuredChatMessage['speaker']
  return VALID_SPEAKERS.has(normalized) ? normalized : 'unknown'
}

function normalizeSide(value: unknown): StructuredChatMessage['side'] {
  const normalized = normalizeText(value) as StructuredChatMessage['side']
  return VALID_SIDES.has(normalized) ? normalized : 'unknown'
}

function normalizeDisplayName(value: unknown): string | null {
  const text = normalizeNullableText(value)
  if (!text) return null
  if (GENERIC_WECHAT_TITLES.has(text)) return null
  if (text.length > 40) return null
  return text
}

function normalizeMessages(rawMessages: unknown[]): StructuredChatMessage[] {
  return rawMessages
    .map((raw, index) => {
      const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
      const text = normalizeText(item.text)
      if (!text) return null
      return {
        message_id: normalizeText(item.message_id) || `visible_message_${String(index + 1).padStart(2, '0')}`,
        speaker: normalizeSpeaker(item.speaker),
        speaker_display_name: normalizeNullableText(item.speaker_display_name),
        side: normalizeSide(item.side),
        time_text: normalizeNullableText(item.time_text),
        message_type: normalizeText(item.message_type) || 'text',
        text,
        confidence: clampConfidence(item.confidence, 0.68)
      }
    })
    .filter((item): item is StructuredChatMessage => Boolean(item))
}

function messageSpeakerLabel(message: StructuredChatMessage, targetDisplayName: string | null): string {
  if (message.speaker === 'user') return 'user'
  if (message.speaker === 'counterparty') return targetDisplayName ?? message.speaker_display_name ?? 'counterparty'
  if (message.speaker === 'system') return 'system'
  return message.speaker_display_name ?? 'unknown'
}

function buildContentText({
  targetDisplayName,
  conversationTitle,
  messages
}: {
  targetDisplayName: string | null
  conversationTitle: string | null
  messages: StructuredChatMessage[]
}): string | null {
  if (!targetDisplayName && messages.length === 0) return null
  const lines = [
    'VLM_STRUCTURED_CHAT_CAPTURE',
    `target_display_name: ${targetDisplayName ?? 'unknown'}`,
    `conversation_title: ${conversationTitle ?? targetDisplayName ?? 'unknown'}`,
    'messages:',
    ...messages.map((message) => {
      const time = message.time_text ? `[${message.time_text}] ` : ''
      const speaker = messageSpeakerLabel(message, targetDisplayName)
      return `- ${time}${speaker}: ${message.text}`
    })
  ]
  return `${lines.join('\n')}\n`
}

function buildPrompt(): string {
  return `你是 Sightflow 桌面端微信截图识别模块。请从截图中提取“当前打开的聊天窗口”的结构化信息。

只读取右侧当前会话区和它的顶部标题。忽略左侧会话列表、搜索框、系统任务栏、天气、时间、公众号推荐、广告、输入法和其他 UI 噪声。

识别规则：
1. 微信 PC 中，右侧气泡通常是 user 发送，左侧气泡通常是 counterparty 发送，中间灰色提示通常是 system。
2. 如果是群聊，source_actor_type 输出 group_chat，并尽量保留 speaker_display_name。
3. 如果是公众号、服务号或系统通知，source_actor_type 分别输出 official_account、service_account 或 system_notification。
4. 不要编造不可见内容；看不清就使用 null、unknown 或空数组。
5. 输出必须是一个 JSON 对象，不要 Markdown，不要解释。

JSON schema:
{
  "schema_version": "sightflow_vlm_structured_chat_intake.v1",
  "platform": "wechat",
  "conversation_title": "顶部会话标题或 null",
  "target_display_name": "一对一联系人名；群聊时为群名；未知为 null",
  "source_actor_type": "human_contact | official_account | service_account | group_chat | system_notification | unknown",
  "messages": [
    {
      "message_id": "visible_message_01",
      "speaker": "user | counterparty | system | unknown",
      "speaker_display_name": "群聊说话人或 null",
      "side": "left | right | center | unknown",
      "time_text": "截图中可见时间或 null",
      "message_type": "text | image | voice | file | system | unknown",
      "text": "可见消息文字；非文本消息用简短描述",
      "confidence": 0.0
    }
  ],
  "latest_message_id": "最后一条可见消息 id 或 null",
  "ui_noise_removed": ["被忽略的 UI 噪声类型"],
  "confidence": 0.0,
  "requires_user_review": true,
  "extraction_warnings": []
}`
}

function buildResultFromParsed({
  parsed,
  fallbackWindowTitle,
  model,
  baseURL,
  rawResponseArtifactRef,
  structuredArtifactRef
}: {
  parsed: Record<string, any>
  fallbackWindowTitle: string | null
  model: string
  baseURL: string
  rawResponseArtifactRef?: string
  structuredArtifactRef?: string
}): SightflowVlmStructuredIntakeResult {
  const messages = normalizeMessages(Array.isArray(parsed.messages) ? parsed.messages : [])
  const conversationTitle = normalizeDisplayName(parsed.conversation_title)
    ?? normalizeDisplayName(parsed.target_display_name)
    ?? normalizeDisplayName(fallbackWindowTitle)
  const targetDisplayName = normalizeDisplayName(parsed.target_display_name)
    ?? conversationTitle
  const sourceActorType = normalizeSourceActorType(parsed.source_actor_type)
  const latestMessageId = normalizeNullableText(parsed.latest_message_id)
  const latestMessage = messages.find((message) => message.message_id === latestMessageId)
    ?? messages.at(-1)
    ?? null
  const participantsHint = targetDisplayName
    ? ['user', targetDisplayName]
    : ['user', 'unknown_counterparty']
  const threadKey = targetDisplayName ? `wechat:${targetDisplayName}` : null
  const contentText = buildContentText({ targetDisplayName, conversationTitle, messages })
  const confidence = clampConfidence(parsed.confidence, messages.length ? 0.76 : targetDisplayName ? 0.62 : 0.45)
  const sourceIdentityHints = targetDisplayName
    ? [
        {
          identity_type: 'thread_display_name',
          source_actor_type: sourceActorType,
          display_name: targetDisplayName,
          thread_key: threadKey,
          evidence_ref: structuredArtifactRef,
          confidence: Number(Math.min(0.88, confidence).toFixed(3))
        }
      ]
    : []
  const threadHint: Record<string, unknown> = {
    channel: 'wechat',
    conversation_title: conversationTitle ?? fallbackWindowTitle,
    target_display_name: targetDisplayName,
    thread_source: 'sightflow_vlm_structured_chat_intake'
  }
  if (threadKey) threadHint.thread_key = threadKey

  return {
    schema_version: 'sightflow_vlm_structured_chat_intake.v1',
    engine: 'sightflow_vlm',
    model,
    base_url: baseURL,
    succeeded: true,
    language: 'zh-CN',
    conversation_title: conversationTitle,
    target_display_name: targetDisplayName,
    source_actor_type: sourceActorType,
    messages,
    latest_message: latestMessage,
    content_text: contentText,
    content_summary: `Sightflow VLM structured WeChat capture detected ${targetDisplayName ? `current target ${targetDisplayName}` : 'an unresolved current conversation'} with ${messages.length} visible message(s). Latest visible speaker: ${latestMessage?.speaker ?? 'unknown'}. User review is still required before identity, relationship or send confirmation.`,
    participants_hint: participantsHint,
    source_identity_hints: sourceIdentityHints,
    thread_hint: threadHint,
    confidence,
    requires_user_review: parsed.requires_user_review !== false,
    ui_noise_removed: Array.isArray(parsed.ui_noise_removed)
      ? parsed.ui_noise_removed.map(normalizeText).filter(Boolean)
      : [],
    extraction_warnings: Array.isArray(parsed.extraction_warnings)
      ? parsed.extraction_warnings.map(normalizeText).filter(Boolean)
      : [],
    raw_response_artifact_ref: rawResponseArtifactRef,
    structured_artifact_ref: structuredArtifactRef
  }
}

function buildFailedResult({
  error,
  model,
  baseURL
}: {
  error: string
  model: string
  baseURL: string
}): SightflowVlmStructuredIntakeResult {
  return {
    schema_version: 'sightflow_vlm_structured_chat_intake.v1',
    engine: 'sightflow_vlm',
    model,
    base_url: baseURL,
    succeeded: false,
    error,
    language: null,
    conversation_title: null,
    target_display_name: null,
    source_actor_type: 'unknown',
    messages: [],
    latest_message: null,
    content_text: null,
    content_summary: `Sightflow VLM structured extraction failed: ${error}`,
    participants_hint: ['user', 'unknown_counterparty'],
    source_identity_hints: [],
    thread_hint: {
      channel: 'wechat',
      conversation_title: null,
      target_display_name: null,
      thread_source: 'sightflow_vlm_structured_chat_intake_failed'
    },
    confidence: 0.2,
    requires_user_review: true,
    ui_noise_removed: [],
    extraction_warnings: [error]
  }
}

export async function runSightflowVlmStructuredIntakeExtraction({
  screenshotBase64,
  outputDir,
  apiKey,
  model = DEFAULT_VLM_MODEL,
  baseURL = DEFAULT_VLM_BASE_URL,
  fallbackWindowTitle = null
}: {
  screenshotBase64: string
  outputDir: string
  apiKey: string | null | undefined
  model?: string
  baseURL?: string
  fallbackWindowTitle?: string | null
}): Promise<SightflowVlmStructuredIntakeResult> {
  const normalizedApiKey = normalizeText(apiKey)
  if (!normalizedApiKey) {
    return buildFailedResult({
      error: 'vision_api_key_missing',
      model,
      baseURL
    })
  }

  try {
    const client = new AIClient({ apiKey: normalizedApiKey, model, baseURL })
    const rawResponse = await client.detectVision(buildPrompt(), screenshotBase64)
    const parsed = extractJsonObject(rawResponse)
    const vlmDir = path.join(outputDir, 'vlm-structured')
    mkdirSync(vlmDir, { recursive: true })
    const rawResponseArtifactRef = path.join(vlmDir, 'response.raw.txt')
    const structuredArtifactRef = path.join(vlmDir, 'structured-chat.json')
    writeFileSync(rawResponseArtifactRef, rawResponse, 'utf8')
    const result = buildResultFromParsed({
      parsed,
      fallbackWindowTitle,
      model,
      baseURL,
      rawResponseArtifactRef,
      structuredArtifactRef
    })
    writeFileSync(structuredArtifactRef, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    return result
  } catch (error: any) {
    return buildFailedResult({
      error: error?.message || String(error),
      model,
      baseURL
    })
  }
}
