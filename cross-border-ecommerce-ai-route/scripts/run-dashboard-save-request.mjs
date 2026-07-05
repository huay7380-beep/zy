import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { ensureDir, nowIso, projectRoot, writeJson } from './cross-border-stage-control-lib.mjs'

const runtimeRoot = join(projectRoot, 'runtime', 'growth-sales-automation')
const deskRoot = join(runtimeRoot, 'product-decision-desk')
const latestSavedPath = join(deskRoot, 'latest-saved-product-decision.json')

function parseArgs(argv) {
  return Object.fromEntries(argv.slice(2).map((arg) => {
    const cleaned = arg.replace(/^--/, '')
    const index = cleaned.indexOf('=')
    if (index === -1) return [cleaned, true]
    return [cleaned.slice(0, index), cleaned.slice(index + 1)]
  }))
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function safeId(value, fallback, label) {
  const id = String(value || fallback).trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,100}$/.test(id)) {
    throw new Error(`Unsafe ${label}: ${id}`)
  }
  return id
}

function assertInsideDesk(absPath) {
  const rel = relative(deskRoot, absPath)
  if (rel.startsWith('..') || rel === '' || /^[a-zA-Z]:/.test(rel)) {
    throw new Error(`Refusing to write outside product decision desk: ${absPath}`)
  }
}

function runtimeDecisionRef(...parts) {
  return `cross-border-ecommerce-ai-route/${join('runtime', 'growth-sales-automation', 'product-decision-desk', ...parts).replaceAll('\\', '/')}`
}

function updateLatestManifest(productId, refs, generatedAt) {
  if (!existsSync(latestSavedPath)) return null
  const manifest = readJson(latestSavedPath)
  if (manifest.product_id !== productId) return manifest
  manifest.output_refs = {
    ...(manifest.output_refs || {}),
    ...refs
  }
  manifest.controlled_dashboard_save = {
    status: 'implemented_local_preview_verified',
    generated_at: generatedAt,
    request_ref: refs.local_save_request,
    run_event_ref: refs.controlled_save_run_event,
    real_external_actions_executed: false,
    dashboard_direct_write_allowed: false
  }
  writeJson(latestSavedPath, manifest)
  return manifest
}

const args = parseArgs(process.argv)
const generatedAt = nowIso()
if (!existsSync(latestSavedPath)) throw new Error(`Missing latest saved product decision: ${latestSavedPath}`)
const latestSavedRaw = readFileSync(latestSavedPath, 'utf8')
const latestSaved = JSON.parse(latestSavedRaw)
const productId = safeId(args['product-id'] || latestSaved.product_id, 'structured-cabling-sample', 'product_id')
const requestId = safeId(
  args['request-id'] || `local_save_${productId}_${Date.now()}`,
  `local_save_${productId}_${Date.now()}`,
  'request_id'
)

if (latestSaved.product_id !== productId) {
  throw new Error(`Latest saved product_id ${latestSaved.product_id} does not match request product_id ${productId}`)
}

const requestDir = resolve(deskRoot, 'save-requests')
const runDir = resolve(deskRoot, 'save-runs', requestId)
assertInsideDesk(requestDir)
assertInsideDesk(runDir)
ensureDir(requestDir)
ensureDir(runDir)

const packageChecksum = sha256(latestSavedRaw)
const request = {
  contract: 'local_save_request.v1',
  request_id: requestId,
  requested_at: generatedAt,
  product_id: productId,
  operator_intent: 'controlled_local_save_preview',
  dashboard_source: 'runtime/growth-sales-automation/dashboard/index.html',
  input_payload_ref: latestSaved.latest_input_ref,
  existing_saved_manifest_ref: runtimeDecisionRef('latest-saved-product-decision.json'),
  manifest_checksum_sha256: packageChecksum,
  blocked_real_actions: [
    'external_platform_write',
    'customer_message_send',
    'crm_production_write',
    'quote_send',
    'shipment_booking',
    'customs_tax_fx_filing'
  ],
  real_external_actions_allowed: false,
  dashboard_direct_write_allowed: false,
  checksum: sha256(`${requestId}:${productId}:${packageChecksum}:real_external_actions_allowed_false`)
}

