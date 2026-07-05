# 产品页标准中心

本目录用于集中存放跨境 B2B 产品页、产品规格页、页面标准、产品数据包和验证证据。

## 目录结构

```text
D:\zhineng\chanpinye
├─ standards
│  ├─ pdp-layout-standard.v1.md
│  ├─ pdp-layout-standard.v1.json
│  └─ pdp-color-system.v1.json
├─ templates
└─ products
   └─ QXJ-1007
      ├─ index.html
      ├─ product-spec-page-data.json
      ├─ pdp-build-pack.json
      ├─ standard-page-manifest.json
      ├─ assets
      ├─ exports
      └─ qa
```

## 使用边界

- 当前目录是产品页标准化主目录。
- 原 `cross-border-ecommerce-ai-route` 中的旧原型文件暂不删除，避免影响已有线程、历史链接和验证记录。
- 新增产品时优先在 `products/<product-id>` 下建立独立产品包。
- 页面标准、配色标准和字段标准优先从 `standards` 读取。
- 真实发布、客户发送、证书声明、价格/MOQ/交期承诺均需要人工确认。

## 当前产品

- 目录名：`QXJ-1007`
- 源型号：`QXKJ-1007`
- 产品：UTP Toolless Keystone Jack
- 页面入口：`products/QXJ-1007/index.html`
- PDF 草案：`products/QXJ-1007/exports/QXKJ-1007-product-specification-draft.pdf`

