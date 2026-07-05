import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const runtimeRoot = join(projectRoot, 'runtime', 'growth-sales-automation')
const deskRoot = join(runtimeRoot, 'product-decision-desk')
const matrixPath = join(deskRoot, 'source-channel-matrix.json')
const outputRoot = join(deskRoot, 'source-trials')
const latestJsonPath = join(outputRoot, 'latest-free-source-trial.json')
const latestMdPath = join(outputRoot, 'latest-free-source-trial.md')

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=')
    return [key, rest.join('=') || true]
  })
)

const productContext = {
  product_id: String(args.get('product') || 'structured-cabling-sample'),
  product_terms: String(args.get('terms') || 'structured cabling keystone jack patch panel RJ45 Cat6 Cat6A')
    .split(/\s*,\s*|\s{2,}/)
    .filter(Boolean),
  hs_candidates: String(args.get('hs') || '8536,8544')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  trade_period: String(args.get('period') || '2024')
}

const regionSamples = [
  { region: 'North America', country: 'United States', iso3: 'USA', m49: '842' },
  { region: 'EU/UK', country: 'Germany', iso3: 'DEU', m49: '276' },
  { region: 'Latin America', country: 'Brazil', iso3: 'BRA', m49: '76' },
  { region: 'Middle East', country: 'United Arab Emirates', iso3: 'ARE', m49: '784' },
  { region: 'Africa', country: 'South Africa', iso3: 'ZAF', m49: '710' },
  { region: 'ASEAN', country: 'Singapore', iso3: 'SGP', m49: '702' },
  { region: 'East Asia', country: 'Japan', iso3: 'JPN', m49: '392' },
  { region: 'Oceania', country: 'Australia', iso3: 'AUS', m49: '36' }
]

const worldBankIndicators = [
  { id: 'NY.GDP.MKTP.CD', label: 'GDP current US$' },
  { id: 'NE.TRD.GNFS.ZS', label: 'Trade percent of GDP' }
]

const companySamples = [
  { name: 'Panduit', expected_region: 'North America' },
  { name: 'CommScope', expected_region: 'North America' },
  { name: 'Legrand', expected_region: 'EU/UK' }
]

const countryToRegion = {
  US: 'North America',
  CA: 'North America',
  MX: 'North America',
  GB: 'EU/UK',
  UK: 'EU/UK',
  DE: 'EU/UK',
  FR: 'EU/UK',
  NL: 'EU/UK',
  IT: 'EU/UK',
  ES: 'EU/UK',
  BR: 'Latin America',
  CL: 'Latin America',
  CO: 'Latin America',
  AR: 'Latin America',
  AE: 'Middle East',
  SA: 'Middle East',
  QA: 'Middle East',
  ZA: 'Africa',
  NG: 'Africa',
  KE: 'Africa',
  SG: 'ASEAN',
  MY: 'ASEAN',
  ID: 'ASEAN',
  TH: 'ASEAN',
  VN: 'ASEAN',
  JP: 'East Asia',
  KR: 'East Asia',
  HK: 'East Asia',
  TW: 'East Asia',
  AU: 'Oceania',
  NZ: 'Oceania'
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  ensureDir(dirname(path))
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'cross-border-ecommerce-ai-route/read-only-source-trial'
      }
    })
    const text = await response.text()
    return {
      ok: response.ok,
      status: response.status,
      content_type: response.headers.get('content-type') || '',
      text
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchJson(url, timeoutMs = 20000) {
  const response = await fetchText(url, timeoutMs)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${url}: ${response.text.slice(0, 160)}`)
  }
  return {
    ...response,
    json: JSON.parse(response.text)
  }
}

function latestNonNull(records, iso3) {
  return records
    .filter((record) => record.countryiso3code === iso3 && record.value !== null && record.value !== undefined)
    .sort((a, b) => Number(b.date) - Number(a.date))[0] || null
}

async function runWorldBank(accessedAt) {
  const isoList = regionSamples.map((item) => item.iso3).join(';')
  const observations = []
  const sourceUrls = []
  const errors = []

  for (const indicator of worldBankIndicators) {
    const url = `https://api.worldbank.org/v2/country/${isoList}/indicator/${indicator.id}?format=json&per_page=120&date=2024:2026`
    sourceUrls.push(url)
    try {
      const response = await fetchJson(url)
      const rows = Array.isArray(response.json?.[1]) ? response.json[1] : []
      for (const sample of regionSamples) {
        const latest = latestNonNull(rows, sample.iso3)
        observations.push({
          region: sample.region,
          country: sample.country,
          iso3: sample.iso3,
          indicator: indicator.id,
          indicator_label: indicator.label,
          date: latest?.date || null,
          value: latest?.value ?? null
        })
      }
    } catch (error) {
      errors.push({ indicator: indicator.id, message: error.message })
    }
  }

  const nonNull = observations.filter((item) => item.value !== null)
  return {
    connector_id: 'world_bank_api',
    label: 'World Bank Indicators API',
    status: errors.length ? 'partial' : 'passed',
    read_only_external_fetch: true,
    source_urls: sourceUrls,
    accessed_at: accessedAt,
    freshness_window: 'Latest published indicator returned by API; reporting lag must be recorded per indicator.',
    signal_classes: ['macro_context', 'trend_or_demand_signal'],
    coverage_scope: 'Global macro context, sampled by eight representative regions.',
    rows_sampled: observations.length,
    rows_with_values: nonNull.length,
    regions_with_values: [...new Set(nonNull.map((item) => item.region))],
    sample_observations: observations.slice(0, 12),
    limitations: [
      'Macro indicators do not prove product demand.',
      'Latest World Bank values may lag by one or more years.',
      'Representative countries are samples, not full regional coverage.'
    ],
    errors
  }
}

