import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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

function isMissing(value) {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  const text = String(value).toLowerCase()
  return text.includes('pending') || text.includes('unknown') || text.includes('unconfirmed') || text.trim() === ''
}

function confirmationFor(fieldId, value, requiredFor, generatedAt) {
  const missing = isMissing(value)
  return {
    field_id: fieldId,
    value,
    required_for: requiredFor,
    confirmation_status: missing ? 'missing_or_pending_factory_confirmation' : 'draft_value_operator_confirmation_required',
    source: 'current_product_decision_pack_local_preview',
    confirmed_by: missing ? null : 'operator_required_before_real_use',
    confirmed_at: missing ? null : generatedAt,
    confidence: missing ? 'low' : 'medium_draft_only',
    evidence_status: missing ? 'not_confirmed' : 'draft_unverified'
  }
}

function updateLaunchVerdict(outputDir, gate, generatedAt) {
  const verdictPath = join(outputDir, 'launch-readiness-verdict.json')
  if (!existsSync(verdictPath)) return null
  const verdict = readJson(verdictPath)
  verdict.generated_at = generatedAt
  verdict.commercial_terms_gate_ref = runtimeDecisionRef('outputs', gate.product_id, 'commercial-terms-gate.json')
  verdict.blocked_next = [...new Set([...(verdict.blocked_next || []), 'quote_send', 'shipment_booking'])]
  verdict.blocked_reasons = [...new Set([...(verdict.blocked_reasons || []), 'commercial_terms_not_ready_for_quote'])]
  verdict.required_next_actions = [
    ...(verdict.required_next_actions || []),
    'Confirm MOQ, price tiers, lead time, packing weight/volume, Incoterms, payment terms and price validity before any real quote.'
  ]
  writeJson(verdictPath, verdict)
  return verdict
}

