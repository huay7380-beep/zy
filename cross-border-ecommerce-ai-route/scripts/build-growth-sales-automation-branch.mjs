import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureDir, nowIso, projectRoot, writeJson } from './cross-border-stage-control-lib.mjs'

const templatePath = join(projectRoot, 'templates', 'growth-sales-automation-branch.template.json')
const runtimeRoot = join(projectRoot, 'runtime', 'growth-sales-automation')
const dashboardDir = join(runtimeRoot, 'dashboard')
const promptsDir = join(runtimeRoot, 'prompts')
const sampleRunsDir = join(runtimeRoot, 'sample-runs')
const controlPackPath = join(runtimeRoot, 'branch-control-pack.json')
const aiPlanJsonPath = join(runtimeRoot, 'ai-implementation-plan.json')
const aiPlanMdPath = join(runtimeRoot, 'ai-implementation-plan.md')
const productInputJsonPath = join(runtimeRoot, 'product-input-framework.json')
const productInputMdPath = join(runtimeRoot, 'product-input-framework.md')
const productDecisionDeskDir = join(runtimeRoot, 'product-decision-desk')
const productDecisionDeskPlanPath = join(productDecisionDeskDir, 'execution-plan.json')
const productDecisionDeskDataSourcePath = join(productDecisionDeskDir, 'data-source-registry.json')
const productDecisionDeskSourceMatrixPath = join(productDecisionDeskDir, 'source-channel-matrix.json')
const productDecisionDeskGlobalRegionCoveragePath = join(productDecisionDeskDir, 'global-region-source-coverage.json')
const productDecisionDeskConsoleAuditPath = join(productDecisionDeskDir, 'product-console-manager-audit.json')
const productDecisionDeskDirectionRecordPath = join(productDecisionDeskDir, 'current-direction-record.json')
const productDecisionDeskRemainingCapabilityPlanPath = join(productDecisionDeskDir, 'remaining-capability-execution-plan.json')
const productDecisionDeskCategoryCoveragePath = join(productDecisionDeskDir, 'category-profile-coverage-report.json')
const productDecisionDeskCapabilityCReportPath = join(productDecisionDeskDir, 'capability-c-execution-report.json')
const productDecisionDeskRemainingExecutionReportPath = join(productDecisionDeskDir, 'remaining-capabilities-execution-report.json')
const productDecisionDeskDefectAssessmentPath = join(productDecisionDeskDir, 'post-completion-defect-assessment.json')
const productDecisionDeskLatestSavedDecisionPath = join(productDecisionDeskDir, 'latest-saved-product-decision.json')
const productDecisionDeskRulesPath = join(productDecisionDeskDir, 'product-launch-decision-rules.json')
const productDecisionDeskRulesMdPath = join(productDecisionDeskDir, 'product-launch-decision-rules.md')
const productDecisionDeskFreeTrialPath = join(productDecisionDeskDir, 'source-trials', 'latest-free-source-trial.json')
const productDecisionDeskFreeCoverageAuditPath = join(productDecisionDeskDir, 'source-trials', 'latest-free-source-coverage-audit.json')
const promotionSocialAutomationDir = join(runtimeRoot, 'promotion-social-automation')
const promotionPlanPath = join(promotionSocialAutomationDir, 'promotion-plan.json')
const channelSpecializedDesignPath = join(promotionSocialAutomationDir, 'channel-specialized-design.json')
const autoReplyBotDesignPath = join(promotionSocialAutomationDir, 'auto-reply-bot-design.json')
const socialConnectorRegistryPath = join(promotionSocialAutomationDir, 'social-connector-registry.json')
const socialConnectionStatusPath = join(promotionSocialAutomationDir, 'connection-status.json')
const promotionSocialValidationReportPath = join(promotionSocialAutomationDir, 'validation-report.json')
const growthExecutionStatusIndexPath = join(runtimeRoot, 'execution-status-index.json')
const dashboardPath = join(dashboardDir, 'index.html')
const projectionPath = join(projectRoot, 'os-particle-projection.json')

function projectRef(relativePath) {
  return `cross-border-ecommerce-ai-route/${relativePath.replaceAll('\\', '/')}`
}

function flattenModules(branch) {
  return (branch.phases || []).flatMap((phase) =>
    (phase.modules || []).map((module) => ({
      ...module,
      phase_id: phase.phase_id,
      phase_label: phase.label
    }))
  )
}

function summarizeBranch(branch) {
  const modules = flattenModules(branch)
  const coverage_counts = modules.reduce((counts, module) => {
    counts[module.coverage] = (counts[module.coverage] || 0) + 1
    return counts
  }, {})
  const mapped_stage_ids = [
    ...new Set((branch.phases || []).flatMap((phase) => phase.mapped_stage_ids || []))
  ]
  return {
    phase_count: (branch.phases || []).length,
    module_count: modules.length,
    software_count: (branch.software_catalog || []).length,
    mapped_stage_count: mapped_stage_ids.length,
    mapped_stage_ids,
    coverage_counts,
    disabled_software_count: (branch.software_catalog || []).filter(
      (software) => software.default_state === 'disabled'
    ).length,
    real_external_actions_allowed: branch.safety_policy?.real_external_actions_allowed === true,
    software_actions_enabled_by_default:
      branch.safety_policy?.software_actions_enabled_by_default === true
  }
}

function modulePathId(phase, module) {
  return `${phase.phase_id}.${module.module_id}`
}

function moduleRuntimeRefs(module) {
  return {
    json: projectRef(`runtime/growth-sales-automation/prompts/${module.module_id}.prompt.json`),
    md: projectRef(`runtime/growth-sales-automation/prompts/${module.module_id}.prompt.md`)
  }
}

function buildOutputSchema(module) {
  return {
    contract: module.outputs?.[0] || `${module.module_id}_output.v1`,
    module_id: module.module_id,
    generated_at: 'ISO-8601',
    input_refs: module.inputs || [],
    output_refs: module.outputs || [],
    evidence: [],
    assumptions: [],
    missing_fields: [],
    human_review_required: true,
    blocked_real_actions: module.hard_boundaries || [],
    next_routes: module.mapped_stage_ids || []
  }
}

function buildProductInputFramework(generatedAt) {
  return {
    contract: 'growth_sales_product_input_framework.v1',
    generated_at: generatedAt,
    purpose: '为未来新增产品建立统一输入页、AI分类、卖点提取、缺失项提示、市场评分和下游自动化读取框架。',
    current_sample_product: {
      product_id: 'qxkj-1035',
      product_name: 'Keystone Jack / Structured Cabling Component',
      product_family: 'structured_cabling',
      current_business_mode_guess: ['B2B wholesale', 'project procurement', 'OEM/private label'],
      product_page_status: 'draft_page_exists',
      page_artifact: 'cross-border-ecommerce-ai-route/runtime/product-page-confirmation/qxkj-1035/index.html',
      visual_brief: 'cross-border-ecommerce-ai-route/runtime/product-page-confirmation/qxkj-1035/product-visual-brief.json',
      known_strengths: [
        '适合结构化布线配套销售',
        '适合与配线架、面板、模块、工具组合成解决方案',
        '支持私标、数量阶梯报价和定制型号沟通'
      ],
      current_missing_items: [
        '第三方检测报告与证书状态',
        '完整材质、镀金厚度、端接方式、兼容线规等规格',
        'MOQ、阶梯价、样品政策、交期、包装信息',
        '目标市场认证差异，例如 CE/RoHS/UL/ETL 或当地准入',
        '真实产品多角度图、细节图、包装图、安装图'
      ]
    },
    intake_sections: [
      {
        section_id: 'identity',
        label: '产品身份',
        required: ['product_name', 'temporary_sku_or_model', 'product_family', 'source_type'],
        optional: ['brand_policy', 'factory_source', 'old_brand_to_remove', 'private_label_name']
      },
      {
        section_id: 'business_model',
        label: '销售模式判断',
        required: ['ai_sales_mode_suggestions', 'ai_order_type_suggestions', 'ai_buyer_type_suggestions'],
        optional: ['human_sales_mode_override', 'human_order_type_override', 'human_buyer_type_override', 'manual_rejection_reason'],
        manual_preselection_forbidden: true,
        decision_policy: 'AI先根据产品属性生成建议项，用户只能在建议后单选、多选、补充说明或驳回；不得在AI识别前强制人工手选。',
        options: {
          ai_sales_mode_suggestions: ['retail', 'wholesale', 'project_procurement', 'OEM_private_label', 'mixed_unknown'],
          ai_order_type_suggestions: ['spot_goods', 'made_to_order', 'custom_model', 'sample_then_bulk'],
          ai_buyer_type_suggestions: ['distributor', 'installer', 'system_integrator', 'brand_owner', 'retailer', 'project_procurement']
        }
      },
      {
        section_id: 'specs_materials',
        label: '规格材质',
        required: ['key_specs', 'materials', 'dimensions', 'compatibility', 'package_info'],
        category_rules: [
          '结构化布线类必须说明传输等级、端接方式、兼容线规、材质、阻燃等级或外壳材质。',
          '零售商品必须说明尺寸、材质、安全警示、包装规格、条码或平台类目。',
          '定制类产品必须说明可定制字段、MOQ、打样周期和确认样流程。'
        ]
      },
      {
        section_id: 'compliance_quality',
        label: '合规与质量证据',
        required: ['third_party_test_report_status', 'certificates', 'inspection_process', 'claims_allowed'],
        options: {
          third_party_test_report_status: ['available', 'pending', 'not_available', 'unknown'],
          claims_allowed: ['approved', 'draft_only', 'blocked_until_evidence']
        }
      },
      {
        section_id: 'market_content',
        label: '市场与内容',
        required: ['target_markets', 'target_languages', 'product_page_required', 'main_selling_points', 'comparison_basis'],
        options: {
          product_page_required: ['yes_generate', 'no_catalog_only', 'update_existing', 'unknown'],
          content_depth: ['simple_listing', 'technical_detail_page', 'solution_page', 'rfq_landing_page']
        }
      },
      {
        section_id: 'commercial_logistics',
        label: '价格物流',
        required: ['moq', 'price_tiers', 'lead_time', 'sample_policy', 'logistics_constraints', 'incoterms', 'currency', 'payment_terms', 'price_validity', 'packing_weight_volume'],
        optional: ['dangerous_goods_status', 'sample_fee', 'tooling_fee', 'warranty_terms', 'preferred_logistics_mode']
      },
      {
        section_id: 'assets',
        label: '图片文件',
        required: ['main_image_status', 'detail_images_status', 'source_files'],
        optional: ['upload_files', 'video_assets', 'reference_page', 'brand_label_assets']
      }
    ],
    minimum_foreign_trade_fields: [
      {
        field_id: 'hs_code_candidates',
        required_for: ['market_selection', 'tariff_check', 'quote_basis'],
        owner: 'AI_suggests_then_human_confirms',
        gate: 'blocked_for_formal_tariff_or_compliance_claim_until_confirmed'
      },
      {
        field_id: 'target_country_candidates',
        required_for: ['market_selection', 'source_coverage_gate', 'product_page_localization'],
        owner: 'AI_suggests_then_human_confirms',
        gate: 'market_ranking_blocked_until_source_coverage_passes'
      },
      {
        field_id: 'incoterms_currency_payment_terms',
        required_for: ['quote_draft', 'buyer_qualification'],
        owner: 'operator_or_price_book',
        gate: 'quote_send_blocked_until_confirmed'
      },
      {
        field_id: 'packing_weight_volume',
        required_for: ['logistics_comparison', 'landed_cost', 'product_page_specs'],
        owner: 'factory_or_operator',
        gate: 'logistics_recommendation_low_confidence_until_confirmed'
      },
      {
        field_id: 'claim_whitelist_blacklist',
        required_for: ['product_page_copy', 'compliance_claims', 'customer_ai_answers'],
        owner: 'operator_or_compliance_evidence',
        gate: 'certification_or_performance_claims_blocked_until_evidence'
      }
    ],
    ai_outputs: [
      'normalized_product_input.v1',
      'product_classification.v1',
      'product_category_profile_match.v1',
      'feature_selling_point_analysis.v1',
      'missing_content_prompt.v1',
      'market_fit_score.v1',
      'launch_readiness_verdict.v1',
      'product_page_requirement_decision.v1',
      'downstream_route_plan.v1',
      'quote_input_basis.v1',
      'logistics_basis.v1',
      'compliance_review_pack.v1'
    ],
    decision_rules: {
      rules_json: projectRef('runtime/growth-sales-automation/product-decision-desk/product-launch-decision-rules.json'),
      rules_md: projectRef('runtime/growth-sales-automation/product-decision-desk/product-launch-decision-rules.md'),
      verdicts: ['GO', 'CONDITIONAL', 'HOLD', 'BLOCKED'],
      category_profile_required_before_downstream: true
    },
    downstream_output_contracts: [
      'product_page_requirement.v1',
      'buyer_profile_pack.v1',
      'quote_input_basis.v1',
      'logistics_basis.v1',
      'compliance_review_pack.v1'
    ],
    scoring_dimensions: [
      { id: 'data_completeness', label: '资料完整度', weight: 0.2 },
      { id: 'category_fit', label: '品类描述匹配度', weight: 0.16 },
      { id: 'compliance_evidence', label: '合规证据', weight: 0.18 },
      { id: 'visual_readiness', label: '图像素材成熟度', weight: 0.14 },
      { id: 'commercial_readiness', label: '价格物流成熟度', weight: 0.16 },
      { id: 'market_demand_fit', label: '市场需求匹配度', weight: 0.16 }
    ],
    downstream_routes: [
      'gs_01_market_intelligence',
      'gs_02_smart_acquisition',
      'gs_03_ai_communication',
      'gs_04_quote_and_deal',
      'gs_05_after_sales_retention',
      'cbx_05_content_assets',
      'cbx_10_quote_engine'
    ],
    safety: {
      upload_is_local_preview_only: true,
      real_publish_allowed: false,
      real_external_action_allowed: false,
      ai_generated_claims_need_evidence: true
    }
  }
}

function buildProductLaunchDecisionRules(generatedAt) {
  return {
    contract: 'product_launch_decision_rules.v1',
    generated_at: generatedAt,
    purpose: '用最小改动方式补齐产品立项节点的专业外贸经理规则：先判断产品事实，再判断品类、销售模式、证据、市场、商业和下游可执行性。',
    implementation_mode: {
      change_scope: 'minimal_overlap_update',
      source_of_truth: [
        'scripts/build-growth-sales-automation-branch.mjs',
        'runtime/growth-sales-automation/product-input-framework.json',
        'runtime/growth-sales-automation/product-decision-desk/product-launch-decision-rules.json',
        'runtime/growth-sales-automation/dashboard/index.html'
      ],
      do_not_do_in_this_pass: [
        '不执行真实外部搜索',
        '不发布产品页',
        '不生成正式报价',
        '不进入真实获客或外联',
        '不重构产品详情页视觉资产'
      ]
    },
    node_layers: [
      {
        layer_id: 'fact_intake',
        label: '产品事实层',
        must_capture: [
          'product_identity',
          'model_or_sku',
          'use_case',
          'key_specs',
          'materials',
          'dimensions',
          'package_info',
          'factory_source',
          'asset_files',
          'certificate_or_test_report_status'
        ],
        output_contract: 'normalized_product_input.v1'
      },
      {
        layer_id: 'category_profile',
        label: '品类画像层',
        must_capture: [
          'category_candidates',
          'category_confidence',
          'category_required_fields',
          'category_specific_questions',
          'category_risk_fields'
        ],
        output_contract: 'product_category_profile_match.v1'
      },
      {
        layer_id: 'business_positioning',
        label: '商业定位层',
        must_capture: [
          'sales_model_recommendations',
          'buyer_roles',
          'order_type',
          'private_label_or_customization',
          'sample_to_bulk_path'
        ],
        output_contract: 'product_decision_pack.v1'
      },
      {
        layer_id: 'market_compliance',
        label: '市场与合规层',
        must_capture: [
          'target_country_candidates',
          'hs_code_candidates',
          'certification_claim_status',
          'claim_whitelist',
          'claim_blacklist',
          'source_coverage_gate'
        ],
        output_contract: 'market_search_pack.v1'
      },
      {
        layer_id: 'commercial_logistics',
        label: '报价与物流层',
        must_capture: [
          'moq',
          'price_tiers',
          'sample_policy',
          'lead_time',
          'incoterms',
          'currency',
          'payment_terms',
          'carton_dimensions',
          'net_gross_weight',
          'volume',
          'logistics_constraints'
        ],
        output_contract: 'quote_input_basis.v1'
      },
      {
        layer_id: 'downstream_routing',
        label: '下游执行层',
        must_capture: [
          'enabled_routes',
          'blocked_routes',
          'human_gates',
          'next_required_actions',
          'artifact_refs'
        ],
        output_contract: 'downstream_route_pack.v1'
      }
    ],
    decision_verdicts: [
      {
        verdict: 'GO',
        label: '可进入下游本地草案',
        meaning: '产品事实、品类、商业和证据足以进入本地产品页/市场搜索/客户画像草案，真实动作仍需人工门禁。',
        minimum_rules: [
          'product_page_readiness >= 75',
          'data_completeness >= 75',
          'commercial_readiness >= 70',
          'compliance_evidence >= 60',
          'no_blocking_source_gate_for_selected_scope'
        ],
        allowed_routes: [
          'product_page_draft',
          'market_search_plan',
          'customer_profile'
        ],
        blocked_routes_until_human_review: [
          'publish',
          'quote_send',
          'real_outreach'
        ]
      },
      {
        verdict: 'CONDITIONAL',
        label: '可做草案但禁止真实动作',
        meaning: '当前资料可以支持局部草案，但证据、报价、市场覆盖或素材不足以支撑发布、报价、外联。',
        minimum_rules: [
          'product_page_readiness >= 60',
          'category_fit >= 65',
          '至少一个下游本地草案路由可执行'
        ],
        required_next_actions: [
          '补齐证书/检测报告或声明为不可用',
          '补齐价格、MOQ、交期、包装和贸易条款',
          '补齐目标市场证据或通过数据源门禁',
          '补齐产品图片和文件资产清单'
        ]
      },
      {
        verdict: 'HOLD',
        label: '暂停进入下游，先补产品事实',
        meaning: '产品身份、关键规格、商业信息或素材不足，继续执行会产生低质量页面、无效报价或错误获客。',
        trigger_rules: [
          'data_completeness < 60',
          'category_fit < 60',
          'missing product_identity',
          'missing key_specs for detected category'
        ]
      },
      {
        verdict: 'BLOCKED',
        label: '阻断真实动作',
        meaning: '存在合规、认证、知识产权、敏感声明、数据源覆盖或外联审批阻断。',
        trigger_rules: [
          'certification_claim_without_evidence',
          'formal_tariff_or_hs_claim_without_review',
          'market_ranking_requested_but_source_gate_failed',
          'real_external_action_requested_without_human_approval'
        ]
      }
    ],
    category_profile_schema: {
      required_keys: [
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
      ],
      extension_rule: '新增品类时优先追加 category_profiles；只有独立输入或输出契约产生时才新增文件。'
    },
    category_profiles: [
      {
        category_id: 'structured_cabling',
        label: '结构化布线/弱电工程配件',
        required_fact_groups: ['传输等级', '屏蔽类型', '端接方式', '兼容线规', '材质', '镀金厚度', '阻燃等级', '包装数量'],
        category_specific_questions: [
          '传输等级是 Cat5e、Cat6、Cat6A 还是 Cat8？',
          'UTP/FTP/STP 屏蔽类型和端接角度是否明确？',
          '是否有 CE/RoHS/UL/ETL 或第三方测试报告？',
          '是否支持私标、颜色、包装和型号定制？'
        ],
        default_sales_models: ['B2B_wholesale', 'project_RFQ', 'OEM_private_label', 'distributor_development'],
        common_buyer_roles: ['distributor', 'installer', 'system_integrator', 'project_procurement'],
        compliance_focus: ['CE/RoHS/UL/ETL evidence', 'performance claim evidence', 'target-market access'],
        commercial_variables: ['MOQ', 'price_tiers', 'sample_policy', 'lead_time', 'carton_qty', 'net_gross_weight'],
        asset_requirements: ['完整主图', '端接细节图', '规格结构图', '包装图', '安装场景图', '私标区域图'],
        downstream_blockers: ['certificate_claim_without_evidence', 'packing_weight_volume_unknown', 'source_gate_failed_for_market_ranking']
      },
      {
        category_id: 'retail_consumer_product',
        label: '零售消费品',
        required_fact_groups: ['使用场景', '尺寸', '颜色', '材质', '安全警示', '包装', '条码/平台类目'],
        category_specific_questions: [
          '是否需要主图、场景图、卖点图和短视频？',
          '目标平台是否要求特定类目属性、条码或安全声明？'
        ],
        default_sales_models: ['retail_marketplace', 'independent_site_inquiry', 'sample_to_bulk'],
        common_buyer_roles: ['retailer', 'brand_owner', 'online_store_operator'],
        compliance_focus: ['consumer safety', 'labeling', 'returns and warranty'],
        commercial_variables: ['retail_packaging', 'MOQ', 'sample_fee', 'platform_margin', 'warranty_terms'],
        asset_requirements: ['白底主图', '场景图', '尺寸图', '包装图', '卖点图'],
        downstream_blockers: ['missing_safety_warning', 'missing_packaging_or_barcode', 'poor_visual_assets']
      },
      {
        category_id: 'industrial_component',
        label: '工业零部件/五金机电',
        required_fact_groups: ['材质', '尺寸公差', '适配设备', '加工工艺', '表面处理', '质检标准'],
        category_specific_questions: [
          '是否有图纸、样品或公差要求？',
          '是否支持按图定制和首件确认？'
        ],
        default_sales_models: ['B2B_wholesale', 'project_RFQ', 'custom_model', 'sample_to_bulk'],
        common_buyer_roles: ['manufacturer', 'maintenance_buyer', 'system_integrator', 'distributor'],
        compliance_focus: ['material evidence', 'inspection standard', 'customer drawing control'],
        commercial_variables: ['MOQ', 'tooling_fee', 'sample_fee', 'lead_time_by_quantity'],
        asset_requirements: ['多角度图', '尺寸图', '材质/表面细节图', '包装图'],
        downstream_blockers: ['missing_drawing_or_tolerance', 'missing_qc_standard']
      },
      {
        category_id: 'machinery_equipment',
        label: '机械设备/工具',
        required_fact_groups: ['功能', '功率/产能', '电压', '尺寸重量', '安全配置', '备件', '安装维护'],
        category_specific_questions: [
          '目标国家电压、认证和说明书语言是否明确？',
          '是否需要安装、培训、备件和售后条款？'
        ],
        default_sales_models: ['project_RFQ', 'distributor_development', 'solution_bundle_sales'],
        common_buyer_roles: ['factory_owner', 'project_procurement', 'maintenance_manager', 'distributor'],
        compliance_focus: ['CE or local safety', 'manual language', 'warranty and spare parts'],
        commercial_variables: ['machine_price', 'spare_parts', 'packing_crate', 'installation_cost', 'shipping_mode'],
        asset_requirements: ['整机图', '细节图', '运行场景图', '包装木箱图', '参数表'],
        downstream_blockers: ['missing_safety_evidence', 'missing_weight_volume', 'missing_after_sales_terms']
      },
      {
        category_id: 'custom_nonstandard_product',
        label: '非标定制/OEM/ODM',
        required_fact_groups: ['可定制字段', '打样周期', '确认样流程', '模具费', '验收标准', '变更流程'],
        category_specific_questions: [
          '客户需要提供图纸、样品还是参数？',
          '首样、确认样和量产验收如何流转？'
        ],
        default_sales_models: ['OEM_private_label', 'ODM_joint_development', 'project_RFQ', 'sample_to_bulk'],
        common_buyer_roles: ['brand_owner', 'product_manager', 'engineering_buyer', 'project_procurement'],
        compliance_focus: ['IP authorization', 'drawing/version control', 'claim whitelist'],
        commercial_variables: ['tooling_fee', 'sample_fee', 'MOQ', 'development_lead_time', 'revision_cost'],
        asset_requirements: ['参考图', '打样图', '确认样图', '包装与标签图'],
        downstream_blockers: ['missing_custom_scope', 'missing_ip_authorization', 'missing_sample_confirmation_flow']
      },
      {
        category_id: 'lighting_and_electrical',
        label: 'Lighting and electrical products',
        required_fact_groups: ['wattage', 'voltage', 'lumen_or_output', 'material', 'driver_or_power_supply', 'IP_rating', 'installation_method', 'certification_status'],
        category_specific_questions: [
          'What voltage, wattage, color temperature, and installation method are required?',
          'Which target market certificates are available or blocked, such as CE, RoHS, UL, ETL, FCC, SAA, or UKCA?',
          'Is the product sold as a project item, distributor item, retail SKU, or OEM/private-label item?'
        ],
        default_sales_models: ['B2B_wholesale', 'project_RFQ', 'distributor_development', 'OEM_private_label'],
        common_buyer_roles: ['lighting_distributor', 'project_contractor', 'electrical_wholesaler', 'brand_owner'],
        compliance_focus: ['electrical safety evidence', 'energy efficiency claim evidence', 'local voltage and plug/accessory compatibility'],
        commercial_variables: ['MOQ', 'price_tiers', 'sample_policy', 'lead_time', 'carton_qty', 'warranty_terms'],
        asset_requirements: ['lit_on_image', 'lit_off_image', 'installation_scene', 'dimension_diagram', 'packaging_and_label', 'certification_mark_zone'],
        downstream_blockers: ['missing_voltage_or_wattage', 'missing_electrical_safety_evidence', 'missing_lumen_or_ip_claim_evidence']
      },
      {
        category_id: 'apparel_and_textile',
        label: 'Apparel and textile products',
        required_fact_groups: ['fabric_composition', 'size_range', 'colorways', 'gsm_or_weight', 'care_label', 'packing_method', 'sample_policy'],
        category_specific_questions: [
          'What fabric composition, GSM, size range, colorways, and care label requirements apply?',
          'Is the order stock wholesale, private label, made-to-order, or custom pattern production?',
          'Are color fastness, shrinkage, azo-free, or other textile tests available?'
        ],
        default_sales_models: ['wholesale', 'OEM_private_label', 'sample_to_bulk', 'seasonal_collection'],
        common_buyer_roles: ['brand_owner', 'apparel_buyer', 'retailer', 'importer_distributor'],
        compliance_focus: ['fiber composition label', 'restricted substances', 'country-specific garment labeling', 'test report evidence'],
        commercial_variables: ['MOQ_by_color_size', 'sample_fee', 'bulk_lead_time', 'size_breakdown', 'packing_ratio'],
        asset_requirements: ['front_back_model_or_flatlay', 'fabric_closeup', 'size_chart', 'color_card', 'label_and_packaging'],
        downstream_blockers: ['missing_fabric_composition', 'missing_size_chart', 'missing_labeling_or_test_status']
      },
      {
        category_id: 'packaging_and_printing',
        label: 'Packaging and printing products',
        required_fact_groups: ['material', 'dimensions', 'printing_method', 'surface_finish', 'structure', 'artwork_format', 'food_contact_status'],
        category_specific_questions: [
          'What material, thickness, dimensions, structure, and surface finish are required?',
          'Does the buyer provide artwork, dieline, Pantone colors, or barcode placement requirements?',
          'Is food-contact, recycled material, FSC, or other evidence required for target markets?'
        ],
        default_sales_models: ['OEM_private_label', 'custom_printing', 'sample_to_bulk', 'B2B_wholesale'],
        common_buyer_roles: ['brand_owner', 'packaging_buyer', 'procurement_manager', 'retailer'],
        compliance_focus: ['food contact evidence', 'material claim evidence', 'recycling/FSC claim evidence', 'artwork approval'],
        commercial_variables: ['MOQ', 'printing_plate_fee', 'sample_fee', 'lead_time', 'carton_packing', 'artwork_revision_cost'],
        asset_requirements: ['dieline_or_structure_image', 'material_closeup', 'print_effect_sample', 'packaging_usage_scene', 'label_zone'],
        downstream_blockers: ['missing_dieline_or_dimensions', 'missing_artwork_authorization', 'missing_food_contact_or_material_claim_evidence']
      },
      {
        category_id: 'chemicals_and_materials',
        label: 'Chemicals and raw materials',
        required_fact_groups: ['chemical_name_or_material_grade', 'CAS_or_grade', 'purity_or_spec', 'packaging', 'MSDS_status', 'hazard_class', 'storage_conditions'],
        category_specific_questions: [
          'What CAS number, grade, purity, specification, and packaging are required?',
          'Is MSDS/SDS, COA, dangerous goods classification, or transport restriction available?',
          'Which countries or industries are targeted, and are there restricted-use claims?'
        ],
        default_sales_models: ['B2B_wholesale', 'distributor_development', 'project_RFQ', 'sample_to_bulk'],
        common_buyer_roles: ['chemical_distributor', 'factory_buyer', 'R&D_buyer', 'industrial_procurement'],
        compliance_focus: ['SDS/MSDS', 'COA', 'dangerous goods classification', 'restricted substance controls', 'customs and transport restrictions'],
        commercial_variables: ['MOQ', 'price_by_packing', 'sample_policy', 'shelf_life', 'storage_and_transport_cost'],
        asset_requirements: ['packing_image', 'label_image', 'COA_or_spec_table', 'SDS_reference', 'warehouse_or_application_scene'],
        downstream_blockers: ['missing_sds_or_hazard_status', 'missing_grade_or_purity', 'dangerous_goods_unknown']
      },
      {
        category_id: 'auto_parts',
        label: 'Auto parts and vehicle accessories',
        required_fact_groups: ['part_number', 'vehicle_compatibility', 'material', 'OE_or_aftermarket_status', 'installation_position', 'quality_standard', 'packing'],
        category_specific_questions: [
          'Which OE number, vehicle model/year, and installation position does the product fit?',
          'Is the product aftermarket, OEM/private label, or replacement-service oriented?',
          'Are IATF, ISO, DOT, E-mark, or product-specific test reports available?'
        ],
        default_sales_models: ['B2B_wholesale', 'distributor_development', 'OEM_private_label', 'replacement_parts_channel'],
        common_buyer_roles: ['auto_parts_distributor', 'repair_chain_buyer', 'importer', 'brand_owner'],
        compliance_focus: ['fitment evidence', 'safety/performance claim evidence', 'OE number accuracy', 'market-specific vehicle compliance'],
        commercial_variables: ['MOQ', 'price_tiers', 'packing_set', 'warranty_terms', 'sample_policy'],
        asset_requirements: ['multi_angle_part_image', 'fitment_or_position_diagram', 'dimension_image', 'packaging_image', 'label_and_part_number_image'],
        downstream_blockers: ['missing_fitment_or_part_number', 'safety_claim_without_evidence', 'missing_warranty_terms']
      },
      {
        category_id: 'home_goods',
        label: 'Home goods and household products',
        required_fact_groups: ['use_case', 'material', 'dimensions', 'colorways', 'packing', 'safety_or_food_contact_status', 'retail_or_wholesale_mode'],
        category_specific_questions: [
          'What material, size, color, packaging, and use scenario define the product?',
          'Is the item sold as retail SKU, gift set, wholesale pack, or private-label item?',
          'Are food-contact, child-safety, warning label, or material tests required?'
        ],
        default_sales_models: ['retail_marketplace', 'B2B_wholesale', 'OEM_private_label', 'gift_set_channel'],
        common_buyer_roles: ['retailer', 'home_goods_importer', 'brand_owner', 'ecommerce_operator'],
        compliance_focus: ['material claim evidence', 'food contact when applicable', 'warning labels', 'packaging and barcode'],
        commercial_variables: ['MOQ', 'color_mix', 'packing_qty', 'sample_fee', 'retail_margin'],
        asset_requirements: ['white_background_main', 'scene_lifestyle_image', 'size_diagram', 'material_detail', 'packaging_image'],
        downstream_blockers: ['missing_material_or_size', 'missing_safety_label_status', 'missing_retail_packaging']
      },
      {
        category_id: 'consumer_electronics',
        label: 'Consumer electronics and digital accessories',
        required_fact_groups: ['function', 'chip_or_core_component', 'power_input', 'battery_status', 'interface', 'compatibility', 'certification_status', 'packing'],
        category_specific_questions: [
          'What power input, interface, compatibility, chipset, battery, and warranty terms apply?',
          'Are CE, FCC, RoHS, UL, UKCA, PSE, KC, or battery transport documents available?',
          'Is the product retail boxed, wholesale bulk, OEM/private label, or accessory bundle?'
        ],
        default_sales_models: ['retail_marketplace', 'B2B_wholesale', 'OEM_private_label', 'distributor_development'],
        common_buyer_roles: ['electronics_distributor', 'brand_owner', 'ecommerce_operator', 'retailer'],
        compliance_focus: ['electrical safety', 'EMC/FCC/CE evidence', 'battery transport status', 'compatibility claims'],
        commercial_variables: ['MOQ', 'price_tiers', 'warranty_terms', 'sample_policy', 'packing_qty'],
        asset_requirements: ['main_product_image', 'interface_detail', 'usage_scene', 'compatibility_chart', 'packaging_and_label'],
        downstream_blockers: ['missing_certification_status', 'battery_status_unknown', 'compatibility_claim_without_evidence']
      },
      {
        category_id: 'machinery_and_tools',
        label: 'Machinery and tools',
        required_fact_groups: ['function', 'power_or_capacity', 'voltage_or_drive_type', 'material', 'dimensions_weight', 'safety_configuration', 'spare_parts', 'packing_method'],
        category_specific_questions: [
          'What capacity, voltage, dimensions, weight, packing method, and installation/operation requirements apply?',
          'Are manuals, spare parts, warranty, and after-sales terms ready for the target market?',
          'Which safety certifications or inspection records can be claimed?'
        ],
        default_sales_models: ['project_RFQ', 'B2B_wholesale', 'distributor_development', 'solution_bundle_sales'],
        common_buyer_roles: ['factory_owner', 'project_procurement', 'maintenance_manager', 'tool_distributor'],
        compliance_focus: ['machine safety evidence', 'manual language', 'warranty and spare parts', 'destination voltage compatibility'],
        commercial_variables: ['unit_price', 'spare_parts_cost', 'crate_packing', 'lead_time', 'shipping_mode'],
        asset_requirements: ['whole_machine_image', 'detail_image', 'operation_scene', 'packing_crate_image', 'parameter_table'],
        downstream_blockers: ['missing_safety_evidence', 'missing_weight_volume', 'missing_manual_or_after_sales_terms']
      },
      {
        category_id: 'private_label_custom_products',
        label: 'Private-label and custom products',
        required_fact_groups: ['custom_scope', 'reference_sample_or_drawing', 'brand_label_area', 'sample_approval_flow', 'tooling_or_setup_fee', 'revision_rules', 'IP_authorization'],
        category_specific_questions: [
          'What can be customized: logo, color, packaging, model, material, function, or full design?',
          'Does the buyer provide drawings, reference samples, artwork, or brand authorization?',
          'What is the sample approval, revision, and bulk-production acceptance process?'
        ],
        default_sales_models: ['OEM_private_label', 'ODM_joint_development', 'sample_to_bulk', 'project_RFQ'],
        common_buyer_roles: ['brand_owner', 'product_manager', 'private_label_buyer', 'project_procurement'],
        compliance_focus: ['IP authorization', 'artwork approval', 'claim whitelist', 'sample approval traceability'],
        commercial_variables: ['tooling_fee', 'sample_fee', 'MOQ', 'development_lead_time', 'revision_cost', 'packaging_cost'],
        asset_requirements: ['reference_image', 'sample_image', 'label_zone_image', 'packaging_mockup', 'approval_sample_image'],
        downstream_blockers: ['missing_custom_scope', 'missing_ip_authorization', 'missing_sample_confirmation_flow']
      }
    ],
    downstream_output_contracts: [
      {
        contract: 'product_page_requirement.v1',
        reader_modules: ['cbx_05_content_assets'],
        required_fields: ['product_identity', 'category_profile', 'approved_selling_points', 'claim_whitelist', 'claim_blacklist', 'asset_requirements', 'language_plan']
      },
      {
        contract: 'buyer_profile_pack.v1',
        reader_modules: ['gs_02_smart_acquisition', 'gs_03_ai_communication'],
        required_fields: ['sales_model', 'buyer_roles', 'region_channel_matrix', 'icp_fit_rules', 'blocked_outreach_reasons']
      },
      {
        contract: 'quote_input_basis.v1',
        reader_modules: ['gs_04_quote_and_deal', 'cbx_10_quote_engine'],
        required_fields: ['moq', 'price_tiers', 'currency', 'incoterms', 'payment_terms', 'lead_time', 'packing_weight_volume', 'price_validity']
      },
      {
        contract: 'logistics_basis.v1',
        reader_modules: ['cbx_12_order_fulfillment'],
        required_fields: ['carton_dimensions', 'net_gross_weight', 'volume', 'dangerous_goods_status', 'destination_candidates', 'shipping_mode_candidates']
      },
      {
        contract: 'compliance_review_pack.v1',
        reader_modules: ['cbx_02_product_compliance', 'cbx_13_customs_tax_fx'],
        required_fields: ['hs_code_candidates', 'target_country_candidates', 'certificate_refs', 'test_report_refs', 'claim_status', 'human_review_required']
      }
    ],
    universal_rules: [
      'AI必须先给建议，再允许人工选择或修正；不得要求用户在AI识别前手选品类和销售模式。',
      '所有认证、性能、关税、HS编码、目标国准入结论都必须带证据状态。',
      '数据源覆盖不足时输出 limitations 和 blocked_routes，不输出确定性市场排序。',
      '产品页草案可以本地生成，但发布、报价发送、客户外联、CRM写入、广告投放默认阻断。',
      '新增品类先补 category_profile，再补品类专属追问和下游输出字段。',
      '产品资料保存必须按 product_id 进入独立 inputs/outputs 目录，避免不同产品输出混写。'
    ],
    next_implementation_plan: [
      {
        step_id: 'pdd_min_01',
        label: '固化产品立项规则包',
        status: 'implemented_local_preview',
        output: 'product-launch-decision-rules.json/md'
      },
      {
        step_id: 'pdd_min_02',
        label: '控制台显示 GO/CONDITIONAL/HOLD/BLOCKED',
        status: 'implemented_local_preview',
        output: 'launch_readiness_verdict'
      },
      {
        step_id: 'pdd_min_03',
        label: '扩展下游输出契约边界',
        status: 'implemented_local_preview',
        output: 'downstream_output_contracts'
      },
      {
        step_id: 'pdd_next_01',
        label: '保存任意新增产品的独立立项包',
        status: 'implemented_local_preview',
        output: 'inputs/<product_id>/normalized-product-input.json + outputs/<product_id>/* complete launch package'
      },
      {
        step_id: 'pdd_next_02',
        label: '文件清单、PDF/图片/证书分类和产品图QA',
        status: 'next_pending',
        output: 'source-file-manifest.json + product_visual_brief.v1'
      },
      {
        step_id: 'pdd_next_03',
        label: '控制台按钮接入受控本地执行器',
        status: 'next_pending',
        output: 'local_save_request.v1 + run_event.v1'
      }
    ]
  }
}

