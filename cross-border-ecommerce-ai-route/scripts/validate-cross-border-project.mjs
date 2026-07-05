import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const workspaceRoot = resolve(projectRoot, '..')

const requiredJson = [
  'nodes/process-manifest.json',
  'nodes/node-catalog.json',
  'schemas/commerce-node.schema.json',
  'schemas/rfq-intake.schema.json',
  'schemas/quote-draft.schema.json',
  'schemas/site-ia.schema.json',
  'schemas/growth-plan.schema.json',
  'schemas/universal-product-intake.schema.json',
  'schemas/product-auto-analysis.schema.json',
  'schemas/product-page-build-pack.schema.json',
  'schemas/stage-control-surface.schema.json',
  'schemas/growth-sales-automation-branch.schema.json',
  'schemas/build-vs-buy-decision.schema.json',
  'products/structured-cabling-catalogue-seed.json',
  'templates/structured-cabling-product-master.template.json',
  'templates/rfq-field-map.structured-cabling.template.json',
  'templates/quote-draft.structured-cabling.template.json',
  'templates/site-information-architecture.template.json',
  'templates/overseas-seo-geo-ads-plan.template.json',
  'templates/universal-product-intake.template.json',
  'templates/product-auto-analysis.template.json',
  'templates/stage-control-surface.template.json',
  'templates/growth-sales-automation-branch.template.json',
  'templates/build-vs-buy-decision.template.json',
  'runtime/control-plane/orchestration-rules-v2.json',
  'runtime/growth-sales-automation/branch-control-pack.json',
  'runtime/growth-sales-automation/ai-implementation-plan.json',
  'runtime/growth-sales-automation/product-input-framework.json',
  'runtime/growth-sales-automation/product-decision-desk/execution-plan.json',
  'runtime/growth-sales-automation/product-decision-desk/data-source-registry.json',
  'runtime/growth-sales-automation/product-decision-desk/source-channel-matrix.json',
  'runtime/growth-sales-automation/product-decision-desk/global-region-source-coverage.json',
  'runtime/growth-sales-automation/product-decision-desk/product-console-manager-audit.json',
  'runtime/growth-sales-automation/product-decision-desk/current-direction-record.json',
  'runtime/growth-sales-automation/product-decision-desk/remaining-capability-execution-plan.json',
  'runtime/growth-sales-automation/product-decision-desk/category-profile-coverage-report.json',
  'runtime/growth-sales-automation/product-decision-desk/capability-c-execution-report.json',
  'runtime/growth-sales-automation/product-decision-desk/remaining-capabilities-execution-report.json',
  'runtime/growth-sales-automation/product-decision-desk/post-completion-defect-assessment.json',
  'runtime/growth-sales-automation/product-decision-desk/latest-dashboard-save-run.json',
  'runtime/growth-sales-automation/product-decision-desk/latest-saved-product-decision.json',
  'runtime/growth-sales-automation/product-decision-desk/product-launch-decision-rules.json',
  'runtime/growth-sales-automation/product-decision-desk/inputs/structured-cabling-sample/source-file-manifest.json',
  'runtime/growth-sales-automation/product-decision-desk/outputs/structured-cabling-sample/product-visual-brief.json',
  'runtime/growth-sales-automation/product-decision-desk/outputs/structured-cabling-sample/asset-qa-report.json',
  'runtime/growth-sales-automation/product-decision-desk/outputs/structured-cabling-sample/region-source-evidence-pack.json',
  'runtime/growth-sales-automation/product-decision-desk/outputs/structured-cabling-sample/freshness-audit.json',
  'runtime/growth-sales-automation/product-decision-desk/outputs/structured-cabling-sample/source-coverage-gate.json',
  'runtime/growth-sales-automation/product-decision-desk/outputs/structured-cabling-sample/quote-input-basis.confirmed.json',
  'runtime/growth-sales-automation/product-decision-desk/outputs/structured-cabling-sample/logistics-basis.confirmed.json',
  'runtime/growth-sales-automation/product-decision-desk/outputs/structured-cabling-sample/commercial-terms-gate.json',
  'runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-trial.json',
  'runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-coverage-audit.json',
  'runtime/growth-sales-automation/execution-status-index.json',
  'runtime/growth-sales-automation/promotion-social-automation/promotion-plan.json',
  'runtime/growth-sales-automation/promotion-social-automation/channel-specialized-design.json',
  'runtime/growth-sales-automation/promotion-social-automation/auto-reply-bot-design.json',
  'runtime/growth-sales-automation/promotion-social-automation/social-connector-registry.json',
  'runtime/growth-sales-automation/promotion-social-automation/connection-status.json',
  'runtime/growth-sales-automation/promotion-social-automation/validation-report.json',
  'runtime/control-plane/status/current-status.json',
  'runtime/actual-graph-verification/verification-report.json'
]

const requiredPaths = [
  'docs/15-rfq-quote-site-implementation.md',
  'docs/16-overseas-seo-geo-ads-plan.md',
  'docs/17-brand-catalogue-visual-rebuild-plan.md',
  'docs/18-full-chain-implementation-checklist.md',
  'docs/19-universal-product-autopilot-blueprint.md',
  'docs/20-main-system-control-integration-plan.md',
  'docs/21-ai-driven-product-page-branch.md',
  'docs/22-ai-foreign-trade-flowchart-alignment.md',
  'docs/23-foreign-trade-orchestration-rules-v2.md',
  'scripts/cross-border-stage-control-lib.mjs',
  'scripts/build-stage-control-surfaces.mjs',
  'scripts/run-cross-border-stage.mjs',
  'scripts/run-product-page-branch.mjs',
  'scripts/build-growth-sales-automation-branch.mjs',
  'scripts/run-free-source-trial.mjs',
  'scripts/audit-free-source-coverage.mjs',
  'scripts/save-product-decision-preview.mjs',
  'scripts/run-product-asset-intake.mjs',
  'scripts/validate-product-assets.mjs',
  'scripts/write-category-profile-coverage.mjs',
  'scripts/validate-category-profiles.mjs',
  'scripts/run-source-gate-execution.mjs',
  'scripts/validate-source-gate-execution.mjs',
  'scripts/confirm-quote-logistics-basis.mjs',
  'scripts/validate-quote-logistics-confirmation.mjs',
  'scripts/run-dashboard-save-request.mjs',
  'scripts/validate-dashboard-save-request.mjs',
  'scripts/write-remaining-capabilities-execution-report.mjs',
  'scripts/write-promotion-social-automation-pack.mjs',
  'scripts/validate-promotion-social-automation-pack.mjs',
  'scripts/write-cross-border-status.mjs',
  'tests/product-decision-desk-c.test.mjs',
  'tests/product-decision-desk-remaining.test.mjs',
  'templates/customer-message-playbook.structured-cabling.md',
  'templates/ai-product-page-build-branch.template.json',
  'runtime/README.md',
  'runtime/rfq/README.md',
  'runtime/quotes/README.md',
  'runtime/site/README.md',
  'runtime/growth/README.md',
  'runtime/customers/README.md',
  'runtime/validations/README.md',
  'runtime/products/README.md',
  'runtime/product-automation/README.md',
  'runtime/control-plane/README.md',
  'runtime/growth-sales-automation/README.md',
  'runtime/growth-sales-automation/ai-implementation-plan.md',
  'runtime/growth-sales-automation/product-input-framework.md',
  'runtime/growth-sales-automation/product-decision-desk/README.md',
  'runtime/growth-sales-automation/product-decision-desk/execution-plan.md',
  'runtime/growth-sales-automation/product-decision-desk/source-channel-matrix.md',
  'runtime/growth-sales-automation/product-decision-desk/global-region-source-coverage.md',
  'runtime/growth-sales-automation/product-decision-desk/product-console-manager-audit.md',
  'runtime/growth-sales-automation/product-decision-desk/current-direction-record.md',
  'runtime/growth-sales-automation/product-decision-desk/remaining-capability-execution-plan.md',
  'runtime/growth-sales-automation/product-decision-desk/category-profile-coverage-report.md',
  'runtime/growth-sales-automation/product-decision-desk/capability-c-execution-report.md',
  'runtime/growth-sales-automation/product-decision-desk/remaining-capabilities-execution-report.md',
  'runtime/growth-sales-automation/product-decision-desk/post-completion-defect-assessment.md',
  'runtime/growth-sales-automation/product-decision-desk/outputs/structured-cabling-sample/asset-intake-summary.md',
  'runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-trial.md',
  'runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-coverage-audit.md',
  'runtime/growth-sales-automation/execution-status-index.md',
  'runtime/growth-sales-automation/promotion-social-automation/promotion-plan.md',
  'runtime/growth-sales-automation/promotion-social-automation/channel-specialized-design.md',
  'runtime/growth-sales-automation/promotion-social-automation/auto-reply-bot-design.md',
  'runtime/growth-sales-automation/promotion-social-automation/social-connector-registry.md',
  'runtime/growth-sales-automation/promotion-social-automation/connection-status.md',
  'runtime/growth-sales-automation/promotion-social-automation/validation-report.md',
  'runtime/growth-sales-automation/sample-runs',
  'runtime/growth-sales-automation/dashboard/index.html'
]

