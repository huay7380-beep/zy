import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

export const SOURCE_HASH_ALGORITHM = 'patrol-source-v1:sha256'

const GENERATED_SOURCE_REFS = new Set([
  'dialogue-system-patrol/os-particle-projection.json'
])

const SKIP_DIR_NAMES = new Set([
  '.git',
  'node_modules'
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/').replace(/^\.\//, '')
}

export function safeRelativePath(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    return { ok: false, error: 'path_empty' }
  }
  if (path.isAbsolute(relativePath)) {
    return { ok: false, error: 'path_must_be_relative' }
  }
  const resolved = path.resolve(root, relativePath)
  const rel = path.relative(root, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: 'path_escapes_workspace' }
  }
  return { ok: true, resolved, rel: normalizePath(rel) }
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).filter((item) => typeof item === 'string' && item.trim()).map(normalizePath))]
}

function isGeneratedOrRuntimeRef(ref, entry) {
  const normalized = normalizePath(ref)
  if (normalized.startsWith('runtime/')) return true
  if (GENERATED_SOURCE_REFS.has(normalized)) return true
  if (entry?.status_card_output && normalized === normalizePath(entry.status_card_output)) return true
  if (entry?.status_event_output && normalized === normalizePath(entry.status_event_output)) return true
  return false
}

function shouldSkipFile(relativePath) {
  const normalized = normalizePath(relativePath)
  return normalized.split('/').some((part) => SKIP_DIR_NAMES.has(part))
}

function walkFiles(root, absoluteDir) {
  const files = []
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const absolute = path.join(absoluteDir, entry.name)
    const relative = normalizePath(path.relative(root, absolute))
    if (shouldSkipFile(relative)) continue
    if (entry.isDirectory()) {
      files.push(...walkFiles(root, absolute))
    } else if (entry.isFile()) {
      files.push(absolute)
    }
  }
  return files
}

function fileEntry(root, absolutePath) {
  const bytes = readFileSync(absolutePath)
  const relative = normalizePath(path.relative(root, absolutePath))
  return {
    path: relative,
    kind: 'file',
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  }
}

function collectRefEntries(root, ref) {
  const normalizedRef = normalizePath(ref)
  const suffixGlob = normalizedRef.endsWith('/**')
  const literalRef = suffixGlob ? normalizedRef.slice(0, -3) : normalizedRef
  if (literalRef.includes('*')) {
    return {
      entries: [],
      errors: [`unsupported_source_ref_glob:${normalizedRef}`]
    }
  }

  const safe = safeRelativePath(root, literalRef)
  if (!safe.ok) {
    return {
      entries: [],
      errors: [`source_ref_${safe.error}:${normalizedRef}`]
    }
  }
  if (!existsSync(safe.resolved)) {
    return {
      entries: [{ path: safe.rel, kind: 'missing', size: 0, sha256: null }],
      errors: [`source_ref_missing:${normalizedRef}`]
    }
  }

  const stats = statSync(safe.resolved)
  if (stats.isFile()) {
    return { entries: [fileEntry(root, safe.resolved)], errors: [] }
  }
  if (!stats.isDirectory()) {
    return {
      entries: [],
      errors: [`source_ref_not_file_or_directory:${normalizedRef}`]
    }
  }

  const files = walkFiles(root, safe.resolved)
  if (files.length === 0) {
    return {
      entries: [{ path: safe.rel, kind: 'empty_directory', size: 0, sha256: null }],
      errors: []
    }
  }
  return {
    entries: files.map((absolutePath) => fileEntry(root, absolutePath)),
    errors: []
  }
}

export function computeBlockSourceFingerprint({ root, block, entry = null }) {
  if (!isRecord(block)) {
    return {
      algorithm: SOURCE_HASH_ALGORITHM,
      hash: '',
      included_refs: [],
      excluded_refs: [],
      source_files: [],
      errors: ['block_not_object']
    }
  }

  const rawRefs = uniqueStrings(block.evidence?.source_refs)
  const fallbackRefs = rawRefs.length ? rawRefs : uniqueStrings([block.source_dir])
  const includedRefs = []
  const excludedRefs = []
  const sourceEntries = []
  const errors = []

  for (const ref of fallbackRefs) {
    if (isGeneratedOrRuntimeRef(ref, entry)) {
      excludedRefs.push(ref)
      continue
    }
    includedRefs.push(ref)
    const collected = collectRefEntries(root, ref)
    sourceEntries.push(...collected.entries)
    errors.push(...collected.errors)
  }

  const uniqueEntries = [...new Map(sourceEntries.map((item) => [item.path, item])).values()]
    .sort((left, right) => left.path.localeCompare(right.path))
  const payload = {
    algorithm: SOURCE_HASH_ALGORITHM,
    module_id: block.module_id ?? entry?.module_id ?? 'unknown',
    included_refs: includedRefs.sort(),
    source_files: uniqueEntries
  }
  const hash = `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`

  return {
    algorithm: SOURCE_HASH_ALGORITHM,
    hash,
    included_refs: includedRefs.sort(),
    excluded_refs: excludedRefs.sort(),
    source_files: uniqueEntries,
    errors
  }
}

export function sourceHashMatches(storedHash, computedHash) {
  return typeof storedHash === 'string' && storedHash.trim() === computedHash
}
