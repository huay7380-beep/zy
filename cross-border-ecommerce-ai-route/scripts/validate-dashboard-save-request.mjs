import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './cross-border-stage-control-lib.mjs'

const deskRoot = join(projectRoot, 'runtime', 'growth-sales-automation', 'product-decision-desk')
const latestSavedPath = join(deskRoot, 'latest-saved-product-decision.json')
const latestRunPath = join(deskRoot, 'latest-dashboard-save-run.json')

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

function localPathFromRef(ref) {
  const prefix = 'cross-border-ecommerce-ai-route/'
  if (!String(ref || '').startsWith(prefix)) return null
  return join(projectRoot, ref.slice(prefix.length))
}

function requireJson(path, errors) {
  if (!path || !existsSync(path)) {
    errors.push(`missing file: ${path}`)
    return null
  }
  return readJson(path)
}

const args = parseArgs(process.argv)
const productId = String(args['product-id'] || 'structured-cabling-sample')
const errors = []
const warnings = []

const latestRun = requireJson(latestRunPath, errors)
const latestSaved = requireJson(latestSavedPath, errors)
const request = latestRun ? requireJson(localPathFromRef(latestRun.local_save_request_ref), errors) : null
const runEvent = latestRun ? requireJson(localPathFromRef(latestRun.run_event_ref), errors) : null

if (latestRun) {
  if (latestRun.contract !== 'controlled_dashboard_save_latest_run.v1') errors.push('latest dashboard save run contract mismatch')
  if (latestRun.product_id !== productId) errors.push('latest dashboard save run product_id mismatch')
  if (latestRun.real_external_actions_executed !== false) errors.push('latest dashboard save run must record no real external actions')
  if (latestRun.dashboard_direct_write_allowed !== false) errors.push('dashboard direct write must remain false')
}

if (request) {
  if (request.contract !== 'local_save_request.v1') errors.push('local save request contract mismatch')
  if (request.product_id !== productId) errors.push('local save request product_id mismatch')
  if (!request.request_id || !request.checksum || !request.manifest_checksum_sha256) {
    errors.push('local save request must include request_id, checksum and manifest checksum')
  }
  if (request.real_external_actions_allowed !== false) errors.push('local save request must keep real external actions disabled')
  if (request.dashboard_direct_write_allowed !== false) errors.push('local save request must keep dashboard direct write disabled')
  if (!Array.isArray(request.blocked_real_actions) || request.blocked_real_actions.length < 4) {
    errors.push('local save request must list blocked real actions')
  }
}

if (runEvent) {
  if (runEvent.contract !== 'controlled_local_run_event.v1') errors.push('controlled run event contract mismatch')
  if (runEvent.product_id !== productId) errors.push('controlled run event product_id mismatch')
  if (runEvent.command_executed !== false) errors.push('controlled bridge must not execute command in this local preview')
  if (runEvent.real_external_actions_executed !== false) errors.push('controlled run event must record no real external actions')
  if (runEvent.dashboard_direct_write_allowed !== false) errors.push('controlled run event must keep dashboard direct write disabled')
  if (!Array.isArray(runEvent.executor_checks) || runEvent.executor_checks.length < 4) {
    errors.push('controlled run event must include executor checks')
  }
  for (const check of runEvent.executor_checks || []) {
    if (check.status !== 'pass') errors.push(`controlled run event check failed: ${check.check_id}`)
  }
}

if (latestSaved) {
  for (const key of ['local_save_request', 'controlled_save_run_event', 'latest_dashboard_save_run']) {
    if (!latestSaved.output_refs?.[key]) errors.push(`latest saved product decision missing output ref: ${key}`)
  }
  if (latestSaved.controlled_dashboard_save?.dashboard_direct_write_allowed !== false) {
    errors.push('latest saved controlled dashboard save must block direct writes')
  }
  if (latestSaved.controlled_dashboard_save?.real_external_actions_executed !== false) {
    errors.push('latest saved controlled dashboard save must record no real external actions')
  }
}

if (latestRun?.latest_result !== 'pass') warnings.push('latest dashboard save run did not pass')

const result = {
  contract: 'controlled_dashboard_save_validation_report.v1',
  product_id: productId,
  errors,
  warnings,
  result: errors.length ? 'fail' : 'pass'
}

console.log(JSON.stringify(result, null, 2))
if (errors.length) process.exit(1)
