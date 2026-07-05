import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CREATED_AT = '2026-07-04T16:30:00+08:00';
const DEFAULT_RUN_ID = 'tag_registry_validation_20260704';
const EVIDENCE_SNIPPET_MAX_CHARS = 42;
const EVIDENCE_COMPRESSION_MAX_RATIO = 0.72;
const MAX_TAGS_PER_EVENT = 36;
const MAX_TAG_VALUE_CHARS = 96;

const REQUIRED_BUCKETS = [
  {
    bucket: 'route',
    dimensions: ['source', 'modality', 'domain', 'scene']
  },
  {
    bucket: 'event_semantics',
    dimensions: ['event_family', 'event', 'intent']
  },
  {
    bucket: 'subject',
    dimensions: ['person', 'source_identity', 'mention', 'actor_role', 'system_subject']
  },
  {
    bucket: 'object_or_place',
    dimensions: ['target_object', 'object.type', 'object_type', 'location', 'physical.quantity_kind']
  },
  {
    bucket: 'time',
    dimensions: ['time.relative', 'time.absolute', 'time_bucket']
  },
  {
    bucket: 'evidence',
    dimensions: ['retrieval', 'evidence_ref', 'source_archive_ref']
  },
  {
    bucket: 'boundary_or_state',
    dimensions: [
      'boundary',
      'certainty',
      'confirmation',
      'conflict',
      'external_action',
      'permission',
      'polarity',
      'preference',
      'relationship_signal',
      'risk',
      'state'
    ]
  }
];

const QUERY_TESTS = [
  {
    query_id: 'q_person_zhang_sales',
    label: '按人物张总召回全部相关事件',
    mode: 'tag',
    tags: ['person:zhang_001'],
    expected_event_ids: [
      'evt_001_sales_budget_pending',
      'evt_002_technical_review_window',
      'evt_006_warehouse_notification_blocked'
    ]
  },
  {
    query_id: 'q_budget_family',
    label: '按预算事件族召回预算待确认',
    mode: 'tag',
    tags: ['event_family:budget_status'],
    expected_event_ids: ['evt_001_sales_budget_pending']
  },
  {
    query_id: 'q_tomorrow_afternoon',
    label: '按明天下午召回技术评审窗口',
    mode: 'tag',
    tags: ['time.relative:tomorrow_afternoon'],
    expected_event_ids: ['evt_002_technical_review_window']
  },
  {
    query_id: 'q_needs_space',
    label: '按需要空间召回关系边界',
    mode: 'tag',
    tags: ['relationship_signal:needs_space'],
    expected_event_ids: ['evt_003_relationship_space_request']
  },
  {
    query_id: 'q_invoice_conflict',
    label: '按发票金额冲突召回 OCR 事件',
    mode: 'tag',
    tags: ['conflict:invoice_amount_mismatch'],
    expected_event_ids: ['evt_005_invoice_amount_mismatch']
  },
  {
    query_id: 'q_external_action_blocked',
    label: '按外部动作禁止召回仓库通知边界',
    mode: 'tag',
    tags: ['external_action:blocked'],
    expected_event_ids: ['evt_006_warehouse_notification_blocked']
  },
  {
    query_id: 'q_cake',
    label: '按蛋糕物品召回家庭生日事件',
    mode: 'tag',
    tags: ['object.type:cake'],
    expected_event_ids: ['evt_007_family_birthday_dinner']
  },
  {
    query_id: 'q_sofa_left',
    label: '按沙发左侧位置召回蓝色外套',
    mode: 'tag',
    tags: ['location:living_room_sofa_left'],
    expected_event_ids: ['evt_008_blue_jacket_on_sofa']
  },
  {
    query_id: 'q_sensor_high_risk',
    label: '按高风险召回漏水传感器事件',
    mode: 'all_tags',
    tags: ['source:home_sensor', 'risk:high'],
    expected_event_ids: ['evt_009_water_leak_detected']
  },
  {
    query_id: 'q_pressure_emotion',
    label: '按压力评估召回关系压力内容',
    mode: 'tag',
    tags: ['emotion.appraisal:pressure'],
    expected_event_ids: ['evt_003_relationship_space_request', 'evt_010_avoid_repeated_prompting']
  }
];

const CONTEXT_TESTS = [
  {
    snapshot_id: 'ctx_zhang_budget_review',
    question: '张总最近关于预算和技术评审说了什么？',
    required_tags: ['person:zhang_001'],
    any_tags: ['event_family:budget_status', 'event_family:technical_review'],
    expected_event_ids: ['evt_001_sales_budget_pending', 'evt_002_technical_review_window']
  },
  {
    snapshot_id: 'ctx_relationship_pressure_boundary',
    question: '她最近的沟通压力和边界是什么？',
    required_tags: ['domain:romance_relationship_maintenance'],
    any_tags: ['relationship_signal:needs_space', 'preference:avoid_pressure', 'emotion.appraisal:pressure'],
    expected_event_ids: [
      'evt_003_relationship_space_request',
      'evt_004_not_breakup_statement',
      'evt_010_avoid_repeated_prompting'
    ]
  },
  {
    snapshot_id: 'ctx_invoice_conflict_action_boundary',
    question: '发票金额冲突和发货动作边界分别是什么？',
    required_tags: ['domain:sales_customer_progress'],
    any_tags: ['conflict:invoice_amount_mismatch', 'external_action:blocked'],
    expected_event_ids: ['evt_005_invoice_amount_mismatch', 'evt_006_warehouse_notification_blocked']
  }
];

function projectRoot() {
  return path.resolve(here, '../../..');
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tempPath, filePath);
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, String(value ?? ''), 'utf8');
}

function rel(root, filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))];
}

