import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureDir, nowIso, projectRoot, writeJson } from './cross-border-stage-control-lib.mjs'

const runtimeRoot = join(projectRoot, 'runtime', 'growth-sales-automation')
const deskRoot = join(runtimeRoot, 'product-decision-desk')
const latestSavedPath = join(deskRoot, 'latest-saved-product-decision.json')
const auditPath = join(deskRoot, 'source-trials', 'latest-free-source-coverage-audit.json')
const matrixPath = join(deskRoot, 'source-channel-matrix.json')
const registryPath = join(deskRoot, 'data-source-registry.json')
const globalCoveragePath = join(deskRoot, 'global-region-source-coverage.json')

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

function safeProductId(value) {
  const productId = String(value || '').trim() || 'structured-cabling-sample'
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,80}$/.test(productId)) {
    throw new Error(`Unsafe product_id: ${productId}`)
  }
  return productId
}

function runtimeDecisionRef(...parts) {
  return `cross-border-ecommerce-ai-route/${join('runtime', 'growth-sales-automation', 'product-decision-desk', ...parts).replaceAll('\\', '/')}`
}

function sourcePeriodFor(item) {
  return item.source_period || item.freshness_window || 'source_period_not_declared_by_source'
}

function freshnessWindowDays(item) {
  const freshness = item.freshness || {}
  if (typeof freshness.access_age_days === 'number') return Math.max(1, 30 - freshness.access_age_days)
  if (item.status === 'not_checked') return 0
  return 30
}

function normalizeFreshnessItem(item) {
  return {
    source_id: item.connector_id || item.source_id || 'unknown_source',
    label: item.label || item.connector_id || 'Unknown source',
    status: item.status || 'unknown',
    accessed_at: item.accessed_at || null,
    source_period: sourcePeriodFor(item),
    freshness_window_days: freshnessWindowDays(item),
    freshness_status: item.freshness?.status || 'unknown',
    regions_with_values: item.regions_with_values || [],
    limitations: item.limitations || [],
    rows_with_values: item.rows_with_values ?? null,
    rows_sampled: item.rows_sampled ?? null
  }
}

function normalizeRegion(region) {
  const missing = region.missing_trial_signal_classes || []
  const rankingReady = missing.length === 0
    && region.trial_base_trade_macro_ready === true
    && region.trial_tariff_ready === true
  return {
    region: region.region,
    status: region.status || 'unknown',
    registered_first_pass_ready: region.registered_first_pass_ready === true,
    registered_source_count: region.registered_source_count || 0,
    registered_signal_classes: region.registered_signal_classes || [],
    trialed_source_count: region.trialed_source_count || 0,
    trial_signal_classes: region.trial_signal_classes || [],
    trial_base_trade_macro_ready: region.trial_base_trade_macro_ready === true,
    trial_tariff_ready: region.trial_tariff_ready === true,
    first_pass_overview_ready: region.trial_base_trade_macro_ready === true && region.trial_tariff_ready === true,
    market_ranking_ready: rankingReady,
    acquisition_ready: false,
    missing_trial_signal_classes: missing,
    source_states: (region.source_states || []).map((source) => ({
      source_id: source.source_id,
      label: source.label,
      access_mode: source.access_mode,
      free_level: source.free_level,
      official_url: source.official_url,
      registered_signal_classes: source.registered_signal_classes || [],
      trial_status: source.trial_status || 'unknown',
      trial_regions_with_values: source.trial_regions_with_values || [],
      freshness_status: source.freshness?.status || 'unknown',
      evidence_status: source.trial_status === 'passed' || source.trial_status === 'partial'
        ? 'trial_evidence_available'
        : 'registered_only_or_not_checked'
    }))
  }
}

function updateLatestManifest(productId, gate, extraRefs) {
  if (!existsSync(latestSavedPath)) return null
  const manifest = readJson(latestSavedPath)
  if (manifest.product_id !== productId) return manifest
  manifest.output_refs = {
    ...(manifest.output_refs || {}),
    ...extraRefs
  }
  manifest.source_gate = gate
  manifest.source_gate_execution = {
    status: 'implemented_local_preview_verified',
    generated_at: gate.generated_at,
    real_external_actions_executed: false,
    gate_ref: extraRefs.source_coverage_gate
  }
  writeJson(latestSavedPath, manifest)
  return manifest
}

