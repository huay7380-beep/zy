export const STATUS_DIALOGUE_CONVERSATION_MEMORY_SCHEMA = 'status_dialogue_conversation_memory.v1'
export const STATUS_DIALOGUE_CONVERSATION_MEMORY_STORAGE_KEY = 'zhineng.statusDialogue.conversationMemory.v1'

export interface StatusDialogueConversationMemoryCard {
  schema: typeof STATUS_DIALOGUE_CONVERSATION_MEMORY_SCHEMA
  storage_key: typeof STATUS_DIALOGUE_CONVERSATION_MEMORY_STORAGE_KEY
  active_goal: string
  user_focus: string[]
  current_focus_node: string
  current_focus_status: string
  confirmed_facts: string[]
  open_questions: string[]
  preferred_response: string
  next_expected_result: string
  latest_user_intent: string
  result_summary: string
  status_refs: string[]
  missing_status: string[]
  unspoken_patrol_events: string[]
  boundaries: string[]
  turn_count: number
  updated_at: string
  source: 'local_storage' | 'session_default'
}

export interface ConversationMemoryFocusInput {
  title: string
  status: string
  gate: string
  compass: string
}

export interface ConversationMemoryOutputInput {
  reply?: string
  voiceText?: string
  thoughts?: string[]
  statusRefs?: string[]
  missingStatus?: string[]
  unspokenPatrolEvents?: string[]
  error?: string
}

