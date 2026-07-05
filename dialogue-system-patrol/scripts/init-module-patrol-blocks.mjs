import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { SOURCE_HASH_ALGORITHM, computeBlockSourceFingerprint } from './source-hash-lib.mjs'

const ROOT = path.resolve('.')
const PROCESS_TREE_PATH = 'examples/system-process-tree.json'
const REGISTRY_PATH = 'dialogue-system-patrol/registry/system-patrol-registry.json'
const BLOCK_DIR = 'dialogue-system-patrol/blocks'
const PROCESS_TREE_SUMMARY_TTL_MS = 604800000

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
  const filePath = path.resolve(ROOT, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function slug(value) {
  return String(value ?? 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'unknown'
}

function lifecycleFromStatus(status) {
  const value = String(status ?? '').toLowerCase()
  if (value.includes('blocked')) return 'blocked'
  if (value.includes('implemented')) return 'validated'
  if (value.includes('confirmed') || value.includes('configured') || value.includes('designed')) return 'ready'
  if (value.includes('pending') || value.includes('open')) return 'planned'
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

function compactArray(value, fallback = []) {
  if (!Array.isArray(value)) return fallback
  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
}

function blockForNode({ node, entry, now }) {
  const sourceFiles = compactArray(node.source_files, [])
  const outputs = compactArray(node.outputs, [])
  const openQuestions = compactArray(node.open_questions, [])
  const lifecycle = lifecycleFromStatus(node.status)
  const block = {
    schema: 'module_patrol_block.v1',
    module_id: entry.module_id,
    display_name: node.label || entry.display_name || entry.module_id,
    owner: entry.owner || 'process_tree',
    source_dir: sourceFiles[0] ? path.dirname(sourceFiles[0]).replace(/\\/g, '/') : 'examples',
    process_tree_node_id: node.node_id,
    registration_status: `process_tree_status:${node.status ?? 'unknown'}`,
    gate: entry.gate || 'system_patrol_coverage_gate',
    compass: entry.compass || `system_patrol.${entry.module_id}`,
    patrol_contract_version: '0.1.0',
    lifecycle,
    updated_at: now.toISOString(),
    ttl_ms: Math.max(entry.ttl_ms || 0, PROCESS_TREE_SUMMARY_TTL_MS),
    change_session_id: `system_patrol_blocks_init_${now.toISOString().slice(0, 10).replace(/-/g, '')}`,
    data_flow: {
      inputs: sourceFiles.length ? sourceFiles : ['examples/system-process-tree.json'],
      processing: [
        node.purpose || `Maintain summary-only patrol coverage for ${entry.module_id}.`
      ],
      outputs: outputs.length ? outputs : [entry.status_card_output, entry.status_event_output, entry.build_timeline_output].filter(Boolean),
      dependencies: [
        'examples/system-process-tree.json',
        'dialogue-system-patrol/registry/system-patrol-registry.json'
      ]
    },
    state: {
      headline: `${node.label || entry.module_id}: patrol block initialized from process tree status ${node.status ?? 'unknown'}.`,
      current_task: 'Maintain summary-only patrol coverage and expose dialogue-readable state.',
      progress: progressFromLifecycle(lifecycle),
      blockers: [],
      risks: openQuestions.slice(0, 4),
      next: [
        'Review this generated patrol block before treating it as a deep module interpretation.',
        'Refresh validation with npm.cmd run system-patrol:validate.',
        'Publish dialogue-readable output with npm.cmd run system-patrol:publish.'
      ]
    },
    evidence: {
      source_refs: [
        'examples/system-process-tree.json',
        ...sourceFiles.slice(0, 8)
      ],
      validation_commands: [
        'npm.cmd run system-patrol:validate',
        'npm.cmd run system-patrol:publish',
        'npm.cmd run process-tree:validate'
      ],
      latest_validation_refs: [
        'runtime/dialogue-system-patrol-validations/latest.json'
      ]
    },
    boundaries: {
      mode: 'controlled_write_runtime_summary',
      allowed_reads: [
        'examples/system-process-tree.json',
        ...sourceFiles.slice(0, 8)
      ],
      allowed_writes: [
        entry.status_card_output,
        entry.status_event_output,
        entry.build_timeline_output,
        'runtime/dialogue-system-patrol/**',
        'runtime/dialogue-system-patrol-validations/**'
      ],
      forbidden_actions: [
        'no business module rewrite from patrol initialization',
        'no dialogue reader rewrite from patrol initialization',
        'no external platform action',
        'no raw private payload publication'
      ],
      confirmation_gates: [
        'user confirmation required before protocol migration',
        'user confirmation required before process-tree and Obsidian registration'
      ]
    },
    dialogue_limits: {
      may_say: [
        'The module is represented in the process tree.',
        'The patrol block was initialized from process-tree summary evidence.',
        'Current status is summary-only and should cite source refs.'
      ],
      must_not_infer: [
        'Do not infer raw runtime facts that are not present in evidence refs.',
        'Do not treat generated patrol text as a full source-code review.',
        'Do not claim external actions or business outcomes from patrol coverage alone.'
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

function main() {
  const now = new Date()
  const force = hasFlag('force')
  const processTreePath = argValue('process-tree') ?? PROCESS_TREE_PATH
  const registryPath = argValue('registry') ?? REGISTRY_PATH
  const processTree = readJson(processTreePath)
  const registry = readJson(registryPath)
  const nodes = new Map((processTree.nodes ?? []).map((node) => [node.node_id, node]))
  const blockDir = path.resolve(ROOT, BLOCK_DIR)
  mkdirSync(blockDir, { recursive: true })

  const written = []
  const skipped = []
  const missingNodes = []

  for (const entry of registry.entries) {
    if (entry.source !== 'process_tree' || entry.coverage !== 'required') continue
    const node = nodes.get(entry.process_tree_node_id)
    if (!node) {
      missingNodes.push(entry.module_id)
      continue
    }
    const blockPath = entry.patrol_block_path || `${BLOCK_DIR}/${slug(entry.module_id)}.patrol.json`
    const absoluteBlockPath = path.resolve(ROOT, blockPath)
    if (existsSync(absoluteBlockPath) && !force) {
      skipped.push(entry.module_id)
      continue
    }
    const block = blockForNode({ node, entry, now })
    writeJson(blockPath, block)
    written.push(entry.module_id)
  }

  registry.generated_at = now.toISOString()
  for (const entry of registry.entries) {
    if (entry.source !== 'process_tree') continue
    const node = nodes.get(entry.process_tree_node_id)
    if (!node) continue
    entry.display_name = node.label || entry.display_name
    entry.ttl_ms = Math.max(entry.ttl_ms || 0, PROCESS_TREE_SUMMARY_TTL_MS)
    entry.reason = 'Derived from examples/system-process-tree.json and initialized by system-patrol:blocks:init.'
    entry.notes = [
      ...(Array.isArray(entry.notes) ? entry.notes : []),
      'Patrol block initialized from process-tree summary evidence; review before treating as deep module interpretation.'
    ].filter((item, index, array) => array.indexOf(item) === index)
  }
  writeJson(registryPath, registry)

  console.log(JSON.stringify({
    command: 'init-module-patrol-blocks',
    force,
    written_count: written.length,
    skipped_count: skipped.length,
    missing_nodes: missingNodes,
    written,
    skipped
  }, null, 2))

  if (missingNodes.length > 0) process.exitCode = 2
}

main()