function updateLatestManifest(productId, extraRefs, gate, generatedAt) {
  if (!existsSync(latestSavedPath)) return null
  const manifest = readJson(latestSavedPath)
  if (manifest.product_id !== productId) return manifest
  manifest.output_refs = {
    ...(manifest.output_refs || {}),
    ...extraRefs
  }
  manifest.commercial_terms_gate = gate
  manifest.quote_logistics_confirmation = {
    status: 'implemented_local_preview_verified',
    generated_at: generatedAt,
    real_external_actions_executed: false,
    quote_send_allowed: false,
    shipment_booking_allowed: false
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

const quotePath = join(outputDir, 'quote-input-basis.json')
const logisticsPath = join(outputDir, 'logistics-basis.json')
if (!existsSync(quotePath)) throw new Error(`Missing quote input basis: ${quotePath}`)
if (!existsSync(logisticsPath)) throw new Error(`Missing logistics basis: ${logisticsPath}`)

const quote = readJson(quotePath)
const logistics = readJson(logisticsPath)
const quoteFields = {
  moq: confirmationFor('moq', quote.moq, ['quote_draft', 'quote_send'], generatedAt),
  price_tiers: confirmationFor('price_tiers', quote.price_tiers, ['quote_draft', 'quote_send', 'margin_control'], generatedAt),
  sample_policy: confirmationFor('sample_policy', quote.sample_policy, ['sample_quote', 'buyer_expectation'], generatedAt),
  lead_time: confirmationFor('lead_time', quote.lead_time, ['quote_send', 'production_planning'], generatedAt),
  incoterms: confirmationFor('incoterms', quote.incoterms, ['quote_draft', 'logistics_basis'], generatedAt),
  currency: confirmationFor('currency', quote.currency, ['quote_draft', 'payment_terms'], generatedAt),
  payment_terms: confirmationFor('payment_terms', quote.payment_terms, ['quote_send', 'risk_control'], generatedAt),
  price_validity: confirmationFor('price_validity', quote.price_validity, ['quote_send'], generatedAt),
  packing_weight_volume: confirmationFor('packing_weight_volume', quote.packing_weight_volume, ['logistics_comparison', 'landed_cost'], generatedAt)
}

const logisticsFields = {
  carton_dimensions: confirmationFor('carton_dimensions', logistics.carton_dimensions, ['freight_comparison', 'shipment_booking'], generatedAt),
  net_gross_weight: confirmationFor('net_gross_weight', logistics.net_gross_weight, ['freight_comparison', 'shipment_booking'], generatedAt),
  volume: confirmationFor('volume', logistics.volume, ['freight_comparison', 'shipment_booking'], generatedAt),
  packing_weight_volume: confirmationFor('packing_weight_volume', logistics.packing_weight_volume, ['freight_comparison', 'landed_cost'], generatedAt),
  dangerous_goods_status: confirmationFor('dangerous_goods_status', logistics.dangerous_goods_status, ['carrier_screening'], generatedAt),
  destination_candidates: confirmationFor('destination_candidates', logistics.destination_candidates, ['freight_comparison'], generatedAt),
  shipping_mode_candidates: confirmationFor('shipping_mode_candidates', logistics.shipping_mode_candidates, ['freight_comparison'], generatedAt)
}

const missingQuoteFields = Object.values(quoteFields)
  .filter((field) => field.confirmation_status === 'missing_or_pending_factory_confirmation')
  .map((field) => field.field_id)
const missingLogisticsFields = Object.values(logisticsFields)
  .filter((field) => field.confirmation_status === 'missing_or_pending_factory_confirmation')
  .map((field) => field.field_id)

const quoteDraftAllowed = !isMissing(quote.currency) && Array.isArray(quote.incoterms) && quote.incoterms.length > 0
const commercialTermsGate = {
  contract: 'commercial_terms_gate.v1',
  generated_at: generatedAt,
  product_id: productId,
  execution_mode: 'local_preview_operator_confirmation_gate',
  real_external_actions_executed: false,
  status: missingQuoteFields.length || missingLogisticsFields.length ? 'blocked_for_real_quote' : 'draft_confirmed_for_internal_planning',
  quote_draft_allowed: quoteDraftAllowed,
  quote_send_allowed: false,
  shipment_booking_allowed: false,
  freight_comparison_allowed: missingLogisticsFields.length === 0,
  missing_quote_fields: missingQuoteFields,
  missing_logistics_fields: missingLogisticsFields,
  human_gate_status: 'required_before_quote_send_or_shipment_booking',
  blocked_real_actions: [
    'quote_send',
    'customer_email_send',
    'crm_production_write',
    'shipment_booking',
    'formal_landed_cost_claim'
  ],
  required_next_actions: [
    'Confirm MOQ and price tiers from factory or price book.',
    'Confirm sample policy, lead time, payment terms and price validity.',
    'Confirm carton dimensions, net/gross weight, volume and packing quantity.',
    'Confirm target destination before any freight comparison is treated as usable.'
  ]
}

const confirmedQuote = {
  ...quote,
  generated_at: generatedAt,
  confirmation_variant: true,
  confirmation_status: commercialTermsGate.status,
  field_confirmations: quoteFields,
  quote_draft_allowed: quoteDraftAllowed,
  quote_send_allowed: false,
  commercial_terms_gate_ref: runtimeDecisionRef('outputs', productId, 'commercial-terms-gate.json'),
  real_external_actions_executed: false
}

const confirmedLogistics = {
  ...logistics,
  generated_at: generatedAt,
  confirmation_variant: true,
  confirmation_status: commercialTermsGate.status,
  field_confirmations: logisticsFields,
  freight_comparison_allowed: commercialTermsGate.freight_comparison_allowed,
  shipment_booking_allowed: false,
  commercial_terms_gate_ref: runtimeDecisionRef('outputs', productId, 'commercial-terms-gate.json'),
  real_external_actions_executed: false
}

writeJson(join(outputDir, 'quote-input-basis.confirmed.json'), confirmedQuote)
writeJson(join(outputDir, 'logistics-basis.confirmed.json'), confirmedLogistics)
writeJson(join(outputDir, 'commercial-terms-gate.json'), commercialTermsGate)
updateLaunchVerdict(outputDir, commercialTermsGate, generatedAt)
updateLatestManifest(productId, {
  quote_input_basis_confirmed: runtimeDecisionRef('outputs', productId, 'quote-input-basis.confirmed.json'),
  logistics_basis_confirmed: runtimeDecisionRef('outputs', productId, 'logistics-basis.confirmed.json'),
  commercial_terms_gate: runtimeDecisionRef('outputs', productId, 'commercial-terms-gate.json')
}, commercialTermsGate, generatedAt)

console.log(JSON.stringify({
  success: true,
  contract: 'quote_logistics_confirmation_result.v1',
  product_id: productId,
  generated_at: generatedAt,
  commercial_terms_gate: runtimeDecisionRef('outputs', productId, 'commercial-terms-gate.json'),
  quote_draft_allowed: commercialTermsGate.quote_draft_allowed,
  quote_send_allowed: commercialTermsGate.quote_send_allowed,
  shipment_booking_allowed: commercialTermsGate.shipment_booking_allowed,
  missing_quote_fields: missingQuoteFields,
  missing_logistics_fields: missingLogisticsFields,
  real_external_actions_executed: false
}, null, 2))
