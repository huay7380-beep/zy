import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureDir, nowIso, projectRoot, writeJson } from './cross-border-stage-control-lib.mjs'

const runtimeRoot = join(projectRoot, 'runtime', 'growth-sales-automation')
const deskRoot = join(runtimeRoot, 'product-decision-desk')
const packRoot = join(runtimeRoot, 'promotion-social-automation')
const latestDecisionPath = join(deskRoot, 'latest-saved-product-decision.json')

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

function runtimeRef(...parts) {
  return `cross-border-ecommerce-ai-route/${join('runtime', 'growth-sales-automation', ...parts).replaceAll('\\', '/')}`
}

function decisionRef(...parts) {
  return runtimeRef('product-decision-desk', ...parts)
}

function writeMarkdown(path, lines) {
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8')
}

function readOptional(path) {
  return existsSync(path) ? readJson(path) : null
}

const generatedAt = nowIso()
const latestDecision = readJson(latestDecisionPath)
const productId = safeProductId(latestDecision.product_id)
const outputDir = join(deskRoot, 'outputs', productId)
ensureDir(packRoot)

const decisionPack = readOptional(join(outputDir, 'decision-pack.json'))
const sourceGate = readOptional(join(outputDir, 'source-coverage-gate.json'))
const commercialGate = readOptional(join(outputDir, 'commercial-terms-gate.json'))
const buyerProfile = readOptional(join(outputDir, 'buyer-profile-pack.json'))
const productPageRequirement = readOptional(join(outputDir, 'product-page-requirement.json'))

const externalSourceRefs = [
  {
    source_id: 'meta_whatsapp_cloud_api_get_started',
    platform: 'whatsapp',
    official_url: 'https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started',
    extracted_requirement: 'Meta documents generating a temporary access token and selecting or adding a business phone number for test messages.',
    checked_at: generatedAt
  },
  {
    source_id: 'meta_whatsapp_webhooks',
    platform: 'whatsapp',
    official_url: 'https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/',
    extracted_requirement: 'WhatsApp Business Platform webhooks send JSON HTTP requests from Meta servers to the configured endpoint.',
    checked_at: generatedAt
  },
  {
    source_id: 'tiktok_api_for_business',
    platform: 'tiktok_ads',
    official_url: 'https://business-api.tiktok.com/portal/docs',
    extracted_requirement: 'TikTok API for Business is the official guide for programmatic TikTok for Business platform integration.',
    checked_at: generatedAt
  },
  {
    source_id: 'tiktok_marketing_api',
    platform: 'tiktok_ads',
    official_url: 'https://business-api.tiktok.com/portal/docs?id=1781891416235009',
    extracted_requirement: 'TikTok Marketing API enables interaction with TikTok Ads Manager functionality at scale.',
    checked_at: generatedAt
  },
  {
    source_id: 'tiktok_content_posting_get_started',
    platform: 'tiktok_content',
    official_url: 'https://developers.tiktok.com/doc/content-posting-api-get-started',
    extracted_requirement: 'TikTok Content Posting API requires a registered app, Content Posting API product, approved scopes such as video.publish/video.upload, user authorization, and access token/open ID.',
    checked_at: generatedAt
  },
  {
    source_id: 'tiktok_content_posting_status',
    platform: 'tiktok_content',
    official_url: 'https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status',
    extracted_requirement: 'TikTok Content Posting API provides polling and webhook mechanisms to check post status.',
    checked_at: generatedAt
  }
]

const targetMarkets = decisionPack?.minimum_foreign_trade_fields?.target_country_candidates || [
  'United States',
  'Germany',
  'United Arab Emirates',
  'Brazil',
  'South Africa',
  'Singapore',
  'Japan',
  'Australia'
]
const productName = latestDecision.product_name || decisionPack?.ai_understanding?.product_identity || productId
const buyerRoles = buyerProfile?.buyer_roles || [
  'distributor',
  'installer',
  'system_integrator',
  'project_procurement',
  'brand_owner'
]

