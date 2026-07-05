import { AppType } from './rpa/types'

export type SourceType = 'desktop' | 'browser' | 'api' | 'file' | 'ocr' | 'webhook'
export type PrivacyLevel = 'summary_only' | 'redacted_text' | 'raw_text_allowed' | 'artifact_allowed'
export type SendResultStatus = 'blocked' | 'previewed' | 'sent' | 'failed'

export interface SourceIdentityHint {
  identity_type?: string
  display_name?: string
  handle?: string
  value_hash?: string
  organization_hint?: string
  thread_key?: string
  evidence_ref?: string
  confidence?: number
  metadata?: Record<string, unknown>
}

export interface IntakeObservation {
  observation_id: string
  source_adapter_id: string
  source_type: SourceType
  platform: string
  captured_at: string
  content_text?: string
  content_summary: string
  participants_hint?: string[]
  source_identity_hints?: SourceIdentityHint[]
  thread_hint?: Record<string, unknown>
  window_ref?: Record<string, unknown>
  raw_artifact_refs?: string[]
  screenshot_hash?: string
  privacy_level: PrivacyLevel
  confidence: number
  metadata?: Record<string, unknown>
}

export interface OutboundSendCommand {
  send_command_id: string
  event_id: string
  decision_id: string
  trigger_id: string
  target_platform: AppType | string
  target_person_id?: string | null
  target_thread_hint: Record<string, unknown>
  message_draft: string
  requires_user_confirmation: boolean
  user_confirmed: boolean
  real_execution_allowed: boolean
  safety_checks: {
    window_matches?: boolean
    thread_matches?: boolean
    draft_matches?: boolean
    permission_granted?: boolean
    notes?: string[]
  }
  created_at: string
  metadata?: Record<string, unknown>
}

export interface OutboundSendResult {
  send_result_id: string
  send_command_id: string
  status: SendResultStatus
  blocked_reason?: string
  target_verification: Record<string, unknown>
  executed_at: string
  evidence_refs: string[]
  metadata?: Record<string, unknown>
}

export interface DesktopObservationInput {
  screenshot: string
  appType: AppType
  sourceAdapterId?: string
  contentSummary?: string
  capturedAt?: string
  participantsHint?: string[]
  sourceIdentityHints?: SourceIdentityHint[]
  threadHint?: Record<string, unknown>
  windowRef?: Record<string, unknown>
  screenshotHash?: string
  confidence?: number
  metadata?: Record<string, unknown>
}
