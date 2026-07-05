const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  buildNaturalModuleFeedbackInsertVoice,
  buildShortestNecessaryPostStreamVoice,
  buildSimulatedModuleFeedbackVoicePatch,
  isVoiceLineRedundantWithSpoken
} = require('../src/core/status-dialogue/voice-event-orchestrator.ts')

const repoRoot = process.cwd()
const rendererPath = path.join(repoRoot, 'src', 'renderer', 'src', 'zhineng-console', 'ZhinengConsole.tsx')
const contractsPath = path.join(repoRoot, 'src', 'core', 'status-dialogue-contracts.ts')
const orchestratorPath = path.join(repoRoot, 'src', 'core', 'status-dialogue', 'voice-event-orchestrator.ts')
const packagePath = path.join(repoRoot, 'package.json')

const rendererSource = fs.readFileSync(rendererPath, 'utf8')
const contractsSource = fs.readFileSync(contractsPath, 'utf8')
const orchestratorSource = fs.readFileSync(orchestratorPath, 'utf8')
const packageSource = fs.readFileSync(packagePath, 'utf8')

const checks = {
  contracts_exports_orchestrator: contractsSource.includes("export * from './status-dialogue/voice-event-orchestrator'"),
  renderer_imports_shortest_path: rendererSource.includes('buildShortestNecessaryPostStreamVoice'),
  renderer_has_model_stream_activity_callback: rendererSource.includes('onModelStreamActivity'),
  ack_cancelled_on_stream_delta: rendererSource.includes("clearDelayedVoiceAckTimer(\n              event.type === 'delta' ? 'model_stream_delta_received' : 'model_stream_voice_progress'"),
  stream_delta_activity_emitted: rendererSource.includes("type: 'delta'") && rendererSource.includes('deltaLength: eventPayload.delta.length'),
  stream_voice_progress_activity_emitted:
    rendererSource.includes("type: 'voice_progress'") && rendererSource.includes('extractedVoiceLength: extractedVoice.length'),
  shortest_path_logged: rendererSource.includes("logStatusDialogueVoiceEvent('tts_shortest_voice_path_selected'"),
  obsolete_final_voice_gate_removed: !rendererSource.includes('shouldSpeakPostStreamFinalVoice'),
  obsolete_prefix_helper_removed: !rendererSource.includes('stripAlreadySpokenVoicePrefix'),
  simulated_feedback_patch_builder_present: orchestratorSource.includes('buildSimulatedModuleFeedbackVoicePatch'),
  simulated_feedback_reuses_voice_script_patch: orchestratorSource.includes('schema: VOICE_SCRIPT_PATCH_SCHEMA'),
  package_script_registered: packageSource.includes('"voice:shortest-path:validate"')
}

for (const [name, ok] of Object.entries(checks)) {
  assert.equal(ok, true, name)
}

assert.equal(
  isVoiceLineRedundantWithSpoken('我看到状态已经更新。', '我看到状态已经更新。'),
  true,
  'identical spoken line should be redundant'
)

const duplicateFinal = buildShortestNecessaryPostStreamVoice({
  streamedVoicePrefix: '我看到状态已经更新。',
  finalVoice: '我看到状态已经更新。',
  maxChars: 44
})
assert.equal(duplicateFinal.text, '')
assert.equal(duplicateFinal.final_voice_used, false)
assert.equal(duplicateFinal.reason, 'stream_already_covered')

const relatedVoice = buildNaturalModuleFeedbackInsertVoice({
  moduleLabel: '任务图谱',
  previousFocusLabel: '任务图谱',
  newStatus: '构建完成',
  severity: 'notice',
  userRelevance: 'related',
  generatedAt: '2026-07-04T00:00:00.000Z'
})
assert.equal(relatedVoice.includes('你之前关注的任务图谱有更新'), true)
assert.equal(relatedVoice.includes('构建完成'), true)

const relatedPatch = buildSimulatedModuleFeedbackVoicePatch({
  moduleLabel: '任务图谱',
  previousFocusLabel: '任务图谱',
  newStatus: '构建完成',
  severity: 'notice',
  userRelevance: 'related',
  generatedAt: '2026-07-04T00:00:00.000Z'
})
assert.equal(relatedPatch.schema, 'voice_script_patch.v1')
assert.equal(relatedPatch.play_mode, 'merge_into_current_reply')
assert.equal(relatedPatch.voice_profile_lock, true)
assert.equal(relatedPatch.voice_text.includes('你之前关注的任务图谱有更新'), true)