const errors = []
const warnings = []
const parsed = new Map()
const forbiddenRootRuntimeWin = ['D:', 'zhineng', 'runtime', 'cross-border-ecommerce'].join('\\')
const forbiddenRootRuntimePosix = ['runtime', 'cross-border-ecommerce'].join('/')

function readJson(relativePath) {
  const fullPath = join(projectRoot, relativePath)
  if (!existsSync(fullPath)) {
    errors.push(`missing json: ${relativePath}`)
    return null
  }
  try {
    const value = JSON.parse(readFileSync(fullPath, 'utf8'))
    parsed.set(relativePath, value)
    return value
  } catch (error) {
    errors.push(`invalid json: ${relativePath}: ${error.message}`)
    return null
  }
}

for (const file of requiredJson) readJson(file)

for (const requiredPath of requiredPaths) {
  if (!existsSync(join(projectRoot, requiredPath))) {
    errors.push(`missing path: ${requiredPath}`)
  }
}

const manifest = parsed.get('nodes/process-manifest.json')
if (manifest) {
  if (manifest.runtime_output_root !== 'cross-border-ecommerce-ai-route/runtime') {
    errors.push(`runtime_output_root must be cross-border-ecommerce-ai-route/runtime, got ${manifest.runtime_output_root}`)
  }

  const refs = [
    ...(manifest.docs || []),
    ...(manifest.product_data || []),
    ...(manifest.schemas || []),
    ...(manifest.templates || []),
    ...(manifest.scripts || [])
  ]
  for (const ref of refs) {
    const fullPath = join(workspaceRoot, ref)
    if (!existsSync(fullPath)) {
      errors.push(`manifest ref missing: ${ref}`)
    }
  }

  for (const stageId of manifest.canonical_flow || []) {
    const surface = readJson(`runtime/control-plane/stages/${stageId}/stage-control-surface.json`)
    if (!surface) continue
    if (surface.contract !== 'cross_border_stage_control_surface.v1') {
      errors.push(`stage control surface contract mismatch: ${stageId}`)
    }
    if (surface.stage_id !== stageId) {
      errors.push(`stage control surface stage_id mismatch: ${stageId}`)
    }
    const actions = Array.isArray(surface.actions) ? surface.actions : []
    for (const action of actions) {
      const writesTo = action?.command?.writes_to || []
      for (const target of writesTo) {
        if (typeof target !== 'string' || !target.startsWith('cross-border-ecommerce-ai-route/runtime/')) {
          errors.push(`stage action writes outside project runtime: ${stageId}/${action?.action_id || 'unknown'} -> ${target}`)
        }
      }
      if ((action.risk_level === 'high' || action.risk_level === 'critical') && !action.requires_user_confirmation) {
        errors.push(`high risk action must require confirmation: ${stageId}/${action.action_id}`)
      }
    }
    if (surface.audit?.real_execution_allowed !== false) {
      errors.push(`stage surface must block real execution by default: ${stageId}`)
    }
  }
}

const controlStatus = parsed.get('runtime/control-plane/status/current-status.json')
if (manifest && controlStatus) {
  const expectedCount = (manifest.canonical_flow || []).length
  if (controlStatus.stage_count !== expectedCount) {
    errors.push(`control status stage_count must be ${expectedCount}, got ${controlStatus.stage_count}`)
  }
}

const rootRuntimeCrossBorder = join(workspaceRoot, 'runtime', 'cross-border-ecommerce')
if (existsSync(rootRuntimeCrossBorder)) {
  errors.push(`root runtime cross-border directory must not exist: ${rootRuntimeCrossBorder}`)
}

const rfqSchema = parsed.get('schemas/rfq-intake.schema.json')
if (!rfqSchema?.properties?.request?.properties?.products) {
  errors.push('RFQ schema must define request.products')
}

const quoteSchema = parsed.get('schemas/quote-draft.schema.json')
if (!quoteSchema?.properties?.line_items || !quoteSchema?.properties?.gate) {
  errors.push('Quote schema must define line_items and gate')
}

const growthTemplate = parsed.get('templates/overseas-seo-geo-ads-plan.template.json')
if (!growthTemplate?.geo || !growthTemplate?.seo || !growthTemplate?.ads) {
  errors.push('Growth template must include seo, geo and ads blocks')
}

const universalIntakeSchema = parsed.get('schemas/universal-product-intake.schema.json')
if (!universalIntakeSchema?.properties?.product || !universalIntakeSchema?.properties?.compliance || !universalIntakeSchema?.properties?.automation_request) {
  errors.push('Universal product intake schema must define product, compliance and automation_request')
}

const autoAnalysisSchema = parsed.get('schemas/product-auto-analysis.schema.json')
if (!autoAnalysisSchema?.properties?.standard_and_market_analysis || !autoAnalysisSchema?.properties?.pricing_plan || !autoAnalysisSchema?.properties?.logistics_plan) {
  errors.push('Product auto analysis schema must define standard_and_market_analysis, pricing_plan and logistics_plan')
}

const productPageBuildPackSchema = parsed.get('schemas/product-page-build-pack.schema.json')
if (!productPageBuildPackSchema?.properties?.classification || !productPageBuildPackSchema?.properties?.visual_direction || !productPageBuildPackSchema?.properties?.rfq_and_sales_hooks) {
  errors.push('Product page build pack schema must define classification, visual_direction and rfq_and_sales_hooks')
}

const autoAnalysisTemplate = parsed.get('templates/product-auto-analysis.template.json')
if (!autoAnalysisTemplate?.standard_and_market_analysis || !autoAnalysisTemplate?.media_plan || !autoAnalysisTemplate?.product_page_plan) {
  errors.push('Product auto analysis template must include standard_and_market_analysis, media_plan and product_page_plan')
}

const productPageBranchTemplatePath = join(projectRoot, 'templates/ai-product-page-build-branch.template.json')
if (existsSync(productPageBranchTemplatePath)) {
  try {
    const productPageBranchTemplate = JSON.parse(readFileSync(productPageBranchTemplatePath, 'utf8'))
    if (productPageBranchTemplate.contract !== 'product_page_build_pack.v1') {
      errors.push('AI product page branch template must use product_page_build_pack.v1 contract')
    }
    if (!Array.isArray(productPageBranchTemplate.ai_execution_chain) || !productPageBranchTemplate.input_contract || !productPageBranchTemplate.page_strategy) {
      errors.push('AI product page branch template must include ai_execution_chain, input_contract and page_strategy')
    }
  } catch (error) {
    errors.push(`invalid json: templates/ai-product-page-build-branch.template.json: ${error.message}`)
  }
}

const stageControlSchema = parsed.get('schemas/stage-control-surface.schema.json')
if (!stageControlSchema?.properties?.state || !stageControlSchema?.properties?.actions || !stageControlSchema?.properties?.gates) {
  errors.push('Stage control surface schema must define state, actions and gates')
}

const stageControlTemplate = parsed.get('templates/stage-control-surface.template.json')
if (!stageControlTemplate?.state || !Array.isArray(stageControlTemplate?.actions) || !Array.isArray(stageControlTemplate?.gates)) {
  errors.push('Stage control surface template must include state, actions and gates')
}

const growthBranchTemplate = parsed.get('templates/growth-sales-automation-branch.template.json')
if (growthBranchTemplate) {
  if (growthBranchTemplate.contract !== 'growth_sales_automation_branch.v1') {
    errors.push('Growth sales automation branch template contract mismatch')
  }
  if (growthBranchTemplate.branch_id !== 'growth_sales_automation_branch') {
    errors.push('Growth sales automation branch template branch_id mismatch')
  }
  if (growthBranchTemplate.relationship_to_canonical_flow?.mode !== 'overlay_branch') {
    errors.push('Growth sales automation branch must be an overlay_branch')
  }
  if (growthBranchTemplate.relationship_to_canonical_flow?.preserve_canonical_flow !== true) {
    errors.push('Growth sales automation branch must preserve canonical flow')
  }
  if (growthBranchTemplate.safety_policy?.real_external_actions_allowed !== false) {
    errors.push('Growth sales automation branch must block real external actions by default')
  }
  if (growthBranchTemplate.safety_policy?.software_actions_enabled_by_default !== false) {
    errors.push('Growth sales automation branch must disable software actions by default')
  }
  for (const software of growthBranchTemplate.software_catalog || []) {
    if (software.default_state !== 'disabled') {
      errors.push(`Growth sales software must be disabled by default: ${software.software_id}`)
    }
  }
  for (const phase of growthBranchTemplate.phases || []) {
    for (const module of phase.modules || []) {
      for (const key of ['inputs', 'outputs', 'hard_boundaries', 'human_gates', 'software_refs']) {
        if (!Array.isArray(module[key]) || module[key].length === 0) {
          errors.push(`Growth sales module missing ${key}: ${module.module_id}`)
        }
      }
    }
  }
}