async function runUnComtrade(accessedAt) {
  const observations = []
  const sourceUrls = []
  const errors = []

  for (const sample of regionSamples) {
    for (const hs of productContext.hs_candidates) {
      const url = `https://comtradeapi.un.org/public/v1/preview/C/A/HS?cmdCode=${encodeURIComponent(hs)}&flowCode=M&reporterCode=${sample.m49}&period=${productContext.trade_period}&partnerCode=0`
      sourceUrls.push(url)
      try {
        const response = await fetchJson(url)
        const rows = Array.isArray(response.json?.data) ? response.json.data : []
        const first = rows[0] || {}
        observations.push({
          region: sample.region,
          reporter_country: sample.country,
          reporter_m49: sample.m49,
          hs_candidate: hs,
          period: productContext.trade_period,
          row_count: Number(response.json?.count || rows.length || 0),
          trade_value: first.primaryValue ?? first.cifvalue ?? first.fobvalue ?? null,
          net_weight: first.netWgt ?? null
        })
      } catch (error) {
        errors.push({
          region: sample.region,
          reporter_country: sample.country,
          hs_candidate: hs,
          message: error.message
        })
      }
    }
  }

  const rowsWithData = observations.filter((item) => item.row_count > 0)
  return {
    connector_id: 'un_comtrade_api',
    label: 'UN Comtrade public preview',
    status: errors.length ? 'partial' : 'passed',
    read_only_external_fetch: true,
    source_urls: sourceUrls,
    accessed_at: accessedAt,
    freshness_window: `Annual ${productContext.trade_period} public preview; production use should configure API key and quota.`,
    signal_classes: ['official_trade_flow'],
    coverage_scope: 'Official import-flow preview for HS candidates across eight representative reporter markets.',
    rows_sampled: observations.length,
    rows_with_values: rowsWithData.length,
    regions_with_values: [...new Set(rowsWithData.map((item) => item.region))],
    sample_observations: observations.slice(0, 16),
    limitations: [
      'Preview endpoint is suitable for smoke testing, not high-volume production use.',
      'HS candidates are not final classifications.',
      'Reporter availability and publication lag vary by country.'
    ],
    errors
  }
}

