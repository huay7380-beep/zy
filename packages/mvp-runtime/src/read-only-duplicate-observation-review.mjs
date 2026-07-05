import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function projectRoot() {
  return path.resolve(here, '../../..');
}

function nowIso() {
  return new Date().toISOString();
}

function timestampId(date = new Date()) {
  return date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function readJson(filePath, fallback = null) {
  if (!filePath || !existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function relativeOrNull(root, filePath) {
  if (!filePath) return null;
  const relative = path.relative(root, filePath);
  return relative.startsWith('..') ? filePath : relative.replaceAll(path.sep, '/');
}

function latestNestedFile(dir, fileName) {
  if (!existsSync(dir)) return null;
  return readdirSync(dir)
    .map((name) => path.join(dir, name, fileName))
    .filter((filePath) => existsSync(filePath) && statSync(filePath).isFile())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .at(0) ?? null;
}

function unique(items) {
  return [...new Set((items ?? []).filter((item) => item !== undefined && item !== null))];
}

function observationSummary(root, filePath) {
  const absolutePath = path.resolve(root, filePath);
  const observation = readJson(absolutePath, {});
  return {
    path: relativeOrNull(root, absolutePath),
    exists: existsSync(absolutePath),
    observation_id: observation.observation_id ?? null,
    source_adapter_id: observation.source_adapter_id ?? null,
    source_type: observation.source_type ?? null,
    platform: observation.platform ?? null,
    captured_at: observation.captured_at ?? null,
    content_summary: observation.content_summary ?? null,
    screenshot_bytes: observation.metadata?.screenshot_bytes ?? null,
    raw_artifact_refs: observation.raw_artifact_refs ?? [],
    real_execution_allowed: observation.metadata?.real_execution_allowed === true,
    real_send_attempted: observation.metadata?.real_send_attempted === true
  };
}

function makeCheck(checkId, passed, evidence, severity = 'required') {
  return {
    check_id: checkId,
    severity,
    status: passed ? 'pass' : 'fail',
    passed: Boolean(passed),
    evidence
  };
}

function summarizeGroup(root, group) {
  const observations = (group.paths ?? []).map((item) => observationSummary(root, item));
  const readableCount = observations.filter((item) => item.exists).length;
  const sameObservationId = unique(observations.map((item) => item.observation_id)).length === 1;
  const strictContentFingerprintReady = group.dedupe_level === 'strict_content_fingerprint'
    && group.content_fingerprint?.dedupe_ready === true
    && Boolean(group.content_fingerprint?.fingerprint);
  const sameAdapter = unique(observations.map((item) => item.source_adapter_id)).length === 1;
  const samePlatform = unique(observations.map((item) => item.platform)).length === 1;
  const sameSummary = unique(observations.map((item) => item.content_summary)).length === 1;
  const sameScreenshotBytes = unique(observations.map((item) => item.screenshot_bytes)).length <= 1;
  const allSendBlocked = observations.every((item) =>
    item.real_execution_allowed === false && item.real_send_attempted === false
  );
  const deterministicSuppressionReady = readableCount === observations.length
    && (sameObservationId || strictContentFingerprintReady)
    && sameAdapter
    && samePlatform
    && sameSummary
    && sameScreenshotBytes
    && allSendBlocked;

  return {
    observation_id: group.observation_id ?? observations[0]?.observation_id ?? null,
    dedupe_level: group.dedupe_level ?? 'observation_id',
    content_fingerprint: group.content_fingerprint ?? null,
    source_type: group.source_type ?? observations[0]?.source_type ?? null,
    platform: group.platform ?? observations[0]?.platform ?? null,
    count: group.count ?? observations.length,
    representative_path: group.representative_path ?? observations[0]?.path ?? null,
    paths: observations.map((item) => item.path),
    observations,
    evidence_summary: {
      readable_count: readableCount,
      same_observation_id: sameObservationId,
      strict_content_fingerprint_ready: strictContentFingerprintReady,
      same_source_adapter_id: sameAdapter,
      same_platform: samePlatform,
      same_content_summary: sameSummary,
      same_screenshot_bytes: sameScreenshotBytes,
      all_real_send_blocked: allSendBlocked
    },
    recommended_action: deterministicSuppressionReady
      ? 'accept_deduplication_pending_operator_confirmation'
      : 'manual_review_required_before_accepting_deduplication',
    operator_confirmation_required: true,
    deterministic_suppression_ready: deterministicSuppressionReady
  };
}

export function buildReadOnlyDuplicateObservationReview({
  root = projectRoot(),
  statusPath = latestNestedFile(path.join(root, 'runtime/read-only-expansion-status'), 'read-only-expansion-status.json')
} = {}) {
  const status = readJson(statusPath, {});
  const duplicateGroups = status.current_samples?.real_observations?.duplicate_observation_groups ?? [];
  const groups = duplicateGroups.map((group) => summarizeGroup(root, group));
  const checks = [
    makeCheck('read_only_expansion_status_present', Boolean(status.status_id), [
      `status_id=${status.status_id ?? 'missing'}`,
      `status_path=${relativeOrNull(root, statusPath) ?? 'missing'}`
    ]),
    makeCheck('duplicate_groups_loaded', duplicateGroups.length > 0, [
      `duplicate_groups=${duplicateGroups.length}`
    ], 'warning'),
    makeCheck('duplicate_observation_files_readable', groups.every((group) =>
      group.evidence_summary.readable_count === group.count
    ), groups.map((group) =>
      `${group.observation_id ?? 'unknown'} readable=${group.evidence_summary.readable_count}/${group.count}`
    )),
    makeCheck('duplicate_observations_real_send_blocked', groups.every((group) =>
      group.evidence_summary.all_real_send_blocked
    ), groups.map((group) =>
      `${group.observation_id ?? 'unknown'} all_real_send_blocked=${group.evidence_summary.all_real_send_blocked}`
    )),
    makeCheck('deterministic_deduplication_evidence_ready', groups.every((group) =>
      group.deterministic_suppression_ready
    ), groups.map((group) =>
      `${group.observation_id ?? 'unknown'} deterministic=${group.deterministic_suppression_ready}`
    )),
    makeCheck('operator_confirmation_required', false, [
      'Automated evidence can recommend suppression, but a human/operator confirmation is still required before closing the duplicate review warning.'
    ], 'warning')
  ];
  const requiredFailures = checks
    .filter((check) => check.severity === 'required' && !check.passed)
    .map((check) => check.check_id);
  const warningFailures = checks
    .filter((check) => check.severity === 'warning' && !check.passed)
    .map((check) => check.check_id);

  return {
    schema_version: 'read_only_duplicate_observation_review.v1',
    review_id: `read_only_duplicate_observation_review_${timestampId()}`,
    created_at: nowIso(),
    gate_decision: requiredFailures.length
      ? 'duplicate_observation_review_needs_attention'
      : 'duplicate_observation_review_ready_for_operator_confirmation',
    real_execution_allowed: false,
    real_send_attempted: false,
    source: {
      root,
      read_only_expansion_status_path: relativeOrNull(root, statusPath)
    },
    summary: {
      duplicate_group_count: groups.length,
      duplicate_observation_count: groups.reduce((sum, group) => sum + group.count, 0),
      deterministic_suppression_ready_groups: groups.filter((group) => group.deterministic_suppression_ready).length,
      operator_confirmation_required: groups.length > 0
    },
    groups,
    checks,
    required_failures: requiredFailures,
    warning_failures: warningFailures,
    next_actions: groups.length
      ? [
        'Operator should confirm whether each recommended duplicate suppression is acceptable.',
        'After confirmation, keep only the effective observation count for sample-growth claims and preserve all duplicate paths as audit evidence.',
        'Rerun npm run intake:read-only:status and npm run mvp:status after recording the review outcome.'
      ]
      : [
        'No duplicate observation groups were found in the latest read-only expansion status.',
        'Continue collecting read-only samples through unified intake lanes.'
      ]
  };
}

export function renderReadOnlyDuplicateObservationReviewMarkdown(review) {
  const groups = review.groups.length
    ? review.groups.map((group) => `## ${group.observation_id ?? 'unknown'}

- platform: ${group.platform ?? 'unknown'}
- count: ${group.count}
- recommended_action: ${group.recommended_action}
- deterministic_suppression_ready: ${group.deterministic_suppression_ready}
- operator_confirmation_required: ${group.operator_confirmation_required}
- same_observation_id: ${group.evidence_summary.same_observation_id}
- same_source_adapter_id: ${group.evidence_summary.same_source_adapter_id}
- same_platform: ${group.evidence_summary.same_platform}
- same_content_summary: ${group.evidence_summary.same_content_summary}
- same_screenshot_bytes: ${group.evidence_summary.same_screenshot_bytes}
- all_real_send_blocked: ${group.evidence_summary.all_real_send_blocked}

${group.paths.map((item) => `- ${item}`).join('\n')}
`).join('\n')
    : 'No duplicate groups found.';
  const checks = review.checks
    .map((check) => `| ${check.check_id} | ${check.severity} | ${check.status} | ${check.evidence.join('<br>')} |`)
    .join('\n');
  return `# Read-only Duplicate Observation Review

- review_id: ${review.review_id}
- gate_decision: ${review.gate_decision}
- real_execution_allowed: ${review.real_execution_allowed}
- real_send_attempted: ${review.real_send_attempted}
- duplicate_group_count: ${review.summary.duplicate_group_count}
- deterministic_suppression_ready_groups: ${review.summary.deterministic_suppression_ready_groups}
- operator_confirmation_required: ${review.summary.operator_confirmation_required}

${groups}

## Checks

| check_id | severity | status | evidence |
| --- | --- | --- | --- |
${checks}

## Next Actions

${review.next_actions.map((item) => `- ${item}`).join('\n')}
`;
}

export function writeReadOnlyDuplicateObservationReview({
  review,
  outputDir = path.join(review.source?.root ?? projectRoot(), 'runtime/read-only-duplicate-observation-reviews', review.review_id)
}) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'read-only-duplicate-observation-review.json');
  const markdownPath = path.join(outputDir, 'read-only-duplicate-observation-review.md');
  writeFileSync(jsonPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderReadOnlyDuplicateObservationReviewMarkdown(review), 'utf8');
  return {
    output_dir: outputDir,
    json_path: jsonPath,
    markdown_path: markdownPath
  };
}
