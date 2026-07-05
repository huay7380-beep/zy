import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  SOURCE_HASH_ALGORITHM,
  computeBlockSourceFingerprint,
  sourceHashMatches
} from './source-hash-lib.mjs'
import {
  readTimelineEvents,
  timelinePathForEntry,
  validateTimelineEvents
} from './build-timeline-lib.mjs'

const ROOT = path.resolve('.')
const REGISTRY_PATH = 'dialogue-system-patrol/registry/system-patrol-registry.json'
const PROCESS_TREE_PATH = 'examples/system-process-tree.json'
const SCHEMA_DIR = 'dialogue-system-patrol/schemas'
const VALIDATION_ROOT = 'runtime/dialogue-system-patrol-validations'
const PRIVATE_KEY_PATTERN = /(raw_payload|raw_audio|private_payload|secret_value|password|token_value)/i

function argValue(name) {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

function toIdTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '')
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readJson(relativePath) {
  const filePath = path.resolve(ROOT, relativePath)
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function safeRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    return { ok: false, error: 'path_empty' }
  }
  if (path.isAbsolute(relativePath)) {
    return { ok: false, error: 'path_must_be_relative' }
  }
  const resolved = path.resolve(ROOT, relativePath)
  const rel = path.relative(ROOT, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: 'path_escapes_workspace' }
  }
  return { ok: true, resolved, rel: rel.replace(/\\/g, '/') }
}

function hasRawPrivateKey(value, trail = []) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = hasRawPrivateKey(value[index], [...trail, String(index)])
      if (found) return found
    }
    return null
  }
  if (!isRecord(value)) return null
  for (const [key, child] of Object.entries(value)) {
    if (PRIVATE_KEY_PATTERN.test(key)) return [...trail, key].join('.')
    const found = hasRawPrivateKey(child, [...trail, key])
    if (found) return found
  }
  return null
}

function requiredString(record, field) {
  return typeof record[field] === 'string' && record[field].trim().length > 0
}

function requiredArray(record, field) {
  return Array.isArray(record[field])
}

function validateRegistryShape(registry) {
  const missing = []
  for (const field of [
    'schema',
    'generated_at',
    'mode',
    'source_refs',
    'default_coverage',
    'strict_missing_blocks',
    'entries',
    'rules'
  ]) {
    if (!(field in registry)) missing.push(field)
  }
  if (registry.schema !== 'system_patrol_registry.v1') missing.push('schema=system_patrol_registry.v1')
  if (!Array.isArray(registry.entries)) missing.push('entries[]')
  if (!Array.isArray(registry.source_refs)) missing.push('source_refs[]')
  return missing
}

function validateRegistryEntryShape(entry) {
  const missing = []
  for (const field of [
    'module_id',
    'display_name',
    'owner',
    'source',
    'coverage',
    'patrol_block_path',
    'status_card_output',
    'status_event_output',
    'build_timeline_output',
    'gate',
    'compass',
    'ttl_ms'
  ]) {
    if (field === 'ttl_ms') {
      if (!(typeof entry[field] === 'number' && Number.isFinite(entry[field]) && entry[field] > 0)) missing.push(field)
    } else if (!requiredString(entry, field)) {
      missing.push(field)
    }
  }
  if (!['process_tree', 'local_bootstrap', 'manual'].includes(entry.source)) missing.push('source_known')
  if (!['required', 'parent_covered', 'excluded', 'missing'].includes(entry.coverage)) missing.push('coverage_known')
  if (entry.coverage === 'parent_covered' && !requiredString(entry, 'parent_module_id')) missing.push('parent_module_id')
  if (entry.coverage === 'excluded' && !requiredString(entry, 'reason')) missing.push('reason')
  return missing
}

