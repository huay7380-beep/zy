# 标准化产品上新与运维流程

本文件把当前结构化布线产品变成可重复的运营流程。以后新增产品时，不再重新设计链路，只需要按本流程补齐输入、通过门禁、进入运维。

## 总流程

```text
源头资料接收
-> 产品视觉/OCR 抽取
-> 产品主数据建档
-> 品牌映射
-> 合规门禁
-> 成本和价格本
-> 内容素材
-> 独立站上架草案
-> RFQ 字段配置
-> 获客计划
-> 询盘接待
-> 报价
-> 订单履约
-> 售后复购
-> 周/月复盘
```

## 状态机

| 状态 | 含义 | 进入条件 | 下一步 |
| --- | --- | --- | --- |
| `source_received` | 收到供应商资料 | PDF/图片/报价表已保存 | 抽取 |
| `visual_extracted` | 已从目录视觉识别产品族 | 页码和系列记录完成 | OCR/人工复核 |
| `product_master_drafted` | 产品主数据草案完成 | 模板字段已填写 | 品牌/合规/价格 |
| `brand_mapping_required` | 需要换品牌 | 公开 SKU 未确认 | 品牌映射 |
| `compliance_review_required` | 合规未过门 | 目标市场或证书缺失 | 收证/复核 |
| `pricing_required` | 价格未就绪 | 成本/MOQ/包装缺失 | 建价格本 |
| `content_required` | 内容未就绪 | 图片/文案/规格表缺失 | 素材生产 |
| `ready_for_site_review` | 可进入上架审核 | 主数据、价格、内容完成 | 人工审核 |
| `ready_for_rfq` | 可接受询盘 | 页面和 RFQ 字段上线 | 获客 |
| `active` | 正常运营 | 已发布且可报价 | 周期复盘 |
| `blocked` | 不可运营 | 合规/品牌/价格/质量问题 | 修复或下架 |
| `retired` | 停止运营 | 工厂停产或效果不佳 | 归档 |

## 标准文件夹结构

建议每个产品系列按以下结构落地到未来运行目录：

```text
cross-border-ecommerce-ai-route/runtime/products/
  keystone-jack/
    source/
    master/
    media/
    compliance/
    pricing/
    site/
    rfq/
    quotes/
    audit/
```

当前理论阶段先使用：

```text
cross-border-ecommerce-ai-route/products/structured-cabling-catalogue-seed.json
cross-border-ecommerce-ai-route/templates/structured-cabling-product-master.template.json
cross-border-ecommerce-ai-route/templates/standard-product-onboarding-checklist.md
```

后续所有跨境电商运行产物、验证截图、导入表、报价草案、产品主数据和客户草案都必须保存在 `cross-border-ecommerce-ai-route/runtime/**` 或本项目其他子目录下。主目录 `runtime/` 只属于父系统通用运行态，不作为跨境电商资料存放位置。

## 新增产品 SOP

### 1. 源头资料接收

输入：

- 产品目录 PDF。
- 原始图片和视频。
- 报价表。
- 包装资料。
- 证书/测试报告。
- MOQ、交期、样品规则。

输出：

- `source_intake_record.v1`
- `source_refs[]`
- `missing_source_items[]`

人工门禁：

- 确认该工厂是允许合作的真实源头。
- 确认是否允许私标、改包装、改型号、改图片。

### 2. 产品主数据建档

把产品录入 `structured-cabling-product-master.template.json`。所有未知字段写 `pending`，不能靠猜。

关键规则：

- 对外 SKU 由我们生成。
- 工厂型号只在内部保留。
- 每个变体必须能回到具体工厂型号。
- PDU、电源类和无源布线配件必须分开合规。

输出：

- `product_master_draft.v1`
- `variant_matrix.v1`
- `missing_fields.v1`

### 3. 品牌映射

输入：

- 新品牌名称。
- 公开 SKU 规则。
- Logo 和视觉规范。
- 域名和邮箱。
- 私标授权证据。

输出：

- `brand_mapping.v1`
- `public_sku_map.v1`
- `old_brand_cleanup_checklist.v1`

门禁：

- 未确认新品牌前，产品页只能做内部草案。
- 未确认授权前，不能公开使用工厂证书或工厂图片作为自有品牌证明。

### 4. 合规门禁

按产品族触发门禁：

| 产品族 | 门禁 |
| --- | --- |
| 无源配件 | 材料声明、RoHS/REACH、标签、型号一致性 |
| 跳线/线缆 | 线规、外被、阻燃/LSZH、目标市场安装用途 |
| PDU | 安规、插头制式、电压电流、标签、目标国认证、专业复核 |

输出：

- `compliance_profile.v1`
- `certificate_request_list.v1`
- `blocked_claims.v1`

### 5. 价格本

价格本必须支持：

- 工厂成本。
- MOQ。
- 样品价格。
- 阶梯价。
- 私标包装成本。
- 运费假设。
- 毛利底线。
- 报价有效期。

输出：

- `price_book.v1`
- `cost_model.v1`
- `margin_gate_report.v1`

### 6. 内容生产

每个产品至少需要：

- 白底主图。
- 细节图。
- 应用场景图。
- 包装图。
- 英文标题。
- 规格表。
- FAQ。
- 可下载资料。

图片必须去除旧品牌可见元素，除非页面明确说明是工厂来源资料且不对外发布。

输出：

- `product_content_kit.v1`
- `image_asset_pack.v1`
- `datasheet_draft.v1`

### 7. 独立站上架

页面状态：

```text
draft -> internal_review -> compliance_review -> pricing_review -> ready_to_publish -> published
```

每个页面必须挂 RFQ，而不是只展示产品。

### 8. 获客与询盘

AI 读取来源事件：

- `product_view`
- `asset_download`
- `rfq_submit`
- `email_message`
- `whatsapp_message`
- `b2b_platform_inquiry`

然后生成：

- `lead_score.v1`
- `inquiry_intake.v1`
- `missing_questions.v1`
- `first_response_draft.v1`

### 9. 报价与成交

报价类型：

- `standard_sku_quote`
- `bom_quote`
- `private_label_quote`
- `sample_quote`

所有报价都必须人工确认后发送。

### 10. 运维复盘

每日：

- 检查新询盘和未回复询盘。
- 检查报价有效期。
- 检查客户下一步触达。

每周：

- 产品浏览/RFQ/报价/成交漏斗。
- 高意向国家和产品族。
- 关键词表现。
- 客户常问问题更新 FAQ。

每月：

- 淘汰低效 SKU。
- 更新价格本。
- 审核证书有效性。
- 更新新产品和热销组合。

## 标准触发器

| 触发 | 动作 |
| --- | --- |
| 新 PDF 放入项目 | 创建 source intake 草案 |
| 新产品进入 master | 请求品牌映射和合规复核 |
| 页面访问高但 RFQ 低 | 优化 CTA、图片、FAQ 和表单 |
| RFQ 缺字段 | 自动生成补问草案 |
| 报价未回复 3 天 | 生成跟进草案 |
| 客户询问证书 | 检查证书文件，不存在则生成内部请求 |
| 产品 30 天无询盘 | 标记内容/渠道复盘 |

## 验收标准

一个产品可以进入 `active`，必须满足：

- 主数据完整。
- 新品牌映射完成。
- 合规门禁无硬阻塞。
- 价格本可用。
- 至少 5 张可发布图片。
- 英文产品页通过人工审核。
- RFQ 字段完整。
- 报价草案可由结构化数据生成。
- 所有对外动作仍处于人工确认链。
