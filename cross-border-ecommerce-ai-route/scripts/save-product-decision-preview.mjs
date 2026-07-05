import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ensureDir, nowIso, projectRoot, writeJson } from './cross-border-stage-control-lib.mjs'

const runtimeRoot = join(projectRoot, 'runtime', 'growth-sales-automation')
const productInputFrameworkPath = join(runtimeRoot, 'product-input-framework.json')
const deskRoot = join(runtimeRoot, 'product-decision-desk')
const sourceCoverageAuditPath = join(deskRoot, 'source-trials', 'latest-free-source-coverage-audit.json')
const sourceRegistryPath = join(deskRoot, 'data-source-registry.json')
const sourceMatrixPath = join(deskRoot, 'source-channel-matrix.json')
const productDecisionRulesPath = join(deskRoot, 'product-launch-decision-rules.json')

function projectRef(relativePath) {
  return `cross-border-ecommerce-ai-route/${relativePath.replaceAll('\\', '/')}`
}

function runtimeDecisionRef(...parts) {
  return projectRef(join('runtime', 'growth-sales-automation', 'product-decision-desk', ...parts))
}

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

function readOptionalJson(path) {
  if (!existsSync(path)) return null
  return readJson(path)
}

function arrayFrom(value, fallback = []) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === 'string' && value.trim()) {
    return value.split(/\r?\n|[,;；，]/).map((item) => item.trim()).filter(Boolean)
  }
  return fallback
}

function productRef(productId, area, fileName) {
  return runtimeDecisionRef(area, productId, fileName)
}

function readInputOverride(args) {
  const inputPath = args.input || args['input-json']
  if (!inputPath) return null
  return readJson(resolve(String(inputPath)))
}

function sourceGateFromAudit(audit) {
  const summary = audit?.summary || {}
  const marketRankingAllowed = summary.enough_for_current_trial_based_global_market_ranking === true
  return {
    contract: 'source_coverage_gate.v1',
    audit_ref: runtimeDecisionRef('source-trials', 'latest-free-source-coverage-audit.json'),
    generated_at: audit?.generated_at || null,
    registered_source_coverage_complete: summary.registered_source_coverage_complete === true,
    major_region_count: summary.major_region_count || 0,
    trial_first_pass_ready_count: summary.trial_first_pass_ready_count || 0,
    enough_for_first_pass_global_overview: summary.enough_for_first_pass_global_overview === true,
    market_ranking_allowed: marketRankingAllowed,
    global_market_feedback_claim_allowed: summary.global_market_feedback_claim_allowed === true,
    web_search_fallback_required: summary.web_search_fallback_required === true,
    blocked_reason: marketRankingAllowed
      ? null
      : 'Current trial evidence is not enough for global market ranking or real acquisition execution.',
    region_gaps: (audit?.region_coverage_audit || [])
      .filter((row) => row.status !== 'trial_first_pass_ready')
      .map((row) => ({
        region: row.region,
        status: row.status,
        missing_trial_signal_classes: row.missing_trial_signal_classes || []
      }))
  }
}

function buildReadinessScores({ sourceGate }) {
  return {
    data_completeness: 72,
    category_fit: 92,
    compliance_evidence: 42,
    visual_readiness: 48,
    commercial_readiness: 62,
    market_demand_fit: sourceGate.market_ranking_allowed ? 76 : 52,
    product_page_readiness: 66
  }
}

