import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './cross-border-stage-control-lib.mjs'

const deskRoot = join(projectRoot, 'runtime', 'growth-sales-automation', 'product-decision-desk')
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

function requireJson(path, errors) {
  if (!existsSync(path)) {
    errors.push(`missing file: ${path}`)
    return null
  }
  return readJson(path)
}

const args = parseArgs(process.argv)
const productId = String(args['product-id'] || 'structured-cabling-sample')
const outputDir = join(deskRoot, 'outputs', productId)
const errors = []
const warnings = []

const evidencePack = requireJson(join(outputDir, 'region-source-evidence-pack.json'), errors)
const freshnessAudit = requireJson(join(outputDir, 'freshness-audit.json'), errors)
const sourceGate = requireJson(join(outputDir, 'source-coverage-gate.json'), errors)
const marketSearch = requireJson(join(outputDir, 'market-search-pack.json'), errors)
const latestSaved = requireJson(latestSavedPath, errors)

if (evidencePack) {
  if (evidencePack.contract !== 'region_source_evidence_pack.v1') errors.push('region evidence pack contract mismatch')
  if (evidencePack.real_external_actions_executed !== false) errors.push('region evidence pack must record no real external actions')
  if (!Array.isArray(evidencePack.regions) || evidencePack.regions.length < 8) {
    errors.push('region evidence pack must list all eight major regions')
  }
  for (const region of evidencePack.regions || []) {
    if (!region.region || !region.status) errors.push(`region missing identity/status: ${JSON.stringify(region)}`)
    if (!Array.isArray(region.missing_trial_signal_classes)) errors.push(`region missing missing_trial_signal_classes: ${region.region}`)
    if (typeof region.market_ranking_ready !== 'boolean') errors.push(`region missing market_ranking_ready boolean: ${region.region}`)
  }
}

if (freshnessAudit) {
  if (freshnessAudit.contract !== 'freshness_audit.v1') errors.push('freshness audit contract mismatch')
  if (freshnessAudit.real_external_actions_executed !== false) errors.push('freshness audit must record no real external actions')
  if (!Array.isArray(freshnessAudit.source_results) || freshnessAudit.source_results.length < 4) {
    errors.push('freshness audit must include source results')
  }
  for (const source of freshnessAudit.source_results || []) {
    for (const key of ['source_id', 'status', 'source_period', 'freshness_window_days', 'freshness_status']) {
      if (!(key in source)) errors.push(`freshness source missing ${key}: ${source.source_id || 'unknown'}`)
    }
    if (source.status !== 'not_checked' && source.accessed_at === undefined) {
      errors.push(`freshness source missing accessed_at: ${source.source_id}`)
    }
  }
}

if (sourceGate) {
  if (sourceGate.contract !== 'source_coverage_gate.v1') errors.push('source gate contract mismatch')
  if (sourceGate.real_external_actions_executed !== false) errors.push('source gate must record no real external actions')
  if (sourceGate.major_region_count < 8) errors.push('source gate must cover eight major regions')
  if (sourceGate.overview_allowed !== true) warnings.push('overview is not allowed; this may be expected if source trials changed')
  if (sourceGate.market_ranking_allowed !== false) errors.push('current source gate must keep market_ranking_allowed=false until evidence is complete')
  if (sourceGate.acquisition_allowed !== false) errors.push('current source gate must keep acquisition_allowed=false')
  if (sourceGate.quote_market_routing_allowed !== false) errors.push('current source gate must keep quote_market_routing_allowed=false')
  if (!Array.isArray(sourceGate.region_gaps) || sourceGate.region_gaps.length === 0) {
    errors.push('source gate must expose region gaps while ranking is blocked')
  }
}

if (marketSearch && sourceGate) {
  if (marketSearch.source_gate?.generated_at !== sourceGate.generated_at) {
    errors.push('market-search-pack source gate must be refreshed to latest source gate')
  }
  if (marketSearch.market_ranking_allowed !== sourceGate.market_ranking_allowed) {
    errors.push('market-search-pack market_ranking_allowed must match source gate')
  }
}

if (latestSaved && sourceGate) {
  if (latestSaved.source_gate?.generated_at !== sourceGate.generated_at) {
    errors.push('latest saved product decision source gate must match latest source gate')
  }
  for (const key of ['region_source_evidence_pack', 'freshness_audit', 'source_coverage_gate']) {
    if (!latestSaved.output_refs?.[key]) errors.push(`latest saved product decision missing output ref: ${key}`)
  }
}

const result = {
  contract: 'source_gate_execution_validation_report.v1',
  product_id: productId,
  errors,
  warnings,
  result: errors.length ? 'fail' : 'pass'
}

console.log(JSON.stringify(result, null, 2))
if (errors.length) process.exit(1)