const args = parseArgs(process.argv)
const generatedAt = nowIso()
const latest = existsSync(latestSavedPath) ? readJson(latestSavedPath) : {}
const productId = safeProductId(args['product-id'] || latest.product_id)
const outputDir = join(deskRoot, 'outputs', productId)
ensureDir(outputDir)

const audit = readJson(auditPath)
const matrix = existsSync(matrixPath) ? readJson(matrixPath) : null
const registry = existsSync(registryPath) ? readJson(registryPath) : null
const globalCoverage = existsSync(globalCoveragePath) ? readJson(globalCoveragePath) : null
const marketSearchPath = join(outputDir, 'market-search-pack.json')
const downstreamPath = join(outputDir, 'downstream-route-pack.json')

const regions = (audit.region_coverage_audit || []).map(normalizeRegion)
const freshnessItems = (audit.source_freshness_audit || []).map(normalizeFreshnessItem)
const marketRankingAllowed = regions.length > 0 && regions.every((region) => region.market_ranking_ready)
const acquisitionAllowed = false
const quoteMarketRoutingAllowed = marketRankingAllowed && audit.summary?.global_market_feedback_claim_allowed === true
const regionGaps = regions
  .filter((region) => !region.market_ranking_ready)
  .map((region) => ({
    region: region.region,
    status: region.status,
    missing_trial_signal_classes: region.missing_trial_signal_classes
  }))

const evidencePack = {
  contract: 'region_source_evidence_pack.v1',
  generated_at: generatedAt,
  product_id: productId,
  execution_mode: 'local_preview_from_registered_free_source_audit',
  real_external_actions_executed: false,
  source_refs: {
    data_source_registry: runtimeDecisionRef('data-source-registry.json'),
    source_channel_matrix: runtimeDecisionRef('source-channel-matrix.json'),
    global_region_source_coverage: runtimeDecisionRef('global-region-source-coverage.json'),
    latest_free_source_coverage_audit: runtimeDecisionRef('source-trials', 'latest-free-source-coverage-audit.json')
  },
  summary: {
    major_region_count: regions.length,
    registered_source_coverage_complete: audit.summary?.registered_source_coverage_complete === true,
    trial_first_pass_ready_count: regions.filter((region) => region.first_pass_overview_ready).length,
    market_ranking_ready_count: regions.filter((region) => region.market_ranking_ready).length,
    acquisition_ready_count: 0,
    web_search_fallback_required: audit.summary?.web_search_fallback_required === true
  },
  source_registry_contract: registry?.contract || null,
  source_matrix_contract: matrix?.contract || null,
  global_coverage_contract: globalCoverage?.contract || null,
  regions
}

const freshnessAudit = {
  contract: 'freshness_audit.v1',
  generated_at: generatedAt,
  product_id: productId,
  execution_mode: 'local_preview_from_latest_free_source_trial_audit',
  real_external_actions_executed: false,
  source_results: freshnessItems,
  summary: {
    source_count: freshnessItems.length,
    fresh_count: freshnessItems.filter((item) => item.freshness_status === 'fresh').length,
    not_checked_count: freshnessItems.filter((item) => item.freshness_status === 'not_checked').length,
    registration_or_key_required_count: freshnessItems.filter((item) => item.freshness_status === 'registration_or_key_required').length,
    freshness_limitations: audit.summary?.reason || []
  }
}