const promotionPlan = {
  contract: 'promotion_campaign_plan.v1',
  generated_at: generatedAt,
  product_id: productId,
  product_name: productName,
  execution_mode: 'local_strategy_plan_only',
  real_external_actions_executed: false,
  source_refs: {
    latest_saved_product_decision: decisionRef('latest-saved-product-decision.json'),
    decision_pack: decisionRef('outputs', productId, 'decision-pack.json'),
    source_coverage_gate: decisionRef('outputs', productId, 'source-coverage-gate.json'),
    commercial_terms_gate: decisionRef('outputs', productId, 'commercial-terms-gate.json')
  },
  current_gates: {
    market_ranking_allowed: sourceGate?.market_ranking_allowed === true,
    acquisition_allowed: sourceGate?.acquisition_allowed === true,
    quote_send_allowed: commercialGate?.quote_send_allowed === true,
    ad_spend_allowed: false,
    real_message_send_allowed: false
  },
  campaign_strategy: {
    objective: 'Generate qualified B2B RFQ leads for structured cabling products without triggering real outreach or ad spend.',
    positioning: [
      'private label support',
      'quantity price tiers after factory confirmation',
      'custom model support',
      'project procurement and distributor stocking'
    ],
    target_markets: targetMarkets,
    target_buyer_roles: buyerRoles,
    minimum_offer_assets: [
      'RFQ landing page',
      'product category page',
      'downloadable product selection checklist',
      'certificate/test-report status notice',
      'sample and MOQ explanation after confirmation'
    ]
  },
  channel_plan: [
    {
      channel_id: 'seo_content_cluster',
      status: 'draft_ready',
      priority: 'P1',
      allowed_now: true,
      real_external_action: false,
      purpose: 'Build organic demand capture pages before paid traffic.',
      outputs: ['keyword_map', 'category_page_outline', 'faq_outline', 'comparison_page_outline'],
      blocked_until: ['approve_product_page_claims', 'confirm_certificate_status']
    },
    {
      channel_id: 'google_search_ads',
      status: 'planned_blocked_for_real_spend',
      priority: 'P1',
      allowed_now: false,
      real_external_action: true,
      purpose: 'Validate high-intent procurement keywords only after landing page and budget approval.',
      outputs: ['campaign_structure_draft', 'negative_keyword_seed', 'landing_page_requirements'],
      blocked_until: ['approve_ad_budget', 'approve_landing_page', 'source_gate_market_priority_review']
    },
    {
      channel_id: 'linkedin_b2b_outreach',
      status: 'draft_research_only',
      priority: 'P1',
      allowed_now: true,
      real_external_action: false,
      purpose: 'Define ICP search and message drafts for distributors, installers and system integrators.',
      outputs: ['icp_filter_pack', 'connection_note_draft', 'followup_sequence_draft'],
      blocked_until: ['approve_real_outreach_send', 'confirm_contact_source_legality']
    },
    {
      channel_id: 'whatsapp_high_intent_followup',
      status: 'connector_design_only',
      priority: 'P1',
      allowed_now: false,
      real_external_action: true,
      purpose: 'Use WhatsApp only for opted-in or manually approved high-intent follow-up.',
      outputs: ['message_template_drafts', 'webhook_intake_contract', 'handoff_policy'],
      blocked_until: ['meta_waba_ready', 'phone_number_id_ready', 'approved_templates', 'approve_first_external_reply']
    },
    {
      channel_id: 'tiktok_short_video',
      status: 'content_plan_only',
      priority: 'P2',
      allowed_now: true,
      real_external_action: false,
      purpose: 'Create product demonstration content plans; posting and ads remain disabled.',
      outputs: ['short_video_script_batch', 'posting_calendar_draft', 'creative_testing_matrix'],
      blocked_until: ['approved_tiktok_app_or_manual_posting_flow', 'approve_publish']
    }
  ],
  four_week_plan: [
    {
      week: 1,
      goal: 'Prepare trackable landing assets and SEO/RFQ foundations.',
      tasks: ['finalize RFQ landing page requirements', 'draft 10 SEO topics', 'draft lead magnet', 'define event schema']
    },
    {
      week: 2,
      goal: 'Create content and message drafts without sending.',
      tasks: ['write LinkedIn/WhatsApp drafts', 'write TikTok script batch', 'prepare FAQ bot knowledge map', 'review claim whitelist']
    },
    {
      week: 3,
      goal: 'Prepare controlled test campaigns.',
      tasks: ['build Google Ads draft structure', 'build LinkedIn ICP filters', 'prepare WhatsApp template drafts', 'prepare TikTok posting checklist']
    },
    {
      week: 4,
      goal: 'Review readiness for manual enablement.',
      tasks: ['audit source coverage', 'audit commercial fields', 'approve or block channels', 'publish only approved assets manually']
    }
  ],
  measurement_contract: {
    contract: 'campaign_event_metrics.v1',
    required_fields: [
      'campaign_id',
      'source',
      'audience',
      'offer',
      'landing_page',
      'spend',
      'impressions',
      'clicks',
      'leads',
      'qualified_leads',
      'quotes',
      'orders',
      'notes'
    ]
  }
}

