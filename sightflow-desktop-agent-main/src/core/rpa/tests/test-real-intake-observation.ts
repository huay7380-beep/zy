import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { desktopCapturer, screen } from 'electron'
import Store from 'electron-store'
import {
  buildWechatOcrObservationFields,
  runWindowsOcrForWechatScreenshot
} from '../ocr-utils'
import { captureWechatWindow } from '../screenshot-utils'
import {
  runSightflowVlmStructuredIntakeExtraction,
  type SightflowVlmStructuredIntakeResult
} from '../structured-vlm-intake'
import { getWechatWindowInfo } from '../window-utils'

const StoreClass = typeof Store === 'function' ? Store : ((Store as any).default as typeof Store)
const FIXED_ARK_MODEL = 'doubao-seed-2-0-lite-260215'
const FIXED_ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

const GENERIC_WECHAT_TITLES = ['微信', 'WeChat', 'Weixin']

function nowIso(): string {
  return new Date().toISOString()
}

function stripDataUrl(dataUrl: string): string {
  const marker = 'base64,'
  const index = dataUrl.indexOf(marker)
  return index >= 0 ? dataUrl.slice(index + marker.length) : dataUrl
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  return values.map((value) => String(value ?? '').trim()).find(Boolean) ?? null
}

function resolveVisionConfigForRealIntake(): { apiKey: string; model: string; baseURL: string; source: string } {
  const envApiKey = firstNonEmpty(
    process.env.SIGHTFLOW_REAL_INTAKE_VISION_API_KEY,
    process.env.SIGHTFLOW_VISION_API_KEY,
    process.env.CONTROLLED_SEND_VISION_API_KEY,
    process.env.VOLCENGINE_ARK_API_KEY,
    process.env.ARK_API_KEY
  )
  if (envApiKey) {
    return {
      apiKey: envApiKey,
      model: process.env.SIGHTFLOW_VISION_MODEL || FIXED_ARK_MODEL,
      baseURL: process.env.SIGHTFLOW_VISION_BASE_URL || FIXED_ARK_BASE_URL,
      source: 'environment'
    }
  }

  try {
    const store = new StoreClass({ name: 'settings' })
    const raw = store.store as Record<string, any>
    const apiKey = firstNonEmpty(raw?.vision?.apiKey, raw?.apiKey)
    if (apiKey) {
      return {
        apiKey,
        model: raw?.chatProvider?.config?.model || raw?.model || FIXED_ARK_MODEL,
        baseURL: raw?.chatProvider?.config?.baseURL || raw?.baseURL || FIXED_ARK_BASE_URL,
        source: 'electron_store_settings'
      }
    }
  } catch {
    // Missing settings should not block read-only capture; the fallback records the gap.
  }

  return {
    apiKey: '',
    model: FIXED_ARK_MODEL,
    baseURL: FIXED_ARK_BASE_URL,
    source: 'missing'
  }
}

function buildVlmMetadata(vlm: SightflowVlmStructuredIntakeResult | null) {
  if (!vlm) return null
  return {
    schema_version: vlm.schema_version,
    engine: vlm.engine,
    model: vlm.model,
    base_url: vlm.base_url,
    succeeded: vlm.succeeded,
    error: vlm.error,
    target_display_name: vlm.target_display_name,
    conversation_title: vlm.conversation_title,
    source_actor_type: vlm.source_actor_type,
    message_count: vlm.messages.length,
    latest_message: vlm.latest_message,
    messages: vlm.messages,
    ui_noise_removed: vlm.ui_noise_removed,
    extraction_warnings: vlm.extraction_warnings,
    requires_user_review: vlm.requires_user_review,
    raw_response_artifact_ref: vlm.raw_response_artifact_ref,
    structured_artifact_ref: vlm.structured_artifact_ref
  }
}

function safeWindowTitle(windowInfo: any): string | null {
  const window = windowInfo?.wechatWindow
  try {
    if (typeof window?.getTitle === 'function') return window.getTitle()
    if (typeof window?.title === 'string') return window.title
  } catch {
    return null
  }
  return null
}

function normalizeWechatTitle(title: string | null): string | null {
  if (!title) return null
  if (title === '寰俊') return '微信'
  return title
}

function isWechatWindowName(name: string): boolean {
  return GENERIC_WECHAT_TITLES.some((keyword) => name.includes(keyword))
}

