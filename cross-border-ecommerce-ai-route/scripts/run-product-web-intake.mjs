import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { basename, join } from 'node:path'
import { ensureDir, nowIso, projectRoot, writeJson } from './cross-border-stage-control-lib.mjs'

const jobRoot = join(projectRoot, 'runtime', 'growth-sales-automation', 'product-web-intake')

function parseArgs(argv) {
  return Object.fromEntries(argv.slice(2).map((arg) => {
    const cleaned = arg.replace(/^--/, '')
    const index = cleaned.indexOf('=')
    if (index === -1) return [cleaned, true]
    return [cleaned.slice(0, index), cleaned.slice(index + 1)]
  }))
}

function safeJobId(value) {
  const raw = String(value || '').trim() || `web-intake-${Date.now()}`
  const safe = raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!/^[a-z0-9][a-z0-9._-]{1,100}$/.test(safe)) throw new Error(`Unsafe job id: ${raw}`)
  return safe
}

function normalizeUrl(input) {
  const value = String(input || '').trim()
  if (!value) throw new Error('Missing --url')
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`
  const parsed = new URL(withProtocol)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`Unsupported protocol: ${parsed.protocol}`)
  return parsed.toString()
}

function absolutizeUrl(value, baseUrl) {
  if (!value) return null
  try {
    return new URL(value.replace(/&amp;/g, '&'), baseUrl).toString()
  } catch {
    return null
  }
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

function stripTags(value) {
  return decodeEntities(String(value || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
  return match ? decodeEntities(match[1]) : ''
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function fetchText(url, { retries = 2 } = {}) {
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await new Promise((resolve, reject) => {
        const parsed = new URL(url)
        const transport = parsed.protocol === 'http:' ? httpRequest : httpsRequest
        const req = transport({
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || undefined,
          path: `${parsed.pathname}${parsed.search}`,
          method: 'GET',
          timeout: 20000,
          headers: {
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'user-agent': 'Mozilla/5.0 product-web-intake/0.1 local-preview'
          }
        }, (res) => {
          const chunks = []
          res.on('data', (chunk) => chunks.push(chunk))
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8')
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              resolve(fetchText(new URL(res.headers.location, url).toString(), { retries: 0 }))
              return
            }
            resolve({
              url,
              status: res.statusCode,
              headers: res.headers,
              body
            })
          })
        })
        req.on('timeout', () => {
          req.destroy(new Error(`Request timed out: ${url}`))
        })
        req.on('error', reject)
        req.end()
      })
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }
  const fallback = fetchTextWithCurl(url)
  if (fallback) return fallback
  throw lastError
}

function fetchTextWithCurl(url) {
  const marker = '\n__PRODUCT_WEB_INTAKE_HTTP_STATUS__:'
  for (const command of ['curl.exe', 'curl']) {
    const result = spawnSync(command, [
      '-L',
      '--silent',
      '--show-error',
      '--max-time',
      '45',
      '--user-agent',
      'Mozilla/5.0 product-web-intake/0.1 local-preview',
      '--header',
      'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '--header',
      'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
      '--write-out',
      `${marker}%{http_code}`,
      url
    ], { encoding: 'utf8', windowsHide: true })
    if (result.error && result.error.code === 'ENOENT') continue
    if (result.status !== 0 || !result.stdout) continue
    const markerIndex = result.stdout.lastIndexOf(marker)
    const body = markerIndex === -1 ? result.stdout : result.stdout.slice(0, markerIndex)
    const status = markerIndex === -1 ? 200 : Number(result.stdout.slice(markerIndex + marker.length).trim()) || 200
    return {
      url,
      status,
      headers: { 'x-fetch-fallback': command },
      body
    }
  }
  return null
}

async function fetchRobots(origin) {
  try {
    const robotsUrl = new URL('/robots.txt', origin).toString()
    const response = await fetchText(robotsUrl, { retries: 0 })
    return {
      url: robotsUrl,
      status: response.status,
      body: response.body,
      sitemap: (response.body.match(/Sitemap:\s*(\S+)/i) || [])[1] || null,
      disallow_all_for_generic_agent: /User-agent:\s*\*\s*[\r\n]+Disallow:\s*\/\s*$/im.test(response.body)
    }
  } catch (error) {
    return {
      url: new URL('/robots.txt', origin).toString(),
      status: 'fetch_failed',
      error: error.message,
      body: '',
      sitemap: null,
      disallow_all_for_generic_agent: null
    }
  }
}

function extractTitle(html) {
  return stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '')
}

function classifyPage(url, html, title) {
  const lower = `${url} ${title} ${html.slice(0, 2000)}`.toLowerCase()
  if (lower.includes('flbook') && lower.includes('电子画册')) return 'catalog_platform_or_library'
  if (/\/brand\/\d+/i.test(url)) return 'flbook_brand_or_catalogue_page'
  if (/\/library/i.test(url)) return 'flbook_public_library_listing'
  if (/product|catalog|catalogue|shop|sku|规格|型号|材质|参数/i.test(lower)) return 'product_or_catalogue_candidate'
  return 'generic_public_page'
}

function extractLinksAndImages(html, baseUrl) {
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((match, index) => {
    const tag = match[0]
    const src = absolutizeUrl(attr(tag, 'src') || attr(tag, 'data-src') || attr(tag, 'lazy-src'), baseUrl)
    return {
      image_index: index + 1,
      image_url: src,
      alt: attr(tag, 'alt') || attr(tag, 'title'),
      source_kind: 'img_tag'
    }
  }).filter((image) => image.image_url)

  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((match, index) => {
    const href = absolutizeUrl(attr(match[0], 'href'), baseUrl)
    const text = stripTags(match[2])
    return {
      link_index: index + 1,
      href,
      text,
      source_kind: 'anchor_tag'
    }
  }).filter((link) => link.href && link.text)

  return { images, anchors }
}

function looksLikeProductName(text) {
  if (!text || text.length < 2 || text.length > 80) return false
  if (/^(首页|案例|模板|设计|印刷|活动|帮助|教程|会员特权|登录注册|查看更多|关于我们|联系我们|隐私保护|版权声明)$/i.test(text)) return false
  return /产品|画册|图册|手册|色卡|系列|型号|说明书|catalog|brochure|manual|[A-Z]{1,5}\d{1,}|\d{3,}/i.test(text)
}

function inferFieldHints(name) {
  const modelCandidates = [...String(name || '').matchAll(/\b[A-Z]{1,6}[-_]?\d[A-Z0-9._-]{1,20}\b/g)].map((match) => match[0])
  const categoryHints = []
  if (/色卡|木|门|地板|建材|板材|饰材/i.test(name)) categoryHints.push('building_materials_or_finish_samples')
  if (/泵|控制器|齿轮|减速|机械|五金|汽配/i.test(name)) categoryHints.push('industrial_parts_or_equipment')
  if (/灯|灯饰|照明/i.test(name)) categoryHints.push('lighting')
  if (/画册|图册|手册|宣传册/i.test(name)) categoryHints.push('catalogue_or_brochure')
  if (!categoryHints.length) categoryHints.push('unknown_pending_detail_page')
  return {
    model_candidates: modelCandidates,
    category_hints: categoryHints,
    needs_detail_page_extraction: true
  }
}

function extractTextPageFacts(html) {
  const text = stripTags(html)
  function grab(label) {
    const match = text.match(new RegExp(`${label}[：:]\\s*([^\\n。]+)`))
    return match ? decodeEntities(match[1]) : ''
  }
  return {
    book_name: grab('书刊名称'),
    author: grab('发布作者'),
    published_at: grab('发布时间'),
    views: grab('阅读次数'),
    intro: grab('书刊简介')
  }
}

function pairRows({ pageUrl, pageTitle, pageType, anchors, images, html, limit }) {
  const imageByAlt = new Map()
  for (const image of images) {
    const key = image.alt.toLowerCase()
    if (key && !imageByAlt.has(key)) imageByAlt.set(key, image)
  }

  const rows = []
  const facts = extractTextPageFacts(html || '')
  const pageCandidateName = facts.book_name || pageTitle.replace(/文字版-FLBOOK$|-FLBOOK$/i, '').trim()
  if (looksLikeProductName(pageCandidateName) && !/flbook|电子画册杂志期刊书刊报刊电子书/i.test(pageCandidateName)) {
    const hints = inferFieldHints(pageCandidateName)
    rows.push({
      row_id: `web_item_${String(rows.length + 1).padStart(3, '0')}`,
      source_page_url: pageUrl,
      source_page_title: pageTitle,
      source_page_type: pageType,
      extracted_name: pageCandidateName,
      detail_url: pageUrl,
      image_url: '',
      image_alt: '',
      model_candidates: hints.model_candidates,
      category_hints: hints.category_hints,
      parameters: {
        author: facts.author,
        published_at: facts.published_at,
        views: facts.views,
        intro: facts.intro
      },
      specifications: {},
      materials: /304|316L|不锈钢/i.test(pageCandidateName) ? ['stainless steel candidate from title'] : [],
      certificates_or_claims: [],
      extraction_confidence: facts.book_name ? 0.68 : 0.48,
      evidence_status: 'public_text_page_metadata_unverified',
      image_rights_status: 'unknown_pending_operator_review',
      required_next_action: 'extract_or_ocr_catalogue_pages_for_line_item_specs_materials_prices'
    })
  }
  for (const link of anchors) {
    if (!looksLikeProductName(link.text)) continue
    const image = imageByAlt.get(link.text.toLowerCase()) || images.find((candidate) => candidate.alt && (candidate.alt.includes(link.text) || link.text.includes(candidate.alt))) || null
    const hints = inferFieldHints(link.text)
    rows.push({
      row_id: `web_item_${String(rows.length + 1).padStart(3, '0')}`,
      source_page_url: pageUrl,
      source_page_title: pageTitle,
      source_page_type: pageType,
      extracted_name: link.text,
      detail_url: link.href,
      image_url: image?.image_url || '',
      image_alt: image?.alt || '',
      model_candidates: hints.model_candidates,
      category_hints: hints.category_hints,
      parameters: {},
      specifications: {},
      materials: [],
      certificates_or_claims: [],
      extraction_confidence: image ? 0.58 : 0.42,
      evidence_status: 'public_page_listing_only_unverified',
      image_rights_status: 'unknown_pending_operator_review',
      required_next_action: 'open_detail_or_catalogue_page_to_extract_specs_materials_parameters'
    })
    if (rows.length >= limit) break
  }
  return rows
}

function csvEscape(value) {
  const normalized = Array.isArray(value) ? value.join('; ') : typeof value === 'object' && value ? JSON.stringify(value) : String(value ?? '')
  return `"${normalized.replaceAll('"', '""')}"`
}

