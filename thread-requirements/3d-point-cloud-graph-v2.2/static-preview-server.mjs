import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, relative, resolve, sep } from 'node:path'

const root = resolve(process.argv[2] ?? '.')
const port = Number(process.argv[3] ?? 4177)

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.wasm', 'application/wasm'],
  ['.map', 'application/json; charset=utf-8']
])

function isInsideRoot(filePath) {
  const rel = relative(root, filePath)
  return rel === '' || (!rel.startsWith('..') && !rel.includes(`..${sep}`))
}

function resolveRequestPath(requestUrl) {
  const parsed = new URL(requestUrl ?? '/', `http://127.0.0.1:${port}`)
  const pathname = decodeURIComponent(parsed.pathname)
  const filePath = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`)
  if (!isInsideRoot(filePath)) return null
  if (!existsSync(filePath)) return null
  const stat = statSync(filePath)
  if (stat.isDirectory()) {
    const indexPath = resolve(filePath, 'index.html')
    return existsSync(indexPath) ? indexPath : null
  }
  return filePath
}

const server = createServer((request, response) => {
  const filePath = resolveRequestPath(request.url)
  if (!filePath) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }

  const contentType = mimeTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream'
  response.writeHead(200, {
    'content-type': contentType,
    'cache-control': 'no-store'
  })
  createReadStream(filePath).pipe(response)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Preview server: http://127.0.0.1:${port}/index.html`)
  console.log(`Root: ${root}`)
})