const orchestrationRulesV2 = parsed.get('runtime/control-plane/orchestration-rules-v2.json')
if (orchestrationRulesV2) {
  if (orchestrationRulesV2.contract !== 'foreign_trade_orchestration_rules.v2') {
    errors.push('Foreign trade orchestration rules must use foreign_trade_orchestration_rules.v2 contract')
  }
  if (orchestrationRulesV2.tool_first_policy_required !== true) {
    errors.push('Foreign trade orchestration rules must require tool-first policy')
  }
  if (orchestrationRulesV2.real_external_actions_allowed !== false || orchestrationRulesV2.external_software_enabled !== false) {
    errors.push('Foreign trade orchestration rules must block real external actions and external software by default')
  }
  if (orchestrationRulesV2.minimum_decision_contract !== 'build_vs_buy_decision.v1') {
    errors.push('Foreign trade orchestration rules must require build_vs_buy_decision.v1')
  }
}

const buildVsBuySchema = parsed.get('schemas/build-vs-buy-decision.schema.json')
if (!buildVsBuySchema?.properties?.candidate_tools || !buildVsBuySchema?.properties?.selected_path || !buildVsBuySchema?.properties?.fallback_plan) {
  errors.push('Build-vs-buy decision schema must define candidate_tools, selected_path and fallback_plan')
}

const buildVsBuyTemplate = parsed.get('templates/build-vs-buy-decision.template.json')
if (buildVsBuyTemplate) {
  if (buildVsBuyTemplate.contract !== 'build_vs_buy_decision.v1') {
    errors.push('Build-vs-buy decision template contract mismatch')
  }
  if (!Array.isArray(buildVsBuyTemplate.candidate_tools) || buildVsBuyTemplate.candidate_tools.length === 0) {
    errors.push('Build-vs-buy decision template must include candidate tools')
  }
  if (buildVsBuyTemplate.selected_path?.minimal_code_allowed !== false) {
    errors.push('Build-vs-buy decision template must block minimal code by default')
  }
}

const growthBranchPack = parsed.get('runtime/growth-sales-automation/branch-control-pack.json')
if (growthBranchPack) {
  if (growthBranchPack.contract !== 'growth_sales_automation_branch.v1') {
    errors.push('Growth sales automation branch control pack contract mismatch')
  }
  if (growthBranchPack.summary?.software_count !== (growthBranchPack.software_catalog || []).length) {
    errors.push('Growth sales automation branch control pack software_count mismatch')
  }
  if (growthBranchPack.safety_policy?.real_external_actions_allowed !== false) {
    errors.push('Growth sales automation branch control pack must block real external actions')
  }
  if (!growthBranchPack.ai_implementation_plan?.modules?.length) {
    errors.push('Growth sales automation branch control pack must include ai_implementation_plan.modules')
  }
  if (!growthBranchPack.product_decision_desk?.execution_plan_json || !growthBranchPack.product_decision_desk?.data_source_registry) {
    errors.push('Growth sales automation branch control pack must expose product decision desk refs')
  }
  if (!growthBranchPack.product_decision_desk?.direction_record_json || !growthBranchPack.product_decision_desk?.latest_saved_product_decision_json) {
    errors.push('Growth sales automation branch control pack must expose direction record and latest saved product decision refs')
  }
  if (!growthBranchPack.product_decision_desk?.remaining_capability_execution_plan_json || !growthBranchPack.product_decision_desk?.remaining_capability_execution_plan_md) {
    errors.push('Growth sales automation branch control pack must expose remaining capability execution plan refs')
  }
  if (!growthBranchPack.product_decision_desk?.category_profile_coverage_report_json || !growthBranchPack.product_decision_desk?.category_profile_coverage_report_md) {
    errors.push('Growth sales automation branch control pack must expose category profile coverage report refs')
  }
  if (!growthBranchPack.product_decision_desk?.capability_c_execution_report_json || !growthBranchPack.product_decision_desk?.capability_c_execution_report_md) {
    errors.push('Growth sales automation branch control pack must expose capability C execution report refs')
  }
  if (!growthBranchPack.promotion_social_automation?.execution_status_index_json || !growthBranchPack.promotion_social_automation?.promotion_plan_json || !growthBranchPack.promotion_social_automation?.channel_specialized_design_json) {
    errors.push('Growth sales automation branch control pack must expose promotion/social execution status, promotion plan and channel specialized design refs')
  }
  if (!growthBranchPack.promotion_social_automation?.auto_reply_bot_design_json || !growthBranchPack.promotion_social_automation?.social_connector_registry_json || !growthBranchPack.promotion_social_automation?.connection_status_json) {
    errors.push('Growth sales automation branch control pack must expose bot design, social connector registry and connection status refs')
  }
}

const growthAiPlan = parsed.get('runtime/growth-sales-automation/ai-implementation-plan.json')
if (growthAiPlan) {
  if (growthAiPlan.contract !== 'growth_sales_ai_implementation_plan.v1') {
    errors.push('Growth sales AI implementation plan contract mismatch')
  }
  if (!growthAiPlan.product_input_framework?.machine_json || !growthAiPlan.product_input_framework?.operator_markdown) {
    errors.push('Growth sales AI implementation plan must expose product input framework refs')
  }
  const modules = growthAiPlan.modules || []
  if (!modules.length) {
    errors.push('Growth sales AI implementation plan must include modules')
  }
  for (const modulePlan of modules) {
    for (const key of ['path_id', 'ai_function_description', 'input_contract', 'output_contract', 'prompt_pack', 'automation_boundary']) {
      if (!modulePlan[key]) {
        errors.push(`Growth sales AI module plan missing ${key}: ${modulePlan.module_id || modulePlan.path_id || 'unknown'}`)
      }
    }
    if (!Array.isArray(modulePlan.input_contract?.required) || !modulePlan.input_contract.required.length) {
      errors.push(`Growth sales AI module plan missing required inputs: ${modulePlan.module_id}`)
    }
    if (!Array.isArray(modulePlan.output_contract?.required) || !modulePlan.output_contract.required.length) {
      errors.push(`Growth sales AI module plan missing required outputs: ${modulePlan.module_id}`)
    }
    if (!modulePlan.prompt_pack?.system_prompt || !modulePlan.prompt_pack?.user_prompt_template || !modulePlan.prompt_pack?.qa_prompt) {
      errors.push(`Growth sales AI module plan missing prompt pack: ${modulePlan.module_id}`)
    }
    for (const artifactPath of [modulePlan.artifacts?.json, modulePlan.artifacts?.md].filter(Boolean)) {
      if (!existsSync(join(workspaceRoot, artifactPath))) {
        errors.push(`Growth sales AI module artifact missing: ${artifactPath}`)
      }
    }
    if ((modulePlan.automation_boundary?.blocked_by_default || []).length === 0) {
      errors.push(`Growth sales AI module plan must list blocked default actions: ${modulePlan.module_id}`)
    }
    if (!Array.isArray(modulePlan.validation_standards) || modulePlan.validation_standards.length < 4) {
      errors.push(`Growth sales AI module plan must include validation standards: ${modulePlan.module_id}`)
    }
    if (!modulePlan.trial_execution?.sample_result_json || !modulePlan.trial_execution?.sample_result_md) {
      errors.push(`Growth sales AI module plan must expose trial result refs: ${modulePlan.module_id}`)
    }
    if (!modulePlan.sample_trial_result?.validation) {
      errors.push(`Growth sales AI module plan must include sample trial result: ${modulePlan.module_id}`)
    }
    for (const trialPath of [modulePlan.trial_execution?.sample_result_json, modulePlan.trial_execution?.sample_result_md].filter(Boolean)) {
      if (!existsSync(join(workspaceRoot, trialPath))) {
        errors.push(`Growth sales AI trial artifact missing: ${trialPath}`)
      }
    }
  }
}

