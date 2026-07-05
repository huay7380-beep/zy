import assert from 'node:assert/strict'
import { DesktopDevice } from '../../device'
import { DesktopSendExecutor } from '../../desktop-send-executor'
import { OutboundSendCommand } from '../../send-command-types'
import { AppType } from '../types'

class SendDryRunDevice implements DesktopDevice {
  sentMessages: string[] = []
  appType: AppType = 'wechat'

  setAppType(appType: AppType): void {
    this.appType = appType
  }

  setApiKey(_apiKey: string): void {}
  async measureLayout(): Promise<{ success: boolean; error?: string }> { return { success: true } }
  async screenshot(): Promise<string> { return 'data:image/png;base64,send-test' }
  async hasUnreadMessage(): Promise<{ hasUnread: boolean }> { return { hasUnread: false } }
  async isChatContactUnread(): Promise<{ isUnread: boolean }> { return { isUnread: false } }
  clearUnreadCache(): void {}
  async setChatBaseline(): Promise<boolean> { return true }
  async hasChatAreaChanged(): Promise<{ hasDiff: boolean; hasBaseline: boolean }> {
    return { hasDiff: false, hasBaseline: true }
  }
  clearChatBaseline(): void {}
  async sendMessage(text: string): Promise<void> { this.sentMessages.push(text) }
  async activeUnreadByClick(_coordinates: [number, number]): Promise<void> {}
  async clickUnreadContact(_coordinates: [number, number]): Promise<void> {}
  async clickAt(_x: number, _y: number): Promise<void> {}
}

function sampleCommand(): OutboundSendCommand {
  return {
    send_command_id: 'send_command_bridge_test_001',
    event_id: 'intake_obs_bridge_test_001',
    decision_id: 'decision_bridge_test_001',
    trigger_id: 'trigger_bridge_test_001',
    target_platform: 'wechat',
    target_person_id: 'person_client_a',
    target_thread_hint: {
      channel: 'wechat',
      conversation_title: '张总'
    },
    message_draft: '张总，明天下午可以先看接口清单。',
    requires_user_confirmation: true,
    user_confirmed: false,
    real_execution_allowed: false,
    safety_checks: {
      window_matches: true,
      thread_matches: true,
      draft_matches: true,
      permission_granted: false
    },
    created_at: new Date().toISOString()
  }
}

export async function runSendDryRunTest() {
  console.log('[Test] Running zhineng_bridge send dry-run atom...')
  const device = new SendDryRunDevice()
  const executor = new DesktopSendExecutor(device)
  const blocked = await executor.execute(sampleCommand(), { dryRun: true })

  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.metadata?.real_send_attempted, false)
  assert.equal(device.sentMessages.length, 0)
  assert.ok(blocked.blocked_reason?.includes('real_execution_not_allowed'))

  const previewCommand = sampleCommand()
  previewCommand.user_confirmed = true
  previewCommand.real_execution_allowed = true
  previewCommand.safety_checks.permission_granted = true
  const previewed = await executor.execute(previewCommand, { dryRun: true })

  assert.equal(previewed.status, 'previewed')
  assert.equal(previewed.metadata?.real_send_attempted, false)
  assert.equal(device.sentMessages.length, 0)

  console.log('✅ zhineng_bridge send dry-run blocked unsafe command and previewed safe command')
}