const channelSpecializedDesign = {
  contract: 'promotion_channel_specialized_design.v1',
  generated_at: generatedAt,
  product_id: productId,
  product_name: productName,
  execution_mode: 'channel_design_and_draft_only',
  real_external_actions_executed: false,
  purpose: 'Define channel-specific promotion logic for B2B cross-border ecommerce so AI can select, draft, score, and route channels without executing real external actions.',
  source_refs: {
    promotion_plan: runtimeRef('promotion-social-automation', 'promotion-plan.json'),
    decision_pack: decisionRef('outputs', productId, 'decision-pack.json'),
    source_coverage_gate: decisionRef('outputs', productId, 'source-coverage-gate.json'),
    commercial_terms_gate: decisionRef('outputs', productId, 'commercial-terms-gate.json')
  },
  platform_reference_policy: {
    use_official_docs_first: true,
    real_spend_or_send_requires_manual_enablement: true,
    refresh_required_before_real_launch: true,
    official_reference_classes: [
      'Google Search Central and Google Ads documentation',
      'LinkedIn Ads and Lead Gen Forms documentation',
      'Meta WhatsApp Business Platform documentation',
      'TikTok API for Business and Content Posting API documentation'
    ]
  },
  input_contracts: [
    'product_decision_pack.v1',
    'buyer_profile_pack.v1',
    'product_page_requirement.v1',
    'source_coverage_gate.v1',
    'commercial_terms_gate.v1',
    'campaign_budget_approval.v1',
    'channel_enablement_decision.v1'
  ],
  output_contracts: [
    'channel_suitability_score.v1',
    'channel_campaign_brief.v1',
    'channel_content_backlog.v1',
    'channel_launch_gate.v1',
    'campaign_event_metrics.v1',
    'optimization_recommendation.v1'
  ],
  ai_channel_selection_rules: {
    first_class_goal: 'qualified_b2b_rfq_or_distributor_lead',
    channel_sequence: [
      'product_page_and_tracking_foundation',
      'seo_and_technical_content',
      'google_search_ads_draft',
      'linkedin_abm_research',
      'b2b_marketplace_directory_presence',
      'video_demo_content',
      'opt_in_whatsapp_and_email_nurture',
      'retargeting_after_privacy_gate'
    ],
    scoring_dimensions: [
      { id: 'buyer_intent_fit', weight: 0.22 },
      { id: 'category_explainability', weight: 0.16 },
      { id: 'evidence_and_claim_safety', weight: 0.16 },
      { id: 'market_coverage_fit', weight: 0.14 },
      { id: 'cost_control', weight: 0.12 },
      { id: 'lead_quality_traceability', weight: 0.12 },
      { id: 'automation_readiness', weight: 0.08 }
    ],
    disqualifiers: [
      'no product page or RFQ intake destination',
      'unverified certification or performance claims required by channel copy',
      'missing commercial basics for quote-oriented campaigns',
      'missing privacy/consent basis for retargeting or direct messaging',
      'no human approval for any real outbound message, post, ad spend, or CRM production write'
    ]
  },
  channel_blueprints: [
    {
      channel_id: 'seo_content_cluster',
      current_priority: 'P1',
      funnel_role: 'long_term_demand_capture',
      best_for: ['technical products', 'repeat procurement', 'spec comparison', 'global organic discovery'],
      ai_tasks: [
        'build keyword intent map by buyer role and market',
        'draft category page outline and FAQ cluster',
        'separate verified claims from draft-only claims',
        'generate internal link and conversion CTA plan'
      ],
      required_inputs: ['product_category_profile_match.v1', 'product_page_requirement.v1', 'claim_whitelist_blacklist'],
      outputs: ['seo_keyword_map.v1', 'category_page_outline.v1', 'faq_content_backlog.v1'],
      human_gates: ['approve_claims', 'approve_publish'],
      metrics: ['organic_impressions', 'qualified_clicks', 'rfq_conversion_rate', 'technical_downloads'],
      stop_conditions: ['no indexable product page', 'claims cannot be verified']
    },
    {
      channel_id: 'google_search_ads',
      current_priority: 'P1_draft_only',
      funnel_role: 'high_intent_demand_capture',
      best_for: ['buyers searching model terms', 'urgent procurement', 'market validation by keyword'],
      ai_tasks: [
        'split campaigns by product family and buyer intent',
        'draft exact/phrase keyword groups',
        'generate negative keyword seed',
        'map every ad group to a landing page and RFQ event'
      ],
      required_inputs: ['landing_page_url', 'approved_budget', 'market_priority', 'conversion_event_schema'],
      outputs: ['google_search_campaign_draft.v1', 'negative_keyword_seed.v1', 'landing_page_gap_list.v1'],
      human_gates: ['approve_budget', 'approve_landing_page', 'approve_ad_copy', 'enable_tracking'],
      metrics: ['search_impression_share', 'cpc', 'qualified_lead_cost', 'rfq_rate', 'quote_rate'],
      stop_conditions: ['cost_per_qualified_lead_exceeds_threshold', 'low_search_intent_terms_dominate', 'landing_page_quality_gap']
    },
    {
      channel_id: 'linkedin_abm_and_lead_forms',
      current_priority: 'P1_research_only',
      funnel_role: 'account_based_b2b_discovery',
      best_for: ['distributors', 'system integrators', 'project procurement', 'brand owners'],
      ai_tasks: [
        'build ICP filters by role, industry, region and company size',
        'draft non-sending connection and message sequences',
        'prepare lead form field requirements',
        'score company fit before any outreach'
      ],
      required_inputs: ['buyer_profile_pack.v1', 'approved_icp', 'contact_source_legality_review'],
      outputs: ['linkedin_icp_filter_pack.v1', 'linkedin_message_sequence_draft.v1', 'lead_form_field_map.v1'],
      human_gates: ['approve_real_outreach_send', 'approve_contact_source', 'approve_message_copy'],
      metrics: ['accepted_connections', 'reply_rate', 'qualified_company_rate', 'sample_or_quote_requests'],
      stop_conditions: ['contact_source_not_approved', 'reply_quality_below_threshold', 'high_spam_risk']
    },
    {
      channel_id: 'b2b_marketplaces_and_directories',
      current_priority: 'P1_listing_design',
      funnel_role: 'trust_and_supplier_discovery',
      best_for: ['factory-source products', 'private label offers', 'buyers comparing suppliers'],
      ai_tasks: [
        'prepare marketplace listing field map',
        'adapt product title/spec bullets to platform limits',
        'draft RFQ response templates',
        'define evidence package for supplier credibility'
      ],
      required_inputs: ['product_images', 'factory_capability_summary', 'moq_price_lead_time', 'certificate_status'],
      outputs: ['marketplace_listing_pack.v1', 'supplier_profile_claims_pack.v1', 'rfq_response_template.v1'],
      human_gates: ['approve_platform_account', 'approve_listing_publish', 'approve_claims'],
      metrics: ['listing_views', 'inquiries', 'rfq_match_quality', 'sample_requests'],
      stop_conditions: ['platform_terms_not_reviewed', 'missing_required_supplier_evidence']
    },
    {
      channel_id: 'industry_exhibitions_and_association_lists',
      current_priority: 'P2_research_only',
      funnel_role: 'offline_to_online_b2b_lead_source',
      best_for: ['regional distributor discovery', 'large project procurement', 'category credibility'],
      ai_tasks: [
        'identify relevant industry events and associations by target market',
        'draft booth/no-booth outreach plan',
        'create pre-event and post-event message drafts',
        'generate lead capture checklist'
      ],
      required_inputs: ['target_market_candidates', 'travel_or_event_budget_status', 'approved_company_profile'],
      outputs: ['event_target_list.v1', 'event_outreach_draft.v1', 'lead_capture_checklist.v1'],
      human_gates: ['approve_event_budget', 'approve_contact_collection_method', 'approve_external_message'],
      metrics: ['target_accounts_identified', 'meetings_booked', 'rfqs_after_event', 'samples_requested'],
      stop_conditions: ['event_relevance_low', 'contact_collection_policy_unclear']
    },
    {
      channel_id: 'youtube_video_seo',
      current_priority: 'P2_content_plan',
      funnel_role: 'technical_trust_and_installation_education',
      best_for: ['installation products', 'comparison demos', 'problem-solution explanations'],
      ai_tasks: [
        'draft installation/demo script',
        'generate shot list and title/description keywords',
        'route viewers to product page and RFQ form',
        'create transcript for SEO reuse'
      ],
      required_inputs: ['safe_demo_claims', 'product_visual_assets', 'product_page_url'],
      outputs: ['video_script_pack.v1', 'shot_list.v1', 'video_seo_metadata.v1'],
      human_gates: ['approve_video_claims', 'approve_publish'],
      metrics: ['watch_time', 'clickthrough_to_product_page', 'rfq_assisted_conversions'],
      stop_conditions: ['no_complete_product_visuals', 'demo_claims_unverified']
    },
    {
      channel_id: 'tiktok_short_video',
      current_priority: 'P2_content_plan_only',
      funnel_role: 'awareness_and_product_memory',
      best_for: ['visual demonstration', 'simple before-after comparison', 'manufacturing flexibility story'],
      ai_tasks: [
        'draft short video hooks for product problems',
        'produce creator-style script variants',
        'separate organic content plan from ad plan',
        'define comment/lead intake routing'
      ],
      required_inputs: ['approved_visual_assets', 'approved_publish_flow', 'comment_or_lead_intake_policy'],
      outputs: ['tiktok_script_batch.v1', 'creative_testing_matrix.v1', 'comment_intake_route.v1'],
      human_gates: ['approve_publish', 'approve_tiktok_app_or_manual_flow', 'approve_ad_budget'],
      metrics: ['qualified_profile_visits', 'comments_with_buying_intent', 'rfq_assisted_clicks'],
      stop_conditions: ['low_b2b_intent', 'creative_claims_unapproved', 'posting_api_not_ready']
    },
    {
      channel_id: 'whatsapp_opt_in_followup',
      current_priority: 'P1_conversion_only',
      funnel_role: 'high_intent_followup_and_clarification',
      best_for: ['existing inquiries', 'sample requests', 'quote clarification', 'manual opt-in leads'],
      ai_tasks: [
        'classify inbound intent',
        'draft missing-field questions',
        'prepare human handoff packet',
        'map approved templates for business-initiated messages'
      ],
      required_inputs: ['opt_in_or_manual_approval', 'waba_credentials', 'approved_message_templates', 'human_handoff_policy'],
      outputs: ['whatsapp_reply_draft.v1', 'missing_field_request.v1', 'human_handoff_packet.v1'],
      human_gates: ['approve_first_external_reply', 'approve_template_use', 'human_takeover_available'],
      metrics: ['response_time', 'missing_fields_completed', 'quote_ready_rate', 'handoff_rate'],
      stop_conditions: ['no_opt_in', 'template_not_approved', 'customer_requests_sensitive_or_final_quote']
    },
    {
      channel_id: 'email_nurture_and_quote_followup',
      current_priority: 'P2_draft_only',
      funnel_role: 'structured_followup_and_reactivation',
      best_for: ['catalog downloads', 'RFQ incomplete leads', 'sample-to-bulk conversion'],
      ai_tasks: [
        'draft lifecycle sequence by buyer stage',
        'personalize by product interest and missing fields',
        'prepare unsubscribe/compliance placeholders',
        'route replies to inquiry reception'
      ],
      required_inputs: ['legal_basis_for_email', 'lead_source', 'buyer_stage', 'unsubscribe_policy'],
      outputs: ['email_sequence_draft.v1', 'lead_stage_map.v1', 'reply_routing_rule.v1'],
      human_gates: ['approve_email_send', 'approve_contact_source_legality', 'approve_claims'],
      metrics: ['open_rate', 'reply_rate', 'rfq_completion_rate', 'quote_request_rate'],
      stop_conditions: ['legal_basis_unclear', 'complaint_or_unsubscribe_signal', 'low_quality_lead_source']
    },
    {
      channel_id: 'retargeting_pixels_and_remarketing',
      current_priority: 'P3_blocked_until_privacy_gate',
      funnel_role: 'return_visitor_conversion',
      best_for: ['long B2B comparison cycles', 'product-page visitors', 'catalog downloaders'],
      ai_tasks: [
        'define event taxonomy and audience rules',
        'draft remarketing creative without enabling pixels',
        'separate high-intent audiences from general visitors',
        'generate privacy and consent implementation checklist'
      ],
      required_inputs: ['privacy_terms_approved', 'cookie_consent_flow', 'tracking_events', 'ad_account_ready'],
      outputs: ['retargeting_audience_plan.v1', 'event_taxonomy.v1', 'privacy_gate_checklist.v1'],
      human_gates: ['approve_privacy_terms', 'approve_tracking_install', 'approve_ad_budget'],
      metrics: ['return_visit_rate', 'qualified_lead_cost', 'assisted_rfq_rate'],
      stop_conditions: ['privacy_consent_not_ready', 'audience_size_too_small', 'ad_budget_not_approved']
    }
  ],
  current_product_recommendation: {
    primary_channels: ['seo_content_cluster', 'google_search_ads', 'linkedin_abm_and_lead_forms', 'whatsapp_opt_in_followup'],
    secondary_channels: ['b2b_marketplaces_and_directories', 'youtube_video_seo', 'tiktok_short_video', 'email_nurture_and_quote_followup'],
    blocked_until_later: ['retargeting_pixels_and_remarketing'],
    rationale: 'Structured cabling is technical, comparison-driven and RFQ-oriented; high-intent search, technical SEO and account-based B2B discovery should be prepared before broad awareness spending.'
  },
  automation_boundaries: {
    allowed_now: [
      'generate channel suitability scores',
      'draft briefs and content backlogs',
      'prepare campaign structures',
      'prepare message drafts',
      'prepare dry-run metrics contracts'
    ],
    blocked_until_manual_enablement: [
      'publish content externally',
      'send customer messages',
      'activate ad campaigns',
      'install tracking pixels',
      'write to production CRM',
      'spend budget'
    ]
  }
}

