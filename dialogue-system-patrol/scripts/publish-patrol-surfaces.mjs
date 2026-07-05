import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { timelineSummary } from './build-timeline-lib.mjs'

const ROOT = path.resolve('.')
const REGISTRY_PATH = 'dialogue-system-patrol/registry/system-patrol-registry.json'
const SYSTEM_PATROL_VALIDATION_PATH = 'runtime/dialogue-system-patrol-validations/latest.json'
const MODULE_GATE_PATH = 'runtime/dialogue-system-patrol-module-gates/latest.json'
const PUBLISH_REPORT_PATH = 'runtime/dialogue-system-patrol/latest.json'
const SOURCE_DRIFT_PATH = 'runtime/dialogue-system-patrol-source-drift/latest.json'
const DIALOGUE_INDEX_PATH = 'runtime/dialogue-system-patrol/dialogue-read-index.json'
const DIALOGUE_INDEX_MD_PATH = 'runtime/dialogue-system-patrol/dialogue-read-index.md'
const OS_PROJECTION_PATH = 'dialogue-system-patrol/os-particle-projection.json'

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.resolve(ROOT, relativePath), 'utf8'))
}

function readJsonIfExists(relativePath) {
  const resolved = path.resolve(ROOT, relativePath)
  return existsSync(resolved) ? JSON.parse(readFileSync(resolved, 'utf8')) : null
}

function writeJson(relativePath, value) {
  const resolved = path.resolve(ROOT, relativePath)
  mkdirSync(path.dirname(resolved), { recursive: true })
  writeFileSync(resolved, JSON.stringify(value, null, 2) + '\n')
}

function writeText(relativePath, value) {
  const resolved = path.resolve(ROOT, relativePath)
  mkdirSync(path.dirname(resolved), { recursive: true })
  writeFileSync(resolved, value)
}

function isReadyValidation(validation) {
  return validation?.gate_decision === 'system_patrol_validated'
    && (validation.required_failures ?? []).length === 0
    && (validation.warning_failures ?? []).length === 0
}

function isReadyGate(gate) {
  return gate?.gate_decision === 'module_onboarding_ready'
    && (gate.required_failures ?? []).length === 0
    && (gate.warning_failures ?? []).length === 0
}

function isReadySourceDrift(sourceDrift) {
  return ['source_hash_current', 'source_hash_baseline_updated'].includes(sourceDrift?.gate_decision)
    && (sourceDrift.required_failures ?? []).length === 0
}

function findModuleGate(gate, moduleId) {
  return (gate?.modules ?? []).find((item) => item.module_id === moduleId)
}

function findSourceDrift(sourceDrift, moduleId) {
  return (sourceDrift?.modules ?? []).find((item) => item.module_id === moduleId)
}

function makeDialogueIndexMarkdown(index) {
  const rows = index.modules
    .map((item) => `| ${item.module_id} | ${item.status_card_output} | ${item.status_event_output} | ${item.build_timeline_phase}/${item.build_timeline_status} | ${item.patrol_state} | ${item.source_hash_status} | ${item.module_gate_decision} |`)
    .join('\n')
  return [
    '# System Patrol Dialogue Read Index',
    '',
    `- schema: ${index.schema}`,
    `- generated_at: ${index.generated_at}`,
    `- gate_decision: ${index.gate_decision}`,
    `- strict_mode: ${index.strict_mode}`,
    `- modules_total: ${index.modules_total}`,
    '',
    '| Module | Status card | Status event | Build timeline | Patrol state | Source hash | Module gate |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    rows,
    ''
  ].join('\n')
}

