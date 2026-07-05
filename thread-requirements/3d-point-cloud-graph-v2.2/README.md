# 3D 点云图谱线程需求暂存

本目录只用于当前 Codex 线程沉淀 3D 点云图谱需求，不作为项目正式架构文档、不替代 `docs/`、`schemas/`、`runtime/` 或业务代码。

创建目的：

- 保存当前已收敛到 v2.2 的 3D 点云图谱稳定基线。
- 暂存后续来自用户和其他线程对话记录的目标分析。
- 避免在图谱总进程尚未完整确认前，与其他线程正在实现的代码、流程树、schema、状态文件产生冲突。

当前文件：

- `v2.2-stable-baseline.md`：当前线程已确认的稳定基线。
- `share-analysis.md`：对用户提供的 ChatGPT share 对话记录的可访问性检查、目标分析和补充需求解构。
- `text.txt`：用户补充的另一个线程对话原文。
- `source-text-match-review.md`：基于 `text.txt` 对原分析与用户需求的逐项匹配核对。
- `perception-worldgraph-alignment.md`：补齐感知到世界图谱对齐层，定义 Observation Atom、Fusion Bundle、五张传感器矩阵、冲突处理、统一时空坐标、潜变量和物理概念定义库。
- `external-capability-prediction-safety.md`：新增外部软件能力转需求图谱、可能性预测机制、事实变量融合规则和执行末端安全模块。
- `capability-composition-sandbox-expansion.md`：补齐外部软件/代码能力切片、能力拼接、实现路径、沙盒验证和意识模块安全范围治理。
- `social-assistant-integration-evaluation.md`：评估当前人际关系辅助系统如何并入大系统，同时保持现有闭环正常使用。
- `pure-visual-3d-system-feasibility.md`：评估先独立构建纯视觉三维粒子总系统，再通过接口接入现有人际关系辅助系统的可行性、边界和阶段路径。
- `world-system-complete-theory.md`：当前线程的世界系统完整理论方案，用于后续三维粒子操作系统构建，并说明现有人际关系辅助系统的接入定位和边界。
- `graph_projection_fixture.v1.json`：由当前 3D 粒子星云 UI 常量机械导出的完整投影 fixture，作为独立视觉态的机器可读拓扑。
- `particle-nebula-node-inventory.md`：由当前 UI 星云常量机械导出的完整节点清单，列出每个星云、星点、位置罗盘、权属和权重。
- `particle-nebula-topology-mapping.md`：三维粒子星云、世界系统完整方案和投影 fixture 的对照说明，包含未来新增内容的位置罗盘、权属和负责闸口。
- `status-dialogue-system-feature-list.md`：系统主体状态对话星云的功能清单、已实现范围、未来接入目标和只读边界。
- `subject-status-dialogue-small-model-task.md`：主体状态对话框的小模型接入、第一人称提示词、输入输出端口、日志展示和边界任务记录。
- `subject-status-dialogue-module/`：主体状态对话框模块的统一需求文件夹，后续新增目标默认先在这里完成对齐，再进入实现。
- `scheme-directory/`：方案目录和状态检查入口，用于 Codex 归类新目标、用户检查当前方案状态、确认方案是否已实现或仍为草案。
- `version-governance.v1.md`：v2.2 稳定基线之后的 `0.0.XX` 多线程版本规则确认稿，定义功能版本、测试迭代、版本目录、总账和验收流程。
- `versions/`：后续 `0.0.XX` 功能版本档案目录；当前仅包含目录协议，待版本规则确认后正式启用。

使用边界：

- 不在本目录内写入真实业务数据。
- 不在本目录内替代正式流程树登记。
- 不在本目录内触发任何运行时、外部平台、设备控制或真实发送。
- 后续只有在用户确认“图谱总进程完整，可以整理编辑方案”后，才可把本目录内容整理为正式项目方案。
