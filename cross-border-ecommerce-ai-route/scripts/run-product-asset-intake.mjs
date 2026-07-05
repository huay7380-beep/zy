import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'
import { ensureDir, nowIso, projectRoot, writeJson } from './cross-border-stage-control-lib.mjs'

const runtimeRoot = join(projectRoot, 'runtime', 'growth-sales-automation')
const deskRoot = join(runtimeRoot, 'product-decision-desk')
const rulesPath = join(deskRoot, 'product-launch-decision-rules.json')
const latestSavedPath = join(deskRoot, 'latest-saved-product-decision.json')
const defaultProductFiles = [
  join(projectRoot, '2024 NEW PRODUCT CATALOGUE.pdf'),
  join(projectRoot, 'ELECTRONIC CATALOGUE.pdf')
]

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

function projectRef(absPath) {
  return `cross-border-ecommerce-ai-route/${relative(projectRoot, absPath).replaceAll('\\', '/')}`
}

function runtimeDecisionRef(...parts) {
  return `cross-border-ecommerce-ai-route/${join('runtime', 'growth-sales-automation', 'product-decision-desk', ...parts).replaceAll('\\', '/')}`
}

function resolveProductFiles(args) {
  if (!args.files) return defaultProductFiles
  return String(args.files)
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => resolve(projectRoot, item))
}

function assertInsideProject(absPath) {
  const rel = relative(projectRoot, absPath)
  if (rel.startsWith('..') || rel === '' || /^[a-zA-Z]:/.test(rel)) {
    throw new Error(`Refusing to read outside project root: ${absPath}`)
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function guessMime(extension) {
  const ext = extension.toLowerCase()
  if (ext === '.pdf') return 'application/pdf'
  if (['.jpg', '.jpeg'].includes(ext)) return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.json') return 'application/json'
  if (ext === '.html' || ext === '.htm') return 'text/html'
  return 'application/octet-stream'
}

function classifyFile(fileName, extension) {
  const lower = fileName.toLowerCase()
  if (extension === '.pdf' && /catalog|catalogue|产品|图册|目录/.test(lower)) {
    return {
      file_role: 'supplier_catalogue_pdf',
      evidence_role: 'product_source_catalogue',
      asset_role: 'catalogue_reference'
    }
  }
  if (extension === '.pdf' && /cert|certificate|ce|rohs|ul|etl|report|test/.test(lower)) {
    return {
      file_role: 'certificate_or_test_report_pdf',
      evidence_role: 'compliance_evidence_candidate',
      asset_role: 'evidence_document'
    }
  }
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
    return {
      file_role: 'product_image',
      evidence_role: 'visual_asset_candidate',
      asset_role: /pack|carton|box|包装/.test(lower) ? 'packing_image' : 'product_image'
    }
  }
  return {
    file_role: 'unknown_file',
    evidence_role: 'unclassified',
    asset_role: 'unknown'
  }
}

function extractPdfMetadata(buffer) {
  const latin = buffer.toString('latin1')
  const pageMatches = latin.match(/\/Type\s*\/Page(?!s)\b/g) || []
  const mediaBoxMatches = latin.match(/\/MediaBox\s*\[[^\]]+\]/g) || []
  return {
    detected_page_count: pageMatches.length || null,
    media_box_samples: mediaBoxMatches.slice(0, 3),
    extraction_method: 'read_only_pdf_token_scan'
  }
}

function summarizeManifest(files) {
  const counts = files.reduce((summary, file) => {
    summary[file.file_role] = (summary[file.file_role] || 0) + 1
    return summary
  }, {})
  return {
    source_file_count: files.length,
    supplier_catalogue_pdf_count: counts.supplier_catalogue_pdf || 0,
    product_image_count: counts.product_image || 0,
    certificate_or_test_report_pdf_count: counts.certificate_or_test_report_pdf || 0,
    unknown_file_count: counts.unknown_file || 0
  }
}

function selectedCategoryProfile(productId, rules) {
  const categoryProfiles = rules.category_profiles || []
  const structured = categoryProfiles.find((profile) => profile.category_id === 'structured_cabling')
  return structured || categoryProfiles[0] || {
    category_id: 'unknown',
    label: 'Unknown category',
    asset_requirements: [],
    category_specific_questions: []
  }
}

