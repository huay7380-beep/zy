const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(root, '..')
const rendererPath = path.join(root, 'src', 'renderer', 'src', 'zhineng-console', 'ZhinengConsole.tsx')
const contractsPath = path.join(root, 'src', 'core', 'status-dialogue', 'contracts.ts')
const dialoguePolicyPath = path.join(root, 'src', 'core', 'status-dialogue', 'dialogue-policy.ts')
const mainPath = path.join(root, 'src', 'main', 'index.ts')
const statePolicyValidatorPath = path.join(root, 'scripts', 'validate-status-dialogue-state-policy.cjs')
const dialogueReadIndexPath = path.join(workspaceRoot, 'runtime', 'dialogue-system-patrol', 'dialogue-read-index.json')

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function readJson(filePath) {
  return JSON.parse(readText(filePath))
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item) || 'unknown'
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
}

function listMissing(checks) {
  return Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)
}

const renderer = readText(rendererPath)
const contracts = readText(contractsPath)
const dialoguePolicy = readText(dialoguePolicyPath)
const main = readText(mainPath)
const statePolicyValidator = readText(statePolicyValidatorPath)
const dialogueReadIndex = readJson(dialogueReadIndexPath)
const modules = Array.isArray(dialogueReadIndex.modules) ? dialogueReadIndex.modules : []

const moduleCounts = {
  patrol_state: countBy(modules, (module) => module.patrol_state),
  source_hash_status: countBy(modules, (module) => module.source_hash_status),
  module_gate_decision: countBy(modules, (module) => module.module_gate_decision)
}

const checks = {
  runtime_index_file_readable: fs.existsSync(dialogueReadIndexPath),
  runtime_index_schema_valid: dialogueReadIndex.schema === 'system_patrol_dialogue_read_index.v1',
  runtime_index_modules_consistent:
    Number.isInteger(dialogueReadIndex.modules_total) &&
    dialogueReadIndex.modules_total === modules.length &&
    modules.length > 0,
  runtime_index_reader_contracts_present:
    dialogueReadIndex.dialogue_reader_contracts?.status_card_dir === 'runtime/status-cards' &&
    dialogueReadIndex.dialogue_reader_contracts?.status_event_dir === 'runtime/status-events',
  contracts_define_index_summary:
    contracts.includes('SYSTEM_PATROL_DIALOGUE_READ_INDEX_SCHEMA') &&
    contracts.includes('SystemPatrolDialogueIndexSummary') &&
    contracts.includes('normalizeSystemPatrolDialogueReadIndex') &&
    contracts.includes('summarizeSystemPatrolDialogueReadIndex'),
  main_exposes_read_only_ipc:
    main.includes("ipcMain.handle('zhineng:status-dialogue:patrol-index:get'") &&
    main.includes('readStatusPatrolDialogueIndex') &&
    main.includes('resolveStatusPatrolDialogueIndexPath'),
  main_rejects_absolute_or_escaping_index_path:
    main.includes('isAbsolute(indexPath)') &&
    main.includes("relativePath.startsWith('..')") &&
    main.includes('system patrol dialogue index path escapes project root'),
  renderer_requests_index_before_model:
    renderer.includes('requestStatusPatrolDialogueIndex()') &&
    renderer.includes('nextPatrolIndexState') &&
    renderer.includes('systemPatrolIndexSummary: nextPatrolIndexState.summary'),
  renderer_injects_index_into_context_and_prompt:
    renderer.includes('systemPatrolIndexSummary?: SystemPatrolDialogueIndexSummary') &&
    renderer.includes('systemPatrolIndexSummary,') &&
    renderer.includes('system_patrol_index_summary: context.systemPatrolIndexSummary'),
  policy_builds_index_patrol_insert:
    dialoguePolicy.includes('buildPatrolFindingInsertFromSystemPatrolIndexSummary') &&
    dialoguePolicy.includes("source_type: 'system_patrol_index'") &&
    dialoguePolicy.includes('sourceHashBlocked'),
  local_fallback_preserves_index_refs:
    renderer.includes('patrol_index: ${systemPatrolIndexSummary.gate_decision}') &&
    renderer.includes('system_patrol_dialogue_read_index.v1'),
  ui_exposes_index_status:
    renderer.includes('patrol index <strong>{patrolIndexSummary.gate_decision}</strong>') &&
    renderer.includes('refresh patrol index') &&
    renderer.includes('patrolIndexSourceHashBlocked'),
  state_policy_validator_guards_index_read:
    statePolicyValidator.includes('patrol_dialogue_read_index_contract_available') &&
    statePolicyValidator.includes('patrol_dialogue_read_index_prompt_included') &&
    statePolicyValidator.includes('patrol_dialogue_read_index_ui_visible')
}

const ok = Object.values(checks).every(Boolean)
const outputDir = path.join(root, 'runtime', 'verification-reports')
fs.mkdirSync(outputDir, { recursive: true })
const outputPath = path.join(outputDir, `status-dialogue-patrol-index-read-${Date.now()}.json`)
const report = {
  schema: 'status_dialogue_patrol_index_read_validation.v1',
  generated_at: new Date().toISOString(),
  result: ok ? 'passed' : 'failed',
  files: {
    renderer: rendererPath,
    contracts: contractsPath,
    dialogue_policy: dialoguePolicyPath,
    main: mainPath,
    state_policy_validator: statePolicyValidatorPath,
    dialogue_read_index: dialogueReadIndexPath
  },
  runtime_index: {
    schema: dialogueReadIndex.schema,
    generated_at: dialogueReadIndex.generated_at,
    gate_decision: dialogueReadIndex.gate_decision,
    strict_mode: dialogueReadIndex.strict_mode === true,
    modules_total: dialogueReadIndex.modules_total,
    modules_read: modules.length,
    modules_by_patrol_state: moduleCounts.patrol_state,
    modules_by_source_hash_status: moduleCounts.source_hash_status,
    modules_by_gate_decision: moduleCounts.module_gate_decision,
    source_refs: Object.values(dialogueReadIndex.source || {})
  },
  checks,
  missing_checks: listMissing(checks),
  conclusion: ok
    ? 'Dialogue module direct read of runtime/dialogue-system-patrol/dialogue-read-index.json is wired and guarded.'
    : 'Dialogue module patrol index read wiring is incomplete; inspect missing_checks.'
}

fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
console.log(
  JSON.stringify(
    {
      ok,
      outputPath,
      runtime_index: report.runtime_index,
      missing_checks: report.missing_checks
    },
    null,
    2
  )
)
process.exit(ok ? 0 : 1)
