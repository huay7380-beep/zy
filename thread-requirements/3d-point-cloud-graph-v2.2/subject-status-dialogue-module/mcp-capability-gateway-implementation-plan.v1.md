# 主体状态对话框 MCP 能力网关实现计划 v1

归属：`status-dialogue-system`

状态：待用户确认后执行

## 1. 目标

当前不针对天气、搜索、计算、普通资料检索等能力逐个重写工具。此类能力已经可以由成熟 MCP server、集成平台或模型 API 调用完成。

本计划只建设主体状态对话框自己的“能力网关层”，负责把用户语音/文字需求安全、有序、可追溯地路由到 MCP / API / 本地只读工具，并把结果整理成右下角 GUI、TTS 和 3D 粒子 OS 都能理解的统一输出。

核心目标：

- 保持主体状态对话框的身份：状态巡检窗口、语音交互入口、需求理解入口。
- 新增 `capability_gateway.v1`，不新建并列对话模块。
- 通过 MCP / 外部集成平台承载通用能力，不重复造天气、搜索、计算工具。
- 当前阶段默认只读，不写世界模型，不执行外部动作，不生成 `requirement_packet.v1`。
- 所有能力调用都能在 UI、日志、状态 refs、3D 子粒子中追溯。

## 2. 为什么不直接写天气/搜索/计算模块

天气、搜索、网页抽取、普通计算、文档查询等能力本身不是主体状态对话框的核心竞争力。直接手写这些模块会带来：

- 与现成 MCP 工具重复。
- 每个能力都要维护鉴权、限流、错误处理、来源格式。
- 后续新增能力会不断膨胀右下角对话框。
- 难以统一状态、边界、语音播报和 3D 映射。

因此本计划只做“能力路由、治理、展示、播报、追溯”，真正能力由 adapter 承载。

## 3. 候选能力来源

第一类：研究/搜索型 MCP

| 候选 | 适合用途 | 当前建议 |
| --- | --- | --- |
| Tavily MCP | 实时搜索、抽取、crawl、map | 优先候选 |
| Exa MCP | Web search、code search、company research | 优先候选 |
| Firecrawl MCP | 网页抓取、结构化抽取、复杂页面内容提取 | 第二批 |
| Brave Search MCP | 网页、新闻、本地商户、图片/视频搜索 | 第二批 |

第二类：泛集成平台 MCP

| 候选 | 适合用途 | 当前建议 |
| --- | --- | --- |
| Pipedream MCP / Connect | 大量 API、托管鉴权、自动化连接 | 优先候选 |
| Composio | Agent 工具集、账号授权、常见 SaaS | 优先候选 |
| Zapier MCP | 大量应用动作和自动化 | 暂缓，动作面太大，需更强确认门 |

## 4. 总体架构

```text
用户语音/文字输入
  -> DialogueTurnIntent
  -> capability_intent_router.v1
  -> capability_gateway.v1
  -> capability_registry.v1
  -> MCP / API / local read-only adapter
  -> capability_result.v1
  -> boundary_gate.v1
  -> response_composer
  -> UI 展示 / TTS voiceText / statusRefs / 3D 子粒子
```

## 5. 与现有对话模块的接入点

现有结构继续保留：

- `DialogueTurnIntent`：先判断用户当前话语意图。
- `dialogue-policy.v1`：统一身份、回复顺序、边界和巡检插入规则。
- `StatusDialogueContext`：携带状态快照、焦点、语音桥接状态。
- `ZhinengConsole.tsx`：右下角 GUI、语音输入输出、3D 粒子 OS 映射。
- `runtime/status-cards` / `runtime/status-events`：状态巡检输入。

新增接入点：

- `capability_intent_router.v1`：位于 `DialogueTurnIntent` 之后。
- `capability_gateway.v1`：统一调用 MCP / API / local adapter。
- `capability_result.v1`：统一返回结构。
- `capability_trace.v1`：记录调用状态、耗时、来源和失败原因。
- `capability_status_card.v1`：让能力网关自身可被巡检。

