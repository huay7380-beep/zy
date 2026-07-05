# 人类社交辅助系统

本项目用于构建一个目标导向型人类社交辅助系统。当前第一阶段优先服务 B2B 商务沟通和客户跟进，核心不是直接生成一句话，而是把人物关系、事件线索、用户目标、决策证据、触发计划、状态上报和反馈回写连成可验证闭环。

## 当前范围

- B2B 商务沟通场景包
- 可运行的 Node 原生工作流骨架
- 外部可读的运行状态笔记
- 人际关系图谱和事件图谱的轻量接口
- 决策集群、触发引擎和人物/事件存储方案
- 本地 `data/` 存储骨架和 `storage-runtime` 模块
- 试点样本导入入口，可把外部聊天、网页和手工记录规范化为事件存储
- 基础知识库、黄金样例、测试和压力测试入口

## 快速运行

```powershell
node scripts/run-demo.mjs
```

运行后会更新：

- `runtime/state/current-status.json`
- `runtime/state/operator-note.md`
- `runtime/state/run-events.jsonl`

如果外部压测或异常中断导致状态快照需要校准，可以从事件流重建：

```powershell
node scripts/rebuild-state.mjs
```

## 测试

```powershell
node --test packages/agent-runtime/tests/*.test.mjs
```

完整测试：

```powershell
npm test
```

## 黄金样例评测

```powershell
node scripts/run-golden-evals.mjs
```

## 目标导向图谱工程回测

```powershell
npm run tupu:backtest
```

该命令读取 `tupu/05-三类真实事件逐轮回测结果.md`，把理论逐轮回测解析为 `goal_oriented_interaction_backtest.v1` 工程回测产物，输出到 `runtime/goal-oriented-backtests/**`，并刷新 `tupu/07-理论与代码工程回测一致性结果.md`。通过标准是三类场景、十二轮记录、理论上下文、代码上下文、策略演化、具体话术和回写计划全部完整，且 `theory_code_match_rate=1`、`hard_exit_signals=[]`。

## 社交图谱进程安排

```powershell
node scripts/run-social-plan.mjs
```

图谱上下文接入沟通智能体：

```powershell
node scripts/run-social-agent-demo.mjs
```

## 身份映射与桌面接收

```powershell
npm run identity:demo
npm run identity:confirm:demo
npm run identity:confirm:ui:demo
npm run identity:cold-start
npm run desktop:inbox
npm run desktop:inbox:real:ingest
npm run desktop:context
npm run desktop:target-flow:report
```

## 可能性分支

```powershell
npm run possibility:branch
```

该命令会模拟一段复杂 B2B 微信表述：同一个目标人物同时可能是预算推进人、采购负责人、朋友介绍关系和私下沟通建议者，同时牵出接口延期、合同条款、合规材料、技术会议和价格沟通渠道。输出 `possibility_branch_analysis.v1` 到 `runtime/possibility-branches/**`，用于审计多身份、多事件、嵌套事件和读取权重匹配；它只写独立分支产物，不写 `data/people/**`、`data/events/**` 或 `data/indexes/**`。

可能性分支会区分“转述者”和“被转述对象”：例如周总转述李工担心接口延期时，周总可以作为信息来源或会议协调者进入上下文，但不会继承李工的技术评审身份。

## GUI 控制台与无真机替代验证

Sightflow 已接入智-能操作者 GUI 控制台，入口文件位于 `sightflow-desktop-agent-main/src/renderer/src/zhineng-console/**`。当前 GUI 同时提供完整控制台和 `?window=zhineng-dock` 桌面悬浮动态图标；Electron 主进程会尝试把悬浮图标吸附到微信窗口，找不到微信时回落到屏幕右下角。目标人物分类会映射到自适应跟进目标、优先级、节奏、下一步动作和安全闸门，但仍只生成可确认草稿或材料，不直接发送。真机测试窗口暂不可用时，先运行 `npm run gui:report`、`node --test packages/mvp-runtime/tests/*.test.mjs`、`npm run process-tree:validate`，并在 `sightflow-desktop-agent-main` 下运行 `npm run typecheck`；这些命令只能证明 GUI 接线、回复模式、安全后置和真实发送阻断，不能替代真实测试窗口发送验收。

