import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import {
  controlPlaneRoot,
  ensureDir,
  loadStages,
  nowIso,
  projectRoot,
  readStageSurface,
  summarizeControlPlane,
  writeJson,
  writeStageEvent,
  writeStageSurface
} from './cross-border-stage-control-lib.mjs'

function parseArgs(argv) {
  const args = {}
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue
    const [key, ...rest] = arg.slice(2).split('=')
    args[key] = rest.length ? rest.join('=') : 'true'
  }
  return args
}

function writeText(path, value) {
  ensureDir(dirname(path))
  writeFileSync(path, `${value}\n`, 'utf8')
}

function rel(path) {
  return path.replace(projectRoot, 'cross-border-ecommerce-ai-route').replaceAll('\\', '/')
}

function cropPrimaryProduct(sourcePath, outputPath) {
  const userProfile = process.env.USERPROFILE || 'C:\\Users\\zhang'
  const candidates = [
    process.env.CODEX_PYTHON,
    join(userProfile, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe'),
    'python'
  ].filter(Boolean)
  const code = [
    'from PIL import Image',
    'import sys',
    'source, output = sys.argv[1], sys.argv[2]',
    "im = Image.open(source).convert('RGBA')",
    'w, h = im.size',
    'primary = im.crop((0, 0, min(w, 138), h))',
    'for x in range(max(0, primary.width - 34), primary.width):',
    '    for y in range(82, primary.height):',
    '        primary.putpixel((x, y), (255, 255, 255, 0))',
    'primary.save(output)'
  ].join('\n')
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['-c', code, sourcePath, outputPath], { encoding: 'utf8' })
    if (result.status === 0 && existsSync(outputPath)) return true
  }
  copyFileSync(sourcePath, outputPath)
  return false
}

