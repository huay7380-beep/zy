import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureDir, nowIso, projectRoot } from './cross-border-stage-control-lib.mjs'

const runtimeRoot = join(projectRoot, 'runtime', 'growth-sales-automation')
const packRoot = join(runtimeRoot, 'promotion-social-automation')
const reportPath = join(packRoot, 'validation-report.json')
const reportMdPath = join(packRoot, 'validation-report.md')

const requiredFiles = {
  execution_status_index: join(runtimeRoot, 'execution-status-index.json'),
  promotion_plan: join(packRoot, 'promotion-plan.json'),
  channel_specialized_design: join(packRoot, 'channel-specialized-design.json'),
  auto_reply_bot_design: join(packRoot, 'auto-reply-bot-design.json'),
  social_connector_registry: join(packRoot, 'social-connector-registry.json'),
  connection_status: join(packRoot, 'connection-status.json')
}

const errors = []
const warnings = []

function readJson(id, path) {
  if (!existsSync(path)) {
    errors.push(`missing file: ${id}`)
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    errors.push(`invalid json: ${id}: ${error.message}`)
    return null
  }
}

function requireFalse(value, message) {
  if (value !== false) errors.push(message)
}

function requireArrayIncludesAll(values, required, messagePrefix) {
  const set = new Set(Array.isArray(values) ? values : [])
  for (const item of required) {
    if (!set.has(item)) errors.push(`${messagePrefix}: ${item}`)
  }
}

function requireArtifact(index, artifactId) {
  const found = (index?.completed_local_preview_artifacts || []).some(
    (artifact) => artifact.artifact_id === artifactId && artifact.ref
  )
  if (!found) errors.push(`execution status index missing artifact: ${artifactId}`)
}

const executionStatusIndex = readJson('execution_status_index', requiredFiles.execution_status_index)
const promotionPlan = readJson('promotion_plan', requiredFiles.promotion_plan)
const channelSpecializedDesign = readJson('channel_specialized_design', requiredFiles.channel_specialized_design)
const autoReplyBotDesign = readJson('auto_reply_bot_design', requiredFiles.auto_reply_bot_design)
const socialConnectorRegistry = readJson('social_connector_registry', requiredFiles.social_connector_registry)
const connectionStatus = readJson('connection_status', requiredFiles.connection_status)

if (executionStatusIndex) {
  if (executionStatusIndex.contract !== 'growth_sales_execution_status_index.v1') {
    errors.push('execution status index contract mismatch')
  }
  for (const artifactId of [
    'promotion_plan',
    'promotion_channel_specialized_design',
    'auto_reply_bot_design',
    'social_connector_registry',
    'social_connection_status'
  ]) {
    requireArtifact(executionStatusIndex, artifactId)
  }
  if (!Array.isArray(executionStatusIndex.current_blockers) || executionStatusIndex.current_blockers.length < 4) {
    errors.push('execution status index must list current blockers')
  }
}

if (promotionPlan) {
  if (promotionPlan.contract !== 'promotion_campaign_plan.v1') {
    errors.push('promotion plan contract mismatch')
  }
  requireFalse(promotionPlan.real_external_actions_executed, 'promotion plan must record no real external actions')
  requireFalse(promotionPlan.current_gates?.ad_spend_allowed, 'promotion plan must keep ad spend blocked')
  requireFalse(promotionPlan.current_gates?.real_message_send_allowed, 'promotion plan must keep real message sending blocked')
  const channelIds = (promotionPlan.channel_plan || []).map((channel) => channel.channel_id)
  requireArrayIncludesAll(
    channelIds,
    [
      'seo_content_cluster',
      'google_search_ads',
      'linkedin_b2b_outreach',
      'whatsapp_high_intent_followup',
      'tiktok_short_video'
    ],
    'promotion plan missing channel'
  )
  for (const channel of promotionPlan.channel_plan || []) {
    if (channel.real_external_action === true && channel.allowed_now === true) {
      errors.push(`real external promotion channel cannot be allowed now: ${channel.channel_id}`)
    }
  }
}

if (channelSpecializedDesign) {
  if (channelSpecializedDesign.contract !== 'promotion_channel_specialized_design.v1') {
    errors.push('channel specialized design contract mismatch')
  }
  requireFalse(channelSpecializedDesign.real_external_actions_executed, 'channel specialized design must record no real external actions')
  if (!Array.isArray(channelSpecializedDesign.channel_blueprints) || channelSpecializedDesign.channel_blueprints.length < 8) {
    errors.push('channel specialized design must include at least eight channel blueprints')
  }
  const blueprintIds = (channelSpecializedDesign.channel_blueprints || []).map((channel) => channel.channel_id)
  requireArrayIncludesAll(
    blueprintIds,
    [
      'seo_content_cluster',
      'google_search_ads',
      'linkedin_abm_and_lead_forms',
      'b2b_marketplaces_and_directories',
      'tiktok_short_video',
      'whatsapp_opt_in_followup',
      'email_nurture_and_quote_followup',
      'retargeting_pixels_and_remarketing'
    ],
    'channel specialized design missing channel blueprint'
  )
  requireArrayIncludesAll(
    channelSpecializedDesign.output_contracts,
    [
      'channel_suitability_score.v1',
      'channel_campaign_brief.v1',
      'channel_content_backlog.v1',
      'channel_launch_gate.v1',
      'campaign_event_metrics.v1'
    ],
    'channel specialized design missing output contract'
  )
  const blocked = channelSpecializedDesign.automation_boundaries?.blocked_until_manual_enablement || []
  requireArrayIncludesAll(
    blocked,
    ['publish content externally', 'send customer messages', 'activate ad campaigns', 'install tracking pixels', 'spend budget'],
    'channel specialized design missing blocked boundary'
  )
}