const growthProductInput = parsed.get('runtime/growth-sales-automation/product-input-framework.json')
if (growthProductInput) {
  if (growthProductInput.contract !== 'growth_sales_product_input_framework.v1') {
    errors.push('Growth sales product input framework contract mismatch')
  }
  if (!Array.isArray(growthProductInput.intake_sections) || growthProductInput.intake_sections.length < 5) {
    errors.push('Growth sales product input framework must define detailed intake sections')
  }
  if (!Array.isArray(growthProductInput.scoring_dimensions) || growthProductInput.scoring_dimensions.length < 5) {
    errors.push('Growth sales product input framework must define product scoring dimensions')
  }
  const businessModelSection = (growthProductInput.intake_sections || []).find((section) => section.section_id === 'business_model')
  if (!businessModelSection?.manual_preselection_forbidden || !(businessModelSection.required || []).includes('ai_sales_mode_suggestions')) {
    errors.push('Growth sales product input framework must treat product category/sales mode as AI suggestions before human override')
  }
  const minimumTradeFieldIds = new Set((growthProductInput.minimum_foreign_trade_fields || []).map((item) => item.field_id))
  for (const fieldId of ['hs_code_candidates', 'target_country_candidates', 'incoterms_currency_payment_terms', 'packing_weight_volume', 'claim_whitelist_blacklist']) {
    if (!minimumTradeFieldIds.has(fieldId)) {
      errors.push(`Growth sales product input framework missing minimum foreign trade field: ${fieldId}`)
    }
  }
}

const productDecisionPlan = parsed.get('runtime/growth-sales-automation/product-decision-desk/execution-plan.json')
if (productDecisionPlan) {
  if (productDecisionPlan.contract !== 'product_decision_desk_execution_plan.v1') {
    errors.push('Product decision desk execution plan contract mismatch')
  }
  if (!productDecisionPlan.implementation_policy?.reuse_existing_overlap_first) {
    errors.push('Product decision desk must prefer existing overlap locations before creating new files')
  }
  if (productDecisionPlan.implementation_policy?.real_external_actions_allowed !== false) {
    errors.push('Product decision desk must block real external actions by default')
  }
  if (!productDecisionPlan.storage_map?.current_product_input_framework || !productDecisionPlan.storage_map?.future_decision_outputs) {
    errors.push('Product decision desk storage map must expose current input framework and future decision outputs')
  }
  if (!Array.isArray(productDecisionPlan.output_contracts) || productDecisionPlan.output_contracts.length < 3) {
    errors.push('Product decision desk must define downstream output contracts')
  }
  if ((productDecisionPlan.search_quality_policy?.minimum_global_regions_for_global_claim || []).length < 8) {
    errors.push('Product decision desk search policy must define eight global coverage regions')
  }
}

const productDecisionSources = parsed.get('runtime/growth-sales-automation/product-decision-desk/data-source-registry.json')
if (productDecisionSources) {
  if (productDecisionSources.contract !== 'product_decision_desk_data_source_registry.v1') {
    errors.push('Product decision desk data source registry contract mismatch')
  }
  if (productDecisionSources.default_policy?.enabled_by_default !== false || productDecisionSources.default_policy?.real_external_action_allowed !== false) {
    errors.push('Product decision desk data sources must be disabled by default')
  }
  if (!Array.isArray(productDecisionSources.coverage_regions) || productDecisionSources.coverage_regions.length < 8) {
    errors.push('Product decision desk data source registry must define global coverage regions')
  }
  if (!Array.isArray(productDecisionSources.connectors) || productDecisionSources.connectors.length < 8) {
    errors.push('Product decision desk data source registry must list planned connectors')
  }
  for (const connector of productDecisionSources.connectors || []) {
    if (connector.enabled === true && connector.connector_id !== 'user_factory_source_collection') {
      errors.push(`External product decision source must not be enabled by default: ${connector.connector_id}`)
    }
    for (const key of ['connector_id', 'label', 'source_class', 'official_url', 'install_status', 'freshness_rule', 'coverage_rule']) {
      if (!connector[key]) {
        errors.push(`Product decision data source missing ${key}: ${connector.connector_id || 'unknown'}`)
      }
    }
  }
}

const productDecisionSourceMatrix = parsed.get('runtime/growth-sales-automation/product-decision-desk/source-channel-matrix.json')
if (productDecisionSourceMatrix) {
  if (productDecisionSourceMatrix.contract !== 'product_decision_desk_source_channel_matrix.v1') {
    errors.push('Product decision desk source channel matrix contract mismatch')
  }
  if (!Array.isArray(productDecisionSourceMatrix.global_coverage_regions) || productDecisionSourceMatrix.global_coverage_regions.length < 8) {
    errors.push('Product decision desk source channel matrix must define eight global coverage regions')
  }
  if (!Array.isArray(productDecisionSourceMatrix.source_channels) || productDecisionSourceMatrix.source_channels.length < 8) {
    errors.push('Product decision desk source channel matrix must list source channels')
  }
  if (!productDecisionSourceMatrix.web_search_fallback_policy?.required_output_fields?.length) {
    errors.push('Product decision desk source channel matrix must define web search fallback output fields')
  }
  if (!Array.isArray(productDecisionSourceMatrix.anti_redundancy_rules) || !productDecisionSourceMatrix.anti_redundancy_rules.length) {
    errors.push('Product decision desk source channel matrix must define anti-redundancy rules')
  }
  if (!(productDecisionSourceMatrix.source_channels || []).some((source) => source.source_id === 'global_region_public_tariff_source_pack')) {
    errors.push('Product decision desk source channel matrix must include global region public tariff source pack')
  }
}

const productDecisionGlobalRegionCoverage = parsed.get('runtime/growth-sales-automation/product-decision-desk/global-region-source-coverage.json')
if (productDecisionGlobalRegionCoverage) {
  if (productDecisionGlobalRegionCoverage.contract !== 'product_decision_desk_global_region_source_coverage.v1') {
    errors.push('Product decision desk global region source coverage contract mismatch')
  }
  if (!Array.isArray(productDecisionGlobalRegionCoverage.major_regions) || productDecisionGlobalRegionCoverage.major_regions.length < 8) {
    errors.push('Product decision desk global region source coverage must define eight major regions')
  }
  if (!Array.isArray(productDecisionGlobalRegionCoverage.region_coverage_targets) || productDecisionGlobalRegionCoverage.region_coverage_targets.length < 8) {
    errors.push('Product decision desk global region source coverage must define region coverage targets')
  }
  if (!Array.isArray(productDecisionGlobalRegionCoverage.first_pass_signal_requirements) || productDecisionGlobalRegionCoverage.first_pass_signal_requirements.length < 4) {
    errors.push('Product decision desk global region source coverage must define first-pass signal requirements')
  }
  if (productDecisionGlobalRegionCoverage.coverage_position?.enough_for_complete_regional_market_feedback !== false) {
    errors.push('Product decision desk global region coverage must not claim complete regional market feedback')
  }
  if (productDecisionGlobalRegionCoverage.execution_rules?.real_external_actions_allowed !== false) {
    errors.push('Product decision desk global region coverage must block real external actions')
  }
}

const productDecisionFreeSourceTrial = parsed.get('runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-trial.json')
if (productDecisionFreeSourceTrial) {
  if (productDecisionFreeSourceTrial.contract !== 'product_decision_desk_free_source_trial.v1') {
    errors.push('Product decision desk free source trial contract mismatch')
  }
  if (productDecisionFreeSourceTrial.real_external_actions_executed !== false) {
    errors.push('Product decision desk free source trial must not execute real external actions')
  }
  if (!Array.isArray(productDecisionFreeSourceTrial.source_runs) || productDecisionFreeSourceTrial.source_runs.length < 3) {
    errors.push('Product decision desk free source trial must include at least three source runs')
  }
  for (const sourceRun of productDecisionFreeSourceTrial.source_runs || []) {
    for (const key of ['connector_id', 'status', 'accessed_at', 'freshness_window', 'coverage_scope', 'limitations']) {
      if (!sourceRun[key]) {
        errors.push(`Product decision free source trial missing ${key}: ${sourceRun.connector_id || 'unknown'}`)
      }
    }
  }
}

const productDecisionFreeSourceCoverageAudit = parsed.get('runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-coverage-audit.json')
if (productDecisionFreeSourceCoverageAudit) {
  if (productDecisionFreeSourceCoverageAudit.contract !== 'product_decision_desk_free_source_coverage_audit.v1') {
    errors.push('Product decision desk free source coverage audit contract mismatch')
  }
  if (productDecisionFreeSourceCoverageAudit.real_external_actions_executed !== false) {
    errors.push('Product decision desk free source coverage audit must not execute real external actions')
  }
  if (productDecisionFreeSourceCoverageAudit.summary?.major_region_count < 8) {
    errors.push('Product decision desk free source coverage audit must cover eight major regions')
  }
  if (productDecisionFreeSourceCoverageAudit.summary?.global_market_feedback_claim_allowed !== false) {
    errors.push('Product decision desk free source coverage audit must block complete global market feedback claim')
  }
  if (!Array.isArray(productDecisionFreeSourceCoverageAudit.region_coverage_audit) || productDecisionFreeSourceCoverageAudit.region_coverage_audit.length < 8) {
    errors.push('Product decision desk free source coverage audit must include region coverage audit rows')
  }
}

