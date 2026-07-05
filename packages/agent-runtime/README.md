# Agent Runtime

这是第一版沟通策略智能体运行时。它使用 Node.js 原生能力实现，不依赖 npm 安装。

## 运行

```powershell
node scripts/run-demo.mjs
```

## 测试

```powershell
node --test packages/agent-runtime/tests/*.test.mjs
```

## 状态笔记

每次运行都会更新 `runtime/state/`：

- `current-status.json`
- `operator-note.md`
- `run-events.jsonl`
