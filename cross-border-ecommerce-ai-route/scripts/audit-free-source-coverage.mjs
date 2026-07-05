import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const runtimeRoot = join(projectRoot, 'runtime', 'growth-sales-automation')
const deskRoot = join(runtimeRoot, 'product-decision-desk')
const coveragePath = join(deskRoot, 'global-region-source-coverage.json')
const sourceMatrixPath = join(deskRoot, 'source-channel-matrix.json')
const freeTrialPath = join(deskRoot, 'source-trials', 'latest-free-source-trial.json')
const outputRoot = join(deskRoot, 'source-trials')
const latestAuditJsonPath = join(outputRoot, 'latest-free-source-coverage-audit.json')
const latestAuditMdPath = join(outputRoot, 'latest-free-source-coverage-audit.md')

const globalWebRegionIds = new Set(['global_web'])
const runnableStatuses = new Set(['passed', 'partial', 'reachable_registration_required'])
const accessProblemStatuses = new Set([
  'skipped_free_key_required',
  'rate_limited',
  'unstable_or_query_rejected',
  'failed'
])

function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  ensureDir(dirname(path))
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function daysBetween(a, b) {
  const start = Date.parse(a)
  const end = Date.parse(b)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return Math.max(0, Math.round((end - start) / 86400000))
}

function sourceById(coverage) {
  const map = new Map()
  for (const source of [
    ...(coverage.global_base_sources || []),
    ...(coverage.regional_free_sources || [])
  ]) {
    map.set(source.source_id, source)
  }
  return map
}

function trialRunsById(trial) {
  const map = new Map()
  for (const run of trial.source_runs || []) {
    map.set(run.connector_id, run)
  }
  return map
}

function signalClassesForSource(source) {
  return Array.isArray(source?.signal_classes) ? source.signal_classes : []
}

function runCoversRegion(run, region) {
  const regions = Array.isArray(run?.regions_with_values) ? run.regions_with_values : []
  if (regions.includes(region)) return true
  return false
}

function runHasRegionUsableValue(run, region) {
  if (!run || accessProblemStatuses.has(run.status)) return false
  if (globalWebRegionIds.has(region)) return false
  return runCoversRegion(run, region)
}

function freshnessStatus(run, generatedAt) {
  if (!run) {
    return {
      status: 'not_checked',
      access_age_days: null,
      reason: 'No trial result exists for this source.'
    }
  }
  if (run.status === 'skipped_free_key_required' || run.status === 'reachable_registration_required') {
    return {
      status: 'registration_or_key_required',
      access_age_days: daysBetween(run.accessed_at, generatedAt),
      reason: 'Source was reachable or known, but production data use still needs registration or key setup.'
    }
  }
  if (run.status === 'rate_limited' || run.status === 'unstable_or_query_rejected' || run.status === 'failed') {
    return {
      status: 'source_unstable',
      access_age_days: daysBetween(run.accessed_at, generatedAt),
      reason: 'Source needs retry, backoff, cache, or manual fallback before evidence can be used.'
    }
  }
  const accessAge = daysBetween(run.accessed_at, generatedAt)
  if (accessAge === null) {
    return {
      status: 'not_checked',
      access_age_days: null,
      reason: 'No parseable accessed_at timestamp.'
    }
  }
  if (accessAge <= 7) {
    return {
      status: 'fresh',
      access_age_days: accessAge,
      reason: 'Trial access timestamp is current for source reachability.'
    }
  }
  if (accessAge <= 45) {
    return {
      status: 'acceptable_with_reporting_lag',
      access_age_days: accessAge,
      reason: 'Access timestamp is still usable for planning, but fresh rerun is preferred before market claims.'
    }
  }
  return {
    status: 'stale_refresh_required',
    access_age_days: accessAge,
    reason: 'Access timestamp is too old for current market recommendation work.'
  }
}

