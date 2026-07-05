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

function resolveMaybeRelative(root, filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
}

function walkFiles(dirPath, matcher, results = []) {
  if (!existsSync(dirPath)) return results;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, matcher, results);
    } else if (!matcher || matcher(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function newestFile(files) {
  return files
    .filter((filePath) => existsSync(filePath))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .at(0) ?? null;
}

function latestNestedFile(dir, fileName) {
  return newestFile(walkFiles(dir, (filePath) => path.basename(filePath) === fileName));
}

function latestDuplicateReviewForRoot(root) {
  return walkFiles(
    path.join(root, 'runtime/read-only-duplicate-observation-reviews'),
    (filePath) => path.basename(filePath) === 'read-only-duplicate-observation-review.json'
  )
    .filter((filePath) => {
      const review = readJson(filePath, null);
      return path.resolve(review?.source?.root ?? root) === path.resolve(root);
    })
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .at(0) ?? null;
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

function normalizeDecisionValue(value) {
  const normalized = String(value ?? '').trim();
  if (['accept_suppression', 'reject_suppression', 'needs_more_review'].includes(normalized)) {
    return normalized;
  }
  return 'needs_more_review';
}

function groupKey(group) {
  return String(group.observation_id ?? group.representative_path ?? 'unknown');
}

function decisionKey(decision) {
  return String(decision.observation_id ?? decision.representative_path ?? 'unknown');
}

function samePathSet(left = [], right = []) {
  const a = [...left].map(String).sort();
  const b = [...right].map(String).sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function decisionForGroup(decisions, group) {
  const key = groupKey(group);
  return decisions.find((decision) => decisionKey(decision) === key) ?? null;
}

function buildDecisionTemplate(review) {
  return {
    schema_version: 'read_only_duplicate_observation_confirmation_decision.v1',
    review_id: review.review_id ?? '',
    operator: {
      operator_id: '',
      operator_name: '',
      confirmed_at: nowIso()
    },
    decisions: (review.groups ?? []).map((group) => ({
      observation_id: group.observation_id,
      decision: group.deterministic_suppression_ready ? 'accept_suppression' : 'needs_more_review',
      reason: group.deterministic_suppression_ready
        ? 'Automated evidence shows the observation id, adapter, platform, summary, screenshot size and send-blocking state match; operator may confirm duplicate suppression after review.'
        : 'Automated evidence is not sufficient; keep this group for manual review.',
      confirmed_paths: group.paths ?? []
    })),
    notes: 'Fill operator_id/operator_name and review each decision before applying. Do not use this unchanged template as proof unless the operator actually reviewed it.'
  };
}

export function buildReadOnlyDuplicateObservationConfirmation({
  root = projectRoot(),
  reviewPath = latestDuplicateReviewForRoot(root),
  decisionPath = null,
  decision = null
} = {}) {
  const absoluteReviewPath = resolveMaybeRelative(root, reviewPath);
  const absoluteDecisionPath = resolveMaybeRelative(root, decisionPath);
  const review = readJson(absoluteReviewPath, {});
  const decisionInput = decision ?? readJson(absoluteDecisionPath, null);
  const template = buildDecisionTemplate(review);
  const decisions = Array.isArray(decisionInput?.decisions) ? decisionInput.decisions : [];
  const reviewGroups = review.groups ?? [];
  const decidedGroups = reviewGroups.map((group) => {
    const matched = decisionForGroup(decisions, group);
    const normalizedDecision = normalizeDecisionValue(matched?.decision);
    const pathsMatch = matched
      ? samePathSet(matched.confirmed_paths ?? [], group.paths ?? [])
      : false;
    const accepted = normalizedDecision === 'accept_suppression'
      && group.deterministic_suppression_ready === true
      && group.evidence_summary?.all_real_send_blocked === true
      && pathsMatch;
    return {
      observation_id: group.observation_id,
      platform: group.platform ?? null,
      count: group.count ?? 0,
      deterministic_suppression_ready: group.deterministic_suppression_ready === true,
      all_real_send_blocked: group.evidence_summary?.all_real_send_blocked === true,
      paths: group.paths ?? [],
      decision_found: Boolean(matched),
      decision: normalizedDecision,
      reason: matched?.reason ?? null,
      confirmed_paths: matched?.confirmed_paths ?? [],
      paths_match: pathsMatch,
      accepted
    };
  });
  const knownKeys = new Set(reviewGroups.map(groupKey));
  const unknownDecisions = decisions.filter((item) => !knownKeys.has(decisionKey(item)));
  const allGroupsAccepted = decidedGroups.length > 0 && decidedGroups.every((group) => group.accepted);
  const hasDecision = Boolean(decisionInput);

  const checks = [
    makeCheck('duplicate_review_present', Boolean(review.review_id), [
      `review_id=${review.review_id ?? 'missing'}`,
      `review_path=${relativeOrNull(root, absoluteReviewPath) ?? 'missing'}`
    ]),
    makeCheck('confirmation_decision_present', hasDecision, [
      `decision_path=${relativeOrNull(root, absoluteDecisionPath) ?? 'not_provided'}`
    ], hasDecision ? 'required' : 'warning'),
    makeCheck('decision_review_id_matches', !hasDecision || decisionInput.review_id === review.review_id, [
      `decision_review_id=${decisionInput?.review_id ?? 'missing'}`,
      `review_id=${review.review_id ?? 'missing'}`
    ]),
    makeCheck('all_duplicate_groups_decided', !hasDecision || decidedGroups.every((group) => group.decision_found), [
      `decided=${decidedGroups.filter((group) => group.decision_found).length}`,
      `groups=${decidedGroups.length}`
    ]),
    makeCheck('no_unknown_duplicate_decisions', !hasDecision || unknownDecisions.length === 0, [
      `unknown_decisions=${unknownDecisions.map(decisionKey).join(',') || 'none'}`
    ]),
    makeCheck('accepted_groups_have_deterministic_evidence', !hasDecision || decidedGroups
      .filter((group) => group.decision === 'accept_suppression')
      .every((group) => group.deterministic_suppression_ready), decidedGroups.map((group) =>
      `${group.observation_id ?? 'unknown'} deterministic=${group.deterministic_suppression_ready}`
    )),
    makeCheck('accepted_groups_paths_match_review', !hasDecision || decidedGroups
      .filter((group) => group.decision === 'accept_suppression')
      .every((group) => group.paths_match), decidedGroups.map((group) =>
      `${group.observation_id ?? 'unknown'} paths_match=${group.paths_match}`
    )),
    makeCheck('accepted_groups_keep_real_send_blocked', !hasDecision || decidedGroups
      .filter((group) => group.decision === 'accept_suppression')
      .every((group) => group.all_real_send_blocked), decidedGroups.map((group) =>
      `${group.observation_id ?? 'unknown'} all_real_send_blocked=${group.all_real_send_blocked}`
    )),
    makeCheck('all_duplicate_groups_accepted', !hasDecision || allGroupsAccepted, [
      `accepted=${decidedGroups.filter((group) => group.accepted).length}`,
      `groups=${decidedGroups.length}`
    ], 'warning')
  ];
  const requiredFailures = checks
    .filter((check) => check.severity === 'required' && !check.passed)
    .map((check) => check.check_id);
  const warningFailures = checks
    .filter((check) => check.severity === 'warning' && !check.passed)
    .map((check) => check.check_id);
  const duplicateSuppressionConfirmed = hasDecision
    && requiredFailures.length === 0
    && allGroupsAccepted;

  return {
    schema_version: 'read_only_duplicate_observation_confirmation.v1',
    confirmation_id: `read_only_duplicate_observation_confirmation_${timestampId()}`,
    created_at: nowIso(),
    gate_decision: !hasDecision
      ? 'duplicate_observation_confirmation_template_written'
      : requiredFailures.length
        ? 'duplicate_observation_confirmation_needs_attention'
        : duplicateSuppressionConfirmed
          ? 'duplicate_observation_suppression_confirmed'
          : 'duplicate_observation_confirmation_waiting_acceptance',
    real_execution_allowed: false,
    real_send_attempted: false,
    source: {
      root,
      review_path: relativeOrNull(root, absoluteReviewPath),
      decision_path: relativeOrNull(root, absoluteDecisionPath),
      read_only_expansion_status_path: review.source?.read_only_expansion_status_path ?? null
    },
    summary: {
      review_id: review.review_id ?? null,
      decision_present: hasDecision,
      duplicate_group_count: decidedGroups.length,
      accepted_group_count: decidedGroups.filter((group) => group.accepted).length,
      duplicate_suppression_confirmed: duplicateSuppressionConfirmed,
      operator_confirmation_recorded: hasDecision && requiredFailures.length === 0
    },
    operator: decisionInput?.operator ?? null,
    groups: decidedGroups,
    unknown_decisions: unknownDecisions,
    decision_template: template,
    checks,
    required_failures: requiredFailures,
    warning_failures: warningFailures,
    next_actions: duplicateSuppressionConfirmed
      ? [
        'Rerun npm run intake:read-only:status to let the status layer close duplicate_observation_ids_need_review.',
        'Rerun npm run intake:read-only:targets and npm run intake:read-only:workpack.'
      ]
      : hasDecision
        ? [
          'Fix confirmation required failures or change unresolved decisions to accept_suppression only after operator review.',
          'Do not count duplicate observations as extra effective samples.'
        ]
        : [
          'Review duplicate-confirmation-decision.template.json, fill operator fields, and save a reviewed decision file.',
          'Run npm run intake:read-only:duplicate:confirm -- --review=<review.json> --decision=<decision.json> --fail-on-required.'
        ]
  };
}

export function renderReadOnlyDuplicateObservationConfirmationMarkdown(confirmation) {
  const groups = confirmation.groups.length
    ? confirmation.groups.map((group) => `| ${group.observation_id} | ${group.decision_found ? 'yes' : 'no'} | ${group.decision} | ${group.paths_match} | ${group.accepted} |`)
      .join('\n')
    : '| none | no | none | false | false |';
  const checks = confirmation.checks
    .map((check) => `| ${check.check_id} | ${check.severity} | ${check.status} | ${check.evidence.join('<br>')} |`)
    .join('\n');
  return `# Read-only Duplicate Observation Confirmation

- confirmation_id: ${confirmation.confirmation_id}
- gate_decision: ${confirmation.gate_decision}
- review_id: ${confirmation.summary.review_id ?? 'missing'}
- duplicate_suppression_confirmed: ${confirmation.summary.duplicate_suppression_confirmed}
- operator_confirmation_recorded: ${confirmation.summary.operator_confirmation_recorded}
- real_execution_allowed: ${confirmation.real_execution_allowed}
- real_send_attempted: ${confirmation.real_send_attempted}

## Groups

| observation_id | decision_found | decision | paths_match | accepted |
| --- | --- | --- | --- | --- |
${groups}

## Checks

| check_id | severity | status | evidence |
| --- | --- | --- | --- |
${checks}

## Next Actions

${confirmation.next_actions.map((item) => `- ${item}`).join('\n')}
`;
}

export function writeReadOnlyDuplicateObservationConfirmation({
  confirmation,
  outputDir = path.join(confirmation.source?.root ?? projectRoot(), 'runtime/read-only-duplicate-observation-confirmations', confirmation.confirmation_id)
}) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'read-only-duplicate-observation-confirmation.json');
  const markdownPath = path.join(outputDir, 'read-only-duplicate-observation-confirmation.md');
  const templatePath = path.join(outputDir, 'duplicate-confirmation-decision.template.json');
  writeFileSync(jsonPath, `${JSON.stringify(confirmation, null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderReadOnlyDuplicateObservationConfirmationMarkdown(confirmation), 'utf8');
  writeFileSync(templatePath, `${JSON.stringify(confirmation.decision_template, null, 2)}\n`, 'utf8');
  return {
    output_dir: outputDir,
    json_path: jsonPath,
    markdown_path: markdownPath,
    template_path: templatePath
  };
}
