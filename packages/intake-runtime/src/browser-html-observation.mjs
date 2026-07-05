import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeIntakeObservation, nowIso, stableSlug } from './intake-normalizer.mjs';

function hashText(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function decodeHtmlEntities(text) {
  return String(text ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function stripHtml(html) {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html, fallback) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    ?? fallback;
  return stripHtml(title).slice(0, 120) || fallback;
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function relativeOrOriginal(root, filePath) {
  if (!filePath) return null;
  const relative = path.relative(root, filePath);
  return relative.startsWith('..') ? filePath : relative.replaceAll(path.sep, '/');
}

export function buildBrowserHtmlObservation({
  html,
  htmlPath = null,
  root = process.cwd(),
  adapterId = 'browser_dom.next',
  platform = 'web',
  pageUrl = null,
  capturedAt = nowIso(),
  privacyLevel = 'redacted_text',
  confidence = 0.76,
  maxContentChars = 1200,
  maxSummaryChars = 220,
  participantHints = ['user', 'web_page'],
  metadata = {}
} = {}) {
  if (typeof html !== 'string' || html.trim() === '') {
    throw new Error('buildBrowserHtmlObservation requires non-empty html');
  }
  const artifactRef = htmlPath ? relativeOrOriginal(root, htmlPath) : null;
  const title = extractTitle(html, pageUrl ?? artifactRef ?? 'saved_web_page');
  const text = stripHtml(html);
  const hash = hashText(`${pageUrl ?? ''}\n${html}`);
  const observation = normalizeIntakeObservation({
    observation_id: `intake_obs_browser_html_real_${hash.slice(0, 12)}`,
    source_adapter_id: adapterId,
    source_type: 'browser',
    platform,
    captured_at: capturedAt,
    content_text: truncateText(text, maxContentChars),
    content_summary: truncateText(`${title}: ${text}`, maxSummaryChars),
    participants_hint: participantHints,
    thread_hint: {
      url: pageUrl,
      page_title: title,
      artifact_ref: artifactRef
    },
    raw_artifact_refs: artifactRef ? [artifactRef] : [],
    privacy_level: privacyLevel,
    confidence,
    metadata: {
      ...metadata,
      generated_by: 'browser_html_observation.v1',
      source_html_sha256: `sha256:${hash}`,
      page_slug: stableSlug(title),
      real_execution_allowed: false,
      real_send_attempted: false
    }
  });
  return observation;
}

export function writeBrowserHtmlObservation({
  htmlPath,
  outputDir,
  root = process.cwd(),
  ...options
}) {
  const absoluteHtmlPath = path.resolve(root, htmlPath);
  const html = readFileSync(absoluteHtmlPath, 'utf8');
  const observation = buildBrowserHtmlObservation({
    ...options,
    html,
    htmlPath: absoluteHtmlPath,
    root
  });
  mkdirSync(outputDir, { recursive: true });
  const observationPath = path.join(outputDir, 'intake-observation.real.json');
  const reportPath = path.join(outputDir, 'browser-html-observation-report.json');
  const markdownPath = path.join(outputDir, 'browser-html-observation-report.md');
  const report = {
    schema_version: 'browser_html_observation_report.v1',
    observation_id: observation.observation_id,
    source_adapter_id: observation.source_adapter_id,
    source_type: observation.source_type,
    platform: observation.platform,
    html_path: relativeOrOriginal(root, absoluteHtmlPath),
    observation_path: relativeOrOriginal(root, observationPath),
    real_execution_allowed: false,
    real_send_attempted: false,
    content_chars: observation.content_text?.length ?? 0,
    summary_chars: observation.content_summary.length,
    validation_command: `node scripts/validate-intake-observation.mjs --input=${relativeOrOriginal(root, observationPath)}`,
    next_bridge_command: `node scripts/run-desktop-context-bridge.mjs --observation=${relativeOrOriginal(root, observationPath)}`
  };
  writeFileSync(observationPath, `${JSON.stringify(observation, null, 2)}\n`, 'utf8');
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderBrowserHtmlObservationMarkdown(report, observation), 'utf8');
  return {
    observation,
    report,
    observation_path: observationPath,
    report_path: reportPath,
    markdown_path: markdownPath
  };
}

export function renderBrowserHtmlObservationMarkdown(report, observation) {
  return `# Browser HTML Observation

- observation_id: ${report.observation_id}
- source_adapter_id: ${report.source_adapter_id}
- platform: ${report.platform}
- real_execution_allowed: ${report.real_execution_allowed}
- real_send_attempted: ${report.real_send_attempted}
- html_path: ${report.html_path}
- observation_path: ${report.observation_path}

## Summary

${observation.content_summary}

## Next Commands

\`\`\`powershell
${report.validation_command}
${report.next_bridge_command}
\`\`\`
`;
}