function buildLaunchReadinessVerdict({ scores, sourceGate, routeRows }) {
  const enabledLocalRoutes = routeRows.filter((route) => route.status.includes('enabled'))
  const blockedReasons = []
  if (!sourceGate.market_ranking_allowed) blockedReasons.push('market_ranking_blocked_by_source_gate')
  if (scores.compliance_evidence < 60) blockedReasons.push('compliance_evidence_missing_or_low')
  if (scores.commercial_readiness < 70) blockedReasons.push('commercial_terms_not_ready_for_quote')
  if (scores.visual_readiness < 60) blockedReasons.push('asset_readiness_low')

  if (enabledLocalRoutes.length && blockedReasons.length) {
    return {
      contract: 'launch_readiness_verdict.v1',
      verdict: 'CONDITIONAL',
      label: '可做草案但禁止真实动作',
      reason: '当前资料足以生成产品页、市场搜索和客户画像本地草案，但证据、报价、市场覆盖或素材不足以支撑发布、报价、外联。',
      allowed_now: enabledLocalRoutes.map((route) => route.route_id),
      blocked_next: ['publish', 'quote_send', 'market_ranking', 'real_outreach'],
      required_next_actions: [
        '补齐证书/检测报告或明确不可用',
        '补齐MOQ、阶梯价、交期、包装重量体积和贸易条款',
        '通过目标市场数据源门禁后再做市场排序',
        '补齐产品图片、包装图、细节图和私标素材'
      ],
      blocked_reasons: blockedReasons
    }
  }

  return {
    contract: 'launch_readiness_verdict.v1',
    verdict: enabledLocalRoutes.length ? 'GO' : 'HOLD',
    label: enabledLocalRoutes.length ? '可进入下游本地草案' : '暂停进入下游，先补产品事实',
    reason: enabledLocalRoutes.length
      ? '当前产品达到本地草案标准；真实发布、报价和外联仍需人工审批。'
      : '当前没有可执行的本地下游路由。',
    allowed_now: enabledLocalRoutes.map((route) => route.route_id),
    blocked_next: enabledLocalRoutes.length ? ['publish', 'quote_send', 'real_outreach'] : ['all_downstream_routes'],
    required_next_actions: enabledLocalRoutes.length
      ? ['进入下游本地草案后继续人工复核证据和价格。']
      : ['返回产品输入对话，补齐AI追问字段。'],
    blocked_reasons: []
  }
}

function buildCategoryProfileMatch({ productId, generatedAt, classification, productDecisionRules }) {
  const profiles = productDecisionRules?.category_profiles || []
  const matched = profiles.find((profile) => profile.category_id === classification.product_family) || profiles[0] || null
  return {
    contract: 'product_category_profile_match.v1',
    generated_at: generatedAt,
    product_id: productId,
    matched_category_id: matched?.category_id || classification.product_family,
    matched_label: matched?.label || classification.product_family_label,
    confidence: classification.product_family_confidence,
    profile_ref: runtimeDecisionRef('product-launch-decision-rules.json'),
    required_fact_groups: matched?.required_fact_groups || [],
    category_specific_questions: matched?.category_specific_questions || [],
    default_sales_models: matched?.default_sales_models || [],
    common_buyer_roles: matched?.common_buyer_roles || [],
    compliance_focus: matched?.compliance_focus || [],
    commercial_variables: matched?.commercial_variables || [],
    asset_requirements: matched?.asset_requirements || [],
    downstream_blockers: matched?.downstream_blockers || [],
    human_review_required: true
  }
}

function buildProductPageRequirement({ productId, generatedAt, sample, classification, categoryProfileMatch, decisionPack }) {
  return {
    contract: 'product_page_requirement.v1',
    generated_at: generatedAt,
    product_id: productId,
    page_scope: classification.current_product_page_scope,
    page_status: 'local_draft_allowed_claims_gated',
    product_identity: sample.product_name,
    category_profile_ref: productRef(productId, 'outputs', 'category-profile-match.json'),
    approved_selling_points: sample.known_strengths || [],
    claim_whitelist: decisionPack.minimum_foreign_trade_fields.claim_whitelist || [],
    claim_blacklist: decisionPack.minimum_foreign_trade_fields.claim_blacklist || [],
    required_sections: ['hero', 'technical_specs', 'customization', 'quality_evidence', 'rfq_call_to_action'],
    asset_requirements: categoryProfileMatch.asset_requirements || [],
    language_plan: {
      default_language: 'en',
      target_languages_pending: true,
      blocked_claim_translation_until_evidence: true
    },
    blocked_until: [
      'approve_product_facts',
      'approve_certification_claims',
      'approve_product_page_strategy'
    ],
    real_publish_allowed: false
  }
}

function buildBuyerProfilePack({ productId, generatedAt, classification, minimumForeignTradeFields }) {
  return {
    contract: 'buyer_profile_pack.v1',
    generated_at: generatedAt,
    product_id: productId,
    sales_model: classification.selected_sales_modes,
    buyer_roles: ['distributor', 'installer', 'system_integrator', 'project_procurement'],
    region_channel_matrix: minimumForeignTradeFields.target_country_candidates.map((country) => ({
      country,
      recommended_roles: ['distributor', 'installer', 'system_integrator'],
      channel: 'B2B inquiry / distributor development / project RFQ',
      evidence_status: 'draft_pending_market_source_gate'
    })),
    icp_fit_rules: [
      'Must buy structured cabling or low-voltage installation components.',
      'Prefer recurring project, distribution, installation or system integration demand.',
      'Exclude contacts without product relevance or without human-approved outreach basis.'
    ],
    blocked_outreach_reasons: ['real_outreach_requires_human_approval', 'market_ranking_blocked_until_source_gate'],
    real_outreach_allowed: false
  }
}

