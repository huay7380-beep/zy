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

test('remaining product decision capabilities execute as local-preview gates', () => {
  runNode('run-source-gate-execution.mjs', [`--product-id=${productId}`])
  runNode('validate-source-gate-execution.mjs', [`--product-id=${productId}`])
  runNode('confirm-quote-logistics-basis.mjs', [`--product-id=${productId}`])
  runNode('validate-quote-logistics-confirmation.mjs', [`--product-id=${productId}`])
  runNode('run-dashboard-save-request.mjs', [`--product-id=${productId}`, '--request-id=remaining_test_save_request'])
  runNode('validate-dashboard-save-request.mjs', [`--product-id=${productId}`])
  runNode('write-remaining-capabilities-execution-report.mjs', [`--product-id=${productId}`])

  const outputDir = join(deskRoot, 'outputs', productId)
  const sourceGate = readJson(join(outputDir, 'source-coverage-gate.json'))
  const commercialGate = readJson(join(outputDir, 'commercial-terms-gate.json'))
  const latestRun = readJson(join(deskRoot, 'latest-dashboard-save-run.json'))
  const report = readJson(join(deskRoot, 'remaining-capabilities-execution-report.json'))
  const defectAssessment = readJson(join(deskRoot, 'post-completion-defect-assessment.json'))
  const latestSaved = readJson(join(deskRoot, 'latest-saved-product-decision.json'))

  assert.equal(sourceGate.contract, 'source_coverage_gate.v1')
  assert.equal(sourceGate.real_external_actions_executed, false)
  assert.equal(sourceGate.market_ranking_allowed, false)
  assert.equal(sourceGate.acquisition_allowed, false)
  assert.equal(sourceGate.major_region_count >= 8, true)

  assert.equal(commercialGate.contract, 'commercial_terms_gate.v1')
  assert.equal(commercialGate.real_external_actions_executed, false)
  assert.equal(commercialGate.quote_draft_allowed, true)
  assert.equal(commercialGate.quote_send_allowed, false)
  assert.equal(commercialGate.shipment_booking_allowed, false)

  assert.equal(latestRun.contract, 'controlled_dashboard_save_latest_run.v1')
  assert.equal(latestRun.real_external_actions_executed, false)
  assert.equal(latestRun.dashboard_direct_write_allowed, false)
  assert.equal(latestRun.latest_result, 'pass')

  assert.equal(report.contract, 'product_decision_remaining_capabilities_execution_report.v1')
  assert.equal(report.status, 'implemented_local_preview_verified')
  assert.equal(report.real_external_actions_executed, false)
  assert.equal(report.implemented_capabilities.length, 3)

  assert.equal(defectAssessment.contract, 'product_decision_post_completion_defect_assessment.v1')
  assert.equal(defectAssessment.defects.length >= 5, true)
  assert.equal(defectAssessment.recommended_next_plan.length >= 4, true)

  for (const key of [
    'region_source_evidence_pack',
    'freshness_audit',
    'source_coverage_gate',
    'quote_input_basis_confirmed',
    'logistics_basis_confirmed',
    'commercial_terms_gate',
    'local_save_request',
    'controlled_save_run_event',
    'latest_dashboard_save_run',
    'remaining_capabilities_execution_report',
    'post_completion_defect_assessment'
  ]) {
    assert.ok(latestSaved.output_refs[key], `missing latest saved output ref ${key}`)
  }

  for (const file of [
    join(outputDir, 'region-source-evidence-pack.json'),
    join(outputDir, 'freshness-audit.json'),
    join(outputDir, 'source-coverage-gate.json'),
    join(outputDir, 'quote-input-basis.confirmed.json'),
    join(outputDir, 'logistics-basis.confirmed.json'),
    join(outputDir, 'commercial-terms-gate.json'),
    join(deskRoot, 'remaining-capabilities-execution-report.md'),
    join(deskRoot, 'post-completion-defect-assessment.md')
  ]) {
    assert.equal(existsSync(file), true, `missing artifact ${file}`)
  }
})
