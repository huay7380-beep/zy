import { DesktopDevice } from './device'
import { OutboundSendCommand, OutboundSendResult } from './send-command-types'

interface SendEvaluation {
  allowed: boolean
  blockedReasons: string[]
}

export class DesktopSendExecutor {
  constructor(private readonly device?: DesktopDevice) {}

  dryRun(command: OutboundSendCommand): OutboundSendResult {
    return this.resultFor(command, {
      dryRun: true,
      realSendAttempted: false
    })
  }

  async execute(command: OutboundSendCommand, { dryRun = true } = {}): Promise<OutboundSendResult> {
    const evaluation = evaluateCommand(command)
    if (dryRun || !evaluation.allowed) {
      return this.resultFor(command, {
        dryRun,
        realSendAttempted: false
      })
    }

    if (!this.device) {
      return this.resultFor(command, {
        dryRun,
        status: 'failed',
        blockedReason: 'missing_desktop_device',
        realSendAttempted: false
      })
    }

    await this.device.sendMessage(command.message_draft)
    return this.resultFor(command, {
      dryRun,
      status: 'sent',
      realSendAttempted: true
    })
  }

  private resultFor(
    command: OutboundSendCommand,
    options: {
      dryRun: boolean
      status?: OutboundSendResult['status']
      blockedReason?: string
      realSendAttempted: boolean
    }
  ): OutboundSendResult {
    const evaluation = evaluateCommand(command)
    const status = options.status ?? (evaluation.allowed ? 'previewed' : 'blocked')
    const blockedReason = options.blockedReason ?? evaluation.blockedReasons.join(',')
    const evidenceRefsByStatus: Record<OutboundSendResult['status'], string[]> = {
      blocked: ['sightflow_desktop_send_blocked'],
      previewed: ['sightflow_desktop_preview'],
      sent: ['sightflow_desktop_sent'],
      failed: ['sightflow_desktop_send_failed']
    }

    return {
      send_result_id: `send_result_${command.send_command_id}`,
      send_command_id: command.send_command_id,
      status,
      ...(blockedReason && status !== 'sent' ? { blocked_reason: blockedReason } : {}),
      target_verification: {
        dry_run: options.dryRun,
        allowed_for_real_execution: evaluation.allowed,
        blocked_reasons: evaluation.blockedReasons
      },
      executed_at: new Date().toISOString(),
      evidence_refs: evidenceRefsByStatus[status],
      metadata: {
        executor: 'sightflow_desktop',
        real_send_attempted: options.realSendAttempted,
        audit_event_required: status === 'sent',
        feedback_entry_required: status === 'sent'
      }
    }
  }
}

export function evaluateCommand(command: OutboundSendCommand): SendEvaluation {
  const blockedReasons: string[] = []
  if (!command.real_execution_allowed) blockedReasons.push('real_execution_not_allowed')
  if (command.requires_user_confirmation && !command.user_confirmed) {
    blockedReasons.push('user_confirmation_missing')
  }
  if (command.safety_checks.window_matches !== true) {
    blockedReasons.push('target_window_mismatch')
  }
  if (command.safety_checks.thread_matches !== true) {
    blockedReasons.push('target_thread_mismatch')
  }
  if (command.safety_checks.draft_matches !== true) {
    blockedReasons.push('message_draft_mismatch')
  }
  if (command.safety_checks.permission_granted !== true) {
    blockedReasons.push('permission_not_granted')
  }
  return {
    allowed: blockedReasons.length === 0,
    blockedReasons
  }
}