function buildQuoteInputBasis({ productId, generatedAt, minimumForeignTradeFields }) {
  return {
    contract: 'quote_input_basis.v1',
    generated_at: generatedAt,
    product_id: productId,
    moq: 'pending_factory_confirmation',
    price_tiers: 'pending_factory_confirmation',
    sample_policy: 'pending_factory_confirmation',
    lead_time: 'pending_factory_confirmation',
    incoterms: minimumForeignTradeFields.incoterms,
    currency: minimumForeignTradeFields.currency,
    payment_terms: minimumForeignTradeFields.payment_terms,
    price_validity: minimumForeignTradeFields.price_validity,
    packing_weight_volume: minimumForeignTradeFields.packing_weight_volume,
    quote_send_allowed: false,
    blocked_until: ['approve_cost_model', 'approve_price_book', 'approve_price', 'approve_terms']
  }
}

function buildLogisticsBasis({ productId, generatedAt, minimumForeignTradeFields }) {
  return {
    contract: 'logistics_basis.v1',
    generated_at: generatedAt,
    product_id: productId,
    carton_dimensions: 'unknown_pending_factory_confirmation',
    net_gross_weight: 'unknown_pending_factory_confirmation',
    volume: 'unknown_pending_factory_confirmation',
    packing_weight_volume: minimumForeignTradeFields.packing_weight_volume,
    dangerous_goods_status: 'not_expected_but_unconfirmed',
    destination_candidates: minimumForeignTradeFields.target_country_candidates,
    shipping_mode_candidates: ['express_sample', 'air_freight_small_batch', 'sea_freight_bulk'],
    logistics_comparison_confidence: 'low_until_packing_weight_volume_confirmed',
    shipment_booking_allowed: false
  }
}

function buildComplianceReviewPack({ productId, generatedAt, minimumForeignTradeFields, sourceGate }) {
  return {
    contract: 'compliance_review_pack.v1',
    generated_at: generatedAt,
    product_id: productId,
    hs_code_candidates: minimumForeignTradeFields.hs_code_candidates,
    target_country_candidates: minimumForeignTradeFields.target_country_candidates,
    certificate_refs: [],
    test_report_refs: [],
    claim_status: {
      whitelist: minimumForeignTradeFields.claim_whitelist,
      blacklist: minimumForeignTradeFields.claim_blacklist,
      certification_claim_allowed: false,
      performance_claim_allowed: false
    },
    source_gate: sourceGate,
    human_review_required: true,
    blocked_until: ['hs_code_review', 'certification_review', 'ip_review']
  }
}

function buildSourceFileManifest({ productId, generatedAt, sample, inputOverride }) {
  const files = arrayFrom(inputOverride?.source_files || inputOverride?.files || [], [])
  const fallbackFiles = [
    sample.page_artifact,
    sample.visual_brief
  ].filter(Boolean)
  const entries = (files.length ? files : fallbackFiles).map((file, index) => ({
    file_id: `src_${String(index + 1).padStart(2, '0')}`,
    source_ref: file,
    source_type: file.endsWith('.pdf') ? 'pdf_catalogue'
      : file.match(/\.(png|jpg|jpeg|webp)$/i) ? 'product_image'
        : file.endsWith('.json') ? 'structured_runtime_artifact'
          : 'operator_reference',
    read_mode: 'local_reference_only',
    external_upload_executed: false,
    classification_status: 'pending_asset_pipeline'
  }))
  return {
    contract: 'source_file_manifest.v1',
    generated_at: generatedAt,
    product_id: productId,
    files: entries,
    required_next_actions: [
      'classify_pdf_image_certificate_or_packing_file',
      'extract_product_images_read_only',
      'run_product_visual_qa_before_page_rebuild'
    ],
    real_external_actions_executed: false
  }
}

function buildDialogueState({ productId, generatedAt, decisionPack }) {
  return {
    contract: 'product_dialogue_state.v1',
    generated_at: generatedAt,
    product_id: productId,
    current_round: 1,
    state: 'waiting_user_completion',
    answered_fields: [],
    pending_questions: decisionPack.missing_info_questions,
    skipped_questions: [],
    next_ai_prompt_goal: 'collect_missing_product_facts_for_launch_readiness_upgrade',
    human_can_override_ai_suggestions: true
  }
}

