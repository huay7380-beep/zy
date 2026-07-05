import { DesktopDevice } from './device'
import { AppType } from './rpa/types'
import { ChannelContext, ChannelSession, SessionEvent } from './session-types'
import { ZhinengBridgeClient } from './zhineng-bridge-client'

export interface ZhinengBridgeState {
  measuredAt: number | null
  latestObservationId: string | null
}

export function createInitialZhinengBridgeState(): ZhinengBridgeState {
  return {
    measuredAt: null,
    latestObservationId: null
  }
}

export class ZhinengBridgeSession implements ChannelSession<ZhinengBridgeState> {
  constructor(
    private readonly device: DesktopDevice,
    private readonly bridgeClient: ZhinengBridgeClient
  ) {}

  async onStart(ctx: ChannelContext<ZhinengBridgeState>): Promise<void> {
    this.device.setAppType(ctx.appType)
    this.device.clearChatBaseline()
    await this.device.onSessionStart?.()
    ctx.host.enqueue({ type: 'bootstrap' })
  }

  async onStop(ctx: ChannelContext<ZhinengBridgeState>): Promise<void> {
    this.device.clearChatBaseline()
    await this.device.onSessionStop?.()
    ctx.state.measuredAt = null
    ctx.state.latestObservationId = null
  }

  async onEvent(event: SessionEvent, ctx: ChannelContext<ZhinengBridgeState>): Promise<void> {
    this.device.setAppType(ctx.appType)

    switch (event.type) {
      case 'bootstrap': {
        ctx.host.log('thinking', 'zhineng_bridge 正在识别聊天窗口布局...')
        const result = await this.device.measureLayout()
        if (!result.success) {
          ctx.host.log('error', `${result.error || '界面识别失败'}，bridge 无法启动`)
          await ctx.host.stopSession('bridge_bootstrap_failed')
          return
        }
        ctx.state.measuredAt = Date.now()
        ctx.host.enqueue({ type: 'observe_chat' })
        break
      }

      case 'observe_chat': {
        const observation = await this.captureObservation(ctx.appType)
        const submission = await this.bridgeClient.submitObservation(observation)
        if (!submission.success) {
          ctx.host.log('error', submission.error || 'bridge observation 提交失败')
          return
        }
        ctx.state.latestObservationId = observation.observation_id
        ctx.host.log('skip', `bridge observation 已提交：${observation.observation_id}`)
        await this.device.setChatBaseline()
        break
      }

      case 'provider.reply_text':
        ctx.host.log('skip', 'zhineng_bridge 已阻断 Provider reply_text 直接发送')
        break

      case 'provider.thinking':
        ctx.host.log('thinking', event.content)
        break

      case 'provider.skip':
        ctx.host.log('skip', 'bridge provider skip')
        break

      case 'provider.error':
        ctx.host.log('error', event.error)
        break

      case 'check_unread':
      case 'wait_retry':
        ctx.host.log('skip', 'zhineng_bridge 当前仅接收当前会话，不自动切换未读会话')
        break
    }
  }

  private async captureObservation(appType: AppType) {
    const screenshot = await this.device.screenshot()
    return this.bridgeClient.buildDesktopObservation({
      screenshot,
      appType,
      metadata: {
        capture_source: 'ZhinengBridgeSession'
      }
    })
  }
}

