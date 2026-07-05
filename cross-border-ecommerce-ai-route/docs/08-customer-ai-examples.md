# 客户 AI 维护实例库

以下话术都是草案示例，真实发送前必须人工确认客户身份、产品信息、价格、交期、附件和承诺边界。

## 1. 首次询盘回复

### 场景

客户问：`Please quote 500 pcs of Model AB100 to Germany. Need logo printing.`

### AI 识别

```json
{
  "product": "AB100",
  "quantity": 500,
  "destination_country": "Germany",
  "customization": "logo printing",
  "missing_fields": ["destination city or port", "preferred shipping method", "logo file", "target delivery date"]
}
```

### 英文草案

```text
Hi {{first_name}},

Thank you for your inquiry about Model AB100.

We can support 500 pcs with logo printing. To prepare an accurate quotation, could you please share:

1. Destination city or port in Germany
2. Preferred shipping method: express, air, or sea
3. Logo file or printing position
4. Target delivery date

Once confirmed, we will send the quotation with lead time, packing details, and sample options.

Best regards,
{{sales_name}}
```

## 2. 报价邮件

```text
Subject: Quotation for AB100 - 500 pcs with logo printing

Hi {{first_name}},

Please find our quotation for AB100 below.

Product: AB100
Quantity: 500 pcs
Customization: Logo printing
Price: USD {{unit_price}} / pc, {{incoterms}} {{place}}
Lead time: {{lead_time}} after artwork and deposit confirmation
Packing: {{packing}}
Payment: {{payment_terms}}
Validity: {{valid_until}}

Notes:
- The quotation is based on the shipping information currently available.
- Final printing will be confirmed after artwork review.
- Sample can be arranged before bulk production.

Please let us know if you prefer another shipping method or need a quantity break quotation.

Best regards,
{{sales_name}}
```

## 3. 报价后 24 小时跟进

```text
Hi {{first_name}},

Just checking whether you received our quotation for AB100.

If you are comparing options, I can also prepare:
- a lower MOQ trial order
- a sample plan
- a sea/air/express shipping comparison
- a quantity break price for 1,000 pcs and 3,000 pcs

What would be the best next step for your project?
```

## 4. 价格异议

```text
Hi {{first_name}},

Thank you for the feedback. I understand the price target.

Our current quotation includes {{quality_or_material_point}}, {{qc_point}}, and {{packing_or_certification_point}}. To help you meet the budget, we can check three options:

1. Adjust quantity to reach a better price tier
2. Review packaging or customization scope
3. Offer an alternative model with a lower cost structure

If you can share your target price and annual volume, I will ask our team to prepare the best workable option.
```

## 5. 样品跟进

```text
Hi {{first_name}},

The AB100 sample was shipped today.

Tracking number: {{tracking_number}}
Carrier: {{carrier}}
Estimated arrival: {{eta}}

When you receive it, please check:
1. Appearance and material
2. Logo position and color
3. Function test
4. Packaging condition

We can adjust the bulk order specification based on your sample feedback.
```

## 6. 沉默客户唤醒

```text
Hi {{first_name}},

I hope everything is going well.

We recently updated {{product_or_category}} with:
- {{new_feature}}
- {{new_certificate_or_packaging}}
- {{new_lead_time_or_price_advantage}}

Would it be useful if I send you the updated catalog and price range for your market?
```

## 7. 售后问题收集

```text
Hi {{first_name}},

I am sorry to hear about the issue. We will check it carefully.

Could you please send:
1. Photos or video of the issue
2. Outer carton label or batch number
3. Quantity affected
4. Whether the cartons were damaged when received
5. How the product was used or installed

Once we have these details, we will identify the cause and propose a solution.
```

## 8. 复购提醒

```text
Hi {{first_name}},

Based on your last order quantity and delivery date, you may be preparing the next purchase cycle soon.

Current lead time for {{product}} is {{lead_time}}, and we recommend confirming the next order by {{recommended_date}} if you need stock before {{target_season}}.

Would you like us to reserve production capacity or update the quotation for your next quantity?
```

## 9. 客户维护规则

| 客户类型 | 维护方式 |
| --- | --- |
| 新询盘未报价 | 24 小时内补问关键信息 |
| 已报价未回复 | 1/3/7/14 天跟进 |
| 样品客户 | 发货、到货、测试、修改、量产五步跟进 |
| 首单客户 | 生产节点和到货节点主动更新 |
| 复购客户 | 库存消耗、旺季、汇率、原料波动提醒 |
| 高价值客户 | 月度行业/新品/价格趋势简报 |
| 客诉客户 | 问题关闭后 7 天满意度回访 |

## 10. AI 记忆字段

每次客户互动后记录：

- 客户偏好：价格/质量/交期/认证/包装。
- 目标市场。
- 常用 Incoterms。
- 付款习惯。
- 采购周期。
- 对手供应商信息。
- 敏感点。
- 下一步动作。
