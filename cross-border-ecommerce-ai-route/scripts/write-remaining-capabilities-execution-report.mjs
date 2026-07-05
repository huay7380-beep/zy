import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { nowIso, projectRoot, writeJson } from './cross-border-stage-control-lib.mjs'

const runtimeRoot = join(projectRoot, 'runtime', 'growth-sales-automation')
const deskRoot = join(runtimeRoot, 'product-decision-desk')
const latestSavedPath = join(deskRoot, 'latest-saved-product-decision.json')
const planPath = join(deskRoot, 'remaining-capability-execution-plan.json')
const directionPath = join(deskRoot, 'current-direction-record.json')

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

function requireArtifact(path, label) {
  if (!existsSync(path)) throw new Error(`Missing ${label}: ${path}`)
  return readJson(path)
}

function updateLatestManifest(productId, refs, generatedAt) {
  if (!existsSync(latestSavedPath)) return null
  const manifest = readJson(latestSavedPath)
  if (manifest.product_id !== productId) return manifest
  manifest.output_refs = {
    ...(manifest.output_refs || {}),
    ...refs
  }
  manifest.remaining_capabilities_execution = {
    status: 'implemented_local_preview_verified',
    generated_at: generatedAt,
    implemented_capabilities: [
      'source_gate_execution',
      'quote_and_logistics_confirmation',
      'script_backed_dashboard_save'
    ],
    real_external_actions_executed: false
  }
  writeJson(latestSavedPath, manifest)
  return manifest
}

function updatePlan(generatedAt) {
  if (!existsSync(planPath)) return null
  const plan = readJson(planPath)
  plan.status = 'all_capability_closures_local_preview_verified'
  plan.pending_user_confirmation = false
  plan.execution_allowed_now = false
  plan.operator_confirmation_status = {
    status: 'executed_remaining_three_local_preview_verified',
    confirmation_required_before_execution: false,
    this_plan_does_not_execute_capabilities: false,
    executed_at: generatedAt,
    executed_scope: [
      'source_gate_execution',
      'quote_and_logistics_confirmation',
      'script_backed_dashboard_save'
    ],
    real_external_actions_executed: false
  }
  plan.confirmed_execution = {
    ...(plan.confirmed_execution || {}),
    remaining_execution_option: 'execute_remaining_three_in_order',
    remaining_execution_status: 'implemented_local_preview_verified',
    remaining_execution_report_ref: runtimeDecisionRef('remaining-capabilities-execution-report.json'),
    defect_assessment_ref: runtimeDecisionRef('post-completion-defect-assessment.json')
  }
  plan.capability_state_summary = {
    ...(plan.capability_state_summary || {}),
    implemented_local_preview_verified: [
      'asset_intake_pipeline',
      'category_profile_expansion',
      'source_gate_execution',
      'quote_and_logistics_confirmation',
      'script_backed_dashboard_save'
    ],
    waiting_for_operator_confirmation: [],
    real_external_actions_allowed_for_any_option: false
  }
  plan.capabilities = (plan.capabilities || []).map((capability) => ({
    ...capability,
    status_before_execution: 'implemented_local_preview_verified',
    current_execution_state: capability.capability_id === 'source_gate_execution'
      ? 'Implemented as local-preview source evidence gate. Market ranking and acquisition remain blocked until evidence thresholds pass.'
      : capability.capability_id === 'quote_and_logistics_confirmation'
        ? 'Implemented as local-preview commercial terms gate. Real quote send and shipment booking remain blocked.'
        : capability.capability_id === 'script_backed_dashboard_save'
          ? 'Implemented as controlled local request/run-event bridge. Browser direct filesystem writes remain blocked.'
          : capability.current_execution_state
  }))
  writeJson(planPath, plan)
  return plan
}

function updateDirection(generatedAt) {
  if (!existsSync(directionPath)) return null
  const direction = readJson(directionPath)
  direction.recorded_at = generatedAt
  direction.executed_remaining_capabilities = {
    status: 'implemented_local_preview_verified',
    report_ref: runtimeDecisionRef('remaining-capabilities-execution-report.json'),
    implemented_capabilities: [
      'source_gate_execution',
      'quote_and_logistics_confirmation',
      'script_backed_dashboard_save'
    ],
    real_external_actions_executed: false
  }
  direction.remaining_capability_gaps_after_save = (direction.remaining_capability_gaps_after_save || []).map((gap) => {
    if ([
      'source_gate_execution',
      'quote_and_logistics_confirmation',
      'script_backed_dashboard_save'
    ].includes(gap.gap_id)) {
      return {
        ...gap,
        status: 'implemented_local_preview_verified',
        closure_ref: runtimeDecisionRef('remaining-capabilities-execution-report.json')
      }
    }
    return gap
  })
  direction.current_next_step_after_closure = 'Remaining local-preview capability closures are implemented. Next step is deciding whether to build live read-only connectors, product-page publishing pipeline, or factory-confirmed commercial input collection.'
  writeJson(directionPath, direction)
  return direction
}

