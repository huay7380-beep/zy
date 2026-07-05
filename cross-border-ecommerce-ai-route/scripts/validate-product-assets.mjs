import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './cross-border-stage-control-lib.mjs'

const deskRoot = join(projectRoot, 'runtime', 'growth-sales-automation', 'product-decision-desk')

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

function requireFile(path, errors) {
  if (!existsSync(path)) {
    errors.push(`missing file: ${path}`)
    return null
  }
  return readJson(path)
}

const args = parseArgs(process.argv)
const productId = String(args['product-id'] || 'structured-cabling-sample')
const inputDir = join(deskRoot, 'inputs', productId)
const outputDir = join(deskRoot, 'outputs', productId)
const errors = []
const warnings = []

const manifest = requireFile(join(inputDir, 'source-file-manifest.json'), errors)
const visualBrief = requireFile(join(outputDir, 'product-visual-brief.json'), errors)
const assetQa = requireFile(join(outputDir, 'asset-qa-report.json'), errors)

if (manifest) {
  if (manifest.contract !== 'source_file_manifest.v1') errors.push('source-file-manifest contract mismatch')
  if (manifest.real_external_actions_executed !== false) errors.push('asset manifest must record no real external actions')
  if (manifest.read_boundary?.original_files_mutated !== false) errors.push('asset manifest must record original_files_mutated=false')
  const files = manifest.files || []
  const sourceRefs = files.map((file) => file.source_ref)
  for (const requiredName of ['2024 NEW PRODUCT CATALOGUE.pdf', 'ELECTRONIC CATALOGUE.pdf']) {
    if (!sourceRefs.some((sourceRef) => sourceRef.endsWith(requiredName))) {
      errors.push(`asset manifest missing required main product file: ${requiredName}`)
    }
  }
  const catalogueFiles = files.filter((file) => file.file_role === 'supplier_catalogue_pdf')
  if (catalogueFiles.length < 2) errors.push('asset manifest must classify at least two supplier catalogue PDFs')
  for (const file of files) {
    if (!file.sha256_before || file.sha256_before.length !== 64) errors.push(`file missing sha256_before: ${file.original_file_name}`)
    if (file.sha256_before !== file.sha256_after) errors.push(`file checksum changed during read-only scan: ${file.original_file_name}`)
    if (file.external_upload_executed !== false) errors.push(`file external upload must be false: ${file.original_file_name}`)
    if (file.extension === '.pdf' && !file.pdf_metadata?.detected_page_count) {
      warnings.push(`PDF page count was not detected: ${file.original_file_name}`)
    }
  }
}

if (visualBrief) {
  if (visualBrief.contract !== 'product_visual_brief.v1') errors.push('product visual brief contract mismatch')
  if (visualBrief.real_external_actions_executed !== false) errors.push('product visual brief must record no real external actions')
  if (!Array.isArray(visualBrief.required_product_page_images) || visualBrief.required_product_page_images.length < 6) {
    errors.push('product visual brief must define required product page images')
  }
  if (visualBrief.page_draft_use?.publish_blocked_until_asset_qa_passes !== true) {
    errors.push('product visual brief must block publish until asset QA passes')
  }
}

if (assetQa) {
  if (assetQa.contract !== 'asset_qa_report.v1') errors.push('asset QA contract mismatch')
  if (assetQa.real_external_actions_executed !== false) errors.push('asset QA must record no real external actions')
  if (typeof assetQa.page_draft_allowed !== 'boolean') errors.push('asset QA must define page_draft_allowed boolean')
  if (assetQa.publish_visual_allowed !== false) errors.push('asset QA must keep publish_visual_allowed=false')
  if (!Array.isArray(assetQa.checks) || assetQa.checks.length < 4) errors.push('asset QA must include checks')
  if (!Array.isArray(assetQa.required_followup_questions) || assetQa.required_followup_questions.length < 2) {
    errors.push('asset QA must include follow-up questions')
  }
}

const result = {
  contract: 'product_asset_validation_report.v1',
  product_id: productId,
  errors,
  warnings,
  result: errors.length ? 'fail' : 'pass'
}

console.log(JSON.stringify(result, null, 2))
if (errors.length) process.exit(1)