const productConsoleManagerAudit = parsed.get('runtime/growth-sales-automation/product-decision-desk/product-console-manager-audit.json')
if (productConsoleManagerAudit) {
  if (productConsoleManagerAudit.contract !== 'product_console_foreign_trade_manager_audit.v1') {
    errors.push('Product console manager audit contract mismatch')
  }
  if (!Array.isArray(productConsoleManagerAudit.findings) || productConsoleManagerAudit.findings.length < 5) {
    errors.push('Product console manager audit must include detailed findings')
  }
  if (!productConsoleManagerAudit.overall_decision?.status) {
    errors.push('Product console manager audit must include overall decision')
  }
  if (!Array.isArray(productConsoleManagerAudit.acceptance_requirements_for_next_pass) || !productConsoleManagerAudit.acceptance_requirements_for_next_pass.length) {
    errors.push('Product console manager audit must include next-pass acceptance requirements')
  }
}

const productDecisionDirectionRecord = parsed.get('runtime/growth-sales-automation/product-decision-desk/current-direction-record.json')
if (productDecisionDirectionRecord) {
  if (productDecisionDirectionRecord.contract !== 'product_decision_desk_current_direction_record.v1') {
    errors.push('Product decision desk direction record contract mismatch')
  }
  const hasLegacyClosureGaps = Array.isArray(productDecisionDirectionRecord.three_gaps_to_close_now) && productDecisionDirectionRecord.three_gaps_to_close_now.length === 3
  const hasPostSaveClosureState = Array.isArray(productDecisionDirectionRecord.closed_gaps)
    && productDecisionDirectionRecord.closed_gaps.some((gap) => gap.gap_id === 'gap_01_persistent_product_decision_outputs')
    && Array.isArray(productDecisionDirectionRecord.remaining_capability_gaps_after_save)
    && productDecisionDirectionRecord.remaining_capability_gaps_after_save.length >= 5
  if (!hasLegacyClosureGaps && !hasPostSaveClosureState) {
    errors.push('Product decision desk direction record must define legacy closure gaps or post-save closed/remaining capability gaps')
  }
  if (productDecisionDirectionRecord.deferred_product_page_rebuild_policy?.belongs_to_stage !== 'cbx_05_content_assets') {
    errors.push('Product page rebuild policy must be deferred to cbx_05_content_assets')
  }
  if (!Array.isArray(productDecisionDirectionRecord.anti_drift_rules) || productDecisionDirectionRecord.anti_drift_rules.length < 3) {
    errors.push('Product decision desk direction record must include anti-drift rules')
  }
}

const productDecisionRemainingCapabilityPlan = parsed.get('runtime/growth-sales-automation/product-decision-desk/remaining-capability-execution-plan.json')
if (productDecisionRemainingCapabilityPlan) {
  if (productDecisionRemainingCapabilityPlan.contract !== 'product_decision_remaining_capability_execution_plan.v1') {
    errors.push('Product decision remaining capability execution plan contract mismatch')
  }
  const hasPendingPlanState = productDecisionRemainingCapabilityPlan.pending_user_confirmation === true
  const hasCapabilityCExecutedState = productDecisionRemainingCapabilityPlan.pending_user_confirmation === false
    && productDecisionRemainingCapabilityPlan.confirmed_execution?.confirmed_option === 'execute_phase_1_and_2'
    && productDecisionRemainingCapabilityPlan.confirmed_execution?.status === 'implemented_local_preview_verified'
  const hasAllClosureExecutedState = productDecisionRemainingCapabilityPlan.pending_user_confirmation === false
    && productDecisionRemainingCapabilityPlan.status === 'all_capability_closures_local_preview_verified'
    && productDecisionRemainingCapabilityPlan.confirmed_execution?.remaining_execution_status === 'implemented_local_preview_verified'
  if ((!hasPendingPlanState && !hasCapabilityCExecutedState && !hasAllClosureExecutedState) || productDecisionRemainingCapabilityPlan.execution_allowed_now !== false) {
    errors.push('Product decision remaining capability execution plan must be pending, record capability C execution, or record all local-preview closures, and stay non-executable')
  }
  if (productDecisionRemainingCapabilityPlan.real_external_actions_allowed !== false) {
    errors.push('Product decision remaining capability execution plan must block real external actions')
  }
  const capabilityIds = new Set((productDecisionRemainingCapabilityPlan.capabilities || []).map((item) => item.capability_id))
  for (const capabilityId of [
    'asset_intake_pipeline',
    'category_profile_expansion',
    'source_gate_execution',
    'quote_and_logistics_confirmation',
    'script_backed_dashboard_save'
  ]) {
    if (!capabilityIds.has(capabilityId)) {
      errors.push(`Product decision remaining capability execution plan missing capability: ${capabilityId}`)
    }
  }
  if (!Array.isArray(productDecisionRemainingCapabilityPlan.integrated_test_flow) || productDecisionRemainingCapabilityPlan.integrated_test_flow.length < 4) {
    errors.push('Product decision remaining capability execution plan must include integrated test flow')
  }
  if (!Array.isArray(productDecisionRemainingCapabilityPlan.operator_confirmation_options) || productDecisionRemainingCapabilityPlan.operator_confirmation_options.length < 3) {
    errors.push('Product decision remaining capability execution plan must include operator confirmation options')
  }
}

const productLaunchDecisionRules = parsed.get('runtime/growth-sales-automation/product-decision-desk/product-launch-decision-rules.json')
if (productLaunchDecisionRules) {
  if (productLaunchDecisionRules.contract !== 'product_launch_decision_rules.v1') {
    errors.push('Product launch decision rules contract mismatch')
  }
  const verdicts = new Set((productLaunchDecisionRules.decision_verdicts || []).map((item) => item.verdict))
  for (const verdict of ['GO', 'CONDITIONAL', 'HOLD', 'BLOCKED']) {
    if (!verdicts.has(verdict)) {
      errors.push(`Product launch decision rules missing verdict: ${verdict}`)
    }
  }
  if (!Array.isArray(productLaunchDecisionRules.category_profiles) || productLaunchDecisionRules.category_profiles.length < 10) {
    errors.push('Product launch decision rules must include at least 10 category profiles')
  }
  const categoryProfileIds = new Set((productLaunchDecisionRules.category_profiles || []).map((profile) => profile.category_id))
  for (const categoryId of [
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
  ]) {
    if (!categoryProfileIds.has(categoryId)) {
      errors.push(`Product launch decision rules missing required category profile: ${categoryId}`)
    }
  }
  if (!Array.isArray(productLaunchDecisionRules.downstream_output_contracts) || productLaunchDecisionRules.downstream_output_contracts.length < 5) {
    errors.push('Product launch decision rules must define downstream output contracts')
  }
  if (!Array.isArray(productLaunchDecisionRules.universal_rules) || productLaunchDecisionRules.universal_rules.length < 5) {
    errors.push('Product launch decision rules must define universal hard rules')
  }
}

const categoryProfileCoverageReport = parsed.get('runtime/growth-sales-automation/product-decision-desk/category-profile-coverage-report.json')
if (categoryProfileCoverageReport) {
  if (categoryProfileCoverageReport.contract !== 'category_profile_coverage_report.v1') {
    errors.push('Category profile coverage report contract mismatch')
  }
  if (categoryProfileCoverageReport.real_external_actions_allowed !== false || categoryProfileCoverageReport.execution_allowed_now !== false) {
    errors.push('Category profile coverage report must remain non-executable with real external actions blocked')
  }
  if ((categoryProfileCoverageReport.initial_scope?.covered_count || 0) < 10) {
    errors.push('Category profile coverage report must cover all 10 initial categories')
  }
}

const capabilityCExecutionReport = parsed.get('runtime/growth-sales-automation/product-decision-desk/capability-c-execution-report.json')
if (capabilityCExecutionReport) {
  if (capabilityCExecutionReport.contract !== 'product_decision_capability_c_execution_report.v1') {
    errors.push('Capability C execution report contract mismatch')
  }
  if (capabilityCExecutionReport.status !== 'implemented_local_preview_verified') {
    errors.push('Capability C execution report must be implemented_local_preview_verified')
  }
  if (capabilityCExecutionReport.real_external_actions_executed !== false) {
    errors.push('Capability C execution report must record no real external actions')
  }
  const implemented = new Set((capabilityCExecutionReport.implemented_capabilities || []).map((item) => item.capability_id))
  for (const capabilityId of ['asset_intake_pipeline', 'category_profile_expansion']) {
    if (!implemented.has(capabilityId)) {
      errors.push(`Capability C execution report missing implemented capability: ${capabilityId}`)
    }
  }
}

