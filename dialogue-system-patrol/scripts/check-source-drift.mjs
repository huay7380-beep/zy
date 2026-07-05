import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  SOURCE_HASH_ALGORITHM,
  computeBlockSourceFingerprint,
  safeRelativePath,
  sourceHashMatches
} from './source-hash-lib.mjs'

const ROOT = path.resolve('.')
const REGISTRY_PATH = 'dialogue-system-patrol/registry/system-patrol-registry.json'
const OUTPUT_ROOT = 'runtime/dialogue-system-patrol-source-drift'

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

function driftId(date = new Date()) {
  return `source_drift_${date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
}

function readBlock(entry) {
  const blockPath = safeRelativePath(ROOT, entry.patrol_block_path)
  if (!blockPath.ok) {
    return { block: null, error: `patrol_block_path_${blockPath.error}` }
  }
  if (!existsSync(blockPath.resolved)) {
    return { block: null, error: 'patrol_block_missing' }
  }
  try {
    return { block: JSON.parse(readFileSync(blockPath.resolved, 'utf8')), error: null, path: blockPath.rel }
  } catch (error) {
    return { block: null, error: `patrol_block_unreadable:${String(error).slice(0, 100)}` }
  }
}

function checkEntry(entry, { update, generatedAt }) {
  const blockResult = readBlock(entry)
  if (!blockResult.block) {
    return {
      module_id: entry.module_id,
      patrol_block_path: entry.patrol_block_path,
      status: 'blocked',
      stored_hash: null,
      computed_hash: null,
      algorithm: SOURCE_HASH_ALGORITHM,
      included_refs: [],
      excluded_refs: [],
      source_files_total: 0,
      required_failures: [blockResult.error],
      updated: false
    }
  }

  const block = blockResult.block
  const fingerprint = computeBlockSourceFingerprint({ root: ROOT, block, entry })
  const storedHash = block.versioning?.source_hash ?? ''
  const hashCurrent = sourceHashMatches(storedHash, fingerprint.hash)
  const requiredFailures = [
    ...fingerprint.errors,
    ...(hashCurrent || update ? [] : [`source_hash_drift:${storedHash || 'missing'}!=${fingerprint.hash}`])
  ]

  let updated = false
  if (update) {
    block.versioning = {
      ...(block.versioning ?? {}),
      source_hash: fingerprint.hash,
      source_hash_algorithm: fingerprint.algorithm,
      source_hash_generated_at: generatedAt,
      source_hash_refs: fingerprint.included_refs,
      source_hash_excluded_refs: fingerprint.excluded_refs
    }
    writeJson(entry.patrol_block_path, block)
    updated = true
  }

  return {
    module_id: entry.module_id,
    patrol_block_path: entry.patrol_block_path,
    status: requiredFailures.length
      ? 'blocked'
      : update
        ? 'baseline_updated'
        : 'current',
    stored_hash: storedHash,
    computed_hash: fingerprint.hash,
    algorithm: fingerprint.algorithm,
    included_refs: fingerprint.included_refs,
    excluded_refs: fingerprint.excluded_refs,
    source_files_total: fingerprint.source_files.length,
    source_files_sample: fingerprint.source_files.slice(0, 12).map((item) => item.path),
    required_failures: requiredFailures,
    updated
  }
}

function makeMarkdown(report) {
  const rows = report.modules
    .map((item) => `| ${item.module_id} | ${item.status} | ${item.source_files_total} | ${item.required_failures.join('; ') || 'none'} |`)
    .join('\n')
  return [
    '# System Patrol Source Drift',
    '',
    `- schema: ${report.schema}`,
    `- drift_id: ${report.drift_id}`,
    `- generated_at: ${report.generated_at}`,
    `- gate_decision: ${report.gate_decision}`,
    `- update_mode: ${report.update_mode}`,
    `- required_failures: ${report.required_failures.join(', ') || 'none'}`,
    '',
    '| Module | Status | Source files | Required failures |',
    '| --- | --- | --- | --- |',
    rows,
    ''
  ].join('\n')
}

function usage() {
  return [
    'Usage:',
    '  npm.cmd run system-patrol:source-drift',
    '  npm.cmd run system-patrol:source-drift -- --module-id=<module_id>',
    '  npm.cmd run system-patrol:source-drift -- --all',
    '  npm.cmd run system-patrol:source-drift -- --update --module-id=<module_id>',
    '  npm.cmd run system-patrol:source-drift -- --update --all',
    '',
    'Checks or refreshes module patrol source_hash values from evidence.source_refs.'
  ].join('\n')
}

function main() {
  if (hasFlag('help')) {
    console.log(usage())
    return
  }

  const registryPath = argValue('registry') ?? REGISTRY_PATH
  const moduleId = argValue('module-id')
  const update = hasFlag('update')
  const all = hasFlag('all') || !moduleId
  const generatedAt = new Date().toISOString()
  const registry = readJson(registryPath)
  const entries = (registry.entries ?? [])
    .filter((entry) => entry.coverage !== 'excluded')
    .filter((entry) => all || entry.module_id === moduleId)

  if (!entries.length) {
    console.error(`No patrol registry entries matched ${moduleId ?? 'all'}.`)
    process.exitCode = 2
    return
  }

  const modules = entries.map((entry) => checkEntry(entry, { update, generatedAt }))
  const requiredFailures = modules.flatMap((item) => item.required_failures.map((failure) => `${item.module_id}:${failure}`))
  const report = {
    schema: 'system_patrol_source_drift_report.v1',
    drift_id: driftId(new Date(generatedAt)),
    generated_at: generatedAt,
    registry_ref: registryPath,
    algorithm: SOURCE_HASH_ALGORITHM,
    target: all ? 'all' : moduleId,
    update_mode: update,
    gate_decision: requiredFailures.length
      ? 'source_drift_blocked'
      : update
        ? 'source_hash_baseline_updated'
        : 'source_hash_current',
    modules,
    required_failures: requiredFailures,
    boundary: [
      'read-only check unless --update is provided',
      'hashes evidence.source_refs content, excluding runtime/generated output refs',
      'no business module rewrite',
      'no dialogue reader rewrite',
      'no external action'
    ]
  }

  const outputDir = path.resolve(ROOT, OUTPUT_ROOT, report.drift_id)
  mkdirSync(outputDir, { recursive: true })
  mkdirSync(path.resolve(ROOT, OUTPUT_ROOT), { recursive: true })
  writeFileSync(path.join(outputDir, 'source-drift-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(path.join(outputDir, 'source-drift-report.md'), makeMarkdown(report))
  writeFileSync(path.resolve(ROOT, OUTPUT_ROOT, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(path.resolve(ROOT, OUTPUT_ROOT, 'latest.md'), makeMarkdown(report))

  console.log(JSON.stringify({
    command: 'check-source-drift',
    drift_id: report.drift_id,
    gate_decision: report.gate_decision,
    target: report.target,
    update_mode: report.update_mode,
    required_failures: report.required_failures,
    latest_json: path.resolve(ROOT, OUTPUT_ROOT, 'latest.json')
  }, null, 2))

  if (requiredFailures.length > 0) process.exitCode = 2
}

main()
