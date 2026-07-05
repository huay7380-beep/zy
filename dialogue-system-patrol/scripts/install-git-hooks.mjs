import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve('.')
const HOOK_SOURCE = '.githooks/pre-commit'
const OUTPUT_ROOT = 'runtime/dialogue-system-patrol-hook-install'

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function writeReport(report) {
  const outputDir = path.resolve(ROOT, OUTPUT_ROOT)
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(path.join(outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(path.join(outputDir, 'latest.md'), [
    '# System Patrol Hook Install',
    '',
    `- generated_at: ${report.generated_at}`,
    `- installed: ${report.installed}`,
    `- gate_decision: ${report.gate_decision}`,
    `- reason: ${report.reason || 'none'}`,
    `- hook_source: ${report.hook_source}`,
    `- hook_target: ${report.hook_target || 'unresolved'}`,
    ''
  ].join('\n'))
}

function main() {
  const force = hasFlag('force')
  const gitDirResult = spawnSync('git', ['rev-parse', '--git-dir'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false
  })
  if (gitDirResult.status !== 0) {
    writeReport({
      schema: 'system_patrol_hook_install_report.v1',
      generated_at: new Date().toISOString(),
      installed: false,
      gate_decision: 'hook_install_blocked',
      reason: 'not_valid_git_repository',
      hook_source: path.resolve(ROOT, HOOK_SOURCE),
      hook_target: null,
      next: [
        'Run this command from a valid git repository root.',
        'Do not claim local pre-commit enforcement is active until hook installation succeeds.'
      ]
    })
    console.error('Cannot install pre-commit hook because this workspace is not a valid git repository.')
    process.exitCode = 2
    return
  }

  const gitDir = gitDirResult.stdout.trim()
  const hookSourcePath = path.resolve(ROOT, HOOK_SOURCE)
  const hookTargetPath = path.resolve(ROOT, gitDir, 'hooks', 'pre-commit')
  if (!existsSync(hookSourcePath)) {
    writeReport({
      schema: 'system_patrol_hook_install_report.v1',
      generated_at: new Date().toISOString(),
      installed: false,
      gate_decision: 'hook_install_blocked',
      reason: 'hook_source_missing',
      hook_source: hookSourcePath,
      hook_target: hookTargetPath,
      next: ['Restore .githooks/pre-commit before installing local enforcement.']
    })
    console.error(`Hook source is missing: ${HOOK_SOURCE}`)
    process.exitCode = 2
    return
  }
  if (existsSync(hookTargetPath) && !force) {
    writeReport({
      schema: 'system_patrol_hook_install_report.v1',
      generated_at: new Date().toISOString(),
      installed: false,
      gate_decision: 'hook_install_blocked',
      reason: 'hook_target_exists',
      hook_source: hookSourcePath,
      hook_target: hookTargetPath,
      next: ['Re-run npm.cmd run system-patrol:hooks:install -- --force after confirming replacement.']
    })
    console.error(`Pre-commit hook already exists: ${hookTargetPath}. Re-run with --force to replace it.`)
    process.exitCode = 2
    return
  }

  mkdirSync(path.dirname(hookTargetPath), { recursive: true })
  writeFileSync(hookTargetPath, readFileSync(hookSourcePath, 'utf8'))
  const report = {
    schema: 'system_patrol_hook_install_report.v1',
    generated_at: new Date().toISOString(),
    command: 'install-system-patrol-git-hooks',
    installed: true,
    gate_decision: 'hook_install_ready',
    reason: null,
    hook_source: hookSourcePath,
    hook_target: hookTargetPath,
    force,
    next: ['Local pre-commit enforcement is installed for this git repository.']
  }
  writeReport(report)
  console.log(JSON.stringify(report, null, 2))
}

main()