const remainingCapabilitiesExecutionReport = parsed.get('runtime/growth-sales-automation/product-decision-desk/remaining-capabilities-execution-report.json')
if (remainingCapabilitiesExecutionReport) {
  if (remainingCapabilitiesExecutionReport.contract !== 'product_decision_remaining_capabilities_execution_report.v1') {
    errors.push('Remaining capabilities execution report contract mismatch')
  }
  if (remainingCapabilitiesExecutionReport.status !== 'implemented_local_preview_verified') {
    errors.push('Remaining capabilities execution report must be implemented_local_preview_verified')
  }
  if (remainingCapabilitiesExecutionReport.real_external_actions_executed !== false) {
    errors.push('Remaining capabilities execution report must record no real external actions')
  }
  const implemented = new Set((remainingCapabilitiesExecutionReport.implemented_capabilities || []).map((item) => item.capability_id))
  for (const capabilityId of ['source_gate_execution', 'quote_and_logistics_confirmation', 'script_backed_dashboard_save']) {
    if (!implemented.has(capabilityId)) {
      errors.push(`Remaining capabilities execution report missing implemented capability: ${capabilityId}`)
    }
  }
  const boundary = remainingCapabilitiesExecutionReport.operator_boundary_after_execution || {}
  if (boundary.market_ranking_allowed !== false || boundary.acquisition_allowed !== false) {
    errors.push('Remaining capabilities report must keep market ranking and acquisition blocked in current local-preview state')
  }
  if (boundary.quote_send_allowed !== false || boundary.shipment_booking_allowed !== false) {
    errors.push('Remaining capabilities report must keep quote send and shipment booking blocked')
  }
  if (boundary.dashboard_direct_write_allowed !== false) {
    errors.push('Remaining capabilities report must keep dashboard direct write blocked')
  }
}

const postCompletionDefectAssessment = parsed.get('runtime/growth-sales-automation/product-decision-desk/post-completion-defect-assessment.json')
if (postCompletionDefectAssessment) {
  if (postCompletionDefectAssessment.contract !== 'product_decision_post_completion_defect_assessment.v1') {
    errors.push('Post-completion defect assessment contract mismatch')
  }
  if (!Array.isArray(postCompletionDefectAssessment.defects) || postCompletionDefectAssessment.defects.length < 5) {
    errors.push('Post-completion defect assessment must list at least five known gaps')
  }
  if (!Array.isArray(postCompletionDefectAssessment.recommended_next_plan) || postCompletionDefectAssessment.recommended_next_plan.length < 4) {
    errors.push('Post-completion defect assessment must include recommended next plan')
  }
}

const latestSavedProductDecision = parsed.get('runtime/growth-sales-automation/product-decision-desk/latest-saved-product-decision.json')
if (latestSavedProductDecision) {
  if (latestSavedProductDecision.contract !== 'product_decision_desk_saved_product_decision_manifest.v1') {
    errors.push('Latest saved product decision manifest contract mismatch')
  }
  if (latestSavedProductDecision.real_external_actions_executed !== false) {
    errors.push('Latest saved product decision must not execute real external actions')
  }
  if (!latestSavedProductDecision.product_id || !latestSavedProductDecision.latest_input_ref || !latestSavedProductDecision.output_refs?.decision_pack) {
    errors.push('Latest saved product decision must expose product id, input ref and output refs')
  }
  if (!latestSavedProductDecision.source_gate || latestSavedProductDecision.source_gate.market_ranking_allowed !== false) {
    errors.push('Latest saved product decision must expose a blocking source coverage gate for the current trial state')
  }
  if (!latestSavedProductDecision.launch_readiness_verdict || !['GO', 'CONDITIONAL', 'HOLD', 'BLOCKED'].includes(latestSavedProductDecision.launch_readiness_verdict.verdict)) {
    errors.push('Latest saved product decision must expose a launch readiness verdict')
  }
  for (const requiredOutput of [
    'decision_pack',
    'market_search_pack',
    'downstream_route_pack',
    'category_profile_match',
    'product_page_requirement',
    'buyer_profile_pack',
    'quote_input_basis',
    'logistics_basis',
    'compliance_review_pack',
    'launch_readiness_verdict',
    'capability_gap_report',
    'source_file_manifest',
    'product_visual_brief',
    'asset_qa_report',
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
    'post_completion_defect_assessment',
    'dialogue_state',
    'operator_markdown'
  ]) {
    if (!latestSavedProductDecision.output_refs?.[requiredOutput]) {
      errors.push(`Latest saved product decision missing output ref: ${requiredOutput}`)
    }
  }
  for (const artifactPath of [
    latestSavedProductDecision.latest_input_ref,
    ...Object.values(latestSavedProductDecision.output_refs || {})
  ].filter(Boolean)) {
    if (!existsSync(join(workspaceRoot, artifactPath))) {
      errors.push(`Latest saved product decision artifact missing: ${artifactPath}`)
    }
  }
  const decisionPackPath = latestSavedProductDecision.output_refs?.decision_pack
  if (decisionPackPath && existsSync(join(workspaceRoot, decisionPackPath))) {
    const decisionPack = JSON.parse(readFileSync(join(workspaceRoot, decisionPackPath), 'utf8'))
    if (decisionPack.contract !== 'product_decision_pack.v1') {
      errors.push('Latest decision pack contract mismatch')
    }
    if (!decisionPack.complete_package_refs?.quote_input_basis || !decisionPack.complete_package_refs?.compliance_review_pack) {
      errors.push('Latest decision pack must expose complete package refs for downstream modules')
    }
  }
}

const productAssetManifest = parsed.get('runtime/growth-sales-automation/product-decision-desk/inputs/structured-cabling-sample/source-file-manifest.json')
if (productAssetManifest) {
  if (productAssetManifest.contract !== 'source_file_manifest.v1') {
    errors.push('Structured cabling source file manifest contract mismatch')
  }
  if (productAssetManifest.real_external_actions_executed !== false) {
    errors.push('Structured cabling source file manifest must record no real external actions')
  }
  const sourceRefs = (productAssetManifest.files || []).map((file) => file.source_ref)
  for (const requiredName of ['2024 NEW PRODUCT CATALOGUE.pdf', 'ELECTRONIC CATALOGUE.pdf']) {
    if (!sourceRefs.some((sourceRef) => sourceRef.endsWith(requiredName))) {
      errors.push(`Structured cabling asset manifest missing main product file: ${requiredName}`)
    }
  }
}

const productVisualBrief = parsed.get('runtime/growth-sales-automation/product-decision-desk/outputs/structured-cabling-sample/product-visual-brief.json')
if (productVisualBrief) {
  if (productVisualBrief.contract !== 'product_visual_brief.v1') {
    errors.push('Structured cabling product visual brief contract mismatch')
  }
  if (productVisualBrief.real_external_actions_executed !== false) {
    errors.push('Structured cabling product visual brief must record no real external actions')
  }
}

const assetQaReport = parsed.get('runtime/growth-sales-automation/product-decision-desk/outputs/structured-cabling-sample/asset-qa-report.json')
if (assetQaReport) {
  if (assetQaReport.contract !== 'asset_qa_report.v1') {
    errors.push('Structured cabling asset QA report contract mismatch')
  }
  if (assetQaReport.publish_visual_allowed !== false) {
    errors.push('Structured cabling asset QA must keep publish_visual_allowed=false')
  }
  if (typeof assetQaReport.page_draft_allowed !== 'boolean') {
    errors.push('Structured cabling asset QA must define page_draft_allowed')
  }
}

const sourceCoverageGate = parsed.get('runtime/growth-sales-automation/product-decision-desk/outputs/structured-cabling-sample/source-coverage-gate.json')
if (sourceCoverageGate) {
  if (sourceCoverageGate.contract !== 'source_coverage_gate.v1') {
    errors.push('Structured cabling source coverage gate contract mismatch')
  }
  if (sourceCoverageGate.real_external_actions_executed !== false) {
    errors.push('Structured cabling source coverage gate must record no real external actions')
  }
  if (sourceCoverageGate.major_region_count < 8) {
    errors.push('Structured cabling source coverage gate must cover eight major regions')
  }
  if (sourceCoverageGate.market_ranking_allowed !== false || sourceCoverageGate.acquisition_allowed !== false) {
    errors.push('Structured cabling source coverage gate must keep market ranking and acquisition blocked')
  }
}

