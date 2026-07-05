import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  evaluateSendCommandForExecution,
  normalizeOutboundSendCommand,
  runSendCommandDryRun
} from './send-command-validator.mjs';

function nowIso() {
  return new Date().toISOString();
}

function writeJson(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function commandSummary(command) {
  return {
    send_command_id: command.send_command_id,
    event_id: command.event_id,
    decision_id: command.decision_id,
    trigger_id: command.trigger_id,
    target_platform: command.target_platform,
    target_person_id: command.target_person_id ?? null,
    target_thread_hint: command.target_thread_hint,
    message_draft_length: command.message_draft.length,
    message_draft_sha256: sha256Text(command.message_draft),
    requires_user_confirmation: command.requires_user_confirmation,
    user_confirmed: command.user_confirmed,
    real_execution_allowed: command.real_execution_allowed,
    safety_checks: command.safety_checks,
    metadata: command.metadata
  };
}

function metadataFailures(command) {
  const metadata = command.metadata ?? {};
  const failures = [];
  if (metadata.controlled_send_scope !== 'test_account_or_test_window') {
    failures.push('metadata.controlled_send_scope_must_be_test_account_or_test_window');
  }
  if (metadata.no_production_contact !== true) {
    failures.push('metadata.no_production_contact_must_be_true');
  }
  if (metadata.operator_confirmation !== 'confirmed_for_controlled_send') {
    failures.push('metadata.operator_confirmation_missing');
  }
  if (typeof metadata.operator_confirmed_at !== 'string' || metadata.operator_confirmed_at.trim() === '') {
    failures.push('metadata.operator_confirmed_at_missing');
  }
  return failures;
}

function collectPlaceholderPaths(value, prefix = '$') {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      trimmed === 'send_command_controlled_real_template'
      || trimmed.includes('replace_with_')
      || trimmed.includes('<vision_api_key>')
    ) {
      return [prefix];
    }
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectPlaceholderPaths(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => collectPlaceholderPaths(item, `${prefix}.${key}`));
  }
  return [];
}

function rectFailures(name, rect) {
  const failures = [];
  if (!rect || typeof rect !== 'object' || Array.isArray(rect)) {
    return [`box_regions.${name}_missing`];
  }
  for (const field of ['x', 'y', 'width', 'height']) {
    if (typeof rect[field] !== 'number' || !Number.isFinite(rect[field])) {
      failures.push(`box_regions.${name}.${field}_must_be_number`);
    }
  }
  if (typeof rect.width === 'number' && rect.width <= 0) {
    failures.push(`box_regions.${name}.width_must_be_positive`);
  }
  if (typeof rect.height === 'number' && rect.height <= 0) {
    failures.push(`box_regions.${name}.height_must_be_positive`);
  }
  return failures;
}

function validateBoxRegions(regions) {
  const failures = [
    ...rectFailures('contactList', regions?.contactList),
    ...rectFailures('chatMain', regions?.chatMain),
    ...rectFailures('inputBox', regions?.inputBox)
  ];
  if (regions?.unreadIndicator !== null && regions?.unreadIndicator !== undefined) {
    failures.push(...rectFailures('unreadIndicator', regions.unreadIndicator));
  }
  if (regions?.scaleFactor !== undefined && (typeof regions.scaleFactor !== 'number' || regions.scaleFactor <= 0)) {
    failures.push('box_regions.scaleFactor_must_be_positive_number');
  }
  if (regions?.capturedAt !== undefined && typeof regions.capturedAt !== 'number') {
    failures.push('box_regions.capturedAt_must_be_number');
  }
  return failures;
}

function boxRegionsSummary(regions) {
  return {
    has_contact_list: Boolean(regions.contactList),
    has_chat_main: Boolean(regions.chatMain),
    has_input_box: Boolean(regions.inputBox),
    has_unread_indicator: Boolean(regions.unreadIndicator),
    display_id: regions.displayId ?? null,
    scale_factor: regions.scaleFactor ?? null,
    captured_at: regions.capturedAt ?? null
  };
}

