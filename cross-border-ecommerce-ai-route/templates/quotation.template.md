# Quotation Draft

Status: `draft_only`

## Customer

- Company: `{{company}}`
- Contact: `{{contact}}`
- Country: `{{country}}`
- Inquiry ID: `{{inquiry_id}}`

## Quotation

| Item | Description |
| --- | --- |
| Product | `{{product_name}}` |
| Model/SKU | `{{sku}}` |
| Quantity | `{{quantity}}` |
| Unit price | `{{currency}} {{unit_price}}` |
| Incoterms | `{{incoterms}} {{place}}` |
| Lead time | `{{lead_time}}` |
| Packing | `{{packing}}` |
| Payment terms | `{{payment_terms}}` |
| Valid until | `{{valid_until}}` |

## Notes

- Price is based on the current quantity, product specification, packaging, and shipping assumptions.
- Customization details require final artwork or specification confirmation.
- Certification and compliance claims must be verified before external sending.
- This quotation must be approved by a human operator before being sent.

## Gate Checklist

- [ ] SKU exists in ProductMaster.
- [ ] Cost source is available.
- [ ] Margin floor passes.
- [ ] Incoterms and place are clear.
- [ ] Logistics cost source is available if freight is included.
- [ ] Lead time is confirmed.
- [ ] Certification statements are verified.
- [ ] Payment terms are approved.
- [ ] Human approval recorded.
