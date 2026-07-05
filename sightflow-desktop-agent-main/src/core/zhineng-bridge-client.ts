import { createHash } from 'node:crypto'
import { DesktopObservationInput, IntakeObservation } from './send-command-types'

export interface ZhinengBridgeSubmission {
  success: boolean
  observation_id: string
  error?: string
  output_dir?: string
  observation_path?: string
  report_path?: string
  gate_decision?: string
}

export type ObservationSubmitter = (
  observation: IntakeObservation
) => Promise<ZhinengBridgeSubmission> | ZhinengBridgeSubmission

export class ZhinengBridgeClient {
  private readonly submitted: IntakeObservation[] = []

  constructor(private readonly submitter?: ObservationSubmitter) {}

  buildDesktopObservation(input: DesktopObservationInput): IntakeObservation {
    const capturedAt = input.capturedAt ?? new Date().toISOString()
    const screenshotHash = input.screenshotHash ?? hashScreenshot(input.screenshot)
    const observationId = `intake_obs_sightflow_${input.appType}_${screenshotHash.slice(-12)}`

    return {
      observation_id: observationId,
      source_adapter_id: input.sourceAdapterId ?? `sightflow_desktop.${input.appType}`,
      source_type: 'desktop',
      platform: input.appType,
      captured_at: capturedAt,
      content_summary:
        input.contentSummary ?? 'Desktop bridge captured the current chat window.',
      participants_hint: input.participantsHint ?? ['user', 'unknown_counterparty'],
      source_identity_hints: input.sourceIdentityHints ?? [],
      thread_hint: input.threadHint ?? {
        channel: input.appType,
        source: 'sightflow_desktop'
      },
      window_ref: input.windowRef ?? {
        app_type: input.appType,
        capture_strategy: 'sightflow_bridge'
      },
      raw_artifact_refs: [],
      screenshot_hash: screenshotHash,
      privacy_level: 'summary_only',
      confidence: input.confidence ?? 0.75,
      metadata: {
        bridge_mode: 'zhineng_bridge',
        backend_processing_owner: 'zhineng_logic_system',
        sightflow_capability_scope: ['desktop_recognition', 'controlled_reply_shell'],
        sightflow_backend_processing_allowed: false,
        logic_system_handoff_required: true,
        provider_reply_allowed: false,
        read_only_capture: true,
        real_execution_allowed: false,
        real_send_attempted: false,
        screenshot_length: input.screenshot.length,
        ...(input.metadata ?? {})
      }
    }
  }

  async submitObservation(observation: IntakeObservation): Promise<ZhinengBridgeSubmission> {
    this.submitted.push(observation)
    if (this.submitter) {
      return this.submitter(observation)
    }
    return {
      success: true,
      observation_id: observation.observation_id
    }
  }

  getSubmittedObservations(): IntakeObservation[] {
    return [...this.submitted]
  }
}

function hashScreenshot(screenshot: string): string {
  return `sha256:${createHash('sha256').update(screenshot).digest('hex')}`
}