async function runUsitc(accessedAt) {
  const observations = []
  const sourceUrls = []
  const errors = []

  for (const hs of productContext.hs_candidates) {
    const url = `https://hts.usitc.gov/reststop/search?keyword=${encodeURIComponent(hs)}`
    sourceUrls.push(url)
    try {
      const response = await fetchJson(url)
      const rows = Array.isArray(response.json) ? response.json : []
      observations.push({
        region: 'North America',
        market: 'United States',
        hs_candidate: hs,
        row_count: rows.length,
        sample_headings: rows.slice(0, 5).map((row) => ({
          htsno: row.htsno || null,
          description: row.description || null,
          general: row.general || null,
          special: row.special || null,
          other: row.other || null
        }))
      })
    } catch (error) {
      errors.push({ hs_candidate: hs, message: error.message })
    }
  }

  const rowsWithData = observations.filter((item) => item.row_count > 0)
  return {
    connector_id: 'usitc_hts',
    label: 'USITC HTS search',
    status: errors.length ? 'partial' : 'passed',
    read_only_external_fetch: true,
    source_urls: sourceUrls,
    accessed_at: accessedAt,
    freshness_window: 'Record HTS access date; legal classification still requires human review.',
    signal_classes: ['tariff_or_market_access'],
    coverage_scope: 'United States HTS candidate evidence only.',
    rows_sampled: observations.length,
    rows_with_values: rowsWithData.length,
    regions_with_values: rowsWithData.length ? ['North America'] : [],
    sample_observations: observations,
    limitations: [
      'US-focused source; not global tariff coverage.',
      'Search results are candidate headings, not final legal classification.',
      'Product-specific material and use details are required for human review.'
    ],
    errors
  }
}

async function runWtoReachability(accessedAt) {
  const url = 'https://ttd.wto.org/en'
  try {
    const response = await fetchText(url)
    return {
      connector_id: 'wto_tariff_trade_data',
      label: 'WTO Tariff & Trade Data gateway',
      status: response.ok ? 'reachable_registration_required' : 'failed',
      read_only_external_fetch: true,
      source_urls: [url],
      accessed_at: accessedAt,
      freshness_window: 'API production use needs registered access and source-version recording.',
      signal_classes: ['tariff_or_market_access', 'official_trade_flow'],
      coverage_scope: 'Global tariff/trade gateway; this smoke test only verifies reachability.',
      rows_sampled: 0,
      rows_with_values: 0,
      regions_with_values: [],
      sample_observations: [],
      limitations: [
        'No tariff data was extracted in this trial.',
        'Automated production use should use registered API access and quota rules.'
      ],
      errors: response.ok ? [] : [{ message: `HTTP ${response.status}` }]
    }
  } catch (error) {
    return {
      connector_id: 'wto_tariff_trade_data',
      label: 'WTO Tariff & Trade Data gateway',
      status: 'failed',
      read_only_external_fetch: true,
      source_urls: [url],
      accessed_at: accessedAt,
      freshness_window: 'not_checked',
      signal_classes: ['tariff_or_market_access', 'official_trade_flow'],
      coverage_scope: 'Global tariff/trade gateway.',
      rows_sampled: 0,
      rows_with_values: 0,
      regions_with_values: [],
      sample_observations: [],
      limitations: ['Reachability failed in this trial.'],
      errors: [{ message: error.message }]
    }
  }
}

async function runUkTradeTariff(accessedAt) {
  const observations = []
  const sourceUrls = []
  const errors = []

  for (const hs of productContext.hs_candidates) {
    const url = `https://www.trade-tariff.service.gov.uk/api/v2/headings/${encodeURIComponent(hs)}`
    sourceUrls.push(url)
    try {
      const response = await fetchJson(url)
      const included = Array.isArray(response.json?.included) ? response.json.included : []
      observations.push({
        region: 'EU/UK',
        market: 'United Kingdom',
        hs_candidate: hs,
        heading_id: response.json?.data?.id || null,
        goods_nomenclature_item_id: response.json?.data?.attributes?.goods_nomenclature_item_id || null,
        description: response.json?.data?.attributes?.description || null,
        included_count: included.length
      })
    } catch (error) {
      errors.push({ hs_candidate: hs, message: error.message })
    }
  }

  const rowsWithData = observations.filter((item) => item.heading_id || item.included_count > 0)
  return {
    connector_id: 'uk_trade_tariff_api',
    label: 'UK Trade Tariff API',
    status: errors.length ? 'partial' : 'passed',
    read_only_external_fetch: true,
    source_urls: sourceUrls,
    accessed_at: accessedAt,
    freshness_window: 'Record access date and commodity heading; legal import classification still requires human review.',
    signal_classes: ['tariff_or_market_access', 'compliance_signal'],
    coverage_scope: 'United Kingdom tariff-heading candidate evidence.',
    rows_sampled: observations.length,
    rows_with_values: rowsWithData.length,
    regions_with_values: rowsWithData.length ? ['EU/UK'] : [],
    sample_observations: observations,
    limitations: [
      'UK-focused source; not EU or global tariff coverage.',
      'Heading-level response is a candidate evidence source, not final classification.',
      'Commodity-level duty details may require deeper API traversal and human review.'
    ],
    errors
  }
}

