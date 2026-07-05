import assert from 'node:assert/strict'
import { DesktopDevice } from '../../device'
import { ZhinengBridgeSession, createInitialZhinengBridgeState } from '../../zhineng-bridge-session'
import { ZhinengBridgeClient } from '../../zhineng-bridge-client'
import { ChannelContext, SessionEvent } from '../../session-types'
import { AppType } from '../types'

class BridgeTestDevice implements DesktopDevice {
  sentMessages: string[] = []
  appType: AppType = 'wechat'

  setAppType(appType: AppType): void {
    this.appType = appType
  }

  setApiKey(_apiKey: string): void {}

  async measureLayout(): Promise<{ success: boolean; error?: string }> {
    return { success: true }
  }

  async screenshot(): Promise<string> {
    return 'data:image/png;base64,bridge-test'
  }

  async hasUnreadMessage(): Promise<{ hasUnread: boolean }> {
    return { hasUnread: false }
  }

  async isChatContactUnread(): Promise<{ isUnread: boolean }> {
    return { isUnread: false }
  }

  clearUnreadCache(): void {}

  async setChatBaseline(): Promise<boolean> {
    return true
  }

  async hasChatAreaChanged(): Promise<{ hasDiff: boolean; hasBaseline: boolean }> {
    return { hasDiff: false, hasBaseline: true }
  }

  clearChatBaseline(): void {}

  async sendMessage(text: string): Promise<void> {
    this.sentMessages.push(text)
  }

  async activeUnreadByClick(_coordinates: [number, number]): Promise<void> {}

  async clickUnreadContact(_coordinates: [number, number]): Promise<void> {}

  async clickAt(_x: number, _y: number): Promise<void> {}
}

export async function runBridgeObservationTest() {
  console.log('[Test] Running zhineng_bridge observation atom...')
  const device = new BridgeTestDevice()
  const bridgeClient = new ZhinengBridgeClient()
  const session = new ZhinengBridgeSession(device, bridgeClient)
  const state = createInitialZhinengBridgeState()
  const queue: SessionEvent[] = []
  const logs: Array<{ type: string; content: string }> = []
  let running = true

  const ctx: ChannelContext<typeof state> = {
    appType: 'wechat',
    state,
    host: {
      enqueue: (event) => queue.push(event),
      schedule: (event) => queue.push(event),
      runProvider: async function* () {},
      log: (type, content) => logs.push({ type, content }),
      isRunning: () => running,
      stopSession: async () => {
        running = false
      }
    }
  }

  await session.onStart(ctx)
  while (queue.length) {
    const event = queue.shift()
    if (event) await session.onEvent(event, ctx)
  }

  assert.equal(bridgeClient.getSubmittedObservations().length, 1)
  assert.equal(bridgeClient.getSubmittedObservations()[0].source_adapter_id, 'sightflow_desktop.wechat')
  assert.equal(state.latestObservationId, bridgeClient.getSubmittedObservations()[0].observation_id)

  await session.onEvent({ type: 'provider.reply_text', content: '不应直接发送' }, ctx)
  assert.equal(device.sentMessages.length, 0)
  assert.ok(logs.some((item) => item.content.includes('阻断 Provider reply_text')))

  console.log('✅ zhineng_bridge observation submitted and direct provider send blocked')
}