const autoReplyBotDesign = {
  contract: 'auto_reply_bot_design.v1',
  generated_at: generatedAt,
  product_id: productId,
  execution_mode: 'local_design_and_draft_only',
  real_external_actions_executed: false,
  bot_scope: {
    allowed: [
      'site chat draft replies',
      'RFQ intake classification',
      'WhatsApp reply draft generation after opt-in/manual approval',
      'handoff summary for human operator',
      'missing field collection'
    ],
    blocked: [
      'general-purpose open-domain chatbot behavior',
      'unapproved outbound messages',
      'certification/performance claims without evidence',
      'final quote send',
      'payment instruction',
      'CRM production write without approval'
    ]
  },
  input_contracts: [
    'site_chat_message.v1',
    'whatsapp_webhook_message.v1',
    'tiktok_comment_or_lead_event.v1',
    'rfq_form_submission.v1',
    'manual_operator_note.v1'
  ],
  output_contracts: [
    'inquiry_intake.v1',
    'reply_draft.v1',
    'lead_score.v1',
    'missing_field_request.v1',
    'human_handoff_packet.v1'
  ],
  knowledge_sources: [
    decisionRef('outputs', productId, 'decision-pack.json'),
    decisionRef('outputs', productId, 'product-page-requirement.json'),
    decisionRef('outputs', productId, 'quote-input-basis.confirmed.json'),
    decisionRef('outputs', productId, 'commercial-terms-gate.json'),
    decisionRef('outputs', productId, 'compliance-review-pack.json'),
    decisionRef('outputs', productId, 'asset-qa-report.json')
  ],
  intent_taxonomy: [
    { intent_id: 'spec_request', action: 'ask for exact model/spec/use case if missing' },
    { intent_id: 'price_moq_request', action: 'explain draft-only state and collect quantity/destination; do not quote final price' },
    { intent_id: 'sample_request', action: 'collect sample quantity, destination, courier preference and buyer company info' },
    { intent_id: 'certificate_request', action: 'answer only with verified certificate status or state pending confirmation' },
    { intent_id: 'custom_brand_request', action: 'collect logo/label/model customization details and MOQ expectation' },
    { intent_id: 'logistics_request', action: 'collect destination, delivery term and shipment quantity; block final freight quote until packing confirmed' },
    { intent_id: 'spam_or_low_intent', action: 'do not engage beyond safe qualification response' }
  ],
  escalation_rules: [
    'Any price, certification, test report, tariff, customs, payment, legal, or shipment booking request requires human approval.',
    'Any angry customer, complaint, refund, IP/legal threat, or non-product topic requires human takeover.',
    'Any first outbound external reply requires approve_first_external_reply.',
    'Human operator can take over at any time; bot must stop sending drafts for that conversation after takeover flag.'
  ],
  sample_reply_drafts: [
    {
      scenario: 'buyer asks for MOQ and price',
      channel: 'whatsapp_or_site_chat',
      draft: 'Thanks for your inquiry. We can support B2B wholesale, project procurement, and private label requests. Please share quantity, target model/spec, destination country, and whether you need custom labeling. I will prepare the RFQ details for manual confirmation before any formal quotation.'
    },
    {
      scenario: 'buyer asks for certificates',
      channel: 'whatsapp_or_site_chat',
      draft: 'Certificate and test-report claims are handled only after evidence review. Please tell us the target country and required standard, and we will confirm available documents before making any formal claim.'
    },
    {
      scenario: 'buyer asks for custom branding',
      channel: 'whatsapp_or_site_chat',
      draft: 'Private label support can be evaluated. Please provide logo/label requirements, estimated order quantity, package requirements, and target model. We will confirm feasibility, MOQ, lead time, and cost before quotation.'
    }
  ]
}

