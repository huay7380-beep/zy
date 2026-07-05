import { runCommunicationWorkflow } from '../packages/agent-runtime/src/index.mjs';

const result = await runCommunicationWorkflow({
  user_role: '销售负责人',
  audience_role: '客户采购负责人',
  final_goal: '推动客户进入技术评审',
  current_goal: '确认下周 30 分钟技术评审时间',
  channel: '微信',
  tone_preference: '专业、强一点但不要冒犯',
  context_input: `客户上周表示对方案感兴趣。
客户说预算需要内部确认。
技术负责人还没有参与评审。
这周客户回复说“我们内部再看看吧，现在还不急”。`
});

console.log(JSON.stringify({
  run_id: result.run_id,
  scenario: result.scenario,
  current_goal: result.goal_ladder.current_goal,
  primary_obstacle: result.obstacle_profile.primary_obstacle,
  techniques: result.strategy_card.techniques_used,
  safety: result.safety_review.risk_level,
  best_draft: result.draft_versions.best
}, null, 2));
