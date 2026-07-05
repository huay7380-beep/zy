import path from 'node:path';
import {
  buildControlledSendCommandPreflight,
  writeControlledSendCommandPreflight
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/check-controlled-send-command.mjs [--input=<OutboundSendCommand.json>] [--box-regions=<BoxRegions.json>] [--output-dir=<dir>] [--require-box-regions] [--fail-on-required]',
    '',
    'Defaults:',
    '  --input=runtime/user-inputs/controlled-send-command.real.json',
    '  --box-regions=runtime/user-inputs/controlled-send-box-regions.real.json',
    '  --output-dir=runtime/desktop-controlled-send-command-preflights/<preflight_id>',
    '',
    'This command never sends a message. It only checks whether command material is ready for desktop:send:prepare-controlled.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
  process.exit(0);
}

const inputPath = path.resolve(argValue('input') ?? 'runtime/user-inputs/controlled-send-command.real.json');
const boxRegionsPath = path.resolve(argValue('box-regions') ?? 'runtime/user-inputs/controlled-send-box-regions.real.json');
const requireBoxRegions = process.argv.includes('--require-box-regions');

const preflight = buildControlledSendCommandPreflight({
  commandPath: inputPath,
  boxRegionsPath,
  requireBoxRegions
});

const outputDir = path.resolve(
  argValue('output-dir') ?? path.join('runtime/desktop-controlled-send-command-preflights', preflight.preflight_id)
);
const paths = writeControlledSendCommandPreflight({ preflight, outputDir });

console.log(JSON.stringify({
  command: 'check-controlled-send-command',
  preflight_id: preflight.preflight_id,
  gate_decision: preflight.gate_decision,
  ready_for_prepare_controlled: preflight.ready_for_prepare_controlled,
  real_send_attempted: preflight.real_send_attempted,
  required_failures: preflight.required_failures,
  warnings: preflight.warnings,
  json_path: paths.json_path,
  markdown_path: paths.markdown_path,
  next_commands: preflight.next_commands
}, null, 2));

if (process.argv.includes('--fail-on-required') && preflight.required_failures.length > 0) {
  process.exitCode = 2;
}