`desktop:target-flow:report` 会核对 Sightflow 是否只承担桌面识别和受控回复壳：默认 `runtimeMode=zhineng_bridge`、桥接模式不加载豆包/其他 provider、Observation 写入 `runtime/desktop-inbox-real/**`，并把存储、读取、语义分析、事件拆解、人物/事件图谱和专家矩阵全部归属到主逻辑系统。

只读扩样和未来来源接入状态入口：
```powershell
npm run intake:read-only:status
npm run intake:read-only:manifest:init
npm run intake:read-only:manifest:check -- --manifest=runtime/user-inputs/read-only-source-collection.manifest.json
npm run intake:read-only:collect -- --manifest=<read-only-source-collection.manifest.json>
npm run intake:read-only:collect -- --manifest=<read-only-source-collection.manifest.json> --run-trial --pilot-import=<PilotImportBatch.json>
npm run intake:read-only:targets
npm run intake:source:matrix
npm run intake:read-only:trial
npm run intake:read-only:duplicate:confirm
npm run intake:read-only:workpack
npm run intake:adapter:validate:external-chat
npm run intake:adapter:validate:business-api
npm run intake:browser:html -- --html=<saved-page.html> --url=<page-url>
npm run intake:external-chat:export -- --file=<chat-export.txt>
npm run intake:business-api:snapshot -- --json=<snapshot.json>
npm run pilot:feedback:append -- --pilot-import=<PilotImportBatch.json>
```

`intake:read-only:targets` writes `read_only_expansion_targets.v1`, a weighted next-target plan for non-device read-only sampling. When multiple source gaps remain, it prioritizes `intake:read-only:manifest:init`, `intake:read-only:manifest:check` and then `intake:read-only:collect` so external chat exports, saved browser HTML and business JSON snapshots can enter through one manifest. It lists source targets, validation commands, acceptance gates and safety gates while keeping real sending blocked.

`intake:read-only:manifest:init` writes a `read_only_source_collection_manifest_kit.v1` handoff package under `runtime/read-only-source-collection-manifest-kits/**`. It creates a template manifest and a staging README for WeChat/chat exports, saved web pages, business snapshots and other software exports, but intentionally does not write the real target manifest or any real source file.

`intake:read-only:manifest:check` writes `read_only_source_collection_manifest_readiness.v1` under `runtime/read-only-source-collection-manifest-readiness/**`. It checks that the prepared manifest is not a template, that each saved source file exists locally, that source kinds can enter the shared intake path, and that no source tries to enable real execution or sending. It does not write observations or call external software.

`intake:read-only:collect` reads a local `read_only_source_collection_manifest.v1` manifest and batches saved external chat exports, browser HTML pages and business-system JSON snapshots into `IntakeObservation` artifacts under `runtime/read-only-source-collections/**`. It only reads local files, never opens external software, never calls APIs, and never sends messages; the output is ready for `intake:read-only:trial`. Add `--run-trial --pilot-import=<PilotImportBatch.json>` to immediately write a downstream `read_only_expansion_trial.v1`, generated `pilot-import.generated.json` and graph-loop verification from the collected observations.

`intake:read-only:workpack` writes `read_only_expansion_workpack.v1`, combining the latest read-only trial, graph-loop verification, weighted target plan and `feedback-record.template.json` into one operator handoff package. It is for no-device progress only: the generated feedback file is a worksheet, `PilotImportBatch` is not changed, and real sending remains blocked.

`intake:source:matrix` writes `source_intake_matrix.v1`, a read-only source lane matrix for WeChat desktop, browser/web, external chat exports and business-system API snapshots. It checks each lane's `SourceAdapterCapability`, `IntakeObservation`, conformance, real read-only observations, RawEvent mapping, latest generated `PilotImportBatch` coverage and real-send blocking. Missing external-chat or business API real samples remain warnings, not completion evidence.

