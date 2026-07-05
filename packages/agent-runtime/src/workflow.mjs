import { loadKnowledge } from './knowledge-loader.mjs';
import { nodeDefinitions } from './nodes.mjs';
import { StateNotebook } from './state-notebook.mjs';

function normalizeInput(input) {
  return {
    user_role: input.user_role ?? '销售负责人',
    audience_role: input.audience_role ?? '客户采购负责人',
    final_goal: input.final_goal ?? '推动客户进入下一步评估',
    current_goal: input.current_goal ?? '',
    channel: input.channel ?? '微信',
    tone_preference: input.tone_preference ?? '专业、清晰、有推进感但不冒犯',
    context_input: input.context_input ?? '',
    social_goal: input.social_goal ?? null,
    social_graph: input.social_graph ?? null
  };
}

function summarizeInput(input) {
  return {
    user_role: input.user_role,
    audience_role: input.audience_role,
    final_goal: input.final_goal,
    channel: input.channel,
    context_length: input.context_input.length
  };
}

function buildOutput(ctx) {
  return {
    run_id: ctx.run_id,
    scenario: ctx.scenario,
    context_asset: ctx.context_asset,
    audience_model: ctx.audience_model,
    relationship_state: ctx.relationship_state,
    goal_ladder: ctx.goal_ladder,
    obstacle_profile: ctx.obstacle_profile,
    strategy_card: ctx.strategy_card,
    draft_versions: ctx.draft_versions,
    safety_review: ctx.safety_review,
    simulation_result: ctx.simulation_result,
    memory_patch: ctx.memory_patch,
    social_graph_context: ctx.social_graph_context
  };
}

function summarizeOutput(output) {
  return {
    scenario: output.scenario?.sub_scenario,
    risk_level: output.safety_review?.risk_level,
    strategy_goal: output.strategy_card?.current_goal,
    draft_versions: Object.keys(output.draft_versions ?? {}).length,
    simulated_reactions: output.simulation_result?.simulated_reactions?.length ?? 0
  };
}

export async function runCommunicationWorkflow(input, options = {}) {
  const notebook = options.notebook ?? new StateNotebook({
    projectRoot: options.projectRoot,
    stateDir: options.stateDir
  });
  const normalizedInput = normalizeInput(input);
  const runId = notebook.startRun(summarizeInput(normalizedInput));
  const ctx = {
    run_id: runId,
    input: normalizedInput,
    knowledge: options.knowledge ?? loadKnowledge(options.projectRoot)
  };

  try {
    for (const node of nodeDefinitions) {
      notebook.enterNode(runId, node.name);
      const summary = await node.run(ctx);
      notebook.completeNode(runId, node.name, summary);
    }
    const output = buildOutput(ctx);
    notebook.completeRun(runId, summarizeOutput(output));
    return output;
  } catch (error) {
    notebook.failRun(runId, error);
    throw error;
  }
}
