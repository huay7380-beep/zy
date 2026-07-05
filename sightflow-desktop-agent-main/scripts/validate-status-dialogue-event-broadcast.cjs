const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const {
  buildDefaultSystemFeedbackRouteManifest,
  buildSystemEventSnapshot,
  buildVoiceBroadcastQueueState,
  buildVoiceEventBroadcastRequestsFromSnapshot,
  buildVoiceScriptPatchesFromRequests,
  humanizeStatusDialogueModuleId,
  humanizeStatusDialogueTerm,
  humanizeStatusDialogueText,
  normalizeModuleStatusEvent,
  validateSystemFeedbackRouteManifest
} = require('../src/core/status-dialogue/status-events.ts')

const now = new Date('2026-06-29T10:00:00.000Z')
const rendererPath = path.join(process.cwd(), 'src', 'renderer', 'src', 'zhineng-console', 'ZhinengConsole.tsx')
const rendererSource = fs.readFileSync(rendererPath, 'utf8')

const rawEvents = [
  {
    event_id: 'evt-critical-nebula-change',
    generated_at: now.toISOString(),
    source_module: 'status-dialogue-system',
    source_node: 'voice.event_broadcast_ingress',
    event_type: 'nebula_change',
    severity: 'critical',
    headline: 'Status dialogue nebula event route changed',
    summary: 'The status dialogue nebula gained the event broadcast route and needs immediate operator awareness.',
    completion: { current: 0.86, label: 'Phase 4 queue surface ready for replay verification' },
    gate: 'status_event_read_only_gate',
    compass: 'status_dialogue.voice.event_broadcast_ingress',
    evidence_refs: ['voice_event_broadcast_request.v1', 'voice_script_patch.v1'],
    recommended_broadcast: {
      speakable: true,
      mode: 'immediate',
      priority: 'urgent',
      emotion_hint: 'urgent'
    },
    ttl_ms: 300000,
    dedupe_key: 'status-dialogue-system:event-route'
  },
  {
    event_id: 'evt-high-feedback-route',
    generated_at: now.toISOString(),
    source_module: 'runtime-feedback-router',
    source_node: 'system_feedback_route_manifest.v1',
    event_type: 'system_change',
    severity: 'warn',
    headline: 'Feedback route manifest is required for new systems',
    summary: 'New systems must publish both module_status_card.v1 and module_status_event.v1 before patrol claims live feedback.',
    gate: 'system_feedback_route_gate',
    compass: 'status_dialogue.runtime.feedback_router',
    evidence_refs: ['system_feedback_route_manifest.v1'],
    recommended_broadcast: {
      speakable: true,
      mode: 'inline',
      priority: 'notice',
      emotion_hint: 'focused'
    },
    ttl_ms: 300000,
    dedupe_key: 'runtime-feedback-router:manifest'
  },
  {
    event_id: 'evt-normal-queue-visible',
    generated_at: now.toISOString(),
    source_module: 'voice-loop',
    source_node: 'voice.broadcast_queue',
    event_type: 'progress_update',
    severity: 'notice',
    headline: 'Voice event broadcast queue is visible',
    summary: 'The right-side patrol settings panel now exposes queue counts, patches, trace and manual replay.',
    gate: 'voice_broadcast_queue_gate',
    compass: 'status_dialogue.voice.broadcast_queue',
    evidence_refs: ['VoiceEventBroadcastPanelState'],
    recommended_broadcast: {
      speakable: true,
      mode: 'summary',
      priority: 'notice',
      emotion_hint: 'steady'
    },
    ttl_ms: 300000,
    dedupe_key: 'voice-loop:broadcast-queue-visible'
  }
]

const events = rawEvents.map((event) => normalizeModuleStatusEvent(event))
assert.equal(events.every(Boolean), true)

const expectedPublishers = [
  {
    module_id: 'status-dialogue-system',
    display_name: 'Status Dialogue System',
    gate: 'status_event_read_only_gate',
    compass: 'status_dialogue'
  },
  {
    module_id: 'runtime-feedback-router',
    display_name: 'Runtime Feedback Router',
    gate: 'system_feedback_route_gate',
    compass: 'status_dialogue.runtime.feedback_router'
  },
  {
    module_id: 'voice-loop',
    display_name: 'Voice Loop',
    gate: 'voice_broadcast_queue_gate',
    compass: 'status_dialogue.voice.broadcast_queue'
  }
]