function writeMarkdown(path, lines) {
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8')
}

const args = parseArgs(process.argv)
const generatedAt = nowIso()
const latest = existsSync(latestSavedPath) ? readJson(latestSavedPath) : {}
const productId = safeProductId(args['product-id'] || latest.product_id)
const outputDir = join(deskRoot, 'outputs', productId)

const sourceGate = requireArtifact(join(outputDir, 'source-coverage-gate.json'), 'source coverage gate')
const commercialGate = requireArtifact(join(outputDir, 'commercial-terms-gate.json'), 'commercial terms gate')
const latestDashboardRun = requireArtifact(join(deskRoot, 'latest-dashboard-save-run.json'), 'latest dashboard save run')

const implementedCapabilities = [
  {
    capability_id: 'source_gate_execution',
    status: 'implemented_local_preview_verified',
    outputs: [
      runtimeDecisionRef('outputs', productId, 'region-source-evidence-pack.json'),
      runtimeDecisionRef('outputs', productId, 'freshness-audit.json'),
      runtimeDecisionRef('outputs', productId, 'source-coverage-gate.json')
    ],
    verified_boundary: {
      overview_allowed: sourceGate.overview_allowed,
      market_ranking_allowed: sourceGate.market_ranking_allowed,
      acquisition_allowed: sourceGate.acquisition_allowed,
      quote_market_routing_allowed: sourceGate.quote_market_routing_allowed,
      real_external_actions_executed: false
    }
  },
  {
    capability_id: 'quote_and_logistics_confirmation',
    status: 'implemented_local_preview_verified',
    outputs: [
      runtimeDecisionRef('outputs', productId, 'quote-input-basis.confirmed.json'),
      runtimeDecisionRef('outputs', productId, 'logistics-basis.confirmed.json'),
      runtimeDecisionRef('outputs', productId, 'commercial-terms-gate.json')
    ],
    verified_boundary: {
      quote_draft_allowed: commercialGate.quote_draft_allowed,
      quote_send_allowed: commercialGate.quote_send_allowed,
      shipment_booking_allowed: commercialGate.shipment_booking_allowed,
      real_external_actions_executed: false
    }
  },
  {
    capability_id: 'script_backed_dashboard_save',
    status: 'implemented_local_preview_verified',
    outputs: [
      latestDashboardRun.local_save_request_ref,
      latestDashboardRun.run_event_ref,
      runtimeDecisionRef('latest-dashboard-save-run.json')
    ],
    verified_boundary: {
      latest_result: latestDashboardRun.latest_result,
      dashboard_direct_write_allowed: latestDashboardRun.dashboard_direct_write_allowed,
      real_external_actions_executed: false
    }
  }
]

const report = {
  contract: 'product_decision_remaining_capabilities_execution_report.v1',
  generated_at: generatedAt,
  product_id: productId,
  status: 'implemented_local_preview_verified',
  execution_scope: 'remaining_three_after_capability_c',
  real_external_actions_executed: false,
  implemented_capabilities: implementedCapabilities,
  validation_commands_required_for_acceptance: [
    'npm.cmd run cross-border:source-gate:validate',
    'npm.cmd run cross-border:quote-logistics:validate',
    'npm.cmd run cross-border:dashboard-save:validate',
    'npm.cmd run cross-border:remaining-capabilities:test',
    'npm.cmd run cross-border:validate',
    'npm.cmd run process-tree:validate'
  ],
  operator_boundary_after_execution: {
    product_page_draft_allowed: true,
    product_page_publish_allowed: false,
    market_ranking_allowed: sourceGate.market_ranking_allowed,
    acquisition_allowed: sourceGate.acquisition_allowed,
    quote_draft_allowed: commercialGate.quote_draft_allowed,
    quote_send_allowed: commercialGate.quote_send_allowed,
    shipment_booking_allowed: commercialGate.shipment_booking_allowed,
    dashboard_direct_write_allowed: latestDashboardRun.dashboard_direct_write_allowed
  }
}

