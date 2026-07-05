import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  controlPlaneRoot,
  ensureDir,
  loadStages,
  nowIso,
  projectRoot,
  readStageSurface,
  stageDir,
  stageLabel,
  stageRuntimeFolder,
  stageSummary,
  summarizeControlPlane,
  writeJson,
  writeStageEvent,
  writeStageSurface
} from './cross-border-stage-control-lib.mjs'

function parseArgs(argv) {
  const args = {}
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue
    const [key, ...rest] = arg.slice(2).split('=')
    args[key] = rest.length ? rest.join('=') : 'true'
  }
  return args
}

function getStage(stageId) {
  const stage = loadStages().find((item) => item.node_id === stageId)
  if (!stage) {
    throw new Error(`Unknown cross-border stage: ${stageId}`)
  }
  return stage
}

function writeMarkdown(path, lines) {
  ensureDir(dirname(path))
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8')
}

function updateSurface(stage, patch, artifactRefs = []) {
  const current = readStageSurface(stage.node_id) || {}
  const next = {
    ...current,
    state: {
      ...(current.state || {}),
      ...(patch.state || {}),
      updated_at: nowIso()
    },
    view: {
      ...(current.view || {}),
      runtime_refs: [
        ...new Set([
          ...((current.view && current.view.runtime_refs) || []),
          ...artifactRefs
        ])
      ]
    },
    artifacts: {
      ...(current.artifacts || {}),
      ...(patch.artifacts || {})
    }
  }
  return writeStageSurface(stage, next)
}

function writeCurrentStatus() {
  const statusDir = join(controlPlaneRoot, 'status')
  ensureDir(statusDir)
  writeJson(join(statusDir, 'current-status.json'), summarizeControlPlane())
}

function inspectStage(stage) {
  const surface = updateSurface(stage, {
    state: {
      status: 'draft_ready',
      execution_mode: 'inspect_only',
      progress: 0.2,
      next_actions: ['validate_stage', 'generate_local_draft']
    }
  })
  const report = {
    contract: 'stage_inspection_report.v1',
    generated_at: nowIso(),
    project_id: 'cross_border_ecommerce_ai_route',
    stage_id: stage.node_id,
    stage_label: stageLabel(stage),
    summary: stageSummary(stage),
    layer: stage.layer,
    owner_role: stage.owner_role,
    source_docs: stage.source_docs || [],
    inputs: stage.inputs || [],
    outputs: stage.outputs || [],
    control_actions: stage.control_actions || [],
    required_human_gates: stage.required_human_gates || [],
    surface_path: `cross-border-ecommerce-ai-route/runtime/control-plane/stages/${stage.node_id}/stage-control-surface.json`,
    real_execution_allowed: false
  }
  const reportPath = join(stageDir(stage.node_id), 'latest-stage-report.json')
  const reportMdPath = join(stageDir(stage.node_id), 'latest-stage-report.md')
  writeJson(reportPath, report)
  writeMarkdown(reportMdPath, [
    `# ${stageLabel(stage)} 阶段查看报告`,
    '',
    `生成时间：${report.generated_at}`,
    '',
    stageSummary(stage),
    '',
    `负责人角色：${stage.owner_role || 'operator'}`,
    `阶段层级：${stage.layer || 'stage'}`,
    '',
    '## 输入',
    ...(report.inputs.length ? report.inputs.map((item) => `- ${item}`) : ['- 暂无输入定义。']),
    '',
    '## 输出',
    ...(report.outputs.length ? report.outputs.map((item) => `- ${item}`) : ['- 暂无输出定义。']),
    '',
    '## 门禁',
    ...(report.required_human_gates.length ? report.required_human_gates.map((item) => `- ${item}`) : ['- 暂无门禁定义。'])
  ])
  updateSurface(stage, {
    artifacts: {
      latest_report: `cross-border-ecommerce-ai-route/runtime/control-plane/stages/${stage.node_id}/latest-stage-report.json`
    }
  }, [
    `cross-border-ecommerce-ai-route/runtime/control-plane/stages/${stage.node_id}/latest-stage-report.json`,
    `cross-border-ecommerce-ai-route/runtime/control-plane/stages/${stage.node_id}/latest-stage-report.md`
  ])
  writeStageEvent(stage, 'inspect', 'completed', [
    `cross-border-ecommerce-ai-route/runtime/control-plane/stages/${stage.node_id}/latest-stage-report.json`
  ])
  return { surface, report }
}

