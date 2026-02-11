# DPDP Breach Runbook

## Purpose
This runbook guides incident response for any suspected or confirmed personal data breach involving FarmFlow.

## Scope
Applies to incidents affecting tenant users, audit logs, operational records, or personal identifiers in Neon Postgres.

## Response Timeline
1. Detect and triage.
2. Contain and preserve evidence.
3. Assess scope and impacted users.
4. Notify regulator and affected individuals as required.
5. Remediate and document.

Target: Initial regulator/user notification within 6 hours of confirmation for Severity 1 incidents.

## Severity Classification
| Severity | Definition | Example | SLA |
| --- | --- | --- | --- |
| Sev 1 | Confirmed breach of personal data, ongoing exposure, or privileged access compromise. | Leaked credentials or exposed DB snapshot. | Notify within 6 hours. |
| Sev 2 | Suspected breach with limited scope or containment already in place. | Single tenant token exposure. | Notify within 24 hours once confirmed. |
| Sev 3 | No confirmed exposure, but security weakness identified. | Misconfiguration with no data access. | Monitor, fix, document. |

## On-Call Workflow
1. Page on-call immediately for Sev 1 or Sev 2.
2. Incident commander assigns roles (comms, forensics, remediation).
3. Start an incident doc and timeline log.
4. Every 60 minutes, update status and impact assessment.

## Triage Checklist
1. Confirm the incident: what happened, when, and how it was detected.
2. Identify impacted systems: API routes, database tables, or storage buckets.
3. Stop ongoing access: rotate credentials, revoke sessions, and patch vulnerabilities.
4. Preserve evidence: collect logs, snapshots, and timelines.
5. Validate system time sync (NTP) and confirm all timestamps are UTC.

## Identify Impacted Users (Fast Path)
Use the audit log to identify users and actions in the affected window.

Example SQL:
```
SELECT DISTINCT username
FROM audit_logs
WHERE tenant_id = '<TENANT_ID>'
  AND created_at BETWEEN '<START_TS>' AND '<END_TS>'
ORDER BY username;
```

If you need to automate, use:
```
GET /api/privacy/impact?start=2026-02-01T00:00:00Z&end=2026-02-02T00:00:00Z
```

## Communications Templates

### Regulator Notification (Draft)
Subject: Personal Data Breach Notification - FarmFlow

Summary:
- Incident summary and date/time of discovery.
- Systems affected and data categories.
- Number of affected data principals.
- Immediate containment actions.
- Contact point for follow-up.
 - Planned remediation timeline.

### User Notification (Draft)
Subject: Important: Security Incident Affecting Your FarmFlow Account

Hello,
We detected a security incident that may have exposed some personal data in FarmFlow.
We have contained the issue, are investigating, and will keep you informed.
If you need help, contact us at privacy@farmflow.app.

## Post-Incident Review
1. Root cause analysis and corrective actions.
2. Update security controls and monitoring.
3. Document lessons learned and update this runbook.
