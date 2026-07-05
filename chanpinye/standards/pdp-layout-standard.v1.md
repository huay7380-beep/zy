# PDP Layout Standard v1

## 标准定位

本标准用于构建跨境 B2B 产品页、产品规格页和可导出的 PDF spec sheet。页面优先服务海外采购、工程商、分销商和项目型买家，目标是让买家快速完成技术判断、询盘和报价准备。

## 固定输出形态

| 输出 | 用途 |
|---|---|
| Web PDP | 用于独立站浏览、SEO、AI 客服读取、询盘入口 |
| PDF Spec Sheet | 用于邮件附件、销售报价、采购确认、工程资料归档 |

## 8 个固定模块

| 顺序 | 模块 | 必填内容 | 输出要求 |
|---:|---|---|---|
| 1 | 产品身份区 | 产品名、型号、品类、等级、适用场景 | 页面首屏和 PDF 首页必须出现 |
| 2 | 产品主视觉区 | 完整主图、局部结构图、应用/安装图 | 不允许产品被截断；图片需对应文案 |
| 3 | 核心卖点区 | 4-6 条卖点 | 区分通用卖点和产品独有卖点 |
| 4 | 应用场景区 | 使用场景、买家角色、项目类型 | 面向采购判断，不写空泛营销语 |
| 5 | 技术规格区 | 电气、机械、材料、尺寸、颜色、端接方式 | 缺失项标注待确认 |
| 6 | 标准与认证区 | 标准、认证、测试报告、合规状态 | 每条声明必须有状态 |
| 7 | 型号与包装区 | SKU、颜色、包装、箱规、OEM/ODM | 支持后续报价和备货 |
| 8 | 采购行动区 | RFQ、样品、批量价、定制项、交期、联系人 | 不承诺未经确认的价格、MOQ 和交期 |

## 内容状态规则

每条关键产品声明必须归入以下状态之一：

| 状态 | 含义 |
|---|---|
| confirmed | 已由用户、工厂资料或检测文件确认 |
| source_listed | 源网页、目录或供应商资料显示，但未提供证明文件 |
| needs_confirmation | 当前缺少确认文件或明确参数 |
| not_applicable | 当前品类不适用 |
| blocked | 不允许展示或对外声明 |

## 标准字段

```json
{
  "product_id": "",
  "source_model_id": "",
  "product_name": "",
  "category": "",
  "subcategory": "",
  "sales_mode": [],
  "application_scenarios": [],
  "buyer_roles": [],
  "primary_image": "",
  "detail_images": [],
  "technical_grade": "",
  "standards": [],
  "certifications": [],
  "materials": [],
  "electrical_specs": {},
  "mechanical_specs": {},
  "dimensions": {},
  "colors": [],
  "part_number_matrix": [],
  "packaging": {},
  "private_label_options": [],
  "customization_options": [],
  "moq": "",
  "lead_time": "",
  "price_logic": "",
  "missing_fields": [],
  "claim_status": {
    "confirmed": [],
    "source_listed": [],
    "needs_confirmation": [],
    "blocked": []
  }
}
```

## 品类扩展规则

| 品类 | 追加字段 |
|---|---|
| Keystone Jack | 端接方式、线规、IDC 材料、插拔寿命、兼容面板 |
| Patch Panel | 端口数、屏蔽类型、机柜规格、理线方式 |
| PDU | 插座类型、电流电压、线缆长度、认证、电气安全 |
| Face Plate | 模块位数、材质、颜色、安装标准 |
| Patch Cord | 线规、护套材料、长度、颜色、测试标准 |
| Tools | 适配线缆、刀片材质、使用寿命、替换件 |

## 排版规则

- 主标题：30-34px，深黑，短句。
- 副标题：16-18px，说明品类、应用和等级。
- 模块标题：13-14px，使用 Deep Teal。
- 正文：13-15px，行高 1.45-1.6。
- 表格：字段在左，参数在右，不做复杂嵌套。
- 标签：用于标准、材料、状态、应用。
- PDF：默认 2 页；资料过多时扩展为 4 页标准模板。

## 产品图规则

- 至少包含 1 张完整主图、1 张结构/局部图、1 张应用或安装场景图。
- 最终公开页不得带旧品牌水印。
- 配件、端口、颜色、标签必须与文案一致。
- 缺失 CAD 或尺寸图时使用占位区，并标注待补充。

