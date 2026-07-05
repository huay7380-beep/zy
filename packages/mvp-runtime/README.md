# MVP Runtime

`mvp-runtime` 串联流程树的最小可行闭环：

```text
用户目标 -> 人物关系 -> 事件记录 -> 决策建议 -> 触发计划 -> 反馈 -> 回写 -> 索引 -> 审计
```

第一版使用 `examples/closed-loop-storage-mapping.json` 的近真实闭环样例，也支持用 `PilotImportBatch` 导入样本直接驱动闭环；不调用真实外部平台。

闭环完成后会输出 `message_draft`、`manual_execution_checklist`、完整 `real_user_review` 和 `optimization_result`，用于从真实 B2B 跟进用户角度检查总目标、应用场景、证据、关系阶段、触发安全和反馈可观测性，并给出已应用到运行输出层的下一步优化。

用户专项测试意见可以按 `schemas/mvp-user-feedback.schema.json` 组织为 `MvpUserFeedback`，运行时会输出 `user_test_review` 和 `second_pass_optimization`，用于把测试评分、问题标记和一句备注纳入下一轮优化。

## 运行

```powershell
node scripts/run-mvp-loop.mjs
```

批量运行当前三条闭环样例，并输出继续/停止或调整的门禁指标：

```powershell
node scripts/run-mvp-loop.mjs --all
```

用试点导入样本运行完整闭环：

```powershell
node scripts/run-mvp-loop.mjs --pilot-import=examples/pilot-import-batch.sample.json
```

写出应用内报告页：

```powershell
node scripts/run-mvp-loop.mjs --pilot-import=examples/pilot-import-batch.sample.json --write-report
```

带用户专项测试意见写出二次优化报告：

```powershell
node scripts/run-mvp-loop.mjs --pilot-import=examples/pilot-import-batch.sample.json --user-feedback=examples/mvp-user-feedback.sample.json --write-report
```

运行自代理预检并写出下一步外部材料清单：

```powershell
node scripts/run-mvp-self-agent-cycle.mjs
```

预检会写出 `runtime/self-agent-preflights/<preflight_id>/mvp-self-agent-preflight.json`、Markdown 摘要、`runtime/input-kits/<kit_id>/mvp-external-input-kit.json`、`runtime/input-templates/<template_init_id>/mvp-external-input-templates.json` 和 `runtime/input-readiness/<readiness_id>/mvp-external-input-readiness.json`，说明当前本地闭环、报告页、MVP 审计、流程树同步校验和轻量 MVP 压力测试是否通过，以及 `PT-003`、`PT-004` 真实样本或平台快照材料应放到哪里、怎么验证、当前是否就绪。

单独重生成安全可编辑外部输入模板：

```powershell
node scripts/init-mvp-external-input-templates.mjs
```

正常路径下自代理预检会自动生成模板。该命令用于不重跑完整预检时，读取最新输入包，重新写出 `runtime/user-inputs/templates/**` 和 `runtime/input-templates/<template_init_id>/mvp-external-input-templates.json`。模板文件只作为参照，不会写入真实目标文件；真实材料仍需放到输入包指定的 `runtime/user-inputs` 目标路径后再检查就绪。

单独检查外部输入是否就绪：

```powershell
node scripts/validate-mvp-external-inputs.mjs
```

该命令默认读取最新输入包，聚合判断 PT-003/PT-004 真实材料是否缺失、无效、需修正或可进入下一步。原样复制 examples 或 `.template` 文件到真实目标路径会被判为 `needs_attention`，不能作为真实验证证据。

生成 PT-004 的本轮受控平台快照：

```powershell
node scripts/prepare-controlled-platform-snapshot.mjs
```

该命令写出 `runtime/user-inputs/platform-snapshot.real.html` 和 `runtime/user-inputs/platform-snapshot-preview.real.json`，用于验证平台预览、草稿可见和真实发送阻断；它不生成 PT-003 真实试点样本。

真实材料 ready 后运行受控试跑：

```powershell
node scripts/run-mvp-real-input-trial.mjs
```

试跑会先检查外部输入 readiness。材料不 ready 时停止在 `mvp_real_input_trial.v1` 报告层；材料 ready 后运行完整 MVP 闭环、报告页、完成度审计和流程树同步，输出到 `runtime/real-input-trials/**`。每次试跑都会额外写出 `mvp-real-input-trial-report.html`，用于从应用内视角查看材料状态、检查项、产物和下一步。

生成统一 MVP 状态看板：

```powershell
node scripts/write-mvp-status-dashboard.mjs
```

状态看板会读取最新自代理预检、目标审计、真实输入试跑、完成度审计、流程树同步、压测和运行状态，输出 `runtime/status-dashboards/<dashboard_id>/mvp-status-dashboard.json`、Markdown 和 HTML 页面。自代理、真实输入试跑、目标审计、流程树校验或压测运行后，应刷新这个入口，方便用户先看一个当前状态页面。

按总目标逐项审计当前 MVP：

```powershell
node scripts/audit-mvp-objective.mjs
```

该命令默认读取最新自代理预检和 MVP 完成度审计，输出 `runtime/objective-audits/<audit_id>/mvp-objective-audit.json` 与 Markdown 摘要，用于说明当前目标哪些证据已证明、哪些仍等待真实外部输入。
当真实材料已 ready 时，目标审计还会要求真实输入试跑通过；试跑通过后仍需复核 PT-003/PT-004 问题台账，才能进入扩大样本或真实连接器试点。

生成当前 MVP 完成度审计产物：

```powershell
node scripts/audit-mvp-completion.mjs
```

审计会读取状态笔记、机器流程树和最新报告页，输出 `runtime/audits/mvp-completion-audit.json` 与 `runtime/audits/mvp-completion-audit.md`，并检查真实用户目标回顾和优化结果是否完整。

校验流程树和 Obsidian 视图同步：

```powershell
node scripts/validate-process-tree.mjs
```

校验会读取机器流程树、docs/15、Obsidian Markdown 和 Canvas，输出 `runtime/process-tree-validations/<validation_id>/process-tree-validation.json` 与 Markdown 摘要。

运行 MVP 全链路压力测试：

```powershell
node scripts/stress-mvp-loop.mjs --runs=10
```

压力测试会多次运行导入样本闭环、真实用户目标回顾、用户专项测试反馈、二次优化、报告渲染和流程树同步校验，输出 `runtime/mvp-stress-tests/<stress_id>/mvp-stress-test.json` 与 Markdown 摘要。

## 测试

```powershell
node --test packages/mvp-runtime/tests/*.test.mjs
```