function buildValidationStandards(module) {
  const base = [
    {
      metric_id: 'input_traceability',
      label: '输入来源可追溯',
      target: '所有输入字段必须保留来源、采集时间、操作者和可信度。',
      pass_rule: 'source/captured_at/operator/confidence 四项齐全，否则标记 missing_fields。'
    },
    {
      metric_id: 'output_contract_completeness',
      label: '输出契约完整',
      target: `必须生成 ${module.outputs.join('、')}。`,
      pass_rule: '所有 required output contracts 均有 summary、evidence、assumptions、next_routes。'
    },
    {
      metric_id: 'human_gate_visibility',
      label: '人工门禁显式化',
      target: `必须显示 ${module.human_gates.join('、') || 'none'}。`,
      pass_rule: '每个门禁都要有 pending/approved/rejected 状态。'
    },
    {
      metric_id: 'real_action_block',
      label: '真实动作阻断',
      target: '不得执行真实外部动作。',
      pass_rule: '结果中的 real_external_actions_executed 必须为 false。'
    }
  ]
  const specific = {
    demand_heat_analysis: [
      {
        metric_id: 'global_region_coverage',
        label: '全球区域覆盖',
        target: '至少覆盖 North America、EU/UK、Latin America、Middle East、Africa、ASEAN、East Asia、Oceania 8个区域。',
        pass_rule: '8/8 区域均有需求信号或明确标记 no_data；少于 8 个区域不得声明全球覆盖。'
      },
      {
        metric_id: 'source_cross_validation',
        label: '来源交叉验证',
        target: '每个高优先级市场至少两类来源交叉验证，例如贸易统计、搜索趋势、进口商样本、人工市场笔记。',
        pass_rule: '少于两类来源时 confidence 不得高于 medium。'
      },
      {
        metric_id: 'freshness_window',
        label: '时间新鲜度',
        target: '趋势与进口数据应标记最近更新时间。',
        pass_rule: '超过 180 天未更新的数据必须降权。'
      },
      {
        metric_id: 'current_limit_notice',
        label: '当前能力边界',
        target: '当前默认禁用外部平台，只能作为本地草案。',
        pass_rule: '必须明确写出“未接入只读连接器前，不足以覆盖全球所有区域”。'
      }
    ],
    competitor_price_monitoring: [
      {
        metric_id: 'comparable_sku_match',
        label: '可比SKU匹配',
        target: '竞品必须在规格、等级、材质、包装或销售模式上可比。',
        pass_rule: '缺少可比依据时只作为参考，不进入价格本。'
      },
      {
        metric_id: 'min_competitor_sample',
        label: '竞品样本量',
        target: '每个目标市场至少3个可比竞品或供应商样本。',
        pass_rule: '样本少于3时标记 low_confidence。'
      }
    ],
    blue_ocean_market_identification: [
      {
        metric_id: 'demand_supply_gap',
        label: '需求供给差',
        target: '必须同时有需求信号和竞争强度信号。',
        pass_rule: '只有需求无竞争数据时不得标记 blue_ocean。'
      }
    ],
    linkedin_ai_mining: [
      {
        metric_id: 'privacy_and_source_gate',
        label: '隐私与来源门禁',
        target: '不得自动抓取或外发。',
        pass_rule: '只允许生成搜索策略和人工导入字段。'
      }
    ],
    customs_data_mining: [
      {
        metric_id: 'hs_code_review',
        label: 'HS编码复核',
        target: '海关数据必须绑定经复核的HS候选。',
        pass_rule: 'HS未复核时只能输出候选，不得输出目标客户结论。'
      }
    ],
    lead_scoring_icp_frequency_volume: [
      {
        metric_id: 'score_explainability',
        label: '评分可解释',
        target: '每个分数必须拆成 ICP、频率、体量、证据、缺失字段。',
        pass_rule: '无解释不得进入优先队列。'
      }
    ],
    dynamic_quote_engine: [
      {
        metric_id: 'margin_floor_check',
        label: '毛利底线',
        target: '必须显示成本、汇率、运费、MOQ、毛利底线。',
        pass_rule: '缺任一项时报价草案必须 blocked。'
      }
    ],
    quote_document_generator: [
      {
        metric_id: 'draft_watermark',
        label: '草案水印',
        target: '所有报价文件必须为 draft，未经确认不得外发。',
        pass_rule: 'quote_send_allowed 必须为 false。'
      }
    ],
    order_tracking_visibility: [
      {
        metric_id: 'verified_tracking_source',
        label: '追踪来源验证',
        target: '生产、QC、物流状态必须来自已确认来源。',
        pass_rule: '未确认来源只能显示待确认。'
      }
    ],
    cross_sell_recommendation: [
      {
        metric_id: 'compatibility_check',
        label: '兼容性检查',
        target: '交叉推荐必须有兼容关系或组合逻辑。',
        pass_rule: '无兼容关系时不得生成组合报价建议。'
      }
    ]
  }
  return [...base, ...(specific[module.module_id] || [
    {
      metric_id: 'category_specific_review',
      label: '品类特异性复核',
      target: '必须说明该模块对当前品类的适配逻辑。',
      pass_rule: '未说明品类适配逻辑时进入人工复核。'
    }
  ])]
}

function buildTrialResult(modulePlan, productFramework) {
  const product = productFramework.current_sample_product
  const standards = modulePlan.validation_standards || []
  const failed = standards
    .filter((metric) => ['global_region_coverage', 'source_cross_validation', 'freshness_window', 'hs_code_review', 'min_competitor_sample'].includes(metric.metric_id))
    .map((metric) => metric.metric_id)
  const passed = standards.map((metric) => metric.metric_id).filter((metricId) => !failed.includes(metricId))
  return {
    contract: 'growth_sales_ai_module_trial_result.v1',
    generated_at: modulePlan.generated_at || 'ISO-8601',
    execution_mode: 'front_end_dry_run_preview',
    module_id: modulePlan.module_id,
    path_id: modulePlan.path_id,
    product_id: product.product_id,
    product_family: product.product_family,
    real_external_actions_executed: false,
    input_summary: {
      used_current_product_page: product.product_page_status === 'draft_page_exists',
      used_uploaded_files: false,
      source_refs: [product.page_artifact, product.visual_brief]
    },
    result_summary: `${modulePlan.module_label} 已基于当前样例产品生成本地试执行草案；外部平台和真实动作保持禁用。`,
    generated_outputs: modulePlan.output_contract.required.map((output) => ({
      contract: output,
      status: failed.length ? 'draft_low_confidence' : 'draft_ready',
      note: `${output} for ${product.product_id}`
    })),
    validation: {
      pass_count: passed.length,
      fail_count: failed.length,
      passed_metric_ids: passed,
      failed_metric_ids: failed,
      conclusion: failed.length
        ? '当前结果只能作为草案，需要补齐数据源、区域覆盖或人工复核后再进入下游。'
        : '当前草案满足本地试执行标准，可进入人工复核。'
    },
    missing_inputs: product.current_missing_items,
    next_actions: [
      '补齐产品规格、材质、认证和第三方检测报告状态',
      '补齐MOQ、阶梯价、样品政策、交期和包装物流信息',
      '如需真实市场结论，先开启经调试的只读数据连接器'
    ]
  }
}

function buildProductInputMarkdown(productFramework) {
  return `# 产品输入页框架

生成时间：${productFramework.generated_at}

## 目的

${productFramework.purpose}

## 当前样例产品

- 产品ID：\`${productFramework.current_sample_product.product_id}\`
- 产品名称：${productFramework.current_sample_product.product_name}
- 品类：\`${productFramework.current_sample_product.product_family}\`
- 当前产品页：\`${productFramework.current_sample_product.page_artifact}\`

## 输入分区

| 分区 | 必填字段 | 可选字段 |
| --- | --- | --- |
${productFramework.intake_sections.map((section) => (
  `| ${section.label} | ${section.required.map((item) => `\`${item}\``).join('<br>')} | ${(section.optional || []).map((item) => `\`${item}\``).join('<br>') || '-'} |`
)).join('\n')}

## AI输出

${productFramework.ai_outputs.map((output) => `- \`${output}\``).join('\n')}

## 产品立项决策规则

- 规则JSON：\`${productFramework.decision_rules.rules_json}\`
- 规则MD：\`${productFramework.decision_rules.rules_md}\`
- 决策状态：${productFramework.decision_rules.verdicts.map((item) => `\`${item}\``).join('、')}
- 下游前置：${productFramework.decision_rules.category_profile_required_before_downstream ? '必须先匹配品类画像' : '无需品类画像'}

## 下游输出契约

${productFramework.downstream_output_contracts.map((output) => `- \`${output}\``).join('\n')}

## 最小外贸字段

${(productFramework.minimum_foreign_trade_fields || []).map((item) => `- \`${item.field_id}\`：${item.gate}`).join('\n')}

## 评分维度

${productFramework.scoring_dimensions.map((item) => `- ${item.label}：${item.weight}`).join('\n')}
`
}

function buildProductLaunchDecisionRulesMarkdown(rules) {
  return `# 产品立项决策规则

生成时间：${rules.generated_at}

## 目标

${rules.purpose}

## 最小改动边界

- 改动模式：\`${rules.implementation_mode.change_scope}\`
- 源头文件：
${rules.implementation_mode.source_of_truth.map((item) => `  - \`${item}\``).join('\n')}
- 本轮不做：
${rules.implementation_mode.do_not_do_in_this_pass.map((item) => `  - ${item}`).join('\n')}

## 六层节点规则

| 层级 | 名称 | 必须采集 | 输出契约 |
| --- | --- | --- | --- |
${rules.node_layers.map((layer) => (
  `| \`${layer.layer_id}\` | ${layer.label} | ${layer.must_capture.map((item) => `\`${item}\``).join('<br>')} | \`${layer.output_contract}\` |`
)).join('\n')}

## 决策状态

| 状态 | 含义 | 关键规则 |
| --- | --- | --- |
${rules.decision_verdicts.map((verdict) => (
  `| \`${verdict.verdict}\` ${verdict.label} | ${verdict.meaning} | ${(verdict.minimum_rules || verdict.trigger_rules || []).map((item) => `\`${item}\``).join('<br>')} |`
)).join('\n')}

## 品类画像

| 品类 | 常用销售模式 | 常见买家 | 下游阻断 |
| --- | --- | --- | --- |
${rules.category_profiles.map((profile) => (
  `| \`${profile.category_id}\` ${profile.label} | ${profile.default_sales_models.map((item) => `\`${item}\``).join('<br>')} | ${profile.common_buyer_roles.map((item) => `\`${item}\``).join('<br>')} | ${profile.downstream_blockers.map((item) => `\`${item}\``).join('<br>')} |`
)).join('\n')}

## 下游输出契约

| 契约 | 读取模块 | 必填字段 |
| --- | --- | --- |
${rules.downstream_output_contracts.map((contract) => (
  `| \`${contract.contract}\` | ${contract.reader_modules.map((item) => `\`${item}\``).join('<br>')} | ${contract.required_fields.map((item) => `\`${item}\``).join('<br>')} |`
)).join('\n')}

## 通用硬规则

${rules.universal_rules.map((item) => `- ${item}`).join('\n')}

## 实现计划

| 步骤 | 状态 | 输出 |
| --- | --- | --- |
${rules.next_implementation_plan.map((item) => `| \`${item.step_id}\` ${item.label} | \`${item.status}\` | \`${item.output}\` |`).join('\n')}
`
}

function buildTrialResultMarkdown(result) {
  return `# ${result.module_id} 试执行结果

路径：\`${result.path_id}\`

产品：\`${result.product_id}\`

执行模式：\`${result.execution_mode}\`

真实外部动作：${result.real_external_actions_executed ? '已执行' : '未执行'}

## 结果摘要

${result.result_summary}

## 输出

${result.generated_outputs.map((output) => `- \`${output.contract}\`：${output.status}，${output.note}`).join('\n')}

## 验证

- 通过指标：${result.validation.pass_count}
- 未通过指标：${result.validation.fail_count}
- 结论：${result.validation.conclusion}

## 缺失输入

${result.missing_inputs.map((item) => `- ${item}`).join('\n')}

## 下一步