const regionSourceEvidencePack = parsed.get('runtime/growth-sales-automation/product-decision-desk/outputs/structured-cabling-sample/region-source-evidence-pack.json')
if (regionSourceEvidencePack) {
  if (regionSourceEvidencePack.contract !== 'region_source_evidence_pack.v1') {
    errors.push('Structured cabling region source evidence pack contract mismatch')
  }
  if (regionSourceEvidencePack.real_external_actions_executed !== false) {
    errors.push('Structured cabling region source evidence pack must record no real external actions')
  }
  if (!Array.isArray(regionSourceEvidencePack.regions) || regionSourceEvidencePack.regions.length < 8) {
    errors.push('Structured cabling region source evidence pack must include all major regions')
  }
}

const freshnessAudit = parsed.get('runtime/growth-sales-automation/product-decision-desk/outputs/structured-cabling-sample/freshness-audit.json')
if (freshnessAudit) {
  if (freshnessAudit.contract !== 'freshness_audit.v1') {
    errors.push('Structured cabling freshness audit contract mismatch')
  }
  if (freshnessAudit.real_external_actions_executed !== false) {
    errors.push('Structured cabling freshness audit must record no real external actions')
  }
  if (!Array.isArray(freshnessAudit.source_results) || freshnessAudit.source_results.length < 4) {
    errors.push('Structured cabling freshness audit must include source results')
  }
}

const commercialTermsGate = parsed.get('runtime/growth-sales-automation/product-decision-desk/outputs/structured-cabling-sample/commercial-terms-gate.json')
if (commercialTermsGate) {
  if (commercialTermsGate.contract !== 'commercial_terms_gate.v1') {
    errors.push('Structured cabling commercial terms gate contract mismatch')
  }
  if (commercialTermsGate.real_external_actions_executed !== false) {
    errors.push('Structured cabling commercial terms gate must record no real external actions')
  }
  if (commercialTermsGate.quote_send_allowed !== false || commercialTermsGate.shipment_booking_allowed !== false) {
    errors.push('Structured cabling commercial terms gate must keep quote send and shipment booking blocked')
  }
}

const latestDashboardSaveRun = parsed.get('runtime/growth-sales-automation/product-decision-desk/latest-dashboard-save-run.json')
if (latestDashboardSaveRun) {
  if (latestDashboardSaveRun.contract !== 'controlled_dashboard_save_latest_run.v1') {
    errors.push('Latest dashboard save run contract mismatch')
  }
  if (latestDashboardSaveRun.real_external_actions_executed !== false || latestDashboardSaveRun.dashboard_direct_write_allowed !== false) {
    errors.push('Latest dashboard save run must record no real external actions and no direct dashboard write')
  }
}

const growthExecutionStatusIndex = parsed.get('runtime/growth-sales-automation/execution-status-index.json')
if (growthExecutionStatusIndex) {
  if (growthExecutionStatusIndex.contract !== 'growth_sales_execution_status_index.v1') {
    errors.push('Growth execution status index contract mismatch')
  }
  const artifactIds = new Set((growthExecutionStatusIndex.completed_local_preview_artifacts || []).map((artifact) => artifact.artifact_id))
  for (const artifactId of ['promotion_plan', 'promotion_channel_specialized_design', 'auto_reply_bot_design', 'social_connector_registry', 'social_connection_status']) {
    if (!artifactIds.has(artifactId)) {
      errors.push(`Growth execution status index missing artifact: ${artifactId}`)
    }
  }
}

const promotionPlan = parsed.get('runtime/growth-sales-automation/promotion-social-automation/promotion-plan.json')
if (promotionPlan) {
  if (promotionPlan.contract !== 'promotion_campaign_plan.v1') {
    errors.push('Promotion plan contract mismatch')
  }
  if (promotionPlan.real_external_actions_executed !== false) {
    errors.push('Promotion plan must record no real external actions')
  }
  if (promotionPlan.current_gates?.ad_spend_allowed !== false || promotionPlan.current_gates?.real_message_send_allowed !== false) {
    errors.push('Promotion plan must block ad spend and real message sending')
  }
  const channels = new Set((promotionPlan.channel_plan || []).map((channel) => channel.channel_id))
  for (const channelId of ['seo_content_cluster', 'google_search_ads', 'linkedin_b2b_outreach', 'whatsapp_high_intent_followup', 'tiktok_short_video']) {
    if (!channels.has(channelId)) {
      errors.push(`Promotion plan missing channel: ${channelId}`)
    }
  }
}

const channelSpecializedDesign = parsed.get('runtime/growth-sales-automation/promotion-social-automation/channel-specialized-design.json')
if (channelSpecializedDesign) {
  if (channelSpecializedDesign.contract !== 'promotion_channel_specialized_design.v1') {
    errors.push('Promotion channel specialized design contract mismatch')
  }
  if (channelSpecializedDesign.real_external_actions_executed !== false) {
    errors.push('Promotion channel specialized design must record no real external actions')
  }
  if (!Array.isArray(channelSpecializedDesign.channel_blueprints) || channelSpecializedDesign.channel_blueprints.length < 8) {
    errors.push('Promotion channel specialized design must include at least eight channel blueprints')
  }
  const channelIds = new Set((channelSpecializedDesign.channel_blueprints || []).map((channel) => channel.channel_id))
  for (const channelId of ['seo_content_cluster', 'google_search_ads', 'linkedin_abm_and_lead_forms', 'b2b_marketplaces_and_directories', 'tiktok_short_video', 'whatsapp_opt_in_followup', 'email_nurture_and_quote_followup', 'retargeting_pixels_and_remarketing']) {
    if (!channelIds.has(channelId)) {
      errors.push(`Promotion channel specialized design missing channel: ${channelId}`)
    }
  }
  const blocked = new Set(channelSpecializedDesign.automation_boundaries?.blocked_until_manual_enablement || [])
  for (const boundary of ['publish content externally', 'send customer messages', 'activate ad campaigns', 'install tracking pixels', 'spend budget']) {
    if (!blocked.has(boundary)) {
      errors.push(`Promotion channel specialized design missing blocked boundary: ${boundary}`)
    }
  }
}

const autoReplyBotDesign = parsed.get('runtime/growth-sales-automation/promotion-social-automation/auto-reply-bot-design.json')
if (autoReplyBotDesign) {
  if (autoReplyBotDesign.contract !== 'auto_reply_bot_design.v1') {
    errors.push('Auto reply bot design contract mismatch')
  }
  if (autoReplyBotDesign.real_external_actions_executed !== false) {
    errors.push('Auto reply bot design must record no real external actions')
  }
  const outputContracts = new Set(autoReplyBotDesign.output_contracts || [])
  for (const contract of ['inquiry_intake.v1', 'reply_draft.v1', 'lead_score.v1', 'missing_field_request.v1', 'human_handoff_packet.v1']) {
    if (!outputContracts.has(contract)) {
      errors.push(`Auto reply bot design missing output contract: ${contract}`)
    }
  }
  const blocked = new Set(autoReplyBotDesign.bot_scope?.blocked || [])
  if (!blocked.has('unapproved outbound messages') || !blocked.has('final quote send')) {
    errors.push('Auto reply bot design must block unapproved outbound messages and final quote send')
  }
}

const socialConnectorRegistry = parsed.get('runtime/growth-sales-automation/promotion-social-automation/social-connector-registry.json')
if (socialConnectorRegistry) {
  if (socialConnectorRegistry.contract !== 'social_media_connector_registry.v1') {
    errors.push('Social connector registry contract mismatch')
  }
  if (socialConnectorRegistry.real_external_actions_executed !== false) {
    errors.push('Social connector registry must record no real external actions')
  }
  const connectorIds = new Set((socialConnectorRegistry.connectors || []).map((connector) => connector.connector_id))
  for (const connectorId of ['whatsapp_cloud_api', 'tiktok_marketing_api', 'tiktok_content_posting_api', 'tiktok_inbox_or_dm']) {
    if (!connectorIds.has(connectorId)) {
      errors.push(`Social connector registry missing connector: ${connectorId}`)
    }
  }
  for (const connector of socialConnectorRegistry.connectors || []) {
    if (!['disabled', 'blocked'].includes(connector.default_state)) {
      errors.push(`Social connector default state must be disabled or blocked: ${connector.connector_id}`)
    }
    if (connector.real_send_allowed !== false) {
      errors.push(`Social connector must block real sending: ${connector.connector_id}`)
    }
  }
}

const socialConnectionStatus = parsed.get('runtime/growth-sales-automation/promotion-social-automation/connection-status.json')
if (socialConnectionStatus) {
  if (socialConnectionStatus.contract !== 'social_connection_status.v1') {
    errors.push('Social connection status contract mismatch')
  }
  if (socialConnectionStatus.real_external_actions_executed !== false) {
    errors.push('Social connection status must record no real external actions')
  }
  if (socialConnectionStatus.summary?.enabled_connector_count !== 0 || socialConnectionStatus.summary?.ready_for_real_send_count !== 0) {
    errors.push('Social connection status must keep all real connectors disabled')
  }
  if (socialConnectionStatus.global_gates?.real_customer_message_send_allowed !== false || socialConnectionStatus.global_gates?.ad_spend_allowed !== false) {
    errors.push('Social connection status must block customer sends and ad spend')
  }
}