function stableSlug(value) {
  return String(value ?? 'unknown')
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function tagDimension(tag) {
  const index = String(tag).indexOf(':');
  return index >= 0 ? String(tag).slice(0, index) : String(tag);
}

function tagSuffix(tag) {
  const index = String(tag).indexOf(':');
  return index >= 0 ? String(tag).slice(index + 1) : '';
}

function tagsByDimension(tags, dimension) {
  const prefix = `${dimension}:`;
  return (tags ?? []).filter((tag) => String(tag).startsWith(prefix));
}

function getTag(tags, dimension) {
  return tagsByDimension(tags, dimension)[0] ?? null;
}

function makeDefinition({
  tagValue = null,
  tagPattern = null,
  namespace,
  dimension,
  labelZh,
  labelEn = '',
  description = '',
  allowedValues = null,
  valueType = 'controlled_value',
  precisionLevel = 'semantic_signature',
  privacyLevel = 'private',
  conflictPolicy = 'allow',
  appliesTo = ['TaggedEvent', 'TagAssignment', 'ContextSnapshot'],
  allowedAssignmentMethods = ['rule', 'model', 'manual', 'sensor']
}) {
  return {
    schema_version: 'tag_definition.v1',
    tag_id: `tag.${stableSlug(tagValue ?? tagPattern)}`,
    ...(tagValue ? { tag_value: tagValue } : { tag_pattern: tagPattern }),
    namespace,
    dimension,
    ...(allowedValues ? { allowed_values: allowedValues } : {}),
    label_zh: labelZh,
    label_en: labelEn,
    description,
    applies_to: appliesTo,
    aliases: [],
    value_type: valueType,
    precision_level: precisionLevel,
    privacy_level: privacyLevel,
    source_of_authority: 'tag_registry_runtime_seed',
    allowed_assignment_methods: allowedAssignmentMethods,
    conflict_policy: conflictPolicy,
    deprecated: false,
    version: 1
  };
}

function patternDefinition(dimension, {
  labelZh,
  allowedValues = null,
  valueType = 'controlled_value',
  precisionLevel = 'semantic_signature',
  conflictPolicy = 'allow'
}) {
  return makeDefinition({
    tagPattern: `${dimension}:*`,
    namespace: dimension,
    dimension,
    labelZh,
    allowedValues,
    valueType,
    precisionLevel,
    conflictPolicy
  });
}

function exactDefinition(tagValue, {
  labelZh,
  valueType = 'controlled_value',
  precisionLevel = 'semantic_signature',
  conflictPolicy = 'allow'
}) {
  const dimension = tagDimension(tagValue);
  return makeDefinition({
    tagValue,
    namespace: dimension,
    dimension,
    labelZh,
    valueType,
    precisionLevel,
    conflictPolicy
  });
}

export function buildTagRegistrySeed() {
  return [
    patternDefinition('source', {
      labelZh: '来源类型',
      allowedValues: ['wechat_desktop', 'manual_note', 'ocr', 'home_sensor'],
      precisionLevel: 'routing'
    }),
    patternDefinition('modality', {
      labelZh: '信号模态',
      allowedValues: ['text', 'ocr', 'sensor'],
      precisionLevel: 'routing'
    }),
    patternDefinition('domain', {
      labelZh: '目标域',
      allowedValues: [
        'sales_customer_progress',
        'romance_relationship_maintenance',
        'life',
        'physical_world'
      ],
      precisionLevel: 'routing'
    }),
    patternDefinition('scene', {
      labelZh: '场景',
      allowedValues: ['dm_chat', 'crm_or_wechat_thread', 'invoice_ocr', 'home_sensor', 'manual_note'],
      precisionLevel: 'routing'
    }),
    patternDefinition('privacy', {
      labelZh: '隐私等级',
      allowedValues: ['private'],
      precisionLevel: 'routing'
    }),
    patternDefinition('person', {
      labelZh: '已确认人物引用',
      valueType: 'identity_ref',
      precisionLevel: 'projection',
      conflictPolicy: 'identity_projection_only'
    }),
    patternDefinition('source_identity', {
      labelZh: '来源身份引用',
      valueType: 'identity_ref',
      precisionLevel: 'projection',
      conflictPolicy: 'identity_projection_only'
    }),
    patternDefinition('mention', {
      labelZh: '原文提及引用',
      valueType: 'identity_ref',
      precisionLevel: 'projection'
    }),
    patternDefinition('system_subject', {
      labelZh: '系统主体引用',
      valueType: 'identity_ref',
      precisionLevel: 'projection'
    }),
    patternDefinition('event_family', {
      labelZh: '事件族',
      allowedValues: [
        'budget_status',
        'technical_review',
        'relationship_boundary',
        'financial_document_conflict',
        'external_action_boundary',
        'family_event',
        'object_location',
        'water_leak',
        'communication_preference'
      ]
    }),
    patternDefinition('event', {
      labelZh: '具体事件类型',
      allowedValues: [
        'budget_confirmation_pending',
        'technical_review_window',
        'relationship_space_request',
        'not_breakup_but_avoid_pressure',
        'invoice_amount_mismatch',
        'warehouse_notification_blocked',
        'birthday_dinner',
        'object_observed_at_location',
        'water_leak_detected',
        'avoid_repeated_prompting'
      ]
    }),
    patternDefinition('intent', {
      labelZh: '表达意图',
      allowedValues: ['inform', 'deny', 'prohibit_action', 'reminder', 'prefer'],
      precisionLevel: 'semantic_signature'
    }),
    patternDefinition('actor_role', {
      labelZh: '行动者角色',
      allowedValues: [
        'customer_contact',
        'customer_technical',
        'romantic_target',
        'system',
        'customer',
        'family_member',
        'user',
        'sensor'
      ],
      precisionLevel: 'semantic_signature'
    }),
    patternDefinition('target_object', {
      labelZh: '目标对象',
      allowedValues: [
        'budget',
        'api_checklist',
        'relationship_space_boundary',
        'breakup',
        'invoice_amount',
        'warehouse_notification',
        'birthday_dinner',
        'jacket',
        'water_leak',
        'reply_prompting'
      ],
      valueType: 'object_ref'
    }),
    patternDefinition('object_type', {
      labelZh: '对象类型',
      allowedValues: [
        'budget_status',
        'relationship_boundary',
        'relationship_state_signal',
        'financial_document',
        'external_action',
        'physical_event',
        'communication_behavior'
      ],
      valueType: 'object_ref'
    }),
    patternDefinition('object.type', {
      labelZh: '物品类型',
      allowedValues: ['document', 'invoice', 'cake', 'jacket'],
      valueType: 'object_ref'
    }),
    patternDefinition('object.attribute', {
      labelZh: '物品属性',
      allowedValues: ['blue'],
      valueType: 'object_ref'
    }),
    patternDefinition('location', {
      labelZh: '地点',
      allowedValues: ['home', 'living_room_sofa_left', 'kitchen_floor'],
      valueType: 'location_ref'
    }),
    patternDefinition('time.relative', {
      labelZh: '相对时间',
      allowedValues: ['this_week', 'tomorrow_afternoon', 'tonight', 'recent', 'saturday_evening'],
      valueType: 'time_ref',
      precisionLevel: 'semantic_signature'
    }),
    patternDefinition('time.absolute', {
      labelZh: '绝对时间',
      valueType: 'time_ref',
      precisionLevel: 'semantic_signature'
    }),
    patternDefinition('time_bucket', {
      labelZh: '时间桶',
      allowedValues: ['today', 'this_week', 'recent', 'future'],
      valueType: 'time_ref',
      precisionLevel: 'routing'
    }),
    patternDefinition('state', {
      labelZh: '状态',
      allowedValues: ['pending'],
      valueType: 'state_ref',
      precisionLevel: 'state_boundary'
    }),
    patternDefinition('certainty', {
      labelZh: '确定性',
      allowedValues: ['observed'],
      precisionLevel: 'state_boundary'
    }),
    patternDefinition('confirmation', {
      labelZh: '确认状态',
      allowedValues: ['observed_candidate', 'requires_confirmation'],
      precisionLevel: 'state_boundary',
      conflictPolicy: 'requires_confirmation'
    }),
    patternDefinition('commitment', {
      labelZh: '承诺状态',
      allowedValues: ['conditional'],
      precisionLevel: 'state_boundary'
    }),
    patternDefinition('polarity', {
      labelZh: '极性',
      allowedValues: ['negative'],
      precisionLevel: 'semantic_signature'
    }),
    patternDefinition('permission', {
      labelZh: '许可状态',
      allowedValues: ['blocked'],
      precisionLevel: 'state_boundary',
      conflictPolicy: 'block_external_action'
    }),
    patternDefinition('condition', {
      labelZh: '条件',
      allowedValues: ['payment_confirmed_required'],
      precisionLevel: 'state_boundary'
    }),
    patternDefinition('external_action', {
      labelZh: '外部动作门',
      allowedValues: ['blocked'],
      precisionLevel: 'state_boundary',
      conflictPolicy: 'block_external_action'
    }),
    patternDefinition('risk', {
      labelZh: '风险',
      allowedValues: ['medium', 'high'],
      precisionLevel: 'state_boundary'
    }),
    patternDefinition('conflict', {
      labelZh: '冲突',
      allowedValues: ['invoice_amount_mismatch'],
      precisionLevel: 'state_boundary',
      conflictPolicy: 'allow_conflict_group'
    }),
    patternDefinition('physical.quantity_kind', {
      labelZh: '物理量类型',
      allowedValues: ['amount'],
      valueType: 'quantity_ref'
    }),
    patternDefinition('physical.unit', {
      labelZh: '物理单位',
      allowedValues: ['CNY'],
      valueType: 'quantity_ref'
    }),
    patternDefinition('physical.value_bucket', {
      labelZh: '物理值桶',
      allowedValues: ['mismatch'],
      valueType: 'quantity_ref'
    }),
    patternDefinition('physical.state', {
      labelZh: '物理状态',
      allowedValues: ['observed', 'detected'],
      valueType: 'state_ref'
    }),
    patternDefinition('emotion.category', {
      labelZh: '情绪类别',
      allowedValues: ['anxiety'],
      precisionLevel: 'semantic_signature'
    }),
    patternDefinition('emotion.valence', {
      labelZh: '情绪效价',
      allowedValues: ['negative'],
      precisionLevel: 'semantic_signature'
    }),
    patternDefinition('emotion.appraisal', {
      labelZh: '情绪评估',
      allowedValues: ['pressure'],
      precisionLevel: 'semantic_signature'
    }),
    patternDefinition('emotion.action_tendency', {
      labelZh: '情绪行动倾向',
      allowedValues: ['withdraw'],
      precisionLevel: 'semantic_signature'
    }),
    patternDefinition('relationship_signal', {
      labelZh: '关系信号',
      allowedValues: ['needs_space', 'boundary_warning'],
      precisionLevel: 'state_boundary',
      conflictPolicy: 'requires_confirmation'
    }),
    patternDefinition('boundary', {
      labelZh: '边界',
      allowedValues: ['need_space'],
      precisionLevel: 'state_boundary',
      conflictPolicy: 'requires_confirmation'
    }),
    patternDefinition('preference', {
      labelZh: '偏好',
      allowedValues: ['avoid_pressure'],
      precisionLevel: 'state_boundary'
    }),
    exactDefinition('retrieval:event', {
      labelZh: '事件可检索',
      precisionLevel: 'evidence_locator'
    }),
    exactDefinition('retrieval:evidence', {
      labelZh: '证据可检索',
      precisionLevel: 'evidence_locator'
    }),
    patternDefinition('evidence_ref', {
      labelZh: '证据引用',
      valueType: 'evidence_ref',
      precisionLevel: 'evidence_locator'
    }),
    patternDefinition('source_archive_ref', {
      labelZh: '源归档引用',
      valueType: 'source_ref',
      precisionLevel: 'evidence_locator'
    })
  ];
}

function buildTaggedEvent({
  eventId,
  title,
  rawText,
  evidenceSnippets,
  summary,
  sourceArchiveRef,
  occurredAt,
  structuredFacts = {},
  tags
}) {
  const evidenceId = `evidence_${eventId.replace(/^evt_/, '')}`;
  const fullTags = unique([
    ...tags,
    'privacy:private',
    'retrieval:event',
    'retrieval:evidence',
    `evidence_ref:${evidenceId}`,
    `source_archive_ref:${sourceArchiveRef}`
  ]);
  return {
    schema_version: 'tagged_event_test_case.v1',
    event_id: eventId,
    title,
    raw_text: rawText,
    evidence_snippets: evidenceSnippets,
    source_archive_ref: sourceArchiveRef,
    occurred_at: occurredAt,
    summary,
    structured_facts: structuredFacts,
    tags: fullTags,
    tag_assignments: fullTags.map((tagValue, index) => ({
      schema_version: 'tag_assignment.v1',
      assignment_id: `tag_asg_${eventId}_${String(index + 1).padStart(2, '0')}_${stableSlug(tagValue).slice(0, 36)}`,
      tag_value: tagValue,
      subject_type: 'TaggedEvent',
      subject_ref: eventId,
      assigned_by: tagValue.startsWith('source:')
        || tagValue.startsWith('modality:')
        || tagValue.startsWith('source_archive_ref:')
        ? 'sensor'
        : 'rule',
      assigned_at: DEFAULT_CREATED_AT,
      evidence_refs: [evidenceId, sourceArchiveRef],
      confidence: tagValue.includes('requires_confirmation') ? 0.74 : 0.9,
      status: 'active',
      review_state: tagValue.includes('requires_confirmation') ? 'needs_review' : 'accepted',
      created_from: 'tag_registry_runtime_ten_event_validation.v1'
    }))
  };
}

export function buildTenEventTagScenario() {
  const events = [
    buildTaggedEvent({
      eventId: 'evt_001_sales_budget_pending',
      title: '销售预算待确认',
      rawText: '张总：预算这周还在内部确认。',
      evidenceSnippets: ['预算这周还在内部确认'],
      summary: '张总表达预算本周仍在内部确认，不能视为已确认。',
      sourceArchiveRef: 'source_archive_evt_001_sales_budget_pending',
      occurredAt: '2026-07-04T09:00:00+08:00',
      structuredFacts: {
        person_refs: ['person:zhang_001'],
        budget_state: 'pending_internal_confirmation'
      },
      tags: [
        'source:wechat_desktop',
        'modality:text',
        'domain:sales_customer_progress',
        'scene:crm_or_wechat_thread',
        'person:zhang_001',
        'source_identity:wechat_zhang_hint_001',
        'event_family:budget_status',
        'event:budget_confirmation_pending',
        'intent:inform',
        'actor_role:customer_contact',
        'target_object:budget',
        'object_type:budget_status',
        'time.relative:this_week',
        'time_bucket:this_week',
        'state:pending',
        'certainty:observed',
        'confirmation:observed_candidate'
      ]
    }),
    buildTaggedEvent({
      eventId: 'evt_002_technical_review_window',
      title: '技术评审时间',
      rawText: '技术负责人明天下午有空，可以先看接口清单。',
      evidenceSnippets: ['明天下午有空', '接口清单'],
      summary: '技术负责人明天下午可先看接口清单，属于条件性评审窗口。',
      sourceArchiveRef: 'source_archive_evt_002_technical_review_window',
      occurredAt: '2026-07-04T09:05:00+08:00',
      structuredFacts: {
        person_refs: ['person:zhang_001'],
        review_window: 'tomorrow_afternoon',
        document: 'api_checklist'
      },
      tags: [
        'source:wechat_desktop',
        'modality:text',
        'domain:sales_customer_progress',
        'scene:crm_or_wechat_thread',
        'person:zhang_001',
        'event_family:technical_review',
        'event:technical_review_window',
        'intent:inform',
        'actor_role:customer_technical',
        'target_object:api_checklist',
        'object.type:document',
        'time.relative:tomorrow_afternoon',
        'time_bucket:future',
        'commitment:conditional',
        'state:pending',
        'confirmation:observed_candidate'
      ]
    }),
    buildTaggedEvent({
      eventId: 'evt_003_relationship_space_request',
      title: '恋爱关系需要空间',
      rawText: '我今晚需要一点空间，我有点被压住了。',
      evidenceSnippets: ['今晚需要一点空间', '被压住了'],
      summary: '对方表达今晚需要空间并感到压力，只能作为边界信号候选。',
      sourceArchiveRef: 'source_archive_evt_003_relationship_space_request',
      occurredAt: '2026-07-04T21:00:00+08:00',
      structuredFacts: {
        source_identity_refs: ['source_identity:romantic_target_hint_001'],
        relationship_state_write_allowed: false
      },
      tags: [
        'source:manual_note',
        'modality:text',
        'domain:romance_relationship_maintenance',
        'scene:dm_chat',
        'source_identity:romantic_target_hint_001',
        'event_family:relationship_boundary',
        'event:relationship_space_request',
        'intent:inform',
        'actor_role:romantic_target',
        'target_object:relationship_space_boundary',
        'object_type:relationship_boundary',
        'time.relative:tonight',
        'time_bucket:today',
        'relationship_signal:needs_space',
        'emotion.category:anxiety',
        'emotion.valence:negative',
        'emotion.appraisal:pressure',
        'emotion.action_tendency:withdraw',
        'boundary:need_space',
        'confirmation:requires_confirmation',
        'risk:medium'
      ]
    }),
    buildTaggedEvent({
      eventId: 'evt_004_not_breakup_statement',
      title: '不等于分手声明',
      rawText: '我不是要分手，只是现在不想被追问。',
      evidenceSnippets: ['不是要分手', '不想被追问'],
      summary: '对方明确否定分手，同时表达不想被追问。',
      sourceArchiveRef: 'source_archive_evt_004_not_breakup_statement',
      occurredAt: '2026-07-04T21:02:00+08:00',
      structuredFacts: {
        denied_state: 'breakup',
        relationship_state_write_allowed: false
      },
      tags: [
        'source:manual_note',
        'modality:text',
        'domain:romance_relationship_maintenance',
        'scene:dm_chat',
        'source_identity:romantic_target_hint_001',
        'event_family:relationship_boundary',
        'event:not_breakup_but_avoid_pressure',
        'intent:deny',
        'actor_role:romantic_target',
        'target_object:breakup',
        'object_type:relationship_state_signal',
        'time.relative:recent',
        'time_bucket:recent',
        'polarity:negative',
        'preference:avoid_pressure',
        'relationship_signal:boundary_warning',
        'certainty:observed',
        'confirmation:requires_confirmation'
      ]
    }),
    buildTaggedEvent({
      eventId: 'evt_005_invoice_amount_mismatch',
      title: '发票金额冲突',
      rawText: 'OCR 显示 invoice_total=12800 CNY，但 PO 显示 po_total=11800 CNY。',
      evidenceSnippets: ['invoice_total=12800 CNY', 'po_total=11800 CNY'],
      summary: 'OCR 发票金额与 PO 金额不一致，需要复核金额冲突。',
      sourceArchiveRef: 'source_archive_evt_005_invoice_amount_mismatch',
      occurredAt: '2026-07-04T14:00:00+08:00',
      structuredFacts: {
        invoice_total: 12800,
        po_total: 11800,
        unit: 'CNY',
        quantity_kind: 'amount'
      },
      tags: [
        'source:ocr',
        'modality:ocr',
        'domain:sales_customer_progress',
        'scene:invoice_ocr',
        'system_subject:ocr_engine',
        'event_family:financial_document_conflict',
        'event:invoice_amount_mismatch',
        'intent:inform',
        'actor_role:system',
        'target_object:invoice_amount',
        'object.type:invoice',
        'object_type:financial_document',
        'time_bucket:today',
        'physical.quantity_kind:amount',
        'physical.unit:CNY',
        'physical.value_bucket:mismatch',
        'conflict:invoice_amount_mismatch',
        'confirmation:requires_confirmation',
        'risk:high'
      ]
    }),
    buildTaggedEvent({
      eventId: 'evt_006_warehouse_notification_blocked',
      title: '仓库发货禁止',
      rawText: '不要通知仓库发货，等我确认付款后再说。',
      evidenceSnippets: ['不要通知仓库发货', '确认付款后'],
      summary: '对方禁止通知仓库发货，需等付款确认后再处理。',
      sourceArchiveRef: 'source_archive_evt_006_warehouse_notification_blocked',
      occurredAt: '2026-07-04T14:10:00+08:00',
      structuredFacts: {
        external_action_allowed: false,
        blocked_action: 'warehouse_notification',
        release_condition: 'payment_confirmed'
      },
      tags: [
        'source:wechat_desktop',
        'modality:text',
        'domain:sales_customer_progress',
        'scene:crm_or_wechat_thread',
        'person:zhang_001',
        'event_family:external_action_boundary',
        'event:warehouse_notification_blocked',
        'intent:prohibit_action',
        'actor_role:customer',
        'target_object:warehouse_notification',
        'object_type:external_action',
        'time_bucket:today',
        'permission:blocked',
        'condition:payment_confirmed_required',
        'external_action:blocked',
        'confirmation:observed_candidate',
        'risk:high'
      ]
    }),
    buildTaggedEvent({
      eventId: 'evt_007_family_birthday_dinner',
      title: '家庭生日晚餐',
      rawText: '妈妈周六晚上在家过生日，记得买蛋糕。',
      evidenceSnippets: ['妈妈周六晚上', '买蛋糕'],
      summary: '妈妈周六晚上在家过生日，需要记得买蛋糕。',
      sourceArchiveRef: 'source_archive_evt_007_family_birthday_dinner',
      occurredAt: '2026-07-04T18:00:00+08:00',
      structuredFacts: {
        person_refs: ['person:mother_001'],
        reminder_object: 'cake'
      },
      tags: [
        'source:manual_note',
        'modality:text',
        'domain:life',
        'scene:manual_note',
        'person:mother_001',
        'event_family:family_event',
        'event:birthday_dinner',
        'intent:reminder',
        'actor_role:family_member',
        'target_object:birthday_dinner',
        'object.type:cake',
        'location:home',
        'time.relative:saturday_evening',
        'time_bucket:future',
        'state:pending',
        'confirmation:observed_candidate'
      ]
    }),
    buildTaggedEvent({
      eventId: 'evt_008_blue_jacket_on_sofa',
      title: '蓝色外套在沙发上',
      rawText: '蓝色外套放在客厅沙发左侧。',
      evidenceSnippets: ['蓝色外套', '沙发左侧'],
      summary: '蓝色外套位于客厅沙发左侧。',
      sourceArchiveRef: 'source_archive_evt_008_blue_jacket_on_sofa',
      occurredAt: '2026-07-04T18:05:00+08:00',
      structuredFacts: {
        object: 'jacket',
        color: 'blue',
        location: 'living_room_sofa_left'
      },
      tags: [
        'source:manual_note',
        'modality:text',
        'domain:physical_world',
        'scene:manual_note',
        'person:user_self',
        'actor_role:user',
        'event_family:object_location',
        'event:object_observed_at_location',
        'intent:inform',
        'target_object:jacket',
        'object.type:jacket',
        'object.attribute:blue',
        'location:living_room_sofa_left',
        'time_bucket:today',
        'physical.state:observed',
        'confirmation:observed_candidate'
      ]
    }),
    buildTaggedEvent({
      eventId: 'evt_009_water_leak_detected',
      title: '室内漏水传感器',
      rawText: '厨房地面传感器 14:05 检测到漏水。',
      evidenceSnippets: ['厨房地面传感器', '检测到漏水'],
      summary: '厨房地面传感器在 14:05 检测到漏水，高风险但外部动作仍需动作门。',
      sourceArchiveRef: 'source_archive_evt_009_water_leak_detected',
      occurredAt: '2026-07-04T14:05:00+08:00',
      structuredFacts: {
        sensor_id: 'home_sensor_floor_001',
        detected_at: '2026-07-04T14:05:00+08:00',
        risk: 'high'
      },
      tags: [
        'source:home_sensor',
        'modality:sensor',
        'domain:physical_world',
        'scene:home_sensor',
        'system_subject:home_sensor_floor_001',
        'event_family:water_leak',
        'event:water_leak_detected',
        'intent:inform',
        'actor_role:sensor',
        'target_object:water_leak',
        'object_type:physical_event',
        'location:kitchen_floor',
        'time.absolute:2026-07-04T14:05:00+08:00',
        'time_bucket:today',
        'physical.state:detected',
        'confirmation:observed_candidate',
        'risk:high'
      ]
    }),
    buildTaggedEvent({
      eventId: 'evt_010_avoid_repeated_prompting',
      title: '用户偏好不想被催',
      rawText: '她说最近不要一直催她回复，压力会变大。',
      evidenceSnippets: ['不要一直催她回复', '压力会变大'],
      summary: '对方表达近期不要持续催回复，否则压力会增加。',
      sourceArchiveRef: 'source_archive_evt_010_avoid_repeated_prompting',
      occurredAt: '2026-07-04T21:05:00+08:00',
      structuredFacts: {
        source_identity_refs: ['source_identity:romantic_target_hint_001'],
        communication_preference: 'avoid_repeated_prompting'
      },
      tags: [
        'source:manual_note',
        'modality:text',
        'domain:romance_relationship_maintenance',
        'scene:dm_chat',
        'source_identity:romantic_target_hint_001',
        'event_family:communication_preference',
        'event:avoid_repeated_prompting',
        'intent:prefer',
        'actor_role:romantic_target',
        'target_object:reply_prompting',
        'object_type:communication_behavior',
        'time.relative:recent',
        'time_bucket:recent',
        'preference:avoid_pressure',
        'emotion.appraisal:pressure',
        'emotion.valence:negative',
        'relationship_signal:boundary_warning',
        'confirmation:requires_confirmation',
        'risk:medium'
      ]
    })
  ];

  return {
    schema_version: 'tag_registry_ten_event_scenario.v1',
    scenario_id: 'tag_registry_ten_events_20260704',
    created_at: DEFAULT_CREATED_AT,
    objective: 'validate compact tags can retrieve, classify, assemble context and read back original evidence for ten representative event types',
    events
  };
}

function matchTagDefinition(tagValue, registry) {
  const exact = registry.find((definition) => definition.tag_value === tagValue);
  if (exact) return { matched: true, definition: exact, reason: 'exact' };

  const pattern = registry.find((definition) => {
    if (!definition.tag_pattern?.endsWith('*')) return false;
    const prefix = definition.tag_pattern.slice(0, -1);
    if (!String(tagValue).startsWith(prefix)) return false;
    if (!definition.allowed_values) return true;
    return definition.allowed_values.includes(tagSuffix(tagValue));
  });
  if (pattern) return { matched: true, definition: pattern, reason: 'pattern' };

  const loosePattern = registry.find((definition) => {
    if (!definition.tag_pattern?.endsWith('*')) return false;
    const prefix = definition.tag_pattern.slice(0, -1);
    return String(tagValue).startsWith(prefix);
  });
  if (loosePattern) {
    return {
      matched: false,
      definition: loosePattern,
      reason: `value_not_allowed:${tagSuffix(tagValue)}`
    };
  }
  return { matched: false, definition: null, reason: 'missing_definition' };
}

function checkBucketCoverage(event) {
  const dimensions = new Set(event.tags.map(tagDimension));
  const buckets = REQUIRED_BUCKETS.map((bucket) => {
    const present_dimensions = bucket.dimensions.filter((dimension) => dimensions.has(dimension));
    return {
      bucket: bucket.bucket,
      required_any_of: bucket.dimensions,
      present_dimensions,
      status: present_dimensions.length > 0 ? 'pass' : 'fail'
    };
  });
  return {
    status: buckets.every((bucket) => bucket.status === 'pass') ? 'pass' : 'fail',
    buckets
  };
}

function checkEvidence(event) {
  const rawLength = [...event.raw_text].length;
  const snippetLength = event.evidence_snippets.reduce((sum, snippet) => sum + [...snippet].length, 0);
  const compressionRatio = Number((snippetLength / Math.max(rawLength, 1)).toFixed(3));
  const snippetsInRaw = event.evidence_snippets.every((snippet) => event.raw_text.includes(snippet));
  const snippetsConcise = event.evidence_snippets.every((snippet) => [...snippet].length <= EVIDENCE_SNIPPET_MAX_CHARS);
  const passed = snippetsInRaw && snippetsConcise && compressionRatio <= EVIDENCE_COMPRESSION_MAX_RATIO;
  return {
    status: passed ? 'pass' : 'fail',
    snippets_in_raw: snippetsInRaw,
    snippets_concise: snippetsConcise,
    snippet_length: snippetLength,
    raw_length: rawLength,
    compression_ratio: compressionRatio,
    max_snippet_chars: EVIDENCE_SNIPPET_MAX_CHARS,
    max_compression_ratio: EVIDENCE_COMPRESSION_MAX_RATIO
  };
}

function reconstructSignatureFromTags(event) {
  const tags = event.tags;
  return {
    domains: tagsByDimension(tags, 'domain'),
    source: getTag(tags, 'source'),
    modalities: tagsByDimension(tags, 'modality'),
    event_family: getTag(tags, 'event_family'),
    event: getTag(tags, 'event'),
    intent: getTag(tags, 'intent'),
    subjects: [
      ...tagsByDimension(tags, 'person'),
      ...tagsByDimension(tags, 'source_identity'),
      ...tagsByDimension(tags, 'mention'),
      ...tagsByDimension(tags, 'system_subject')
    ],
    actor_role: getTag(tags, 'actor_role'),
    objects: [
      ...tagsByDimension(tags, 'target_object'),
      ...tagsByDimension(tags, 'object.type'),
      ...tagsByDimension(tags, 'object_type'),
      ...tagsByDimension(tags, 'location')
    ],
    times: [
      ...tagsByDimension(tags, 'time.relative'),
      ...tagsByDimension(tags, 'time.absolute'),
      ...tagsByDimension(tags, 'time_bucket')
    ],
    evidence_refs: tagsByDimension(tags, 'evidence_ref'),
    source_archive_refs: tagsByDimension(tags, 'source_archive_ref'),
    boundary_markers: tags.filter((tag) => [
      'boundary',
      'certainty',
      'confirmation',
      'conflict',
      'external_action',
      'permission',
      'polarity',
      'preference',
      'relationship_signal',
      'risk',
      'state'
    ].includes(tagDimension(tag)))
  };
}

function checkSignatureRoundtrip(event) {
  const reconstructed = reconstructSignatureFromTags(event);
  const expected = {
    event_family: getTag(event.tags, 'event_family'),
    event: getTag(event.tags, 'event'),
    evidence_ref_count: tagsByDimension(event.tags, 'evidence_ref').length,
    source_archive_ref_count: tagsByDimension(event.tags, 'source_archive_ref').length
  };
  const failures = [
    reconstructed.event_family !== expected.event_family ? 'event_family' : null,
    reconstructed.event !== expected.event ? 'event' : null,
    reconstructed.subjects.length === 0 ? 'subject' : null,
    reconstructed.objects.length === 0 ? 'object_or_place' : null,
    reconstructed.times.length === 0 ? 'time' : null,
    reconstructed.evidence_refs.length !== expected.evidence_ref_count ? 'evidence_ref' : null,
    reconstructed.source_archive_refs.length !== expected.source_archive_ref_count ? 'source_archive_ref' : null,
    reconstructed.boundary_markers.length === 0 ? 'boundary_or_state' : null
  ].filter(Boolean);
  return {
    status: failures.length ? 'fail' : 'pass',
    failures,
    reconstructed_signature: reconstructed
  };
}

function checkTagBudget(event) {
  const tooLong = event.tags.filter((tag) => [...tag].length > MAX_TAG_VALUE_CHARS || /\s/.test(tag));
  return {
    status: event.tags.length <= MAX_TAGS_PER_EVENT && tooLong.length === 0 ? 'pass' : 'fail',
    tag_count: event.tags.length,
    max_tags: MAX_TAGS_PER_EVENT,
    max_tag_value_chars: MAX_TAG_VALUE_CHARS,
    too_long_or_sentence_like_tags: tooLong
  };
}

function checkSpecialRules(event) {
  const failures = [];
  const tags = event.tags;
  if (tags.some((tag) => tag.startsWith('person:') && /@|\d{6,}/.test(tagSuffix(tag)))) {
    failures.push('person_tag_contains_raw_sensitive_identity');
  }
  if (tags.some((tag) => tag.startsWith('physical.quantity_kind:')) && !tags.some((tag) => tag.startsWith('physical.unit:'))) {
    failures.push('physical_quantity_missing_unit');
  }
  if (tags.some((tag) => tag.startsWith('emotion.')) && !tags.some((tag) => tag.startsWith('emotion.valence:'))) {
    failures.push('emotion_missing_valence');
  }
  if (tags.includes('event_family:external_action_boundary') && !tags.includes('external_action:blocked')) {
    failures.push('external_action_boundary_without_blocked_gate');
  }
  if (tags.includes('event:relationship_space_request') && !tags.includes('confirmation:requires_confirmation')) {
    failures.push('relationship_signal_without_confirmation_gate');
  }
  return {
    status: failures.length ? 'fail' : 'pass',
    failures
  };
}

function buildEventReport(event, registry) {
  const assignmentMatches = event.tag_assignments.map((assignment) => ({
    assignment_id: assignment.assignment_id,
    tag_value: assignment.tag_value,
    ...matchTagDefinition(assignment.tag_value, registry)
  }));
  const registryMisses = assignmentMatches
    .filter((item) => !item.matched)
    .map((item) => ({ tag_value: item.tag_value, reason: item.reason }));
  const bucketCoverage = checkBucketCoverage(event);
  const evidence = checkEvidence(event);
  const roundtrip = checkSignatureRoundtrip(event);
  const tagBudget = checkTagBudget(event);
  const specialRules = checkSpecialRules(event);
  const status = registryMisses.length === 0
    && bucketCoverage.status === 'pass'
    && evidence.status === 'pass'
    && roundtrip.status === 'pass'
    && tagBudget.status === 'pass'
    && specialRules.status === 'pass'
    ? 'pass'
    : 'fail';
  return {
    event_id: event.event_id,
    title: event.title,
    status,
    registry: {
      status: registryMisses.length ? 'fail' : 'pass',
      assignment_count: event.tag_assignments.length,
      miss_count: registryMisses.length,
      misses: registryMisses
    },
    bucket_coverage: bucketCoverage,
    evidence,
    tag_signature_roundtrip: roundtrip,
    tag_budget: tagBudget,
    special_rules: specialRules
  };
}

export function queryEventsByTag(events, tag) {
  return events.filter((event) => event.tags.includes(tag));
}

export function queryEventsByAnyTags(events, tags) {
  return events.filter((event) => tags.some((tag) => event.tags.includes(tag)));
}

export function queryEventsByAllTags(events, tags) {
  return events.filter((event) => tags.every((tag) => event.tags.includes(tag)));
}

function runQueryTest(testCase, events) {
  const matchedEvents = testCase.mode === 'all_tags'
    ? queryEventsByAllTags(events, testCase.tags)
    : testCase.mode === 'any_tags'
      ? queryEventsByAnyTags(events, testCase.tags)
      : queryEventsByTag(events, testCase.tags[0]);
  const matchedEventIds = matchedEvents.map((event) => event.event_id).sort();
  const expected = [...testCase.expected_event_ids].sort();
  const missing = expected.filter((eventId) => !matchedEventIds.includes(eventId));
  const unexpected = matchedEventIds.filter((eventId) => !expected.includes(eventId));
  return {
    ...testCase,
    matched_event_ids: matchedEventIds,
    missing_event_ids: missing,
    unexpected_event_ids: unexpected,
    status: missing.length === 0 && unexpected.length === 0 ? 'pass' : 'fail'
  };
}

export function buildContextSnapshot({
  snapshotId,
  question,
  requiredTags = [],
  anyTags = [],
  events
}) {
  const requiredMatches = requiredTags.length ? queryEventsByAllTags(events, requiredTags) : events;
  const matchedEvents = anyTags.length ? queryEventsByAnyTags(requiredMatches, anyTags) : requiredMatches;
  return {
    schema_version: 'context_snapshot.v1',
    snapshot_id: snapshotId,
    question,
    retrieval_plan: {
      required_tags: requiredTags,
      any_tags: anyTags,
      retrieval_mode: 'required_tags_then_any_tags'
    },
    matched_event_ids: matchedEvents.map((event) => event.event_id),
    evidence_refs: unique(matchedEvents.flatMap((event) => tagsByDimension(event.tags, 'evidence_ref'))),
    source_archive_refs: unique(matchedEvents.flatMap((event) => tagsByDimension(event.tags, 'source_archive_ref'))),
    compact_summary: matchedEvents.map((event) => `${event.title}: ${event.summary}`).join('\n'),
    original_readback: matchedEvents.map((event) => ({
      event_id: event.event_id,
      source_archive_ref: event.source_archive_ref,
      raw_text: event.raw_text,
      evidence_snippets: event.evidence_snippets
    })),
    boundary_notes: unique(matchedEvents.flatMap((event) => [
      event.tags.includes('confirmation:requires_confirmation') ? 'contains_confirmation_required_event' : null,
      event.tags.includes('external_action:blocked') ? 'contains_blocked_external_action' : null,
      event.tags.some((tag) => tag.startsWith('source_identity:')) ? 'contains_unconfirmed_source_identity_projection' : null
    ]))
  };
}

function runContextTest(testCase, events) {
  const snapshot = buildContextSnapshot({
    snapshotId: testCase.snapshot_id,
    question: testCase.question,
    requiredTags: testCase.required_tags,
    anyTags: testCase.any_tags,
    events
  });
  const matched = [...snapshot.matched_event_ids].sort();
  const expected = [...testCase.expected_event_ids].sort();
  const missing = expected.filter((eventId) => !matched.includes(eventId));
  const unexpected = matched.filter((eventId) => !expected.includes(eventId));
  const allRawReadbackPresent = snapshot.original_readback.length === snapshot.matched_event_ids.length
    && snapshot.original_readback.every((item) =>
      item.raw_text
      && item.evidence_snippets.length > 0
      && item.evidence_snippets.every((snippet) => item.raw_text.includes(snippet))
    );
  return {
    query_id: testCase.snapshot_id,
    question: testCase.question,
    expected_event_ids: expected,
    matched_event_ids: matched,
    missing_event_ids: missing,
    unexpected_event_ids: unexpected,
    raw_readback_status: allRawReadbackPresent ? 'pass' : 'fail',
    snapshot,
    status: missing.length === 0 && unexpected.length === 0 && allRawReadbackPresent ? 'pass' : 'fail'
  };
}

function makeCheck(checkId, passed, evidence = []) {
  return {
    check_id: checkId,
    status: passed ? 'pass' : 'fail',
    passed,
    evidence
  };
}

function registryShapeChecks(registry) {
  const keys = registry.map((definition) => definition.tag_value ?? definition.tag_pattern);
  const duplicateKeys = keys.filter((key, index) => keys.indexOf(key) !== index);
  const missingCoreFields = registry.filter((definition) =>
    definition.schema_version !== 'tag_definition.v1'
    || !definition.tag_id
    || !definition.namespace
    || !definition.dimension
    || !definition.label_zh
    || !definition.value_type
    || !definition.precision_level
    || !definition.conflict_policy
  ).map((definition) => definition.tag_id ?? definition.tag_value ?? definition.tag_pattern);
  return [
    makeCheck('registry_has_no_duplicate_definitions', duplicateKeys.length === 0, duplicateKeys),
    makeCheck('registry_definitions_have_required_fields', missingCoreFields.length === 0, missingCoreFields)
  ];
}

export function validateTagRegistryScenario({
  registry = buildTagRegistrySeed(),
  scenario = buildTenEventTagScenario()
} = {}) {
  const events = scenario.events;
  const eventReports = events.map((event) => buildEventReport(event, registry));
  const queryTests = QUERY_TESTS.map((testCase) => runQueryTest(testCase, events));
  const contextTests = CONTEXT_TESTS.map((testCase) => runContextTest(testCase, events));
  const registryChecks = registryShapeChecks(registry);
  const assignmentCount = events.reduce((sum, event) => sum + event.tag_assignments.length, 0);
  const allFailures = [
    ...registryChecks.filter((check) => !check.passed).map((check) => check.check_id),
    ...eventReports.filter((event) => event.status !== 'pass').map((event) => `event:${event.event_id}`),
    ...queryTests.filter((test) => test.status !== 'pass').map((test) => `query:${test.query_id}`),
    ...contextTests.filter((test) => test.status !== 'pass').map((test) => `context:${test.query_id}`)
  ];
  const registryMissCount = eventReports.reduce((sum, event) => sum + event.registry.miss_count, 0);
  const evidenceFailures = eventReports.filter((event) => event.evidence.status !== 'pass').length;
  const bucketFailures = eventReports.filter((event) => event.bucket_coverage.status !== 'pass').length;
  const roundtripFailures = eventReports.filter((event) => event.tag_signature_roundtrip.status !== 'pass').length;
  return {
    schema_version: 'tag_registry_validation.v1',
    validation_id: DEFAULT_RUN_ID,
    created_at: DEFAULT_CREATED_AT,
    objective: scenario.objective,
    gate_decision: allFailures.length ? 'tag_registry_validation_failed' : 'tag_registry_validation_passed',
    boundary: {
      relationship_state_writes: 0,
      identity_merges_applied: 0,
      external_actions_executed: 0,
      source_full_data_preserved: true,
      summaries_replace_original_text: false
    },
    metrics: {
      tag_definition_count: registry.length,
      event_count: events.length,
      tag_assignment_count: assignmentCount,
      registry_miss_count: registryMissCount,
      required_bucket_failures: bucketFailures,
      evidence_failures: evidenceFailures,
      tag_signature_roundtrip_failures: roundtripFailures,
      query_failures: queryTests.filter((test) => test.status !== 'pass').length,
      context_failures: contextTests.filter((test) => test.status !== 'pass').length,
      max_tag_count: Math.max(...eventReports.map((event) => event.tag_budget.tag_count)),
      avg_tag_count: Number((eventReports.reduce((sum, event) => sum + event.tag_budget.tag_count, 0) / events.length).toFixed(2)),
      avg_evidence_compression_ratio: Number((eventReports.reduce((sum, event) => sum + event.evidence.compression_ratio, 0) / events.length).toFixed(3))
    },
    registry_checks: registryChecks,
    event_reports: eventReports,
    query_tests: queryTests,
    context_tests: contextTests,
    required_failures: allFailures,
    continue_when: [
      'gate_decision=tag_registry_validation_passed',
      'registry_miss_count=0',
      'required_bucket_failures=0',
      'evidence_failures=0',
      'query_failures=0',
      'context_failures=0'
    ],
    stop_or_adjust_when: [
      'any tag misses TagDefinition registry',
      'any event loses evidence_ref or source_archive_ref readback',
      'any evidence snippet is not an original substring',
      'any tag becomes a long sentence or full summary',
      'any relationship state, identity merge, or external action is applied by this layer'
    ]
  };
}

export function renderTagRegistryValidationMarkdown(report) {
  const eventRows = report.event_reports
    .map((event) => `| ${event.event_id} | ${event.title} | ${event.status} | ${event.registry.miss_count} | ${event.evidence.compression_ratio} | ${event.tag_budget.tag_count} |`)
    .join('\n');
  const queryRows = report.query_tests
    .map((query) => `| ${query.query_id} | ${query.status} | ${query.tags.join(', ')} | ${query.matched_event_ids.join(', ')} |`)
    .join('\n');
  const contextRows = report.context_tests
    .map((query) => `| ${query.query_id} | ${query.status} | ${query.matched_event_ids.join(', ')} | ${query.raw_readback_status} |`)
    .join('\n');
  return `# Tag Registry Validation

- validation_id: ${report.validation_id}
- created_at: ${report.created_at}
- gate_decision: ${report.gate_decision}
- required_failures: ${report.required_failures.join(', ') || 'none'}
- relationship_state_writes: ${report.boundary.relationship_state_writes}
- identity_merges_applied: ${report.boundary.identity_merges_applied}
- external_actions_executed: ${report.boundary.external_actions_executed}

## Metrics

- tag_definition_count: ${report.metrics.tag_definition_count}
- event_count: ${report.metrics.event_count}
- tag_assignment_count: ${report.metrics.tag_assignment_count}
- registry_miss_count: ${report.metrics.registry_miss_count}
- required_bucket_failures: ${report.metrics.required_bucket_failures}
- evidence_failures: ${report.metrics.evidence_failures}
- tag_signature_roundtrip_failures: ${report.metrics.tag_signature_roundtrip_failures}
- query_failures: ${report.metrics.query_failures}
- context_failures: ${report.metrics.context_failures}
- max_tag_count: ${report.metrics.max_tag_count}
- avg_tag_count: ${report.metrics.avg_tag_count}
- avg_evidence_compression_ratio: ${report.metrics.avg_evidence_compression_ratio}

## Event Results

| Event | Title | Status | Registry Misses | Evidence Compression | Tag Count |
| --- | --- | --- | ---: | ---: | ---: |
${eventRows}

## Query Results

| Query | Status | Tags | Matched Events |
| --- | --- | --- | --- |
${queryRows}

## Context Results

| Context | Status | Matched Events | Raw Readback |
| --- | --- | --- | --- |
${contextRows}

## Stop Or Adjust

${report.stop_or_adjust_when.map((item) => `- ${item}`).join('\n')}
`;
}

export function runTagRegistryValidation({
  root = projectRoot(),
  runId = DEFAULT_RUN_ID,
  outputDir = path.join(root, 'runtime', 'tag-registry-validation', runId)
} = {}) {
  const registry = buildTagRegistrySeed();
  const scenario = buildTenEventTagScenario();
  const report = validateTagRegistryScenario({ registry, scenario });
  const artifacts = {
    registry,
    scenario,
    report
  };
  const registryPath = path.join(outputDir, 'tag-registry.seed.json');
  const scenarioPath = path.join(outputDir, 'tag-registry-ten-events.sample.json');
  const reportPath = path.join(outputDir, 'tag-registry-validation.json');
  const markdownPath = path.join(outputDir, 'tag-registry-validation.md');
  writeJsonAtomic(registryPath, registry);
  writeJsonAtomic(scenarioPath, scenario);
  writeJsonAtomic(reportPath, report);
  writeText(markdownPath, renderTagRegistryValidationMarkdown(report));
  return {
    schema_version: 'tag_registry_validation_run_result.v1',
    run_id: runId,
    gate_decision: report.gate_decision,
    required_failures: report.required_failures,
    metrics: report.metrics,
    paths: {
      output_dir: rel(root, outputDir),
      registry_path: rel(root, registryPath),
      scenario_path: rel(root, scenarioPath),
      report_path: rel(root, reportPath),
      markdown_path: rel(root, markdownPath)
    },
    artifacts
  };
}
