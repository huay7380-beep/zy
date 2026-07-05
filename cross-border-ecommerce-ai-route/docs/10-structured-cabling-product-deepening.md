# 结构化布线产品线深化方案

## 结论

这批产品适合按 `B2B 项目型询盘 + OEM/ODM 私标 + 经销商备货` 来运营，而不是按普通零售电商来做。核心不是直接购物车成交，而是把客户项目需求转成 BOM、样品、报价和长期供货关系。

当前两个 PDF 是图片型目录，未包含可抽取文字。本文基于视觉检查形成产品系列种子，后续全量 SKU 入库需要 OCR 或人工复核。

## 产品定位

| 维度 | 定位 |
| --- | --- |
| 产品域 | Structured cabling solutions / network and telecommunication accessories |
| 主要客户 | 弱电工程商、系统集成商、机房/数据中心承包商、区域经销商、OEM/ODM 私标客户 |
| 核心采购方式 | RFQ、BOM 报价、样品确认、批量采购、项目复购 |
| 首期站点目标 | 建立可信产品资料库，承接询盘，形成可报价数据，不急于开放在线付款 |
| 销售承诺边界 | 认证、等级、材料、阻燃、额定电压/电流、交期、价格都必须来源于结构化资料和人工确认 |

## 产品系列

| 系列 | 来源页 | 典型字段 | 报价关键问题 | 运营备注 |
| --- | --- | --- | --- | --- |
| Keystone Jack | Electronic 01-08, New 01-04 | CAT 等级、UTP/STP、免工具、90 度、带防尘门、inline coupler、颜色 | CAT5E/6/6A/7/8？屏蔽还是非屏蔽？数量？是否需要测试报告？ | 适合做 SEO 和样品包入口 |
| Patch Panel | Electronic 09-18, New 05-06 | 24/48 port、1U/2U、loaded/blank、UTP/STP、线缆管理、带门/无门 | 端口数、机架尺寸、是否带模块、是否含理线、等级 | 项目型询盘高频，适合和 keystone 组合报价 |
| Cable Management | Electronic 19-20 | 1U/2U、金属环/塑料环、刷板、盲板 | 机柜尺寸、材质、数量、是否与配线架配套 | 作为配套加购，提高客单 |
| 110 Cabling System | Electronic 21-22 | pair count、wiring block、mounting frame | 对数、安装方式、通信项目用途 | 适合电信/语音项目客户 |
| Face Plate | Electronic 23-34, New 08 | 86 型、英式/法式/美式、端口数、角度、ABS、颜色 | 国家制式、端口数、颜色、是否带标签窗口 | 目标市场差异明显，页面必须按国家制式筛选 |
| Surface Mount Box | Electronic 35-36 | 1/2 port、空盒/带模块、ABS、颜色 | 端口数、是否空盒、CAT 等级 | 可和 keystone 组合销售 |
| Plug & Patch Cord | Electronic 37-40, New 07 | RJ45 plug、patch cord、CAT、UTP/STP、长度、PVC/LSZH、颜色、线规 | 长度、颜色、线材、屏蔽、是否 LSZH、包装 | 跳线可做变体矩阵，水晶头可做工程配套 |
| Telecommunication Accessories | Electronic 41-43 | 10 pair modules、mounting frame、profile | 对数、模块类型、安装框架 | 更偏工程/电信项目，需单独分类 |
| PDU | Electronic 44-45 | 国家插头、插孔数、1U/1.5U、线长、材料、电压/电流 | 目标国家、插头类型、额定电压/电流、认证 | 电源类单独高风险合规门，不能和无源配件共用认证假设 |

## 标准产品层级

```text
Brand
-> Product Family
-> Series
-> Model
-> Variant
-> Packaging Unit
-> Quote Item
```

示例：

```text
NewBrand
-> Keystone Jacks
-> Toolless UTP Keystone Jack
-> own public model
-> CAT6A / UTP / white / shutter
-> 1 pc bag, 100 pcs carton
-> Quote line: 5,000 pcs FOB Ningbo
```

内部必须保存 `factory_model`，对外使用 `public_sku/public_model`。这样换品牌后仍能追溯源头、成本、包装和质量问题。

## 产品主数据必填字段

| 字段组 | 必填字段 |
| --- | --- |
| 来源 | PDF 文件、页码、工厂品牌、工厂型号、抽取置信度 |
| 品牌映射 | 新品牌、公开 SKU、公开型号、是否私标授权、旧品牌是否隐藏 |
| 分类 | family_id、站点分类、适用场景、目标客户 |
| 技术规格 | CAT 等级、屏蔽、端口数、rack unit、材质、颜色、端接方式、线规、外被、PDU 电气参数 |
| 商业 | MOQ、样品、样品交期、大货交期、成本、阶梯价、毛利底线 |
| 包装物流 | 单品包装、外箱数量、外箱尺寸、毛重、条码、唛头 |
| 合规 | 目标市场、HS code 候选、证书文件、标签要求、禁止承诺 |
| 内容 | 英文标题、卖点、规格表、FAQ、图片、视频、下载资料 |
| 运维 | 上架状态、报价门禁、对外发送门禁、最后复核时间 |

