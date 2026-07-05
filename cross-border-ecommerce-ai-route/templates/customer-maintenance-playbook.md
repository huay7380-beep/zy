# Customer Maintenance Playbook

## Customer Segments

| Segment | Trigger | Default cadence |
| --- | --- | --- |
| New inquiry | RFQ received | Immediate first reply draft |
| Quoted lead | Quote sent | 1/3/7/14 day follow-up |
| Sample customer | Sample shipped | Ship, arrival, test, revision, bulk order |
| First order customer | Payment received | Production, QC, shipment, delivery, review |
| Repeat buyer | Purchase cycle estimated | 30/15/7 day reorder reminder |
| Dormant customer | No reply for 60-90 days | Reactivation with new product or market update |
| Complaint customer | Issue opened | Evidence, solution, closure, satisfaction check |

## AI Maintenance Fields

- customer_id
- company
- contact
- market
- product_interest
- last_touch_at
- last_quote_id
- last_order_id
- purchase_cycle_days
- relationship_stage
- risk_flags
- next_action
- next_touch_at

## Draft Rules

- Keep messages short and specific.
- Reference the customer's last product, quote, order, or issue.
- Do not invent discounts, certifications, stock, or delivery promises.
- Ask one clear next-step question.
- Escalate to a human for price concessions, compensation, exclusive agency, legal terms, or payment risk.
