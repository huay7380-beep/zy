# 自有品牌目录与产品图重构方案

状态：`draft_only`

日期：2026-06-27

检查对象：

- `2024 NEW PRODUCT CATALOGUE.pdf`，6 页。
- `ELECTRONIC CATALOGUE.pdf`，50 页。

两份 PDF 文字抽取基本为空，当前应按图片型目录处理。已渲染视觉检查图到 `runtime/pdf-visual-review/**`，用于内部审阅，不作为公开素材直接发布。

## 当前检查结论

### 现有目录结构

当前两份 PDF 覆盖的核心产品线包括：

- Keystone Jack。
- Patch Panel。
- Cable Management。
- PDU。
- 86 Type Face Plate。
- UK Type Face Plate。
- EU / US / Australia Type Face Plate。
- Surface Mount Box。
- Plug & Patch Cord。
- Telecommunication Accessories。

### 现有视觉特征

| 项目 | 观察 |
| --- | --- |
| 品牌露出 | 页面顶部、封面、页脚和部分版式中存在旧品牌 Logo、公司名、网址和旧品牌标语。 |
| 型号体系 | 大量公开型号使用 `QX`、`QXKJ`、`QXPP`、`QXFP` 等工厂/旧品牌前缀。 |
| 产品图 | 多数是白底产品图，部分为多角度组合图，适合做重新抠图、统一光影和新标签重构。 |
| 版式 | 以红/紫/绿/蓝等品类色条区分产品系列，信息密度高，但整体偏旧目录风。 |
| 图片问题 | 清晰度不一、产品角度不完全统一、部分图片阴影/背景/裁切不一致，缺少品牌化细节图和应用场景图。 |
| 风险点 | 不能在未授权情况下继续使用旧品牌标识、旧公司名、旧网址、旧商标或未授权图片版权。 |

## 总体设计方向

目标不是改变产品本身，而是把产品重新包装成一个属于你的 B2B 结构化布线品牌资产系统。

### 品牌视觉定位

建议方向：`Clean Technical B2B`。

| 维度 | 建议 |
| --- | --- |
| 气质 | 专业、可靠、工程化、可采购、可询价，不做消费电子式炫技。 |
| 主色 | 深石墨黑/深海军蓝作为文字和结构色。 |
| 强调色 | 选择一种主强调色，例如电气蓝、青绿色或工业橙；每个产品族可用细色条区分，但不要再做大面积杂色。 |
| 背景 | 产品图以纯白或极浅灰为主，保持跨平台可用。 |
| 字体 | 英文目录建议使用清晰无衬线字体，标题偏工程感，正文偏易读。 |
| 风格 | 产品图干净，技术参数明确，页面留白更足，减少旧目录的拥挤感。 |

### 产品图系统

每个 SKU 至少建立 4 类图片资产。

| 图片类型 | 用途 | 设计要求 |
| --- | --- | --- |
| Hero 主图 | 目录、网站产品卡、广告落地页 | 45 度或 3/4 角度，白底，软阴影，产品占画面 70%-82%。 |
| Multi-view 多视角图 | 产品页和规格页 | 正面、背面、侧面、打开状态或端口视角，角度统一。 |
| Detail 细节图 | RFQ、销售解释、GEO 内容 | IDC、端口、屏蔽壳、锁扣、线缆管理、标签窗口、材料纹理。 |
| Context 应用图 | 解决方案页、目录封面、广告 | 机柜、弱电箱、墙面安装、数据中心或工程场景，但不能混入旧品牌。 |

### 自有标签设计

标签必须真实、克制、可执行，不建议在每个小产品正面强行放大 Logo。

| 产品族 | 标签位置建议 |
| --- | --- |
| Keystone Jack | 不在端口正面放大 Logo；使用包装贴纸、侧面小贴、产品旁品牌信息卡。 |
| Patch Panel | 可在面板标签条、包装箱、说明书和目录图角标中放品牌。 |
| Cable Management | 可在安装耳、外包装或产品图旁信息卡放品牌。 |
| Face Plate | 不建议破坏正面简洁；品牌放包装、背面标签或目录角标。 |
| Surface Mount Box | 可放底部/背面标签，公开图保持产品本体干净。 |
| Plug & Patch Cord | 可使用线缆吊牌、热缩标签、包装袋贴纸，不建议在水晶头本体上做大 Logo。 |
| Telecommunication Accessories | 以包装标签和目录角标为主。 |
| PDU | 可在机身铭牌或面板标签使用品牌，但额定电压、电流、插头标准和认证必须复核后再出现。 |

标签内容建议：

```text
[BRAND]
Structured Cabling
Public SKU: [BRAND-KJ-1001]
Grade: CAT6 / CAT6A
RFQ: brand-domain.com/rfq
```

