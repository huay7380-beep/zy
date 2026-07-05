const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const repoRoot = path.resolve(__dirname, '..')
const rendererPath = path.join(repoRoot, 'src', 'renderer', 'src', 'zhineng-console', 'ZhinengConsole.tsx')
const source = fs.readFileSync(rendererPath, 'utf8')

const checks = {
  queue_type_declared:
    source.includes('interface StatusDialogueQueuedInput') &&
    source.includes('interface StatusDialogueInputQueueState'),
  queue_limit_declared: source.includes('STATUS_DIALOGUE_INPUT_QUEUE_LIMIT = 5'),
  queue_drain_watchdog_declared:
    source.includes('STATUS_DIALOGUE_INPUT_QUEUE_DRAIN_WATCHDOG_MS = 8000') &&
    source.includes('function isVoicePlaybackTerminalForInputQueue'),
  busy_ref_declared: source.includes('const dialogueBusyRef = useRef(false)'),
  queue_ref_declared: source.includes('pendingDialogueInputQueueRef'),
  busy_input_enqueues:
    source.includes('dialogueBusyRef.current || (latestVoicePlaybackActive && !canInterruptVoicePlayback)') &&
    source.includes('enqueueDialogueInput(queuedInput, inputKind,') &&
    source.includes("'dialogue_busy'"),
  busy_tts_input_interrupts_then_enqueues:
    source.includes('dialogueBusyRef.current && voicePlaybackActive && formalInput') &&
    source.includes("interruptVoicePlaybackForFormalInput(inputKind, 'dialogue_busy_tts_interrupted'") &&
    source.includes("enqueueDialogueInput(input, inputKind, 'dialogue_busy_tts_interrupted'") &&
    source.includes('queuedDuringTts: true'),
  tts_only_input_can_barge_in:
    source.includes('const canInterruptVoicePlayback =') &&
    source.includes("logStatusDialogueVoiceEvent('dialogue_input_barge_in'") &&
    source.includes("echo_boundary: 'formal_input_allowed'"),
  queue_drains_after_turn:
    source.includes('const nextQueuedInput = takeNextDialogueInput()') &&
    source.includes('void submitDialogue(nextQueuedInput.text, nextQueuedInput.input_kind)'),
  queue_drains_after_busy_clears:
    source.includes('if (dialogueBusy || dialogueBusyRef.current) return') &&
    source.includes('drainNextQueuedDialogueInput') &&
    source.includes("dialogue_input_dequeued_after_queue_release"),
  queue_drains_after_terminal_or_watchdog:
    source.includes("trigger: 'tts_complete' | 'queue_terminal' | 'watchdog'") &&
    source.includes("drainNextQueuedDialogueInput(voicePlaybackQueueState.status === 'complete' ? 'tts_complete' : 'queue_terminal'") &&
    source.includes("logStatusDialogueVoiceEvent('dialogue_input_queue_drain_watchdog'") &&
    source.includes("boundary: 'queued input release guard; no world write; no requirement packet'"),
  stt_button_not_busy_disabled: !source.includes('disabled={dialogueBusy && !voiceListening}'),
  text_input_not_busy_disabled: !source.includes('disabled={dialogueBusy}'),
  send_button_queues_when_busy: source.includes("{dialogueBusy ? 'queue' : 'send'}"),
  queue_visible_in_speech_settings:
    source.includes('dialogue input queue status') &&
    source.includes('input queue <strong>{dialogueInputQueueState.queued_count}</strong>'),
  voice_log_records_queue:
    source.includes("'stt_input_queued'") &&
    source.includes("'dialogue_input_dequeued'")
}

for (const [name, ok] of Object.entries(checks)) {
  assert.equal(ok, true, `${name} failed`)
}

const report = {
  schema: 'status_dialogue_stt_input_queue_validation.v1',
  generated_at: new Date().toISOString(),
  renderer: rendererPath,
  checks,
  result: 'passed'
}

const outputDir = path.join(repoRoot, 'runtime', 'verification-reports')
fs.mkdirSync(outputDir, { recursive: true })
const outputPath = path.join(outputDir, `status-dialogue-stt-input-queue-${Date.now()}.json`)
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

console.log(JSON.stringify({ ok: true, outputPath, checks }, null, 2))