const snapshot = buildSystemEventSnapshot({
  events,
  expectedPublishers,
  now,
  source: 'local_default',
  eventDir: 'runtime/status-events'
})

assert.equal(snapshot.events_total, 3)
assert.equal(snapshot.events_fresh, 3)
assert.equal(snapshot.events_stale, 0)
assert.equal(snapshot.events_critical, 1)
assert.deepEqual(snapshot.missing_publishers, [])

const requests = buildVoiceEventBroadcastRequestsFromSnapshot({
  snapshot,
  currentDialogueState: 'playing',
  limit: 5,
  createdAt: now.toISOString()
})

assert.equal(requests.length, 3)
assert.equal(requests[0].weight, 'critical')
assert.equal(requests[0].requested_play_mode, 'interrupt_now')
assert.equal(requests[1].weight, 'high')
assert.equal(requests[1].requested_play_mode, 'after_current_sentence')

const queue = buildVoiceBroadcastQueueState({
  requests,
  activeRequestId: requests[0].request_id,
  status: 'playing',
  generatedAt: now.toISOString()
})

assert.equal(queue.status, 'playing')
assert.equal(queue.queued_count, 3)
assert.equal(queue.critical_count, 1)
assert.equal(queue.high_count, 1)
assert.equal(queue.normal_count, 1)

const patches = buildVoiceScriptPatchesFromRequests({
  requests,
  events: snapshot.top_events,
  generatedAt: now.toISOString()
})

assert.equal(patches.length, 3)
assert.equal(patches.every((patch) => patch.voice_profile_lock === true), true)
assert.equal(patches[0].play_mode, 'interrupt_now')

const continuousBroadcastSegments = patches
  .filter((patch) => patch.play_mode !== 'silent')
  .map((patch) => [patch.bridge_line, patch.voice_text, patch.resume_line].filter(Boolean).join(' ').trim())
  .filter(Boolean)

assert.equal(continuousBroadcastSegments.length, 3)
assert.equal(continuousBroadcastSegments.every((segment) => segment.length > 20), true)
assert.equal(rendererSource.includes('STATUS_DIALOGUE_EVENT_BROADCAST_VOICE_MAX_PATCHES = 1'), true)
assert.equal(rendererSource.includes('STATUS_DIALOGUE_EVENT_BROADCAST_VOICE_MAX_CHARS = 88'), true)
assert.equal(rendererSource.includes('STATUS_DIALOGUE_FINAL_VOICE_MAX_CHARS = 180'), true)
assert.equal(rendererSource.includes('filterSpeakableVoiceEventRequests'), true)
assert.equal(rendererSource.includes("request.severity === 'critical' || request.severity === 'blocked'"), true)
assert.equal(rendererSource.includes("policyDecision.intent_lane === 'status_patrol'"), true)
assert.equal(rendererSource.includes('sanitizeSpeakableEventBroadcastVoiceLine'), true)
assert.equal(rendererSource.includes('meaningful.length < 4'), true)
assert.equal(rendererSource.includes('truncateVoiceLine(speechText, maxChars)'), true)
assert.equal(rendererSource.includes('unspoken_patrol_events'), true)
assert.equal(rendererSource.includes('unspokenPatrolEvents'), true)
assert.equal(rendererSource.includes('buildStatusDialogueCoreVoiceSummary'), true)
assert.equal(rendererSource.includes('humanizeStatusDialogueText(value)'), true)

assert.equal(humanizeStatusDialogueModuleId('capability_upgrade_registry'), '能力升级候选库')
assert.equal(humanizeStatusDialogueTerm('source_drift'), '源引用漂移')
assert.equal(humanizeStatusDialogueText('audit patrol state: source_drift').includes('源引用漂移'), true)