function readJsonReport(filePath, reader) {
  try {
    return {
      ok: true,
      value: JSON.parse(reader(filePath, 'utf8'))
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildPrepareCommand({ commandPath, boxRegionsPath, requireBoxRegions }) {
  const args = [
    'npm.cmd run desktop:send:prepare-controlled --',
    `--input=${psQuote(commandPath)}`
  ];
  if (requireBoxRegions) {
    args.push(`--box-regions=${psQuote(boxRegionsPath)}`);
    args.push('--require-box-regions');
  }
  args.push('--fail-on-not-ready');
  return args.join(' ');
}

function buildNextActions({ commandExists, ready, failures, requireBoxRegions }) {
  if (!commandExists) {
    return [
      'Create runtime/user-inputs/controlled-send-command.real.json from the generated template.',
      'Replace every placeholder with a real test account or test window value only.',
      'Keep production contacts out of the command material.'
    ];
  }
  if (!ready) {
    return [
      'Fix required_failures before running desktop:send:prepare-controlled.',
      requireBoxRegions
        ? 'Provide ready box regions or rerun without --require-box-regions if the real runner will use a vision API key.'
        : 'If using box regions, rerun with --require-box-regions after filling controlled-send-box-regions.real.json.',
      failures.includes('controlled_send_command_has_template_placeholders')
        ? 'Remove all replace_with_* placeholders from the command file.'
        : 'Keep real execution blocked until user confirmation, target verification and permission evidence are complete.'
    ];
  }
  return [
    'Run the prepare command from next_commands.prepare_controlled.',
    'Confirm the real test window is active before any Sightflow real runner command.',
    'After the runner writes a result, run desktop:send:complete-controlled and desktop:intake:audit.'
  ];
}

export function buildControlledSendCommandPreflight({
  root = process.cwd(),
  commandPath = path.resolve(root, 'runtime/user-inputs/controlled-send-command.real.json'),
  boxRegionsPath = path.resolve(root, 'runtime/user-inputs/controlled-send-box-regions.real.json'),
  requireBoxRegions = false,
  reader = readFileSync,
  fileExists = existsSync,
  createdAt = nowIso()
} = {}) {
  const resolvedCommandPath = path.resolve(commandPath);
  const resolvedBoxRegionsPath = path.resolve(boxRegionsPath);
  const commandTemplatePath = path.resolve(root, 'runtime/user-inputs/templates/controlled-send-command.real.template.json');
  const boxRegionsTemplatePath = path.resolve(root, 'runtime/user-inputs/templates/controlled-send-box-regions.real.template.json');
  const commandExists = fileExists(resolvedCommandPath);
  const boxRegionsExists = fileExists(resolvedBoxRegionsPath);
  const requiredFailures = [];
  const warnings = [];

  let command = null;
  let commandReadError = null;
  let dryRunSendResult = null;
  let placeholderPaths = [];

  if (!commandExists) {
    requiredFailures.push('controlled_send_command_missing');
  } else {
    const readReport = readJsonReport(resolvedCommandPath, reader);
    if (!readReport.ok) {
      requiredFailures.push('controlled_send_command_invalid_json');
      commandReadError = readReport.error;
    } else {
      try {
        command = normalizeOutboundSendCommand(readReport.value);
        placeholderPaths = collectPlaceholderPaths(readReport.value);
        if (placeholderPaths.length > 0) {
          requiredFailures.push('controlled_send_command_has_template_placeholders');
        }
        const evaluation = evaluateSendCommandForExecution(command);
        const metadataChecks = metadataFailures(command);
        requiredFailures.push(...evaluation.blocked_reasons, ...metadataChecks);
        dryRunSendResult = runSendCommandDryRun(command, {
          executor: 'desktop-controlled-send-command-preflight',
          evidenceRefs: [resolvedCommandPath]
        });
      } catch (error) {
        requiredFailures.push('controlled_send_command_invalid_contract');
        commandReadError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  let boxRegionsReady = false;
  let boxRegionsFailures = [];
  let boxRegionsRequiredFailures = [];
  let boxRegionsReadError = null;
  let boxRegions = null;

  if (!boxRegionsExists) {
    boxRegionsFailures = ['controlled_send_box_regions_missing'];
  } else {
    const readReport = readJsonReport(resolvedBoxRegionsPath, reader);
    if (!readReport.ok) {
      boxRegionsFailures = ['controlled_send_box_regions_invalid_json'];
      boxRegionsReadError = readReport.error;
    } else {
      boxRegions = readReport.value;
      boxRegionsFailures = validateBoxRegions(boxRegions);
      boxRegionsReady = boxRegionsFailures.length === 0;
    }
  }
  boxRegionsRequiredFailures = requireBoxRegions ? boxRegionsFailures : [];
  requiredFailures.push(...boxRegionsRequiredFailures);
  if (!requireBoxRegions && boxRegionsFailures.length > 0) {
    warnings.push('box_regions_not_ready_but_not_required');
  }

  const uniqueFailures = [...new Set(requiredFailures)];
  const ready = uniqueFailures.length === 0;

  return {
    schema_version: 'controlled_send_command_preflight.v1',
    preflight_id: `controlled_send_command_preflight_${Date.now()}`,
    gate_decision: !commandExists
      ? 'controlled_send_command_missing'
      : ready
        ? 'controlled_send_command_ready_for_prepare_controlled'
        : 'controlled_send_command_needs_attention',
    ready_for_prepare_controlled: ready,
    real_send_attempted: false,
    command_path: resolvedCommandPath,
    command_exists: commandExists,
    command_template_path: commandTemplatePath,
    command_read_error: commandReadError,
    placeholder_paths: placeholderPaths,
    box_regions_path: resolvedBoxRegionsPath,
    box_regions_exists: boxRegionsExists,
    box_regions_ready: boxRegionsReady,
    box_regions_required: requireBoxRegions,
    box_regions_template_path: boxRegionsTemplatePath,
    box_regions_failures: boxRegionsFailures,
    box_regions_required_failures: boxRegionsRequiredFailures,
    box_regions_read_error: boxRegionsReadError,
    box_regions_summary: boxRegionsReady ? boxRegionsSummary(boxRegions) : null,
    command: command ? commandSummary(command) : null,
    dry_run_send_result: dryRunSendResult,
    required_failures: uniqueFailures,
    warnings,
    next_commands: {
      prepare_controlled: buildPrepareCommand({
        commandPath: resolvedCommandPath,
        boxRegionsPath: resolvedBoxRegionsPath,
        requireBoxRegions
      }),
      handoff: 'npm.cmd run desktop:send:handoff'
    },
    next_actions: buildNextActions({
      commandExists,
      ready,
      failures: uniqueFailures,
      requireBoxRegions
    }),
    created_at: createdAt
  };
}

export function writeControlledSendCommandPreflight({
  preflight,
  outputDir = path.resolve('runtime/desktop-controlled-send-command-preflights', preflight.preflight_id)
}) {
  const jsonPath = path.join(outputDir, 'controlled-send-command-preflight.json');
  const markdownPath = path.join(outputDir, 'controlled-send-command-preflight.md');
  writeJson(jsonPath, preflight);
  writeFileSync(markdownPath, [
    '# Controlled Send Command Preflight',
    '',
    `- preflight_id: ${preflight.preflight_id}`,
    `- gate_decision: ${preflight.gate_decision}`,
    `- ready_for_prepare_controlled: ${preflight.ready_for_prepare_controlled}`,
    `- real_send_attempted: ${preflight.real_send_attempted}`,
    `- command_path: ${preflight.command_path}`,
    `- command_exists: ${preflight.command_exists}`,
    `- box_regions_path: ${preflight.box_regions_path}`,
    `- box_regions_required: ${preflight.box_regions_required}`,
    `- box_regions_ready: ${preflight.box_regions_ready}`,
    `- required_failures: ${preflight.required_failures.join(', ') || 'none'}`,
    `- warnings: ${preflight.warnings.join(', ') || 'none'}`,
    '',
    '## Next Commands',
    '',
    '```powershell',
    preflight.next_commands.prepare_controlled,
    preflight.next_commands.handoff,
    '```',
    '',
    '## Next Actions',
    '',
    ...preflight.next_actions.map((item) => `- ${item}`)
  ].join('\n'), 'utf8');
  return {
    json_path: jsonPath,
    markdown_path: markdownPath
  };
}