async function runUsCensusTrade(accessedAt) {
  const censusKey = process.env.CENSUS_API_KEY || process.env.US_CENSUS_API_KEY || ''
  if (!censusKey) {
    return {
      connector_id: 'us_census_international_trade_api',
      label: 'US Census International Trade API',
      status: 'skipped_free_key_required',
      read_only_external_fetch: false,
      source_urls: ['https://api.census.gov/data/timeseries/intltrade/imports/hs'],
      accessed_at: accessedAt,
      freshness_window: 'Not checked in this run because no free API key was configured.',
      signal_classes: ['official_trade_flow'],
      coverage_scope: 'United States import/export trade flow by HS; free key required for reliable use.',
      rows_sampled: 0,
      rows_with_values: 0,
      regions_with_values: [],
      sample_observations: [],
      limitations: [
        'Requires a free Census API key for reliable production use.',
        'US-focused source; does not replace UN Comtrade global coverage.'
      ],
      errors: []
    }
  }

  const observations = []
  const sourceUrls = []
  const errors = []
  for (const hs of productContext.hs_candidates) {
    const url = `https://api.census.gov/data/timeseries/intltrade/imports/hs?get=I_COMMODITY,I_COMMODITY_LDESC,GEN_VAL_MO,CTY_CODE,CTY_NAME&time=${productContext.trade_period}-12&I_COMMODITY=${encodeURIComponent(hs)}&key=${encodeURIComponent(censusKey)}`
    sourceUrls.push(url.replace(/key=[^&]+/, 'key=***'))
    try {
      const response = await fetchJson(url, 30000)
      const rows = Array.isArray(response.json) ? response.json : []
      observations.push({
        region: 'North America',
        market: 'United States',
        hs_candidate: hs,
        period: `${productContext.trade_period}-12`,
        row_count: Math.max(0, rows.length - 1),
        sample_rows: rows.slice(1, 6)
      })
    } catch (error) {
      errors.push({ hs_candidate: hs, message: error.message })
    }
  }

  const rowsWithData = observations.filter((item) => item.row_count > 0)
  return {
    connector_id: 'us_census_international_trade_api',
    label: 'US Census International Trade API',
    status: errors.length ? 'partial' : 'passed',
    read_only_external_fetch: true,
    source_urls: sourceUrls,
    accessed_at: accessedAt,
    freshness_window: `Monthly ${productContext.trade_period}-12 import data if available; record API access date.`,
    signal_classes: ['official_trade_flow'],
    coverage_scope: 'United States import trade flow by HS candidate.',
    rows_sampled: observations.length,
    rows_with_values: rowsWithData.length,
    regions_with_values: rowsWithData.length ? ['North America'] : [],
    sample_observations: observations,
    limitations: [
      'US-focused monthly source; not global trade coverage.',
      'HS candidates are not final classifications.',
      'API key is redacted in stored source URLs.'
    ],
    errors
  }
}

