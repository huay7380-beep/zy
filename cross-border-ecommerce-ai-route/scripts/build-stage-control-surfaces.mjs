import { join } from 'node:path'
import {
  controlPlaneRoot,
  ensureDir,
  loadStages,
  summarizeControlPlane,
  writeJson,
  writeStageSurface
} from './cross-border-stage-control-lib.mjs'

const stages = loadStages()
const surfaces = stages.map((stage) => writeStageSurface(stage))
const status = summarizeControlPlane()

ensureDir(join(controlPlaneRoot, 'status'))
writeJson(join(controlPlaneRoot, 'status', 'current-status.json'), status)

const markdown = [
  '# 跨境电商阶段控制面状态',
  '',
  `生成时间：${status.generated_at}`,
  '',
  `阶段数量：${status.stage_count}`,
  '',
  '| 阶段 | 状态 | 执行模式 | 下一步 |',
  '| --- | --- | --- | --- |',
  ...surfaces.map((surface) => {
    const nextActions = (surface.state.next_actions || []).slice(0, 2).join(', ')
    return `| ${surface.stage_label} | ${surface.state.status} | ${surface.state.execution_mode} | ${nextActions} |`
  }),
  '',
  '真实客户外发、真实报价、付款说明、广告投放、物流订舱、报关、税务和外汇动作仍默认阻断。'
].join('\n')

ensureDir(join(controlPlaneRoot, 'status'))
await import('node:fs').then(({ writeFileSync }) => {
  writeFileSync(join(controlPlaneRoot, 'status', 'current-status.md'), `${markdown}\n`, 'utf8')
})

console.log(JSON.stringify({
  contract: 'cross_border_stage_control_build_result.v1',
  generated_count: surfaces.length,
  status_path: 'cross-border-ecommerce-ai-route/runtime/control-plane/status/current-status.json',
  result: 'pass'
}, null, 2))

