# 主体状态对话框巡检状态源与情感化交流方案 v1

更新时间：2026-06-26

状态：待用户确认后实施。本文件只整理方案，不改变当前代码行为。

## 目标

主体状态对话框不能只做简单状态播报。它需要先读取真实可追溯的系统状态，再用第一人称把结论、证据、影响和下一步改进方向自然地反馈给用户。

当前阶段仍保持边界：

- 只做状态检查和巡逻反馈。
- 不创建 `requirement_packet.v1`。
- 不写入世界模型、人际关系图谱或事件图谱。
- 不触发外部动作。
- 不直接读取业务全文，只读取摘要级状态卡或明确的运行状态摘要。

## 当前实现核对结论

### 为什么当前回复很简单

经核对，当前回复简单不是单一模型问题，而是由四个实现因素叠加造成：

1. `runtime/status-cards` 当前不存在。对话框的 `zhineng:status-dialogue:snapshot:get` 只能返回所有预期模块缺失，所以回复缺少真实巡检证据。
2. 系统提示词要求 `concise`，输出被要求为简短状态回复，不鼓励解释影响和改进方向。
3. 本地 fallback 是固定模板，只拼接 focus、owner、gate、compass、fresh/stale/missing，缺少情绪判断和行动建议。
4. `cosyvoice_short` 模式会把最终语音压缩到第一句约 36 个中文字符，导致语音听起来像短通知，而不是自然交流。

### 当前已经具备的基础

当前代码已经具备下一步升级所需的基础：

- `ModuleStatusCard`、`StatusSnapshot`、`StatusDialogueContext` 已存在。
- 主进程已经有只读 IPC：`zhineng:status-dialogue:snapshot:get`。
- Renderer 已能把 `statusSnapshot`、当前 3D focus、conversation memory 注入模型上下文。
- 3D 粒子 OS 已存在 `status-dialogue-system` 星云，并包含 `global_state_scan`、`subsystem_status_index`、`module_health_probe`、`first_person_prompt_contract`、`conversation_memory`、`voice_dialogue` 等子粒子。
- TTS 链路已能输出 `voiceText`，后续只需要调整内容策略和长度策略。

## 当前可优先接入的巡检状态源

推荐不让对话框直接读取每个模块内部文件，而是先建立一个只读状态卡桥接层：把已存在的运行产物转换成 `module_status_card.v1`，输出到 `runtime/status-cards/*.json`，再让现有 snapshot IPC 读取。

### P0 状态源：系统运行总状态

来源：

- `runtime/state/current-status.json`
- `runtime/state/operator-note.md`
- `runtime/state/run-events.jsonl`

建议映射：

- `module_id: world-state`
- 3D 星云：`world-state`
- 对话星云粒子：`status-dialogue-system:global-state-scan`

可提供的信息：

- 当前是否有运行中任务。
- 最近一次运行是否完成。
- 最近节点、成功/失败次数、最近错误。
- 可用于判断系统是稳定、过期、阻塞还是缺少新状态。

### P0 状态源：主体状态对话框自检

来源：

- `runtime/status-dialogue-logs/*.jsonl`
- `runtime/voice-loop-probes/*.json`
- CosyVoice health 与模型探测结果。

建议映射：

- `module_id: status-dialogue-system`
- 3D 星云：`status-dialogue-system`
- 对话星云粒子：`module_health_probe`、`voice_dialogue`、`model_adapter`

可提供的信息：

- STT/TTS 是否可用。
- 模型链路是否可用。
- 最近一次语音闭环耗时。
- 当前是否使用 fallback。

### P1 状态源：真实观察与桌面 GUI 候选状态

来源：

- `runtime/pt028-real-observation-gui-states/latest.json`

建议映射：

- `module_id: perception-fusion`
- 辅助映射：`external-world`
- 对话星云粒子：`subsystem_status_index`、`module_health_probe`

可提供的信息：

- 当前有多少真实观察候选。
- 目标窗口覆盖是否足够。
- 是否允许真实执行。
- 当前是否仍为 prompt-only 或 blocked gate。

### P1 状态源：PT-028 GUI 决策/动作候选状态

来源：

- `runtime/pt028-gui-decision-states/latest.json`

建议映射：

- `module_id: action-layer`
- 辅助映射：`decision-governance`

可提供的信息：

- 当前 GUI 候选是否 ready for operator review。
- 是否真实发送过。
- gate 是否阻止真实执行。
- 下一步是否需要人工确认。