function regionAuditRows(coverage, trial) {
  const sourceMap = sourceById(coverage)
  const runMap = trialRunsById(trial)

  return (coverage.region_coverage_targets || []).map((target) => {
    const registeredSourceIds = target.required_source_ids || []
    const registeredSources = registeredSourceIds
      .map((sourceId) => sourceMap.get(sourceId))
      .filter(Boolean)
    const registeredSignals = [
      ...new Set(registeredSources.flatMap((source) => signalClassesForSource(source)))
    ]
    const trialedSourceIds = registeredSourceIds.filter((sourceId) => runMap.has(sourceId))
    const usableRuns = trialedSourceIds
      .map((sourceId) => runMap.get(sourceId))
      .filter((run) => runHasRegionUsableValue(run, target.region))
    const trialSignals = [
      ...new Set(usableRuns.flatMap((run) => run.signal_classes || []))
    ]

    const registeredMeetsFirstPass = [
      'macro_context',
      'official_trade_flow',
      'tariff_or_market_access'
    ].every((signal) => registeredSignals.includes(signal))

    const trialHasBaseTradeMacro =
      trialSignals.includes('macro_context') &&
      trialSignals.includes('official_trade_flow')

    const trialHasTariff =
      trialSignals.includes('tariff_or_market_access')

    const missingTrialSignals = [
      'macro_context',
      'official_trade_flow',
      'tariff_or_market_access',
      'buyer_channel_signal',
      'web_evidence',
      'competitor_or_marketplace_signal'
    ].filter((signal) => !trialSignals.includes(signal))

    const sourceStates = registeredSourceIds.map((sourceId) => {
      const source = sourceMap.get(sourceId)
      const run = runMap.get(sourceId)
      return {
        source_id: sourceId,
        label: source?.label || sourceId,
        access_mode: source?.access_mode || 'not_registered',
        free_level: source?.free_level || 'unknown',
        official_url: source?.official_url || null,
        registered_signal_classes: signalClassesForSource(source),
        trial_status: run?.status || 'not_trialed',
        trial_regions_with_values: run?.regions_with_values || [],
        freshness: freshnessStatus(run, trial.generated_at)
      }
    })

    return {
      region: target.region,
      minimum_now: target.minimum_now,
      registered_source_count: registeredSources.length,
      registered_signal_classes: registeredSignals,
      registered_first_pass_ready: registeredMeetsFirstPass,
      trialed_source_count: trialedSourceIds.length,
      trial_signal_classes: trialSignals,
      trial_base_trade_macro_ready: trialHasBaseTradeMacro,
      trial_tariff_ready: trialHasTariff,
      missing_trial_signal_classes: missingTrialSignals,
      status: registeredMeetsFirstPass && trialHasBaseTradeMacro && trialHasTariff
        ? 'trial_first_pass_ready'
        : registeredMeetsFirstPass && trialHasBaseTradeMacro
          ? 'registered_ready_trial_needs_tariff_or_channel'
          : registeredMeetsFirstPass
            ? 'registered_ready_trial_needs_data'
            : 'registered_coverage_gap',
      source_states: sourceStates
    }
  })
}

function sourceFreshnessRows(trial) {
  return (trial.source_runs || []).map((run) => ({
    connector_id: run.connector_id,
    label: run.label,
    status: run.status,
    accessed_at: run.accessed_at,
    freshness_window: run.freshness_window,
    freshness: freshnessStatus(run, trial.generated_at),
    regions_with_values: run.regions_with_values || [],
    rows_with_values: run.rows_with_values,
    rows_sampled: run.rows_sampled,
    limitations: run.limitations || []
  }))
}

function buildFallbackPlan(regionRows) {
  return regionRows
    .filter((row) => row.status !== 'trial_first_pass_ready')
    .map((row) => ({
      region: row.region,
      reason: row.missing_trial_signal_classes.join(', ') || 'manual source adapter not trialed',
      next_actions: [
        'Rerun free-source trial before making current market claims.',
        'Use the registered regional official source path for tariff or market-access evidence.',
        'Use broad web search only to fill missing buyer/channel, competitor, standards, or local-language evidence.',
        'Keep result as draft until human review validates product-specific HS, certification and market access.'
      ]
    }))
}

function escapePipe(value) {
  return String(value ?? '').replaceAll('|', '/').replace(/\s+/g, ' ').trim()
}

function buildMarkdown(report) {
  const regionRows = report.region_coverage_audit.map((row) =>
    `| ${escapePipe(row.region)} | ${escapePipe(row.status)} | ${row.registered_source_count} | ${row.trialed_source_count} | ${escapePipe(row.trial_signal_classes.join(', ') || 'none')} | ${escapePipe(row.missing_trial_signal_classes.join(', ') || 'none')} |`
  )
  const sourceRows = report.source_freshness_audit.map((row) =>
    `| ${escapePipe(row.label)} | ${escapePipe(row.status)} | ${escapePipe(row.freshness.status)} | ${escapePipe(row.regions_with_values.join(', ') || 'none')} | ${row.rows_with_values ?? 0}/${row.rows_sampled ?? 0} |`
  )
  const fallbackRows = report.fallback_required.map((item) =>
    `### ${item.region}\n\nMissing or weak: ${item.reason}\n\n${item.next_actions.map((action) => `- ${action}`).join('\n')}`
  )

  return `# Free Source Coverage Audit

Generated at: ${report.generated_at}

Coverage policy: \`${report.coverage_policy_ref}\`

Free source trial: \`${report.free_trial_ref}\`

## Summary

- Major regions with registered free-source coverage: ${report.summary.registered_major_region_coverage_ready_count}/${report.summary.major_region_count}
- Major regions with trialed first-pass coverage: ${report.summary.trial_first_pass_ready_count}/${report.summary.major_region_count}
- Registered source coverage complete: \`${report.summary.registered_source_coverage_complete}\`
- Enough for first-pass global overview: \`${report.summary.enough_for_first_pass_global_overview}\`
- Enough for current trial-based global market ranking: \`${report.summary.enough_for_current_trial_based_global_market_ranking}\`
- Enough for complete regional market feedback: \`${report.summary.enough_for_complete_regional_market_feedback}\`
- Global market feedback claim allowed: \`${report.summary.global_market_feedback_claim_allowed}\`
- Web/search fallback required: \`${report.summary.web_search_fallback_required}\`

## Region Audit

| Region | Status | Registered sources | Trialed sources | Trial signals | Missing trial signals |
| --- | --- | ---: | ---: | --- | --- |
${regionRows.join('\n')}

## Source Freshness

| Source | Trial status | Freshness status | Regions with values | Rows |
| --- | --- | --- | --- | --- |
${sourceRows.join('\n')}

## Fallback Plan

${fallbackRows.length ? fallbackRows.join('\n\n') : 'No fallback required for the current first-pass gate.'}

## Operating Boundary

No paid source, login source, outreach, publishing, quote sending, or external business action was executed by this audit.
`
}