const socialConnectorRegistry = {
  contract: 'social_media_connector_registry.v1',
  generated_at: generatedAt,
  product_id: productId,
  execution_mode: 'connector_design_and_readiness_only',
  real_external_actions_executed: false,
  official_source_refs: externalSourceRefs,
  connectors: [
    {
      connector_id: 'whatsapp_cloud_api',
      platform: 'WhatsApp Business Platform',
      default_state: 'disabled',
      current_status: 'missing_credentials_and_webhook_endpoint',
      purpose: 'Inbound message intake and approved follow-up via WhatsApp Business Platform.',
      allowed_dry_run: true,
      real_send_allowed: false,
      required_operator_inputs: [
        'Meta business account',
        'WhatsApp Business Account ID',
        'Phone Number ID',
        'permanent or system user access token',
        'webhook URL and verify token',
        'approved message templates for business-initiated messages',
        'human approval policy for first reply'
      ],
      minimum_events: ['messages', 'message_status'],
      output_contracts: ['whatsapp_webhook_message.v1', 'reply_draft.v1', 'human_handoff_packet.v1']
    },
    {
      connector_id: 'tiktok_marketing_api',
      platform: 'TikTok API for Business',
      default_state: 'disabled',
      current_status: 'missing_business_app_advertiser_and_token',
      purpose: 'Ad campaign draft execution, reporting, and metrics import after manual approval.',
      allowed_dry_run: true,
      real_send_allowed: false,
      required_operator_inputs: [
        'TikTok for Business developer app',
        'advertiser ID',
        'approved app permissions',
        'access token',
        'ad account/business authorization',
        'budget approval and creative approval'
      ],
      minimum_events: ['campaign_report', 'adgroup_report', 'ad_report'],
      output_contracts: ['campaign_event_metrics.v1', 'paid_campaign_report.v1']
    },
    {
      connector_id: 'tiktok_content_posting_api',
      platform: 'TikTok Content Posting API',
      default_state: 'disabled',
      current_status: 'missing_registered_app_scope_user_token_and_verified_domain',
      purpose: 'Upload or direct-post approved product short-video/photo content.',
      allowed_dry_run: true,
      real_send_allowed: false,
      required_operator_inputs: [
        'TikTok developer app',
        'Content Posting API product enabled',
        'video.upload or video.publish scope approval',
        'authorized TikTok user access token and open ID',
        'verified domain or URL prefix for hosted media',
        'post visibility/audit status review'
      ],
      minimum_events: ['content_upload_status', 'content_post_status'],
      output_contracts: ['content_post_request.v1', 'content_post_status.v1']
    },
    {
      connector_id: 'tiktok_inbox_or_dm',
      platform: 'TikTok inbox/comment operations',
      default_state: 'blocked',
      current_status: 'no_public_dm_connector_enabled',
      purpose: 'Do not assume TikTok DM automation. Use comments/leads/manual inbox export or approved partner route only.',
      allowed_dry_run: true,
      real_send_allowed: false,
      required_operator_inputs: [
        'approved official API or partner route',
        'terms review',
        'manual approval for each reply mode'
      ],
      minimum_events: ['manual_inbox_export_or_lead_event'],
      output_contracts: ['tiktok_comment_or_lead_event.v1', 'reply_draft.v1']
    }
  ]
}

