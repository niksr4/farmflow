import "server-only"

import { DEFAULT_ALERT_EMAIL_FROM, DEFAULT_DIGEST_EMAIL_FROM, EMAIL_BCC_MONITORING } from "@/lib/email-addresses"
import { sql } from "@/lib/server/db"
import { buildTenantAiDataSummary } from "@/lib/server/ai-analysis"
import { getClaudeClient, isClaudeConfigured, extractClaudeText, CLAUDE_SONNET } from "@/lib/server/claude"
import { fetchWithTimeout } from "@/lib/server/http"
import { logServerWarning } from "@/lib/server/safe-logging"
import { getCropLabel, getCropVarietiesLabel, mergeTenantEstateProfile } from "@/lib/tenant-estate-profile"
import { buildEstateCalendarContext } from "@/lib/coffee-estate-calendar"
import { buildAgronomyContext } from "@/lib/coffee-agronomy"
import { upsertWeeklyMetrics, fetchHistoricalMetrics, buildHistoricalBaselineContext } from "@/lib/server/tenant-weekly-metrics"

type TenantDigestRow = {
  tenantId: string
  tenantName: string
  ownerEmail: string
  ownerName: string
  cropFamily: string | null
  primaryVarieties: string[]
}

type DigestResult = {
  tenantId: string
  tenantName: string
  ownerEmail: string
  status: "sent" | "skipped" | "failed"
  reason?: string
}

const toRows = <T = any>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[]
  const candidate = (value as any)?.rows
  return Array.isArray(candidate) ? (candidate as T[]) : []
}

async function fetchTenantOwnersWithVerifiedEmail(): Promise<TenantDigestRow[]> {
  if (!sql) throw new Error("Database not configured")

  // Prefer the explicit digest_email the user set in Settings.
  // Fall back to users.email only when it has been verified (self-serve signups).
  // Username-only tenants (no email, no digest_email) are skipped — they won't
  // receive a digest until they add an address in Settings.
  const result = await sql.query(`
    SELECT DISTINCT ON (t.id)
      t.id AS tenant_id,
      t.name AS tenant_name,
      t.ui_preferences,
      COALESCE(
        NULLIF(BTRIM(u.digest_email), ''),
        CASE WHEN u.email_verified_at IS NOT NULL THEN NULLIF(BTRIM(u.email), '') END
      ) AS owner_email,
      COALESCE(u.username, u.email) AS owner_name
    FROM tenants t
    JOIN users u ON u.tenant_id = t.id
    WHERE COALESCE(
        NULLIF(BTRIM(u.digest_email), ''),
        CASE WHEN u.email_verified_at IS NOT NULL THEN NULLIF(BTRIM(u.email), '') END
      ) IS NOT NULL
      AND u.role IN ('owner', 'admin')
    ORDER BY t.id, CASE u.role WHEN 'owner' THEN 0 ELSE 1 END, u.created_at ASC
  `)

  return toRows<any>(result).map((row: any) => {
    const prefs = row.ui_preferences && typeof row.ui_preferences === "object" ? row.ui_preferences : {}
    const profile = mergeTenantEstateProfile(prefs.estateProfile ?? null)
    return {
      tenantId: String(row.tenant_id),
      tenantName: String(row.tenant_name || "Your Estate"),
      ownerEmail: String(row.owner_email),
      ownerName: String(row.owner_name || "Estate Manager"),
      cropFamily: profile.cropFamily,
      primaryVarieties: profile.primaryVarieties,
    }
  })
}

type LastWeekActivity = {
  weekLabel: string   // e.g. "31 Mar – 6 Apr 2026"
  weekStart: string   // YYYY-MM-DD (ISO Monday)
  processingKg: number
  processingDays: number
  laborEntries: number
  laborCost: number
  laborWorkers: number
  expenseTotal: number
  expenseEntries: number
  salesRevenue: number
  dispatchBags: number
  rainfallInches: number
  pickingEntries: number
}