function validatePatrolBlockShape(block) {
  const missing = []
  const stringFields = [
    'schema',
    'module_id',
    'display_name',
    'owner',
    'source_dir',
    'gate',
    'compass',
    'patrol_contract_version',
    'lifecycle',
    'updated_at',
    'change_session_id'
  ]
  for (const field of stringFields) {
    if (!requiredString(block, field)) missing.push(field)
  }
  if (block.schema !== 'module_patrol_block.v1') missing.push('schema=module_patrol_block.v1')
  if (!(typeof block.ttl_ms === 'number' && Number.isFinite(block.ttl_ms) && block.ttl_ms > 0)) missing.push('ttl_ms')
  if (!isRecord(block.data_flow)) missing.push('data_flow')
  if (!isRecord(block.state)) missing.push('state')
  if (!isRecord(block.evidence)) missing.push('evidence')
  if (!isRecord(block.boundaries)) missing.push('boundaries')
  if (!isRecord(block.dialogue_limits)) missing.push('dialogue_limits')
  if (!isRecord(block.versioning)) missing.push('versioning')
  if (isRecord(block.data_flow)) {
    for (const field of ['inputs', 'processing', 'outputs', 'dependencies']) {
      if (!requiredArray(block.data_flow, field)) missing.push(`data_flow.${field}`)
    }
  }
  if (isRecord(block.state)) {
    for (const field of ['headline', 'current_task', 'progress', 'blockers', 'risks', 'next']) {
      if (field === 'progress') {
        if (!(typeof block.state.progress === 'number' && block.state.progress >= 0 && block.state.progress <= 1)) {
          missing.push('state.progress')
        }
      } else if (field === 'headline' || field === 'current_task') {
        if (!requiredString(block.state, field)) missing.push(`state.${field}`)
      } else if (!requiredArray(block.state, field)) {
        missing.push(`state.${field}`)
      }
    }
  }
  if (isRecord(block.evidence)) {
    for (const field of ['source_refs', 'validation_commands', 'latest_validation_refs']) {
      if (!requiredArray(block.evidence, field)) missing.push(`evidence.${field}`)
    }
  }
  if (isRecord(block.boundaries)) {
    for (const field of ['mode', 'allowed_reads', 'allowed_writes', 'forbidden_actions', 'confirmation_gates']) {
      if (field === 'mode') {
        if (!requiredString(block.boundaries, field)) missing.push(`boundaries.${field}`)
      } else if (!requiredArray(block.boundaries, field)) {
        missing.push(`boundaries.${field}`)
      }
    }
  }
  if (isRecord(block.dialogue_limits)) {
    for (const field of ['may_say', 'must_not_infer']) {
      if (!requiredArray(block.dialogue_limits, field)) missing.push(`dialogue_limits.${field}`)
    }
  }
  if (isRecord(block.versioning)) {
    if (!requiredArray(block.versioning, 'supersedes')) missing.push('versioning.supersedes')
    if (typeof block.versioning.source_hash !== 'string') missing.push('versioning.source_hash')
    if (block.versioning.source_hash_algorithm !== SOURCE_HASH_ALGORITHM) missing.push('versioning.source_hash_algorithm')
    if (!requiredString(block.versioning, 'source_hash_generated_at')) missing.push('versioning.source_hash_generated_at')
    if (!requiredArray(block.versioning, 'source_hash_refs')) missing.push('versioning.source_hash_refs')
    if (!requiredArray(block.versioning, 'source_hash_excluded_refs')) missing.push('versioning.source_hash_excluded_refs')
  }
  return missing
}

function validateStatusCard(card) {
  if (!isRecord(card)) return ['not_object']
  const missing = []
  for (const field of [
    'schema',
    'module_id',
    'display_name',
    'owner',
    'gate',
    'status',
    'updated_at',
    'ttl_ms',
    'headline',
    'current_focus',
    'current_task',
    'inputs',
    'outputs',
    'blockers',
    'risks',
    'next',
    'confidence',
    'source_refs',
    'visibility'
  ]) {
    if (!(field in card)) missing.push(field)
  }
  if (card.schema !== 'module_status_card.v1') missing.push('schema=module_status_card.v1')
  return missing
}

function extractEvents(parsed) {
  if (Array.isArray(parsed)) return parsed
  if (isRecord(parsed) && Array.isArray(parsed.events)) return parsed.events
  return [parsed]
}

function validateStatusEvents(parsed) {
  const events = extractEvents(parsed)
  const errors = []
  for (const event of events) {
    if (!isRecord(event)) {
      errors.push('event_not_object')
      continue
    }
    for (const field of [
      'schema',
      'event_id',
      'generated_at',
      'source_module',
      'source_node',
      'event_type',
      'severity',
      'headline',
      'summary',
      'gate',
      'compass',
      'evidence_refs',
      'recommended_broadcast',
      'ttl_ms',
      'dedupe_key',
      'boundary'
    ]) {
      if (!(field in event)) errors.push(`${event.event_id ?? 'unknown'}.${field}`)
    }
    if (event.schema !== 'module_status_event.v1') errors.push(`${event.event_id ?? 'unknown'}.schema`)
  }
  return errors
}