const naturalBlockedEvent = normalizeModuleStatusEvent({
  event_id: 'evt-natural-source-drift',
  generated_at: now.toISOString(),
  source_module: 'audit',
  source_node: 'audit.source_drift',
  event_type: 'fault',
  severity: 'blocked',
  headline: 'audit patrol state: source_drift',
  summary: 'audit patrol state: source_drift',
  completion: { current: 1, label: 'source_drift' },
  gate: 'audit_gate',
  compass: 'status_dialogue.audit',
  evidence_refs: ['source_drift'],
  recommended_broadcast: {
    speakable: true,
    mode: 'immediate',
    priority: 'urgent',
    emotion_hint: 'urgent'
  },
  ttl_ms: 300000,
  dedupe_key: 'audit:source-drift'
})
assert.ok(naturalBlockedEvent)
const naturalBlockedSnapshot = buildSystemEventSnapshot({
  events: [naturalBlockedEvent],
  expectedPublishers: [],
  now,
  source: 'local_default',
  eventDir: 'runtime/status-events'
})
const naturalBlockedRequests = buildVoiceEventBroadcastRequestsFromSnapshot({
  snapshot: naturalBlockedSnapshot,
  currentDialogueState: 'llm',
  limit: 1,
  createdAt: now.toISOString()
})
const naturalBlockedPatches = buildVoiceScriptPatchesFromRequests({
  requests: naturalBlockedRequests,
  events: naturalBlockedSnapshot.top_events,
  generatedAt: now.toISOString()
})
assert.equal(naturalBlockedPatches.length, 1)
assert.equal(naturalBlockedPatches[0].voice_text.includes('审计模块'), true)
assert.equal(naturalBlockedPatches[0].voice_text.includes('阻塞'), true)
assert.equal(naturalBlockedPatches[0].voice_text.includes('源引用漂移'), true)
assert.equal(naturalBlockedPatches[0].voice_text.includes('source_drift'), false)

function runStatusPatrolPhraseRegression() {
  const probeSource = `
const {
  buildSystemEventSnapshot,
  buildVoiceEventBroadcastRequestsFromSnapshot,
  buildVoiceScriptPatchesFromRequests,
  normalizeModuleStatusEvent
} = require('./src/core/status-dialogue/status-events.ts')
const { buildDialoguePolicyDecision } = require('./src/core/status-dialogue/dialogue-policy.ts')

const rawEvents = JSON.parse(process.env.STATUS_DIALOGUE_EVENT_BROADCAST_FIXTURE || '[]')
const now = new Date('2026-06-29T10:00:00.000Z')
const events = rawEvents.map((event) => normalizeModuleStatusEvent(event)).filter(Boolean)
const snapshot = buildSystemEventSnapshot({
  events,
  expectedPublishers: [],
  now,
  source: 'local_default',
  eventDir: 'runtime/status-events'
})
const statusSnapshot = {
  schema: 'status_snapshot.v1',
  generated_at: now.toISOString(),
  global_status: 'blocked',
  cards_total: 0,
  cards_fresh: 0,
  cards_stale: 0,
  cards_missing: 0,
  cards: [],
  missing_module_ids: [],
  stale_module_ids: [],
  conflict_module_ids: [],
  patrol_findings: [],
  read_errors: [],
  source: 'local_default'
}
const focus = {
  title: '\\u4e16\\u754c\\u7cfb\\u7edf\\u6838\\u5fc3',
  status: 'blocked',
  detail: 'core',
  depth: 'global',
  owner: 'World System Architecture',
  gate: 'core_alignment_gate',
  compass: 'core.world-core',
  childCount: 10
}
function shouldSpeakVoiceEventBroadcast(policyDecision) {
  if (!policyDecision.turn_intent.should_run_patrol) return false
  return (
    policyDecision.turn_intent.intent === 'status_patrol' ||
    policyDecision.turn_intent.intent === 'voice_control' ||
    policyDecision.intent_lane === 'status_patrol' ||
    policyDecision.intent_lane === 'progress_audit' ||
    policyDecision.intent_lane === 'error_recovery'
  )
}
const queries = [
  '\\u68c0\\u67e5\\u5f53\\u524d\\u8fd0\\u884c\\u72b6\\u6001',
  '\\u5f53\\u524d\\u8fd0\\u884c\\u72b6\\u6001\\u600e\\u4e48\\u6837',
  '\\u8fd0\\u884c\\u72b6\\u6001',
  '\\u6aa2\\u67e5\\u7576\\u524d\\u72c0\\u614b\\u5de1\\u6aa2',
  '\\u6aa2\\u67e5\\u7576\\u524d\\u904b\\u884c\\u72c0\\u614b'
]
const cases = queries.map((query) => {
  const policyDecision = buildDialoguePolicyDecision({
    userQuery: query,
    focus,
    snapshot: statusSnapshot,
    config: undefined,
    patrolInsertions: [],
    generatedAt: now.toISOString()
  })
  const eventRequests = buildVoiceEventBroadcastRequestsFromSnapshot({
    snapshot,
    currentDialogueState: 'llm',
    limit: 3,
    createdAt: now.toISOString()
  })
  const speakableRequests = shouldSpeakVoiceEventBroadcast(policyDecision)
    ? eventRequests.filter((request) => request.severity === 'critical' || request.severity === 'blocked')
    : []
  const voiceScriptPatches = buildVoiceScriptPatchesFromRequests({
    requests: speakableRequests,
    events: snapshot.top_events,
    generatedAt: now.toISOString()
  })
  return {
    query,
    turn_intent: policyDecision.turn_intent.intent,
    intent_lane: policyDecision.intent_lane,
    should_run_patrol: policyDecision.turn_intent.should_run_patrol,
    evidence: policyDecision.turn_intent.evidence,
    patch_ids: voiceScriptPatches.map((patch) => patch.patch_id),
    event_patch_count: voiceScriptPatches.filter((patch) => patch.play_mode !== 'silent').length
  }
})
console.log(JSON.stringify(cases))
`
  const stdout = execFileSync(process.execPath, ['-r', 'ts-node/register', '-e', probeSource], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      TS_NODE_COMPILER_OPTIONS: JSON.stringify({ target: 'es2018', module: 'commonjs' }),
      STATUS_DIALOGUE_EVENT_BROADCAST_FIXTURE: JSON.stringify(rawEvents)
    }
  })
  return JSON.parse(stdout)
}

