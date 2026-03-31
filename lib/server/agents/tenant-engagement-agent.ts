import "server-only"

import { DEFAULT_ALERT_EMAIL_FROM, DEFAULT_SUPPORT_EMAIL } from "@/lib/email-addresses"
import { sql } from "@/lib/server/db"
import { fetchWithTimeout } from "@/lib/server/http"
import { logServerWarning } from "@/lib/server/safe-logging"

type TenantEngagementRow = {
  tenantId: string
  tenantName: string
  createdAt: Date
  daysSinceCreated: number
  totalLogins: number
  loginsLast7d: number
  lastLoginAt: Date | null
  daysSinceLastLogin: number | null
  operationalDataCount: number
  accountCodesCount: number
}

type TenantStatus = "new" | "active" | "stuck" | "quiet" | "empty"

type TenantEngagementSummary = TenantEngagementRow & {
  status: TenantStatus
  flags: string[]
}

const toRows = <T = any>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[]
  const candidate = (value as any)?.rows
  return Array.isArray(candidate) ? (candidate as T[]) : []
}

async function fetchTenantEngagementData(): Promise<TenantEngagementRow[]> {
  if (!sql) throw new Error("Database not configured")

  const result = await sql.query(`
    SELECT
      t.id                                                          AS tenant_id,
      t.name                                                        AS tenant_name,
      t.created_at,
      EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 86400           AS days_since_created,

      COUNT(DISTINCT CASE WHEN se.event_type = 'auth_login_success' THEN se.id END)
                                                                    AS total_logins,
      COUNT(DISTINCT CASE
        WHEN se.event_type = 'auth_login_success'
          AND se.created_at > NOW() - INTERVAL '7 days'
        THEN se.id END)                                             AS logins_last_7d,
      MAX(CASE WHEN se.event_type = 'auth_login_success' THEN se.created_at END)
                                                                    AS last_login_at,

      (
        SELECT COUNT(*)
        FROM (
          SELECT id FROM labor_transactions      WHERE tenant_id = t.id
          UNION ALL
          SELECT id FROM transaction_history     WHERE tenant_id = t.id
          UNION ALL
          SELECT id FROM rainfall_records        WHERE tenant_id = t.id
          UNION ALL
          SELECT id FROM processing_records      WHERE tenant_id = t.id
          UNION ALL
          SELECT id FROM sales_records           WHERE tenant_id = t.id
          UNION ALL
          SELECT id FROM dispatch_records        WHERE tenant_id = t.id
          UNION ALL
          SELECT id FROM expense_transactions    WHERE tenant_id = t.id
        ) sub
      )                                                             AS operational_data_count,

      (SELECT COUNT(*) FROM account_activities WHERE tenant_id = t.id)
                                                                    AS account_codes_count

    FROM tenants t
    LEFT JOIN security_events se ON se.tenant_id = t.id
    WHERE t.parent_tenant_id IS NULL
    GROUP BY t.id, t.name, t.created_at
    ORDER BY t.created_at
  `)

  return toRows<any>(result).map((row: any) => {
    const lastLoginAt = row.last_login_at ? new Date(row.last_login_at) : null
    const daysSinceLastLogin = lastLoginAt
      ? Math.floor((Date.now() - lastLoginAt.getTime()) / 86_400_000)
      : null
    return {
      tenantId: String(row.tenant_id),
      tenantName: String(row.tenant_name || "Unknown"),
      createdAt: new Date(row.created_at),
      daysSinceCreated: Math.floor(Number(row.days_since_created) || 0),
      totalLogins: Number(row.total_logins) || 0,
      loginsLast7d: Number(row.logins_last_7d) || 0,
      lastLoginAt,
      daysSinceLastLogin,
      operationalDataCount: Number(row.operational_data_count) || 0,
      accountCodesCount: Number(row.account_codes_count) || 0,
    }
  })
}

function classifyTenant(row: TenantEngagementRow): TenantEngagementSummary {
  const flags: string[] = []
  let status: TenantStatus = "active"

  if (row.daysSinceCreated < 3) {
    status = "new"
  } else if (row.totalLogins === 0) {
    status = "empty"
    flags.push("Never logged in")
  } else if (row.totalLogins >= 3 && row.operationalDataCount === 0) {
    status = "stuck"
    flags.push(`${row.totalLogins} logins, zero data entered`)
  } else if (row.daysSinceLastLogin !== null && row.daysSinceLastLogin > 7 && row.totalLogins > 0) {
    status = "quiet"
    flags.push(`No login for ${row.daysSinceLastLogin} days`)
  }

  if (row.accountCodesCount === 0 && row.daysSinceCreated >= 3 && row.totalLogins >= 1) {
    flags.push("No account codes — labor & expense entry blocked")
  }

  return { ...row, status, flags }
}