function isFresh(updatedAt, ttlMs, nowMs) {
  const parsed = Date.parse(updatedAt)
  return Number.isFinite(parsed) && nowMs - parsed <= ttlMs
}

function check(status, check) {
  status.checks.push(check)
  if (!check.passed) {
    const target = check.severity === 'required' ? status.required_failures : status.warning_failures
    target.push(check.check_id)
  }
}

function makeMarkdown(report) {
  const rows = report.checks
    .map((item) => `| ${item.check_id} | ${item.severity} | ${item.status} | ${item.evidence.join('; ')} |`)
    .join('\n')
  const moduleRows = report.module_findings
    .map((item) => `| ${item.module_id} | ${item.coverage} | ${item.patrol_state} | ${item.findings.join('; ')} |`)
    .join('\n')
  return [
    '# System Patrol Validation',
    '',
    `- validation_id: ${report.validation_id}`,
    `- created_at: ${report.created_at}`,
    `- gate_decision: ${report.gate_decision}`,
    `- required_failures: ${report.required_failures.length}`,
    `- warning_failures: ${report.warning_failures.length}`,
    '',
    '## Checks',
    '',
    '| Check | Severity | Status | Evidence |',
    '| --- | --- | --- | --- |',
    rows,
    '',
    '## Module Findings',
    '',
    '| Module | Coverage | Patrol state | Findings |',
    '| --- | --- | --- | --- |',
    moduleRows,
    ''
  ].join('\n')
}

function writeReport(report, outputDir) {
  const validationDir = outputDir ?? path.resolve(ROOT, VALIDATION_ROOT, report.validation_id)
  mkdirSync(validationDir, { recursive: true })
  mkdirSync(path.resolve(ROOT, VALIDATION_ROOT), { recursive: true })
  const jsonPath = path.join(validationDir, 'system-patrol-validation.json')
  const mdPath = path.join(validationDir, 'system-patrol-validation.md')
  const latestJson = path.resolve(ROOT, VALIDATION_ROOT, 'latest.json')
  const latestMd = path.resolve(ROOT, VALIDATION_ROOT, 'latest.md')
  const markdown = makeMarkdown(report)
  writeFileSync(jsonPath, JSON.stringify(report, null, 2))
  writeFileSync(mdPath, markdown)
  writeFileSync(latestJson, JSON.stringify(report, null, 2))
  writeFileSync(latestMd, markdown)
  return { json_path: jsonPath, markdown_path: mdPath, latest_json: latestJson, latest_markdown: latestMd }
}

