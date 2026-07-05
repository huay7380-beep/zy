# Storage Runtime

`storage-runtime` 是第一阶段人物、关系、事件、反馈、索引和审计的本地文件运行时。

第一版只使用 Node.js 原生能力：

- 初始化 `data/` 目录。
- 追加写入 `RawEvent`、`SemanticEvent` 和 `FeedbackRecord`。
- 去重写入 `Person` 和 `RelationshipEdge`。
- 导入 `PilotImportBatch`，把外部聊天、网页和手工记录规范化为存储对象。
- 从源 JSONL 重建人物、关系、标签和时间索引。
- 为每个写入动作记录 `StorageAudit`。

## 试点导入

```powershell
node scripts/validate-pilot-intake.mjs --input=examples/pilot-import-batch.sample.json
```

导入前置门禁会输出 `pilot_intake_readiness.v1`，写入 `runtime/intake-validations/<import_id>/`，用于检查目标、人物、关系、样本量、语义覆盖、证据、反馈和单客户 1 小时时间盒。

```powershell
node scripts/import-pilot-records.mjs --input=examples/pilot-import-batch.sample.json
```

导入输出会标记 `semantic_coverage` 和 `ready_for_mvp_sample`，用于判断样本是否能进入后续 MVP 闭环验证。

## 测试

```powershell
node --test packages/storage-runtime/tests/*.test.mjs
```