`intake:read-only:duplicate:review` writes `read_only_duplicate_observation_review.v1`, a read-only audit of duplicate observation groups from the latest expansion status. It compares observation id, adapter, platform, summary, screenshot size and send-blocking evidence, recommends whether suppression is deterministic, and still requires operator confirmation before closing duplicate-review warnings.

`intake:read-only:duplicate:confirm` writes `read_only_duplicate_observation_confirmation.v1`. Without `--decision=<decision.json>`, it writes a decision template only; with a reviewed decision file, it records operator confirmation for duplicate suppression without deleting evidence or sending messages. `intake:read-only:status` only closes duplicate-review warnings when the confirmation covers the current duplicate groups.

`pilot:feedback:append` 在扩样样本暂缺真实反馈时只生成 `feedback-record.template.json`，不会修改 `PilotImportBatch`；传入人工确认后的 `--feedback=<feedback.json>` 时，才生成 `pilot-import.with-feedback.json` 供 `pilot:validate` 和后续 MVP 闭环验证使用。

`intake:read-only:status` 汇总真实只读 observation、生成版 `PilotImportBatch`、图谱闭环验证和网页/其他聊天软件/业务系统 adapter 模板；`intake:browser:html` 把保存的网页 HTML 转成 `browser/web` 只读 observation；`intake:external-chat:export` 和 `intake:business-api:snapshot` 分别把外部聊天导出文件、业务 API JSON 快照转成同一类 observation。以上路径都只读检查，不执行真实发送。

`identity:confirm:demo` 覆盖同名候选入队、人工确认写回 `PersonIdentityLink`、索引重建和重跑解析；`identity:confirm:ui:demo` 会写出本地身份确认 HTML 窗口并验证 UI 决策可进入同一确认闭环；`desktop:inbox:real:ingest` 读取 `runtime/desktop-inbox-real/**` 的真实只读 Observation，完成 RawEvent 入库、身份门禁和发送阻断验收。

`desktop:context` 会把一条或多条桌面 `IntakeObservation` 自动转成生成版 `PilotImportBatch` 和 `ContextSnapshot`，再进入 `decision-cluster` 输出 `expert_matrix_analysis.v2` 并行专家矩阵、理论预测值、独立审查结论和可人工确认的 `message_draft`；真实发送仍保持 `real_execution_allowed=false`。

## 决策集群

```powershell
node scripts/run-decision-demo.mjs
```

决策输出包含 9 个基础 Agent 意见、`context_snapshot.v1`、`parallel_expert_analysis.v1`、`expert_matrix_analysis.v2` 并行多学科专家矩阵、理论预测值、独立审查结论、规则型会审、具体 `message_draft`、证据包、技能计划和反馈计划。桌面发送、身份未确认、合规风险或证据不足会进入人工复核。

## 触发引擎

```powershell
node scripts/run-trigger-demo.mjs
```

输出包含 `TriggerPlan`、dry-run `AutomationPreview`、本地 `AutomationPreviewTrial`、测试页检查摘要和 `platform_dry_run_connector_check`。

写出本地平台模拟测试页：

```powershell
npm run trigger:page
```

本地页包含 `automation_preview_test_page.v1` 状态契约和本地确认控件，真实发送仍保持阻断。

## MVP 闭环

校验平台测试页或页面快照：

```powershell
npm run platform:snapshot:validate
```

默认读取 `examples/platform-snapshot.sample.html` 和 `examples/platform-snapshot-preview.sample.json`，写出 `runtime/platform-snapshot-validations/<validation_id>/platform-snapshot-validation.json`。后续接入真实测试账号时，用 `--snapshot=<真实平台快照.html>` 和 `--preview=<automation-preview.json>` 替换样例。

```powershell
node scripts/run-mvp-loop.mjs
```

批量运行三条试点闭环并输出验证指标：

```powershell
node scripts/run-mvp-loop.mjs --all
```

批量指标包含反馈、回写、索引、审计、9 个基础 Agent 意见、专家并行分析和 dry-run 自动化预览门禁。

使用试点导入样本直接驱动完整闭环：

```powershell
npm run mvp:import
```