### P2 状态源：MVP/反馈/审查状态

来源：

- `runtime/mvp-reports/**`
- `runtime/process-tree-validations/**`
- `runtime/objective-audits/**`
- `runtime/pt028-acceptance-statuses/**`

建议映射：

- `module_id: feedback-loop`
- 辅助映射：`learning-engine`、`safety-scope`

可提供的信息：

- 最近验证是否通过。
- 当前目标是否有审计结果。
- 哪些能力仍未完成。

## 状态卡桥接规则

新增桥接器只负责把已有状态源转换成摘要级状态卡，不直接改变原始模块。

输入：

- 只读读取上述 runtime 文件。
- 每个来源只抽取状态、时间、gate、风险、下一步和证据路径。

输出：

- `runtime/status-cards/world-state.json`
- `runtime/status-cards/status-dialogue-system.json`
- `runtime/status-cards/perception-fusion.json`
- `runtime/status-cards/action-layer.json`
- 后续按需要扩展更多 `module_id`。

单张状态卡建议字段：

```json
{
  "schema": "module_status_card.v1",
  "module_id": "world-state",
  "display_name": "世界状态",
  "owner": "World Model Runtime",
  "gate": "world_state_status_gate",
  "status": "warn",
  "updated_at": "2026-06-26T00:00:00.000Z",
  "ttl_ms": 300000,
  "headline": "最近运行已完成，但状态卡桥接仍需要补齐",
  "current_focus": ["current-status", "run-events"],
  "current_task": "read-only status bridge",
  "inputs": ["runtime/state/current-status.json"],
  "outputs": ["module_status_card.v1"],
  "blockers": [],
  "risks": ["status may be stale"],
  "next": ["补齐更多模块状态卡"],
  "confidence": 0.82,
  "source_refs": ["runtime/state/current-status.json"],
  "visibility": "read_only_summary"
}
```

## 情感化且有逻辑的交流方案

### 回复结构

每次回复不再只是状态句，而按以下顺序组织：

1. 接住用户意图：我先说明我听到的问题和当前要检查的范围。
2. 巡检结论：我读到了什么状态，是否稳定、缺失、过期或阻塞。
3. 证据来源：我依据哪些状态卡、运行文件或当前 3D focus 判断。
4. 影响判断：这个状态对你的目标意味着什么。
5. 改进方向：我建议下一步先补什么、查什么、验证什么。
6. 待确认项：需要你确认的选择或执行顺序。

示例：

> 我先把结论说清楚：我现在能读到运行总状态和自己的语音链路，但其他模块还没有统一状态卡，所以我不应该假装已经看见全局。当前最需要补的是 `world-state` 和 `status-dialogue-system` 两张状态卡。这样你问我“现在卡在哪”时，我能基于真实状态告诉你原因、影响和下一步，而不是只报 fresh/stale/missing。

### 情绪表达规则

情绪不是装饰句，而是由状态触发：

- `ok`：稳定、轻松、确认式。例：我这边看起来比较稳，可以继续往下一层查。
- `warn`：谨慎、关切、提醒式。例：我有点在意这里的状态缺口，因为它会让我只能回答框架，不能回答真实进展。
- `blocked`：明确、收束、保护式。例：这里我会先停住，不把它说成已完成，因为 gate 还没有通过。
- `unknown`：透明、不猜测。例：我现在没有足够状态卡，不会凭空判断；我会先告诉你缺哪几张。

禁止：

- 不用空泛安慰。
- 不伪装成已接入真实世界模型。
- 不暴露隐藏推理链。
- 不把技术日志当成对用户的主要回复。

### 文本与语音长度策略

建议保留三层输出：

- `reply`：对话框文字，建议 250 到 700 中文字，包含结论、证据、影响和下一步。
- `voiceText`：语音输出，建议 60 到 140 中文字，适合自然听完，不做长报告。
- `thoughts`：可见关注点日志，保持 3 到 7 条，只记录证据、边界、风险、下一步，不展示隐藏推理。

建议新增或调整语音模式：

- `cosyvoice_short`：保留，用于低延迟短通知。
- `cosyvoice_balanced`：新增默认候选，用于状态巡检自然交流，播放 1 到 3 句。
- `cosyvoice_full`：保留，用于用户要求完整播报时。

## 对话记忆升级方向