const eventInsertWithDuplicateFinal = buildShortestNecessaryPostStreamVoice({
  streamedVoicePrefix: '我先回答你刚才的问题。',
  eventBroadcastVoice: relatedPatch.voice_text,
  finalVoice: '我先回答你刚才的问题。',
  maxChars: 80
})
assert.equal(eventInsertWithDuplicateFinal.event_voice_used, true)
assert.equal(eventInsertWithDuplicateFinal.final_voice_used, false)
assert.equal(eventInsertWithDuplicateFinal.text.includes('你之前关注的任务图谱有更新'), true)

const noPunctuationPatrolClip = buildShortestNecessaryPostStreamVoice({
  streamedVoicePrefix: '',
  eventBroadcastVoice: '审计模块当前阻塞原因是源引用漂移需要继续巡检并等待下一轮补充',
  finalVoice: '',
  maxChars: 24
})
assert.equal(noPunctuationPatrolClip.event_voice_used, true)
assert.equal(noPunctuationPatrolClip.text.endsWith('。'), true)
assert.equal(noPunctuationPatrolClip.text.includes('...'), false)
assert.equal(noPunctuationPatrolClip.text.includes('…'), false)

const genericProcessAfterStream = buildShortestNecessaryPostStreamVoice({
  streamedVoicePrefix: '我能听到你说话，目前停在只读巡检模式。',
  finalVoice: '我先回答你这句话本身，再补充和当前系统状态有关的部分。 我先不进入固定巡检流程，等你确认后再继续。',
  maxChars: 44
})
assert.equal(genericProcessAfterStream.text, '')
assert.equal(genericProcessAfterStream.final_voice_used, false)
assert.equal(genericProcessAfterStream.reason, 'stream_already_covered')

const capabilityBoundaryAfterStream = buildShortestNecessaryPostStreamVoice({
  streamedVoicePrefix: '我能先听清楚你语音的意思，然后把你的话转成明确的意图和执行草案。',
  finalVoice: '可以，我能先把你的语音转成任务意图和执行草案；但当前阶段不会直接执行外部动作。',
  maxChars: 44
})
assert.equal(capabilityBoundaryAfterStream.text, '但当前阶段不会直接执行外部动作。')
assert.equal(capabilityBoundaryAfterStream.final_voice_used, true)
assert.equal(capabilityBoundaryAfterStream.text.includes('外…'), false)

const criticalPatch = buildSimulatedModuleFeedbackVoicePatch({
  moduleLabel: '安全闸口',
  previousFocusLabel: '语音对话模块',
  newStatus: '被阻塞',
  severity: 'critical',
  userRelevance: 'direct',
  generatedAt: '2026-07-04T00:01:00.000Z'
})
assert.equal(criticalPatch.play_mode, 'interrupt_now')
assert.equal(criticalPatch.emotion_hint, 'urgent')
assert.equal(Boolean(criticalPatch.resume_line), true)
assert.equal(criticalPatch.max_sentences, 2)

const report = {
  schema: 'status_dialogue_voice_shortest_path_validation.v1',
  generated_at: new Date().toISOString(),
  ok: true,
  checks,
  cases: {
    duplicate_final: duplicateFinal,
    related_patch: {
      patch_id: relatedPatch.patch_id,
      play_mode: relatedPatch.play_mode,
      voice_text: relatedPatch.voice_text,
      voice_profile_lock: relatedPatch.voice_profile_lock
    },
    event_insert_with_duplicate_final: eventInsertWithDuplicateFinal,
    no_punctuation_patrol_clip: noPunctuationPatrolClip,
    generic_process_after_stream: genericProcessAfterStream,
    capability_boundary_after_stream: capabilityBoundaryAfterStream,
    critical_patch: {
      patch_id: criticalPatch.patch_id,
      play_mode: criticalPatch.play_mode,
      emotion_hint: criticalPatch.emotion_hint,
      resume_line: criticalPatch.resume_line,
      max_sentences: criticalPatch.max_sentences
    }
  },
  boundary: {
    runtime_fake_event_injection: false,
    world_model_write: false,
    stt_tts_adapter_changed: false
  }
}

const outputDir = path.join(repoRoot, 'runtime', 'verification-reports')
fs.mkdirSync(outputDir, { recursive: true })
const outputPath = path.join(outputDir, `status-dialogue-voice-shortest-path-${Date.now()}.json`)
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(JSON.stringify({ ok: true, outputPath, report }, null, 2))
