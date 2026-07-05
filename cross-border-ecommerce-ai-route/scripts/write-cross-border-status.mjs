import { join } from 'node:path'
import {
  controlPlaneRoot,
  ensureDir,
  projectRoot,
  summarizeControlPlane,
  writeJson
} from './cross-border-stage-control-lib.mjs'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const status = summarizeControlPlane()
const branchControlPackPath = join(projectRoot, 'runtime', 'growth-sales-automation', 'branch-control-pack.json')
if (existsSync(branchControlPackPath)) {
  const branchControlPack = JSON.parse(readFileSync(branchControlPackPath, 'utf8'))
  status.branch_overlays = [
    {
      branch_id: branchControlPack.branch_id,
      label: branchControlPack.label,
      status: 'draft_only_synced',
      phase_count: branchControlPack.summary?.phase_count || 0,
      module_count: branchControlPack.summary?.module_count || 0,
      software_count: branchControlPack.summary?.software_count || 0,
      mapped_stage_ids: branchControlPack.summary?.mapped_stage_ids || [],
      dashboard: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/dashboard/index.html',
      control_pack: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/branch-control-pack.json',
      ai_plan_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/ai-implementation-plan.json',
      ai_plan_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/ai-implementation-plan.md',
      product_input_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-input-framework.json',
      product_input_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-input-framework.md',
      product_decision_desk_plan_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/execution-plan.json',
      product_decision_desk_plan_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/execution-plan.md',
      product_decision_desk_data_sources: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/data-source-registry.json',
      product_decision_desk_source_matrix_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/source-channel-matrix.json',
      product_decision_desk_source_matrix_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/source-channel-matrix.md',
      product_decision_desk_global_region_source_coverage_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/global-region-source-coverage.json',
      product_decision_desk_global_region_source_coverage_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/global-region-source-coverage.md',
      product_decision_desk_product_console_manager_audit_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/product-console-manager-audit.json',
      product_decision_desk_product_console_manager_audit_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/product-console-manager-audit.md',
      product_decision_desk_direction_record_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/current-direction-record.json',
      product_decision_desk_direction_record_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/current-direction-record.md',
      product_decision_desk_remaining_capability_execution_plan_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/remaining-capability-execution-plan.json',
      product_decision_desk_remaining_capability_execution_plan_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/remaining-capability-execution-plan.md',
      product_decision_desk_category_profile_coverage_report_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/category-profile-coverage-report.json',
      product_decision_desk_category_profile_coverage_report_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/category-profile-coverage-report.md',
      product_decision_desk_capability_c_execution_report_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/capability-c-execution-report.json',
      product_decision_desk_capability_c_execution_report_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/capability-c-execution-report.md',
      product_decision_desk_remaining_capabilities_execution_report_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/remaining-capabilities-execution-report.json',
      product_decision_desk_remaining_capabilities_execution_report_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/remaining-capabilities-execution-report.md',
      product_decision_desk_post_completion_defect_assessment_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/post-completion-defect-assessment.json',
      product_decision_desk_post_completion_defect_assessment_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/post-completion-defect-assessment.md',
      product_decision_desk_latest_saved_product_decision_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/latest-saved-product-decision.json',
      product_decision_desk_launch_rules_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/product-launch-decision-rules.json',
      product_decision_desk_launch_rules_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/product-launch-decision-rules.md',
      product_decision_desk_free_source_trial_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-trial.json',
      product_decision_desk_free_source_trial_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-trial.md',
      product_decision_desk_free_source_coverage_audit_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-coverage-audit.json',
      product_decision_desk_free_source_coverage_audit_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-coverage-audit.md',
      promotion_social_execution_status_index_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/execution-status-index.json',
      promotion_social_execution_status_index_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/execution-status-index.md',
      promotion_plan_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/promotion-social-automation/promotion-plan.json',
      promotion_plan_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/promotion-social-automation/promotion-plan.md',
      promotion_channel_specialized_design_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/promotion-social-automation/channel-specialized-design.json',
      promotion_channel_specialized_design_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/promotion-social-automation/channel-specialized-design.md',
      auto_reply_bot_design_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/promotion-social-automation/auto-reply-bot-design.json',
      auto_reply_bot_design_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/promotion-social-automation/auto-reply-bot-design.md',
      social_connector_registry_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/promotion-social-automation/social-connector-registry.json',
      social_connector_registry_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/promotion-social-automation/social-connector-registry.md',
      social_connection_status_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/promotion-social-automation/connection-status.json',
      social_connection_status_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/promotion-social-automation/connection-status.md',
      promotion_social_validation_report_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/promotion-social-automation/validation-report.json',
      promotion_social_validation_report_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/promotion-social-automation/validation-report.md',
      sample_runs: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/sample-runs/**',
      real_external_actions_allowed: false,
      external_software_enabled: false
    }
  ]
}
const statusDir = join(controlPlaneRoot, 'status')
ensureDir(statusDir)
writeJson(join(statusDir, 'current-status.json'), status)

const lines = [
  '# 跨境电商控制面当前状态',
  '',
  `生成时间：${status.generated_at}`,
  '',
  `阶段总数：${status.stage_count}`,
  `已进入草案/受控完成态：${status.completed_count}`,
  `真实动作阻断阶段：${status.blocked_real_actions}`,
  '',
  '## 阶段摘要',
  '',
  '| 阶段 | 状态 | 进度 | 最新报告 |',
  '| --- | --- | --- | --- |',
  ...status.surfaces.map((surface) => (
    `| ${surface.stage_label} | ${surface.status} | ${Math.round((surface.progress || 0) * 100)}% | ${surface.latest_report || ''} |`
  )),
  '',
  '## 当前阻塞',
  '',
  ...(status.blockers.length
    ? status.blockers.slice(0, 20).map((item) => `- ${item.stage_label}: ${item.blocker}`)
    : ['- 暂无阻塞项。']),
  '',
  '## 下一步',
  '',
  ...(status.next_actions.length
    ? status.next_actions.slice(0, 20).map((item) => `- ${item.stage_label}: ${item.action}`)
    : ['- 暂无下一步动作。'])
]

if (Array.isArray(status.branch_overlays) && status.branch_overlays.length) {
  lines.push(
    '',
    '## Branch overlays',
    '',
    ...status.branch_overlays.map((branch) =>
      `- ${branch.label}: ${branch.status}, ${branch.phase_count} phases, ${branch.module_count} modules, dashboard ${branch.dashboard}, promotion/social status ${branch.promotion_social_execution_status_index_json || 'not generated'}`
    )
  )
}

writeFileSync(join(statusDir, 'current-status.md'), `${lines.join('\n')}\n`, 'utf8')
console.log(JSON.stringify(status, null, 2))