当前 `conversation_memory` 已记录 active goal、user focus、confirmed facts、open questions、next expected result。后续应围绕巡检窗口目标继续优化：

- `active_goal`：当前用户真正要达成的结果，而不是技术步骤。
- `user_focus`：用户关注点，例如低延迟、真实状态、语音自然、状态可追溯。
- `confirmed_results`：只保存已验证结果，例如 STT->TTS 通、CosyVoice 可用、状态卡缺失。
- `open_questions`：保存未解决状态缺口，例如哪些模块还没有状态卡。
- `next_expected_result`：下一次回复应该给用户的结果，例如“给出接入状态卡桥接的实施计划”。

不保存：

- 原始音频。
- 隐藏推理。
- 大段日志。
- 模块内部真实业务全文。

## 3D 粒子 OS 表达方式

当前已有 `status-dialogue-system` 星云，不需要新建孤立星云。后续实施时建议在该星云下补充或更新以下粒子：

- `status-card-bridge`：状态卡桥接器，把 runtime 状态源转成 `module_status_card.v1`。
- `patrol-narrative-composer`：把 snapshot、focus、memory 组合成巡检叙事。
- `emotional-tone-policy`：根据 ok/warn/blocked/unknown 选择情绪表达。
- `improvement-direction-output`：输出“下一步改进方向”和“需要确认项”。
- `voice-balanced-output`：把完整 reply 压缩成自然语音版，而不是 36 字短通知。

目录查询也要同步：

- 每个粒子必须有 inputs、outputs、refs。
- 每张状态卡必须能反查到来源文件。
- 每个回复中的 `statusRefs` 必须能对应到状态卡或粒子节点。

## 推荐实施顺序

### Step 1：只读状态卡桥接

实现一个桥接器，先生成：

- `world-state.json`
- `status-dialogue-system.json`
- `perception-fusion.json`
- `action-layer.json`

验收：

- `runtime/status-cards` 出现状态卡。
- 对话框 fresh 不再一直是 0。
- 回复能引用真实状态源。

### Step 2：巡检回复策略升级

调整 prompt、fallback 和 guard 策略：

- 不再只要求 concise。
- 增加“结论、证据、影响、改进方向、待确认项”。
- fallback 也使用同一结构，避免模型失败时又退回机械播报。

验收：

- 无模型时也能给出有逻辑的巡检反馈。
- 有模型时语气更自然，但不虚构事实。

### Step 3：语音输出从 short 转 balanced

保留短 ack，但最终语音使用 `cosyvoice_balanced`：

- 同一音色。
- 1 到 3 句。
- 说清结论和下一步。

验收：

- 不再只播极短断句。
- 不遗漏关键状态。
- 用户能听出“我在巡逻并提醒重点”，而不是听到机械状态码。

### Step 4：3D 星云与目录同步

把新增状态桥接和交流策略粒子同步到：

- `ZhinengConsole.tsx` 中的 `status-dialogue-system` 星云。
- `graph_projection_fixture.v1.json`。
- `subject-status-dialogue-module` 说明文件。

验收：

- 点云能看到状态输入、输出、边界、refs。
- 目录能查询每个子模块的权属和闸口。

## 需要用户确认

1. 是否确认第一批接入状态源为：`runtime/state/*`、`status-dialogue 自检日志`、`pt028-real-observation-gui-states/latest.json`、`pt028-gui-decision-states/latest.json`。
2. 是否确认状态桥接器可以写入派生状态卡到 `runtime/status-cards/*.json`，但不改原始模块、不写世界模型。
3. 是否确认默认语音从 `cosyvoice_short` 调整为 `cosyvoice_balanced`，保留短 ack，但最终回复播放 1 到 3 句自然巡检语音。
4. 是否确认下一轮实施优先做 Step 1 和 Step 2，等状态卡和回复逻辑稳定后，再做 Step 3 和 Step 4。

## 验证方案

实施后需要验证：

- `rg "module_status_card.v1|status-card-bridge|patrol-narrative-composer|cosyvoice_balanced" src thread-requirements`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- 启动 3D 粒子 OS，确认右侧对话框 fresh/stale/missing 不再全部缺失。
- 文字输入询问“当前系统哪里需要改进”，回复应包含结论、证据、影响、改进方向和待确认项。
- 语音输入同样进入对话链路，并用同一音色播放 balanced 最终回复。
- 检索确认没有创建 `requirement_packet.v1`，没有写入世界模型、人际图谱、事件图谱或外部动作通道。