该命令读取 `examples/pilot-import-batch.sample.json`，执行 `用户目标 -> 人物关系 -> 事件记录 -> 决策建议 -> 触发计划 -> 反馈 -> 回写 -> 索引 -> 审计`，并输出导入覆盖率、9 个基础 Agent 意见、专家并行分析、具体低承诺草稿、人工确认清单、自动化预览阻断和闭环质量。

闭环输出还包含：

- `real_user_review`：真实 B2B 跟进用户视角的场景现实性检查。
- `optimization_result`：根据回顾反馈生成的下一步应用内优化结果。

生成应用内报告页：

```powershell
npm run mvp:report
```

报告写入 `runtime/mvp-reports/`，可直接打开查看闭环流程、质量指标、可执行草稿、人工确认清单、真实用户回顾和优化结果。

带用户专项测试意见生成二次优化报告：

```powershell
npm run mvp:feedback-report
```

该命令读取 `examples/mvp-user-feedback.sample.json`，按 `schemas/mvp-user-feedback.schema.json` 把评分、问题标记和一句备注写入 `user_test_review` 与 `second_pass_optimization`，并同步展示在报告页。

运行 MVP 自代理预检：

```powershell
npm run mvp:self-agent
```

该命令会顺序运行导入样本闭环、应用内报告页、完成度审计、流程树同步校验、轻量 MVP 压力测试、外部输入包、安全模板和外部输入就绪报告，并写出 `runtime/self-agent-preflights/<preflight_id>/mvp-self-agent-preflight.json`、`runtime/input-kits/<kit_id>/mvp-external-input-kit.json`、`runtime/input-templates/<template_init_id>/mvp-external-input-templates.json` 与 `runtime/input-readiness/<readiness_id>/mvp-external-input-readiness.json`，用于说明当前本地 MVP 是否可进入用户专项测试，以及真实样本或平台快照材料应放到哪里、怎么验证、当前是否就绪。

单独重生成真实材料准备模板：

```powershell
npm run mvp:inputs:init
```

正常路径下 `mvp:self-agent` 会自动生成模板。该命令用于不重跑完整预检时，读取最新 `runtime/input-kits/**/mvp-external-input-kit.json`，重新写出 `runtime/user-inputs/templates/**` 下的可编辑 `.template` 文件和 `runtime/input-templates/<template_init_id>/mvp-external-input-templates.json`。它不会写入 `runtime/user-inputs/pilot-import.real.json`、`platform-snapshot.real.html` 或 `platform-snapshot-preview.real.json`，避免把模板误判为真实材料。

检查真实材料是否已按输入包准备好：

```powershell
npm run mvp:inputs:check
```

该命令默认读取最新 `runtime/input-kits/**/mvp-external-input-kit.json`，生成 `runtime/input-readiness/<readiness_id>/mvp-external-input-readiness.json`，用于聚合判断 `PT-003` 真实试点样本和 `PT-004` 平台快照是缺失、无效、需修正还是可进入下一步。原样复制 `examples/**` 或 `runtime/user-inputs/templates/**` 到真实目标路径会被判为 `needs_attention`，不能作为真实验证证据。

生成 PT-003 真实试点样本材料交接包：

```powershell
npm run mvp:pt003:prepare
```

该命令读取最新 `runtime/input-readiness/**`、`runtime/desktop-inbox-real/**` 等只读证据，输出 `runtime/pt003-pilot-materials/<material_id>/pt003-pilot-materials.json`、Markdown 报告和 `pilot-import.real.draft.json` 草稿，用于说明当前真实样本还缺哪些文本记录、人物身份、关系边和反馈记录。它不会写入 `runtime/user-inputs/pilot-import.real.json`，也不会触发任何真实发送。

生成 PT-004 的本轮受控平台快照：

```powershell
npm run mvp:pt004:prepare
```

该命令会写出 `runtime/user-inputs/platform-snapshot.real.html` 和 `runtime/user-inputs/platform-snapshot-preview.real.json`，用于验证预览到达、草稿可见、真实发送被阻断；它不写 PT-003 真实试点样本。

真实材料 ready 后运行受控试跑：

```powershell
npm run mvp:real-trial
```