模板文件：`templates/structured-cabling-product-master.template.json`。

## 独立站分类结构

```text
Home
-> Products
   -> Keystone Jacks
   -> Patch Panels
   -> Cable Management
   -> 110 Cabling System
   -> Face Plates
   -> Surface Mount Boxes
   -> Patch Cords & RJ45 Plugs
   -> Telecommunication Accessories
   -> Power Distribution Units
-> Solutions
   -> Data Center Cabling
   -> Office Network Cabling
   -> Telecom Room Distribution
   -> OEM / ODM Private Label
   -> Distributor Stock Program
-> Resources
   -> Catalogues
   -> Datasheets
   -> Installation Notes
   -> Compliance Documents
-> RFQ
```

产品页不要只展示图片。每个产品页至少要有：

- Model / SKU。
- CAT 等级和屏蔽类型。
- 应用场景。
- 可选变体。
- MOQ、样品、交期。
- 可下载资料。
- RFQ 表单。
- 相关产品组合。

## RFQ 字段

通用必填：

- company
- country
- email / WhatsApp
- product family
- model or application
- quantity
- target delivery date
- message

结构化布线专用字段：

| 产品 | 额外字段 |
| --- | --- |
| Keystone / Plug / Patch Cord | CAT 等级、UTP/STP、颜色、端接方式、是否 LSZH |
| Patch Panel | 端口数、1U/2U、loaded/blank、是否带 cable manager |
| Face Plate / Surface Box | 国家制式、端口数、尺寸、颜色 |
| 110 System | pair count、mounting type |
| PDU | 目标国家、插头/插孔类型、额定电压、额定电流、线长、认证要求 |

## 报价逻辑

结构化布线客户通常不是单 SKU 购买，而是项目包购买。报价引擎要支持三种模式：

| 模式 | 适用 |
| --- | --- |
| 单品阶梯价 | 经销商补货、标准样品 |
| BOM 报价 | 工程项目，多个产品组合 |
| 私标开发报价 | 新品牌包装、丝印、目录、颜色、模具或轻改款 |

报价必须由结构化数据生成：

```text
ProductMaster
+ PriceBook
+ Packaging
+ FreightAssumption
+ ComplianceGate
+ BrandPackagingCost
+ MarginPolicy
= QuoteDraft
```

LLM 只生成英文说明、缺口问题和跟进计划，不直接决定价格。

## 获客策略

| 渠道 | 用法 |
| --- | --- |
| SEO | 按 `CAT6 keystone jack manufacturer`, `24 port patch panel supplier`, `OEM face plate factory` 等长尾词建页 |
| Google Ads | 先投核心 RFQ 词，不投泛流量词 |
| LinkedIn | 找系统集成商、采购经理、低压工程承包商、数据中心承包商 |
| B2B 平台 | 用于验证国家和产品词，不作为唯一客户资产 |
| 邮件/WhatsApp | 只对已确认公司和联系人做人工确认后的触达 |
| 展会/名片 | 导入 CRM 后按产品兴趣分组维护 |

## 合规与认证门禁

不要把工厂目录里的等级、材料或证书直接变成公开承诺。每个产品要按目标市场建立合规门：

| 产品 | 首期门禁 |
| --- | --- |
| 无源网络配件 | RoHS/REACH 材料声明、目标市场标签、型号一致性 |
| 跳线/线缆 | 材料、线规、外被、阻燃/LSZH、目标市场安装用途；EU 建筑安装场景可能触发 CPR |
| PDU | 额定电压/电流、插头制式、安规测试、标签、目标国家认证；必须专业复核 |
| 公开认证 claims | 必须有对应文件、型号覆盖、品牌授权或重发报告 |

## AI 节点深化

| 原节点 | 产品线深化 |
| --- | --- |
| `cbx_02_product_compliance` | 按 family_id 生成合规门禁，不把 PDU 和无源件混在一起 |
| `cbx_04_independent_site` | 站点按产品系列和解决方案双导航 |
| `cbx_05_content_assets` | 建立白底图、细节图、应用图、包装图、规格表 |
| `cbx_06_catalog_pricing` | 用 ProductMaster + PriceBook 支持单品、BOM、私标三类报价 |
| `cbx_08_lead_capture` | RFQ 根据产品系列动态补字段 |
| `cbx_09_inquiry_reception` | 自动判断客户是经销商、工程商、OEM 还是终端项目 |
| `cbx_10_quote_engine` | 标准品 30 分钟内出草案；BOM/私标要求缺口问题 |
| `cbx_14_after_sales_retention` | 按项目周期和补货周期维护客户 |

## 当前阻塞项

- PDF 为图片型目录，需 OCR 或人工复核后才能生成全量 SKU 表。
- 新品牌名称、域名、Logo、商标检索状态未确定。
- 工厂是否允许私标、是否可提供无旧品牌图片/包装/授权文件未确认。
- 目标市场未确认，合规与认证只能作为门禁，不能作为最终结论。
- 成本、MOQ、包装、交期、证书文件和测试报告尚未入库。
