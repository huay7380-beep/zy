# Project

This folder defines a China-mainland cross-border ecommerce AI automation route. It is a standalone theory and orchestration design project under the parent zhineng system.

The business goal is to turn owned product sources into an export-ready ecommerce pipeline: mainland entity compliance, product compliance, independent site, content production, acquisition, inquiry reception, quote, order, payment, export, logistics, after-sales, retention, and audit learning.

# Canonical Entry

- Start with `README.md`.
- Treat `nodes/process-manifest.json` as the dispatch entry.
- Treat `nodes/node-catalog.json` as the node control catalog.
- Treat `docs/07-ai-orchestration.md` as the human-readable system integration spec.
- Treat all files in this folder as draft design until the user explicitly approves implementation.

# Storage Boundary

- Store all cross-border ecommerce plans, data templates, product master structures, runtime outputs, verification evidence, quote drafts, import tables, customer drafts, and execution checklists inside `cross-border-ecommerce-ai-route/**`.
- Use `cross-border-ecommerce-ai-route/runtime/**` for generated runtime artifacts and verification screenshots.
- Do not create new cross-border ecommerce business artifacts in the workspace root, root `runtime/`, or unrelated project folders.
- Other systems may keep minimal pointers to this project, such as a graph node that references `cross-border-ecommerce-ai-route/nodes/process-manifest.json`, but the substantive business content must remain in this folder.

# Safety

- Do not send real customer messages, emails, WhatsApp messages, LinkedIn messages, quotes, PI documents, invoices, customs declarations, payment instructions, or legal/compliance filings without explicit user confirmation.
- Use draft-only outputs for customer-facing content until a controlled-send implementation exists.
- For compliance, tax, customs, foreign exchange, product safety, advertising, and privacy matters, keep current-date verification and professional review gates.
- If a target market, product category, HS code, certification, or tax treatment is unknown, record it as a required input instead of inventing a final answer.

# Tool-First Orchestration

- Treat `docs/23-foreign-trade-orchestration-rules-v2.md` as the governing rule for foreign-trade workflow design and implementation.
- Before adding any new external-trade capability, node action, connector, scraper, product page builder, market research flow, site publishing flow, promotion flow, chatbot flow, or quotation flow, create or reference a `build_vs_buy_decision.v1` record.
- Prefer existing project capabilities, installed MCP/connectors/skills, official APIs, mature open-source libraries, low-code workflows, and SaaS/platform features before writing custom code.
- Custom code is allowed only as minimal glue after higher-priority options are checked and the rejection reasons are recorded.
- Product pages must not be built before `ProductMaster`, market evidence, compliance gates, and `product_page_build_pack.v1` exist.
- Independent-site publishing, customer outreach, ad spend, quote sending, payment instructions, filings, and shipment actions remain blocked until explicit human confirmation.

# Data Model

Every operational node should expose:

- `node_id`
- `owner_role`
- `inputs`
- `outputs`
- `source_artifacts`
- `control_actions`
- `required_human_gates`
- `event_writeback`
- `audit_evidence`

Map external observations into parent-system-style events where possible:

- `IntakeObservation`
- `RawEvent`
- `SemanticEvent`
- `ContextSnapshot`
- `TriggerPlan`
- `OutboundSendCommand`
- `ControlledSendCompletion`

# Verification

For document-only changes, verify that the directory exists and JSON files parse.

Suggested local checks:

```powershell
node -e "JSON.parse(require('fs').readFileSync('cross-border-ecommerce-ai-route/nodes/process-manifest.json','utf8')); JSON.parse(require('fs').readFileSync('cross-border-ecommerce-ai-route/nodes/node-catalog.json','utf8')); JSON.parse(require('fs').readFileSync('cross-border-ecommerce-ai-route/schemas/commerce-node.schema.json','utf8')); console.log('cross-border route json ok')"
```

# Style

- Write business docs in clear Chinese.
- Use concrete checklists, tables, node contracts, examples, and gates.
- Prefer auditable artifacts over broad strategy language.
- Keep implementation boundaries explicit: theory now, runtime after user approval.
