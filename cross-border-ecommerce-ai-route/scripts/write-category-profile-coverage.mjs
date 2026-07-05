import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureDir, nowIso, projectRoot, writeJson } from './cross-border-stage-control-lib.mjs'
import { readFileSync } from 'node:fs'

const runtimeRoot = join(projectRoot, 'runtime', 'growth-sales-automation')
const deskRoot = join(runtimeRoot, 'product-decision-desk')
const rulesPath = join(deskRoot, 'product-launch-decision-rules.json')
const reportJsonPath = join(deskRoot, 'category-profile-coverage-report.json')
const reportMdPath = join(deskRoot, 'category-profile-coverage-report.md')

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

function profileStatus(profile) {
  const missingKeys = requiredProfileKeys.filter((key) => {
    const value = profile[key]
    if (Array.isArray(value)) return value.length === 0
    return value === undefined || value === null || value === ''
  })
  return {
    category_id: profile.category_id,
    label: profile.label,
    status: missingKeys.length ? 'needs_attention' : 'draft_ready',
    missing_keys: missingKeys,
    required_fact_group_count: profile.required_fact_groups?.length || 0,
    question_count: profile.category_specific_questions?.length || 0,
    sales_model_count: profile.default_sales_models?.length || 0,
    buyer_role_count: profile.common_buyer_roles?.length || 0,
    downstream_blocker_count: profile.downstream_blockers?.length || 0
  }
}

function buildMarkdown(report) {
  return [
    '# Category Profile Coverage Report',
    '',
    `Generated at: ${report.generated_at}`,
    '',
    `Profile count: ${report.profile_count}`,
    `Initial scope covered: ${report.initial_scope.covered_count}/${report.initial_scope.required_count}`,
    `Execution allowed now: ${report.execution_allowed_now}`,
    `Real external actions allowed: ${report.real_external_actions_allowed}`,
    '',
    '## Initial Scope',
    '',
    '| Category | Status |',
    '| --- | --- |',
    ...report.initial_scope.categories.map((item) => `| \`${item.category_id}\` | ${item.present ? 'present' : 'missing'} |`),
    '',
    '## Profiles',
    '',
    '| Category | Status | Questions | Buyer Roles | Missing Keys |',
    '| --- | --- | ---: | ---: | --- |',
    ...report.profiles.map((profile) => `| \`${profile.category_id}\` ${profile.label || ''} | ${profile.status} | ${profile.question_count} | ${profile.buyer_role_count} | ${profile.missing_keys.join(', ') || '-'} |`),
    '',
    '## Gate',
    '',
    `Unknown category policy: ${report.unknown_category_policy}`,
    '',
    'This report is local-preview only and does not enable external execution.'
  ].join('\n') + '\n'
}

const generatedAt = nowIso()
const rules = readJson(rulesPath)
const profiles = rules.category_profiles || []
const profileIds = new Set(profiles.map((profile) => profile.category_id))
const initialScope = requiredInitialCategories.map((categoryId) => ({
  category_id: categoryId,
  present: profileIds.has(categoryId)
}))
const profileReports = profiles.map(profileStatus)
const missingInitialCategories = initialScope.filter((item) => !item.present).map((item) => item.category_id)

const report = {
  contract: 'category_profile_coverage_report.v1',
  generated_at: generatedAt,
  source_rules_ref: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/product-launch-decision-rules.json',
  rules_generated_at: rules.generated_at,
  status: missingInitialCategories.length ? 'partial' : 'draft_ready',
  execution_allowed_now: false,
  real_external_actions_allowed: false,
  profile_count: profiles.length,
  required_profile_keys: requiredProfileKeys,
  initial_scope: {
    required_count: requiredInitialCategories.length,
    covered_count: initialScope.filter((item) => item.present).length,
    missing_categories: missingInitialCategories,
    categories: initialScope
  },
  profiles: profileReports,
  ai_first_manual_second_policy: {
    required: true,
    status: 'enforced_by_product_launch_decision_rules',
    rule: 'AI category and sales-mode suggestions must be produced before manual operator override.'
  },
  unknown_category_policy: 'HOLD or draft-only route until a matching category profile is created or the operator approves a documented fallback.',
  downstream_requirement: 'Product page, buyer profile, quote, logistics, and compliance requirements must read the matched category profile before drafting.',
  recommended_next_actions: [
    ...(missingInitialCategories.length ? ['Add missing initial category profiles.'] : []),
    'Add product-specific examples for each profile before enabling production automation.',
    'Keep real external actions disabled until source gates and operator approval pass.'
  ]
}

ensureDir(deskRoot)
writeJson(reportJsonPath, report)
writeFileSync(reportMdPath, buildMarkdown(report), 'utf8')

console.log(JSON.stringify({
  success: true,
  contract: 'category_profile_coverage_report_write_result.v1',
  category_profile_coverage_report_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/category-profile-coverage-report.json',
  category_profile_coverage_report_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/category-profile-coverage-report.md',
  profile_count: report.profile_count,
  missing_initial_categories: missingInitialCategories,
  real_external_actions_allowed: false
}, null, 2))