function buildCapabilityGapReport({ productId, generatedAt, launchReadinessVerdict, sourceGate }) {
  return {
    contract: 'product_decision_capability_gap_report.v1',
    generated_at: generatedAt,
    product_id: productId,
    current_verdict: launchReadinessVerdict.verdict,
    gaps_to_close_before_professional_launch: [
      {
        gap_id: 'asset_intake_pipeline',
        label: '文件与产品图读取能力',
        status: 'pending',
        required_outputs: ['source-file-manifest.json', 'product_visual_brief.v1', 'asset_qa_report.v1']
      },
      {
        gap_id: 'category_profile_expansion',
        label: '更多品类画像库',
        status: 'partial',
        required_outputs: ['category_profiles for lighting, apparel, packaging, chemicals, auto parts, home goods']
      },
      {
        gap_id: 'source_gate_execution',
        label: '目标市场真实信源试跑',
        status: sourceGate.market_ranking_allowed ? 'passed_for_current_scope' : 'blocked',
        required_outputs: ['region_source_evidence_pack.v1', 'freshness_audit.v1']
      },
      {
        gap_id: 'quote_and_logistics_confirmation',
        label: '报价与物流硬字段确认',
        status: 'pending',
        required_outputs: ['quote_input_basis.v1 confirmed', 'logistics_basis.v1 confirmed']
      },
      {
        gap_id: 'script_backed_dashboard_save',
        label: '控制台按钮触发受控保存',
        status: 'planned',
        required_outputs: ['local_save_request.v1', 'run_event.v1', 'latest_saved_product_decision update']
      }
    ],
    next_recommended_build_order: [
      'Add read-only file manifest and asset classification pipeline.',
      'Add category profile expansion workflow for new product classes.',
      'Add source-gate rerun controls for selected target regions.',
      'Add controlled dashboard save request handoff rather than direct browser write.'
    ]
  }
}

function buildMarkdownPack({ manifest, packs }) {
  const { decisionPack, marketSearchPack, downstreamRoutePack, capabilityGapReport } = packs
  return `# Product Decision Package

Product: \`${manifest.product_id}\`

Generated at: ${manifest.generated_at}

Real external actions executed: ${manifest.real_external_actions_executed ? 'yes' : 'no'}

## Gate

- Market ranking allowed: ${marketSearchPack.source_gate.market_ranking_allowed}
- Trial-ready regions: ${marketSearchPack.source_gate.trial_first_pass_ready_count}/${marketSearchPack.source_gate.major_region_count}
- Blocked reason: ${marketSearchPack.source_gate.blocked_reason || 'none'}

## Decision Pack

- Contract: \`${decisionPack.contract}\`
- Category: ${decisionPack.classification.product_family_label}
- Sales model: ${decisionPack.classification.sales_mode_label}
- Launch verdict: \`${decisionPack.launch_readiness_verdict.verdict}\` ${decisionPack.launch_readiness_verdict.label}
- Missing questions: ${decisionPack.missing_info_questions.length}

## Downstream

${downstreamRoutePack.next_actions.map((item) => `- ${item.route_id}: ${item.action}`).join('\n')}

## Complete Package Outputs

${Object.entries(manifest.output_refs).map(([key, value]) => `- ${key}: \`${value}\``).join('\n')}

## Remaining Capability Gaps