async function fetchLastWeekActivity(tenantId: string): Promise<LastWeekActivity> {
  // Last week = Mon 00:00 IST to Sun 23:59 IST
  // Cron runs Monday 02:00 UTC (07:30 IST), so "last week" is the 7 days just ended
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const lastMonday = new Date(now)
  lastMonday.setDate(now.getDate() - daysToLastMonday - 7)
  lastMonday.setHours(0, 0, 0, 0)
  const lastSunday = new Date(lastMonday)
  lastSunday.setDate(lastMonday.getDate() + 6)
  lastSunday.setHours(23, 59, 59, 999)

  const fmt = (d: Date) => d.toISOString().split("T")[0]
  const startDate = fmt(lastMonday)
  const endDate = fmt(lastSunday)

  const weekLabel = `${lastMonday.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${lastSunday.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`

  const empty: LastWeekActivity = { weekLabel, weekStart: startDate, processingKg: 0, processingDays: 0, laborEntries: 0, laborCost: 0, laborWorkers: 0, expenseTotal: 0, expenseEntries: 0, salesRevenue: 0, dispatchBags: 0, rainfallInches: 0, pickingEntries: 0 }
  if (!sql) return empty

  try {
    const result = await sql.query(`
      SELECT
        (SELECT COALESCE(SUM(crop_today), 0) FROM processing_records
          WHERE tenant_id = $1 AND process_date BETWEEN $2 AND $3)  AS proc_kg,
        (SELECT COUNT(*) FROM processing_records
          WHERE tenant_id = $1 AND process_date BETWEEN $2 AND $3)  AS proc_days,
        (SELECT COUNT(*) FROM labor_transactions
          WHERE tenant_id = $1 AND deployment_date BETWEEN $2 AND $3) AS labor_entries,
        (SELECT COALESCE(SUM(total_cost), 0) FROM labor_transactions
          WHERE tenant_id = $1 AND deployment_date BETWEEN $2 AND $3) AS labor_cost,
        (SELECT COALESCE(SUM(hf_laborers + outside_laborers), 0) FROM labor_transactions
          WHERE tenant_id = $1 AND deployment_date BETWEEN $2 AND $3) AS labor_workers,
        (SELECT COALESCE(SUM(total_amount), 0) FROM expense_transactions
          WHERE tenant_id = $1 AND entry_date BETWEEN $2 AND $3)    AS expense_total,
        (SELECT COUNT(*) FROM expense_transactions
          WHERE tenant_id = $1 AND entry_date BETWEEN $2 AND $3)    AS expense_entries,
        (SELECT COALESCE(SUM(revenue), 0) FROM sales_records
          WHERE tenant_id = $1 AND sale_date BETWEEN $2 AND $3)     AS sales_revenue,
        (SELECT COALESCE(SUM(bags_dispatched), 0) FROM dispatch_records
          WHERE tenant_id = $1 AND dispatch_date BETWEEN $2 AND $3) AS dispatch_bags,
        (SELECT COALESCE(SUM(inches + cents::numeric / 100), 0) FROM rainfall_records
          WHERE tenant_id = $1 AND record_date BETWEEN $2 AND $3)   AS rainfall_inches,
        (SELECT COUNT(*) FROM picking_records
          WHERE tenant_id = $1 AND picking_date BETWEEN $2 AND $3)  AS picking_entries
    `, [tenantId, startDate, endDate])

    const row = (Array.isArray(result) ? result[0] : (result as any)?.rows?.[0]) ?? {}
    return {
      weekLabel,
      weekStart: startDate,
      processingKg: Number(row.proc_kg) || 0,
      processingDays: Number(row.proc_days) || 0,
      laborEntries: Number(row.labor_entries) || 0,
      laborCost: Number(row.labor_cost) || 0,
      laborWorkers: Number(row.labor_workers) || 0,
      expenseTotal: Number(row.expense_total) || 0,
      expenseEntries: Number(row.expense_entries) || 0,
      salesRevenue: Number(row.sales_revenue) || 0,
      dispatchBags: Number(row.dispatch_bags) || 0,
      rainfallInches: Number(row.rainfall_inches) || 0,
      pickingEntries: Number(row.picking_entries) || 0,
    }
  } catch {
    return empty
  }
}

function buildLastWeekSection(w: LastWeekActivity): string {
  const lines: string[] = [`## Last Week (${w.weekLabel})`]
  if (w.processingKg > 0) lines.push(`- Cherry processed: ${w.processingKg.toFixed(1)} kg over ${w.processingDays} day(s)`)
  if (w.pickingEntries > 0) lines.push(`- Picking entries recorded: ${w.pickingEntries}`)
  if (w.laborEntries > 0) lines.push(`- Labor deployments: ${w.laborEntries} entries, ${w.laborWorkers} worker-days, ₹${w.laborCost.toLocaleString("en-IN")} cost`)
  if (w.expenseEntries > 0) lines.push(`- Other expenses: ₹${w.expenseTotal.toLocaleString("en-IN")} across ${w.expenseEntries} entries`)
  if (w.salesRevenue > 0) lines.push(`- Sales revenue: ₹${w.salesRevenue.toLocaleString("en-IN")}`)
  if (w.dispatchBags > 0) lines.push(`- Bags dispatched: ${w.dispatchBags.toFixed(1)}`)
  if (w.rainfallInches > 0) lines.push(`- Rainfall recorded: ${w.rainfallInches.toFixed(2)} inches`)
  if (lines.length === 1) lines.push("- No activity recorded last week.")
  return lines.join("\n")
}