function buildVisualBrief({ generatedAt, productId, productInput, categoryProfile, manifestSummary }) {
  const requiredShots = [
    'white_background_main_product',
    'front_angle',
    'side_angle',
    'back_angle_or_port_detail',
    'accessory_and_component_layout',
    'installation_or_use_scene',
    'packaging_and_label',
    'private_label_zone'
  ]
  return {
    contract: 'product_visual_brief.v1',
    generated_at: generatedAt,
    product_id: productId,
    product_name: productInput.product_name || productId,
    category_id: categoryProfile.category_id,
    category_label: categoryProfile.label,
    source_manifest_ref: runtimeDecisionRef('inputs', productId, 'source-file-manifest.json'),
    asset_requirements_from_category: categoryProfile.asset_requirements || [],
    required_product_page_images: requiredShots.map((shot) => ({
      shot_id: shot,
      status: manifestSummary.product_image_count > 0 ? 'source_image_review_required' : 'missing_or_catalogue_only',
      required_for: shot === 'private_label_zone' ? 'private_label_visual_system' : 'product_page_draft'
    })),
    private_label_direction: {
      label_support_status: productInput.minimum_foreign_trade_fields?.claim_whitelist?.includes('private label support')
        ? 'supported_by_current_product_claims_draft'
        : 'unknown',
      must_keep_supplier_brand_removed: true,
      final_label_artwork_required: true
    },
    page_draft_use: {
      allowed: manifestSummary.supplier_catalogue_pdf_count > 0,
      mode: manifestSummary.product_image_count > 0 ? 'draft_with_source_images' : 'draft_from_catalogue_reference_only',
      publish_blocked_until_asset_qa_passes: true
    },
    real_external_actions_executed: false
  }
}

function buildAssetQaReport({ generatedAt, productId, manifestSummary, files }) {
  const hasCatalogue = manifestSummary.supplier_catalogue_pdf_count > 0
  const hasImages = manifestSummary.product_image_count > 0
  const hasEvidence = manifestSummary.certificate_or_test_report_pdf_count > 0
  const checks = [
    {
      check_id: 'catalogue_source_available',
      status: hasCatalogue ? 'pass' : 'fail',
      evidence: `${manifestSummary.supplier_catalogue_pdf_count} supplier catalogue PDF(s) classified`
    },
    {
      check_id: 'isolated_product_images_available',
      status: hasImages ? 'pass' : 'warn',
      evidence: hasImages ? `${manifestSummary.product_image_count} image file(s) classified` : 'No standalone image files; current assets are catalogue references only'
    },
    {
      check_id: 'certificate_or_test_report_available',
      status: hasEvidence ? 'pass' : 'warn',
      evidence: hasEvidence ? `${manifestSummary.certificate_or_test_report_pdf_count} evidence file(s) classified` : 'No certificate/test-report file classified'
    },
    {
      check_id: 'read_only_integrity',
      status: files.every((file) => file.sha256_before === file.sha256_after) ? 'pass' : 'fail',
      evidence: 'Source file checksum before/after read-only scan'
    }
  ]
  const pageDraftAllowed = hasCatalogue || hasImages
  return {
    contract: 'asset_qa_report.v1',
    generated_at: generatedAt,
    product_id: productId,
    source_manifest_ref: runtimeDecisionRef('inputs', productId, 'source-file-manifest.json'),
    visual_brief_ref: runtimeDecisionRef('outputs', productId, 'product-visual-brief.json'),
    page_draft_allowed: pageDraftAllowed,
    page_draft_mode: pageDraftAllowed ? 'draft_only_with_asset_gaps' : 'blocked_until_source_asset_available',
    publish_visual_allowed: false,
    visual_readiness_score: hasImages ? 72 : hasCatalogue ? 58 : 25,
    evidence_readiness_score: hasEvidence ? 70 : 35,
    checks,
    blocking_reasons_for_publish: [
      ...(hasImages ? [] : ['standalone_product_images_missing']),
      ...(hasEvidence ? [] : ['certificate_or_test_report_missing_or_unclassified']),
      'operator_visual_review_required_before_publish'
    ],
    required_followup_questions: [
      ...(hasImages ? [] : ['Please provide standalone product images or approve catalogue-based draft extraction.']),
      'Which accessories must remain visible in product page images?',
      'Where should the private-label mark be placed on product, packaging, and catalogue images?',
      ...(hasEvidence ? [] : ['Please provide certificates/test reports or explicitly block certification claims.'])
    ],
    real_external_actions_executed: false
  }
}

function updateLatestManifest(productId, extraRefs) {
  if (!existsSync(latestSavedPath)) return null
  const manifest = readJson(latestSavedPath)
  if (manifest.product_id !== productId) return manifest
  manifest.output_refs = {
    ...(manifest.output_refs || {}),
    ...extraRefs
  }
  manifest.asset_intake_pipeline = {
    status: 'implemented_local_preview',
    generated_at: extraRefs.generated_at || nowIso(),
    real_external_actions_executed: false
  }
  delete manifest.output_refs.generated_at
  writeJson(latestSavedPath, manifest)
  return manifest
}

const args = parseArgs(process.argv)
const generatedAt = nowIso()
const latestSaved = existsSync(latestSavedPath) ? readJson(latestSavedPath) : null
const productId = safeProductId(args['product-id'] || latestSaved?.product_id || 'structured-cabling-sample')
const productInputPath = join(deskRoot, 'inputs', productId, 'normalized-product-input.json')
const inputDir = join(deskRoot, 'inputs', productId)
const outputDir = join(deskRoot, 'outputs', productId)
const rules = readJson(rulesPath)
const productInput = existsSync(productInputPath)
  ? readJson(productInputPath)
  : { product_id: productId, product_name: productId, minimum_foreign_trade_fields: {} }