## 6. 契约草案

### 6.1 CapabilityRegistryEntry

```json
{
  "schema": "capability_registry_entry.v1",
  "capability_id": "web.research.tavily",
  "label": "Tavily Web Research",
  "source_type": "mcp",
  "provider": "tavily",
  "category": "web_research",
  "enabled": false,
  "read_only": true,
  "requires_network": true,
  "requires_auth": true,
  "requires_user_confirmation": false,
  "allowed_intents": ["direct_question", "capability_question"],
  "blocked_actions": ["send", "purchase", "post", "delete", "modify_external_state"],
  "inputs": ["query", "time_range", "language", "max_results"],
  "outputs": ["answer", "sources", "confidence", "trace"],
  "gate": "capability_gateway_read_only_gate",
  "compass": "status_dialogue.capability.web_research"
}
```

### 6.2 CapabilityInvokeRequest

```json
{
  "schema": "capability_invoke_request.v1",
  "request_id": "cap_req_...",
  "turn_id": "status-dialogue-...",
  "user_query": "查一下今天上海天气",
  "turn_intent": "direct_question",
  "capability_id": "weather.query",
  "mode": "read_only",
  "args": {
    "location": "上海",
    "date": "today"
  },
  "boundary": ["no world model write", "no external action", "source required"]
}
```

### 6.3 CapabilityResult

```json
{
  "schema": "capability_result.v1",
  "request_id": "cap_req_...",
  "capability_id": "weather.query",
  "status": "success",
  "answer": "上海今天多云，气温约...",
  "voice_summary": "上海今天多云，出门注意温差。",
  "sources": [
    {
      "label": "weather provider",
      "url": "adapter://weather/query",
      "retrieved_at": "2026-07-03T..."
    }
  ],
  "confidence": "medium",
  "latency_ms": 820,
  "boundary_notes": ["read-only", "not written to world model"]
}
```

## 7. Phase 设计

### Phase 0：方案冻结与边界确认

- 确认只做能力网关，不重写天气/搜索/计算工具。
- 确认当前阶段只读查询。
- 确认不写世界模型，不创建 `requirement_packet.v1`。
- 确认归属 `status-dialogue-system`。

### Phase 1：核心契约与注册表骨架

建议新增：

- `src/core/status-dialogue/capability-contracts.ts`
- `src/core/status-dialogue/capability-registry.ts`
- `src/core/status-dialogue/capability-gateway.ts`

实现内容：

- 定义 `CapabilityRegistryEntry`。
- 定义 `CapabilityInvokeRequest`。
- 定义 `CapabilityResult`。
- 定义 `CapabilityGatewayAdapter`。
- 提供默认注册表：
  - `web.research.tavily`：disabled / read-only placeholder
  - `web.research.exa`：disabled / read-only placeholder
  - `integration.pipedream`：disabled / read-only placeholder
  - `integration.composio`：disabled / read-only placeholder
  - `local.runtime_lookup`：enabled / read-only
  - `local.document_lookup`：enabled / read-only

不做：

- 不接真实 Tavily/Exa/Pipedream/Composio key。
- 不发网络请求。
- 不执行外部动作。

### Phase 2：能力意图路由

扩展现有 `DialogueTurnIntent` 后的路由层：

- `status_patrol`：继续走状态巡检。
- `voice_control`：继续走语音链路诊断。
- `direct_question` + 当前信息类问题：进入能力网关。
- `capability_question`：回答当前能接哪些能力，并展示 registry 状态。
- `execution_request`：默认不调用动作类 MCP，只生成只读草案和确认点。
- `ambient_or_unclear`：不进入能力调用。
- `casual_chat`：默认不进入能力调用，除非明确要求查询。

### Phase 3：本地只读能力先接入

能力：

- `local.runtime_lookup`：查运行日志、STT/TTS 延迟、状态卡、事件队列。
- `local.document_lookup`：查 `subject-status-dialogue-module` 文档。
- `local.plan_lookup`：查方案、版本、进度和待确认项。
- `local.calculation`：简单计算、单位换算、延迟换算。

