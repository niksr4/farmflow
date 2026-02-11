# DPDP Data Map

This inventory lists personal-data fields currently stored in FarmFlow, the purpose for each field, retention, and storage location.

Storage location (current): Neon Postgres, AWS `ap-southeast-1` (Singapore) based on the active connection strings.

## Account & Access

| Field | Purpose | Retention | Storage |
| --- | --- | --- | --- |
| `users.username` | Login identifier and audit attribution. | Active account lifetime, then anonymized after deletion request + grace period. | Neon Postgres (ap-southeast-1). |
| `users.password_hash` | Credential verification. | Active account lifetime, then replaced during anonymization. | Neon Postgres (ap-southeast-1). |
| `users.role` | Access control. | Active account lifetime, then anonymized on deletion. | Neon Postgres (ap-southeast-1). |
| `users.tenant_id` | Tenant isolation and access scope. | Active account lifetime, then anonymized on deletion. | Neon Postgres (ap-southeast-1). |
| `users.created_at` | Account lifecycle tracking. | Active account lifetime, then anonymized on deletion. | Neon Postgres (ap-southeast-1). |
| `users.privacy_notice_version` | Record of notice version acknowledged. | Active account lifetime or until updated. | Neon Postgres (ap-southeast-1). |
| `users.privacy_notice_accepted_at` | Proof of notice acknowledgement. | Active account lifetime or until updated. | Neon Postgres (ap-southeast-1). |
| `users.consent_marketing` | Optional consent flag for product updates. | Until withdrawn or account deletion. | Neon Postgres (ap-southeast-1). |
| `users.consent_marketing_updated_at` | Consent audit timestamp. | Until consent withdrawn or account deletion. | Neon Postgres (ap-southeast-1). |
| `users.deletion_requested_at` | Tracks deletion/anonymization request. | Until anonymization completed. | Neon Postgres (ap-southeast-1). |
| `users.anonymized_at` | Confirms anonymization completion. | Retained for compliance history. | Neon Postgres (ap-southeast-1). |

## Audit & Security

| Field | Purpose | Retention | Storage |
| --- | --- | --- | --- |
| `audit_logs.user_id` | Link audit entries to a user. | Deleted after `PRIVACY_RETENTION_AUDIT_DAYS` (default 730). | Neon Postgres (ap-southeast-1). |
| `audit_logs.username` | Human-readable audit attribution. | Deleted after `PRIVACY_RETENTION_AUDIT_DAYS` (default 730). | Neon Postgres (ap-southeast-1). |
| `audit_logs.role` | Access context for audit events. | Deleted after `PRIVACY_RETENTION_AUDIT_DAYS` (default 730). | Neon Postgres (ap-southeast-1). |
| `audit_logs.before_data` | Change history (may include personal data). | Deleted after `PRIVACY_RETENTION_AUDIT_DAYS` (default 730). | Neon Postgres (ap-southeast-1). |
| `audit_logs.after_data` | Change history (may include personal data). | Deleted after `PRIVACY_RETENTION_AUDIT_DAYS` (default 730). | Neon Postgres (ap-southeast-1). |
| `security_events.actor_username` | Centralized security audit trail for auth + permissions. | Deleted after `SECURITY_EVENT_RETENTION_DAYS` (default 365, min 180). | Neon Postgres (ap-southeast-1). |
| `security_events.actor_role` | Security event context. | Deleted after `SECURITY_EVENT_RETENTION_DAYS` (default 365, min 180). | Neon Postgres (ap-southeast-1). |
| `security_events.ip_address` | Security event attribution. | Deleted after `SECURITY_EVENT_RETENTION_DAYS` (default 365, min 180). | Neon Postgres (ap-southeast-1). |
| `security_events.user_agent` | Security event attribution. | Deleted after `SECURITY_EVENT_RETENTION_DAYS` (default 365, min 180). | Neon Postgres (ap-southeast-1). |
| `security_events.metadata` | Event details (no secrets). | Deleted after `SECURITY_EVENT_RETENTION_DAYS` (default 365, min 180). | Neon Postgres (ap-southeast-1). |

## Operational Records (User Attribution)

| Field | Purpose | Retention | Storage |
| --- | --- | --- | --- |
| `transaction_history.user_id` | Identifies who created inventory transactions. | Retained with operational records; anonymized after deletion request + grace period. | Neon Postgres (ap-southeast-1). |
| `rainfall_records.user_id` | Identifies who logged rainfall data. | Retained with operational records; anonymized after deletion request + grace period. | Neon Postgres (ap-southeast-1). |
| `dispatch_records.created_by` | Identifies who created dispatch records. | Retained with operational records; anonymized after deletion request + grace period. | Neon Postgres (ap-southeast-1). |
| `curing_records.recorded_by` | Identifies who recorded curing records. | Retained with operational records; anonymized after deletion request + grace period. | Neon Postgres (ap-southeast-1). |
| `quality_grading_records.graded_by` | Identifies who graded quality. | Retained with operational records; anonymized after deletion request + grace period. | Neon Postgres (ap-southeast-1). |
| `pepper_records.recorded_by` | Identifies who recorded pepper records. | Retained with operational records; anonymized after deletion request + grace period. | Neon Postgres (ap-southeast-1). |

## Buyer & External Contacts (Optional)

| Field | Purpose | Retention | Storage |
| --- | --- | --- | --- |
| `dispatch_records.buyer_name` | Buyer reference for dispatch reconciliation. | Retained with dispatch records; removed/anonymized if requested. | Neon Postgres (ap-southeast-1). |
| `sales_records.buyer_name` | Buyer reference for sales records. | Retained with sales records; removed/anonymized if requested. | Neon Postgres (ap-southeast-1). |
| `sales_records.bank_account` | Settlement reference for sales. | Retained with sales records; removed/anonymized if requested. | Neon Postgres (ap-southeast-1). |
| `billing_invoices.bill_to_name` | Customer identity for GST invoices. | Retained with invoices; removed/anonymized if requested. | Neon Postgres (ap-southeast-1). |
| `billing_invoices.bill_to_gstin` | GST tax identifier for invoice compliance. | Retained with invoices; removed/anonymized if requested. | Neon Postgres (ap-southeast-1). |
| `billing_invoices.bill_to_address` | Invoice delivery address. | Retained with invoices; removed/anonymized if requested. | Neon Postgres (ap-southeast-1). |

## Privacy Requests

| Field | Purpose | Retention | Storage |
| --- | --- | --- | --- |
| `privacy_requests.user_id` | Link request to user. | Deleted after `PRIVACY_RETENTION_REQUEST_DAYS` (default 365). | Neon Postgres (ap-southeast-1). |
| `privacy_requests.username` | Human-readable request reference. | Deleted after `PRIVACY_RETENTION_REQUEST_DAYS` (default 365). | Neon Postgres (ap-southeast-1). |
| `privacy_requests.request_details` | Records request context. | Deleted after `PRIVACY_RETENTION_REQUEST_DAYS` (default 365). | Neon Postgres (ap-southeast-1). |

## Notes Fields

Free-text `notes` fields across processing, dispatch, sales, and expenses can contain personal data if users enter it. These fields inherit the same retention policy as the parent record.
