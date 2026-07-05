import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const GENERIC_WECHAT_TITLES = new Set(['微信', 'WeChat', 'Weixin', 'wechat', 'weixin'])

export type OcrBlock = {
  block_id: string
  text: string
  normalized_text: string
  artifact_ref: string
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
}

export type WindowsOcrResult = {
  engine: 'windows_media_ocr'
  language: string | null
  succeeded: boolean
  error?: string
  blocks: OcrBlock[]
}

export type WechatOcrObservationFields = {
  targetDisplayName: string | null
  chatText: string | null
  contentText: string | null
  contentSummary: string | null
  participantsHint: string[]
  sourceIdentityHints: Array<Record<string, unknown>>
  threadHint: Record<string, unknown>
  sourceActorType: 'human_contact' | 'unknown'
  confidence: number
}

export function normalizeOcrText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripLikelyOcrNoise(value: string): string {
  return value
    .replace(/^[0-9\s"'“”·.,，。:：;；|/\\\-_=+]+(?=[\u4e00-\u9fa5A-Za-z])/u, '')
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9_·.\-\s]/gu, '')
    .replace(/\s+/g, '')
    .trim()
}

export function inferWechatDisplayNameFromOcr(titleText: string | null | undefined): string | null {
  const raw = normalizeOcrText(titleText)
  const leadingName = raw.match(/^[^\u4e00-\u9fa5A-Za-z·]*([\u4e00-\u9fa5A-Za-z·]{2,12})(?=\s|\d|$)/u)?.[1]
  const normalized = stripLikelyOcrNoise(leadingName ?? raw)
  if (!normalized || normalized.length > 24) return null
  if (GENERIC_WECHAT_TITLES.has(normalized)) return null
  return normalized
}

function meaningfulChatText(value: string | null | undefined, targetDisplayName: string | null): string | null {
  const normalized = normalizeOcrText(value)
  if (!normalized) return null
  const withoutTarget = targetDisplayName
    ? normalized.replaceAll(targetDisplayName, '')
    : normalized
  const signalText = withoutTarget
    .replace(/[0-2]?\d\s*[:：]\s*\d{2}/g, '')
    .replace(/\b\d+\b/g, '')
    .replace(/[昨今明后]天/g, '')
    .replace(/[下上]午/g, '')
    .replace(/[^\u4e00-\u9fa5A-Za-z]/gu, '')
    .replace(/[天下卫]/g, '')
  return signalText.length >= 2 ? normalized : null
}

function powerShellSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function buildWechatOcrObservationFields({
  ocr,
  screenshotPath,
  fallbackWindowTitle
}: {
  ocr: WindowsOcrResult | null
  screenshotPath: string
  fallbackWindowTitle: string | null
}): WechatOcrObservationFields {
  const titleBlock = ocr?.blocks.find((block) => block.block_id === 'title')
  const chatBlock = ocr?.blocks.find((block) => block.block_id === 'chat')
  const fullBlock = ocr?.blocks.find((block) => block.block_id === 'right_pane')
  const ocrTitle = inferWechatDisplayNameFromOcr(titleBlock?.normalized_text)
    ?? inferWechatDisplayNameFromOcr(fullBlock?.normalized_text)
  const fallbackTitle = inferWechatDisplayNameFromOcr(fallbackWindowTitle)
  const targetDisplayName = ocrTitle ?? fallbackTitle
  const chatText = meaningfulChatText(chatBlock?.normalized_text, targetDisplayName)
    ?? meaningfulChatText(fullBlock?.normalized_text, targetDisplayName)
  const hasContent = Boolean(chatText || targetDisplayName)
  const contentText = hasContent
    ? [
        targetDisplayName ? `OCR标题区：${targetDisplayName}。` : null,
        chatText ? `OCR聊天区：${chatText}` : null
      ].filter(Boolean).join('')
    : null
  const contentSummary = hasContent
    ? `PC WeChat window captured as a real read-only intake artifact. Windows OCR detected ${targetDisplayName ? `current conversation target ${targetDisplayName}` : 'visible chat text'}${chatText ? ' and visible chat text' : '; visible chat text was not reliable enough to use'}; OCR output still requires user review before identity or relationship confirmation.`
    : 'PC WeChat window captured as a real read-only intake artifact. OCR did not return usable visible chat text.'
  const sourceActorType = targetDisplayName ? 'human_contact' : 'unknown'
  const participantsHint = targetDisplayName ? ['user', targetDisplayName] : ['user', 'unknown_counterparty']
  const threadHint: Record<string, unknown> = {
    channel: 'wechat',
    conversation_title: targetDisplayName ?? fallbackWindowTitle,
    target_display_name: targetDisplayName,
    thread_source: targetDisplayName ? 'windows_ocr_title_region' : 'wechat_window_title'
  }
  if (targetDisplayName) threadHint.thread_key = `wechat:${targetDisplayName}`
  const sourceIdentityHints = targetDisplayName
    ? [
        {
          identity_type: 'thread_display_name',
          source_actor_type: 'human_contact',
          display_name: targetDisplayName,
          thread_key: `wechat:${targetDisplayName}`,
          evidence_ref: titleBlock?.artifact_ref ?? screenshotPath,
          confidence: ocrTitle ? 0.68 : 0.42
        }
      ]
    : []

  return {
    targetDisplayName,
    chatText,
    contentText,
    contentSummary,
    participantsHint,
    sourceIdentityHints,
    threadHint,
    sourceActorType,
    confidence: chatText ? 0.78 : targetDisplayName ? 0.74 : 0.72
  }
}