该命令会先复用外部输入就绪校验。PT-003/PT-004 缺失或无效时只写出 `runtime/real-input-trials/<trial_id>/mvp-real-input-trial.json` 阻断报告和 `mvp-real-input-trial-report.html` 应用内页面；两者 ready 后才运行真实输入 MVP 闭环、报告页、完成度审计和流程树同步校验。只有 `ready_for_issue_register_review=true` 且 `required_failures` 为空时，才进入 PT-003/PT-004 问题台账复核。

生成 MVP 完成度审计产物：

```powershell
npm run mvp:audit
```

该命令读取 `runtime/state/current-status.json`、`examples/system-process-tree.json` 和最新 `runtime/mvp-reports/*.html`，生成 `runtime/audits/mvp-completion-audit.json` 与 `runtime/audits/mvp-completion-audit.md`，用于检查闭环证据、真实用户目标回顾完整性、开放扩展项和继续/停止条件。

按总目标逐项审计当前 MVP：

```powershell
npm run mvp:objective:audit
```

该命令读取最新自代理预检和 MVP 完成度审计，生成 `runtime/objective-audits/<audit_id>/mvp-objective-audit.json`，用于区分“本地 MVP 证据已完整”和“仍等待 PT-003/PT-004 真实外部输入”。
当真实材料已 ready 时，该审计还会要求 `npm run mvp:real-trial` 先通过；真实试跑通过后，仍需复核并更新 PT-003/PT-004 问题台账，之后才允许扩大样本或真实连接器试点。

生成统一 MVP 状态看板：

```powershell
npm run mvp:status
```

该命令读取最新自代理预检、目标审计、只读扩样目标、只读扩样状态、只读 manifest 就绪校验、只读批量采集、统一来源接入矩阵、只读扩样工作包、只读重复样本确认、真实输入试跑、完成度审计、流程树同步、压测和运行状态，生成 `runtime/status-dashboards/<dashboard_id>/mvp-status-dashboard.json`、Markdown 和 HTML 页面，用于快速查看当前完成内容、阻断项、下一步和关键产物路径。真机测试暂不可行时，可优先查看其中的 `read_only_expansion_targets`、`read_only_expansion_status`、`read_only_duplicate_confirmation`、`read_only_manifest_readiness`、`read_only_source_collection`、`source_intake_matrix` 和 `read_only_expansion_workpack` 区块，按权重执行外部聊天导出、业务 API 快照、网页补样、反馈补录、重复样本确认模板复核和未来来源 adapter 共用门禁等只读目标。

校验流程树和 Obsidian 视图同步：

```powershell
npm run process-tree:validate
```

该命令读取 `examples/system-process-tree.json`、`docs/15-系统流程树与扩展问题台账.md`、`views/obsidian/system-process-tree.md` 和 `views/obsidian/system-process-tree.canvas`，生成 `runtime/process-tree-validations/<validation_id>/process-tree-validation.json` 与 Markdown 摘要，用于证明主流程、问题台账、文件登记和 Obsidian 显化结构互相可追溯。

## 工具调用模块

```powershell
npm run tool:demo
```

该命令读取本地 `1/CLI-Anything-main/public_registry.json`，把 CLI-Anything 候选工具映射为社交辅助系统的 `ToolAdapterCapability`，并生成 `social_tool_call_plan.v1` 与 `social_tool_call_result.v1` dry-run 证据。当前模块不执行外部命令，结果中必须保留 `command_executed=false` 和 `real_execution_allowed=false`。

```powershell
node --test packages/tool-runtime/tests/*.test.mjs
```

测试覆盖 CLI-Anything registry 映射、消息发送类工具 high-risk 阻断、用户确认/授权/目标校验门槛，以及 dry-run 回执不会执行外部软件。

## 多来源接入与桌面受控发送

```powershell
npm run desktop:intake:audit
npm run desktop:intake:docs16-status
```