const statusPatrolPhraseCases = runStatusPatrolPhraseRegression()
assert.equal(statusPatrolPhraseCases.length, 5)
for (const phraseCase of statusPatrolPhraseCases) {
  assert.equal(phraseCase.turn_intent, 'status_patrol')
  assert.ok(['status_patrol', 'progress_audit'].includes(phraseCase.intent_lane))
  assert.equal(phraseCase.should_run_patrol, true)
  assert.ok(phraseCase.patch_ids.length > 0)
  assert.ok(phraseCase.event_patch_count > 0)
}

const manifest = buildDefaultSystemFeedbackRouteManifest({
  module_id: 'new-system-demo',
  display_name: 'New System Demo',
  owner: 'Runtime Integration',
  gate: 'demo_status_event_gate',
  compass: 'status_dialogue.demo'
})
const manifestValidation = validateSystemFeedbackRouteManifest(manifest, now.toISOString())
assert.equal(manifestValidation.ok, true)
assert.equal(manifestValidation.required_outputs.module_status_card, true)
assert.equal(manifestValidation.required_outputs.module_status_event, true)

const invalidManifestValidation = validateSystemFeedbackRouteManifest({}, now.toISOString())
assert.equal(invalidManifestValidation.ok, false)
assert.ok(invalidManifestValidation.missing_fields.includes('module_id'))

const report = {
  schema: 'status_dialogue_event_broadcast_validation.v1',
  generated_at: new Date().toISOString(),
  ok: true,
  snapshot: {
    total: snapshot.events_total,
    fresh: snapshot.events_fresh,
    stale: snapshot.events_stale,
    critical: snapshot.events_critical
  },
  queue: {
    status: queue.status,
    queued_count: queue.queued_count,
    critical_count: queue.critical_count,
    high_count: queue.high_count,
    normal_count: queue.normal_count,
    next_request_id: queue.next_request_id
  },
  continuous_broadcast: {
    segments: continuousBroadcastSegments.length,
    play_modes: patches.map((patch) => patch.play_mode),
      voice_profile_lock_all: patches.every((patch) => patch.voice_profile_lock === true),
      tts_budget: {
        max_patches: 1,
        max_chars: 88,
        final_voice_max_chars: 180,
        source: rendererPath
      }
  },
  manifest_validation: {
    valid_ok: manifestValidation.ok,
    invalid_ok: invalidManifestValidation.ok,
    invalid_missing_fields: invalidManifestValidation.missing_fields
  },
  status_patrol_phrase_regression: {
    cases: statusPatrolPhraseCases
  }
}

const outputDir = path.join(process.cwd(), 'runtime', 'voice-loop-probes')
fs.mkdirSync(outputDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const outputPath = path.join(outputDir, `status-dialogue-event-broadcast-validation-${stamp}.json`)
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(JSON.stringify({ ok: true, outputPath, report }, null, 2))
