# Data Store

第一阶段本地存储目录。真实运行时由 `packages/storage-runtime` 初始化和维护。

## 目录

- `people/people.json`：人物实例。
- `people/relationships.json`：用户与对象之间的关系边。
- `events/raw-events.jsonl`：原始事件，追加写。
- `events/semantic-events.jsonl`：语义事件，追加写。
- `indexes/`：从事件源数据重建的索引。
- `feedback/feedback-records.jsonl`：执行反馈，追加写。
- `audit/storage-audit.jsonl`：每次存储写入和索引重建的审计记录。

`runtime/state/` 只记录运行状态；本目录记录人物、关系、事件、反馈和审计。
