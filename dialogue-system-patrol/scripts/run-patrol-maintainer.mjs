import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve('.')
const OUTPUT_ROOT = 'runtime/dialogue-system-patrol-maintenance'

function argValue(name) {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function maintenanceId(date = new Date()) {
  return `patrol_maintainer_${date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
}

function runStep({ id, label, command, args }) {
  const startedAt = new Date().toISOString()
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false
  })
  const completedAt = new Date().toISOString()
  return {
    id,
    label,
    command: [command, ...args].join(' '),
    exit_code: typeof result.status === 'number' ? result.status : 1,
    signal: result.signal ?? null,
    started_at: startedAt,
    completed_at: completedAt,
    stdout: (result.stdout ?? '').trim().split(/\r?\n/).slice(-20),
    stderr: (result.stderr ?? '').trim().split(/\r?\n/).filter(Boolean).slice(-20),
    passed: result.status === 0
  }
}

function makeMarkdown(report) {
  const rows = report.steps
    .map((step) => `| ${step.id} | ${step.passed ? 'pass' : 'fail'} | ${step.exit_code} | ${step.label} |`)
    .join('\n')
  return [
    '# Patrol Maintainer Report',
    '',
    `- schema: ${report.schema}`,
    `- maintenance_id: ${report.maintenance_id}`,
    `- generated_at: ${report.generated_at}`,
    `- gate_decision: ${report.gate_decision}`,
    `- target: ${report.target}`,
    `- required_failures: ${report.required_failures.join(', ') || 'none'}`,
    '',
    '| Step | Status | Exit | Label |',
    '| --- | --- | --- | --- |',
    rows,
    ''
  ].join('\n')
}

function usage() {
  return [
    'Usage:',
    '  npm.cmd run system-patrol:maintain -- --module-id=<module_id>',
    '  npm.cmd run system-patrol:maintain -- --all',
    '',
    'Runs the patrol-maintainer equivalent workflow: source drift check, validate, publish, validate, process-tree sync, module gate, and read-surface publication.'
  ].join('\n')
}

function main() {
  if (hasFlag('help')) {
    console.log(usage())
    return
  }
  const moduleId = argValue('module-id')
  const all = hasFlag('all') || !moduleId
  const gateArgs = all ? ['dialogue-system-patrol/scripts/check-module-onboarding-gate.mjs', '--all'] : [
    'dialogue-system-patrol/scripts/check-module-onboarding-gate.mjs',
    `--module-id=${moduleId}`
  ]
  const sourceDriftArgs = all ? ['dialogue-system-patrol/scripts/check-source-drift.mjs', '--all'] : [
    'dialogue-system-patrol/scripts/check-source-drift.mjs',
    `--module-id=${moduleId}`
  ]
  const timelineArgs = all ? [
    'dialogue-system-patrol/scripts/write-build-timeline-event.mjs',
    '--all'
  ] : [
    'dialogue-system-patrol/scripts/write-build-timeline-event.mjs',
    `--module-id=${moduleId}`
  ]
  const generatedAt = new Date().toISOString()
  const id = maintenanceId(new Date(generatedAt))
  const steps = [
    {
      id: 'source_hash_drift_check',
      label: 'Verify module patrol source_hash values against current evidence source refs.',
      command: process.execPath,
      args: sourceDriftArgs
    },
    {
      id: 'system_patrol_validate_initial',
      label: 'Validate registry, patrol blocks, status outputs and strict coverage before publishing.',
      command: process.execPath,
      args: ['dialogue-system-patrol/scripts/validate-system-patrol.mjs']
    },
    {
      id: 'system_patrol_publish',
      label: 'Publish summary-only status cards and events.',
      command: process.execPath,
      args: ['dialogue-system-patrol/scripts/publish-system-patrol.mjs']
    },
    {
      id: 'system_patrol_validate_after_publish',
      label: 'Validate freshly published status cards and events.',
      command: process.execPath,
      args: ['dialogue-system-patrol/scripts/validate-system-patrol.mjs']
    },
    {
      id: 'process_tree_validate',
      label: 'Validate process tree, artifact registry and Obsidian sync.',
      command: process.execPath,
      args: ['scripts/validate-process-tree.mjs']
    },
    {
      id: 'build_timeline_record',
      label: all
        ? 'Record build timeline visibility for all registered modules before module gate.'
        : `Record build timeline visibility for ${moduleId} before module gate.`,
      command: process.execPath,
      args: [
        ...timelineArgs,
        '--phase=dialogue_visibility_ready',
        '--status=completed',
        '--summary=Patrol maintainer refreshed validation and status surfaces before module gate.',
        '--status-surface-updated',
        '--validation-run'
      ]
    },
    {
      id: 'module_onboarding_gate',
      label: all ? 'Run module onboarding gate for all registered modules.' : `Run module onboarding gate for ${moduleId}.`,
      command: process.execPath,
      args: gateArgs
    },
    {
      id: 'publish_patrol_surfaces',
      label: 'Publish dialogue read index and source-only 3D projection.',
      command: process.execPath,
      args: ['dialogue-system-patrol/scripts/publish-patrol-surfaces.mjs']
    }
  ].map(runStep)

  const requiredFailures = steps.filter((step) => !step.passed).map((step) => step.id)
  const report = {
    schema: 'patrol_maintainer_report.v1',
    maintenance_id: id,
    generated_at: generatedAt,
    target: all ? 'all' : moduleId,
    gate_decision: requiredFailures.length ? 'patrol_maintainer_blocked' : 'patrol_maintainer_ready',
    strict_mode_expected: true,
    steps,
    required_failures: requiredFailures,
    boundary: [
      'patrol-maintainer equivalent workflow',
      'no business module rewrite',
      'no dialogue reader rewrite',
      'no external action',
      'source-only 3D projection publication'
    ]
  }
  const outputDir = path.resolve(ROOT, OUTPUT_ROOT, id)
  mkdirSync(outputDir, { recursive: true })
  mkdirSync(path.resolve(ROOT, OUTPUT_ROOT), { recursive: true })
  writeFileSync(path.join(outputDir, 'patrol-maintainer-report.json'), JSON.stringify(report, null, 2))
  writeFileSync(path.join(outputDir, 'patrol-maintainer-report.md'), makeMarkdown(report))
  writeFileSync(path.resolve(ROOT, OUTPUT_ROOT, 'latest.json'), JSON.stringify(report, null, 2))
  writeFileSync(path.resolve(ROOT, OUTPUT_ROOT, 'latest.md'), makeMarkdown(report))

  console.log(JSON.stringify({
    command: 'run-patrol-maintainer',
    maintenance_id: report.maintenance_id,
    gate_decision: report.gate_decision,
    target: report.target,
    required_failures: report.required_failures,
    latest_json: path.resolve(ROOT, OUTPUT_ROOT, 'latest.json')
  }, null, 2))

  if (requiredFailures.length > 0) process.exitCode = 2
}

main()