const defectAssessment = {
  contract: 'product_decision_post_completion_defect_assessment.v1',
  generated_at: generatedAt,
  product_id: productId,
  status: 'local_preview_closure_complete_with_known_gaps',
  defects: [
    {
      defect_id: 'live_external_source_connectors_not_production_enabled',
      severity: 'high',
      impact: 'Country ranking and acquisition cannot be treated as current global market feedback.',
      current_gate: 'market_ranking_allowed=false, acquisition_allowed=false',
      recommended_fix: 'Build approved read-only connectors for target official, customs, tariff, marketplace and buyer-channel sources.'
    },
    {
      defect_id: 'factory_commercial_fields_not_confirmed',
      severity: 'high',
      impact: 'Real quotes, freight comparisons and shipment booking remain blocked.',
      current_gate: 'quote_send_allowed=false, shipment_booking_allowed=false',
      recommended_fix: 'Create factory confirmation input forms for MOQ, price tiers, lead time, packing, Incoterms, payment terms and price validity.'
    },
    {
      defect_id: 'browser_console_is_not_a_local_service',
      severity: 'medium',
      impact: 'The dashboard can inspect and generate controlled request artifacts, but one-click execution still requires a local service or explicit executor.',
      current_gate: 'dashboard_direct_write_allowed=false',
      recommended_fix: 'Add a small local execution service with product_id/path allowlists, request checksum validation and run-event logging.'
    },
    {
      defect_id: 'product_visual_extraction_is_not_full_image_reconstruction',
      severity: 'medium',
      impact: 'The asset pipeline classifies files and writes visual briefs, but does not yet crop, segment, repair or generate final product images.',
      current_gate: 'publish_visual_allowed=false',
      recommended_fix: 'Add PDF rendering/OCR/image segmentation and a visual QA loop before product-page publishing.'
    },
    {
      defect_id: 'certificate_and_claim_validation_is_still_manual',
      severity: 'medium',
      impact: 'AI customer answers and product page claims must avoid certification/performance claims until evidence is parsed and approved.',
      current_gate: 'certification_or_performance_claims_blocked_until_evidence',
      recommended_fix: 'Add certificate/test-report parser, claim whitelist review and expiry/standard matching.'
    }
  ],
  recommended_next_plan: [
    {
      step_id: 'next_01_live_read_only_connectors',
      label: 'Build live read-only source connector pack',
      reason: 'Unblocks stronger market ranking evidence without enabling outreach.'
    },
    {
      step_id: 'next_02_factory_confirmation_console',
      label: 'Build factory commercial-field confirmation console',
      reason: 'Turns quote/logistics gates from blocked into confirmed internal planning or quote-ready status.'
    },
    {
      step_id: 'next_03_local_dashboard_executor_service',
      label: 'Build controlled local dashboard executor service',
      reason: 'Allows one-click console execution while preserving checksum, path and action gates.'
    },
    {
      step_id: 'next_04_visual_reconstruction_pipeline',
      label: 'Build product visual reconstruction pipeline',
      reason: 'Moves from catalogue reference and visual brief to usable private-label product assets.'
    }
  ]
}

writeJson(join(deskRoot, 'remaining-capabilities-execution-report.json'), report)
writeJson(join(deskRoot, 'post-completion-defect-assessment.json'), defectAssessment)

writeMarkdown(join(deskRoot, 'remaining-capabilities-execution-report.md'), [
  '# Remaining Capability Execution Report',
  '',
  `Generated at: ${generatedAt}`,
  `Product: ${productId}`,
  '',
  'Status: implemented_local_preview_verified',
  '',
  '## Implemented',
  '',
  ...implementedCapabilities.map((item) => `- ${item.capability_id}: ${item.status}`),
  '',
  '## Current Gates',
  '',
  `- Market ranking allowed: ${sourceGate.market_ranking_allowed}`,
  `- Acquisition allowed: ${sourceGate.acquisition_allowed}`,
  `- Quote draft allowed: ${commercialGate.quote_draft_allowed}`,
  `- Quote send allowed: ${commercialGate.quote_send_allowed}`,
  `- Shipment booking allowed: ${commercialGate.shipment_booking_allowed}`,
  `- Dashboard direct write allowed: ${latestDashboardRun.dashboard_direct_write_allowed}`,
  '',
  'No real external actions were executed.'
])

writeMarkdown(join(deskRoot, 'post-completion-defect-assessment.md'), [
  '# Post Completion Defect Assessment',
  '',
  `Generated at: ${generatedAt}`,
  `Product: ${productId}`,
  '',
  'Status: local_preview_closure_complete_with_known_gaps',
  '',
  '## Remaining Defects',
  '',
  ...defectAssessment.defects.map((item) => `- ${item.defect_id} (${item.severity}): ${item.impact}`),
  '',
  '## Recommended Next Plan',
  '',
  ...defectAssessment.recommended_next_plan.map((item) => `- ${item.step_id}: ${item.label} - ${item.reason}`)
])

updatePlan(generatedAt)
updateDirection(generatedAt)
updateLatestManifest(productId, {
  remaining_capabilities_execution_report: runtimeDecisionRef('remaining-capabilities-execution-report.json'),
  remaining_capabilities_execution_report_md: runtimeDecisionRef('remaining-capabilities-execution-report.md'),
  post_completion_defect_assessment: runtimeDecisionRef('post-completion-defect-assessment.json'),
  post_completion_defect_assessment_md: runtimeDecisionRef('post-completion-defect-assessment.md')
}, generatedAt)

console.log(JSON.stringify({
  success: true,
  contract: 'remaining_capabilities_execution_report_result.v1',
  product_id: productId,
  generated_at: generatedAt,
  report: runtimeDecisionRef('remaining-capabilities-execution-report.json'),
  defect_assessment: runtimeDecisionRef('post-completion-defect-assessment.json'),
  real_external_actions_executed: false
}, null, 2))