const sourceGate = {
  contract: 'source_coverage_gate.v1',
  generated_at: generatedAt,
  product_id: productId,
  evidence_pack_ref: runtimeDecisionRef('outputs', productId, 'region-source-evidence-pack.json'),
  freshness_audit_ref: runtimeDecisionRef('outputs', productId, 'freshness-audit.json'),
  audit_ref: runtimeDecisionRef('source-trials', 'latest-free-source-coverage-audit.json'),
  registered_source_coverage_complete: audit.summary?.registered_source_coverage_complete === true,
  major_region_count: regions.length,
  trial_first_pass_ready_count: evidencePack.summary.trial_first_pass_ready_count,
  enough_for_first_pass_global_overview: audit.summary?.enough_for_first_pass_global_overview === true,
  overview_allowed: audit.summary?.enough_for_first_pass_global_overview === true,
  market_ranking_allowed: marketRankingAllowed,
  acquisition_allowed: acquisitionAllowed,
  quote_market_routing_allowed: quoteMarketRoutingAllowed,
  global_market_feedback_claim_allowed: audit.summary?.global_market_feedback_claim_allowed === true,
  web_search_fallback_required: audit.summary?.web_search_fallback_required === true,
  blocked_reason: marketRankingAllowed
    ? null
    : 'Current trial evidence is not enough for global market ranking, acquisition, or quote market routing.',
  thresholds: {
    overview_allowed_requires: ['registered_major_region_coverage', 'trialed_macro_or_trade_signal'],
    market_ranking_requires: ['macro_context', 'official_trade_flow', 'tariff_or_market_access', 'buyer_channel_signal', 'competitor_or_marketplace_signal', 'web_evidence'],
    acquisition_requires: ['market_ranking_allowed', 'human_approval', 'approved_outreach_channel', 'crm_write_policy']
  },
  region_gaps: regionGaps,
  human_gate_status: 'required_before_market_ranking_or_acquisition',
  real_external_actions_executed: false
}

writeJson(join(outputDir, 'region-source-evidence-pack.json'), evidencePack)
writeJson(join(outputDir, 'freshness-audit.json'), freshnessAudit)
writeJson(join(outputDir, 'source-coverage-gate.json'), sourceGate)

if (existsSync(marketSearchPath)) {
  const marketSearch = readJson(marketSearchPath)
  marketSearch.generated_at = generatedAt
  marketSearch.source_gate = sourceGate
  marketSearch.market_ranking_allowed = marketRankingAllowed
  marketSearch.real_external_actions_executed = false
  writeJson(marketSearchPath, marketSearch)
}

if (existsSync(downstreamPath)) {
  const downstream = readJson(downstreamPath)
  downstream.generated_at = generatedAt
  downstream.source_gate = sourceGate
  downstream.real_external_actions_executed = false
  downstream.blocked_routes = [
    ...(downstream.blocked_routes || []).filter((route) => route.route_id !== 'acquisition_modules'),
    {
      route_id: 'acquisition_modules',
      label: 'Enter acquisition modules',
      status: marketRankingAllowed ? 'blocked_until_human_approval' : 'blocked_until_source_gate',
      reason: sourceGate.blocked_reason || 'Market ranking evidence is ready, but real acquisition still needs human approval.',
      artifact: 'source_coverage_gate.v1'
    }
  ]
  writeJson(downstreamPath, downstream)
}

updateLatestManifest(productId, sourceGate, {
  region_source_evidence_pack: runtimeDecisionRef('outputs', productId, 'region-source-evidence-pack.json'),
  freshness_audit: runtimeDecisionRef('outputs', productId, 'freshness-audit.json'),
  source_coverage_gate: runtimeDecisionRef('outputs', productId, 'source-coverage-gate.json')
})

console.log(JSON.stringify({
  success: true,
  contract: 'source_gate_execution_result.v1',
  product_id: productId,
  generated_at: generatedAt,
  region_source_evidence_pack: runtimeDecisionRef('outputs', productId, 'region-source-evidence-pack.json'),
  freshness_audit: runtimeDecisionRef('outputs', productId, 'freshness-audit.json'),
  source_coverage_gate: runtimeDecisionRef('outputs', productId, 'source-coverage-gate.json'),
  overview_allowed: sourceGate.overview_allowed,
  market_ranking_allowed: sourceGate.market_ranking_allowed,
  acquisition_allowed: sourceGate.acquisition_allowed,
  real_external_actions_executed: false
}, null, 2))