${result.next_actions.map((item) => `- ${item}`).join('\n')}
`
}

function buildModulePromptPack(phase, module, previousModule, nextModule, productFramework) {
  const refs = moduleRuntimeRefs(module)
  const pathId = modulePathId(phase, module)
  const functionDescription =
    `AI负责执行「${module.label}」路径：读取 ${module.inputs.join('、')}，在不触发真实外部动作的前提下，生成 ${module.outputs.join('、')}，并把结果路由到 ${module.mapped_stage_ids.join('、')}。`
  const systemPrompt = [
    `你是跨境电商增长销售自动化系统中的 ${module.label} AI执行代理。`,
    '你只能生成本地草案、分析、结构化输出和人工确认包。',
    '你不得登录外部平台、抓取受限数据、发送客户消息、发送报价、写入生产CRM、投放广告、订舱、报关、税务或外汇申报。',
    '你必须保留输入来源、证据、假设、缺失字段、人工门禁和下一步路由。',
    `当前路径ID：${pathId}。`
  ].join('\n')
  const userPromptTemplate = [
    `请执行路径：${pathId} / ${module.label}`,
    '',
    '【输入】',
    ...module.inputs.map((input) => `- ${input}: {{${input.replaceAll(' ', '_')}}}`),
    '',
    '【必须参考的边界】',
    ...module.hard_boundaries.map((boundary) => `- ${boundary}`),
    '',
    '【人工门禁】',
    ...module.human_gates.map((gate) => `- ${gate}`),
    '',
    '【输出要求】',
    ...module.outputs.map((output) => `- 生成 ${output}`),
    '',
    '【返回格式】',
    '请返回严格JSON，字段必须包含：contract、module_id、summary、inputs_used、outputs、evidence、assumptions、missing_fields、human_review_required、blocked_real_actions、next_routes。'
  ].join('\n')
  const qaPrompt = [
    `请复核 ${module.label} 的输出是否满足：`,
    ...module.outputs.map((output) => `- 已生成 ${output}`),
    ...module.hard_boundaries.map((boundary) => `- 未违反边界：${boundary}`),
    ...module.human_gates.map((gate) => `- 已标记人工门禁：${gate}`),
    '- 没有真实外发、真实报价、真实CRM写入、真实投放或真实履约动作。'
  ].join('\n')
  return {
    path_id: pathId,
    phase_id: phase.phase_id,
    phase_label: phase.label,
    module_id: module.module_id,
    module_label: module.label,
    coverage: module.coverage,
    current_status: module.current_status,
    ai_function_description: functionDescription,
    upstream: {
      previous_module_id: previousModule?.module_id || null,
      mapped_stage_ids: module.mapped_stage_ids || phase.mapped_stage_ids || [],
      required_inputs: module.inputs || [],
      source_software_refs: module.software_refs || []
    },
    downstream: {
      next_module_id: nextModule?.module_id || null,
      output_contracts: module.outputs || [],
      route_stage_ids: module.mapped_stage_ids || phase.mapped_stage_ids || [],
      human_gates: module.human_gates || []
    },
    input_contract: {
      required: module.inputs || [],
      optional: ['operator_notes', 'source_refs', 'existing_runtime_refs'],
      reject_if_missing: module.inputs || []
    },
    output_contract: {
      required: module.outputs || [],
      json_shape: buildOutputSchema(module),
      markdown_sections: ['Summary', 'Inputs Used', 'Outputs', 'Evidence', 'Assumptions', 'Missing Fields', 'Human Gates', 'Next Routes']
    },
    prompt_pack: {
      system_prompt: systemPrompt,
      user_prompt_template: userPromptTemplate,
      qa_prompt: qaPrompt
    },
    plan_steps: [
      '读取并校验输入字段',
      '整理证据、来源和缺失字段',
      '按硬边界生成本地草案或分析',
      '输出结构化JSON和人类可读Markdown',
      '生成人工确认项和下游路由',
      '阻断全部真实外部动作'
    ],
    automation_boundary: {
      allowed_now: ['local_draft_generation', 'analysis', 'human_review_pack', 'read_only_display'],
      blocked_by_default: [
        'external_login',
        'restricted_scraping',
        'customer_message_send',
        'quote_send',
        'crm_production_write',
        'ad_spend',
        'shipment_booking',
        'customs_tax_fx_filing'
      ],
      hard_boundaries: module.hard_boundaries || []
    },
    validation_standards: buildValidationStandards(module),
    trial_execution: {
      enabled: true,
      mode: 'front_end_dry_run_preview',
      input_framework: projectRef('runtime/growth-sales-automation/product-input-framework.json'),
      sample_result_json: projectRef(`runtime/growth-sales-automation/sample-runs/${module.module_id}.trial.json`),
      sample_result_md: projectRef(`runtime/growth-sales-automation/sample-runs/${module.module_id}.trial.md`),
      result_display: 'collapsible_in_dashboard',
      real_external_actions_allowed: false
    },
    artifacts: refs
  }
}

function buildAiImplementationPlan(branch, generatedAt, productInputFramework) {
  const modules = []
  for (const phase of branch.phases || []) {
    for (let index = 0; index < (phase.modules || []).length; index += 1) {
      const module = phase.modules[index]
      modules.push(buildModulePromptPack(
        phase,
        module,
        phase.modules[index - 1],
        phase.modules[index + 1],
        productInputFramework
      ))
    }
  }
  const modulesWithTrials = modules.map((modulePlan) => ({
    ...modulePlan,
    sample_trial_result: buildTrialResult({ ...modulePlan, generated_at: generatedAt }, productInputFramework)
  }))
  return {
    contract: 'growth_sales_ai_implementation_plan.v1',
    branch_id: branch.branch_id,
    label: `${branch.label} AI实现计划`,
    generated_at: generatedAt,
    display_mode: {
      human_dashboard: projectRef('runtime/growth-sales-automation/dashboard/index.html'),
      machine_json: projectRef('runtime/growth-sales-automation/ai-implementation-plan.json'),
      operator_markdown: projectRef('runtime/growth-sales-automation/ai-implementation-plan.md')
    },
    product_input_framework: {
      machine_json: projectRef('runtime/growth-sales-automation/product-input-framework.json'),
      operator_markdown: projectRef('runtime/growth-sales-automation/product-input-framework.md'),
      current_sample_product_id: productInputFramework.current_sample_product.product_id
    },
    global_input_contract: {
      accepted_formats: ['manual_json', 'manual_markdown', 'csv_import', 'runtime_refs'],
      required_metadata: ['source', 'captured_at', 'operator', 'confidence', 'review_status']
    },
    global_output_contract: {
      json_contract: 'growth_sales_ai_module_output.v1',
      markdown_contract: 'operator_review_note.v1',
      write_root: projectRef('runtime/growth-sales-automation/**')
    },
    modules: modulesWithTrials
  }
}

function attachAiPlanToBranch(branch, aiImplementationPlan) {
  const modulePlanById = new Map(aiImplementationPlan.modules.map((modulePlan) => [modulePlan.module_id, modulePlan]))
  return {
    ...branch,
    phases: (branch.phases || []).map((phase) => ({
      ...phase,
      modules: (phase.modules || []).map((module) => ({
        ...module,
        ai_function_spec: modulePlanById.get(module.module_id)
      }))
    })),
    ai_implementation_plan: aiImplementationPlan
  }
}

function buildModulePromptMarkdown(modulePlan) {
  return `# ${modulePlan.module_label} AI提示词

路径ID：\`${modulePlan.path_id}\`

## 功能描述

${modulePlan.ai_function_description}

## 输入

${modulePlan.input_contract.required.map((input) => `- \`${input}\``).join('\n')}

## 输出

${modulePlan.output_contract.required.map((output) => `- \`${output}\``).join('\n')}

## 上游

- 上一模块：${modulePlan.upstream.previous_module_id || '无'}
- 映射主流程：${modulePlan.upstream.mapped_stage_ids.map((stage) => `\`${stage}\``).join('、')}
- 软件引用：${modulePlan.upstream.source_software_refs.map((software) => `\`${software}\``).join('、') || '无'}

## 下游

- 下一模块：${modulePlan.downstream.next_module_id || '无'}
- 输出契约：${modulePlan.downstream.output_contracts.map((output) => `\`${output}\``).join('、')}
- 人工门禁：${modulePlan.downstream.human_gates.map((gate) => `\`${gate}\``).join('、')}

## System Prompt

\`\`\`text
${modulePlan.prompt_pack.system_prompt}
\`\`\`

## User Prompt Template

\`\`\`text
${modulePlan.prompt_pack.user_prompt_template}
\`\`\`

## QA Prompt

\`\`\`text
${modulePlan.prompt_pack.qa_prompt}
\`\`\`

## JSON输出形状

\`\`\`json
${JSON.stringify(modulePlan.output_contract.json_shape, null, 2)}
\`\`\`
`
}

function buildAiPlanMarkdown(aiImplementationPlan) {
  return `# ${aiImplementationPlan.label}

生成时间：${aiImplementationPlan.generated_at}

## 读取入口

- 人类查看网页：\`${aiImplementationPlan.display_mode.human_dashboard}\`
- 机器读取JSON：\`${aiImplementationPlan.display_mode.machine_json}\`
- 人类读取Markdown：\`${aiImplementationPlan.display_mode.operator_markdown}\`

## 全局输入规范

- 接收格式：${aiImplementationPlan.global_input_contract.accepted_formats.map((item) => `\`${item}\``).join('、')}
- 必填元数据：${aiImplementationPlan.global_input_contract.required_metadata.map((item) => `\`${item}\``).join('、')}

## 全局输出规范

- JSON契约：\`${aiImplementationPlan.global_output_contract.json_contract}\`
- Markdown契约：\`${aiImplementationPlan.global_output_contract.markdown_contract}\`
- 写入根目录：\`${aiImplementationPlan.global_output_contract.write_root}\`

## AI实现计划列表

| 路径 | AI功能 | 输入 | 输出 | 人工门禁 |
| --- | --- | --- | --- | --- |
${aiImplementationPlan.modules.map((modulePlan) => (
  `| \`${modulePlan.path_id}\` | ${modulePlan.module_label} | ${modulePlan.input_contract.required.map((input) => `\`${input}\``).join('<br>')} | ${modulePlan.output_contract.required.map((output) => `\`${output}\``).join('<br>')} | ${modulePlan.downstream.human_gates.map((gate) => `\`${gate}\``).join('<br>')} |`
)).join('\n')}
`
}

function writeAiImplementationArtifacts(aiImplementationPlan) {
  ensureDir(promptsDir)
  writeJson(aiPlanJsonPath, aiImplementationPlan)
  writeFileSync(aiPlanMdPath, buildAiPlanMarkdown(aiImplementationPlan), 'utf8')
  for (const modulePlan of aiImplementationPlan.modules) {
    writeJson(join(promptsDir, `${modulePlan.module_id}.prompt.json`), modulePlan)
    writeFileSync(join(promptsDir, `${modulePlan.module_id}.prompt.md`), buildModulePromptMarkdown(modulePlan), 'utf8')
  }
}

function writeProductInputArtifacts(productInputFramework) {
  writeJson(productInputJsonPath, productInputFramework)
  writeFileSync(productInputMdPath, buildProductInputMarkdown(productInputFramework), 'utf8')
}

function writeProductDecisionRulesArtifacts(productDecisionRules) {
  ensureDir(productDecisionDeskDir)
  writeJson(productDecisionDeskRulesPath, productDecisionRules)
  writeFileSync(productDecisionDeskRulesMdPath, buildProductLaunchDecisionRulesMarkdown(productDecisionRules), 'utf8')
}