该命令按 `docs/16-多来源信息接入与受控发送目标实现文档.md` 汇总多来源 intake、Sightflow 桥接、受控发送 dry-run、命令材料预检、最新结构化 handoff、真实 runner 门禁和流程树登记证据，输出 `runtime/intake-implementation-audits/<audit_id>/intake-implementation-audit.json`。在真实测试窗口完成前，报告必须保留 `real_send_verified=false`，并用 `external_pending` 区分命令材料待补、prepare-controlled 待跑或真实 runner 回执待回收。

`desktop:intake:docs16-status` 会读取最新实现审计、命令材料预检、受控发送交接、完成验收和流程树校验，输出 `runtime/docs16-implementation-status/<status_id>/docs16-implementation-status.json`。它是 docs/16 的逐项目标状态快照，并包含 `runner_environment_contract_ready` 和 `operator_next_actions` 操作者待办；真实测试窗口发送未完成前必须保持 `goal_complete=false`，最终完成必须同时看到 completion 的 SendCommand 目标绑定摘要、`message_draft_sha256`、runner 环境契约门禁和刷新后的 `desktop:intake:audit` 真实发送审计。

```powershell
npm run tool:intake:bridge
npm run intake:adapter:init
npm run intake:adapter:validate
npm run intake:adapter:validate:browser
```

这些命令先把 CLI-Anything / 外部工具能力桥接成 SourceAdapter 初始化包和默认阻断的发送模板，再为未来来源生成 `SourceAdapterCapability` 与 `IntakeObservation` 安全模板，校验二者是否同源、是否能映射为 `RawEvent`、发送能力是否默认受控，并输出 `runtime/tool-intake-bridges/<bridge_id>/tool-intake-bridge.json`、`runtime/source-adapter-kits/<kit_id>/source-adapter-init-kit.json` 与 `runtime/source-adapter-conformance/<validation_id>/source-adapter-conformance.json`。接入网页端或其他软件时，先让模板和样例通过这道门，再进入 `intake:validate` 和 `intake:demo`。

```powershell
npm run desktop:send:materials:init
```

该命令只生成真实测试窗口材料包，不执行发送。输出 `runtime/controlled-send-material-kits/<kit_id>/controlled-send-material-kit.json`、包内命令模板、包内框选区域模板、`runtime/user-inputs/templates/**` 安全模板和操作者 checklist，用于把真实测试窗口的命令材料、框选材料、预检命令、readiness 刷新命令和 prepare/handoff 命令放在同一个可审计入口。

```powershell
npm run desktop:send:readiness
```

该命令只读取当前材料和运行产物，不执行发送。输出 `runtime/controlled-send-real-window-readiness/<readiness_id>/controlled-send-real-window-readiness.json`，聚合材料包、真实命令文件、框选区域、命令预检、prepare readiness、handoff、completion 和 audit，给出当前阻断项与下一步命令。

```powershell
npm run desktop:send:handoff
```

该命令只汇总最新材料包、真实窗口 readiness、命令材料预检、受控发送准备、工具桥接、完成验收和实现审计状态，输出 `runtime/desktop-controlled-send-handoffs/<handoff_id>/desktop-controlled-send-handoff.json`，并包含结构化 `operator_next_actions` 和 `runner_environment_contract`。它不会执行真实发送，用于给真实测试窗口操作者一个单一入口。

```powershell
npm run desktop:send:command:check
```

该命令只检查 `runtime/user-inputs/controlled-send-command.real.json` 和可选框选区域材料，输出 `runtime/desktop-controlled-send-command-preflights/<preflight_id>/controlled-send-command-preflight.json`。它会拦截模板占位符、生产联系人风险标志、用户确认缺失、目标校验缺失或权限缺失，且不会执行真实发送。

```powershell
npm run desktop:send:complete-controlled -- --trial=<desktop-controlled-send-trial.json> --result=<sightflow-result.json> --fail-on-not-complete
```