禁止在图片上加入未经证实的认证标志，例如 CE、UL、ETL、RoHS、REACH、CPR 等。证书未覆盖时，只能写 `Certificate available upon target-market review` 或在 RFQ 中请求确认。

## 产品图重构规范

### 基础图片标准

| 项目 | 标准 |
| --- | --- |
| 背景 | 白色 `#FFFFFF` 或浅灰 `#F6F8FA`。 |
| 阴影 | 轻微自然投影，不能过重。 |
| 裁切 | 产品四周保留 8%-12% 安全边距。 |
| 分辨率 | 印刷目录主图建议长边 3000px 以上；网站图建议长边 1600px 以上。 |
| 格式 | 母版保留 PNG/PSD/TIFF，网站导出 WebP/JPG，目录使用高质量 PNG/JPG。 |
| 色彩 | 白色塑料产品避免过曝，透明件保留边缘层次，金属件保留高光但不偏色。 |
| 文件名 | 使用公开 SKU，不使用工厂旧型号作为公开文件名。 |

### 图片处理原则

- PDF 截图只能作为识别和内部草案，不建议直接作为最终公开主图。
- 优先向工厂索要原始高清图、无 Logo 图、无背景图、产品 CAD/渲染图。
- 若工厂无法提供，则采购样品后统一重拍。
- AI 可以用于去背景、统一阴影、生成背景场景、生成包装 mockup，但不能改变产品结构、端口数量、材料、颜色或规格。
- 任何旧 Logo、旧网址、旧公司名、旧品牌标语必须从公开图片和目录中移除。
- 保留产品真实形态和关键结构，不做会误导客户的美化。

## 各产品族图片设计方向

| 产品族 | 主图 | 细节图 | 场景图 | 标签策略 |
| --- | --- | --- | --- | --- |
| Keystone Jack | 45 度端口朝前，另配背部 IDC 视角 | IDC 色标、锁扣、屏蔽壳、shutter、toolless 结构 | 模块装入面板或 patch panel 的局部 | 目录角标/包装贴纸，不强压正面 Logo |
| Patch Panel | 3/4 机架视角，端口清晰 | 端口编号、后部 IDC、线缆管理条、标签条 | 机柜安装场景 | 面板标签条可放品牌 |
| Cable Management | 正面和侧面结合，体现 U 数和结构 | 理线环、安装耳、材质厚度 | 机柜中与 patch panel 搭配 | 包装或安装耳小标 |
| PDU | 机身完整视角，插孔和开关清晰 | 插头、插座、开关、线缆、铭牌 | 机柜电源管理场景 | 铭牌可品牌化，但认证和电气参数必须复核 |
| Face Plate | 正面+背面成组展示 | 端口孔位、螺丝位、材料纹理 | 墙面安装 mockup | 正面保持干净，品牌放包装/背标 |
| Surface Mount Box | 闭合和打开状态 | 内部卡扣、出线口、背面固定孔 | 桌面/墙面布线场景 | 背面或包装标签 |
| Plug & Patch Cord | 插头组件或线缆弯曲造型 | 金针、护套、线序、屏蔽壳 | 交换机/patch panel 接入 | 线缆吊牌或包装袋贴纸 |
| Telecommunication Accessories | 45 度长条结构视角 | 端子排、接线触点、模块细节 | 配线架或墙面箱内应用 | 目录角标/包装标签 |

## 目录重构结构

建议把两份 PDF 合并重构为一个自有品牌目录体系，而不是简单换 Logo。

### 新目录建议结构

```text
Cover
-> Brand / OEM Capability
-> Product Family Overview
-> Keystone Jack
-> Patch Panel
-> Cable Management
-> PDU gated section
-> Face Plate
-> Surface Mount Box
-> Plug & Patch Cord
-> Telecommunication Accessories
-> RFQ / OEM / Contact
-> Specification Appendix
```

### 页面结构

| 页面类型 | 设计 |
| --- | --- |
| 封面 | 自有品牌 Logo、结构化布线定位语、核心产品 hero 图，不出现旧品牌。 |
| 品牌/OEM 页 | 工厂能力、私标流程、质检流程；使用授权后的工厂图或重制图。 |
| 品类分隔页 | 一个产品族一个主视觉，使用单一强调色。 |
| 产品列表页 | 2-4 个 SKU 一组，图片更大，参数表更清晰。 |
| 产品详情页 | 用于重点 SKU，展示多视角、细节、可选规格和 RFQ 字段。 |
| RFQ 页 | 明确采购者要提供的字段：数量、等级、屏蔽、端口、颜色、目标市场、证书需求。 |

## 型号与品牌替换规则

### 公开 SKU

旧型号不要直接作为公开主型号。建议生成公开 SKU，并在内部保留工厂型号映射。

示例：

| 类型 | 示例 |
| --- | --- |
| 工厂旧型号 | `QXKJ-1001` |
| 新公开 SKU | `[BRAND]-KJ-1001` |
| 内部映射 | `factory_sku: QXKJ-1001` |