const connectionStatus = {
  contract: 'social_connection_status.v1',
  generated_at: generatedAt,
  product_id: productId,
  execution_mode: 'readiness_status_only',
  real_external_actions_executed: false,
  summary: {
    connector_count: socialConnectorRegistry.connectors.length,
    enabled_connector_count: 0,
    blocked_or_disabled_count: socialConnectorRegistry.connectors.length,
    ready_for_real_send_count: 0,
    dry_run_ready_count: socialConnectorRegistry.connectors.filter((item) => item.allowed_dry_run).length
  },
  connector_statuses: socialConnectorRegistry.connectors.map((connector) => ({
    connector_id: connector.connector_id,
    platform: connector.platform,
    state: connector.default_state,
    current_status: connector.current_status,
    real_send_allowed: connector.real_send_allowed,
    missing_required_inputs: connector.required_operator_inputs,
    next_step: connector.default_state === 'blocked'
      ? 'Do not enable until official route and policy are confirmed.'
      : 'Collect credentials and configure a read-only sandbox/dry-run before real enablement.'
  })),
  global_gates: {
    real_customer_message_send_allowed: false,
    ad_spend_allowed: false,
    tiktok_posting_allowed: false,
    whatsapp_reply_send_allowed: false,
    manual_approval_required: true
  }
}

