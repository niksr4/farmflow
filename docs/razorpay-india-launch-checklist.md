# Razorpay India Launch Checklist

This checklist is for the FarmFlow product subscription layer, not the estate-side billing module inside the app.

It is an engineering and operations checklist, not legal advice. Review it with tax and legal counsel before go-live.

## Gateway Setup

1. Enable **Razorpay Subscriptions** on the production account.
2. Create dashboard plans for `basic`, `core`, and `enterprise`.
3. Store the plan IDs in environment variables:
   - `RAZORPAY_PLAN_BASIC_MONTHLY_ID`
   - `RAZORPAY_PLAN_CORE_MONTHLY_ID`
   - `RAZORPAY_PLAN_ENTERPRISE_MONTHLY_ID`
4. Set:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET`

## Product Policy Surface

1. Publish pricing with the trial duration, renewal amount, billing frequency, and cancellation timing stated clearly.
2. Keep the public legal set current:
   - Terms of Service
   - Privacy Policy
   - DPA
   - Billing, cancellation, and refund policy
3. Keep the SaaS subscription policy separate from the estate GST billing feature. They solve different problems.

## Tax And Records

1. Confirm whether FarmFlow must issue GST tax invoices for software subscriptions in the target sales model.
2. Make sure subscription billing records are stored separately from estate invoices created by customers.
3. Retain billing event logs, webhook IDs, mandate/subscription IDs, and policy versions for audit and dispute handling.

## Webhook Safety

1. Verify `x-razorpay-signature` against the **raw** request body.
2. Deduplicate webhook events using `x-razorpay-event-id`.
3. Persist webhook payloads before processing so failed events can be replayed safely.
4. If the webhook secret is rotated, keep the old secret available for older retries until the retry window passes.

## Customer Evidence And Support

1. Keep access activity logs for subscribed workspaces.
2. Keep policy versions that were visible at checkout time.
3. Keep a support contact and internal process for billing disputes, duplicate charges, and cancellation questions.
4. Retain proof that the service was provisioned and used after activation.

## Data Protection

1. Keep tenant isolation and access controls intact in the subscription layer too.
2. Do not leak tenant metadata into billing notes beyond what is operationally necessary.
3. Keep privacy notice, DPA, and subprocessors page aligned with the payment flow actually in use.

## References

- Razorpay supported subscription methods: https://razorpay.com/docs/payments/subscriptions/supported-payment-methods/
- Razorpay subscription webhooks: https://razorpay.com/docs/webhooks/subscriptions/
- CBIC GST invoice guidance: https://cbic-gst.gov.in/pdf/e-version-gst-fliers/tax-invoice-efliers.pdf