export interface ConversationMemoryStatusInput {
  cards_fresh: number
  cards_stale: number
  cards_missing: number
  global_status: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function pickNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function pickStringArray(value: unknown, fallback: string[], maxItems: number): string[] {
  if (!Array.isArray(value)) return fallback.slice(0, maxItems)
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .slice(0, maxItems)
}

function compact(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 1))}...` : normalized
}

function mergeUnique(existing: string[], next: string[], maxItems: number): string[] {
  const merged: string[] = []
  for (const item of [...next, ...existing]) {
    const normalized = compact(item, 120)
    if (normalized && !merged.includes(normalized)) merged.push(normalized)
    if (merged.length >= maxItems) break
  }
  return merged
}

function inferActiveGoal(userQuery: string, fallback: string): string {
  const text = userQuery.toLowerCase()
  if (/conversation[_\s-]*memory|上下文|短上下文|记忆|多轮/.test(text)) {
    return '让主体状态对话框具备目标态短上下文记忆'
  }
  if (/tts|stt|语音|音频|麦克风|cosyvoice|voice/.test(text)) {
    return '稳定主体状态对话框的语音输入输出闭环'
  }
  if (/状态|巡逻|节点|进度|模块|status|patrol/.test(text)) {
    return '让主体状态对话框检查系统节点和进度'
  }
  if (/3d|粒子|星云|拓扑|os|可视化/.test(text)) {
    return '让世界系统三维粒子 OS 可追溯地表达对话模块能力'
  }
  return fallback
}

function inferUserFocus(userQuery: string): string[] {
  const text = userQuery.toLowerCase()
  const focus = ['结果优先', '目标优先', '少讲无关过程']
  if (/自然|拟人|第一人称|ai味|对话/.test(text)) focus.push('自然第一人称表达')
  if (/延迟|实时|速度|流畅/.test(text)) focus.push('低延迟流畅闭环')
  if (/状态|巡逻|检查|节点|进度/.test(text)) focus.push('状态巡逻和进度审查')
  if (/3d|粒子|星云|拓扑|可视化/.test(text)) focus.push('3D 可视化可追溯')
  if (/边界|安全|不影响|并行/.test(text)) focus.push('边界清楚且不影响其他线程')
  return focus
}

function summarizeIntent(userQuery: string): string {
  const trimmed = compact(userQuery, 140)
  return trimmed || 'status inspection'
}

function summarizeResult(output?: ConversationMemoryOutputInput): string {
  if (!output) return '等待下一轮对话结果'
  if (output.error) return compact(`本轮回退或失败：${output.error}`, 140)
  return compact(output.voiceText || output.reply || '本轮已完成状态回复', 140)
}

export function buildDefaultStatusDialogueConversationMemory(
  generatedAt = new Date().toISOString()
): StatusDialogueConversationMemoryCard {
  return {
    schema: STATUS_DIALOGUE_CONVERSATION_MEMORY_SCHEMA,
    storage_key: STATUS_DIALOGUE_CONVERSATION_MEMORY_STORAGE_KEY,
    active_goal: '让主体状态对话框成为状态巡逻和目标沟通窗口',
    user_focus: ['结果优先', '目标优先', '少讲无关过程'],
    current_focus_node: 'world-core',
    current_focus_status: 'status-only projection',
    confirmed_facts: ['当前短上下文只保存目标态摘要，不保存完整原始对话'],
    open_questions: ['等待用户下一轮目标或验证反馈'],
    preferred_response: '先给结论，再说明对目标的影响；技术细节只在需要定位问题时展开。',
    next_expected_result: '围绕当前目标继续检查状态、边界和下一步结果',
    latest_user_intent: 'status inspection',
    result_summary: '等待首轮目标态记忆更新',
    status_refs: [],
    missing_status: [],
    unspoken_patrol_events: [],
    boundaries: ['localStorage only', 'no world-model write', 'no raw audio persistence', 'no hidden reasoning storage'],
    turn_count: 0,
    updated_at: generatedAt,
    source: 'session_default'
  }
}

export function normalizeStatusDialogueConversationMemory(raw: unknown): StatusDialogueConversationMemoryCard {
  const fallback = buildDefaultStatusDialogueConversationMemory()
  const source = isRecord(raw) ? raw : {}
  return {
    schema: STATUS_DIALOGUE_CONVERSATION_MEMORY_SCHEMA,
    storage_key: STATUS_DIALOGUE_CONVERSATION_MEMORY_STORAGE_KEY,
    active_goal: compact(pickString(source.active_goal, fallback.active_goal), 140),
    user_focus: pickStringArray(source.user_focus, fallback.user_focus, 8),
    current_focus_node: compact(pickString(source.current_focus_node, fallback.current_focus_node), 120),
    current_focus_status: compact(pickString(source.current_focus_status, fallback.current_focus_status), 120),
    confirmed_facts: pickStringArray(source.confirmed_facts, fallback.confirmed_facts, 8),
    open_questions: pickStringArray(source.open_questions, fallback.open_questions, 6),
    preferred_response: compact(pickString(source.preferred_response, fallback.preferred_response), 180),
    next_expected_result: compact(pickString(source.next_expected_result, fallback.next_expected_result), 160),
    latest_user_intent: compact(pickString(source.latest_user_intent, fallback.latest_user_intent), 140),
    result_summary: compact(pickString(source.result_summary, fallback.result_summary), 160),
    status_refs: pickStringArray(source.status_refs, fallback.status_refs, 8),
    missing_status: pickStringArray(source.missing_status, fallback.missing_status, 8),
    unspoken_patrol_events: pickStringArray(source.unspoken_patrol_events, fallback.unspoken_patrol_events, 6),
    boundaries: pickStringArray(source.boundaries, fallback.boundaries, 8),
    turn_count: Math.max(0, Math.floor(pickNumber(source.turn_count, fallback.turn_count))),
    updated_at: pickString(source.updated_at, fallback.updated_at),
    source: source.source === 'local_storage' ? 'local_storage' : fallback.source
  }
}

export function updateStatusDialogueConversationMemory({
  previous,
  userQuery,
  focus,
  output,
  status
}: {
  previous: StatusDialogueConversationMemoryCard
  userQuery: string
  focus: ConversationMemoryFocusInput
  output?: ConversationMemoryOutputInput
  status?: ConversationMemoryStatusInput
}): StatusDialogueConversationMemoryCard {
  const activeGoal = inferActiveGoal(userQuery, previous.active_goal)
  const statusFact = status
    ? `状态快照 ${status.global_status}: fresh/stale/missing ${status.cards_fresh}/${status.cards_stale}/${status.cards_missing}`
    : ''
  const focusFact = `当前焦点 ${focus.title}: ${focus.status}`
  const outputFact = output?.error ? '' : summarizeResult(output)
  const openQuestions = output?.missingStatus?.length
    ? [`缺失状态：${output.missingStatus.slice(0, 4).join(', ')}`]
    : previous.open_questions

  return {
    ...previous,
    active_goal: activeGoal,
    user_focus: mergeUnique(previous.user_focus, inferUserFocus(userQuery), 8),
    current_focus_node: focus.title,
    current_focus_status: focus.status,
    confirmed_facts: mergeUnique(previous.confirmed_facts, [focusFact, statusFact, outputFact].filter(Boolean), 8),
    open_questions: mergeUnique(previous.open_questions, openQuestions, 6),
    next_expected_result: `继续围绕“${activeGoal}”给出目标、关注点和结果优先的回复`,
    latest_user_intent: summarizeIntent(userQuery),
    result_summary: summarizeResult(output),
    status_refs: mergeUnique(previous.status_refs, output?.statusRefs ?? [], 8),
    missing_status: mergeUnique(previous.missing_status, output?.missingStatus ?? [], 8),
    unspoken_patrol_events: mergeUnique([], output?.unspokenPatrolEvents ?? previous.unspoken_patrol_events, 6),
    boundaries: mergeUnique(previous.boundaries, [
      'localStorage only',
      'no world-model write',
      'no raw audio persistence',
      'no hidden reasoning storage'
    ], 8),
    turn_count: previous.turn_count + 1,
    updated_at: new Date().toISOString(),
    source: 'local_storage'
  }
}