async function generateWeeklyDigestText(tenant: TenantDigestRow): Promise<string | null> {
  try {
    const [{ dataSummary, fiscalYearLabel }, lastWeek] = await Promise.all([
      buildTenantAiDataSummary({ tenantId: tenant.tenantId, role: "owner" }),
      fetchLastWeekActivity(tenant.tenantId),
    ])

    // Persist this week's metrics, then load historical baselines in parallel
    await upsertWeeklyMetrics({
      tenantId: tenant.tenantId,
      weekStart: lastWeek.weekStart,
      cherryKg: lastWeek.processingKg,
      processingDays: lastWeek.processingDays,
      parchmentBags: lastWeek.dispatchBags,
      laborEntries: lastWeek.laborEntries,
      laborWorkerDays: lastWeek.laborWorkers,
      laborCost: lastWeek.laborCost,
      expenseTotal: lastWeek.expenseTotal,
      expenseEntries: lastWeek.expenseEntries,
      rainfallInches: lastWeek.rainfallInches,
      dispatchBags: lastWeek.dispatchBags,
      salesRevenue: lastWeek.salesRevenue,
      pickingEntries: lastWeek.pickingEntries,
    })
    const history = await fetchHistoricalMetrics(tenant.tenantId, 12)

    const cropLabel = getCropLabel({ cropFamily: tenant.cropFamily, primaryVarieties: tenant.primaryVarieties, acreageAcres: null, weatherLocationLabel: "", weatherLatitude: null, weatherLongitude: null })
    const varietiesLabel = getCropVarietiesLabel({ cropFamily: tenant.cropFamily, primaryVarieties: tenant.primaryVarieties, acreageAcres: null, weatherLocationLabel: "", weatherLatitude: null, weatherLongitude: null })
    const cropContext = varietiesLabel ? `${cropLabel} (${varietiesLabel})` : cropLabel
    const lastWeekSection = buildLastWeekSection(lastWeek)
    const historySection = buildHistoricalBaselineContext(history, {
      cherryKg: lastWeek.processingKg,
      processingDays: lastWeek.processingDays,
      parchmentBags: lastWeek.dispatchBags,
      laborEntries: lastWeek.laborEntries,
      laborWorkerDays: lastWeek.laborWorkers,
      laborCost: lastWeek.laborCost,
      expenseTotal: lastWeek.expenseTotal,
      expenseEntries: lastWeek.expenseEntries,
      rainfallInches: lastWeek.rainfallInches,
      dispatchBags: lastWeek.dispatchBags,
      salesRevenue: lastWeek.salesRevenue,
      pickingEntries: lastWeek.pickingEntries,
    })
    const calendarContext = buildEstateCalendarContext()
    const agronomyContext = buildAgronomyContext()

    const client = getClaudeClient()
    const response = await client.messages.create({
      model: CLAUDE_SONNET,
      max_tokens: 1400,
      temperature: 0.3,
      system: `You are FarmFlow Weekly Digest, an expert agronomist and estate operations analyst for ${cropContext} estates in Karnataka/Kerala, India. You have deep knowledge of South Indian coffee cultivation and can give recommendations that a seasoned Coorg estate manager would respect.

${calendarContext}

${agronomyContext}

Rules:
- Use the season context above to interpret the data correctly. Low activity in the off-season is not a problem. Missing expected activities (e.g. no fertiliser in April) should be flagged.
- Ground every number strictly in the provided data. Never invent figures.
- When data is sparse or missing, say so plainly — but explain whether that is normal for this time of year.
- Use the correct crop terminology: refer to the primary crop as "${cropLabel}", and use variety names where relevant.
- Use INR (₹) for currency and KG for weight unless the data suggests otherwise.
- Keep the tone warm, professional, and practical. Estate managers are busy.
- This is a weekly email digest — keep it concise (under 450 words).
- Format with clear sections using plain text (no markdown headers, no asterisks). Use numbered lists for recommendations.`,
      messages: [
        {
          role: "user",
          content: `Generate a weekly operations digest for ${tenant.tenantName}.

${lastWeekSection}

${historySection}

## Season-to-Date Context (FY ${fiscalYearLabel})
${dataSummary}

Structure your digest as:
1. Last Week at a Glance — 2-3 sentences summarising what actually happened last week using the exact figures above.
2. Season Context — how last week fits into the broader FY picture (processing rate, labor spend, costs vs benchmarks).
3. Three recommendations for this week — draw on your agronomic knowledge. Be specific: name the activity, the timing, the quantity or threshold where relevant (e.g. "Apply second K dose — 60 kg MOP/ha — before the blossom shower if not done yet"; "CBB trap counts should be checked this week; if >5 borer/trap/day, spray Beauveria bassiana"). If data shows a gap vs benchmark (e.g. picker productivity below 40 kg/day, cherry:parchment ratio above 6:1), call it out directly.

End with: "Powered by FarmFlow — your estate, always in view."`,
        },
      ],
    })

    return extractClaudeText(response).trim() || null
  } catch (error) {
    logServerWarning(`Weekly digest generation failed for tenant ${tenant.tenantId}`, error)
    return null
  }
}

