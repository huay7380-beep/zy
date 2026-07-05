import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
export const projectRoot = resolve(scriptDir, '..')
export const workspaceRoot = resolve(projectRoot, '..')
export const controlPlaneRoot = join(projectRoot, 'runtime', 'control-plane')

export const STAGE_LABELS = {
  cbx_00_strategy_scope: '经营策略与范围确认',
  cbx_01_entity_compliance: '大陆主体与证照准备',
  cbx_02_product_compliance: '产品合规与目标国准入',
  cbx_03_market_selection: '目标市场与客户画像',
  cbx_04_independent_site: '独立站与询盘入口',
  cbx_05_content_assets: '产品内容与图片视频',
  cbx_06_catalog_pricing: '产品目录、成本与价格本',
  cbx_07_acquisition: '获客与推广',
  cbx_08_lead_capture: '线索捕获与 CRM 入库',
  cbx_09_inquiry_reception: '询盘接待与需求澄清',
  cbx_10_quote_engine: '报价测算与报价草案',
  cbx_11_contract_payment: '合同、PI 与收款',
  cbx_12_order_fulfillment: '订单、生产、QC 与物流',
  cbx_13_customs_tax_fx: '报关、税务与外汇证据',
  cbx_14_after_sales_retention: '售后、复购与客户维护',
  cbx_15_audit_learning: '审计、复盘与自动优化'
}

const STAGE_SUMMARIES = {
  cbx_00_strategy_scope: '确认业务模式、首期产品范围、目标市场、预算边界和不可自动执行事项。',
  cbx_01_entity_compliance: '跟踪大陆主体、税务、海关、外汇、银行、ICP 与数据合规准备状态。',
  cbx_02_product_compliance: '为 SKU 建立 HS code 候选、认证、标签、包装、知识产权和禁限售风险矩阵。',
  cbx_03_market_selection: '根据产品、证书、物流、毛利和客户类型生成国家/地区与销售对象优先级。',
  cbx_04_independent_site: '设计独立站结构、B2B 信任页、RFQ 表单、事件采集和发布门禁。',
  cbx_05_content_assets: '把源头资料转成产品页文案、图片重构任务、视频脚本和资料包。',
  cbx_06_catalog_pricing: '建立产品主数据、成本模型、MOQ、阶梯价、毛利底线和公开目录。',
  cbx_07_acquisition: '规划 SEO、GEO、Google、LinkedIn、B2B 平台、邮件和展会获客动作。',
  cbx_08_lead_capture: '将 RFQ、广告表单、邮箱、聊天和名片转为线索记录、评分和去重候选。',
  cbx_09_inquiry_reception: '解析客户需求、缺口问题、紧急度和首响草案，外发前进入人工确认。',
  cbx_10_quote_engine: '基于价格本、物流、条款和客户风险生成报价草案和报价门禁报告。',
  cbx_11_contract_payment: '生成 PI、合同、付款说明草案并跟踪收款、风险和外汇资料。',
  cbx_12_order_fulfillment: '把已付款订单推进生产、备货、QC、包装、订舱和到货通知草案。',
  cbx_13_customs_tax_fx: '检查报关、税务、收汇、退税和单证一致性，真实申报必须人工处理。',
  cbx_14_after_sales_retention: '管理到货确认、客诉、补偿门禁、复购提醒、新品推荐和客户分层维护。',
  cbx_15_audit_learning: '汇总渠道、询盘、报价、订单和售后数据，生成经营复盘与优化建议。'
}