async function runWorldBankProjects(accessedAt) {
  const queries = ['telecommunications', 'broadband', 'digital infrastructure']
  const observations = []
  const sourceUrls = []
  const errors = []
  const regions = new Set()

  for (const query of queries) {
    const url = `https://search.worldbank.org/api/v2/projects?format=json&rows=5&fl=id,project_name,countryname,sector,boardapprovaldate,url&q=${encodeURIComponent(query)}`
    sourceUrls.push(url)
    try {
      const response = await fetchJson(url)
      const projects = response.json?.projects && typeof response.json.projects === 'object'
        ? Object.values(response.json.projects)
        : []
      for (const project of projects.slice(0, 5)) {
        const country = Array.isArray(project.countryname) ? project.countryname.join(', ') : project.countryname || ''
        const inferredRegion = inferRegionFromText(country)
        if (inferredRegion) regions.add(inferredRegion)
        observations.push({
          query,
          project_id: project.id || null,
          project_name: project.project_name || null,
          country,
          inferred_region: inferredRegion || 'unknown',
          boardapprovaldate: project.boardapprovaldate || null,
          url: project.url || null
        })
      }
    } catch (error) {
      errors.push({ query, message: error.message })
    }
  }

  return {
    connector_id: 'world_bank_projects_api',
    label: 'World Bank Projects API',
    status: errors.length ? 'partial' : 'passed',
    read_only_external_fetch: true,
    source_urls: sourceUrls,
    accessed_at: accessedAt,
    freshness_window: 'Project records are historical/current project evidence; record approval date and access date.',
    signal_classes: ['project_procurement_signal', 'buyer_channel_signal', 'web_evidence'],
    coverage_scope: 'Global development-project signal for infrastructure, telecom and digital procurement context.',
    rows_sampled: observations.length,
    rows_with_values: observations.length,
    regions_with_values: [...regions],
    sample_observations: observations.slice(0, 12),
    limitations: [
      'Project evidence indicates public/development procurement context, not direct product demand.',
      'Queries are category-context searches and may include adjacent sectors.',
      'Not all private-sector demand appears in World Bank project data.'
    ],
    errors
  }
}

function inferRegionFromText(text) {
  const value = String(text || '').toLowerCase()
  if (/(united states|canada|mexico)/.test(value)) return 'North America'
  if (/(germany|france|netherlands|united kingdom|europe|poland|italy|spain)/.test(value)) return 'EU/UK'
  if (/(brazil|chile|colombia|argentina|peru)/.test(value)) return 'Latin America'
  if (/(united arab emirates|saudi|qatar|jordan|iraq|middle east)/.test(value)) return 'Middle East'
  if (/(south africa|rwanda|kenya|nigeria|ghana|ethiopia|africa)/.test(value)) return 'Africa'
  if (/(singapore|malaysia|indonesia|thailand|vietnam|philippines|asean)/.test(value)) return 'ASEAN'
  if (/(japan|korea|china|hong kong|taiwan)/.test(value)) return 'East Asia'
  if (/(australia|new zealand|pacific)/.test(value)) return 'Oceania'
  return null
}

async function runGleif(accessedAt) {
  const observations = []
  const sourceUrls = []
  const errors = []
  const regions = new Set()

  for (const company of companySamples) {
    const url = `https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=${encodeURIComponent(company.name)}&page[size]=3`
    sourceUrls.push(url)
    try {
      const response = await fetchJson(url)
      const rows = Array.isArray(response.json?.data) ? response.json.data : []
      for (const row of rows.slice(0, 3)) {
        const attributes = row.attributes || {}
        const entity = attributes.entity || {}
        const country = entity.legalAddress?.country || entity.headquartersAddress?.country || null
        const region = countryToRegion[country] || company.expected_region || null
        if (region) regions.add(region)
        observations.push({
          query_company: company.name,
          lei: attributes.lei || row.id || null,
          legal_name: entity.legalName?.name || null,
          country,
          inferred_region: region,
          registration_status: attributes.registration?.status || null
        })
      }
    } catch (error) {
      errors.push({ company: company.name, message: error.message })
    }
  }

  return {
    connector_id: 'gleif_lei_api',
    label: 'GLEIF LEI API',
    status: errors.length ? 'partial' : 'passed',
    read_only_external_fetch: true,
    source_urls: sourceUrls,
    accessed_at: accessedAt,
    freshness_window: 'GLEIF golden-copy publish date should be recorded from API meta when used for company evidence.',
    signal_classes: ['company_identity_signal', 'buyer_channel_signal', 'competitor_or_marketplace_signal'],
    coverage_scope: 'Global legal-entity identity lookup for known buyers, competitors and channel companies.',
    rows_sampled: observations.length,
    rows_with_values: observations.length,
    regions_with_values: [...regions],
    sample_observations: observations,
    limitations: [
      'LEI records verify legal-entity identity, not purchase intent.',
      'Many distributors or small buyers may not have LEIs.',
      'Company discovery still needs separate search or source lists.'
    ],
    errors
  }
}