function buildDigestHtml(ownerName: string, tenantName: string, digestText: string): string {
  // Convert plain-text numbered sections to simple HTML paragraphs
  const lines = digestText.split("\n").filter((l) => l.trim().length > 0)
  const bodyHtml = lines
    .map((line) => {
      const trimmed = line.trim()
      // Numbered section header e.g. "1. This Week at a Glance"
      if (/^\d+\.\s+[A-Z]/.test(trimmed)) {
        return `<p style="margin:20px 0 4px;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;">${trimmed}</p>`
      }
      // Bullet point
      if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
        return `<p style="margin:4px 0 4px 16px;font-size:14px;color:#374151;">· ${trimmed.slice(2)}</p>`
      }
      // Powered-by footer line
      if (trimmed.startsWith("Powered by")) {
        return `<p style="margin-top:24px;font-size:12px;color:#9ca3af;">${trimmed}</p>`
      }
      return `<p style="margin:6px 0;font-size:14px;line-height:1.6;color:#374151;">${trimmed}</p>`
    })
    .join("\n")

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Header -->
        <tr><td style="background:#052e16;border-radius:12px 12px 0 0;padding:24px 32px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#6ee7b7;">Weekly Digest</p>
          <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#f9fafb;">${tenantName}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:28px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">Hi ${ownerName}, here is your weekly estate operations digest.</p>
          ${bodyHtml}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f3f4f6;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;padding:16px 32px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">You're receiving this because you're the estate owner on FarmFlow. Reply to unsubscribe.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function sendDigestEmail(tenant: TenantDigestRow, digestText: string): Promise<boolean> {
  const resendKey = String(process.env.RESEND_API_KEY || "").trim()
  const from = String(process.env.DIGEST_EMAIL_FROM || process.env.ALERT_EMAIL_FROM || DEFAULT_DIGEST_EMAIL_FROM || DEFAULT_ALERT_EMAIL_FROM).trim()

  if (!resendKey || !from) return false

  const subject = `Your FarmFlow Weekly Digest — ${tenant.tenantName}`
  const greeting = `Hi ${tenant.ownerName},\n\nHere is your weekly estate operations digest.\n\n`
  const text = greeting + digestText
  const html = buildDigestHtml(tenant.ownerName, tenant.tenantName, digestText)

  try {
    const response = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [tenant.ownerEmail],
        bcc: tenant.ownerEmail === EMAIL_BCC_MONITORING ? undefined : [EMAIL_BCC_MONITORING],
        subject,
        text,
        html,
      }),
      timeoutMs: 10_000,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      logServerWarning(`Weekly digest email failed for ${tenant.ownerEmail}`, { status: response.status, body })
      return false
    }

    return true
  } catch (error) {
    logServerWarning(`Weekly digest email request failed for ${tenant.ownerEmail}`, error)
    return false
  }
}

export async function runWeeklyDigestAgent(input?: {
  triggerSource?: string
  dryRun?: boolean
  tenantId?: string
}): Promise<{
  tenantsProcessed: number
  sent: number
  skipped: number
  failed: number
  results: DigestResult[]
  dryRun: boolean
}> {
  const dryRun = Boolean(input?.dryRun)

  if (!isClaudeConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not configured — weekly digest requires Claude")
  }

  const allTenants = await fetchTenantOwnersWithVerifiedEmail()
  const tenants = input?.tenantId
    ? allTenants.filter((t) => t.tenantId === input.tenantId)
    : allTenants

  const results: DigestResult[] = []

  for (const tenant of tenants) {
    const digestText = await generateWeeklyDigestText(tenant)

    if (!digestText) {
      results.push({
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        ownerEmail: tenant.ownerEmail,
        status: "failed",
        reason: "AI digest generation returned empty",
      })
      continue
    }

    if (dryRun) {
      results.push({
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        ownerEmail: tenant.ownerEmail,
        status: "skipped",
        reason: "dry-run",
      })
      continue
    }

    const sent = await sendDigestEmail(tenant, digestText)
    results.push({
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      ownerEmail: tenant.ownerEmail,
      status: sent ? "sent" : "failed",
      reason: sent ? undefined : "Resend delivery failed",
    })
  }

  return {
    tenantsProcessed: tenants.length,
    sent: results.filter((r) => r.status === "sent").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
    dryRun,
  }
}
