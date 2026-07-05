const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { AIClient } = require('../src/core/ai-client.ts')

async function main() {
  const originalFetch = global.fetch
  let capturedBody

  global.fetch = async (_url, init) => {
    capturedBody = typeof init?.body === 'string' ? init.body : ''
    const encoder = new TextEncoder()
    const chunks = [
      'data: {"choices":[{"delta":{"content":"我正在"}}]}\n',
      '\ndata: {"choices":[{"delta":{"content":"检查当前状态。"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"后续会继续补充。"}}]}\n\n',
      'data: [DONE]\n\n'
    ]
    return new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
          controller.close()
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      }
    )
  }

  try {
    const client = new AIClient({
      apiKey: 'test-key',
      model: 'test-stream-model',
      baseURL: 'http://127.0.0.1:65530/api/v1',
      systemPrompt: 'stream test'
    })

    const deltas = []
    for await (const delta of client.callChatStream([
      { role: 'system', content: 'stream test' },
      { role: 'user', content: 'status' }
    ])) {
      deltas.push(delta)
    }

    const parsedBody = JSON.parse(capturedBody)
    assert.equal(parsedBody.stream, true, 'callChatStream must request stream=true.')
    assert.deepEqual(deltas, ['我正在', '检查当前状态。', '后续会继续补充。'])
    assert.equal(deltas.join(''), '我正在检查当前状态。后续会继续补充。')

    const report = {
      schema: 'ai_client_stream_validation.v1',
      generated_at: new Date().toISOString(),
      checks: {
        stream_requested: parsedBody.stream === true,
        delta_count: deltas.length,
        recombined_text: deltas.join(''),
        model: parsedBody.model
      }
    }

    const outputDir = path.resolve(__dirname, '..', 'runtime', 'voice-loop-probes')
    fs.mkdirSync(outputDir, { recursive: true })
    const outputPath = path.join(outputDir, `ai-client-stream-validation-${Date.now()}.json`)
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({ ok: true, outputPath, checks: report.checks }, null, 2))
  } finally {
    global.fetch = originalFetch
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
