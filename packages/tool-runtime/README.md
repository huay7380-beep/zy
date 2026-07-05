# Tool Runtime

`packages/tool-runtime` is the controlled tool-calling layer for the human social assistant.

It registers external software capabilities, builds dry-run tool call plans, bridges selected tools into intake/send templates, and returns auditable dry-run results without executing external commands. CLI-Anything is treated as one provider: its registry can suggest software adapters such as WeCom, Feishu/Lark, Obsidian or browser tools, but real execution stays blocked until a later confirmed connector path exists.

## Contracts

- `tool_adapter_capability.v1`: what a tool can do and which gates it needs.
- `social_tool_call_plan.v1`: a proposed action, command preview, target context and safety checks.
- `social_tool_call_result.v1`: dry-run result proving no external command was executed.
- `tool_intake_bridge.v1`: a bridge report that turns a selected tool into a source adapter init kit and, for send-capable tools, a blocked `OutboundSendCommand` template.

## Verification

```bash
node --test packages/tool-runtime/tests/*.test.mjs
npm run tool:demo
npm run tool:intake:bridge
```

The module is intentionally conservative: message sending, external account reads and state-changing actions are blocked unless future code supplies authorization, target verification, user confirmation and audit evidence.