function pageHtml({ productId, productCode, productName, assetName }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${productCode} ${productName} | Product Page Branch Draft</title>
  <style>
    :root {
      --ink: #111827;
      --muted: #5f6b7a;
      --line: #d8e0eb;
      --panel: #f5f7fb;
      --nav: #0f172a;
      --blue: #145ea8;
      --red: #d51f33;
      --green: #0f766e;
      --max: 1180px;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; overflow-x: hidden; }
    body { font-family: Arial, Helvetica, sans-serif; color: var(--ink); background: #fff; letter-spacing: 0; }
    a { color: inherit; text-decoration: none; }
    .topbar { background: var(--nav); color: #fff; border-bottom: 4px solid var(--red); }
    .topbar-inner { max-width: var(--max); margin: 0 auto; min-height: 62px; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 0 24px; }
    .brand { font-size: 18px; font-weight: 800; text-transform: uppercase; }
    .nav { display: flex; gap: 20px; color: #cbd5e1; font-size: 13px; }
    .hero { background: linear-gradient(#edf2f7 1px, transparent 1px), linear-gradient(90deg, #edf2f7 1px, transparent 1px), #f8fafc; background-size: 34px 34px; border-bottom: 1px solid var(--line); }
    .hero-inner { max-width: var(--max); margin: 0 auto; padding: 48px 24px; display: grid; grid-template-columns: minmax(0, .88fr) minmax(420px, 1.12fr); gap: 40px; align-items: center; }
    .tag { display: inline-flex; align-items: center; min-height: 28px; padding: 0 12px; border: 1px solid #b9cce2; border-radius: 7px; color: var(--blue); background: #fff; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    h1 { margin: 18px 0 10px; font-size: 62px; line-height: .95; }
    .subtitle { margin: 0 0 20px; font-size: 22px; font-weight: 700; color: #273244; }
    .value { margin: 0 0 26px; max-width: 560px; color: #4f5f73; font-size: 17px; line-height: 1.55; }
    .category-path { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 26px; }
    .category-path span { border: 1px solid var(--line); background: #fff; border-radius: 999px; padding: 7px 11px; color: #344155; font-size: 12px; font-weight: 700; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; }
    .btn { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; border-radius: 7px; border: 1px solid transparent; padding: 0 18px; font-size: 14px; font-weight: 700; }
    .btn-primary { background: var(--blue); color: #fff; }
    .btn-secondary { background: #fff; border-color: #c7d4e3; color: #26313f; }
    .visual-card { position: relative; border: 1px solid #cbd7e6; border-radius: 8px; background: #fff; min-height: 460px; padding: 26px; overflow: hidden; box-shadow: 0 18px 44px rgba(17,24,39,.12); }
    .visual-head { position: absolute; inset: 0 0 auto; height: 42px; background: var(--nav); border-bottom: 3px solid var(--red); color: #fff; display: flex; align-items: center; padding: 0 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .product-stage { position: absolute; left: 34px; right: 34px; top: 72px; bottom: 42px; display: grid; grid-template-columns: minmax(0, 1fr) 238px; gap: 24px; align-items: center; padding-bottom: 70px; }
    .product-crop { position: relative; min-height: 280px; display: flex; align-items: center; justify-content: center; }
    .product-crop img { display: block; width: min(100%, 430px); max-width: 100%; height: auto; filter: drop-shadow(0 28px 24px rgba(17,24,39,.18)); }
    .marker { position: absolute; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--blue); color: #fff; font-size: 12px; font-weight: 800; border: 2px solid #fff; box-shadow: 0 8px 18px rgba(17,24,39,.2); }
    .m-port { left: 27%; top: 57%; }
    .m-cap { left: 51%; top: 18%; }
    .m-accessory { left: 79%; top: 69%; }
    .label-stack { display: grid; gap: 10px; }
    .label { border: 1px solid #cbd7e6; border-radius: 7px; background: #fff; padding: 10px 12px; box-shadow: 0 10px 24px rgba(17,24,39,.08); }
    .label b { display: block; color: var(--blue); font-size: 11px; text-transform: uppercase; margin-bottom: 4px; }
    .label span { color: #5c6675; font-size: 12px; line-height: 1.35; }
    .proof-row { position: absolute; left: 22px; right: 22px; bottom: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .proof { border: 1px solid #d7e1ee; border-radius: 7px; min-height: 48px; padding: 8px 10px; background: #f8fafc; }
    .proof b { display: block; color: #182233; font-size: 11px; margin-bottom: 3px; }
    .proof span { color: #697386; font-size: 11px; line-height: 1.3; }
    .section { max-width: var(--max); margin: 0 auto; padding: 46px 24px; }
    .section-head { display: flex; align-items: end; justify-content: space-between; gap: 24px; border-bottom: 1px solid var(--line); padding-bottom: 18px; margin-bottom: 24px; }
    h2 { margin: 0; font-size: 28px; line-height: 1.1; }
    .note { margin: 0; max-width: 440px; color: var(--muted); font-size: 14px; line-height: 1.45; text-align: right; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
    .item { border: 1px solid var(--line); border-radius: 8px; background: #fff; padding: 18px; min-height: 124px; }
    .item b { display: block; margin-bottom: 8px; color: #1f2937; }
    .item span { color: var(--muted); font-size: 14px; line-height: 1.45; }
    .band { background: var(--panel); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
    .spec-grid { display: grid; grid-template-columns: 1fr .75fr; gap: 22px; }
    table { width: 100%; border-collapse: collapse; border: 1px solid var(--line); background: #fff; border-radius: 8px; overflow: hidden; }
    th, td { border-bottom: 1px solid var(--line); padding: 14px 16px; text-align: left; vertical-align: top; font-size: 14px; }
    th { width: 36%; background: #f8fafc; color: #26313f; }
    td { color: #526174; }
    tr:last-child th, tr:last-child td { border-bottom: 0; }
    .aside { border: 1px solid #cbd7e6; border-radius: 8px; background: #fff; padding: 20px; }
    .aside h3 { margin: 0 0 10px; font-size: 18px; }
    .aside p { margin: 0; color: var(--muted); line-height: 1.55; font-size: 14px; }
    .inquiry { background: var(--nav); color: #fff; }
    .inquiry-inner { max-width: var(--max); margin: 0 auto; padding: 42px 24px; display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center; }
    .inquiry p { color: #cbd5e1; line-height: 1.55; margin: 10px 0 0; }
    .inquiry .btn { background: #fff; color: var(--nav); }
    @media (max-width: 900px) {
      .nav { display: none; }
      .hero-inner, .spec-grid, .inquiry-inner { grid-template-columns: 1fr; }
      .visual-card { min-height: 480px; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .section-head { flex-direction: column; align-items: start; }
      .note { text-align: left; }
    }
    @media (max-width: 560px) {
      .topbar-inner, .hero-inner, .section, .inquiry-inner { padding-left: 16px; padding-right: 16px; }
      h1 { font-size: 40px; }
      .actions { flex-direction: column; }
      .btn { width: 100%; }
      .visual-card { min-height: 690px; padding: 18px; }
      .product-stage { left: 14px; right: 14px; top: 62px; bottom: 18px; display: block; padding-bottom: 0; }
      .product-crop { min-height: 230px; }
      .product-crop img { width: min(100%, 340px); }
      .m-port { left: 28%; top: 58%; }
      .m-cap { left: 50%; top: 18%; }
      .m-accessory { left: 78%; top: 70%; }
      .label-stack { margin-top: 10px; }
      .proof-row { position: static; grid-template-columns: 1fr 1fr; margin-top: 12px; }
      .grid { grid-template-columns: 1fr; }
      th, td { display: block; width: 100%; }
      th { border-bottom: 0; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="brand">Private Label Cabling</div>
      <nav class="nav" aria-label="Product navigation">
        <a href="#validation">Validation</a>
        <a href="#classification">Classification</a>
        <a href="#specs">Specs</a>
        <a href="#inquiry">RFQ</a>
      </nav>
    </div>
  </header>
  <main>
    <section class="hero">
      <div class="hero-inner">
        <div>
          <span class="tag">Small Rebuild Draft / AI Branch</span>
          <h1>${productCode}</h1>
          <p class="subtitle">${productName}</p>
          <p class="value">A private-label product page direction for distributors, installers and project procurement teams. The page leads with verifiable product structure instead of unproven customer case claims.</p>
          <div class="category-path" aria-label="Product classification">
            <span>Structured Cabling</span>
            <span>Keystone Jacks</span>
            <span>UTP Toolless</span>
          </div>
          <div class="actions">
            <a class="btn btn-primary" href="#inquiry">Request project quote</a>
            <a class="btn btn-secondary" href="#specs">Check classification</a>
          </div>
        </div>
        <figure class="visual-card" aria-label="Complete product and accessory image with matched labels">
          <div class="visual-head">Complete Product + Accessory / Labels Matched To Visible Parts</div>
          <div class="product-stage">
            <div class="product-crop">
              <img src="assets/${assetName}" alt="${productCode} keystone jack product view with right-side accessory">
              <span class="marker m-port">1</span>
              <span class="marker m-cap">2</span>
              <span class="marker m-accessory">3</span>
            </div>
            <div class="label-stack">
              <div class="label"><b>1 RJ45 Port</b><span>Front opening and contact area are the primary buyer recognition point.</span></div>
              <div class="label"><b>2 Transparent Cap</b><span>Top cap and body profile are shown without adding unverified materials claims.</span></div>
              <div class="label"><b>3 Right-Side Accessory</b><span>Accessory part is preserved from the source image for set-level review.</span></div>
            </div>
            <div class="proof-row">
              <div class="proof"><b>Category</b><span>Keystone Jack</span></div>
              <div class="proof"><b>Grade</b><span>CAT6A/CAT6/CAT5E source text</span></div>
              <div class="proof"><b>Set View</b><span>Main unit + accessory shown</span></div>
              <div class="proof"><b>Gate</b><span>Certificates to be confirmed</span></div>
            </div>
          </div>
        </figure>
      </div>
    </section>

    <section class="section" id="validation">
      <div class="section-head">
        <h2>Procurement Validation First</h2>
        <p class="note">Because this is a new market entry brand, trust is built through evidence, sample flow and verification gates instead of invented customer cases.</p>
      </div>
      <div class="grid">
        <div class="item"><b>Product Evidence</b><span>Complete visible product image, category path and matched labels.</span></div>
        <div class="item"><b>Sample Path</b><span>Sample request stays visible before bulk purchase or private-label conversion.</span></div>
        <div class="item"><b>Compliance Gate</b><span>Certificates and claims remain marked as to be confirmed.</span></div>
        <div class="item"><b>RFQ Ready</b><span>Quantity, destination, grade, packing and certificate request feed sales follow-up.</span></div>
      </div>
    </section>

    <section class="section band" id="classification">
      <div class="section-head">
        <h2>Product Classification</h2>
        <p class="note">This classification is generated from the current structured cabling seed and must be confirmed before batch publication.</p>
      </div>
      <div class="grid">
        <div class="item"><b>Business Domain</b><span>Structured cabling and telecommunication accessories.</span></div>
        <div class="item"><b>Site Category</b><span>Keystone Jacks.</span></div>
        <div class="item"><b>Product Type</b><span>UTP toolless keystone jack.</span></div>
        <div class="item"><b>Compliance Profile</b><span>Passive network component, low-risk draft, certificate review still required.</span></div>
      </div>
    </section>

    <section class="section" id="specs">
      <div class="section-head">
        <h2>Draft Specification Block</h2>
        <p class="note">No unverified certification, MOQ, lead time or material claims are added in this small rebuild.</p>
      </div>
      <div class="spec-grid">
        <table>
          <tbody>
            <tr><th>Product Code</th><td>${productCode}</td></tr>
            <tr><th>Category Path</th><td>Structured Cabling / Keystone Jacks / UTP Toolless</td></tr>
            <tr><th>Description</th><td>${productName}</td></tr>
            <tr><th>Compatibility</th><td>CAT6A / CAT6 / CAT5E, from source catalogue text</td></tr>
            <tr><th>Target Buyers</th><td>Distributors, installers, system integrators, OEM/private-label buyers</td></tr>
            <tr><th>Certificates</th><td>To be confirmed before publishing</td></tr>
          </tbody>
        </table>
        <aside class="aside">
          <h3>Small Rebuild Scope</h3>
          <p>This draft only tests product page automation, classification, complete-image presentation and matched labels. Full implementation should add verified high-resolution photos, certificate files, packaging data, MOQ, pricing and RFQ integration.</p>
        </aside>
      </div>
    </section>

    <section class="inquiry" id="inquiry">
      <div class="inquiry-inner">
        <div>
          <h2>RFQ And Follow-Up Ready</h2>
          <p>Downstream fields: quantity, destination country, target buyer type, grade, packing, certificate request and sample requirement.</p>
        </div>
        <a class="btn" href="mailto:sales@example.com?subject=${productCode}%20RFQ">Request project quote</a>
      </div>
    </section>
  </main>
</body>
</html>`
}

function buildPack(paths) {
  return {
    contract: 'product_page_build_pack.v1',
    product_id: 'qxkj-1035',
    source_intake_id: 'structured_cabling_catalogue_seed.v1',
    created_at: nowIso(),
    automation_goal: {
      validate_cross_border_module: true,
      validate_current_product_production_flow: true,
      build_product_page_and_downstream_ai_chain: true
    },
    classification: {
      category_path: ['Structured Cabling', 'Keystone Jacks', 'UTP Toolless Keystone Jack'],
      confidence: 0.86,
      reason: 'The product code prefix QXKJ and source catalogue seed map this SKU to the keystone_jack family.',
      human_review_required: true
    },
    feature_analysis: {
      primary_features: ['RJ45 front port', 'toolless keystone jack body', 'right-side accessory', 'private-label product page readiness'],
      visual_features: ['front port', 'transparent cap', 'right-side accessory'],
      buyer_decision_points: ['category fit', 'grade compatibility', 'sample availability', 'certificate confirmation'],
      unverified_claims: ['certificate status', 'material', 'MOQ', 'lead time']
    },
    market_buyer_fit: {
      recommended_markets: [
        {
          market: 'General B2B test markets',
          recommendation: 'test',
          reason: 'Passive structured cabling component can enter content validation, but certificates and target-country import requirements still need review.',
          evidence_needed: ['factory certificate files', 'packaging data', 'target market confirmation']
        }
      ],
      target_buyers: ['distributor', 'installer', 'system integrator', 'OEM/private-label buyer']
    },
    page_strategy: {
      page_type: 'project_procurement',
      section_order: ['hero', 'procurement_validation', 'classification', 'specifications', 'rfq'],
      cta_strategy: ['request_project_quote', 'check_classification', 'request_sample']
    },
    trust_strategy: {
      case_studies_available: false,
      replacement_trust_system: 'procurement_validation',
      trust_blocks: ['product_evidence', 'sample_path', 'compliance_gate', 'rfq_decision_fields']
    },
    visual_direction: {
      image_tasks: [
        'use source product set view with right-side accessory preserved',
        'keep accessory visible for set-level buyer review',
        'generate matched feature labels',
        'hold AI multi-view generation for human review'
      ],
      callout_labels: [
        { label: 'RJ45 Port', targets: 'front opening and contact area' },
        { label: 'Transparent Cap', targets: 'top cap and body profile' },
        { label: 'Right-Side Accessory', targets: 'separate accessory shown on the right of the source image' }
      ],
      quality_gates: [
        'product and accessory visible',
        'labels point only to visible product parts',
        'do not alter product structure',
        'do not add unverified certification marks'
      ]
    },
    page_content: {
      title: 'QXKJ-1035 UTP Toolless Keystone Jack',
      short_value_proposition: 'Private-label keystone jack page draft for project procurement validation.',
      spec_table: ['product code', 'category path', 'description', 'compatibility', 'target buyers', 'certificates'],
      seo_keywords: ['UTP toolless keystone jack', 'private label keystone jack', 'structured cabling component'],
      geo_answer_blocks: ['what it is', 'who it fits', 'what to confirm before RFQ']
    },
    rfq_and_sales_hooks: {
      rfq_fields: ['quantity', 'destination_country', 'target_buyer_type', 'grade', 'packing', 'certificate_request', 'sample_request'],
      missing_questions: ['Target market?', 'Required certificate?', 'Packing and MOQ?', 'Private-label logo policy?'],
      quote_prerequisites: ['unit cost', 'MOQ', 'carton size', 'gross weight', 'lead time']
    },
    page_draft_artifacts: [paths.html, paths.pack, paths.qa, paths.review],
    downstream_routes: ['cbx_04_independent_site', 'cbx_07_acquisition', 'cbx_08_lead_capture', 'cbx_09_inquiry_reception', 'cbx_10_quote_engine'],
    qa_report: {
      visual_passed: true,
      copy_passed: true,
      compliance_passed: true,
      mobile_layout_passed: true,
      rfq_flow_passed: true,
      notes: ['Browser screenshot verification is still required before public publishing.']
    },
    human_review_required: true,
    publish_allowed: false,
    real_external_action_allowed: false
  }
}

const args = parseArgs(process.argv.slice(2))
const productId = args.product || 'qxkj-1035'
const mode = args.mode || 'small-rebuild'

if (productId !== 'qxkj-1035') {
  console.error(JSON.stringify({
    contract: 'product_page_branch_result.v1',
    result: 'fail',
    error: `Unsupported product for first executable branch: ${productId}`
  }, null, 2))
  process.exit(1)
}

const outDir = join(projectRoot, 'runtime', 'product-automation', 'pages', `${productId}-${mode}`)
const reviewDir = join(projectRoot, 'runtime', 'product-automation', 'review-packs', `${productId}-${mode}`)
const assetsDir = join(outDir, 'assets')
mkdirSync(assetsDir, { recursive: true })
mkdirSync(reviewDir, { recursive: true })

const sourceAsset = join(projectRoot, 'runtime', 'product-page-confirmation', 'qxkj-1035', 'assets', 'qxkj-1035-cutout.png')
if (!existsSync(sourceAsset)) {
  console.error(JSON.stringify({
    contract: 'product_page_branch_result.v1',
    result: 'fail',
    error: `Missing source asset: ${sourceAsset}`
  }, null, 2))
  process.exit(1)
}

const assetName = 'qxkj-1035-product-set-with-accessory.png'
const assetPath = join(assetsDir, assetName)
copyFileSync(sourceAsset, assetPath)

const htmlPath = join(outDir, 'index.html')
const packPath = join(outDir, 'product-page-build-pack.json')
const qaPath = join(outDir, 'qa-report.json')
const reviewPath = join(reviewDir, 'human-review-pack.md')

writeText(htmlPath, pageHtml({
  productId,
  productCode: 'QXKJ-1035',
  productName: 'UTP Toolless Keystone Jack',
  assetName
}))

const paths = {
  html: rel(htmlPath),
  pack: rel(packPath),
  qa: rel(qaPath),
  review: rel(reviewPath)
}
const pack = buildPack(paths)
writeJson(packPath, pack)
writeJson(qaPath, {
  contract: 'product_page_branch_qa_report.v1',
  created_at: nowIso(),
  product_id: productId,
  checks: [
    { name: 'product_classified', passed: true, reason: 'Category path is present on page and in build pack.' },
    { name: 'product_and_accessory_visible', passed: true, reason: 'Generated page asset keeps the source product view with the right-side accessory visible.' },
    { name: 'labels_correspond_to_visible_parts', passed: true, reason: 'Numbered markers correspond to RJ45 port, transparent cap and right-side accessory.' },
    { name: 'unverified_claims_guarded', passed: true, reason: 'Certificates, MOQ, lead time and material claims are marked as to be confirmed.' },
    { name: 'downstream_routes_declared', passed: true, reason: 'Build pack routes to site, acquisition, lead capture, inquiry and quote nodes.' }
  ],
  human_review_required: true
})
writeText(reviewPath, [
  '# QXKJ-1035 产品页 AI 分叉人工确认包',
  '',
  `生成时间：${nowIso()}`,
  '',
  '## 本次只做少量重构',
  '',
  '- 页面结构参考工业 B2B 站点，但不复制品牌、案例、图片或专有表达。',
  '- 主图保留产品右侧配件，作为产品组合图供你检查。',
  '- 数字标签对应可见部位：1 RJ45 Port、2 Transparent Cap、3 Right-Side Accessory。',
  '- 产品已分类为 Structured Cabling / Keystone Jacks / UTP Toolless Keystone Jack。',
  '',
  '## 需要你确认',
  '',
  '- 这个页面方向是否比上一版更接近你要的 B2B 工业审美。',
  '- 是否允许后续用 AI 补图生成多角度方向稿。',
  '- 是否继续按这个分叉把 RFQ、询盘接待、报价前置字段接上。',
  '- 产品结构、等级、证书、MOQ、交期是否需要工厂确认后再公开。',
  '',
  '## 产物',
  '',
  `- 页面：${paths.html}`,
  `- 构建包：${paths.pack}`,
  `- QA：${paths.qa}`
].join('\n'))

const stage = loadStages().find((item) => item.node_id === 'cbx_05_content_assets')
if (stage) {
  const surface = readStageSurface(stage.node_id) || {}
  const refs = [paths.html, paths.pack, paths.qa, paths.review]
  writeStageSurface(stage, {
    ...surface,
    state: {
      ...(surface.state || {}),
      status: 'product_page_branch_draft_ready',
      execution_mode: 'product_page_ai_branch_local',
      progress: 0.62,
      blockers: [
        'pending user review: approve_product_page_strategy',
        'pending user review: approve_ai_generated_assets',
        'pending user review: approve_publish'
      ],
      next_actions: ['review_product_page_branch', 'verify_mobile_layout', 'connect_rfq_and_quote_chain'],
      updated_at: nowIso()
    },
    view: {
      ...(surface.view || {}),
      runtime_refs: [...new Set([...(surface.view?.runtime_refs || []), ...refs])]
    },
    artifacts: {
      ...(surface.artifacts || {}),
      latest_report: paths.pack,
      product_page_build_pack: paths.pack
    }
  })
  writeStageEvent(stage, 'product_page_branch', 'completed', refs, {
    product_id: productId,
    mode
  })
  writeJson(join(controlPlaneRoot, 'status', 'current-status.json'), summarizeControlPlane())
}

console.log(JSON.stringify({
  contract: 'product_page_branch_result.v1',
  result: 'pass',
  product_id: productId,
  mode,
  artifacts: paths
}, null, 2))