function buildAlertHtml(summaries: TenantEngagementSummary[], generatedAt: string): string {
  const statusBadge = (status: TenantStatus) => {
    const styles: Record<TenantStatus, string> = {
      active:  "background:#dcfce7;color:#166534;",
      stuck:   "background:#fef9c3;color:#854d0e;",
      quiet:   "background:#fee2e2;color:#991b1b;",
      new:     "background:#dbeafe;color:#1e40af;",
      empty:   "background:#f3f4f6;color:#374151;",
    }
    return `<span style="border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;${styles[status]}">${status.toUpperCase()}</span>`
  }

  const rows = summaries.map((s) => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:10px 12px;font-size:14px;font-weight:500;color:#111827;">${s.tenantName}</td>
      <td style="padding:10px 12px;">${statusBadge(s.status)}</td>
      <td style="padding:10px 12px;font-size:13px;color:#374151;">${s.totalLogins} total / ${s.loginsLast7d} this week</td>
      <td style="padding:10px 12px;font-size:13px;color:#374151;">${s.operationalDataCount} records</td>
      <td style="padding:10px 12px;font-size:13px;color:#374151;">${s.lastLoginAt ? s.lastLoginAt.toLocaleDateString("en-IN") : "—"}</td>
      <td style="padding:10px 12px;font-size:12px;color:#6b7280;">${s.flags.length > 0 ? s.flags.join(" · ") : "—"}</td>
    </tr>
  `).join("")

  const attentionList = summaries
    .filter((s) => s.status === "stuck" || s.status === "quiet" || s.flags.length > 0)
    .map((s) => `<li style="margin:6px 0;font-size:14px;color:#374151;"><strong>${s.tenantName}</strong> — ${s.flags.join("; ") || s.status}</li>`)
    .join("")

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;">

        <tr><td style="background:#0f172a;border-radius:12px 12px 0 0;padding:24px 32px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#94a3b8;">Daily Report</p>
          <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#f9fafb;">Tenant Engagement</p>
          <p style="margin:4px 0 0;font-size:12px;color:#64748b;">${generatedAt}</p>
        </td></tr>

        ${attentionList ? `
        <tr><td style="background:#fefce8;border-left:4px solid #eab308;padding:16px 32px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#854d0e;">Needs attention</p>
          <ul style="margin:0;padding-left:20px;">${attentionList}</ul>
        </td></tr>
        ` : `
        <tr><td style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px 32px;">
          <p style="margin:0;font-size:14px;color:#166534;">All tenants look healthy today.</p>
        </td></tr>
        `}

        <tr><td style="background:#ffffff;padding:24px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Tenant</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Status</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Logins</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Data</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Last login</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Flags</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </td></tr>

        <tr><td style="background:#f3f4f6;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;padding:16px 32px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">FarmFlow platform report — sent daily at 07:00 UTC.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function runTenantEngagementAgent(input?: {
  triggerSource?: string
  dryRun?: boolean
}): Promise<{
  tenantsScanned: number
  stuck: number
  quiet: number
  empty: number
  needsAttention: number
  emailSent: boolean
  dryRun: boolean
}> {
  const dryRun = Boolean(input?.dryRun)
  const rows = await fetchTenantEngagementData()
  const summaries = rows.map(classifyTenant)

  const stuck = summaries.filter((s) => s.status === "stuck").length
  const quiet = summaries.filter((s) => s.status === "quiet").length
  const empty = summaries.filter((s) => s.status === "empty").length
  const needsAttention = summaries.filter((s) => s.flags.length > 0 || s.status === "stuck" || s.status === "quiet").length

  const generatedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "short" })
  const subject = needsAttention > 0
    ? `⚠️ FarmFlow: ${needsAttention} tenant${needsAttention === 1 ? "" : "s"} need attention`
    : `✅ FarmFlow: All tenants healthy — daily engagement report`

  const html = buildAlertHtml(summaries, generatedAt)
  const text = summaries.map((s) =>
    `${s.tenantName} [${s.status.toUpperCase()}] — ${s.totalLogins} logins, ${s.operationalDataCount} records${s.flags.length > 0 ? " — " + s.flags.join("; ") : ""}`
  ).join("\n")

  let emailSent = false
  if (!dryRun) {
    const resendKey = String(process.env.RESEND_API_KEY || "").trim()
    const from = String(process.env.ALERT_EMAIL_FROM || DEFAULT_ALERT_EMAIL_FROM).trim()
    const toRaw = String(process.env.ALERT_EMAIL_TO || process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL)
    const to = toRaw.split(/[;,]/).map((s) => s.trim()).filter(Boolean)

    if (resendKey && from && to.length > 0) {
      try {
        const response = await fetchWithTimeout("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ from, to, subject, text, html }),
          timeoutMs: 10_000,
        })
        emailSent = response.ok
        if (!response.ok) {
          const body = await response.text().catch(() => "")
          logServerWarning("Tenant engagement email failed", { status: response.status, body })
        }
      } catch (error) {
        logServerWarning("Tenant engagement email request failed", error)
      }
    }
  }

  return {
    tenantsScanned: summaries.length,
    stuck,
    quiet,
    empty,
    needsAttention,
    emailSent,
    dryRun,
  }
}
