#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildPt028GuiDecisionState } from '../packages/decision-cluster/src/romantic-gui-state.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function tableCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function renderMarkdown(state) {
  const lines = [];
  lines.push('# PT-028 GUI Decision State');
  lines.push('');
  lines.push(`- state_id: ${state.state_id}`);
  lines.push(`- gate_decision: ${state.gate_decision}`);
  lines.push(`- real_execution_allowed: ${state.real_execution_allowed}`);
  lines.push(`- real_send_attempted: ${state.real_send_attempted}`);
  lines.push('');
  lines.push('## Relationship Gradient');
  lines.push('');
  lines.push(`- current_stage: ${state.relationship_gradient_review.current_stage}`);
  lines.push(`- stage_id: ${state.relationship_gradient_review.stage_id}`);
  lines.push(`- progression_intensity: ${state.relationship_gradient_review.progression_intensity}`);
  lines.push(`- transition_decision: ${state.relationship_gradient_review.transition_decision}`);
  lines.push(`- dialogue_act: ${state.relationship_gradient_review.dialogue_act}`);
  lines.push(`- selected_template_id: ${state.relationship_gradient_review.selected_template_id}`);
  lines.push('');
  lines.push('## First-Person Draft');
  lines.push('');
  lines.push(state.relationship_gradient_review.draft || 'No draft emitted.');
  lines.push('');
  lines.push('## Structured COT Trace');
  lines.push('');
  const trace = state.structured_cot_trace;
  if (!trace) {
    lines.push('No structured auditable generation trace was emitted.');
  } else {
    lines.push(`- schema_version: ${trace.schema_version}`);
    lines.push(`- trace_id: ${trace.trace_id}`);
    lines.push(`- raw_hidden_chain_of_thought_logged: ${trace.visibility_policy?.raw_hidden_chain_of_thought_logged === true}`);
    lines.push(`- log_type: ${trace.visibility_policy?.log_type ?? 'unknown'}`);
    lines.push('');
    lines.push('### Dialogue Generation Logic');
    lines.push('');
    lines.push(`- generator: ${trace.dialogue_generation_logic?.generator ?? 'unknown'}`);
    lines.push(`- selected_option_id: ${trace.dialogue_generation_logic?.selected_option_id ?? 'unknown'}`);
    lines.push(`- selected_template_id: ${trace.dialogue_generation_logic?.selected_template_id ?? 'unknown'}`);
    lines.push(`- dialogue_act: ${trace.dialogue_generation_logic?.dialogue_act ?? 'unknown'}`);
    lines.push(`- draft_ref: ${trace.dialogue_generation_logic?.draft_ref ?? 'unknown'}`);
    lines.push('');
    lines.push('### Prompt Generation Logic');
    lines.push('');
    lines.push(`- generator: ${trace.prompt_generation_logic?.generator ?? 'unknown'}`);
    lines.push(`- active_input_blocked_by_default: ${trace.prompt_generation_logic?.active_input_blocked_by_default === true}`);
    lines.push(`- prompt_count: ${trace.prompt_generation_logic?.prompt_count ?? 0}`);
    lines.push(`- target_visible: ${trace.prompt_generation_logic?.target_visible === true}`);
    lines.push('');
    lines.push('### Weight Logic');
    lines.push('');
    lines.push(`- changed: ${trace.weight_logic?.changed === true}`);
    lines.push(`- preliminary_recommended_option_id: ${trace.weight_logic?.preliminary_recommended_option_id ?? 'unknown'}`);
    lines.push(`- final_recommended_option_id: ${trace.weight_logic?.final_recommended_option_id ?? 'unknown'}`);
    lines.push('');
    lines.push('### Generation Path');
    lines.push('');
    lines.push('| step | status | output_ref | reason_summary |');
    lines.push('| --- | --- | --- | --- |');
    for (const step of trace.generation_path ?? []) {
      lines.push(`| ${tableCell(step.step_id)} | ${tableCell(step.status)} | ${tableCell(step.output_ref)} | ${tableCell(step.reason_summary)} |`);
    }
  }
  lines.push('');
  lines.push('## Chain Flow');
  lines.push('');
  lines.push('| step | status | evidence |');
  lines.push('| --- | --- | --- |');
  for (const step of state.chain_flow) {
    lines.push(`| ${tableCell(step.step_id)} | ${tableCell(step.status)} | ${tableCell(step.evidence)} |`);
  }
  lines.push('');
  lines.push('## Branch Records');
  lines.push('');
  lines.push('| branch | decision | reason |');
  lines.push('| --- | --- | --- |');
  for (const branch of state.branch_records) {
    lines.push(`| ${tableCell(branch.branch_id)} | ${tableCell(branch.decision)} | ${tableCell(branch.reason)} |`);
  }
  lines.push('');
  lines.push('## Third-Party Prompts');
  lines.push('');
  if (!state.relationship_gradient_review.third_party_prompts.length) {
    lines.push('No target reply prompt cards were emitted.');
  } else {
    for (const prompt of state.relationship_gradient_review.third_party_prompts) {
      lines.push(`- ${prompt.utterance_id}: ${prompt.prompt}`);
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

const root = path.resolve(argValue('root') ?? process.cwd());
const state = buildPt028GuiDecisionState({
  source: {
    source_type: 'pt028_gui_state_cli',
    root
  }
});
const outputDir = argValue('output-dir')
  ? path.resolve(root, argValue('output-dir'))
  : path.join(root, 'runtime', 'pt028-gui-decision-states', state.state_id);
mkdirSync(outputDir, { recursive: true });

const jsonPath = path.join(outputDir, 'pt028-gui-decision-state.json');
const markdownPath = path.join(outputDir, 'pt028-gui-decision-state.md');
const latestPath = path.join(root, 'runtime', 'pt028-gui-decision-states', 'latest.json');
mkdirSync(path.dirname(latestPath), { recursive: true });

const stateWithPaths = {
  ...state,
  output_paths: {
    json_path: jsonPath,
    markdown_path: markdownPath,
    latest_path: latestPath
  }
};

writeFileSync(jsonPath, `${JSON.stringify(stateWithPaths, null, 2)}\n`, 'utf8');
writeFileSync(markdownPath, renderMarkdown(stateWithPaths), 'utf8');
writeFileSync(latestPath, `${JSON.stringify(stateWithPaths, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  command: 'write-pt028-gui-decision-state',
  state_id: stateWithPaths.state_id,
  gate_decision: stateWithPaths.gate_decision,
  real_execution_allowed: stateWithPaths.real_execution_allowed,
  json_path: jsonPath,
  markdown_path: markdownPath,
  latest_path: latestPath
}, null, 2));