function validateStage(stage) {
  const sourceDocs = stage.source_docs || []
  const missingDocs = sourceDocs.filter((doc) => !existsSync(join(projectRoot, doc)))
  const warnings = []
  if (!(stage.inputs || []).length) warnings.push('stage inputs are empty')
  if (!(stage.outputs || []).length) warnings.push('stage outputs are empty')
  if (!(stage.control_actions || []).length) warnings.push('stage control_actions are empty')
  if (!(stage.required_human_gates || []).length) warnings.push('stage required_human_gates are empty')

  const report = {
    contract: 'stage_validation_report.v1',
    generated_at: nowIso(),
    stage_id: stage.node_id,
    stage_label: stageLabel(stage),
    checked: {
      source_docs,
      inputs: stage.inputs || [],
      outputs: stage.outputs || [],
      control_actions: stage.control_actions || [],
      required_human_gates: stage.required_human_gates || []
    },
    errors: missingDocs.map((doc) => `missing source doc: ${doc}`),
    warnings,
    result: missingDocs.length ? 'fail' : 'pass',
    real_execution_allowed: false
  }
  const reportPath = join(stageDir(stage.node_id), 'validation-report.json')
  writeJson(reportPath, report)
  updateSurface(stage, {
    state: {
      status: report.result === 'pass' ? 'ready_for_local_execution' : 'blocked',
      execution_mode: 'validate_only',
      progress: report.result === 'pass' ? 0.32 : 0.18,
      blockers: report.result === 'pass'
        ? (stage.required_human_gates || []).map((gate) => `pending gate: ${gate}`)
        : report.errors,
      next_actions: report.result === 'pass' ? ['generate_local_draft', 'build_human_review_pack'] : ['inspect_stage']
    },
    artifacts: {
      latest_report: `cross-border-ecommerce-ai-route/runtime/control-plane/stages/${stage.node_id}/validation-report.json`
    }
  }, [`cross-border-ecommerce-ai-route/runtime/control-plane/stages/${stage.node_id}/validation-report.json`])
  writeStageEvent(stage, 'validate', report.result, [
    `cross-border-ecommerce-ai-route/runtime/control-plane/stages/${stage.node_id}/validation-report.json`
  ])
  return report
}

function generateLocalDraft(stage) {
  const folder = stageRuntimeFolder(stage)
  const draftDir = join(projectRoot, 'runtime', folder, 'drafts', stage.node_id)
  const draft = {
    contract: `${stage.node_id}.local_draft.v1`,
    generated_at: nowIso(),
    project_id: 'cross_border_ecommerce_ai_route',
    stage_id: stage.node_id,
    stage_label: stageLabel(stage),
    purpose: stageSummary(stage),
    required_inputs: (stage.inputs || []).map((input) => ({
      field: input,
      status: 'needs_user_or_source_data',
      note: 'This first implementation creates a standardized draft shell; real execution needs verified source data.'
    })),
    planned_outputs: (stage.outputs || []).map((output) => ({
      contract: output,
      status: 'draft_shell_ready'
    })),
    local_actions: stage.control_actions || [],
    human_gates: stage.required_human_gates || [],
    safety: {
      real_execution_allowed: false,
      blocked_external_actions: [
        'customer_message',
        'quotation_send',
        'payment_instruction',
        'ad_spend',
        'shipment_booking',
        'customs_tax_fx_filing'
      ]
    }
  }
  const draftPath = join(draftDir, 'stage-local-draft.json')
  const draftMdPath = join(draftDir, 'stage-local-draft.md')
  writeJson(draftPath, draft)
  writeMarkdown(draftMdPath, [
    `# ${stageLabel(stage)} 本地草案`,
    '',
    `生成时间：${draft.generated_at}`,
    '',
    stageSummary(stage),
    '',
    '## 需要补齐的输入',
    ...draft.required_inputs.map((item) => `- ${item.field}: ${item.status}`),
    '',
    '## 计划输出',
    ...draft.planned_outputs.map((item) => `- ${item.contract}: ${item.status}`),
    '',
    '## 安全边界',
    '- 真实外部动作未开启。',
    '- 所有客户、报价、付款、广告、物流、报关、税务、外汇动作必须人工确认。'
  ])
  const refs = [
    `cross-border-ecommerce-ai-route/runtime/${folder}/drafts/${stage.node_id}/stage-local-draft.json`,
    `cross-border-ecommerce-ai-route/runtime/${folder}/drafts/${stage.node_id}/stage-local-draft.md`
  ]
  updateSurface(stage, {
    state: {
      status: 'completed_draft',
      execution_mode: 'draft_local',
      progress: 0.55,
      blockers: (stage.required_human_gates || []).map((gate) => `pending gate: ${gate}`),
      next_actions: ['build_human_review_pack', 'prepare_controlled_execution']
    },
    artifacts: {
      latest_report: refs[0]
    }
  }, refs)
  writeStageEvent(stage, 'generate_draft', 'completed', refs)
  return draft
}

