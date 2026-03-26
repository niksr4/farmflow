import "server-only"

import { sql } from "@/lib/server/db"
import { buildTenantAiDataSummary } from "@/lib/server/ai-analysis"
import { getClaudeClient, isClaudeConfigured, extractClaudeText, CLAUDE_SONNET } from "@/lib/server/claude"
import { fetchWithTimeout } from "@/lib/server/http"
import { logServerWarning } from "@/lib/server/safe-logging"

type TenantDigestRow = {
  tenantId: string
  tenantName: string
  ownerEmail: string
  ownerName: string
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

  const result = await sql.query(`
    SELECT DISTINCT ON (t.id)
      t.id AS tenant_id,
      t.name AS tenant_name,
      u.email AS owner_email,
      COALESCE(u.username, u.email) AS owner_name
    FROM tenants t
    JOIN users u ON u.tenant_id = t.id
    WHERE u.email IS NOT NULL
      AND u.email != ''
      AND u.email_verified_at IS NOT NULL
      AND u.role IN ('owner', 'admin')
    ORDER BY t.id, CASE u.role WHEN 'owner' THEN 0 ELSE 1 END, u.created_at ASC
  `)

  return toRows<any>(result).map((row: any) => ({
    tenantId: String(row.tenant_id),
    tenantName: String(row.tenant_name || "Your Estate"),
    ownerEmail: String(row.owner_email),
    ownerName: String(row.owner_name || "Estate Manager"),
  }))
}

async function generateWeeklyDigestText(tenant: TenantDigestRow): Promise<string | null> {
  try {
    const { dataSummary, fiscalYearLabel } = await buildTenantAiDataSummary({
      tenantId: tenant.tenantId,
      role: "owner",
    })

    const client = getClaudeClient()
    const response = await client.messages.create({
      model: CLAUDE_SONNET,
      max_tokens: 1200,
      temperature: 0.3,
      system: `You are FarmFlow Weekly Digest, an expert agricultural analyst summarising estate operations for coffee and pepper farmers in India.

Rules:
- Ground every number strictly in the provided data. Never invent figures.
- When data is sparse or missing, say so plainly.
- Use INR (₹) for currency and KG for weight.
- Keep the tone warm, professional, and practical. Estate managers are busy.
- This is a weekly email digest — keep it concise (under 400 words).
- Format with clear sections using plain text (no markdown headers, no asterisks). Use numbered lists for recommendations.`,
      messages: [
        {
          role: "user",
          content: `Generate a weekly operations digest for ${tenant.tenantName} for the fiscal year ${fiscalYearLabel}.

${dataSummary}

Structure your digest as:
1. This Week at a Glance — 2-3 sentences on the most important metric or trend.
2. Processing & Harvest — key conversion rates, top/bottom performing locations.
3. Labor & Costs — notable labor cost trends or efficiency signals.
4. Inventory & Dispatch — stock levels, any items to restock, pending dispatches.
5. Three actions for this week — specific, named, and actionable.

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

async function sendDigestEmail(tenant: TenantDigestRow, digestText: string): Promise<boolean> {
  const resendKey = String(process.env.RESEND_API_KEY || "").trim()
  const from = String(process.env.DIGEST_EMAIL_FROM || process.env.ALERT_EMAIL_FROM || "").trim()

  if (!resendKey || !from) return false

  const subject = `Your FarmFlow Weekly Digest — ${tenant.tenantName}`
  const greeting = `Hi ${tenant.ownerName},\n\nHere is your weekly estate operations digest.\n\n`
  const text = greeting + digestText

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
        subject,
        text,
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
