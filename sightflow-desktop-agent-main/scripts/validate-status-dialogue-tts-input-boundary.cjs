const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const repoRoot = path.resolve(__dirname, '..')
const rendererPath = path.join(repoRoot, 'src', 'renderer', 'src', 'zhineng-console', 'ZhinengConsole.tsx')
const testCliPath = path.join(repoRoot, 'scripts', 'test-cli.ts')
const packagePath = path.join(repoRoot, 'package.json')
const source = fs.readFileSync(rendererPath, 'utf8')
const testCliSource = fs.readFileSync(testCliPath, 'utf8')
const packageSource = fs.readFileSync(packagePath, 'utf8')

const checks = {
  queue_metadata_declared:
    source.includes('queued_during_tts: boolean') &&
    source.includes('echo_boundary: StatusDialogueInputEchoBoundary') &&
    source.includes('priority: StatusDialogueInputQueuePriority'),
  playback_active_helper_declared:
    source.includes('function isVoicePlaybackActiveForInput') &&
    source.includes("input.queueStatus === 'playing'") &&
    source.includes("input.voiceLatencyStage === 'tts_generating'"),
  playback_terminal_helper_declared:
    source.includes('function isVoicePlaybackTerminalForInputQueue') &&
    source.includes("status === 'idle' || status === 'complete' || status === 'error'"),
  enqueue_marks_tts_boundary:
    source.includes('const detectedQueuedDuringTts = isVoicePlaybackActiveForInput') &&
    source.includes('const queuedDuringTts = options.queuedDuringTts ?? detectedQueuedDuringTts') &&
    source.includes("queuedDuringTts ? 'after_current_voice' : 'normal'") &&
    source.includes("queuedDuringTts ? 'wake_detector_paused_only'"),
  submit_interrupts_when_only_tts_active:
    source.includes('const canInterruptVoicePlayback =') &&
    source.includes("logStatusDialogueVoiceEvent('dialogue_input_barge_in'") &&
    source.includes('previous_voice_status: latestVoiceQueueState.status'),
  formal_input_interrupts_tts_before_queueing:
    source.includes('interruptVoicePlaybackForFormalInput') &&
    source.includes('const interruptVoicePlayback = useCallback') &&
    source.includes("'voice_playback_interrupted_for_formal_input' | 'voice_playback_interrupted_for_graph_close'") &&
    source.includes('logStatusDialogueVoiceEvent(logEvent') &&
    source.includes("logEvent: 'voice_playback_interrupted_for_formal_input'") &&
    source.includes("logStatusDialogueVoiceEvent('tts_queue_interrupted'") &&
    source.includes("interruptVoicePlaybackForFormalInput(inputKind, 'dialogue_busy_tts_interrupted'") &&
    source.includes('queuedDuringTts: true') &&
    source.includes('voiceQueueStatus: currentVoiceQueueState.status'),
  graph_close_interrupts_tts_before_close:
    source.includes("logEvent: 'voice_playback_interrupted_for_graph_close'") &&
    source.includes("reason: 'graph_close_button'") &&
    source.includes('graph_close_interrupts_tts_before_window_close') &&
    source.includes("refs: ['voice.output_queue.interrupt', 'graph.close']") &&
    source.includes("void window.electron.invoke('zhineng:graph:close'"),
  submit_queues_when_dialogue_busy_or_non_interruptible:
    source.includes('dialogueBusyRef.current || (latestVoicePlaybackActive && !canInterruptVoicePlayback)') &&
    source.includes("latestVoicePlaybackActive ? 'tts_playback_active' : 'dialogue_busy'"),
  stale_tts_output_is_skipped_after_interrupt:
    source.includes("logStatusDialogueVoiceEvent('tts_chunk_skipped_stale_after_synthesis'") &&
    source.includes("logStatusDialogueVoiceEvent('tts_queue_interrupted'") &&
    source.includes('voice playback interrupted by newer input'),
  finally_does_not_drain_during_playback:
    source.includes('const voicePlaybackStillActive = isVoicePlaybackActiveForInput') &&
    source.includes('if (!voicePlaybackStillActive)') &&
    source.includes('const nextQueuedInput = takeNextDialogueInput()'),
  playback_terminal_drains_queue:
    source.includes('!isVoicePlaybackTerminalForInputQueue(voicePlaybackQueueState.status)') &&
    source.includes('if (dialogueBusy || dialogueBusyRef.current) return') &&
    source.includes('drainNextQueuedDialogueInput') &&
    source.includes('dialogue_input_dequeued_after_tts_complete') &&
    source.includes('dialogue_input_dequeued_after_queue_release') &&
    source.includes('void submitDialogue(nextQueuedInput.text, nextQueuedInput.input_kind)'),
  playback_watchdog_drains_stale_queue:
    source.includes('STATUS_DIALOGUE_INPUT_QUEUE_DRAIN_WATCHDOG_MS = 8000') &&
    source.includes("logStatusDialogueVoiceEvent('dialogue_input_queue_drain_watchdog'") &&
    source.includes("drainNextQueuedDialogueInput('watchdog'") &&
    source.includes("last_error: 'queue drain watchdog released stale voice state'"),
  playback_state_ref_prevents_stale_queue_drain:
    source.includes('const voicePlaybackQueueStateRef = useRef<VoicePlaybackQueueState>(voicePlaybackQueueState)') &&
    source.includes('voicePlaybackQueueStateRef.current = nextState') &&
    source.includes('const latestVoiceQueueState = voicePlaybackQueueStateRef.current') &&
    source.includes('queueStatus: latestVoiceQueueState.status'),
  latency_state_ref_prevents_stale_playback_detection:
    source.includes('const voiceLatencyRef = useRef<StatusDialogueVoiceLatencyState>(voiceLatency)') &&
    source.includes('voiceLatencyRef.current = next') &&
    source.includes('voiceLatencyStage: voiceLatencyRef.current.stage'),
  ui_exposes_tts_input_boundary:
    source.includes('during tts <strong>{dialogueInputQueueState.queued_during_tts_count}</strong>') &&
    source.includes("echo <strong>{dialogueInputQueueState.last_echo_boundary ?? 'none'}</strong>"),
  logs_include_echo_boundary:
    source.includes('echo_boundary: entry.echo_boundary') &&
    source.includes('queued_during_tts: entry.queued_during_tts') &&
    source.includes('echo_boundary: next.echo_boundary'),
  streaming_voice_budget_declared:
    source.includes('STATUS_DIALOGUE_STREAMING_VOICE_MAX_SENTENCES = 1') &&
    source.includes('STATUS_DIALOGUE_STREAMING_VOICE_MAX_CHARS = 96') &&
    source.includes("logStatusDialogueVoiceEvent('tts_stream_sentence_skipped_by_voice_budget'") &&
    source.includes('display reply keeps full model output; voiceText keeps low-latency spoken budget'),
  final_voice_budget_applied:
    source.includes('const shortestVoicePath = buildShortestNecessaryPostStreamVoice({') &&
    source.includes('STATUS_DIALOGUE_FINAL_VOICE_MAX_CHARS = 180') &&
    source.includes('event_voice_used: shortestVoicePath.event_voice_used') &&
    source.includes('remaining_voice_length: shortestVoicePath.remaining_voice.length') &&
    source.includes("logStatusDialogueVoiceEvent('tts_shortest_voice_path_selected'") &&
    source.includes('streamed sentence, event inserts, and final voice are deduped into the shortest necessary spoken path'),
  delayed_ack_policy_visual_first:
    source.includes('STATUS_DIALOGUE_VOICE_ACK_DELAY_MS = 1500') &&
    source.includes("logStatusDialogueVoiceEvent('status_dialogue_visual_ack_shown'") &&
    source.includes("logStatusDialogueVoiceEvent('status_dialogue_delayed_voice_ack_fired'") &&
    source.includes("clearDelayedVoiceAckTimer('model_stream_sentence_ready'") &&
    source.includes("clearDelayedVoiceAckTimer('model_result_received'"),
  execution_status_bar_visible:
    source.includes('zg-dialogue-execution-bar') &&
    source.includes('STATUS_DIALOGUE_EXECUTION_STEPS.map') &&
    source.includes('dialogueExecutionState.action') &&
    source.includes('zg-execution-step-row'),
  controlled_voice_budget_probe_exists:
    source.includes("'tts_voice_budget'") &&
    source.includes("logStatusDialogueVoiceEvent('status_dialogue_tts_voice_budget_probe_start'") &&
    source.includes("logStatusDialogueVoiceEvent('status_dialogue_tts_voice_budget_probe_submitted'") &&
    testCliSource.includes('runStatusDialogueTtsVoiceBudgetProbe') &&
    testCliSource.includes("action === 'status-dialogue-tts-voice-budget'") &&
    testCliSource.includes('status_dialogue_tts_voice_budget_probe_complete') &&
    testCliSource.includes("ipcMain.handle('zhineng:status-dialogue:complete:stream'") &&
    testCliSource.includes("ipcMain.handle('zhineng:status-dialogue:tts:synthesize:stream'") &&
    packageSource.includes('voice:runtime-flow:probe-tts-voice-budget'),
  controlled_runtime_probe_exists:
    source.includes('status_dialogue_runtime_probe') &&
    source.includes("runtimeProbeMode !== 'tts_input_interrupt'") &&
    source.includes('status_dialogue_tts_input_interrupt_probe_start') &&
    source.includes('status_dialogue_tts_input_interrupt_probe_submitted') &&
    testCliSource.includes('dialogue_input_dequeued_after_tts_complete') &&
    testCliSource.includes("action === 'status-dialogue-tts-input-interrupt'") &&
    testCliSource.includes('runStatusDialogueTtsInputInterruptProbe') &&
    packageSource.includes('voice:runtime-flow:probe-tts-input-interrupt')
}

for (const [name, ok] of Object.entries(checks)) {
  assert.equal(ok, true, `${name} failed`)
}

const report = {
  schema: 'status_dialogue_tts_input_boundary_validation.v1',
  generated_at: new Date().toISOString(),
  renderer: rendererPath,
  checks,
  result: 'passed'
}

const outputDir = path.join(repoRoot, 'runtime', 'verification-reports')
fs.mkdirSync(outputDir, { recursive: true })
const outputPath = path.join(outputDir, `status-dialogue-tts-input-boundary-${Date.now()}.json`)
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

console.log(JSON.stringify({ ok: true, outputPath, checks }, null, 2))
