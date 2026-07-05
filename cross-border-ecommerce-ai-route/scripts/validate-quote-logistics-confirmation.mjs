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

function validateFieldConfirmations(name, fields, errors) {
  if (!fields || typeof fields !== 'object') {
    errors.push(`${name} must include field_confirmations`)
    return
  }
  for (const [fieldId, field] of Object.entries(fields)) {
    for (const key of ['field_id', 'value', 'required_for', 'confirmation_status', 'source', 'confidence', 'evidence_status']) {
      if (!(key in field)) errors.push(`${name}.${fieldId} missing ${key}`)
    }
    if (!Array.isArray(field.required_for) || field.required_for.length === 0) {
      errors.push(`${name}.${fieldId} must include required_for`)
    }
    if (field.confirmation_status !== 'missing_or_pending_factory_confirmation') {
      if (!field.confirmed_by || !field.confirmed_at) {
        errors.push(`${name}.${fieldId} draft confirmed field must include confirmed_by and confirmed_at`)
      }
    }
  }
}

const args = parseArgs(process.argv)
const productId = String(args['product-id'] || 'structured-cabling-sample')
const outputDir = join(deskRoot, 'outputs', productId)
const errors = []
const warnings = []

const confirmedQuote = requireJson(join(outputDir, 'quote-input-basis.confirmed.json'), errors)
const confirmedLogistics = requireJson(join(outputDir, 'logistics-basis.confirmed.json'), errors)
const commercialGate = requireJson(join(outputDir, 'commercial-terms-gate.json'), errors)
const latestSaved = requireJson(latestSavedPath, errors)

if (confirmedQuote) {
  if (confirmedQuote.contract !== 'quote_input_basis.v1') errors.push('confirmed quote basis contract mismatch')
  if (confirmedQuote.real_external_actions_executed !== false) errors.push('confirmed quote basis must record no real external actions')
  if (confirmedQuote.quote_send_allowed !== false) errors.push('confirmed quote basis must keep quote_send_allowed=false')
  if (confirmedQuote.confirmation_variant !== true) errors.push('confirmed quote basis must set confirmation_variant=true')
  validateFieldConfirmations('quote', confirmedQuote.field_confirmations, errors)
}

if (confirmedLogistics) {
  if (confirmedLogistics.contract !== 'logistics_basis.v1') errors.push('confirmed logistics basis contract mismatch')
  if (confirmedLogistics.real_external_actions_executed !== false) errors.push('confirmed logistics basis must record no real external actions')
  if (confirmedLogistics.shipment_booking_allowed !== false) errors.push('confirmed logistics basis must keep shipment_booking_allowed=false')
  if (confirmedLogistics.confirmation_variant !== true) errors.push('confirmed logistics basis must set confirmation_variant=true')
  validateFieldConfirmations('logistics', confirmedLogistics.field_confirmations, errors)
}

if (commercialGate) {
  if (commercialGate.contract !== 'commercial_terms_gate.v1') errors.push('commercial terms gate contract mismatch')
  if (commercialGate.real_external_actions_executed !== false) errors.push('commercial terms gate must record no real external actions')
  if (commercialGate.quote_draft_allowed !== true) warnings.push('quote draft is not allowed; check current commercial inputs')
  if (commercialGate.quote_send_allowed !== false) errors.push('commercial terms gate must keep quote_send_allowed=false')
  if (commercialGate.shipment_booking_allowed !== false) errors.push('commercial terms gate must keep shipment_booking_allowed=false')
  for (const field of ['moq', 'price_tiers', 'packing_weight_volume']) {
    if (![...(commercialGate.missing_quote_fields || []), ...(commercialGate.missing_logistics_fields || [])].includes(field)) {
      warnings.push(`expected missing field not listed under current sample: ${field}`)
    }
  }
  if (!Array.isArray(commercialGate.blocked_real_actions) || !commercialGate.blocked_real_actions.includes('quote_send')) {
    errors.push('commercial terms gate must block quote_send')
  }
}

if (latestSaved) {
  for (const key of ['quote_input_basis_confirmed', 'logistics_basis_confirmed', 'commercial_terms_gate']) {
    if (!latestSaved.output_refs?.[key]) errors.push(`latest saved product decision missing output ref: ${key}`)
  }
  if (latestSaved.commercial_terms_gate?.quote_send_allowed !== false) {
    errors.push('latest saved commercial terms gate must block quote send')
  }
}

const result = {
  contract: 'quote_logistics_confirmation_validation_report.v1',
  product_id: productId,
  errors,
  warnings,
  result: errors.length ? 'fail' : 'pass'
}

console.log(JSON.stringify(result, null, 2))
if (errors.length) process.exit(1)
