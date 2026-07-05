# 品牌更换与私标运营方案

当前产品源头目录中可见 `QX network`、`Qixiang`、`Cixi Qixiang Telecommunication Equipments Co., Ltd.` 等工厂品牌信息。你的目标是产品不变、品牌更换，所以必须把“工厂源头”与“公开品牌”分离。

## 原则

1. 产品可以不变，但公开品牌、SKU、包装、目录、网站和客户话术必须统一。
2. 工厂品牌和型号保留在内部审计字段，不作为前台品牌资产。
3. 证书、测试报告、授权文件必须确认是否覆盖新品牌、新型号和目标市场。
4. 未确认授权前，不公开宣称“自有品牌证书已覆盖”。
5. 不修改产品真实技术参数，不伪造认证，不删除必要来源记录。

## 品牌架构

建议采用：

```text
Public Brand
-> Product Line
-> Public SKU
-> Factory Model Mapping
```

示例：

```text
Public Brand: to be decided
Product Line: Structured Cabling
Public SKU: SC-KJ-C6A-UTP-TL-001
Factory Model: QXKJ-xxxx internal only
```

SKU 规则建议：

```text
SC-{family}-{grade}-{shielding}-{feature}-{sequence}
```

示例：

- `SC-KJ-C6A-UTP-TL-001`: CAT6A UTP toolless keystone jack。
- `SC-PP-24P-C6-STP-001`: 24 port CAT6 STP patch panel。
- `SC-FP-86-2P-WH-001`: 86 type 2 port white face plate。
- `SC-PDU-EU-8W-1U-001`: EU type 8 way 1U PDU。

## 替换范围

| 资产 | 处理 |
| --- | --- |
| 产品图片 | 删除旧 Logo、水印、旧品牌背景；必要时重拍 |
| PDF 目录 | 不能直接对外使用原目录；重排为新品牌目录 |
| 型号 | 工厂型号内部保留，对外用自有 SKU |
| 包装 | 新品牌标签、条码、外箱唛头、说明书 |
| 证书 | 确认型号和品牌覆盖；不覆盖则作为工厂能力材料，不作为自有品牌证书 |
| 网站 | 只出现新品牌、产品线和公开 SKU |
| 客户话术 | 可说 OEM/ODM source capability，不能混淆品牌所有权 |

## 品牌更换流程

### 1. 选择品牌

输入：

- 3-5 个英文品牌候选。
- 目标市场。
- 域名可用性。
- 商标检索结果。

输出：

- `brand_candidate_matrix.v1`
- `selected_brand.v1`

人工门禁：

- 商标和域名必须人工确认。

### 2. 建立品牌资料包

包括：

- Logo。
- 主色和字体。
- 产品页图片风格。
- PDF 目录模板。
- 邮箱签名。
- 包装标签。
- 公司介绍。
- 质保和售后说明。

输出：

- `brand_asset_pack.v1`

### 3. 建立型号映射

每个 SKU 保留两个编号：

| 字段 | 用途 |
| --- | --- |
| `factory_model` | 内部采购、质检、追溯 |
| `public_sku` | 网站、报价、客户沟通 |

输出：

- `public_sku_map.v1`

### 4. 图片和目录重制

优先顺序：

1. 向工厂要无 Logo 原图。
2. 自己重拍白底图和细节图。
3. 对旧图做内部参考，不直接公开。

输出：

- `rebranded_image_pack.v1`
- `public_catalogue_draft.v1`

### 5. 包装和标签

必须确认：

- 单品标签。
- 外箱标签。
- 条码。
- 型号。
- Made in China / country of origin。
- 必要警示语。
- PDU 的额定参数标签。

输出：

- `packaging_label_spec.v1`

### 6. 证书和授权

向工厂收集：

- OEM/ODM 授权。
- 质量体系证书。
- 产品测试报告。
- RoHS/REACH 声明。
- PDU 安规相关文件。
- 型号覆盖表。

输出：

- `certificate_coverage_matrix.v1`
- `blocked_public_claims.v1`

### 7. 网站和资料发布

发布前检查：

- 没有旧品牌露出。
- 没有未经授权的认证 claims。
- 没有错误型号。
- 没有价格和交期硬承诺。
- RFQ 字段能收集报价所需数据。

输出：

- `site_publish_review.v1`

### 8. 客户沟通

可用表达：

```text
We provide structured cabling products with OEM/ODM and private-label support.
Please share your target market, required category, shielding type, quantity and certification request so we can prepare a quote.
```

避免表达：

```text
We own all factory certificates under our new brand.
This product is certified for all markets.
The catalogue price is final.
```

## 风险清单

| 风险 | 处理 |
| --- | --- |
| 旧品牌图片直接上站 | 阻塞发布，重拍或重制 |
| 工厂证书不覆盖新品牌 | 不公开对应 claim，要求授权或重新测试 |
| PDU 目标市场认证不足 | 阻塞销售，专业复核 |
| 客户要求独家代理 | 进入合同/法务人工门禁 |
| 私标包装 MOQ 未确认 | 报价前补问 |
| 商标冲突 | 换品牌或换市场 |

## AI 可自动化

AI 可以：

- 从目录提取旧型号和产品系列。
- 生成公开 SKU。
- 生成旧品牌清理清单。
- 生成英文产品标题和描述。
- 检查页面是否出现旧品牌词。
- 生成证书缺口列表。
- 生成客户补问信。

AI 不可以直接：

- 判断商标最终可用。
- 伪造或改写证书。
- 承诺认证覆盖。
- 自动发送客户报价或付款说明。
- 自动提交报关、税务、外汇资料。
