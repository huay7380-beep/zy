const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const outputDir = path.join(repoRoot, 'runtime', 'voice-loop-probes')

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

function argFlag(name) {
  return process.argv.includes(name)
}

function readJson(filePath) {
  if (!filePath) return undefined
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return undefined
  }
}

function latestReport(regex) {
  if (!fs.existsSync(outputDir)) return undefined
  const matches = fs
    .readdirSync(outputDir)
    .filter((name) => regex.test(name))
    .map((name) => {
      const filePath = path.join(outputDir, name)
      return { name, filePath, mtimeMs: fs.statSync(filePath).mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  return matches[0]
}

function statusFrom(condition, missingCondition = false) {
  if (missingCondition) return 'missing'
  return condition ? 'proved' : 'incomplete'
}

function checkItem({ id, title, status, evidence, detail, required = true }) {
  return { id, title, required, status, evidence, detail }
}

function sourceHasForbiddenBrowserTtsFallback() {
  const roots = [path.join(repoRoot, 'src'), path.join(repoRoot, 'scripts')]
  const forbidden = [
    ['new', 'SpeechSynthesisUtterance'].join(' '),
    ['speechSynthesis', 'speak'].join('.'),
    ['synth', 'speak'].join('.'),
    ['browser_speech', 'audio_fallback'].join('_'),
    ['requirement', 'packet.v1'].join('_')
  ]
  const hits = []

  function walk(dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'out') continue
        walk(filePath)
        continue
      }
      if (!/\.(ts|tsx|js|cjs|mjs)$/.test(entry.name)) continue
      if (entry.name === 'audit-status-dialogue-voice-v0-v6.cjs') continue
      const text = fs.readFileSync(filePath, 'utf8')
      for (const pattern of forbidden) {
        if (text.includes(pattern)) {
          hits.push({ file: filePath, pattern })
        }
      }
    }
  }

  for (const root of roots) walk(root)
  return hits
}