该命令只读取真实测试窗口 runner 写出的回执，不执行发送。Sightflow real runner 在发送前也会先确认 readiness 报告为 `desktop_controlled_send_trial.v1`、`gate_decision=controlled_send_ready_for_test_window`、`required_failures=[]`、`real_send_attempted=false`，并比对命令路径、readiness 路径、结果路径、可选框选区域路径、目标绑定、会话线索、草稿长度和 `message_draft_sha256` 是否仍与已准备 trial handoff/快照一致；框选区域路径和视觉密钥不能同时启用，不一致会失败退出。只有 `SendResult.status=sent`、非 dry-run、目标校验通过、审计入口和反馈入口齐备，并且 runner `command_summary` 与已准备 trial 快照中的 event/decision/trigger、目标平台、目标人物、会话线索、草稿长度和 `message_draft_sha256` 一致时，才输出 `desktop_controlled_send_completion.v1.real_send_verified=true`。如果命令文件在 `desktop:send:prepare-controlled` 后被改动，必须重新运行 preflight 和 prepare。

仿真验收链路：

```powershell
npm run desktop:send:simulate-controlled
npm run desktop:send:complete-controlled -- --trial=<simulated-desktop-controlled-send-trial.json> --result=<simulated-sightflow-result.json> --fail-on-not-complete --allow-simulation
npm run desktop:intake:audit -- --fail-on-required
npm run desktop:intake:docs16-status
```

仿真验收只允许得到 `simulated_send_verified=true` 和 `simulation_goal_complete=true`，不会把 `real_send_verified` 或最终 `goal_complete` 置为 true。

```powershell
npm run desktop:send:prepare-controlled -- --box-regions=<box-regions.json> --require-box-regions --fail-on-not-ready
```

真实 runner 可以使用 `CONTROLLED_SEND_BOX_REGIONS_PATH` 或 `CONTROLLED_SEND_VISION_API_KEY`。如果选择框选区域路径，上面的命令会校验 `contactList`、`chatMain` 和 `inputBox` 三个矩形；缺少文件时会先写出 `runtime/user-inputs/templates/controlled-send-box-regions.real.template.json`，不会发送消息。

`desktop:send:prepare-controlled` 的 JSON 和 Markdown 报告还会写出 handoff 命令和 `runner_environment_contract`，包括 Sightflow real runner、主系统 completion、`desktop:intake:audit` 命令、`ALLOW_REAL_CONTROLLED_SEND`、命令/readiness/result 路径绑定、框选区域/视觉密钥二选一规则和 `message_draft_sha256` 快照字段。真实测试窗口确认后，优先使用报告中的命令，避免手工拼错路径。

## 本地存储运行时

```powershell
node --test packages/storage-runtime/tests/*.test.mjs
```

聊天信息进入图谱记忆层后，可以运行下面的功能测试，验证随机顺序聊天记录能拆分写入人物/关系存储、原始事件存储、语义事件存储，并按人物、关系、标签、事件类型和关键词准确回读：

```powershell
npm run storage:chat:test
```

该命令会生成 `chat_storage_test_report.v1`，输出到 `runtime/chat-storage-tests/**`，其中包含语义覆盖率、关键事实覆盖率、条件查询结果和代码审计摘要。

## 试点样本导入

```powershell
npm run pilot:validate
```

该命令默认读取 `examples/pilot-import-batch.sample.json`，写出 `runtime/intake-validations/<import_id>/pilot-intake-readiness.json` 和 Markdown 报告，用于检查目标、人物、关系、样本量、语义覆盖、证据、反馈和单客户 1 小时时间盒。真实样本进入 MVP 前应先确认 `required_failures` 为空，完整 MVP 闭环还需要 `ready_for_closed_loop_mvp=true`；`mvp:import` 会在主链路内再次强制校验。

```powershell
npm run import:pilot
```

导入命令默认读取 `examples/pilot-import-batch.sample.json`，写入 `runtime/imports/<import_id>/data`，并输出原始事件数、语义覆盖率、反馈数和是否达到 MVP 样本门槛。

## 压力测试入口

```powershell
node scripts/stress-test.mjs --runs 50
```

该入口压测较浅的沟通工作流。

MVP 全链路压力测试：

```powershell
npm run stress:mvp
```