async function captureWechatWindowSourceFallback(): Promise<{
  screenshotBase64: string
  windowTitle: string | null
  bounds: Record<string, unknown> | null
  display: Record<string, unknown> | null
}> {
  const primaryDisplay = screen.getPrimaryDisplay()
  const scaleFactor = primaryDisplay.scaleFactor || 1
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: {
      width: Math.round(primaryDisplay.bounds.width * scaleFactor),
      height: Math.round(primaryDisplay.bounds.height * scaleFactor)
    }
  })
  const source = sources.find((item) => isWechatWindowName(item.name))
  if (!source) {
    throw new Error(`WeChat window not found in desktopCapturer sources. Visible windows: ${sources.map((item) => item.name).join(', ') || 'none'}`)
  }
  if (source.thumbnail.isEmpty()) {
    throw new Error(`WeChat window thumbnail is empty: ${source.name}`)
  }
  return {
    screenshotBase64: source.thumbnail.toDataURL(),
    windowTitle: source.name,
    bounds: null,
    display: {
      id: primaryDisplay.id,
      bounds: primaryDisplay.bounds,
      scaleFactor
    }
  }
}

function captureWechatWindowWindowsGdiFallback(screenshotPath: string): {
  screenshotBuffer: Buffer
  windowTitle: string | null
  bounds: Record<string, unknown> | null
  display: Record<string, unknown> | null
  processRef: Record<string, unknown> | null
} {
  if (process.platform !== 'win32') {
    throw new Error('Windows GDI capture fallback is only available on win32')
  }

  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32SightflowGdiCapture {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
Add-Type -AssemblyName System.Drawing
$pngPath = ${JSON.stringify(screenshotPath)}
$proc = Get-Process -ErrorAction SilentlyContinue |
  Where-Object { @('Weixin', 'WeChat') -contains $_.ProcessName -and $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } |
  Select-Object -First 1
if (-not $proc) { throw 'No visible WeChat/Weixin main window found.' }
[Win32SightflowGdiCapture]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
[Win32SightflowGdiCapture]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 500
$rect = New-Object Win32SightflowGdiCapture+RECT
if (-not [Win32SightflowGdiCapture]::GetWindowRect($proc.MainWindowHandle, [ref]$rect)) { throw 'Failed to read WeChat window rect.' }
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -lt 100 -or $height -lt 100) { throw ('Invalid WeChat window bounds: ' + $width + 'x' + $height) }
$bmp = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bmp.Dispose()
[ordered]@{
  screenshotPath = $pngPath
  windowTitle = $proc.MainWindowTitle
  processName = $proc.ProcessName
  processId = $proc.Id
  bounds = [ordered]@{ x = $rect.Left; y = $rect.Top; width = $width; height = $height }
} | ConvertTo-Json -Depth 8 -Compress
`

  const stdout = execFileSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script
  ], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    windowsHide: true
  })
  const jsonLine = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
  if (!jsonLine) throw new Error('Windows GDI capture fallback returned no JSON payload')
  const payload = JSON.parse(jsonLine)
  return {
    screenshotBuffer: readFileSync(screenshotPath),
    windowTitle: normalizeWechatTitle(payload.windowTitle ?? null),
    bounds: payload.bounds ?? null,
    display: null,
    processRef: {
      process_name: payload.processName,
      process_id: payload.processId
    }
  }
}

export async function runRealIntakeObservationTest() {
  console.log('[Test] Running REAL read-only WeChat intake observation...')
  const appType = 'wechat'
  const root = process.env.ZHINENG_ROOT || path.resolve(process.cwd(), '..')
  const runId = `desktop_real_intake_${Date.now()}`
  const outputDir = path.join(root, 'runtime', 'desktop-inbox-real', runId)
  mkdirSync(outputDir, { recursive: true })
  const screenshotPath = path.join(outputDir, 'wechat-window.png')

  const windowInfo = await getWechatWindowInfo(appType)
  const captureErrors: string[] = []
  let screenshotBuffer: Buffer | null = null
  let windowTitle = normalizeWechatTitle(safeWindowTitle(windowInfo))
  let bounds = windowInfo?.bounds ?? null
  let display = windowInfo?.display ?? null
  let captureStrategy = 'unknown'
  let processRef: Record<string, unknown> | null = null

  if (windowInfo) {
    try {
      const capture = await captureWechatWindow(appType)
      if (!capture?.success || !capture.screenshotBase64) {
        throw new Error(capture?.error || 'unknown')
      }
      screenshotBuffer = Buffer.from(stripDataUrl(capture.screenshotBase64), 'base64')
      captureStrategy = 'real_window_full_capture'
    } catch (err: any) {
      captureErrors.push(`real_window_full_capture: ${err?.message || err}`)
    }
  }

  if (!screenshotBuffer) {
    try {
      const fallback = await captureWechatWindowSourceFallback()
      screenshotBuffer = Buffer.from(stripDataUrl(fallback.screenshotBase64), 'base64')
      windowTitle = normalizeWechatTitle(fallback.windowTitle)
      bounds = fallback.bounds
      display = fallback.display
      captureStrategy = 'desktop_capturer_window_source'
    } catch (err: any) {
      captureErrors.push(`desktop_capturer_window_source: ${err?.message || err}`)
    }
  }

  if (!screenshotBuffer) {
    try {
      const fallback = captureWechatWindowWindowsGdiFallback(screenshotPath)
      screenshotBuffer = fallback.screenshotBuffer
      windowTitle = fallback.windowTitle
      bounds = fallback.bounds
      display = fallback.display
      processRef = fallback.processRef
      captureStrategy = 'windows_gdi_window_rect'
    } catch (err: any) {
      captureErrors.push(`windows_gdi_window_rect: ${err?.message || err}`)
    }
  }

  if (!screenshotBuffer) {
    throw new Error(`WeChat real intake capture failed. Attempts: ${captureErrors.join(' | ')}`)
  }

  const pngBuffer = screenshotBuffer
  const screenshotHash = `sha256:${createHash('sha256').update(pngBuffer).digest('hex')}`
  writeFileSync(screenshotPath, pngBuffer)

  const capturedAt = nowIso()
  const visionConfig = resolveVisionConfigForRealIntake()
  const vlmDisabled = process.env.SIGHTFLOW_REAL_INTAKE_DISABLE_VLM === '1'
  const vlm = vlmDisabled
    ? null
    : await runSightflowVlmStructuredIntakeExtraction({
        screenshotBase64: `data:image/png;base64,${pngBuffer.toString('base64')}`,
        outputDir,
        apiKey: visionConfig.apiKey,
        model: visionConfig.model,
        baseURL: visionConfig.baseURL,
        fallbackWindowTitle: windowTitle
      })
  const useVlm = Boolean(vlm?.succeeded && (vlm.content_text || vlm.target_display_name || vlm.messages.length))
  const ocr = useVlm
    ? null
    : runWindowsOcrForWechatScreenshot({
        screenshotPath,
        outputDir
      })
  const ocrFields = useVlm
    ? null
    : buildWechatOcrObservationFields({
        ocr,
        screenshotPath,
        fallbackWindowTitle: windowTitle
      })
  const contentText = useVlm ? vlm?.content_text : ocrFields?.contentText
  const targetDisplayName = useVlm ? vlm?.target_display_name : ocrFields?.targetDisplayName
  const sourceActorType = useVlm ? vlm?.source_actor_type : ocrFields?.sourceActorType
  const contentSummary = useVlm ? vlm?.content_summary : ocrFields?.contentSummary
  const participantsHint = useVlm ? vlm?.participants_hint : ocrFields?.participantsHint
  const sourceIdentityHints = useVlm ? vlm?.source_identity_hints : ocrFields?.sourceIdentityHints
  const threadHint = useVlm ? vlm?.thread_hint : ocrFields?.threadHint
  const confidence = useVlm ? vlm?.confidence : ocrFields?.confidence
  const observation = {
    observation_id: `intake_obs_sightflow_wechat_real_${screenshotHash.slice(-12)}`,
    source_adapter_id: useVlm
      ? 'sightflow_desktop.wechat.vlm_structured'
      : ocr?.succeeded ? 'sightflow_desktop.wechat.ocr' : 'sightflow_desktop.wechat',
    source_type: 'desktop',
    platform: 'wechat',
    source_actor_type: sourceActorType ?? 'unknown',
    captured_at: capturedAt,
    ...(contentText ? { content_text: contentText } : {}),
    content_summary: contentSummary ?? 'PC WeChat window captured as a real read-only intake artifact.',
    participants_hint: participantsHint ?? ['user', 'unknown_counterparty'],
    source_identity_hints: sourceIdentityHints ?? [],
    thread_hint: threadHint ?? {
      channel: 'wechat',
      conversation_title: windowTitle,
      target_display_name: targetDisplayName,
      thread_source: 'wechat_window_title'
    },
    window_ref: {
      app_type: appType,
      window_title: windowTitle,
      target_display_name: targetDisplayName,
      ...processRef,
      bounds,
      display,
      capture_strategy: captureStrategy
    },
    raw_artifact_refs: [
      screenshotPath,
      vlm?.structured_artifact_ref,
      vlm?.raw_response_artifact_ref
    ].filter(Boolean),
    screenshot_hash: screenshotHash,
    privacy_level: contentText ? 'raw_text_allowed' : 'artifact_allowed',
    confidence: confidence ?? 0.4,
    metadata: {
      bridge_mode: 'zhineng_bridge',
      read_only_capture: true,
      real_execution_allowed: false,
      real_send_attempted: false,
      screenshot_path: screenshotPath,
      screenshot_bytes: pngBuffer.length,
      extraction_strategy: {
        primary: 'sightflow_vlm_structured',
        fallback: 'windows_media_ocr',
        selected: useVlm ? 'sightflow_vlm_structured' : 'windows_media_ocr',
        vlm_disabled: vlmDisabled,
        vision_config_source: visionConfig.source,
        vision_key_present: Boolean(visionConfig.apiKey),
        ordinary_ocr_used: !useVlm && Boolean(ocr)
      },
      vlm_structured_extraction: buildVlmMetadata(vlm),
      ocr_extraction: ocr
        ? {
            engine: ocr.engine,
            language: ocr.language,
            succeeded: ocr.succeeded,
            error: ocr.error,
            target_display_name: ocrFields?.targetDisplayName,
            chat_text_present: Boolean(ocrFields?.chatText),
            requires_user_review: true,
            blocks: ocr.blocks.map((block) => ({
              block_id: block.block_id,
              normalized_text: block.normalized_text,
              artifact_ref: block.artifact_ref,
              bounds: block.bounds
            }))
          }
        : {
            engine: 'windows_media_ocr',
            succeeded: false,
            skipped: true,
            reason: useVlm
              ? 'sightflow_vlm_structured_extraction_succeeded'
              : 'OCR is only attempted on win32 with a saved screenshot artifact.'
          },
      capture_errors: captureErrors
    }
  }

  const observationPath = path.join(outputDir, 'intake-observation.real.json')
  const summaryPath = path.join(outputDir, 'desktop-real-intake-summary.json')
  writeFileSync(observationPath, `${JSON.stringify(observation, null, 2)}\n`, 'utf8')
  writeFileSync(summaryPath, `${JSON.stringify({
    schema_version: 'desktop_real_intake_capture.v1',
    run_id: runId,
    gate_decision: existsSync(screenshotPath) ? 'desktop_real_intake_captured' : 'desktop_real_intake_failed',
    observation_path: observationPath,
    screenshot_path: screenshotPath,
    screenshot_hash: screenshotHash,
    window_title: windowTitle,
    selected_extraction_engine: useVlm ? 'sightflow_vlm_structured' : 'windows_media_ocr',
    vlm_succeeded: Boolean(vlm?.succeeded),
    vlm_error: vlm?.error,
    vlm_target_display_name: vlm?.target_display_name ?? null,
    vlm_message_count: vlm?.messages.length ?? 0,
    vlm_latest_message_speaker: vlm?.latest_message?.speaker ?? null,
    vlm_structured_artifact_ref: vlm?.structured_artifact_ref ?? null,
    vision_config_source: visionConfig.source,
    vision_key_present: Boolean(visionConfig.apiKey),
    ocr_succeeded: Boolean(ocr?.succeeded),
    ocr_target_display_name: ocrFields?.targetDisplayName ?? null,
    ocr_chat_text_present: Boolean(ocrFields?.chatText),
    bounds,
    capture_strategy: captureStrategy,
    capture_errors: captureErrors,
    real_execution_allowed: false,
    real_send_attempted: false
  }, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify({
    command: 'real-intake-observation',
    run_id: runId,
    gate_decision: 'desktop_real_intake_captured',
    observation_path: observationPath,
    screenshot_path: screenshotPath,
    screenshot_hash: screenshotHash,
    window_title: windowTitle,
    selected_extraction_engine: useVlm ? 'sightflow_vlm_structured' : 'windows_media_ocr',
    vlm_succeeded: Boolean(vlm?.succeeded),
    vlm_error: vlm?.error,
    vlm_target_display_name: vlm?.target_display_name ?? null,
    vlm_message_count: vlm?.messages.length ?? 0,
    vlm_latest_message_speaker: vlm?.latest_message?.speaker ?? null,
    vlm_structured_artifact_ref: vlm?.structured_artifact_ref ?? null,
    vision_config_source: visionConfig.source,
    vision_key_present: Boolean(visionConfig.apiKey),
    ocr_succeeded: Boolean(ocr?.succeeded),
    ocr_target_display_name: ocrFields?.targetDisplayName ?? null,
    ocr_chat_text_present: Boolean(ocrFields?.chatText),
    capture_strategy: captureStrategy,
    real_execution_allowed: false,
    real_send_attempted: false
  }, null, 2))
}