${capabilityGapReport.gaps_to_close_before_professional_launch.map((gap) => `- ${gap.gap_id}: ${gap.label} (${gap.status})`).join('\n')}
`
}

const args = parseArgs(process.argv)
const generatedAt = nowIso()
const inputOverride = readInputOverride(args)
const productId = String(args['product-id'] || args.productId || inputOverride?.product_id || 'structured-cabling-sample')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'structured-cabling-sample'

const framework = readJson(productInputFrameworkPath)
const audit = readOptionalJson(sourceCoverageAuditPath)
const registry = readOptionalJson(sourceRegistryPath) || {}
const sourceMatrix = readOptionalJson(sourceMatrixPath) || {}
const productDecisionRules = readOptionalJson(productDecisionRulesPath) || null
const sample = {
  ...framework.current_sample_product,
  ...(inputOverride || {}),
  known_strengths: arrayFrom(inputOverride?.known_strengths, framework.current_sample_product.known_strengths || []),
  current_missing_items: arrayFrom(inputOverride?.current_missing_items || inputOverride?.missing_fields, framework.current_sample_product.current_missing_items || [])
}
const sourceGate = sourceGateFromAudit(audit)

const inputDir = join(deskRoot, 'inputs', productId)
const outputDir = join(deskRoot, 'outputs', productId)
ensureDir(inputDir)
ensureDir(outputDir)

const minimumForeignTradeFields = {
  hs_code_candidates: arrayFrom(inputOverride?.minimum_foreign_trade_fields?.hs_code_candidates || inputOverride?.hs_code_candidates, ['8536.69', '8544.42']),
  target_country_candidates: arrayFrom(inputOverride?.minimum_foreign_trade_fields?.target_country_candidates || inputOverride?.target_country_candidates, ['United States', 'Germany', 'United Arab Emirates', 'Brazil', 'South Africa', 'Singapore', 'Japan', 'Australia']),
  incoterms: arrayFrom(inputOverride?.minimum_foreign_trade_fields?.incoterms || inputOverride?.incoterms, ['EXW', 'FOB', 'CIF']),
  currency: inputOverride?.minimum_foreign_trade_fields?.currency || inputOverride?.currency || 'USD',
  payment_terms: inputOverride?.minimum_foreign_trade_fields?.payment_terms || inputOverride?.payment_terms || 'T/T pending confirmation',
  price_validity: inputOverride?.minimum_foreign_trade_fields?.price_validity || inputOverride?.price_validity || '15 days draft',
  packing_weight_volume: inputOverride?.minimum_foreign_trade_fields?.packing_weight_volume || inputOverride?.packing_weight_volume || 'unknown_pending_factory_confirmation',
  claim_whitelist: arrayFrom(inputOverride?.minimum_foreign_trade_fields?.claim_whitelist || inputOverride?.claim_whitelist, ['private label support', 'quantity price tiers', 'custom model support']),
  claim_blacklist: arrayFrom(inputOverride?.minimum_foreign_trade_fields?.claim_blacklist || inputOverride?.claim_blacklist, ['UL/ETL/CE/RoHS claims blocked until certificate and test report are confirmed', 'performance claims blocked until test data is confirmed'])
}

const normalizedInput = {
  contract: 'normalized_product_input.v1',
  generated_at: generatedAt,
  execution_mode: 'local_preview_persistence',
  real_external_actions_executed: false,
  product_id: productId,
  product_name: sample.product_name,
  source_refs: {
    product_input_framework: projectRef('runtime/growth-sales-automation/product-input-framework.json'),
    product_launch_decision_rules: runtimeDecisionRef('product-launch-decision-rules.json'),
    operator_input_json: args.input || args['input-json'] || null,
    current_direction_record: runtimeDecisionRef('current-direction-record.json'),
    product_console_audit: runtimeDecisionRef('product-console-manager-audit.json'),
    source_coverage_audit: runtimeDecisionRef('source-trials', 'latest-free-source-coverage-audit.json'),
    current_sample_page: sample.page_artifact,
    current_visual_brief: sample.visual_brief
  },
  product_description: [
    inputOverride?.product_description || 'Structured cabling keystone jack sample product for B2B wholesale, project procurement and OEM/private label routes.',
    ...(sample.known_strengths || [])
  ].join('\n'),
  ai_suggested_classification: {
    product_family: [
      { value: 'structured_cabling', label: 'Structured cabling component', confidence: 92 },
      { value: 'industrial_parts', label: 'Industrial component', confidence: 62 },
      { value: 'custom_product', label: 'Custom/OEM product', confidence: 58 }
    ],
    sales_mode: [
      { value: 'wholesale', label: 'B2B wholesale', confidence: 88 },
      { value: 'project_procurement', label: 'Project procurement / RFQ', confidence: 86 },
      { value: 'OEM_private_label', label: 'OEM/private label', confidence: 78 },
      { value: 'retail', label: 'Retail listing', confidence: 38 }
    ],
    selected_after_ai_suggestion: {
      product_family: ['structured_cabling'],
      sales_mode: ['wholesale', 'project_procurement', 'OEM_private_label'],
      human_confirmed: false
    }
  },
  minimum_foreign_trade_fields: minimumForeignTradeFields,
  evidence_status: {
    specs: 'partial_user_source_unverified',
    compliance: 'missing_or_unknown',
    commercial_terms: 'partial_draft_only',
    visuals: 'product_page_sample_exists_but_original_assets_need_rebuild',
    source_coverage: sourceGate.market_ranking_allowed ? 'market_ranking_allowed' : 'market_ranking_blocked'
  },
  missing_fields: sample.current_missing_items,
  human_review_required: true
}

const scores = buildReadinessScores({ sourceGate })
const classification = {
  product_family: inputOverride?.product_family || 'structured_cabling',
  product_family_label: inputOverride?.product_family_label || 'Structured cabling component',
  product_family_confidence: Number(inputOverride?.product_family_confidence || 92),
  selected_product_families: arrayFrom(inputOverride?.selected_product_families, [inputOverride?.product_family || 'structured_cabling']),
  sales_mode: inputOverride?.sales_mode || 'wholesale',
  sales_mode_label: inputOverride?.sales_mode_label || 'B2B wholesale / RFQ / OEM private label',
  sales_mode_confidence: Number(inputOverride?.sales_mode_confidence || 88),
  selected_sales_modes: arrayFrom(inputOverride?.selected_sales_modes, ['wholesale', 'project_procurement', 'OEM_private_label']),
  product_page_required: inputOverride?.product_page_required || 'yes_generate',
  current_product_page_scope: inputOverride?.current_product_page_scope || 'technical_detail_page + RFQ landing page'
}

const routeRows = [
  {
    route_id: 'product_page_draft',
    label: 'Generate product page draft',
    status: 'enabled_local_draft',
    reason: 'Enough category and selling-point signal for a local draft; evidence claims remain gated.',
    artifact: 'product_page_build_requirement.v1'
  },
  {
    route_id: 'market_search_plan',
    label: 'Generate market search plan',
    status: 'enabled_local_draft',
    reason: 'Can generate a source plan and query pack without real external calls.',
    artifact: 'market_search_pack.v1'
  },
  {
    route_id: 'customer_profile',
    label: 'Generate buyer profile',
    status: 'enabled_local_draft',
    reason: 'Can draft buyer roles from the sales-mode recommendation.',
    artifact: 'buyer_profile_suggestion.v1'
  },
  {
    route_id: 'quote_draft',
    label: 'Generate quote basis',
    status: 'blocked_until_price_terms',
    reason: 'MOQ, exact price tiers, packing weight/volume and payment terms still need confirmation.',
    artifact: 'quote_input_basis.v1'
  },
  {
    route_id: 'acquisition_modules',
    label: 'Enter acquisition modules',
    status: sourceGate.market_ranking_allowed ? 'enabled_after_human_review' : 'blocked_until_source_gate',
    reason: sourceGate.market_ranking_allowed
      ? 'Market ranking gate passed; real outreach still requires human approval.'
      : 'Source trial coverage is not enough for market ranking or real acquisition execution.',
    artifact: 'downstream_route_pack.v1'
  }
]

const launchReadinessVerdict = buildLaunchReadinessVerdict({ scores, sourceGate, routeRows })

const decisionPack = {
  contract: 'product_decision_pack.v1',
  generated_at: generatedAt,
  product_id: productId,
  normalized_product_input_ref: runtimeDecisionRef('inputs', productId, 'normalized-product-input.json'),
  classification,
  ai_understanding: {
    product_identity: sample.product_name,
    inferred_category: classification.product_family_label,
    inferred_sales_model: classification.sales_mode_label,
    buyer_reason_to_buy: 'Used for structured cabling projects, weak-current installation, distributor stocking and system-integration procurement.',
    immediate_selling_points: sample.known_strengths,
    evidence_risk: 'Certification and test-report evidence is not confirmed; formal claims remain blocked.',
    data_quality_note: 'Local preview persistence is complete; next product-page draft must read this pack.'
  },
  category_recommendations: normalizedInput.ai_suggested_classification.product_family,
  sales_model_recommendations: normalizedInput.ai_suggested_classification.sales_mode,
  minimum_foreign_trade_fields: minimumForeignTradeFields,
  missing_info_questions: [
    { question_id: 'q_1', question: 'Confirm exact material, dimensions, termination type, cable compatibility and packing.', status: 'waiting_user_input' },
    { question_id: 'q_2', question: 'Confirm CE/RoHS/UL/ETL or third-party test report status, or mark as unavailable.', status: 'waiting_user_input' },
    { question_id: 'q_3', question: 'Confirm MOQ, price tiers, sample policy, lead time, packing weight/volume and Incoterms.', status: 'waiting_user_input' },
    { question_id: 'q_4', question: 'Confirm target countries and any markets to exclude before market ranking.', status: 'waiting_user_input' },
    { question_id: 'q_5', question: 'Confirm claim whitelist/blacklist for product page and future AI customer answers.', status: 'waiting_user_input' }
  ],
  readiness_scores: scores,
  launch_readiness_verdict: launchReadinessVerdict,
  rule_refs: {
    product_launch_decision_rules: runtimeDecisionRef('product-launch-decision-rules.json'),
    rules_contract: productDecisionRules?.contract || 'product_launch_decision_rules.v1'
  },
  complete_package_refs: {
    category_profile_match: productRef(productId, 'outputs', 'category-profile-match.json'),
    product_page_requirement: productRef(productId, 'outputs', 'product-page-requirement.json'),
    buyer_profile_pack: productRef(productId, 'outputs', 'buyer-profile-pack.json'),
    quote_input_basis: productRef(productId, 'outputs', 'quote-input-basis.json'),
    logistics_basis: productRef(productId, 'outputs', 'logistics-basis.json'),
    compliance_review_pack: productRef(productId, 'outputs', 'compliance-review-pack.json'),
    capability_gap_report: productRef(productId, 'outputs', 'capability-gap-report.json')
  },
  downstream_routes: routeRows,
  gate_status: {
    source_coverage: sourceGate,
    tariff_and_compliance_claims: 'blocked_until_hs_code_and_certificate_evidence_confirmed',
    quote_send: 'blocked_until_price_terms_and_packing_confirmed',
    logistics_comparison: 'low_confidence_until_packing_weight_volume',
    ai_customer_answer_claims: 'blocked_for_certification_or_performance_claims_until_evidence'
  },
  evidence_status: normalizedInput.evidence_status,
  human_review_required: true,
  real_external_actions_executed: false
}

const marketSearchPack = {
  contract: 'market_search_pack.v1',
  generated_at: generatedAt,
  product_id: productId,
  execution_mode: 'local_preview_no_external_search',
  source_channel_matrix_ref: runtimeDecisionRef('source-channel-matrix.json'),
  latest_free_source_trial_ref: runtimeDecisionRef('source-trials', 'latest-free-source-trial.json'),
  latest_free_source_coverage_audit_ref: runtimeDecisionRef('source-trials', 'latest-free-source-coverage-audit.json'),
  query_plan: {
    product_terms: ['keystone jack', 'structured cabling component', 'RJ45 module', 'patch panel accessory'],
    buyer_terms: ['distributor', 'installer', 'system integrator', 'project procurement', 'OEM private label'],
    hs_code_candidates: minimumForeignTradeFields.hs_code_candidates,
    target_country_candidates: minimumForeignTradeFields.target_country_candidates
  },
  source_selection_policy: registry.source_selection_policy || null,
  web_search_fallback_policy: sourceMatrix.web_search_fallback_policy || null,
  source_gate: sourceGate,
  market_ranking_allowed: sourceGate.market_ranking_allowed,
  limitations: [
    'No real external search, customs query, marketplace query, buyer scraping or customer contact was executed.',
    'Global market ranking is blocked until the source coverage gate passes.',
    'Registered sources are a coverage map, not proof that trial evidence is sufficient.'
  ],
  real_external_actions_executed: false
}

const downstreamRoutePack = {
  contract: 'downstream_route_pack.v1',
  generated_at: generatedAt,
  product_id: productId,
  enabled_routes: routeRows.filter((route) => route.status.includes('enabled')),
  blocked_routes: routeRows.filter((route) => route.status.includes('blocked') || route.status.includes('needs')),
  human_gates: [
    'approve_product_facts',
    'approve_certification_claims',
    'approve_external_data_source_enable',
    'approve_market_ranking_after_source_gate',
    'approve_publish',
    'approve_real_outreach'
  ],
  source_gate: sourceGate,
  next_actions: routeRows.map((route) => ({
    route_id: route.route_id,
    action: route.status.includes('enabled') ? 'can_generate_local_draft' : 'collect_required_information_or_pass_gate',
    artifact: route.artifact,
    status: route.status
  })),
  artifact_refs: {
    normalized_product_input: runtimeDecisionRef('inputs', productId, 'normalized-product-input.json'),
    decision_pack: runtimeDecisionRef('outputs', productId, 'decision-pack.json'),
    market_search_pack: runtimeDecisionRef('outputs', productId, 'market-search-pack.json'),
    product_launch_decision_rules: runtimeDecisionRef('product-launch-decision-rules.json')
  },
  real_external_actions_executed: false
}

const categoryProfileMatch = buildCategoryProfileMatch({ productId, generatedAt, classification, productDecisionRules })
const productPageRequirement = buildProductPageRequirement({
  productId,
  generatedAt,
  sample,
  classification,
  categoryProfileMatch,
  decisionPack
})
const buyerProfilePack = buildBuyerProfilePack({ productId, generatedAt, classification, minimumForeignTradeFields })
const quoteInputBasis = buildQuoteInputBasis({ productId, generatedAt, minimumForeignTradeFields })
const logisticsBasis = buildLogisticsBasis({ productId, generatedAt, minimumForeignTradeFields })
const complianceReviewPack = buildComplianceReviewPack({ productId, generatedAt, minimumForeignTradeFields, sourceGate })
const sourceFileManifest = buildSourceFileManifest({ productId, generatedAt, sample, inputOverride })
const dialogueState = buildDialogueState({ productId, generatedAt, decisionPack })
const capabilityGapReport = buildCapabilityGapReport({ productId, generatedAt, launchReadinessVerdict, sourceGate })

const manifest = {
  contract: 'product_decision_desk_saved_product_decision_manifest.v1',
  generated_at: generatedAt,
  execution_mode: 'local_preview_persistence',
  real_external_actions_executed: false,
  product_id: productId,
  product_name: sample.product_name,
  latest_input_ref: runtimeDecisionRef('inputs', productId, 'normalized-product-input.json'),
  output_refs: {
    decision_pack: runtimeDecisionRef('outputs', productId, 'decision-pack.json'),
    market_search_pack: runtimeDecisionRef('outputs', productId, 'market-search-pack.json'),
    downstream_route_pack: runtimeDecisionRef('outputs', productId, 'downstream-route-pack.json'),
    category_profile_match: runtimeDecisionRef('outputs', productId, 'category-profile-match.json'),
    product_page_requirement: runtimeDecisionRef('outputs', productId, 'product-page-requirement.json'),
    buyer_profile_pack: runtimeDecisionRef('outputs', productId, 'buyer-profile-pack.json'),
    quote_input_basis: runtimeDecisionRef('outputs', productId, 'quote-input-basis.json'),
    logistics_basis: runtimeDecisionRef('outputs', productId, 'logistics-basis.json'),
    compliance_review_pack: runtimeDecisionRef('outputs', productId, 'compliance-review-pack.json'),
    launch_readiness_verdict: runtimeDecisionRef('outputs', productId, 'launch-readiness-verdict.json'),
    capability_gap_report: runtimeDecisionRef('outputs', productId, 'capability-gap-report.json'),
    source_file_manifest: runtimeDecisionRef('inputs', productId, 'source-file-manifest.json'),
    dialogue_state: runtimeDecisionRef('inputs', productId, 'dialogue-state.json'),
    operator_markdown: runtimeDecisionRef('outputs', productId, 'decision-preview.md')
  },
  rule_refs: {
    product_launch_decision_rules: runtimeDecisionRef('product-launch-decision-rules.json')
  },
  source_gate: sourceGate,
  launch_readiness_verdict: launchReadinessVerdict,
  readiness: {
    ready_for_product_page_local_draft: true,
    ready_for_market_search_plan_local_draft: true,
    ready_for_market_ranking: sourceGate.market_ranking_allowed,
    ready_for_quote_send: false,
    ready_for_real_outreach: false
  },
  required_before_next_real_action: [
    'human_confirm_product_facts',
    'human_confirm_certification_claims',
    'human_confirm_price_terms_and_packing',
    'pass_source_coverage_gate_for_market_ranking',
    'manual_enable_external_connectors'
  ]
}

writeJson(join(inputDir, 'normalized-product-input.json'), normalizedInput)
writeJson(join(inputDir, 'source-file-manifest.json'), sourceFileManifest)
writeJson(join(inputDir, 'dialogue-state.json'), dialogueState)
writeJson(join(outputDir, 'decision-pack.json'), decisionPack)
writeJson(join(outputDir, 'market-search-pack.json'), marketSearchPack)
writeJson(join(outputDir, 'downstream-route-pack.json'), downstreamRoutePack)
writeJson(join(outputDir, 'category-profile-match.json'), categoryProfileMatch)
writeJson(join(outputDir, 'product-page-requirement.json'), productPageRequirement)
writeJson(join(outputDir, 'buyer-profile-pack.json'), buyerProfilePack)
writeJson(join(outputDir, 'quote-input-basis.json'), quoteInputBasis)
writeJson(join(outputDir, 'logistics-basis.json'), logisticsBasis)
writeJson(join(outputDir, 'compliance-review-pack.json'), complianceReviewPack)
writeJson(join(outputDir, 'launch-readiness-verdict.json'), launchReadinessVerdict)
writeJson(join(outputDir, 'capability-gap-report.json'), capabilityGapReport)
writeFileSync(join(outputDir, 'decision-preview.md'), buildMarkdownPack({
  manifest,
  packs: {
    decisionPack,
    marketSearchPack,
    downstreamRoutePack,
    capabilityGapReport
  }
}), 'utf8')
writeJson(join(deskRoot, 'latest-saved-product-decision.json'), manifest)

console.log(JSON.stringify({
  success: true,
  manifest: runtimeDecisionRef('latest-saved-product-decision.json'),
  product_id: productId,
  output_refs: manifest.output_refs,
  launch_readiness_verdict: launchReadinessVerdict,
  source_gate: sourceGate
}, null, 2))