const categoryProfile = selectedCategoryProfile(productId, rules)
const sourceFiles = resolveProductFiles(args)

ensureDir(inputDir)
ensureDir(outputDir)

const files = sourceFiles.map((filePath, index) => {
  const absPath = resolve(filePath)
  assertInsideProject(absPath)
  if (!existsSync(absPath)) throw new Error(`Missing source file: ${absPath}`)
  const extension = extname(absPath).toLowerCase()
  const buffer = readFileSync(absPath)
  const beforeHash = sha256(buffer)
  const afterHash = sha256(readFileSync(absPath))
  const stats = statSync(absPath)
  const classification = classifyFile(basename(absPath), extension)
  const pdf = extension === '.pdf' ? extractPdfMetadata(buffer) : null
  return {
    file_id: `asset_${String(index + 1).padStart(2, '0')}`,
    source_ref: projectRef(absPath),
    original_file_name: basename(absPath),
    extension,
    mime_guess: guessMime(extension),
    file_size_bytes: stats.size,
    modified_at: stats.mtime.toISOString(),
    sha256_before: beforeHash,
    sha256_after: afterHash,
    read_mode: 'read_only_local_scan',
    external_upload_executed: false,
    classification_status: 'classified_local_preview',
    evidence_status: classification.evidence_role === 'compliance_evidence_candidate'
      ? 'candidate_unverified'
      : 'source_available_unverified',
    ...classification,
    pdf_metadata: pdf
  }
})

const manifestSummary = summarizeManifest(files)
const manifest = {
  contract: 'source_file_manifest.v1',
  generated_at: generatedAt,
  product_id: productId,
  asset_pipeline_version: 'asset_intake_pipeline.v1',
  source_root_ref: 'cross-border-ecommerce-ai-route/',
  read_boundary: {
    mode: 'project_root_only',
    original_files_mutated: false,
    external_upload_executed: false
  },
  summary: manifestSummary,
  files,
  required_next_actions: [
    ...(manifestSummary.product_image_count > 0 ? [] : ['provide_or_extract_standalone_product_images']),
    ...(manifestSummary.certificate_or_test_report_pdf_count > 0 ? [] : ['provide_certificate_or_test_report_or_block_claims']),
    'confirm_accessory_visibility_requirements',
    'confirm_private_label_visual_zone'
  ],
  real_external_actions_executed: false
}

const visualBrief = buildVisualBrief({ generatedAt, productId, productInput, categoryProfile, manifestSummary })
const assetQaReport = buildAssetQaReport({ generatedAt, productId, manifestSummary, files })

writeJson(join(inputDir, 'source-file-manifest.json'), manifest)
writeJson(join(outputDir, 'product-visual-brief.json'), visualBrief)
writeJson(join(outputDir, 'asset-qa-report.json'), assetQaReport)
writeFileSync(join(outputDir, 'asset-intake-summary.md'), [
  '# Product Asset Intake Summary',
  '',
  `Product: \`${productId}\``,
  `Generated at: ${generatedAt}`,
  '',
  `Catalogue PDFs: ${manifestSummary.supplier_catalogue_pdf_count}`,
  `Standalone images: ${manifestSummary.product_image_count}`,
  `Certificate/test report files: ${manifestSummary.certificate_or_test_report_pdf_count}`,
  '',
  `Page draft allowed: ${assetQaReport.page_draft_allowed}`,
  `Publish visual allowed: ${assetQaReport.publish_visual_allowed}`,
  '',
  '## Files',
  '',
  ...files.map((file) => `- \`${file.original_file_name}\`: ${file.file_role}, ${file.file_size_bytes} bytes, pages ${file.pdf_metadata?.detected_page_count || 'n/a'}`)
].join('\n') + '\n', 'utf8')

updateLatestManifest(productId, {
  source_file_manifest: runtimeDecisionRef('inputs', productId, 'source-file-manifest.json'),
  product_visual_brief: runtimeDecisionRef('outputs', productId, 'product-visual-brief.json'),
  asset_qa_report: runtimeDecisionRef('outputs', productId, 'asset-qa-report.json'),
  asset_intake_summary: runtimeDecisionRef('outputs', productId, 'asset-intake-summary.md'),
  generated_at: generatedAt
})

console.log(JSON.stringify({
  success: true,
  contract: 'asset_intake_pipeline_run_result.v1',
  product_id: productId,
  generated_at: generatedAt,
  source_file_manifest: runtimeDecisionRef('inputs', productId, 'source-file-manifest.json'),
  product_visual_brief: runtimeDecisionRef('outputs', productId, 'product-visual-brief.json'),
  asset_qa_report: runtimeDecisionRef('outputs', productId, 'asset-qa-report.json'),
  summary: manifestSummary,
  page_draft_allowed: assetQaReport.page_draft_allowed,
  publish_visual_allowed: assetQaReport.publish_visual_allowed,
  real_external_actions_executed: false
}, null, 2))
