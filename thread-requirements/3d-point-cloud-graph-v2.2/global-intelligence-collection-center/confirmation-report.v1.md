# 全域情报收集中心确认报告 v1

状态：待用户确认，未进入实现。

## 一句话目标

新增一个独立星云“全域情报收集中心”，用于持续收集、筛选、归一化、摘要和评估线上情报信号，为系统未来的全域事件图谱、世界状态模型、可能性预测和决策治理提供可追溯的分析依据。

## 项目结构检查结论

当前项目根目录包含正式代码与运行产物：

- `packages/`：核心运行包，包括 intake、storage、decision、trigger、mvp、tool 等模块。
- `scripts/`：命令入口。
- `schemas/`：结构化数据契约。
- `runtime/`：运行产物和临时状态。
- `docs/`：正式项目文档。
- `thread-requirements/3d-point-cloud-graph-v2.2/`：当前 3D 点云图谱线程的隔离需求暂存区。
- `sightflow-desktop-agent-main/`：桌面 GUI/3D 星云相关实现。

本轮新增目录：

```text
thread-requirements/3d-point-cloud-graph-v2.2/global-intelligence-collection-center/
```

选择该位置的原因：

- 父目录 README 明确用于当前线程沉淀 3D 点云图谱需求，避免直接影响正式 `docs/`、`schemas/`、`runtime/` 或业务代码。
- 已有 `subject-status-dialogue-module/` 采用同类“独立子文件夹收口模块需求”的模式。
- 父目录已有 `global-events`、`external-world`、`perception-fusion` 等相关星云，本模块可以先作为拓扑候选，不立即修改现有 fixture。
- 当前根目录不是 Git 工作树，本轮更适合做隔离新增，而不是横向修改多个文件。

## World Monitor 参考抽象

参考来源：

