import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const inputRunId = 'sensor_observation_validation_20260704_graph_io_readback';
const inputDir = path.join(root, 'runtime', 'sensor-observation-validation', inputRunId);
const outputRunId = 'tag_signature_refinement_validation_20260704';
const outputDir = path.join(root, 'runtime', 'sensor-observation-validation', outputRunId);
const createdAt = '2026-07-04T13:55:00+08:00';

const requiredSignatureDimensions = [
  'source',
  'modality',
  'domain',
  'scene',
  'event_family',
  'event',
  'intent',
  'actor',
  'actor_role',
  'target_object',
  'object_type',
  'time_bucket',
  'occurred_at_ref',
  'confirmation',
  'identity_status',
  'risk',
  'quality',
  'privacy',
  'retrieval',
  'evidence_ref',
  'raw_observation_ref',
  'semantic_unit_ref',
  'source_archive_ref',
  'relationship_write',
  'identity_merge',
  'external_action',
  'weight',
  'visual',
  'confidence_bucket',
  'polarity'
];

const optionalDimensions = [
  'conflict',
  'emotion',
  'condition',
  'quantity',
  'deadline',
  'promise',
  'boundary',
  'relationship_signal',
  'real_action'
];

const eventMeta = {
  proposal_and_quote_sent: {
    actor_role: 'user',
    target_object: 'proposal_quote',
    object_type: 'sales_material',
    polarity: 'reported_done',
    evidence_snippet: '方案和报价昨晚发了'
  },
  price_direction_accepted: {
    actor_role: 'customer_contact',
    target_object: 'price_direction',
    object_type: 'commercial_term',
    polarity: 'positive',
    evidence_snippet: '价格方向可以'
  },
  budget_requires_boss_confirmation: {
    actor_role: 'customer_contact',
    target_object: 'budget',
    object_type: 'budget_status',
    polarity: 'conditional',
    condition: 'boss_confirmation_required',
    evidence_snippet: '预算还要王总确认'
  },
  technical_review_planned: {
    actor_role: 'customer_technical',
    target_object: 'technical_review',
    object_type: 'review_session',
    polarity: 'positive',
    deadline: 'tomorrow_afternoon',
    promise: 'review_available',
    evidence_snippet: '明天下午可以评审'
  },
  whitelist_and_api_docs_required: {
    actor_role: 'customer_technical',
    target_object: 'whitelist_api_docs',
    object_type: 'technical_requirement',
    polarity: 'request',
    condition: 'provide_security_and_api_docs',
    evidence_snippet: '需要白名单和接口文档'
  },
  procurement_commitment_blocked_trial_only: {
    actor_role: 'decision_maker',
    target_object: 'procurement_commitment_trial_scope',
    object_type: 'procurement_scope',
    polarity: 'restrictive',
    boundary: 'trial_only_no_procurement_commitment',
    evidence_snippet: '先别承诺采购，只看试点范围'
  },
  budget_approved_claim: {
    actor_role: 'customer_contact',
    target_object: 'budget_approval',
    object_type: 'budget_status',
    polarity: 'positive_claim',
    conflict: 'budget_approval_status',
    evidence_snippet: '预算已经批了，周五可以走合同'
  },
  budget_approval_not_seen_conflict: {
    actor_role: 'finance',
    target_object: 'budget_approval_contract_timing',
    object_type: 'budget_contract',
    polarity: 'negative_conflict',
    conflict: 'budget_approval_status',
    evidence_snippet: '没看到预算批复，合同本周不能走'
  },
  budget_condition_amount_limit: {
    actor_role: 'decision_maker',
    target_object: 'budget_limit',
    object_type: 'budget_condition',
    polarity: 'conditional_positive',
    conflict: 'budget_approval_status',
    condition: 'amount_lte_80000',
    quantity: 'amount_lte_80000',
    evidence_snippet: '预算原则上同意，但金额要压到8万以内'
  },
  trial_scope_not_full_procurement: {
    actor_role: 'customer_contact',
    target_object: 'trial_scope_full_procurement',
    object_type: 'procurement_scope',
    polarity: 'restrictive',
    condition: 'trial_under_80000',
    quantity: 'amount_lte_80000',
    boundary: 'no_full_procurement_contract',
    evidence_snippet: '先按8万内试点，合同别写全量采购'
  },
  budget_status_conflict_parent: {
    actor_ref: 'system_derived',
    identity_status: 'system_derived',
    actor_role: 'system',
    target_object: 'budget_status_conflict_group',
    object_type: 'conflict_group',
    polarity: 'conflict_derived',
    conflict: 'budget_approval_status',
    evidence_mode: 'derived_from_child_events',
    evidence_snippet: null
  },
  attention_insecurity_signal: {
    actor_role: 'romantic_target',
    target_object: 'attention_level',
    object_type: 'relationship_attention',
    polarity: 'insecure_question',
    relationship_signal: 'attention_insecurity',
    emotion: 'insecure',
    evidence_snippet: '是不是对我没那么上心了'
  },
  weekend_meeting_intent: {
    actor_role: 'user',
    target_object: 'weekend_meeting',
    object_type: 'repair_action',
    polarity: 'positive_plan',
    promise: 'meet_weekend',
    deadline: 'weekend',
    emotion: 'warm',
    evidence_snippet: '周末想见你'
  },
  last_minute_cancel_boundary: {
    actor_role: 'romantic_target',
    target_object: 'last_minute_cancel',
    object_type: 'relationship_boundary',
    polarity: 'boundary_warning',
    boundary: 'avoid_last_minute_cancel',
    emotion: 'cautious',
    evidence_snippet: '别又临时取消'
  },
  relationship_uncertainty_insecurity: {
    actor_role: 'romantic_target',
    target_object: 'relationship_uncertainty',
    object_type: 'relationship_state_signal',
    polarity: 'insecure_signal',
    relationship_signal: 'relationship_uncertainty',
    emotion: 'insecure',
    evidence_snippet: '不确定关系，我有点不安'
  },
  order_pending_review_unpaid: {
    actor_ref: 'system_api',
    identity_status: 'system_observed',
    actor_role: 'api_system',
    target_object: 'order_payment_review_status',
    object_type: 'business_api_status',
    polarity: 'status_pending',
    evidence_snippet: ['order_status=pending_review', 'payment_status=unpaid']
  },
  payment_promise_tonight: {
    actor_role: 'customer',
    target_object: 'payment',
    object_type: 'payment_commitment',
    polarity: 'promise',
    promise: 'payment_tonight',
    deadline: 'tonight',
    evidence_snippet: '款项今晚付'
  },
  warehouse_notification_blocked: {
    actor_role: 'customer',
    target_object: 'warehouse_notification',
    object_type: 'external_action_boundary',
    polarity: 'prohibit_action',
    condition: 'do_not_notify_warehouse',
    boundary: 'warehouse_notification_blocked',
    evidence_snippet: '不要通知仓库发货'
  },
  prepare_shipment_dry_run_no_send: {
    actor_role: 'user',
    target_object: 'prepare_shipment',
    object_type: 'system_action_dry_run',
    polarity: 'dry_run_only',
    real_action: 'blocked',
    evidence_snippet: ['prepare-shipment', 'send=false']
  },
  net45_payment_term_requested: {
    actor_role: 'customer_procurement',
    target_object: 'payment_terms',
    object_type: 'commercial_term',
    polarity: 'change_request',
    condition: 'pilot_batch_only',
    evidence_snippet: ['Net45', 'pilot batch only']
  },
  legal_blocks_shipping_before_po: {
    actor_role: 'legal',
    target_object: 'shipping_before_po',
    object_type: 'external_action_boundary',
    polarity: 'prohibit_action',
    condition: 'po_signed_required',
    boundary: 'no_shipping_before_po',
    evidence_snippet: ['do not ship before PO is signed']
  },
  crm_closed_won_conflict: {
    actor_ref: 'system_crm',
    identity_status: 'system_observed',
    actor_role: 'crm_system',
    target_object: 'deal_stage',
    object_type: 'system_status',
    polarity: 'status_conflict',
    conflict: 'deal_stage_vs_customer_approval',
    evidence_snippet: ['stage=closed_won']
  },
  relationship_space_request_not_breakup: {
    actor_role: 'romantic_target',
    target_object: 'relationship_space_boundary',
    object_type: 'relationship_boundary',
    polarity: 'boundary_request',
    boundary: 'space_without_breakup_confirmation',
    relationship_signal: 'needs_space',
    emotion: 'overwhelmed',
    evidence_snippet: ['I need space', 'not asking to break up']
  },
  call_after_friday_preference: {
    actor_role: 'romantic_target',
    target_object: 'call_timing',
    object_type: 'communication_preference',
    polarity: 'preference',
    deadline: 'after_friday',
    condition: 'avoid_pressure_before_friday',
    evidence_snippet: ['call after Friday']
  },
  support_escalation_urgent: {
    actor_role: 'customer_success',
    target_object: 'support_escalation',
    object_type: 'incident_priority',
    polarity: 'urgent',
    condition: 'vip_customer_affected',
    evidence_snippet: ['VIP customer is affected']
  },
  refund_action_blocked_pending_approval: {
    actor_role: 'operations_manager',
    target_object: 'refund_action',
    object_type: 'external_action_boundary',
    polarity: 'prohibit_action',
    condition: 'approval_missing',
    boundary: 'refund_requires_approval',
    evidence_snippet: ['do not issue a refund yet']
  },
  invoice_ocr_amount_mismatch: {
    actor_ref: 'system_ocr',
    identity_status: 'system_observed',
    actor_role: 'ocr_system',
    target_object: 'invoice_amount',
    object_type: 'ocr_financial_field',
    polarity: 'mismatch',
    conflict: 'invoice_amount_mismatch',
    quantity: 'invoice_total_mismatch',
    evidence_snippet: ['invoice_total=12800', 'po_total=11800']
  },
  voice_note_promises_update_tomorrow: {
    actor_role: 'customer_contact',
    target_object: 'project_update',
    object_type: 'communication_commitment',
    polarity: 'promise',
    promise: 'update_tomorrow',
    deadline: 'tomorrow',
    evidence_snippet: ['will update tomorrow']
  }
};

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, String(value ?? ''), 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function rel(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function sourceTextForPacket(packet) {
  const rawRef = packet.source_archive?.raw_ref;
  if (!rawRef) return '';
  const fullPath = path.isAbsolute(rawRef) ? rawRef : path.join(root, rawRef);
  try {
    return readFileSync(fullPath, 'utf8');
  } catch {
    return '';
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function tagDimension(tag) {
  const index = tag.indexOf(':');
  return index >= 0 ? tag.slice(0, index) : tag;
}

function getTag(tags, dimension) {
  const prefix = `${dimension}:`;
  return tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function confidenceBucket(confidence) {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.7) return 'medium';
  return 'low';
}

function timeBucket(occurredAt) {
  if (String(occurredAt).startsWith('2026-07-04')) return 'today';
  return 'history';
}

function sceneForPacket(packetId) {
  if (packetId.includes('long_sales_contract')) return 'long_sales_contract_review';
  if (packetId.includes('long_romantic_boundary')) return 'long_romantic_boundary_history';
  if (packetId.includes('long_support_ops')) return 'long_support_ops_conflict';
  if (packetId.includes('long_multisensor_invoice')) return 'long_multisensor_invoice_voice';
  if (packetId.includes('conflict')) return 'group_chat_conflict';
  if (packetId.includes('romantic')) return 'romantic_chat';
  if (packetId.includes('multimodal')) return 'mixed_api_ocr_system';
  return 'group_chat';
}

function syntheticEvent({
  packetId,
  index,
  eventTypeCode,
  eventFamily,
  goalDomain,
  participant,
  identityStatus = 'candidate',
  occurredAt,
  evidenceText,
  intent,
  risk = 'medium',
  quality = 'text',
  privacy = 'private',
  weight = 'V3',
  visual = 'normal',
  confidence = 0.82,
  confirmationState = 'observed_candidate'
}) {
  return {
    semantic_event_id: `evt_${packetId}_${index}`,
    event_type_code: eventTypeCode,
    event_family: eventFamily,
    goal_domain: [goalDomain],
    occurred_at: occurredAt,
    confirmation_state: confirmationState,
    participants: participant
      ? [{ mention_id: participant, identity_status: identityStatus }]
      : [],
    evidence_refs: [
      `frame_${packetId}_${index}`,
      `raw_obs_${packetId}_${index}`,
      `sem_${packetId}_${index}`
    ],
    evidence_text: evidenceText,
    tags: [
      `intent:${intent}`,
      `risk:${risk}`,
      `quality:${quality}`,
      `privacy:${privacy}`,
      `weight:${weight}`,
      `visual:${visual}`
    ],
    relationship_write_allowed: false,
    identity_merge_allowed: false,
    real_external_action_allowed: false,
    confidence
  };
}

function createSyntheticPacket({
  packetId,
  sourceType,
  platform,
  modality,
  capturedAt,
  rawText,
  events
}) {
  return {
    packet_id: packetId,
    source_archive: {
      source_archive_id: `source_archive_${packetId}`,
      source_type: sourceType,
      modality,
      platform,
      adapter_id: `simulation.${platform}`,
      captured_at: capturedAt,
      raw_ref: rel(path.join(outputDir, 'extended-cases', packetId, 'raw.txt')),
      artifact_refs: [],
      raw_hash: `sha256:synthetic_${packetId}`,
      privacy_level: 'private',
      delete_state: 'active'
    },
    semantic_events: events,
    raw_text: rawText
  };
}

function buildExtendedScenarioPackets() {
  const longSalesText = [
    '[2026-07-04 10:11] procurement: We can continue the pilot batch only if payment terms move to Net45; this is not approval for full rollout.',
    '[2026-07-04 10:13] legal: Please do not ship before PO is signed, even if the demo units are already packed.',
    '[2026-07-04 10:15] CRM webhook: deal_id=QX-7788 stage=closed_won owner=amy updated_at=2026-07-04T10:15:00+08:00.'
  ].join('\n');
  const longRomanticText = [
    '[2026-07-04 21:02] target: I need space tonight; I am overwhelmed, but I am not asking to break up.',
    '[2026-07-04 21:03] target: Please do not pressure me before Friday. If you want to talk, call after Friday.',
    '[2026-07-04 21:05] user draft: I hear you. I will give you space and will not define the relationship from one message.'
  ].join('\n');
  const longSupportText = [
    '[2026-07-04 15:20] success: VIP customer is affected; escalation is urgent, but root cause is not confirmed.',
    '[2026-07-04 15:22] ops: do not issue a refund yet; approval is missing and finance needs to review the evidence.',
    '[2026-07-04 15:25] support-log: ticket=INC-2041 severity=high status=investigating customer_tier=vip.'
  ].join('\n');
  const longMultisensorText = [
    '[2026-07-04 16:40] OCR invoice: invoice_total=12800 currency=CNY; PO image says po_total=11800 currency=CNY.',
    '[2026-07-04 16:42] voice transcript: customer contact says they will update tomorrow after checking the revised invoice.',
    '[2026-07-04 16:45] system: no outbound payment reminder was sent; dry_run=true.'
  ].join('\n');
  return [
    createSyntheticPacket({
      packetId: 'case_long_sales_contract_terms_conflict',
      sourceType: 'desktop',
      platform: 'wechat_desktop',
      modality: ['text', 'crm_webhook'],
      capturedAt: '2026-07-04T10:16:00+08:00',
      rawText: longSalesText,
      events: [
        syntheticEvent({
          packetId: 'case_long_sales_contract_terms_conflict',
          index: 1,
          eventTypeCode: 'net45_payment_term_requested',
          eventFamily: 'commercial_terms',
          goalDomain: 'sales_customer_progress',
          participant: 'mention_procurement',
          occurredAt: '2026-07-04T10:11:00+08:00',
          evidenceText: '[2026-07-04 10:11] procurement: We can continue the pilot batch only if payment terms move to Net45; this is not approval for full rollout.',
          intent: 'change_request',
          risk: 'medium',
          weight: 'V4',
          visual: 'review'
        }),
        syntheticEvent({
          packetId: 'case_long_sales_contract_terms_conflict',
          index: 2,
          eventTypeCode: 'legal_blocks_shipping_before_po',
          eventFamily: 'external_action_boundary',
          goalDomain: 'sales_customer_progress',
          participant: 'mention_legal',
          occurredAt: '2026-07-04T10:13:00+08:00',
          evidenceText: '[2026-07-04 10:13] legal: Please do not ship before PO is signed, even if the demo units are already packed.',
          intent: 'prohibit_action',
          risk: 'high',
          weight: 'V5',
          visual: 'requires_confirmation',
          confirmationState: 'requires_confirmation'
        }),
        syntheticEvent({
          packetId: 'case_long_sales_contract_terms_conflict',
          index: 3,
          eventTypeCode: 'crm_closed_won_conflict',
          eventFamily: 'system_status_conflict',
          goalDomain: 'sales_customer_progress',
          participant: 'system_crm',
          identityStatus: 'system_observed',
          occurredAt: '2026-07-04T10:15:00+08:00',
          evidenceText: '[2026-07-04 10:15] CRM webhook: deal_id=QX-7788 stage=closed_won owner=amy updated_at=2026-07-04T10:15:00+08:00.',
          intent: 'status_conflict',
          quality: 'crm_webhook',
          risk: 'high',
          weight: 'V5',
          visual: 'requires_confirmation',
          confirmationState: 'requires_confirmation'
        })
      ]
    }),
    createSyntheticPacket({
      packetId: 'case_long_romantic_boundary_history',
      sourceType: 'manual',
      platform: 'operator_note',
      modality: ['text'],
      capturedAt: '2026-07-04T21:06:00+08:00',
      rawText: longRomanticText,
      events: [
        syntheticEvent({
          packetId: 'case_long_romantic_boundary_history',
          index: 1,
          eventTypeCode: 'relationship_space_request_not_breakup',
          eventFamily: 'relationship_boundary',
          goalDomain: 'romance_relationship_maintenance',
          participant: 'mention_romantic_target',
          occurredAt: '2026-07-04T21:02:00+08:00',
          evidenceText: '[2026-07-04 21:02] target: I need space tonight; I am overwhelmed, but I am not asking to break up.',
          intent: 'boundary_request',
          risk: 'high',
          weight: 'V5',
          visual: 'requires_confirmation',
          confirmationState: 'requires_confirmation'
        }),
        syntheticEvent({
          packetId: 'case_long_romantic_boundary_history',
          index: 2,
          eventTypeCode: 'call_after_friday_preference',
          eventFamily: 'communication_preference',
          goalDomain: 'romance_relationship_maintenance',
          participant: 'mention_romantic_target',
          occurredAt: '2026-07-04T21:03:00+08:00',
          evidenceText: '[2026-07-04 21:03] target: Please do not pressure me before Friday. If you want to talk, call after Friday.',
          intent: 'timing_preference',
          risk: 'medium',
          weight: 'V3',
          visual: 'normal'
        })
      ]
    }),
    createSyntheticPacket({
      packetId: 'case_long_support_ops_conflict',
      sourceType: 'desktop',
      platform: 'slack_export',
      modality: ['text', 'ticket_log'],
      capturedAt: '2026-07-04T15:26:00+08:00',
      rawText: longSupportText,
      events: [
        syntheticEvent({
          packetId: 'case_long_support_ops_conflict',
          index: 1,
          eventTypeCode: 'support_escalation_urgent',
          eventFamily: 'support_incident',
          goalDomain: 'general_relationship_event',
          participant: 'mention_success',
          occurredAt: '2026-07-04T15:20:00+08:00',
          evidenceText: '[2026-07-04 15:20] success: VIP customer is affected; escalation is urgent, but root cause is not confirmed.',
          intent: 'urgent_escalation',
          risk: 'high',
          weight: 'V4',
          visual: 'review'
        }),
        syntheticEvent({
          packetId: 'case_long_support_ops_conflict',
          index: 2,
          eventTypeCode: 'refund_action_blocked_pending_approval',
          eventFamily: 'external_action_boundary',
          goalDomain: 'general_relationship_event',
          participant: 'mention_ops_manager',
          occurredAt: '2026-07-04T15:22:00+08:00',
          evidenceText: '[2026-07-04 15:22] ops: do not issue a refund yet; approval is missing and finance needs to review the evidence.',
          intent: 'prohibit_action',
          risk: 'high',
          weight: 'V5',
          visual: 'requires_confirmation',
          confirmationState: 'requires_confirmation'
        })
      ]
    }),
    createSyntheticPacket({
      packetId: 'case_long_multisensor_invoice_voice',
      sourceType: 'desktop',
      platform: 'mixed_sensor',
      modality: ['ocr', 'voice_transcript', 'system_log'],
      capturedAt: '2026-07-04T16:46:00+08:00',
      rawText: longMultisensorText,
      events: [
        syntheticEvent({
          packetId: 'case_long_multisensor_invoice_voice',
          index: 1,
          eventTypeCode: 'invoice_ocr_amount_mismatch',
          eventFamily: 'financial_document_conflict',
          goalDomain: 'sales_customer_progress',
          participant: 'system_ocr',
          identityStatus: 'system_observed',
          occurredAt: '2026-07-04T16:40:00+08:00',
          evidenceText: '[2026-07-04 16:40] OCR invoice: invoice_total=12800 currency=CNY; PO image says po_total=11800 currency=CNY.',
          intent: 'document_mismatch',
          quality: 'ocr',
          risk: 'high',
          weight: 'V5',
          visual: 'requires_confirmation',
          confirmationState: 'requires_confirmation'
        }),
        syntheticEvent({
          packetId: 'case_long_multisensor_invoice_voice',
          index: 2,
          eventTypeCode: 'voice_note_promises_update_tomorrow',
          eventFamily: 'communication_commitment',
          goalDomain: 'sales_customer_progress',
          participant: 'mention_customer_contact',
          occurredAt: '2026-07-04T16:42:00+08:00',
          evidenceText: '[2026-07-04 16:42] voice transcript: customer contact says they will update tomorrow after checking the revised invoice.',
          intent: 'promise',
          quality: 'voice_transcript',
          risk: 'medium',
          weight: 'V3',
          visual: 'normal'
        })
      ]
    })
  ];
}

function buildUpgradedTags({ packet, event }) {
  const meta = eventMeta[event.event_type_code];
  if (!meta) throw new Error(`Missing eventMeta for ${event.event_type_code}`);
  const actorMention = meta.actor_ref ?? event.participants?.[0]?.mention_id ?? 'actor_unknown';
  const identityStatus = meta.identity_status ?? event.participants?.[0]?.identity_status ?? 'unknown';
  const frameRef = event.evidence_refs.find((item) => item.startsWith('frame_')) ?? 'frame_missing';
  const rawObservationRef = event.evidence_refs.find((item) => item.startsWith('raw_obs_')) ?? 'raw_observation_missing';
  const semanticUnitRef = event.evidence_refs.find((item) => item.startsWith('sem_')) ?? 'semantic_unit_missing';
  const sourceArchiveRef = packet.source_archive.source_archive_id;
  return unique([
    `source:${packet.source_archive.platform}`,
    ...packet.source_archive.modality.map((item) => `modality:${item}`),
    `domain:${event.goal_domain[0]}`,
    `scene:${sceneForPacket(packet.packet_id)}`,
    `event_family:${event.event_family}`,
    `event:${event.event_type_code}`,
    `intent:${getTag(event.tags, 'intent') ?? 'unknown'}`,
    `actor:${actorMention}`,
    `actor_role:${meta.actor_role}`,
    `target_object:${meta.target_object}`,
    `object_type:${meta.object_type}`,
    `time_bucket:${timeBucket(event.occurred_at)}`,
    `occurred_at_ref:${event.semantic_event_id}.occurred_at`,
    `confirmation:${event.confirmation_state}`,
    `identity_status:${identityStatus}`,
    `risk:${getTag(event.tags, 'risk') ?? 'unknown'}`,
    `quality:${getTag(event.tags, 'quality') ?? 'unknown'}`,
    `privacy:${getTag(event.tags, 'privacy') ?? 'private'}`,
    'retrieval:event',
    'retrieval:evidence',
    `evidence_ref:${frameRef}`,
    `raw_observation_ref:${rawObservationRef}`,
    `semantic_unit_ref:${semanticUnitRef}`,
    `source_archive_ref:${sourceArchiveRef}`,
    `relationship_write:${event.relationship_write_allowed ? 'allowed' : 'blocked'}`,
    `identity_merge:${event.identity_merge_allowed ? 'allowed' : 'blocked'}`,
    `external_action:${event.real_external_action_allowed ? 'allowed' : 'blocked'}`,
    `weight:${getTag(event.tags, 'weight') ?? 'unknown'}`,
    `visual:${getTag(event.tags, 'visual') ?? 'unknown'}`,
    `confidence_bucket:${confidenceBucket(event.confidence)}`,
    `polarity:${meta.polarity}`,
    meta.conflict ? `conflict:${meta.conflict}` : null,
    meta.emotion ? `emotion:${meta.emotion}` : null,
    meta.condition ? `condition:${meta.condition}` : null,
    meta.quantity ? `quantity:${meta.quantity}` : null,
    meta.deadline ? `deadline:${meta.deadline}` : null,
    meta.promise ? `promise:${meta.promise}` : null,
    meta.boundary ? `boundary:${meta.boundary}` : null,
    meta.relationship_signal ? `relationship_signal:${meta.relationship_signal}` : null,
    meta.real_action ? `real_action:${meta.real_action}` : null
  ]);
}

function reconstructSignature(tags) {
  return {
    source: getTag(tags, 'source'),
    modalities: tags.filter((tag) => tag.startsWith('modality:')).map((tag) => tag.slice('modality:'.length)),
    domain: getTag(tags, 'domain'),
    scene: getTag(tags, 'scene'),
    event_family: getTag(tags, 'event_family'),
    event_type_code: getTag(tags, 'event'),
    intent: getTag(tags, 'intent'),
    actor: getTag(tags, 'actor'),
    actor_role: getTag(tags, 'actor_role'),
    target_object: getTag(tags, 'target_object'),
    object_type: getTag(tags, 'object_type'),
    time_bucket: getTag(tags, 'time_bucket'),
    occurred_at_ref: getTag(tags, 'occurred_at_ref'),
    confirmation: getTag(tags, 'confirmation'),
    identity_status: getTag(tags, 'identity_status'),
    risk: getTag(tags, 'risk'),
    quality: getTag(tags, 'quality'),
    privacy: getTag(tags, 'privacy'),
    evidence_ref: getTag(tags, 'evidence_ref'),
    raw_observation_ref: getTag(tags, 'raw_observation_ref'),
    semantic_unit_ref: getTag(tags, 'semantic_unit_ref'),
    source_archive_ref: getTag(tags, 'source_archive_ref'),
    relationship_write: getTag(tags, 'relationship_write'),
    identity_merge: getTag(tags, 'identity_merge'),
    external_action: getTag(tags, 'external_action'),
    weight: getTag(tags, 'weight'),
    visual: getTag(tags, 'visual'),
    confidence_bucket: getTag(tags, 'confidence_bucket'),
    polarity: getTag(tags, 'polarity'),
    conflict: getTag(tags, 'conflict'),
    emotion: getTag(tags, 'emotion'),
    condition: getTag(tags, 'condition'),
    quantity: getTag(tags, 'quantity'),
    deadline: getTag(tags, 'deadline'),
    promise: getTag(tags, 'promise'),
    boundary: getTag(tags, 'boundary'),
    relationship_signal: getTag(tags, 'relationship_signal'),
    real_action: getTag(tags, 'real_action')
  };
}

function evidenceSnippetCheck({ event, meta, sourceText }) {
  if (meta.evidence_mode === 'derived_from_child_events') {
    return {
      status: 'pass',
      mode: 'derived_from_child_events',
      snippet: null,
      is_substring: null,
      snippets_in_source: null,
      evidence_text_in_source: null,
      snippet_length: 0,
      source_length: event.evidence_text.length,
      compression_ratio: 0,
      reason: 'derived parent event keeps child evidence refs instead of duplicating raw text'
    };
  }
  const snippets = Array.isArray(meta.evidence_snippet) ? meta.evidence_snippet : [meta.evidence_snippet];
  const isSubstring = snippets.every((snippet) => event.evidence_text.includes(snippet));
  const snippetsInSource = snippets.every((snippet) => sourceText.includes(snippet));
  const evidenceTextInSource = sourceText.includes(event.evidence_text);
  const snippetLength = snippets.reduce((sum, snippet) => sum + [...snippet].length, 0);
  const sourceLength = [...event.evidence_text].length;
  const compressionRatio = Number((snippetLength / Math.max(sourceLength, 1)).toFixed(3));
  const eachSnippetConcise = snippets.every((snippet) => [...snippet].length <= 42);
  const concise = eachSnippetConcise && compressionRatio <= 0.72;
  return {
    status: isSubstring && snippetsInSource && evidenceTextInSource && concise ? 'pass' : 'fail',
    mode: 'direct_original_substring',
    snippets,
    is_substring: isSubstring,
    snippets_in_source: snippetsInSource,
    evidence_text_in_source: evidenceTextInSource,
    snippet_length: snippetLength,
    source_length: sourceLength,
    compression_ratio: compressionRatio,
    each_snippet_concise: eachSnippetConcise,
    concise
  };
}

function validateEvent({ packet, event, sourceText }) {
  const meta = eventMeta[event.event_type_code];
  const upgradedTags = buildUpgradedTags({ packet, event });
  const dimensions = new Set(upgradedTags.map(tagDimension));
  const missingRequired = requiredSignatureDimensions.filter((dimension) => !dimensions.has(dimension));
  const signature = reconstructSignature(upgradedTags);
  const evidenceCheck = evidenceSnippetCheck({ event, meta, sourceText });
  const semanticMatchFailures = [
    signature.event_type_code === event.event_type_code ? null : 'event_type_code',
    signature.actor !== (meta.actor_ref ?? event.participants?.[0]?.mention_id ?? 'actor_unknown') ? 'actor' : null,
    signature.identity_status !== (meta.identity_status ?? event.participants?.[0]?.identity_status ?? 'unknown') ? 'identity_status' : null,
    signature.target_object !== meta.target_object ? 'target_object' : null,
    signature.object_type !== meta.object_type ? 'object_type' : null,
    signature.relationship_write !== 'blocked' ? 'relationship_write' : null,
    signature.identity_merge !== 'blocked' ? 'identity_merge' : null,
    signature.external_action !== 'blocked' ? 'external_action' : null
  ].filter(Boolean);
  const tagBudget = {
    tag_count: upgradedTags.length,
    max_allowed: 40,
    status: upgradedTags.length <= 40 ? 'pass' : 'fail'
  };
  return {
    event_id: event.semantic_event_id,
    event_type_code: event.event_type_code,
    upgraded_tags: upgradedTags,
    reconstructed_signature: signature,
    required_signature_coverage: {
      status: missingRequired.length ? 'fail' : 'pass',
      missing_required_dimensions: missingRequired
    },
    evidence_extraction: evidenceCheck,
    semantic_match: {
      status: semanticMatchFailures.length ? 'fail' : 'pass',
      failures: semanticMatchFailures
    },
    tag_budget: tagBudget,
    decision: missingRequired.length === 0
      && evidenceCheck.status === 'pass'
      && semanticMatchFailures.length === 0
      && tagBudget.status === 'pass'
      ? 'accepted'
      : 'failed'
  };
}

function main() {
  const packetsIndex = readJson(path.join(inputDir, 'packets-index.json'));
  const baselinePackets = packetsIndex.map((entry) => {
    const packet = readJson(path.join(root, entry.path));
    return {
      scope: 'baseline',
      packet,
      source_text: sourceTextForPacket(packet),
      path: entry.path
    };
  });
  const extendedPackets = buildExtendedScenarioPackets().map((packet) => {
    const caseDir = path.join(outputDir, 'extended-cases', packet.packet_id);
    writeText(path.join(caseDir, 'raw.txt'), packet.raw_text);
    const packetForDisk = { ...packet };
    delete packetForDisk.raw_text;
    writeJson(path.join(caseDir, 'packet.json'), packetForDisk);
    return {
      scope: 'extended_long_case',
      packet: packetForDisk,
      source_text: packet.raw_text,
      path: rel(path.join(caseDir, 'packet.json'))
    };
  });
  const packetInputs = [...baselinePackets, ...extendedPackets];
  const packetReports = packetInputs.map(({ packet, source_text: sourceText, scope, path: packetPath }) => {
    const events = packet.semantic_events.map((event) => validateEvent({ packet, event, sourceText }));
    return {
      packet_id: packet.packet_id,
      scope,
      packet_path: packetPath,
      source_archive_id: packet.source_archive.source_archive_id,
      event_count: events.length,
      accepted_count: events.filter((event) => event.decision === 'accepted').length,
      failed_count: events.filter((event) => event.decision !== 'accepted').length,
      events
    };
  });
  const allEvents = packetReports.flatMap((packet) => packet.events);
  const failedEvents = allEvents.filter((event) => event.decision !== 'accepted');
  const evidenceChecks = allEvents.map((event) => event.evidence_extraction);
  const nonDerivedEvidenceChecks = evidenceChecks.filter((check) => check.mode === 'direct_original_substring');
  const tagCounts = allEvents.map((event) => event.tag_budget.tag_count);
  const report = {
    schema_version: 'tag_signature_refinement_validation.v1',
    validation_id: outputRunId,
    created_at: createdAt,
    input_run: rel(inputDir),
    goal: 'validate upgraded tags can reconstruct concise event signatures while evidence snippets remain short and source-traceable',
    gates: {
      signature_reconstruction: 'all required signature dimensions present and match event object references',
      evidence_concision: 'direct event evidence snippet must be original substring, <=42 chars and <=72% of source evidence line',
      logical_rigor: 'relationship write, identity merge and external action remain blocked unless separately confirmed',
      tag_budget: 'upgraded tag set must stay <=40 tags per event'
    },
    required_signature_dimensions: requiredSignatureDimensions,
    optional_signature_dimensions: optionalDimensions,
    aggregate: {
      packet_count: packetReports.length,
      event_count: allEvents.length,
      accepted_count: allEvents.filter((event) => event.decision === 'accepted').length,
      failed_count: failedEvents.length,
      max_tag_count: Math.max(...tagCounts),
      avg_tag_count: Number((tagCounts.reduce((sum, value) => sum + value, 0) / tagCounts.length).toFixed(2)),
      avg_evidence_snippet_length: Number((nonDerivedEvidenceChecks.reduce((sum, check) => sum + check.snippet_length, 0) / nonDerivedEvidenceChecks.length).toFixed(2)),
      avg_evidence_compression_ratio: Number((nonDerivedEvidenceChecks.reduce((sum, check) => sum + check.compression_ratio, 0) / nonDerivedEvidenceChecks.length).toFixed(3)),
      evidence_substring_failures: nonDerivedEvidenceChecks.filter((check) =>
        !check.is_substring || !check.snippets_in_source || !check.evidence_text_in_source
      ).length,
      evidence_concision_failures: nonDerivedEvidenceChecks.filter((check) => check.status !== 'pass').length,
      boundary_failures: allEvents.flatMap((event) => event.semantic_match.failures.filter((failure) =>
        ['relationship_write', 'identity_merge', 'external_action'].includes(failure)
      )).length
    },
    scenario_coverage: {
      baseline_packet_count: packetReports.filter((packet) => packet.scope === 'baseline').length,
      extended_long_packet_count: packetReports.filter((packet) => packet.scope === 'extended_long_case').length,
      extended_long_event_count: packetReports
        .filter((packet) => packet.scope === 'extended_long_case')
        .reduce((sum, packet) => sum + packet.event_count, 0),
      domains: unique(allEvents.map((event) => event.reconstructed_signature.domain)),
      scenes: unique(allEvents.map((event) => event.reconstructed_signature.scene))
    },
    packet_reports: packetReports,
    failed_events: failedEvents.map((event) => ({
      event_id: event.event_id,
      event_type_code: event.event_type_code,
      required_signature_coverage: event.required_signature_coverage,
      evidence_extraction: event.evidence_extraction,
      semantic_match: event.semantic_match,
      tag_budget: event.tag_budget
    })),
    conclusion: failedEvents.length === 0
      ? 'upgraded_tag_signature_validation_passed'
      : 'upgraded_tag_signature_validation_failed'
  };
  writeJson(path.join(outputDir, 'tag-signature-refinement-validation.json'), report);
  console.log(JSON.stringify({
    report: rel(path.join(outputDir, 'tag-signature-refinement-validation.json')),
    aggregate: report.aggregate,
    conclusion: report.conclusion
  }, null, 2));
}

main();
