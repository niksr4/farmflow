export const PRIVACY_NOTICE_VERSION = "2026-02-09"

const parseDays = (value: string | undefined, fallback: number, min = 0) => {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.max(parsed, min)
}

export const PRIVACY_RETENTION = {
  auditLogsDays: parseDays(process.env.PRIVACY_RETENTION_AUDIT_DAYS, 730, 180),
  privacyRequestsDays: parseDays(process.env.PRIVACY_RETENTION_REQUEST_DAYS, 365, 180),
  deletionGraceDays: parseDays(process.env.PRIVACY_DELETION_GRACE_DAYS, 30, 7),
  securityEventsDays: parseDays(process.env.SECURITY_EVENT_RETENTION_DAYS, 365, 180),
}

export const PRIVACY_CONTACT_EMAIL = process.env.PRIVACY_CONTACT_EMAIL || "privacy@farmflow.app"