function writeCsv(path, rows) {
  const headers = [
    'row_id',
    'extracted_name',
    'detail_url',
    'image_url',
    'image_alt',
    'model_candidates',
    'category_hints',
    'parameters',
    'specifications',
    'materials',
    'certificates_or_claims',
    'extraction_confidence',
    'evidence_status',
    'image_rights_status',
    'required_next_action',
    'source_page_url'
  ]
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))
  ]
  writeFileSync(path, `\ufeff${lines.join('\n')}\n`, 'utf8')
}

function writeMarkdown(path, { job, pages, rows }) {
  const lines = [
    '# Product Web Intake Probe',
    '',
    `Job: \`${job.job_id}\``,
    `Generated at: ${job.generated_at}`,
    `Input URL: ${job.input_url}`,
    `Rows extracted: ${rows.length}`,
    '',
    '## Verdict',
    '',
    job.verdict,
    '',
    '## Pages',
    '',
    '| URL | Status | Type | Title | Rows |',
    '| --- | ---: | --- | --- | ---: |',
    ...pages.map((page) => `| ${page.url} | ${page.status} | ${page.page_type} | ${page.title.replaceAll('|', '\\|')} | ${page.extracted_row_count} |`),
    '',
    '## Extracted Rows',
    '',
    '| Name | Detail URL | Image | Category Hint | Next Action |',
    '| --- | --- | --- | --- | --- |',
    ...rows.slice(0, 30).map((row) => `| ${row.extracted_name.replaceAll('|', '\\|')} | ${row.detail_url} | ${row.image_url ? 'yes' : 'no'} | ${row.category_hints.join('; ')} | ${row.required_next_action} |`),
    '',
    '## Boundary',
    '',
    '- Public-page read-only probe only.',
    '- No login, captcha bypass, image download, customer message, publication, or paid action.',
    '- Product facts, image rights, certificates, prices, materials and parameters remain unverified until detail-page/catalogue extraction and human review.'
  ]
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8')
}

