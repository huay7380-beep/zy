# 全域情报收集中心

状态：当前线程新增星云模块需求入口，待用户确认；暂不进入正式代码实现。

本目录作为“全域情报收集中心”的统一收口位置。后续与该星云相关的目标、边界、输入输出、采集 lane、来源清单、升级计划、验证记录和实现说明，默认先写入本目录，完成确认后再决定是否同步到正式 `docs/`、`schemas/`、`packages/`、`runtime/` 或 3D fixture。

固定约定：

- 本目录只记录“全域情报收集中心”相关内容，不改写其他并行线程的文档或实现。
- 当前阶段只做需求对齐、边界确认和规范草案，不读取真实线上来源、不调用外部 API、不抓取网页、不写入真实业务数据。
- 未来如需接入真实来源，必须先经过 `source_intake_gate`、`observation_fusion_gate`、`global_event_graph_gate` 和对应安全闸口。
- 参考 World Monitor 的产品能力时，只抽象产品模式和信息结构，不复制其代码、界面资产、数据源配置或受许可约束的实现。
- 候选情报、预测、摘要和评分必须与已确认事实分离，并保留来源、时间、置信度、版本和审计引用。

## 当前文件

- `confirmation-report.v1.md`：本轮新增星云的项目结构检查、目标、边界、输入输出、统一规范和待确认项。

## 建议模块标识

- 中文名：全域情报收集中心
- 目录名：`global-intelligence-collection-center`
- 建议 domain id：`global-intelligence`
- 建议 compass 前缀：`global_intelligence.*`
- 建议 owner：`Global Intelligence Collection Center`
- 建议 gate：`global_intelligence_intake_gate`

## 与父目录关系

父目录 `thread-requirements/3d-point-cloud-graph-v2.2/` 是当前 3D 点云图谱线程的隔离需求暂存区。这里已有 `global-events` 全域事件图谱、`external-world` 外部世界来源、`perception-fusion` 感知与融合、`event-extraction` 事件抽取层等星云。

“全域情报收集中心”不是替代这些既有星云，而是作为线上情报来源的只读汇聚、筛选、摘要、风险提示和演进管理入口。它向外部世界来源、感知融合、事件抽取、全域事件图谱、世界状态模型、可能性预测和决策治理提供可审计的情报依据。