function main() {
  if (!existsSync(coveragePath)) {
    throw new Error(`Missing coverage policy: ${coveragePath}`)
  }
  if (!existsSync(freeTrialPath)) {
    throw new Error(`Missing free source trial: ${freeTrialPath}`)
  }
  if (!existsSync(sourceMatrixPath)) {
    throw new Error(`Missing source channel matrix: ${sourceMatrixPath}`)
  }

  const coverage = readJson(coveragePath)
  const sourceMatrix = readJson(sourceMatrixPath)
  const trial = readJson(freeTrialPath)
  const generatedAt = new Date().toISOString()
  const regionRows = regionAuditRows(coverage, trial)
  const freshnessRows = sourceFreshnessRows(trial)
  const fallback = buildFallbackPlan(regionRows)

  const registeredReadyCount = regionRows.filter((row) => row.registered_first_pass_ready).length
  const trialReadyCount = regionRows.filter((row) => row.status === 'trial_first_pass_ready').length
  const unstableSourceCount = freshnessRows.filter((row) =>
    ['source_unstable', 'stale_refresh_required', 'not_checked'].includes(row.freshness.status)
  ).length

  const report = {
    contract: 'product_decision_desk_free_source_coverage_audit.v1',
    generated_at: generatedAt,
    execution_mode: 'local_read_only_audit',
    real_external_actions_executed: false,
    paid_or_login_sources_used: false,
    coverage_policy_ref: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/global-region-source-coverage.json',
    source_matrix_ref: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/source-channel-matrix.json',
    free_trial_ref: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-trial.json',
    source_matrix_contract: sourceMatrix.contract,
    summary: {
      major_region_count: regionRows.length,
      registered_major_region_coverage_ready_count: registeredReadyCount,
      trial_first_pass_ready_count: trialReadyCount,
      unstable_or_unchecked_source_count: unstableSourceCount,
      registered_source_coverage_complete: registeredReadyCount === regionRows.length,
      enough_for_first_pass_global_overview: registeredReadyCount === regionRows.length,
      enough_for_current_trial_based_global_market_ranking: trialReadyCount === regionRows.length,
      enough_for_complete_regional_market_feedback: false,
      global_market_feedback_claim_allowed: false,
      web_search_fallback_required: fallback.length > 0,
      reason: [
        'Registered free-source coverage now maps all major regions.',
        'Trial evidence still lacks complete regional tariff, buyer/channel, competitor and local compliance signals.',
        'Freshness is based on latest trial access time and each source period; source data itself can lag.'
      ]
    },
    region_coverage_audit: regionRows,
    source_freshness_audit: freshnessRows,
    fallback_required: fallback,
    acceptance_gates: [
      {
        gate_id: 'registered_major_region_coverage',
        status: registeredReadyCount === regionRows.length ? 'passed' : 'failed',
        pass_rule: 'All major regions must have macro, trade-flow and tariff/access source paths registered.'
      },
      {
        gate_id: 'trial_first_pass_coverage',
        status: trialReadyCount === regionRows.length ? 'passed' : 'partial',
        pass_rule: 'All major regions must have trialed macro, trade-flow and tariff/access evidence before first-pass market ranking is treated as current evidence.'
      },
      {
        gate_id: 'complete_market_feedback',
        status: 'blocked',
        pass_rule: 'Complete feedback requires region-specific buyer/channel, competitor, compliance and logistics evidence plus human review.'
      }
    ]
  }

  writeJson(latestAuditJsonPath, report)
  writeFileSync(latestAuditMdPath, buildMarkdown(report), 'utf8')

  console.log(JSON.stringify({
    success: true,
    contract: report.contract,
    major_region_count: report.summary.major_region_count,
    registered_major_region_coverage_ready_count: report.summary.registered_major_region_coverage_ready_count,
    trial_first_pass_ready_count: report.summary.trial_first_pass_ready_count,
    registered_source_coverage_complete: report.summary.registered_source_coverage_complete,
    enough_for_first_pass_global_overview: report.summary.enough_for_first_pass_global_overview,
    enough_for_current_trial_based_global_market_ranking: report.summary.enough_for_current_trial_based_global_market_ranking,
    enough_for_complete_regional_market_feedback: report.summary.enough_for_complete_regional_market_feedback,
    latest_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-coverage-audit.json',
    latest_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-coverage-audit.md'
  }, null, 2))
}

main()