- [World Monitor Introduction](https://www.worldmonitor.app/docs/documentation)
- [World Monitor Data Sources](https://www.worldmonitor.app/docs/data-sources)
- [World Monitor MCP Tools Reference](https://www.worldmonitor.app/docs/mcp-tools-reference)

可参考的产品模式：

- 多源实时信号聚合：新闻、市场、军事、海事、航空、基础设施、自然事件、健康、能源、网络安全等。
- 地图或面板统一呈现：从原始信号到地理区域、事件层、风险层和专题面板。
- AI 摘要与分析：每日简报、区域情报、态势分析、预测和市场影响分析。
- 来源分层与新鲜度管理：保留来源等级、缓存时间、陈旧状态、覆盖缺口和数据质量说明。
- Agent/API 接入：通过 API 或 MCP 工具把情报查询能力暴露给外部智能体。

需要为本系统优化的方向：

- 从“通用全球态势仪表盘”调整为“系统内部全域情报依据中心”。
- 优先服务本项目的全域事件图谱、世界状态模型、可能性预测、决策治理和安全范围治理。
- 不以地图展示为核心，先以结构化情报、证据引用、事件候选、风险评分和缺口报告为核心。
- 不复制 World Monitor 代码、UI 或数据源配置；其 AGPL 许可和商业许可边界需要在未来真实引入前单独确认。

## 目标范围

当前阶段目标：

- 建立全域情报收集中心的目录、命名、owner、gate、compass 和文档规范。
- 明确它与既有星云的关系：收集中心负责来源与情报依据，全域事件图谱负责事件事实组织。
- 定义第一版输入输出草案。
- 定义未来升级进化能力，确保后续可以持续扩展线上情报来源。

未来阶段目标：

- 接入可配置的只读来源清单和采集 manifest。
- 生成可审计的 `intelligence_observation.v1`、`signal_event_candidate.v1` 和 `global_intelligence_brief.v1`。
- 将高质量情报候选转交给事件抽取层、全域事件图谱、世界状态模型和可能性预测。
- 通过反馈校准来源可靠性、评分权重、主题覆盖和采集优先级。

## 边界

当前不做：

- 不调用真实线上 API。
- 不抓取实时网页。
- 不写入 `data/people/**`、`data/events/**` 或正式 runtime 状态。
- 不修改 `graph_projection_fixture.v1.json`、`particle-nebula-node-inventory.md` 或 GUI 代码。
- 不把候选情报当成事实事件。
- 不执行真实发送、平台操作、设备控制或自动化动作。
- 不替代现有 `intake-runtime`、`storage-runtime`、`decision-cluster` 或 `trigger-engine`。

未来允许，但需要单独确认：

- 从本地保存网页、RSS 导出、第三方情报 API、MCP 工具或人工整理材料读取只读样本。
- 把通过验证的情报候选转为 `RawEvent` 或 `SemanticEvent` 候选。
- 为 3D 点云新增 `global-intelligence` 星云及子星点。
- 将部分来源升级为定时读取或受控同步，但仍需安全闸口和审计。

## 输入端口草案

| 端口 | 内容 | 来源 |
| --- | --- | --- |
| `input.collection_manifest` | 待读取来源清单、权限、频率、主题、限制 | 操作员或配置文件 |
| `input.source_profile` | 来源类型、可信度、地域、主题、许可、刷新策略 | 来源登记 |
| `input.saved_web_snapshot` | 已本地保存的网页 HTML、正文、截图或元数据 | 只读网页快照 |
| `input.news_or_rss_export` | 新闻、RSS、简报或订阅导出 | 外部来源导出 |
| `input.api_snapshot` | 第三方系统 API 快照 JSON | 只读业务/API 快照 |
| `input.mcp_query_result` | 未来 MCP 工具返回的结构化情报 | 受控工具层 |
| `input.operator_focus` | 当前关注主题、地区、人物、事件或风险 | 用户或系统目标 |
| `input.feedback_signal` | 人工复核、命中率、误报、漏报和采集价值反馈 | 反馈与记忆层 |

## 输出端口草案

| 端口 | 内容 | 用途 |
| --- | --- | --- |
| `output.intelligence_observation` | 最小情报观测，含来源、时间、摘要、证据、置信度 | 感知与融合 |
| `output.signal_event_candidate` | 可进入事件抽取的情报信号候选 | 事件抽取层 |
| `output.global_intelligence_brief` | 面向系统的情报简报，含重点、风险、缺口和引用 | 状态/决策读取 |
| `output.risk_signal_score` | 风险、紧急度、影响范围、证据质量评分 | 可能性预测 |
| `output.coverage_gap_report` | 未覆盖主题、陈旧来源、来源偏差、冲突信号 | 升级与采集计划 |
| `output.source_freshness_report` | 缓存时间、过期状态、刷新结果、失败原因 | 来源治理 |
| `output.upgrade_proposal` | 新来源、新规则、新 schema 或新工具接入建议 | 后续迭代 |
| `output.audit_refs` | 来源 URL、本地文件、快照 ID、处理版本、人工确认记录 | 审计追溯 |

## 统一规范

命名规范：

- 星云中文名：`全域情报收集中心`
- domain id：`global-intelligence`
- compass 前缀：`global_intelligence.*`
- owner：`Global Intelligence Collection Center`
- gate：`global_intelligence_intake_gate`
- schema 命名建议：`global_intelligence_*.v1`

数据规范：

- 所有输出必须带 `schema_version`、`created_at`、`source_refs`、`confidence`、`evidence_quality`、`freshness`、`processing_stage`。
- 时间字段同时保留 `observed_time`、`published_time`、`collected_time`、`processed_time`，缺失时明确为 `null` 和 `missing_reason`。
- 来源必须区分 `primary_source`、`aggregator_source`、`operator_note`、`model_generated_summary`。
- 候选、推断、预测、事实、人工确认必须分层表达。
- 对冲突来源保留并列证据，不强行合并成单一结论。

安全规范：

- 默认 `real_execution_allowed=false`。
- 默认 `send_blocked=true`。
- 默认只读，不打开外部软件，不主动登录，不绕过付费墙、权限墙或平台规则。
- 含个人信息、敏感商业信息或受限来源时，必须进入人工确认和脱敏流程。
- 任何真实 API key、账号、cookie、token 不写入本目录。

协作规范：

- 本目录内的每个新增文件必须写明状态：草案、待确认、已确认、已实现或已废弃。
- 实现前先更新目标对齐文档和确认清单。
- 通过用户确认前，不同步正式 `docs/`、`schemas/`、`packages/` 或 GUI fixture。
- 与其他并行线程共享的内容只通过明确接口或引用，不直接搬动对方文件。

## 升级进化能力

建议把“升级进化”设计成持续反馈闭环：

```text
来源登记
-> 只读采集
-> 情报观测
-> 事件候选
-> 风险/缺口评分
-> 人工或系统反馈
-> 来源权重校准
-> 新来源/新规则/新 schema 提案
-> 下一轮采集计划
```

演进机制：

- 来源演进：`candidate_source -> fixture_source -> read_only_source -> validated_source -> scheduled_source`。
- 规则演进：从人工规则开始，逐步沉淀为可测试的分类、去重、冲突处理和风险评分规则。
- schema 演进：所有结构化输出带版本，破坏性变更必须写迁移说明。
- 质量演进：记录命中率、误报、漏报、陈旧率、覆盖率、引用完整度和人工复核结果。
- 分析演进：从摘要升级到地理/主题聚合、事件链、风险影响、反事实和预测分支。
- 工具演进：未来可接入 MCP/API，但每个工具先作为只读 adapter，通过闸口后再进入采集计划。

## 建议星点

如用户确认后，未来可在 3D 点云中新增 `global-intelligence` 星云，并拆出以下子星点：

- `source_registry`
- `collection_manifest`
- `read_only_collector`
- `source_freshness_monitor`
- `credibility_tier`
- `topic_watchlist`
- `region_watchlist`
- `signal_deduplication`
- `conflict_signal_review`
- `intelligence_observation`
- `signal_event_candidate`
- `risk_signal_score`
- `global_intelligence_brief`
- `coverage_gap_report`
- `mcp_api_adapter_candidate`
- `upgrade_proposal`
- `human_review_gate`
- `audit_refs`

## 待用户确认

1. 是否确认目录位置使用 `thread-requirements/3d-point-cloud-graph-v2.2/global-intelligence-collection-center/`。
2. 是否确认中文星云名为“全域情报收集中心”，domain id 为 `global-intelligence`。
3. 是否确认当前阶段只做需求与规范，不改正式代码、fixture、schema 或 runtime。
4. 是否确认 World Monitor 只作为产品参考，不直接引入其代码或数据源配置。
5. 是否确认第一阶段输入优先从“本地保存快照/导出文件/人工整理材料”开始，而不是直接联网采集。
6. 是否确认输出优先服务 `intelligence_observation.v1`、`signal_event_candidate.v1`、`global_intelligence_brief.v1` 和 `coverage_gap_report.v1`。
