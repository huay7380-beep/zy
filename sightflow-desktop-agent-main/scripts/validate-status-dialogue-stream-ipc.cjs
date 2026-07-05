const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const mainPath = path.join(repoRoot, 'src', 'main', 'index.ts')
const rendererPath = path.join(repoRoot, 'src', 'renderer', 'src', 'zhineng-console', 'ZhinengConsole.tsx')

const mainSource = fs.readFileSync(mainPath, 'utf8')
const rendererSource = fs.readFileSync(rendererPath, 'utf8')
const ttsAdapterPath = path.join(repoRoot, 'src', 'core', 'status-dialogue', 'tts-adapter.ts')
const ttsAdapterSource = fs.readFileSync(ttsAdapterPath, 'utf8')

const checks = {
  main_stream_handler: mainSource.includes("ipcMain.handle('zhineng:status-dialogue:complete:stream'"),
  main_stream_events: mainSource.includes('status_dialogue_model_stream_event.v1') && mainSource.includes("type: 'delta'"),
  main_uses_call_chat_stream: mainSource.includes('client.callChatStream'),
  main_keeps_complete_handler: mainSource.includes("ipcMain.handle('zhineng:status-dialogue:complete'"),
  renderer_listens_stream_event: rendererSource.includes('zhineng:status-dialogue:complete:stream:event'),
  renderer_invokes_stream_handler: rendererSource.includes("window.electron.invoke('zhineng:status-dialogue:complete:stream'"),
  renderer_stream_invoke_fallback_to_complete:
    rendererSource.includes('stream_ipc_unavailable') &&
    rendererSource.includes('model_stream_invoke_failed') &&
    rendererSource.includes('streamFallbackReason') &&
    rendererSource.includes("window.electron.invoke('zhineng:status-dialogue:complete',"),
  renderer_extracts_voice_field_only:
    rendererSource.includes("extractPartialJsonStringField(rawStreamText, 'voice')") &&
    rendererSource.includes("extractPartialJsonStringField(rawStreamText, 'voiceText')"),
  renderer_stream_sentences_to_queue:
    rendererSource.includes('onStreamingVoiceSentence') &&
    rendererSource.includes('voice_response_text_stream.sentence_ready') &&
    rendererSource.includes('stream-sentence-') &&
    rendererSource.includes('playVoicePlanThroughQueue'),
  renderer_final_voice_deduplicates: rendererSource.includes('stripAlreadySpokenVoicePrefix'),
  prompt_voice_field_first:
    rendererSource.indexOf('{"voice"') >= 0 &&
    rendererSource.indexOf('{"voice"') < rendererSource.indexOf('"reply"'),
  main_tts_stream_handler: mainSource.includes("ipcMain.handle('zhineng:status-dialogue:tts:synthesize:stream'"),
  main_tts_stream_events:
    mainSource.includes('status_dialogue_tts_stream_event.v1') &&
    mainSource.includes("type: 'frame'") &&
    mainSource.includes("type: 'done'"),
  main_tts_stream_uses_http_adapter: mainSource.includes('createHttpStreamingTtsAdapter'),
  main_tts_stream_uses_edge_adapter:
    mainSource.includes('synthesizeEdgeReadAloudStream') &&
    mainSource.includes("config.adapter_id === 'edge_readaloud_websocket'") &&
    mainSource.includes('streaming_tts_adapter.runtime.edge_readaloud_websocket'),
  main_tts_synthesize_fallback_kept: mainSource.includes("ipcMain.handle('zhineng:status-dialogue:tts:synthesize'"),
  renderer_tts_stream_listener: rendererSource.includes('zhineng:status-dialogue:tts:synthesize:stream:event'),
  renderer_tts_stream_invoker: rendererSource.includes("window.electron.invoke('zhineng:status-dialogue:tts:synthesize:stream'"),
  renderer_tts_stream_helper_keeps_frame_count:
    rendererSource.includes('requestStatusDialogueTtsStream') &&
    rendererSource.includes('finalFrameCount') &&
    rendererSource.includes('firstFrameMs'),
  renderer_tts_stream_assembles_playable_audio:
    rendererSource.includes('assembleStreamingTtsAudioFrames') &&
    rendererSource.includes('audioDataUrl') &&
    rendererSource.includes('frameSequenceOk'),
  renderer_tts_stream_experimental_mode:
    rendererSource.includes("'cosyvoice_stream_assembled'") &&
    rendererSource.includes('<option value="cosyvoice_stream_assembled">stream assembled</option>'),
  renderer_tts_stream_assembled_enters_audio_result:
    rendererSource.includes("voiceOutputMode === 'cosyvoice_stream_assembled'") &&
    rendererSource.includes('tts_stream_assembled_ready') &&
    rendererSource.includes('audio_data_url: streamResult.audioDataUrl'),
  renderer_tts_stream_browser_preview_fallback:
    rendererSource.includes('requestBrowserPreviewCosyVoiceTtsStream') &&
    rendererSource.includes('response.body.getReader()') &&
    rendererSource.includes('buildCosyVoiceRequestBody(config, request.plan)') &&
    rendererSource.includes('stream_preferred: true'),
  renderer_tts_stream_live_pcm_mode:
    rendererSource.includes("'cosyvoice_stream_live_pcm'") &&
    rendererSource.includes('<option value="cosyvoice_stream_live_pcm">stream live pcm</option>') &&
    rendererSource.includes("voiceOutputMode === 'cosyvoice_stream_live_pcm'"),
  renderer_tts_stream_live_pcm_webaudio:
    rendererSource.includes('playVoiceLivePcmStreamChunk') &&
    rendererSource.includes('decodePcm16LeMonoBase64') &&
    rendererSource.includes("response_format: 'pcm'") &&
    rendererSource.includes('skip_cache: true') &&
    rendererSource.includes('audioContext.createBuffer'),
  renderer_tts_edge_readaloud_mode:
    rendererSource.includes("'edge_readaloud_stream'") &&
    rendererSource.includes('<option value="edge_readaloud_stream">edge stream low latency</option>') &&
    rendererSource.includes("adapter_id: 'edge_readaloud_websocket'") &&
    rendererSource.includes('tts_edge_readaloud_stream_ready'),
  renderer_tts_runtime_policy_state:
    rendererSource.includes('status_dialogue_tts_runtime_policy.v1') &&
    rendererSource.includes('assessTtsRuntimePolicy') &&
    rendererSource.includes('TTS_RUNTIME_POLICY_THRESHOLDS') &&
    rendererSource.includes('ttsRuntimePolicyLabel'),
  renderer_tts_runtime_policy_updates_from_stream:
    rendererSource.includes('stream_assembled_runtime') &&
    rendererSource.includes('edge_readaloud_stream_runtime') &&
    rendererSource.includes("source: 'live_pcm_runtime'") &&
    rendererSource.includes("source: 'live_pcm_runtime_error'"),
  renderer_tts_runtime_policy_visible:
    rendererSource.includes('tts path <strong>{ttsRuntimePolicyLabel}</strong>') &&
    rendererSource.includes('runtime {ttsRuntimePolicyLabel}') &&
    rendererSource.includes('first audio <strong>{formatVoiceLatencyMs(ttsRuntimePolicy.first_audio_payload_ms)}</strong>'),
  renderer_tts_runtime_policy_3d_mapping:
    rendererSource.includes('voice.tts_runtime_policy') &&
    rendererSource.includes('tts_streaming_adapter_runtime_assessment.v1') &&
    rendererSource.includes('operator_visible_tts_path'),
  renderer_tts_adapter_candidates_visible:
    rendererSource.includes('buildDefaultStatusDialogueTtsRuntimeCandidates') &&
    rendererSource.includes('selectStatusDialogueTtsRuntimeCandidate') &&
    rendererSource.includes('candidate <strong>{selectedTtsRuntimeCandidateLabel}</strong>') &&
    rendererSource.includes('slots <strong>{ttsRuntimeCandidates.length}</strong>'),
  renderer_tts_adapter_candidates_3d_mapping:
    rendererSource.includes('voice.tts_adapter_candidates') &&
    rendererSource.includes('status_dialogue_tts_runtime_candidate.v1[]') &&
    rendererSource.includes('selected_tts_runtime_candidate'),
  renderer_voice_tone_policy_applied:
    rendererSource.includes('applyVoiceToneToPlan') &&
    rendererSource.includes('const effectivePlan = applyVoiceToneToPlan') &&
    rendererSource.includes('segmentVoiceResponsePlan(effectivePlan') &&
    rendererSource.includes('synthesizeVoiceChunk(chunk, effectivePlan, lockedProfile)'),
  main_tts_stream_pcm_override:
    mainSource.includes('requestedFormat') &&
    mainSource.includes("requestedFormat === 'pcm'") &&
    mainSource.includes('skipCache') &&
    mainSource.includes('config.response_format !== baseConfig.response_format'),
  main_tts_generic_config_env:
    mainSource.includes('SIGHTFLOW_STATUS_DIALOGUE_TTS_ADAPTER_ID') &&
    mainSource.includes('SIGHTFLOW_STATUS_DIALOGUE_TTS_BASE_URL') &&
    mainSource.includes('STATUS_DIALOGUE_TTS_BASE_URL') &&
    mainSource.includes('SIGHTFLOW_COSYVOICE_BASE_URL'),
  core_tts_adapter_id_configurable:
    ttsAdapterSource.includes('normalizeTtsAdapterId') &&
    ttsAdapterSource.includes('adapter_id: normalizeTtsAdapterId') &&
    ttsAdapterSource.includes("value === 'edge_readaloud_websocket'") &&
    ttsAdapterSource.includes("value === 'custom_streaming_tts_http'") &&
    ttsAdapterSource.includes("value === 'openai_compatible_streaming_http'")
}

for (const [name, passed] of Object.entries(checks)) {
  assert.equal(passed, true, `${name} should be true`)
}

const report = {
  schema: 'status_dialogue_stream_ipc_validation.v1',
  generated_at: new Date().toISOString(),
  checks
}

const outputDir = path.join(repoRoot, 'runtime', 'voice-loop-probes')
fs.mkdirSync(outputDir, { recursive: true })
const outputPath = path.join(outputDir, `status-dialogue-stream-ipc-validation-${Date.now()}.json`)
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ ok: true, outputPath, checks }, null, 2))