const executionStatusIndex = {
  contract: 'growth_sales_execution_status_index.v1',
  generated_at: generatedAt,
  product_id: productId,
  purpose: 'Single human-readable and machine-readable index for executed growth, promotion, chatbot, and social connection planning results.',
  completed_local_preview_artifacts: [
    {
      artifact_id: 'remaining_capabilities_execution_report',
      status: 'implemented_local_preview_verified',
      ref: decisionRef('remaining-capabilities-execution-report.json')
    },
    {
      artifact_id: 'post_completion_defect_assessment',
      status: 'local_preview_closure_complete_with_known_gaps',
      ref: decisionRef('post-completion-defect-assessment.json')
    },
    {
      artifact_id: 'promotion_plan',
      status: 'draft_ready_no_real_promotion',
      ref: runtimeRef('promotion-social-automation', 'promotion-plan.json')
    },
    {
      artifact_id: 'promotion_channel_specialized_design',
      status: 'draft_ready_no_real_promotion',
      ref: runtimeRef('promotion-social-automation', 'channel-specialized-design.json')
    },
    {
      artifact_id: 'auto_reply_bot_design',
      status: 'draft_ready_no_real_send',
      ref: runtimeRef('promotion-social-automation', 'auto-reply-bot-design.json')
    },
    {
      artifact_id: 'social_connector_registry',
      status: 'design_ready_connectors_disabled',
      ref: runtimeRef('promotion-social-automation', 'social-connector-registry.json')
    },
    {
      artifact_id: 'social_connection_status',
      status: 'all_connectors_disabled_or_blocked',
      ref: runtimeRef('promotion-social-automation', 'connection-status.json')
    }
  ],
  current_blockers: [
    'Real WhatsApp connection requires Meta/WABA credentials, phone number ID, access token, webhook endpoint and approved templates.',
    'Real TikTok ads require TikTok for Business app, advertiser authorization, access token, budget and creative approval.',
    'Real TikTok posting requires Content Posting API app/product, scopes, user authorization and media/domain requirements.',
    'TikTok DM automation is not assumed available; use approved API/partner route or manual intake.',
    'All promotion channel activation requires product page, tracking, claims, budget, privacy and human approval gates.',
    'Market ranking, acquisition, quote sending, ad spend and external message sends remain blocked.'
  ],
  next_recommended_actions: [
    'Use the promotion plan to approve channel priority and assets.',
    'Use the channel specialized design to approve which channels enter dry-run production first.',
    'Use the bot design to approve intent coverage and escalation rules.',
    'Collect WhatsApp and TikTok credentials only after deciding which connector to enable first.',
    'Build a read-only webhook receiver before enabling any outbound message send.'
  ]
}

writeJson(join(packRoot, 'promotion-plan.json'), promotionPlan)
writeJson(join(packRoot, 'channel-specialized-design.json'), channelSpecializedDesign)
writeJson(join(packRoot, 'auto-reply-bot-design.json'), autoReplyBotDesign)
writeJson(join(packRoot, 'social-connector-registry.json'), socialConnectorRegistry)
writeJson(join(packRoot, 'connection-status.json'), connectionStatus)
writeJson(join(runtimeRoot, 'execution-status-index.json'), executionStatusIndex)

writeMarkdown(join(packRoot, 'promotion-plan.md'), [
  '# Promotion Plan',
  '',
  `Generated at: ${generatedAt}`,
  `Product: ${productName}`,
  '',
  '## Gates',
  '',
  `- Market ranking allowed: ${promotionPlan.current_gates.market_ranking_allowed}`,
  `- Acquisition allowed: ${promotionPlan.current_gates.acquisition_allowed}`,
  `- Quote send allowed: ${promotionPlan.current_gates.quote_send_allowed}`,
  `- Ad spend allowed: ${promotionPlan.current_gates.ad_spend_allowed}`,
  '',
  '## Channels',
  '',
  ...promotionPlan.channel_plan.map((item) => `- ${item.channel_id}: ${item.status}; blocked until ${item.blocked_until.join(', ')}`),
  '',
  'No real promotion, ad spend, outreach, or external posting was executed.'
])

