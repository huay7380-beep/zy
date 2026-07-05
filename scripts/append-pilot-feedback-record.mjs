#!/usr/bin/env node
import path from 'node:path';
import {
  buildPilotFeedbackAppend,
  writePilotFeedbackAppend
} from '../packages/mvp-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/append-pilot-feedback-record.mjs --pilot-import=<PilotImportBatch.json>',
    '  node scripts/append-pilot-feedback-record.mjs --pilot-import=<PilotImportBatch.json> --feedback=<feedback.json>',
    '',
    'Options:',
    '  --root=<dir>                  Workspace root. Defaults to current directory.',
    '  --pilot-import=<file>          PilotImportBatch JSON file to inspect or append to.',
    '  --feedback=<file>              Optional real feedback record JSON. Omit to write a template only.',
    '  --output-dir=<dir>             Defaults to runtime/pilot-feedback-append/<report_id>.',
    '  --fail-on-required             Exit with code 2 when appended output still has required failures.',
    '',
    'Template mode never changes the PilotImportBatch. Append mode writes pilot-import.with-feedback.json and keeps real sending blocked.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
} else {
  const pilotImportPath = argValue('pilot-import');
  if (!pilotImportPath) {
    console.error(usage());
    process.exitCode = 1;
  } else {
    const root = argValue('root') ? path.resolve(argValue('root')) : process.cwd();
    const feedbackPath = argValue('feedback');
    const report = buildPilotFeedbackAppend({
      root,
      pilotImportPath,
      feedbackPath
    });
    const outputDir = argValue('output-dir')
      ? path.resolve(root, argValue('output-dir'))
      : undefined;
    const written = writePilotFeedbackAppend({ report, outputDir });

    console.log(JSON.stringify({
      command: 'append-pilot-feedback-record',
      report_id: report.report_id,
      gate_decision: report.gate_decision,
      real_execution_allowed: report.real_execution_allowed,
      real_send_attempted: report.real_send_attempted,
      pilot_import_path: report.source.pilot_import_path,
      feedback_path: report.source.feedback_path,
      before_ready_for_closed_loop_mvp: report.before_readiness.ready_for_closed_loop_mvp,
      after_ready_for_closed_loop_mvp: report.after_readiness?.ready_for_closed_loop_mvp ?? null,
      required_failures: report.required_failures,
      report_path: written.report_path,
      markdown_path: written.markdown_path,
      template_path: written.template_path,
      updated_pilot_import_path: written.updated_pilot_import_path
    }, null, 2));

    if (report.required_failures.length > 0 && process.argv.includes('--fail-on-required')) {
      process.exitCode = 2;
    }
  }
}
