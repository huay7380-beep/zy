import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './cross-border-stage-control-lib.mjs'

const deskRoot = join(projectRoot, 'runtime', 'growth-sales-automation', 'product-decision-desk')
const rulesPath = join(deskRoot, 'product-launch-decision-rules.json')
const reportPath = join(deskRoot, 'category-profile-coverage-report.json')
const requiredInitialCategories = [
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
const requiredProfileKeys = [
  'category_id',
  'label',
  'required_fact_groups',
  'category_specific_questions',
  'default_sales_models',
  'common_buyer_roles',
  'compliance_focus',
  'commercial_variables',
  'asset_requirements',
  'downstream_blockers'
]

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

const errors = []
const warnings = []

if (!existsSync(rulesPath)) errors.push(`missing rules: ${rulesPath}`)
if (!existsSync(reportPath)) errors.push(`missing category profile coverage report: ${reportPath}`)

const rules = existsSync(rulesPath) ? readJson(rulesPath) : null
const report = existsSync(reportPath) ? readJson(reportPath) : null

if (rules) {
  if (rules.contract !== 'product_launch_decision_rules.v1') errors.push('product launch decision rules contract mismatch')
  const profiles = rules.category_profiles || []
  if (profiles.length < 10) errors.push(`expected at least 10 category profiles, got ${profiles.length}`)
  const ids = new Set(profiles.map((profile) => profile.category_id))
  for (const categoryId of requiredInitialCategories) {
    if (!ids.has(categoryId)) errors.push(`missing required initial category profile: ${categoryId}`)
  }
  for (const profile of profiles) {
    for (const key of requiredProfileKeys) {
      const value = profile[key]
      if (Array.isArray(value) && value.length === 0) errors.push(`empty profile key ${profile.category_id}.${key}`)
      if (!Array.isArray(value) && (value === undefined || value === null || value === '')) errors.push(`missing profile key ${profile.category_id}.${key}`)
    }
  }
  const universalRules = (rules.universal_rules || []).join('\n')
  if (!/AI/.test(universalRules)) {
    warnings.push('AI-first policy text not detected in universal_rules')
  }
}

if (report) {
  if (report.contract !== 'category_profile_coverage_report.v1') errors.push('category profile coverage report contract mismatch')
  if (report.real_external_actions_allowed !== false) errors.push('category coverage report must block real external actions')
  if (report.execution_allowed_now !== false) errors.push('category coverage report must stay non-executable')
  if (report.initial_scope?.covered_count !== requiredInitialCategories.length) {
    errors.push(`category coverage report initial scope is incomplete: ${report.initial_scope?.covered_count}/${requiredInitialCategories.length}`)
  }
  if (!Array.isArray(report.profiles) || report.profiles.length < 10) {
    errors.push('category coverage report must list at least 10 profiles')
  }
  if (!report.unknown_category_policy || !/HOLD|draft-only/.test(report.unknown_category_policy)) {
    errors.push('category coverage report must define HOLD or draft-only unknown category policy')
  }
}

const result = {
  contract: 'category_profile_validation_report.v1',
  errors,
  warnings,
  result: errors.length ? 'fail' : 'pass'
}

console.log(JSON.stringify(result, null, 2))
if (errors.length) process.exit(1)