公开 SKU 建议结构：

```text
[BRAND]-[FAMILY]-[SERIES]-[VARIANT]
```

示例：

- `[BRAND]-KJ-C6-001`
- `[BRAND]-PP-24-C6A-001`
- `[BRAND]-FP-86-2P-001`

### 必须替换或隐藏

- 旧 Logo。
- 旧公司名。
- 旧网址。
- 旧品牌标语。
- 旧品牌色作为主视觉。
- 工厂旧型号作为公开主型号。

### 可以保留但要重写

- 产品结构。
- 产品图片角度参考。
- 产品族分类。
- 产品参数字段。
- 产品功能描述，但需重新组织语言，避免直接复制旧目录文案。

## 执行流程

### Phase 0：授权与边界确认

你需要向工厂确认：

- 是否允许更换品牌、型号、包装和目录。
- 是否允许使用、修改、抠图、重排现有产品图片。
- 是否可以提供无 Logo 高清原图。
- 是否可以提供证书、测试报告、包装资料和真实参数。

输出：

- `supplier_private_label_authorization.v1`
- `image_usage_permission.v1`
- `certificate_claim_gate.v1`

### Phase 1：产品与图片盘点

我可以执行：

- 从两份 PDF 建立产品族和 SKU 清单。
- 标记每个产品图的质量等级：`A usable`、`B retouch required`、`C reshoot required`。
- 建立旧 SKU 到新公开 SKU 的映射草案。
- 标记旧品牌露出位置。

输出：

- `runtime/products/import-drafts/pdf_product_image_audit.csv`
- `runtime/products/import-drafts/public_sku_map.draft.json`
- `runtime/products/import-drafts/image_rebuild_task_list.json`

### Phase 2：品牌视觉系统

需要你确认品牌名后执行：

- Logo 使用规则。
- 目录主色和品类色。
- 产品图角标和标签规范。
- 包装贴纸/线缆吊牌/铭牌样式。

输出：

- `brand_visual_system.v1`
- `catalogue_page_style_guide.v1`
- `product_label_system.v1`

### Phase 3：产品图重构

按产品族批量处理：

1. 获取高清原图或拍摄样品。
2. 去背景和统一白底。
3. 清理旧品牌和旧网址。
4. 统一角度、比例、阴影和色温。
5. 增加自有品牌角标或真实标签 mockup。
6. 输出目录版、网站版、缩略图版。

输出：

```text
runtime/products/master/images/[public_sku]/print/
runtime/products/master/images/[public_sku]/web/
runtime/products/master/images/[public_sku]/thumb/
```

### Phase 4：目录重构

生成新的自有品牌目录：

- 合并旧 6 页新产品目录和 50 页电子目录。
- 删除旧品牌体系。
- 重建目录结构和页面模板。
- 每页使用统一标题、参数、RFQ CTA。
- PDU 单独加高合规复核标记。

输出：

- `public_catalogue_draft.pdf`
- `public_catalogue_draft.pptx` 或可编辑源文件。
- `catalogue_old_brand_cleanup_report.v1`

### Phase 5：网站与获客素材

将目录资产拆成网站和推广资产：

- 产品主图。
- 分类页 banner。
- RFQ 落地页图片。
- Google Ads / LinkedIn Lead Gen 配图。
- GEO 问答和产品选择指南图。

输出：

- `site_product_image_pack.v1`
- `seo_geo_visual_asset_pack.v1`
- `ad_creative_visual_pack.v1`

## 验收标准

| 项目 | 验收要求 |
| --- | --- |
| 品牌独立性 | 公开目录、图片、文件名、页眉页脚中无旧 Logo、旧公司名、旧网址。 |
| 产品真实性 | 产品结构、端口数、颜色、材料、规格不被 AI 或修图改变。 |
| 图片统一性 | 同一产品族角度、背景、阴影、比例统一。 |
| SKU 体系 | 公开 SKU 与工厂 SKU 有映射，但公开材料不暴露工厂 SKU。 |
| 合规 claims | 证书、等级、电气参数、目标市场声明都有来源或被门禁阻塞。 |
| 可复用性 | 每个产品有目录图、网站图、缩略图和源文件归档。 |
| 可询价性 | 每个产品页或目录项有 RFQ 字段和采购补问信息。 |

## 推荐下一步

建议先做一个低风险试点：

1. 选 2 个产品族：`Keystone Jack` 和 `Patch Panel`。
2. 每个产品族选 5 个代表 SKU。
3. 生成新公开 SKU、图片重构任务、页面模板和品牌标签 mockup。
4. 你确认视觉方向后，再扩展到全目录。

这一步不需要真实发布，也不会改变产品，只是在本地建立可复用的自有品牌视觉和目录重构标准。
