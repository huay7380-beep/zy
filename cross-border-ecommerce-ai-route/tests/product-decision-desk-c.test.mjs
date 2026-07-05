import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const testDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(testDir, '..')
const workspaceRoot = resolve(projectRoot, '..')
const deskRoot = join(projectRoot, 'runtime', 'growth-sales-automation', 'product-decision-desk')
const productId = 'structured-cabling-sample'

function runNode(script, args = []) {
  execFileSync(process.execPath, [join(projectRoot, 'scripts', script), ...args], {
    cwd: workspaceRoot,
    stdio: 'pipe'
  })
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

test('capability C asset intake scans the main product PDF files read-only', () => {
  runNode('run-product-asset-intake.mjs', [`--product-id=${productId}`])
  runNode('validate-product-assets.mjs', [`--product-id=${productId}`])

  const manifestPath = join(deskRoot, 'inputs', productId, 'source-file-manifest.json')
  const visualBriefPath = join(deskRoot, 'outputs', productId, 'product-visual-brief.json')
  const assetQaPath = join(deskRoot, 'outputs', productId, 'asset-qa-report.json')

  assert.equal(existsSync(manifestPath), true)
  assert.equal(existsSync(visualBriefPath), true)
  assert.equal(existsSync(assetQaPath), true)

  const manifest = readJson(manifestPath)
  const sourceRefs = manifest.files.map((file) => file.source_ref)
  assert.equal(manifest.contract, 'source_file_manifest.v1')
  assert.equal(manifest.real_external_actions_executed, false)
  assert.equal(manifest.read_boundary.original_files_mutated, false)
  assert.equal(sourceRefs.some((sourceRef) => sourceRef.endsWith('2024 NEW PRODUCT CATALOGUE.pdf')), true)
  assert.equal(sourceRefs.some((sourceRef) => sourceRef.endsWith('ELECTRONIC CATALOGUE.pdf')), true)
  assert.equal(manifest.summary.supplier_catalogue_pdf_count >= 2, true)
  for (const file of manifest.files) {
    assert.equal(file.external_upload_executed, false)
    assert.equal(file.sha256_before, file.sha256_after)
    assert.equal(file.sha256_before.length, 64)
  }

  const visualBrief = readJson(visualBriefPath)
  const assetQa = readJson(assetQaPath)
  assert.equal(visualBrief.contract, 'product_visual_brief.v1')
  assert.equal(visualBrief.page_draft_use.publish_blocked_until_asset_qa_passes, true)
  assert.equal(assetQa.contract, 'asset_qa_report.v1')
  assert.equal(typeof assetQa.page_draft_allowed, 'boolean')
  assert.equal(assetQa.publish_visual_allowed, false)
})

test('capability C category profiles cover the initial multi-category library', () => {
  runNode('write-category-profile-coverage.mjs')
  runNode('validate-category-profiles.mjs')

  const rules = readJson(join(deskRoot, 'product-launch-decision-rules.json'))
  const report = readJson(join(deskRoot, 'category-profile-coverage-report.json'))
  const ids = new Set(rules.category_profiles.map((profile) => profile.category_id))
  const requiredIds = [
    'structured_cabling',
    'lighting_and_electrical',
    'apparel_and_textile',
    'packaging_and_printing',
    'chemicals_and_materials',
    'auto_parts',
    'home_goods',
    'consumer_electronics',
    'machinery_and_tools',
    'private_label_custom_products'
  ]

  assert.equal(rules.contract, 'product_launch_decision_rules.v1')
  assert.equal(rules.category_profiles.length >= 10, true)
  for (const categoryId of requiredIds) {
    assert.equal(ids.has(categoryId), true, `missing category ${categoryId}`)
  }

  assert.equal(report.contract, 'category_profile_coverage_report.v1')
  assert.equal(report.real_external_actions_allowed, false)
  assert.equal(report.execution_allowed_now, false)
  assert.equal(report.initial_scope.covered_count, requiredIds.length)
  assert.equal(report.initial_scope.missing_categories.length, 0)
})