function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  const pipelineMeta = latestReport(/^voice-output-pipeline-validation-.*\.json$/)
  const streamIpcMeta = latestReport(/^status-dialogue-stream-ipc-validation-.*\.json$/)
  const streamLoopMeta = latestReport(/^status-dialogue-stream-loop-.*\.json$/)
  const cosyVoiceMeta = latestReport(/^cosyvoice-http-streaming-validation-.*\.json$/)
  const genericMockMeta = latestReport(/^generic-streaming-tts-validation-mock-.*\.json$/)
  const genericConfiguredMockMeta = latestReport(/^generic-streaming-tts-validation-configured-mock-.*\.json$/)
  const genericConfiguredRealMeta = latestReport(/^generic-streaming-tts-validation-configured-\d.*\.json$/)
  const genericUnconfiguredMeta = latestReport(/^generic-streaming-tts-configured-unconfigured-.*\.json$/)
  const edgeReadAloudRealMeta = latestReport(/^edge-readaloud-streaming-validation-\d{17}\.json$/)

  const pipeline = readJson(pipelineMeta?.filePath)
  const streamIpc = readJson(streamIpcMeta?.filePath)
  const streamLoop = readJson(streamLoopMeta?.filePath)
  const cosyVoice = readJson(cosyVoiceMeta?.filePath)
  const genericMock = readJson(genericMockMeta?.filePath)
  const genericConfiguredMock = readJson(genericConfiguredMockMeta?.filePath)
  const genericConfiguredReal = readJson(genericConfiguredRealMeta?.filePath)
  const genericUnconfigured = readJson(genericUnconfiguredMeta?.filePath)
  const edgeReadAloudReal = readJson(edgeReadAloudRealMeta?.filePath)

  const pipelineChecks = pipeline?.checks ?? {}
  const streamChecks = streamLoop?.checks ?? {}
  const latency = streamLoop?.latency_trace
  const streamIpcChecks = streamIpc?.checks ?? {}
  const forbiddenHits = sourceHasForbiddenBrowserTtsFallback()
  const cosyVoiceAssessment = cosyVoice?.adapter_runtime_assessment

  const items = [
    checkItem({
      id: 'V0_latency_trace',
      title: 'V0 records STT / model / TTS / playback latency with chunk segments',
      status: statusFrom(
        Boolean(
          latency &&
            typeof latency.stt_ms === 'number' &&
            typeof latency.model_ms === 'number' &&
            typeof latency.first_tts_ms === 'number' &&
            typeof latency.total_tts_ms === 'number' &&
            typeof latency.first_playback_ms === 'number' &&
            typeof latency.total_playback_ms === 'number' &&
            Array.isArray(latency.segments) &&
            latency.segments.length > 0
        ),
        !streamLoop
      ),
      evidence: streamLoopMeta?.filePath,
      detail: latency
        ? {
            stt_ms: latency.stt_ms,
            model_ms: latency.model_ms,
            first_tts_ms: latency.first_tts_ms,
            total_tts_ms: latency.total_tts_ms,
            first_playback_ms: latency.first_playback_ms,
            total_playback_ms: latency.total_playback_ms,
            segment_count: latency.segments?.length
          }
        : undefined
    }),
    checkItem({
      id: 'V1_same_voice_no_browser_tts',
      title: 'V1 keeps one voice profile and no browser audible TTS fallback',
      status: statusFrom(streamChecks.same_voice_profile === true && streamChecks.browser_tts_used === false && forbiddenHits.length === 0, !streamLoop),
      evidence: [streamLoopMeta?.filePath, 'source scan: src + scripts'].filter(Boolean),
      detail: {
        same_voice_profile: streamChecks.same_voice_profile,
        browser_tts_used: streamChecks.browser_tts_used,
        forbidden_hits: forbiddenHits
      }
    }),
    checkItem({
      id: 'V2_short_phrase_cache',
      title: 'V2 short phrase and opening cache are hit with low latency',
      status: statusFrom(
        streamChecks.ack_cache_all_hit === true &&
          streamChecks.ack_cache_low_latency === true &&
          streamChecks.formal_opening_cache_hit === true &&
          streamChecks.formal_opening_low_latency === true &&
          streamChecks.tts_cache_second_hit === true,
        !streamLoop
      ),
      evidence: streamLoopMeta?.filePath,
      detail: {
        ack_cache_all_hit: streamChecks.ack_cache_all_hit,
        formal_opening_cache_hit: streamChecks.formal_opening_cache_hit,
        tts_cache_second_latency_ms: streamChecks.tts_cache_second_latency_ms
      }
    }),
    checkItem({
      id: 'V3_sentence_pseudo_streaming',
      title: 'V3 first sentence enters TTS before model completion',
      status: statusFrom(
        streamChecks.first_sentence_ready_before_model_done === true &&
          streamChecks.first_tts_started_before_model_done === true &&
          streamChecks.streamed_sentence_count_at_least_two === true &&
          streamChecks.streamed_sentences_no_final_duplicate === true,
        !streamLoop
      ),
      evidence: streamLoopMeta?.filePath,
      detail: {
        first_sentence_ready_before_model_done: streamChecks.first_sentence_ready_before_model_done,
        first_tts_started_before_model_done: streamChecks.first_tts_started_before_model_done,
        streamed_sentences_no_final_duplicate: streamChecks.streamed_sentences_no_final_duplicate
      }
    }),
    checkItem({
      id: 'V4_playback_queue',
      title: 'V4 playback queue has ordered segment evidence and no dropped chunks in latest loop',
      status: statusFrom(
        streamChecks.latency_segments_cover_streamed_sentences === true &&
          latency?.failed_chunk_count === 0 &&
          Array.isArray(latency?.segments) &&
          latency.segments.every((segment) => segment.status === 'spoken'),
        !streamLoop
      ),
      evidence: streamLoopMeta?.filePath,
      detail: {
        latency_segments_cover_streamed_sentences: streamChecks.latency_segments_cover_streamed_sentences,
        failed_chunk_count: latency?.failed_chunk_count,
        segment_statuses: latency?.segments?.map((segment) => segment.status)
      }
    }),
    checkItem({
      id: 'V5_streaming_adapter_contract',
      title: 'V5 streaming adapter contract is implemented and vendor-neutral HTTP chunked frames assemble correctly',
      status: statusFrom(
        pipelineChecks.http_streaming_adapter_implemented === 'streaming_tts_adapter.validation.http_chunked' &&
          pipelineChecks.http_streaming_first_frame_before_end === true &&
          pipelineChecks.http_streaming_recombined_bytes === true &&
          pipelineChecks.tts_config_custom_candidate_selected === 'custom_streaming_tts_http' &&
          streamIpcChecks.main_tts_stream_uses_http_adapter === true,
        !pipeline || !streamIpc
      ),
      evidence: [pipelineMeta?.filePath, streamIpcMeta?.filePath].filter(Boolean),
      detail: {
        http_streaming_adapter_implemented: pipelineChecks.http_streaming_adapter_implemented,
        http_streaming_first_frame_before_end: pipelineChecks.http_streaming_first_frame_before_end,
        tts_config_custom_candidate_selected: pipelineChecks.tts_config_custom_candidate_selected,
        main_tts_stream_uses_http_adapter: streamIpcChecks.main_tts_stream_uses_http_adapter
      }
    }),
    checkItem({
      id: 'V5_generic_low_latency_probe',
      title: 'V5 generic low-latency route passes mock and configured-mock probes',
      status: statusFrom(
        genericMock?.selected_candidate_interactive_ready === true &&
          genericConfiguredMock?.selected_candidate_interactive_ready === true &&
          genericMock?.same_voice_profile === true &&
          genericConfiguredMock?.same_voice_profile === true,
        !genericMock || !genericConfiguredMock
      ),
      evidence: [genericMockMeta?.filePath, genericConfiguredMockMeta?.filePath].filter(Boolean),
      detail: {
        mock_first_audio_payload_ms: genericMock?.first_audio_payload_ms,
        configured_mock_first_audio_payload_ms: genericConfiguredMock?.first_audio_payload_ms,
        configured_mock_selected_candidate_id: genericConfiguredMock?.selected_candidate_id
      }
    }),
    checkItem({
      id: 'V5_real_low_latency_tts_acceptance',
      title: 'V5 real configured low-latency TTS service passes the configured probe',
      status: statusFrom(
        (genericConfiguredReal?.configured === true &&
          genericConfiguredReal?.selected_candidate_interactive_ready === true &&
          genericConfiguredReal?.same_voice_profile === true &&
          genericConfiguredReal?.first_audio_payload_ms <= genericConfiguredReal?.interactive_first_audio_ms) ||
          (edgeReadAloudReal?.real_service === true &&
            edgeReadAloudReal?.selected_candidate_interactive_ready === true &&
            edgeReadAloudReal?.same_voice_profile === true &&
            edgeReadAloudReal?.native_streaming_supported === true &&
            edgeReadAloudReal?.first_audio_payload_ms <= edgeReadAloudReal?.interactive_first_audio_ms),
        !genericConfiguredReal && !edgeReadAloudReal
      ),
      evidence: genericConfiguredRealMeta?.filePath ?? edgeReadAloudRealMeta?.filePath ?? genericUnconfiguredMeta?.filePath,
      detail: genericConfiguredReal
        ? {
            route: 'generic_configured_http',
            first_audio_payload_ms: genericConfiguredReal.first_audio_payload_ms,
            interactive_first_audio_ms: genericConfiguredReal.interactive_first_audio_ms,
            selected_candidate_id: genericConfiguredReal.selected_candidate_id
          }
        : edgeReadAloudReal
          ? {
              route: 'edge_readaloud_websocket',
              first_audio_payload_ms: edgeReadAloudReal.first_audio_payload_ms,
              interactive_first_audio_ms: edgeReadAloudReal.interactive_first_audio_ms,
              audio_frame_count: edgeReadAloudReal.audio_frame_count,
              audio_bytes: edgeReadAloudReal.audio_bytes,
              voice: edgeReadAloudReal.voice
            }
        : {
            configured_real_report_missing: true,
            latest_unconfigured_report: genericUnconfiguredMeta?.filePath,
            missing_config_fields: genericUnconfigured?.missing_config_fields
          }
    }),
    checkItem({
      id: 'V5_current_cosyvoice_runtime_role',
      title: 'Current CosyVoice runtime is classified correctly and not promoted when slow',
      status: statusFrom(
        cosyVoice?.native_streaming_supported === true &&
          cosyVoiceAssessment?.interactive_ready === false &&
          cosyVoiceAssessment?.adapter_role === 'cached_high_quality_or_non_realtime_voice',
        !cosyVoice
      ),
      evidence: cosyVoiceMeta?.filePath,
      detail: {
        first_audio_payload_chunk_ms_from_request: cosyVoice?.response?.first_audio_payload_chunk_ms_from_request,
        interactive_ready: cosyVoiceAssessment?.interactive_ready,
        adapter_role: cosyVoiceAssessment?.adapter_role
      }
    }),
    checkItem({
      id: 'V6_emotion_priority_same_voice',
      title: 'V6 emotion and reminder priority map to tone parameters while preserving same voice',
      status: statusFrom(
        pipelineChecks.emotion_priority_error === 'urgent/urgent' &&
          pipelineChecks.emotion_priority_patrol_warn === 'focused/notice' &&
          pipelineChecks.emotion_priority_completion === 'warm/notice' &&
          pipelineChecks.emotion_priority_casual_chat === 'warm/normal' &&
          pipelineChecks.emotion_priority_task_supervision === 'focused/notice' &&
          pipelineChecks.emotion_priority_same_voice === true &&
          pipelineChecks.tone_parameters_plan_speed_applied === true,
        !pipeline
      ),
      evidence: pipelineMeta?.filePath,
      detail: {
        emotion_priority_error: pipelineChecks.emotion_priority_error,
        emotion_priority_patrol_warn: pipelineChecks.emotion_priority_patrol_warn,
        emotion_priority_completion: pipelineChecks.emotion_priority_completion,
        emotion_priority_casual_chat: pipelineChecks.emotion_priority_casual_chat,
        emotion_priority_task_supervision: pipelineChecks.emotion_priority_task_supervision,
        tone_parameters_plan_speed_applied: pipelineChecks.tone_parameters_plan_speed_applied
      }
    })
  ]

  const requiredItems = items.filter((item) => item.required)
  const provedCount = requiredItems.filter((item) => item.status === 'proved').length
  const incompleteItems = requiredItems.filter((item) => item.status !== 'proved')
  const overallStatus = incompleteItems.length === 0 ? 'complete' : 'incomplete'
  const report = {
    schema: 'status_dialogue_voice_v0_v6_completion_audit.v1',
    generated_at: new Date().toISOString(),
    overall_status: overallStatus,
    proved_required_count: provedCount,
    required_count: requiredItems.length,
    incomplete_required_ids: incompleteItems.map((item) => item.id),
    reports_used: {
      pipeline: pipelineMeta?.filePath,
      stream_ipc: streamIpcMeta?.filePath,
      stream_loop: streamLoopMeta?.filePath,
      cosyvoice_runtime: cosyVoiceMeta?.filePath,
      generic_mock: genericMockMeta?.filePath,
      generic_configured_mock: genericConfiguredMockMeta?.filePath,
      generic_configured_real: genericConfiguredRealMeta?.filePath,
      generic_unconfigured: genericUnconfiguredMeta?.filePath,
      edge_readaloud_real: edgeReadAloudRealMeta?.filePath
    },
    items
  }

  const outputPath = path.join(outputDir, `status-dialogue-voice-v0-v6-audit-${compactTimestamp()}.json`)
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ ok: true, outputPath, overall_status: overallStatus, incomplete_required_ids: report.incomplete_required_ids }, null, 2))

  if (argFlag('--strict') && overallStatus !== 'complete') {
    process.exitCode = 1
  }
}

main()