async function main() {
  const args = parseArgs(process.argv)
  const inputUrl = normalizeUrl(args.url)
  const parsedInput = new URL(inputUrl)
  const sameOrigin = parsedInput.origin
  const jobId = safeJobId(args['job-id'] || `${parsedInput.hostname.replace(/^www\./, '')}-${new Date().toISOString().slice(0, 10)}`)
  const limit = Number(args.limit || 80)
  const generatedAt = nowIso()
  const jobDir = join(jobRoot, 'jobs', jobId)
  ensureDir(jobDir)

  const htmlFile = args['html-file'] ? String(args['html-file']) : null
  const robots = htmlFile
    ? {
        url: new URL('/robots.txt', sameOrigin).toString(),
        status: 'not_checked_offline_html_mode',
        body: '',
        sitemap: null,
        disallow_all_for_generic_agent: null
      }
    : await fetchRobots(sameOrigin)
  const probeUrls = htmlFile
    ? [inputUrl]
    : [inputUrl]
  if (!htmlFile && parsedInput.hostname.includes('flbook.com.cn') && parsedInput.pathname === '/') {
    probeUrls.push(new URL('/library', sameOrigin).toString())
  }

  const pages = []
  const rows = []
  for (const url of probeUrls) {
    const response = htmlFile
      ? {
          url,
          status: 'offline_html',
          headers: { 'content-type': 'text/html; offline=1' },
          body: readFileSync(htmlFile, 'utf8')
        }
      : await fetchText(url)
    const html = response.body
    const title = extractTitle(html)
    const pageType = classifyPage(url, html, title)
    const { anchors, images } = extractLinksAndImages(html, url)
    const pageRows = pairRows({ pageUrl: url, pageTitle: title, pageType, anchors, images, html, limit: Math.max(0, limit - rows.length) })
    rows.push(...pageRows)
    pages.push({
      url,
      status: response.status,
      content_type: response.headers['content-type'] || '',
      title,
      page_type: pageType,
      html_sha256: sha256(html),
      href_count: anchors.length,
      image_count: images.length,
      extracted_row_count: pageRows.length
    })
  }

  const job = {
    contract: 'product_web_intake_probe.v1',
    job_id: jobId,
    generated_at: generatedAt,
    input_url: inputUrl,
    execution_mode: 'public_read_only_probe',
    robots,
    safety: {
      login_bypass_executed: false,
      captcha_bypass_executed: false,
      image_download_executed: false,
      external_publish_executed: false,
      paid_action_executed: false,
      real_external_actions_executed: false
    },
    verdict: rows.length
      ? 'The site produced listing-level product/catalogue candidates. Detail pages or exact catalogue links are required for reliable parameters, materials and specifications.'
      : 'No product/catalogue candidates were extracted from the supplied public page. Provide a product detail page, catalogue page, or FLBOOK brand/book URL.',
    output_refs: {
      normalized_json: `cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-web-intake/jobs/${jobId}/products.normalized.json`,
      csv: `cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-web-intake/jobs/${jobId}/products.csv`,
      markdown: `cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-web-intake/jobs/${jobId}/summary.md`
    },
    pages,
    row_count: rows.length
  }

  writeJson(join(jobDir, 'job.json'), job)
  writeJson(join(jobDir, 'products.normalized.json'), {
    contract: 'product_web_intake_rows.v1',
    generated_at: generatedAt,
    job_id: jobId,
    source_url: inputUrl,
    rows
  })
  writeCsv(join(jobDir, 'products.csv'), rows)
  writeMarkdown(join(jobDir, 'summary.md'), { job, pages, rows })

  console.log(JSON.stringify({
    success: true,
    contract: 'product_web_intake_run_result.v1',
    job_id: jobId,
    generated_at: generatedAt,
    rows_extracted: rows.length,
    job_ref: `cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-web-intake/jobs/${jobId}/job.json`,
    csv_ref: job.output_refs.csv,
    normalized_json_ref: job.output_refs.normalized_json,
    markdown_ref: job.output_refs.markdown,
    verdict: job.verdict,
    real_external_actions_executed: false
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    contract: 'product_web_intake_run_result.v1',
    error: error.message,
    real_external_actions_executed: false
  }, null, 2))
  process.exit(1)
})
