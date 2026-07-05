import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { SOURCE_HASH_ALGORITHM, computeBlockSourceFingerprint } from './source-hash-lib.mjs'

const ROOT = path.resolve('.')
const PROCESS_TREE_PATH = 'examples/system-process-tree.json'
const REGISTRY_PATH = 'dialogue-system-patrol/registry/system-patrol-registry.json'
const BLOCK_DIR = 'dialogue-system-patrol/blocks'
const DEFAULT_TTL_MS = 604800000

function argValue(name) {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.resolve(ROOT, relativePath), 'utf8'))
}

function writeJson(relativePath, value) {
  const resolved = path.resolve(ROOT, relativePath)
  mkdirSync(path.dirname(resolved), { recursive: true })
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`)
}

function slug(value) {
  return String(value ?? 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'unknown'
}

function compactArray(value, fallback = []) {
  if (!Array.isArray(value)) return fallback
  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
}

function lifecycleFromStatus(status) {
  const value = String(status ?? '').toLowerCase()
  if (value.includes('blocked')) return 'blocked'
  if (value.includes('implemented') || value.includes('validated')) return 'validated'
  if (value.includes('building')) return 'building'
  if (value.includes('testing')) return 'testing'
  if (value.includes('planned') || value.includes('pending')) return 'planned'
  return 'ready'
}

function progressFromLifecycle(lifecycle) {
  if (lifecycle === 'validated') return 1
  if (lifecycle === 'ready') return 0.8
  if (lifecycle === 'testing') return 0.7
  if (lifecycle === 'building') return 0.55
  if (lifecycle === 'designing') return 0.35
  if (lifecycle === 'blocked') return 0.2
  return 0.1
}

function registryEntryFor({ moduleId, node, now }) {
  return {
    module_id: moduleId,
    display_name: node.label || moduleId,
    owner: 'process_tree',
    source: 'process_tree',
    coverage: 'required',
    process_tree_node_id: node.node_id,
    parent_module_id: null,
    reason: 'Scaffolded by system-patrol:scaffold from examples/system-process-tree.json.',
    patrol_block_path: `${BLOCK_DIR}/${slug(moduleId)}.patrol.json`,
    status_card_output: `runtime/status-cards/${slug(moduleId)}.json`,
    status_event_output: `runtime/status-events/${slug(moduleId)}.json`,
    build_timeline_output: `runtime/module-build-timelines/${slug(moduleId)}.jsonl`,
    gate: 'system_patrol_coverage_gate',
    compass: `system_patrol.${moduleId}`,
    ttl_ms: DEFAULT_TTL_MS,
    notes: [
      `Scaffolded at ${now.toISOString()}.`,
      'Future module construction or modification must pass system-patrol:maintain or equivalent gate before current-state claims.'
    ]
  }
}

function blockFor({ entry, node, now }) {
  const sourceFiles = compactArray(node.source_files, [])
  const outputs = compactArray(node.outputs, [])
  const openQuestions = compactArray(node.open_questions, [])
  const lifecycle = lifecycleFromStatus(node.status)
  const block = {
    schema: 'module_patrol_block.v1',
    module_id: entry.module_id,
    display_name: node.label || entry.display_name || entry.module_id,
    owner: entry.owner || 'process_tree',
    source_dir: sourceFiles[0] ? path.dirname(sourceFiles[0]).replace(/\\/g, '/') : '.',
    process_tree_node_id: node.node_id,
    registration_status: `process_tree_status:${node.status ?? 'unknown'}`,
    gate: entry.gate,
    compass: entry.compass,
    patrol_contract_version: '0.1.0',
    lifecycle,
    updated_at: now.toISOString(),
    ttl_ms: DEFAULT_TTL_MS,
    change_session_id: `system_patrol_scaffold_${now.toISOString().slice(0, 10).replace(/-/g, '')}`,
    data_flow: {
      inputs: sourceFiles.length ? sourceFiles : ['examples/system-process-tree.json'],
      processing: [
        node.purpose || `Maintain summary-only patrol coverage for ${entry.module_id}.`
      ],
      outputs: outputs.length ? outputs : [entry.status_card_output, entry.status_event_output],
      dependencies: [
        'examples/system-process-tree.json',
        'dialogue-system-patrol/registry/system-patrol-registry.json'
      ]
    },
    state: {
      headline: `${node.label || entry.module_id}: patrol scaffold is ready for review.`,
      current_task: 'Review module state, update data flow and run patrol maintainer verification.',
      progress: progressFromLifecycle(lifecycle),
      blockers: [],
      risks: openQuestions.slice(0, 4),
      next: [
        'Review this patrol block against the module implementation.',
        `Run npm.cmd run system-patrol:source-drift -- --update --module-id=${entry.module_id} after edits.`,
        `Run npm.cmd run system-patrol:maintain -- --module-id=${entry.module_id}.`
      ]
    },
    evidence: {
      source_refs: [
        'examples/system-process-tree.json',
        ...sourceFiles.slice(0, 12)
      ],
      validation_commands: [
        `npm.cmd run system-patrol:source-drift -- --module-id=${entry.module_id}`,
        `npm.cmd run system-patrol:maintain -- --module-id=${entry.module_id}`,
        'npm.cmd run process-tree:validate'
      ],
      latest_validation_refs: [
        'runtime/dialogue-system-patrol-source-drift/latest.json',
        'runtime/dialogue-system-patrol-validations/latest.json',
        'runtime/dialogue-system-patrol-module-gates/latest.json'
      ]
    },
    boundaries: {
      mode: 'controlled_write_runtime_summary',
      allowed_reads: [
        'examples/system-process-tree.json',
        ...sourceFiles.slice(0, 12)
      ],
      allowed_writes: [
        entry.patrol_block_path,
        entry.status_card_output,
        entry.status_event_output,
        entry.build_timeline_output,
        'runtime/dialogue-system-patrol/**',
        'runtime/dialogue-system-patrol-source-drift/**',
        'runtime/dialogue-system-patrol-validations/**'
      ],
      forbidden_actions: [
        'no business module rewrite from patrol scaffold',
        'no dialogue reader rewrite from patrol scaffold',
        'no external platform action',
        'no raw private payload publication'
      ],
      confirmation_gates: [
        'user confirmation required before protocol migration',
        'user confirmation required before changing dialogue reader source contracts'
      ]
    },
    dialogue_limits: {
      may_say: [
        'The module has a patrol scaffold and must pass source drift and maintainer checks.',
        'The module state is summary-only until reviewed and validated.'
      ],
      must_not_infer: [
        'Do not claim full implementation health from scaffold creation alone.',
        'Do not ignore source_hash drift findings.',
        'Do not infer private runtime facts outside evidence refs.'
      ]
    },
    versioning: {
      supersedes: [],
      source_hash: '',
      source_hash_algorithm: SOURCE_HASH_ALGORITHM,
      source_hash_generated_at: now.toISOString(),
      source_hash_refs: [],
      source_hash_excluded_refs: []
    }
  }
  const fingerprint = computeBlockSourceFingerprint({ root: ROOT, block, entry })
  block.versioning.source_hash = fingerprint.hash
  block.versioning.source_hash_refs = fingerprint.included_refs
  block.versioning.source_hash_excluded_refs = fingerprint.excluded_refs
  return block
}

function usage() {
  return [
    'Usage:',
    '  npm.cmd run system-patrol:scaffold -- --module-id=<module_id>',
    '  npm.cmd run system-patrol:scaffold -- --module-id=<module_id> --force',
    '  npm.cmd run system-patrol:scaffold -- --module-id=<module_id> --verify',
    '',
    'The module must already exist in examples/system-process-tree.json. The scaffold creates registry and patrol-block coverage without changing business code.'
  ].join('\n')
}

function main() {
  if (hasFlag('help')) {
    console.log(usage())
    return
  }

  const moduleId = argValue('module-id')
  if (!moduleId) {
    console.error(usage())
    process.exitCode = 2
    return
  }

  const now = new Date()
  const force = hasFlag('force')
  const verify = hasFlag('verify')
  const processTree = readJson(PROCESS_TREE_PATH)
  const registry = readJson(REGISTRY_PATH)
  const node = (processTree.nodes ?? []).find((item) => item.node_id === moduleId)
  if (!node) {
    console.error(`Module ${moduleId} is not registered in ${PROCESS_TREE_PATH}. Add the process-tree node first.`)
    process.exitCode = 2
    return
  }

  let entry = (registry.entries ?? []).find((item) => item.module_id === moduleId)
  let registryUpdated = false
  if (!entry) {
    entry = registryEntryFor({ moduleId, node, now })
    registry.entries = [...(registry.entries ?? []), entry]
    registry.generated_at = now.toISOString()
    registryUpdated = true
    writeJson(REGISTRY_PATH, registry)
  }

  const blockPath = path.resolve(ROOT, entry.patrol_block_path)
  let blockWritten = false
  if (!existsSync(blockPath) || force) {
    writeJson(entry.patrol_block_path, blockFor({ entry, node, now }))
    blockWritten = true
  }

  let verification = null
  if (verify) {
    const result = spawnSync(process.execPath, [
      'dialogue-system-patrol/scripts/run-patrol-maintainer.mjs',
      `--module-id=${moduleId}`
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      shell: false
    })
    verification = {
      command: `node dialogue-system-patrol/scripts/run-patrol-maintainer.mjs --module-id=${moduleId}`,
      exit_code: typeof result.status === 'number' ? result.status : 1,
      stdout: (result.stdout ?? '').trim().split(/\r?\n/).slice(-20),
      stderr: (result.stderr ?? '').trim().split(/\r?\n/).filter(Boolean).slice(-20)
    }
  }

  const report = {
    command: 'scaffold-module-patrol',
    module_id: moduleId,
    registry_updated: registryUpdated,
    block_written: blockWritten,
    block_path: entry.patrol_block_path,
    verify,
    verification,
    next: [
      `Review ${entry.patrol_block_path}.`,
      `Run npm.cmd run system-patrol:source-drift -- --update --module-id=${moduleId} after source or patrol edits.`,
      `Run npm.cmd run system-patrol:maintain -- --module-id=${moduleId}.`
    ]
  }
  console.log(JSON.stringify(report, null, 2))
  if (verification && verification.exit_code !== 0) process.exitCode = verification.exit_code
}

main()