const promotionSocialValidation = parsed.get('runtime/growth-sales-automation/promotion-social-automation/validation-report.json')
if (promotionSocialValidation) {
  if (promotionSocialValidation.contract !== 'promotion_social_automation_validation_report.v1') {
    errors.push('Promotion/social validation report contract mismatch')
  }
  if (promotionSocialValidation.result !== 'pass') {
    errors.push('Promotion/social validation report must pass')
  }
}

const growthDashboardPath = join(projectRoot, 'runtime/growth-sales-automation/dashboard/index.html')
if (existsSync(growthDashboardPath)) {
  const dashboardHtml = readFileSync(growthDashboardPath, 'utf8')
  for (const marker of [
    'id="product-input-section"',
    'class="console-nav"',
    'data-console-tab="product"',
    'data-console-view="product"',
    'data-console-view="modules"',
    'data-console-view="sources"',
    'data-console-view="sync"',
    'class="collapse-block"',
    'decision-desk-hero',
    'product-focus-grid',
    'product-status-card',
    'id="launch-readiness-verdict"',
    'id="product-decision-status"',
    'id="product-missing-summary"',
    'product-result-grid',
    'technical-details',
    'id="category-recommendations"',
    'id="sales-mode-recommendations"',
    'id="product-guidance"',
    'id="minimum-trade-fields"',
    'id="product-chat-log"',
    'id="product-chat-input"',
    'id="product-settings-toggle"',
    'id="product-attach-button"',
    'data-product-option',
    'function applyChatProductInput',
    'id="ai-understanding-list"',
    'id="completion-question-list"',
    'id="data-source-grid"',
    'id="source-matrix-table"',
    'function renderSourceMatrix',
    'id="downstream-route-list"',
    'data-output-tab="decision"',
    'product_decision_pack.v1',
    'market_search_pack.v1',
    'downstream_route_pack.v1',
    'source_coverage_gate.v1',
    'launch_readiness_verdict.v1',
    'product_launch_decision_rules.v1',
    'product_launch_decision_rules_json',
    'latest_saved_product_decision_json',
    'Promotion/social status',
    'promotion_social_automation',
    'channel_specialized_design_json',
    'social_connector_registry_json',
    'id="module-overview-section"',
    'id="module-overview-list"',
    'function renderModuleOverview',
    'data-open-plan',
    'id="ai-plan-section"'
  ]) {
    if (!dashboardHtml.includes(marker)) {
      errors.push(`Growth sales dashboard missing marker: ${marker}`)
    }
  }
  if (dashboardHtml.includes('id="product-family"') || dashboardHtml.includes('id="sales-mode"')) {
    errors.push('Growth sales dashboard must not require manual product family or sales mode selection before AI suggestion')
  }
  if (dashboardHtml.includes('写入立项字段')) {
    errors.push('Growth sales dashboard product intake UI must not expose internal field-writing language')
  }
  const scriptMatch = dashboardHtml.match(/<script>\s*([\s\S]*?)\s*<\/script>/)
  if (!scriptMatch) {
    errors.push('Growth sales dashboard missing executable script')
  } else {
    try {
      new Function(scriptMatch[1])
    } catch (error) {
      errors.push(`Growth sales dashboard script syntax error: ${error.message}`)
    }
  }
}

if (controlStatus?.branch_overlays) {
  for (const branch of controlStatus.branch_overlays) {
    if (branch.real_external_actions_allowed !== false || branch.external_software_enabled !== false) {
      errors.push(`Branch overlay must be disabled by default: ${branch.branch_id}`)
    }
    if (branch.branch_id === 'growth_sales_automation_branch' && (!branch.ai_plan_json || !branch.ai_plan_md)) {
      errors.push('Growth sales branch overlay must expose ai_plan_json and ai_plan_md')
    }
    if (branch.branch_id === 'growth_sales_automation_branch' && (!branch.product_input_json || !branch.product_input_md || !branch.sample_runs)) {
      errors.push('Growth sales branch overlay must expose product input and sample run refs')
    }
    if (branch.branch_id === 'growth_sales_automation_branch' && (!branch.product_decision_desk_plan_json || !branch.product_decision_desk_plan_md || !branch.product_decision_desk_data_sources)) {
      errors.push('Growth sales branch overlay must expose product decision desk refs')
    }
    if (branch.branch_id === 'growth_sales_automation_branch' && (!branch.product_decision_desk_source_matrix_json || !branch.product_decision_desk_free_source_trial_json)) {
      errors.push('Growth sales branch overlay must expose product decision desk source matrix and free trial refs')
    }
    if (branch.branch_id === 'growth_sales_automation_branch' && (!branch.product_decision_desk_global_region_source_coverage_json || !branch.product_decision_desk_free_source_coverage_audit_json)) {
      errors.push('Growth sales branch overlay must expose global region source coverage and coverage audit refs')
    }
    if (branch.branch_id === 'growth_sales_automation_branch' && !branch.product_decision_desk_product_console_manager_audit_json) {
      errors.push('Growth sales branch overlay must expose product console manager audit ref')
    }
    if (branch.branch_id === 'growth_sales_automation_branch' && (!branch.product_decision_desk_direction_record_json || !branch.product_decision_desk_latest_saved_product_decision_json)) {
      errors.push('Growth sales branch overlay must expose direction record and latest saved product decision refs')
    }
    if (branch.branch_id === 'growth_sales_automation_branch' && (!branch.product_decision_desk_remaining_capability_execution_plan_json || !branch.product_decision_desk_remaining_capability_execution_plan_md)) {
      errors.push('Growth sales branch overlay must expose remaining capability execution plan refs')
    }
    if (branch.branch_id === 'growth_sales_automation_branch' && (!branch.product_decision_desk_category_profile_coverage_report_json || !branch.product_decision_desk_category_profile_coverage_report_md)) {
      errors.push('Growth sales branch overlay must expose category profile coverage report refs')
    }
    if (branch.branch_id === 'growth_sales_automation_branch' && (!branch.product_decision_desk_capability_c_execution_report_json || !branch.product_decision_desk_capability_c_execution_report_md)) {
      errors.push('Growth sales branch overlay must expose capability C execution report refs')
    }
    if (branch.branch_id === 'growth_sales_automation_branch' && (!branch.product_decision_desk_launch_rules_json || !branch.product_decision_desk_launch_rules_md)) {
      errors.push('Growth sales branch overlay must expose product launch decision rules refs')
    }
    if (branch.branch_id === 'growth_sales_automation_branch' && (!branch.promotion_social_execution_status_index_json || !branch.promotion_plan_json || !branch.promotion_channel_specialized_design_json)) {
      errors.push('Growth sales branch overlay must expose promotion/social execution status, promotion plan and channel specialized design refs')
    }
    if (branch.branch_id === 'growth_sales_automation_branch' && (!branch.auto_reply_bot_design_json || !branch.social_connector_registry_json || !branch.social_connection_status_json)) {
      errors.push('Growth sales branch overlay must expose bot design, social connector registry and social connection status refs')
    }
  }
}

function collectFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      results.push(...collectFiles(fullPath))
    } else {
      results.push(fullPath)
    }
  }
  return results
}

for (const file of collectFiles(projectRoot)) {
  const rel = relative(projectRoot, file).replaceAll('\\', '/')
  if (rel.startsWith('runtime/actual-graph-verification/') && rel.endsWith('.png')) continue
  if (rel.startsWith('runtime/os-visual-verification/') && rel.endsWith('.png')) continue
  if (rel.endsWith('.pdf') || rel.endsWith('.png') || rel.endsWith('.jpg') || rel.endsWith('.jpeg')) continue
  const content = readFileSync(file, 'utf8')
  if (content.includes(forbiddenRootRuntimeWin) || content.includes(forbiddenRootRuntimePosix)) {
    if (!rel.endsWith('docs/14-storage-boundary-and-artifact-index.md')) {
      errors.push(`old root runtime path found: ${rel}`)
    }
  }
  if (statSync(file).size === 0) {
    warnings.push(`empty file: ${rel}`)
  }
}

const report = {
  contract: 'cross_border_project_validation_report.v1',
  checked_at: new Date().toISOString(),
  project_root: projectRoot,
  errors,
  warnings,
  result: errors.length === 0 ? 'pass' : 'fail'
}

const reportPath = join(projectRoot, 'runtime', 'validations', 'project-validation-report.json')
writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')

if (errors.length) {
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
}

console.log(JSON.stringify(report, null, 2))