UI：

- 右下角显示 capability chip：
  - `capability: local.runtime_lookup`
  - `status: success/fallback/unavailable`
  - `source refs`
  - `latency`

### Phase 4：MCP 只读 adapter 接入

候选优先级：

1. Tavily 或 Exa：用于 Web research。
2. Pipedream 或 Composio：用于泛 API 集成，但第一阶段只开放 read-only tools。

执行方式：

- 配置项存在但默认 disabled。
- 有 key 和 endpoint 时才显示 ready。
- 无配置时 UI 明确说“未接入”，不能假装可用。
- 网络能力失败时 fallback 到本地解释，不影响状态巡检。

### Phase 5：右下角 GUI 与语音输出整合

UI 目标：

- 不新增杂乱状态栏。
- 复用后续“执行状态条”表达：
  - `正在选择能力`
  - `正在查询 Tavily`
  - `正在整理来源`
  - `查询完成`
- 对话消息中展示：
  - 简短结论
  - 来源 refs
  - confidence
  - boundary notes

TTS 规则：

- 只朗读 `voice_summary`。
- 不朗读长来源列表。
- 如果来源不足，语音必须说明“我现在没有拿到可靠来源”。
- 能力调用失败时，不做冗长报错，只说可理解的失败原因。

### Phase 6：3D 粒子 OS 映射

在 `status-dialogue-system` 下新增子粒子：

- `capability.gateway`
- `capability.registry`
- `capability.intent_router`
- `capability.boundary_gate`
- `capability.result_composer`
- `capability.trace`
- `capability.local_runtime_lookup`
- `capability.local_document_lookup`
- `capability.web_research_mcp`
- `capability.integration_mcp`

每个子粒子必须显示：

- 输入
- 输出
- adapter 状态
- 是否联网
- 是否需要确认
- 来源 refs
- 负责 gate
- 是否已实现或预留

### Phase 7：验证

文档验证：

```powershell
rg "mcp-capability-gateway|capability_gateway|CapabilityRegistryEntry|CapabilityResult|status-dialogue-system" D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\subject-status-dialogue-module
```

类型验证：

```powershell
npm.cmd run typecheck
```

构建验证：

```powershell
npm.cmd run build
```

边界验证：

```powershell
rg "requirement_packet\.v1|world_model_requirement_inbox|external_action" D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console
```

行为验证：

- 问“当前能接哪些外部能力？” -> 返回 registry 状态。
- 问“查当前语音延迟” -> 走本地 runtime lookup。
- 问“查某个方案在哪里” -> 走本地 document lookup。
- 问天气/网络搜索但未配置 MCP -> 明确说未接入，不假装查询成功。
- 配置 MCP 后 -> 能返回来源、摘要、latency 和 boundary。
- 语音输出只播短结论。
- 3D 粒子 OS 能找到 capability 子粒子和输入输出。

## 8. 当前确认点

执行前需要确认：

1. 是否确认本阶段只做 `capability_gateway.v1`，不逐个重写天气/搜索/计算模块。
2. 是否确认默认只读，不写世界模型，不创建 `requirement_packet.v1`。
3. MCP 第一优先级是否按：
   - Web research：Tavily 或 Exa 二选一。
   - 泛集成：Pipedream 或 Composio 二选一。
4. Phase 1/2 是否先只做契约、注册表和路由骨架，不接真实外部 key。
5. 是否确认 3D 映射继续归属 `status-dialogue-system`，只新增子粒子。

## 9. 推荐执行顺序

推荐确认后先执行：

1. Phase 1：契约和 registry 骨架。
2. Phase 2：能力意图路由。
3. Phase 3：本地只读能力。

再由用户确认是否进入：

4. Phase 4：真实 MCP adapter。
5. Phase 5：右下角 GUI 查询状态和 TTS 结果播报。
6. Phase 6：3D 粒子 OS 子粒子补齐。

