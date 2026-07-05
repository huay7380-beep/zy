import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { BoxSelectDevice } from '../../box-select-device'
import { DesktopDevice } from '../../device'
import { DesktopSendExecutor, evaluateCommand } from '../../desktop-send-executor'
import { RPADevice } from '../../rpa-device'
import { OutboundSendCommand, OutboundSendResult } from '../../send-command-types'
import { AppType, BoxRegions } from '../types'

interface ControlledSendReadiness {
  schema_version?: string
  ready_for_real_controlled_send?: boolean
  gate_decision?: string
  real_send_attempted?: boolean
  required_failures?: string[]
  input_path?: string
  command?: ControlledSendCommandSummary
  handoff?: {
    command_path?: string
    readiness_path?: string
    box_regions_path?: string
    result_path?: string
  }
}

interface ControlledSendCommandSummary {
  send_command_id?: string
  event_id?: string
  decision_id?: string
  trigger_id?: string
  target_platform?: string
  target_person_id?: string | null
  target_thread_hint?: Record<string, unknown>
  message_draft_length?: number
  message_draft_sha256?: string
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function appTypeFromCommand(command: OutboundSendCommand): AppType {
  const platform = String(command.target_platform || 'wechat')
  if (['wechat', 'wework', 'whatsapp', 'generic'].includes(platform)) {
    return platform as AppType
  }
  return 'generic'
}

function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>
    return `{${Object.keys(objectValue)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(objectValue[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function assertEqualBinding(label: string, actual: unknown, expected: unknown): void {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(`controlled-send ${label} does not match prepared trial snapshot`)
  }
}

function assertReadiness(readiness: ControlledSendReadiness): void {
  if (readiness.schema_version !== 'desktop_controlled_send_trial.v1') {
    throw new Error('controlled-send readiness schema_version must be desktop_controlled_send_trial.v1')
  }
  if (readiness.gate_decision !== 'controlled_send_ready_for_test_window') {
    throw new Error(`controlled-send readiness gate_decision is not ready: ${readiness.gate_decision || 'unknown'}`)
  }
  if (readiness.ready_for_real_controlled_send !== true) {
    throw new Error(
      `controlled-send readiness is not ready: ${readiness.gate_decision || 'unknown'}; failures=${(readiness.required_failures || []).join(',')}`
    )
  }
  if (readiness.real_send_attempted !== false) {
    throw new Error('controlled-send readiness real_send_attempted must be false before runner execution')
  }
  if (!Array.isArray(readiness.required_failures)) {
    throw new Error('controlled-send readiness required_failures must be an array')
  }
  if (readiness.required_failures.length > 0) {
    throw new Error(`controlled-send readiness has required failures: ${readiness.required_failures.join(',')}`)
  }
}

function assertPathMatches(label: string, actualPath: string, expectedPath?: string): void {
  if (!expectedPath) {
    throw new Error(`controlled-send readiness missing ${label}`)
  }
  if (path.resolve(actualPath) !== path.resolve(expectedPath)) {
    throw new Error(`controlled-send ${label} does not match prepared trial snapshot`)
  }
}

function assertCommandMatchesReadiness(command: OutboundSendCommand, readiness: ControlledSendReadiness): void {
  const preparedCommand = readiness.command
  if (!preparedCommand) {
    throw new Error('controlled-send readiness missing prepared command summary')
  }

  assertEqualBinding('send_command_id', command.send_command_id, preparedCommand.send_command_id)
  assertEqualBinding('event_id', command.event_id, preparedCommand.event_id)
  assertEqualBinding('decision_id', command.decision_id, preparedCommand.decision_id)
  assertEqualBinding('trigger_id', command.trigger_id, preparedCommand.trigger_id)
  assertEqualBinding('target_platform', command.target_platform, preparedCommand.target_platform)
  assertEqualBinding('target_person_id', command.target_person_id ?? null, preparedCommand.target_person_id ?? null)
  assertEqualBinding('target_thread_hint', command.target_thread_hint, preparedCommand.target_thread_hint)
  assertEqualBinding('message_draft_length', command.message_draft.length, preparedCommand.message_draft_length)

  if (!preparedCommand.message_draft_sha256 || !/^[a-f0-9]{64}$/.test(preparedCommand.message_draft_sha256)) {
    throw new Error('controlled-send readiness missing prepared message_draft_sha256')
  }
  if (sha256Text(command.message_draft) !== preparedCommand.message_draft_sha256) {
    throw new Error('controlled-send message_draft_sha256 changed after prepare; rerun preflight and prepare')
  }
}

function assertRunnerEnvironmentMatchesReadiness({
  readiness,
  commandPath,
  readinessPath,
  resultPath
}: {
  readiness: ControlledSendReadiness
  commandPath: string
  readinessPath: string
  resultPath: string
}): void {
  assertPathMatches('command path', commandPath, readiness.input_path || readiness.handoff?.command_path)
  assertPathMatches('readiness path', readinessPath, readiness.handoff?.readiness_path)
  assertPathMatches('result path', resultPath, readiness.handoff?.result_path)

  const boxRegionsPath = process.env.CONTROLLED_SEND_BOX_REGIONS_PATH
  const visionApiKey = process.env.CONTROLLED_SEND_VISION_API_KEY
  if (boxRegionsPath && visionApiKey) {
    throw new Error('controlled-send runner requires either CONTROLLED_SEND_BOX_REGIONS_PATH or CONTROLLED_SEND_VISION_API_KEY, not both')
  }
  if (boxRegionsPath) {
    assertPathMatches('box regions path', boxRegionsPath, readiness.handoff?.box_regions_path)
  }
}

function assertCommandMetadata(command: OutboundSendCommand): void {
  const metadata = command.metadata || {}
  if (metadata.controlled_send_scope !== 'test_account_or_test_window') {
    throw new Error('command.metadata.controlled_send_scope must be test_account_or_test_window')
  }
  if (metadata.no_production_contact !== true) {
    throw new Error('command.metadata.no_production_contact must be true')
  }
  if (metadata.operator_confirmation !== 'confirmed_for_controlled_send') {
    throw new Error('command.metadata.operator_confirmation must be confirmed_for_controlled_send')
  }
}

function buildDevice(appType: AppType): DesktopDevice {
  const boxRegionsPath = process.env.CONTROLLED_SEND_BOX_REGIONS_PATH
  if (boxRegionsPath) {
    const device = new BoxSelectDevice(readJson<BoxRegions>(boxRegionsPath))
    device.setAppType(appType)
    return device
  }

  const apiKey = process.env.CONTROLLED_SEND_VISION_API_KEY
  if (!apiKey) {
    throw new Error('Either CONTROLLED_SEND_BOX_REGIONS_PATH or CONTROLLED_SEND_VISION_API_KEY is required')
  }
  const device = new RPADevice()
  device.setAppType(appType)
  device.setApiKey(apiKey)
  return device
}

function writeResult(result: OutboundSendResult, command: OutboundSendCommand, resultPath: string): void {
  const payload = {
    schema_version: 'sightflow_real_controlled_send_result.v1',
    command_summary: {
      send_command_id: command.send_command_id,
      event_id: command.event_id,
      decision_id: command.decision_id,
      trigger_id: command.trigger_id,
      target_platform: command.target_platform,
      target_person_id: command.target_person_id,
      target_thread_hint: command.target_thread_hint,
      message_draft_length: command.message_draft.length,
      message_draft_sha256: sha256Text(command.message_draft)
    },
    send_result: result,
    real_send_attempted: result.metadata?.real_send_attempted === true
  }
  mkdirSync(path.dirname(resultPath), { recursive: true })
  writeFileSync(resultPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export async function runRealControlledSendTest() {
  console.log('[Test] Running REAL zhineng_bridge controlled send test...')
  if (process.env.ALLOW_REAL_CONTROLLED_SEND !== 'true') {
    throw new Error('ALLOW_REAL_CONTROLLED_SEND=true is required')
  }

  const commandPath = requireEnv('CONTROLLED_SEND_COMMAND_PATH')
  const readinessPath = requireEnv('CONTROLLED_SEND_READINESS_PATH')
  const resultPath = requireEnv('CONTROLLED_SEND_RESULT_PATH')
  const command = readJson<OutboundSendCommand>(commandPath)
  const readiness = readJson<ControlledSendReadiness>(readinessPath)

  assertReadiness(readiness)
  assertRunnerEnvironmentMatchesReadiness({
    readiness,
    commandPath,
    readinessPath,
    resultPath
  })
  assertCommandMatchesReadiness(command, readiness)
  assertCommandMetadata(command)

  const evaluation = evaluateCommand(command)
  if (!evaluation.allowed) {
    throw new Error(`controlled-send command is not allowed: ${evaluation.blockedReasons.join(',')}`)
  }

  const appType = appTypeFromCommand(command)
  const device = buildDevice(appType)
  const layout = await device.measureLayout()
  if (!layout.success) {
    throw new Error(`controlled-send layout verification failed: ${layout.error || 'unknown'}`)
  }

  const executor = new DesktopSendExecutor(device)
  const result = await executor.execute(command, { dryRun: false })
  writeResult(result, command, resultPath)

  if (result.status !== 'sent' || result.metadata?.real_send_attempted !== true) {
    throw new Error(`controlled-send did not complete: ${result.status}`)
  }

  console.log('✅ REAL zhineng_bridge controlled send completed for the confirmed test window')
}