function buildReviewPack(stage) {
  const packDir = join(controlPlaneRoot, 'review-packs', stage.node_id)
  const pack = {
    contract: 'human_review_pack.v1',
    generated_at: nowIso(),
    project_id: 'cross_border_ecommerce_ai_route',
    stage_id: stage.node_id,
    stage_label: stageLabel(stage),
    review_required_for: stage.required_human_gates || [],
    decision_options: [
      { option_id: 'approve_local_draft_only', label: '仅批准本地草案继续完善', real_execution_allowed: false },
      { option_id: 'request_changes', label: '要求修改草案', real_execution_allowed: false },
      { option_id: 'prepare_controlled_execution_preflight', label: '准备受控执行预检', real_execution_allowed: false }
    ],
    evidence_to_check: stage.audit_evidence || [],
    source_refs: stage.source_docs || [],
    safety_notes: [
      'This pack does not authorize real external execution.',
      'Any real send, quote, ad, shipment, customs, tax or FX action needs a separate explicit confirmation.'
    ]
  }
  const packPath = join(packDir, 'human-review-pack.json')
  const packMdPath = join(packDir, 'human-review-pack.md')
  writeJson(packPath, pack)
  writeMarkdown(packMdPath, [
    `# ${stageLabel(stage)} 人工确认包`,
    '',
    `生成时间：${pack.generated_at}`,
    '',
    '## 需要确认的门禁',
    ...(pack.review_required_for.length ? pack.review_required_for.map((item) => `- ${item}`) : ['- 暂无门禁定义。']),
    '',
    '## 可选决策',
    ...pack.decision_options.map((item) => `- ${item.option_id}: ${item.label}`),
    '',
    '## 需检查证据',
    ...(pack.evidence_to_check.length ? pack.evidence_to_check.map((item) => `- ${item}`) : ['- 暂无证据定义。'])
  ])
  const refs = [
    `cross-border-ecommerce-ai-route/runtime/control-plane/review-packs/${stage.node_id}/human-review-pack.json`,
    `cross-border-ecommerce-ai-route/runtime/control-plane/review-packs/${stage.node_id}/human-review-pack.md`
  ]
  updateSurface(stage, {
    state: {
      status: 'review_pack_ready',
      execution_mode: 'review_pack',
      progress: 0.68,
      blockers: (stage.required_human_gates || []).map((gate) => `pending user review: ${gate}`),
      next_actions: ['operator_review_required', 'prepare_controlled_execution']
    },
    artifacts: {
      latest_report: refs[0]
    }
  }, refs)
  writeStageEvent(stage, 'review_pack', 'completed', refs)
  return pack
}

function prepareControlledExecution(stage) {
  const preflightDir = join(controlPlaneRoot, 'controlled-execution', stage.node_id)
  const preflight = {
    contract: 'controlled_execution_preflight.v1',
    generated_at: nowIso(),
    project_id: 'cross_border_ecommerce_ai_route',
    stage_id: stage.node_id,
    stage_label: stageLabel(stage),
    allowed_to_execute_real_action: false,
    blocked_reason: 'real_execution_policy_allows is false until explicit user confirmation and stage-specific safety review.',
    required_before_real_execution: [
      'human_review_approved',
      'safety_gate_passed',
      'real_execution_policy_allows',
      'target_window_or_platform_verified',
      'draft_matches_approved_content'
    ],
    candidate_local_actions: stage.control_actions || [],
    external_action_warning: 'Do not send customer messages, quotes, payment instructions, ads, shipment bookings, customs, tax or FX filings from this preflight.'
  }
  const preflightPath = join(preflightDir, 'controlled-execution-preflight.json')
  writeJson(preflightPath, preflight)
  const refs = [`cross-border-ecommerce-ai-route/runtime/control-plane/controlled-execution/${stage.node_id}/controlled-execution-preflight.json`]
  updateSurface(stage, {
    state: {
      status: 'controlled_execution_ready',
      execution_mode: 'controlled_real_execution_blocked',
      progress: 0.74,
      blockers: preflight.required_before_real_execution,
      next_actions: ['wait_for_explicit_user_confirmation']
    },
    artifacts: {
      latest_report: refs[0]
    }
  }, refs)
  writeStageEvent(stage, 'prepare_controlled', 'blocked_real_action', refs)
  return preflight
}

const args = parseArgs(process.argv.slice(2))
const stageId = args.stage
const action = args.action || 'inspect'

if (!stageId) {
  console.error('Missing --stage=<cbx_stage_id>')
  process.exit(1)
}

try {
  const stage = getStage(stageId)
  ensureDir(stageDir(stage.node_id))
  let result
  if (action === 'inspect') result = inspectStage(stage)
  else if (action === 'validate') result = validateStage(stage)
  else if (action === 'generate-draft') result = generateLocalDraft(stage)
  else if (action === 'review-pack') result = buildReviewPack(stage)
  else if (action === 'prepare-controlled') result = prepareControlledExecution(stage)
  else throw new Error(`Unsupported action: ${action}`)
  writeCurrentStatus()
  console.log(JSON.stringify({
    contract: 'cross_border_stage_action_result.v1',
    stage_id: stage.node_id,
    action,
    result: 'pass',
    output: result
  }, null, 2))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(JSON.stringify({
    contract: 'cross_border_stage_action_result.v1',
    stage_id: stageId,
    action,
    result: 'fail',
    error: message
  }, null, 2))
  process.exit(1)
}