function main() {
  const generatedAt = new Date().toISOString()
  const registry = readJson(REGISTRY_PATH)
  const validation = readJsonIfExists(SYSTEM_PATROL_VALIDATION_PATH)
  const moduleGate = readJsonIfExists(MODULE_GATE_PATH)
  const publishReport = readJsonIfExists(PUBLISH_REPORT_PATH)
  const sourceDrift = readJsonIfExists(SOURCE_DRIFT_PATH)
  const findingsByModule = new Map((validation?.module_findings ?? []).map((item) => [item.module_id, item]))

  const modules = (registry.entries ?? [])
    .filter((entry) => entry.coverage !== 'excluded')
    .map((entry) => {
      const finding = findingsByModule.get(entry.module_id)
      const gate = findModuleGate(moduleGate, entry.module_id)
      const sourceDriftModule = findSourceDrift(sourceDrift, entry.module_id)
      const timeline = timelineSummary({ root: ROOT, entry })
      return {
        module_id: entry.module_id,
        display_name: entry.display_name,
        owner: entry.owner,
        gate: entry.gate,
        compass: entry.compass,
        process_tree_node_id: entry.process_tree_node_id,
        coverage: entry.coverage,
        status_card_output: entry.status_card_output,
        status_event_output: entry.status_event_output,
        build_timeline_output: timeline.output,
        build_timeline_events_total: timeline.events_total,
        build_timeline_event_id: timeline.latest_event_id,
        build_timeline_generated_at: timeline.latest_generated_at,
        build_timeline_phase: timeline.latest_phase,
        build_timeline_status: timeline.latest_status,
        build_timeline_summary: timeline.latest_summary,
        build_timeline_operation_id: timeline.operation_id,
        build_timeline_required_failures: timeline.validation_errors,
        patrol_block_path: entry.patrol_block_path,
        patrol_state: finding?.patrol_state ?? 'unknown',
        patrol_findings: finding?.findings ?? ['missing_validation_finding'],
        source_hash_status: sourceDriftModule?.status ?? 'missing_source_drift_report',
        source_hash: sourceDriftModule?.computed_hash ?? null,
        source_hash_required_failures: sourceDriftModule?.required_failures ?? ['missing_source_drift_report'],
        module_gate_decision: gate?.gate_decision ?? 'missing_module_gate',
        required_failures: gate?.required_failures ?? [],
        warning_failures: gate?.warning_failures ?? []
      }
    })

  const validationReady = isReadyValidation(validation)
  const moduleGateReady = isReadyGate(moduleGate)
  const sourceDriftReady = isReadySourceDrift(sourceDrift)
  const publishedReady = publishReport?.modules_total === modules.length
    && publishReport?.cards_written === modules.length
    && publishReport?.events_written >= modules.length
  const gateDecision = validationReady && moduleGateReady && publishedReady && sourceDriftReady
    ? 'dialogue_patrol_readable'
    : 'dialogue_patrol_attention_required'

  const index = {
    schema: 'system_patrol_dialogue_read_index.v1',
    generated_at: generatedAt,
    gate_decision: gateDecision,
    strict_mode: registry.mode === 'strict_required_coverage' && registry.strict_missing_blocks === true,
    modules_total: modules.length,
    source: {
      registry_ref: REGISTRY_PATH,
      validation_ref: SYSTEM_PATROL_VALIDATION_PATH,
      module_gate_ref: MODULE_GATE_PATH,
      publish_report_ref: PUBLISH_REPORT_PATH,
      source_drift_ref: SOURCE_DRIFT_PATH
    },
    dialogue_reader_contracts: {
      status_card_schema: 'module_status_card.v1',
      status_event_schema: 'module_status_event.v1',
      build_timeline_schema: 'module_build_timeline_event.v1',
      status_card_dir: 'runtime/status-cards',
      status_event_dir: 'runtime/status-events',
      build_timeline_dir: 'runtime/module-build-timelines',
      existing_reader_files: [
        'sightflow-desktop-agent-main/src/core/status-dialogue/contracts.ts',
        'sightflow-desktop-agent-main/src/core/status-dialogue/status-events.ts',
        'sightflow-desktop-agent-main/src/main/index.ts'
      ]
    },
    modules,
    boundaries: [
      'read-only dialogue index',
      'summary-only status refs',
      'no raw private payload',
      'additive build timeline fields preserve current card/event contracts',
      'no external action'
    ]
  }

  const osProjection = {
    schema: 'dialogue_system_patrol_os_projection.v1',
    generated_at: generatedAt,
    source_only: true,
    module_id: 'dialogue_system_patrol',
    label: 'Dialogue System Patrol',
    status: gateDecision,
    projection: {
      region_id: 'self',
      node_id: 'dialogue-system-patrol',
      kind: 'patrol_governance',
      reads: [
        DIALOGUE_INDEX_PATH,
        SYSTEM_PATROL_VALIDATION_PATH,
        MODULE_GATE_PATH,
        SOURCE_DRIFT_PATH,
        'runtime/module-build-timelines/**'
      ],
      writes: [
        'runtime/status-cards/**',
        'runtime/status-events/**',
        'runtime/module-build-timelines/**',
        'runtime/dialogue-system-patrol/**',
        'runtime/dialogue-system-patrol-validations/**',
        'runtime/dialogue-system-patrol-module-gates/**'
      ]
    },
    source_refs: [
      REGISTRY_PATH,
      SYSTEM_PATROL_VALIDATION_PATH,
      MODULE_GATE_PATH,
      SOURCE_DRIFT_PATH,
      'runtime/module-build-timelines/**',
      DIALOGUE_INDEX_PATH
    ],
    boundaries: [
      'source-only projection',
      'display/status reference only',
      'no ipc connection',
      'no world-model write',
      'no business module mutation',
      'no external action'
    ]
  }

  writeJson(DIALOGUE_INDEX_PATH, index)
  writeText(DIALOGUE_INDEX_MD_PATH, makeDialogueIndexMarkdown(index))
  writeJson(OS_PROJECTION_PATH, osProjection)

  console.log(JSON.stringify({
    command: 'publish-patrol-surfaces',
    gate_decision: gateDecision,
    strict_mode: index.strict_mode,
    modules_total: modules.length,
    dialogue_index_path: path.resolve(ROOT, DIALOGUE_INDEX_PATH),
    os_projection_path: path.resolve(ROOT, OS_PROJECTION_PATH)
  }, null, 2))

  if (gateDecision !== 'dialogue_patrol_readable') process.exitCode = 2
}

main()