if (autoReplyBotDesign) {
  if (autoReplyBotDesign.contract !== 'auto_reply_bot_design.v1') {
    errors.push('auto reply bot design contract mismatch')
  }
  requireFalse(autoReplyBotDesign.real_external_actions_executed, 'auto reply bot must record no real external actions')
  requireArrayIncludesAll(
    autoReplyBotDesign.input_contracts,
    ['site_chat_message.v1', 'whatsapp_webhook_message.v1', 'tiktok_comment_or_lead_event.v1'],
    'auto reply bot missing input contract'
  )
  requireArrayIncludesAll(
    autoReplyBotDesign.output_contracts,
    ['inquiry_intake.v1', 'reply_draft.v1', 'lead_score.v1', 'missing_field_request.v1', 'human_handoff_packet.v1'],
    'auto reply bot missing output contract'
  )
  if (!Array.isArray(autoReplyBotDesign.escalation_rules) || autoReplyBotDesign.escalation_rules.length < 3) {
    errors.push('auto reply bot must define escalation rules')
  }
  const blockedText = (autoReplyBotDesign.bot_scope?.blocked || []).join(' ')
  if (!blockedText.includes('unapproved outbound messages') || !blockedText.includes('final quote send')) {
    errors.push('auto reply bot must block unapproved outbound messages and final quote sends')
  }
}

if (socialConnectorRegistry) {
  if (socialConnectorRegistry.contract !== 'social_media_connector_registry.v1') {
    errors.push('social connector registry contract mismatch')
  }
  requireFalse(socialConnectorRegistry.real_external_actions_executed, 'social connector registry must record no real external actions')
  const connectorIds = (socialConnectorRegistry.connectors || []).map((connector) => connector.connector_id)
  requireArrayIncludesAll(
    connectorIds,
    ['whatsapp_cloud_api', 'tiktok_marketing_api', 'tiktok_content_posting_api', 'tiktok_inbox_or_dm'],
    'social connector registry missing connector'
  )
  for (const connector of socialConnectorRegistry.connectors || []) {
    if (!['disabled', 'blocked'].includes(connector.default_state)) {
      errors.push(`connector default state must be disabled or blocked: ${connector.connector_id}`)
    }
    requireFalse(connector.real_send_allowed, `connector must block real send: ${connector.connector_id}`)
    if (!Array.isArray(connector.required_operator_inputs) || connector.required_operator_inputs.length < 3) {
      errors.push(`connector must list required operator inputs: ${connector.connector_id}`)
    }
  }
  const sourceUrls = (socialConnectorRegistry.official_source_refs || []).map((source) => source.official_url)
  for (const domain of ['developers.facebook.com', 'business-api.tiktok.com', 'developers.tiktok.com']) {
    if (!sourceUrls.some((url) => String(url).includes(domain))) {
      warnings.push(`official source domain not represented: ${domain}`)
    }
  }
}

if (connectionStatus) {
  if (connectionStatus.contract !== 'social_connection_status.v1') {
    errors.push('connection status contract mismatch')
  }
  requireFalse(connectionStatus.real_external_actions_executed, 'connection status must record no real external actions')
  if (connectionStatus.summary?.enabled_connector_count !== 0) {
    errors.push('connection status must keep enabled connector count at 0')
  }
  if (connectionStatus.summary?.ready_for_real_send_count !== 0) {
    errors.push('connection status must keep ready for real send count at 0')
  }
  requireFalse(connectionStatus.global_gates?.real_customer_message_send_allowed, 'global gate must block customer message sending')
  requireFalse(connectionStatus.global_gates?.ad_spend_allowed, 'global gate must block ad spend')
  requireFalse(connectionStatus.global_gates?.tiktok_posting_allowed, 'global gate must block TikTok posting')
  requireFalse(connectionStatus.global_gates?.whatsapp_reply_send_allowed, 'global gate must block WhatsApp replies')
}

const report = {
  contract: 'promotion_social_automation_validation_report.v1',
  checked_at: nowIso(),
  errors,
  warnings,
  result: errors.length ? 'fail' : 'pass'
}

ensureDir(packRoot)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
writeFileSync(reportMdPath, [
  '# Promotion Social Automation Validation',
  '',
  `Checked at: ${report.checked_at}`,
  `Result: ${report.result}`,
  '',
  '## Errors',
  '',
  ...(errors.length ? errors.map((error) => `- ${error}`) : ['- none']),
  '',
  '## Warnings',
  '',
  ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ['- none'])
].join('\n') + '\n', 'utf8')

if (errors.length) {
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
}

console.log(JSON.stringify(report, null, 2))
