import path from 'node:path';
import {
  buildControlledSendMaterialKit,
  writeControlledSendMaterialKit
} from '../packages/intake-runtime/src/index.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/init-controlled-send-material-kit.mjs [--command-target=<OutboundSendCommand.json>] [--box-regions-target=<BoxRegions.json>] [--output-dir=<dir>]',
    '',
    'Defaults:',
    '  --command-target=runtime/user-inputs/controlled-send-command.real.json',
    '  --box-regions-target=runtime/user-inputs/controlled-send-box-regions.real.json',
    '  --output-dir=runtime/controlled-send-material-kits/<kit_id>',
    '',
    'This command only writes templates, checklists and next commands. It never sends a message.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
  process.exit(0);
}

const root = process.cwd();
const commandTargetPath = path.resolve(argValue('command-target') ?? 'runtime/user-inputs/controlled-send-command.real.json');
const boxRegionsTargetPath = path.resolve(argValue('box-regions-target') ?? 'runtime/user-inputs/controlled-send-box-regions.real.json');
const outputDir = argValue('output-dir') ? path.resolve(argValue('output-dir')) : null;

const kit = buildControlledSendMaterialKit({
  root,
  commandTargetPath,
  boxRegionsTargetPath,
  outputDir
});
const written = writeControlledSendMaterialKit({ kit });

console.log(JSON.stringify({
  command: 'init-controlled-send-material-kit',
  kit_id: kit.kit_id,
  gate_decision: kit.gate_decision,
  real_send_attempted: kit.real_send_attempted,
  command_target_path: kit.command_target_path,
  box_regions_target_path: kit.box_regions_target_path,
  next_command_check_with_box_regions: kit.next_commands.command_check_with_box_regions,
  next_readiness_with_box_regions: kit.next_commands.readiness_with_box_regions,
  next_readiness_without_box_regions: kit.next_commands.readiness_without_box_regions,
  next_prepare_with_box_regions: kit.next_commands.prepare_with_box_regions,
  json_path: written.json_path,
  markdown_path: written.markdown_path,
  command_template_path: written.command_template_path,
  box_regions_template_path: written.box_regions_template_path,
  user_input_command_template_path: written.user_input_command_template_path,
  user_input_box_regions_template_path: written.user_input_box_regions_template_path,
  operator_checklist_path: written.operator_checklist_path
}, null, 2));
