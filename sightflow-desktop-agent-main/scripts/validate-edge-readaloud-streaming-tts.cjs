const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const tls = require('node:tls')

const repoRoot = path.resolve(__dirname, '..')
const outputDir = path.join(repoRoot, 'runtime', 'voice-loop-probes')
const trustedClientToken = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const defaultChromiumFullVersion = '143.0.3650.75'
const defaultText = '\u6211\u6b63\u5728\u68c0\u67e5\u5f53\u524d\u72b6\u6001\u3002'

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]
  return fallback
}

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 17)
}

function chromiumMajor(version) {
  return String(version).split('.')[0] || '143'
}

function buildSecMsGec(version = defaultChromiumFullVersion) {
  const windowsEpochSeconds = 11644473600
  let trustedSeconds = Date.now() / 1000 + windowsEpochSeconds
  trustedSeconds -= trustedSeconds % 300
  const ticks = Math.floor(trustedSeconds * 10_000_000)
  return {
    value: crypto.createHash('sha256').update(`${ticks}${trustedClientToken}`, 'ascii').digest('hex').toUpperCase(),
    version: `1-${version}`
  }
}

function browserTimestamp() {
  return new Date().toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)')
}

function escapeSsml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildClientTextFrame(text) {
  const payload = Buffer.from(text, 'utf8')
  let header
  if (payload.length < 126) {
    header = Buffer.from([0x81, 0x80 | payload.length])
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 0x80 | 126
    header.writeUInt16BE(payload.length, 2)
  } else {
    throw new Error('WebSocket frame too large for this validator.')
  }

  const mask = crypto.randomBytes(4)
  const frame = Buffer.alloc(header.length + mask.length + payload.length)
  header.copy(frame, 0)
  mask.copy(frame, header.length)
  for (let index = 0; index < payload.length; index += 1) {
    frame[header.length + mask.length + index] = payload[index] ^ mask[index % mask.length]
  }
  return frame
}

function parseWebSocketFrames(buffer, onFrame) {
  let cursor = 0
  while (buffer.length - cursor >= 2) {
    const b0 = buffer[cursor]
    const b1 = buffer[cursor + 1]
    const opcode = b0 & 0x0f
    let length = b1 & 0x7f
    let offset = cursor + 2
    if (length === 126) {
      if (buffer.length - offset < 2) break
      length = buffer.readUInt16BE(offset)
      offset += 2
    } else if (length === 127) {
      if (buffer.length - offset < 8) break
      const bigLength = buffer.readBigUInt64BE(offset)
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Unsupported large WebSocket frame.')
      length = Number(bigLength)
      offset += 8
    }

    let mask
    if (b1 & 0x80) {
      if (buffer.length - offset < 4) break
      mask = buffer.subarray(offset, offset + 4)
      offset += 4
    }

    if (buffer.length - offset < length) break
    const payload = Buffer.from(buffer.subarray(offset, offset + length))
    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % mask.length]
      }
    }
    onFrame({ opcode, payload })
    cursor = offset + length
  }

  return buffer.subarray(cursor)
}