function writeTrialResultArtifacts(aiImplementationPlan) {
  ensureDir(sampleRunsDir)
  for (const modulePlan of aiImplementationPlan.modules || []) {
    const result = modulePlan.sample_trial_result
    if (!result) continue
    writeJson(join(sampleRunsDir, `${modulePlan.module_id}.trial.json`), result)
    writeFileSync(join(sampleRunsDir, `${modulePlan.module_id}.trial.md`), buildTrialResultMarkdown(result), 'utf8')
  }
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function readOptionalJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function buildControlPack(template) {
  const generated_at = nowIso()
  const productInputFramework = buildProductInputFramework(generated_at)
  const productDecisionRules = buildProductLaunchDecisionRules(generated_at)
  const productDecisionDeskPlan = readJsonFile(productDecisionDeskPlanPath)
  const productDecisionDeskDataSources = readJsonFile(productDecisionDeskDataSourcePath)
  const productDecisionDeskSourceMatrix = readOptionalJsonFile(productDecisionDeskSourceMatrixPath)
  const productDecisionDeskGlobalRegionCoverage = readOptionalJsonFile(productDecisionDeskGlobalRegionCoveragePath)
  const productDecisionDeskConsoleAudit = readOptionalJsonFile(productDecisionDeskConsoleAuditPath)
  const productDecisionDeskDirectionRecord = readOptionalJsonFile(productDecisionDeskDirectionRecordPath)
  const productDecisionDeskRemainingCapabilityPlan = readOptionalJsonFile(productDecisionDeskRemainingCapabilityPlanPath)
  const productDecisionDeskCategoryCoverage = readOptionalJsonFile(productDecisionDeskCategoryCoveragePath)
  const productDecisionDeskCapabilityCReport = readOptionalJsonFile(productDecisionDeskCapabilityCReportPath)
  const productDecisionDeskRemainingExecutionReport = readOptionalJsonFile(productDecisionDeskRemainingExecutionReportPath)
  const productDecisionDeskDefectAssessment = readOptionalJsonFile(productDecisionDeskDefectAssessmentPath)
  const productDecisionDeskLatestSavedDecision = readOptionalJsonFile(productDecisionDeskLatestSavedDecisionPath)
  const productDecisionDeskFreeTrial = readOptionalJsonFile(productDecisionDeskFreeTrialPath)
  const productDecisionDeskFreeCoverageAudit = readOptionalJsonFile(productDecisionDeskFreeCoverageAuditPath)
  const promotionPlan = readOptionalJsonFile(promotionPlanPath)
  const channelSpecializedDesign = readOptionalJsonFile(channelSpecializedDesignPath)
  const autoReplyBotDesign = readOptionalJsonFile(autoReplyBotDesignPath)
  const socialConnectorRegistry = readOptionalJsonFile(socialConnectorRegistryPath)
  const socialConnectionStatus = readOptionalJsonFile(socialConnectionStatusPath)
  const promotionSocialValidationReport = readOptionalJsonFile(promotionSocialValidationReportPath)
  const growthExecutionStatusIndex = readOptionalJsonFile(growthExecutionStatusIndexPath)
  const aiImplementationPlan = buildAiImplementationPlan(template, generated_at, productInputFramework)
  const branchWithAiPlan = attachAiPlanToBranch(template, aiImplementationPlan)
  const summary = summarizeBranch(branchWithAiPlan)
  return {
    ...branchWithAiPlan,
    generated_at,
    summary,
    product_input_framework: productInputFramework,
    product_decision_desk: {
      execution_plan_json: projectRef('runtime/growth-sales-automation/product-decision-desk/execution-plan.json'),
      execution_plan_md: projectRef('runtime/growth-sales-automation/product-decision-desk/execution-plan.md'),
      data_source_registry: projectRef('runtime/growth-sales-automation/product-decision-desk/data-source-registry.json'),
      source_channel_matrix_json: projectRef('runtime/growth-sales-automation/product-decision-desk/source-channel-matrix.json'),
      source_channel_matrix_md: projectRef('runtime/growth-sales-automation/product-decision-desk/source-channel-matrix.md'),
      global_region_source_coverage_json: projectRef('runtime/growth-sales-automation/product-decision-desk/global-region-source-coverage.json'),
      global_region_source_coverage_md: projectRef('runtime/growth-sales-automation/product-decision-desk/global-region-source-coverage.md'),
      product_console_manager_audit_json: projectRef('runtime/growth-sales-automation/product-decision-desk/product-console-manager-audit.json'),
      product_console_manager_audit_md: projectRef('runtime/growth-sales-automation/product-decision-desk/product-console-manager-audit.md'),
      direction_record_json: projectRef('runtime/growth-sales-automation/product-decision-desk/current-direction-record.json'),
      direction_record_md: projectRef('runtime/growth-sales-automation/product-decision-desk/current-direction-record.md'),
      remaining_capability_execution_plan_json: projectRef('runtime/growth-sales-automation/product-decision-desk/remaining-capability-execution-plan.json'),
      remaining_capability_execution_plan_md: projectRef('runtime/growth-sales-automation/product-decision-desk/remaining-capability-execution-plan.md'),
      category_profile_coverage_report_json: projectRef('runtime/growth-sales-automation/product-decision-desk/category-profile-coverage-report.json'),
      category_profile_coverage_report_md: projectRef('runtime/growth-sales-automation/product-decision-desk/category-profile-coverage-report.md'),
      capability_c_execution_report_json: projectRef('runtime/growth-sales-automation/product-decision-desk/capability-c-execution-report.json'),
      capability_c_execution_report_md: projectRef('runtime/growth-sales-automation/product-decision-desk/capability-c-execution-report.md'),
      remaining_capabilities_execution_report_json: projectRef('runtime/growth-sales-automation/product-decision-desk/remaining-capabilities-execution-report.json'),
      remaining_capabilities_execution_report_md: projectRef('runtime/growth-sales-automation/product-decision-desk/remaining-capabilities-execution-report.md'),
      post_completion_defect_assessment_json: projectRef('runtime/growth-sales-automation/product-decision-desk/post-completion-defect-assessment.json'),
      post_completion_defect_assessment_md: projectRef('runtime/growth-sales-automation/product-decision-desk/post-completion-defect-assessment.md'),
      latest_saved_product_decision_json: projectRef('runtime/growth-sales-automation/product-decision-desk/latest-saved-product-decision.json'),
      product_launch_decision_rules_json: projectRef('runtime/growth-sales-automation/product-decision-desk/product-launch-decision-rules.json'),
      product_launch_decision_rules_md: projectRef('runtime/growth-sales-automation/product-decision-desk/product-launch-decision-rules.md'),
      latest_free_source_trial_json: projectRef('runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-trial.json'),
      latest_free_source_trial_md: projectRef('runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-trial.md'),
      latest_free_source_coverage_audit_json: projectRef('runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-coverage-audit.json'),
      latest_free_source_coverage_audit_md: projectRef('runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-coverage-audit.md'),
      readme: projectRef('runtime/growth-sales-automation/product-decision-desk/README.md'),
      future_product_inputs: projectRef('runtime/growth-sales-automation/product-decision-desk/inputs/<product_id>/normalized-product-input.json'),
      future_source_file_manifest: projectRef('runtime/growth-sales-automation/product-decision-desk/inputs/<product_id>/source-file-manifest.json'),
      future_dialogue_state: projectRef('runtime/growth-sales-automation/product-decision-desk/inputs/<product_id>/dialogue-state.json'),
      future_decision_outputs: projectRef('runtime/growth-sales-automation/product-decision-desk/outputs/<product_id>/decision-pack.json'),
      future_search_outputs: projectRef('runtime/growth-sales-automation/product-decision-desk/outputs/<product_id>/market-search-pack.json'),
      future_downstream_route_outputs: projectRef('runtime/growth-sales-automation/product-decision-desk/outputs/<product_id>/downstream-route-pack.json'),
      future_complete_package_outputs: {
        category_profile_match: projectRef('runtime/growth-sales-automation/product-decision-desk/outputs/<product_id>/category-profile-match.json'),
        product_page_requirement: projectRef('runtime/growth-sales-automation/product-decision-desk/outputs/<product_id>/product-page-requirement.json'),
        buyer_profile_pack: projectRef('runtime/growth-sales-automation/product-decision-desk/outputs/<product_id>/buyer-profile-pack.json'),
        quote_input_basis: projectRef('runtime/growth-sales-automation/product-decision-desk/outputs/<product_id>/quote-input-basis.json'),
        logistics_basis: projectRef('runtime/growth-sales-automation/product-decision-desk/outputs/<product_id>/logistics-basis.json'),
        compliance_review_pack: projectRef('runtime/growth-sales-automation/product-decision-desk/outputs/<product_id>/compliance-review-pack.json'),
        launch_readiness_verdict: projectRef('runtime/growth-sales-automation/product-decision-desk/outputs/<product_id>/launch-readiness-verdict.json'),
        capability_gap_report: projectRef('runtime/growth-sales-automation/product-decision-desk/outputs/<product_id>/capability-gap-report.json'),
        product_visual_brief: projectRef('runtime/growth-sales-automation/product-decision-desk/outputs/<product_id>/product-visual-brief.json'),
        asset_qa_report: projectRef('runtime/growth-sales-automation/product-decision-desk/outputs/<product_id>/asset-qa-report.json')
      },
      plan: productDecisionDeskPlan,
      data_sources: productDecisionDeskDataSources,
      source_channel_matrix: productDecisionDeskSourceMatrix,
      global_region_source_coverage: productDecisionDeskGlobalRegionCoverage,
      product_console_manager_audit: productDecisionDeskConsoleAudit,
      direction_record: productDecisionDeskDirectionRecord,
      remaining_capability_execution_plan: productDecisionDeskRemainingCapabilityPlan,
      category_profile_coverage_report: productDecisionDeskCategoryCoverage,
      capability_c_execution_report: productDecisionDeskCapabilityCReport,
      remaining_capabilities_execution_report: productDecisionDeskRemainingExecutionReport,
      post_completion_defect_assessment: productDecisionDeskDefectAssessment,
      latest_saved_product_decision: productDecisionDeskLatestSavedDecision,
      product_launch_decision_rules: productDecisionRules,
      latest_free_source_trial: productDecisionDeskFreeTrial,
      latest_free_source_coverage_audit: productDecisionDeskFreeCoverageAudit
    },
    promotion_social_automation: {
      execution_status_index_json: projectRef('runtime/growth-sales-automation/execution-status-index.json'),
      execution_status_index_md: projectRef('runtime/growth-sales-automation/execution-status-index.md'),
      promotion_plan_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/promotion-plan.json'),
      promotion_plan_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/promotion-plan.md'),
      channel_specialized_design_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/channel-specialized-design.json'),
      channel_specialized_design_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/channel-specialized-design.md'),
      auto_reply_bot_design_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/auto-reply-bot-design.json'),
      auto_reply_bot_design_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/auto-reply-bot-design.md'),
      social_connector_registry_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/social-connector-registry.json'),
      social_connector_registry_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/social-connector-registry.md'),
      connection_status_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/connection-status.json'),
      connection_status_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/connection-status.md'),
      validation_report_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/validation-report.json'),
      validation_report_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/validation-report.md'),
      execution_status_index: growthExecutionStatusIndex,
      promotion_plan: promotionPlan,
      channel_specialized_design: channelSpecializedDesign,
      auto_reply_bot_design: autoReplyBotDesign,
      social_connector_registry: socialConnectorRegistry,
      connection_status: socialConnectionStatus,
      validation_report: promotionSocialValidationReport
    },
    control_surface: {
      mode: 'read_only_dashboard',
      control_level: 'draft_only',
      dashboard: projectRef('runtime/growth-sales-automation/dashboard/index.html'),
      branch_control_pack: projectRef('runtime/growth-sales-automation/branch-control-pack.json'),
      allowed_local_actions_now: ['inspect_branch', 'filter_modules', 'inspect_product_decision_desk', 'inspect_latest_saved_product_decision', 'inspect_promotion_social_status', 'copy_regenerate_command'],
      disabled_until_manual_enable: [
        'dashboard_write_to_disk_without_local_executor',
        'external_platform_login',
        'lead_enrichment',
        'customer_message_send',
        'quote_send',
        'crm_production_write',
        'ad_spend',
        'shipment_booking',
        'customs_tax_fx_filing'
      ]
    },
    writeback_policy: {
      event_contracts: ['RawEvent', 'SemanticEvent', 'growth_sales_automation_branch_event.v1'],
      writeback_required: true,
      status_overlay_target: 'runtime/control-plane/status/current-status.json.branch_overlays',
      nebula_overlay_target: 'os-particle-projection.json.branch_overlays'
    }
  }
}

function escapeForScriptJson(value) {
  return JSON.stringify(value, null, 2).replace(/</g, '\\u003c')
}

function buildDashboardHtml(controlPack) {
  const dataJson = escapeForScriptJson(controlPack)
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI外贸增长销售自动化分支控制台</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7f8;
      --surface: #ffffff;
      --surface-2: #eef3f2;
      --ink: #1d2529;
      --muted: #5e6b70;
      --line: #d8e0df;
      --blue: #285c82;
      --teal: #0f766e;
      --gold: #9a6b16;
      --red: #a13d3d;
      --violet: #61558f;
      --shadow: 0 10px 28px rgba(31, 42, 47, 0.08);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: Inter, "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
      line-height: 1.55;
    }

    button,
    input,
    select {
      font: inherit;
    }

    .app {
      min-height: 100vh;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      border-bottom: 1px solid var(--line);
      background: rgba(245, 247, 248, 0.94);
      backdrop-filter: blur(10px);
    }

    .topbar-inner {
      width: min(1440px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 18px 0;
      display: grid;
      grid-template-columns: minmax(260px, 1fr) auto;
      gap: 18px;
      align-items: center;
    }

    .console-nav {
      width: min(1440px, calc(100vw - 32px));
      margin: 12px auto 0;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .console-nav .btn {
      background: #fff;
      min-height: 38px;
    }

    .console-nav .btn[aria-pressed="true"] {
      border-color: #244f70;
      background: #244f70;
      color: #fff;
    }

    .console-view {
      display: none;
    }

    body[data-view="overview"] .console-view[data-console-view="overview"],
    body[data-view="product"] .console-view[data-console-view="product"],
    body[data-view="modules"] .console-view[data-console-view="modules"],
    body[data-view="sources"] .console-view[data-console-view="sources"],
    body[data-view="sync"] .console-view[data-console-view="sync"] {
      display: block;
    }

    body[data-view="product"] .grid,
    body[data-view="modules"] .grid,
    body[data-view="sources"] .grid,
    body[data-view="sync"] .grid {
      grid-template-columns: 1fr;
    }

    body[data-view="product"] .side-column,
    body[data-view="modules"] .side-column,
    body[data-view="sources"] .side-column {
      display: none;
    }

    body[data-view="sync"] .main-column {
      display: none;
    }

    h1,
    h2,
    h3,
    p {
      margin: 0;
    }

    h1 {
      font-size: 22px;
      font-weight: 760;
      letter-spacing: 0;
    }

    .subtitle {
      color: var(--muted);
      margin-top: 4px;
      font-size: 13px;
    }

    .muted {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.55;
    }

    .summary-strip {
      display: grid;
      grid-template-columns: repeat(5, minmax(96px, 1fr));
      gap: 8px;
      min-width: min(720px, 100%);
    }

    .metric {
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 8px;
      padding: 10px 12px;
      min-height: 58px;
    }

    .metric strong {
      display: block;
      font-size: 20px;
      line-height: 1;
    }

    .metric span {
      display: block;
      margin-top: 7px;
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }

    main {
      width: min(1440px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 22px 0 42px;
    }

    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 18px;
      align-items: start;
    }

    .panel {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }

    .panel-header {
      padding: 16px 18px 12px;
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }

    .panel-header h2 {
      font-size: 16px;
      font-weight: 760;
    }

    .panel-body {
      padding: 16px 18px 18px;
    }

    .status-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }

    .status-cell {
      border-left: 4px solid var(--teal);
      background: var(--surface-2);
      border-radius: 8px;
      padding: 12px;
      min-height: 92px;
    }

    .status-cell:nth-child(2) {
      border-color: var(--gold);
    }

    .status-cell:nth-child(3) {
      border-color: var(--red);
    }

    .status-cell:nth-child(4) {
      border-color: var(--blue);
    }

    .status-cell strong {
      display: block;
      font-size: 14px;
      margin-bottom: 6px;
    }

    .status-cell p {
      color: var(--muted);
      font-size: 13px;
    }

    .filters {
      display: grid;
      grid-template-columns: minmax(180px, 1.6fr) repeat(3, minmax(136px, 1fr));
      gap: 10px;
      margin-top: 14px;
    }

    .section-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
    }

    .section-tabs a {
      text-decoration: none;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px 11px;
      min-height: 38px;
      background: #fff;
      color: var(--ink);
      font-size: 13px;
    }

    .product-workbench {
      display: grid;
      gap: 16px;
    }

    .product-focus-grid {
      display: grid;
      grid-template-columns: minmax(420px, 1.35fr) minmax(280px, 0.75fr);
      gap: 14px;
      align-items: start;
    }

    .product-zone {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 14px;
      display: grid;
      gap: 12px;
      min-width: 0;
    }

    .product-zone-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 10px;
    }

    .product-zone-title {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .product-zone-title h3 {
      margin: 0;
      font-size: 16px;
      line-height: 1.35;
    }

    .product-zone-title span {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }

    .product-status-card {
      position: sticky;
      top: 86px;
    }

    .product-status-summary {
      display: grid;
      gap: 9px;
    }

    .launch-verdict {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      display: grid;
      gap: 7px;
      background: #f8fbfa;
    }

    .launch-verdict[data-verdict="GO"] {
      border-color: #a6d5b7;
      background: #eef8f1;
    }

    .launch-verdict[data-verdict="CONDITIONAL"] {
      border-color: #e2cf97;
      background: #fff8e6;
    }

    .launch-verdict[data-verdict="HOLD"],
    .launch-verdict[data-verdict="BLOCKED"] {
      border-color: #efc1c1;
      background: #fff1f1;
    }

    .launch-verdict strong {
      font-size: 18px;
      line-height: 1.25;
    }

    .launch-verdict span,
    .launch-verdict small {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }

    .status-line {
      display: grid;
      grid-template-columns: 104px minmax(0, 1fr);
      gap: 10px;
      align-items: start;
      font-size: 13px;
    }

    .status-line span:first-child {
      color: var(--muted);
    }

    .status-line strong {
      color: #263136;
      line-height: 1.45;
      word-break: break-word;
    }

    .status-chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .status-chip {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 12px;
      color: #344147;
      background: #f8fbfa;
    }

    .status-chip[data-status="ready"] {
      border-color: #b9d8ca;
      background: #eef8f1;
      color: #23633f;
    }

    .status-chip[data-status="needs"] {
      border-color: #edd5a5;
      background: #fff8e7;
      color: #745318;
    }

    .status-chip[data-status="blocked"] {
      border-color: #efc1c1;
      background: #fff1f1;
      color: #873232;
    }

    .product-action-panel {
      display: grid;
      gap: 8px;
      border-top: 1px solid var(--line);
      padding-top: 12px;
    }

    .product-action-panel .btn {
      justify-content: center;
    }

    .product-missing-summary {
      display: grid;
      gap: 7px;
    }

    .product-missing-summary .decision-list-item {
      background: #fffaf0;
      border-color: #ead6a7;
    }

    .product-result-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      align-items: start;
    }

    .product-result-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 14px;
      display: grid;
      gap: 12px;
      min-width: 0;
    }

    .product-result-card h3 {
      margin: 0;
      font-size: 15px;
      line-height: 1.35;
    }

    .product-result-card > p {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }

    .product-result-card.wide {
      grid-column: 1 / -1;
    }

    .route-status {
      display: inline-flex;
      width: fit-content;
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 12px;
      border: 1px solid var(--line);
      color: #344147;
      background: #f8fbfa;
    }

    .route-status[data-status="ready"] {
      border-color: #b9d8ca;
      background: #eef8f1;
      color: #23633f;
    }

    .route-status[data-status="needs"] {
      border-color: #edd5a5;
      background: #fff8e7;
      color: #745318;
    }

    .route-status[data-status="blocked"] {
      border-color: #efc1c1;
      background: #fff1f1;
      color: #873232;
    }

    .technical-details > summary {
      background: #fbfcfc;
    }

    .decision-desk-hero {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.8fr);
      gap: 14px;
      align-items: start;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      background: #f8fbfa;
    }

    .decision-desk-hero h3 {
      margin: 0 0 8px;
      font-size: 18px;
    }

    .decision-desk-hero p {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.55;
    }

    .decision-desk-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .decision-desk-meta div {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 10px;
      min-height: 70px;
    }

    .decision-desk-meta strong {
      display: block;
      font-size: 18px;
    }

    .decision-desk-meta span {
      color: var(--muted);
      font-size: 12px;
    }

    .decision-desk-grid {
      display: grid;
      grid-template-columns: minmax(280px, 0.95fr) minmax(0, 1.35fr);
      gap: 14px;
      align-items: start;
    }

    .decision-stack {
      display: grid;
      gap: 12px;
    }

    .decision-panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 13px;
      display: grid;
      gap: 11px;
    }

    .decision-panel h3 {
      margin: 0;
      font-size: 15px;
    }

    .decision-panel p {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .decision-list {
      display: grid;
      gap: 8px;
    }

    .decision-list-item {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: #f8fbfa;
      display: grid;
      gap: 5px;
      font-size: 13px;
    }

    .decision-list-item strong {
      font-size: 13px;
      color: #263136;
    }

    .decision-list-item span,
    .decision-list-item small {
      color: var(--muted);
      line-height: 1.45;
    }

    .decision-toggle-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .source-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .source-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: #fff;
      display: grid;
      gap: 6px;
      min-height: 128px;
    }

    .source-card[data-enabled="false"] {
      background: #fbfcfc;
    }

    .source-card strong {
      font-size: 13px;
    }

    .source-card small {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }

    .source-matrix-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }

    .source-matrix-table th,
    .source-matrix-table td {
      border-bottom: 1px solid var(--line);
      padding: 8px;
      text-align: left;
      vertical-align: top;
    }

    .source-matrix-table th {
      background: #f7faf9;
      color: #344147;
      font-weight: 700;
    }

    .source-matrix-table tr:last-child td {
      border-bottom: 0;
    }

    .output-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 10px;
    }

    .output-tabs button[aria-pressed="true"] {
      border-color: var(--teal);
      color: var(--teal);
      background: rgba(15, 118, 110, 0.08);
    }

    .recommendation-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .recommendation-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 11px;
      background: #fff;
      display: grid;
      gap: 7px;
      min-height: 116px;
    }

    .recommendation-card[data-selected="true"] {
      border-color: var(--teal);
      box-shadow: inset 0 0 0 1px rgba(21, 113, 101, 0.35);
      background: #f7fbfa;
    }

    .recommendation-card strong {
      display: block;
      font-size: 14px;
    }

    .recommendation-card small,
    .recommendation-card span {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }

    .module-overview-toolbar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      margin-bottom: 12px;
    }

    .module-index-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .module-index-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fff;
      display: grid;
      gap: 8px;
      min-height: 156px;
    }

    .module-index-card h3 {
      margin: 0;
      font-size: 15px;
    }

    .module-index-card p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .module-index-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: auto;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .collapse-block {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      overflow: hidden;
    }

    .collapse-block + .collapse-block {
      margin-top: 12px;
    }

    .collapse-block > summary {
      cursor: pointer;
      list-style: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      background: #f7faf9;
      border-bottom: 1px solid var(--line);
    }

    .summary-title {
      display: grid;
      gap: 3px;
    }

    .summary-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
    }

    .collapse-block > summary::-webkit-details-marker {
      display: none;
    }

    .collapse-block > summary strong {
      font-size: 14px;
    }

    .collapse-block > summary span {
      color: var(--muted);
      font-size: 12px;
    }

    .collapse-body {
      display: grid;
      gap: 12px;
      padding: 14px;
    }

    .icon-btn {
      width: 36px;
      height: 36px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      color: #334047;
      display: inline-grid;
      place-items: center;
      cursor: pointer;
      flex: 0 0 auto;
    }

    .icon-btn:hover,
    .icon-btn:focus-visible {
      border-color: var(--blue);
      outline: none;
    }

    .icon-btn svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
    }

    .sr-only-field {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .product-chat-shell {
      display: grid;
      gap: 12px;
    }

    .product-chat-log {
      display: grid;
      gap: 10px;
      max-height: 430px;
      overflow: auto;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f8fbfa;
    }

    .chat-message {
      max-width: min(760px, 92%);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 12px;
      background: #fff;
      display: grid;
      gap: 5px;
      font-size: 13px;
    }

    .chat-message[data-role="user"] {
      justify-self: end;
      border-color: #b8d2ce;
      background: #f1faf8;
    }

    .chat-message strong {
      font-size: 12px;
      color: #344147;
    }

    .chat-message span {
      color: var(--muted);
      white-space: pre-wrap;
    }

    .chat-composer {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 10px;
      display: grid;
      gap: 9px;
    }

    .chat-composer textarea {
      width: 100%;
      min-height: 118px;
      border: 0;
      resize: vertical;
      outline: none;
      color: var(--ink);
      font: inherit;
      line-height: 1.5;
    }

    .chat-composer-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
      border-top: 1px solid var(--line);
      padding-top: 9px;
    }

    .chat-action-group {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .file-summary {
      color: var(--muted);
      font-size: 12px;
      min-height: 18px;
    }

    .product-settings-panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfc;
      padding: 12px;
      display: grid;
      gap: 12px;
    }

    .product-settings-panel[hidden] {
      display: none;
    }

    .settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .check-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .check-row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 9px 10px;
      color: #344147;
      font-size: 13px;
    }

    .field textarea {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 11px;
      min-height: 118px;
      resize: vertical;
      background: #fff;
      color: var(--ink);
      width: 100%;
    }

    .file-box {
      display: grid;
      gap: 8px;
      border: 1px dashed #c9d3d2;
      border-radius: 8px;
      padding: 12px;
      background: #f8fbfa;
    }

    .score-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .score-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: #fff;
      min-height: 90px;
    }

    .score-card strong {
      display: block;
      font-size: 18px;
      margin-bottom: 5px;
    }

    .score-card span {
      color: var(--muted);
      font-size: 12px;
    }

    .result-json {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 360px;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f8fbfa;
      padding: 12px;
      color: #334047;
      font-family: "Cascadia Mono", Consolas, monospace;
      font-size: 12px;
      line-height: 1.45;
    }

    .field {
      display: grid;
      gap: 6px;
    }

    .field.full {
      grid-column: 1 / -1;
    }

    .field label {
      color: var(--muted);
      font-size: 12px;
    }

    .field input,
    .field select {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 11px;
      background: #fff;
      color: var(--ink);
      min-height: 42px;
      width: 100%;
    }

    .phase-list {
      display: grid;
      gap: 14px;
    }

    .phase {
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
    }

    .phase-title {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      padding: 14px 16px;
      background: #f7faf9;
      border-bottom: 1px solid var(--line);
    }

    .phase-title h3 {
      font-size: 15px;
      font-weight: 760;
    }

    .stage-links {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: flex-end;
    }

    .pill,
    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 12px;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--muted);
      white-space: nowrap;
    }

    .badge.covered {
      border-color: rgba(15, 118, 110, 0.28);
      color: var(--teal);
      background: rgba(15, 118, 110, 0.08);
    }

    .badge.partial {
      border-color: rgba(154, 107, 22, 0.3);
      color: var(--gold);
      background: rgba(154, 107, 22, 0.09);
    }

    .badge.new_module {
      border-color: rgba(40, 92, 130, 0.3);
      color: var(--blue);
      background: rgba(40, 92, 130, 0.09);
    }

    .module-list {
      display: grid;
      gap: 0;
    }

    .module {
      display: grid;
      grid-template-columns: minmax(180px, 0.8fr) minmax(260px, 1.3fr) minmax(240px, 1fr);
      gap: 14px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      align-items: start;
    }

    .module:last-child {
      border-bottom: 0;
    }

    .module h4 {
      margin: 8px 0 6px;
      font-size: 15px;
      line-height: 1.35;
    }

    .module small {
      color: var(--muted);
      display: block;
      font-size: 12px;
    }

    .kv {
      display: grid;
      gap: 9px;
      font-size: 13px;
    }

    .kv strong {
      display: block;
      font-size: 12px;
      color: #344147;
      margin-bottom: 2px;
    }

    .kv span {
      color: var(--muted);
    }

    .software-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .action-row {
      display: grid;
      gap: 8px;
    }

    .disabled-action {
      border: 1px dashed #c9d3d2;
      border-radius: 8px;
      padding: 10px;
      background: #f8fbfa;
      color: var(--muted);
      font-size: 13px;
    }

    .plan-list {
      display: grid;
      gap: 12px;
    }

    .tree-phase,
    .tree-node {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      overflow: hidden;
      scroll-margin-top: 20px;
    }

    .tree-phase > summary,
    .tree-node > summary {
      cursor: pointer;
      display: grid;
      grid-template-columns: minmax(190px, 0.6fr) minmax(260px, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 13px 14px;
      background: #f7faf9;
      border-bottom: 1px solid var(--line);
      list-style: none;
    }

    .tree-phase > summary::-webkit-details-marker,
    .tree-node > summary::-webkit-details-marker {
      display: none;
    }

    .tree-children {
      display: grid;
      gap: 12px;
      padding: 12px;
      background: #fbfcfc;
    }

    .tree-node > summary {
      background: #fff;
    }

    .tree-title {
      display: grid;
      gap: 5px;
    }

    .tree-title strong {
      font-size: 14px;
    }

    .tree-title small {
      color: var(--muted);
      font-size: 12px;
    }

    .plan-item {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      overflow: hidden;
    }

    .plan-head {
      display: grid;
      grid-template-columns: minmax(180px, 0.55fr) minmax(260px, 1fr) auto;
      gap: 12px;
      align-items: start;
      padding: 13px 14px;
      background: #f7faf9;
      border-bottom: 1px solid var(--line);
    }

    .plan-head h3 {
      font-size: 14px;
      line-height: 1.35;
      margin: 5px 0 0;
    }

    .plan-body {
      display: grid;
      grid-template-columns: minmax(240px, 1fr) minmax(240px, 1fr);
      gap: 12px;
      padding: 14px;
    }

    .plan-box {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 11px;
      background: #fbfcfc;
      min-height: 120px;
    }

    .plan-box strong {
      display: block;
      font-size: 12px;
      margin-bottom: 7px;
      color: #344147;
    }

    .plan-box ul {
      margin: 0;
      padding-left: 18px;
      color: var(--muted);
      font-size: 13px;
    }

    .prompt-block {
      grid-column: 1 / -1;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f8fbfa;
      overflow: hidden;
    }

    .prompt-block summary {
      cursor: pointer;
      padding: 11px 12px;
      font-size: 13px;
      color: #344147;
      border-bottom: 1px solid var(--line);
    }

    .prompt-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      padding: 12px;
    }

    .prompt-grid pre {
      margin: 0;
      min-height: 180px;
      max-height: 280px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 10px;
      color: #334047;
      font-family: "Cascadia Mono", Consolas, monospace;
      font-size: 12px;
      line-height: 1.45;
    }

    .artifact-row {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-top: 8px;
    }

    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    .btn {
      border: 1px solid var(--line);
      border-radius: 8px;
      min-height: 38px;
      padding: 8px 11px;
      background: #fff;
      color: var(--ink);
      cursor: pointer;
    }

    .btn:disabled {
      cursor: not-allowed;
      color: #9aa5a8;
      background: #f1f4f4;
    }

    .btn.primary {
      border-color: rgba(15, 118, 110, 0.28);
      color: var(--teal);
      background: rgba(15, 118, 110, 0.07);
    }

    .timeline {
      display: grid;
      gap: 10px;
    }

    .step {
      display: grid;
      grid-template-columns: 64px 1fr;
      gap: 10px;
      align-items: start;
      padding: 12px 0;
      border-bottom: 1px solid var(--line);
    }

    .step:last-child {
      border-bottom: 0;
    }

    .step-code {
      font-size: 12px;
      color: var(--muted);
      padding-top: 2px;
    }

    .step h3 {
      font-size: 14px;
      line-height: 1.35;
      margin-bottom: 5px;
    }

    .step p,
    .software-row p,
    .sync p {
      color: var(--muted);
      font-size: 13px;
    }

    .software-table {
      display: grid;
      gap: 8px;
    }

    .software-row {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: #fff;
    }

    .software-row strong {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 13px;
      margin-bottom: 4px;
    }

    .sync {
      display: grid;
      gap: 9px;
    }

    code {
      display: inline-block;
      max-width: 100%;
      overflow-wrap: anywhere;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 2px 5px;
      background: #f7faf9;
      color: #334047;
      font-family: "Cascadia Mono", Consolas, monospace;
      font-size: 12px;
    }

    .empty {
      border: 1px dashed var(--line);
      border-radius: 8px;
      padding: 18px;
      color: var(--muted);
      background: #fbfcfc;
    }

    @media (max-width: 1100px) {
      .topbar-inner,
      main,
      .grid {
        width: min(100vw - 22px, 980px);
      }

      .topbar-inner,
      .grid {
        grid-template-columns: 1fr;
      }

      .summary-strip,
      .status-grid,
      .filters {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .module {
        grid-template-columns: 1fr;
      }

      .plan-head,
      .plan-body,
      .prompt-grid,
      .form-grid,
      .decision-desk-hero,
      .decision-desk-grid,
      .decision-desk-meta,
      .product-focus-grid,
      .product-result-grid,
      .recommendation-grid,
      .module-index-grid,
      .source-grid,
      .score-grid,
      .tree-phase > summary,
      .tree-node > summary {
        grid-template-columns: 1fr;
      }

      .product-status-card {
        position: static;
      }
    }

    @media (max-width: 640px) {
      .topbar-inner,
      main {
        width: min(100vw - 18px, 620px);
      }

      .summary-strip,
      .status-grid,
      .decision-desk-meta,
      .product-focus-grid,
      .product-result-grid,
      .recommendation-grid,
      .module-index-grid,
      .source-grid,
      .filters {
        grid-template-columns: 1fr;
      }

      .phase-title {
        display: grid;
      }

      .stage-links {
        justify-content: flex-start;
      }
    }
  </style>
</head>
<body data-view="overview">
  <script id="branch-data" type="application/json">${dataJson}</script>
  <div class="app">
    <header class="topbar">
      <div class="topbar-inner">
        <div>
          <h1 id="page-title">AI外贸增长销售自动化分支控制台</h1>
          <p class="subtitle" id="page-subtitle">读取中</p>
        </div>
        <div class="summary-strip" id="summary-strip"></div>
      </div>
    </header>

    <nav class="console-nav" aria-label="控制台工作区">
      <button class="btn" type="button" data-console-tab="overview" aria-pressed="true">总览</button>
      <button class="btn" type="button" data-console-tab="product" aria-pressed="false">产品立项</button>
      <button class="btn" type="button" data-console-tab="modules" aria-pressed="false">模块计划</button>
      <button class="btn" type="button" data-console-tab="sources" aria-pressed="false">数据源门禁</button>
      <button class="btn" type="button" data-console-tab="sync" aria-pressed="false">系统同步</button>
    </nav>

    <main>
      <section class="grid">
        <div class="main-column">
          <section class="panel console-view" data-console-view="overview">
            <div class="panel-header">
              <h2>运行边界与功能匹配</h2>
              <span class="badge partial" id="match-count">0 modules</span>
            </div>
            <div class="panel-body">
              <div class="status-grid" id="status-grid"></div>
              <div class="filters">
                <div class="field">
                  <label for="query">查询模块、输入、输出、软件、门禁</label>
                  <input id="query" type="search" placeholder="例如 LinkedIn、报价、复购、UN Comtrade、RFQ" />
                </div>
                <div class="field">
                  <label for="phase-filter">阶段</label>
                  <select id="phase-filter"></select>
                </div>
                <div class="field">
                  <label for="coverage-filter">覆盖状态</label>
                  <select id="coverage-filter">
                    <option value="all">全部</option>
                    <option value="covered">已覆盖</option>
                    <option value="partial">部分覆盖</option>
                    <option value="new_module">新增模块</option>
                  </select>
                </div>
                <div class="field">
                  <label for="software-filter">软件能力</label>
                  <select id="software-filter"></select>
                </div>
              </div>
            </div>
          </section>

          <section class="panel console-view" data-console-view="product" id="product-input-section" style="margin-top: 18px;">
            <div class="panel-header">
              <h2>产品立项决策台</h2>
              <span class="badge new_module">local AI preview</span>
            </div>
            <div class="panel-body">
              <div class="product-workbench">
                <div class="decision-desk-hero">
                  <div>
                    <h3>产品先被理解，再进入市场搜索、产品页、获客和报价</h3>
                    <p>这个页面只处理产品立项。AI根据对话和文件名生成产品理解、品类建议、销售模式建议、资料缺口和下游路由；真实搜索、发布、报价和外联仍保持禁用，等待人工确认。</p>
                  </div>
                  <div class="decision-desk-meta" id="decision-desk-meta"></div>
                </div>

                <div class="product-focus-grid">
                  <section class="product-zone product-chat-card" aria-label="产品输入对话区">
                    <div class="product-zone-header">
                      <div class="product-zone-title">
                        <h3>产品输入对话</h3>
                        <span>产品名称、说明、规格材质、证书、价格、MOQ、交期、物流和目标市场，都从这里用自然语言输入。</span>
                      </div>
                      <button class="icon-btn" type="button" id="product-settings-toggle" aria-label="产品立项设置" aria-expanded="false">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="12" cy="12" r="3"></circle>
                          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2a2 2 0 0 1-4 0V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.2a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z"></path>
                        </svg>
                      </button>
                    </div>

                    <div class="product-settings-panel" id="product-settings-panel" hidden>
                      <div class="settings-grid">
                        <div class="file-box">
                          <strong>计划接口</strong>
                          <small>读取 product-decision-desk/execution-plan.json，输出 product_decision_pack、market_search_pack、downstream_route_pack。</small>
                        </div>
                        <div class="file-box">
                          <strong>数据源状态</strong>
                          <small>外部搜索、海关、趋势、平台和买家数据源默认禁用；当前只展示覆盖度与接入条件。</small>
                        </div>
                      </div>
                      <div>
                        <label>产品可选字段</label>
                        <div class="check-grid">
                          <label class="check-row"><input type="checkbox" data-product-option="product_page_required" data-on-value="yes_generate" checked /> 需要生成产品主页</label>
                          <label class="check-row"><input type="checkbox" data-product-option="third_party_test_report_status" data-on-value="available" data-off-value="unknown" /> 已有第三方检测报告</label>
                          <label class="check-row"><input type="checkbox" data-product-option="material_spec_status" data-on-value="complete" data-off-value="partial" /> 规格/材质已完整</label>
                          <label class="check-row"><input type="checkbox" data-product-option="private_label_supported" data-on-value="yes" checked /> 支持品牌标签</label>
                          <label class="check-row"><input type="checkbox" data-product-option="custom_model_supported" data-on-value="yes" checked /> 支持特殊型号定制</label>
                          <label class="check-row"><input type="checkbox" data-product-option="quantity_price_tiers" data-on-value="yes" checked /> 数量阶梯价</label>
                        </div>
                      </div>
                    </div>

                    <div class="product-chat-shell">
                      <div class="product-chat-log" id="product-chat-log" aria-live="polite">
                        <div class="chat-message" data-role="assistant">
                          <strong>AI立项助手</strong>
                          <span>请直接把产品资料发给我。你可以用自然语言，也可以按字段粘贴：产品名称、产品说明、已知规格/材质、证书/检测、价格/MOQ/交期/物流、目标市场/客户。</span>
                        </div>
                        <div class="chat-message" data-role="assistant">
                          <strong>AI立项助手</strong>
                          <span>选择文件时只读取本地文件名，不上传、不外发。设置按钮里可以调整产品页、检测报告、私标、定制和阶梯价等可选项。</span>
                        </div>
                      </div>
                      <div class="chat-composer">
                        <textarea id="product-chat-input" placeholder="示例：
产品名称：Cat6A Keystone Jack
产品说明：用于结构化布线工程和系统集成采购...
已知规格：Cat6A, UTP, 90度端接, PC外壳...
证书：暂无UL，RoHS待确认...
价格：MOQ 500pcs，支持阶梯价，FOB Ningbo...
目标市场：美国、德国、中东，优先分销商和安装商..."></textarea>
                        <div class="chat-composer-actions">
                          <div class="chat-action-group">
                            <button class="btn" type="button" id="product-attach-button">选择文件</button>
                            <span class="file-summary" id="product-file-summary">未选择文件</span>
                          </div>
                          <div class="chat-action-group">
                            <button class="btn" type="button" id="apply-chat-message">发送</button>
                          </div>
                        </div>
                      </div>
                    </div>

                  </section>

                  <aside class="product-zone product-status-card" aria-label="AI立项状态区">
                    <div class="product-zone-header">
                      <div class="product-zone-title">
                        <h3>AI立项状态</h3>
                        <span>查看当前信息是否足够进入下游模块。</span>
                      </div>
                    </div>
                    <div class="launch-verdict" id="launch-readiness-verdict" data-verdict="HOLD"></div>
                    <div class="product-status-summary" id="product-decision-status"></div>
                    <div class="score-grid" id="product-score-grid"></div>
                    <div class="product-missing-summary" id="product-missing-summary"></div>
                    <div class="product-action-panel">
                      <button class="btn primary" type="button" id="generate-product-analysis">生成立项建议</button>
                      <button class="btn" type="button" id="load-current-product">载入当前样例</button>
                    </div>
                  </aside>
                </div>

                <section class="product-result-grid" aria-label="AI建议确认区">
                  <article class="product-result-card">
                    <h3>AI产品理解</h3>
                    <p>AI对产品身份、采购动机、证据风险和资料质量的结构化理解。</p>
                    <div class="decision-list" id="ai-understanding-list"></div>
                  </article>
                  <article class="product-result-card">
                    <h3>AI建议确认</h3>
                    <p>品类与销售模式由AI先建议，人工可以采用、取消、多选或继续补充说明。</p>
                    <div class="decision-toggle-row">
                      <span class="pill">AI先建议</span>
                      <span class="pill">可单选/多选</span>
                      <span class="pill">人工可修正</span>
                    </div>
                    <div>
                      <label>AI品类建议</label>
                      <div class="recommendation-grid" id="category-recommendations"></div>
                    </div>
                    <div>
                      <label>AI销售模式建议</label>
                      <div class="recommendation-grid" id="sales-mode-recommendations"></div>
                    </div>
                  </article>
                  <article class="product-result-card">
                    <h3>资料缺口</h3>
                    <p>进入市场搜索、产品页和报价前，需要继续向用户追问或等待人工确认的信息。</p>
                    <div class="decision-list" id="completion-question-list"></div>
                  </article>
                  <article class="product-result-card">
                    <h3>后续路由</h3>
                    <p>产品页、市场搜索、报价和获客等下游节点的当前可执行状态。</p>
                    <div class="decision-list" id="downstream-route-list"></div>
                  </article>
                </section>

                <details class="collapse-block technical-details">
                  <summary>
                    <div class="summary-title">
                      <strong>技术详情</strong>
                      <span>给上游/下游系统读取的MD与JSON契约，默认折叠。</span>
                    </div>
                  </summary>
                  <div class="collapse-body">
                    <p class="muted">这里保留机器可读输出，供主系统、星云同步和后续模块读取；日常操作只需要看上方状态、建议和路由。</p>
                      <div class="output-tabs">
                        <button class="btn" type="button" data-output-tab="decision" aria-pressed="true">decision_pack</button>
                        <button class="btn" type="button" data-output-tab="search" aria-pressed="false">market_search_pack</button>
                        <button class="btn" type="button" data-output-tab="route" aria-pressed="false">downstream_route_pack</button>
                      </div>
                      <pre class="result-json" id="product-analysis-output"></pre>
                  </div>
                </details>

                <div class="sr-only-field" aria-hidden="true">
                  <input id="product-name" value="Keystone Jack / Structured Cabling Component" />
                  <textarea id="product-description">Structured cabling keystone jack sample product for B2B wholesale, private label, and project procurement. Needs specs, certifications, MOQ, price tiers, packaging, and market fit review.</textarea>
                  <textarea id="product-options">product_page_required=yes_generate
third_party_test_report_status=unknown
material_spec_status=partial
private_label_supported=yes
custom_model_supported=yes
quantity_price_tiers=yes</textarea>
                  <textarea id="product-guidance"></textarea>
                  <input id="reference-url" />
                  <textarea id="target-notes"></textarea>
                  <textarea id="known-specs"></textarea>
                  <textarea id="known-compliance"></textarea>
                  <textarea id="commercial-terms"></textarea>
                  <textarea id="dialogue-answer"></textarea>
                  <textarea id="minimum-trade-fields">hs_code_candidates=8536.69; 8544.42
target_country_candidates=United States; Germany; United Arab Emirates; Brazil; South Africa; Singapore; Japan; Australia
incoterms=EXW/FOB/CIF pending
currency=USD
payment_terms=T/T pending
price_validity=15 days draft
packing_weight_volume=unknown
claim_whitelist=private label support; quantity price tiers; custom model support
claim_blacklist=UL/ETL/CE/RoHS or performance claims blocked until certificate and test report are confirmed</textarea>
                  <input id="product-files" type="file" multiple />
                </div>
              </div>
            </div>
          </section>

          <section class="panel console-view" data-console-view="sources" id="source-gate-section" style="margin-top: 18px;">
            <div class="panel-header">
              <h2>数据源门禁</h2>
              <span class="badge partial">source gate</span>
            </div>
            <div class="panel-body">
              <details class="collapse-block" open>
                <summary>
                  <strong>覆盖审计与市场排序门禁</strong>
                  <span>免费信源、区域覆盖、web fallback、真实动作阻断</span>
                </summary>
                <div class="collapse-body">
                  <div id="source-matrix-summary"></div>
                  <div class="source-grid" id="data-source-grid"></div>
                </div>
              </details>
              <details class="collapse-block">
                <summary>
                  <strong>信源通道矩阵</strong>
                  <span>每个信源能证明什么、不能证明什么</span>
                </summary>
                <div class="collapse-body">
                  <table class="source-matrix-table" aria-label="source channel matrix">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Free level</th>
                        <th>Region</th>
                        <th>Proof boundary</th>
                      </tr>
                    </thead>
                    <tbody id="source-matrix-table"></tbody>
                  </table>
                </div>
              </details>
            </div>
          </section>

          <section class="panel console-view" data-console-view="modules" id="module-overview-section" style="margin-top: 18px;">
            <div class="panel-header">
              <h2>19个模块入口</h2>
              <span class="badge covered" id="module-overview-count">0 modules</span>
            </div>
            <div class="panel-body">
              <div class="module-overview-toolbar">
                <p class="muted">这里是当前增长销售自动化分支的模块索引，受上方搜索和筛选影响。点击“展开计划树”会定位到对应模块的完整输入、输出、提示词、验证标准和试执行结果。</p>
                <button class="btn" type="button" id="reset-module-filters">显示全部19个模块</button>
              </div>
              <div class="module-index-grid" id="module-overview-list"></div>
            </div>
          </section>

          <section class="panel console-view" data-console-view="modules" id="ai-plan-section" style="margin-top: 18px;">
            <div class="panel-header">
              <h2>AI实现计划树</h2>
              <span class="badge covered" id="ai-plan-count">0 paths</span>
            </div>
            <div class="panel-body">
              <div class="plan-list" id="ai-plan-list"></div>
            </div>
          </section>

          <section class="panel console-view" data-console-view="modules" id="phase-control-section" style="margin-top: 18px;">
            <div class="panel-header">
              <h2>阶段与模块控制面</h2>
              <span class="badge covered">draft only</span>
            </div>
            <div class="panel-body">
              <div class="phase-list" id="phase-list"></div>
            </div>
          </section>
        </div>

        <aside class="side-column">
          <section class="panel console-view" data-console-view="overview">
            <div class="panel-header">
              <h2>实施路径</h2>
              <span class="badge partial">planned</span>
            </div>
            <div class="panel-body">
              <div class="timeline" id="timeline"></div>
            </div>
          </section>

          <section class="panel console-view" data-console-view="sync" style="margin-top: 18px;">
            <div class="panel-header">
              <h2>软件目录</h2>
              <span class="badge new_module">disabled</span>
            </div>
            <div class="panel-body">
              <div class="software-table" id="software-table"></div>
            </div>
          </section>

          <section class="panel console-view" data-console-view="sync" id="sync-section" style="margin-top: 18px;">
            <div class="panel-header">
              <h2>同步与再生成</h2>
              <span class="badge covered">nebula synced</span>
            </div>
            <div class="panel-body">
              <div class="sync" id="sync-panel"></div>
            </div>
          </section>
        </aside>
      </section>
    </main>
  </div>

  <script>
    const data = JSON.parse(document.getElementById('branch-data').textContent);
    const state = {
      view: 'overview',
      query: '',
      phase: 'all',
      coverage: 'all',
      software: 'all',
      productFamilyOverride: '',
      salesModeOverride: '',
      productFamilySelections: [],
      salesModeSelections: [],
      outputTab: 'decision'
    };

    const labels = {
      covered: '已覆盖',
      partial: '部分覆盖',
      new_module: '新增模块',
      done: '已完成',
      pending_me: '待系统实现',
      pending_user: '待人工确认',
      pending_external: '待外部条件',
      blocked_real_action: '真实动作阻断'
    };

    const productFamilyLabels = {
      structured_cabling: '结构化布线/网络连接器',
      retail_consumer_goods: '零售消费品',
      industrial_parts: '工业配件/工程物料',
      custom_product: '定制产品',
      unknown: '待AI继续判断'
    };

    const salesModeLabels = {
      wholesale: 'B2B批发',
      project_procurement: '项目采购/RFQ',
      OEM_private_label: 'OEM/私标',
      retail: '零售上架',
      mixed_unknown: '复合模式待判断'
    };

    function escapeHtml(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    function allModules() {
      return data.phases.flatMap((phase) =>
        phase.modules.map((module) => ({
          ...module,
          phase_id: phase.phase_id,
          phase_label: phase.label
        }))
      );
    }

    function allPlanItems() {
      return data.ai_implementation_plan?.modules || [];
    }

    function planForModule(moduleId) {
      return allPlanItems().find((item) => item.module_id === moduleId);
    }

    function setConsoleView(view) {
      state.view = view;
      document.body.dataset.view = view;
      document.querySelectorAll('[data-console-tab]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.consoleTab === view));
      });
    }

    function textBlob(module) {
      return [
        module.module_id,
        module.label,
        module.phase_label,
        module.current_status,
        ...(module.inputs || []),
        ...(module.outputs || []),
        ...(module.hard_boundaries || []),
        ...(module.human_gates || []),
        ...(module.software_refs || []),
        ...(module.next_implementation || []),
        module.ai_function_spec?.ai_function_description || '',
        module.ai_function_spec?.prompt_pack?.system_prompt || '',
        module.ai_function_spec?.prompt_pack?.user_prompt_template || ''
      ].join(' ').toLowerCase();
    }

    function moduleMatches(module) {
      if (state.phase !== 'all' && module.phase_id !== state.phase) return false;
      if (state.coverage !== 'all' && module.coverage !== state.coverage) return false;
      if (state.software !== 'all' && !(module.software_refs || []).includes(state.software)) return false;
      if (!state.query.trim()) return true;
      return textBlob(module).includes(state.query.trim().toLowerCase());
    }

    function badge(value) {
      return '<span class="badge ' + escapeHtml(value) + '">' + escapeHtml(labels[value] || value) + '</span>';
    }

    function pill(value) {
      return '<span class="pill">' + escapeHtml(value) + '</span>';
    }

    function renderSummary() {
      const summary = data.summary;
      document.getElementById('page-title').textContent = data.label;
      document.getElementById('page-subtitle').textContent =
        data.status + ' / ' + data.relationship_to_canonical_flow.mode + ' / generated ' + data.generated_at;
      document.getElementById('summary-strip').innerHTML = [
        ['阶段', summary.phase_count],
        ['模块', summary.module_count],
        ['软件', summary.software_count],
        ['映射主节点', summary.mapped_stage_count],
        ['禁用软件', summary.disabled_software_count]
      ]
        .map(([label, value]) => '<div class="metric"><strong>' + value + '</strong><span>' + label + '</span></div>')
        .join('');
    }

    function renderStatusGrid() {
      const safety = data.safety_policy;
      const relation = data.relationship_to_canonical_flow;
      document.getElementById('status-grid').innerHTML = [
        ['主流程保持', relation.preserve_canonical_flow ? '16 个 cbx 主节点不变，分支只做 overlay。' : '需要复核主流程。'],
        ['软件动作', safety.software_actions_enabled_by_default ? '存在默认开启，需要阻断。' : '全部默认禁用，调试后手动开启。'],
        ['真实动作', safety.real_external_actions_allowed ? '存在真实动作许可，需要复核。' : '客户外发、报价发送、CRM 写入、投放、物流、报关税务均阻断。'],
        ['星云同步', '通过 branch_overlays 同步到实体工作节点星云。']
        , ['Promotion/social status', data.promotion_social_automation?.connection_status?.summary ? ('connectors ' + data.promotion_social_automation.connection_status.summary.connector_count + '; enabled ' + data.promotion_social_automation.connection_status.summary.enabled_connector_count + '; real send disabled') : 'promotion-social-automation pack not generated']
      ]
        .map(([title, body]) => '<div class="status-cell"><strong>' + escapeHtml(title) + '</strong><p>' + escapeHtml(body) + '</p></div>')
        .join('');
    }

    function renderFilters() {
      const phaseFilter = document.getElementById('phase-filter');
      phaseFilter.innerHTML = '<option value="all">全部阶段</option>' + data.phases
        .map((phase) => '<option value="' + escapeHtml(phase.phase_id) + '">' + escapeHtml(phase.label) + '</option>')
        .join('');

      const softwareFilter = document.getElementById('software-filter');
      softwareFilter.innerHTML = '<option value="all">全部软件</option>' + data.software_catalog
        .map((software) => '<option value="' + escapeHtml(software.software_id) + '">' + escapeHtml(software.label) + '</option>')
        .join('');
    }

    function renderPhases() {
      const matchedModules = allModules().filter(moduleMatches);
      document.getElementById('match-count').textContent = matchedModules.length + ' modules';
      const matchedIds = new Set(matchedModules.map((module) => module.module_id));
      const html = data.phases
        .map((phase) => {
          const modules = phase.modules.filter((module) => matchedIds.has(module.module_id));
          if (!modules.length) return '';
          return '<article class="phase">' +
            '<div class="phase-title"><h3>' + escapeHtml(phase.label) + '</h3><div class="stage-links">' +
            phase.mapped_stage_ids.map(pill).join('') +
            '</div></div>' +
            '<div class="module-list">' +
            modules.map((module) => renderModule(module, phase)).join('') +
            '</div></article>';
        })
        .filter(Boolean)
        .join('');
      document.getElementById('phase-list').innerHTML = html || '<div class="empty">没有匹配的模块。请调整查询词或筛选条件。</div>';
    }

    function listHtml(items) {
      return '<ul>' + (items || []).map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>';
    }

    function codePill(value) {
      return '<code>' + escapeHtml(value) + '</code>';
    }

    function filteredPlanItems() {
      const modulesById = new Map(allModules().map((module) => [module.module_id, module]));
      return allPlanItems().filter((plan) => {
        const module = modulesById.get(plan.module_id);
        return module ? moduleMatches(module) : true;
      });
    }

    function renderModuleOverview() {
      const modulesById = new Map(allModules().map((module) => [module.module_id, module]));
      const plans = filteredPlanItems();
      document.getElementById('module-overview-count').textContent = plans.length + ' / ' + allPlanItems().length + ' modules';
      const html = plans.map((plan) => {
        const module = modulesById.get(plan.module_id);
        return '<article class="module-index-card">' +
          '<div>' + badge(plan.coverage) + '</div>' +
          '<h3>' + escapeHtml(plan.module_label) + '</h3>' +
          '<p>' + escapeHtml(module?.phase_label || plan.phase_id) + '</p>' +
          '<p>' + escapeHtml(plan.ai_function_description) + '</p>' +
          '<div class="artifact-row">' + codePill(plan.input_contract.contract) + codePill(plan.output_contract.contract) + '</div>' +
          '<div class="module-index-actions">' +
            '<button class="btn primary" type="button" data-open-plan="' + escapeHtml(plan.module_id) + '">展开计划树</button>' +
            '<button class="btn" type="button" data-run-module="' + escapeHtml(plan.module_id) + '">试执行</button>' +
          '</div>' +
        '</article>';
      }).join('');
      document.getElementById('module-overview-list').innerHTML = html ||
        '<div class="empty">没有匹配的模块。请点击“显示全部19个模块”或调整上方筛选。</div>';
    }

    function renderAiPlan() {
      const visiblePlans = filteredPlanItems();
      document.getElementById('ai-plan-count').textContent = visiblePlans.length + ' paths';
      const planIds = new Set(visiblePlans.map((plan) => plan.path_id));
      const html = data.phases.map((phase) => {
        const phasePlans = allPlanItems().filter((plan) => plan.phase_id === phase.phase_id && planIds.has(plan.path_id));
        if (!phasePlans.length) return '';
        return '<details class="tree-phase" open>' +
          '<summary><div class="tree-title"><strong>' + escapeHtml(phase.label) + '</strong><small>' + escapeHtml(phase.phase_id) + '</small></div>' +
          '<span class="subtitle">' + escapeHtml((phase.mapped_stage_ids || []).join(' / ')) + '</span>' +
          '<span class="badge partial">' + phasePlans.length + ' paths</span></summary>' +
          '<div class="tree-children">' + phasePlans.map(renderPlanItem).join('') + '</div>' +
        '</details>';
      }).join('');
      document.getElementById('ai-plan-list').innerHTML = html ||
        '<div class="empty">没有匹配的AI实现路径。请调整查询词或筛选条件。</div>';
    }

    function renderPlanItem(plan) {
      return '<details class="tree-node" id="plan-node-' + escapeHtml(plan.module_id) + '">' +
        '<summary>' +
          '<div class="tree-title">' + badge(plan.coverage) + '<strong>' + escapeHtml(plan.module_label) + '</strong><small>' + escapeHtml(plan.path_id) + '</small></div>' +
          '<span class="subtitle">' + escapeHtml(plan.ai_function_description) + '</span>' +
          '<button class="btn primary" type="button" data-run-module="' + escapeHtml(plan.module_id) + '">试执行</button>' +
        '</summary>' +
        '<div class="plan-body">' +
          '<div class="plan-box"><strong>上游输入</strong>' + listHtml(plan.input_contract.required) +
            '<div class="artifact-row">' + (plan.upstream.mapped_stage_ids || []).map(codePill).join('') + '</div></div>' +
          '<div class="plan-box"><strong>下游输出</strong>' + listHtml(plan.output_contract.required) +
            '<div class="artifact-row">' + (plan.downstream.route_stage_ids || []).map(codePill).join('') + '</div></div>' +
          '<div class="plan-box"><strong>AI执行步骤</strong>' + listHtml(plan.plan_steps) + '</div>' +
          '<div class="plan-box"><strong>默认阻断动作</strong>' + listHtml(plan.automation_boundary.blocked_by_default) + '</div>' +
          '<div class="plan-box"><strong>技术指标要求</strong>' + listHtml((plan.validation_standards || []).map((metric) => metric.label + '：' + metric.target)) + '</div>' +
          '<div class="plan-box"><strong>验证通过规则</strong>' + listHtml((plan.validation_standards || []).map((metric) => metric.metric_id + '：' + metric.pass_rule)) + '</div>' +
          '<details class="prompt-block">' +
            '<summary>查看试执行结果</summary>' +
            '<pre class="result-json" id="trial-result-' + escapeHtml(plan.module_id) + '">' + escapeHtml(JSON.stringify(plan.sample_trial_result || {}, null, 2)) + '</pre>' +
          '</details>' +
          '<details class="prompt-block">' +
            '<summary>查看提示词拆解</summary>' +
            '<div class="prompt-grid">' +
              '<pre>' + escapeHtml(plan.prompt_pack.system_prompt) + '</pre>' +
              '<pre>' + escapeHtml(plan.prompt_pack.user_prompt_template) + '</pre>' +
              '<pre>' + escapeHtml(plan.prompt_pack.qa_prompt) + '</pre>' +
            '</div>' +
          '</details>' +
        '</div>' +
      '</details>';
    }

    function renderModule(module, phase) {
      const aiSpec = planForModule(module.module_id);
      return '<div class="module">' +
        '<div>' +
          badge(module.coverage) +
          '<h4>' + escapeHtml(module.label) + '</h4>' +
          '<small>' + escapeHtml(module.module_id) + '</small>' +
          '<div class="button-row">' +
            '<button class="btn primary" type="button" data-module="' + escapeHtml(module.module_id) + '">查看边界</button>' +
            '<button class="btn" type="button" disabled>生成草案待接入</button>' +
          '</div>' +
        '</div>' +
        '<div class="kv">' +
          '<div><strong>输入</strong><span>' + escapeHtml((module.inputs || []).join(' / ')) + '</span></div>' +
          '<div><strong>输出</strong><span>' + escapeHtml((module.outputs || []).join(' / ')) + '</span></div>' +
          '<div><strong>AI功能</strong><span>' + escapeHtml(aiSpec?.ai_function_description || '待生成AI实现说明') + '</span></div>' +
          '<div><strong>硬边界</strong><span>' + escapeHtml((module.hard_boundaries || []).join(' / ')) + '</span></div>' +
          '<div><strong>人工门禁</strong><span>' + escapeHtml((module.human_gates || []).join(' / ')) + '</span></div>' +
        '</div>' +
        '<div class="action-row">' +
          '<div class="software-tags">' + (module.software_refs || []).map(pill).join('') + '</div>' +
          '<div class="disabled-action">当前状态：' + escapeHtml(module.current_status) + '</div>' +
          '<div class="disabled-action">下一步：' + escapeHtml((module.next_implementation || []).join(' / ')) + '</div>' +
          '<div class="disabled-action">提示词文件：' + escapeHtml(aiSpec?.artifacts?.md || '') + '</div>' +
          '<div class="disabled-action">映射主流程：' + escapeHtml(((module.mapped_stage_ids || phase.mapped_stage_ids || [])).join(' / ')) + '</div>' +
        '</div>' +
      '</div>';
    }

    function parseOptionLines(text) {
      return Object.fromEntries(String(text || '').split(/\\n+/).map((line) => {
        const index = line.indexOf('=');
        if (index === -1) return null;
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }).filter(Boolean));
    }

    function parseKeyValueLines(text) {
      const parsed = {};
      for (const line of String(text || '').split(/\\n+/)) {
        const index = line.indexOf('=');
        if (index === -1) continue;
        const key = line.slice(0, index).trim();
        const rawValue = line.slice(index + 1).trim();
        if (!key) continue;
        const parts = rawValue.split(/;|,/).map((item) => item.trim()).filter(Boolean);
        parsed[key] = parts.length > 1 ? parts : rawValue;
      }
      return parsed;
    }

    function setFieldValue(id, value) {
      const element = document.getElementById(id);
      if (element) element.value = value || '';
    }

    function appendChatMessage(role, text) {
      const log = document.getElementById('product-chat-log');
      if (!log || !text) return;
      log.insertAdjacentHTML('beforeend',
        '<div class="chat-message" data-role="' + escapeHtml(role) + '">' +
          '<strong>' + escapeHtml(role === 'user' ? '你' : 'AI立项助手') + '</strong>' +
          '<span>' + escapeHtml(text) + '</span>' +
        '</div>'
      );
      log.scrollTop = log.scrollHeight;
    }

    function parseChatProductFields(text) {
      const mapping = [
        { id: 'product-name', patterns: ['产品名称', '品名', 'product name', 'name'] },
        { id: 'product-description', patterns: ['产品说明', '产品描述', 'description', '用途'] },
        { id: 'known-specs', patterns: ['已知规格', '规格', '材质', 'specs', 'material'] },
        { id: 'known-compliance', patterns: ['证书', '检测', '合规', '认证', 'certificate', 'compliance'] },
        { id: 'commercial-terms', patterns: ['价格', 'moq', '交期', '物流', '付款', '贸易条款', 'price'] },
        { id: 'target-notes', patterns: ['目标市场', '目标客户', '客户', '市场', 'target market', 'buyer'] },
        { id: 'reference-url', patterns: ['参考网址', '链接', 'url', 'reference'] }
      ];
      const updates = {};
      const fallbackLines = [];
      for (const line of String(text || '').split(/\\n+/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const index = trimmed.search(/[:：=]/);
        if (index === -1) {
          fallbackLines.push(trimmed);
          continue;
        }
        const key = trimmed.slice(0, index).trim().toLowerCase();
        const value = trimmed.slice(index + 1).trim();
        const matched = mapping.find((item) => item.patterns.some((pattern) => key.includes(pattern.toLowerCase())));
        if (matched && value) {
          updates[matched.id] = updates[matched.id] ? updates[matched.id] + '\\n' + value : value;
        } else {
          fallbackLines.push(trimmed);
        }
      }
      if (!Object.keys(updates).length && fallbackLines.length) {
        updates['product-description'] = fallbackLines.join('\\n');
      } else if (fallbackLines.length) {
        updates['product-guidance'] = fallbackLines.join('\\n');
      }
      return updates;
    }

    function applyChatProductInput() {
      const input = document.getElementById('product-chat-input');
      const text = input?.value?.trim() || '';
      if (!text) return;
      const updates = parseChatProductFields(text);
      for (const [id, value] of Object.entries(updates)) {
        const current = document.getElementById(id)?.value?.trim() || '';
        setFieldValue(id, current ? current + '\\n' + value : value);
      }
      setFieldValue('dialogue-answer', text);
      appendChatMessage('user', text);
      appendChatMessage('assistant', '已收到这轮产品信息，并按当前资料重新生成立项建议。');
      input.value = '';
      renderProductAnalysis(buildProductAnalysis(currentProductInput()));
    }

    function updateFileSummary() {
      const fileInput = document.getElementById('product-files');
      const target = document.getElementById('product-file-summary');
      if (!fileInput || !target) return;
      const files = [...(fileInput.files || [])];
      target.textContent = files.length ? files.map((file) => file.name).join(' / ') : '未选择文件';
    }

    function productOptionsFromCheckboxes() {
      const values = {
        product_page_required: 'no_catalog_only',
        third_party_test_report_status: 'unknown',
        material_spec_status: 'partial',
        private_label_supported: 'no',
        custom_model_supported: 'no',
        quantity_price_tiers: 'no'
      };
      document.querySelectorAll('[data-product-option]').forEach((input) => {
        values[input.dataset.productOption] = input.checked
          ? (input.dataset.onValue || 'yes')
          : (input.dataset.offValue || 'no');
      });
      document.getElementById('product-options').value = Object.entries(values).map(([key, value]) => key + '=' + value).join('\\n');
    }

    function syncCheckboxesFromProductOptions() {
      const options = parseOptionLines(document.getElementById('product-options')?.value || '');
      document.querySelectorAll('[data-product-option]').forEach((input) => {
        const value = options[input.dataset.productOption];
        input.checked = value === (input.dataset.onValue || 'yes');
      });
    }

    function currentProductInput() {
      const fileInput = document.getElementById('product-files');
      return {
        product_name: document.getElementById('product-name').value.trim(),
        product_family: document.getElementById('product-family').value,
        sales_mode: document.getElementById('sales-mode').value,
        product_description: document.getElementById('product-description').value.trim(),
        product_options: parseOptionLines(document.getElementById('product-options').value),
        uploaded_files: [...(fileInput.files || [])].map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type || 'unknown'
        }))
      };
    }

    function scoreProduct(input) {
      const options = input.product_options || {};
      const hasSpecs = options.material_spec_status === 'complete' || input.product_description.length > 120;
      const hasReport = options.third_party_test_report_status === 'available';
      const hasPage = options.product_page_required === 'yes_generate' || options.product_page_required === 'update_existing';
      const hasCommercial = options.quantity_price_tiers === 'yes' && input.sales_mode !== 'mixed_unknown';
      const hasFiles = input.uploaded_files.length > 0;
      return {
        data_completeness: Math.min(100, 38 + (input.product_description ? 18 : 0) + (hasFiles ? 14 : 0) + (hasSpecs ? 18 : 0) + (hasCommercial ? 12 : 0)),
        category_fit: input.product_family === 'unknown' ? 52 : 82,
        compliance_evidence: hasReport ? 88 : 42,
        visual_readiness: hasFiles ? 74 : 48,
        commercial_readiness: hasCommercial ? 78 : 45,
        market_demand_fit: input.product_family === 'structured_cabling' ? 76 : 58,
        product_page_readiness: hasPage && hasSpecs ? 78 : 55
      };
    }

    function buildProductAnalysis(input) {
      const framework = data.product_input_framework;
      const scores = scoreProduct(input);
      const options = input.product_options || {};
      const missing = [];
      if (options.third_party_test_report_status !== 'available') missing.push('补齐第三方检测报告、证书状态或明确标记不可声明的认证。');
      if (options.material_spec_status !== 'complete') missing.push('补齐规格材质：等级、尺寸、材质、兼容性、包装、阻燃或安全属性。');
      if (!options.moq) missing.push('补齐 MOQ、阶梯价、样品政策、交期和付款/贸易条款。');
      if (!input.uploaded_files.length) missing.push('补齐主图、细节图、场景图、包装图或源文件。');
      const classification = {
        product_family: input.product_family === 'unknown' ? 'needs_ai_category_review' : input.product_family,
        sales_mode: input.sales_mode,
        likely_channel: input.sales_mode === 'retail' ? 'retail listing / marketplace' : 'B2B wholesale / RFQ / project procurement',
        product_page_required: options.product_page_required || 'yes_generate',
        current_product_page_scope: input.product_family === 'structured_cabling' ? 'technical_detail_page + RFQ landing page' : 'category_specific_page_pending'
      };
      const sellingPoints = input.product_family === 'structured_cabling'
        ? ['适合结构化布线项目配套', '支持私标和型号定制', '可围绕批量采购、样品确认、交期和兼容性建立询盘', '适合与配线架、面板、工具形成组合销售']
        : ['需要先完成品类规则判断', '根据销售模式生成零售或批发页面', '围绕目标买家补齐规格、证据和价格物流'];
      return {
        contract: 'normalized_product_input_preview.v1',
        generated_at: new Date().toISOString(),
        source: 'dashboard_local_preview',
        product_input: input,
        classification,
        feature_and_selling_points: sellingPoints,
        scoring: scores,
        missing_content_prompts: missing,
        category_specific_checks: framework.intake_sections.flatMap((section) => section.category_rules || []),
        recommended_downstream_routes: framework.downstream_routes,
        ai_outputs_to_generate: framework.ai_outputs,
        safety: framework.safety
      };
    }

    function renderProductAnalysis(analysis) {
      const scoreEntries = Object.entries(analysis.scoring || {});
      document.getElementById('product-score-grid').innerHTML = scoreEntries.map(([key, value]) =>
        '<div class="score-card"><strong>' + escapeHtml(value) + '</strong><span>' + escapeHtml(key) + '</span></div>'
      ).join('');
      document.getElementById('product-analysis-output').textContent = JSON.stringify(analysis, null, 2);
    }

    function loadCurrentProduct() {
      const sample = data.product_input_framework.current_sample_product;
      document.getElementById('product-name').value = sample.product_name;
      document.getElementById('product-family').value = sample.product_family;
      document.getElementById('sales-mode').value = 'wholesale';
      document.getElementById('product-description').value =
        sample.known_strengths.join('\\n') + '\\n\\n需要补齐：\\n' + sample.current_missing_items.join('\\n');
      document.getElementById('product-options').value = [
        'product_page_required=yes_generate',
        'third_party_test_report_status=unknown',
        'material_spec_status=partial',
        'private_label_supported=yes',
        'custom_model_supported=yes',
        'quantity_price_tiers=yes'
      ].join('\\n');
      syncCheckboxesFromProductOptions();
      updateFileSummary();
      const chatInput = document.getElementById('product-chat-input');
      if (chatInput) {
        chatInput.value = [
          '产品名称：' + sample.product_name,
          '产品说明：' + sample.known_strengths.join('；'),
          '已知规格：待补充完整规格、材质、尺寸、兼容关系。',
          '证书：第三方检测报告和认证状态待确认。',
          '价格：MOQ、阶梯价、样品政策、交期和包装物流待确认。',
          '目标市场：优先B2B批发、项目采购、OEM/私标。'
        ].join('\\n');
      }
      appendChatMessage('assistant', '已载入当前样例到聊天输入框，可直接编辑后发送。');
      renderProductAnalysis(buildProductAnalysis(currentProductInput()));
    }

    function runModuleTrial(moduleId) {
      const plan = planForModule(moduleId);
      if (!plan) return;
      const analysis = buildProductAnalysis(currentProductInput());
      const result = {
        ...(plan.sample_trial_result || {}),
        generated_at: new Date().toISOString(),
        product_preview_used: {
          product_name: analysis.product_input.product_name,
          product_family: analysis.classification.product_family,
          sales_mode: analysis.classification.sales_mode,
          readiness_scores: analysis.scoring
        },
        trial_note: '本结果由前端本地dry-run生成，用于检查模块逻辑、输入输出和验证标准，不代表真实外部数据结论。'
      };
      const target = document.getElementById('trial-result-' + moduleId);
      if (target) target.textContent = JSON.stringify(result, null, 2);
    }

    function currentProductInput() {
      const fileInput = document.getElementById('product-files');
      return {
        product_name: document.getElementById('product-name').value.trim(),
        product_description: document.getElementById('product-description').value.trim(),
        manual_guidance: document.getElementById('product-guidance').value.trim(),
        reference_url: document.getElementById('reference-url').value.trim(),
        target_notes: document.getElementById('target-notes').value.trim(),
        known_specs: document.getElementById('known-specs').value.trim(),
        known_compliance: document.getElementById('known-compliance').value.trim(),
        commercial_terms: document.getElementById('commercial-terms').value.trim(),
        minimum_trade_fields: parseKeyValueLines(document.getElementById('minimum-trade-fields')?.value || ''),
        dialogue_answer: document.getElementById('dialogue-answer')?.value?.trim() || '',
        product_options: parseOptionLines(document.getElementById('product-options').value),
        uploaded_files: [...(fileInput.files || [])].map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type || 'unknown'
        })),
        selected_after_ai_suggestion: {
          product_family: state.productFamilySelections.length ? state.productFamilySelections : (state.productFamilyOverride ? [state.productFamilyOverride] : []),
          sales_mode: state.salesModeSelections.length ? state.salesModeSelections : (state.salesModeOverride ? [state.salesModeOverride] : [])
        }
      };
    }

    function textForInference(input) {
      return [
        input.product_name,
        input.product_description,
        input.manual_guidance,
        input.reference_url,
        input.target_notes,
        input.known_specs,
        input.known_compliance,
        input.commercial_terms,
        Object.entries(input.minimum_trade_fields || {}).map(([key, value]) => key + '=' + (Array.isArray(value) ? value.join(' ') : value)).join(' '),
        input.dialogue_answer,
        Object.entries(input.product_options || {}).map(([key, value]) => key + '=' + value).join(' '),
        ...(input.uploaded_files || []).map((file) => file.name)
      ].join(' ').toLowerCase();
    }

    function hasAny(text, keywords) {
      return keywords.some((keyword) => text.includes(keyword));
    }

    function fieldKnown(value) {
      if (Array.isArray(value)) return value.some((item) => fieldKnown(item));
      const normalized = String(value || '').trim().toLowerCase();
      return Boolean(normalized && normalized !== 'unknown' && normalized !== 'pending' && normalized !== 'tbd');
    }

    function makeRecommendation(value, label, score, reasons) {
      return {
        value,
        label,
        confidence: Math.max(35, Math.min(96, score)),
        reasons
      };
    }

    function inferProductFamily(input) {
      const text = textForInference(input);
      const recommendations = [];
      let structuredScore = 42;
      const structuredReasons = [];
      if (hasAny(text, ['keystone', 'jack', 'patch panel', 'face plate', 'cable', 'cat6', 'cat6a', 'cat8', 'rj45', 'structured cabling', '布线', '模块', '配线架', '面板', '网线'])) {
        structuredScore += 42;
        structuredReasons.push('产品说明或文件名包含结构化布线、网口模块、Cat等级或配线配件信号。');
      }
      if (hasAny(text, ['private label', 'oem', 'custom model', '私标', '定制', '型号定制'])) {
        structuredScore += 7;
        structuredReasons.push('存在私标/OEM/型号定制信号，更接近B2B工程物料。');
      }
      recommendations.push(makeRecommendation('structured_cabling', productFamilyLabels.structured_cabling, structuredScore, structuredReasons.length ? structuredReasons : ['当前信息不足，但可先按技术型产品进行二次核查。']));

      let industrialScore = 38;
      const industrialReasons = [];
      if (hasAny(text, ['industrial', 'component', 'part', 'material', 'accessory', '工程', '配件', '物料', '规格', '材质'])) {
        industrialScore += 24;
        industrialReasons.push('存在工业配件、工程物料、规格材质信号。');
      }
      recommendations.push(makeRecommendation('industrial_parts', productFamilyLabels.industrial_parts, industrialScore, industrialReasons.length ? industrialReasons : ['若后续补齐材质、规格、兼容关系，可归入工业物料通道。']));

      let retailScore = 34;
      const retailReasons = [];
      if (hasAny(text, ['retail', 'consumer', 'amazon', 'shopify', 'gift', '零售', '消费品', '单件购买'])) {
        retailScore += 28;
        retailReasons.push('存在零售/消费品/平台上架信号。');
      }
      recommendations.push(makeRecommendation('retail_consumer_goods', productFamilyLabels.retail_consumer_goods, retailScore, retailReasons.length ? retailReasons : ['当前B2B信号更强，零售仅保留为未来新品类通道。']));

      recommendations.push(makeRecommendation('custom_product', productFamilyLabels.custom_product, hasAny(text, ['custom', '定制', 'oem', 'private label', '私标']) ? 66 : 45, ['用于未来非标准品或强定制品添加通道。']));
      return recommendations.sort((a, b) => b.confidence - a.confidence).map((item, index) => ({ ...item, rank: index + 1 }));
    }

    function inferSalesModes(input, selectedFamily) {
      const text = textForInference(input);
      const recommendations = [];
      let wholesaleScore = selectedFamily === 'retail_consumer_goods' ? 52 : 72;
      const wholesaleReasons = [];
      if (hasAny(text, ['wholesale', 'bulk', 'moq', 'price tiers', 'quantity', '批发', '阶梯价', '起订量', '数量'])) {
        wholesaleScore += 16;
        wholesaleReasons.push('存在批量、MOQ、数量阶梯或批发信号。');
      }
      recommendations.push(makeRecommendation('wholesale', salesModeLabels.wholesale, wholesaleScore, wholesaleReasons.length ? wholesaleReasons : ['适合作为当前样例产品的默认B2B报价通道。']));

      let projectScore = selectedFamily === 'structured_cabling' ? 78 : 56;
      const projectReasons = [];
      if (hasAny(text, ['project', 'procurement', 'rfq', 'contractor', 'installer', '工程', '项目', '采购', '询盘'])) {
        projectScore += 12;
        projectReasons.push('存在项目采购、RFQ、工程安装或询盘场景信号。');
      }
      recommendations.push(makeRecommendation('project_procurement', salesModeLabels.project_procurement, projectScore, projectReasons.length ? projectReasons : ['结构化布线产品通常需要项目采购/RFQ路径。']));

      let oemScore = 58;
      const oemReasons = [];
      if (hasAny(text, ['oem', 'private label', 'brand label', 'custom model', '私标', '贴牌', '定制型号'])) {
        oemScore += 24;
        oemReasons.push('存在OEM、私标、标签或特殊型号定制信号。');
      }
      recommendations.push(makeRecommendation('OEM_private_label', salesModeLabels.OEM_private_label, oemScore, oemReasons.length ? oemReasons : ['若客户需要品牌标签或型号定制，可作为附加销售路径。']));

      let retailScore = selectedFamily === 'retail_consumer_goods' ? 70 : 38;
      const retailReasons = [];
      if (hasAny(text, ['retail', 'amazon', 'shopify', 'single unit', '零售', '单件', '亚马逊'])) {
        retailScore += 14;
        retailReasons.push('存在零售平台或单件购买信号。');
      }
      recommendations.push(makeRecommendation('retail', salesModeLabels.retail, retailScore, retailReasons.length ? retailReasons : ['当前产品更偏B2B，零售上架保留为低优先级分支。']));

      return recommendations.sort((a, b) => b.confidence - a.confidence).map((item, index) => ({ ...item, rank: index + 1 }));
    }

    function selectedFromRecommendations(recommendations, overrideValue) {
      return recommendations.find((item) => item.value === overrideValue) || recommendations[0];
    }

    function scoreProduct(input, classification) {
      const options = input.product_options || {};
      const trade = input.minimum_trade_fields || {};
      const hasSpecs = options.material_spec_status === 'complete' || input.product_description.length > 120;
      const hasReport = options.third_party_test_report_status === 'available';
      const hasPage = options.product_page_required === 'yes_generate' || options.product_page_required === 'update_existing';
      const hasCommercial = options.quantity_price_tiers === 'yes' && classification.sales_mode !== 'mixed_unknown';
      const hasMinimumTradeBasis = fieldKnown(trade.hs_code_candidates) &&
        fieldKnown(trade.target_country_candidates) &&
        fieldKnown(trade.incoterms) &&
        fieldKnown(trade.currency) &&
        fieldKnown(trade.payment_terms) &&
        fieldKnown(trade.packing_weight_volume);
      const hasFiles = input.uploaded_files.length > 0;
      return {
        data_completeness: Math.min(100, 38 + (input.product_description ? 18 : 0) + (hasFiles ? 14 : 0) + (hasSpecs ? 18 : 0) + (hasCommercial ? 12 : 0) + (hasMinimumTradeBasis ? 8 : 0)),
        category_fit: classification.product_family_confidence,
        compliance_evidence: hasReport ? 88 : 42,
        visual_readiness: hasFiles ? 74 : 48,
        commercial_readiness: Math.min(100, (hasCommercial ? 78 : 45) + (hasMinimumTradeBasis ? 10 : 0)),
        market_demand_fit: Math.min(100, (classification.product_family === 'structured_cabling' ? 76 : 58) + (fieldKnown(trade.target_country_candidates) ? 4 : 0)),
        product_page_readiness: hasPage && hasSpecs ? 78 : 55
      };
    }

    function buildProductAnalysis(input) {
      const framework = data.product_input_framework;
      const options = input.product_options || {};
      const productFamilyRecommendations = inferProductFamily(input);
      const selectedFamily = selectedFromRecommendations(productFamilyRecommendations, state.productFamilyOverride);
      const salesModeRecommendations = inferSalesModes(input, selectedFamily.value);
      const selectedSalesMode = selectedFromRecommendations(salesModeRecommendations, state.salesModeOverride);
      const classification = {
        product_family: selectedFamily.value,
        product_family_label: selectedFamily.label,
        product_family_confidence: selectedFamily.confidence,
        product_family_source: state.productFamilyOverride ? 'human_selected_after_ai_suggestion' : 'ai_suggested',
        sales_mode: selectedSalesMode.value,
        sales_mode_label: selectedSalesMode.label,
        sales_mode_confidence: selectedSalesMode.confidence,
        sales_mode_source: state.salesModeOverride ? 'human_selected_after_ai_suggestion' : 'ai_suggested',
        likely_channel: selectedSalesMode.value === 'retail' ? 'retail listing / marketplace' : 'B2B wholesale / RFQ / project procurement',
        product_page_required: options.product_page_required || 'yes_generate',
        current_product_page_scope: selectedFamily.value === 'structured_cabling' ? 'technical_detail_page + RFQ landing page' : 'category_specific_page_pending'
      };
      const scores = scoreProduct(input, classification);
      const missing = [];
      if (options.third_party_test_report_status !== 'available') missing.push('补齐第三方检测报告、证书状态或明确标记不可声明的认证。');
      if (options.material_spec_status !== 'complete') missing.push('补齐规格材质：等级、尺寸、材质、兼容性、包装、阻燃或安全属性。');
      if (!options.moq) missing.push('补齐 MOQ、阶梯价、样品政策、交期和付款/贸易条款。');
      if (!input.uploaded_files.length) missing.push('补齐主图、细节图、场景图、包装图或源文件。');
      if (!input.manual_guidance) missing.push('可补充目标客户、目标国家/地区、是否接受OEM/私标、是否优先批发或项目采购。');
      const sellingPoints = classification.product_family === 'structured_cabling'
        ? ['适合结构化布线项目配套', '支持私标和型号定制', '可围绕批量采购、样品确认、交期和兼容性建立询盘', '适合与配线架、面板、工具形成组合销售']
        : ['需要先完成品类规则判断', '根据销售模式生成零售或批发页面', '围绕目标买家补齐规格、证据和价格物流'];
      return {
        contract: 'normalized_product_input_preview.v1',
        generated_at: new Date().toISOString(),
        source: 'dashboard_local_preview',
        product_input: input,
        ai_recommendations: {
          product_family: productFamilyRecommendations,
          sales_mode: salesModeRecommendations,
          selected_policy: 'AI先建议，人工可说明或点击建议卡修正；真实上架前仍需人工确认。'
        },
        classification,
        feature_and_selling_points: sellingPoints,
        scoring: scores,
        missing_content_prompts: missing,
        category_specific_checks: framework.intake_sections.flatMap((section) => section.category_rules || []),
        recommended_downstream_routes: framework.downstream_routes,
        ai_outputs_to_generate: framework.ai_outputs,
        safety: framework.safety
      };
    }

    function renderRecommendationCards(items, selectedValue, type) {
      return (items || []).slice(0, 3).map((item) => {
        const selected = selectedValue ? item.value === selectedValue : item.rank === 1;
        return '<article class="recommendation-card" data-selected="' + selected + '">' +
          '<strong>' + escapeHtml(item.label) + '</strong>' +
          '<span>置信度 ' + escapeHtml(item.confidence) + ' / ' + (selected ? '当前采用' : '备选建议') + '</span>' +
          '<small>' + escapeHtml((item.reasons || []).join(' / ')) + '</small>' +
          '<button class="btn" type="button" data-select-' + type + '="' + escapeHtml(item.value) + '">' + (selected ? '已采用' : '采用此建议') + '</button>' +
        '</article>';
      }).join('');
    }

    function renderRecommendations(analysis) {
      document.getElementById('category-recommendations').innerHTML =
        renderRecommendationCards(analysis.ai_recommendations?.product_family || [], state.productFamilyOverride, 'family');
      document.getElementById('sales-mode-recommendations').innerHTML =
        renderRecommendationCards(analysis.ai_recommendations?.sales_mode || [], state.salesModeOverride, 'sales');
    }

    function renderProductAnalysis(analysis) {
      renderRecommendations(analysis);
      const scoreEntries = Object.entries(analysis.scoring || {});
      document.getElementById('product-score-grid').innerHTML = scoreEntries.map(([key, value]) =>
        '<div class="score-card"><strong>' + escapeHtml(value) + '</strong><span>' + escapeHtml(key) + '</span></div>'
      ).join('');
      document.getElementById('product-analysis-output').textContent = JSON.stringify(analysis, null, 2);
    }

    function loadCurrentProduct() {
      const sample = data.product_input_framework.current_sample_product;
      state.productFamilyOverride = '';
      state.salesModeOverride = '';
      document.getElementById('product-name').value = sample.product_name;
      document.getElementById('product-description').value =
        sample.known_strengths.join('\\n') + '\\n\\n需要补齐：\\n' + sample.current_missing_items.join('\\n');
      document.getElementById('product-guidance').value = '';
      document.getElementById('product-options').value = [
        'product_page_required=yes_generate',
        'third_party_test_report_status=unknown',
        'material_spec_status=partial',
        'private_label_supported=yes',
        'custom_model_supported=yes',
        'quantity_price_tiers=yes'
      ].join('\\n');
      renderProductAnalysis(buildProductAnalysis(currentProductInput()));
    }

    function runModuleTrial(moduleId) {
      const plan = planForModule(moduleId);
      if (!plan) return;
      const analysis = buildProductAnalysis(currentProductInput());
      const result = {
        ...(plan.sample_trial_result || {}),
        generated_at: new Date().toISOString(),
        product_preview_used: {
          product_name: analysis.product_input.product_name,
          product_family: analysis.classification.product_family,
          product_family_label: analysis.classification.product_family_label,
          sales_mode: analysis.classification.sales_mode,
          sales_mode_label: analysis.classification.sales_mode_label,
          readiness_scores: analysis.scoring
        },
        trial_note: '本结果由前端本地dry-run生成，用于检查模块逻辑、输入输出和验证标准，不代表真实外部数据结论。'
      };
      const target = document.getElementById('trial-result-' + moduleId);
      if (target) target.textContent = JSON.stringify(result, null, 2);
    }

    function openPlanNode(moduleId) {
      setConsoleView('modules');
      const node = document.getElementById('plan-node-' + moduleId);
      if (!node) {
        document.getElementById('ai-plan-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      node.open = true;
      const parentPhase = node.closest('.tree-phase');
      if (parentPhase) parentPhase.open = true;
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function resetModuleFilters() {
      state.query = '';
      state.phase = 'all';
      state.coverage = 'all';
      state.software = 'all';
      document.getElementById('query').value = '';
      document.getElementById('phase-filter').value = 'all';
      document.getElementById('coverage-filter').value = 'all';
      document.getElementById('software-filter').value = 'all';
      renderPhases();
      renderAiPlan();
      renderModuleOverview();
    }

    function toggleSelection(list, value) {
      const index = list.indexOf(value);
      if (index === -1) {
        list.push(value);
      } else {
        list.splice(index, 1);
      }
    }

    function selectedRecommendationValues(recommendations, selections) {
      if (selections.length) return selections;
      return recommendations[0] ? [recommendations[0].value] : [];
    }

    function recommendationByValue(recommendations, value) {
      return recommendations.find((item) => item.value === value);
    }

    function productIdFromInput(input) {
      return String(input.product_name || 'product')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'product-draft';
    }

    function mapCategoryForQuestions(category) {
      if (category === 'retail_consumer_goods') return 'retail_consumer_product';
      if (category === 'custom_product') return 'custom_nonstandard_product';
      return category;
    }

    function buildCompletionQuestions(input, classification) {
      const plan = data.product_decision_desk?.plan;
      const mapped = mapCategoryForQuestions(classification.product_family);
      const categoryRules = (plan?.category_specific_completion || []).find((item) => item.category === mapped);
      const questions = [...(categoryRules?.required_questions || [])];
      const options = input.product_options || {};
      const trade = input.minimum_trade_fields || {};
      if (!input.known_specs) questions.push('请补充关键规格、材质、尺寸、兼容关系或型号差异。');
      if (!input.known_compliance && options.third_party_test_report_status !== 'available') questions.push('请说明已有证书、测试报告、目标市场准入证据，或明确目前没有。');
      if (!input.commercial_terms && !options.moq) questions.push('请补充MOQ、阶梯价、样品政策、交期、包装数量、重量体积或贸易条款。');
      if (!input.target_notes) questions.push('请说明优先客户类型、目标国家/地区、暂不开发市场或渠道偏好。');
      if (!input.uploaded_files.length) questions.push('请补充主图、细节图、包装图、安装图或可用于产品页的源文件。');
      if (!fieldKnown(trade.hs_code_candidates)) questions.push('请补充HS Code候选或说明暂不能确认，正式关税和合规判断会在确认前保持阻断。');
      if (!fieldKnown(trade.target_country_candidates)) questions.push('请补充目标国家/地区候选；AI可建议，但进入市场排序前必须有覆盖度门禁。');
      if (!fieldKnown(trade.incoterms) || !fieldKnown(trade.currency) || !fieldKnown(trade.payment_terms)) questions.push('请补充Incoterms、币种和付款条款，报价草案可生成但正式发送保持阻断。');
      if (!fieldKnown(trade.packing_weight_volume)) questions.push('请补充包装、重量和体积，物流方式对比和到岸成本会在确认前保持低置信度。');
      if (!fieldKnown(trade.claim_whitelist) || !fieldKnown(trade.claim_blacklist)) questions.push('请补充允许声明和禁止声明的卖点/认证边界，避免AI客服或产品页误称证书和性能。');
      return [...new Set(questions)].slice(0, 9).map((question, index) => ({
        question_id: 'q_' + (index + 1),
        question,
        status: input.dialogue_answer ? 'can_update_after_user_answer' : 'waiting_user_input'
      }));
    }

    function buildAiUnderstanding(input, classification, sellingPoints) {
      return {
        product_identity: input.product_name || '未命名产品',
        inferred_category: classification.product_family_label,
        inferred_sales_model: classification.sales_mode_label,
        buyer_reason_to_buy: classification.product_family === 'structured_cabling'
          ? '用于布线工程、弱电项目、分销备货或系统集成配套采购。'
          : '需要结合用途、价格、合规和渠道进一步判断采购动机。',
        immediate_selling_points: sellingPoints,
        evidence_risk: input.known_compliance || input.product_options?.third_party_test_report_status === 'available'
          ? '存在部分合规证据线索，正式声明前仍需人工确认。'
          : '认证、测试报告和目标市场准入证据不足，不能形成正式合规声明。',
        data_quality_note: input.dialogue_answer
          ? '已收到本轮补充回答，可进入下一轮资料归并。'
          : '当前为初步立项判断，建议继续补齐关键问题。'
      };
    }

    function sourceGateSummary() {
      const audit = data.product_decision_desk?.latest_free_source_coverage_audit || {};
      const summary = audit.summary || {};
      const marketRankingAllowed = summary.enough_for_current_trial_based_global_market_ranking === true;
      return {
        contract: 'source_coverage_gate.v1',
        audit_ref: data.product_decision_desk?.latest_free_source_coverage_audit_json || null,
        generated_at: audit.generated_at || null,
        registered_source_coverage_complete: summary.registered_source_coverage_complete === true,
        major_region_count: summary.major_region_count || 0,
        trial_first_pass_ready_count: summary.trial_first_pass_ready_count || 0,
        enough_for_first_pass_global_overview: summary.enough_for_first_pass_global_overview === true,
        market_ranking_allowed: marketRankingAllowed,
        global_market_feedback_claim_allowed: summary.global_market_feedback_claim_allowed === true,
        web_search_fallback_required: summary.web_search_fallback_required === true,
        blocked_reason: marketRankingAllowed
          ? null
          : 'Registered sources cover the global map, but current trial evidence is not enough for global market ranking or acquisition execution.',
        region_gaps: (audit.region_coverage_audit || [])
          .filter((row) => row.status !== 'trial_first_pass_ready')
          .map((row) => ({
            region: row.region,
            status: row.status,
            missing_trial_signal_classes: row.missing_trial_signal_classes || []
          }))
      };
    }

    function buildDownstreamRoutes(input, classification, scores) {
      const sourceGate = sourceGateSummary();
      const routes = [];
      const addRoute = (route_id, label, status, reason, artifact) => routes.push({ route_id, label, status, reason, artifact });
      addRoute('product_page_draft', '生成产品页草案', scores.product_page_readiness >= 65 ? 'enabled_local_draft' : 'needs_more_info', '根据产品理解、规格、卖点和素材生成技术型产品页或RFQ页。', 'product_page_build_requirement.v1');
      addRoute('market_search_plan', '生成市场搜索计划', 'enabled_local_draft', '输出覆盖区域、数据源类别、新鲜度窗口和禁用外部源提示。', 'market_search_pack.v1');
      addRoute('customer_profile', '生成客户画像', input.target_notes || classification.sales_mode !== 'retail' ? 'enabled_local_draft' : 'needs_target_notes', '根据销售模式区分分销商、安装商、系统集成商、品牌方或零售买家。', 'buyer_profile_suggestion.v1');
      addRoute('quote_draft', '进入报价草案', scores.commercial_readiness >= 65 ? 'enabled_local_draft' : 'blocked_until_price_terms', '需要MOQ、阶梯价、样品政策、交期和包装物流信息。', 'quote_input_basis.v1');
      addRoute('acquisition_modules', '进入获客模块', sourceGate.market_ranking_allowed && scores.market_demand_fit >= 60 ? 'enabled_after_human_review' : 'blocked_until_source_gate', sourceGate.market_ranking_allowed ? '真实外联仍需人工审批，当前仅能生成获客方向。' : '当前信源试跑不足以支撑全球市场排序或真实获客推进，需要补齐区域证据或启用经调试的数据源。', 'downstream_route_pack.v1');
      return routes;
    }

    function buildLaunchReadinessVerdict(input, classification, scores, routes, sourceGate) {
      const enabledLocalRoutes = (routes || []).filter((route) => String(route.status || '').includes('enabled'));
      const missingCoreIdentity = !fieldKnown(input.product_name) || !fieldKnown(input.product_description);
      const missingCategoryFacts = Number(scores.data_completeness || 0) < 60 || Number(scores.category_fit || 0) < 60;
      const formalActionBlocked = !sourceGate.market_ranking_allowed || Number(scores.compliance_evidence || 0) < 60 || Number(scores.commercial_readiness || 0) < 70;
      const blockedReasons = [];
      if (!sourceGate.market_ranking_allowed) blockedReasons.push('market_ranking_blocked_by_source_gate');
      if (Number(scores.compliance_evidence || 0) < 60) blockedReasons.push('compliance_evidence_missing_or_low');
      if (Number(scores.commercial_readiness || 0) < 70) blockedReasons.push('commercial_terms_not_ready_for_quote');
      if (Number(scores.visual_readiness || 0) < 60) blockedReasons.push('asset_readiness_low');

      if (missingCoreIdentity || missingCategoryFacts) {
        return {
          contract: 'launch_readiness_verdict.v1',
          verdict: 'HOLD',
          label: '暂停进入下游，先补产品事实',
          reason: '产品身份、品类事实或关键规格资料不足，继续执行会产生低质量下游结果。',
          allowed_now: [],
          blocked_next: ['product_page_draft', 'quote_draft', 'market_ranking', 'real_outreach'],
          required_next_actions: ['补齐产品名称、用途、关键规格、材质、包装和证据来源。'],
          blocked_reasons: ['missing_core_product_facts']
        };
      }

      if (formalActionBlocked && enabledLocalRoutes.length) {
        return {
          contract: 'launch_readiness_verdict.v1',
          verdict: 'CONDITIONAL',
          label: '可做草案但禁止真实动作',
          reason: '当前资料足以生成本地草案，但证据、报价、市场覆盖或素材不足以支撑发布、报价、外联。',
          allowed_now: enabledLocalRoutes.map((route) => route.route_id),
          blocked_next: ['publish', 'quote_send', 'market_ranking', 'real_outreach'],
          required_next_actions: [
            '补齐证书/检测报告或明确不可用',
            '补齐MOQ、阶梯价、交期、包装重量体积和贸易条款',
            '通过目标市场数据源门禁后再做市场排序',
            '补齐产品图片、包装图、细节图和私标素材'
          ],
          blocked_reasons: blockedReasons
        };
      }

      if (!enabledLocalRoutes.length) {
        return {
          contract: 'launch_readiness_verdict.v1',
          verdict: 'BLOCKED',
          label: '阻断真实动作',
          reason: '当前没有可执行的本地下游路由，必须先补齐资料或解除人工门禁。',
          allowed_now: [],
          blocked_next: ['all_downstream_routes'],
          required_next_actions: ['返回产品输入对话，补齐AI追问字段。'],
          blocked_reasons: ['no_enabled_downstream_route']
        };
      }

      return {
        contract: 'launch_readiness_verdict.v1',
        verdict: 'GO',
        label: '可进入下游本地草案',
        reason: '产品事实、商业和证据达到本地草案标准；真实发布、报价和外联仍需人工审批。',
        allowed_now: enabledLocalRoutes.map((route) => route.route_id),
        blocked_next: ['publish', 'quote_send', 'real_outreach'],
        required_next_actions: ['进入下游本地草案后继续人工复核证据和价格。'],
        blocked_reasons: []
      };
    }

    function buildCoverageMatrix() {
      const registry = data.product_decision_desk?.data_sources || {};
      const regions = registry.coverage_regions || [];
      const sourceClasses = registry.source_classes || [];
      return regions.map((region) => ({
        region,
        source_classes: sourceClasses.map((sourceClass) => ({
          source_class: sourceClass,
          status: sourceClass === 'user_factory_source' ? 'local_user_source_available' : 'connector_disabled',
          freshness_window: sourceClass === 'user_factory_source' ? 'user-provided version/date required' : 'not_checked_no_external_call',
          coverage_note: sourceClass === 'user_factory_source'
            ? '产品事实来源，不代表市场需求。'
            : '需要启用对应数据源后才能形成区域证据。'
        }))
      }));
    }

    function buildMarketSearchPack(input, classification) {
      const registry = data.product_decision_desk?.data_sources || {};
      const sourceGate = sourceGateSummary();
      return {
        contract: 'market_search_pack.v1',
        product_id: productIdFromInput(input),
        generated_at: new Date().toISOString(),
        execution_mode: 'local_preview_no_external_search',
        source_channel_matrix_ref: data.product_decision_desk?.source_channel_matrix_json || null,
        latest_free_source_trial_ref: data.product_decision_desk?.latest_free_source_trial_json || null,
        query_plan: {
          product_terms: [input.product_name, classification.product_family_label, classification.sales_mode_label].filter(Boolean),
          buyer_terms: classification.selected_sales_modes,
          reference_url: input.reference_url || null,
          target_notes: input.target_notes || null
        },
        source_selection_policy: registry.source_selection_policy || null,
        source_gate: sourceGate,
        market_ranking_allowed: sourceGate.market_ranking_allowed,
        web_search_fallback_policy: data.product_decision_desk?.source_channel_matrix?.web_search_fallback_policy || null,
        data_sources: (registry.connectors || []).map((connector) => ({
          connector_id: connector.connector_id,
          label: connector.label,
          source_class: connector.source_class,
          enabled: connector.enabled === true,
          install_status: connector.install_status,
          current_action: connector.enabled ? 'local_user_source_only' : 'display_only_disabled',
          required_before_enable: connector.required_before_enable || []
        })),
        coverage_matrix: buildCoverageMatrix(),
        freshness_window: registry.default_policy?.result_must_include_freshness_window ? 'required_before_any_external_claim' : 'not_defined',
        source_confidence: 'insufficient_for_market_claim_without_external_connector',
        limitations: [
          '当前未调用外部搜索、海关、趋势、关税、平台或买家数据源。',
          '不能声称全球覆盖、海关覆盖或成交需求结论。',
          '正式市场建议必须先启用并验证数据源、记录访问时间和覆盖限制。'
        ],
        no_global_claim_unless_coverage_passed: true
      };
    }

    function buildDecisionPack(input, classification, recommendations, scores, questions, routes, understanding, readinessVerdict) {
      return {
        contract: 'product_decision_pack.v1',
        product_id: productIdFromInput(input),
        generated_at: new Date().toISOString(),
        source_refs: {
          uploaded_files: input.uploaded_files,
          reference_url: input.reference_url || null,
          local_preview_only: true
        },
        ai_understanding: understanding,
        category_recommendations: recommendations.product_family,
        sales_model_recommendations: recommendations.sales_mode,
        minimum_foreign_trade_fields: input.minimum_trade_fields || {},
        user_selection: {
          category_values: classification.selected_product_families,
          sales_model_values: classification.selected_sales_modes,
          manual_guidance: input.manual_guidance,
          dialogue_answer: input.dialogue_answer
        },
        missing_info_questions: questions,
        readiness_scores: scores,
        launch_readiness_verdict: readinessVerdict,
        downstream_routes: routes,
        gate_status: {
          source_coverage: sourceGateSummary(),
          tariff_and_compliance_claims: fieldKnown(input.minimum_trade_fields?.hs_code_candidates) ? 'draft_only_requires_human_confirmation' : 'blocked_until_hs_code_candidate',
          quote_send: fieldKnown(input.minimum_trade_fields?.incoterms) && fieldKnown(input.minimum_trade_fields?.currency) && fieldKnown(input.minimum_trade_fields?.payment_terms) ? 'draft_only_requires_price_review' : 'blocked_until_trade_terms',
          logistics_comparison: fieldKnown(input.minimum_trade_fields?.packing_weight_volume) ? 'draft_only_requires_freight_review' : 'low_confidence_until_packing_weight_volume'
        },
        evidence_status: {
          compliance: input.known_compliance ? 'user_provided_unverified' : 'missing_or_unknown',
          specs: input.known_specs ? 'user_provided_unverified' : 'missing_or_unknown',
          commercial_terms: input.commercial_terms ? 'user_provided_unverified' : 'missing_or_unknown',
          certification_claim_allowed: false
        }
      };
    }

    function buildDownstreamRoutePack(input, routes) {
      return {
        contract: 'downstream_route_pack.v1',
        product_id: productIdFromInput(input),
        generated_at: new Date().toISOString(),
        enabled_routes: routes.filter((route) => route.status.includes('enabled')),
        blocked_routes: routes.filter((route) => route.status.includes('blocked') || route.status.includes('needs')),
        human_gates: [
          'approve_product_facts',
          'approve_certification_claims',
          'approve_external_data_source_enable',
          'approve_market_ranking_after_source_gate',
          'approve_publish',
          'approve_real_outreach'
        ],
        source_gate: sourceGateSummary(),
        next_actions: routes.map((route) => ({
          route_id: route.route_id,
          action: route.status.includes('enabled') ? 'can_generate_local_draft' : 'collect_required_information',
          artifact: route.artifact
        })),
        artifact_refs: data.product_decision_desk || {}
      };
    }

    function buildProductAnalysis(input) {
      const framework = data.product_input_framework;
      const options = input.product_options || {};
      const productFamilyRecommendations = inferProductFamily(input);
      const selectedFamilyValues = selectedRecommendationValues(productFamilyRecommendations, state.productFamilySelections);
      const primaryFamily = recommendationByValue(productFamilyRecommendations, selectedFamilyValues[0]) || productFamilyRecommendations[0];
      const salesModeRecommendations = inferSalesModes(input, primaryFamily?.value);
      const selectedSalesValues = selectedRecommendationValues(salesModeRecommendations, state.salesModeSelections);
      const primarySales = recommendationByValue(salesModeRecommendations, selectedSalesValues[0]) || salesModeRecommendations[0];
      const classification = {
        product_family: primaryFamily?.value || 'category_unknown_needs_more_info',
        product_family_label: primaryFamily?.label || '待AI继续判断',
        product_family_confidence: primaryFamily?.confidence || 40,
        selected_product_families: selectedFamilyValues,
        product_family_source: state.productFamilySelections.length ? 'human_selected_after_ai_suggestion' : 'ai_suggested',
        sales_mode: primarySales?.value || 'mixed_unknown',
        sales_mode_label: primarySales?.label || '复合模式待判断',
        sales_mode_confidence: primarySales?.confidence || 40,
        selected_sales_modes: selectedSalesValues,
        sales_mode_source: state.salesModeSelections.length ? 'human_selected_after_ai_suggestion' : 'ai_suggested',
        likely_channel: primarySales?.value === 'retail' ? 'retail listing / marketplace' : 'B2B wholesale / RFQ / project procurement',
        product_page_required: options.product_page_required || 'yes_generate',
        current_product_page_scope: primaryFamily?.value === 'structured_cabling' ? 'technical_detail_page + RFQ landing page' : 'category_specific_page_pending'
      };
      const scores = scoreProduct(input, classification);
      if (input.known_specs) scores.data_completeness = Math.min(100, scores.data_completeness + 8);
      if (input.known_compliance) scores.compliance_evidence = Math.min(100, scores.compliance_evidence + 18);
      if (input.commercial_terms) scores.commercial_readiness = Math.min(100, scores.commercial_readiness + 16);
      if (input.target_notes) scores.market_demand_fit = Math.min(100, scores.market_demand_fit + 8);
      const sellingPoints = classification.product_family === 'structured_cabling'
        ? ['适合结构化布线项目配套', '支持私标和型号定制', '可围绕批量采购、样品确认、交期和兼容性建立询盘', '适合与配线架、面板、工具形成组合销售']
        : ['需要先完成品类规则判断', '根据销售模式生成零售或批发页面', '围绕目标买家补齐规格、证据和价格物流'];
      const questions = buildCompletionQuestions(input, classification);
      const understanding = buildAiUnderstanding(input, classification, sellingPoints);
      const routes = buildDownstreamRoutes(input, classification, scores);
      const sourceGate = sourceGateSummary();
      const readinessVerdict = buildLaunchReadinessVerdict(input, classification, scores, routes, sourceGate);
      const recommendations = {
        product_family: productFamilyRecommendations,
        sales_mode: salesModeRecommendations,
        selected_policy: 'AI先建议，人工可单选、多选、补充说明或继续对话；真实上架前仍需人工确认。'
      };
      const productDecisionPack = buildDecisionPack(input, classification, recommendations, scores, questions, routes, understanding, readinessVerdict);
      const marketSearchPack = buildMarketSearchPack(input, classification);
      const downstreamRoutePack = buildDownstreamRoutePack(input, routes);
      return {
        contract: 'normalized_product_input_preview.v1',
        generated_at: new Date().toISOString(),
        source: 'dashboard_local_preview',
        product_input: input,
        ai_recommendations: recommendations,
        classification,
        ai_understanding: understanding,
        feature_and_selling_points: sellingPoints,
        scoring: scores,
        readiness_verdict: readinessVerdict,
        missing_content_prompts: questions.map((item) => item.question),
        category_specific_checks: framework.intake_sections.flatMap((section) => section.category_rules || []),
        recommended_downstream_routes: routes,
        output_packages: {
          product_decision_pack: productDecisionPack,
          market_search_pack: marketSearchPack,
          downstream_route_pack: downstreamRoutePack
        },
        safety: {
          ...framework.safety,
          external_search_called: false,
          external_connectors_enabled: false
        }
      };
    }

    function renderRecommendationCards(items, selectedValues, type) {
      const selectedSet = new Set(selectedValues.length ? selectedValues : (items[0] ? [items[0].value] : []));
      return (items || []).slice(0, 4).map((item) => {
        const selected = selectedSet.has(item.value);
        return '<article class="recommendation-card" data-selected="' + selected + '">' +
          '<strong>' + escapeHtml(item.label) + '</strong>' +
          '<span>置信度 ' + escapeHtml(item.confidence) + ' / ' + (selected ? '当前采用' : '备选建议') + '</span>' +
          '<small>' + escapeHtml((item.reasons || []).join(' / ')) + '</small>' +
          '<button class="btn" type="button" data-select-' + type + '="' + escapeHtml(item.value) + '">' + (selected ? '取消选择' : '采用此建议') + '</button>' +
        '</article>';
      }).join('');
    }

    function renderRecommendations(analysis) {
      document.getElementById('category-recommendations').innerHTML =
        renderRecommendationCards(analysis.ai_recommendations?.product_family || [], state.productFamilySelections, 'family');
      document.getElementById('sales-mode-recommendations').innerHTML =
        renderRecommendationCards(analysis.ai_recommendations?.sales_mode || [], state.salesModeSelections, 'sales');
    }

    function renderDecisionDeskMeta(analysis) {
      const registry = data.product_decision_desk?.data_sources || {};
      const externalEnabled = (registry.connectors || []).filter((item) => item.enabled && item.connector_id !== 'user_factory_source_collection').length;
      document.getElementById('decision-desk-meta').innerHTML = [
        ['3', '本地输出契约'],
        [registry.coverage_regions?.length || 0, '覆盖区域要求'],
        [registry.connectors?.length || 0, '数据源入口'],
        [externalEnabled, '已启用外部源']
      ].map(([value, label]) => '<div><strong>' + escapeHtml(value) + '</strong><span>' + escapeHtml(label) + '</span></div>').join('');
    }

    function renderAiUnderstanding(analysis) {
      const item = analysis.ai_understanding || {};
      document.getElementById('ai-understanding-list').innerHTML = [
        ['产品身份', item.product_identity],
        ['推断品类', item.inferred_category],
        ['销售模式', item.inferred_sales_model],
        ['采购动机', item.buyer_reason_to_buy],
        ['证据风险', item.evidence_risk],
        ['资料状态', item.data_quality_note]
      ].map(([label, value]) => '<div class="decision-list-item"><strong>' + escapeHtml(label) + '</strong><span>' + escapeHtml(value || '') + '</span></div>').join('');
    }

    function renderCompletionQuestions(analysis) {
      document.getElementById('completion-question-list').innerHTML = (analysis.output_packages?.product_decision_pack?.missing_info_questions || [])
        .map((item) => '<div class="decision-list-item"><strong>' + escapeHtml(item.question_id) + '</strong><span>' + escapeHtml(item.question) + '</span><small>' + escapeHtml(item.status) + '</small></div>')
        .join('');
    }

    function routeStatusKind(status) {
      const raw = String(status || '').toLowerCase();
      if (raw.includes('blocked')) return 'blocked';
      if (raw.includes('needs') || raw.includes('wait') || raw.includes('pending') || raw.includes('collect')) return 'needs';
      if (raw.includes('enabled') || raw.includes('ready') || raw.includes('can_generate')) return 'ready';
      return 'needs';
    }

    function routeStatusLabel(kind) {
      if (kind === 'ready') return '可执行';
      if (kind === 'blocked') return '已阻断';
      return '需补齐';
    }

    function renderProductStatus(analysis) {
      const classification = analysis.classification || {};
      const scores = analysis.scoring || {};
      const routes = analysis.output_packages?.product_decision_pack?.downstream_routes || [];
      const missing = analysis.output_packages?.product_decision_pack?.missing_info_questions || [];
      const gate = analysis.output_packages?.market_search_pack?.source_gate || sourceGateSummary();
      const verdict = analysis.readiness_verdict || analysis.output_packages?.product_decision_pack?.launch_readiness_verdict || {};
      const routeKinds = routes.map((route) => routeStatusKind(route.status));
      const readyCount = routeKinds.filter((kind) => kind === 'ready').length;
      const blockedCount = routeKinds.filter((kind) => kind === 'blocked').length;
      const needsCount = routeKinds.filter((kind) => kind === 'needs').length;
      const productPageKind = Number(scores.product_page_readiness || 0) >= 65 ? 'ready' : 'needs';
      const quoteKind = Number(scores.commercial_readiness || 0) >= 65 ? 'ready' : 'needs';
      const sourceKind = gate.market_ranking_allowed ? 'ready' : 'blocked';

      const verdictTarget = document.getElementById('launch-readiness-verdict');
      if (verdictTarget) {
        verdictTarget.dataset.verdict = verdict.verdict || 'HOLD';
        verdictTarget.innerHTML = [
          '<strong>' + escapeHtml((verdict.verdict || 'HOLD') + ' · ' + (verdict.label || '等待产品资料')) + '</strong>',
          '<span>' + escapeHtml(verdict.reason || '补齐产品事实后再生成立项建议。') + '</span>',
          '<small>允许：' + escapeHtml((verdict.allowed_now || []).join(' / ') || '暂无') +
            ' · 阻断：' + escapeHtml((verdict.blocked_next || []).join(' / ') || '暂无') + '</small>'
        ].join('');
      }

      document.getElementById('product-decision-status').innerHTML = [
        '<div class="status-line"><span>产品</span><strong>' + escapeHtml(analysis.product_input?.product_name || '待输入产品名称') + '</strong></div>',
        '<div class="status-line"><span>AI品类</span><strong>' + escapeHtml(classification.product_family_label || '待判断') + ' · ' + escapeHtml(classification.product_family_confidence || 0) + '%</strong></div>',
        '<div class="status-line"><span>销售模式</span><strong>' + escapeHtml(classification.sales_mode_label || '待判断') + ' · ' + escapeHtml(classification.sales_mode_confidence || 0) + '%</strong></div>',
        '<div class="status-line"><span>下游路由</span><strong>' + escapeHtml(readyCount) + ' 可执行 / ' + escapeHtml(needsCount) + ' 需补齐 / ' + escapeHtml(blockedCount) + ' 阻断</strong></div>',
        '<div class="status-chip-row">',
          '<span class="status-chip" data-status="' + productPageKind + '">产品页 ' + routeStatusLabel(productPageKind) + '</span>',
          '<span class="status-chip" data-status="' + quoteKind + '">报价 ' + routeStatusLabel(quoteKind) + '</span>',
          '<span class="status-chip" data-status="' + sourceKind + '">市场排序 ' + routeStatusLabel(sourceKind) + '</span>',
          '<span class="status-chip" data-status="blocked">真实外联禁用</span>',
        '</div>'
      ].join('');

      document.getElementById('product-missing-summary').innerHTML = missing.slice(0, 2).map((item) =>
        '<div class="decision-list-item"><strong>' + escapeHtml(item.status || '待补齐') + '</strong><span>' + escapeHtml(item.question || '') + '</span></div>'
      ).join('') || '<div class="decision-list-item"><strong>资料状态</strong><span>当前没有新的补齐问题。</span></div>';
    }

    function renderDownstreamRoutes(analysis) {
      const routes = analysis.output_packages?.product_decision_pack?.downstream_routes || [];
      document.getElementById('downstream-route-list').innerHTML = routes
        .map((item) => {
          const kind = routeStatusKind(item.status);
          return '<div class="decision-list-item">' +
            '<strong>' + escapeHtml(item.label || item.route_id) + '</strong>' +
            '<span class="route-status" data-status="' + kind + '">' + routeStatusLabel(kind) + '</span>' +
            '<span>' + escapeHtml(item.reason || '') + '</span>' +
            '<small>' + escapeHtml(item.artifact || '') + '</small>' +
          '</div>';
        })
        .join('');
    }

    function renderDataSources() {
      const registry = data.product_decision_desk?.data_sources || {};
      document.getElementById('data-source-grid').innerHTML = (registry.connectors || []).map((connector) =>
        '<article class="source-card" data-enabled="' + (connector.enabled === true) + '">' +
          '<strong>' + escapeHtml(connector.label) + '</strong>' +
          '<span class="badge ' + (connector.enabled ? 'covered' : 'new_module') + '">' + escapeHtml(connector.enabled ? 'local only' : 'disabled') + '</span>' +
          '<small>' + escapeHtml(connector.source_class) + '</small>' +
          '<small>' + escapeHtml(connector.coverage_rule || '') + '</small>' +
        '</article>'
      ).join('');
    }

    function renderSourceMatrix() {
      const matrix = data.product_decision_desk?.source_channel_matrix || {};
      const channels = matrix.source_channels || [];
      const trial = data.product_decision_desk?.latest_free_source_trial;
      const coverage = data.product_decision_desk?.global_region_source_coverage;
      const audit = data.product_decision_desk?.latest_free_source_coverage_audit;
      const gate = sourceGateSummary();
      const summary = document.getElementById('source-matrix-summary');
      const table = document.getElementById('source-matrix-table');
      if (!summary || !table) return;
      summary.innerHTML = [
        '<div class="decision-list-item">',
        '<strong>Source selection</strong>',
        '<span>' + escapeHtml(matrix.purpose || 'Goal-first source selection matrix') + '</span>',
        '<small>Channels: ' + escapeHtml(channels.length) +
          ' / Regions: ' + escapeHtml((coverage?.major_regions || []).length || 0) +
          ' / Latest free trial: ' + escapeHtml(trial?.generated_at || 'not generated yet') +
          ' / Coverage audit: ' + escapeHtml(audit?.generated_at || 'not generated yet') + '</small>',
        '<small>Complete global feedback allowed: ' + escapeHtml(String(audit?.summary?.global_market_feedback_claim_allowed === true)) +
          ' / First-pass overview: ' + escapeHtml(String(audit?.summary?.enough_for_first_pass_global_overview === true)) + '</small>',
        '<small>Trial-ready regions: ' + escapeHtml(gate.trial_first_pass_ready_count) + '/' + escapeHtml(gate.major_region_count) +
          ' / Market ranking allowed: ' + escapeHtml(String(gate.market_ranking_allowed)) +
          ' / Web fallback required: ' + escapeHtml(String(gate.web_search_fallback_required)) + '</small>',
        gate.blocked_reason ? '<small>Gate: ' + escapeHtml(gate.blocked_reason) + '</small>' : '',
        '</div>'
      ].join('');
      table.innerHTML = channels.map((channel) =>
        '<tr>' +
          '<td>' + escapeHtml(channel.label || channel.source_id) + '</td>' +
          '<td>' + escapeHtml(channel.free_level || '') + '</td>' +
          '<td>' + escapeHtml((channel.region_scope || []).join(', ')) + '</td>' +
          '<td>' + escapeHtml('Can: ' + (channel.can_prove || []).join(', ') + ' / Cannot: ' + (channel.cannot_prove || []).join(', ')) + '</td>' +
        '</tr>'
      ).join('');
    }

    function renderOutputPackage(analysis) {
      const packages = analysis.output_packages || {};
      const target = state.outputTab === 'search'
        ? packages.market_search_pack
        : state.outputTab === 'route'
          ? packages.downstream_route_pack
          : packages.product_decision_pack;
      document.getElementById('product-analysis-output').textContent = JSON.stringify(target || {}, null, 2);
      document.querySelectorAll('button[data-output-tab]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.outputTab === state.outputTab));
      });
    }

    function renderProductAnalysis(analysis) {
      renderDecisionDeskMeta(analysis);
      renderProductStatus(analysis);
      renderRecommendations(analysis);
      renderAiUnderstanding(analysis);
      renderCompletionQuestions(analysis);
      renderDownstreamRoutes(analysis);
      renderDataSources();
      renderSourceMatrix();
      const scoreEntries = Object.entries(analysis.scoring || {});
      document.getElementById('product-score-grid').innerHTML = scoreEntries.map(([key, value]) =>
        '<div class="score-card"><strong>' + escapeHtml(value) + '</strong><span>' + escapeHtml(key) + '</span></div>'
      ).join('');
      renderOutputPackage(analysis);
    }

    function loadCurrentProduct() {
      const sample = data.product_input_framework.current_sample_product;
      state.productFamilyOverride = '';
      state.salesModeOverride = '';
      state.productFamilySelections = [];
      state.salesModeSelections = [];
      document.getElementById('product-name').value = sample.product_name;
      document.getElementById('product-description').value =
        sample.known_strengths.join('\\n') + '\\n\\n需要补齐：\\n' + sample.current_missing_items.join('\\n');
      document.getElementById('product-guidance').value = '';
      document.getElementById('reference-url').value = '';
      document.getElementById('target-notes').value = '优先B2B批发、项目采购、OEM/私标；目标客户可包括分销商、安装商、系统集成商和工程采购。';
      document.getElementById('known-specs').value = '';
      document.getElementById('known-compliance').value = '';
      document.getElementById('commercial-terms').value = '';
      document.getElementById('minimum-trade-fields').value = [
        'hs_code_candidates=8536.69; 8544.42',
        'target_country_candidates=United States; Germany; United Arab Emirates; Brazil; South Africa; Singapore; Japan; Australia',
        'incoterms=EXW/FOB/CIF pending',
        'currency=USD',
        'payment_terms=T/T pending',
        'price_validity=15 days draft',
        'packing_weight_volume=unknown',
        'claim_whitelist=private label support; quantity price tiers; custom model support',
        'claim_blacklist=UL/ETL/CE/RoHS or performance claims blocked until certificate and test report are confirmed'
      ].join('\\n');
      const dialogue = document.getElementById('dialogue-answer');
      if (dialogue) dialogue.value = '';
      document.getElementById('product-options').value = [
        'product_page_required=yes_generate',
        'third_party_test_report_status=unknown',
        'material_spec_status=partial',
        'private_label_supported=yes',
        'custom_model_supported=yes',
        'quantity_price_tiers=yes'
      ].join('\\n');
      renderProductAnalysis(buildProductAnalysis(currentProductInput()));
    }

    function runModuleTrial(moduleId) {
      const plan = planForModule(moduleId);
      if (!plan) return;
      const analysis = buildProductAnalysis(currentProductInput());
      const result = {
        ...(plan.sample_trial_result || {}),
        generated_at: new Date().toISOString(),
        product_preview_used: {
          product_name: analysis.product_input.product_name,
          product_family: analysis.classification.product_family,
          product_family_label: analysis.classification.product_family_label,
          sales_mode: analysis.classification.sales_mode,
          sales_mode_label: analysis.classification.sales_mode_label,
          readiness_scores: analysis.scoring,
          decision_pack_contract: analysis.output_packages.product_decision_pack.contract,
          market_search_pack_contract: analysis.output_packages.market_search_pack.contract,
          downstream_route_pack_contract: analysis.output_packages.downstream_route_pack.contract
        },
        trial_note: '本结果由前端本地dry-run生成，用于检查模块逻辑、输入输出和验证标准，不代表真实外部数据结论。'
      };
      const target = document.getElementById('trial-result-' + moduleId);
      if (target) target.textContent = JSON.stringify(result, null, 2);
    }

    function renderTimeline() {
      document.getElementById('timeline').innerHTML = data.implementation_path
        .map((step) => '<div class="step"><div class="step-code">' + escapeHtml(step.step_id) + '</div><div>' +
          badge(step.status) +
          '<h3>' + escapeHtml(step.label) + '</h3>' +
          '<p>' + escapeHtml((step.outputs || []).join(' / ')) + '</p>' +
        '</div></div>')
        .join('');
    }

    function renderSoftware() {
      document.getElementById('software-table').innerHTML = data.software_catalog
        .map((software) => '<div class="software-row"><strong><span>' + escapeHtml(software.label) + '</span><span>' + escapeHtml(software.default_state) + '</span></strong>' +
          '<p>' + escapeHtml(software.category) + ' / ' + escapeHtml(software.allowed_mode) + '</p>' +
          '<p>开启前置：' + escapeHtml((software.required_before_enable || []).join(' / ')) + '</p>' +
        '</div>')
        .join('');
    }

    function renderSync() {
      const policy = data.sync_policy;
      const command = policy.regenerate_command + ' && node cross-border-ecommerce-ai-route/scripts/write-cross-border-status.mjs';
      document.getElementById('sync-panel').innerHTML = [
        '<p>控制包：<code>' + escapeHtml(policy.control_pack) + '</code></p>',
        '<p>AI计划JSON：<code>' + escapeHtml(data.ai_implementation_plan?.display_mode?.machine_json || '') + '</code></p>',
        '<p>AI计划MD：<code>' + escapeHtml(data.ai_implementation_plan?.display_mode?.operator_markdown || '') + '</code></p>',
        '<p>产品输入JSON：<code>' + escapeHtml(data.ai_implementation_plan?.product_input_framework?.machine_json || '') + '</code></p>',
        '<p>产品输入MD：<code>' + escapeHtml(data.ai_implementation_plan?.product_input_framework?.operator_markdown || '') + '</code></p>',
        '<p>产品立项决策台JSON：<code>' + escapeHtml(data.product_decision_desk?.execution_plan_json || '') + '</code></p>',
        '<p>产品立项决策台MD：<code>' + escapeHtml(data.product_decision_desk?.execution_plan_md || '') + '</code></p>',
        '<p>数据源注册表：<code>' + escapeHtml(data.product_decision_desk?.data_source_registry || '') + '</code></p>',
        '<p>信源矩阵JSON：<code>' + escapeHtml(data.product_decision_desk?.source_channel_matrix_json || '') + '</code></p>',
        '<p>信源矩阵MD：<code>' + escapeHtml(data.product_decision_desk?.source_channel_matrix_md || '') + '</code></p>',
        '<p>全球区域覆盖JSON：<code>' + escapeHtml(data.product_decision_desk?.global_region_source_coverage_json || '') + '</code></p>',
        '<p>全球区域覆盖MD：<code>' + escapeHtml(data.product_decision_desk?.global_region_source_coverage_md || '') + '</code></p>',
        '<p>产品控制台外贸经理审计JSON：<code>' + escapeHtml(data.product_decision_desk?.product_console_manager_audit_json || '') + '</code></p>',
        '<p>产品控制台外贸经理审计MD：<code>' + escapeHtml(data.product_decision_desk?.product_console_manager_audit_md || '') + '</code></p>',
        '<p>当前方向记录JSON：<code>' + escapeHtml(data.product_decision_desk?.direction_record_json || '') + '</code></p>',
        '<p>当前方向记录MD：<code>' + escapeHtml(data.product_decision_desk?.direction_record_md || '') + '</code></p>',
        '<p>剩余能力执行计划JSON：<code>' + escapeHtml(data.product_decision_desk?.remaining_capability_execution_plan_json || '') + '</code></p>',
        '<p>剩余能力执行计划MD：<code>' + escapeHtml(data.product_decision_desk?.remaining_capability_execution_plan_md || '') + '</code></p>',
        '<p>品类画像覆盖报告JSON：<code>' + escapeHtml(data.product_decision_desk?.category_profile_coverage_report_json || '') + '</code></p>',
        '<p>品类画像覆盖报告MD：<code>' + escapeHtml(data.product_decision_desk?.category_profile_coverage_report_md || '') + '</code></p>',
        '<p>C执行报告JSON：<code>' + escapeHtml(data.product_decision_desk?.capability_c_execution_report_json || '') + '</code></p>',
        '<p>C执行报告MD：<code>' + escapeHtml(data.product_decision_desk?.capability_c_execution_report_md || '') + '</code></p>',
        '<p>剩余能力执行报告JSON：<code>' + escapeHtml(data.product_decision_desk?.remaining_capabilities_execution_report_json || '') + '</code></p>',
        '<p>剩余能力执行报告MD：<code>' + escapeHtml(data.product_decision_desk?.remaining_capabilities_execution_report_md || '') + '</code></p>',
        '<p>完成后缺陷评估JSON：<code>' + escapeHtml(data.product_decision_desk?.post_completion_defect_assessment_json || '') + '</code></p>',
        '<p>完成后缺陷评估MD：<code>' + escapeHtml(data.product_decision_desk?.post_completion_defect_assessment_md || '') + '</code></p>',
        '<p>最新产品立项保存：<code>' + escapeHtml(data.product_decision_desk?.latest_saved_product_decision_json || '') + '</code></p>',
        '<p>产品立项决策规则JSON：<code>' + escapeHtml(data.product_decision_desk?.product_launch_decision_rules_json || '') + '</code></p>',
        '<p>产品立项决策规则MD：<code>' + escapeHtml(data.product_decision_desk?.product_launch_decision_rules_md || '') + '</code></p>',
        '<p>免费信源试跑：<code>' + escapeHtml(data.product_decision_desk?.latest_free_source_trial_json || '') + '</code></p>',
        '<p>免费信源覆盖审计：<code>' + escapeHtml(data.product_decision_desk?.latest_free_source_coverage_audit_json || '') + '</code></p>',
        '<p>Promotion/social execution status: <code>' + escapeHtml(data.promotion_social_automation?.execution_status_index_json || '') + '</code></p>',
        '<p>Promotion plan: <code>' + escapeHtml(data.promotion_social_automation?.promotion_plan_json || '') + '</code></p>',
        '<p>Channel specialized design: <code>' + escapeHtml(data.promotion_social_automation?.channel_specialized_design_json || '') + '</code></p>',
        '<p>Auto reply bot design: <code>' + escapeHtml(data.promotion_social_automation?.auto_reply_bot_design_json || '') + '</code></p>',
        '<p>Social connector registry: <code>' + escapeHtml(data.promotion_social_automation?.social_connector_registry_json || '') + '</code></p>',
        '<p>Social connection status: <code>' + escapeHtml(data.promotion_social_automation?.connection_status_json || '') + '</code></p>',
        '<p>Promotion/social validation: <code>' + escapeHtml(data.promotion_social_automation?.validation_report_json || '') + '</code></p>',
        '<p>试执行结果：<code>cross-border-ecommerce-ai-route/runtime/growth-sales-automation/sample-runs/**</code></p>',
        '<p>网页：<code>' + escapeHtml(policy.dashboard) + '</code></p>',
        '<p>星云：<code>' + escapeHtml(policy.nebula_projection) + '</code></p>',
        '<p>状态：<code>' + escapeHtml(policy.status_overlay) + '</code></p>',
        '<p>再生成：<code id="regen-command">' + escapeHtml(command) + '</code></p>',
        '<button class="btn primary" type="button" id="copy-command">复制再生成命令</button>',
        '<button class="btn" type="button" disabled>真实执行默认禁用</button>'
      ].join('');
      document.getElementById('copy-command').addEventListener('click', async () => {
        await navigator.clipboard.writeText(command);
        document.getElementById('copy-command').textContent = '已复制';
      });
    }

    function wireEvents() {
      document.querySelectorAll('[data-console-tab]').forEach((button) => {
        button.addEventListener('click', () => setConsoleView(button.dataset.consoleTab));
      });
      const settingsToggle = document.getElementById('product-settings-toggle');
      const settingsPanel = document.getElementById('product-settings-panel');
      settingsToggle?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const nextHidden = !settingsPanel.hidden;
        settingsPanel.hidden = nextHidden;
        settingsToggle.setAttribute('aria-expanded', String(!nextHidden));
      });
      document.getElementById('apply-chat-message')?.addEventListener('click', () => {
        applyChatProductInput();
      });
      document.getElementById('product-chat-input')?.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          applyChatProductInput();
        }
      });
      document.getElementById('product-attach-button')?.addEventListener('click', () => {
        document.getElementById('product-files')?.click();
      });
      document.getElementById('product-files')?.addEventListener('change', () => {
        updateFileSummary();
        renderProductAnalysis(buildProductAnalysis(currentProductInput()));
      });
      document.querySelectorAll('[data-product-option]').forEach((input) => {
        input.addEventListener('change', () => {
          productOptionsFromCheckboxes();
          renderProductAnalysis(buildProductAnalysis(currentProductInput()));
        });
      });
      document.getElementById('generate-product-analysis').addEventListener('click', () => {
        if (document.getElementById('product-chat-input')?.value?.trim()) {
          applyChatProductInput();
        }
        productOptionsFromCheckboxes();
        renderProductAnalysis(buildProductAnalysis(currentProductInput()));
      });
      document.getElementById('load-current-product').addEventListener('click', () => {
        loadCurrentProduct();
      });
      document.getElementById('product-input-section').addEventListener('click', (event) => {
        const familyButton = event.target.closest('button[data-select-family]');
        const salesButton = event.target.closest('button[data-select-sales]');
        const outputButton = event.target.closest('button[data-output-tab]');
        if (familyButton) {
          toggleSelection(state.productFamilySelections, familyButton.dataset.selectFamily);
          state.productFamilyOverride = state.productFamilySelections[0] || '';
          state.salesModeSelections = [];
          state.salesModeOverride = '';
          renderProductAnalysis(buildProductAnalysis(currentProductInput()));
        }
        if (salesButton) {
          toggleSelection(state.salesModeSelections, salesButton.dataset.selectSales);
          state.salesModeOverride = state.salesModeSelections[0] || '';
          renderProductAnalysis(buildProductAnalysis(currentProductInput()));
        }
        if (outputButton) {
          state.outputTab = outputButton.dataset.outputTab;
          renderProductAnalysis(buildProductAnalysis(currentProductInput()));
        }
      });
      document.getElementById('reset-module-filters').addEventListener('click', () => {
        resetModuleFilters();
      });
      document.getElementById('query').addEventListener('input', (event) => {
        state.query = event.target.value;
        renderPhases();
        renderAiPlan();
        renderModuleOverview();
      });
      document.getElementById('phase-filter').addEventListener('change', (event) => {
        state.phase = event.target.value;
        renderPhases();
        renderAiPlan();
        renderModuleOverview();
      });
      document.getElementById('coverage-filter').addEventListener('change', (event) => {
        state.coverage = event.target.value;
        renderPhases();
        renderAiPlan();
        renderModuleOverview();
      });
      document.getElementById('software-filter').addEventListener('change', (event) => {
        state.software = event.target.value;
        renderPhases();
        renderAiPlan();
        renderModuleOverview();
      });
      document.getElementById('module-overview-list').addEventListener('click', (event) => {
        const openButton = event.target.closest('button[data-open-plan]');
        const runButton = event.target.closest('button[data-run-module]');
        if (openButton) {
          openPlanNode(openButton.dataset.openPlan);
        }
        if (runButton) {
          openPlanNode(runButton.dataset.runModule);
          runModuleTrial(runButton.dataset.runModule);
        }
      });
      document.getElementById('ai-plan-list').addEventListener('click', (event) => {
        const runButton = event.target.closest('button[data-run-module]');
        if (!runButton) return;
        event.preventDefault();
        event.stopPropagation();
        const details = runButton.closest('details');
        if (details) details.open = true;
        runModuleTrial(runButton.dataset.runModule);
      });
      document.getElementById('phase-list').addEventListener('click', (event) => {
        const button = event.target.closest('button[data-module]');
        if (!button) return;
        const module = allModules().find((item) => item.module_id === button.dataset.module);
        if (!module) return;
        alert(module.label + '\\n\\n硬边界：\\n' + (module.hard_boundaries || []).join('\\n') + '\\n\\n人工门禁：\\n' + (module.human_gates || []).join('\\n'));
      });
    }

    renderSummary();
    renderStatusGrid();
    renderFilters();
    renderPhases();
    renderAiPlan();
    renderModuleOverview();
    syncCheckboxesFromProductOptions();
    updateFileSummary();
    renderProductAnalysis(buildProductAnalysis(currentProductInput()));
    renderTimeline();
    renderSoftware();
    renderSync();
    wireEvents();
  </script>