async function runCommonCrawl(accessedAt) {
  const observations = []
  const sourceUrls = ['https://index.commoncrawl.org/collinfo.json']
  const errors = []
  let latestIndex = null
  try {
    const listResponse = await fetchJson(sourceUrls[0])
    latestIndex = Array.isArray(listResponse.json) ? listResponse.json[0]?.id : null
  } catch (error) {
    errors.push({ stage: 'list_indexes', message: error.message })
  }

  const indexId = latestIndex || 'CC-MAIN-2026-25'
  const domains = ['commscope.com/*', 'panduit.com/*', 'legrand.com/*']
  for (const domain of domains) {
    const url = `https://index.commoncrawl.org/${encodeURIComponent(indexId)}-index?url=${encodeURIComponent(domain)}&output=json&fl=url&limit=5`
    sourceUrls.push(url)
    try {
      const response = await fetchText(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.text.slice(0, 120)}`)
      const rows = response.text
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(0, 5)
        .map((line) => JSON.parse(line))
      observations.push({
        domain,
        index_id: indexId,
        row_count: rows.length,
        sample_urls: rows.map((row) => row.url).filter(Boolean)
      })
    } catch (error) {
      errors.push({ domain, message: error.message })
    }
  }

  const rowsWithData = observations.filter((item) => item.row_count > 0)
  return {
    connector_id: 'common_crawl_index_api',
    label: 'Common Crawl Index API',
    status: errors.length ? 'partial' : 'passed',
    read_only_external_fetch: true,
    source_urls: sourceUrls,
    accessed_at: accessedAt,
    freshness_window: `Latest index checked: ${indexId}; pages are crawl evidence, not live-page confirmation.`,
    signal_classes: ['web_evidence', 'competitor_or_marketplace_signal'],
    coverage_scope: 'Global public web index for competitor/supplier page discovery and broad web evidence.',
    rows_sampled: observations.length,
    rows_with_values: rowsWithData.length,
    regions_with_values: rowsWithData.length ? ['global_web'] : [],
    sample_observations: observations,
    limitations: [
      'Common Crawl shows crawled URLs, not live product availability or prices.',
      'Crawl coverage varies by site and time.',
      'Use as discovery evidence; open authoritative pages before making claims.'
    ],
    errors
  }
}

async function runGdelt(accessedAt) {
  const query = 'structured cabling'
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=10&timespan=30d`
  await sleep(6500)
  try {
    const response = await fetchText(url, 30000)
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.text.slice(0, 160)}`)
    const trimmed = response.text.trim()
    if (!trimmed.startsWith('{')) throw new Error(`Non-JSON response: ${trimmed.slice(0, 160)}`)
    const json = JSON.parse(trimmed)
    const articles = Array.isArray(json?.articles) ? json.articles : []
    return {
      connector_id: 'gdelt_doc_api',
      label: 'GDELT DOC 2.1 API',
      status: 'passed',
      read_only_external_fetch: true,
      source_urls: [url],
      accessed_at: accessedAt,
      freshness_window: '30-day article window in this smoke test.',
      signal_classes: ['web_evidence', 'trend_or_demand_signal'],
      coverage_scope: 'Global news/web article signal; media-biased weak demand context.',
      rows_sampled: articles.length,
      rows_with_values: articles.length,
      regions_with_values: articles.length ? ['global_web'] : [],
      sample_observations: articles.slice(0, 5).map((article) => ({
        title: article.title || null,
        url: article.url || null,
        sourceCountry: article.sourceCountry || null,
        seendate: article.seendate || null
      })),
      limitations: [
        'GDELT is a media/web mention signal, not purchase demand.',
        'Rate limits can return 429; use backoff and cache results.',
        'Article relevance must be reviewed before downstream use.'
      ],
      errors: []
    }
  } catch (error) {
    return {
      connector_id: 'gdelt_doc_api',
      label: 'GDELT DOC 2.1 API',
      status: error.message.includes('HTTP 429') ? 'rate_limited' : 'unstable_or_query_rejected',
      read_only_external_fetch: true,
      source_urls: [url],
      accessed_at: accessedAt,
      freshness_window: 'not_checked_due_to_rate_limit_or_fetch_error',
      signal_classes: ['web_evidence', 'trend_or_demand_signal'],
      coverage_scope: 'Global news/web article signal.',
      rows_sampled: 0,
      rows_with_values: 0,
      regions_with_values: [],
      sample_observations: [],
      limitations: [
        'This free source requires strict rate limiting and cached retries.',
        'Do not treat a failed GDELT trial as no market signal.'
      ],
      errors: [{ message: error.message }]
    }
  }
}

function regionCoverage(sourceRuns) {
  return regionSamples.map((sample) => {
    const covered = new Set()
    for (const run of sourceRuns) {
      if ((run.regions_with_values || []).includes(sample.region)) {
        for (const signal of run.signal_classes || []) covered.add(signal)
      }
    }
    const missing = []
    if (!covered.has('macro_context')) missing.push('macro_context')
    if (!covered.has('official_trade_flow')) missing.push('official_trade_flow')
    if (!covered.has('tariff_or_market_access')) missing.push('tariff_or_market_access')
    if (!covered.has('buyer_channel_signal')) missing.push('buyer_channel_signal')
    if (!covered.has('web_evidence')) missing.push('web_evidence')
    if (!covered.has('competitor_or_marketplace_signal')) missing.push('competitor_or_marketplace_signal')
    return {
      region: sample.region,
      representative_country: sample.country,
      covered_signal_classes: [...covered],
      missing_signal_classes: [...new Set(missing)],
      status: covered.has('macro_context') && covered.has('official_trade_flow')
        ? 'base_trade_macro_ready'
        : 'needs_source_supplement'
    }
  })
}

function objectiveCoverage(matrix, sourceRuns) {
  const available = new Set()
  for (const run of sourceRuns) {
    if (!['passed', 'partial', 'reachable_registration_required'].includes(run.status)) continue
    for (const signal of run.signal_classes || []) available.add(signal)
  }
  available.add('user_factory_source')

  return (matrix.objective_rules || []).map((rule) => {
    const missing = (rule.minimum_required_signal_classes || []).filter((signal) => !available.has(signal))
    return {
      objective_id: rule.objective_id,
      question: rule.question,
      required_signal_classes: rule.minimum_required_signal_classes,
      covered_signal_classes: (rule.minimum_required_signal_classes || []).filter((signal) => available.has(signal)),
      missing_signal_classes: missing,
      status: missing.length ? 'partial_needs_fallback_or_connector' : 'base_passed',
      blocked_claims_if_missing: missing.length ? rule.blocked_claims_if_missing : []
    }
  })
}

function fallbackQueries(regionRows) {
  const baseTerms = productContext.product_terms.join(' ')
  const rows = []
  for (const row of regionRows) {
    if (!row.missing_signal_classes.length) continue
    rows.push({
      region: row.region,
      reason: `Missing ${row.missing_signal_classes.join(', ')}`,
      queries: [
        `${row.representative_country} ${baseTerms} distributor installer importer`,
        `${row.representative_country} ${baseTerms} import requirements HS ${productContext.hs_candidates.join(' ')}`,
        `${row.representative_country} structured cabling standards Cat6A RJ45 certification`
      ]
    })
  }
  return rows
}

function escapePipe(value) {
  return String(value ?? '').replaceAll('|', '/').replace(/\s+/g, ' ').trim()
}

function buildMarkdown(report) {
  const sourceRows = report.source_runs.map((run) =>
    `| ${escapePipe(run.label)} | ${escapePipe(run.status)} | ${escapePipe(run.signal_classes.join(', '))} | ${escapePipe(run.regions_with_values.join(', ') || 'none')} | ${run.rows_with_values}/${run.rows_sampled} |`
  )
  const objectiveRows = report.objective_coverage.map((row) =>
    `| ${escapePipe(row.objective_id)} | ${escapePipe(row.status)} | ${escapePipe(row.covered_signal_classes.join(', ') || 'none')} | ${escapePipe(row.missing_signal_classes.join(', ') || 'none')} |`
  )
  const regionRows = report.region_coverage.map((row) =>
    `| ${escapePipe(row.region)} | ${escapePipe(row.status)} | ${escapePipe(row.covered_signal_classes.join(', ') || 'none')} | ${escapePipe(row.missing_signal_classes.join(', ') || 'none')} |`
  )

  return `# Free Source Trial

Generated at: ${report.generated_at}

Product: \`${report.product_context.product_id}\`

Execution mode: \`${report.execution_mode}\`

Real external actions executed: \`${report.real_external_actions_executed}\`

## Source Runs

| Source | Status | Signal classes | Regions with values | Rows |
| --- | --- | --- | --- | --- |
${sourceRows.join('\n')}

## Objective Coverage

| Objective | Status | Covered | Missing |
| --- | --- | --- | --- |
${objectiveRows.join('\n')}

## Region Coverage

| Region | Status | Covered signals | Missing signals |
| --- | --- | --- | --- |
${regionRows.join('\n')}

## Fallback Required

${report.web_search_fallback_required ? 'Yes. Use broad web search only for listed gaps.' : 'No required fallback for the sampled base objectives.'}

${report.fallback_search_queries.map((item) => `### ${item.region}\n\nReason: ${item.reason}\n\n${item.queries.map((query) => `- ${query}`).join('\n')}`).join('\n\n')}

## Limits

${report.limitations.map((item) => `- ${item}`).join('\n')}
`
}

async function main() {
  const matrix = readJson(matrixPath)
  const accessedAt = new Date().toISOString()
  const sourceRuns = [
    await runWorldBank(accessedAt),
    await runUnComtrade(accessedAt),
    await runUsitc(accessedAt),
    await runUkTradeTariff(accessedAt),
    await runUsCensusTrade(accessedAt),
    await runWtoReachability(accessedAt),
    await runWorldBankProjects(accessedAt),
    await runGleif(accessedAt),
    await runCommonCrawl(accessedAt),
    await runGdelt(accessedAt)
  ]
  const regionRows = regionCoverage(sourceRuns)
  const objectiveRows = objectiveCoverage(matrix, sourceRuns)
  const fallback = fallbackQueries(regionRows)
  const report = {
    contract: 'product_decision_desk_free_source_trial.v1',
    generated_at: accessedAt,
    execution_mode: 'read_only_external_fetch',
    real_external_actions_executed: false,
    paid_or_login_sources_used: false,
    product_context: productContext,
    matrix_ref: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/source-channel-matrix.json',
    source_runs: sourceRuns,
    objective_coverage: objectiveRows,
    region_coverage: regionRows,
    web_search_fallback_required: fallback.length > 0 || objectiveRows.some((row) => row.status !== 'base_passed'),
    fallback_search_queries: fallback,
    output_contracts: ['market_search_pack.v1', 'source_channel_matrix.v1'],
    limitations: [
      'This run only validates free/read-only source access and baseline evidence coverage.',
      'It does not create a final target-market recommendation.',
      'It does not contact customers, log in to paid platforms, publish content, or generate formal quotes.',
      'Global coverage still requires country-level tariff/access sources beyond US/UK and validated buyer/channel evidence by target region.'
    ],
    next_steps: [
      'Add WTO API key or approved tariff adapter for broader tariff coverage.',
      'Add EU Access2Markets adapter for EU-specific market-access checks.',
      'Add free-key US Census International Trade API when a Census key is available.',
      'Keep Common Crawl and GDELT cached/rate-limited for web evidence.',
      'Only after human review, consider paid customs or lead sources for shipment-level buyer discovery.'
    ]
  }

  ensureDir(outputRoot)
  writeJson(latestJsonPath, report)
  writeFileSync(latestMdPath, buildMarkdown(report), 'utf8')
  console.log(JSON.stringify({
    success: true,
    contract: report.contract,
    execution_mode: report.execution_mode,
    real_external_actions_executed: report.real_external_actions_executed,
    source_runs: report.source_runs.map((run) => ({
      connector_id: run.connector_id,
      status: run.status,
      rows_with_values: run.rows_with_values,
      regions_with_values: run.regions_with_values.length
    })),
    web_search_fallback_required: report.web_search_fallback_required,
    latest_json: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-trial.json',
    latest_md: 'cross-border-ecommerce-ai-route/runtime/growth-sales-automation/product-decision-desk/source-trials/latest-free-source-trial.md'
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
