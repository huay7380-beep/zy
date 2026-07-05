import assert from 'node:assert/strict'
import { DesktopDevice } from '../../device'
import { DesktopSendExecutor } from '../../desktop-send-executor'
import { OutboundSendCommand } from '../../send-command-types'
import { AppType } from '../types'

class ControlledSendDevice implements DesktopDevice {
  sentMessages: string[] = []
  appType: AppType = 'wechat'

  setAppType(appType: AppType): void {
    this.appType = appType
  }

  setApiKey(_apiKey: string): void {}
  async measureLayout(): Promise<{ success: boolean; error?: string }> { return { success: true } }
  async screenshot(): Promise<string> { return 'data:image/png;base64,controlled-send-test' }
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

function controlledCommand(): OutboundSendCommand {
  return {
    send_command_id: 'send_command_bridge_controlled_001',
    event_id: 'intake_obs_bridge_controlled_001',
    decision_id: 'decision_bridge_controlled_001',
    trigger_id: 'trigger_bridge_controlled_001',
    target_platform: 'wechat',
    target_person_id: 'person_controlled_test',
    target_thread_hint: {
      channel: 'wechat',
      conversation_title: '受控测试窗口',
      target_display_name: '受控测试窗口'
    },
    message_draft: '受控发送测试：仅允许在测试窗口中发送这一条草稿。',
    requires_user_confirmation: true,
    user_confirmed: true,
    real_execution_allowed: true,
    safety_checks: {
      window_matches: true,
      thread_matches: true,
      draft_matches: true,
      permission_granted: true,
      notes: ['controlled-send atom uses a fake desktop device; no real platform is touched']
    },
    created_at: new Date().toISOString(),
    metadata: {
      test_scope: 'fake_desktop_device_only'
    }
  }
}

export async function runControlledSendTest() {
  console.log('[Test] Running zhineng_bridge controlled send atom...')
  const device = new ControlledSendDevice()
  const executor = new DesktopSendExecutor(device)

  const unsafeCommand = controlledCommand()
  unsafeCommand.user_confirmed = false
  const unsafe = await executor.execute(unsafeCommand, { dryRun: false })

  assert.equal(unsafe.status, 'blocked')
  assert.equal(unsafe.metadata?.real_send_attempted, false)
  assert.equal(device.sentMessages.length, 0)
  assert.ok(unsafe.blocked_reason?.includes('user_confirmation_missing'))

  const sent = await executor.execute(controlledCommand(), { dryRun: false })

  assert.equal(sent.status, 'sent')
  assert.equal(sent.metadata?.real_send_attempted, true)
  assert.equal(sent.metadata?.audit_event_required, true)
  assert.equal(sent.metadata?.feedback_entry_required, true)
  assert.deepEqual(sent.evidence_refs, ['sightflow_desktop_sent'])
  assert.equal(device.sentMessages.length, 1)
  assert.equal(device.sentMessages[0], controlledCommand().message_draft)

  console.log('✅ zhineng_bridge controlled send atom sends only after all gates pass')
}