writeMarkdown(join(packRoot, 'channel-specialized-design.md'), [
  '# Promotion Channel Specialized Design',
  '',
  `Generated at: ${generatedAt}`,
  `Product: ${productName}`,
  '',
  '## Current Product Recommendation',
  '',
  `- Primary channels: ${channelSpecializedDesign.current_product_recommendation.primary_channels.join(', ')}`,
  `- Secondary channels: ${channelSpecializedDesign.current_product_recommendation.secondary_channels.join(', ')}`,
  `- Blocked until later: ${channelSpecializedDesign.current_product_recommendation.blocked_until_later.join(', ')}`,
  `- Rationale: ${channelSpecializedDesign.current_product_recommendation.rationale}`,
  '',
  '## Channel Blueprints',
  '',
  '| Channel | Priority | Funnel Role | Outputs | Human Gates |',
  '| --- | --- | --- | --- | --- |',
  ...channelSpecializedDesign.channel_blueprints.map((channel) => (
    `| ${channel.channel_id} | ${channel.current_priority} | ${channel.funnel_role} | ${channel.outputs.join(', ')} | ${channel.human_gates.join(', ')} |`
  )),
  '',
  '## AI Selection Rules',
  '',
  `- Goal: ${channelSpecializedDesign.ai_channel_selection_rules.first_class_goal}`,
  `- Sequence: ${channelSpecializedDesign.ai_channel_selection_rules.channel_sequence.join(' -> ')}`,
  '',
  '## Automation Boundaries',
  '',
  'Allowed now:',
  ...channelSpecializedDesign.automation_boundaries.allowed_now.map((item) => `- ${item}`),
  '',
  'Blocked until manual enablement:',
  ...channelSpecializedDesign.automation_boundaries.blocked_until_manual_enablement.map((item) => `- ${item}`),
  '',
  'No real promotion, ad spend, outreach, post, tracking pixel, or CRM production write was executed.'
])

writeMarkdown(join(packRoot, 'auto-reply-bot-design.md'), [
  '# Auto Reply Bot Design',
  '',
  `Generated at: ${generatedAt}`,
  `Product: ${productName}`,
  '',
  '## Output Contracts',
  '',
  ...autoReplyBotDesign.output_contracts.map((item) => `- ${item}`),
  '',
  '## Escalation Rules',
  '',
  ...autoReplyBotDesign.escalation_rules.map((item) => `- ${item}`),
  '',
  'Real external replies remain blocked until approved.'
])

writeMarkdown(join(packRoot, 'social-connector-registry.md'), [
  '# Social Connector Registry',
  '',
  `Generated at: ${generatedAt}`,
  '',
  '## Connectors',
  '',
  ...socialConnectorRegistry.connectors.map((item) => `- ${item.connector_id}: ${item.current_status}; real send allowed: ${item.real_send_allowed}`),
  '',
  '## Official Source References',
  '',
  ...externalSourceRefs.map((item) => `- ${item.source_id}: ${item.official_url}`)
])

writeMarkdown(join(packRoot, 'connection-status.md'), [
  '# Social Connection Status',
  '',
  `Generated at: ${generatedAt}`,
  '',
  `Enabled connectors: ${connectionStatus.summary.enabled_connector_count}`,
  `Dry-run ready connectors: ${connectionStatus.summary.dry_run_ready_count}`,
  `Ready for real send: ${connectionStatus.summary.ready_for_real_send_count}`,
  '',
  '## Status',
  '',
  ...connectionStatus.connector_statuses.map((item) => `- ${item.connector_id}: ${item.current_status}`)
])

writeMarkdown(join(runtimeRoot, 'execution-status-index.md'), [
  '# Growth Sales Execution Status Index',
  '',
  `Generated at: ${generatedAt}`,
  `Product: ${productId}`,
  '',
  '## Completed Local Preview Artifacts',
  '',
  ...executionStatusIndex.completed_local_preview_artifacts.map((item) => `- ${item.artifact_id}: ${item.status} -> ${item.ref}`),
  '',
  '## Current Blockers',
  '',
  ...executionStatusIndex.current_blockers.map((item) => `- ${item}`),
  '',
  '## Next Recommended Actions',
  '',
  ...executionStatusIndex.next_recommended_actions.map((item) => `- ${item}`)
])

console.log(JSON.stringify({
  success: true,
  contract: 'promotion_social_automation_pack_result.v1',
  generated_at: generatedAt,
  product_id: productId,
  promotion_plan: runtimeRef('promotion-social-automation', 'promotion-plan.json'),
  channel_specialized_design: runtimeRef('promotion-social-automation', 'channel-specialized-design.json'),
  auto_reply_bot_design: runtimeRef('promotion-social-automation', 'auto-reply-bot-design.json'),
  social_connector_registry: runtimeRef('promotion-social-automation', 'social-connector-registry.json'),
  connection_status: runtimeRef('promotion-social-automation', 'connection-status.json'),
  execution_status_index: runtimeRef('execution-status-index.json'),
  real_external_actions_executed: false
}, null, 2))