function buildHandshakeRequest({ host, requestPath, chromiumVersion }) {
  const key = crypto.randomBytes(16).toString('base64')
  const major = chromiumMajor(chromiumVersion)
  const userAgent =
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
    `(KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`

  return [
    `GET ${requestPath} HTTP/1.1`,
    `Host: ${host}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
    'Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    `User-Agent: ${userAgent}`,
    'Pragma: no-cache',
    'Cache-Control: no-cache',
    `Cookie: muid=${crypto.randomBytes(16).toString('hex').toUpperCase()};`,
    '',
    ''
  ].join('\r\n')
}

function buildSpeechConfig(outputFormat) {
  return (
    `X-Timestamp:${browserTimestamp()}\r\n` +
    'Content-Type:application/json; charset=utf-8\r\n' +
    'Path:speech.config\r\n\r\n' +
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: 'false',
              wordBoundaryEnabled: 'false'
            },
            outputFormat
          }
        }
      }
    }) +
    '\r\n'
  )
}

function buildSsmlMessage({ text, voice, locale }) {
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${locale}'>` +
    `<voice name='${voice}'>${escapeSsml(text)}</voice></speak>`

  return (
    `X-RequestId:${crypto.randomUUID().replace(/-/g, '')}\r\n` +
    'Content-Type:application/ssml+xml\r\n' +
    `X-Timestamp:${browserTimestamp()}\r\n` +
    'Path:ssml\r\n\r\n' +
    ssml
  )
}

function synthesizeEdgeReadAloudStream(options) {
  return new Promise((resolve, reject) => {
    const generatedAt = new Date().toISOString()
    const startedAt = Date.now()
    const secMsGec = buildSecMsGec(options.chromiumVersion)
    const host = 'speech.platform.bing.com'
    const connectionId = crypto.randomUUID().replace(/-/g, '')
    const requestPath =
      `/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${trustedClientToken}` +
      `&ConnectionId=${connectionId}&Sec-MS-GEC=${secMsGec.value}&Sec-MS-GEC-Version=${secMsGec.version}`
    const audioFrames = []
    let firstAudioMs
    let finalFrameCount = 0
    let turnEnded = false
    let buffer = Buffer.alloc(0)
    let handshaken = false
    let settled = false

    const socket = tls.connect(443, host, { servername: host })
    const cleanup = () => {
      clearTimeout(timeout)
      settled = true
      try {
        socket.destroy()
      } catch {
        // Best-effort cleanup only.
      }
    }
    const fail = (error) => {
      if (settled) return
      cleanup()
      reject(error)
    }
    const complete = () => {
      if (settled) return
      cleanup()
      resolve({
        generated_at: generatedAt,
        first_audio_payload_ms: firstAudioMs,
        total_stream_ms: Date.now() - startedAt,
        audio_frame_count: audioFrames.length,
        audio_bytes: audioFrames.reduce((total, item) => total + item.length, 0),
        final_frame_count: finalFrameCount,
        native_streaming_supported: audioFrames.length > 1,
        audio_base64: Buffer.concat(audioFrames).toString('base64')
      })
    }
    const timeout = setTimeout(() => {
      fail(new Error(`Edge Read Aloud streaming TTS timed out after ${options.timeoutMs}ms.`))
    }, options.timeoutMs)

    socket.on('secureConnect', () => {
      socket.write(buildHandshakeRequest({ host, requestPath, chromiumVersion: options.chromiumVersion }))
    })

    socket.on('data', (chunk) => {
      if (settled) return
      buffer = Buffer.concat([buffer, chunk])

      if (!handshaken) {
        const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'))
        if (headerEnd < 0) return
        const header = buffer.subarray(0, headerEnd).toString('utf8')
        if (!header.startsWith('HTTP/1.1 101')) {
          fail(new Error(`Edge Read Aloud WebSocket handshake failed: ${header.split('\r\n')[0]}`))
          return
        }
        handshaken = true
        buffer = buffer.subarray(headerEnd + 4)
        socket.write(buildClientTextFrame(buildSpeechConfig(options.outputFormat)))
        socket.write(buildClientTextFrame(buildSsmlMessage(options)))
      }

      buffer = parseWebSocketFrames(buffer, ({ opcode, payload }) => {
        if (opcode === 1) {
          const text = payload.toString('utf8')
          if (text.includes('Path:turn.end')) {
            turnEnded = true
            complete()
          }
          return
        }

        if (opcode !== 2 || payload.length < 2) return
        const headerLength = payload.readUInt16BE(0)
        if (payload.length < 2 + headerLength) return
        const frameHeader = payload.subarray(2, 2 + headerLength).toString('utf8')
        const frameBody = payload.subarray(2 + headerLength)
        if (!frameHeader.includes('Path:audio')) return
        if (frameBody.length === 0) {
          finalFrameCount += 1
          return
        }
        firstAudioMs ??= Date.now() - startedAt
        audioFrames.push(Buffer.from(frameBody))
      })
    })

    socket.on('error', fail)
    socket.on('end', () => {
      if (!settled && turnEnded) complete()
    })
  })
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  const voice = argValue('--voice', process.env.SIGHTFLOW_EDGE_TTS_VOICE || 'zh-CN-XiaoxiaoNeural')
  const locale = argValue('--locale', process.env.SIGHTFLOW_EDGE_TTS_LOCALE || 'zh-CN')
  const text = argValue('--text', process.env.SIGHTFLOW_EDGE_TTS_TEXT || defaultText)
  const outputFormat = argValue('--output-format', process.env.SIGHTFLOW_EDGE_TTS_OUTPUT_FORMAT || 'audio-24khz-48kbitrate-mono-mp3')
  const chromiumVersion = argValue('--chromium-version', process.env.SIGHTFLOW_EDGE_TTS_CHROMIUM_VERSION || defaultChromiumFullVersion)
  const timeoutMs = Number(argValue('--timeout-ms', process.env.SIGHTFLOW_EDGE_TTS_TIMEOUT_MS || '10000'))
  const interactiveFirstAudioMs = Number(argValue('--interactive-first-audio-ms', process.env.SIGHTFLOW_EDGE_TTS_INTERACTIVE_MS || '1500'))

  try {
    const result = await synthesizeEdgeReadAloudStream({
      text,
      voice,
      locale,
      outputFormat,
      chromiumVersion,
      timeoutMs
    })
    const sameVoiceProfile = voice === 'zh-CN-XiaoxiaoNeural'
    const report = {
      schema: 'status_dialogue_edge_readaloud_streaming_validation.v1',
      generated_at: result.generated_at,
      adapter_id: 'edge_readaloud_websocket',
      transport: 'websocket',
      real_service: true,
      configured: true,
      selected_candidate_interactive_ready:
        result.native_streaming_supported === true &&
        sameVoiceProfile === true &&
        typeof result.first_audio_payload_ms === 'number' &&
        result.first_audio_payload_ms <= interactiveFirstAudioMs,
      same_voice_profile: sameVoiceProfile,
      native_streaming_supported: result.native_streaming_supported,
      first_audio_payload_ms: result.first_audio_payload_ms,
      interactive_first_audio_ms: interactiveFirstAudioMs,
      total_stream_ms: result.total_stream_ms,
      audio_frame_count: result.audio_frame_count,
      audio_bytes: result.audio_bytes,
      final_frame_count: result.final_frame_count,
      audio_mime_type: 'audio/mpeg',
      voice,
      locale,
      output_format: outputFormat,
      audio_probe_base64_prefix: result.audio_base64.slice(0, 16),
      boundary: {
        external_network_used: true,
        browser_tts_used: false,
        requirement_packet_created: false,
        world_model_written: false,
        raw_microphone_audio_saved: false
      }
    }
    const outputPath = path.join(outputDir, `edge-readaloud-streaming-validation-${compactTimestamp()}.json`)
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({ ok: true, outputPath, checks: report }, null, 2))
  } catch (error) {
    const report = {
      schema: 'status_dialogue_edge_readaloud_streaming_validation.v1',
      generated_at: new Date().toISOString(),
      adapter_id: 'edge_readaloud_websocket',
      transport: 'websocket',
      real_service: true,
      configured: true,
      selected_candidate_interactive_ready: false,
      same_voice_profile: voice === 'zh-CN-XiaoxiaoNeural',
      native_streaming_supported: false,
      error: error instanceof Error ? error.message : String(error),
      boundary: {
        external_network_used: true,
        browser_tts_used: false,
        requirement_packet_created: false,
        world_model_written: false,
        raw_microphone_audio_saved: false
      }
    }
    const outputPath = path.join(outputDir, `edge-readaloud-streaming-validation-${compactTimestamp()}.failed.json`)
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.error(JSON.stringify({ ok: false, outputPath, checks: report }, null, 2))
    process.exitCode = 1
  }
}

main()