该命令会多次运行 `PilotImportBatch -> MVP 闭环 -> 真实用户目标回顾 -> 用户专项测试反馈 -> 二次优化 -> 报告渲染 -> 流程树同步校验`，输出 `runtime/mvp-stress-tests/<stress_id>/mvp-stress-test.json` 和 Markdown 摘要；真实用户回顾、专项反馈、二次优化和优化结果完成率低于 100% 时会产生硬退出信号。正式版完成后，还需要接入更真实的数据分布、并发配置、失败注入和用户专项测试意见。

## 文档

- `docs/00-原始文档审查.md`
- `docs/01-智能体构建方案.md`
- `docs/02-沟通系统方案.md`
- `docs/03-运行状态笔记.md`
- `docs/04-项目树与演进路线.md`
- `docs/05-人类社交辅助系统集成方案.md`
- `docs/06-图谱数据结构与接口.md`
- `docs/07-事件判定与决策集群.md`
- `docs/08-权重决策与技能接口.md`
- `docs/09-触发引擎与预约通知接口.md`
- `docs/10-第一阶段执行方案.md`
- `docs/11-后续实现风险清单.md`
- `docs/12-人物与事件存储方案.md`
- `docs/13-文档互证审计与修复清单.md`
- `docs/14-闭环样例映射与流程一致性审查.md`
- `docs/15-系统流程树与扩展问题台账.md`
- `docs/16-多来源信息接入与受控发送目标实现文档.md`
- `docs/17-目标流程代码一致性与专家评估矩阵材料.md`

## 专项方案

- `专项方案-分层规格驱动Agent系统/项目方案.md`

## 架构入口

- 流程树：`docs/15-系统流程树与扩展问题台账.md`
- 机器可读流程树：`examples/system-process-tree.json`
- Obsidian Markdown：`views/obsidian/system-process-tree.md`
- Obsidian Canvas：`views/obsidian/system-process-tree.canvas`
- 三条闭环样例：`examples/closed-loop-storage-mapping.json`
- 试点导入样例：`examples/pilot-import-batch.sample.json`
- 试点导入前置门禁：`runtime/intake-validations/<import_id>/pilot-intake-readiness.json`
- 用户专项测试反馈样例：`examples/mvp-user-feedback.sample.json`
- MVP 完成度审计产物：`runtime/audits/mvp-completion-audit.json`
- MVP 自代理预检产物：`runtime/self-agent-preflights/<preflight_id>/mvp-self-agent-preflight.json`
- MVP 外部输入包产物：`runtime/input-kits/<kit_id>/mvp-external-input-kit.json`
- MVP 外部输入模板目录：`runtime/user-inputs/templates/**`
- MVP 外部输入模板初始化产物：`runtime/input-templates/<template_init_id>/mvp-external-input-templates.json`
- MVP 外部输入就绪产物：`runtime/input-readiness/<readiness_id>/mvp-external-input-readiness.json`
- MVP 总目标逐项审计产物：`runtime/objective-audits/<audit_id>/mvp-objective-audit.json`
- MVP 真实输入试跑产物：`runtime/real-input-trials/<trial_id>/mvp-real-input-trial.json` 和 `mvp-real-input-trial-report.html`
- MVP 状态看板产物：`runtime/status-dashboards/<dashboard_id>/mvp-status-dashboard.html`
- 目标导向图谱工程回测产物：`runtime/goal-oriented-backtests/<backtest_id>/goal-oriented-interaction-backtest.json`
- MVP 压力测试产物：`runtime/mvp-stress-tests/<stress_id>/mvp-stress-test.json`
- 流程树同步校验产物：`runtime/process-tree-validations/<validation_id>/process-tree-validation.json`
- 平台快照验证样例：`examples/platform-snapshot.sample.html`
- 平台快照验证产物：`runtime/platform-snapshot-validations/<validation_id>/platform-snapshot-validation.json`

## 文档规则

- 新需求优先归并到现有文档。
- 只有出现无法归入现有文件的新一级类目时，才创建新文档。
- 所有文件必须在流程树中标记功能和归属节点。
- 新需求添加后必须检查并同步相关索引、流程树、Obsidian Markdown、Obsidian Canvas、问题台账和测试。
- 修改流程树结构、节点状态、问题台账或文件功能登记后必须运行 `npm run process-tree:validate`。