</body>
</html>
`
}

function updateProjection(controlPack) {
  const projection = JSON.parse(readFileSync(projectionPath, 'utf8'))
  const branchOverlay = {
    branch_id: controlPack.branch_id,
    label: controlPack.label,
    status: 'draft_only_synced',
    relationship: controlPack.relationship_to_canonical_flow.mode,
    phase_count: controlPack.summary.phase_count,
    module_count: controlPack.summary.module_count,
    software_count: controlPack.summary.software_count,
    mapped_stage_ids: controlPack.summary.mapped_stage_ids,
    control_pack: projectRef('runtime/growth-sales-automation/branch-control-pack.json'),
    dashboard: projectRef('runtime/growth-sales-automation/dashboard/index.html'),
    ai_plan_json: projectRef('runtime/growth-sales-automation/ai-implementation-plan.json'),
    ai_plan_md: projectRef('runtime/growth-sales-automation/ai-implementation-plan.md'),
    product_input_json: projectRef('runtime/growth-sales-automation/product-input-framework.json'),
    product_input_md: projectRef('runtime/growth-sales-automation/product-input-framework.md'),
    product_decision_desk_plan_json: projectRef('runtime/growth-sales-automation/product-decision-desk/execution-plan.json'),
    product_decision_desk_plan_md: projectRef('runtime/growth-sales-automation/product-decision-desk/execution-plan.md'),
    product_decision_desk_data_sources: projectRef('runtime/growth-sales-automation/product-decision-desk/data-source-registry.json'),
    product_decision_desk_source_matrix_json: projectRef('runtime/growth-sales-automation/product-decision-desk/source-channel-matrix.json'),
    product_decision_desk_source_matrix_md: projectRef('runtime/growth-sales-automation/product-decision-desk/source-channel-matrix.md'),
    product_decision_desk_global_region_source_coverage_json: projectRef('runtime/growth-sales-automation/product-decision-desk/global-region-source-coverage.json'),
    product_decision_desk_global_region_source_coverage_md: projectRef('runtime/growth-sales-automation/product-decision-desk/global-region-source-coverage.md'),
    product_decision_desk_product_console_manager_audit_json: projectRef('runtime/growth-sales-automation/product-decision-desk/product-console-manager-audit.json'),
    product_decision_desk_product_console_manager_audit_md: projectRef('runtime/growth-sales-automation/product-decision-desk/product-console-manager-audit.md'),
    product_decision_desk_direction_record_json: projectRef('runtime/growth-sales-automation/product-decision-desk/current-direction-record.json'),
    product_decision_desk_direction_record_md: projectRef('runtime/growth-sales-automation/product-decision-desk/current-direction-record.md'),
    product_decision_desk_remaining_capability_execution_plan_json: projectRef('runtime/growth-sales-automation/product-decision-desk/remaining-capability-execution-plan.json'),
    product_decision_desk_remaining_capability_execution_plan_md: projectRef('runtime/growth-sales-automation/product-decision-desk/remaining-capability-execution-plan.md'),
    product_decision_desk_category_profile_coverage_report_json: projectRef('runtime/growth-sales-automation/product-decision-desk/category-profile-coverage-report.json'),
    product_decision_desk_category_profile_coverage_report_md: projectRef('runtime/growth-sales-automation/product-decision-desk/category-profile-coverage-report.md'),
    product_decision_desk_capability_c_execution_report_json: projectRef('runtime/growth-sales-automation/product-decision-desk/capability-c-execution-report.json'),
    product_decision_desk_capability_c_execution_report_md: projectRef('runtime/growth-sales-automation/product-decision-desk/capability-c-execution-report.md'),
    product_decision_desk_remaining_capabilities_execution_report_json: projectRef('runtime/growth-sales-automation/product-decision-desk/remaining-capabilities-execution-report.json'),
    product_decision_desk_remaining_capabilities_execution_report_md: projectRef('runtime/growth-sales-automation/product-decision-desk/remaining-capabilities-execution-report.md'),
    product_decision_desk_post_completion_defect_assessment_json: projectRef('runtime/growth-sales-automation/product-decision-desk/post-completion-defect-assessment.json'),
    product_decision_desk_post_completion_defect_assessment_md: projectRef('runtime/growth-sales-automation/product-decision-desk/post-completion-defect-assessment.md'),
    product_decision_desk_latest_saved_product_decision_json: projectRef('runtime/growth-sales-automation/product-decision-desk/latest-saved-product-decision.json'),
    product_decision_desk_launch_rules_json: projectRef('runtime/growth-sales-automation/product-decision-desk/product-launch-decision-rules.json'),
    product_decision_desk_launch_rules_md: projectRef('runtime/growth-sales-automation/product-decision-desk/product-launch-decision-rules.md'),
    product_decision_desk_free_source_trial_json: projectRef('runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-trial.json'),
    product_decision_desk_free_source_trial_md: projectRef('runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-trial.md'),
    product_decision_desk_free_source_coverage_audit_json: projectRef('runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-coverage-audit.json'),
    product_decision_desk_free_source_coverage_audit_md: projectRef('runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-coverage-audit.md'),
    promotion_social_execution_status_index_json: projectRef('runtime/growth-sales-automation/execution-status-index.json'),
    promotion_social_execution_status_index_md: projectRef('runtime/growth-sales-automation/execution-status-index.md'),
    promotion_plan_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/promotion-plan.json'),
    promotion_plan_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/promotion-plan.md'),
    promotion_channel_specialized_design_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/channel-specialized-design.json'),
    promotion_channel_specialized_design_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/channel-specialized-design.md'),
    auto_reply_bot_design_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/auto-reply-bot-design.json'),
    auto_reply_bot_design_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/auto-reply-bot-design.md'),
    social_connector_registry_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/social-connector-registry.json'),
    social_connector_registry_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/social-connector-registry.md'),
    social_connection_status_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/connection-status.json'),
    social_connection_status_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/connection-status.md'),
    promotion_social_validation_report_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/validation-report.json'),
    promotion_social_validation_report_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/validation-report.md'),
    sample_runs: projectRef('runtime/growth-sales-automation/sample-runs/**'),
    real_external_actions_allowed: false,
    external_software_enabled: false
  }
  const overlays = [
    ...(projection.branch_overlays || []).filter((overlay) => overlay.branch_id !== controlPack.branch_id),
    branchOverlay
  ]
  projection.updated_at = nowIso()
  projection.display = {
    ...(projection.display || {}),
    canonical_stage_count: (projection.canonical_flow || []).length,
    branch_overlay_count: overlays.length,
    particle_count: (projection.canonical_flow || []).length + overlays.length
  }
  projection.branch_overlays = overlays
  writeJson(projectionPath, projection)
}

const template = JSON.parse(readFileSync(templatePath, 'utf8'))
const controlPack = buildControlPack(template)

ensureDir(runtimeRoot)
ensureDir(dashboardDir)
writeJson(controlPackPath, controlPack)
writeProductInputArtifacts(controlPack.product_input_framework)
writeProductDecisionRulesArtifacts(controlPack.product_decision_desk.product_launch_decision_rules)
writeAiImplementationArtifacts(controlPack.ai_implementation_plan)
writeTrialResultArtifacts(controlPack.ai_implementation_plan)
writeFileSync(dashboardPath, buildDashboardHtml(controlPack), 'utf8')
updateProjection(controlPack)

console.log(JSON.stringify({
  success: true,
  contract: 'growth_sales_automation_branch_build_result.v1',
  branch_id: controlPack.branch_id,
  generated_at: controlPack.generated_at,
  control_pack: projectRef('runtime/growth-sales-automation/branch-control-pack.json'),
  dashboard: projectRef('runtime/growth-sales-automation/dashboard/index.html'),
  ai_plan_json: projectRef('runtime/growth-sales-automation/ai-implementation-plan.json'),
  ai_plan_md: projectRef('runtime/growth-sales-automation/ai-implementation-plan.md'),
  product_input_json: projectRef('runtime/growth-sales-automation/product-input-framework.json'),
  product_input_md: projectRef('runtime/growth-sales-automation/product-input-framework.md'),
  product_decision_desk_plan_json: projectRef('runtime/growth-sales-automation/product-decision-desk/execution-plan.json'),
  product_decision_desk_plan_md: projectRef('runtime/growth-sales-automation/product-decision-desk/execution-plan.md'),
  product_decision_desk_data_sources: projectRef('runtime/growth-sales-automation/product-decision-desk/data-source-registry.json'),
  product_decision_desk_source_matrix_json: projectRef('runtime/growth-sales-automation/product-decision-desk/source-channel-matrix.json'),
  product_decision_desk_source_matrix_md: projectRef('runtime/growth-sales-automation/product-decision-desk/source-channel-matrix.md'),
  product_decision_desk_global_region_source_coverage_json: projectRef('runtime/growth-sales-automation/product-decision-desk/global-region-source-coverage.json'),
  product_decision_desk_global_region_source_coverage_md: projectRef('runtime/growth-sales-automation/product-decision-desk/global-region-source-coverage.md'),
  product_decision_desk_product_console_manager_audit_json: projectRef('runtime/growth-sales-automation/product-decision-desk/product-console-manager-audit.json'),
  product_decision_desk_product_console_manager_audit_md: projectRef('runtime/growth-sales-automation/product-decision-desk/product-console-manager-audit.md'),
  product_decision_desk_direction_record_json: projectRef('runtime/growth-sales-automation/product-decision-desk/current-direction-record.json'),
  product_decision_desk_direction_record_md: projectRef('runtime/growth-sales-automation/product-decision-desk/current-direction-record.md'),
  product_decision_desk_remaining_capability_execution_plan_json: projectRef('runtime/growth-sales-automation/product-decision-desk/remaining-capability-execution-plan.json'),
  product_decision_desk_remaining_capability_execution_plan_md: projectRef('runtime/growth-sales-automation/product-decision-desk/remaining-capability-execution-plan.md'),
  product_decision_desk_category_profile_coverage_report_json: projectRef('runtime/growth-sales-automation/product-decision-desk/category-profile-coverage-report.json'),
  product_decision_desk_category_profile_coverage_report_md: projectRef('runtime/growth-sales-automation/product-decision-desk/category-profile-coverage-report.md'),
  product_decision_desk_capability_c_execution_report_json: projectRef('runtime/growth-sales-automation/product-decision-desk/capability-c-execution-report.json'),
  product_decision_desk_capability_c_execution_report_md: projectRef('runtime/growth-sales-automation/product-decision-desk/capability-c-execution-report.md'),
  product_decision_desk_remaining_capabilities_execution_report_json: projectRef('runtime/growth-sales-automation/product-decision-desk/remaining-capabilities-execution-report.json'),
  product_decision_desk_remaining_capabilities_execution_report_md: projectRef('runtime/growth-sales-automation/product-decision-desk/remaining-capabilities-execution-report.md'),
  product_decision_desk_post_completion_defect_assessment_json: projectRef('runtime/growth-sales-automation/product-decision-desk/post-completion-defect-assessment.json'),
  product_decision_desk_post_completion_defect_assessment_md: projectRef('runtime/growth-sales-automation/product-decision-desk/post-completion-defect-assessment.md'),
  product_decision_desk_latest_saved_product_decision_json: projectRef('runtime/growth-sales-automation/product-decision-desk/latest-saved-product-decision.json'),
  product_decision_desk_launch_rules_json: projectRef('runtime/growth-sales-automation/product-decision-desk/product-launch-decision-rules.json'),
  product_decision_desk_launch_rules_md: projectRef('runtime/growth-sales-automation/product-decision-desk/product-launch-decision-rules.md'),
  product_decision_desk_free_source_trial_json: projectRef('runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-trial.json'),
  product_decision_desk_free_source_trial_md: projectRef('runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-trial.md'),
  product_decision_desk_free_source_coverage_audit_json: projectRef('runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-coverage-audit.json'),
  product_decision_desk_free_source_coverage_audit_md: projectRef('runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-coverage-audit.md'),
  promotion_social_execution_status_index_json: projectRef('runtime/growth-sales-automation/execution-status-index.json'),
  promotion_social_execution_status_index_md: projectRef('runtime/growth-sales-automation/execution-status-index.md'),
  promotion_plan_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/promotion-plan.json'),
  promotion_plan_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/promotion-plan.md'),
  promotion_channel_specialized_design_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/channel-specialized-design.json'),
  promotion_channel_specialized_design_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/channel-specialized-design.md'),
  auto_reply_bot_design_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/auto-reply-bot-design.json'),
  auto_reply_bot_design_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/auto-reply-bot-design.md'),
  social_connector_registry_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/social-connector-registry.json'),
  social_connector_registry_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/social-connector-registry.md'),
  social_connection_status_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/connection-status.json'),
  social_connection_status_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/connection-status.md'),
  promotion_social_validation_report_json: projectRef('runtime/growth-sales-automation/promotion-social-automation/validation-report.json'),
  promotion_social_validation_report_md: projectRef('runtime/growth-sales-automation/promotion-social-automation/validation-report.md'),
  sample_runs: projectRef('runtime/growth-sales-automation/sample-runs/**'),
  summary: controlPack.summary
}, null, 2))
