# RFQ 字段、报价草案结构与站点信息架构

状态：`draft_only`

本文件把当前结构化布线产品线推进到可执行的信息架构、询盘字段和报价草案结构。所有真实客户发送和真实报价仍需人工确认。

## 目标

建立一套可重复使用的 B2B 询盘和报价底座：

```text
产品页 / 解决方案页 / 广告落地页
-> RFQ 表单
-> RFQ Intake
-> 缺口问题
-> ProductMaster / PriceBook / ComplianceProfile
-> QuoteDraft
-> HumanGate
-> ControlledSend
-> Audit Writeback
```

## 站点信息架构

权威模板：`templates/site-information-architecture.template.json`

### 顶层导航

| 导航 | 目的 |
| --- | --- |
| Products | 按产品族承接采购搜索和 RFQ |
| Solutions | 按应用场景承接项目型客户 |
| Resources | 目录、规格书、FAQ、合规资料请求 |
| Factory & OEM | 私标、OEM/ODM、工厂能力 |
| RFQ | 主询盘入口 |
| Contact | 邮箱、WhatsApp、LinkedIn 入口 |

### 产品分类

```text
Products
-> Keystone Jacks
-> Patch Panels
-> Cable Management
-> 110 Cabling System
-> Face Plates
-> Surface Mount Boxes
-> Patch Cords & RJ45 Plugs
-> Telecommunication Accessories
-> Power Distribution Units
```

### 解决方案页

```text
Solutions
-> Data Center Cabling
-> Office Network Cabling
-> Telecom Room Distribution
-> OEM / ODM Private Label
-> Distributor Stock Program
```

解决方案页用于补足 SEO/GEO 的场景语义，也方便客户按项目提交 BOM。

## 产品页字段

每个产品页必须具备：

| 字段 | 用途 |
| --- | --- |
| `public_sku` | 对外型号，不暴露工厂型号 |
| `family_id` | 路由到动态 RFQ 字段 |
| `grade` | CAT5E/CAT6/CAT6A/CAT7/CAT8 |
| `shielding` | UTP/STP/FTP/SFTP |
| `ports_or_size` | 端口数、尺寸或 rack unit |
| `material` | ABS、PC、金属、铝合金等 |
| `moq` | 限定有效询盘 |
| `lead_time` | 样品和大货交期 |
| `certificate_request_policy` | 证书需按目标市场确认 |
| `rfq_cta` | 进入动态询盘表单 |

发布门禁：

- 新品牌映射完成。
- 旧品牌在公开页面不可见。
- 认证/等级/材料 claims 有来源。
- PDU 不允许绕过高合规复核。

## RFQ 字段

权威模板：`templates/rfq-field-map.structured-cabling.template.json`

权威 schema：`schemas/rfq-intake.schema.json`

### 通用必填

- company
- contact_name
- email
- country
- product_family
- quantity
- message
- consent_checkbox

### 通用建议字段

- phone_or_whatsapp
- website
- buyer_type
- destination_city_or_port
- preferred_incoterms
- target_delivery_date
- sample_required
- private_label_required
- certificate_request

### 产品族动态字段

| 产品族 | 动态字段 |
| --- | --- |
| Keystone Jack | grade、shielding、termination、angle、shutter、color、packing |
| Patch Panel | ports、rack_unit、grade、shielding、loaded_or_blank、cable_manager |
| Cable Management | rack_unit、style、material、color |
| 110 Cabling System | pair_count、module_type、mounting_type |
| Face Plate | country_type、size、ports、angle、material、color |
| Surface Mount Box | ports、blank_or_loaded、grade、material、color |
| Plug & Patch Cord | grade、shielding、length、jacket、color、wire_gauge、plug_type |
| Telecommunication Accessories | pair_count、module_type、mounting_frame |
| PDU | target_country、plug_country_type、outlet_count、rack_unit、rated_voltage、rated_current、cable_length、certificate_request |

## RFQ 路由

```text
RFQ Submit
-> cbx_08_lead_capture
-> lead_score
-> cbx_09_inquiry_reception
-> missing_questions / first_response_draft
-> cbx_10_quote_engine when quote_allowed=true
```

线索评级：

| 等级 | 条件 |
| --- | --- |
| A | 公司邮箱、明确产品族、数量、目的地、项目/经销商/OEM 意图 |
| B | 产品和联系人明确，但数量、目的地或目标价缺失 |
| C | 公司信息弱、产品不清楚或像个人零售询问 |
| D | 垃圾、无效联系方式或不支持产品 |

## 报价草案结构

权威模板：`templates/quote-draft.structured-cabling.template.json`

权威 schema：`schemas/quote-draft.schema.json`

报价类型：

| 类型 | 适用 |
| --- | --- |
| `standard_sku_quote` | 标准 SKU 批量询价 |
| `bom_quote` | 工程项目/BOM 多产品组合 |
| `private_label_quote` | 新品牌、包装、标签、目录或轻改款 |
| `sample_quote` | 样品确认 |

报价输入：

```text
RFQ Intake
+ ProductMaster
+ PriceBook
+ Packaging
+ FreightAssumption
+ ComplianceProfile
+ MarginPolicy
= QuoteDraft
```

报价草案必须包含：

- customer
- quote_type
- line_items
- technical_spec
- quantity
- unit_price
- packing
- lead_time
- incoterms
- payment_terms
- valid_until
- source_refs
- risk_checks
- human_gate

## 报价风险门禁

| 风险 | 处理 |
| --- | --- |
| ProductMaster 不存在 | 阻塞报价 |
| 成本缺失 | 阻塞报价 |
| 毛利未过底线 | 阻塞或请求人工确认 |
| 认证 claims 未验证 | 删除 claims 或阻塞发送 |
| PDU 目标市场未复核 | 阻塞外发报价或只发补问信 |
| 私标包装成本未知 | 报价中标记待确认 |

## 客户话术

权威话术库：`templates/customer-message-playbook.structured-cabling.md`

首期覆盖：

- 首响缺字段。
- BOM 报价请求。
- 私标需求澄清。
- 证书请求。
- 报价 3 天跟进。
- 样品跟进。

所有话术为 `draft_only`，不能自动发送。

## Runtime 输出位置

后续运行产物统一写入：

```text
cross-border-ecommerce-ai-route/runtime/rfq/**
cross-border-ecommerce-ai-route/runtime/quotes/**
cross-border-ecommerce-ai-route/runtime/site/**
cross-border-ecommerce-ai-route/runtime/customers/**
cross-border-ecommerce-ai-route/runtime/validations/**
```

禁止写入主目录 `runtime/`。