const RUNTIME_FOLDER_BY_LAYER = {
  strategy: 'strategy',
  compliance: 'compliance',
  site: 'site',
  content: 'products',
  commercial: 'quotes',
  growth: 'growth',
  sales: 'customers',
  finance: 'quotes',
  fulfillment: 'orders',
  customer_success: 'customers',
  audit: 'audit'
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function writeJson(path, value) {
  ensureDir(dirname(path))
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

export function projectRelative(absPath) {
  return relative(projectRoot, absPath).replaceAll('\\', '/')
}

export function workspaceRelative(absPath) {
  return relative(workspaceRoot, absPath).replaceAll('\\', '/')
}

export function nowIso() {
  return new Date().toISOString()
}

export function loadManifest() {
  return readJson(join(projectRoot, 'nodes', 'process-manifest.json'))
}

export function loadNodeCatalog() {
  return readJson(join(projectRoot, 'nodes', 'node-catalog.json'))
}

export function loadStages() {
  const manifest = loadManifest()
  const catalog = loadNodeCatalog()
  const byId = new Map((catalog.nodes || []).map((stage) => [stage.node_id, stage]))
  return (manifest.canonical_flow || [])
    .map((stageId) => byId.get(stageId))
    .filter(Boolean)
}

export function stageRuntimeFolder(stage) {
  return RUNTIME_FOLDER_BY_LAYER[stage.layer] || 'control-plane'
}

export function stageLabel(stage) {
  return STAGE_LABELS[stage.node_id] || stage.label || stage.node_id
}

export function stageSummary(stage) {
  return STAGE_SUMMARIES[stage.node_id] || stage.purpose || `${stageLabel(stage)} 阶段运行态控制面。`
}

export function stageDir(stageId) {
  return join(controlPlaneRoot, 'stages', stageId)
}

export function stageSurfacePath(stageId) {
  return join(stageDir(stageId), 'stage-control-surface.json')
}

export function buildAction(stage, actionId, options) {
  return {
    action_id: actionId,
    label: options.label,
    kind: options.kind,
    allowed: options.allowed,
    requires_user_confirmation: options.requiresUserConfirmation,
    risk_level: options.riskLevel,
    command: {
      runner: 'node',
      args: [
        'cross-border-ecommerce-ai-route/scripts/run-cross-border-stage.mjs',
        `--stage=${stage.node_id}`,
        `--action=${options.cliAction}`
      ],
      writes_to: options.writesTo
    },
    blocked_until: options.blockedUntil,
    expected_output_contracts: options.expectedOutputContracts
  }
}

export function buildStageControlSurface(stage, current = {}) {
  const label = stageLabel(stage)
  const stagePath = `cross-border-ecommerce-ai-route/runtime/control-plane/stages/${stage.node_id}`
  const runtimeFolder = stageRuntimeFolder(stage)
  const currentState = current.state && typeof current.state === 'object' ? current.state : {}
  const currentArtifacts = current.artifacts && typeof current.artifacts === 'object' ? current.artifacts : {}
  const blockers = Array.isArray(currentState.blockers)
    ? currentState.blockers
    : (stage.required_human_gates || []).map((gate) => `pending gate: ${gate}`)
  const nextActions = Array.isArray(currentState.next_actions)
    ? currentState.next_actions
    : [
        'inspect_stage',
        stage.inputs?.length ? 'validate_stage' : 'generate_local_draft',
        'build_human_review_pack'
      ]

  const actions = [
    buildAction(stage, 'inspect_stage', {
      label: '查看阶段资料',
      kind: 'inspect',
      cliAction: 'inspect',
      allowed: true,
      requiresUserConfirmation: false,
      riskLevel: 'low',
      writesTo: [`${stagePath}/**`],
      blockedUntil: [],
      expectedOutputContracts: ['cross_border_stage_control_surface.v1']
    }),
    buildAction(stage, 'validate_stage', {
      label: '校验阶段输入',
      kind: 'validate',
      cliAction: 'validate',
      allowed: true,
      requiresUserConfirmation: false,
      riskLevel: 'low',
      writesTo: [`${stagePath}/**`],
      blockedUntil: [],
      expectedOutputContracts: ['stage_validation_report.v1']
    }),
    buildAction(stage, 'generate_local_draft', {
      label: '生成本地草案',
      kind: 'generate_draft',
      cliAction: 'generate-draft',
      allowed: true,
      requiresUserConfirmation: false,
      riskLevel: 'medium',
      writesTo: [`cross-border-ecommerce-ai-route/runtime/${runtimeFolder}/drafts/${stage.node_id}/**`],
      blockedUntil: ['required_inputs_present'],
      expectedOutputContracts: stage.outputs || ['stage_local_draft.v1']
    }),
    buildAction(stage, 'build_human_review_pack', {
      label: '生成人工确认包',
      kind: 'build_review_pack',
      cliAction: 'review-pack',
      allowed: true,
      requiresUserConfirmation: false,
      riskLevel: 'medium',
      writesTo: [`cross-border-ecommerce-ai-route/runtime/control-plane/review-packs/${stage.node_id}/**`],
      blockedUntil: ['local_draft_exists'],
      expectedOutputContracts: ['human_review_pack.v1']
    }),
    buildAction(stage, 'prepare_controlled_execution', {
      label: '准备受控执行',
      kind: 'prepare_controlled_execution',
      cliAction: 'prepare-controlled',
      allowed: false,
      requiresUserConfirmation: true,
      riskLevel: 'high',
      writesTo: [`cross-border-ecommerce-ai-route/runtime/control-plane/controlled-execution/${stage.node_id}/**`],
      blockedUntil: ['human_review_approved', 'safety_gate_passed', 'real_execution_policy_allows'],
      expectedOutputContracts: ['controlled_execution_preflight.v1']
    })
  ]

  if ((stage.control_actions || []).includes('run_product_page_ai_build')) {
    actions.splice(3, 0, {
      action_id: 'run_product_page_ai_build',
      label: '执行产品页 AI 分叉',
      kind: 'generate_product_page_branch',
      allowed: true,
      requires_user_confirmation: false,
      risk_level: 'medium',
      command: {
        runner: 'node',
        args: [
          'cross-border-ecommerce-ai-route/scripts/run-product-page-branch.mjs',
          '--product=qxkj-1035',
          '--mode=small-rebuild-accessory'
        ],
        writes_to: [
          'cross-border-ecommerce-ai-route/runtime/product-automation/pages/**',
          'cross-border-ecommerce-ai-route/runtime/product-automation/review-packs/**',
          'cross-border-ecommerce-ai-route/runtime/control-plane/**'
        ]
      },
      blocked_until: ['required_inputs_present'],
      expected_output_contracts: ['product_page_build_pack.v1', 'product_page_branch_qa_report.v1']
    })
  }

  if ((stage.control_actions || []).includes('import_source_website_products')) {
    actions.splice(3, 0, {
      action_id: 'import_qx_source_catalog',
      label: 'Import QX source catalog',
      kind: 'source_website_product_import',
      allowed: true,
      requires_user_confirmation: false,
      risk_level: 'medium',
      command: {
        runner: 'node',
        args: [
          'cross-border-ecommerce-ai-route/scripts/import-qx-telecom-catalog.mjs',
          '--source=http://www.qx-telecom.com/',
          '--reference=https://www.molexces.com/',
          '--limit=all'
        ],
        writes_to: [
          'cross-border-ecommerce-ai-route/runtime/product-automation/source-imports/**',
          'cross-border-ecommerce-ai-route/runtime/product-automation/pages/**',
          'cross-border-ecommerce-ai-route/runtime/product-automation/review-packs/**',
          'cross-border-ecommerce-ai-route/runtime/control-plane/**'
        ]
      },
      blocked_until: ['source_site_reachable'],
      expected_output_contracts: ['source_product_catalog_import.v1', 'molex_style_site_draft.v1']
    })
  }

  return {
    contract: 'cross_border_stage_control_surface.v1',
    project_id: 'cross_border_ecommerce_ai_route',
    stage_id: stage.node_id,
    stage_label: label,
    stage_layer: stage.layer,
    state: {
      status: currentState.status || 'draft_ready',
      execution_mode: currentState.execution_mode || 'inspect_only',
      progress: typeof currentState.progress === 'number' ? currentState.progress : 0.15,
      blockers,
      next_actions: nextActions,
      updated_at: currentState.updated_at || nowIso()
    },
    view: {
      summary: stageSummary(stage),
      source_refs: stage.source_docs || [],
      runtime_refs: [...new Set([
        `${stagePath}/stage-control-surface.json`,
        `${stagePath}/latest-stage-report.json`,
        ...(Array.isArray(current.view?.runtime_refs) ? current.view.runtime_refs : [])
      ])],
      graph_node_id: `entity_work.cross_border.${stage.node_id.replace('cbx_', 'cbx.')}`,
      lens_tags: ['entity_work', 'cross_border', stage.layer || 'stage']
    },
    actions,
    gates: (stage.required_human_gates || []).map((gate) => ({
      gate_id: gate,
      status: 'pending_user',
      owner: stage.owner_role || 'operator',
      required_for: ['generate_local_draft', 'prepare_controlled_execution'],
      evidence_refs: []
    })),
    artifacts: {
      input_contracts: stage.inputs || [],
      output_contracts: stage.outputs || [],
      runtime_output_root: 'cross-border-ecommerce-ai-route/runtime',
      latest_report: currentArtifacts.latest_report || `${stagePath}/latest-stage-report.json`
    },
    audit: {
      event_contracts: ['RawEvent', 'SemanticEvent', 'cross_border_stage_event.v1'],
      writeback_required: true,
      real_execution_allowed: false,
      notes: [
        'Local inspect, validate, draft and review-pack actions write inside cross-border-ecommerce-ai-route/runtime/**.',
        'Real customer, quote, payment, ad, shipment, customs, tax or FX actions remain blocked until explicit human confirmation.'
      ]
    }
  }
}

export function writeStageSurface(stage, current = {}) {
  const surface = buildStageControlSurface(stage, current)
  writeJson(stageSurfacePath(stage.node_id), surface)
  return surface
}

export function readStageSurface(stageId) {
  const path = stageSurfacePath(stageId)
  return existsSync(path) ? readJson(path) : null
}

export function listStageSurfaces() {
  const root = join(controlPlaneRoot, 'stages')
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readStageSurface(entry.name))
    .filter(Boolean)
}

export function writeStageEvent(stage, action, status, artifactRefs = [], metadata = {}) {
  const event = {
    contract: 'cross_border_stage_event.v1',
    event_id: `cbx_evt_${stage.node_id}_${action}_${Date.now()}`,
    project_id: 'cross_border_ecommerce_ai_route',
    stage_id: stage.node_id,
    action,
    status,
    occurred_at: nowIso(),
    artifact_refs: artifactRefs,
    raw_event: {
      contract: 'RawEvent',
      source_adapter_id: 'cross_border_stage_control.local',
      source_type: 'file',
      platform: 'local_runtime',
      content_summary: `${stageLabel(stage)} ${action} ${status}`,
      captured_at: nowIso()
    },
    semantic_event: {
      contract: 'SemanticEvent',
      event_type: `cross_border.${action}.${status}`,
      subject_id: stage.node_id,
      object_refs: artifactRefs,
      confidence: 1
    },
    metadata
  }
  const eventsDir = join(controlPlaneRoot, 'events')
  ensureDir(eventsDir)
  const eventPath = join(eventsDir, 'stage-events.jsonl')
  writeFileSync(eventPath, `${JSON.stringify(event)}\n`, { flag: 'a', encoding: 'utf8' })
  writeJson(join(stageDir(stage.node_id), 'latest-stage-event.json'), event)
  return event
}

export function summarizeControlPlane() {
  const stages = listStageSurfaces()
  const statusCounts = stages.reduce((counts, surface) => {
    counts[surface.state.status] = (counts[surface.state.status] || 0) + 1
    return counts
  }, {})
  const blockers = stages.flatMap((surface) =>
    (surface.state.blockers || []).slice(0, 3).map((blocker) => ({
      stage_id: surface.stage_id,
      stage_label: surface.stage_label,
      blocker
    }))
  )
  const nextActions = stages.flatMap((surface) =>
    (surface.state.next_actions || []).slice(0, 2).map((action) => ({
      stage_id: surface.stage_id,
      stage_label: surface.stage_label,
      action
    }))
  )
  return {
    contract: 'cross_border_control_plane_status.v1',
    project_id: 'cross_border_ecommerce_ai_route',
    generated_at: nowIso(),
    stage_count: stages.length,
    status_counts: statusCounts,
    completed_count: stages.filter((surface) =>
      ['completed_draft', 'controlled_execution_ready', 'completed_controlled'].includes(surface.state.status)
    ).length,
    blocked_real_actions: stages.filter((surface) => surface.audit?.real_execution_allowed === false).length,
    blockers,
    next_actions: nextActions,
    latest_stage_reports: stages
      .map((surface) => surface.artifacts?.latest_report)
      .filter(Boolean),
    surfaces: stages.map((surface) => ({
      stage_id: surface.stage_id,
      stage_label: surface.stage_label,
      layer: surface.stage_layer,
      status: surface.state.status,
      execution_mode: surface.state.execution_mode,
      progress: surface.state.progress,
      next_actions: surface.state.next_actions,
      source_refs: surface.view.source_refs,
      latest_report: surface.artifacts?.latest_report
    }))
  }
}
