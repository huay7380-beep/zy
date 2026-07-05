# 版本目录

状态：目录协议草案，等待 `version-governance.v1.md` 经用户确认后正式启用。

本目录用于存放 v2.2 稳定基线之后的增量功能版本。每个新功能、目标或可验收能力都应建立一个 `0.0.XX` 版本目录，并在实现前完成 `0.0.XX.0` 方案。

## 读取顺序

其他线程开始计划前，按顺序读取：

1. `D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\version-governance.v1.md`
2. `D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\versions\README.md`
3. `D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\scheme-directory\README.md`
4. `D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\scheme-directory\scheme-ledger.md`
5. `D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\versions\version-ledger.md`
6. `D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\versions\idea-inbox.md`
7. `D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\versions\idea-pool-promotion-plan.v1.md`
8. 与目标相关的已有 `0.0.XX` 目录

## 目录规则

```text
versions/
  README.md
  version-ledger.md
  idea-inbox.md
  idea-pool-promotion-plan.v1.md
  0.0.XX/
    README.md
    plan.0.0.XX.0.md
    scope-and-boundary.md
    interface-map.md
    implementation-log.md
    verification-plan.md
    acceptance-report.md
    changelog.md
    iterations/
    evidence/
    artifacts/
```

## 当前状态

当前尚未正式创建功能版本；`version-ledger.md` 只登记待确认的 `0.0.00` 版本治理规则。

待用户确认后：

- `0.0.00`：版本治理规则自身。
- `0.0.01`：第一个新增功能或目标。
- `idea-inbox.md`：未确认、未占用版本号的临时想法池。
- `idea-pool-promotion-plan.v1.md`：想法池内容推进到已有版本迭代或新版本方案的操作规则。

## 临时边界

在用户确认版本规则前：

- 不占用 `0.0.01`。
- 不把当前规则直接标记为 accepted。
- 不要求其他线程立即迁移已有文档。
- 临时想法先放入 `idea-inbox.md`，成熟后再转成 `0.0.XX.0`。
- 想法成熟后必须先按 `idea-pool-promotion-plan.v1.md` 判断是回到已有版本，还是升级为新版本方案。