function main() {
  const now = new Date()
  const nowMs = now.getTime()
  const validationId = `system_patrol_validation_${toIdTimestamp(now)}`
  const status = {
    checks: [],
    module_findings: [],
    required_failures: [],
    warning_failures: []
  }
  const processTreePath = argValue('process-tree') ?? PROCESS_TREE_PATH
  const registryPath = argValue('registry') ?? REGISTRY_PATH
  const outputDir = argValue('output-dir') ? path.resolve(ROOT, argValue('output-dir')) : undefined

  let processTree = null
  let registry = null
  try {
    processTree = readJson(processTreePath)
    check(status, {
      check_id: 'process_tree_readable',
      label: 'Process tree is readable',
      severity: 'required',
      status: 'pass',
      passed: true,
      evidence: [processTreePath]
    })
  } catch (error) {
    check(status, {
      check_id: 'process_tree_readable',
      label: 'Process tree is readable',
      severity: 'required',
      status: 'fail',
      passed: false,
      evidence: [String(error).slice(0, 160)]
    })
  }

  try {
    registry = readJson(registryPath)
    const missing = validateRegistryShape(registry)
    check(status, {
      check_id: 'registry_shape',
      label: 'System patrol registry has required shape',
      severity: 'required',
      status: missing.length ? 'fail' : 'pass',
      passed: missing.length === 0,
      evidence: missing.length ? missing : [registryPath]
    })
  } catch (error) {
    check(status, {
      check_id: 'registry_shape',
      label: 'System patrol registry has required shape',
      severity: 'required',
      status: 'fail',
      passed: false,
      evidence: [String(error).slice(0, 160)]
    })
  }

  const schemaDir = safeRelativePath(SCHEMA_DIR)
  if (schemaDir.ok && existsSync(schemaDir.resolved)) {
    const schemaErrors = []
    for (const entry of readdirSync(schemaDir.resolved, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      try {
        JSON.parse(readFileSync(path.join(schemaDir.resolved, entry.name), 'utf8'))
      } catch (error) {
        schemaErrors.push(`${entry.name}: ${String(error).slice(0, 100)}`)
      }
    }
    check(status, {
      check_id: 'schema_files_parse',
      label: 'Patrol schema files parse as JSON',
      severity: 'required',
      status: schemaErrors.length ? 'fail' : 'pass',
      passed: schemaErrors.length === 0,
      evidence: schemaErrors.length ? schemaErrors : [SCHEMA_DIR]
    })
  } else {
    check(status, {
      check_id: 'schema_files_parse',
      label: 'Patrol schema files parse as JSON',
      severity: 'required',
      status: 'fail',
      passed: false,
      evidence: [schemaDir.error ?? 'schema_dir_missing']
    })
  }

  const processNodeIds = new Set()
  if (processTree && Array.isArray(processTree.nodes)) {
    for (const node of processTree.nodes) {
      if (isRecord(node) && typeof node.node_id === 'string') processNodeIds.add(node.node_id)
    }
  }
  const entries = registry && Array.isArray(registry.entries) ? registry.entries : []
  const registryByNode = new Map()
  const seenModuleIds = new Set()
  const duplicateModuleIds = []

  for (const entry of entries) {
    if (!isRecord(entry)) continue
    if (seenModuleIds.has(entry.module_id)) duplicateModuleIds.push(entry.module_id)
    seenModuleIds.add(entry.module_id)
    if (entry.source === 'process_tree' && typeof entry.process_tree_node_id === 'string') {
      registryByNode.set(entry.process_tree_node_id, entry)
    }
  }

  check(status, {
    check_id: 'module_ids_unique',
    label: 'Registry module ids are unique',
    severity: 'required',
    status: duplicateModuleIds.length ? 'fail' : 'pass',
    passed: duplicateModuleIds.length === 0,
    evidence: duplicateModuleIds.length ? duplicateModuleIds : [`entries=${entries.length}`]
  })

  const missingRegistryNodes = [...processNodeIds].filter((nodeId) => !registryByNode.has(nodeId))
  check(status, {
    check_id: 'process_tree_nodes_represented',
    label: 'Every process-tree node is represented in the patrol registry',
    severity: 'required',
    status: missingRegistryNodes.length ? 'fail' : 'pass',
    passed: missingRegistryNodes.length === 0,
    evidence: missingRegistryNodes.length ? missingRegistryNodes : [`process_tree_nodes=${processNodeIds.size}`]
  })

  for (const entry of entries) {
    if (!isRecord(entry)) continue
    const findings = []
    const shapeMissing = validateRegistryEntryShape(entry)
    if (shapeMissing.length) findings.push(`registry_entry_invalid:${shapeMissing.join(',')}`)

    for (const [field, requiredPrefix] of [
      ['patrol_block_path', null],
      ['status_card_output', 'runtime/status-cards/'],
      ['status_event_output', 'runtime/status-events/'],
      ['build_timeline_output', 'runtime/module-build-timelines/']
    ]) {
      const result = safeRelativePath(entry[field])
      if (!result.ok) {
        findings.push(`${field}:${result.error}`)
      } else if (requiredPrefix && !result.rel.startsWith(requiredPrefix)) {
        findings.push(`${field}:unexpected_prefix:${result.rel}`)
      }
    }

    if (entry.source === 'process_tree' && !processNodeIds.has(entry.process_tree_node_id)) {
      findings.push('process_tree_node_missing')
    }

    let patrolState = entry.coverage === 'excluded' ? 'excluded' : entry.coverage === 'parent_covered' ? 'parent_covered' : 'unknown'
    const blockPathResult = safeRelativePath(entry.patrol_block_path)
    let block = null
    if (entry.coverage === 'required') {
      if (!blockPathResult.ok || !existsSync(blockPathResult.resolved)) {
        findings.push('missing_patrol_block')
        patrolState = 'missing'
      } else {
        try {
          block = JSON.parse(readFileSync(blockPathResult.resolved, 'utf8'))
          const blockMissing = validatePatrolBlockShape(block)
          if (block.module_id !== entry.module_id) blockMissing.push(`module_id_mismatch:${block.module_id}`)
          const privateKey = hasRawPrivateKey(block)
          if (privateKey) blockMissing.push(`raw_private_key:${privateKey}`)
          const sourceHashFindings = []
          const sourceFingerprint = computeBlockSourceFingerprint({ root: ROOT, block, entry })
          if (sourceFingerprint.errors.length) {
            sourceHashFindings.push(...sourceFingerprint.errors)
          }
          if (!sourceHashMatches(block.versioning?.source_hash, sourceFingerprint.hash)) {
            sourceHashFindings.push(`source_hash_drift:stored=${block.versioning?.source_hash || 'missing'}:computed=${sourceFingerprint.hash}`)
          }
          if (blockMissing.length) {
            findings.push(`patrol_block_invalid:${blockMissing.join(',')}`)
            patrolState = 'validation_failed'
          } else if (sourceHashFindings.length) {
            findings.push(`source_hash_invalid:${sourceHashFindings.join(',')}`)
            patrolState = 'source_drift'
          } else if (!isFresh(block.updated_at, block.ttl_ms, nowMs)) {
            findings.push('patrol_block_stale')
            patrolState = 'stale'
          } else if (block.lifecycle === 'validated' || block.lifecycle === 'ready') {
            patrolState = 'validated'
          } else if (block.lifecycle === 'blocked') {
            patrolState = 'blocked'
          } else if (['planned', 'designing', 'building', 'testing'].includes(block.lifecycle)) {
            patrolState = 'building'
          } else {
            patrolState = 'unknown'
          }
        } catch (error) {
          findings.push(`patrol_block_unreadable:${String(error).slice(0, 100)}`)
          patrolState = 'validation_failed'
        }
      }
    }

    const cardPathResult = safeRelativePath(entry.status_card_output)
    if (cardPathResult.ok && existsSync(cardPathResult.resolved)) {
      try {
        const card = JSON.parse(readFileSync(cardPathResult.resolved, 'utf8'))
        const cardErrors = validateStatusCard(card)
        const privateKey = hasRawPrivateKey(card)
        if (privateKey) cardErrors.push(`raw_private_key:${privateKey}`)
        if (cardErrors.length) findings.push(`status_card_invalid:${cardErrors.join(',')}`)
        if (card.updated_at && card.ttl_ms && !isFresh(card.updated_at, card.ttl_ms, nowMs)) findings.push('status_card_stale')
      } catch (error) {
        findings.push(`status_card_unreadable:${String(error).slice(0, 100)}`)
      }
    } else {
      findings.push('status_card_absent')
    }

    const eventPathResult = safeRelativePath(entry.status_event_output)
    if (eventPathResult.ok && existsSync(eventPathResult.resolved)) {
      try {
        const eventFile = JSON.parse(readFileSync(eventPathResult.resolved, 'utf8'))
        const eventErrors = validateStatusEvents(eventFile)
        const privateKey = hasRawPrivateKey(eventFile)
        if (privateKey) eventErrors.push(`raw_private_key:${privateKey}`)
        if (eventErrors.length) findings.push(`status_event_invalid:${eventErrors.join(',')}`)
      } catch (error) {
        findings.push(`status_event_unreadable:${String(error).slice(0, 100)}`)
      }
    } else {
      findings.push('status_event_absent')
    }

    const timelinePath = timelinePathForEntry(entry)
    const timelinePathResult = safeRelativePath(timelinePath)
    if (!timelinePathResult.ok) {
      findings.push(`build_timeline_output:${timelinePathResult.error}`)
    } else if (!timelinePathResult.rel.startsWith('runtime/module-build-timelines/')) {
      findings.push(`build_timeline_output:unexpected_prefix:${timelinePathResult.rel}`)
    }
    const timeline = readTimelineEvents({ root: ROOT, relativePath: timelinePath })
    if (!timeline.exists) {
      findings.push('build_timeline_absent')
    } else {
      const timelineErrors = [
        ...timeline.errors,
        ...validateTimelineEvents(timeline.events, { moduleId: entry.module_id })
      ]
      const privateKey = hasRawPrivateKey(timeline.events)
      if (privateKey) timelineErrors.push(`raw_private_key:${privateKey}`)
      if (timelineErrors.length) findings.push(`build_timeline_invalid:${timelineErrors.join(',')}`)
    }

    const hasRequiredProblem = findings.some((finding) =>
      finding.includes('path_escapes_workspace') ||
      finding.includes('path_must_be_relative') ||
      finding.includes('registry_entry_invalid') ||
      finding.includes('patrol_block_invalid') ||
      finding.includes('source_hash_invalid') ||
      finding.includes('patrol_block_unreadable') ||
      finding.includes('status_card_invalid') ||
      finding.includes('status_event_invalid') ||
      finding.includes('build_timeline_output') ||
      finding.includes('build_timeline_absent') ||
      finding.includes('build_timeline_invalid') ||
      finding.includes('raw_private_key')
    )
    const missingBlockIsRequired = entry.coverage === 'required' && registry?.strict_missing_blocks === true
    if (hasRequiredProblem || (missingBlockIsRequired && findings.includes('missing_patrol_block'))) {
      status.required_failures.push(`${entry.module_id}:${findings.join('|')}`)
    } else if (findings.length) {
      status.warning_failures.push(`${entry.module_id}:${findings.join('|')}`)
    }
    status.module_findings.push({
      module_id: entry.module_id,
      display_name: entry.display_name,
      source: entry.source,
      coverage: entry.coverage,
      patrol_state: patrolState,
      findings: findings.length ? findings : ['ok']
    })
  }

  const report = {
    schema: 'system_patrol_validation.v1',
    validation_id: validationId,
    created_at: now.toISOString(),
    gate_decision:
      status.required_failures.length > 0
        ? 'system_patrol_blocked'
        : status.warning_failures.length > 0
          ? 'system_patrol_bootstrap_warnings'
          : 'system_patrol_validated',
    source: {
      root: ROOT,
      process_tree_path: processTreePath,
      registry_path: registryPath,
      schema_dir: SCHEMA_DIR,
      mode: registry?.mode ?? 'unknown',
      strict_missing_blocks: Boolean(registry?.strict_missing_blocks)
    },
    summary: {
      process_tree_nodes: processNodeIds.size,
      registry_entries: entries.length,
      required_entries: entries.filter((entry) => entry.coverage === 'required').length,
      parent_covered_entries: entries.filter((entry) => entry.coverage === 'parent_covered').length,
      excluded_entries: entries.filter((entry) => entry.coverage === 'excluded').length,
      missing_patrol_blocks: status.module_findings.filter((item) => item.findings.includes('missing_patrol_block')).length,
      status_cards_absent: status.module_findings.filter((item) => item.findings.includes('status_card_absent')).length,
      status_events_absent: status.module_findings.filter((item) => item.findings.includes('status_event_absent')).length,
      build_timelines_absent: status.module_findings.filter((item) => item.findings.includes('build_timeline_absent')).length
    },
    checks: status.checks,
    module_findings: status.module_findings,
    required_failures: [...new Set(status.required_failures)],
    warning_failures: [...new Set(status.warning_failures)],
    continue_when: [
      'required_failures is empty',
      'missing coverage is visible as missing or warning during bootstrap',
      'publisher can convert findings into summary-only status outputs'
    ],
    stop_or_adjust_when: [
      'Any required check fails',
      'A path escapes the workspace',
      'A status output includes raw private payload fields',
      'Normal module changes attempt to rebuild the patrol core',
      'A visible module skips the patrol-maintainer or equivalent system-patrol gate after validator exists'
    ]
  }
  const written = writeReport(report, outputDir)
  console.log(JSON.stringify({
    command: 'validate-system-patrol',
    validation_id: report.validation_id,
    gate_decision: report.gate_decision,
    required_failures: report.required_failures,
    warning_failures: report.warning_failures,
    json_path: written.json_path,
    markdown_path: written.markdown_path,
    latest_json: written.latest_json
  }, null, 2))
  if (report.required_failures.length > 0) process.exitCode = 2
}

main()