export function runWindowsOcrForWechatScreenshot({
  screenshotPath,
  outputDir
}: {
  screenshotPath: string
  outputDir: string
}): WindowsOcrResult | null {
  if (process.platform !== 'win32' || !existsSync(screenshotPath)) return null
  const sourcePathLiteral = powerShellSingleQuoted(screenshotPath)
  const ocrDirLiteral = powerShellSingleQuoted(path.join(outputDir, 'ocr'))

  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.FileAccessMode, Windows.Storage, ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1)
function AwaitTyped($AsyncOperation, [Type]$ResultType) {
  $asTask = $script:asTaskGeneric.MakeGenericMethod($ResultType)
  $task = $asTask.Invoke($null, @($AsyncOperation))
  $task.Wait() | Out-Null
  $task.Result
}
function OcrImage($imagePath) {
  $file = AwaitTyped ([Windows.Storage.StorageFile]::GetFileFromPathAsync($imagePath)) ([Windows.Storage.StorageFile])
  $stream = AwaitTyped ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = AwaitTyped ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = AwaitTyped ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($null -eq $engine) { throw 'Windows OCR engine is unavailable.' }
  $result = AwaitTyped ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  [ordered]@{
    text = $result.Text
    language = $engine.RecognizerLanguage.LanguageTag
  }
}
function SaveCrop($source, $name, $x, $y, $w, $h) {
  $rect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
  $crop = $source.Clone($rect, $source.PixelFormat)
  $path = Join-Path $ocrDir ($name + '.png')
  $crop.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $crop.Dispose()
  $path
}
$sourcePath = ${sourcePathLiteral}
$ocrDir = ${ocrDirLiteral}
New-Item -ItemType Directory -Force -Path $ocrDir | Out-Null
$image = [System.Drawing.Bitmap]::FromFile($sourcePath)
try {
  $width = $image.Width
  $height = $image.Height
  $rightX = [Math]::Max(0, [int]($width * 0.28))
  $rightWidth = $width - $rightX
  $titleHeight = [Math]::Min(150, [Math]::Max(90, [int]($height * 0.14)))
  $chatY = $titleHeight
  $chatHeight = [Math]::Max(80, $height - $chatY - [Math]::Min(70, [int]($height * 0.11)))
  $blocks = @(
    [ordered]@{ block_id = 'title'; path = (SaveCrop $image 'title' $rightX 0 $rightWidth $titleHeight); bounds = [ordered]@{ x = $rightX; y = 0; width = $rightWidth; height = $titleHeight } },
    [ordered]@{ block_id = 'chat'; path = (SaveCrop $image 'chat' $rightX $chatY $rightWidth $chatHeight); bounds = [ordered]@{ x = $rightX; y = $chatY; width = $rightWidth; height = $chatHeight } },
    [ordered]@{ block_id = 'right_pane'; path = (SaveCrop $image 'right-pane' $rightX 0 $rightWidth $height); bounds = [ordered]@{ x = $rightX; y = 0; width = $rightWidth; height = $height } }
  )
} finally {
  $image.Dispose()
}
$language = $null
$results = foreach ($block in $blocks) {
  $ocr = OcrImage $block.path
  if ($ocr.language) { $language = $ocr.language }
  [ordered]@{
    block_id = $block.block_id
    text = $ocr.text
    artifact_ref = $block.path
    bounds = $block.bounds
  }
}
[ordered]@{
  engine = 'windows_media_ocr'
  language = $language
  succeeded = $true
  blocks = @($results)
} | ConvertTo-Json -Depth 12 -Compress
`

  try {
    const stdout = execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script
    ], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true
    })
    const jsonLine = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
    if (!jsonLine) throw new Error('Windows OCR returned no JSON payload')
    const parsed = JSON.parse(jsonLine) as WindowsOcrResult
    return {
      ...parsed,
      blocks: (parsed.blocks ?? []).map((block) => ({
        ...block,
        normalized_text: normalizeOcrText(block.text)
      }))
    }
  } catch (err: any) {
    return {
      engine: 'windows_media_ocr',
      language: null,
      succeeded: false,
      error: err?.message || String(err),
      blocks: []
    }
  }
}