const requestPath = join(requestDir, `${requestId}.json`)
assertInsideDesk(requestPath)
writeJson(requestPath, request)

const executorChecks = [
  {
    check_id: 'request_schema',
    status: request.contract === 'local_save_request.v1' && request.request_id && request.product_id ? 'pass' : 'fail'
  },
  {
    check_id: 'product_id_boundary',
    status: productId === latestSaved.product_id ? 'pass' : 'fail'
  },
  {
    check_id: 'path_boundary',
    status: relative(deskRoot, requestPath).startsWith('save-requests') ? 'pass' : 'fail'
  },
  {
    check_id: 'real_external_actions_disabled',
    status: request.real_external_actions_allowed === false ? 'pass' : 'fail'
  }
]

const success = executorChecks.every((check) => check.status === 'pass')
const runEvent = {
  contract: 'controlled_local_run_event.v1',
  run_id: `run_${requestId}`,
  request_id: requestId,
  product_id: productId,
  started_at: generatedAt,
  completed_at: nowIso(),
  invocation_mode: 'existing_package_verification',
  command_preview: [
    'node',
    'cross-border-ecommerce-ai-route/scripts/save-product-decision-preview.mjs',
    `--product-id=${productId}`
  ],
  command_executed: false,
  reason_command_not_executed: 'This bridge validates and records a controlled save request. It does not rerun the save script unless a later local executor is explicitly enabled.',
  request_ref: runtimeDecisionRef('save-requests', basename(requestPath)),
  latest_saved_product_decision_ref: runtimeDecisionRef('latest-saved-product-decision.json'),
  latest_saved_product_decision_checksum_sha256: packageChecksum,
  executor_checks: executorChecks,
  result: success ? 'pass' : 'fail',
  dashboard_latest_run_status_ref: runtimeDecisionRef('latest-dashboard-save-run.json'),
  real_external_actions_executed: false,
  dashboard_direct_write_allowed: false
}

const runEventPath = join(runDir, 'run-event.json')
assertInsideDesk(runEventPath)
writeJson(runEventPath, runEvent)

const latestRunStatus = {
  contract: 'controlled_dashboard_save_latest_run.v1',
  generated_at: generatedAt,
  product_id: productId,
  latest_request_id: requestId,
  latest_result: runEvent.result,
  local_save_request_ref: runtimeDecisionRef('save-requests', basename(requestPath)),
  run_event_ref: runtimeDecisionRef('save-runs', requestId, 'run-event.json'),
  latest_saved_product_decision_ref: runtimeDecisionRef('latest-saved-product-decision.json'),
  real_external_actions_executed: false,
  dashboard_direct_write_allowed: false,
  next_enablement_required: [
    'Add an approved local service or executor if one-click dashboard execution is required.',
    'Keep product_id and path validation before any filesystem write.',
    'Keep real external actions disabled unless separately approved.'
  ]
}
const latestRunPath = join(deskRoot, 'latest-dashboard-save-run.json')
writeJson(latestRunPath, latestRunStatus)

updateLatestManifest(productId, {
  local_save_request: runtimeDecisionRef('save-requests', basename(requestPath)),
  controlled_save_run_event: runtimeDecisionRef('save-runs', requestId, 'run-event.json'),
  latest_dashboard_save_run: runtimeDecisionRef('latest-dashboard-save-run.json')
}, generatedAt)

console.log(JSON.stringify({
  success,
  contract: 'controlled_dashboard_save_result.v1',
  product_id: productId,
  request_id: requestId,
  local_save_request: runtimeDecisionRef('save-requests', basename(requestPath)),
  controlled_save_run_event: runtimeDecisionRef('save-runs', requestId, 'run-event.json'),
  latest_dashboard_save_run: runtimeDecisionRef('latest-dashboard-save-run.json'),
  real_external_actions_executed: false,
  dashboard_direct_write_allowed: false
}, null, 2))

if (!success) process.exit(1)
